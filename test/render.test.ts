import { describe, expect, it } from "vitest";
import { escapeHtml, html, raw } from "../src/index.ts";
import { buildFixture, minimal } from "./helpers.ts";

describe("html helper", () => {
  it("escapes interpolations but keeps nested templates and raw markup", () => {
    const inner = html`<b>${"<i>"}</b>`;
    expect(html`<p title="${'"q"'}">${inner}${raw("<br>")}${[1, 2]}${false}</p>`.value).toBe(
      '<p title="&quot;q&quot;"><b>&lt;i&gt;</b><br>12</p>',
    );
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });
});

describe("page rendering", () => {
  it("lists top-level sections in the top bar and gives nested ones anchors and heading levels", async () => {
    const result = await buildFixture(
      minimal([
        { type: "section", title: "First part", children: [{ type: "section", title: "Detail", children: [] }] },
        { type: "section", id: "custom", title: "Second", children: [] },
      ]),
    );
    expect(result.html).toContain('<a href="#first-part" data-vx-toc-link="first-part">');
    expect(result.html).not.toContain('href="#detail"');
    expect(result.html).toContain('id="detail"');
    expect(result.html).toContain('id="custom"');
    expect(result.html).toMatch(/<h2 class="vx-heading">First part<\/h2>/);
    expect(result.html).toMatch(/<h3 class="vx-heading">Detail<\/h3>/);
  });

  it("inlines only the CSS and scripts of components that are used", async () => {
    const result = await buildFixture(minimal([{ type: "prose", text: "Just text" }]));
    expect(result.html).not.toContain("data-vx-graph");
    expect(result.html).not.toContain(".vx-graph-canvas");
    expect(result.html).not.toContain("vx-seq");
  });

  it("renders a details panel template for every entity, with its connections", async () => {
    const result = await buildFixture(
      minimal([{ type: "prose", text: "x" }], {
        entities: { a: { label: "Alpha", summary: "First" }, b: { label: "Beta" } },
        relations: [{ from: "a", to: "b", kind: "calls" }],
      }),
    );
    expect(result.html).toContain('<template data-entity-panel="a">');
    expect(result.html).toContain('<template data-entity-panel="b">');
    expect(result.html).toMatch(/calls →<\/span><span class="vx-chip [^"]*" data-entity="b"/);
  });

  it("slices, dedents and numbers code from files", async () => {
    const result = await buildFixture(minimal([{ type: "code", source: { file: "x.py", lines: [2, 3] }, highlight: [3] }]), {
      "x.py": "def f():\n    a = 1\n    return a\n",
    });
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('data-line="2"');
    expect(result.html).toMatch(/class="line vx-line-hl" data-line="3"/);
    expect(result.html).toContain("x.py:2–3");
    expect(result.html).not.toContain('data-line="1"');
  });
});

describe("page layout", () => {
  it("limits running text to the reading width and lets boxes and figures span the page", async () => {
    const result = await buildFixture(
      minimal([
        { type: "section", title: "Part", summary: "Lead", children: [{ type: "prose", text: "Body" }, { type: "callout", text: "Aside" }, { type: "stats", items: [{ value: 1, label: "x" }] }] },
      ]),
    );
    expect(result.html).toMatch(/<header class="vx-section-head vx-narrow">\s*<h2 class="vx-heading">Part<\/h2>/);
    expect(result.html).toMatch(/<div class="vx-stack"><div class="vx-b vx-b--prose" [^>]*><div class="vx-prose vx-narrow">/);
    expect(result.html).toContain('<aside class="vx-callout vx-callout--note vx-narrow">');
    // Without a title the tone names itself, so the callout never reads as a plain paragraph.
    expect(result.html).toMatch(/<div class="vx-callout-head">\s*<svg[^>]*>[\s\S]*?<\/svg>\s*<span>Note<\/span>/);
    expect(result.html).toMatch(/<div class="vx-stats">/);
  });

  it("ships diagram styles with the theme, so a sequence alone still has styled boxes", async () => {
    const result = await buildFixture(
      minimal([{ type: "sequence", participants: ["a", "b"], messages: [{ from: "a", to: "b", label: "hi", note: "why" }] }], { entities: { a: {}, b: {} } }),
    );
    expect(result.html).toContain(".vx-node-box {");
    expect(result.html).not.toContain("data-vx-graph");
    // Notes wrap below the diagram unless it fits beside them at its natural width.
    expect(result.html).toMatch(/<div class="vx-canvas" style="--vx-natural-width: \d+px">/);
    expect(result.html).toMatch(/<ol class="vx-notes vx-seq-notes"><li data-n="1">/);
  });

  it("puts code annotations inside the code, after the lines they explain", async () => {
    const result = await buildFixture(
      minimal([
        { type: "code", source: { file: "x.py" }, annotations: [{ lines: [1, 2], note: "Returns `return 1`" }] },
        // The note mentions "return 1" too; the anchor must still find only the code line.
        { type: "steps", visual: { type: "code", source: { file: "x.py" }, annotations: [{ lines: 2, note: "has return 1" }] }, steps: [{ title: "a", lines: { match: "return 1" } }] },
      ]),
      { "x.py": "def f():\n    return 1\nf()\n" },
    );
    expect(result.errors).toEqual([]);
    expect(result.html).toMatch(/data-line="2">[\s\S]*?<\/span><\/span>\n<aside class="vx-code-note" data-lines="1-2"><div class="vx-prose">[\s\S]*?<\/aside><span class="line" data-line="3">/);
    expect(result.html).toContain('data-lines="2-2"');
  });
});

describe("graph", () => {
  const doc = (entitiesShown: string[]) =>
    minimal([{ type: "graph", entities: entitiesShown }], {
      entities: {
        web: { kind: "folder" },
        page: { parent: "web" },
        server: { kind: "folder" },
        handler: { parent: "server" },
      },
      relations: [{ from: "page", to: "handler", kind: "fetches" }],
    });

  it("lifts relations between hidden children to their visible parents", async () => {
    const result = await buildFixture(doc(["web", "server"]));
    expect(result.errors).toEqual([]);
    expect(result.html).toContain('data-from="web" data-to="server"');
  });

  it("turns long graphs downwards when that renders them larger, and keeps short ones left to right", async () => {
    const chain = (n: number, direction?: string) => {
      const ids = Array.from({ length: n }, (_, index) => `a-rather-long-module-name-${index}`);
      return minimal([{ type: "graph", ...(direction ? { direction } : {}) }], {
        entities: Object.fromEntries(ids.map((id) => [id, {}])),
        relations: ids.slice(1).map((id, index) => ({ from: ids[index], to: id })),
      });
    };
    const size = async (doc: unknown) => {
      const match = /data-vx-graph data-vx-diagram>[\s\S]*?data-width="(\d+)" data-height="(\d+)"/.exec((await buildFixture(doc)).html!);
      return { width: Number(match![1]), height: Number(match![2]) };
    };
    const long = await size(chain(8));
    expect(long.height).toBeGreaterThan(long.width);
    const short = await size(chain(3));
    expect(short.width).toBeGreaterThan(short.height);
    const forced = await size(chain(8, "right"));
    expect(forced.width).toBeGreaterThan(forced.height);
  });

  it("nests children inside included parents", async () => {
    const result = await buildFixture(doc(["web", "page", "server", "handler"]));
    expect(result.html).toContain('data-from="page" data-to="handler"');
    expect(result.html).toMatch(/class="vx-group [^"]*" data-entity="web"/);
  });
});
