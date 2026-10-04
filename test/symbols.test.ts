import { describe, expect, it } from "vitest";
import { findSymbol, listSymbols } from "../src/sources/symbols.ts";

const ranges = (text: string, lang: string) => listSymbols(text, lang).map((s) => `${s.qualified} ${s.start}-${s.end}`);

describe("symbol locator", () => {
  it("handles Kotlin classes, KDoc, overloads, expression bodies and companions", () => {
    const kotlin = `class Service(
    private val repo: Repo,
) {
    /** Sends. */
    suspend fun send(a: Int): String = send(a, 0)

    suspend fun send(a: Int, b: Int): String {
        val url = "https://example.com" // a comment
        return "{"
    }

    companion object {
        const val NAME = "svc"
    }
}

fun top() = when (x) {
    1 -> "a"
    else -> "b"
}`;
    expect(ranges(kotlin, "kt")).toEqual(["Service 1-15", "Service.send 4-5", "Service.send 7-10", "Service.Companion 12-14", "Service.NAME 13-13", "top 17-20"]);
    expect(findSymbol(kotlin, "send", "kt")).toMatchObject({ ok: false });
    expect(findSymbol(kotlin, "Service.send#2", "kt")).toMatchObject({ ok: true, symbol: { start: 7, end: 10 } });
    expect(findSymbol(kotlin, "Service.NAME", "kt")).toMatchObject({ ok: true, symbol: { line: 13 } });
  });

  it("handles TypeScript functions, classes with methods, regex literals and chained consts", () => {
    const ts = `export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

export class Box {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export const Schema = z
  .object({ a: z.string() })
  .strict();
const done = 1;`;
    expect(ranges(ts, "ts")).toEqual(["escape 1-3", "Box 5-10", "Box.constructor 6-6", "Box.toString 7-9", "Schema 12-14", "done 15-15"]);
  });

  it("handles Python by indentation, including decorators and multi-line signatures", () => {
    const python = `import os

class Store:
    """Keeps things."""

    @property
    def size(self):
        return 1

    def put(
        self, key,
    ):
        if key:
            return True

        return False

def main():
    pass
`;
    expect(ranges(python, "py")).toEqual(["Store 3-16", "Store.size 6-8", "Store.put 10-16", "main 18-19"]);
  });

  it("handles Go methods and Rust impls with lifetimes", () => {
    const go = `// Run starts it.
func (s *Server) Run(ctx context.Context) error {
\treturn nil
}

type Config struct {
\tPort int
}`;
    expect(ranges(go, "go")).toEqual(["Run 1-4", "Config 6-8"]);
    const rust = `impl<'a> Parser<'a> {
    pub fn parse(&mut self, input: &'a str) -> Result<(), Error> {
        let c = '{';
        Ok(())
    }
}`;
    expect(ranges(rust, "rs")).toEqual(["Parser 1-6", "Parser.parse 2-5"]);
  });

  it("handles Java methods declared with return types", () => {
    const java = `public class Cache {
    @Override
    public synchronized String get(String key) {
        if (key == null) {
            return null;
        }
        return map.get(key);
    }
}`;
    expect(ranges(java, "java")).toEqual(["Cache 1-9", "Cache.get 2-8"]);
  });

  it("skips object types in TypeScript signatures and prefers values over same-named types", () => {
    const ts = `export const Entity = z.object({});
export type Entity = z.infer<typeof Entity>;

export async function load(paths: string[]): Promise<{ registry: R; issues: I[] }> {
  const issues: I[] = [];
  return { registry, issues };
}`;
    expect(ranges(ts, "ts")).toEqual(["Entity 1-1", "Entity 2-2", "load 4-7"]);
    expect(findSymbol(ts, "Entity", "ts")).toMatchObject({ ok: true, symbol: { kind: "const" } });
  });

  it("finds functions nested in functions, which listings leave out", () => {
    const ts = "export function outer() {\n  function inner() {\n    return 1;\n  }\n  const local = 2;\n}";
    expect(ranges(ts, "ts")).toEqual(["outer 1-6"]);
    expect(findSymbol(ts, "outer.inner", "ts")).toMatchObject({ ok: true, symbol: { start: 2, end: 4 } });
    expect(findSymbol(ts, "local", "ts")).toMatchObject({ ok: false });
  });

  it("explains missing symbols", () => {
    expect(findSymbol("fun alpha() {}\nfun beta() {}", "alphaa", "kt")).toEqual({ ok: false, message: 'symbol "alphaa" not found (did you mean "alpha"?)' });
  });
});
