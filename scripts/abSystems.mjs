// 시스템 A/B 감사 — "이 시스템을 꺼도 결과가 같은가?"
//
// 6-93의 교훈: 단위 테스트가 전부 통과해도 두 시스템이 **서로를 무력화**할 수 있다. 자동 부활을 지웠는데
// 스테이지 전환이 같은 일을 대신하고 있었고, 그건 어떤 단위 테스트로도 안 잡혔다. 잡는 방법은 하나다 —
// 시스템을 하나씩 끄고 **결과 지표가 실제로 움직이는지** 보는 것.
//
// 사용법:
//   node scripts/abSystems.mjs            # 전부
//   node scripts/abSystems.mjs tank heal  # 일부만
//   HOURS=2 RUNS=3 node scripts/abSystems.mjs
//
// 난수는 시드로 고정하고 기준선과 변종을 **같은 시드끼리 짝지어** 비교한다. 이게 없으면 뽑기 운이 효과를 덮는다.
// 결과가 기준선과 거의 같은 시스템은 **꺼도 티가 안 난다**는 뜻이고, 그건 밸런스에 기여하지 않는다는 신호다.
const R = new URL('../src/', import.meta.url).href;
const { createInitialState } = await import(R + 'core/state.js');
const { GameManager } = await import(R + 'core/GameManager.js');
const { BALANCE } = await import(R + 'config/balance.js');
const { HEROES, MAIN_ID } = await import(R + 'data/heroes.js');

const HOURS = Number(process.env.HOURS ?? 2);
const RUNS = Number(process.env.RUNS ?? 3);

// 난수를 고정한다. 이게 없으면 뽑기 운이 시스템 효과를 덮어서, '꺼도 결과가 같다'가 아니라
// '무엇을 재는지 모른다'가 된다 — 실제로 모든 변종이 기준선보다 좋게 나오는 불가능한 표가 나왔다.
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let x = seed;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const seedRandom = (n) => { const r = mulberry32(n * 7919 + 13); Math.random = () => r(); };
const mem = () => ({ save() {}, load() { return null; }, clear() {}, export: () => '', import: () => createInitialState() });

/** 끌 수 있는 시스템들. 각각 `off(g)` 가 그 시스템만 무력화한다(다른 건 건드리지 않는다). */
const SYSTEMS = {
  tank:    { name: '탱커 엄호',        off: () => { BALANCE.TANK.chance = 0; BALANCE.TANK.chancePerStar = 0; } },
  healer:  { name: '힐러 오라',        off: () => { BALANCE.ROLE_PASSIVE.healer.regen = 0; BALANCE.ROLE_PASSIVE.healer.perStar = 0; } },
  melee:   { name: '근접 기세',        off: () => { BALANCE.ROLE_PASSIVE.melee.haste = 0; BALANCE.ROLE_PASSIVE.melee.perStar = 0; } },
  ranged:  { name: '원거리 관통',      off: () => { BALANCE.ROLE_PASSIVE.ranged.pierce = 0; BALANCE.ROLE_PASSIVE.ranged.perStar = 0; } },
  skillStar: { name: '★ 스킬 2차 효과', off: () => { for (const k of Object.keys(BALANCE.SKILL_STAR)) BALANCE.SKILL_STAR[k] = 0; } },
  traitStar: { name: '특성 ★ 배율',    off: () => { BALANCE.TRAIT_STAR.perStar = 0; } },
  combo:   { name: '콤보',             off: () => { BALANCE.COMBO.max = 0; BALANCE.COMBO.perHit = 0; } },
  attrition: { name: '전진 소모전',    off: (g) => { const real = g.entities.startStage.bind(g.entities); g.entities.startStage = () => real(true); } },
};

