// Daily quests (reset at local midnight). Gold rewards are relative: N × gold-per-kill of the best stage.
export const DAILY_QUESTS = [
  { id: 'kills',    name: '오류 100건 처리',     desc: '몬스터 100마리 처치',      target: 100, reward: { gems: 20, goldKills: 60 } },
  { id: 'upgrades', name: '인사 평가 10회',      desc: '영웅 업그레이드 10회',     target: 10,  reward: { gems: 15, goldKills: 40 } },
  { id: 'pull',     name: '데이터 가져오기',     desc: '뽑기 1회',                 target: 1,   reward: { gems: 30 } },
  { id: 'clears',   name: '시트 5장 마감',       desc: '스테이지 5회 클리어',      target: 5,   reward: { gems: 30, goldKills: 80 } },
  { id: 'boss',     name: '긴급 티켓 처리',      desc: '보스 1회 처치',            target: 1,   reward: { gems: 50 } },
  { id: 'enhance',  name: '역량 강화 3회',       desc: '카드 강화 3회',            target: 3,   reward: { gems: 15, goldKills: 40 } },
  { id: 'chests',   name: '보물 상자 개봉',      desc: '보물 상자(미믹 포함) 1개',  target: 1,   reward: { gems: 25 } },
  { id: 'elite',    name: '감사 대응',           desc: '엘리트 몬스터 3마리 처치',  target: 3,   reward: { gems: 20, goldKills: 40 } },
  { id: 'combo',    name: '연속 처리',           desc: '콤보 20 달성 1회',          target: 1,   reward: { gems: 20 } },
];
export const DAILY_COUNT = 6;
/** Which quests are on today's list: 처치 always, plus DAILY_COUNT-1 others picked by a date seed (same for everyone that day). */
export function dailyQuestIds(dateKey) {
  let h = 2166136261; for (const ch of String(dateKey)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const rest = DAILY_QUESTS.filter((q) => q.id !== 'kills').map((q) => q.id);
  for (let i = rest.length - 1; i > 0; i--) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const j = h % (i + 1); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return ['kills', ...rest.slice(0, DAILY_COUNT - 1)];
}
export const QUEST_BY_ID = Object.fromEntries(DAILY_QUESTS.map((q) => [q.id, q]));

/** Daily check-in ("출근") bonus and the bonus for finishing every quest. */
export const LOGIN_BONUS = { gems: 100, goldKills: 100 };
export const ALL_CLEAR_BONUS = { gems: 100, cards: 20 };
