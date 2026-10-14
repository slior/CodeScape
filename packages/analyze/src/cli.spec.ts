import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "@jest/globals";
import { main, parseSnapshotArgs } from "./cli.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe("parseSnapshotArgs", () => {
  it("reads folder, --out, repeated --ignore, --config, and --open", () => {
    expect(parseSnapshotArgs(["src", "--out", "dist", "--ignore", "a", "--ignore", "b", "--config", "c.json", "--open"])).toEqual({
      folder: "src",
      out: "dist",
      ignore: ["a", "b"],
      config: "c.json",
      open: true,
    });
  });

  it("requires --out and exactly one folder", () => {
    expect(() => parseSnapshotArgs(["src"])).toThrow(/--out/);
    expect(() => parseSnapshotArgs(["--out", "dist"])).toThrow(/exactly one folder/);
    expect(() => parseSnapshotArgs(["src", "extra", "--out", "dist"])).toThrow(/exactly one folder/);
  });
});

describe("main", () => {
  it("returns 1 for view when world.json is missing and does not create files", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sw3d-cli-"));
    roots.push(dir);
    writeFileSync(path.join(dir, "index.html"), "<p>x</p>\n");
    const code = await main(["view", dir]);
    expect(code).toBe(1);
    expect(readFileSync(path.join(dir, "index.html"), "utf8")).toBe("<p>x</p>\n");
  });

  it("returns 1 for an unknown command", async () => {
    expect(await main(["nope"])).toBe(1);
  });

  it("declares the sw3d bin", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
      bin: { sw3d: string };
    };
    expect(pkg.bin.sw3d).toBe("./dist/bin.js");
  });

  it("maps the package entry at dist", () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
      exports: { ".": { types: string; import: string } };
    };
    expect(pkg.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
  });
});
