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

// ------------------------------------------------ 죽음의 값 · 탱커의 직무 --
// 자동 부활이 있으면 탱커 하나만 키워 영원히 전진할 수 있고, 힐러도 부활 스킬도 쓸 이유가 없다.
// 죽음에 값을 붙이고, 그 대가로 탱커에게 상시 역할을 준다.
test('죽음: a downed hero stays down for the whole stage attempt', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, MAIN_ID } = await import('../src/data/heroes.js');
  const g = new GameManager({ save: memSave() });
  g.state.challenging = false;
  for (const d of HEROES.filter((h) => h.id !== MAIN_ID).slice(0, 4)) {
    Object.assign(g.state.heroes[d.id], { owned: true, star: 1, level: 20 });
    g.state.party.push(d.id);
  }
  g.entities.rebuildParty();
  for (let i = 0; i < 60 && !g.entities.monsters.length; i++) g.tick(0.1);
  const em = g.entities, down = em.heroes[1];
  down.alive = false; down.hp = 0; down.reviveT = 0;
  // 스테이지가 끝나면 전원 회복이 정상이므로, 끝나지 않게 붙잡아 둔다
  for (let i = 0; i < 300; i++) { for (const m of em.monsters) { m.hp = m.maxHp = 1e9; } g.tick(0.1); }
  assert.equal(down.alive, false, '30초가 지나도 스스로 일어나면 안 된다 — 부활 스킬만이 예외다');
  assert.ok(em.heroes.some((h) => h.alive), '나머지는 계속 싸운다');
});

test('죽음: a full wipe retreats to the last cleared stage', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const g = new GameManager({ save: memSave() });
  g.state.stage = 5; g.state.maxStage = 5; g.state.maxCleared = 4; g.state.challenging = true;
  for (let i = 0; i < 100 && !g.entities.monsters.length; i++) g.tick(0.1);
  for (const h of g.entities.heroes) { h.alive = false; h.hp = 0; }
  g.tick(0.1);
  assert.equal(g.state.stage, 4, '직전 클리어 스테이지로 후퇴한다');
  assert.equal(g.isChallenging(), false, '도전이 끝난다');
});

test('탱커: intercepts hits by chance, and a better tank intercepts more often and cheaper', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, MAIN_ID } = await import('../src/data/heroes.js');
  const { BALANCE } = await import('../src/config/balance.js');
  const tankDef = HEROES.find((x) => x.role === 'tank' && x.id !== MAIN_ID);
  const rangedDef = HEROES.find((x) => x.role === 'ranged');

  // 확률이라 한 번으로는 못 본다 — 여러 번 때려 비율을 센다
  const trial = (star, withTank, n = 400) => {
    const g = new GameManager({ save: memSave() });
    for (const d of [tankDef, rangedDef]) Object.assign(g.state.heroes[d.id], { owned: true, star, level: 30 });
    g.state.party = withTank ? [MAIN_ID, tankDef.id, rangedDef.id] : [MAIN_ID, rangedDef.id];
    g.entities.rebuildParty();
    const em = g.entities;
    const tank = em.heroes.find((h) => h.heroId === tankDef.id);
    const ranged = em.heroes.find((h) => h.heroId === rangedDef.id);
    for (const h of em.heroes) { h.maxHp = 1e9; h.hp = 1e9; h.trait = null; }
    for (let i = 0; i < n; i++) em.__testHit({ atk: 1000 }, ranged);
    return { tank: tank ? tank.maxHp - tank.hp : 0, ranged: ranged.maxHp - ranged.hp, n };
  };

  const alone = trial(1, false);
  const s1 = trial(1, true), s5 = trial(5, true);
  assert.ok(s1.tank > 0, '탱커가 가끔 가로채야 한다');
  assert.ok(s1.ranged < alone.ranged, '탱커가 있으면 아군이 덜 맞는다');
  assert.ok(s5.ranged < s1.ranged, '★이 높은 탱커일수록 더 자주 가로챈다');
  // 무조건이 아니라 확률이다 — 탱커가 있어도 아군은 상당 부분을 그대로 맞는다
  assert.ok(s1.ranged > alone.ranged * 0.4, '무조건 막아 주면 안 된다 (확률이어야 한다)');
  // 가로챈 몫은 감면되므로 파티 전체 피해는 줄어든다
  assert.ok(s5.tank + s5.ranged < alone.ranged, '파티 전체 피해는 줄어든다');
  assert.ok(BALANCE.TANK.chanceMax < 1, '가로채기 확률에 상한이 있어야 한다 — 100%면 무조건이 된다');
});

