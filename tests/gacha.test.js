import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/utils/rng.js';
import { rollGrade, rollGradeRaw, pullOnce, initialPity, promoteCost } from '../src/core/GachaManager.js';
import { GRADES, GRADE_ORDER, HEROES } from '../src/data/heroes.js';
import { BALANCE } from '../src/config/balance.js';

test('grade rates sum to 1 and rollGradeRaw maps boundaries', () => {
  const sum = GRADE_ORDER.reduce((a, g) => a + GRADES[g].rate, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(rollGradeRaw(0), 'standard');
  assert.equal(rollGradeRaw(0.599), 'standard');
  assert.equal(rollGradeRaw(0.6), 'advanced');
  assert.equal(rollGradeRaw(0.9), 'executive');
  assert.equal(rollGradeRaw(0.99), 'ceo');
  assert.equal(rollGradeRaw(0.999999), 'ceo');
});

test('pity: never more than 50 pulls without Executive+, never more than 100 without CEO', () => {
  const rng = createRng(12345);
  let pity = initialPity();
  let gapExec = 0, gapCeo = 0;
  for (let i = 0; i < 20000; i++) {
    const r = rollGrade(pity, rng);
    pity = r.pity;
    gapExec++; gapCeo++;
    if (r.grade === 'executive' || r.grade === 'ceo') { assert.ok(gapExec <= BALANCE.PITY_EXECUTIVE, `exec gap ${gapExec}`); gapExec = 0; }
    if (r.grade === 'ceo') { assert.ok(gapCeo <= BALANCE.PITY_CEO, `ceo gap ${gapCeo}`); gapCeo = 0; }
  }
  assert.ok(gapExec <= BALANCE.PITY_EXECUTIVE && gapCeo <= BALANCE.PITY_CEO);
});

test('pity: forced results on exact thresholds with an always-Standard RNG', () => {
  const rng = { next: () => 0, int: () => 5, pick: (a) => a[0] };
  let pity = initialPity();
  for (let i = 1; i <= 100; i++) {
    const r = rollGrade(pity, rng); pity = r.pity;
    if (i === 50) assert.equal(r.grade, 'executive');
    else if (i === 100) assert.equal(r.grade, 'ceo');
    else assert.equal(r.grade, 'standard');
  }
  assert.equal(pity.sinceCEO, 0);
});

test('observed rates roughly match 60/30/9/1 with pity nudging up', () => {
  const rng = createRng(7);
  let pity = initialPity(); const counts = { standard: 0, advanced: 0, executive: 0, ceo: 0 };
  const N = 100000;
  for (let i = 0; i < N; i++) { const r = rollGrade(pity, rng); pity = r.pity; counts[r.grade]++; }
  assert.ok(Math.abs(counts.standard / N - 0.6) < 0.02);
  assert.ok(Math.abs(counts.advanced / N - 0.3) < 0.02);
  assert.ok(counts.executive / N > 0.085 && counts.executive / N < 0.13);
  assert.ok(counts.ceo / N >= 0.01 && counts.ceo / N < 0.02);
});

test('pullOnce unlocks new heroes at 1 star and gives 5-10 shards on duplicates', () => {
  const rng = createRng(99);
  const roster = {};
  let pity = initialPity();
  let news = 0, dupes = 0;
  for (let i = 0; i < 500; i++) {
    const r = pullOnce(pity, roster, rng); pity = r.pity;
    if (r.isNew) { news++; assert.equal(roster[r.heroId].star, 1); assert.equal(r.shards, BALANCE.UNLOCK_SHARDS); }
    else { dupes++; assert.ok(r.shards >= 5 && r.shards <= 10); }
  }
  assert.equal(news, HEROES.length, 'all heroes eventually unlocked');
  assert.ok(dupes > 0);
});

test('promoteCost follows grade table and is null at max star', () => {
  assert.equal(promoteCost('standard', 1), 10);
  assert.equal(promoteCost('ceo', 4), 200);
  assert.equal(promoteCost('ceo', 5), null);
});
