import { lineBounds, type LineSpec } from "../document/schema.ts";

export interface ShownLine {
  line: number;
  text: string;
}

export type ResolvedLines = { ok: true; start: number; end: number } | { ok: false; message: string };

/**
 * Turns a line number, range or `{ match }` anchor into a range within the shown lines.
 * Anchors find their line by text, so they follow code that moves and fail loudly when it changes.
 */
export function resolveLines(spec: LineSpec, shown: readonly ShownLine[]): ResolvedLines {
  if (typeof spec === "number" || Array.isArray(spec)) return { ok: true, ...lineBounds(spec) };
  const hits = shown.filter((candidate) => candidate.text.includes(spec.match));
  if (hits.length === 0) return { ok: false, message: `no shown line contains "${spec.match}"; the code may have changed` };
  if (hits.length > 1) {
    return { ok: false, message: `"${spec.match}" appears on ${hits.length} lines (${hits.map((hit) => hit.line).join(", ")}); use a longer, unique piece of text` };
  }
  const start = hits[0]!.line;
  return { ok: true, start, end: start + (spec.lines ?? 1) - 1 };
}

/** Recovers line numbers and plain text from highlighted code markup (`<span class="line" data-line="N">`). */
export function shownLinesFromHtml(markup: string): ShownLine[] {
  const lines: ShownLine[] = [];
  // Code annotations sit inside <code> after their lines; their text is not code.
  markup = markup.replace(/<aside class="vx-code-note"[\s\S]*?<\/aside>/g, "");
  const pattern = /<span class="line[^"]*" data-line="(\d+)"[^>]*>([\s\S]*?)(?=<span class="line[^"]*" data-line="|<\/code>)/g;
  for (const match of markup.matchAll(pattern)) {
    lines.push({ line: Number(match[1]), text: decode(match[2]!.replace(/<[^>]*>/g, "")) });
  }
  return lines;
}

function decode(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}
