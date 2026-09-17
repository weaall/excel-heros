import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { TUTORIAL, TUTORIAL_BONUS, stepById } from '../src/data/tutorial.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });

test('교육: every step is a distinct id, points at a real reward and judges without side effects', () => {
  assert.ok(TUTORIAL.length >= 5, '체크리스트가 너무 짧으면 첫 30분을 못 덮는다');
  assert.equal(new Set(TUTORIAL.map((s) => s.id)).size, TUTORIAL.length);
  const g = new GameManager({ save: memSave() });
  for (const st of TUTORIAL) {
    assert.ok(st.gems > 0, `${st.id}: 보상이 있어야 눌러 볼 이유가 생긴다`);
    assert.ok(st.title && st.text && st.target, `${st.id}: 제목·설명·가리킬 대상이 모두 있어야 한다`);
    const before = JSON.stringify(g.state);
    st.check(g);
    assert.equal(JSON.stringify(g.state), before, `${st.id}: check()는 판정만 해야 한다`);
  }
  assert.equal(stepById('nope'), null);
});

test('교육: a fresh save starts with nothing done and the first step current', () => {
  const g = new GameManager({ save: memSave() });
  const t = g.tutorialState();
  assert.equal(t.allDone, false);
  assert.equal(t.bonusPaid, false);
  assert.equal(t.hidden, false);
  assert.equal(t.current.id, TUTORIAL[0].id, '첫 항목부터 안내해야 한다');
  assert.equal(t.steps.filter((s) => s.ok).length, 0);
});

test('교육: a satisfied step pays its gems exactly once', () => {
  const g = new GameManager({ save: memSave() });
  const gems0 = g.state.gems;
  g.markTutorial('stealth'); // Esc를 눌러 본 순간
  const step = stepById('stealth');
  assert.equal(g.state.gems, gems0 + step.gems);
  assert.equal(g.tutorialState().steps.find((s) => s.id === 'stealth').ok, true);
  g.markTutorial('stealth'); g.checkTutorial(); g.checkTutorial();
  assert.equal(g.state.gems, gems0 + step.gems, '같은 항목이 두 번 보상을 주면 안 된다');
});

test('교육: finishing every step pays the completion bonus once, then the panel retires', () => {
  const g = new GameManager({ save: memSave() });
  const gems0 = g.state.gems;
  // 모든 항목을 실제로 만족시키는 대신, 판정이 참이 되는 상태를 직접 만든다
  g.state.stats.totalPulls = 10;
  g.state.stats.upgrades = 5;
  g.state.maxCleared = 3;
  for (const id of Object.keys(g.state.heroes).slice(0, 4)) { g.state.heroes[id].owned = true; }
  g.state.party = Object.keys(g.state.heroes).filter((id) => g.state.heroes[id].owned).slice(0, 3);
  const anyHero = Object.keys(g.state.heroes).find((id) => g.state.heroes[id].owned);
  g.state.heroes[anyHero].shards = 1;
  g.markTutorial('detail'); g.markTutorial('stealth');
  const t = g.tutorialState();
  assert.equal(t.allDone, true, `아직 남은 항목: ${t.steps.filter((s) => !s.ok).map((s) => s.id)}`);
  assert.equal(t.bonusPaid, true);
  const expected = TUTORIAL.reduce((a, s) => a + s.gems, 0) + TUTORIAL_BONUS;
  assert.equal(g.state.gems - gems0, expected);
  assert.equal(g.checkTutorial(), 0, '수료 뒤에는 더 지급하지 않는다');
});

test('교육: hiding is remembered across a save round-trip, and so is progress', () => {
  const g = new GameManager({ save: memSave() });
  g.markTutorial('stealth');
  g.hideTutorial(true);
  assert.equal(g.tutorialState().hidden, true);
  const s2 = migrate(JSON.parse(JSON.stringify(g.state)));
  assert.equal(s2.tutorial.hidden, true);
  assert.equal(s2.tutorial.done.stealth, true);
  assert.equal(s2.tutorial.flags.stealth, true);
  g.hideTutorial(false);
  assert.equal(g.tutorialState().hidden, false, '다시 펼 수 있어야 한다');
});

test('교육: an old save without a tutorial block still loads', () => {
  const raw = JSON.parse(JSON.stringify(createInitialState()));
  delete raw.tutorial;
  const s = migrate(raw);
  assert.deepEqual(s.tutorial.done, {});
  assert.equal(s.tutorial.bonus, false);
});
