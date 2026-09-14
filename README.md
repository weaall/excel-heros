# Excel Heroes (엑셀 히어로즈)

엑셀 시트로 위장한 웹 방치형 픽셀 RPG + 수집형 가차. 의존성 0, 빌드 단계 0 (vanilla ES modules + Canvas 2D).

- 기획서: [docs/GDD.md](docs/GDD.md)
- 밸런스/로직 확정 사항 & 열린 질문: [docs/BALANCE.md](docs/BALANCE.md)

## 실행

```bash
npm start        # http://localhost:8080  (node scripts/serve.js)
npm test         # node:test — 공식, 천장, 세이브, 헤드리스 전투 시뮬레이션
```

정적 파일이므로 아무 정적 서버로도 됩니다. GitHub Pages는 `Settings → Pages → Source: GitHub Actions` 로 켜면
`.github/workflows/pages.yml` 이 `main` 푸시마다 배포합니다.

## 조작

| 위치 | 기능 |
| --- | --- |
| 리본 `Home` / 시트 `Main_Battle` | A1:G15 전투 캔버스, 파티 업그레이드, 회사 업그레이드, 로그 |
| 리본 `Data` / 시트 `HR_Roster` | 전 영웅 목록, 파티 배치(Deploy/Bench), 승급(Promote) |
| 리본 `Insert` / 시트 `Data_Import` | 가차(1회 100젬 / 10회 900젬), 천장 카운터, 이력 |
| 리본 `Formulas`/`File` / 시트 `Formulas` | 설정, 통계, 게임 공식, 세이브 Export/Import/초기화 |
| `Esc` 또는 🔒 | 슈퍼 스텔스(보스키): 캔버스 숨기고 텍스트 표/로그만 표시 |
| `Σ AutoSum` | 가장 싼 파티 업그레이드를 골드 소진까지 자동 구매 |

## 구조

```
index.html / styles.css        Excel 스킨 (리본, 수식 바, 시트 탭, 상태 바)
src/main.js                    부트스트랩 + 메인 루프 (rAF, 백그라운드 정산)
src/config/balance.js          모든 상수·공식 (GDD + 확정 수치)
src/data/heroes.js             16명 로스터, 등급/역할/스킬 정의
src/data/monsters.js           스테이지별 몬스터, 보스
src/data/sprites.js            문자열 템플릿 → 16x16 픽셀 스프라이트 (프레임 애니메이션)
src/core/GameManager.js        재화, 스테이지 흐름, 플레이어 액션, 이벤트
src/core/EntityManager.js      5인 포메이션, 타겟팅, 이동, 전투, 스킬
src/core/GachaManager.js       확률 + 천장(50/100) 순수 로직
src/core/SaveManager.js        localStorage 10초 자동 저장, 오프라인 보상 계산
src/core/state.js              초기 상태, 세이브 마이그레이션
src/ui/Renderer.js             캔버스 그리드/스프라이트/HP바/플로팅 텍스트
src/ui/UIManager.js            DOM 바인딩 (표, 다이얼로그, 스텔스 뷰)
tests/                         node:test 단위 + 시뮬레이션 테스트
```

DevTools 콘솔에서 `EH.game.state` 로 상태를 보고, `EH.game.state.gold = 1e9` 식으로 밸런스 실험이 가능합니다.
