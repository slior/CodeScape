import { describe, expect, it } from "@jest/globals";
import {
  buildingId,
  cityId,
  districtId,
  edgeId,
  fileBoxId,
  portalId,
  symbolBoxId,
} from "@sw3d/model";
import type {
  CityStructure,
  CodeGraph,
  Edge,
  ImportFact,
  Node,
  WorkspacePackage,
} from "@sw3d/model";
import { compose } from "./compose.js";

type CityNode = Omit<Node, "pose">;
type CityEdge = Omit<Edge, "points">;

function byPathThenId(left: { path: string; id: string }, right: { path: string; id: string }): number {
  const path = Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8"));
  if (path !== 0) return path;
  return Buffer.compare(Buffer.from(left.id, "utf8"), Buffer.from(right.id, "utf8"));
}

function byEdge(left: CityEdge, right: CityEdge): number {
  const parent = Buffer.compare(
    Buffer.from(left.parentId, "utf8"),
    Buffer.from(right.parentId, "utf8"),
  );
  if (parent !== 0) return parent;
  const from = Buffer.compare(Buffer.from(left.from, "utf8"), Buffer.from(right.from, "utf8"));
  if (from !== 0) return from;
  const to = Buffer.compare(Buffer.from(left.to, "utf8"), Buffer.from(right.to, "utf8"));
  if (to !== 0) return to;
  return Buffer.compare(Buffer.from(left.kind, "utf8"), Buffer.from(right.kind, "utf8"));
}

function internal(fromFile: string, file: string, specifier: string): ImportFact {
  return { fromFile, specifier, target: { kind: "internal", file } };
}

function external(fromFile: string, name: string, specifier: string): ImportFact {
  return { fromFile, specifier, target: { kind: "external", name } };
}

function portalNode(parentId: string, packageName: string): CityNode {
  return {
    id: portalId(parentId, packageName),
    kind: "portal",
    name: packageName,
    parentId,
    path: "",
    mass: 0,
  };
}

function assertNoCoordinates(structure: CityStructure): void {
  for (const node of structure.nodes) expect(node).not.toHaveProperty("pose");
  for (const edge of structure.edges) expect(edge).not.toHaveProperty("points");
}

