# 002 - Build the repo as an npm and Nx TypeScript workspace

## Status

Accepted on 2026-10-09.

Depends on [001 - Split the pipeline into six packages](001-six-package-pipeline.md).

The strict TypeScript settings and the NodeNext versus bundler split are recorded here because later records depend on them. There is no separate ADR for them.

## Context

This follows [001 - Split the pipeline into six packages](001-six-package-pipeline.md), which split the work into six packages. The workspace has to build those packages in order and keep one compiler policy.

## Decision

The package manager is npm. Node.js 18 or newer is required in the `engines` field.

The root package is named `sw3d`. It is private, version `0.0.0`. The workspaces glob is `packages/*`.

Nx is 21.6.8. The projects are `model`, `parser-typescript`, `compose`, `layout`, `analyze`, and `viewer`. Each `project.json` has targets `typecheck`, `lint`, `test`, and `build`.

`build` uses `dependsOn` `^build`, so a package builds after the packages it depends on. The `analyze` `build` and `test` targets also depend on `viewer:build`.

TypeScript is 5.9.3. ESLint is 9.32.0 with `typescript-eslint`, using the flat config `eslint.config.mjs`. Lint runs `eslint .` inside the package.

Shared settings live in `tsconfig.base.json`: `target` `ES2022`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames`, `declaration`, and `sourceMap`.

Libraries and `analyze` set `module` and `moduleResolution` to `NodeNext`, and `"type": "module"` in `package.json`. A relative import of a local TypeScript file uses the `.js` suffix.

The viewer uses `moduleResolution` `bundler`, because Vite bundles it. Libraries and analyze stay on NodeNext.

`exactOptionalPropertyTypes` means an optional field is omitted, not assigned `undefined`.

Package dependency versions inside the workspace are `*`.

The Nx cache is on for `typecheck`, `lint`, `test`, and `build`. `defaultBase` is `main`.

## Consequences

- One command, `npx nx build analyze`, builds `model`, the parser, `compose`, `layout`, and the viewer before `analyze`.
- Every library import path ends in `.js` even though the source file is `.ts`. A bundler-style import without the suffix fails under NodeNext.
- The viewer cannot share the library `tsconfig` unchanged.
- Optional JSON keys and optional TypeScript fields stay absent, which the serializer relies on.
- Pinning Nx, TypeScript, ESLint, and Jest at the root means one upgrade touches the whole workspace.
