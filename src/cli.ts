#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { buildExplainer, loadDocument, loadDocumentRegistry } from "./build.ts";
import { loadRegistry } from "./components/registry.ts";
import { Document } from "./document/schema.ts";
import { formatIssue, hasErrors, type Issue } from "./issues.ts";
import { languageFromFile } from "./sources/language.ts";
import { listSymbols } from "./sources/symbols.ts";
import { draftDocument, scanReport, scanRepository } from "./scan/scan.ts";
import { previewPage, writePreviewPage } from "./preview/preview.ts";

const USAGE = `vizx: build visual explainers as self-contained HTML

Analyse
  vizx scan <dir> [-o draft.json] [--title T]        Report a codebase's folders, files, imports and key declarations.
        [--max-files 3000] [--symbols-for 20]        With -o, also write a draft document to start from.
  vizx symbols <file> [--json]                       List declarations and line ranges, for "symbol" sources.

Build
  vizx validate <explainer.json> [--json] [--strict] Check the document. Errors fail; warnings fail only with --strict.
  vizx render <explainer.json> [-o out.html]         Write the HTML page. Refuses on errors unless --force.
        [--force] [--strict]
  vizx preview <explainer.json|page.html> [-o dir]   Screenshot the page screen by screen and report problems a reader
        [--mobile] [--dark] [--width W --height H]   would notice. Needs Chrome, Chromium, Edge or Brave (or VIZX_CHROME).

Reference
  vizx components [explainer.json] [--json]          Components and their props, including the document's custom ones.
  vizx schema                                        The document JSON Schema.

Agent guide: skill/SKILL.md in the vizexplainer repository.`;

type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema | JsonSchema[];
  prefixItems?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  default?: unknown;
  additionalProperties?: unknown;
};

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      force: { type: "boolean", default: false },
      strict: { type: "boolean", default: false },
      "max-files": { type: "string", default: "3000" },
      "symbols-for": { type: "string", default: "20" },
      title: { type: "string" },
      width: { type: "string", default: "1440" },
      height: { type: "string", default: "900" },
      dark: { type: "boolean", default: false },
      mobile: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, target] = positionals;
  if (values.help || command === undefined) {
    console.log(USAGE);
    return command === undefined && !values.help ? 2 : 0;
  }

  switch (command) {
    case "render": {
      if (target === undefined) return usageError("render needs a document path");
      const result = await buildExplainer(target);
      reportIssues(result.issues);
      if (result.html === undefined || (fails(result.issues, values.strict) && !values.force)) {
        if (result.html !== undefined) console.error("Nothing written. Fix the errors above, or pass --force to render anyway.");
        return 1;
      }
      const out = path.resolve(values.out ?? target.replace(/\.json$/i, "") + ".html");
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, result.html);
      console.log(`Wrote ${path.relative(process.cwd(), out) || out} (${Math.round(result.html.length / 1024)} KB)`);
      return 0;
    }
    case "validate": {
      if (target === undefined) return usageError("validate needs a document path");
      const result = await buildExplainer(target);
      const failed = fails(result.issues, values.strict);
      if (values.json) {
        const count = (severity: string) => result.issues.filter((issue) => issue.severity === severity).length;
        console.log(JSON.stringify({ valid: !failed, errors: count("error"), warnings: count("warning"), issues: result.issues }, null, 2));
      } else {
        reportIssues(result.issues);
        if (!failed) console.log(`✓ ${target} is valid${result.issues.length ? " (see warnings above)" : ""}`);
      }
      return failed ? 1 : 0;
    }
    case "components": {
      const loaded = target !== undefined ? await loadDocument(target) : undefined;
      if (loaded && !loaded.doc) {
        reportIssues(loaded.issues);
        return 1;
      }
      const { registry, issues } = target !== undefined ? await loadDocumentRegistry(target, loaded?.doc) : await loadRegistry([], process.cwd());
      reportIssues(issues);
      const list = registry.all().map((component) => ({
        name: component.name,
        description: component.description,
        props: z.toJSONSchema(component.props, { io: "input", unrepresentable: "any" }) as JsonSchema,
      }));
      if (values.json) console.log(JSON.stringify(list, null, 2));
      else console.log(list.map((component) => `${component.name}\n  ${component.description}\n${describeProps(component.props, "    ")}`).join("\n\n"));
      return issues.length === 0 ? 0 : 1;
    }
    case "scan": {
      const root = path.resolve(target ?? ".");
      const maxFiles = Number(values["max-files"]);
      const symbolsFor = Number(values["symbols-for"]);
      if (!Number.isInteger(maxFiles) || maxFiles < 1 || !Number.isInteger(symbolsFor) || symbolsFor < 0) {
        return usageError("--max-files and --symbols-for take whole numbers");
      }
      const scan = await scanRepository(root, { maxFiles });
      if (scan.files.length === 0) {
        console.error(`No source files found in ${root}.`);
        return 1;
      }
      console.log(scanReport(scan, { symbolsFor }));
      if (values.out !== undefined) {
        const out = path.resolve(values.out);
        const doc = draftDocument(scan, { title: values.title ?? `How ${path.basename(root)} works`, root: path.relative(path.dirname(out), root) || "." });
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, `${JSON.stringify(doc, null, 2)}\n`);
        console.log(`\nWrote draft ${path.relative(process.cwd(), out) || out}: ${Object.keys(doc.entities).length} entities, ${doc.relations.length} relations. Write the summaries and blocks, then run vizx validate.`);
      }
      return 0;
    }
    case "preview": {
      if (target === undefined) return usageError("preview needs a document or page path");
      const width = values.mobile ? 390 : Number(values.width);
      const height = values.mobile ? 844 : Number(values.height);
      if (!(width >= 200 && height >= 200)) return usageError("--width and --height take sizes of at least 200");
      const outDir = path.resolve(values.out ?? target.replace(/\.(json|html?)$/i, "") + ".preview");
      let page = path.resolve(target);
      if (/\.json$/i.test(target)) {
        const result = await buildExplainer(target);
        reportIssues(result.issues);
        if (result.html === undefined) return 1;
        page = await writePreviewPage(result.html, outDir);
      }
      const preview = await previewPage(page, { outDir, width, height, dark: values.dark });
      if (values.json) {
        console.log(JSON.stringify(preview, null, 2));
      } else {
        console.log(`${preview.screenshots.length} screenshots (${width}x${height}${values.dark ? ", dark" : ""}) in ${path.relative(process.cwd(), outDir) || outDir}`);
        if (preview.findings.length === 0) console.log("✓ no rendering problems found");
        else {
          console.log(`${preview.findings.length} rendering problem${preview.findings.length === 1 ? "" : "s"}:`);
          for (const finding of preview.findings) console.log(`  ! ${finding.path}: ${finding.message}`);
        }
      }
      return 0;
    }
    case "symbols": {
      if (target === undefined) return usageError("symbols needs a file path");
      const symbols = listSymbols((await readFile(target, "utf8")).replace(/\r\n/g, "\n"), languageFromFile(target));
      if (values.json) console.log(JSON.stringify(symbols, null, 2));
      else if (symbols.length === 0) console.log("No declarations found.");
      else {
        const width = Math.max(...symbols.map((symbol) => symbol.qualified.length));
        for (const symbol of symbols) console.log(`${symbol.qualified.padEnd(width)}  ${String(symbol.start).padStart(5)}-${symbol.end}  ${symbol.kind}`);
      }
      return 0;
    }
    case "schema":
      console.log(JSON.stringify(z.toJSONSchema(Document, { io: "input", unrepresentable: "any" }), null, 2));
      return 0;
    default:
      return usageError(`unknown command "${command}"`);
  }
}

