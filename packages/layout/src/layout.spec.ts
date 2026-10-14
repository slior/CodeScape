import type { CityStructure, World } from "@sw3d/model";
import { layout } from "./layout.js";
import { markersClear } from "./portals.js";

function rimArc(x: number, z: number): number {
  const minX = 5;
  const maxX = 29;
  const minZ = 5;
  const maxZ = 29;
  const northLen = maxX - minX;
  const eastLen = maxZ - minZ;
  const perimeter = 2 * (northLen + eastLen);
  const midX = (minX + maxX) / 2;
  if (z === maxZ) return x >= midX ? x - midX : perimeter - (midX - x);
  if (x === maxX) return northLen / 2 + (maxZ - z);
  if (z === minZ) return northLen / 2 + eastLen + (maxX - x);
  if (x === minX) return northLen / 2 + eastLen + northLen + (z - minZ);
  throw new Error("marker is off the rim");
}

function flatCity(): CityStructure {
  return {
    version: 1,
    name: "demo",
    nodes: [
      { id: "city", kind: "city", name: "demo", parentId: null, path: "", mass: 0 },
      { id: "lodash", kind: "portal", name: "lodash", parentId: "city", path: "", mass: 0 },
      { id: "a", kind: "box", name: "a", parentId: "city", path: "a", mass: 0 },
      { id: "b", kind: "box", name: "b", parentId: "city", path: "b", mass: 0 },
    ],
    edges: [
      { id: "road-ab", kind: "road", parentId: "city", from: "a", to: "b", weight: 1 },
      { id: "portal-a", kind: "portal", parentId: "city", from: "a", to: "lodash", weight: 1 },
    ],
    warnings: [{ path: "src/a.ts", message: "unreadable" }],
  };
}

function nestedCity(): CityStructure {
  return {
    version: 1,
    name: "demo",
    nodes: [
      { id: "city", kind: "city", name: "demo", parentId: null, path: "", mass: 0 },
      { id: "file", kind: "building", name: "file.ts", parentId: "city", path: "src", mass: 0 },
      {
        id: "left",
        kind: "box",
        name: "Left",
        parentId: "file",
        path: "src/Left.ts",
        mass: 0,
      },
      {
        id: "right",
        kind: "box",
        name: "Right",
        parentId: "file",
        path: "src/Right.ts",
        mass: 0,
      },
    ],
    edges: [],
    warnings: [],
  };
}

describe("layout", () => {
  test("two calls return the same world", () => {
    const city = flatCity();
    const expected: World = {
      version: 1,
      name: "demo",
      nodes: [
        {
          id: "city",
          kind: "city",
          name: "demo",
          parentId: null,
          path: "",
          mass: 2,
          pose: { x: 0, z: 0, width: 30, depth: 48, height: 11.31 },
        },
        {
          id: "lodash",
          kind: "portal",
          name: "lodash",
          parentId: "city",
          path: "",
          mass: 0,
          pose: { x: 11, z: 1, width: 8, depth: 8, height: 8 },
        },
        {
          id: "a",
          kind: "box",
          name: "a",
          parentId: "city",
          path: "a",
          mass: 1,
          pose: { x: 10, z: 10, width: 10, depth: 10, height: 8 },
        },
        {
          id: "b",
          kind: "box",
          name: "b",
          parentId: "city",
          path: "b",
          mass: 1,
          pose: { x: 10, z: 28, width: 10, depth: 10, height: 8 },
        },
      ],
      edges: [
        {
          id: "road-ab",
          kind: "road",
          parentId: "city",
          from: "a",
          to: "b",
          weight: 1,
          points: [
            { x: 11, z: 21 },
            { x: 11, z: 23 },
            { x: 11, z: 25 },
            { x: 11, z: 27 },
          ],
        },
        {
          id: "portal-a",
          kind: "portal",
          parentId: "city",
          from: "a",
          to: "lodash",
          weight: 1,
          points: [
            { x: 15, z: 9 },
            { x: 15, z: 7 },
            { x: 15, z: 5 },
            { x: 17, z: 5 },
            { x: 19, z: 5 },
            { x: 21, z: 5 },
            { x: 19, z: 5 },
            { x: 17, z: 5 },
            { x: 15, z: 5 },
          ],
        },
      ],
      warnings: [{ path: "src/a.ts", message: "unreadable" }],
    };
    expect(layout(city)).toEqual(expected);
    expect(layout(city)).toEqual(layout(city));
  });

  test("mass and poses are computed bottom-up", () => {
    const world = layout(nestedCity());
    expect(layout(nestedCity())).toEqual(world);
    const byId = new Map(world.nodes.map((node) => [node.id, node]));
    expect(byId.get("left")?.mass).toBe(1);
    expect(byId.get("right")?.mass).toBe(1);
    expect(byId.get("file")?.mass).toBe(2);
    expect(byId.get("city")?.mass).toBe(2);
    expect(byId.get("city")?.pose).toEqual({ x: 0, z: 0, width: 50, depth: 68, height: 11.31 });
    expect(byId.get("file")?.pose).toEqual({ x: 10, z: 10, width: 30, depth: 48, height: 11.31 });
    expect(byId.get("left")?.pose).toEqual({ x: 20, z: 20, width: 10, depth: 10, height: 8 });
    expect(byId.get("right")?.pose).toEqual({ x: 20, z: 38, width: 10, depth: 10, height: 8 });
  });

  test("a crowded rim keeps on-grid minima, circular separation, and a polyline on every edge", () => {
    const portals = Array.from({ length: 7 }, (_, index) => ({
      id: `p${index}`,
      kind: "portal" as const,
      name: `n${index}`,
      parentId: "city",
      path: "",
      mass: 0,
    }));
    const city: CityStructure = {
      version: 1,
      name: "demo",
      nodes: [
        { id: "city", kind: "city", name: "demo", parentId: null, path: "", mass: 0 },
        { id: "child", kind: "box", name: "child", parentId: "city", path: "child", mass: 0 },
        ...portals,
      ],
      edges: portals.map((portal) => ({
        id: `portal-${portal.id}`,
        kind: "portal" as const,
        parentId: "city",
        from: "child",
        to: portal.id,
        weight: 1,
      })),
      warnings: [],
    };
    const world = layout(city);
    expect(world.nodes.find((node) => node.id === "city")?.pose).toEqual({
      x: 0,
      z: 0,
      width: 34,
      depth: 34,
      height: 8,
    });
    expect(world.nodes.find((node) => node.id === "child")?.pose).toEqual({
      x: 12,
      z: 12,
      width: 10,
      depth: 10,
      height: 8,
    });
    for (const node of world.nodes) {
      if (node.kind === "portal") continue;
      expect(node.pose.x % 2).toBe(0);
      expect(node.pose.z % 2).toBe(0);
    }
    expect(world.edges).toHaveLength(7);
    for (const edge of world.edges) expect(edge.points.length).toBeGreaterThan(0);
    const centers = world.nodes
      .filter((node) => node.kind === "portal")
      .map((node) => ({ x: node.pose.x + 4, z: node.pose.z + 4 }));
    expect(markersClear(centers)).toBe(true);
    const arcs = centers.map((center) => rimArc(center.x, center.z)).sort((left, right) => left - right);
    const perimeter = 96;
    for (let index = 0; index < arcs.length; index += 1) {
      const current = arcs[index];
      const next = arcs[(index + 1) % arcs.length];
      if (current === undefined || next === undefined) throw new Error("missing arc");
      const gap = index === arcs.length - 1 ? next + perimeter - current : next - current;
      expect(gap).toBeGreaterThanOrEqual(12);
    }
  });
});
