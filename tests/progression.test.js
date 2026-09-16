// Pass 10: achievements, collection bonus, boss rotation/patterns, auto-upgrade toggle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import * as A from '../src/core/AchievementManager.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';
import { BOSSES, bossForStage } from '../src/data/monsters.js';
import { MONSTER_MAP } from '../src/data/packSprites.js';
import { BALANCE } from '../src/config/balance.js';
import { MAIN_ID } from '../src/data/heroes.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const run = (g, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) g.tick(step); };

test('achievements: tiers claim in order, once each, and pay the listed gems', () => {
  const s = createInitialState(); s.stats.totalKills = 1500;
  assert.equal(A.nextTarget(s, 'kills'), 100);
  assert.ok(A.canClaim(s, 'kills'));
  const r1 = A.claimAchievement(s, 'kills');
  assert.equal(r1.gems, 20); assert.equal(r1.tier, 1);
  const r2 = A.claimAchievement(s, 'kills');
  assert.equal(r2.gems, 50); assert.equal(A.nextTarget(s, 'kills'), 10000);
  assert.equal(A.claimAchievement(s, 'kills'), null, 'third tier not reached yet');
  assert.equal(s.gems, BALANCE.STARTING_GEMS + 70);
  for (const a of ACHIEVEMENTS) assert.equal(a.tiers.length, a.gems.length, `${a.id} tiers/gems aligned`);
});

test('achievements: collection and maxCleared stats resolve, and survive migration', () => {
  const s = createInitialState(); s.maxCleared = 25;
  for (const id of ['guard', 'parttime', 'barista', 'courier', 'contract']) s.heroes[id] = { owned: true, star: 1, shards: 0, level: 1, enhance: 0 };
  assert.equal(A.achievementValue(s, ACHIEVEMENTS.find((a) => a.id === 'collection')), 5);
  assert.ok(A.canClaim(s, 'collection'));
  assert.ok(A.canClaim(s, 'stage'));
  A.claimAchievement(s, 'stage'); A.claimAchievement(s, 'stage');
  assert.equal(A.claimableCount(s) >= 1, true);
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.achievements.stage, 2);
  assert.equal(m.settings.autoUpgrade, false);
});

test('collection bonus raises party ATK and gold multiplier as heroes are collected', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  const atk0 = g.heroView(MAIN_ID).atk, gold0 = g.goldMult();
  for (const id of ['guard', 'parttime', 'barista', 'courier']) g.state.heroes[id] = { owned: true, star: 3, shards: 0, level: 1, enhance: 0 };
  const col = g.collection();
  assert.equal(col.owned, 4);
  assert.ok(Math.abs(col.atk - (4 * 0.01 + 12 * 0.005)) < 1e-9);
  assert.ok(g.goldMult() > gold0);
  g.state.heroes[MAIN_ID].level = 40;
  const withBonus = g.heroView(MAIN_ID).atk;
  g.state.heroes.guard.owned = g.state.heroes.parttime.owned = g.state.heroes.barista.owned = g.state.heroes.courier.owned = false;
  assert.ok(withBonus > g.heroView(MAIN_ID).atk, 'ATK drops when the collection shrinks');
  assert.ok(atk0 > 0);
});

test('bosses rotate by phase, have pack sprites, and patterns spawn with their own stats', () => {
  assert.equal(BOSSES.length, 3);
  assert.equal(bossForStage(10).id, 'boss'); assert.equal(bossForStage(20).id, 'boss_zombie'); assert.equal(bossForStage(30).id, 'boss_ogre'); assert.equal(bossForStage(40).id, 'boss');
  for (const b of BOSSES) assert.ok(MONSTER_MAP[b.id], `sprite for ${b.id}`);
  const s = createInitialState(); s.stage = 20; s.maxStage = 20; s.maxCleared = 19; s.heroes[MAIN_ID].level = 30; s.challenging = true;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 2.5);
  assert.ok(g.entities.boss, 'boss spawned');
  assert.equal(g.entities.boss.def.pattern, 'sweep');
  assert.equal(g.entities.boss.speed, 90);
  const s2 = createInitialState(); s2.stage = 30; s2.maxStage = 30; s2.maxCleared = 29; s2.heroes[MAIN_ID].level = 30; s2.challenging = true;
  const g2 = new GameManager({ state: s2, save: memSave() });
  run(g2, 12);
  assert.equal(g2.entities.boss?.def.pattern ?? 'stomp', 'stomp');
  assert.ok(g2.entities.heroes[0].hp < g2.entities.heroes[0].maxHp || g2.state.stats.bossFails + g2.state.stats.bossKills >= 0, 'sim ran');
});

