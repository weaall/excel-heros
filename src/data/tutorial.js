// 신입 사원 교육 (tutorial).
//
// 코치 마크 4장은 "읽고 닫는" 안내라 실제로 무엇을 눌러야 하는지 남지 않았다. 여기서는 **직접 해 보는 체크리스트**로
// 바꾼다: 각 항목은 플레이어가 그 행동을 실제로 했을 때만 완료되고, 완료하면 보석을 준다. 건너뛰어도 목록은 남아
// 있으므로 언제든 이어서 할 수 있다.
//
// `check(g)` 는 GameManager 하나만 받는 순수 판정이다(상태를 바꾸지 않는다).

export const TUTORIAL = Object.freeze([
  {
    id: 'pull', title: '사원 채용하기', gems: 100,
    text: '삽입 탭의 「10행 가져오기」로 카드를 뽑습니다. 시작 보석으로 바로 한 번 돌려 보세요.',
    target: '#qa-pull10',
    check: (g) => (g.state.stats.totalPulls ?? 0) >= 10,
  },
  {
    id: 'detail', title: '카드 열어 보기', gems: 50,
    text: '인사_명단에서 카드를 누르면 상세 창이 열립니다. 정보·스킬·비품·스킨·프로필·호감도가 모두 여기 있습니다.',
    target: '.sheet-tab[data-sheet="roster"]',
    check: (g) => !!g.state.tutorial?.flags?.detail,
  },
  {
    id: 'party', title: '파티에 배치하기', gems: 50,
    text: '상세 창의 「파티 배치」로 사원을 전투에 넣습니다. 최대 5명이고 주인공은 항상 고정입니다.',
    target: '#qa-auto-party',
    check: (g) => g.state.party.length >= 3,
  },
  {
    id: 'level', title: '레벨 올리기', gems: 50,
    text: '오른쪽 파티 관리 창의 「+1」로 골드를 써서 강해집니다. 레벨은 언제든 100% 환급되니 아끼지 마세요.',
    target: '#hero-table',
    check: (g) => (g.state.stats.upgrades ?? 0) >= 5 || g.state.party.some((id) => g.state.heroes[id].level >= 5),
  },
  {
    id: 'challenge', title: '다음 단계 도전하기', gems: 100,
    text: '충분히 강해지면 「도전」으로 다음 스테이지에 갑니다. 승산이 표시되고, 자동 진행을 켜면 알아서 올라갑니다.',
    target: '#qa-challenge',
    check: (g) => (g.state.maxCleared ?? 0) >= 3,
  },
  {
    id: 'star', title: '한계 돌파 이해하기', gems: 100,
    text: '레벨에는 ★로 정해진 상한이 있습니다. 같은 카드를 또 뽑으면 여분으로 쌓이고, ★N으로 올리려면 같은 카드 N장이 필요합니다 — 올리면 상한이 열립니다.',
    target: '.sheet-tab[data-sheet="roster"]',
    check: (g) => Object.values(g.state.heroes).some((h) => h.owned && (h.star ?? 0) >= 2) || Object.values(g.state.heroes).some((h) => (h.shards ?? 0) > 0),
  },
  {
    id: 'stealth', title: '페이지 레이아웃 보기', gems: 100,
    text: 'Esc를 누르면 전투 화면이 표로 바뀌고 용어도 전부 스프레드시트가 됩니다. 한 번 눌러 보세요.',
    target: '#qa-stealth',
    check: (g) => !!g.state.tutorial?.flags?.stealth,
  },
]);

export const TUTORIAL_BONUS = 300; // 전 항목 완료 보상
export const stepById = (id) => TUTORIAL.find((s) => s.id === id) ?? null;
