import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, upgradeCost, monsterHP, baseGold, offlineGold, stageLabel, isBossStage, heroATK, estimateGoldPerSec, starMult } from '../src/config/balance.js';

test('GDD formulas at level/stage 1 return base values', () => {
  assert.equal(upgradeCost(1), 10);
  assert.equal(monsterHP(1), 50);
  assert.equal(baseGold(1), 5);
});

test('GDD formulas grow exponentially with floor', () => {
  assert.equal(upgradeCost(2), Math.floor(10 * 1.12));
  assert.equal(monsterHP(10), Math.floor(50 * 1.18 ** 9));
  assert.equal(baseGold(20), Math.floor(5 * 1.15 ** 19));
});

test('offline gold applies 0.8 efficiency and 12h cap', () => {
  assert.equal(offlineGold(10, 100), 800);
  assert.equal(offlineGold(10, 100 * 3600), offlineGold(10, 12 * 3600));
  assert.equal(offlineGold(10, -5), 0);
});

test('stage labels and boss stages', () => {
  assert.equal(stageLabel(1), 'Phase 1-1');
  assert.equal(stageLabel(10), 'Phase 1-10');
  assert.equal(stageLabel(11), 'Phase 2-1');
  assert.ok(isBossStage(10) && isBossStage(20) && !isBossStage(11));
});

test('hero ATK scales with level and star', () => {
  assert.equal(heroATK(10, 1, 1), 10);
  assert.ok(heroATK(10, 2, 1) > heroATK(10, 1, 1));
  assert.equal(heroATK(10, 1, 5), Math.floor(10 * starMult(5)));
});

test('progression stays feasible: stage 10 boss reachable with ~10 levels per hero', () => {
  // 5 heroes at ~6 ATK, level 10 => 1.1^9 = 2.36x. Boss HP at stage 10 must be killable within 30s.
  const partyDPS = 5 * heroATK(6, 10, 1);
  const bossHp = monsterHP(10) * BALANCE.BOSS_HP_MULT;
  assert.ok(bossHp / partyDPS < BALANCE.BOSS_TIME_LIMIT, `boss takes ${bossHp / partyDPS}s`);
});

test('estimateGoldPerSec caps kill rate at MAX_MONSTERS/sec', () => {
  const gps = estimateGoldPerSec(1, 1e12, 1);
  assert.ok(gps <= baseGold(1) * BALANCE.MAX_MONSTERS + 1e-9);
});
