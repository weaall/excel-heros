// 보석 코드 (promo codes). Hand these out however you like — the table below is the whole system.
//
// These are client-side by design: the code list ships with the game, so treat a code as a coupon you *chose* to
// publish, never as a secret. Each code can be redeemed once per save (state.redeemed), and the plausibility budget
// knows about redemptions so a legitimate one never trips the leaderboard checks.
//
// To add a code: one entry here, redeploy. `until` is optional (ISO date, inclusive); `once` defaults to true.
//   WELCOME2026: { gems: 300, label: '입사 축하', until: '2026-12-31' }

/** @type {Record<string, { gems?: number, cards?: number, gold?: number, label: string, until?: string }>} */
export const CODES = Object.freeze({
  // 예시 겸 첫 보상. 나머지 코드는 사용자가 정해 여기에 추가합니다.
  EXCELHEROES: { gems: 300, cards: 20, label: '오픈 기념' },
});

/** Codes are typed by hand: accept any case and ignore spaces/dashes. */
export const normalizeCode = (raw) => String(raw ?? '').toUpperCase().replace(/[\s-]/g, '').slice(0, 32);

/** The largest gem payout any code can grant — the plausibility budget adds this per redeemed code. */
export const MAX_CODE_GEMS = Object.values(CODES).reduce((a, c) => Math.max(a, c.gems ?? 0), 0);

/**
 * Look a code up. Returns { ok, code, reward } or { ok: false, reason }.
 * `redeemed` is the save's map of already-used codes.
 */
export function checkCode(raw, redeemed = {}, now = Date.now()) {
  const code = normalizeCode(raw);
  if (!code) return { ok: false, reason: '코드를 입력하세요' };
  const entry = CODES[code];
  if (!entry) return { ok: false, reason: '없는 코드입니다' };
  if (redeemed[code]) return { ok: false, reason: '이미 사용한 코드입니다' };
  if (entry.until && now > Date.parse(`${entry.until}T23:59:59+09:00`)) return { ok: false, reason: '기간이 지난 코드입니다' };
  return { ok: true, code, reward: entry };
}
