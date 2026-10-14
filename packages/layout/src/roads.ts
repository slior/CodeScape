export interface Footprint {
  readonly x: number;
  readonly z: number;
  readonly width: number;
  readonly depth: number;
}

export interface Bounds {
  readonly width: number;
  readonly depth: number;
}

type SideName = "north" | "east" | "south" | "west";

interface Cell {
  readonly x: number;
  readonly z: number;
}

interface State {
  readonly x: number;
  readonly z: number;
  readonly phase: number;
}

const BAND = 10;
const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, 2],
  [2, 0],
  [0, -2],
  [-2, 0],
];

function intersectsInterior(cell: Cell, footprint: Footprint): boolean {
  return (
    cell.x < footprint.x + footprint.width &&
    footprint.x < cell.x + 2 &&
    cell.z < footprint.z + footprint.depth &&
    footprint.z < cell.z + 2
  );
}

function walkable(cell: Cell, bounds: Bounds, footprints: readonly Footprint[]): boolean {
  if (cell.x < 0 || cell.z < 0 || cell.x + 2 > bounds.width || cell.z + 2 > bounds.depth) {
    return false;
  }
  for (const footprint of footprints) {
    if (intersectsInterior(cell, footprint)) return false;
  }
  return true;
}

function inBand(cell: Cell, bounds: Bounds): boolean {
  return (
    cell.x < BAND ||
    cell.z < BAND ||
    cell.x >= bounds.width - BAND ||
    cell.z >= bounds.depth - BAND
  );
}

function onSide(cell: Cell, side: SideName, bounds: Bounds): boolean {
  if (side === "west") return cell.x < BAND;
  if (side === "east") return cell.x >= bounds.width - BAND;
  if (side === "south") return cell.z < BAND;
  return cell.z >= bounds.depth - BAND;
}

function boundaryCells(
  footprint: Footprint,
  bounds: Bounds,
  footprints: readonly Footprint[],
): Cell[] {
  const cells: Cell[] = [];
  const push = (x: number, z: number): void => {
    const cell = { x, z };
    if (!walkable(cell, bounds, footprints)) return;
    cells.push(cell);
  };
  for (let z = footprint.z; z < footprint.z + footprint.depth; z += 2) {
    push(footprint.x - 2, z);
    push(footprint.x + footprint.width, z);
  }
  for (let x = footprint.x; x < footprint.x + footprint.width; x += 2) {
    push(x, footprint.z - 2);
    push(x, footprint.z + footprint.depth);
  }
  cells.sort((left, right) => left.z - right.z || left.x - right.x);
  return cells;
}

function betterPair(
  distance: number,
  start: Cell,
  goal: Cell,
  best: { distance: number; start: Cell; goal: Cell },
): boolean {
  if (distance !== best.distance) return distance < best.distance;
  if (start.z !== best.start.z) return start.z < best.start.z;
  if (start.x !== best.start.x) return start.x < best.start.x;
  if (goal.z !== best.goal.z) return goal.z < best.goal.z;
  return goal.x < best.goal.x;
}

function choosePair(source: readonly Cell[], goals: readonly Cell[]): { start: Cell; goal: Cell } {
  let best: { distance: number; start: Cell; goal: Cell } | null = null;
  for (const start of source) {
    for (const goal of goals) {
      const dx = start.x - goal.x;
      const dz = start.z - goal.z;
      const distance = dx * dx + dz * dz;
      if (best === null || betterPair(distance, start, goal, best)) {
        best = { distance, start, goal };
      }
    }
  }
  if (best === null) throw new Error("no boundary pair");
  return { start: best.start, goal: best.goal };
}

function bandCellList(bounds: Bounds, footprints: readonly Footprint[]): Cell[] {
  const cells: Cell[] = [];
  for (let z = 0; z < bounds.depth; z += 2) {
    for (let x = 0; x < bounds.width; x += 2) {
      const cell = { x, z };
      if (!inBand(cell, bounds) || !walkable(cell, bounds, footprints)) continue;
      cells.push(cell);
    }
  }
  return cells;
}

function nearestBandCell(marker: { x: number; z: number }, cells: readonly Cell[]): Cell {
  let best: Cell | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of cells) {
    const dx = cell.x + 1 - marker.x;
    const dz = cell.z + 1 - marker.z;
    const distance = dx * dx + dz * dz;
    if (
      best === null ||
      distance < bestDistance ||
      (distance === bestDistance && (cell.z < best.z || (cell.z === best.z && cell.x < best.x)))
    ) {
      best = cell;
      bestDistance = distance;
    }
  }
  if (best === null) throw new Error("no band cell");
  return best;
}

function stateKey(state: State): string {
  return `${state.x},${state.z},${state.phase}`;
}

function manhattan(cell: { x: number; z: number }, goal: { x: number; z: number }): number {
  return (Math.abs(cell.x - goal.x) + Math.abs(cell.z - goal.z)) / 2;
}

