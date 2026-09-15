// Per-hero skins on top of the 0x72 hero bases: instead of a global hue-rotate, the base's hair / cloth / accent
// colour clusters are swapped for the hero's own palette (shading preserved by lightness offset), and small
// pixel accessories (glasses, headset, crown, tie…) are stamped at anchors measured per base. Everything is
// built once per hero into a 9-frame strip (idle 4 · run 4 · hit 1) at native 16×28 and cached.

/** Base rows on the sheet: colour clusters + anchors (x, y in the 16×28 frame, frame 0). */
export const BASES = {
  elf_f:     { hair: ['#facb3e', '#ee8e2e'], cloth: ['#4ba747', '#3d734f'], accent: ['#da4e38'],            skin: '#fccba3', eye: [6, 17], top: 12, chin: 20, chest: 22 },
  elf_m:     { hair: ['#facb3e', '#ee8e2e'], cloth: ['#4ba747', '#3d734f'], accent: ['#da4e38', '#314152'], skin: '#fccba3', eye: [6, 15], top: 9,  chin: 18, chest: 21 },
  knight_f:  { hair: ['#dc4a7b', '#f78697'], cloth: ['#72d6ce', '#417089'], accent: [],                     skin: null,      eye: [7, 16], top: 12, chin: 19, chest: 22 },
  knight_m:  { hair: ['#da4e38', '#ee8e2e'], cloth: ['#72d6ce', '#417089'], accent: [],                     skin: null,      eye: [7, 16], top: 12, chin: 19, chest: 22 },
  wizzard_f: { hair: ['#5956bd'],            cloth: ['#5698cc'],            accent: [],                     skin: '#b58057', eye: [8, 17], top: 15, chin: 20, chest: 22 },
  wizzard_m: { hair: ['#5956bd'],            cloth: ['#5698cc'],            accent: [],                     skin: '#b58057', eye: [8, 18], top: 16, chin: 21, chest: 23 },
  lizard_f:  { hair: ['#9f294e', '#da4e38'], cloth: ['#49a790'],            accent: ['#8f4029', '#62232f'], skin: null,      eye: [6, 15], top: 12, chin: 18, chest: 20 },
  lizard_m:  { hair: ['#3d734f'],            cloth: ['#4ba747'],            accent: ['#775c55', '#483b3a'], skin: null,      eye: [6, 15], top: 12, chin: 18, chest: 20 },
  dwarf_f:   { hair: ['#facb3e', '#ee8e2e'], cloth: ['#dc4a7b', '#9f294e'], accent: [],                     skin: '#d8a57d', eye: [8, 18], top: 7,  chin: 20, chest: 22 },
  dwarf_m:   { hair: ['#da4e38', '#e46e33'], cloth: ['#7b8994', '#775c55'], accent: [],                     skin: '#d8a57d', eye: [8, 18], top: 7,  chin: 20, chest: 22 },
};
export const FRAMES = 9; // idle 0-3, run 4-7, hit 8
const FW = 16, FH = 28, SHEET_X = 128, SHEET_Y = 4, ROW_H = 32;

// --- colour helpers --------------------------------------------------------------------
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}
function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** Build a lookup: source colour -> target colour, keeping each source shade's lightness offset from the cluster's main colour. */
function clusterMap(cluster, targetHex) {
  const out = new Map(); if (!cluster.length || !targetHex) return out;
  const [th, ts, tl] = rgbToHsl(hexToRgb(targetHex)); const baseL = rgbToHsl(hexToRgb(cluster[0]))[2];
  for (const src of cluster) { const l = rgbToHsl(hexToRgb(src))[2]; out.set(src.toLowerCase(), hslToRgb([th, ts, Math.min(0.94, Math.max(0.08, tl + (l - baseL)))])); }
  return out;
}

