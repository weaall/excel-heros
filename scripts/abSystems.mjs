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
const { boardEntry, boardScore } = await import(R + 'core/plausibility.js');
const { MODIFIERS } = await import(R + 'data/stages.js');
// 수식어를 '없음'으로 만드는 값 — 각 필드가 기본값이면 수식어가 붙어도 아무 효과가 없다.
const NEUTRAL = { count: 0, speed: 1, elite: 1, gold: 1, hp: 1, heroSpeed: 1, atk: 1 };
const MOD_SNAP = JSON.parse(JSON.stringify(MODIFIERS));

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
  // 탱커는 **두 가지**를 한다. 하나만 끄면 나머지가 그 자리를 메워서 '기여 없음'으로 읽힌다 — 6-94의 덫이다.
  tank:    { name: '탱커 엄호(전부)',  off: () => { BALANCE.TANK.chance = 0; BALANCE.TANK.chancePerStar = 0; BALANCE.TANK.saveCd = 1e9; } },
  tankOdds: { name: '탱커 확률 엄호',  off: () => { BALANCE.TANK.chance = 0; BALANCE.TANK.chancePerStar = 0; } },
  tankSave: { name: '탱커 치명타 엄호', off: () => { BALANCE.TANK.saveCd = 1e9; } },
  healer:  { name: '힐러 오라',        off: () => { BALANCE.ROLE_PASSIVE.healer.regen = 0; BALANCE.ROLE_PASSIVE.healer.perStar = 0; } },
  melee:   { name: '근접 기세',        off: () => { BALANCE.ROLE_PASSIVE.melee.haste = 0; BALANCE.ROLE_PASSIVE.melee.perStar = 0; } },
  ranged:  { name: '원거리 관통',      off: () => { BALANCE.ROLE_PASSIVE.ranged.pierce = 0; BALANCE.ROLE_PASSIVE.ranged.perStar = 0; } },
  skillStar: { name: '★ 스킬 2차 효과', off: () => { for (const k of Object.keys(BALANCE.SKILL_STAR)) BALANCE.SKILL_STAR[k] = 0; } },
  traitStar: { name: '특성 ★ 배율',    off: () => { BALANCE.TRAIT_STAR.perStar = 0; } },
  combo:   { name: '콤보',             off: () => { BALANCE.COMBO.max = 0; BALANCE.COMBO.perHit = 0; } },
  // `onEntities` 는 **회사 이전으로 `g.entities` 가 새로 만들어질 때마다** 다시 걸린다. 이게 없으면
  // 전진 소모전·부문 시너지는 첫 이전 전까지만 꺼져 있었고, 표는 그걸 '거의 기여 없음'으로 읽었다.
  attrition: { name: '전진 소모전',    onEntities: (g) => { const real = g.entities.startStage.bind(g.entities); g.entities.startStage = () => real(true); } },
  // --- 여기서부터는 6-100에서 추가. 재지 않던 시스템은 죽어 있어도 모른다.
  equip:   { name: '비품',             off: (g) => { g.autoEquipParty = () => 0; }, onEntities: (g) => { for (const e of Object.values(g.state.heroes)) e.equip = {}; g.entities.refreshHeroStats(); } },
  affection: { name: '호감도',         off: () => { BALANCE.AFFECTION.bonusPerLevel = 0; } },
  synergy: { name: '부문 시너지',      off: (g) => { const real = g.synergy.bind(g); g.synergy = () => ({ ...real(), perks: { gold: 0, regen: 0, revive: 0, boss: 0, cooldown: 0, crit: 0, skill: 0 } }); }, onEntities: (g) => g.entities.refreshHeroStats() },
  skillLv: { name: '스킬 레벨',        off: () => { BALANCE.SKILL_LEVEL.powerPerLevel = 0; BALANCE.SKILL_LEVEL.cooldownPerLevel = 0; } },
  collection: { name: '도감 보너스',   off: () => { BALANCE.COLLECTION.atkPerHero = 0; BALANCE.COLLECTION.atkPerStar = 0; BALANCE.COLLECTION.goldPerHero = 0; } },
  // 스테이지 수식어(야근 러시·감사 기간·정전·납기 압박·단체 민원)는 300단계 중 90단계(30%)에 붙는다.
  // 한 번도 A/B 로 재 본 적이 없어서 여기 넣는다 — 재지 않는 시스템은 죽어 있어도 모른다(6-100).
  modifier: { name: '스테이지 수식어', off: () => { for (const k of Object.keys(MODIFIERS)) Object.assign(MODIFIERS[k], NEUTRAL); } },
  // 하니스는 늘 수식을 맞힌다. 끄면 '한 번도 안 맞히는 플레이' = 방치 플레이어가 잃는 양이 나온다.
  brace:   { name: '수식 대응',        off: (g) => { g.__skipBrace = true; } },
};

