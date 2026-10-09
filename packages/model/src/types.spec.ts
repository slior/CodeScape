import { describe, expect, it } from "@jest/globals";
import type { CityStructure, CodeGraph, World } from "./index.js";

describe("model types", () => {
  it("builds a code graph and a version-1 world without optional keys", () => {
    const graph: CodeGraph = {
      name: "demo",
      files: [{ path: "src/app.ts" }],
      units: [],
      imports: [],
      warnings: [],
    };
    const city: CityStructure = {
      version: 1,
      name: graph.name,
      nodes: [
        {
          id: "city",
          kind: "city",
          name: "demo",
          parentId: null,
          path: "",
          mass: 0,
        },
      ],
      edges: [],
      warnings: [],
    };
    const world: World = {
      version: 1,
      name: "demo",
      nodes: [
        {
          id: "city",
          kind: "city",
          name: "demo",
          parentId: null,
          path: "",
          mass: 0,
          pose: { x: 0, z: 0, width: 0, depth: 0, height: 8 },
        },
      ],
      edges: [],
      warnings: [],
    };
    expect(world.version).toBe(1);
    expect(city.name).toBe(graph.name);
    expect(world.nodes[0]?.pose.height).toBe(8);
    expect("pose" in (city.nodes[0] ?? {})).toBe(false);
  });
});
