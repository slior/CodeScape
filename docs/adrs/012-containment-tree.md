# 012 - Build the containment tree from files and symbols

## Status

Accepted on 2026-10-12.

This record is the tree. Road and portal edges are not specified here.

Depends on:

- [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md)
- [006 - Separate the unplaced city from the placed world](006-city-structure-and-world.md)
- [007 - Identify nodes and edges with length-prefixed ids](007-length-prefixed-ids.md)
- [008 - Take districts from npm workspaces](008-workspace-districts.md)

Nodes are sorted by path, then id, using UTF-8 byte order, so the tree is stable, and byte-identical output has no ADR of its own.

## Context

Compose turns a CodeGraph plus a WorkspacePackage list into a CityStructure. The graph already holds files, merged units, and imports. The packages are the districts. This step decides the containment tree: which nodes exist, who parents whom, and which node is a file's edge anchor.

## Decision

When no graph file belongs to a package, compose throws EmptySourceError with the message "No included source files remain after ignore and workspace ownership". Analyze turns that into a fatal snapshot error.

The tree:

- One city node, cityId(graph.name), empty path, no parent. The name is the analyzed folder's basename.
- One district per owning package that has at least one file. Districts are walked in UTF-8 byte order of package path. The id is districtId(pkg.path). packageName is the workspace package name. When the package path is empty, the district name is the graph name. Otherwise the district name is the path's basename.
- A package with no remaining source is omitted.
- A file with no owning package is not a node.
- buildingPaths is the folder chain under the package, after the file name is removed. A directory named src that is a direct child of a district is not a node. Its children are parented to the district. Their path values still contain src. Any deeper directory that contains source is a building. Buildings may contain buildings. Folder buildings use buildingId and are named with the basename.
- Files of a district are walked in UTF-8 byte order.

Symbol rules, per file, after the unit merge in [005 - Use a language-neutral code graph and parser plugins](005-language-neutral-code-graph.md):

- No class, interface, type alias, or enum: one box named with the filename and its extension, unitKind "file", id fileBoxId. That box is the file's edge anchor.
- Exactly one of those: one box named for the symbol, with that unitKind, id symbolBoxId. That box is the anchor. It is parented on the current folder or district, not wrapped in a file building.
- Two or more: a building named with the filename and its extension, id buildingId. One box per symbol inside it. Symbol boxes are ordered by unit name. That building is the file's edge anchor. It has no roads among its symbol boxes, because import facts name a file and not a symbol.
- Functions stay inside the file's box. They are not nodes.
- An unreadable included file is a file box with no units and no imports. A warning that starts with "unreadable" drops that file's imports. The warning stays on the city.

Every included file has one edge anchor. Roads attach to anchors, never to a symbol box inside a multi-symbol file. Edges hang off the anchors this record defines. How those edges are weighed and drawn is [017 - Pack courtyard children by road weight](017-road-affinity-packing.md) and [018 - Route streets with a deterministic search](018-deterministic-street-routing.md).

## Consequences

- A district's src folder does not appear as a building, so the first level inside a package is the source layout rather than a building named src.
- A file with one exported class is a single box. A file with two types is a building you can enter, and its roads are on that building, not on the inner boxes.
- The viewer can treat a box as a leaf and a building or district as a courtyard. That follows from this tree.
- Path strings still contain src after the node is skipped, so the panel can show the repo path.
- Changing the one-symbol rule (box versus file building) changes ids, parents, and which node a road attaches to.
