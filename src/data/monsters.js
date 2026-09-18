import { MONSTER_MAPS } from './monsterArt.js';
// Monsters are spreadsheet errors. Each Phase (10 stages) draws from a pool of 3 shapes
// in that phase's colour palette, so stages get new looks as the player progresses.
// From stage 5 on, elite variants (crown, 2.5x HP) start to appear.

export const MONSTER_TYPES = [
  { id: 'circ',      shape: 'blob',      name: '순환 참조',     face: { eyes: 'round',  mouth: 'smile' } },
  { id: 'merged',    shape: 'cube',      name: '병합된 셀',     face: { eyes: 'sleepy', mouth: 'flat' } },
  { id: 'ref',       shape: 'diamond',   name: '#REF! 오류',    face: { eyes: 'angry',  mouth: 'teeth' } },
  { id: 'virus',     shape: 'spike',     name: '매크로 바이러스', face: { eyes: 'one',   mouth: 'zigzag' } },
  // 사무기기가 그대로 괴물이 된 종류 — 던전 생물보다 이 게임에 맞고, 훨씬 귀엽다 (손그림 MONSTER_MAPS)
  { id: 'copier',    shape: 'cube',  name: '복사기 괴물',   face: { eyes: 'round', mouth: 'o' } },
  { id: 'shredder',  shape: 'cube',  name: '문서 파쇄기',   face: { eyes: 'angry', mouth: 'teeth' } },
  { id: 'ceo_chair', shape: 'blob',  name: '사장님 의자',   face: { eyes: 'sleepy', mouth: 'flat' } },
  { id: 'slide',     shape: 'sheet', name: '발표 자료',     face: { eyes: 'round', mouth: 'teeth' } },
  { id: 'stapler',   shape: 'cube',  name: '스테이플러',    face: { eyes: 'angry', mouth: 'zigzag' } },
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
  // Tiny Creatures additions (single-frame creatures, bob animation)
  { id: 'mushroom',  shape: 'blob',      name: '스팸 메일함',     face: { eyes: 'round',  mouth: 'smile' } },
  { id: 'eyeball',   shape: 'blob',      name: '감시 카메라',     face: { eyes: 'one',    mouth: 'flat' }, ranged: 'drop' },
  { id: 'hand',      shape: 'blob',      name: '키보드 괴물',     face: { eyes: 'dot',    mouth: 'flat' } },
  { id: 'golem',     shape: 'cube',      name: '서버 랙', face: { eyes: 'angry',  mouth: 'flat' } },
  { id: 'flame',     shape: 'spike',     name: '과열 노트북',     face: { eyes: 'angry',  mouth: 'zigzag' } },
  { id: 'orb',       shape: 'blob',      name: '로딩 커서',     face: { eyes: 'one',    mouth: 'o' }, ranged: 'drop' },
  { id: 'rabbit',    shape: 'blob',      name: '마감 달력',     face: { eyes: 'round',  mouth: 'o' } },
  { id: 'chicken',   shape: 'blob',      name: '커피 머신',       face: { eyes: 'dot',    mouth: 'flat' }, ranged: 'paper' },
  { id: 'cat',       shape: 'blob',      name: '야근 램프',   face: { eyes: 'sleepy', mouth: 'smile' } },
  { id: 'rat',       shape: 'blob',      name: '버그 마우스',       face: { eyes: 'dot',    mouth: 'teeth' } },
  { id: 'snake',     shape: 'blob',      name: '엉킨 전선',     face: { eyes: 'angry',  mouth: 'zigzag' } },
  { id: 'robot',     shape: 'cube',      name: '고장난 프린터',   face: { eyes: 'dot',    mouth: 'flat' }, ranged: 'bar' },
];

