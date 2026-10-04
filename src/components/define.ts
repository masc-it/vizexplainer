import type { z } from "zod";
import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { ResolvedEntity } from "../document/model.ts";
import type { LineRange, Relation, SourceRef } from "../document/schema.ts";
import type { Html } from "../html.ts";

export interface ComponentDefinition<Props = any> {
  /** Value of `type` in a block. */
  name: string;
  /** One or two sentences telling an agent when to use this component. */
  description: string;
  /** Schema for the block's props (every key except `type` and `id`). Prefer strict objects. */
  props: z.ZodType<Props>;
  render(props: Props, ctx: RenderContext): Html | string | Promise<Html | string>;
  /** Title to list this block under in the table of contents, if any. */
  outline?(props: Props): string | undefined;
  /** CSS added once per page when the component is used. */
  css?: string;
  /** Browser script added once per page when the component is used. */
  script?: string;
}

export function defineComponent<Props>(component: ComponentDefinition<Props>): ComponentDefinition<Props> {
  return component;
}

export interface CodeOptions {
  highlight?: readonly LineRange[];
  /** Remove indentation shared by all shown lines. Defaults to true. */
  dedent?: boolean;
  markers?: readonly { line: number; label: string }[];
}

export interface RenderedCode {
  html: Html;
  /** File path when the source came from a file. */
  file?: string;
  /** The symbol the lines were resolved from, if any. */
  symbol?: string;
  start: number;
  end: number;
  /** The shown lines as plain text, after dedenting. */
  lines: string[];
  lang: string;
  /** Link to the source in the repository, when the document declares one. */
  url?: string;
}

export interface RenderContext {
  /** Path of the current block, e.g. `blocks[2].children[0]`. */
  readonly path: string;
  /** Outline nesting level, counting the current block if it is a section: 0 outside sections, 1 in a top-level section. */
  readonly depth: number;
  readonly doc: { title: string };

  /** Looks up an entity, recording an issue when it does not exist. */
  entity(id: string): ResolvedEntity | undefined;
  entities(): ResolvedEntity[];
  childrenOf(id: string | undefined): ResolvedEntity[];
  relations(): readonly Relation[];

  /** Renders nested blocks. `key` is the prop name they live under, for error paths. */
  renderBlocks(blocks: unknown, key: string): Promise<Html>;
  renderBlock(block: unknown, key: string): Promise<Html>;

  /** Markdown supporting entity references: `[[entity-id]]` or `[[entity-id|custom text]]`. */
  markdown(text: string): Html;
  inlineMarkdown(text: string): Html;
  /** Syntax-highlighted code. Each line carries `data-line` for focusing. */
  code(source: SourceRef, options?: CodeOptions): Promise<RenderedCode>;
  /** Runs an ELK layout (https://eclipse.dev/elk/reference.html). Coordinates of nested nodes and edges are relative to their container. */
  layout(graph: ElkNode): Promise<ElkNode>;

  /** An inline entity reference, as `[[id]]` renders in markdown. `text` defaults to the entity's label. */
  ref(id: string, text?: string): Html;
  /** Attributes that make an element linked to an entity: hover-highlighting and click-to-open details. */
  entityAttrs(id: string): Html;
  /** Colour class (`vx-hue-N`) for an entity kind, consistent across the page. */
  hueClass(kind: string | undefined): string;
  uid(prefix: string): string;
  /** Records an error: the document is wrong and will not render without --force. */
  issue(message: string): void;
  /** Records a warning: likely a mistake or hard to read, but renderable. Fails only in strict mode. */
  warn(message: string): void;
}
