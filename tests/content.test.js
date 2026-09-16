// Pass 16: new heroes are wired everywhere, boss enrage, chart history sampling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { HEROES, GRADES, ROLES, TRAITS, SKILLS, MAIN_ID } from '../src/data/heroes.js';
import { HERO_MAP } from '../src/data/packSprites.js';
import { ACHIEVEMENT_BY_ID } from '../src/data/achievements.js';
import { BALANCE } from '../src/config/balance.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const run = (g, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) g.tick(step); };

test('34 heroes: unique ids, valid grade/role/trait/skill, pack sprite mapping, palette present', () => {
  assert.equal(HEROES.length, 34);
  assert.equal(new Set(HEROES.map((h) => h.id)).size, 34);
  for (const h of HEROES) {
    assert.ok(GRADES[h.grade], h.id); assert.ok(ROLES[h.role], h.id); assert.ok(TRAITS[h.trait], h.id); assert.ok(SKILLS[h.skill.type], h.id);
    assert.ok(HERO_MAP[h.id], `pack mapping for ${h.id}`); assert.ok(h.palette?.W, `palette for ${h.id}`);
  }
  for (const role of Object.keys(ROLES)) assert.ok(HEROES.filter((h) => h.role === role).length >= 5, `${role} count`);
  const last = ACHIEVEMENT_BY_ID.collection.tiers.at(-1); assert.equal(last, HEROES.length, 'collection achievement reaches the full roster');
  const s = createInitialState(); for (const h of HEROES) assert.ok(s.heroes[h.id], `state entry for ${h.id}`);
  const g = new GameManager({ state: s, save: memSave() });
  for (const h of HEROES) { const v = g.heroView(h.id); assert.ok(v.atk > 0 && v.hp > 0, h.id); }
});

test('boss enrages once below half HP: faster and harder', () => {
  const s = createInitialState(); s.stage = 10; s.maxStage = 10; s.maxCleared = 9; s.challenging = true; s.heroes[MAIN_ID].level = 30;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 2.5);
  const b = g.entities.boss; assert.ok(b, 'boss spawned');
  const atk0 = b.atk, speed0 = b.speed, int0 = b.interval;
  let enraged = 0; g.on('enrage', () => enraged++);
  b.hp = Math.floor(b.maxHp * 0.4);
  run(g, 0.2);
  assert.equal(b.enraged, true); assert.equal(enraged, 1);
  assert.ok(b.atk > atk0 && b.speed > speed0 && b.interval < int0);
  b.hp = Math.floor(b.maxHp * 0.1); run(g, 0.2);
  assert.equal(enraged, 1, 'only once');
});

test('history samples every 5 seconds and keeps a bounded window', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  let events = 0; g.on('history', () => events++);
  run(g, 31, 0.1);
  assert.ok(g.history.goldPerMin.length >= 5 && g.history.goldPerMin.length <= 7, `samples ${g.history.goldPerMin.length}`);
  assert.equal(events, g.history.goldPerMin.length);
  assert.ok(g.history.dps.every((v) => Number.isFinite(v)));
  g.history.t = Array(200).fill(0); g.history.goldPerMin = Array(200).fill(0); g.history.dps = Array(200).fill(0); g.history.stage = Array(200).fill(1);
  run(g, 5.2, 0.1);
  assert.equal(g.history.t.length, GameManager.HISTORY_LEN);
  assert.ok(BALANCE.PARTY_SIZE === 5);
});

test('paper dolls: every hero and main job has a doll spec that renders 9 frames with an outline', async () => {
  const { DOLLS, dollPixels } = await import('../src/data/dollSprites.js');
  const { HEROES: HS, MAIN_JOBS: MJ } = await import('../src/data/heroes.js');
  for (const id of [...HS.map((h) => h.id), ...Object.values(MJ).map((j) => j.id)]) {
    assert.ok(DOLLS[id], `doll for ${id}`);
    for (let f = 0; f < 9; f++) { const d = dollPixels(id, f); let n = 0; for (let i = 3; i < d.data.length; i += 4) if (d.data[i]) n++; assert.ok(n > 120 && n < 16 * 28, `${id} frame ${f} has a body (${n}px)`); }
    // walk frames differ from idle (legs move)
    assert.notDeepEqual(Array.from(dollPixels(id, 5).data), Array.from(dollPixels(id, 0).data), `${id} walks`);
  }
});
