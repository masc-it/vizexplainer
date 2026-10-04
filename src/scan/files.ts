import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Extensions treated as source code, mapped to a display name. */
export const SOURCE_LANGUAGES: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", kt: "Kotlin", kts: "Kotlin", java: "Java", go: "Go", rs: "Rust", swift: "Swift",
  rb: "Ruby", php: "PHP", cs: "C#", c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", scala: "Scala",
  dart: "Dart", svelte: "Svelte", vue: "Vue", lua: "Lua", ex: "Elixir", exs: "Elixir", sh: "Shell",
};

const SKIPPED_DIRS = new Set(["node_modules", ".git", "build", "dist", "out", "target", ".gradle", ".idea", ".vscode", "venv", ".venv", "__pycache__", ".next", ".nuxt", "vendor", "coverage", ".cache", "Pods", "DerivedData"]);

export function isSource(file: string): boolean {
  return path.extname(file).slice(1).toLowerCase() in SOURCE_LANGUAGES;
}

/**
 * Lists source files relative to `root`. Inside a git repository this follows git (tracked plus
 * untracked-but-not-ignored files); elsewhere it walks the tree, skipping build and dependency folders.
 */
export async function listSourceFiles(root: string): Promise<string[]> {
  try {
    const { stdout } = await run("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    return stdout.split("\0").filter((file) => file && isSource(file) && !file.split("/").some((part) => SKIPPED_DIRS.has(part))).sort();
  } catch {
    const files: string[] = [];
    await walk(root, "", files);
    return files.sort();
  }
}

async function walk(root: string, relative: string, files: string[]): Promise<void> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) await walk(root, child, files);
    } else if (entry.isFile() && isSource(entry.name)) files.push(child);
  }
}
