// HF ZeroGPU 쿼터 점검 — **이 점검은 공짜가 아니다.**
//
// ZeroGPU는 쿼터가 모자라면 GPU를 잡기 전에 거절한다(`process_completed` 의 에러 메시지). 그 경우에는
// 한 톨도 쓰지 않고 남은 초와 리셋 시각을 알 수 있다. 문제는 반대쪽이다 — 쿼터가 **남아 있으면** 요청이
// 실제로 실행되고, 스트림을 끊어도 Space 쪽 작업은 계속 돌아 그 풀의 90초를 태운다.
//
// 그래서 결과는 두 종류로만 말한다:
//   · 소진        — 거절당했다. 공짜로 알아냈고 남은 초·리셋 시각이 정확하다.
//   · 썼음(있었다) — 실행이 시작됐다. 쿼터가 있었다는 **과거형**이고, 확인하는 순간 90초를 썼다.
// '사용 가능'이라고 쓰지 않는다. 실제로 14장 배치 직전에 이 점검이 6개 풀 전부 '사용 가능'이라고
// 답했고, 바로 다음 요청에서 토큰 #1이 '90s requested vs. 88s left' 로 거절했다 — 점검이 태운 것이다.
//
// **배치 전에는 돌리지 마라.** genCardsHF 가 이미 풀을 돌리며 실제 에러를 읽는다. 이 스크립트는
// '왜 전부 막혔나'를 사후에 확인할 때만 쓴다.
//
// 사용법:
//   node scripts/hfQuota.mjs            # 풀별 상태 (막힌 풀만 공짜로 알 수 있다)
//   node scripts/hfQuota.mjs --json     # 기계가 읽을 형태
import fs from 'node:fs';

const SPACE = process.env.SPACE ?? 'asahina2k-animagine-xl-4-0';
const BASE = `https://${SPACE}.hf.space`;
const asJson = process.argv.includes('--json');

/** genCardsHF.mjs 와 같은 풀 구성: .hf_token(1) + .hf_tokens(여러 줄) + 익명. 토큰 값은 절대 출력하지 않는다. */
function pools() {
  const read = (rel) => { const u = new URL(rel, import.meta.url); return fs.existsSync(u) ? fs.readFileSync(u, 'utf8') : ''; };
  const list = [...new Set([
    process.env.HF_TOKEN ?? read('../.hf_token').trim(),
    ...read('../.hf_tokens').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')),
  ].filter(Boolean))];
  return [...list.map((t, i) => ({ name: `토큰 #${i + 1}`, token: t })), { name: '익명(IP)', token: '' }];
}

