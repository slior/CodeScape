import type { Edge, Node, Warning, World } from "./types.js";

function roundCoord(value: number): number {
  if (!Number.isFinite(value)) throw new Error("coordinate is not finite");
  const sign = value < 0 ? -1 : 1;
  const rounded = Math.floor(Math.abs(value) * 100 + 0.5 + 1e-9);
  const result = (sign * rounded) / 100;
  return result === 0 ? 0 : result;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function compareNode(left: Node, right: Node): number {
  const byPath = compareUtf8(left.path, right.path);
  return byPath === 0 ? compareUtf8(left.id, right.id) : byPath;
}

function compareEdge(left: Edge, right: Edge): number {
  return (
    compareUtf8(left.parentId, right.parentId) ||
    compareUtf8(left.from, right.from) ||
    compareUtf8(left.to, right.to) ||
    compareUtf8(left.kind, right.kind)
  );
}

function compareWarning(left: Warning, right: Warning): number {
  const byPath = compareUtf8(left.path, right.path);
  return byPath === 0 ? compareUtf8(left.message, right.message) : byPath;
}

function serializeNode(node: Node): Record<string, unknown> {
  const pose = {
    x: roundCoord(node.pose.x),
    z: roundCoord(node.pose.z),
    width: roundCoord(node.pose.width),
    depth: roundCoord(node.pose.depth),
    height: roundCoord(node.pose.height),
  };
  const out: Record<string, unknown> = {
    id: node.id,
    kind: node.kind,
    name: node.name,
    parentId: node.parentId,
    path: node.path,
  };
  if (node.unitKind !== undefined) out["unitKind"] = node.unitKind;
  if (node.packageName !== undefined) out["packageName"] = node.packageName;
  out["mass"] = node.mass;
  out["pose"] = pose;
  return out;
}

function serializeEdge(edge: Edge): Record<string, unknown> {
  return {
    id: edge.id,
    kind: edge.kind,
    parentId: edge.parentId,
    from: edge.from,
    to: edge.to,
    weight: edge.weight,
    points: edge.points.map((point) => ({
      x: roundCoord(point.x),
      z: roundCoord(point.z),
    })),
  };
}

export function serializeWorld(world: World): string {
  const payload = {
    version: world.version,
    name: world.name,
    nodes: [...world.nodes].sort(compareNode).map(serializeNode),
    edges: [...world.edges].sort(compareEdge).map(serializeEdge),
    warnings: [...world.warnings].sort(compareWarning).map((warning) => ({
      path: warning.path,
      message: warning.message,
    })),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
