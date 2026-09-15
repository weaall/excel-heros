// Global game state, economy, stage flow and player actions. Emits events for the UI.
import {
  BALANCE, upgradeCost, baseGold, bossGold, isBossStage, stageLabel, heroATK, heroHP,
  teamUpgradeCost, teamUpgradeBonus, estimateGoldPerSec, enhanceCost, enhanceCap, offlineGold, prestigeShares,
} from '../config/balance.js';
import { HERO_BY_ID, GRADES, SKILLS, TRAITS, heroBaseStats, MAIN_ID, MAIN_JOBS } from '../data/heroes.js';
import { pullOnce, promoteCost } from './GachaManager.js';
import { createInitialState } from './state.js';
import { stageModifier } from '../data/stages.js';
import { bossForStage } from '../data/monsters.js';
import { monsterHP, monsterATK, bossHP, bossATK } from '../config/balance.js';
import { EntityManager } from './EntityManager.js';
import * as Quests from './QuestManager.js';
import * as Achievements from './AchievementManager.js';
import * as Milestones from './MilestoneManager.js';
import { HEROES } from '../data/heroes.js';
import { Emitter } from '../utils/events.js';
import { createRng } from '../utils/rng.js';

export class GameManager extends Emitter {
  static HISTORY_STEP = 5; static HISTORY_LEN = 120; // 10 minutes of samples
  constructor({ state, save, rng = createRng(), now = Date.now() } = {}) {
    super();
    this.state = state ?? createInitialState(now);
    this.save = save;
    this.rng = rng;
    this.logs = [];
    this.rowCounter = 1000 + Math.floor(Math.random() * 500);
    this.saveTimer = 0; this.dailyTimer = 0; this.autoTimer = 0; this.resumeTimer = 0; this.waitingAdvance = false;
    // rolling history for the 통계_차트 sheet (in-memory): one sample per HISTORY_STEP seconds, last HISTORY_LEN samples
    this.history = { t: [], goldPerMin: [], dps: [], stage: [] }; this.historyTimer = 0; this.historyGold = this.state.stats.totalGold;
    Quests.ensureDaily(this.state, now);
    this.entities = new EntityManager(this);
    this.entities.rebuildParty();
    this.entities.startStage();
  }

  // ------------------------------------------------------------- derived --
  stageLabel() { return stageLabel(this.state.stage); }
  goldMult() { return 1 + teamUpgradeBonus('payroll', this.state.team.payroll) + TRAITS.greedy.value * this.partyTraitCount('greedy') + this.collection().gold + this.prestigeBonus(); }
  /** Permanent bonus from 지분 (prestige shares): +3% ATK and gold each. */
  prestigeBonus() { return (this.state.prestige?.shares ?? 0) * BALANCE.PRESTIGE.bonusPerShare; }
  prestigeInfo() {
    const s = this.state; const gain = prestigeShares(s.maxCleared);
    return { shares: s.prestige.shares, count: s.prestige.count, bonus: this.prestigeBonus(), gain, eligible: gain > 0, minCleared: BALANCE.PRESTIGE.minCleared, perShare: BALANCE.PRESTIGE.bonusPerShare };
  }
  /** 회사 이전: reset stage/gold/levels/team upgrades for permanent 지분. Heroes, cards, gems, job, achievements and stats stay. */
  prestige() {
    const info = this.prestigeInfo(); if (!info.eligible) return null;
    const s = this.state;
    s.prestige.shares += info.gain; s.prestige.count += 1;
    s.stage = 1; s.maxStage = 1; s.maxCleared = 0; s.kills = 0; s.gold = 0; s.challenging = true;
    for (const e of Object.values(s.heroes)) e.level = 1;
    for (const k of Object.keys(s.team)) s.team[k] = 0;
    this.logs = [];
    this.log(`회사 이전 완료: 지분 +${info.gain} (총 ${s.prestige.shares}, 파티 ATK·골드 +${Math.round(this.prestigeBonus() * 100)}%)`, 'stage');
    this.entities = new EntityManager(this); this.entities.rebuildParty(); this.entities.startStage();
    this.persist(); this.emit('prestige', info); this.emit('reset');
    return { ...info, total: s.prestige.shares };
  }
  setSound(v) { this.state.settings.sound = !!v; this.emit('settings'); }
  setGridlines(v) { this.state.settings.gridlines = !!v; this.emit('settings'); }

