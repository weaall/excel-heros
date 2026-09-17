// Pass 11: treasure chests / mimics and prestige (회사 이전).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { BALANCE, prestigeShares } from '../src/config/balance.js';
import { MAIN_ID } from '../src/data/heroes.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const run = (g, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) g.tick(step); };

test('a treasure chest never attacks and drops cards + gems when opened', () => {
  const s = createInitialState(); s.heroes[MAIN_ID].level = 15; s.challenging = false;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.5); // let the first wave spawn
  const chest = g.entities.spawnChest(false, 0);
  assert.equal(chest.atk, 0); assert.ok(chest.def.chest && !chest.def.mimic);
  g.checkMilestones(); // grant the lv15 milestone up front so it does not skew the chest reward check
  const cards = g.state.cards, gems = g.state.gems, hp0 = g.entities.heroes[0].hp;
  chest.hp = 1; chest.x = 470; chest.arrived = true;
  run(g, 6);
  assert.equal(chest.alive, false, 'chest opened');
  assert.equal(g.state.cards, cards + 1, 'phase 1 → +1 card');
  assert.ok(g.state.gems >= gems + BALANCE.CHEST.gemsMin && g.state.gems <= gems + BALANCE.CHEST.gemsMax + 20, `gems ${g.state.gems - gems}`);
  assert.equal(g.state.stats.chests, 1);
  assert.ok(hp0 > 0);
});

test('a mimic bites and shows its open-mouth frame', () => {
  const s = createInitialState(); s.heroes[MAIN_ID].level = 3;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.5);
  g.entities.monsters = g.entities.monsters.filter((m) => !m.alive); // clear the wave so only the mimic remains
  const mimic = g.entities.spawnChest(true, 0);
  assert.ok(mimic.atk > 0 && mimic.def.mimic);
  mimic.hp = mimic.maxHp = 1e9; mimic.x = 470;
  let bites = 0; g.on('sfx', (n) => { if (n === 'hurt') bites++; });
  run(g, 5);
  assert.equal(mimic.openFrame, 2, 'teeth shown');
  assert.ok(bites >= 2, 'hero got bitten ' + bites);
});

test('prestige shares formula and eligibility', () => {
  assert.equal(prestigeShares(29), 0); assert.equal(prestigeShares(30), 5); assert.equal(prestigeShares(50), 11); assert.equal(prestigeShares(100), 31);
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  assert.equal(g.prestige(), null, 'not eligible at start');
});

test('prestige resets progression, keeps the roster, and buffs ATK + gold permanently', () => {
  const s = createInitialState(); s.maxCleared = 40; s.stage = 41; s.maxStage = 41; s.gold = 5e6; s.cards = 77; s.gems = 1234;
  s.heroes.guard = { owned: true, star: 3, shards: 4, level: 50, enhance: 5 }; s.heroes[MAIN_ID].level = 60; s.team.coffee = 10; s.main.job = 'staff';
  s.achievements = { kills: 2 };
  const g = new GameManager({ state: s, save: memSave() });
  const atkBefore = g.heroView('guard').atk;
  let fired = 0; g.on('prestige', () => fired++);
  const r = g.prestige();
  assert.equal(r.gain, prestigeShares(40)); assert.equal(fired, 1);
  const t = g.state;
  assert.equal(t.stage, 1); assert.equal(t.maxCleared, 0); assert.equal(t.gold, 0); assert.equal(t.challenging, true);
  assert.equal(t.heroes.guard.level, 1); assert.equal(t.heroes[MAIN_ID].level, 1); assert.equal(t.team.coffee, 0);
  assert.equal(t.heroes.guard.star, 3); assert.equal(t.heroes.guard.enhance, 5); assert.equal(t.cards, 77); assert.equal(t.gems, 1234); assert.equal(t.main.job, 'staff'); assert.equal(t.achievements.kills, 2);
  assert.equal(t.prestige.shares, r.gain); assert.equal(t.prestige.count, 1);
  assert.ok(Math.abs(g.prestigeBonus() - r.gain * BALANCE.PRESTIGE.bonusPerShare) < 1e-9);
  // level-1 guard with 8 shares should out-hit a fresh level-1 guard without shares
  const fresh = new GameManager({ state: (() => { const f = createInitialState(); f.heroes.guard = { owned: true, star: 3, shards: 0, level: 1, enhance: 5 }; return f; })(), save: memSave() });
  assert.ok(g.heroView('guard').atk > fresh.heroView('guard').atk);
  assert.ok(g.goldMult() > fresh.goldMult());
  assert.ok(atkBefore > g.heroView('guard').atk, 'level reset lowered ATK');
  const m = migrate(JSON.parse(JSON.stringify(t)));
  assert.equal(m.prestige.shares, r.gain);
  assert.equal(m.settings.sound, false);
});

