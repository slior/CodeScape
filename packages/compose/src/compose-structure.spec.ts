import { describe, expect, it } from "@jest/globals";
import {
  buildingId,
  cityId,
  districtId,
  fileBoxId,
  symbolBoxId,
} from "@sw3d/model";
import type { CityStructure, CodeGraph, Node, WorkspacePackage } from "@sw3d/model";
import { compose, EmptySourceError } from "./compose.js";
import {
  compose as composeExport,
  EmptySourceError as EmptySourceErrorExport,
} from "./index.js";

type CityNode = Omit<Node, "pose">;

function byPathThenId(
  left: { path: string; id: string },
  right: { path: string; id: string },
): number {
  const path = Buffer.compare(Buffer.from(left.path, "utf8"), Buffer.from(right.path, "utf8"));
  if (path !== 0) return path;
  return Buffer.compare(Buffer.from(left.id, "utf8"), Buffer.from(right.id, "utf8"));
}

function cityNode(id: string, name: string, mass: number): CityNode {
  return { id, kind: "city", name, parentId: null, path: "", mass };
}

function districtNode(
  id: string,
  name: string,
  parentId: string,
  path: string,
  packageName: string,
  mass: number,
): CityNode {
  return { id, kind: "district", name, parentId, path, packageName, mass };
}

function buildingNode(
  id: string,
  name: string,
  parentId: string,
  path: string,
  mass: number,
): CityNode {
  return { id, kind: "building", name, parentId, path, mass };
}

