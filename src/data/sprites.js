// Procedural pixel art at native 64x64 (heroes, monsters) and 96x64 (boss) + card illustrations.
// Volumetric shading: every material has 5 tones (dark2, dark1, base, light1, light2) picked per pixel
// from a surface-normal approximation, so heads, torsos and limbs read as rounded forms instead of
// flat blocks. Soft per-colour outlines, eye whites / iris / pupil / highlight, hair strands, cloth folds.
import { GRADES } from './heroes.js';

export const SCALE = 1;
export const SRC = 64;
export const SPRITE = 64;

// ------------------------------------------------------------- pixel grid --
// A cell holds a palette key. Keys may carry a tone suffix: 'S', 'S-1', 'S-2', 'S+1', 'S+2'.
const blank = (w = SRC, h = SRC) => Array.from({ length: h }, () => Array(w).fill('.'));
const px = (g, x, y, ch) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch; };
const rect = (g, x, y, w, h, ch) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(g, i, j, ch); };
const ellipse = (g, cx, cy, rx, ry, ch, pred) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1 && (!pred || pred(x, y))) px(g, x, y, ch);
  }
};
const line = (g, x0, y0, x1, y1, ch, thick = 1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let t = 0; t < thick; t++) px(g, x + t, y, ch);
  }
};
const baseKey = (ch) => (ch && ch !== '.' ? ch.replace(/[+-]\d$/, '') : ch);
const toneKey = (key, t) => (t === 0 ? key : `${key}${t > 0 ? '+' : ''}${t}`);

/**
 * Volumetric shading of an elliptical region: recolours pixels whose base key is `key`
 * inside the ellipse into 5 tones from a light coming from the upper right-front.
 */
function shadeEllipse(g, key, cx, cy, rx, ry, opts = {}) {
  const { lx = 0.45, ly = -0.8, bias = 0, roundness = 0.35 } = opts;
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
    const ch = g[y]?.[x]; if (!ch || baseKey(ch) !== key) continue;
    const nx = (x - cx) / rx, ny = (y - cy) / ry, r2 = nx * nx + ny * ny;
    const v = lx * nx + ly * ny + roundness * (1 - Math.min(1, r2)) + bias;
    const t = v > 0.62 ? 2 : v > 0.2 ? 1 : v > -0.3 ? 0 : v > -0.68 ? -1 : -2;
    g[y][x] = toneKey(key, t);
  }
}
/** Cylinder shading across x for limbs: left edge dark, right edge light. */
function shadeCylinder(g, key, x0, x1, y0, y1, opts = {}) {
  const { flip = false } = opts; const mid = (x0 + x1) / 2, half = Math.max(1, (x1 - x0) / 2);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ch = g[y]?.[x]; if (!ch || baseKey(ch) !== key) continue;
    let v = (x - mid) / half; if (flip) v = -v;
    const t = v > 0.6 ? 1 : v < -0.6 ? -2 : v < -0.15 ? -1 : 0;
    g[y][x] = toneKey(key, t);
  }
}
/** Soft outline: edge pixels become a dark version of the neighbouring colour. */
function outline(g) {
  const h = g.length, w = g[0].length, out = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== '.') continue;
    const n = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => g[y + dy]?.[x + dx]).find((c) => c && c !== '.' && !c.startsWith('O:'));
    if (n) out[y][x] = 'O:' + baseKey(n);
  }
  return out;
}
const shiftDown = (g, dy) => [...blank(g[0].length, dy), ...g.slice(0, g.length - dy)];

const hexMul = (hex, f) => {
  const n = parseInt(hex.slice(1), 16); if (Number.isNaN(n)) return hex;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};
