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

// 보스는 각자 다른 생물을 쓰지만, 그것만으로는 "악마·좀비·오우거"에서 멈춘다. 이 게임의 보스가 되려면
// 사무실 소품이 붙어야 한다(물어뜯긴 결재 문서, 넥타이와 식은 커피, 말아 쥔 계약서). 보스가 늘어날 때
// 소품을 빼먹지 않도록 여기서 막는다.
test('every boss carries its own creature AND its own office props', async () => {
  const { BOSSES } = await import('../src/data/monsters.js');
  const { MONSTER_MAP, BOSS_PROPS } = await import('../src/data/packSprites.js');
  const creatures = new Set();
  for (const b of BOSSES) {
    const creature = MONSTER_MAP[b.id];
    assert.ok(typeof creature === 'string', `${b.id}: 전용 생물이 없다`);
    assert.ok(!creatures.has(creature), `${b.id}: ${creature}를 다른 보스와 공유한다 — 색만 다른 보스는 보스가 아니다`);
    creatures.add(creature);
    assert.equal(typeof BOSS_PROPS[b.id], 'function', `${b.id}: 사무실 소품이 없다`);
  }
});

test('boss props stay inside the boss canvas', async () => {
  const { BOSS_PROPS } = await import('../src/data/packSprites.js');
  const W = 128, H = 116; // packMonsterFrame 의 big 캔버스
  for (const [id, draw] of Object.entries(BOSS_PROPS)) {
    const boxes = [];
    draw({ set fillStyle(v) {}, fillRect: (x, y, w, h) => boxes.push([x, y, w, h]) });
    assert.ok(boxes.length >= 4, `${id}: 소품이 너무 단순하다`);
    for (const [x, y, w, h] of boxes) {
      assert.ok(x >= 0 && y >= 0 && x + w <= W && y + h <= H, `${id}: 소품이 캔버스를 벗어난다 (${x},${y},${w},${h})`);
    }
  }
});
