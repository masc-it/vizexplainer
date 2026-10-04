import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import { z } from "zod";
import type { ResolvedEntity } from "../../document/model.ts";
import { html, raw, type Html } from "../../html.ts";
import { defineComponent, type RenderContext } from "../define.ts";
import { arrowMarker, drawEdge, edgeLabel, KIND_FONT, layeredLayout, layoutBestDirection, NODE_FONT, nodeBox, textWidth, type Direction } from "./svg.ts";

const Props = z
  .object({
    entities: z.array(z.string()).optional().describe("Entities to draw; defaults to all. Children are drawn inside their parent when both are included"),
    relationKinds: z.array(z.string()).optional().describe("Only draw relations of these kinds"),
    direction: z
      .enum(["auto", "right", "down"])
      .default("auto")
      .describe("`auto` lays the graph out both ways and keeps the one that renders larger, so wide graphs turn downwards"),
    nest: z.boolean().default(true).describe("Draw children inside their parents; when false every entity is a plain node"),
    edgeLabels: z.boolean().default(true),
    caption: z.string().optional(),
  })
  .strict();
type Props = z.infer<typeof Props>;

interface Edge {
  from: string;
  to: string;
  label?: string;
  kind?: string;
}

const READABLE_NODES = 16;
const GROUP_PADDING = "[top=40,left=18,bottom=18,right=18]";

