import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/utils/rng.js';
import { rollGrade, rollGradeRaw, pullOnce, initialPity, promoteCost } from '../src/core/GachaManager.js';
import { GRADES, GRADE_ORDER, HEROES, MAIN_ID } from '../src/data/heroes.js';
import { BALANCE } from '../src/config/balance.js';

test('grade rates sum to 1 and rollGradeRaw maps boundaries (D45/C30/B17/A7/S1)', () => {
  const sum = GRADE_ORDER.reduce((a, g) => a + GRADES[g].rate, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(rollGradeRaw(0), 'D');
  assert.equal(rollGradeRaw(0.449), 'D');
  assert.equal(rollGradeRaw(0.45), 'C');
  assert.equal(rollGradeRaw(0.75), 'B');
  assert.equal(rollGradeRaw(0.92), 'A');
  assert.equal(rollGradeRaw(0.99), 'S');
  assert.equal(rollGradeRaw(0.999999), 'S');
});

test('main hero is never in the gacha pool', () => {
  assert.ok(!HEROES.some((h) => h.id === MAIN_ID));
});

test('pity: never more than 50 pulls without A+, never more than 100 without S', () => {
  const rng = createRng(12345);
  let pity = initialPity();
  let gapA = 0, gapS = 0;
  for (let i = 0; i < 20000; i++) {
    const r = rollGrade(pity, rng);
    pity = r.pity;
    gapA++; gapS++;
    if (r.grade === 'A' || r.grade === 'S') { assert.ok(gapA <= BALANCE.PITY_A, `A gap ${gapA}`); gapA = 0; }
    if (r.grade === 'S') { assert.ok(gapS <= BALANCE.PITY_S, `S gap ${gapS}`); gapS = 0; }
  }
  assert.ok(gapA <= BALANCE.PITY_A && gapS <= BALANCE.PITY_S);
});

test('pity: forced results on exact thresholds with an always-D RNG', () => {
  const rng = { next: () => 0, int: () => 5, pick: (a) => a[0] };
  let pity = initialPity();
  for (let i = 1; i <= 100; i++) {
    const r = rollGrade(pity, rng); pity = r.pity;
    if (i === 50) assert.equal(r.grade, 'A');
    else if (i === 100) assert.equal(r.grade, 'S');
    else assert.equal(r.grade, 'D');
  }
  assert.equal(pity.sinceS, 0);
});

test('observed rates roughly match 45/30/17/7/1 with pity nudging up', () => {
  const rng = createRng(7);
  let pity = initialPity(); const counts = { D: 0, C: 0, B: 0, A: 0, S: 0 };
  const N = 100000;
  for (let i = 0; i < N; i++) { const r = rollGrade(pity, rng); pity = r.pity; counts[r.grade]++; }
  assert.ok(Math.abs(counts.D / N - 0.45) < 0.02);
  assert.ok(Math.abs(counts.C / N - 0.30) < 0.02);
  assert.ok(Math.abs(counts.B / N - 0.17) < 0.02);
  assert.ok(counts.A / N > 0.065 && counts.A / N < 0.11);
  assert.ok(counts.S / N >= 0.01 && counts.S / N < 0.02);
});

test('pullOnce unlocks new heroes at 1 star and gives 5-10 shards on duplicates', () => {
  const rng = createRng(99);
  const roster = {};
  let pity = initialPity();
  let news = 0, dupes = 0;
  for (let i = 0; i < 800; i++) {
    const r = pullOnce(pity, roster, rng); pity = r.pity;
    if (r.isNew) { news++; assert.equal(roster[r.heroId].star, 1); assert.equal(r.shards, BALANCE.UNLOCK_SHARDS); }
    else { dupes++; assert.ok(r.shards >= 5 && r.shards <= 10); }
  }
  assert.equal(news, HEROES.length, 'all heroes eventually unlocked');
  assert.ok(dupes > 0);
});

test('promoteCost follows grade table and is null at max star', () => {
  assert.equal(promoteCost('D', 1), 10);
  assert.equal(promoteCost('S', 4), 240);
  assert.equal(promoteCost('S', 5), null);
});

test('오늘의 픽업: deterministic per date, rotates daily, featured card lands ~50% of its grade', async () => {
  const { pickupFor, PICKUP_RATE } = await import('../src/data/pickup.js');
  const { heroesOfGrade, HERO_BY_ID } = await import('../src/data/heroes.js');
  const { createRng } = await import('../src/utils/rng.js');
  const a = pickupFor('2026-09-15'), b = pickupFor('2026-09-15'), c = pickupFor('2026-09-16');
  assert.deepEqual(a, b); assert.equal(HERO_BY_ID[a.S].grade, 'S'); assert.equal(HERO_BY_ID[a.A].grade, 'A');
  assert.notEqual(a.S, c.S, 'S pickup changes day to day');
  const days = new Set(); for (let d = 1; d <= 28; d++) days.add(pickupFor(`2026-10-${String(d).padStart(2, '0')}`).A);
  assert.equal(days.size, heroesOfGrade('A').length, 'every A card gets a day within a rotation');
  const rng = createRng(3); let featured = 0, sRolls = 0;
  for (let i = 0; i < 4000; i++) { const r = pullOnce(initialPity(), {}, rng, 'S', a); sRolls++; if (r.heroId === a.S) featured++; if (r.pickup) assert.equal(r.heroId, a.S); }
  const share = featured / sRolls, uniform = 1 / heroesOfGrade('S').length;
  assert.ok(Math.abs(share - (PICKUP_RATE + (1 - PICKUP_RATE) * uniform)) < 0.04, `featured share ${share}`);
  assert.equal(pullOnce(initialPity(), {}, rng, 'S').pickup, false, 'no banner → never flagged');
});
