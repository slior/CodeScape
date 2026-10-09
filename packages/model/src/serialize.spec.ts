import { describe, expect, it } from "@jest/globals";
import { districtId, fileBoxId } from "./ids.js";
import { serializeWorld } from "./index.js";
import type { World } from "./types.js";

const expected = `{
  "version": 1,
  "name": "demo",
  "nodes": [
    {
      "id": "city:4:demo",
      "kind": "city",
      "name": "demo",
      "parentId": null,
      "path": "",
      "mass": 1,
      "pose": {
        "x": 0,
        "z": 0,
        "width": 20,
        "depth": 20,
        "height": 8
      }
    },
    {
      "id": "box:10:src/app.ts",
      "kind": "box",
      "name": "app.ts",
      "parentId": "district:0:",
      "path": "src/app.ts",
      "unitKind": "file",
      "mass": 1,
      "pose": {
        "x": 1.23,
        "z": -1.23,
        "width": 10,
        "depth": 10,
        "height": 8
      }
    }
  ],
  "edges": [],
  "warnings": [
    {
      "path": "src/app.ts",
      "message": "unreadable"
    }
  ]
}
`;

function sample(): World {
  return {
    version: 1,
    name: "demo",
    nodes: [
      {
        id: fileBoxId("src/app.ts"),
        kind: "box",
        name: "app.ts",
        parentId: districtId(""),
        path: "src/app.ts",
        unitKind: "file",
        mass: 1,
        pose: { x: 1.225, z: -1.225, width: 10, depth: 10, height: 8 },
      },
      {
        id: "city:4:demo",
        kind: "city",
        name: "demo",
        parentId: null,
        path: "",
        mass: 1,
        pose: { x: 0, z: 0, width: 20, depth: 20, height: 8 },
      },
    ],
    edges: [],
    warnings: [{ path: "src/app.ts", message: "unreadable" }],
  };
}

describe("serializeWorld", () => {
  it("writes canonical bytes with rounded coordinates and sorted nodes", () => {
    const text = serializeWorld(sample());
    expect(text).toBe(expected);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.startsWith("{")).toBe(true);
    expect(serializeWorld(sample())).toBe(text);
  });

  it("omits absent optional keys and sorts warnings", () => {
    const world = sample();
    world.warnings = [
      { path: "b.ts", message: "b" },
      { path: "a.ts", message: "z" },
      { path: "a.ts", message: "a" },
    ];
    const text = serializeWorld(world);
    expect(text).not.toContain("packageName");
    expect(text.indexOf('"message": "a"')).toBeLessThan(text.indexOf('"message": "z"'));
    expect(text.indexOf('"path": "a.ts"')).toBeLessThan(text.indexOf('"path": "b.ts"'));
  });

  it("writes edge keys canonically and rounds point coordinates half away from zero", () => {
    const world = sample();
    world.edges = [
      {
        id: "edge",
        kind: "road",
        parentId: "district",
        from: "a",
        to: "b",
        weight: 2,
        points: [{ x: 1.225, z: -1.225 }],
      },
    ];

    expect(serializeWorld(world)).toContain(`    {
      "id": "edge",
      "kind": "road",
      "parentId": "district",
      "from": "a",
      "to": "b",
      "weight": 2,
      "points": [
        {
          "x": 1.23,
          "z": -1.23
        }
      ]
    }`);
  });

  it("sorts edges by parentId, from, to, and kind using UTF-8 bytes", () => {
    const world = sample();
    const edge = (
      id: string,
      parentId: string,
      from: string,
      to: string,
      kind: "road" | "portal",
    ): World["edges"][number] => ({
      id,
      kind,
      parentId,
      from,
      to,
      weight: 1,
      points: [],
    });
    world.edges = [
      edge("kind-road", "same", "same", "same", "road"),
      edge("to-z", "same", "same", "z", "portal"),
      edge("from-z", "same", "z", "a", "portal"),
      edge("utf8-supplementary", "\u{10000}", "a", "a", "portal"),
      edge("kind-portal", "same", "same", "same", "portal"),
      edge("utf8-bmp", "\uE000", "a", "a", "portal"),
      edge("to-a", "same", "same", "a", "portal"),
      edge("from-a", "same", "a", "a", "portal"),
    ];

    const serialized = JSON.parse(serializeWorld(world)) as World;
    expect(serialized.edges.map(({ id }) => id)).toEqual([
      "from-a",
      "to-a",
      "kind-portal",
      "kind-road",
      "to-z",
      "from-z",
      "utf8-bmp",
      "utf8-supplementary",
    ]);
  });

  it("throws on a non-finite coordinate", () => {
    const world = sample();
    world.nodes[0]!.pose.x = Number.POSITIVE_INFINITY;

    expect(() => serializeWorld(world)).toThrow("coordinate is not finite");
  });

  it("does not mutate node poses or warning order", () => {
    const world = sample();
    world.warnings = [
      { path: "z.ts", message: "last" },
      { path: "a.ts", message: "first" },
    ];
    const pose = { ...world.nodes[0]!.pose };
    const warnings = world.warnings.map((warning) => ({ ...warning }));

    serializeWorld(world);

    expect(world.nodes[0]!.pose).toEqual(pose);
    expect(world.warnings).toEqual(warnings);
  });
});
