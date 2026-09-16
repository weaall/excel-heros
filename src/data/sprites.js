// Hand-pixelled sprites: 32x32 templates shown at 2x (64px on screen), plus card illustrations.
// Heroes are composed from hand-drawn pixel maps (body poses, hair styles, accessories, props,
// weapons) recoloured per character; every pixel was placed deliberately rather than generated
// from primitives. Monsters use shaded shapes with hand-drawn faces. Soft per-colour outlines.
import { GRADES } from './heroes.js';
import { sheetFrame } from './spriteSheets.js';
import { MONSTER_MAPS, MONSTER_ACCENTS } from './monsterArt.js';
import { BODY_IDLE, LEGS, ARM, HAIR } from './heroArt.js';
import { packHeroFrame, packHeroIcon, packMonsterFrame } from './packSprites.js';
import { cardArt, cardCrop, drawArtCover, drawArtContain } from './cardArt.js';

export const SCALE = 2;
export const SRC = 32;
export const SPRITE = SRC * SCALE;

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
  for (let i = 0; i <= n; i++) { const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n); for (let t = 0; t < thick; t++) px(g, x + t, y, ch); }
};
/** Stamp a string map (rows of palette chars, '.' transparent) at (x0,y0). */
const stamp = (g, rows, x0 = 0, y0 = 0) => { rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') px(g, x0 + i, y0 + j, row[i]); }); };
const clear = (g, x, y, w, h) => rect(g, x, y, w, h, '.');
/** Soft outline: edge pixels become a dark version of the neighbouring colour. */
function outline(g) {
  const h = g.length, w = g[0].length, out = g.map((r) => r.slice());
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (g[y][x] !== '.') continue;
    const n = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => g[y + dy]?.[x + dx]).find((c) => c && c !== '.' && !c.startsWith('O:'));
    if (n) out[y][x] = 'O:' + n[0];
  }
  return out;
}
const shiftDown = (g, dy) => [...blank(g[0].length, dy), ...g.slice(0, g.length - dy)];
function shadeEllipse(g, key, cx, cy, rx, ry, tones, opts = {}) {
  const { lx = 0.45, ly = -0.8, roundness = 0.4 } = opts;
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
    if (g[y]?.[x] !== key) continue;
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const v = lx * nx + ly * ny + roundness * (1 - Math.min(1, nx * nx + ny * ny));
    g[y][x] = v > 0.55 ? tones[3] : v > 0.15 ? tones[2] : v > -0.4 ? key : tones[0];
  }
}