  /** 파티 자동 편성: the strongest owned heroes by ATK, guaranteeing one tank and one healer when available. */
  autoParty() {
    const owned = Object.keys(this.state.heroes).filter((id) => this.state.heroes[id].owned && !this.isMain(id))
      .map((id) => this.heroView(id)).sort((a, b) => b.atk - a.atk);
    const slots = BALANCE.PARTY_SIZE - 1;
    const pick = [];
    for (const role of ['tank', 'healer']) { const best = owned.find((v) => v.def.role === role); if (best) pick.push(best); }
    for (const v of owned) { if (pick.length >= slots) break; if (!pick.includes(v)) pick.push(v); }
    this.state.party = [MAIN_ID, ...pick.slice(0, slots).map((v) => v.id)];
    this.entities.rebuildParty();
    this.log(`파티 자동 편성: ${this.state.party.map((id) => this.heroDef(id).name).join(', ')}`, 'info');
    this.emit('party'); this.emit('roster');
    return this.state.party;
  }
  /** 도감 보너스: owned heroes and their stars buff party ATK and gold income. */
  collection() {
    const owned = HEROES.filter((h) => this.state.heroes[h.id]?.owned);
    const stars = owned.reduce((a, h) => a + Math.max(1, this.state.heroes[h.id].star), 0);
    const C = BALANCE.COLLECTION;
    return { owned: owned.length, total: HEROES.length, stars, atk: owned.length * C.atkPerHero + stars * C.atkPerStar, gold: owned.length * C.goldPerHero };
  }
  partyTraitCount(trait) { return this.state.party.filter((id) => this.heroDef(id).trait === trait).length; }
  speedMult() { return 1 + teamUpgradeBonus('coffee', this.state.team.coffee); }
  hpBonus() { return teamUpgradeBonus('chairs', this.state.team.chairs); }
  isMain(id) { return id === MAIN_ID; }
  mainJob() { return MAIN_JOBS[this.state.main.job] ?? MAIN_JOBS.intern; }

  /** Definition for any hero id; the main hero's definition depends on the current job. */
  heroDef(id) { return this.isMain(id) ? { ...this.mainJob(), id: this.mainJob().id, isMain: true } : HERO_BY_ID[id]; }

  heroView(id) {
    const def = this.heroDef(id), entry = this.state.heroes[id];
    const base = heroBaseStats(def);
    const isMain = this.isMain(id);
    const star = Math.max(1, entry.star);
    const skillUnlocked = isMain ? def.tier >= BALANCE.MAIN_SKILL_TIER : entry.star >= BALANCE.SKILL_UNLOCK_STAR;
    const boosted = isMain ? def.tier >= BALANCE.MAIN_SKILL_BOOST_TIER : entry.star >= BALANCE.SKILL_BOOST_STAR;
    const awakened = !!entry.awakened;
    const skillPower = (boosted ? BALANCE.SKILL_BOOST_MULT : 1) * (awakened ? BALANCE.AWAKEN.skill : 1);
    const awakenCost = BALANCE.AWAKEN.cards[def.grade];
    const nextCost = isMain ? null : promoteCost(def.grade, star);
    const eCost = enhanceCost(entry.enhance);
    const view = {
      id, def, entry, isMain, grade: GRADES[def.grade], star,
      atk: Math.floor(heroATK(base.atk, entry.level, star, entry.enhance) * (1 + this.collection().atk + this.prestigeBonus()) * (awakened ? 1 + BALANCE.AWAKEN.atk : 1)),
      hp: Math.floor(heroHP(base.hp, entry.level, star, this.hpBonus(), entry.enhance) * (awakened ? 1 + BALANCE.AWAKEN.hp : 1)),
      awakened, traitMult: awakened ? BALANCE.AWAKEN.trait : 1, awakenCost,
      canAwaken: !isMain && entry.owned && !awakened && star >= BALANCE.AWAKEN.star && this.state.cards >= awakenCost,
      interval: base.interval, range: base.range,
      cost: upgradeCost(entry.level),
      inParty: this.state.party.includes(id),
      skillUnlocked, skillPower,
      skillName: SKILLS[def.skill.type].name,
      skillDesc: SKILLS[def.skill.type].desc.replace('{p}', +(def.skill.power * skillPower).toFixed(2)),
      traitName: TRAITS[def.trait].name, traitDesc: TRAITS[def.trait].desc,
      skillUnlockHint: isMain ? `${['인턴', '사원'][BALANCE.MAIN_SKILL_TIER]} 승급 시 해금` : `★${BALANCE.SKILL_UNLOCK_STAR} 해금`,
      promoteCost: nextCost,
      canPromote: !isMain && entry.owned && nextCost !== null && entry.shards >= nextCost,
      enhanceCap: enhanceCap(star, awakened, isMain ? def.tier : null),
      enhanceCost: eCost, enhanceMaxed: entry.enhance >= enhanceCap(star, awakened, isMain ? def.tier : null),
      canEnhance: entry.owned && entry.enhance < enhanceCap(star, awakened, isMain ? def.tier : null) && this.state.cards >= eCost,
      refundPerLevel: entry.level > 1 ? Math.floor(upgradeCost(entry.level - 1) * BALANCE.LEVEL_REFUND) : 0,
      shardCardValue: BALANCE.SHARD_CARD_VALUE[def.grade],
      canDismiss: !isMain && entry.owned && !this.state.party.includes(id),
      dismissCards: !isMain ? (BALANCE.DISMISS_CARD_BONUS + entry.shards) * BALANCE.SHARD_CARD_VALUE[def.grade] : 0,
    };
    if (isMain) view.mainPromo = this.mainPromotionInfo();
    return view;
  }

