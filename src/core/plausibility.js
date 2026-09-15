// Save plausibility checks shared by the client (tests, pre-upload) and the Cloudflare Worker (backend/worker.js).
// A single-player idle game cannot stop a player from editing localStorage; these bounds only keep obviously
// impossible saves off the shared leaderboard / cloud store. Every bound is deliberately generous so a legit
// save never trips it — see docs/BALANCE.md 6-19.
import { BALANCE, upgradeCost } from '../config/balance.js';

const DAY = 86400000;
export const MAX_SAVE_BYTES = 256 * 1024;

/** Gold ever sunk into the levels a save currently holds (levels are refundable, so this is ≤ gold ever earned). */
export function goldInLevels(state) {
  let sum = 0;
  for (const e of Object.values(state.heroes ?? {})) { const L = e?.level | 0; for (let l = 1; l < L; l++) sum += upgradeCost(l); }
  return sum;
}

/** Upper bound of gems a save could have earned by now (first clears, quests/login/streak, achievements, chests, milestones). */
export function gemBudget(state, now = Date.now()) {
  const days = Math.max(1, Math.ceil((now - (state.createdAt ?? now)) / DAY) + 1);
  const cleared = Math.max(state.maxCleared | 0, (state.prestige?.count ?? 0) * 100);
  return BALANCE.STARTING_GEMS + cleared * 150 + days * 1500 + (state.stats?.chests ?? 0) * BALANCE.CHEST.gemsMax + 6000;
}

/**
 * Check a save. Returns { ok, reasons } — `reasons` lists every bound that failed (empty when ok).
 * `now` is the server clock (ms) so a client cannot claim future play time.
 */
export function checkSave(state, now = Date.now()) {
  const reasons = [];
  if (!state || typeof state !== 'object' || (state.version | 0) < 2) return { ok: false, reasons: ['shape'] };
  const st = state.stats ?? {};
  const created = state.createdAt ?? now, ageSec = Math.max(0, (now - created) / 1000);
  if (created > now + 5 * 60 * 1000) reasons.push('createdAt in the future');
  if ((st.playSeconds ?? 0) > ageSec * 1.1 + 900) reasons.push('playSeconds exceeds account age');
  // gold: the levels currently held cannot have cost more than every gold ever earned (+ 2% slack for rounding/refunds)
  if (goldInLevels(state) > (st.totalGold ?? 0) * 1.02 + BALANCE.STARTING_GOLD + 500) reasons.push('hero levels exceed gold earned');
  // gems: on hand + spent on pulls (a 10-pull is 90 per row) must fit the budget
  const gemsEver = (state.gems | 0) + (st.totalPulls ?? 0) * 90;
  if (gemsEver > gemBudget(state, now)) reasons.push('gems exceed plausible income');
  // kills: at most MAX_MONSTERS per RESPAWN_DELAY while playing, and every cleared normal stage needed KILLS_PER_STAGE kills
  const maxKillRate = BALANCE.MAX_MONSTERS / BALANCE.RESPAWN_DELAY + 1;
  if ((st.totalKills ?? 0) > (st.playSeconds ?? 0) * maxKillRate + 2000) reasons.push('kills exceed play time');
  const cleared = state.maxCleared | 0, normalStages = cleared - Math.floor(cleared / BALANCE.BOSS_EVERY);
  if ((st.totalKills ?? 0) < normalStages * BALANCE.KILLS_PER_STAGE * 0.9 - 100) reasons.push('stage progress exceeds kills');
  if ((st.bossKills ?? 0) < Math.floor(cleared / BALANCE.BOSS_EVERY) * 0.9 - 2) reasons.push('boss stages cleared without boss kills');
  if (JSON.stringify(state).length > MAX_SAVE_BYTES) reasons.push('save too large');
  return { ok: reasons.length === 0, reasons };
}

/** Leaderboard row derived from a save (what the server actually ranks). */
export function boardEntry(state, name, dps = 0) {
  return {
    name: String(name ?? '').slice(0, 16) || '익명 사원',
    maxCleared: state.maxCleared | 0,
    shares: state.prestige?.shares ?? 0,
    prestige: state.prestige?.count ?? 0,
    dps: Math.round(dps),
    playSeconds: Math.floor(state.stats?.playSeconds ?? 0),
    collection: Object.values(state.heroes ?? {}).filter((h) => h?.owned).length,
  };
}
/** Sort key: prestige shares carry over stages (a reset player is still "further"), then stage, then dps. */
export const boardScore = (e) => (e.shares ?? 0) * 1000 + (e.maxCleared ?? 0) + Math.min(0.999, (e.dps ?? 0) / 1e9);
