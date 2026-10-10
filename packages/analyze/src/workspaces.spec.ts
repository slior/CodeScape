import { describe, expect, it } from "@jest/globals";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadWorkspaces, selectWorkspacePackages } from "./workspaces.js";

function withRoot(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sw3d-ws-"));
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

describe("loadWorkspaces", () => {
  it("uses the folder basename when package.json is missing", () => {
    withRoot((root) => {
      expect(loadWorkspaces(root)).toEqual({
        packages: [{ path: "", name: path.basename(root) }],
      });
    });
  });

  it("uses a string name when workspaces is absent", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ name: "my-app", private: true }));
      expect(loadWorkspaces(root)).toEqual({ packages: [{ path: "", name: "my-app" }] });
    });
  });

  it("uses the folder basename when the root name is not a string and workspaces is absent", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ name: 1, private: true }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [{ path: "", name: path.basename(root) }],
      });
    });
  });

  it("returns fatal for invalid root JSON", () => {
    withRoot((root) => {
      write(root, "package.json", "{");
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "package.json", message: "invalid package.json" },
      });
    });
  });

  it("returns fatal for every illegal workspaces shape", () => {
    const shapes: unknown[] = [
      "packages/*",
      1,
      null,
      { nope: true },
      { packages: "packages/*" },
      { packages: { a: "packages/*" } },
      ["packages/*", 1],
      { packages: ["packages/*", 1] },
    ];
    withRoot((root) => {
      for (const workspaces of shapes) {
        write(root, "package.json", JSON.stringify({ name: "app", workspaces }));
        expect(loadWorkspaces(root)).toEqual({
          packages: [],
          fatal: { path: "package.json", message: "invalid workspaces" },
        });
      }
    });
  });

  it("accepts extra keys and loads string patterns in UTF-8 path order", () => {
    withRoot((root) => {
      write(
        root,
        "package.json",
        JSON.stringify({
          name: "mono",
          workspaces: { packages: ["packages/*"], nohoist: ["a"] },
        }),
      );
      write(root, "packages/b/package.json", JSON.stringify({ name: "pkg-b" }));
      write(root, "packages/a/package.json", JSON.stringify({ name: "pkg-a" }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [
          { path: "packages/a", name: "pkg-a" },
          { path: "packages/b", name: "pkg-b" },
        ],
      });
    });
  });

  it("loads nested packages from packages/** without treating packages itself as a package", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/**"] }));
      write(root, "packages/outer/package.json", JSON.stringify({ name: "outer" }));
      write(root, "packages/outer/inner/package.json", JSON.stringify({ name: "inner" }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [
          { path: "packages/outer", name: "outer" },
          { path: "packages/outer/inner", name: "inner" },
        ],
      });
    });
  });

  it("returns one package when two patterns reach the same real directory", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/core", "link"] }));
      write(root, "packages/core/package.json", JSON.stringify({ name: "dialectic-core" }));
      fs.symlinkSync(path.join("packages", "core"), path.join(root, "link"), "dir");
      expect(loadWorkspaces(root)).toEqual({
        packages: [{ path: "link", name: "dialectic-core" }],
      });
    });
  });

  it("returns fatal when two directories share a package name", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/*"] }));
      write(root, "packages/a/package.json", JSON.stringify({ name: "same" }));
      write(root, "packages/b/package.json", JSON.stringify({ name: "same" }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "packages/b", message: "duplicate package name same" },
      });
    });
  });

  it("returns fatal when a matched directory has no package.json", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/missing"] }));
      fs.mkdirSync(path.join(root, "packages", "missing"), { recursive: true });
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "packages/missing/package.json", message: "missing package.json" },
      });
    });
  });

  it("returns fatal for invalid workspace package JSON", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/a"] }));
      write(root, "packages/a/package.json", "{");
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "packages/a/package.json", message: "invalid package.json" },
      });
    });
  });

  it("returns fatal when a workspace name is missing or not a string", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/a"] }));
      write(root, "packages/a/package.json", JSON.stringify({ private: true }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "packages/a/package.json", message: "missing package name" },
      });
      write(root, "packages/a/package.json", JSON.stringify({ name: 1 }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "packages/a/package.json", message: "missing package name" },
      });
    });
  });

  it("returns fatal when valid JSON is not an object", () => {
    const documents = ["[]", "null", "1", '"app"'];
    withRoot((root) => {
      for (const document of documents) {
        write(root, "package.json", document);
        expect(loadWorkspaces(root)).toEqual({
          packages: [],
          fatal: { path: "package.json", message: "invalid package.json" },
        });
      }
    });
  });

  it("matches one path segment for ?", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/?"] }));
      write(root, "packages/a/package.json", JSON.stringify({ name: "pkg-a" }));
      write(root, "packages/b/package.json", JSON.stringify({ name: "pkg-b" }));
      write(root, "packages/ab/package.json", JSON.stringify({ name: "pkg-ab" }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [
          { path: "packages/a", name: "pkg-a" },
          { path: "packages/b", name: "pkg-b" },
        ],
      });
    });
  });

  it("skips a symlink cycle while expanding a workspace glob", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["packages/**"] }));
      write(root, "packages/core/package.json", JSON.stringify({ name: "core" }));
      fs.symlinkSync("..", path.join(root, "packages", "core", "loop"), "dir");
      expect(loadWorkspaces(root)).toEqual({
        packages: [{ path: "packages/core", name: "core" }],
      });
    });
  });
  it("accepts a ./ prefixed workspace glob and declares paths without it", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["./packages/*"] }));
      write(root, "packages/a/package.json", JSON.stringify({ name: "pkg-a" }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [{ path: "packages/a", name: "pkg-a" }],
      });
    });
  });

  it("returns fatal for a workspace pattern that escapes the root", () => {
    withRoot((root) => {
      write(root, "package.json", JSON.stringify({ workspaces: ["../outside/*"] }));
      expect(loadWorkspaces(root)).toEqual({
        packages: [],
        fatal: { path: "package.json", message: "invalid workspaces" },
      });
    });
  });
});

describe("selectWorkspacePackages", () => {
  it("keeps the smaller declared path for one real directory", () => {
    expect(
      selectWorkspacePackages([
        { declaredPath: "packages/link", realPath: "/real/a", name: "one" },
        { declaredPath: "packages/a", realPath: "/real/a", name: "one" },
      ]),
    ).toEqual({ packages: [{ path: "packages/a", name: "one" }] });
  });

  it("returns fatal when one real directory has two names", () => {
    expect(
      selectWorkspacePackages([
        { declaredPath: "packages/a", realPath: "/real/a", name: "one" },
        { declaredPath: "packages/link", realPath: "/real/a", name: "two" },
      ]),
    ).toEqual({
      packages: [],
      fatal: { path: "packages/link", message: "disagreeing package name" },
    });
  });
});
