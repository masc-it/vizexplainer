import { z } from "zod";
import { html, type Html } from "../../html.ts";
import { defineComponent } from "../define.ts";
import { arrowMarker, monoWidth, NODE_FONT, nodeBox, textWidth } from "./svg.ts";

const Message = z
  .object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    kind: z.enum(["call", "return", "async"]).default("call"),
    note: z.string().optional().describe("Explanation listed under the diagram, keyed by the message number (markdown)"),
  })
  .strict();

const HEAD_H = 50;
const GAP = 36;
const ROW = 48;
const SELF_ROW = 64;
const LABEL_FONT = 12;

export const sequence = defineComponent({
  name: "sequence",
  description:
    "A sequence diagram: who calls whom, in order. Ideal for request flows and code paths across modules. Messages are numbered; add `note` to explain a step.",
  props: z
    .object({
      participants: z.array(z.string()).min(1).describe("Entity ids, left to right"),
      messages: z.array(Message).min(1),
      caption: z.string().optional(),
    })
    .strict(),
  render(props, ctx) {
    const actors = props.participants.map((id) => ({ id, entity: ctx.entity(id) }));
    const column = new Map(props.participants.map((id, index) => [id, index]));
    const messages = props.messages.flatMap((message, index) => {
      const from = column.get(message.from);
      const to = column.get(message.to);
      if (from === undefined || to === undefined) {
        ctx.issue(`messages[${index}] uses "${from === undefined ? message.from : message.to}", which is not in participants`);
        return [];
      }
      return [{ ...message, number: index + 1, fromCol: from, toCol: to }];
    });

    const widths = actors.map(({ id, entity }) => Math.max(110, textWidth(entity?.label ?? id, NODE_FONT) + 36));
    const centers: number[] = [];
    widths.forEach((width, index) => {
      centers.push(index === 0 ? width / 2 : centers[index - 1]! + widths[index - 1]! / 2 + GAP + width / 2);
    });
    const shiftFrom = (column: number, amount: number) => {
      for (let i = column; i < centers.length; i++) centers[i]! += amount;
    };
    // Self-call labels sit right of their loop on a halo and may overlap neighbouring lifelines,
    // so only messages between two participants push columns apart.
    let rightExtra = 0;
    for (const message of messages) {
      const labelWidth = monoWidth(message.label ?? "", LABEL_FONT) + 40;
      if (message.fromCol === message.toCol) {
        if (message.fromCol === centers.length - 1) rightExtra = Math.max(rightExtra, labelWidth + 16 - widths[message.fromCol]! / 2);
        continue;
      }
      const left = Math.min(message.fromCol, message.toCol);
      const right = Math.max(message.fromCol, message.toCol);
      shiftFrom(right, Math.max(0, labelWidth - (centers[right]! - centers[left]!)));
    }

    let y = HEAD_H + 34;
    const rows: Html[] = [];
    const arrow = ctx.uid("seq-arrow");
    const open = ctx.uid("seq-open");
    for (const message of messages) {
      const x1 = centers[message.fromCol]!;
      const x2 = centers[message.toCol]!;
      const self = message.fromCol === message.toCol;
      const marker = message.kind === "async" ? open : arrow;
      const data = html`data-from="${message.from}" data-to="${message.to}" data-n="${message.number}"`;
      const label = message.label ?? "";
      if (self) {
        rows.push(html`<g class="vx-seq-msg vx-seq-${message.kind}" ${data}>
          <path d="M${x1},${y} h36 v22 h-32" marker-end="url(#${marker})"/>
          <circle class="vx-seq-num" cx="${x1}" cy="${y}" r="9"/><text class="vx-seq-num-t" x="${x1}" y="${y}">${message.number}</text>
          <text class="vx-seq-label vx-seq-label--self" font-size="${LABEL_FONT}" x="${x1 + 44}" y="${y + 15}">${label}</text>
        </g>`);
        y += SELF_ROW;
      } else {
        const dir = Math.sign(x2 - x1);
        rows.push(html`<g class="vx-seq-msg vx-seq-${message.kind}" ${data}>
          <path d="M${x1 + dir * 12},${y} L${x2 - dir * 3},${y}" marker-end="url(#${marker})"/>
          <circle class="vx-seq-num" cx="${x1}" cy="${y}" r="9"/><text class="vx-seq-num-t" x="${x1}" y="${y}">${message.number}</text>
          <text class="vx-seq-label" font-size="${LABEL_FONT}" x="${(x1 + x2) / 2 + dir * 6}" y="${y - 9}">${label}</text>
        </g>`);
        y += ROW;
      }
    }
    const height = y;
    const width = centers[centers.length - 1]! + widths[widths.length - 1]! / 2 + rightExtra;

    const heads = actors.map(({ id, entity }, index) => {
      const w = widths[index]!;
      const x = centers[index]! - w / 2;
      return html`<line class="vx-seq-life" x1="${centers[index]}" y1="${HEAD_H}" x2="${centers[index]}" y2="${height}"/>
        <g class="vx-node ${ctx.hueClass(entity?.kind)}" ${ctx.entityAttrs(id)} transform="translate(${x} 0)" tabindex="0" role="button">${nodeBox(w, HEAD_H, entity?.label ?? id, entity?.kind)}</g>`;
    });
    const notes = messages.filter((message) => message.note !== undefined);

    // Notes sit beside the diagram when there is room, so a note and its message are visible together.
    return html`<figure class="vx-figure vx-seq" data-vx-seq>
      <div class="vx-seq-layout">
      <div class="vx-canvas" style="--vx-natural-width: ${Math.ceil(width + 8)}px">
        <svg viewBox="-4 -4 ${width + 8} ${height + 8}" data-vx-fit data-width="${Math.ceil(width + 8)}" data-height="${Math.ceil(height + 8)}" data-max-height="none" style="max-width: ${Math.ceil(width + 8)}px" role="img" aria-label="${props.caption ?? "Sequence diagram"}">
          <defs>
            ${arrowMarker(arrow)}
            <marker id="${open}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" stroke="context-stroke" stroke-width="1.5"/></marker>
          </defs>
          ${heads}${rows}
        </svg>
      </div>
      ${notes.length > 0 &&
      html`<ol class="vx-notes vx-seq-notes">${notes.map(
        (message) => html`<li data-n="${message.number}"><span class="vx-marker">${message.number}</span><div class="vx-prose">${ctx.markdown(message.note!)}</div></li>`,
      )}</ol>`}
      </div>
      ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
    </figure>`;
  },
  css: `
/* Notes sit beside the diagram only while it still fits at full size; otherwise they wrap below it. */
.vx-seq-layout { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start; }
.vx-seq-layout > .vx-canvas { flex: 999 1 0; min-inline-size: min(100%, calc(var(--vx-natural-width) + 2rem + 2px)); }
.vx-seq-notes { flex: 1 1 15rem; position: sticky; top: calc(var(--vx-topbar) + 1rem); max-height: calc(100vh - var(--vx-topbar) - 2rem); overflow-y: auto; border: 1px solid var(--vx-border); border-radius: var(--vx-radius-lg); background: var(--vx-surface); }
.vx-seq-life { stroke: var(--vx-border-strong); stroke-width: 1.25; stroke-dasharray: 4 5; }
.vx-seq-msg path { fill: none; stroke: var(--vx-edge-strong); stroke-width: 1.5; transition: stroke .2s, opacity .25s; }
.vx-seq-return path { stroke-dasharray: 5 4; }
.vx-seq-label { fill: var(--vx-text); font-weight: 550; text-anchor: middle; font-family: var(--vx-mono); paint-order: stroke; stroke: var(--vx-surface); stroke-width: 5px; stroke-linejoin: round; transition: opacity .25s; }
.vx-seq-label--self { text-anchor: start; }
.vx-seq-return .vx-seq-label { fill: var(--vx-muted); }
.vx-seq-num { fill: var(--vx-surface); stroke: var(--vx-edge-strong); stroke-width: 1.25; }
.vx-seq-num-t { fill: var(--vx-muted); font-size: 10px; font-weight: 700; text-anchor: middle; dominant-baseline: central; }
.vx-seq-msg.vx-edge-on path, .vx-seq-msg.vx-active path { stroke: var(--vx-accent); stroke-width: 2.25; stroke-dasharray: none; animation: none; }
.vx-seq-return.vx-edge-on path, .vx-seq-return.vx-active path { stroke-dasharray: 5 4; }
.vx-seq-msg.vx-edge-on .vx-seq-num, .vx-seq-msg.vx-active .vx-seq-num { fill: var(--vx-accent); stroke: var(--vx-accent); }
.vx-seq-msg.vx-edge-on .vx-seq-num-t, .vx-seq-msg.vx-active .vx-seq-num-t { fill: var(--vx-on-accent); }
.vx-seq-msg.vx-active .vx-seq-label, .vx-seq-msg.vx-edge-on .vx-seq-label { fill: var(--vx-accent); }
.vx-seq.vx-hovering .vx-seq-msg:not(.vx-active) { opacity: .3; }
.vx-focus-mode .vx-seq-msg:not(.vx-edge-on) { opacity: .25; }
`,
  script: `
document.querySelectorAll("[data-vx-seq]").forEach((figure) => {
  const msgs = [...figure.querySelectorAll(".vx-seq-msg")];
  const notes = [...figure.querySelectorAll(".vx-seq-notes li")];
  const set = (n) => {
    figure.classList.toggle("vx-hovering", n !== null);
    msgs.forEach((m) => m.classList.toggle("vx-active", m.dataset.n === n));
    notes.forEach((l) => l.classList.toggle("vx-active", l.dataset.n === n));
  };
  [...msgs, ...notes].forEach((el) => {
    el.addEventListener("mouseenter", () => set(el.dataset.n));
    el.addEventListener("mouseleave", () => set(null));
  });
});
`,
});
