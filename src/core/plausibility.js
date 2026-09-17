// Save plausibility checks shared by the client (tests, pre-upload) and the Cloudflare Worker (backend/worker.js).
// A single-player idle game cannot stop a player from editing localStorage; these bounds only keep obviously
// impossible saves off the shared leaderboard / cloud store. Every bound is deliberately generous so a legit
// save never trips it — see docs/BALANCE.md 6-19.
import { BALANCE, upgradeCost, prestigeShares, levelCap } from '../config/balance.js';
import { MAX_CODE_GEMS } from '../data/codes.js';

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
  // repeat clears now scale with the phase, so a deep save legitimately earns far more per day than a shallow one
  const phase = Math.floor(cleared / BALANCE.BOSS_EVERY);
  // Deep farming measured at ~1,700 gems/h (kill drops scale with the phase), so a heavy day at phase 11 is ~40k.
  // The bound only has to reject the impossible, so it sits well above any honest schedule.
  const perDay = 2000 + phase * 1800;
  const codes = Object.keys(state.redeemed ?? {}).length * MAX_CODE_GEMS; // 보석 코드로 받은 몫
  return BALANCE.STARTING_GEMS + cleared * 150 + days * perDay + (state.stats?.chests ?? 0) * BALANCE.CHEST.gemsMax + codes + 6000;
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
  // 레벨 상한은 ★로만 열린다 — 손으로 고친 저장이 이 선을 넘을 수 없다
  for (const [id, e] of Object.entries(state.heroes ?? {})) {
    if (!e?.owned) continue;
    const cap = levelCap(e.star ?? 1, !!e.awakened, id === 'main' ? 4 : null) + 5;
    if ((e.level | 0) > cap) { reasons.push('hero level above the ★ ceiling'); break; }
  }
  checkEquipment(state, reasons);
  checkPrestige(state, reasons);
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
/**
 * Bounds for 지분 (prestige shares) — the single most valuable number on the leaderboard, since boardScore weights it
 * ×1000. Nothing checked it before, so a hand-edited save could claim any rank. A reset grants
 * prestigeShares(maxCleared) and requires clearing PRESTIGE.minCleared again, so `count` resets are themselves gated
 * by kills (checkSave already bounds kills by play time). The ceiling below assumes every reset happened at the
 * account's best-ever stage, which is the most generous reading of the save.
 */
function checkPrestige(state, reasons) {
  const p = state.prestige ?? {};
  const count = p.count | 0, shares = p.shares | 0;
  if (count < 0 || shares < 0) reasons.push('prestige is negative');
  // a reset needs minCleared stages, and every stage needs kills — so play time bounds how many resets are possible
  const killsPerReset = BALANCE.PRESTIGE.minCleared * BALANCE.KILLS_PER_STAGE * 0.9;
  const maxResets = Math.floor((state.stats?.totalKills ?? 0) / Math.max(1, killsPerReset)) + 1;
  if (count > maxResets) reasons.push('more company moves than kills allow');
  // best stage ever reached: the current run, or (for a save that has reset) the stage each reset was taken at
  const best = Math.max(state.maxCleared | 0, state.stats?.bestStage | 0, BALANCE.PRESTIGE.minCleared);
  if (shares > prestigeShares(best) * Math.max(1, count) + 1) reasons.push('shares exceed what the stages cleared could grant');
}

/** Bounds for the 비품 bag: a save cannot carry more items than the cap, nor levels past the ceiling. */
function checkEquipment(state, reasons) {
  const eq = state.equipment; if (!eq) return;
  const items = Array.isArray(eq.items) ? eq.items : [];
  if (items.length > BALANCE.EQUIP.inventoryMax) reasons.push('equipment bag over the cap');
  if (items.some((it) => !it || typeof it.slot !== 'string' || (it.lv | 0) < 0 || (it.lv | 0) > BALANCE.EQUIP.maxLevel)) reasons.push('equipment item out of bounds');
  // items only drop from clears, and at most one per clear (bosses roll twice but still keep one)
  const clears = Math.max(0, (state.maxCleared | 0)) + (state.stats?.totalKills | 0) / BALANCE.KILLS_PER_STAGE;
  if (items.length > clears + 20) reasons.push('more equipment than stages cleared');
}

/**
 * Ceiling for a save's party DPS. The client reports its own number (the server does not simulate combat), so it is
 * clamped to a very generous function of the furthest stage reached — enough that no real party ever trips it, small
 * enough that "DPS 9경" cannot appear on the board.
 */
export function maxPlausibleDps(state) {
  const stage = Math.max(1, state.maxCleared | 0, state.stats?.bestStage | 0);
  const shares = Math.max(0, state.prestige?.shares | 0);
  return BALANCE.MONSTER_HP_BASE * BALANCE.MONSTER_HP_GROWTH ** stage * 50 * (1 + shares * BALANCE.PRESTIGE.bonusPerShare) + 1e4;
}

/** Leaderboard row derived from a save (what the server actually ranks). */
export function boardEntry(state, name, dps = 0) {
  return {
    name: sanitizeName(name),
    maxCleared: state.maxCleared | 0,
    shares: state.prestige?.shares ?? 0,
    prestige: state.prestige?.count ?? 0,
    dps: Math.round(Math.max(0, Math.min(dps, maxPlausibleDps(state)))), // client-reported, so clamp it to what the save could produce
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
  // 지분 drives the leaderboard: between two saves it can only grow by the resets that actually happened
  const dShares = ((next.prestige?.shares | 0) - (prev.prestige?.shares | 0));
  const dCount = ((next.prestige?.count | 0) - (prev.prestige?.count | 0));
  if (!force && dShares < 0) reasons.push('shares went backwards');
  if (dCount < 0 && !force) reasons.push('company moves went backwards');
  if (dShares > 0 && dCount <= 0) reasons.push('shares grew without a company move');
  if (dCount > 0 && dShares > prestigeShares(Math.max(prev.maxCleared | 0, next.maxCleared | 0, BALANCE.PRESTIGE.minCleared)) * dCount + 1) reasons.push('shares grew faster than the resets allow');
  return { ok: reasons.length === 0, reasons };
}
