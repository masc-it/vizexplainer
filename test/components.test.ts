import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExplainer, formatIssue } from "../src/index.ts";
import { diffLines, parsePatch } from "../src/sources/line-diff.ts";
import { buildFixture, minimal } from "./helpers.ts";

describe("line diff", () => {
  it("finds the minimal set of added and removed lines", () => {
    const rows = diffLines(["a", "b", "c", "d"], ["a", "c", "x", "d"]).map((row) => row.op);
    expect(rows).toEqual(["same", "del", "same", "add", "same"]);
  });

  it("parses unified patches with several files and hunks", () => {
    const files = parsePatch(
      "diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n a\n-b\n+B\n@@ -9 +9,2 @@\n z\n+zz\ndiff --git a/new.py b/new.py\n--- /dev/null\n+++ b/new.py\n@@ -0,0 +1 @@\n+print()\n",
    );
    expect(files.map((file) => [file.oldPath, file.newPath, file.hunks.length])).toEqual([
      ["x.ts", "x.ts", 2],
      [undefined, "new.py", 1],
    ]);
    expect(files[0]!.hunks[0]!.rows.map((row) => row.op)).toEqual(["same", "del", "add"]);
  });
});

describe("diff component", () => {
  it("compares a symbol across git revisions", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vizx-diff-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir });
    git("init", "-q");
    await writeFile(path.join(dir, "a.kt"), "fun keep() = 1\n\nfun change(): Int {\n    return 1\n}\n");
    git("add", ".");
    git("commit", "-qm", "one");
    await writeFile(path.join(dir, "a.kt"), "fun keep() = 1\n\n// new comment\nfun change(): Int {\n    return 2\n}\n");
    const doc = minimal([{ type: "diff", before: { file: "a.kt", symbol: "change", ref: "HEAD" }, after: { file: "a.kt", symbol: "change" } }]);
    await writeFile(path.join(dir, "explainer.json"), JSON.stringify(doc));

    const result = await buildExplainer(path.join(dir, "explainer.json"));
    expect(result.issues.map(formatIssue)).toEqual([]);
    expect(result.html).toContain("a.kt @ HEAD → a.kt");
    expect(result.html).toMatch(/vx-diff-del">.*return<\/span><span[^>]*> 1/);
    expect(result.html).toMatch(/vx-diff-add">.*return<\/span><span[^>]*> 2/);
    expect(result.html).toContain('<b class="vx-diff-plus">+2</b> <b class="vx-diff-minus">−1</b>');
  });

  it("requires either before and after, or a patch", async () => {
    const result = await buildFixture(minimal([{ type: "diff", before: { code: "a" } }]));
    expect(result.errors).toEqual(["blocks[0]: give both `before` and `after`"]);
  });
});

describe("timeline and steps", () => {
  it("lays a numbered timeline across the page, and a plain one in the reading column", async () => {
    const result = await buildFixture(
      minimal([
        { type: "timeline", layout: "across", numbered: true, items: [{ title: "Edited", when: "now" }, { title: "Saved", tone: "success" }], caption: "Two stages" },
        { type: "timeline", items: [{ title: "Start" }] },
      ]),
    );
    expect(result.messages).toEqual([]);
    expect(result.html).toContain('<figure class="vx-figure vx-timeline-figure">\n      <ol class="vx-timeline vx-timeline--across vx-timeline--numbered">');
    expect(result.html).toMatch(/<li class="vx-timeline-item vx-tone-success">\s*<span class="vx-timeline-marker" aria-hidden="true">2<\/span>/);
    expect(result.html).toContain('<div class="vx-timeline-when">now</div>');
    expect(result.html).toContain('<figure class="vx-figure vx-timeline-figure vx-narrow">');
  });

  it("warns when too many items are laid across", async () => {
    const items = Array.from({ length: 7 }, (_, index) => ({ title: `Stage ${index}` }));
    const result = await buildFixture(minimal([{ type: "timeline", layout: "across", items }]));
    expect(result.warnings).toEqual(["warning: blocks[0]: lays 7 items across; beyond 6 the columns get too narrow. Use the vertical layout or fewer items"]);
  });

  it("points steps without a visual to timeline", async () => {
    const result = await buildFixture(minimal([{ type: "steps", steps: [{ title: "One" }] }]));
    expect(result.errors).toEqual(['blocks[0].visual: steps need a `visual` to pin; for an ordered list without one, use `timeline` with `"numbered": true`']);
  });
});

describe("state, timeline, glossary and quiz", () => {
  it("reports transitions between unknown states", async () => {
    const result = await buildFixture(
      minimal([{ type: "state", states: [{ id: "A", kind: "initial" }, { id: "B" }], transitions: [{ from: "A", to: "B" }, { from: "B", to: "C" }] }]),
    );
    expect(result.errors).toEqual(['blocks[0]: transitions[1] uses "C", which is not one of the states']);
    expect(result.html).toContain("vx-state-start");
  });

  it("requires a correct answer for every quiz question", async () => {
    const result = await buildFixture(minimal([{ type: "quiz", questions: [{ question: "?", options: [{ text: "a" }, { text: "b" }] }] }]));
    expect(result.errors).toEqual(["blocks[0].questions[0]: mark at least one option `correct: true`"]);
  });

  it("sorts glossary entries and links entity terms", async () => {
    const result = await buildFixture(
      minimal([{ type: "glossary", terms: [{ term: "zeta", definition: "last" }], entities: ["alpha"] }, { type: "timeline", items: [{ title: "Start", entity: "alpha" }] }], {
        entities: { alpha: { label: "Alpha", summary: "first" } },
      }),
    );
    expect(result.messages).toEqual([]);
    expect(result.html!.indexOf(">Alpha<")).toBeLessThan(result.html!.indexOf(">zeta<"));
    expect(result.html).toMatch(/class="vx-timeline-title"><span class="vx-ref [^"]*" data-entity="alpha"/);
  });
});
