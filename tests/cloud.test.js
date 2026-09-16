import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { checkSave, checkDelta, goldInLevels, boardEntry, boardScore } from '../src/core/plausibility.js';
import { CloudSync } from '../src/core/CloudSync.js';
import { Auth } from '../src/core/Auth.js';
import worker, { verifyGoogleToken } from '../backend/worker.js';
import { upgradeCost } from '../src/config/balance.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const DAY = 86400000;
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

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
  const g = createInitialState(); g.heroes.main.level = 5;
  assert.equal(goldInLevels(g), upgradeCost(1) + upgradeCost(2) + upgradeCost(3) + upgradeCost(4));
});

test('plausibility: a real headless run stays inside the bounds', () => {
  const g = new GameManager({ save: memSave() });
  for (let i = 0; i < 6000; i++) g.tick(0.1);
  g.state.stats.playSeconds = Math.max(g.state.stats.playSeconds, 600);
  assert.deepEqual(checkSave(g.state, Date.now() + 700 * 1000).reasons, []);
});

test('board entry and score: shares outrank stages, stages outrank dps', () => {
  const s = createInitialState(); s.maxCleared = 40; s.prestige = { shares: 2, count: 1 };
  const e = boardEntry(s, '김인턴이름이너무길어서잘립니다정말로', 1234.6);
  assert.equal(e.name.length, 16); assert.equal(e.dps, 1235); assert.equal(e.shares, 2);
  assert.ok(boardScore({ shares: 1, maxCleared: 5 }) > boardScore({ shares: 0, maxCleared: 200, dps: 1e12 }));
  assert.ok(boardScore({ shares: 0, maxCleared: 6, dps: 1 }) > boardScore({ shares: 0, maxCleared: 5, dps: 1e12 }));
  assert.equal(boardEntry(s, '').name, '익명 사원');
});

// ---- Google token verification (tokeninfo is mocked) ---------------------------------------------------------
const tokeninfo = (claims, ok = true) => async () => ({ ok, json: async () => claims });
const goodClaims = (over = {}) => ({ aud: CLIENT_ID, iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), sub: '1234567890', email: 'kim@example.com', email_verified: 'true', name: '김인턴', picture: 'https://lh3.example/p.png', ...over });

test('verifyGoogleToken: accepts a matching token, rejects wrong audience / issuer / expiry / malformed', async () => {
  const c = await verifyGoogleToken('x'.repeat(40), CLIENT_ID, tokeninfo(goodClaims()));
  assert.equal(c.sub, '1234567890'); assert.equal(c.name, '김인턴'); assert.equal(c.emailVerified, true);
  await assert.rejects(() => verifyGoogleToken('x'.repeat(40), CLIENT_ID, tokeninfo(goodClaims({ aud: 'other' }))), /audience/);
  await assert.rejects(() => verifyGoogleToken('x'.repeat(40), CLIENT_ID, tokeninfo(goodClaims({ iss: 'evil.example' }))), /issuer/);
  await assert.rejects(() => verifyGoogleToken('x'.repeat(40), CLIENT_ID, tokeninfo(goodClaims({ exp: '1' }))), /expired/);
  await assert.rejects(() => verifyGoogleToken('x'.repeat(40), CLIENT_ID, tokeninfo({}, false)), /rejected/);
  await assert.rejects(() => verifyGoogleToken('short', CLIENT_ID, tokeninfo(goodClaims())), /malformed/);
});

