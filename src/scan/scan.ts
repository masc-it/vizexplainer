import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Document, Entity, Relation } from "../document/schema.ts";
import { languageFromFile } from "../sources/language.ts";
import { listSymbols, type SymbolInfo } from "../sources/symbols.ts";
import { listSourceFiles, SOURCE_LANGUAGES } from "./files.ts";
import { findDependencies, type SourceFile } from "./imports.ts";

export interface ScannedFile {
  path: string;
  lines: number;
  language: string;
  test: boolean;
  /** Top-level declarations and their direct members. */
  symbols: SymbolInfo[];
}

export interface ScanResult {
  root: string;
  files: ScannedFile[];
  /** Folders kept as entities, after collapsing chains of single-child folders. */
  folders: { path: string; label: string; parent?: string }[];
  relations: Relation[];
  /** Files beyond `maxFiles` that were left out. */
  skipped: number;
}

const TEST_PATH = /(^|\/)(tests?|__tests__|spec|androidTest|testFixtures)\/|[._-](test|spec)\.[^/]+$|_test\.go$/i;
const MAX_FILE_BYTES = 1024 * 1024;
const FILE_LIST_LIMIT = 300;
const MEMBER_VALUES = new Set(["val", "var", "let", "const"]);

export async function scanRepository(root: string, options: { maxFiles: number }): Promise<ScanResult> {
  const all = await listSourceFiles(root);
  const listed = all.slice(0, options.maxFiles);
  const sources: SourceFile[] = [];
  for (const file of listed) {
    const text = await readFile(path.join(root, file), "utf8").catch(() => undefined);
    if (text !== undefined && text.length <= MAX_FILE_BYTES) sources.push({ path: file, text: text.replace(/\r\n/g, "\n") });
  }
  const goModule = await readFile(path.join(root, "go.mod"), "utf8")
    .then((text) => /^module\s+(\S+)/m.exec(text)?.[1])
    .catch(() => undefined);

  const files = sources.map((source): ScannedFile => {
    const ext = path.extname(source.path).slice(1).toLowerCase();
    return {
      path: source.path,
      lines: source.text.replace(/\n$/, "").split("\n").length,
      language: SOURCE_LANGUAGES[ext] ?? ext,
      test: TEST_PATH.test(source.path),
      symbols: listSymbols(source.text, languageFromFile(source.path)).filter((symbol) => symbol.qualified.split(".").length <= 2),
    };
  });
  const folders = collapseFolders(files.map((file) => file.path));
  const folderIds = new Set(folders.map((folder) => folder.path));
  const relations = findDependencies(sources, { goModule })
    // Go imports name a package directory; point at the nearest folder entity that exists.
    .map((dependency) => ({ ...dependency, to: sources.some((s) => s.path === dependency.to) ? dependency.to : nearestFolder(dependency.to, folderIds) }))
    .filter((dependency): dependency is { from: string; to: string; kind: "imports" | "uses" } => dependency.to !== undefined)
    .map(({ from, to, kind }) => ({ from, to, kind }));
  return { root, files, folders, relations, skipped: all.length - listed.length };
}

/**
 * Every directory that holds files, or more than one subdirectory, becomes a folder entity.
 * Chains of directories with a single child are merged into one, e.g. `src/main/java/com/acme`.
 */
function collapseFolders(files: readonly string[]): ScanResult["folders"] {
  const dirs = new Set<string>();
  for (const file of files) for (let dir = path.posix.dirname(file); dir !== "."; dir = path.posix.dirname(dir)) dirs.add(dir);
  const childDirs = new Map<string, Set<string>>();
  const hasFiles = new Set(files.map((file) => path.posix.dirname(file)));
  for (const dir of dirs) {
    const parent = path.posix.dirname(dir);
    if (!childDirs.has(parent)) childDirs.set(parent, new Set());
    childDirs.get(parent)!.add(dir);
  }
  const kept = [...dirs].filter((dir) => hasFiles.has(dir) || (childDirs.get(dir)?.size ?? 0) > 1).sort();
  const keptSet = new Set(kept);
  return kept.map((dir) => {
    const parent = nearestFolder(path.posix.dirname(dir), keptSet);
    return { path: dir, label: parent ? path.posix.relative(parent, dir) : dir, parent };
  });
}

function nearestFolder(dir: string, folders: ReadonlySet<string>): string | undefined {
  for (let current = dir; current !== "." && current !== ""; current = path.posix.dirname(current)) {
    if (folders.has(current)) return current;
  }
  return undefined;
}

