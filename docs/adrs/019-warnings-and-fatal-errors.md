# 019 - Keep warnings on the document and stop before a fatal error

## Status

Accepted on 2026-10-14.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [004 - Keep the shared contract in @sw3d/model](004-model-contract.md)
- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)

## Context

One broken file can sit in a folder that is otherwise a city. A missing folder, a bad config, or a tree with no included source is a different failure. Warnings stay on the document the viewer reads. A fatal error stops before any snapshot is written.

## Decision

A Warning is `{ path, message }`. CodeGraph, CityStructure, and World each carry a list. serializeWorld sorts warnings by path, then message, and writes them into world.json. The command prints each warning to stderr as `path: message`.

mergeWarnings keeps the first warning for each path and message, then sorts by path and message with UTF-8 byte order. The world's warnings are the layout warnings merged with the graph warnings.

These cases still write the city and exit 0:

- A source file analyze cannot read does not enter parse. It becomes a file box with no units and no imports, and its warning is on the world. The message starts with "unreadable".
- A source file that parse cannot parse is returned with no units, a warning ("syntax error"), and no imports from that file.
- A workspace or relative specifier that does not map to an included path is dropped. The warning message is "unresolved specifier " plus the specifier. No road and no portal are created for it.
- A symlink that points outside the root is skipped. The warning message is "symlink outside root".

A bare specifier is an external import. It does not add a warning.

A fatal error prints the message and returns exit code 1. It does not create or modify the output directory. The error type is named SnapshotFatal. main prints the message and returns 1. Rollback after publish has started is [023 - Publish a snapshot by staging and rollback](023-snapshot-publish.md). A fatal error before publish deletes any staging directory it created.

- The folder is missing or unreadable.
- The output path is the analyzed folder or a path inside it, compared by real path. This fails before the staging directory is created.
- `--config` is missing, or a config file is not valid JSON, or it has an unknown key or a bad ignore shape.
- A workspace package.json is missing, invalid, or has a missing or non-string name. Two patterns for the same directory disagree on name. Two distinct directories share a package name. `workspaces` is present but is not an array of strings or `{ packages: string[] }`.
- No included source files remain after ignore and workspace ownership. Compose throws EmptySourceError with "No included source files remain after ignore and workspace ownership". Analyze rethrows that message as SnapshotFatal. Zero readable files and zero unreadable source files is SnapshotFatal("no included source files").
- The viewer build is missing: SnapshotFatal("viewer build is missing; run nx build viewer").
- Staging validation fails, or publish cannot find a free transaction id.

`view` exits non-zero when the directory lacks `index.html` or `world.json`, and it does not modify that directory. The command itself is [024 - Expose snapshot and view as the sw3d commands](024-snapshot-and-view-commands.md).

## Consequences

- A broken file does not hide the rest of the city. The panel and world.json still show the warning.
- A bad manifest or an empty tree leaves any previous snapshot untouched.
- Callers cannot tell a warning from a fatal error by looking only at the exit code of a successful run. The warnings are in the document.
- Dropping an unresolved workspace import is quiet in the graph (no edge) and loud in the warning list. A bare import is the opposite: an edge, no warning.
- Adding a new fatal case has to happen before publish, or a half-written snapshot becomes the publish record's problem.
