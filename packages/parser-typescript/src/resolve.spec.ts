import { describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import type { ParseInput, WorkspacePackage } from "@sw3d/model";
import { resolveSpecifier } from "./resolve.js";

function input(values: {
  files?: readonly { path: string; text: string }[];
  includedPaths: readonly string[];
  packages?: readonly WorkspacePackage[];
}): ParseInput {
  return {
    root: "/repo",
    files: values.files ?? [],
    includedPaths: values.includedPaths,
    packages: values.packages ?? [],
  };
}

describe("resolveSpecifier", () => {
  it("does not read the filesystem", () => {
    const readFileSync = jest.spyOn(fs, "readFileSync");
    resolveSpecifier("lodash", "src/a.ts", input({ includedPaths: [] }));
    expect(readFileSync).not.toHaveBeenCalled();
    readFileSync.mockRestore();
  });

  it("maps a package name to src/index.ts ahead of dist and the other index probes", () => {
    const packages = [{ path: "packages/core", name: "dialectic-core" }];
    const includedPaths = [
      "packages/core/dist/index.ts",
      "packages/core/src/index.tsx",
      "packages/core/index.ts",
      "packages/core/index.tsx",
      "packages/core/src/index.ts",
    ];
    expect(resolveSpecifier("dialectic-core", "packages/cli/src/main.ts", input({ includedPaths, packages }))).toEqual({
      kind: "internal",
      file: "packages/core/src/index.ts",
    });
    expect(
      resolveSpecifier(
        "dialectic-core",
        "packages/cli/src/main.ts",
        input({
          includedPaths: ["packages/core/src/index.tsx", "packages/core/index.ts"],
          packages,
        }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/src/index.tsx" });
    expect(
      resolveSpecifier(
        "dialectic-core",
        "packages/cli/src/main.ts",
        input({ includedPaths: ["packages/core/index.tsx"], packages }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/index.tsx" });
    expect(
      resolveSpecifier(
        "dialectic-core",
        "packages/cli/src/main.ts",
        input({ includedPaths: ["packages/core/index.ts", "packages/core/index.tsx"], packages }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/index.ts" });
  });

  it("drops a package name whose only included file is dist output", () => {
    expect(
      resolveSpecifier(
        "dialectic-core",
        "packages/cli/src/main.ts",
        input({
          includedPaths: ["packages/core/dist/index.ts"],
          packages: [{ path: "packages/core", name: "dialectic-core" }],
        }),
      ),
    ).toEqual({ kind: "drop", message: "unresolved specifier dialectic-core" });
  });

  it("resolves @scope/pkg/foo.js to src/foo.ts and not src/foo.js.ts", () => {
    const packages = [{ path: "packages/pkg", name: "@scope/pkg" }];
    const fromFile = "packages/cli/src/main.ts";
    expect(
      resolveSpecifier(
        "@scope/pkg/foo.js",
        fromFile,
        input({
          includedPaths: ["packages/pkg/src/foo.js.ts", "packages/pkg/src/foo.ts"],
          packages,
        }),
      ),
    ).toEqual({ kind: "internal", file: "packages/pkg/src/foo.ts" });
    expect(
      resolveSpecifier(
        "@scope/pkg/foo.js",
        fromFile,
        input({ includedPaths: ["packages/pkg/src/foo.js.ts"], packages }),
      ),
    ).toEqual({ kind: "drop", message: "unresolved specifier @scope/pkg/foo.js" });
  });

  it("strips a trailing .jsx and does not probe foo.jsx.ts", () => {
    const packages = [{ path: "packages/pkg", name: "@scope/pkg" }];
    const fromFile = "packages/cli/src/main.ts";
    expect(
      resolveSpecifier(
        "@scope/pkg/foo.jsx",
        fromFile,
        input({
          includedPaths: ["packages/pkg/src/foo.jsx.ts", "packages/pkg/src/foo.ts"],
          packages,
        }),
      ),
    ).toEqual({ kind: "internal", file: "packages/pkg/src/foo.ts" });
    expect(
      resolveSpecifier(
        "@scope/pkg/foo.jsx",
        fromFile,
        input({ includedPaths: ["packages/pkg/src/foo.jsx.ts"], packages }),
      ),
    ).toEqual({ kind: "drop", message: "unresolved specifier @scope/pkg/foo.jsx" });
  });

  it("walks subpath probes in order after the package root", () => {
    const packages = [{ path: "packages/pkg", name: "@scope/pkg" }];
    const fromFile = "packages/cli/src/main.ts";
    const probes = [
      "packages/pkg/src/foo.ts",
      "packages/pkg/src/foo.tsx",
      "packages/pkg/src/foo/index.ts",
      "packages/pkg/src/foo/index.tsx",
      "packages/pkg/foo.ts",
      "packages/pkg/foo.tsx",
      "packages/pkg/foo/index.ts",
      "packages/pkg/foo/index.tsx",
    ];
    for (const [index, hit] of probes.entries()) {
      expect(
        resolveSpecifier("@scope/pkg/foo", fromFile, input({ includedPaths: probes.slice(index), packages })),
      ).toEqual({ kind: "internal", file: hit });
    }
  });

  it("lets the longest package name win", () => {
    expect(
      resolveSpecifier(
        "@scope/a/b",
        "apps/main.ts",
        input({
          includedPaths: ["packages/a/src/b.ts", "packages/ab/src/index.ts"],
          packages: [
            { path: "packages/a", name: "@scope/a" },
            { path: "packages/ab", name: "@scope/a/b" },
          ],
        }),
      ),
    ).toEqual({ kind: "internal", file: "packages/ab/src/index.ts" });
  });

  it("resolves ./foo.js to foo.ts", () => {
    expect(
      resolveSpecifier(
        "./foo.js",
        "pkg/src/main.ts",
        input({ includedPaths: ["pkg/src/foo.ts", "pkg/src/foo.js.ts"] }),
      ),
    ).toEqual({ kind: "internal", file: "pkg/src/foo.ts" });
    expect(
      resolveSpecifier("./foo.js", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/foo.tsx"] })),
    ).toEqual({ kind: "internal", file: "pkg/src/foo.tsx" });
    expect(
      resolveSpecifier("./foo.js", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/foo/index.ts"] })),
    ).toEqual({ kind: "internal", file: "pkg/src/foo/index.ts" });
  });

  it("resolves ./foo.jsx through the reduced probes and ./file.tsx only to that path", () => {
    expect(
      resolveSpecifier(
        "./foo.jsx",
        "pkg/src/main.ts",
        input({ includedPaths: ["pkg/src/foo.jsx.ts", "pkg/src/foo.ts"] }),
      ),
    ).toEqual({ kind: "internal", file: "pkg/src/foo.ts" });
    expect(
      resolveSpecifier("./foo.jsx", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/foo.tsx"] })),
    ).toEqual({ kind: "internal", file: "pkg/src/foo.tsx" });
    expect(
      resolveSpecifier("./foo.jsx", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/foo/index.tsx"] })),
    ).toEqual({ kind: "internal", file: "pkg/src/foo/index.tsx" });
    expect(
      resolveSpecifier("./foo.jsx", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/foo.jsx.ts"] })),
    ).toEqual({ kind: "drop", message: "unresolved specifier ./foo.jsx" });
    expect(
      resolveSpecifier(
        "./file.tsx",
        "pkg/src/main.ts",
        input({ includedPaths: ["pkg/src/file.tsx", "pkg/src/file.tsx.ts"] }),
      ),
    ).toEqual({ kind: "internal", file: "pkg/src/file.tsx" });
    expect(
      resolveSpecifier("./file.tsx", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/file.ts"] })),
    ).toEqual({ kind: "drop", message: "unresolved specifier ./file.tsx" });
  });

  it("prefers ./shared.ts over shared/index.ts and falls back to the index", () => {
    const fromFile = "packages/core/src/agents/prompts/x.ts";
    expect(
      resolveSpecifier(
        "./shared",
        fromFile,
        input({
          includedPaths: [
            "packages/core/src/agents/prompts/shared/index.ts",
            "packages/core/src/agents/prompts/shared.ts",
          ],
        }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/src/agents/prompts/shared.ts" });
    expect(
      resolveSpecifier(
        "./shared",
        fromFile,
        input({ includedPaths: ["packages/core/src/agents/prompts/shared/index.ts"] }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/src/agents/prompts/shared/index.ts" });
  });

  it("resolves ../../types/debate.types to debate.types.ts", () => {
    expect(
      resolveSpecifier(
        "../../types/debate.types",
        "packages/core/src/agents/prompts/testing-prompts.ts",
        input({ includedPaths: ["packages/core/src/types/debate.types.ts"] }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/src/types/debate.types.ts" });
  });

  it("resolves an explicit .ts path only to that path", () => {
    expect(
      resolveSpecifier(
        "./file.ts",
        "pkg/src/main.ts",
        input({ includedPaths: ["pkg/src/file.ts", "pkg/src/file.ts.ts"] }),
      ),
    ).toEqual({ kind: "internal", file: "pkg/src/file.ts" });
    expect(
      resolveSpecifier("./file.ts", "pkg/src/main.ts", input({ includedPaths: ["pkg/src/file.ts.ts"] })),
    ).toEqual({ kind: "drop", message: "unresolved specifier ./file.ts" });
  });

  it("drops a .d.ts target, a markdown target, and a path that is not included", () => {
    expect(
      resolveSpecifier(
        "./types.d.ts",
        "pkg/src/main.ts",
        input({ includedPaths: ["pkg/src/types.d.ts"] }),
      ),
    ).toEqual({ kind: "drop", message: "unresolved specifier ./types.d.ts" });
    expect(
      resolveSpecifier("./README.md", "pkg/a.ts", input({ includedPaths: ["pkg/README.md"] })),
    ).toEqual({ kind: "drop", message: "unresolved specifier ./README.md" });
    expect(resolveSpecifier("../x", "a.ts", input({ includedPaths: ["x.ts"] }))).toEqual({
      kind: "drop",
      message: "unresolved specifier ../x",
    });
  });

  it("treats an unreadable path that is only in includedPaths as internal", () => {
    expect(
      resolveSpecifier(
        "./missing.ts",
        "packages/core/src/main.ts",
        input({
          files: [],
          includedPaths: ["packages/core/src/missing.ts"],
        }),
      ),
    ).toEqual({ kind: "internal", file: "packages/core/src/missing.ts" });
  });

  it("normalizes lodash and lodash/fp to external lodash even when node_modules is listed", () => {
    const includedPaths = ["node_modules/lodash/index.ts", "src/a.ts"];
    expect(resolveSpecifier("lodash", "src/a.ts", input({ includedPaths }))).toEqual({
      kind: "external",
      name: "lodash",
    });
    expect(resolveSpecifier("lodash/fp", "src/a.ts", input({ includedPaths }))).toEqual({
      kind: "external",
      name: "lodash",
    });
    expect(resolveSpecifier("@scope/pkg/sub", "src/a.ts", input({ includedPaths: [] }))).toEqual({
      kind: "external",
      name: "@scope/pkg",
    });
  });
});