// ---- Worker with an in-memory stand-in for D1 (only the SQL shapes worker.js uses) ---------------------------
function fakeDB() {
  const t = { users: new Map(), sessions: new Map(), saves: new Map(), board: new Map(), ads: [] };
  const stmt = (sql) => { const bound = (...a) => ({
    async first() {
      if (sql.startsWith('SELECT s.user_id AS id')) { const s = t.sessions.get(a[0]); if (!s) return null; const u = t.users.get(s.user_id); return { id: s.user_id, expires_at: s.expires_at, name: u.name, picture: u.picture }; }
      if (sql.startsWith('SELECT id, name, picture, email FROM users WHERE google_sub')) return [...t.users.values()].find((u) => u.google_sub === a[0]) ?? null;
      if (sql.startsWith('SELECT save, updated_at FROM saves')) return t.saves.get(a[0]) ?? null;
      if (sql.startsWith('SELECT COUNT(*) AS n FROM board WHERE score >')) return { n: [...t.board.values()].filter((r) => r.score > a[0]).length };
      if (sql.startsWith('SELECT COUNT(*) AS n FROM board')) return { n: t.board.size };
      if (sql.startsWith('SELECT COUNT(*) AS n FROM ad_views')) return { n: t.ads.filter((x) => x.id === a[0] && x.at > a[1]).length };
      if (sql.startsWith('SELECT id, name, picture, max_cleared')) return t.board.get(a[0]) ?? null;
      throw new Error('fake first: ' + sql);
    },
    async run() {
      if (sql.startsWith('INSERT INTO users')) t.users.set(a[0], { id: a[0], google_sub: a[1], email: a[2], name: a[3], picture: a[4] });
      else if (sql.startsWith('UPDATE users')) { const u = t.users.get(a[4]); Object.assign(u, { name: a[0], picture: a[1], email: a[2] }); }
      else if (sql.startsWith('INSERT INTO sessions')) t.sessions.set(a[0], { user_id: a[1], expires_at: a[3] });
      else if (sql.startsWith('DELETE FROM sessions')) t.sessions.delete(a[0]);
      else if (sql.startsWith('INSERT INTO saves')) t.saves.set(a[0], { save: a[1], updated_at: a[2] });
      else if (sql.startsWith('INSERT INTO board')) t.board.set(a[0], { id: a[0], name: a[1], picture: a[2], max_cleared: a[3], shares: a[4], prestige: a[5], dps: a[6], play_seconds: a[7], collection: a[8], score: a[9], updated_at: a[10] });
      else if (sql.startsWith('INSERT INTO ad_views')) t.ads.push({ id: a[0], kind: a[1], at: a[2] });
      else throw new Error('fake run: ' + sql);
      return { success: true };
    },
    async all() { if (sql.startsWith('SELECT id, name, picture, max_cleared')) return { results: [...t.board.values()].sort((x, y) => y.score - x.score).slice(0, a[0]) }; throw new Error('fake all: ' + sql); },
  }); return { bind: bound, ...bound() }; };
  return { prepare: stmt, tables: t };
}
const req = (path, init = {}, token = null) => new Request(`https://api.test${path}`, { ...init, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });

