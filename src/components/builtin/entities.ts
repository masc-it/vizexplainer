import { z } from "zod";
import type { ResolvedEntity } from "../../document/model.ts";
import { html, type Html } from "../../html.ts";
import { defineComponent } from "../define.ts";

const CardItem = z
  .object({
    entity: z.string().optional().describe("Entity to show; provides title, kind and text by default and makes the card clickable"),
    title: z.string().optional(),
    text: z.string().optional().describe("Markdown; defaults to the entity summary"),
    badge: z.string().optional().describe("Small label; defaults to the entity kind"),
  })
  .strict()
  .refine((item) => item.entity !== undefined || item.title !== undefined, "a card needs an entity or a title");

export const cards = defineComponent({
  name: "cards",
  description: "A grid of cards, typically one per entity (modules, services, concepts). Great for 'the main pieces' overviews.",
  props: z.object({ items: z.array(CardItem).min(1) }).strict(),
  render(props, ctx) {
    return html`<div class="vx-cards">
      ${props.items.map((item, index) => {
        const entity = item.entity !== undefined ? ctx.entity(item.entity) : undefined;
        const text = item.text ?? entity?.summary;
        const badge = item.badge ?? entity?.kind;
        // Cards without a kind or badge get varied accents instead of all being grey.
        const kind = entity?.kind ?? item.badge;
        const hue = kind !== undefined ? ctx.hueClass(kind) : `vx-hue-${(index % 8) + 1}`;
        return html`<div class="vx-card ${hue}"${entity ? html` ${ctx.entityAttrs(entity.id)} tabindex="0" role="button"` : ""}>
          ${badge !== undefined && html`<div class="vx-badge">${badge}</div>`}
          <div class="vx-card-title">${item.title ?? entity?.label}</div>
          ${text !== undefined && html`<div class="vx-card-text vx-prose">${ctx.markdown(text)}</div>`}
        </div>`;
      })}
    </div>`;
  },
  css: `
.vx-cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr)); }
.vx-card { position: relative; padding: 1rem 1.1rem 1.05rem; border-radius: var(--vx-radius); background: var(--vx-surface); border: 1px solid var(--vx-border); box-shadow: var(--vx-shadow-sm); overflow: hidden; transition: transform .15s, box-shadow .15s, border-color .15s; }
.vx-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--hue-fg); opacity: .85; }
.vx-card[data-entity] { cursor: pointer; }
.vx-card[data-entity]:hover, .vx-card.vx-linked { box-shadow: var(--vx-shadow); border-color: color-mix(in oklab, var(--hue-fg) 45%, var(--vx-border)); }
.vx-card-title { font-weight: 650; font-size: 1.02rem; margin-top: 0.35rem; }
.vx-card-text { color: var(--vx-muted); font-size: 0.92rem; margin-top: 0.3rem; }
`,
});

export const tree = defineComponent({
  name: "tree",
  description: "A hierarchy built from entity `parent` links, e.g. a folder/module map. Each row shows the entity and its summary.",
  props: z
    .object({
      roots: z.array(z.string()).optional().describe("Entities to start from; defaults to all top-level entities"),
      depth: z.number().int().positive().optional().describe("Maximum depth to show; unlimited when omitted"),
      summaries: z.boolean().default(true),
      collapsedBelow: z.number().int().nonnegative().default(2).describe("Levels at or below this depth start collapsed"),
    })
    .strict(),
  render(props, ctx) {
    const roots = props.roots
      ? props.roots.map((id) => ctx.entity(id)).filter((entity) => entity !== undefined)
      : ctx.childrenOf(undefined);
    const row = (entity: ResolvedEntity, level: number): Html => {
      const children = props.depth === undefined || level < props.depth ? ctx.childrenOf(entity.id) : [];
      const label = html`<span class="vx-tree-row">
        <span class="vx-tree-dot ${ctx.hueClass(entity.kind)}"></span>
        <span class="vx-tree-label ${ctx.hueClass(entity.kind)}" ${ctx.entityAttrs(entity.id)} tabindex="0" role="button">${entity.label}</span>
        ${props.summaries && entity.summary !== undefined && html`<span class="vx-tree-summary">${ctx.inlineMarkdown(firstLine(entity.summary))}</span>`}
      </span>`;
      if (!children.length) return html`<li class="vx-tree-leaf">${label}</li>`;
      return html`<li><details${level < props.collapsedBelow ? html` open` : ""}><summary>${label}</summary>
        <ul>${children.map((child) => row(child, level + 1))}</ul></details></li>`;
    };
    return html`<div class="vx-tree"><ul>${roots.map((entity) => row(entity, 1))}</ul></div>`;
  },
  css: `
.vx-tree { padding: 0.75rem 1rem; border: 1px solid var(--vx-border); border-radius: var(--vx-radius); background: var(--vx-surface); font-size: 0.93rem; overflow-x: auto; }
.vx-tree ul { list-style: none; margin: 0; padding: 0; }
.vx-tree ul ul { margin-left: 0.55rem; padding-left: 1rem; border-left: 1px dashed var(--vx-border-strong); }
.vx-tree li { margin: 0; }
.vx-tree summary { list-style: none; cursor: pointer; position: relative; }
.vx-tree summary::-webkit-details-marker { display: none; }
.vx-tree summary::before { content: "▸"; position: absolute; left: -0.95rem; top: 0.3rem; font-size: 0.75rem; color: var(--vx-faint); transition: transform .15s; }
.vx-tree details[open] > summary::before { transform: rotate(90deg); }
.vx-tree > ul > li > details > summary::before { left: -0.9rem; }
.vx-tree > ul { padding-left: 0.9rem; }
.vx-tree-row { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.22rem 0; min-width: 0; }
.vx-tree-dot { flex: none; width: 0.55rem; height: 0.55rem; border-radius: 3px; background: var(--hue-fg); transform: translateY(-1px); }
.vx-tree-label { font-family: var(--vx-mono); font-size: 0.86rem; font-weight: 550; cursor: pointer; border-radius: 4px; padding: 0 0.2rem; white-space: nowrap; }
.vx-tree-label:hover, .vx-tree-label.vx-linked { background: var(--hue-bg); color: var(--hue-fg); }
.vx-tree-summary { color: var(--vx-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
`,
});

function firstLine(text: string): string {
  return text.split("\n")[0] ?? "";
}
