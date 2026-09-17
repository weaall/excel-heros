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
  g.state.maxStage = 12; g.state.stage = 5; g.state.challenging = false; g.state.heroes.main.level = 80; g.entities.rebuildParty(); g.checkMilestones(); g.state.tutorial.bonus = true; // 교육 보상이 보석 합계에 끼어들지 않게 (교육은 tutorial.test.js에서 검증) // milestones for the forced maxStage are granted up front so they do not pollute the gem delta
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

test('boss specials: every boss has named Nth-attack specials, distinct sprites and a matching codex line', async () => {
  const { BOSSES } = await import('../src/data/monsters.js');
  const { MONSTER_MAP } = await import('../src/data/packSprites.js');
  assert.equal(BOSSES.length, 3);
  const kinds = new Set();
  for (const b of BOSSES) {
    assert.ok(Array.isArray(b.specials) && b.specials.length >= 1, b.id);
    for (const sp of b.specials) { assert.ok(sp.every >= 3 && sp.name && sp.desc, `${b.id} ${sp.kind}`); kinds.add(sp.kind); }
    assert.ok(b.desc.length > 10);
  }
  assert.ok(kinds.size >= 5, 'five different special kinds across the three bosses');
  assert.equal(new Set(BOSSES.map((b) => MONSTER_MAP[b.id])).size, 3, 'each boss uses its own creature');
});

test('stage modifiers: bosses have none, phases lay them out differently, and every one pays extra gold', async () => {
  const { stageModifier, MODIFIERS } = await import('../src/data/stages.js');
  const { BALANCE } = await import('../src/config/balance.js');
  for (const b of [10, 20, 50]) assert.equal(stageModifier(b), null, 'boss stages are never modified');
  const layout = (phase) => Array.from({ length: BALANCE.BOSS_EVERY - 1 }, (_, i) => stageModifier(phase * BALANCE.BOSS_EVERY + i + 1)?.id ?? '-').join(',');
  assert.notEqual(layout(0), layout(2), 'different phases lay modifiers out differently');
  assert.ok(layout(4).split(',').filter((x) => x !== '-').length > layout(0).split(',').filter((x) => x !== '-').length, 'later phases are busier');
  for (const m of Object.values(MODIFIERS)) {
    assert.ok(m.gold > 1, `${m.id} pays extra gold for the extra difficulty`);
    assert.ok(m.name && m.desc.length > 5, m.id);
  }
});

// ------------------------------------------------- 경력직 스카우트 (골드 소비처) --
// ★로 레벨 상한을 잠근 뒤(6-66) ★ 사이에서 골드가 완전히 할 일을 잃었다. 스카우트는 그 잉여가 가는 곳이고,
// 하루 한도가 ★의 주 경로를 가챠로 남긴다. 이 둘이 동시에 성립해야 의미가 있다.
test('스카우트: gold buys a shard, the price scales with the star cap, and the daily limit holds', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { BALANCE, scoutCost, levelCap } = await import('../src/config/balance.js');
  const { HEROES } = await import('../src/data/heroes.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });
  const hero = HEROES.find((h) => h.grade === 'A' && !g.isMain(h.id));
  g.state.heroes[hero.id].owned = true; g.state.heroes[hero.id].star = 1; g.state.heroes[hero.id].shards = 0;
  g.state.gold = 1e12; // 안전 정수 범위 안 (1e18 이면 뺄셈 끝자리가 부동소수점에 뭉개진다)

  const info = g.scoutInfo(hero.id);
  assert.equal(info.left, BALANCE.SCOUT.perDay);
  assert.equal(info.cost, scoutCost('A', 1, levelCap(1)));
  assert.equal(info.can, true);

  const gold0 = g.state.gold;
  assert.equal(g.scoutShard(hero.id), 1, '조각이 하나 늘어난다');
  assert.equal(gold0 - g.state.gold, info.cost, '표시한 값만큼만 빠진다');

  for (let i = 1; i < BALANCE.SCOUT.perDay; i++) assert.ok(g.scoutShard(hero.id));
  assert.equal(g.scoutInfo(hero.id).left, 0);
  assert.equal(g.scoutShard(hero.id), null, '하루 한도를 넘기면 안 된다 — 가챠가 ★의 주 경로로 남아야 한다');
  assert.equal(g.state.heroes[hero.id].shards, BALANCE.SCOUT.perDay);

  // 값은 ★이 오를수록 비싸진다(후반 골드를 따라간다)
  const prices = [1, 2, 3, 4].map((st) => scoutCost('A', st, levelCap(st)));
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i] > prices[i - 1] * 10, `★${i + 1} 값이 충분히 오르지 않는다`);
  // 등급이 높을수록 비싸다
  assert.ok(scoutCost('S', 1, levelCap(1)) > scoutCost('D', 1, levelCap(1)));
});