/** 한 판을 HOURS 시간 돌리고 결과 지표를 낸다. 플레이어 행동은 모든 판에서 동일하다. */
function run(seed, mutate, reapply) {
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
  // 회사 이전은 `this.entities` 를 **새 객체로 갈아치운다**. 인스턴스에 건 패치는 그때 사라지므로
  // 매 틱 신원을 확인하고 다시 건다 — 안 그러면 '꺼 둔' 시스템이 몇 분 만에 혼자 켜진다.
  let seenEntities = g.entities;
  reapply?.(g);

  let deaths = 0, wipes = 0, peak = 0;
  // 주 지표: 각 관문에 **처음** 도달한 시각(초). 강한 파티가 더 늦게 도달할 방법은 없다.
  const GATES = [60, 90, 120];
  const reached = new Map();
  const realWipe = g.onPartyWiped.bind(g); g.onPartyWiped = () => { wipes++; return realWipe(); };
  g.on('log', (row) => { if (/쓰러짐/.test(row.text)) deaths++; });

  let t = 0, act = 0;
  const DT = 0.2;
  while (t < HOURS * 3600) {
    g.tick(DT); t += DT; act += DT;
    if (g.entities !== seenEntities) { seenEntities = g.entities; reapply?.(g); }
    if (g.state.maxCleared > peak) { peak = g.state.maxCleared; for (const gate of GATES) if (peak >= gate && !reached.has(gate)) reached.set(gate, t); }
    if (g.braceFormula && !g.__skipBrace) { const f = g.braceInfo(); g.submitBraceFormula(f.a + f.b); } // 기본은 항상 맞힌다 (변인 고정)
    if (act >= 30) { act = 0;
      if (!g.state.settings.autoAdvance) g.setAutoAdvance(true); // 전멸하면 게임이 자동 진행을 끈다 — 사람은 다시 켠다 (상태를 직접 건드리면 도전이 다시 시작되지 않는다)
      let n = 0; while (g.state.gems >= 900 && n++ < 30) { if (!g.pull(10)) break; }
      for (const id of Object.keys(g.state.heroes)) if (g.heroView(id).canPromote) g.promote(id);
      // **스킬 레벨도 올린다.** 안 올리면 `skillLv` 변종이 아무것도 안 끄는 셈이라 '기여 없음'으로
      // 나온다 — 실제로 6-132 이전 표의 스킬 레벨 값은 그 상태에서 나온 숫자였다. 사람은 파티에 넣은
      // 카드의 스킬을 올린다. 카드는 한계 돌파에도 쓰이므로 **파티에 있는 카드만** 올린다.
      for (const id of g.state.party) if (g.skillLevelInfo(id)?.can) g.upgradeSkill(id);
      const mp = g.mainPromotionInfo(); if (mp && !mp.maxed && mp.ok && mp.options?.length) g.promoteMain(mp.options[0].id);
      if (g.prestigeAdvice()) g.prestige();
      g.autoParty(); g.autoEquipParty(); g.upgradeCheapestLoop();
    }
  }
  // 지표는 **순위표 점수**다. `maxCleared` 하나로는 회사 이전이 있는 게임을 못 잰다 — 이전은 단계를
  // 일부러 되돌려 영구 지분을 사는 거래이고, 센 파티는 그 거래를 더 자주 한다. 그래서 '최고 단계'로
  // 재면 센 쪽이 더 낮게 나온다(측정: 같은 시드에서 센 판이 100분 내내 앞섰는데 240분엔 동점).
  const score = boardScore(boardEntry(g.state, '감사', g.partyDPS()));
  const cap = HOURS * 3600;
  const out = { score: Math.round(score), shares: g.state.prestige?.shares ?? 0, stage: peak, kills: g.state.stats.totalKills ?? 0, bosses: g.state.stats.bossKills ?? 0, deaths, wipes };
  // 도달하지 못한 관문은 **자료가 아니다.** 상한으로 채우면 기준선과 변종이 같은 값이 되어 차이가 0이
  // 되고, 그 0이 평균을 희석해 '기여가 없다'로 읽힌다 — 측정하지 못한 것을 좋은 소식으로 바꾸는 짓이다.
  for (const gate of GATES) { const at = reached.get(gate); out[`t${gate}`] = at === undefined ? null : Math.round(at); }
  out.cap = cap;
  return out;
}