const hexMul = (hex, f) => { const n = parseInt(hex.slice(1), 16); if (Number.isNaN(n)) return hex; const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0'); return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`; };
const darken = (hex, f = 0.72) => hexMul(hex, f);
const lighten = (hex, t = 0.3) => { const n = parseInt(hex.slice(1), 16); if (Number.isNaN(n)) return hex; const c = (v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0'); return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`; };

// ------------------------------------------------------------------ heroes --
// Keys: S skin · s shade · t light | H hair · h shade · i light | B shirt · b shade · c light | P pants · p shade
//       W weapon · w shade · A accent · a shade | E black · L white · I iris · K cheek · G light grey · g grey · O black (shoes)
const DEFAULT_HERO_PAL = { S: '#f3cfae', E: '#1b1b1b', L: '#ffffff', I: '#3b6fe0', K: '#f19a9a', G: '#b2bec3', g: '#6c7a89', O: '#2b2330', A: '#c0392b' };
const ROLE_ACCENT = { tank: '#8fa3ad', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };

// Hero composition: hand-pixelled base from heroArt.js (two-head chibi facing right, bar eyes),
// plus hair/accessory/prop/weapon stamps. Anchors: eyes y12-13 · face x10..23 · body x9..20 y19..26
// · back hand (9,22) · front hand (20,22) · raise hand (23,10) · strike hand (27,20).
function drawHairStyle(g, style) {
  if (style === 'bald') {
    for (let y = 2; y <= 17; y++) for (let x = 0; x < 32; x++) { if (g[y][x] === 'H') g[y][x] = 'S'; else if (g[y][x] === 'h') g[y][x] = 's'; }
    px(g, 13, 4, 't'); px(g, 14, 4, 't'); px(g, 15, 3, 't'); return;
  }
  const h = HAIR[style]; if (h) stamp(g, h.rows, h.x, h.y);
  if (style === 'grey') { px(g, 11, 5, 'i'); px(g, 12, 4, 'i'); px(g, 17, 3, 'i'); px(g, 18, 4, 'i'); }
  else if (style !== 'cap') { px(g, 12, 4, 'i'); px(g, 13, 3, 'i'); px(g, 14, 3, 'i'); }
  if (style === 'cap') rect(g, 10, 6, 4, 3, 'h');
}

function drawAccessory(g, acc, bx = 9, by = 22) {
  switch (acc) {
    // face / head
    case 'glasses': stamp(g, ['GGGGG.GGGGGGG', 'G...G.G.....G', 'G...GGG.....G', 'GGGGG.GGGGGGG'], 10, 11); break;
    case 'sunglasses': stamp(g, ['gggggEggggggg', 'gLgggEgLggggg'], 10, 12); break;
    case 'beard': stamp(g, ['HHHHHHHHHH', '.HHHHHHHH.', '..HHHHHH..'], 11, 16); break;
    case 'mustache': stamp(g, ['HHHHHH'], 15, 15); break;
    case 'headset': stamp(g, ['AA', 'AL', 'AA'], 23, 12); line(g, 23, 11, 16, 3, 'A'); line(g, 16, 3, 8, 7, 'A'); px(g, 24, 15, 'A'); px(g, 25, 16, 'A'); px(g, 25, 17, 'g'); break;
    case 'hardhat': stamp(g, ['......AAAAAAAAAA......', '....AAAAAAAAAAAAAA....', '...AAAAAAaAAAAAAAAA...', '..AAAAAAAAAAAAAAAAAA..', '.AAAAAAAAAAAAAAAAAAAA.', 'aaaaaaaaaaaaaaaaaaaaaa'], 4, 0); break;
    case 'crown': stamp(g, ['A..A..A..A..A', 'AALAALAALAALA', 'AAAAAAAAAAAAA'], 9, 0); break;
    case 'earring': px(g, 23, 15, 'A'); px(g, 23, 16, 'L'); break;
    case 'flower': stamp(g, ['.A.', 'ALA', '.A.'], 5, 4); break;
    case 'pen': stamp(g, ['AAAL'], 22, 9); break;
    // torso
    case 'tie': stamp(g, ['.A.', '.A.', 'AAA', 'ALA', 'AAA', '.a.'], 14, 19); break;
    case 'badge': stamp(g, ['AL', 'aa'], 11, 20); break;
    case 'scarf': stamp(g, ['AAAAAAAAAAAA', 'aAAAaAAAaAAa'], 9, 18); stamp(g, ['AA', 'aA', 'AA', 'aA'], 8, 20); break;
    case 'lanyard': stamp(g, ['A...A', '.A.A.', '..A..'], 13, 19); stamp(g, ['LLL', 'LAL', 'LLL'], 14, 21); break;
    case 'apron': stamp(g, ['.L.L.', 'LLLLL', 'LLLLL', 'LLLLL', 'LgggL', 'LLLLL'], 13, 20); break;
    case 'suspenders': rect(g, 13, 19, 1, 7, 'a'); rect(g, 17, 19, 1, 7, 'a'); break;
    case 'hoodie': stamp(g, ['bbbbbbbbbbbb'], 9, 18); rect(g, 14, 20, 1, 4, 'L'); rect(g, 16, 20, 1, 4, 'L'); break;
    case 'watch': px(g, 21, 23, 'g'); px(g, 22, 23, 'L'); break;
    case 'radio': stamp(g, ['gg', 'gA', 'gg'], 19, 24); break;
    // back-hand props
    case 'coffee': stamp(g, ['LLLLL', 'AAAA.', 'AAAAA', 'AAAAA', 'aaaa.'], bx - 3, by - 4); px(g, bx - 2, by - 7, 'L'); px(g, bx - 1, by - 8, 'L'); px(g, bx - 1, by - 6, 'L'); break;
    case 'clipboard': stamp(g, ['.AAA.', 'LLLLL', 'LAAAL', 'LLLLL', 'LAAAL', 'LLLLL', 'LAA.L', 'LLLLL', 'ggggg'], bx - 5, by - 7); break;
    case 'calculator': stamp(g, ['gggg', 'gLLg', 'gggg', 'gLgL', 'gggg', 'gLgL', 'gggg', 'gLgL'], bx - 4, by - 6); break;
    case 'briefcase': stamp(g, ['..aa..', 'AAAAAA', 'AAAAAA', 'aaaLaa', 'AAAAAA', 'AAAAAA'], bx - 6, by - 4); break;
    case 'cane': stamp(g, ['AAA'], bx - 1, by); line(g, bx, by + 1, bx - 1, by + 8, 'W'); break;
    case 'files': stamp(g, ['AA...', 'LLLLL', 'LLLLL', 'LgggL', 'LLLLL', 'LgggL', 'LLLLL', 'LggLL', 'LLLLL'], bx - 5, by - 7); break;
    case 'phone': stamp(g, ['ggg', 'gLg', 'gLg', 'gLg', 'gLg', 'ggg'], bx - 2, by - 5); break;
    case 'magnifier': stamp(g, ['.gg.', 'gLLg', 'gLLg', '.gg.'], bx - 5, by - 6); line(g, bx - 1, by - 2, bx + 1, by, 'W'); break;
    case 'parcel': stamp(g, ['AAALAA', 'AAALAA', 'LLLLLL', 'AAALAA', 'AAALAA', 'aaaaaa'], bx - 6, by - 5); break;
    case 'ledger': stamp(g, ['aAAAA', 'aLLLL', 'aLggL', 'aLLLL', 'aLggL', 'aLLLL', 'aAAAA'], bx - 5, by - 6); break;
    default: break;
  }
}

/** Weapon at the front hand. (hx,hy) = top-left of the hand. */
function drawWeapon(g, role, pose, hx, hy) {
  switch (role) {
    case 'melee':
      if (pose === 'raise') { stamp(g, ['.L', 'WL', 'WL', 'WL', 'WL', 'WL', 'WL'], hx, hy - 7); stamp(g, ['AAAA'], hx - 1, hy - 1); }
      else if (pose === 'strike') { stamp(g, ['A', 'A', 'A', 'A'], hx + 1, hy - 1); stamp(g, ['LLLLLLLL', 'WWWWWWWL', 'wwwwwww.'], hx + 2, hy); }
      else { stamp(g, ['AAAA'], hx - 1, hy + 1); stamp(g, ['LW', '.LW', '..LW', '...LW', '....LW', '.....Lw'], hx + 2, hy + 2); }
      break;
    case 'ranged': { const [x, y] = pose === 'raise' ? [hx + 1, hy - 4] : pose === 'strike' ? [hx + 2, hy - 2] : [hx + 1, hy - 3]; stamp(g, ['WWWWWWW', 'WLLLLLW', 'WLwwwLW', 'WLLLLLW', 'WWWWWWW', 'gggggggg'], x, y); px(g, x + 3, y + 5, 'L'); break; }
    case 'tank': { const [x, y] = pose === 'raise' ? [hx + 1, hy - 4] : pose === 'strike' ? [hx + 2, hy - 3] : [hx + 1, hy - 4]; stamp(g, ['..WWWW..', '.WAAAAW.', 'WAAaAAAW', 'WAALAAAW', 'WAAAAAAW', 'WAAaAAAW', '.WAAAAW.', '..WWWW..'], x, y); break; }
    case 'healer': { const [x, y] = pose === 'raise' ? [hx + 1, hy - 4] : pose === 'strike' ? [hx + 2, hy - 2] : [hx + 1, hy - 3]; stamp(g, ['..gg..', 'LLLLLL', 'LLWWLL', 'LWWWWL', 'LLWWLL', 'LLLLLL', 'gggggg'], x, y); break; }
  }
}

/** Build one 32x32 hero frame. pose: idle | idle2 | walkA | walkB | raise | strike */
function heroFrame(def, pose) {
  const look = def.look ?? {};
  const g = blank();
  const tx = pose === 'strike' ? -3 : 0;
  stamp(g, BODY_IDLE, tx, 0);
  if (pose === 'walkA' || pose === 'walkB') { clear(g, 0, 27, 32, 4); stamp(g, LEGS[pose], tx, 27); }
  let hand = [20 + tx, 22];
  if (pose === 'raise') { clear(g, 20 + tx, 22, 1, 1); stamp(g, ARM.raise.rows, ARM.raise.x + tx, ARM.raise.y); hand = [23 + tx, 10]; }
  else if (pose === 'strike') { clear(g, 20 + tx, 22, 1, 1); stamp(g, ARM.strike.rows, ARM.strike.x + tx, ARM.strike.y); hand = [27 + tx, 20]; }
  const hy = pose === 'idle2' ? 1 : 0;
  if (hy) { const head = BODY_IDLE.slice(2, 18); clear(g, 0, 2, 32, 16); stamp(g, head, tx, 3); }
  // hair + head accessories move with the head; torso items stay
  const headLayer = blank(); drawHairStyle(headLayer, look.hair ?? 'short');
  const HEAD_ACCS = ['glasses', 'sunglasses', 'beard', 'mustache', 'headset', 'hardhat', 'crown', 'earring', 'flower', 'pen'];
  const bodyLayer = blank();
  for (const a of [look.acc, look.acc2, look.prop]) drawAccessory(HEAD_ACCS.includes(a) ? headLayer : bodyLayer, a, 9, 22);
  if ((look.hair ?? 'short') === 'bald') { for (let y = 2; y <= 17; y++) for (let x = 0; x < 32; x++) if (g[y + hy]?.[x + tx] === 'H') g[y + hy][x + tx] = 'S'; else if (g[y + hy]?.[x + tx] === 'h') g[y + hy][x + tx] = 's'; }
  stamp(g, headLayer.map((r) => r.join('')), tx, hy);
  stamp(g, bodyLayer.map((r) => r.join('')), tx, 0);
  drawWeapon(g, def.role, pose, hand[0], hand[1]);
  return outline(g);
}

// ---------------------------------------------------------------- monsters --
const MONSTER_DEFAULT = { L: '#ffffff', E: '#1e1e1e', K: '#ffb0b0', Y: '#f1c40f', G: '#4d5656' };

function drawFace(g, face, cx, cy) {
  const eye = (x, y) => { stamp(g, ['LLL', 'LEE', 'LEE', 'LLL'], x, y); px(g, x + 1, y + 1, 'L'); };
  switch (face.eyes) {
    case 'angry': eye(cx - 6, cy - 4); eye(cx, cy - 4); stamp(g, ['EE.', '.EE'], cx - 7, cy - 6); stamp(g, ['.EE', 'EE.'], cx + 1, cy - 6); break;
    case 'dot': stamp(g, ['LE', 'EE'], cx - 5, cy - 2); stamp(g, ['LE', 'EE'], cx + 1, cy - 2); break;
    case 'one': stamp(g, ['.LLLLLL.', 'LLEELLLL', 'LELEELLL', 'LLEELLLL', '.LLLLLL.'], cx - 5, cy - 4); break;
    case 'sleepy': stamp(g, ['EEE', 'LLL', 'EEL'], cx - 6, cy - 3); stamp(g, ['EEE', 'LLL', 'EEL'], cx, cy - 3); break;
    default: eye(cx - 6, cy - 4); eye(cx, cy - 4);
  }
  px(g, cx - 8, cy + 1, 'K'); px(g, cx - 7, cy + 1, 'K'); px(g, cx + 4, cy + 1, 'K'); px(g, cx + 5, cy + 1, 'K');
  switch (face.mouth) {
    case 'teeth': stamp(g, ['EEEEEEE', 'ELELELE', 'EEEEEEE'], cx - 4, cy + 2); break;
    case 'smile': stamp(g, ['E.....E', '.EEEEE.'], cx - 4, cy + 2); break;
    case 'zigzag': stamp(g, ['E.E.E.E', '.E.E.E.'], cx - 4, cy + 2); break;
    case 'o': stamp(g, ['.EE.', 'EDDE', '.EE.'], cx - 3, cy + 2); break;
    default: rect(g, cx - 3, cy + 3, 5, 1, 'E');
  }
}

const SHAPES = {
  blob(g) { ellipse(g, 16, 19, 12, 9.5, 'M'); shadeEllipse(g, 'M', 16, 19, 12, 9.5, ['D', 'D', 'l', 'l']); stamp(g, ['LL', 'L.'], 9, 12); return [16, 17]; },
  cube(g) { rect(g, 6, 9, 20, 18, 'M'); rect(g, 8, 7, 18, 2, 'l'); rect(g, 24, 9, 2, 18, 'D'); rect(g, 6, 24, 18, 3, 'D'); rect(g, 6, 9, 18, 2, 'l'); rect(g, 9, 7, 4, 1, 'L'); return [15, 17]; },
  diamond(g) { for (let y = 3; y < 29; y++) for (let x = 3; x < 29; x++) if (Math.abs(x - 16) + Math.abs(y - 16) <= 12) px(g, x, y, 'M'); shadeEllipse(g, 'M', 16, 16, 11, 11, ['D', 'D', 'l', 'l'], { roundness: 0.2 }); return [16, 16]; },
  spike(g) { for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; line(g, 16, 17, Math.round(16 + Math.cos(t) * 14), Math.round(17 + Math.sin(t) * 14), 'D'); } ellipse(g, 16, 17, 9.5, 9.5, 'M'); shadeEllipse(g, 'M', 16, 17, 9.5, 9.5, ['D', 'D', 'l', 'l']); stamp(g, ['LL', 'L.'], 11, 11); return [16, 17]; },
  ghost(g) { ellipse(g, 16, 14, 11, 10, 'M'); rect(g, 5, 14, 22, 12, 'M'); for (let x = 5; x < 27; x += 4) rect(g, x, 26, 2, 3, 'M'); shadeEllipse(g, 'M', 16, 17, 12, 13, ['D', 'D', 'l', 'l']); return [16, 15]; },
  sheet(g) { rect(g, 8, 3, 16, 26, 'L'); for (let i = 0; i < 5; i++) rect(g, 24 - i, 3 + i, i + 1, 1, '.'); for (let i = 0; i <= 5; i++) line(g, 19, 3 + i, 19 + i, 3 + i, 'M'); rect(g, 8, 27, 16, 2, 'l'); for (const y of [20, 23, 26]) rect(g, 10, y, y === 23 ? 8 : 12, 1, 'M'); rect(g, 8, 3, 2, 26, 'G'); return [16, 12]; },
  chart(g) { rect(g, 5, 16, 6, 13, 'M'); rect(g, 13, 6, 6, 23, 'M'); rect(g, 21, 20, 6, 9, 'M'); for (const [x, y] of [[5, 16], [13, 6], [21, 20]]) { rect(g, x, y, 6, 1, 'L'); rect(g, x + 4, y, 2, 29 - y, 'D'); rect(g, x, y, 1, 29 - y, 'l'); } rect(g, 4, 29, 24, 1, 'E'); return [16, 12]; },
  hourglass(g) { for (let y = 3; y < 29; y++) { const w = Math.abs(y - 16) * 0.8 + 1; rect(g, Math.round(16 - w), y, Math.round(w * 2), 1, 'M'); } shadeEllipse(g, 'M', 16, 16, 11, 13, ['D', 'D', 'l', 'l'], { roundness: 0.3 }); for (let y = 21; y < 28; y++) { const w = (y - 19) * 0.6; rect(g, Math.round(16 - w), y, Math.round(w * 2), 1, 'L'); } rect(g, 6, 2, 20, 2, 'E'); rect(g, 6, 28, 20, 2, 'E'); return [16, 22]; },
  lock(g) { rect(g, 7, 14, 18, 14, 'M'); shadeEllipse(g, 'M', 16, 21, 10, 8, ['D', 'D', 'l', 'l'], { roundness: 0.35 }); for (let y = 6; y < 15; y++) for (let x = 9; x < 23; x++) { const d = Math.hypot(x - 15.5, y - 12); if (d <= 7 && d >= 4.5 && y < 14) px(g, x, y, y < 9 ? 'l' : 'D'); } return [16, 20]; },
  bug(g) { ellipse(g, 16, 19, 9, 7.5, 'M'); ellipse(g, 16, 12, 5.5, 4.5, 'M'); shadeEllipse(g, 'M', 16, 18, 9, 10, ['D', 'D', 'l', 'l']); rect(g, 15, 15, 2, 10, 'D'); for (const [x0, y0, x1, y1] of [[8, 16, 3, 12], [7, 20, 2, 21], [8, 24, 4, 29], [24, 16, 29, 12], [25, 20, 30, 21], [24, 24, 28, 29]]) line(g, x0, y0, x1, y1, 'D'); line(g, 13, 8, 10, 4, 'D'); line(g, 19, 8, 22, 4, 'D'); return [16, 12]; },
  cloud(g) { ellipse(g, 11, 18, 7, 6, 'M'); ellipse(g, 20, 18, 8, 7, 'M'); ellipse(g, 15, 13, 7, 6, 'M'); rect(g, 6, 20, 21, 4, 'M'); shadeEllipse(g, 'M', 16, 18, 13, 10, ['D', 'D', 'l', 'l']); return [16, 18]; },
  cursor(g) { for (let y = 3; y < 24; y++) rect(g, 8, y, Math.min(14, Math.round((y - 3) * 0.75) + 1), 1, 'M'); rect(g, 14, 20, 4, 9, 'M'); shadeEllipse(g, 'M', 14, 15, 9, 14, ['D', 'D', 'l', 'l'], { roundness: 0.25 }); return [14, 13]; },
};
export const MONSTER_SHAPES = Object.keys(SHAPES);

function monsterFrame(def, frame) {
  const g = blank();
  const typeId = String(def.id).split(':')[0];
  const map = MONSTER_MAPS[typeId];
  if (map) {
    // hand-pixelled creature (already outlined): centre horizontally, sit on the ground line
    const w = map[0].length, h = map.length;
    stamp(g, map, Math.floor((32 - w) / 2), 30 - h);
    if (def.elite) stamp(g, ['C..C..C..C', 'CCLCCLCCLC', 'CCCCCCCCCC'], 11, Math.max(0, 30 - h - 3));
    return frame ? shiftDown(g, 1) : g;
  }
  const [cx, cy] = (SHAPES[def.shape] ?? SHAPES.blob)(g);
  drawFace(g, def.face ?? {}, cx, cy);
  if (def.elite) stamp(g, ['C..C..C..C', 'CCLCCLCCLC', 'CCCCCCCCCC'], cx - 5, 0);
  const out = outline(g);
  return frame ? shiftDown(out, 1) : out;
}

function bossFrame(def, frame) {
  const g = blank(48, 32);
  rect(g, 2, 4, 44, 24, 'M');
  for (const [x, y] of [[2, 4], [45, 4], [2, 27], [45, 27]]) px(g, x, y, '.');
  shadeEllipse(g, 'M', 24, 16, 25, 15, ['D', 'D', 'l', 'l'], { roundness: 0.2 });
  rect(g, 33, 4, 2, 24, 'D'); for (let y = 5; y < 28; y += 2) rect(g, 33, y, 2, 1, 'M');
  for (const y of [10, 14, 18]) rect(g, 36, y, 8, 2, 'L'); rect(g, 36, 22, 5, 2, 'L');
  rect(g, 6, 22, 24, 2, 'L');
  stamp(g, ['LLLLL', 'LEEEL', 'LLEEL'], 8, 9); stamp(g, ['LLLLL', 'LEEEL', 'LLEEL'], 19, 9);
  stamp(g, ['EE....', '..EE..'], 7, 7); stamp(g, ['....EE', '..EE..'], 18, 7);
  stamp(g, ['EEEEEEEEEEEE', 'ELELELELELEE', 'EEEEEEEEEEEE'], 10, 15);
  rect(g, 5, 13, 2, 1, 'K'); rect(g, 25, 13, 2, 1, 'K');
  rect(g, 28, 7, 2, 7, 'L'); rect(g, 28, 16, 2, 2, 'L');
  const out = outline(g);
  return frame ? shiftDown(out, 1) : out;
}

// ------------------------------------------------------------------- render --
const cache = new Map();
function colorOf(ch, palette) {
  if (ch.startsWith('O:')) return darken(palette[ch.slice(2)] ?? '#888888', 0.45);
  return palette[ch] ?? '#ff00ff';
}
function render(key, g, palette, scale = SCALE) {
  const hit = cache.get(key);
  if (hit) return hit;
  const h = g.length, w = g[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = g[y][x]; if (ch === '.') continue;
    ctx.fillStyle = colorOf(ch, palette); ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  cache.set(key, c);
  return c;
}
const heroPalette = (def) => {
  const p = { ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...(def.look?.skin ? { S: def.look.skin } : {}), ...(def.look?.eyes ? { I: def.look.eyes } : {}), ...def.palette };
  return { ...p, s: darken(p.S, 0.86), t: lighten(p.S, 0.35), h: darken(p.H, 0.72), i: lighten(p.H, 0.3), b: darken(p.B, 0.74), c: lighten(p.B, 0.25), p: darken(p.P, 0.7), w: darken(p.W, 0.65), a: darken(p.A, 0.68), J: lighten(p.I, 0.4) };
};
const monsterPalette = (mon) => {
  const typeId = String(mon.id).split(':')[0];
  const Y = MONSTER_ACCENTS[typeId] ?? '#f1c40f';
  const p = { ...MONSTER_DEFAULT, ...mon.palette, E: '#1b1b1b', C: '#f1c40f', Y, y: darken(Y, 0.7) };
  return { ...p, l: lighten(p.M, 0.3), D: p.D ?? darken(p.M) };
};

const HERO_POSES = { idle: ['idle', 'idle2'], walk: ['walkA', 'idle', 'walkB', 'idle'], attack: ['raise', 'strike', 'idle'] };
/** Card art for a def: the equipped skin's illustration when the manifest has one, else the base art. */
const artFor = (def) => (def.skin ? cardArt(`${def.id}__${def.skin.id}`) : null) ?? cardArt(def.id);
const cropFor = (def) => (def.skin && cardArt(`${def.id}__${def.skin.id}`) ? cardCrop(`${def.id}__${def.skin.id}`) : cardCrop(def.id));
export function heroSprite(def, anim = 'idle', frame = 0, scale = SCALE) {
  const sheet = sheetFrame(def.id, anim, frame, scale / SCALE); if (sheet) return sheet;
  const pack = packHeroFrame(def, anim, frame, scale / SCALE); if (pack) return pack;
  const poses = HERO_POSES[anim] ?? HERO_POSES.idle;
  const pose = poses[frame % poses.length];
  const key = `h:${def.id}${def.skin ? '@' + def.skin.id : ''}:${pose}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  return render(key, heroFrame(def, pose), heroPalette(def), scale);
}
export const heroFrameCount = (anim) => (HERO_POSES[anim] ?? HERO_POSES.idle).length;

export function monsterSprite(mon, frame = 0) {
  const sheet = sheetFrame('m:' + String(mon.id).split(':')[0], 'idle', frame, 1); if (sheet) return sheet;
  const pack = packMonsterFrame(mon, frame, mon.hue ?? 0); if (pack) return pack;
  const key = `m:${mon.id}:${mon.elite ? 'e' : ''}:${frame}`;
  if (cache.has(key)) return cache.get(key);
  const g = mon.shape === 'ticket' ? bossFrame(mon, frame) : monsterFrame(mon, frame);
  return render(key, g, monsterPalette(mon), SCALE);
}

const flashCache = new WeakMap();
export function flashSprite(img) {
  let f = flashCache.get(img); if (f) return f;
  f = document.createElement('canvas'); f.width = img.width; f.height = img.height;
  const ctx = f.getContext('2d'); ctx.drawImage(img, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, f.width, f.height);
  flashCache.set(img, f); return f;
}

export function heroIconDataURL(def) {
  const packIcon = packHeroIcon(def); if (packIcon) return packIcon;
  const key = `icon:${def.id}${def.skin ? '@' + def.skin.id : ''}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 22; c.height = 22;
  const ctx = c.getContext('2d');
  const pal = heroPalette(def); const g = heroFrame(def, 'idle');
  for (let y = 2; y < 19; y++) for (let x = 4; x < 26; x++) { const ch = g[y][x]; if (ch === '.') continue; ctx.fillStyle = colorOf(ch, pal); ctx.fillRect((x - 4), (y - 2) * 1.3, 1.2, 1.5); }
  const url = c.toDataURL(); cache.set(key, url); return url;
}

// --- Card illustrations ------------------------------------------------------
export const CARD_W = 128, CARD_H = 204;   // art cell 128×150 + two 27px record rows
const ART_H = 150;
/**
 * Excel-style card: a data record. The illustration sits whole (contain-fit) in the top cell; below it two rows of
 * cells hold name + grade tag and stars + level. Thin cell borders, square tags, no shadows.
 */
export function cardCanvas(def, { star = 1, owned = true, title = '', sub = '', awakened = false, bond = false } = {}) {
  const g = GRADES[def.grade];
  // rendered at 2× and displayed at CARD_W×CARD_H (CSS .card-canvas) so illustrations stay crisp on HiDPI screens
  const c = document.createElement('canvas'); c.width = CARD_W * 2; c.height = CARD_H * 2; c.className = 'card-canvas';
  const ctx = c.getContext('2d'); ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, CARD_W, CARD_H);
  // --- art cell
  const artImg = artFor(def);
  ctx.fillStyle = owned ? g.bg : '#efefef'; ctx.fillRect(1, 1, CARD_W - 2, ART_H - 1);
  ctx.save(); ctx.beginPath(); ctx.rect(1, 1, CARD_W - 2, ART_H - 1); ctx.clip();
  if (!owned) { ctx.filter = 'grayscale(1)'; ctx.globalAlpha = 0.55; }
  if (artImg) drawArtContain(ctx, artImg, 1, 1, CARD_W - 2, ART_H - 1, cropFor(def));
  else {
    // pixel fallback on a faint cell grid
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 16; x < CARD_W; x += 16) { ctx.moveTo(x + 0.5, 1); ctx.lineTo(x + 0.5, ART_H); }
    for (let y = 14; y < ART_H; y += 14) { ctx.moveTo(1, y + 0.5); ctx.lineTo(CARD_W - 1, y + 0.5); }
    ctx.stroke();
    ctx.imageSmoothingEnabled = false; const img = heroSprite(def, 'idle', 0, 1);
    ctx.drawImage(img, 0, 0, img.width, img.height, (CARD_W - 112) / 2, ART_H - 112 - 12, 112, 112);
  }
  ctx.restore();
  // --- record rows
  const rowY = ART_H, rowH = (CARD_H - ART_H) / 2;
  ctx.fillStyle = '#fafafa'; ctx.fillRect(1, rowY, CARD_W - 2, CARD_H - rowY - 1);
  ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(1, rowY + 0.5); ctx.lineTo(CARD_W - 1, rowY + 0.5); ctx.moveTo(1, rowY + rowH + 0.5); ctx.lineTo(CARD_W - 1, rowY + rowH + 0.5);
  ctx.moveTo(CARD_W - 30 + 0.5, rowY); ctx.lineTo(CARD_W - 30 + 0.5, CARD_H - 1); ctx.stroke();
  ctx.fillStyle = g.color; ctx.fillRect(1, rowY, 3, CARD_H - rowY - 1);                 // grade accent (left cell fill)
  // name (row 1, left cell)
  ctx.fillStyle = owned ? '#222' : '#888'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, def.name, CARD_W - 42), 8, rowY + rowH / 2 + 0.5);
  // grade tag (row 1, right cell)
  ctx.fillStyle = owned ? g.color : '#bdbdbd'; ctx.fillRect(CARD_W - 29, rowY + 1, 28, rowH - 1);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.fillText(def.grade, CARD_W - 15, rowY + rowH / 2 + 0.5);
  // stars / title (row 2, left cell) and level (right cell)
  const r2 = rowY + rowH + rowH / 2 + 0.5;
  if (!owned) { ctx.fillStyle = '#9a9a9a'; ctx.font = '11px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.fillText('미보유', 8, r2); }
  else {
    const lv = /Lv (\d+)/.exec(title)?.[1]; const jobTitle = title && !title.startsWith('★') ? title.split(' · ')[0] : null;
    ctx.textAlign = 'left'; ctx.font = '11px "Segoe UI", Arial';
    if (jobTitle) { ctx.fillStyle = '#444'; ctx.font = '11px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillText(fit(ctx, jobTitle, CARD_W - 42), 8, r2); }
    else { let x = 8; for (let i = 0; i < 5; i++) { ctx.fillStyle = i < star ? '#f1a500' : '#cfcfcf'; ctx.fillText('★', x, r2); x += 11; } }
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.fillText(lv ? `Lv${lv}` : (sub || ''), CARD_W - 15, r2);
    if (sub && lv) { ctx.fillStyle = '#217346'; ctx.font = 'bold 9px "Segoe UI", Arial'; ctx.textAlign = 'right'; ctx.fillText(sub, CARD_W - 34, r2); }
  }
  // --- frame
  ctx.strokeStyle = '#bfbfbf'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, CARD_W - 1, CARD_H - 1);
  if (bond && !awakened) { ctx.strokeStyle = '#e84393'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2); } // 호감도 MAX: pink frame (gold awakening wins when both)
  if (bond) { ctx.fillStyle = '#e84393'; ctx.fillRect(1, 1, 30, 16); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♥절친', 16, 9.5); }
  if (awakened) { ctx.strokeStyle = '#d4a017'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2); ctx.fillStyle = '#d4a017'; ctx.fillRect(CARD_W - 29, 1, 28, 16); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('각성', CARD_W - 15, 9.5); }
  return c;
}

export function portraitCanvas(def, scale = 4) {
  const g = GRADES[def.grade]; const size = 64 * scale + 16;
  const tallArt = artFor(def);
  if (tallArt && tallArt.height > tallArt.width * 1.1) { // full-figure illustration: tall portrait, whole image visible
    const w = size, h = Math.round(size * Math.min(1.5, tallArt.height / tallArt.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.dataset.art = '1';
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, g.bg); ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    drawArtContain(ctx, tallArt, 2, 2, w - 4, h - 4, cropFor(def));
    ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    return c;
  }
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = g.bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath();
  for (let i = 12; i < size; i += 16) { ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(size / 2, size - 10, 6 * scale, 1.2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  const artImg = artFor(def);
  if (artImg) drawArtCover(ctx, artImg, 2, 2, size - 4, size - 4, cropFor(def));
  else { const img = heroSprite(def, 'idle', 0, 1); ctx.drawImage(img, 0, 0, img.width, img.height, 8, 8, 64 * scale, 64 * scale); }
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
  return c;
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
