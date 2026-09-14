// Hand-pixelled sprites: 32x32 templates shown at 2x (64px on screen), plus card illustrations.
// Heroes are composed from hand-drawn pixel maps (body poses, hair styles, accessories, props,
// weapons) recoloured per character; every pixel was placed deliberately rather than generated
// from primitives. Monsters use shaded shapes with hand-drawn faces. Soft per-colour outlines.
import { GRADES } from './heroes.js';
import { sheetFrame } from './spriteSheets.js';

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
const DEFAULT_HERO_PAL = { S: '#f6d0b0', E: '#1b1b1b', L: '#ffffff', I: '#4e342e', K: '#f19a9a', G: '#b2bec3', g: '#6c7a89', O: '#23262b', A: '#c0392b' };
const ROLE_ACCENT = { tank: '#8fa3ad', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };

// Base body, idle, facing right (3/4). Head x10..22 y3..13 · neck y14 · torso x12..21 y15..21 · belt y22 · legs y23..28 · shoes y29..30
const BODY_IDLE = [
  '................................',
  '................................',
  '................................',
  '.............SSSSSS.............',
  '............sSSSttSS............',
  '...........ssSSSttSSS...........',
  '..........ssSSSSSSSSSS..........',
  '..........ssSShSSShhSS..........',
  '..........ssSSESSSLESSS.........',
  '..........ssSSESSSEESSs.........',
  '..........ssSKSSSSSSKs..........',
  '...........sSSSSSSOOS...........',
  '............sSSSSSSS............',
  '.............sSSSSS.............',
  '...............ssss.............',
  '............BBBLBLBBB...........',
  '..........bbbbBBLBBBccBB........',
  '..........bbbbBBBBBBccBc........',
  '..........bbbbBBBBBBccBc........',
  '..........bbbbBBBBBBccBc........',
  '..........bbbbBBBBBBccBc........',
  '..........ssbbBBBBBBccSS........',
  '............OOOOAOOOO...........',
  '............ppPPPPPPP...........',
  '.............ppP.PPP............',
  '.............ppP.PPP............',
  '.............ppP.PPP............',
  '.............ppP.PPP............',
  '.............ppP.PPP............',
  '............OOOO.OOOOO..........',
  '............GOOO.GOOOO..........',
  '................................',
];
// leg/shoe variants (rows y23..30, full width)
const LEGS = {
  idle: BODY_IDLE.slice(23, 31),
  walkA: [ // stride: back leg left, front leg right
    '............ppPPPPPPP...........',
    '...........ppP...PPPP...........',
    '..........ppP.....PPP...........',
    '..........ppP.....PPP...........',
    '.........ppP.......PPP..........',
    '.........ppP.......PPP..........',
    '........OOOO.......OOOOO........',
    '........GOOO.......GOOOO........',
  ],
  walkB: [ // stride: legs crossed the other way
    '............ppPPPPPPP...........',
    '.............pPPPPP.............',
    '..............pPPPP.............',
    '..............pPPP..............',
    '..............pPPP..............',
    '..............pPPP..............',
    '.............OOOOOO.............',
    '.............GOOOOO.............',
  ],
};
// front arm variants: rows y9..21, cols x21..30 (10 wide)
const FRONT_ARM = {
  idle: null, // baked into BODY_IDLE
  raise: [
    '...SS.....', // y9
    '...SS.....', // y10
    '...BB.....', // y11
    '...BB.....', // y12
    '..BB......', // y13
    '..BB......', // y14
    '.BB.......', // y15
    '.B........', // y16
  ],
  strike: [
    '.BBBBBB.SS', // y17 → placed at y17
    '.BBBBBcSS.', // y18
  ],
};

