# 인수인계 (2026-09-18, 137차까지) — 다음 세션이 이어서 볼 문서

작업 규칙·보안·명령·함정은 `CLAUDE.md`(자동 로드). 이 문서는 **현재 상태와 남은 일**.

## 1. 한 줄 요약
Excel 문서로 위장한 방치형 픽셀 RPG + 가챠. **55명 영웅(D~S) + 주인공 11직급**, 일러 **176장**(기본 + 스킨) + 프롤로그 패널 7장, Google 로그인 필수, 첫 로그인 오프닝 스토리, Cloudflare Worker + D1 백엔드, GitHub Pages 자동 배포. 테스트 **175개** 통과. **137차** 패스까지 완료.

> **지금 이 게임에서 가장 중요한 한 가지**: 수치를 바꾸기 전에 **먼저 잰다.** 이 프로젝트에서 '틀렸다'고 밝혀진 것 대부분은 게임이 아니라 **자尺**이었다(6-97 · 6-114 · 6-116). 재는 도구는 `scripts/abSystems.mjs`(시스템 A/B)와 `scratchpad/*.mjs` 계열 프로브다.

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

## 4-2. 92~137차 요약 (자세한 건 `docs/BALANCE.md` 6-74 ~ 6-121)

이 구간은 거의 전부 **측정**이다. 큰 것만:

- **게임의 58.8%가 적이 걸어오는 시간이었다**(6-115). 적은 화면 밖 60px/s 로 들어와 한 웨이브가 7~8초를 걸어왔고, 실제 교전은 28.3%뿐이었다 — **모든 버프가 A/B에서 +8~28%로만 나오던 진짜 이유.** `PACE.monsterSpeed` 60 → 200, `travel` 1.6 → 1.1. 교전 53%, 영구 지분 74 → 144. 그리고 그제야 위험이 생겼다(체력 최저 0.664 → 0.149, 전멸은 여전히 0).
- **쓰러진 사원이 영영 안 일어나고 있었다**(6-114). 설계된 출구("승산이 떨어지면 물러나 회복")는 승산이 98.5%의 시간 '유리'라 열리지 않았고, 파티는 4시간의 **47.8%를 시체를 끌고** 다녔다. `RECOVER`(대기 15초 + 쓰러질 때마다 +10, 상한 90, 만피 복귀)로 고쳤다.
- **절대 수치로 쓴 회복은 폭주한다**(6-115 · 6-116). ATK는 레벨당 1.10, HP는 1.08 — 144레벨이면 14배다. 힐러 능동 치유(`ATK×2.5`)가 탱커 체력의 3% → **53%** 가 됐고, 보호막(`ATK×p`)은 22% → **324%** 가 됐다. 둘 다 **비율**로 바꿨다. 그 전까지 탱커·힐러는 A/B에서 죽어 있었다.
- **한 시스템이 두 가지 일을 하면 하나만 꺼서는 죽었는지 모른다**(6-116). 탱커 엄호가 −0.6%로 나왔는데, 확률 엄호와 치명타 엄호를 따로 끄니 +11.5% / +5.0% 였다 — 서로를 대신하고 있었다.
- **A/B 자尺의 네 번째 구멍**(6-114): `prestige()` 가 `this.entities` 를 새로 만든다. `g.entities.*` 에 건 패치는 첫 회사 이전에서 사라진다 → `onEntities` 로 매번 다시 건다.
- **컷인이 전투 화면의 34.7%를 덮고 있었다**(6-116). 분당 13.3회 = 4.5초마다 = 벽지. `CUTIN.gap 7초`(필살기·각성은 예외)로 15.1%.
- **회사 이전을 권하는 규칙을 바꿨다**(6-119). 승산 35% 문턱은 거의 안 걸린다 — 벽은 '못 이긴다'가 아니라 '오래 걸린다'로 온다. `PRESTIGE.adviseEta = 30초`. 8시간 훑기에서 150단계 도달·영구 지분 모두 최고.
- **예상 소요 시간**을 리본에 넣고(6-117) 206판으로 **검증**해서 보정했다(`FORECAST.etaNormal/etaBoss`). 눈금을 바꾸면 다시 잴 것.
- 야근 보상이 진행할수록 줄고 있었다(6-118) → `OVERTIME.hpMult 0.35` + `gemsPerPhase 0.15`.
- 뽑기 창구 둘(픽업/일반), 한계 돌파를 '같은 카드 N장'으로(6-106), 강화 환급, 스킬 게이지, 보스 12종 + 새 기술 셋(증원·회복·방어막), 스토리 20편(2차 완결), 몬스터 넷 재작화.

