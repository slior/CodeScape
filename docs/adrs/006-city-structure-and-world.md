# 006 - Separate the unplaced city from the placed world

## Status

Accepted on 2026-10-10.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [004 - Keep the shared contract in @sw3d/model](004-model-contract.md)

## Context

Compose and layout are separate pure packages. Compose decides what the city contains. Layout decides where it sits. The viewer loads a finished document and does not know either algorithm.

## Decision

compose(graph, packages) returns a CityStructure of version 1: name, nodes, edges, and warnings. layout(city) returns a World of version 1: name, nodes with poses, edges with polylines, and warnings.

- A city node has the identity fields of a world node and no pose. A city edge has the link fields of a world edge and no points.
- World.version is the number 1. The viewer checks that version and draws nothing when it is not 1.
- Identity fields shared by both: on nodes, id, kind (city, district, building, box, or portal), name, parentId, path, optional unitKind, optional packageName, and mass; on edges, id, kind (road or portal), parentId, from, to, and weight.
- A pose is a footprint: x, z, width, depth, and height. Points are a polyline of { x, z }. Layout fills both. How those numbers are measured is [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md).
- CityStructure is not written to disk. world.json is a World. serializeWorld accepts a World.

## Consequences

- Compose tests can assert the tree and the edges without asserting coordinates.
- A layout change does not change which nodes exist. A compose change does not by itself move a building.
- The viewer binds to World, version 1. A future layout can replace coordinates only by still producing that document.
- Two types repeat the same identity fields. A new identity field is added twice, once without pose or points and once with them.
- Version 1 is a gate. The page shows a version message and does not start the scene when the number differs.
