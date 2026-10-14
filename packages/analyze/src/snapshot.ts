import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compose, EmptySourceError } from "@sw3d/compose";
import { layout } from "@sw3d/layout";
import {
  serializeWorld,
  type CodeFile,
  type CodeGraph,
  type SnapshotOptions,
  type SnapshotResult,
  type Warning,
  type WorkspacePackage,
  type World,
} from "@sw3d/model";
import { createTypeScriptParser } from "@sw3d/parser-typescript";
import { loadConfig } from "./config.js";
import { SnapshotFatal } from "./fatal.js";
import { mergeIgnorePatterns } from "./ignore.js";
import { publishSnapshot } from "./publish.js";
import { walkSource } from "./walk.js";
import { loadWorkspaces } from "./workspaces.js";

export function defaultViewerDist(): string {
  return path.resolve(fileURLToPath(new URL("../../viewer/dist", import.meta.url)));
}

function assertFolder(folder: string): string {
  const root = path.resolve(folder);
  try {
    const stat = fs.statSync(root);
    fs.accessSync(root, fs.constants.R_OK);
    if (!stat.isDirectory()) throw new SnapshotFatal(`folder is missing or unreadable: ${root}`);
  } catch (error) {
    if (error instanceof SnapshotFatal) throw error;
    throw new SnapshotFatal(`folder is missing or unreadable: ${root}`);
  }
  return root;
}

function resolvedRealPath(target: string): string {
  const absolute = path.resolve(target);
  const missing: string[] = [];
  let current = absolute;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new SnapshotFatal(`--out is missing or unreadable: ${absolute}`);
    missing.push(path.basename(current));
    current = parent;
  }
  let real: string;
  try {
    real = fs.realpathSync(current);
  } catch {
    throw new SnapshotFatal(`--out is missing or unreadable: ${absolute}`);
  }
  return path.join(real, ...missing.reverse());
}

function isSameOrInside(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  if (relative === "") return true;
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relative);
}

function assertOutOutsideFolder(root: string, outAbs: string): void {
  const rootReal = fs.realpathSync(root);
  const outReal = resolvedRealPath(outAbs);
  if (isSameOrInside(outReal, rootReal)) {
    throw new SnapshotFatal("--out must not be the analyzed folder or a path inside it");
  }
}

function readWorkspaces(root: string): WorkspacePackage[] {
  let loaded: { packages: WorkspacePackage[]; fatal?: Warning };
  try {
    loaded = loadWorkspaces(root);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SnapshotFatal(message);
  }
  if (loaded.fatal) throw new SnapshotFatal(loaded.fatal.message);
  return loaded.packages;
}

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUtf8);
}

