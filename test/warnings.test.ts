import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExplainer, formatIssue } from "../src/index.ts";
import { buildFixture, minimal } from "./helpers.ts";

describe("warnings", () => {
  it("flags orphaned entities and long summaries without failing the build", async () => {
    const result = await buildFixture(
      minimal([{ type: "prose", text: "[[shown]]" }], {
        entities: { shown: { summary: "x".repeat(301) }, related: {}, other: {}, orphan: {} },
        relations: [{ from: "related", to: "other" }],
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      'warning: entities.shown.summary: summary is 301 characters; keep it to one or two sentences and move the rest to "details"',
      "warning: entities.orphan: is never shown and has no relations; reference it from a block or remove it",
    ]);
  });

  it("flags crowded graphs, steps that spotlight nothing and whole-file code", async () => {
    const entities = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`e${i}`, {}]));
    const result = await buildFixture(
      minimal(
        [
          { type: "graph" },
          { type: "steps", visual: { type: "code", source: { file: "big.ts" } }, steps: [{ title: "Look", lines: 1 }, { title: "Nothing" }] },
        ],
        { entities },
      ),
      { "big.ts": Array.from({ length: 130 }, (_, i) => `const v${i} = ${i};`).join("\n") },
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "warning: blocks[0]: draws 17 boxes; beyond about 16 a diagram gets hard to read. List fewer entities, or list parents to lift relations",
      'warning: blocks[1]: steps[1] spotlights nothing in the visual; add "focus" or "lines"',
      'warning: blocks[1].visual: shows all 130 lines of "big.ts"; pick the part that matters with "symbol" or "lines"',
    ]);
  });

  it("flags a repository ref that differs from the checkout, and uncommitted source files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vizx-git-"));
    const git = (...args: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir });
    git("init", "-q");
    await writeFile(path.join(dir, "a.ts"), "export const a = 1;\n");
    git("add", ".");
    git("commit", "-qm", "one");
    const first = git("rev-parse", "HEAD").toString().trim();
    await writeFile(path.join(dir, "a.ts"), "export const a = 2;\n");
    git("commit", "-qam", "two");
    await writeFile(path.join(dir, "a.ts"), "export const a = 3;\n");
    const doc = minimal([{ type: "code", source: { file: "a.ts", symbol: "a" } }], { repository: { url: "https://github.com/o/r", ref: first } });
    await writeFile(path.join(dir, "explainer.json"), JSON.stringify(doc));

    const messages = (await buildExplainer(path.join(dir, "explainer.json"))).issues.map(formatIssue);
    expect(messages).toEqual([
      expect.stringMatching(new RegExp(`^warning: repository.ref: "${first}" is ${first.slice(0, 7)} but the checked-out code is [0-9a-f]{7}`)),
      'warning: repository: a.ts has uncommitted changes; its "View source" links will not match the page',
    ]);
  });
});

describe("symbol sources", () => {
  const files = { "svc.kt": "class Svc {\n    fun run() {\n        go()\n    }\n\n    fun stop() = Unit\n}\n" };

  it("resolves a symbol to its lines", async () => {
    const result = await buildFixture(minimal([{ type: "code", source: { file: "svc.kt", symbol: "Svc.run" } }]), files);
    expect(result.messages).toEqual([]);
    expect(result.html).toContain("Svc.run · svc.kt:2–4");
    expect(result.html).toContain('data-line="4"');
    expect(result.html).not.toContain('data-line="5"');
  });

  it("reports unknown symbols with the file and a hint", async () => {
    const result = await buildFixture(minimal([{ type: "code", source: { file: "svc.kt", symbol: "Svc.runn" } }]), files);
    expect(result.errors).toEqual([
      'blocks[0]: symbol "Svc.runn" not found (did you mean "Svc.run"?) in "svc.kt" (run `vizx symbols svc.kt` to list declarations)',
    ]);
  });

  it("rejects giving both lines and symbol", async () => {
    const result = await buildFixture(minimal([{ type: "code", source: { file: "svc.kt", symbol: "Svc.run", lines: 1 } }]), files);
    expect(result.errors[0]).toMatch(/give `lines` or `symbol`, not both/);
  });
});

describe("text anchors for lines", () => {
  const files = { "w.kt": "fun work() {\n    lock.acquire(10)\n    delay(5)\n    log(\"done\")\n    log(\"done\")\n}\n" };

  it("resolves { match } in highlights, annotations and steps", async () => {
    const result = await buildFixture(
      minimal([
        { type: "code", source: { file: "w.kt", symbol: "work" }, highlight: [{ match: "delay(" }], annotations: [{ lines: { match: "lock.acquire", lines: 2 }, note: "lease" }] },
        { type: "steps", visual: { type: "code", source: { file: "w.kt", symbol: "work" } }, steps: [{ title: "a", lines: { match: "acquire" } }] },
      ]),
      files,
    );
    expect(result.messages).toEqual([]);
    expect(result.html).toMatch(/class="line vx-line-hl" data-line="3"/);
    expect(result.html).toContain('data-lines="2-3"');
  });

  it("fails loudly when the text is gone or not unique", async () => {
    const result = await buildFixture(
      minimal([{ type: "code", source: { file: "w.kt", symbol: "work" }, highlight: [{ match: "acquire(3" }], annotations: [{ lines: { match: "log(" }, note: "x" }] }]),
      files,
    );
    expect(result.errors).toEqual([
      'blocks[0]: highlight[0]: no shown line contains "acquire(3"; the code may have changed',
      'blocks[0]: annotations[0]: "log(" appears on 2 lines (4, 5); use a longer, unique piece of text',
    ]);
  });
});