function drawHairMap(g, style) {
  // maps are placed at x9, y0 (15 wide); 'H' base, 'h' shade, 'i' light
  const cap = [
    '...............',
    '.....HHHHH.....',
    '...HHiiHHHHH...',
    '..HHHiiHHHHHH..',
    '.hHHHHHHHHHHHH.',
    '.hhHHHHHHHHHHH.',
    '.hhHH...H..HH..',
    '.hhH...........',
    '..h............',
  ];
  switch (style) {
    case 'bald': px(g, 14, 5, 't'); px(g, 15, 5, 't'); px(g, 16, 4, 't'); return;
    case 'spiky': stamp(g, [
      '...H..H..H..H..',
      '..HH.HHi.HH.HH.',
      '.HHHHHHHHHHHHH.',
      '.hHHHiiHHHHHHH.',
      '.hhHHHHHHHHHHH.',
      '.hhHH...H..HH..',
      '.hhH...........',
      '..h............',
    ], 9, 0); return;
    case 'curly': stamp(g, [
      '....HH.HH.HH...',
      '..HHHHiHHHHHHH.',
      '.HHHHHiiHHHHHHH',
      'hHHHHHHHHHHHHHH',
      'hhHHHHHHHHHHHHh',
      'hhHHH...H..HHHh',
      '.hhH.........H.',
      '..h............',
    ], 9, 1); return;
    default: stamp(g, cap, 9, 0);
  }
  if (style === 'long') { stamp(g, ['hhH', 'hhH', 'hhH', 'hhH', 'hhH', 'hhH', 'hhH', 'hhH', 'hhH', 'hhH', '.hH'], 9, 6); rect(g, 22, 6, 1, 5, 'H'); }
  if (style === 'bob') { stamp(g, ['hhH', 'hhH', 'hhH', 'hhH', 'hhH', '.hH'], 9, 6); stamp(g, ['HH', 'HH', 'HH', 'HH', 'HH'], 22, 6); }
  if (style === 'bun') { stamp(g, ['.HH.', 'HHHi', 'HHHH', '.HH.'], 8, 1); }
  if (style === 'side') { stamp(g, ['HHHH.....', '.HHHH....', '...HHHH..', '.....HHH.', '.......HH'], 15, 4); }
  if (style === 'grey') { px(g, 13, 3, 'L'); px(g, 14, 2, 'L'); px(g, 18, 2, 'L'); px(g, 19, 3, 'L'); }
  if (style === 'cap') { clear(g, 9, 0, 15, 6); stamp(g, [
    '.....AAAAA.....',
    '...AAAaAAAAA...',
    '..AAAAAAAAAAA..',
    '.aAAAAAAAAAAAA.',
    '.aaAAAAAAAAAAAAAA',
    '........aaaaaaaaa',
  ], 9, 1); rect(g, 10, 6, 3, 2, 'h'); }
}