describe("compose edges", () => {
  it("draws src-collapsed roads in both directions and aggregates portal weight", () => {
    const runnerPath = "packages/core/src/agents/runner.ts";
    const otherPath = "packages/core/src/agents/other.ts";
    const storePath = "packages/core/src/state/store.ts";
    const mainPath = "packages/cli/src/main.ts";
    const graph = {
      name: "app",
      files: [
        { path: runnerPath },
        { path: otherPath },
        { path: storePath },
        { path: mainPath },
      ],
      units: [{ id: "u-runner", kind: "class" as const, name: "Runner", path: runnerPath }],
      imports: [
        internal(runnerPath, storePath, "./store"),
        internal(runnerPath, storePath, "./store.js"),
        internal(otherPath, storePath, "../state/store"),
        internal(storePath, runnerPath, "../agents/runner"),
        external(runnerPath, "lodash", "lodash"),
        external(runnerPath, "lodash", "lodash/fp"),
        internal(mainPath, runnerPath, "@app/core"),
        external(mainPath, "zod", "zod"),
      ],
      warnings: [],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [
      { path: "packages/core", name: "@app/core" },
      { path: "packages/cli", name: "@app/cli" },
    ];
    const appId = cityId("app");
    const coreId = districtId("packages/core");
    const cliId = districtId("packages/cli");
    const agentsId = buildingId("packages/core/src/agents");
    const stateId = buildingId("packages/core/src/state");
    const runnerId = symbolBoxId(runnerPath, "Runner");
    const mainId = fileBoxId(mainPath);
    const agentsPortal = portalId(agentsId, "lodash");
    const corePortal = portalId(coreId, "lodash");
    const cityLodash = portalId(appId, "lodash");
    const cliZod = portalId(cliId, "zod");
    const cityZod = portalId(appId, "zod");
    const edges = ([
      {
        id: edgeId(coreId, agentsId, stateId),
        kind: "road",
        parentId: coreId,
        from: agentsId,
        to: stateId,
        weight: 3,
      },
      {
        id: edgeId(coreId, stateId, agentsId),
        kind: "road",
        parentId: coreId,
        from: stateId,
        to: agentsId,
        weight: 1,
      },
      {
        id: edgeId(agentsId, runnerId, agentsPortal),
        kind: "portal",
        parentId: agentsId,
        from: runnerId,
        to: agentsPortal,
        weight: 2,
      },
      {
        id: edgeId(coreId, agentsId, corePortal),
        kind: "portal",
        parentId: coreId,
        from: agentsId,
        to: corePortal,
        weight: 2,
      },
      {
        id: edgeId(appId, coreId, cityLodash),
        kind: "portal",
        parentId: appId,
        from: coreId,
        to: cityLodash,
        weight: 2,
      },
      {
        id: edgeId(appId, cliId, coreId),
        kind: "road",
        parentId: appId,
        from: cliId,
        to: coreId,
        weight: 1,
      },
      {
        id: edgeId(cliId, mainId, cliZod),
        kind: "portal",
        parentId: cliId,
        from: mainId,
        to: cliZod,
        weight: 1,
      },
      {
        id: edgeId(appId, cliId, cityZod),
        kind: "portal",
        parentId: appId,
        from: cliId,
        to: cityZod,
        weight: 1,
      },
    ] satisfies CityEdge[]).sort(byEdge);
    const expectedPortals = [
      portalNode(agentsId, "lodash"),
      portalNode(coreId, "lodash"),
      portalNode(appId, "lodash"),
      portalNode(cliId, "zod"),
      portalNode(appId, "zod"),
    ].sort(byPathThenId);

    const structure = compose(graph, packages);
    expect(structure.nodes.some((node) => node.name === "src")).toBe(false);
    expect(
      structure.nodes.some(
        (node) => node.path === "packages/core/src" || node.path === "packages/cli/src",
      ),
    ).toBe(false);
    expect(structure.nodes.find((node) => node.id === agentsId)).toMatchObject({
      kind: "building",
      name: "agents",
      path: "packages/core/src/agents",
      parentId: coreId,
      mass: 2,
    });
    expect(structure.nodes.find((node) => node.id === stateId)).toMatchObject({
      kind: "building",
      name: "state",
      path: "packages/core/src/state",
      parentId: coreId,
      mass: 1,
    });
    expect(structure.nodes.find((node) => node.id === mainId)?.parentId).toBe(cliId);
    expect(structure.nodes.find((node) => node.id === appId)?.mass).toBe(4);
    expect(structure.nodes.filter((node) => node.kind === "portal").sort(byPathThenId)).toEqual(
      expectedPortals,
    );
    expect(structure.edges).toEqual(edges);
    assertNoCoordinates(structure);
  });

  it("attaches a multi-symbol file import to the file building", () => {
    const widgets = "packages/core/src/widgets.ts";
    const util = "packages/core/src/util.ts";
    const graph = {
      name: "app",
      files: [{ path: widgets }, { path: util }],
      units: [
        { id: "u-widget", kind: "class" as const, name: "Widget", path: widgets },
        { id: "u-button", kind: "class" as const, name: "Button", path: widgets },
      ],
      imports: [internal(widgets, util, "./util"), external(widgets, "zod", "zod")],
      warnings: [],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [{ path: "packages/core", name: "@app/core" }];
    const appId = cityId("app");
    const coreId = districtId("packages/core");
    const fileId = buildingId(widgets);
    const utilId = fileBoxId(util);
    const widgetBox = symbolBoxId(widgets, "Widget");
    const buttonBox = symbolBoxId(widgets, "Button");
    const corePortal = portalId(coreId, "zod");
    const cityPortal = portalId(appId, "zod");
    const edges = ([
      {
        id: edgeId(coreId, fileId, utilId),
        kind: "road",
        parentId: coreId,
        from: fileId,
        to: utilId,
        weight: 1,
      },
      {
        id: edgeId(coreId, fileId, corePortal),
        kind: "portal",
        parentId: coreId,
        from: fileId,
        to: corePortal,
        weight: 1,
      },
      {
        id: edgeId(appId, coreId, cityPortal),
        kind: "portal",
        parentId: appId,
        from: coreId,
        to: cityPortal,
        weight: 1,
      },
    ] satisfies CityEdge[]).sort(byEdge);

    const structure = compose(graph, packages);
    expect(structure.nodes.some((node) => node.name === "src" || node.path === "packages/core/src")).toBe(
      false,
    );
    expect(structure.nodes.find((node) => node.id === fileId)).toMatchObject({
      kind: "building",
      name: "widgets.ts",
      path: widgets,
      parentId: coreId,
      mass: 2,
    });
    expect(structure.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: widgetBox,
          kind: "box",
          name: "Widget",
          parentId: fileId,
          unitKind: "class",
          mass: 1,
        }),
        expect.objectContaining({
          id: buttonBox,
          kind: "box",
          name: "Button",
          parentId: fileId,
          unitKind: "class",
          mass: 1,
        }),
        expect.objectContaining({
          id: utilId,
          kind: "box",
          name: "util.ts",
          parentId: coreId,
          unitKind: "file",
          mass: 1,
        }),
      ]),
    );
    expect(
      structure.edges.some(
        (edge) =>
          edge.from === widgetBox ||
          edge.to === widgetBox ||
          edge.from === buttonBox ||
          edge.to === buttonBox ||
          edge.parentId === fileId,
      ),
    ).toBe(false);
    expect(structure.nodes.filter((node) => node.kind === "portal").sort(byPathThenId)).toEqual(
      [portalNode(coreId, "zod"), portalNode(appId, "zod")].sort(byPathThenId),
    );
    expect(structure.edges).toEqual(edges);
    assertNoCoordinates(structure);
  });

  it("keeps same-child facts on the child container", () => {
    const a = "packages/core/src/agents/a.ts";
    const b = "packages/core/src/agents/b.ts";
    const graph = {
      name: "app",
      files: [{ path: a }, { path: b }],
      units: [],
      imports: [
        internal(a, b, "./b"),
        internal(a, b, "./b.js"),
        internal(b, a, "./a"),
        internal(a, a, "./a"),
      ],
      warnings: [],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [{ path: "packages/core", name: "@app/core" }];
    const agentsId = buildingId("packages/core/src/agents");
    const aId = fileBoxId(a);
    const bId = fileBoxId(b);
    const edges = ([
      {
        id: edgeId(agentsId, aId, bId),
        kind: "road",
        parentId: agentsId,
        from: aId,
        to: bId,
        weight: 2,
      },
      {
        id: edgeId(agentsId, bId, aId),
        kind: "road",
        parentId: agentsId,
        from: bId,
        to: aId,
        weight: 1,
      },
    ] satisfies CityEdge[]).sort(byEdge);

    const structure = compose(graph, packages);
    expect(structure.nodes.find((node) => node.id === agentsId)?.path).toBe(
      "packages/core/src/agents",
    );
    expect(structure.nodes.some((node) => node.name === "src")).toBe(false);
    expect(structure.edges).toEqual(edges);
    assertNoCoordinates(structure);
  });

  it("emits roads only from import facts", () => {
    const graph = {
      name: "app",
      files: [{ path: "packages/core/src/a.ts" }, { path: "packages/cli/src/b.ts" }],
      units: [],
      imports: [],
      warnings: [],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [
      { path: "packages/core", name: "@app/core" },
      { path: "packages/cli", name: "@app/cli" },
    ];
    const structure = compose(graph, packages);
    expect(structure.edges).toEqual([]);
    expect(structure.nodes.filter((node) => node.kind === "portal")).toEqual([]);
    expect(
      structure.nodes
        .map((node) => node.packageName)
        .filter((name): name is string => name !== undefined)
        .sort((left, right) =>
          Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
        ),
    ).toEqual(["@app/cli", "@app/core"]);
    assertNoCoordinates(structure);
  });

  it("drops outgoing imports of an unreadable file", () => {
    const reader = "src/reader.ts";
    const missing = "src/missing.ts";
    const graph = {
      name: "demo",
      files: [{ path: reader }, { path: missing }],
      units: [{ id: "u-reader", kind: "class" as const, name: "Reader", path: reader }],
      imports: [internal(missing, reader, "./reader"), internal(reader, missing, "./missing")],
      warnings: [{ path: missing, message: "unreadable: EACCES" }],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [{ path: "", name: "demo" }];
    const district = districtId("");
    const readerId = symbolBoxId(reader, "Reader");
    const missingId = fileBoxId(missing);
    const structure = compose(graph, packages);
    expect(structure.warnings).toEqual([{ path: missing, message: "unreadable: EACCES" }]);
    expect(structure.nodes.find((node) => node.id === missingId)).toMatchObject({
      kind: "box",
      name: "missing.ts",
      path: missing,
      parentId: district,
      unitKind: "file",
      mass: 1,
    });
    expect(structure.nodes.find((node) => node.id === readerId)).toMatchObject({
      kind: "box",
      name: "Reader",
      path: reader,
      unitKind: "class",
    });
    expect(structure.nodes.some((node) => node.name === "src" || node.path === "src")).toBe(false);
    expect(structure.nodes.filter((node) => node.kind === "portal")).toEqual([]);
    expect(structure.edges).toEqual([
      {
        id: edgeId(district, readerId, missingId),
        kind: "road",
        parentId: district,
        from: readerId,
        to: missingId,
        weight: 1,
      },
    ]);
    assertNoCoordinates(structure);
  });
});
