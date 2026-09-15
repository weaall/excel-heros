# 엑셀 히어로즈 (Excel Heroes)

엑셀 시트로 위장한 웹 방치형 픽셀 RPG + 수집형 카드 가차. 의존성 0, 빌드 단계 0 (vanilla ES modules + Canvas 2D).

- 기획서: [docs/GDD.md](docs/GDD.md)
- 밸런스/로직 확정 사항 & 열린 질문: [docs/BALANCE.md](docs/BALANCE.md)

## 실행

```bash
npm start        # http://localhost:8080  (node scripts/serve.js)
npm test         # node:test — 공식, 천장, 퀘스트, 세이브, 헤드리스 전투 시뮬레이션
```

정적 파일이므로 아무 정적 서버로도 됩니다. GitHub Pages는 `Settings → Pages → Source: GitHub Actions` 로 켜면
`.github/workflows/pages.yml` 이 `main` 푸시마다 테스트 후 배포합니다.

## 화면 구성

데스크톱 전용(≈1240px). 왼쪽은 시트 영역(전투 캔버스 A1:M8, 64px 픽셀 캐릭터), 오른쪽은 Excel 작업 창처럼 보이는 파티 관리 패널입니다.
`Esc`(보스 키)를 누르면 레이아웃은 그대로 두고 전투 캔버스만 텍스트 표로 바뀝니다.

| 리본 / 시트 탭 | 기능 |
| --- | --- |
| 홈 / 메인_전투 | A1:G15 전투 캔버스, 파티 강화(골드), 회사 업그레이드, 활동 로그 |
| 데이터 / 인사_명단 | D~S 카드 그리드. 카드 클릭 → 배치, ★승급, 강화, 조각→강화 카드 변환, 카드 방출, 메인 영웅 직급 승진 |
| 삽입 / 데이터_가져오기 | 뽑기(1회 100젬 / 10회 900젬), 확률·천장, 이력 |
| 검토 / 일일_업무 | 출근 도장, 일일 업무 6종, 전체 완료 보너스, 광고 보상(임시) |
| 수식·파일 / 수식 | 설정, 통계, 게임 공식, 세이브 내보내기/가져오기/초기화 |
| `Esc` 또는 🔒 | 슈퍼 스텔스(보스 키): 캔버스·카드를 숨기고 텍스트 표/로그만 표시 |
| `Σ 자동 합계` | 가장 싼 파티 강화를 골드 소진까지 자동 구매 |
| 층 · 변형 | Phase마다 층 이름/색조. x-5 야근 러시, x-8 감사 기간, x-10 보스 |
| 콤보 · 각성 | 연속 타격 콤보(최대 +25%), ★5 카드 각성(+25% · 특성 ×1.5 · 스킬 ×1.25) |
| 리본 탭 | 홈·삽입·데이터·검토·보기가 Excel처럼 리본 내용을 바꿉니다. 파일은 백스테이지(정보·옵션·저장·공식) |
| 셀 선택 | 전투 화면 클릭 → 선택 상자·머리글 강조·이름 상자 셀 참조·수식 입력줄에 `=HERO(...)`, 더블클릭으로 상세 |
| 파일 › 정보 › 회사 이전 | Phase 3-10 클리어 후 프레스티지. 지분 1주당 ATK·골드 영구 +3% |
| 🔇 효과음 | 합성 효과음 토글(기본 꺼짐, 보스 키 중 무음) |
| 보물 상자 | 웨이브에 6% 확률로 등장, 강화 카드·보석 드롭. 30%는 미믹 |
| `자동 합계 유지` | 켜두면 1초마다 골드를 가장 싼 파티 업그레이드에 자동 사용 |
| 검토 › 업적 | 누적 처치·스테이지·보스·뽑기·강화·골드·플레이 시간·도감 업적, 단계별 보석 |
| 데이터 › 도감 보너스 | 보유 영웅 1종당 ATK·골드 +1%, 별 1개당 ATK +0.5% |
| `⚑ Phase X-Y 도전` / `자동 진행` | 기본은 현재 스테이지 무한 사냥. 도전을 누르면(또는 자동 진행이 켜져 있으면) 다음 단계 도전 전투. 실패하면 직전 스테이지 사냥으로 복귀 |

