// Reads the generated card illustrations (assets/cards/<id>.png) and extracts each character's hair colour and
// jacket colour so the 16×28 battle sprites (src/data/heroSkins.js) can be recoloured to match the art.
// Writes src/data/artPalettes.js. Usage: node scripts/extractPalettes.mjs
import fs from 'node:fs';
import { decodePNG } from './png.mjs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';

const dir = new URL('../assets/cards/', import.meta.url);
const ids = [...HEROES.map((h) => h.id), ...Object.values(MAIN_JOBS).map((j) => j.id)];

const rgbToHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; };
const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const isSkin = (h, s, l) => h >= 10 && h <= 45 && s >= 0.15 && s <= 0.75 && l >= 0.55 && l <= 0.92;
const isLine = (l) => l < 0.14;

/** Dominant colour of a region, ignoring background (colours close to the frame's border colour), skin and line art. */
const bucketKey = (r, g, b) => { const [h, s, l] = rgbToHsl(r, g, b); return `${Math.round(h / 12)}:${Math.round(s * 4)}:${Math.round(l * 5)}`; };
/**
 * 어떤 가로 띠의 **양옆**에 흔한 색 = 그 높이의 배경. 모서리만 보는 `backgroundKeys` 로는 머리 옆의
 * 배경(네온·금빛·분홍)을 못 거른다 — 머리색이 거기서 새어 왔다(6-110).
 */
function sideKeys(img, y0, y1) {
  const { width, height, data } = img; const keys = new Map(); let total = 0;
  for (const [x0, x1] of [[0.03, 0.24], [0.76, 0.97]]) {
    for (let y = Math.floor(y0 * height); y < Math.floor(y1 * height); y += 2) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x += 2) {
      const i = (y * width + x) * 4; if (data[i + 3] < 200) continue;
      const k = bucketKey(data[i], data[i + 1], data[i + 2]); keys.set(k, (keys.get(k) ?? 0) + 1); total++;
    }
  }
  return new Set([...keys.entries()].filter(([, n]) => n > total * 0.04).map(([k]) => k));
}

/** Colour buckets that appear in the upper corners = background (works for detailed scenery, not just flat fills). */
function backgroundKeys(img) {
  const { width, height, data } = img; const keys = new Map();
  for (const [x0, x1] of [[0, 0.22], [0.78, 1]]) for (let y = 0; y < height * 0.45; y += 3) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x += 3) {
    const i = (y * width + x) * 4; const k = bucketKey(data[i], data[i + 1], data[i + 2]); keys.set(k, (keys.get(k) ?? 0) + 1);
  }
  const total = [...keys.values()].reduce((a, b) => a + b, 0);
  return new Set([...keys.entries()].filter(([, n]) => n > total * 0.01).map(([k]) => k));
}
function dominant(img, x0, y0, x1, y1, bgKeys, opts = {}) {
  const { width, data } = img; const buckets = new Map();
  for (let y = Math.floor(y0 * img.height); y < Math.floor(y1 * img.height); y += 2) for (let x = Math.floor(x0 * width); x < Math.floor(x1 * width); x += 2) {
    const i = (y * width + x) * 4; const r = data[i], g = data[i + 1], b = data[i + 2]; if (data[i + 3] < 200) continue;
    const key = bucketKey(r, g, b); if (bgKeys.has(key)) continue;
    const [h, s, l] = rgbToHsl(r, g, b); if (isLine(l) || (opts.skipSkin && isSkin(h, s, l))) continue;
    if (opts.skipWhite && l > 0.9 && s < 0.2) continue;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0]; if (!best) return null;
  const total = [...buckets.values()].reduce((sum, e) => sum + e.n, 0);
  return { hex: hex(best.r / best.n, best.g / best.n, best.b / best.n), n: best.n, share: best.n / Math.max(1, total) };
}

