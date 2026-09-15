// Milestones (마일스톤): one-time rewards for reaching progression points — auto-granted, never reset.
// Stage milestones every 5 cleared stages up to 100 (boss floors pay more), main-hero level milestones every 10.
import { BALANCE, stageLabel } from '../config/balance.js';

const stageMilestones = [];
for (let s = 5; s <= 100; s += 5) {
  const phase = Math.floor((s - 1) / BALANCE.BOSS_EVERY) + 1, boss = s % BALANCE.BOSS_EVERY === 0;
  stageMilestones.push({
    id: `stage${s}`, kind: 'stage', target: s,
    name: `${stageLabel(s)} ${boss ? '마감' : '돌파'}`, desc: `스테이지 ${s} 클리어`,
    reward: { gems: (boss ? 60 : 30) + phase * 10, cards: boss ? phase * 4 : phase * 2 },
  });
}
const levelMilestones = [];
for (let l = 10; l <= 100; l += 10) {
  levelMilestones.push({ id: `mainlv${l}`, kind: 'level', target: l, name: `김인턴 Lv ${l}`, desc: `메인 영웅 레벨 ${l} 달성`, reward: { gems: 20 + l, cards: Math.floor(l / 10) * 2 } });
}
const partyMilestones = [50, 100, 200, 300, 500].map((t, i) => ({ id: `party${t}`, kind: 'party', target: t, name: `팀 역량 ${t}`, desc: `파티 레벨 합계 ${t}`, reward: { gems: 40 + i * 30, cards: 5 + i * 5 } }));

export const MILESTONES = [...stageMilestones, ...levelMilestones, ...partyMilestones];
export const MILESTONE_BY_ID = Object.fromEntries(MILESTONES.map((m) => [m.id, m]));

/** Current value the milestone compares against. */
export function milestoneValue(state, m) {
  if (m.kind === 'stage') return state.maxCleared | 0;
  if (m.kind === 'level') return state.heroes.main?.level ?? 1;
  if (m.kind === 'party') return (state.party ?? []).reduce((a, id) => a + (state.heroes[id]?.level ?? 0), 0);
  return 0;
}
