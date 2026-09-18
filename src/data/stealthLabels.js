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
  '#rb-label-combat': '계산',
  '#stage-k-mode': '상태',
  '#stage-k-range': '범위',
  '#bestiary-title': '이번 범위 요약',
});

/** 위장 중에는 감춘다 — 게임 어휘를 피할 수 없는 안내류. */
// 위장 중 숨길 요소. 승진·이전 권유는 문장 전체가 게임이라 바꿀 말이 없다 — 자리도 작아 레이아웃에
// 영향이 적다(작업 창 위쪽, 교육 창과 달리 높이가 고정돼 있지 않다).
export const STEALTH_HIDE = Object.freeze(['#prestige-hint', '#promo-hint']);

/**
 * 위장 중 전투 로그 한 줄. 접두사만 바꾸고 본문을 그대로 두면 "마일스톤 달성 … (보석 15)" 같은 문장이
 * 통째로 남는다(실측 6-101). 행 번호로 결정되므로 0.5초마다 다시 그려도 문장이 흔들리지 않는다.
 */
export function stealthLogLine(row) {
  const KIND = [
    (r) => `Sheet2!A${(r % 200) + 1}:M${(r % 200) + 8} 재계산 완료`,
    (r) => `SUMIFS 배열 ${((r * 7) % 900) + 100}행 평가`,
    (r) => `외부 연결 새로 고침 — 레코드 ${((r * 13) % 4000) + 500}건`,
    (r) => `피벗 캐시 갱신 (필드 ${(r % 9) + 3}개)`,
    (r) => `조건부 서식 규칙 ${(r % 12) + 1}개 적용`,
    (r) => `이름 정의 범위 검사 — 순환 참조 없음`,
    (r) => `VLOOKUP 조회 ${((r * 3) % 700) + 60}건 일치`,
    (r) => `자동 필터 재적용 (표시 ${((r * 11) % 300) + 20}행)`,
  ];
  return KIND[row % KIND.length](row);
}

/**
 * 매 프레임 다시 쓰이는 문구는 어휘집(STEALTH_TEXT)에 넣어도 곧 덮어쓰인다 — 만드는 자리에서 갈라야 한다.
 * 도전 버튼과 '잠긴 골드' 줄이 그랬다(6-101).
 */
export const STEALTH_DYN = Object.freeze({
  challenge: (challenging) => (challenging ? '재계산 중단' : '선택 영역 재계산'),
  bench: (n) => `참조되지 않는 범위 ${n}개`,
});

/** 위장 중 진행 상태 세 줄. 같은 정보(무엇을 얼마나 처리했는지)를 재계산 어휘로 옮긴다. */
export const STEALTH_STAGE = Object.freeze({
  mode: (challenging) => (challenging ? '재계산 중' : '자동 계산 대기'),
  kills: (done, total, challenging) => (challenging ? `${done} / ${total}행 처리` : `유휴 — 누적 ${done}행 처리`),
  hint: (stage) => `반복 계산 사용 · 최대 반복 ${100 + (stage % 40)}회 · 허용 오차 0.001`,
});

/**
 * 위장 모드의 신입 사원 교육 창 = **문서 검사 결과.**
 *
 * 교육 창을 `display:none` 으로 지우면 「파티 관리」가 322px 올라가 레이아웃이 뒤집힌다(계측 6-101).
 * 이 어휘집의 규칙대로 **지우지 않고 말을 바꾼다.** 항목 수는 실제 교육 단계 수(7)와 같게 맞춰
 * 스크롤 길이도 비슷하게 둔다.
 */
export const STEALTH_TUTORIAL = Object.freeze({
  title: '문서 검사',
  steps: [
    ['호환성 검사', '이전 버전에서 지원되지 않는 기능 없음'],
    ['접근성 검사', '대체 텍스트 누락 0건'],
    ['개인 정보 검사', '문서 속성에 개인 정보 없음'],
    ['수식 오류 검사', '순환 참조 없음 · #REF! 0건'],
    ['이름 정의 검사', '사용되지 않는 이름 2건'],
    ['연결 검사', '외부 통합 문서 연결 1건 (최신)'],
    ['시트 보호 검사', '잠금 해제된 셀 범위 확인 완료'],
  ],
});

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