const darken = (hex, f = 0.72) => hexMul(hex, f);
const lighten = (hex, t = 0.3) => {
  const n = parseInt(hex.slice(1), 16); if (Number.isNaN(n)) return hex;
  const c = (v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};
/** Expand base colours into tone ramps: key-2, key-1, key, key+1, key+2 (shadows lean cooler/darker). */
function ramp(pal) {
  const out = { ...pal };
  for (const [k, hex] of Object.entries(pal)) {
    if (typeof hex !== 'string' || !hex.startsWith('#')) continue;
    out[`${k}-1`] = darken(hex, 0.78); out[`${k}-2`] = darken(hex, 0.56); out[`${k}+1`] = lighten(hex, 0.22); out[`${k}+2`] = lighten(hex, 0.5);
  }
  return out;
}

// ------------------------------------------------------------------ heroes --
// Materials: S skin · H hair · B shirt · P pants · W weapon · A accent · I iris · plus L white · E black · K cheek · G steel
const DEFAULT_HERO_PAL = { S: '#f3cfae', E: '#1b1b1b', L: '#ffffff', K: '#e89a9a', G: '#5d6d7e', A: '#c0392b', I: '#5d4037' };
const ROLE_ACCENT = { tank: '#8fa3ad', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };

// Anatomy (5 heads, 3/4 view facing right): head centre (30,12) r7x6.5 · neck 18-21 · torso 21-42 · legs 43-59 · shoes 59-62
const HEAD = { cx: 30, cy: 12, rx: 7, ry: 6.5 };

function drawHair(g, style, lean) {
  const cx = HEAD.cx + lean;
  const cap = (pred) => ellipse(g, cx - 1, HEAD.cy - 3, 8.2, 6, 'H', pred);
  const back = (toY) => rect(g, cx - 9, HEAD.cy - 3, 4, toY - (HEAD.cy - 3), 'H');
  const bangs = () => { for (let i = 0; i < 6; i++) px(g, cx - 5 + i * 2, HEAD.cy - 3 + (i % 2), 'H'); };
  switch (style) {
    case 'bald': ellipse(g, cx - 3, HEAD.cy - 5, 2.4, 1.3, 'S+2'); break;
    case 'long': cap((x, y) => y <= HEAD.cy); back(38); rect(g, cx + 6, HEAD.cy - 1, 2, 7, 'H'); for (const y of [16, 24, 32]) px(g, cx - 8, y, 'H-1'); bangs(); break;
    case 'bun': cap((x, y) => y <= HEAD.cy - 1); ellipse(g, cx - 8, HEAD.cy - 7, 3.6, 3.2, 'H'); px(g, cx - 9, HEAD.cy - 8, 'H+2'); break;
    case 'spiky': cap((x, y) => y <= HEAD.cy - 1 && y >= HEAD.cy - 6); for (const [dx, dy] of [[-8, -8], [-5, -11], [-1, -12], [3, -11], [7, -8]]) { line(g, cx + dx, HEAD.cy + dy, cx + dx + 1, HEAD.cy - 3, 'H', 2); px(g, cx + dx + 1, HEAD.cy + dy, 'H+1'); } break;
    case 'side': cap((x, y) => y <= HEAD.cy - 1); for (let i = 0; i < 4; i++) line(g, cx, HEAD.cy - 7 + i, cx + 10, HEAD.cy + i, 'H'); rect(g, cx + 9, HEAD.cy + 3, 2, 3, 'H'); break;
    case 'curly': cap((x, y) => y <= HEAD.cy); for (const [dx, dy] of [[-9, -3], [-7, -8], [-2, -11], [4, -10], [8, -6], [10, -1]]) ellipse(g, cx + dx, HEAD.cy + dy, 3.6, 3.4, 'H'); break;
    case 'bob': cap((x, y) => y <= HEAD.cy); back(28); rect(g, cx + 6, HEAD.cy - 1, 3, 9, 'H'); bangs(); break;
    case 'grey': cap((x, y) => y <= HEAD.cy - 1); bangs(); break;
    case 'cap': cap((x, y) => y <= HEAD.cy - 1); ellipse(g, cx - 1, HEAD.cy - 6, 8.8, 5, 'A', (x, y) => y <= HEAD.cy - 4); rect(g, cx + 3, HEAD.cy - 4, 12, 2, 'A'); rect(g, cx + 3, HEAD.cy - 2, 12, 1, 'A-1'); ellipse(g, cx - 3, HEAD.cy - 8, 3, 1.2, 'A+1'); break;
    default: cap((x, y) => y <= HEAD.cy - 1); bangs();
  }
  // volume + strands + highlight
  shadeEllipse(g, 'H', cx - 1, HEAD.cy - 3, 8.5, 6.5, { roundness: 0.45 });
  if (!['bald', 'cap'].includes(style)) {
    for (const [dx0, dy0, dx1, dy1] of [[-6, -7, -8, -2], [-2, -9, -4, -4], [3, -9, 6, -5]]) line(g, cx + dx0, HEAD.cy + dy0, cx + dx1, HEAD.cy + dy1, 'H-1');
    line(g, cx - 4, HEAD.cy - 8, cx + 2, HEAD.cy - 9, 'H+2', 2);
    if (style === 'grey') { line(g, cx - 5, HEAD.cy - 6, cx - 2, HEAD.cy - 7, 'L'); line(g, cx + 3, HEAD.cy - 7, cx + 5, HEAD.cy - 6, 'L'); }
  }
}

/** Accessories & props. Positions relative to head centre (hx), torso offset (tx) and back hand (bx,by). */
function drawAccessory(g, acc, hx, tx, bx, by) {
  const hy = HEAD.cy;
  const frame = (x, y, w, h) => { rect(g, x, y, w, 1, 'G'); rect(g, x, y + h - 1, w, 1, 'G'); rect(g, x, y, 1, h, 'G'); rect(g, x + w - 1, y, 1, h, 'G'); };
  switch (acc) {
    case 'glasses': frame(hx - 6, hy - 3, 6, 7); frame(hx + 1, hy - 3, 7, 7); px(g, hx, hy - 1, 'G'); rect(g, hx + 8, hy - 1, 2, 1, 'G'); px(g, hx - 5, hy - 2, 'L'); px(g, hx + 2, hy - 2, 'L'); px(g, hx + 3, hy - 2, 'L'); break;
    case 'sunglasses': rect(g, hx - 6, hy - 2, 14, 5, 'G-2'); rect(g, hx, hy - 1, 1, 4, 'G'); rect(g, hx + 2, hy - 1, 3, 1, 'G+2'); px(g, hx - 4, hy - 1, 'G+2'); rect(g, hx + 8, hy - 1, 2, 1, 'G'); break;
    case 'beard': rect(g, hx - 4, hy + 3, 11, 4, 'H'); rect(g, hx - 3, hy + 7, 9, 2, 'H'); rect(g, hx - 4, hy + 3, 2, 4, 'H-1'); rect(g, hx + 2, hy + 4, 2, 1, 'S'); break;
    case 'mustache': rect(g, hx + 2, hy + 3, 6, 1, 'H'); rect(g, hx + 1, hy + 4, 7, 1, 'H-1'); break;
    case 'headset': rect(g, hx + 7, hy - 1, 4, 5, 'A'); rect(g, hx + 8, hy, 2, 3, 'A+2'); line(g, hx + 8, hy - 2, hx, hy - 9, 'A', 2); line(g, hx, hy - 9, hx - 8, hy - 5, 'A', 2); line(g, hx + 10, hy + 4, hx + 13, hy + 7, 'A'); rect(g, hx + 13, hy + 7, 2, 2, 'E'); break;
    case 'hardhat': ellipse(g, hx - 1, hy - 6, 9.5, 5, 'A', (x, y) => y <= hy - 4); rect(g, hx - 11, hy - 4, 23, 3, 'A'); rect(g, hx - 11, hy - 2, 23, 1, 'A-2'); shadeEllipse(g, 'A', hx - 1, hy - 6, 9.5, 5); rect(g, hx - 3, hy - 10, 5, 1, 'A+2'); break;
    case 'crown': rect(g, hx - 7, hy - 11, 15, 4, 'A'); for (const dx of [-7, -2, 3]) rect(g, hx + dx, hy - 13, 2, 2, 'A'); px(g, hx + 7, hy - 13, 'A'); for (const dx of [-4, 0, 4]) px(g, hx + dx, hy - 10, 'L'); rect(g, hx - 7, hy - 8, 15, 1, 'A-2'); break;
    case 'earring': px(g, hx + 8, hy + 3, 'A'); px(g, hx + 8, hy + 4, 'A+2'); px(g, hx + 8, hy + 5, 'A'); break;
    case 'flower': ellipse(g, hx - 8, hy - 5, 3.2, 3.2, 'A'); for (const [dx, dy] of [[-11, -5], [-5, -5], [-8, -8], [-8, -2]]) px(g, hx + dx, hy + dy, 'A-1'); px(g, hx - 8, hy - 5, 'L'); px(g, hx - 9, hy - 5, 'L'); break;
    case 'pen': rect(g, hx + 6, hy - 6, 6, 1, 'A'); px(g, hx + 12, hy - 6, 'L'); break;
    // torso
    case 'tie': rect(g, tx + 29, 21, 3, 3, 'A'); rect(g, tx + 30, 24, 2, 5, 'A'); rect(g, tx + 29, 29, 4, 8, 'A'); px(g, tx + 30, 37, 'A'); px(g, tx + 31, 37, 'A'); rect(g, tx + 29, 29, 1, 8, 'A-1'); px(g, tx + 31, 31, 'A+2'); px(g, tx + 31, 34, 'A+2'); break;
    case 'badge': rect(g, tx + 24, 25, 4, 4, 'A'); rect(g, tx + 25, 26, 2, 2, 'L'); rect(g, tx + 24, 28, 4, 1, 'A-1'); break;
    case 'scarf': rect(g, tx + 22, 19, 17, 4, 'A'); rect(g, tx + 18, 23, 4, 10, 'A'); rect(g, tx + 22, 21, 17, 1, 'A-1'); rect(g, tx + 18, 27, 4, 1, 'A-1'); rect(g, tx + 18, 31, 4, 1, 'A-1'); break;
    case 'lanyard': line(g, tx + 27, 21, tx + 29, 32, 'A'); line(g, tx + 33, 21, tx + 31, 32, 'A'); rect(g, tx + 27, 32, 7, 7, 'L'); rect(g, tx + 28, 33, 2, 2, 'A'); rect(g, tx + 28, 36, 5, 1, 'G'); break;
    case 'apron': rect(g, tx + 26, 26, 9, 15, 'L'); rect(g, tx + 28, 21, 5, 5, 'L'); rect(g, tx + 26, 26, 1, 15, 'G+1'); rect(g, tx + 26, 40, 9, 1, 'G'); break;
    case 'suspenders': rect(g, tx + 26, 21, 2, 20, 'A-1'); rect(g, tx + 34, 21, 2, 20, 'A-1'); break;
    case 'hoodie': ellipse(g, hx - 9, hy + 5, 4, 6, 'B'); rect(g, tx + 22, 19, 17, 3, 'B-1'); rect(g, tx + 29, 23, 1, 6, 'L'); rect(g, tx + 32, 23, 1, 6, 'L'); break;
    case 'watch': rect(g, 43, 37, 3, 2, 'G'); px(g, 44, 37, 'L'); break;
    case 'radio': rect(g, tx + 37, 40, 3, 5, 'G-2'); px(g, tx + 38, 38, 'G'); px(g, tx + 38, 39, 'G'); px(g, tx + 38, 41, 'A+2'); break;
    // back-hand props
    case 'coffee': rect(g, bx - 4, by - 7, 7, 8, 'A'); rect(g, bx - 5, by - 8, 9, 2, 'L'); rect(g, bx + 3, by - 5, 2, 4, 'A'); rect(g, bx - 4, by, 7, 1, 'A-2'); px(g, bx - 2, by - 12, 'L'); px(g, bx - 1, by - 14, 'L'); px(g, bx, by - 11, 'L'); break;
    case 'clipboard': rect(g, bx - 8, by - 15, 10, 18, 'L'); rect(g, bx - 6, by - 17, 6, 3, 'A'); for (const dy of [-10, -6, -2]) rect(g, bx - 6, by + dy, 6, 1, 'A'); rect(g, bx - 8, by + 2, 10, 1, 'G'); break;
    case 'calculator': rect(g, bx - 8, by - 13, 8, 14, 'G-2'); rect(g, bx - 7, by - 12, 6, 3, 'L'); for (const dy of [-7, -4, -1]) { rect(g, bx - 7, by + dy, 2, 1, 'L'); rect(g, bx - 4, by + dy, 2, 1, 'L'); } break;
    case 'briefcase': rect(g, bx - 10, by - 8, 12, 9, 'A'); rect(g, bx - 6, by - 10, 4, 2, 'A-2'); rect(g, bx - 10, by - 4, 12, 1, 'A-2'); rect(g, bx - 5, by - 4, 2, 1, 'L'); break;
    case 'cane': line(g, bx, by, bx - 2, by + 16, 'W', 2); rect(g, bx - 2, by - 2, 6, 2, 'A'); break;
    case 'files': rect(g, bx - 8, by - 12, 9, 13, 'L'); rect(g, bx - 8, by - 14, 4, 2, 'A'); rect(g, bx - 6, by - 8, 5, 1, 'G'); rect(g, bx - 6, by - 5, 5, 1, 'G'); rect(g, bx - 6, by - 2, 3, 1, 'G'); break;
    case 'phone': rect(g, bx - 4, by - 10, 5, 9, 'G-2'); rect(g, bx - 3, by - 9, 3, 6, 'L'); px(g, bx - 2, by - 2, 'G'); break;
    case 'magnifier': ellipse(g, bx - 4, by - 8, 4, 4, 'G'); ellipse(g, bx - 4, by - 8, 2.5, 2.5, 'L'); px(g, bx - 5, by - 9, 'L'); line(g, bx - 1, by - 5, bx + 1, by - 1, 'W', 2); break;
    case 'parcel': rect(g, bx - 10, by - 10, 12, 11, 'A'); rect(g, bx - 6, by - 10, 4, 11, 'L'); rect(g, bx - 10, by - 6, 12, 2, 'L'); rect(g, bx - 10, by - 1, 12, 2, 'A-2'); break;
    case 'ledger': rect(g, bx - 8, by - 12, 9, 13, 'A'); rect(g, bx - 6, by - 11, 6, 11, 'L'); rect(g, bx - 8, by - 12, 2, 13, 'A-2'); rect(g, bx - 5, by - 8, 4, 1, 'G'); rect(g, bx - 5, by - 5, 4, 1, 'G'); break;
    default: break;
  }
}

/** Weapon in the front hand. (fx,fy) = hand centre. */
function drawWeapon(g, role, pose, fx, fy) {
  const blade = (x0, y0, x1, y1) => { line(g, x0, y0, x1, y1, 'W-2'); line(g, x0 + 1, y0, x1 + 1, y1, 'W'); line(g, x0 + 2, y0, x1 + 2, y1, 'W+2'); px(g, x1 + 2, y1, 'L'); };
  const laptop = (x, y) => { rect(g, x, y, 14, 11, 'W'); rect(g, x, y, 14, 1, 'W+1'); rect(g, x + 1, y + 1, 12, 7, 'L'); rect(g, x + 2, y + 2, 10, 5, 'W-2'); rect(g, x + 3, y + 3, 6, 1, 'L'); rect(g, x + 3, y + 5, 4, 1, 'W+2'); rect(g, x + 1, y + 9, 12, 1, 'E'); px(g, x + 7, y + 10, 'L'); };
  const shield = (cx, cy) => { ellipse(g, cx, cy, 6.5, 10.5, 'A'); shadeEllipse(g, 'A', cx, cy, 6.5, 10.5, { roundness: 0.5 }); rect(g, cx - 1, cy - 6, 3, 12, 'L'); rect(g, cx - 4, cy - 1, 9, 3, 'L'); for (const [dx, dy] of [[-4, -7], [4, -7], [-4, 7], [4, 7]]) px(g, cx + dx, cy + dy, 'A+2'); };
  const kit = (x, y) => { rect(g, x, y, 13, 11, 'L'); rect(g, x, y + 8, 13, 3, 'G+1'); rect(g, x + 5, y + 2, 3, 7, 'W'); rect(g, x + 3, y + 4, 7, 3, 'W'); rect(g, x + 4, y - 2, 5, 2, 'G-2'); };
  switch (role) {
    case 'melee':
      if (pose === 'raise') { blade(fx + 3, fy - 2, fx + 15, fy - 16); rect(g, fx - 2, fy - 1, 8, 2, 'A'); }
      else if (pose === 'strike') { rect(g, fx + 4, fy - 1, 12, 1, 'W+2'); rect(g, fx + 4, fy, 12, 1, 'W'); rect(g, fx + 4, fy + 1, 12, 1, 'W-2'); px(g, fx + 16, fy, 'L'); rect(g, fx + 2, fy - 3, 2, 7, 'A'); }
      else { blade(fx + 2, fy - 3, fx + 14, fy - 19); rect(g, fx - 2, fy - 2, 8, 2, 'A'); }
      break;
    case 'ranged': laptop(fx + (pose === 'strike' ? 2 : 0), fy - 5); break;
    case 'tank': shield(fx + 5, fy - 3); break;
    case 'healer': kit(fx, fy - 5); break;
  }
}

/**
 * One 64x64 hero frame. pose: 'idle' | 'idle2' | 'walkA' | 'walkB' | 'raise' | 'strike'
 */
function heroFrame(def, pose) {
  const g = blank();
  const look = def.look ?? {};
  const breath = pose === 'idle2';
  const stride = pose === 'walkA' ? 1 : pose === 'walkB' ? -1 : 0;
  const lean = pose === 'strike' ? 2 : pose === 'raise' ? -1 : 0;
  const tx = lean;
  // --- legs (slight knee bend on strides) + shoes
  const bl = 24 - 3 * stride, fl = 31 + 3 * stride;
  rect(g, bl, 43, 6, 16, 'P'); rect(g, fl, 43, 6, 16, 'P');
  if (stride) { rect(g, fl + 2 * stride, 51, 6, 8, 'P'); rect(g, bl - 2 * stride, 51, 6, 8, 'P'); }
  rect(g, 23, 43, 15, 3, 'P');                                        // hips
  shadeCylinder(g, 'P', bl - 2, bl + 6, 43, 59); shadeCylinder(g, 'P', fl, fl + 8, 43, 59);
  for (let y = 43; y < 59; y++) if (g[y][fl] && baseKey(g[y][fl]) === 'P') g[y][fl] = 'P-1';   // crease
  const sbx = bl - 1 - (stride > 0 ? 2 : 0), sfx = fl + (stride > 0 ? 2 : stride < 0 ? -2 : 0);
  rect(g, sbx, 59, 7, 4, 'E'); rect(g, sfx, 59, 9, 4, 'E'); rect(g, sfx + 1, 60, 6, 1, 'G'); rect(g, sbx + 1, 60, 4, 1, 'G'); px(g, sfx + 8, 61, 'G');
  // --- torso: rounded silhouette (sloped shoulders, chest, waist)
  rect(g, tx + 24, 21, 13, 1, 'B'); rect(g, tx + 23, 22, 15, 2, 'B'); rect(g, tx + 22, 24, 17, 14, 'B'); rect(g, tx + 23, 38, 15, 3, 'B'); rect(g, tx + 24, 41, 13, 1, 'B');
  shadeEllipse(g, 'B', tx + 31, 31, 10, 12, { roundness: 0.3 });
  for (let y = 24; y < 40; y++) { px(g, tx + 26, y, 'B-1'); }                   // side seam
  line(g, tx + 24, 26, tx + 27, 30, 'B-2'); line(g, tx + 37, 27, tx + 35, 31, 'B-1');   // armpit folds
  for (let i = 0; i < 4; i++) { px(g, tx + 28 + i, 21 + i, 'L'); px(g, tx + 32 - i, 21 + i, 'L'); px(g, tx + 28 + i, 22 + i, 'G+1'); }
  const covered = [look.acc, look.acc2, look.prop].some((a) => ['tie', 'lanyard', 'scarf', 'apron', 'suspenders', 'hoodie'].includes(a));
  if (!covered) for (const y of [27, 32, 37]) px(g, tx + 30, y, 'E');
  rect(g, tx + 23, 41, 15, 2, 'E'); rect(g, tx + 29, 41, 3, 2, 'A'); px(g, tx + 30, 41, 'A+2');
  // --- neck
  rect(g, tx + 27, 18, 6, 4, 'S-1'); px(g, tx + 32, 19, 'S');
  // --- back arm: hangs behind, swings on strides
  const bx = 19 - stride, by = 42 - Math.abs(stride);
  line(g, tx + 23, 24, bx, by - 4, 'B', 3); ellipse(g, bx + 1, by - 1, 2.2, 2, 'S');
  shadeCylinder(g, 'B', 17, 23, 24, 40);
  rect(g, bx - 1, by - 5, 4, 1, 'L');
  // --- front arm (pose dependent)
  let fx, fy;
  if (pose === 'strike') { line(g, tx + 38, 25, 48, 27, 'B', 4); fx = 50; fy = 28; rect(g, 47, 25, 1, 4, 'L'); }
  else if (pose === 'raise') { line(g, tx + 38, 24, 44, 18, 'B', 4); fx = 46; fy = 17; rect(g, 43, 18, 1, 3, 'L'); }
  else { line(g, tx + 38, 24, 41 + stride, 38, 'B', 4); fx = 42 + stride; fy = 41; rect(g, 39 + stride, 37, 4, 1, 'L'); }
  shadeCylinder(g, 'B', tx + 37, tx + 46, 24, 40, { flip: false });
  ellipse(g, fx, fy, 2.4, 2.2, 'S'); px(g, fx + 1, fy - 1, 'S+1');
  // --- head: skin volume, ear, jaw shadow
  const hx = HEAD.cx + tx + (lean > 0 ? 1 : 0), hy = HEAD.cy + (breath ? 1 : 0);
  ellipse(g, hx, hy, HEAD.rx, HEAD.ry, 'S');
  shadeEllipse(g, 'S', hx, hy, HEAD.rx, HEAD.ry, { roundness: 0.4 });
  rect(g, hx + 7, hy, 2, 3, 'S'); px(g, hx + 7, hy + 1, 'S-1');
  drawHair(g, look.hair ?? 'short', tx + (lean > 0 ? 1 : 0));
  // --- face (turned right): sclera, iris, pupil, highlight, lids, brows, nose, mouth, blush
  rect(g, hx - 4, hy - 1, 2, 3, 'L'); rect(g, hx - 3, hy, 1, 2, 'I'); px(g, hx - 3, hy + 1, 'E');
  rect(g, hx + 1, hy - 1, 4, 3, 'L'); rect(g, hx + 2, hy - 1, 2, 3, 'I'); rect(g, hx + 3, hy, 1, 2, 'E'); px(g, hx + 2, hy - 1, 'L');
  rect(g, hx - 4, hy - 2, 2, 1, 'H-1'); rect(g, hx + 1, hy - 2, 4, 1, 'H-1');        // lids
  rect(g, hx - 4, hy - 4, 2, 1, 'H'); rect(g, hx + 1, hy - 4, 4, 1, 'H');            // brows
  px(g, hx + 6, hy + 2, 'S-1'); px(g, hx + 6, hy + 3, 'S-1'); px(g, hx + 5, hy + 2, 'S+1'); // nose
  rect(g, hx + 2, hy + 5, 3, 1, 'S-2'); px(g, hx + 5, hy + 4, 'S-2'); px(g, hx + 3, hy + 6, 'S+1'); // mouth + lip light
  px(g, hx - 5, hy + 3, 'K'); px(g, hx - 4, hy + 4, 'K'); px(g, hx + 4, hy + 3, 'K'); px(g, hx + 5, hy + 3, 'K');
  for (const a of [look.acc, look.acc2, look.prop]) drawAccessory(g, a, hx, tx, bx, by);
  drawWeapon(g, def.role, pose, fx, fy);
  return outline(g);
}

// ---------------------------------------------------------------- monsters --
// Materials: M main (ramped) · plus L white · E black · K cheek · Y gold · G grey
const MONSTER_DEFAULT = { L: '#ffffff', E: '#1e1e1e', K: '#ffb0b0', Y: '#f1c40f', G: '#4d5656' };

/** Eyes/mouth looking LEFT toward the heroes, with eye whites, iris-less pupils and highlights. */
function drawFace(g, face, cx, cy) {
  const eye = (x, y, w, h) => { rect(g, x, y, w, h, 'L'); rect(g, x + 1, y + 2, 3, h - 3, 'E'); px(g, x + 1, y + 2, 'L'); rect(g, x, y, w, 1, 'M-2'); };
  switch (face.eyes) {
    case 'angry': eye(cx - 11, cy - 6, 6, 7); eye(cx + 1, cy - 6, 6, 7); line(g, cx - 12, cy - 9, cx - 5, cy - 7, 'E'); line(g, cx, cy - 7, cx + 7, cy - 9, 'E'); break;
    case 'dot': rect(g, cx - 9, cy - 4, 3, 4, 'E'); rect(g, cx + 3, cy - 4, 3, 4, 'E'); px(g, cx - 9, cy - 4, 'L'); px(g, cx + 3, cy - 4, 'L'); break;
    case 'one': ellipse(g, cx - 2, cy - 3, 8, 7, 'L'); ellipse(g, cx - 4, cy - 3, 3.5, 4, 'E'); rect(g, cx - 5, cy - 5, 2, 2, 'L'); ellipse(g, cx - 2, cy - 3, 8, 7, 'M-2', (x, y) => y < cy - 8); break;
    case 'sleepy': rect(g, cx - 11, cy - 3, 6, 3, 'L'); rect(g, cx + 1, cy - 3, 6, 3, 'L'); rect(g, cx - 10, cy - 2, 3, 2, 'E'); rect(g, cx + 2, cy - 2, 3, 2, 'E'); rect(g, cx - 11, cy - 4, 6, 1, 'E'); rect(g, cx + 1, cy - 4, 6, 1, 'E'); break;
    default: eye(cx - 11, cy - 7, 6, 8); eye(cx + 1, cy - 7, 6, 8);
  }
  for (const [x, y] of [[cx - 14, cy + 2], [cx - 12, cy + 3], [cx + 8, cy + 2], [cx + 10, cy + 3]]) { px(g, x, y, 'K'); px(g, x + 1, y, 'K'); }
  switch (face.mouth) {
    case 'teeth': rect(g, cx - 8, cy + 5, 14, 4, 'E'); for (let i = 0; i < 5; i++) rect(g, cx - 7 + i * 3, cy + 5, 2, 2, 'L'); break;
    case 'smile': line(g, cx - 7, cy + 5, cx - 4, cy + 8, 'E', 2); rect(g, cx - 3, cy + 8, 6, 2, 'E'); line(g, cx + 3, cy + 8, cx + 6, cy + 5, 'E', 2); break;
    case 'zigzag': for (let i = 0; i < 14; i++) rect(g, cx - 7 + i, cy + 5 + (i % 2), 1, 2, 'E'); break;
    case 'o': ellipse(g, cx - 1, cy + 7, 3, 2.5, 'E'); ellipse(g, cx - 1, cy + 7, 1.5, 1, 'M-2'); break;
    default: rect(g, cx - 6, cy + 6, 10, 2, 'E');
  }
}

// Shapes fill with 'M' then get volumetric shading; they return the face anchor.
const SHAPES = {
  blob(g) { ellipse(g, 32, 38, 24, 19, 'M'); shadeEllipse(g, 'M', 32, 38, 24, 19, { roundness: 0.5 }); ellipse(g, 20, 27, 5, 3, 'L'); return [32, 35]; },
  cube(g) { rect(g, 12, 18, 40, 36, 'M'); rect(g, 15, 13, 37, 5, 'M+1'); rect(g, 47, 18, 5, 36, 'M-2'); rect(g, 12, 49, 35, 5, 'M-1'); rect(g, 12, 18, 35, 4, 'M+1'); rect(g, 17, 14, 8, 2, 'L'); return [30, 35]; },
  diamond(g) { for (let y = 6; y < 58; y++) for (let x = 6; x < 58; x++) if (Math.abs(x - 32) + Math.abs(y - 32) <= 24) px(g, x, y, 'M'); shadeEllipse(g, 'M', 32, 32, 22, 22, { roundness: 0.2 }); line(g, 24, 16, 32, 8, 'L', 2); return [32, 32]; },
  spike(g) { for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; line(g, 32, 34, Math.round(32 + Math.cos(t) * 28), Math.round(34 + Math.sin(t) * 28), 'M-2', 2); } ellipse(g, 32, 34, 19, 19, 'M'); shadeEllipse(g, 'M', 32, 34, 19, 19, { roundness: 0.5 }); ellipse(g, 24, 25, 4, 3, 'L'); return [32, 34]; },
  ghost(g) { ellipse(g, 32, 28, 22, 20, 'M'); rect(g, 10, 28, 44, 24, 'M'); for (let x = 10; x < 54; x += 8) rect(g, x, 52, 4, 5, 'M'); shadeEllipse(g, 'M', 32, 34, 24, 26, { roundness: 0.4 }); ellipse(g, 20, 18, 5, 3, 'L'); return [32, 30]; },
  sheet(g) { rect(g, 16, 6, 32, 52, 'L'); for (let i = 0; i < 10; i++) rect(g, 48 - i, 6 + i, i + 1, 1, '.'); for (let i = 0; i <= 10; i++) line(g, 38, 6 + i, 38 + i, 6 + i, 'M'); rect(g, 16, 54, 32, 4, 'M+1'); for (const y of [40, 46, 52]) rect(g, 20, y, y === 46 ? 16 : 24, 2, 'M'); rect(g, 16, 6, 3, 52, 'G+2'); return [32, 24]; },
  chart(g) { rect(g, 10, 32, 12, 26, 'M'); rect(g, 26, 12, 12, 46, 'M'); rect(g, 42, 40, 12, 18, 'M'); for (const [x, y] of [[10, 32], [26, 12], [42, 40]]) { rect(g, x, y, 12, 2, 'M+2'); rect(g, x + 9, y, 3, 58 - y, 'M-2'); rect(g, x, y, 2, 58 - y, 'M+1'); } rect(g, 8, 58, 48, 3, 'E'); return [32, 24]; },
  hourglass(g) { for (let y = 6; y < 58; y++) { const w = Math.abs(y - 32) * 0.8 + 2; rect(g, Math.round(32 - w), y, Math.round(w * 2), 1, 'M'); } shadeEllipse(g, 'M', 32, 32, 22, 26, { roundness: 0.3 }); for (let y = 40; y < 56; y++) { const w = (y - 36) * 0.6; rect(g, Math.round(32 - w), y, Math.round(w * 2), 1, 'M+2'); } rect(g, 12, 4, 40, 4, 'E'); rect(g, 12, 56, 40, 4, 'E'); rect(g, 14, 5, 36, 1, 'G'); return [32, 44]; },
  lock(g) { rect(g, 14, 28, 36, 28, 'M'); shadeEllipse(g, 'M', 32, 42, 20, 16, { roundness: 0.35 }); for (let y = 12; y < 30; y++) for (let x = 18; x < 46; x++) { const d = Math.hypot(x - 31.5, y - 24); if (d <= 14 && d >= 9 && y < 28) px(g, x, y, y < 18 ? 'M+1' : 'M-2'); } return [32, 40]; },
  bug(g) { ellipse(g, 32, 38, 18, 15, 'M'); ellipse(g, 32, 24, 11, 9, 'M'); shadeEllipse(g, 'M', 32, 36, 18, 20, { roundness: 0.45 }); rect(g, 31, 30, 3, 20, 'M-2'); for (const [x0, y0, x1, y1] of [[16, 32, 6, 24], [14, 40, 4, 42], [16, 48, 8, 58], [48, 32, 58, 24], [50, 40, 60, 42], [48, 48, 56, 58]]) line(g, x0, y0, x1, y1, 'M-2', 2); line(g, 26, 16, 20, 8, 'M-2', 2); line(g, 38, 16, 44, 8, 'M-2', 2); ellipse(g, 20, 8, 2.5, 2.5, 'M-2'); ellipse(g, 44, 8, 2.5, 2.5, 'M-2'); return [32, 24]; },
  cloud(g) { ellipse(g, 22, 36, 14, 12, 'M'); ellipse(g, 40, 36, 16, 14, 'M'); ellipse(g, 30, 26, 14, 12, 'M'); rect(g, 12, 40, 42, 8, 'M'); shadeEllipse(g, 'M', 32, 36, 26, 20, { roundness: 0.4 }); ellipse(g, 26, 20, 4, 2.5, 'L'); return [32, 36]; },
  cursor(g) { for (let y = 6; y < 48; y++) rect(g, 16, y, Math.min(28, Math.round((y - 6) * 0.75) + 2), 1, 'M'); rect(g, 28, 40, 8, 18, 'M'); shadeEllipse(g, 'M', 28, 30, 18, 28, { roundness: 0.25 }); rect(g, 17, 8, 3, 30, 'M+2'); return [28, 26]; },
};
export const MONSTER_SHAPES = Object.keys(SHAPES);

