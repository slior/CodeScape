import type { ParseInput, WorkspacePackage } from "@sw3d/model";

export function resolveSpecifier(
  specifier: string,
  fromFile: string,
  input: ParseInput,
):
  | { kind: "internal"; file: string }
  | { kind: "external"; name: string }
  | { kind: "drop"; message: string } {
  const included = new Set(input.includedPaths);
  const workspace = matchWorkspace(specifier, input.packages);
  if (workspace) {
    const hit = firstIncluded(workspaceCandidates(workspace.pkg.path, workspace.subpath), included);
    if (hit !== undefined) return { kind: "internal", file: hit };
    return { kind: "drop", message: `unresolved specifier ${specifier}` };
  }
  if (isRelative(specifier)) {
    const hit = firstIncluded(relativeCandidates(fromFile, specifier), included);
    if (hit !== undefined) return { kind: "internal", file: hit };
    return { kind: "drop", message: `unresolved specifier ${specifier}` };
  }
  return { kind: "external", name: normalizePackageName(specifier) };
}

function matchWorkspace(
  specifier: string,
  packages: readonly WorkspacePackage[],
): { pkg: WorkspacePackage; subpath: string } | undefined {
  let best: WorkspacePackage | undefined;
  for (const pkg of packages) {
    if (specifier === pkg.name || specifier.startsWith(`${pkg.name}/`)) {
      if (!best || pkg.name.length > best.name.length) best = pkg;
    }
  }
  if (!best) return undefined;
  const subpath = specifier === best.name ? "" : specifier.slice(best.name.length + 1);
  return { pkg: best, subpath };
}

function workspaceCandidates(pkgPath: string, subpath: string): string[] {
  const reduced = stripJs(subpath);
  const relative =
    reduced === ""
      ? ["src/index.ts", "src/index.tsx", "index.ts", "index.tsx"]
      : [
          `src/${reduced}.ts`,
          `src/${reduced}.tsx`,
          `src/${reduced}/index.ts`,
          `src/${reduced}/index.tsx`,
          `${reduced}.ts`,
          `${reduced}.tsx`,
          `${reduced}/index.ts`,
          `${reduced}/index.tsx`,
        ];
  return relative.map((rel) => (pkgPath === "" ? rel : `${pkgPath}/${rel}`));
}

function relativeCandidates(fromFile: string, specifier: string): string[] {
  const slash = fromFile.lastIndexOf("/");
  const dir = slash === -1 ? "" : fromFile.slice(0, slash);
  const raw = dir === "" ? specifier : `${dir}/${specifier}`;
  const stem = normalizePosix(raw);
  if (stem === undefined || stem.endsWith(".d.ts")) return [];
  if (stem.endsWith(".ts") || stem.endsWith(".tsx")) return [stem];
  const base = stripJs(stem);
  return [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
}

function firstIncluded(candidates: readonly string[], included: ReadonlySet<string>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate.endsWith(".d.ts") && included.has(candidate)) return candidate;
  }
  return undefined;
}

function stripJs(value: string): string {
  if (value.endsWith(".jsx")) return value.slice(0, -4);
  if (value.endsWith(".js")) return value.slice(0, -3);
  return value;
}

function normalizePosix(filePath: string): string | undefined {
  const parts: string[] = [];
  for (const part of filePath.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return undefined;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier === "." || specifier === "..";
}

function normalizePackageName(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    const scope = parts[0] ?? "";
    const name = parts[1] ?? "";
    return name === "" ? scope : `${scope}/${name}`;
  }
  const first = specifier.split("/")[0];
  return first ?? specifier;
}