test('파티 자동 편성 picks the strongest heroes and guarantees a tank and a healer', () => {
  const s = createInitialState();
  const own = (id, level) => { s.heroes[id] = { owned: true, star: 1, shards: 0, level, enhance: 0 }; };
  own('guard', 1); own('barista', 1); own('parttime', 40); own('courier', 40); own('contract', 40); own('staff_park', 40); own('vlookup', 40);
  const g = new GameManager({ state: s, save: memSave() });
  const party = g.autoParty();
  assert.equal(party.length, BALANCE.PARTY_SIZE);
  assert.equal(party[0], MAIN_ID);
  assert.ok(party.includes('guard'), 'tank guaranteed'); assert.ok(party.includes('barista'), 'healer guaranteed');
  assert.equal(g.entities.heroes.length, BALANCE.PARTY_SIZE);
  assert.equal(g.entities.heroes[0].role, 'tank');
  assert.equal(createInitialState().settings.gridlines, true);
});

test('stage modifiers, phase names and 각성', async () => {
  const { stageModifier, phaseName, phaseTheme } = await import('../src/data/stages.js');
  assert.equal(stageModifier(5).id, 'rush'); assert.equal(stageModifier(18).id, 'elite'); assert.equal(stageModifier(3), null); assert.equal(stageModifier(10), null);
  assert.equal(phaseName(1), '무너진 오피스 거리'); assert.equal(phaseName(11), '불타는 상업 지구'); assert.equal(phaseName(101), '무너진 오피스 거리 2차');
  assert.ok(phaseTheme(25).hue >= 0);
  // rush wave spawns more, faster monsters
  const s = createInitialState(); s.stage = 5; s.maxStage = 5; s.maxCleared = 4; s.heroes[MAIN_ID].level = 20;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.3); // wave has spawned, nothing has reached the line yet
  const wave = g.entities.monsters.filter((m) => m.alive && !m.def.chest);
  assert.ok(wave.length >= 5, `rush wave size ${wave.length}`);
  assert.ok(wave.filter((m) => !m.elite).every((m) => m.speed > BALANCE.MONSTER_SPEED * 0.9 * 1.3 - 1e-6), 'rush speed (elites move 10% slower by design)');
  // 각성
  const s2 = createInitialState(); s2.heroes.guard = { owned: true, star: 5, shards: 0, level: 10, enhance: 0 }; s2.cards = 1000; s2.party = [MAIN_ID, 'guard'];
  const g2 = new GameManager({ state: s2, save: memSave() });
  const before = g2.heroView('guard');
  assert.ok(before.canAwaken); assert.equal(before.awakenCost, BALANCE.AWAKEN.cards.D);
  assert.ok(g2.awaken('guard'));
  const after = g2.heroView('guard');
  assert.equal(after.awakened, true); assert.equal(g2.state.cards, 1000 - BALANCE.AWAKEN.cards.D);
  assert.ok(Math.abs(after.atk - before.atk * (1 + BALANCE.AWAKEN.atk)) <= 1, 'awaken ATK');
  assert.equal(after.traitMult, BALANCE.AWAKEN.trait);
  assert.equal(g2.awaken('guard'), false, 'only once');
  const guard = g2.entities.heroes.find((h) => h.heroId === 'guard');
  assert.equal(guard.traitMult, BALANCE.AWAKEN.trait);
  assert.ok(!g2.heroView(MAIN_ID).canAwaken, 'main hero uses job promotion instead');
  // combo counts hero hits and resets when a hero is hurt
  run(g2, 20);
  assert.ok(g2.entities.combo >= 0 && Number.isFinite(g2.entities.combo));
});

