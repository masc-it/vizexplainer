import { error, joinPath, suggest, warning, type Issue } from "../issues.ts";
import type { Document, Entity, Relation } from "./schema.ts";

export interface ResolvedEntity extends Entity {
  id: string;
  label: string;
}

/** Read-only, indexed view of a document's entities and relations. */
export interface Model {
  entities: ReadonlyMap<string, ResolvedEntity>;
  relations: readonly Relation[];
  childrenOf(id: string | undefined): ResolvedEntity[];
  ancestorsOf(id: string): ResolvedEntity[];
}

export function buildModel(doc: Document): Model {
  const entities = new Map<string, ResolvedEntity>(
    Object.entries(doc.entities).map(([id, entity]) => [id, { ...entity, id, label: entity.label ?? id }]),
  );
  const children = new Map<string | undefined, ResolvedEntity[]>();
  for (const entity of entities.values()) {
    const parent = entity.parent !== undefined && entities.has(entity.parent) ? entity.parent : undefined;
    children.set(parent, [...(children.get(parent) ?? []), entity]);
  }
  return {
    entities,
    relations: doc.relations,
    childrenOf: (id) => children.get(id) ?? [],
    ancestorsOf(id) {
      const chain: ResolvedEntity[] = [];
      const seen = new Set([id]);
      let current = entities.get(id)?.parent;
      while (current !== undefined && !seen.has(current)) {
        const entity = entities.get(current);
        if (!entity) break;
        chain.push(entity);
        seen.add(current);
        current = entity.parent;
      }
      return chain;
    },
  };
}

const SUMMARY_LIMIT = 300;

/** Structural checks across entities and relations that the schema cannot express. */
export function checkModel(doc: Document): Issue[] {
  const issues: Issue[] = [];
  const ids = Object.keys(doc.entities);
  const known = new Set(ids);
  const unknown = (path: string, id: string) => issues.push(error(path, `unknown entity "${id}"${suggest(id, ids)}`));

  for (const [id, entity] of Object.entries(doc.entities)) {
    if (entity.parent === undefined) continue;
    const path = joinPath(joinPath("entities", id), "parent");
    if (!known.has(entity.parent)) unknown(path, entity.parent);
    else if (hasParentCycle(doc, id)) issues.push(error(path, `parent chain of "${id}" forms a cycle`));
  }
  for (const [id, entity] of Object.entries(doc.entities)) {
    if (entity.summary !== undefined && entity.summary.length > SUMMARY_LIMIT) {
      issues.push(
        warning(
          joinPath(joinPath("entities", id), "summary"),
          `summary is ${entity.summary.length} characters; keep it to one or two sentences and move the rest to "details"`,
        ),
      );
    }
  }
  doc.relations.forEach((relation, index) => {
    const path = joinPath("relations", index);
    if (!known.has(relation.from)) unknown(joinPath(path, "from"), relation.from);
    if (!known.has(relation.to)) unknown(joinPath(path, "to"), relation.to);
  });
  return issues;
}

function hasParentCycle(doc: Document, id: string): boolean {
  const seen = new Set<string>();
  let current: string | undefined = id;
  while (current !== undefined) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = doc.entities[current]?.parent;
  }
  return false;
}
