// Procedural "chibi" pixel sprites + card illustrations. Templates are arrays of
// 16-char strings; each char is a palette key ('.' = transparent). Rendered once per
// (template, palette) into an offscreen canvas and cached.
import { GRADES } from './heroes.js';

export const SCALE = 2;
export const SPRITE = 16 * SCALE;

const DEFAULT_HERO_PAL = { S: '#f6d5b5', E: '#1b1b1b', L: '#ffffff', K: '#ffb3b3', O: '#23262b', A: '#c0392b' };
const ROLE_ACCENT = { tank: '#95a5a6', ranged: '#e17055', healer: '#ff7675', melee: '#c0392b' };

// Base chibi (big head, facing camera, weapon hand on the right)
const CHIBI = [
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '...HHSSSSSSHH...',
  '...HSSSSSSSSH...',
  '...SSSELSSELS...',
  '...SSSEESSEES...',
  '...SKSSSSSSKS...',
  '....SSSSSSSS....',
  '.....BBBBBB.....',
  '....BBBBBBBB....',
  '...SBBBBBBBBS...',
  '....BBBBBBBB....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....OOO..OOO....',
];
const withRows = (rows, patch) => rows.map((r, i) => patch[i] ?? r);
const ATTACK_STRIKE = withRows(CHIBI, { 10: '....BBBBBBBBSWWW', 11: '...SBBBBBBBB....' });
const ATTACK_RAISE  = withRows(CHIBI, { 8: '....SSSSSSSS..W.', 9: '.....BBBBBB...W.', 10: '....BBBBBBBBSW..' });
const WALK          = withRows(CHIBI, { 13: '...PPP....PPP...', 14: '...PPP....PPP...', 15: '...OOO....OOO...' });

// Role accessories drawn over the base (A = accent colour)
const ACCESSORY = {
  tank:   { 0: '.....AAAAAA.....', 1: '....AAAAAAAA....', 2: '...AAAAAAAAAA...', 3: '...AAAAAAAAAA...' },        // helmet
  ranged: { 0: '.....AAAAAA.....', 1: '....AAAAAAAA....', 2: '...AAAAAAAAAAAA.' },                                // cap with brim
  healer: { 2: '...AAAAAAAAAA...' },                                                                              // headband
  melee:  { 9: '.....BBABBB.....', 10: '....BBBABBBB....' },                                                     // tie
};
function dressed(rows, role) {
  const acc = ACCESSORY[role]; if (!acc) return rows;
  return rows.map((r, i) => {
    const a = acc[i]; if (!a) return r;
    // accessory pixels only replace non-transparent base pixels (except brim which may extend)
    return r.split('').map((ch, x) => (a[x] === 'A' && (ch !== '.' || i === 2) ? 'A' : a[x] !== '.' && a[x] !== 'A' ? a[x] : ch)).join('');
  });
}

const MONSTER_SHAPES = {
  blob: [
    '................', '................', '......OOOO......', '....OOMMMMOO....',
    '...OMMMMMMMMO...', '..OMMMMMMMMMMO..', '..OMMEEMMEEMMO..', '..OMMELMMELMMO..',
    '..OMKMMMMMMKMO..', '..OMMMOOOOMMMO..', '..OMMMMMMMMMMO..', '...OMMMMMMMMO...',
    '....OOMMMMOO....', '.....OO..OO.....', '................', '................',
  ],
  cube: [
    '................', '................', '..OOOOOOOOOOOO..', '..OMMMMMMMMMMO..',
    '..OMMMMMMMMMMO..', '..OMEEMMMMEEMO..', '..OMELMMMMELMO..', '..OMKMMMMMMKMO..',
    '..OMMMMMMMMMMO..', '..OMMEEEEEEMMO..', '..OMMMMMMMMMMO..', '..OMMMMMMMMMMO..',
    '..OOOOOOOOOOOO..', '...OO......OO...', '................', '................',
  ],
  diamond: [
    '................', '.......OO.......', '......OMMO......', '.....OMMMMO.....',
    '....OMMMMMMO....', '...OMMEMMEMMO...', '..OMMMLMMLMMMO..', '..OMKMMEEMMKMO..',
    '..OMMMMMMMMMMO..', '...OMMMMMMMMO...', '....OMMMMMMO....', '.....OMMMMO.....',
    '......OMMO......', '.......OO.......', '................', '................',
  ],
};

/** 32x24 "긴급 티켓" boss, generated procedurally. */
function buildTicket() {
  const W = 32, H = 24, rows = [];
  const glyph = ['.EEE.', '.EEE.', '.EEE.', '.EEE.', '.EEE.', '..E..', '.....', '.EEE.', '.EEE.'];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      const border = y === 0 || y === H - 1 || x === 0 || x === W - 1;
      const corner = (x < 2 && (y < 2 || y > H - 3)) || (x > W - 3 && (y < 2 || y > H - 3));
      const notch = (x === 22 || x === 23) && (y < 3 || y > H - 4);
      if (corner || notch) r += '.';
      else if (border) r += 'O';
      else if ((x === 22 || x === 23) && y % 2 === 0) r += 'O';
      else if (x >= 25 && x <= 29 && y >= 7 && y <= 15) r += 'T';
      else if (x >= 6 && x <= 10 && y >= 7 && y <= 15) r += glyph[y - 7][x - 6] === 'E' ? 'E' : 'M';
      else if (x >= 13 && x <= 18 && (y === 9 || y === 12)) r += 'T';
      else if ((x === 14 || x === 17) && y === 15) r += 'K';
      else r += 'M';
    }
    rows.push(r);
  }
  return rows;
}
const TICKET = buildTicket();

