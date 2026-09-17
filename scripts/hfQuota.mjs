// HF ZeroGPU 쿼터 점검: 토큰 풀마다 남은 초와 리셋 시각을 표로 뽑는다.
//
// 왜 이런 방식인가: ZeroGPU는 쿼터가 모자라면 **GPU를 잡기 전에** 거절한다(`process_completed` 에 에러 메시지).
// 그래서 한 장 요청해 보고 에러만 읽으면 쿼터를 한 톨도 쓰지 않는다. 반대로 쿼터가 남아 있으면 그 요청은
// 실제로 90초를 쓰게 되므로, 그 경우에는 **곧바로 스트림을 끊고** 'available' 로만 기록한다.
// (끊어도 Space 쪽에서 이미 시작한 작업은 돌 수 있다 — 그래서 --spend 없이는 풀당 한 번만 찌른다.)
//
// 사용법:
//   node scripts/hfQuota.mjs            # 토큰별 남은 쿼터 표
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
          return { status: 'available', detail: '한 장을 실제로 생성했다(쿼터 있음)' };
        }
        // 실행이 시작됐다 = 쿼터가 있다. 여기서 끊어 90초를 통째로 쓰지 않게 한다.
        if (m.msg === 'process_starts' || m.msg === 'process_generating') {
          ctl.abort();
          return { status: 'available', detail: '실행 시작됨 — 쿼터 있음(요청은 끊음)' };
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

const label = { available: '사용 가능', exhausted: '소진', error: '오류', unknown: '알 수 없음' };
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
const ready = rows.filter((r) => r.status === 'available').length;
const soonest = rows.filter((r) => r.resetSec != null).sort((a, b) => a.resetSec - b.resetSec)[0];
console.log('-'.repeat(60));
console.log(ready ? `지금 뽑을 수 있는 풀 ${ready}개` : soonest ? `전부 소진 — 가장 빨리 차는 풀: ${soonest.pool} (${soonest.resetIn} 뒤, ${hhmm(soonest.resetSec)})` : '전부 소진');