test('bulk level-up: +N per hero and round-robin for the whole party, bounded by gold', () => {
  const s = createInitialState(); s.gold = 100000; s.heroes.guard = { owned: true, star: 1, shards: 0, level: 1, enhance: 0 }; s.party = [MAIN_ID, 'guard'];
  const g = new GameManager({ state: s, save: memSave() });
  assert.equal(g.upgradeHeroMany('guard', 10), 10); assert.equal(g.state.heroes.guard.level, 11);
  const total = g.upgradeAllMany(5); assert.equal(total, 10); assert.equal(g.state.heroes[MAIN_ID].level, 6); assert.equal(g.state.heroes.guard.level, 16);
  g.state.gold = 0; assert.equal(g.upgradeHeroMany('guard', 10), 0); assert.equal(g.upgradeAllMany(5), 0);
  assert.equal(g.upgradeHeroMany('cfo', 3), 0, 'unowned heroes cannot be levelled');
});

test('levels can be undone with a refund; enhancement cap follows stars, awakening and job tier', async () => {
  const { enhanceCap, upgradeCost } = await import('../src/config/balance.js');
  assert.equal(enhanceCap(1), 10); assert.equal(enhanceCap(5), 50); assert.equal(enhanceCap(5, true), 60); assert.equal(enhanceCap(3, true), 40); assert.equal(enhanceCap(1, false, 0), 10); assert.equal(enhanceCap(1, false, 4), 50);
  const s = createInitialState(); s.gold = 5000; s.cards = 5000; s.heroes.guard = { owned: true, star: 1, shards: 0, level: 1, enhance: 0 }; s.party = [MAIN_ID, 'guard'];
  const g = new GameManager({ state: s, save: memSave() });
  assert.equal(g.upgradeHeroMany('guard', 5), 5);
  const spent = 5000 - g.state.gold; const expected = [1, 2, 3, 4, 5].reduce((a, l) => a + upgradeCost(l), 0); assert.equal(spent, expected);
  assert.equal(g.downgradeHero('guard', 2), 2); assert.equal(g.state.heroes.guard.level, 4);
  assert.equal(g.state.gold, 5000 - expected + upgradeCost(5) + upgradeCost(4), 'refund mirrors the cost of the undone levels');
  const back = g.resetHeroLevel('guard'); assert.equal(g.state.heroes.guard.level, 1); assert.equal(g.state.gold, 5000); assert.ok(back > 0);
  assert.equal(g.downgradeHero('guard', 1), 0, 'cannot go below level 1');
  for (let i = 0; i < 20; i++) g.enhance('guard');
  assert.equal(g.state.heroes.guard.enhance, 10, '★1 caps at +10'); assert.ok(g.heroView('guard').enhanceMaxed);
  g.state.heroes.guard.star = 3; assert.equal(g.heroView('guard').enhanceCap, 30); assert.ok(g.enhance('guard'));
  g.state.heroes.guard.star = 5; g.state.heroes.guard.awakened = true; assert.equal(g.heroView('guard').enhanceCap, 60);
  assert.equal(g.heroView(MAIN_ID).enhanceCap, 10, 'intern tier caps at +10');
});

