import { z } from "zod";

/** A single line (`12`) or an inclusive range (`[12, 30]`). Lines are 1-based. */
export const LineRange = z
  .union([z.number().int().positive(), z.tuple([z.number().int().positive(), z.number().int().positive()])])
  .refine((range) => typeof range === "number" || range[0] <= range[1], "range start must be <= end")
  .describe("A 1-based line number or an inclusive [start, end] range");
export type LineRange = z.infer<typeof LineRange>;

export const LineAnchor = z
  .object({
    match: z.string().min(1).describe("Text found on exactly one of the shown lines"),
    lines: z.number().int().positive().default(1).describe("Number of lines, starting at the matching one"),
  })
  .strict();

/** Where code lines are referenced: numbers, or `{ match }` to find a line by its text so references survive edits. */
export const LineSpec = z
  .union([LineRange, LineAnchor])
  .describe("A line, an inclusive [start, end] range, or { match: \"text on the line\", lines?: n }");
export type LineSpec = z.infer<typeof LineSpec>;

export function lineBounds(range: LineRange): { start: number; end: number } {
  return typeof range === "number" ? { start: range, end: range } : { start: range[0], end: range[1] };
}

export const FileSource = z
  .object({
    file: z.string().min(1).describe("Path relative to the document root"),
    lines: LineRange.optional().describe("Lines to show; the whole file when omitted"),
    symbol: z
      .string()
      .min(1)
      .optional()
      .describe("Declaration to show instead of `lines`, e.g. `runToolTurn`, `ChatService.send#2`; resolved at build time"),
    ref: z.string().min(1).optional().describe("Git revision to read the file at, e.g. `main` or `HEAD~1`; the working tree when omitted"),
    lang: z.string().optional().describe("Language id; inferred from the file extension when omitted"),
  })
  .strict()
  .refine((source) => source.lines === undefined || source.symbol === undefined, "give `lines` or `symbol`, not both");

export const InlineSource = z
  .object({
    code: z.string(),
    lang: z.string().optional(),
    startLine: z.number().int().positive().optional().describe("Line number of the first line, for display"),
  })
  .strict();

export const SourceRef = z.union([FileSource, InlineSource]);
export type SourceRef = z.infer<typeof SourceRef>;

export const Entity = z
  .object({
    label: z.string().optional().describe("Display name; defaults to the entity id"),
    kind: z.string().optional().describe("Free-form category such as module, function, service, concept"),
    summary: z.string().optional().describe("One or two plain-language sentences (markdown)"),
    details: z.string().optional().describe("Deeper explanation shown on demand (markdown)"),
    parent: z.string().optional().describe("Id of the containing entity"),
    source: SourceRef.optional(),
  })
  .strict();
export type Entity = z.infer<typeof Entity>;

export const Relation = z
  .object({
    from: z.string(),
    to: z.string(),
    kind: z.string().optional().describe("Free-form type such as calls, imports, reads, emits"),
    label: z.string().optional(),
  })
  .strict();
export type Relation = z.infer<typeof Relation>;

/** Blocks are validated against their component's props schema at render time. */
export const Block = z
  .object({
    type: z.string().describe("Component name"),
    id: z.string().optional().describe("Anchor id, also used as a link target"),
  })
  .loose();
export type Block = z.infer<typeof Block>;

export const Document = z
  .object({
    $schema: z.string().optional(),
    title: z.string().min(1),
    subtitle: z.string().optional(),
    summary: z.string().optional().describe("Intro paragraph shown under the title (markdown)"),
    root: z.string().optional().describe("Directory that file sources are relative to; defaults to the document's directory"),
    repository: z
      .object({ url: z.string().url(), ref: z.string().min(1) })
      .strict()
      .optional()
      .describe("Enables 'view source' links, e.g. { url: 'https://github.com/o/r', ref: 'main' }"),
    components: z.array(z.string()).optional().describe("Paths to custom component modules, relative to the document"),
    entities: z.record(z.string(), Entity).default({}),
    relations: z.array(Relation).default([]),
    blocks: z.array(Block).min(1),
  })
  .strict();
export type Document = z.infer<typeof Document>;
