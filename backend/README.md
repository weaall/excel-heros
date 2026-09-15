# 엑셀 히어로즈 백엔드 (서버 비용 0원)

클라우드 저장 + 순위표 + 광고 시청 기록을 담당하는 **Cloudflare Worker 1개 + D1 데이터베이스 1개**입니다.
둘 다 무료 티어(Worker 10만 요청/일, D1 5 GB · 읽기 500만/일 · 쓰기 10만/일)로 충분합니다.
게임은 서버 없이도 그대로 동작하며, `파일 › 옵션`에 서버 주소를 넣은 플레이어만 동기화됩니다.

## 배포 (10분)

```bash
npm i -g wrangler                       # 또는 npx wrangler …
wrangler login
wrangler d1 create excel-heroes         # 출력된 database_id를 backend/wrangler.toml에 붙여넣기
wrangler d1 execute excel-heroes --remote --file=backend/schema.sql
wrangler deploy --config backend/wrangler.toml
```

배포가 끝나면 `https://excel-heroes-api.<계정>.workers.dev` 주소가 나옵니다. 그 주소를 게임의 `파일 › 옵션 › 클라우드 저장`에 입력하고 **연결 확인**을 누르면 됩니다.
게임을 GitHub Pages 등에 올린 뒤에는 `wrangler.toml`의 `ALLOW_ORIGIN`을 그 주소(예: `https://weaall.github.io`)로 바꿔 다시 배포하세요.

## 조작 방지는 어디까지 하나

- 세이브는 브라우저 localStorage에 있으므로 **플레이어 본인은 언제든 고칠 수 있습니다.** 이건 어떤 클라이언트 기술로도 막을 수 없습니다.
- 그래서 서버는 "이 세이브가 물리적으로 가능한가"만 봅니다 (`src/core/plausibility.js`, 클라이언트와 같은 코드):
  - 보유 레벨에 든 골드 합 ≤ 누적 획득 골드
  - 보석 + 뽑기에 쓴 보석 ≤ 계정 나이·스테이지·상자 수로 계산한 상한
  - 처치 수 ≤ 플레이 시간 × 초당 최대 처치, 클리어한 스테이지 × 20 ≤ 처치 수
  - 플레이 시간 ≤ 계정 나이
- 통과하지 못한 세이브는 422로 거부되어 순위표에 오르지 못합니다(로컬 저장은 그대로).
- 기기 식별은 클라이언트가 만든 id + secret(sha256만 서버 저장)입니다. 로그인·이메일·비밀번호는 없습니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| GET | `/v1/ping` | 상태 확인 |
| PUT | `/v1/save` | `{ save, name, dps }` 업로드 (타당성 검사 후 저장 + 순위표 갱신) |
| GET | `/v1/save` | 내 저장본 |
| GET | `/v1/board?limit=50` | 순위표 (지분 → 최고 스테이지 → DPS) + 내 순위 |
| POST | `/v1/ad` | 보상형 광고 시청 기록 (감사용) |

인증 헤더: `x-eh-id`, `x-eh-secret` (게임이 자동으로 붙임).

## 테스트

`npm test`의 `tests/cloud.test.js`가 D1을 메모리 스텁으로 대체해 Worker 라우트를 그대로 실행합니다.