const out = {}; let n = 0;
for (const id of ids) {
  const file = new URL(`${id}.png`, dir); if (!fs.existsSync(file)) continue;
  const img = decodePNG(fs.readFileSync(file)); const bgKeys = backgroundKeys(img);
  const def = [...HEROES, ...Object.values(MAIN_JOBS)].find((d) => d.id === id);
  const bald = def?.look?.hair === 'bald';
  // 머리: 정수리 쪽으로 좁게 본다. 넓게 잡으면 어깨의 옷이 들어온다(매크로 엔지니어의 네온 후드가 그랬다).
  const hairBg = new Set([...bgKeys, ...sideKeys(img, 0.06, 0.24)]); // 머리 높이의 양옆도 배경으로 친다
  const hair = bald ? null : dominant(img, 0.38, 0.08, 0.62, 0.22, hairBg, { skipSkin: true, skipWhite: true });
  // 상의: 흰 옷을 건너뛰면 **흰 코트가 정체성인 캐릭터**가 두 번째 색으로 바뀐다(대표이사의 흰 롱코트).
  // 그래서 둘 다 구하고, 흰색이 크게 우세할 때만 흰색을 쓴다.
  const jacketNoWhite = dominant(img, 0.22, 0.44, 0.78, 0.72, bgKeys, { skipSkin: true, skipWhite: true });
  const jacketAny = dominant(img, 0.22, 0.44, 0.78, 0.72, bgKeys, { skipSkin: true });
  const whiteWins = jacketAny && (!jacketNoWhite || jacketAny.n > jacketNoWhite.n * 1.6);
  const jacket = whiteWins ? jacketAny : (jacketNoWhite ?? jacketAny);
  const accent = dominant(img, 0.43, 0.42, 0.57, 0.64, bgKeys, { skipSkin: true, skipWhite: true });          // chest centre (tie / lanyard)
  if (!jacket) { console.log('skip', id); continue; }
  // hair: keep only a convincing colour (not a halo/sky highlight); otherwise the hand palette stays in charge
  // 머리색으로 인정하는 조건: 너무 밝지 않고(후광·하늘), 무채색 밝은 색이 아니고,
  // **상의 색과 뚜렷이 다를 것** — 같으면 옷이 머리 영역에 들어온 것이다.
  const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const dist = (h1, h2) => { const a1 = rgbOf(h1), b1 = rgbOf(h2); return Math.hypot(a1[0] - b1[0], a1[1] - b1[1], a1[2] - b1[2]); };
  const hairOk = hair && (() => {
    // 1등이 뚜렷하지 않으면 **모르는 것**이다 — 손 값을 그대로 둔다(디자인팀장은 1등이 13%였다).
    if (hair.share < 0.18) return false;
    const [r, g, b] = rgbOf(hair.hex); const [, s, l] = rgbToHsl(r, g, b);
    // 후광·하늘만 버린다. 밝기 상한을 두면 **금발·민트·은발이 통째로 버려진다**(노조위원장 #fde28d 30%).
    if (s < 0.10 && l > 0.85) return false;
    return dist(hair.hex, jacket.hex) > 40;
  })();
  out[id] = { ...(hairOk ? { H: hair.hex } : {}), B: jacket.hex, ...(accent && accent.hex !== jacket.hex ? { W: accent.hex } : {}) };
  n++; console.log(id.padEnd(14), 'hair', (hairOk ? `${hair.hex} ${Math.round(hair.share * 100)}%` : `(${hair?.hex ?? 'bald'} 무시${hair ? ` ${Math.round(hair.share * 100)}%` : ''})`).padEnd(20), 'jacket', jacket.hex, whiteWins ? '(흰옷)' : '');
}
const src = `// Generated by scripts/extractPalettes.mjs from assets/cards/*.png — hair (H), jacket (B) and chest accent (W)\n// colours of each character's illustration, so battle sprites are recoloured to match the card art.\nexport const ART_PALETTES = ${JSON.stringify(out, null, 2)};\n`;
fs.writeFileSync(new URL('../src/data/artPalettes.js', import.meta.url), src);
console.log(`artPalettes.js: ${n} characters`);
