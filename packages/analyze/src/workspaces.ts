import * as fs from "node:fs";
import * as path from "node:path";
import type { Warning, WorkspacePackage } from "@sw3d/model";

interface Hit {
  declaredPath: string;
  realPath: string;
  name: string;
}

export function selectWorkspacePackages(hits: readonly Hit[]): {
  packages: WorkspacePackage[];
  fatal?: Warning;
} {
  const sorted = [...hits].sort((a, b) => compareUtf8(a.declaredPath, b.declaredPath));
  const chosen: Hit[] = [];
  const byReal = new Map<string, Hit>();
  for (const hit of sorted) {
    const existing = byReal.get(hit.realPath);
    if (existing) {
      if (existing.name !== hit.name) {
        return { packages: [], fatal: { path: hit.declaredPath, message: "disagreeing package name" } };
      }
      continue;
    }
    byReal.set(hit.realPath, hit);
    chosen.push(hit);
  }
  const byName = new Map<string, string>();
  for (const hit of chosen) {
    if (byName.has(hit.name)) {
      return {
        packages: [],
        fatal: { path: hit.declaredPath, message: `duplicate package name ${hit.name}` },
      };
    }
    byName.set(hit.name, hit.realPath);
  }
  return { packages: chosen.map((hit) => ({ path: hit.declaredPath, name: hit.name })) };
}

export function loadWorkspaces(root: string): { packages: WorkspacePackage[]; fatal?: Warning } {
  const manifestPath = path.join(root, "package.json");
  if (!fs.existsSync(manifestPath)) {
    return { packages: [{ path: "", name: path.basename(root) }] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  } catch {
    return { packages: [], fatal: { path: "package.json", message: "invalid package.json" } };
  }
  if (!isRecord(parsed)) {
    return { packages: [], fatal: { path: "package.json", message: "invalid package.json" } };
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, "workspaces")) {
    const name = typeof parsed["name"] === "string" ? parsed["name"] : path.basename(root);
    return { packages: [{ path: "", name }] };
  }
  const patterns = readWorkspacePatterns(parsed["workspaces"]);
  if ("fatal" in patterns) return { packages: [], fatal: patterns.fatal };
  const declaredPaths = patterns.patterns.flatMap((pattern) => expandPattern(root, pattern));
  declaredPaths.sort(compareUtf8);
  const hits: Hit[] = [];
  for (const declaredPath of declaredPaths) {
    const absolute = path.join(root, ...declaredPath.split("/"));
    const named = readPackageName(declaredPath, absolute);
    if ("fatal" in named) return { packages: [], fatal: named.fatal };
    let realPath: string;
    try {
      realPath = fs.realpathSync(absolute);
    } catch {
      return { packages: [], fatal: { path: `${declaredPath}/package.json`, message: "missing package.json" } };
    }
    hits.push({ declaredPath, realPath, name: named.name });
  }
  return selectWorkspacePackages(hits);
}

function readWorkspacePatterns(workspaces: unknown): { patterns: string[] } | { fatal: Warning } {
  if (Array.isArray(workspaces)) return readPatternArray(workspaces);
  if (isRecord(workspaces)) {
    if (!Array.isArray(workspaces["packages"])) {
      return { fatal: { path: "package.json", message: "invalid workspaces" } };
    }
    return readPatternArray(workspaces["packages"]);
  }
  return { fatal: { path: "package.json", message: "invalid workspaces" } };
}

function readPatternArray(entries: readonly unknown[]): { patterns: string[] } | { fatal: Warning } {
  const patterns: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string") {
      return { fatal: { path: "package.json", message: "invalid workspaces" } };
    }
    patterns.push(entry);
  }
  return { patterns };
}

function readPackageName(
  declaredPath: string,
  absoluteDir: string,
): { name: string } | { fatal: Warning } {
  const rel = `${declaredPath}/package.json`;
  const manifest = path.join(absoluteDir, "package.json");
  if (!fs.existsSync(manifest)) return { fatal: { path: rel, message: "missing package.json" } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, "utf8")) as unknown;
  } catch {
    return { fatal: { path: rel, message: "invalid package.json" } };
  }
  if (!isRecord(parsed) || typeof parsed["name"] !== "string") {
    return { fatal: { path: rel, message: "missing package name" } };
  }
  return { name: parsed["name"] };
}

function expandPattern(root: string, pattern: string): string[] {
  const segments = pattern.split("/").filter((segment) => segment.length > 0);
  const found: string[] = [];
  const stack = new Set<string>();

  const walk = (absolute: string, declared: string, index: number): void => {
    let real: string;
    try {
      real = fs.realpathSync(absolute);
    } catch {
      return;
    }
    if (stack.has(real)) return;
    stack.add(real);
    try {
      if (index >= segments.length) {
        if (declared !== "") found.push(declared);
        return;
      }
      const segment = segments[index];
      if (segment === undefined) return;
      if (segment === "**") {
        for (const name of listDirectories(absolute)) {
          const nextAbsolute = path.join(absolute, name);
          const nextDeclared = declared === "" ? name : `${declared}/${name}`;
          walk(nextAbsolute, nextDeclared, index + 1);
          walk(nextAbsolute, nextDeclared, index);
        }
        return;
      }
      if (segment.includes("*") || segment.includes("?")) {
        const matcher = segmentToRegExp(segment);
        for (const name of listDirectories(absolute)) {
          if (!matcher.test(name)) continue;
          const nextDeclared = declared === "" ? name : `${declared}/${name}`;
          walk(path.join(absolute, name), nextDeclared, index + 1);
        }
        return;
      }
      const nextAbsolute = path.join(absolute, segment);
      try {
        if (!fs.statSync(nextAbsolute).isDirectory()) return;
      } catch {
        return;
      }
      const nextDeclared = declared === "" ? segment : `${declared}/${segment}`;
      walk(nextAbsolute, nextDeclared, index + 1);
    } finally {
      stack.delete(real);
    }
  };

  walk(root, "", 0);
  return found;
}

function listDirectories(absolute: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absolute, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    try {
      if (fs.statSync(path.join(absolute, entry.name)).isDirectory()) names.push(entry.name);
    } catch {
      continue;
    }
  }
  names.sort(compareUtf8);
  return names;
}

function segmentToRegExp(segment: string): RegExp {
  let source = "^";
  for (const char of segment) {
    if (char === "*") source += ".*";
    else if (char === "?") source += ".";
    else source += char.replace(/[\\^$+?.()|[\]{}]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareUtf8(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a), Buffer.from(b));
}