function drawAccessory(g, acc, bx = 10, by = 21) {
  switch (acc) {
    // face
    case 'glasses': stamp(g, ['GGG.GGGG.', 'G.GGG..GG', 'G.G.G..G.', 'GGG.GGGG.'], 13, 7); px(g, 14, 8, 'L'); px(g, 18, 8, 'L'); break;
    case 'sunglasses': stamp(g, ['gggggggg', 'ggg.gggg'], 13, 8); px(g, 19, 8, 'L'); px(g, 14, 8, 'L'); px(g, 21, 8, 'g'); break;
    case 'beard': stamp(g, ['HHHHHHHH', '.hHHHHHH', '..hHHHH.'], 14, 11); break;
    case 'mustache': stamp(g, ['HHHH'], 17, 10); px(g, 16, 11, 'h'); break;
    case 'headset': stamp(g, ['....AAAA....', '...A....A...', '..A......A..', '.A........A.', '.A........AA', '..........AL', '..........AA', '...........A'], 11, 3); px(g, 23, 11, 'A'); px(g, 23, 12, 'g'); break;
    case 'hardhat': clear(g, 10, 1, 13, 5); stamp(g, ['....AAAAA....', '..AAAALAAAAA.', '.AAAAAAAAAAAA', 'aAAAAAAAAAAAAa', 'aaaaaaaaaaaaaa', '.aaaaaaaaaaaa.'], 10, 1); break;
    case 'crown': stamp(g, ['A..A..A..A', 'AALAALAALA', 'AAAAAAAAAA', 'aaaaaaaaaa'], 12, 0); break;
    case 'earring': px(g, 22, 10, 'A'); px(g, 22, 11, 'L'); break;
    case 'flower': stamp(g, ['.A.', 'ALA', '.A.'], 8, 3); px(g, 9, 5, 'a'); break;
    case 'pen': stamp(g, ['AAAL'], 20, 5); break;
    // torso
    case 'tie': stamp(g, ['.A.', '.A.', '.A.', 'AAA', 'ALA', 'AAA', '.a.'], 15, 15); break;
    case 'badge': stamp(g, ['AL', 'aa'], 13, 17); break;
    case 'scarf': stamp(g, ['AAAAAAAAAA', 'aAAAAaAAAa'], 12, 14); stamp(g, ['AA', 'aA', 'AA', 'aA', 'AA'], 10, 16); break;
    case 'lanyard': stamp(g, ['A.A', 'A.A', '.A.'], 15, 15); stamp(g, ['LLL', 'LAL', 'LLL'], 15, 18); break;
    case 'apron': stamp(g, ['.L.L.', '.L.L.', 'LLLLL', 'LLLLL', 'LLLLL', 'LgggL', 'LLLLL'], 14, 15); break;
    case 'suspenders': rect(g, 14, 15, 1, 7, 'a'); rect(g, 18, 15, 1, 7, 'a'); break;
    case 'hoodie': stamp(g, ['.BB', 'BBB', 'BBB', 'BBB', 'BBB', 'BBb', 'Bbb', '.bb'], 7, 6); stamp(g, ['bbbbbbbbbb'], 12, 14); rect(g, 15, 16, 1, 4, 'L'); rect(g, 17, 16, 1, 4, 'L'); break;
    case 'watch': px(g, 22, 21, 'g'); px(g, 23, 21, 'L'); break;
    case 'radio': stamp(g, ['.g', 'gg', 'gA', 'gg'], 20, 20); break;
    // back-hand props (bx,by = back hand)
    case 'coffee': stamp(g, ['LLLLL', 'AAAA.', 'AAAAA', 'AAAAA', 'aaaa.'], bx - 3, by - 4); px(g, bx - 2, by - 7, 'L'); px(g, bx - 1, by - 8, 'L'); px(g, bx - 1, by - 6, 'L'); break;
    case 'clipboard': stamp(g, ['.AAA.', 'LLLLL', 'LAAAL', 'LLLLL', 'LAAAL', 'LLLLL', 'LAA.L', 'LLLLL', 'ggggg'], bx - 5, by - 7); break;
    case 'calculator': stamp(g, ['gggg', 'gLLg', 'gggg', 'gLgL', 'gggg', 'gLgL', 'gggg', 'gLgL'], bx - 4, by - 6); break;
    case 'briefcase': stamp(g, ['..aa..', 'AAAAAA', 'AAAAAA', 'aaaLaa', 'AAAAAA', 'AAAAAA'], bx - 6, by - 4); break;
    case 'cane': stamp(g, ['AAA'], bx - 1, by); line(g, bx, by + 1, bx - 1, by + 9, 'W'); break;
    case 'files': stamp(g, ['AA...', 'LLLLL', 'LLLLL', 'LgggL', 'LLLLL', 'LgggL', 'LLLLL', 'LggLL', 'LLLLL'], bx - 5, by - 7); break;
    case 'phone': stamp(g, ['ggg', 'gLg', 'gLg', 'gLg', 'gLg', 'ggg'], bx - 2, by - 5); break;
    case 'magnifier': stamp(g, ['.gg.', 'gLLg', 'gLLg', '.gg.'], bx - 5, by - 6); line(g, bx - 1, by - 2, bx + 1, by, 'W'); break;
    case 'parcel': stamp(g, ['AAALAA', 'AAALAA', 'LLLLLL', 'AAALAA', 'AAALAA', 'aaaaaa'], bx - 6, by - 5); break;
    case 'ledger': stamp(g, ['aAAAA', 'aLLLL', 'aLggL', 'aLLLL', 'aLggL', 'aLLLL', 'aAAAA'], bx - 5, by - 6); break;
    default: break;
  }
}

