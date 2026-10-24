import type { Node, World } from "@sw3d/model";
import { clampToWalkable } from "./helpers.js";
import {
  CELL_CENTER_OFFSET,
  CELL_KEY_SEPARATOR,
  CELL_SIZE,
  EYE_HEIGHT,
  NODE_KIND,
  SIGN_FIT,
  SIGN_GAP,
  SIGN_HEIGHT,
  SIGN_WALL_OFFSET,
  type EdgeKind,
  type FootprintKind,
  type XyzPoint,
  type XzPoint,
} from "./types.js";

/** How far south of a child's south face the leave probe sits, in world units, before it snaps to a street cell. */
const SOUTH_OF_CHILD = 0.5;

/** One child block drawn in the current courtyard. */
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

/** One dependency line drawn on the current courtyard's ground. */
export interface EdgeMesh {
  id: string;
  kind: EdgeKind;
  from: string;
  to: string;
  weight: number;
  /** Ground polyline. Each point is the segment's x and z. */
  points: XzPoint[];
}

/** Which face a wall plaque sits on. */
export const SIGN_FACE = {
  SOUTH: "south",
  NORTH: "north",
  EAST: "east",
  WEST: "west",
} as const;

/** A block face that receives a wall plaque. */
export type SignFace = (typeof SIGN_FACE)[keyof typeof SIGN_FACE];

/**
 * Id, display name, and block box for one name sign.
 * `x` and `z` are the minimum corner. `height` is the roof.
 */
export interface NameSign {
  id: string;
  /** The node's original name. Blank names produce no sign. */
  text: string;
  /** Minimum x of the block. */
  x: number;
  /** Minimum z of the block. South edge. */
  z: number;
  width: number;
  depth: number;
  /** Roof height. */
  height: number;
}

/** World center, yaw, and size of one wall plaque. */
export interface WallSignPose {
  face: SignFace;
  x: number;
  /** Vertical center. Always `EYE_HEIGHT`. */
  y: number;
  z: number;
  /** Yaw, in radians, that turns a +Z-facing plane out toward the street. */
  yaw: number;
  width: number;
  height: number;
}

/** World center and size of the overhead roof sprite. */
export interface RoofSignPose {
  x: number;
  /** Roof height plus `SIGN_GAP`. */
  y: number;
  z: number;
  width: number;
  height: number;
}

function fittedWallSize(faceSpan: number, aspect: number): { width: number; height: number } {
  const naturalHeight = SIGN_HEIGHT;
  const naturalWidth = Math.max(SIGN_HEIGHT, SIGN_HEIGHT * aspect);
  const limit = faceSpan * SIGN_FIT;
  const scale = naturalWidth > limit ? limit / naturalWidth : 1;
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}

/**
 * Places one plaque on each face of the block.
 * South and north are fitted to `width`. East and west are fitted to `depth`.
 * Order is south, north, east, west.
 *
 * @param sign - Block box. The text is not read.
 * @param aspect - Canvas width divided by canvas height. At least 1.
 * @returns Four wall poses.
 */
export function wallSignPoses(sign: NameSign, aspect: number): WallSignPose[] {
  const midX = sign.x + sign.width / 2;
  const midZ = sign.z + sign.depth / 2;
  const southNorth = fittedWallSize(sign.width, aspect);
  const eastWest = fittedWallSize(sign.depth, aspect);
  return [
    {
      face: SIGN_FACE.SOUTH,
      x: midX,
      y: EYE_HEIGHT,
      z: sign.z - SIGN_WALL_OFFSET,
      yaw: Math.PI,
      ...southNorth,
    },
    {
      face: SIGN_FACE.NORTH,
      x: midX,
      y: EYE_HEIGHT,
      z: sign.z + sign.depth + SIGN_WALL_OFFSET,
      yaw: 0,
      ...southNorth,
    },
    {
      face: SIGN_FACE.EAST,
      x: sign.x + sign.width + SIGN_WALL_OFFSET,
      y: EYE_HEIGHT,
      z: midZ,
      yaw: Math.PI / 2,
      ...eastWest,
    },
    {
      face: SIGN_FACE.WEST,
      x: sign.x - SIGN_WALL_OFFSET,
      y: EYE_HEIGHT,
      z: midZ,
      yaw: -Math.PI / 2,
      ...eastWest,
    },
  ];
}