// --- accessories (16×28 pixel stamps) -------------------------------------------------------
const DARK = [34, 34, 34], GOLD = [241, 196, 15], WHITE = [250, 250, 250], RED = [231, 76, 60];
/** Draw functions get (put, base, dy, pal) where put(x, y, rgb) sets one pixel and dy is the frame's vertical shift. */
const ACCESSORIES = {
  glasses: (put, b, dy, pal) => { const [ex, ey] = b.eye; for (let x = ex - 1; x <= ex + 3; x++) put(x, ey - 1 + dy, DARK); put(ex + 1, ey + dy, DARK); put(ex - 1, ey + dy, DARK); put(ex + 3, ey + dy, DARK); },
  sunglasses: (put, b, dy) => { const [ex, ey] = b.eye; for (let x = ex - 1; x <= ex + 3; x++) { put(x, ey + dy, [26, 26, 26]); put(x, ey + 1 + dy, [40, 40, 48]); } put(ex, ey + dy, [90, 90, 110]); },
  headset: (put, b, dy) => { const [ex, ey] = b.eye; for (let x = ex - 2; x <= ex + 4; x++) put(x, b.top - 1 + dy, [60, 60, 70]); put(ex + 4, ey + dy, [40, 40, 50]); put(ex + 4, ey + 1 + dy, [40, 40, 50]); put(ex + 5, ey + dy, [40, 40, 50]); put(ex + 5, ey + 1 + dy, [40, 40, 50]); },
  crown: (put, b, dy) => { const [ex] = b.eye; for (const x of [ex - 1, ex + 1, ex + 3]) put(x, b.top - 2 + dy, GOLD); for (let x = ex - 1; x <= ex + 3; x++) put(x, b.top - 1 + dy, GOLD); put(ex + 1, b.top - 1 + dy, RED); },
  hardhat: (put, b, dy) => { const [ex] = b.eye; const Y = [244, 208, 63], S = [183, 149, 11]; for (let x = ex - 1; x <= ex + 4; x++) { put(x, b.top - 2 + dy, Y); put(x, b.top - 1 + dy, Y); } for (let x = ex - 2; x <= ex + 5; x++) put(x, b.top + dy, S); },
  cap: (put, b, dy, pal) => { const [ex] = b.eye; const c = pal.P ?? [47, 61, 92]; for (let x = ex - 1; x <= ex + 4; x++) { put(x, b.top - 1 + dy, c); put(x, b.top + dy, c); } put(ex + 5, b.top + dy, c); put(ex + 6, b.top + dy, c); },
  tie: (put, b, dy, pal) => { const [ex] = b.eye; const c = pal.W; put(ex + 1, b.chest + dy, c); put(ex + 2, b.chest + dy, c); put(ex + 1, b.chest + 1 + dy, c); put(ex + 1, b.chest + 2 + dy, c); put(ex + 1, b.chest + 3 + dy, c); },
  lanyard: (put, b, dy, pal) => { const [ex] = b.eye; const c = pal.W; put(ex, b.chest - 1 + dy, c); put(ex + 3, b.chest - 1 + dy, c); put(ex + 1, b.chest + dy, c); put(ex + 2, b.chest + dy, c); put(ex + 1, b.chest + 1 + dy, WHITE); put(ex + 2, b.chest + 1 + dy, WHITE); },
  badge: (put, b, dy, pal) => { const [ex] = b.eye; put(ex + 4, b.chest + 1 + dy, WHITE); put(ex + 5, b.chest + 1 + dy, WHITE); put(ex + 4, b.chest + 2 + dy, pal.W); put(ex + 5, b.chest + 2 + dy, WHITE); },
  beard: (put, b, dy, pal) => { const [ex] = b.eye; const c = pal.H; for (let x = ex - 1; x <= ex + 4; x++) put(x, b.chin - 1 + dy, c); for (let x = ex; x <= ex + 3; x++) put(x, b.chin + dy, c); put(ex + 1, b.chin + 1 + dy, c); put(ex + 2, b.chin + 1 + dy, c); },
  mustache: (put, b, dy, pal) => { const [ex, ey] = b.eye; for (let x = ex - 1; x <= ex + 3; x++) put(x, ey + 2 + dy, pal.H); },
  coffee: (put, b, dy) => { const [ex] = b.eye; const x = ex + 6, y = b.chest + 1 + dy; put(x, y, WHITE); put(x + 1, y, WHITE); put(x, y + 1, WHITE); put(x + 1, y + 1, WHITE); put(x, y - 1, [110, 70, 40]); put(x + 1, y - 1, [110, 70, 40]); },
  flower: (put, b, dy) => { const [ex] = b.eye; const P = [253, 121, 168]; put(ex + 4, b.top + dy, P); put(ex + 5, b.top + dy, P); put(ex + 4, b.top + 1 + dy, P); put(ex + 5, b.top + 1 + dy, GOLD); },
  earring: (put, b, dy) => { const [ex, ey] = b.eye; put(ex + 5, ey + 2 + dy, GOLD); },
  scarf: (put, b, dy, pal) => { const [ex] = b.eye; for (let x = ex - 1; x <= ex + 4; x++) put(x, b.chest - 1 + dy, pal.W); put(ex + 4, b.chest + dy, pal.W); put(ex + 4, b.chest + 1 + dy, pal.W); },
  clipboard: (put, b, dy) => { const [ex] = b.eye; const x = ex + 5; for (let y = 0; y < 4; y++) { put(x, b.chest + y + dy, WHITE); put(x + 1, b.chest + y + dy, WHITE); } put(x, b.chest + dy, [120, 120, 120]); },
};
// props are hand-held or worn items we can also stamp
const PROPS = { files: 'clipboard', laptop: 'clipboard', tablet: 'clipboard', ledger: 'clipboard', calculator: 'clipboard', phone: 'badge', pen: null, hoodie: 'scarf', apron: 'scarf', briefcase: 'clipboard', parcel: 'clipboard', radio: 'badge', magnifier: null, suspenders: 'tie', watch: 'earring', cane: null, mop: null };

