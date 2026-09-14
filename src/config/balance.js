// ---------------------------------------------------------------------------
// Excel Heroes - balance constants & formulas (pure, no DOM)
// Formulas from the GDD are kept verbatim; everything the GDD left undefined
// (hero growth, monster ATK, gems, boss multipliers...) is derived here and
// documented in docs/BALANCE.md.
// ---------------------------------------------------------------------------

export const BALANCE = Object.freeze({
  // --- GDD formulas -------------------------------------------------------
  UPGRADE_COST_BASE: 10,   UPGRADE_COST_GROWTH: 1.12, // Cost = floor(10 * 1.12^(L-1))
  MONSTER_HP_BASE: 50,     MONSTER_HP_GROWTH: 1.18,   // HP   = floor(50 * 1.18^(S-1))
  GOLD_BASE: 5,            GOLD_GROWTH: 1.15,         // Gold = floor(5  * 1.15^(S-1))
  OFFLINE_CAP_SEC: 12 * 3600, OFFLINE_EFFICIENCY: 0.8, OFFLINE_MIN_SEC: 60,

  // --- Derived (not in GDD) ---------------------------------------------
  MONSTER_ATK_BASE: 1,     MONSTER_ATK_GROWTH: 1.13,
  HERO_ATK_GROWTH: 1.10,   // per level (cost grows 1.12 -> slow soft wall, solved by stars/gacha/offline)
  HERO_HP_GROWTH: 1.08,
  STAR_MULT: [1, 1.25, 1.6, 2.1, 2.8], // index = star-1

  KILLS_PER_STAGE: 20,
  BOSS_EVERY: 10,
  BOSS_TIME_LIMIT: 30,
  BOSS_HP_MULT: 8,
  BOSS_ATK_MULT: 3,
  BOSS_GOLD_MULT: 20,

  MAX_MONSTERS: 5,
  RESPAWN_DELAY: 1.0,
  MONSTER_SPEED: 42,        // px / s
  HERO_SPEED: 70,
  HERO_REVIVE_SEC: 8,
  HERO_REGEN_PCT: 0.02,     // fraction of max HP regenerated per second while alive
  MELEE_ADVANCE_CELLS: 2,   // how far a melee hero may leave formation

  GEMS_FIRST_CLEAR: 10, GEMS_REPEAT_CLEAR: 1,
  GEMS_BOSS_FIRST: 50,  GEMS_BOSS_REPEAT: 10,

  GACHA_SINGLE_COST: 100,
  GACHA_TEN_COST: 900,
  PITY_EXECUTIVE: 50,
  PITY_CEO: 100,
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

  TEAM_UPGRADES: {
    coffee:  { name: 'Coffee Machine',  desc: '+2% attack speed / lv', per: 0.02, base: 50, growth: 1.25, max: 50 },
    payroll: { name: 'Payroll Bonus',   desc: '+5% gold / lv',         per: 0.05, base: 50, growth: 1.25, max: 100 },
    chairs:  { name: 'Ergonomic Chairs',desc: '+5% party HP / lv',     per: 0.05, base: 40, growth: 1.22, max: 100 },
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

export function heroATK(base, level, star) {
  return Math.floor(base * B.HERO_ATK_GROWTH ** (Math.max(1, level) - 1) * starMult(star));
}
export function heroHP(base, level, star, hpBonus = 0) {
  return Math.floor(base * B.HERO_HP_GROWTH ** (Math.max(1, level) - 1) * starMult(star) * (1 + hpBonus));
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
