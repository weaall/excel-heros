// Short in-battle lines: what a hero says when casting a skill (by skill type) and what a boss shouts on arrival.
// Shown as pixel speech bubbles (Renderer #drawBubbles). Kept short so they fit in one bubble.
export const SKILL_QUIPS = {
  strike:  ['결재 도장, 찍습니다!', '한 방에 정리하죠.', '이건 제 담당입니다.'],
  sweep:   ['전체 회신!', '한 번에 정리할게요.', '모두 참조, 발송.'],
  buff:    ['팀 싱크 맞추죠!', '다 같이, 지금!', '오늘 회의는 짧게!'],
  heal:    ['웰니스 데이예요.', '잠깐 쉬어요, 다들.', '커피 돌립니다!'],
  burn:    ['긴급 패치 배포!', '핫픽스 들어갑니다.', '서버 뜨거워질 거예요.'],
  barrier: ['조항 4조, 발동.', '제가 막겠습니다!', '규정대로 갑시다.'],
  haste:   ['스프린트 시작!', '데드라인 앞당깁니다!', '지금부터 빨리!'],
  execute: ['최종 검토, 반려.', '여기, 오탈자.', '근거 없음. 끝.'],
  ult:     [], // the ultimate has its own cut-in (profile.ult)
};
export const BOSS_LINES = {
  boss:        ['긴급! 긴급! 긴급!', '30분 안에 답 주세요!', '이 티켓 아직 안 닫혔어요!'],
  boss_zombie: ['퇴근… 하고 싶으면… 야근…', '보고서… 어디…', '월요일… 또 월요일…'],
  boss_ogre:   ['단가 더 깎아!', '내일까지 안 되면 계약 파기다!', '담당자 나오라고 해!'],
};
export const pick = (arr, r = Math.random()) => (arr && arr.length ? arr[Math.min(arr.length - 1, Math.floor(r * arr.length))] : null);
export const skillQuip = (type, r) => pick(SKILL_QUIPS[type] ?? [], r);
export const bossLine = (bossId, r) => pick(BOSS_LINES[bossId] ?? BOSS_LINES.boss, r);
