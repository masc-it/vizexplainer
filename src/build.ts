import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry, type Registry } from "./components/registry.ts";
import { buildModel, checkModel, type Model } from "./document/model.ts";
import { loadDocument } from "./document/load.ts";
import type { Document } from "./document/schema.ts";
import { readGitState } from "./git.ts";
import { byDocumentOrder, joinPath, warning, type Issue } from "./issues.ts";
import { createCodeRenderer } from "./render/code.ts";
import { createEngine } from "./render/engine.ts";
import { renderEntityPanels } from "./render/entity-panels.ts";
import { renderPage } from "./render/page.ts";

const ASSETS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets");

export interface BuildResult {
  /** The rendered page; present whenever the document could be parsed, even if issues were found. */
  html?: string;
  issues: Issue[];
}

export { loadDocument } from "./document/load.ts";

/** Loads the built-in components plus the document's custom ones. */
export async function loadDocumentRegistry(docPath: string, doc: Document | undefined) {
  return loadRegistry(doc?.components ?? [], path.dirname(path.resolve(docPath)));
}

export async function buildExplainer(docPath: string): Promise<BuildResult> {
  const loaded = await loadDocument(docPath);
  if (!loaded.doc) return { issues: loaded.issues };
  const doc = loaded.doc;
  const docDir = path.dirname(path.resolve(docPath));

  const { registry, issues: registryIssues } = await loadDocumentRegistry(docPath, doc);
  return renderExplainer(doc, docDir, registry, registryIssues, loaded.blockPaths);
}

async function renderExplainer(doc: Document, docDir: string, registry: Registry, priorIssues: Issue[], blockPaths?: readonly string[]): Promise<BuildResult> {
  const model = buildModel(doc);
  const root = path.resolve(docDir, doc.root ?? ".");
  const code = createCodeRenderer({ root, repository: doc.repository });
  const engine = createEngine({ doc, model, registry, code });

  const body = await engine.renderBlocks(doc.blocks, "blocks", blockPaths);
  const summary = doc.summary !== undefined ? engine.context("summary").markdown(doc.summary) : undefined;
  const panels = await renderEntityPanels(model, (path) => engine.context(path, false));
  const [css, runtime] = await Promise.all([
    readFile(path.join(ASSETS_DIR, "theme.css"), "utf8"),
    readFile(path.join(ASSETS_DIR, "runtime.js"), "utf8"),
  ]);

  const html = renderPage({
    title: doc.title,
    subtitle: doc.subtitle,
    summary,
    repository: doc.repository,
    body,
    outline: engine.outline,
    panels,
    hasEntities: model.entities.size > 0,
    components: registry.all().filter((component) => engine.usedComponents.has(component)),
    assets: { css, runtime },
  });
  const staleness = doc.repository ? await checkRepository(root, doc.repository.ref, code.filesRead()) : [];
  // Blocks render concurrently, so sort for output that is stable from run to run.
  const issues = [...engine.issues, ...orphanedEntities(model, engine.shownEntities)].sort(byDocumentOrder);
  return { html, issues: [...priorIssues, ...checkModel(doc), ...staleness, ...issues] };
}

/** Entities with no relations that no block shows can only be found by accident. */
function orphanedEntities(model: Model, shown: ReadonlySet<string>): Issue[] {
  const related = new Set(model.relations.flatMap((relation) => [relation.from, relation.to]));
  return [...model.entities.keys()]
    .filter((id) => !shown.has(id) && !related.has(id) && model.childrenOf(id).length === 0)
    .map((id) => warning(joinPath("entities", id), "is never shown and has no relations; reference it from a block or remove it"));
}

/** "View source" links point at `ref`; they mislead when the rendered code comes from a different tree. */
async function checkRepository(root: string, ref: string, files: readonly string[]): Promise<Issue[]> {
  const state = await readGitState(root, ref, files);
  if (!state) return [warning("repository", `cannot check "ref" against the code: ${root} is not inside a git repository`)];
  const issues: Issue[] = [];
  if (state.refCommit === undefined) {
    issues.push(warning("repository.ref", `"${ref}" is not a commit in the local repository; source links may be broken`));
  } else if (state.refCommit !== state.head) {
    issues.push(
      warning(
        "repository.ref",
        `"${ref}" is ${state.refCommit.slice(0, 7)} but the checked-out code is ${state.head.slice(0, 7)}; links may show different code than the page. Use the current commit or check out the ref`,
      ),
    );
  }
  for (const file of [...state.changed].sort()) {
    issues.push(warning("repository", `${path.relative(root, file)} has uncommitted changes; its "View source" links will not match the page`));
  }
  return issues;
}
