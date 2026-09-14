/** Seedable RNG (mulberry32) for deterministic tests; falls back to Math.random. */
export function createRng(seed) {
  if (seed === undefined || seed === null) return { next: Math.random, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), pick: (arr) => arr[Math.floor(Math.random() * arr.length)] };
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)] };
}
