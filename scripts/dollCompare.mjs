// 도트가 일러와 맞는지 **나란히 놓고** 본다: 위에 카드 일러(허리 위), 아래에 도트.
// 색만 맞추는 자동 추출로는 '머리 모양이 다르다' 같은 건 못 잡는다 — 그건 눈으로 봐야 하고, 이 시트가 그 자리다.
// 사용법: IDS=a,b,c node scripts/dollCompare.mjs out.png [도트배율] [일러높이]
import fs from 'node:fs';
import { encodePNG, decodePNG } from './png.mjs';
import { DOLLS, dollPixels } from '../src/data/dollSprites.js';

const [, , out = 'compare.png', scaleArg = '5', artHArg = '150'] = process.argv;
const sc = Number(scaleArg), artH = Number(artHArg);
const ids = (process.env.IDS ? process.env.IDS.split(',') : Object.keys(DOLLS)).filter((id) => DOLLS[id]);
const manifest = JSON.parse(fs.readFileSync(new URL('../assets/cards/manifest.json', import.meta.url), 'utf8')).cards;

const cw = Math.max(16 * sc + 8, Math.round(artH * 0.68) + 8);
const dollH = 28 * sc, ch = artH + dollH + 14;
const cols = Math.min(8, ids.length), rows = Math.ceil(ids.length / cols);
const W = cols * cw, H = rows * ch;
const px = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { px[i * 4] = 120; px[i * 4 + 1] = 135; px[i * 4 + 2] = 150; px[i * 4 + 3] = 255; }

const put = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; };

ids.forEach((id, n) => {
  const ox = (n % cols) * cw, oy = Math.floor(n / cols) * ch;
  // --- 일러 (상단): 허리 위만, 가운데 정렬로 축소
  const spec = manifest[id]; const file = spec && new URL(`../assets/cards/${typeof spec === 'string' ? spec : spec.file}`, import.meta.url);
  if (file && fs.existsSync(file)) {
    const img = decodePNG(fs.readFileSync(file));
    const srcH = Math.floor(img.height * 0.52);           // 허리 위
    const dw = Math.round(artH * (img.width / srcH)), dh = artH;
    const x0 = ox + Math.round((cw - dw) / 2);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const sx = Math.floor((x / dw) * img.width), sy = Math.floor((y / dh) * srcH);
      const i = (sy * img.width + sx) * 4;
      put(x0 + x, oy + 4 + y, img.data[i], img.data[i + 1], img.data[i + 2]);
    }
  }
  // --- 도트 (하단)
  const d = dollPixels(id, 0); if (!d) return;
  const dx = ox + Math.round((cw - 16 * sc) / 2), dy = oy + artH + 8;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4; if (!d.data[i + 3]) continue;
    for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) put(dx + x * sc + xx, dy + y * sc + yy, d.data[i], d.data[i + 1], d.data[i + 2]);
  }
});
fs.writeFileSync(out, encodePNG(W, H, px));
console.log(`wrote ${out} ${W}x${H} — ${ids.length}명: ${ids.join(' ')}`);
