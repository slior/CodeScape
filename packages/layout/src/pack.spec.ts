import {
  orderChildren,
  packChildren,
  packRows,
  paddingFor,
  rimPerimeter,
  squaredRoadCost,
  targetRowWidth,
  type FootprintChild,
  type PackEdge,
  type PackedFootprint,
} from "./pack.js";

function child(
  id: string,
  width: number,
  depth: number,
  kind: FootprintChild["kind"] = "box",
): FootprintChild {
  return { id, path: id, kind, width, depth };
}

function road(from: string, to: string, weight: number): PackEdge {
  return { kind: "road", from, to, weight };
}

function gapBetween(left: PackedFootprint, right: PackedFootprint): boolean {
  const overlapX = left.x < right.x + right.width && right.x < left.x + left.width;
  const overlapZ = left.z < right.z + right.depth && right.z < left.z + left.depth;
  if (overlapX && overlapZ) return false;
  const gapX = overlapX
    ? 0
    : left.x + left.width <= right.x
      ? right.x - (left.x + left.width)
      : left.x - (right.x + right.width);
  const gapZ = overlapZ
    ? 0
    : left.z + left.depth <= right.z
      ? right.z - (left.z + left.depth)
      : left.z - (right.z + right.depth);
  return gapX >= 8 || gapZ >= 8;
}

describe("pack", () => {
  test("three equal children place b, c, a on separate rows", () => {
    const children = [
      child("a", 10, 10),
      child("b", 10, 10),
      child("c", 10, 10),
      child("lodash", 8, 8, "portal"),
    ];
    const edges: PackEdge[] = [
      road("a", "b", 1),
      road("b", "c", 2),
      road("c", "b", 3),
      { kind: "portal", from: "a", to: "lodash", weight: 9 },
    ];
    const ordered = orderChildren(children, edges);
    expect(ordered.map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(targetRowWidth(ordered)).toBe(Math.sqrt(300));
    expect(packRows(ordered)).toEqual([
      { id: "b", path: "b", x: 0, z: 0, width: 10, depth: 10 },
      { id: "c", path: "c", x: 0, z: 18, width: 10, depth: 10 },
      { id: "a", path: "a", x: 0, z: 36, width: 10, depth: 10 },
    ]);
    const packed = packChildren(children, edges);
    expect(packed.order).toEqual(["b", "c", "a"]);
    expect(packed.placements.map((item) => item.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("strength sums every undirected weight into the placed set", () => {
    const children = [child("h", 10, 10), child("c", 10, 10), child("a", 10, 10), child("b", 10, 10)];
    const edges = [road("h", "c", 10), road("h", "a", 2), road("h", "b", 3), road("c", "a", 2)];
    expect(orderChildren(children, edges).map((item) => item.id)).toEqual(["h", "c", "a", "b"]);
  });

  test("undirected weight adds both directed roads", () => {
    const children = [
      child("a", 10, 10),
      child("b", 10, 10),
      child("c", 10, 10),
      child("e", 10, 10),
      child("f", 10, 10),
    ];
    const edges = [
      road("a", "b", 3),
      road("b", "a", 3),
      road("a", "c", 3),
      road("c", "a", 3),
      road("e", "f", 8),
    ];
    expect(orderChildren(children, edges)[0]?.id).toBe("a");
  });

  test("affinity ties place the UTF-8-earlier path first", () => {
    const earlier: FootprintChild = {
      id: "later-in-utf16",
      path: "\uE000",
      kind: "box",
      width: 10,
      depth: 10,
    };
    const later: FootprintChild = {
      id: "earlier-in-utf16",
      path: "\u{10000}",
      kind: "box",
      width: 10,
      depth: 10,
    };
    expect(orderChildren([later, earlier], []).map((item) => item.path)).toEqual([
      "\uE000",
      "\u{10000}",
    ]);
  });

  test("the first child of a row is placed when it is wider than the target", () => {
    const wide = child("a", 30, 10);
    const slim = child("b", 10, 10);
    const ordered = orderChildren([wide, slim], []);
    expect(ordered.map((item) => item.id)).toEqual(["a", "b"]);
    expect(targetRowWidth(ordered)).toBe(20);
    expect(packRows(ordered)).toEqual([
      { id: "a", path: "a", x: 0, z: 0, width: 30, depth: 10 },
      { id: "b", path: "b", x: 0, z: 18, width: 10, depth: 10 },
    ]);
  });

  test("padding starts at 0 and steps by 4", () => {
    expect(rimPerimeter(10, 10, 0)).toBe(80);
    expect(rimPerimeter(10, 10, 4)).toBe(96);
    expect(paddingFor(0, 10, 10, 12)).toBe(0);
    expect(paddingFor(6, 10, 10, 12)).toBe(0);
    expect(paddingFor(7, 10, 10, 12)).toBe(4);
  });

  test("an unequal-footprint swap is kept only after a full repack", () => {
    const children = [
      child("a", 10, 10, "building"),
      child("b", 16, 10, "building"),
      child("c", 40, 40, "building"),
    ];
    const edges = [road("a", "c", 5), road("b", "c", 1)];
    const ordered = orderChildren(children, edges);
    expect(ordered.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(targetRowWidth(ordered)).toBe(Math.sqrt(1860));
    const before = packRows(ordered);
    expect(before).toEqual([
      { id: "c", path: "c", x: 0, z: 0, width: 40, depth: 40 },
      { id: "a", path: "a", x: 0, z: 48, width: 10, depth: 10 },
      { id: "b", path: "b", x: 18, z: 48, width: 16, depth: 10 },
    ]);
    expect(squaredRoadCost(before, edges)).toBe(2439);

    const packed = packChildren(children, edges);
    expect(packed.placements).toEqual([
      { id: "c", path: "c", x: 0, z: 0, width: 40, depth: 40 },
      { id: "b", path: "b", x: 0, z: 48, width: 16, depth: 10 },
      { id: "a", path: "a", x: 24, z: 48, width: 10, depth: 10 },
    ]);
    expect(squaredRoadCost(packed.placements, edges)).toBe(2403);
    const placedA = packed.placements[2];
    const placedB = packed.placements[1];
    if (placedA === undefined || placedB === undefined) throw new Error("missing placement");
    expect(placedA.x - (placedB.x + placedB.width)).toBe(8);
    for (let i = 0; i < packed.placements.length; i += 1) {
      for (let j = i + 1; j < packed.placements.length; j += 1) {
        const left = packed.placements[i];
        const right = packed.placements[j];
        if (left === undefined || right === undefined) throw new Error("missing pair");
        expect(gapBetween(left, right)).toBe(true);
      }
    }

    const discarded = packRows([
      child("a", 10, 10, "building"),
      child("b", 16, 10, "building"),
      child("c", 40, 40, "building"),
    ]);
    expect(squaredRoadCost(discarded, edges)).toBe(2439);
    expect(packed.placements[0]).toMatchObject({ id: "c", x: 0, z: 0 });
  });
});
