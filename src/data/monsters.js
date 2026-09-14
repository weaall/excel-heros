// Monsters are spreadsheet errors. Each Phase (10 stages) draws from a pool of 3 shapes
// in that phase's colour palette, so stages get new looks as the player progresses.
// From stage 5 on, elite variants (crown, 2.5x HP) start to appear.

export const MONSTER_TYPES = [
  { id: 'circ',      shape: 'blob',      name: '순환 참조',     face: { eyes: 'round',  mouth: 'smile' } },
  { id: 'merged',    shape: 'cube',      name: '병합된 셀',     face: { eyes: 'sleepy', mouth: 'flat' } },
  { id: 'ref',       shape: 'diamond',   name: '#REF! 오류',    face: { eyes: 'angry',  mouth: 'teeth' } },
  { id: 'virus',     shape: 'spike',     name: '매크로 바이러스', face: { eyes: 'one',   mouth: 'zigzag' } },
  { id: 'ghost',     shape: 'ghost',     name: '유령 참조',     face: { eyes: 'dot',    mouth: 'o' } },
  { id: 'sheet',     shape: 'sheet',     name: '손상된 시트',   face: { eyes: 'angry',  mouth: 'zigzag' } },
  { id: 'chart',     shape: 'chart',     name: '폭주 차트',     face: { eyes: 'round',  mouth: 'teeth' } },
  { id: 'hourglass', shape: 'hourglass', name: '응답 없음',     face: { eyes: 'sleepy', mouth: 'o' } },
  { id: 'lock',      shape: 'lock',      name: '잠긴 문서',     face: { eyes: 'dot',    mouth: 'flat' } },
  { id: 'bug',       shape: 'bug',       name: '런타임 버그',   face: { eyes: 'angry',  mouth: 'teeth' } },
  { id: 'cloud',     shape: 'cloud',     name: '동기화 충돌',   face: { eyes: 'round',  mouth: 'o' } },
  { id: 'cursor',    shape: 'cursor',    name: '커서 도둑',     face: { eyes: 'one',    mouth: 'smile' } },
  { id: 'monkey',    shape: 'monkey',    name: '복붙 원숭이',   face: { eyes: 'round',  mouth: 'smile' } },
  { id: 'bull',      shape: 'bull',      name: '마감 황소',     face: { eyes: 'angry',  mouth: 'teeth' } },
];

export const PALETTES = [
  { name: '붉은',  M: '#e74c3c', D: '#a93226', E: '#ffffff' },
  { name: '파란',  M: '#3498db', D: '#1f618d', E: '#ffffff' },
  { name: '회색',  M: '#95a5a6', D: '#5d6d7e', E: '#2c3e50' },
  { name: '주황',  M: '#f39c12', D: '#b9770e', E: '#ffffff' },
  { name: '보라',  M: '#9b59b6', D: '#6c3483', E: '#f1c40f' },
  { name: '검은',  M: '#34495e', D: '#1b2631', E: '#e74c3c' },
  { name: '초록',  M: '#2ecc71', D: '#1e8449', E: '#ffffff' },
  { name: '금빛',  M: '#f1c40f', D: '#b7950b', E: '#2c3e50' },
  { name: '분홍',  M: '#fd79a8', D: '#c2185b', E: '#ffffff' },
  { name: '청록',  M: '#1abc9c', D: '#117a65', E: '#ffffff' },
];

export const BOSS = { id: 'boss', name: '긴급 티켓', shape: 'ticket', palette: { M: '#c0392b', D: '#7b241c', E: '#f9e79f', L: '#ffffff', K: '#ff9f9f' } };

export const phaseOf = (stage) => Math.floor((Math.max(1, stage) - 1) / 10);

/** The 3 monster variants that can appear on `stage` (same for the whole phase). */
export function stagePool(stage) {
  const phase = phaseOf(stage);
  const pal = PALETTES[phase % PALETTES.length];
  const start = (phase * 2) % MONSTER_TYPES.length;
  return [0, 1, 2].map((k) => {
    const t = MONSTER_TYPES[(start + k) % MONSTER_TYPES.length];
    return { ...t, id: `${t.id}:${phase % PALETTES.length}`, name: `${pal.name} ${t.name}`, palette: { M: pal.M, D: pal.D, E: pal.E }, hue: (phase % PALETTES.length) * 36 };
  });
}

/** A random monster variant for `stage`. */
export function monsterForStage(stage, r = Math.random()) {
  const pool = stagePool(stage);
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

export const eliteChance = (stage) => (stage < 5 ? 0 : Math.min(0.3, 0.02 * (stage - 4)));
export const asElite = (def) => ({ ...def, elite: true, name: `엘리트 ${def.name}` });
