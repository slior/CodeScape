import type { SnapshotOptions } from "@sw3d/model";
import { SnapshotFatal } from "./fatal.js";
import { snapshot } from "./snapshot.js";
import { view } from "./view.js";

function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) throw new SnapshotFatal(`missing ${flag} value`);
  return value;
}

export function parseSnapshotArgs(argv: readonly string[]): SnapshotOptions {
  const positional: string[] = [];
  let out: string | undefined;
  let config: string | undefined;
  const ignore: string[] = [];
  let open = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--out") {
      index += 1;
      out = requireValue(argv, index, "--out");
    } else if (arg === "--config") {
      index += 1;
      config = requireValue(argv, index, "--config");
    } else if (arg === "--ignore") {
      index += 1;
      ignore.push(requireValue(argv, index, "--ignore"));
    } else if (arg === "--open") {
      open = true;
    } else if (arg.startsWith("--")) {
      throw new SnapshotFatal(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) throw new SnapshotFatal("snapshot requires exactly one folder");
  const folder = positional[0];
  if (folder === undefined) throw new SnapshotFatal("snapshot requires exactly one folder");
  if (out === undefined) throw new SnapshotFatal("snapshot requires --out");
  const options: SnapshotOptions = { folder, out, ignore, open };
  if (config !== undefined) options.config = config;
  return options;
}

function parseViewDir(argv: readonly string[]): string {
  const dir = argv[0];
  if (argv.length !== 1 || dir === undefined || dir.startsWith("--")) {
    throw new SnapshotFatal("view requires exactly one directory");
  }
  return dir;
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const command = argv[0];
    if (command === "snapshot") {
      const options = parseSnapshotArgs(argv.slice(1));
      const result = snapshot(options);
      if (options.open) await view({ dir: result.outDir });
      return 0;
    }
    if (command === "view") {
      await view({ dir: parseViewDir(argv.slice(1)) });
      return 0;
    }
    console.error(
      "usage: sw3d snapshot <folder> --out <dir> [--config <file>] [--ignore <glob>]... [--open]\n       sw3d view <dir>",
    );
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
