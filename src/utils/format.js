// 큰 수 표기.
//
// 예전에는 K/M/B/T/Qa/Qi/Sx/Sp/Oc 였다. 앞의 네 개까지는 읽히지만 그 뒤(Qa·Qi·Sx…)는 한국어 UI에서 아무 뜻도
// 없는 글자다. 그런데 이 게임은 ★5 상한(Lv 320)을 채우는 데만 6.5e15 골드가 필요하므로 **정상 진행만 해도
// 반드시 그 구간에 들어간다.**
//
// 그래서 한국식 만 단위(만·억·조·경·해)로 바꿨다. 두 가지가 같이 좋아진다.
//  1. 전부 플레이어가 아는 단어다. "6.5Qa"는 못 읽어도 "650조"는 읽는다.
//  2. 만 단위는 네 자리마다 바뀌므로 단위가 덜 자주 바뀐다. 천 단위였다면 1e12~1e16 사이에 T와 Qa 두 번을
//     넘지만, 만 단위에서는 그 구간 전체가 '조' 하나다.
//
// 100만 미만은 예전처럼 쉼표를 찍은 정확한 수다 — 엑셀 셀처럼 보여야 하고, 초반에는 실제로 그 한 자리까지
// 보고 강화 비용을 가늠한다.
const UNITS = [
  { at: 1e20, name: '해' },
  { at: 1e16, name: '경' },
  { at: 1e12, name: '조' },
  { at: 1e8, name: '억' },
  { at: 1e6, name: '만', div: 1e4 }, // 100만 = "100만" (1e6/1e4), 1e7 = "1000만"
];

/** Compact number: 1234 -> "1,234", 1_234_567 -> "123만", 1.62e13 -> "16.2조" */
export function fmt(n) {
  if (!Number.isFinite(n)) return '#NUM!';
  const neg = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1e6) return neg + Math.floor(n).toLocaleString('en-US');
  if (n >= 1e24) return neg + n.toExponential(2);
  for (const u of UNITS) {
    if (n < u.at) continue;
    const v = n / (u.div ?? u.at);
    return neg + (v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-US')) + u.name;
  }
  return neg + Math.floor(n).toLocaleString('en-US');
}

/** 정확한 값(쉼표). 툴팁처럼 "진짜 몇인지"를 보여야 하는 자리에서 쓴다. */
export const fmtExact = (n) => (Number.isFinite(n) ? Math.floor(n).toLocaleString('en-US') : '#NUM!');

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
