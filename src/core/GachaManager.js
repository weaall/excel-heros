// Pure gacha logic with two pity counters (soft 50 => A or better, hard 100 => S).
import { BALANCE } from '../config/balance.js';
import { GRADES, GRADE_ORDER, heroesOfGrade, HERO_BY_ID } from '../data/heroes.js';
import { PICKUP_RATE } from '../data/pickup.js';

const emptyHero = () => ({ owned: false, star: 0, shards: 0, level: 1, enhance: 0, awakened: false, skillLv: 0 });

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
 * @param featured { S: heroId, A: heroId } — 오늘의 픽업: when the rolled grade has a featured card, PICKUP_RATE of the time it is that card
 * @returns { heroId, grade, isNew, shards, pity, pickup }
 */
export function pullOnce(pity, roster, rng, minGrade = null, featured = null) {
  let { grade, pity: nextPity } = rollGrade(pity, rng);
  if (minGrade && GRADE_ORDER.indexOf(grade) < GRADE_ORDER.indexOf(minGrade)) { // 10연차 보장 등: 등급 하한
    grade = minGrade; nextPity = { ...nextPity, sinceA: GRADE_ORDER.indexOf(grade) >= GRADE_ORDER.indexOf('A') ? 0 : nextPity.sinceA, sinceS: grade === 'S' ? 0 : nextPity.sinceS };
  }
  let pickup = false; let hero;
  if (featured?.[grade] && HERO_BY_ID[featured[grade]] && rng.next() < PICKUP_RATE) { hero = HERO_BY_ID[featured[grade]]; pickup = true; }
  else hero = rng.pick(heroesOfGrade(grade));
  const entry = roster[hero.id] ?? (roster[hero.id] = emptyHero());
  let isNew = false, shards = 0;
  if (!entry.owned) {
    // 새 카드는 그 자리에서 ★1로 해금된다. **여분은 0장** — 받은 한 장이 본체다.
    // (예전엔 UNLOCK_SHARDS 10 을 보고했는데, 여분이 장수인 지금은 '여분 +10'이 거짓이 된다.)
    entry.owned = true; entry.star = 1; entry.level = entry.level || 1; isNew = true; shards = 0;
  } else {
    // 중복은 **한 장**으로 쌓인다. 예전처럼 조각 5~10개를 주면 '같은 카드 N장' 이라는 규칙이 깨진다.
    shards = 1;
    entry.shards += shards;
  }
  return { heroId: hero.id, grade, isNew, shards, pity: nextPity, pickup };
}

/**
 * ★을 하나 올리는 데 필요한 **같은 카드 장수**. ★2는 2장, ★3은 3장, ★4는 4장, ★5는 5장 —
 * 즉 `star + 1`. ★5까지 합계 14장이고 **등급과 무관하다.**
 *
 * 등급별 조각 표(D 10/20/40/80 … S 30/60/120/240)를 쓰던 동안은 "몇 장 더 뽑아야 ★3인가"를
 * 플레이어가 셀 수 없었다. 이제 화면에 보이는 장수가 그대로 답이다.
 */
export function promoteCost(grade, star) {
  return star >= BALANCE.MAX_STAR ? null : star + 1;
}
