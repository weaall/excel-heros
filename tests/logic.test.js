// Pass 15: forecast + safe auto-advance, elite affixes, targeting, 10-pull guarantee, quest rotation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { BALANCE } from '../src/config/balance.js';
import { MAIN_ID, HEROES } from '../src/data/heroes.js';
import { AFFIXES, asElite, MONSTER_TYPES } from '../src/data/monsters.js';
import { pullOnce, initialPity } from '../src/core/GachaManager.js';
import { dailyQuestIds, DAILY_COUNT, QUEST_BY_ID } from '../src/data/quests.js';
import * as Q from '../src/core/QuestManager.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const run = (g, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) g.tick(step); };

test('forecast rises with party strength and is stricter for boss stages', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  const weak = g.challengeForecast(10).prob;
  g.state.heroes[MAIN_ID].level = 40; g.entities.refreshHeroStats();
  const strong = g.challengeForecast(10).prob;
  assert.ok(strong > weak, `forecast ${weak} -> ${strong}`);
  assert.ok(g.challengeForecast(5).prob >= g.challengeForecast(10).prob, 'normal stage at least as easy as the boss stage after it');
  const f = g.challengeForecast(10); assert.ok(f.boss && f.bossTime > 0 && ['유리', '접전', '불리'].includes(f.label));
  assert.equal(g.challengeForecast(200).prob, 0);
});

// 승산은 97%의 시간 '유리'라 정보가 아니다 — 리본이 실제로 읽히는 숫자는 **예상 소요**다(6-117).
test('forecast reports a finite clear estimate that grows as the stage gets harder', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  g.state.heroes[MAIN_ID].level = 40; g.entities.refreshHeroStats();
  const a = g.challengeForecast(5), b = g.challengeForecast(25);
  for (const f of [a, b]) { assert.ok(Number.isFinite(f.eta) && f.eta > 0, `예상 소요가 유한한 양수여야 한다 (${f.eta})`); }
  assert.ok(b.eta > a.eta, `깊은 단계가 더 오래 걸려야 한다 (${a.eta.toFixed(1)}초 → ${b.eta.toFixed(1)}초)`);
  // 파티가 세지면 예상도 줄어든다 — 이게 깨지면 리본 숫자가 거짓말을 한다
  const before = g.challengeForecast(25).eta;
  g.state.heroes[MAIN_ID].level = 80; g.entities.refreshHeroStats();
  assert.ok(g.challengeForecast(25).eta < before, '강해지면 예상 소요가 줄어야 한다');
});

test('safe auto-advance waits while the forecast is bad and resumes after upgrades', () => {
  // 재는 것은 **문턱의 규칙**이다: 승산이 낮으면 보스에 들어가지 않고, 강해지면 스스로 들어간다.
  // 예전엔 9단계를 20마리 처리할 때까지 600초를 돌려 그 상태를 만들었는데, 적이 3배 빨라진 뒤로는
  // 혼자 있는 레벨 22가 **전멸하기도 한다** — 그러면 8단계로 후퇴해 영영 9를 못 깬다. 시뮬레이션으로
  // 상태를 만들지 말고 **결정 시점에서 시작한다.**
  const s = createInitialState(); s.stage = 9; s.maxStage = 9; s.maxCleared = 9; s.challenging = false; s.heroes[MAIN_ID].level = 22;
  const g = new GameManager({ state: s, save: memSave() });
  assert.ok(g.challengeForecast(10).prob < BALANCE.SAFE_ADVANCE.min, 'boss 1-10 forecast is bad for a lone lv22 main');
  g.setAutoAdvance(true);
  assert.equal(g.state.challenging, false, '승산이 낮으면 보스에 들어가지 않는다');
  assert.equal(g.waitingAdvance, true); assert.equal(g.state.settings.autoAdvance, true);
  run(g, 10);
  assert.equal(g.state.stage, 9, '기다리는 동안 9단계에 머문다');

  g.state.heroes[MAIN_ID].level = 45; g.state.gold = 0; g.entities.refreshHeroStats();
  assert.ok(g.challengeForecast(10).prob >= BALANCE.SAFE_ADVANCE.min, '레벨 45면 승산이 문턱을 넘는다');
  // 재개 판정은 2초마다 돈다 — 한 번은 반드시 돌도록 넉넉히 돌린다
  run(g, 6);
  assert.ok(g.state.maxStage >= 10, `강해지면 스스로 보스에 들어간다 (maxStage=${g.state.maxStage})`);
  assert.equal(g.waitingAdvance, false, '대기가 풀린다');
});

