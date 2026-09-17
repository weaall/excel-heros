# 인수인계 (2026-09-17) — 다음 세션이 이어서 볼 문서

작업 규칙·보안·명령·함정은 `CLAUDE.md`(자동 로드). 이 문서는 **현재 상태와 남은 일**.

## 1. 한 줄 요약
Excel 문서로 위장한 방치형 픽셀 RPG + 가챠. 50명 영웅(D~S) + 주인공 11직급, 일러 161장(기본 61 + 스킨 100), Google 로그인 필수, Cloudflare Worker + D1 백엔드, GitHub Pages 자동 배포. 테스트 101개 통과. 61차 패스까지 완료.

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
- `index.html` / `styles.css` — Excel 크롬(리본·시트 탭·상태 바), 시트: 메인 전투 / 인사_명단 / 데이터 가져오기(뽑기) / 일일 업무(검토, 2열) / 사내_메신저 / 사원_앨범 / 오류_도감 / 통계_차트. 부팅 스플래시 `#boot`, 로그인 게이트 `#login-gate`, 코치 마크 `#coach`.
- `src/main.js` — 부팅 순서, 로그인 게이트, 서버 사본 우선 로드, 아트 비동기 로드.
- `src/core/GameManager.js` — 상태·재화·스테이지·모든 플레이어 액션(승진 `promoteMain`, 스킨, 호감도, 출장, 야근, 픽업/천장, 마일스톤 수동 수령, 광고 `adOffers/adReward`, 클라우드).
- `src/core/EntityManager.js` — 전투 루프, 스킬 9종, 보스 스킬(`BOSSES[].specials`), 말풍선, 이벤트(`skill-cast`, `ult`, `boss-special`).
- `src/ui/Renderer.js` — 캔버스: 던전, 도트, 이펙트, 스킬 일러 컷인(`#drawSkillCard`), 배너/보스 컷인(위 280px만 어둡게), HUD.
- `src/ui/UIManager.js` — DOM 전부. 상세 창 5탭(정보/스킬/스킨/프로필/호감도, `#renderDetail`), 승진 패널(`#mainPromoPanel`, 트랙 색), 출장(등급순), 광고 표(`#adTable`), 앨범, 도감, 클라우드 UI.
- `src/ui/Ads.js` — 공급자 추상화(adsense / applixir / custom).
- `src/core/{Auth,CloudSync,plausibility,state,QuestManager,MilestoneManager,AchievementManager,GachaManager}.js`.
- `src/data/heroes.js`(HEROES 50, MAIN_JOBS 11, MAIN_TRACKS, SKILLS, TRAITS, GRADES), `dollSprites.js`(도트 스펙 61), `skins.js`, `pickup.js`, `divisions.js`(부문 시너지·특성), `profiles.js`+`profilesExtra.js`, `story.js`, `quips.js`, `monsters.js`(BOSSES specials), `packSprites.js`(0x72 몬스터), `cardArt.js`(매니페스트 로드, 썸네일/원본), `artPalettes.js`(자동 생성).
- `src/config/balance.js` — 모든 수치(AD_OFFERS, MAIN_PROMOTE_*, GEM_DROP, DISPATCH, OVERTIME, AFFECTION, SKILL_LEVEL …).
- `scripts/` — `genCardsHF.mjs`(일러, --skin, --manifest, 토큰 풀), `thumbs.py`(WebP), `extractPalettes.mjs`, `artSheet.mjs`, `dollSheet.mjs`, `serve.js`, `png.mjs`.
- `tests/` — 101개(`node --test`). 새 기능마다 테스트 추가가 관례.

## 4. 이번 주에 확정된 설계 결정 (BALANCE 6-38 ~ 6-43)
- 주인공: 인턴→사원→**트랙 선택(영업 근접/재무 원거리/총무 탱커)**→대리→과장→부장. 구버전 `senior/manager` 저장은 `state.migrate`가 영업 트랙으로 이관.
- 일러 얼굴 규칙: 미디엄 샷·정면 조명, 네거티브에 역광/작은 얼굴. 61장 전수 재생성 완료. 스킨 100장 완료.
- 상세 창 5탭, 출장 등급순, Esc 시 리본 재화 라벨 숨김.
- 스킬 컷인(일러 명찰 카드), 필살기 컷인 일러, 보스 3× + 고유 스킬 3종×2, 컷인 오버레이 축소.
- 광고: 고정 5종(골드 1h ×3, 보석 15 ×2, 카드 10 ×2, 출장 즉시 복귀 ×1, 야근 추가 ×1). 2배 방치 삭제. AppLixir는 월 10만 임프레션 필요 → 애드센스 대기.

## 5. 남은 일 (우선순위 순)
1. **A급 일러 품질 상향**: 사용자가 COO/CMO를 CCO·CEO급으로 올린 걸 좋아함. 같은 기준으로 후보: `cfo, cto, chro, design_lead, pm_lead` (프롬프트에 '금장식, 반짝임, 빛 입자, beautiful detailed face' 추가 후 `--force` 재생성, 시트 검수, 도트 색 맞추기). 사용자에게 5명 제안해 둔 상태.
2. **애드센스 승인 후**: `EXCEL_HEROES_ADS.publisherId` 설정, 실제 노출 빈도(30s 힌트) 조정, ads.txt 확인.
3. **스킨 도트**: 스킨 장착 시 도트는 팔레트 시프트만(`skins.js casualPalette/FORMAL`). 일러에 맞춘 스킨별 도트 스펙(`dollSprites` 확장)은 미착수.
4. **주인공 스킨 일러**: `--skin`은 기본적으로 HEROES만. 메인 직급 11개의 스킨 일러(22장)는 미생성(필요하면 `--skin intern staff …`).
5. **보스 스킬 밸런스 확인**: volley 0.6×3, slow 0.7/4s, throw 1.4× — 실제 플레이 체감 미검증(시뮬 테스트만).
6. **HF 토큰 재발급** 후 `.hf_tokens` 갱신(사용자 작업). 토큰이 4계정이면 하루 약 40~50장.
7. 열린 질문(BALANCE 8장): 부장 트랙 "전직" 기능 필요 여부, 순위표 노출 정책 등.

## 6. 검증 루틴
- 코드: `node --test` → 브라우저 `http://localhost:8080/?guest=1&v=<n>`(dev 서버 `node scripts/serve.js`)에서 `window.EH.game / EH.ui`로 상태 조작해 확인(`g.state.cards=5000; g.state.maxCleared=100; g.promoteMain('staff')`, `EH.ui.openDetail('ceo')`, 보스는 `g.state.stage=9; g.state.maxCleared=9; g.startChallenge()`).
- 일러: 생성 → `artSheet.mjs` 시트 Read → 잘림/음영/작음 있으면 `SEED=<n> --force` 재생성 → `thumbs.py --force` → `--manifest` → `extractPalettes.mjs` → 도트 색 맞춤 → 커밋.

## 7. 메모리(사용자 홈)
`C:\Users\weaal\.claude\projects\C--Users-weaal-excel-heros\memory\` — `excel-heroes-project.md`(회차별 결정), `excel-heroes-art-and-ui-prefs.md`, `bash-heredoc-size-limit.md`. 새 세션은 MEMORY.md 인덱스를 자동으로 봄.
