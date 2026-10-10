import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import { symbolBoxId } from "@sw3d/model";
import type { CodeUnit, ImportFact, ParseInput } from "@sw3d/model";
import { createTypeScriptParser } from "./create-parser.js";

function parse(values: {
  files: readonly { path: string; text: string }[];
  includedPaths: readonly string[];
  packages?: readonly { path: string; name: string }[];
}) {
  const input: ParseInput = {
    root: "/repo",
    files: values.files,
    includedPaths: values.includedPaths,
    packages: values.packages ?? [],
  };
  return createTypeScriptParser().parse(input);
}

function unit(filePath: string, name: string, kind: CodeUnit["kind"]): CodeUnit {
  return { id: symbolBoxId(filePath, name), kind, name, path: filePath };
}

describe("createTypeScriptParser", () => {
  it("exposes the typescript id and the six default ignore names", () => {
    const parser = createTypeScriptParser();
    expect(parser.id).toBe("typescript");
    expect([...parser.defaultIgnore]).toEqual([
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".nx",
    ]);
  });

  it("does not read the filesystem", () => {
    const readFileSync = jest.spyOn(fs, "readFileSync");
    parse({
      files: [{ path: "src/a.ts", text: "export class A {}\n" }],
      includedPaths: ["src/a.ts"],
    });
    expect(readFileSync).not.toHaveBeenCalled();
    readFileSync.mockRestore();
  });

  it("parses JSX in a .tsx file and reports a syntax error for the same text in a .ts file", () => {
    const text = "export class Widget {}\nconst view = <Widget />;\n";
    const tsx = parse({
      files: [{ path: "src/view.tsx", text }],
      includedPaths: ["src/view.tsx"],
    });
    expect(tsx.warnings).toEqual([]);
    expect(tsx.units).toEqual([unit("src/view.tsx", "Widget", "class")]);
    const tsFile = parse({
      files: [{ path: "src/view.ts", text }],
      includedPaths: ["src/view.ts"],
    });
    expect(tsFile.warnings).toEqual([{ path: "src/view.ts", message: "syntax error" }]);
    expect(tsFile.units).toEqual([]);
  });

  it("sorts copies and does not mutate input.files", () => {
    const files = Object.freeze([
      Object.freeze({ path: "b.ts", text: "export class B {}\n" }),
      Object.freeze({ path: "a.ts", text: "export class A {}\n" }),
    ]);
    const result = parse({ files, includedPaths: ["a.ts", "b.ts"] });
    expect(files.map((file) => file.path)).toEqual(["b.ts", "a.ts"]);
    expect(result.files).toEqual([{ path: "a.ts" }, { path: "b.ts" }]);
  });

  it("emits class, interface, type, and enum units, and no unit for a function-only file", () => {
    const result = parse({
      files: [
        { path: "src/kinds.ts", text: "export class Box {}\nexport interface Row {}\nexport type Id = string;\nexport enum Color { Red }\n" },
        { path: "src/fns.ts", text: "export function run(): void {}\nexport const value = 1;\n" },
      ],
      includedPaths: ["src/kinds.ts", "src/fns.ts"],
    });
    const expected = [
      unit("src/kinds.ts", "Box", "class"),
      unit("src/kinds.ts", "Color", "enum"),
      unit("src/kinds.ts", "Id", "type"),
      unit("src/kinds.ts", "Row", "interface"),
    ].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id)));
    expect(result.units).toEqual(expected);
    expect(result.files).toEqual([{ path: "src/fns.ts" }, { path: "src/kinds.ts" }]);
    expect(result.units.some((item) => item.path === "src/fns.ts")).toBe(false);
  });

  it("names a nameless default class default and keeps a named default class", () => {
    const result = parse({
      files: [
        { path: "src/anon.ts", text: "export default class { run(): void {} }\n" },
        { path: "src/named.ts", text: "export default class Named { run(): void {} }\n" },
      ],
      includedPaths: ["src/anon.ts", "src/named.ts"],
    });
    expect(result.units).toEqual([
      unit("src/anon.ts", "default", "class"),
      unit("src/named.ts", "Named", "class"),
    ].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) || Buffer.compare(Buffer.from(a.id), Buffer.from(b.id))));
  });

  it("does not treat a class expression as a unit", () => {
    const result = parse({
      files: [{ path: "src/expr.ts", text: "const holder = class Expr { method(): number { return 1; } };\nexport const value = holder;\n" }],
      includedPaths: ["src/expr.ts"],
    });
    expect(result.units).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.files).toEqual([{ path: "src/expr.ts" }]);
  });

  it("returns one syntax-error warning and no units or imports from that file", () => {
    const result = parse({
      files: [
        { path: "src/broken.ts", text: 'import "lodash";\nexport class Broken {\n' },
        { path: "src/ok.ts", text: "export class Ok {}\n" },
      ],
      includedPaths: ["src/broken.ts", "src/ok.ts"],
    });
    expect(result.warnings).toEqual([{ path: "src/broken.ts", message: "syntax error" }]);
    expect(result.imports).toEqual([]);
    expect(result.units).toEqual([unit("src/ok.ts", "Ok", "class")]);
  });

  it("merges one name as class, else enum, else interface, else type", () => {
    const result = parse({
      files: [
        {
          path: "src/class-wins.ts",
          text: "interface Widget {}\ninterface Widget { x: number }\nenum Widget { A }\ntype Widget = string;\nclass Widget {}\n",
        },
        {
          path: "src/enum-wins.ts",
          text: "type Widget = string;\ninterface Widget {}\nenum Widget { A }\n",
        },
        { path: "src/interface-wins.ts", text: "type Widget = string;\ninterface Widget {}\n" },
        { path: "src/type-only.ts", text: "type Widget = string;\n" },
      ],
      includedPaths: ["src/class-wins.ts", "src/enum-wins.ts", "src/interface-wins.ts", "src/type-only.ts"],
    });
    expect(result.units).toEqual([
      unit("src/class-wins.ts", "Widget", "class"),
      unit("src/enum-wins.ts", "Widget", "enum"),
      unit("src/interface-wins.ts", "Widget", "interface"),
      unit("src/type-only.ts", "Widget", "type"),
    ]);
  });

  it("emits one fact for each supported string-literal form and none for a non-literal require or import", () => {
    const result = parse({
      files: [
        {
          path: "forms.ts",
          text: [
            'import "side-effect";',
            'import { a } from "decl";',
            'import type { T } from "type-only";',
            'export { b } from "export-from";',
            'import req = require("import-equals");',
            'require("cjs");',
            'import("dynamic");',
            'const name = "nope";',
            "require(name);",
            "import(name);",
            "",
          ].join("\n"),
        },
      ],
      includedPaths: ["forms.ts"],
    });
    const external = (specifier: string): ImportFact => ({
      fromFile: "forms.ts",
      specifier,
      target: { kind: "external", name: specifier },
    });
    expect(result.imports).toEqual([
      external("cjs"),
      external("decl"),
      external("dynamic"),
      external("export-from"),
      external("import-equals"),
      external("side-effect"),
      external("type-only"),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("resolves dialectic-core to packages/core/src/index.ts when dist is also included", () => {
    const result = parse({
      files: [
        { path: "packages/cli/src/main.ts", text: 'import { Debate } from "dialectic-core";\n' },
        { path: "packages/core/src/index.ts", text: "export class Debate {}\n" },
      ],
      includedPaths: [
        "packages/cli/src/main.ts",
        "packages/core/dist/index.ts",
        "packages/core/src/index.ts",
      ],
      packages: [
        { path: "packages/core", name: "dialectic-core" },
        { path: "packages/cli", name: "dialectic-cli" },
      ],
    });
    expect(result.imports).toEqual([
      {
        fromFile: "packages/cli/src/main.ts",
        specifier: "dialectic-core",
        target: { kind: "internal", file: "packages/core/src/index.ts" },
      },
    ]);
    expect(result.warnings).toEqual([]);
    expect(result.units).toContainEqual(unit("packages/core/src/index.ts", "Debate", "class"));
  });

  it("drops a workspace specifier that only matches dist and does not create an external fact", () => {
    const result = parse({
      files: [{ path: "packages/cli/src/main.ts", text: 'import "dialectic-core";\n' }],
      includedPaths: ["packages/cli/src/main.ts", "packages/core/dist/index.ts"],
      packages: [{ path: "packages/core", name: "dialectic-core" }],
    });
    expect(result.imports).toEqual([]);
    expect(result.warnings).toEqual([
      { path: "packages/cli/src/main.ts", message: "unresolved specifier dialectic-core" },
    ]);
  });

  it("resolves a workspace foo.js subpath and a relative foo.js import to .ts files", () => {
    const sub = parse({
      files: [{ path: "packages/cli/src/main.ts", text: 'import "@scope/pkg/foo.js";\n' }],
      includedPaths: ["packages/cli/src/main.ts", "packages/pkg/src/foo.js.ts", "packages/pkg/src/foo.ts"],
      packages: [{ path: "packages/pkg", name: "@scope/pkg" }],
    });
    expect(sub.imports).toEqual([
      {
        fromFile: "packages/cli/src/main.ts",
        specifier: "@scope/pkg/foo.js",
        target: { kind: "internal", file: "packages/pkg/src/foo.ts" },
      },
    ]);
    const relative = parse({
      files: [{ path: "pkg/src/main.ts", text: 'import "./foo.js";\n' }],
      includedPaths: ["pkg/src/main.ts", "pkg/src/foo.ts"],
    });
    expect(relative.imports).toEqual([
      {
        fromFile: "pkg/src/main.ts",
        specifier: "./foo.js",
        target: { kind: "internal", file: "pkg/src/foo.ts" },
      },
    ]);
  });

  it("resolves ./shared, an index fallback, debate.types, and an explicit .ts path", () => {
    const fromPrompts = "packages/core/src/agents/prompts/x.ts";
    const both = parse({
      files: [{ path: fromPrompts, text: 'import "./shared";\n' }],
      includedPaths: [
        fromPrompts,
        "packages/core/src/agents/prompts/shared/index.ts",
        "packages/core/src/agents/prompts/shared.ts",
      ],
    });
    expect(both.imports[0]?.target).toEqual({
      kind: "internal",
      file: "packages/core/src/agents/prompts/shared.ts",
    });
    const indexOnly = parse({
      files: [{ path: fromPrompts, text: 'import "./shared";\n' }],
      includedPaths: [fromPrompts, "packages/core/src/agents/prompts/shared/index.ts"],
    });
    expect(indexOnly.imports[0]?.target).toEqual({
      kind: "internal",
      file: "packages/core/src/agents/prompts/shared/index.ts",
    });
    const debate = parse({
      files: [
        {
          path: "packages/core/src/agents/prompts/testing-prompts.ts",
          text: 'import "../../types/debate.types";\n',
        },
      ],
      includedPaths: [
        "packages/core/src/agents/prompts/testing-prompts.ts",
        "packages/core/src/types/debate.types.ts",
      ],
    });
    expect(debate.imports[0]?.target).toEqual({
      kind: "internal",
      file: "packages/core/src/types/debate.types.ts",
    });
    const explicit = parse({
      files: [{ path: "pkg/src/main.ts", text: 'import "./file.ts";\n' }],
      includedPaths: ["pkg/src/main.ts", "pkg/src/file.ts", "pkg/src/file.ts.ts"],
    });
    expect(explicit.imports[0]?.target).toEqual({ kind: "internal", file: "pkg/src/file.ts" });
  });

  it("uses one external lodash portal name for lodash and lodash/fp", () => {
    const result = parse({
      files: [{ path: "src/a.ts", text: 'import "lodash/fp";\nimport "lodash";\n' }],
      includedPaths: ["src/a.ts", "node_modules/lodash/index.ts", "node_modules/lodash/fp.js"],
    });
    expect(result.imports).toEqual([
      { fromFile: "src/a.ts", specifier: "lodash", target: { kind: "external", name: "lodash" } },
      { fromFile: "src/a.ts", specifier: "lodash/fp", target: { kind: "external", name: "lodash" } },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("imports an unreadable path that is present only in includedPaths", () => {
    const result = parse({
      files: [{ path: "packages/core/src/main.ts", text: 'import "./missing.ts";\n' }],
      includedPaths: ["packages/core/src/main.ts", "packages/core/src/missing.ts"],
    });
    expect(result.files).toEqual([{ path: "packages/core/src/main.ts" }]);
    expect(result.imports).toEqual([
      {
        fromFile: "packages/core/src/main.ts",
        specifier: "./missing.ts",
        target: { kind: "internal", file: "packages/core/src/missing.ts" },
      },
    ]);
  });

  it("drops a .d.ts import, a markdown import, and a relative import that is not included", () => {
    const result = parse({
      files: [
        {
          path: "packages/core/src/main.ts",
          text: 'import "./types.d.ts";\nimport "./README.md";\nimport "../../../top";\n',
        },
      ],
      includedPaths: [
        "packages/core/src/main.ts",
        "packages/core/src/types.d.ts",
        "packages/core/src/README.md",
      ],
    });
    expect(result.imports).toEqual([]);
    expect(result.warnings).toEqual([
      { path: "packages/core/src/main.ts", message: "unresolved specifier ./types.d.ts" },
      { path: "packages/core/src/main.ts", message: "unresolved specifier ./README.md" },
      { path: "packages/core/src/main.ts", message: "unresolved specifier ../../../top" },
    ]);
  });

  it("sorts files, units, and imports with external facts before internal facts", () => {
    const result = parse({
      files: [
        { path: "b.ts", text: 'import "./a";\nimport "lodash";\nexport class B {}\n' },
        { path: "a.ts", text: "export class Z {}\nexport interface A {}\n" },
      ],
      includedPaths: ["b.ts", "a.ts"],
    });
    expect(result.files).toEqual([{ path: "a.ts" }, { path: "b.ts" }]);
    expect(result.units).toEqual(
      [unit("a.ts", "A", "interface"), unit("a.ts", "Z", "class"), unit("b.ts", "B", "class")].sort(
        (left, right) =>
          Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)) ||
          Buffer.compare(Buffer.from(left.id), Buffer.from(right.id)),
      ),
    );
    expect(result.imports).toEqual([
      { fromFile: "b.ts", specifier: "lodash", target: { kind: "external", name: "lodash" } },
      { fromFile: "b.ts", specifier: "./a", target: { kind: "internal", file: "a.ts" } },
    ]);
  });
});
