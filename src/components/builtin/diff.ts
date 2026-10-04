import { z } from "zod";
import { SourceRef } from "../../document/schema.ts";
import { html, raw, type Html } from "../../html.ts";
import { languageFromFile } from "../../sources/language.ts";
import { diffLines, parsePatch, type DiffRow } from "../../sources/line-diff.ts";
import { defineComponent, type RenderContext } from "../define.ts";

const Props = z
  .object({
    before: SourceRef.optional().describe("Old version; a file source can read a git revision with `ref`"),
    after: SourceRef.optional().describe("New version"),
    patch: z.string().optional().describe("Unified diff text, e.g. `git diff` output, instead of before/after"),
    title: z.string().optional(),
    lang: z.string().optional().describe("Language for highlighting; inferred from file names when omitted"),
    context: z.number().int().nonnegative().default(3).describe("Unchanged lines kept around each change"),
    caption: z.string().optional(),
  })
  .strict()
  .refine((props) => (props.patch !== undefined) !== (props.before !== undefined || props.after !== undefined), "give `before` and `after`, or `patch`")
  .refine((props) => props.patch !== undefined || (props.before !== undefined && props.after !== undefined), "give both `before` and `after`");

interface Side {
  /** Highlighted line markup, one per line. */
  html: string[];
  start: number;
  /** Explicit line numbers, when lines are not consecutive (patch hunks). */
  numbers?: number[];
}

interface Section {
  title?: string;
  rows: DiffRow[];
  old: Side;
  new: Side;
  /** Separate hunks of a patch are drawn with a gap between them. */
  breaks: Set<number>;
}

export const diff = defineComponent({
  name: "diff",
  description:
    "Before/after code with added and removed lines, from two sources (a file `ref` reads a git revision) or a unified patch. For changes, migrations and pull-request explainers.",
  props: Props,
  async render(props, ctx) {
    const sections = props.patch !== undefined ? await patchSections(props.patch, props.lang, ctx) : [await sourceSection(props, ctx)];
    if (sections.length === 0) {
      ctx.issue("the patch contains no hunks");
      return "";
    }
    const added = sections.reduce((n, s) => n + s.rows.filter((row) => row.op === "add").length, 0);
    const removed = sections.reduce((n, s) => n + s.rows.filter((row) => row.op === "del").length, 0);
    return html`<figure class="vx-figure">
      <div class="vx-code vx-diff">
        ${sections.map(
          (section, index) => html`<div class="vx-code-head">
              <span class="vx-code-title">${(index === 0 ? props.title : undefined) ?? section.title ?? "Changes"}</span>
              ${index === 0 && html`<span class="vx-diff-stat"><b class="vx-diff-plus">+${added}</b> <b class="vx-diff-minus">−${removed}</b></span>`}
            </div>
            <div class="vx-code-body vx-diff-body"><pre class="shiki"><code>${renderRows(section, props.context)}</code></pre></div>`,
        )}
      </div>
      ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
    </figure>`;
  },
  css: `
.vx-diff-stat { margin-left: auto; font: 600 0.78rem var(--vx-mono); }
.vx-diff-plus { color: var(--vx-green); } .vx-diff-minus { color: var(--vx-red); }
.vx-diff .vx-code-body + .vx-code-head { border-top: 1px solid var(--vx-code-border); }
.vx-diff-row { display: flex; min-width: max-content; }
.vx-diff-row .line { width: auto; flex: 1; padding-right: 1.5rem; }
.vx-diff-row .line::before { display: none; }
.vx-diff-no { flex: none; width: 3rem; padding-right: 0.6rem; text-align: right; color: var(--vx-faint); user-select: none; opacity: .75; }
.vx-diff-sign { flex: none; width: 1.4rem; text-align: center; user-select: none; color: var(--vx-faint); }
.vx-diff-add { background: color-mix(in oklab, var(--vx-green) 11%, transparent); }
.vx-diff-add .vx-diff-sign { color: var(--vx-green); font-weight: 700; }
.vx-diff-del { background: color-mix(in oklab, var(--vx-red) 10%, transparent); }
.vx-diff-del .vx-diff-sign { color: var(--vx-red); font-weight: 700; }
.vx-diff-del .line { opacity: .85; }
.vx-diff-gap { padding: 0.15rem 0 0.15rem 7.2rem; color: var(--vx-faint); background: var(--vx-surface-2); font-size: 0.78rem; user-select: none; }
`,
});

