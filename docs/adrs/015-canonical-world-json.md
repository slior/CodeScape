# 015 - Write world.json with one canonical serializer

## Status

Accepted on 2026-10-10.

Depends on:

- [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md)
- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)
- [007 - Identify nodes and edges with length-prefixed ids](007-length-prefixed-ids.md)
- [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md)

Byte-identical snapshots have no ADR of their own. This function is what makes the bytes match once the pipeline has produced one World.

## Context

Two runs with the same folder, config, sw3d version, and source bytes must produce byte-identical world.json. serializeWorld is the only writer of those bytes. JSON key order follows insertion order, and the pipeline's arrays are not a stable order, so the writer fixes both before it prints.

## Decision

serializeWorld takes one World and returns a string. The input arrays are copied. The caller's arrays, poses, and warning order are not mutated.

The text is UTF-8, with LF line endings, a two-space indent, exactly one trailing LF, and no BOM. It is JSON.stringify of { version, name, nodes, edges, warnings }.

Keys are written in this order. A key whose value is absent is omitted:

- World: version, name, nodes, edges, warnings
- Node: id, kind, name, parentId, path, then unitKind and packageName only when present, then mass, pose
- Pose: x, z, width, depth, height
- Edge: id, kind, parentId, from, to, weight, points
- point: x, z
- Warning: path, message

exactOptionalPropertyTypes, from [002 - Build the repo as an npm and Nx TypeScript workspace](002-npm-nx-typescript-workspace.md), is why an absent optional key is omitted rather than set to undefined.

Copies are sorted before writing. Comparison is UTF-8 byte order via Buffer.compare:

- nodes by path, then id
- edges by parentId, then from, then to, then kind
- warnings by path, then message

Each pose and polyline coordinate is rounded half away from zero to two decimal places. A non-finite coordinate throws Error("coordinate is not finite"). A value that rounds to zero is written as 0. Integers are serialized without a fraction. Other values use the shortest decimal that preserves those two places.

## Consequences

- Tests can compare world.json as bytes. A reorder of the pipeline's output arrays does not change the file, because the serializer sorts.
- A new optional field must be given a place in the key order. Appending it at the end of a node changes every existing file.
- Layout and the portal-gap check must round the same way, or a gap of 0.02 in memory becomes an overlap in the file, or the reverse.
- Analyze must not JSON.stringify the world itself. A second writer would drift.
- The sort is not the graph's semantic order. The viewer must not assume nodes appear in parent-then-child order. It looks up by id.
