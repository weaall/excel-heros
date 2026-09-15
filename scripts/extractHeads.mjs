// Pixelise each character's head (hair + face) from the card illustration into a tiny sprite head, so the battle
// sprite carries the illustration's silhouette — hair shape, hair colour, accessories — not only its palette.
// Output: src/data/artHeads.js  { id: { w, h, px: [r,g,b,a, ...] } }   (head sprites are HEAD_W × HEAD_H pixels)
// Usage: node scripts/extractHeads.mjs
import fs from 'node:fs';
import { decodePNG } from './png.mjs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';

export const HEAD_W = 12, HEAD_H = 13;
const dir = new URL('../assets/cards/', import.meta.url);
const ids = [...HEROES.map((h) => h.id), ...Object.values(MAIN_JOBS).map((j) => j.id)];

const rgbToHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; };
const isSkin = (r, g, b) => { const [h, s, l] = rgbToHsl(r, g, b); return h >= 8 && h <= 45 && s >= 0.12 && s <= 0.8 && l >= 0.55 && l <= 0.93; };
const bucketKey = (r, g, b) => { const [h, s, l] = rgbToHsl(r, g, b); return `${Math.round(h / 12)}:${Math.round(s * 4)}:${Math.round(l * 5)}`; };

/** Background colour buckets sampled from the upper corners (the character is centred). */
function backgroundKeys(img) {
  const { width, height, data } = img; const keys = new Map();
  for (const [x0, x1] of [[0, 0.18], [0.82, 1]]) for (let y = 0; y < height * 0.5; y += 3) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x += 3) {
    const i = (y * width + x) * 4; const k = bucketKey(data[i], data[i + 1], data[i + 2]); keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const total = [...keys.values()].reduce((a, b) => a + b, 0);
  return new Set([...keys.entries()].filter(([, n]) => n > total * 0.012).map(([k]) => k));
}

/** Face box from skin pixels in the upper part of the picture (5th–95th percentiles to ignore hands). */
function faceBox(img) {
  const { width, height, data } = img; const xs = [], ys = [];
  for (let y = Math.floor(height * 0.03); y < height * 0.5; y += 2) for (let x = Math.floor(width * 0.2); x < width * 0.8; x += 2) {
    const i = (y * width + x) * 4; if (data[i + 3] > 200 && isSkin(data[i], data[i + 1], data[i + 2])) { xs.push(x); ys.push(y); }
  }
  if (xs.length < 200) return null;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b); const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
  // the face is the topmost dense skin blob: take pixels within the top 40% of the skin y-range
  const yTop = q(ys, 0.02), yCut = yTop + (q(ys, 0.98) - yTop) * 0.45;
  const fx = [], fy = [];
  for (let k = 0; k < xs.length; k++) if (ys[k] <= yCut) { fx.push(xs[k]); fy.push(ys[k]); }
  fx.sort((a, b) => a - b); fy.sort((a, b) => a - b);
  return { x0: q(fx, 0.06), x1: q(fx, 0.94), y0: q(fy, 0.04), y1: q(fy, 0.96) };
}

function pixelise(img, box, bgKeys) {
  const { width, height, data } = img; const out = new Uint8ClampedArray(HEAD_W * HEAD_H * 4);
  const cw = (box.x1 - box.x0) / HEAD_W, ch = (box.y1 - box.y0) / HEAD_H;
  for (let py = 0; py < HEAD_H; py++) for (let px = 0; px < HEAD_W; px++) {
    let r = 0, g = 0, b = 0, n = 0, cover = 0, total = 0;
    for (let y = Math.floor(box.y0 + py * ch); y < box.y0 + (py + 1) * ch; y += 2) for (let x = Math.floor(box.x0 + px * cw); x < box.x0 + (px + 1) * cw; x += 2) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue; total++;
      const i = (y * width + x) * 4; if (data[i + 3] < 40 || bgKeys.has(bucketKey(data[i], data[i + 1], data[i + 2]))) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; cover++;
    }
    const o = (py * HEAD_W + px) * 4;
    if (!n || cover / Math.max(1, total) < 0.45) { out[o + 3] = 0; continue; }
    // posterise to a pixel-art palette feel (8 levels per channel)
    out[o] = Math.round(r / n / 32) * 32 + 16; out[o + 1] = Math.round(g / n / 32) * 32 + 16; out[o + 2] = Math.round(b / n / 32) * 32 + 16; out[o + 3] = 255;
  }
  // 1px dark outline on silhouette edges (0x72 style: outline is part of the silhouette)
  const at = (x, y) => (x < 0 || y < 0 || x >= HEAD_W || y >= HEAD_H ? -1 : (y * HEAD_W + x) * 4);
  const edge = [];
  for (let y = 0; y < HEAD_H; y++) for (let x = 0; x < HEAD_W; x++) { const i = at(x, y); if (out[i + 3] === 0) continue; if ([at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].some((j) => j < 0 ? y === HEAD_H - 1 && false : out[j + 3] === 0)) edge.push(i); }
  for (const i of edge) { out[i] = Math.round(out[i] * 0.42); out[i + 1] = Math.round(out[i + 1] * 0.42); out[i + 2] = Math.round(out[i + 2] * 0.42); }
  return out;
}

const heads = {}; let n = 0;
for (const id of ids) {
  const file = new URL(`${id}.png`, dir); if (!fs.existsSync(file)) continue;
  const img = decodePNG(fs.readFileSync(file)); const bgKeys = backgroundKeys(img);
  const f = faceBox(img);
  const fw = f ? f.x1 - f.x0 : img.width * 0.18, cx = f ? (f.x0 + f.x1) / 2 : img.width * 0.5, fy0 = f ? f.y0 : img.height * 0.14, fy1 = f ? f.y1 : img.height * 0.3;
  // head box: hair spreads ~1× face width to each side and ~0.9 face-heights above the face; stop at the chin
  const w = fw * 2.05, h = w * (HEAD_H / HEAD_W);
  const box = { x0: cx - w / 2, x1: cx + w / 2, y1: fy1 + (fy1 - fy0) * 0.12 }; box.y0 = box.y1 - h;
  heads[id] = { w: HEAD_W, h: HEAD_H, px: Array.from(pixelise(img, box, bgKeys)) };
  n++; console.log(id.padEnd(12), f ? `face ${Math.round(fw)}px @ (${Math.round(cx)}, ${Math.round(fy0)}-${Math.round(fy1)})` : 'face not found → centre fallback');
}
fs.writeFileSync(new URL('../src/data/artHeads.js', import.meta.url), `// Generated by scripts/extractHeads.mjs — ${HEAD_W}×${HEAD_H} pixelised heads (hair + face) taken from the card\n// illustrations; stamped onto the battle sprites by heroSkins.js so the sprite silhouette matches the art.\nexport const HEAD_W = ${HEAD_W}, HEAD_H = ${HEAD_H};\nexport const ART_HEADS = ${JSON.stringify(heads)};\n`);
console.log(`artHeads.js: ${n} heads`);
