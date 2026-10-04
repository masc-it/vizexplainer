import { z } from "zod";
import { LineSpec, SourceRef } from "../../document/schema.ts";
import { resolveLines } from "../../sources/line-anchor.ts";
import { html, raw, type Html } from "../../html.ts";
import { defineComponent } from "../define.ts";

const WHOLE_FILE_LIMIT = 120;

export const code = defineComponent({
  name: "code",
  description:
    "A syntax-highlighted snippet from a file (preferred: reference `file` + `lines` instead of copying code) or inline. Annotations attach numbered notes to line ranges.",
  props: z
    .object({
      source: SourceRef.optional(),
      entity: z.string().optional().describe("Show this entity's `source` instead of giving one here"),
      title: z.string().optional().describe("Defaults to the file path and line range"),
      highlight: z.array(LineSpec).optional().describe("Lines to emphasise: the file's line numbers, or { match } to find them by text"),
      annotations: z
        .array(
          z
            .object({
              lines: LineSpec,
              note: z.string().describe("Markdown"),
              entity: z.string().optional().describe("Entity this note is about"),
            })
            .strict(),
        )
        .optional(),
      maxLines: z.number().int().positive().default(28).describe("Visible lines before the snippet scrolls"),
    })
    .strict()
    .refine((props) => (props.source === undefined) !== (props.entity === undefined), "give exactly one of `source` or `entity`"),
  async render(props, ctx) {
    const entity = props.entity !== undefined ? ctx.entity(props.entity) : undefined;
    const source = props.source ?? entity?.source;
    if (source === undefined) {
      if (entity) ctx.issue(`entity "${entity.id}" has no source`);
      return "";
    }
    // Render once to learn which lines are shown, so text anchors and ranges can be checked against them.
    const plain = await ctx.code(source);
    const shown = plain.lines.map((text, index) => ({ line: plain.start + index, text }));
    const resolve = (spec: LineSpec, where: string) => {
      const resolved = resolveLines(spec, shown);
      if (!resolved.ok) {
        ctx.issue(`${where}: ${resolved.message}`);
        return undefined;
      }
      if (resolved.start < plain.start || resolved.end > plain.end) {
        ctx.issue(`${where} lines ${resolved.start}-${resolved.end} are outside the shown lines ${plain.start}-${plain.end}`);
        return undefined;
      }
      return resolved;
    };
    const highlight = (props.highlight ?? []).map((spec, index) => resolve(spec, `highlight[${index}]`)).filter((range) => range !== undefined);
    const annotations = (props.annotations ?? []).map((annotation, index) => ({ ...annotation, range: resolve(annotation.lines, `annotations[${index}]`) }));
    const rendered =
      highlight.length || annotations.length
        ? await ctx.code(source, {
            highlight: highlight.map((range) => [range.start, range.end] as [number, number]),
            markers: annotations.flatMap((annotation, index) => (annotation.range ? [{ line: annotation.range.start, label: String(index + 1) }] : [])),
          })
        : plain;
    const count = rendered.end - rendered.start + 1;
    if ("file" in source && source.lines === undefined && source.symbol === undefined && count > WHOLE_FILE_LIMIT) {
      ctx.warn(`shows all ${count} lines of "${source.file}"; pick the part that matters with "symbol" or "lines"`);
    }
    const range = rendered.start === rendered.end ? `${rendered.start}` : `${rendered.start}–${rendered.end}`;
    const location = rendered.file !== undefined ? `${rendered.file}:${range}` : undefined;
    const title = props.title ?? (rendered.symbol !== undefined && location ? `${rendered.symbol} · ${location}` : (location ?? entity?.label));

    // Each note goes inside the code, right after the last line it explains.
    const notes = annotations.flatMap((annotation) =>
      annotation.range
        ? [{
            after: annotation.range.end,
            html: html`<aside class="vx-code-note" data-lines="${annotation.range.start}-${annotation.range.end}"${annotation.entity !== undefined ? html` ${ctx.entityAttrs(annotation.entity)}` : ""}><div class="vx-prose">${ctx.markdown(annotation.note)}</div></aside>`,
          }]
        : [],
    );
    return html`<figure class="vx-code" style="--vx-max-lines: ${props.maxLines}" data-vx-code>
      <div class="vx-code-head">
        <span class="vx-code-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        ${title !== undefined && html`<span class="vx-code-title">${title}</span>`}
        <span class="vx-code-lang">${rendered.lang}</span>
        ${rendered.url !== undefined && html`<a class="vx-code-link" href="${rendered.url}" target="_blank" rel="noopener">View source ↗</a>`}
      </div>
      <div class="vx-code-body">${notes.length > 0 ? insertNotes(rendered.html, notes) : rendered.html}</div>
    </figure>`;
  },
  css: `
/* A note spans the visible width (not the longest line) and stays put when the code scrolls sideways. */
.vx-code-body:has(.vx-code-note) { container-type: inline-size; }
.vx-code-note { position: sticky; left: 0; box-sizing: border-box; width: 100cqw; margin: 0.35rem 0; padding: 0.5rem 1rem 0.55rem 3.4rem; white-space: normal; font: 0.9rem/1.5 var(--vx-sans); color: var(--vx-text); background: color-mix(in oklab, var(--vx-accent) 9%, var(--vx-code-bg)); border-block: 1px solid color-mix(in oklab, var(--vx-accent) 22%, transparent); }
/* The gutter's marker already numbers the note; its text lines up with the code (3.4rem in). */
`,
  script: `
document.querySelectorAll("[data-vx-code]").forEach((figure) => {
  // Highlighted lines below the visible area would otherwise go unnoticed.
  const body = figure.querySelector(".vx-code-body");
  const highlighted = body.querySelector(".vx-line-hl");
  if (highlighted && highlighted.offsetTop + highlighted.offsetHeight > body.clientHeight) body.scrollTop = Math.max(0, highlighted.offsetTop - body.clientHeight / 3);
  // Hovering a note spotlights the lines it explains; it sits right below them, so nothing needs scrolling.
  figure.querySelectorAll(".vx-code-note[data-lines]").forEach((note) => {
    const [start, end] = note.dataset.lines.split("-").map(Number);
    const lines = [...figure.querySelectorAll(".vx-code-body [data-line]")].filter((l) => +l.dataset.line >= start && +l.dataset.line <= end);
    note.addEventListener("mouseenter", () => { lines.forEach((l) => l.classList.add("vx-line-focus")); figure.classList.add("vx-has-focus"); });
    note.addEventListener("mouseleave", () => { lines.forEach((l) => l.classList.remove("vx-line-focus")); figure.classList.remove("vx-has-focus"); });
  });
});
`,
});

/**
 * Inserts notes into highlighted code after the line they follow. Shiki joins lines with newlines inside `<pre>`,
 * so a note replaces the newline's position after its line: no blank line appears around it.
 */
function insertNotes(markup: Html, notes: readonly { after: number; html: Html }[]): Html {
  const parts = /^([\s\S]*?<code>)([\s\S]*)(<\/code>[\s\S]*)$/.exec(markup.value);
  if (!parts) throw new Error("highlighted code has no <code> element");
  const lines = parts[2]!.split("\n");
  const body = lines
    .map((line, index) => {
      const number = Number(/ data-line="(\d+)"/.exec(line)?.[1]);
      const after = notes.filter((note) => note.after === number).map((note) => note.html.value).join("");
      const last = index === lines.length - 1;
      return after ? `${line}\n${after}` : last ? line : `${line}\n`;
    })
    .join("");
  return raw(`${parts[1]}${body}${parts[3]}`);
}
