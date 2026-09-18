// Side-view line combat: the party stands in one row on the left and never actually moves —
// between waves the dungeon scrolls under their feet while they run; monsters arrive from the
// right in waves and line up opposite. Melee heroes dash out and back to strike, ranged heroes
// and monsters fire projectiles that hit on arrival. Also owns projectiles, floaters, particles, effects.
import { BALANCE, monsterHP, monsterATK, bossHP, bossATK, isBossStage } from '../config/balance.js';
import { TRAITS, SKILLS, GRADES } from '../data/heroes.js';
import { stageModifier } from '../data/stages.js';
import { monsterForStage, bossForStage, eliteChance, asElite, CHEST, MIMIC } from '../data/monsters.js';
import { skillQuip, bossLine } from '../data/quips.js';

export const GRID = Object.freeze({ cols: 13, rows: 8, cellW: 64, cellH: 52 });
export const CANVAS_W = GRID.cols * GRID.cellW;   // 832
export const CANVAS_H = GRID.rows * GRID.cellH;   // 416
export const GROUND_Y = 318;                        // baseline the party stands on
const FRONT_X = 400;                                // x of the front-most hero
const LINE_GAP = 60;                                // spacing between heroes in the line

const ROLE_PRIORITY = { tank: 0, melee: 1, healer: 2, ranged: 3 };
const T = (k) => TRAITS[k].value;
/** 영웅의 특성 값: 각성 ×1.5, 그리고 ★당 +12%. 접근자가 여기 하나뿐이라 전투 전체가 한 번에 따라온다. */
const tv = (h, k) => TRAITS[k].value * (h.traitMult ?? 1) * (1 + BALANCE.TRAIT_STAR.perStar * Math.max(0, (h.star ?? 1) - 1));
const RANGED_SHAPES = { sheet: 'paper', chart: 'bar', cursor: 'arrow', cloud: 'drop', hourglass: 'sand' };
/** What each ranged/healer hero throws (office supplies). Unlisted heroes fire a plain shot. */
const HERO_SHOT = { parttime: 'drop', contract: 'paper', vlookup: 'bar', acct_lead: 'bar', cfo: 'sand', ceo: 'arrow', helpdesk: 'bar', pm_lead: 'paper', cmo: 'paper', barista: 'drop', hr_jung: 'paper', welfare: 'drop', design_lead: 'arrow', cleaner: 'drop' };
const ENRAGE = { at: 0.5, atk: 1.2, speed: 1.3, interval: 0.7 }; // bosses enrage under 50% HP
// 스킬 연출이 겹치지 않도록 두는 최소 간격. 필살기는 컷인이 길어 조금 더 쉰다.
const CAST_GAP = 1.1, CAST_GAP_ULT = 2.0;
const TRAVEL_TIME = 1.6;      // seconds of scrolling between waves
const SCROLL_SPEED = 150;     // px/s background scroll while travelling
const MELEE_REACH = 9;        // melee heroes dash to any monster that has reached the line, wherever they stand
const TANK_REACH = 9;

