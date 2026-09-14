import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { STARTER_HERO } from '../src/data/heroes.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('initial state owns only the starter hero in party', () => {
  const s = createInitialState();
  assert.deepEqual(s.party, [STARTER_HERO]);
  assert.equal(Object.values(s.heroes).filter((h) => h.owned).length, 1);
});

test('migrate drops unowned party members and fills missing keys', () => {
  const s = migrate({ party: ['ceo', STARTER_HERO], heroes: { ceo: { owned: false } }, gold: 42 });
  assert.deepEqual(s.party, [STARTER_HERO]);
  assert.equal(s.gold, 42);
  assert.ok(s.team && s.settings && s.pity);
});

test('save/load roundtrip', () => {
  const sm = new SaveManager(memStorage());
  const s = createInitialState(); s.gold = 777;
  sm.save(s, 1000);
  const loaded = sm.load();
  assert.equal(loaded.gold, 777);
  assert.equal(loaded.lastSaved, 1000);
});

test('offline reward respects min window and 12h cap', () => {
  const s = createInitialState(0); s.lastSaved = 0; s.maxStage = 5;
  assert.equal(SaveManager.computeOffline(s, 30 * 1000, () => 10), null);
  const r = SaveManager.computeOffline(s, 20 * 3600 * 1000, () => 10);
  assert.equal(r.seconds, 12 * 3600);
  assert.ok(r.capped);
  assert.equal(r.gold, Math.floor(10 * 12 * 3600 * 0.8));
});
