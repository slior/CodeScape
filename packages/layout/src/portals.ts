import { paddingFor, rimPerimeter } from "./pack.js";

export type SideName = "north" | "east" | "south" | "west";

export interface Rim {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly centerX: number;
  readonly centerZ: number;
}

export interface PortalChildCenter {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

export interface PortalSpec {
  readonly id: string;
  readonly name: string;
  readonly from: readonly string[];
}

export interface PlacedPortal {
  readonly id: string;
  readonly name: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly side: SideName;
  readonly arc: number;
}

export interface PortalLayout {
  readonly initialPadding: number;
  readonly padding: number;
  readonly separation: number;
  readonly contentOffset: number;
  readonly portals: readonly PlacedPortal[];
}

const SIDE_ORDER: readonly SideName[] = ["north", "east", "south", "west"];
const CLEARANCE = 0.02;

export function roundCoord(value: number): number {
  if (!Number.isFinite(value)) throw new Error("coordinate is not finite");
  const sign = value < 0 ? -1 : 1;
  const rounded = Math.floor(Math.abs(value) * 100 + 0.5 + 1e-9);
  const result = (sign * rounded) / 100;
  return result === 0 ? 0 : result;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function intervalGap(a0: number, a1: number, b0: number, b1: number): number {
  if (a1 <= b0) return b0 - a1;
  if (b1 <= a0) return a0 - b1;
  return 0;
}

export function markersClear(
  centers: readonly { readonly x: number; readonly z: number }[],
): boolean {
  const boxes = centers.map((center) => {
    const x = roundCoord(center.x);
    const z = roundCoord(center.z);
    return { x0: x - 4, x1: x + 4, z0: z - 4, z1: z + 4 };
  });
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const left = boxes[i];
      const right = boxes[j];
      if (left === undefined || right === undefined) continue;
      const gapX = intervalGap(left.x0, left.x1, right.x0, right.x1);
      const gapZ = intervalGap(left.z0, left.z1, right.z0, right.z1);
      if (gapX < CLEARANCE && gapZ < CLEARANCE) return false;
    }
  }
  return true;
}

export function rimOf(contentWidth: number, contentDepth: number, padding: number): Rim {
  const inset = 5 + padding / 2;
  return {
    minX: -inset,
    maxX: contentWidth + inset,
    minZ: -inset,
    maxZ: contentDepth + inset,
    centerX: contentWidth / 2,
    centerZ: contentDepth / 2,
  };
}

export function nearestSide(rim: Rim, x: number, z: number): SideName {
  const options: Array<{ side: SideName; distance: number }> = [
    { side: "north", distance: rim.maxZ - z },
    { side: "east", distance: rim.maxX - x },
    { side: "south", distance: z - rim.minZ },
    { side: "west", distance: x - rim.minX },
  ];
  let best = options[0];
  if (best === undefined) throw new Error("missing side");
  for (const option of options.slice(1)) {
    if (option.distance < best.distance) best = option;
  }
  return best.side;
}

export function intersectRim(
  rim: Rim,
  dirX: number,
  dirZ: number,
): { x: number; z: number; side: SideName } {
  const length = Math.hypot(dirX, dirZ);
  if (length === 0) return { x: rim.centerX, z: rim.maxZ, side: "north" };
  const dx = dirX / length;
  const dz = dirZ / length;
  const hits: Array<{ side: SideName; t: number; x: number; z: number }> = [];
  const add = (side: SideName, t: number, x: number, z: number): void => {
    if (t > 1e-9) hits.push({ side, t, x, z });
  };
  if (dz > 0) {
    const t = (rim.maxZ - rim.centerZ) / dz;
    const x = rim.centerX + t * dx;
    if (x >= rim.minX - 1e-8 && x <= rim.maxX + 1e-8) add("north", t, x, rim.maxZ);
  }
  if (dx > 0) {
    const t = (rim.maxX - rim.centerX) / dx;
    const z = rim.centerZ + t * dz;
    if (z >= rim.minZ - 1e-8 && z <= rim.maxZ + 1e-8) add("east", t, rim.maxX, z);
  }
  if (dz < 0) {
    const t = (rim.minZ - rim.centerZ) / dz;
    const x = rim.centerX + t * dx;
    if (x >= rim.minX - 1e-8 && x <= rim.maxX + 1e-8) add("south", t, x, rim.minZ);
  }
  if (dx < 0) {
    const t = (rim.minX - rim.centerX) / dx;
    const z = rim.centerZ + t * dz;
    if (z >= rim.minZ - 1e-8 && z <= rim.maxZ + 1e-8) add("west", t, rim.minX, z);
  }
  const first = hits[0];
  if (first === undefined) throw new Error("ray missed the rim");
  let bestT = first.t;
  for (const hit of hits) if (hit.t < bestT) bestT = hit.t;
  const tied = hits.filter((hit) => Math.abs(hit.t - bestT) <= 1e-7);
  tied.sort((left, right) => SIDE_ORDER.indexOf(left.side) - SIDE_ORDER.indexOf(right.side));
  const winner = tied[0];
  if (winner === undefined) throw new Error("ray missed the rim");
  if (tied.length >= 2) {
    const sides = new Set(tied.map((hit) => hit.side));
    if (sides.has("north") && sides.has("east")) {
      return { x: rim.maxX, z: rim.maxZ, side: winner.side };
    }
    if (sides.has("east") && sides.has("south")) {
      return { x: rim.maxX, z: rim.minZ, side: winner.side };
    }
    if (sides.has("south") && sides.has("west")) {
      return { x: rim.minX, z: rim.minZ, side: winner.side };
    }
    if (sides.has("north") && sides.has("west")) {
      return { x: rim.minX, z: rim.maxZ, side: winner.side };
    }
  }
  return { x: winner.x, z: winner.z, side: winner.side };
}

