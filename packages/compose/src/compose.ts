import { buildingId, cityId, districtId, fileBoxId, symbolBoxId } from "@sw3d/model";
import type {
  CityStructure,
  CodeGraph,
  CodeUnit,
  Node,
  Warning,
  WorkspacePackage,
} from "@sw3d/model";

export class EmptySourceError extends Error {
  constructor() {
    super("No included source files remain after ignore and workspace ownership");
    this.name = "EmptySourceError";
  }
}

type CityNode = Omit<Node, "pose">;

export function compose(
  graph: CodeGraph,
  packages: readonly WorkspacePackage[],
): CityStructure {
  const filesByPackage = assignFiles(
    graph.files.map((file) => file.path),
    packages,
  );
  let included = 0;
  for (const list of filesByPackage.values()) included += list.length;
  if (included === 0) throw new EmptySourceError();

  const unitsByFile = groupUnits(graph.units);
  const nodes: CityNode[] = [];
  const city: CityNode = {
    id: cityId(graph.name),
    kind: "city",
    name: graph.name,
    parentId: null,
    path: "",
    mass: 0,
  };
  nodes.push(city);

  for (const packagePath of [...filesByPackage.keys()].sort(compareUtf8)) {
    const filePaths = filesByPackage.get(packagePath);
    const pkg = packages.find((item) => item.path === packagePath);
    if (!filePaths || filePaths.length === 0 || !pkg) continue;
    const createdBuildings = new Set<string>();
    const district: CityNode = {
      id: districtId(pkg.path),
      kind: "district",
      name: pkg.path === "" ? graph.name : basename(pkg.path),
      parentId: city.id,
      path: pkg.path,
      packageName: pkg.name,
      mass: 0,
    };
    nodes.push(district);

    for (const filePath of [...filePaths].sort(compareUtf8)) {
      let parentId = district.id;
      for (const folderPath of buildingPaths(filePath, pkg.path)) {
        const id = buildingId(folderPath);
        if (!createdBuildings.has(id)) {
          createdBuildings.add(id);
          nodes.push({
            id,
            kind: "building",
            name: basename(folderPath),
            parentId,
            path: folderPath,
            mass: 0,
          });
        }
        parentId = id;
      }
      addFileNodes(nodes, filePath, parentId, unitsByFile.get(filePath) ?? []);
    }
  }

  assignMass(nodes);
  nodes.sort(comparePathThenId);
  const warnings = [...graph.warnings].sort(compareWarnings);
  return { version: 1, name: graph.name, nodes, edges: [], warnings };
}

function addFileNodes(
  nodes: CityNode[],
  filePath: string,
  parentId: string,
  units: readonly CodeUnit[],
): void {
  const only = units.length === 1 ? units[0] : undefined;
  if (units.length >= 2) {
    const id = buildingId(filePath);
    nodes.push({
      id,
      kind: "building",
      name: basename(filePath),
      parentId,
      path: filePath,
      mass: 0,
    });
    const ordered = [...units].sort((left, right) => compareUtf8(left.name, right.name));
    for (const unit of ordered) nodes.push(symbolBox(filePath, unit, id));
    return;
  }
  if (only) {
    nodes.push(symbolBox(filePath, only, parentId));
    return;
  }
  nodes.push({
    id: fileBoxId(filePath),
    kind: "box",
    name: basename(filePath),
    parentId,
    path: filePath,
    unitKind: "file",
    mass: 1,
  });
}

function symbolBox(filePath: string, unit: CodeUnit, parentId: string): CityNode {
  return {
    id: symbolBoxId(filePath, unit.name),
    kind: "box",
    name: unit.name,
    parentId,
    path: filePath,
    unitKind: unit.kind,
    mass: 1,
  };
}

function assignFiles(
  filePaths: readonly string[],
  packages: readonly WorkspacePackage[],
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const filePath of filePaths) {
    const owner = ownerOf(filePath, packages);
    if (!owner) continue;
    const list = grouped.get(owner.path);
    if (list) list.push(filePath);
    else grouped.set(owner.path, [filePath]);
  }
  return grouped;
}

function ownerOf(
  filePath: string,
  packages: readonly WorkspacePackage[],
): WorkspacePackage | undefined {
  let best: WorkspacePackage | undefined;
  for (const pkg of packages) {
    if (!isInsidePackage(filePath, pkg.path)) continue;
    if (
      best === undefined ||
      pkg.path.length > best.path.length ||
      (pkg.path.length === best.path.length && compareUtf8(pkg.path, best.path) < 0)
    ) {
      best = pkg;
    }
  }
  return best;
}

function isInsidePackage(filePath: string, packagePath: string): boolean {
  if (packagePath === "") return true;
  return filePath === packagePath || filePath.startsWith(`${packagePath}/`);
}

function buildingPaths(filePath: string, packagePath: string): string[] {
  const relative = packagePath === "" ? filePath : filePath.slice(packagePath.length + 1);
  const segments = relative.split("/");
  segments.pop();
  const start = segments[0] === "src" ? 1 : 0;
  const paths: string[] = [];
  for (let index = start; index < segments.length; index += 1) {
    const relativeDir = segments.slice(0, index + 1).join("/");
    paths.push(packagePath === "" ? relativeDir : `${packagePath}/${relativeDir}`);
  }
  return paths;
}

function groupUnits(units: readonly CodeUnit[]): Map<string, CodeUnit[]> {
  const grouped = new Map<string, CodeUnit[]>();
  for (const unit of units) {
    const list = grouped.get(unit.path);
    if (list) list.push(unit);
    else grouped.set(unit.path, [unit]);
  }
  return grouped;
}

function assignMass(nodes: CityNode[]): void {
  const childrenByParent = new Map<string, CityNode[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const siblings = childrenByParent.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parentId, [node]);
  }
  const memo = new Map<string, number>();
  const walk = (node: CityNode): number => {
    const cached = memo.get(node.id);
    if (cached !== undefined) return cached;
    let total = 0;
    if (node.kind === "box") total = 1;
    else if (node.kind !== "portal") {
      const children = childrenByParent.get(node.id) ?? [];
      for (const child of children) {
        if (child.kind === "portal") continue;
        total += walk(child);
      }
    }
    memo.set(node.id, total);
    node.mass = total;
    return total;
  };
  for (const node of nodes) walk(node);
}

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function comparePathThenId(
  left: { path: string; id: string },
  right: { path: string; id: string },
): number {
  return compareUtf8(left.path, right.path) || compareUtf8(left.id, right.id);
}

function compareWarnings(left: Warning, right: Warning): number {
  return compareUtf8(left.path, right.path) || compareUtf8(left.message, right.message);
}
