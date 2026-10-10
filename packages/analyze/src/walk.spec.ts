import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorkspacePackage } from "@sw3d/model";
import { walkSource } from "./walk.js";

function withRoot(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sw3d-walk-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function write(root: string, rel: string, text: string): void {
  const file = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const rootPackage: WorkspacePackage = { path: "", name: "demo" };

describe("walkSource", () => {
  it("visits in UTF-8 byte order, depth-first, and keeps only .ts and .tsx", () => {
    withRoot((root) => {
      write(root, "b.ts", "export const b = 1;\n");
      write(root, "a.ts", "export const a = 1;\n");
      write(root, "f/z.ts", "export const z = 1;\n");
      write(root, "é/a.d.ts", "export type A = string;\n");
      write(root, "é/a.js", "export const js = 1;\n");
      write(root, "é/a.ts", "export const a = 1;\n");
      write(root, "é/a.tsx", "export const x = 1;\n");
      write(root, "é/c.ts", "export const c = 1;\n");
      write(root, "é/readme.md", "# readme\n");
      const result = walkSource(root, [], [rootPackage]);
      expect(result.included.map((file) => file.path)).toEqual([
        "a.ts",
        "b.ts",
        "f/z.ts",
        "é/a.ts",
        "é/a.tsx",
        "é/c.ts",
      ]);
      expect(result.included[0]?.realPath).toBe(fs.realpathSync(path.join(root, "a.ts")));
      expect(result.unreadable).toEqual([]);
      expect(result.outsideSymlinks).toEqual([]);
    });
  });

  it("drops a root file that no workspace package owns", () => {
    withRoot((root) => {
      write(root, "top.ts", "export const top = 1;\n");
      write(root, "packages/core/package.json", JSON.stringify({ name: "core" }));
      write(root, "packages/core/src/a.ts", "export const a = 1;\n");
      const result = walkSource(root, [], [{ path: "packages/core", name: "core" }]);
      expect(result.included.map((file) => file.path)).toEqual(["packages/core/src/a.ts"]);
    });
  });

  it("assigns a nested file to the longer real-path prefix", () => {
    withRoot((root) => {
      write(root, "packages/outer/src/a.ts", "export const a = 1;\n");
      write(root, "packages/outer/inner/src/b.ts", "export const b = 1;\n");
      const result = walkSource(root, [], [
        { path: "packages/outer", name: "outer" },
        { path: "packages/outer/inner", name: "inner" },
      ]);
      expect(result.included.map((file) => file.path)).toEqual([
        "packages/outer/inner/src/b.ts",
        "packages/outer/src/a.ts",
      ]);
    });
  });

  it("stores the declared package path when an earlier alias is visited first", () => {
    withRoot((root) => {
      write(root, "packages/core/package.json", JSON.stringify({ name: "dialectic-core" }));
      write(root, "packages/core/src/b.ts", "export const b = 1;\n");
      write(root, "packages/core/src/a.ts", "export const a = 1;\n");
      fs.symlinkSync(path.join("packages", "core"), path.join(root, "aaa"), "dir");
      const result = walkSource(root, [], [{ path: "packages/core", name: "dialectic-core" }]);
      expect(result.included.map((file) => file.path)).toEqual([
        "packages/core/src/a.ts",
        "packages/core/src/b.ts",
      ]);
      expect(result.outsideSymlinks).toEqual([]);
    });
  });

  it("prunes an alias whose real path is node_modules", () => {
    withRoot((root) => {
      write(root, "node_modules/keep.ts", "export const k = 1;\n");
      write(root, "packages/core/src/a.ts", "export const a = 1;\n");
      fs.symlinkSync("node_modules", path.join(root, "aaa"), "dir");
      const result = walkSource(root, ["node_modules"], [{ path: "packages/core", name: "core" }]);
      expect(result.included.map((file) => file.path)).toEqual(["packages/core/src/a.ts"]);
      expect(result.outsideSymlinks).toEqual([]);
    });
  });

  it("skips a symlink cycle with no warning", () => {
    withRoot((root) => {
      write(root, "packages/core/src/a.ts", "export const a = 1;\n");
      fs.symlinkSync(".", path.join(root, "packages", "core", "loop"), "dir");
      const result = walkSource(root, [], [{ path: "packages/core", name: "core" }]);
      expect(result.included.map((file) => file.path)).toEqual(["packages/core/src/a.ts"]);
      expect(result.outsideSymlinks).toEqual([]);
      expect(result.unreadable).toEqual([]);
    });
  });

  it("warns for a symlink outside the root and does not include its files", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sw3d-out-"));
    try {
      withRoot((root) => {
        write(outside, "out.ts", "export const out = 1;\n");
        write(root, "inside.ts", "export const inside = 1;\n");
        fs.symlinkSync(outside, path.join(root, "escape"), "dir");
        const result = walkSource(root, [], [rootPackage]);
        expect(result.included.map((file) => file.path)).toEqual(["inside.ts"]);
        expect(result.outsideSymlinks).toEqual([{ path: "escape", message: "symlink outside root" }]);
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("warns once when two aliases share one outside real path", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "sw3d-out-"));
    try {
      withRoot((root) => {
        write(outside, "out.ts", "export const out = 1;\n");
        write(root, "inside.ts", "export const inside = 1;\n");
        fs.symlinkSync(outside, path.join(root, "zzz"), "dir");
        fs.symlinkSync(outside, path.join(root, "aaa"), "dir");
        const result = walkSource(root, [], [rootPackage]);
        expect(result.included.map((file) => file.path)).toEqual(["inside.ts"]);
        expect(result.outsideSymlinks).toEqual([{ path: "aaa", message: "symlink outside root" }]);
      });
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("emits an in-root file symlink once", () => {
    withRoot((root) => {
      write(root, "src/a.ts", "export const a = 1;\n");
      fs.symlinkSync("a.ts", path.join(root, "src", "b.ts"));
      const result = walkSource(root, [], [rootPackage]);
      expect(result.included.map((file) => file.path)).toEqual(["src/a.ts"]);
      expect(result.outsideSymlinks).toEqual([]);
    });
  });

  it("re-includes a child of generated/* and does not re-include a child of node_modules", () => {
    withRoot((root) => {
      write(root, "generated/keep.ts", "export const k = 1;\n");
      write(root, "generated/drop.ts", "export const d = 1;\n");
      const generated = walkSource(root, ["generated/*", "!generated/keep.ts"], [rootPackage]);
      expect(generated.included.map((file) => file.path)).toEqual(["generated/keep.ts"]);
    });
    withRoot((root) => {
      write(root, "node_modules/keep.ts", "export const k = 1;\n");
      const pruned = walkSource(root, ["node_modules", "!node_modules/keep.ts"], [rootPackage]);
      expect(pruned.included).toEqual([]);
    });
  });

  it("excludes alias files when packages/core/** is ignored and !aaa/** re-includes the alias", () => {
    withRoot((root) => {
      write(root, "packages/core/src/x.ts", "export const x = 1;\n");
      fs.symlinkSync(path.join("packages", "core"), path.join(root, "aaa"), "dir");
      const result = walkSource(root, ["packages/core/**", "!aaa/**"], [
        { path: "packages/core", name: "core" },
      ]);
      expect(result.included).toEqual([]);
    });
  });

  it("excludes alias files when aaa/** is ignored and !packages/core/** re-includes the package", () => {
    withRoot((root) => {
      write(root, "packages/core/src/x.ts", "export const x = 1;\n");
      fs.symlinkSync(path.join("packages", "core"), path.join(root, "aaa"), "dir");
      const result = walkSource(root, ["aaa/**", "!packages/core/**"], [
        { path: "packages/core", name: "core" },
      ]);
      expect(result.included).toEqual([]);
    });
  });

  it("reports an unreadable source file and still returns readable siblings", () => {
    withRoot((root) => {
      write(root, "packages/core/src/ok.ts", "export const y = 1;\n");
      write(root, "packages/core/src/secret.ts", "export const x = 1;\n");
      const secret = path.join(root, "packages", "core", "src", "secret.ts");
      fs.chmodSync(secret, 0o000);
      try {
        const result = walkSource(root, [], [{ path: "packages/core", name: "core" }]);
        expect(result.included.map((file) => file.path)).toEqual(["packages/core/src/ok.ts"]);
        expect(result.unreadable).toEqual([
          { path: "packages/core/src/secret.ts", message: "unreadable" },
        ]);
      } finally {
        fs.chmodSync(secret, 0o644);
      }
    });
  });

  it("warns for an owned broken source symlink and skips an ignored one", () => {
    withRoot((root) => {
      write(root, "packages/core/src/ok.ts", "export const ok = 1;\n");
      fs.symlinkSync("missing.ts", path.join(root, "packages", "core", "src", "gone.ts"));
      fs.symlinkSync("missing.ts", path.join(root, "packages", "core", "src", "ignored.ts"));
      const result = walkSource(root, ["ignored.ts"], [{ path: "packages/core", name: "core" }]);
      expect(result.included.map((file) => file.path)).toEqual(["packages/core/src/ok.ts"]);
      expect(result.unreadable).toEqual([
        { path: "packages/core/src/gone.ts", message: "unreadable" },
      ]);
      expect(result.outsideSymlinks).toEqual([]);
    });
  });

  it("does not warn for a broken source symlink outside every workspace package", () => {
    withRoot((root) => {
      write(root, "packages/core/src/ok.ts", "export const ok = 1;\n");
      fs.symlinkSync("missing.ts", path.join(root, "root.ts"));
      const result = walkSource(root, [], [{ path: "packages/core", name: "core" }]);
      expect(result.included.map((file) => file.path)).toEqual(["packages/core/src/ok.ts"]);
      expect(result.unreadable).toEqual([]);
      expect(result.outsideSymlinks).toEqual([]);
    });
  });
});