  /** Requirements for the main hero's next job tier. */
  mainPromotionInfo() {
    const job = this.mainJob(); const s = this.state;
    if (!job.next.length) return { maxed: true, options: [] };
    const cards = BALANCE.MAIN_PROMOTE_CARDS[job.tier], stage = BALANCE.MAIN_PROMOTE_STAGE[job.tier];
    return {
      maxed: false, cards, stage, tier: job.tier,
      hasCards: s.cards >= cards, hasStage: s.maxCleared >= stage,
      ok: s.cards >= cards && s.maxCleared >= stage,
      options: job.next.map((j) => MAIN_JOBS[j]),
    };
  }

  /** Theoretical party DPS (ATK / interval, speed-adjusted). */
  partyDPS() {
    return this.state.party.reduce((sum, id) => { const v = this.heroView(id); return sum + v.atk / v.interval; }, 0) * this.speedMult();
  }
  partyATK() { return this.state.party.reduce((sum, id) => sum + this.heroView(id).atk, 0); }
  goldPerSecAt(stage) { return estimateGoldPerSec(stage, this.partyDPS(), this.goldMult()); }
  killsRequired() { return isBossStage(this.state.stage) ? 1 : BALANCE.KILLS_PER_STAGE; }

  // ------------------------------------------------------------- actions --
  upgradeHero(id) {
    const v = this.heroView(id);
    if (!v.entry.owned || this.state.gold < v.cost) return false;
    this.state.gold -= v.cost; v.entry.level += 1;
    Quests.addProgress(this.state, 'upgrades', 1); this.emit('sfx', 'upgrade');
    this.entities.refreshHeroStats(); this.entities.levelUpFx(id);
    this.emit('gold'); this.emit('roster'); this.emit('quests');
    return true;
  }

  /** Undo up to `n` levels (never below 1) and refund their cost, so gold can be moved to another card. Returns levels removed. */
  downgradeHero(id, n = 1) {
    const entry = this.state.heroes[id]; if (!entry?.owned) return 0;
    let removed = 0, refund = 0;
    for (let i = 0; i < n && entry.level > 1; i++) { entry.level -= 1; refund += Math.floor(upgradeCost(entry.level) * BALANCE.LEVEL_REFUND); removed++; }
    if (removed) { this.state.gold += refund; this.entities.refreshHeroStats(); this.log(`${this.heroDef(id).name} 레벨 -${removed} (골드 +${refund} 환급)`, 'info'); this.emit('gold'); this.emit('roster'); }
    return removed;
  }
  /** Reset a hero to level 1, refunding everything. Returns gold refunded. */
  resetHeroLevel(id) { const before = this.state.gold; this.downgradeHero(id, 10000); return this.state.gold - before; }

  /** Level a hero up to `n` times in one click (stops when gold runs out). Returns levels bought. */
  upgradeHeroMany(id, n = 10) {
    const entry = this.state.heroes[id]; if (!entry?.owned) return 0;
    let bought = 0;
    for (let i = 0; i < n; i++) { const cost = upgradeCost(entry.level); if (this.state.gold < cost) break; this.state.gold -= cost; entry.level += 1; bought++; }
    if (bought) { Quests.addProgress(this.state, 'upgrades', bought); this.entities.refreshHeroStats(); this.entities.levelUpFx(id); this.emit('gold'); this.emit('roster'); this.emit('quests'); this.emit('sfx', 'levelup'); }
    return bought;
  }
  /** Level every party member up to `n` times (round-robin so gold is shared fairly). Returns total levels bought. */
  upgradeAllMany(n = 5) {
    let total = 0;
    for (let round = 0; round < n; round++) for (const id of this.state.party) { const cost = upgradeCost(this.state.heroes[id].level); if (this.state.gold < cost) continue; this.state.gold -= cost; this.state.heroes[id].level += 1; total++; }
    if (total) { Quests.addProgress(this.state, 'upgrades', total); this.entities.refreshHeroStats(); this.emit('gold'); this.emit('roster'); this.emit('quests'); this.emit('sfx', 'levelup'); }
    return total;
  }