export const graph = defineComponent({
  name: "graph",
  description:
    "An auto-laid-out diagram of entities and their relations (architecture, dependencies, data flow). Relations to hidden children are lifted to their visible ancestor, so you can draw a high-level view from detailed data.",
  props: Props,
  async render(props, ctx) {
    const included = selectEntities(props, ctx);
    const ids = new Set(included.map((entity) => entity.id));
    if (included.length > READABLE_NODES) {
      ctx.warn(`draws ${included.length} boxes; beyond about ${READABLE_NODES} a diagram gets hard to read. List fewer entities, or list parents to lift relations`);
    }
    const parentOf = (entity: ResolvedEntity) =>
      props.nest && entity.parent !== undefined && ids.has(entity.parent) ? entity.parent : undefined;
    const edges = liftRelations(props, ctx, ids);
    const childIds = new Map<string | undefined, ResolvedEntity[]>();
    for (const entity of included) childIds.set(parentOf(entity), [...(childIds.get(parentOf(entity)) ?? []), entity]);

    const toElk = (entity: ResolvedEntity): ElkNode => {
      const children = childIds.get(entity.id) ?? [];
      if (children.length) {
        return { id: entity.id, layoutOptions: { "elk.padding": GROUP_PADDING }, children: children.map(toElk) };
      }
      const width = Math.max(textWidth(entity.label, NODE_FONT), entity.kind ? textWidth(entity.kind.toUpperCase(), KIND_FONT) * 1.1 : 0) + 36;
      return { id: entity.id, width: Math.max(96, width), height: entity.kind ? 52 : 40 };
    };
    const build = (direction: Direction): ElkNode => ({
      id: "__root",
      layoutOptions: { ...layeredLayout(direction, { layers: 64, nodes: 28 }), "elk.hierarchyHandling": "INCLUDE_CHILDREN" },
      children: (childIds.get(undefined) ?? []).map(toElk),
      edges: edges.map((edge, index): ElkExtendedEdge => ({
        id: `e${index}`,
        sources: [edge.from],
        targets: [edge.to],
        labels: props.edgeLabels && edge.label ? [edgeLabel(edge.label)] : [],
      })),
    });
    const layout = props.direction === "auto" ? await layoutBestDirection(build, ctx.layout) : await ctx.layout(build(props.direction));
    return draw(layout, edges, props, ctx);
  },
  css: `
.vx-graph { position: relative; border: 1px solid var(--vx-border); border-radius: var(--vx-radius-lg); background: var(--vx-surface); overflow: hidden; }
.vx-graph:fullscreen { display: flex; flex-direction: column; border-radius: 0; }
.vx-graph-canvas { padding: 1rem; cursor: grab; touch-action: pan-y; overflow: auto; }
.vx-graph-canvas:active { cursor: grabbing; }
.vx-graph svg { user-select: none; }
.vx-graph:fullscreen .vx-graph-canvas { flex: 1; } .vx-graph:fullscreen svg { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none; }
.vx-graph-tools { position: absolute; top: 0.6rem; right: 0.6rem; display: flex; gap: 4px; z-index: 1; opacity: 0; transition: opacity .15s; }
.vx-graph:hover .vx-graph-tools, .vx-graph:focus-within .vx-graph-tools { opacity: 1; }
.vx-graph-tools button { width: 28px; height: 28px; display: grid; place-items: center; border: 1px solid var(--vx-border); border-radius: 7px; background: var(--vx-surface); color: var(--vx-muted); font: 600 14px/1 var(--vx-sans); cursor: pointer; box-shadow: var(--vx-shadow-sm); }
.vx-graph-tools button:hover { color: var(--vx-text); }
.vx-graph-hint { position: absolute; left: 0.8rem; bottom: 0.55rem; font-size: 0.72rem; color: var(--vx-faint); opacity: 0; transition: opacity .15s; pointer-events: none; }
.vx-graph:hover .vx-graph-hint { opacity: 1; }
.vx-group { cursor: pointer; transition: opacity .25s; outline: none; }
.vx-group-box { fill: color-mix(in oklab, var(--hue-bg) 35%, transparent); stroke: color-mix(in oklab, var(--hue-fg) 35%, transparent); stroke-width: 1.25; stroke-dasharray: 5 4; }
.vx-group-label { fill: var(--hue-fg); font-size: 12.5px; font-weight: 700; }
.vx-group-kind { fill: var(--vx-faint); font-size: 10px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
.vx-group.vx-linked > .vx-group-box, .vx-group.vx-focused > .vx-group-box { stroke: var(--hue-fg); stroke-dasharray: none; }
.vx-edge.vx-edge-on path { stroke-dasharray: 7 5; animation: vx-flow .9s linear infinite; }
@keyframes vx-flow { to { stroke-dashoffset: -12; } }
@media (prefers-reduced-motion: reduce) { .vx-edge.vx-edge-on path { animation: none; } }
`,
  script: `
document.querySelectorAll("[data-vx-graph]").forEach((figure) => {
  const svg = figure.querySelector("svg");
  const canvas = figure.querySelector(".vx-graph-canvas");
  const home = svg.getAttribute("viewBox").split(" ").map(Number);
  let vb = [...home];
  const apply = () => svg.setAttribute("viewBox", vb.join(" "));
  const zoom = (factor, cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2) => {
    const w = Math.min(Math.max(vb[2] * factor, home[2] / 8), home[2] * 4);
    const k = w / vb[2];
    vb = [cx - (cx - vb[0]) * k, cy - (cy - vb[1]) * k, w, vb[3] * k];
    apply();
  };
  const toSvg = (e) => { const r = svg.getBoundingClientRect(); const s = Math.max(vb[2] / r.width, vb[3] / r.height); return [vb[0] + (e.clientX - r.left - (r.width - vb[2] / s) / 2) * s, vb[1] + (e.clientY - r.top - (r.height - vb[3] / s) / 2) * s, s]; };
  canvas.addEventListener("wheel", (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const [x, y] = toSvg(e); zoom(Math.exp(e.deltaY * 0.01), x, y); }, { passive: false });
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; drag = { x: e.clientX, y: e.clientY, vb: [...vb], moved: false, s: toSvg(e)[2] }; });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    vb = [drag.vb[0] - dx * drag.s, drag.vb[1] - dy * drag.s, vb[2], vb[3]];
    apply();
  });
  window.addEventListener("pointerup", () => {
    if (drag?.moved) canvas.addEventListener("click", (e) => e.stopPropagation(), { capture: true, once: true });
    drag = null;
  });
  const actions = { in: () => zoom(1 / 1.25), out: () => zoom(1.25), fit: () => { vb = [...home]; apply(); }, full: () => document.fullscreenElement ? document.exitFullscreen() : figure.requestFullscreen?.() };
  figure.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", () => actions[b.dataset.action]()));
});
`,
});

function selectEntities(props: Props, ctx: RenderContext): ResolvedEntity[] {
  if (!props.entities) return ctx.entities();
  return props.entities.map((id) => ctx.entity(id)).filter((entity) => entity !== undefined);
}