function monsterFrame(def, frame) {
  const g = blank();
  const [cx, cy] = (SHAPES[def.shape] ?? SHAPES.blob)(g);
  drawFace(g, def.face ?? {}, cx, cy);
  if (def.elite) { rect(g, cx - 10, 2, 20, 4, 'Y'); for (const x of [cx - 10, cx - 2, cx + 6]) rect(g, x, 0, 4, 2, 'Y'); for (const x of [cx - 7, cx - 1, cx + 5]) px(g, x, 3, 'L'); rect(g, cx - 10, 5, 20, 1, 'Y-2'); }
  const out = outline(g);
  return frame ? shiftDown(out, 2) : out;
}

/** 96x64 "긴급 티켓" boss. */
function bossFrame(def, frame) {
  const g = blank(96, 64);
  rect(g, 4, 8, 88, 48, 'M');
  for (const [x, y] of [[4, 8], [91, 8], [4, 55], [91, 55], [5, 8], [90, 8], [5, 55], [90, 55], [4, 9], [91, 9], [4, 54], [91, 54]]) px(g, x, y, '.');
  shadeEllipse(g, 'M', 48, 32, 50, 30, { roundness: 0.2 });
  rect(g, 66, 8, 4, 48, 'M-2'); for (let y = 9; y < 56; y += 4) rect(g, 66, y, 4, 2, 'M');
  for (const y of [20, 28, 36]) rect(g, 72, y, 16, 4, 'L'); rect(g, 72, 44, 10, 4, 'L');
  rect(g, 12, 44, 48, 4, 'L');
  rect(g, 16, 18, 10, 6, 'L'); rect(g, 38, 18, 10, 6, 'L'); rect(g, 17, 20, 5, 4, 'E'); rect(g, 39, 20, 5, 4, 'E'); px(g, 17, 20, 'L'); px(g, 39, 20, 'L');
  line(g, 14, 15, 26, 18, 'E', 2); line(g, 37, 18, 49, 15, 'E', 2);
  rect(g, 20, 30, 24, 6, 'E'); for (let i = 0; i < 6; i++) rect(g, 21 + i * 4, 30, 2, 3, 'L');
  rect(g, 10, 26, 4, 2, 'K'); rect(g, 50, 26, 4, 2, 'K');
  rect(g, 56, 14, 4, 14, 'L'); rect(g, 56, 31, 4, 4, 'L');
  const out = outline(g);
  return frame ? shiftDown(out, 2) : out;
}

