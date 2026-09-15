// Hero roster (D ~ S grade cards) + main hero job tree. Every card has its own look
// (hair / accessory / colours) and a passive trait.
export const GRADES = Object.freeze({
  D: { id: 'D', name: 'D', label: '일반',  rate: 0.45, promote: [10, 20, 40, 80],   color: '#7f8c8d', bg: '#ecf0f1', base: { atk: 6,  hp: 100 } },
  C: { id: 'C', name: 'C', label: '희귀',  rate: 0.30, promote: [15, 30, 60, 120],  color: '#27ae60', bg: '#e9f7ef', base: { atk: 8,  hp: 130 } },
  B: { id: 'B', name: 'B', label: '고급',  rate: 0.17, promote: [20, 40, 80, 160],  color: '#2b7cd3', bg: '#e8f1fb', base: { atk: 11, hp: 160 } },
  A: { id: 'A', name: 'A', label: '영웅',  rate: 0.07, promote: [25, 50, 100, 200], color: '#8e44ad', bg: '#f4ecf7', base: { atk: 15, hp: 200 } },
  S: { id: 'S', name: 'S', label: '전설',  rate: 0.01, promote: [30, 60, 120, 240], color: '#d4a017', bg: '#fdf6e3', base: { atk: 20, hp: 250 } },
});
export const GRADE_ORDER = ['D', 'C', 'B', 'A', 'S'];

// Roles: multipliers on grade base stats + combat behaviour. range in grid cells (64px).
export const ROLES = Object.freeze({
  tank:   { id: 'tank',   name: '탱커',   atk: 0.6, hp: 2.0, interval: 1.2, range: 1.1, slot: ['front', 'mid', 'back'] },
  melee:  { id: 'melee',  name: '근접',   atk: 1.0, hp: 1.0, interval: 1.0, range: 1.1, slot: ['mid', 'front', 'back'] },
  ranged: { id: 'ranged', name: '원거리', atk: 1.1, hp: 0.7, interval: 1.2, range: 7.0, slot: ['back', 'mid', 'front'] },
  healer: { id: 'healer', name: '힐러',   atk: 0.5, hp: 0.8, interval: 1.5, range: 7.0, slot: ['back', 'mid', 'front'] },
});

// Skills. power = multiplier of ATK (or % for buff/heal).
export const SKILLS = Object.freeze({
  strike: { name: '강타',       desc: '단일 대상 ×{p} 피해',            cooldown: 8 },
  sweep:  { name: '범위 정리',  desc: '모든 적에게 ×{p} 피해',           cooldown: 10 },
  buff:   { name: '팀 싱크',    desc: '5초간 파티 공격력 +{p}%',         cooldown: 15 },
  heal:   { name: '웰니스 데이', desc: '파티 전체 최대 HP의 {p}% 회복',   cooldown: 12 },
  ult:    { name: '경영 지시',  desc: '모든 적에게 ×{p} 피해 + 2초 기절', cooldown: 14 },
  burn:    { name: '긴급 패치',   desc: '모든 적에게 4초간 초당 ×{p} 화상 피해',          cooldown: 12, duration: 4 },
  barrier: { name: '조항의 방패', desc: '6초간 파티가 받는 피해를 ATK ×{p}만큼 흡수',      cooldown: 16, duration: 6 },
  haste:   { name: '스프린트',    desc: '5초간 파티 공격 속도 +{p}%',                     cooldown: 14, duration: 5 },
  execute: { name: '저격 보고',   desc: '단일 대상 ×{p} 피해 · 대상 HP 30% 미만이면 2배', cooldown: 9 },
});

// Passive traits (always active while the hero is in the party).
export const TRAITS = Object.freeze({
  crit:      { name: '날카로운 지적', desc: '15% 확률로 2배 피해',            value: 0.15 },
  swift:     { name: '빠른 손놀림',   desc: '자신의 공격 속도 +15%',          value: 0.15 },
  greedy:    { name: '영업 마인드',   desc: '파티 골드 획득 +8%',             value: 0.08 },
  sturdy:    { name: '철벽 멘탈',     desc: '받는 피해 -20%',                 value: 0.20 },
  lifesteal: { name: '커피 수혈',     desc: '가한 피해의 10% 만큼 회복',      value: 0.10 },
  focus:     { name: '보고서 특화',   desc: '보스에게 +30% 피해',             value: 0.30 },
  rally:     { name: '팀 리더십',     desc: '파티 전체 공격력 +4%',           value: 0.04 },
  lucky:     { name: '행운의 셀',     desc: '스테이지 클리어 보석 +1',        value: 1 },
  regen:     { name: '점심 시간',     desc: '초당 최대 HP 2% 추가 회복',      value: 0.02 },
  splash:    { name: '전체 회신',     desc: '기본 공격이 주변 적에게 30% 피해', value: 0.30 },
});

