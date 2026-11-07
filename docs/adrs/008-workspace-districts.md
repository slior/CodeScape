# 008 - Take districts from npm workspaces

## Status

Accepted on 2026-10-10.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [004 - Keep the shared contract in @sw3d/model](004-model-contract.md)

## Context

A district is a package in the city metaphor.

Analyze is the only package that reads the disk. Compose receives a WorkspacePackage list, each { path, name }, with path repo-relative. Compose does not open package.json.

## Decision

loadWorkspaces and selectWorkspacePackages build that list.

A missing root package.json is not fatal. The folder is one district. packageName is the analyzed folder's basename. Compose receives { path: "", name: that basename }.

A root package.json that is invalid JSON is fatal.

A valid root manifest with no workspaces field is one district. packageName is the manifest name when that is a string, otherwise the folder basename. That district's path is "".

workspaces, when present, is either an array of strings or an object whose packages field is an array of strings. Other keys on that object are allowed.

Any other workspaces value is fatal before output: a string, a number, null, an object without packages, a packages value that is not an array, or an array element that is not a string. Absence of the field is the no-workspaces case. It is not the same as an invalid value.

Patterns may use *, ?, and **. A .. segment that would leave the folder is fatal.

Glob matches are sorted by repo-relative path. Each match must be a directory that contains package.json. The package name is the name in that package's package.json.

For a matched directory, missing package.json, invalid JSON, or a missing or non-string name is fatal before any snapshot output.

The same real directory reached by two patterns is one package. Two patterns that reach that directory and disagree on name are fatal ("disagreeing package name").

Two distinct real directories with the same package name are fatal ("duplicate package name").

selectWorkspacePackages sorts by declared path. The same real path and name keeps the first hit.

The walk assigns each source file to a package. Compose only sees owned files.

When packages nest or overlap, a source file belongs to the package whose real root is the longest prefix of the file's real path.

Ties on length break by UTF-8 byte order of the declared repo-relative path, smallest first.

A file owned by no package is not a node.

The stored path of a file inside a package is the declared repo-relative package path plus the relative path from that package's real root to the file's real path. A symlink alias does not replace that stored path.

## Consequences

- Districts follow the package manager's own map, not a folder named packages or a depth rule.
- A repo that is not a workspace still becomes one district, so a single package can be snapshotted.
- Files that sit beside workspaces, outside every package, do not become nodes. Root .ts files next to a workspaces repo are dropped.
- Nested packages are legal. The inner package owns the files under its longer root.
- Bad manifests fail before parse and before any write to the output directory.
- Compose can stay pure. All of this discovery is in analyze.
