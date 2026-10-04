import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch {
    return undefined;
  }
}

/** The file's content at a revision, or undefined when git cannot provide it. */
export async function readAtRevision(cwd: string, ref: string, file: string): Promise<string | undefined> {
  // "<ref>:./<path>" makes git resolve the path relative to cwd rather than the repository root.
  return git(cwd, ["show", `${ref}:./${file.replace(/^\.\//, "")}`]);
}

export interface GitState {
  head: string;
  /** Commit the ref points to, or undefined when the ref does not exist locally. */
  refCommit: string | undefined;
  /** The given files (as passed in) that differ from HEAD or are untracked. */
  changed: Set<string>;
}

/** Reads what the working tree at `cwd` looks like. Returns undefined outside a git repository. */
export async function readGitState(cwd: string, ref: string, files: readonly string[]): Promise<GitState | undefined> {
  const toplevel = (await git(cwd, ["rev-parse", "--show-toplevel"]))?.trim();
  const head = toplevel === undefined ? undefined : (await git(cwd, ["rev-parse", "HEAD"]))?.trim();
  if (toplevel === undefined || head === undefined) return undefined;
  const refCommit = (await git(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]))?.trim() || undefined;
  const dirty = new Set<string>();
  if (files.length > 0) {
    const status = await git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...files]);
    for (const entry of (status ?? "").split("\0")) {
      // Entries look like "XY path"; renames add the old path as a separate entry, which is harmless here.
      if (entry.length > 3) dirty.add(path.resolve(toplevel, entry.slice(3)));
    }
  }
  // Git reports real paths; compare against real paths so symlinked directories (e.g. /tmp) still match.
  const changed = new Set<string>();
  for (const file of files) {
    const real = await realpath(file).catch(() => undefined);
    if (real !== undefined && dirty.has(real)) changed.add(file);
  }
  return { head, refCommit, changed };
}
