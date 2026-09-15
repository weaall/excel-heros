// Optional cloud save + leaderboard client for backend/worker.js. Everything is opt-in: with no server URL
// configured the game is exactly as before (localStorage only). The device identity (id + secret) lives in its
// own localStorage key, never inside the save, so exporting a save does not leak it.
import { checkSave } from './plausibility.js';

const ID_KEY = 'excel-heroes:cloud-id';
export const CLOUD_PUSH_INTERVAL = 120; // seconds between automatic uploads while a server is configured

const randomToken = (n) => { const a = new Uint8Array(n); (globalThis.crypto ?? { getRandomValues: (x) => x.map(() => Math.random() * 256) }).getRandomValues(a); return [...a].map((b) => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b & 63]).join(''); };

export class CloudSync {
  constructor(game, { storage = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
    this.game = game; this.storage = storage; this.fetchFn = fetchFn;
    this.timer = 0; this.status = 'off'; this.lastError = null; this.lastPush = 0; this.board = null; this.busy = false;
  }
  cfg() { return this.game.state.settings.cloud ?? { url: '', name: '' }; }
  enabled() { return !!(this.cfg().url && this.fetchFn); }
  base() { return String(this.cfg().url).replace(/\/+$/, ''); }
  /** Per-device credentials, created on first use. */
  identity() {
    try { const raw = this.storage?.getItem(ID_KEY); if (raw) return JSON.parse(raw); } catch { /* fallthrough */ }
    const id = { id: randomToken(24), secret: randomToken(48) };
    try { this.storage?.setItem(ID_KEY, JSON.stringify(id)); } catch { /* ignore */ }
    return id;
  }
  headers(auth = true) { const h = { 'content-type': 'application/json' }; if (auth) { const me = this.identity(); h['x-eh-id'] = me.id; h['x-eh-secret'] = me.secret; } return h; }

  async #call(path, init = {}) {
    const r = await this.fetchFn(`${this.base()}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout?.(15000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.error ?? `HTTP ${r.status}`); e.status = r.status; e.body = body; throw e; }
    return body;
  }

  /** Automatic upload cadence; called from GameManager.tick. */
  tick(dt) {
    if (!this.enabled()) { this.status = 'off'; return; }
    this.timer += dt;
    if (this.timer >= CLOUD_PUSH_INTERVAL) { this.timer = 0; this.push().catch(() => {}); }
  }

  async ping() {
    const r = await this.fetchFn(`${this.base()}/v1/ping`, { signal: AbortSignal.timeout?.(8000) }); const b = await r.json();
    if (!b.ok) throw new Error('bad ping'); return b;
  }

  /** Upload the current save (after a local plausibility check so a rejected save is explained client-side). */
  async push() {
    if (!this.enabled() || this.busy) return null;
    const check = checkSave(this.game.state, Date.now());
    if (!check.ok) { this.status = 'rejected'; this.lastError = `업로드 보류: ${check.reasons.join(', ')}`; this.game.emit('cloud', this); return null; }
    this.busy = true;
    try {
      const r = await this.#call('/v1/save', { method: 'PUT', body: JSON.stringify({ save: this.game.state, name: this.cfg().name, dps: this.game.partyDPS() }) });
      this.status = 'ok'; this.lastError = null; this.lastPush = r.updatedAt ?? Date.now(); this.game.emit('cloud', this); return r;
    } catch (e) { this.status = 'error'; this.lastError = e.status === 422 ? `서버가 저장을 거부: ${(e.body?.check?.reasons ?? []).join(', ')}` : e.message; this.game.emit('cloud', this); throw e; }
    finally { this.busy = false; }
  }

  /** Fetch the server copy (the caller decides whether to load it — see GameManager.loadCloudSave). */
  async pull() {
    if (!this.enabled()) return null;
    try { return await this.#call('/v1/save'); }
    catch (e) { if (e.status === 404) return null; this.status = 'error'; this.lastError = e.message; this.game.emit('cloud', this); throw e; }
  }

  async fetchBoard(limit = 50) {
    if (!this.enabled()) return null;
    const b = await this.#call(`/v1/board?limit=${limit}`, { method: 'GET' });
    this.board = b; this.game.emit('board', b); return b;
  }

  /** Record a rewarded-ad view (audit trail only; the reward itself is granted locally). */
  async recordAd(kind = 'reward') { if (!this.enabled()) return null; return this.#call('/v1/ad', { method: 'POST', body: JSON.stringify({ kind }) }).catch(() => null); }
}
