// 시스템 벤치 — 고정 단계에서 진행을 빼고 시스템을 A/B 한다. `skillBench.mjs` 와 같은 방법이고,
// 관문 도달 시간(`abSystems.mjs`)으로는 못 가르는 것들을 위해 있다.
//
//   MIN=30 RUNS=4 STAGE=60 TARGET=0.85 node scripts/sysBench.mjs
//
// **이 스크립트의 '받은 피해'는 순수한 피해량이 아니라 `틱마다 줄어든 체력의 합`이다.** 같은 틱에
// 회복이 섞이면 상쇄된 채로 세어지므로 **회복 계열 시스템을 비교하는 데는 쓸 수 없다**(6-129에서
// 이걸 모르고 '힐러 오라를 끄면 덜 맞는다'는 불가능한 결과를 냈다). 피해 감면 계열(탱커 엄호 ·
// 보호막)에는 쓸 수 있다 — 거기서는 회복이 끼어들지 않는다.
const R = new URL('../src/', import.meta.url).href;
const { GameManager } = await import(R + 'core/GameManager.js');
const { BALANCE } = await import(R + 'config/balance.js');
const { HEROES, MAIN_ID } = await import(R + 'data/heroes.js');
const mem = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => null });
const MIN = Number(process.env.MIN ?? 30);
const RUNS = Number(process.env.RUNS ?? 4);
const STAGE = Number(process.env.STAGE ?? 60);
const TARGET = Number(process.env.TARGET ?? 0.85);
const mul = (s) => () => { s = (s + 0x6d2b79f5) | 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };

const run = (seed, level) => {
  Math.random = mul(seed * 7919 + 13);
  const g = new GameManager({ save: mem() });
  g.state.settings.autoAdvance = false; g.state.settings.autoUpgrade = false;
  g.state.stage = STAGE; g.state.maxStage = STAGE; g.state.maxCleared = STAGE; g.state.challenging = false;
  Object.assign(g.state.heroes[MAIN_ID], { level, star: 3 });
  for (const role of ['tank', 'healer', 'ranged', 'melee']) {
    const d = HEROES.find((h) => h.role === role && h.id !== MAIN_ID);
    Object.assign(g.state.heroes[d.id], { owned: true, star: 3, level, shards: 0, enhance: 0 });
    g.state.party.push(d.id);
  }
  g.entities.rebuildParty();
  let taken = 0, deaths = 0, kills0 = g.state.stats.totalKills ?? 0;
  g.on('log', (row) => { if (/쓰러짐/.test(row.text)) deaths++; });
  const prev = new Map();
  for (let i = 0; i < MIN * 60 / 0.2; i++) {
    for (const h of g.entities.heroes) prev.set(h.id, h.alive ? h.hp : null);
    g.tick(0.2);
    for (const h of g.entities.heroes) { const p = prev.get(h.id); if (p == null) continue; if (!h.alive) { taken += p; continue; } if (h.hp < p) taken += p - h.hp; }
    if (g.braceFormula) { const f = g.braceInfo(); g.submitBraceFormula(f.a + f.b); }
  }
  const maxHp = g.entities.heroes.reduce((a, h) => a + h.maxHp, 0) || 1;
  return { kills: ((g.state.stats.totalKills ?? 0) - kills0) / MIN, taken: taken / maxHp / MIN, deaths };
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// 기준선이 분당 TARGET 만큼 맞는 레벨을 찾는다
let best = null;
for (let lv = 20; lv <= 260; lv += 10) { const r = run(0, lv); if (r.kills < 5) continue; const d = Math.abs(r.taken - TARGET); if (!best || d < best.d) best = { lv, d }; }
const level = best.lv;
const P = BALANCE.ROLE_PASSIVE.healer, T = BALANCE.TANK;
const snap = { regen: P.regen, perStar: P.perStar, saveCd: T.saveCd, chance: T.chance, chancePerStar: T.chancePerStar };
const CASES = [
  ['기준선(전부 켬)', () => {}],
  ['힐러 오라 끔', () => { P.regen = 0; P.perStar = 0; }],
  ['탱커 치명타 엄호 끔', () => { T.saveCd = 1e9; }],
  ['탱커 확률 엄호 끔', () => { T.chance = 0; T.chancePerStar = 0; }],
  ['탱커 엄호 전부 끔', () => { T.saveCd = 1e9; T.chance = 0; T.chancePerStar = 0; }],
  // 가설: '오라를 끄면 덜 맞는다'는 **탱커 치명타 엄호가 대신 일하기 때문**이다(체력이 낮아져서
  // 치명타 판정에 걸리는 타격이 늘고, 그걸 탱커가 감면된 채로 받는다). 맞다면 둘 다 끄면 더 맞아야 한다.
  ['오라 + 치명타 엄호 둘 다 끔', () => { P.regen = 0; P.perStar = 0; T.saveCd = 1e9; }],
];
console.log(`시스템 벤치 — ${STAGE}단계 · 레벨 ${level} · ${MIN}분 × ${RUNS}판 (진행 없음)\n`);
console.log('설정'.padEnd(22), '분당처치'.padStart(9), '처치변화'.padStart(10), '받은피해'.padStart(9), '피해변화'.padStart(10), '쓰러짐'.padStart(7));
let base = null;
for (const [name, apply] of CASES) {
  Object.assign(P, { regen: snap.regen, perStar: snap.perStar }); Object.assign(T, { saveCd: snap.saveCd, chance: snap.chance, chancePerStar: snap.chancePerStar });
  apply();
  const rs = Array.from({ length: RUNS }, (_, i) => run(i, level));
  const k = mean(rs.map((r) => r.kills)), tk = mean(rs.map((r) => r.taken)), d = mean(rs.map((r) => r.deaths));
  if (!base) base = { k, tk };
  console.log(name.padEnd(22), k.toFixed(2).padStart(9),
    `${((k / base.k - 1) * 100).toFixed(1)}%`.padStart(10), tk.toFixed(3).padStart(9),
    `${((tk / base.tk - 1) * 100).toFixed(1)}%`.padStart(10), d.toFixed(1).padStart(7));
}
Object.assign(P, { regen: snap.regen, perStar: snap.perStar }); Object.assign(T, { saveCd: snap.saveCd, chance: snap.chance, chancePerStar: snap.chancePerStar });
console.log('\n(처치변화는 클수록 좋고, 피해변화는 **양수면 그 시스템을 꺼서 더 맞았다**는 뜻이다)');
