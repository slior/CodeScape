export const STREET = 8;

export interface FootprintChild {
  readonly id: string;
  readonly path: string;
  readonly kind: "district" | "building" | "box" | "portal";
  readonly width: number;
  readonly depth: number;
}

export interface PackEdge {
  readonly kind: "road" | "portal";
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

export interface PackedFootprint {
  readonly id: string;
  readonly path: string;
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface PackResult {
  readonly order: readonly string[];
  readonly placements: readonly PackedFootprint[];
  readonly contentWidth: number;
  readonly contentDepth: number;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function byPathId(left: { path: string; id: string }, right: { path: string; id: string }): number {
  const path = compareUtf8(left.path, right.path);
  return path === 0 ? compareUtf8(left.id, right.id) : path;
}

function weightKey(left: string, right: string): string {
  return compareUtf8(left, right) <= 0 ? `${left}\0${right}` : `${right}\0${left}`;
}

function undirectedWeights(
  children: readonly FootprintChild[],
  edges: readonly PackEdge[],
): Map<string, number> {
  const ids = new Set(children.map((child) => child.id));
  const weights = new Map<string, number>();
  for (const edge of edges) {
    if (edge.kind !== "road") continue;
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) continue;
    const key = weightKey(edge.from, edge.to);
    weights.set(key, (weights.get(key) ?? 0) + edge.weight);
  }
  return weights;
}

function weightBetween(weights: ReadonlyMap<string, number>, left: string, right: string): number {
  return weights.get(weightKey(left, right)) ?? 0;
}

function strengthTo(
  child: FootprintChild,
  others: readonly FootprintChild[],
  weights: ReadonlyMap<string, number>,
): number {
  let sum = 0;
  for (const other of others) {
    if (other.id === child.id) continue;
    sum += weightBetween(weights, child.id, other.id);
  }
  return sum;
}

export function orderChildren(
  children: readonly FootprintChild[],
  edges: readonly PackEdge[],
): FootprintChild[] {
  const pool = children.filter((child) => child.kind !== "portal");
  const weights = undirectedWeights(pool, edges);
  if (pool.length === 0) return [];
  const ranked = [...pool].sort((left, right) => {
    const diff = strengthTo(right, pool, weights) - strengthTo(left, pool, weights);
    if (diff !== 0) return diff;
    return byPathId(left, right);
  });
  const seed = ranked[0];
  if (seed === undefined) return [];
  const placed: FootprintChild[] = [seed];
  const rest = ranked.filter((child) => child.id !== seed.id);
  while (rest.length > 0) {
    rest.sort((left, right) => {
      const diff = strengthTo(right, placed, weights) - strengthTo(left, placed, weights);
      if (diff !== 0) return diff;
      return byPathId(left, right);
    });
    const next = rest.shift();
    if (next === undefined) break;
    placed.push(next);
  }
  return placed;
}

export function targetRowWidth(children: readonly FootprintChild[]): number {
  let area = 0;
  for (const child of children) area += child.width * child.depth;
  return Math.sqrt(area);
}

export function packRows(ordered: readonly FootprintChild[]): PackedFootprint[] {
  const target = targetRowWidth(ordered);
  const placed: PackedFootprint[] = [];
  let cursorX = 0;
  let cursorZ = 0;
  let rowWidth = 0;
  let rowDepth = 0;
  let inRow = false;
  for (const child of ordered) {
    if (inRow && rowWidth + STREET + child.width > target) {
      cursorZ += rowDepth + STREET;
      cursorX = 0;
      rowWidth = 0;
      rowDepth = 0;
      inRow = false;
    }
    placed.push({
      id: child.id,
      path: child.path,
      x: cursorX,
      z: cursorZ,
      width: child.width,
      depth: child.depth,
    });
    rowWidth = rowWidth === 0 ? child.width : rowWidth + STREET + child.width;
    rowDepth = Math.max(rowDepth, child.depth);
    cursorX += child.width + STREET;
    inRow = true;
  }
  return placed;
}

function contentSize(placements: readonly PackedFootprint[]): { width: number; depth: number } {
  let width = 0;
  let depth = 0;
  for (const placement of placements) {
    width = Math.max(width, placement.x + placement.width);
    depth = Math.max(depth, placement.z + placement.depth);
  }
  return { width, depth };
}

function centerOf(placement: PackedFootprint): { x: number; z: number } {
  return { x: placement.x + placement.width / 2, z: placement.z + placement.depth / 2 };
}

export function squaredRoadCost(
  placements: readonly PackedFootprint[],
  edges: readonly PackEdge[],
): number {
  const weights = undirectedWeights(
    placements.map((placement) => ({
      id: placement.id,
      path: placement.path,
      kind: "box",
      width: placement.width,
      depth: placement.depth,
    })),
    edges,
  );
  const byId = new Map(placements.map((placement) => [placement.id, placement]));
  let sum = 0;
  for (const [key, weight] of weights) {
    if (weight <= 0) continue;
    const parts = key.split("\0");
    const leftId = parts[0];
    const rightId = parts[1];
    if (leftId === undefined || rightId === undefined) continue;
    const left = byId.get(leftId);
    const right = byId.get(rightId);
    if (left === undefined || right === undefined) continue;
    const leftCenter = centerOf(left);
    const rightCenter = centerOf(right);
    const dx = leftCenter.x - rightCenter.x;
    const dz = leftCenter.z - rightCenter.z;
    sum += dx * dx + dz * dz;
  }
  return sum;
}

function separation(a0: number, a1: number, b0: number, b1: number): number {
  if (a1 <= b0) return b0 - a1;
  if (b1 <= a0) return a0 - b1;
  return 0;
}

function gapsOk(placements: readonly PackedFootprint[]): boolean {
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const left = placements[i];
      const right = placements[j];
      if (left === undefined || right === undefined) continue;
      const overlapX = left.x < right.x + right.width && right.x < left.x + left.width;
      const overlapZ = left.z < right.z + right.depth && right.z < left.z + left.depth;
      if (overlapX && overlapZ) return false;
      const gapX = separation(left.x, left.x + left.width, right.x, right.x + right.width);
      const gapZ = separation(left.z, left.z + left.depth, right.z, right.z + right.depth);
      if (gapX < STREET && gapZ < STREET) return false;
    }
  }
  return true;
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

function isGridNeighbor(left: PackedFootprint, right: PackedFootprint): boolean {
  const horizontal =
    (left.x + left.width + STREET === right.x || right.x + right.width + STREET === left.x) &&
    intervalsOverlap(left.z, left.z + left.depth, right.z, right.z + right.depth);
  const vertical =
    (left.z + left.depth + STREET === right.z || right.z + right.depth + STREET === left.z) &&
    intervalsOverlap(left.x, left.x + left.width, right.x, right.x + right.width);
  return horizontal || vertical;
}

function gridNeighborPairs(
  placements: readonly PackedFootprint[],
): Array<[PackedFootprint, PackedFootprint]> {
  const pairs: Array<[PackedFootprint, PackedFootprint]> = [];
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const left = placements[i];
      const right = placements[j];
      if (left === undefined || right === undefined) continue;
      if (!isGridNeighbor(left, right)) continue;
      const ordered = byPathId(left, right) <= 0 ? [left, right] : [right, left];
      const first = ordered[0];
      const second = ordered[1];
      if (first === undefined || second === undefined) continue;
      pairs.push([first, second]);
    }
  }
  pairs.sort((left, right) => {
    const first = left[0];
    const second = left[1];
    const otherFirst = right[0];
    const otherSecond = right[1];
    const compared = byPathId(first, otherFirst);
    if (compared !== 0) return compared;
    return byPathId(second, otherSecond);
  });
  return pairs;
}

