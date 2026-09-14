// Headless combat simulation: no DOM, real GameManager + EntityManager.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../src/core/GameManager.js';
import { createInitialState } from '../src/core/state.js';
import { BALANCE } from '../src/config/balance.js';

const memSave = () => ({ saved: 0, save() { this.saved++; }, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });

function run(game, seconds, step = 0.05) {
  for (let t = 0; t < seconds; t += step) game.tick(step);
}

test('a lone starter hero clears Phase 1-1 and earns gold', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  run(g, 240);
  assert.ok(g.state.stats.totalKills >= BALANCE.KILLS_PER_STAGE, `kills=${g.state.stats.totalKills}`);
  assert.ok(g.state.stage >= 2, `stage=${g.state.stage}`);
  assert.ok(g.state.gold > 0);
  assert.ok(g.state.gems > BALANCE.STARTING_GEMS, 'first clear granted gems');
});

test('a full 5-hero party progresses through several stages and the tank soaks aggro', () => {
  const s = createInitialState();
  for (const id of ['intern', 'guard', 'clerk', 'barista', 'courier']) s.heroes[id] = { owned: true, star: 1, shards: 0, level: 5 };
  s.party = ['intern', 'guard', 'clerk', 'barista', 'courier'];
  const g = new GameManager({ state: s, save: memSave() });
  const front = g.entities.heroes.find((h) => h.slot === 'front');
  assert.equal(front.role, 'tank', 'tank takes the front slot');
  run(g, 300);
  assert.ok(g.state.stage >= 4, `stage=${g.state.stage}`);
  assert.equal(g.entities.heroes.length, 5);
});

test('boss timeout retreats one stage; boss kill advances', () => {
  const s = createInitialState(); s.stage = 10; s.maxStage = 10; s.maxCleared = 9;
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(g.entities.boss, 'boss spawned on stage 10');
  run(g, BALANCE.BOSS_TIME_LIMIT + 2);
  assert.equal(g.state.stage, 9, 'retreated after timeout');
  assert.equal(g.state.stats.bossFails, 1);

  const s2 = createInitialState(); s2.stage = 10; s2.maxStage = 10; s2.maxCleared = 9;
  s2.heroes.intern.level = 60;
  const g2 = new GameManager({ state: s2, save: memSave() });
  run(g2, 25);
  assert.equal(g2.state.stage, 11, 'boss killed -> Phase 2-1');
  assert.equal(g2.state.stats.bossKills, 1);
  assert.equal(g2.state.gems, BALANCE.STARTING_GEMS + BALANCE.GEMS_BOSS_FIRST);
});

test('autoBoss=false loops the stage before a boss', () => {
  const s = createInitialState(); s.stage = 9; s.maxStage = 9; s.settings.autoBoss = false; s.heroes.intern.level = 60;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 120);
  assert.equal(g.state.stage, 9);
  assert.ok(g.state.stats.totalKills > BALANCE.KILLS_PER_STAGE);
});

test('player actions: upgrade, team upgrade, pull, promote, party toggle', () => {
  const s = createInitialState(); s.gold = 10_000; s.gems = 5_000;
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(g.upgradeHero('intern'));
  assert.equal(g.state.heroes.intern.level, 2);
  assert.ok(g.upgradeTeam('coffee'));
  assert.ok(g.speedMult() > 1);
  const res = g.pull(10);
  assert.equal(res.length, 10);
  assert.equal(g.state.gems, 5_000 - BALANCE.GACHA_TEN_COST);
  assert.ok(g.state.party.length > 1, 'new hires auto-deployed');
  assert.ok(g.state.party.length <= BALANCE.PARTY_SIZE);
  const n = g.upgradeCheapestLoop(50);
  assert.ok(n > 0);
  // promotion
  g.state.heroes.intern.shards = 10;
  assert.ok(g.promote('intern'));
  assert.equal(g.state.heroes.intern.star, 2);
  assert.ok(g.heroView('intern').skillUnlocked);
  // party toggle
  const other = g.state.party.find((id) => id !== 'intern');
  assert.ok(g.toggleParty(other)); assert.ok(!g.state.party.includes(other));
  assert.ok(g.toggleParty(other)); assert.ok(g.state.party.includes(other));
});

test('autosave fires every 10 seconds of play', () => {
  const save = memSave();
  const g = new GameManager({ state: createInitialState(), save });
  run(g, 31);
  assert.ok(save.saved >= 3, `saved ${save.saved} times`);
});
