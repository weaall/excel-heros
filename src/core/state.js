import { BALANCE } from '../config/balance.js';
import { HEROES, STARTER_HERO } from '../data/heroes.js';
import { initialPity } from './GachaManager.js';

export const SAVE_VERSION = 1;

export function createInitialState(now = Date.now()) {
  const heroes = {};
  for (const h of HEROES) heroes[h.id] = { owned: false, star: 0, shards: 0, level: 1 };
  heroes[STARTER_HERO] = { owned: true, star: 1, shards: 0, level: 1 };
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSaved: now,
    gold: BALANCE.STARTING_GOLD,
    gems: BALANCE.STARTING_GEMS,
    stage: 1,
    maxStage: 1,          // highest stage ever reached
    maxCleared: 0,        // highest stage ever cleared (first-clear gem rewards)
    kills: 0,
    heroes,
    party: [STARTER_HERO],
    pity: initialPity(),
    team: { coffee: 0, payroll: 0, chairs: 0 },
    settings: { stealth: false, autoBoss: true },
    stats: { totalKills: 0, totalGold: 0, totalPulls: 0, bossKills: 0, bossFails: 0, playSeconds: 0 },
  };
}

/** Migrate older saves & fill in missing keys defensively. */
export function migrate(raw) {
  const fresh = createInitialState();
  if (!raw || typeof raw !== 'object') return fresh;
  const s = { ...fresh, ...raw };
  s.heroes = { ...fresh.heroes, ...(raw.heroes ?? {}) };
  for (const id of Object.keys(s.heroes)) {
    s.heroes[id] = { ...(fresh.heroes[id] ?? { owned: false, star: 0, shards: 0, level: 1 }), ...s.heroes[id] };
  }
  s.pity = { ...fresh.pity, ...(raw.pity ?? {}) };
  s.team = { ...fresh.team, ...(raw.team ?? {}) };
  s.settings = { ...fresh.settings, ...(raw.settings ?? {}) };
  s.stats = { ...fresh.stats, ...(raw.stats ?? {}) };
  s.party = (Array.isArray(raw.party) ? raw.party : fresh.party).filter((id) => s.heroes[id]?.owned).slice(0, BALANCE.PARTY_SIZE);
  if (s.party.length === 0) s.party = [STARTER_HERO];
  s.heroes[STARTER_HERO].owned = true;
  if (s.heroes[STARTER_HERO].star < 1) s.heroes[STARTER_HERO].star = 1;
  s.stage = Math.max(1, s.stage | 0);
  s.maxStage = Math.max(s.stage, s.maxStage | 0);
  s.version = SAVE_VERSION;
  return s;
}
