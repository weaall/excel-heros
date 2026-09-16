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

const BAD_WORDS = ['씨발', '시발', '병신', '개새', '좆', '지랄', '니애미', 'fuck', 'shit', 'bitch', 'asshole', 'nazi', '운영자', '관리자', 'admin', 'gm'];
/** Leaderboard display name: trimmed, control/zero-width characters removed, profanity and staff titles masked, ≤ 16 chars. */
export function sanitizeName(raw) {
  let n = String(raw ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  const low = n.toLowerCase().replace(/\s/g, '');
  if (BAD_WORDS.some((w) => low.includes(w))) n = '';
  n = n.slice(0, 16);
  return n || '익명 사원';
}
/** Leaderboard row derived from a save (what the server actually ranks). */
export function boardEntry(state, name, dps = 0) {
  return {
    name: sanitizeName(name),
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

/**
 * Compare a new save with the previously stored one for the same account. Catches what a single snapshot cannot:
 * gems/kills appearing faster than time allows, or progress rolling back (a stale/edited copy overwriting the account).
 * `force` is set when the player explicitly chose to overwrite the account with this browser's progress.
 */
export function checkDelta(prev, next, prevAt, now = Date.now(), force = false) {
  const reasons = [];
  if (!prev) return { ok: true, reasons };
  const hours = Math.max(0, (now - prevAt) / 3600000);
  const ps = next.stats?.playSeconds ?? 0, pps = prev.stats?.playSeconds ?? 0;
  if (!force && ps + 60 < pps) reasons.push('play time rolled back');
  if (ps - pps > hours * 3600 * 1.1 + 900) reasons.push('play time grew faster than wall-clock time');
  const gemsNow = (next.gems | 0) + (next.stats?.totalPulls ?? 0) * 90, gemsPrev = (prev.gems | 0) + (prev.stats?.totalPulls ?? 0) * 90;
  const clears = Math.max(0, (next.maxCleared | 0) - (prev.maxCleared | 0));
  if (gemsNow - gemsPrev > 1200 + hours * 1500 + clears * 150 + (force ? 3000 : 0)) reasons.push('gems grew faster than any income allows');
  const kills = (next.stats?.totalKills ?? 0) - (prev.stats?.totalKills ?? 0);
  if (kills > (Math.max(0, ps - pps) + 120) * 6 + 2000) reasons.push('kills exceed the play time added');
  return { ok: reasons.length === 0, reasons };
}
