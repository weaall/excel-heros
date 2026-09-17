// Excel Heroes cloud backend — a single Cloudflare Worker + D1 database (both on the free tier).
// Zero dependencies; shares the plausibility rules with the client (../src/core/plausibility.js).
//
// Identity: Google sign-in. The client gets an ID token from Google Identity Services and posts it to
// /v1/auth/google; the Worker verifies it (Google tokeninfo, audience = GOOGLE_CLIENT_ID), upserts the user and
// returns an opaque session token (30 days). Every other route takes `authorization: Bearer <session>`.
// The sessions table stores only SHA-256(token), so a database leak cannot be replayed as a login.
//
// Routes (JSON):
//   GET  /v1/ping                          → { ok, time, google: bool }
//   POST /v1/auth/google { credential }    → { token, user: { id, name, picture, email }, expiresAt }
//   GET  /v1/me                            → { user, save: { updatedAt, maxStage } | null }
//   POST /v1/logout                        → { ok }
//   GET  /v1/save                          → { save, updatedAt } | 404
//   PUT  /v1/save   { save, name, dps }    → { ok, updatedAt, check }   (422 when the save is implausible)
//   GET  /v1/board?limit=50                → { rows, mine, total }   (public: name + picture only, never email)
//   POST /v1/ad     { kind }               → { ok, count }
//   POST /v1/redeem { code }               → { ok, code, reward } | 409 (already used on this account)
//
// Deploy: see backend/README.md (wrangler login → d1 create → d1 execute schema.sql → set GOOGLE_CLIENT_ID → deploy).
import { checkSave, checkDelta, boardEntry, boardScore, sanitizeName, MAX_SAVE_BYTES } from '../src/core/plausibility.js';
import { checkCode } from '../src/data/codes.js';

export const SESSION_DAYS = 30;
/** ALLOW_ORIGIN may list several origins (comma-separated); echo the caller's origin when it is on the list, else the first. */
const pickOrigin = (env, req) => { const list = String(env.ALLOW_ORIGIN ?? '*').split(',').map((s) => s.trim()).filter(Boolean); if (list.includes('*')) return '*'; const o = req.headers.get('origin'); return o && list.includes(o) ? o : list[0]; };
const json = (body, status = 200, origin = '*') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) } });
const cors = (origin) => ({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,PUT,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', 'access-control-max-age': '86400' });
const randomToken = () => { const a = new Uint8Array(32); crypto.getRandomValues(a); return [...a].map((b) => b.toString(16).padStart(2, '0')).join(''); };
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** SHA-256 of a session token. The table stores this; the client keeps the token itself. */
export async function hashToken(token) { return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))); }

/** Verify a Google ID token via Google's tokeninfo endpoint. Returns the claims or throws. `fetchFn` is injectable for tests. */
export async function verifyGoogleToken(credential, clientId, fetchFn = fetch) {
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) throw new Error('malformed credential');
  const r = await fetchFn(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) throw new Error('google rejected the token');
  const c = await r.json();
  if (c.aud !== clientId) throw new Error('token audience mismatch');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) throw new Error('bad issuer');
  if (Number(c.exp) * 1000 < Date.now()) throw new Error('token expired');
  if (!c.sub) throw new Error('no subject');
  return { sub: c.sub, email: c.email ?? null, name: c.name ?? c.given_name ?? '사원', picture: c.picture ?? null, emailVerified: c.email_verified === 'true' || c.email_verified === true };
}

/** Resolve the session from the Authorization header → { id, name, picture } or an error Response. */
async function auth(req, env, origin) {
  const m = /^Bearer\s+([a-f0-9]{64})$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return json({ error: 'login required' }, 401, origin);
  const raw = m[1].toLowerCase(), hashed = await hashToken(raw);
  const find = (t) => env.DB.prepare('SELECT s.user_id AS id, s.expires_at, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').bind(t).first();
  let stored = hashed, row = await find(hashed);
  if (!row) { // a session issued before tokens were hashed: accept it once, then rewrite the row as a hash
    row = await find(raw);
    if (row) { await env.DB.prepare('UPDATE sessions SET token = ? WHERE token = ?').bind(hashed, raw).run(); }
    else stored = null;
  }
  if (!row) return json({ error: 'unknown session' }, 401, origin);
  if (row.expires_at < Date.now()) { await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(stored).run(); return json({ error: 'session expired' }, 401, origin); }
  return { id: row.id, name: row.name, picture: row.picture, token: stored };
}