/** Vertical shift of frame `f` vs frame 0 (the run cycle bobs by a pixel). */
function topRow(px, f) { for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) if (px[((y * FW * FRAMES) + f * FW + x) * 4 + 3] > 10) return y; return 0; }

/**
 * Build the 9-frame strip for a hero. `sheet` is the 0x72 ImageBitmap; `entry` = HERO_MAP entry { base, hue }.
 * Returns a canvas (16*9 × 28). Falls back to a plain copy (+ hue) when the base has no cluster table.
 */
export function buildHeroStrip(sheet, def, entry) {
  const b = BASES[entry.base]; const row = Object.keys(BASES).indexOf(entry.base);
  const c = document.createElement('canvas'); c.width = FW * FRAMES; c.height = FH; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, SHEET_X, SHEET_Y + ROW_H * row, FW * FRAMES, FH, 0, 0, FW * FRAMES, FH);
  if (!b) return c;
  const img = ctx.getImageData(0, 0, c.width, c.height); const px = img.data;
  const pal = def.palette ?? {}; const look = def.look ?? {};
  const hairTarget = look.hair === 'bald' && b.skin ? b.skin : (pal.H ?? null);
  const map = new Map([...clusterMap(b.hair, hairTarget), ...clusterMap(b.cloth, pal.B ?? null), ...clusterMap(b.accent, pal.W ?? null)]);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 10) continue;
    const key = '#' + [px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    const t = map.get(key); if (t) { px[i] = t[0]; px[i + 1] = t[1]; px[i + 2] = t[2]; }
  }
  // accessories per frame, shifted with the frame's bob
  const base0 = topRow(px, 0);
  const rgbPal = { H: hexToRgb(pal.H ?? '#3b2a1a'), W: hexToRgb(pal.W ?? '#ffffff'), P: pal.P ? hexToRgb(pal.P) : null };
  // helmeted bases (no visible skin) skip facial hair — a beard on a visor reads wrong
  const kinds = [look.acc, look.acc2, PROPS[look.prop] ?? null].filter((k) => k && ACCESSORIES[k] && !(!b.skin && (k === 'beard' || k === 'mustache')));
  for (let f = 0; f < FRAMES; f++) {
    const dy = topRow(px, f) - base0;
    const put = (x, y, rgb) => { if (x < 0 || x >= FW || y < 0 || y >= FH) return; const i = ((y * FW * FRAMES) + f * FW + x) * 4; px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255; };
    for (const k of kinds) ACCESSORIES[k](put, b, dy, rgbPal);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export const ACCESSORY_KINDS = Object.keys(ACCESSORIES);