## 5. 남은 일 (우선순위 순)
1. **스킬 14종 밸런스** — `scratchpad/skills.mjs` 로 파티 전원을 한 스킬로 고정해 3시간 × 4판 비교 중. 부분 결과에서 이미 편차가 크다(strike −6.0% · heal +0.4% · sweep +4.4% · buff +24.9% · burn +25.8% · **ult +40.3%**). 필살기가 제일 약한 게 사실이라면 `castLock` 2.0초와 쿨다운을 손봐야 한다.
2. ~~수치 실플레이 검증~~ **완료(6-98)**: 여덟 시스템 전부 브라우저에서 실측했고 문서대로 작동한다 — 수식 대응 60.0% · 탱커 엄호 0.578(기대 0.580) · 힐러 오라 1.2%/s · 원거리 관통 0.387(끄면 0.000) · 근접 기세 ×1.28/2.5초 · ★스킬 ×1.495 · 스카우트 3회/일 · 인사 복구 ★1 1.87명→★5 2.77명. 계측할 때는 **아무 일도 안 했을 때 0이 나오는지 먼저 확인한다** — 없는 함수를 옵셔널 체이닝으로 불러 '스킬을 한 번도 안 쓰고' 그럴듯한 분포를 뽑은 적이 있다.
   - 통합 시뮬(3시간 연속, `scratchpad/integ.mjs` 패턴)은 돌려 봤고 6-93이 그 결과다. 시뮬은 **시스템이 서로를 밟는지**는 잡지만 체감은 못 잡는다.
   - 시뮬을 또 돌릴 때 주의: 단위 테스트가 통과해도 시스템이 **서로를 무력화**할 수 있다(자동 부활을 지웠는데 스테이지 전환이 같은 일을 하고 있었다). 하나를 끄고 켜 보며 **결과 지표가 실제로 달라지는지**를 봐야 한다.
3. **0x72 보스 3종(악마·좀비·오우거)**: 재확인해 보니 **픽셀 밀도는 이미 9종 모두 3px 로 같다**(팩 32px×3, 손그림 43격자×3). 남은 차이는 몸통이 던전 생물이라는 것뿐이고, 사무실 소품이 정체를 만들어 주고 있어 급하지 않다. 사람 보스(야근 좀비 부장)는 오히려 있는 편이 낫다.
4. **지적된 카드 14장 재생성 미완**: `staff_park parttime courier intern_seo mail_cho macro design_lead chro cdo ceo founder ai_lead chief_of_staff union_chief`. 프롬프트 수정(헤일로 사다리 · 자세 · 설명 정리)은 커밋됐고 **그림은 아직 옛것**이다. Space 가 `No GPU was available after 60s` 로 막혀 한 장도 못 뽑았다. 다시 시도:
   ```
   node scripts/genCardsHF.mjs --force staff_park parttime courier intern_seo mail_cho macro design_lead chro cdo ceo founder ai_lead chief_of_staff union_chief
   ```
   뽑은 뒤 `python scripts/thumbs.py --force` → `--manifest` → `extractPalettes.mjs` → `IDS=... artSheet.mjs` 로 눈 검수.
5. **애드센스 승인 후**: `EXCEL_HEROES_ADS.publisherId` 설정, 노출 빈도 조정, ads.txt 확인.
6. **HF 토큰 재발급**(사용자 작업) 후 `.hf_tokens` 갱신.
7. 열린 질문(BALANCE 8장): 부장 트랙 "전직" 기능 필요 여부, 순위표 노출 정책 등.

