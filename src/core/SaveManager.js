import { BALANCE, offlineGold } from '../config/balance.js';
import { migrate } from './state.js';

const KEY = 'excel-heroes:save:v1';

export class SaveManager {
  constructor(storage = globalThis.localStorage) { this.storage = storage; }

  load() {
    try {
      const raw = this.storage?.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch (e) { console.warn('[Save] corrupt save ignored', e); return null; }
  }

  save(state, now = Date.now()) {
    state.lastSaved = now;
    try { this.storage?.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { console.warn('[Save] failed', e); return false; }
  }

  clear() { try { this.storage?.removeItem(KEY); } catch { /* ignore */ } }

  export(state) { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); }
  import(str) {
    const json = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    return migrate(json);
  }

  /**
   * Offline reward: goldPerSec(max stage) * seconds * 0.8, capped at 12h.
   * @param goldPerSecFn (stage) => number - supplied by GameManager (needs party DPS)
   */
  static computeOffline(state, now, goldPerSecFn) {
    const elapsed = Math.floor((now - (state.lastSaved ?? now)) / 1000);
    if (elapsed < BALANCE.OFFLINE_MIN_SEC) return null;
    const seconds = Math.min(elapsed, BALANCE.OFFLINE_CAP_SEC);
    const gps = goldPerSecFn(state.stage);
    return { seconds, elapsed, capped: elapsed > BALANCE.OFFLINE_CAP_SEC, goldPerSec: gps, gold: offlineGold(gps, seconds) };
  }
}
