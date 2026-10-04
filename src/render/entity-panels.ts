import type { RenderContext } from "../components/define.ts";
import type { Model, ResolvedEntity } from "../document/model.ts";
import { html, type Html } from "../html.ts";

/** One hidden template per entity; the runtime shows it in the side panel when an entity is clicked. */
export async function renderEntityPanels(model: Model, contextFor: (path: string) => RenderContext): Promise<Html> {
  const panels = await Promise.all([...model.entities.values()].map((entity) => renderPanel(entity, model, contextFor(`entities.${entity.id}`))));
  return html`${panels}`;
}

async function renderPanel(entity: ResolvedEntity, model: Model, ctx: RenderContext): Promise<Html> {
  const chip = (target: ResolvedEntity) =>
    html`<span class="vx-chip ${ctx.hueClass(target.kind)}" data-entity="${target.id}" tabindex="0" role="button">${target.label}</span>`;
  const outgoing = model.relations.filter((relation) => relation.from === entity.id);
  const incoming = model.relations.filter((relation) => relation.to === entity.id);
  const children = model.childrenOf(entity.id);
  const ancestors = model.ancestorsOf(entity.id).reverse();
  const code = entity.source ? await ctx.code(entity.source) : undefined;
  const relationRow = (verb: string | undefined, target: string, direction: "out" | "in") => {
    const other = model.entities.get(target);
    if (!other) return html``;
    return html`<li><span class="vx-rel-verb">${direction === "out" ? `${verb ?? "relates to"} →` : `← ${verb ?? "relates to"}`}</span>${chip(other)}</li>`;
  };

  return html`<template data-entity-panel="${entity.id}">
    ${ancestors.length > 0 && html`<div class="vx-panel-crumbs">${ancestors.map((ancestor) => html`${chip(ancestor)}<span>/</span>`)}</div>`}
    <div class="vx-panel-title ${ctx.hueClass(entity.kind)}">
      ${entity.kind !== undefined && html`<div class="vx-badge">${entity.kind}</div>`}
      <h2>${entity.label}</h2>
      ${entity.label !== entity.id && html`<code class="vx-panel-id">${entity.id}</code>`}
    </div>
    ${entity.summary !== undefined && html`<div class="vx-prose vx-panel-summary">${ctx.markdown(entity.summary)}</div>`}
    ${entity.details !== undefined && html`<div class="vx-prose">${ctx.markdown(entity.details)}</div>`}
    ${code &&
    html`<div class="vx-code vx-panel-code">
      <div class="vx-code-head">
        <span class="vx-code-title">${code.file ?? entity.label}${code.file !== undefined ? `:${code.start}–${code.end}` : ""}</span>
        ${code.url !== undefined && html`<a class="vx-code-link" href="${code.url}" target="_blank" rel="noopener">View source ↗</a>`}
      </div>
      <div class="vx-code-body" style="--vx-max-lines: 22">${code.html}</div>
    </div>`}
    ${children.length > 0 && html`<h3>Contains</h3><div class="vx-chips">${children.map(chip)}</div>`}
    ${(outgoing.length > 0 || incoming.length > 0) &&
    html`<h3>Connections</h3><ul class="vx-rels">
      ${outgoing.map((relation) => relationRow(relation.label ?? relation.kind, relation.to, "out"))}
      ${incoming.map((relation) => relationRow(relation.label ?? relation.kind, relation.from, "in"))}
    </ul>`}
  </template>`;
}
