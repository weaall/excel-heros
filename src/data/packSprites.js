// Bundled CC0 pixel-art pack: 0x72's "16x16 DungeonTileset II" v1.7 (assets/sprites/0x72/sheet.png).
// Heroes are 16x28 frames (idle 4 · run 4 · hit 1) in rows of 32px starting at (128, 4);
// monsters are 16px-wide frames (idle 4 · run 4) at x=368+16i on rows of varying height;
// big monsters are 32px frames at x=16+32i. Everything already faces right; monsters are
// mirrored to face the party. Per-character hue rotation gives 28 heroes from 10 bases.

const SHEET_URL = 'assets/sprites/0x72/sheet.png';
let sheet = null;                 // ImageBitmap | HTMLImageElement
const cache = new Map();

export async function loadPack(url = SHEET_URL) {
  if (typeof document === 'undefined') return false;
  try {
    const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) return false;
    const blob = await res.blob();
    sheet = await createImageBitmap(blob);
    return true;
  } catch (e) { console.warn('[pack] failed to load', e); return false; }
}
export const packReady = () => !!sheet;

// --- hero rows on the sheet ------------------------------------------------
const HERO_ROW = { elf_f: 0, elf_m: 1, knight_f: 2, knight_m: 3, wizzard_f: 4, wizzard_m: 5, lizard_f: 6, lizard_m: 7, dwarf_f: 8, dwarf_m: 9 };
/** hero id → { base, hue } (hue in degrees, rotates the whole sprite) */
export const HERO_MAP = {
  // main hero job tree
  intern: { base: 'elf_m', hue: 0 }, staff: { base: 'elf_m', hue: 200 }, senior: { base: 'knight_m', hue: 0 }, manager: { base: 'knight_m', hue: 150 },
  sales: { base: 'dwarf_m', hue: 0 }, finance: { base: 'wizzard_m', hue: 0 }, admin: { base: 'knight_m', hue: 40 },
  // roster
  staff_park: { base: 'elf_m', hue: 160 }, parttime: { base: 'elf_f', hue: 0 }, guard: { base: 'knight_m', hue: 200 }, barista: { base: 'wizzard_f', hue: 120 },
  courier: { base: 'dwarf_m', hue: 40 }, contract: { base: 'elf_f', hue: 200 }, vlookup: { base: 'wizzard_m', hue: 160 }, pivot: { base: 'knight_f', hue: 90 },
  macro: { base: 'lizard_m', hue: 0 }, hr_jung: { base: 'wizzard_f', hue: 0 }, audit_han: { base: 'elf_m', hue: 300 }, acct_lead: { base: 'wizzard_f', hue: 40 },
  dev_lead: { base: 'lizard_f', hue: 200 }, ga_lead: { base: 'knight_m', hue: 260 }, welfare: { base: 'elf_f', hue: 300 }, cfo: { base: 'wizzard_m', hue: 270 },
  cto: { base: 'lizard_m', hue: 300 }, coo: { base: 'knight_f', hue: 200 }, ceo: { base: 'wizzard_m', hue: 45 }, chairman: { base: 'knight_m', hue: 45 },
};

// --- monsters ------------------------------------------------------------------
// small rows: [y0, height] on the sheet, frames at x = 368 + 16*i (0-3 idle, 4-7 run)
const SMALL = {
  tiny_zombie: [20, 12], goblin: [44, 12], imp: [66, 14], skelet: [88, 16], muddy: [112, 16], zombie: [136, 16], ice_zombie: [158, 18], zombie2: [182, 18],
  masked_orc: [207, 17], necromancer: [231, 17], orc_warrior: [254, 18], chort: [273, 23], wogol: [306, 14], pumpkin: [321, 23], hooded: [349, 19], slug: [375, 17],
};
const BIG = { big_zombie: [334, 34], ogre: [384, 32], big_demon: [428, 36] };
/** monster type id → sheet creature */
export const MONSTER_MAP = {
  circ: 'slug', merged: 'necromancer', ref: 'imp', virus: 'chort', ghost: 'skelet', sheet: 'wogol', chart: 'muddy', hourglass: 'zombie',
  lock: 'hooded', bug: 'goblin', cloud: 'ice_zombie', cursor: 'pumpkin', monkey: 'masked_orc', bull: 'orc_warrior',
};
export const BOSS_CREATURE = 'big_demon';

