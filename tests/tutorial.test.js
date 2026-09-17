import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { TUTORIAL, TUTORIAL_BONUS, stepById } from '../src/data/tutorial.js';
import { HEROES } from '../src/data/heroes.js';

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

// ------------------------------------------------------------- 잠긴 골드 --
// "D를 230레벨까지 올린 골드가 아깝다"에 대한 답: 아깝지 않다는 걸 코드가 보증해야 한다.
// 레벨 비용은 등급과 무관하게 레벨에만 달려 있고 환급이 100%이므로, 낮은 등급에 넣은 골드는 손실 없이 옮겨진다.
test('잠긴 골드: benchGold counts only reclaimable cards and reclaim returns every coin', () => {
  const g = new GameManager({ save: memSave() });
  g.state.gold = 1e9;
  const owned = Object.keys(g.state.heroes).filter((id) => !g.isMain(id)).slice(0, 4);
  for (const id of owned) { g.state.heroes[id].owned = true; g.state.heroes[id].star = 3; }
  const [inParty, benched, fav, plain] = owned;
  g.state.party = [...g.state.party.filter((id) => g.isMain(id)), inParty];
  g.state.favorites = { [fav]: true };
  for (const id of owned) g.upgradeHeroMany(id, 12);

  const locked = g.benchGold();
  assert.equal(locked.heroes, 2, '파티원과 즐겨찾기는 잠긴 골드로 세지 않는다');
  assert.ok(locked.gold > 0);
  assert.equal(locked.gold, g.levelGold(benched) + g.levelGold(plain));

  const gold0 = g.state.gold;
  const got = g.reclaimBenchLevels();
  assert.equal(got.gold, locked.gold, '표시한 만큼 정확히 돌아온다');
  assert.equal(g.state.gold, gold0 + locked.gold);
  assert.equal(g.state.heroes[benched].level, 1);
  assert.ok(g.state.heroes[inParty].level > 1, '싸우는 카드는 건드리지 않는다');
  assert.ok(g.state.heroes[fav].level > 1, '즐겨찾기도 건드리지 않는다');
  assert.deepEqual(g.benchGold(), { gold: 0, heroes: 0 });
});

test('잠긴 골드: a level costs the same on a D and on an S, so moving gold between grades is lossless', () => {
  const g = new GameManager({ save: memSave() });
  g.state.gold = 1e12;
  const d = HEROES.find((h) => h.grade === 'D' && !g.isMain(h.id));
  const s = HEROES.find((h) => h.grade === 'S');
  for (const h of [d, s]) { g.state.heroes[h.id].owned = true; g.state.heroes[h.id].star = 3; }
  g.upgradeHeroMany(d.id, 30);
  g.upgradeHeroMany(s.id, 30);
  assert.equal(g.levelGold(d.id), g.levelGold(s.id), '레벨 값은 등급이 아니라 레벨만 본다 — 그래서 옮겨도 손해가 없다');
});
