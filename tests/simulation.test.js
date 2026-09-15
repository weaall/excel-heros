// Headless combat simulation: no DOM, real GameManager + EntityManager.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../src/core/GameManager.js';
import { createInitialState } from '../src/core/state.js';
import { BALANCE } from '../src/config/balance.js';
import { MAIN_ID } from '../src/data/heroes.js';

import { MILESTONES } from '../src/data/milestones.js';
const MILESTONE_GEMS = (stage) => MILESTONES.filter((m) => m.kind === 'stage' && m.target === stage).reduce((a, m) => a + m.reward.gems, 0);
const memSave = () => ({ saved: 0, save() { this.saved++; }, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const own = (s, id, level = 1) => { s.heroes[id] = { owned: true, star: 1, shards: 0, level, enhance: 0 }; };

function run(game, seconds, step = 0.05) {
  for (let t = 0; t < seconds; t += step) game.tick(step);
}

test('the lone main hero clears Phase 1-1 and earns gold', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  run(g, 300);
  assert.ok(g.state.stats.totalKills >= BALANCE.KILLS_PER_STAGE, `kills=${g.state.stats.totalKills}`);
  assert.ok(g.state.maxCleared >= 1, `maxCleared=${g.state.maxCleared}`); // may retreat from 1-2 solo; that is by design
  assert.ok(g.state.gold > 0);
  assert.ok(g.state.gems > BALANCE.STARTING_GEMS, 'first clear granted gems');
});

test('a full 5-hero party progresses through several stages and the tank soaks aggro', () => {
  const s = createInitialState();
  for (const id of ['guard', 'parttime', 'barista', 'courier']) own(s, id, 5);
  s.heroes[MAIN_ID].level = 5;
  s.party = [MAIN_ID, 'guard', 'parttime', 'barista', 'courier'];
  const g = new GameManager({ state: s, save: memSave() });
  const front = g.entities.heroes.find((h) => h.slot === 'front');
  assert.equal(front.role, 'tank', 'tank takes the front slot');
  run(g, 300);
  assert.ok(g.state.stage >= 3, `stage=${g.state.stage}`);
  assert.equal(g.entities.heroes.length, 5);
});

test('boss timeout falls back to farming 1-9 with auto-advance off; boss kill advances', () => {
  const s = createInitialState(); s.stage = 10; s.maxStage = 10; s.maxCleared = 9; s.heroes[MAIN_ID].level = 20;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 2);
  assert.ok(g.entities.boss, 'boss spawned on stage 10 challenge (after the approach)');
  run(g, BALANCE.BOSS_TIME_LIMIT + 12); // the clock starts when the boss reaches the line, so allow the walk-in
  assert.equal(g.state.stage, 9, 'farming 1-9 after timeout');
  assert.equal(g.isChallenging(), false);
  assert.equal(g.state.settings.autoAdvance, false, 'auto-advance switched off by the failure');
  assert.equal(g.state.stats.bossFails, 1);
  run(g, 30);
  assert.equal(g.state.stage, 9, 'keeps farming 1-9 (no boss while farming)');
  assert.equal(g.entities.boss, null);

  const s2 = createInitialState(); s2.stage = 10; s2.maxStage = 10; s2.maxCleared = 9; s2.heroes[MAIN_ID].level = 60;
  const g2 = new GameManager({ state: s2, save: memSave() });
  g2.checkMilestones(); const gemsBefore = g2.state.gems; // level/stage milestones are granted up front
  for (let t = 0; t < 30 && g2.state.stage !== 11; t += 0.05) g2.tick(0.05); // stop right after the boss falls (later waves may drop chest gems)
  assert.equal(g2.state.stage, 11, 'boss killed -> Phase 2-1');
  assert.equal(g2.state.stats.bossKills, 1);
  assert.equal(g2.state.gems, gemsBefore + BALANCE.GEMS_BOSS_FIRST + MILESTONE_GEMS(10));
});

test('farming mode: no auto-advance keeps hunting the same stage forever', () => {
  const s = createInitialState(); s.stage = 9; s.maxStage = 9; s.maxCleared = 9; s.challenging = false; s.settings.autoAdvance = false; s.heroes[MAIN_ID].level = 60;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 120);
  assert.equal(g.state.stage, 9);
  assert.ok(g.state.stats.totalKills > BALANCE.KILLS_PER_STAGE, 'kills keep coming while farming');
  assert.equal(g.state.maxCleared, 9, 'farming never clears stages');
});

