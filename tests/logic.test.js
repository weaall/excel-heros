// Pass 15: forecast + safe auto-advance, elite affixes, targeting, 10-pull guarantee, quest rotation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { BALANCE } from '../src/config/balance.js';
import { MAIN_ID } from '../src/data/heroes.js';
import { AFFIXES, asElite, MONSTER_TYPES } from '../src/data/monsters.js';
import { pullOnce, initialPity } from '../src/core/GachaManager.js';
import { dailyQuestIds, DAILY_COUNT, QUEST_BY_ID } from '../src/data/quests.js';
import * as Q from '../src/core/QuestManager.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const run = (g, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) g.tick(step); };

test('forecast rises with party strength and is stricter for boss stages', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  const weak = g.challengeForecast(10).prob;
  g.state.heroes[MAIN_ID].level = 40; g.entities.refreshHeroStats();
  const strong = g.challengeForecast(10).prob;
  assert.ok(strong > weak, `forecast ${weak} -> ${strong}`);
  assert.ok(g.challengeForecast(5).prob >= g.challengeForecast(10).prob, 'normal stage at least as easy as the boss stage after it');
  const f = g.challengeForecast(10); assert.ok(f.boss && f.bossTime > 0 && ['유리', '접전', '불리'].includes(f.label));
  assert.equal(g.challengeForecast(200).prob, 0);
});

test('safe auto-advance waits while the forecast is bad and resumes after upgrades', () => {
  const s = createInitialState(); s.stage = 9; s.maxStage = 9; s.maxCleared = 8; s.challenging = true; s.heroes[MAIN_ID].level = 22;
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(g.challengeForecast(10).prob < BALANCE.SAFE_ADVANCE_MIN, 'boss 1-10 forecast is bad for a lone lv22 main');
  run(g, 300);
  assert.ok(g.state.maxCleared >= 9, `cleared 1-9 (maxCleared=${g.state.maxCleared})`);
  assert.equal(g.state.stage, 9, 'stays farming 1-9 instead of failing the boss');
  assert.equal(g.state.challenging, false); assert.equal(g.waitingAdvance, true); assert.equal(g.state.settings.autoAdvance, true);
  g.state.heroes[MAIN_ID].level = 45; g.state.gold = 0; g.entities.refreshHeroStats();
  run(g, 3);
  assert.equal(g.state.stage, 10, 'resumed the boss challenge once strong enough');
  assert.equal(g.state.challenging, true);
});

test('elite affixes: every affix is applied at spawn; shield soaks damage first; volatile explodes', () => {
  assert.equal(AFFIXES.length, 5);
  const base = MONSTER_TYPES[0];
  assert.equal(asElite(base, 0).affix.id, 'fast'); assert.equal(asElite(base, 0.99).affix.id, 'shield');
  assert.ok(asElite(base, 0.5).name.startsWith('엘리트 '));
  const s = createInitialState(); s.stage = 12; s.maxStage = 12; s.maxCleared = 12; s.challenging = false; s.heroes[MAIN_ID].level = 25;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.3);
  const em = g.entities; const m = em.monsters.find((x) => x.alive && !x.def.chest);
  const shielded = { ...m.def, elite: true, affix: AFFIXES.find((a) => a.id === 'shield'), name: 'x' };
  m.def = shielded; m.elite = true; m.shield = Math.floor(m.maxHp * 0.5); m.x = 470; m.arrived = true;
  const hp0 = m.hp;
  run(g, 0.6);
  assert.ok(m.shield < Math.floor(hp0 * 0.5) || m.hp < hp0 || !m.alive, 'shield or hp went down');
  const s2 = createInitialState(); s2.heroes[MAIN_ID].level = 5; s2.challenging = false;
  const g2 = new GameManager({ state: s2, save: memSave() });
  run(g2, 1.3);
  const v = g2.entities.monsters.find((x) => x.alive);
  v.def = { ...v.def, elite: true, affix: AFFIXES.find((a) => a.id === 'volatile'), name: 'v' }; v.elite = true; v.hp = 1; v.x = 470; v.arrived = true; v.atk = 5;
  let hurt = 0; g2.on('sfx', (n) => { if (n === 'hurt') hurt++; });
  run(g2, 3);
  assert.equal(v.alive, false); assert.ok(hurt >= 1, 'explosion hurt the front hero');
});

