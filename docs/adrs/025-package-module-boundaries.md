# 025 - Split each package into modules by pipeline step

## Status

Accepted on 2026-10-14.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [004 - Keep the shared contract in @sw3d/model](004-model-contract.md)
- [008 - Take districts from npm workspaces](008-workspace-districts.md)
- [009 - Ignore files with gitignore rules](009-gitignore-discovery.md)
- [010 - Parse TypeScript with the compiler API](010-typescript-compiler-parser.md)
- [011 - Classify imports without a filesystem resolver](011-specifier-classification.md)
- [012 - Build the containment tree from files and symbols](012-containment-tree.md)
- [016 - Lay the city out from the leaves upward](016-bottom-up-layout.md)
- [017 - Pack courtyard children by road weight](017-road-affinity-packing.md)
- [018 - Route streets with a deterministic search](018-deterministic-street-routing.md)
- [019 - Keep warnings on the document and stop before a fatal error](019-warnings-and-fatal-errors.md)
- [020 - Draw one courtyard at a time](020-one-courtyard-viewer.md)
- [021 - Build the viewer with Vite and Three.js](021-vite-and-three.md)
- [023 - Publish a snapshot by staging and rollback](023-snapshot-publish.md)
- [024 - Expose snapshot and view as the sw3d commands](024-snapshot-and-view-commands.md)

## Context

[001 - Split the pipeline into six packages](001-six-package-pipeline.md) names the packages and who may import whom. It does not name the source files inside a package. This record names those files. Each file holds one pipeline step, and an earlier record already specifies that step.

## Decision

Each package's public entry is `src/index.ts`. It re-exports the package entry and defines nothing of its own. The viewer's `src/index.ts` exports nothing. Other packages use the viewer's built files.

Tests are `*.spec.ts` beside the source.

`@sw3d/model`:

- `src/index.ts` — re-exports the package entry and defines nothing.
- `src/types.ts` — interfaces only. No behavior. [004 - Keep the shared contract in @sw3d/model](004-model-contract.md).
- `src/ids.ts` — length-prefixed ids. [007 - Identify nodes and edges with length-prefixed ids](007-length-prefixed-ids.md).
- `src/serialize.ts` — `serializeWorld`. [015 - Write world.json with one canonical serializer](015-canonical-world-json.md).

`@sw3d/parser-typescript`:

- `src/index.ts` — re-exports the package entry and defines nothing.
- `src/create-parser.ts` — `createTypeScriptParser`. [010 - Parse TypeScript with the compiler API](010-typescript-compiler-parser.md).
- `src/parse-file.ts` — declarations and import specifiers from one file's text. [010 - Parse TypeScript with the compiler API](010-typescript-compiler-parser.md).
- `src/resolve.ts` — classify a specifier from `ParseInput`. [011 - Classify imports without a filesystem resolver](011-specifier-classification.md).

`@sw3d/compose`:

- `src/index.ts` — re-exports the package entry and defines nothing.
- `src/compose.ts` — the tree, the edges, and mass. [012 - Build the containment tree from files and symbols](012-containment-tree.md) and [013 - Count mass as descendant boxes](013-box-mass.md). One module, not one file per step.

`@sw3d/layout`:

- `src/index.ts` — re-exports the package entry and defines nothing.
- `src/layout.ts` — the bottom-up walk, poses, and the call order. [016 - Lay the city out from the leaves upward](016-bottom-up-layout.md).
- `src/pack.ts` — order and row packing. [017 - Pack courtyard children by road weight](017-road-affinity-packing.md).
- `src/portals.ts` — rim markers. Rim placement has no ADR of its own. It lives in `portals.ts` and is specified in [018 - Route streets with a deterministic search](018-deterministic-street-routing.md).
- `src/roads.ts` — road and portal polylines. [018 - Route streets with a deterministic search](018-deterministic-street-routing.md).

`@sw3d/analyze`:

- `src/index.ts` — re-exports the package entry and defines nothing.
- `src/bin.ts` — process entry. Calls `main` and exits. [024 - Expose snapshot and view as the sw3d commands](024-snapshot-and-view-commands.md).
- `src/cli.ts` — parses `snapshot` and `view`. [024 - Expose snapshot and view as the sw3d commands](024-snapshot-and-view-commands.md).
- `src/snapshot.ts` — walks, builds the world, publishes. [024 - Expose snapshot and view as the sw3d commands](024-snapshot-and-view-commands.md) and [023 - Publish a snapshot by staging and rollback](023-snapshot-publish.md).
- `src/config.ts` — reads `sw3d.config.json`. [009 - Ignore files with gitignore rules](009-gitignore-discovery.md).
- `src/ignore.ts` — merges patterns and tests paths. [009 - Ignore files with gitignore rules](009-gitignore-discovery.md).
- `src/workspaces.ts` — npm workspaces to `WorkspacePackage` values. [008 - Take districts from npm workspaces](008-workspace-districts.md).
- `src/walk.ts` — `.ts` and `.tsx` files. [009 - Ignore files with gitignore rules](009-gitignore-discovery.md).
- `src/publish.ts` — moves `world.json`, `index.html`, and assets into `--out`. [023 - Publish a snapshot by staging and rollback](023-snapshot-publish.md).
- `src/view.ts` — serves the snapshot on localhost. [024 - Expose snapshot and view as the sw3d commands](024-snapshot-and-view-commands.md).
- `src/fatal.ts` — `SnapshotFatal`. [019 - Keep warnings on the document and stop before a fatal error](019-warnings-and-fatal-errors.md).

`@sw3d/viewer`:

- `src/index.ts` — exports nothing. Other packages use the built files.
- `src/types.ts` — constants and small types.
- `src/helpers.ts` — world queries, version check, and walk math. No DOM and no Three.js. [020 - Draw one courtyard at a time](020-one-courtyard-viewer.md).
- `src/scene.ts` — courtyard geometry and walkable cells. No Three.js. [020 - Draw one courtyard at a time](020-one-courtyard-viewer.md).
- `src/main.ts` — startup, drawing, input, and the frame loop. The only file that imports Three.js or touches the DOM. [020 - Draw one courtyard at a time](020-one-courtyard-viewer.md) and [021 - Build the viewer with Vite and Three.js](021-vite-and-three.md).
- `index.html` — page shell.

## Consequences

- A packing change stays in `pack.ts`. A routing change stays in `roads.ts`. The walk in `layout.ts` calls both and does not contain either algorithm.
- Filesystem code stays in analyze. Moving a read into compose or the parser would break the dependency rule in [001 - Split the pipeline into six packages](001-six-package-pipeline.md).
- Three.js stays in `main.ts`. Moving a mesh into `scene.ts` would make the pure tests start a renderer, which [021 - Build the viewer with Vite and Three.js](021-vite-and-three.md) avoids.
- `index.ts` is the only import path other packages use. A new public function is exported there or it is not public. A public export that nothing calls is removed.
- The viewer index exports nothing on purpose. Analyze copies `dist`. An import of `@sw3d/viewer` from analyze would couple the CLI to source the snapshot does not run.
- Compose keeps tree, roads, and mass in one file. Splitting it is optional. The other packages are already split because their steps are called in a fixed order and tested apart.