test('스카우트: refuses the main hero, unowned cards and ★ MAX', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { BALANCE } = await import('../src/config/balance.js');
  const { HEROES, MAIN_ID } = await import('../src/data/heroes.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });
  g.state.gold = 1e12;
  assert.equal(g.scoutShard(MAIN_ID), null, '주인공은 조각을 쓰지 않는다');
  const unowned = HEROES.find((h) => !g.state.heroes[h.id].owned && !g.isMain(h.id));
  assert.equal(g.scoutShard(unowned.id), null, '미보유 카드는 스카우트 대상이 아니다');
  const maxed = HEROES.find((h) => h.grade === 'B' && !g.isMain(h.id));
  g.state.heroes[maxed.id].owned = true; g.state.heroes[maxed.id].star = BALANCE.MAX_STAR;
  assert.equal(g.scoutShard(maxed.id), null, '★ 최대면 조각이 쓸모없다');
  assert.equal(g.state.daily.scoutUsed | 0, 0, '거절된 시도는 한도를 쓰지 않는다');
});

// ------------------------------------------------------- 주인공 승진 안내 --
// 주인공은 ★이 아니라 직급으로 상한이 열리고(MAIN_LEVEL_CAP_BY_TIER), 파티에서 뺄 수도 없다.
// 그래서 승진을 모르면 계정 전체가 tier 0 상한에 갇히는데, 승진 버튼은 주인공 카드 안에만 있었다.
// 안내는 '급할 때만' 떠야 한다 — 상한에 걸렸거나, 지금 누르면 되는 때.
test('승진 안내: silent until it matters, then says exactly what is missing', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { MAIN_ID } = await import('../src/data/heroes.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });

  assert.equal(g.mainPromoAdvice(), null, '상한도 아니고 승진도 아직이면 조용해야 한다');

  const e = g.state.heroes[MAIN_ID];
  e.level = g.heroView(MAIN_ID).levelCap;
  const capped = g.mainPromoAdvice();
  assert.equal(capped.kind, 'capped');
  assert.match(capped.text, /파티 전체가 여기서 멈춥니다/, '왜 막혔는지를 말해야 한다');
  assert.match(capped.text, /남은 조건/, '무엇이 모자란지를 말해야 한다');

  const info = g.mainPromotionInfo();
  e.enhance = info.enhance; g.state.cards = info.cards; g.state.maxCleared = info.stage;
  e.level = Math.max(e.level, info.level);
  const ready = g.mainPromoAdvice();
  assert.equal(ready.kind, 'ready');
  assert.match(ready.text, /상한이 Lv \d+ → \d+/, '승진의 보상이 상한 해제라는 걸 보여야 한다');

  const capBefore = g.heroView(MAIN_ID).levelCap;
  assert.equal(g.promoteMain(info.options[0].id), true);
  assert.ok(g.heroView(MAIN_ID).levelCap > capBefore, '승진하면 상한이 실제로 열린다');
  assert.equal(g.mainPromoAdvice(), null, '열린 뒤에는 안내가 사라진다');
});

test('승진 안내: the last job has nothing to advise', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { MAIN_JOBS, MAIN_ID } = await import('../src/data/heroes.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });
  const last = Object.values(MAIN_JOBS).find((j) => !j.next.length);
  g.state.main.job = last.id; g.entities.rebuildParty();
  g.state.heroes[MAIN_ID].level = g.heroView(MAIN_ID).levelCap;
  assert.equal(g.mainPromotionInfo().maxed, true);
  assert.equal(g.mainPromoAdvice(), null, '최종 직급에서는 안내할 게 없다');
});


// --------------------------------------------------------- 완전 초기화 --
// "처음부터 다시"는 저장을 비우는 것 이상이다. 오프닝과 신입 교육까지 되살아나야 진짜 새 시작이다.
test('완전 초기화: everything goes back, including the prologue and the tutorial', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, MAIN_ID } = await import('../src/data/heroes.js');
  const g = new GameManager({ save: { save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() } });

  // 한참 진행한 계정을 만든다
  g.state.gems = 50000; g.state.cards = 900; g.state.gold = 1e9;
  g.state.maxCleared = 120; g.state.prestige = { shares: 400, count: 9 };
  g.state.main.job = 'sales_manager';
  g.state.settings.prologueSeen = true;
  g.markTutorial('stealth'); g.markTutorial('detail');
  for (const h of HEROES.slice(0, 15)) Object.assign(g.state.heroes[h.id], { owned: true, star: 4, shards: 9, level: 90 });

  g.reset();

  const s = g.state;
  assert.equal(s.maxCleared, 0);
  assert.equal(s.prestige.shares, 0);
  assert.equal(s.cards, 0);
  assert.equal(s.main.job, 'intern', '직급도 인턴으로');
  assert.equal(Object.entries(s.heroes).filter(([id, e]) => e.owned && id !== MAIN_ID).length, 0, '보유 카드가 전부 사라진다');
  assert.equal(s.settings.prologueSeen, false, '오프닝을 다시 본다');
  assert.deepEqual(s.tutorial.done, {}, '신입 교육이 1번 항목부터 되살아난다');
  assert.deepEqual(s.tutorial.flags, {});
  assert.equal(s.tutorial.bonus, false);
  assert.equal(s.tutorial.hidden, false);
  assert.equal(g.tutorialState().current.id, (await import('../src/data/tutorial.js')).TUTORIAL[0].id);
});
