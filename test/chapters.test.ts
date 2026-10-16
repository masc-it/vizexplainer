import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildExplainer, loadDocument } from "../src/build.ts";
import { DocumentInput } from "../src/document/schema.ts";

const exec = promisify(execFile);
const cli = path.resolve("src/cli.ts");
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function fixture(manifest: unknown, files: Record<string, unknown> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "vizx-chapters-"));
  dirs.push(dir);
  for (const [name, value] of Object.entries({ ...files, "book/explainer.json": manifest })) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof value === "string" ? value : JSON.stringify(value));
  }
  return path.join(dir, "book/explainer.json");
}

const chapter = (title: string, children: unknown[] = []) => ({ type: "section", title, children });
const manifest = (chapters = ["chapters/overview.json"], extra = {}) => ({ title: "Book", chapters, ...extra });

describe("chapter manifests", () => {
  it("aggregates in manifest order, shares entities, and marks HTML with chapter paths", async () => {
    const file = await fixture(manifest(["chapters/z.json", "chapters/a.json"], {
      entities: { api: { label: "API" } },
    }), {
      "book/chapters/z.json": chapter("First", [{ type: "prose", text: "See [[api]]." }]),
      "book/chapters/a.json": chapter("Second"),
    });
    const loaded = await loadDocument(file);
    expect(loaded.issues).toEqual([]);
    expect(loaded.doc?.blocks.map((block) => block.title)).toEqual(["First", "Second"]);
    expect(loaded.doc).not.toHaveProperty("chapters");
    const result = await buildExplainer(file);
    expect(result.issues).toEqual([]);
    expect(result.html!.indexOf('id="first"')).toBeLessThan(result.html!.indexOf('id="second"'));
    expect(result.html).toContain('data-path="chapters/z.json:$.children[0]"');
    expect(result.html).toContain('data-entity="api"');
  });

  it("resolves sources from manifest root and custom components from its directory", async () => {
    const file = await fixture(manifest(undefined, {
      root: "../repo",
      components: ["./components/badge.mjs"],
    }), {
      "repo/code.ts": "export function answer() { return 42; }",
      "book/components/badge.mjs": 'export default ({ z }) => ({ name: "badge", description: "A badge", props: z.object({}).strict(), render: () => "<b>Custom badge</b>" });',
      "book/chapters/overview.json": chapter("Overview", [
        { type: "code", source: { file: "code.ts", symbol: "answer" } },
        { type: "badge" },
      ]),
    });
    const result = await buildExplainer(file);
    expect(result.issues).toEqual([]);
    expect(result.html).toContain("42");
    expect(result.html).toContain("Custom badge");
  });

  it("defaults source root to the manifest directory, not the chapter directory", async () => {
    const file = await fixture(manifest(), {
      "book/code.ts": "export const answer = 42;",
      "book/chapters/overview.json": chapter("Overview", [{ type: "code", source: { file: "code.ts" } }]),
    });
    expect((await buildExplainer(file)).issues).toEqual([]);
  });

  it("locates nested component, reference and source errors inside the chapter", async () => {
    const file = await fixture(manifest(), {
      "book/chapters/overview.json": chapter("Overview", [
        { type: "tabs", tabs: [{ label: "A", children: [{ type: "prose" }] }, { label: "B", children: [] }] },
        { type: "prose", text: "[[missing]]" },
        { type: "code", source: { file: "absent.ts" } },
      ]),
    });
    const result = await buildExplainer(file);
    expect(result.issues.map((issue) => issue.path)).toEqual([
      "chapters/overview.json:$.children[0].tabs[0].children[0].text",
      "chapters/overview.json:$.children[1]",
      "chapters/overview.json:$.children[2]",
    ]);
  });

  it("counts visible references even when a chapter filename starts with entities", async () => {
    const file = await fixture(manifest(["entities.json"], { entities: { api: {} } }), {
      "book/entities.json": chapter("Entities", [{ type: "prose", text: "[[api]]" }]),
    });
    expect((await buildExplainer(file)).issues).toEqual([]);
  });

  it("keeps ids global across chapters", async () => {
    const file = await fixture(manifest(["a.json", "b.json"]), {
      "book/a.json": { ...chapter("A"), id: "same" },
      "book/b.json": { ...chapter("B"), id: "same" },
    });
    expect((await buildExplainer(file)).issues).toContainEqual({
      path: "b.json:$.id", severity: "error", message: 'duplicate block id "same"',
    });
  });

  it("keeps shared-data errors on manifest paths", async () => {
    const file = await fixture(manifest(undefined, { relations: [{ from: "ghost", to: "ghost" }] }), {
      "book/chapters/overview.json": chapter("Overview"),
    });
    expect((await buildExplainer(file)).issues.map((issue) => issue.path)).toEqual(["relations[0].from", "relations[0].to"]);
  });

  it.each([
    { title: "Book", chapters: [] },
    { title: "Book", chapters: [""] },
    { title: "Book", chapters: [7] },
    { title: "Book", chapters: "chapter.json" },
    { title: "Book", chapters: ["chapter.json"], blocks: [] },
    { title: "Book" },
  ])("rejects invalid document input %j", async (input) => {
    expect(DocumentInput.safeParse(input).success).toBe(false);
    const loaded = await loadDocument(await fixture(input));
    expect(loaded.doc).toBeUndefined();
    expect(loaded.issues.length).toBeGreaterThan(0);
  });

  it("reports every missing or malformed chapter and never renders a partial book", async () => {
    const file = await fixture(manifest(["ok.json", "missing.json", "bad.json"]), {
      "book/ok.json": chapter("Good"),
      "book/bad.json": "{ broken",
    });
    const result = await buildExplainer(file);
    expect(result.html).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({ path: "missing.json:$", message: expect.stringContaining("cannot read") }),
      expect.objectContaining({ path: "bad.json:$", message: expect.stringContaining("invalid JSON") }),
    ]);
  });

  it.each([null, [], { type: "prose", text: "no" }, { title: "nested", chapters: ["other.json"] }])("rejects non-section chapters %j", async (value) => {
    const loaded = await loadDocument(await fixture(manifest(), { "book/chapters/overview.json": value }));
    expect(loaded.doc).toBeUndefined();
    expect(loaded.issues[0]?.path).toMatch(/^chapters\/overview\.json:\$/);
  });

  it("checks section props and rejects include directives instead of resolving them", async () => {
    const file = await fixture(manifest(), {
      "book/chapters/overview.json": { ...chapter("Overview"), $include: "another.json" },
    });
    expect((await buildExplainer(file)).issues).toContainEqual({
      path: "chapters/overview.json:$", severity: "error", message: 'Unrecognized key: "$include"',
    });
  });

  it("rejects duplicate normalized paths and absolute paths", async () => {
    const file = await fixture(manifest(["a.json", "./a.json", "/absolute.json"]), { "book/a.json": chapter("A") });
    const loaded = await loadDocument(file);
    expect(loaded.doc).toBeUndefined();
    expect(loaded.issues.map((issue) => issue.path)).toEqual(["chapters[1]", "chapters[2]"]);
    expect(loaded.issues[0]?.message).toContain("duplicate chapter");
  });

  it("preserves single-file loading and block paths", async () => {
    const file = await fixture({ title: "Legacy", blocks: [{ type: "prose", text: "Hello" }] });
    const loaded = await loadDocument(file);
    expect(loaded.blockPaths).toBeUndefined();
    expect(loaded.doc?.entities).toEqual({});
    const built = await buildExplainer(file);
    expect(built.issues).toEqual([]);
    expect(built.html).toContain('data-path="blocks[0]"');
  });
});