test('elite affixes: every affix is applied at spawn; shield soaks damage first; volatile explodes', () => {
  assert.equal(AFFIXES.length, 5);
  const base = MONSTER_TYPES[0];
  assert.equal(asElite(base, 0).affix.id, 'fast'); assert.equal(asElite(base, 0.99).affix.id, 'shield');
  assert.ok(asElite(base, 0.5).name.startsWith('엘리트 '));
  const s = createInitialState(); s.stage = 12; s.maxStage = 12; s.maxCleared = 12; s.challenging = false; s.heroes[MAIN_ID].level = 25;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.3);
  const em = g.entities; const m = em.monsters.find((x) => x.alive && !x.def.chest);
  const shielded = { ...m.def, elite: true, affix: AFFIXES.find((a) => a.id === 'shield'), name: 'x' };
  m.def = shielded; m.elite = true; m.shield = Math.floor(m.maxHp * 0.5); m.x = 470; m.arrived = true;
  const hp0 = m.hp;
  run(g, 0.6);
  assert.ok(m.shield < Math.floor(hp0 * 0.5) || m.hp < hp0 || !m.alive, 'shield or hp went down');
  const s2 = createInitialState(); s2.heroes[MAIN_ID].level = 5; s2.challenging = false;
  const g2 = new GameManager({ state: s2, save: memSave() });
  run(g2, 1.3);
  const v = g2.entities.monsters.find((x) => x.alive);
  v.def = { ...v.def, elite: true, affix: AFFIXES.find((a) => a.id === 'volatile'), name: 'v' }; v.elite = true; v.hp = 1; v.x = 470; v.arrived = true; v.atk = 5;
  let hurt = 0; g2.on('sfx', (n) => { if (n === 'hurt') hurt++; });
  run(g2, 3);
  assert.equal(v.alive, false); assert.ok(hurt >= 1, 'explosion hurt the front hero');
});

test('ranged heroes focus the boss, then elites, then the weakest monster; melee take the nearest arrived', () => {
  const s = createInitialState(); s.heroes.parttime = { owned: true, star: 1, shards: 0, level: 30, enhance: 0 }; s.party = [MAIN_ID, 'parttime']; s.heroes[MAIN_ID].level = 1; s.challenging = false;
  const g = new GameManager({ state: s, save: memSave() });
  run(g, 1.3);
  const em = g.entities; const ms = em.monsters.filter((m) => m.alive);
  assert.ok(ms.length >= 3);
  for (const m of ms) { m.x = 500 + Math.random() * 100; m.arrived = true; m.hp = m.maxHp = 10000; }
  ms[1].hp = 100; // weakest
  for (const h of em.heroes) h.targetId = null;
  g.tick(0.05);
  const ranged = em.heroes.find((h) => h.role === 'ranged');
  assert.equal(ranged.targetId, ms[1].id, 'ranged picks the nearly-dead monster');
  ms[2].elite = true;
  ranged.targetId = null; g.tick(0.05);
  assert.equal(ranged.targetId, ms[2].id, 'elite outranks the weak one');
});

test('a 10-pull always contains at least one A, and pulls still respect pity', () => {
  const rngD = { next: () => 0, int: () => 5, pick: (a) => a[0] };
  const s = createInitialState(); s.gems = 100000;
  const g = new GameManager({ state: s, save: memSave(), rng: rngD });
  const res = g.pull(10);
  assert.equal(res.length, 10);
  assert.ok(res.some((r) => ['A', 'S'].includes(r.grade)), 'guaranteed A+');
  assert.ok(res[9].guaranteed, 'the last slot was forced');
  assert.equal(g.state.pity.sinceA, 0);
  const one = pullOnce(initialPity(), {}, rngD, 'A');
  assert.equal(one.grade, 'A'); assert.equal(one.pity.sinceA, 0);
  const single = g.pull(1); assert.equal(single[0].grade, 'D', 'single pulls are not boosted');
});

