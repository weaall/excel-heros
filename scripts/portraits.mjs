// Generates bust-up character portraits as SVG (512×512) for every hero and main-hero job into assets/cards/,
// and writes assets/cards/manifest.json. Style: clean anime/chibi bust-up — big expressive eyes, layered hair with
// shine, office outfit in the hero palette, per-look accessories, grade-coloured background with sparkles.
// Usage: node scripts/portraits.mjs      (re-run after editing heroes.js / profiles.js)
import fs from 'node:fs';
import { HEROES, MAIN_JOBS, GRADES } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';

const W = 512, H = 512;
const cx = 256;            // face centre x
const FACE = { top: 112, cheekY: 250, chin: 372, halfW: 112 }; // face outline
const EYE_Y = 258, EYE_DX = 50;
const NECK = { top: 350, bottom: 402, halfW: 30 };

// ---------------------------------------------------------------- colour helpers
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const shade = (hex, k) => { const [r, g, b] = hexToRgb(hex); return k >= 0 ? rgbToHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : rgbToHex(r * (1 + k), g * (1 + k), b * (1 + k)); };
const lum = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

// ---------------------------------------------------------------- pieces
function background(grade, id) {
  const g = GRADES[grade]; const base = g.color;
  const spark = grade === 'S' || grade === 'A' ? Array.from({ length: 14 }, (_, i) => { const a = (i * 137.5 + id.length * 31) % 360, r = 150 + ((i * 53) % 90); const x = cx + Math.cos(a * Math.PI / 180) * r, y = 200 + Math.sin(a * Math.PI / 180) * r * 0.9; const s = 4 + (i % 3) * 3; return `<path d="M${x} ${y - s} L${x + s * 0.35} ${y - s * 0.35} L${x + s} ${y} L${x + s * 0.35} ${y + s * 0.35} L${x} ${y + s} L${x - s * 0.35} ${y + s * 0.35} L${x - s} ${y} L${x - s * 0.35} ${y - s * 0.35} Z" fill="${grade === 'S' ? '#fff3b0' : '#f3e5ff'}" opacity="${0.55 + (i % 2) * 0.35}"/>`; }).join('') : '';
  return `
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${shade(base, 0.72)}"/><stop offset="0.6" stop-color="${shade(base, 0.35)}"/><stop offset="1" stop-color="${shade(base, -0.05)}"/></radialGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="1"><stop offset="0.35" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.22"/><stop offset="0.65" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="frame"><rect width="${W}" height="${H}" rx="26"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#band)"/>
    <g opacity="0.12" stroke="#fff">${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 64}" y1="0" x2="${i * 64}" y2="${H}"/>`).join('')}${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 48}" x2="${W}" y2="${i * 48}"/>`).join('')}</g>
    <circle cx="${cx}" cy="250" r="190" fill="#fff" opacity="0.18"/>
    ${spark}
  </g>`;
}

function torso(def, look, pal, gender) {
  const B = pal.B, dark = shade(B, -0.28), light = shade(B, 0.18);
  const shoulder = gender === 'F' ? 150 : 172, top = 418;
  const body = `M${cx - shoulder} ${H + 10} C${cx - shoulder} ${top + 40} ${cx - shoulder + 40} ${top} ${cx - 70} ${top - 6} L${cx - NECK.halfW - 10} ${NECK.bottom - 8} L${cx + NECK.halfW + 10} ${NECK.bottom - 8} L${cx + 70} ${top - 6} C${cx + shoulder - 40} ${top} ${cx + shoulder} ${top + 40} ${cx + shoulder} ${H + 10} Z`;
  let g = `<path d="${body}" fill="${B}"/>`;
  g += `<path d="${body}" fill="url(#bodyShade)"/>`;
  const exec = ['A', 'S'].includes(def.grade) || /lead|cfo|cto|coo|ceo|chairman|manager|sales|finance|admin|founder|cmo|pm_lead/.test(def.id);
  // shirt / collar
  g += `<path d="M${cx - 62} ${top - 2} L${cx - NECK.halfW - 6} ${NECK.bottom - 6} L${cx} ${NECK.bottom + 44} L${cx + NECK.halfW + 6} ${NECK.bottom - 6} L${cx + 62} ${top - 2} L${cx + 40} ${H} L${cx - 40} ${H} Z" fill="#ffffff"/>`;
  g += `<path d="M${cx - NECK.halfW - 6} ${NECK.bottom - 6} L${cx - 58} ${NECK.bottom + 40} L${cx - 6} ${NECK.bottom + 30} Z M${cx + NECK.halfW + 6} ${NECK.bottom - 6} L${cx + 58} ${NECK.bottom + 40} L${cx + 6} ${NECK.bottom + 30} Z" fill="#f1f2f6" stroke="#d9dbe3" stroke-width="2"/>`;
  if (exec) { // blazer lapels
    g += `<path d="M${cx - 72} ${top - 6} L${cx - 20} ${NECK.bottom + 78} L${cx - 62} ${H} L${cx - 150} ${H} Z" fill="${dark}"/><path d="M${cx + 72} ${top - 6} L${cx + 20} ${NECK.bottom + 78} L${cx + 62} ${H} L${cx + 150} ${H} Z" fill="${dark}"/>`;
    g += `<path d="M${cx - 72} ${top - 6} L${cx - 20} ${NECK.bottom + 78} L${cx - 40} ${NECK.bottom + 40} Z" fill="${light}" opacity="0.5"/>`;
  }
  const items = [look.acc, look.acc2, look.prop];
  if (items.includes('tie') || items.includes('suspenders')) g += `<path d="M${cx - 12} ${NECK.bottom + 28} L${cx + 12} ${NECK.bottom + 28} L${cx + 16} ${H} L${cx - 16} ${H} Z" fill="${pal.W}"/><path d="M${cx - 12} ${NECK.bottom + 28} L${cx + 12} ${NECK.bottom + 28} L${cx} ${NECK.bottom + 46} Z" fill="${shade(pal.W, -0.3)}"/>`;
  if (items.includes('lanyard')) g += `<path d="M${cx - 26} ${NECK.bottom + 6} L${cx - 6} ${NECK.bottom + 96} M${cx + 26} ${NECK.bottom + 6} L${cx + 6} ${NECK.bottom + 96}" stroke="${pal.W}" stroke-width="6" fill="none"/><rect x="${cx - 26}" y="${NECK.bottom + 92}" width="52" height="34" rx="4" fill="#fff" stroke="#c9ccd6" stroke-width="2"/><rect x="${cx - 18}" y="${NECK.bottom + 100}" width="16" height="16" rx="2" fill="${shade(pal.W, 0.3)}"/><rect x="${cx + 2}" y="${NECK.bottom + 102}" width="18" height="3" fill="#b0b4c0"/><rect x="${cx + 2}" y="${NECK.bottom + 110}" width="14" height="3" fill="#b0b4c0"/>`;
  if (items.includes('badge')) g += `<rect x="${cx + 62}" y="${NECK.bottom + 40}" width="46" height="26" rx="4" fill="#fff" stroke="#c9ccd6" stroke-width="2"/><rect x="${cx + 68}" y="${NECK.bottom + 48}" width="24" height="4" fill="${pal.W}"/><rect x="${cx + 68}" y="${NECK.bottom + 56}" width="16" height="3" fill="#b0b4c0"/>`;
  if (items.includes('apron')) g += `<path d="M${cx - 70} ${H} L${cx - 70} ${NECK.bottom + 70} Q${cx} ${NECK.bottom + 40} ${cx + 70} ${NECK.bottom + 70} L${cx + 70} ${H} Z" fill="${shade(pal.P ?? '#3e2723', 0.1)}"/><path d="M${cx - 56} ${NECK.bottom + 70} L${cx - 40} ${NECK.bottom - 2} M${cx + 56} ${NECK.bottom + 70} L${cx + 40} ${NECK.bottom - 2}" stroke="${shade(pal.P ?? '#3e2723', 0.1)}" stroke-width="10" fill="none"/>`;
  if (items.includes('hoodie')) g += `<path d="M${cx - 96} ${top + 10} Q${cx} ${NECK.bottom + 60} ${cx + 96} ${top + 10} L${cx + 84} ${top + 40} Q${cx} ${NECK.bottom + 88} ${cx - 84} ${top + 40} Z" fill="${dark}"/><path d="M${cx - 14} ${NECK.bottom + 60} L${cx - 10} ${H} M${cx + 14} ${NECK.bottom + 60} L${cx + 10} ${H}" stroke="#fff" stroke-width="5" fill="none"/>`;
  if (items.includes('scarf')) g += `<path d="M${cx - 70} ${NECK.bottom - 4} Q${cx} ${NECK.bottom + 50} ${cx + 70} ${NECK.bottom - 4} L${cx + 74} ${NECK.bottom + 30} Q${cx} ${NECK.bottom + 84} ${cx - 74} ${NECK.bottom + 30} Z" fill="${pal.W}"/>`;
  return g;
}

function face(pal, gender, skin) {
  const f = FACE; const chin = gender === 'F' ? f.chin - 6 : f.chin;
  const outline = `M${cx - f.halfW} ${f.cheekY - 40} C${cx - f.halfW - 4} ${f.cheekY + 50} ${cx - 64} ${chin - 8} ${cx} ${chin} C${cx + 64} ${chin - 8} ${cx + f.halfW + 4} ${f.cheekY + 50} ${cx + f.halfW} ${f.cheekY - 40} C${cx + f.halfW} ${f.top + 20} ${cx + 70} ${f.top - 10} ${cx} ${f.top - 10} C${cx - 70} ${f.top - 10} ${cx - f.halfW} ${f.top + 20} ${cx - f.halfW} ${f.cheekY - 40} Z`;
  let g = `<rect x="${cx - NECK.halfW}" y="${NECK.top}" width="${NECK.halfW * 2}" height="${NECK.bottom - NECK.top + 20}" fill="${shade(skin, -0.12)}"/>`;
  g += `<path d="${outline}" fill="${skin}"/>`;
  g += `<path d="${outline}" fill="url(#faceShade)"/>`;
  // ears
  g += `<ellipse cx="${cx - f.halfW - 2}" cy="${f.cheekY + 6}" rx="12" ry="18" fill="${skin}"/><ellipse cx="${cx + f.halfW + 2}" cy="${f.cheekY + 6}" rx="12" ry="18" fill="${skin}"/>`;
  // blush
  g += `<ellipse cx="${cx - 66}" cy="${EYE_Y + 42}" rx="22" ry="10" fill="#ff8fa3" opacity="${gender === 'F' ? 0.38 : 0.2}"/><ellipse cx="${cx + 66}" cy="${EYE_Y + 42}" rx="22" ry="10" fill="#ff8fa3" opacity="${gender === 'F' ? 0.38 : 0.2}"/>`;
  return g;
}

function eyes(pal, gender, irisHex) {
  const rx = gender === 'F' ? 24 : 21, ry = gender === 'F' ? 30 : 24;
  let g = '';
  for (const s of [-1, 1]) {
    const ex = cx + s * EYE_DX, ey = EYE_Y;
    g += `<ellipse cx="${ex}" cy="${ey}" rx="${rx}" ry="${ry}" fill="#fff"/>`;
    g += `<ellipse cx="${ex + s * 2}" cy="${ey + 3}" rx="${rx * 0.66}" ry="${ry * 0.78}" fill="${irisHex}"/>`;
    g += `<ellipse cx="${ex + s * 2}" cy="${ey + 8}" rx="${rx * 0.5}" ry="${ry * 0.5}" fill="${shade(irisHex, -0.45)}"/>`;
    g += `<ellipse cx="${ex + s * 2}" cy="${ey + 5}" rx="${rx * 0.3}" ry="${ry * 0.42}" fill="#1a1a1a"/>`;
    g += `<circle cx="${ex - 8}" cy="${ey - 10}" r="7" fill="#fff"/><circle cx="${ex + 8}" cy="${ey + 10}" r="3.5" fill="#fff" opacity="0.9"/>`;
    // upper lid / lashes
    g += `<path d="M${ex - rx - 4} ${ey - 4} Q${ex} ${ey - ry - 12} ${ex + rx + 4} ${ey - 6}" stroke="#2b1d16" stroke-width="${gender === 'F' ? 7 : 5}" fill="none" stroke-linecap="round"/>`;
    if (gender === 'F') g += `<path d="M${ex + s * (rx + 2)} ${ey - 8} l${s * 10} -8 M${ex + s * (rx - 2)} ${ey - 18} l${s * 8} -9" stroke="#2b1d16" stroke-width="4" stroke-linecap="round"/>`;
    // brow
    g += `<path d="M${ex - rx} ${ey - ry - 22} Q${ex} ${ey - ry - (gender === 'F' ? 30 : 34)} ${ex + rx} ${ey - ry - 22}" stroke="${shade(pal.H, -0.35)}" stroke-width="${gender === 'F' ? 5 : 8}" fill="none" stroke-linecap="round"/>`;
  }
  return g;
}

function mouth(gender, mood = 'smile') {
  const y = EYE_Y + 62;
  if (mood === 'grin') return `<path d="M${cx - 18} ${y} Q${cx} ${y + 24} ${cx + 18} ${y}" fill="#c0392b"/><path d="M${cx - 14} ${y + 2} Q${cx} ${y + 12} ${cx + 14} ${y + 2}" fill="#fff"/>`;
  if (mood === 'flat') return `<path d="M${cx - 14} ${y + 4} L${cx + 14} ${y + 4}" stroke="#b5544a" stroke-width="5" stroke-linecap="round"/>`;
  return `<path d="M${cx - 16} ${y} Q${cx} ${y + 18} ${cx + 16} ${y}" stroke="${gender === 'F' ? '#d9536f' : '#b5544a'}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}