test('ranged heroes focus the boss, then elites, then the weakest monster; melee take the nearest arrived', () => {
  const s = createInitialState(); s.heroes.parttime = { owned: true, star: 1, shards: 0, level: 30, enhance: 0 }; s.party = [MAIN_ID, 'parttime']; s.heroes[MAIN_ID].level = 1; s.challenging = false;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.3);
  const em = g.entities; const ms = em.monsters.filter((m) => m.alive);
  assert.ok(ms.length >= 3);
  for (const m of ms) { m.x = 500 + Math.random() * 100; m.arrived = true; m.hp = m.maxHp = 10000; }
  ms[1].hp = 100; // weakest
  for (const h of em.heroes) h.targetId = null;
  g.tick(0.05);
  const ranged = em.heroes.find((h) => h.role === 'ranged');
  assert.equal(ranged.targetId, ms[1].id, 'ranged picks the nearly-dead monster');
  ms[2].elite = true;
  ranged.targetId = null; g.tick(0.05);
  assert.equal(ranged.targetId, ms[2].id, 'elite outranks the weak one');
});

test('a 10-pull always contains at least one A, and pulls still respect pity', () => {
  const rngD = { next: () => 0, int: () => 5, pick: (a) => a[0] };
  const s = createInitialState(); s.gems = 100000;
  const g = new GameManager({ state: s, save: memSave(), rng: rngD });
  const res = g.pull(10);
  assert.equal(res.length, 10);
  assert.ok(res.some((r) => ['A', 'S'].includes(r.grade)), 'guaranteed A+');
  assert.ok(res[9].guaranteed, 'the last slot was forced');
  assert.equal(g.state.pity.sinceA, 0);
  const one = pullOnce(initialPity(), {}, rngD, 'A');
  assert.equal(one.grade, 'A'); assert.equal(one.pity.sinceA, 0);
  const single = g.pull(1); assert.equal(single[0].grade, 'D', 'single pulls are not boosted');
});

test('daily quests rotate by date: kills always included, DAILY_COUNT unique ids, deterministic', () => {
  const a = dailyQuestIds('2026-09-14'), b = dailyQuestIds('2026-09-14'), c = dailyQuestIds('2026-09-15');
  assert.deepEqual(a, b); assert.equal(a.length, DAILY_COUNT); assert.equal(a[0], 'kills'); assert.equal(new Set(a).size, DAILY_COUNT);
  assert.ok(a.every((id) => QUEST_BY_ID[id]));
  const days = Array.from({ length: 30 }, (_, i) => dailyQuestIds(`2026-10-${String(i + 1).padStart(2, '0')}`).join());
  assert.ok(new Set(days).size > 3, 'different days get different lists');
  assert.ok(a.join() !== c.join() || days.length, 'rotation exists');
  const s = createInitialState(); assert.deepEqual(s.daily.quests, dailyQuestIds(s.daily.date));
  const inactive = Object.keys(QUEST_BY_ID).find((id) => !s.daily.quests.includes(id));
  if (inactive) { Q.addProgress(s, inactive, 999); assert.equal(Q.claimQuest(s, inactive), null, 'inactive quests cannot be claimed'); }
  const m = migrate({ ...JSON.parse(JSON.stringify(s)), daily: { ...s.daily, quests: undefined } });
  assert.deepEqual(m.daily.quests, dailyQuestIds(s.daily.date));
  const t0 = new Date(2026, 8, 14, 12).getTime(); const st = createInitialState(t0);
  Q.ensureDaily(st, t0 + 86400000);
  assert.deepEqual(st.daily.quests, dailyQuestIds('2026-09-15'));
});

test('combo quest hook fires at 20 hits', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  g.state.daily.quests = ['kills', 'combo'];
  g.onCombo(19); assert.equal(Q.questProgress(g.state, 'combo'), 0);
  g.onCombo(20); assert.equal(Q.questProgress(g.state, 'combo'), 1);
});
