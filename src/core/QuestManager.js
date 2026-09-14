// Daily quests / check-in / ad placeholder. Pure functions over state.daily.
import { BALANCE, relativeGold } from '../config/balance.js';
import { DAILY_QUESTS, QUEST_BY_ID, LOGIN_BONUS, ALL_CLEAR_BONUS } from '../data/quests.js';
import { localDateKey } from './state.js';

/** Reset daily data when the local date changed. Returns true if a reset happened. */
export function ensureDaily(state, now = Date.now()) {
  const key = localDateKey(now);
  if (state.daily.date === key) return false;
  state.daily = { date: key, progress: {}, claimed: {}, loginClaimed: false, allClearClaimed: false, adsUsed: 0 };
  return true;
}

export function addProgress(state, questId, n = 1) {
  const q = QUEST_BY_ID[questId]; if (!q) return;
  const d = state.daily;
  d.progress[questId] = Math.min(q.target, (d.progress[questId] ?? 0) + n);
}

export const questProgress = (state, questId) => state.daily.progress[questId] ?? 0;
export const questDone = (state, questId) => questProgress(state, questId) >= QUEST_BY_ID[questId].target;
export const questClaimed = (state, questId) => !!state.daily.claimed[questId];
export const allQuestsClaimed = (state) => DAILY_QUESTS.every((q) => questClaimed(state, q.id));

/** Turn a reward spec into concrete amounts (gold is relative to the best stage). */
export function resolveReward(state, spec, goldMult = 1) {
  return {
    gems: spec.gems ?? 0,
    gold: spec.goldKills ? relativeGold(state.maxStage, spec.goldKills, goldMult) : 0,
    cards: spec.cards ?? 0,
  };
}

function grant(state, r) { state.gems += r.gems; state.gold += r.gold; state.cards += r.cards; state.stats.totalGold += r.gold; }

/** Claim a finished quest. Returns the granted reward or null. */
export function claimQuest(state, questId, goldMult = 1) {
  if (!QUEST_BY_ID[questId] || !questDone(state, questId) || questClaimed(state, questId)) return null;
  const r = resolveReward(state, QUEST_BY_ID[questId].reward, goldMult);
  grant(state, r); state.daily.claimed[questId] = true;
  return r;
}

export function claimLogin(state, goldMult = 1) {
  if (state.daily.loginClaimed) return null;
  const r = resolveReward(state, LOGIN_BONUS, goldMult);
  grant(state, r); state.daily.loginClaimed = true;
  return r;
}

export function claimAllClear(state, goldMult = 1) {
  if (state.daily.allClearClaimed || !allQuestsClaimed(state)) return null;
  const r = resolveReward(state, ALL_CLEAR_BONUS, goldMult);
  grant(state, r); state.daily.allClearClaimed = true;
  return r;
}

export const adsLeft = (state) => Math.max(0, BALANCE.AD.perDay - (state.daily.adsUsed ?? 0));
/** Consume one ad view. Returns false when the daily limit is reached. */
export function useAd(state) {
  if (adsLeft(state) <= 0) return false;
  state.daily.adsUsed = (state.daily.adsUsed ?? 0) + 1;
  return true;
}
