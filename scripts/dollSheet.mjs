// Render every hand-made doll (idle frame) at `scale` into one PNG for review: node scripts/dollSheet.mjs out.png [scale] [frame]
import fs from 'node:fs';
import { encodePNG } from './png.mjs';
import { DOLLS, dollPixels } from '../src/data/dollSprites.js';
const [,, out = 'dolls.png', scaleArg = '6', frameArg = '0'] = process.argv; const sc = Number(scaleArg), frame = Number(frameArg);
const ids = Object.keys(DOLLS); const cols = 11, cw = 16 * sc + 6, ch = 28 * sc + 6, rows = Math.ceil(ids.length / cols);
const W = cols * cw, H = rows * ch; const px = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { px[i * 4] = 120; px[i * 4 + 1] = 135; px[i * 4 + 2] = 150; px[i * 4 + 3] = 255; }
ids.forEach((id, n) => { const d = dollPixels(id, frame); const ox = (n % cols) * cw + 3, oy = Math.floor(n / cols) * ch + 3;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 16; x++) { const i = (y * 16 + x) * 4; if (!d.data[i + 3]) continue; for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) { const o = ((oy + y * sc + yy) * W + ox + x * sc + xx) * 4; px[o] = d.data[i]; px[o + 1] = d.data[i + 1]; px[o + 2] = d.data[i + 2]; px[o + 3] = 255; } } });
fs.writeFileSync(out, encodePNG(W, H, px)); console.log(`wrote ${out} ${W}x${H}`, ids.join(' '));
