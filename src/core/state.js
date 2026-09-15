import { BALANCE } from '../config/balance.js';
import { HEROES, MAIN_ID } from '../data/heroes.js';
import { initialPity } from './GachaManager.js';
import { dailyQuestIds } from '../data/quests.js';

export const SAVE_VERSION = 2;

export const localDateKey = (now = Date.now()) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const emptyHero = () => ({ owned: false, star: 0, shards: 0, level: 1, enhance: 0, awakened: false });

export function createInitialState(now = Date.now()) {
  const heroes = {};
  for (const h of HEROES) heroes[h.id] = emptyHero();
  heroes[MAIN_ID] = { owned: true, star: 1, shards: 0, level: 1, enhance: 0 };
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSaved: now,
    gold: BALANCE.STARTING_GOLD,
    gems: BALANCE.STARTING_GEMS,
    cards: 0,             // 강화 카드 (converted from shards / dismissed cards)
    stage: 1,
    maxStage: 1,          // highest stage ever reached
    maxCleared: 0,        // highest stage ever cleared (first-clear gem rewards)
    kills: 0,
    challenging: true,   // new games start by challenging Phase 1-1
    heroes,
    main: { job: 'intern' },
    party: [MAIN_ID],
    pity: initialPity(),
    recruit: { points: 0 },
    affection: {},        // hero id -> { xp, gift: 'YYYY-MM-DD' of the last 간식 }
    storyRead: {},        // episode id -> true (first read rewarded) // 모집 포인트: +1 per row pulled, spend SPARK_COST on the current pickup card
    team: { coffee: 0, payroll: 0, chairs: 0 },
    settings: { excel: false, autoAdvance: true, autoUpgrade: false, sound: false, gridlines: true, safeAdvance: true, cloud: { url: '', name: '' } },
    daily: { date: localDateKey(now), quests: dailyQuestIds(localDateKey(now)), progress: {}, claimed: {}, loginClaimed: false, allClearClaimed: false, adsUsed: 0 },
    stats: { totalKills: 0, totalGold: 0, totalPulls: 0, pullGrades: { D: 0, C: 0, B: 0, A: 0, S: 0 }, bossKills: 0, bossFails: 0, playSeconds: 0, enhances: 0 },
    achievements: {},     // achievement id -> claimed tier count
    prestige: { shares: 0, count: 0 }, // 회사 이전: permanent 지분 and how many times
    milestones: {},       // milestone id -> granted
    favorites: {},        // hero id -> true (♥ 즐겨찾기: sorted first in the roster)
    bestiary: {},         // monster type id -> kills (id + '!' = elite kills) — 오류_도감 sheet
    login: { streak: 0, last: null }, // consecutive 출근 days and the date key of the last stamp
  };
}

/** Migrate older saves & fill in missing keys defensively. Saves older than v2 are discarded (pre-release). */
export function migrate(raw) {
  const fresh = createInitialState();
  if (!raw || typeof raw !== 'object' || (raw.version | 0) < 2) return fresh;
  const s = { ...fresh, ...raw };
  s.heroes = { ...fresh.heroes, ...(raw.heroes ?? {}) };
  for (const id of Object.keys(s.heroes)) s.heroes[id] = { ...emptyHero(), ...s.heroes[id] };
  s.main = { ...fresh.main, ...(raw.main ?? {}) };
  s.pity = { ...fresh.pity, ...(raw.pity ?? {}) };
  s.recruit = { ...fresh.recruit, ...(raw.recruit ?? {}) };
  s.affection = { ...(raw.affection ?? {}) };
  s.storyRead = { ...(raw.storyRead ?? {}) };
  s.team = { ...fresh.team, ...(raw.team ?? {}) };
  s.settings = { ...fresh.settings, ...(raw.settings ?? {}) };
  s.daily = { ...fresh.daily, ...(raw.daily ?? {}) };
  if (!Array.isArray(s.daily.quests) || !s.daily.quests.length) s.daily.quests = dailyQuestIds(s.daily.date);
  s.stats = { ...fresh.stats, ...(raw.stats ?? {}) };
  s.stats.pullGrades = { ...fresh.stats.pullGrades, ...(raw.stats?.pullGrades ?? {}) };
  s.achievements = { ...(raw.achievements ?? {}) };
  s.prestige = { ...fresh.prestige, ...(raw.prestige ?? {}) };
  s.milestones = { ...(raw.milestones ?? {}) };
  s.favorites = { ...(raw.favorites ?? {}) };
  s.bestiary = { ...(raw.bestiary ?? {}) };
  s.login = { ...fresh.login, ...(raw.login ?? {}) };
  s.party = (Array.isArray(raw.party) ? raw.party : fresh.party).filter((id) => s.heroes[id]?.owned).slice(0, BALANCE.PARTY_SIZE);
  if (s.party.length === 0) s.party = [MAIN_ID];
  s.heroes[MAIN_ID].owned = true;
  if (s.heroes[MAIN_ID].star < 1) s.heroes[MAIN_ID].star = 1;
  s.stage = Math.max(1, s.stage | 0);
  s.maxStage = Math.max(s.stage, s.maxStage | 0);
  // Saves from before the farm/challenge model: an already-cleared stage is farmed, not re-challenged.
  if (s.challenging === undefined || (s.challenging && s.stage <= (s.maxCleared | 0))) s.challenging = s.stage > (s.maxCleared | 0);
  s.cards = Math.max(0, s.cards | 0);
  s.version = SAVE_VERSION;
  return s;
}
