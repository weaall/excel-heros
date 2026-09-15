# 엑셀 히어로즈 백엔드 (서버 비용 0원)

Google 로그인 계정에 진행을 저장하고 순위표·광고 시청 기록을 담당하는 **Cloudflare Worker 1개 + D1 데이터베이스 1개**입니다.
둘 다 무료 티어(Worker 10만 요청/일, D1 5 GB · 읽기 500만/일 · 쓰기 10만/일)로 충분합니다.
게임은 서버 없이도 동작하며(브라우저 저장), 로그인한 플레이어만 계정에 동기화됩니다.

## 1. Google 로그인 클라이언트 ID 만들기 (5분, 무료)

1. https://console.cloud.google.com 에서 프로젝트를 하나 만듭니다 (이름: Excel Heroes).
2. **API 및 서비스 › OAuth 동의 화면**: 사용자 유형 *외부*, 앱 이름 "엑셀 히어로즈", 지원 이메일 입력 후 저장. 범위는 기본(email, profile)만.
   - 게시 상태를 **프로덕션**으로 올려야 본인 외 계정도 로그인할 수 있습니다 (email/profile만 쓰면 검증 없이 바로 됩니다).
3. **API 및 서비스 › 사용자 인증 정보 › 사용자 인증 정보 만들기 › OAuth 클라이언트 ID** → 애플리케이션 유형 *웹 애플리케이션*.
   - 승인된 JavaScript 원본: `https://excel-heros.qugo.kr` 와 `http://localhost:8080`
   - 리디렉션 URI는 비워 둡니다 (팝업 방식이라 필요 없음).
4. 생성된 **클라이언트 ID**(`....apps.googleusercontent.com`)를 복사합니다. 비밀번호(client secret)는 쓰지 않습니다.

## 2. Worker + D1 배포 (10분)

```bash
npm i -g wrangler
wrangler login
wrangler d1 create excel-heroes         # 출력된 database_id를 backend/wrangler.toml에 붙여넣기
```
`backend/wrangler.toml`에서 `database_id`와 `GOOGLE_CLIENT_ID`(1단계 값)를 채운 뒤:
```bash
wrangler d1 execute excel-heroes --remote --file=backend/schema.sql --config backend/wrangler.toml
wrangler deploy --config backend/wrangler.toml
```
배포 주소 `https://excel-heroes-api.<계정>.workers.dev` 뒤에 `/v1/ping`을 붙여 열면 `{"ok":true,"google":true}`가 보여야 합니다.

## 3. 게임에 연결

`index.html` 하단의 설정에 두 값을 넣고 푸시합니다 (둘 다 공개 값이라 저장소에 있어도 됩니다):
```html
<script>window.EXCEL_HEROES_CLOUD = { url: 'https://excel-heroes-api.<계정>.workers.dev', googleClientId: '....apps.googleusercontent.com' };</script>
```
배포 후 게임의 제목 표시줄 계정 버튼 또는 `파일 › 옵션 › 계정`에 Google 로그인 버튼이 나타납니다.
마지막으로 `wrangler.toml`의 `ALLOW_ORIGIN`을 `"https://excel-heros.qugo.kr"`로 바꿔 다시 배포하세요.

## 동작 방식

- 로그인: Google Identity Services 버튼 → ID 토큰 → `POST /v1/auth/google` → Worker가 Google tokeninfo로 검증(aud = GOOGLE_CLIENT_ID) → 사용자 upsert → **30일 세션 토큰** 발급. 이후 요청은 `Authorization: Bearer <세션>`.
- 저장: 로그인 상태에서 2분마다 자동 업로드. 로그인 직후 계정 저장본과 브라우저 진행이 다르면 어느 쪽을 이어갈지 고르는 창이 뜹니다.
- 조작 방지: 세이브는 브라우저에서 고칠 수 있으므로 서버는 "물리적으로 가능한가"만 검사합니다 (`src/core/plausibility.js`, 클라이언트와 같은 코드). 실패하면 422로 거부되어 순위표에 오르지 못합니다.
- 개인정보: 저장하는 것은 Google sub(계정 식별자), 이름, 프로필 사진 URL, 이메일입니다. 비밀번호는 다루지 않습니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/v1/ping` | 상태 확인 (`google`: 로그인 설정 여부) |
| POST | `/v1/auth/google` | `{ credential }` → `{ token, user, expiresAt }` |
| GET | `/v1/me` | 내 계정 + 서버 저장본 요약 |
| POST | `/v1/logout` | 세션 삭제 |
| PUT | `/v1/save` | `{ save, name, dps }` 업로드 (타당성 검사 후 저장 + 순위표 갱신) |
| GET | `/v1/save` | 내 저장본 |
| GET | `/v1/board?limit=50` | 순위표 (로그인 없이도 조회 가능, 로그인 시 내 순위 포함) |
| POST | `/v1/ad` | 보상형 광고 시청 기록 |

## 테스트

`npm test`의 `tests/cloud.test.js`가 D1과 Google tokeninfo를 스텁으로 대체해 Worker 라우트와 로그인 흐름을 그대로 실행합니다.