describe("chapter CLI", () => {
  it("validates, lists components, and renders a manifest from another working directory", async () => {
    const file = await fixture(manifest(), { "book/chapters/overview.json": chapter("Overview") });
    const cwd = path.dirname(path.dirname(file));
    const checked = await exec(process.execPath, [cli, "validate", file, "--json", "--strict"], { cwd });
    expect(JSON.parse(checked.stdout)).toMatchObject({ valid: true, errors: 0, warnings: 0 });
    const catalogue = await exec(process.execPath, [cli, "components", file, "--json"], { cwd });
    expect(JSON.parse(catalogue.stdout)).toContainEqual(expect.objectContaining({ name: "section" }));
    const out = path.join(cwd, "page.html");
    await exec(process.execPath, [cli, "render", file, "-o", out], { cwd });
    expect(await readFile(out, "utf8")).toContain('data-path="chapters/overview.json:$"');
  });

  it("reports chapter paths in JSON diagnostics and refuses to render on errors", async () => {
    const file = await fixture(manifest(), { "book/chapters/overview.json": chapter("Overview", [{ type: "prose" }]) });
    const result = await exec(process.execPath, [cli, "validate", file, "--json"]).catch((failure) => failure);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).issues[0].path).toBe("chapters/overview.json:$.children[0].text");
    const out = path.join(path.dirname(file), "page.html");
    await expect(exec(process.execPath, [cli, "render", file, "-o", out])).rejects.toMatchObject({ code: 1 });
    await expect(readFile(out)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishes both input formats in the schema", async () => {
    const result = await exec(process.execPath, [cli, "schema"]);
    const schema = JSON.parse(result.stdout);
    expect(schema.anyOf).toHaveLength(2);
    expect(schema.anyOf.map((variant: { required: string[] }) => variant.required)).toEqual([
      ["title", "blocks"], ["title", "chapters"],
    ]);
  });
});