// 변종 팔레트. `name` 은 **색을 말하는** 이름이고 `alt` 는 색을 말하지 않는 이름이다.
// 팔레트가 스프라이트에서 거의 안 보이는 몬스터(발표 자료 6%, 손상된 시트 15% …)에 색 이름을 붙이면
// "붉은 발표 자료" 가 하얗게 나온다 — 그런 몬스터는 `alt` 를 쓴다. 판정은 아래 `showsPalette()`.
export const PALETTES = [
  { name: '붉은',  alt: '과열된',   M: '#e74c3c', D: '#a93226', E: '#ffffff' },
  { name: '파란',  alt: '먹통된',   M: '#3498db', D: '#1f618d', E: '#ffffff' },
  { name: '회색',  alt: '낡은',     M: '#95a5a6', D: '#5d6d7e', E: '#2c3e50' },
  { name: '주황',  alt: '삐걱대는', M: '#f39c12', D: '#b9770e', E: '#ffffff' },
  { name: '보라',  alt: '수상한',   M: '#9b59b6', D: '#6c3483', E: '#f1c40f' },
  { name: '검은',  alt: '그을린',   M: '#34495e', D: '#1b2631', E: '#e74c3c' },
  { name: '초록',  alt: '곰팡이 핀', M: '#2ecc71', D: '#1e8449', E: '#ffffff' },
  { name: '금빛',  alt: '반짝이는', M: '#f1c40f', D: '#b7950b', E: '#2c3e50' },
  { name: '분홍',  alt: '구겨진',   M: '#fd79a8', D: '#c2185b', E: '#ffffff' },
  { name: '청록',  alt: '눅눅한',   M: '#1abc9c', D: '#117a65', E: '#ffffff' },
];

/**
 * 이 몬스터의 도트에서 **팔레트가 칠하는 비율**. `M`(몸통) · `D`(그림자) · `l`(밝은 면)만 팔레트가
 * 정하고, `E`(테두리) · `L`(흰색) · `Y`(포인트) 같은 글자는 고정색이다.
 * 맵에서 직접 세므로 도트를 고치면 분류도 따라온다 — 손으로 목록을 관리하면 반드시 어긋난다.
 */
const PALETTE_CHARS = new Set(['M', 'D', 'l']);
const shareCache = new Map();
export function paletteShare(typeId) {
  if (shareCache.has(typeId)) return shareCache.get(typeId);
  const map = MONSTER_MAPS[typeId];
  let share = 1;
  if (map) {
    const chars = map.join('').split('').filter((c) => c !== '.');
    share = chars.length ? chars.filter((c) => PALETTE_CHARS.has(c)).length / chars.length : 1;
  }
  shareCache.set(typeId, share); return share;
}
/** 색 이름을 붙여도 거짓말이 되지 않는가. 경계 35%는 측정값에서 왔다(위 33% 뱀 ↔ 40% 손 사이). */
export const showsPalette = (typeId) => paletteShare(typeId) >= 0.35;

const BOSS_PALETTE = { M: '#c0392b', D: '#7b241c', E: '#f9e79f', L: '#ffffff', K: '#ff9f9f' };
/** Bosses rotate by phase. pattern: fire = 35% fireball at a random hero. specials fire on every Nth attack (the '!' telegraph
 *  shows one attack ahead; when two line up the rarer one wins): sweep = front two ×0.9 · stomp = whole line ×0.5 ·
 *  volley = 3 fireballs ×0.6 at 3 different heroes · slow = party attack speed ×0.7 for 4 s · throw = crate at the back line ×1.4.
 *  hp/atk/speed/interval scale the base boss numbers. Bosses draw at 3× (96×108 px) so they tower over the 2× monsters. */
