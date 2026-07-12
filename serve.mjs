// Tiny static server for the dev preview (dist/dev.html). Port 8331.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const PORT = 8331;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let file = decodeURIComponent(url.pathname);
    if (file === "/") file = "/dev.html";
    const full = path.join(dist, path.normalize(file));
    if (!full.startsWith(dist)) throw new Error("path traversal");
    const body = await readFile(full);
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, () => console.log(`SOLWALL dev preview -> http://localhost:${PORT}/`));
