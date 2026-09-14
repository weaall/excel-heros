// Procedural pixel art at native 64x64 (heroes, monsters) and 96x64 (boss) + card illustrations.
// Everything is generated from primitives on a character grid, so every hero has its own look
// (hair, accessories, weapon, colours) and monsters have distinct shapes, faces and phase palettes.
import { GRADES } from './heroes.js';

export const SCALE = 1;      // sprites are drawn at native resolution
export const SRC = 64;
export const SPRITE = 64;

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
const line = (g, x0, y0, x1, y1, ch, thick = 1) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
    for (let t = 0; t < thick; t++) px(g, x + t, y, ch);
  }
};
/** Replace `from` with `to` inside a rectangle (shading only where something was drawn). */
const tint = (g, x, y, w, h, from, to) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (g[j]?.[i] === from) g[j][i] = to; };
/** Add a 1px outline ('O') around every opaque pixel. */
function outline(g) {
  const h = g.length, w = g[0].length, out = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== '.') continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => g[y + dy]?.[x + dx] && g[y + dy][x + dx] !== '.' && g[y + dy][x + dx] !== 'O')) out[y][x] = 'O';
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
/** Blend toward white so highlights show even on very dark colours. */
const lighten = (hex, t = 0.3) => {
  const n = parseInt(hex.slice(1), 16); if (Number.isNaN(n)) return hex;
  const c = (v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0');
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
};

// ------------------------------------------------------------------ heroes --
// Palette keys: S skin · s skin shade · H hair · h hair shade · i hair highlight · B shirt · b shirt shade · c shirt highlight
// P pants · p pants shade · W weapon · w weapon shade · A accent · a accent shade · E eye · L light · K cheek · O outline · G dark grey
const DEFAULT_HERO_PAL = { S: '#f6d5b5', E: '#1b1b1b', L: '#ffffff', K: '#f0a0a0', O: '#23262b', G: '#6c7a89', A: '#c0392b' };
const ROLE_ACCENT = { tank: '#95a5a6', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };

// Anatomy (5 heads tall, 3/4 view facing right): head y6..18 (12px) · neck 18..21 · torso 21..42 · legs 43..59 · shoes 59..62
const HEAD = { cx: 30, cy: 12, rx: 6.5, ry: 6 };

function drawHair(g, style) {
  const cap = (pred) => ellipse(g, 29, 9, 7.8, 5.6, 'H', pred);
  const back = (toY) => rect(g, 21, 9, 4, toY - 9, 'H');
  switch (style) {
    case 'bald': ellipse(g, 27, 8, 2.4, 1.2, 'L'); break;
    case 'long': cap((x, y) => y <= 12); back(36); for (const y of [16, 24, 32]) px(g, 22, y, 'h'); rect(g, 36, 11, 2, 6, 'H'); break;
    case 'bun': cap((x, y) => y <= 11); ellipse(g, 22, 5, 3.6, 3.2, 'H'); px(g, 21, 4, 'i'); break;
    case 'spiky': cap((x, y) => y <= 11 && y >= 6); for (const [x, y] of [[22, 3], [25, 0], [29, -1], [33, 0], [37, 3]]) { line(g, x, y, x + 1, 9, 'H', 2); px(g, x + 1, y, 'i'); } break;
    case 'side': cap((x, y) => y <= 11); for (let i = 0; i < 4; i++) line(g, 30, 5 + i, 41, 12 + i, 'H'); rect(g, 40, 15, 2, 3, 'H'); break;
    case 'curly': cap((x, y) => y <= 12); for (const [x, y] of [[21, 9], [23, 3], [28, 0], [34, 1], [38, 5], [40, 10]]) ellipse(g, x, y, 3.6, 3.4, 'H'); for (const [x, y] of [[23, 2], [28, -1], [34, 0]]) px(g, x, y + 1, 'i'); break;
    case 'cap': cap((x, y) => y <= 11); ellipse(g, 29, 7, 8.5, 5, 'A', (x, y) => y <= 9); rect(g, 33, 9, 12, 2, 'A'); rect(g, 33, 11, 12, 1, 'a'); rect(g, 26, 4, 5, 1, 'L'); px(g, 30, 8, 'L'); break;
    case 'bob': cap((x, y) => y <= 12); back(26); rect(g, 36, 11, 3, 9, 'H'); break;
    case 'grey': cap((x, y) => y <= 11); line(g, 25, 6, 28, 5, 'L'); line(g, 33, 5, 35, 6, 'L'); px(g, 30, 4, 'L'); break;
    default: cap((x, y) => y <= 11); // short
  }
  if (!['bald', 'cap', 'spiky'].includes(style)) { line(g, 26, 5, 31, 4, 'i', 2); px(g, 33, 5, 'i'); }
  tint(g, 18, 0, 7, 40, 'H', 'h');           // back of the hair in shade
}

function drawAccessory(g, acc) {
  const frame = (x, y, w, h) => { rect(g, x, y, w, 1, 'G'); rect(g, x, y + h - 1, w, 1, 'G'); rect(g, x, y, 1, h, 'G'); rect(g, x + w - 1, y, 1, h, 'G'); };
  switch (acc) {
    case 'glasses': frame(24, 9, 6, 7); frame(31, 9, 7, 7); rect(g, 30, 11, 1, 1, 'G'); rect(g, 38, 11, 2, 1, 'G'); rect(g, 25, 10, 2, 1, 'L'); rect(g, 32, 10, 3, 1, 'L'); px(g, 25, 11, 'L'); px(g, 32, 11, 'L'); break;
    case 'sunglasses': rect(g, 25, 10, 12, 5, 'G'); rect(g, 30, 11, 1, 4, 'O'); rect(g, 33, 11, 2, 1, 'L'); px(g, 27, 11, 'L'); rect(g, 37, 11, 2, 1, 'G'); break;
    case 'beard': rect(g, 26, 15, 11, 4, 'H'); rect(g, 27, 19, 9, 2, 'H'); rect(g, 26, 15, 2, 4, 'h'); px(g, 32, 16, 'S'); px(g, 33, 16, 'S'); break;
    case 'mustache': rect(g, 32, 15, 5, 1, 'H'); rect(g, 31, 16, 7, 1, 'H'); break;
    case 'tie': rect(g, 29, 21, 3, 3, 'A'); rect(g, 30, 24, 2, 5, 'A'); rect(g, 29, 29, 4, 8, 'A'); px(g, 30, 37, 'A'); px(g, 31, 37, 'A'); for (const y of [31, 34]) px(g, 31, y, 'L'); rect(g, 29, 29, 1, 8, 'a'); break;
    case 'badge': rect(g, 24, 25, 4, 4, 'A'); rect(g, 25, 26, 2, 2, 'L'); rect(g, 24, 28, 4, 1, 'a'); break;
    case 'headset': rect(g, 37, 11, 4, 5, 'A'); rect(g, 38, 12, 2, 3, 'L'); line(g, 38, 10, 30, 3, 'A'); line(g, 38, 9, 30, 2, 'A'); line(g, 30, 3, 22, 7, 'A'); line(g, 30, 2, 22, 6, 'A'); line(g, 40, 16, 43, 19, 'A'); rect(g, 43, 19, 2, 2, 'O'); break;
    case 'hardhat': ellipse(g, 29, 6, 9.5, 5, 'A', (x, y) => y <= 8); rect(g, 19, 8, 23, 3, 'A'); rect(g, 27, 2, 5, 1, 'L'); rect(g, 19, 10, 23, 1, 'a'); px(g, 21, 6, 'a'); break;
    case 'crown': rect(g, 23, 1, 15, 4, 'A'); for (const x of [23, 28, 33]) rect(g, x, 0, 2, 1, 'A'); px(g, 37, 0, 'A'); for (const x of [26, 30, 34]) px(g, x, 2, 'L'); rect(g, 23, 4, 15, 1, 'a'); break;
    case 'coffee': rect(g, 14, 33, 7, 9, 'A'); rect(g, 13, 32, 9, 2, 'L'); rect(g, 21, 35, 2, 4, 'A'); rect(g, 14, 41, 7, 1, 'a'); px(g, 16, 28, 'L'); px(g, 17, 26, 'L'); px(g, 18, 29, 'L'); break;
    case 'clipboard': rect(g, 10, 25, 10, 20, 'L'); rect(g, 12, 23, 6, 3, 'A'); for (const y of [30, 34, 38]) rect(g, 12, y, 6, 1, 'A'); rect(g, 12, 41, 4, 1, 'A'); rect(g, 10, 44, 10, 1, 'G'); break;
    case 'earring': px(g, 38, 15, 'A'); px(g, 38, 16, 'L'); px(g, 38, 17, 'A'); break;
    case 'flower': ellipse(g, 22, 7, 3.2, 3.2, 'A'); for (const [x, y] of [[19, 7], [25, 7], [22, 4], [22, 10]]) px(g, x, y, 'a'); px(g, 22, 7, 'L'); px(g, 21, 7, 'L'); break;
    case 'scarf': rect(g, 22, 19, 17, 4, 'A'); rect(g, 18, 23, 4, 10, 'A'); rect(g, 22, 21, 17, 1, 'a'); rect(g, 18, 27, 4, 1, 'a'); rect(g, 18, 31, 4, 1, 'a'); break;
    case 'lanyard': line(g, 27, 21, 29, 32, 'A'); line(g, 33, 21, 31, 32, 'A'); rect(g, 27, 32, 7, 7, 'L'); rect(g, 28, 33, 2, 2, 'A'); rect(g, 28, 36, 5, 1, 'G'); break;
    default: break;
  }
}

/** Weapon in the front (right) hand. pose: 'idle' | 'raise' | 'strike' */
function drawWeapon(g, role, pose) {
  const blade = (x0, y0, x1, y1) => { line(g, x0, y0, x1, y1, 'w'); line(g, x0 + 1, y0, x1 + 1, y1, 'W'); line(g, x0 + 2, y0, x1 + 2, y1, 'L'); };
  const laptop = (x, y) => { rect(g, x, y, 14, 11, 'W'); rect(g, x + 1, y + 1, 12, 7, 'L'); rect(g, x + 2, y + 2, 10, 5, 'w'); for (const yy of [y + 3, y + 5]) rect(g, x + 3, yy, 6, 1, 'L'); rect(g, x + 1, y + 9, 12, 1, 'O'); px(g, x + 7, y + 10, 'L'); };
  const shield = (cx, cy) => { ellipse(g, cx, cy, 6.5, 10.5, 'A'); ellipse(g, cx, cy, 5, 9, 'a'); rect(g, cx - 1, cy - 6, 3, 12, 'L'); rect(g, cx - 4, cy - 1, 9, 3, 'L'); for (const [dx, dy] of [[-4, -7], [4, -7], [-4, 7], [4, 7]]) px(g, cx + dx, cy + dy, 'L'); };
  const kit = (x, y) => { rect(g, x, y, 13, 11, 'L'); rect(g, x + 5, y + 2, 3, 7, 'W'); rect(g, x + 3, y + 4, 7, 3, 'W'); rect(g, x + 4, y - 2, 5, 2, 'O'); rect(g, x, y + 10, 13, 1, 'G'); };
  if (pose === 'strike') {
    switch (role) {
      case 'melee': rect(g, 52, 25, 11, 3, 'W'); rect(g, 52, 25, 11, 1, 'L'); rect(g, 52, 27, 11, 1, 'w'); px(g, 63, 26, 'L'); rect(g, 50, 23, 2, 7, 'A'); break;
      case 'ranged': laptop(50, 21); break;
      case 'tank': shield(55, 28); break;
      case 'healer': kit(50, 22); break;
    }
    return;
  }
  const up = pose === 'raise';
  switch (role) {
    case 'melee':
      if (up) { blade(47, 17, 60, 2); rect(g, 43, 18, 7, 2, 'A'); px(g, 61, 1, 'L'); }
      else { blade(43, 38, 56, 20); rect(g, 40, 37, 8, 2, 'A'); px(g, 57, 19, 'L'); }
      break;
    case 'ranged': laptop(40, up ? 10 : 35); break;
    case 'tank': shield(46, up ? 18 : 38); break;
    case 'healer': kit(40, up ? 8 : 35); break;
  }
}

/**
 * One 64x64 hero frame: 3/4 view facing right, 5 heads tall, three-tone shading, outlined.
 * look: { hair, acc, acc2?, skin? }  pose: 'idle'|'walk'|'raise'|'strike'
 */
function heroFrame(def, pose) {
  const g = blank();
  const look = def.look ?? {};
  const walk = pose === 'walk';
  // legs (back leg shaded, crease + highlight on the front leg) + shoes with a toe to the right
  const bl = walk ? 21 : 24, fl = walk ? 34 : 31;
  rect(g, bl, 43, 6, 16, 'p'); rect(g, fl, 43, 6, 16, 'P'); rect(g, fl, 43, 1, 16, 'p'); rect(g, fl + 5, 44, 1, 14, 'c');
  rect(g, bl - 1, 59, 7, 4, 'O'); rect(g, fl, 59, 9, 4, 'O'); rect(g, fl + 1, 60, 7, 1, 'G'); rect(g, bl, 60, 5, 1, 'G');
  // torso: shade on the back, highlight strip on the front, V collar, buttons, belt with buckle
  rect(g, 22, 21, 17, 21, 'B'); rect(g, 22, 21, 4, 21, 'b'); rect(g, 36, 22, 2, 19, 'c');
  for (let i = 0; i < 4; i++) { px(g, 28 + i, 21 + i, 'L'); px(g, 32 - i, 21 + i, 'L'); }
  const covered = [look.acc, look.acc2].some((a) => ['tie', 'lanyard', 'scarf'].includes(a));
  if (!covered) for (const y of [27, 32, 37]) px(g, 30, y, 'O');
  rect(g, 22, 41, 17, 2, 'O'); rect(g, 29, 41, 3, 2, 'A'); px(g, 30, 41, 'L');
  // neck
  rect(g, 27, 18, 6, 4, 's');
  // back arm: sleeve, cuff, hand
  rect(g, 18, 22, 4, 15, 'b'); rect(g, 18, 36, 4, 1, 'L'); rect(g, 18, 37, 4, 5, 's');
  // front arm (pose dependent)
  if (pose === 'strike') { rect(g, 38, 24, 10, 6, 'B'); rect(g, 47, 24, 1, 6, 'L'); rect(g, 48, 24, 4, 5, 'S'); }
  else if (pose === 'raise') { rect(g, 38, 18, 7, 7, 'B'); rect(g, 44, 18, 1, 7, 'L'); rect(g, 44, 16, 4, 5, 'S'); }
  else { rect(g, 38, 22, 5, 15, 'B'); rect(g, 42, 22, 1, 15, 'c'); rect(g, 38, 36, 5, 1, 'L'); rect(g, 39, 37, 4, 5, 'S'); }
  // head: skin, shade on the back and under the chin, ear
  ellipse(g, HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 'S');
  tint(g, 22, 5, 4, 15, 'S', 's'); tint(g, 26, 17, 9, 2, 'S', 's');
  rect(g, 37, 12, 2, 3, 'S'); px(g, 37, 13, 's');
  drawHair(g, look.hair ?? 'short');
  // face turned right: far eye narrow, near eye wide, highlights, brows, nose, mouth, cheeks
  rect(g, 27, 11, 2, 3, 'E'); rect(g, 32, 11, 3, 3, 'E'); px(g, 27, 11, 'L'); px(g, 32, 11, 'L');
  rect(g, 27, 9, 2, 1, 'h'); rect(g, 32, 9, 3, 1, 'h');
  px(g, 36, 14, 's'); px(g, 36, 15, 's');
  rect(g, 33, 17, 3, 1, 'O'); px(g, 36, 16, 'O');
  px(g, 26, 15, 'K'); rect(g, 34, 15, 2, 1, 'K');
  drawAccessory(g, look.acc);
  drawAccessory(g, look.acc2);
  drawWeapon(g, def.role, walk ? 'idle' : pose);
  return outline(g);
}

// ---------------------------------------------------------------- monsters --
// Palette keys: M main · D dark shade · l light tint · L white · E eye · O outline · K cheek · Y gold (elite crown) · G grey
const MONSTER_DEFAULT = { L: '#ffffff', K: '#ffb0b0', O: '#1e1e1e', Y: '#f1c40f' };

/** Eyes/mouth at 64px, looking LEFT toward the heroes. */
function drawFace(g, face, cx, cy) {
  const eye = (x, y, w, h) => { rect(g, x, y, w, h, 'L'); rect(g, x + 1, y + 2, 3, 4, 'E'); px(g, x + 1, y + 2, 'L'); };
  switch (face.eyes) {
    case 'angry': eye(cx - 11, cy - 6, 6, 7); eye(cx + 1, cy - 6, 6, 7); line(g, cx - 12, cy - 9, cx - 5, cy - 7, 'O'); line(g, cx, cy - 7, cx + 7, cy - 9, 'O'); rect(g, cx - 11, cy - 6, 6, 1, 'O'); rect(g, cx + 1, cy - 6, 6, 1, 'O'); break;
    case 'dot': rect(g, cx - 9, cy - 4, 3, 4, 'E'); rect(g, cx + 3, cy - 4, 3, 4, 'E'); px(g, cx - 9, cy - 4, 'L'); px(g, cx + 3, cy - 4, 'L'); break;
    case 'one': ellipse(g, cx - 2, cy - 3, 8, 7, 'L'); ellipse(g, cx - 4, cy - 3, 3.5, 4, 'E'); rect(g, cx - 5, cy - 5, 2, 2, 'L'); break;
    case 'sleepy': rect(g, cx - 11, cy - 3, 6, 3, 'L'); rect(g, cx + 1, cy - 3, 6, 3, 'L'); rect(g, cx - 10, cy - 2, 3, 2, 'E'); rect(g, cx + 2, cy - 2, 3, 2, 'E'); rect(g, cx - 11, cy - 4, 6, 1, 'O'); rect(g, cx + 1, cy - 4, 6, 1, 'O'); break;
    default: eye(cx - 11, cy - 7, 6, 8); eye(cx + 1, cy - 7, 6, 8);
  }
  rect(g, cx - 14, cy + 2, 3, 2, 'K'); rect(g, cx + 8, cy + 2, 3, 2, 'K');
  switch (face.mouth) {
    case 'teeth': rect(g, cx - 8, cy + 5, 14, 4, 'O'); for (let i = 0; i < 5; i++) rect(g, cx - 7 + i * 3, cy + 5, 2, 2, 'L'); break;
    case 'smile': line(g, cx - 7, cy + 5, cx - 4, cy + 8, 'O', 2); rect(g, cx - 3, cy + 8, 6, 2, 'O'); line(g, cx + 3, cy + 8, cx + 6, cy + 5, 'O', 2); break;
    case 'zigzag': for (let i = 0; i < 14; i++) rect(g, cx - 7 + i, cy + 5 + (i % 2), 1, 2, 'O'); break;
    case 'o': ellipse(g, cx - 1, cy + 7, 3, 2.5, 'O'); ellipse(g, cx - 1, cy + 7, 1.5, 1, 'D'); break;
    default: rect(g, cx - 6, cy + 6, 10, 2, 'O');
  }
}

// Each shape draws itself on the 64x64 grid and returns the face anchor [cx, cy].
const SHAPES = {
  blob(g) { ellipse(g, 32, 38, 24, 19, 'M'); ellipse(g, 32, 46, 20, 11, 'D', (x, y) => y > 49); ellipse(g, 20, 26, 6, 3.5, 'l'); ellipse(g, 18, 25, 3, 1.5, 'L'); return [32, 35]; },
  cube(g) { rect(g, 12, 18, 40, 36, 'M'); rect(g, 15, 13, 37, 5, 'l'); rect(g, 47, 18, 5, 36, 'D'); rect(g, 12, 49, 35, 5, 'D'); rect(g, 17, 14, 8, 2, 'L'); return [30, 35]; },
  diamond(g) { for (let y = 6; y < 58; y++) for (let x = 6; x < 58; x++) { const d = Math.abs(x - 32) + Math.abs(y - 32); if (d <= 24) px(g, x, y, y > 34 && d > 18 ? 'D' : x < 24 && y < 30 ? 'l' : 'M'); } line(g, 24, 16, 32, 8, 'L', 2); return [32, 32]; },
  spike(g) { for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; line(g, 32, 34, Math.round(32 + Math.cos(t) * 28), Math.round(34 + Math.sin(t) * 28), 'D', 2); } ellipse(g, 32, 34, 19, 19, 'M'); ellipse(g, 32, 40, 15, 11, 'D', (x, y) => y > 44); ellipse(g, 24, 24, 5, 3.5, 'l'); return [32, 34]; },
  ghost(g) { ellipse(g, 32, 28, 22, 20, 'M'); rect(g, 10, 28, 44, 24, 'M'); rect(g, 10, 44, 44, 8, 'D'); for (let x = 10; x < 54; x += 8) rect(g, x, 52, 4, 5, 'D'); ellipse(g, 20, 18, 6, 3.5, 'l'); return [32, 30]; },
  sheet(g) { rect(g, 16, 6, 32, 52, 'L'); for (let i = 0; i < 10; i++) rect(g, 48 - i, 6 + i, i + 1, 1, '.'); for (let i = 0; i <= 10; i++) line(g, 38, 6 + i, 38 + i, 6 + i, 'M'); rect(g, 16, 54, 32, 4, 'l'); for (const y of [40, 46, 52]) rect(g, 20, y, y === 46 ? 16 : 24, 2, 'M'); rect(g, 16, 6, 3, 52, 'l'); return [32, 24]; },
  chart(g) { rect(g, 10, 32, 12, 26, 'M'); rect(g, 26, 12, 12, 46, 'M'); rect(g, 42, 40, 12, 18, 'M'); for (const [x, y] of [[10, 32], [26, 12], [42, 40]]) { rect(g, x, y, 12, 2, 'l'); rect(g, x + 9, y, 3, 58 - y, 'D'); } rect(g, 8, 58, 48, 3, 'O'); return [32, 24]; },
  hourglass(g) { for (let y = 6; y < 58; y++) { const w = Math.abs(y - 32) * 0.8 + 2; rect(g, Math.round(32 - w), y, Math.round(w * 2), 1, y > 32 ? 'D' : 'M'); } for (let y = 40; y < 56; y++) { const w = (y - 36) * 0.6; rect(g, Math.round(32 - w), y, Math.round(w * 2), 1, 'l'); } rect(g, 12, 4, 40, 4, 'O'); rect(g, 12, 56, 40, 4, 'O'); rect(g, 14, 5, 36, 1, 'G'); return [32, 44]; },
  lock(g) { rect(g, 14, 28, 36, 28, 'M'); rect(g, 14, 50, 36, 6, 'D'); rect(g, 45, 28, 5, 28, 'D'); rect(g, 16, 30, 4, 22, 'l'); for (let y = 12; y < 30; y++) for (let x = 18; x < 46; x++) { const d = Math.hypot(x - 31.5, y - 24); if (d <= 14 && d >= 9 && y < 28) px(g, x, y, y < 18 ? 'l' : 'D'); } return [32, 40]; },
  bug(g) { ellipse(g, 32, 38, 18, 15, 'M'); ellipse(g, 32, 24, 11, 9, 'M'); ellipse(g, 32, 44, 14, 8, 'D', (x, y) => y > 46); rect(g, 31, 30, 3, 20, 'D'); for (const [x0, y0, x1, y1] of [[16, 32, 6, 24], [14, 40, 4, 42], [16, 48, 8, 58], [48, 32, 58, 24], [50, 40, 60, 42], [48, 48, 56, 58]]) line(g, x0, y0, x1, y1, 'D', 2); line(g, 26, 16, 20, 8, 'D', 2); line(g, 38, 16, 44, 8, 'D', 2); ellipse(g, 20, 8, 2.5, 2.5, 'D'); ellipse(g, 44, 8, 2.5, 2.5, 'D'); ellipse(g, 24, 32, 4, 2.5, 'l'); return [32, 24]; },
  cloud(g) { ellipse(g, 22, 36, 14, 12, 'M'); ellipse(g, 40, 36, 16, 14, 'M'); ellipse(g, 30, 26, 14, 12, 'M'); rect(g, 12, 40, 42, 8, 'M'); rect(g, 12, 44, 42, 4, 'D'); ellipse(g, 26, 20, 5, 3, 'l'); ellipse(g, 24, 19, 2.5, 1.5, 'L'); return [32, 36]; },
  cursor(g) { for (let y = 6; y < 48; y++) rect(g, 16, y, Math.min(28, Math.round((y - 6) * 0.75) + 2), 1, 'M'); rect(g, 28, 40, 8, 18, 'D'); rect(g, 17, 8, 3, 30, 'l'); rect(g, 30, 41, 2, 14, 'l'); return [28, 26]; },
};
export const MONSTER_SHAPES = Object.keys(SHAPES);