test('인사 복구: one guaranteed, extras by chance, capped — and worth far more now that death sticks', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { BALANCE } = await import('../src/config/balance.js');
  const R = BALANCE.REVIVE;

  const caster = byType('revive'); // revive 를 가진 영웅
  // 실제 측정: 파티를 채우고 여러 번 시전해 평균 복귀 인원을 센다
  const { HEROES } = await import('../src/data/heroes.js');
  const run = (star, trials = 300) => {
    let total = 0;
    for (let t = 0; t < trials; t++) {
      const g = new GameManager({ save: memSave() });
      g.state.heroes[caster.id] = { owned: true, star: 2, shards: 0, level: 40, enhance: 0 };
      const others = HEROES.filter((h) => h.id !== MAIN_ID && h.id !== caster.id).slice(0, 3);
      for (const d of others) Object.assign(g.state.heroes[d.id], { owned: true, star: 1, level: 20 });
      g.state.party = [MAIN_ID, caster.id, ...others.map((d) => d.id)];
      g.entities.rebuildParty();
      const em = g.entities;
      const h = em.heroes.find((a) => a.heroId === caster.id);
      h.star = star; // 시전자의 ★이 추가 인원 확률을 정한다
      for (const a of em.heroes) if (a !== h) { a.alive = false; a.hp = 0; }
      em.castSkill(h, null, em.monsters, em.heroes.filter((a) => a.alive));
      total += em.heroes.filter((a) => a.alive && a !== h).length;
    }
    return total / trials;
  };

  const avg1 = run(1), avg5 = run(5);
  assert.ok(avg1 >= 1, `★1도 최소 1명은 확정으로 일으켜야 한다 (평균 ${avg1.toFixed(2)})`);
  assert.ok(avg5 > avg1, `★이 높을수록 더 많이 일으킨다 (${avg1.toFixed(2)} → ${avg5.toFixed(2)})`);
  assert.ok(avg5 <= 1 + R.extraMax, `최대 인원을 넘으면 안 된다 (평균 ${avg5.toFixed(2)}, 상한 ${1 + R.extraMax})`);
});

