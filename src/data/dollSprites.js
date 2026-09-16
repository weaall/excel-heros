// Hand-designed 16×28 "paper doll" sprites, one spec per hero, written by looking at each card illustration:
// hair style + colour, skin, outfit type + colours, accessories, halo colour. The doll is assembled pixel by pixel
// (no source sheet), then given a 1px dark outline like the 0x72 heroes, so it sits on the same 2px grid.
// Strip layout matches heroSkins.buildHeroStrip: 9 frames of 16×28 — 0-3 idle, 4-7 walk, 8 hit. Heroes face right.

const FW = 16, FH = 28, FRAMES = 9;
const SKIN = { light: '#f6d7c3', fair: '#f9e0cf', tan: '#e0b48a' };
const SHOE = '#23262d';

// ------------------------------------------------------------------ specs --
// hair: short | bob | long | ponytail | bun | twin | spiky | curly | bald | side
// outfit: suit (jacket + shirt column) | shirt | hoodie | apron | dress | coat | cardigan | labcoat | vest
// bottom: pants | skirt
// acc: glasses sunglasses mustache beard headset hardhat cap crown tiara lanyard:<color> tie:<color> scarf:<color> flower headphones suspenders badge
export const DOLLS = {
  staff_park: { hair: 'short', hairColor: '#7a5230', skin: 'light', outfit: 'suit', top: '#f2f2f2', shirt: '#8fb8e8', bottom: 'pants', bottomColor: '#2c3345', acc: ['tie:#2f3d5c', 'badge'], halo: '#f4e9c8' },
  parttime:   { hair: 'bob', hairColor: '#8a5a3b', skin: 'fair', outfit: 'cardigan', top: '#f0a640', shirt: '#2ec4a5', bottom: 'skirt', bottomColor: '#2ec4a5', acc: [], halo: '#d8e6ff' },
  guard:      { hair: 'short', hairColor: '#cfd3d8', skin: 'light', outfit: 'suit', top: '#2b3a5c', shirt: '#dfe9f3', bottom: 'pants', bottomColor: '#2b3a5c', acc: ['mustache', 'badge'], halo: '#bfe0ff' },
  barista:    { hair: 'bun', hairColor: '#f28a2e', skin: 'fair', outfit: 'apron', top: '#6d4c41', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#2d2d2d', acc: [], halo: '#f7e6b5' },
  courier:    { hair: 'short', hairColor: '#2b2b2b', skin: 'light', outfit: 'hoodie', top: '#f39c12', shirt: '#f39c12', bottom: 'pants', bottomColor: '#2f2f2f', acc: ['cap:#3b5bd6'], halo: '#f9e79f' },
  contract:   { hair: 'bob', hairColor: '#dcdcdc', skin: 'fair', outfit: 'suit', top: '#9aa0a6', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#9aa0a6', acc: ['badge'], halo: '#ffd6e0' },
  vlookup:    { hair: 'short', hairColor: '#1f2f5f', skin: 'light', outfit: 'suit', top: '#26b8b0', shirt: '#1f2a44', bottom: 'pants', bottomColor: '#2c3e50', acc: ['glasses', 'lanyard:#ff7eb6'], halo: '#c9e8ff' },
  pivot:      { hair: 'bald', hairColor: '#4a3b2a', skin: 'light', outfit: 'shirt', top: '#9fd8ff', shirt: '#9fd8ff', bottom: 'pants', bottomColor: '#2f3a4a', acc: ['beard', 'tie:#111111', 'suspenders'], halo: '#ffffff' },
  macro:      { hair: 'spiky', hairColor: '#151515', skin: 'light', outfit: 'hoodie', top: '#33cfe0', shirt: '#e6ff4d', bottom: 'pants', bottomColor: '#2a2a3a', acc: ['headphones:#2ad4e0'], halo: '#8be9ff' },
  hr_jung:    { hair: 'long', hairColor: '#6b4a2f', skin: 'fair', outfit: 'suit', top: '#3cb389', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#3cb389', acc: ['badge'], halo: '#fff3b0' },
  audit_han:  { hair: 'short', hairColor: '#1a1a1a', skin: 'light', outfit: 'suit', top: '#2fb08a', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#2c3e50', acc: ['sunglasses', 'tie:#f5c542'], halo: '#e8f0ff' },
  acct_lead:  { hair: 'bun', hairColor: '#1c1c1c', skin: 'fair', outfit: 'suit', top: '#26a69a', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#2c3e50', acc: ['glasses', 'badge'], halo: '#c8fff0' },
  dev_lead:   { hair: 'curly', hairColor: '#1a1a1a', skin: 'light', outfit: 'suit', top: '#2f6fd6', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#2a2a3a', acc: ['headset'], halo: '#ffb3e6' },
  ga_lead:    { hair: 'short', hairColor: '#d9dde3', skin: 'light', outfit: 'suit', top: '#2f6fd6', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#7f8c8d', acc: ['tie:#c0392b'], halo: '#dfe6f7' },
  welfare:    { hair: 'bob', hairColor: '#e63946', skin: 'fair', outfit: 'suit', top: '#2f6fd6', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#7f8c8d', acc: ['flower:#ffd166', 'scarf:#ffb7a1'], halo: '#ffe1e6' },
  cfo:        { hair: 'short', hairColor: '#e8e8e8', skin: 'light', outfit: 'suit', top: '#2a5fc7', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#2a5fc7', acc: ['glasses', 'tie:#d4a017'], halo: '#f1f1f1' },
  cto:        { hair: 'short', hairColor: '#111111', skin: 'light', outfit: 'shirt', top: '#3b6fd8', shirt: '#3b6fd8', bottom: 'pants', bottomColor: '#1f2a44', acc: ['sunglasses'], halo: '#8fb8ff' },
  coo:        { hair: 'short', hairColor: '#aeb6bf', skin: 'fair', outfit: 'suit', top: '#1f2a44', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#1f2a44', acc: ['badge'], halo: '#dfe9f7' },
  ceo:        { hair: 'long', hairColor: '#f2f2f2', skin: 'fair', outfit: 'suit', top: '#111111', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#111111', acc: ['sunglasses', 'trim:#d4a017'], halo: '#ffe9a8' },
  chairman:   { hair: 'short', hairColor: '#d0d0d0', skin: 'light', outfit: 'suit', top: '#151515', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#151515', acc: ['beard', 'crown', 'trim:#d4a017'], halo: '#ffd76a' },
  helpdesk:   { hair: 'bob', hairColor: '#152238', skin: 'fair', outfit: 'suit', top: '#2f7fd6', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#2f7fd6', acc: ['headset'], halo: '#d6e9ff' },
  cleaner:    { hair: 'bun', hairColor: '#8d99a6', skin: 'light', outfit: 'cardigan', top: '#c0392b', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#222222', acc: [], halo: '#ffffff' },
  sales_kang: { hair: 'short', hairColor: '#111111', skin: 'light', outfit: 'suit', top: '#8e3b2f', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#5a2a22', acc: ['tie:#c0392b'], halo: '#ffd9c2' },
  legal_yoon: { hair: 'long', hairColor: '#1f2a5c', skin: 'fair', outfit: 'suit', top: '#dbe7f7', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#1f2a44', acc: ['glasses'], halo: '#e6f0ff' },
  pm_lead:    { hair: 'short', hairColor: '#2f6fd6', skin: 'fair', outfit: 'suit', top: '#28b0a8', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#7f8c8d', acc: ['badge'], halo: '#ffffff' },
  design_lead:{ hair: 'twin', hairColor: '#f4a9c8', skin: 'fair', outfit: 'suit', top: '#e8546f', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#2c3e50', acc: [], halo: '#ffd1ec' },
  cmo:        { hair: 'long', hairColor: '#d94f3a', skin: 'fair', outfit: 'suit', top: '#1f2a3a', shirt: '#2a3a5a', bottom: 'pants', bottomColor: '#1f2a3a', acc: ['sunglasses'], halo: '#ff9f8a' },
  founder:    { hair: 'short', hairColor: '#111111', skin: 'light', outfit: 'suit', top: '#1f9e8f', shirt: '#1a1a1a', bottom: 'pants', bottomColor: '#1f2a44', acc: ['glasses', 'trim:#d4a017'], halo: '#d4a017' },
  intern_seo: { hair: 'long', hairColor: '#b98a5c', skin: 'fair', outfit: 'shirt', top: '#f5f5f5', shirt: '#f5f5f5', bottom: 'skirt', bottomColor: '#8fb8e8', acc: ['lanyard:#3b5bd6'], halo: '#fff4c2' },
  pr_yoo:     { hair: 'bob', hairColor: '#d63a3a', skin: 'fair', outfit: 'shirt', top: '#f5f5f5', shirt: '#f5f5f5', bottom: 'skirt', bottomColor: '#3b6fd8', acc: [], halo: '#ffc9d6' },
  nurse_han:  { hair: 'bun', hairColor: '#e9eef2', skin: 'fair', outfit: 'labcoat', top: '#ffffff', shirt: '#dfe9f3', bottom: 'skirt', bottomColor: '#f0f0f0', acc: ['badge'], halo: '#d6f0ff' },
  lab_park:   { hair: 'long', hairColor: '#eaeaea', skin: 'fair', outfit: 'labcoat', top: '#ffffff', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#4a90e2', acc: ['glasses', 'lanyard:#3b5bd6'], halo: '#ffe6ea' },
  chro:       { hair: 'long', hairColor: '#151515', skin: 'fair', outfit: 'suit', top: '#f2a6c6', shirt: '#f4f4f4', bottom: 'skirt', bottomColor: '#f2a6c6', acc: [], halo: '#ffe0f0' },
  chairwoman: { hair: 'long', hairColor: '#f3e6b8', skin: 'fair', outfit: 'suit', top: '#111111', shirt: '#111111', bottom: 'pants', bottomColor: '#111111', acc: ['tiara', 'trim:#d4a017'], halo: '#ffd76a' },
  // main hero jobs
  intern:     { hair: 'short', hairColor: '#151515', skin: 'light', outfit: 'shirt', top: '#2ec4b6', shirt: '#2ec4b6', bottom: 'pants', bottomColor: '#2c3e50', acc: ['lanyard:#3b5bd6'], halo: '#e6f7ff' },
  staff:      { hair: 'short', hairColor: '#151515', skin: 'light', outfit: 'shirt', top: '#2ec4b6', shirt: '#2ec4b6', bottom: 'pants', bottomColor: '#2c3e50', acc: ['tie:#1f2a44'], halo: '#e6f7ff' },
  senior:     { hair: 'bob', hairColor: '#151515', skin: 'light', outfit: 'suit', top: '#26b8b0', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#2c3e50', acc: ['lanyard:#f39c12'], halo: '#e6f7ff' },
  manager:    { hair: 'short', hairColor: '#151515', skin: 'light', outfit: 'suit', top: '#2a5fc7', shirt: '#f4f4f4', bottom: 'pants', bottomColor: '#2a5fc7', acc: ['glasses', 'tie:#1f2a44'], halo: '#e6f7ff' },
  sales:      { hair: 'spiky', hairColor: '#151515', skin: 'light', outfit: 'suit', top: '#c0392b', shirt: '#1a1a1a', bottom: 'pants', bottomColor: '#1f1f2a', acc: ['sunglasses', 'trim:#d4a017'], halo: '#ffd76a' },
  finance:    { hair: 'short', hairColor: '#151515', skin: 'light', outfit: 'vest', top: '#26b8b0', shirt: '#1a1a2a', bottom: 'pants', bottomColor: '#1f2a44', acc: ['glasses', 'tie:#d4a017', 'trim:#d4a017'], halo: '#ffd76a' },
  admin:      { hair: 'short', hairColor: '#d8d8d8', skin: 'light', outfit: 'coat', top: '#e67e22', shirt: '#1a1a1a', bottom: 'pants', bottomColor: '#1f1f1f', acc: ['beard', 'trim:#d4a017'], halo: '#ffd76a' },
};

// ------------------------------------------------------------ painting --
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (c, k) => { const [r, g, b] = hex(c); return toHex(r * k, g * k, b * k); };
const isLight = (c) => { const [r, g, b] = hex(c); return (r * 299 + g * 587 + b * 114) / 1000 > 200; };

/** A 16×28 pixel buffer with helpers; `dy` shifts everything drawn afterwards (used for the idle/walk bob). */
class Px {
  constructor() { this.d = new Map(); this.dy = 0; }
  set(x, y, c) { y += this.dy; if (x < 0 || y < 0 || x >= FW || y >= FH || !c) return; this.d.set(y * FW + x, c); }
  rect(x0, y0, w, h, c) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c); }
  get(x, y) { return this.d.get((y) * FW + x) ?? null; }
}

function drawDoll(p, s, { legPhase = 0, bob = 0, hit = false } = {}) {
  const skin = SKIN[s.skin] ?? SKIN.light, hair = s.hairColor, hairDark = shade(hair, 0.72), top = s.top, topDark = shade(top, 0.75), shirt = s.shirt;
  const acc = Object.fromEntries((s.acc ?? []).map((a) => { const [k, v] = a.split(':'); return [k, v ?? true]; }));
  const skirt = s.bottom === 'skirt';
  // --- back hair (behind the body) for long styles
  p.dy = bob;
  if (s.hair === 'long' || s.hair === 'side') { p.rect(3, 6, 2, 12, hair); p.rect(11, 6, 2, 11, hair); p.rect(3, 17, 1, 2, hairDark); }
  if (s.hair === 'twin') { p.rect(2, 8, 2, 8, hair); p.rect(12, 8, 2, 8, hair); }
  if (s.hair === 'ponytail') { p.rect(2, 6, 2, 9, hair); }
  // --- legs (walk: alternate feet by one pixel)
  p.dy = 0;
  const lift = legPhase === 1 ? 1 : legPhase === 3 ? -1 : 0; // frame parity → which leg is up
  if (skirt) {
    p.rect(4, 20 + bob, 8, 3, s.bottomColor); p.rect(3, 22 + bob, 10, 1, shade(s.bottomColor, 0.8));
    p.rect(6, 23, 1, 4 - Math.max(0, lift), skin); p.rect(9, 23, 1, 4 - Math.max(0, -lift), skin);
    p.rect(5, 27 - Math.max(0, lift), 3, 1, SHOE); p.rect(8, 27 - Math.max(0, -lift), 3, 1, SHOE);
  } else {
    p.rect(5, 20 + bob, 3, 7 - Math.max(0, lift) - bob, s.bottomColor); p.rect(8, 20 + bob, 3, 7 - Math.max(0, -lift) - bob, s.bottomColor);
    p.rect(5, 27 - Math.max(0, lift), 3, 1, SHOE); p.rect(8, 27 - Math.max(0, -lift), 3, 1, SHOE);
  }
  p.dy = bob;
  // --- torso (y 12..20) + arms
  const sleeve = s.outfit === 'shirt' ? shirt : top;
  p.rect(4, 12, 8, 9, s.outfit === 'shirt' ? shirt : top);
  p.rect(3, 13, 1, 6, sleeve); p.rect(12, 13, 1, 6, sleeve); p.set(3, 19, skin); p.set(12, 19, skin); // arms + hands
  switch (s.outfit) {
    case 'suit': case 'cardigan': p.rect(7, 12, 2, 8, shirt); p.set(6, 12, topDark); p.set(9, 12, topDark); p.set(6, 13, topDark); p.set(9, 13, topDark); break; // lapels + shirt column
    case 'vest': p.rect(7, 12, 2, 8, shirt); p.rect(5, 13, 6, 7, shirt); p.rect(7, 12, 2, 8, s.shirt); p.rect(4, 12, 1, 9, top); p.rect(11, 12, 1, 9, top); break;
    case 'hoodie': p.rect(5, 12, 6, 1, topDark); p.rect(4, 13, 8, 1, topDark); p.rect(6, 18, 4, 1, topDark); p.rect(7, 14, 2, 3, s.shirt !== top ? s.shirt : topDark); break;
    case 'apron': p.rect(4, 12, 8, 9, shirt); p.rect(5, 14, 6, 7, top); p.set(6, 13, top); p.set(9, 13, top); if (skirt) p.rect(5, 20, 6, 3, top); break;
    case 'labcoat': case 'coat': p.rect(7, 12, 2, 8, shirt); p.set(6, 12, shade(top, 0.85)); p.set(9, 12, shade(top, 0.85)); p.rect(4, 20, 8, 3, top); p.rect(7, 20, 2, 3, shade(top, 0.8)); p.rect(4, 21, 1, 2, shade(top, 0.85)); p.rect(11, 21, 1, 2, shade(top, 0.85)); break;
    case 'shirt': p.rect(6, 12, 4, 1, shade(shirt, 0.8)); p.rect(7, 13, 2, 6, shade(shirt, 0.92)); break;
    case 'dress': break;
  }
  if (acc.trim) { p.set(4, 12, acc.trim); p.set(11, 12, acc.trim); p.set(4, 19, acc.trim); p.set(11, 19, acc.trim); }
  if (acc.tie) { p.rect(7, 13, 2, 1, acc.tie); p.rect(7, 14, 2, 4, acc.tie); }
  if (acc.suspenders) { p.rect(6, 12, 1, 8, '#333333'); p.rect(9, 12, 1, 8, '#333333'); }
  if (acc.lanyard) { p.rect(6, 12, 1, 5, acc.lanyard); p.rect(9, 12, 1, 5, acc.lanyard); p.rect(7, 17, 2, 2, '#f4f4f4'); }
  if (acc.badge) p.rect(10, 14, 1, 1, '#f4f4f4');
  if (acc.scarf) { p.rect(4, 12, 8, 2, acc.scarf); p.rect(5, 14, 1, 3, acc.scarf); }
  // --- head (y 4..11), skin block x 5..10
  p.rect(5, 4, 6, 8, skin); p.rect(4, 6, 1, 4, skin); p.rect(11, 6, 1, 4, skin);
  // neck
  p.rect(7, 11, 2, 1, shade(skin, 0.85));
  // --- hair (front)
  const H = hair;
  switch (s.hair) {
    case 'bald': p.rect(5, 3, 6, 1, shade(skin, 0.95)); p.rect(4, 4, 1, 3, skin); p.rect(11, 4, 1, 3, skin); break;
    case 'short': p.rect(4, 3, 8, 2, H); p.rect(4, 5, 2, 3, H); p.rect(10, 5, 2, 2, H); p.rect(6, 5, 2, 1, H); p.set(9, 5, H); p.rect(3, 4, 1, 3, H); break;
    case 'spiky': p.rect(4, 3, 8, 2, H); p.set(4, 2, H); p.set(7, 2, H); p.set(10, 2, H); p.set(6, 1, H); p.set(9, 1, H); p.rect(4, 5, 2, 3, H); p.rect(10, 5, 2, 2, H); p.rect(6, 5, 3, 1, H); break;
    case 'curly': p.rect(4, 3, 8, 2, H); p.rect(3, 4, 1, 5, H); p.rect(12, 4, 1, 4, H); p.rect(4, 5, 2, 4, H); p.rect(10, 5, 2, 3, H); p.rect(6, 5, 2, 1, H); p.set(5, 2, H); p.set(8, 2, H); p.set(11, 2, H); break;
    case 'bob': p.rect(4, 3, 8, 2, H); p.rect(3, 4, 2, 8, H); p.rect(11, 4, 2, 7, H); p.rect(5, 5, 2, 2, H); p.rect(8, 5, 2, 1, H); p.set(10, 5, H); break;
    case 'long': case 'side': p.rect(4, 3, 8, 2, H); p.rect(3, 4, 2, 4, H); p.rect(11, 4, 2, 4, H); p.rect(5, 5, 2, 2, H); p.rect(8, 5, 3, 1, H); break;
    case 'twin': p.rect(4, 3, 8, 2, H); p.rect(3, 4, 2, 4, H); p.rect(11, 4, 2, 4, H); p.rect(5, 5, 3, 1, H); p.set(9, 5, H); p.set(2, 7, hairDark); p.set(13, 7, hairDark); break;
    case 'ponytail': p.rect(4, 3, 8, 2, H); p.rect(3, 4, 2, 4, H); p.rect(11, 4, 1, 3, H); p.rect(5, 5, 2, 2, H); p.rect(8, 5, 3, 1, H); p.rect(2, 5, 2, 2, H); break;
    case 'bun': p.rect(4, 3, 8, 2, H); p.rect(3, 4, 2, 4, H); p.rect(11, 4, 1, 3, H); p.rect(5, 5, 2, 1, H); p.rect(8, 5, 3, 1, H); p.rect(6, 1, 4, 2, H); p.rect(5, 2, 1, 1, hairDark); p.rect(10, 2, 1, 1, hairDark); break;
  }
  // --- face: two eyes (1×2 anime eyes) shifted right = looking right; mouth
  const eye = hit ? shade(skin, 0.6) : '#222222';
  p.rect(7, 8, 1, 2, eye); p.rect(10, 8, 1, 2, eye); p.set(7, 8, hit ? eye : '#ffffff'); p.set(10, 8, hit ? eye : '#ffffff');
  p.set(9, 10, shade(skin, 0.7));
  if (acc.mustache) p.rect(7, 10, 4, 1, hair);
  if (acc.beard) { p.rect(6, 11, 5, 1, hair); p.rect(7, 12, 3, 1, hair); }
  if (acc.glasses) { p.rect(6, 8, 3, 1, '#333333'); p.rect(9, 8, 3, 1, '#333333'); p.set(6, 9, '#333333'); p.set(8, 9, '#333333'); p.set(9, 9, '#333333'); p.set(11, 9, '#333333'); p.set(7, 8, '#dff1ff'); p.set(10, 8, '#dff1ff'); }
  if (acc.sunglasses) { p.rect(6, 8, 6, 2, '#1a1a1a'); p.set(7, 8, '#4a4a55'); p.set(10, 8, '#4a4a55'); }
  if (acc.headset) { p.rect(4, 3, 8, 1, '#2d3436'); p.rect(4, 6, 1, 3, '#2d3436'); p.rect(11, 6, 1, 3, '#2d3436'); p.rect(12, 9, 2, 1, '#2d3436'); }
  if (acc.headphones) { const c = acc.headphones; p.rect(4, 2, 8, 1, c); p.rect(3, 5, 2, 4, c); p.rect(11, 5, 2, 4, c); }
  if (acc.cap) { const c = acc.cap; p.rect(4, 2, 8, 2, c); p.rect(5, 1, 6, 1, c); p.rect(11, 4, 3, 1, shade(c, 0.8)); }
  if (acc.hardhat) { p.rect(4, 2, 8, 2, '#f1c40f'); p.rect(5, 1, 6, 1, '#f1c40f'); p.rect(3, 4, 10, 1, '#d4ac0d'); }
  if (acc.crown) { p.rect(5, 1, 6, 2, '#d4a017'); p.set(5, 0, '#d4a017'); p.set(7, 0, '#d4a017'); p.set(10, 0, '#d4a017'); p.set(8, 1, '#e74c3c'); }
  if (acc.tiara) { p.rect(6, 2, 4, 1, '#d4a017'); p.set(8, 1, '#d4a017'); p.set(8, 2, '#5dade2'); }
  if (acc.flower) { p.set(4, 4, acc.flower); p.set(3, 5, acc.flower); p.set(4, 5, '#ffffff'); }
  // --- halo (every illustration has one): thin arc above the head
  if (s.halo && !acc.crown && !acc.cap && !acc.hardhat) { p.rect(6, 0, 4, 1, s.halo); p.set(5, 1, s.halo); p.set(10, 1, s.halo); }
  p.dy = 0;
}

/** Apply a 1px dark outline on silhouette edges (a darker version of the pixel's own colour, like the 0x72 sheet). */
function outline(p) {
  const out = new Map(p.d);
  for (const [k, c] of p.d) {
    const x = k % FW, y = Math.floor(k / FW);
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx < 0 || nx >= FW || ny < 0 || ny >= FH || !p.d.has(ny * FW + nx); });
    if (edge) out.set(k, isLight(c) ? shade(c, 0.55) : shade(c, 0.45));
  }
  return out;
}

/** Build the 9-frame strip for a doll spec (browser only — needs canvas). `palette` overrides come from skins. */
export function buildDollStrip(id, palette = null) {
  const base = DOLLS[id]; if (!base) return null;
  const s = palette ? { ...base, top: palette.B ?? base.top, bottomColor: palette.P ?? base.bottomColor, hairColor: palette.H ?? base.hairColor, shirt: palette.W && base.outfit !== 'shirt' ? base.shirt : base.shirt } : base;
  const c = document.createElement('canvas'); c.width = FW * FRAMES; c.height = FH; const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  for (let f = 0; f < FRAMES; f++) {
    const p = new Px();
    const idle = f < 4, walk = f >= 4 && f < 8;
    const bob = idle ? [0, 1, 1, 0][f] : walk ? [0, -1, 0, -1][f - 4] : 0;
    drawDoll(p, s, { legPhase: walk ? [1, 0, 3, 0][f - 4] : 0, bob, hit: f === 8 });
    for (const [k, col] of outline(p)) { const x = k % FW, y = Math.floor(k / FW); const [r, g, b] = hex(col); const o = (y * c.width + f * FW + x) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
export const hasDoll = (id) => !!DOLLS[id];
/** Canvas-free render of one frame (for Node tooling / previews): { width, height, data: RGBA Uint8ClampedArray }. */
export function dollPixels(id, frame = 0, palette = null) {
  const base = DOLLS[id]; if (!base) return null;
  const s = palette ? { ...base, top: palette.B ?? base.top, bottomColor: palette.P ?? base.bottomColor, hairColor: palette.H ?? base.hairColor } : base;
  const p = new Px(); const idle = frame < 4, walk = frame >= 4 && frame < 8;
  drawDoll(p, s, { legPhase: walk ? [1, 0, 3, 0][frame - 4] : 0, bob: idle ? [0, 1, 1, 0][frame] : walk ? [0, -1, 0, -1][frame - 4] : 0, hit: frame === 8 });
  const data = new Uint8ClampedArray(FW * FH * 4);
  for (const [k, col] of outline(p)) { const [r, g, b] = hex(col); data[k * 4] = r; data[k * 4 + 1] = g; data[k * 4 + 2] = b; data[k * 4 + 3] = 255; }
  return { width: FW, height: FH, data };
}
