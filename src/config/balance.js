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
  AD: { perDay: 9, durationSec: 5 }, // total rewarded ads per day (sum of the offer caps); durationSec = placeholder ad length
  /** Rewarded-ad menu. Every reward is flat (never a multiplier on offline earnings, so leaving the game closed is never the better play). */
  AD_OFFERS: {
    gold:     { perDay: 3, hours: 1,    name: '유휴 골드 1시간분',  desc: '현재 스테이지 골드 수익 1시간분을 즉시 지급' },
    gems:     { perDay: 2, amount: 15,  name: '보석 +15',           desc: '뽑기 재화. 하루 2회' },
    cards:    { perDay: 2, amount: 10,  name: '강화 카드 +10',      desc: '강화·한계 돌파 재화. 하루 2회' },
    dispatch: { perDay: 1,              name: '출장 즉시 복귀',     desc: '진행 중인 출장을 바로 끝내고 보상 수령 가능' },
    overtime: { perDay: 1,              name: '야근 모드 추가 1회', desc: '오늘 야근을 이미 했어도 한 번 더' },
  },
  // 출장: send up to 3 bench heroes away for a few hours; gems by grade + cards by phase + affection for the travellers
  DISPATCH: { hours: 4, slots: 3, maxPerDay: 2, gemsBase: 20, gemsPerGrade: { D: 3, C: 5, B: 8, A: 12, S: 20 }, cardsPerPhase: 1, affectionXp: 60 },
  // 스킬 강화: 강화 카드로 스킬 레벨 (★2 해금 후). 레벨당 위력 +10%, 재사용 대기 -3%. 비용 = cardCost[grade] × 다음 레벨
  SKILL_LEVEL: { max: 5, powerPerLevel: 0.10, cooldownPerLevel: 0.03, cardCost: { D: 8, C: 12, B: 20, A: 32, S: 50 } },
  // 호감도: party members earn xp per kill; a daily 간식 (gold) adds a chunk. Each level = +1% ATK/HP for that hero.
  AFFECTION: { maxLevel: 10, xpBase: 60, xpGrowth: 1.45, xpPerKill: 1, xpPerBoss: 15, giftXp: 45, giftGoldKills: 40, bonusPerLevel: 0.01, unlockSecret: 3, unlockLine: 5 },
  // 사내 메신저: first read of an episode pays gems
  STORY: { gems: 30 },
  // 비품: office supplies that drop from stage clears. Four slots per hero; a full S set is about +64% on one stat,
  // less than ★ or 각성 give, so 비품 supplements the existing axes instead of replacing them.
  EQUIP: {
    dropChance: 0.35, bossDropChance: 1, bossRolls: 2, // boss clears roll twice and keep the better item
    bossFirstMinGrade: 'B', bossFirstRolls: 4,          // a boss's FIRST clear rolls more and floors the grade
    maxLevel: 10, pctPerLevel: 0.12,                   // +12% of the base value per level (S 키보드: 16% → 35%)
    upgradeGoldKills: 12, upgradeGrowth: 1.35,         // cost in "kills worth of gold" at the hero's stage, per level
    dismantleGoldKills: { D: 2, C: 4, B: 8, A: 16, S: 32 },
    inventoryMax: 120,
    // 세트: filling all four slots is worth something on its own; matching grades is worth more. Percentages are
    // added to every stat, so a full S set is +24% on top of the items themselves.
    setAny: 3,
    setSame: { D: 4, C: 7, B: 11, A: 16, S: 24 },
  },
  // 야근 모드: once a day, 60 s of dense waves from (max stage + offset) with a high elite rate; gems per kill, no stage progress
  OVERTIME: { duration: 60, stageOffset: 3, count: 7, elite: 0.35, gemsPerKill: 2, gemsPerElite: 6, maxGems: 400, cardsPerPhase: 2, travel: 0.4 },

  // --- Derived (not in GDD) ---------------------------------------------
  MONSTER_ATK_BASE: 1,     MONSTER_ATK_GROWTH: 1.13,
  HERO_ATK_GROWTH: 1.10,   // per level (cost grows 1.12 -> slow soft wall, solved by stars/enhance/jobs)
  HERO_HP_GROWTH: 1.08,
  STAR_MULT: [1, 1.25, 1.6, 2.1, 2.8], // index = star-1
  ENHANCE_PER_LEVEL: 0.04,  // +4% ATK & HP per enhance level
  ENHANCE_MAX: 60,          // absolute cap (★5 + 각성)
  ENHANCE_CAP_BY_STAR: [10, 20, 30, 40, 50], // cap per ★ (index star-1); 각성 adds ENHANCE_CAP_AWAKEN
  ENHANCE_CAP_AWAKEN: 10,
  ENHANCE_CAP_BY_TIER: [10, 20, 30, 40, 50],  // main hero: cap per job tier
  LEVEL_REFUND: 1.0,        // levels can be undone; gold is refunded at this rate so it can move between cards
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
  STAR_TRAIT_BOOST: { star: 3, mult: 1.25 }, // ★ perks: ★2 skill unlock · ★3 trait ×1.25 · ★4 skill ×1.5 · ★5 awakening (trait ×1.5, skill ×1.25) + enhance cap ★×10`,
  // 승산 forecast (calibrated with headless sims, scripts/calib): power ratio = (partyDPS/enemyHP) / (enemyDPS/partyHP)
  FORECAST: { normal: [2, 10], boss: [3, 15], bossTimeFrac: 0.9 }, // ratio at which win chance is 0% / 100%
  SAFE_ADVANCE_MIN: 0.35,   // auto-advance waits (keeps farming) while the forecast is below this
  TEN_PULL_MIN_GRADE: 'A',
  FIRST_TEN_GUARANTEE: 'S',  // 신입 환영: the very first 10-pull of a save always contains an S  // a 10-pull always contains at least one A // consecutive hero hits without taking damage: +0.5% dmg each, cap +25%     // seconds between automatic "자동 합계" passes when the toggle is on

  GEMS_FIRST_CLEAR: 10, GEMS_REPEAT_CLEAR: 1,
  GEMS_BOSS_FIRST: 50,  GEMS_BOSS_REPEAT: 10,
  GEMS_REPEAT_PER_PHASE: 1,      // 반복 클리어: 페이즈당 +1 (deep stages take minutes, so a flat 1 starved the gacha)
  GEMS_BOSS_REPEAT_PER_PHASE: 5, // 반복 보스: 페이즈당 +5

  GACHA_SINGLE_COST: 100,
  GACHA_TEN_COST: 900,
  PITY_A: 50,               // 50 pulls without A+ -> guaranteed A or better
  PITY_S: 120,              // 120 pulls without S -> guaranteed S (S is 0.5%: rarer, so the floor moved out a little)
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
  // 승진은 구매가 아니라 졸업: 직급마다 그 티어의 강화 한계(10/20/30/40)를 모두 채우고 레벨도 찍어야 한다
  MAIN_PROMOTE_LEVEL: [15, 40, 80, 140],
  MAIN_PROMOTE_STAGE: [5, 15, 30, 50],
  MAIN_SKILL_TIER: 1,       // job tier at which the main hero's skill unlocks (사원)
  MAIN_SKILL_BOOST_TIER: 3, // 과장

  // 회사 업그레이드 buff the whole party at once, so they cost far more than a single hero level (base ×8, steeper growth):
  // 커피 Lv30 ≈ 660k gold ≈ one hero at Lv 100; 의자 Lv 100 ≈ 3e12 (late game sink).
  TEAM_UPGRADES: {
    coffee:  { name: '커피 머신',     desc: '파티 공격 속도 +2% / Lv',        per: 0.02,  base: 400, growth: 1.28, max: 50 },
    payroll: { name: '성과급 제도',   desc: '처치 시 보석 드롭 확률 +0.1% / Lv', per: 0.001, base: 300, growth: 1.28, max: 50, unit: 'pct' },
    chairs:  { name: '인체공학 의자', desc: '파티 HP +5% / Lv',               per: 0.05,  base: 300, growth: 1.26, max: 100 },
    sales:   { name: '매출 인센티브',   desc: '골드 획득 +1% / Lv',              per: 0.01,  base: 350, growth: 1.27, max: 50 }, // deliberately mild (+50% at max) so it stretches, not breaks, the curve
  },
  // 보석 드롭: every non-boss kill may drop a gem (elites drop more). Base chance + 성과급 제도 levels.
  GEM_DROP: { base: 0.005, amount: 1, eliteMult: 3 },

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
/** Max enhance level a card can take right now: by star (or job tier for the main hero), +10 when awakened. */
export const enhanceCap = (star, awakened = false, mainTier = null) => {
  const base = mainTier !== null ? B.ENHANCE_CAP_BY_TIER[Math.min(B.ENHANCE_CAP_BY_TIER.length - 1, Math.max(0, mainTier))] : B.ENHANCE_CAP_BY_STAR[Math.min(B.ENHANCE_CAP_BY_STAR.length - 1, Math.max(1, star) - 1)];
  return Math.min(B.ENHANCE_MAX, base + (awakened ? B.ENHANCE_CAP_AWAKEN : 0));
};
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

/**
 * Gems a stage clear pays. First clears are a fixed milestone; repeats scale with the phase, because a repeat at
 * phase 7 costs the player minutes where a phase-1 repeat costs seconds.
 */
export const gemsForClear = (stage, { first = false, boss = false } = {}) => {
  const phase = Math.floor((Math.max(1, stage) - 1) / B.BOSS_EVERY);
  if (boss) return first ? B.GEMS_BOSS_FIRST : B.GEMS_BOSS_REPEAT + phase * B.GEMS_BOSS_REPEAT_PER_PHASE;
  return first ? B.GEMS_FIRST_CLEAR : B.GEMS_REPEAT_CLEAR + phase * B.GEMS_REPEAT_PER_PHASE;
};
