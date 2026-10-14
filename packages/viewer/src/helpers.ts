import type { Edge, World } from "@sw3d/model";

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

export function clampToWalkable(
  position: { x: number; z: number },
  walkable: ReadonlySet<string>,
): { x: number; z: number } {
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

function pointInsideCell(position: { x: number; z: number }, corner: CellCorner): boolean {
  return (
    position.x >= corner.minX &&
    position.x < corner.minX + 2 &&
    position.z >= corner.minZ &&
    position.z < corner.minZ + 2
  );
}

export function resolveWalk(
  position: { x: number; z: number },
  walkable: ReadonlySet<string>,
): { x: number; z: number } {
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
