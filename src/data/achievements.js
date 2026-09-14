// Cumulative achievements (업적). Each has tiers; claiming a tier grants gems. Never resets.
// `stat` is read from state.stats, except maxCleared (state) and collection (owned hero count).
export const ACHIEVEMENTS = [
  { id: 'kills',      name: '오류 처리 전문가', desc: '누적 몬스터 처치',      stat: 'totalKills', tiers: [100, 1000, 10000, 100000, 1000000], gems: [20, 50, 100, 200, 500] },
  { id: 'stage',      name: '승진 가도',        desc: '최고 클리어 스테이지',  stat: 'maxCleared', tiers: [10, 20, 30, 50, 100],               gems: [50, 100, 150, 300, 500] },
  { id: 'boss',       name: '티켓 클로저',      desc: '보스 처치',             stat: 'bossKills',  tiers: [1, 10, 50, 200],                    gems: [30, 80, 200, 400] },
  { id: 'pulls',      name: '데이터 수집가',    desc: '누적 가져오기(뽑기)',   stat: 'totalPulls', tiers: [10, 50, 200, 500],                  gems: [30, 60, 120, 300] },
  { id: 'enhance',    name: '역량 개발',        desc: '카드 강화 횟수',        stat: 'enhances',   tiers: [10, 50, 200, 1000],                 gems: [20, 50, 120, 300] },
  { id: 'gold',       name: '매출 달성',        desc: '누적 골드 획득',        stat: 'totalGold',  tiers: [1e4, 1e6, 1e8, 1e10],               gems: [20, 60, 150, 400] },
  { id: 'time',       name: '근속 포상',        desc: '플레이 시간',           stat: 'playSeconds', tiers: [3600, 36000, 180000, 720000],      gems: [20, 60, 150, 400], unit: 'time' },
  { id: 'collection', name: '인재 도감',        desc: '보유 영웅 종류',        stat: 'collection', tiers: [5, 10, 15, 20],                     gems: [50, 100, 200, 500] },
];
export const ACHIEVEMENT_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