function swapOrder(
  order: readonly FootprintChild[],
  leftId: string,
  rightId: string,
): FootprintChild[] {
  const next = [...order];
  const leftIndex = next.findIndex((child) => child.id === leftId);
  const rightIndex = next.findIndex((child) => child.id === rightId);
  if (leftIndex < 0 || rightIndex < 0) return next;
  const left = next[leftIndex];
  const right = next[rightIndex];
  if (left === undefined || right === undefined) return next;
  next[leftIndex] = right;
  next[rightIndex] = left;
  return next;
}

function optimizePlacement(
  ordered: readonly FootprintChild[],
  edges: readonly PackEdge[],
): PackedFootprint[] {
  const weights = undirectedWeights(ordered, edges);
  let order = [...ordered];
  let placements = packRows(order);
  let improved = true;
  while (improved) {
    improved = false;
    const pairs = gridNeighborPairs(placements);
    for (const pair of pairs) {
      const left = pair[0];
      const right = pair[1];
      const currentLeft = placements.find((placement) => placement.id === left.id);
      const currentRight = placements.find((placement) => placement.id === right.id);
      if (currentLeft === undefined || currentRight === undefined) continue;
      if (!isGridNeighbor(currentLeft, currentRight)) continue;
      const candidateOrder = swapOrder(order, left.id, right.id);
      const candidate = packRows(candidateOrder);
      if (!gapsOk(candidate)) continue;
      const byId = new Map(placements.map((placement) => [placement.id, placement]));
      const candidateById = new Map(candidate.map((placement) => [placement.id, placement]));
      let currentCost = 0;
      let candidateCost = 0;
      for (const [key, weight] of weights) {
        if (weight <= 0) continue;
        const parts = key.split("\0");
        const leftId = parts[0];
        const rightId = parts[1];
        if (leftId === undefined || rightId === undefined) continue;
        const currentA = byId.get(leftId);
        const currentB = byId.get(rightId);
        const nextA = candidateById.get(leftId);
        const nextB = candidateById.get(rightId);
        if (
          currentA === undefined ||
          currentB === undefined ||
          nextA === undefined ||
          nextB === undefined
        ) {
          continue;
        }
        const currentCenterA = centerOf(currentA);
        const currentCenterB = centerOf(currentB);
        const nextCenterA = centerOf(nextA);
        const nextCenterB = centerOf(nextB);
        currentCost +=
          (currentCenterA.x - currentCenterB.x) ** 2 + (currentCenterA.z - currentCenterB.z) ** 2;
        candidateCost += (nextCenterA.x - nextCenterB.x) ** 2 + (nextCenterA.z - nextCenterB.z) ** 2;
      }
      if (candidateCost < currentCost) {
        order = candidateOrder;
        placements = candidate;
        improved = true;
      }
    }
  }
  return placements;
}

export function packChildren(
  children: readonly FootprintChild[],
  edges: readonly PackEdge[],
): PackResult {
  const ordered = orderChildren(children, edges);
  const placements = optimizePlacement(ordered, edges);
  const size = contentSize(placements);
  return {
    order: ordered.map((child) => child.id),
    placements,
    contentWidth: size.width,
    contentDepth: size.depth,
  };
}

export function rimPerimeter(
  contentWidth: number,
  contentDepth: number,
  padding: number,
): number {
  return 2 * (contentWidth + contentDepth + 2 * padding + 20);
}

export function paddingFor(
  portalCount: number,
  contentWidth: number,
  contentDepth: number,
  separation: number,
): number {
  if (portalCount === 0) return 0;
  let padding = 0;
  while (rimPerimeter(contentWidth, contentDepth, padding) < separation * portalCount) {
    padding += 4;
  }
  return padding;
}
