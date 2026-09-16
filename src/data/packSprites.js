// Bundled CC0 pixel-art packs:
//  • 0x72 "16x16 DungeonTileset II" v1.7 (assets/sprites/0x72/sheet.png): heroes are 16x28 frames
//    (idle 4 · run 4 · hit 1) in 32px rows from (128, 4); monsters 16px-wide frames at x=368+16i
//    (idle 4 · run 4); big monsters 32px frames at x=16+32i; weapons in the x≈288..352 column.
//  • Clint Bellanger "Tiny Creatures" (assets/sprites/tiny-creatures/tilemap_packed.png): 180
//    single-frame 16x16 creatures on a 10-column grid.
// Everything on the 0x72 sheet faces right; monsters are mirrored to face the party.

import { buildHeroStrip } from './heroSkins.js';

const SHEET_URL = 'assets/sprites/0x72/sheet.png';
const TINY_URL = 'assets/sprites/tiny-creatures/tilemap_packed.png';
let sheet = null, tiny = null;
const cache = new Map();

async function loadBitmap(url) {
  const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob());
}
export async function loadPack() {
  if (typeof document === 'undefined') return false;
  try { [sheet, tiny] = await Promise.all([loadBitmap(SHEET_URL), loadBitmap(TINY_URL).catch(() => null)]); return true; }
  catch (e) { console.warn('[pack] failed to load', e); return false; }
}
export const packReady = () => !!sheet;

/** 16x16 dungeon tiles on the 0x72 sheet: [x, y] */
export const TILES = {
  wall_top: [32, 0], wall_mid: [32, 16], wall_left: [16, 16], wall_right: [48, 16], wall_hole1: [48, 32], wall_hole2: [48, 48],
  banner_red: [16, 32], banner_blue: [32, 32], banner_green: [16, 48], banner_yellow: [32, 48],
  fountain_top: [64, 0], fountain_mid: [64, 16], fountain_basin: [64, 32], column_top: [80, 80], column_mid: [80, 96], column_base: [80, 112],
  floor: [[16, 64], [32, 64], [48, 64], [16, 80], [32, 80], [48, 80], [16, 96], [32, 96]], edge: [96, 128],
};
export function drawTile(ctx, tile, dx, dy, size = 32) { if (!sheet) return false; const [sx, sy] = tile; ctx.drawImage(sheet, sx, sy, 16, 16, dx, dy, size, size); return true; }