// BALANCE 는 Object.freeze 이므로 **최상위 스칼라는 A/B 로 못 끈다**(대입이 조용히 무시된다).
// 중첩 객체(TANK, ROLE_PASSIVE …)는 얼어 있지 않아 끌 수 있다. 스칼라를 재려면 값을 직접 고쳐 두 번 돌려야 한다.
const snapshot = () => JSON.parse(JSON.stringify({
  TANK: BALANCE.TANK, ROLE_PASSIVE: BALANCE.ROLE_PASSIVE, SKILL_STAR: BALANCE.SKILL_STAR, TRAIT_STAR: BALANCE.TRAIT_STAR,
  COMBO: BALANCE.COMBO, AFFECTION: BALANCE.AFFECTION, SKILL_LEVEL: BALANCE.SKILL_LEVEL, COLLECTION: BALANCE.COLLECTION,
}));
/**
 * **얕은 `Object.assign` 은 스냅샷을 BALANCE 안으로 별칭시킨다.**
 *
 * `Object.assign(BALANCE.ROLE_PASSIVE, snap.ROLE_PASSIVE)` 는 `BALANCE.ROLE_PASSIVE.healer` 를
 * **스냅샷이 들고 있는 바로 그 객체**로 바꿔 놓는다. 그다음 변종의 `off()` 가 그 객체를 0으로 만들면
 * **스냅샷 자체가 0이 되고**, 이후의 모든 복원이 0을 복원한다. 즉 첫 변종 이후로는 앞서 끈 시스템이
 * **계속 꺼진 채로** 다음 시스템을 재게 된다(6-132에서 잡았다 — 서로 다른 두 시스템이 소수점까지
 * 같은 결과를 내서 들켰다).
 *
 * 그래서 **잎 값만 써 넣는다.** 객체 신원을 바꾸지 않으므로 별칭이 생길 수 없다.
 */
const deepAssign = (dst, src) => {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) deepAssign(dst[k] ?? (dst[k] = {}), v);
    else dst[k] = v;
  }
};
const restore = (snap) => { for (const [k, v] of Object.entries(snap)) deepAssign(BALANCE[k], v); for (const [k, v] of Object.entries(MOD_SNAP)) deepAssign(MODIFIERS[k], v); };

