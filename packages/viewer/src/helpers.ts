import type { Edge, World } from "@sw3d/model";

interface CellCorner {
  minX: number;
  minZ: number;
}

interface XzPoint {
  x: number;
  z: number;
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
  if (node.kind === "district" || node.kind === "building") return hitId;
  return null;
}

function parseCellKey(key: string): CellCorner | null {
  const comma = key.indexOf(",");
  if (comma <= 0) return null;
  const minX = Number(key.slice(0, comma));
  const minZ = Number(key.slice(comma + 1));
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  return { minX, minZ };
}

export function clampToWalkable(position: XzPoint, walkable: ReadonlySet<string>): XzPoint {
  let best: CellCorner | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const key of walkable) {
    const corner = parseCellKey(key);
    if (!corner) continue;
    const centerX = corner.minX + 1;
    const centerZ = corner.minZ + 1;
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
  return { x: best.minX + 1, z: best.minZ + 1 };
}

function pointInsideCell(position: XzPoint, corner: CellCorner): boolean {
  return (
    position.x >= corner.minX &&
    position.x < corner.minX + 2 &&
    position.z >= corner.minZ &&
    position.z < corner.minZ + 2
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
 * @param forward - The camera's forward direction as an object with x, y, and z components.
 *                  Only the x and z components are considered.
 * @param keys - An object representing which movement keys are currently pressed:
 *               - w: move forward
 *               - a: strafe left
 *               - s: move backward
 *               - d: strafe right
 * @returns An object { x, z } representing the normalized movement direction vector in the XZ plane,
 *          or null if no movement keys are pressed.
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
export function walkDirection(
  forward: { x: number; y: number; z: number },
  keys: { w: boolean; a: boolean; s: boolean; d: boolean },
): XzPoint | null {
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
  if (keys.w) {
    mx += fx;
    mz += fz;
  }
  if (keys.s) {
    mx -= fx;
    mz -= fz;
  }
  if (keys.d) {
    mx += rightX;
    mz += rightZ;
  }
  if (keys.a) {
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
  if (world.version !== 1) {
    throw new Error(
      `This world.json is from another version (${world.version}). This viewer reads version 1.`,
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