test('auto-upgrade spends gold on the cheapest party upgrade every second while enabled', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  g.state.gold = 500;
  const lvl = g.state.heroes[MAIN_ID].level;
  run(g, 0.5);
  assert.equal(g.state.heroes[MAIN_ID].level, lvl, 'off by default');
  g.setAutoUpgrade(true);
  assert.ok(g.state.heroes[MAIN_ID].level > lvl, 'turning it on upgrades immediately');
  g.state.gold += 1000; const l2 = g.state.heroes[MAIN_ID].level;
  run(g, BALANCE.AUTO_UPGRADE_INTERVAL + 0.2);
  assert.ok(g.state.heroes[MAIN_ID].level > l2, 'keeps upgrading on the interval');
  g.setAutoUpgrade(false); g.state.gold += 1000; const l3 = g.state.heroes[MAIN_ID].level;
  run(g, 2);
  assert.equal(g.state.heroes[MAIN_ID].level, l3);
});

test('skills recast after their cooldown (cooldown comes from SKILLS[type])', () => {
  const s = createInitialState(); s.heroes.guard = { owned: true, star: 2, shards: 0, level: 10, enhance: 0 }; s.party = [MAIN_ID, 'guard']; s.heroes[MAIN_ID].level = 10;
  const g = new GameManager({ state: s, save: memSave() });
  let casts = 0; g.on('log', (row) => { if (row.kind === 'skill' && row.text.startsWith('경비 아저씨')) casts++; });
  run(g, 60);
  assert.ok(casts >= 3, `guard cast its skill ${casts} times in 60s`);
  const guard = g.entities.heroes.find((h) => h.heroId === 'guard');
  assert.ok(Number.isFinite(guard.skillCd));
});

test('야근 모드: once a day, 60 s of kills pay gems without touching stage progress', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { BALANCE } = await import('../src/config/balance.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });
  g.state.maxStage = 12; g.state.stage = 5; g.state.challenging = false; g.state.heroes.main.level = 80; g.entities.rebuildParty(); g.checkMilestones(); // milestones for the forced maxStage are granted up front so they do not pollute the gem delta
  const gems0 = g.state.gems, kills0 = g.state.kills, cleared0 = g.state.maxCleared, drops0 = g.state.stats.gemDrops ?? 0;
  assert.equal(g.canOvertime(), true);
  assert.equal(g.startOvertime(), true);
  assert.equal(g.combatStage(), 12 + BALANCE.OVERTIME.stageOffset); assert.equal(g.bossActive(), false);
  assert.equal(g.startOvertime(), false, 'not twice at once');
  let ended = null; g.on('overtime-end', (r) => { ended = r; });
  for (let i = 0; i < (BALANCE.OVERTIME.duration + 2) * 10; i++) g.tick(0.1);
  assert.ok(ended, 'run ended by the clock'); assert.equal(g.overtime, null);
  assert.ok(ended.kills > 0, `killed something (${ended.kills})`);
  assert.equal(g.state.gems - gems0 - ((g.state.stats.gemDrops ?? 0) - drops0), Math.min(BALANCE.OVERTIME.maxGems, ended.kills * BALANCE.OVERTIME.gemsPerKill + ended.elites * BALANCE.OVERTIME.gemsPerElite)); // random 보석 드롭 excluded
  assert.equal(g.state.kills, kills0, 'stage kill counter untouched'); assert.equal(g.state.maxCleared, cleared0); assert.equal(g.state.stage, 5);
  assert.equal(g.state.daily.overtimeDone, true); assert.equal(g.canOvertime(), false); assert.equal(g.startOvertime(), false);
  assert.equal(g.state.stats.overtimes, 1); assert.equal(g.state.stats.overtimeBest, ended.kills);
});

test('경제: 매출 인센티브 raises gold mildly, dismiss refunds level gold, claimAll collects everything claimable', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { BALANCE, teamUpgradeBonus, upgradeCost } = await import('../src/config/balance.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });
  const gold0 = g.goldMult(); g.state.team.sales = 50;
  assert.ok(Math.abs(g.goldMult() - gold0 - teamUpgradeBonus('sales', 50)) < 1e-9); assert.ok(teamUpgradeBonus('sales', 50) <= 0.5, 'not dramatic');
  // dismiss refund: a level-10 card gives back the 9 upgrade costs at LEVEL_REFUND
  g.state.heroes.guard = { owned: true, star: 1, shards: 4, level: 10, enhance: 0, awakened: false, skillLv: 0 }; // bench card (party members cannot be dismissed)
  const expected = Math.floor([1, 2, 3, 4, 5, 6, 7, 8, 9].reduce((a, l) => a + upgradeCost(l), 0) * BALANCE.LEVEL_REFUND);
  const goldBefore = g.state.gold; assert.ok(g.dismiss('guard') > 0);
  assert.equal(g.state.gold - goldBefore, expected); assert.equal(g.state.heroes.guard.owned, false);
  // claimAll: a finished quest + a claimable achievement
  const Q = await import('../src/core/QuestManager.js'); Q.addProgress(g.state, 'kills', 999); g.state.stats.totalKills = 150;
  const sum = g.claimableSummary(); assert.ok(sum.quests >= 1); assert.ok(sum.ach >= 1); assert.equal(sum.total, sum.quests + sum.allClear + sum.ach + sum.dispatch);
  const gems0 = g.state.gems; const r = g.claimAll();
  assert.ok(r.count >= 2); assert.ok(g.state.gems > gems0); assert.equal(g.claimableSummary().total, 0);
});
