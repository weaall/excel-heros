// Stage flavour: each Phase (10 stages) is a floor of the office dungeon with its own name and tint,
// and a few sub-stages carry modifiers so a phase is not ten identical fights.
import { BALANCE } from '../config/balance.js';

// The city fell overnight; the company's staff fight district by district back toward headquarters.
// sky: [top, horizon] · glow: sun/moon haze (rgba) · far/mid: building colours · window: lit window · walk/road: pavement
export const PHASES = [
  { name: '무너진 오피스 거리', hue: 20,  tint: 0,    sky: ['#2b2f4a', '#e9a06b'], glow: 'rgba(255,170,90,0.35)', far: '#3a3550', mid: '#5b5570', window: '#ffd166', walk: '#5c6068', road: '#2f3238' },
  { name: '불타는 상업 지구',   hue: 10,  tint: 0.08, sky: ['#1d1a2e', '#c0392b'], glow: 'rgba(255,120,60,0.45)', far: '#2c1f2c', mid: '#4b2f38', window: '#ff9f43', walk: '#55504f', road: '#2b2626' },
  { name: '멈춘 지하철 입구',   hue: 200, tint: 0.1,  sky: ['#101a2b', '#4a6f9a'], glow: 'rgba(160,200,255,0.3)', far: '#1d2b3f', mid: '#33475f', window: '#a6e3ff', walk: '#4e5a68', road: '#242b34' },
  { name: '폐쇄된 대학로',      hue: 300, tint: 0.08, sky: ['#2a1b3d', '#b56576'], glow: 'rgba(255,150,200,0.3)', far: '#3a2a4a', mid: '#5a4a6a', window: '#ffc8dd', walk: '#5a545e', road: '#2e2a32' },
  { name: '어두운 강변 도로',   hue: 230, tint: 0.12, sky: ['#0b1020', '#1f3a5f'], glow: 'rgba(200,220,255,0.25)', far: '#14203a', mid: '#243858', window: '#9ad0ff', walk: '#44505e', road: '#1e2530' },
  { name: '무너진 물류 단지',   hue: 90,  tint: 0.08, sky: ['#2f3a2f', '#c9c27a'], glow: 'rgba(255,240,150,0.3)', far: '#3a4a3a', mid: '#556a55', window: '#f9f871', walk: '#5f6a5c', road: '#2f352d' },
  { name: '잿빛 법원 앞',       hue: 40,  tint: 0.1,  sky: ['#3a3a3a', '#a89f91'], glow: 'rgba(255,255,255,0.25)', far: '#4a4a4a', mid: '#6a6560', window: '#ffe8a3', walk: '#6a6a6a', road: '#35353a' },
  { name: '붉은 노을의 방송가', hue: 330, tint: 0.1,  sky: ['#2c1b2e', '#ff7b54'], glow: 'rgba(255,140,120,0.4)', far: '#3c2438', mid: '#6b3d55', window: '#ffd6a5', walk: '#5c5257', road: '#2f292d' },
  { name: '본사 앞 대로',       hue: 45,  tint: 0.14, sky: ['#1b1b30', '#f6c453'], glow: 'rgba(255,220,120,0.45)', far: '#33304a', mid: '#5c5470', window: '#fff3b0', walk: '#5f6070', road: '#2c2c3a' },
  { name: '본사 옥상 결전',     hue: 60,  tint: 0.18, sky: ['#0d0d1a', '#d4a017'], glow: 'rgba(255,230,140,0.5)', far: '#26243a', mid: '#4d4666', window: '#fff9c4', walk: '#585a6a', road: '#262636' },
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