/** "90s requested vs. 87s left" 와 "Try again in 8:24:07" 을 뽑아낸다. */
function parseQuota(msg) {
  const left = /vs\.\s*(\d+)s\s*left/.exec(msg)?.[1];
  const again = /Try again in\s*([\d:]+)/.exec(msg)?.[1];
  let resetSec = null;
  if (again) { const p = again.split(':').map(Number); resetSec = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
  return { left: left === undefined ? null : Number(left), resetIn: again ?? null, resetSec };
}

const hhmm = (sec) => {
  if (sec === null) return '-';
  const d = new Date(Date.now() + sec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let _fn = null;
/** 'generate' 엔드포인트의 fn_index 를 /config 에서 한 번만 읽는다. 하드코딩하면 조용히 빗나간다. */
async function fnIndexFor(AUTH) {
  if (_fn !== null) return _fn;
  const cfg = await (await fetch(`${BASE}/config`, { headers: AUTH })).json();
  _fn = cfg.dependencies.findIndex((d) => d.api_name === 'generate');
  return _fn;
}

/** 한 풀을 한 번 찌른다. 쿼터가 없으면 에러 메시지로, 있으면 스트림을 끊고 available 로 돌아온다. */
async function probe(token) {
  const AUTH = token ? { authorization: `Bearer ${token}` } : {};
  const session_hash = Math.random().toString(36).slice(2);
  const data = ['1girl, solo', '', 0, 832, 1216, 5, 28, 'Euler a', '832 x 1216', 'Anim4gine', false, 0.55, 1.5, true];
  let r;
  try {
    r = await fetch(`${BASE}/queue/join`, { method: 'POST', headers: { 'content-type': 'application/json', ...AUTH }, body: JSON.stringify({ data, fn_index: await fnIndexFor(AUTH), session_hash, trigger_id: null }), signal: AbortSignal.timeout(30000) });
  } catch (e) { return { status: 'error', detail: `join: ${e.message}` }; }
  if (!r.ok) return { status: 'error', detail: `join ${r.status}` };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const ev = await fetch(`${BASE}/queue/data?session_hash=${session_hash}`, { headers: AUTH, signal: ctl.signal });
    const reader = ev.body.getReader(); const dec = new TextDecoder(); let buf = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const m = JSON.parse(line.slice(5));
        if (m.msg === 'process_completed') {
          const err = String(m.output?.error ?? '');
          if (err) return { status: 'exhausted', detail: err, ...parseQuota(err) };
          return { status: 'spent', detail: '한 장을 끝까지 생성했다 — 이 확인이 90초를 썼다' };
        }
        // 실행이 시작됐다 = 쿼터가 있다. 여기서 끊어 90초를 통째로 쓰지 않게 한다.
        if (m.msg === 'process_starts' || m.msg === 'process_generating') {
          ctl.abort();
          // 끊어도 Space 쪽 작업은 계속 돈다 — 그래서 '있다'가 아니라 '있었고 지금 썼다'로 기록한다.
          return { status: 'spent', detail: '실행 시작됨 — 쿼터가 있었고, 이 확인이 90초를 썼다' };
        }
        if (m.msg === 'close_stream') return { status: 'unknown', detail: 'stream closed' };
      }
    }
    return { status: 'unknown', detail: 'no verdict' };
  } catch (e) {
    if (e.name === 'AbortError') return { status: 'unknown', detail: '판정 전에 끊김 — 쿼터 여부 알 수 없음' };
    return { status: 'error', detail: e.message };
  } finally { clearTimeout(timer); }
}

const rows = [];
for (const p of pools()) {
  const res = await probe(p.token);
  rows.push({ pool: p.name, ...res });
}

if (asJson) { console.log(JSON.stringify(rows, null, 2)); process.exit(0); }

const label = { spent: '썼음(있었다)', exhausted: '소진', error: '오류', unknown: '알 수 없음' };
console.log(`ZeroGPU 쿼터 (${SPACE}) · 이미지 1장 = 90초\n`);
console.log('풀           상태        남은 초   리셋까지    리셋 시각');
console.log('-'.repeat(60));
for (const r of rows) {
  console.log(
    r.pool.padEnd(12),
    (label[r.status] ?? r.status).padEnd(10),
    String(r.left ?? '-').padStart(6),
    String(r.resetIn ?? '-').padStart(10),
    String(hhmm(r.resetSec ?? null)).padStart(10),
  );
}
const spent = rows.filter((r) => r.status === 'spent').length;
const dead = rows.filter((r) => r.status === 'exhausted').length;
const soonest = rows.filter((r) => r.resetSec != null).sort((a, b) => a.resetSec - b.resetSec)[0];
console.log('-'.repeat(60));
if (spent) console.log(`쿼터가 있던 풀 ${spent}개 — 그리고 이 점검이 각각 90초를 썼다(약 ${spent * 90}초).`);
if (dead) console.log(`소진된 풀 ${dead}개${soonest ? ` — 가장 빨리 차는 풀: ${soonest.pool} (${soonest.resetIn} 뒤, ${hhmm(soonest.resetSec)})` : ''}`);
if (!spent && !dead) console.log('판정을 못 얻었다 — Space 혼잡일 수 있다. 상태를 좋은 소식으로 바꾸지 않는다.');
console.log('배치를 돌릴 참이면 이 점검을 건너뛰어라 — genCardsHF 가 풀을 돌리며 실제 에러를 읽는다.');
