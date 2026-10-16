import type { Edge, World } from "@sw3d/model";
import {
  CELL_CENTER_OFFSET,
  CELL_KEY_SEPARATOR,
  CELL_SIZE,
  MOVE_KEY,
  NODE_KIND,
  WORLD_VERSION,
  type MoveKeys,
  type XyzPoint,
  type XzPoint,
} from "./types.js";

interface CellCorner {
  minX: number;
  minZ: number;
}

export function breadcrumb(world: World, parentId: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = world.nodes.find((node) => node.id === parentId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(current.name);
    if (current.parentId === null) break;
    const parentIdNext = current.parentId;
    current = world.nodes.find((node) => node.id === parentIdNext);
  }
  names.reverse();
  return names;
}

export function incidentEdges(world: World, nodeId: string): { dependsOn: Edge[]; usedBy: Edge[] } {
  return {
    dependsOn: world.edges.filter((edge) => edge.from === nodeId),
    usedBy: world.edges.filter((edge) => edge.to === nodeId),
  };
}

export function enterTarget(world: World, parentId: string, hitId: string | null): string | null {
  if (hitId === null) return null;
  const node = world.nodes.find((item) => item.id === hitId);
  if (!node) return null;
  if (node.parentId !== parentId) return null;
  if (node.kind === NODE_KIND.DISTRICT || node.kind === NODE_KIND.BUILDING) return hitId;
  return null;
}

function parseCellKey(key: string): CellCorner | null {
  const comma = key.indexOf(CELL_KEY_SEPARATOR);
  if (comma <= 0) return null;
  const minX = Number(key.slice(0, comma));
  const minZ = Number(key.slice(comma + CELL_KEY_SEPARATOR.length));
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  return { minX, minZ };
}

export function clampToWalkable(position: XzPoint, walkable: ReadonlySet<string>): XzPoint {
  let best: CellCorner | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of walkable) {
    const corner = parseCellKey(key);
    if (!corner) continue;
    const centerX = corner.minX + CELL_CENTER_OFFSET;
    const centerZ = corner.minZ + CELL_CENTER_OFFSET;
    const distance = Math.hypot(position.x - centerX, position.z - centerZ);
    if (!best) {
      best = corner;
      bestDistance = distance;
      continue;
    }
    const closer =
      distance < bestDistance ||
      (distance === bestDistance &&
        (corner.minX < best.minX || (corner.minX === best.minX && corner.minZ < best.minZ)));
    if (closer) {
      best = corner;
      bestDistance = distance;
    }
  }
  if (!best) throw new Error("no walkable cells");
  return { x: best.minX + CELL_CENTER_OFFSET, z: best.minZ + CELL_CENTER_OFFSET };
}

function pointInsideCell(position: XzPoint, corner: CellCorner): boolean {
  return (
    position.x >= corner.minX &&
    position.x < corner.minX + CELL_SIZE &&
    position.z >= corner.minZ &&
    position.z < corner.minZ + CELL_SIZE
  );
}

/**
 * Calculates the normalized movement direction vector in the XZ plane
 * based on the given camera forward direction and keyboard input.
 *
 * The function projects the forward vector onto the XZ plane and uses the WASD keys to
 * compute a composite movement vector. The result is normalized, so the player always moves
 * at a consistent speed regardless of simultaneous key presses or facing.
 *
 * @param forward - The camera's forward direction. Only the x and z components are considered.
 * @param keys - Which movement keys are held. Property names match {@link MOVE_KEY}.
 * @returns The normalized movement direction on the ground plane, or null when no movement key is held.
 *
 * @example
 * // Facing down -Z, pressing "d" (right)
 * walkDirection({ x: 0, y: 0, z: -1 }, { w: false, a: false, s: false, d: true });
 * // => { x: 1, z: 0 }
 *
 * // Facing +X, pressing "a" (left)
 * walkDirection({ x: 1, y: 0, z: 0 }, { w: false, a: true, s: false, d: false });
 * // => { x: 0, z: -1 }
 */
export function walkDirection(forward: XyzPoint, keys: MoveKeys): XzPoint | null {
  let fx = forward.x;
  let fz = forward.z;
  // Handle degenerate case: zero forward vector
  if (fx * fx + fz * fz < 1e-8) {
    fx = 0;
    fz = 1;
  } else {
    const length = Math.hypot(fx, fz);
    fx /= length;
    fz /= length;
  }
  const rightX = -fz;
  const rightZ = fx;
  let mx = 0;
  let mz = 0;
  if (keys[MOVE_KEY.FORWARD]) {
    mx += fx;
    mz += fz;
  }
  if (keys[MOVE_KEY.BACK]) {
    mx -= fx;
    mz -= fz;
  }
  if (keys[MOVE_KEY.RIGHT]) {
    mx += rightX;
    mz += rightZ;
  }
  if (keys[MOVE_KEY.LEFT]) {
    mx -= rightX;
    mz -= rightZ;
  }
  const length = Math.hypot(mx, mz);
  if (length === 0) return null;
  return { x: mx / length, z: mz / length };
}

export function resolveWalk(position: XzPoint, walkable: ReadonlySet<string>): XzPoint {
  for (const key of walkable) {
    const corner = parseCellKey(key);
    if (corner && pointInsideCell(position, corner)) {
      return { x: position.x, z: position.z };
    }
  }
  return clampToWalkable(position, walkable);
}

export function assertWorldVersion(world: { version: number }): void {
  if (world.version !== WORLD_VERSION) {
    throw new Error(
      `This world.json is from another version (${world.version}). This viewer reads version ${WORLD_VERSION}.`,
    );
  }
}

export function startLoadedWorld(
  payload: unknown,
  startScene: (world: World) => void,
  showMessage: (text: string) => void,
): void {
  const version =
    payload && typeof payload === "object" && "version" in payload ? Number(payload.version) : Number.NaN;
  try {
    assertWorldVersion({ version });
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "This world.json is from another version.");
    return;
  }
  startScene(payload as World);
}
