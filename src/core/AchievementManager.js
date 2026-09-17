// Achievements: pure functions over state.achievements ({ id: claimedTierCount }).
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from '../data/achievements.js';
import { HEROES } from '../data/heroes.js';

export const ownedHeroCount = (state) => HEROES.filter((h) => state.heroes[h.id]?.owned).length;

/** Current value of the stat an achievement tracks. */
export function achievementValue(state, a) {
  if (a.stat === 'collection') return ownedHeroCount(state);
  if (a.stat === 'maxCleared') return state.maxCleared | 0;
  if (a.stat === 'prestige') return state.prestige?.count ?? 0;
  if (a.stat === 'equipment') return (state.equipment?.items ?? []).length;
  if (a.stat === 'bestiary') return Object.keys(state.bestiary ?? {}).filter((k) => !k.endsWith('!')).length;
  return Math.floor(state.stats?.[a.stat] ?? 0);
}
export const claimedTiers = (state, id) => state.achievements?.[id] ?? 0;
export const isMaxed = (state, id) => claimedTiers(state, id) >= ACHIEVEMENT_BY_ID[id].tiers.length;
/** Next tier target, or null when every tier is claimed. */
export const nextTarget = (state, id) => (isMaxed(state, id) ? null : ACHIEVEMENT_BY_ID[id].tiers[claimedTiers(state, id)]);
export const canClaim = (state, id) => { const a = ACHIEVEMENT_BY_ID[id]; const t = nextTarget(state, id); return t !== null && achievementValue(state, a) >= t; };
export const claimableCount = (state) => ACHIEVEMENTS.filter((a) => canClaim(state, a.id)).length;

/** Claim the next tier. Returns { gems, tier, target } or null. */
export function claimAchievement(state, id) {
  if (!ACHIEVEMENT_BY_ID[id] || !canClaim(state, id)) return null;
  const a = ACHIEVEMENT_BY_ID[id]; const tier = claimedTiers(state, id);
  const gems = a.gems[tier];
  state.achievements ??= {};
  state.achievements[id] = tier + 1;
  state.gems += gems;
  return { gems, tier: tier + 1, target: a.tiers[tier] };
}
