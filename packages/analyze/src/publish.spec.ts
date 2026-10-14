import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";
import { publishSnapshot, publishSnapshotWithHook } from "./publish.js";

const ENTRIES = ["world.json", "index.html", "assets"] as const;
type Entry = (typeof ENTRIES)[number];

function writeStaging(staging: string): void {
  mkdirSync(staging, { recursive: true });
  writeFileSync(path.join(staging, "world.json"), "NEW WORLD\n");
  writeFileSync(path.join(staging, "index.html"), "NEW INDEX\n");
  mkdirSync(path.join(staging, "assets"));
  writeFileSync(path.join(staging, "assets", "new.js"), "new");
}

function writePrevious(out: string): void {
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "world.json"), "OLD WORLD\n");
  writeFileSync(path.join(out, "index.html"), "OLD INDEX\n");
  mkdirSync(path.join(out, "assets"));
  writeFileSync(path.join(out, "assets", "old.js"), "old");
}

function setup(mode: "replace" | "absent" | "missing-out"): { root: string; out: string; staging: string } {
  const root = mkdtempSync(path.join(tmpdir(), "sw3d-pub-"));
  const out = path.join(root, "out");
  const staging = path.join(root, ".sw3d-staging-test");
  writeStaging(staging);
  if (mode === "replace") writePrevious(out);
  if (mode === "absent") {
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "unrelated.txt"), "keep");
  }
  return { root, out, staging };
}

function thisRunTemps(out: string): string[] {
  return readdirSync(out).filter(
    (name) =>
      /^\.(?:world\.json|index\.html|assets)\.sw3d-(?:bak|quarantine)-/.test(name) && !name.endsWith("-other"),
  );
}

describe("publishSnapshot", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  it("renames staging onto a missing out directory", () => {
    const dirs = setup("missing-out");
    roots.push(dirs.root);
    publishSnapshot(dirs.staging, dirs.out);
    expect(readFileSync(path.join(dirs.out, "world.json"), "utf8")).toBe("NEW WORLD\n");
    expect(readFileSync(path.join(dirs.out, "index.html"), "utf8")).toBe("NEW INDEX\n");
    expect(readFileSync(path.join(dirs.out, "assets", "new.js"), "utf8")).toBe("new");
    expect(existsSync(dirs.staging)).toBe(false);
  });

  it.each(ENTRIES)("restores previous bytes after a failure installing %s", (entry: Entry) => {
    const dirs = setup("replace");
    roots.push(dirs.root);
    writeFileSync(path.join(dirs.out, "assets.sw3d-bak"), "unrelated-bak");
    writeFileSync(path.join(dirs.out, ".world.json.sw3d-bak-other"), "other-bak");
    expect(() => publishSnapshotWithHook(dirs.staging, dirs.out, entry)).toThrow(
      `injected failure after ${entry}`,
    );
    expect(readFileSync(path.join(dirs.out, "world.json"), "utf8")).toBe("OLD WORLD\n");
    expect(readFileSync(path.join(dirs.out, "index.html"), "utf8")).toBe("OLD INDEX\n");
    expect(readdirSync(path.join(dirs.out, "assets"))).toEqual(["old.js"]);
    expect(readFileSync(path.join(dirs.out, "assets", "old.js"), "utf8")).toBe("old");
    expect(existsSync(path.join(dirs.out, "assets", "new.js"))).toBe(false);
    expect(readFileSync(path.join(dirs.out, "assets.sw3d-bak"), "utf8")).toBe("unrelated-bak");
    expect(readFileSync(path.join(dirs.out, ".world.json.sw3d-bak-other"), "utf8")).toBe("other-bak");
    expect(thisRunTemps(dirs.out)).toEqual([]);
    expect(existsSync(dirs.staging)).toBe(false);
  });

  it.each(ENTRIES)("leaves only the unrelated file when %s fails and entries were absent", (entry: Entry) => {
    const dirs = setup("absent");
    roots.push(dirs.root);
    expect(() => publishSnapshotWithHook(dirs.staging, dirs.out, entry)).toThrow(
      `injected failure after ${entry}`,
    );
    expect(existsSync(path.join(dirs.out, "world.json"))).toBe(false);
    expect(existsSync(path.join(dirs.out, "index.html"))).toBe(false);
    expect(existsSync(path.join(dirs.out, "assets"))).toBe(false);
    expect(readFileSync(path.join(dirs.out, "unrelated.txt"), "utf8")).toBe("keep");
    expect(readdirSync(dirs.out)).toEqual(["unrelated.txt"]);
    expect(existsSync(dirs.staging)).toBe(false);
  });

  it("keeps assets.sw3d-bak after a successful publish and deletes only this transaction's backups", () => {
    const dirs = setup("replace");
    roots.push(dirs.root);
    writeFileSync(path.join(dirs.out, "assets.sw3d-bak"), "unrelated-bak");
    writeFileSync(path.join(dirs.out, ".assets.sw3d-bak-other"), "other-dir-marker");
    publishSnapshot(dirs.staging, dirs.out);
    expect(readFileSync(path.join(dirs.out, "world.json"), "utf8")).toBe("NEW WORLD\n");
    expect(readFileSync(path.join(dirs.out, "index.html"), "utf8")).toBe("NEW INDEX\n");
    expect(readdirSync(path.join(dirs.out, "assets"))).toEqual(["new.js"]);
    expect(readFileSync(path.join(dirs.out, "assets.sw3d-bak"), "utf8")).toBe("unrelated-bak");
    expect(readFileSync(path.join(dirs.out, ".assets.sw3d-bak-other"), "utf8")).toBe("other-dir-marker");
    expect(thisRunTemps(dirs.out)).toEqual([]);
    expect(existsSync(dirs.staging)).toBe(false);
  });
});
