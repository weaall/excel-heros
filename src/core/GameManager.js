// Global game state, economy, stage flow and player actions. Emits events for the UI.
import {
  BALANCE, upgradeCost, baseGold, bossGold, isBossStage, stageLabel, heroATK, heroHP,
  teamUpgradeCost, teamUpgradeBonus, estimateGoldPerSec, enhanceCost, offlineGold,
} from '../config/balance.js';
import { HERO_BY_ID, GRADES, SKILLS, heroBaseStats, MAIN_ID, MAIN_JOBS } from '../data/heroes.js';
import { pullOnce, promoteCost } from './GachaManager.js';
import { createInitialState } from './state.js';
import { EntityManager } from './EntityManager.js';
import * as Quests from './QuestManager.js';
import { Emitter } from '../utils/events.js';
import { createRng } from '../utils/rng.js';

export class GameManager extends Emitter {
  constructor({ state, save, rng = createRng(), now = Date.now() } = {}) {
    super();
    this.state = state ?? createInitialState(now);
    this.save = save;
    this.rng = rng;
    this.logs = [];
    this.rowCounter = 1000 + Math.floor(Math.random() * 500);
    this.saveTimer = 0; this.dailyTimer = 0;
    Quests.ensureDaily(this.state, now);
    this.entities = new EntityManager(this);
    this.entities.rebuildParty();
    this.entities.startStage();
  }

  // ------------------------------------------------------------- derived --
  stageLabel() { return stageLabel(this.state.stage); }
  goldMult() { return 1 + teamUpgradeBonus('payroll', this.state.team.payroll); }
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
    const skillPower = boosted ? BALANCE.SKILL_BOOST_MULT : 1;
    const nextCost = isMain ? null : promoteCost(def.grade, star);
    const eCost = enhanceCost(entry.enhance);
    const view = {
      id, def, entry, isMain, grade: GRADES[def.grade], star,
      atk: heroATK(base.atk, entry.level, star, entry.enhance),
      hp: heroHP(base.hp, entry.level, star, this.hpBonus(), entry.enhance),
      interval: base.interval, range: base.range,
      cost: upgradeCost(entry.level),
      inParty: this.state.party.includes(id),
      skillUnlocked, skillPower,
      skillName: SKILLS[def.skill.type].name,
      skillDesc: SKILLS[def.skill.type].desc.replace('{p}', +(def.skill.power * skillPower).toFixed(2)),
      skillUnlockHint: isMain ? `${['인턴', '사원'][BALANCE.MAIN_SKILL_TIER]} 승급 시 해금` : `★${BALANCE.SKILL_UNLOCK_STAR} 해금`,
      promoteCost: nextCost,
      canPromote: !isMain && entry.owned && nextCost !== null && entry.shards >= nextCost,
      enhanceCost: eCost, enhanceMaxed: entry.enhance >= BALANCE.ENHANCE_MAX,
      canEnhance: entry.owned && entry.enhance < BALANCE.ENHANCE_MAX && this.state.cards >= eCost,
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
    Quests.addProgress(this.state, 'upgrades', 1);
    this.entities.refreshHeroStats();
    this.emit('gold'); this.emit('roster'); this.emit('quests');
    return true;
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
    const results = [];
    for (let i = 0; i < count; i++) {
      const r = pullOnce(this.state.pity, this.state.heroes, this.rng);
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
    this.entities.refreshHeroStats();
    this.log(`${v.def.name} ${'★'.repeat(v.entry.star)} 승급`, 'info');
    this.emit('roster');
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

  toggleStealth(force) {
    this.state.settings.stealth = force ?? !this.state.settings.stealth;
    this.emit('stealth', this.state.settings.stealth);
  }
  setAutoBoss(v) { this.state.settings.autoBoss = !!v; this.emit('settings'); }

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
    else gold = Math.floor(this.goldPerSecAt(this.state.maxStage) * BALANCE.AD.instantHours * 3600);
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
    const gold = Math.floor((m.isBoss ? bossGold(s.stage) : baseGold(s.stage)) * this.goldMult());
    s.gold += gold; s.stats.totalGold += gold; s.stats.totalKills++;
    Quests.addProgress(s, 'kills', 1);
    if (m.isBoss) {
      s.stats.bossKills++; Quests.addProgress(s, 'boss', 1);
      this.log(`보스 처리 완료: ${m.def.name} +${gold}g`, 'boss');
      this.#clearStage();
    } else {
      s.kills++; this.emit('kills');
      if (s.kills >= BALANCE.KILLS_PER_STAGE) this.#clearStage();
    }
    this.emit('gold');
  }

  #clearStage() {
    const s = this.state; const boss = isBossStage(s.stage);
    const first = s.stage > s.maxCleared;
    const gems = boss
      ? (first ? BALANCE.GEMS_BOSS_FIRST : BALANCE.GEMS_BOSS_REPEAT)
      : (first ? BALANCE.GEMS_FIRST_CLEAR : BALANCE.GEMS_REPEAT_CLEAR);
    s.gems += gems; s.maxCleared = Math.max(s.maxCleared, s.stage);
    Quests.addProgress(s, 'clears', 1);
    this.log(`${this.stageLabel()} 마감 +${gems} 보석`, 'stage');
    const next = s.stage + 1;
    s.kills = 0;
    if (isBossStage(next) && !s.settings.autoBoss) this.log(`자동 보스 꺼짐: ${this.stageLabel()} 반복 사냥`, 'info');
    else { s.stage = next; s.maxStage = Math.max(s.maxStage, next); }
    this.entities.startStage();
    this.emit('stage'); this.emit('gems'); this.emit('kills'); this.emit('quests');
  }

  onBossTimeout() {
    const s = this.state; s.stats.bossFails++;
    this.log(`보스 에스컬레이션 (${BALANCE.BOSS_TIME_LIMIT}초 초과). ${stageLabel(s.stage - 1)}로 후퇴`, 'warn');
    s.stage = Math.max(1, s.stage - 1); s.kills = 0;
    this.entities.startStage();
    this.emit('stage'); this.emit('kills');
  }

  onPartyWiped() {
    const s = this.state;
    if (s.stage > 1) { s.stage -= 1; s.kills = 0; this.log(`팀 전원 번아웃. ${this.stageLabel()}로 후퇴`, 'warn'); }
    else this.log('팀 전원 번아웃. Phase 1-1에서 재정비 (진행도 유지)', 'warn');
    this.entities.startStage();
    this.emit('stage'); this.emit('kills');
  }

  /** Manually re-attempt the next boss after a retreat. */
  challengeBoss() {
    const s = this.state; const next = s.stage + 1;
    if (!isBossStage(next) || next > s.maxStage) return false;
    s.stage = next; s.kills = 0; this.entities.startStage();
    this.emit('stage'); this.emit('kills');
    return true;
  }

  // ----------------------------------------------------------------- loop --
  tick(dt, now = Date.now()) {
    this.state.stats.playSeconds += dt;
    this.entities.update(dt);
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
    const gps = this.goldPerSecAt(this.state.maxStage);
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
