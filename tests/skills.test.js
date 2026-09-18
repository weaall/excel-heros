import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { HEROES, SKILLS, MAIN_ID } from '../src/data/heroes.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
/** A game whose party is the main hero + `id`, with the skill unlocked (★2) and a spawned wave. */
function setup(id) {
  const g = new GameManager({ save: memSave() });
  g.state.heroes[id] = { owned: true, star: 2, shards: 0, level: 30, enhance: 0 }; g.state.party = [MAIN_ID, id];
  g.state.challenging = false; g.state.stage = 3; g.entities.rebuildParty();
  for (let i = 0; i < 40 && !g.entities.monsters.length; i++) g.tick(0.1); // walk in the first wave
  const em = g.entities, h = em.heroes.find((x) => x.heroId === id);
  assert.ok(h && h.skillUnlocked, `${id} skill unlocked`);
  return { g, em, h };
}
const byType = (t) => HEROES.find((h) => h.skill.type === t);

test('every skill type used by a hero exists and per-hero skill names surface in heroView', () => {
  for (const h of HEROES) assert.ok(SKILLS[h.skill.type], `${h.id}: ${h.skill.type}`);
  for (const t of ['burn', 'barrier', 'haste', 'execute']) assert.ok(byType(t), `someone has ${t}`);
  const g = new GameManager({ save: memSave() });
  assert.equal(g.heroView('dev_lead').skillName, '핫픽스 배포');
  assert.equal(g.heroView('audit_han').skillName, '저격 보고');
  assert.equal(g.heroView('staff_park').skillName, SKILLS.strike.name, 'heroes without a custom name fall back to the type name');
});

test('burn: every enemy ticks damage for the duration and can die from it (kill counted once)', () => {
  const { g, em, h } = setup(byType('burn').id);
  const ms = em.monsters.filter((m) => m.alive); assert.ok(ms.length >= 2);
  ms[0].hp = 5; // dies from the first tick → exercises the burn-kill path
  const hp0 = ms.map((m) => m.hp);
  // 전역 킬 수로 세면, 이 무리가 전멸한 뒤 새 웨이브가 들어와 같이 죽을 때 값이 흔들린다(플레이키).
  // 우리가 확인하려는 건 "이 무리의 죽음이 한 번씩만 집계되는가"이므로 이 무리만 따로 센다.
  const counted = new Map();
  const realKill = g.onMonsterKilled.bind(g);
  g.onMonsterKilled = (m) => { counted.set(m, (counted.get(m) ?? 0) + 1); return realKill(m); };
  em.castSkill(h, ms[0], em.monsters, em.heroes);
  for (const m of ms) { assert.ok(m.burnT > 0); assert.ok(m.burnDps > 0); }
  em.heroes.forEach((x) => { x.cd = 99; x.skillCd = 99; }); // only the burn should deal damage now
  for (let i = 0; i < 12; i++) em.update(0.1);
  ms.forEach((m, i) => assert.ok(m.hp < hp0[i] || !m.alive, 'burn dealt damage'));
  const dead = ms.filter((m) => !m.alive);
  assert.ok(dead.length >= 1, 'the 5-HP monster died from burn ticks');
  for (const m of dead) assert.equal(counted.get(m), 1, 'each burn death counted exactly once');
});

test('barrier: a shared pool absorbs hero damage until it is spent or expires', () => {
  const { em, h } = setup(byType('barrier').id);
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(em.barrier.hp > 0); assert.equal(em.barrier.hp, em.barrier.max);
  const main = em.heroes.find((x) => x.heroId === MAIN_ID); main.hp = main.maxHp; const pool = em.barrier.hp;
  const monster = em.monsters[0]; monster.alive = true;
  // emulate a monster hit through the public path: damage goes to the barrier first
  const before = main.hp;
  // use a projectile landing (public update path): cheaper to call the damage routine via a mimic bite — instead assert through update with a strong monster
  monster.x = main.x + 20; monster.arrived = true; monster.cd = 0; monster.standoff = 0; monster.atk = Math.max(1, Math.floor(pool / 2)); monster.proj = null; monster.isBoss = false;
  em.update(0.05);
  assert.equal(main.hp, before, 'hero HP untouched while the barrier holds');
  assert.ok(em.barrier.hp < pool, 'barrier lost HP instead');
  em.barrier.until = em.time - 1; em.update(0.01); assert.equal(em.barrier.hp, 0, 'expired barrier is cleared');
});

