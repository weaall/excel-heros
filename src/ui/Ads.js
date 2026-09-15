// Rewarded ads through AdSense "H5 Games Ads" (Ad Placement API). Enabled only when index.html sets
// window.EXCEL_HEROES_ADS = { publisherId: 'ca-pub-…' }; otherwise `available()` is false and the UI keeps the
// 5-second placeholder overlay. The reward is granted client-side (the API has no server-side verification), which
// is why it is capped per day (BALANCE.AD.perDay) and only pays idle gold.
let loaded = false, ready = false;

export function adsConfig() { return globalThis.EXCEL_HEROES_ADS ?? null; }
export function available() { return !!adsConfig()?.publisherId; }

/** Inject the AdSense script once (safe to call repeatedly). */
export function setupAds() {
  const cfg = adsConfig(); if (!cfg?.publisherId || loaded || typeof document === 'undefined') return false;
  loaded = true;
  const s = document.createElement('script');
  s.async = true; s.crossOrigin = 'anonymous';
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.publisherId)}`;
  s.dataset.adFrequencyHint = cfg.frequencyHint ?? '30s';
  document.head.appendChild(s);
  globalThis.adsbygoogle = globalThis.adsbygoogle || [];
  globalThis.adConfig = globalThis.adConfig || function () { globalThis.adsbygoogle.push(arguments); };
  globalThis.adBreak = globalThis.adBreak || function () { globalThis.adsbygoogle.push(arguments); };
  globalThis.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => { ready = true; } });
  return true;
}

/**
 * Show a rewarded ad. Resolves { viewed: true } when the user watched it, { viewed: false, reason } otherwise
 * ('dismissed' | 'unavailable' | 'disabled'). Never rejects.
 */
export function showRewarded(name = 'idle_bonus') {
  return new Promise((resolve) => {
    if (!available() || typeof globalThis.adBreak !== 'function') return resolve({ viewed: false, reason: 'disabled' });
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
export const adsReady = () => ready;
