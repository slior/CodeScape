import * as fs from "node:fs";
import * as path from "node:path";
import type { Warning, WorkspacePackage } from "@sw3d/model";
import { isIgnored } from "./ignore.js";

export interface WalkFile {
  path: string;
  realPath: string;
}

export interface WalkResult {
  included: WalkFile[];
  unreadable: Warning[];
  outsideSymlinks: Warning[];
}

interface PackageRoot {
  declaredPath: string;
  realRoot: string;
}

export function walkSource(
  root: string,
  patterns: readonly string[],
  packages: readonly WorkspacePackage[],
): WalkResult {
  const rootReal = fs.realpathSync(root);
  const packageRoots: PackageRoot[] = packages.map((pkg) => ({
    declaredPath: pkg.path,
    realRoot: fs.realpathSync(pkg.path === "" ? root : path.join(root, ...pkg.path.split("/"))),
  }));
  const result: WalkResult = { included: [], unreadable: [], outsideSymlinks: [] };
  const seen = new Set<string>([rootReal]);
  const stack = new Set<string>([rootReal]);

  const warnUnreadableDirectory = (absoluteDir: string): void => {
    let dirReal: string;
    try {
      dirReal = fs.realpathSync(absoluteDir);
    } catch {
      return;
    }
    const owner = owningPackage(dirReal, packageRoots);
    if (!owner) return;
    result.unreadable.push({ path: storedPath(dirReal, owner), message: "unreadable" });
  };

  const visit = (traversalDir: string): void => {
    const absoluteDir = traversalDir === "" ? root : path.join(root, ...traversalDir.split("/"));
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch {
      warnUnreadableDirectory(absoluteDir);
      return;
    }
    entries.sort((a, b) => compareUtf8(a.name, b.name));
    for (const entry of entries) {
      const traversal = traversalDir === "" ? entry.name : `${traversalDir}/${entry.name}`;
      const absolute = path.join(absoluteDir, entry.name);
      let realFile: string;
      try {
        realFile = fs.realpathSync(absolute);
      } catch {
        if (!isSourceName(entry.name)) continue;
        let parentReal: string;
        try {
          parentReal = fs.realpathSync(absoluteDir);
        } catch {
          continue;
        }
        const owner = owningPackage(parentReal, packageRoots);
        if (!owner) continue;
        const stored = unresolvedStoredPath(parentReal, owner, entry.name);
        if (isIgnored(traversal, stored, patterns, false)) continue;
        result.unreadable.push({ path: stored, message: "unreadable" });
        continue;
      }
      if (stack.has(realFile) || seen.has(realFile)) continue;
      seen.add(realFile);
      if (realFile !== rootReal && !realFile.startsWith(`${rootReal}${path.sep}`)) {
        result.outsideSymlinks.push({ path: traversal, message: "symlink outside root" });
        continue;
      }
      const canonical = canonicalOf(realFile, packageRoots, rootReal);
      let directory = false;
      try {
        directory = fs.statSync(realFile).isDirectory();
      } catch {
        if (
          owningPackage(realFile, packageRoots) &&
          !isIgnored(traversal, canonical, patterns, false) &&
          isSourceName(path.basename(realFile))
        ) {
          result.unreadable.push({ path: canonical, message: "unreadable" });
        }
        continue;
      }
      if (isIgnored(traversal, canonical, patterns, directory)) continue;
      if (directory) {
        stack.add(realFile);
        visit(traversal);
        stack.delete(realFile);
        continue;
      }
      if (!isSourceName(path.basename(realFile))) continue;
      const owner = owningPackage(realFile, packageRoots);
      if (!owner) continue;
      const stored = storedPath(realFile, owner);
      try {
        fs.readFileSync(realFile);
      } catch {
        result.unreadable.push({ path: stored, message: "unreadable" });
        continue;
      }
      result.included.push({ path: stored, realPath: realFile });
    }
  };

  visit("");
  return result;
}

function canonicalOf(realFile: string, roots: readonly PackageRoot[], rootReal: string): string {
  const owner = owningPackage(realFile, roots);
  if (owner) return storedPath(realFile, owner);
  return repoRelative(rootReal, realFile);
}

function owningPackage(realFile: string, roots: readonly PackageRoot[]): PackageRoot | undefined {
  let best: PackageRoot | undefined;
  for (const pkg of roots) {
    if (realFile !== pkg.realRoot && !realFile.startsWith(`${pkg.realRoot}${path.sep}`)) continue;
    if (
      !best ||
      pkg.realRoot.length > best.realRoot.length ||
      (pkg.realRoot.length === best.realRoot.length && compareUtf8(pkg.declaredPath, best.declaredPath) < 0)
    ) {
      best = pkg;
    }
  }
  return best;
}

function storedPath(realFile: string, owner: PackageRoot): string {
  const suffix = path.relative(owner.realRoot, realFile).split(path.sep).join("/");
  if (owner.declaredPath === "") return suffix;
  if (suffix === "") return owner.declaredPath;
  return `${owner.declaredPath}/${suffix}`;
}

function unresolvedStoredPath(parentReal: string, owner: PackageRoot, name: string): string {
  const parentStored = storedPath(parentReal, owner);
  if (parentStored === "") return name;
  return `${parentStored}/${name}`;
}

function repoRelative(rootReal: string, realFile: string): string {
  return path.relative(rootReal, realFile).split(path.sep).join("/");
}

function isSourceName(name: string): boolean {
  if (name.endsWith(".d.ts")) return false;
  return name.endsWith(".ts") || name.endsWith(".tsx");
}

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
