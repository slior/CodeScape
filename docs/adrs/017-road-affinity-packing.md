# 017 - Pack courtyard children by road weight

## Status

Accepted on 2026-10-14.

Depends on:

- [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md)
- [016 - Lay the city out from the leaves upward](016-bottom-up-layout.md)

Byte-identical output has no ADR of its own. The tie-breaks below exist so two runs place children in the same order.

## Context

There is no ADR for directed roads. Packing needs this much of them. At each container, an import becomes a road from the importer's direct child to the imported's direct child. The opposite direction is a second edge. Weight is the number of import facts. Portal edges are a separate kind and do not carry packing weight. A self-link is ignored.

The packer sees one courtyard's district, building, and box children. Portals are dropped. Each child arrives with id, path, kind, width, and depth. A box is 10 by 10. A courtyard child is as wide and deep as layout already computed, including its street band.

STREET is 8. Two footprints must keep a gap of at least 8 on one axis. Overlap fails that check.

## Decision

Order:

1. Build an undirected weight between two children equal to the sum of the directed road weights between them. A portal edge does not count. An endpoint outside the child set does not count. A self-link does not count.
2. Seed with the child whose undirected weights to all other children sum highest. Tie-break by path, then id.
3. Repeatedly add the unplaced child whose undirected weights to the already placed children sum highest. The sum is the strength, not the single strongest edge. Same tie-break. A child with strength 0 still loses the tie-break to path, then id.

Rows:

- targetRowWidth is the square root of the summed child area (width times depth). Gap area is not part of that sum.
- Place the order left to right. A row's width is the sum of its children's widths plus 8 for each gap between them.
- The first child of a row is placed even when its width exceeds targetRowWidth.
- Each later child starts a new row when rowWidth + 8 + child.width exceeds targetRowWidth.

Swaps:

- A grid neighbor is a pair separated by exactly 8 on one axis whose other axes overlap.
- Scan grid neighbors. A candidate swaps those two children in the placement order and runs the row pack again. It does not exchange their coordinates in place.
- Keep the candidate only when the new pack has every gap at least 8, has no overlaps, and strictly reduces the sum of squared center-to-center distances over the undirected road edges (squaredRoadCost). Otherwise keep the previous pack.
- Repeat until a full pass keeps nothing.

The result is the chosen id order, each child's origin and size, and the content width and depth. Origins are in the courtyard's local frame. [016 - Lay the city out from the leaves upward](016-bottom-up-layout.md) shifts them.

## Consequences

- Heavily imported children sit near the start of the order and, after swaps, near the children they connect to. The first pass is a row pack, not a finished plan. Swaps may change the row breaks.
- Portal edges do not pull a child toward a rim. Rim placement happens after this pack.
- A swap that shortens one road and lengthens another is kept only when the squared sum falls. Equal cost does not swap, so the search ends.
- Changing the order rule or the street gap rewrites every pose in world.json. The viewer walk speed is 8 units per second, one second to cross this gap. See [020 - Draw one courtyard at a time](020-one-courtyard-viewer.md).
- The packer is pure and deterministic. It does not look at names except through path and id tie-breaks.
