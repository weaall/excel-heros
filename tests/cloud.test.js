import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { checkSave, goldInLevels, boardEntry, boardScore } from '../src/core/plausibility.js';
import { CloudSync } from '../src/core/CloudSync.js';
import worker from '../backend/worker.js';
import { BALANCE, upgradeCost } from '../src/config/balance.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const DAY = 86400000;

/** A legit-looking save: 3 days old, 6 hours played, stage 25 cleared with matching kills and gold. */
function legitSave(now) {
  const s = createInitialState(now - 3 * DAY);
  s.maxCleared = 25; s.maxStage = 26; s.stage = 26;
  s.stats.playSeconds = 6 * 3600; s.stats.totalKills = 25 * 20 + 3000; s.stats.bossKills = 2; s.stats.totalGold = 5e6; s.stats.totalPulls = 40;
  s.gems = 900; s.heroes.main.level = 60;
  return s;
}

test('plausibility: a normal save passes, tampered saves are named by reason', () => {
  const now = Date.now(); const s = legitSave(now);
  assert.deepEqual(checkSave(s, now), { ok: true, reasons: [] });
  const gems = legitSave(now); gems.gems = 999999; assert.ok(checkSave(gems, now).reasons.includes('gems exceed plausible income'));
  const lv = legitSave(now); lv.heroes.main.level = 400; assert.ok(checkSave(lv, now).reasons.includes('hero levels exceed gold earned'));
  const stage = legitSave(now); stage.maxCleared = 300; assert.ok(checkSave(stage, now).reasons.includes('stage progress exceeds kills'));
  const time = legitSave(now); time.stats.playSeconds = 30 * DAY / 1000; assert.ok(checkSave(time, now).reasons.includes('playSeconds exceeds account age'));
  const kills = legitSave(now); kills.stats.totalKills = 1e9; assert.ok(checkSave(kills, now).reasons.includes('kills exceed play time'));
  assert.equal(checkSave(null).ok, false); assert.equal(checkSave({ version: 1 }).ok, false);
  // goldInLevels is the cumulative upgrade cost of held levels
  const g = createInitialState(); g.heroes.main.level = 5;
  assert.equal(goldInLevels(g), upgradeCost(1) + upgradeCost(2) + upgradeCost(3) + upgradeCost(4));
});

test('plausibility: a real headless run stays inside the bounds', () => {
  const g = new GameManager({ save: memSave() });
  for (let i = 0; i < 6000; i++) g.tick(0.1); // 10 minutes of simulated play
  g.state.stats.playSeconds = Math.max(g.state.stats.playSeconds, 600);
  const r = checkSave(g.state, Date.now() + 700 * 1000);
  assert.deepEqual(r.reasons, []);
});

test('board entry and score: shares outrank stages, stages outrank dps', () => {
  const s = createInitialState(); s.maxCleared = 40; s.prestige = { shares: 2, count: 1 };
  const e = boardEntry(s, '김인턴이름이너무길어서잘립니다정말로', 1234.6);
  assert.equal(e.name.length, 16); assert.equal(e.dps, 1235); assert.equal(e.shares, 2);
  assert.ok(boardScore({ shares: 1, maxCleared: 5 }) > boardScore({ shares: 0, maxCleared: 200, dps: 1e12 }));
  assert.ok(boardScore({ shares: 0, maxCleared: 6, dps: 1 }) > boardScore({ shares: 0, maxCleared: 5, dps: 1e12 }));
  assert.equal(boardEntry(s, '').name, '익명 사원');
});

// ---- Worker with an in-memory stand-in for D1 (only the SQL shapes worker.js uses) --------------------------
function fakeDB() {
  const t = { devices: new Map(), saves: new Map(), board: new Map(), ads: [] };
  const stmt = (sql) => { const bound = (...a) => ({
    async first() {
      if (sql.startsWith('SELECT secret_hash FROM devices')) return t.devices.get(a[0]) ?? null;
      if (sql.startsWith('SELECT save, updated_at FROM saves')) return t.saves.get(a[0]) ?? null;
      if (sql.startsWith('SELECT COUNT(*) AS n FROM board WHERE score >')) return { n: [...t.board.values()].filter((r) => r.score > a[0]).length };
      if (sql.startsWith('SELECT COUNT(*) AS n FROM board')) return { n: t.board.size };
      if (sql.startsWith('SELECT COUNT(*) AS n FROM ad_views')) return { n: t.ads.filter((x) => x.id === a[0] && x.at > a[1]).length };
      if (sql.startsWith('SELECT name, max_cleared')) return t.board.get(a[0]) ?? null;
      throw new Error('fake first: ' + sql);
    },
    async run() {
      if (sql.startsWith('INSERT INTO devices')) t.devices.set(a[0], { secret_hash: a[1] });
      else if (sql.startsWith('INSERT INTO saves')) t.saves.set(a[0], { save: a[1], updated_at: a[2] });
      else if (sql.startsWith('INSERT INTO board')) t.board.set(a[0], { id: a[0], name: a[1], max_cleared: a[2], shares: a[3], prestige: a[4], dps: a[5], play_seconds: a[6], collection: a[7], score: a[8], updated_at: a[9] });
      else if (sql.startsWith('INSERT INTO ad_views')) t.ads.push({ id: a[0], kind: a[1], at: a[2] });
      else throw new Error('fake run: ' + sql);
      return { success: true };
    },
    async all() { if (sql.startsWith('SELECT id, name, max_cleared')) return { results: [...t.board.values()].sort((x, y) => y.score - x.score).slice(0, a[0]) }; throw new Error('fake all: ' + sql); },
  }); return { bind: bound, ...bound() }; }; // D1 allows .first()/.run() without .bind()
  return { prepare: stmt, tables: t };
}
const call = (env, path, init = {}, id = 'device-aaaaaaaa', secret = 'secret-secret-secret-1') => worker.fetch(new Request(`https://api.test${path}`, { ...init, headers: { 'content-type': 'application/json', 'x-eh-id': id, 'x-eh-secret': secret, ...(init.headers ?? {}) } }), env);

