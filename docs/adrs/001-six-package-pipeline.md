# 001 - Split the pipeline into six packages

## Status

Accepted on 2026-10-09.

This record has no earlier ADR.

## Context

sw3d reads one TypeScript folder and writes a city a person can walk in a browser. Packages in that folder are districts, folders are buildings, and classes or classless files are boxes. Roads point from the importer to the imported. External packages are portals on the courtyard rim.

Phase 1's deliverable is a snapshot folder: the built viewer plus world.json. The snapshot has no parser, no node_modules, and no source text. A later live mode can call the same pipeline and is out of scope for phase 1.

## Decision

The repo is six packages.

- packages/model (@sw3d/model): code-graph types, parser interface, city and world schema, ids, and canonical world.json serialization. No I/O.
- packages/parser-typescript (@sw3d/parser-typescript): the first language plugin. Turns text it is given into a code graph. Does not read the filesystem.
- packages/compose (@sw3d/compose): code graph to the city tree and directed edges. Pure.
- packages/layout (@sw3d/layout): poses, streets, road polylines, portal placement. Pure.
- packages/analyze (@sw3d/analyze): the sw3d command. The only package that reads or writes the filesystem. Walks a folder, runs the pipeline, publishes the snapshot, serves it.
- packages/viewer (@sw3d/viewer): static browser page. Reads world.json only. Never imports a parser.

Dependency rules:

- parser-typescript, compose, layout, and viewer depend on model only.
- analyze depends on the parser, compose, and layout. Its Nx build and test targets also depend on viewer:build, because snapshot copies packages/viewer/dist. Analyze does not import viewer source.
- Parsers never import compose, layout, or the viewer.
- Compose and layout never read the filesystem.
- No other workspace package imports analyze.

## Consequences

- A new language is a new package that implements the parser interface. It does not change compose, layout, or the viewer.
- The viewer can be copied into a snapshot and opened with no parser and no source.
- Compose and layout can be tested without a disk or a browser.
- Analyze is the only place a filesystem or path bug can live, and it is also the only place that knows the pipeline order: walk, parse, compose, layout, serialize, publish.
- Changing the dependency direction means changing package.json files, the Nx graph, and the Jest module mappers.
- The viewer cannot ask the parser a question. Anything the page needs must already be on the world document.
