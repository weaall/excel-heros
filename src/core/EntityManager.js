// Combat simulation: 5-hero formation vs. up to 5 monsters (or 1 boss) on an 832x416 office floor.
// Also owns the visual side-state the renderer consumes: projectiles, floaters, particles, effects.
import { BALANCE, monsterHP, monsterATK, bossHP, bossATK, isBossStage } from '../config/balance.js';
import { ROLES, TRAITS } from '../data/heroes.js';
import { monsterForStage, BOSS, eliteChance, asElite } from '../data/monsters.js';

export const GRID = Object.freeze({ cols: 13, rows: 8, cellW: 64, cellH: 52 });
export const CANVAS_W = GRID.cols * GRID.cellW;   // 832
export const CANVAS_H = GRID.rows * GRID.cellH;   // 416

const cx = (col) => col * GRID.cellW;
const cy = (row) => row * GRID.cellH;

const SLOTS = {
  front: [{ c: 4.6, r: 4.3 }],
  mid:   [{ c: 3.1, r: 2.7 }, { c: 3.1, r: 5.9 }],
  back:  [{ c: 1.6, r: 1.9 }, { c: 1.6, r: 6.7 }],
};
const ROLE_PRIORITY = { tank: 0, melee: 1, healer: 2, ranged: 3 };
const T = (k) => TRAITS[k].value;
/** Monster shapes that attack from range (throw things) instead of lunging. */
const RANGED_SHAPES = { sheet: { proj: 'paper', range: 4.2 }, chart: { proj: 'bar', range: 3.8 }, cursor: { proj: 'arrow', range: 4.5 }, cloud: { proj: 'drop', range: 4 }, hourglass: { proj: 'sand', range: 3.5 } };

