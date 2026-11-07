# 011 - Classify imports without a filesystem resolver

## Status

Accepted on 2026-10-10.

Depends on:

- [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md)
- [008 - Take districts from npm workspaces](008-workspace-districts.md)
- [009 - Ignore files with gitignore rules](009-gitignore-discovery.md)

## Context

[005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md) says the parser receives text and `includedPaths` and must not open files. This record is how a specifier becomes an internal file or an external package name.

A workspace specifier equals a known workspace package name, or starts with that name plus `/`. When more than one package name matches, the longest name wins.

A bare specifier is a non-relative specifier that is not a workspace specifier. Its normalized package name is `@scope/pkg` when scoped, otherwise the first path segment. `lodash/fp` normalizes to `lodash`. Both specifiers share one portal name.

Workspace specifiers do not use `main`, `types`, or `exports`. Those fields often point at ignored `dist` output. A workspace specifier maps only to included source files under the package's declared repo-relative path.

## Decision

Each specifier is classified in this order. The first rule that applies wins. No filesystem resolver is used.

1. A workspace specifier that maps to a path in `includedPaths` is internal, including when that path is unreadable and therefore absent from `files`. Any other workspace specifier is dropped. The drop appends a warning `{ path: fromFile, message: "unresolved specifier <specifier>" }` and creates neither a road nor a portal.

   The package-root specifier (the package name alone) uses the first of these that is an included source file: `src/index.ts`, `src/index.tsx`, `index.ts`, `index.tsx`.

   A subpath is reduced first. A trailing `.js` is removed and a trailing `.jsx` is removed, so `foo.js` probes `foo.ts` and not `foo.js.ts`. The reduced subpath `a/b` then uses the first of: `src/a/b.ts`, `src/a/b.tsx`, `src/a/b/index.ts`, `src/a/b/index.tsx`, `a/b.ts`, `a/b.tsx`, `a/b/index.ts`, `a/b/index.tsx`. Paths are relative to the declared package directory.

2. A relative specifier that maps to a path in `includedPaths` is internal, including an unreadable included file. Any other relative specifier is dropped with the same warning. This covers a `.d.ts` file, a non-source file, a file outside a workspace package, and an ignored file.

   A relative specifier is joined to the importing file's directory with POSIX `..` segments, producing a repo-relative stem. The first candidate that is in `includedPaths` wins:

   - A stem ending in `.ts` or `.tsx` has one candidate, that exact path. A further extension is not added. A `.d.ts` path is not an included source file, so it misses.
   - A stem ending in `.js` or `.jsx` drops that suffix, then probes the reduced stem plus `.ts`, the reduced stem plus `.tsx`, the reduced stem plus `/index.ts`, and the reduced stem plus `/index.tsx`.
   - Any other stem is extensionless. It probes `stem.ts`, `stem.tsx`, `stem/index.ts`, and `stem/index.tsx`, in that order. `./shared` therefore selects `shared.ts` when both `shared.ts` and `shared/index.ts` are included, and selects `shared/index.ts` only when the file candidates are absent.

3. A bare specifier is external whether or not it would resolve on disk. Resolution into `node_modules` and a failure to resolve are the same outcome: one external fact whose name is the normalized package name. No warning is written for a bare specifier.

## Consequences

- The parser never reads `node_modules` and never asks Node's module resolver. A bare import of something that exists in `node_modules` is still a portal.
- A package whose `main` and `types` point at `dist` still connects to `src/index.ts` when that file is included.
- An import written as `.js` in TypeScript source connects to the `.ts` file. An explicit `.ts` import connects only to that path.
- A workspace import of an ignored or missing file is a warning, not a portal. A bare import is a portal, not a warning.
- Changing the probe order changes which file a road points at, and therefore the city. Golden fixtures lock the current order.
