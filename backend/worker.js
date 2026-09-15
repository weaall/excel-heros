// Excel Heroes cloud backend — a single Cloudflare Worker + D1 database (both on the free tier).
// Zero dependencies; shares the plausibility rules with the client (../src/core/plausibility.js).
//
// Routes (JSON; auth = headers x-eh-id / x-eh-secret, a per-device id + secret the client generates once):
//   GET  /v1/ping                       → { ok, time }
//   GET  /v1/save                       → { save, updatedAt } | 404
//   PUT  /v1/save   { save, name, dps } → { ok, updatedAt, check }   (rejected 422 when the save is implausible)
//   GET  /v1/board?limit=50             → { rows: [{ rank, name, maxCleared, shares, prestige, dps, playSeconds, collection, me }] }
//   POST /v1/ad     { kind }            → { ok, count }              (records a rewarded-ad view per device, for later auditing)
//
// Deploy: see backend/README.md (wrangler login → d1 create → d1 execute schema.sql → wrangler deploy).
import { checkSave, boardEntry, boardScore, MAX_SAVE_BYTES } from '../src/core/plausibility.js';

const json = (body, status = 200, origin = '*') => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) } });
const cors = (origin) => ({ 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET,PUT,POST,OPTIONS', 'access-control-allow-headers': 'content-type,x-eh-id,x-eh-secret', 'access-control-max-age': '86400' });

async function sha256(text) { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

/** Resolve (or create on first PUT) the device row; returns { id } or an error Response. */
async function auth(req, env, origin, create = false) {
  const id = req.headers.get('x-eh-id'), secret = req.headers.get('x-eh-secret');
  if (!validId(id) || typeof secret !== 'string' || secret.length < 16 || secret.length > 128) return json({ error: 'missing or malformed x-eh-id / x-eh-secret' }, 401, origin);
  const hash = await sha256(secret);
  const row = await env.DB.prepare('SELECT secret_hash FROM devices WHERE id = ?').bind(id).first();
  if (!row) {
    if (!create) return json({ error: 'unknown device' }, 404, origin);
    await env.DB.prepare('INSERT INTO devices (id, secret_hash, created_at) VALUES (?, ?, ?)').bind(id, hash, Date.now()).run();
    return { id };
  }
  if (row.secret_hash !== hash) return json({ error: 'secret mismatch' }, 403, origin);
  return { id };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = env.ALLOW_ORIGIN ?? '*';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    try {
      if (url.pathname === '/v1/ping') return json({ ok: true, time: Date.now() }, 200, origin);

      if (url.pathname === '/v1/save' && req.method === 'GET') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const row = await env.DB.prepare('SELECT save, updated_at FROM saves WHERE id = ?').bind(a.id).first();
        if (!row) return json({ error: 'no save' }, 404, origin);
        return json({ save: JSON.parse(row.save), updatedAt: row.updated_at }, 200, origin);
      }

      if (url.pathname === '/v1/save' && req.method === 'PUT') {
        const len = Number(req.headers.get('content-length') ?? 0); if (len > MAX_SAVE_BYTES * 1.2) return json({ error: 'payload too large' }, 413, origin);
        const body = await req.json().catch(() => null); if (!body?.save) return json({ error: 'body.save required' }, 400, origin);
        const a = await auth(req, env, origin, true); if (a instanceof Response) return a;
        const now = Date.now(); const check = checkSave(body.save, now);
        if (!check.ok) return json({ error: 'implausible save', check }, 422, origin);
        const text = JSON.stringify(body.save);
        await env.DB.prepare('INSERT INTO saves (id, save, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET save = excluded.save, updated_at = excluded.updated_at').bind(a.id, text, now).run();
        const e = boardEntry(body.save, body.name, Number(body.dps) || 0);
        await env.DB.prepare('INSERT INTO board (id, name, max_cleared, shares, prestige, dps, play_seconds, collection, score, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, max_cleared = excluded.max_cleared, shares = excluded.shares, prestige = excluded.prestige, dps = excluded.dps, play_seconds = excluded.play_seconds, collection = excluded.collection, score = excluded.score, updated_at = excluded.updated_at')
          .bind(a.id, e.name, e.maxCleared, e.shares, e.prestige, e.dps, e.playSeconds, e.collection, boardScore(e), now).run();
        return json({ ok: true, updatedAt: now, check }, 200, origin);
      }

      if (url.pathname === '/v1/board' && req.method === 'GET') {
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
        const me = req.headers.get('x-eh-id');
        const { results } = await env.DB.prepare('SELECT id, name, max_cleared, shares, prestige, dps, play_seconds, collection FROM board ORDER BY score DESC, updated_at ASC LIMIT ?').bind(limit).all();
        const rows = results.map((r, i) => ({ rank: i + 1, name: r.name, maxCleared: r.max_cleared, shares: r.shares, prestige: r.prestige, dps: r.dps, playSeconds: r.play_seconds, collection: r.collection, me: r.id === me }));
        let mine = null;
        if (me && !rows.some((r) => r.me)) {
          const r = await env.DB.prepare('SELECT name, max_cleared, shares, prestige, dps, play_seconds, collection, score FROM board WHERE id = ?').bind(me).first();
          if (r) { const above = await env.DB.prepare('SELECT COUNT(*) AS n FROM board WHERE score > ?').bind(r.score).first(); mine = { rank: (above?.n ?? 0) + 1, name: r.name, maxCleared: r.max_cleared, shares: r.shares, prestige: r.prestige, dps: r.dps, playSeconds: r.play_seconds, collection: r.collection, me: true }; }
        }
        return json({ rows, mine, total: (await env.DB.prepare('SELECT COUNT(*) AS n FROM board').first())?.n ?? rows.length }, 200, origin);
      }

      if (url.pathname === '/v1/ad' && req.method === 'POST') {
        const a = await auth(req, env, origin); if (a instanceof Response) return a;
        const body = await req.json().catch(() => ({}));
        await env.DB.prepare('INSERT INTO ad_views (id, kind, at) VALUES (?, ?, ?)').bind(a.id, String(body.kind ?? 'reward').slice(0, 32), Date.now()).run();
        const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM ad_views WHERE id = ? AND at > ?').bind(a.id, Date.now() - 86400000).first();
        return json({ ok: true, count: c?.n ?? 1 }, 200, origin);
      }

      return json({ error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'server error', detail: String(e?.message ?? e).slice(0, 200) }, 500, origin);
    }
  },
};