### 레이아웃 규칙 (6-91에서 세 번 넘어진 곳)
- **세로 스크롤바가 가로 스크롤바를 만든다.** 스크롤 컨테이너 안의 표는 `table-layout: fixed`, 컨테이너는 `overflow-x: hidden` + `scrollbar-gutter: stable`.
- **`scrollbar-gutter: stable` 은 조건부로 스크롤하는 컨테이너 *전부* 에 붙인다.** 이 규칙이 세 곳에만 적용돼 있고 가장 큰 `.sheets` 가 빠져 있어서, 시트를 옮기거나 홈에서 로그가 쌓일 때마다 폭이 900 ↔ 885 로 움직였다(6-105). 새 스크롤 영역을 만들면 같이 붙일 것. 현재 적용: `.sheets` · `#stealth-view` · `#modal-body` · `.pane-body` · `#tut-list` · `.dt-info` · `#dispatch-pick` · `.bs-content` · `#save-text`.
- **자리를 먼저 정하고 내용을 맞춘다.** 길이가 다른 문자열을 같은 칸에 넣으면 표가 다시 배치된다(확률 칸 126 ↔ 165px). 확인은 눈이 아니라 **토글을 여러 번 눌러 측정값이 하나인지**로 한다.
- **스크롤 영역 밖의 배너는 페이지를 밀어낸다.** 안내 배너를 작업 창에 추가할 때는 `.pane-body` 안에 넣거나, 바깥 컨테이너가 스스로 잘리게(`overflow: hidden`) 해야 한다.
- **고정 높이 캔버스는 창을 넘긴다.** 전투 화면은 비율(832:416)로만 잡고, 상태 행 22px 은 항상 비워 둔다.
- 창 높이가 바뀌면 로그 줄 수와 행 번호 개수는 **남는 높이에서 다시 계산**한다(최소값을 강제하지 않는다 — 자리가 없으면 0줄이 맞다).

### 일러 프롬프트 규칙 (여러 번 넘어진 곳 — 6-77 · 6-80)
- **부정은 NEG에만.** 긍정 프롬프트에 `no walls` / `ordinary and unremarkable` 같은 걸 쓰면 모델이 배경이나 구도 자체를 포기한다(얼굴 클로즈업, 멀리 선 점, 셀 셰이딩 상실).
- **프레임 밖에 있어야 할 것은 프롬프트에도 없어야 한다.** 허리 위 샷인데 옷 설명에 `sneakers`·`pleated skirt`·`mop` 이 있으면 모델이 그걸 그리려고 뒤로 물러선다.
- **넓은 장소를 배경으로 쓰지 않는다.** '거리'·'연회장'·'메일룸'은 전신 원경을 부른다. `... close behind him` 으로 좁힌다.
- **장식 단어는 붙을 자리를 지정한다.** `gold filigree` 만 쓰면 카드에 금색 액자가 생긴다 → `thin gold embroidery on the collar and cuffs`.
- **머리 위 여백을 명시한다.** `whole head in frame with space above the head` — 정수리 잘림도 막고 후광 자리도 생긴다.
- **머리 위를 채우는 요소를 캐릭터 설명에 쓰지 않는다.** 머리 위는 헤일로의 자리다. `rings of holographic data rotating around her` · `golden light rays` · `speed lines` 가 있으면 모델은 헤일로를 따로 그리지 않는다 — 헤일로가 약한 게 아니라 밀린 것이다(6-96).
- **억제는 크기만, 존재는 막지 않는다.** 헤일로가 캐릭터를 잡아먹는 걸 막으려 NEG를 키웠더니 D급에서 아예 사라졌다. 긍정은 `thin but clearly visible`, NEG는 `halo wider than shoulders` 처럼 **크기·위치**만.
- **자세는 하나만 준다.** 캐릭터 설명에 이미 `arms crossed` 가 있으면 자세 태그를 덧붙이지 않는다(`POSED` 정규식). 모순된 지시 두 개면 손이 세 개가 된다.
- **얇은 설명은 채워 준다.** `dark hoodie, headphones, laptop` 셋뿐이면 모델이 빈칸을 자기 취향으로 채운다 — 네온 사이버펑크 전신 포즈가 나왔다.
- **정규식을 편집 스크립트로 넣을 때 `` 를 이스케이프한다.** 안 하면 파일에 **실제 백스페이스 문자(0x08)** 가 들어가고 정규식이 조용히 아무것도 매치하지 않는다. Python 이면 raw 문자열(`r"..."`)만 쓴다.

### 밸런스 시뮬레이션을 돌릴 때 (6-76의 교훈)
**지표를 먼저 의심한다.** 이번 세션에 '버프를 끄면 좋아진다'는 불가능한 결과를 세 번 봤고 세 번 다 지표였다 — 난수 미고정 · `maxCleared`(회사 이전이 되돌린다) · 순위표 점수(이전 한 번이 총점의 절반이라 눈금이 50%). 쓸 수 있는 자尺는 **관문 도달 시간**이다(60·90·120단계에 처음 닿은 시각): 연속적이고, 강한 파티가 더 늦게 도달할 방법이 없고, 이전이 진행을 되돌려도 흔들리지 않는다. `scripts/abSystems.mjs` 가 껐는데 빨라진 시스템이 있으면 경고를 찍는다 — 그 줄이 보이면 게임이 아니라 자尺를 보라.

