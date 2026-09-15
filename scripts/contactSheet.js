// Browser helper: EH.contactSheet() renders every hero (idle frame, 4x) with names into an overlay for art review.
// Load from DevTools:  const m = await import('/scripts/contactSheet.js'); m.contactSheet();
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';
import { heroSprite } from '../src/data/sprites.js';

export function contactSheet(scale = 3, anim = 'idle', frame = 0) {
  document.getElementById('contact-sheet')?.remove();
  const defs = [...Object.values(MAIN_JOBS).map((j) => ({ ...j, id: j.id, name: j.title })), ...HEROES];
  const cols = 9, cell = 64 * scale + 8, rows = Math.ceil(defs.length / cols);
  const c = document.createElement('canvas'); c.id = 'contact-sheet'; c.width = cols * cell; c.height = rows * (cell + 18);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, 0, c.width, c.height);
  defs.forEach((d, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 18);
    ctx.fillStyle = i % 2 ? '#444' : '#3f3f3f'; ctx.fillRect(x, y, cell, cell + 18);
    const img = heroSprite(d, anim, frame); ctx.drawImage(img, 0, 0, img.width, img.height, x + 4, y + 4, 64 * scale, 64 * scale);
    ctx.fillStyle = '#fff'; ctx.font = '12px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${d.name} (${d.grade})`, x + cell / 2, y + cell + 12);
  });
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 9999, maxWidth: '100vw', maxHeight: '100vh', imageRendering: 'pixelated' });
  document.body.appendChild(c);
  return c;
}
if (typeof window !== 'undefined') window.EH = Object.assign(window.EH ?? {}, { contactSheet });