// ------------------------------------------------------------------- render --
const cache = new Map();
function colorOf(ch, palette) {
  if (ch.startsWith('O:')) return darken(palette[ch.slice(2)] ?? '#888888', 0.42);
  return palette[ch] ?? '#ff00ff';
}
function render(key, g, palette, scale = 1) {
  const hit = cache.get(key);
  if (hit) return hit;
  const h = g.length, w = g[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = g[y][x];
    if (ch === '.') continue;
    ctx.fillStyle = colorOf(ch, palette);
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  cache.set(key, c);
  return c;
}
const heroPalette = (def) => ramp({ ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...(def.look?.skin ? { S: def.look.skin } : {}), ...(def.look?.eyes ? { I: def.look.eyes } : {}), ...def.palette });
const monsterPalette = (mon) => ramp({ ...MONSTER_DEFAULT, ...mon.palette });

const HERO_POSES = { idle: ['idle', 'idle2'], walk: ['walkA', 'idle', 'walkB', 'idle'], attack: ['raise', 'strike', 'idle'] };
/** @param anim 'idle' (2 frames) | 'walk' (4) | 'attack' (3) */
export function heroSprite(def, anim = 'idle', frame = 0, scale = 1) {
  const poses = HERO_POSES[anim] ?? HERO_POSES.idle;
  const pose = poses[frame % poses.length];
  const key = `h:${def.id}:${pose}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  return render(key, heroFrame(def, pose), heroPalette(def), scale);
}
export const heroFrameCount = (anim) => (HERO_POSES[anim] ?? HERO_POSES.idle).length;

export function monsterSprite(mon, frame = 0) {
  const key = `m:${mon.id}:${mon.elite ? 'e' : ''}:${frame}`;
  if (cache.has(key)) return cache.get(key);
  const g = mon.shape === 'ticket' ? bossFrame(mon, frame) : monsterFrame(mon, frame);
  return render(key, g, monsterPalette(mon), 1);
}

/** White silhouette of a sprite for hit flashes. */
const flashCache = new WeakMap();
export function flashSprite(img) {
  let f = flashCache.get(img);
  if (f) return f;
  f = document.createElement('canvas'); f.width = img.width; f.height = img.height;
  const ctx = f.getContext('2d'); ctx.drawImage(img, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, f.width, f.height);
  flashCache.set(img, f);
  return f;
}

/** Small head icon (data URL) for tables. */
export function heroIconDataURL(def) {
  const key = `icon:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 22; c.height = 22;
  const ctx = c.getContext('2d');
  const pal = heroPalette(def);
  const g = heroFrame(def, 'idle');
  for (let y = 0; y < 22; y++) for (let x = 19; x < 41; x++) {
    const ch = g[y][x]; if (ch === '.') continue;
    ctx.fillStyle = colorOf(ch, pal); ctx.fillRect(x - 19, y, 1, 1);
  }
  const url = c.toDataURL(); cache.set(key, url); return url;
}

// --- Card illustrations ------------------------------------------------------
export const CARD_W = 112, CARD_H = 150;

export function cardCanvas(def, { star = 1, owned = true, title = '', sub = '' } = {}) {
  const g = GRADES[def.grade];
  const c = document.createElement('canvas'); c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, g.bg);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 8; x < CARD_W; x += 16) { ctx.moveTo(x + 0.5, 4); ctx.lineTo(x + 0.5, 104); }
  for (let y = 12; y < 104; y += 12) { ctx.moveTo(4, y + 0.5); ctx.lineTo(CARD_W - 4, y + 0.5); }
  ctx.stroke();
  ctx.fillStyle = g.color; ctx.beginPath(); ctx.roundRect(6, 6, 20, 15, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.grade, 16, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(CARD_W / 2, 100, 26, 5, 0, 0, Math.PI * 2); ctx.fill();
  const img = heroSprite(def, 'idle', 0, 1);
  if (!owned) ctx.globalAlpha = 0.35;
  ctx.drawImage(img, (CARD_W - 64) / 2, 34);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g.color; ctx.fillRect(0, 112, CARD_W, 38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(fit(ctx, def.name, CARD_W - 10), CARD_W / 2, 124);
  ctx.font = '10px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
  const line2 = title || (owned ? '★'.repeat(star) + '☆'.repeat(5 - star) : '미보유');
  ctx.fillText(fit(ctx, line2, CARD_W - 10), CARD_W / 2, 139);
  if (sub) { ctx.font = 'bold 10px "Segoe UI", sans-serif'; ctx.fillStyle = '#333'; ctx.textAlign = 'right'; ctx.fillText(sub, CARD_W - 7, 14); }
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);
  if (def.grade === 'S') { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 4.5, CARD_W - 9, CARD_H - 9); }
  if (!owned) { ctx.fillStyle = 'rgba(120,120,120,0.35)'; ctx.fillRect(0, 0, CARD_W, 112); }
  return c;
}

/** Large portrait for the detail dialog. */
export function portraitCanvas(def, scale = 3) {
  const g = GRADES[def.grade]; const size = SRC * scale + 16;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = g.bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath();
  for (let i = 12; i < size; i += 16) { ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(size / 2, size - 10, 12 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(heroSprite(def, 'idle', 0, scale), 8, 8);
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
  return c;
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
