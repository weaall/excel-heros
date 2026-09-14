// Procedural 32x32 pixel sprites rendered at 2x (= 64px on screen) + card illustrations.
// Everything is generated from primitives so every hero has its own look (hair, accessory,
// weapon) and monsters have distinct shapes, faces and phase palettes. Results are cached.
import { GRADES } from './heroes.js';

export const SCALE = 1;              // heroes are drawn at native 64x64
export const SRC = 64;               // hero template size
export const SPRITE = 64;            // on-screen sprite size
const MSRC = 32;                     // monster template size (upscaled 2x with EPX smoothing)

// ------------------------------------------------------------- pixel grid --
const blank = (w = SRC, h = SRC) => Array.from({ length: h }, () => Array(w).fill('.'));
const px = (g, x, y, ch) => { if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = ch; };
const rect = (g, x, y, w, h, ch) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(g, i, j, ch); };
const ellipse = (g, cx, cy, rx, ry, ch, pred) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    if (dx * dx + dy * dy <= 1 && (!pred || pred(x, y))) px(g, x, y, ch);
  }
};
const line = (g, x0, y0, x1, y1, ch) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) px(g, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), ch);
};
/** Add a 1px outline ('O') around every opaque pixel. */
function outline(g) {
  const h = g.length, w = g[0].length, out = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== '.' && g[y + dy][x + dx] !== 'O')) out[y][x] = 'O';
  }
  return out;
}
/** Scale2x (EPX) upscale of a char grid — smooths diagonals instead of doubling blocks. */
function epx2(g) {
  const h = g.length, w = g[0].length, out = blank(w * 2, h * 2);
  const at = (x, y) => (y < 0 || y >= h || x < 0 || x >= w) ? '.' : g[y][x];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = g[y][x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    out[y * 2][x * 2] = (C === A && C !== D && A !== B) ? A : P;
    out[y * 2][x * 2 + 1] = (A === B && A !== C && B !== D) ? B : P;
    out[y * 2 + 1][x * 2] = (D === C && D !== B && C !== A) ? C : P;
    out[y * 2 + 1][x * 2 + 1] = (B === D && B !== A && D !== C) ? D : P;
  }
  return out;
}

const shiftDown = (g, dy) => [...blank(g[0].length, dy), ...g.slice(0, g.length - dy)];

