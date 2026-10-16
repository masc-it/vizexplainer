---
name: vizexplainer
description: Build interactive visual explainers of codebases, code paths and concepts as one self-contained HTML file. Use when the user asks to explain, document or visualise a project, an architecture, or how some code works.
---

# vizexplainer

Write an explainer chapter by chapter as JSON. The `vizx` CLI aggregates the chapters, validates them and renders one self-contained HTML file. You own the narrative; the toolkit handles components, layout and interactivity.

## Workflow

1. **Scout.** For code subjects, run `vizx scan <repo> -o explainer.json`. Its stdout report identifies connected files and declarations worth reading; its draft holds an inventory and starter blocks. Read the code that matters. For other subjects, start a manifest yourself.
2. **Outline before prose.** Define the audience and what they should understand afterwards. List their questions in reading order. Create one chapter section per question, with a short title, the question as its draft summary, and empty `children`. Put the ordered paths in the manifest's `chapters` list. Move useful scan blocks into a chapter and remove `blocks` from the manifest. Keep only entities and relations the reader needs. Share the outline before drafting; pause for approval if the user wants a checkpoint.
3. **Draft one chapter.** Read only the relevant sources and reference guidance. Write that chapter's prose and visuals, updating shared entities when needed. Never generate the whole book's prose in one write.
4. **Check and revise that chapter.** Run `vizx validate explainer.json`. Fix errors; address warnings or explain why they are acceptable. Check factual claims against sources, then edit for clarity and repetition before starting another chapter. The manifest stays buildable because undrafted chapters have valid empty sections.
5. **Edit the whole book.** Reread chapters in order as a newcomer, then as an engineer. Fix missing explanations, inconsistent names and repeated material. Replace draft questions with useful summaries. Edit affected chapter files rather than regenerating everything.
6. **Render and inspect.** Run `vizx render explainer.json -o explainer.html`, then `vizx preview explainer.json` and `vizx preview explainer.json --mobile`. Inspect screenshots when possible; fix unreadable diagrams, sideways scrolling and script errors. Revalidate after changes.

## Files

`explainer.json` holds metadata, shared data and chapter order:

```json
{
  "title": "How checkout works",
  "root": "../..",
  "entities": {},
  "relations": [],
  "chapters": ["chapters/overview.json"]
}
```

`chapters/overview.json` contains one ordinary section:

```json
{
  "type": "section",
  "id": "overview",
  "title": "Overview",
  "summary": "What does checkout do for a customer?",
  "children": []
}
```

Chapter paths resolve relative to the manifest. All source paths use its `root`; custom component paths are relative to the manifest. Entities and relations are shared across chapters. Use `[[entity-id]]` in Markdown text to link prose to figures and details panels.

Existing single-file documents with `blocks` still work. Use either `blocks` or `chapters`, never both. Pass the manifest, not a chapter file, to CLI commands.

## Writing rules

- Each chapter answers one reader question. Lead with purpose or consequence; explain mechanisms afterwards.
- State only facts verified in the sources. Prefer code references with `symbol` over copied code or fixed line numbers.
- Write plain language first; put internals and edge cases in `details`. Define unfamiliar terms once.
- Give each explanation one home. Prose adds what the diagram cannot; captions tell readers what to notice.
- Keep entity summaries to 25 words, chapter summaries to 30, step text to 50, and annotations to 20. One idea per paragraph, at most four sentences.
- Use diagrams to explain a relationship or process, not to display every scanned file. Keep graphs near 12 nodes.

## Reference: read only when needed

Resolve these paths relative to this skill directory. Do not load all references at startup.

- [Document and chapters](references/document.md): when defining entities, relations or source references, or splitting a scan draft into chapters.
- [Components](references/components.md): when choosing a visual or composing walkthroughs. Run `vizx components [explainer.json]` for exact props; add `--json` for schemas.
- [Writing guide](references/writing.md): when prose needs a deeper editorial pass; includes budgets and rewrite examples.
- [Custom components](references/custom-components.md): only when no built-in component fits and reusable markup is needed.

`vizx schema` prints the document/manifest schema. Validation errors name the chapter file and block path. `--strict` also fails on warnings; `render --force` is for inspecting broken drafts only.

If `vizx` is unavailable, ask the user to run `npm run setup` in the vizexplainer repository (installs the CLI and copies the skill to both agent skill directories). The repository's `examples/vizexplainer/explainer.json` is a complete chapter-based example.
