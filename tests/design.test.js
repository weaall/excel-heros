// The back sheet (등 뒤의 시트) and the outfit lines — the rules docs/CHARACTER_DESIGN.md states,
// held to so that a later edit cannot quietly break them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, MAIN_JOBS, TRAITS, ROLES } from '../src/data/heroes.js';
import {
  sheetSide, SHEET_BY_GRADE, SHEET_ROWS_MAX, SHEET_TRAIT, SHEET_ATTACK, sheetFill,
  OUTFIT_BY_ID, OFF_BODY, BACK_CLEAR, BACK_NEG,
} from '../src/data/design.js';

const ALL = [...HEROES, ...Object.values(MAIN_JOBS)];

test('sheet side is fixed per id and both sides are used', () => {
  for (const h of HEROES) assert.equal(sheetSide(h.id), sheetSide(h.id));
  const left = HEROES.filter((h) => sheetSide(h.id) === 'left').length;
  assert.ok(left > HEROES.length * 0.3 && left < HEROES.length * 0.7, `left ${left} of ${HEROES.length}`);
});

test('grade climbs by structure: every grade adds a column', () => {
  const cols = ['D', 'C', 'B', 'A', 'S'].map((g) => SHEET_BY_GRADE[g].cols);
  for (let i = 1; i < cols.length; i++) assert.ok(cols[i] > cols[i - 1], cols.join(','));
});

test('every trait and role has a sheet form', () => {
  for (const k of Object.keys(TRAITS)) assert.ok(SHEET_TRAIT[k], `trait ${k} has no cell pattern`);
  for (const k of Object.keys(ROLES)) assert.ok(SHEET_ATTACK[k], `role ${k} has no sheet attack`);
});

test('sheetFill: stars open rows, level fills cells, clamped', () => {
  const a = sheetFill({ grade: 'D', star: 1, level: 0, cap: 80 });
  assert.deepEqual([a.cols, a.rows, a.cells, a.filled], [3, 1, 3, 0]);
  const b = sheetFill({ grade: 'S', star: 5, level: 320, cap: 320, awakened: true, skillLv: 4 });
  assert.deepEqual([b.rows, b.cells, b.filled, b.gold, b.bars], [SHEET_ROWS_MAX, 35, 35, true, 4]);
  const half = sheetFill({ grade: 'B', star: 2, level: 40, cap: 80 });
  assert.equal(half.filled, 5);
  const wild = sheetFill({ grade: 'C', star: 99, level: 999, cap: 80 });
  assert.equal(wild.rows, SHEET_ROWS_MAX);
  assert.equal(wild.filled, wild.cells);
  assert.equal(sheetFill({ grade: 'C', star: 0, level: 5, cap: 0 }).filled, 0);
});

test('every definition has an outfit, and no outfit paints off the body', () => {
  for (const h of ALL) assert.ok(OUTFIT_BY_ID[h.id], `${h.id} has no outfit`);
  for (const [id, v] of Object.entries(OUTFIT_BY_ID)) assert.ok(!OFF_BODY.test(v), `${id}: "${v.match(OFF_BODY)?.[0]}" is not clothing`);
});

test('the prompt leaves the back empty and forbids the old devices', () => {
  assert.ok(!/wing|halo/i.test(BACK_CLEAR));
  for (const w of ['wings', 'halo', 'floating screens']) assert.ok(BACK_NEG.includes(w), w);
});
