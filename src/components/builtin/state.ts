import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api.js";
import { z } from "zod";
import { html, type Html } from "../../html.ts";
import { defineComponent } from "../define.ts";
import { arrowMarker, drawEdge, edgeLabel, layeredLayout, layoutBestDirection, textWidth, type Direction } from "./svg.ts";

const State = z
  .object({
    id: z.string().min(1),
    label: z.string().optional().describe("Defaults to the id"),
    kind: z.enum(["normal", "initial", "final", "error"]).default("normal").describe("`initial` gets an entry arrow, `final` a double border"),
    entity: z.string().optional().describe("Entity this state belongs to, for hover-linking and step focus"),
  })
  .strict();

const Props = z
  .object({
    states: z.array(State).min(2),
    transitions: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional() }).strict()).min(1),
    direction: z
      .enum(["auto", "right", "down"])
      .default("auto")
      .describe("`auto` lays the diagram out both ways and keeps the one that renders larger"),
    caption: z.string().optional(),
  })
  .strict();

const START = "__start";
const LABEL_FONT = 13;

export const state = defineComponent({
  name: "state",
  description:
    "A state machine: the statuses something moves through and what triggers each move (order lifecycle, connection states, reply status). Mark `initial`, `final` and `error` states.",
  props: Props,
  async render(props, ctx) {
    const ids = new Set(props.states.map((s) => s.id));
    const transitions = props.transitions.filter((transition, index) => {
      const missing = [transition.from, transition.to].find((id) => !ids.has(id));
      if (missing !== undefined) ctx.issue(`transitions[${index}] uses "${missing}", which is not one of the states`);
      return missing === undefined;
    });
    const initial = props.states.filter((s) => s.kind === "initial");
    const edges = [...initial.map((s) => ({ from: START, to: s.id, label: undefined })), ...transitions];

    const build = (direction: Direction): ElkNode => ({
      id: "__root",
      layoutOptions: layeredLayout(direction, { layers: 70, nodes: 34 }),
      children: [
        ...(initial.length ? [{ id: START, width: 14, height: 14 }] : []),
        ...props.states.map((s): ElkNode => ({ id: s.id, width: Math.max(90, textWidth(s.label ?? s.id, LABEL_FONT) + 40), height: 40 })),
      ],
      edges: edges.map((edge, index): ElkExtendedEdge => ({
        id: `t${index}`,
        sources: [edge.from],
        targets: [edge.to],
        labels: edge.label ? [edgeLabel(edge.label)] : [],
      })),
    });
    const layout = props.direction === "auto" ? await layoutBestDirection(build, ctx.layout) : await ctx.layout(build(props.direction));

    const arrow = ctx.uid("state-arrow");
    const byId = new Map(props.states.map((s) => [s.id, s]));
    const nodes: Html[] = [];
    for (const node of layout.children ?? []) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      if (node.id === START) {
        nodes.push(html`<circle class="vx-state-start" cx="${x + 7}" cy="${y + 7}" r="7"/>`);
        continue;
      }
      const s = byId.get(node.id)!;
      const entity = s.entity !== undefined ? ctx.entity(s.entity) : undefined;
      const w = node.width ?? 0;
      const h = node.height ?? 0;
      nodes.push(html`<g class="vx-state vx-state--${s.kind}"${entity ? html` ${ctx.entityAttrs(entity.id)} tabindex="0" role="button"` : ""} data-node="${s.id}" transform="translate(${x} ${y})">
        <rect class="vx-state-box" width="${w}" height="${h}" rx="${h / 2}"/>
        ${s.kind === "final" && html`<rect class="vx-state-ring" x="4" y="4" width="${w - 8}" height="${h - 8}" rx="${(h - 8) / 2}"/>`}
        <text class="vx-state-label" font-size="${LABEL_FONT}" x="${w / 2}" y="${h / 2 + 4.5}">${s.label ?? s.id}</text>
      </g>`);
    }
    const lines: Html[] = [];
    const labels: Html[] = [];
    for (const elkEdge of (layout.edges ?? []) as ElkExtendedEdge[]) {
      const edge = edges[Number(elkEdge.id.slice(1))]!;
      const drawn = drawEdge(elkEdge, { x: 0, y: 0 }, html`data-from="${edge.from}" data-to="${edge.to}"`, arrow);
      lines.push(...drawn.paths);
      labels.push(...drawn.labels);
    }
    const width = Math.ceil(layout.width ?? 0);
    const height = Math.ceil(layout.height ?? 0);
    return html`<figure class="vx-figure vx-state-figure" data-vx-diagram>
      <div class="vx-canvas">
        <svg viewBox="0 0 ${width} ${height}" data-vx-fit data-width="${width}" data-height="${height}" style="max-width: ${width}px" role="img" aria-label="${props.caption ?? "State diagram"}">
          <defs>${arrowMarker(arrow)}</defs>
          <g>${lines}</g><g>${nodes}</g><g>${labels}</g>
        </svg>
      </div>
      ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
    </figure>`;
  },
  css: `
.vx-state { --c: var(--vx-accent); cursor: default; transition: opacity .25s; }
.vx-state[data-entity] { cursor: pointer; }
.vx-state--final { --c: var(--vx-green); } .vx-state--error { --c: var(--vx-red); }
.vx-state-box { fill: color-mix(in oklab, var(--c) 10%, var(--vx-surface)); stroke: color-mix(in oklab, var(--c) 60%, transparent); stroke-width: 1.5; transition: fill .15s; }
.vx-state-ring { fill: none; stroke: color-mix(in oklab, var(--c) 45%, transparent); stroke-width: 1.25; }
.vx-state-label { fill: var(--vx-text); font-weight: 600; text-anchor: middle; font-family: var(--vx-mono); }
.vx-state-start { fill: var(--vx-text); }
.vx-state-figure .vx-edge path { stroke: var(--vx-edge-strong); }
.vx-state:hover .vx-state-box, .vx-state.vx-linked .vx-state-box, .vx-state.vx-focused .vx-state-box { fill: color-mix(in oklab, var(--c) 22%, var(--vx-surface)); stroke: var(--c); }
.vx-focus-mode .vx-state:not(.vx-focused) { opacity: .35; }
`,
});
