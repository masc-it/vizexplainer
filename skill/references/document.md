# Document and chapters

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
  "chapters": ["chapters/overview.json", "chapters/payment.json"]
}
```

- `root`: the directory that `source.file` paths are relative to. It is resolved against the document's directory and defaults to it. Point it at the repository root.
- `repository`: optional. When set, code blocks get a "View source" link to `ref`. Validation warns when `ref` is not the checked-out commit or when shown files have uncommitted changes, because the links would then show different code. Use the commit you analysed (`git rev-parse HEAD`).
- `components`: optional. Paths to custom component modules, relative to the document.

## Chapter files

The manifest holds metadata, shared entities and relations, and an ordered `chapters` list. Each listed file contains one ordinary `section` block:

```json
{
  "type": "section",
  "id": "overview",
  "title": "Overview",
  "summary": "What does the shop do for its customers?",
  "children": [
    { "type": "prose", "text": "The shop turns a cart into a paid order." }
  ]
}
```

- List files in reading order; filenames do not determine order.
- Paths in `chapters` are relative to the manifest. Absolute paths and duplicate resolved paths are errors.
- Source files throughout the book use the manifest's `root`, never the chapter directory. Custom component paths also stay relative to the manifest.
- Entities and relations live only in the manifest and are shared by every chapter. Entity ids and block ids are global.
- A chapter is a section, not another document or a manifest. There are no recursive includes.
- An outline stub is a section with a title, a reader question in `summary`, and `"children": []`. Create every listed file before validating.
- Missing files, invalid JSON and non-section chapters stop the build. Component errors identify the chapter and JSON path, for example `chapters/payment.json:$.children[0].text`.
- `validate`, `render` and `preview` take the manifest path. Preview findings use the same chapter paths. A chapter file is not a standalone document.
- Single-file documents still use a non-empty `blocks` array instead of `chapters`. Give exactly one of these fields; an empty chapter list is invalid.

### Starting from a scan

`vizx scan <repo> -o explainer.json` still writes a single-file draft with entities, relations and starter blocks. Scan output is an inventory, not the book's outline.

Before drafting prose:
1. Choose chapters from the reader's questions.
2. Move useful starter blocks into the `children` of a chapter section; remove the rest.
3. Write each section to its own JSON file, including empty stubs for chapters not yet drafted.
4. Replace the manifest's `blocks` field with the ordered `chapters` list. Keep its `root`, metadata, entities and relations.
5. Prune the shared inventory to things the explanation needs. Draft and revise one chapter at a time.

## Entities

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

## Relations

```json
"relations": [
  { "from": "checkout.pay", "to": "stripe", "kind": "calls" },
  { "from": "checkout.pay", "to": "orders-db", "kind": "writes", "label": "insert payment" }
]
```

`kind` and `label` are free text. A graph edge shows `label`, or `kind` when there is no label.

## Blocks

A block is an object with a `type` (the component name), an optional `id` (used as an anchor) and the component's props:

```json
{ "type": "callout", "tone": "tip", "text": "Payments are idempotent." }
```

Every block starts at the same left edge. Text blocks (`prose`, `callout`, `quiz`, a vertical `timeline`, section titles and summaries) stop at a reading width of about 75 characters; callouts and quizzes are set apart by a coloured rule and header, not a box. Boxes and figures (diagrams, code, tables, cards, stats, columns, tabs, details) use the full page width, so they share one right edge.

Container blocks have `children`. Top-level `section` blocks become the section bar at the top of the page, which also shows reading progress; keep their titles short.

## Entity references in text

Every markdown field supports `[[entity-id]]` and `[[entity-id|custom text]]`. A reference is underlined in the colour of the entity's kind. Hovering it highlights the same entity everywhere on the page, and clicking it opens the details panel. References connect your prose to your diagrams; link an entity where it matters, usually its first mention in a section, rather than on every mention.
