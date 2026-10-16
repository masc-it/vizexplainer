# Components

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

## graph

- `entities` chooses what to draw; it defaults to all entities. When an entity and its parent are both included, the entity is drawn inside the parent.
- Relations whose endpoints are hidden are **lifted** to the nearest drawn ancestor. You can therefore record relations between files, then draw a folder-level overview by listing only the folders.
- `relationKinds` filters edges. `direction` defaults to `auto`: the graph is laid out both ways and the one that renders larger is kept, so wide, shallow graphs turn downwards instead of shrinking. Set `right` or `down` to choose yourself; `state` takes the same option. `nest: false` draws a flat graph. `edgeLabels: false` hides labels.
- Keep a graph to about 12 nodes; validation warns above 16. Split bigger systems into an overview plus focused graphs.
- Diagrams shrink to fit their space but never below a readable size; past that they scroll sideways. `vizx preview` tells you when that happens.

## steps

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

## timeline

```json
{ "type": "timeline", "layout": "across", "numbered": true,
  "items": [{ "title": "Edited", "text": "Only the screen holds the change.", "entity": "editor" },
            { "title": "Saved", "when": "after 2 s", "text": "Written to the database.", "tone": "success" }] }
```

- `layout: "vertical"` (the default) reads like text and sits in the reading column. `across` lays items side by side over the full width, for pipelines and lifecycles of up to 6 short items, and turns vertical on narrow screens.
- `numbered: true` numbers the markers, for procedures and stages. `when` is a small label above the title. `tone` colours the marker: `key`, `success` or `warning`.

## code

- Use `entity` to show an entity's `source`, or give `source` directly. Prefer `symbol` over `lines`; validation warns when a whole file of more than 120 lines is shown.
- `highlight`, `annotations[].lines` and `steps[].lines` take the file's real line numbers, or a **text anchor**: `{ "match": "lock.acquire(", "lines": 2 }` finds the one shown line containing that text and covers `lines` lines from there. Prefer anchors: when the code changes, an anchor fails with a clear error, where a number would silently point at the wrong line.
- Annotations appear as numbered markers in the gutter, and each note sits inside the code right after the last line it covers. Hovering a note highlights its lines.

## diff

```json
{ "type": "diff",
  "before": { "file": "src/pay.ts", "symbol": "charge", "ref": "v1.0" },
  "after": { "file": "src/pay.ts", "symbol": "charge" } }
```

Or give `"patch"` with `git diff` output. Unchanged runs collapse to `context` lines (default 3) around each change. In `steps`, `lines` refer to the new side's line numbers.

## state

```json
{ "type": "state",
  "states": [{ "id": "PENDING", "kind": "initial" }, { "id": "PAID", "kind": "final" }, { "id": "FAILED", "kind": "error" }],
  "transitions": [{ "from": "PENDING", "to": "PAID", "label": "card charged" }, { "from": "PENDING", "to": "FAILED", "label": "declined" }] }
```

## quiz and glossary

A `quiz` question has `options` with at least one `correct: true`; an optional `explanation` per option and per question appears after answering. A `glossary` takes `terms` (`term`, `definition`) and/or `entities`, whose labels and summaries become entries. Both help non-experts; use them in explainers meant for learning.