/**
 * Places the overhead sprite at the roof center.
 * The plaque is the largest rectangle of `aspect` that fits inside `SIGN_FIT` of the roof.
 * Width runs along world x. Height runs along world z.
 *
 * @param sign - Block box. The text is not read.
 * @param aspect - Canvas width divided by canvas height. At least 1.
 * @returns Sprite center and world size.
 */
export function roofSignPose(sign: NameSign, aspect: number): RoofSignPose {
  const maxWidth = sign.width * SIGN_FIT;
  const maxDepth = sign.depth * SIGN_FIT;
  const height = Math.min(maxDepth, maxWidth / aspect);
  return {
    x: sign.x + sign.width / 2,
    y: sign.height + SIGN_GAP,
    z: sign.z + sign.depth / 2,
    width: height * aspect,
    height,
  };
}

/** Footprints, edges, and name signs for one courtyard. */
export interface SceneGraph {
  /** Id of the courtyard these meshes belong to. */
  parentId: string;
  footprints: FootprintMesh[];
  edges: EdgeMesh[];
  signs: NameSign[];
}

function findNode(world: World, id: string): Node | undefined {
  return world.nodes.find((node) => node.id === id);
}

function horizontalCenter(x: number, width: number): number {
  return x + width / 2;
}

/** A world node drawn as a courtyard block. A city is the ground, not a block. */
type FootprintNode = Node & { kind: FootprintKind };

function isFootprint(node: Node): node is FootprintNode {
  return node.kind !== NODE_KIND.CITY;
}

function footprintMesh(node: FootprintNode): FootprintMesh {
  return {
    id: node.id,
    kind: node.kind,
    name: node.name,

    path: node.path,
    x: node.pose.x,
    z: node.pose.z,
    width: node.pose.width,
    depth: node.pose.depth,
    height: node.pose.height,
  };
}

function nameSign(node: Node): NameSign | null {
  if (node.name.trim() === "") return null;
  return {
    id: node.id,
    text: node.name,
    x: node.pose.x,
    z: node.pose.z,
    width: node.pose.width,
    depth: node.pose.depth,
    height: node.pose.height,
  };
}

function edgeMesh(edge: World["edges"][number]): EdgeMesh {
  return {
    id: edge.id,
    kind: edge.kind,
    from: edge.from,
    to: edge.to,
    weight: edge.weight,
    points: edge.points.map((point) => ({ x: point.x, z: point.z })),
  };
}

/**
 * Collects the footprints, edges, and name signs for one courtyard.
 * A nested city is skipped. A child whose name is empty after trimming still gets a footprint and no sign.
 *
 * @param world - Laid-out world to read.
 * @param parentId - Courtyard whose direct children are drawn.
 * @returns Meshes for that courtyard, in child and edge order from `world`.
 */
export function createSceneGraph(world: World, parentId: string): SceneGraph {
  const children = world.nodes.filter((node) => node.parentId === parentId);
  const footprints: FootprintMesh[] = [];
  const signs: NameSign[] = [];
  for (const child of children) {
    if (!isFootprint(child)) continue;
    footprints.push(footprintMesh(child));
    const sign = nameSign(child);
    if (sign) signs.push(sign);
  }
  const edges = world.edges.filter((edge) => edge.parentId === parentId).map(edgeMesh);
  return { parentId, footprints, edges, signs };
}

