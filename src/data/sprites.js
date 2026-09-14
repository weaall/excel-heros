// Procedural pixel sprites. Templates are arrays of 16-char strings; each char is a
// palette key ('.' = transparent). Rendered once per (template, palette) into an
// offscreen canvas at SCALE and cached.
export const SCALE = 2;
export const SPRITE = 16 * SCALE;

const DEFAULT_HERO_PAL = { S: '#f1c27d', E: '#1b1b1b', O: '#23262b' };

const HERO_IDLE = [
  '................',
  '.....HHHHHH.....',
  '....HHHHHHHH....',
  '....HSSSSSSH....',
  '....SSSESSES....',
  '....SSSSSSSS....',
  '.....SSSSSS.....',
  '....BBBBBBBB....',
  '...BBBBBBBBBB...',
  '...SBBBBBBBBS...',
  '...SBBBBBBBBS...',
  '....BBBBBBBB....',
  '....PPPPPPPP....',
  '....PPP..PPP....',
  '....PPP..PPP....',
  '....OOO..OOO....',
];
const HERO_ATTACK_STRIKE = HERO_IDLE.map((r, i) => (
  i === 8 ? '...BBBBBBBBBSWWW' : i === 9 || i === 10 ? '...SBBBBBBBB....' : r));
const HERO_ATTACK_RAISE = HERO_IDLE.map((r, i) => (
  i === 5 ? '....SSSSSSSS..W.' : i === 6 ? '.....SSSSSS...W.' : i === 7 ? '....BBBBBBBB..W.' : i === 8 ? '...BBBBBBBBBBS..' : r));
const HERO_WALK = HERO_IDLE.map((r, i) => (
  i === 13 || i === 14 ? '...PPP....PPP...' : i === 15 ? '...OOO....OOO...' : r));

const MONSTER_SHAPES = {
  blob: [
    '................', '................', '......OOOO......', '....OOMMMMOO....',
    '...OMMMMMMMMO...', '..OMMMMMMMMMMO..', '..OMMEEMMEEMMO..', '..OMMEEMMEEMMO..',
    '..OMMMMMMMMMMO..', '..OMMMOOOOMMMO..', '..OMMMMMMMMMMO..', '...OMMMMMMMMO...',
    '....OOMMMMOO....', '.....OO..OO.....', '................', '................',
  ],
  cube: [
    '................', '................', '..OOOOOOOOOOOO..', '..OMMMMMMMMMMO..',
    '..OMMMMMMMMMMO..', '..OMEEMMMMEEMO..', '..OMEEMMMMEEMO..', '..OMMMMMMMMMMO..',
    '..OMMMMMMMMMMO..', '..OMMEEEEEEMMO..', '..OMMMMMMMMMMO..', '..OMMMMMMMMMMO..',
    '..OOOOOOOOOOOO..', '...OO......OO...', '................', '................',
  ],
  diamond: [
    '................', '.......OO.......', '......OMMO......', '.....OMMMMO.....',
    '....OMMMMMMO....', '...OMMEMMEMMO...', '..OMMMMMMMMMMO..', '..OMMMMEEMMMMO..',
    '..OMMMMMMMMMMO..', '...OMMMMMMMMO...', '....OMMMMMMO....', '.....OMMMMO.....',
    '......OMMO......', '.......OO.......', '................', '................',
  ],
};

/** 32x24 "Emergency Ticket" boss, generated procedurally. */
function buildTicket() {
  const W = 32, H = 24, rows = [];
  const glyph = [ // 5x9 "!" in E
    '.EEE.', '.EEE.', '.EEE.', '.EEE.', '.EEE.', '..E..', '.....', '.EEE.', '.EEE.'];
  for (let y = 0; y < H; y++) {
    let r = '';
    for (let x = 0; x < W; x++) {
      const border = y === 0 || y === H - 1 || x === 0 || x === W - 1;
      const corner = (x < 2 && (y < 2 || y > H - 3)) || (x > W - 3 && (y < 2 || y > H - 3));
      const notch = (x === 22 || x === 23) && (y < 3 || y > H - 4);
      if (corner || notch) r += '.';
      else if (border) r += 'O';
      else if ((x === 22 || x === 23) && y % 2 === 0) r += 'O';            // perforation
      else if (x >= 25 && x <= 29 && y >= 7 && y <= 15) r += 'T';          // stub
      else if (x >= 6 && x <= 10 && y >= 7 && y <= 15) r += glyph[y - 7][x - 6] === 'E' ? 'E' : 'M';
      else if (x >= 13 && x <= 18 && (y === 9 || y === 12) ) r += 'T';      // "text lines"
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
function render(key, rows, palette) {
  const hit = cache.get(key);
  if (hit) return hit;
  const w = rows[0].length, h = rows.length;
  const c = document.createElement('canvas');
  c.width = w * SCALE; c.height = h * SCALE;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch === '.') continue;
    ctx.fillStyle = palette[ch] ?? '#ff00ff';
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
  }
  cache.set(key, c);
  return c;
}

/**
 * @param hero  hero definition (data/heroes.js)
 * @param anim  'idle' | 'walk' | 'attack'
 * @param frame 0 | 1
 */
export function heroSprite(hero, anim = 'idle', frame = 0) {
  const pal = { ...DEFAULT_HERO_PAL, ...hero.palette };
  let rows;
  if (anim === 'attack') rows = frame === 0 ? HERO_ATTACK_RAISE : HERO_ATTACK_STRIKE;
  else if (anim === 'walk') rows = frame === 0 ? HERO_WALK : HERO_IDLE;
  else rows = frame === 0 ? HERO_IDLE : shiftDown(HERO_IDLE, 1);
  return render(`h:${hero.id}:${anim}:${frame}`, rows, pal);
}

export function monsterSprite(mon, frame = 0) {
  const rows = mon.shape === 'ticket' ? TICKET : MONSTER_SHAPES[mon.shape] ?? MONSTER_SHAPES.blob;
  return render(`m:${mon.id}:${frame}`, frame === 0 ? rows : shiftDown(rows, 1), mon.palette);
}

/** Tiny 8x8 icon of a hero (head only) for tables. */
export function heroIconDataURL(hero) {
  const key = `icon:${hero.id}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const pal = { ...DEFAULT_HERO_PAL, ...hero.palette };
  // rows 1..6 of idle = head, cols 4..11
  for (let y = 1; y <= 6; y++) for (let x = 4; x <= 11; x++) {
    const ch = HERO_IDLE[y][x]; if (ch === '.') continue;
    ctx.fillStyle = pal[ch]; ctx.fillRect((x - 4) * 2, (y - 1) * 2 + 2, 2, 2);
  }
  const url = c.toDataURL(); cache.set(key, url); return url;
}