/** Gacha pool (main hero is NOT in the pool). */
export const HEROES = [
  // D (6) -------------------------------------------------------------------
  { id: 'staff_park', name: '박사원',        grade: 'D', role: 'melee',  trait: 'swift',     skill: { type: 'strike', power: 3 },   look: { hair: 'short', acc: 'tie' , prop: 'files' },             palette: { H: '#3b2a1a', B: '#dfe6e9', P: '#2f3d5c', W: '#9aa5b1' } },
  { id: 'parttime',   name: '알바 이씨',     grade: 'D', role: 'ranged', trait: 'greedy',    skill: { type: 'strike', power: 3 },   look: { hair: 'bob', acc: 'headset' , prop: 'apron' },           palette: { H: '#6b3e1e', B: '#f8c291', P: '#3b3b3b', W: '#4b6584' } },
  { id: 'guard',      name: '경비 아저씨',   grade: 'D', role: 'tank',   trait: 'sturdy',    skill: { type: 'buff',   power: 20 },  look: { hair: 'grey', acc: 'mustache', acc2: 'hardhat' , prop: 'radio' }, palette: { H: '#9e9e9e', B: '#1f2a44', P: '#1f2a44', W: '#8395a7' } },
  { id: 'barista',    name: '카페 바리스타', grade: 'D', role: 'healer', trait: 'regen',     skill: { type: 'heal',   power: 25 },  look: { hair: 'bun', acc: 'coffee', acc2: 'badge' , prop: 'apron' }, palette: { H: '#c97b4a', B: '#6d4c41', P: '#3e2723', W: '#ffcc80' } },
  { id: 'courier',    name: '택배 기사',     grade: 'D', role: 'melee',  trait: 'crit',      skill: { type: 'strike', power: 3 },   look: { hair: 'cap', acc: 'badge' , prop: 'parcel' },             palette: { H: '#2b2b2b', B: '#f39c12', P: '#34495e', W: '#95a5a6' } },
  { id: 'contract',   name: '계약직 최',     grade: 'D', role: 'ranged', trait: 'lucky',     skill: { type: 'sweep',  power: 1.2 }, look: { hair: 'side', acc: 'lanyard' , prop: 'phone' },          palette: { H: '#7f8c8d', B: '#95a5a6', P: '#2c3e50', W: '#bdc3c7' } },
  // C (5) -------------------------------------------------------------------
  { id: 'vlookup',    name: 'VLOOKUP 분석가', grade: 'C', role: 'ranged', trait: 'crit',     skill: { type: 'sweep',  power: 1.5 }, look: { hair: 'short', acc: 'glasses' , prop: 'pen' },         palette: { H: '#1b3a6b', B: '#55efc4', P: '#1b3a6b', W: '#00b894' } },
  { id: 'pivot',      name: '피벗 매니저',    grade: 'C', role: 'tank',   trait: 'rally',    skill: { type: 'buff',   power: 25 },  look: { hair: 'bald', acc: 'beard', acc2: 'tie' , prop: 'suspenders' }, palette: { H: '#4a3b2a', B: '#00b894', P: '#0b6b4b', W: '#a3ffd6' } },
  { id: 'macro',      name: '매크로 엔지니어', grade: 'C', role: 'melee', trait: 'splash',   skill: { type: 'burn',    power: 0.7, name: '매크로 폭주' }, look: { hair: 'spiky', acc: 'headset' , prop: 'hoodie' },         palette: { H: '#1a1a1a', B: '#1abc9c', P: '#2d3436', W: '#00cec9' } },
  { id: 'hr_jung',    name: '인사팀 정대리',  grade: 'C', role: 'healer', trait: 'regen',    skill: { type: 'heal',   power: 30 },  look: { hair: 'long', acc: 'clipboard', acc2: 'earring' }, palette: { H: '#5c2e0a', B: '#7bed9f', P: '#2d3436', W: '#ff7675' } },
  { id: 'audit_han',  name: '감사팀 한대리',  grade: 'C', role: 'melee',  trait: 'focus',    skill: { type: 'execute', power: 4, name: '저격 보고' },   look: { hair: 'side', acc: 'sunglasses', acc2: 'tie' , prop: 'magnifier' }, palette: { H: '#3d3d3d', B: '#2ecc71', P: '#192a56', W: '#dcdde1' } },
  // B (4) -------------------------------------------------------------------
  { id: 'acct_lead',  name: '회계팀장',      grade: 'B', role: 'ranged', trait: 'greedy',    skill: { type: 'sweep',  power: 1.8 }, look: { hair: 'bun', acc: 'glasses', acc2: 'badge' , prop: 'calculator' }, palette: { H: '#2d3436', B: '#74b9ff', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'dev_lead',   name: '개발팀장',      grade: 'B', role: 'melee',  trait: 'swift',     skill: { type: 'burn',    power: 0.9, name: '핫픽스 배포' }, look: { hair: 'curly', acc: 'headset', acc2: 'coffee' , prop: 'hoodie' }, palette: { H: '#1e272e', B: '#0984e3', P: '#2d3436', W: '#00cec9' } },
  { id: 'ga_lead',    name: '총무팀장',      grade: 'B', role: 'tank',   trait: 'sturdy',    skill: { type: 'barrier', power: 7, name: '비품 창고 성벽' },  look: { hair: 'grey', acc: 'beard', acc2: 'lanyard' , prop: 'files' }, palette: { H: '#b2bec3', B: '#2b7cd3', P: '#1b3a6b', W: '#dfe6e9' } },
  { id: 'welfare',    name: '복지팀장',      grade: 'B', role: 'healer', trait: 'lifesteal', skill: { type: 'heal',   power: 35 },  look: { hair: 'bob', acc: 'flower', acc2: 'scarf' }, palette: { H: '#b33939', B: '#a3c4ff', P: '#2f3640', W: '#ff9ff3' } },
  // A (3) -------------------------------------------------------------------
  { id: 'cfo',        name: 'CFO',           grade: 'A', role: 'ranged', trait: 'greedy',    skill: { type: 'sweep',  power: 2 },   look: { hair: 'grey', acc: 'glasses', acc2: 'tie' , prop: 'ledger' }, palette: { H: '#ececec', B: '#6c5ce7', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'cto',        name: 'CTO',           grade: 'A', role: 'melee',  trait: 'crit',      skill: { type: 'execute', power: 5, name: '리팩토링' },   look: { hair: 'spiky', acc: 'sunglasses', acc2: 'coffee' , prop: 'watch' }, palette: { H: '#2d3436', B: '#a29bfe', P: '#2d3436', W: '#00b894' } },
  { id: 'coo',        name: 'COO',           grade: 'A', role: 'tank',   trait: 'rally',     skill: { type: 'buff',   power: 35 },  look: { hair: 'short', acc: 'beard', acc2: 'badge' , prop: 'briefcase' }, palette: { H: '#636e72', B: '#8e44ad', P: '#2c2c54', W: '#dfe6e9' } },
  // S (2) -------------------------------------------------------------------
  { id: 'ceo',        name: '대표이사',      grade: 'S', role: 'ranged', trait: 'focus',     skill: { type: 'ult', power: 4 },      look: { hair: 'side', acc: 'sunglasses', acc2: 'tie' , prop: 'briefcase' }, palette: { H: '#f5f6fa', B: '#d4a017', P: '#2f3640', W: '#fbc531' } },
  { id: 'chairman',   name: '회장님',        grade: 'S', role: 'tank',   trait: 'rally',     skill: { type: 'ult', power: 3 },      look: { hair: 'bald', acc: 'crown', acc2: 'beard' , prop: 'cane' }, palette: { H: '#dcdde1', B: '#e1b12c', P: '#353b48', W: '#f5f6fa' } },
  // 16차 추가 (8) ---------------------------------------------------------------
  { id: 'helpdesk',   name: 'IT 헬프데스크', grade: 'D', role: 'ranged', trait: 'swift',     skill: { type: 'haste',   power: 20, name: '재부팅' },   look: { hair: 'short', acc: 'headset', prop: 'laptop' },          palette: { H: '#2d3436', B: '#74b9ff', P: '#2d3436', W: '#dfe6e9' } },
  { id: 'cleaner',    name: '미화 여사님',   grade: 'D', role: 'healer', trait: 'lucky',     skill: { type: 'heal',   power: 22 },  look: { hair: 'bun', acc: 'badge', prop: 'mop' },                 palette: { H: '#636e72', B: '#fab1a0', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'sales_kang', name: '영업팀 강과장', grade: 'C', role: 'melee',  trait: 'greedy',    skill: { type: 'strike', power: 4 },   look: { hair: 'side', acc: 'tie', prop: 'briefcase' },            palette: { H: '#1e272e', B: '#e17055', P: '#2d3436', W: '#fdcb6e' } },
  { id: 'legal_yoon', name: '법무팀 윤대리', grade: 'C', role: 'tank',   trait: 'focus',     skill: { type: 'barrier', power: 8, name: '조항의 방패' },  look: { hair: 'long', acc: 'glasses', prop: 'files' },            palette: { H: '#2c2c54', B: '#a29bfe', P: '#2d3436', W: '#dfe6e9' } },
  { id: 'pm_lead',    name: '기획팀장',      grade: 'B', role: 'ranged', trait: 'rally',     skill: { type: 'sweep',  power: 1.8 }, look: { hair: 'bob', acc: 'lanyard', prop: 'pen' },               palette: { H: '#6c5ce7', B: '#55efc4', P: '#2d3436', W: '#00cec9' } },
  { id: 'design_lead', name: '디자인팀장',   grade: 'B', role: 'healer', trait: 'swift',     skill: { type: 'heal',   power: 32 },  look: { hair: 'curly', acc: 'earring', prop: 'tablet' },          palette: { H: '#e84393', B: '#fd79a8', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'cmo',        name: 'CMO',           grade: 'A', role: 'ranged', trait: 'lucky',     skill: { type: 'sweep',  power: 2.2 }, look: { hair: 'long', acc: 'sunglasses', prop: 'phone' },         palette: { H: '#d63031', B: '#ff7675', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'founder',    name: '창업자',        grade: 'S', role: 'melee',  trait: 'crit',      skill: { type: 'ult', power: 3.5 },    look: { hair: 'spiky', acc: 'glasses', prop: 'hoodie' },          palette: { H: '#2d3436', B: '#00b894', P: '#2d3436', W: '#f5f6fa' } },
  // 22차 추가 (6, 여성 5) ---------------------------------------------------------
  { id: 'intern_seo', name: '인턴 서연',     grade: 'D', role: 'ranged', trait: 'lucky',     skill: { type: 'strike', power: 3 },   look: { hair: 'long', acc: 'lanyard', prop: 'tablet' },           palette: { H: '#4a2c2a', B: '#ffeaa7', P: '#2d3436', W: '#fd79a8' } },
  { id: 'pr_yoo',     name: '홍보팀 유주임', grade: 'C', role: 'melee',  trait: 'swift',     skill: { type: 'haste',   power: 30, name: '보도자료 스프린트' }, look: { hair: 'bob', acc: 'earring', prop: 'phone' },             palette: { H: '#e17055', B: '#ffffff', P: '#2d3436', W: '#e84393' } },
  { id: 'nurse_han',  name: '사내 간호사',   grade: 'C', role: 'healer', trait: 'regen',     skill: { type: 'heal',   power: 28 },  look: { hair: 'bun', acc: 'badge', prop: 'clipboard' },           palette: { H: '#6c5ce7', B: '#dfe6e9', P: '#2d3436', W: '#00cec9' } },
  { id: 'lab_park',   name: '연구소 박박사', grade: 'B', role: 'ranged', trait: 'crit',      skill: { type: 'burn',    power: 1.0, name: '가설 검증' }, look: { hair: 'long', acc: 'glasses', prop: 'laptop' },            palette: { H: '#b2bec3', B: '#f5f6fa', P: '#2d3436', W: '#0984e3' } },
  { id: 'chro',       name: 'CHRO',          grade: 'A', role: 'healer', trait: 'rally',     skill: { type: 'heal',   power: 40 },  look: { hair: 'side', acc: 'earring', acc2: 'badge', prop: 'files' }, palette: { H: '#2d3436', B: '#e84393', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'chairwoman', name: '이사장',        grade: 'S', role: 'tank',   trait: 'sturdy',    skill: { type: 'ult', power: 3.2 },    look: { hair: 'long', acc: 'crown', acc2: 'earring', prop: 'cane' }, palette: { H: '#f5f6fa', B: '#2d3436', P: '#2d3436', W: '#d4a017' } },
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));
export const heroesOfGrade = (grade) => HEROES.filter((h) => h.grade === grade);

// --- Main hero -------------------------------------------------------------
export const MAIN_ID = 'main';
const MAIN_PAL = { H: '#2b2b2b', P: '#2f3d5c' };
/** Job tree: 인턴(D) → 사원(C) → 대리(B) → 과장(A) → 부장 3종(S, branch). */
export const MAIN_JOBS = Object.freeze({
  intern:  { id: 'intern',  tier: 0, grade: 'D', name: '김인턴', title: '인턴',     role: 'melee',  trait: 'swift',     skill: { type: 'strike', power: 3 },   next: ['staff'],   look: { hair: 'short', acc: 'lanyard' , prop: 'files' },          palette: { ...MAIN_PAL, B: '#ffffff', W: '#9aa5b1' } },
  staff:   { id: 'staff',   tier: 1, grade: 'C', name: '김사원', title: '사원',     role: 'melee',  trait: 'swift',     skill: { type: 'strike', power: 3.5 }, next: ['senior'],  look: { hair: 'short', acc: 'tie' , prop: 'phone' },              palette: { ...MAIN_PAL, B: '#dff9fb', W: '#95afc0' } },
  senior:  { id: 'senior',  tier: 2, grade: 'B', name: '김대리', title: '대리',     role: 'melee',  trait: 'crit',      skill: { type: 'strike', power: 4 },   next: ['manager'], look: { hair: 'side', acc: 'tie', acc2: 'coffee' }, palette: { ...MAIN_PAL, B: '#c7ecee', W: '#7ed6df' } },
  manager: { id: 'manager', tier: 3, grade: 'A', name: '김과장', title: '과장',     role: 'melee',  trait: 'rally',     skill: { type: 'strike', power: 5 },   next: ['sales', 'finance', 'admin'], look: { hair: 'side', acc: 'glasses', acc2: 'tie' , prop: 'briefcase' }, palette: { ...MAIN_PAL, B: '#535c68', W: '#f9ca24' } },
  sales:   { id: 'sales',   tier: 4, grade: 'S', name: '김부장', title: '영업부장', role: 'melee',  trait: 'crit',      skill: { type: 'strike', power: 6.5 }, next: [], look: { hair: 'spiky', acc: 'sunglasses', acc2: 'tie' , prop: 'briefcase' }, palette: { ...MAIN_PAL, B: '#eb4d4b', W: '#f9ca24' }, desc: '단일 딜 특화. 보스전에 강함' },
  finance: { id: 'finance', tier: 4, grade: 'S', name: '김부장', title: '재무부장', role: 'ranged', trait: 'greedy',    skill: { type: 'sweep',  power: 2.5 }, next: [], look: { hair: 'side', acc: 'glasses', acc2: 'badge' , prop: 'calculator' }, palette: { ...MAIN_PAL, B: '#22a6b3', W: '#f9ca24' }, desc: '원거리 광역 딜. 사냥 속도 특화' },
  admin:   { id: 'admin',   tier: 4, grade: 'S', name: '김부장', title: '총무부장', role: 'tank',   trait: 'sturdy',    skill: { type: 'ult',    power: 3 },   next: [], look: { hair: 'grey', acc: 'beard', acc2: 'hardhat' , prop: 'radio' }, palette: { ...MAIN_PAL, B: '#f0932b', W: '#f9ca24' }, desc: '탱커 + 전체 기절. 생존 특화' },
});
export const MAIN_TIER_TITLES = ['인턴', '사원', '대리', '과장', '부장'];

export function heroBaseStats(def) {
  const g = GRADES[def.grade], r = ROLES[def.role];
  return { atk: g.base.atk * r.atk, hp: g.base.hp * r.hp, interval: r.interval, range: r.range };
}
