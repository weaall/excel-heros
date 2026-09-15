// 오늘의 픽업 (daily pickup banner): one featured S and one featured A hero, the same for every player that day.
// When a pull lands on that grade, PICKUP_RATE of the time it is the featured card instead of a uniform roll —
// so wanting a specific character becomes "come back on their day", not "pray".
import { heroesOfGrade, HERO_BY_ID } from './heroes.js';

export const PICKUP_RATE = 0.5;
export const PICKUP_GRADES = ['S', 'A'];
export const PICKUP_DAYS = 3;                       // a banner lasts 3 days so a wanted card can actually be aimed at
export const SPARK_COST = { S: 150, A: 60 };         // 모집 포인트 (1 per row pulled, never expires) to exchange for the pickup card
export const dayIndexOf = (dateKey) => Math.floor(new Date(`${dateKey}T00:00:00`).getTime() / 86400000) || hash(dateKey);
/** Whole days left on the banner running on dateKey (1 = last day). */
export const bannerDaysLeft = (dateKey) => PICKUP_DAYS - (((dayIndexOf(dateKey) % PICKUP_DAYS) + PICKUP_DAYS) % PICKUP_DAYS);

function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

/** Featured hero ids for a date key ('YYYY-MM-DD'): { S: id, A: id }. Rotates through the grade's roster so every card gets a day. */
export function pickupFor(dateKey) {
  const out = {};
  const dayIndex = Math.floor(dayIndexOf(dateKey) / PICKUP_DAYS); // one step per banner, not per day
  for (const g of PICKUP_GRADES) {
    const pool = heroesOfGrade(g); if (!pool.length) continue;
    // a per-grade shuffled order (fixed) walked one step per day, so consecutive days never repeat a card
    const order = pool.map((h) => h.id).sort((a, b) => hash(`${g}:${a}`) - hash(`${g}:${b}`));
    out[g] = order[((dayIndex % order.length) + order.length) % order.length];
  }
  return out;
}
export const pickupDefs = (dateKey) => Object.fromEntries(Object.entries(pickupFor(dateKey)).map(([g, id]) => [g, HERO_BY_ID[id]]));
