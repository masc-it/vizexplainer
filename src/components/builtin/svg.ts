import type { ElkExtendedEdge, ElkLabel, ElkNode, LayoutOptions } from "elkjs/lib/elk-api.js";
import { html, type Html } from "../../html.ts";

// Shared by graph, sequence and state. Font sizes are set as SVG attributes so box sizing and rendering agree;
// the theme's diagram styles (`.vx-node`, `.vx-edge`, …) handle everything else.
export const NODE_FONT = 13.5;
export const KIND_FONT = 10.5;
export const EDGE_FONT = 11.5;

/** Approximate rendered width of sans-serif text, used to size SVG boxes before the browser measures anything. */
export function textWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const char of text) {
    if ("iljtf.,:;|!'()[] ".includes(char)) em += 0.3;
    else if ("mwMW@".includes(char)) em += 0.86;
    else if (char >= "A" && char <= "Z") em += 0.66;
    else em += 0.56;
  }
  return Math.ceil(em * fontSize);
}

/** Width of monospace text: every glyph is about 0.6em wide. */
export function monoWidth(text: string, fontSize: number): number {
  return Math.ceil([...text].length * 0.6 * fontSize);
}

export type Direction = "right" | "down";

/**
 * Space a full-width diagram gets on a typical screen: the page column minus the canvas padding,
 * by the 72% of a 900px-tall window that the runtime lets a diagram grow to.
 */
const REFERENCE_BOX = { width: 1230, height: 650 };
/** Scales closer than this count as a tie: the reader would not notice the difference in text size. */
const SCALE_TIE = 0.03;
/** On a tie, `down` must fit the box's shape this much better (in log aspect ratio) to replace `right`. */
const SHAPE_MARGIN = 0.2;

/**
 * Lays a graph out in both directions and keeps the one that renders larger in the reference box, so wide,
 * shallow graphs turn downwards and use the height instead of shrinking. On a tie it keeps `right`, which reads
 * naturally and costs less page height, unless both have to shrink and `down` clearly fits the box's shape better.
 */
export async function layoutBestDirection(build: (direction: Direction) => ElkNode, layout: (graph: ElkNode) => Promise<ElkNode>): Promise<ElkNode> {
  const [right, down] = await Promise.all([layout(build("right")), layout(build("down"))]);
  const scale = (graph: ElkNode) => Math.min(1, REFERENCE_BOX.width / (graph.width ?? 1), REFERENCE_BOX.height / (graph.height ?? 1));
  const misfit = (graph: ElkNode) => Math.abs(Math.log((graph.width ?? 1) / (graph.height ?? 1) / (REFERENCE_BOX.width / REFERENCE_BOX.height)));
  const gain = scale(down) - scale(right);
  if (Math.abs(gain) > SCALE_TIE) return gain > 0 ? down : right;
  if (scale(right) >= 1 - SCALE_TIE) return right;
  return misfit(right) - misfit(down) > SHAPE_MARGIN ? down : right;
}

/** Options for ELK's layered algorithm as used by the built-in diagrams. */
export function layeredLayout(direction: Direction, spacing: { layers: number; nodes: number }): LayoutOptions {
  return {
    "elk.algorithm": "layered",
    "elk.direction": direction === "right" ? "RIGHT" : "DOWN",
    "elk.layered.spacing.nodeNodeBetweenLayers": String(spacing.layers),
    "elk.spacing.nodeNode": String(spacing.nodes),
    "elk.spacing.edgeLabel": "6",
    "elk.edgeLabels.placement": "CENTER",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.padding": "[top=12,left=12,bottom=12,right=12]",
  };
}

/** An ELK edge label sized for the diagram's edge font. "inline" puts the label on the edge instead of beside it. */
export function edgeLabel(text: string): ElkLabel {
  return { text, width: textWidth(text, EDGE_FONT) + 12, height: 18, layoutOptions: { "elk.edgeLabels.inline": "true" } };
}

/** Arrowhead marker; `context-stroke` makes it follow the edge colour, including hover states. */
export function arrowMarker(id: string): Html {
  return html`<marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9 z" fill="context-stroke"/></marker>`;
}

/** A labelled box with an optional kind line underneath, drawn at the origin. */
export function nodeBox(width: number, height: number, label: string, kind: string | undefined): Html {
  return html`<rect class="vx-node-box" width="${width}" height="${height}" rx="10"/>
    <text class="vx-node-label" font-size="${NODE_FONT}" x="${width / 2}" y="${kind !== undefined ? height / 2 - 4 : height / 2 + 4.5}">${label}</text>
    ${kind !== undefined && html`<text class="vx-node-kind" font-size="${KIND_FONT}" x="${width / 2}" y="${height / 2 + 13}">${kind}</text>`}`;
}

/**
 * The paths and labels of one laid-out ELK edge. `offset` is the position of the edge's container,
 * because ELK gives coordinates relative to it; `data` goes on every part, for hover and focus.
 */
export function drawEdge(edge: ElkExtendedEdge, offset: { x: number; y: number }, data: Html, arrow: string): { paths: Html[]; labels: Html[] } {
  const shift = (p: { x: number; y: number }) => ({ x: p.x + offset.x, y: p.y + offset.y });
  const paths = (edge.sections ?? []).map((section) => {
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(shift);
    return html`<g class="vx-edge" ${data}><path d="${roundedPath(points, 10)}" marker-end="url(#${arrow})"/></g>`;
  });
  const labels = ((edge.labels ?? []) as ElkLabel[]).map((label) => {
    const { x, y } = shift({ x: label.x ?? 0, y: label.y ?? 0 });
    const width = label.width ?? 0;
    const height = label.height ?? 0;
    return html`<g class="vx-edge-label" ${data}>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="9"/>
      <text font-size="${EDGE_FONT}" x="${x + width / 2}" y="${y + height / 2}">${label.text}</text>
    </g>`;
  });
  return { paths, labels };
}

/** An SVG path through orthogonal points with rounded corners. */
export function roundedPath(points: readonly { x: number; y: number }[], radius: number): string {
  const first = points[0];
  if (!first) return "";
  let d = `M${first.x},${first.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(radius, distance(prev, curr) / 2, distance(curr, next) / 2);
    const a = toward(curr, prev, r);
    const b = toward(curr, next, r);
    d += ` L${a.x},${a.y} Q${curr.x},${curr.y} ${b.x},${b.y}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${last.x},${last.y}`;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toward(from: { x: number; y: number }, to: { x: number; y: number }, length: number): { x: number; y: number } {
  const d = distance(from, to) || 1;
  return { x: from.x + ((to.x - from.x) / d) * length, y: from.y + ((to.y - from.y) / d) * length };
}
