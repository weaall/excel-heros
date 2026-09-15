// Optional card illustrations. Drop PNG/WebP files into assets/cards/ and list them in assets/cards/manifest.json:
//   { "cards": { "ceo": "ceo.png", "coo": "coo.webp" } }
// Any hero with an entry gets the illustration on its card, portrait and gacha reveal; the rest keep pixel art.
// Recommended: 512×512 (or 3:4 portrait 384×512), bust-up, transparent or solid background — see docs/ART_PROMPTS.md.
const art = new Map(); const crops = new Map(); // id -> [x0, y0, x1, y1] fractions of the source to use

export async function loadCardArt(url = 'assets/cards/manifest.json') {
  if (typeof document === 'undefined') return 0;
  try {
    const res = await fetch(url, { cache: 'no-store' }); if (!res.ok) return 0;
    const manifest = await res.json(); const entries = Object.entries(manifest.cards ?? {});
    await Promise.all(entries.map(async ([id, spec]) => {
      const file = typeof spec === 'string' ? spec : spec.file; if (typeof spec === 'object' && spec.crop) crops.set(id, spec.crop);
      try {
        if (/.svg$/i.test(file)) { // SVG must go through an <img> (createImageBitmap rejects SVG blobs)
          const img = new Image(); img.decoding = 'async'; img.src = `assets/cards/${file}`; await img.decode(); art.set(id, img); return;
        }
        const r = await fetch(`assets/cards/${file}`); if (!r.ok) return; art.set(id, await createImageBitmap(await r.blob()));
      }
      catch (e) { console.warn('[cardArt] failed', id, e); }
    }));
    return art.size;
  } catch { return 0; }
}
export const cardArt = (id) => art.get(id) ?? null;
export const cardCrop = (id) => crops.get(id) ?? null;
export const hasCardArt = (id) => art.has(id);
/** Draw an illustration covering a box (object-fit: cover, anchored to the top so faces stay visible). */
export function drawArtCover(ctx, img, x, y, w, h, crop = null) {
  const [cx0, cy0, cx1, cy1] = crop ?? [0, 0, 1, 1];
  const sx = img.width * cx0, sy = img.height * cy0, sw = img.width * (cx1 - cx0), sh = img.height * (cy1 - cy0);
  const s = Math.max(w / sw, h / sh); const dw = sw * s, dh = sh * s;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, sw, sh, x + (w - dw) / 2, y, dw, dh); ctx.restore();
}
