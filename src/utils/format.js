const UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];

/** Compact number: 1234 -> "1,234", 1_234_567 -> "1.23M" */
export function fmt(n) {
  if (!Number.isFinite(n)) return '#NUM!';
  const neg = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1e6) return neg + Math.floor(n).toLocaleString('en-US');
  let u = 0;
  while (n >= 1000 && u < UNITS.length - 1) { n /= 1000; u++; }
  if (u >= UNITS.length - 1 && n >= 1000) return neg + n.toExponential(2);
  return neg + n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) + UNITS[u];
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const stars = (n) => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));
