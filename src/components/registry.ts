import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { escapeHtml, html, raw } from "../html.ts";
import { error, joinPath, type Issue } from "../issues.ts";
import { builtinComponents } from "./builtin/index.ts";
import { defineComponent, type ComponentDefinition } from "./define.ts";

export interface Registry {
  get(name: string): ComponentDefinition | undefined;
  names(): string[];
  all(): ComponentDefinition[];
}

/** Helpers handed to custom component modules, so they need no imports of their own. */
export const toolkit = { z, html, raw, escapeHtml, defineComponent };
export type Toolkit = typeof toolkit;

const fn = (message: string) => z.custom<(...args: never[]) => unknown>((value) => typeof value === "function", message);

const ComponentShape = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "component names are lowercase kebab-case"),
  description: z.string().min(1),
  props: z.custom<z.ZodType>((value) => value instanceof z.ZodType, "props must be a zod schema built with the provided `z`"),
  render: fn("render must be a function"),
  outline: fn("outline must be a function").optional(),
  css: z.string().optional(),
  script: z.string().optional(),
});

export function createRegistry(components: readonly ComponentDefinition[]): Registry {
  const byName = new Map(components.map((component) => [component.name, component]));
  return {
    get: (name) => byName.get(name),
    names: () => [...byName.keys()],
    all: () => [...byName.values()],
  };
}

/**
 * Loads custom components. A module's default export is a component, an array of
 * components, or a function receiving the toolkit and returning either.
 */
export async function loadRegistry(modulePaths: readonly string[], baseDir: string): Promise<{ registry: Registry; issues: Issue[] }> {
  const issues: Issue[] = [];
  const components: ComponentDefinition[] = [...builtinComponents];
  const taken = new Set(components.map((component) => component.name));

  for (const [index, modulePath] of modulePaths.entries()) {
    const issuePath = joinPath("components", index);
    let exported: unknown;
    try {
      const module = await import(pathToFileURL(path.resolve(baseDir, modulePath)).href);
      exported = module.default;
    } catch (failure) {
      issues.push(error(issuePath, `cannot load "${modulePath}": ${failure instanceof Error ? failure.message : String(failure)}`));
      continue;
    }
    if (typeof exported === "function") exported = exported(toolkit);
    for (const candidate of Array.isArray(exported) ? exported : [exported]) {
      const shape = ComponentShape.safeParse(candidate);
      if (!shape.success) {
        const detail = shape.error.issues.map((issue) => `${issue.path.join(".") || "default export"}: ${issue.message}`).join("; ");
        issues.push(error(issuePath, `"${modulePath}" does not export a valid component: ${detail}`));
        continue;
      }
      if (taken.has(shape.data.name)) {
        issues.push(error(issuePath, `component name "${shape.data.name}" is already taken`));
        continue;
      }
      taken.add(shape.data.name);
      components.push(candidate as ComponentDefinition);
    }
  }
  return { registry: createRegistry(components), issues };
}
