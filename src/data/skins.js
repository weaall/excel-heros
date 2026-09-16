// 스킨: alternate looks per hero. A skin swaps the sprite palette (hair/jacket/accent) and, when an illustration file
// exists (assets/cards/<hero>__<skin>.png in the manifest), the card art too. Two skins per hero:
//   casual  — 퇴근 사복: reward for 호감도 Lv 10 (BALANCE.AFFECTION.maxLevel)
//   formal  — 회사 정장: bought with gems
// `prompt` is the outfit text for generating the illustration later (scripts/genCardsHF.mjs --skin).
import { HEROES, MAIN_JOBS } from './heroes.js';
import { PROFILES } from './profiles.js';

export const SKIN_GEM_COST = 300;

const hexToHsl = (hex) => { const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; };
const hslToHex = (h, s, l) => { const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join(''); };
/** Casual palette: jacket shifted ~150° (complementary-ish, a little lighter), accent picks up the old jacket hue. */
function casualPalette(pal) {
  const [h, s, l] = hexToHsl(pal.B ?? '#dfe6e9');
  return { B: hslToHex((h + 150) % 360, Math.min(0.75, Math.max(0.35, s + 0.15)), Math.min(0.72, Math.max(0.45, l + 0.08))), W: hslToHex((h + 30) % 360, 0.55, 0.62), P: hslToHex((h + 150) % 360, 0.35, 0.28) };
}
const FORMAL = { B: '#1f2a44', W: '#d4a017', P: '#141a2b' };

const CASUAL_NAME = { F: '퇴근 사복', M: '퇴근 사복' };
export const SKINS = {};
for (const def of [...HEROES, ...Object.values(MAIN_JOBS)]) {
  const pid = HEROES.includes(def) ? def.id : 'main'; const p = PROFILES[pid] ?? {}; const female = p.gender === 'F';
  SKINS[def.id] = [
    { id: 'casual', name: CASUAL_NAME[female ? 'F' : 'M'], desc: '호감도 Lv 10 달성 보상 · 편안한 퇴근 복장', palette: casualPalette(def.palette ?? {}), frame: '#e84393', unlock: { affection: 10 },
      prompt: female ? 'casual off-duty outfit, oversized cardigan, loose hair, tote bag, relaxed smile' : 'casual off-duty outfit, hoodie, headphones around neck, relaxed smile' },
    { id: 'formal', name: '회사 정장', desc: `보석 ${SKIN_GEM_COST} · 창립기념일용 네이비 정장과 금색 배지`, palette: FORMAL, frame: '#d4a017', unlock: { gems: SKIN_GEM_COST },
      prompt: female ? 'elegant navy formal suit dress, gold company badge, hair up, confident' : 'sharp navy three-piece suit, gold company badge, confident' },
  ];
}
export const skinsOf = (heroDefId) => SKINS[heroDefId] ?? [];
export const skinById = (heroDefId, skinId) => skinsOf(heroDefId).find((s) => s.id === skinId) ?? null;
/** Manifest key for a skin illustration (falls back to the base art when the file is missing). */
export const skinArtKey = (heroId, skinId) => `${heroId}__${skinId}`;
