# 016 - Lay the city out from the leaves upward

## Status

Accepted on 2026-10-14.

Depends on:

- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)
- [012 - Build the containment tree from files and symbols](012-containment-tree.md)
- [013 - Count mass as descendant boxes](013-box-mass.md)
- [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md)

## Context

`layout` receives a CityStructure and returns a World. Courtyards nest: a city holds districts and buildings, a building holds boxes. A parent's footprint is the packed size of its children, and the streets inside a child belong to that child. The viewer draws the poses stored on the World.

## Decision

`layout(city)` finds the node whose `parentId` is null and lays that subtree out. It then sorts nodes, edges, and warnings and returns `{ version: 1, name, nodes, edges, warnings }`. `name` is the city name.

- No root throws `Error("CityStructure has no root node")`.
- A city node nested under another node throws.
- `layoutNode` on a portal throws. The parent places that marker. A portal is not a courtyard.

For a box, `layoutNode` returns one node and no edges. The footprint is 10 by 10 on the ground and 8 tall, with mass 1. Packing consumes that same 10 by 10 size.

For a city, district, or building:

1. Split children into courtyard children (district, building, box) and portals.
2. Call `layoutNode` on each courtyard child, so each inner courtyard already has a finished layout in its own local frame.
3. Pack those children. [017 - Pack courtyard children by road weight](017-road-affinity-packing.md) returns an origin and a size for each child, plus the content width and depth.
4. Place portal markers on the rim after the content size is known. How the rim point is chosen is [018 - Route streets with a deterministic search](018-deterministic-street-routing.md). Padding from that placement is added around the content.
5. Shift each child subtree by the content offset plus its packed origin. A zero move returns the same layout.
6. Add each portal as an 8 by 8 by 8 node of mass 0, centered on its marker.
7. Route each edge. [018 - Route streets with a deterministic search](018-deterministic-street-routing.md) returns a polyline, and the courtyard stores it on the edge.
8. Append the courtyard node. Its own x and z are 0 and 0 in the local frame, before the parent's shift. Its width and depth are the packed content, plus 20, plus the portal padding. The extra 20 is a 10-unit band on each side, and the content offset is 10 plus half the padding. Its height is the maximum of 8 and 8 times the square root of the mass, rounded. Mass is the sum of the child roots' masses, which [013 - Count mass as descendant boxes](013-box-mass.md) already set.

After the root returns, stored poses are world-space: each shift added the parent's origin. The viewer reads those poses and does not add parent origins again.

Sorting uses UTF-8 byte order: nodes by path then id, edges by parent, from, to, then kind, warnings by path then message.

## Consequences

- A building's internal streets exist before the district decides where that building sits. The district moves the finished subtree. It does not re-route the inner streets.
- Stored coordinates are absolute. A consumer that treats a child's pose as relative to its parent will place it twice.
- A portal has no children and no layout of its own. Code that recurses into every child must skip portals.
- The courtyard footprint includes the street band, so the parent's packer sees the band as part of the child's size.
- Replacing the packer or the router does not change this walk, as long as both still return origins and polylines in the local frame before the shift.
