# sw3d

sw3d reads a TypeScript source folder and writes a city you can walk in a browser. Packages are districts, folders are buildings, and classes or classless files are boxes. Roads point from the importer to the imported. External packages sit on the courtyard rim as portals.

Requires Node.js 18 or newer. The repo is an npm workspace (`packages/*`) orchestrated by Nx.

## Source layout

| Directory | Package | Role |
| --- | --- | --- |
| `packages/model` | `@sw3d/model` | Shared contract: code graph, city before layout, laid-out world, length-prefixed ids, and canonical `world.json`. No I/O. |
| `packages/parser-typescript` | `@sw3d/parser-typescript` | Turns `.ts` / `.tsx` text into a code graph. Does not read the filesystem. |
| `packages/compose` | `@sw3d/compose` | Turns a code graph and workspace packages into a `CityStructure` (containment tree, roads, portals). Pure. |
| `packages/layout` | `@sw3d/layout` | Places that city: courtyard packing, portal markers, road polylines, and world poses. Pure. |
| `packages/analyze` | `@sw3d/analyze` | The `sw3d` command. Walks a folder, runs the pipeline, publishes a snapshot, and serves it. |
| `packages/viewer` | `@sw3d/viewer` | Vite + Three.js page. Fetches `./world.json` and draws one courtyard at a time. |

`analyze` is the only package that touches the filesystem. `snapshot` calls the parser, then `compose`, then `layout`, writes `world.json`, and copies `packages/viewer/dist` into `--out`.

Dependency direction:

- `parser-typescript`, `compose`, `layout`, and `viewer` depend on `model` only.
- `analyze` depends on the parser, compose, and layout. Its Nx `build` and `test` targets also depend on `viewer:build`.
- The viewer never imports a parser. Parsers never import compose, layout, or the viewer.

Each package keeps source in `src/`, tests as `*.spec.ts` beside that source, and Nx targets in `project.json`. Libraries and `analyze` publish `dist/` from `tsc`. The viewer publishes `dist/` from `vite build`.

Shared root config: `tsconfig.base.json`, `jest.preset.cjs`, `eslint.config.mjs`, `nx.json`.

### `packages/model`

- `src/types.ts` — graph, parser, city, world, and snapshot CLI types.
- `src/ids.ts` — length-prefixed id strings.
- `src/serialize.ts` — canonical JSON for one `World`.
- `src/index.ts` — re-exports those three.

### `packages/parser-typescript`

- `src/create-parser.ts` — `createTypeScriptParser`.
- `src/parse-file.ts` — declarations and import specifiers from one file's text.
- `src/resolve.ts` — classifies a module specifier from parse input.
- `src/index.ts` — re-exports `createTypeScriptParser`.

### `packages/compose`

- `src/compose.ts` — `compose` and `EmptySourceError`.
- `src/index.ts` — re-exports that module.

### `packages/layout`

- `src/layout.ts` — walks the city and writes poses, mass, and routes.
- `src/pack.ts` — orders courtyard children and packs them into rows.
- `src/portals.ts` — places portal markers on the courtyard rim.
- `src/roads.ts` — routes a road or portal path through walkable cells.
- `src/index.ts` — re-exports `layout`.

### `packages/analyze`

- `src/bin.ts` — process entry. Calls `main` and exits.
- `src/cli.ts` — parses `snapshot` and `view` and runs them.
- `src/snapshot.ts` — walks a folder, builds a world, publishes the snapshot.
- `src/config.ts` — reads `sw3d.config.json`.
- `src/ignore.ts` — merges ignore patterns and tests paths against them.
- `src/workspaces.ts` — turns npm workspaces into `WorkspacePackage` values.
- `src/walk.ts` — walks the tree for `.ts` and `.tsx` files.
- `src/publish.ts` — moves `world.json`, `index.html`, and `assets` into `--out`.
- `src/view.ts` — serves a snapshot directory on localhost.
- `src/fatal.ts` — `SnapshotFatal`.
- `fixtures/` — sample projects used by the analyze tests.

The npm bin is `sw3d` → `dist/bin.js`. Usage is in `README.md`.

### `packages/viewer`

- `index.html` — page shell.
- `src/main.ts` — startup, Three.js drawing, input, and the frame loop.
- `src/scene.ts` — courtyard geometry and walkable cells. No Three.js.
- `src/helpers.ts` — world queries, version check, and walk math. No DOM and no Three.js.
- `src/types.ts` — shared constants and small types.
- `src/index.ts` — exports nothing. Other packages use the built files.
- `executors/test.cjs` — Nx test executor that runs Vitest.

## Building and testing

Run these from the repository root. Nx project names are `model`, `parser-typescript`, `compose`, `layout`, `analyze`, and `viewer`.

```bash
npx nx build <project>
npx nx test <project>
npx nx typecheck <project>
npx nx lint <project>
```

`build` depends on `^build`, so Nx builds dependencies first. `npx nx build analyze` also builds the viewer, because `snapshot` copies `packages/viewer/dist`.

Library packages and `analyze` compile with `tsc -p tsconfig.json`. The viewer builds with `vite build`. `typecheck` is `tsc --noEmit -p tsconfig.spec.json`. `lint` is `eslint .` in that package.

`model`, `parser-typescript`, `compose`, `layout`, and `analyze` test with Jest. Extra Jest arguments follow `--`:

```bash
npx nx test model -- --testPathPattern=ids
npx nx test analyze -- --testPathPattern=snapshot
```

The viewer tests with Vitest through `@sw3d/viewer:test`. `testPathPattern` and `coverage` are executor options:

```bash
npx nx test viewer --testPathPattern=helpers.spec.ts
npx nx test viewer --coverage
```

Root scripts in `package.json`:

| Script | What it runs |
| --- | --- |
| `npm run test-all` | `nx run-many -t test` for every project. |
| `npm run test-coverage` | Tests `model`, `parser-typescript`, `compose`, `layout`, `analyze`, and `viewer` with coverage. |
| `npm run coverage` | The same six projects with coverage, streamed output, and the Nx cache skipped. |

## Documentation

`docs/<package>-design.md` describes the current source of that package: modules, dependencies, types, and the main flow. Read the design doc before changing a package.

| Document | Contents |
| --- | --- |
| `docs/model-design.md` | `@sw3d/model`: graph, city, and world types, id functions, and `serializeWorld`. |
| `docs/compose-design.md` | `@sw3d/compose`: how a code graph becomes a `CityStructure`, including `EmptySourceError`. |
| `docs/layout-design.md` | `@sw3d/layout`: packing, portal placement, road routing, and the `World` that `layout` returns. |
| `docs/analyze-design.md` | `@sw3d/analyze`: CLI, config, ignore rules, workspace loading, the source walk, snapshot publish, and `sw3d view`. |
| `docs/viewer-design.md` | `@sw3d/viewer`: the Vite page, courtyard scene, walk math, and Three.js frame loop. |


`README.md` is the user guide: install, `snapshot`, `view`, and the walk controls.
