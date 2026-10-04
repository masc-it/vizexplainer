import { describe, expect, it } from "vitest";
import { buildFixture, minimal } from "./helpers.ts";

const badge = `
export default ({ z, html, defineComponent }) => defineComponent({
  name: "badge-row",
  description: "Badges",
  props: z.object({ items: z.array(z.string()) }).strict(),
  outline: () => "Badges",
  render: (props, ctx) => html\`<div class="row">\${props.items.map((id) => html\`<span \${ctx.entityAttrs(id)}>\${ctx.entity(id)?.label}</span>\`)}\${ctx.ref("a", "see A")}</div>\`,
  css: ".row { display: flex }",
  script: "window.badgeLoaded = true;",
});
`;

describe("custom components", () => {
  it("loads a module, validates its props and includes its css and script", async () => {
    const result = await buildFixture(
      minimal([{ type: "badge-row", items: ["a", "missing"] }, { type: "badge-row", items: 3 }], {
        components: ["./badge.mjs"],
        entities: { a: { label: "Alpha" } },
      }),
      { "badge.mjs": badge },
    );
    expect(result.errors).toEqual([
      'blocks[0]: unknown entity "missing"',
      "blocks[1].items: Invalid input: expected array, received number",
    ]);
    expect(result.html).toContain('<span data-entity="a">Alpha</span>');
    expect(result.html).toMatch(/<span class="vx-ref vx-hue-\d" data-entity="a" tabindex="0" role="button">see A<\/span>/);
    expect(result.html).toContain(".row { display: flex }");
    expect(result.html).toContain("window.badgeLoaded = true;");
    expect(result.html).toContain('href="#badges"');
  });

  it("reports modules that do not export a valid component", async () => {
    const result = await buildFixture(minimal([{ type: "prose", text: "x" }], { components: ["./bad.mjs", "./nope.mjs"] }), {
      "bad.mjs": "export default { name: 'Bad Name', render: 1 };",
    });
    expect(result.messages[0]).toMatch(/^components\[0\]: "\.\/bad\.mjs" does not export a valid component: name: component names are lowercase kebab-case/);
    expect(result.messages[1]).toMatch(/^components\[1\]: cannot load "\.\/nope\.mjs"/);
  });

  it("refuses to shadow a built-in component", async () => {
    const result = await buildFixture(minimal([{ type: "prose", text: "x" }], { components: ["./graph.mjs"] }), {
      "graph.mjs": badge.replace('"badge-row"', '"graph"'),
    });
    expect(result.errors).toEqual(['components[0]: component name "graph" is already taken']);
  });

  it("turns a render error into an issue instead of crashing", async () => {
    const result = await buildFixture(minimal([{ type: "boom" }], { components: ["./boom.mjs"] }), {
      "boom.mjs": `export default ({ z }) => ({ name: "boom", description: "x", props: z.object({}), render() { throw new Error("kaput"); } });`,
    });
    expect(result.errors).toEqual(['blocks[0]: component "boom" failed to render: kaput']);
  });
});
