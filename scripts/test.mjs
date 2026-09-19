// Bundles every tests/*.test.ts through esbuild (so tests exercise the REAL
// src modules, not a reimplementation) and runs them in node. Any non-zero exit
// fails the run.
//
// web3.js ships CJS with dynamic require(), so the test bundles must be CJS —
// an ESM bundle dies on `Dynamic require of "buffer" is not supported`.

import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDir = path.join(root, "tests");
const outDir = path.join(testDir, "built");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entries = readdirSync(testDir).filter((f) => f.endsWith(".test.ts"));
if (entries.length === 0) {
  console.error("no tests found");
  process.exit(1);
}

await build({
  entryPoints: entries.map((f) => path.join(testDir, f)),
  bundle: true,
  platform: "node",
  format: "cjs",
  outdir: outDir,
  outExtension: { ".js": ".cjs" },
  logLevel: "error",
});

let failed = 0;
for (const f of entries) {
  const name = f.replace(/\.test\.ts$/, "");
  console.log(`\n── ${name} ──`);
  try {
    execFileSync(process.execPath, [path.join(outDir, `${name}.test.cjs`)], { stdio: "inherit" });
  } catch {
    failed++;
  }
}

rmSync(outDir, { recursive: true, force: true });
console.log(failed === 0 ? "\nAll tests passed." : `\n${failed} test file(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
