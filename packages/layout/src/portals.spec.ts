import {
  intersectRim,
  markersClear,
  placePortals,
  pointOnRim,
  roundCoord,
} from "./portals.js";

describe("portals", () => {
  test("seven portals take a first padding of 4 and stay on the grid", () => {
    const portals = Array.from({ length: 7 }, (_, index) => ({
      id: `p${index}`,
      name: `n${index}`,
      from: ["child"],
    }));
    const placed = placePortals(10, 10, [{ id: "child", x: 5, z: 5 }], portals);
    expect(placed.initialPadding).toBe(4);
    expect(placed.padding).toBe(4);
    expect(placed.separation).toBe(12);
    expect(placed.contentOffset).toBe(12);
    expect(placed.contentOffset % 2).toBe(0);
    expect(placed.portals).toHaveLength(7);
    expect(placed.portals[0]).toMatchObject({ name: "n0", centerX: 5, centerZ: 17, side: "north" });
    expect(markersClear(placed.portals.map((portal) => ({ x: portal.centerX, z: portal.centerZ })))).toBe(
      true,
    );
  });

  test("symmetric centers eight units from a corner are rejected", () => {
    expect(
      markersClear([
        { x: 7, z: 15 },
        { x: 15, z: 7 },
      ]),
    ).toBe(false);
    expect(
      markersClear([
        { x: 7, z: 15 },
        { x: 15, z: 5 },
      ]),
    ).toBe(true);
    const placed = placePortals(
      10,
      10,
      [{ id: "child", x: 6, z: 10 }],
      [
        { id: "pa", name: "a", from: ["child"] },
        { id: "pb", name: "b", from: ["child"] },
      ],
    );
    expect(placed.separation).toBe(18);
    expect(placed.portals.map((portal) => ({
      name: portal.name,
      centerX: portal.centerX,
      centerZ: portal.centerZ,
      side: portal.side,
    }))).toEqual([
      { name: "a", centerX: 7, centerZ: 15, side: "north" },
      { name: "b", centerX: 15, centerZ: 5, side: "east" },
    ]);
    expect(markersClear(placed.portals.map((portal) => ({ x: portal.centerX, z: portal.centerZ })))).toBe(
      true,
    );
  });

  test("a fractional corner keeps at least 0.02 after rounding", () => {
    const placed = placePortals(
      10,
      10,
      [{ id: "child", x: 6, z: 8 }],
      [
        { id: "pa", name: "a", from: ["child"] },
        { id: "pb", name: "b", from: ["child"] },
      ],
    );
    expect(placed.separation).toBe(16);
    const north = placed.portals[0];
    const east = placed.portals[1];
    if (north === undefined || east === undefined) throw new Error("missing portal");
    const roundedNorth = { x: roundCoord(north.centerX), z: roundCoord(north.centerZ) };
    const roundedEast = { x: roundCoord(east.centerX), z: roundCoord(east.centerZ) };
    expect(roundedNorth).toEqual({ x: 8.33, z: 15 });
    expect(roundedEast).toEqual({ x: 15, z: 5.67 });
    const gapZ = roundedNorth.z - 4 - (roundedEast.z + 4);
    expect(gapZ).toBeCloseTo(1.33, 2);
    expect(gapZ).toBeGreaterThanOrEqual(0.02);
    expect(markersClear([
      { x: north.centerX, z: north.centerZ },
      { x: east.centerX, z: east.centerZ },
    ])).toBe(true);
  });

  test("a ray through a rectangle corner uses that corner", () => {
    const rim = { minX: 0, maxX: 40, minZ: 0, maxZ: 20, centerX: 20, centerZ: 10 };
    expect(intersectRim(rim, 20, 10)).toEqual({ x: 40, z: 20, side: "north" });
    const perimeter = 2 * (40 + 20);
    const fractionArc = (Math.atan2(20, 10) / (2 * Math.PI)) * perimeter;
    const fraction = pointOnRim(rim, fractionArc);
    expect(roundCoord(fraction.x)).toBe(40);
    expect(roundCoord(fraction.z)).toBe(18.86);
    expect(fraction.side).toBe("east");
  });

  test("equal arcs place the UTF-8-earlier name first", () => {
    const placed = placePortals(
      10,
      10,
      [{ id: "child", x: 5, z: 5 }],
      [
        { id: "later", name: "\u{10000}", from: ["child"] },
        { id: "earlier", name: "\uE000", from: ["child"] },
      ],
    );
    expect(placed.portals.map((portal) => portal.name)).toEqual(["\uE000", "\u{10000}"]);
  });

  test("roundCoord normalizes a negative near-zero to zero", () => {
    expect(roundCoord(-0.001)).toBe(0);
  });
});
