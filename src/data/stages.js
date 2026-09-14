// Stage flavour: each Phase (10 stages) is a floor of the office dungeon with its own name and tint,
// and a few sub-stages carry modifiers so a phase is not ten identical fights.
import { BALANCE } from '../config/balance.js';

export const PHASES = [
  { name: '인사팀 지하 창고', hue: 0,   tint: 0 },
  { name: '회계팀 서버실',    hue: 200, tint: 0.14 },
  { name: '영업팀 회의실',    hue: 30,  tint: 0.12 },
  { name: '마케팅 자료실',    hue: 300, tint: 0.14 },
  { name: '개발팀 야근실',    hue: 230, tint: 0.18 },
  { name: '총무팀 비품 창고', hue: 90,  tint: 0.12 },
  { name: '법무팀 문서 보관소', hue: 40, tint: 0.16 },
  { name: '임원실 복도',      hue: 330, tint: 0.14 },
  { name: '대표이사실',       hue: 45,  tint: 0.2 },
  { name: '회장실 금고',      hue: 60,  tint: 0.24 },
];

export const phaseIndex = (stage) => Math.floor((Math.max(1, stage) - 1) / BALANCE.BOSS_EVERY);
export const phaseTheme = (stage) => PHASES[phaseIndex(stage) % PHASES.length];
export const phaseName = (stage) => { const p = phaseIndex(stage); const floor = Math.floor(p / PHASES.length); return `${PHASES[p % PHASES.length].name}${floor ? ` ${floor + 1}차` : ''}`; };

/** Stage modifiers by sub-stage: x-5 야근 러시, x-8 감사 기간, x-10 boss (handled elsewhere). */
export const MODIFIERS = {
  rush:  { id: 'rush',  name: '야근 러시', desc: '몬스터 +2 · 이동 속도 +30% · 골드 ×1.3', count: 2, speed: 1.3, gold: 1.3, elite: 1 },
  elite: { id: 'elite', name: '감사 기간', desc: '엘리트 출현 ×3 · 골드 ×1.2',            count: 0, speed: 1,   gold: 1.2, elite: 3 },
};
export function stageModifier(stage) {
  const sub = ((Math.max(1, stage) - 1) % BALANCE.BOSS_EVERY) + 1;
  if (sub === 5) return MODIFIERS.rush;
  if (sub === 8) return MODIFIERS.elite;
  return null;
}
