import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state.js';
import * as Q from '../src/core/QuestManager.js';
import { GameManager } from '../src/core/GameManager.js';
import { DAILY_QUESTS, LOGIN_BONUS } from '../src/data/quests.js';
import { BALANCE, relativeGold } from '../src/config/balance.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const DAY = 24 * 3600 * 1000;

test('daily resets when the local date changes', () => {
  const t0 = new Date(2026, 8, 14, 12).getTime();
  const s = createInitialState(t0);
  Q.addProgress(s, 'kills', 30);
  assert.equal(Q.ensureDaily(s, t0 + 3600 * 1000), false);
  assert.equal(Q.questProgress(s, 'kills'), 30);
  assert.equal(Q.ensureDaily(s, t0 + DAY), true);
  assert.equal(Q.questProgress(s, 'kills'), 0);
  assert.equal(s.daily.loginClaimed, false);
});

test('quest progress is capped, claim requires completion and only once', () => {
  const s = createInitialState(); s.maxStage = 10;
  assert.equal(Q.claimQuest(s, 'kills'), null);
  Q.addProgress(s, 'kills', 500);
  assert.equal(Q.questProgress(s, 'kills'), 100);
  const r = Q.claimQuest(s, 'kills');
  assert.equal(r.gems, 20);
  assert.equal(r.gold, relativeGold(10, 60));
  assert.equal(Q.claimQuest(s, 'kills'), null, 'no double claim');
});

test('login bonus once per day; all-clear bonus after every quest is claimed', () => {
  const s = createInitialState();
  const r = Q.claimLogin(s);
  assert.equal(r.gems, LOGIN_BONUS.gems);
  assert.equal(Q.claimLogin(s), null);
  assert.equal(Q.claimAllClear(s), null);
  for (const q of DAILY_QUESTS) { Q.addProgress(s, q.id, q.target); Q.claimQuest(s, q.id); }
  assert.ok(Q.allQuestsClaimed(s));
  assert.ok(Q.claimAllClear(s).gems > 0);
  assert.equal(Q.claimAllClear(s), null);
});

test('ads are limited per day and reward gold', () => {
  const s = createInitialState(); s.maxStage = 5;
  const g = new GameManager({ state: s, save: memSave() });
  const before = g.state.gold;
  for (let i = 0; i < BALANCE.AD.perDay; i++) assert.ok(g.adReward('instant'));
  assert.ok(g.state.gold > before);
  assert.equal(g.adReward('instant'), null, 'limit reached');
  assert.equal(g.adsLeft(), 0);
});

test('offline report ad doubles the payout', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  const report = { gold: 1000, seconds: 3600 };
  const r = g.adReward('offline', report);
  assert.equal(r.gold, 1000 * (BALANCE.AD.offlineMultiplier - 1));
});

test('game hooks feed quest progress (kills, upgrades, pulls)', () => {
  const s = createInitialState(); s.gold = 1000; s.gems = 1000; s.heroes.main.level = 30;
  const g = new GameManager({ state: s, save: memSave() });
  g.upgradeHero('main'); g.pull(1);
  for (let t = 0; t < 60; t += 0.05) g.tick(0.05);
  assert.ok(Q.questProgress(g.state, 'kills') > 0);
  assert.equal(Q.questProgress(g.state, 'upgrades'), 1);
  assert.equal(Q.questProgress(g.state, 'pull'), 1);
  assert.ok(Q.questProgress(g.state, 'clears') >= 1);
});
