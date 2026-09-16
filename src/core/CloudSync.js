// Cloud save + leaderboard client for backend/worker.js, keyed by the Google account (src/core/Auth.js).
// Without a configured server or without a login the game is exactly as before: localStorage only.
import { checkSave } from './plausibility.js';
import { Auth, cloudConfig } from './Auth.js';

export const CLOUD_PUSH_INTERVAL = 300; // seconds between automatic uploads while logged in (only when something changed)
export const BOARD_CACHE_SEC = 300;    // leaderboard is re-fetched at most this often

export class CloudSync {
  constructor(game, { storage = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis), auth = null } = {}) {
    this.game = game; this.storage = storage; this.fetchFn = fetchFn;
    this.auth = auth ?? new Auth({ storage, fetchFn });
    this.timer = 0; this.status = 'off'; this.lastError = null; this.lastPush = 0; this.board = null; this.busy = false; this.dirty = false;
    // dirty: something worth saving happened since the last successful push (spend/gain/roster/stage)
    for (const ev of ['gems', 'cards', 'gold', 'roster', 'party', 'stage', 'cleared', 'prestige', 'skin', 'dispatch', 'affection', 'story']) game.on(ev, () => { this.dirty = true; });
    this.boardAt = 0;
    this.auth.on(() => { this.timer = 0; this.status = this.auth.loggedIn() ? 'idle' : 'off'; this.lastError = this.auth.error; this.game.emit('cloud', this); this.game.emit('auth', this.auth.user); });
  }
  cfg() { return this.game.state.settings.cloud ?? { url: '', name: '' }; }
  /** Server URL: the deployment config wins; the options-page field is a manual override for testing. */
  base() { return String(this.cfg().url || cloudConfig().url || '').replace(/\/+$/, ''); }
  configured() { return !!(this.base() && this.fetchFn); }
  enabled() { return this.configured() && this.auth.loggedIn(); }
  headers() { return { 'content-type': 'application/json', ...this.auth.headers() }; }

  async #call(path, init = {}) {
    const r = await this.fetchFn(`${this.base()}${path}`, { ...init, headers: { ...this.headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout?.(15000) });
    const body = await r.json().catch(() => ({}));
    if (r.status === 401) { this.auth.invalidate(); }
    if (!r.ok) { const e = new Error(body.error ?? `HTTP ${r.status}`); e.status = r.status; e.body = body; throw e; }
    return body;
  }

  /** Automatic upload cadence; called from GameManager.tick. */
  tick(dt) {
    if (!this.enabled()) { this.status = this.auth.loggedIn() ? 'idle' : 'off'; return; }
    this.timer += dt;
    if (this.timer >= CLOUD_PUSH_INTERVAL) { this.timer = 0; if (this.dirty) this.push().catch(() => {}); }
  }

  async ping() {
    const r = await this.fetchFn(`${this.base()}/v1/ping`, { signal: AbortSignal.timeout?.(8000) }); const b = await r.json();
    if (!b.ok) throw new Error('bad ping'); return b;
  }
  /** Account + server-save summary for the login flow ({ user, save: { updatedAt, maxStage, playSeconds } | null }). */
  async me() { if (!this.enabled()) return null; return this.#call('/v1/me'); }

  /** Upload the current save (after a local plausibility check so a rejected save is explained client-side). */
  async push(force = false) {
    if (!this.enabled() || this.busy) return null;
    const check = checkSave(this.game.state, Date.now());
    if (!check.ok) { this.status = 'rejected'; this.lastError = `업로드 보류: ${check.reasons.join(', ')}`; this.game.emit('cloud', this); return null; }
    this.busy = true; this.status = 'saving'; this.game.emit('cloud', this);
    try {
      const r = await this.#call('/v1/save', { method: 'PUT', body: JSON.stringify({ save: this.game.state, name: this.cfg().name || this.auth.user?.name, dps: this.game.partyDPS(), force }) });
      this.status = 'ok'; this.lastError = null; this.lastPush = r.updatedAt ?? Date.now(); this.dirty = false; this.game.emit('cloud', this); return r;
    } catch (e) { this.status = 'error'; this.lastError = e.status === 422 ? `서버가 저장을 거부: ${(e.body?.check?.reasons ?? []).join(', ')}` : e.message; this.game.emit('cloud', this); throw e; }
    finally { this.busy = false; }
  }

  /** Fetch the server copy (the caller decides whether to load it — see GameManager.loadCloudSave). */
  async pull() {
    if (!this.enabled()) return null;
    this.status = 'loading'; this.game.emit('cloud', this);
    try { const r = await this.#call('/v1/save'); this.status = 'ok'; this.game.emit('cloud', this); return r; }
    catch (e) { if (e.status === 404) return null; this.status = 'error'; this.lastError = e.message; this.game.emit('cloud', this); throw e; }
  }

  async fetchBoard(limit = 50, { force = false } = {}) {
    if (!this.configured()) return null;
    if (!force && this.board && Date.now() - this.boardAt < BOARD_CACHE_SEC * 1000) return this.board; // cached
    this.boardAt = Date.now();
    const b = await this.#call(`/v1/board?limit=${limit}`, { method: 'GET' });
    this.board = b; this.game.emit('board', b); return b;
  }

  /** Fire-and-forget save when the tab is hidden or closed (keepalive lets the request outlive the page). */
  flush() {
    if (!this.enabled() || !this.dirty || this.busy) return;
    const check = checkSave(this.game.state, Date.now()); if (!check.ok) return;
    try { this.fetchFn(`${this.base()}/v1/save`, { method: 'PUT', headers: this.headers(), keepalive: true, body: JSON.stringify({ save: this.game.state, name: this.cfg().name || this.auth.user?.name, dps: this.game.partyDPS() }) }); this.dirty = false; } catch { /* best effort */ }
  }
  /** Record a rewarded-ad view (audit trail only; the reward itself is granted locally). */
  async recordAd(kind = 'reward') { if (!this.enabled()) return null; return this.#call('/v1/ad', { method: 'POST', body: JSON.stringify({ kind }) }).catch(() => null); }
}