// --- heroes ------------------------------------------------------------------------
const HERO_ROW = { elf_f: 0, elf_m: 1, knight_f: 2, knight_m: 3, wizzard_f: 4, wizzard_m: 5, lizard_f: 6, lizard_m: 7, dwarf_f: 8, dwarf_m: 9 };
/** weapon sprites on the sheet: [x, y, w, h] (handle at the bottom centre) */
const WEAPONS = {
  knight_sword: [339, 98, 10, 29], regular_sword: [323, 10, 10, 21], lavish_sword: [307, 129, 10, 30], golden_sword: [291, 137, 10, 22], katana: [293, 66, 6, 29],
  mace: [339, 39, 10, 24], big_hammer: [291, 26, 10, 37], axe: [341, 74, 9, 21],
  red_staff: [324, 129, 8, 30], green_staff: [340, 129, 8, 30], bow: [305, 195, 14, 26], spear: [309, 161, 6, 30],
};
const ROLE_WEAPON = { melee: 'knight_sword', tank: 'mace', ranged: 'bow', healer: 'green_staff' };
/** hero id → { base, hue, weapon? } */
export const HERO_MAP = {
  intern: { base: 'elf_m', hue: 0, weapon: 'regular_sword' }, staff: { base: 'elf_m', hue: 200 }, senior: { base: 'knight_m', hue: 0 }, manager: { base: 'knight_m', hue: 150, weapon: 'katana' },
  sales: { base: 'dwarf_m', hue: 0, weapon: 'lavish_sword' }, finance: { base: 'wizzard_m', hue: 0, weapon: 'red_staff' }, admin: { base: 'knight_m', hue: 40, weapon: 'big_hammer' },
  staff_park: { base: 'elf_m', hue: 160 }, parttime: { base: 'elf_f', hue: 0 }, guard: { base: 'knight_m', hue: 200 }, barista: { base: 'wizzard_f', hue: 120 },
  courier: { base: 'dwarf_m', hue: 40, weapon: 'axe' }, contract: { base: 'elf_f', hue: 200 }, vlookup: { base: 'wizzard_m', hue: 160, weapon: 'red_staff' }, pivot: { base: 'knight_m', hue: 90 },
  macro: { base: 'lizard_m', hue: 0 }, hr_jung: { base: 'wizzard_f', hue: 0 }, audit_han: { base: 'elf_m', hue: 300, weapon: 'katana' }, acct_lead: { base: 'wizzard_f', hue: 40, weapon: 'red_staff' },
  dev_lead: { base: 'lizard_f', hue: 200 }, ga_lead: { base: 'knight_m', hue: 260, weapon: 'big_hammer' }, welfare: { base: 'elf_f', hue: 300 }, cfo: { base: 'wizzard_m', hue: 270, weapon: 'red_staff' },
  cto: { base: 'lizard_m', hue: 300, weapon: 'lavish_sword' }, coo: { base: 'knight_f', hue: 200 }, ceo: { base: 'wizzard_f', hue: 45 }, chairman: { base: 'knight_m', hue: 45, weapon: 'golden_sword' },
  helpdesk: { base: 'elf_f', hue: 240 }, cleaner: { base: 'dwarf_f', hue: 0 }, sales_kang: { base: 'dwarf_m', hue: 320 }, legal_yoon: { base: 'knight_f', hue: 250 },
  pm_lead: { base: 'elf_f', hue: 120 }, design_lead: { base: 'wizzard_f', hue: 300 }, cmo: { base: 'elf_f', hue: 340 }, founder: { base: 'lizard_m', hue: 130 },
  intern_seo: { base: 'elf_f', hue: 0 }, pr_yoo: { base: 'dwarf_f', hue: 20 }, nurse_han: { base: 'wizzard_f', hue: 200 }, lab_park: { base: 'elf_f', hue: 210 }, chro: { base: 'knight_f', hue: 320 }, chairwoman: { base: 'knight_f', hue: 45 },
};

// --- monsters ----------------------------------------------------------------------
const SMALL = {
  tiny_zombie: [20, 12], goblin: [44, 12], imp: [66, 14], skelet: [88, 16], muddy: [112, 16], zombie: [136, 16], ice_zombie: [158, 18], zombie2: [182, 18],
  masked_orc: [207, 17], necromancer: [231, 17], orc_warrior: [254, 18], chort: [273, 23], wogol: [306, 14], pumpkin: [321, 23], hooded: [349, 19], slug: [375, 17],
};
const BIG = { big_zombie: [334, 34], ogre: [384, 32], big_demon: [428, 36] };
/** monster type id → 0x72 creature name, or { tiny: index } on the Tiny Creatures grid */
export const MONSTER_MAP = {
  circ: 'slug', merged: 'necromancer', ref: 'imp', virus: 'chort', ghost: 'skelet', sheet: 'wogol', chart: 'muddy', hourglass: 'zombie',
  lock: 'hooded', bug: 'goblin', cloud: 'ice_zombie', cursor: 'pumpkin',
  monkey: { tiny: 21 }, bull: { tiny: 122, big: true }, mushroom: { tiny: 14 }, eyeball: { tiny: 5 }, hand: { tiny: 6 }, golem: { tiny: 47, big: true }, flame: { tiny: 45 },
  orb: { tiny: 89 }, rabbit: { tiny: 133 }, chicken: { tiny: 149 }, cat: { tiny: 116 }, rat: { tiny: 92 }, snake: { tiny: 41 }, robot: { tiny: 80, big: true },
  boss: 'big_demon', boss_zombie: 'big_zombie', boss_ogre: 'ogre',
  // props: [x, y] of frame 0 on the sheet, 16x16 frames laid out to the right
  chest: { rect: [304, 416], frames: 3 }, mimic: { rect: [304, 432], frames: 3 },
};
/** Floor props (16x16 unless noted) used as scrolling dungeon decoration. */
export const PROPS = { crate: [288, 410, 16, 22], flask_red: [288, 336, 16, 16], flask_blue: [304, 336, 16, 16], flask_green: [320, 336, 16, 16], coin: [288, 384, 8, 8] };
export function drawProp(ctx, prop, dx, dy, scale = 2) { if (!sheet || !prop) return false; const [sx, sy, w, h] = prop; ctx.drawImage(sheet, sx, sy, w, h, dx, dy, w * scale, h * scale); return true; }
export const BOSS_CREATURE = 'big_demon';

