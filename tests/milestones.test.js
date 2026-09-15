// Pass 17: milestones, profiles, card art fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { MILESTONES, milestoneValue } from '../src/data/milestones.js';
import * as M from '../src/core/MilestoneManager.js';
import { PROFILES } from '../src/data/profiles.js';
import { HEROES, MAIN_ID } from '../src/data/heroes.js';
import { cardArt, loadCardArt } from '../src/data/cardArt.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });

test('milestone table: unique ids, positive rewards, ascending targets per kind', () => {
  assert.equal(new Set(MILESTONES.map((m) => m.id)).size, MILESTONES.length);
  for (const kind of ['stage', 'level', 'party']) {
    const list = MILESTONES.filter((m) => m.kind === kind); assert.ok(list.length >= 5, kind);
    for (let i = 1; i < list.length; i++) assert.ok(list[i].target > list[i - 1].target, `${kind} ascending`);
    for (const m of list) assert.ok(m.reward.gems > 0, m.id);
  }
  const boss = MILESTONES.find((m) => m.id === 'stage10'), normal = MILESTONES.find((m) => m.id === 'stage5');
  assert.ok(boss.reward.gems > normal.reward.gems && boss.reward.cards > normal.reward.cards, 'boss floors pay more');
});

test('milestones are granted once when reached, survive migration and prestige', () => {
  const s = createInitialState(); s.maxCleared = 12; s.heroes[MAIN_ID].level = 25;
  const g = new GameManager({ state: s, save: memSave() });
  const gems0 = g.state.gems, cards0 = g.state.cards;
  let events = 0; g.on('milestone', () => events++);
  const granted = g.checkMilestones();
  const ids = granted.map((x) => x.milestone.id);
  assert.ok(ids.includes('stage5') && ids.includes('stage10') && ids.includes('mainlv10') && ids.includes('mainlv20'), ids.join());
  assert.ok(!ids.includes('stage15') && !ids.includes('mainlv30'));
  assert.equal(events, granted.length);
  assert.ok(g.state.gems > gems0 && g.state.cards > cards0);
  assert.equal(g.checkMilestones().length, 0, 'no double grant');
  assert.equal(M.upcoming(g.state).find((m) => m.kind === 'stage').id, 'stage15');
  assert.equal(milestoneValue(g.state, MILESTONES.find((m) => m.kind === 'party')), 25);
  const m = migrate(JSON.parse(JSON.stringify(g.state)));
  assert.equal(m.milestones.stage10, true);
  g.state.maxCleared = 40; g.prestige();
  assert.equal(g.state.milestones.stage10, true, 'kept through prestige');
  assert.equal(g.state.maxCleared, 0);
});

test('milestones fire from the game loop after a clear', () => {
  const s = createInitialState(); s.stage = 5; s.maxStage = 5; s.maxCleared = 4; s.challenging = true; s.heroes[MAIN_ID].level = 30;
  const g = new GameManager({ state: s, save: memSave() });
  let hit = null; g.on('milestone', ({ milestone }) => { if (milestone.id === 'stage5') hit = milestone; });
  for (let t = 0; t < 120 && !hit; t += 0.05) g.tick(0.05);
  assert.ok(hit, 'stage5 milestone granted after clearing 1-5');
});

test('every hero (and the main hero) has a profile with nickname, dept, bio and lines', () => {
  for (const h of [...HEROES.map((x) => x.id), 'main']) {
    const p = PROFILES[h]; assert.ok(p, `profile for ${h}`);
    for (const k of ['nick', 'dept', 'bio', 'line', 'ult']) assert.ok(typeof p[k] === 'string' && p[k].length > 1, `${h}.${k}`);
    assert.ok(['M', 'F'].includes(p.gender), `${h} gender`);
  }
  assert.ok(Object.values(PROFILES).filter((p) => p.gender === 'F').length >= 12, 'a good share of female characters');
});

test('card art is optional: without a DOM nothing loads and lookups return null', async () => {
  assert.equal(await loadCardArt(), 0);
  assert.equal(cardArt('ceo'), null);
});

test('favorites toggle, sort first, and persist through migration', () => {
  const s = createInitialState(); s.heroes.guard = { owned: true, star: 1, shards: 0, level: 1, enhance: 0 };
  const g = new GameManager({ state: s, save: memSave() });
  assert.equal(g.isFavorite('guard'), false);
  assert.equal(g.toggleFavorite('guard'), true); assert.equal(g.isFavorite('guard'), true);
  const m = migrate(JSON.parse(JSON.stringify(g.state))); assert.equal(m.favorites.guard, true);
  assert.equal(g.toggleFavorite('guard'), false);
});
