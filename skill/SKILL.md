---
name: vizexplainer
description: Build interactive visual explainers of codebases, code paths and concepts as one self-contained HTML file. Use when the user asks to explain, document or visualise a project, an architecture, or how some code works.
---

# vizexplainer

You explain things by writing a JSON document. The `vizx` CLI validates it and renders it into a single HTML file that works offline, on GitHub Pages or anywhere else.

You decide what to say and in which order. The toolkit handles layout, diagrams, syntax highlighting, light and dark mode, and interactivity.

## Workflow

1. **Scan** a codebase: `vizx scan <repo> -o explainer.json`. The report on stdout lists folders, files with line counts, how connected each file is (how many files use it, and how many it uses), and the declarations of the most connected files. The draft document already holds an entity per folder and file, relations detected from imports, and starter blocks. Use the report to decide what to read; skip this step for non-code subjects.
2. **Read** the code that matters. Explain what the code actually does, not what names suggest.
3. **Write** the document following [Writing the explainer](#writing-the-explainer): rename and regroup entities, give them `kind`s and plain-language `summary`s, delete what the reader doesn't need, and compose the blocks (see below). Point code at declarations with `symbol`; `vizx symbols <file>` lists them.
4. **Validate**: `vizx validate explainer.json`. Every issue has an exact path, e.g. `blocks[2].children[0]: unknown entity "auth.login" (did you mean "auth.logIn"?)`.
   - **Errors** mean the document is wrong. Fix them all.
   - **Warnings** flag likely problems: stale source links, crowded diagrams, steps that spotlight nothing, orphaned entities, overlong summaries. Fix them unless you have a reason not to. `--strict` makes them fail.
5. **Render**: `vizx render explainer.json -o explainer.html`. It refuses to write on errors; `--force` writes anyway, for drafts only.
6. **Preview**: `vizx preview explainer.json` takes a screenshot per screen (in `explainer.preview/`) and reports problems a reader would notice, located by block path: unreadably small diagram text, diagrams or pages that scroll sideways, script errors. Run it with `--mobile` too. If you can view images, look at the screenshots.

Reference commands:

- `vizx components [explainer.json]` lists every component with its props, including the document's custom components. Add `--json` for JSON Schema.
- `vizx schema` prints the JSON Schema of the document.

If `vizx` is not found, ask the user to install it by running `npm link` in the vizexplainer repository.

## The document

```json
{
  "title": "How checkout works",
  "subtitle": "From the Pay button to a confirmed order",
  "summary": "Markdown intro shown under the title.",
  "root": "../..",
  "repository": { "url": "https://github.com/acme/shop", "ref": "main" },
  "components": ["./components/bars.mjs"],
  "entities": { "...": {} },
  "relations": [],
  "blocks": []
}
```

- `root`: the directory that `source.file` paths are relative to. It is resolved against the document's directory and defaults to it. Point it at the repository root.
- `repository`: optional. When set, code blocks get a "View source" link to `ref`. Validation warns when `ref` is not the checked-out commit or when shown files have uncommitted changes, because the links would then show different code. Use the commit you analysed (`git rev-parse HEAD`).
- `components`: optional. Paths to custom component modules, relative to the document.

### Entities

Entities are the things worth naming: files, modules, functions, services, tables, actors, concepts. They are keyed by id.

```json
"entities": {
  "checkout": { "label": "checkout/", "kind": "folder", "summary": "Everything that turns a cart into an order." },
  "checkout.pay": {
    "label": "pay()",
    "kind": "function",
    "parent": "checkout",
    "summary": "Charges the card and records the payment.",
    "details": "Retries once on a network error. Markdown is allowed here.",
    "source": { "file": "src/checkout/pay.ts", "symbol": "pay" }
  }
}
```

- `label` defaults to the id. Use short, recognisable labels.
- `kind` is free text. Each distinct kind gets its own colour, used consistently across the page. Reuse a small set of kinds.
- `summary` is one or two plain-language sentences. Non-technical readers should understand it.
- `details` holds deeper material. Readers see it in the details panel.
- `parent` builds the hierarchy that `tree` and nested `graph` use.
- `source` points at code. Prefer file references over pasted code: they cost fewer tokens and stay exact.
  - `{ "file": "src/pay.ts", "symbol": "PaymentService.charge" }` shows a declaration, including its doc comment, wherever it currently is. **Prefer `symbol`**: it survives edits that move code. Qualify nested names with their container; pick overloads with `#2`. Validation reports unknown or ambiguous symbols with suggestions.
  - `{ "file": "src/pay.ts", "lines": [12, 48] }` shows a fixed range; use it for part of a declaration.
  - Add `"ref": "main"` (any git revision) to read the file as it was at that revision, for example to show old code.
  - `{ "code": "...", "lang": "ts" }` is for snippets that exist in no file.

Every entity gets a details panel with its summary, details, source and connections. Readers open it by clicking the entity anywhere on the page.

### Relations

```json
"relations": [
  { "from": "checkout.pay", "to": "stripe", "kind": "calls" },
  { "from": "checkout.pay", "to": "orders-db", "kind": "writes", "label": "insert payment" }
]
```

`kind` and `label` are free text. A graph edge shows `label`, or `kind` when there is no label.

### Blocks

A block is an object with a `type` (the component name), an optional `id` (used as an anchor) and the component's props:

```json
{ "type": "callout", "tone": "tip", "text": "Payments are idempotent." }
```

Text blocks (`prose`, `callout`, `quiz`, a vertical `timeline`, and section titles and summaries) sit in a centred reading column of about 75 characters. Figures (diagrams, code, tables, cards, stats, columns, tabs, details) use the full page width. Inside a box such as `details`, `tabs` or `columns`, text fills the box.

Container blocks have `children`. Top-level `section` blocks become the section bar at the top of the page, which also shows reading progress; keep their titles short.

### Entity references in text

Every markdown field supports `[[entity-id]]` and `[[entity-id|custom text]]`. A reference is coloured by the entity's kind. Hovering it highlights the same entity everywhere on the page, and clicking it opens the details panel. Use references generously. They connect your prose to your diagrams.

## Components

Run `vizx components` for the exact props. Overview:

| Component | Use it for |
| --- | --- |
| `section` | Titled parts of the narrative. Nest for sub-topics. |
| `prose` | Markdown text with entity references. |
| `callout` | Asides with `tone`: `note`, `tip`, `warning`, `key` (the one idea to remember). |
| `columns` | Side-by-side blocks, e.g. a diagram next to prose. |
| `tabs` | Alternative views, e.g. "Simple" and "Technical". |
| `details` | Collapsible "go deeper" content. |
| `cards` | A grid of entities or custom items. Good for "the main pieces". |
| `stats` | Key figures for a sense of scale. |
| `table` | Comparisons and maps of files to responsibilities. |
| `tree` | Hierarchies from entity `parent` links. |
| `graph` | Auto-laid-out diagram of entities and relations. |
| `sequence` | Who calls whom, in order, with numbered notes. |
| `state` | A state machine: statuses and what moves between them. |
| `code` | Highlighted snippet with highlighted lines and numbered annotations. |
| `diff` | Before/after code: two sources (e.g. the same `symbol` at two `ref`s) or a unified patch. |
| `steps` | Scrollytelling: a pinned diagram or code that each step spotlights. |
| `timeline` | Items in order: history, a lifecycle, a pipeline, a numbered procedure. Vertical, or `across` for up to 6 short items. |
| `glossary` | Definitions of terms, written inline or taken from entity summaries. |
| `quiz` | Check-your-understanding questions with instant feedback. |
| `html` | Raw HTML and CSS escape hatch. |

### graph

- `entities` chooses what to draw; it defaults to all entities. When an entity and its parent are both included, the entity is drawn inside the parent.
- Relations whose endpoints are hidden are **lifted** to the nearest drawn ancestor. You can therefore record relations between files, then draw a folder-level overview by listing only the folders.
- `relationKinds` filters edges. `direction` defaults to `auto`: the graph is laid out both ways and the one that renders larger is kept, so wide, shallow graphs turn downwards instead of shrinking. Set `right` or `down` to choose yourself; `state` takes the same option. `nest: false` draws a flat graph. `edgeLabels: false` hides labels.
- Keep a graph to about 12 nodes; validation warns above 16. Split bigger systems into an overview plus focused graphs.
- Diagrams shrink to fit their space but never below a readable size; past that they scroll sideways. `vizx preview` tells you when that happens.

### steps

```json
{
  "type": "steps",
  "visual": { "type": "code", "source": { "file": "src/pay.ts", "symbol": "PaymentService.charge" } },
  "steps": [
    { "title": "Validate the cart", "text": "Markdown...", "lines": { "match": "validateCart(", "lines": 4 } },
    { "title": "Charge the card", "text": "...", "lines": { "match": "await gateway.charge(", "lines": 6 } }
  ]
}
```

- With a `visual`, the visual stays pinned while the reader scrolls. Each step spotlights its `focus` entities, plus the edges between them, and its `lines` in any code inside the visual.
- The visual can be any block: `graph`, `sequence`, `code`, `cards`, or a custom component.
- The pinned visual gets about 60% of the content width. Keep it compact: `graph` with `direction: "down"` and no more than about 12 nodes, `sequence` with no more than 4 participants, or `code` of up to about 40 lines. Show wider diagrams full width instead.
- `visual` is required. For an ordered list without one, use `timeline` with `"numbered": true`.

### timeline

```json
{ "type": "timeline", "layout": "across", "numbered": true,
  "items": [{ "title": "Edited", "text": "Only the screen holds the change.", "entity": "editor" },
            { "title": "Saved", "when": "after 2 s", "text": "Written to the database.", "tone": "success" }] }
```

- `layout: "vertical"` (the default) reads like text and sits in the reading column. `across` lays items side by side over the full width, for pipelines and lifecycles of up to 6 short items, and turns vertical on narrow screens.
- `numbered: true` numbers the markers, for procedures and stages. `when` is a small label above the title. `tone` colours the marker: `key`, `success` or `warning`.

### code

- Use `entity` to show an entity's `source`, or give `source` directly. Prefer `symbol` over `lines`; validation warns when a whole file of more than 120 lines is shown.
- `highlight`, `annotations[].lines` and `steps[].lines` take the file's real line numbers, or a **text anchor**: `{ "match": "lock.acquire(", "lines": 2 }` finds the one shown line containing that text and covers `lines` lines from there. Prefer anchors: when the code changes, an anchor fails with a clear error, where a number would silently point at the wrong line.
- Annotations appear as numbered markers in the gutter, and each note sits inside the code right after the last line it covers. Hovering a note highlights its lines.

### diff

```json
{ "type": "diff",
  "before": { "file": "src/pay.ts", "symbol": "charge", "ref": "v1.0" },
  "after": { "file": "src/pay.ts", "symbol": "charge" } }
```

Or give `"patch"` with `git diff` output. Unchanged runs collapse to `context` lines (default 3) around each change. In `steps`, `lines` refer to the new side's line numbers.

### state

```json
{ "type": "state",
  "states": [{ "id": "PENDING", "kind": "initial" }, { "id": "PAID", "kind": "final" }, { "id": "FAILED", "kind": "error" }],
  "transitions": [{ "from": "PENDING", "to": "PAID", "label": "card charged" }, { "from": "PENDING", "to": "FAILED", "label": "declined" }] }
```

### quiz and glossary

A `quiz` question has `options` with at least one `correct: true`; an optional `explanation` per option and per question appears after answering. A `glossary` takes `terms` (`term`, `definition`) and/or `entities`, whose labels and summaries become entries. Both help non-experts; use them in explainers meant for learning.

## Writing the explainer

Your readers range from people who have never seen code to senior engineers. Aim for what a skilled technical writer would produce: every sentence earns its place, explains *why*, and is exactly true.

### Process

1. **Outline as reader questions.** Before writing, list the questions a newcomer would ask, in the order they would ask them: what is this for, what are the parts, what happens when I use it, what can go wrong, where do I start reading the code. Each top-level section answers one question. Section titles are short (they sit in the page's top bar); a question can go in the section `summary`.
2. **Draft.** Write the blocks. Prefer a diagram, table or code block where it says more than prose.
3. **Check facts.** Every claim must match code you have read. Do not describe behaviour from names alone. If you are unsure, read more or leave the claim out.
4. **Edit as two readers.** Reread once as a newcomer (is anything unexplained or assumed?) and once as a senior engineer on this codebase (is anything wrong, vague or padded?). Then cut: a first draft is usually a third too long.

### Structure

1. **Open with the big picture.** One or two sentences on what the subject does and why it exists. `stats` and `cards` give a quick sense of shape.
2. **Introduce the main pieces** with a high-level `graph` or `cards`, then go one level deeper.
3. **Walk through one concrete path**, such as a request, a command or a user action, using `steps` or `sequence`. A real example teaches better than an inventory.
4. **Put depth in layers.** Keep the main text simple. Put edge cases, internals and full file lists in `details`, `tabs` or entity `details`.
5. **Use what fits the content.** There are no required sections. For a learning audience, a short `quiz` at the end of a section helps the ideas stick.

### Explain intent, not code

Readers can see *what* the code does by reading it. Your job is to tell them *why*.

- Lead with purpose or consequence, then the mechanism: "To make a crash lose at most a quarter of a second of text, progress is saved every 250 ms."
- When the code reflects a decision, name the trade-off or the alternative it avoids: "Saving on every token would hammer the database, so progress is saved every 250 ms instead."
- Never narrate code line by line ("first it calls X, then it checks Y"). In a code walkthrough, each step says what that part achieves and why it is there.
- Point out what is surprising, deliberate or easy to get wrong. That is what readers cannot get from skimming the code.

### Length budgets

| Text | Budget |
| --- | --- |
| Entity `summary` | One sentence, at most 25 words, understandable without jargon |
| Section `summary` | At most 30 words |
| `prose` paragraph | At most 4 sentences, one idea |
| Step `text` | At most 50 words |
| Sequence `note`, code annotation `note` | At most 20 words |
| Caption | One sentence |
| Callout | At most 3 sentences |

Deeper material goes into entity `details` or a `details` block, not into longer summaries.

### Say each thing once

- If a diagram shows something, the prose must not restate it. Prose adds what the diagram cannot: why it is shaped that way, what to notice, what is missing on purpose.
- A caption tells the reader where to look ("Nothing calls the database directly; everything goes through ChatRepository"). It does not repeat the title or describe the diagram's type.
- Sequence notes, step texts and prose about the same flow must not overlap. Decide which block carries the explanation and keep the others short.
- One name per thing. Once you call it "the reply", do not switch to "the response", "the answer" and "the message". Use entity references (`[[id]]`) so the name is always the same.

### Two audiences in one text

- The first sentence of every summary, section opening and step must make sense to someone who does not program. Engineer-level detail follows.
- Define a technical term the first time it appears, in a few words, or put it in a `glossary`. Prefer plain words when they are just as exact: "saved" over "persisted", "start" over "bootstrap".
- Do not explain what every engineer knows (what a function or a database is). Do explain what is specific to this codebase.

### Concrete and exact

- Use real values and names: "every 250 ms", "16 KB", "10 requests at once", "`ChatRepository`". Not "periodically", "bounded" or "a storage layer".
- Prefer one worked example (this request, this file, this user action) over a general description.
- State facts plainly. Do not hedge ("can potentially", "might help to") when you have read the code; do not claim what you have not verified.

### Words and patterns to avoid

- Filler: "This section explains", "Let's dive in", "It is worth noting that", "In summary", "As mentioned above", "Basically".
- Empty praise: robust, seamless, powerful, elegant, comprehensive, cutting-edge, simply, leverage, utilise.
- Inflated verbs: "is responsible for handling" (say "handles"), "serves as" (say "is"), "in order to" (say "to").
- Rhetorical constructions: "It's not X, it's Y", rhetorical questions in body text, lists of three adjectives.
- Telling instead of showing: "This is important because..." (say why directly).

### Rewrites

| Weak | Strong |
| --- | --- |
| "The `generateResponse` function handles streaming by collecting events and periodically saving them to the repository." | "The reply is saved at most every 250 ms while it streams, so a crash loses a quarter of a second of text at most, without writing to the database on every token." |
| "ChatRepository is responsible for managing data persistence in a robust way." | "Every change to a conversation goes through ChatRepository, inside a database transaction." |
| "This section explains how tools work. Tools are an important part of the system." | Section summary: "One answer can take many round trips: the model asks for a tool, the phone runs it, and the result goes back to the model." |
| Caption: "Sequence diagram of sending a message." | Caption: "Your message is stored before the model is called, so nothing is lost if the network fails." |
| Step: "First it parses the arguments, then it validates them, then it calls the executor." | Step: "Arguments are checked again before running, because the tool's contract may have changed since the model asked." |
| "The system uses various strategies to ensure reliability." | "Nothing is retried automatically: a failure is shown to you, so a click or a write never happens twice." |

### Final check

Before rendering, reread the document and confirm:

- Each section answers one question, and its first sentence works for a non-programmer.
- No paragraph restates a diagram, caption or another block.
- Every claim is something you verified in the code.
- Every term is defined once and named the same way everywhere.
- Summaries, steps and notes are within their budgets.
- None of the words and patterns to avoid appear.

## Custom components

When no built-in component fits and the markup would be reused, write a component module. Use the `html` block only for one-off markup.

```js
// components/bars.mjs
export default ({ z, html, raw, escapeHtml, defineComponent }) =>
  defineComponent({
    name: "bars",                            // lowercase kebab-case; the block's `type`
    description: "Bars comparing one number across entities.", // shown by `vizx components`
    props: z.object({
      items: z.array(z.object({ entity: z.string(), value: z.number() }).strict()).min(2),
    }).strict(),
    render(props, ctx) {
      const max = Math.max(...props.items.map((item) => item.value));
      return html`<ul class="bars">${props.items.map((item) => {
        const entity = ctx.entity(item.entity);
        return html`<li class="${ctx.hueClass(entity?.kind)}">${ctx.ref(item.entity)}
          <span class="bars-fill" style="width: ${(item.value / max) * 100}%"></span></li>`;
      })}</ul>`;
    },
    css: `.bars-fill { display: block; height: .6rem; background: var(--hue-fg); }`,
    script: `/* runs once in the browser when the component is used */`,
  });
```

- The default export is a component, an array of components, or a function that receives the toolkit and returns either. Modules need no imports.
- `html` escapes interpolated values. Nested `html` templates and `raw(...)` are inserted as-is.
- `props` must be a schema built with the provided `z` (Zod 4). Use `.strict()` so typos are caught.
- If `render` throws, the error is reported as an issue for that block.
- Give a custom SVG diagram `data-vx-fit data-width="W" data-height="H"` on its `<svg>` to get the same readable-size fitting as built-in diagrams; `vizx preview` then also checks its text size (it looks for text with class `vx-node-label`).
- Reuse the theme's diagram styles instead of writing your own: `vx-canvas` (the bordered box around a diagram), `vx-node` with `vx-node-box`, `vx-node-label` and `vx-node-kind` (an entity box; put a `vx-hue-N` class on the `vx-node`), and `vx-edge` (a `<g>` around a `<path>`) and `vx-edge-label` (a `<g>` around a `<rect>` and `<text>`). Put `data-vx-diagram` on the figure, `data-node="id"` on nodes, and `data-from`/`data-to` on edges: hovering a node then lights its edges.
- A numbered list of notes for a figure is `<ol class="vx-notes">` with `<li><span class="vx-marker">1</span><div class="vx-prose">…</div></li>` items.
- A component that renders running text should put class `vx-narrow` on its root element, so it sits in the reading column like `prose`. Without it, the component uses the full page width.
- Names must not clash with built-in components.

### Render context (`ctx`)

| Member | Purpose |
| --- | --- |
| `entity(id)` | Looks up an entity and reports an issue if it does not exist. |
| `entities()`, `childrenOf(id)`, `relations()` | Read the shared data. |
| `ref(id, text?)` | An inline entity reference, the same as `[[id]]` or `[[id\|text]]` in markdown. |
| `entityAttrs(id)` | `data-entity` attribute: hover-linking and click-to-open. |
| `hueClass(kind)` | `vx-hue-N` class that sets `--hue-fg` and `--hue-bg` for that kind. |
| `markdown(text)`, `inlineMarkdown(text)` | Markdown with entity references. |
| `code(source, { highlight, markers, dedent })` | Highlighted code (`html`) plus its plain `lines`, `start` and `end`. Each line has `data-line`. |
| `layout(elkGraph)` | Runs an ELK layout for custom diagrams. |
| `renderBlocks(blocks, key)`, `renderBlock(block, key)` | Render nested blocks; `key` is the prop name, used in error paths. |
| `outline` (component field) | Return a title to list the block in the table of contents. |
| `issue(message)`, `warn(message)` | Report an error (blocks rendering) or a warning for this block. |
| `depth`, `uid(prefix)` | Heading level and unique ids. |

### Theme variables

Use these so components match light and dark mode: `--vx-bg`, `--vx-surface`, `--vx-surface-2`, `--vx-text`, `--vx-muted`, `--vx-faint`, `--vx-border`, `--vx-border-strong`, `--vx-accent`, `--vx-accent-2`, `--vx-accent-soft`, `--vx-on-accent`, `--vx-green`, `--vx-amber`, `--vx-red`, `--vx-radius`, `--vx-radius-lg`, `--vx-shadow-sm`, `--vx-shadow`, `--vx-sans`, `--vx-mono`, and `--vx-measure` (the width of the reading column). Inside an element with a `vx-hue-N` class, use `--hue-fg` and `--hue-bg`.

### Browser runtime

Component scripts can use `window.vx`:

- `vx.openEntity(id)` opens the details panel.
- `vx.setFocus(container, { entities: [...], lines: [start, end] })` spotlights entities, edges and code lines inside `container`. Elements match by `data-entity`, or by `data-contains` (space-separated ids of the entities that a drawn element stands for). Edges are elements with `data-from` and `data-to`.
- `vx.refreshFocus(element)` re-applies the focus of the nearest focused ancestor, for example after a hover effect.
- `vx.fitSvg(svg)` re-fits an SVG marked with `data-vx-fit`, for example after changing its content.

## Reference example

In the vizexplainer repository, `examples/vizexplainer/explainer.json` explains the toolkit's own source with `symbol` sources, most built-in components and a custom one.
