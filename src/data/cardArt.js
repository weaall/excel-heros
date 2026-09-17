// Optional card illustrations. Drop PNG/WebP files into assets/cards/ and list them in assets/cards/manifest.json:
//   { "cards": { "ceo": "ceo.png", "coo": "coo.webp" } }
// Any hero with an entry gets the illustration on its card, portrait and gacha reveal; the rest keep pixel art.
// Recommended: 512×512 (or 3:4 portrait 384×512), bust-up, transparent or solid background — see docs/ART_PROMPTS.md.
const art = new Map(); const crops = new Map(); // id -> [x0, y0, x1, y1] fractions of the source to use
let version = ''; // manifest build stamp, appended to every art URL so regenerated files are never served from cache
export const artVersion = () => version;
const withV = (path) => (version ? `${path}?v=${version}` : path);

let onLoaded = null;
/** Progress callback (id, loadedCount) for the boot screen / lazy re-render. */
export const onCardArtLoaded = (fn) => { onLoaded = fn; };
export async function loadCardArt(url = 'assets/cards/manifest.json') {
  if (typeof document === 'undefined') return 0;
  try {
    const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) return 0;
    const manifest = await res.json(); const entries = Object.entries(manifest.cards ?? {});
    version = String(manifest.version ?? '');
    await Promise.all(entries.map(async ([id, spec]) => {
      const file = typeof spec === 'string' ? spec : spec.file; if (typeof spec === 'object' && spec.crop) crops.set(id, spec.crop);
      urls.set(id, withV(`assets/cards/${file}`));
      const src = typeof spec === 'object' && spec.thumb ? spec.thumb : file; // cards draw the small WebP; the full PNG is only opened on demand
      try {
        if (/.svg$/i.test(src)) { // SVG must go through an <img> (createImageBitmap rejects SVG blobs)
          const img = new Image(); img.decoding = 'async'; img.src = withV(`assets/cards/${src}`); await img.decode(); art.set(id, img); return;
        }
        const r = await fetch(withV(`assets/cards/${src}`)); if (!r.ok) return; art.set(id, await createImageBitmap(await r.blob()));
        onLoaded?.(id, art.size);
      }
      catch (e) { console.warn('[cardArt] failed', id, e); }
    }));
    return art.size;
  } catch { return 0; }
}
export const cardArt = (id) => art.get(id) ?? null;
export const cardCrop = (id) => crops.get(id) ?? null;
const urls = new Map();
/** URL of the original illustration file (for full-quality <img> display / lightbox). */
export const cardArtUrl = (id) => urls.get(id) ?? null;
export const hasCardArt = (id) => art.has(id);
/** URL for a def with an equipped skin: skin illustration if present, else the base one. */
export const cardArtUrlFor = (def) => (def?.skin ? urls.get(`${def.id}__${def.skin.id}`) : null) ?? urls.get(def?.id) ?? null;
/** Draw an illustration covering a box (object-fit: cover, anchored to the top so faces stay visible). */
export function drawArtCover(ctx, img, x, y, w, h, crop = null) {
  const [cx0, cy0, cx1, cy1] = crop ?? [0, 0, 1, 1];
  const sx = img.width * cx0, sy = img.height * cy0, sw = img.width * (cx1 - cx0), sh = img.height * (cy1 - cy0);
  const s = Math.max(w / sw, h / sh); const dw = sw * s, dh = sh * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y, dw, dh); ctx.restore();
}

/** Draw an illustration fitted inside a box (object-fit: contain, centred) — used for tall full-figure art. */
export function drawArtContain(ctx, img, x, y, w, h, crop = null) {
  const [cx0, cy0, cx1, cy1] = crop ?? [0, 0, 1, 1];
  const sx = img.width * cx0, sy = img.height * cy0, sw = img.width * (cx1 - cx0), sh = img.height * (cy1 - cy0);
  const s = Math.min(w / sw, h / sh); const dw = sw * s, dh = sh * s;
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); ctx.restore();
}
