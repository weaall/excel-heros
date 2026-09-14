// Global game state, economy, stage flow and player actions. Emits events for the UI.
import { BALANCE, upgradeCost, baseGold, bossGold, isBossStage, stageLabel, heroATK, heroHP, teamUpgradeCost, teamUpgradeBonus, estimateGoldPerSec } from '../config/balance.js';
import { HERO_BY_ID, GRADES, SKILLS, heroBaseStats } from '../data/heroes.js';
import { pullOnce, promoteCost } from './GachaManager.js';
import { createInitialState } from './state.js';
import { EntityManager } from './EntityManager.js';
import { Emitter } from '../utils/events.js';
import { createRng } from '../utils/rng.js';

export class GameManager extends Emitter {
  constructor({ state, save, rng = createRng() } = {}) {
    super();
    this.state = state ?? createInitialState();
    this.save = save;
    this.rng = rng;
    this.logs = [];
    this.rowCounter = 1000 + Math.floor(Math.random() * 500);
    this.saveTimer = 0;
    this.entities = new EntityManager(this);
    this.entities.rebuildParty();
    this.entities.startStage();
  }

  // ------------------------------------------------------------- derived --
  stageLabel() { return stageLabel(this.state.stage); }
  goldMult() { return 1 + teamUpgradeBonus('payroll', this.state.team.payroll); }
  speedMult() { return 1 + teamUpgradeBonus('coffee', this.state.team.coffee); }
  hpBonus() { return teamUpgradeBonus('chairs', this.state.team.chairs); }

  heroView(id) {
    const def = HERO_BY_ID[id], entry = this.state.heroes[id];
    const base = heroBaseStats(def);
    const star = Math.max(1, entry.star);
    const skillUnlocked = entry.star >= BALANCE.SKILL_UNLOCK_STAR;
    const skillPower = entry.star >= BALANCE.SKILL_BOOST_STAR ? BALANCE.SKILL_BOOST_MULT : 1;
    const nextCost = promoteCost(def.grade, star);
    return {
      def, entry, grade: GRADES[def.grade], star,
      atk: heroATK(base.atk, entry.level, star),
      hp: heroHP(base.hp, entry.level, star, this.hpBonus()),
      interval: base.interval, range: base.range,
      cost: upgradeCost(entry.level),
      inParty: this.state.party.includes(id),
      skillUnlocked, skillPower,
      skillName: SKILLS[def.skill.type].name,
      skillDesc: SKILLS[def.skill.type].desc.replace('{p}', def.skill.power * skillPower),
      promoteCost: nextCost,
      canPromote: entry.owned && nextCost !== null && entry.shards >= nextCost,
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
    this.entities.refreshHeroStats();
    this.emit('gold'); this.emit('roster');
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
    if (n) { this.entities.refreshHeroStats(); this.emit('gold'); this.emit('roster'); }
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
    if (this.state.gems < cost) { this.toast('Not enough Gems'); return null; }
    this.state.gems -= cost;
    const results = [];
    for (let i = 0; i < count; i++) {
      const r = pullOnce(this.state.pity, this.state.heroes, this.rng);
      this.state.pity = r.pity; this.state.stats.totalPulls++;
      results.push({ ...r, def: HERO_BY_ID[r.heroId] });
      // auto-deploy new hires into empty party seats
      if (r.isNew && this.state.party.length < BALANCE.PARTY_SIZE) this.state.party.push(r.heroId);
    }
    this.entities.rebuildParty();
    this.log(`Imported ${count} row(s) from Data_Import`, 'gacha');
    this.emit('gems'); this.emit('roster'); this.emit('party'); this.emit('gacha', results);
    return results;
  }

  promote(id) {
    const v = this.heroView(id);
    if (!v.canPromote) return false;
    v.entry.shards -= v.promoteCost; v.entry.star += 1;
    this.entities.refreshHeroStats();
    this.log(`${v.def.name} promoted to ${'★'.repeat(v.entry.star)}`, 'info');
    this.emit('roster');
    return true;
  }

  toggleParty(id) {
    const p = this.state.party;
    if (p.includes(id)) {
      if (p.length === 1) { this.toast('Party needs at least one hero'); return false; }
      p.splice(p.indexOf(id), 1);
    } else {
      if (!this.state.heroes[id]?.owned) return false;
      if (p.length >= BALANCE.PARTY_SIZE) { this.toast('Party is full (5/5)'); return false; }
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

  // ---------------------------------------------------------- stage flow --
  onMonsterKilled(m) {
    const s = this.state;
    const gold = Math.floor((m.isBoss ? bossGold(s.stage) : baseGold(s.stage)) * this.goldMult());
    s.gold += gold; s.stats.totalGold += gold; s.stats.totalKills++;
    if (m.isBoss) {
      s.stats.bossKills++;
      this.log(`Boss resolved: ${m.def.name} +${gold}g`, 'boss');
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
    this.log(`${this.stageLabel()} cleared +${gems} gems`, 'stage');
    const next = s.stage + 1;
    s.kills = 0;
    if (isBossStage(next) && !s.settings.autoBoss) this.log(`Auto-boss off: looping ${this.stageLabel()}`, 'info');
    else { s.stage = next; s.maxStage = Math.max(s.maxStage, next); }
    this.entities.startStage();
    this.emit('stage'); this.emit('gems'); this.emit('kills');
  }

  onBossTimeout() {
    const s = this.state; s.stats.bossFails++;
    this.log(`Boss escalated (${BALANCE.BOSS_TIME_LIMIT}s timeout). Retreating to ${stageLabel(s.stage - 1)}`, 'warn');
    s.stage = Math.max(1, s.stage - 1); s.kills = 0;
    this.entities.startStage();
    this.emit('stage'); this.emit('kills');
  }

  onPartyWiped() {
    const s = this.state;
    if (s.stage > 1) { s.stage -= 1; s.kills = 0; this.log(`Whole team burned out. Retreating to ${this.stageLabel()}`, 'warn'); }
    else this.log('Whole team burned out. Regrouping on Phase 1-1 (progress kept)', 'warn');
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
  tick(dt) {
    this.state.stats.playSeconds += dt;
    this.entities.update(dt);
    this.saveTimer += dt;
    if (this.saveTimer >= BALANCE.SAVE_INTERVAL_MS / 1000) { this.saveTimer = 0; this.persist(); }
  }
  persist() { if (this.save) { this.save.save(this.state); this.emit('saved'); } }

  /** Idle/offline reward (also used when the tab was throttled for a long time). */
  applyOffline(report) {
    if (!report) return;
    this.state.gold += report.gold; this.state.stats.totalGold += report.gold;
    this.log(`Offline batch: +${report.gold}g for ${Math.floor(report.seconds / 60)}m`, 'info');
    this.emit('gold');
  }

  exportSave() { return this.save.export(this.state); }
  importSave(str) {
    const st = this.save.import(str);
    this.state = st;
    this.#rebuildWorld();
  }
  reset() {
    this.save.clear(); this.state = createInitialState(); this.logs = [];
    this.#rebuildWorld();
  }
  #rebuildWorld() {
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
