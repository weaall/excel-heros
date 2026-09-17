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
    const spec = MONSTER_MAP[b.id];
    // 0x72 팩의 큰 생물(문자열)이거나, 보스 배율로 그리는 Tiny Creatures({ tiny, boss })이거나.
    const creature = typeof spec === 'string' ? 'pack:' + spec : spec?.tiny != null ? 'tiny:' + spec.tiny : null;
    assert.ok(creature, `${b.id}: 전용 생물이 없다`);
    assert.ok(spec?.tiny == null || spec.boss, `${b.id}: 보스는 보스 배율(boss: true)로 그려야 일반 몬스터와 크기가 구분된다`);
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

// 이름과 그림이 어긋나면 도트를 아무리 잘 그려도 소용이 없다. 실제로 야근 닭이 초록 거북, 야근 고양이가 마른
// 나무, 마감 토끼가 갈색 덩어리였다. 어긋남 자체는 눈으로 봐야 하지만, **두 몬스터가 같은 그림을 쓰는 것**은
// 여기서 막을 수 있다 — 그러면 이름만 다른 같은 적이 된다.
test('no two monster types (or bosses) share the same creature sprite', async () => {
  const { MONSTER_MAP } = await import('../src/data/packSprites.js');
  const { MONSTER_TYPES, BOSSES } = await import('../src/data/monsters.js');
  const seen = new Map();
  for (const def of [...MONSTER_TYPES, ...BOSSES]) {
    const v = MONSTER_MAP[def.id];
    if (v == null) continue; // 손그림(MONSTER_MAPS)으로 그리는 종류
    const key = typeof v === 'string' ? 'pack:' + v : v.tiny != null ? 'tiny:' + v.tiny : null;
    if (!key) continue;
    assert.equal(seen.get(key), undefined, `${def.id} 와 ${seen.get(key)} 가 같은 그림(${key})을 쓴다`);
    seen.set(key, def.id);
  }
  assert.ok(seen.size >= 25, `고유 그림이 너무 적다 (${seen.size})`);
});
