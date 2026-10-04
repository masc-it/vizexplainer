import { Marked, type TokenizerAndRendererExtension } from "marked";
import { raw, type Html } from "../html.ts";

/** Renders an entity reference; receives the id and optional custom text. */
export type RefRenderer = (id: string, text: string | undefined) => Html;

const REF = /^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/;

function refExtension(renderRef: RefRenderer): TokenizerAndRendererExtension {
  return {
    name: "entityRef",
    level: "inline",
    start: (src) => {
      const index = src.indexOf("[[");
      return index === -1 ? undefined : index;
    },
    tokenizer(src) {
      const match = REF.exec(src);
      if (!match) return undefined;
      return { type: "entityRef", raw: match[0], id: match[1]!.trim(), text: match[2]?.trim() };
    },
    renderer: (token) => renderRef(token["id"] as string, token["text"] as string | undefined).value,
  };
}

export function renderMarkdown(text: string, renderRef: RefRenderer): Html {
  const marked = new Marked({ extensions: [refExtension(renderRef)], gfm: true });
  return raw(marked.parse(text, { async: false }));
}

export function renderInlineMarkdown(text: string, renderRef: RefRenderer): Html {
  const marked = new Marked({ extensions: [refExtension(renderRef)], gfm: true });
  return raw(marked.parseInline(text, { async: false }));
}