function wrap(arc: number, perimeter: number): number {
  const mod = arc % perimeter;
  return mod < 0 ? mod + perimeter : mod;
}

export function pointOnRim(
  rim: Rim,
  arc: number,
): { x: number; z: number; side: SideName; arc: number } {
  const northLen = rim.maxX - rim.minX;
  const eastLen = rim.maxZ - rim.minZ;
  const perimeter = 2 * (northLen + eastLen);
  const mid = northLen / 2;
  const a = wrap(arc, perimeter);
  if (a <= mid) {
    return { x: rim.minX + mid + a, z: rim.maxZ, side: "north", arc: a };
  }
  if (a >= perimeter - mid) {
    return { x: rim.minX + (a - (perimeter - mid)), z: rim.maxZ, side: "north", arc: a };
  }
  let rest = a - mid;
  if (rest <= eastLen) {
    return { x: rim.maxX, z: rim.maxZ - rest, side: "east", arc: a };
  }
  rest -= eastLen;
  if (rest <= northLen) {
    return { x: rim.maxX - rest, z: rim.minZ, side: "south", arc: a };
  }
  rest -= northLen;
  return { x: rim.minX, z: rim.minZ + rest, side: "west", arc: a };
}

function arcLength(rim: Rim, hit: { x: number; z: number; side: SideName }): number {
  const northLen = rim.maxX - rim.minX;
  const eastLen = rim.maxZ - rim.minZ;
  const perimeter = 2 * (northLen + eastLen);
  const midX = (rim.minX + rim.maxX) / 2;
  if (hit.side === "north") {
    if (hit.x >= midX) return hit.x - midX;
    return perimeter - (midX - hit.x);
  }
  if (hit.side === "east") return northLen / 2 + (rim.maxZ - hit.z);
  if (hit.side === "south") return northLen / 2 + eastLen + (rim.maxX - hit.x);
  return northLen / 2 + eastLen + northLen + (hit.z - rim.minZ);
}

function desiredArc(
  rim: Rim,
  portal: PortalSpec,
  childById: ReadonlyMap<string, PortalChildCenter>,
): number {
  let count = 0;
  let sumX = 0;
  let sumZ = 0;
  for (const id of portal.from) {
    const child = childById.get(id);
    if (child === undefined) continue;
    sumX += child.x;
    sumZ += child.z;
    count += 1;
  }
  if (count === 0) return 0;
  const px = sumX / count;
  const pz = sumZ / count;
  const dx = px - rim.centerX;
  const dz = pz - rim.centerZ;
  if (dx * dx + dz * dz <= 1) return 0;
  return arcLength(rim, intersectRim(rim, dx, dz));
}

export function placePortals(
  contentWidth: number,
  contentDepth: number,
  children: readonly PortalChildCenter[],
  portals: readonly PortalSpec[],
): PortalLayout {
  if (portals.length === 0) {
    return { initialPadding: 0, padding: 0, separation: 12, contentOffset: 10, portals: [] };
  }
  const childById = new Map(children.map((child) => [child.id, child]));
  let padding = paddingFor(portals.length, contentWidth, contentDepth, 12);
  const initialPadding = padding;
  let separation = 12;
  for (let guard = 0; guard < 10000; guard += 1) {
    const rim = rimOf(contentWidth, contentDepth, padding);
    const northLen = rim.maxX - rim.minX;
    const eastLen = rim.maxZ - rim.minZ;
    const perimeter = 2 * (northLen + eastLen);
    const desired = portals.map((portal) => ({
      portal,
      arc: desiredArc(rim, portal, childById),
    }));
    desired.sort((left, right) => {
      if (left.arc !== right.arc) return left.arc - right.arc;
      const name = compareUtf8(left.portal.name, right.portal.name);
      if (name !== 0) return name;
      return compareUtf8(left.portal.id, right.portal.id);
    });
    const positions: number[] = [];
    const firstDesired = desired[0];
    if (firstDesired === undefined) throw new Error("missing portal");
    positions.push(firstDesired.arc);
    for (let index = 1; index < desired.length; index += 1) {
      const item = desired[index];
      const previous = positions[index - 1];
      if (item === undefined || previous === undefined) throw new Error("missing arc");
      positions.push(Math.max(item.arc, previous + separation));
    }
    const first = positions[0];
    const last = positions[positions.length - 1];
    if (first === undefined || last === undefined) throw new Error("missing packed arc");
    if (last + separation > first + perimeter) {
      padding += 4;
      continue;
    }
    const placed: PlacedPortal[] = [];
    for (let index = 0; index < desired.length; index += 1) {
      const item = desired[index];
      const arc = positions[index];
      if (item === undefined || arc === undefined) throw new Error("missing position");
      const point = pointOnRim(rim, arc);
      placed.push({
        id: item.portal.id,
        name: item.portal.name,
        centerX: point.x,
        centerZ: point.z,
        side: point.side,
        arc: point.arc,
      });
    }
    if (!markersClear(placed.map((portal) => ({ x: portal.centerX, z: portal.centerZ })))) {
      separation += 2;
      while (rimPerimeter(contentWidth, contentDepth, padding) < separation * portals.length) {
        padding += 4;
      }
      continue;
    }
    return {
      initialPadding,
      padding,
      separation,
      contentOffset: 10 + padding / 2,
      portals: placed,
    };
  }
  throw new Error("portal packing did not terminate");
}