test('daily quests rotate by date: kills always included, DAILY_COUNT unique ids, deterministic', () => {
  const a = dailyQuestIds('2026-09-14'), b = dailyQuestIds('2026-09-14'), c = dailyQuestIds('2026-09-15');
  assert.deepEqual(a, b); assert.equal(a.length, DAILY_COUNT); assert.equal(a[0], 'kills'); assert.equal(new Set(a).size, DAILY_COUNT);
  assert.ok(a.every((id) => QUEST_BY_ID[id]));
  const days = Array.from({ length: 30 }, (_, i) => dailyQuestIds(`2026-10-${String(i + 1).padStart(2, '0')}`).join());
  assert.ok(new Set(days).size > 3, 'different days get different lists');
  assert.ok(a.join() !== c.join() || days.length, 'rotation exists');
  const s = createInitialState(); assert.deepEqual(s.daily.quests, dailyQuestIds(s.daily.date));
  const inactive = Object.keys(QUEST_BY_ID).find((id) => !s.daily.quests.includes(id));
  if (inactive) { Q.addProgress(s, inactive, 999); assert.equal(Q.claimQuest(s, inactive), null, 'inactive quests cannot be claimed'); }
  const m = migrate({ ...JSON.parse(JSON.stringify(s)), daily: { ...s.daily, quests: undefined } });
  assert.deepEqual(m.daily.quests, dailyQuestIds(s.daily.date));
  const t0 = new Date(2026, 8, 14, 12).getTime(); const st = createInitialState(t0);
  Q.ensureDaily(st, t0 + 86400000);
  assert.deepEqual(st.daily.quests, dailyQuestIds('2026-09-15'));
});

test('combo quest hook fires at 20 hits', () => {
  const g = new GameManager({ state: createInitialState(), save: memSave() });
  g.state.daily.quests = ['kills', 'combo'];
  g.onCombo(19); assert.equal(Q.questProgress(g.state, 'combo'), 0);
  g.onCombo(20); assert.equal(Q.questProgress(g.state, 'combo'), 1);
});

test('승산은 지금 싸울 파티로 계산한다 — 쓰러진 사원과 깎인 체력을 센다', () => {
  const g = new GameManager({ save: memSave() });
  for (const role of ['tank', 'healer', 'ranged']) {
    const d = HEROES.find((h) => h.role === role && h.id !== MAIN_ID);
    Object.assign(g.state.heroes[d.id], { owned: true, star: 3, level: 40, shards: 0, enhance: 0 });
    g.state.party.push(d.id);
  }
  g.entities.rebuildParty();
  const full = g.fightingParty();
  assert.equal(full.count, g.state.party.length, '전원 살아 있으면 전원을 센다');
  const before = g.challengeForecast(12);

  // 체력이 깎이면 승산이 내려간다 — 최대 체력으로 재면 여기서 아무 일도 안 일어난다
  for (const h of g.entities.heroes) h.hp = Math.max(1, Math.round(h.maxHp * 0.2));
  const hurt = g.challengeForecast(12);
  assert.ok(g.fightingParty().hp < full.hp, '깎인 체력이 반영된다');
  assert.ok(hurt.prob <= before.prob, '피가 빠진 파티는 승산이 높아질 수 없다');

  // 쓰러진 사원은 화력에서도 빠진다
  const victim = g.entities.heroes.at(-1);
  victim.alive = false;
  const down = g.fightingParty();
  assert.equal(down.count, full.count - 1, '쓰러진 사원은 세지 않는다');
  assert.ok(down.dps < full.dps, '쓰러진 사원의 화력은 빠진다');
  assert.ok(g.challengeForecast(12).prob <= hurt.prob, '한 명 빠지면 승산이 더 낮아진다');
});

test('벽 판정은 재정비한 파티로 한다 — 이가 빠진 건 벽이 아니라 상처다', () => {
  const g = new GameManager({ save: memSave() });
  for (const role of ['tank', 'healer', 'ranged', 'melee']) {
    const d = HEROES.find((h) => h.role === role && h.id !== MAIN_ID);
    Object.assign(g.state.heroes[d.id], { owned: true, star: 3, level: 60, shards: 0, enhance: 0 });
    g.state.party.push(d.id);
  }
  g.entities.rebuildParty();
  const healthy = g.challengeForecast(8);
  assert.ok(healthy.prob >= BALANCE.SAFE_ADVANCE.min, '멀쩡한 파티는 8단계를 넘을 수 있다');

  // 절반이 쓰러지고 나머지도 피가 빠진 상태
  g.entities.heroes.forEach((h, i) => { if (i % 2) h.alive = false; else h.hp = 1; });
  assert.ok(g.challengeForecast(8).prob < healthy.prob, '지금 승산은 떨어진다 — 이 전투를 시작할지의 답');
  assert.equal(
    g.challengeForecast(8, { regrouped: true }).prob, healthy.prob,
    '재정비 승산은 그대로다 — 여기가 벽인지의 답은 상처와 무관하다',
  );
  const rg = g.fightingParty({ regrouped: true });
  assert.equal(rg.count, g.state.party.length, '재정비하면 전원이 돌아온다');
  assert.ok(rg.hp > g.fightingParty().hp, '재정비하면 체력도 만피');
});