  /** Buy the cheapest party upgrade repeatedly. Returns how many were bought. */
  upgradeCheapestLoop(max = 200) {
    let n = 0;
    while (n < max) {
      const cheapest = this.state.party.map((id) => this.heroView(id)).sort((a, b) => a.cost - b.cost)[0];
      if (!cheapest || this.state.gold < cheapest.cost) break;
      this.state.gold -= cheapest.cost; cheapest.entry.level += 1; n++;
    }
    if (n) { Quests.addProgress(this.state, 'upgrades', n); this.entities.refreshHeroStats(); this.emit('gold'); this.emit('roster'); this.emit('quests'); }
    return n;
  }

  upgradeTeam(key) {
    const lvl = this.state.team[key]; const t = BALANCE.TEAM_UPGRADES[key];
    if (lvl >= t.max) return false;
    const cost = teamUpgradeCost(key, lvl);
    if (this.state.gold < cost) return false;
    this.state.gold -= cost; this.state.team[key] = lvl + 1;
    this.entities.refreshHeroStats();
    this.emit('gold'); this.emit('roster');
    return true;
  }

  pull(count) {
    const cost = count === 10 ? BALANCE.GACHA_TEN_COST : BALANCE.GACHA_SINGLE_COST * count;
    if (this.state.gems < cost) { this.toast('보석이 부족합니다'); return null; }
    this.state.gems -= cost;
    const results = []; let gotMin = false; const minIdx = GRADES[BALANCE.TEN_PULL_MIN_GRADE] ? ['D', 'C', 'B', 'A', 'S'].indexOf(BALANCE.TEN_PULL_MIN_GRADE) : 99;
    for (let i = 0; i < count; i++) {
      const force = count === 10 && i === count - 1 && !gotMin ? BALANCE.TEN_PULL_MIN_GRADE : null;
      const r = pullOnce(this.state.pity, this.state.heroes, this.rng, force);
      if (['D', 'C', 'B', 'A', 'S'].indexOf(r.grade) >= minIdx) gotMin = true;
      if (force) r.guaranteed = true;
      this.state.pity = r.pity; this.state.stats.totalPulls++;
      results.push({ ...r, def: HERO_BY_ID[r.heroId] });
      if (r.isNew && this.state.party.length < BALANCE.PARTY_SIZE) this.state.party.push(r.heroId); // 빈 자리에 자동 배치
    }
    Quests.addProgress(this.state, 'pull', count);
    this.entities.rebuildParty();
    this.log(`데이터 가져오기: ${count}행 임포트 완료`, 'gacha');
    this.emit('gems'); this.emit('roster'); this.emit('party'); this.emit('quests'); this.emit('gacha', results);
    return results;
  }

  promote(id) {
    const v = this.heroView(id);
    if (!v.canPromote) return false;
    v.entry.shards -= v.promoteCost; v.entry.star += 1;
    this.entities.refreshHeroStats(); this.entities.levelUpFx(id);
    this.log(`${v.def.name} ${'★'.repeat(v.entry.star)} 승급`, 'info');
    this.emit('roster');
    return true;
  }

  /** 각성: a ★5 card becomes permanently stronger (gold frame). */
  awaken(id) {
    const v = this.heroView(id);
    if (!v.canAwaken) return false;
    this.state.cards -= v.awakenCost; v.entry.awakened = true; this.state.stats.awakens = (this.state.stats.awakens ?? 0) + 1;
    this.entities.refreshHeroStats(); this.entities.levelUpFx(id);
    this.log(`${v.def.name} 각성! ATK/HP +25%, 특성 ×1.5, 스킬 ×1.25`, 'stage');
    this.emit('cards'); this.emit('roster'); this.emit('sfx', 'prestige');
    return true;
  }

  /** Spend 강화 카드 to raise a hero's enhance level (+4% ATK/HP). */
  enhance(id) {
    const v = this.heroView(id);
    if (!v.canEnhance) return false;
    this.state.cards -= v.enhanceCost; v.entry.enhance += 1; this.state.stats.enhances++;
    Quests.addProgress(this.state, 'enhance', 1);
    this.entities.refreshHeroStats();
    this.emit('cards'); this.emit('roster'); this.emit('quests');
    return true;
  }

  /** Convert a hero's shards into 강화 카드 (grade-weighted). n = all by default. */
  convertShards(id, n) {
    const v = this.heroView(id); const e = v.entry;
    const amount = Math.min(e.shards, n ?? e.shards);
    if (amount <= 0) return 0;
    const cards = amount * v.shardCardValue;
    e.shards -= amount; this.state.cards += cards;
    this.log(`${v.def.name} 조각 ${amount}개 → 강화 카드 ${cards}장`, 'info');
    this.emit('cards'); this.emit('roster');
    return cards;
  }

