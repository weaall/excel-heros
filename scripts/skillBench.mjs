// 스킬 벤치 — 스킬 14종이 서로 비슷한 값을 하는가.
//
// 사용법:
//   node scripts/skillBench.mjs                          # 60단계, 여유 있는 싸움
//   MIN=30 RUNS=4 STAGES=40,60,90 TARGET=0.85 node scripts/skillBench.mjs
//
// 왜 이렇게 재는가 (6-123에서 두 번 틀린 뒤에 정한 방법):
//  1. **관문 도달 시간으로는 못 잰다.** 뽑기와 회사 이전의 요동이 스킬 하나의 효과를 덮는다 — 6판을
//     돌려도 ±10%가 흔들렸고, 순수 버프인 보호막·가속이 '스킬 없음보다 느리다'로 나왔다. 있을 수 없는
//     결과이므로 자尺가 틀렸다는 뜻이다. 그래서 여기서는 **진행을 전부 끈다**(고정 단계 · 뽑기 없음 ·
//     강화 없음 · 이전 없음). 남는 건 전투뿐이라 거의 결정적이다.
//  2. **파티 전원에게 같은 스킬을 주면 안 된다.** 강타 다섯 명은 피해가 다섯 배로 더해지지만 공격력
//     버프 다섯 명은 서로를 덮어써서(Math.max) 한 명과 다르지 않다 — 순간 피해에 유리한 편향이 생긴다.
//     **주인공 한 명에게만** 주고 나머지는 스킬을 끈다.
//  3. **재는 곳을 골라야 한다.** 파티가 과하게 세면 방어 스킬이 한 번도 안 터진다(힐이 20분에 0회
//     발동했다). 레벨을 훑어 기준선이 분당 파티 총 체력의 TARGET 만큼 맞는 지점을 찾아 거기서 잰다.
//  4. **`refreshHeroStats` 가 `skillUnlocked` 를 되돌린다.** 30초마다 꺼 두는 것만으로는 부족해서
//     기준선이 발동 1814회를 기록한 적이 있다(0이어야 한다). 되돌린 직후에 다시 건다.
const R = new URL('../src/', import.meta.url).href;
const { GameManager } = await import(R + 'core/GameManager.js');
const { SKILLS, HEROES, MAIN_ID } = await import(R + 'data/heroes.js');
const mem = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => null });
const MIN = Number(process.env.MIN ?? 20);
const RUNS = Number(process.env.RUNS ?? 3);
const STAGES = (process.env.STAGES ?? '40,80').split(',').map(Number);
const mul = (s) => () => { s = (s + 0x6d2b79f5) | 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const TYPES = Object.keys(SKILLS);
const POWER = {};
for (const ty of TYPES) {
  const ps = HEROES.filter((h) => h.skill?.type === ty).map((h) => h.skill.power).sort((a, b) => a - b);
  POWER[ty] = ps.length ? ps[Math.floor(ps.length / 2)] : 1;
}

const run = (seed, stage, only, level) => {
  Math.random = mul(seed * 7919 + 13);
  const g = new GameManager({ save: mem() });
  g.state.settings.autoAdvance = false; g.state.settings.autoUpgrade = false;   // 진행 없음
  g.state.stage = stage; g.state.maxStage = stage; g.state.maxCleared = stage; g.state.challenging = false;
  // 주인공도 ★3으로 맞춘다. ★1이면 **모든 스킬의 ★ 2차 효과가 꺼진 채**로 재게 되고, 특히 웰니스
  // 데이는 ★ 보너스(넘친 회복 → 보호막)가 발동 조건에 걸려 있어 30분에 1회만 터진다.
  Object.assign(g.state.heroes[MAIN_ID], { level, star: 3 });
  for (const role of ['tank', 'healer', 'ranged', 'melee']) {
    const d = HEROES.find((h) => h.role === role && h.id !== MAIN_ID);
    Object.assign(g.state.heroes[d.id], { owned: true, star: 3, level, shards: 0, enhance: 0 });
    g.state.party.push(d.id);
  }
  g.entities.rebuildParty();
  const apply = () => {
    for (const h of g.entities.heroes) {
      if (only && h.heroId === MAIN_ID) { h.skill = { ...(h.skill ?? {}), type: only, power: POWER[only] }; h.skillUnlocked = true; h.skillCdMax = SKILLS[only].cooldown; }
      else h.skillUnlocked = false;
    }
  };
  let casts = 0;
  const hook = () => {
    const rr = g.entities.refreshHeroStats.bind(g.entities);
    g.entities.refreshHeroStats = (...a) => { const r = rr(...a); apply(); return r; };
    const rc = g.entities.castSkill.bind(g.entities);
    g.entities.castSkill = (...a) => { casts++; return rc(...a); };
  };
  hook(); apply();
  let kills0 = g.state.stats.totalKills ?? 0, downs = 0;
  let t = 0; const DT = 0.2;
  while (t < MIN * 60) {
    g.tick(DT); t += DT;
    if (g.entities.heroes.some((h) => !h.alive)) downs++;
    if (g.braceFormula) { const f = g.braceInfo(); g.submitBraceFormula(f.a + f.b); }
  }
  const kills = (g.state.stats.totalKills ?? 0) - kills0;
  const taken = g.entities.heroDamageTaken;   // **게임이 센 원래 피해** — 밖에서 체력을 적분하면 회복이 상쇄한다(6-134)
  const maxHp = g.entities.heroes.reduce((a, h) => a + h.maxHp, 0) || 1;
  return { kills: kills / MIN, taken: taken / maxHp / MIN, casts, downs };   // 분당 처치 · 분당 받은 피해(파티 총 체력 배수)
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// **재는 곳을 먼저 고른다.** 파티가 과하게 세면 방어 스킬이 한 번도 안 터진다 — 실제로 첫 시도에서
// 힐이 20분 동안 **0회** 발동했다(아무도 75% 아래로 안 떨어져서). 레벨을 훑어 기준선이 분당
// 파티 총 체력의 TARGET 만큼 맞는 지점을 찾는다. 거기가 공격도 방어도 값을 하는 싸움이다.
const TARGET = Number(process.env.TARGET ?? 0.6);
const calibrate = (stage) => {
  let best = null;
  for (let lv = 20; lv <= 260; lv += 10) {
    const r = run(0, stage, null, lv);
    if (r.kills < 5) continue;                      // 너무 약하면 아예 못 잡는다 — 그건 싸움이 아니다
    const d = Math.abs(r.taken - TARGET);
    if (!best || d < best.d) best = { lv, d, taken: r.taken, kills: r.kills };
  }
  return best;
};

for (const stage of STAGES) {
  const cal = calibrate(stage);
  if (!cal) { console.log(`${stage}단계: 쓸 만한 레벨을 못 찾았다`); continue; }
    // **반응형 스킬(회복·복직)은 아무도 안 쓰러지는 싸움에서 값이 0이다 — 그게 맞는 값이다.**
  // 회복은 피해를 막는 게 아니라 되돌리는 것이라 '받은 피해' 칸에 영원히 안 잡힌다. 잡히는 곳은
  // **쓰러짐**이고, 쓰러짐이 0인 싸움에서는 보험이 값을 할 일이 없다. `LEVEL_DROP` 으로 파티를
  // 계산된 지점보다 약하게 만들면 실제로 쓰러지기 시작하고, 거기서 비로소 비교가 된다.
  const level = cal.lv - Number(process.env.LEVEL_DROP ?? 0);
  const base = Array.from({ length: RUNS }, (_, i) => run(i, stage, null, level));
  if (base.reduce((a, r) => a + r.casts, 0)) { console.log('⚠ 기준선에서 스킬이 발동했다 — 못 믿는다.'); process.exit(1); }
  const bk = mean(base.map((r) => r.kills)), bt = mean(base.map((r) => r.taken));
  console.log(`\n${stage}단계 · ${MIN}분 × ${RUNS}판 — 기준선(스킬 없음) 분당 처치 ${bk.toFixed(1)} · 분당 받은 피해 ${bt.toFixed(2)}×파티체력\n`);
  console.log('스킬'.padEnd(10), '위력'.padStart(6), '분당처치'.padStart(9), '처치 증가'.padStart(10), '받은피해'.padStart(9), '피해 감소'.padStart(10), '쓰러짐'.padStart(7), '발동'.padStart(6));
  const rows = [];
  for (const ty of TYPES) {
    const rs = Array.from({ length: RUNS }, (_, i) => run(i, stage, ty, level));
    const k = mean(rs.map((r) => r.kills)), tk = mean(rs.map((r) => r.taken));
    const dk = (k - bk) / bk * 100, dt2 = bt > 0 ? (bt - tk) / bt * 100 : 0;
    rows.push({ ty, dk, dt2, total: dk + dt2 });
    console.log(ty.padEnd(10), String(POWER[ty]).padStart(6), k.toFixed(1).padStart(9),
      `${dk >= 0 ? '+' : ''}${dk.toFixed(1)}%`.padStart(10), tk.toFixed(2).padStart(9),
      `${dt2 >= 0 ? '+' : ''}${dt2.toFixed(1)}%`.padStart(10),
      mean(rs.map((r) => r.downs)).toFixed(0).padStart(7), String(Math.round(mean(rs.map((r) => r.casts)))).padStart(6));
  }
  rows.sort((a, b) => b.total - a.total);
  console.log('\n합계(처치증가 + 피해감소) 순:', rows.map((r) => `${r.ty} ${r.total >= 0 ? '+' : ''}${r.total.toFixed(0)}`).join(' · '));
}