test('haste: party attack speed multiplier for the duration; execute: double damage under 30% HP', () => {
  const a = setup(byType('haste').id);
  a.em.castSkill(a.h, a.em.monsters[0], a.em.monsters, a.em.heroes);
  const expected = 1 + a.h.skill.power * a.h.skillPower / 100;
  assert.ok(Math.abs(a.em.hasteBuff.mult - expected) < 1e-9); assert.ok(a.em.hasteBuff.until > a.em.time);
  const cd0 = 1; a.em.heroes.forEach((x) => { x.cd = cd0; x.skillCd = 99; });
  a.em.update(0.1);
  assert.ok(a.em.heroes[0].cd < cd0 - 0.1 * a.g.speedMult() + 1e-9, 'cooldowns tick faster under haste');
  a.em.hasteBuff.until = a.em.time - 1; a.em.update(0.01); assert.equal(a.em.hasteBuff.mult, 1);

  const b = setup(byType('execute').id);
  const m = b.em.monsters[0]; m.hp = m.maxHp = 1e9; b.em.combo = 0;
  b.em.castSkill(b.h, m, b.em.monsters, b.em.heroes); const full = 1e9 - m.hp;
  m.hp = Math.floor(m.maxHp * 0.2); const low0 = m.hp; b.em.combo = 0;
  b.em.castSkill(b.h, m, b.em.monsters, b.em.heroes); const low = low0 - m.hp;
  assert.ok(low > full * 1.6 && low < full * 2.6, `execute doubles under 30% (${full} → ${low})`);
});

test('quips: every skill type has lines (except the ultimate cut-in), every boss has lines, casting sets a bubble', async () => {
  const { SKILL_QUIPS, BOSS_LINES, skillQuip, bossLine } = await import('../src/data/quips.js');
  const { BOSSES } = await import('../src/data/monsters.js');
  for (const t of Object.keys(SKILLS)) if (t !== 'ult') assert.ok(SKILL_QUIPS[t]?.length >= 2, `quips for ${t}`);
  for (const b of BOSSES) assert.ok(BOSS_LINES[b.id]?.length >= 2, `boss lines for ${b.id}`);
  assert.equal(skillQuip('ult'), null); assert.ok(bossLine('unknown-boss'), 'falls back to the first boss lines');
  const { em, h } = setup(byType('haste').id);
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(h.say && SKILL_QUIPS.haste.includes(h.say.text), 'caster speaks a haste quip');
});

test('cleanse: heals, clears the boss slow and grants a short haste', () => {
  const { g, em, h } = setup('ai_lead');
  const ally = em.heroes[0]; ally.hp = Math.max(1, Math.floor(ally.maxHp * 0.3));
  em.slow = { mult: 0.7, until: em.time + 10 };
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(ally.hp > Math.floor(ally.maxHp * 0.3), 'the party was healed');
  assert.equal(em.slow.mult, 1, '둔화 was cleared');
  assert.ok(em.hasteBuff.mult > 1 && em.hasteBuff.until > em.time, 'a short haste is granted');
});

test('revive: brings a downed ally back, and heals the weakest when nobody is down', () => {
  const { g, em, h } = setup('chro');
  const ally = em.heroes.find((a) => a !== h);
  ally.alive = false; ally.hp = 0; ally.reviveT = 8;
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes.filter((a) => a.alive));
  assert.ok(ally.alive && ally.hp > 0 && ally.reviveT === 0, 'the downed ally is back on the line');
  // nobody down: the weakest ally is topped up instead
  const weak = em.heroes.find((a) => a !== h); weak.hp = Math.max(1, Math.floor(weak.maxHp * 0.2));
  const before = weak.hp;
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(weak.hp > before, 'the weakest ally was healed instead');
});

