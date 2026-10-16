# vizexplainer

A toolkit for AI agents to build visual explainers of codebases, code paths and concepts. The output is one self-contained HTML file.

An agent outlines reader questions, then drafts and revises one chapter JSON file at a time. A manifest lists the chapters in reading order and holds shared entities and relations. `vizx` combines them into one document and renders it with diagrams, highlighted code, scrollytelling, linked references, a details panel, and light and dark mode. Readers need only a browser.

## How it works

The document has two layers:

- **Data**: `entities` (things worth naming) and `relations` (how they connect). Entities point at source code by declaration name (`"symbol": "ChatService.send"`), line range or git revision, and line references can be text anchors, so references survive edits or fail loudly.
- **Presentation**: `blocks`, a tree of components that refer to entities by id. The agent composes blocks freely. There are no fixed views.

Built-in components include `section`, `prose`, `callout`, `columns`, `tabs`, `details`, `cards`, `stats`, `table`, `tree`, `graph`, `sequence`, `state`, `code`, `diff`, `steps`, `timeline`, `glossary`, `quiz` and `html`. When none fits, the agent writes a small custom component module. The document lists it, and it gets the same render context as the built-ins.

Graph layout (ELK) and syntax highlighting (Shiki) run at build time. The page therefore ships finished SVG and HTML, with only a small script for interaction.

## Setup

From this checkout, with Node 22.18+ and npm installed:

```sh
npm run setup
```

This runs `npm ci --include=dev`, `npm run build` and `npm link`, then copies the entire `skill/` directory, including references, to:

- `~/.agents/skills/vizexplainer/`
- `~/.claude/skills/vizexplainer/`

Rerun after updating the checkout. Setup replaces these two skill directories (including local edits and stale files); other skills are untouched. Existing destination symlinks are replaced with copies without modifying their targets. Installation stops on failure; skill copying starts only after the npm commands succeed.

`vizx` is linked to this checkout, so keep it in place and ensure npm's global bin directory is on your `PATH`. The skills are copies, not symlinks. To install only the CLI, run `npm ci --include=dev`, `npm run build` and `npm link` manually.

## Usage

```sh
vizx scan ~/code/shop -o shop.json     # structure report, plus a draft document
vizx symbols src/pay.ts                # declarations usable as "symbol" sources
vizx validate shop.json                # errors and warnings, with exact paths
vizx render shop.json -o shop.html
vizx preview shop.json --mobile        # screenshots and rendering checks (needs Chrome)
vizx components                        # component catalogue with props
vizx schema                            # document JSON Schema
```

- **`scan`** lists folders, files, line counts, import relations (TS/JS, Python, Kotlin/Java, Go, Rust) and the key declarations of the most connected files. With `-o` it writes a valid draft document to start from.
- **`validate`** separates errors (the document is wrong) from warnings: stale source links (`repository.ref` differs from the checkout, or shown files have uncommitted changes), crowded diagrams, steps that spotlight nothing, orphaned entities, overlong summaries. `--strict` fails on warnings.
- **`render`** writes nothing on errors unless you pass `--force`.
- **`preview`** screenshots the page one screen at a time and reports, by block path, problems a reader would notice: unreadably small diagram text, sideways scrolling, script errors. It uses a locally installed Chrome, Chromium, Edge or Brave, or `VIZX_CHROME`.

## Writing chapters

Keep shared metadata and data in `explainer.json`:

```json
{
  "title": "How checkout works",
  "root": "../..",
  "entities": {},
  "relations": [],
  "chapters": ["chapters/overview.json", "chapters/payment.json"]
}
```

Each chapter file is one ordinary `section` block:

```json
{
  "type": "section",
  "title": "Overview",
  "summary": "What does checkout do for a customer?",
  "children": []
}
```

Start with these outline stubs. Read, draft, validate and revise one chapter before moving to the next; finish with a whole-book edit. Put prose, diagrams and other blocks inside each section's `children`.

- Chapter paths are relative to the manifest; their list order is the reading order. Chapters cannot include other files.
- All sources use the manifest's `root`. Custom component paths remain relative to the manifest. Entity and block ids are shared across the book.
- Pass the manifest to `validate`, `render`, `preview` and `components`. Errors and preview findings identify chapter paths, such as `chapters/payment.json:$.children[0]`.
- Missing files, invalid JSON and non-section chapters stop loading. Empty lists, duplicate paths, absolute chapter paths, and mixing `chapters` with `blocks` are errors.
- Single-file documents with `blocks` still work. `scan -o` still produces one: move its useful starter blocks into chapter sections, then replace `blocks` with the ordered `chapters` list.

## For agents

Give the agent [`skill/SKILL.md`](skill/SKILL.md). It contains the incremental workflow, a minimal example and essential writing rules. Detailed [document](skill/references/document.md), [component](skill/references/components.md), [writing](skill/references/writing.md) and [custom-component](skill/references/custom-components.md) references are loaded only when needed.

## Example

[`examples/vizexplainer/explainer.json`](examples/vizexplainer/explainer.json) lists six [chapter files](examples/vizexplainer/chapters/) explaining this repository's own source. It uses every built-in component and one custom component ([`bars.mjs`](examples/vizexplainer/components/bars.mjs)).

## Development

```sh
npm test            # vitest
npm run typecheck
node src/cli.ts render <doc>   # run from source (Node 22.18+ strips types natively)
```

Code layout:

- `src/document/`: schemas, manifest/chapter loading, and indexed model of entities and relations.
- `src/sources/`: symbol location, line anchors, line diffs and language detection.
- `src/scan/`: file listing, import detection and the draft document.
- `src/preview/`: headless-browser screenshots and rendering checks.
- `src/components/`: the component contract, the registry and the built-in components.
- `src/render/`: the block engine, code highlighting, markdown, entity panels and the page shell.
- `assets/`: theme CSS and browser runtime, inlined into every page.
- `src/build.ts`: orchestrates a build. `src/cli.ts` is the `vizx` command.
