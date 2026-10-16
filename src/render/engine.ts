import elkModule from "elkjs/lib/elk.bundled.js";
import type { ELK as ElkInstance } from "elkjs/lib/elk-api.js";
import type { ComponentDefinition, RenderContext } from "../components/define.ts";
import type { Registry } from "../components/registry.ts";
import type { Model } from "../document/model.ts";
import type { Document } from "../document/schema.ts";
import { html, raw, type Html } from "../html.ts";
import { error, joinPath, suggest, warning, zodIssues, type Issue } from "../issues.ts";
import type { CodeRenderer } from "./code.ts";
import { renderInlineMarkdown, renderMarkdown, type RefRenderer } from "./markdown.ts";

export interface OutlineEntry {
  id: string;
  title: string;
  children: OutlineEntry[];
}

export interface Engine {
  renderBlocks(blocks: readonly unknown[], path: string, blockPaths?: readonly string[]): Promise<Html>;
  /** A context for rendering outside the block tree, e.g. entity detail panels. */
  context(path: string, visible?: boolean): RenderContext;
  outline: OutlineEntry[];
  usedComponents: Set<ComponentDefinition>;
  /** Entities looked up while rendering blocks and the summary, i.e. the ones the reader can see. */
  shownEntities: Set<string>;
  issues: Issue[];
}

// elkjs is CommonJS: under nodenext its default import is `module.exports`, i.e. the constructor itself.
const ELK = elkModule as unknown as new () => ElkInstance;

const HUE_COUNT = 8;

export function createEngine(deps: { doc: Document; model: Model; registry: Registry; code: CodeRenderer }): Engine {
  const { doc, model, registry, code } = deps;
  const elk = new ELK();
  const issues: Issue[] = [];
  const reported = new Set<string>();
  // Components may look up the same thing several times; report each problem once.
  const report = (issue: Issue) => {
    const key = `${issue.path}\u0000${issue.message}`;
    if (reported.has(key)) return;
    reported.add(key);
    issues.push(issue);
  };
  const usedComponents = new Set<ComponentDefinition>();
  const shownEntities = new Set<string>();
  const outline: OutlineEntry[] = [];
  const anchors = new Set<string>();
  const hues = new Map<string, number>();
  let uidCounter = 0;
  // Assign colours in document order so they stay stable regardless of async render order.
  for (const entity of model.entities.values()) if (entity.kind !== undefined) hueClass(entity.kind);

  function hueClass(kind: string | undefined): string {
    if (kind === undefined) return "vx-hue-0";
    if (!hues.has(kind)) hues.set(kind, (hues.size % HUE_COUNT) + 1);
    return `vx-hue-${hues.get(kind)}`;
  }

  function claimAnchor(base: string, path: string, explicit: boolean): string {
    if (explicit && anchors.has(base)) report(error(joinPath(path, "id"), `duplicate block id "${base}"`));
    let anchor = base;
    for (let n = 2; anchors.has(anchor); n++) anchor = `${base}-${n}`;
    anchors.add(anchor);
    return anchor;
  }

  function context(path: string, depth = 0, outlineList: OutlineEntry[] = [], visible = true): RenderContext {
    const issue = (message: string) => report(error(path, message));
    const warn = (message: string) => report(warning(path, message));
    // Hidden panels must not count their references as visible in the narrative.
    const entity = (id: string) => {
      const found = model.entities.get(id);
      if (!found) issue(`unknown entity "${id}"${suggest(id, model.entities.keys())}`);
      else if (visible) shownEntities.add(id);
      return found;
    };
    const renderRef: RefRenderer = (id, text) => {
      const found = entity(id);
      if (!found) return html`<span class="vx-ref-missing">${text ?? id}</span>`;
      return html`<span class="vx-ref ${hueClass(found.kind)}" data-entity="${id}" tabindex="0" role="button">${text ?? found.label}</span>`;
    };

    const ctx: RenderContext = {
      path,
      depth,
      doc: { title: doc.title },
      entity,
      entities: () => [...model.entities.values()],
      childrenOf: model.childrenOf,
      relations: () => model.relations,
      renderBlocks: async (blocks, key) => {
        const blocksPath = joinPath(path, key);
        if (!Array.isArray(blocks)) {
          report(error(blocksPath, "expected an array of blocks"));
          return raw("");
        }
        const rendered = await Promise.all(
          blocks.map((block, index) => renderBlock(block, joinPath(blocksPath, index), depth, outlineList)),
        );
        return html`${rendered}`;
      },
      renderBlock: (block, key) => renderBlock(block, joinPath(path, key), depth, outlineList),
      markdown: (text) => renderMarkdown(text, renderRef),
      inlineMarkdown: (text) => renderInlineMarkdown(text, renderRef),
      ref: renderRef,
      code: async (source, options) => {
        const result = await code.render(source, options);
        if (result.ok) return result.code;
        issue(result.message);
        return { html: html`<pre class="vx-code-missing">${result.message}</pre>`, start: 1, end: 1, lines: [], lang: "text" };
      },
      layout: (graph) => elk.layout(graph),
      entityAttrs: (id) => {
        entity(id);
        return html`data-entity="${id}"`;
      },
      hueClass,
      uid: (prefix) => `${prefix}-${++uidCounter}`,
      issue,
      warn,
    };
    return ctx;
  }

  async function renderBlock(block: unknown, path: string, depth: number, outlineList: OutlineEntry[]): Promise<Html> {
    if (typeof block !== "object" || block === null || typeof (block as { type?: unknown }).type !== "string") {
      report(error(path, 'a block must be an object with a string "type"'));
      return raw("");
    }
    const { type, id, ...props } = block as { type: string; id?: unknown; [key: string]: unknown };
    const component = registry.get(type);
    if (!component) {
      report(error(joinPath(path, "type"), `unknown component "${type}"${suggest(type, registry.names())}`));
      return raw("");
    }
    if (id !== undefined && typeof id !== "string") {
      report(error(joinPath(path, "id"), "block id must be a string"));
      return raw("");
    }
    const parsed = component.props.safeParse(props);
    if (!parsed.success) {
      zodIssues(parsed.error, path).forEach(report);
      return raw("");
    }
    usedComponents.add(component);

    const title = component.outline?.(parsed.data);
    const anchor =
      id !== undefined ? claimAnchor(id, path, true) : title !== undefined ? claimAnchor(slugify(title), path, false) : undefined;
    let childOutline = outlineList;
    let childDepth = depth;
    if (title !== undefined && anchor !== undefined) {
      const entry: OutlineEntry = { id: anchor, title, children: [] };
      outlineList.push(entry);
      childOutline = entry.children;
      childDepth = depth + 1;
    }

    try {
      const output = await component.render(parsed.data, context(path, childDepth, childOutline));
      const body = typeof output === "string" ? raw(output) : output;
      // data-path lets `vizx preview` report rendering problems against the document.
      return html`<div class="vx-b vx-b--${type}" data-path="${path}"${anchor ? html` id="${anchor}"` : ""}>${body}</div>`;
    } catch (failure) {
      report(error(path, `component "${type}" failed to render: ${failure instanceof Error ? failure.message : String(failure)}`));
      return raw("");
    }
  }

  return {
    renderBlocks: async (blocks, path, blockPaths) => {
      const rendered = await Promise.all(blocks.map((block, index) => renderBlock(block, blockPaths?.[index] ?? joinPath(path, index), 0, outline)));
      return html`${rendered}`;
    },
    context: (path, visible) => context(path, 0, [], visible),
    outline,
    usedComponents,
    shownEntities,
    issues,
  };
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-") || "section"
  );
}
