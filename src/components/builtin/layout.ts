import { z } from "zod";
import { Block } from "../../document/schema.ts";
import { html, raw } from "../../html.ts";
import { defineComponent } from "../define.ts";

export const Blocks = z.array(Block).describe("Nested blocks");

export const section = defineComponent({
  name: "section",
  description:
    "A titled section. Top-level sections build the table of contents; nest sections for sub-topics. The main way to give an explainer its narrative arc.",
  props: z
    .object({
      title: z.string().min(1),
      summary: z.string().optional().describe("Lead paragraph shown under the title (markdown)"),
      children: Blocks,
    })
    .strict(),
  outline: (props) => props.title,
  async render(props, ctx) {
    const tag = raw(`h${Math.min(ctx.depth + 1, 6)}`);
    return html`<section class="vx-section vx-depth-${ctx.depth}">
      <header class="vx-section-head vx-narrow">
        <${tag} class="vx-heading">${props.title}</${tag}>
        ${props.summary !== undefined && html`<div class="vx-lead">${ctx.markdown(props.summary)}</div>`}
      </header>
      <div class="vx-stack vx-flow">${await ctx.renderBlocks(props.children, "children")}</div>
    </section>`;
  },
  css: `
.vx-section { display: flex; flex-direction: column; gap: 1rem; }
.vx-section.vx-depth-1 { padding-top: 2.5rem; }
.vx-section-head { display: flex; flex-direction: column; gap: 1rem; }
.vx-section.vx-depth-1 > .vx-section-head > .vx-heading { font-size: 1.85rem; letter-spacing: -0.025em; }
.vx-section-head > .vx-heading { margin: 0; font-size: 1.3rem; letter-spacing: -0.015em; line-height: 1.25; text-wrap: balance; }
.vx-lead { color: var(--vx-muted); font-size: 1.08rem; max-width: var(--vx-measure); text-wrap: pretty; }
.vx-lead > :first-child { margin-top: 0; } .vx-lead > :last-child { margin-bottom: 0; }
`,
});

export const columns = defineComponent({
  name: "columns",
  description: "Places child blocks side by side, wrapping to one column on narrow screens. Good for comparisons or pairing a diagram with prose.",
  props: z
    .object({
      children: Blocks.min(2),
      minWidth: z.number().int().positive().default(260).describe("Minimum column width in px before wrapping"),
    })
    .strict(),
  async render(props, ctx) {
    return html`<div class="vx-columns" style="--vx-col-min: ${props.minWidth}px">${await ctx.renderBlocks(props.children, "children")}</div>`;
  },
  css: `
.vx-columns { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, var(--vx-col-min)), 1fr)); align-items: start; }
.vx-columns > * { min-width: 0; }
`,
});

export const tabs = defineComponent({
  name: "tabs",
  description: "Alternative views of the same topic, one visible at a time (e.g. 'Simple' vs 'Technical', or one tab per language).",
  props: z
    .object({
      tabs: z.array(z.object({ label: z.string().min(1), children: Blocks }).strict()).min(2),
    })
    .strict(),
  async render(props, ctx) {
    const id = ctx.uid("tabs");
    const panels = await Promise.all(props.tabs.map((tab, index) => ctx.renderBlocks(tab.children, `tabs[${index}].children`)));
    return html`<div class="vx-tabs" data-vx-tabs>
      <div class="vx-tablist" role="tablist">
        ${props.tabs.map(
          (tab, index) =>
            html`<button type="button" role="tab" id="${id}-t${index}" aria-controls="${id}-p${index}" aria-selected="${index === 0 ? "true" : "false"}" tabindex="${index === 0 ? "0" : "-1"}">${tab.label}</button>`,
        )}
      </div>
      ${panels.map(
        (panel, index) =>
          html`<div class="vx-tabpanel vx-stack" role="tabpanel" id="${id}-p${index}" aria-labelledby="${id}-t${index}"${index === 0 ? "" : raw(" hidden")}>${panel}</div>`,
      )}
    </div>`;
  },
  css: `
.vx-tablist { display: inline-flex; gap: 2px; padding: 3px; border-radius: 10px; background: var(--vx-surface-2); border: 1px solid var(--vx-border); margin-bottom: 1rem; flex-wrap: wrap; }
.vx-tablist [role=tab] { font: inherit; font-size: 0.9rem; font-weight: 550; padding: 0.4rem 0.9rem; border: 0; border-radius: 7px; background: transparent; color: var(--vx-muted); cursor: pointer; }
.vx-tablist [role=tab]:hover { color: var(--vx-text); }
.vx-tablist [role=tab][aria-selected=true] { background: var(--vx-surface); color: var(--vx-text); box-shadow: var(--vx-shadow-sm); }
`,
  script: `
document.querySelectorAll("[data-vx-tabs]").forEach((root) => {
  const tabs = [...root.querySelectorAll(":scope > .vx-tablist > [role=tab]")];
  const select = (tab) => tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
  });
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { const next = tabs[(i + d + tabs.length) % tabs.length]; select(next); next.focus(); }
    });
  });
});
`,
});

export const details = defineComponent({
  name: "details",
  description: "A collapsible 'go deeper' block. Keep the main path simple and tuck technical depth or edge cases in here.",
  props: z
    .object({
      title: z.string().min(1),
      open: z.boolean().default(false),
      children: Blocks,
    })
    .strict(),
  async render(props, ctx) {
    return html`<details class="vx-details"${props.open ? raw(" open") : ""}>
      <summary><span class="vx-details-icon" aria-hidden="true"></span>${ctx.inlineMarkdown(props.title)}</summary>
      <div class="vx-details-body vx-stack">${await ctx.renderBlocks(props.children, "children")}</div>
    </details>`;
  },
  css: `
.vx-details { border: 1px solid var(--vx-border); border-radius: var(--vx-radius); background: var(--vx-surface); }
.vx-details > summary { list-style: none; cursor: pointer; padding: 0.8rem 1rem; font-weight: 600; display: flex; align-items: center; gap: 0.6rem; }
.vx-details > summary::-webkit-details-marker { display: none; }
.vx-details > summary:hover { color: var(--vx-accent); }
.vx-details-icon { width: 1.25rem; height: 1.25rem; flex: none; border-radius: 6px; background: var(--vx-accent-soft); position: relative; }
.vx-details-icon::before, .vx-details-icon::after { content: ""; position: absolute; left: 50%; top: 50%; width: 9px; height: 2px; border-radius: 2px; background: var(--vx-accent); transform: translate(-50%, -50%); transition: transform .2s; }
.vx-details-icon::after { transform: translate(-50%, -50%) rotate(90deg); }
.vx-details[open] .vx-details-icon::after { transform: translate(-50%, -50%) rotate(0deg); }
.vx-details-body { padding: 0 1rem 1rem; }
`,
});
