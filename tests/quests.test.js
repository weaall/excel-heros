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
  for (const q of Q.activeQuests(s)) { Q.addProgress(s, q.id, q.target); Q.claimQuest(s, q.id); }
  assert.ok(Q.allQuestsClaimed(s));
  assert.ok(Q.claimAllClear(s).gems > 0);
  assert.equal(Q.claimAllClear(s), null);
});

test('ad offers: flat rewards with per-offer daily caps; total cap is the sum', () => {
  const s = createInitialState(); s.maxStage = 5;
  const g = new GameManager({ state: s, save: memSave() });
  const O = BALANCE.AD_OFFERS;
  assert.equal(Object.values(O).reduce((a, o) => a + o.perDay, 0), BALANCE.AD.perDay, 'total cap = sum of offer caps');
  const before = g.state.gold;
  for (let i = 0; i < O.gold.perDay; i++) assert.ok(g.adReward('gold'));
  assert.ok(g.state.gold > before);
  assert.equal(g.adReward('gold'), null, 'gold offer exhausted'); assert.equal(g.adReward('instant'), null, 'legacy kind maps to gold');
  assert.equal(g.adsLeft('gold'), 0); assert.equal(g.adsLeft('gems'), O.gems.perDay, 'other offers untouched');
  const gems = g.state.gems, cards = g.state.cards;
  assert.deepEqual(g.adReward('gems').gems, O.gems.amount); assert.equal(g.state.gems, gems + O.gems.amount);
  assert.deepEqual(g.adReward('cards').cards, O.cards.amount); assert.equal(g.state.cards, cards + O.cards.amount);
  assert.equal(g.adReward('dispatch'), null, 'no dispatch running → not applicable');
  assert.equal(g.adReward('overtime'), null, 'overtime not used today yet → not applicable');
  g.state.daily.overtimeDone = true; assert.ok(!g.canOvertime());
  assert.ok(g.adReward('overtime').overtime); assert.ok(g.canOvertime(), 'ad buys one extra 야근');
  assert.ok(g.adOffers().every((o) => typeof o.left === 'number' && o.name && o.value !== undefined));
});

test('offline report ad pays the flat gold offer, never a multiple of the report', () => {
  const s = createInitialState(); s.maxStage = 5; const g = new GameManager({ state: s, save: memSave() });
  const r = g.adReward('offline', { gold: 1_000_000, seconds: 3600 });
  assert.equal(r.gold, Math.floor(g.goldPerSecAt(g.state.stage) * BALANCE.AD_OFFERS.gold.hours * 3600));
  assert.ok(r.gold < 1_000_000, 'not tied to the offline report');
});

test('game hooks feed quest progress (kills, upgrades, pulls)', () => {
  const s = createInitialState(); s.gold = 1000; s.gems = 1000; s.heroes.main.level = 30;
  const g = new GameManager({ state: s, save: memSave() });
  g.upgradeHero('main'); g.pull(1);
  for (let t = 0; t < 150; t += 0.05) g.tick(0.05);
  assert.ok(Q.questProgress(g.state, 'kills') > 0);
  assert.equal(Q.questProgress(g.state, 'upgrades'), 1);
  assert.equal(Q.questProgress(g.state, 'pull'), 1);
  assert.ok(Q.questProgress(g.state, 'clears') >= 1);
});
