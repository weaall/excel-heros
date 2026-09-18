# 인수인계 (2026-09-17, 91차까지) — 다음 세션이 이어서 볼 문서

작업 규칙·보안·명령·함정은 `CLAUDE.md`(자동 로드). 이 문서는 **현재 상태와 남은 일**.

## 1. 한 줄 요약
Excel 문서로 위장한 방치형 픽셀 RPG + 가챠. **55명 영웅(D~S) + 주인공 11직급**, 일러 **176장**(기본 + 스킨) + 프롤로그 패널 7장, Google 로그인 필수, 첫 로그인 오프닝 스토리, Cloudflare Worker + D1 백엔드, GitHub Pages 자동 배포. 테스트 **144개** 통과. **91차** 패스까지 완료.

## 2. 주소 · 인프라
| 항목 | 값 |
| --- | --- |
| 레포 | https://github.com/weaall/excel-heros (main 푸시 → `.github/workflows/pages.yml` 테스트 후 Pages 배포) |
| 서비스 | https://excel-heros.qugo.kr/ (CNAME, HTTPS) |
| 백엔드 | Cloudflare Worker `excel-heroes-api` → https://excel-heroes-api.excel-heroes.workers.dev , D1 `excel-heroes`(APAC). 설정 `backend/wrangler.toml`, 스키마 `backend/schema.sql`, 문서 `backend/README.md` |
| Google | 공개 client ID만 `index.html`의 `EXCEL_HEROES_CLOUD.googleClientId` (Worker도 같은 id로 aud 검증) |
| 광고 | `index.html`의 `EXCEL_HEROES_ADS` 비어 있음 → 5초 플레이스홀더. 애드센스(qugo.kr 루트로 신청, CMP 3선택) **승인 대기**. 승인되면 `{ publisherId: 'ca-pub-…' }` 한 줄. ads.txt는 qugo.kr Next.js `public/`에 |
| 일러 생성 | HF Space asahina2k/animagine-xl-4.0 (ZeroGPU). 토큰 풀: `.hf_token`(1) + `.hf_tokens`(3, 사용자 토큰, git-ignored) + 익명. 채팅에 노출된 토큰 3개는 **재발급 권고** 상태 |

