# 013 - Count mass as descendant boxes

## Status

Accepted on 2026-10-12.

Depends on:

- [012 - Build the containment tree from files and symbols](012-containment-tree.md)

## Context

Mass is a number on every city node. Layout uses it for courtyard height.

There is no ADR for roads and portals. This record needs one part of that work. An external package is a portal node on the container that imports it, and a portal is not a box. One portal exists per external name per container. Roads are edges, not nodes, so they have no mass.

## Decision

A box has mass 1. That includes a file box (`unitKind` `file`) and a symbol box.

A portal has mass 0.

Every other node (city, district, building) has mass equal to the sum of its non-portal children. Children already store rolled-up mass, so this is the number of descendant boxes.

Layout does not recompute a different mass. It copies the mass onto the world node. A courtyard's height is max(8, 8 * sqrt(mass)), then rounded the same way coordinates are rounded. A box is 8 units tall. A portal marker is 8 units tall. The box footprint size is [017 - Pack courtyard children by road weight](017-road-affinity-packing.md).

The city node's mass is the sum of district masses, which is the number of boxes in the snapshot.

## Consequences

- A wide package with many files is taller than a package with one file. Height is a count of boxes, not a count of lines or bytes.
- Portals do not make a courtyard taller and do not add to the parent's mass.
- A folder with no boxes of its own still grows when its nested buildings have boxes.
- Changing the definition (for example counting lines) changes every courtyard height in world.json.
- Mass is fixed before layout. Packing uses footprint area, not mass. Height is the only layout output this number drives.
