# 005 - Use a language-neutral code graph and parser plugins

## Status

Accepted on 2026-10-10.

This record is the graph and the plugin interface. How the TypeScript plugin fills the graph is [010 - Parse TypeScript with the compiler API](010-typescript-compiler-parser.md).

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [004 - Keep the shared contract in @sw3d/model](004-model-contract.md)

## Context

Compose must not know TypeScript. The viewer must not know TypeScript. Analyze reads files and hands text to a parser. The parser returns a code graph. Compose, layout, and the viewer read that graph and nothing about the language.

## Decision

The shared contract is a language-neutral code graph. A language plugin is a `SourceParser`. TypeScript is the only plugin in phase 1. Another language is a new package with the same interface. Out of scope: function-level nodes, and any language besides TypeScript.

`SourceParser`:

- `readonly id: string`
- `readonly defaultIgnore: readonly string[]`
- `parse(input: ParseInput): ParseResult`

Each parser exports its own default ignore list. The TypeScript parser's `defaultIgnore` is `node_modules`, `.git`, `dist`, `build`, `coverage`, and `.nx`. How those lists merge with project ignore rules is [009 - Ignore files with gitignore rules](009-gitignore-discovery.md).

`ParseInput`:

- `root: string`
- `files`: already-read `{ path, text }`. `path` is repo-relative POSIX. `text` is the file body.
- `includedPaths`: every included source path, readable or not.
- `packages`: workspace packages analyze already discovered, including a synthetic root district when the repo has no workspaces.

The parser uses only those fields. It does not rediscover packages or files from the filesystem. A file that cannot be read is absent from `files`. Its path stays in `includedPaths`, so an import of it is internal. Analyze records the read warning and adds that path to the code graph as an unreadable file.

`ParseResult` and `CodeGraph` hold:

- `files`: included source files, repo-relative POSIX paths.
- `units`: each class, interface, type alias, and enum, after merge rules. Fields: id, kind, name, file path. Functions are not units. Class expressions are not declarations and are not units.
- `imports`: one fact per supported import that survives resolution. `fromFile` is a source path. Target is `{ kind: internal, file }` or `{ kind: external, name }`.
- `warnings`.

Supported import forms, only when the module specifier is a string literal: import declarations including side-effect imports, `export ... from`, `import x = require("...")`, `require("...")`, and dynamic `import("...")`. A non-literal `require` or dynamic import produces no fact and no warning.

Merge of same-name declarations in one file: one unit. Kind is class if any merged declaration is a class, otherwise enum, otherwise interface, otherwise type.

A nameless default-exported class is named `default`. Interfaces, type aliases, and enums are named. A file the parser cannot parse is returned with no units and a warning. It does not invent declarations from a broken tree.

`files`, `units`, and `imports` are sorted before they leave the parser. `files` and `units` by path, then id. `imports` by `fromFile`, then target kind (external before internal), then target file or package name, then the raw specifier.

## Consequences

- Compose, layout, and the viewer never import a parser.
- Adding functions as nodes would add units, then boxes, then streets. The graph has no place for them today.
- An unreadable file still occupies `includedPaths`, so other files can import it as internal. The city still has a box for it and a warning.
- A second language can be added without a new city schema, as long as it emits the same graph.
- The parser cannot open a file to resolve an import. Resolution facts have to be in `ParseInput`. That constraint is what [011 - Classify imports without a filesystem resolver](011-specifier-classification.md) builds on.
