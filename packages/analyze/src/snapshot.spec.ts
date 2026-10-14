import { cpSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "@jest/globals";
import type { SnapshotOptions } from "@sw3d/model";
import { snapshotWithHooks } from "./snapshot.js";

const fixtureRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));
const roots: string[] = [];
const isRoot = process.getuid?.() === 0;
const itUnlessRoot = isRoot ? it.skip : it;

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fakeViewer(root: string): string {
  const dist = path.join(root, "viewer-dist");
  mkdirSync(path.join(dist, "assets"), { recursive: true });
  writeFileSync(path.join(dist, "index.html"), '<!DOCTYPE html><script type="module" src="./assets/viewer.js"></script>\n');
  writeFileSync(path.join(dist, "assets", "viewer.js"), "console.log('viewer');\n");
  return dist;
}

function optionsFor(folder: string, out: string, extra?: { config?: string; ignore?: readonly string[] }): SnapshotOptions {
  const options: SnapshotOptions = { folder, out, ignore: extra?.ignore ?? [], open: false };
  if (extra?.config !== undefined) options.config = extra.config;
  return options;
}

function expectNoOutput(folder: string, extra?: { config?: string; ignore?: readonly string[] }): void {
  const root = mkdtempSync(path.join(tmpdir(), "sw3d-fatal-"));
  roots.push(root);
  const dist = fakeViewer(root);
  const fresh = path.join(root, "fresh");
  expect(() => snapshotWithHooks(optionsFor(folder, fresh, extra), { viewerDist: dist })).toThrow();
  expect(existsSync(fresh)).toBe(false);

  const existing = path.join(root, "existing");
  mkdirSync(existing);
  writeFileSync(path.join(existing, "keep.txt"), "stay");
  expect(() => snapshotWithHooks(optionsFor(folder, existing, extra), { viewerDist: dist })).toThrow();
  expect(readdirSync(existing)).toEqual(["keep.txt"]);
  expect(readFileSync(path.join(existing, "keep.txt"), "utf8")).toBe("stay");
  expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
}

