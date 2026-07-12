// Generates the extension icons (16/32/48/128 px PNG) with zero deps:
// per-pixel render of the SOLWALL "sun over horizon" mark + minimal PNG encoder.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// ---- PNG encoding ----

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- artwork ----

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const cornerR = size * 0.24;
  const sunCx = size * 0.5;
  const sunCy = size * 0.44;
  const sunR = size * 0.27;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-square alpha mask
      const dx = Math.max(cornerR - x, x - (size - 1 - cornerR), 0);
      const dy = Math.max(cornerR - y, y - (size - 1 - cornerR), 0);
      const cornerDist = Math.hypot(dx, dy);
      const alpha = cornerDist <= cornerR ? 255 : 0;
      if (!alpha) continue;

      // warm obsidian base with a faint vertical glow toward the sun
      let r = 20, g = 16, b = 9;

      const d = Math.hypot(x - sunCx, y - sunCy) / sunR;
      if (d < 1) {
        // sun disc: radial gold gradient
        const t = d * d;
        r = lerp(255, 196, t);
        g = lerp(225, 123, t);
        b = lerp(160, 19, t);
      } else if (d < 1.8) {
        // corona glow
        const t = (d - 1) / 0.8;
        const glow = (1 - t) * (1 - t) * 0.55;
        r = lerp(r, 245, glow);
        g = lerp(g, 184, glow);
        b = lerp(b, 67, glow);
      }

      // horizon lines (bottom quarter)
      const h1 = Math.round(size * 0.78);
      const h2 = Math.round(size * 0.88);
      const lineW = Math.max(1, Math.round(size / 24));
      if (y >= h1 && y < h1 + lineW && x > size * 0.14 && x < size * 0.86) {
        r = 214; g = 158; b = 58;
      } else if (y >= h2 && y < h2 + Math.max(1, lineW - 1) && x > size * 0.24 && x < size * 0.76) {
        r = 130; g = 96, b = 38;
      }

      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = alpha;
    }
  }
  return px;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(path.join(outDir, `icon${size}.png`), encodePng(size, render(size)));
}
console.log("icons written -> public/icons/");