**난수를 시드로 고정하고 짝지어 비교한다.** 안 하면 뽑기 운이 시스템 효과를 완전히 덮는다 — 시드 없이 돌린 A/B 표는 **모든 변종이 기준선보다 좋게** 나왔고(버프를 끄면 좋아질 수 없다) 그걸 믿었다면 탱커 엄호를 지웠을 것이다. 붙이기 전에 **불가능한 결과가 있는지** 먼저 본다.

**시뮬레이터는 사람이 하는 행동을 해야 한다.** 전멸하면 게임이 `autoAdvance` 를 끄고, 사람은 다시 켠다. 하니스가 안 켜면 재는 건 게임이 아니라 하니스의 무기력이다. 그리고 상태를 직접 건드리는 것만으로는 부족하다 — `setAutoAdvance(true)` 를 불러야 도전이 다시 시작된다.

**`BALANCE` 는 `Object.freeze` 다.** 최상위 스칼라에 대입하면 조용히 무시되므로 A/B 로 끌 수 없고, '효과 없음'이라는 거짓 결과가 나온다. 훑을 값은 중첩 객체 안에 둔다(`SAFE_ADVANCE.min` 처럼).

`scratchpad` 시뮬로 결론을 내기 전에 **플레이어가 누르는 걸 전부 넣었는지** 확인한다. 최소 넷: 10연 · ★한계 돌파 · **주인공 승진(`promoteMain`)** · **회사 이전(`prestige`)**. 하나만 빠져도 결론의 부호가 바뀐다 — 실제로 "골드가 남아돈다"가 "골드가 모자란다"로 뒤집혔다.

## 6. 검증 루틴
- 코드: `node --test` → 브라우저 `http://localhost:8080/?guest=1&v=<n>`(dev 서버 `node scripts/serve.js`)에서 `window.EH.game / EH.ui`로 상태 조작해 확인(`g.state.cards=5000; g.state.maxCleared=100; g.promoteMain('staff')`, `EH.ui.openDetail('ceo')`, 보스는 `g.state.stage=9; g.state.maxCleared=9; g.startChallenge()`).
- 일러: 생성 → `artSheet.mjs` 시트 Read → 잘림/음영/작음 있으면 `SEED=<n> --force` 재생성 → `thumbs.py --force` → `--manifest` → `extractPalettes.mjs` → 도트 색 맞춤 → 커밋.

## 7. 메모리(사용자 홈)
`C:\Users\weaal\.claude\projects\C--Users-weaal-excel-heros\memory\` — `excel-heroes-project.md`(회차별 결정), `excel-heroes-art-and-ui-prefs.md`, `bash-heredoc-size-limit.md`. 새 세션은 MEMORY.md 인덱스를 자동으로 봄.

### 위장 유출 점검 (6-102에서 29건 → 0건)
새 UI 를 넣은 뒤에는 위장이 깨졌는지 센다. 브라우저 콘솔(`?guest=1`)에서:
```js
const g=window.EH.game; g.toggleExcel(true); await new Promise(r=>setTimeout(r,800));
const W=['파티','영웅','보석','골드','스킬','승진','전투','사냥','보스','뽑기','강화 카드','지분','회사 이전','스테이지','몬스터','탱커','힐러','도전','처치','쓰러','복직','호감도','교육','등급','★','엘리트','마일스톤'];
const hits=[]; for(const el of document.querySelectorAll('*')){ if(el.children.length) continue;
  const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0') continue;
  const r=el.getBoundingClientRect(); if(r.width<1||r.height<1||el.closest('[hidden]')) continue;
  const t=(el.textContent||'').trim(); if(!t||t.length>120) continue;
  const w=W.filter(x=>t.includes(x)); if(w.length) hits.push((el.id?'#'+el.id:el.className)+' : '+t.slice(0,50)); }
console.log(hits.length, hits);
```
기준: 위장 모드 **0~3건**(오탐: '사원'이 들어간 사람 이름·시트 탭). 기본 모드는 40건 내외가 정상이다.
- **어휘집(`STEALTH_TEXT`)은 정적 라벨만 담는다.** `textContent = …` 로 매 프레임 다시 쓰는 문구는 곧 덮어쓰이므로 만드는 자리에서 갈라야 한다(`STEALTH_DYN`).
- **같은 내용을 그리는 곳이 둘이면 둘 다 고쳐야 한다** — 로그 표가 위장 표와 홈 시트 표로 둘이었다.
- **숨길 때는 `visibility: hidden`.** `display: none` 은 레이아웃을 움직인다(교육 창이 322px 움직였다).
