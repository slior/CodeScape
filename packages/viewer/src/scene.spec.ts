import { describe, expect, it } from "vitest";
import type { Edge, Node, Pose, World } from "@sw3d/model";
import { createSceneGraph, roofSignPose, southRimStart, walkableCellKeys, wallSignPoses } from "./scene.js";
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
    expect(graph.signs).toEqual([
      { id: "core", text: "core", x: 4, z: 4, width: 10, depth: 10, height: 8 },
      { id: "lodash", text: "lodash", x: 16, z: 26, width: 8, depth: 8, height: 8 },
    ]);
    expect(JSON.stringify(graph)).not.toContain("export const");
    expect(Object.prototype.hasOwnProperty.call(graph, "source")).toBe(false);
  });

  it("omits a box nested inside a building when the courtyard is the district", () => {
    const graph = createSceneGraph(fixture(), "core");
    expect(graph.footprints.map((item) => item.id)).toEqual(["agents"]);
    expect(graph.edges.map((item) => item.id)).toEqual(["road-core"]);
    expect(graph.footprints.some((item) => item.id === "prompt")).toBe(false);
    expect(graph.signs).toEqual([
      { id: "agents", text: "agents", x: 6, z: 6, width: 10, depth: 10, height: 8 },
    ]);
  });

  it("signs the box inside a building and no other child", () => {
    const graph = createSceneGraph(fixture(), "agents");
    expect(graph.signs).toEqual([
      { id: "prompt", text: "Prompt", x: 8, z: 8, width: 10, depth: 10, height: 8 },
    ]);
  });

  it("skips a child whose name is empty or only spaces", () => {
    const world = fixture();
    world.nodes.push(
      makeNode({ id: "empty", kind: NODE_KIND.BOX, name: "", parentId: "city", path: "empty.ts", pose: pose(0, 0, 2, 2) }),
      makeNode({ id: "spaces", kind: NODE_KIND.BOX, name: "   ", parentId: "city", path: "spaces.ts", pose: pose(2, 0, 2, 2) }),
    );
    const graph = createSceneGraph(world, "city");
    expect(graph.signs.map((sign) => sign.id)).toEqual(["core", "lodash"]);
    expect(graph.footprints.map((item) => item.id)).toEqual(["core", "lodash", "empty", "spaces"]);
  });
});

describe("wallSignPoses", () => {
  const sign = { id: "core", text: "core", x: 4, z: 4, width: 10, depth: 10, height: 8 };

  it("centers a square plaque on each face at eye height", () => {
    const poses = wallSignPoses(sign, 1);
    expect(poses.map((pose) => pose.face)).toEqual(["south", "north", "east", "west"]);
    expect(poses[0]).toMatchObject({ x: 9, y: 4, yaw: Math.PI });
    expect(poses[0]?.z).toBeCloseTo(3.95);
    expect(poses[0]?.width).toBeCloseTo(1.2);
    expect(poses[0]?.height).toBeCloseTo(1.2);
    expect(poses[1]).toMatchObject({ x: 9, y: 4, yaw: 0 });
    expect(poses[1]?.z).toBeCloseTo(14.05);
    expect(poses[2]).toMatchObject({ z: 9, y: 4 });
    expect(poses[2]?.x).toBeCloseTo(14.05);
    expect(poses[2]?.yaw).toBeCloseTo(Math.PI / 2);
    expect(poses[3]).toMatchObject({ z: 9, y: 4 });
    expect(poses[3]?.x).toBeCloseTo(3.95);
    expect(poses[3]?.yaw).toBeCloseTo(-Math.PI / 2);
    expect(poses[2]?.width).toBeCloseTo(1.2);
    expect(poses[3]?.height).toBeCloseTo(1.2);
  });

  it("shrinks every face when the text is wider than the fit limit", () => {
    for (const pose of wallSignPoses(sign, 10)) {
      expect(pose.width).toBeCloseTo(8);
      expect(pose.height).toBeCloseTo(0.8);
    }
  });

  it("fits the south face to width and the east face to depth", () => {
    const narrow = { id: "n", text: "n", x: 0, z: 0, width: 10, depth: 2, height: 8 };
    const poses = wallSignPoses(narrow, 4);
    const south = poses.find((pose) => pose.face === "south");
    const north = poses.find((pose) => pose.face === "north");
    const east = poses.find((pose) => pose.face === "east");
    const west = poses.find((pose) => pose.face === "west");
    expect(south?.width).toBeCloseTo(4.8);
    expect(south?.height).toBeCloseTo(1.2);
    expect(north?.width).toBeCloseTo(4.8);
    expect(north?.height).toBeCloseTo(1.2);
    expect(east?.width).toBeCloseTo(1.6);
    expect(east?.height).toBeCloseTo(0.4);
    expect(west?.width).toBeCloseTo(1.6);
    expect(west?.height).toBeCloseTo(0.4);
  });
});

describe("roofSignPose", () => {
  const sign = { id: "core", text: "core", x: 4, z: 4, width: 10, depth: 10, height: 8 };

  it("centers a square plaque on the roof", () => {
    const pose = roofSignPose(sign, 1);
    expect(pose.x).toBe(9);
    expect(pose.z).toBe(9);
    expect(pose.y).toBeCloseTo(10);
    expect(pose.width).toBeCloseTo(8);
    expect(pose.height).toBeCloseTo(8);
  });

  it("shrinks a wide plaque to the roof width", () => {
    const pose = roofSignPose(sign, 4);
    expect(pose.x).toBe(9);
    expect(pose.y).toBeCloseTo(10);
    expect(pose.z).toBe(9);
    expect(pose.width).toBeCloseTo(8);
    expect(pose.height).toBeCloseTo(2);
  });

  it("shrinks a square plaque to the shallower roof side", () => {
    const pose = roofSignPose({ id: "n", text: "n", x: 4, z: 4, width: 10, depth: 4, height: 8 }, 1);
    expect(pose.width).toBeCloseTo(3.2);
    expect(pose.height).toBeCloseTo(3.2);
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
