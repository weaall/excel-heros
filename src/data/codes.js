// 보석 코드 (promo codes). Hand these out however you like — the table below is the whole system.
//
// The code list ships with the game, so treat a code as a coupon you *chose* to publish, never as a secret.
// Redemption is recorded **per account** by the Worker (POST /v1/redeem, table `redemptions`), so wiping the local
// save does not hand out a second payout. When the player is signed out the client falls back to a local-only
// record; the next sign-in is authoritative. The plausibility budget knows about redemptions either way.
//
// To add a code: one entry here, redeploy. `until` is optional (ISO date, inclusive); `once` defaults to true.
//   WELCOME2026: { gems: 300, label: '입사 축하', until: '2026-12-31' }

/** @type {Record<string, { gems?: number, cards?: number, gold?: number, label: string, until?: string }>} */
export const CODES = Object.freeze({
  HELLOHEROS: { gems: 3000, label: '입사 축하' },
  'REF!': { gems: 3000, label: '참조 오류 복구' },
});

/** Codes are typed by hand: accept any case and ignore spaces/dashes (but not punctuation that is part of a code). */
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
