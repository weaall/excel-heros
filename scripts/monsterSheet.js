// Browser helper: renders every monster (and every boss) side by side for pixel-art review.
// DevTools:  const m = await import('/scripts/monsterSheet.js'); m.monsterSheet();
import { MONSTER_TYPES, BOSSES, CHEST, MIMIC, PALETTES } from '../src/data/monsters.js';
import { monsterSprite } from '../src/data/sprites.js';

export function monsterSheet(scale = 3, frame = 0, paletteIdx = 5) {
  document.getElementById('monster-sheet')?.remove();
  const pal = PALETTES[paletteIdx];
  const defs = [
    ...MONSTER_TYPES.map((t) => ({ ...t, palette: { M: pal.M, D: pal.D, E: pal.E }, _label: t.name })),
    ...BOSSES.map((b) => ({ ...b, _label: b.name, _boss: true })),
    { ...CHEST, _label: '보물 상자' }, { ...MIMIC, _label: '미믹' },
  ];
  const cols = 7, cell = 48 * scale + 10, rows = Math.ceil(defs.length / cols);
  const c = document.createElement('canvas'); c.id = 'monster-sheet';
  c.width = cols * cell; c.height = rows * (cell + 18);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#2f2f2f'; ctx.fillRect(0, 0, c.width, c.height);
  defs.forEach((d, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 18);
    ctx.fillStyle = i % 2 ? '#3a3a3a' : '#343434'; ctx.fillRect(x, y, cell, cell + 18);
    const img = monsterSprite(d, frame);
    if (img) {
      const s = Math.min((cell - 8) / img.width, (cell - 8) / img.height);
      const w = Math.round(img.width * s), h = Math.round(img.height * s);
      ctx.drawImage(img, 0, 0, img.width, img.height, x + Math.round((cell - w) / 2), y + (cell - 4 - h), w, h);
    }
    ctx.fillStyle = d._boss ? '#ffd166' : '#fff'; ctx.font = '11px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d._label, x + cell / 2, y + cell + 12);
  });
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 9999, maxWidth: '100vw', maxHeight: '100vh', imageRendering: 'pixelated', background: '#2f2f2f' });
  document.body.appendChild(c);
  return c;
}
if (typeof window !== 'undefined') window.EH = Object.assign(window.EH ?? {}, { monsterSheet });
