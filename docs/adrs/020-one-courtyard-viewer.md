# 020 - Draw one courtyard at a time

## Status

Accepted on 2026-10-14.

Depends on:

- [001 - Split the pipeline into six packages](001-six-package-pipeline.md)
- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)
- [012 - Build the containment tree from files and symbols](012-containment-tree.md)
- [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md)

## Context

Phase 1 is a static snapshot. The page fetches `./world.json` from its own directory. That file is one World and does not contain source text. The page draws meshes for the courtyard on screen. Which technology builds those meshes is [021 - Build the viewer with Vite and Three.js](021-vite-and-three.md).

## Decision

The page loads one World. If `version` is not 1, it shows a version message and draws no scene. If there is no city node, it shows a message and returns.

It draws one courtyard at a time: the current parent's children, the edges whose `parentId` is that parent, and that parent's portals. Descendant interiors are not drawn. A nested city child is not a footprint. The city node itself is the ground when it is the current parent, and it gets no block of its own.

Walk:

- The person starts on the south rim of the city, eye height 4, looking north (+z).
- Street cells are the 2-by-2 cells inside the parent pose that do not overlap a district, building, or box. Portals stay walkable. Cell keys are `"x,z"` of the minimum corner, the same keys as [014 - Share one ground coordinate frame](014-ground-coordinate-frame.md).
- `clampToWalkable` moves a point to the nearest walkable cell center. Among equal distances, the smaller minimum-corner x wins, then the smaller z. The returned point is the center (minimum + 1 on each axis).
- WASD walks. Shift is faster. Walk speed is 8 units per second, which is the street gap, so crossing one street takes about a second. Sprint is 24.
- Mouse look while the pointer is locked. Pitch is clamped so the camera cannot look straight up or down.
- V toggles an overhead view of the current courtyard and back to the stored street pose. Walking and mouse look stay off while overhead is on.

Selection and navigation:

- Click selects the child or portal under the cursor. The side panel shows name, kind, repo path, "Depends on", and "Used by", each with weight. No source text is shown or stored.
- There is no ADR for directed roads. The panel's two lists use edge direction. An edge whose `from` is the selected node is "Depends on". An edge whose `to` is the selected node is "Used by". A portal row prefers `packageName`.
- Enter, or a wheel notch upward, enters a courtyard only when the view-center hit is a district or building whose parent is the current courtyard. `enterTarget` returns null for a miss, a box, or a portal. A box is a leaf. Selecting it leaves the camera in the parent, where its roads are drawn.
- The camera eases to the south rim of the child, then the parent id becomes that child and the courtyard is rebuilt.
- Escape, a wheel notch downward, or a breadcrumb click eases back to an ancestor, to a spot just south of the courtyard being left, clamped onto a walkable cell. Leaving the city does nothing. The city has no parent.
- The breadcrumb lists container names from the city down to the current parent.
- A second enter or wheel event during the glide is ignored.

Rebuild throws away the previous courtyard's blocks and edges and builds the new parent's.

## Consequences

- A large repo stays cheap to draw. Only one courtyard's children are in the scene. Entering a district drops the siblings and shows that district's children.
- A box cannot be entered, so the roads that touch a file stay visible in the parent. They would disappear if the camera moved inside the box, because those edges have the parent's id.
- The page cannot show a descendant's interior and the ancestor's streets at the same time.
- Walkable cells and edge points share the 2-unit grid. If layout and the viewer disagree on cell size, the camera snaps off the road.
- Anything not on the World cannot appear. There is no second request for source.
