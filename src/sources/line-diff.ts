export type DiffOp = "same" | "del" | "add";

export interface DiffRow {
  op: DiffOp;
  /** Index into the old lines (for same/del). */
  oldIndex?: number;
  /** Index into the new lines (for same/add). */
  newIndex?: number;
}

/** Above this many cells the quadratic LCS gets slow; fall back to "everything changed". */
const MAX_CELLS = 4_000_000;

/** Line diff by longest common subsequence. Lines are compared ignoring trailing whitespace. */
export function diffLines(before: readonly string[], after: readonly string[]): DiffRow[] {
  const a = before.map((line) => line.trimEnd());
  const b = after.map((line) => line.trimEnd());
  // Common prefix and suffix are cheap to peel off and usually most of the file.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

  const rows: DiffRow[] = [];
  for (let i = 0; i < prefix; i++) rows.push({ op: "same", oldIndex: i, newIndex: i });
  const n = a.length - prefix - suffix;
  const m = b.length - prefix - suffix;
  if (n * m > MAX_CELLS) {
    for (let i = 0; i < n; i++) rows.push({ op: "del", oldIndex: prefix + i });
    for (let j = 0; j < m; j++) rows.push({ op: "add", newIndex: prefix + j });
  } else {
    // lengths[i][j] = LCS length of a[prefix+i..] and b[prefix+j..]
    const lengths = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lengths[i]![j] = a[prefix + i] === b[prefix + j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[prefix + i] === b[prefix + j]) rows.push({ op: "same", oldIndex: prefix + i++, newIndex: prefix + j++ });
      else if (j < m && (i === n || lengths[i]![j + 1]! >= lengths[i + 1]![j]!)) rows.push({ op: "add", newIndex: prefix + j++ });
      else rows.push({ op: "del", oldIndex: prefix + i++ });
    }
  }
  for (let k = suffix; k > 0; k--) rows.push({ op: "same", oldIndex: a.length - k, newIndex: b.length - k });
  return rows;
}

export interface PatchHunk {
  oldStart: number;
  newStart: number;
  /** Old side: context and deleted lines, in order. */
  oldLines: string[];
  /** New side: context and added lines, in order. */
  newLines: string[];
  rows: DiffRow[];
}

export interface PatchFile {
  oldPath?: string;
  newPath?: string;
  hunks: PatchHunk[];
}

/** Parses unified diff text such as `git diff` output. */
export function parsePatch(text: string): PatchFile[] {
  const files: PatchFile[] = [];
  let file: PatchFile | undefined;
  let hunk: PatchHunk | undefined;
  const startFile = () => {
    file = { hunks: [] };
    files.push(file);
    return file;
  };
  // A final newline ends the last line; it does not start an empty context line.
  for (const line of text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n")) {
    if (line.startsWith("diff --git ")) {
      startFile();
      hunk = undefined;
    } else if (line.startsWith("--- ") && !hunk?.rows.length) {
      const current = file && !file.hunks.length && !file.oldPath ? file : startFile();
      current.oldPath = stripPrefix(line.slice(4));
    } else if (line.startsWith("+++ ") && file && !file.hunks.length) {
      file.newPath = stripPrefix(line.slice(4));
    } else if (line.startsWith("@@")) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (!match) continue;
      hunk = { oldStart: Number(match[1]), newStart: Number(match[2]), oldLines: [], newLines: [], rows: [] };
      (file ?? startFile()).hunks.push(hunk);
    } else if (hunk) {
      const marker = line[0];
      const content = line.slice(1);
      if (marker === " " || (marker === undefined && line === "")) {
        hunk.rows.push({ op: "same", oldIndex: hunk.oldLines.push(content) - 1, newIndex: hunk.newLines.push(content) - 1 });
      } else if (marker === "-") hunk.rows.push({ op: "del", oldIndex: hunk.oldLines.push(content) - 1 });
      else if (marker === "+") hunk.rows.push({ op: "add", newIndex: hunk.newLines.push(content) - 1 });
      // "\ No newline at end of file" and anything else is ignored.
    }
  }
  return files.filter((candidate) => candidate.hunks.length > 0);
}

function stripPrefix(name: string): string | undefined {
  const clean = name.split("\t")[0]!.trim();
  if (clean === "/dev/null") return undefined;
  return clean.replace(/^[ab]\//, "");
}