describe("snapshot fatals leave --out untouched", () => {
  it("rejects a missing folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-miss-"));
    roots.push(root);
    expectNoOutput(path.join(root, "no-such-folder"));
  });

  it("rejects an unknown config key", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-config"));
  });

  it("rejects a non-array ignore", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-ignore"));
  });

  it("rejects invalid config JSON", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-json"));
  });

  it("rejects invalid root package.json", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-pkg"));
  });

  it("rejects a missing --config path", () => {
    expectNoOutput(path.join(fixtureRoot, "tiny"), { config: path.join(fixtureRoot, "missing-sw3d.config.json") });
  });

  it("rejects workspaces as a string", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-workspaces"));
  });

  it("rejects workspaces as an object without packages", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-ws-object"));
  });

  it("rejects a non-string workspaces element", () => {
    expectNoOutput(path.join(fixtureRoot, "bad-ws-element"));
  });

  it("rejects zero included source files, including a root .ts beside packages", () => {
    expectNoOutput(path.join(fixtureRoot, "empty-source"));
  });

  it("rejects duplicate package names", () => {
    expectNoOutput(path.join(fixtureRoot, "dup-name"));
  });

  it("rejects a workspace package.json without a string name", () => {
    expectNoOutput(path.join(fixtureRoot, "nameless"));
  });

  it("rejects an empty viewer dist before publish", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-empty-dist-"));
    roots.push(root);
    const emptyDist = path.join(root, "empty-dist");
    mkdirSync(emptyDist);
    const folder = path.join(fixtureRoot, "tiny");
    const fresh = path.join(root, "fresh");
    expect(() => snapshotWithHooks(optionsFor(folder, fresh), { viewerDist: emptyDist })).toThrow(/viewer build is missing/);
    expect(existsSync(fresh)).toBe(false);
    const existing = path.join(root, "existing");
    mkdirSync(existing);
    writeFileSync(path.join(existing, "keep.txt"), "stay");
    expect(() => snapshotWithHooks(optionsFor(folder, existing), { viewerDist: emptyDist })).toThrow(/viewer build is missing/);
    expect(readdirSync(existing)).toEqual(["keep.txt"]);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
  });

  it("treats a CLI ignore that drops every source file as empty source", () => {
    expectNoOutput(path.join(fixtureRoot, "tiny"), { ignore: ["*.ts"] });
  });

  it("rejects --out equal to the analyzed folder without modifying it", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-out-eq-"));
    roots.push(root);
    const folder = path.join(root, "repo");
    cpSync(path.join(fixtureRoot, "tiny"), folder, { recursive: true });
    const dist = fakeViewer(root);
    const marker = readFileSync(path.join(folder, "packages", "core", "src", "index.ts"));
    const before = readdirSync(folder).sort();
    expect(() => snapshotWithHooks(optionsFor(folder, folder), { viewerDist: dist })).toThrow(
      /must not be the analyzed folder/,
    );
    expect(readdirSync(folder).sort()).toEqual(before);
    expect(readFileSync(path.join(folder, "packages", "core", "src", "index.ts"))).toEqual(marker);
    expect(existsSync(path.join(folder, "world.json"))).toBe(false);
    expect(existsSync(path.join(folder, "index.html"))).toBe(false);
    expect(existsSync(path.join(folder, "assets"))).toBe(false);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
  });

  it("rejects --out inside the analyzed folder without modifying it", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-out-in-"));
    roots.push(root);
    const folder = path.join(root, "repo");
    cpSync(path.join(fixtureRoot, "tiny"), folder, { recursive: true });
    const dist = fakeViewer(root);
    const out = path.join(folder, "generated-city");
    const marker = readFileSync(path.join(folder, "packages", "core", "src", "index.ts"));
    const before = readdirSync(folder).sort();
    expect(() => snapshotWithHooks(optionsFor(folder, out), { viewerDist: dist })).toThrow(
      /must not be the analyzed folder/,
    );
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(folder).sort()).toEqual(before);
    expect(readFileSync(path.join(folder, "packages", "core", "src", "index.ts"))).toEqual(marker);
    expect(existsSync(path.join(folder, "world.json"))).toBe(false);
    expect(existsSync(path.join(folder, "index.html"))).toBe(false);
    expect(existsSync(path.join(folder, "assets"))).toBe(false);
    expect(readdirSync(folder).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
  });

  it("rejects a symlink --out whose real path is inside the analyzed folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-out-link-"));
    roots.push(root);
    const folder = path.join(root, "repo");
    cpSync(path.join(fixtureRoot, "tiny"), folder, { recursive: true });
    const dist = fakeViewer(root);
    const link = path.join(root, "inside");
    symlinkSync(path.join(folder, "packages"), link);
    const marker = readFileSync(path.join(folder, "packages", "core", "src", "index.ts"));
    expect(() => snapshotWithHooks(optionsFor(folder, link), { viewerDist: dist })).toThrow(
      /must not be the analyzed folder/,
    );
    expect(readFileSync(path.join(folder, "packages", "core", "src", "index.ts"))).toEqual(marker);
    expect(existsSync(path.join(folder, "world.json"))).toBe(false);
    expect(existsSync(path.join(folder, "packages", "world.json"))).toBe(false);
    expect(existsSync(path.join(folder, "packages", "index.html"))).toBe(false);
    expect(existsSync(path.join(folder, "packages", "assets"))).toBe(false);
    expect(readdirSync(path.join(folder, "packages")).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
  });

  it("rejects --out when a replaced entry is the analyzed folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-out-assets-"));
    roots.push(root);
    const folder = path.join(root, "assets");
    cpSync(path.join(fixtureRoot, "tiny"), folder, { recursive: true });
    const dist = fakeViewer(root);
    const marker = readFileSync(path.join(folder, "packages", "core", "src", "index.ts"));
    const before = readdirSync(folder).sort();
    const parent = path.dirname(root);
    const stagingBefore = new Set(readdirSync(parent).filter((name) => name.startsWith(".sw3d-staging-")));
    expect(() => snapshotWithHooks(optionsFor(folder, root), { viewerDist: dist })).toThrow(
      /must not be the analyzed folder/,
    );
    expect(readdirSync(folder).sort()).toEqual(before);
    expect(readFileSync(path.join(folder, "packages", "core", "src", "index.ts"))).toEqual(marker);
    expect(existsSync(path.join(root, "world.json"))).toBe(false);
    expect(existsSync(path.join(folder, "world.json"))).toBe(false);
    expect(existsSync(path.join(folder, "index.html"))).toBe(false);
    expect(readdirSync(folder).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
    expect(readdirSync(parent).filter((name) => name.startsWith(".sw3d-staging-") && !stagingBefore.has(name))).toEqual([]);
  });

  itUnlessRoot("rejects an unreadable directory when it is the only source content", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-locked-only-"));
    roots.push(root);
    const folder = path.join(root, "repo");
    const locked = path.join(folder, "locked");
    mkdirSync(locked, { recursive: true });
    writeFileSync(path.join(folder, "package.json"), "{\"name\":\"locked-only\"}\n");
    writeFileSync(path.join(locked, "hidden.ts"), "export const hidden = 1;\n");
    chmodSync(locked, 0);
    const dist = fakeViewer(root);
    const out = path.join(root, "out");
    try {
      expect(() => snapshotWithHooks(optionsFor(folder, out), { viewerDist: dist })).toThrow(/no included source files/);
      expect(existsSync(out)).toBe(false);
    } finally {
      chmodSync(locked, 0o755);
    }
  });
});