function monsterFrame(def, frame) {
  const g = blank();
  const draw = SHAPES[def.shape] ?? SHAPES.blob;
  const [cx, cy] = draw(g);
  drawFace(g, def.face ?? {}, cx, cy);
  if (def.elite) { rect(g, cx - 10, 2, 20, 4, 'Y'); for (const x of [cx - 10, cx - 2, cx + 6]) rect(g, x, 0, 4, 2, 'Y'); for (const x of [cx - 7, cx - 1, cx + 5]) px(g, x, 3, 'L'); rect(g, cx - 10, 5, 20, 1, 'D'); }
  const out = outline(g);
  return frame ? shiftDown(out, 2) : out;
}

/** 96x64 "긴급 티켓" boss. */
function bossFrame(def, frame) {
  const g = blank(96, 64);
  rect(g, 4, 8, 88, 48, 'M');
  for (const [x, y] of [[4, 8], [91, 8], [4, 55], [91, 55], [5, 8], [90, 8], [5, 55], [90, 55], [4, 9], [91, 9], [4, 54], [91, 54]]) px(g, x, y, '.');
  rect(g, 4, 50, 88, 6, 'D'); rect(g, 6, 10, 84, 3, 'l');
  rect(g, 66, 8, 4, 48, 'D'); for (let y = 9; y < 56; y += 4) rect(g, 66, y, 4, 2, 'M');
  for (const y of [20, 28, 36]) rect(g, 72, y, 16, 4, 'L'); rect(g, 72, 44, 10, 4, 'L');
  rect(g, 12, 44, 48, 4, 'L');
  // big angry face looking left
  rect(g, 16, 18, 10, 6, 'L'); rect(g, 38, 18, 10, 6, 'L'); rect(g, 17, 20, 5, 4, 'E'); rect(g, 39, 20, 5, 4, 'E'); px(g, 17, 20, 'L'); px(g, 39, 20, 'L');
  line(g, 14, 15, 26, 18, 'O', 2); line(g, 37, 18, 49, 15, 'O', 2);
  rect(g, 20, 30, 24, 6, 'O'); for (let i = 0; i < 6; i++) rect(g, 21 + i * 4, 30, 2, 3, 'L');
  rect(g, 10, 26, 4, 2, 'K'); rect(g, 50, 26, 4, 2, 'K');
  rect(g, 56, 14, 4, 14, 'L'); rect(g, 56, 31, 4, 4, 'L');   // "!" stamp
  const out = outline(g);
  return frame ? shiftDown(out, 2) : out;
}

