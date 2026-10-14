import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "@jest/globals";
import { view } from "./view.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function fingerprint(dir: string): string {
  const lines: string[] = [];
  const walk = (current: string): void => {
    const names = readdirSync(current);
    names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      const full = path.join(current, name);
      const rel = path.relative(dir, full);
      if (statSync(full).isDirectory()) walk(full);
      else lines.push(`${rel}\0${readFileSync(full)}`);
    }
  };
  walk(dir);
  return lines.join("\n");
}

describe("view", () => {
  it("exits by rejecting when index.html is missing and does not change the directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sw3d-view-"));
    roots.push(dir);
    writeFileSync(path.join(dir, "world.json"), "{\"version\":1}\n");
    writeFileSync(path.join(dir, "keep.txt"), "stay");
    const before = fingerprint(dir);
    await expect(view({ dir })).rejects.toThrow(/index.html/);
    expect(fingerprint(dir)).toBe(before);
  });

  it("exits by rejecting when world.json is missing and does not change the directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sw3d-view-"));
    roots.push(dir);
    writeFileSync(path.join(dir, "index.html"), "<p>city</p>\n");
    writeFileSync(path.join(dir, "keep.txt"), "stay");
    const before = fingerprint(dir);
    await expect(view({ dir })).rejects.toThrow(/world.json/);
    expect(fingerprint(dir)).toBe(before);
    expect(existsSync(path.join(dir, "keep.txt"))).toBe(true);
  });

  it("serves index.html on localhost and does not modify the directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sw3d-view-"));
    roots.push(dir);
    writeFileSync(path.join(dir, "index.html"), "<!DOCTYPE html><p>city</p>\n");
    writeFileSync(path.join(dir, "world.json"), "{\"version\":1}\n");
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "assets", "viewer.js"), "console.log('viewer');\n");
    const before = fingerprint(dir);
    const ac = new AbortController();
    let url = "";
    const pending = view({ dir }, { signal: ac.signal, onListen: (value) => { url = value; } });
    const started = Date.now();
    while (url === "" && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("city");
    const asset = await fetch(`${url}assets/viewer.js`);
    expect(await asset.text()).toContain("viewer");
    ac.abort();
    await pending;
    expect(fingerprint(dir)).toBe(before);
  });

  it("does not serve a file through a symlink that resolves outside the directory", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sw3d-view-"));
    const outside = mkdtempSync(path.join(tmpdir(), "sw3d-view-out-"));
    roots.push(dir, outside);
    writeFileSync(path.join(dir, "index.html"), "<!DOCTYPE html><p>city</p>\n");
    writeFileSync(path.join(dir, "world.json"), "{\"version\":1}\n");
    writeFileSync(path.join(outside, "secret.txt"), "secret-bytes\n");
    symlinkSync(path.join(outside, "secret.txt"), path.join(dir, "secret.txt"));
    const ac = new AbortController();
    let url = "";
    const pending = view({ dir }, { signal: ac.signal, onListen: (value) => { url = value; } });
    const started = Date.now();
    while (url === "" && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const response = await fetch(`${url}secret.txt`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("secret-bytes");
    ac.abort();
    await pending;
  });
});
