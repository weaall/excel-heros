import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate, SAVE_VERSION } from '../src/core/state.js';
import { SaveManager } from '../src/core/SaveManager.js';
import { MAIN_ID } from '../src/data/heroes.js';
import { BALANCE } from '../src/config/balance.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('initial state owns only the main hero, in party, as 인턴', () => {
  const s = createInitialState();
  assert.deepEqual(s.party, [MAIN_ID]);
  assert.equal(s.main.job, 'intern');
  assert.equal(Object.values(s.heroes).filter((h) => h.owned).length, 1);
});

test('migrate drops unowned party members, fills missing keys, discards pre-v2 saves', () => {
  const s = migrate({ version: SAVE_VERSION, party: ['ceo', MAIN_ID], heroes: { ceo: { owned: false } }, gold: 42 });
  assert.deepEqual(s.party, [MAIN_ID]);
  assert.equal(s.gold, 42);
  assert.ok(s.team && s.settings && s.pity && s.daily && s.main);
  assert.equal(s.heroes.ceo.enhance, 0);
  const old = migrate({ version: 1, gold: 999 });
  assert.equal(old.gold, BALANCE.STARTING_GOLD, 'v1 save discarded');
});

test('save/load roundtrip', () => {
  const sm = new SaveManager(memStorage());
  const s = createInitialState(); s.gold = 777;
  sm.save(s, 1000);
  const loaded = sm.load();
  assert.equal(loaded.gold, 777);
  assert.equal(loaded.lastSaved, 1000);
});

test('offline reward respects min window, 0.6 efficiency and 10h cap', () => {
  const s = createInitialState(0); s.lastSaved = 0; s.maxStage = 5;
  assert.equal(SaveManager.computeOffline(s, 30 * 1000, () => 10), null);
  const r = SaveManager.computeOffline(s, 20 * 3600 * 1000, () => 10);
  assert.equal(r.seconds, 10 * 3600);
  assert.ok(r.capped);
  assert.equal(r.gold, Math.floor(10 * 10 * 3600 * 0.6));
});
