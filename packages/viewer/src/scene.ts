import type { Node, World } from "@sw3d/model";
import { clampToWalkable } from "./helpers.js";

export interface FootprintMesh {
  id: string;
  kind: "district" | "building" | "box" | "portal";
  name: string;
  path: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface EdgeMesh {
  id: string;
  kind: "road" | "portal";
  from: string;
  to: string;
  weight: number;
  points: { x: number; z: number }[];
}

export interface SceneGraph {
  parentId: string;
  footprints: FootprintMesh[];
  edges: EdgeMesh[];
  labels: { id: string; text: string }[];
}

function findNode(world: World, id: string): Node | undefined {
  return world.nodes.find((node) => node.id === id);
}

export function createSceneGraph(world: World, parentId: string): SceneGraph {
  const children = world.nodes.filter((node) => node.parentId === parentId);
  const footprints: FootprintMesh[] = [];
  const labels: { id: string; text: string }[] = [];
  for (const child of children) {
    if (child.kind === "city") continue;
    footprints.push({
      id: child.id,
      kind: child.kind,
      name: child.name,
      path: child.path,
      x: child.pose.x,
      z: child.pose.z,
      width: child.pose.width,
      depth: child.pose.depth,
      height: child.pose.height,
    });
    labels.push({ id: child.id, text: child.name });
  }
  const edges: EdgeMesh[] = world.edges
    .filter((edge) => edge.parentId === parentId)
    .map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      from: edge.from,
      to: edge.to,
      weight: edge.weight,
      points: edge.points.map((point) => ({ x: point.x, z: point.z })),
    }));
  return { parentId, footprints, edges, labels };
}

function overlapsInterior(
  cellX: number,
  cellZ: number,
  footX: number,
  footZ: number,
  footWidth: number,
  footDepth: number,
): boolean {
  return cellX < footX + footWidth && cellX + 2 > footX && cellZ < footZ + footDepth && cellZ + 2 > footZ;
}

export function walkableCellKeys(world: World, parentId: string): Set<string> {
  const parent = findNode(world, parentId);
  const keys = new Set<string>();
  if (!parent) return keys;
  const solids = world.nodes.filter((node) => node.parentId === parentId && node.kind !== "portal" && node.kind !== "city");
  const xEnd = parent.pose.x + parent.pose.width;
  const zEnd = parent.pose.z + parent.pose.depth;
  for (let x = parent.pose.x; x < xEnd; x += 2) {
    for (let z = parent.pose.z; z < zEnd; z += 2) {
      const blocked = solids.some((node) =>
        overlapsInterior(x, z, node.pose.x, node.pose.z, node.pose.width, node.pose.depth),
      );
      if (!blocked) keys.add(`${x},${z}`);
    }
  }
  return keys;
}

export function southRimStart(world: World, parentId: string): { x: number; y: number; z: number } {
  const parent = findNode(world, parentId);
  const keys = walkableCellKeys(world, parentId);
  const midX = parent ? parent.pose.x + parent.pose.width / 2 : 0;
  let best: { x: number; z: number } | null = null;
  for (const key of keys) {
    const comma = key.indexOf(",");
    const minX = Number(key.slice(0, comma));
    const minZ = Number(key.slice(comma + 1));
    const center = { x: minX + 1, z: minZ + 1 };
    if (!best) {
      best = center;
      continue;
    }
    const better =
      center.z < best.z ||
      (center.z === best.z && Math.abs(center.x - midX) < Math.abs(best.x - midX)) ||
      (center.z === best.z &&
        Math.abs(center.x - midX) === Math.abs(best.x - midX) &&
        center.x < best.x);
    if (better) best = center;
  }
  if (!best) return { x: midX, y: 4, z: parent ? parent.pose.z : 0 };
  return { x: best.x, y: 4, z: best.z };
}

export function outsideChildSpot(
  world: World,
  parentId: string,
  childId: string,
): { x: number; y: number; z: number } {
  const child = findNode(world, childId);
  const keys = walkableCellKeys(world, parentId);
  if (!child || keys.size === 0) return southRimStart(world, parentId);
  const southOfChild = { x: child.pose.x + child.pose.width / 2, z: child.pose.z - 0.5 };
  const spot = clampToWalkable(southOfChild, keys);
  return { x: spot.x, y: 4, z: spot.z };
}