async function sourceSection(props: z.infer<typeof Props>, ctx: RenderContext): Promise<Section> {
  const [before, after] = await Promise.all([
    ctx.code(withLang(props.before!, props.lang), { dedent: false }),
    ctx.code(withLang(props.after!, props.lang), { dedent: false }),
  ]);
  const describe = (source: SourceRef) => ("file" in source ? `${source.file}${source.ref !== undefined ? ` @ ${source.ref}` : ""}` : undefined);
  const beforeName = describe(props.before!);
  const afterName = describe(props.after!);
  return {
    title: beforeName === afterName ? beforeName : [beforeName, afterName].filter(Boolean).join(" → ") || undefined,
    rows: diffLines(before.lines, after.lines),
    old: { html: splitLines(before.html), start: before.start },
    new: { html: splitLines(after.html), start: after.start },
    breaks: new Set(),
  };
}

async function patchSections(patch: string, lang: string | undefined, ctx: RenderContext): Promise<Section[]> {
  return Promise.all(
    parsePatch(patch).map(async (file) => {
      const name = file.newPath ?? file.oldPath;
      const language = lang ?? (name !== undefined ? languageFromFile(name) : "text");
      const rows: DiffRow[] = [];
      // Line numbers are per hunk, so each hunk is highlighted separately and stitched together.
      const old: Required<Side> = { html: [], start: 1, numbers: [] };
      const neu: Required<Side> = { html: [], start: 1, numbers: [] };
      const breaks = new Set<number>();
      for (const hunk of file.hunks) {
        const [before, after] = await Promise.all([
          ctx.code({ code: hunk.oldLines.join("\n"), lang: language, startLine: hunk.oldStart }, { dedent: false }),
          ctx.code({ code: hunk.newLines.join("\n"), lang: language, startLine: hunk.newStart }, { dedent: false }),
        ]);
        if (rows.length) breaks.add(rows.length);
        const oldOffset = old.html.length;
        const newOffset = neu.html.length;
        old.html.push(...splitLines(before.html).slice(0, hunk.oldLines.length));
        neu.html.push(...splitLines(after.html).slice(0, hunk.newLines.length));
        hunk.oldLines.forEach((_, i) => old.numbers.push(hunk.oldStart + i));
        hunk.newLines.forEach((_, i) => neu.numbers.push(hunk.newStart + i));
        for (const row of hunk.rows) {
          rows.push({
            op: row.op,
            oldIndex: row.oldIndex !== undefined ? oldOffset + row.oldIndex : undefined,
            newIndex: row.newIndex !== undefined ? newOffset + row.newIndex : undefined,
          });
        }
      }
      return { title: name, rows, old, new: neu, breaks };
    }),
  );
}

function withLang(source: SourceRef, lang: string | undefined): SourceRef {
  return lang !== undefined && source.lang === undefined ? { ...source, lang } : source;
}

/** Shiki emits one `<span class="line">` per line, joined by newlines inside `<code>`. */
function splitLines(markup: Html): string[] {
  const inner = /<code>([\s\S]*)<\/code>/.exec(markup.value)?.[1] ?? "";
  return inner.split("\n");
}

function renderRows(section: Section, context: number): Html {
  const { rows } = section;
  const near = new Array<boolean>(rows.length).fill(false);
  rows.forEach((row, index) => {
    if (row.op === "same") return;
    for (let k = Math.max(0, index - context); k <= Math.min(rows.length - 1, index + context); k++) near[k] = true;
  });
  const number = (side: Side, index: number | undefined) =>
    index === undefined ? "" : String(side.numbers?.[index] ?? side.start + index);

  const out: Html[] = [];
  let hidden = 0;
  const flush = () => {
    if (hidden > 0) out.push(html`<div class="vx-diff-gap">⋯ ${hidden} unchanged line${hidden === 1 ? "" : "s"}</div>`);
    hidden = 0;
  };
  rows.forEach((row, index) => {
    if (section.breaks.has(index)) {
      flush();
      out.push(html`<div class="vx-diff-gap">⋯</div>`);
    }
    if (!near[index] && row.op === "same") {
      hidden++;
      return;
    }
    flush();
    // Steps spotlight lines by their new numbers, so only the new side keeps `data-line`.
    const markup =
      row.op === "del"
        ? (section.old.html[row.oldIndex!] ?? "").replace(/ data-line="(\d+)"/, ' data-old-line="$1"')
        : (section.new.html[row.newIndex!] ?? "");
    const sign = row.op === "add" ? "+" : row.op === "del" ? "−" : "";
    out.push(
      html`<div class="vx-diff-row vx-diff-${row.op}"><span class="vx-diff-no">${number(section.old, row.oldIndex)}</span><span class="vx-diff-no">${number(section.new, row.newIndex)}</span><span class="vx-diff-sign">${sign}</span>${raw(markup)}</div>`,
    );
  });
  flush();
  return html`${out}`;
}
