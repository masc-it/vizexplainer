import { describe, expect, it } from "vitest";
import { buildFixture, minimal } from "./helpers.ts";

const entities = {
  api: { label: "API", kind: "service" },
  db: { label: "Database", kind: "store" },
};

describe("document validation", () => {
  it("accepts a valid document without issues", async () => {
    const result = await buildFixture(minimal([{ type: "prose", text: "The [[api]] talks to [[db|the database]]." }], { entities }));
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('data-entity="db"');
  });

  it("reports invalid JSON and schema errors at the top level", async () => {
    const result = await buildFixture({ title: "x", blocks: [], tittle: "typo" });
    expect(result.html).toBeUndefined();
    expect(result.messages.join("\n")).toMatch(/tittle/);
    expect(result.messages.join("\n")).toMatch(/blocks/);
  });

  it("locates unknown entity references and suggests close ids", async () => {
    const result = await buildFixture(
      minimal([{ type: "section", title: "S", children: [{ type: "prose", text: "See [[apii]]." }] }], { entities }),
    );
    expect(result.errors).toEqual(['blocks[0].children[0]: unknown entity "apii" (did you mean "api"?)']);
  });

  it("suggests the right component for a typo, including transpositions", async () => {
    const result = await buildFixture(minimal([{ type: "grpah" }]));
    expect(result.errors).toEqual(['blocks[0].type: unknown component "grpah" (did you mean "graph"?)']);
  });

  it("rejects unknown props on built-in components", async () => {
    const result = await buildFixture(minimal([{ type: "callout", text: "Hi", colour: "red" }]));
    expect(result.errors).toEqual(['blocks[0]: Unrecognized key: "colour"']);
  });

  it("checks relation endpoints and parent links", async () => {
    const result = await buildFixture(
      minimal([{ type: "prose", text: "x" }], {
        entities: { a: { parent: "b" }, b: { parent: "a" }, c: { parent: "nope" } },
        relations: [{ from: "a", to: "zzz" }],
      }),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'entities.a.parent: parent chain of "a" forms a cycle',
        'entities.c.parent: unknown entity "nope"',
        'relations[0].to: unknown entity "zzz"',
      ]),
    );
  });

  it("reports missing files and out-of-range lines in code sources", async () => {
    const result = await buildFixture(
      minimal([
        { type: "code", source: { file: "missing.ts" } },
        { type: "code", source: { file: "small.ts", lines: [1, 10] } },
        { type: "code", source: { file: "small.ts" }, annotations: [{ lines: 5, note: "nope" }] },
      ]),
      { "small.ts": "const a = 1;\nconst b = 2;\n" },
    );
    expect(result.messages[0]).toMatch(/^blocks\[0\]: cannot read file "missing.ts"/);
    expect(result.messages[1]).toBe('blocks[1]: lines 1-10 exceed "small.ts", which has 2 lines');
    expect(result.messages[2]).toBe("blocks[2]: annotations[0] lines 5-5 are outside the shown lines 1-2");
  });

  it("reports step lines that the pinned visual does not show", async () => {
    const result = await buildFixture(
      minimal([
        {
          type: "steps",
          visual: { type: "code", source: { file: "a.ts", lines: [2, 4] } },
          steps: [{ title: "ok", lines: [2, 3] }, { title: "bad", lines: [1, 3] }],
        },
        { type: "steps", visual: { type: "prose", text: "x" }, steps: [{ title: "no code", lines: 1 }] },
      ]),
      { "a.ts": "1\n2\n3\n4\n5\n" },
    );
    expect(result.errors).toEqual([
      "blocks[0]: steps[1].lines 1-3 are outside the visual's lines 2-4",
      "blocks[1]: steps[0].lines: the visual shows no code to spotlight",
    ]);
  });

  it("reports duplicate block ids", async () => {
    const result = await buildFixture(minimal([{ type: "prose", id: "x", text: "a" }, { type: "prose", id: "x", text: "b" }]));
    expect(result.errors).toEqual(['blocks[1].id: duplicate block id "x"']);
  });

  it("validates nested blocks inside tabs and steps with full paths", async () => {
    const result = await buildFixture(
      minimal([
        { type: "tabs", tabs: [{ label: "A", children: [{ type: "prose" }] }, { label: "B", children: [] }] },
        { type: "steps", visual: { type: "nope" }, steps: [{ title: "One", focus: ["ghost"] }] },
      ]),
    );
    expect(result.errors).toEqual([
      "blocks[0].tabs[0].children[0].text: Invalid input: expected string, received undefined",
      'blocks[1]: unknown entity "ghost"',
      'blocks[1].visual.type: unknown component "nope"',
    ]);
  });
});