/** Hard cap on stored ad views per user per day — the endpoint is only a counter, but an open INSERT is free DB growth. */
const AD_DAILY_CAP = 40;
/** First line of the save rate limit: per-isolate memory. Cloudflare may hand a caller a fresh isolate, so the
 *  durable check against saves.updated_at below is what actually holds. */
const lastPut = new Map();
function rateLimit(id, now, minGapMs = 20000) { const t = lastPut.get(id) ?? 0; if (now - t < minGapMs) return false; lastPut.set(id, now); if (lastPut.size > 5000) lastPut.clear(); return true; }
const userView = (u) => ({ id: u.id, name: u.name, picture: u.picture, email: u.email ?? null });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = pickOrigin(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    try {
      if (url.pathname === '/v1/ping') return json({ ok: true, time: Date.now(), google: !!env.GOOGLE_CLIENT_ID }, 200, origin);

      if (url.pathname === '/v1/auth/google' && req.method === 'POST') {
        if (!env.GOOGLE_CLIENT_ID) return json({ error: 'GOOGLE_CLIENT_ID is not configured on the server' }, 503, origin);
        const body = await req.json().catch(() => ({}));
        let claims;
        try { claims = await verifyGoogleToken(body.credential, env.GOOGLE_CLIENT_ID, env.fetchFn ?? fetch); }
        catch (e) { return json({ error: `google sign-in failed: ${e.message}` }, 401, origin); }
        const now = Date.now();
        let user = await env.DB.prepare('SELECT id, name, picture, email FROM users WHERE google_sub = ?').bind(claims.sub).first();
        if (!user) {
          const id = `g_${randomToken().slice(0, 20)}`;
          await env.DB.prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, claims.sub, claims.email, claims.name, claims.picture, now, now).run();
          user = { id, name: claims.name, picture: claims.picture, email: claims.email };
        } else {
          await env.DB.prepare('UPDATE users SET name = ?, picture = ?, email = ?, last_login = ? WHERE id = ?').bind(claims.name, claims.picture, claims.email, now, user.id).run();
          user = { ...user, name: claims.name, picture: claims.picture, email: claims.email };
        }
        const token = randomToken(), expiresAt = now + SESSION_DAYS * 86400000;
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(user.id, now).run(); // expired tokens are dead weight and extra attack surface
        await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token NOT IN (SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 9)').bind(user.id, user.id).run(); // keep the 9 newest, this login makes 10
        await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await hashToken(token), user.id, now, expiresAt).run(); // the row holds the hash; the client holds the token
        return json({ token, user: userView(user), expiresAt }, 200, origin);
      }

      if (url.pathname === '/v1/me' && req.method === 'GET') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const row = await env.DB.prepare('SELECT save, updated_at FROM saves WHERE id = ?').bind(a.id).first();
        let save = null;
        if (row) { const s = JSON.parse(row.save); save = { updatedAt: row.updated_at, maxStage: s.maxStage | 0, playSeconds: Math.floor(s.stats?.playSeconds ?? 0) }; }
        return json({ user: userView(a), save }, 200, origin);
      }

      if (url.pathname === '/v1/logout' && req.method === 'POST') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(a.token).run();
        return json({ ok: true }, 200, origin);
      }

      if (url.pathname === '/v1/save' && req.method === 'GET') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const row = await env.DB.prepare('SELECT save, updated_at FROM saves WHERE id = ?').bind(a.id).first();
        if (!row) return json({ error: 'no save' }, 404, origin);
        return json({ save: JSON.parse(row.save), updatedAt: row.updated_at }, 200, origin);
      }

      if (url.pathname === '/v1/save' && req.method === 'PUT') {
        const len = Number(req.headers.get('content-length') ?? 0); if (len > MAX_SAVE_BYTES * 1.2) return json({ error: 'payload too large' }, 413, origin);
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const body = await req.json().catch(() => null); if (!body?.save) return json({ error: 'body.save required' }, 400, origin);
        const now = Date.now();
        if (!rateLimit(a.id, now, Number(env.SAVE_MIN_GAP_MS ?? 20000))) return json({ error: 'too many saves; try again in a moment' }, 429, origin);
        const check = checkSave(body.save, now);
        if (!check.ok) return json({ error: 'implausible save', check }, 422, origin);
        const prevRow = await env.DB.prepare('SELECT save, updated_at FROM saves WHERE id = ?').bind(a.id).first();
        const gap = Number(env.SAVE_MIN_GAP_MS ?? 20000);
        if (prevRow && gap > 0 && now - prevRow.updated_at < gap) return json({ error: 'too many saves; try again in a moment' }, 429, origin); // durable: survives a fresh isolate
        const delta = checkDelta(prevRow ? JSON.parse(prevRow.save) : null, body.save, prevRow?.updated_at ?? now, now, body.force === true);
        if (!delta.ok) return json({ error: 'implausible change since the last save', check: delta }, 422, origin);
        const text = JSON.stringify(body.save);
        await env.DB.prepare('INSERT INTO saves (id, save, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at').bind(a.id, text, now).run();
        const e = boardEntry(body.save, sanitizeName(body.name) === '익명 사원' && a.name ? a.name : body.name, Number(body.dps) || 0); // Google name as fallback, both sanitised
        await env.DB.prepare('INSERT INTO board (id, name, picture, max_cleared, shares, prestige, dps, play_seconds, collection, score, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, picture = excluded.picture, max_cleared = excluded.max_cleared, shares = excluded.shares, prestige = excluded.prestige, dps = excluded.dps, play_seconds = excluded.play_seconds, collection = excluded.collection, score = excluded.score, updated_at = excluded.updated_at')
          .bind(a.id, e.name, a.picture, e.maxCleared, e.shares, e.prestige, e.dps, e.playSeconds, e.collection, boardScore(e), now).run();
        return json({ ok: true, updatedAt: now, check }, 200, origin);
      }

      if (url.pathname === '/v1/board' && req.method === 'GET') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
        const a = await auth(req, env, origin); const me = a instanceof Response ? null : a.id; // the board is readable without login
        const { results } = await env.DB.prepare('SELECT id, name, picture, max_cleared, shares, prestige, dps, play_seconds, collection FROM board ORDER BY score DESC, updated_at ASC LIMIT ?').bind(limit).all();
        const view = (r, rank) => ({ rank, name: r.name, picture: r.picture, maxCleared: r.max_cleared, shares: r.shares, prestige: r.prestige, dps: r.dps, playSeconds: r.play_seconds, collection: r.collection, me: r.id === me });
        const rows = results.map((r, i) => view(r, i + 1));
        let mine = null;
        if (me && !rows.some((r) => r.me)) {
          const r = await env.DB.prepare('SELECT id, name, picture, max_cleared, shares, prestige, dps, play_seconds, collection, score FROM board WHERE id = ?').bind(me).first();
          if (r) { const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM board WHERE score > ?').bind(r.score).first(); mine = view(r, (above?.n ?? 0) + 1); }
        }
        return json({ rows, mine, total: (await env.DB.prepare('SELECT COUNT(*) AS n FROM board').first())?.n ?? rows.length }, 200, origin);
      }

      if (url.pathname === '/v1/redeem' && req.method === 'POST') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const body = await req.json().catch(() => ({}));
        const r = checkCode(body.code, {}); // the account's own history is the table below, not the client's save
        if (!r.ok) return json({ ok: false, reason: r.reason }, 400, origin);
        const had = await env.DB.prepare('SELECT 1 AS n FROM redemptions WHERE user_id = ? AND code = ?').bind(a.id, r.code).first();
        if (had) return json({ ok: false, reason: '이미 사용한 코드입니다' }, 409, origin);
        await env.DB.prepare('INSERT INTO redemptions (user_id, code, at) VALUES (?, ?, ?)').bind(a.id, r.code, Date.now()).run();
        return json({ ok: true, code: r.code, reward: r.reward }, 200, origin);
      }

      if (url.pathname === '/v1/ad' && req.method === 'POST') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const body = await req.json().catch(() => ({}));
        const since = Date.now() - 86400000;
        const seen = await env.DB.prepare('SELECT COUNT(*) AS n FROM ad_views WHERE id = ? AND at > ?').bind(a.id, since).first();
        if ((seen?.n ?? 0) >= AD_DAILY_CAP) return json({ ok: false, count: seen.n, error: 'daily ad cap reached' }, 429, origin);
        await env.DB.prepare('INSERT INTO ad_views (id, kind, at) VALUES (?, ?, ?)').bind(a.id, String(body.kind ?? 'reward').slice(0, 32), Date.now()).run();
        return json({ ok: true, count: (seen?.n ?? 0) + 1 }, 200, origin);
      }

      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      console.error('worker error', url.pathname, e); // the detail belongs in the log, not in the response
      return json({ error: 'server error' }, 500, origin);
    }
  },
};
