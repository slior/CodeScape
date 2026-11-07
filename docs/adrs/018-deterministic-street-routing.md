# 018 - Route streets with a deterministic search

## Status

Accepted on 2026-10-14.

The rim has no ADR of its own. It is recorded here because the portal path ends at the marker this placement chooses.

Depends on:

- [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md)
- [015 - Write world.json with one canonical serializer](015-canonical-world-json.md)
- [016 - Lay the city out from the leaves upward](016-bottom-up-layout.md)
- [017 - Pack courtyard children by road weight](017-road-affinity-packing.md)

Byte-identical output has no ADR of its own. The expansion order and the tie-breaks are what make two searches return the same polyline.

## Context

There is no ADR for directed roads. A road edge runs from the importing child to the imported child. A portal edge runs from the importing child to the portal node for one external package name. One portal node exists per external name per courtyard. Weight is the number of imports. The search does not read weight. The viewer draws thickness from weight later.

## Decision

Rim, in `placePortals`, before any portal path is searched.

Portal nodes are not packed among the children. They sit on the rim centerline.

The packed block is `W` by `D`. Portal count is `n`. Padding `p` starts at 0. The rim centerline is the rectangle of size `(W + p + 10)` by `(D + p + 10)`. The perimeter is `2 * (W + D + 2p + 20)`. Increase `p` by 4 until `n` is 0 or the perimeter is at least `12 * n`. Extra padding is split equally on all four sides, `p / 2` each, a multiple of 2. Non-portal footprint minimums stay on the 2-unit grid.

With no portals, `placePortals` returns padding 0, separation 12, and content offset 10. When `p` grows, the content offset is `10 + p / 2`.

The desired point of a portal is the ray from the courtyard center toward the centroid of the children that link to it. A centroid within 1 unit of the center, or no such child, uses arc 0. Arc 0 is the midpoint of the north side (+z). Arc increases clockwise as seen from +y. A ray that hits a corner uses that corner. The side used later, when a corner is shared, is the first of north, east, south, west.

Sort portals by arc length, then name, then id. Name and id compare in UTF-8 byte order.

Separation `g` starts at 12. The first portal's unwrapped position is its desired arc. Each later position is `max(desired, previous + g)`. Positions stay unwrapped during this step.

The pack fits when `last + g <= first + perimeter`. Otherwise add 4 to `p` and pack again.

Each marker is an axis-aligned 8 by 8 square. Centers are rounded the way world.json rounds them ([015 - Write world.json with one canonical serializer](015-canonical-world-json.md)). The squares must be separated by at least 0.02 on x or on z. Touching after rounding is a failure. On failure, add 2 to `g` and pack again, raising `p` by 4 until the perimeter is at least `g * n`.

The loop throws `Error("portal packing did not terminate")` after 10000 rounds.

The stored point is the unwrapped position modulo the perimeter, on the centerline. `layout` then builds an 8 by 8 by 8 node of mass 0 centered there.

Search, in `routeRoad` and `routePortal`.

A cell is 2 by 2. It is walkable when it lies inside the courtyard and its square misses every footprint. Footprints are the packed children, not the portal boxes. Points stored on the edge are cell centers.

A road:

- A boundary cell shares a side with the footprint and does not enter its interior. Candidates are ordered by minimum-corner z, then x.
- Start and goal are one pair of boundary cells, one on the source and one on the target. The pair has the smallest squared distance between centers. Ties break by smaller source z, source x, goal z, then goal x.
- A* runs from that single start to that single goal. The first point is the start center. The last point is the goal center. No point lies inside a footprint.

A portal path:

- The exit side is the rim side nearest the importing child's centroid. The tie-break is north, east, south, west.
- The goal is the portal-band cell whose center is nearest the placed marker. The tie-break is smaller z, then smaller x. The band is the 10 units inside each courtyard edge.
- The start is one boundary cell of the importing child, chosen against that goal by the same squared distance and the same tie-breaks.
- Interior streets may be used only until the first cell on the exit side. Every later point lies in the band. The last point is that goal, beside the marker, even when packing pushed the marker around a corner.

A* itself:

- Steps of 2. Neighbor expansion order is north, east, south, west.
- Each step costs 1. `f` is `g` plus the Manhattan distance to the goal, in steps.
- The open set orders by lower `f`, then lower `g`, then smaller insertion index. Insertion index starts at 0 and increases by 1 each time a cell is added. A decrease-key keeps the original insertion index.
- Equal cost keeps the earlier candidate.
- An unreachable goal throws `Error("no street path")`.

## Consequences

- Two equal-length routes do not pick at random. The insertion index and the compass order decide.
- A portal path can leave the band only at the start. After it touches the exit side it cannot cut back across the courtyard, even if that would be shorter.
- Marker spacing is defined after rounding, because [015 - Write world.json with one canonical serializer](015-canonical-world-json.md) rounds the same way. A gap that exists only before rounding is rejected.
- More portals grow the courtyard by 4-unit padding steps rather than overlapping markers.
- An unreachable goal fails the snapshot. Layout does not draw a straight line through a building.
- Weight does not change the polyline. It changes how wide the viewer draws the same cells.