// ------------------------------------------------------------------ heroes --
// Palette keys: S skin, s skin shade, H hair, h hair shade, B shirt, b shirt shade, P pants, p pants shade,
// W weapon, w weapon shade, A accent/accessory, a accent shade, E eye, L light, K cheek, O outline, G glasses
const DEFAULT_HERO_PAL = { S: '#f6d5b5', E: '#1b1b1b', L: '#ffffff', K: '#f3a3a3', O: '#23262b', G: '#2d3436', A: '#c0392b' };
const ROLE_ACCENT = { tank: '#95a5a6', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };
const darken = (hex, f = 0.72) => {
  const n = parseInt(hex.slice(1), 16); if (Number.isNaN(n)) return hex;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

// Anatomy at native 64x64 (3/4 view facing right, ~4.5 heads tall).
// head centre (30,13) r 7.5x7 · neck y20-23 · torso x22..38 y23..45 · legs y46..61 · back (left) side shaded.
const HEAD = { cx: 30, cy: 13, rx: 7.5, ry: 7 };

function drawHair(g, style) {
  const cap = (pred) => ellipse(g, 29, 10, 8.6, 6.4, 'H', pred);
  const back = (toY) => rect(g, 20, 10, 5, toY - 10, 'H');
  switch (style) {
    case 'bald': ellipse(g, 27, 8, 2.2, 1.2, 'L'); break;
    case 'long': cap((x, y) => y <= 13); back(38); for (const y of [18, 26, 34]) px(g, 21, y, 'h'); break;
    case 'bun': cap((x, y) => y <= 12); ellipse(g, 22, 6, 4, 3.5, 'H'); px(g, 21, 5, 'L'); break;
    case 'spiky': cap((x, y) => y <= 12); for (const [x, y] of [[22, 4], [26, 1], [30, 0], [34, 1], [38, 4]]) { line(g, x, y, x, 8, 'H'); line(g, x + 1, y + 1, x + 1, 8, 'H'); } break;
    case 'side': cap((x, y) => y <= 12); for (let i = 0; i < 3; i++) line(g, 31, 7 + i, 41, 14 + i, 'H'); break;
    case 'curly': cap((x, y) => y <= 13); for (const [x, y] of [[21, 9], [23, 4], [28, 1], [33, 1], [38, 4], [40, 9]]) ellipse(g, x, y, 3, 3, 'H'); break;
    case 'bob': cap((x, y) => y <= 13); back(28); rect(g, 37, 12, 4, 10, 'H'); break;
    case 'grey': cap((x, y) => y <= 12); line(g, 25, 6, 28, 5, 'L'); line(g, 33, 6, 35, 7, 'L'); break;
    default: cap((x, y) => y <= 12); // short
  }
  // highlight streak + back shade
  if (style !== 'bald') line(g, 26, 5, 30, 4, 'L');
  for (let y = 0; y <= 40; y++) for (let x = 18; x <= 24; x++) if (g[y][x] === 'H') g[y][x] = 'h';
}

function drawAccessory(g, acc) {
  const frame = (x, y, w, h) => { rect(g, x, y, w, 1, 'G'); rect(g, x, y + h - 1, w, 1, 'G'); rect(g, x, y, 1, h, 'G'); rect(g, x + w - 1, y, 1, h, 'G'); };
  switch (acc) {
    case 'glasses': frame(24, 10, 6, 6); frame(32, 10, 7, 6); rect(g, 30, 12, 2, 1, 'G'); rect(g, 39, 12, 2, 1, 'G'); px(g, 25, 11, 'L'); px(g, 33, 11, 'L'); break;
    case 'sunglasses': rect(g, 24, 11, 15, 5, 'G'); rect(g, 30, 12, 2, 3, 'O'); px(g, 34, 12, 'L'); px(g, 35, 12, 'L'); px(g, 26, 12, 'L'); break;
    case 'beard': rect(g, 26, 17, 13, 4, 'H'); rect(g, 28, 21, 9, 2, 'H'); rect(g, 26, 17, 2, 4, 'h'); break;
    case 'mustache': rect(g, 32, 16, 7, 2, 'H'); px(g, 31, 17, 'H'); break;
    case 'tie': rect(g, 29, 24, 4, 3, 'A'); rect(g, 30, 27, 2, 6, 'A'); rect(g, 29, 33, 4, 8, 'A'); px(g, 31, 35, 'L'); px(g, 31, 38, 'L'); rect(g, 29, 41, 4, 1, 'a'); break;
    case 'badge': rect(g, 24, 27, 4, 4, 'A'); rect(g, 25, 28, 2, 2, 'L'); break;
    case 'headset': rect(g, 38, 12, 4, 5, 'A'); rect(g, 39, 13, 2, 3, 'L'); for (let i = 0; i < 2; i++) { line(g, 39, 11 - i, 30, 3 - i, 'A'); line(g, 30, 3 - i, 21, 8 - i, 'A'); } line(g, 41, 17, 44, 21, 'A'); rect(g, 44, 21, 2, 2, 'O'); break;
    case 'hardhat': ellipse(g, 29, 7, 10, 5.5, 'A', (x, y) => y <= 9); rect(g, 18, 9, 25, 3, 'A'); rect(g, 27, 3, 5, 1, 'L'); rect(g, 18, 11, 25, 1, 'a'); break;
    case 'crown': rect(g, 22, 2, 17, 4, 'A'); for (const x of [22, 27, 32, 37]) rect(g, x, 0, 2, 2, 'A'); for (const x of [25, 30, 35]) px(g, x, 3, 'L'); rect(g, 22, 5, 17, 1, 'a'); break;
    case 'coffee': rect(g, 14, 36, 7, 9, 'A'); rect(g, 13, 35, 9, 2, 'L'); rect(g, 21, 38, 2, 4, 'A'); rect(g, 14, 44, 7, 1, 'a'); px(g, 16, 31, 'L'); px(g, 17, 29, 'L'); px(g, 18, 32, 'L'); break;
    case 'clipboard': rect(g, 10, 28, 10, 19, 'L'); rect(g, 10, 28, 10, 19, 'L'); rect(g, 12, 26, 6, 3, 'A'); for (const y of [33, 37, 41]) rect(g, 12, y, 6, 1, 'A'); rect(g, 10, 46, 10, 1, 'G'); break;
    case 'earring': px(g, 39, 16, 'A'); px(g, 39, 17, 'L'); px(g, 39, 18, 'A'); break;
    case 'flower': ellipse(g, 22, 7, 3.2, 3.2, 'A'); px(g, 22, 7, 'L'); px(g, 21, 7, 'L'); for (const [x, y] of [[19, 7], [25, 7], [22, 4], [22, 10]]) px(g, x, y, 'a'); break;
    case 'scarf': rect(g, 22, 21, 17, 4, 'A'); rect(g, 18, 25, 4, 10, 'A'); rect(g, 22, 23, 17, 1, 'a'); rect(g, 18, 29, 4, 1, 'a'); break;
    case 'lanyard': line(g, 27, 23, 29, 34, 'A'); line(g, 33, 23, 31, 34, 'A'); rect(g, 27, 34, 7, 7, 'L'); rect(g, 28, 35, 2, 2, 'A'); rect(g, 28, 38, 5, 1, 'G'); break;
    default: break;
  }
}

/** Weapon in the front (right) hand. pose: 'idle' | 'raise' | 'strike' */
function drawWeapon(g, role, pose) {
  const blade = (x0, y0, x1, y1) => { line(g, x0, y0, x1, y1, 'W'); line(g, x0 + 1, y0, x1 + 1, y1, 'L'); line(g, x0 + 2, y0, x1 + 2, y1, 'w'); };
  if (pose === 'strike') {
    switch (role) {
      case 'melee': rect(g, 52, 27, 11, 3, 'W'); rect(g, 52, 27, 11, 1, 'L'); px(g, 63, 28, 'L'); rect(g, 50, 25, 2, 7, 'A'); break;
      case 'ranged': rect(g, 50, 23, 13, 11, 'W'); rect(g, 51, 24, 11, 7, 'L'); rect(g, 52, 25, 9, 5, 'w'); rect(g, 51, 32, 11, 1, 'O'); break;
      case 'tank': ellipse(g, 55, 30, 6, 10, 'A'); ellipse(g, 55, 30, 4.5, 8.5, 'a'); rect(g, 54, 26, 2, 8, 'L'); rect(g, 52, 29, 6, 2, 'L'); break;
      case 'healer': rect(g, 50, 23, 12, 11, 'L'); rect(g, 54, 25, 4, 7, 'W'); rect(g, 52, 27, 8, 3, 'W'); rect(g, 53, 21, 6, 2, 'O'); break;
    }
    return;
  }
  const up = pose === 'raise';
  switch (role) {
    case 'melee':
      if (up) { blade(47, 19, 59, 4); rect(g, 43, 20, 6, 2, 'A'); px(g, 60, 3, 'L'); }
      else { blade(43, 39, 56, 22); rect(g, 40, 39, 8, 2, 'A'); px(g, 57, 21, 'L'); }
      break;
    case 'ranged': { const y = up ? 4 : 38; rect(g, 40, y, 13, 11, 'W'); rect(g, 41, y + 1, 11, 7, 'L'); rect(g, 42, y + 2, 9, 5, 'w'); rect(g, 41, y + 9, 11, 1, 'O'); break; }
    case 'tank': { const y = up ? 20 : 40; ellipse(g, 46, y, 6, 10, 'A'); ellipse(g, 46, y, 4.5, 8.5, 'a'); rect(g, 45, y - 4, 2, 8, 'L'); rect(g, 43, y - 1, 6, 2, 'L'); break; }
    case 'healer': { const y = up ? 4 : 38; rect(g, 40, y, 12, 11, 'L'); rect(g, 44, y + 2, 4, 7, 'W'); rect(g, 42, y + 4, 8, 3, 'W'); rect(g, 43, y - 2, 6, 2, 'O'); break; }
  }
}

/**
 * Build one 64x64 hero frame (3/4 view facing right, ~4.5 heads tall, two-tone shading, outlined).
 * look: { hair, acc, acc2?, skin? }  pose: 'idle'|'walk'|'raise'|'strike'
 */
function heroFrame(def, pose) {
  const g = blank();
  const look = def.look ?? {};
  const walk = pose === 'walk';
  // legs (back leg shaded) + shoes with a toe pointing right
  const bl = walk ? 21 : 24, fl = walk ? 34 : 31;
  rect(g, bl, 46, 6, 13, 'p'); rect(g, fl, 46, 6, 13, 'P'); rect(g, fl, 46, 1, 13, 'p');
  rect(g, bl - 1, 58, 7, 4, 'O'); rect(g, fl, 58, 9, 4, 'O'); rect(g, fl + 1, 59, 6, 1, 'G');
  // torso, back shade, collar, buttons, belt
  rect(g, 22, 23, 17, 22, 'B'); rect(g, 22, 23, 4, 22, 'b');
  for (let i = 0; i < 4; i++) { px(g, 28 + i, 23 + i, 'L'); px(g, 32 - i, 23 + i, 'L'); }
  if (!['tie', 'lanyard', 'scarf'].includes(look.acc) && !['tie', 'lanyard', 'scarf'].includes(look.acc2)) for (const y of [30, 35, 40]) px(g, 30, y, 'O');
  rect(g, 22, 44, 17, 2, 'O'); rect(g, 29, 44, 3, 2, 'A');
  // neck
  rect(g, 27, 19, 6, 5, 's');
  // back arm (sleeve + hand)
  rect(g, 18, 24, 4, 16, 'b'); rect(g, 18, 40, 4, 5, 's');
  // front arm (pose dependent)
  if (pose === 'strike') { rect(g, 38, 26, 11, 6, 'B'); rect(g, 47, 26, 5, 5, 'S'); }
  else if (pose === 'raise') { rect(g, 38, 20, 6, 8, 'B'); rect(g, 43, 19, 5, 5, 'S'); }
  else { rect(g, 38, 24, 5, 16, 'B'); rect(g, 39, 40, 4, 5, 'S'); }
  // head + back shade + ear
  ellipse(g, HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 'S');
  for (let y = 5; y <= 21; y++) for (let x = 21; x <= 24; x++) if (g[y][x] === 'S') g[y][x] = 's';
  rect(g, 38, 13, 2, 3, 'S'); px(g, 38, 14, 's');
  drawHair(g, look.hair ?? 'short');
  // face turned right: far eye narrow, near eye wide; pupils, highlights, brows, nose, mouth, cheeks
  rect(g, 27, 12, 2, 3, 'E'); rect(g, 33, 12, 3, 3, 'E'); px(g, 33, 12, 'L'); px(g, 27, 12, 'L');
  rect(g, 27, 10, 2, 1, 'h'); rect(g, 33, 10, 3, 1, 'h');
  px(g, 37, 15, 's'); px(g, 37, 16, 's');
  rect(g, 34, 18, 3, 1, 'O'); px(g, 36, 17, 'O');
  px(g, 26, 16, 'K'); rect(g, 35, 16, 2, 1, 'K');
  drawAccessory(g, look.acc);
  drawAccessory(g, look.acc2);
  drawWeapon(g, def.role, walk ? 'idle' : pose);
  return outline(g);
}

// ---------------------------------------------------------------- monsters --
// Palette keys: M main, D dark shade, L light, E eye, O outline, K cheek, Y gold (elite crown)
const MONSTER_DEFAULT = { L: '#ffffff', K: '#ffb0b0', O: '#1e1e1e', Y: '#f1c40f' };

function drawFace(g, face, cx, cy) {
  switch (face.eyes) {
    case 'angry': rect(g, cx - 6, cy - 1, 4, 2, 'E'); rect(g, cx + 2, cy - 1, 4, 2, 'E'); px(g, cx - 6, cy - 2, 'E'); px(g, cx + 5, cy - 2, 'E'); px(g, cx - 5, cy - 1, 'L'); px(g, cx + 3, cy - 1, 'L'); break;
    case 'dot': rect(g, cx - 4, cy - 1, 2, 2, 'E'); rect(g, cx + 2, cy - 1, 2, 2, 'E'); break;
    case 'one': ellipse(g, cx, cy - 1, 4, 3.5, 'L'); ellipse(g, cx, cy - 1, 2, 2, 'E'); px(g, cx - 1, cy - 2, 'L'); break;
    case 'sleepy': rect(g, cx - 6, cy, 4, 1, 'E'); rect(g, cx + 2, cy, 4, 1, 'E'); break;
    default: rect(g, cx - 6, cy - 2, 3, 3, 'E'); rect(g, cx + 3, cy - 2, 3, 3, 'E'); px(g, cx - 6, cy - 2, 'L'); px(g, cx + 3, cy - 2, 'L');
  }
  rect(g, cx - 8, cy + 2, 2, 1, 'K'); rect(g, cx + 6, cy + 2, 2, 1, 'K');
  switch (face.mouth) {
    case 'teeth': rect(g, cx - 4, cy + 3, 8, 2, 'O'); for (let i = 0; i < 4; i++) px(g, cx - 4 + i * 2, cy + 3, 'L'); break;
    case 'smile': line(g, cx - 4, cy + 3, cx - 2, cy + 5, 'O'); rect(g, cx - 2, cy + 5, 4, 1, 'O'); line(g, cx + 2, cy + 5, cx + 4, cy + 3, 'O'); break;
    case 'zigzag': for (let i = 0; i < 8; i++) px(g, cx - 4 + i, cy + 3 + (i % 2), 'O'); break;
    case 'o': ellipse(g, cx, cy + 4, 1.6, 1.6, 'O'); break;
    default: rect(g, cx - 3, cy + 4, 6, 1, 'O');
  }
}

const SHAPES = {
  blob(g) { ellipse(g, 16, 19, 12, 9.5, 'M'); ellipse(g, 16, 22, 10, 6, 'D', (x, y) => y > 24); ellipse(g, 10, 13, 3, 2, 'L'); return [16, 17]; },
  cube(g) { rect(g, 6, 9, 20, 18, 'M'); rect(g, 6, 24, 20, 3, 'D'); rect(g, 8, 7, 18, 2, 'L'); rect(g, 24, 9, 2, 15, 'D'); return [16, 17]; },
  diamond(g) { for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) if (Math.abs(x - 16) + Math.abs(y - 16) <= 12) px(g, x, y, Math.abs(x - 16) + Math.abs(y - 16) > 10 && y > 16 ? 'D' : 'M'); line(g, 12, 8, 16, 4, 'L'); return [16, 16]; },
  spike(g) { for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; line(g, 16, 17, Math.round(16 + Math.cos(t) * 14), Math.round(17 + Math.sin(t) * 14), 'D'); } ellipse(g, 16, 17, 9.5, 9.5, 'M'); ellipse(g, 12, 12, 2.5, 2, 'L'); return [16, 17]; },
  ghost(g) { ellipse(g, 16, 14, 11, 10, 'M'); rect(g, 5, 14, 22, 12, 'M'); for (let x = 5; x < 27; x += 4) rect(g, x, 26, 2, 2, 'M'); ellipse(g, 10, 9, 3, 2, 'L'); return [16, 15]; },
  sheet(g) { rect(g, 8, 3, 16, 26, 'L'); for (let i = 0; i < 5; i++) px(g, 23 - i, 3 + i, '.'); for (let i = 0; i < 5; i++) rect(g, 19, 3 + i, 5 - i, 1, '.'); for (let i = 0; i <= 4; i++) line(g, 19, 3 + i, 19 + i, 3 + i, 'M'); rect(g, 10, 20, 12, 1, 'M'); rect(g, 10, 23, 8, 1, 'M'); rect(g, 10, 26, 10, 1, 'M'); return [16, 12]; },
  chart(g) { rect(g, 5, 16, 6, 13, 'M'); rect(g, 13, 6, 6, 23, 'M'); rect(g, 21, 20, 6, 9, 'M'); rect(g, 5, 27, 22, 2, 'D'); rect(g, 13, 6, 6, 1, 'L'); rect(g, 4, 29, 24, 1, 'O'); return [16, 12]; },
  hourglass(g) { for (let y = 3; y < 29; y++) { const w = Math.abs(y - 16) * 0.8 + 1; rect(g, Math.round(16 - w), y, Math.round(w * 2), 1, y > 16 ? 'D' : 'M'); } rect(g, 6, 2, 20, 2, 'O'); rect(g, 6, 28, 20, 2, 'O'); return [16, 22]; },
  lock(g) { rect(g, 7, 14, 18, 14, 'M'); rect(g, 7, 25, 18, 3, 'D'); for (let y = 6; y < 15; y++) for (let x = 9; x < 23; x++) { const d = Math.hypot(x - 16 + 0.5, y - 12); if (d <= 7 && d >= 4.5 && y < 14) px(g, x, y, 'D'); } return [16, 20]; },
  bug(g) { ellipse(g, 16, 19, 9, 7.5, 'M'); ellipse(g, 16, 12, 5.5, 4.5, 'M'); for (const [x0, y0, x1, y1] of [[8, 16, 3, 12], [7, 20, 2, 21], [8, 24, 4, 29], [24, 16, 29, 12], [25, 20, 30, 21], [24, 24, 28, 29]]) line(g, x0, y0, x1, y1, 'D'); line(g, 13, 8, 10, 4, 'D'); line(g, 19, 8, 22, 4, 'D'); rect(g, 15, 15, 2, 10, 'D'); return [16, 12]; },
  cloud(g) { ellipse(g, 11, 18, 7, 6, 'M'); ellipse(g, 20, 18, 8, 7, 'M'); ellipse(g, 15, 13, 7, 6, 'M'); rect(g, 6, 20, 21, 4, 'M'); ellipse(g, 14, 11, 2, 1.5, 'L'); return [16, 18]; },
  cursor(g) { for (let y = 3; y < 24; y++) rect(g, 8, y, Math.min(14, Math.round((y - 3) * 0.75) + 1), 1, 'M'); rect(g, 14, 20, 4, 9, 'D'); ellipse(g, 12, 8, 1.5, 1.5, 'L'); return [14, 13]; },
};
export const MONSTER_SHAPES = Object.keys(SHAPES);