function usageError(message: string): number {
  console.error(`${message}\n\n${USAGE}`);
  return 2;
}

/** Errors always fail; warnings fail only in strict mode. */
function fails(issues: readonly Issue[], strict: boolean): boolean {
  return hasErrors(issues) || (strict && issues.length > 0);
}

function reportIssues(issues: readonly Issue[]): void {
  if (issues.length === 0) return;
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  console.error([errors.length && plural(errors.length, "error"), warnings.length && plural(warnings.length, "warning")].filter(Boolean).join(", ") + ":");
  for (const issue of errors) console.error(`  ✗ ${formatIssue(issue)}`);
  for (const issue of warnings) console.error(`  ! ${formatIssue(issue)}`);
}

function describeProps(schema: JsonSchema, indent: string): string {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {})
    .map(([name, prop]) => {
      const optional = required.has(name) ? "" : "?";
      const fallback = prop.default !== undefined ? ` = ${JSON.stringify(prop.default)}` : "";
      const description = prop.description ? `  — ${prop.description}` : "";
      return `${indent}${name}${optional}: ${typeName(prop)}${fallback}${description}`;
    })
    .join("\n");
}

function typeName(schema: JsonSchema, depth = 0): string {
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.map((member) => typeName(member, depth)).join(" | ");
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.prefixItems) return `[${schema.prefixItems.map((item) => typeName(item, depth)).join(", ")}]`;
  if (schema.type === "array") {
    const items = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    const inner = items ? typeName(items, depth) : "unknown";
    return inner.includes(" ") && !inner.startsWith("{") ? `(${inner})[]` : `${inner}[]`;
  }
  if (schema.type === "object" && schema.properties) {
    if (depth > 1) return "object";
    const required = new Set(schema.required ?? []);
    const fields = Object.entries(schema.properties).map(([name, prop]) => `${name}${required.has(name) ? "" : "?"}: ${typeName(prop, depth + 1)}`);
    return `{ ${fields.join("; ")}${schema.additionalProperties === false ? "" : "; …"} }`;
  }
  if (schema.type === "integer") return "number";
  return Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "unknown");
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  },
);