function blocksStreet(node: Node): boolean {
  return node.kind !== NODE_KIND.PORTAL && node.kind !== NODE_KIND.CITY;
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

function cellKey(x: number, z: number): string {
  return `${x}${CELL_KEY_SEPARATOR}${z}`;
}

function cellCenter(key: string): XzPoint {
  const comma = key.indexOf(CELL_KEY_SEPARATOR);
  const minX = Number(key.slice(0, comma));
  const minZ = Number(key.slice(comma + CELL_KEY_SEPARATOR.length));
  return { x: minX + CELL_CENTER_OFFSET, z: minZ + CELL_CENTER_OFFSET };
}

function prefersSouthRim(candidate: XzPoint, current: XzPoint, midX: number): boolean {
  if (candidate.z !== current.z) return candidate.z < current.z;
  const candidateOffset = Math.abs(candidate.x - midX);
  const currentOffset = Math.abs(current.x - midX);
  if (candidateOffset !== currentOffset) return candidateOffset < currentOffset;
  return candidate.x < current.x;
}

/**
 * Lists the street cells a walker can stand on inside one courtyard.
 * A cell is blocked when it overlaps a district, building, or box. Portals stay open.
 *
 * @param world - Laid-out world to read.
 * @param parentId - Courtyard to measure. An unknown id returns an empty set.
 * @returns Keys `"x,z"` for each open cell's minimum corner.
 */
export function walkableCellKeys(world: World, parentId: string): Set<string> {
  const parent = findNode(world, parentId);
  const keys = new Set<string>();
  if (!parent) return keys;
  const solids = world.nodes.filter((node) => node.parentId === parentId && blocksStreet(node));
  const xEnd = parent.pose.x + parent.pose.width;
  const zEnd = parent.pose.z + parent.pose.depth;
  for (let x = parent.pose.x; x < xEnd; x += CELL_SIZE) {
    for (let z = parent.pose.z; z < zEnd; z += CELL_SIZE) {
      const blocked = solids.some((node) =>
        overlapsInterior(x, z, node.pose.x, node.pose.z, node.pose.width, node.pose.depth),
      );
      if (!blocked) keys.add(cellKey(x, z));
    }
  }
  return keys;
}

/**
 * Picks the street spot where the camera stands when entering a courtyard.
 * That is the southernmost walkable cell center, and the one closest to the parent's horizontal center.
 *
 * @param world - Laid-out world to read.
 * @param parentId - Courtyard being entered.
 * @returns An eye-height point. When nothing is walkable, the parent's south edge at its horizontal center.
 */
export function southRimStart(world: World, parentId: string): XyzPoint {
  const parent = findNode(world, parentId);
  const keys = walkableCellKeys(world, parentId);
  const midX = parent ? horizontalCenter(parent.pose.x, parent.pose.width) : 0;
  let best: XzPoint | null = null;
  for (const key of keys) {
    const center = cellCenter(key);
    if (!best || prefersSouthRim(center, best, midX)) best = center;
  }
  if (!best) return { x: midX, y: EYE_HEIGHT, z: parent ? parent.pose.z : 0 };
  return { x: best.x, y: EYE_HEIGHT, z: best.z };
}

/**
 * Picks the street spot where the camera stands after leaving a child courtyard.
 * The probe sits just south of that child and snaps onto a walkable cell of the parent.
 *
 * @param world - Laid-out world to read.
 * @param parentId - Courtyard the camera returns to.
 * @param childId - Courtyard being left.
 * @returns An eye-height point. Falls back to `southRimStart` when the child is missing or the parent has no walkable cells.
 */
export function outsideChildSpot(world: World, parentId: string, childId: string): XyzPoint {
  const child = findNode(world, childId);
  const keys = walkableCellKeys(world, parentId);
  if (!child || keys.size === 0) return southRimStart(world, parentId);
  const southOfChild = {
    x: horizontalCenter(child.pose.x, child.pose.width),
    z: child.pose.z - SOUTH_OF_CHILD,
  };
  const spot = clampToWalkable(southOfChild, keys);
  return { x: spot.x, y: EYE_HEIGHT, z: spot.z };
}