// ------------------------------------------------------------------- render --
const cache = new Map();
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
    ctx.fillStyle = palette[ch] ?? '#ff00ff';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  cache.set(key, c);
  return c;
}
const heroPalette = (def) => {
  const p = { ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...(def.look?.skin ? { S: def.look.skin } : {}), ...def.palette };
  return { ...p, s: darken(p.S, 0.86), h: darken(p.H, 0.7), i: lighten(p.H, 0.38), b: darken(p.B, 0.72), c: lighten(p.B, 0.22), p: darken(p.P, 0.72), w: darken(p.W, 0.7), a: darken(p.A, 0.7) };
};
const monsterPalette = (mon) => { const p = { ...MONSTER_DEFAULT, ...mon.palette }; return { ...p, l: lighten(p.M, 0.35), G: '#3d4147', D: p.D ?? darken(p.M) }; };

/**
 * @param def   hero/job definition (data/heroes.js)
 * @param anim  'idle' | 'walk' | 'attack'
 * @param frame 0 | 1
 */
export function heroSprite(def, anim = 'idle', frame = 0, scale = 1) {
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
  const g = mon.shape === 'ticket' ? bossFrame(mon, frame) : monsterFrame(mon, frame);
  return render(key, g, monsterPalette(mon), 1);
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
    ctx.fillStyle = pal[ch]; ctx.fillRect(x - 19, y, 1, 1);
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
export function portraitCanvas(def, scale = 2) {
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