/** Weapon at the front hand. (hx,hy) = top-left of the 2x2 hand. */
function drawWeapon(g, role, pose, hx, hy) {
  switch (role) {
    case 'melee':
      if (pose === 'raise') { stamp(g, ['.L', 'wW', 'wW', 'wW', 'wW', 'wW', 'wW', 'AAAA'], hx - 1, hy - 8); }
      else if (pose === 'strike') { stamp(g, ['aA', 'A.'], hx + 2, hy - 1); stamp(g, ['LLLLLLL', 'WWWWWWL', 'wwwwww.'], hx + 3, hy); }
      else { stamp(g, ['......LW', '.....LWw', '....LWw.', '...LWw..', '..LWw...', '.LWw....', 'AAAA....'], hx + 1, hy - 6); }
      break;
    case 'ranged': { const [x, y] = pose === 'raise' ? [hx + 1, hy - 5] : pose === 'strike' ? [hx + 2, hy - 3] : [hx + 1, hy - 3]; stamp(g, ['WWWWWWW', 'WLLLLLW', 'WLwwwLW', 'WLLLLLW', 'WWWWWWW', 'gggggggg'], x, y); px(g, x + 3, y + 5, 'L'); break; }
    case 'tank': { const [x, y] = pose === 'raise' ? [hx + 1, hy - 5] : pose === 'strike' ? [hx + 2, hy - 4] : [hx + 1, hy - 5]; stamp(g, ['.AAAA.', 'AALaAA', 'AaLLaA', 'AaLaaA', 'AaLaaA', 'AALaAA', '.AAAA.', '..AA..'], x, y); break; }
    case 'healer': { const [x, y] = pose === 'raise' ? [hx + 1, hy - 5] : pose === 'strike' ? [hx + 2, hy - 3] : [hx + 1, hy - 3]; stamp(g, ['..gg..', 'LLLLLL', 'LLWWLL', 'LWWWWL', 'LLWWLL', 'LLLLLL', 'gggggg'], x, y); break; }
  }
}

/** Build one 32x32 hero frame. pose: idle | idle2 | walkA | walkB | raise | strike */
function heroFrame(def, pose) {
  const look = def.look ?? {};
  const g = blank();
  const tx = pose === 'strike' ? -3 : 0;
  stamp(g, BODY_IDLE, tx, 0);
  // legs
  if (pose === 'walkA' || pose === 'walkB') { clear(g, 0, 23, 32, 8); stamp(g, LEGS[pose], tx, 23); }
  // arms
  if (pose === 'walkA') { clear(g, 10 + tx, 16, 2, 6); stamp(g, ['bb', 'bb', 'bb', 'bb', 'bb', 'ss'], 9 + tx, 16); }
  let hand = [22 + tx, 21]; // top-left of front hand (2 wide)
  if (pose === 'raise') { clear(g, 22 + tx, 16, 2, 6); stamp(g, FRONT_ARM.raise, 21 + tx, 9); hand = [24 + tx, 9]; }
  else if (pose === 'strike') { clear(g, 22 + tx, 16, 2, 6); stamp(g, FRONT_ARM.strike, 21 + tx, 17); hand = [29 + tx, 17]; }
  // head bob for breathing: redraw head one pixel lower
  if (pose === 'idle2') { const head = BODY_IDLE.slice(3, 14); clear(g, 8 + tx, 3, 16, 11); stamp(g, head, tx, 1); }
  const hy = pose === 'idle2' ? 1 : 0;
  // hair (drawn relative to the head)
  const hair = blank(); drawHairMap(hair, look.hair ?? 'short'); stamp(g, hair.map((r) => r.join('')), tx, hy);
  // accessories & props (torso ones don't move with the head)
  const bx = 10 + tx + (pose === 'walkA' ? -1 : 0), by = 21;
  for (const a of [look.acc, look.acc2, look.prop]) {
    const isHead = ['glasses', 'sunglasses', 'beard', 'mustache', 'headset', 'hardhat', 'crown', 'earring', 'flower', 'pen'].includes(a);
    const layer = blank(); drawAccessory(layer, a, bx - tx, by); stamp(g, layer.map((r) => r.join('')), tx, isHead ? hy : 0);
  }
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
  const [cx, cy] = (SHAPES[def.shape] ?? SHAPES.blob)(g);
  drawFace(g, def.face ?? {}, cx, cy);
  if (def.elite) stamp(g, ['Y..Y..Y..Y', 'YYLYYLYYLY', 'YYYYYYYYYY'], cx - 5, 0);
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
  const p = { ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...(def.look?.skin ? { S: def.look.skin } : {}), ...def.palette };
  return { ...p, s: darken(p.S, 0.85), t: lighten(p.S, 0.35), h: darken(p.H, 0.66), i: lighten(p.H, 0.42), b: darken(p.B, 0.7), c: lighten(p.B, 0.25), p: darken(p.P, 0.7), w: darken(p.W, 0.65), a: darken(p.A, 0.68) };
};
const monsterPalette = (mon) => { const p = { ...MONSTER_DEFAULT, ...mon.palette }; return { ...p, l: lighten(p.M, 0.3), D: p.D ?? darken(p.M) }; };

