# 024 - Expose snapshot and view as the sw3d commands

## Status

Accepted on 2026-10-14.

Depends on:

- [009 - Ignore files with gitignore rules](009-gitignore-discovery.md)
- [019 - Keep warnings on the document and stop before a fatal error](019-warnings-and-fatal-errors.md)
- [023 - Publish a snapshot by staging and rollback](023-snapshot-publish.md)

## Context

sw3d is how a person turns a TypeScript folder into a snapshot and then walks it. The snapshot is static files in `--out`. Serving that directory belongs on the same binary, because analyze is the only package that reads the source folder and writes the snapshot.

## Decision

Usage:

- `sw3d snapshot <folder> --out <dir> [--config <file>] [--ignore <glob>]... [--open]`
- `sw3d view <dir>`

`bin.ts` is the shebang entry. It calls `main(process.argv.slice(2))` and `process.exit` with that code. A thrown error is printed and the process exits 1. `cli.ts` has no shebang and does not call `process.exit`, so tests can import `main`.

`main`:

- `snapshot` parses args, runs snapshot, and when `--open` is set calls view on the output directory.
- `view` serves one directory.
- Any other command prints usage and returns 1.
- A caught error prints its message and returns 1.

`parseSnapshotArgs` requires one folder and `--out`. It accepts `--config`, repeated `--ignore`, and `--open`. An unknown flag throws `SnapshotFatal`.

`--config` and `--ignore` apply only to snapshot. Their merge is [009 - Ignore files with gitignore rules](009-gitignore-discovery.md).

`view`:

- Requires exactly one directory. It rejects with `SnapshotFatal` unless that directory contains `index.html` and `world.json`.
- Listens on `127.0.0.1`. The default port is 0, so the OS picks a port. It prints the URL.
- A request is resolved under the directory and checked with `realpath`. A path outside the directory, a missing file, or a directory is 404.
- Content types: `.html`, `.js`, `.css`, `.json`, `.svg`, and `.map`. Any other extension is `application/octet-stream`.
- The server does not modify the directory.
- The CLI does not pass an abort signal, so the promise stays pending until the process stops.
- `--open` on snapshot publishes, then serves that directory.

`snapshot` asserts the folder and the output path, loads config, merges ignore patterns, loads workspaces, walks source, parses, composes, lays out, writes warnings to stderr, stages the viewer and `world.json`, and publishes. How files land in `--out` is [023 - Publish a snapshot by staging and rollback](023-snapshot-publish.md). Empty source and compose's `EmptySourceError` are fatal, as [019 - Keep warnings on the document and stop before a fatal error](019-warnings-and-fatal-errors.md) says.

## Consequences

- One binary does both the build and the browse. There is no separate server package.
- `view` is read-only and bound to localhost. A `file://` open is not enough, because the page fetches `./world.json` and the script URL is relative.
- Tests can call `main` without exiting the process. Only `bin.ts` exits.
- An unknown flag fails before any walk. A missing `--out` fails before any walk.
- `--open` does not return. It is how a person goes from a folder of source to a browser in one command. The snapshot directory remains after the server stops.
