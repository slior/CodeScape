# 021 - Build the viewer with Vite and Three.js

## Status

Accepted on 2026-10-14.

three is 0.170.0. vite is 6.0.7. @types/three is 0.170.0.

Depends on:

- [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md)
- [020 - Draw one courtyard at a time](020-one-courtyard-viewer.md)

The viewer uses moduleResolution bundler while the libraries use NodeNext, and the strict flags stay in [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md).

## Context

Phase 1 copies this build into the snapshot. [001 - Split the pipeline into six packages](001-six-package-pipeline.md) publishes that snapshot as a directory of the built viewer plus world.json. The page must work from that directory, which is not the viewer package.

## Decision

- The viewer is a Vite app. vite.config.ts sets base to "./" so asset URLs are relative. The build writes packages/viewer/dist/index.html and packages/viewer/dist/assets/viewer.js.
- index.html is the page shell: a canvas, a detail panel, a breadcrumb nav, and a full-screen version message.
- main.ts is the only module that imports three and the only module that touches the DOM. It creates the WebGL renderer, scene, perspective camera, lights, meshes, and the frame loop. It fetches ./world.json.
- scene.ts builds the courtyard geometry as plain data: footprints, edges, walkable-cell keys. It does not import three.
- helpers.ts answers world queries and walk math. It does not import three and does not touch the DOM.
- types.ts holds constants and small types. No behavior.
- src/index.ts exports nothing. Other packages do not import the viewer source. Analyze copies the dist directory.
- main.ts boots the page only when typeof document !== "undefined", so a Node test can import it without fetching the world.
- The Nx build target for the viewer is vite build, not tsc. typecheck remains tsc --noEmit.

## Consequences

- Courtyard math can be unit-tested without a GPU and without a browser canvas.
- A Three.js upgrade is confined to main.ts and package.json. scene.ts does not break when a mesh API changes, because it has no mesh.
- Relative base means the same dist files work after analyze copies them next to world.json. An absolute base would 404 in the snapshot.
- The viewer tsconfig cannot match the library NodeNext tsconfig. [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md) already split moduleResolution for this reason.
- The snapshot ships the bundle, not the TypeScript source and not three as a separate install. The person opening the snapshot does not run npm install.
- Drawing code and document code live in one module, main.ts. A change to picking, walking, and mesh construction touches that file together.