## 3. 코드 지도
- `index.html` / `styles.css` — Excel 크롬(리본·시트 탭·상태 바), 시트 8종: 메인_전투 / 인사_명단 / 데이터_가져오기(뽑기) / 일일_업무(검토) / 사내_메신저 / 사원_앨범 / 오류_도감 / 통계_차트. 부팅 스플래시 `#boot`, 로그인 게이트 `#login-gate`, **신입 사원 교육 체크리스트 `#tutorial`**(옛 코치 마크 대체).
- `src/main.js` — 부팅 순서, 로그인 게이트, 서버 사본 우선 로드, 아트 비동기 로드.
- `src/core/GameManager.js` — 상태·재화·스테이지·모든 플레이어 액션(승진 `promoteMain`, 스킨, 호감도, 출장, 야근, 픽업/천장, 마일스톤 수동 수령, 광고 `adOffers/adReward`, 클라우드).
- `src/core/EntityManager.js` — 전투 루프, **스킬 14종**, 보스 스킬(`BOSSES[].specials`), 스테이지 수식어(rush/elite/blackout/crunch/swarm), **스킬 순차 발동(`castLock`: 일반 1.1s · 필살기 2.0s)**, 말풍선, 이벤트(`skill-cast`, `ult`, `boss-special`).
- `src/ui/Renderer.js` — 캔버스: 던전, 도트, 이펙트, 스킬 일러 컷인(`#drawSkillCard`), 배너/보스 컷인(위 280px만 어둡게), HUD.
- `src/ui/UIManager.js` — DOM 전부. **상세 창 6탭**(정보/스킬/비품/스킨/프로필/호감도, `#renderDetail`), 승진 패널(`#mainPromoPanel`, 트랙 색), 출장(등급순), 광고 표(`#adTable`), 앨범, 도감, 클라우드 UI, **모달 확인 `#askConfirm`(브라우저 alert/confirm 금지)**, **교육 목록 `#refreshTutorial`**, **잠긴 골드 `#refreshBenchGold`**, 위장 어휘 교체 `#applyStealthLabels`.
- `src/ui/Ads.js` — 공급자 추상화(adsense / applixir / custom).
- `src/core/{Auth,CloudSync,plausibility,state,QuestManager,MilestoneManager,AchievementManager,GachaManager}.js`.
- `src/data/prologue.js`(오프닝 7장면), `src/data/heroes.js`(HEROES **55**, MAIN_JOBS 11, MAIN_TRACKS, SKILLS **14**, TRAITS, GRADES), `tutorial.js`(신입 교육 7항목), `equipment.js`(비품 4부위), `codes.js`(보석 코드), `stealthLabels.js`(위장 어휘), `dollSprites.js`(도트 스펙 61 + `applySkin`: 스킨이 복장·액세서리까지 교체), `skins.js`, `pickup.js`, `divisions.js`(부문 시너지·특성), `profiles.js`+`profilesExtra.js`, `story.js`, `quips.js`, `monsters.js`(BOSSES specials), `packSprites.js`(0x72 몬스터 + **보스 사무실 소품 `BOSS_PROPS`**), `cardArt.js`(매니페스트 로드, 썸네일/원본), `artPalettes.js`(자동 생성).
- `src/config/balance.js` — 모든 수치(AD_OFFERS, MAIN_PROMOTE_*, GEM_DROP, DISPATCH, OVERTIME, AFFECTION, SKILL_LEVEL …).
- `scripts/` — `genCardsHF.mjs`(일러, --skin, --scene, --manifest, 토큰 풀), `thumbs.py`(WebP), `thumbcheck.py`, `extractPalettes.mjs`, `artSheet.mjs`(일러 검수), `dollSheet.mjs`(영웅 도트 검수), **`monsterSheet.js`(몬스터·보스 도트 검수, 브라우저에서 `import`)**, `serve.js`, `png.mjs`.
- `tests/` — **144개**(`node --test`, 19개 파일). 새 기능마다 테스트 추가가 관례.

## 4. 이번 주에 확정된 설계 결정 (BALANCE 6-38 ~ 6-43)
- 주인공: 인턴→사원→**트랙 선택(영업 근접/재무 원거리/총무 탱커)**→대리→과장→부장. 구버전 `senior/manager` 저장은 `state.migrate`가 영업 트랙으로 이관.
- 일러 얼굴 규칙: 미디엄 샷·정면 조명, 네거티브에 역광/작은 얼굴. 61장 전수 재생성 완료. 스킨 100장 완료.
- 상세 창 5탭, 출장 등급순, Esc 시 리본 재화 라벨 숨김.
- 스킬 컷인(일러 명찰 카드), 필살기 컷인 일러, 보스 3× + 고유 스킬 3종×2, 컷인 오버레이 축소.
- 광고: 고정 5종(골드 1h ×3, 보석 15 ×2, 카드 10 ×2, 출장 즉시 복귀 ×1, 야근 추가 ×1). 2배 방치 삭제. AppLixir는 월 10만 임프레션 필요 → 애드센스 대기.

## 4-1. 65~91차 요약 (자세한 건 `docs/BALANCE.md` 6-45 ~ 6-73)

