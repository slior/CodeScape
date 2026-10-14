import type { CityStructure, World } from "@sw3d/model";
import { packChildren, type FootprintChild, type PackEdge } from "./pack.js";
import { nearestSide, placePortals, rimOf, roundCoord } from "./portals.js";
import { routePortal, routeRoad, type Footprint } from "./roads.js";

type CityNode = CityStructure["nodes"][number];
type CityEdge = CityStructure["edges"][number];
type WorldNode = World["nodes"][number];
type WorldEdge = World["edges"][number];
type CourtyardChild = CityNode & { kind: "district" | "building" | "box" };

function isCourtyardChild(node: CityNode): node is CourtyardChild {
  return node.kind === "district" || node.kind === "building" || node.kind === "box";
}

interface LocalLayout {
  readonly width: number;
  readonly depth: number;
  readonly nodes: WorldNode[];
  readonly edges: WorldEdge[];
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function toNode(node: CityNode, pose: WorldNode["pose"], mass: number): WorldNode {
  const result: WorldNode = {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    path: node.path,
    mass,
    pose: {
      x: roundCoord(pose.x),
      z: roundCoord(pose.z),
      width: roundCoord(pose.width),
      depth: roundCoord(pose.depth),
      height: roundCoord(pose.height),
    },
  };
  if (node.unitKind !== undefined) result.unitKind = node.unitKind;
  if (node.packageName !== undefined) result.packageName = node.packageName;
  return result;
}

function shift(layout: LocalLayout, dx: number, dz: number): LocalLayout {
  if (dx === 0 && dz === 0) return layout;
  return {
    width: layout.width,
    depth: layout.depth,
    nodes: layout.nodes.map((node) => ({
      ...node,
      pose: {
        ...node.pose,
        x: roundCoord(node.pose.x + dx),
        z: roundCoord(node.pose.z + dz),
      },
    })),
    edges: layout.edges.map((edge) => ({
      ...edge,
      points: edge.points.map((point) => ({
        x: roundCoord(point.x + dx),
        z: roundCoord(point.z + dz),
      })),
    })),
  };
}

export function layout(city: CityStructure): World {
  const byParent = new Map<string, CityNode[]>();
  for (const node of city.nodes) {
    if (node.parentId === null) continue;
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  const edgesByParent = new Map<string, CityEdge[]>();
  for (const edge of city.edges) {
    const list = edgesByParent.get(edge.parentId) ?? [];
    list.push(edge);
    edgesByParent.set(edge.parentId, list);
  }

  const layoutNode = (node: CityNode): LocalLayout => {
    if (node.kind === "box") {
      return {
        width: 10,
        depth: 10,
        nodes: [toNode(node, { x: 0, z: 0, width: 10, depth: 10, height: 8 }, 1)],
        edges: [],
      };
    }
    if (node.kind === "portal") {
      throw new Error(`portal ${node.id} is placed by its parent`);
    }
    const children = byParent.get(node.id) ?? [];
    const parentEdges = edgesByParent.get(node.id) ?? [];
    for (const child of children) {
      if (child.kind === "city") throw new Error(`city ${child.id} cannot be a child of ${node.id}`);
    }
    const nonPortals = children.filter(isCourtyardChild);
    const portalNodes = children.filter((child) => child.kind === "portal");
    const subtrees = new Map<string, LocalLayout>();
    for (const child of nonPortals) subtrees.set(child.id, layoutNode(child));

    const footprints: FootprintChild[] = nonPortals.map((child) => {
      const subtree = must(subtrees.get(child.id), `missing layout for ${child.id}`);
      return {
        id: child.id,
        path: child.path,
        kind: child.kind,
        width: subtree.width,
        depth: subtree.depth,
      };
    });
    const packEdges: PackEdge[] = parentEdges.map((edge) => ({
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
    }));
    const packed = packChildren(footprints, packEdges);
    const placementById = new Map(packed.placements.map((placement) => [placement.id, placement]));
    const centers = packed.placements.map((placement) => ({
      id: placement.id,
      x: placement.x + placement.width / 2,
      z: placement.z + placement.depth / 2,
    }));
    const portalSpecs = portalNodes.map((portal) => {
      const from = new Set<string>();
      for (const edge of parentEdges) {
        if (edge.kind === "portal" && edge.to === portal.id) from.add(edge.from);
      }
      return { id: portal.id, name: portal.name, from: [...from] };
    });
    const portalLayout = placePortals(packed.contentWidth, packed.contentDepth, centers, portalSpecs);
    const offset = portalLayout.contentOffset;
    const width = packed.contentWidth + 20 + portalLayout.padding;
    const depth = packed.contentDepth + 20 + portalLayout.padding;
    let mass = 0;
    const nodes: WorldNode[] = [];
    const edges: WorldEdge[] = [];
    for (const child of nonPortals) {
      const subtree = must(subtrees.get(child.id), `missing layout for ${child.id}`);
      const placement = must(placementById.get(child.id), `missing placement for ${child.id}`);
      const root = subtree.nodes.find((item) => item.id === child.id);
      mass += root === undefined ? 0 : root.mass;
      const moved = shift(subtree, offset + placement.x, offset + placement.z);
      nodes.push(...moved.nodes);
      edges.push(...moved.edges);
    }
    const height = roundCoord(Math.max(8, 8 * Math.sqrt(mass)));
    const localFootprints: Footprint[] = packed.placements.map((placement) => ({
      x: offset + placement.x,
      z: offset + placement.z,
      width: placement.width,
      depth: placement.depth,
    }));
    const footprintById = new Map(
      packed.placements.map((placement) => [
        placement.id,
        {
          x: offset + placement.x,
          z: offset + placement.z,
          width: placement.width,
          depth: placement.depth,
        },
      ]),
    );
    const portalById = new Map(portalLayout.portals.map((portal) => [portal.id, portal]));
    const rim = rimOf(packed.contentWidth, packed.contentDepth, portalLayout.padding);
    for (const portal of portalNodes) {
      const placed = must(portalById.get(portal.id), `missing portal ${portal.id}`);
      const centerX = roundCoord(offset + placed.centerX);
      const centerZ = roundCoord(offset + placed.centerZ);
      nodes.push(
        toNode(
          portal,
          { x: centerX - 4, z: centerZ - 4, width: 8, depth: 8, height: 8 },
          0,
        ),
      );
    }
    for (const edge of parentEdges) {
      if (edge.kind === "road") {
        const source = must(footprintById.get(edge.from), `missing road source ${edge.from}`);
        const target = must(footprintById.get(edge.to), `missing road target ${edge.to}`);
        const points = routeRoad(source, target, localFootprints, { width, depth });
        edges.push({
          id: edge.id,
          kind: edge.kind,
          parentId: edge.parentId,
          from: edge.from,
          to: edge.to,
          weight: edge.weight,
          points: points.map((point) => ({ x: roundCoord(point.x), z: roundCoord(point.z) })),
        });
        continue;
      }
      const sourcePlacement = must(placementById.get(edge.from), `missing portal source ${edge.from}`);
      const source = must(footprintById.get(edge.from), `missing portal footprint ${edge.from}`);
      const placed = must(portalById.get(edge.to), `missing portal target ${edge.to}`);
      const exit = nearestSide(
        rim,
        sourcePlacement.x + sourcePlacement.width / 2,
        sourcePlacement.z + sourcePlacement.depth / 2,
      );
      const marker = {
        x: roundCoord(offset + placed.centerX),
        z: roundCoord(offset + placed.centerZ),
      };
      const points = routePortal(source, marker, exit, localFootprints, { width, depth });
      edges.push({
        id: edge.id,
        kind: edge.kind,
        parentId: edge.parentId,
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        points: points.map((point) => ({ x: roundCoord(point.x), z: roundCoord(point.z) })),
      });
    }
    nodes.push(toNode(node, { x: 0, z: 0, width, depth, height }, mass));
    return { width, depth, nodes, edges };
  };

  const root = city.nodes.find((node) => node.parentId === null);
  if (root === undefined) throw new Error("CityStructure has no root node");
  const built = layoutNode(root);
  const nodes = [...built.nodes].sort((left, right) => {
    const path = compareUtf8(left.path, right.path);
    if (path !== 0) return path;
    return compareUtf8(left.id, right.id);
  });
  const edges = [...built.edges].sort((left, right) => {
    const parent = compareUtf8(left.parentId, right.parentId);
    if (parent !== 0) return parent;
    const from = compareUtf8(left.from, right.from);
    if (from !== 0) return from;
    const to = compareUtf8(left.to, right.to);
    if (to !== 0) return to;
    return compareUtf8(left.kind, right.kind);
  });
  const warnings = [...city.warnings].sort((left, right) => {
    const path = compareUtf8(left.path, right.path);
    if (path !== 0) return path;
    return compareUtf8(left.message, right.message);
  });
  return { version: 1, name: city.name, nodes, edges, warnings };
}
