import type { ComponentDefinition } from "../components/define.ts";
import { html, raw, type Html } from "../html.ts";
import type { OutlineEntry } from "./engine.ts";

export interface PageParts {
  title: string;
  subtitle?: string;
  summary?: Html;
  repository?: { url: string; ref: string };
  body: Html;
  outline: readonly OutlineEntry[];
  panels: Html;
  /** Whether the document has entities, i.e. whether interactive references can appear. */
  hasEntities: boolean;
  components: Iterable<ComponentDefinition>;
  assets: { css: string; runtime: string };
}

// Runs before first paint so the saved theme never flashes.
const THEME_BOOT = `(() => { try { const t = localStorage.getItem("vx-theme"); if (t) document.documentElement.dataset.theme = t; } catch {} })();`;

export function renderPage(parts: PageParts): string {
  const components = [...parts.components];
  const css = [parts.assets.css, ...components.map((component) => component.css ?? "")].join("\n");
  const scripts = components
    .filter((component) => component.script)
    .map((component) => `try {\n${component.script}\n} catch (error) { console.error("vizexplainer: component ${component.name} failed", error); }`);

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="vizexplainer">
<title>${parts.title}</title>
<script>${raw(THEME_BOOT)}</script>
<style>${raw(css)}</style>
</head>
<body>
<header class="vx-topbar">
  <a class="vx-topbar-title" href="#top">${parts.title}</a>
  ${parts.outline.length > 0 ? renderSections(parts.outline) : html`<span class="vx-sections"></span>`}
  <button type="button" class="vx-icon-btn" data-vx-theme-toggle aria-label="Toggle dark mode"><svg viewBox="0 0 24 24"><path class="vx-sun" d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5 19 5"/><circle class="vx-sun" cx="12" cy="12" r="4"/><path class="vx-moon" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></button>
</header>
<div class="vx-layout">
  <main class="vx-main" id="top">
    <header class="vx-hero">
      <h1>${parts.title}</h1>
      ${parts.subtitle !== undefined && html`<p class="vx-subtitle">${parts.subtitle}</p>`}
      ${parts.summary !== undefined && html`<div class="vx-prose vx-hero-summary">${parts.summary}</div>`}
      ${parts.hasEntities && html`<div class="vx-hero-hint"><span class="vx-ref">Underlined names</span> are interactive: hover to see them across the page, click for details.</div>`}
    </header>
    <div class="vx-content vx-stack">${parts.body}</div>
    <footer class="vx-footer">
      ${parts.repository !== undefined && html`<a href="${parts.repository.url}" target="_blank" rel="noopener">${parts.repository.url.replace(/^https?:\/\//, "")}</a> · `}Made with vizexplainer
    </footer>
  </main>
</div>
<aside class="vx-panel" aria-label="Details" aria-hidden="true" data-vx-panel>
  <div class="vx-panel-bar">
    <button type="button" class="vx-icon-btn" data-vx-panel-back aria-label="Back" hidden><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
    <span class="vx-panel-bar-label">Details</span>
    <button type="button" class="vx-icon-btn" data-vx-panel-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
  </div>
  <div class="vx-panel-content" data-vx-panel-content></div>
</aside>
${parts.panels}
<script>${raw(parts.assets.runtime)}</script>
${scripts.map((script) => html`<script>${raw(script)}</script>`)}
</body>
</html>
`.value;
}

/**
 * Top-level sections as a row in the top bar. Each link's underline fills as the reader
 * moves through that section, so the row doubles as the reading-progress bar.
 */
function renderSections(entries: readonly OutlineEntry[]): Html {
  return html`<nav class="vx-sections" aria-label="Sections" data-vx-sections>${entries.map(
    (entry) => html`<a href="#${entry.id}" data-vx-toc-link="${entry.id}"><span>${entry.title}</span><i aria-hidden="true"></i></a>`,
  )}</nav>`;
}
