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
});
