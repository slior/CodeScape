import * as fs from "node:fs";
import * as http from "node:http";
import path from "node:path";
import type { ViewOptions } from "@sw3d/model";
import { SnapshotFatal } from "./fatal.js";

export interface ViewExtras {
  signal?: AbortSignal;
  port?: number;
  onListen?: (url: string) => void;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
};

function resolveInside(root: string, urlPath: string): string | null {
  const noQuery = urlPath.split("?")[0] ?? "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(noQuery);
  } catch {
    return null;
  }
  const relative = decoded.replace(/^\/+/, "");
  const full = path.resolve(root, relative.length === 0 ? "index.html" : relative);
  let rootReal: string;
  let fileReal: string;
  try {
    rootReal = fs.realpathSync(root);
    fileReal = fs.realpathSync(full);
  } catch {
    return null;
  }
  if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${path.sep}`)) return null;
  return fileReal;
}

export function view(options: ViewOptions, extras?: ViewExtras): Promise<void> {
  const dir = path.resolve(options.dir);
  if (!fs.existsSync(path.join(dir, "index.html")) || !fs.existsSync(path.join(dir, "world.json"))) {
    return Promise.reject(new SnapshotFatal("snapshot directory must contain index.html and world.json"));
  }
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const full = resolveInside(dir, request.url ?? "/");
      if (!full) {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      if (!stat.isFile()) {
        response.statusCode = 404;
        response.end("not found");
        return;
      }
      const type = TYPES[path.extname(full)] ?? "application/octet-stream";
      response.setHeader("content-type", type);
      fs.createReadStream(full).pipe(response);
    });
    server.on("error", reject);
    server.listen(extras?.port ?? 0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new SnapshotFatal("view failed to bind"));
        return;
      }
      const url = `http://127.0.0.1:${address.port}/`;
      console.log(url);
      extras?.onListen?.(url);
      const stop = (): void => {
        server.close(() => resolve());
      };
      if (extras?.signal?.aborted) {
        stop();
        return;
      }
      extras?.signal?.addEventListener("abort", stop, { once: true });
    });
  });
}
