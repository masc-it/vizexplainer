# Custom components

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
- Reuse the theme's diagram styles instead of writing your own: `vx-canvas` (the scrolling area around a diagram), `vx-node` with `vx-node-box`, `vx-node-label` and `vx-node-kind` (an entity box; put a `vx-hue-N` class on the `vx-node`), and `vx-edge` (a `<g>` around a `<path>`) and `vx-edge-label` (a `<g>` around a `<rect>` and `<text>`). Put `data-vx-diagram` on the figure, `data-node="id"` on nodes, and `data-from`/`data-to` on edges: hovering a node then lights its edges.
- Keep the page calm: no frame unless the content is a different surface (like code) or clickable, and colour only where it means "look here" (the reader's hover or focus, a tone the author chose). Use `--vx-text` and `--vx-muted` for everything else.
- A numbered list of notes for a figure is `<ol class="vx-notes">` with `<li><span class="vx-marker">1</span><div class="vx-prose">…</div></li>` items.
- A component that renders unboxed running text should put class `vx-narrow` on its root element, so its lines stop at the reading width like `prose`. Boxes and figures should not: they use the full page width.
- Names must not clash with built-in components.

## Render context (`ctx`)

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

## Theme variables

Use these so components match light and dark mode: `--vx-bg`, `--vx-surface`, `--vx-surface-2`, `--vx-text`, `--vx-muted`, `--vx-faint`, `--vx-border`, `--vx-border-strong`, `--vx-accent`, `--vx-accent-2`, `--vx-accent-soft`, `--vx-on-accent`, `--vx-green`, `--vx-amber`, `--vx-red`, `--vx-radius`, `--vx-radius-lg`, `--vx-shadow-sm`, `--vx-shadow`, `--vx-sans`, `--vx-mono`, and `--vx-measure` (the width of the reading column). Inside an element with a `vx-hue-N` class, use `--hue-fg` and `--hue-bg`.

## Browser runtime

Component scripts can use `window.vx`:

- `vx.openEntity(id)` opens the details panel.
- `vx.setFocus(container, { entities: [...], lines: [start, end] })` spotlights entities, edges and code lines inside `container`. Elements match by `data-entity`, or by `data-contains` (space-separated ids of the entities that a drawn element stands for). Edges are elements with `data-from` and `data-to`.
- `vx.refreshFocus(element)` re-applies the focus of the nearest focused ancestor, for example after a hover effect.
- `vx.fitSvg(svg)` re-fits an SVG marked with `data-vx-fit`, for example after changing its content.
