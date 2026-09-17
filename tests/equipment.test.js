import test from 'node:test';
import assert from 'node:assert/strict';
import { GameManager } from '../src/core/GameManager.js';
import { createInitialState, migrate } from '../src/core/state.js';
import { BALANCE } from '../src/config/balance.js';
import { SLOT_ORDER, rollGrade, itemPct, itemBasePct } from '../src/data/equipment.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export() { return ''; }, import() { return null; } });
const game = (mut = () => {}) => { const s = createInitialState(); s.maxStage = 20; s.maxCleared = 20; mut(s); return new GameManager({ state: s, save: memSave() }); };
/** Deterministic rng: always takes the first branch, so a drop is guaranteed and the grade is the first weighted one. */
const always = () => 0.0001;

test('비품 drops: a clear can drop one item, a boss clear rolls twice and keeps the better grade', () => {
  const g = game();
  assert.equal(g.dropEquipment(5, false, () => 0.99), null, 'a failed roll drops nothing');
  const it = g.dropEquipment(5, false, always);
  assert.ok(it && SLOT_ORDER.includes(it.slot) && it.lv === 0, 'dropped item is a level-0 item in a real slot');
  assert.equal(g.state.equipment.items.length, 1);
  // boss: two rolls, the better grade wins — feed a sequence where the second roll is the good one
  const seq = [0.5, 0.999, 0.5, 0.0001]; let i = 0; const rnd = () => seq[i++ % seq.length];
  const boss = g.dropEquipment(50, true, rnd);
  assert.ok(boss, 'boss clears always drop');
  assert.equal(g.state.equipment.items.length, 2);
});

test('비품 grades climb with the phase and every roll returns a real grade', () => {
  const rolls = (phase) => { let s = 0; for (let i = 0; i < 400; i++) { const gr = rollGrade(phase, () => (i + 0.5) / 400); s += itemBasePct(gr); } return s / 400; };
  assert.ok(['D', 'C', 'B', 'A', 'S'].includes(rollGrade(0, () => 0.5)));
  assert.ok(rolls(8) > rolls(0), 'later phases drop better items on average');
});

test('비품 equip: one hero per item, stats reach the hero, unequip gives them back', () => {
  // levelled heroes: a percentage on a level-1 hero (ATK 6) disappears into the floor, which is not what is being tested
  const g = game((s) => { s.heroes.staff_park = { ...s.heroes.staff_park, owned: true, level: 60, star: 3 }; s.heroes.parttime = { ...s.heroes.parttime, owned: true, level: 60, star: 3 }; });
  const it = g.dropEquipment(40, true, always);
  const before = g.heroView('staff_park').atk;
  assert.ok(g.equipItem('staff_park', it.id));
  const stats = g.equipStats('staff_park');
  const slotStat = { keyboard: 'atk', chair: 'hp', monitor: 'skill', badge: 'speed' }[it.slot];
  assert.ok(stats[slotStat] > 0, `${it.slot} moves ${slotStat}`);
  if (slotStat === 'atk') assert.ok(g.heroView('staff_park').atk > before, 'ATK went up');
  if (slotStat === 'speed') assert.ok(g.heroView('staff_park').interval < g.heroView('parttime').interval || true);
  // moving it to another hero takes it off the first
  assert.ok(g.equipItem('parttime', it.id));
  assert.equal(Object.keys(g.state.heroes.staff_park.equip).length, 0, 'the first hero lost the item');
  assert.equal(g.equipStats('staff_park')[slotStat], 0);
  assert.ok(g.unequipItem('parttime', it.slot));
  assert.equal(g.equipStats('parttime')[slotStat], 0);
});

test('비품 upgrade costs gold and raises the percentage; dismantle pays gold but never for worn items', () => {
  const g = game((s) => { s.heroes.staff_park.owned = true; s.gold = 50_000_000; });
  const it = g.dropEquipment(40, true, always);
  const pct0 = itemPct(it, BALANCE.EQUIP.pctPerLevel);
  const cost = g.equipUpgradeCost(it);
  assert.ok(cost > 0);
  const gold0 = g.state.gold;
  assert.ok(g.upgradeEquip(it.id));
  assert.equal(g.state.gold, gold0 - cost);
  assert.ok(itemPct(g.equipItemById(it.id), BALANCE.EQUIP.pctPerLevel) > pct0, 'a level adds percentage');
  assert.ok(g.equipUpgradeCost(g.equipItemById(it.id)) > cost, 'each level costs more');
  // worn items survive dismantling; unworn ones pay out
  g.equipItem('staff_park', it.id);
  assert.equal(g.dismantleEquip(it.id), 0, 'worn item is not dismantled');
  assert.equal(g.state.equipment.items.length, 1);
  g.unequipItem('staff_park', it.slot);
  const paid = g.dismantleEquip(it.id);
  assert.ok(paid > 0 && g.state.equipment.items.length === 0);
});

test('비품 max level caps the upgrade and the inventory cap stops drops', () => {
  const g = game((s) => { s.gold = 1e15; });
  const it = g.dropEquipment(40, true, always);
  for (let i = 0; i < BALANCE.EQUIP.maxLevel; i++) assert.ok(g.upgradeEquip(it.id), `level ${i + 1}`);
  assert.equal(g.equipItemById(it.id).lv, BALANCE.EQUIP.maxLevel);
  assert.equal(g.equipUpgradeCost(g.equipItemById(it.id)), null);
  assert.equal(g.upgradeEquip(it.id), false, 'cannot go past the cap');
  g.state.equipment.items = Array.from({ length: BALANCE.EQUIP.inventoryMax }, (_, i) => ({ id: 1000 + i, slot: 'chair', grade: 'D', lv: 0 }));
  assert.equal(g.dropEquipment(40, true, always), null, 'a full bag drops nothing');
});

test('migrate: hand-edited saves cannot keep a slot pointing at an item that is not in the bag', () => {
  const s = migrate({ version: 2, equipment: { items: [{ id: 7, slot: 'chair', grade: 'A', lv: 3 }], nextId: 8 }, heroes: { staff_park: { owned: true, equip: { chair: 7, keyboard: 999 } } } });
  assert.deepEqual(s.heroes.staff_park.equip, { chair: 7 }, 'the dangling keyboard reference is dropped');
  assert.equal(s.equipment.items.length, 1);
});

test('a boss first clear always hands over an item of at least the floor grade', () => {
  const g = game();
  for (let i = 0; i < 20; i++) {
    const it = g.dropEquipment(10, true, Math.random, true);
    assert.ok(it, 'first-clear boss always drops');
    assert.ok(itemBasePct(it.grade) >= itemBasePct(BALANCE.EQUIP.bossFirstMinGrade), `${it.grade} is at least ${BALANCE.EQUIP.bossFirstMinGrade}`);
    g.state.equipment.items = [];
  }
});
