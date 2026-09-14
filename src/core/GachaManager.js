// Pure gacha logic with two pity counters (soft 50 => A or better, hard 100 => S).
import { BALANCE } from '../config/balance.js';
import { GRADES, GRADE_ORDER, heroesOfGrade } from '../data/heroes.js';

const emptyHero = () => ({ owned: false, star: 0, shards: 0, level: 1, enhance: 0 });

export const initialPity = () => ({ pulls: 0, sinceA: 0, sinceS: 0 });

/** Roll a grade by base rates (45/30/17/7/1). */
export function rollGradeRaw(r) {
  let acc = 0;
  for (const g of GRADE_ORDER) { acc += GRADES[g].rate; if (r < acc) return g; }
  return GRADE_ORDER[GRADE_ORDER.length - 1];
}

/**
 * Roll a grade with pity applied. Returns { grade, pity } (new pity object, input untouched).
 *  - The 100th pull without an S is forced to S.
 *  - The 50th pull without A-or-better is forced to at least A.
 */
export function rollGrade(pity, rng) {
  let grade = rollGradeRaw(rng.next());
  const p = { pulls: pity.pulls + 1, sinceA: pity.sinceA + 1, sinceS: pity.sinceS + 1 };
  if (p.sinceS >= BALANCE.PITY_S) grade = 'S';
  else if (p.sinceA >= BALANCE.PITY_A && grade !== 'S') grade = 'A';
  if (grade === 'S') { p.sinceS = 0; p.sinceA = 0; }
  else if (grade === 'A') p.sinceA = 0;
  return { grade, pity: p };
}

/**
 * Perform one pull against a roster.
 * @param roster  { [heroId]: { owned, star, shards, level, enhance } }  (mutated)
 * @returns { heroId, grade, isNew, shards, pity }
 */
export function pullOnce(pity, roster, rng, minGrade = null) {
  let { grade, pity: nextPity } = rollGrade(pity, rng);
  if (minGrade && GRADE_ORDER.indexOf(grade) < GRADE_ORDER.indexOf(minGrade)) { // 10연차 보장 등: 등급 하한
    grade = minGrade; nextPity = { ...nextPity, sinceA: GRADE_ORDER.indexOf(grade) >= GRADE_ORDER.indexOf('A') ? 0 : nextPity.sinceA, sinceS: grade === 'S' ? 0 : nextPity.sinceS };
  }
  const hero = rng.pick(heroesOfGrade(grade));
  const entry = roster[hero.id] ?? (roster[hero.id] = emptyHero());
  let isNew = false, shards = 0;
  if (!entry.owned) {
    // New card: unlocked at ★1 right away (the GDD's 10 unlock shards are consumed implicitly).
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
