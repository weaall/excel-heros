import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { BALANCE } from '../src/config/balance.js';
import { MAIN_ID } from '../src/data/heroes.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const own = (g, id) => { g.state.heroes[id] = { owned: true, star: 1, shards: 0, level: 1, enhance: 0, awakened: false, skillLv: 0 }; };
const H = 3600000;

test('출장: bench-only picks, slot cap, timer, rewards by grade, daily limit, party guard', () => {
  const g = new GameManager({ save: memSave() }); const D = BALANCE.DISPATCH; const t0 = Date.now();
  for (const id of ['guard', 'barista', 'cfo', 'ceo', 'courier']) own(g, id);
  g.state.party = [MAIN_ID, 'guard'];
  let info = g.dispatchInfo(t0);
  assert.equal(info.canStart, true); assert.deepEqual(info.bench.sort(), ['barista', 'ceo', 'cfo', 'courier']); assert.equal(info.left, D.maxPerDay);
  assert.equal(g.startDispatch(['guard'], t0), false, 'party members cannot go');
  assert.equal(g.startDispatch(['barista', 'cfo', 'ceo', 'courier'], t0), true, 'extra picks are trimmed to the slot cap');
  info = g.dispatchInfo(t0); assert.equal(info.heroIds.length, D.slots); assert.equal(info.active, true); assert.equal(info.done, false);
  assert.equal(info.remaining, D.hours * 3600);
  assert.equal(g.isDispatched('barista'), true); assert.equal(g.toggleParty('barista'), false, 'dispatched heroes cannot join the party');
  assert.equal(g.claimDispatch(t0 + H), null, 'not back yet');
  const gems0 = g.state.gems, cards0 = g.state.cards;
  const r = g.claimDispatch(t0 + D.hours * H + 1000);
  const expected = D.gemsBase + D.gemsPerGrade.D + D.gemsPerGrade.A + D.gemsPerGrade.S; // barista D, cfo A, ceo S
  assert.equal(r.gems, expected); assert.equal(g.state.gems, gems0 + expected); assert.equal(g.state.cards, cards0 + D.cardsPerPhase);
  assert.equal(g.affectionOf('barista').total, D.affectionXp); assert.equal(g.isDispatched('barista'), false);
  info = g.dispatchInfo(t0 + D.hours * H + 2000); assert.equal(info.active, false); assert.equal(info.left, D.maxPerDay - 1);
  assert.equal(g.startDispatch(['courier'], t0 + D.hours * H + 2000), true);
  g.claimDispatch(t0 + 2 * D.hours * H + 5000);
  assert.equal(g.dispatchInfo(t0 + 2 * D.hours * H + 5000).canStart, false, 'daily limit reached');
  const nextDay = t0 + 26 * H; assert.equal(g.dispatchInfo(nextDay).left, D.maxPerDay, 'limit resets with the date');
  g.startDispatch(['courier'], nextDay);
  const m = migrate(JSON.parse(JSON.stringify(g.state))); assert.deepEqual(m.dispatch.heroIds, ['courier']);
  g.state.heroes.courier.owned = false; const m2 = migrate(JSON.parse(JSON.stringify(g.state))); assert.deepEqual(m2.dispatch.heroIds, [], 'unowned travellers are dropped');
});