  /** Dismiss (퇴사) a benched card entirely for 강화 카드. */
  dismiss(id) {
    const v = this.heroView(id);
    if (!v.canDismiss) return 0;
    const cards = v.dismissCards;
    Object.assign(v.entry, { owned: false, star: 0, shards: 0, level: 1, enhance: 0 });
    this.state.cards += cards;
    this.log(`${v.def.name} 카드 방출 → 강화 카드 ${cards}장`, 'info');
    this.emit('cards'); this.emit('roster');
    return cards;
  }

  /** Promote the main hero to `jobId` (must be one of the current job's next options). */
  promoteMain(jobId) {
    const info = this.mainPromotionInfo();
    if (info.maxed || !info.ok || !info.options.some((o) => o.id === jobId)) return false;
    this.state.cards -= info.cards;
    this.state.main.job = jobId;
    this.entities.rebuildParty();
    const job = MAIN_JOBS[jobId];
    this.log(`김인턴이 ${job.title}(${job.grade}급)으로 승진했습니다!`, 'stage');
    this.emit('cards'); this.emit('roster'); this.emit('party'); this.emit('main', job);
    return true;
  }

  toggleFavorite(id) {
    this.state.favorites ??= {};
    if (this.state.favorites[id]) delete this.state.favorites[id]; else this.state.favorites[id] = true;
    this.emit('roster'); this.emit('party');
    return !!this.state.favorites[id];
  }
  isFavorite(id) { return !!this.state.favorites?.[id]; }

  toggleParty(id) {
    const p = this.state.party;
    if (p.includes(id)) {
      if (p.length === 1) { this.toast('파티에는 최소 1명이 필요합니다'); return false; }
      p.splice(p.indexOf(id), 1);
    } else {
      if (!this.state.heroes[id]?.owned) return false;
      if (p.length >= BALANCE.PARTY_SIZE) { this.toast('파티가 가득 찼습니다 (5/5)'); return false; }
      p.push(id);
    }
    this.entities.rebuildParty();
    this.emit('party'); this.emit('roster');
    return true;
  }

  toggleExcel(force) {
    this.state.settings.excel = force ?? !this.state.settings.excel;
    this.emit('excel', this.state.settings.excel);
  }
  /** Auto-advance: keep challenging the next stage after every clear. Turning it on starts a challenge right away. */
  setAutoAdvance(v) {
    this.state.settings.autoAdvance = !!v; this.emit('settings');
    if (!v) this.waitingAdvance = false;
    if (v && !this.isChallenging()) { if (!this.state.settings.safeAdvance || this.challengeForecast(this.nextStage()).prob >= BALANCE.SAFE_ADVANCE_MIN) this.startChallenge(); else { this.waitingAdvance = true; this.log(`${stageLabel(this.nextStage())} 승산이 낮아 강화 후 자동 진행 재개`, 'warn'); this.emit('challenge'); } }
  }
  /** Auto-upgrade: keep running "자동 합계" (cheapest party upgrade) every second while on. */
  setAutoUpgrade(v) {
    this.state.settings.autoUpgrade = !!v; this.emit('settings');
    if (v) this.upgradeCheapestLoop();
  }

  claimAchievement(id) {
    const r = Achievements.claimAchievement(this.state, id);
    if (r) { this.log(`업적 달성: ${id} ${r.tier}단계 +${r.gems} 보석`, 'info'); this.emit('gems'); this.emit('quests'); }
    return r;
  }
  achievementsClaimable() { return Achievements.claimableCount(this.state); }

  /** Milestones are granted the moment they are reached (stage / main level / party level sum). */
  checkMilestones() {
    const granted = Milestones.grantPending(this.state);
    for (const { milestone: m, reward } of granted) {
      this.log(`마일스톤 달성: ${m.name} — 보석 +${reward.gems}${reward.cards ? `, 강화 카드 +${reward.cards}` : ''}`, 'stage');
      this.emit('milestone', { milestone: m, reward });
    }
    if (granted.length) { this.emit('gems'); this.emit('cards'); this.emit('quests'); this.emit('sfx', 'clear'); }
    return granted;
  }

  /** True while the party is fighting to clear the current stage (vs. farming it). */
  isChallenging() { return !!this.state.challenging; }
  /** The boss only appears while challenging a boss stage; farming a boss stage spawns normal monsters. */
  bossActive() { return this.isChallenging() && isBossStage(this.state.stage); }
  /** Stage the next challenge would target. */
  nextStage() { const s = this.state; return this.isChallenging() ? s.stage : (s.stage <= s.maxCleared ? s.stage + 1 : s.stage); }

