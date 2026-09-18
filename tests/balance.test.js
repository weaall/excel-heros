import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BALANCE, upgradeCost, monsterHP, baseGold, offlineGold, stageLabel, isBossStage, heroATK, estimateGoldPerSec, starMult, enhanceMult, enhanceCost, relativeGold, atkRamp, monsterATK } from '../src/config/balance.js';

test('GDD formulas at level/stage 1 return base values', () => {
  assert.equal(upgradeCost(1), 10);
  assert.equal(monsterHP(1), 50);
  assert.equal(baseGold(1), 5);
});

test('GDD formulas grow exponentially with floor', () => {
  assert.equal(upgradeCost(2), Math.floor(BALANCE.UPGRADE_COST_BASE * BALANCE.UPGRADE_COST_GROWTH));
  assert.equal(monsterHP(10), Math.floor(BALANCE.MONSTER_HP_BASE * BALANCE.MONSTER_HP_GROWTH ** 9));
  assert.equal(baseGold(20), Math.floor(BALANCE.GOLD_BASE * BALANCE.GOLD_GROWTH ** 19));
  // the curve must still tighten with depth, or there is no wall and no reason to 회사 이전 …
  const levelsPerStage = Math.log(BALANCE.MONSTER_HP_GROWTH) / Math.log(BALANCE.HERO_ATK_GROWTH);
  const drift = BALANCE.UPGRADE_COST_GROWTH ** levelsPerStage / BALANCE.GOLD_GROWTH;
  assert.ok(drift > 1.005, `levelling must get relatively pricier with depth (drift ${drift.toFixed(4)})`);
  // … but not so fast that the mid game dies: 50 stages must not cost more than ~6x relative ground
  assert.ok(drift ** 50 < 6, `50 stages of drift is ${(drift ** 50).toFixed(1)}x — too steep`);
});

test('offline gold applies 0.6 efficiency and 10h cap', () => {
  assert.equal(offlineGold(10, 100), 600);
  assert.equal(offlineGold(10, 100 * 3600), offlineGold(10, 10 * 3600));
  assert.equal(offlineGold(10, -5), 0);
});

test('stage labels and boss stages', () => {
  assert.equal(stageLabel(1), 'Phase 1-1');
  assert.equal(stageLabel(10), 'Phase 1-10');
  assert.equal(stageLabel(11), 'Phase 2-1');
  assert.ok(isBossStage(10) && isBossStage(20) && !isBossStage(11));
});

test('hero ATK scales with level, star and enhance', () => {
  assert.equal(heroATK(10, 1, 1), 10);
  assert.ok(heroATK(10, 2, 1) > heroATK(10, 1, 1));
  assert.equal(heroATK(10, 1, 5), Math.floor(10 * starMult(5)));
  assert.equal(heroATK(100, 1, 1, 10), Math.floor(100 * enhanceMult(10)));
  assert.equal(enhanceMult(BALANCE.ENHANCE_MAX + 5), enhanceMult(BALANCE.ENHANCE_MAX), 'enhance is capped'); assert.equal(BALANCE.ENHANCE_MAX, 60);
  assert.ok(enhanceCost(5) > enhanceCost(0));
});

test('relative rewards scale with the best stage', () => {
  assert.equal(relativeGold(1, 60), 300);
  assert.ok(relativeGold(20, 60) > relativeGold(10, 60));
});

test('progression stays feasible: stage 10 boss reachable with ~10 levels per hero', () => {
  const partyDPS = 5 * heroATK(6, 10, 1);
  const bossHp = monsterHP(10) * BALANCE.BOSS_HP_MULT;
  assert.ok(bossHp / partyDPS < BALANCE.BOSS_TIME_LIMIT, `boss takes ${bossHp / partyDPS}s`);
});

test('estimateGoldPerSec caps kill rate at MAX_MONSTERS/sec', () => {
  const gps = estimateGoldPerSec(1, 1e12, 1);
  assert.ok(gps <= baseGold(1) * BALANCE.MAX_MONSTERS + 1e-9);
});

