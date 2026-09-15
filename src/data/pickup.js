// 오늘의 픽업 (daily pickup banner): one featured S and one featured A hero, the same for every player that day.
// When a pull lands on that grade, PICKUP_RATE of the time it is the featured card instead of a uniform roll —
// so wanting a specific character becomes "come back on their day", not "pray".
import { heroesOfGrade, HERO_BY_ID } from './heroes.js';

export const PICKUP_RATE = 0.5;
export const PICKUP_GRADES = ['S', 'A'];

function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

/** Featured hero ids for a date key ('YYYY-MM-DD'): { S: id, A: id }. Rotates through the grade's roster so every card gets a day. */
export function pickupFor(dateKey) {
  const out = {};
  const dayIndex = Math.floor(new Date(`${dateKey}T00:00:00`).getTime() / 86400000) || hash(dateKey);
  for (const g of PICKUP_GRADES) {
    const pool = heroesOfGrade(g); if (!pool.length) continue;
    // a per-grade shuffled order (fixed) walked one step per day, so consecutive days never repeat a card
    const order = pool.map((h) => h.id).sort((a, b) => hash(`${g}:${a}`) - hash(`${g}:${b}`));
    out[g] = order[((dayIndex % order.length) + order.length) % order.length];
  }
  return out;
}
export const pickupDefs = (dateKey) => Object.fromEntries(Object.entries(pickupFor(dateKey)).map(([g, id]) => [g, HERO_BY_ID[id]]));
