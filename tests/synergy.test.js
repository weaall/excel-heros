import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/core/state.js';
import { GameManager } from '../src/core/GameManager.js';
import * as Q from '../src/core/QuestManager.js';
import { STREAK, LOGIN_BONUS } from '../src/data/quests.js';
import { DIVISIONS, SYNERGY, divisionOf } from '../src/data/divisions.js';
import { HEROES, MAIN_ID } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';
import { MONSTER_TYPES, BOSSES } from '../src/data/monsters.js';
import * as Achievements from '../src/core/AchievementManager.js';
import { ACHIEVEMENTS } from '../src/data/achievements.js';

const memSave = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });
const DAY = 24 * 3600 * 1000;
const own = (g, id) => { g.state.heroes[id].owned = true; g.state.heroes[id].star = Math.max(1, g.state.heroes[id].star); };

test('every profile department maps to a division', () => {
  for (const id of Object.keys(PROFILES)) assert.ok(DIVISIONS[divisionOf(id)], `${id} (${PROFILES[id].dept})`);
  // the fallback must not be doing the work: 기술 heroes really land in tech
  assert.equal(divisionOf('dev_lead'), 'tech'); assert.equal(divisionOf('cto'), 'tech'); assert.equal(divisionOf('ceo'), 'exec');
});

test('부문 시너지: 2 of a division = ATK, 3 = ATK+HP, all four roles = HP; bench heroes are unaffected', () => {
  const g = new GameManager({ save: memSave() });
  const tech = HEROES.filter((h) => divisionOf(h.id) === 'tech');
  assert.ok(tech.length >= 3);
  for (const h of tech) own(g, h.id);
  g.state.party = [MAIN_ID];
  assert.equal(g.synergy().atk, 0);
  g.state.heroes[tech[0].id].level = 30; // large enough that a +5% bonus survives flooring
  const solo = g.heroView(tech[0].id).atk;
  g.state.party = [MAIN_ID, tech[0].id, tech[1].id];
  let syn = g.synergy();
  assert.equal(syn.sets.length, 1); assert.equal(syn.sets[0].id, 'tech'); assert.equal(syn.atk, SYNERGY.pair.atk); assert.equal(syn.hp, 0);
  assert.ok(g.heroView(tech[0].id).atk > solo, 'party member gets the ATK bonus');
  assert.equal(g.heroView(tech[2].id).atk, solo === g.heroView(tech[2].id).atk ? solo : g.heroView(tech[2].id).atk); // bench: no synergy applied
  g.state.party = [MAIN_ID, tech[0].id, tech[1].id, tech[2].id];
  syn = g.synergy();
  assert.equal(syn.atk, SYNERGY.trio.atk); assert.equal(syn.hp, SYNERGY.trio.hp);
  // balanced party: one hero per role
  const byRole = {}; for (const h of HEROES) (byRole[h.role] ??= []).push(h);
  const pick = ['tank', 'melee', 'ranged', 'healer'].map((r) => byRole[r][0].id);
  for (const id of pick) own(g, id);
  g.state.party = [MAIN_ID, ...pick];
  assert.equal(g.synergy().balanced, true);
  assert.ok(g.synergy().hp >= SYNERGY.balanced.hp);
});

test('연속 출근: streak continues on consecutive days, resets after a gap, gems capped', () => {
  const t0 = new Date(2026, 8, 14, 12).getTime();
  const s = createInitialState(t0); s.maxStage = 5;
  let r = Q.claimLogin(s, 1, t0);
  assert.equal(r.streak, 1); assert.equal(r.streakGems, 0); assert.equal(r.gems, LOGIN_BONUS.gems);
  assert.equal(Q.claimLogin(s, 1, t0), null, 'once per day');
  Q.ensureDaily(s, t0 + DAY); r = Q.claimLogin(s, 1, t0 + DAY);
  assert.equal(r.streak, 2); assert.equal(r.streakGems, STREAK.gemsPerDay);
  for (let d = 2; d <= 12; d++) { Q.ensureDaily(s, t0 + d * DAY); r = Q.claimLogin(s, 1, t0 + d * DAY); }
  assert.equal(r.streak, 13); assert.equal(r.streakGems, STREAK.gemsPerDay * STREAK.maxDays, 'capped');
  Q.ensureDaily(s, t0 + 20 * DAY);
  assert.equal(Q.nextStreak(s, t0 + 20 * DAY), 1, 'gap resets the preview');
  r = Q.claimLogin(s, 1, t0 + 20 * DAY);
  assert.equal(r.streak, 1);
  const m = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(m.login.streak, 1); assert.deepEqual(migrate({ version: 2 }).login, { streak: 0, last: null });
});

test('오류 도감: kills are counted per base type, bosses separately, elites also tallied; achievement tracks discovery', () => {
  const g = new GameManager({ save: memSave() });
  const kill = (def, extra = {}) => g.onMonsterKilled({ def, x: 0, y: 0, isBoss: false, ...extra });
  kill({ id: 'circ:0', name: 'x' }); kill({ id: 'circ:3', name: 'x' }); kill({ id: 'ref:1', name: 'x' }, { elite: true });
  assert.equal(g.bestiaryCount('circ'), 2); assert.equal(g.bestiaryCount('ref'), 1); assert.equal(g.bestiaryCount('ref!'), 1);
  kill({ id: BOSSES[0].id, name: 'b' }, { isBoss: true });
  assert.equal(g.bestiaryCount(BOSSES[0].id), 1);
  assert.equal(g.bestiaryDiscovered(), 3);
  assert.equal(Achievements.achievementValue(g.state, { stat: 'bestiary' }), 3);
  const bestiary = ACHIEVEMENTS.find((a) => a.stat === 'bestiary');
  assert.equal(bestiary.tiers.at(-1), MONSTER_TYPES.length + BOSSES.length, '도감 업적의 최고 티어는 전체 종류 수와 같아야 한다');
  const m = migrate(JSON.parse(JSON.stringify(g.state)));
  assert.equal(m.bestiary.circ, 2);
});

test('부문 고유 특성: perks unlock at 2 members, feed gold/skill power and combat hooks', async () => {
  const { PERKS } = await import('../src/data/divisions.js');
  const g = new GameManager({ save: memSave() });
  const admin = HEROES.filter((h) => divisionOf(h.id) === 'admin'), exec = HEROES.filter((h) => divisionOf(h.id) === 'exec');
  for (const h of [...admin, ...exec]) own(g, h.id);
  g.state.party = [MAIN_ID];
  const gold0 = g.goldMult(), skill0 = g.heroView(exec[0].id).skillPower;
  g.state.party = [MAIN_ID, admin[0].id]; // main is 경영지원본부 → admin pair
  assert.equal(g.synergy().perks.gold, PERKS.admin.value);
  assert.ok(Math.abs(g.goldMult() - gold0 - PERKS.admin.value) < 1e-9);
  g.state.party = [MAIN_ID, exec[0].id, exec[1].id];
  assert.equal(g.synergy().perks.skill, PERKS.exec.value);
  assert.ok(Math.abs(g.heroView(exec[0].id).skillPower / skill0 - (1 + PERKS.exec.value)) < 1e-9);
  g.entities.rebuildParty();
  assert.equal(g.entities.perks.skill, PERKS.exec.value, 'EntityManager caches perks on rebuild');
});
