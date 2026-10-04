// A custom component: horizontal bars comparing one number across entities or labels.
// Custom modules receive the toolkit ({ z, html, raw, escapeHtml, defineComponent }), so they need no imports.
export default ({ z, html, defineComponent }) =>
  defineComponent({
    name: "bars",
    description: "Horizontal bars comparing one quantity (lines of code, call counts, sizes) across entities or labels.",
    props: z
      .object({
        unit: z.string().describe("What the numbers count, e.g. `lines`"),
        items: z
          .array(z.object({ value: z.number().nonnegative(), entity: z.string().optional(), label: z.string().optional() }).strict())
          .min(2),
        caption: z.string().optional(),
      })
      .strict(),
    render(props, ctx) {
      const max = Math.max(...props.items.map((item) => item.value));
      return html`<figure class="vx-figure">
        <ul class="bars">
          ${props.items.map((item) => {
            const entity = item.entity !== undefined ? ctx.entity(item.entity) : undefined;
            const name = item.entity !== undefined ? ctx.ref(item.entity, item.label) : item.label;
            return html`<li class="${ctx.hueClass(entity?.kind)}">
              <span class="bars-name">${name}</span>
              <span class="bars-track"><span class="bars-fill" style="width: ${(item.value / max) * 100}%"></span></span>
              <span class="bars-value">${item.value.toLocaleString("en")} ${props.unit}</span>
            </li>`;
          })}
        </ul>
        ${props.caption !== undefined && html`<figcaption>${ctx.inlineMarkdown(props.caption)}</figcaption>`}
      </figure>`;
    },
    css: `
.bars { list-style: none; margin: 0; padding: 1rem 1.1rem; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.6rem 1rem; align-items: center; border: 1px solid var(--vx-border); border-radius: var(--vx-radius-lg); background: var(--vx-surface); }
.bars li { display: contents; }
.bars-track { height: 0.7rem; border-radius: 999px; background: var(--vx-surface-2); overflow: hidden; }
.bars-fill { display: block; height: 100%; border-radius: inherit; background: var(--hue-fg, var(--vx-accent)); }
.bars-value { font: 600 0.82rem var(--vx-mono); color: var(--vx-muted); text-align: right; }
`,
  });
