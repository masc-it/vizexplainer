import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildExplainer, formatIssue } from "../src/index.ts";

/** Writes files into a fresh temp dir and builds `explainer.json` from it. */
export async function buildFixture(doc: unknown, files: Record<string, string> = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "vizx-test-"));
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);
  const docPath = path.join(dir, "explainer.json");
  await writeFile(docPath, JSON.stringify(doc));
  const result = await buildExplainer(docPath);
  const format = (severity: string) => result.issues.filter((issue) => issue.severity === severity).map(formatIssue);
  return { ...result, messages: result.issues.map(formatIssue), errors: format("error"), warnings: format("warning") };
}

export const minimal = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({ title: "Test", blocks, ...extra });
