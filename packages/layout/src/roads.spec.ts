import { routePortal, routeRoad, type Footprint } from "./roads.js";

function outside(points: ReadonlyArray<{ x: number; z: number }>, footprints: readonly Footprint[]): boolean {
  for (const point of points) {
    const x = point.x - 1;
    const z = point.z - 1;
    if (x % 2 !== 0 || z % 2 !== 0) return false;
    for (const footprint of footprints) {
      const hits =
        x < footprint.x + footprint.width &&
        footprint.x < x + 2 &&
        z < footprint.z + footprint.depth &&
        footprint.z < z + 2;
      if (hits) return false;
    }
  }
  return true;
}

describe("roads", () => {
  test("equal-length pairs break by z then x and the polyline is those centers", () => {
    const source: Footprint = { x: 10, z: 10, width: 10, depth: 10 };
    const target: Footprint = { x: 24, z: 22, width: 10, depth: 10 };
    const footprints = [source, target];
    const points = routeRoad(source, target, footprints, { width: 48, depth: 48 });
    expect(points).toEqual([
      { x: 21, z: 19 },
      { x: 21, z: 21 },
      { x: 23, z: 21 },
      { x: 25, z: 21 },
    ]);
    expect(outside(points, footprints)).toBe(true);
  });

  test("a portal pushed around a corner ends on the cell nearest the marker", () => {
    const source: Footprint = { x: 10, z: 10, width: 10, depth: 10 };
    const other: Footprint = { x: 10, z: 28, width: 10, depth: 10 };
    const footprints = [source, other];
    const points = routePortal(source, { x: 15, z: 5 }, "east", footprints, {
      width: 30,
      depth: 48,
    });
    expect(points).toEqual([
      { x: 15, z: 9 },
      { x: 15, z: 7 },
      { x: 15, z: 5 },
      { x: 17, z: 5 },
      { x: 19, z: 5 },
      { x: 21, z: 5 },
      { x: 19, z: 5 },
      { x: 17, z: 5 },
      { x: 15, z: 5 },
    ]);
    expect(points[points.length - 1]).toEqual({ x: 15, z: 5 });
    expect(points.some((point) => point.x === 21)).toBe(true);
    expect(outside(points, footprints)).toBe(true);
  });

  test("a portal route starts outside the band and stays in the band after the exit side", () => {
    const source: Footprint = { x: 12, z: 12, width: 10, depth: 10 };
    const footprints = [source];
    const bounds = { width: 44, depth: 44 };
    const points = routePortal(source, { x: 39, z: 17 }, "east", footprints, bounds);
    expect(points).toEqual([
      { x: 23, z: 17 },
      { x: 25, z: 17 },
      { x: 27, z: 17 },
      { x: 29, z: 17 },
      { x: 31, z: 17 },
      { x: 33, z: 17 },
      { x: 35, z: 17 },
      { x: 37, z: 17 },
      { x: 39, z: 17 },
    ]);
    const cells = points.map((point) => ({ x: point.x - 1, z: point.z - 1 }));
    const inBand = (cell: { x: number; z: number }): boolean =>
      cell.x < 10 || cell.z < 10 || cell.x >= bounds.width - 10 || cell.z >= bounds.depth - 10;
    const start = cells[0];
    if (start === undefined) throw new Error("missing start");
    expect(start).toEqual({ x: 22, z: 16 });
    expect(inBand(start)).toBe(false);
    const exitIndex = cells.findIndex((cell) => cell.x >= bounds.width - 10);
    expect(exitIndex).toBeGreaterThan(0);
    expect(cells.slice(0, exitIndex).every((cell) => !inBand(cell))).toBe(true);
    expect(cells.slice(exitIndex).every((cell) => inBand(cell))).toBe(true);
    expect(points[points.length - 1]).toEqual({ x: 39, z: 17 });
    expect(outside(points, footprints)).toBe(true);
  });
});