/** 한 판을 HOURS 시간 돌리고 결과 지표를 낸다. 플레이어 행동은 모든 판에서 동일하다. */
function run(seed, mutate) {
  seedRandom(seed);
  const g = new GameManager({ save: mem() });
  g.state.settings.autoAdvance = true; g.state.settings.autoUpgrade = true;
  // 파티가 네 역할을 갖추도록 초기 카드를 준다 (역할 시스템을 재려면 역할이 있어야 한다)
  for (const role of ['tank', 'healer', 'ranged', 'melee']) {
    const d = HEROES.find((h) => h.role === role && h.id !== MAIN_ID);
    Object.assign(g.state.heroes[d.id], { owned: true, star: 3, level: 1, shards: 0, enhance: 0 });
    g.state.party.push(d.id);
  }
  g.entities.rebuildParty();
  mutate?.(g);

  let deaths = 0, wipes = 0, peak = 0;
  const realWipe = g.onPartyWiped.bind(g); g.onPartyWiped = () => { wipes++; return realWipe(); };
  g.on('log', (row) => { if (/쓰러짐/.test(row.text)) deaths++; });

  let t = 0, act = 0;
  const DT = 0.2;
  while (t < HOURS * 3600) {
    g.tick(DT); t += DT; act += DT;
    if (g.state.maxCleared > peak) peak = g.state.maxCleared;
    if (g.braceFormula) { const f = g.braceInfo(); g.submitBraceFormula(f.a + f.b); } // 항상 맞힌다 (변인 고정)
    if (act >= 30) { act = 0;
      if (!g.state.settings.autoAdvance) g.setAutoAdvance(true); // 전멸하면 게임이 자동 진행을 끈다 — 사람은 다시 켠다 (상태를 직접 건드리면 도전이 다시 시작되지 않는다)
      let n = 0; while (g.state.gems >= 900 && n++ < 30) { if (!g.pull(10)) break; }
      for (const id of Object.keys(g.state.heroes)) if (g.heroView(id).canPromote) g.promote(id);
      const mp = g.mainPromotionInfo(); if (mp && !mp.maxed && mp.ok && mp.options?.length) g.promoteMain(mp.options[0].id);
      if (g.prestigeAdvice()) g.prestige();
      g.autoParty(); g.autoEquipParty(); g.upgradeCheapestLoop();
    }
  }
  return { stage: peak, kills: g.state.stats.totalKills ?? 0, bosses: g.state.stats.bossKills ?? 0, deaths, wipes };
}

// BALANCE 는 Object.freeze 이므로 **최상위 스칼라는 A/B 로 못 끈다**(대입이 조용히 무시된다).
// 중첩 객체(TANK, ROLE_PASSIVE …)는 얼어 있지 않아 끌 수 있다. 스칼라를 재려면 값을 직접 고쳐 두 번 돌려야 한다.
const snapshot = () => JSON.parse(JSON.stringify({ TANK: BALANCE.TANK, ROLE_PASSIVE: BALANCE.ROLE_PASSIVE, SKILL_STAR: BALANCE.SKILL_STAR, TRAIT_STAR: BALANCE.TRAIT_STAR, COMBO: BALANCE.COMBO }));
const restore = (snap) => { for (const [k, v] of Object.entries(snap)) Object.assign(BALANCE[k], v); };

// 시드를 짝지었으므로 판별 차이를 평균한다(중앙값보다 민감하고, 짝 비교라 뽑기 운이 상쇄된다).
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const avg = (runs, key) => Math.round(mean(runs.map((r) => r[key])) * 10) / 10;
const paired = (runs, base, key) => Math.round(mean(runs.map((r, i) => r[key] - base[i][key])) * 10) / 10;

const want = process.argv.slice(2).filter((a) => SYSTEMS[a]);
const keys = want.length ? want : Object.keys(SYSTEMS);
const snap = snapshot();

console.log(`시스템 A/B 감사 — ${HOURS}시간 × ${RUNS}판 · 시드 고정 짝비교\n`);
const base = Array.from({ length: RUNS }, (_, i) => run(i));
console.log('기준선          클리어', String(avg(base, 'stage')).padStart(4), '· 처치', String(avg(base, 'kills')).padStart(7), '· 보스', String(avg(base, 'bosses')).padStart(3), '· 쓰러짐', String(avg(base, 'deaths')).padStart(4));
console.log('-'.repeat(84));

const rows = [];
for (const k of keys) {
  restore(snap);
  const sys = SYSTEMS[k];
  const runs = Array.from({ length: RUNS }, (_, i) => run(i, (g) => sys.off(g))); // 기준선 i판과 같은 시드
  restore(snap);
  const d = (key) => paired(runs, base, key);
  const pct = avg(base, 'stage') ? (d('stage') / avg(base, 'stage')) * 100 : 0;
  rows.push({ k, name: sys.name, stage: avg(runs, 'stage'), dStage: d('stage'), pct, deaths: avg(runs, 'deaths') });
  console.log(
    `끔: ${sys.name}`.padEnd(22),
    '클리어', String(avg(runs, 'stage')).padStart(4),
    `(${d('stage') >= 0 ? '+' : ''}${d('stage')}, ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`.padStart(18),
    '· 쓰러짐', String(avg(runs, 'deaths')).padStart(4),
  );
}
console.log('-'.repeat(84));
const dead = rows.filter((r) => Math.abs(r.pct) < 3);
console.log(dead.length
  ? `꺼도 3% 미만으로만 움직이는 시스템: ${dead.map((r) => r.name).join(', ')} — 밸런스에 기여하지 않는다는 신호다.`
  : '모든 시스템이 꺼면 티가 난다.');