function hair(look, pal, gender) {
  const Hc = pal.H, hi = shade(Hc, 0.35), lo = shade(Hc, -0.3);
  let style = look.hair ?? 'short'; const f = FACE;
  if (gender === 'F' && (style === 'short' || style === 'grey')) style = 'bob';
  const top = f.top - 10;
  let back = '', front = '';
  const dome = `M${cx - f.halfW - 14} ${f.cheekY - 30} C${cx - f.halfW - 18} ${top - 24} ${cx - 60} ${top - 44} ${cx} ${top - 44} C${cx + 60} ${top - 44} ${cx + f.halfW + 18} ${top - 24} ${cx + f.halfW + 14} ${f.cheekY - 30} Z`;
  if (style === 'bald') {
    return `<path d="M${cx - 60} ${top + 4} Q${cx} ${top - 20} ${cx + 60} ${top + 4}" stroke="#fff" stroke-width="10" opacity="0.35" fill="none" stroke-linecap="round"/>`;
  }
  // back hair
  if (style === 'long') back = `<path d="M${cx - f.halfW - 26} ${f.cheekY - 40} C${cx - f.halfW - 40} ${350} ${cx - 150} ${430} ${cx - 120} ${470} L${cx + 120} ${470} C${cx + 150} ${430} ${cx + f.halfW + 40} ${350} ${cx + f.halfW + 26} ${f.cheekY - 40} Z" fill="${lo}"/>`;
  else if (style === 'bob') back = `<path d="M${cx - f.halfW - 22} ${f.cheekY - 40} C${cx - f.halfW - 30} ${330} ${cx - f.halfW - 10} ${372} ${cx - 70} ${380} L${cx + 70} ${380} C${cx + f.halfW + 10} ${372} ${cx + f.halfW + 30} ${330} ${cx + f.halfW + 22} ${f.cheekY - 40} Z" fill="${lo}"/>`;
  else if (style === 'curly') back = Array.from({ length: 9 }, (_, i) => { const a = Math.PI + (i / 8) * Math.PI; const x = cx + Math.cos(a) * (f.halfW + 24), y = f.cheekY - 40 + Math.sin(a) * 150; return `<circle cx="${x}" cy="${y}" r="34" fill="${lo}"/>`; }).join('') + `<path d="M${cx - f.halfW - 30} ${f.cheekY - 30} L${cx - f.halfW - 30} ${f.cheekY + 40} Q${cx - f.halfW - 6} ${f.cheekY + 70} ${cx - f.halfW + 10} ${f.cheekY + 40} L${cx - f.halfW + 10} ${f.cheekY - 30} Z M${cx + f.halfW + 30} ${f.cheekY - 30} L${cx + f.halfW + 30} ${f.cheekY + 40} Q${cx + f.halfW + 6} ${f.cheekY + 70} ${cx + f.halfW - 10} ${f.cheekY + 40} L${cx + f.halfW - 10} ${f.cheekY - 30} Z" fill="${lo}"/>`;
  else back = `<path d="M${cx - f.halfW - 18} ${f.cheekY - 40} L${cx - f.halfW - 20} ${f.cheekY + 20} Q${cx - f.halfW - 4} ${f.cheekY + 44} ${cx - f.halfW + 8} ${f.cheekY + 10} L${cx - f.halfW + 8} ${f.cheekY - 40} Z M${cx + f.halfW + 18} ${f.cheekY - 40} L${cx + f.halfW + 20} ${f.cheekY + 20} Q${cx + f.halfW + 4} ${f.cheekY + 44} ${cx + f.halfW - 8} ${f.cheekY + 10} L${cx + f.halfW - 8} ${f.cheekY - 40} Z" fill="${lo}"/>`;
  back = `<path d="${dome}" fill="${lo}"/>` + back;
  // front / bangs
  const bangY = EYE_Y - 70;
  if (style === 'side') front = `<path d="M${cx - f.halfW - 8} ${f.cheekY - 30} C${cx - f.halfW - 8} ${top - 30} ${cx - 40} ${top - 40} ${cx + 10} ${top - 36} C${cx + 90} ${top - 30} ${cx + f.halfW + 8} ${top + 10} ${cx + f.halfW + 8} ${f.cheekY - 30} L${cx + f.halfW - 6} ${bangY + 10} C${cx + 60} ${bangY - 30} ${cx - 10} ${bangY + 10} ${cx - 58} ${bangY + 26} L${cx - 84} ${bangY - 6} L${cx - f.halfW - 8} ${f.cheekY - 30} Z" fill="${Hc}"/>`;
  else if (style === 'spiky') front = `<path d="M${cx - f.halfW - 10} ${f.cheekY - 30} L${cx - 120} ${top - 40} L${cx - 84} ${top - 8} L${cx - 62} ${top - 66} L${cx - 34} ${top - 14} L${cx - 4} ${top - 76} L${cx + 26} ${top - 16} L${cx + 58} ${top - 64} L${cx + 82} ${top - 10} L${cx + 120} ${top - 40} L${cx + f.halfW + 10} ${f.cheekY - 30} L${cx + f.halfW - 4} ${bangY + 6} L${cx + 40} ${bangY + 26} L${cx} ${bangY + 4} L${cx - 40} ${bangY + 26} L${cx - f.halfW + 4} ${bangY + 6} Z" fill="${Hc}"/>`;
  else if (style === 'bob' || style === 'long') front = `<path d="M${cx - f.halfW - 8} ${f.cheekY - 30} C${cx - f.halfW - 8} ${top - 30} ${cx - 60} ${top - 40} ${cx} ${top - 40} C${cx + 60} ${top - 40} ${cx + f.halfW + 8} ${top - 30} ${cx + f.halfW + 8} ${f.cheekY - 30} L${cx + f.halfW - 2} ${bangY + 8} C${cx + 74} ${bangY - 8} ${cx + 52} ${bangY + 26} ${cx + 30} ${bangY + 6} C${cx + 10} ${bangY - 10} ${cx - 10} ${bangY - 10} ${cx - 30} ${bangY + 6} C${cx - 52} ${bangY + 26} ${cx - 74} ${bangY - 8} ${cx - f.halfW + 2} ${bangY + 8} Z" fill="${Hc}"/>`;
  else if (style === 'curly') front = `<path d="M${cx - f.halfW - 8} ${f.cheekY - 30} C${cx - f.halfW - 8} ${top - 30} ${cx - 60} ${top - 40} ${cx} ${top - 40} C${cx + 60} ${top - 40} ${cx + f.halfW + 8} ${top - 30} ${cx + f.halfW + 8} ${f.cheekY - 30} L${cx + f.halfW - 2} ${bangY + 8} ${[3, 2, 1, 0, -1, -2, -3].map((k) => `A22 22 0 0 0 ${cx + k * 30 - 15} ${bangY + 8}`).join(' ')} Z" fill="${Hc}"/>`;
  else front = `<path d="M${cx - f.halfW - 8} ${f.cheekY - 30} C${cx - f.halfW - 8} ${top - 30} ${cx - 60} ${top - 40} ${cx} ${top - 40} C${cx + 60} ${top - 40} ${cx + f.halfW + 8} ${top - 30} ${cx + f.halfW + 8} ${f.cheekY - 30} L${cx + f.halfW - 2} ${bangY + 6} L${cx + 70} ${bangY + 30} L${cx + 44} ${bangY + 6} L${cx + 16} ${bangY + 34} L${cx - 12} ${bangY + 8} L${cx - 40} ${bangY + 32} L${cx - 68} ${bangY + 8} L${cx - f.halfW + 2} ${bangY + 26} Z" fill="${Hc}"/>`;
  // shine
  const shine = `<path d="M${cx - 70} ${top - 6} Q${cx - 30} ${top - 26} ${cx + 10} ${top - 20}" stroke="${hi}" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.85"/><path d="M${cx - 40} ${top + 16} Q${cx - 10} ${top + 2} ${cx + 28} ${top + 6}" stroke="${hi}" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.6"/>`;
  let extra = '';
  if (style === 'bun') extra = `<circle cx="${cx + 4}" cy="${top - 62}" r="40" fill="${Hc}"/><circle cx="${cx - 8}" cy="${top - 74}" r="14" fill="${hi}" opacity="0.7"/>`;
  return { back, front: front + shine + extra };
}

