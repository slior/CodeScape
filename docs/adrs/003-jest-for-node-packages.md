# 003 - Test the Node packages with Jest

## Status

Accepted on 2026-10-09.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md)

The NodeNext and ESM settings this record relies on are in [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md), not in a separate compiler ADR.

## Context

[001 - Split the pipeline into six packages](001-six-package-pipeline.md) left five Node packages (`model`, `parser-typescript`, `compose`, `layout`, `analyze`) and one browser package (`viewer`). [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md) made those Node packages ESM with NodeNext and `.js` import suffixes.

The Node packages need a runner that can execute TypeScript tests as ESM under those settings.

## Decision

Jest 29.7.0 and ts-jest 29.4.14, with `@types/jest` 29.5.14, are root devDependencies.

A shared preset, `jest.preset.cjs`, exports `packageJest(displayName, rootDir)`. It sets `testEnvironment` to `node`. `extensionsToTreatAsEsm` includes `.ts`. ts-jest runs with `useESM` true, and its `tsconfig` is the package `tsconfig.spec.json`.

`moduleNameMapper` rewrites relative `.js` imports back to extensionless paths, and maps `@sw3d/model` to `packages/model/src/index.ts`.

Tests are `*.spec.ts` beside the source they test, not in a separate test tree.

From the repo root: `npx nx test <project> -- --testPathPattern=<file>`.

Jest runs under `node --experimental-vm-modules`. Each package Jest config calls the preset.

Analyze's own `jest.config.cjs` adds mappers for `@sw3d/compose`, `@sw3d/layout`, and `@sw3d/parser-typescript` to those packages' `src/index.ts`. Analyze tests therefore load those libraries from source. `analyze:test` depends on `viewer:build` only, not on the other packages' `dist`.

Automated tests use checked-in fixtures under `packages/analyze/fixtures`. They do not read an external sample repo.

The viewer does not use this preset. Its runner is [022 - Test the viewer with Vitest](022-vitest-for-the-viewer.md).

## Consequences

A library change is tested from source. A clean tree does not need that library's `dist` for unit tests.

The `.js` suffix required by NodeNext is rewritten for Jest. Forgetting the mapper breaks every relative import in a spec.

Specs live next to implementation, so a module and its tests change in the same directory.

Analyze tests can run without building compose, layout, or the parser, but they cannot run without a built viewer, because the snapshot command copies viewer dist.

The viewer needs a different runner. This preset is Node-only.
