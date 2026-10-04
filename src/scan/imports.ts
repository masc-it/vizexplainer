import path from "node:path/posix";
import { listSymbols } from "../sources/symbols.ts";

export interface SourceFile {
  /** Path relative to the scan root, with forward slashes. */
  path: string;
  text: string;
}

export interface Dependency {
  from: string;
  /** A file path, or a folder path for languages that import whole packages (Go). */
  to: string;
  kind: "imports" | "uses";
}

export interface ResolveOptions {
  /** Module path from go.mod, if any. */
  goModule?: string;
}

/** Finds dependencies between the given files. Imports of anything outside them are ignored. */
export function findDependencies(files: readonly SourceFile[], options: ResolveOptions = {}): Dependency[] {
  const known = new Set(files.map((file) => file.path));
  const jvm = indexJvm(files);
  const python = indexPython(files);
  const found = new Map<string, Dependency>();
  const add = (from: string, to: string | undefined, kind: Dependency["kind"]) => {
    if (to === undefined || to === from) return;
    const key = `${from}\0${to}`;
    // An explicit import is the stronger statement; keep it if both are found.
    if (!found.has(key) || kind === "imports") found.set(key, { from, to, kind });
  };

  for (const file of files) {
    const ext = path.extname(file.path).slice(1).toLowerCase();
    if (["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "svelte", "vue"].includes(ext)) {
      for (const spec of jsSpecifiers(file.text)) add(file.path, resolveJs(file.path, spec, known), "imports");
    } else if (ext === "py") {
      for (const target of pythonImports(file, python, known)) add(file.path, target, "imports");
    } else if (ext === "kt" || ext === "kts" || ext === "java") {
      for (const dependency of jvmDependencies(file, jvm)) add(file.path, dependency.to, dependency.kind);
    } else if (ext === "go" && options.goModule !== undefined) {
      for (const dir of goImports(file.text, options.goModule)) add(file.path, dir, "imports");
    } else if (ext === "rs") {
      for (const target of rustImports(file, known)) add(file.path, target, "imports");
    }
  }
  return [...found.values()];
}

// JavaScript and TypeScript

const JS_SPECIFIER = /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const JS_EXTENSIONS = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "svelte", "vue"];

function jsSpecifiers(text: string): string[] {
  return [...text.matchAll(JS_SPECIFIER)].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4]!).filter((spec) => spec.startsWith("."));
}

function resolveJs(from: string, spec: string, known: ReadonlySet<string>): string | undefined {
  const target = path.normalize(path.join(path.dirname(from), spec));
  // TypeScript ESM imports name the compiled file: "./a.js" means "./a.ts".
  const stripped = target.replace(/\.(m|c)?js$/, "");
  const candidates = [target, ...JS_EXTENSIONS.flatMap((ext) => [`${stripped}.${ext}`, `${target}/index.${ext}`])];
  return candidates.find((candidate) => known.has(candidate));
}

// Python

interface PythonIndex {
  /** Dotted module name (every path suffix) to file; undefined when ambiguous. */
  modules: Map<string, string | undefined>;
}

function indexPython(files: readonly SourceFile[]): PythonIndex {
  const modules = new Map<string, string | undefined>();
  for (const file of files) {
    if (!file.path.endsWith(".py")) continue;
    const parts = file.path.replace(/\.py$/, "").split("/");
    if (parts.at(-1) === "__init__") parts.pop();
    for (let i = 0; i < parts.length; i++) {
      const name = parts.slice(i).join(".");
      modules.set(name, modules.has(name) && modules.get(name) !== file.path ? undefined : file.path);
    }
  }
  return { modules };
}

function pythonImports(file: SourceFile, index: PythonIndex, known: ReadonlySet<string>): string[] {
  const targets: (string | undefined)[] = [];
  for (const match of file.text.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]+)/gm)) {
    const [, dots = "", module = "", names = ""] = match;
    const imported = names.replace(/[()]/g, "").split(",").map((name) => name.trim().split(/\s+/)[0]!).filter((name) => /^\w+$/.test(name));
    if (dots) {
      let base = path.dirname(file.path);
      for (let i = 1; i < dots.length; i++) base = path.dirname(base);
      const modulePath = module ? path.join(base, ...module.split(".")) : base;
      const asModule = [`${modulePath}.py`, `${modulePath}/__init__.py`].find((candidate) => known.has(candidate));
      const asSubmodules = imported.map((name) => `${modulePath}/${name}.py`).filter((candidate) => known.has(candidate));
      targets.push(...(asSubmodules.length ? asSubmodules : [asModule]));
    } else {
      const submodules = imported.map((name) => index.modules.get(`${module}.${name}`)).filter((target) => target !== undefined);
      targets.push(...(submodules.length ? submodules : [index.modules.get(module)]));
    }
  }
  for (const match of file.text.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)/gm)) {
    for (const module of match[1]!.split(",")) targets.push(index.modules.get(module.trim().split(/\s+/)[0]!));
  }
  return targets.filter((target) => target !== undefined);
}

// Kotlin and Java

