import { suggest } from "../issues.ts";

/**
 * Heuristic symbol locator. It finds declarations by keyword and their extent by brace matching
 * (or indentation for Python), so it works across most languages without a parser. It can be
 * fooled by unusual formatting; `vizx symbols <file>` shows what it sees.
 */

export interface SymbolInfo {
  name: string;
  /** Enclosing declarations joined with dots, e.g. `ChatService.runToolTurn`. */
  qualified: string;
  /** Declaration keyword as written: `fun`, `class`, `def`, `method`… */
  kind: string;
  /** Line of the declaration itself. */
  line: number;
  /** First line including leading doc comments and annotations. */
  start: number;
  end: number;
}

export type SymbolLookup = { ok: true; symbol: SymbolInfo } | { ok: false; message: string };

type Mode = "brace" | "indent";

/** A symbol before qualification, plus the line where its body starts. */
interface Located extends Omit<SymbolInfo, "qualified"> {
  bodyLine: number;
}

interface Extent {
  end: number;
  /** Line (0-based) where the body opens; the declaration line when there is no body. */
  bodyLine: number;
}

interface LanguageRules {
  mode: Mode;
  /** `'` starts a string (JS, Python…) rather than a short character literal (Kotlin, Rust…). */
  singleQuoteStrings: boolean;
  hashComments: boolean;
  /** Methods are declared with a return type and no keyword (`int size() {`), as in Java or C#. */
  typedMethods: boolean;
  /** Class methods are declared by name alone (`render(props) {`), as in JavaScript and TypeScript. */
  untypedMethods: boolean;
}

const INDENT_LANGS = new Set(["py", "python", "pyi"]);
const SINGLE_QUOTE_STRING_LANGS = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "javascript", "typescript", "py", "python", "ruby", "rb", "php", "sh", "bash", "zsh", "lua", "dart", "svelte", "vue"]);
const HASH_COMMENT_LANGS = new Set(["py", "python", "rb", "sh", "bash", "zsh", "php", "r", "pl"]);
const TYPED_METHOD_LANGS = new Set(["java", "cs", "csharp", "c#", "c", "cpp", "c++", "cc", "cxx", "h", "hpp", "dart", "scala"]);
const UNTYPED_METHOD_LANGS = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "javascript", "typescript", "svelte", "vue"]);

function rulesFor(lang: string): LanguageRules {
  const id = lang.toLowerCase();
  return {
    mode: INDENT_LANGS.has(id) ? "indent" : "brace",
    singleQuoteStrings: SINGLE_QUOTE_STRING_LANGS.has(id),
    hashComments: HASH_COMMENT_LANGS.has(id),
    typedMethods: TYPED_METHOD_LANGS.has(id),
    untypedMethods: UNTYPED_METHOD_LANGS.has(id),
  };
}

const MODIFIERS =
  "(?:(?:export|default|public|private|protected|internal|static|async|abstract|open|override|suspend|inline|data|sealed|enum|final|const|inner|operator|infix|tailrec|external|actual|expect|lateinit|readonly|declare|unsafe|extern|virtual|partial|companion|value|annotation|synchronized|native|transient|volatile|strictfp|pub(?:\\([^)]*\\))?)\\s+)*";