// --- frame builders ------------------------------------------------------------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; return [c, ctx]; }

/**
 * 64x64 (× scale) hero frame.
 * anim: idle (4 frames) | walk (4, run) | attack (3: raise → swing → idle) | hit (1)
 */
const skinKey = (def) => (def.skin ? `@${def.skin.id}` : '');
export function packHeroFrame(def, anim = 'idle', frame = 0, scale = 1) {
  if (!sheet) return null;
  const m = HERO_MAP[def.id]; if (!m) return null;
  const row = HERO_ROW[m.base];
  let fi, swing = 0; // swing: weapon rotation in radians
  if (anim === 'walk') { fi = 4 + (frame % 4); swing = 0.35; }
  else if (anim === 'hit') { fi = 8; swing = 0.9; }
  else if (anim === 'attack') { const k = frame % 3; fi = [0, 6, 0][k]; swing = [-1.1, 1.5, 0.35][k]; }
  else { fi = frame % 4; swing = 0.35; }
  const key = `h:${def.id}${skinKey(def)}:${anim}:${fi}:${swing}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(64 * scale, 64 * scale);
  ctx.save(); ctx.scale(scale, scale);
  // per-hero skin strip: base recoloured to the hero palette + pixel accessories (heroSkins.js); no weapon overlays
  ctx.drawImage(heroStrip(def, m), 16 * fi, 0, 16, 28, 16, 4, 32, 56);
  ctx.restore();
  cache.set(key, c);
  return c;
}

/** Cached 9-frame recoloured strip for a hero (see heroSkins.js). */
function heroStrip(def, m) {
  const key = `strip:${def.id}${skinKey(def)}`; let s = cache.get(key);
  if (!s) { s = buildHeroStrip(sheet, def, m); cache.set(key, s); }
  return s;
}

/** Head icon (data URL) cropped from the idle frame. */
export function packHeroIcon(def) {
  if (!sheet) return null;
  const m = HERO_MAP[def.id]; if (!m) return null;
  const key = `icon:${def.id}${skinKey(def)}`;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(22, 22);
  ctx.drawImage(heroStrip(def, m), 0, 4, 16, 16, 3, 3, 16, 16);
  const url = c.toDataURL(); cache.set(key, url); return url;
}

/**
 * Tiny Creatures tiles carry a 2px dark outline, which reads twice as thick as the 0x72 heroes once both are
 * drawn at 2×. Thin it to 1px: dark pixels that touch transparency are the true outline and stay; dark pixels that
 * only touch that outline (the inner ring) take the colour of a neighbouring fill pixel. Dark details fully inside
 * the body (eyes, mouths) are untouched because they do not touch the outer ring. Cached per tile.
 */
const tinyCache = new Map();
function thinTinyTile(index, sx, sy) {
  let c = tinyCache.get(index); if (c) return c;
  const [cv, cx] = canvas(16, 16); cx.drawImage(tiny, sx, sy, 16, 16, 0, 0, 16, 16);
  const img = cx.getImageData(0, 0, 16, 16), d = img.data;
  const at = (x, y) => (x < 0 || y < 0 || x > 15 || y > 15 ? -1 : (y * 16 + x) * 4);
  const dark = (i) => i >= 0 && d[i + 3] > 40 && (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255 < 0.22;
  const clear = (i) => i < 0 || d[i + 3] <= 40;
  const N = (x, y) => [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
  const outer = new Set();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const i = at(x, y); if (dark(i) && N(x, y).some(clear)) outer.add(i); }
  const fills = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = at(x, y); if (!dark(i) || outer.has(i)) continue;
    const nb = N(x, y); if (!nb.some((j) => outer.has(j))) continue;             // not the inner ring (eye / mouth) → keep
    const fill = nb.find((j) => j >= 0 && !clear(j) && !dark(j));                 // a neighbouring body colour
    if (fill >= 0) fills.push([i, fill]);
  }
  for (const [i, f] of fills) { d[i] = d[f]; d[i + 1] = d[f + 1]; d[i + 2] = d[f + 2]; d[i + 3] = d[f + 3]; }
  cx.putImageData(img, 0, 0); tinyCache.set(index, cv); return cv;
}

/** Monster frame (idle cycle of 4). 0x72 creatures are mirrored to face left; Tiny Creatures bob. */
export function packMonsterFrame(mon, frame = 0, hueShift = 0) {
  if (!sheet) return null;
  const typeId = String(mon.id).split(':')[0];
  const spec = MONSTER_MAP[typeId];
  if (!spec) return null;
  const fi = frame % 4;
  const key = `m:${typeId}:${fi}:${hueShift}:${mon.elite ? 'e' : ''}:${mon.openFrame ?? 0}`;
  if (cache.has(key)) return cache.get(key);
  let c, ctx;
  if (typeof spec === 'object' && spec.rect) {
    // static prop sprite (chest): frame index selects the open-animation frame; not mirrored
    [c, ctx] = canvas(64, 64);
    const f = Math.min(spec.frames - 1, mon.openFrame ?? 0);
    ctx.filter = hueShift ? `hue-rotate(${hueShift}deg)` : 'none';
    ctx.drawImage(sheet, spec.rect[0] + 16 * f, spec.rect[1], 16, 16, 16, 28, 32, 32);
    ctx.filter = 'none';
  } else if (typeof spec === 'object' && spec.tiny != null) {
    if (!tiny) return null;
    [c, ctx] = canvas(64, 64);
    const sx = (spec.tiny % 10) * 16, sy = Math.floor(spec.tiny / 10) * 16;
    const bob = [0, -1, 0, 1][fi] * 2;
    // mirrored like the 0x72 creatures so every monster faces the party on the left; "big" types draw at 3× (48px)
    // so silhouettes differ in size as well as shape — always whole-number scales to keep pixels even
    const sc = spec.big ? 3 : 2, size = 16 * sc;
    ctx.save(); ctx.translate(64, 0); ctx.scale(-1, 1);
    ctx.filter = hueShift ? `hue-rotate(${hueShift}deg)` : 'none';
    ctx.drawImage(thinTinyTile(spec.tiny, sx, sy), 0, 0, 16, 16, (64 - size) / 2, 58 - size + bob, size, size);
    ctx.filter = 'none'; ctx.restore();
  } else {
    const small = SMALL[spec], big = BIG[spec];
    if (!small && !big) return null;
    const sw = big ? 32 : 16, sh = (big ?? small)[1], sx = big ? 16 + 32 * fi : 368 + 16 * fi, sy = (big ?? small)[0];
    const W = big ? 96 : 64, H = big ? 80 : 64;
    [c, ctx] = canvas(W, H);
    ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.filter = hueShift ? `hue-rotate(${hueShift}deg)` : 'none';
    ctx.drawImage(sheet, sx, sy, sw, sh, (W - sw * 2) / 2, H - 4 - sh * 2, sw * 2, sh * 2);
    ctx.restore();
  }
  if (mon.elite) { const cx = c.width / 2; ctx.fillStyle = '#f1c40f'; ctx.fillRect(cx - 9, 2, 18, 4); for (const x of [cx - 9, cx - 2, cx + 5]) ctx.fillRect(x, 0, 4, 3); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 5, 3, 2, 2); ctx.fillRect(cx + 3, 3, 2, 2); }
  cache.set(key, c);
  return c;
}
