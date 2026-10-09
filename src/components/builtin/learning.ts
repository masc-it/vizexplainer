import { z } from "zod";
import { html } from "../../html.ts";
import { defineComponent } from "../define.ts";

export const glossary = defineComponent({
  name: "glossary",
  description: "Definitions of the terms a newcomer needs, alphabetically. Terms can be written here or taken from entities (label and summary).",
  props: z
    .object({
      terms: z.array(z.object({ term: z.string().min(1), definition: z.string().describe("Markdown"), entity: z.string().optional() }).strict()).optional(),
      entities: z.array(z.string()).optional().describe("Entities to define with their label and summary"),
    })
    .strict()
    .refine((props) => (props.terms?.length ?? 0) + (props.entities?.length ?? 0) > 0, "give `terms`, `entities`, or both"),
  render(props, ctx) {
    const entries = [
      ...(props.terms ?? []).map((term) => ({ term: term.term, definition: term.definition, entity: term.entity !== undefined ? ctx.entity(term.entity) : undefined })),
      ...(props.entities ?? []).flatMap((id) => {
        const entity = ctx.entity(id);
        if (!entity) return [];
        if (entity.summary === undefined) ctx.warn(`entity "${id}" has no summary to use as its definition`);
        return [{ term: entity.label, definition: entity.summary ?? "", entity }];
      }),
    ].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
    return html`<dl class="vx-glossary">
      ${entries.map(
        (entry) => html`<div class="vx-glossary-entry">
          <dt>${entry.entity ? ctx.ref(entry.entity.id, entry.term) : entry.term}</dt>
          <dd class="vx-prose">${ctx.markdown(entry.definition)}</dd>
        </div>`,
      )}
    </dl>`;
  },
  css: `
.vx-glossary { margin: 0; display: grid; gap: 0; border-top: 1px solid var(--vx-border-strong); }
.vx-glossary-entry { display: grid; grid-template-columns: minmax(8rem, 14rem) 1fr; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid var(--vx-border); }
.vx-glossary-entry:last-child { border-bottom: 0; }
.vx-glossary dt { font-weight: 650; }
.vx-glossary dd { margin: 0; color: var(--vx-muted); }
@media (max-width: 640px) { .vx-glossary-entry { grid-template-columns: 1fr; gap: 0.2rem; } }
`,
});

const Question = z
  .object({
    question: z.string().min(1).describe("Markdown"),
    options: z
      .array(z.object({ text: z.string().min(1), correct: z.boolean().default(false), explanation: z.string().optional().describe("Shown after this option is chosen") }).strict())
      .min(2),
    explanation: z.string().optional().describe("Shown once the question is answered (markdown)"),
  })
  .strict()
  .refine((question) => question.options.some((option) => option.correct), "mark at least one option `correct: true`");

export const quiz = defineComponent({
  name: "quiz",
  description: "Check-your-understanding questions with instant feedback. Place one at the end of a section to help readers consolidate what they learned.",
  props: z.object({ title: z.string().default("Check your understanding"), questions: z.array(Question).min(1) }).strict(),
  render(props, ctx) {
    return html`<div class="vx-quiz vx-narrow" data-vx-quiz>
      <div class="vx-quiz-title">${props.title}</div>
      ${props.questions.map(
        (question, index) => html`<div class="vx-quiz-question" data-vx-question>
          <div class="vx-quiz-prompt vx-prose"><span class="vx-quiz-n">${index + 1}</span>${ctx.markdown(question.question)}</div>
          <div class="vx-quiz-options">
            ${question.options.map(
              (option) => html`<button type="button" class="vx-quiz-option" data-correct="${option.correct ? "true" : "false"}">
                <span class="vx-quiz-mark" aria-hidden="true"></span><span class="vx-quiz-text">${ctx.inlineMarkdown(option.text)}</span>
                ${option.explanation !== undefined && html`<span class="vx-quiz-why" hidden>${ctx.inlineMarkdown(option.explanation)}</span>`}
              </button>`,
            )}
          </div>
          ${question.explanation !== undefined && html`<div class="vx-quiz-explanation vx-prose" hidden>${ctx.markdown(question.explanation)}</div>`}
        </div>`,
      )}
    </div>`;
  },
  css: `
/* No outer box: the label and numbered questions carry it; only the answer buttons, which are controls, have borders. */
.vx-quiz { display: grid; gap: 1.25rem; }
.vx-quiz-title { font: 700 0.75rem var(--vx-sans); letter-spacing: .08em; text-transform: uppercase; color: var(--vx-accent); }
.vx-quiz-prompt { display: flex; gap: 0.6rem; font-weight: 600; }
.vx-quiz-prompt > p { margin: 0.15rem 0 0; }
.vx-quiz-n { flex: none; width: 1.5rem; height: 1.5rem; border-radius: 50%; display: grid; place-items: center; font-size: 0.78rem; background: var(--vx-accent-soft); color: var(--vx-accent); margin-top: 0.1rem; }
.vx-quiz-options { display: grid; gap: 0.45rem; margin-top: 0.6rem; padding-left: 2.1rem; }
.vx-quiz-option { font: inherit; text-align: left; display: grid; grid-template-columns: auto 1fr; gap: 0.2rem 0.65rem; align-items: start; padding: 0.6rem 0.8rem; border-radius: 10px; border: 1px solid var(--vx-border); background: var(--vx-surface); color: var(--vx-text); cursor: pointer; transition: border-color .15s, background .15s; }
.vx-quiz-option:hover:not(:disabled) { border-color: var(--vx-accent); }
.vx-quiz-option:disabled { cursor: default; }
.vx-quiz-mark { width: 1.1rem; height: 1.1rem; margin-top: 0.15rem; border-radius: 50%; border: 2px solid var(--vx-border-strong); }
.vx-quiz-why { grid-column: 2; color: var(--vx-muted); font-size: 0.9rem; }
.vx-quiz-option.vx-right { border-color: var(--vx-green); background: color-mix(in oklab, var(--vx-green) 9%, var(--vx-surface)); }
.vx-quiz-option.vx-right .vx-quiz-mark { border-color: var(--vx-green); background: var(--vx-green); box-shadow: inset 0 0 0 3px var(--vx-surface); }
.vx-quiz-option.vx-wrong { border-color: var(--vx-red); background: color-mix(in oklab, var(--vx-red) 8%, var(--vx-surface)); }
.vx-quiz-option.vx-wrong .vx-quiz-mark { border-color: var(--vx-red); background: var(--vx-red); box-shadow: inset 0 0 0 3px var(--vx-surface); }
.vx-quiz-explanation { padding: 0.1rem 0 0.1rem 0.9rem; margin: 0.7rem 0 0 2.1rem; border-left: 3px solid var(--vx-border-strong); color: var(--vx-muted); }
`,
  script: `
document.querySelectorAll("[data-vx-question]").forEach((question) => {
  const options = [...question.querySelectorAll(".vx-quiz-option")];
  options.forEach((option) => option.addEventListener("click", () => {
    options.forEach((o) => {
      o.disabled = true;
      if (o.dataset.correct === "true") o.classList.add("vx-right");
    });
    if (option.dataset.correct !== "true") option.classList.add("vx-wrong");
    option.querySelector(".vx-quiz-why")?.removeAttribute("hidden");
    question.querySelector(".vx-quiz-explanation")?.removeAttribute("hidden");
  }));
});
`,
});