test('worker: ping, save round-trip with auth, plausibility rejection, board, ad audit', async () => {
  const env = { DB: fakeDB(), ALLOW_ORIGIN: 'https://weaall.github.io' };
  const ping = await call(env, '/v1/ping'); assert.equal(ping.status, 200); assert.equal((await ping.json()).ok, true);
  assert.equal(ping.headers.get('access-control-allow-origin'), 'https://weaall.github.io');
  assert.equal((await call(env, '/v1/save')).status, 404, 'unknown device before first upload');
  const now = Date.now(); const save = legitSave(now);
  const put = await call(env, '/v1/save', { method: 'PUT', body: JSON.stringify({ save, name: '김인턴', dps: 4321 }) });
  assert.equal(put.status, 200); const putBody = await put.json(); assert.equal(putBody.ok, true);
  assert.equal((await call(env, '/v1/save', {}, 'device-aaaaaaaa', 'wrong-secret-wrong-secret')).status, 403);
  const got = await (await call(env, '/v1/save')).json(); assert.equal(got.save.maxCleared, 25);
  const bad = legitSave(now); bad.gems = 1e9;
  const rej = await call(env, '/v1/save', { method: 'PUT', body: JSON.stringify({ save: bad }) });
  assert.equal(rej.status, 422); assert.ok((await rej.json()).check.reasons.length);
  const other = legitSave(now); other.maxCleared = 24; other.stats.totalKills = 24 * 20 + 3000;
  assert.equal((await call(env, '/v1/save', { method: 'PUT', body: JSON.stringify({ save: other, name: '박사원' }) }, 'device-bbbbbbbb', 'another-secret-another-1')).status, 200);
  const board = await (await call(env, '/v1/board?limit=10')).json();
  assert.equal(board.total, 2); assert.equal(board.rows[0].name, '김인턴'); assert.equal(board.rows[0].me, true); assert.equal(board.rows[1].rank, 2);
  const ad = await (await call(env, '/v1/ad', { method: 'POST', body: JSON.stringify({ kind: 'reward' }) })).json(); assert.equal(ad.count, 1);
  assert.equal((await call(env, '/v1/nope')).status, 404);
  assert.equal((await worker.fetch(new Request('https://api.test/v1/save', { method: 'OPTIONS' }), env)).status, 204);
});

test('CloudSync: off without a URL, pushes through fetch with device headers, surfaces server rejection', async () => {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url, init }); if (url.endsWith('/v1/ping')) return { ok: true, json: async () => ({ ok: true }) }; if (init.method === 'PUT') return { ok: true, json: async () => ({ ok: true, updatedAt: 123 }) }; return { ok: true, json: async () => ({ rows: [], total: 0 }) }; };
  const storage = new Map(); const st = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const g = new GameManager({ save: memSave() }); g.cloud = new CloudSync(g, { storage: st, fetchFn });
  assert.equal(g.cloud.enabled(), false); g.cloud.tick(999); assert.equal(calls.length, 0);
  g.setCloud({ url: 'https://api.test/', name: '테스터' });
  assert.equal(g.cloud.enabled(), true); assert.equal(g.cloud.base(), 'https://api.test');
  const id = g.cloud.identity(); assert.deepEqual(id, JSON.parse(storage.get('excel-heroes:cloud-id'))); assert.ok(id.id.length >= 8 && id.secret.length >= 16);
  const r = await g.cloud.push(); assert.equal(r.updatedAt, 123);
  assert.equal(calls[0].init.headers['x-eh-id'], id.id); assert.equal(JSON.parse(calls[0].init.body).name, '테스터');
  const rejecting = async () => ({ ok: false, status: 422, json: async () => ({ error: 'implausible save', check: { reasons: ['gems exceed plausible income'] } }) });
  g.cloud.fetchFn = rejecting;
  await assert.rejects(() => g.cloud.push());
  assert.equal(g.cloud.status, 'error'); assert.match(g.cloud.lastError, /gems/);
  g.setCloud({ url: '' }); assert.equal(g.cloud.enabled(), false);
});
