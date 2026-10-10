import { describe, expect, it } from "@jest/globals";
import { isIgnored, mergeIgnorePatterns } from "./ignore.js";

const TYPESCRIPT_DEFAULTS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".nx",
] as const;

describe("mergeIgnorePatterns", () => {
  it("orders defaults, top-level ignore, typescript ignore, then CLI patterns", () => {
    expect(
      mergeIgnorePatterns(
        TYPESCRIPT_DEFAULTS,
        {
          ignore: ["**/generated/**"],
          languages: { typescript: { useDefaults: true, ignore: ["**/*.spec.ts"] } },
        },
        ["cli-a", "cli-b"],
      ),
    ).toEqual([
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".nx",
      "**/generated/**",
      "**/*.spec.ts",
      "cli-a",
      "cli-b",
    ]);
  });

  it("drops defaults when typescript useDefaults is false and still appends both ignore lists", () => {
    expect(
      mergeIgnorePatterns(
        TYPESCRIPT_DEFAULTS,
        {
          ignore: ["**/generated/**"],
          languages: { typescript: { useDefaults: false, ignore: ["**/*.spec.ts"] } },
        },
        ["cli-a"],
      ),
    ).toEqual(["**/generated/**", "**/*.spec.ts", "cli-a"]);
  });

  it("keeps defaults when languages is missing", () => {
    expect(mergeIgnorePatterns(["node_modules"], { ignore: ["dist"] }, ["extra"])).toEqual([
      "node_modules",
      "dist",
      "extra",
    ]);
  });

  it("keeps defaults when useDefaults is absent and language ignore is absent", () => {
    expect(mergeIgnorePatterns(["node_modules"], { languages: { typescript: {} } }, [])).toEqual([
      "node_modules",
    ]);
  });

  it("returns defaults then CLI patterns when config is null", () => {
    expect(mergeIgnorePatterns(TYPESCRIPT_DEFAULTS, null, ["!keep.ts"])).toEqual([
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".nx",
      "!keep.ts",
    ]);
  });

  it("lets a CLI negation re-include after defaults", () => {
    const patterns = mergeIgnorePatterns(["*.ts"], null, ["!keep.ts"]);
    expect(isIgnored("keep.ts", "keep.ts", patterns, false)).toBe(false);
    expect(isIgnored("other.ts", "other.ts", patterns, false)).toBe(true);
  });
});

describe("isIgnored", () => {
  it("lets the last matching pattern win", () => {
    expect(isIgnored("keep.ts", "keep.ts", ["*.ts", "!keep.ts"], false)).toBe(false);
    expect(isIgnored("other.ts", "other.ts", ["*.ts", "!keep.ts"], false)).toBe(true);
    expect(isIgnored("keep.ts", "keep.ts", ["!keep.ts", "*.ts"], false)).toBe(true);
    expect(isIgnored("src/keep.ts", "src/keep.ts", ["*.ts", "!keep.ts"], false)).toBe(false);
  });

  it("matches a pattern with no slash in any directory", () => {
    const patterns = ["dist", ".git", "build", "coverage", ".nx"] as const;
    expect(isIgnored("dist", "dist", patterns, true)).toBe(true);
    expect(isIgnored("packages/core/dist/index.ts", "packages/core/dist/index.ts", patterns, false)).toBe(
      true,
    );
    expect(isIgnored("pkg/.git/config", "pkg/.git/config", patterns, false)).toBe(true);
    expect(isIgnored("build/out.js", "build/out.js", patterns, false)).toBe(true);
    expect(isIgnored("coverage/lcov.info", "coverage/lcov.info", patterns, false)).toBe(true);
    expect(isIgnored(".nx/cache", ".nx/cache", patterns, false)).toBe(true);
    expect(isIgnored("src/app.ts", "src/app.ts", patterns, false)).toBe(false);
    expect(isIgnored("build", "build", ["build/"], true)).toBe(true);
    expect(isIgnored("build/out.ts", "build/out.ts", ["build/"], false)).toBe(true);
  });

  it("treats a trailing slash as directory-only", () => {
    expect(isIgnored("foo.ts", "foo.ts", ["foo.ts/"], false)).toBe(false);
    expect(isIgnored("foo.ts", "foo.ts", ["foo.ts/"], true)).toBe(true);
    expect(isIgnored("foo.ts/nested.ts", "foo.ts/nested.ts", ["foo.ts/"], false)).toBe(true);
  });

  it("keeps generated/keep.ts when the directory itself is not ignored", () => {
    const patterns = ["generated/*", "!generated/keep.ts"] as const;
    expect(isIgnored("generated", "generated", patterns, true)).toBe(false);
    expect(isIgnored("generated/keep.ts", "generated/keep.ts", patterns, false)).toBe(false);
    expect(isIgnored("generated/drop.ts", "generated/drop.ts", patterns, false)).toBe(true);
    expect(isIgnored("generated/sub/x.ts", "generated/sub/x.ts", patterns, false)).toBe(true);
  });

  it("does not re-include a file under an ignored node_modules directory", () => {
    const patterns = ["node_modules", "!node_modules/keep.ts"] as const;
    expect(isIgnored("node_modules", "node_modules", patterns, true)).toBe(true);
    expect(isIgnored("node_modules/keep.ts", "node_modules/keep.ts", patterns, false)).toBe(true);
    expect(isIgnored("pkg/node_modules/keep.ts", "pkg/node_modules/keep.ts", patterns, false)).toBe(true);
    expect(isIgnored("a/b/c.ts", "a/b/c.ts", ["a", "!a/b/c.ts"], false)).toBe(true);
  });

  it("stays ignored when only one of traversal and canonical is re-included", () => {
    expect(
      isIgnored("aaa/src/x.ts", "packages/core/src/x.ts", ["packages/core/**", "!aaa/**"], false),
    ).toBe(true);
    expect(
      isIgnored("aaa/src/x.ts", "packages/core/src/x.ts", ["aaa/**", "!packages/core/**"], false),
    ).toBe(true);
    expect(
      isIgnored(
        "packages/core/src/x.ts",
        "packages/core/src/x.ts",
        ["packages/core/**", "!packages/core/**"],
        false,
      ),
    ).toBe(false);
    expect(isIgnored("src/app.ts", "src/app.ts", [], false)).toBe(false);
  });

  it("applies globstar patterns from the config example", () => {
    expect(isIgnored("src/app.spec.ts", "src/app.spec.ts", ["**/*.spec.ts"], false)).toBe(true);
    expect(isIgnored("app.spec.ts", "app.spec.ts", ["**/*.spec.ts"], false)).toBe(true);
    expect(isIgnored("src/app.ts", "src/app.ts", ["**/*.spec.ts"], false)).toBe(false);
    expect(isIgnored("src/generated/a.ts", "src/generated/a.ts", ["**/generated/**"], false)).toBe(true);
    expect(isIgnored("generated/a.ts", "generated/a.ts", ["**/generated/**"], false)).toBe(true);
  });

  it("anchors a leading-slash pattern to the root", () => {
    expect(isIgnored("dist", "dist", ["/dist"], true)).toBe(true);
    expect(isIgnored("dist/a.ts", "dist/a.ts", ["/dist"], false)).toBe(true);
    expect(isIgnored("pkg/dist", "pkg/dist", ["/dist"], true)).toBe(false);
    expect(isIgnored("pkg/dist/a.ts", "pkg/dist/a.ts", ["/dist"], false)).toBe(false);
  });
});