// --- frame builders -----------------------------------------------------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; return [c, ctx]; }

/**
 * 64x64 (× scale) hero frame. anim: idle (4 frames) | walk (4, run) | attack (3: hit, run, idle)
 * The 16x28 sprite is drawn at 2x, bottom-aligned (feet at y≈60).
 */
export function packHeroFrame(def, anim = 'idle', frame = 0, scale = 1) {
  if (!sheet) return null;
  const m = HERO_MAP[def.id]; if (!m) return null;
  const row = HERO_ROW[m.base];
  let fi;
  if (anim === 'walk') fi = 4 + (frame % 4);
  else if (anim === 'attack') fi = [8, 6, 0][frame % 3];
  else fi = frame % 4;
  const key = `h:${def.id}:${fi}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(64 * scale, 64 * scale);
  ctx.filter = m.hue ? `hue-rotate(${m.hue}deg)` : 'none';
  ctx.drawImage(sheet, 128 + 16 * fi, 4 + 32 * row, 16, 28, 16 * scale, 4 * scale, 32 * scale, 56 * scale);
  ctx.filter = 'none';
  cache.set(key, c);
  return c;
}

/** Head icon (data URL) cropped from the idle frame. */
export function packHeroIcon(def) {
  if (!sheet) return null;
  const m = HERO_MAP[def.id]; if (!m) return null;
  const key = `icon:${def.id}`;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(22, 22);
  ctx.filter = m.hue ? `hue-rotate(${m.hue}deg)` : 'none';
  ctx.drawImage(sheet, 128, 4 + 32 * HERO_ROW[m.base] + 4, 16, 16, 3, 3, 16, 16);
  const url = c.toDataURL(); cache.set(key, url); return url;
}

/** Monster frame (idle cycle of 4). Mirrored to face left; small ones drawn at 2x, big at 2x too. hueShift recolours per phase. */
export function packMonsterFrame(mon, frame = 0, hueShift = 0) {
  if (!sheet) return null;
  const typeId = String(mon.id).split(':')[0];
  const isBoss = typeId === 'boss';
  const name = isBoss ? BOSS_CREATURE : MONSTER_MAP[typeId];
  if (!name) return null;
  const small = SMALL[name], big = BIG[name];
  if (!small && !big) return null;
  const fi = frame % 4;
  const key = `m:${name}:${fi}:${hueShift}:${mon.elite ? 'e' : ''}`;
  if (cache.has(key)) return cache.get(key);
  const sw = big ? 32 : 16, sh = (big ?? small)[1], sx = big ? 16 + 32 * fi : 368 + 16 * fi, sy = (big ?? small)[0];
  const W = big ? 96 : 64, H = big ? 80 : 64;
  const [c, ctx] = canvas(W, H);
  ctx.save();
  ctx.translate(W, 0); ctx.scale(-1, 1); // face left
  ctx.filter = hueShift ? `hue-rotate(${hueShift}deg)` : 'none';
  const dw = sw * 2, dh = sh * 2;
  ctx.drawImage(sheet, sx, sy, sw, sh, (W - dw) / 2, H - 4 - dh, dw, dh);
  ctx.restore();
  if (mon.elite) { ctx.fillStyle = '#f1c40f'; const cx = W / 2; ctx.fillRect(cx - 9, 2, 18, 4); for (const x of [cx - 9, cx - 2, cx + 5]) ctx.fillRect(x, 0, 4, 3); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 5, 3, 2, 2); ctx.fillRect(cx + 3, 3, 2, 2); }
  cache.set(key, c);
  return c;
}
