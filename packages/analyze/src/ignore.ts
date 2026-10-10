export interface Sw3dConfig {
  ignore?: readonly string[];
  languages?: Readonly<
    Record<string, { useDefaults?: boolean; ignore?: readonly string[] }>
  >;
}

export function mergeIgnorePatterns(
  defaults: readonly string[],
  config: Sw3dConfig | null,
  cliPatterns: readonly string[],
): string[] {
  const typescript = config?.languages?.["typescript"];
  const useDefaults = typescript?.useDefaults !== false;
  const merged: string[] = [];
  if (useDefaults) merged.push(...defaults);
  if (config?.ignore) merged.push(...config.ignore);
  if (typescript?.ignore) merged.push(...typescript.ignore);
  merged.push(...cliPatterns);
  return merged;
}

export function isIgnored(
  traversalPath: string,
  canonicalPath: string,
  patterns: readonly string[],
  isDirectory: boolean,
): boolean {
  return (
    pathIgnored(traversalPath, patterns, isDirectory) ||
    pathIgnored(canonicalPath, patterns, isDirectory)
  );
}

function pathIgnored(filePath: string, patterns: readonly string[], isDirectory: boolean): boolean {
  const parts = filePath.split("/");
  let prefix = "";
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i] ?? "";
    prefix = prefix === "" ? part : `${prefix}/${part}`;
    if (lastMatchIsIgnore(prefix, patterns, true)) return true;
  }
  return lastMatchIsIgnore(filePath, patterns, isDirectory);
}

function lastMatchIsIgnore(
  filePath: string,
  patterns: readonly string[],
  isDirectory: boolean,
): boolean {
  let ignored = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith("!");
    const body = negated ? pattern.slice(1) : pattern;
    if (body.length === 0) continue;
    if (patternMatches(body, filePath, isDirectory)) ignored = !negated;
  }
  return ignored;
}

function patternMatches(body: string, filePath: string, isDirectory: boolean): boolean {
  const directoryOnly = body.endsWith("/");
  if (directoryOnly && !isDirectory) return false;
  const glob = directoryOnly ? body.slice(0, -1) : body;
  if (glob.length === 0) return false;
  if (!glob.includes("/")) {
    for (const part of filePath.split("/")) {
      if (matchGlob(glob, part)) return true;
    }
    return false;
  }
  return matchGlob(glob, filePath);
}

function matchGlob(pattern: string, text: string): boolean {
  return matchAt(pattern, 0, text, 0);
}

function matchAt(pattern: string, pi: number, text: string, ti: number): boolean {
  if (pi === pattern.length) return ti === text.length;
  if (pattern.startsWith("**", pi)) {
    const afterStars = pi + 2;
    const restIndex = pattern.charAt(afterStars) === "/" ? afterStars + 1 : afterStars;
    if (restIndex >= pattern.length) return true;
    let cursor = ti;
    for (;;) {
      if (matchAt(pattern, restIndex, text, cursor)) return true;
      if (cursor >= text.length) return false;
      const slash = text.indexOf("/", cursor);
      if (slash === -1) return false;
      cursor = slash + 1;
    }
  }
  if (pattern.charAt(pi) === "*") {
    for (let cursor = ti; cursor <= text.length; cursor += 1) {
      if (cursor > ti && text.charAt(cursor - 1) === "/") break;
      if (matchAt(pattern, pi + 1, text, cursor)) return true;
    }
    return false;
  }
  if (ti >= text.length) return false;
  if (pattern.charAt(pi) === "?") {
    if (text.charAt(ti) === "/") return false;
    return matchAt(pattern, pi + 1, text, ti + 1);
  }
  if (pattern.charAt(pi) !== text.charAt(ti)) return false;
  return matchAt(pattern, pi + 1, text, ti + 1);
}