## 실제 도트 시트로 교체하기

`assets/sprites/README.md`의 규격(64×64 프레임, idle 2 · walk 4 · attack 3, 오른쪽 바라봄)으로 PNG를 만들어 `assets/sprites/manifest.json`에 등록하면 캐릭터별로 코드 생성 도트를 대체합니다.

## 구조

```
index.html / styles.css        Excel 스킨 (리본, 수식 바, 시트 탭, 상태 바, 카드 그리드, 다이얼로그)
src/main.js                    부트스트랩 + 루프 (setInterval 고정 스텝 시뮬레이션, rAF 렌더)
src/config/balance.js          모든 상수·공식 (GDD + 확정 수치)
src/data/heroes.js             D~S 로스터 20장, 역할/스킬, 메인 영웅 직급 트리
src/data/monsters.js           스테이지별 몬스터, 보스
src/data/quests.js             일일 업무 정의, 출근/전체 완료 보너스
src/data/sprites.js            문자열 템플릿 → 치비 픽셀 스프라이트, 카드/초상 일러스트 생성
src/core/GameManager.js        재화, 스테이지 흐름, 플레이어 액션(강화/승진/변환/방출/퀘스트/광고), 이벤트
src/core/EntityManager.js      한 줄 대열 라인 전투, 웨이브/이동 스크롤, 대시·투사체 타이밍, 스킬
src/core/GachaManager.js       확률 + 천장(50/100) 순수 로직
src/core/QuestManager.js       일일 리셋, 진행/수령, 광고 횟수
src/core/SaveManager.js        localStorage 10초 자동 저장, 오프라인 보상 계산
src/core/state.js              초기 상태(v2), 세이브 마이그레이션
src/ui/Renderer.js             캔버스 그리드/스프라이트/HP바/플로팅 텍스트
src/ui/UIManager.js            DOM 바인딩 (표, 카드, 상세 다이얼로그, 퀘스트, 스텔스 뷰)
tests/                         node:test 단위 + 시뮬레이션 테스트
```

DevTools 콘솔에서 `EH.game.state` 로 상태를 보고, `EH.game.state.gold = 1e9` 식으로 밸런스 실험이 가능합니다.

## 아트 크레딧 (CC0)

- 영웅·몬스터·보스 스프라이트: **16x16 DungeonTileset II v1.7** by 0x72 — <https://0x72.itch.io/dungeontileset-ii> (CC0). 캐릭터별로 색조(hue)를 바꿔 28명을 10개 베이스로 만들고, 던전 벽·바닥·배너·분수 타일도 이 시트에서 가져옵니다. 파일: `assets/sprites/0x72/sheet.png`
- 몬스터 12종: **Tiny Creatures** by Clint Bellanger — <https://opengameart.org/content/tiny-creatures> (CC0). 파일: `assets/sprites/tiny-creatures/tilemap_packed.png`
- 팩이 없거나 매핑이 없는 캐릭터는 `src/data/heroArt.js` / `src/data/monsterArt.js`의 코드 생성 도트로 대체됩니다.
- 카드 일러스트(`assets/cards/*.png`): `scripts/genCardsHF.mjs`가 Hugging Face 공개 Space의 **Animagine XL 4.0**(Cagliostro Research Lab, Fair AI Public License 1.0-SD)으로 생성한 AI 이미지입니다. 재생성·교체 방법은 `assets/cards/README.md`. 벡터 초상(`*.svg`, `scripts/portraits.mjs`)과 `genCards.mjs`(pollinations, 미채택 톤)는 대체용입니다.
