import type { ComponentDefinition } from "../define.ts";
import { code } from "./code.ts";
import { diff } from "./diff.ts";
import { cards, tree } from "./entities.ts";
import { graph } from "./graph.ts";
import { columns, details, section, tabs } from "./layout.ts";
import { glossary, quiz } from "./learning.ts";
import { rawHtml } from "./raw-html.ts";
import { sequence } from "./sequence.ts";
import { state } from "./state.ts";
import { steps } from "./steps.ts";
import { callout, prose, stats, table } from "./text.ts";
import { timeline } from "./timeline.ts";

export const builtinComponents: readonly ComponentDefinition[] = [
  section,
  prose,
  callout,
  columns,
  tabs,
  details,
  cards,
  stats,
  table,
  tree,
  graph,
  sequence,
  state,
  code,
  diff,
  steps,
  timeline,
  glossary,
  quiz,
  rawHtml,
];
