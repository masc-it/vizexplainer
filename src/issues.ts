import type { z } from "zod";

/**
 * Errors make a document unrenderable. Warnings flag likely mistakes (stale sources, hard-to-read
 * diagrams) without blocking a render, unless the caller asks for strict mode.
 */
export type Severity = "error" | "warning";

/** A problem in the document, located by a JSON-like path so agents can fix it directly. */
export interface Issue {
  path: string;
  message: string;
  severity: Severity;
}

export const error = (path: string, message: string): Issue => ({ path, message, severity: "error" });
export const warning = (path: string, message: string): Issue => ({ path, message, severity: "warning" });

export function formatIssue(issue: Issue): string {
  const located = issue.path ? `${issue.path}: ${issue.message}` : issue.message;
  return issue.severity === "warning" ? `warning: ${located}` : located;
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

/** Orders issues by document position: `blocks[2]` before `blocks[10]`. Stable for equal paths. */
export function byDocumentOrder(a: Issue, b: Issue): number {
  return a.path.localeCompare(b.path, "en", { numeric: true });
}

export function joinPath(base: string, segment: string | number): string {
  if (typeof segment === "number") return `${base}[${segment}]`;
  return base ? `${base}.${segment}` : segment;
}

export function zodIssues(error: z.ZodError, base: string): Issue[] {
  return error.issues.map((issue) => ({
    path: issue.path.reduce<string>((path, segment) => joinPath(path, typeof segment === "symbol" ? String(segment) : segment), base),
    message: issue.message,
    severity: "error",
  }));
}

/** Appends a "did you mean" hint when a close candidate exists. */
export function suggest(value: string, candidates: Iterable<string>): string {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(value.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  const threshold = Math.max(1, Math.floor(value.length / 4));
  return best !== undefined && bestDistance <= threshold ? ` (did you mean "${best}"?)` : "";
}

/** Optimal string alignment distance: Levenshtein plus adjacent transpositions, a common typo. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}
