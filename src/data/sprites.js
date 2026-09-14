// Procedural 32x32 pixel sprites rendered at 2x (= 64px on screen) + card illustrations.
// Everything is generated from primitives so every hero has its own look (hair, accessory,
// weapon) and monsters have distinct shapes, faces and phase palettes. Results are cached.
import { GRADES } from './heroes.js';

export const SCALE = 2;
export const SRC = 32;               // template size
export const SPRITE = SRC * SCALE;   // 64px on screen

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
const shiftDown = (g, dy) => [...blank(g[0].length, dy), ...g.slice(0, g.length - dy)];

// ------------------------------------------------------------------ heroes --
// Palette keys: S skin, H hair, B shirt, P pants, W weapon, A accent/accessory, E eye, L light, K cheek, O outline, G glasses
const DEFAULT_HERO_PAL = { S: '#f6d5b5', E: '#1b1b1b', L: '#ffffff', K: '#ffb0b0', O: '#23262b', G: '#2d3436', A: '#c0392b' };
const ROLE_ACCENT = { tank: '#95a5a6', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };

function drawHair(g, style) {
  const cap = (pred) => ellipse(g, 16, 8, 8.6, 5.2, 'H', pred);
  switch (style) {
    case 'bald': px(g, 13, 6, 'L'); px(g, 14, 6, 'L'); break;
    case 'long': cap((x, y) => y <= 10); rect(g, 7, 9, 3, 10, 'H'); rect(g, 22, 9, 3, 10, 'H'); break;
    case 'bun': cap((x, y) => y <= 9); ellipse(g, 16, 3, 3, 2.4, 'H'); break;
    case 'spiky': cap((x, y) => y <= 9); for (const [x, y] of [[10, 4], [13, 2], [16, 1], [19, 2], [22, 4]]) line(g, x, y, x, 6, 'H'); break;
    case 'side': cap((x, y) => y <= 9 && !(x > 18 && y > 7)); rect(g, 8, 9, 5, 2, 'H'); break;
    case 'curly': cap((x, y) => y <= 10); for (const [x, y] of [[8, 6], [24, 6], [10, 3], [22, 3], [16, 1]]) ellipse(g, x, y, 1.6, 1.6, 'H'); break;
    case 'bob': cap((x, y) => y <= 10); rect(g, 7, 9, 3, 6, 'H'); rect(g, 22, 9, 3, 6, 'H'); break;
    case 'grey': cap((x, y) => y <= 9); px(g, 12, 5, 'L'); px(g, 19, 6, 'L'); break;
    default: cap((x, y) => y <= 9); // short
  }
}

function drawAccessory(g, acc) {
  switch (acc) {
    case 'glasses': rect(g, 11, 10, 4, 1, 'G'); rect(g, 17, 10, 4, 1, 'G'); rect(g, 11, 14, 4, 1, 'G'); rect(g, 17, 14, 4, 1, 'G'); rect(g, 10, 11, 1, 3, 'G'); rect(g, 14, 11, 1, 3, 'G'); rect(g, 17, 11, 1, 3, 'G'); rect(g, 21, 11, 1, 3, 'G'); rect(g, 15, 12, 2, 1, 'G'); break;
    case 'sunglasses': rect(g, 10, 11, 5, 3, 'G'); rect(g, 17, 11, 5, 3, 'G'); rect(g, 15, 12, 2, 1, 'G'); px(g, 11, 12, 'L'); px(g, 18, 12, 'L'); break;
    case 'beard': rect(g, 12, 16, 8, 2, 'H'); rect(g, 13, 18, 6, 1, 'H'); break;
    case 'mustache': rect(g, 13, 15, 6, 1, 'H'); break;
    case 'tie': rect(g, 15, 19, 2, 5, 'A'); rect(g, 14, 19, 4, 1, 'A'); break;
    case 'badge': rect(g, 12, 20, 3, 3, 'A'); px(g, 13, 21, 'L'); break;
    case 'headset': rect(g, 7, 10, 2, 4, 'A'); rect(g, 23, 10, 2, 4, 'A'); line(g, 8, 9, 12, 4, 'A'); line(g, 12, 4, 20, 4, 'A'); line(g, 20, 4, 24, 9, 'A'); rect(g, 8, 14, 3, 1, 'A'); px(g, 11, 15, 'A'); break;
    case 'hardhat': ellipse(g, 16, 6, 9.5, 4.5, 'A', (x, y) => y <= 7); rect(g, 6, 8, 20, 2, 'A'); px(g, 15, 3, 'L'); px(g, 16, 3, 'L'); break;
    case 'crown': rect(g, 11, 4, 10, 2, 'A'); for (const x of [11, 15, 19]) rect(g, x, 1, 2, 3, 'A'); px(g, 15, 2, 'L'); break;
    case 'coffee': rect(g, 5, 22, 4, 4, 'A'); rect(g, 5, 21, 4, 1, 'L'); px(g, 9, 23, 'A'); px(g, 9, 24, 'A'); break;
    case 'clipboard': rect(g, 4, 19, 5, 7, 'L'); rect(g, 5, 18, 3, 1, 'A'); rect(g, 5, 21, 3, 1, 'A'); rect(g, 5, 23, 3, 1, 'A'); break;
    case 'earring': px(g, 8, 14, 'A'); px(g, 24, 14, 'A'); break;
    case 'flower': ellipse(g, 23, 6, 2, 2, 'A'); px(g, 23, 6, 'L'); break;
    case 'scarf': rect(g, 11, 17, 10, 2, 'A'); rect(g, 20, 19, 2, 4, 'A'); break;
    case 'lanyard': line(g, 13, 18, 15, 23, 'A'); line(g, 19, 18, 17, 23, 'A'); rect(g, 15, 23, 3, 3, 'L'); break;
    default: break;
  }
}