// 시드를 짝지었으므로 판별 차이를 평균한다(중앙값보다 민감하고, 짝 비교라 뽑기 운이 상쇄된다).
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const avg = (runs, key) => { const v = runs.map((r) => r[key]).filter((x) => x !== null && x !== undefined); return v.length ? Math.round(mean(v) * 10) / 10 : null; };
/**
 * 짝 비교. 기준선이 도달한 관문만 본다.
 *  · 양쪽 도달 → 실제 차이
 *  · 기준선만 도달 → **하한**: 관측 상한까지 못 갔으므로 최소 (상한 − 기준선)만큼 느리다. 버리면
 *    강한 효과가 '판정 불가'로 사라진다 — 도감 보너스를 끈 판이 60단계에 아예 못 갔다(6-100).
 *  · 기준선이 못 도달 → 비교할 바탕이 없다(그 관문은 usable 에서 이미 빠진다).
 */
const paired = (runs, base, key) => {
  const d = []; let bounded = 0;
  runs.forEach((r, i) => {
    const b2 = base[i][key]; if (b2 === null || b2 === undefined) return;
    if (r[key] === null || r[key] === undefined) { d.push(r.cap - b2); bounded++; }  // 하한
    else d.push(r[key] - b2);
  });
  return d.length ? { d: Math.round(mean(d) * 10) / 10, n: d.length, bounded } : null;
};

// **스냅샷 자체가 변하지 않았는지 매번 확인한다.** 이 스크립트는 정확히 이 방식으로 한 번 조용히
// 틀렸다(6-132): 복원이 스냅샷을 BALANCE 안으로 별칭시켜서, 두 번째 줄부터는 앞서 끈 시스템이 계속
// 꺼진 채로 측정됐다. 서로 다른 두 시스템이 같은 숫자를 낼 때까지 아무도 몰랐다.
const SNAP_FINGERPRINT = JSON.stringify(snapshot());
const assertSnapshotIntact = (where) => {
  if (JSON.stringify(snap) === SNAP_FINGERPRINT) return;
  console.log(`
⚠⚠ 스냅샷이 오염됐다 (${where}). 이 표의 이후 줄은 **믿을 수 없다** — 복원이 값을 쓰지 않고 객체를 붙여 넣고 있다.`);
  process.exit(1);
};

const want = process.argv.slice(2).filter((a) => SYSTEMS[a]);
const keys = want.length ? want : Object.keys(SYSTEMS);
const snap = snapshot();

console.log(`시스템 A/B 감사 — ${HOURS}시간 × ${RUNS}판 · 시드 고정 짝비교\n`);
const base = Array.from({ length: RUNS }, (_, i) => run(i));
const mmss = (x) => { if (x === null) return '미도달'; const sec = Math.round(x); return `${Math.floor(sec / 60)}분${String(sec % 60).padStart(2, '0')}초`; };
const GATE_KEYS = ['t60', 't90', 't120'];
// 기준선이 못 간 관문은 아예 쓰지 않는다 — 비교할 바탕이 없다.
const usable = GATE_KEYS.filter((k) => base.every((r) => r[k] !== null));
console.log('기준선  ', GATE_KEYS.map((k) => `${k.slice(1)}단계 ${mmss(avg(base, k))}`).join(' · '), '· 지분', String(avg(base, 'shares')).padStart(4), '· 최고', String(avg(base, 'stage')).padStart(4), '· 쓰러짐', String(avg(base, 'deaths')).padStart(4));
if (usable.length < GATE_KEYS.length) {
  const missed = GATE_KEYS.filter((k) => !usable.includes(k));
  const detail = missed.map((k) => `${k.slice(1)}단계(${base.filter((r) => r[k] !== null).length}/${RUNS}판)`).join(', ');
  console.log(`※ 기준선의 일부 판이 ${detail}에 못 갔다 — 그 관문은 평균에서 뺀다. HOURS 를 늘려라.`);
}
console.log('-'.repeat(84));