test('회사 업그레이드: payroll raises gem drop chance (not gold), team costs dwarf a single hero level', async () => {
  const { GameManager } = await import('../src/core/GameManager.js');
  const { createInitialState } = await import('../src/core/state.js');
  const { teamUpgradeCost, upgradeCost, BALANCE } = await import('../src/config/balance.js');
  const g = new GameManager({ state: createInitialState(), save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });
  const gold0 = g.goldMult(), chance0 = g.gemDropChance();
  assert.equal(chance0, BALANCE.GEM_DROP.base);
  g.state.team.payroll = 20;
  assert.equal(g.goldMult(), gold0, 'payroll no longer touches gold');
  assert.ok(Math.abs(g.gemDropChance() - (BALANCE.GEM_DROP.base + 20 * BALANCE.TEAM_UPGRADES.payroll.per)) < 1e-9);
  // drops actually happen and are counted; elites drop ×3
  g.state.team.payroll = BALANCE.TEAM_UPGRADES.payroll.max; g.state.stage = 3; g.state.challenging = false;
  const gems0 = g.state.gems; let n = 0;
  for (let i = 0; i < 2000; i++) g.onMonsterKilled({ def: { id: 'circ:0', name: 'x' }, x: 0, y: 0, isBoss: false, elite: i % 2 === 0 });
  n = g.state.gems - gems0; const p = g.gemDropChance(), expected = 2000 * p * (1 + BALANCE.GEM_DROP.eliteMult) / 2 * BALANCE.GEM_DROP.amount;
  assert.ok(n > expected * 0.6 && n < expected * 1.4, `drops ${n} vs expected ≈ ${expected}`);
  assert.equal(g.state.stats.gemDrops, n);
  // cost scale: a team upgrade at Lv 30 should cost about what a hero level around 100-120 costs — expressed as a
  // band rather than exact levels so a tuning pass on UPGRADE_COST_GROWTH does not need the test rewritten
  for (const k of Object.keys(BALANCE.TEAM_UPGRADES)) {
    const c = teamUpgradeCost(k, 30);
    assert.ok(c > upgradeCost(95) && c < upgradeCost(125), `${k} Lv30 costs ${c}, outside the hero Lv 95-125 band`);
  }
  for (const k of Object.keys(BALANCE.TEAM_UPGRADES)) assert.ok(teamUpgradeCost(k, 0) > upgradeCost(30), k);
});

test('레벨 상한은 ★로만 열린다 — 골드로는 넘을 수 없다', async () => {
  const { levelCap, BALANCE } = await import('../src/config/balance.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { createInitialState } = await import('../src/core/state.js');
  const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
  // 상한은 ★마다 올라가고, 각성이 한 번 더 올린다
  for (let st = 2; st <= 5; st++) assert.ok(levelCap(st) > levelCap(st - 1), `★${st} 상한이 더 높다`);
  assert.equal(levelCap(5, true), levelCap(5) + BALANCE.LEVEL_CAP_AWAKEN);
  const s = createInitialState();
  s.heroes.parttime = { owned: true, star: 1, shards: 0, level: 1, enhance: 0, equip: {} };
  s.gold = 1e18;
  const g = new GameManager({ state: s, save: memSave() });
  g.toggleParty('parttime');
  // 골드가 무한이어도 상한에서 멈춘다 — 단일·일괄·자동 강화 경로 모두
  g.upgradeHeroMany('parttime', 10_000);
  assert.equal(g.state.heroes.parttime.level, levelCap(1), '★1 상한에서 멈춘다');
  assert.equal(g.upgradeHero('parttime'), false, '한 단계도 더 못 올린다');
  g.upgradeAllMany(50); g.upgradeCheapestLoop(200);
  assert.equal(g.state.heroes.parttime.level, levelCap(1), '일괄·자동 경로도 상한을 지킨다');
  assert.ok(g.state.gold > 1e17, '골드는 남아돈다 — 벽은 돈으로 여는 게 아니다');
  // ★을 올리면 그만큼 열린다
  s.heroes.parttime.star = 2;
  assert.ok(g.upgradeHero('parttime'), '★2가 되면 다시 올라간다');
  assert.equal(g.heroView('parttime').levelCap, levelCap(2));
});

test('적 화력 유예: 1단계는 그대로, 25단계에서 5배가 되고 그 뒤로는 일정하다', () => {
  const { full, byStage } = BALANCE.MONSTER_ATK_RAMP;
  assert.equal(atkRamp(1), 1, '1단계는 유예 없음 — 영웅 한 명으로 시작하는 구간을 건드리지 않는다');
  assert.equal(atkRamp(0), 1, '0·음수 단계도 1단계로 취급');
  assert.equal(atkRamp(byStage), full, `${byStage}단계에서 ${full}배`);
  assert.equal(atkRamp(byStage + 500), full, '그 뒤로는 더 오르지 않는다 — 곡선이 아니라 수준만 올린 것');
  // 단조 증가
  for (let s2 = 2; s2 <= byStage; s2++) assert.ok(atkRamp(s2) > atkRamp(s2 - 1), `${s2}단계 유예가 더 크다`);
  // 유예가 실제로 화력에 곱해진다
  assert.equal(monsterATK(1), 1, '1단계 화력은 기본값 그대로');
  const bare = (st) => BALANCE.MONSTER_ATK_BASE * BALANCE.MONSTER_ATK_GROWTH ** (st - 1);
  assert.equal(monsterATK(40), Math.floor(bare(40) * full), '유예가 끝난 뒤에는 정확히 full배');
  assert.ok(monsterATK(25) > Math.floor(bare(25)) * 4, '유예 구간 끝에서 4배는 넘는다');
});