test('worker: google login → session, me/save/board/logout, plausibility rejection, auth failures', async () => {
  const env = { DB: fakeDB(), ALLOW_ORIGIN: 'https://weaall.github.io', GOOGLE_CLIENT_ID: CLIENT_ID, fetchFn: tokeninfo(goodClaims()) };
  const ping = await (await worker.fetch(req('/v1/ping'), env)).json(); assert.equal(ping.ok, true); assert.equal(ping.google, true);
  assert.equal((await worker.fetch(req('/v1/save'), env)).status, 401, 'no session → 401');
  assert.equal((await worker.fetch(req('/v1/save', {}, 'f'.repeat(64)), env)).status, 401, 'unknown session → 401');
  const login = await worker.fetch(req('/v1/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'x'.repeat(40) }) }), env);
  assert.equal(login.status, 200); const { token, user } = await login.json();
  assert.match(token, /^[a-f0-9]{64}$/); assert.equal(user.name, '김인턴'); assert.match(user.id, /^g_/);
  const me0 = await (await worker.fetch(req('/v1/me', {}, token), env)).json(); assert.equal(me0.user.id, user.id); assert.equal(me0.save, null);
  const now = Date.now(); const save = legitSave(now);
  const put = await worker.fetch(req('/v1/save', { method: 'PUT', body: JSON.stringify({ save, dps: 4321 }) }, token), env);
  assert.equal(put.status, 200);
  const me1 = await (await worker.fetch(req('/v1/me', {}, token), env)).json(); assert.equal(me1.save.maxStage, 26);
  const got = await (await worker.fetch(req('/v1/save', {}, token), env)).json(); assert.equal(got.save.maxCleared, 25);
  const bad = legitSave(now); bad.gems = 1e9;
  assert.equal((await worker.fetch(req('/v1/save', { method: 'PUT', body: JSON.stringify({ save: bad }) }, token), env)).status, 422);
  // second login with the same Google account reuses the user; a different account makes a new one
  const again = await (await worker.fetch(req('/v1/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'y'.repeat(40) }) }), env)).json();
  assert.equal(again.user.id, user.id);
  const env2 = { ...env, fetchFn: tokeninfo(goodClaims({ sub: '999', name: '박사원' })) };
  const other = await (await worker.fetch(req('/v1/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'z'.repeat(40) }) }), env2)).json();
  assert.notEqual(other.user.id, user.id);
  const otherSave = legitSave(now); otherSave.maxCleared = 24; otherSave.stats.totalKills = 24 * 20 + 3000;
  assert.equal((await worker.fetch(req('/v1/save', { method: 'PUT', body: JSON.stringify({ save: otherSave }) }, other.token), env)).status, 200);
  const board = await (await worker.fetch(req('/v1/board?limit=10', {}, token), env)).json();
  assert.equal(board.total, 2); assert.equal(board.rows[0].name, '김인턴'); assert.equal(board.rows[0].me, true); assert.equal(board.rows[1].name, '박사원');
  const anon = await (await worker.fetch(req('/v1/board?limit=10'), env)).json(); assert.equal(anon.rows.length, 2, 'board is public');
  assert.equal((await (await worker.fetch(req('/v1/ad', { method: 'POST', body: JSON.stringify({ kind: 'reward' }) }, token), env)).json()).count, 1);
  assert.equal((await worker.fetch(req('/v1/logout', { method: 'POST' }, token), env)).status, 200);
  assert.equal((await worker.fetch(req('/v1/save', {}, token), env)).status, 401, 'session gone after logout');
  const badLogin = await worker.fetch(req('/v1/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'x'.repeat(40) }) }), { ...env, fetchFn: tokeninfo(goodClaims({ aud: 'nope' })) });
  assert.equal(badLogin.status, 401);
  assert.equal((await worker.fetch(req('/v1/auth/google', { method: 'POST', body: '{}' }), { ...env, GOOGLE_CLIENT_ID: '' })).status, 503);
  assert.equal((await worker.fetch(new Request('https://api.test/v1/save', { method: 'OPTIONS' }), env)).status, 204);
});

test('Auth + CloudSync: login stores a session, requests carry Bearer, 401 invalidates, logout clears', async () => {
  const calls = []; const storage = new Map(); const st = { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) };
  let sessionOk = true;
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/auth/google')) return { ok: true, status: 200, json: async () => ({ token: 'a'.repeat(64), user: { id: 'g_1', name: '김인턴', picture: null, email: 'k@x' }, expiresAt: Date.now() + 1e7 }) };
    if (!sessionOk) return { ok: false, status: 401, json: async () => ({ error: 'session expired' }) };
    if (url.endsWith('/v1/ping')) return { ok: true, json: async () => ({ ok: true, google: true }) };
    if (url.endsWith('/v1/me')) return { ok: true, status: 200, json: async () => ({ user: { id: 'g_1' }, save: null }) };
    if (init.method === 'PUT') return { ok: true, status: 200, json: async () => ({ ok: true, updatedAt: 123 }) };
    if (url.endsWith('/v1/logout')) return { ok: true, status: 200, json: async () => ({ ok: true }) };
    return { ok: true, status: 200, json: async () => ({ rows: [], total: 0 }) };
  };
  globalThis.EXCEL_HEROES_CLOUD = { url: 'https://api.test/', googleClientId: CLIENT_ID };
  const g = new GameManager({ save: memSave() });
  const auth = new Auth({ storage: st, fetchFn }); g.cloud = new CloudSync(g, { storage: st, fetchFn, auth });
  assert.equal(g.cloud.configured(), true); assert.equal(g.cloud.enabled(), false, 'configured but not logged in');
  g.cloud.tick(999); assert.equal(calls.length, 0, 'no uploads while logged out');
  let authEvents = 0; g.on('auth', () => authEvents++);
  await auth.loginWithCredential('x'.repeat(40));
  assert.equal(auth.loggedIn(), true); assert.equal(authEvents, 1); assert.ok(storage.get('excel-heroes:session'));
  assert.equal(new Auth({ storage: st, fetchFn }).user.name, '김인턴', 'session survives a reload');
  const r = await g.cloud.push(); assert.equal(r.updatedAt, 123);
  const putCall = calls.find((c) => c.init.method === 'PUT'); assert.equal(putCall.init.headers.authorization, `Bearer ${'a'.repeat(64)}`);
  assert.equal(JSON.parse(putCall.init.body).name, '김인턴', 'leaderboard name falls back to the Google name');
  sessionOk = false; await assert.rejects(() => g.cloud.push());
  assert.equal(auth.loggedIn(), false, '401 invalidates the session'); assert.match(auth.error, /만료/);
  sessionOk = true; await auth.loginWithCredential('x'.repeat(40)); await auth.logout();
  assert.equal(auth.loggedIn(), false); assert.equal(storage.has('excel-heroes:session'), false);
  assert.ok(calls.some((c) => c.url.endsWith('/v1/logout')));
  delete globalThis.EXCEL_HEROES_CLOUD;
});


test('delta plausibility: normal progress passes; gem spikes, rollbacks and kill bursts are rejected; force allows an explicit overwrite', () => {
  const now = Date.now(); const prev = legitSave(now - 2 * 3600000); const at = now - 2 * 3600000;
  const next = JSON.parse(JSON.stringify(prev)); next.stats.playSeconds += 7000; next.stats.totalKills += 7000 * 2; next.gems += 900; next.maxCleared += 3; next.maxStage += 3;
  assert.deepEqual(checkDelta(prev, next, at, now).reasons, []);
  assert.equal(checkDelta(null, next, 0, now).ok, true, 'first upload has nothing to compare');
  const spike = JSON.parse(JSON.stringify(next)); spike.gems += 50000; assert.ok(checkDelta(prev, spike, at, now).reasons.includes('gems grew faster than any income allows'));
  const back = JSON.parse(JSON.stringify(prev)); back.stats.playSeconds -= 3600; assert.ok(checkDelta(prev, back, at, now).reasons.includes('play time rolled back'));
  assert.equal(checkDelta(prev, back, at, now, true).ok, true, 'explicit overwrite may roll back');
  const burst = JSON.parse(JSON.stringify(next)); burst.stats.totalKills += 500000; assert.ok(checkDelta(prev, burst, at, now).reasons.includes('kills exceed the play time added'));
  const fast = JSON.parse(JSON.stringify(prev)); fast.stats.playSeconds += 20 * 3600; assert.ok(checkDelta(prev, fast, at, now).reasons.includes('play time grew faster than wall-clock time'));
});

test('worker: a second PUT with an implausible jump is rejected (422) while honest progress is stored', async () => {
  const env = { DB: fakeDB(), ALLOW_ORIGIN: '*', GOOGLE_CLIENT_ID: CLIENT_ID, fetchFn: tokeninfo(goodClaims()) };
  const { token } = await (await worker.fetch(req('/v1/auth/google', { method: 'POST', body: JSON.stringify({ credential: 'x'.repeat(40) }) }), env)).json();
  const now = Date.now(); const save = legitSave(now);
  assert.equal((await worker.fetch(req('/v1/save', { method: 'PUT', body: JSON.stringify({ save }) }, token), env)).status, 200);
  const cheat = JSON.parse(JSON.stringify(save)); cheat.gems += 5000; // inside the snapshot budget, impossible as a jump since the last save
  const r = await worker.fetch(req('/v1/save', { method: 'PUT', body: JSON.stringify({ save: cheat }) }, token), env);
  assert.equal(r.status, 422); assert.match((await r.json()).error, /change since/);
  const honest = JSON.parse(JSON.stringify(save)); honest.stats.playSeconds += 30; honest.stats.totalKills += 40; honest.gems += 10;
  assert.equal((await worker.fetch(req('/v1/save', { method: 'PUT', body: JSON.stringify({ save: honest }) }, token), env)).status, 200);
});