test('challenge button: start, clear, cancel, and failure returns to farming', () => {
  const s = createInitialState(); s.stage = 3; s.maxStage = 3; s.maxCleared = 3; s.challenging = false; s.settings.autoAdvance = false; s.heroes[MAIN_ID].level = 60;
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(g.startChallenge()); assert.equal(g.state.stage, 4); assert.ok(g.isChallenging());
  assert.ok(!g.startChallenge(), 'already challenging');
  run(g, 90);
  assert.equal(g.state.maxCleared, 4, 'challenge cleared');
  assert.ok(!g.isChallenging(), 'back to farming after clear (auto-advance off)');
  assert.equal(g.state.stage, 4, 'farms the newly cleared stage');
  assert.ok(g.startChallenge()); assert.equal(g.state.stage, 5);
  assert.ok(g.cancelChallenge()); assert.equal(g.state.stage, 4); assert.ok(!g.isChallenging());
  // a hopeless challenge wipes and falls back
  g.state.heroes[MAIN_ID].level = 1; g.entities.refreshHeroStats();
  g.state.stage = 40; g.state.maxStage = 40; g.state.maxCleared = 40; g.state.settings.safeAdvance = false; g.setAutoAdvance(true);
  assert.equal(g.state.stage, 41); assert.ok(g.isChallenging());
  run(g, 120);
  assert.equal(g.state.stage, 40, 'fell back to the last cleared stage');
  assert.equal(g.state.settings.autoAdvance, false);
});

test('player actions: upgrade, team upgrade, pull, promote, party toggle', () => {
  const s = createInitialState(); s.gold = 100_000; s.gems = 5_000;
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(g.upgradeHero(MAIN_ID));
  assert.equal(g.state.heroes[MAIN_ID].level, 2);
  assert.ok(g.upgradeTeam('coffee'));
  assert.ok(g.speedMult() > 1);
  const res = g.pull(10);
  assert.equal(res.length, 10);
  assert.equal(g.state.gems, 5_000 - BALANCE.GACHA_TEN_COST);
  assert.ok(g.state.party.length > 1, 'new hires auto-deployed');
  assert.ok(g.state.party.length <= BALANCE.PARTY_SIZE);
  assert.ok(g.upgradeCheapestLoop(50) > 0);
  // promotion of a gacha card (main hero uses job promotion instead)
  own(g.state, 'staff_park'); g.state.heroes.staff_park.shards = 10;
  assert.ok(g.promote('staff_park'));
  assert.equal(g.state.heroes.staff_park.star, 2);
  assert.ok(g.heroView('staff_park').skillUnlocked);
  assert.ok(!g.promote(MAIN_ID), 'main hero cannot star-promote');
  // party toggle
  const other = g.state.party.find((id) => id !== MAIN_ID);
  assert.ok(g.toggleParty(other)); assert.ok(!g.state.party.includes(other));
  assert.ok(g.toggleParty(other)); assert.ok(g.state.party.includes(other));
});

test('main hero job promotion: needs cards + stage, branches at 과장 → 부장, changes role', () => {
  const s = createInitialState();
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(!g.promoteMain('staff'), 'no cards yet');
  g.state.cards = 10_000;
  assert.ok(!g.promoteMain('staff'), 'stage requirement not met');
  g.state.maxCleared = 100;
  assert.ok(g.promoteMain('staff')); assert.equal(g.heroDef(MAIN_ID).grade, 'C');
  assert.ok(g.heroView(MAIN_ID).skillUnlocked, 'skill unlocks at 사원');
  assert.ok(g.promoteMain('senior')); assert.ok(g.promoteMain('manager'));
  assert.ok(!g.promoteMain('intern'), 'invalid branch');
  assert.ok(g.promoteMain('finance'));
  assert.equal(g.heroDef(MAIN_ID).grade, 'S');
  assert.equal(g.entities.heroes.find((h) => h.heroId === MAIN_ID).role, 'ranged', 'entity picks up the new job role');
  assert.ok(g.mainPromotionInfo().maxed);
  assert.equal(g.state.cards, 10_000 - BALANCE.MAIN_PROMOTE_CARDS.reduce((a, b) => a + b, 0));
});

test('enhance cards: convert shards, enhance, dismiss benched card', () => {
  const s = createInitialState();
  own(s, 'cfo'); s.heroes.cfo.shards = 5; s.heroes.main.level = 30;
  const g = new GameManager({ state: s, save: memSave() });
  assert.equal(g.convertShards('cfo'), 5 * BALANCE.SHARD_CARD_VALUE.A);
  assert.equal(g.state.heroes.cfo.shards, 0);
  const atkBefore = g.heroView(MAIN_ID).atk;
  assert.ok(g.enhance(MAIN_ID));
  assert.ok(g.heroView(MAIN_ID).atk > atkBefore);
  assert.ok(!g.dismiss(MAIN_ID), 'main hero cannot be dismissed');
  const before = g.state.cards;
  assert.ok(g.dismiss('cfo') > 0);
  assert.ok(!g.state.heroes.cfo.owned && g.state.cards > before);
});

test('autosave fires every 10 seconds of play', () => {
  const save = memSave();
  const g = new GameManager({ state: createInitialState(), save });
  run(g, 31);
  assert.ok(save.saved >= 3, `saved ${save.saved} times`);
});
