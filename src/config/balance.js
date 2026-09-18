// ---------------------------------------------------------------------------
// Excel Heroes - balance constants & formulas (pure, no DOM)
// GDD formulas are kept verbatim; everything the GDD left open is derived here
// and documented in docs/BALANCE.md.
// ---------------------------------------------------------------------------

export const BALANCE = Object.freeze({
  // --- GDD formulas -------------------------------------------------------
  UPGRADE_COST_BASE: 10,   UPGRADE_COST_GROWTH: 1.105, // Cost = floor(10 * 1.105^(L-1)) — see docs/BALANCE.md 6-58
  MONSTER_HP_BASE: 50,     MONSTER_HP_GROWTH: 1.18,   // HP   = floor(50 * 1.18^(S-1))
  // 깊이 갈수록 초당 살 수 있는 레벨이 줄어드는 것은 **의도된 벽**이다(회사 이전이 존재하는 이유).
  // 측정: 118단계의 초당/레벨비용은 10단계의 1/12.5. 이 기울기를 없애면 벽도 없어진다 —
  // `tests/balance.test.js` 의 drift 검사가 그 경계를 지킨다(1.005 < drift, drift^50 < 6).
  GOLD_BASE: 5,            GOLD_GROWTH: 1.16,         // Gold = floor(5  * 1.16^(S-1))

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
  // 적 화력 유예 곡선. 성장률(1.13)은 파티 체력 성장률과 거의 같아서 '여유'가 단계와 무관하게 일정한데,
  // 그 일정한 값이 80~190배였다 — 교전이 3~14초, 파티가 쓰러지는 데 300초. 그래서 생존 시스템이 전부
  // 장식이었다. 수준만 올리고 곡선은 그대로 둔다. 초반은 영웅 한 명으로 버티는 구간이라 유예를 준다.
  MONSTER_ATK_RAMP: { full: 5, byStage: 25 },
  HERO_ATK_GROWTH: 1.10,   // per level (cost grows 1.12 -> slow soft wall, solved by stars/enhance/jobs)
  HERO_HP_GROWTH: 1.08,
  STAR_MULT: [1, 1.25, 1.6, 2.1, 2.8], // index = star-1
  ENHANCE_PER_LEVEL: 0.04,  // +4% ATK & HP per enhance level
  ENHANCE_MAX: 60,          // absolute cap (★5 + 각성)
  ENHANCE_CAP_BY_STAR: [10, 20, 30, 40, 50], // cap per ★ (index star-1); 각성 adds ENHANCE_CAP_AWAKEN
  ENHANCE_CAP_AWAKEN: 10,
  ENHANCE_CAP_BY_TIER: [10, 20, 30, 40, 50],  // main hero: cap per job tier
  // 레벨 상한: ★로만 열린다. 골드는 벽까지만 데려다주고, 그다음은 **같은 카드 N장**의 몫(★N = N장).
  // 스테이지 1단계에 약 1.74레벨이 필요하므로 ★1 ≈ 34단계 · ★3 ≈ 92단계 · ★5 ≈ 149단계 · ★5+각성 ≈ 172단계.
  LEVEL_CAP_BY_STAR: [80, 140, 200, 260, 320],
  LEVEL_CAP_AWAKEN: 50,
  MAIN_LEVEL_CAP_BY_TIER: [80, 140, 200, 260, 320], // 주인공은 ★ 대신 직급으로 열린다
  LEVEL_REFUND: 1.0,        // levels can be undone; gold is refunded at this rate so it can move between cards
  // 강화도 같은 규칙이다. 되돌릴 수 없으면 낮은 등급에 부은 강화 카드가 묶이고, 그건 골드에서 이미
  // 고친 문제다(6-88). 100%가 아니면 '옮기면 손해' 가 되어 옮기지 않게 된다.
  ENHANCE_REFUND: 1.0,
  ENHANCE_COST_BASE: 10, ENHANCE_COST_GROWTH: 1.2, // enhance cards
  // 경력직 스카우트: 골드 → **같은 카드 1장**. ★ 사이에서 골드가 할 일을 잃지 않게 하는 유일한 상시 소비처다.
  // 값 = 지금 ★의 레벨 상한을 채우는 누적 골드 × costPct × 등급 배수. 하루 한도가 가챠의 자리를 지킨다.
  SCOUT: { perDay: 3, costPct: 0.35, gradeMult: { D: 0.5, C: 0.8, B: 1.2, A: 2, S: 3.5 }, minCost: 50_000 },
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
  // 쓰러진 영웅은 그 스테이지 동안 일어나지 못한다(부활 스킬만 예외). 자동 부활이 있으면 탱커 하나로
  // 영원히 전진할 수 있어서 파티를 짤 이유가 사라진다. 전원이 쓰러지면 직전 스테이지로 후퇴한다.
  // 탱커 상시 '대신 맞기': 아군이 맞을 피해의 share 만큼을 앞선 탱커가 대신 받고, 그 몫은 reduce 만큼 줄어든다.
  // 둘 다 ★로 오른다 — 좋은 탱커일수록 더 많이, 더 싸게 막는다.
  // 탱커 '대신 맞기': 매 타격마다 chance 확률로 가로챈다. 터지면 아군은 안 맞고 탱커가 reduce 만큼
  // 감면된 채로 전부 받는다 — 무조건 나눠 받는 게 아니라 **막거나 못 막거나**다. 둘 다 ★로 오른다.
  TANK: { chance: 0.30, chancePerStar: 0.07, chanceMax: 0.60, reduce: 0.25, reducePerStar: 0.05, reduceMax: 0.5 },
  // 인사 복구: 죽음이 영구해진 뒤로 가장 값비싼 스킬이다. 확정 1명 + 추가 인원마다 확률 굴림.
  // 확률은 ★(시전자)로 오르고, 최대 추가 인원이 상한이다 — 좋은 시전자는 한 번에 셋까지 일으킨다.
  REVIVE: { extraChance: 0.30, extraPerStar: 0.10, extraMax: 2 },
  // 스킬 고도화: 모든 스킬이 ★로 **성질**이 바뀐다(수치만 커지는 게 아니라). s = ★ - 1 에 비례.
  // 중복 카드를 계속 뽑을 이유이자, 등급이 아니라 ★이 캐릭터를 완성한다는 뜻.
  // 특성도 ★에 반응한다. 스킬만 ★로 커지면, 특성이 정체성인 영웅은 ★을 올릴 이유가 약해진다.
  TRAIT_STAR: { perStar: 0.12 }, // ★당 +12% → ★5는 ×1.48
  // 역할 상시 효과: 탱커만 정체성이 있으면 나머지 셋은 스킬로만 구분된다. 넷 다 늘 일하게 하고, 전부 ★로 커진다.
  ROLE_PASSIVE: {
    healer: { regen: 0.006, perStar: 0.0015 },          // 파티 전원 초당 최대 HP 회복 (★5 0.6%→1.2%)
    melee:  { haste: 0.12, perStar: 0.04, dur: 2.5 },   // 처치 시 자신의 공격 속도 상승, 2.5초
    ranged: { pierce: 0.18, perStar: 0.05, dmg: 0.5 },  // 기본 공격이 뒤쪽 적까지 관통 (피해 50%)
  },
  SKILL_STAR: {
    duration: 0.4,      // 지속형(화상·보호막·가속·도발·정화·버프): ★당 +0.4초
    stun: 0.3,          // 필살기 기절: ★당 +0.3초
    extraHit: 0.12,     // 강타·범위 정리: ★당 한 번 더 때릴 확률
    chainPerStar: 0.5,  // 연쇄: ★당 대상 +0.5명 (★3에 4명, ★5에 5명)
    chainFalloff: 0.03, // 연쇄 감쇠 완화: ★당 +3%p (0.70 → 0.82)
    execThreshold: 0.03,// 처형 기준: ★당 +3%p (30% → 42%)
    drainLeech: 0.05,   // 흡혈 비율: ★당 +5%p (40% → 60%)
    healShield: 0.05,   // 회복: 넘친 만큼 ★당 최대 HP 5%까지 보호막으로
  },
  // 자연 회복. 전투 중에 크게 회복되면 탱커·힐러·보호막·부활이 전부 장식이 된다 — 실제로 그랬다
  // (2시간 계측에서 평균 체력 99.8%, 체력 50% 미만인 시간 0.02%). 회복은 힐러의 일이어야 한다.
  HERO_REGEN_PCT: 0.004,        // 전투 중 초당 회복 (적이 붙어 있을 때)
  HERO_REGEN_IDLE_PCT: 0.06,    // 전투 밖 초당 회복 — 다음 웨이브까지 회복하는 건 지루함이 아니라 준비다
  MELEE_ADVANCE_CELLS: 3,   // how far (cells) a melee hero may leave formation
  ELITE: { hp: 2.5, atk: 1.5, gold: 3 },
  CARDS_FIRST_CLEAR_PER_PHASE: 2, // 강화 카드 on first clear = phase * this
  // 도감 보너스: every owned hero (and every star on them) buffs the whole party, so duplicates/leftover cards still matter
  COLLECTION: { atkPerHero: 0.01, atkPerStar: 0.005, goldPerHero: 0.01 },
  AUTO_UPGRADE_INTERVAL: 1.0,
  // 보물 상자: a chest may join a normal wave; killing it drops cards + gems. 30% are mimics that bite back.
  CHEST: { chance: 0.06, mimicChance: 0.3, hpMult: 0.6, gemsMin: 3, gemsMax: 8, cardsPerPhase: 1 },
  // 회사 이전 (prestige): reset progression for permanent 지분 (+3% ATK & gold each). Needs Phase 3 cleared.
  // 수식 대응: 보스가 특수 공격을 예고하면 수식 입력줄에 =SUM(a, b) 가 뜬다. 제한 시간 안에 답을 치면
  // 그 한 방이 약해진다. 전투 중 유일한 조작이고, 안 쳐도 예전과 똑같으므로 방치 플레이에는 손해가 없다.
  // 읽고 더하고 치는 데 드는 시간이 limit 이다 — 짧으면 운, 길면 의미가 없다.
  BRACE: { limit: 4.0, reduce: 0.6, max: 89 },
  PRESTIGE: { minCleared: 30, bonusPerShare: 0.03 },
  // 각성 (awakening): a ★5 card can be awakened with 강화 카드 — permanent +25% ATK/HP, trait ×1.5, skill ×1.25, gold frame
  AWAKEN: { star: 5, cards: { D: 60, C: 100, B: 160, A: 260, S: 400 }, atk: 0.25, hp: 0.25, trait: 1.5, skill: 1.25 },
  COMBO: { perHit: 0.005, max: 0.25, decay: 3 },
  STAR_TRAIT_BOOST: { star: 3, mult: 1.25 }, // ★ perks: ★2 skill unlock · ★3 trait ×1.25 · ★4 skill ×1.5 · ★5 awakening (trait ×1.5, skill ×1.25) + enhance cap ★×10`,
  // 승산 forecast (calibrated with headless sims, scripts/calib): power ratio = (partyDPS/enemyHP) / (enemyDPS/partyHP)
  FORECAST: { normal: [2, 10], boss: [3, 15], bossTimeFrac: 0.9 }, // ratio at which win chance is 0% / 100%
  // 안전 자동 진행이 기다리는 문턱. 중첩 객체인 이유는 BALANCE 가 freeze 라서 — 스칼라로 두면
  // 감사 스크립트가 값을 바꿀 수 없고(대입이 조용히 무시된다) 그러면 훑어 볼 수도 없다.
  SAFE_ADVANCE: { min: 0.35 },
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
  // 중복 카드는 한 장으로 쌓인다(한계 돌파가 '같은 카드 N장'이 된 뒤로 · 6-107). 아래 두 값은
  // 남겨 두지만 뽑기 경로에서는 쓰이지 않는다 — 광고·업적 보상이 참조한다.
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
  GEM_DROP: { base: 0.005, amount: 1, amountPerPhase: 0.5, eliteMult: 3 }, // 처치 드롭만이 벽에서도 계속 돈다 → 깊이에 비례

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
/** 적 화력 유예 배수. 1단계 1배에서 시작해 `byStage`에서 `full`배가 되고, 그 뒤로는 일정하다. */
export const atkRamp = (stage) => {
  const { full, byStage } = B.MONSTER_ATK_RAMP;
  const t = Math.min(1, Math.max(0, (Math.max(1, stage) - 1) / (byStage - 1)));
  return 1 + (full - 1) * t;
};
export const monsterATK = (stage) => Math.max(1, Math.floor(B.MONSTER_ATK_BASE * B.MONSTER_ATK_GROWTH ** (Math.max(1, stage) - 1) * atkRamp(stage)));
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

/** Gems per drop at a given stage. Flat drops made deep farming pay the same as phase 1; see docs/BALANCE.md 6-59. */
export const gemDropAmount = (stage) => B.GEM_DROP.amount + Math.floor(Math.floor((Math.max(1, stage) - 1) / B.BOSS_EVERY) * B.GEM_DROP.amountPerPhase);

/** Highest level a card may reach: ★ (or the main hero's job tier) is what raises the ceiling, never gold. */
export const levelCap = (star, awakened = false, tier = null) => (tier !== null
  ? B.MAIN_LEVEL_CAP_BY_TIER[Math.min(tier, B.MAIN_LEVEL_CAP_BY_TIER.length - 1)]
  : B.LEVEL_CAP_BY_STAR[Math.max(0, Math.min(Math.max(1, star) - 1, B.LEVEL_CAP_BY_STAR.length - 1))]) + (awakened ? B.LEVEL_CAP_AWAKEN : 0);

/** 같은 카드 1장을 골드로 사는 값: 지금 ★의 상한을 채우는 누적 골드에 비례한다(그래서 후반까지 따라온다). */
export const scoutCost = (grade, star, cap) => {
  let sunk = 0; for (let l = 1; l < cap; l++) sunk += upgradeCost(l);
  return Math.max(B.SCOUT.minCost, Math.floor(sunk * B.SCOUT.costPct * (B.SCOUT.gradeMult[grade] ?? 1)));
};