// --------------------------------------------------- 스킬 고도화 (★ 2차 효과) --
// 지금까지 스킬은 수치 하나로만 커졌다. 이제 ★이 **성질**을 바꾼다 — 그게 중복 카드를 계속 뽑을 이유다.
// 각 스킬이 실제로 달라지는지, 그리고 화면에 그 사실이 보이는지를 함께 본다.
test('★ 효과: every skill gains a second property that grows with stars', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, MAIN_ID, SKILLS } = await import('../src/data/heroes.js');
  const { BALANCE } = await import('../src/config/balance.js');

  const cast = (type, star, prep) => {
    const def = HEROES.find((x) => x.skill.type === type);
    const g = new GameManager({ save: memSave() });
    g.state.heroes[def.id] = { owned: true, star, shards: 0, level: 40, enhance: 0 };
    g.state.party = [MAIN_ID, def.id]; g.state.stage = 3; g.state.challenging = false;
    g.entities.rebuildParty();
    for (let i = 0; i < 80 && !g.entities.monsters.length; i++) g.tick(0.1);
    const em = g.entities, h = em.heroes.find((a) => a.heroId === def.id);
    h.star = star;
    prep?.(em, h);
    em.castSkill(h, em.monsters.find((m) => m.alive) ?? null, em.monsters, em.heroes.filter((a) => a.alive));
    return { em, h };
  };

  // 지속형: ★이 오르면 길어진다
  const burn1 = cast('burn', 1).em.monsters.find((m) => m.burnT > 0)?.burnT;
  const burn5 = cast('burn', 5).em.monsters.find((m) => m.burnT > 0)?.burnT;
  assert.ok(burn5 > burn1, `화상 지속이 ★로 길어져야 한다 (${burn1} → ${burn5})`);
  assert.ok(Math.abs((burn5 - burn1) - BALANCE.SKILL_STAR.duration * 4) < 1e-6, '지속 보너스가 설정값과 맞아야 한다');

  // 연쇄: 대상 수가 늘고 감쇠가 완화된다
  const wide = (em) => { while (em.monsters.length < 8) em.monsters.push({ ...em.monsters[0], id: 900 + em.monsters.length, x: 500 + em.monsters.length * 20, alive: true }); for (const m of em.monsters) { m.hp = m.maxHp = 1e9; } };
  const links = (star) => cast('chain', star, wide).em.monsters.filter((m) => m.hp < m.maxHp).length;
  assert.ok(links(5) > links(1), `연쇄 대상이 ★로 늘어야 한다 (${links(1)} → ${links(5)})`);

  // 필살기 기절: ★이 오르면 길어진다 (죽지 않게 HP를 올려 둔다)
  const tough = (em) => { for (const m of em.monsters) { m.hp = m.maxHp = 1e12; } };
  const stun = (star) => Math.max(0, ...cast('ult', star, tough).em.monsters.map((m) => m.stun ?? 0));
  assert.ok(stun(5) > stun(1), `기절이 ★로 길어져야 한다 (${stun(1)} → ${stun(5)})`);

  // 수치형 두 가지는 공식이 곧 결과다
  const S = BALANCE.SKILL_STAR;
  assert.ok(S.execThreshold > 0 && S.drainLeech > 0, '처형 기준과 흡혈 비율도 ★로 올라야 한다');
});

test('★ 효과: the detail panel tells the player what their stars actually did', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, SKILLS } = await import('../src/data/heroes.js');
  const { starSkillNote } = await import('../src/data/manual.js');
  const { BALANCE } = await import('../src/config/balance.js');
  const g = new GameManager({ save: memSave() });

  // ★1 에는 추가 효과가 없고, ★2부터 문구가 생긴다
  for (const type of Object.keys(SKILLS)) {
    assert.equal(starSkillNote(type, 1, BALANCE.SKILL_STAR), '', `${type}: ★1에는 추가 효과가 없어야 한다`);
    assert.ok(starSkillNote(type, 3, BALANCE.SKILL_STAR).length > 0, `${type}: ★3 문구가 없다 — 고도화가 빠진 스킬`);
  }
  // heroView 가 그 문구를 실어 보낸다
  const def = HEROES.find((h) => h.skill.type === 'chain');
  Object.assign(g.state.heroes[def.id], { owned: true, star: 4, level: 20 });
  const v = g.heroView(def.id);
  assert.equal(v.skillStarNote, starSkillNote('chain', 4, BALANCE.SKILL_STAR));
  assert.match(v.skillStarNote, /대상/);
});

