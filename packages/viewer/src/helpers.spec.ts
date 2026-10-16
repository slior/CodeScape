import { describe, expect, it } from "vitest";
import type { Edge, Node, Pose, World } from "@sw3d/model";
import {
  assertWorldVersion,
  breadcrumb,
  clampToWalkable,
  enterTarget,
  incidentEdges,
  resolveWalk,
  startLoadedWorld,
  walkDirection,
} from "./helpers.js";
import { EDGE_KIND, MOVE_KEY, NODE_KIND, WORLD_VERSION, type MoveKeys } from "./types.js";

function pose(x: number, z: number, width = 10, depth = 10, height = 8): Pose {
  return { x, z, width, depth, height };
}

function node(fields: {
  id: string;
  kind: Node["kind"];
  name: string;
  parentId: string | null;
  path: string;
  mass?: number;
  pose?: Pose;
  packageName?: string;
}): Node {
  const value: Node = {
    id: fields.id,
    kind: fields.kind,
    name: fields.name,
    parentId: fields.parentId,
    path: fields.path,
    mass: fields.mass ?? 1,
    pose: fields.pose ?? pose(0, 0),
  };
  if (fields.packageName !== undefined) value.packageName = fields.packageName;
  return value;
}

function edge(fields: {
  id: string;
  kind?: Edge["kind"];
  parentId: string;
  from: string;
  to: string;
  weight: number;
}): Edge {
  return {
    id: fields.id,
    kind: fields.kind ?? EDGE_KIND.ROAD,
    parentId: fields.parentId,
    from: fields.from,
    to: fields.to,
    weight: fields.weight,
    points: [],
  };
}

function world(): World {
  return {
    version: WORLD_VERSION,
    name: "dialectic",
    nodes: [
      node({ id: "city", kind: NODE_KIND.CITY, name: "dialectic", parentId: null, path: "", mass: 3, pose: pose(0, 0, 40, 40) }),
      node({ id: "core", kind: NODE_KIND.DISTRICT, name: "core", parentId: "city", path: "packages/core", mass: 2, pose: pose(2, 2, 20, 20), packageName: "dialectic-core" }),
      node({ id: "agents", kind: NODE_KIND.BUILDING, name: "agents", parentId: "core", path: "packages/core/src/agents", mass: 1, pose: pose(4, 4) }),
      node({ id: "box", kind: NODE_KIND.BOX, name: "Prompt", parentId: "agents", path: "packages/core/src/agents/prompt.ts", pose: pose(6, 6) }),
      node({ id: "portal", kind: NODE_KIND.PORTAL, name: "lodash", parentId: "city", path: "", packageName: "lodash" }),
      node({ id: "other", kind: NODE_KIND.DISTRICT, name: "cli", parentId: "city", path: "packages/cli", pose: pose(24, 2) }),
    ],
    edges: [
      edge({ id: "e-out", parentId: "city", from: "core", to: "portal", weight: 2, kind: EDGE_KIND.PORTAL }),
      edge({ id: "e-in", parentId: "city", from: "other", to: "core", weight: 4 }),
      edge({ id: "e-deep", parentId: "core", from: "agents", to: "agents", weight: 1 }),
    ],
    warnings: [],
  };
}

describe("breadcrumb", () => {
  it("lists containers from the city down to the current parent", () => {
    expect(breadcrumb(world(), "agents")).toEqual(["dialectic", "core", "agents"]);
    expect(breadcrumb(world(), "city")).toEqual(["dialectic"]);
  });
});

describe("incidentEdges", () => {
  it("splits depends-on and used-by and keeps weight", () => {
    const lists = incidentEdges(world(), "core");
    expect(lists.dependsOn.map((item) => [item.id, item.weight, item.to])).toEqual([["e-out", 2, "portal"]]);
    expect(lists.usedBy.map((item) => [item.id, item.weight, item.from])).toEqual([["e-in", 4, "other"]]);
  });
});

