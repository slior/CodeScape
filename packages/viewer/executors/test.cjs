const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { createRequire } = require("node:module");

async function testExecutor(options, context) {
  const projectRoot = path.join(context.root, "packages", "viewer");
  const requireFromViewer = createRequire(path.join(projectRoot, "package.json"));
  const vitestEntry = requireFromViewer.resolve("vitest/vitest.mjs");
  const args = [vitestEntry, "run", "--config", path.join(projectRoot, "vitest.config.ts")];
  if (typeof options.testPathPattern === "string" && options.testPathPattern.length > 0) {
    args.push(options.testPathPattern);
  }
  if (options.coverage) args.push("--coverage");
  const result = spawnSync(process.execPath, args, { cwd: projectRoot, stdio: "inherit" });
  return { success: result.status === 0 };
}

module.exports = testExecutor;
