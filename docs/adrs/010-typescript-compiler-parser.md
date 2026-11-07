# 010 - Parse TypeScript with the compiler API

## Status

Accepted on 2026-10-10.

Depends on:

- [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md)
- [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md)

## Context

The graph in [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md) is language-neutral. This record is how the TypeScript plugin fills it. Analyze reads the files. The parser only sees the text it is given.

## Decision

`createTypeScriptParser` returns a `SourceParser`. Its `id` is `"typescript"`. `defaultIgnore` is `node_modules`, `.git`, `dist`, `build`, `coverage`, and `.nx`.

`parse` walks the files in `ParseInput`. It does not read the disk. For each file it parses the text it was given.

`parse-file.ts` uses the `typescript` package. It builds an in-memory `CompilerHost` and calls `ts.createProgram` on that one file. The host's `getSourceFile` returns `ts.createSourceFile` for the path it was given and `undefined` otherwise. Script kind is TSX when the path ends in `.tsx`, otherwise TS. It parses the text in memory and does not apply the project's tsconfig. The compiler options on the program are `target` `Latest` and `module` `NodeNext`.

Walking the tree records:

- A class, interface, type alias, or enum declaration becomes a unit. A function does not. A class expression does not.
- A nameless default-exported class is named `default`.
- Declarations in one file that share a name are one unit. Kind is class if any is a class, otherwise enum if any is an enum, otherwise interface if any is an interface, otherwise type.
- Each unit id is `symbolBoxId(filePath, name)` from `@sw3d/model`.
- An import declaration (including a side-effect import), `export ... from`, `import ... = require("...")`, a `require("...")` call, and a dynamic `import("...")` are facts when the specifier is a string literal. A non-literal `require` or dynamic import is skipped with no warning.
- Each specifier is classified by `resolveSpecifier`. The classification rules are [011 - Classify imports without a filesystem resolver](011-specifier-classification.md).
- A file that fails to parse is returned with no units, a warning, and no imports from that file. The parser does not invent declarations from a broken tree.

`.d.ts` files are not source. The walk never hands them to the parser. A relative import of a `.d.ts` file does not resolve as included source.

`files`, `units`, and `imports` are sorted before they leave the parser, as [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md) requires.

## Consequences

- Syntax coverage tracks the TypeScript version pinned in the workspace. A language feature the compiler can parse can become a unit or an import without a handwritten grammar.
- The analyzed project's compiler options, path mappings, and project references are not applied. Two files that typecheck only because of paths in tsconfig are not connected by those paths.
- The parser is a runtime dependency on the `typescript` package, which is large. The snapshot does not ship it. Only analyze, at snapshot time, loads it.
- A syntax error removes that file's units and imports and keeps a warning. The rest of the city is still written.
- Replacing the compiler API with another parser means re-implementing this visitor. The graph shape in [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md) stays.
