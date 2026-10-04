import { z } from "zod";
import { Block, LineSpec } from "../../document/schema.ts";
import { resolveLines, shownLinesFromHtml } from "../../sources/line-anchor.ts";
import { html } from "../../html.ts";
import { defineComponent } from "../define.ts";

const Step = z
  .object({
    title: z.string().min(1),
    text: z.string().optional().describe("Markdown"),
    focus: z.array(z.string()).optional().describe("Entities to spotlight in the visual while this step is active"),
    lines: LineSpec.optional().describe("Code lines to spotlight in the visual: numbers, or { match } to find them by text"),
  })
  .strict();

const PINNED_BOXES = 12;

export const steps = defineComponent({
  name: "steps",
  description:
    "Scrollytelling: a `visual` block (graph, sequence, code, …) stays pinned while the reader scrolls through steps, and each step spotlights its `focus` entities or `lines`. For an ordered list without a visual, use `timeline` with `numbered: true`.",
  props: z
    .object({
      // Optional in the schema only so a missing visual gets the explanation below instead of a type error.
      visual: Block.optional().describe("Any block to pin beside the steps"),
      steps: z.array(Step).min(1),
    })
    .strict()
    .superRefine((props, refine) => {
      if (props.visual === undefined) {
        refine.addIssue({ code: "custom", path: ["visual"], message: 'steps need a `visual` to pin; for an ordered list without one, use `timeline` with `"numbered": true`' });
      }
    }),
  async render(props, ctx) {
    const visual = await ctx.renderBlock(props.visual, "visual");
    // Code lines the visual actually shows, whatever component rendered them.
    const shown = shownLinesFromHtml(visual.value);
    const shownLines = new Set(shown.map((line) => line.line));
    const pinnedBoxes = (visual.value.match(/class="vx-(?:node|group) /g) ?? []).length;
    if (pinnedBoxes > PINNED_BOXES) {
      ctx.warn(`the pinned visual draws ${pinnedBoxes} boxes in about 60% of the page width; keep it to about ${PINNED_BOXES}, or show it full width outside "steps"`);
    }
    const items = props.steps.map((step, index) => {
      step.focus?.forEach((id) => ctx.entity(id));
      if (!step.focus?.length && step.lines === undefined) {
        ctx.warn(`steps[${index}] spotlights nothing in the visual; add "focus" or "lines"`);
      }
      let lines: { start: number; end: number } | undefined;
      if (step.lines !== undefined) {
        const resolved = resolveLines(step.lines, shown);
        if (resolved.ok) lines = resolved;
        else ctx.issue(`steps[${index}].lines: ${resolved.message}`);
      }
      if (lines && !(shownLines.has(lines.start) && shownLines.has(lines.end))) {
        ctx.issue(
          shownLines.size === 0
            ? `steps[${index}].lines: the visual shows no code to spotlight`
            : `steps[${index}].lines ${lines.start}-${lines.end} are outside the visual's lines ${Math.min(...shownLines)}-${Math.max(...shownLines)}`,
        );
      }
      return html`<li class="vx-step"${step.focus?.length ? html` data-focus="${step.focus.join(" ")}"` : ""}${lines ? html` data-lines="${lines.start}-${lines.end}"` : ""}>
        <div class="vx-step-num">${index + 1}</div>
        <div class="vx-step-body">
          <div class="vx-step-title">${ctx.inlineMarkdown(step.title)}</div>
          ${step.text !== undefined && html`<div class="vx-prose">${ctx.markdown(step.text)}</div>`}
        </div>
      </li>`;
    });
    return html`<div class="vx-steps" data-vx-steps>
      <ol class="vx-steps-list">${items}</ol>
      <div class="vx-steps-visual"><div class="vx-steps-pin">${visual}</div></div>
    </div>`;
  },
  css: `
.vx-steps { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 2rem; align-items: start; }
.vx-steps-list { list-style: none; margin: 0; padding: 16vh 0 36vh; display: flex; flex-direction: column; gap: 26vh; }
.vx-step { display: flex; gap: 0.9rem; position: relative; padding: 1rem 1.1rem 1.1rem; border-radius: var(--vx-radius); border: 1px solid transparent; cursor: pointer; opacity: .4; transition: opacity .3s, background .3s, border-color .3s, box-shadow .3s; }
.vx-step-num { flex: none; width: 1.9rem; height: 1.9rem; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 0.85rem; background: var(--vx-surface); border: 1.5px solid var(--vx-border-strong); color: var(--vx-muted); position: relative; z-index: 1; transition: all .25s; }
.vx-step-title { font-weight: 650; font-size: 1.04rem; margin: 0.2rem 0 0.35rem; }
.vx-step-body { min-width: 0; flex: 1; }
.vx-step.vx-active { opacity: 1; background: var(--vx-surface); box-shadow: var(--vx-shadow); border-color: var(--vx-border); }
.vx-step.vx-active .vx-step-num { background: var(--vx-accent); border-color: var(--vx-accent); color: var(--vx-on-accent); }
.vx-steps-visual { position: sticky; top: calc(var(--vx-topbar) + 1.5rem); }
.vx-steps-pin .vx-code-body { max-height: calc(100vh - var(--vx-topbar) - 9rem); }
.vx-steps-pin .vx-seq-notes { max-height: 30vh; overflow-y: auto; }
@media (max-width: 900px) {
  .vx-steps { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .vx-steps-visual { grid-row: 1; top: var(--vx-topbar); z-index: 2; background: var(--vx-bg); padding: 0.5rem 0; }
  .vx-steps-pin { max-height: 46vh; overflow: hidden; }
  .vx-steps-pin .vx-code-body { max-height: 36vh; }
  .vx-steps-list { padding: 2rem 0 24vh; gap: 18vh; }
}
`,
  script: `
document.querySelectorAll("[data-vx-steps]").forEach((root) => {
  const visual = root.querySelector(".vx-steps-pin");
  const items = [...root.querySelectorAll(".vx-step")];
  let active = null;
  const activate = (step) => {
    if (step === active) return;
    active = step;
    items.forEach((s) => s.classList.toggle("vx-active", s === step));
    const [start, end] = (step.dataset.lines || "").split("-").map(Number);
    vx.setFocus(visual, { entities: (step.dataset.focus || "").split(" ").filter(Boolean), lines: start ? [start, end] : null });
  };
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) activate(e.target); });
  }, { rootMargin: "-45% 0px -50% 0px" });
  items.forEach((step) => { observer.observe(step); step.addEventListener("click", () => activate(step)); });
  activate(items[0]);
});
`,
});
