// SOLWALL build — esbuild, four extension bundles + optional dev harness.
//   popup.js/.css  – React UI (chrome popup + approval windows)
//   background.js  – MV3 service worker
//   content.js     – content-script bridge (no Buffer, tiny)
//   inpage.js      – injected provider (no Buffer, tiny)
//   dev.js/.css    – popup + in-process backend for browser preview

import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  format: "iife",
  target: ["chrome110"],
  outdir: dist,
  minify: true,
  sourcemap: false,
  logLevel: "info",
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
  loader: { ".woff2": "file", ".woff": "file" },
  assetNames: "assets/[name]-[hash]",
};

// Heavy bundles (web3.js needs the Buffer global).
await build({
  ...common,
  entryPoints: {
    popup: path.join(root, "src/popup/main.tsx"),
    background: path.join(root, "src/background/index.ts"),
    dev: path.join(root, "src/dev/main.tsx"),
  },
  inject: [path.join(root, "src/lib/buffer-shim.js")],
});

// Light bundles — page-context scripts, keep them dependency-free.
await build({
  ...common,
  entryPoints: {
    content: path.join(root, "src/content/content.ts"),
    inpage: path.join(root, "src/content/inpage.ts"),
  },
});

cpSync(path.join(root, "public"), dist, { recursive: true });
console.log("\nSOLWALL built -> dist/ (load as unpacked extension)");