function shiftDown(rows, dy) {
  const w = rows[0].length, blank = '.'.repeat(w);
  return [...Array(dy).fill(blank), ...rows.slice(0, rows.length - dy)];
}

const cache = new Map();
function render(key, rows, palette, scale = SCALE) {
  const hit = cache.get(key);
  if (hit) return hit;
  const w = rows[0].length, h = rows.length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    ctx.fillStyle = palette[ch] ?? '#ff00ff';
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
  cache.set(key, c);
  return c;
}

const heroPalette = (def) => ({ ...DEFAULT_HERO_PAL, A: ROLE_ACCENT[def.role], ...def.palette });

/**
 * @param def   hero/job definition (data/heroes.js)
 * @param anim  'idle' | 'walk' | 'attack'
 * @param frame 0 | 1
 */
export function heroSprite(def, anim = 'idle', frame = 0, scale = SCALE) {
  let rows;
  if (anim === 'attack') rows = frame === 0 ? ATTACK_RAISE : ATTACK_STRIKE;
  else if (anim === 'walk') rows = frame === 0 ? WALK : CHIBI;
  else rows = frame === 0 ? CHIBI : shiftDown(CHIBI, 1);
  return render(`h:${def.id}:${anim}:${frame}:${scale}`, dressed(rows, def.role), heroPalette(def), scale);
}

export function monsterSprite(mon, frame = 0) {
  const rows = mon.shape === 'ticket' ? TICKET : MONSTER_SHAPES[mon.shape] ?? MONSTER_SHAPES.blob;
  const pal = { L: '#ffffff', K: '#ffb3b3', ...mon.palette };
  return render(`m:${mon.id}:${frame}`, frame === 0 ? rows : shiftDown(rows, 1), pal);
}

/** Tiny head icon (data URL) for tables. */
export function heroIconDataURL(def) {
  const key = `icon:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const pal = heroPalette(def);
  const rows = dressed(CHIBI, def.role);
  for (let y = 0; y <= 8; y++) for (let x = 3; x <= 12; x++) {
    const ch = rows[y][x]; if (ch === '.') continue;
    ctx.fillStyle = pal[ch]; ctx.fillRect((x - 3) * 1.6, y * 1.7, 2, 2);
  }
  const url = c.toDataURL(); cache.set(key, url); return url;
}

// --- Card illustrations ------------------------------------------------------
export const CARD_W = 96, CARD_H = 128;

/**
 * Draw a collectible card: grade-coloured frame, spreadsheet-pattern backdrop,
 * 4x chibi portrait, name, stars / title line.
 */
export function cardCanvas(def, { star = 1, owned = true, title = '', sub = '' } = {}) {
  const g = GRADES[def.grade];
  const c = document.createElement('canvas'); c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  // backdrop
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, g.bg);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, CARD_W, CARD_H);
  // faint grid like a worksheet
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 8; x < CARD_W; x += 16) { ctx.moveTo(x + 0.5, 4); ctx.lineTo(x + 0.5, 84); }
  for (let y = 12; y < 84; y += 12) { ctx.moveTo(4, y + 0.5); ctx.lineTo(CARD_W - 4, y + 0.5); }
  ctx.stroke();
  // grade badge
  ctx.fillStyle = g.color; ctx.beginPath(); ctx.roundRect(6, 6, 18, 14, 3); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.grade, 15, 13.5);
  // portrait (4x = 64px), shadow ellipse
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(CARD_W / 2, 82, 22, 5, 0, 0, Math.PI * 2); ctx.fill();
  const img = heroSprite(def, 'idle', 0, 4);
  if (!owned) ctx.globalAlpha = 0.35;
  ctx.drawImage(img, (CARD_W - 64) / 2, 18);
  ctx.globalAlpha = 1;
  // name plate
  ctx.fillStyle = g.color; ctx.fillRect(0, 92, CARD_W, 36);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(fit(ctx, def.name, CARD_W - 10), CARD_W / 2, 103);
  ctx.font = '10px "Malgun Gothic", "Segoe UI", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const line = title || (owned ? '★'.repeat(star) + '☆'.repeat(5 - star) : '미보유');
  ctx.fillText(line, CARD_W / 2, 117);
  if (sub) { ctx.font = '9px "Segoe UI", sans-serif'; ctx.fillStyle = '#333'; ctx.textAlign = 'right'; ctx.fillText(sub, CARD_W - 6, 13.5); }
  // frame
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, CARD_W - 2, CARD_H - 2);
  if (def.grade === 'S') { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(4.5, 4.5, CARD_W - 9, CARD_H - 9); }
  if (!owned) { ctx.fillStyle = 'rgba(120,120,120,0.35)'; ctx.fillRect(0, 0, CARD_W, 92); }
  return c;
}

/** Large portrait for the detail dialog (6x chibi on a soft backdrop). */
export function portraitCanvas(def, scale = 6) {
  const g = GRADES[def.grade]; const size = 16 * scale + 16;
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = g.bg; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.beginPath();
  for (let i = 12; i < size; i += 16) { ctx.moveTo(i + 0.5, 0); ctx.lineTo(i + 0.5, size); ctx.moveTo(0, i + 0.5); ctx.lineTo(size, i + 0.5); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(size / 2, size - 10, 5 * scale, scale, 0, 0, Math.PI * 2); ctx.fill();
  ctx.drawImage(heroSprite(def, 'idle', 0, scale), 8, 8);
  ctx.strokeStyle = g.color; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2);
  return c;
}

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text; while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
