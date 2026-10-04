import { z } from "zod";
import { html } from "../../html.ts";
import { defineComponent } from "../define.ts";

const Item = z
  .object({
    when: z.string().optional().describe("Small label above the title: a date, version, phase or status, e.g. `2023`, `v2.0`, `On startup`"),
    title: z.string().min(1),
    text: z.string().optional().describe("Markdown"),
    entity: z.string().optional().describe("Entity this item is about; makes the title interactive"),
    tone: z.enum(["default", "key", "success", "warning"]).default("default"),
  })
  .strict();

/** Beyond this many items an `across` timeline's columns get too narrow to read. */
const ACROSS_ITEMS = 6;

export const timeline = defineComponent({
  name: "timeline",
  description:
    "Items in order, joined by a line: history, a roadmap, a lifecycle, a pipeline or a numbered procedure. `layout: \"across\"` lays up to 6 short items side by side. Use `steps` instead when the reader should follow along in a diagram or code.",
  props: z
    .object({
      items: z.array(Item).min(1),
      layout: z.enum(["vertical", "across"]).default("vertical").describe("`across` puts items side by side, falling back to vertical on narrow screens"),
      numbered: z.boolean().default(false).describe("Number the markers, for procedures and pipelines"),
      caption: z.string().optional(),
    })
    .strict(),
  render(props, ctx) {
    if (props.layout === "across" && props.items.length > ACROSS_ITEMS) {
      ctx.warn(`lays ${props.items.length} items across; beyond ${ACROSS_ITEMS} the columns get too narrow. Use the vertical layout or fewer items`);
    }
    // Vertical timelines read like text and sit in the reading column; across ones are figures and use the page width.
    return html`<figure class="vx-figure vx-timeline-figure${props.layout === "vertical" ? " vx-narrow" : ""}">
      <ol class="vx-timeline vx-timeline--${props.layout}${props.numbered ? " vx-timeline--numbered" : ""}">
        ${props.items.map(
          (item, index) => html`<li class="vx-timeline-item vx-tone-${item.tone}">
            <span class="vx-timeline-marker" aria-hidden="true">${props.numbered ? index + 1 : ""}</span>
            <div class="vx-timeline-body">
              ${item.when !== undefined && html`<div class="vx-timeline-when">${item.when}</div>`}
              <div class="vx-timeline-title">${item.entity !== undefined ? ctx.ref(item.entity, item.title) : item.title}</div>
              ${item.text !== undefined && html`<div class="vx-prose vx-timeline-text">${ctx.markdown(item.text)}</div>`}
            </div>
          </li>`,
        )}
      </ol>
      ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
    </figure>`;
  },
  css: `
.vx-timeline-figure { container-type: inline-size; }
.vx-timeline { --m: 0.95rem; --gap: 1.5rem; list-style: none; margin: 0; padding: 0; display: grid; gap: var(--gap); }
.vx-timeline--numbered { --m: 1.75rem; }
.vx-timeline-item { --c: var(--vx-accent); position: relative; display: grid; grid-template-columns: var(--m) minmax(0, 1fr); column-gap: 0.85rem; align-items: start; align-content: start; }
.vx-tone-key { --c: var(--vx-accent-2); } .vx-tone-success { --c: var(--vx-green); } .vx-tone-warning { --c: var(--vx-amber); }
.vx-timeline-marker { position: relative; z-index: 1; width: var(--m); height: var(--m); margin-top: 0.3rem; border-radius: 50%; display: grid; place-items: center; background: var(--vx-bg); border: 3px solid var(--c); font: 700 0.8rem/1 var(--vx-sans); color: var(--c); }
.vx-timeline--numbered .vx-timeline-marker { margin-top: 0; border-width: 1.5px; background: color-mix(in oklab, var(--c) 12%, var(--vx-bg)); }
.vx-tone-key .vx-timeline-marker { background: var(--c); color: var(--vx-on-accent); }
/* The line runs from each marker to the next one. */
.vx-timeline-item:not(:last-child)::before { content: ""; position: absolute; left: calc(var(--m) / 2 - 1px); top: 0.3rem; bottom: calc(-1 * var(--gap)); width: 2px; background: var(--vx-border-strong); }
.vx-timeline--numbered .vx-timeline-item:not(:last-child)::before { top: 0; }
.vx-timeline-when { font: 700 0.72rem var(--vx-sans); letter-spacing: .07em; text-transform: uppercase; color: var(--c); }
.vx-timeline-title { font-weight: 650; font-size: 1.04rem; margin-top: 0.1rem; }
.vx-timeline--numbered .vx-timeline-title { margin-top: 0.15rem; }
.vx-timeline-text { color: var(--vx-muted); margin-top: 0.25rem; }
/* Across: markers on one horizontal line, each item's text underneath. Too narrow for that, it stays vertical. */
@container (min-width: 640px) {
  .vx-timeline--across { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
  .vx-timeline--across .vx-timeline-item { grid-template-columns: minmax(0, 1fr); row-gap: 0.7rem; }
  .vx-timeline--across .vx-timeline-marker { margin-top: 0; }
  .vx-timeline--across .vx-timeline-item:not(:last-child)::before { left: var(--m); right: calc(-1 * var(--gap)); top: calc(var(--m) / 2 - 1px); bottom: auto; width: auto; height: 2px; }
  .vx-timeline--across .vx-timeline-text { font-size: 0.92rem; }
}
`,
});
