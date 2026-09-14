// Pure gacha logic with two pity counters (soft 50 => Executive+, hard 100 => CEO).
import { BALANCE } from '../config/balance.js';
import { GRADES, GRADE_ORDER, heroesOfGrade } from '../data/heroes.js';

export const initialPity = () => ({ pulls: 0, sinceExecutive: 0, sinceCEO: 0 });

/** Roll a grade by base rates (60/30/9/1). */
export function rollGradeRaw(r) {
  let acc = 0;
  for (const g of GRADE_ORDER) { acc += GRADES[g].rate; if (r < acc) return g; }
  return GRADE_ORDER[GRADE_ORDER.length - 1];
}

/**
 * Roll a grade with pity applied. Returns { grade, pity } (new pity object, input untouched).
 *  - The 100th pull without a CEO is forced to CEO.
 *  - The 50th pull without Executive-or-better is forced to at least Executive.
 */
export function rollGrade(pity, rng) {
  let grade = rollGradeRaw(rng.next());
  const p = { pulls: pity.pulls + 1, sinceExecutive: pity.sinceExecutive + 1, sinceCEO: pity.sinceCEO + 1 };
  if (p.sinceCEO >= BALANCE.PITY_CEO) grade = 'ceo';
  else if (p.sinceExecutive >= BALANCE.PITY_EXECUTIVE && grade !== 'ceo') grade = 'executive';
  if (grade === 'ceo') { p.sinceCEO = 0; p.sinceExecutive = 0; }
  else if (grade === 'executive') p.sinceExecutive = 0;
  return { grade, pity: p };
}

/**
 * Perform one pull against a roster.
 * @param roster  { [heroId]: { owned, star, shards, level } }  (mutated)
 * @returns { heroId, grade, isNew, shards, pity }
 */
export function pullOnce(pity, roster, rng) {
  const { grade, pity: nextPity } = rollGrade(pity, rng);
  const hero = rng.pick(heroesOfGrade(grade));
  const entry = roster[hero.id] ?? (roster[hero.id] = { owned: false, star: 0, shards: 0, level: 1 });
  let isNew = false, shards = 0;
  if (!entry.owned) {
    // New character: unlock at 1-star (the GDD's 10 unlock shards are consumed implicitly).
    entry.owned = true; entry.star = 1; entry.level = entry.level || 1; isNew = true; shards = BALANCE.UNLOCK_SHARDS;
  } else {
    shards = rng.int(BALANCE.DUPLICATE_SHARDS_MIN, BALANCE.DUPLICATE_SHARDS_MAX);
    entry.shards += shards;
  }
  return { heroId: hero.id, grade, isNew, shards, pity: nextPity };
}

/** Shards needed to go from `star` to `star+1`, or null at max. */
export function promoteCost(grade, star) {
  const list = GRADES[grade].promote;
  return star >= BALANCE.MAX_STAR ? null : list[star - 1];
}