/** A valid starting document: entities and relations filled in, prose left for the agent to write. */
export function draftDocument(scan: ScanResult, options: { title: string; root: string }): Document {
  const folderIds = new Set(scan.folders.map((folder) => folder.path));
  const entities: Record<string, Entity> = {};
  for (const folder of scan.folders) entities[folder.path] = { label: `${folder.label}/`, kind: "folder", ...(folder.parent ? { parent: folder.parent } : {}) };
  for (const file of scan.files) {
    const parent = nearestFolder(path.posix.dirname(file.path), folderIds);
    entities[file.path] = { label: path.posix.basename(file.path), kind: file.test ? "test" : "file", ...(parent ? { parent } : {}) };
  }
  const topFolders = scan.folders.filter((folder) => folder.parent === undefined);
  const topLevel = [...topFolders.map((folder) => folder.path), ...scan.files.filter((file) => !file.path.includes("/")).map((file) => file.path)];
  const lines = scan.files.reduce((sum, file) => sum + file.lines, 0);
  const languages = new Set(scan.files.map((file) => file.language));

  return {
    title: options.title,
    summary: "TODO: one paragraph on what this project does and who it is for.",
    root: options.root,
    entities,
    relations: scan.relations,
    blocks: [
      {
        type: "stats",
        items: [
          { value: scan.files.length, label: "source files" },
          { value: lines, label: "lines of code" },
          { value: languages.size, label: languages.size === 1 ? "language" : "languages", hint: [...languages].join(", ") },
        ],
      },
      {
        type: "section",
        title: "Structure",
        summary: "TODO: describe the main parts in plain language.",
        children: [
          ...(topLevel.length > 1 ? [{ type: "graph", entities: largest(topLevel, scan, 14), edgeLabels: false }] : []),
          { type: "details", title: "Every folder and file", children: [{ type: "tree", summaries: false }] },
        ],
      },
    ],
  };
}

function largest(ids: readonly string[], scan: ScanResult, limit: number): string[] {
  const size = (id: string) => scan.files.filter((file) => file.path === id || file.path.startsWith(`${id}/`)).reduce((sum, file) => sum + file.lines, 0);
  return [...ids].sort((a, b) => size(b) - size(a)).slice(0, limit);
}

/** A plain-text overview for planning: folders, files, connectivity and the key declarations. */
export function scanReport(scan: ScanResult, options: { symbolsFor: number }): string {
  const out: string[] = [];
  const total = scan.files.reduce((sum, file) => sum + file.lines, 0);
  const byLanguage = new Map<string, number>();
  for (const file of scan.files) byLanguage.set(file.language, (byLanguage.get(file.language) ?? 0) + file.lines);
  out.push(`Scanned ${scan.files.length} source files (${total.toLocaleString("en")} lines) in ${scan.root}`);
  if (scan.skipped) out.push(`Left out ${scan.skipped} files beyond --max-files.`);
  out.push(`Languages: ${[...byLanguage].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n.toLocaleString("en")}`).join(", ")}`);
  out.push(`Relations found: ${scan.relations.length} (${scan.relations.filter((r) => r.kind === "imports").length} imports, ${scan.relations.filter((r) => r.kind === "uses").length} same-package or qualified uses)`);

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const relation of scan.relations) {
    incoming.set(relation.to, (incoming.get(relation.to) ?? 0) + 1);
    outgoing.set(relation.from, (outgoing.get(relation.from) ?? 0) + 1);
  }

  out.push("", "Folders (entity id, files, lines):");
  const folderIds = new Set(scan.folders.map((folder) => folder.path));
  for (const folder of scan.folders) {
    const inside = scan.files.filter((file) => nearestFolder(path.posix.dirname(file.path), folderIds) === folder.path);
    const depth = ancestors(folder, scan).length;
    out.push(`${"  ".repeat(depth + 1)}${folder.path}  ${inside.length} files, ${inside.reduce((sum, file) => sum + file.lines, 0).toLocaleString("en")} lines`);
  }

  const listed = scan.files.length <= FILE_LIST_LIMIT ? scan.files : [...scan.files].sort((a, b) => b.lines - a.lines).slice(0, FILE_LIST_LIMIT).sort((a, b) => a.path.localeCompare(b.path));
  out.push("", `Files (lines, used by / uses)${listed.length < scan.files.length ? `, the ${listed.length} largest` : ""}:`);
  for (const file of listed) {
    out.push(`  ${file.path}  ${file.lines}${file.test ? " test" : ""}  ←${incoming.get(file.path) ?? 0} →${outgoing.get(file.path) ?? 0}`);
  }

  const central = [...scan.files]
    .filter((file) => !file.test)
    .sort((a, b) => (incoming.get(b.path) ?? 0) + (outgoing.get(b.path) ?? 0) - ((incoming.get(a.path) ?? 0) + (outgoing.get(a.path) ?? 0)) || b.lines - a.lines)
    .slice(0, options.symbolsFor);
  out.push("", `Declarations in the ${central.length} most connected files (usable as "symbol" sources):`);
  for (const file of central) {
    // Member properties are rarely worth showing on their own; keep types, functions and top-level values.
    const useful = file.symbols.filter((symbol) => !(symbol.qualified.includes(".") && MEMBER_VALUES.has(symbol.kind)));
    out.push(`  ${file.path}`);
    for (const symbol of useful.slice(0, 25)) out.push(`    ${symbol.kind} ${symbol.qualified}  ${symbol.start}-${symbol.end}`);
    if (useful.length > 25) out.push(`    ... ${useful.length - 25} more (vizx symbols ${file.path})`);
  }
  return out.join("\n");
}

function ancestors(folder: ScanResult["folders"][number], scan: ScanResult): string[] {
  const chain: string[] = [];
  for (let parent = folder.parent; parent !== undefined; parent = scan.folders.find((f) => f.path === parent)?.parent) chain.push(parent);
  return chain;
}