const KEYWORD = "(function\\*?|fun|def|class|interface|object|struct|enum|trait|type|func|fn|val|var|let|const|record|module|namespace|protocol|extension|typealias)";
const DECLARATION = new RegExp(
  `^\\s*${MODIFIERS}${KEYWORD}\\s+(?:<[^>]*>\\s*)?(?:\\([^)]*\\)\\s*)?(?:[\\w.<>?]+\\.)?([A-Za-z_$][\\w$]*)`,
);
// Kotlin's unnamed `companion object` is addressed through its class, so it is left out of qualified names.
const COMPANION = /^\s*(?:(?:private|internal|public)\s+)?companion\s+object\b(?:\s+([A-Za-z_]\w*))?/;
const RUST_IMPL = /^\s*(?:unsafe\s+)?impl(?:<[^>]*>)?\s+(?:[\w:<>, ]+\s+for\s+)?([A-Za-z_][\w]*)/;
const UNTYPED_METHOD = new RegExp(`^\\s*${MODIFIERS}(?:get\\s+|set\\s+|\\*\\s*)?([A-Za-z_$][\\w$]*)\\s*(?:<[^>]*>)?\\s*\\(`);
const TYPED_METHOD = new RegExp(`^\\s*${MODIFIERS}(?:<[^>]*>\\s+)?[\\w<>\\[\\],.?]+\\s+\\**([A-Za-z_][\\w]*)\\s*\\(`);
const CONTROL_WORDS = new Set(["if", "for", "while", "switch", "catch", "return", "when", "else", "do", "try", "new", "throw", "await", "yield", "super", "this", "typeof", "sizeof", "function"]);
const CONTAINER_KINDS = new Set(["companion", "class", "interface", "object", "struct", "enum", "trait", "impl", "record", "module", "namespace", "protocol", "extension", "type"]);
const VARIABLE_KINDS = new Set(["val", "var", "let", "const"]);
const CONTINUATION_END = /(?:[=,(\[{:+\-*/%&|^!?<>.]|->|=>)\s*$/;
const CONTINUATION_START = /^\s*(?:\.|\?\.|\?\?|&&|\|\||[+\-*/%]|=>|->|:(?!:)|\)|\]|where\b|(?:(?:private|protected|internal)\s+)?(?:get|set)\s*[({=]|by\s)/;

const FUNCTION_KINDS = new Set(["function", "fun", "def", "func", "fn", "method"]);

/**
 * Lists declarations. Locals inside function bodies are skipped, except that `nested: true` keeps
 * functions declared inside functions (useful for lookups such as `createEngine.renderBlock`).
 */
export function listSymbols(text: string, lang: string, options: { nested?: boolean } = {}): SymbolInfo[] {
  const rules = rulesFor(lang);
  const lines = text.split("\n");
  const found: Located[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const enclosing = innermost(found, index + 1);
    // Constructor parameters and the like sit in the header, before the container's body opens.
    if (enclosing && index + 1 <= enclosing.bodyLine) continue;
    const declaration = matchDeclaration(line, rules, enclosing !== undefined && CONTAINER_KINDS.has(enclosing.kind));
    if (!declaration) continue;
    // Skip locals: anything declared inside a function body.
    if (enclosing && !CONTAINER_KINDS.has(enclosing.kind) && !(options.nested && FUNCTION_KINDS.has(declaration.kind))) continue;
    if (VARIABLE_KINDS.has(declaration.kind) && enclosing === undefined && /^\s+/.test(line) && rules.mode === "brace") continue;
    const extent = rules.mode === "indent" ? indentEnd(lines, index) : braceEnd(lines, index, rules);
    found.push({
      name: declaration.name,
      kind: declaration.kind,
      line: index + 1,
      start: leadingStart(lines, index, rules),
      end: extent.end + 1,
      bodyLine: extent.bodyLine + 1,
    });
  }

  return found.map(({ bodyLine: _, ...symbol }) => ({ ...symbol, qualified: qualify(found, symbol) }));
}

/** Finds `name`, `Outer.name` or `name#2` (the second of several overloads). */
export function findSymbol(text: string, query: string, lang: string): SymbolLookup {
  const [path, occurrence] = query.split("#") as [string, string | undefined];
  const symbols = listSymbols(text, lang, { nested: true });
  const matches = symbols.filter((symbol) => symbol.qualified === path || symbol.qualified.endsWith(`.${path}`));
  if (occurrence !== undefined) {
    const n = Number(occurrence);
    const picked = Number.isInteger(n) && n >= 1 ? matches[n - 1] : undefined;
    if (picked) return { ok: true, symbol: picked };
    return { ok: false, message: `symbol "${query}": there are ${matches.length} declarations named "${path}"` };
  }
  if (matches.length === 1) return { ok: true, symbol: matches[0]! };
  // TypeScript often pairs a value with a same-named type (`const X = z…; type X = z.infer<typeof X>`); prefer the value.
  const values = matches.filter((symbol) => symbol.kind !== "type" && symbol.kind !== "interface");
  if (values.length === 1 && matches.length > 1) return { ok: true, symbol: values[0]! };
  if (matches.length === 0) {
    const names = [...new Set(symbols.map((symbol) => symbol.qualified))];
    return { ok: false, message: `symbol "${query}" not found${suggest(path, names)}` };
  }
  const where = matches.map((symbol) => `${symbol.qualified} at line ${symbol.line}`).join(", ");
  return {
    ok: false,
    message: `symbol "${query}" is ambiguous: ${where}. Qualify it with its container, or add "#1", "#2"… to pick an overload`,
  };
}

function matchDeclaration(line: string, rules: LanguageRules, insideContainer: boolean): { kind: string; name: string } | undefined {
  const companion = COMPANION.exec(line);
  if (companion) return { kind: companion[1] ? "object" : "companion", name: companion[1] ?? "Companion" };
  const keyword = DECLARATION.exec(line);
  if (keyword) return { kind: keyword[1]!.replace("*", ""), name: keyword[2]! };
  const impl = RUST_IMPL.exec(line);
  if (impl) return { kind: "impl", name: impl[1]! };
  if (!insideContainer || !(rules.typedMethods || rules.untypedMethods)) return undefined;
  // Methods declared without a keyword only count inside a class-like body, and only when they open a body.
  if (!/\{|[(),]\s*$/.test(line)) return undefined;
  const method = rules.typedMethods ? TYPED_METHOD.exec(line) : UNTYPED_METHOD.exec(line);
  if (method && !CONTROL_WORDS.has(method[1]!)) return { kind: "method", name: method[1]! };
  return undefined;
}

function innermost<T extends Omit<SymbolInfo, "qualified">>(symbols: readonly T[], line: number): T | undefined {
  let best: T | undefined;
  for (const symbol of symbols) {
    if (symbol.line < line && symbol.end >= line && (!best || symbol.line > best.line)) best = symbol;
  }
  return best;
}

function qualify(symbols: readonly Located[], symbol: Omit<SymbolInfo, "qualified">): string {
  const parent = innermost(symbols, symbol.line);
  if (!parent) return symbol.name;
  return parent.kind === "companion" ? `${qualify(symbols, parent).replace(/\.?Companion$/, "")}.${symbol.name}`.replace(/^\./, "") : `${qualify(symbols, parent)}.${symbol.name}`;
}

/** Extends upwards over doc comments, line comments, annotations and decorators directly above. */
function leadingStart(lines: readonly string[], index: number, rules: LanguageRules): number {
  let start = index;
  let inBlockComment = false;
  for (let i = index - 1; i >= 0; i--) {
    const trimmed = lines[i]!.trim();
    if (inBlockComment) {
      start = i;
      if (trimmed.startsWith("/*")) inBlockComment = false;
      continue;
    }
    if (trimmed.endsWith("*/")) {
      start = i;
      inBlockComment = !trimmed.startsWith("/*");
      continue;
    }
    const comment = trimmed.startsWith("//") || (rules.hashComments && trimmed.startsWith("#") && !trimmed.startsWith("#["));
    const annotation = /^@[\w.]+/.test(trimmed) || trimmed.startsWith("#[");
    if (trimmed !== "" && !comment && !annotation && /[)\]]\s*$/.test(trimmed)) {
      // The last line of a multi-line annotation such as `@Database(\n  entities = [...],\n)`.
      const opening = annotationStart(lines, i);
      if (opening !== undefined) {
        start = opening;
        i = opening;
        continue;
      }
    }
    if (trimmed === "" || !(comment || annotation)) break;
    start = i;
  }
  return start + 1;
}

/** Walks up from the closing line of a bracketed annotation to the line that opens it with `@`. */
function annotationStart(lines: readonly string[], closing: number): number | undefined {
  let balance = 0;
  for (let i = closing; i >= Math.max(0, closing - 80); i--) {
    const line = lines[i]!;
    for (const char of line) {
      if (char === ")" || char === "]") balance++;
      else if (char === "(" || char === "[") balance--;
    }
    if (balance <= 0) return /^\s*@[\w.]+\s*\(/.test(line) ? i : undefined;
  }
  return undefined;
}

/** Python-style: the block is every following line indented deeper than the declaration. */
function indentEnd(lines: readonly string[], index: number): Extent {
  const indent = indentation(lines[index]!);
  let end = index;
  let bodyLine = index;
  let headerOpen = !/:\s*(#.*)?$/.test(lines[index]!);
  for (let i = index + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (headerOpen) {
      end = i;
      bodyLine = i;
      if (/:\s*(#.*)?$/.test(line)) headerOpen = false;
      continue;
    }
    if (line.trim() === "") continue;
    if (indentation(line) <= indent) break;
    end = i;
  }
  return { end, bodyLine };
}

function indentation(line: string): number {
  return /^[ \t]*/.exec(line)![0].replace(/\t/g, "    ").length;
}

/**
 * Brace languages: scans from the declaration, skipping strings and comments. The body is the first
 * `{` outside any brackets; without one, the declaration ends where the statement does.
 */
function braceEnd(lines: readonly string[], index: number, rules: LanguageRules): Extent {
  const stack: string[] = [];
  let inBlockComment = false;
  let bodyLine: number | undefined;

  for (let i = index; i < lines.length; i++) {
    const line = lines[i]!;
    let quote: string | undefined;
    let codeEnd = line.length;
    for (let c = 0; c < line.length; c++) {
      const char = line[c]!;
      const next = line[c + 1];
      if (inBlockComment) {
        if (char === "*" && next === "/") {
          inBlockComment = false;
          c++;
        }
        continue;
      }
      if (quote !== undefined) {
        if (char === "\\") c++;
        else if (quote === '"""' && line.startsWith('"""', c)) {
          quote = undefined;
          c += 2;
        } else if (char === quote) quote = undefined;
        continue;
      }
      if ((char === "/" && next === "/") || (rules.hashComments && char === "#")) {
        codeEnd = c;
        break;
      }
      if (char === "/" && next === "*") {
        inBlockComment = true;
        c++;
        continue;
      }
      if (line.startsWith('"""', c)) {
        quote = '"""';
        c += 2;
        continue;
      }
      if (char === "/" && rules.untypedMethods && startsRegex(line, c)) {
        c = regexEnd(line, c);
        continue;
      }
      if (char === '"' || char === "`") {
        quote = char;
        continue;
      }
      if (char === "'") {
        if (rules.singleQuoteStrings) quote = char;
        else {
          // A short character literal such as 'a' or '\n'; anything else (Rust lifetimes) is not a quote.
          const close = line.indexOf("'", c + 1);
          if (close !== -1 && close - c <= 3) c = close;
        }
        continue;
      }
      if (char === "(" || char === "[") stack.push(char);
      else if (char === ")" || char === "]") stack.pop();
      else if (char === "{") {
        if (bodyLine === undefined && stack.length === 0) bodyLine = i;
        stack.push(char);
      } else if (char === "}") {
        stack.pop();
        if (bodyLine !== undefined && stack.length === 0) {
          // `): Promise<{ a: A }> {` or `type T = { … } & U`: that block was a type, the body is still ahead.
          const rest = line.slice(c + 1).trimStart();
          if (/^[>|&,[\]]/.test(rest) || (rest.includes("{") && !rest.startsWith("//"))) {
            bodyLine = undefined;
            continue;
          }
          return { end: i, bodyLine };
        }
      } else if (char === ";" && stack.length === 0 && bodyLine === undefined) return { end: i, bodyLine: i };
    }
    // Triple-quoted strings may span lines; single-line quotes may not.
    if (quote !== '"""') quote = undefined;
    if (bodyLine === undefined && stack.length === 0 && !inBlockComment) {
      const nextLine = lines.slice(i + 1).find((candidate) => candidate.trim() !== "" && !isCommentLine(candidate, rules));
      const continues = CONTINUATION_END.test(line.slice(0, codeEnd)) || (nextLine !== undefined && CONTINUATION_START.test(nextLine));
      const bodyOnNextLine = nextLine !== undefined && /^\s*\{/.test(nextLine);
      if (!continues && !bodyOnNextLine) return { end: i, bodyLine: i };
    }
  }
  return { end: lines.length - 1, bodyLine: bodyLine ?? index };
}

function isCommentLine(line: string, rules: LanguageRules): boolean {
  const trimmed = line.trim();
  return /^(?:\/\/|\/\*|\*)/.test(trimmed) || (rules.hashComments && trimmed.startsWith("#"));
}

/** In JavaScript, `/` after an operator or opening bracket starts a regular expression literal. */
function startsRegex(line: string, at: number): boolean {
  const next = line[at + 1];
  if (next === "/" || next === "*") return false;
  const before = line.slice(0, at).trimEnd();
  return before === "" || /[(,=:[!&|?{};+\-*%<>~^]$/.test(before) || /\b(?:return|typeof|case|in|of)$/.test(before);
}

function regexEnd(line: string, at: number): number {
  let inClass = false;
  for (let c = at + 1; c < line.length; c++) {
    const char = line[c];
    if (char === "\\") c++;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return c;
  }
  return line.length;
}
