// 부문 (divisions): every department belongs to one of 7 divisions. Putting 2+ heroes of the same division in the
// party unlocks a 부문 시너지 (pure data — the bonus math lives in GameManager.synergy()).
import { PROFILES } from './profiles.js';

export const DIVISIONS = Object.freeze({
  admin:   { id: 'admin',   name: '경영지원', color: '#5d6d7e' },
  ops:     { id: 'ops',     name: '시설·복지', color: '#27ae60' },
  people:  { id: 'people',  name: '인사',     color: '#e67e22' },
  finance: { id: 'finance', name: '재무·감사', color: '#b7950b' },
  tech:    { id: 'tech',    name: '기술',     color: '#2b7cd3' },
  market:  { id: 'market',  name: '영업·마케팅', color: '#c0392b' },
  exec:    { id: 'exec',    name: '임원',     color: '#8e44ad' },
});

const DEPT_DIVISION = {
  '경영지원본부': 'admin', '총무팀': 'admin', '경영기획팀': 'admin', '운영본부': 'admin',
  '리셉션': 'ops', '보안팀': 'ops', '사내 카페': 'ops', '미화팀': 'ops', '복지팀': 'ops', '사내 의무실': 'ops', '외부 협력': 'ops',
  '인사팀': 'people', '인사본부': 'people',
  '회계팀': 'finance', '재무본부': 'finance', '감사팀': 'finance', '법무팀': 'finance',
  '개발팀': 'tech', '기술본부': 'tech', 'IT 지원팀': 'tech', '데이터팀': 'tech', '연구소': 'tech',
  '마케팅팀': 'market', '마케팅본부': 'market', '영업팀': 'market', '홍보팀': 'market', '기획팀': 'market', '디자인팀': 'market',
  '대표이사실': 'exec', '회장실': 'exec', '이사회': 'exec',
};

/** Division id for a hero id ('main' for the main hero). Unknown departments fall back to 경영지원. */
export function divisionOf(heroId) {
  const dept = PROFILES[heroId]?.dept;
  return DEPT_DIVISION[dept] ?? 'admin';
}
export const divisionName = (heroId) => DIVISIONS[divisionOf(heroId)].name;

/** Synergy ladder: same-division head count → bonus. 균형 편성 (all 4 roles) adds HP on top. */
export const SYNERGY = Object.freeze({
  pair:     { count: 2, atk: 0.05, hp: 0 },
  trio:     { count: 3, atk: 0.12, hp: 0.06 },
  balanced: { hp: 0.10 },
});
