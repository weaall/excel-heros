// ---------------------------------------------------------------------------
// Excel Heroes - balance constants & formulas (pure, no DOM)
// GDD formulas are kept verbatim; everything the GDD left open is derived here
// and documented in docs/BALANCE.md.
// ---------------------------------------------------------------------------

export const BALANCE = Object.freeze({
  // --- GDD formulas -------------------------------------------------------
  UPGRADE_COST_BASE: 10,   UPGRADE_COST_GROWTH: 1.12, // Cost = floor(10 * 1.12^(L-1))
  MONSTER_HP_BASE: 50,     MONSTER_HP_GROWTH: 1.18,   // HP   = floor(50 * 1.18^(S-1))
  GOLD_BASE: 5,            GOLD_GROWTH: 1.15,         // Gold = floor(5  * 1.15^(S-1))

  // --- Idle / offline (user decision: open = 1.0x, closed = 0.6x up to 10h) --
  OFFLINE_CAP_SEC: 10 * 3600, OFFLINE_EFFICIENCY: 0.6, OFFLINE_MIN_SEC: 60,
  AD: { perDay: 3, offlineMultiplier: 2, instantHours: 1, durationSec: 5 }, // placeholder ad (no SDK)

  // --- Derived (not in GDD) ---------------------------------------------
  MONSTER_ATK_BASE: 1,     MONSTER_ATK_GROWTH: 1.13,
  HERO_ATK_GROWTH: 1.10,   // per level (cost grows 1.12 -> slow soft wall, solved by stars/enhance/jobs)
  HERO_HP_GROWTH: 1.08,
  STAR_MULT: [1, 1.25, 1.6, 2.1, 2.8], // index = star-1
  ENHANCE_PER_LEVEL: 0.04,  // +4% ATK & HP per enhance level
  ENHANCE_MAX: 50,
  ENHANCE_COST_BASE: 10, ENHANCE_COST_GROWTH: 1.2, // enhance cards
  SHARD_CARD_VALUE: { D: 1, C: 2, B: 4, A: 8, S: 16 }, // enhance cards per shard when converting
  DISMISS_CARD_BONUS: 10,   // extra shards' worth of cards when a whole card is dismissed

  KILLS_PER_STAGE: 20,
  BOSS_EVERY: 10,
  BOSS_TIME_LIMIT: 30,
  BOSS_HP_MULT: 8,
  BOSS_ATK_MULT: 3,
  BOSS_GOLD_MULT: 20,

  MAX_MONSTERS: 5,
  RESPAWN_DELAY: 1.0,
  MONSTER_SPEED: 60,        // px / s (64px sprites)
  HERO_SPEED: 100,
  HERO_REVIVE_SEC: 8,
  HERO_REGEN_PCT: 0.02,     // fraction of max HP regenerated per second while alive
  MELEE_ADVANCE_CELLS: 3,   // how far (cells) a melee hero may leave formation
  ELITE: { hp: 2.5, atk: 1.5, gold: 3 },
  CARDS_FIRST_CLEAR_PER_PHASE: 2, // 강화 카드 on first clear = phase * this
  // 도감 보너스: every owned hero (and every star on them) buffs the whole party, so duplicates/leftover cards still matter
  COLLECTION: { atkPerHero: 0.01, atkPerStar: 0.005, goldPerHero: 0.01 },
  AUTO_UPGRADE_INTERVAL: 1.0,
  // 보물 상자: a chest may join a normal wave; killing it drops cards + gems. 30% are mimics that bite back.
  CHEST: { chance: 0.06, mimicChance: 0.3, hpMult: 0.6, gemsMin: 3, gemsMax: 8, cardsPerPhase: 1 },
  // 회사 이전 (prestige): reset progression for permanent 지분 (+3% ATK & gold each). Needs Phase 3 cleared.
  PRESTIGE: { minCleared: 30, bonusPerShare: 0.03 },
  // 각성 (awakening): a ★5 card can be awakened with 강화 카드 — permanent +25% ATK/HP, trait ×1.5, skill ×1.25, gold frame
  AWAKEN: { star: 5, cards: { D: 60, C: 100, B: 160, A: 260, S: 400 }, atk: 0.25, hp: 0.25, trait: 1.5, skill: 1.25 },
  COMBO: { perHit: 0.005, max: 0.25, decay: 3 },
  // 승산 forecast (calibrated with headless sims, scripts/calib): power ratio = (partyDPS/enemyHP) / (enemyDPS/partyHP)
  FORECAST: { normal: [2, 10], boss: [3, 15], bossTimeFrac: 0.9 }, // ratio at which win chance is 0% / 100%
  SAFE_ADVANCE_MIN: 0.35,   // auto-advance waits (keeps farming) while the forecast is below this
  TEN_PULL_MIN_GRADE: 'A',  // a 10-pull always contains at least one A // consecutive hero hits without taking damage: +0.5% dmg each, cap +25%     // seconds between automatic "자동 합계" passes when the toggle is on

  GEMS_FIRST_CLEAR: 10, GEMS_REPEAT_CLEAR: 1,
  GEMS_BOSS_FIRST: 50,  GEMS_BOSS_REPEAT: 10,

  GACHA_SINGLE_COST: 100,
  GACHA_TEN_COST: 900,
  PITY_A: 50,               // 50 pulls without A+ -> guaranteed A or better
  PITY_S: 100,              // 100 pulls without S -> guaranteed S
  DUPLICATE_SHARDS_MIN: 5,
  DUPLICATE_SHARDS_MAX: 10,
  UNLOCK_SHARDS: 10,

  STARTING_GOLD: 0,
  STARTING_GEMS: 1000,
  PARTY_SIZE: 5,
  MAX_STAR: 5,
  SKILL_UNLOCK_STAR: 2,
  SKILL_BOOST_STAR: 4,
  SKILL_BOOST_MULT: 1.5,

  // Main hero job promotion: enhance cards + highest cleared stage requirement, per tier (D->C, C->B, B->A, A->S)
  MAIN_PROMOTE_CARDS: [20, 60, 150, 400],
  MAIN_PROMOTE_STAGE: [5, 15, 30, 50],
  MAIN_SKILL_TIER: 1,       // job tier at which the main hero's skill unlocks (사원)
  MAIN_SKILL_BOOST_TIER: 3, // 과장

  TEAM_UPGRADES: {
    coffee:  { name: '커피 머신',   desc: '공격 속도 +2% / Lv', per: 0.02, base: 50, growth: 1.25, max: 50 },
    payroll: { name: '성과급 제도', desc: '골드 획득 +5% / Lv', per: 0.05, base: 50, growth: 1.25, max: 100 },
    chairs:  { name: '인체공학 의자', desc: '파티 HP +5% / Lv', per: 0.05, base: 40, growth: 1.22, max: 100 },
  },

  SAVE_INTERVAL_MS: 10_000,
});