/** Weapon in the right hand (x≈22..25). pose: 'idle' | 'raise' | 'strike' */
function drawWeapon(g, role, pose) {
  if (pose === 'strike') {
    // horizontal reach to the right
    switch (role) {
      case 'melee': rect(g, 25, 19, 7, 2, 'W'); rect(g, 24, 18, 1, 4, 'A'); break;
      case 'ranged': rect(g, 25, 17, 6, 5, 'W'); rect(g, 26, 18, 4, 3, 'L'); break;
      case 'tank': ellipse(g, 27, 20, 3, 5, 'A'); px(g, 27, 20, 'L'); break;
      case 'healer': rect(g, 26, 17, 5, 5, 'L'); rect(g, 28, 18, 1, 3, 'W'); rect(g, 27, 19, 3, 1, 'W'); break;
    }
    return;
  }
  const raised = pose === 'raise';
  switch (role) {
    case 'melee': rect(g, 24, raised ? 5 : 14, 2, raised ? 15 : 13, 'W'); rect(g, 23, raised ? 19 : 26, 4, 1, 'A'); break;
    case 'ranged': rect(g, 22, raised ? 13 : 21, 6, 5, 'W'); rect(g, 23, raised ? 14 : 22, 4, 3, 'L'); break;
    case 'tank': ellipse(g, 24, raised ? 16 : 22, 3, 5, 'A'); px(g, 24, raised ? 16 : 22, 'L'); break;
    case 'healer': rect(g, 22, raised ? 12 : 20, 5, 5, 'L'); rect(g, 24, raised ? 13 : 21, 1, 3, 'W'); rect(g, 23, raised ? 14 : 22, 3, 1, 'W'); break;
  }
}

/**
 * Build one 32x32 hero frame.
 * look: { hair, acc, acc2?, skin? }  pose: 'idle'|'walk'|'raise'|'strike'
 */
function heroFrame(def, pose) {
  const g = blank();
  const look = def.look ?? {};
  // legs & shoes
  const apart = pose === 'walk';
  rect(g, apart ? 10 : 12, 27, 3, 4, 'P'); rect(g, apart ? 19 : 17, 27, 3, 4, 'P');
  rect(g, apart ? 9 : 11, 31, 4, 1, 'O'); rect(g, apart ? 19 : 17, 31, 4, 1, 'O');
  // torso + collar
  rect(g, 11, 18, 10, 9, 'B'); rect(g, 15, 18, 2, 1, 'L');
  // arms
  rect(g, 8, 19, 3, 6, 'B'); rect(g, 8, 25, 3, 2, 'S');                     // left arm
  if (pose === 'strike') { rect(g, 21, 19, 5, 3, 'B'); rect(g, 26, 19, 2, 2, 'S'); }
  else if (pose === 'raise') { rect(g, 21, 13, 3, 6, 'B'); rect(g, 21, 11, 3, 2, 'S'); }
  else { rect(g, 21, 19, 3, 6, 'B'); rect(g, 21, 25, 3, 2, 'S'); }
  // head
  ellipse(g, 16, 11, 8, 7, 'S');
  drawHair(g, look.hair ?? 'short');
  // face
  rect(g, 12, 11, 2, 3, 'E'); rect(g, 18, 11, 2, 3, 'E'); px(g, 12, 11, 'L'); px(g, 18, 11, 'L');
  rect(g, 10, 14, 2, 1, 'K'); rect(g, 20, 14, 2, 1, 'K');
  rect(g, 15, 16, 2, 1, 'O');
  drawAccessory(g, look.acc);
  drawAccessory(g, look.acc2);
  drawWeapon(g, def.role, pose === 'walk' ? 'idle' : pose);
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
  const g = blank();
  const draw = SHAPES[def.shape] ?? SHAPES.blob;
  const [cx, cy] = draw(g);
  drawFace(g, def.face ?? {}, cx, cy);
  if (def.elite) { rect(g, cx - 5, 1, 10, 2, 'Y'); for (const x of [cx - 5, cx - 1, cx + 3]) rect(g, x, -1, 2, 2, 'Y'); rect(g, cx - 5, 0, 10, 1, 'Y'); px(g, cx, 1, 'L'); }
  const out = outline(g);
  return frame ? shiftDown(out, 1) : out;
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
  const out = outline(g);
  return frame ? shiftDown(out, 1) : out;
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
const heroPalette = (def) => ({ ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...(def.look?.skin ? { S: def.look.skin } : {}), ...def.palette });

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
  return render(key, g, pal);
}

/** Small head icon (data URL) for tables. */
export function heroIconDataURL(def) {
  const key = `icon:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 20; c.height = 20;
  const ctx = c.getContext('2d');
  const pal = heroPalette(def);
  const g = heroFrame(def, 'idle');
  for (let y = 0; y < 20; y++) for (let x = 6; x < 26; x++) {
    const ch = g[y][x]; if (ch === '.') continue;
    ctx.fillStyle = pal[ch]; ctx.fillRect(x - 6, y, 1, 1);
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
  const img = heroSprite(def, 'idle', 0, 3); // 96px
  if (!owned) ctx.globalAlpha = 0.35;
  ctx.drawImage(img, (CARD_W - 96) / 2, 12);
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
export function portraitCanvas(def, scale = 4) {
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
