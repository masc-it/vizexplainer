import { z } from "zod";
import { html, raw } from "../../html.ts";
import { defineComponent } from "../define.ts";

export const rawHtml = defineComponent({
  name: "html",
  description:
    "Escape hatch: raw HTML (and optional CSS) inserted as-is. Use theme variables such as var(--vx-accent). Prefer a custom component when the markup is reused.",
  props: z.object({ html: z.string(), css: z.string().optional() }).strict(),
  render: (props) => html`${props.css !== undefined && html`<style>${raw(props.css)}</style>`}${raw(props.html)}`,
});
