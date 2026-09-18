import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import { BALANCE } from '../src/config/balance.js';
import { HEROES, MAIN_ID } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';
import { EXTRA } from '../src/data/profilesExtra.js';
import { EPISODES, episodeUnlocked } from '../src/data/story.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const kill = (g, boss = false) => g.onMonsterKilled({ def: { id: 'circ:0', name: 'x' }, x: 0, y: 0, isBoss: boss });

test('호감도: party members gain xp per kill, levels follow the xp ladder and buff ATK/HP', () => {
  const g = new GameManager({ save: memSave() }); g.state.challenging = false;
  const A = BALANCE.AFFECTION; const atk0 = g.heroView(MAIN_ID).atk;
  assert.equal(g.affectionOf(MAIN_ID).level, 0);
  const need1 = GameManager.affectionXpFor(1);
  for (let i = 0; i < need1; i++) kill(g);
  assert.equal(g.affectionOf(MAIN_ID).level, 1); assert.equal(g.affectionOf(MAIN_ID).xp, 0);
  assert.ok(g.heroView(MAIN_ID).atk >= Math.floor(atk0 * (1 + A.bonusPerLevel)) - 1);
  kill(g, true); assert.equal(g.affectionOf(MAIN_ID).total, need1 + A.xpPerBoss);
  // cap at max level
  g.state.affection[MAIN_ID].xp = 1e9; const a = g.affectionOf(MAIN_ID);
  assert.equal(a.level, A.maxLevel); assert.equal(a.maxed, true); assert.equal(a.pct, 1); assert.equal(a.secretUnlocked, true); assert.equal(a.lineUnlocked, true);
  assert.ok(Math.abs(g.heroView(MAIN_ID).affection.bonus - A.maxLevel * A.bonusPerLevel) < 1e-9);
  // ladder grows
  assert.ok(GameManager.affectionXpFor(5) > GameManager.affectionXpFor(1));
});

test('간식: once per hero per day, costs stage-relative gold, adds giftXp; heroes not owned cannot be gifted', () => {
  const g = new GameManager({ save: memSave() }); g.state.maxStage = 12; g.state.gold = 1e9;
  const cost = g.giftCost(); assert.ok(cost > 0);
  assert.equal(g.giveGift('guard'), false, 'not owned');
  assert.equal(g.giveGift(MAIN_ID), true);
  assert.equal(g.state.gold, 1e9 - cost); assert.equal(g.affectionOf(MAIN_ID).total, BALANCE.AFFECTION.giftXp); assert.equal(g.affectionOf(MAIN_ID).gifted, true);
  assert.equal(g.giveGift(MAIN_ID), false, 'already today');
  g.state.gold = 0; g.state.affection[MAIN_ID].gift = '2000-01-01'; assert.equal(g.giveGift(MAIN_ID), false, 'no gold');
  const m = migrate(JSON.parse(JSON.stringify(g.state))); assert.equal(m.affection[MAIN_ID].xp, BALANCE.AFFECTION.giftXp);
});

test('사내 메신저: episodes unlock by phase, first read pays gems once, all speakers exist', () => {
  const ids = new Set([...HEROES.map((h) => h.id), 'main', 'sys']);
  for (const ep of EPISODES) for (const [who] of ep.lines) assert.ok(ids.has(who), `${ep.id}: unknown speaker ${who}`);
  // 편수를 박아 두면 이야기를 더할 때마다 실패한다 — 대신 구조를 본다
  assert.ok(EPISODES.length >= 10, `${EPISODES.length}편`);
  EPISODES.forEach((ep, i) => {
    assert.equal(ep.phase, i + 1, `${ep.id}: phase 가 1부터 빠짐없이 이어져야 한다`);
    assert.ok(ep.title && ep.room && ep.lines.length >= 5, `${ep.id}: 제목·방·최소 5줄`);
  });
  assert.equal(new Set(EPISODES.map((e) => e.id)).size, EPISODES.length, 'id 중복 없음');
  const g = new GameManager({ save: memSave() });
  assert.equal(g.storyUnlocked('ep1'), true); assert.equal(g.storyUnlocked('ep2'), false);
  assert.equal(g.readStory('ep2'), 0, 'locked');
  const gems0 = g.state.gems; assert.equal(g.readStory('ep1'), BALANCE.STORY.gems); assert.equal(g.state.gems, gems0 + BALANCE.STORY.gems);
  assert.equal(g.readStory('ep1'), 0, 'only once');
  g.state.maxStage = 41; assert.equal(g.storyUnlocked('ep5'), true); assert.equal(episodeUnlocked(EPISODES[9], 91), true); assert.equal(episodeUnlocked(EPISODES[9], 90), false);
});

test('every profile has 호감도 extras (secret + private line)', () => {
  for (const id of Object.keys(PROFILES)) { assert.ok(EXTRA[id]?.secret, id); assert.ok(EXTRA[id]?.line2, id); }
});

test('speech bubbles: sayLine puts a profile line on a living party member and it expires', () => {
  const g = new GameManager({ save: memSave() });
  g.sayLine();
  const h = g.entities.heroes.find((x) => x.say); assert.ok(h, 'someone speaks'); assert.equal(h.say.text, PROFILES.main.line);
  for (let i = 0; i < 40; i++) g.entities.update(0.1);
  assert.equal(g.entities.heroes.some((x) => x.say), false, 'bubble expired');
});
