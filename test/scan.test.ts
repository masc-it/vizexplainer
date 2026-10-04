import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findDependencies } from "../src/scan/imports.ts";
import { draftDocument, scanRepository } from "../src/scan/scan.ts";

const edges = (files: Record<string, string>, goModule?: string) =>
  findDependencies(Object.entries(files).map(([p, text]) => ({ path: p, text })), { goModule })
    .map((d) => `${d.from} -${d.kind}-> ${d.to}`)
    .sort();

describe("dependency detection", () => {
  it("resolves TypeScript and JavaScript relative imports, including .js names for .ts files", () => {
    expect(
      edges({
        "src/a.ts": `import { b } from "./b.js";\nimport type { C } from "./c";\nexport * from "./d/index.ts";\nimport x from "react";`,
        "src/b.ts": `const c = require("./c")`,
        "src/c.tsx": "",
        "src/d/index.ts": `await import("../b")`,
      }),
    ).toEqual(["src/a.ts -imports-> src/b.ts", "src/a.ts -imports-> src/c.tsx", "src/a.ts -imports-> src/d/index.ts", "src/b.ts -imports-> src/c.tsx", "src/d/index.ts -imports-> src/b.ts"]);
  });

  it("resolves Python relative and absolute imports", () => {
    expect(
      edges({
        "pkg/__init__.py": "",
        "pkg/core.py": "from .util import helper\nfrom . import models\nimport os",
        "pkg/util.py": "",
        "pkg/models.py": "from pkg.util import thing",
        "main.py": "import pkg.core\nfrom pkg import models",
      }),
    ).toEqual([
      "main.py -imports-> pkg/core.py",
      "main.py -imports-> pkg/models.py",
      "pkg/core.py -imports-> pkg/models.py",
      "pkg/core.py -imports-> pkg/util.py",
      "pkg/models.py -imports-> pkg/util.py",
    ]);
  });

  it("resolves Kotlin imports, wildcard imports, same-package and fully qualified uses", () => {
    expect(
      edges({
        "app/Main.kt": "package app\nimport app.tools.*\nimport app.data.Repo\nfun main() { Helper(); Tool(); app.ui.Screen() }",
        "app/Helper.kt": "package app\nclass Helper",
        "app/tools/Tool.kt": "package app.tools\nclass Tool",
        "app/tools/Unused.kt": "package app.tools\nclass Unused",
        "app/data/Repo.kt": "package app.data\nclass Repo",
        "app/ui/Screen.kt": "package app.ui\nclass Screen",
      }),
    ).toEqual(["app/Main.kt -imports-> app/data/Repo.kt", "app/Main.kt -imports-> app/tools/Tool.kt", "app/Main.kt -uses-> app/Helper.kt", "app/Main.kt -uses-> app/ui/Screen.kt"]);
  });

  it("resolves Go module packages to folders and Rust modules to files", () => {
    expect(edges({ "cmd/main.go": 'import (\n\t"fmt"\n\t"example.com/app/internal/store"\n)', "internal/store/db.go": "" }, "example.com/app")).toEqual([
      "cmd/main.go -imports-> internal/store",
    ]);
    expect(edges({ "src/lib.rs": "mod parser;\nuse crate::net::client::Client;", "src/parser.rs": "", "src/net/client.rs": "" })).toEqual([
      "src/lib.rs -imports-> src/net/client.rs",
      "src/lib.rs -imports-> src/parser.rs",
    ]);
  });
});

describe("scan", () => {
  it("collapses single-child folder chains and drafts a valid starting document", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "vizx-scan-"));
    const write = async (file: string, text: string) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), text);
    };
    await write("app/src/main/java/com/acme/Main.kt", "package com.acme\nfun main() = Util()");
    await write("app/src/main/java/com/acme/Util.kt", "package com.acme\nclass Util");
    await write("app/src/test/java/com/acme/MainTest.kt", "package com.acme\nclass MainTest { val m = Util() }");
    await write("node_modules/x/index.js", "ignored");
    const scan = await scanRepository(root, { maxFiles: 100 });

    expect(scan.files.map((file) => file.path)).toEqual(["app/src/main/java/com/acme/Main.kt", "app/src/main/java/com/acme/Util.kt", "app/src/test/java/com/acme/MainTest.kt"]);
    expect(scan.folders).toEqual([
      { path: "app/src", label: "app/src", parent: undefined },
      { path: "app/src/main/java/com/acme", label: "main/java/com/acme", parent: "app/src" },
      { path: "app/src/test/java/com/acme", label: "test/java/com/acme", parent: "app/src" },
    ]);
    const doc = draftDocument(scan, { title: "Acme", root: "." });
    expect(doc.entities["app/src/test/java/com/acme/MainTest.kt"]).toEqual({ label: "MainTest.kt", kind: "test", parent: "app/src/test/java/com/acme" });
    expect(doc.relations).toContainEqual({ from: "app/src/main/java/com/acme/Main.kt", to: "app/src/main/java/com/acme/Util.kt", kind: "uses" });
  });
});