function monsterFrame(def, frame) {
  const g = blank(MSRC, MSRC);
  const draw = SHAPES[def.shape] ?? SHAPES.blob;
  const [cx, cy] = draw(g);
  drawFace(g, def.face ?? {}, cx - 2, cy);
  if (def.elite) { rect(g, cx - 5, 1, 10, 2, 'Y'); for (const x of [cx - 5, cx - 1, cx + 3]) rect(g, x, -1, 2, 2, 'Y'); rect(g, cx - 5, 0, 10, 1, 'Y'); px(g, cx, 1, 'L'); }
  const out = epx2(outline(g));
  return frame ? shiftDown(out, 2) : out;
}

/** 48x32 "긴급 티켓" boss (rendered 96x64). */
function bossFrame(def, frame) {
  const g = blank(48, 32);
  rect(g, 2, 4, 44, 24, 'M');
  for (const [x, y] of [[2, 4], [45, 4], [2, 27], [45, 27]]) px(g, x, y, '.');
  rect(g, 33, 4, 2, 24, 'D'); for (let y = 5; y < 28; y += 2) px(g, 33, y, 'M'), px(g, 34, y, 'M');
  rect(g, 36, 10, 8, 2, 'L'); rect(g, 36, 14, 8, 2, 'L'); rect(g, 36, 18, 6, 2, 'L');
  rect(g, 6, 22, 24, 2, 'L');
  // big angry face
  rect(g, 8, 9, 5, 3, 'E'); rect(g, 19, 9, 5, 3, 'E'); px(g, 8, 8, 'E'); px(g, 23, 8, 'E'); px(g, 9, 9, 'L'); px(g, 20, 9, 'L');
  rect(g, 10, 15, 12, 3, 'O'); for (let i = 0; i < 6; i++) px(g, 10 + i * 2, 15, 'L');
  rect(g, 5, 13, 2, 1, 'K'); rect(g, 25, 13, 2, 1, 'K');
  // "!" stamp
  rect(g, 28, 7, 2, 7, 'L'); rect(g, 28, 16, 2, 2, 'L');
  const out = epx2(outline(g));
  return frame ? shiftDown(out, 2) : out;
}

