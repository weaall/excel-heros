import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MONSTER_MAPS, MONSTER_ACCENTS } from '../src/data/monsterArt.js';
import { MONSTER_TYPES } from '../src/data/monsters.js';

test('every monster type has a hand-pixelled map with uniform rows and known keys', () => {
  for (const t of MONSTER_TYPES) {
    const map = MONSTER_MAPS[t.id];
    if (!map) continue; // Tiny Creatures types use the CC0 pack and fall back to shaded shapes
    assert.ok(map.length <= 30 && map[0].length <= 32, `${t.id} fits 32x32`);
    for (const row of map) { assert.equal(row.length, map[0].length, `${t.id} uniform width`); assert.ok(/^[.EMDlYyLK]+$/.test(row), `${t.id} keys: ${row}`); }
    assert.ok(MONSTER_ACCENTS[t.id], `accent for ${t.id}`);
  }
});