function boxNode(
  id: string,
  name: string,
  parentId: string,
  path: string,
  unitKind: "file" | "class" | "interface" | "type" | "enum",
): CityNode {
  return { id, kind: "box", name, parentId, path, unitKind, mass: 1 };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("compose structure", () => {
  it("throws EmptySourceError when no owned source file remains", () => {
    const packages: readonly WorkspacePackage[] = [{ path: "", name: "demo" }];
    const empty: CodeGraph = {
      name: "demo",
      files: [],
      units: [],
      imports: [],
      warnings: [],
    };
    expect(() => compose(empty, packages)).toThrow(EmptySourceError);
    expect(() => compose(empty, packages)).toThrow(
      "No included source files remain after ignore and workspace ownership",
    );

    const outside: CodeGraph = {
      name: "demo",
      files: [{ path: "root.ts" }],
      units: [],
      imports: [],
      warnings: [],
    };
    expect(() =>
      compose(outside, [{ path: "packages/core", name: "@demo/core" }]),
    ).toThrow(EmptySourceError);
  });

  it("labels the only district with the folder basename", () => {
    const graph = {
      name: "demo",
      files: [{ path: "src/only.ts" }],
      units: [{ id: "u-only", kind: "class" as const, name: "Only", path: "src/only.ts" }],
      imports: [],
      warnings: [],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [{ path: "", name: "@demo/lib" }];
    const rootId = cityId("demo");
    const district = districtId("");
    const nodes = [
      cityNode(rootId, "demo", 1),
      districtNode(district, "demo", rootId, "", "@demo/lib", 1),
      boxNode(symbolBoxId("src/only.ts", "Only"), "Only", district, "src/only.ts", "class"),
    ].sort(byPathThenId);
    const structure = compose(graph, packages);
    expect(structure.nodes.some((node) => node.name === "src" || node.path === "src")).toBe(
      false,
    );
    expect(structure).toEqual({
      version: 1,
      name: "demo",
      nodes,
      edges: [],
      warnings: [],
    } satisfies CityStructure);
  });

  it("builds the containment tree for workspace packages", () => {
    const architectPath = "packages/core/src/agents/prompts/architect-prompts.ts";
    const rolePath = "packages/core/src/agents/role-based-agent.ts";
    const phasePath = "packages/core/src/state-machine.ts";
    const indexPath = "packages/core/src/index.ts";
    const brokenPath = "packages/core/src/broken.ts";
    const anonPath = "packages/core/src/anon.ts";
    const tokenPath = "packages/core/src/types/token.ts";
    const helperPath = "packages/core/lib/helper.ts";
    const optionsPath = "packages/cli/src/options.ts";
    const graph = {
      name: "dialectic",
      files: [
        { path: architectPath },
        { path: rolePath },
        { path: phasePath },
        { path: indexPath },
        { path: brokenPath },
        { path: anonPath },
        { path: tokenPath },
        { path: helperPath },
        { path: optionsPath },
        { path: "root.ts" },
      ],
      units: [
        { id: "u-architect", kind: "class" as const, name: "ArchitectPrompts", path: architectPath },
        { id: "u-role-class", kind: "class" as const, name: "RoleBasedAgent", path: rolePath },
        { id: "u-role-iface", kind: "interface" as const, name: "Role", path: rolePath },
        { id: "u-phase", kind: "enum" as const, name: "Phase", path: phasePath },
        { id: "u-default", kind: "class" as const, name: "default", path: anonPath },
        { id: "u-token", kind: "interface" as const, name: "Token", path: tokenPath },
        { id: "u-options", kind: "type" as const, name: "CliOptions", path: optionsPath },
      ],
      imports: [],
      warnings: [
        { path: brokenPath, message: "unreadable: EACCES" },
        { path: optionsPath, message: "note" },
      ],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [
      { path: "packages/core", name: "@dialectic/core" },
      { path: "packages/cli", name: "@dialectic/cli" },
      { path: "packages/empty", name: "@dialectic/empty" },
    ];
    const rootId = cityId("dialectic");
    const cliId = districtId("packages/cli");
    const coreId = districtId("packages/core");
    const libId = buildingId("packages/core/lib");
    const agentsId = buildingId("packages/core/src/agents");
    const promptsId = buildingId("packages/core/src/agents/prompts");
    const roleId = buildingId(rolePath);
    const typesId = buildingId("packages/core/src/types");
    const nodes = [
      cityNode(rootId, "dialectic", 10),
      districtNode(cliId, "cli", rootId, "packages/cli", "@dialectic/cli", 1),
      boxNode(symbolBoxId(optionsPath, "CliOptions"), "CliOptions", cliId, optionsPath, "type"),
      districtNode(coreId, "core", rootId, "packages/core", "@dialectic/core", 9),
      buildingNode(libId, "lib", coreId, "packages/core/lib", 1),
      boxNode(fileBoxId(helperPath), "helper.ts", libId, helperPath, "file"),
      buildingNode(agentsId, "agents", coreId, "packages/core/src/agents", 3),
      buildingNode(promptsId, "prompts", agentsId, "packages/core/src/agents/prompts", 1),
      boxNode(
        symbolBoxId(architectPath, "ArchitectPrompts"),
        "ArchitectPrompts",
        promptsId,
        architectPath,
        "class",
      ),
      buildingNode(roleId, "role-based-agent.ts", agentsId, rolePath, 2),
      boxNode(symbolBoxId(rolePath, "Role"), "Role", roleId, rolePath, "interface"),
      boxNode(
        symbolBoxId(rolePath, "RoleBasedAgent"),
        "RoleBasedAgent",
        roleId,
        rolePath,
        "class",
      ),
      boxNode(symbolBoxId(anonPath, "default"), "default", coreId, anonPath, "class"),
      boxNode(fileBoxId(brokenPath), "broken.ts", coreId, brokenPath, "file"),
      boxNode(fileBoxId(indexPath), "index.ts", coreId, indexPath, "file"),
      boxNode(symbolBoxId(phasePath, "Phase"), "Phase", coreId, phasePath, "enum"),
      buildingNode(typesId, "types", coreId, "packages/core/src/types", 1),
      boxNode(symbolBoxId(tokenPath, "Token"), "Token", typesId, tokenPath, "interface"),
    ].sort(byPathThenId);
    const expected: CityStructure = {
      version: 1,
      name: "dialectic",
      nodes,
      edges: [],
      warnings: [
        { path: optionsPath, message: "note" },
        { path: brokenPath, message: "unreadable: EACCES" },
      ],
    };
    const structure = compose(graph, packages);
    expect(structure.nodes.some((node) => node.name === "src")).toBe(false);
    expect(structure.nodes.some((node) => node.path === "packages/core/src")).toBe(false);
    expect(structure.nodes.some((node) => node.path === "packages/cli/src")).toBe(false);
    expect(structure.nodes.some((node) => node.packageName === "@dialectic/empty")).toBe(false);
    expect(structure.nodes.some((node) => node.path === "root.ts")).toBe(false);
    expect(structure.nodes.find((node) => node.name === "ArchitectPrompts")?.path).toBe(
      architectPath,
    );
    expect(structure.nodes).toHaveLength(expected.nodes.length);
    expect(structure).toEqual(expected);
    expect(compose(graph, packages)).toEqual(structure);
    for (const node of structure.nodes) expect(node).not.toHaveProperty("pose");
    for (const edge of structure.edges) expect(edge).not.toHaveProperty("points");
  });

  it("gives an overlapping file to the longest package prefix", () => {
    const coreFile = "pkg/core/src/a.ts";
    const trap = "pkg/core-extra/a.ts";
    const util = "pkg/util.ts";
    const graph = {
      name: "repo",
      files: [{ path: coreFile }, { path: trap }, { path: util }, { path: "outside.ts" }],
      units: [{ id: "u-a", kind: "class" as const, name: "A", path: coreFile }],
      imports: [],
      warnings: [],
    } satisfies CodeGraph;
    const packages: readonly WorkspacePackage[] = [
      { path: "pkg", name: "outer" },
      { path: "pkg/core", name: "@app/core" },
      { path: "pkg/empty", name: "@app/empty" },
    ];
    const rootId = cityId("repo");
    const outerId = districtId("pkg");
    const coreId = districtId("pkg/core");
    const trapId = buildingId("pkg/core-extra");
    const nodes = [
      cityNode(rootId, "repo", 3),
      districtNode(outerId, "pkg", rootId, "pkg", "outer", 2),
      buildingNode(trapId, "core-extra", outerId, "pkg/core-extra", 1),
      boxNode(fileBoxId(trap), "a.ts", trapId, trap, "file"),
      boxNode(fileBoxId(util), "util.ts", outerId, util, "file"),
      districtNode(coreId, "core", rootId, "pkg/core", "@app/core", 1),
      boxNode(symbolBoxId(coreFile, "A"), "A", coreId, coreFile, "class"),
    ].sort(byPathThenId);
    const structure = compose(graph, packages);
    expect(structure.nodes.some((node) => node.path === "outside.ts")).toBe(false);
    expect(structure.nodes.some((node) => node.packageName === "@app/empty")).toBe(false);
    expect(structure.nodes.some((node) => node.name === "src" || node.path === "pkg/core/src")).toBe(
      false,
    );
    expect(structure).toEqual({
      version: 1,
      name: "repo",
      nodes,
      edges: [],
      warnings: [],
    } satisfies CityStructure);
  });

  it("re-exports compose and EmptySourceError", () => {
    expect(composeExport).toBe(compose);
    expect(EmptySourceErrorExport).toBe(EmptySourceError);
  });

  it("leaves its inputs unchanged", () => {
    const graph: CodeGraph = {
      name: "demo",
      files: [{ path: "src/a.ts" }],
      units: [{ id: "u", kind: "class", name: "A", path: "src/a.ts" }],
      imports: [],
      warnings: [{ path: "z.ts", message: "second" }, { path: "a.ts", message: "first" }],
    };
    const packages: WorkspacePackage[] = [{ path: "", name: "demo" }];
    expect(() => compose(deepFreeze(graph), deepFreeze(packages))).not.toThrow();
  });
});