describe("snapshot success", () => {
  it("writes the three entries, keeps an unrelated file, and repeats world.json bytes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-ok-"));
    roots.push(root);
    const dist = fakeViewer(root);
    const folder = path.join(fixtureRoot, "tiny");
    const outA = path.join(root, "a");
    const outB = path.join(root, "b");
    snapshotWithHooks(optionsFor(folder, outA), { viewerDist: dist });
    snapshotWithHooks(optionsFor(folder, outB), { viewerDist: dist });
    expect(readFileSync(path.join(outA, "index.html"), "utf8")).toContain("./assets/viewer.js");
    expect(readFileSync(path.join(outA, "assets", "viewer.js"), "utf8")).toContain("viewer");
    const parsed = JSON.parse(readFileSync(path.join(outA, "world.json"), "utf8")) as {
      version: number;
      name: string;
      nodes: { kind: string; name: string }[];
    };
    expect(parsed.version).toBe(1);
    expect(parsed.name).toBe("tiny");
    const city = parsed.nodes.find((node) => node.kind === "city");
    expect(city?.name).toBe("tiny");
    expect(Buffer.compare(readFileSync(path.join(outA, "world.json")), readFileSync(path.join(outB, "world.json")))).toBe(0);
    const existing = path.join(root, "existing");
    mkdirSync(existing);
    writeFileSync(path.join(existing, "keep.txt"), "stay");
    snapshotWithHooks(optionsFor(folder, existing), { viewerDist: dist });
    expect(readFileSync(path.join(existing, "keep.txt"), "utf8")).toBe("stay");
    expect(existsSync(path.join(existing, "index.html"))).toBe(true);
    expect(existsSync(path.join(existing, "world.json"))).toBe(true);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
  });

  it("adds an unreadable file as a file box and a warning, and still publishes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-unreadable-"));
    roots.push(root);
    const folder = path.join(root, "repo");
    cpSync(path.join(fixtureRoot, "tiny"), folder, { recursive: true });
    const hidden = path.join(folder, "packages", "core", "src", "secret.ts");
    writeFileSync(hidden, "export const secret = 1;\n");
    chmodSync(hidden, 0);
    const dist = fakeViewer(root);
    const out = path.join(root, "out");
    try {
      snapshotWithHooks(optionsFor(folder, out), { viewerDist: dist });
    } finally {
      chmodSync(hidden, 0o644);
    }
    const parsed = JSON.parse(readFileSync(path.join(out, "world.json"), "utf8")) as {
      warnings: { path: string; message: string }[];
      nodes: { path: string; kind: string }[];
    };
    expect(
      parsed.warnings.some((warning) => warning.path === "packages/core/src/secret.ts" && warning.message.startsWith("unreadable")),
    ).toBe(true);
    expect(parsed.nodes.some((node) => node.path === "packages/core/src/secret.ts" && node.kind === "box")).toBe(true);
  });

  it("writes one district named by the folder basename when package.json is absent", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-nomanifest-"));
    roots.push(root);
    const dist = fakeViewer(root);
    const folder = path.join(fixtureRoot, "no-manifest");
    const out = path.join(root, "out");
    snapshotWithHooks(optionsFor(folder, out), { viewerDist: dist });
    expect(existsSync(path.join(out, "index.html"))).toBe(true);
    expect(existsSync(path.join(out, "world.json"))).toBe(true);
    expect(readdirSync(path.join(out, "assets")).length).toBeGreaterThan(0);
    const parsed = JSON.parse(readFileSync(path.join(out, "world.json"), "utf8")) as {
      name: string;
      nodes: { kind: string; name: string; path: string; packageName?: string }[];
    };
    expect(parsed.name).toBe("no-manifest");
    const districts = parsed.nodes.filter((node) => node.kind === "district");
    expect(districts.map((node) => ({ name: node.name, path: node.path, packageName: node.packageName }))).toEqual([
      { name: "no-manifest", path: "", packageName: "no-manifest" },
    ]);
  });

  itUnlessRoot("keeps an unreadable directory as a warning and does not make it a file box", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-locked-dir-"));
    roots.push(root);
    const folder = path.join(root, "repo");
    const locked = path.join(folder, "src", "locked");
    mkdirSync(locked, { recursive: true });
    writeFileSync(path.join(folder, "package.json"), "{\"name\":\"locked-repo\"}\n");
    writeFileSync(path.join(folder, "src", "ok.ts"), "export const ok = 1;\n");
    writeFileSync(path.join(locked, "hidden.ts"), "export const hidden = 1;\n");
    chmodSync(locked, 0);
    const dist = fakeViewer(root);
    const out = path.join(root, "out");
    try {
      snapshotWithHooks(optionsFor(folder, out), { viewerDist: dist });
    } finally {
      chmodSync(locked, 0o755);
    }
    const parsed = JSON.parse(readFileSync(path.join(out, "world.json"), "utf8")) as {
      warnings: { path: string; message: string }[];
      nodes: { path: string; kind: string }[];
    };
    expect(parsed.nodes.some((node) => node.path === "src/ok.ts" && node.kind === "box")).toBe(true);
    expect(parsed.nodes.some((node) => node.path === "src/locked" || node.path === "src/locked/hidden.ts")).toBe(false);
    expect(
      parsed.warnings.some((warning) => warning.path === "src/locked" && warning.message.startsWith("unreadable")),
    ).toBe(true);
  });
});
