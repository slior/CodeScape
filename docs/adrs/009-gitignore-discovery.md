# 009 - Ignore files with gitignore rules

## Status

Accepted on 2026-10-10.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md)
- [008 - Take districts from npm workspaces](008-workspace-districts.md)

## Context

Analyze walks the folder. The parser does not. Each parser exports `defaultIgnore`. The TypeScript defaults are the gitignore patterns `node_modules`, `.git`, `dist`, `build`, `coverage`, and `.nx`. Test files are included.

There is no separate record for byte-identical output. Directory entries are visited in UTF-8 byte order so two runs see files in the same order.

## Decision

Ignore rules are gitignore-style. The last matching pattern wins. A pattern that starts with `!` re-includes.

Merge order is last-match order:

1. The language defaults, unless `languages.typescript.useDefaults` is false.
2. Top-level `ignore` from the config file.
3. `languages.typescript.ignore` from the config file.
4. Each `--ignore` glob on the command, in order.

Config discovery: `--config <file>` when passed, otherwise `<folder>/sw3d.config.json` when that file exists, otherwise defaults only. A missing `--config` path is fatal. An absent default file is not.

Config shape: optional `ignore` (string array) and `languages` (a map). Each language entry may contain `useDefaults` (boolean) and `ignore` (string array). Any other key is fatal. Other language ids are accepted by `loadConfig` and unused by the TypeScript merge. A missing `languages` object means defaults plus the top-level ignore list.

Matching:

- A trailing `/` matches directories only.
- A leading `/` anchors the match to the path.
- A pattern with no `/` matches any single path segment.
- `*` and `?` do not cross `/`. `**` crosses directories.
- Every directory and file is judged twice: once by the repo-relative path being traversed, and once by its canonical path. The canonical path is the stored package path when the real path lies inside a workspace package, and otherwise the repo-relative real path. If either identity is ignored, the entry is ignored. A `!` that re-includes only one of those identities does not bring the entry back.
- A directory is not entered when either identity is ignored. Ignoring a directory ignores everything under it, including paths a later `!` would otherwise match. A negation can re-include a child only when the parent directory is not itself ignored. `generated/*` ignores the children, the walker still enters `generated`, and `!generated/keep.ts` keeps that file. `node_modules` ignores the directory, the walker does not enter it, and `!node_modules/keep.ts` does not bring that file back.

Walk:

- Starts at the snapshot folder. At each directory, entries are sorted by UTF-8 byte order of the filename, then visited depth-first.
- Records `.ts` and `.tsx`. Skips `.d.ts`.
- Identity is the canonical real path. A later path with the same real path is skipped and does not add a warning.
- A symlink whose real path is a directory already on the walk stack is a cycle: skip it, no warning.
- A symlink whose real path lies outside the root is skipped and adds a warning ("symlink outside root").
- A directory inside a package that cannot be listed, and a source file that cannot be read, become unreadable warnings.
- An ignored path is not entered.

## Consequences

- `node_modules`, `dist`, and `.git` never become boxes under the defaults.
- A project can drop tests with `languages.typescript.ignore`, or turn the defaults off with `useDefaults: false`.
- Negation cannot rescue a file inside an ignored directory. That matches git, and it surprises people who write `!node_modules/keep.ts`.
- Two identities are tested, so an alias whose name is not `node_modules` is still pruned when its real path is `node_modules`.
- Unknown config keys fail the snapshot before any output.
- The walk order is part of byte-identical `world.json`. A readdir that followed filesystem order would change which path is stored first when aliases exist.