export const BOSSES = [
  { id: 'boss',        name: '긴급 티켓',        shape: 'ticket', palette: BOSS_PALETTE, pattern: 'fire',  hp: 1,    atk: 1,    speed: 110, interval: 2.0, specials: [{ every: 5, kind: 'volley', name: '티켓 폭주!', desc: '5번째 공격: 불덩이 3연발 (각 60%)' }], desc: '35% 확률로 무작위 영웅에게 불덩이 · 5번째 공격마다 불덩이 3연발' },
  { id: 'boss_zombie', name: '야근 좀비 부장',   shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#27ae60', D: '#145a32' }, pattern: 'sweep', hp: 1.25, atk: 0.9, speed: 90, interval: 2.4, specials: [{ every: 3, kind: 'sweep', name: '야근 지시!', desc: '3번째 공격: 앞 두 명 휩쓸기 (90%)' }, { every: 6, kind: 'slow', name: '야근 강요!', desc: '6번째 공격: 4초간 파티 공격 속도 -30%' }], desc: '3번째 공격마다 앞 두 명 휩쓸기 · 6번째 공격은 파티를 4초간 느리게' },
  { id: 'boss_ogre',   name: '갑질 거래처 오우거', shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#e67e22', D: '#935116' }, pattern: 'stomp', hp: 1,    atk: 1.15, speed: 120, interval: 2.2, specials: [{ every: 4, kind: 'stomp', name: '갑질 발구르기!', desc: '4번째 공격: 전원 50%' }, { every: 6, kind: 'throw', name: '서류 투척!', desc: '6번째 공격: 맨 뒤 영웅에게 140%' }], desc: '4번째 공격은 전원 발구르기(50%) · 6번째 공격은 맨 뒤 영웅에게 서류 투척(140%)' },
  { id: 'boss_audit',    name: '감사 스캐너',       shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#16a085', D: '#0e6252' }, pattern: 'fire',  hp: 1.15, atk: 1.05, speed: 100, interval: 2.1, specials: [{ every: 3, kind: 'volley', name: '전수 감사!', desc: '3번째 공격: 불덩이 3연발 (각 60%)' }, { every: 7, kind: 'slow', name: '소명 요구!', desc: '7번째 공격: 4초간 파티 공격 속도 -30%' }], desc: '3번째 공격마다 전수 감사(불덩이 3연발) · 7번째 공격은 소명 요구로 파티를 느리게' },
  { id: 'boss_target',   name: '실적 대시보드',     shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#7f5539', D: '#4a2f1c' }, pattern: 'stomp', hp: 1.3,  atk: 1.1,  speed: 95,  interval: 2.5, specials: [{ every: 3, kind: 'stomp', name: '실적 압박!', desc: '3번째 공격: 전원 50%' }, { every: 5, kind: 'sweep', name: '목표 상향!', desc: '5번째 공격: 앞 두 명 휩쓸기 (90%)' }], desc: '3번째 공격마다 전원 발구르기 · 5번째 공격은 앞 두 명 휩쓸기' },
  { id: 'boss_approval', name: '결재 도장기',       shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#5d6d7e', D: '#2c3e50' }, pattern: 'sweep', hp: 1.5,  atk: 0.95, speed: 80,  interval: 2.8, specials: [{ every: 4, kind: 'throw', name: '반려!', desc: '4번째 공격: 맨 뒤 영웅에게 140%' }, { every: 6, kind: 'stomp', name: '재상신 요구!', desc: '6번째 공격: 전원 50%' }], desc: '느리지만 단단하다 · 4번째 공격은 맨 뒤로 서류 반려 · 6번째는 전원 재상신' },
  { id: 'boss_copier',   name: '대형 복합기',       shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#5dade2', D: '#2471a3' }, pattern: 'volley', hp: 1.2,  atk: 1.0,  speed: 105, interval: 2.0, specials: [{ every: 3, kind: 'volley', name: '전량 인쇄!', desc: '3번째 공격: 불덩이 3연발 (각 60%)' }, { every: 5, kind: 'sweep', name: '용지 걸림!', desc: '5번째 공격: 앞 두 명 휩쓸기 (90%)' }], desc: '3번째 공격마다 전량 인쇄(불덩이 3연발) · 5번째는 용지 걸림으로 앞 두 명 휩쓸기' },
  { id: 'boss_cabinet',  name: '문서 캐비닛',       shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#7f8c8d', D: '#4d5656' }, pattern: 'stomp',  hp: 1.6,  atk: 0.9,  speed: 75,  interval: 2.9, specials: [{ every: 4, kind: 'stomp', name: '서류 더미!', desc: '4번째 공격: 전원 50%' }, { every: 6, kind: 'throw', name: '캐비닛 투척!', desc: '6번째 공격: 맨 뒤 영웅에게 140%' }], desc: '가장 단단하고 가장 느리다 · 4번째는 서류 더미로 전원 · 6번째는 맨 뒤로 캐비닛 투척' },
  { id: 'boss_elevator', name: '임원용 엘리베이터',  shape: 'ticket', palette: { ...BOSS_PALETTE, M: '#af7ac5', D: '#6c3483' }, pattern: 'slow',   hp: 1.1,  atk: 1.2,  speed: 130, interval: 1.9, specials: [{ every: 3, kind: 'slow', name: '정원 초과!', desc: '3번째 공격: 4초간 파티 공격 속도 -30%' }, { every: 5, kind: 'stomp', name: '급강하!', desc: '5번째 공격: 전원 50%' }], desc: '가장 빠르다 · 3번째는 정원 초과로 파티를 느리게 · 5번째는 급강하로 전원 타격' },
];
/** Treasure chests join normal waves occasionally. The mimic looks the same until it bites. */
export const CHEST = { id: 'chest', name: '보물 상자', shape: 'cube', chest: true, palette: { M: '#b9770e', D: '#7e5109', E: '#f9e79f' } };
export const MIMIC = { id: 'mimic', name: '보물 상자?', shape: 'cube', chest: true, mimic: true, palette: { M: '#b9770e', D: '#7e5109', E: '#f9e79f' } };
export const bossForStage = (stage) => BOSSES[phaseOf(stage) % BOSSES.length];
export const BOSS = BOSSES[0];

export const phaseOf = (stage) => Math.floor((Math.max(1, stage) - 1) / 10);

/** The 3 monster variants that can appear on `stage` (same for the whole phase). */
export function stagePool(stage) {
  const phase = phaseOf(stage);
  const pal = PALETTES[phase % PALETTES.length];
  const start = (phase * 2) % MONSTER_TYPES.length;
  return [0, 1, 2].map((k) => {
    const t = MONSTER_TYPES[(start + k) % MONSTER_TYPES.length];
    // hue: the three types of a wave sit 120° apart so they read as different creatures at a glance; the phase adds a smaller shift
    // 색 이름은 팔레트가 실제로 보이는 몬스터에만. 아니면 색을 말하지 않는 변종 이름을 쓴다.
    const variant = showsPalette(t.id) ? pal.name : pal.alt;
    return { ...t, id: `${t.id}:${phase % PALETTES.length}`, name: `${variant} ${t.name}`, palette: { M: pal.M, D: pal.D, E: pal.E }, hue: ((phase % PALETTES.length) * 36 + k * 120) % 360 };
  });
}

/** A random monster variant for `stage`. */
export function monsterForStage(stage, r = Math.random()) {
  const pool = stagePool(stage);
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))];
}

export const eliteChance = (stage) => (stage < 5 ? 0 : Math.min(0.3, 0.02 * (stage - 4)));
/** Elite affixes: every elite rolls one, shown above its HP bar. */
export const AFFIXES = [
  { id: 'fast',     name: '신속',   desc: '이동·공격 속도 +50%',                 speed: 1.5, interval: 0.7 },
  { id: 'tough',    name: '단단한', desc: 'HP ×1.5',                              hp: 1.5 },
  { id: 'regen',    name: '재생',   desc: '초당 최대 HP 2% 회복',                 regen: 0.02 },
  { id: 'volatile', name: '폭발',   desc: '죽을 때 최전방 영웅에게 ATK ×3 피해',  explode: 3 },
  { id: 'shield',   name: '보호막', desc: '최대 HP 50%만큼의 보호막을 먼저 깎아야 함', shield: 0.5 },
];
export const asElite = (def, r = Math.random()) => { const affix = AFFIXES[Math.min(AFFIXES.length - 1, Math.floor(r * AFFIXES.length))]; return { ...def, elite: true, affix, name: `엘리트 ${affix.name} ${def.name}` }; };
