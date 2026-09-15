import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { HEROES, SKILLS, MAIN_ID } from '../src/data/heroes.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
/** A game whose party is the main hero + `id`, with the skill unlocked (★2) and a spawned wave. */
function setup(id) {
  const g = new GameManager({ save: memSave() });
  g.state.heroes[id] = { owned: true, star: 2, shards: 0, level: 30, enhance: 0 }; g.state.party = [MAIN_ID, id];
  g.state.challenging = false; g.state.stage = 3; g.entities.rebuildParty();
  for (let i = 0; i < 40 && !g.entities.monsters.length; i++) g.tick(0.1); // walk in the first wave
  const em = g.entities, h = em.heroes.find((x) => x.heroId === id);
  assert.ok(h && h.skillUnlocked, `${id} skill unlocked`);
  return { g, em, h };
}
const byType = (t) => HEROES.find((h) => h.skill.type === t);

test('every skill type used by a hero exists and per-hero skill names surface in heroView', () => {
  for (const h of HEROES) assert.ok(SKILLS[h.skill.type], `${h.id}: ${h.skill.type}`);
  for (const t of ['burn', 'barrier', 'haste', 'execute']) assert.ok(byType(t), `someone has ${t}`);
  const g = new GameManager({ save: memSave() });
  assert.equal(g.heroView('dev_lead').skillName, '핫픽스 배포');
  assert.equal(g.heroView('audit_han').skillName, '저격 보고');
  assert.equal(g.heroView('staff_park').skillName, SKILLS.strike.name, 'heroes without a custom name fall back to the type name');
});

test('burn: every enemy ticks damage for the duration and can die from it (kill counted once)', () => {
  const { g, em, h } = setup(byType('burn').id);
  const ms = em.monsters.filter((m) => m.alive); assert.ok(ms.length >= 2);
  ms[0].hp = 5; // dies from the first tick → exercises the burn-kill path
  const hp0 = ms.map((m) => m.hp), kills0 = g.state.stats.totalKills;
  em.castSkill(h, ms[0], em.monsters, em.heroes);
  for (const m of ms) { assert.ok(m.burnT > 0); assert.ok(m.burnDps > 0); }
  em.heroes.forEach((x) => { x.cd = 99; x.skillCd = 99; }); // only the burn should deal damage now
  for (let i = 0; i < 12; i++) em.update(0.1);
  ms.forEach((m, i) => assert.ok(m.hp < hp0[i] || !m.alive, 'burn dealt damage'));
  const dead = ms.filter((m) => !m.alive).length;
  assert.ok(dead >= 1, 'the 5-HP monster died from burn ticks');
  assert.equal(g.state.stats.totalKills, kills0 + dead, 'each burn death counted exactly once');
});

test('barrier: a shared pool absorbs hero damage until it is spent or expires', () => {
  const { em, h } = setup(byType('barrier').id);
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(em.barrier.hp > 0); assert.equal(em.barrier.hp, em.barrier.max);
  const main = em.heroes.find((x) => x.heroId === MAIN_ID); main.hp = main.maxHp; const pool = em.barrier.hp;
  const monster = em.monsters[0]; monster.alive = true;
  // emulate a monster hit through the public path: damage goes to the barrier first
  const before = main.hp;
  // use a projectile landing (public update path): cheaper to call the damage routine via a mimic bite — instead assert through update with a strong monster
  monster.x = main.x + 20; monster.arrived = true; monster.cd = 0; monster.standoff = 0; monster.atk = Math.max(1, Math.floor(pool / 2)); monster.proj = null; monster.isBoss = false;
  em.update(0.05);
  assert.equal(main.hp, before, 'hero HP untouched while the barrier holds');
  assert.ok(em.barrier.hp < pool, 'barrier lost HP instead');
  em.barrier.until = em.time - 1; em.update(0.01); assert.equal(em.barrier.hp, 0, 'expired barrier is cleared');
});

test('haste: party attack speed multiplier for the duration; execute: double damage under 30% HP', () => {
  const a = setup(byType('haste').id);
  a.em.castSkill(a.h, a.em.monsters[0], a.em.monsters, a.em.heroes);
  const expected = 1 + a.h.skill.power * a.h.skillPower / 100;
  assert.ok(Math.abs(a.em.hasteBuff.mult - expected) < 1e-9); assert.ok(a.em.hasteBuff.until > a.em.time);
  const cd0 = 1; a.em.heroes.forEach((x) => { x.cd = cd0; x.skillCd = 99; });
  a.em.update(0.1);
  assert.ok(a.em.heroes[0].cd < cd0 - 0.1 * a.g.speedMult() + 1e-9, 'cooldowns tick faster under haste');
  a.em.hasteBuff.until = a.em.time - 1; a.em.update(0.01); assert.equal(a.em.hasteBuff.mult, 1);

  const b = setup(byType('execute').id);
  const m = b.em.monsters[0]; m.hp = m.maxHp = 1e9; b.em.combo = 0;
  b.em.castSkill(b.h, m, b.em.monsters, b.em.heroes); const full = 1e9 - m.hp;
  m.hp = Math.floor(m.maxHp * 0.2); const low0 = m.hp; b.em.combo = 0;
  b.em.castSkill(b.h, m, b.em.monsters, b.em.heroes); const low = low0 - m.hp;
  assert.ok(low > full * 1.6 && low < full * 2.6, `execute doubles under 30% (${full} → ${low})`);
});