test('drain: damages every enemy and feeds part of it back to the party', () => {
  const { g, em, h } = setup('cdo');
  for (const a of em.heroes) a.hp = Math.max(1, Math.floor(a.maxHp * 0.4));
  const hpBefore = em.heroes.map((a) => a.hp);
  const mHpBefore = em.monsters.map((m) => m.hp);
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(em.monsters.some((m, i) => m.hp < mHpBefore[i] || !m.alive), 'enemies took damage');
  assert.ok(em.heroes.some((a, i) => a.hp > hpBefore[i]), 'the party was healed by the drain');
});

test('chain: hits at most three enemies and each link is weaker than the last', () => {
  const { g, em, h } = setup('vlookup');
  for (let i = 0; i < 60 && em.monsters.filter((m) => m.alive).length < 3; i++) g.tick(0.1);
  const alive = em.monsters.filter((m) => m.alive).sort((a, b) => a.x - b.x);
  if (alive.length < 3) return; // the wave never filled up; nothing to assert
  const before = alive.map((m) => m.hp);
  em.castSkill(h, alive[0], em.monsters, em.heroes);
  const dealt = alive.map((m, i) => before[i] - m.hp);
  assert.ok(dealt[0] > 0 && dealt[1] > 0 && dealt[2] > 0, 'three enemies were hit');
  assert.ok(dealt[0] >= dealt[1] && dealt[1] >= dealt[2], 'each link is weaker');
  const fourth = em.monsters.filter((m) => !alive.includes(m));
  assert.ok(fourth.every((m) => m.hp === m.maxHp || !m.alive), 'a fourth enemy is untouched');
});

test('taunt: monsters hit the taunting hero instead, for reduced damage, until it expires', () => {
  const { g, em, h } = setup('guard');
  const other = em.heroes.find((a) => a !== h);
  em.castSkill(h, em.monsters[0], em.monsters, em.heroes);
  assert.ok(em.taunt && em.taunt.heroId === h.id && em.taunt.reduce > 0, 'taunt is up');
  const otherBefore = other.hp, tankBefore = h.hp;
  for (let i = 0; i < 40 && h.hp === tankBefore && em.taunt; i++) g.tick(0.1); // stay inside the 5 s window
  assert.equal(other.hp, otherBefore, 'the other hero was never hit while the taunt held');
  if (em.taunt) { em.taunt.until = em.time - 1; g.tick(0.1); }
  assert.equal(em.taunt, null, 'taunt expires');
});

test('스킬은 순서대로: 같은 순간에 두 개가 겹쳐 터지지 않는다', () => {
  const { g, em } = setup('cfo');
  // 파티 전원의 스킬을 동시에 준비시킨다 — 예전에는 이 프레임에 전부 터졌다
  for (const h of em.heroes) { h.skillUnlocked = true; h.skillCd = 0; }
  const casts = [];
  const real = em.castSkill.bind(em);
  em.castSkill = (h, ...rest) => { casts.push({ id: h.heroId, t: em.time }); return real(h, ...rest); };
  em.castLock = 0;
  for (let i = 0; i < 40 && casts.length === 0; i++) g.tick(0.05); // 첫 스킬이 나갈 때까지
  assert.equal(casts.length, 1, '여러 명이 동시에 준비돼 있어도 한 번에 하나만 발동한다');
  assert.ok(em.castLock > 0, '다음 스킬은 잠금이 풀린 뒤에');
  // 잠금이 도는 동안에는 준비된 동료가 있어도 추가 발동이 없다
  for (let i = 0; i < 8; i++) g.tick(0.05);
  assert.equal(casts.length, 1, '연출 중에는 겹치지 않는다');
  // 잠금이 풀리면 다음 스킬이 이어서 나간다
  for (const h of em.heroes) { h.skillUnlocked = true; h.skillCd = 0; }
  em.castLock = 0;
  for (let i = 0; i < 40 && casts.length < 2; i++) g.tick(0.05);
  assert.ok(casts.length >= 2, '잠금이 풀리면 다음 스킬이 나간다');
  assert.ok(casts[1].t > casts[0].t, '두 스킬은 같은 순간이 아니라 시간차를 두고 나간다');
});


