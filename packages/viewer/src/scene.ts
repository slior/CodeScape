import type { Node, World } from "@sw3d/model";
import { clampToWalkable } from "./helpers.js";
import {
  CELL_CENTER_OFFSET,
  CELL_KEY_SEPARATOR,
  CELL_SIZE,
  EYE_HEIGHT,
  NODE_KIND,
  type EdgeKind,
  type FootprintKind,
  type XyzPoint,
  type XzPoint,
} from "./types.js";

export interface FootprintMesh {
  id: string;
  kind: FootprintKind;
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
  kind: EdgeKind;
  from: string;
  to: string;
  weight: number;
  points: XzPoint[];
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
    if (child.kind === NODE_KIND.CITY) continue;
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
  return (
    cellX < footX + footWidth &&
    cellX + CELL_SIZE > footX &&
    cellZ < footZ + footDepth &&
    cellZ + CELL_SIZE > footZ
  );
}

export function walkableCellKeys(world: World, parentId: string): Set<string> {
  const parent = findNode(world, parentId);
  const keys = new Set<string>();
  if (!parent) return keys;
  const solids = world.nodes.filter(
    (node) => node.parentId === parentId && node.kind !== NODE_KIND.PORTAL && node.kind !== NODE_KIND.CITY,
  );
  const xEnd = parent.pose.x + parent.pose.width;
  const zEnd = parent.pose.z + parent.pose.depth;
  for (let x = parent.pose.x; x < xEnd; x += CELL_SIZE) {
    for (let z = parent.pose.z; z < zEnd; z += CELL_SIZE) {
      const blocked = solids.some((node) =>
        overlapsInterior(x, z, node.pose.x, node.pose.z, node.pose.width, node.pose.depth),
      );
      if (!blocked) keys.add(`${x}${CELL_KEY_SEPARATOR}${z}`);
    }
  }
  return keys;
}

export function southRimStart(world: World, parentId: string): XyzPoint {
  const parent = findNode(world, parentId);
  const keys = walkableCellKeys(world, parentId);
  const midX = parent ? parent.pose.x + parent.pose.width / 2 : 0;
  let best: XzPoint | null = null;
  for (const key of keys) {
    const comma = key.indexOf(CELL_KEY_SEPARATOR);
    const minX = Number(key.slice(0, comma));
    const minZ = Number(key.slice(comma + CELL_KEY_SEPARATOR.length));
    const center = { x: minX + CELL_CENTER_OFFSET, z: minZ + CELL_CENTER_OFFSET };
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
  if (!best) return { x: midX, y: EYE_HEIGHT, z: parent ? parent.pose.z : 0 };
  return { x: best.x, y: EYE_HEIGHT, z: best.z };
}

export function outsideChildSpot(
  world: World,
  parentId: string,
  childId: string,
): XyzPoint {
  const child = findNode(world, childId);
  const keys = walkableCellKeys(world, parentId);
  if (!child || keys.size === 0) return southRimStart(world, parentId);
  const southOfChild = { x: child.pose.x + child.pose.width / 2, z: child.pose.z - 0.5 };
  const spot = clampToWalkable(southOfChild, keys);
  return { x: spot.x, y: EYE_HEIGHT, z: spot.z };
}