interface JvmIndex {
  packageOf: Map<string, string>;
  /** Top-level declaration names per file. */
  names: Map<string, string[]>;
  /** Fully qualified top-level declaration to file. */
  declarations: Map<string, string>;
  /** Package to the files declaring it. */
  packages: Map<string, string[]>;
}

function indexJvm(files: readonly SourceFile[]): JvmIndex {
  const index: JvmIndex = { packageOf: new Map(), names: new Map(), declarations: new Map(), packages: new Map() };
  for (const file of files) {
    const ext = path.extname(file.path).slice(1);
    if (ext !== "kt" && ext !== "kts" && ext !== "java") continue;
    const pkg = /^\s*package\s+([\w.]+)/m.exec(file.text)?.[1] ?? "";
    index.packageOf.set(file.path, pkg);
    index.packages.set(pkg, [...(index.packages.get(pkg) ?? []), file.path]);
    const names = listSymbols(file.text, ext).filter((symbol) => !symbol.qualified.includes(".")).map((symbol) => symbol.name);
    index.names.set(file.path, names);
    for (const name of names) index.declarations.set(pkg ? `${pkg}.${name}` : name, file.path);
  }
  return index;
}

function jvmDependencies(file: SourceFile, index: JvmIndex): Omit<Dependency, "from">[] {
  const result: Omit<Dependency, "from">[] = [];
  const pkg = index.packageOf.get(file.path) ?? "";
  const identifiers = new Set(file.text.match(/[A-Za-z_]\w*/g) ?? []);
  const mentions = (target: string) => (index.names.get(target) ?? []).some((name) => identifiers.has(name));
  for (const match of file.text.matchAll(/^\s*import\s+(?:static\s+)?(\w+(?:\.\w+)*)(\.\*)?/gm)) {
    const name = match[1]!;
    if (match[2]) {
      // A wildcard import brings in a whole package; keep only the files this one actually mentions.
      for (const target of index.packages.get(name) ?? []) if (target !== file.path && mentions(target)) result.push({ to: target, kind: "imports" });
      continue;
    }
    // `import a.b.Outer.Inner` and `import a.b.member` resolve to the closest declared prefix.
    const segments = name.split(".");
    for (let end = segments.length; end > 1; end--) {
      const target = index.declarations.get(segments.slice(0, end).join("."));
      if (target) {
        result.push({ to: target, kind: "imports" });
        break;
      }
    }
  }
  // Same-package declarations need no import: look for their names among this file's identifiers.
  for (const [qualified, target] of index.declarations) {
    if (target === file.path || !qualified.startsWith(pkg ? `${pkg}.` : "") || qualified.slice(pkg ? pkg.length + 1 : 0).includes(".")) continue;
    if (identifiers.has(qualified.slice(qualified.lastIndexOf(".") + 1))) result.push({ to: target, kind: "uses" });
  }
  // Fully qualified references in code, e.g. `com.example.browser.Bridge(...)`.
  for (const match of file.text.matchAll(/\b((?:[a-z_]\w*\.)+)([A-Za-z_]\w*)/g)) {
    const target = index.declarations.get(`${match[1]}${match[2]}`);
    if (target) result.push({ to: target, kind: "uses" });
  }
  return result;
}

// Go

function goImports(text: string, module: string): string[] {
  const specs: string[] = [];
  for (const match of text.matchAll(/^\s*import\s+(?:[\w.]+\s+)?"([^"]+)"/gm)) specs.push(match[1]!);
  for (const block of text.matchAll(/^\s*import\s*\(([\s\S]*?)\)/gm)) {
    for (const match of block[1]!.matchAll(/"([^"]+)"/g)) specs.push(match[1]!);
  }
  return specs.filter((spec) => spec.startsWith(`${module}/`)).map((spec) => spec.slice(module.length + 1));
}

// Rust

function rustImports(file: SourceFile, known: ReadonlySet<string>): string[] {
  const targets: string[] = [];
  const dir = path.dirname(file.path);
  const stem = path.basename(file.path, ".rs");
  const moduleDir = ["mod", "lib", "main"].includes(stem) ? dir : path.join(dir, stem);
  for (const match of file.text.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)) {
    const candidate = [`${moduleDir}/${match[1]}.rs`, `${moduleDir}/${match[1]}/mod.rs`].find((c) => known.has(c));
    if (candidate) targets.push(candidate);
  }
  const crateRoot = findCrateRoot(file.path, known);
  if (crateRoot !== undefined) {
    for (const match of file.text.matchAll(/\buse\s+crate::([\w:]+)/g)) {
      const segments = match[1]!.split("::");
      for (let end = segments.length; end > 0; end--) {
        const base = path.join(crateRoot, ...segments.slice(0, end));
        const candidate = [`${base}.rs`, `${base}/mod.rs`].find((c) => known.has(c));
        if (candidate) {
          targets.push(candidate);
          break;
        }
      }
    }
  }
  return targets;
}

function findCrateRoot(file: string, known: ReadonlySet<string>): string | undefined {
  for (let dir = path.dirname(file); dir !== "." && dir !== "/"; dir = path.dirname(dir)) {
    if (known.has(`${dir}/lib.rs`) || known.has(`${dir}/main.rs`)) return dir;
  }
  return known.has("lib.rs") || known.has("main.rs") ? "." : undefined;
}
