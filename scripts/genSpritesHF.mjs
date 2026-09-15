// Pixel-art battle sprites generated from the same character description as the card illustration, using the
// Animagine XL 4.0 Space's "Pixel art" style preset, then reduced to a real 2px-grid sprite:
//   raw 1024×1024 image → background removal (corner flood fill) → crop → area-downscale to NATIVE_W×NATIVE_H
//   → palette quantisation (median cut) → 1px dark outline → assets/sprites/<id>.png (+ <id>@4x.png for review)
// Usage:
//   node scripts/genSpritesHF.mjs ceo coo             # generate + process the given ids
//   node scripts/genSpritesHF.mjs --process ceo       # re-process an existing raw image (no GPU call)
//   SIZE=24x42 node scripts/genSpritesHF.mjs ceo      # alternative native size (default 16x28 = 0x72 hero size)
import fs from 'node:fs';
import { decodePNG, encodePNG } from './png.mjs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';
import { describe, callGenerate } from './genCardsHF.mjs';

const [NATIVE_W, NATIVE_H] = (process.env.SIZE ?? '16x28').split('x').map(Number);
const COLORS = Number(process.env.COLORS ?? 10);
const rawDir = new URL('../assets/sprites/raw/', import.meta.url), outDir = new URL('../assets/sprites/', import.meta.url);
fs.mkdirSync(rawDir, { recursive: true });

const SPRITE_TAGS = 'pixel art, sprite, full body, standing, facing right, side view, chibi, simple flat white background, no shadow, clean pixel outline, limited palette, 16-bit game sprite, centered';
const NEG = 'lowres, bad anatomy, text, watermark, signature, multiple views, cropped, blurry, gradient background, realistic, 3d, noise, scenery, multiple characters';

export function spritePrompt(def, profileId) { return `${describe(def, profileId)}, ${SPRITE_TAGS}, masterpiece, best quality`; }

// ------------------------------------------------------------------ image processing --
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Remove the flat background by flood filling from the corners (tolerance in RGB distance). Returns a copy with alpha. */
function removeBackground(img, tol = 60) {
  const { width: w, height: h } = img; const data = new Uint8ClampedArray(img.data);
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const seeds = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1], [w >> 1, 0], [0, h >> 1], [w - 1, h >> 1]];
  const bg = seeds.map(([x, y]) => px(x, y));
  const isBg = (x, y) => bg.some((c) => dist2(px(x, y), c) < tol * tol);
  const seen = new Uint8Array(w * h); const stack = seeds.filter(([x, y]) => isBg(x, y));
  for (const [x, y] of stack) seen[y * w + x] = 1;
  while (stack.length) {
    const [x, y] = stack.pop(); data[(y * w + x) * 4 + 3] = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue; if (isBg(nx, ny)) { seen[ny * w + nx] = 1; stack.push([nx, ny]); } }
  }
  return { width: w, height: h, data };
}

function bbox(img, minAlpha = 128) {
  const { width: w, height: h, data } = img; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] >= minAlpha) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Area-average downscale of the bbox region into an NW×NH sprite, keeping aspect (fit inside, bottom-aligned). */
function downscale(img, box, NW, NH) {
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0; const scale = Math.min((NW - 2) / bw, NH / bh);
  const sw = Math.max(1, Math.round(bw * scale)), sh = Math.max(1, Math.round(bh * scale));
  const ox = Math.floor((NW - sw) / 2), oy = NH - sh;
  const out = new Uint8ClampedArray(NW * NH * 4);
  for (let py = 0; py < sh; py++) for (let px = 0; px < sw; px++) {
    const sx0 = box.x0 + (px / sw) * bw, sx1 = box.x0 + ((px + 1) / sw) * bw, sy0 = box.y0 + (py / sh) * bh, sy1 = box.y0 + ((py + 1) / sh) * bh;
    let r = 0, g = 0, b = 0, n = 0, total = 0;
    for (let y = Math.floor(sy0); y < sy1; y++) for (let x = Math.floor(sx0); x < sx1; x++) { total++; const i = (y * img.width + x) * 4; if (img.data[i + 3] < 128) continue; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++; }
    if (!n || n / total < 0.4) continue;
    const o = ((py + oy) * NW + px + ox) * 4; out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255;
  }
  return { width: NW, height: NH, data: out };
}

