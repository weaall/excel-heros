// Google sign-in for the cloud account. Uses Google Identity Services (one <script>, no SDK): the button hands us an
// ID token, we trade it at the backend for an opaque 30-day session token, and that token is what every later request
// carries. The session lives in its own localStorage key — never inside the save, so exports do not leak it.
// Config comes from window.EXCEL_HEROES_CLOUD = { url, googleClientId } in index.html.
const SESSION_KEY = 'excel-heroes:session';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

export function cloudConfig() { return globalThis.EXCEL_HEROES_CLOUD ?? { url: '', googleClientId: '' }; }
export const loginConfigured = () => !!(cloudConfig().url && cloudConfig().googleClientId);

export class Auth {
  constructor({ storage = globalThis.localStorage, fetchFn = globalThis.fetch?.bind(globalThis) } = {}) {
    this.storage = storage; this.fetchFn = fetchFn;
    this.session = this.#load(); // { token, user: { id, name, picture, email }, expiresAt } | null
    this.listeners = new Set(); this.gsiReady = false; this.error = null;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  #emit() { for (const fn of this.listeners) fn(this.session); }
  #load() { try { const raw = this.storage?.getItem(SESSION_KEY); const s = raw ? JSON.parse(raw) : null; return s && s.token && s.expiresAt > Date.now() ? s : null; } catch { return null; } }
  #store() { try { if (this.session) this.storage?.setItem(SESSION_KEY, JSON.stringify(this.session)); else this.storage?.removeItem(SESSION_KEY); } catch { /* ignore */ } }

  get user() { return this.session?.user ?? null; }
  get token() { return this.session?.token ?? null; }
  loggedIn() { return !!this.session; }
  base() { return String(cloudConfig().url ?? '').replace(/\/+$/, ''); }

  /** Load the Google Identity Services script once and render the button into `el`. Safe to call repeatedly. */
  async renderButton(el, { theme = 'outline', size = 'medium', text = 'signin_with' } = {}) {
    const { googleClientId } = cloudConfig(); if (!googleClientId || !el || typeof document === 'undefined') return false;
    await this.#loadGsi();
    if (!globalThis.google?.accounts?.id) return false;
    if (!this.gsiReady) {
      globalThis.google.accounts.id.initialize({ client_id: googleClientId, callback: (resp) => this.#onCredential(resp), auto_select: false, ux_mode: 'popup', itp_support: true });
      this.gsiReady = true;
    }
    el.innerHTML = '';
    globalThis.google.accounts.id.renderButton(el, { theme, size, text, shape: 'rectangular', locale: 'ko', width: 220 });
    return true;
  }
  #loadGsi() {
    if (globalThis.google?.accounts?.id) return Promise.resolve();
    if (this.gsiPromise) return this.gsiPromise;
    this.gsiPromise = new Promise((resolve) => { const s = document.createElement('script'); s.src = GSI_SRC; s.async = true; s.defer = true; s.onload = () => resolve(); s.onerror = () => { this.error = 'Google 스크립트를 불러올 수 없습니다'; resolve(); }; document.head.appendChild(s); });
    return this.gsiPromise;
  }

  /** Exchange a Google credential (ID token) for a backend session. Public so tests can drive it without GIS. */
  async loginWithCredential(credential) {
    this.error = null;
    const r = await this.fetchFn(`${this.base()}/v1/auth/google`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential }), signal: AbortSignal.timeout?.(15000) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { this.error = body.error ?? `HTTP ${r.status}`; this.#emit(); throw new Error(this.error); }
    this.session = { token: body.token, user: body.user, expiresAt: body.expiresAt }; this.#store(); this.#emit();
    return this.session;
  }
  async #onCredential(resp) { this.pending = true; this.#emit(); try { await this.loginWithCredential(resp?.credential); } catch { /* error is on this.error and already emitted */ } finally { this.pending = false; } }

  /** Drop the session locally and (best effort) on the server. */
  async logout() {
    const token = this.token; this.session = null; this.#store(); this.#emit();
    try { globalThis.google?.accounts?.id?.disableAutoSelect?.(); } catch { /* ignore */ }
    if (token) { try { await this.fetchFn(`${this.base()}/v1/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }); } catch { /* offline logout is fine */ } }
  }
  /** Called by CloudSync when the server answers 401: the session is gone. */
  invalidate() { if (this.session) { this.session = null; this.#store(); this.error = '로그인이 만료되었습니다. 다시 로그인해 주세요.'; this.#emit(); } }
  headers() { return this.token ? { authorization: `Bearer ${this.token}` } : {}; }
}