const B = BALANCE;

// --- GDD formulas -----------------------------------------------------------
export const upgradeCost = (level) => Math.floor(B.UPGRADE_COST_BASE * B.UPGRADE_COST_GROWTH ** (Math.max(1, level) - 1));
export const monsterHP   = (stage) => Math.floor(B.MONSTER_HP_BASE * B.MONSTER_HP_GROWTH ** (Math.max(1, stage) - 1));
export const baseGold    = (stage) => Math.floor(B.GOLD_BASE * B.GOLD_GROWTH ** (Math.max(1, stage) - 1));
export const offlineGold = (goldPerSec, seconds) => {
  const s = Math.min(Math.max(0, seconds), B.OFFLINE_CAP_SEC);
  return Math.floor(goldPerSec * s * B.OFFLINE_EFFICIENCY);
};

// --- Derived ----------------------------------------------------------------
export const monsterATK = (stage) => Math.max(1, Math.floor(B.MONSTER_ATK_BASE * B.MONSTER_ATK_GROWTH ** (Math.max(1, stage) - 1)));
export const isBossStage = (stage) => stage % B.BOSS_EVERY === 0;
export const bossHP  = (stage) => monsterHP(stage) * B.BOSS_HP_MULT;
export const bossATK = (stage) => monsterATK(stage) * B.BOSS_ATK_MULT;
export const bossGold = (stage) => baseGold(stage) * B.BOSS_GOLD_MULT;

/** "Phase 1-1" .. "Phase 1-10" (10 = boss), stage 11 -> "Phase 2-1" */
export function stageLabel(stage) {
  const s = Math.max(1, stage);
  const phase = Math.floor((s - 1) / B.BOSS_EVERY) + 1;
  const sub = ((s - 1) % B.BOSS_EVERY) + 1;
  return `Phase ${phase}-${sub}`;
}

export const starMult = (star) => B.STAR_MULT[Math.min(B.MAX_STAR, Math.max(1, star)) - 1];
export const enhanceMult = (enhance) => 1 + B.ENHANCE_PER_LEVEL * Math.min(B.ENHANCE_MAX, Math.max(0, enhance | 0));
export const enhanceCost = (enhance) => Math.floor(B.ENHANCE_COST_BASE * B.ENHANCE_COST_GROWTH ** Math.max(0, enhance | 0));

export function heroATK(base, level, star, enhance = 0) {
  return Math.floor(base * B.HERO_ATK_GROWTH ** (Math.max(1, level) - 1) * starMult(star) * enhanceMult(enhance));
}
export function heroHP(base, level, star, hpBonus = 0, enhance = 0) {
  return Math.floor(base * B.HERO_HP_GROWTH ** (Math.max(1, level) - 1) * starMult(star) * enhanceMult(enhance) * (1 + hpBonus));
}

export function teamUpgradeCost(key, level) {
  const t = B.TEAM_UPGRADES[key];
  return Math.floor(t.base * t.growth ** level);
}
export function teamUpgradeBonus(key, level) {
  const t = B.TEAM_UPGRADES[key];
  return t.per * Math.min(level, t.max);
}

/**
 * Estimated gold/sec a party earns while farming `stage` at `partyDPS`.
 * Kill time = HP / DPS, plus respawn delay and walk-in time (~1s).
 * Capped so an absurd DPS cannot yield > MAX_MONSTERS kills/sec.
 */
export function estimateGoldPerSec(stage, partyDPS, goldMult = 1) {
  const dps = Math.max(1, partyDPS);
  const killTime = monsterHP(stage) / dps + B.RESPAWN_DELAY + 1;
  const killsPerSec = Math.min(B.MAX_MONSTERS, 1 / killTime);
  return baseGold(stage) * goldMult * killsPerSec;
}

/** 지분 earned by prestiging at `maxCleared`: 30 → 5, 50 → 11, 100 → 31. */
export const prestigeShares = (maxCleared) => (maxCleared < B.PRESTIGE.minCleared ? 0 : Math.floor((maxCleared / 10) ** 1.5));

/** Quest/daily rewards are relative: N times the gold-per-kill of the player's best stage. */
export const relativeGold = (maxStage, kills, goldMult = 1) => Math.floor(baseGold(Math.max(1, maxStage)) * kills * goldMult);
