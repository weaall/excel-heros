// 위장 모드 어휘집.
//
// Esc(보기 › 페이지 레이아웃)는 전투 화면만 텍스트로 바꿨을 뿐, 시트 탭·리본·작업 창의 **말**은 그대로 게임이었다.
// "메인_전투", "파티 자동 편성", "보석 900", "반복 사냥 중" 같은 문구가 한 줄만 남아도 위장은 끝난다.
// 여기에 한 곳으로 모아 두고, 켤 때 바꾸고 끌 때 되돌린다(원문은 요소의 data-real 속성에 보관).
//
// 규칙: 바꾼 말은 실제 스프레드시트 업무에서 쓰는 어휘여야 하고, 길이가 비슷해야 레이아웃이 흔들리지 않는다.

/**
 * selector → 위장 라벨. 값이 문자열이면 요소의 **첫 텍스트 노드**만 바꾼다(아이콘 span과 small은 건드리지 않음).
 * `{ text, sub }` 형태면 안쪽 <small>까지 함께 바꾼다.
 */
export const STEALTH_TEXT = Object.freeze({
  // 시트 탭 — 전투/도감 같은 말이 그대로 보이면 끝이다
  '.sheet-tab[data-sheet="home"]': 'Sheet1',
  '.sheet-tab[data-sheet="gacha"]': '외부_데이터',
  '.sheet-tab[data-sheet="quests"]': '일일_점검',
  '.sheet-tab[data-sheet="story"]': '수신_메일',
  '.sheet-tab[data-sheet="album"]': '사원_사진',
  '.sheet-tab[data-sheet="codex"]': '오류_로그',
  '.sheet-tab[data-sheet="chart"]': '요약_차트',
  // 리본
  '#qa-pull1': { text: '행 1개 추가', sub: '외부 데이터' },
  '#qa-pull10': { text: '행 10개 추가', sub: '외부 데이터' },
  '#qa-auto-party': '표 자동 정렬',
  '#qa-ad': '외부 링크',
  '#qa-login': '일일 점검',
  '#qa-collection': '요약 보기',
  '#qa-upgrade-all': '일괄 적용',
  '#qa-forecast': '예측 시트',
});

/** 위장 중에는 감춘다 — 게임 어휘를 피할 수 없는 안내류. */
export const STEALTH_HIDE = Object.freeze(['#prestige-hint']);

/**
 * 상태 표시줄 한 줄을 위장 어휘로. 같은 정보(무엇을 하는 중인지, 얼마나 남았는지)를 재계산 진행 상황으로 쓴다.
 * `now` = { kind, done, total, seconds }
 */
export function stealthStatus(now) {
  const range = 'Sheet2!A1:M8';
  switch (now.kind) {
    case 'travel': return `${range} 참조 갱신 중…`;
    case 'boss': return `${range} 대용량 수식 재계산 — 제한 ${now.seconds}초`;
    case 'challenge': return `${range} 재계산 중 — 항목 ${now.done} / ${now.total}`;
    case 'overtime': return `${range} 야간 배치 작업 — 남은 ${now.seconds}초`;
    case 'waiting': return `${range} 자동 계산 대기 — 조건 충족 시 다음 범위`;
    case 'paused': return '연결 대기 중…';
    default: return `${range} 자동 계산 중 — 반복 참조 해결`;
  }
}

/** 게임 어휘 → 스프레드시트 어휘. 로그·툴팁처럼 문장 단위로 새는 곳에 쓴다. */
const WORDS = [
  ['스테이지', '범위'], ['보스', '대용량 수식'], ['몬스터', '오류'], ['처치', '처리'],
  ['파티', '선택 영역'], ['영웅', '사원'], ['보석', '토큰'], ['골드', '포인트'],
  ['사냥', '계산'], ['전투', '계산'], ['도전', '검증'], ['레벨', '단계'],
];
export const disguise = (text) => WORDS.reduce((s, [a, b]) => s.split(a).join(b), String(text ?? ''));