describe("enterTarget", () => {
  const city = world();

  it("returns a child district or building", () => {
    expect(enterTarget(city, "city", "core")).toBe("core");
    expect(enterTarget(city, "core", "agents")).toBe("agents");
  });

  it("returns null for a box, a portal, a miss, and a node outside the courtyard", () => {
    expect(enterTarget(city, "agents", "box")).toBeNull();
    expect(enterTarget(city, "city", "portal")).toBeNull();
    expect(enterTarget(city, "city", null)).toBeNull();
    expect(enterTarget(city, "city", "missing")).toBeNull();
    expect(enterTarget(city, "city", "agents")).toBeNull();
    expect(enterTarget(city, "city", "box")).toBeNull();
  });
});

describe("clampToWalkable", () => {
  it("breaks an equal-distance tie by smaller minimum x, then smaller minimum z, and returns the center", () => {
    const byX = clampToWalkable({ x: 0, z: 0 }, new Set(["0,-2", "-2,0"]));
    expect(byX).toEqual({ x: -1, z: 1 });

    const byZ = clampToWalkable({ x: 5, z: 0 }, new Set(["2,2", "2,-4"]));
    expect(byZ).toEqual({ x: 3, z: -3 });
  });

  it("moves a point inside a district footprint onto a street-cell center", () => {
    const street = new Set(["-2,4", "4,-2", "4,10", "10,4"]);
    expect(clampToWalkable({ x: 5, z: 5 }, street)).toEqual({ x: -1, z: 5 });
  });
});

describe("walkDirection", () => {
  const idle: MoveKeys = {
    [MOVE_KEY.FORWARD]: false,
    [MOVE_KEY.LEFT]: false,
    [MOVE_KEY.BACK]: false,
    [MOVE_KEY.RIGHT]: false,
  };

  it("strafes left on A and right on D when looking down -Z", () => {
    const forward = { x: 0, y: 0, z: -1 };
    expect(walkDirection(forward, { ...idle, [MOVE_KEY.LEFT]: true })).toEqual({ x: -1, z: 0 });
    expect(walkDirection(forward, { ...idle, [MOVE_KEY.RIGHT]: true })).toEqual({ x: 1, z: 0 });
  });

  it("strafes relative to the look direction", () => {
    const forward = { x: 1, y: 0, z: 0 };
    expect(walkDirection(forward, { ...idle, [MOVE_KEY.LEFT]: true })).toEqual({ x: 0, z: -1 });
    expect(walkDirection(forward, { ...idle, [MOVE_KEY.RIGHT]: true })).toEqual({ x: 0, z: 1 });
  });

  it("walks forward on W and back on S", () => {
    const forward = { x: 0, y: 0, z: -1 };
    expect(walkDirection(forward, { ...idle, [MOVE_KEY.FORWARD]: true })).toEqual({ x: 0, z: -1 });
    expect(walkDirection(forward, { ...idle, [MOVE_KEY.BACK]: true })).toEqual({ x: 0, z: 1 });
  });
});

describe("resolveWalk", () => {
  it("keeps a point that is already inside a walkable cell", () => {
    expect(resolveWalk({ x: 0.25, z: 0.5 }, new Set(["0,0"]))).toEqual({ x: 0.25, z: 0.5 });
  });
});

describe("assertWorldVersion", () => {
  it("rejects a world whose version is not 1", () => {
    expect(() => assertWorldVersion({ version: 2 })).toThrow(/another version \(2\)/);
    expect(() => assertWorldVersion({ version: 0 })).toThrow(/another version \(0\)/);
    expect(() => assertWorldVersion({ version: WORLD_VERSION })).not.toThrow();
  });
});

describe("startLoadedWorld", () => {
  it("does not start a scene when the version is not 1", () => {
    const started: unknown[] = [];
    const messages: string[] = [];
    startLoadedWorld(
      { version: 2 },
      (world) => started.push(world),
      (text) => messages.push(text),
    );
    expect(started).toEqual([]);
    expect(messages).toEqual([
      `This world.json is from another version (2). This viewer reads version ${WORLD_VERSION}.`,
    ]);
  });

  it("starts a scene for version 1", () => {
    const started: unknown[] = [];
    startLoadedWorld({ version: WORLD_VERSION }, (world) => started.push(world), () => {});
    expect(started).toEqual([{ version: WORLD_VERSION }]);
  });
});
