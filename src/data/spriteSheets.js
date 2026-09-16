// Optional hand-made sprite sheets. Drop PNGs into assets/sprites/ and list them in
// assets/sprites/manifest.json; matching heroes / monsters use the sheet instead of the
// procedural art. See assets/sprites/README.md for the frame layout.
//
// manifest.json:
// { "sheets": [
//   { "id": "vlookup", "file": "vlookup.png", "frameW": 64, "frameH": 64,
//     "anims": { "idle": [[0,0],[1,0]], "walk": [[0,1],[1,1],[2,1],[3,1]], "attack": [[0,2],[1,2],[2,2]] } },
//   { "id": "m:circ", "file": "circ.png", "frameW": 64, "frameH": 64, "anims": { "idle": [[0,0],[1,0]] } }
// ] }
// Hero ids match data/heroes.js (main-hero jobs: intern, staff, {sales,finance,admin}_senior/_manager, sales, finance, admin).
// Monster ids are "m:" + MONSTER_TYPES id (palette variants share one sheet); the boss is "m:boss".

const sheets = new Map();
const frameCache = new Map();

export async function loadSpriteSheets(url = 'assets/sprites/manifest.json') {
  let manifest;
  try { const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) return 0; manifest = await res.json(); }
  catch { return 0; }
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const jobs = (manifest.sheets ?? []).map((s) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sheets.set(s.id, { ...s, img }); resolve(true); };
    img.onerror = () => { console.warn('[sprites] failed to load', s.file); resolve(false); };
    img.src = base + s.file;
  }));
  const results = await Promise.all(jobs);
  return results.filter(Boolean).length;
}

export const hasSheet = (id) => sheets.has(id);

/** Returns a 64x64 (or frameW x frameH) canvas for the frame, scaled by `scale`, or null. */
export function sheetFrame(id, anim, frame, scale = 1) {
  const s = sheets.get(id); if (!s) return null;
  const frames = s.anims?.[anim] ?? s.anims?.idle; if (!frames?.length) return null;
  const [fx, fy] = frames[frame % frames.length];
  const key = `${id}|${fx},${fy}|${scale}`;
  const hit = frameCache.get(key); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = s.frameW * scale; c.height = s.frameH * scale;
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.img, fx * s.frameW, fy * s.frameH, s.frameW, s.frameH, 0, 0, c.width, c.height);
  frameCache.set(key, c);
  return c;
}
