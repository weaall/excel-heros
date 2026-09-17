// 비품 (equipment): four office supplies per hero. A hero already grows through level / ★ / 강화 / 각성 / 스킬 Lv /
// 호감도; 비품 is the axis that comes from *playing stages* rather than from spending a currency, and it is where the
// endless late-game gold finally goes (upgrades). Items drop on stage clears, are equipped per hero per slot, and can
// be upgraded with gold or dismantled back into gold.
import { GRADES, GRADE_ORDER } from './heroes.js';

/** Slot → the combat number it moves. One slot per stat so a full set reads as "이 사원은 공격형/방어형". */
export const SLOTS = Object.freeze({
  keyboard: { id: 'keyboard', name: '키보드', stat: 'atk', label: '공격력', icon: '⌨', desc: '공격력 +{v}%' },
  chair: { id: 'chair', name: '의자', stat: 'hp', label: '체력', icon: '🪑', desc: '체력 +{v}%' },
  monitor: { id: 'monitor', name: '모니터', stat: 'skill', label: '스킬 위력', icon: '🖥', desc: '스킬 위력 +{v}%' },
  badge: { id: 'badge', name: '사원증', stat: 'speed', label: '공격 속도', icon: '🪪', desc: '공격 속도 +{v}%' },
});
export const SLOT_ORDER = Object.freeze(['keyboard', 'chair', 'monitor', 'badge']);

/** Item names by slot and grade — the same object, one rung up the office ladder each time. */
const NAMES = {
  keyboard: { D: '지급품 키보드', C: '멤브레인 키보드', B: '기계식 키보드', A: '무접점 키보드', S: '장인이 깎은 키보드' },
  chair: { D: '접이식 의자', C: '사무용 회전의자', B: '메시 등받이 의자', A: '인체공학 의자', S: '임원용 가죽 의자' },
  monitor: { D: '중고 모니터', C: 'FHD 모니터', B: '와이드 모니터', A: '듀얼 4K 모니터', S: '커브드 울트라와이드' },
  badge: { D: '임시 출입증', C: '사원증', B: '팀장 사원증', A: '임원 사원증', S: '전사 마스터 키' },
};

/** Base percentage by grade (before levels). Deliberately smaller than ★/각성 so 비품 is a supplement, not a shortcut. */
const BASE_PCT = { D: 2, C: 4, B: 7, A: 11, S: 16 };

export const itemName = (slot, grade) => NAMES[slot]?.[grade] ?? slot;
export const itemBasePct = (grade) => BASE_PCT[grade] ?? 0;
/** Percentage an item currently gives: base + level steps. */
export const itemPct = (item, perLevel) => +(itemBasePct(item.grade) * (1 + (item.lv | 0) * perLevel)).toFixed(2);
export const itemLabel = (item) => `${itemName(item.slot, item.grade)}${item.lv ? ` +${item.lv}` : ''}`;

/**
 * Grade of a dropped item. Later phases shift the table upward; a boss clear rolls one extra time and keeps the best,
 * so bosses are the reason to keep challenging instead of farming a comfortable stage forever.
 */
export function rollGrade(phase, rnd = Math.random) {
  const p = Math.max(0, phase);
  const w = { D: Math.max(4, 40 - p * 6), C: 30, B: 14 + p * 2, A: 4 + p * 1.5, S: 0.4 + p * 0.4 };
  const total = GRADE_ORDER.reduce((a, g) => a + (w[g] ?? 0), 0);
  let r = rnd() * total;
  for (const g of GRADE_ORDER) { r -= w[g] ?? 0; if (r <= 0) return g; }
  return 'D';
}
/** A dropped item is always level 0; the slot is uniform so no slot starves. */
export function rollItem(phase, rnd = Math.random) {
  const slot = SLOT_ORDER[Math.floor(rnd() * SLOT_ORDER.length) % SLOT_ORDER.length];
  return { slot, grade: rollGrade(phase, rnd), lv: 0 };
}
export const gradeColor = (g) => GRADES[g]?.color ?? '#888';
