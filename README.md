# vizexplainer

A toolkit for AI agents to build visual explainers of codebases, code paths and concepts. The output is one self-contained HTML file.

An agent analyses the subject and writes a JSON document. `vizx` validates the document and renders it with auto-laid-out diagrams, highlighted code, scrollytelling walkthroughs, linked entity references, a details panel, and light and dark mode. Readers need only a browser.

## How it works

The document has two layers:

- **Data**: `entities` (things worth naming) and `relations` (how they connect). Entities point at source code by declaration name (`"symbol": "ChatService.send"`), line range or git revision, and line references can be text anchors, so references survive edits or fail loudly.
- **Presentation**: `blocks`, a tree of components that refer to entities by id. The agent composes blocks freely. There are no fixed views.

Built-in components include `section`, `prose`, `callout`, `columns`, `tabs`, `details`, `cards`, `stats`, `table`, `tree`, `graph`, `sequence`, `state`, `code`, `diff`, `steps`, `timeline`, `glossary`, `quiz` and `html`. When none fits, the agent writes a small custom component module. The document lists it, and it gets the same render context as the built-ins.

Graph layout (ELK) and syntax highlighting (Shiki) run at build time. The page therefore ships finished SVG and HTML, with only a small script for interaction.

## Usage

```sh
npm install
npm run build
npm link            # puts `vizx` on the PATH

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

## For agents

Give the agent [`skill/SKILL.md`](skill/SKILL.md). It covers the workflow, the document format, every component, guidance on explaining well, and how to write custom components.

## Example

[`examples/vizexplainer/explainer.json`](examples/vizexplainer/explainer.json) explains this repository's own source. It uses every built-in component and one custom component ([`bars.mjs`](examples/vizexplainer/components/bars.mjs)).

## Development

```sh
npm test            # vitest
npm run typecheck
node src/cli.ts render <doc>   # run from source (Node 22.18+ strips types natively)
```

Code layout:

- `src/document/`: schema and indexed model of entities and relations.
- `src/sources/`: symbol location, line anchors, line diffs and language detection.
- `src/scan/`: file listing, import detection and the draft document.
- `src/preview/`: headless-browser screenshots and rendering checks.
- `src/components/`: the component contract, the registry and the built-in components.
- `src/render/`: the block engine, code highlighting, markdown, entity panels and the page shell.
- `assets/`: theme CSS and browser runtime, inlined into every page.
- `src/build.ts`: orchestrates a build. `src/cli.ts` is the `vizx` command.