function routeSearch(
  start: State,
  isGoal: (state: State) => boolean,
  neighbors: (state: State) => readonly State[],
  heuristic: (state: State) => number,
): Array<{ x: number; z: number }> {
  const bestG = new Map<string, number>();
  const parent = new Map<string, string>();
  const insertion = new Map<string, number>();
  let nextInsertion = 0;
  const open: Array<State & { g: number; f: number; insertion: number }> = [];

  const consider = (state: State, g: number, previous: State | null): void => {
    const key = stateKey(state);
    const known = bestG.get(key);
    if (known !== undefined && g >= known) return;
    bestG.set(key, g);
    if (previous !== null) parent.set(key, stateKey(previous));
    if (!insertion.has(key)) {
      insertion.set(key, nextInsertion);
      nextInsertion += 1;
    }
    const index = insertion.get(key);
    if (index === undefined) throw new Error("missing insertion index");
    open.push({ x: state.x, z: state.z, phase: state.phase, g, f: g + heuristic(state), insertion: index });
  };

  consider(start, 0, null);
  while (open.length > 0) {
    let bestIndex = 0;
    for (let index = 1; index < open.length; index += 1) {
      const candidate = open[index];
      const best = open[bestIndex];
      if (candidate === undefined || best === undefined) continue;
      if (
        candidate.f < best.f ||
        (candidate.f === best.f &&
          (candidate.g < best.g || (candidate.g === best.g && candidate.insertion < best.insertion)))
      ) {
        bestIndex = index;
      }
    }
    const current = open[bestIndex];
    if (current === undefined) break;
    open.splice(bestIndex, 1);
    const currentKey = stateKey(current);
    if (current.g !== bestG.get(currentKey)) continue;
    if (isGoal(current)) {
      const cells: Cell[] = [];
      let key: string | undefined = currentKey;
      while (key !== undefined) {
        const parts = key.split(",");
        const xText = parts[0];
        const zText = parts[1];
        if (xText === undefined || zText === undefined) throw new Error("bad path key");
        cells.push({ x: Number(xText), z: Number(zText) });
        key = parent.get(key);
      }
      cells.reverse();
      return cells.map((cell) => ({ x: cell.x + 1, z: cell.z + 1 }));
    }
    for (const next of neighbors(current)) consider(next, current.g + 1, current);
  }
  throw new Error("no street path");
}

function roadNeighbors(state: State, bounds: Bounds, footprints: readonly Footprint[]): State[] {
  const next: State[] = [];
  for (const step of NEIGHBORS) {
    const dx = step[0];
    const dz = step[1];
    const cell = { x: state.x + dx, z: state.z + dz };
    if (!walkable(cell, bounds, footprints)) continue;
    next.push({ x: cell.x, z: cell.z, phase: 0 });
  }
  return next;
}

function portalNeighbors(
  state: State,
  exit: SideName,
  bounds: Bounds,
  footprints: readonly Footprint[],
): State[] {
  const next: State[] = [];
  for (const step of NEIGHBORS) {
    const dx = step[0];
    const dz = step[1];
    const cell = { x: state.x + dx, z: state.z + dz };
    if (!walkable(cell, bounds, footprints)) continue;
    if (state.phase === 0) {
      next.push({ x: cell.x, z: cell.z, phase: onSide(cell, exit, bounds) ? 1 : 0 });
    } else if (inBand(cell, bounds)) {
      next.push({ x: cell.x, z: cell.z, phase: 1 });
    }
  }
  return next;
}

export function routeRoad(
  source: Footprint,
  target: Footprint,
  footprints: readonly Footprint[],
  bounds: Bounds,
): Array<{ x: number; z: number }> {
  const pair = choosePair(
    boundaryCells(source, bounds, footprints),
    boundaryCells(target, bounds, footprints),
  );
  return routeSearch(
    { x: pair.start.x, z: pair.start.z, phase: 0 },
    (state) => state.x === pair.goal.x && state.z === pair.goal.z,
    (state) => roadNeighbors(state, bounds, footprints),
    (state) => manhattan(state, pair.goal),
  );
}

export function routePortal(
  source: Footprint,
  marker: { readonly x: number; readonly z: number },
  exit: SideName,
  footprints: readonly Footprint[],
  bounds: Bounds,
): Array<{ x: number; z: number }> {
  const goal = nearestBandCell(marker, bandCellList(bounds, footprints));
  const pair = choosePair(boundaryCells(source, bounds, footprints), [goal]);
  const startPhase = onSide(pair.start, exit, bounds) ? 1 : 0;
  return routeSearch(
    { x: pair.start.x, z: pair.start.z, phase: startPhase },
    (state) => state.phase === 1 && state.x === goal.x && state.z === goal.z,
    (state) => portalNeighbors(state, exit, bounds, footprints),
    (state) => manhattan(state, goal),
  );
}