const rows = [];
const baseDeaths = avg(base, 'deaths') ?? 0;
for (const k of keys) {
  restore(snap);
  assertSnapshotIntact(`${k} 직전`);
  const sys = SYSTEMS[k];
  const runs = Array.from({ length: RUNS }, (_, i) => run(i, (g) => sys.off?.(g), (g) => sys.onEntities?.(g))); // 기준선 i판과 같은 시드
  assertSnapshotIntact(`${k} 직후`);
  restore(snap);
  // 시스템을 끄면 관문 도달이 **늦어져야** 한다. 쓸 수 있는 관문의 지연만 평균한다(+ = 느려졌다).
  const delays = []; let bounded = 0;
  for (const key of usable) { const p = paired(runs, base, key); const b2 = avg(base, key); if (p && b2) { delays.push((p.d / b2) * 100); bounded += p.bounded; } }
  const pct = delays.length ? delays.reduce((a2, b2) => a2 + b2, 0) / delays.length : null;
  // **쓰러짐도 같이 찍는다.** 생존 계열 시스템(힐러 오라·탱커 엄호)은 관문 시간을 거의 안 움직인다 —
  // 이 게임의 진행 속도는 회복량에 둔감하다는 걸 6-130에서 재서 확인했다(공급을 30%까지 깎아도
  // 60단계 도달이 초 단위까지 같았다). 그런 시스템이 실제로 움직이는 축은 **쓰러짐**이다.
  const dDeaths = avg(runs, 'deaths') - baseDeaths;
  rows.push({ k, name: sys.name, pct, deaths: avg(runs, 'deaths'), gates: delays.length, bounded });
  console.log(
    `끔: ${sys.name}`.padEnd(22),
    ...GATE_KEYS.map((key) => `${key.slice(1)} ${mmss(avg(runs, key)).padStart(8)}`),
    (pct === null ? '평균 판정불가' : `평균 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%${bounded ? '↑' : ''}`).padStart(15),
    `(관문 ${delays.length}/${GATE_KEYS.length}${bounded ? `, 하한 ${bounded}` : ''})`,
    '· 지분', String(avg(runs, 'shares')).padStart(4),
    '· 쓰러짐', `${dDeaths >= 0 ? '+' : ''}${Math.round(dDeaths)}`.padStart(5),
  );
}
console.log('-'.repeat(84));
// 쓰러짐은 **관문과 같이** 읽어야 한다. 약해진 파티는 안전 자동 진행에 막혀 덜 싸우므로 **덜 죽기도**
// 한다 — 관문이 밀리면서 쓰러짐이 줄었다면 그건 '안전해졌다'가 아니라 '덜 갔다'는 뜻이다.
console.log('쓰러짐은 관문과 같이 읽는다: 관문이 밀리면서 쓰러짐이 줄었다면 안전해진 게 아니라 덜 싸운 것이다.');
const dead = rows.filter((r) => r.pct !== null && Math.abs(r.pct) < 3);
const wrong = rows.filter((r) => r.pct !== null && r.pct < -3);
const unknown = rows.filter((r) => r.pct === null);
if (unknown.length) console.log(`판정 불가(기준선도 그 관문에 못 감): ${unknown.map((r) => r.name).join(', ')} — '기여가 없다'가 아니라 '재지 못했다'다. HOURS 를 늘려라.`);
if (rows.some((r) => r.bounded)) console.log('↑ 표시는 변종이 관문에 아예 도달하지 못해 **하한**으로 계산한 값이다 — 실제 지연은 이보다 크다.');
console.log(dead.length
  ? `꺼도 관문이 3% 미만으로만 움직이는 시스템: ${dead.map((r) => r.name).join(', ')} — **바로 '기여 없음'으로 읽지 말 것.** 생존 계열은 원래 관문을 안 움직인다(6-130). 옆의 쓰러짐 변화를 보고, 그래도 안 움직이면 \`scripts/sysBench.mjs\` 로 고정 단계에서 다시 재라.`
  : '모든 시스템이 꺼면 티가 난다.');
if (wrong.length) console.log(`⚠ 껐더니 **빨라진** 시스템: ${wrong.map((r) => `${r.name} ${r.pct.toFixed(1)}%`).join(', ')} — 버프가 손해라는 뜻이므로 지표나 게임 어딘가가 틀렸다.`);
