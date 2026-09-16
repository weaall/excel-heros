// Contact sheet of every card illustration (for hand-designing the pixel dolls): node scripts/artSheet.mjs [out.png] [cols] [cellW]
import fs from 'node:fs';
import { decodePNG, encodePNG } from './png.mjs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';

const out = process.argv[2] ?? 'artsheet.png', cols = Number(process.argv[3] ?? 7), cw = Number(process.argv[4] ?? 180);
const only = process.env.IDS ? new Set(process.env.IDS.split(',')) : null; // IDS=a,b,c to render a subset
const ids = [...HEROES.map((h) => h.id), ...Object.values(MAIN_JOBS).map((j) => j.id)].filter((id) => (!only || only.has(id)) && fs.existsSync(new URL(`../assets/cards/${id}.png`, import.meta.url)));
const ch = Math.round(cw * 1216 / 832); const rows = Math.ceil(ids.length / cols);
const W = cols * cw, H = rows * ch; const px = new Uint8ClampedArray(W * H * 4).fill(40);
for (let i = 3; i < px.length; i += 4) px[i] = 255;
ids.forEach((id, n) => {
  const img = decodePNG(fs.readFileSync(new URL(`../assets/cards/${id}.png`, import.meta.url)));
  const ox = (n % cols) * cw, oy = Math.floor(n / cols) * ch; const sx = img.width / cw, sy = img.height / ch;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    let r = 0, g = 0, b = 0, c = 0; // box filter
    for (let yy = Math.floor(y * sy); yy < (y + 1) * sy; yy++) for (let xx = Math.floor(x * sx); xx < (x + 1) * sx; xx++) { const i = (yy * img.width + xx) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; c++; }
    const o = ((oy + y) * W + ox + x) * 4; px[o] = r / c; px[o + 1] = g / c; px[o + 2] = b / c; px[o + 3] = 255;
  }
  // index label: a tiny white bar with n as binary dots is overkill — print the mapping instead
  console.log(`${n}: ${id}`);
});
fs.writeFileSync(out, encodePNG(W, H, px));
console.log(`wrote ${out} (${W}x${H}, ${ids.length} cards, ${cols} per row)`);
