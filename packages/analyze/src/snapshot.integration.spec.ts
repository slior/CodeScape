import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "@jest/globals";
import { snapshot } from "./snapshot.js";

const fixture = fileURLToPath(new URL("../fixtures/tiny/", import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("snapshot viewer bundle", () => {
  it("publishes index.html, assets, and world.json, drops a stale asset on the second run, and keeps an unrelated file", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sw3d-bundle-"));
    roots.push(root);
    const out = path.join(root, "out");
    snapshot({ folder: fixture, out, ignore: [], open: false });
    expect(existsSync(path.join(out, "index.html"))).toBe(true);
    expect(existsSync(path.join(out, "world.json"))).toBe(true);
    const assets = readdirSync(path.join(out, "assets"));
    expect(assets.length).toBeGreaterThan(0);
    expect(assets).toContain("viewer.js");
    expect(readFileSync(path.join(out, "index.html"), "utf8")).toContain("./assets/viewer.js");
    const world = JSON.parse(readFileSync(path.join(out, "world.json"), "utf8")) as { version: number };
    expect(world.version).toBe(1);
    writeFileSync(path.join(out, "assets", "stale.js"), "stale");
    writeFileSync(path.join(out, "notes.txt"), "unrelated");
    const firstWorld = readFileSync(path.join(out, "world.json"));
    snapshot({ folder: fixture, out, ignore: [], open: false });
    const nextAssets = readdirSync(path.join(out, "assets"));
    expect(nextAssets).not.toContain("stale.js");
    expect(nextAssets).toContain("viewer.js");
    expect(existsSync(path.join(out, "index.html"))).toBe(true);
    expect(existsSync(path.join(out, "world.json"))).toBe(true);
    expect(readFileSync(path.join(out, "notes.txt"), "utf8")).toBe("unrelated");
    expect(Buffer.compare(readFileSync(path.join(out, "world.json")), firstWorld)).toBe(0);
    expect(readdirSync(root).filter((name) => name.startsWith(".sw3d-staging-"))).toEqual([]);
    expect(
      readdirSync(out).some(
        (name) => /^\.(?:world\.json|index\.html|assets)\.sw3d-(?:bak|quarantine)-/.test(name) && !name.endsWith("-other"),
      ),
    ).toBe(false);
  });
});
