// Derived character design: height, build, eye colour, wing side and wing tier.
//
// These are NOT stored per character. They come from data the character already has — role, id,
// palette — so there is no second copy to drift. Every consumer imports from here: the character
// sheet, the illustration prompts, the pixel dolls, and whatever draws a codex later. Two files
// computing "which side is the wing on" independently is how a card ends up with its wing on the
// left in one screen and the right in another.

/** Stable per-id number. The pose angles already use this trick: same card, same answer, forever. */
export const hash = (id) => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0);

/**
 * 날개 방향.
 *
 * Varies per character, because five wings all leaning the same way makes the party row look
 * stamped. But it is fixed by id, not random: a wing that moves between regenerations belongs to
 * a different character.
 */
export const wingSide = (id) => (hash(id) % 2 === 0 ? 'left' : 'right');
export const wingSideKo = (id) => (wingSide(id) === 'left' ? '왼쪽' : '오른쪽');

/**
 * 날개 등급 — climbs by SEGMENT COUNT AND LAYERS, never by size.
 *
 * THE WHOLE LADDER IS SMALL. Even S stays under shoulder width. Size was never doing the work —
 * the segments and tiers are what read as rank — and keeping the span down helps every constraint
 * at once: the 280px party slot, the margin the cutout needs, the flat codex view, and the
 * distance from an angel.
 *
 * That rule is inherited from the halo, where `thin → clean → radiant` changed the adjective and
 * nothing visible: S has to LOOK better than D, and an adjective does not survive the render.
 *
 */
export const WING_BY_GRADE = {
  D: { seg: 3, layer: 1, span: 0.35, spanKo: '어깨 너비의 1/3', light: '없음, 반투명',
       en: 'three small translucent light shards at one shoulder, very compact, close against the body' },
  C: { seg: 4, layer: 1, span: 0.45, spanKo: '어깨 너비의 절반 이하', light: '옅은 발광',
       en: 'four small angular light shards at one shoulder with a faint glow, pointed tips, compact' },
  B: { seg: 5, layer: 2, span: 0.55, spanKo: '어깨 너비의 절반', light: '안쪽 발광',
       en: 'five small angular light shards in two tiers at one shoulder, inner glow, compact' },
  A: { seg: 6, layer: 2, span: 0.65, spanKo: '어깨 너비의 2/3', light: '금빛 테두리, 빛 알갱이',
       en: 'six small angular light shards in two tiers at one shoulder, thin second layer behind, golden rim and a few floating motes, compact' },
  S: { seg: 7, layer: 3, span: 0.8, spanKo: '어깨 너비의 4/5 (상한)', light: '금빛이 흘러내리고 숫자가 스침',
       en: 'seven small angular light shards in three tiers at one shoulder, tips scattering into a few glowing spreadsheet cells, golden light, still compact and never wider than the shoulders' },
};
export const wingTier = (grade) => WING_BY_GRADE[grade] ?? WING_BY_GRADE.C;

/** 체형 — role first, because that is what the silhouette has to say at 128px. */
export const BUILD = { tank: '다부진 체격', melee: '탄탄한 체격', ranged: '호리호리한 체격', healer: '아담한 체격' };
export const BUILD_EN = { tank: 'broad sturdy build', melee: 'athletic build', ranged: 'slender build', healer: 'petite build' };

/** 키 — a band per role, and the id picks a spot inside it. A tank is always tall; no two tanks
 *  are the same tall. */
const HEIGHT_BAND = { tank: [176, 190], melee: [170, 182], ranged: [163, 176], healer: [155, 168] };
export function height(def, profile) {
  const [lo, hi] = HEIGHT_BAND[def.role] ?? [165, 175];
  const base = lo + (hash(def.id) % (hi - lo + 1));
  return profile?.gender === 'F' ? Math.max(150, base - 8) : base;
}

/** Hue name for a hex, in Korean or English. Used for eyes (palette.W) and hair (palette.H). */
export function colorName(hex, ko = false) {
  if (!hex) return ko ? '검은' : 'black';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) {
    const grey = l > 0.85 ? ['흰', 'white'] : l > 0.6 ? ['은', 'silver'] : l > 0.3 ? ['회', 'grey'] : ['검은', 'black'];
    return ko ? grey[0] : grey[1];
  }
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const table = h < 15 ? ['붉은', 'red'] : h < 40 ? ['주황', 'orange'] : h < 65 ? ['황금', 'golden']
              : h < 160 ? ['초록', 'green'] : h < 200 ? ['청록', 'aqua'] : h < 250 ? ['푸른', 'blue']
              : h < 290 ? ['보라', 'purple'] : h < 335 ? ['분홍', 'pink'] : ['붉은', 'red'];
  const lead = l > 0.72 ? (ko ? '밝은 ' : 'light ') : l < 0.3 ? (ko ? '짙은 ' : 'dark ') : '';
  return lead + (ko ? table[0] : table[1]);
}

/** The whole wing, as a prompt fragment. */
export function wingTag(def) {
  const t = wingTier(def.grade);
  const side = wingSide(def.id);
  const colour = colorName(def.palette?.W);
  return `a single ${colour} wing of light on the character's ${side} shoulder only, `
       + `${t.en}, made of flat angular shards like spreadsheet cells and bar-chart bars, `
       + `not feathers, compact and close to the body`;
}