// ------------------------------------------------- 역할 상시 효과 · 특성 ★ --
// 탱커만 상시 정체성이 있으면 나머지 셋은 스킬로만 구분된다. 넷 다 늘 일해야 파티를 짤 때 역할을 본다.
test('역할: all four roles do something permanently, and all of it scales with stars', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, MAIN_ID } = await import('../src/data/heroes.js');
  const { BALANCE } = await import('../src/config/balance.js');

  const party = (role, star) => {
    const d = HEROES.find((h) => h.role === role && h.id !== MAIN_ID);
    const g = new GameManager({ save: memSave() });
    Object.assign(g.state.heroes[d.id], { owned: true, star, level: 30 });
    g.state.party = [MAIN_ID, d.id]; g.state.stage = 3; g.state.challenging = false;
    g.entities.rebuildParty();
    for (let i = 0; i < 80 && !g.entities.monsters.length; i++) g.tick(0.1);
    return { g, em: g.entities, h: g.entities.heroes.find((a) => a.heroId === d.id) };
  };

  // 힐러: 파티 전원 상시 회복, ★로 커진다
  const aura1 = party('healer', 1).em.healerAura, aura5 = party('healer', 5).em.healerAura;
  assert.ok(aura1 > 0, '힐러가 있으면 상시 회복이 있어야 한다');
  assert.ok(aura5 > aura1, `★로 커져야 한다 (${aura1} → ${aura5})`);

  // 근접: 처치하면 자신만 빨라진다
  const melee = (star) => {
    const { em, h } = party('melee', star);
    h.star = star;
    const m = em.monsters.find((x) => x.alive); m.hp = 1;
    em.__testHeroHit(h, m);
    return h.meleeRush?.mult ?? 1;
  };
  assert.ok(melee(1) > 1, '처치하면 기세가 붙어야 한다');
  assert.ok(melee(5) > melee(1), `기세도 ★로 커진다 (${melee(1)} → ${melee(5)})`);

  // 원거리: 확률로 뒤쪽 적까지 관통 — 확률이므로 여러 번 굴린다
  const pierceRate = (star, n = 500) => {
    const { em, h } = party('ranged', star);
    h.star = star;
    let hit = 0;
    for (let i = 0; i < n; i++) {
      for (const m of em.monsters) { m.hp = m.maxHp = 1e9; m.alive = true; }
      const sorted = em.monsters.slice().sort((a, b) => a.x - b.x);
      if (sorted.length < 2) return null;
      em.__testHeroHit(h, sorted[0]);
      if (sorted[1].hp < sorted[1].maxHp) hit++;
    }
    return hit / n;
  };
  const p1 = pierceRate(1), p5 = pierceRate(5);
  if (p1 !== null) {
    assert.ok(p1 > 0, '원거리는 가끔 관통해야 한다');
    assert.ok(p5 > p1, `관통 확률도 ★로 커진다 (${p1} → ${p5})`);
    assert.ok(p5 < 1, '항상 관통하면 안 된다');
  }
  assert.ok(BALANCE.ROLE_PASSIVE.healer && BALANCE.ROLE_PASSIVE.melee && BALANCE.ROLE_PASSIVE.ranged, '세 역할 모두 수치가 있어야 한다');
});

test('특성: passive trait values scale with stars, in and out of combat', async () => {
  const { createInitialState } = await import('../src/core/state.js');
  const { GameManager } = await import('../src/core/GameManager.js');
  const { HEROES, MAIN_ID } = await import('../src/data/heroes.js');
  const { BALANCE } = await import('../src/config/balance.js');

  const d = HEROES.find((h) => h.trait === 'greedy' && h.id !== MAIN_ID);
  const gold = (star) => {
    const g = new GameManager({ save: memSave() });
    Object.assign(g.state.heroes[d.id], { owned: true, star, level: 20 });
    g.state.party = [MAIN_ID, d.id]; g.entities.rebuildParty();
    return { sum: g.partyTraitSum('greedy'), mult: g.goldMult() };
  };
  const a = gold(1), b = gold(5);
  assert.ok(b.sum > a.sum, `특성 합계가 ★로 커져야 한다 (${a.sum} → ${b.sum})`);
  assert.ok(b.mult > a.mult, `전투 밖(골드)에서도 ★이 반영되어야 한다 (${a.mult} → ${b.mult})`);
  // 인원수만 세던 옛 방식이면 ★이 달라도 값이 같다 — 그 회귀를 막는다
  assert.ok(Math.abs(b.sum - a.sum) > 1e-6);
  assert.ok(BALANCE.TRAIT_STAR.perStar > 0);
});
