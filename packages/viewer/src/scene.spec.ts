import { describe, expect, it } from "vitest";
import type { Edge, Node, Pose, World } from "@sw3d/model";
import { createSceneGraph, southRimStart, walkableCellKeys } from "./scene.js";
import { EDGE_KIND, EYE_HEIGHT, NODE_KIND, WORLD_VERSION } from "./types.js";

function pose(x: number, z: number, width: number, depth: number, height = 8): Pose {
  return { x, z, width, depth, height };
}

function makeNode(fields: {
  id: string;
  kind: Node["kind"];
  name: string;
  parentId: string | null;
  path: string;
  pose: Pose;
  mass?: number;
}): Node {
  return {
    id: fields.id,
    kind: fields.kind,
    name: fields.name,
    parentId: fields.parentId,
    path: fields.path,
    mass: fields.mass ?? 1,
    pose: fields.pose,
  };
}

function makeEdge(id: string, parentId: string, from: string, to: string, kind: Edge["kind"]): Edge {
  return { id, kind, parentId, from, to, weight: 1, points: [{ x: 1, z: 1 }, { x: 1, z: 3 }] };
}

function fixture(): World {
  return {
    version: WORLD_VERSION,
    name: "dialectic",
    nodes: [
      makeNode({ id: "city", kind: NODE_KIND.CITY, name: "dialectic", parentId: null, path: "", pose: pose(0, 0, 40, 30), mass: 4 }),
      makeNode({ id: "core", kind: NODE_KIND.DISTRICT, name: "core", parentId: "city", path: "packages/core", pose: pose(4, 4, 10, 10), mass: 2 }),
      makeNode({ id: "agents", kind: NODE_KIND.BUILDING, name: "agents", parentId: "core", path: "packages/core/src/agents", pose: pose(6, 6, 10, 10) }),
      makeNode({ id: "prompt", kind: NODE_KIND.BOX, name: "Prompt", parentId: "agents", path: "packages/core/src/agents/prompt.ts", pose: pose(8, 8, 10, 10) }),
      makeNode({ id: "lodash", kind: NODE_KIND.PORTAL, name: "lodash", parentId: "city", path: "", pose: pose(16, 26, 8, 8) }),
    ],
    edges: [
      makeEdge("road-city", "city", "core", "lodash", EDGE_KIND.PORTAL),
      makeEdge("road-core", "core", "agents", "agents", EDGE_KIND.ROAD),
    ],
    warnings: [],
  };
}

describe("createSceneGraph", () => {
  it("draws one courtyard: direct children, matching edges, and portals, without descendant interiors", () => {
    const graph = createSceneGraph(fixture(), "city");
    expect(graph.parentId).toBe("city");
    expect(graph.footprints.map((item) => item.id).sort()).toEqual(["core", "lodash"]);
    expect(graph.edges.map((item) => item.id)).toEqual(["road-city"]);
    expect(graph.labels.map((item) => item.text).sort()).toEqual(["core", "lodash"]);
    expect(JSON.stringify(graph)).not.toContain("export const");
    expect(Object.prototype.hasOwnProperty.call(graph, "source")).toBe(false);
  });

  it("omits a box nested inside a building when the courtyard is the district", () => {
    const graph = createSceneGraph(fixture(), "core");
    expect(graph.footprints.map((item) => item.id)).toEqual(["agents"]);
    expect(graph.edges.map((item) => item.id)).toEqual(["road-core"]);
    expect(graph.footprints.some((item) => item.id === "prompt")).toBe(false);
  });
});

describe("walkableCellKeys", () => {
  it("excludes a district footprint interior and keeps a street cell in the parent", () => {
    const keys = walkableCellKeys(fixture(), "city");
    expect(keys.has("4,4")).toBe(false);
    expect(keys.has("0,0")).toBe(true);
    expect(keys.has("16,26")).toBe(true);
  });
});

describe("southRimStart", () => {
  it("stands on the southern walkable cell center at eye height", () => {
    const start = southRimStart(fixture(), "city");
    expect(start).toEqual({ x: 19, y: EYE_HEIGHT, z: 1 });
  });
});