const HERO_POSES = { idle: ['idle', 'idle2'], walk: ['walkA', 'idle', 'walkB', 'idle'], attack: ['raise', 'strike', 'idle'] };
export function heroSprite(def, anim = 'idle', frame = 0, scale = SCALE) {
  const sheet = sheetFrame(def.id, anim, frame, scale / SCALE); if (sheet) return sheet;
  const poses = HERO_POSES[anim] ?? HERO_POSES.idle;
  const pose = poses[frame % poses.length];
  const key = `h:${def.id}:${pose}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  return render(key, heroFrame(def, pose), heroPalette(def), scale);
}
export const heroFrameCount = (anim) => (HERO_POSES[anim] ?? HERO_POSES.idle).length;

export function monsterSprite(mon, frame = 0) {
  const sheet = sheetFrame('m:' + String(mon.id).split(':')[0], 'idle', frame, 1); if (sheet) return sheet;
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
  const key = `icon:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 22; c.height = 22;
  const ctx = c.getContext('2d');
  const pal = heroPalette(def); const g = heroFrame(def, 'idle');
  for (let y = 0; y < 14; y++) for (let x = 8; x < 25; x++) { const ch = g[y][x]; if (ch === '.') continue; ctx.fillStyle = colorOf(ch, pal); ctx.fillRect((x - 8) * 1.3, y * 1.5, 2, 2); }
  const url = c.toDataURL(); cache.set(key, url); return url;
}

// --- Card illustrations ------------------------------------------------------
export const CARD_W = 112, CARD_H = 150;
export function cardCanvas(def, { star = 1, owned = true, title = '', sub = '' } = {}) {
  const g = GRADES[def.grade];
  const c = document.createElement('canvas'); c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H); grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, g.bg);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 8; x < CARD_W; x += 16) { ctx.moveTo(x + 0.5, 4); ctx.lineTo(x + 0.5, 104); }
  for (let y = 12; y < 104; y += 12) { ctx.moveTo(4, y + 0.5); ctx.lineTo(CARD_W - 4, y + 0.5); }
  ctx.stroke();
  ctx.fillStyle = g.color; ctx.beginPath(); ctx.roundRect(6, 6, 20, 15, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(def.grade, 16, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(CARD_W / 2, 104, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
  const img = heroSprite(def, 'idle', 0, 3);
  if (!owned) ctx.globalAlpha = 0.35;
  ctx.drawImage(img, (CARD_W - 96) / 2, 12); ctx.globalAlpha = 1;
  ctx.fillStyle = g.color; ctx.fillRect(0, 112, CARD_W, 38);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fit(ctx, def.name, CARD_W - 10), CARD_W / 2, 124);
  ctx.font = '10px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(fit(ctx, title || (owned ? '★'.repeat(star) + '☆'.repeat(5 - star) : '미보유'), CARD_W - 10), CARD_W / 2, 139);
  if (sub) { ctx.font = 'bold 10px "Segoe UI", sans-serif'; ctx.fillStyle = '#333'; ctx.textAlign = 'right'; ctx.fillText(sub, CARD_W - 7, 14); }
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);
  if (def.grade === 'S') { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 4.5, CARD_W - 9, CARD_H - 9); }
  if (!owned) { ctx.fillStyle = 'rgba(120,120,120,0.35)'; ctx.fillRect(0, 0, CARD_W, 112); }
  return c;
}

export function portraitCanvas(def, scale = 5) {
  const g = GRADES[def.grade]; const size = SRC * scale + 16;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = g.bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath();
  for (let i = 12; i < size; i += 16) { ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(size / 2, size - 10, 6 * scale, 1.2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(heroSprite(def, 'idle', 0, scale), 8, 8);
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
  return c;
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
