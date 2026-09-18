# 엑셀 히어로즈 (Excel Heroes) — 작업 규칙

웹 방치형 픽셀 RPG + 가챠를 **Excel 문서로 위장**한 게임. 순수 ES 모듈 + Canvas 2D, 의존성 0. 자세한 현재 상태와 할 일은 `docs/HANDOFF.md`, 밸런스·결정 기록은 `docs/BALANCE.md`(6-x 절이 작업 회차별 변경 기록).

## 진행 방식 (사용자 지시)
- **묻지 말고 진행**: 스스로 다음 패스를 정하고 구현 → 테스트 → 커밋 → 푸시(자동 배포). 적당한 단위마다 커밋.
- 매 패스마다 `docs/BALANCE.md`에 `## 6-N. …` 절 추가, 테스트 갱신, `node --test` 전부 통과 후 커밋. 커밋 메시지 끝에 `Co-Authored-By: Claude …` 줄.
- UI는 한국어. 데스크톱 전용 Excel 위장. "더 엑셀처럼, 구분 명확하게, 쓰기 쉽게".
- Esc(보기 › 페이지 레이아웃)는 전투 캔버스만 텍스트 행으로 바꾸고 리본의 골드·보석·강화 카드·DPS·지분은 라벨까지 숨김. 제목 표시줄에 "보스 키" 같은 게임 티 나는 문구 금지.
- 픽셀 아트 규칙: 2px 격자, 정수 배율만, 1px 검정 외곽선(`#1b1d25`), 영웅은 한 줄로 서서 **오른쪽**을 봄, 몬스터는 왼쪽. 영웅 도트는 `src/data/dollSprites.js`의 페이퍼돌 스펙(치비: 머리 크고 몸 짧게). 보스는 3×, 일반 몬스터 2×.
- 주인공(김인턴)은 **남성**이며 승진·부서 이동 후에도 같은 인물(검은 단발). 승진 트랙은 영업/재무/총무 3갈래(사원 직후 분기, 되돌릴 수 없음).
- 뽑기가 주 시스템(블루 아카이브 참고): 3일 픽업 배너, 모집 포인트(천장 교환), S 0.5% / A 5%, 첫 10연 S 확정. 등급이 높을수록 예쁜 캐릭터, D도 못생기지 않게.
- 일러스트: Animagine XL 4.0 HF Space, 블루아카 스타일 태그 유지(`scripts/genCardsHF.mjs`). **얼굴은 크게·밝게** — 선글라스 같은 소품은 OK, 음영에 묻히거나 멀리 작게 보이면 재생성. 허리 위 미디엄 샷, 정면 조명. 생성 후 `IDS=a,b node scripts/artSheet.mjs out.png 8 180`으로 시트를 만들어 눈으로 검수.
- 광고 보상은 전부 **고정 지급**(방치 배율 금지 — 게임을 꺼 두는 쪽이 이득이 되면 안 됨). `BALANCE.AD_OFFERS`.

## 보안 (최우선)
- 토큰·시크릿은 파일에 쓰거나 출력·커밋하지 않음. HF 토큰은 `.hf_token`/`.hf_tokens`(git-ignored), Google **client secret은 절대 사용 안 함**(공개 client ID만). 채팅에 노출된 비밀은 재발급 권고.
- 첫 접속은 Google 로그인 필수(`#login-gate`), localhost는 `?guest=1`로만 우회. 로컬 데이터가 계정 데이터를 오염시키지 않게(서버 사본 우선, 저장 선택 모달).
- API 호출 최소화(dirty-only 5분 저장, 순위표 5분 캐시), Worker는 스냅샷·변화량 검사(`src/core/plausibility.js`)·PUT 20초 제한·이름 필터.

## 명령
```bash
node --test                                   # 테스트 (전부 통과해야 커밋)
node scripts/serve.js                         # http://localhost:8080  (브라우저 확인은 ?guest=1)
node scripts/genCardsHF.mjs [--force] <id …>  # 카드 일러 생성 (토큰 풀 자동 로테이션, HF_ANON=1 익명만)
node scripts/genCardsHF.mjs --skin <id …>     # 스킨 일러 (<id>__casual / <id>__formal)
python scripts/thumbs.py [--force] && node scripts/genCardsHF.mjs --manifest && node scripts/extractPalettes.mjs
IDS=a,b node scripts/artSheet.mjs out.png 8 180   # 일러 검수 시트
node scripts/dollSheet.mjs out.png                # 도트 검수 시트
npx wrangler deploy --config backend/wrangler.toml   # Worker 재배포
```

## 함정
- **`node --test | grep …` 는 종료 코드를 삼킨다.** `node --test 2>&1 | grep -E '^# (pass|fail)' && git commit …` 은 grep 이 성공하면 실패한 테스트를 그대로 커밋한다. 결과를 파일로 받고 종료 코드를 따로 확인할 것: `node --test > out.txt 2>&1; rc=$?; grep -E '^# (pass|fail)' out.txt; [ $rc -eq 0 ] && git commit …`
- **간헐 실패는 밸런스를 바꾼 다음에 나타난다.** 눈금(속도·체력·성장률)을 건드렸으면 `node --test` 를 **한 번이 아니라 30~60번** 돌려 볼 것. 시뮬레이션으로 상태를 만들어 두는 테스트는 그 눈금에 매여 있다.
- Bash에서 `node -e`로 백틱/`${}`/정규식이 든 코드를 넘기면 셸이 망가뜨림 → 편집은 스크래치패드에 `.mjs` 편집 스크립트를 **Write**로 만들어 실행(멱등하게). Bash 명령은 ~10 KB 넘으면 잘림.
- HF Space `/call` API는 오류 본문을 숨김 → 스크립트는 queue 프로토콜로 실제 메시지를 읽고 "Try again in H:MM:SS"만큼 대기. 이미지 1장 = ZeroGPU 90초 고정. 계정 쿼터와 익명(IP) 쿼터는 별개 풀. `X-IP-Token`(JWT)을 붙이면 "Expired ZeroGPU proxy token" → 붙이지 말 것. 토큰에 Inference Providers 권한 없음(403).
- GitHub Pages는 정적 파일을 ~10분 캐시. 사용자가 "안 바뀌었다"고 하면 먼저 캐시 의심.
- 브라우저 콘솔의 오래된 오류는 이전 로드의 잔여 로그일 수 있음.
- `scripts/*.mjs`를 다른 스크립트에서 import할 때는 `file:///C:/…` URL 사용(Windows).