**밸런스(가장 큰 축)**
- 재화 곡선 교정: 스테이지 1단계에 1.74레벨이 필요한데 레벨 비용은 ×1.218/단계, 골드 수입은 ×1.15라 **단계마다 5.9%씩 가난해지고 있었다**. `UPGRADE_COST_GROWTH 1.12→1.105`, `GOLD_GROWTH 1.15→1.16`으로 드리프트를 2.5%까지 낮춤.
- 보석 수입의 80%가 클리어 기반이라 벽에 막히면 가챠가 멈췄다 → 킬 드롭을 페이즈에 비례시킴(`GEM_DROP`), 반복 클리어 보석 추가.
- **레벨 상한을 ★로 잠갔다**(6-66). 성장 축 전부(등급·★·강화·각성·비품·호감도)를 합쳐도 ×61인데 레벨은 상한이 없어 39레벨이면 따라잡혔다 = "S를 뽑을 이유가 없다"가 수학적으로 참이었다. `LEVEL_CAP_BY_STAR [80,140,200,260,320]` + 각성 +50, 주인공은 직급으로.
- **잠긴 골드는 표시 문제였다**(6-72). 레벨 비용은 등급과 무관하고 환급 100%라 손실이 0인데 그게 어디에도 안 보였다 → 비용 열 `환급 100%` 태그 · 자동 회수 토스트 · 파티 창 `잠긴 골드 + 회수` 줄(`benchGold()`).

**시스템**
- 비품(`equipment.js`) 4부위 + 자동 장착, 부문 시너지 반영 자동 편성(탱커·힐러는 **하드 제약**), 벤치 레벨 자동 회수, 보석 코드(`helloheros` / `ref!`, 각 3000, 계정당 1회, 서버 `redemptions` 테이블), 광고 보상 5종 고정 지급.
- **신입 사원 교육**(6-67): 읽고 닫는 코치 마크 → 직접 해야 지워지는 7항목 체크리스트(보석 합 850). 5항목은 기존 통계를 읽어 저장을 늘리지 않음, 2항목만 새 플래그(`markTutorial`).
- **위장 모드 어휘 교체**(6-64): Esc가 화면뿐 아니라 시트 탭·리본 라벨·상태 줄까지 스프레드시트 어휘로 바꾸고, 끄면 원본을 정확히 복원. 교육 목록도 함께 숨김.
- 보안: 세션 토큰 SHA-256 저장(첫 사용 시 자동 이관), 순위표 `shares` 검증(킬→스테이지→이전 횟수로 상한), DPS 클램프, 저장 레이트리밋 durable화, 세션 정리, 광고 행 상한, 오류 상세 비노출.

**연출·아트**
- S 등장 컷신 재설계(6-71): 어두운 금빛 무대 · 충격파 · 광선 · 금가루 · 4.6초 일러 인 · LEGENDARY 리본 · **수식 입력줄에 `=VLOOKUP(...)` 타이핑 후 이름 결정**.
- 헤일로 등급 연동(D/C 얇은 선 → S 이중 링 + 스파크), **헤일로가 인물을 잡아먹지 않게 프롬프트 교정**(6-68: `halo` 한 단어 → 얇은 고리 + 중앙 구도 고정, 과대 링·중심 이탈 네거티브).
- **보스 사무실 소품**(6-73): 셋 다 이미 다른 생물이었지만 "악마·좀비·오우거"에서 멈춰 있었다 → 물어뜯긴 결재 문서 + 경고 깃발 / 와이셔츠 깃 + 넥타이 + 식은 커피 / 금색 넥타이 + 말아 쥔 계약서.
- 창업자를 **여성 캐릭터로 변경**(프로필 `gender`, 프롬프트, 도트, `look.hair`).
- 메인_전투가 한 화면에 들어가게 고정(6-69): 로그 줄 수·행 번호를 남는 높이에서 계산. 한계 돌파 가능 표시(6-70): 조각 칸 조건부 서식 + 카드 `★↑` 배지 + 시트 머리 카운트.