/** Maps each relation endpoint to its nearest drawn ancestor, dropping self and containment edges. */
function liftRelations(props: Props, ctx: RenderContext, ids: ReadonlySet<string>): Edge[] {
  const parents = new Map(ctx.entities().map((entity) => [entity.id, entity.parent]));
  const lift = (id: string): string | undefined => {
    for (let current: string | undefined = id, guard = 0; current !== undefined && guard < 1000; current = parents.get(current), guard++) {
      if (ids.has(current)) return current;
    }
    return undefined;
  };
  const isAncestor = (ancestor: string, id: string) => {
    for (let current = parents.get(id); current !== undefined; current = parents.get(current)) if (current === ancestor) return true;
    return false;
  };
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const relation of ctx.relations()) {
    if (props.relationKinds && !props.relationKinds.includes(relation.kind ?? "")) continue;
    const from = lift(relation.from);
    const to = lift(relation.to);
    if (from === undefined || to === undefined || from === to) continue;
    if (props.nest && (isAncestor(from, to) || isAncestor(to, from))) continue;
    const label = relation.label ?? relation.kind;
    const key = `${from}\u0000${to}\u0000${label ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, label, kind: relation.kind });
  }
  return edges;
}

function draw(layout: ElkNode, edges: Edge[], props: Props, ctx: RenderContext): Html {
  const offsets = new Map<string, { x: number; y: number }>([["__root", { x: 0, y: 0 }]]);
  const groups: Html[] = [];
  const nodes: Html[] = [];

  const visit = (node: ElkNode, ox: number, oy: number, depth: number) => {
    const x = ox + (node.x ?? 0);
    const y = oy + (node.y ?? 0);
    offsets.set(node.id, { x, y });
    const entity = ctx.entity(node.id)!;
    const contains = descendantIds(entity.id, ctx).join(" ");
    const attrs = html`class="${node.children?.length ? "vx-group" : "vx-node"} ${ctx.hueClass(entity.kind)}" ${ctx.entityAttrs(entity.id)} data-node="${entity.id}"${contains ? html` data-contains="${contains}"` : ""} transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${entity.label}"`;
    const w = node.width ?? 0;
    const h = node.height ?? 0;
    if (node.children?.length) {
      groups.push(html`<g ${attrs} data-depth="${depth}">
        <rect class="vx-group-box" width="${w}" height="${h}" rx="14"/>
        <text class="vx-group-label" x="16" y="24">${entity.label}</text>
        ${entity.kind !== undefined && html`<text class="vx-group-kind" x="${w - 16}" y="24" text-anchor="end">${entity.kind}</text>`}
      </g>`);
      node.children.forEach((child) => visit(child, x, y, depth + 1));
    } else {
      nodes.push(html`<g ${attrs}>${nodeBox(w, h, entity.label, entity.kind)}</g>`);
    }
  };
  (layout.children ?? []).forEach((child) => visit(child, 0, 0, 0));

  const arrow = ctx.uid("arrow");
  const edgeParts: Html[] = [];
  const labelParts: Html[] = [];
  (layout.edges ?? []).forEach((elkEdge) => {
    const edge = edges[Number(elkEdge.id.slice(1))]!;
    const container = (elkEdge as ElkExtendedEdge & { container?: string }).container ?? "__root";
    const offset = offsets.get(container) ?? { x: 0, y: 0 };
    const data = html`data-from="${edge.from}" data-to="${edge.to}"${edge.kind !== undefined ? html` data-kind="${edge.kind}"` : ""}`;
    const { paths, labels } = drawEdge(elkEdge, offset, data, arrow);
    edgeParts.push(...paths);
    labelParts.push(...labels);
  });

  const width = layout.width ?? 0;
  const height = layout.height ?? 0;
  return html`<figure class="vx-figure">
    <div class="vx-graph" data-vx-graph data-vx-diagram>
      <div class="vx-graph-tools">
        <button type="button" data-action="in" title="Zoom in">+</button>
        <button type="button" data-action="out" title="Zoom out">−</button>
        <button type="button" data-action="fit" title="Reset view">⟲</button>
        <button type="button" data-action="full" title="Fullscreen">⛶</button>
      </div>
      <div class="vx-graph-canvas">
        <svg viewBox="0 0 ${width} ${height}" data-vx-fit data-width="${Math.ceil(width)}" data-height="${Math.ceil(height)}" style="max-width: ${Math.ceil(width)}px" role="img" aria-label="${props.caption ?? "Diagram"}">
          <defs>${arrowMarker(arrow)}</defs>
          <g>${groups}</g><g>${edgeParts}</g><g>${nodes}</g><g>${labelParts}</g>
        </svg>
      </div>
      <div class="vx-graph-hint">Drag to pan · ${raw("⌘/Ctrl")} + scroll to zoom · click a box for details</div>
    </div>
    ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
  </figure>`;
}

function descendantIds(id: string, ctx: RenderContext): string[] {
  return ctx.childrenOf(id).flatMap((child) => [child.id, ...descendantIds(child.id, ctx)]);
}