  // ------------------------------------------------------------- forecast --
  /**
   * 승산: how the party stacks up against a stage. ratio = (partyDPS / enemyHP) / (enemyDPS / partyHP);
   * calibrated against headless runs — normal stages are won from ratio ≈ 7-10, boss stages from ≈ 10-15.
   */
  challengeForecast(stage = this.nextStage()) {
    const dps = Math.max(1, this.partyDPS());
    const hp = Math.max(1, this.state.party.reduce((a, id) => a + this.heroView(id).hp, 0));
    const mod = stageModifier(stage); const boss = isBossStage(stage); const bDef = bossForStage(stage);
    const count = Math.min(BALANCE.MAX_MONSTERS + (mod?.count ?? 0), 3 + Math.floor(stage / 10) + (mod?.count ?? 0));
    const enemyHp = boss ? bossHP(stage) * (bDef.hp ?? 1) : monsterHP(stage) * count;
    const enemyDps = boss ? bossATK(stage) * (bDef.atk ?? 1) / (bDef.interval ?? 2) : monsterATK(stage) * count / 1.5;
    const ratio = (dps / enemyHp) / (enemyDps / hp);
    const [lo, hi] = boss ? BALANCE.FORECAST.boss : BALANCE.FORECAST.normal;
    let prob = Math.max(0, Math.min(1, Math.log(Math.max(1e-9, ratio) / lo) / Math.log(hi / lo)));
    const bossTime = boss ? enemyHp / dps : null;
    if (boss && bossTime > BALANCE.BOSS_TIME_LIMIT * BALANCE.FORECAST.bossTimeFrac) prob = Math.min(prob, 0.15);
    return { stage, boss, ratio, prob, bossTime, label: prob >= 0.7 ? '유리' : prob >= BALANCE.SAFE_ADVANCE_MIN ? '접전' : '불리' };
  }
  /** Auto-advance that waited for a better forecast resumes as soon as the party is strong enough. */
  #maybeResumeAdvance() {
    const s = this.state;
    if (!this.waitingAdvance || !s.settings.autoAdvance || this.isChallenging()) return;
    if (!s.settings.safeAdvance || this.challengeForecast(this.nextStage()).prob >= BALANCE.SAFE_ADVANCE_MIN) { this.waitingAdvance = false; this.startChallenge(); }
  }
  setSafeAdvance(v) { this.state.settings.safeAdvance = !!v; this.emit('settings'); this.#maybeResumeAdvance(); }

  // ------------------------------------------------------------ challenge --
  /** Start fighting for the next stage (or the current, not-yet-cleared one). */
  startChallenge() {
    const s = this.state; this.waitingAdvance = false;
    if (this.isChallenging()) return false;
    if (s.stage <= s.maxCleared) s.stage += 1;
    s.challenging = true; s.kills = 0; s.maxStage = Math.max(s.maxStage, s.stage);
    this.entities.startStage();
    this.log(`${this.stageLabel()} 도전 시작${isBossStage(s.stage) ? ' — 보스 등장!' : ''}`, 'stage');
    this.emit('challengeStart', { stage: s.stage, boss: isBossStage(s.stage) });
    this.emit('stage'); this.emit('kills'); this.emit('challenge');
    return true;
  }
  /** Give up the current challenge and farm the last safe stage. */
  cancelChallenge() {
    if (!this.isChallenging()) return false;
    this.#backToFarm('도전 중단');
    return true;
  }
  #backToFarm(reason) {
    const s = this.state;
    s.challenging = false; s.kills = 0;
    if (s.stage > 1 && s.stage > s.maxCleared) s.stage -= 1;
    this.entities.startStage();
    this.log(`${reason}. ${this.stageLabel()}에서 자동 사냥`, 'warn');
    this.emit('stage'); this.emit('kills'); this.emit('challenge');
  }
  #failChallenge(reason) {
    this.state.settings.autoAdvance = false; this.emit('settings');
    this.#backToFarm(reason);
  }

  // -------------------------------------------------------------- quests --
  claimQuest(id) { const r = Quests.claimQuest(this.state, id, this.goldMult()); if (r) this.#afterReward(r); return r; }
  claimLogin() { const r = Quests.claimLogin(this.state, this.goldMult()); if (r) { this.log('오늘의 출근 보상 수령', 'info'); this.#afterReward(r); } return r; }
  claimAllClear() { const r = Quests.claimAllClear(this.state, this.goldMult()); if (r) this.#afterReward(r); return r; }
  adsLeft() { return Quests.adsLeft(this.state); }

  /**
   * Ad reward (placeholder: the UI plays a fake 5s ad).
   * kind 'offline' doubles an offline report; kind 'instant' grants 1h of idle gold at full rate.
   */
  adReward(kind, report = null) {
    if (!Quests.useAd(this.state)) return null;
    let gold = 0;
    if (kind === 'offline' && report) gold = Math.floor(report.gold * (BALANCE.AD.offlineMultiplier - 1));
    else gold = Math.floor(this.goldPerSecAt(this.state.stage) * BALANCE.AD.instantHours * 3600);
    this.state.gold += gold; this.state.stats.totalGold += gold;
    this.log(`광고 시청 보상 +${gold}g`, 'info');
    this.emit('gold'); this.emit('quests');
    return { gold };
  }

  #afterReward(r) {
    this.log(`보상 수령: ${[r.gems && `보석 ${r.gems}`, r.gold && `골드 ${r.gold}`, r.cards && `강화 카드 ${r.cards}`].filter(Boolean).join(', ')}`, 'info');
    this.emit('gold'); this.emit('gems'); this.emit('cards'); this.emit('quests');
  }

  // ---------------------------------------------------------- stage flow --
  onMonsterKilled(m) {
    const s = this.state;
    if (m.def.chest) {
      const phase = Math.floor((s.stage - 1) / BALANCE.BOSS_EVERY) + 1;
      const cards = phase * BALANCE.CHEST.cardsPerPhase, gems = BALANCE.CHEST.gemsMin + Math.floor(Math.random() * (BALANCE.CHEST.gemsMax - BALANCE.CHEST.gemsMin + 1));
      s.cards += cards; s.gems += gems; s.stats.chests = (s.stats.chests ?? 0) + 1; Quests.addProgress(s, 'chests', 1); this.emit('quests');
      this.entities.floaters.push({ x: m.x, y: m.y - 70, text: `강화 카드 +${cards} · 보석 +${gems}`, color: '#f9e79f', t: 0, big: true });
      this.log(`${m.def.mimic ? '미믹 처치' : '보물 상자 개봉'}: 강화 카드 +${cards}, 보석 +${gems}`, 'info');
      this.emit('cards'); this.emit('gems');
      return;
    }
    const gold = Math.floor((m.isBoss ? bossGold(s.stage) : baseGold(s.stage)) * this.goldMult() * (m.elite ? BALANCE.ELITE.gold : 1) * (stageModifier(s.stage)?.gold ?? 1));
    s.gold += gold; s.stats.totalGold += gold; s.stats.totalKills++;
    Quests.addProgress(s, 'kills', 1); if (m.elite) Quests.addProgress(s, 'elite', 1);
    this.entities.coinBurst(m.x, m.y, gold);
    if (m.isBoss) {
      s.stats.bossKills++; Quests.addProgress(s, 'boss', 1);
      this.log(`보스 처리 완료: ${m.def.name} +${gold}g`, 'boss');
      this.#clearStage();
    } else {
      s.kills++; this.emit('kills');
      if (this.isChallenging() && s.kills >= BALANCE.KILLS_PER_STAGE) this.#clearStage();
    }
    this.emit('gold');
  }

  #clearStage() {
    const s = this.state; const boss = isBossStage(s.stage);
    const first = s.stage > s.maxCleared;
    const gems = boss
      ? (first ? BALANCE.GEMS_BOSS_FIRST : BALANCE.GEMS_BOSS_REPEAT)
      : (first ? BALANCE.GEMS_FIRST_CLEAR : BALANCE.GEMS_REPEAT_CLEAR);
    const lucky = this.partyTraitCount('lucky') * TRAITS.lucky.value;
    const cards = first ? (Math.floor((s.stage - 1) / BALANCE.BOSS_EVERY) + 1) * BALANCE.CARDS_FIRST_CLEAR_PER_PHASE : 0;
    s.gems += gems + lucky; s.cards += cards; s.maxCleared = Math.max(s.maxCleared, s.stage);
    this.checkMilestones();
    Quests.addProgress(s, 'clears', 1);
    this.log(`${this.stageLabel()} 마감 +${gems + lucky} 보석${cards ? ` +${cards} 강화 카드` : ''}`, 'stage');
    s.kills = 0; s.challenging = false;
    this.emit('cleared', { stage: s.stage, boss, first });
    this.emit('stage'); this.emit('gems'); this.emit('cards'); this.emit('kills'); this.emit('quests');
    const fc = this.challengeForecast(s.stage + 1);
    if (s.settings.autoAdvance && (!s.settings.safeAdvance || fc.prob >= BALANCE.SAFE_ADVANCE_MIN)) this.startChallenge();
    else {
      this.entities.startStage();
      if (s.settings.autoAdvance) { this.waitingAdvance = true; this.log(`${stageLabel(s.stage + 1)} 승산 ${Math.round(fc.prob * 100)}% — 강화 후 자동 진행 재개`, 'warn'); }
      else this.log(`${this.stageLabel()}에서 자동 사냥 중 (다음 단계 도전 대기)`, 'info');
      this.emit('challenge');
    }
  }

  onCombo(n) { if (n === 20) { Quests.addProgress(this.state, 'combo', 1); this.emit('quests'); } }

  onBossTimeout() {
    this.state.stats.bossFails++;
    this.#failChallenge(`보스 에스컬레이션 (${BALANCE.BOSS_TIME_LIMIT}초 초과)`);
  }

  /** Party wipe: a failed challenge falls back to farming the previous stage; a farming wipe just restarts. */
  onPartyWiped() {
    const s = this.state;
    if (this.isChallenging() && s.stage === 1 && s.maxCleared === 0) { this.entities.startStage(); this.log('팀 전원 번아웃. Phase 1-1 재정비 (튜토리얼: 진행도 유지)', 'warn'); this.emit('stage'); }
    else if (this.isChallenging()) this.#failChallenge('팀 전원 번아웃');
    else { this.entities.startStage(); this.log(`팀 전원 번아웃. ${this.stageLabel()} 사냥 재시작`, 'warn'); this.emit('stage'); }
    this.emit('wipe');
  }

  // ----------------------------------------------------------------- loop --
  tick(dt, now = Date.now()) {
    this.state.stats.playSeconds += dt;
    this.entities.update(dt);
    this.resumeTimer += dt; if (this.resumeTimer >= 2) { this.resumeTimer = 0; this.#maybeResumeAdvance(); this.checkMilestones(); }
    this.historyTimer += dt;
    if (this.historyTimer >= GameManager.HISTORY_STEP) {
      const gained = this.state.stats.totalGold - this.historyGold; this.historyGold = this.state.stats.totalGold;
      const h = this.history; h.t.push(this.state.stats.playSeconds); h.goldPerMin.push(gained / this.historyTimer * 60); h.dps.push(this.entities.dps()); h.stage.push(this.state.stage);
      for (const k of Object.keys(h)) if (h[k].length > GameManager.HISTORY_LEN) h[k].splice(0, h[k].length - GameManager.HISTORY_LEN);
      this.historyTimer = 0; this.emit('history');
    }
    if (this.state.settings.autoUpgrade) { this.autoTimer += dt; if (this.autoTimer >= BALANCE.AUTO_UPGRADE_INTERVAL) { this.autoTimer = 0; this.upgradeCheapestLoop(50); } }
    this.saveTimer += dt; this.dailyTimer += dt;
    if (this.dailyTimer >= 60) { this.dailyTimer = 0; if (Quests.ensureDaily(this.state, now)) { this.log('새로운 업무일이 시작되었습니다', 'info'); this.emit('quests'); } }
    if (this.saveTimer >= BALANCE.SAVE_INTERVAL_MS / 1000) { this.saveTimer = 0; this.persist(); }
  }
  persist() { if (this.save) { this.save.save(this.state); this.emit('saved'); } }

  /** Idle/offline reward (also used when the tab was throttled for a long time). */
  applyOffline(report) {
    if (!report) return;
    this.state.gold += report.gold; this.state.stats.totalGold += report.gold;
    this.log(`백그라운드 정산: ${Math.floor(report.seconds / 60)}분 동안 +${report.gold}g`, 'info');
    this.emit('gold');
  }
  /** Build an idle report for an arbitrary gap (used by the main loop for throttled tabs). */
  idleReport(seconds) {
    const capped = Math.min(seconds, BALANCE.OFFLINE_CAP_SEC);
    const gps = this.goldPerSecAt(this.state.stage);
    return { seconds: capped, elapsed: seconds, capped: seconds > BALANCE.OFFLINE_CAP_SEC, goldPerSec: gps, gold: offlineGold(gps, capped) };
  }

  exportSave() { return this.save.export(this.state); }
  importSave(str) { this.state = this.save.import(str); this.#rebuildWorld(); }
  reset() { this.save.clear(); this.state = createInitialState(); this.logs = []; this.#rebuildWorld(); }
  #rebuildWorld() {
    Quests.ensureDaily(this.state);
    this.entities = new EntityManager(this); this.entities.rebuildParty(); this.entities.startStage();
    this.persist(); this.emit('reset');
  }

  // ------------------------------------------------------------------ log --
  log(text, kind = 'info') {
    const row = { t: Date.now(), row: this.rowCounter++, text, kind };
    this.logs.push(row); if (this.logs.length > 80) this.logs.shift();
    this.emit('log', row);
  }
  toast(text) { this.emit('toast', text); }
}
