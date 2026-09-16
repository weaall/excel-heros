import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { BALANCE } from '../src/config/balance.js';
import { HEROES, MAIN_JOBS, MAIN_ID } from '../src/data/heroes.js';
import { SKINS, skinsOf, SKIN_GEM_COST } from '../src/data/skins.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });

test('skins: every hero and main job has two skins with distinct palettes and a prompt', () => {
  for (const def of [...HEROES, ...Object.values(MAIN_JOBS)]) {
    const list = skinsOf(def.id); assert.equal(list.length, 2, def.id);
    for (const sk of list) { assert.match(sk.palette.B, /^#[0-9a-f]{6}$/i); assert.ok(sk.prompt.length > 10); assert.ok(sk.unlock.affection || sk.unlock.gems); }
    assert.notEqual(list[0].palette.B, list[1].palette.B);
  }
  assert.ok(Object.keys(SKINS).length >= HEROES.length + Object.keys(MAIN_JOBS).length);
});

test('skins: gem unlock + equip changes heroDef, affection Lv10 auto-unlocks the casual skin', () => {
  const g = new GameManager({ save: memSave() }); g.state.gems = 1000;
  const list = g.skinsOf(MAIN_ID); const formal = list.find((s) => s.id === 'formal'), casual = list.find((s) => s.id === 'casual');
  assert.equal(formal.owned, false); assert.equal(formal.canUnlock, true); assert.equal(casual.canUnlock, false); assert.match(casual.reason, /호감도/);
  assert.equal(g.equipSkin(MAIN_ID, 'formal'), false, 'cannot equip an unowned skin');
  assert.equal(g.unlockSkin(MAIN_ID, 'formal'), true); assert.equal(g.state.gems, 1000 - SKIN_GEM_COST);
  assert.equal(g.unlockSkin(MAIN_ID, 'formal'), false, 'not twice');
  assert.equal(g.equipSkin(MAIN_ID, 'formal'), true);
  assert.equal(g.heroDef(MAIN_ID).skin.id, 'formal'); assert.equal(g.heroDef(MAIN_ID).skin.palette.B, '#1f2a44');
  assert.equal(g.equipSkin(MAIN_ID, null), true); assert.equal(g.heroDef(MAIN_ID).skin, undefined);
  // affection max → casual skin granted automatically
  g.state.affection[MAIN_ID] = { xp: 0 }; g.state.challenging = false;
  for (let i = 0; i < 6000 && g.affectionOf(MAIN_ID).level < BALANCE.AFFECTION.maxLevel; i++) g.onMonsterKilled({ def: { id: 'circ:0', name: 'x' }, x: 0, y: 0, isBoss: true });
  assert.equal(g.affectionOf(MAIN_ID).level, BALANCE.AFFECTION.maxLevel);
  assert.ok(g.state.skins[MAIN_ID].owned.includes('casual'), 'casual skin auto-unlocked at max affection');
  const m = migrate(JSON.parse(JSON.stringify(g.state))); assert.deepEqual(m.skins[MAIN_ID].owned.sort(), ['casual', 'formal']);
  assert.equal(g.unlockSkin('guard', 'formal'), false, 'unowned hero');
});

test('skill levels: cards buy power and shorter cooldowns up to the cap, only once the skill is unlocked', () => {
  const g = new GameManager({ save: memSave() }); g.state.cards = 10000;
  g.state.heroes.guard = { owned: true, star: 1, shards: 0, level: 1, enhance: 0, awakened: false, skillLv: 0 };
  assert.equal(g.skillLevelInfo('guard').can, false, 'skill still locked at ★1');
  g.state.heroes.guard.star = 2;
  const p0 = g.heroView('guard').skillPower, info0 = g.skillLevelInfo('guard');
  assert.equal(info0.cost, BALANCE.SKILL_LEVEL.cardCost.D * 1);
  assert.equal(g.upgradeSkill('guard'), true); assert.equal(g.state.cards, 10000 - info0.cost);
  assert.ok(Math.abs(g.heroView('guard').skillPower / p0 - (1 + BALANCE.SKILL_LEVEL.powerPerLevel)) < 1e-9);
  assert.ok(Math.abs(g.heroView('guard').skillCdMult - (1 - BALANCE.SKILL_LEVEL.cooldownPerLevel)) < 1e-9);
  for (let i = 0; i < 10; i++) g.upgradeSkill('guard');
  assert.equal(g.state.heroes.guard.skillLv, BALANCE.SKILL_LEVEL.max); assert.equal(g.skillLevelInfo('guard').cost, null);
  g.state.party = [MAIN_ID, 'guard']; g.entities.rebuildParty();
  assert.ok(Math.abs(g.entities.heroes.find((h) => h.heroId === 'guard').skillCdMult - (1 - BALANCE.SKILL_LEVEL.max * BALANCE.SKILL_LEVEL.cooldownPerLevel)) < 1e-9);
  const m = migrate(JSON.parse(JSON.stringify(g.state))); assert.equal(m.heroes.guard.skillLv, BALANCE.SKILL_LEVEL.max); assert.equal(m.heroes.barista.skillLv, 0);
});
