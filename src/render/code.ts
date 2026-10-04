import { readFile } from "node:fs/promises";
import path from "node:path";
import { bundledLanguages, createHighlighter, type Highlighter, type ShikiTransformer } from "shiki";
import type { CodeOptions, RenderedCode } from "../components/define.ts";
import { lineBounds, type SourceRef } from "../document/schema.ts";
import { readAtRevision } from "../git.ts";
import { raw } from "../html.ts";
import { languageFromFile } from "../sources/language.ts";
import { findSymbol } from "../sources/symbols.ts";

export const CODE_THEMES = { light: "github-light", dark: "github-dark" } as const;

export type CodeResult = { ok: true; code: RenderedCode } | { ok: false; message: string };

export interface CodeRenderer {
  render(source: SourceRef, options?: CodeOptions): Promise<CodeResult>;
  /** Absolute paths of every file read so far. */
  filesRead(): string[];
}

export function createCodeRenderer(config: { root: string; repository?: { url: string; ref: string } }): CodeRenderer {
  let highlighter: Promise<Highlighter> | undefined;
  const files = new Map<string, Promise<string | undefined>>();

  const getHighlighter = () =>
    (highlighter ??= createHighlighter({ themes: [CODE_THEMES.light, CODE_THEMES.dark], langs: [] }));

  const revisions = new Map<string, Promise<string | undefined>>();
  const readSource = (file: string, ref: string | undefined) => {
    if (ref !== undefined) {
      const key = `${ref}\0${file}`;
      if (!revisions.has(key)) revisions.set(key, readAtRevision(config.root, ref, file));
      return revisions.get(key)!;
    }
    const absolute = path.resolve(config.root, file);
    if (!files.has(absolute)) files.set(absolute, readFile(absolute, "utf8").catch(() => undefined));
    return files.get(absolute)!;
  };

  return {
    async render(source, options = {}) {
      let text: string;
      let start: number;
      let file: string | undefined;
      if ("file" in source) {
        const content = await readSource(source.file, source.ref);
        if (content === undefined) {
          const where = source.ref !== undefined ? ` at git revision "${source.ref}"` : "";
          return { ok: false, message: `cannot read file "${source.file}"${where} (relative to ${config.root})` };
        }
        const normalized = content.replace(/\r\n/g, "\n").replace(/\n$/, "");
        const lines = normalized.split("\n");
        let bounds = source.lines ? lineBounds(source.lines) : { start: 1, end: lines.length };
        if (source.symbol !== undefined) {
          const found = findSymbol(normalized, source.symbol, source.lang ?? languageFromFile(source.file));
          if (!found.ok) return { ok: false, message: `${found.message} in "${source.file}" (run \`vizx symbols ${source.file}\` to list declarations)` };
          bounds = { start: found.symbol.start, end: found.symbol.end };
        }
        if (bounds.end > lines.length) {
          return { ok: false, message: `lines ${bounds.start}-${bounds.end} exceed "${source.file}", which has ${lines.length} lines` };
        }
        const shown = lines.slice(bounds.start - 1, bounds.end);
        text = (options.dedent === false ? shown : dedent(shown)).join("\n");
        start = bounds.start;
        file = source.file;
      } else {
        text = source.code.replace(/\n$/, "");
        start = source.startLine ?? 1;
      }

      const end = start + text.split("\n").length - 1;
      const lang = await loadLanguage(await getHighlighter(), source.lang ?? (file ? languageFromFile(file) : "text"));
      const markup = (await getHighlighter()).codeToHtml(text, {
        lang,
        themes: CODE_THEMES,
        defaultColor: false,
        transformers: [lineTransformer(start, options)],
      });
      const ref = "file" in source ? (source.ref ?? config.repository?.ref) : undefined;
      const url =
        config.repository && file && ref !== undefined
          ? `${config.repository.url.replace(/\/$/, "")}/blob/${ref}/${file}#L${start}-L${end}`
          : undefined;
      const symbol = "file" in source ? source.symbol : undefined;
      return { ok: true, code: { html: raw(markup), file, symbol, start, end, lines: text.split("\n"), lang, url } };
    },
    filesRead: () => [...files.keys()],
  };
}

function lineTransformer(start: number, options: CodeOptions): ShikiTransformer {
  const highlighted = (options.highlight ?? []).map(lineBounds);
  return {
    line(node, index) {
      const line = start + index - 1;
      node.properties["data-line"] = String(line);
      if (highlighted.some((range) => line >= range.start && line <= range.end)) this.addClassToHast(node, "vx-line-hl");
      for (const marker of options.markers ?? []) {
        if (marker.line !== line) continue;
        node.children.unshift({
          type: "element",
          tagName: "span",
          properties: { class: "vx-marker", "aria-label": `note ${marker.label}` },
          children: [{ type: "text", value: marker.label }],
        });
      }
    },
  };
}

async function loadLanguage(highlighter: Highlighter, lang: string): Promise<string> {
  const id = lang.toLowerCase();
  if (!(id in bundledLanguages)) return "text";
  if (!highlighter.getLoadedLanguages().includes(id)) await highlighter.loadLanguage(id as keyof typeof bundledLanguages);
  return id;
}

function dedent(lines: string[]): string[] {
  const indents = lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = indents.length ? Math.min(...indents) : 0;
  return common ? lines.map((line) => line.slice(common)) : lines;
}
