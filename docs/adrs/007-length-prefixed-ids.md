# 007 - Identify nodes and edges with length-prefixed ids

## Status

Accepted on 2026-10-10.

Depends on:

- [004 - Keep the shared contract in @sw3d/model](004-model-contract.md)
- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)

Two runs must write the same world.json, so ids cannot depend on a random value or on object order. That requirement is part of why this scheme is total and stable. There is no separate ADR for byte-identical snapshots. The bytes themselves are [015 - Write world.json with one canonical serializer](015-canonical-world-json.md).

## Context

Nodes and edges are referenced by id: parentId, edge from and to, portal ids, viewer selection, breadcrumbs. Paths can contain a colon, a hash, and the substring :box:. A split-on-colon id would collide.

## Decision

Each component is its UTF-8 byte length in decimal, a colon, then the raw component text. Call that len(component). Buffer.byteLength measures the length. Components are joined with no extra separator.

packages/model/src/ids.ts keeps a private len and exports cityId, districtId, buildingId, fileBoxId, symbolBoxId, portalId, and edgeId.

- City: city: + len(basename of the analyzed folder)
- District: district: + len(package path). An empty path is district:0:
- Building: building: + len(path)
- Box for a file: box: + len(file path)
- Box for a symbol: box: + len(file path) + len(symbol name)
- Portal: portal: + len(parentId) + len(package name)
- Edge: edge: + len(parentId) + len(fromId) + len(toId)

Compose mints these ids. The parser sets each CodeUnit.id with symbolBoxId. Layout tie-breaks use path, then id. The viewer stores the id on a mesh and walks parentId.

A colon, #, or :box: inside a path cannot make two different tuples share an id, because the reader knows how many bytes belong to each component.

## Consequences

- The same source path and symbol name produce the same id on every run and every machine. UTF-8 byte length, not UTF-16 code units, is the measure.
- Ids are not short. A path is stored again inside the id, and an edge id contains three other ids.
- Renaming a file, a symbol, or a package changes ids. Selection and any future diff of world.json sees a delete and an add.
- Parent, from, and to are ids, so the id scheme is part of the document, not a private key.
- Sorting and tie-breaks that use id are stable only because this function is pure.