// ------------------------------------------------------------------- render --
const cache = new Map();
function render(key, g, palette, scale = SCALE) {
  const hit = cache.get(key);
  if (hit) return hit;
  const h = g.length, w = g[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = g[y][x];
    if (ch === '.') continue;
    ctx.fillStyle = palette[ch] ?? '#ff00ff';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  cache.set(key, c);
  return c;
}
const heroPalette = (def) => {
  const p = { ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...(def.look?.skin ? { S: def.look.skin } : {}), ...def.palette };
  return { ...p, s: darken(p.S, 0.86), h: darken(p.H, 0.7), b: darken(p.B, 0.72), p: darken(p.P, 0.72), w: darken(p.W, 0.7), a: darken(p.A, 0.7) };
};

/**
 * @param def   hero/job definition (data/heroes.js)
 * @param anim  'idle' | 'walk' | 'attack'
 * @param frame 0 | 1
 */
export function heroSprite(def, anim = 'idle', frame = 0, scale = SCALE) {
  const key = `h:${def.id}:${anim}:${frame}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  let g;
  if (anim === 'attack') g = heroFrame(def, frame === 0 ? 'raise' : 'strike');
  else if (anim === 'walk') g = heroFrame(def, frame === 0 ? 'walk' : 'idle');
  else { g = heroFrame(def, 'idle'); if (frame === 1) g = shiftDown(g, 1); }
  return render(key, g, heroPalette(def), scale);
}

export function monsterSprite(mon, frame = 0) {
  const key = `m:${mon.id}:${mon.elite ? 'e' : ''}:${frame}`;
  if (cache.has(key)) return cache.get(key);
  const pal = { ...MONSTER_DEFAULT, ...mon.palette };
  const g = mon.shape === 'ticket' ? bossFrame(mon, frame) : monsterFrame(mon, frame);
  return render(key, g, pal, 1);
}

/** Small head icon (data URL) for tables. */
export function heroIconDataURL(def) {
  const key = `icon:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 22; c.height = 22;
  const ctx = c.getContext('2d');
  const pal = heroPalette(def);
  const g = heroFrame(def, 'idle');
  for (let y = 0; y < 22; y++) for (let x = 20; x < 42; x++) {
    const ch = g[y][x]; if (ch === '.') continue;
    ctx.fillStyle = pal[ch]; ctx.fillRect(x - 20, y, 1, 1);
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
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(CARD_W / 2, 104, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
  const img = heroSprite(def, 'idle', 0, 1); // 64px, crisp
  if (!owned) ctx.globalAlpha = 0.35;
  ctx.drawImage(img, (CARD_W - 64) / 2, 30);
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
export function portraitCanvas(def, scale = 2) {
  const g = GRADES[def.grade]; const size = SRC * scale + 16;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = g.bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath();
  for (let i = 12; i < size; i += 16) { ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(size / 2, size - 10, 10 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(heroSprite(def, 'idle', 0, scale), 8, 8);
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
  return c;
}

/** Monster thumbnail (for the stage bar / bestiary). */
export function monsterThumb(mon, scale = 2) { return monsterSprite(mon, 0, scale); }

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