let nextId = 1;

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.heroes = []; this.monsters = []; this.projectiles = []; this.floaters = []; this.particles = []; this.effects = [];
    this.boss = null; this.bossTimer = 0;
    this.atkBuff = { mult: 1, until: 0 }; this.hasteBuff = { mult: 1, until: 0 }; this.barrier = { hp: 0, max: 0, until: 0 }; this.slow = { mult: 1, until: 0 }; // slow: boss debuff on party attack speed
    this.taunt = null; // { heroId, reduce, until } — 도발: every monster swings at this hero and it hurts less
    this.castLock = 0; // 스킬 순차 발동: 남은 잠금 시간(초). 한 번에 하나씩만 터지게 한다
    this.braced = false; // 수식 대응 성공 — 다음 특수 공격 한 번만 약해진다
    this.healerAura = 0; // 파티의 힐러가 주는 상시 회복 (rebuildParty 에서 계산)
    this.time = 0; this.dmgLog = []; this.rallyMult = 1; this.shake = 0;
    this.scroll = 0;            // background scroll offset (px)
    this.traveling = false; this.travelT = 0;
    this.wave = 0;
    this.combo = 0; this.comboT = 0; this.flashT = 0;   // hit combo (resets when a hero is hurt), ult screen flash
  }

  // ---------------------------------------------------------------- party --
  rebuildParty() {
    const s = this.game.state;
    const prev = new Map(this.heroes.map((h) => [h.heroId, h]));
    const defs = s.party.map((id) => { const d = this.game.heroDef(id); return d ? { ...d, heroId: id } : null; }).filter(Boolean)
      .sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role]);
    this.heroes = defs.map((def, i) => {
      const old = prev.get(def.heroId);
      const e = old ?? this.#makeHero(def);
      e.def = def; e.role = def.role; e.trait = def.trait;
      e.homeX = FRONT_X - i * LINE_GAP; e.homeY = GROUND_Y + (i % 2 ? 6 : -6); e.slot = i === 0 ? 'front' : i < 3 ? 'mid' : 'back';
      e.x = e.homeX; e.y = e.homeY;
      return e;
    });
    this.refreshHeroStats();
  }

  #makeHero(def) {
    return {
      id: nextId++, kind: 'hero', heroId: def.heroId, def, role: def.role, trait: def.trait,
      x: 0, y: 0, homeX: 0, homeY: 0, hp: 1, maxHp: 1, atk: 1, interval: 1, cd: Math.random() * 0.5,
      range: 0, alive: true, reviveT: 0, targetId: null,
      anim: 'idle', animT: 0, skillCd: 2 + Math.random() * 3, star: 1, level: 1, shake: 0, flash: 0, dashTo: 0,
    };
  }

  refreshHeroStats() {
    this.perks = this.game.synergy().perks; // 부문 고유 특성 (party-wide)
    for (const e of this.heroes) e.traitMult = this.game.heroView(e.heroId).traitMult ?? 1;
    this.rallyMult = 1 + this.heroes.filter((h) => h.trait === 'rally').reduce((a, h) => a + tv(h, 'rally'), 0);
    for (const e of this.heroes) {
      const v = this.game.heroView(e.heroId);
      const ratio = e.maxHp ? e.hp / e.maxHp : 1;
      e.atk = v.atk; e.maxHp = v.hp; e.hp = Math.min(e.maxHp, Math.max(1, Math.round(e.maxHp * ratio)));
      e.interval = v.interval / (e.trait === 'swift' ? 1 + tv(e, 'swift') : 1);
      e.range = (e.role === 'tank' ? TANK_REACH : e.role === 'melee' ? MELEE_REACH : v.range) * GRID.cellW;
      e.star = v.entry.star; e.level = v.entry.level;
      e.skill = v.def.skill; e.skillUnlocked = v.skillUnlocked; e.skillPower = v.skillPower; e.skillName = v.skillName; e.skillCdMult = v.skillCdMult ?? 1;
    }
    // 힐러 상시 오라: 파티의 힐러마다 전원이 초당 조금씩 회복한다. ★로 커지므로 **★을 채운 뒤에** 계산한다.
    { const P = BALANCE.ROLE_PASSIVE.healer;
      this.healerAura = this.heroes.filter((h) => h.role === 'healer')
        .reduce((a, h) => a + P.regen + P.perStar * Math.max(0, (h.star ?? 1) - 1), 0); }
  }

  levelUpFx(heroId) {
    const h = this.heroes.find((e) => e.heroId === heroId); if (!h) return;
    this.floaters.push({ x: h.x, y: h.y - 44, text: 'LEVEL UP', color: '#f1c40f', t: 0, big: true });
    this.fx('sparkle', { x: h.x, y: h.y, color: '#f1c40f', n: 10 });
  }
  fx(type, props) { this.effects.push({ type, t: 0, life: props.life ?? 0.4, ...props }); }

  // ---------------------------------------------------------------- stage --
  /**
   * 새 스테이지 시작.
   * @param {boolean} regroup 재정비 여부. 후퇴·전멸·야근처럼 **판을 다시 까는** 경우에만 true 이고,
   *   그때만 쓰러진 사원이 일어난다. 전진(도전 성공)은 false — 그래서 깊이 밀수록 파티가 줄어들고,
   *   그 줄어듦이 곧 '이 파티의 한계'가 된다. 살아 있는 사원은 언제나 체력만 회복한다.
   */
  startStage(regroup = false) {
    this.monsters = []; this.projectiles = []; this.boss = null; this.bossTimer = 0; this.wave = 0;
    for (const h of this.heroes) {
      if (regroup) { h.alive = true; h.reviveT = 0; }
      if (h.alive) h.hp = h.maxHp;
      h.x = h.homeX; h.y = h.homeY; h.targetId = null; h.anim = 'walk';
    }
    this.traveling = true; this.travelT = TRAVEL_TIME * 0.6;
  }

  #frontX() { const alive = this.heroes.filter((h) => h.alive); return alive.length ? Math.max(...alive.map((h) => h.x)) : FRONT_X; }

  /**
   * **사냥은 쉬는 상태다.** 도전 중이 아니면 웨이브 사이에 쓰러진 사원이 일어난다.
   *
   * 이게 없으면 소모전에 출구가 없다 — 승산이 낮아 안전 자동 진행이 멈춰 있고, 멈춰 있는 동안 사냥하다
   * 또 쓰러지므로 파티는 영구히 이 빠진 채로 같은 단계를 무한히 돈다. 전멸조차 하지 않으니 후퇴도 없다.
   * 관측: 4시간 중 마지막 90분을 117단계에서 쓰러짐 129회로 보냈다(6-95).
   */
  #restIfFarming() {
    const g = this.game;
    if (g.isChallenging?.() || g.overtime) return;
    let up = 0;
    for (const h of this.heroes) if (!h.alive) { h.alive = true; h.reviveT = 0; h.hp = h.maxHp; h.x = h.homeX; h.y = h.homeY; h.targetId = null; up++; }
    if (up) g.log?.(`사냥 중 인사 복구 — ${up}명 복귀`, 'info');
  }

  #spawnWave() {
    const stage = this.game.combatStage();
    this.wave++;
    if (this.game.overtime) { // 야근 모드: dense wave, high elite rate, no chests, short travel
      const O = BALANCE.OVERTIME;
      for (let i = 0; i < O.count; i++) { const m = this.#spawnMonster(stage, false, i, null, O.elite); m.speed *= 1.15; }
      return;
    }
    if (this.game.bossActive()) {
      this.boss = this.#spawnMonster(stage, true, 0);
      this.bossTimer = BALANCE.BOSS_TIME_LIMIT; this.shake = 8;
      this.game.log(`보스 등장: ${this.boss.def.name} (${this.game.stageLabel()}) — ${this.boss.def.desc}`, 'boss');
      return;
    }
    const mod = stageModifier(stage);
    const count = Math.min(BALANCE.MAX_MONSTERS + (mod?.count ?? 0), 3 + Math.floor(stage / 10) + (mod?.count ?? 0));
    for (let i = 0; i < count; i++) { const m = this.#spawnMonster(stage, false, i); if (mod?.speed) m.speed *= mod.speed; }
    if (Math.random() < BALANCE.CHEST.chance) this.spawnChest(Math.random() < BALANCE.CHEST.mimicChance, count);
  }

  /** A treasure chest (or mimic) walks in with the wave. Chests never attack; mimics bite like a melee monster. */
  spawnChest(mimic = false, index = 0) {
    const stage = this.game.state.stage;
    const e = this.#spawnMonster(stage, false, index, mimic ? MIMIC : CHEST);
    e.hp = e.maxHp = Math.max(1, Math.floor(monsterHP(stage) * BALANCE.CHEST.hpMult * (mimic ? 1.6 : 1)));
    e.atk = mimic ? Math.floor(monsterATK(stage) * 1.3) : 0; e.interval = 1.2; e.speed = BALANCE.MONSTER_SPEED * 0.8;
    e.elite = false; e.proj = null; e.standoff = GRID.cellW * 0.9 + index * 34;
    this.fx('sparkle', { x: Math.min(e.x, CANVAS_W - 40), y: e.y - 20, color: '#f9e79f', n: 8 });
    return e;
  }

  #spawnMonster(stage, isBoss, index, forcedDef = null, eliteRate = null) {
    const mod = isBoss ? null : stageModifier(stage);
    let def = forcedDef ?? (isBoss ? bossForStage(stage) : monsterForStage(stage, Math.random()));
    const elite = !isBoss && !forcedDef && Math.random() < (eliteRate ?? eliteChance(stage) * (stageModifier(stage)?.elite ?? 1));
    if (elite) def = asElite(def, Math.random());
    const proj = !isBoss ? (def.ranged ?? RANGED_SHAPES[def.shape]) : null;
    const range = (isBoss ? 1.5 : proj ? 3.6 + index * 0.3 : 0.9) * GRID.cellW;
    const e = {
      id: nextId++, kind: 'monster', def, isBoss, elite, proj,
      x: CANVAS_W + 60 + index * 58 + Math.random() * 20, y: GROUND_Y + (index % 2 ? 10 : -8) + (Math.random() * 8 - 4),
      hp: (isBoss ? bossHP(stage) * (def.hp ?? 1) : monsterHP(stage)) * (elite ? BALANCE.ELITE.hp : 1) * (isBoss ? 1 : mod?.hp ?? 1),
      atk: (isBoss ? bossATK(stage) * (def.atk ?? 1) : monsterATK(stage)) * (elite ? BALANCE.ELITE.atk : 1) * (isBoss ? 1 : mod?.atk ?? 1),
      interval: isBoss ? (def.interval ?? 2.0) : proj ? 1.9 : 1.5, cd: 0.9 + Math.random() * 0.6, hits: 0,
      range, standoff: range * 0.9 + (proj ? 0 : index * 34),
      speed: isBoss ? (def.speed ?? 40) : BALANCE.MONSTER_SPEED * (0.9 + Math.random() * 0.25) * (elite ? 0.9 : 1),
      alive: true, targetId: null, anim: 'walk', animT: Math.random(), stun: 0, shake: 0, lunge: 0, flash: 0, spawnT: 0,
      w: isBoss ? 128 : 64, h: isBoss ? 116 : 64,
    };
    if (def.affix) { const a = def.affix; if (a.hp) e.hp *= a.hp; if (a.speed) e.speed *= a.speed; if (a.interval) e.interval *= a.interval; }
    e.hp = Math.floor(e.hp); e.atk = Math.floor(e.atk); e.maxHp = e.hp;
    if (def.affix?.shield) e.shield = Math.floor(e.maxHp * def.affix.shield);
    this.monsters.push(e);
    if (elite) this.fx('ring', { x: Math.min(e.x, CANVAS_W - 40), y: e.y, color: '#f1c40f', radius: 40, life: 0.6 });
    return e;
  }

  // --------------------------------------------------------------- update --
  update(dt) {
    this.time += dt;
    for (const h of this.heroes) if (h.say) { h.say.t -= dt; if (h.say.t <= 0) h.say = null; } // speech bubbles expire even while travelling
    for (const m of this.monsters) if (m.say) { m.say.t -= dt; if (m.say.t <= 0) m.say = null; }
    this.shake = Math.max(0, this.shake - dt * 30); this.flashT = Math.max(0, this.flashT - dt);
    if (this.combo > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    const heroes = this.heroes.filter((e) => e.alive), monsters = this.monsters.filter((e) => e.alive);
    if (this.atkBuff.until < this.time) this.atkBuff.mult = 1;
    if (this.hasteBuff.until < this.time) this.hasteBuff.mult = 1;
    if (this.barrier.until < this.time) this.barrier.hp = 0;
    if (this.slow.until < this.time) this.slow.mult = 1;
    if (this.taunt && this.taunt.until < this.time) this.taunt = null;
    if (this.castLock > 0) this.castLock = Math.max(0, this.castLock - dt);
    const speedMult = this.game.speedMult() * this.hasteBuff.mult * this.slow.mult * (stageModifier(this.game.combatStage())?.heroSpeed ?? 1);

    // --- travel between waves: scroll the dungeon, party runs in place
    if (!monsters.length && !this.boss) {
      if (!this.traveling) { this.traveling = true; this.travelT = this.game.overtime ? BALANCE.OVERTIME.travel : TRAVEL_TIME; }
      this.travelT -= dt; this.scroll += SCROLL_SPEED * dt;
      for (const h of heroes) { h.anim = 'walk'; h.animT += dt; }
      if (this.travelT <= 0) { this.traveling = false; this.#restIfFarming(); this.#spawnWave(); }
    } else if (this.traveling) { this.traveling = false; }
    if (this.boss) {
      // the clock only runs once the boss has reached the line — walking in must not eat into the time limit
      if (this.boss.arrived) { this.bossTimer -= dt; if (this.bossTimer <= 0 && this.boss.alive) { this.game.onBossTimeout(); return; } }
      const b = this.boss;
      if (b.alive && !b.enraged && b.hp <= b.maxHp * ENRAGE.at) { // 격노: faster, harder, the arena shakes
        b.enraged = true; b.atk = Math.floor(b.atk * ENRAGE.atk); b.speed *= ENRAGE.speed; b.interval *= ENRAGE.interval; b.cd = Math.min(b.cd, 0.6);
        this.shake = Math.max(this.shake, 10); this.fx('ring', { x: b.x, y: b.y, color: '#e74c3c', radius: 160, life: 0.6 });
        this.floaters.push({ x: b.x, y: b.y - 96, text: '격노!', color: '#e74c3c', t: 0, big: true });
        this.game.log(`${b.def.name} 격노! 공격력 ×${ENRAGE.atk}, 속도 상승`, 'boss'); this.game.emit('sfx', 'boss'); this.game.emit('enrage', { boss: b });
      }
    }

    // --- heroes ---------------------------------------------------------
    for (const h of this.heroes) {
      h.shake = Math.max(0, h.shake - dt * 8); h.flash = Math.max(0, h.flash - dt);
      if (!h.alive) continue; // 쓰러지면 이 스테이지 동안 일어나지 못한다 — 부활 스킬만이 예외다
      if (this.traveling) continue;
      h.animT += dt;
      // 전투 중과 전투 밖의 회복을 분리한다. 전투 중에 알아서 차오르면 힐러를 넣을 이유가 사라진다.
      const inFight = this.monsters.some((m) => m.alive && m.arrived) || (this.boss?.alive && this.boss.arrived);
      const base = inFight ? BALANCE.HERO_REGEN_PCT : BALANCE.HERO_REGEN_IDLE_PCT;
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (base + (h.trait === 'regen' ? tv(h, 'regen') : 0) + (this.perks?.regen ?? 0) + (this.healerAura ?? 0)) * dt);
      const rush = h.meleeRush && h.meleeRush.until > this.time ? h.meleeRush.mult : 1; // 근접 처치 기세 (자신만)
      h.cd -= dt * speedMult * rush; h.skillCd -= dt;

      let target = this.#byId(monsters, h.targetId);
      if (!target || !target.alive) { target = this.#pickMonsterTarget(h, monsters); h.targetId = target?.id ?? null; }

      if (h.role === 'healer') {
        const low = heroes.filter((a) => a.hp < a.maxHp * 0.6).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (low && h.cd <= 0) {
          const amt = Math.round(h.atk * 2.5);
          low.hp = Math.min(low.maxHp, low.hp + amt);
          this.projectiles.push({ x: h.x, y: h.y - 10, tx: low.x, ty: low.y - 10, t: 0, dur: 0.3, color: '#2ecc71', kind: 'heal' });
          this.floaters.push({ x: low.x, y: low.y - 40, text: `+${amt}`, color: '#27ae60', t: 0 });
          this.fx('sparkle', { x: low.x, y: low.y, color: '#2ecc71', n: 5 });
          h.cd = h.interval; h.anim = 'attack'; h.animT = 0;
          continue;
        }
      }
      if (!target) { if (h.anim !== 'attack') h.anim = 'idle'; continue; }
      if (h.skillUnlocked && h.skillCd <= 0 && this.castLock <= 0) { // 순서대로: 앞 스킬 연출이 끝난 뒤에 다음 스킬
        const type = h.skill.type;
        const worth = type === 'heal' ? heroes.some((a) => a.hp < a.maxHp * 0.75)
          : type === 'buff' || type === 'haste' ? (monsters.length >= 2 || !!this.boss)
          : type === 'barrier' ? (this.barrier.hp <= 0 && (heroes.some((a) => a.hp < a.maxHp * 0.9) || monsters.length >= 3 || !!this.boss))
          : type === 'strike' || type === 'execute' ? true : monsters.some((m) => m.arrived) || !!this.boss;
        if (worth) {
          const skillTarget = type === 'strike' ? (monsters.find((m) => m.isBoss) ?? monsters.filter((m) => m.elite)[0] ?? monsters.slice().sort((a, b) => b.hp - a.hp)[0] ?? target)
            : type === 'execute' ? (monsters.find((m) => m.isBoss && m.hp < m.maxHp * 0.3) ?? monsters.filter((m) => m.alive && m.hp < m.maxHp * 0.3).sort((a, b) => b.maxHp - a.maxHp)[0] ?? monsters.find((m) => m.isBoss) ?? monsters.filter((m) => m.elite)[0] ?? target) : target;
          this.castSkill(h, skillTarget, monsters, heroes); h.skillCd = (SKILLS[type]?.cooldown ?? h.skill.cooldown ?? 10) * (1 - (this.perks?.cooldown ?? 0)) * (h.skillCdMult ?? 1);
        } else h.skillCd = 0.5; // re-check soon instead of wasting the cast
      }

      const dist = target.x - h.x;
      const canReach = dist <= h.range && (target.arrived || h.role === 'ranged' || h.role === 'healer' || dist < 110);
      if (canReach && h.cd <= 0) {
        h.cd = h.interval; h.anim = 'attack'; h.animT = 0;
        if (h.role === 'ranged' || h.role === 'healer') {
          // projectile; damage lands on arrival
          const snapshot = monsters;
          this.projectiles.push({ x: h.x + 18, y: h.y - 14, tx: target.x, ty: target.y - 6, t: 0, dur: 0.28, color: h.def.palette.W, kind: HERO_SHOT[h.def.id] ?? 'shot', onHit: () => { if (target.alive) this.#heroHit(h, target, 1, false, snapshot); } });
          this.fx('muzzle', { x: h.x + 26, y: h.y - 14, color: h.def.palette.W, life: 0.12 });
        } else {
          // melee dash: strike lands slightly after the wind-up
          h.dashTo = target.x - 38;
          const snapshot = monsters;
          this.projectiles.push({ x: h.x, y: h.y, tx: h.x, ty: h.y, t: 0, dur: 0.16, kind: 'none', onHit: () => { if (target.alive) { this.fx('slash', { x: target.x, y: target.y - 6, color: GRADES[h.def.grade]?.color ?? '#ffffff', angle: Math.random() * 0.8 - 0.4, life: 0.18, big: h.awakened }); this.#heroHit(h, target, 1, false, snapshot); } } });
        }
      }
      if (h.anim === 'attack' && h.animT > 0.45) h.anim = 'idle';
    }

    // --- monsters -------------------------------------------------------
    const frontX = this.#frontX();
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.animT += dt; m.spawnT += dt; m.shake = Math.max(0, m.shake - dt * 8); m.flash = Math.max(0, m.flash - dt);
      if (m.def.affix?.regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * m.def.affix.regen * dt);
      if (m.burnT > 0) { m.burnT -= dt; m.burnTick = (m.burnTick ?? 0) - dt; if (m.burnTick <= 0) { m.burnTick = 0.5; this.#damage(m, m.burnDps * 0.5, true); if (!m.alive) continue; } } // #damage already reports the kill
      if (m.lunge > 0) m.lunge -= dt;
      if (m.stun > 0) { m.stun -= dt; continue; }
      const stopX = frontX + m.standoff;
      if (m.x > stopX + 2) { m.x = Math.max(stopX, m.x - m.speed * dt); m.anim = 'walk'; continue; }
      if (!m.arrived && m.isBoss) { m.say = { text: bossLine(m.def.id, Math.random()), t: 3.0 }; this.shake = Math.max(this.shake, 6); }
      m.arrived = true; m.anim = 'idle'; m.cd -= dt;
      if (m.def.chest && !m.def.mimic) continue;   // treasure chests just sit there
      if (m.cd > 0) continue;
      if (m.def.mimic) m.openFrame = 2;              // the mimic shows its teeth once it starts biting
      m.cd = m.interval; m.lunge = 0.2; m.hits++;
      if (m.isBoss) {
        const warn = (m.def.specials ?? []).some((sp) => (m.hits + 1) % sp.every === 0); // telegraph one attack ahead
        if (warn && !m.warn) this.game.openBraceFormula(); // 예고가 새로 뜬 순간에만 수식을 낸다
        m.warn = warn;
      }
      if (m.isBoss && this.#bossPattern(m, heroes, frontX)) continue;
      if (m.proj || (m.isBoss && m.def.pattern === 'fire' && Math.random() < 0.35)) {
        // ranged monsters shoot a random party member so damage spreads across the line
        const target = heroes[Math.floor(Math.random() * heroes.length)]; if (!target) continue;
        this.projectiles.push({ x: m.x - 20, y: m.y - 16, tx: target.x, ty: target.y - 8, t: 0, dur: 0.5, color: m.def.palette?.M ?? '#e74c3c', kind: m.proj ?? 'drop', hostile: true, targetId: target.id, dmg: m.atk });
      } else {
        // melee monsters hit the front of the line
        const target = heroes.slice().sort((a, b) => b.x - a.x)[0]; if (!target) continue;
        this.#monsterHit(m, target);
      }
    }

    if (this.heroes.length && this.heroes.every((h) => !h.alive)) { this.game.onPartyWiped(); return; }

    // --- projectiles / particles / effects / floaters
    for (const p of this.projectiles) {
      p.t += dt;
      if (!p.hit && p.t >= p.dur) {
        p.hit = true;
        if (p.hostile) {
          const tgt = this.heroes.find((h) => h.id === p.targetId);
          const taunting = this.taunt && this.taunt.until >= this.time ? this.heroes.find((a) => a.id === this.taunt.heroId && a.alive) : null;
          const hit = taunting ?? tgt;
          if (hit?.alive) { this.#splitToTank(hit, p.dmg * (taunting ? 1 - this.taunt.reduce : 1) * (hit.trait === 'sturdy' ? 1 - tv(hit, 'sturdy') : 1), false); this.fx('puff', { x: hit.x, y: hit.y - 10, color: p.color, life: 0.25 }); }
        } else if (p.onHit) p.onHit();
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.t < p.dur);
    for (const p of this.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.gravity ?? 220) * dt; }
    this.particles = this.particles.filter((p) => p.t < p.life);
    for (const f of this.effects) f.t += dt;
    this.effects = this.effects.filter((f) => f.t < f.life);
    for (const f of this.floaters) f.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < 1.0);
    if (this.floaters.length > 40) this.floaters.splice(0, this.floaters.length - 40);
    this.monsters = this.monsters.filter((m) => m.alive || (m.deadT += dt) < 0.3);
    const cutoff = this.time - 5;
    while (this.dmgLog.length && this.dmgLog[0][0] < cutoff) this.dmgLog.shift();
  }

  dps() { return this.dmgLog.reduce((a, [, d]) => a + d, 0) / 5; }

  // -------------------------------------------------------------- helpers --
  #byId(list, id) { return id == null ? null : list.find((e) => e.id === id) ?? null; }
  /**
   * Targeting: melee/tank take the nearest monster (they have to dash to it); ranged/healer focus the boss,
   * then elites, then whichever monster is closest to dying so kills land faster and less damage comes in.
   */
  #pickMonsterTarget(h, monsters) {
    const inField = monsters.filter((m) => m.x < CANVAS_W + 20);
    if (!inField.length) return null;
    if (h.role === 'melee' || h.role === 'tank') return inField.sort((a, b) => (b.arrived ? 1 : 0) - (a.arrived ? 1 : 0) || a.x - b.x)[0];
    const boss = inField.find((m) => m.isBoss); if (boss) return boss;
    const elite = inField.filter((m) => m.elite); if (elite.length) return elite.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    return inField.sort((a, b) => (a.hp + (a.shield ?? 0)) / a.maxHp - (b.hp + (b.shield ?? 0)) / b.maxHp || a.x - b.x)[0];
  }

  /** ★ 보너스 단계 (0~4). 모든 스킬의 2차 효과가 이 값에 비례한다 — 규칙이 하나여야 읽을 수 있다. */
  #starStep(h) { return Math.max(0, (h?.star ?? 1) - 1); }
  /** 지속형 스킬의 실제 지속 시간: 기본 + ★당 보너스. */
  #dur(h, base) { return base + BALANCE.SKILL_STAR.duration * this.#starStep(h); }

  /** 수식 대응 성공 — 다음 특수 공격 한 번이 약해진다. */
  markBraced() {
    this.braced = true;
    for (const h of this.heroes) if (h.alive) this.fx('puff', { x: h.x, y: h.y - 20, color: '#1f5fa8', life: 0.3 });
  }

  /** 테스트 전용 통로: 보스 특수 공격을 그 자리에서 한 번 실행한다(비공개 메서드라 밖에서 못 부른다). */
  __testPattern(m, heroes, frontX) { return this.#bossPattern(m, heroes, frontX); }

  /** Boss specials (data: BOSSES[].specials). Every Nth attack; when two coincide the rarer one fires. Returns true when one fired. */
  #bossPattern(m, heroes, frontX) {
    const sp = (m.def.specials ?? []).filter((x) => m.hits % x.every === 0).sort((a, b) => b.every - a.every)[0];
    if (!sp) return false;
    this.floaters.push({ x: m.x, y: m.y - 110, text: sp.name, color: m.def.palette?.M ?? '#e74c3c', t: 0, big: true });
    this.game.emit('boss-special', { boss: m, special: sp });
    // 수식 대응: 예고 때 답을 쳐 넣었다면 이 한 방만 크게 줄어든다. 안 쳤으면 k = 1 — 예전과 똑같다.
    const braced = this.braced;
    const k = braced ? 1 - BALANCE.BRACE.reduce : 1;
    if (braced) {
      this.braced = false; // 한 번 막으면 소진된다
      this.fx('ring', { x: frontX - 40, y: GROUND_Y - 20, color: '#1f5fa8', radius: 320, life: 0.45 });
      for (const t of heroes) this.floaters.push({ x: t.x, y: t.y - 78, text: '검산 완료', color: '#1f5fa8', t: 0 });
      this.game.emit('sfx', 'block');
    }
    if (sp.kind === 'sweep') {
      const front = heroes.slice().sort((a, b) => b.x - a.x).slice(0, 2);
      this.fx('slash', { x: frontX - 20, y: GROUND_Y - 14, color: '#e74c3c', angle: 0.25, life: 0.3, big: true }); this.shake = Math.max(this.shake, 8);
      for (const t of front) this.#monsterHit(m, t, 0.9 * k);
    } else if (sp.kind === 'stomp') {
      this.fx('ring', { x: m.x, y: m.y, color: '#e67e22', radius: 520, life: 0.5 }); this.shake = Math.max(this.shake, 12);
      for (const t of heroes) { this.#monsterHit(m, t, 0.5 * k); this.fx('puff', { x: t.x, y: t.y, color: '#e67e22', life: 0.3 }); }
    } else if (sp.kind === 'volley') {
      // three fireballs at three different heroes (fewer when the party is smaller)
      const targets = heroes.slice().sort(() => Math.random() - 0.5).slice(0, 3);
      targets.forEach((t, i) => this.projectiles.push({ x: m.x - 20, y: m.y - 40 - i * 10, tx: t.x, ty: t.y - 8, t: -i * 0.12, dur: 0.55, color: '#ff7043', kind: 'drop', hostile: true, targetId: t.id, dmg: m.atk * 0.6 * k }));
      this.shake = Math.max(this.shake, 6);
    } else if (sp.kind === 'slow') {
      this.slow = { mult: 0.7, until: this.time + 4 * k }; // 둔화는 피해가 아니라 시간이라 지속이 줄어든다
      this.fx('ring', { x: m.x, y: m.y, color: '#27ae60', radius: 560, life: 0.6 });
      for (const t of heroes) { this.fx('puff', { x: t.x, y: t.y - 20, color: '#27ae60', life: 0.35 }); this.floaters.push({ x: t.x, y: t.y - 70, text: '느려짐', color: '#27ae60', t: 0 }); }
    } else if (sp.kind === 'throw') {
      const back = heroes.slice().sort((a, b) => a.x - b.x)[0]; if (!back) return true;
      this.projectiles.push({ x: m.x - 30, y: m.y - 70, tx: back.x, ty: back.y - 8, t: 0, dur: 0.7, color: '#935116', kind: 'drop', hostile: true, targetId: back.id, dmg: m.atk * 1.4 * k, crate: true });
      this.shake = Math.max(this.shake, 6);
    }
    return true;
  }

  /**
   * 앞선 탱커가 이 타격을 가로챌 확률과 감면율. 탱커 본인이거나 탱커가 없으면 null.
   * 매번 나눠 받는 게 아니라 **막거나 못 막거나**다 — 확률과 감면 모두 ★로 오른다.
   */
  #tankGuard(target) {
    if (!target || target.role === 'tank') return null;
    const T = BALANCE.TANK;
    const tank = this.heroes.filter((h) => h.alive && h.role === 'tank' && h !== target).sort((a, b) => b.x - a.x)[0];
    if (!tank) return null;
    const star = Math.max(1, tank.star ?? 1);
    return {
      tank,
      chance: Math.min(T.chanceMax, T.chance + T.chancePerStar * (star - 1)),
      reduce: Math.min(T.reduceMax, T.reduce + T.reducePerStar * (star - 1)),
    };
  }
  /** 확률로 탱커가 가로챈다. 터지면 아군은 하나도 안 맞고, 탱커가 감면된 채로 전부 받는다. */
  #splitToTank(target, dmg, crit) {
    const g = this.#tankGuard(target);
    if (!g || Math.random() >= g.chance) { this.#damage(target, dmg, crit); return; }
    this.#damage(g.tank, dmg * (1 - g.reduce), false);
    this.fx('puff', { x: g.tank.x, y: g.tank.y - 14, color: '#5dade2', life: 0.25 });
    this.floaters.push({ x: g.tank.x, y: g.tank.y - 62, text: '엄호', color: '#5dade2', t: 0 });
  }
  /** 테스트 전용 통로: 몬스터 한 대를 그 자리에서 때린다(비공개 메서드라 밖에서 못 부른다). */
  __testHit(m, target, mult = 1) { return this.#monsterHit(m, target, mult); }

  #monsterHit(m, target, mult = 1) {
    // 도발: while it is up, the taunting hero takes the hit instead — and takes less of it
    const t = this.taunt && this.taunt.until >= this.time ? this.heroes.find((a) => a.id === this.taunt.heroId && a.alive) : null;
    if (t) { target = t; mult *= 1 - this.taunt.reduce; }
    this.#splitToTank(target, m.atk * mult * (target.trait === 'sturdy' ? 1 - tv(target, 'sturdy') : 1), false);
    this.fx('puff', { x: target.x + 10, y: target.y - 12, color: '#e74c3c', life: 0.22 });
    if (m.isBoss) this.shake = Math.max(this.shake, 5);
  }

  /** 테스트 전용 통로: 영웅의 기본 공격 한 대를 그 자리에서 처리한다(비공개 메서드라 밖에서 못 부른다). */
  __testHeroHit(h, target) { return this.#heroHit(h, target, 1, false, this.monsters); }

  #heroHit(h, target, mult, isSkill, monsters) {
    let dmg = h.atk * mult * this.atkBuff.mult * this.rallyMult * (1 + Math.min(BALANCE.COMBO.max, this.combo * BALANCE.COMBO.perHit));
    let crit = false;
    const critChance = (h.trait === 'crit' ? tv(h, 'crit') : 0) + (this.perks?.crit ?? 0);
    if (critChance > 0 && Math.random() < critChance) { dmg *= 2; crit = true; }
    if (target.isBoss) dmg *= 1 + (h.trait === 'focus' ? tv(h, 'focus') : 0) + (this.perks?.boss ?? 0);
    if (crit) this.fx('crit', { x: target.x, y: target.y - 30, color: '#f1c40f', life: 0.35 });
    const dealt = this.#damage(target, dmg, isSkill || crit, crit);
    if (dealt > 0) { this.combo++; this.comboT = BALANCE.COMBO.decay; this.game.onCombo?.(this.combo); }
    if (h.trait === 'lifesteal' && dealt > 0) h.hp = Math.min(h.maxHp, h.hp + dealt * tv(h, 'lifesteal'));
    if (h.trait === 'splash' && !isSkill && monsters) {
      for (const m of monsters) if (m !== target && m.alive && Math.abs(m.x - target.x) < 90) this.#damage(m, dmg * tv(h, 'splash'), false);
    }
    this.#rolePassiveOnHit(h, target, isSkill, dealt > 0 && !target.alive);
    return dealt;
  }

  /**
   * 역할 상시 효과 중 '때릴 때' 도는 둘. **기본 공격에서만** 돈다 — 스킬까지 얹으면 역할이 아니라 배수가 된다.
   *  · 원거리: 확률로 뒤쪽 적까지 관통 (뒤에서 쏘는 역할다운 보상)
   *  · 근접: 처치하면 잠시 자신의 공격이 빨라진다 (앞에서 계속 미는 역할다운 보상)
   */
  #rolePassiveOnHit(h, target, isSkill, killed) {
    const P = BALANCE.ROLE_PASSIVE, step = Math.max(0, (h.star ?? 1) - 1);
    if (!isSkill && h.role === 'ranged' && Math.random() < P.ranged.pierce + P.ranged.perStar * step) {
      const behind = this.monsters.filter((m) => m.alive && m !== target && m.x > target.x).sort((a, b) => a.x - b.x)[0];
      if (behind) {
        this.#damage(behind, h.atk * this.atkBuff.mult * this.rallyMult * P.ranged.dmg, false);
        this.fx('slash', { x: behind.x, y: behind.y - 6, color: '#5dade2', angle: 0, life: 0.2 });
      }
    }
    if (killed && h.role === 'melee') {
      h.meleeRush = { mult: 1 + P.melee.haste + P.melee.perStar * step, until: this.time + P.melee.dur };
      this.floaters.push({ x: h.x, y: h.y - 70, text: '기세', color: '#e67e22', t: 0 });
    }
  }

  #damage(target, amount, isSkill, crit = false) {
    if (!target.alive) return 0;
    amount = Math.max(1, Math.round(amount));
    if (target.shield > 0) { // elite 보호막 soaks damage first
      const absorbed = Math.min(target.shield, amount); target.shield -= absorbed; amount -= absorbed; target.flash = 0.1;
      this.floaters.push({ x: target.x, y: target.y - 50, text: absorbed ? `보호막 -${absorbed}` : '', color: '#74b9ff', t: 0 });
      if (amount <= 0) { this.game.emit('sfx', 'hit'); return 0; }
    }
    if (target.kind === 'hero' && this.barrier.hp > 0 && this.barrier.until > this.time) { // 파티 보호막 (barrier skill)
      const absorbed = Math.min(this.barrier.hp, amount); this.barrier.hp -= absorbed; amount -= absorbed;
      this.fx('ring', { x: target.x, y: target.y + 10, color: '#5dade2', radius: 30, life: 0.25 });
      if (amount <= 0) { this.game.emit('sfx', 'hit'); return 0; }
    }
    this.game.emit('sfx', target.kind === 'monster' ? 'hit' : 'hurt');
    if (target.kind === 'monster') this.fx('impact', { x: target.x + (Math.random() * 16 - 8), y: target.y - 24 + (Math.random() * 16 - 8), color: crit ? '#f1c40f' : '#ffffff', life: 0.18, big: isSkill || crit });
    else if (this.combo > 0) { this.floaters.push({ x: target.x, y: target.y - 70, text: `COMBO ×${this.combo} 끊김`, color: '#95a5a6', t: 0 }); this.combo = 0; }
    const dealt = Math.min(amount, target.hp);
    target.hp -= amount; target.shake = 1; target.flash = 0.12;
    const color = target.kind === 'monster' ? (crit ? '#ff7675' : isSkill ? '#f1c40f' : '#ffffff') : '#e74c3c';
    this.floaters.push({ x: target.x + (Math.random() * 24 - 12), y: target.y - 44, text: crit ? `${amount}!` : String(amount), color, t: 0, big: isSkill || crit });
    if (target.kind === 'monster') this.dmgLog.push([this.time, dealt]);
    if (target.hp <= 0) {
      target.hp = 0; target.alive = false;
      if (target.kind === 'monster') {
        target.deadT = 0;
        const col = target.def.palette?.M ?? '#e74c3c';
        for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 90; this.particles.push({ x: target.x, y: target.y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, life: 0.5 + Math.random() * 0.3, color: Math.random() < 0.3 ? '#ffffff' : col, size: 3 + Math.random() * 3 }); }
        if (target.isBoss) { this.shake = 14; this.fx('ring', { x: target.x, y: target.y, color: '#ffffff', radius: 140, life: 0.7 }); }
        if (target.def.affix?.explode) { // 폭발: hits the front-most living hero
          const front = this.heroes.filter((h) => h.alive).sort((a, b) => b.x - a.x)[0];
          this.fx('ring', { x: target.x, y: target.y, color: '#e67e22', radius: 90, life: 0.4 }); this.shake = Math.max(this.shake, 6);
          if (front) { this.floaters.push({ x: target.x, y: target.y - 70, text: '폭발!', color: '#e67e22', t: 0, big: true }); this.#damage(front, target.atk * target.def.affix.explode * (front.trait === 'sturdy' ? 1 - tv(front, 'sturdy') : 1), false); }
        }
        if (target.def.chest) { target.openFrame = 2; target.deadT = -0.6; this.fx('sparkle', { x: target.x, y: target.y - 20, color: '#f9e79f', n: 14 }); this.game.emit('sfx', 'chest'); }
        else this.game.emit('sfx', 'kill');
        this.game.onMonsterKilled(target);
      } else {
        target.reviveT = 0;
        this.fx('puff', { x: target.x, y: target.y, color: '#95a5a6', life: 0.4 });
        const left = this.heroes.filter((h) => h.alive).length;
        this.game.log(`${target.def.name} 쓰러짐 (남은 인원 ${left}명 — 부활 스킬로만 복귀)`, 'warn');
      }
    }
    return dealt;
  }

  coinBurst(x, y, gold) {
    this.floaters.push({ x, y: y - 56, text: `+${gold}g`, color: '#f7d774', t: 0 });
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 90 + Math.random() * 60; this.particles.push({ x, y: y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.55, color: i % 2 ? '#f1c40f' : '#f9e79f', size: 4, gravity: 260 }); }
  }

  castSkill(h, target, monsters, heroes) {
    const { type, power } = h.skill; const boost = h.skillPower;
    switch (type) {
      case 'burn': { // 화상: every enemy takes ATK × p per second for SKILLS.burn.duration s (stacks by refreshing, not adding)
        const dps = h.atk * power * boost * this.atkBuff.mult * this.rallyMult;
        for (const m of monsters) { if (!m.alive) continue; m.burnDps = Math.max(m.burnDps ?? 0, dps); m.burnT = this.#dur(h, SKILLS.burn.duration); m.burnTick = 0.25; this.fx('flame', { x: m.x, y: m.y - 20, life: 0.6 }); }
        this.fx('papers', { x: h.x + 30, y: h.y - 20, n: 6, spread: 300, life: 0.6 }); this.shake = Math.max(this.shake, 4); break;
      }
      case 'barrier': { // 보호막: one shared pool for the party
        const hp = Math.round(h.atk * power * boost);
        this.barrier = { hp, max: hp, until: this.time + this.#dur(h, SKILLS.barrier.duration) };
        for (const a of heroes) this.fx('ring', { x: a.x, y: a.y + 16, color: '#5dade2', radius: 46, life: 0.6 });
        this.floaters.push({ x: h.x, y: h.y - 76, text: `보호막 ${hp}`, color: '#5dade2', t: 0 }); break;
      }
      case 'haste': {
        this.hasteBuff = { mult: Math.max(this.hasteBuff.mult, 1 + (power * boost) / 100), until: this.time + this.#dur(h, SKILLS.haste.duration) };
        for (const a of heroes) this.fx('dash', { x: a.x, y: a.y - 10, life: 0.5 }); break;
      }
      case 'execute': {
        const low = target.hp < target.maxHp * (0.3 + BALANCE.SKILL_STAR.execThreshold * this.#starStep(h)); // 처형 기준이 ★로 넓어진다
        this.fx('slash', { x: target.x, y: target.y - 6, color: low ? '#e74c3c' : '#f1c40f', angle: -1.1, life: 0.25, big: true });
        this.fx('stamp', { x: target.x, y: target.y - 30, life: 0.7, text: low ? '최종' : '검토', color: low ? '#c0392b' : '#7f8c8d' });
        this.shake = Math.max(this.shake, low ? 8 : 4); this.#heroHit(h, target, power * boost * (low ? 2 : 1), true); break;
      }
      case 'strike': {
        this.fx('slash', { x: target.x, y: target.y - 6, color: '#f1c40f', angle: -0.3, life: 0.25, big: true });
        this.fx('stamp', { x: target.x, y: target.y - 30, life: 0.7, text: '결재' }); this.shake = Math.max(this.shake, 4);
        this.#heroHit(h, target, power * boost, true);
        // ★ 확률로 한 번 더 — 같은 강타라도 ★5의 것은 자주 두 번 떨어진다
        if (target.alive && Math.random() < BALANCE.SKILL_STAR.extraHit * this.#starStep(h)) {
          this.fx('slash', { x: target.x, y: target.y - 10, color: '#f39c12', angle: 0.4, life: 0.22, big: true });
          this.floaters.push({ x: target.x, y: target.y - 80, text: '재결재!', color: '#f39c12', t: 0 });
          this.#heroHit(h, target, power * boost, true);
        }
        break;
      }
      case 'sweep':
        this.fx('ring', { x: h.x, y: h.y, color: '#f1c40f', radius: 420, life: 0.45 }); this.shake = Math.max(this.shake, 6);
        this.fx('papers', { x: h.x + 40, y: h.y - 30, n: 14, spread: 420, life: 0.9 });
        { const again = BALANCE.SKILL_STAR.extraHit * this.#starStep(h); // 적마다 따로 굴린다 — ★이 높으면 한 번에 여럿이 두 번 맞는다
          for (const m of monsters) {
            this.fx('slash', { x: m.x, y: m.y - 6, color: '#f1c40f', angle: 0.4, life: 0.25 });
            this.#heroHit(h, m, power * boost, true);
            if (m.alive && Math.random() < again) { this.fx('slash', { x: m.x, y: m.y - 12, color: '#f39c12', angle: -0.3, life: 0.2 }); this.#heroHit(h, m, power * boost, true); }
          } }
        break;
      case 'ult':
        this.game.emit('ult', { hero: h }); this.flashT = 0.18;
        this.fx('ring', { x: h.x, y: h.y, color: '#8e44ad', radius: 460, life: 0.6 }); this.shake = Math.max(this.shake, 10);
        { const xs = monsters.map((m) => m.x); const x0 = xs.length ? Math.min(...xs) - 40 : h.x + 60, x1 = xs.length ? Math.max(...xs) + 40 : h.x + 400; this.fx('grid', { x: x0, y: h.y - 70, w: Math.max(120, x1 - x0), h: 96, life: 0.9, color: '#8e44ad' }); }
        for (const m of monsters) this.fx('stamp', { x: m.x, y: m.y - 34, life: 0.8, text: '반려', color: '#8e44ad' });
        for (const m of monsters) { this.fx('slash', { x: m.x, y: m.y - 6, color: '#c39bd3', angle: -0.6, life: 0.3, big: true }); this.#heroHit(h, m, power * boost, true); if (m.alive) { const st = 2 + BALANCE.SKILL_STAR.stun * this.#starStep(h); m.stun = Math.max(m.stun, st); this.fx('stars', { x: m.x, y: m.y - 44, color: '#f1c40f', life: st }); } }
        break;
      case 'buff':
        this.atkBuff = { mult: Math.max(this.atkBuff.mult, 1 + (power * boost) / 100), until: this.time + this.#dur(h, 5) };
        for (const a of heroes) { this.fx('ring', { x: a.x, y: a.y + 20, color: '#f39c12', radius: 40, life: 0.5 }); this.fx('chart', { x: a.x, y: a.y - 46, life: 0.9 }); }
        break;
      case 'cleanse': { // 정화: heal, clear the boss slow, and a short burst of speed — the healer that undoes debuffs
        for (const a of heroes) {
          const amt = Math.round(a.maxHp * (power * boost) / 100);
          a.hp = Math.min(a.maxHp, a.hp + amt);
          this.floaters.push({ x: a.x, y: a.y - 40, text: `+${amt}`, color: '#27ae60', t: 0 });
          this.fx('sparkle', { x: a.x, y: a.y, color: '#a3e4d7', n: 8 });
        }
        if (this.slow.mult < 1) { this.slow = { mult: 1, until: 0 }; this.floaters.push({ x: h.x, y: h.y - 76, text: '둔화 해제', color: '#27ae60', t: 0 }); }
        this.hasteBuff = { mult: Math.max(this.hasteBuff.mult, 1.2), until: this.time + SKILLS.cleanse.duration };
        this.fx('ring', { x: h.x, y: h.y, color: '#a3e4d7', radius: 300, life: 0.5 });
        break;
      }
      case 'revive': { // 복직: 죽음이 영구해진 뒤로 유일한 복귀 수단이자 가장 값비싼 스킬
        // 확정 1명 + 추가 인원마다 확률 굴림. 확률은 시전자의 ★로 오르고, 추가 인원에는 상한이 있다.
        const R = BALANCE.REVIVE;
        const star = Math.max(1, h.star ?? 1);
        const extraChance = R.extraChance + R.extraPerStar * (star - 1);
        const fallen = this.heroes.filter((a) => !a.alive);
        if (fallen.length) {
          const raised = [];
          for (const down of fallen) {
            if (raised.length >= 1 + R.extraMax) break;              // 최대 인원
            if (raised.length >= 1 && Math.random() >= extraChance) continue; // 둘째부터는 확률
            down.alive = true; down.reviveT = 0; down.hp = Math.max(1, Math.round(down.maxHp * (power * boost) / 100));
            this.fx('ring', { x: down.x, y: down.y, color: '#f1c40f', radius: 120, life: 0.7 });
            this.fx('sparkle', { x: down.x, y: down.y - 20, color: '#ffe9a8', n: 16 });
            this.floaters.push({ x: down.x, y: down.y - 60, text: '복직!', color: '#f1c40f', t: 0, big: true });
            raised.push(down);
          }
          this.game.log(`${h.def.name}: ${raised.map((a) => a.def.name).join(', ')} 복직 처리 (${raised.length}명)`, 'skill');
        } else {
          const weak = heroes.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (weak) { const amt = Math.round(weak.maxHp * (power * boost) / 100); weak.hp = Math.min(weak.maxHp, weak.hp + amt); this.floaters.push({ x: weak.x, y: weak.y - 40, text: `+${amt}`, color: '#27ae60', t: 0 }); this.fx('sparkle', { x: weak.x, y: weak.y, color: '#ffe9a8', n: 10 }); }
        }
        break;
      }
      case 'drain': { // 회수: area damage that feeds the party back
        let dealt = 0;
        this.fx('ring', { x: h.x, y: h.y, color: '#8e44ad', radius: 400, life: 0.5 }); this.shake = Math.max(this.shake, 5);
        for (const m of monsters) { this.fx('slash', { x: m.x, y: m.y - 6, color: '#c39bd3', angle: 0.2, life: 0.25 }); dealt += this.#heroHit(h, m, power * boost, true) ?? 0; }
        const leech = 0.4 + BALANCE.SKILL_STAR.drainLeech * this.#starStep(h); // 흡혈 비율이 ★로 오른다
        const back = Math.round(dealt * leech / Math.max(1, heroes.length));
        if (back > 0) for (const a of heroes) { a.hp = Math.min(a.maxHp, a.hp + back); this.floaters.push({ x: a.x, y: a.y - 40, text: `+${back}`, color: '#27ae60', t: 0 }); }
        break;
      }
      case 'chain': { // 연쇄: up to three enemies, each link weaker — rewards a wide wave, not a boss
        const S = BALANCE.SKILL_STAR, step = this.#starStep(h);
        const links = 3 + Math.floor(S.chainPerStar * step);     // ★당 대상 +0.5명
        const falloff = 0.7 + S.chainFalloff * step;             // 감쇠도 ★로 완화된다
        const order = monsters.slice().sort((a, b) => a.x - b.x).slice(0, links);
        let mult = power * boost, prev = h;
        for (const m of order) {
          this.fx('slash', { x: m.x, y: m.y - 6, color: '#5dade2', angle: -0.5, life: 0.22 });
          this.fx('grid', { x: Math.min(prev.x, m.x) - 10, y: Math.min(prev.y, m.y) - 40, w: Math.abs(m.x - prev.x) + 20, h: 40, life: 0.35, color: '#5dade2' });
          this.#heroHit(h, m, mult, true); mult *= falloff; prev = m;
        }
        this.shake = Math.max(this.shake, 4);
        break;
      }
      case 'taunt': { // 도발: the tank eats everything for a while, and takes less while doing it
        this.taunt = { heroId: h.id, reduce: Math.min(0.8, (power * boost) / 100), until: this.time + this.#dur(h, SKILLS.taunt.duration) };
        this.fx('ring', { x: h.x, y: h.y, color: '#e67e22', radius: 260, life: 0.6 });
        this.floaters.push({ x: h.x, y: h.y - 76, text: '도발', color: '#e67e22', t: 0, big: true });
        for (const m of monsters) this.fx('stars', { x: m.x, y: m.y - 44, color: '#e67e22', n: 4 });
        break;
      }
      case 'heal': {
        // ★가 붙으면 넘친 회복량이 버려지지 않고 파티 보호막이 된다 — 풀피일 때도 쓸모가 생긴다
        const capPct = BALANCE.SKILL_STAR.healShield * this.#starStep(h);
        let spill = 0;
        for (const a of heroes) {
          const amt = Math.round(a.maxHp * (power * boost) / 100);
          const before = a.hp;
          a.hp = Math.min(a.maxHp, a.hp + amt);
          spill += amt - (a.hp - before);
          this.floaters.push({ x: a.x, y: a.y - 40, text: `+${a.hp - before}`, color: '#27ae60', t: 0 });
          this.fx('sparkle', { x: a.x, y: a.y, color: '#2ecc71', n: 8 }); this.fx('coffee', { x: a.x, y: a.y - 54, life: 1.0 });
        }
        if (capPct > 0 && spill > 0) {
          const cap = Math.round(h.maxHp * capPct * heroes.length);
          const hp = Math.min(spill, cap);
          if (hp > 0) {
            this.barrier = { hp: Math.max(this.barrier?.hp ?? 0, hp), max: Math.max(this.barrier?.max ?? 0, hp), until: this.time + this.#dur(h, 6) };
            this.floaters.push({ x: h.x, y: h.y - 76, text: `보호막 ${hp}`, color: '#5dade2', t: 0 });
          }
        }
        break;
      }
    }
    h.anim = 'attack'; h.animT = 0;
    this.castLock = type === 'ult' ? CAST_GAP_ULT : CAST_GAP;
    if (type !== 'ult') { if (!h.say) { const q = skillQuip(type, Math.random()); if (q) h.say = { text: q, t: 1.8 }; } this.game.emit('skill-cast', { hero: h, type }); }
    this.game.emit('sfx', type === 'ult' ? 'ult' : 'skill');
    this.floaters.push({ x: h.x, y: h.y - 58, text: h.skillName ?? type.toUpperCase(), color: '#8e44ad', t: 0, big: true });
    this.game.log(`${h.def.name}: ${h.skillName ?? type} 발동`, 'skill');
  }
}