let nextId = 1;

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.heroes = [];
    this.monsters = [];
    this.projectiles = [];
    this.floaters = [];
    this.particles = [];
    this.effects = [];
    this.spawnQueue = [];
    this.boss = null;
    this.bossTimer = 0;
    this.atkBuff = { mult: 1, until: 0 };
    this.time = 0;
    this.dmgLog = [];
    this.rallyMult = 1;
    this.shake = 0;
  }

  // ---------------------------------------------------------------- party --
  rebuildParty() {
    const s = this.game.state;
    const prev = new Map(this.heroes.map((h) => [h.heroId, h]));
    const defs = s.party.map((id) => { const d = this.game.heroDef(id); return d ? { ...d, heroId: id } : null; }).filter(Boolean)
      .sort((a, b) => ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role]);
    const used = new Set();
    this.heroes = defs.map((def) => {
      let slot = null;
      for (const group of ROLES[def.role].slot) {
        for (let i = 0; i < SLOTS[group].length; i++) {
          const key = `${group}${i}`;
          if (!used.has(key)) { used.add(key); slot = { ...SLOTS[group][i], group }; break; }
        }
        if (slot) break;
      }
      slot ??= { c: 1.6, r: 4.3, group: 'back' };
      const old = prev.get(def.heroId);
      const e = old ?? this.#makeHero(def);
      e.def = def; e.role = def.role; e.trait = def.trait;
      e.homeX = cx(slot.c); e.homeY = cy(slot.r); e.slot = slot.group;
      if (!old) { e.x = e.homeX; e.y = e.homeY; }
      return e;
    });
    this.refreshHeroStats();
  }

  #makeHero(def) {
    return {
      id: nextId++, kind: 'hero', heroId: def.heroId, def, role: def.role, trait: def.trait,
      x: 0, y: 0, homeX: 0, homeY: 0, hp: 1, maxHp: 1, atk: 1, interval: 1, cd: Math.random() * 0.5,
      range: 0, speed: BALANCE.HERO_SPEED, alive: true, reviveT: 0, targetId: null,
      anim: 'idle', animT: 0, skillCd: 2 + Math.random() * 3, star: 1, level: 1, shake: 0, flash: 0,
    };
  }

  refreshHeroStats() {
    this.rallyMult = 1 + T('rally') * this.heroes.filter((h) => h.trait === 'rally').length;
    for (const e of this.heroes) {
      const v = this.game.heroView(e.heroId);
      const ratio = e.maxHp ? e.hp / e.maxHp : 1;
      e.atk = v.atk; e.maxHp = v.hp; e.hp = Math.min(e.maxHp, Math.max(1, Math.round(e.maxHp * ratio)));
      e.interval = v.interval / (e.trait === 'swift' ? 1 + T('swift') : 1);
      e.range = v.range * GRID.cellW; e.star = v.entry.star; e.level = v.entry.level;
      e.skill = v.def.skill; e.skillUnlocked = v.skillUnlocked; e.skillPower = v.skillPower; e.skillName = v.skillName;
    }
  }

  /** Visual feedback for a level-up / promotion on a party member. */
  levelUpFx(heroId) {
    const h = this.heroes.find((e) => e.heroId === heroId); if (!h) return;
    this.floaters.push({ x: h.x, y: h.y - 44, text: 'LEVEL UP', color: '#f1c40f', t: 0, big: true });
    this.fx('sparkle', { x: h.x, y: h.y, color: '#f1c40f', n: 10 });
  }

  fx(type, props) { this.effects.push({ type, t: 0, life: props.life ?? 0.4, ...props }); }

  // ---------------------------------------------------------------- stage --
  startStage() {
    const stage = this.game.state.stage;
    this.monsters = []; this.projectiles = []; this.spawnQueue = []; this.boss = null; this.bossTimer = 0;
    for (const h of this.heroes) { h.alive = true; h.hp = h.maxHp; h.reviveT = 0; h.x = h.homeX; h.y = h.homeY; h.targetId = null; }
    if (this.game.bossActive()) {
      this.boss = this.#spawnMonster(stage, true);
      this.bossTimer = BALANCE.BOSS_TIME_LIMIT;
      this.shake = 8;
      this.game.log(`보스 등장: ${BOSS.name} (${this.game.stageLabel()})`, 'boss');
    } else {
      for (let i = 0; i < BALANCE.MAX_MONSTERS; i++) this.spawnQueue.push(0.2 + i * 0.4);
    }
  }

  #spawnMonster(stage, isBoss = false) {
    let def = isBoss ? BOSS : monsterForStage(stage, Math.random());
    const elite = !isBoss && Math.random() < eliteChance(stage);
    if (elite) def = asElite(def);
    const rangedInfo = !isBoss ? RANGED_SHAPES[def.shape] : null;
    const range = (isBoss ? 1.6 : rangedInfo ? rangedInfo.range : 1.0) * GRID.cellW;
    const a = isBoss ? 0 : (Math.random() * 2 - 1) * (Math.PI / (rangedInfo ? 5 : 3));
    const r = range * 0.85;
    const e = {
      id: nextId++, kind: 'monster', def, isBoss, elite, rangedInfo,
      x: cx(isBoss ? 11.8 : 12.6 + Math.random() * 0.8), y: cy(isBoss ? 4.3 : 1.6 + Math.random() * 5.6),
      hp: (isBoss ? bossHP(stage) : monsterHP(stage)) * (elite ? BALANCE.ELITE.hp : 1),
      atk: (isBoss ? bossATK(stage) : monsterATK(stage)) * (elite ? BALANCE.ELITE.atk : 1),
      interval: isBoss ? 2.0 : rangedInfo ? 1.8 : 1.5, cd: 0.8 + Math.random() * 0.6,
      range, speed: isBoss ? 34 : BALANCE.MONSTER_SPEED * (0.85 + Math.random() * 0.3) * (elite ? 0.9 : 1),
      alive: true, targetId: null, anim: 'walk', animT: Math.random(), stun: 0, shake: 0, lunge: 0, flash: 0, spawnT: 0,
      offX: Math.cos(a) * r, offY: Math.sin(a) * r,
      w: isBoss ? 96 : 64, h: isBoss ? 64 : 64,
    };
    e.hp = Math.floor(e.hp); e.atk = Math.floor(e.atk); e.maxHp = e.hp;
    this.monsters.push(e);
    if (elite) this.fx('ring', { x: e.x, y: e.y, color: '#f1c40f', radius: 40, life: 0.6 });
    return e;
  }

  // --------------------------------------------------------------- update --
  update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    const alive = (list) => list.filter((e) => e.alive);

    if (!this.boss) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        this.spawnQueue[i] -= dt;
        if (this.spawnQueue[i] <= 0) {
          this.spawnQueue.splice(i, 1);
          if (alive(this.monsters).length < BALANCE.MAX_MONSTERS) this.#spawnMonster(this.game.state.stage);
        }
      }
    } else {
      this.bossTimer -= dt;
      if (this.bossTimer <= 0 && this.boss.alive) { this.game.onBossTimeout(); return; }
    }

    const heroes = alive(this.heroes), monsters = alive(this.monsters);
    if (this.atkBuff.until < this.time) this.atkBuff.mult = 1;
    const speedMult = this.game.speedMult();

    // --- heroes ---------------------------------------------------------
    for (const h of this.heroes) {
      h.shake = Math.max(0, h.shake - dt * 8); h.flash = Math.max(0, h.flash - dt);
      if (!h.alive) {
        h.reviveT -= dt;
        if (h.reviveT <= 0) { h.alive = true; h.hp = h.maxHp; h.x = h.homeX; h.y = h.homeY; this.fx('sparkle', { x: h.x, y: h.y, color: '#2ecc71', n: 8 }); this.game.log(`${h.def.name} 병가 복귀`, 'info'); }
        continue;
      }
      h.animT += dt;
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (BALANCE.HERO_REGEN_PCT + (h.trait === 'regen' ? T('regen') : 0)) * dt);
      h.cd -= dt * speedMult; h.skillCd -= dt;

      const reachLimit = h.homeX + (h.role === 'tank' ? 1.5 : BALANCE.MELEE_ADVANCE_CELLS) * GRID.cellW + h.range + 24;
      const candidates = (h.role === 'melee' || h.role === 'tank') ? monsters.filter((m) => m.x <= reachLimit) : monsters;
      let target = this.#byId(candidates, h.targetId);
      if (!target || !target.alive) { target = this.#nearest(h, candidates); h.targetId = target?.id ?? null; }

      if (h.role === 'healer') {
        const low = heroes.filter((a) => a.hp < a.maxHp * 0.6).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (low && h.cd <= 0) {
          const amt = Math.round(h.atk * 2.5);
          low.hp = Math.min(low.maxHp, low.hp + amt);
          this.projectiles.push({ x: h.x, y: h.y, tx: low.x, ty: low.y, t: 0, dur: 0.3, color: '#2ecc71', kind: 'heal' });
          this.floaters.push({ x: low.x, y: low.y - 34, text: `+${amt}`, color: '#27ae60', t: 0 });
          this.fx('sparkle', { x: low.x, y: low.y, color: '#2ecc71', n: 5 });
          h.cd = h.interval; h.anim = 'attack'; h.animT = 0;
          this.#returnHome(h, dt);
          continue;
        }
      }

      if (!target) { this.#returnHome(h, dt); continue; }

      if (h.skillUnlocked && h.skillCd <= 0) { this.#castSkill(h, target, monsters, heroes); h.skillCd = h.skill.cooldown; }

      const dist = Math.hypot(target.x - h.x, target.y - h.y);
      if (dist <= h.range) {
        if (h.cd <= 0) {
          h.cd = h.interval; h.anim = 'attack'; h.animT = 0;
          if (h.role === 'ranged' || h.role === 'healer') {
            this.projectiles.push({ x: h.x + 20, y: h.y - 6, tx: target.x, ty: target.y, t: 0, dur: 0.22, color: h.def.palette.W, kind: 'shot' });
            this.fx('muzzle', { x: h.x + 26, y: h.y - 8, color: h.def.palette.W, life: 0.12 });
          } else this.fx('slash', { x: target.x, y: target.y, color: '#ffffff', angle: Math.random() * 0.8 - 0.4, life: 0.18 });
          this.#heroHit(h, target, 1, false, monsters);
        } else if (h.anim === 'walk') h.anim = 'idle';
      } else if (h.role === 'melee' || h.role === 'tank') {
        const dx = target.x - h.x, dy = target.y - h.y, d = Math.hypot(dx, dy) || 1;
        const stop = h.range * 0.8;
        this.#moveToward(h, target.x - (dx / d) * stop, target.y - (dy / d) * stop, dt);
      } else this.#returnHome(h, dt);
      if (h.anim === 'attack' && h.animT > 0.4) h.anim = 'idle';
    }

    // --- monsters -------------------------------------------------------
    for (const m of this.monsters) {
      if (!m.alive) continue;
      m.animT += dt; m.spawnT += dt; m.shake = Math.max(0, m.shake - dt * 8); m.flash = Math.max(0, m.flash - dt);
      if (m.lunge > 0) m.lunge -= dt;
      if (m.stun > 0) { m.stun -= dt; continue; }
      let target = this.#byId(heroes, m.targetId);
      if (!target || !target.alive) { target = this.#pickHeroTarget(m, heroes); m.targetId = target?.id ?? null; }
      if (!target) continue;
      const dist = Math.hypot(target.x - m.x, target.y - m.y);
      m.cd -= dt;
      if (dist <= m.range + 6) {
        m.anim = 'idle';
        if (m.cd <= 0) {
          m.cd = m.interval; m.lunge = 0.2;
          if (m.rangedInfo) {
            this.projectiles.push({ x: m.x - 20, y: m.y - 10, tx: target.x, ty: target.y, t: 0, dur: 0.45, color: m.def.palette.M, kind: m.rangedInfo.proj, hostile: true, targetId: target.id, dmg: m.atk });
          } else {
            this.#monsterHit(m, target);
          }
        }
      } else {
        m.anim = 'walk';
        this.#moveToward(m, target.x + m.offX, target.y + m.offY, dt);
      }
    }

    if (this.heroes.length && this.heroes.every((h) => !h.alive)) { this.game.onPartyWiped(); return; }

    // --- projectiles (hostile ones deal damage on arrival)
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.hostile && !p.hit && p.t >= p.dur) {
        p.hit = true;
        const tgt = this.heroes.find((h) => h.id === p.targetId);
        if (tgt?.alive) { this.#damage(tgt, p.dmg * (tgt.trait === 'sturdy' ? 1 - T('sturdy') : 1), false); this.fx('puff', { x: tgt.x, y: tgt.y, color: p.color, life: 0.25 }); }
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

  #nearest(from, list) {
    let best = null, bd = Infinity;
    for (const e of list) { const d = Math.hypot(e.x - from.x, e.y - from.y); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  #pickHeroTarget(m, heroes) {
    if (!heroes.length) return null;
    const tank = heroes.find((h) => h.role === 'tank');
    if (tank && Math.random() < 0.85) return tank;
    return heroes.slice().sort((a, b) => (b.x - Math.abs(b.y - m.y) * 0.5) - (a.x - Math.abs(a.y - m.y) * 0.5))[0];
  }

  #moveToward(e, tx, ty, dt) {
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    if (d < 2) return;
    const step = Math.min(d, e.speed * dt);
    e.x += (dx / d) * step; e.y += (dy / d) * step;
    if (e.kind === 'hero') e.anim = 'walk';
  }

  #returnHome(e, dt) {
    if (Math.hypot(e.homeX - e.x, e.homeY - e.y) > 2) this.#moveToward(e, e.homeX, e.homeY, dt);
    else if (e.anim === 'walk') e.anim = 'idle';
  }

  #monsterHit(m, target) {
    this.#damage(target, m.atk * (target.trait === 'sturdy' ? 1 - T('sturdy') : 1), false);
    this.fx('puff', { x: target.x + 10, y: target.y - 6, color: '#e74c3c', life: 0.22 });
    if (m.isBoss) this.shake = Math.max(this.shake, 5);
    if (!target.alive) m.targetId = null;
  }

  /** A hero's hit on a monster: applies buffs, traits (crit / focus / lifesteal / splash). */
  #heroHit(h, target, mult, isSkill, monsters) {
    let dmg = h.atk * mult * this.atkBuff.mult * this.rallyMult;
    let crit = false;
    if (h.trait === 'crit' && Math.random() < T('crit')) { dmg *= 2; crit = true; }
    if (h.trait === 'focus' && target.isBoss) dmg *= 1 + T('focus');
    const dealt = this.#damage(target, dmg, isSkill || crit, crit);
    if (h.trait === 'lifesteal' && dealt > 0) h.hp = Math.min(h.maxHp, h.hp + dealt * T('lifesteal'));
    if (h.trait === 'splash' && !isSkill && monsters) {
      for (const m of monsters) if (m !== target && m.alive && Math.hypot(m.x - target.x, m.y - target.y) < 90) this.#damage(m, dmg * T('splash'), false);
    }
    return dealt;
  }

  /** Apply damage. Returns the amount actually dealt. */
  #damage(target, amount, isSkill, crit = false) {
    if (!target.alive) return 0;
    amount = Math.max(1, Math.round(amount));
    const dealt = Math.min(amount, target.hp);
    target.hp -= amount; target.shake = 1; target.flash = 0.12;
    const color = target.kind === 'monster' ? (crit ? '#ff7675' : isSkill ? '#f1c40f' : '#ffffff') : '#e74c3c';
    this.floaters.push({ x: target.x + (Math.random() * 24 - 12), y: target.y - 36, text: crit ? `${amount}!` : String(amount), color, t: 0, big: isSkill || crit });
    if (target.kind === 'monster') this.dmgLog.push([this.time, dealt]);
    if (target.hp <= 0) {
      target.hp = 0; target.alive = false;
      if (target.kind === 'monster') {
        target.deadT = 0;
        const col = target.def.palette?.M ?? '#e74c3c';
        for (let i = 0; i < 10; i++) { const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 90; this.particles.push({ x: target.x, y: target.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, t: 0, life: 0.5 + Math.random() * 0.3, color: Math.random() < 0.3 ? '#ffffff' : col, size: 3 + Math.random() * 3 }); }
        if (target.isBoss) { this.shake = 14; this.fx('ring', { x: target.x, y: target.y, color: '#ffffff', radius: 140, life: 0.7 }); }
        if (!target.isBoss) this.spawnQueue.push(BALANCE.RESPAWN_DELAY);
        this.game.onMonsterKilled(target);
      } else {
        target.reviveT = BALANCE.HERO_REVIVE_SEC;
        this.fx('puff', { x: target.x, y: target.y, color: '#95a5a6', life: 0.4 });
        this.game.log(`${target.def.name} 쓰러짐 (${BALANCE.HERO_REVIVE_SEC}초 후 복귀)`, 'warn');
      }
    }
    return dealt;
  }

  /** Coins burst toward the resource bar when gold is earned at (x,y). */
  coinBurst(x, y, gold) {
    this.floaters.push({ x, y: y - 50, text: `+${gold}g`, color: '#f7d774', t: 0 });
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, sp = 90 + Math.random() * 60; this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, life: 0.55, color: i % 2 ? '#f1c40f' : '#f9e79f', size: 4, gravity: 260 }); }
  }

  #castSkill(h, target, monsters, heroes) {
    const { type, power } = h.skill; const boost = h.skillPower;
    switch (type) {
      case 'strike': this.fx('slash', { x: target.x, y: target.y, color: '#f1c40f', angle: -0.3, life: 0.25, big: true }); this.shake = Math.max(this.shake, 4); this.#heroHit(h, target, power * boost, true); break;
      case 'sweep':
        this.fx('ring', { x: h.x, y: h.y, color: '#f1c40f', radius: 420, life: 0.45 }); this.shake = Math.max(this.shake, 6);
        for (const m of monsters) { this.fx('slash', { x: m.x, y: m.y, color: '#f1c40f', angle: 0.4, life: 0.25 }); this.#heroHit(h, m, power * boost, true); }
        break;
      case 'ult':
        this.fx('ring', { x: h.x, y: h.y, color: '#8e44ad', radius: 460, life: 0.6 }); this.shake = Math.max(this.shake, 10);
        for (const m of monsters) { this.fx('slash', { x: m.x, y: m.y, color: '#c39bd3', angle: -0.6, life: 0.3, big: true }); this.#heroHit(h, m, power * boost, true); if (m.alive) { m.stun = Math.max(m.stun, 2); this.fx('stars', { x: m.x, y: m.y - 40, color: '#f1c40f', life: 2 }); } }
        break;
      case 'buff':
        this.atkBuff = { mult: Math.max(this.atkBuff.mult, 1 + (power * boost) / 100), until: this.time + 5 };
        for (const a of heroes) this.fx('ring', { x: a.x, y: a.y + 20, color: '#f39c12', radius: 40, life: 0.5 });
        break;
      case 'heal':
        for (const a of heroes) {
          const amt = Math.round(a.maxHp * (power * boost) / 100);
          a.hp = Math.min(a.maxHp, a.hp + amt);
          this.floaters.push({ x: a.x, y: a.y - 34, text: `+${amt}`, color: '#27ae60', t: 0 });
          this.fx('sparkle', { x: a.x, y: a.y, color: '#2ecc71', n: 8 });
        }
        break;
    }
    h.anim = 'attack'; h.animT = 0;
    this.floaters.push({ x: h.x, y: h.y - 52, text: h.skillName ?? type.toUpperCase(), color: '#8e44ad', t: 0, big: true });
    this.game.log(`${h.def.name}: ${h.skillName ?? type} 발동`, 'skill');
  }
}
