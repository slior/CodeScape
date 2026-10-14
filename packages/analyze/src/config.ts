import * as fs from "node:fs";
import path from "node:path";
import type { Sw3dConfig } from "./ignore.js";
import { SnapshotFatal } from "./fatal.js";

function expectStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new SnapshotFatal(`${label} must be an array of strings`);
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") throw new SnapshotFatal(`${label} must be an array of strings`);
    out.push(item);
  }
  return out;
}

function validateLanguages(value: unknown): NonNullable<Sw3dConfig["languages"]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SnapshotFatal("languages must be an object");
  }
  const record = value as Record<string, unknown>;
  const languages: Record<string, { useDefaults?: boolean; ignore?: string[] }> = {};
  for (const [id, raw] of Object.entries(record)) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new SnapshotFatal(`languages.${id} must be an object`);
    }
    const lang = raw as Record<string, unknown>;
    for (const key of Object.keys(lang)) {
      if (key !== "useDefaults" && key !== "ignore") throw new SnapshotFatal(`unknown config key: languages.${id}.${key}`);
    }
    const entry: { useDefaults?: boolean; ignore?: string[] } = {};
    if ("useDefaults" in lang) {
      if (typeof lang["useDefaults"] !== "boolean") throw new SnapshotFatal("useDefaults must be a boolean");
      entry.useDefaults = lang["useDefaults"];
    }
    if ("ignore" in lang) entry.ignore = expectStringArray(lang["ignore"], `languages.${id}.ignore`);
    languages[id] = entry;
  }
  return languages;
}

function validateConfig(value: unknown): Sw3dConfig {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SnapshotFatal("config must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "ignore" && key !== "languages") throw new SnapshotFatal(`unknown config key: ${key}`);
  }
  const config: Sw3dConfig = {};
  if ("ignore" in record) config.ignore = expectStringArray(record["ignore"], "ignore");
  if ("languages" in record) config.languages = validateLanguages(record["languages"]);
  return config;
}

export function loadConfig(root: string, configPath: string | undefined): Sw3dConfig | null {
  let file: string | null = null;
  if (configPath !== undefined) {
    const resolved = path.resolve(configPath);
    if (!fs.existsSync(resolved)) throw new SnapshotFatal(`config file not found: ${resolved}`);
    file = resolved;
  } else {
    const fallback = path.join(root, "sw3d.config.json");
    if (fs.existsSync(fallback)) file = fallback;
  }
  if (file === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new SnapshotFatal(`config file is not valid JSON: ${file}`);
  }
  return validateConfig(parsed);
}