## 5. 남은 일 (우선순위 순)
1. **트레잇(특성) 고도화**: 스킬은 ★로 성질이 바뀌게 했지만(6-89), 패시브 특성 10종은 아직 **고정 수치 하나**다. 같은 방식으로 ★에 반응하게 할 여지가 크다.
2. **탱커 외 역할의 상시 정체**: 탱커에게 '대신 맞기'를 준 것처럼(6-88), 힐러·원거리·근접에도 상시 역할이 있으면 좋다. 지금은 스킬로만 구분된다.
3. **애드센스 승인 후**: `EXCEL_HEROES_ADS.publisherId` 설정, 노출 빈도 조정, ads.txt 확인.
4. **HF 토큰 재발급**(사용자 작업) 후 `.hf_tokens` 갱신.
5. **수치 실플레이 검증**: 수식 대응(4초·60% 감소) · 탱커 가로채기(30~58%) · 인사 복구(확정 1 + 확률) · 스카우트(하루 3회) — 계산은 맞췄지만 체감은 미검증.
6. **보스 도트 2차 정리**: 손그림 보스 3종(복합기·캐비닛·엘리베이터)은 가로로 넓어 납작해 보인다. Tiny 기반 3종(악어·고릴라·코끼리)도 손그림으로 옮기면 9종 전부 결이 맞는다.
7. 열린 질문(BALANCE 8장): 부장 트랙 "전직" 기능 필요 여부, 순위표 노출 정책 등.

### 일러 프롬프트 규칙 (여러 번 넘어진 곳 — 6-77 · 6-80)
- **부정은 NEG에만.** 긍정 프롬프트에 `no walls` / `ordinary and unremarkable` 같은 걸 쓰면 모델이 배경이나 구도 자체를 포기한다(얼굴 클로즈업, 멀리 선 점, 셀 셰이딩 상실).
- **프레임 밖에 있어야 할 것은 프롬프트에도 없어야 한다.** 허리 위 샷인데 옷 설명에 `sneakers`·`pleated skirt`·`mop` 이 있으면 모델이 그걸 그리려고 뒤로 물러선다.
- **넓은 장소를 배경으로 쓰지 않는다.** '거리'·'연회장'·'메일룸'은 전신 원경을 부른다. `... close behind him` 으로 좁힌다.
- **장식 단어는 붙을 자리를 지정한다.** `gold filigree` 만 쓰면 카드에 금색 액자가 생긴다 → `thin gold embroidery on the collar and cuffs`.
- **머리 위 여백을 명시한다.** `whole head in frame with space above the head` — 정수리 잘림도 막고 후광 자리도 생긴다.

### 밸런스 시뮬레이션을 돌릴 때 (6-76의 교훈)
`scratchpad` 시뮬로 결론을 내기 전에 **플레이어가 누르는 걸 전부 넣었는지** 확인한다. 최소 넷: 10연 · ★한계 돌파 · **주인공 승진(`promoteMain`)** · **회사 이전(`prestige`)**. 하나만 빠져도 결론의 부호가 바뀐다 — 실제로 "골드가 남아돈다"가 "골드가 모자란다"로 뒤집혔다.

## 6. 검증 루틴
- 코드: `node --test` → 브라우저 `http://localhost:8080/?guest=1&v=<n>`(dev 서버 `node scripts/serve.js`)에서 `window.EH.game / EH.ui`로 상태 조작해 확인(`g.state.cards=5000; g.state.maxCleared=100; g.promoteMain('staff')`, `EH.ui.openDetail('ceo')`, 보스는 `g.state.stage=9; g.state.maxCleared=9; g.startChallenge()`).
- 일러: 생성 → `artSheet.mjs` 시트 Read → 잘림/음영/작음 있으면 `SEED=<n> --force` 재생성 → `thumbs.py --force` → `--manifest` → `extractPalettes.mjs` → 도트 색 맞춤 → 커밋.

## 7. 메모리(사용자 홈)
`C:\Users\weaal\.claude\projects\C--Users-weaal-excel-heros\memory\` — `excel-heroes-project.md`(회차별 결정), `excel-heroes-art-and-ui-prefs.md`, `bash-heredoc-size-limit.md`. 새 세션은 MEMORY.md 인덱스를 자동으로 봄.