/** Median-cut palette quantisation to `k` colours (skin/hair tones survive because they occupy many pixels). */
function quantise(img, k) {
  const pts = []; for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) pts.push([img.data[i], img.data[i + 1], img.data[i + 2], i]);
  let buckets = [pts];
  while (buckets.length < k) {
    buckets.sort((a, b) => b.length - a.length); const big = buckets.shift(); if (!big || big.length < 2) { buckets.push(big ?? []); break; }
    const ranges = [0, 1, 2].map((c) => Math.max(...big.map((p) => p[c])) - Math.min(...big.map((p) => p[c]))); const ch = ranges.indexOf(Math.max(...ranges));
    big.sort((a, b) => a[ch] - b[ch]); const mid = big.length >> 1; buckets.push(big.slice(0, mid), big.slice(mid));
  }
  const out = new Uint8ClampedArray(img.data);
  for (const b of buckets) { if (!b.length) continue; const avg = [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)); for (const p of b) { out[p[3]] = avg[0]; out[p[3] + 1] = avg[1]; out[p[3] + 2] = avg[2]; } }
  return { width: img.width, height: img.height, data: out };
}

/** Darken silhouette-edge pixels so the sprite has the 1px outline the rest of the game uses. */
function outline(img) {
  const { width: w, height: h } = img; const out = new Uint8ClampedArray(img.data); const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (!img.data[i + 3]) continue; if (!a(x - 1, y) || !a(x + 1, y) || !a(x, y - 1) || (y < h - 1 && !a(x, y + 1))) { out[i] = Math.round(out[i] * 0.45); out[i + 1] = Math.round(out[i + 1] * 0.45); out[i + 2] = Math.round(out[i + 2] * 0.45); } }
  return { width: w, height: h, data: out };
}

function upscale(img, f) {
  const out = new Uint8ClampedArray(img.width * f * img.height * f * 4);
  for (let y = 0; y < img.height * f; y++) for (let x = 0; x < img.width * f; x++) { const s = ((y / f | 0) * img.width + (x / f | 0)) * 4, d = (y * img.width * f + x) * 4; out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3]; }
  return { width: img.width * f, height: img.height * f, data: out };
}

export function processRaw(id) {
  const img = decodePNG(fs.readFileSync(new URL(`${id}.png`, rawDir)));
  const cut = removeBackground(img); const box = bbox(cut); if (!box) throw new Error(`${id}: nothing left after background removal`);
  const small = outline(quantise(downscale(cut, box, NATIVE_W, NATIVE_H), COLORS));
  fs.writeFileSync(new URL(`${id}.png`, outDir), encodePNG(small.width, small.height, small.data));
  const big = upscale(small, 4); fs.writeFileSync(new URL(`${id}@4x.png`, outDir), encodePNG(big.width, big.height, big.data));
  return { box, size: [NATIVE_W, NATIVE_H] };
}

const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain) {
  const args = process.argv.slice(2); const processOnly = args.includes('--process'); const ids = args.filter((a) => !a.startsWith('--'));
  const defs = [...HEROES.map((h) => [h.id, h, h.id]), ...Object.values(MAIN_JOBS).map((j) => [j.id, j, 'main'])].filter(([id]) => ids.includes(id));
  if (!defs.length) { console.log('usage: node scripts/genSpritesHF.mjs [--process] <hero id...>'); process.exit(1); }
  const seed = Number(process.env.SEED ?? 7);
  for (const [id, def, pid] of defs) {
    const rawFile = new URL(`${id}.png`, rawDir);
    if (!processOnly) {
      const text = spritePrompt(def, pid); console.log(`prompt ${id}: ${text}`);
      let done = false;
      for (let attempt = 1; attempt <= Number(process.env.MAX_ATTEMPTS ?? 3) && !done; attempt++) {
        try { const buf = await callGenerate(text, seed + id.length, { width: 1024, height: 1024, style: 'Pixel art', neg: NEG }); fs.writeFileSync(rawFile, buf); console.log(`raw  ${id} ${(buf.length / 1024).toFixed(0)} KB`); done = true; }
        catch (e) { console.log(`retry ${id} (${attempt}): ${e.message}`); if (/event error/.test(e.message)) { console.log('GPU quota exhausted — stop'); process.exit(2); } await new Promise((r) => setTimeout(r, 10000)); }
      }
      if (!done) continue;
    }
    if (!fs.existsSync(rawFile)) { console.log(`no raw image for ${id}`); continue; }
    const r = processRaw(id); console.log(`ok   ${id} → assets/sprites/${id}.png (${r.size.join('×')}) from box ${JSON.stringify(r.box)}`);
  }
}