test('파티 자동 편성 weighs 부문 시너지, not just raw power', () => {
  const s = createInitialState();
  const own = (id, level, star = 3) => { s.heroes[id] = { owned: true, star, shards: 0, level, enhance: 0, equip: {} }; };
  // three 경영지원 cards (a trio synergy) at a modest level, against stronger but unrelated cards
  own('guard', 30); own('barista', 30); own('staff_park', 30); own('contract', 30);
  own('vlookup', 34); own('macro', 34); own('pivot', 34);
  const g = new GameManager({ state: s, save: memSave() });
  const party = g.autoParty();
  assert.equal(party.length, BALANCE.PARTY_SIZE);
  assert.equal(party[0], MAIN_ID, '주인공은 항상 첫 자리');
  assert.ok(party.some((id) => g.heroDef(id).role === 'tank'), 'tank kept');
  assert.ok(party.some((id) => g.heroDef(id).role === 'healer'), 'healer kept');
  // the chosen party must score at least as well as any single swap the search was allowed to make
  const score = g.partyScore(party);
  for (const cand of ['vlookup', 'macro', 'pivot', 'contract']) {
    for (let i = 1; i < party.length; i++) {
      if (party.includes(cand)) continue;
      const alt = party.slice(); alt[i] = cand;
      const roles = new Set(alt.map((id) => g.heroDef(id).role));
      if (!roles.has('tank') || !roles.has('healer')) continue;
      assert.ok(g.partyScore(alt) <= score + 1e-9, `${cand} into slot ${i} would have been better`);
    }
  }
  assert.ok(g.synergy().sets.length >= 1, '편성이 최소 한 개의 부문 시너지를 잡는다');
});

test('보석 코드: one use per save, unknown and expired codes refused, plausibility accepts the gems', async () => {
  const { CODES, checkCode, normalizeCode, MAX_CODE_GEMS } = await import('../src/data/codes.js');
  const { checkSave } = await import('../src/core/plausibility.js');
  const code = Object.keys(CODES)[0];
  assert.ok(code, 'at least one code ships');
  assert.equal(normalizeCode(' hello-heros '), 'HELLOHEROS', 'case, spaces and dashes are forgiven');
  assert.equal(normalizeCode('ref!'), 'REF!', 'punctuation that is part of a code survives');
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  const gems = g.state.gems, cards = g.state.cards;
  const r = g.redeemCode(code.toLowerCase());
  assert.ok(r.ok, 'a valid code pays out');
  assert.equal(g.state.gems, gems + (CODES[code].gems ?? 0));
  assert.equal(g.state.cards, cards + (CODES[code].cards ?? 0));
  assert.equal(g.redeemCode(code).ok, false, 'not twice');
  assert.match(g.redeemCode(code).reason, /이미/);
  assert.match(g.redeemCode('NOPE').reason, /없는/);
  assert.match(g.redeemCode('').reason, /입력/);
  assert.equal(checkCode(code, {}, Date.parse('2999-01-01')).ok, CODES[code].until ? false : true, 'expiry is honoured when set');
  assert.ok(MAX_CODE_GEMS >= (CODES[code].gems ?? 0));
  // the redeemed gems must not make an otherwise honest save look implausible
  g.state.stats.playSeconds = 600;
  assert.deepEqual(checkSave(g.state, Date.now() + 700_000).reasons, []);
});

test('회사 이전 권유는 벽에 막혔을 때만 나온다', () => {
  const s = createInitialState();
  const g = new GameManager({ state: s, save: memSave() });
  assert.equal(g.prestigeAdvice(), null, '자격이 없으면 권유하지 않는다');
  s.maxCleared = 60; s.maxStage = 60; s.stage = 60; s.stats.totalKills = 60 * 20;
  g.waitingAdvance = true;
  const a = g.prestigeAdvice();
  assert.ok(a && a.gain > 0 && a.text.includes('지분'), '막혀 있으면 구체적인 이득을 알려 준다');
  g.waitingAdvance = false;
  for (const id of ['guard', 'barista', 'staff_park', 'contract']) s.heroes[id] = { owned: true, star: 5, shards: 0, level: 400, enhance: 50, equip: {} };
  s.heroes.main.level = 400; g.entities.rebuildParty();
  assert.equal(g.prestigeAdvice(), null, '충분히 강하면 권유하지 않는다');
});