function accessories(look, pal, gender) {
  const items = [look.acc, look.acc2, look.prop].filter(Boolean).filter((k) => !(gender === 'F' && (k === 'beard' || k === 'mustache'))); let g = ''; const f = FACE; const top = f.top - 10;
  if (items.includes('glasses')) g += `<g fill="none" stroke="#2f3542" stroke-width="5"><rect x="${cx - EYE_DX - 34}" y="${EYE_Y - 30}" width="68" height="58" rx="16"/><rect x="${cx + EYE_DX - 34}" y="${EYE_Y - 30}" width="68" height="58" rx="16"/><path d="M${cx - 16} ${EYE_Y - 8} L${cx + 16} ${EYE_Y - 8}"/></g><rect x="${cx - EYE_DX - 30}" y="${EYE_Y - 26}" width="60" height="50" rx="14" fill="#fff" opacity="0.18"/><rect x="${cx + EYE_DX - 30}" y="${EYE_Y - 26}" width="60" height="50" rx="14" fill="#fff" opacity="0.18"/>`;
  if (items.includes('sunglasses')) g += `<rect x="${cx - EYE_DX - 38}" y="${EYE_Y - 32}" width="76" height="60" rx="14" fill="#1e272e"/><rect x="${cx + EYE_DX - 38}" y="${EYE_Y - 32}" width="76" height="60" rx="14" fill="#1e272e"/><path d="M${cx - 12} ${EYE_Y - 12} L${cx + 12} ${EYE_Y - 12}" stroke="#1e272e" stroke-width="6"/><path d="M${cx - EYE_DX - 26} ${EYE_Y - 20} L${cx - EYE_DX - 6} ${EYE_Y - 26}" stroke="#fff" stroke-width="5" opacity="0.5" stroke-linecap="round"/>`;
  if (items.includes('headset')) g += `<path d="M${cx - f.halfW - 26} ${f.cheekY - 20} C${cx - f.halfW - 30} ${top - 40} ${cx + f.halfW + 30} ${top - 40} ${cx + f.halfW + 26} ${f.cheekY - 20}" stroke="#2f3542" stroke-width="12" fill="none"/><rect x="${cx - f.halfW - 40}" y="${f.cheekY - 30}" width="34" height="56" rx="12" fill="#2f3542"/><rect x="${cx + f.halfW + 6}" y="${f.cheekY - 30}" width="34" height="56" rx="12" fill="#2f3542"/><path d="M${cx - f.halfW - 20} ${f.cheekY + 26} Q${cx - f.halfW - 10} ${f.cheekY + 90} ${cx - 40} ${EYE_Y + 84}" stroke="#2f3542" stroke-width="7" fill="none"/><circle cx="${cx - 40}" cy="${EYE_Y + 84}" r="9" fill="#57606f"/>`;
  if (items.includes('crown')) g += `<path d="M${cx - 70} ${top - 36} L${cx - 70} ${top - 90} L${cx - 36} ${top - 58} L${cx} ${top - 104} L${cx + 36} ${top - 58} L${cx + 70} ${top - 90} L${cx + 70} ${top - 36} Z" fill="#f1c40f" stroke="#b7950b" stroke-width="4"/><circle cx="${cx}" cy="${top - 52}" r="8" fill="#e74c3c"/><circle cx="${cx - 40}" cy="${top - 46}" r="5" fill="#3498db"/><circle cx="${cx + 40}" cy="${top - 46}" r="5" fill="#3498db"/>`;
  if (items.includes('hardhat')) g += `<path d="M${cx - f.halfW - 18} ${top + 40} C${cx - f.halfW - 18} ${top - 62} ${cx + f.halfW + 18} ${top - 62} ${cx + f.halfW + 18} ${top + 40} Z" fill="#f4d03f"/><rect x="${cx - f.halfW - 36}" y="${top + 30}" width="${f.halfW * 2 + 72}" height="18" rx="9" fill="#d4ac0d"/><path d="M${cx - 60} ${top - 10} Q${cx} ${top - 44} ${cx + 60} ${top - 10}" stroke="#fff" stroke-width="8" opacity="0.5" fill="none" stroke-linecap="round"/>`;
  if (items.includes('cap')) g += `<path d="M${cx - f.halfW - 12} ${top + 10} C${cx - f.halfW - 12} ${top - 70} ${cx + f.halfW + 12} ${top - 70} ${cx + f.halfW + 12} ${top + 10} Z" fill="${pal.P ?? '#2f3d5c'}"/><path d="M${cx - 20} ${top + 6} L${cx + f.halfW + 70} ${top + 2} Q${cx + f.halfW + 76} ${top + 24} ${cx + f.halfW + 40} ${top + 26} L${cx - 10} ${top + 26} Z" fill="${shade(pal.P ?? '#2f3d5c', -0.2)}"/>`;
  if (items.includes('flower')) g += `<g transform="translate(${cx + f.halfW - 10} ${top + 10})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-18" rx="11" ry="18" fill="#fd79a8" transform="rotate(${a})"/>`).join('')}<circle r="10" fill="#ffeaa7"/></g>`;
  if (items.includes('earring')) g += `<circle cx="${cx + f.halfW + 4}" cy="${f.cheekY + 30}" r="6" fill="#f1c40f"/><circle cx="${cx - f.halfW - 4}" cy="${f.cheekY + 30}" r="6" fill="#f1c40f"/>`;
  if (items.includes('mustache')) g += `<path d="M${cx - 34} ${EYE_Y + 48} Q${cx - 16} ${EYE_Y + 36} ${cx} ${EYE_Y + 48} Q${cx + 16} ${EYE_Y + 36} ${cx + 34} ${EYE_Y + 48} Q${cx + 16} ${EYE_Y + 58} ${cx} ${EYE_Y + 50} Q${cx - 16} ${EYE_Y + 58} ${cx - 34} ${EYE_Y + 48} Z" fill="${shade(pal.H, -0.3)}"/>`;
  if (items.includes('beard')) g += `<path d="M${cx - 84} ${f.cheekY + 40} Q${cx - 72} ${f.chin + 26} ${cx} ${f.chin + 30} Q${cx + 72} ${f.chin + 26} ${cx + 84} ${f.cheekY + 40} Q${cx + 60} ${f.cheekY + 96} ${cx} ${f.cheekY + 98} Q${cx - 60} ${f.cheekY + 96} ${cx - 84} ${f.cheekY + 40} Z" fill="${shade(pal.H, -0.25)}"/><path d="M${cx - 34} ${EYE_Y + 84} Q${cx} ${EYE_Y + 96} ${cx + 34} ${EYE_Y + 84}" stroke="${shade(pal.H, 0.25)}" stroke-width="5" fill="none" opacity="0.6"/>`;
  if (items.includes('coffee')) g += `<g transform="translate(${cx + 150} ${430})"><rect x="-26" y="-30" width="52" height="60" rx="8" fill="#fff" stroke="#d9dbe3" stroke-width="3"/><rect x="-26" y="-30" width="52" height="16" rx="6" fill="#6d4c41"/><path d="M26 -14 q22 0 22 18 q0 18 -22 18" fill="none" stroke="#d9dbe3" stroke-width="6"/><path d="M-8 -48 q6 -8 0 -16 M6 -48 q6 -8 0 -16" stroke="#bbb" stroke-width="4" fill="none" stroke-linecap="round"/></g>`;
  return g;
}

function svgFor(def, id) {
  const p = PROFILES[id] ?? PROFILES.main ?? {}; const gender = p.gender ?? 'M';
  const pal = { H: '#3b2a1a', B: '#dfe6e9', P: '#2f3d5c', W: '#9aa5b1', ...(def.palette ?? {}) };
  const look = def.look ?? {};
  const skin = look.skin ?? (gender === 'F' ? '#ffe0c8' : '#f6d3b4');
  const iris = lum(pal.W) > 0.8 || lum(pal.W) < 0.2 ? (gender === 'F' ? '#6c5ce7' : '#5a3e2b') : pal.W;
  const mood = /crit|focus/.test(def.trait) ? 'grin' : /sturdy|greedy/.test(def.trait) ? 'flat' : 'smile';
  const hr = hair(look, pal, gender);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${background(def.grade, id)}
  <defs>
    <linearGradient id="bodyShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.18"/><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient>
    <linearGradient id="faceShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient>
  </defs>
  <g clip-path="url(#frame)">
    ${hr.back}
    ${torso(def, look, pal, gender)}
    ${face(pal, gender, skin)}
    ${eyes(pal, gender, iris)}
    ${mouth(gender, mood)}
    ${hr.front}
    ${accessories(look, pal, gender)}
  </g>
  <rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="24" fill="none" stroke="${GRADES[def.grade].color}" stroke-width="6"/>
</svg>`;
}

const outDir = new URL('../assets/cards/', import.meta.url);
const manifest = { cards: {} };
for (const h of HEROES) { fs.writeFileSync(new URL(`${h.id}.svg`, outDir), svgFor(h, h.id)); manifest.cards[h.id] = `${h.id}.svg`; }
for (const j of Object.values(MAIN_JOBS)) { fs.writeFileSync(new URL(`${j.id}.svg`, outDir), svgFor(j, 'main')); manifest.cards[j.id] = `${j.id}.svg`; }
fs.writeFileSync(new URL('manifest.json', outDir), JSON.stringify(manifest, null, 2) + '\n');
console.log(`portraits: ${Object.keys(manifest.cards).length} svg files`);
