import { z } from "zod";
import { html, raw } from "../../html.ts";
import { defineComponent } from "../define.ts";

export const prose = defineComponent({
  name: "prose",
  description: "Markdown text. Reference entities inline with [[entity-id]] or [[entity-id|custom text]] to make them hoverable and clickable.",
  props: z.object({ text: z.string() }).strict(),
  render: (props, ctx) => html`<div class="vx-prose vx-narrow">${ctx.markdown(props.text)}</div>`,
});

const ICONS = {
  note: '<path d="M12 8h.01M11 12h1v4h1"/><circle cx="12" cy="12" r="9"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  warning: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  key: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>',
} as const;

export const callout = defineComponent({
  name: "callout",
  description:
    "A highlighted aside. Tones: note (context), tip (helpful advice), warning (pitfalls), key (the one idea to remember).",
  props: z
    .object({
      tone: z.enum(["note", "tip", "warning", "key"]).default("note"),
      title: z.string().optional(),
      text: z.string().describe("Markdown"),
    })
    .strict(),
  render: (props, ctx) => html`<aside class="vx-callout vx-callout--${props.tone} vx-narrow">
    <svg class="vx-callout-icon" viewBox="0 0 24 24" aria-hidden="true">${raw(ICONS[props.tone])}</svg>
    <div class="vx-callout-body">
      ${props.title !== undefined && html`<div class="vx-callout-title">${ctx.inlineMarkdown(props.title)}</div>`}
      <div class="vx-prose">${ctx.markdown(props.text)}</div>
    </div>
  </aside>`,
  css: `
.vx-callout { --c: var(--vx-accent); display: flex; gap: 0.85rem; padding: 1rem 1.1rem; border-radius: var(--vx-radius); background: color-mix(in oklab, var(--c) 8%, var(--vx-surface)); border: 1px solid color-mix(in oklab, var(--c) 25%, var(--vx-border)); }
.vx-callout--tip { --c: var(--vx-green); } .vx-callout--warning { --c: var(--vx-amber); } .vx-callout--key { --c: var(--vx-accent-2); }
.vx-callout-icon { flex: none; width: 1.3rem; height: 1.3rem; margin-top: 0.1rem; fill: none; stroke: var(--c); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.vx-callout-title { font-weight: 650; margin-bottom: 0.25rem; }
.vx-callout-body { min-width: 0; }
`,
});

export const table = defineComponent({
  name: "table",
  description: "A table with inline-markdown cells. Good for comparisons, option lists and file/responsibility maps.",
  props: z
    .object({
      columns: z.array(z.string()).min(1),
      rows: z.array(z.array(z.string())),
      caption: z.string().optional(),
    })
    .strict()
    .superRefine((props, ctx) => {
      props.rows.forEach((row, index) => {
        if (row.length !== props.columns.length) {
          ctx.addIssue({ code: "custom", path: ["rows", index], message: `row has ${row.length} cells but there are ${props.columns.length} columns` });
        }
      });
    }),
  render: (props, ctx) => html`<figure class="vx-figure">
    <div class="vx-table-wrap"><table class="vx-table">
      <thead><tr>${props.columns.map((column) => html`<th>${ctx.inlineMarkdown(column)}</th>`)}</tr></thead>
      <tbody>${props.rows.map((row) => html`<tr>${row.map((cell) => html`<td>${ctx.inlineMarkdown(cell)}</td>`)}</tr>`)}</tbody>
    </table></div>
    ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
  </figure>`,
  css: `
.vx-table-wrap { overflow-x: auto; border: 1px solid var(--vx-border); border-radius: var(--vx-radius); background: var(--vx-surface); }
.vx-table { width: 100%; border-collapse: collapse; font-size: 0.93rem; }
.vx-table th { text-align: left; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vx-muted); background: var(--vx-surface-2); }
.vx-table th, .vx-table td { padding: 0.65rem 0.9rem; border-bottom: 1px solid var(--vx-border); vertical-align: top; }
.vx-table tr:last-child td { border-bottom: 0; }
`,
});

export const stats = defineComponent({
  name: "stats",
  description: "A row of key figures (e.g. '12 modules', '3 entry points') for a quick sense of scale.",
  props: z
    .object({
      items: z
        .array(z.object({ value: z.union([z.string(), z.number()]), label: z.string(), hint: z.string().optional() }).strict())
        .min(1),
    })
    .strict(),
  render: (props, ctx) => html`<div class="vx-stats">
    ${props.items.map(
      (item) => html`<div class="vx-stat">
        <div class="vx-stat-value">${item.value}</div>
        <div class="vx-stat-label">${ctx.inlineMarkdown(item.label)}</div>
        ${item.hint !== undefined && html`<div class="vx-stat-hint">${ctx.inlineMarkdown(item.hint)}</div>`}
      </div>`,
    )}
  </div>`,
  css: `
.vx-stats { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.vx-stat { padding: 1rem 1.1rem; border-radius: var(--vx-radius); background: var(--vx-surface); border: 1px solid var(--vx-border); }
.vx-stat-value { font-size: 1.9rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; color: var(--vx-text); }
.vx-stat-label { font-weight: 600; margin-top: 0.3rem; }
.vx-stat-hint { color: var(--vx-muted); font-size: 0.85rem; margin-top: 0.15rem; }
`,
});