// ------------------------------------------------------------ 수식 대응 --
// 전투 중 유일한 조작. 세 가지가 동시에 참이어야 의미가 있다:
// 예고 때만 문제가 나오고 · 맞히면 그 한 방이 실제로 줄고 · **안 치면 예전과 완전히 똑같다**.
const bossGame = () => {
  const g = new GameManager({ save: memSave() });
  g.state.stage = 10; g.state.maxStage = 10; g.state.maxCleared = 9;
  g.state.heroes[MAIN_ID].level = 60; g.state.challenging = true;
  for (let i = 0; i < 400 && !g.entities.boss; i++) g.tick(0.05);
  return g;
};

test('수식 대응: the formula only opens on a telegraph, and only the right answer in time counts', async () => {
  const { BALANCE } = await import('../src/config/balance.js');
  const g = bossGame();
  assert.ok(g.entities.boss, '보스가 나와야 한다');
  assert.equal(g.braceInfo().open, false, '예고 전에는 수식이 없다');
  assert.equal(g.submitBraceFormula(1), false, '수식이 없으면 제출도 없다');

  g.openBraceFormula();
  const f = g.braceInfo();
  assert.equal(f.open, true);
  assert.ok(f.a >= 10 && f.b >= 10 && f.a <= BALANCE.BRACE.max && f.b <= BALANCE.BRACE.max, '읽고 더할 만한 크기여야 한다');

  assert.equal(g.submitBraceFormula(f.a + f.b + 1), false, '틀리면 아무 일도 없다');
  assert.equal(g.entities.braced, false);

  g.openBraceFormula();
  const f2 = g.braceInfo();
  assert.equal(g.submitBraceFormula(f2.a + f2.b), true);
  assert.equal(g.entities.braced, true, '맞히면 다음 한 방이 약해진다');

  // 시간을 넘기면 맞아도 소용없다
  const g2 = bossGame();
  g2.openBraceFormula();
  g2.braceFormula.until = Date.now() - 1;
  const f3 = { a: g2.braceFormula.a, b: g2.braceFormula.b };
  assert.equal(g2.submitBraceFormula(f3.a + f3.b), false, '제한 시간을 넘기면 정답도 소용없다');
  assert.equal(g2.entities.braced, false);
});

test('수식 대응: the same special hurts less after a correct answer, and is untouched without one', async () => {
  const { BALANCE } = await import('../src/config/balance.js');
  const run = (answer) => {
    const g = bossGame();
    const em = g.entities, boss = em.boss;
    boss.def = { ...boss.def, specials: [{ every: 1, kind: 'stomp', name: '테스트', desc: 't' }] };
    for (const h of em.heroes) { h.maxHp = 1e7; h.hp = 1e7; h.trait = null; }
    if (answer) { g.openBraceFormula(); const f = g.braceInfo(); assert.equal(g.submitBraceFormula(f.a + f.b), true); }
    boss.hits = 1;
    em.__testPattern(boss, em.heroes.filter((h) => h.alive), 100);
    return em.heroes.reduce((a, h) => a + (h.maxHp - h.hp), 0);
  };
  const plain = run(false), solved = run(true);
  assert.ok(plain > 0 && solved > 0);
  assert.ok(solved < plain, `맞히면 덜 아파야 한다 (${plain} → ${solved})`);
  // 감소율은 설정값을 따라간다 (치명타 같은 변동이 있으니 넉넉한 밴드로 본다)
  const ratio = solved / plain;
  assert.ok(ratio < 1 - BALANCE.BRACE.reduce + 0.2 && ratio > 1 - BALANCE.BRACE.reduce - 0.2,
    `감소율이 설정값 근처여야 한다 (실측 ${ratio.toFixed(2)}, 기대 ${(1 - BALANCE.BRACE.reduce).toFixed(2)})`);
});

test('수식 대응: a solved formula is spent on one special, not every one', async () => {
  const g = bossGame();
  const em = g.entities, boss = em.boss;
  boss.def = { ...boss.def, specials: [{ every: 1, kind: 'stomp', name: '테스트', desc: 't' }] };
  for (const h of em.heroes) { h.maxHp = 1e7; h.hp = 1e7; }
  g.openBraceFormula(); const f = g.braceInfo(); g.submitBraceFormula(f.a + f.b);
  assert.equal(em.braced, true);
  boss.hits = 1; em.__testPattern(boss, em.heroes.filter((h) => h.alive), 100);
  assert.equal(em.braced, false, '한 번 막으면 소진된다');
});
