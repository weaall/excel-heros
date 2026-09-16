// Rewarded ads behind one interface. The provider is chosen by window.EXCEL_HEROES_ADS in index.html:
//   { publisherId: 'ca-pub-…' }                                  → AdSense "H5 Games Ads" (Ad Placement API), the long-term target
//   { provider: 'applixir', applixir: { zoneId, devId, gameId } } → AppLixir rewarded video (fast approval, HTML5-game network)
//   { provider: 'custom', custom: { load(), showRewarded() } }    → any other network wired by hand
// With no config `available()` is false and the UI keeps the 5-second placeholder overlay. The reward is granted
// client-side (no server-side verification on any of these), which is why it is capped per day (BALANCE.AD.perDay)
// and only pays idle gold. Everything resolves { viewed: boolean, reason? } and never rejects.
let loaded = false, ready = false;

export function adsConfig() { return globalThis.EXCEL_HEROES_ADS ?? null; }
export function providerName() { const c = adsConfig(); if (!c) return null; if (c.provider) return c.provider; return c.publisherId ? 'adsense' : null; }
export function available() {
  const c = adsConfig(); const p = providerName();
  return p === 'adsense' ? !!c.publisherId : p === 'applixir' ? !!c.applixir?.zoneId : p === 'custom' ? typeof c.custom?.showRewarded === 'function' : false;
}

const loadScript = (src, attrs = {}) => new Promise((resolve, reject) => {
  const s = document.createElement('script'); s.async = true; Object.assign(s, attrs); s.src = src;
  s.onload = () => resolve(true); s.onerror = () => reject(new Error(`script failed: ${src}`)); document.head.appendChild(s);
});

/** Inject the chosen network's SDK once (safe to call repeatedly). */
export function setupAds() {
  const cfg = adsConfig(); if (!available() || loaded || typeof document === 'undefined') return false;
  loaded = true;
  const p = providerName();
  if (p === 'adsense') {
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.publisherId)}`;
    s.dataset.adFrequencyHint = cfg.frequencyHint ?? '30s';
    document.head.appendChild(s);
    globalThis.adsbygoogle = globalThis.adsbygoogle || [];
    globalThis.adConfig = globalThis.adConfig || function () { globalThis.adsbygoogle.push(arguments); };
    globalThis.adBreak = globalThis.adBreak || function () { globalThis.adsbygoogle.push(arguments); };
    globalThis.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => { ready = true; } });
  } else if (p === 'applixir') {
    // AppLixir SDK (rewarded video). Status names below follow their SDK 3.x docs — verify against the dashboard's snippet when wiring a zone.
    loadScript(cfg.applixir.sdk ?? 'https://cdn.applixir.com/applixir.sdk3.0m.js').then(() => { ready = typeof globalThis.invokeApplixirVideoUnit === 'function'; }).catch(() => { ready = false; });
  } else if (p === 'custom') {
    Promise.resolve(cfg.custom.load?.()).then(() => { ready = true; }).catch(() => { ready = false; });
  }
  return true;
}

function showAdSense(name) {
  return new Promise((resolve) => {
    if (typeof globalThis.adBreak !== 'function') return resolve({ viewed: false, reason: 'disabled' });
    let viewed = false, shown = false;
    globalThis.adBreak({
      type: 'reward', name,
      beforeReward: (showAdFn) => { shown = true; showAdFn(); },
      adDismissed: () => resolve({ viewed: false, reason: 'dismissed' }),
      adViewed: () => { viewed = true; resolve({ viewed: true }); },
      adBreakDone: (info) => { if (!viewed && (!shown || info?.breakStatus !== 'viewed')) resolve({ viewed: false, reason: shown ? 'dismissed' : 'unavailable', status: info?.breakStatus }); },
    });
  });
}

const APPLIXIR_VIEWED = new Set(['ad-watched', 'ad-rewarded', 'fb-watched']);
const APPLIXIR_FAILED = { 'ad-interrupted': 'dismissed', 'sys-closing': 'dismissed', 'ad-blocker': 'unavailable', 'ads-unavailable': 'unavailable', 'network-error': 'unavailable', 'cors-error': 'unavailable', 'no-zoneId': 'disabled', 'ad-violation': 'unavailable', 'ad-maximum': 'unavailable', 'sys-error': 'unavailable' };
function showApplixir(name) {
  return new Promise((resolve) => {
    const a = adsConfig().applixir; if (typeof globalThis.invokeApplixirVideoUnit !== 'function') return resolve({ viewed: false, reason: 'unavailable' });
    let done = false; const finish = (r) => { if (!done) { done = true; resolve(r); } };
    const timer = setTimeout(() => finish({ viewed: false, reason: 'unavailable', status: 'timeout' }), 90000);
    try {
      globalThis.invokeApplixirVideoUnit({
        zoneId: a.zoneId, devId: a.devId, gameId: a.gameId, custom1: name, fallback: a.fallback ?? 1, verbosity: a.verbosity ?? 0,
        adStatusCallback: (status) => {
          if (APPLIXIR_VIEWED.has(status)) { clearTimeout(timer); finish({ viewed: true, status }); }
          else if (APPLIXIR_FAILED[status]) { clearTimeout(timer); finish({ viewed: false, reason: APPLIXIR_FAILED[status], status }); }
        },
        adErrorCallback: (err) => { clearTimeout(timer); finish({ viewed: false, reason: 'unavailable', status: String(err?.message ?? err) }); },
      });
    } catch (e) { clearTimeout(timer); finish({ viewed: false, reason: 'unavailable', status: String(e?.message ?? e) }); }
  });
}

/**
 * Show a rewarded ad. Resolves { viewed: true } when the user watched it, { viewed: false, reason } otherwise
 * ('dismissed' | 'unavailable' | 'disabled'). Never rejects.
 */
export function showRewarded(name = 'idle_bonus') {
  if (!available()) return Promise.resolve({ viewed: false, reason: 'disabled' });
  const p = providerName();
  if (p === 'adsense') return showAdSense(name);
  if (p === 'applixir') return showApplixir(name);
  if (p === 'custom') return Promise.resolve(adsConfig().custom.showRewarded(name)).then((r) => ({ viewed: !!r?.viewed, reason: r?.reason ?? (r?.viewed ? undefined : 'unavailable') })).catch(() => ({ viewed: false, reason: 'unavailable' }));
  return Promise.resolve({ viewed: false, reason: 'disabled' });
}
export const adsReady = () => ready;
