# 004 - Keep the shared contract in @sw3d/model

## Status

Accepted on 2026-10-10.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)

## Context

Phase 1 is a static snapshot: the viewer bundle plus world.json. The output has no parser and no source. Packages are districts, folders are buildings, and symbols or files are boxes. Those are product facts, not separate ADRs.

This record depends on the package split. The other packages share one description of the graph, the unplaced city, the placed world, and the snapshot command.

## Decision

The shared contract stays in @sw3d/model.

The package has no dependencies and no devDependencies. It does no file I/O. Callers read and write files. The package returns values and strings.

src/index.ts re-exports three modules and defines nothing of its own:

- src/types.ts holds interfaces only. It has no behavior.
- src/ids.ts holds the length-prefixed id functions. The scheme is [007 - Identify nodes and edges with length-prefixed ids](007-length-prefixed-ids.md).
- src/serialize.ts holds serializeWorld, the only writer of canonical world.json text. The byte rules are [015 - Write world.json with one canonical serializer](015-canonical-world-json.md).

Nx build is tsc. The published entry is dist/index.js and dist/index.d.ts.

Graph and parser:

- Warning: path and message. Graphs, parse results, cities, and worlds all carry a list.
- WorkspacePackage: path and name.
- CodeFile: path.
- CodeUnit: id, kind, name, path. Kind is class, interface, type, or enum.
- ImportFact: fromFile, specifier, and a target that is either internal (a file) or external (a package name).
- CodeGraph: name, files, units, imports, warnings.
- ParseInput: repo root, file texts (path and text), includedPaths, workspace packages.
- ParseResult: files, units, imports, warnings.
- SourceParser: string id, defaultIgnore patterns, parse(input).

City and world:

- Pose: x, z, width, depth, height.
- Node: id, kind (city, district, building, box, portal), name, parentId, path, optional unitKind (file, class, interface, type, enum), optional packageName, mass, pose.
- Edge: id, kind (road or portal), parentId, from, to, weight, points (x, z).
- World: version 1, name, nodes, edges, warnings.
- CityNode and CityEdge are the same identity fields without pose and without points.
- CityStructure: version 1, name, unplaced nodes and edges, warnings.

CLI shapes also live here even though only analyze uses them:

- SnapshotOptions: folder, out, optional config, ignore patterns, open.
- SnapshotResult: outDir.
- ViewOptions: dir.

Who imports it:

- parser-typescript implements SourceParser and calls symbolBoxId.
- compose reads a CodeGraph and a WorkspacePackage list and returns a CityStructure. It mints ids with the model functions.
- layout takes a CityStructure and returns a World. The import is type-only.
- analyze fills the CLI types, builds a CodeGraph, and writes serializeWorld(world).
- viewer imports World, Node, and Edge as types and reads the document analyze wrote.

## Consequences

- A field added to Node, Edge, or World is a change for compose, layout, the serializer, and the viewer together.
- The parser cannot grow a private graph shape. Compose will not see a field that is not on CodeGraph.
- model stays free of Node filesystem APIs, so the same types can be imported by the browser bundle.
- CLI option types sit in the contract package even though no library calls the CLI. Changing a flag's shape changes model, not only analyze.
- There is one place to look up a field name.
