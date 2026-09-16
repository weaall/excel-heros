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
  '대표이사실': 'exec', '회장실': 'exec', '이사회': 'exec', '전략기획실': 'exec',
  'AI연구소': 'tech', '보안연구소': 'tech', '노동조합': 'people',
  '해외사업팀': 'market', '고객경험본부': 'market', '물류팀': 'ops', '데이터본부': 'tech',
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

/** 부문 고유 특성: unlocked for the whole party once that division has 2+ members (on top of the ATK/HP ladder).
 *  Values are additive fractions; EntityManager reads them from GameManager.synergy().perks. */
export const PERKS = Object.freeze({
  admin:   { key: 'gold',     value: 0.08, desc: '골드 획득 +8%' },
  ops:     { key: 'regen',    value: 0.01, desc: '파티 초당 HP 회복 +1%' },
  people:  { key: 'revive',   value: 0.30, desc: '쓰러진 영웅 복귀 시간 -30%' },
  finance: { key: 'boss',     value: 0.15, desc: '보스에게 주는 피해 +15%' },
  tech:    { key: 'cooldown', value: 0.15, desc: '스킬 재사용 대기 -15%' },
  market:  { key: 'crit',     value: 0.08, desc: '파티 전원 치명타 확률 +8%' },
  exec:    { key: 'skill',    value: 0.20, desc: '스킬 위력 +20%' },
});
