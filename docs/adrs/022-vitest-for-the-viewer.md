# 022 - Test the viewer with Vitest

## Status

Accepted on 2026-10-14.

vitest is 2.1.8. @vitest/coverage-v8 is 2.1.8.

Depends on:

- [003 - Test the Node packages with Jest](003-jest-for-node-packages.md)
- [021 - Build the viewer with Vite and Three.js](021-vite-and-three.md)

## Context

[003 - Test the Node packages with Jest](003-jest-for-node-packages.md) runs the five Node packages on Jest with a Node ESM preset. The viewer is a Vite bundle with moduleResolution bundler. Jest's preset maps .js suffixes and compiles with ts-jest. That preset does not apply to the viewer.

## Decision

- The viewer test target runs Vitest through a local Nx executor, packages/viewer/executors/test.cjs. The executor resolves vitest/vitest.mjs and runs it with the package vitest.config.ts.
- Command from the repo root: npx nx test viewer --testPathPattern=<file>. testPathPattern and coverage are executor options, not Jest args after --.
- Specs stay *.spec.ts beside source, the same layout as the Node packages.
- helpers.spec.ts and scene.spec.ts do not start a renderer. They call the pure functions.
- main.spec.ts imports main.ts and calls the exported mesh helpers. The page does not boot under Node because main.ts checks typeof document.
- The viewer does not use jest.preset.cjs.
- Analyze tests stay on Jest. analyze:test still depends on viewer:build, not on the Vitest run.

## Consequences

Two runners, two command shapes. npx nx test model -- --testPathPattern=ids passes the pattern through Nx to Jest. npx nx test viewer --testPathPattern=helpers.spec.ts passes it as an executor option. The extra -- is wrong for the viewer and required for Jest.

Shared test helpers would have to run under both Jest and Vitest. The repo does not share a test package.

Scene and helper tests stay fast and do not need a GPU. A regression in mesh construction still needs a browser, or a test that imports main.ts without booting the page.

A Vite upgrade and a Vitest upgrade move together because the viewer test resolver is Vite's.

CI runs both. nx run-many -t test runs Jest five times and Vitest once.