function mergeWarnings(...groups: readonly (readonly Warning[])[]): Warning[] {
  const seen = new Set<string>();
  const out: Warning[] = [];
  for (const group of groups) {
    for (const warning of group) {
      const key = `${warning.path}\0${warning.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ path: warning.path, message: warning.message });
    }
  }
  out.sort((a, b) => compareUtf8(a.path, b.path) || compareUtf8(a.message, b.message));
  return out;
}

function stageBuiltViewer(stagingDir: string, viewerDist: string): void {
  const assetsSrc = path.join(viewerDist, "assets");
  const indexSrc = path.join(viewerDist, "index.html");
  let assetNames: string[];
  try {
    assetNames = fs.readdirSync(assetsSrc);
  } catch {
    throw new SnapshotFatal("viewer build is missing; run nx build viewer");
  }
  if (!fs.existsSync(indexSrc) || assetNames.length === 0) {
    throw new SnapshotFatal("viewer build is missing; run nx build viewer");
  }
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.cpSync(assetsSrc, path.join(stagingDir, "assets"), { recursive: true });
  fs.copyFileSync(indexSrc, path.join(stagingDir, "index.html"));
}

function assertStaging(staging: string): void {
  const indexPath = path.join(staging, "index.html");
  const worldPath = path.join(staging, "world.json");
  const assetsPath = path.join(staging, "assets");
  if (!fs.existsSync(indexPath) || !fs.existsSync(worldPath) || !fs.existsSync(assetsPath)) {
    throw new SnapshotFatal("staging validation failed");
  }
  if (fs.readdirSync(assetsPath).length === 0) throw new SnapshotFatal("staging validation failed");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(worldPath, "utf8"));
  } catch {
    throw new SnapshotFatal("staging validation failed");
  }
  if (!parsed || typeof parsed !== "object" || !("version" in parsed) || (parsed as { version: unknown }).version !== 1) {
    throw new SnapshotFatal("staging validation failed");
  }
}

function sourceBasename(storedPath: string): string {
  const slash = storedPath.lastIndexOf("/");
  return slash === -1 ? storedPath : storedPath.slice(slash + 1);
}

function isSourceBasename(storedPath: string): boolean {
  const name = sourceBasename(storedPath);
  if (name.endsWith(".d.ts")) return false;
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

function isUnreadableSourceFile(root: string, storedPath: string): boolean {
  if (!isSourceBasename(storedPath)) return false;
  const absolute = path.join(root, ...storedPath.split("/"));
  try {
    return !fs.statSync(absolute).isDirectory();
  } catch {
    return true;
  }
}

function runSnapshot(options: SnapshotOptions, viewerDist: string): SnapshotResult {
  const root = assertFolder(options.folder);
  const outAbs = path.resolve(options.out);
  assertOutOutsideFolder(root, outAbs);
  const config = loadConfig(root, options.config);
  const parser = createTypeScriptParser();
  const patterns = mergeIgnorePatterns(parser.defaultIgnore, config, options.ignore);
  const packages = readWorkspaces(root);
  const walked = walkSource(root, patterns, packages);
  const readable: { path: string; text: string }[] = [];
  const unread: Warning[] = [];
  const directoryWarnings: Warning[] = [];
  for (const warning of walked.unreadable) {
    const message = warning.message.startsWith("unreadable") ? warning.message : `unreadable: ${warning.message}`;
    const normalized = { path: warning.path, message };
    if (isUnreadableSourceFile(root, warning.path)) unread.push(normalized);
    else directoryWarnings.push(normalized);
  }
  for (const file of walked.included) {
    try {
      readable.push({ path: file.path, text: fs.readFileSync(file.realPath, "utf8") });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      unread.push({ path: file.path, message: `unreadable: ${detail}` });
    }
  }
  if (readable.length + unread.length === 0) throw new SnapshotFatal("no included source files");
  const includedPaths = uniqueSorted([...walked.included.map((file) => file.path), ...unread.map((warning) => warning.path)]);
  const parsed = parser.parse({ root, files: readable, includedPaths, packages });
  const files: CodeFile[] = [...parsed.files];
  for (const warning of unread) {
    if (!files.some((file) => file.path === warning.path)) files.push({ path: warning.path });
  }
  files.sort((a, b) => compareUtf8(a.path, b.path));
  const warnings = mergeWarnings(parsed.warnings, unread, directoryWarnings, walked.outsideSymlinks);
  const graph: CodeGraph = {
    name: path.basename(root),
    files,
    units: [...parsed.units],
    imports: [...parsed.imports],
    warnings,
  };
  let city: ReturnType<typeof compose>;
  try {
    city = compose(graph, packages);
  } catch (error) {
    if (error instanceof EmptySourceError || (error instanceof Error && error.name === "EmptySourceError")) {
      throw new SnapshotFatal(error.message);
    }
    throw error;
  }
  const laid = layout(city);
  const world: World = { ...laid, warnings: mergeWarnings(laid.warnings, graph.warnings) };
  for (const warning of world.warnings) console.error(`${warning.path}: ${warning.message}`);

  const parent = path.dirname(outAbs);
  fs.mkdirSync(parent, { recursive: true });
  const staging = path.join(parent, `.sw3d-staging-${process.pid}-${randomBytes(6).toString("hex")}`);
  try {
    stageBuiltViewer(staging, viewerDist);
    fs.writeFileSync(path.join(staging, "world.json"), serializeWorld(world));
    assertStaging(staging);
    publishSnapshot(staging, outAbs);
  } catch (error) {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return { outDir: outAbs };
}

export function snapshot(options: SnapshotOptions): SnapshotResult {
  return runSnapshot(options, defaultViewerDist());
}

export function snapshotWithHooks(options: SnapshotOptions, hooks?: { viewerDist?: string }): SnapshotResult {
  return runSnapshot(options, hooks?.viewerDist ?? defaultViewerDist());
}
