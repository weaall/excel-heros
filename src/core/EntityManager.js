// Side-view line combat: the party stands in one row on the left and never actually moves —
// between waves the dungeon scrolls under their feet while they run; monsters arrive from the
// right in waves and line up opposite. Melee heroes dash out and back to strike, ranged heroes
// and monsters fire projectiles that hit on arrival. Also owns projectiles, floaters, particles, effects.
import { BALANCE, monsterHP, monsterATK, bossHP, bossATK, isBossStage } from '../config/balance.js';
import { TRAITS, SKILLS } from '../data/heroes.js';
import { monsterForStage, bossForStage, eliteChance, asElite } from '../data/monsters.js';

export const GRID = Object.freeze({ cols: 13, rows: 8, cellW: 64, cellH: 52 });
export const CANVAS_W = GRID.cols * GRID.cellW;   // 832
export const CANVAS_H = GRID.rows * GRID.cellH;   // 416
export const GROUND_Y = 318;                        // baseline the party stands on
const FRONT_X = 400;                                // x of the front-most hero
const LINE_GAP = 60;                                // spacing between heroes in the line

const ROLE_PRIORITY = { tank: 0, melee: 1, healer: 2, ranged: 3 };
const T = (k) => TRAITS[k].value;
const RANGED_SHAPES = { sheet: 'paper', chart: 'bar', cursor: 'arrow', cloud: 'drop', hourglass: 'sand' };
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
    this.atkBuff = { mult: 1, until: 0 };
    this.time = 0; this.dmgLog = []; this.rallyMult = 1; this.shake = 0;
    this.scroll = 0;            // background scroll offset (px)
    this.traveling = false; this.travelT = 0;
    this.wave = 0;
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
    this.rallyMult = 1 + T('rally') * this.heroes.filter((h) => h.trait === 'rally').length;
    for (const e of this.heroes) {
      const v = this.game.heroView(e.heroId);
      const ratio = e.maxHp ? e.hp / e.maxHp : 1;
      e.atk = v.atk; e.maxHp = v.hp; e.hp = Math.min(e.maxHp, Math.max(1, Math.round(e.maxHp * ratio)));
      e.interval = v.interval / (e.trait === 'swift' ? 1 + T('swift') : 1);
      e.range = (e.role === 'tank' ? TANK_REACH : e.role === 'melee' ? MELEE_REACH : v.range) * GRID.cellW;
      e.star = v.entry.star; e.level = v.entry.level;
      e.skill = v.def.skill; e.skillUnlocked = v.skillUnlocked; e.skillPower = v.skillPower; e.skillName = v.skillName;
    }
  }

  levelUpFx(heroId) {
    const h = this.heroes.find((e) => e.heroId === heroId); if (!h) return;
    this.floaters.push({ x: h.x, y: h.y - 44, text: 'LEVEL UP', color: '#f1c40f', t: 0, big: true });
    this.fx('sparkle', { x: h.x, y: h.y, color: '#f1c40f', n: 10 });
  }
  fx(type, props) { this.effects.push({ type, t: 0, life: props.life ?? 0.4, ...props }); }

  // ---------------------------------------------------------------- stage --
  startStage() {
    this.monsters = []; this.projectiles = []; this.boss = null; this.bossTimer = 0; this.wave = 0;
    for (const h of this.heroes) { h.alive = true; h.hp = h.maxHp; h.reviveT = 0; h.x = h.homeX; h.y = h.homeY; h.targetId = null; h.anim = 'walk'; }
    this.traveling = true; this.travelT = TRAVEL_TIME * 0.6;
  }

  #frontX() { const alive = this.heroes.filter((h) => h.alive); return alive.length ? Math.max(...alive.map((h) => h.x)) : FRONT_X; }

  #spawnWave() {
    const stage = this.game.state.stage;
    this.wave++;
    if (this.game.bossActive()) {
      this.boss = this.#spawnMonster(stage, true, 0);
      this.bossTimer = BALANCE.BOSS_TIME_LIMIT; this.shake = 8;
      this.game.log(`보스 등장: ${this.boss.def.name} (${this.game.stageLabel()}) — ${this.boss.def.desc}`, 'boss');
      return;
    }
    const count = Math.min(BALANCE.MAX_MONSTERS, 3 + Math.floor(stage / 10));
    for (let i = 0; i < count; i++) this.#spawnMonster(stage, false, i);
  }

  #spawnMonster(stage, isBoss, index) {
    let def = isBoss ? bossForStage(stage) : monsterForStage(stage, Math.random());
    const elite = !isBoss && Math.random() < eliteChance(stage);
    if (elite) def = asElite(def);
    const proj = !isBoss ? (def.ranged ?? RANGED_SHAPES[def.shape]) : null;
    const range = (isBoss ? 1.5 : proj ? 3.6 + index * 0.3 : 0.9) * GRID.cellW;
    const e = {
      id: nextId++, kind: 'monster', def, isBoss, elite, proj,
      x: CANVAS_W + 60 + index * 58 + Math.random() * 20, y: GROUND_Y + (index % 2 ? 10 : -8) + (Math.random() * 8 - 4),
      hp: (isBoss ? bossHP(stage) * (def.hp ?? 1) : monsterHP(stage)) * (elite ? BALANCE.ELITE.hp : 1),
      atk: (isBoss ? bossATK(stage) * (def.atk ?? 1) : monsterATK(stage)) * (elite ? BALANCE.ELITE.atk : 1),
      interval: isBoss ? (def.interval ?? 2.0) : proj ? 1.9 : 1.5, cd: 0.9 + Math.random() * 0.6, hits: 0,
      range, standoff: range * 0.9 + (proj ? 0 : index * 34),
      speed: isBoss ? (def.speed ?? 40) : BALANCE.MONSTER_SPEED * (0.9 + Math.random() * 0.25) * (elite ? 0.9 : 1),
      alive: true, targetId: null, anim: 'walk', animT: Math.random(), stun: 0, shake: 0, lunge: 0, flash: 0, spawnT: 0,
      w: isBoss ? 96 : 64, h: isBoss ? 80 : 64,
    };
    e.hp = Math.floor(e.hp); e.atk = Math.floor(e.atk); e.maxHp = e.hp;
    this.monsters.push(e);
    if (elite) this.fx('ring', { x: Math.min(e.x, CANVAS_W - 40), y: e.y, color: '#f1c40f', radius: 40, life: 0.6 });
    return e;
  }

  // --------------------------------------------------------------- update --
  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    const heroes = this.heroes.filter((e) => e.alive), monsters = this.monsters.filter((e) => e.alive);
    if (this.atkBuff.until < this.time) this.atkBuff.mult = 1;
    const speedMult = this.game.speedMult();

    // --- travel between waves: scroll the dungeon, party runs in place
    if (!monsters.length && !this.boss) {
      if (!this.traveling) { this.traveling = true; this.travelT = TRAVEL_TIME; }
      this.travelT -= dt; this.scroll += SCROLL_SPEED * dt;
      for (const h of heroes) { h.anim = 'walk'; h.animT += dt; }
      if (this.travelT <= 0) { this.traveling = false; this.#spawnWave(); }
    } else if (this.traveling) { this.traveling = false; }
    if (this.boss) { this.bossTimer -= dt; if (this.bossTimer <= 0 && this.boss.alive) { this.game.onBossTimeout(); return; } }

    // --- heroes ---------------------------------------------------------
    for (const h of this.heroes) {
      h.shake = Math.max(0, h.shake - dt * 8); h.flash = Math.max(0, h.flash - dt);
      if (!h.alive) {
        h.reviveT -= dt;
        if (h.reviveT <= 0) { h.alive = true; h.hp = h.maxHp; this.fx('sparkle', { x: h.x, y: h.y, color: '#2ecc71', n: 8 }); this.game.log(`${h.def.name} 병가 복귀`, 'info'); }
        continue;
      }
      if (this.traveling) continue;
      h.animT += dt;
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (BALANCE.HERO_REGEN_PCT + (h.trait === 'regen' ? T('regen') : 0)) * dt);
      h.cd -= dt * speedMult; h.skillCd -= dt;

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
      if (h.skillUnlocked && h.skillCd <= 0) { this.#castSkill(h, target, monsters, heroes); h.skillCd = SKILLS[h.skill.type]?.cooldown ?? h.skill.cooldown ?? 10; }

      const dist = target.x - h.x;
      const canReach = dist <= h.range && (target.arrived || h.role === 'ranged' || h.role === 'healer' || dist < 110);
      if (canReach && h.cd <= 0) {
        h.cd = h.interval; h.anim = 'attack'; h.animT = 0;
        if (h.role === 'ranged' || h.role === 'healer') {
          // projectile; damage lands on arrival
          const snapshot = monsters;
          this.projectiles.push({ x: h.x + 18, y: h.y - 14, tx: target.x, ty: target.y - 6, t: 0, dur: 0.28, color: h.def.palette.W, kind: 'shot', onHit: () => { if (target.alive) this.#heroHit(h, target, 1, false, snapshot); } });
          this.fx('muzzle', { x: h.x + 26, y: h.y - 14, color: h.def.palette.W, life: 0.12 });
        } else {
          // melee dash: strike lands slightly after the wind-up
          h.dashTo = target.x - 38;
          const snapshot = monsters;
          this.projectiles.push({ x: h.x, y: h.y, tx: h.x, ty: h.y, t: 0, dur: 0.16, kind: 'none', onHit: () => { if (target.alive) { this.fx('slash', { x: target.x, y: target.y - 6, color: '#ffffff', angle: Math.random() * 0.8 - 0.4, life: 0.18 }); this.#heroHit(h, target, 1, false, snapshot); } } });
        }
      }
      if (h.anim === 'attack' && h.animT > 0.45) h.anim = 'idle';
    }

    // --- monsters -------------------------------------------------------
    const frontX = this.#frontX();
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.animT += dt; m.spawnT += dt; m.shake = Math.max(0, m.shake - dt * 8); m.flash = Math.max(0, m.flash - dt);
      if (m.lunge > 0) m.lunge -= dt;
      if (m.stun > 0) { m.stun -= dt; continue; }
      const stopX = frontX + m.standoff;
      if (m.x > stopX + 2) { m.x = Math.max(stopX, m.x - m.speed * dt); m.anim = 'walk'; continue; }
      m.arrived = true; m.anim = 'idle'; m.cd -= dt;
      if (m.cd > 0) continue;
      m.cd = m.interval; m.lunge = 0.2; m.hits++;
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
          if (tgt?.alive) { this.#damage(tgt, p.dmg * (tgt.trait === 'sturdy' ? 1 - T('sturdy') : 1), false); this.fx('puff', { x: tgt.x, y: tgt.y - 10, color: p.color, life: 0.25 }); }
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
  /** Heroes focus the nearest monster in the line (front of the enemy queue). */
  #pickMonsterTarget(h, monsters) {
    const inField = monsters.filter((m) => m.x < CANVAS_W + 20);
    return inField.sort((a, b) => a.x - b.x)[0] ?? null;
  }

  /** Boss special attacks by pattern. Returns true when a special fired this turn. */
  #bossPattern(m, heroes, frontX) {
    const p = m.def.pattern;
    if (p === 'sweep' && m.hits % 3 === 0) {
      const front = heroes.slice().sort((a, b) => b.x - a.x).slice(0, 2);
      this.fx('slash', { x: frontX - 20, y: GROUND_Y - 14, color: '#e74c3c', angle: 0.25, life: 0.3, big: true }); this.shake = Math.max(this.shake, 8);
      this.floaters.push({ x: m.x, y: m.y - 84, text: '야근 지시!', color: '#e74c3c', t: 0, big: true });
      for (const t of front) this.#monsterHit(m, t, 0.9);
      return true;
    }
    if (p === 'stomp' && m.hits % 4 === 0) {
      this.fx('ring', { x: m.x, y: m.y, color: '#e67e22', radius: 520, life: 0.5 }); this.shake = Math.max(this.shake, 12);
      this.floaters.push({ x: m.x, y: m.y - 84, text: '갑질 발구르기!', color: '#e67e22', t: 0, big: true });
      for (const t of heroes) { this.#monsterHit(m, t, 0.5); this.fx('puff', { x: t.x, y: t.y, color: '#e67e22', life: 0.3 }); }
      return true;
    }
    return false;
  }

  #monsterHit(m, target, mult = 1) {
    this.#damage(target, m.atk * mult * (target.trait === 'sturdy' ? 1 - T('sturdy') : 1), false);
    this.fx('puff', { x: target.x + 10, y: target.y - 12, color: '#e74c3c', life: 0.22 });
    if (m.isBoss) this.shake = Math.max(this.shake, 5);
  }

  #heroHit(h, target, mult, isSkill, monsters) {
    let dmg = h.atk * mult * this.atkBuff.mult * this.rallyMult;
    let crit = false;
    if (h.trait === 'crit' && Math.random() < T('crit')) { dmg *= 2; crit = true; }
    if (h.trait === 'focus' && target.isBoss) dmg *= 1 + T('focus');
    const dealt = this.#damage(target, dmg, isSkill || crit, crit);
    if (h.trait === 'lifesteal' && dealt > 0) h.hp = Math.min(h.maxHp, h.hp + dealt * T('lifesteal'));
    if (h.trait === 'splash' && !isSkill && monsters) {
      for (const m of monsters) if (m !== target && m.alive && Math.abs(m.x - target.x) < 90) this.#damage(m, dmg * T('splash'), false);
    }
    return dealt;
  }

  #damage(target, amount, isSkill, crit = false) {
    if (!target.alive) return 0;
    amount = Math.max(1, Math.round(amount));
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
        this.game.onMonsterKilled(target);
      } else {
        target.reviveT = BALANCE.HERO_REVIVE_SEC;
        this.fx('puff', { x: target.x, y: target.y, color: '#95a5a6', life: 0.4 });
        this.game.log(`${target.def.name} 쓰러짐 (${BALANCE.HERO_REVIVE_SEC}초 후 복귀)`, 'warn');
      }
    }
    return dealt;
  }

  coinBurst(x, y, gold) {
    this.floaters.push({ x, y: y - 56, text: `+${gold}g`, color: '#f7d774', t: 0 });
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 90 + Math.random() * 60; this.particles.push({ x, y: y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.55, color: i % 2 ? '#f1c40f' : '#f9e79f', size: 4, gravity: 260 }); }
  }

  #castSkill(h, target, monsters, heroes) {
    const { type, power } = h.skill; const boost = h.skillPower;
    switch (type) {
      case 'strike': this.fx('slash', { x: target.x, y: target.y - 6, color: '#f1c40f', angle: -0.3, life: 0.25, big: true }); this.shake = Math.max(this.shake, 4); this.#heroHit(h, target, power * boost, true); break;
      case 'sweep':
        this.fx('ring', { x: h.x, y: h.y, color: '#f1c40f', radius: 420, life: 0.45 }); this.shake = Math.max(this.shake, 6);
        for (const m of monsters) { this.fx('slash', { x: m.x, y: m.y - 6, color: '#f1c40f', angle: 0.4, life: 0.25 }); this.#heroHit(h, m, power * boost, true); }
        break;
      case 'ult':
        this.game.emit('ult', { hero: h });
        this.fx('ring', { x: h.x, y: h.y, color: '#8e44ad', radius: 460, life: 0.6 }); this.shake = Math.max(this.shake, 10);
        for (const m of monsters) { this.fx('slash', { x: m.x, y: m.y - 6, color: '#c39bd3', angle: -0.6, life: 0.3, big: true }); this.#heroHit(h, m, power * boost, true); if (m.alive) { m.stun = Math.max(m.stun, 2); this.fx('stars', { x: m.x, y: m.y - 44, color: '#f1c40f', life: 2 }); } }
        break;
      case 'buff':
        this.atkBuff = { mult: Math.max(this.atkBuff.mult, 1 + (power * boost) / 100), until: this.time + 5 };
        for (const a of heroes) this.fx('ring', { x: a.x, y: a.y + 20, color: '#f39c12', radius: 40, life: 0.5 });
        break;
      case 'heal':
        for (const a of heroes) {
          const amt = Math.round(a.maxHp * (power * boost) / 100);
          a.hp = Math.min(a.maxHp, a.hp + amt);
          this.floaters.push({ x: a.x, y: a.y - 40, text: `+${amt}`, color: '#27ae60', t: 0 });
          this.fx('sparkle', { x: a.x, y: a.y, color: '#2ecc71', n: 8 });
        }
        break;
    }
    h.anim = 'attack'; h.animT = 0;
    this.floaters.push({ x: h.x, y: h.y - 58, text: h.skillName ?? type.toUpperCase(), color: '#8e44ad', t: 0, big: true });
    this.game.log(`${h.def.name}: ${h.skillName ?? type} 발동`, 'skill');
  }
}
