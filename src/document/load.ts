import { readFile } from "node:fs/promises";
import path from "node:path";
import { error, zodIssues, type Issue } from "../issues.ts";
import { Chapter, Document, Manifest, type Block } from "./schema.ts";

export interface LoadedDocument {
  doc?: Document;
  /** Root paths for chapter blocks, used in diagnostics and preview's data-path attributes. */
  blockPaths?: string[];
  issues: Issue[];
}

async function readJson(file: string, location: string): Promise<{ json?: unknown; issues: Issue[] }> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (failure) {
    return { issues: [error(location, `cannot read ${file}: ${failure instanceof Error ? failure.message : String(failure)}`)] };
  }
  try {
    return { json: JSON.parse(text), issues: [] };
  } catch (failure) {
    return { issues: [error(location, `invalid JSON: ${failure instanceof Error ? failure.message : String(failure)}`)] };
  }
}

/** Resolves chapter files once, without changing source or component path resolution. */
export async function loadDocument(docPath: string): Promise<LoadedDocument> {
  const input = await readJson(docPath, "");
  if (input.issues.length) return { issues: input.issues };
  if (typeof input.json !== "object" || input.json === null || !("chapters" in input.json)) {
    const parsed = Document.safeParse(input.json);
    return parsed.success ? { doc: parsed.data, issues: [] } : { issues: zodIssues(parsed.error, "") };
  }

  const parsed = Manifest.safeParse(input.json);
  if (!parsed.success) return { issues: zodIssues(parsed.error, "") };
  const { chapters, ...shared } = parsed.data;
  const blocks: Block[] = [];
  const blockPaths: string[] = [];
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const [index, chapter] of chapters.entries()) {
    if (path.isAbsolute(chapter)) {
      issues.push(error(`chapters[${index}]`, "chapter paths must be relative to the manifest"));
      continue;
    }
    const file = path.resolve(path.dirname(docPath), chapter);
    if (seen.has(file)) {
      issues.push(error(`chapters[${index}]`, `duplicate chapter file "${chapter}"`));
      continue;
    }
    seen.add(file);
    const location = `${chapter}:$`;
    const loaded = await readJson(file, location);
    if (loaded.issues.length) {
      issues.push(...loaded.issues);
      continue;
    }
    const section = Chapter.safeParse(loaded.json);
    if (!section.success) {
      issues.push(...zodIssues(section.error, location));
      continue;
    }
    blocks.push(section.data);
    blockPaths.push(location);
  }
  // Never render a partial book silently when a chapter could not be loaded.
  return issues.length ? { issues } : { doc: { ...shared, blocks }, blockPaths, issues };
}
