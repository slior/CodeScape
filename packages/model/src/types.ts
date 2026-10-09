export interface Warning {
  path: string;
  message: string;
}

export interface WorkspacePackage {
  path: string;
  name: string;
}

export interface CodeFile {
  path: string;
}

export interface CodeUnit {
  id: string;
  kind: "class" | "interface" | "type" | "enum";
  name: string;
  path: string;
}

export interface ImportFact {
  fromFile: string;
  specifier: string;
  target:
    | { kind: "internal"; file: string }
    | { kind: "external"; name: string };
}

export interface CodeGraph {
  name: string;
  files: CodeFile[];
  units: CodeUnit[];
  imports: ImportFact[];
  warnings: Warning[];
}

export interface ParseInput {
  root: string;
  files: readonly { path: string; text: string }[];
  includedPaths: readonly string[];
  packages: readonly WorkspacePackage[];
}

export interface ParseResult {
  files: CodeGraph["files"];
  units: CodeUnit[];
  imports: ImportFact[];
  warnings: Warning[];
}

export interface SourceParser {
  readonly id: string;
  readonly defaultIgnore: readonly string[];
  parse(input: ParseInput): ParseResult;
}

export interface Pose {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export interface Node {
  id: string;
  kind: "city" | "district" | "building" | "box" | "portal";
  name: string;
  parentId: string | null;
  path: string;
  unitKind?: "file" | "class" | "interface" | "type" | "enum";
  packageName?: string;
  mass: number;
  pose: Pose;
}

export interface Edge {
  id: string;
  kind: "road" | "portal";
  parentId: string;
  from: string;
  to: string;
  weight: number;
  points: Array<{ x: number; z: number }>;
}

export interface World {
  version: 1;
  name: string;
  nodes: Node[];
  edges: Edge[];
  warnings: Warning[];
}

export interface CityNode {
  id: string;
  kind: Node["kind"];
  name: string;
  parentId: string | null;
  path: string;
  unitKind?: Node["unitKind"];
  packageName?: string;
  mass: number;
}

export interface CityEdge {
  id: string;
  kind: Edge["kind"];
  parentId: string;
  from: string;
  to: string;
  weight: number;
}

export interface CityStructure {
  version: 1;
  name: string;
  nodes: CityNode[];
  edges: CityEdge[];
  warnings: Warning[];
}

export interface SnapshotOptions {
  folder: string;
  out: string;
  config?: string;
  ignore: readonly string[];
  open: boolean;
}

export interface SnapshotResult {
  outDir: string;
}

export interface ViewOptions {
  dir: string;
}
