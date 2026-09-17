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
import { ACHIEVEMENTS } from '../data/achievements.js';
import * as Milestones from './MilestoneManager.js';
import { HEROES, ROLES, GRADE_ORDER } from '../data/heroes.js';
import { DIVISIONS, SYNERGY, PERKS, divisionOf } from '../data/divisions.js';
import { Emitter } from '../utils/events.js';
import { createRng } from '../utils/rng.js';
import { CloudSync } from './CloudSync.js';
import { pickupFor, SPARK_COST, bannerDaysLeft } from '../data/pickup.js';
import { EPISODE_BY_ID, episodeUnlocked } from '../data/story.js';
import { skinsOf, skinById } from '../data/skins.js';
import { PROFILES } from '../data/profiles.js';
import { localDateKey } from './state.js';
import { relativeGold, gemsForClear } from '../config/balance.js';
import { checkCode } from '../data/codes.js';
import { SLOTS, SLOT_ORDER, itemPct, itemLabel, rollItem, itemBasePct } from '../data/equipment.js';
import { sanitizeName } from './plausibility.js';
import { migrate } from './state.js';

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
    this.cloud = new CloudSync(this);
    this.overtime = null; // { t, kills, elites, stage } while 야근 모드 is running
    this.entities = new EntityManager(this);
    this.entities.rebuildParty();
    this.entities.startStage();
  }

  // ------------------------------------------------------------- derived --
  stageLabel() { return stageLabel(this.state.stage); }
  goldMult() { return 1 + teamUpgradeBonus('sales', this.state.team.sales ?? 0) + TRAITS.greedy.value * this.partyTraitCount('greedy') + this.collection().gold + this.prestigeBonus() + this.synergy().perks.gold; }
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

  /**
   * 파티 자동 편성. Picking the five biggest numbers is the wrong answer: 부문 시너지 multiplies the whole party,
   * the all-roles bonus and a healer decide whether it survives, and 비품 세트 already moved individual power around.
   * So it seeds with a tank + healer + the strongest remaining, then hill-climbs by swapping one member at a time
   * while the party score improves.
   */
  autoParty() {
    const slots = BALANCE.PARTY_SIZE - 1;
    const owned = Object.keys(this.state.heroes)
      .filter((id) => this.state.heroes[id].owned && !this.isMain(id) && !this.isDispatched(id))
      .map((id) => this.heroView(id)).sort((a, b) => b.power - a.power);
    const pool = owned.slice(0, 18).map((v) => v.id); // beyond this nothing can win a slot; keeps the search instant
    const seed = [];
    for (const role of ['tank', 'healer']) { const best = owned.find((v) => v.def.role === role && !seed.includes(v.id)); if (best) seed.push(best.id); }
    for (const v of owned) { if (seed.length >= slots) break; if (!seed.includes(v.id)) seed.push(v.id); }
    // roles the roster can actually supply must stay represented, whatever the raw numbers say
    const required = ['tank', 'healer'].filter((r) => owned.some((v) => v.def.role === r));
    const legal = (ids) => required.every((r) => ids.some((id) => this.heroDef(id).role === r));
    let team = [MAIN_ID, ...seed.slice(0, slots)];
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 1; i < team.length; i++) for (const cand of pool) {
        if (team.includes(cand)) continue;
        const alt = team.slice(); alt[i] = cand;
        if (!legal(alt)) continue;
        if (this.partyScore(alt) > this.partyScore(team) + 1e-9) { team = alt; improved = true; }
      }
      if (!improved) break;
    }
    this.state.party = team;
    this.entities.rebuildParty();
    this.log(`파티 자동 편성: ${this.state.party.map((id) => this.heroDef(id).name).join(', ')} (편성 점수 ${Math.round(this.partyScore(team))})`, 'info');
    this.emit('party'); this.emit('roster');
    return this.state.party;
  }
  /** What a party is worth: 전투력 합에 부문 시너지·역할 균형·힐러 유무를 곱한 값. Used by 자동 편성 and shown in the party pane. */
  partyScore(ids = this.state.party) {
    const before = this.state.party;
    this.state.party = ids;
    const syn = this.synergy();
    const roles = new Set(ids.map((id) => this.heroDef(id).role));
    this.state.party = before;
    const power = ids.reduce((a, id) => a + this.heroView(id).power, 0);
    return power * (1 + syn.atk + syn.hp / 2) * (1 + syn.sets.length * 0.04) * (roles.has('healer') ? 1.08 : 1) * (syn.balanced ? 1.06 : 1);
  }
  /**
   * Redeem a code. When the player is signed in the account's own history decides (the Worker records it), so
   * wiping the local save cannot pay twice; signed out, the local record stands in until the next sign-in.
   */
  async redeemCodeAsync(raw) {
    const local = checkCode(raw, this.state.redeemed ?? {});
    if (!local.ok) return local;
    if (this.cloud?.enabled?.()) {
      const r = await this.cloud.redeem(local.code);
      if (r && !r.ok) return { ok: false, reason: r.reason };
    }
    return this.redeemCode(local.code);
  }
  /** Redeem a 보석 코드 locally. Returns { ok, reward, label } or { ok: false, reason }. One use per save. */
  redeemCode(raw) {
    const r = checkCode(raw, this.state.redeemed ?? {});
    if (!r.ok) return r;
    const { gems = 0, cards = 0, gold = 0 } = r.reward;
    this.state.redeemed = { ...(this.state.redeemed ?? {}), [r.code]: Date.now() };
    this.state.gems += gems; this.state.cards += cards;
    if (gold) { this.state.gold += gold; this.state.stats.totalGold += gold; }
    this.log(`코드 ${r.code} 사용: ${[gems && `보석 ${gems}`, cards && `강화 카드 ${cards}`, gold && `골드 ${gold}`].filter(Boolean).join(', ')}`, 'info');
    this.emit('gems'); this.emit('cards'); this.emit('gold'); this.persist();
    return { ok: true, code: r.code, label: r.reward.label, gems, cards, gold };
  }

  /**
   * Is the player stuck in a way 회사 이전 would fix? Measured: re-climbing 60 stages after a reset takes ~41 min
   * against ~104 min the first time, and the shares are permanent — but nothing in the game ever says so, so players
   * grind a wall that the reset is designed to solve.
   */
  prestigeAdvice() {
    const info = this.prestigeInfo();
    if (!info.eligible) return null;
    const fc = this.challengeForecast(this.state.stage + (this.isChallenging() ? 0 : 1));
    const stalled = this.waitingAdvance || fc.prob < BALANCE.SAFE_ADVANCE_MIN;
    if (!stalled) return null;
    return { ...info, stalled: true, text: `다음 단계 승산 ${Math.round(fc.prob * 100)}% — 지금 회사를 이전하면 지분 +${info.gain} (파티 ATK·골드 +${Math.round(info.gain * info.perShare * 100)}%)을 영구히 얻고, 다시 올라오는 속도는 처음보다 훨씬 빠릅니다.` };
  }

  /** 도감 보너스: owned heroes and their stars buff party ATK and gold income. */
  collection() {
    const owned = HEROES.filter((h) => this.state.heroes[h.id]?.owned);
    const stars = owned.reduce((a, h) => a + Math.max(1, this.state.heroes[h.id].star), 0);
    const C = BALANCE.COLLECTION;
    return { owned: owned.length, total: HEROES.length, stars, atk: owned.length * C.atkPerHero + stars * C.atkPerStar, gold: owned.length * C.goldPerHero };
  }
  /** 부문 시너지: 2+ party members of one division buff ATK (3+ also HP); a party covering all 4 roles gets extra HP. */
  synergy() {
    const groups = {};
    for (const id of this.state.party) { const d = divisionOf(this.isMain(id) ? 'main' : id); (groups[d] ??= []).push(id); }
    const sets = []; const perks = { gold: 0, regen: 0, revive: 0, boss: 0, cooldown: 0, crit: 0, skill: 0 };
    let atk = 0, hp = 0;
    for (const [d, ids] of Object.entries(groups)) {
      if (ids.length < SYNERGY.pair.count) continue;
      const tier = ids.length >= SYNERGY.trio.count ? SYNERGY.trio : SYNERGY.pair;
      atk += tier.atk; hp += tier.hp;
      const perk = PERKS[d]; perks[perk.key] += perk.value;
      sets.push({ id: d, name: DIVISIONS[d].name, color: DIVISIONS[d].color, count: ids.length, ids, atk: tier.atk, hp: tier.hp, perk });
    }
    const roles = new Set(this.state.party.map((id) => this.heroDef(id).role));
    const balanced = Object.keys(ROLES).every((r) => roles.has(r));
    if (balanced) hp += SYNERGY.balanced.hp;
    return { sets, balanced, atk, hp, perks };
  }
  partyTraitCount(trait) { return this.state.party.filter((id) => this.heroDef(id).trait === trait).length; }
  speedMult() { return 1 + teamUpgradeBonus('coffee', this.state.team.coffee); }
  /** Chance that a normal kill drops a gem: base + 성과급 제도. */
  gemDropChance() { return BALANCE.GEM_DROP.base + teamUpgradeBonus('payroll', this.state.team.payroll); }
  hpBonus() { return teamUpgradeBonus('chairs', this.state.team.chairs); }
  isMain(id) { return id === MAIN_ID; }
  mainJob() { return MAIN_JOBS[this.state.main.job] ?? MAIN_JOBS.intern; }

  /** Definition for any hero id; the main hero's definition depends on the current job. */
  /** Definition + the equipped skin (sprite palette / card art variant) for any hero id. */
  heroDef(id) {
    const base = this.isMain(id) ? { ...this.mainJob(), id: this.mainJob().id, isMain: true } : HERO_BY_ID[id];
    const active = this.state.skins?.[id]?.active; if (!base || !active) return base;
    const skin = skinById(base.id, active); return skin ? { ...base, skin } : base;
  }
  // -------------------------------------------------------------- 스킨 --
  skinsOf(id) {
    const def = this.heroDef(id); const st = this.state.skins?.[id] ?? { owned: [], active: null }; const aff = this.affectionOf(id);
    return skinsOf(def.id).map((sk) => {
      const owned = st.owned.includes(sk.id);
      const affOk = sk.unlock.affection ? aff.level >= sk.unlock.affection : true;
      const canBuy = !owned && !!sk.unlock.gems && this.state.gems >= sk.unlock.gems;
      const reason = owned ? '' : sk.unlock.affection ? (affOk ? '해금 가능' : `호감도 Lv ${sk.unlock.affection} 필요`) : sk.unlock.gems ? `보석 ${sk.unlock.gems}` : '';
      return { ...sk, owned, active: st.active === sk.id, canUnlock: !owned && (sk.unlock.affection ? affOk : canBuy), reason };
    });
  }
  /** Unlock a skin: affection skins are free once the level is reached; gem skins cost SKIN_GEM_COST. */
  unlockSkin(id, skinId) {
    const e = this.state.heroes[id]; if (!e?.owned) return false;
    const sk = this.skinsOf(id).find((x) => x.id === skinId); if (!sk || sk.owned || !sk.canUnlock) return false;
    if (sk.unlock.gems) { this.state.gems -= sk.unlock.gems; this.emit('gems'); }
    const st = (this.state.skins[id] ??= { owned: [], active: null }); st.owned.push(skinId);
    this.log(`${this.heroDef(id).name} 스킨 「${sk.name}」 해금`, 'info'); this.emit('skin', { id, skinId }); this.emit('roster');
    return true;
  }
  /** Equip (or null to unequip) an owned skin; sprites and card art re-render. */
  equipSkin(id, skinId) {
    const st = (this.state.skins[id] ??= { owned: [], active: null });
    if (skinId && !st.owned.includes(skinId)) return false;
    st.active = skinId || null;
    this.entities.rebuildParty(); this.emit('skin', { id, skinId: st.active }); this.emit('roster'); this.emit('party'); this.persist();
    return true;
  }
  // ---------------------------------------------------------------- 출장 --
  isDispatched(id) { return (this.state.dispatch?.heroIds ?? []).includes(id); }
  dispatchInfo(now = Date.now()) {
    const D = BALANCE.DISPATCH; const d = this.state.dispatch; const today = localDateKey(now);
    const count = d.date === today ? d.count : 0;
    const active = d.heroIds.length > 0; const remaining = active ? Math.max(0, Math.ceil((d.endsAt - now) / 1000)) : 0;
    const bench = Object.keys(this.state.heroes).filter((id) => this.state.heroes[id].owned && !this.state.party.includes(id) && !this.isMain(id));
    const phase = Math.floor((Math.max(1, this.state.maxStage) - 1) / BALANCE.BOSS_EVERY) + 1;
    const preview = (ids) => ({ gems: D.gemsBase + ids.reduce((a, id) => a + (D.gemsPerGrade[this.heroDef(id).grade] ?? 0), 0), cards: phase * D.cardsPerPhase });
    return { active, heroIds: d.heroIds, remaining, done: active && remaining === 0, count, left: Math.max(0, D.maxPerDay - count), bench, canStart: !active && count < D.maxPerDay && bench.length > 0, hours: D.hours, slots: D.slots, preview, reward: active ? preview(d.heroIds) : null };
  }
  /** 출장 시작: up to DISPATCH.slots owned bench heroes leave for DISPATCH.hours; they cannot join the party meanwhile. */
  startDispatch(ids, now = Date.now()) {
    const info = this.dispatchInfo(now); const D = BALANCE.DISPATCH;
    const pick = [...new Set(ids)].filter((id) => info.bench.includes(id)).slice(0, D.slots);
    if (!info.canStart || !pick.length) return false;
    const today = localDateKey(now);
    this.state.dispatch = { heroIds: pick, startedAt: now, endsAt: now + D.hours * 3600000, date: today, count: (this.state.dispatch.date === today ? this.state.dispatch.count : 0) + 1 };
    this.log(`출장 시작: ${pick.map((id) => this.heroDef(id).name).join(', ')} (${D.hours}시간)`, 'info');
    this.persist(); this.emit('dispatch'); this.emit('roster');
    return true;
  }
  /** Collect a finished 출장: gems by grade, cards by phase, affection for the travellers. */
  claimDispatch(now = Date.now()) {
    const info = this.dispatchInfo(now); if (!info.done) return null;
    const r = info.reward; const ids = [...this.state.dispatch.heroIds];
    this.state.gems += r.gems; this.state.cards += r.cards;
    for (const id of ids) this.#addAffection(id, BALANCE.DISPATCH.affectionXp);
    this.state.stats.dispatches = (this.state.stats.dispatches ?? 0) + 1;
    this.state.dispatch = { ...this.state.dispatch, heroIds: [], startedAt: 0, endsAt: 0 };
    this.log(`출장 복귀: ${ids.map((id) => this.heroDef(id).name).join(', ')} → 보석 +${r.gems}, 강화 카드 +${r.cards}`, 'stage');
    this.persist(); this.emit('gems'); this.emit('cards'); this.emit('dispatch'); this.emit('roster');
    return { ...r, heroIds: ids };
  }
  // ------------------------------------------------------------ 스킬 강화 --
  skillLevelInfo(id) {
    const def = this.heroDef(id), e = this.state.heroes[id]; const L = BALANCE.SKILL_LEVEL; const lv = e?.skillLv | 0;
    const cost = lv >= L.max ? null : L.cardCost[def.grade] * (lv + 1);
    return { level: lv, max: L.max, cost, power: 1 + lv * L.powerPerLevel, cooldown: 1 - lv * L.cooldownPerLevel, can: cost !== null && this.state.cards >= cost && this.heroView(id).skillUnlocked };
  }
  upgradeSkill(id) {
    const info = this.skillLevelInfo(id); const e = this.state.heroes[id]; if (!e?.owned || !info.can) return false;
    this.state.cards -= info.cost; e.skillLv = info.level + 1;
    this.entities.refreshHeroStats(); this.log(`${this.heroDef(id).name} 스킬 Lv ${e.skillLv} (카드 -${info.cost})`, 'info');
    this.emit('cards'); this.emit('roster'); return true;
  }

  heroView(id) {
    const def = this.heroDef(id), entry = this.state.heroes[id];
    const base = heroBaseStats(def);
    const isMain = this.isMain(id);
    const star = Math.max(1, entry.star);
    const skillUnlocked = isMain ? def.tier >= BALANCE.MAIN_SKILL_TIER : entry.star >= BALANCE.SKILL_UNLOCK_STAR;
    const boosted = isMain ? def.tier >= BALANCE.MAIN_SKILL_BOOST_TIER : entry.star >= BALANCE.SKILL_BOOST_STAR;
    const awakened = !!entry.awakened;
    const awakenCost = BALANCE.AWAKEN.cards[def.grade];
    const nextCost = isMain ? null : promoteCost(def.grade, star);
    const eCost = enhanceCost(entry.enhance);
    // 부문 시너지 only applies to heroes standing in the party (the roster preview shows base numbers for the bench)
    const syn = this.state.party.includes(id) ? this.synergy() : { atk: 0, hp: 0, perks: { skill: 0 } };
    const aff = this.affectionOf(id); const affMult = 1 + aff.level * BALANCE.AFFECTION.bonusPerLevel;
    const skillLv = entry.skillLv | 0;
    const skillPower = (boosted ? BALANCE.SKILL_BOOST_MULT : 1) * (awakened ? BALANCE.AWAKEN.skill : 1) * (1 + syn.perks.skill) * (1 + skillLv * BALANCE.SKILL_LEVEL.powerPerLevel);
    const eq = this.equipStats(id); // 비품 (percentages)
    const view = {
      id, def, entry, isMain, grade: GRADES[def.grade], star,
      atk: Math.floor(heroATK(base.atk, entry.level, star, entry.enhance) * (1 + this.collection().atk + this.prestigeBonus() + syn.atk) * (awakened ? 1 + BALANCE.AWAKEN.atk : 1) * affMult * (1 + eq.atk / 100)),
      hp: Math.floor(heroHP(base.hp, entry.level, star, this.hpBonus() + syn.hp, entry.enhance) * (awakened ? 1 + BALANCE.AWAKEN.hp : 1) * affMult * (1 + eq.hp / 100)),
      affection: aff, awakened, traitMult: awakened ? BALANCE.AWAKEN.trait : (!isMain && star >= BALANCE.STAR_TRAIT_BOOST.star ? BALANCE.STAR_TRAIT_BOOST.mult : 1), awakenCost,
      canAwaken: !isMain && entry.owned && !awakened && star >= BALANCE.AWAKEN.star && this.state.cards >= awakenCost,
      interval: base.interval / (1 + eq.speed / 100), range: base.range,
      equip: eq,
      cost: upgradeCost(entry.level),
      inParty: this.state.party.includes(id),
      skillUnlocked, skillPower: skillPower * (1 + eq.skill / 100), skillLv, skillCdMult: 1 - skillLv * BALANCE.SKILL_LEVEL.cooldownPerLevel,
      skillName: def.skill.name ?? SKILLS[def.skill.type].name,
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
      power: 0, // filled in below (needs atk/hp)
      // 방출은 여분을 정리하는 기능이다: 조각이 하나도 없는 카드(한 번만 뽑은 카드)는 실수로 날리지 않게 막는다
      canDismiss: !isMain && entry.owned && entry.shards >= 1 && !this.state.party.includes(id) && !this.state.favorites?.[id],
      dismissBlockedReason: isMain ? '주인공은 방출할 수 없습니다'
        : !entry.owned ? '미보유 카드입니다'
        : this.state.party.includes(id) ? '파티에 배치된 카드는 방출할 수 없습니다'
        : this.state.favorites?.[id] ? '즐겨찾기한 카드는 방출할 수 없습니다'
        : entry.shards < 1 ? '조각이 1개 이상일 때만 방출할 수 있습니다 (한 번만 뽑은 카드는 보호)'
        : '',
      dismissCards: !isMain ? (BALANCE.DISMISS_CARD_BONUS + entry.shards) * BALANCE.SHARD_CARD_VALUE[def.grade] : 0,
    };
    view.power = Math.round(view.atk * 2 + view.hp / 10); // 전투력: ATK를 2배 가중, HP는 1/10 — 등급·★·레벨·강화·비품이 모두 반영된 단일 비교값
    if (isMain) view.mainPromo = this.mainPromotionInfo();
    return view;
  }

  // ---------------------------------------------------------------- 비품 --
  /** Every item in the bag, newest first, with its live percentage and who is wearing it. */
  equipItems() {
    const E = BALANCE.EQUIP; const wornBy = new Map();
    for (const [heroId, h] of Object.entries(this.state.heroes)) for (const itemId of Object.values(h.equip ?? {})) wornBy.set(itemId, heroId);
    return [...(this.state.equipment?.items ?? [])].reverse().map((it) => ({ ...it, pct: itemPct(it, E.pctPerLevel), label: itemLabel(it), slotName: SLOTS[it.slot].name, stat: SLOTS[it.slot].stat, wornBy: wornBy.get(it.id) ?? null }));
  }
  equipItemById(itemId) { return (this.state.equipment?.items ?? []).find((it) => it.id === itemId) ?? null; }
  /** Percentages a hero currently gets from 비품, by stat. */
  equipStats(heroId) {
    const E = BALANCE.EQUIP; const out = { atk: 0, hp: 0, skill: 0, speed: 0, setName: '', setPct: 0 };
    const worn = this.state.heroes[heroId]?.equip ?? {};
    const items = [];
    for (const slot of SLOT_ORDER) {
      const it = this.equipItemById(worn[slot]); if (!it) continue;
      items.push(it); out[SLOTS[slot].stat] += itemPct(it, E.pctPerLevel);
    }
    if (items.length === SLOT_ORDER.length) { // 세트 효과
      const same = items.every((it) => it.grade === items[0].grade);
      out.setPct = same ? (E.setSame[items[0].grade] ?? E.setAny) : E.setAny;
      out.setName = same ? `${items[0].grade}급 풀세트` : '4부위 착용';
      for (const k of ['atk', 'hp', 'skill', 'speed']) out[k] += out.setPct;
    }
    for (const k of ['atk', 'hp', 'skill', 'speed']) out[k] = +out[k].toFixed(2);
    return out;
  }
  /**
   * Best 비품 loadout for one hero. Two candidates are compared and the stronger total wins:
   *   1. best percentage per slot, ignoring grades
   *   2. the strongest complete same-grade set (which unlocks the bigger 세트 보너스)
   * Items worn by *other* heroes are off limits, so this never quietly strips a teammate.
   */
  bestLoadout(heroId) {
    const E = BALANCE.EQUIP;
    const taken = new Set();
    for (const [hid, h] of Object.entries(this.state.heroes)) { if (hid === heroId) continue; for (const w of Object.values(h.equip ?? {})) taken.add(w); }
    const pool = (this.state.equipment?.items ?? []).filter((it) => !taken.has(it.id));
    const pct = (it) => itemPct(it, E.pctPerLevel);
    const bySlot = (slot, list) => list.filter((it) => it.slot === slot).sort((a, b) => pct(b) - pct(a))[0] ?? null;

    const best = {}; let bestSum = 0;
    for (const slot of SLOT_ORDER) { const it = bySlot(slot, pool); if (it) { best[slot] = it.id; bestSum += pct(it); } }
    if (Object.keys(best).length === SLOT_ORDER.length) bestSum += E.setAny;

    let setBest = null, setSum = -1;
    for (const grade of Object.keys(E.setSame)) {
      const picks = {}; let sum = 0, complete = true;
      for (const slot of SLOT_ORDER) { const it = bySlot(slot, pool.filter((x) => x.grade === grade)); if (!it) { complete = false; break; } picks[slot] = it.id; sum += pct(it); }
      if (!complete) continue;
      sum += E.setSame[grade];
      if (sum > setSum) { setSum = sum; setBest = picks; }
    }
    return setBest && setSum > bestSum ? setBest : best;
  }
  /** Apply bestLoadout to a hero. Returns the number of slots that changed. */
  autoEquip(heroId) {
    const h = this.state.heroes[heroId]; if (!h?.owned) return 0;
    const want = this.bestLoadout(heroId); let changed = 0;
    for (const slot of SLOT_ORDER) {
      const now = h.equip?.[slot] ?? null, next = want[slot] ?? null;
      if (now === next) continue;
      if (next) this.equipItem(heroId, next); else this.unequipItem(heroId, slot);
      changed++;
    }
    return changed;
  }
  /** Auto-equip the whole party, in party order (the front of the list gets first pick). */
  autoEquipParty() {
    let changed = 0, heroes = 0;
    for (const id of this.state.party) { const n = this.autoEquip(id); if (n) { changed += n; heroes++; } }
    if (changed) this.log(`비품 자동 장착: ${heroes}명 · ${changed}부위`, 'info');
    return { changed, heroes };
  }
  /** What a hero is wearing, slot by slot (null where the slot is empty). */
  equipOf(heroId) {
    const E = BALANCE.EQUIP; const worn = this.state.heroes[heroId]?.equip ?? {};
    return SLOT_ORDER.map((slot) => {
      const it = this.equipItemById(worn[slot]);
      return { slot, ...SLOTS[slot], item: it ? { ...it, pct: itemPct(it, E.pctPerLevel), label: itemLabel(it) } : null };
    });
  }
  /** Gold to take an item from its level to the next (scales with the player's stage, like every other gold sink). */
  equipUpgradeCost(item) {
    const E = BALANCE.EQUIP; if (!item || item.lv >= E.maxLevel) return null;
    return relativeGold(this.state.maxStage, E.upgradeGoldKills * E.upgradeGrowth ** item.lv, 1);
  }
  equipDismantleGold(item) { return relativeGold(this.state.maxStage, BALANCE.EQUIP.dismantleGoldKills[item.grade] ?? 2, 1); }

  /** Roll a drop for a cleared stage. Bosses roll twice and keep the better item. Returns the item or null. */
  dropEquipment(stage, boss = false, rnd = Math.random, firstBoss = false) {
    const E = BALANCE.EQUIP; const s = this.state;
    if (rnd() >= (boss ? E.bossDropChance : E.dropChance)) return null;
    if ((s.equipment.items?.length ?? 0) >= E.inventoryMax) { this.log('비품 창고가 가득 찼습니다 — 상세 창 비품 탭에서 분해하세요', 'warn'); return null; }
    const phase = Math.floor((Math.max(1, stage) - 1) / BALANCE.BOSS_EVERY);
    let best = null;
    const rolls = firstBoss ? E.bossFirstRolls : boss ? E.bossRolls : 1;
    for (let i = 0; i < rolls; i++) { const r = rollItem(phase, rnd); if (!best || itemBasePct(r.grade) > itemBasePct(best.grade)) best = r; }
    if (firstBoss && itemBasePct(best.grade) < itemBasePct(E.bossFirstMinGrade)) best.grade = E.bossFirstMinGrade; // 첫 보스 클리어는 최소 B급
    const item = { id: s.equipment.nextId++, ...best };
    s.equipment.items.push(item);
    this.log(`비품 획득: ${itemLabel(item)} (${SLOTS[item.slot].name})`, 'info');
    if (s.equipment.items.length === 1) this.toast('첫 비품을 받았습니다 — 카드를 눌러 「비품」 탭에서 착용하세요'); // first item: the tab is otherwise easy to miss
    this.emit('equipment');
    return item;
  }
  /** Equip an item on a hero; whatever was in that slot goes back to the bag. Items are never worn by two heroes. */
  equipItem(heroId, itemId) {
    const h = this.state.heroes[heroId]; const it = this.equipItemById(itemId);
    if (!h?.owned || !it) return false;
    for (const other of Object.values(this.state.heroes)) for (const [slot, worn] of Object.entries(other.equip ?? {})) if (worn === itemId) delete other.equip[slot];
    h.equip = { ...h.equip, [it.slot]: itemId };
    this.entities.refreshHeroStats(); this.emit('equipment'); this.emit('roster'); this.emit('party');
    return true;
  }
  unequipItem(heroId, slot) {
    const h = this.state.heroes[heroId]; if (!h?.equip?.[slot]) return false;
    delete h.equip[slot];
    this.entities.refreshHeroStats(); this.emit('equipment'); this.emit('roster'); this.emit('party');
    return true;
  }
  upgradeEquip(itemId) {
    const it = this.equipItemById(itemId); const cost = this.equipUpgradeCost(it);
    if (cost === null || this.state.gold < cost) return false;
    this.state.gold -= cost; it.lv += 1;
    this.entities.refreshHeroStats(); this.emit('gold'); this.emit('equipment'); this.emit('roster'); this.emit('party');
    return true;
  }
  /** Dismantle unequipped items back into gold. Returns the gold paid (0 when nothing matched). */
  dismantleEquip(itemIds) {
    const ids = new Set(Array.isArray(itemIds) ? itemIds : [itemIds]);
    const worn = new Set();
    for (const h of Object.values(this.state.heroes)) for (const w of Object.values(h.equip ?? {})) worn.add(w);
    const gone = this.state.equipment.items.filter((it) => ids.has(it.id) && !worn.has(it.id));
    if (!gone.length) return 0;
    const gold = gone.reduce((a, it) => a + this.equipDismantleGold(it), 0);
    this.state.equipment.items = this.state.equipment.items.filter((it) => !gone.includes(it));
    this.state.gold += gold; this.state.stats.totalGold += gold;
    this.log(`비품 ${gone.length}개 분해 +${gold}g`, 'info');
    this.emit('gold'); this.emit('equipment');
    return gold;
  }

  /** Requirements for the main hero's next job tier. */
  mainPromotionInfo() {
    const job = this.mainJob(); const s = this.state;
    if (!job.next.length) return { maxed: true, options: [] };
    const cards = BALANCE.MAIN_PROMOTE_CARDS[job.tier], stage = BALANCE.MAIN_PROMOTE_STAGE[job.tier];
    const e = s.heroes[MAIN_ID]; const cap = enhanceCap(1, false, job.tier), lvl = BALANCE.MAIN_PROMOTE_LEVEL[job.tier] ?? 1;
    const hasEnhance = (e.enhance | 0) >= cap, hasLevel = (e.level | 0) >= lvl;
    return {
      maxed: false, cards, stage, tier: job.tier, enhance: cap, level: lvl,
      hasCards: s.cards >= cards, hasStage: s.maxCleared >= stage, hasEnhance, hasLevel,
      enhanceNow: e.enhance | 0, levelNow: e.level | 0,
      ok: s.cards >= cards && s.maxCleared >= stage && hasEnhance && hasLevel,
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

  /** 픽업 배너 { S: heroId, A: heroId } — rotates every PICKUP_DAYS days. */
  pickup() { return pickupFor(this.state.daily.date); }
  pickupDaysLeft() { return bannerDaysLeft(this.state.daily.date); }
  recruitPoints() { return this.state.recruit?.points ?? 0; }
  canExchangePickup(grade) { return !!this.pickup()[grade] && this.recruitPoints() >= SPARK_COST[grade]; }
  /** 모집 포인트 exchange: take the current pickup card of `grade` (new → ★1, owned → duplicate shards) for SPARK_COST points. */
  exchangePickup(grade) {
    if (!this.canExchangePickup(grade)) return null;
    const heroId = this.pickup()[grade]; const e = this.state.heroes[heroId];
    this.state.recruit.points -= SPARK_COST[grade];
    let isNew = false, shards = 0;
    if (!e.owned) { e.owned = true; e.star = Math.max(1, e.star); e.level = e.level || 1; isNew = true; shards = BALANCE.UNLOCK_SHARDS; }
    else { shards = BALANCE.DUPLICATE_SHARDS_MAX; e.shards += shards; }
    if (isNew && this.state.party.length < BALANCE.PARTY_SIZE) this.state.party.push(heroId);
    const r = { heroId, grade, isNew, shards, pickup: true, exchange: true, def: HERO_BY_ID[heroId] };
    this.entities.rebuildParty();
    this.log(`모집 포인트 ${SPARK_COST[grade]} → ${r.def.name} 영입`, 'gacha');
    this.emit('roster'); this.emit('party'); this.emit('gacha', [r]); this.emit('gems');
    return r;
  }
  pull(count) {
    const cost = count === 10 ? BALANCE.GACHA_TEN_COST : BALANCE.GACHA_SINGLE_COST * count;
    if (this.state.gems < cost) { this.toast('보석이 부족합니다'); return null; }
    this.state.gems -= cost;
    // 신입 환영: a save's first 10-pull guarantees an S (instead of the usual A) so the roster starts with a face
    const minGrade = count === 10 && this.state.stats.totalPulls === 0 && BALANCE.FIRST_TEN_GUARANTEE ? BALANCE.FIRST_TEN_GUARANTEE : BALANCE.TEN_PULL_MIN_GRADE;
    const results = []; let gotMin = false; const minIdx = GRADES[minGrade] ? ['D', 'C', 'B', 'A', 'S'].indexOf(minGrade) : 99;
    for (let i = 0; i < count; i++) {
      const force = count === 10 && i === count - 1 && !gotMin ? minGrade : null;
      const r = pullOnce(this.state.pity, this.state.heroes, this.rng, force, this.pickup());
      if (['D', 'C', 'B', 'A', 'S'].indexOf(r.grade) >= minIdx) gotMin = true;
      if (force) r.guaranteed = true;
      this.state.pity = r.pity; this.state.stats.totalPulls++; this.state.stats.pullGrades[r.grade] = (this.state.stats.pullGrades[r.grade] ?? 0) + 1; this.state.recruit.points++;
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
  /** Gold sunk into a hero's current levels (refunded on dismiss at LEVEL_REFUND, same rate as level-down). */
  levelGold(id) { const L = this.state.heroes[id]?.level | 0; let g = 0; for (let l = 1; l < L; l++) g += upgradeCost(l); return Math.floor(g * BALANCE.LEVEL_REFUND); }
  dismiss(id) {
    const v = this.heroView(id);
    if (!v.canDismiss) return 0;
    const cards = v.dismissCards, refund = this.levelGold(id);
    Object.assign(v.entry, { owned: false, star: 0, shards: 0, level: 1, enhance: 0, skillLv: 0 });
    this.state.cards += cards; this.state.gold += refund;
    if (this.state.party.includes(id)) { this.state.party = this.state.party.filter((x) => x !== id); this.entities.rebuildParty(); }
    this.log(`${v.def.name} 카드 방출 → 강화 카드 ${cards}장${refund ? `, 레벨 골드 ${refund} 환급` : ''}`, 'info');
    this.emit('cards'); this.emit('gold'); this.emit('roster'); this.emit('party');
    return cards;
  }
  /** Cards a 일괄 방출 at `grade` would release (grade and everything below it), newest-weakest first. */
  dismissCandidates(grade = 'C') {
    const order = GRADE_ORDER; const cut = order.indexOf(grade); if (cut < 0) return []; // GRADE_ORDER is D→S, so 이하 = index <= cut
    return Object.keys(this.state.heroes)
      .filter((id) => !this.isMain(id) && order.indexOf(this.heroDef(id).grade) <= cut)
      .map((id) => this.heroView(id))
      .filter((v) => v.canDismiss)
      .sort((a, b) => a.power - b.power);
  }
  /** Release every spare at or below `grade`. Returns { count, cards, gold }. */
  dismissAll(grade = 'C') {
    const list = this.dismissCandidates(grade);
    let cards = 0, gold = 0;
    for (const v of list) { const before = this.state.cards, g0 = this.state.gold; if (this.dismiss(v.id)) { cards += this.state.cards - before; gold += this.state.gold - g0; } }
    if (list.length) this.log(`${grade}급 이하 여분 ${list.length}장 일괄 방출 → 강화 카드 ${cards}장${gold ? `, 골드 ${gold}` : ''}`, 'info');
    return { count: list.length, cards, gold };
  }

  /** Everything claimable on the 검토 sheet in one click: done quests, all-clear bonus, achievements, a finished 출장. */
  claimableSummary() {
    const s = this.state; const quests = Quests.activeQuests(s).filter((q) => Quests.questDone(s, q.id) && !Quests.questClaimed(s, q.id)).length;
    const allClear = !s.daily.allClearClaimed && Quests.allQuestsClaimed(s) ? 1 : 0;
    const ach = Achievements.claimableCount(s); const dispatch = this.dispatchInfo().done ? 1 : 0; const ms = Milestones.pending(s).length;
    return { quests, allClear, ach, dispatch, ms, total: quests + allClear + ach + dispatch + ms };
  }
  claimAll() {
    const s = this.state; const got = { gems: 0, gold: 0, cards: 0, count: 0 };
    const add = (r) => { if (!r) return; got.gems += r.gems ?? 0; got.gold += r.gold ?? 0; got.cards += r.cards ?? 0; got.count++; };
    for (const q of Quests.activeQuests(s)) if (Quests.questDone(s, q.id) && !Quests.questClaimed(s, q.id)) add(this.claimQuest(q.id));
    add(this.claimAllClear());
    for (const a of ACHIEVEMENTS) while (Achievements.canClaim(s, a.id)) add(this.claimAchievement(a.id));
    add(this.claimDispatch());
    for (const r of this.claimMilestonesAll()) add(r.reward);
    if (got.count) this.log(`한꺼번에 수령 ${got.count}건: 보석 +${got.gems}${got.gold ? `, 골드 +${got.gold}` : ''}${got.cards ? `, 카드 +${got.cards}` : ''}`, 'info');
    this.emit('quests');
    return got;
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
      if (this.isMain(id)) { this.toast('주인공은 파티에서 뺄 수 없습니다'); return false; } // 김인턴 is the player, not a slot
      if (p.length === 1) { this.toast('파티에는 최소 1명이 필요합니다'); return false; }
      p.splice(p.indexOf(id), 1);
    } else {
      if (!this.state.heroes[id]?.owned) return false;
      if (this.isDispatched(id)) { this.toast('출장 중인 사원은 파티에 넣을 수 없습니다'); return false; }
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
  /** Detect newly reached milestones (no grant): one notification each, collected on the 검토 sheet. */
  checkMilestones() {
    this.msNotified ??= new Set();
    const fresh = Milestones.pending(this.state).filter((m) => !this.msNotified.has(m.id));
    for (const m of fresh) { this.msNotified.add(m.id); this.log(`마일스톤 달성: ${m.name} — 검토 시트에서 수령 (보석 ${m.reward.gems}${m.reward.cards ? `, 카드 ${m.reward.cards}` : ''})`, 'stage'); this.emit('milestone', { milestone: m, reward: m.reward }); }
    if (fresh.length) { this.emit('quests'); this.emit('sfx', 'clear'); }
    return fresh;
  }
  claimMilestone(id) {
    const r = Milestones.claim(this.state, id);
    if (r) { this.log(`마일스톤 수령: ${r.milestone.name} +${r.reward.gems} 보석${r.reward.cards ? `, 카드 +${r.reward.cards}` : ''}`, 'info'); this.emit('gems'); this.emit('cards'); this.emit('quests'); }
    return r;
  }
  claimMilestonesAll() { const list = Milestones.grantPending(this.state); if (list.length) { this.emit('gems'); this.emit('cards'); this.emit('quests'); } return list; }

  /** True while the party is fighting to clear the current stage (vs. farming it). */
  isChallenging() { return !!this.state.challenging; }
  /** The boss only appears while challenging a boss stage; farming a boss stage spawns normal monsters. */
  bossActive() { return !this.overtime && this.isChallenging() && isBossStage(this.state.stage); }
  /** Stage whose monsters are being spawned right now (야근 모드 borrows a harder stage without changing progress). */
  combatStage() { return this.overtime ? this.overtime.stage : this.state.stage; }
  canOvertime() { return !this.overtime && (!this.state.daily.overtimeDone || (this.state.daily.overtimeExtra ?? 0) > 0); }
  /** 야근 모드: start the once-a-day 60 s survival run. Returns false when already used today. */
  startOvertime() {
    if (!this.canOvertime()) return false;
    const O = BALANCE.OVERTIME;
    if (this.state.daily.overtimeDone) this.state.daily.overtimeExtra = Math.max(0, (this.state.daily.overtimeExtra ?? 0) - 1); // extra run bought with an ad
    this.overtime = { t: O.duration, kills: 0, elites: 0, stage: Math.max(1, this.state.maxStage + O.stageOffset), gold: 0 };
    this.entities.startStage(); this.entities.travelT = O.travel;
    this.log(`야근 모드 시작: ${stageLabel(this.overtime.stage)} 난이도, ${O.duration}초 동안 처치 수만큼 보석`, 'boss');
    this.emit('overtime-start', this.overtime); this.emit('overtime'); this.emit('stage');
    return true;
  }
  #endOvertime() {
    const o = this.overtime; if (!o) return null; const O = BALANCE.OVERTIME;
    const gems = Math.min(O.maxGems, o.kills * O.gemsPerKill + o.elites * O.gemsPerElite);
    const cards = (Math.floor((o.stage - 1) / BALANCE.BOSS_EVERY) + 1) * O.cardsPerPhase;
    this.state.gems += gems; this.state.cards += cards; this.state.daily.overtimeDone = true;
    this.state.stats.overtimes = (this.state.stats.overtimes ?? 0) + 1; this.state.stats.overtimeBest = Math.max(this.state.stats.overtimeBest ?? 0, o.kills);
    const report = { ...o, gems, cards, best: this.state.stats.overtimeBest };
    this.overtime = null;
    this.entities.startStage();
    this.log(`야근 종료: 처치 ${o.kills} (엘리트 ${o.elites}) → 보석 +${gems}, 강화 카드 +${cards}`, 'stage');
    this.emit('overtime-end', report); this.emit('overtime'); this.emit('gems'); this.emit('cards'); this.emit('stage'); this.emit('quests');
    return report;
  }
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
  claimLogin() { const r = Quests.claimLogin(this.state, this.goldMult()); if (r) { this.log(`출근 도장 (연속 ${this.state.login.streak}일${r.streakGems ? `, 보석 +${r.streakGems} 추가` : ''})`, 'info'); this.#afterReward(r); } return r; }
  claimAllClear() { const r = Quests.claimAllClear(this.state, this.goldMult()); if (r) this.#afterReward(r); return r; }
  adsLeft(key = null) { return key ? Quests.adsLeftFor(this.state, key) : Quests.adsLeft(this.state); }

  /** Rewarded-ad menu: what each ad pays right now, how many are left today and whether it applies. */
  adOffers() {
    const O = BALANCE.AD_OFFERS; const s = this.state; const di = this.dispatchInfo();
    return Object.entries(O).map(([key, o]) => {
      const left = this.adsLeft(key);
      let value = '', can = left > 0, reason = left > 0 ? '' : '오늘 소진';
      if (key === 'gold') value = `+${Math.floor(this.goldPerSecAt(s.stage) * o.hours * 3600).toLocaleString()} 골드`;
      else if (key === 'gems') value = `+${o.amount} 보석`;
      else if (key === 'cards') value = `+${o.amount} 강화 카드`;
      else if (key === 'dispatch') { value = di.active && !di.done ? `남은 ${Math.ceil(di.remaining / 60)}분 → 즉시 복귀` : '출장 중일 때만'; if (!(di.active && !di.done)) { can = false; reason = reason || '진행 중인 출장이 없음'; } }
      else if (key === 'overtime') { value = '야근 1회 추가'; if (this.overtime) { can = false; reason = reason || '야근 진행 중'; } else if (!s.daily.overtimeDone) { can = false; reason = reason || '오늘 야근을 먼저 하세요'; } }
      return { key, name: o.name, desc: o.desc, value, left, perDay: o.perDay, can, reason };
    });
  }
  /**
   * Grant an ad reward (after the ad was watched). Flat rewards only — see BALANCE.AD_OFFERS.
   * Legacy kinds 'instant'/'offline' map to the gold offer (the old 2× offline bonus is gone on purpose).
   */
  adReward(kind = 'gold') {
    const key = kind === 'instant' || kind === 'offline' ? 'gold' : kind;
    const o = BALANCE.AD_OFFERS[key]; if (!o) return null;
    const offer = this.adOffers().find((x) => x.key === key); if (!offer?.can) return null;
    if (!Quests.useAd(this.state, key)) return null;
    const s = this.state; const r = { key };
    if (key === 'gold') { r.gold = Math.floor(this.goldPerSecAt(s.stage) * o.hours * 3600); s.gold += r.gold; s.stats.totalGold += r.gold; }
    else if (key === 'gems') { r.gems = o.amount; s.gems += o.amount; }
    else if (key === 'cards') { r.cards = o.amount; s.cards += o.amount; }
    else if (key === 'dispatch') { s.dispatch.endsAt = Date.now(); r.dispatch = true; this.emit('dispatch'); }
    else if (key === 'overtime') { s.daily.overtimeExtra = (s.daily.overtimeExtra ?? 0) + 1; r.overtime = true; this.emit('overtime'); }
    this.log(`광고 시청 보상: ${o.name}`, 'info');
    this.emit('gold'); this.emit('gems'); this.emit('cards'); this.emit('quests');
    return r;
  }

  #afterReward(r) {
    this.log(`보상 수령: ${[r.gems && `보석 ${r.gems}`, r.gold && `골드 ${r.gold}`, r.cards && `강화 카드 ${r.cards}`].filter(Boolean).join(', ')}`, 'info');
    this.emit('gold'); this.emit('gems'); this.emit('cards'); this.emit('quests');
  }

  // ------------------------------------------------------------ 호감도 --
  static affectionXpFor(level) { const A = BALANCE.AFFECTION; return Math.round(A.xpBase * A.xpGrowth ** (level - 1)); } // xp to go from level → level+1
  affectionOf(id) {
    const A = BALANCE.AFFECTION; const e = this.state.affection?.[id] ?? { xp: 0 };
    let level = 0, xp = e.xp | 0, next = GameManager.affectionXpFor(1);
    while (level < A.maxLevel && xp >= next) { xp -= next; level++; next = level < A.maxLevel ? GameManager.affectionXpFor(level + 1) : 0; }
    const maxed = level >= A.maxLevel;
    const today = localDateKey(); const gifted = e.gift === today;
    return { level, xp: maxed ? 0 : xp, next, pct: maxed ? 1 : xp / next, maxed, gifted, total: e.xp | 0, bonus: level * A.bonusPerLevel,
      secretUnlocked: level >= A.unlockSecret, lineUnlocked: level >= A.unlockLine };
  }
  #addAffection(id, n) {
    const A = BALANCE.AFFECTION; const before = this.affectionOf(id).level;
    const e = (this.state.affection[id] ??= { xp: 0 }); const cap = Array.from({ length: A.maxLevel }, (_, i) => GameManager.affectionXpFor(i + 1)).reduce((a, b) => a + b, 0);
    e.xp = Math.min(cap, (e.xp | 0) + n);
    const after = this.affectionOf(id).level;
    if (after > before) { if (after >= A.maxLevel) for (const sk of this.skinsOf(id)) if (sk.unlock.affection && !sk.owned) this.unlockSkin(id, sk.id);
      this.emit('affection', { id, level: after }); this.log(`${this.heroDef(id).name} 호감도 Lv ${after}${after === A.unlockSecret ? ' · 사무실 비화 해금' : after === A.unlockLine ? ' · 개인 메시지 해금' : after === A.maxLevel ? ' · MAX' : ''}`, 'info'); this.emit('roster'); }
  }
  giftCost() { return relativeGold(this.state.maxStage, BALANCE.AFFECTION.giftGoldKills, this.goldMult()); }
  /** 간식 사주기: once per hero per day, costs gold relative to the best stage. */
  giveGift(id) {
    const e = this.state.heroes[id]; if (!e?.owned) return false;
    const a = this.affectionOf(id); if (a.gifted || a.maxed) return false;
    const cost = this.giftCost(); if (this.state.gold < cost) return false;
    this.state.gold -= cost; (this.state.affection[id] ??= { xp: 0 }).gift = localDateKey();
    this.#addAffection(id, BALANCE.AFFECTION.giftXp);
    this.entities.levelUpFx?.(id);
    this.log(`${this.heroDef(id).name}에게 간식 (-${cost}g)`, 'info');
    this.emit('gold'); this.emit('roster'); this.emit('affection', { id, level: this.affectionOf(id).level });
    return true;
  }
  // ------------------------------------------------------------ 메신저 --
  storyUnlocked(id) { const ep = EPISODE_BY_ID[id]; return !!ep && episodeUnlocked(ep, this.state.maxStage); }
  /** Mark an episode read; the first read pays BALANCE.STORY.gems. Returns gems granted (0 when already read / locked). */
  readStory(id) {
    if (!this.storyUnlocked(id) || this.state.storyRead[id]) return 0;
    this.state.storyRead[id] = true; this.state.gems += BALANCE.STORY.gems;
    this.log(`메신저 ${EPISODE_BY_ID[id].title} 읽음 · 보석 +${BALANCE.STORY.gems}`, 'info'); this.emit('gems'); this.emit('story');
    return BALANCE.STORY.gems;
  }
  /** A random party member says their line in a speech bubble (stage start / clear). */
  sayLine(kind = 'line') {
    const heroes = this.entities.heroes.filter((h) => h.alive); if (!heroes.length) return;
    const h = heroes[Math.floor(Math.random() * heroes.length)];
    const p = PROFILES[this.isMain(h.heroId) ? 'main' : h.heroId]; if (!p) return;
    const aff = this.affectionOf(h.heroId);
    const text = kind === 'ult' ? p.ult : (aff.lineUnlocked && Math.random() < 0.3 ? null : p.line);
    if (!text) return;
    h.say = { text, t: 3.2 };
  }

  // ---------------------------------------------------------- stage flow --
  /** 오류 도감: kills per base monster type (the ':phase' suffix is stripped so every colour variant counts as one entry). */
  #recordKill(m) {
    const key = m.isBoss ? m.def.id : String(m.def.id).split(':')[0];
    const b = (this.state.bestiary ??= {});
    const wasNew = !b[key];
    b[key] = (b[key] ?? 0) + 1;
    if (m.elite) b[`${key}!`] = (b[`${key}!`] ?? 0) + 1;
    if (wasNew) this.emit('bestiary', key);
  }
  bestiaryCount(typeId) { return this.state.bestiary?.[typeId] ?? 0; }
  bestiaryDiscovered() { return Object.keys(this.state.bestiary ?? {}).filter((k) => !k.endsWith('!')).length; }
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
    const gold = Math.floor((m.isBoss ? bossGold(s.stage) : baseGold(this.combatStage())) * this.goldMult() * (m.elite ? BALANCE.ELITE.gold : 1) * (stageModifier(this.combatStage())?.gold ?? 1));
    s.gold += gold; s.stats.totalGold += gold; s.stats.totalKills++;
    this.#recordKill(m);
    for (const id of s.party) this.#addAffection(id, m.isBoss ? BALANCE.AFFECTION.xpPerBoss : BALANCE.AFFECTION.xpPerKill);
    Quests.addProgress(s, 'kills', 1); if (m.elite) Quests.addProgress(s, 'elite', 1);
    this.entities.coinBurst(m.x, m.y, gold);
    if (!m.isBoss && this.rng.next() < this.gemDropChance()) { // 보석 드롭 (성과급 제도)
      const drop = BALANCE.GEM_DROP.amount * (m.elite ? BALANCE.GEM_DROP.eliteMult : 1);
      s.gems += drop; s.stats.gemDrops = (s.stats.gemDrops ?? 0) + drop;
      this.entities.floaters.push({ x: m.x, y: m.y - 64, text: `보석 +${drop}`, color: '#5dade2', t: 0, big: m.elite });
      this.emit('gems');
    }
    if (this.overtime) { this.overtime.kills++; if (m.elite) this.overtime.elites++; this.emit('overtime'); this.emit('gold'); return; }
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
    const gems = gemsForClear(s.stage, { first, boss });
    const lucky = this.partyTraitCount('lucky') * TRAITS.lucky.value;
    const cards = first ? (Math.floor((s.stage - 1) / BALANCE.BOSS_EVERY) + 1) * BALANCE.CARDS_FIRST_CLEAR_PER_PHASE : 0;
    s.gems += gems + lucky; s.cards += cards; s.maxCleared = Math.max(s.maxCleared, s.stage);
    const drop = this.dropEquipment(s.stage, boss, Math.random, boss && first);
    this.checkMilestones();
    Quests.addProgress(s, 'clears', 1);
    this.log(`${this.stageLabel()} 마감 +${gems + lucky} 보석${cards ? ` +${cards} 강화 카드` : ''}${drop ? ` · 비품 ${itemLabel(drop)}` : ''}`, 'stage');
    s.kills = 0; s.challenging = false;
    this.emit('cleared', { stage: s.stage, boss, first });
    if (boss || first) this.sayLine();
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
    if (this.overtime) { this.entities.startStage(); this.entities.travelT = BALANCE.OVERTIME.travel; this.log('야근 중 전원 번아웃 — 재정비 후 계속', 'warn'); this.emit('wipe'); return; }
    if (this.isChallenging() && s.stage === 1 && s.maxCleared === 0) { this.entities.startStage(); this.log('팀 전원 번아웃. Phase 1-1 재정비 (튜토리얼: 진행도 유지)', 'warn'); this.emit('stage'); }
    else if (this.isChallenging()) this.#failChallenge('팀 전원 번아웃');
    else { this.entities.startStage(); this.log(`팀 전원 번아웃. ${this.stageLabel()} 사냥 재시작`, 'warn'); this.emit('stage'); }
    this.emit('wipe');
  }

  // ----------------------------------------------------------------- loop --
  tick(dt, now = Date.now()) {
    if (this.paused) return; // login gate: nothing moves until the account is known
    this.state.stats.playSeconds += dt;
    if (this.overtime) { this.overtime.t -= dt; if (this.overtime.t <= 0) this.#endOvertime(); }
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
    this.saveTimer += dt; this.dailyTimer += dt; this.cloud?.tick(dt);
    if (this.dailyTimer >= 60) { this.dailyTimer = 0; if (Quests.ensureDaily(this.state, now)) { this.log('새로운 업무일이 시작되었습니다', 'info'); this.emit('quests'); } }
    if (this.saveTimer >= BALANCE.SAVE_INTERVAL_MS / 1000) { this.saveTimer = 0; this.persist(); }
  }
  persist() { if (this.save) { this.save.save(this.state); this.emit('saved'); } }
  /** 클라우드 설정 (server URL + nickname). Clearing the URL turns the feature off; nothing else changes. */
  setCloud({ url, name } = {}) {
    const c = this.state.settings.cloud ?? { url: '', name: '' };
    if (url !== undefined) c.url = String(url).trim();
    if (name !== undefined) c.name = name.trim() ? sanitizeName(name) : '';
    this.state.settings.cloud = c; this.cloud.timer = 0; this.persist(); this.emit('settings'); this.emit('cloud', this.cloud);
  }
  /** Replace the running game with a save fetched from the server (used by the backstage "서버에서 불러오기" button). */
  loadCloudSave(raw) {
    const s = migrate(raw); if (!s) return false;
    this.state = s; Quests.ensureDaily(this.state);
    this.entities.rebuildParty(); this.entities.startStage();
    this.persist(); this.emit('reset'); this.log('서버 저장본을 불러왔습니다', 'info');
    return true;
  }

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
