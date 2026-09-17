// Hero roster (D ~ S grade cards) + main hero job tree. Every card has its own look
// (hair / accessory / colours) and a passive trait.
export const GRADES = Object.freeze({
  D: { id: 'D', name: 'D', label: '일반',  rate: 0.485, promote: [10, 20, 40, 80],   color: '#7f8c8d', bg: '#ecf0f1', base: { atk: 6,  hp: 100 } },
  C: { id: 'C', name: 'C', label: '희귀',  rate: 0.30, promote: [15, 30, 60, 120],  color: '#27ae60', bg: '#e9f7ef', base: { atk: 8,  hp: 130 } },
  B: { id: 'B', name: 'B', label: '고급',  rate: 0.16, promote: [20, 40, 80, 160],  color: '#2b7cd3', bg: '#e8f1fb', base: { atk: 11, hp: 160 } },
  A: { id: 'A', name: 'A', label: '영웅',  rate: 0.05, promote: [25, 50, 100, 200], color: '#8e44ad', bg: '#f4ecf7', base: { atk: 15, hp: 200 } },
  S: { id: 'S', name: 'S', label: '전설',  rate: 0.005, promote: [30, 60, 120, 240], color: '#d4a017', bg: '#fdf6e3', base: { atk: 20, hp: 250 } },
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
  cleanse: { name: '스트레스 해소', desc: '파티 {p}% 회복 · 둔화 해제 · 3초간 공격 속도 +20%', cooldown: 14, duration: 3 },
  revive:  { name: '인사 복구',     desc: '쓰러진 동료 1명을 HP {p}%로 즉시 복귀 · 없으면 가장 약한 동료를 {p}% 회복', cooldown: 20 },
  drain:   { name: '성과 회수',     desc: '모든 적에게 ×{p} 피해 · 입힌 피해의 40%만큼 파티 회복', cooldown: 13 },
  chain:   { name: '참조 연쇄',     desc: '적 3명에게 차례로 ×{p} 피해 (연쇄마다 70%)', cooldown: 10 },
  taunt:   { name: '총대 메기',     desc: '5초간 모든 적의 공격을 자신이 받고 받는 피해 {p}% 감소', cooldown: 16, duration: 5 },
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
  { id: 'guard',      name: '경비 아저씨',   grade: 'D', role: 'tank',   trait: 'sturdy',    skill: { type: 'taunt',  power: 35, name: '출입 통제' },  look: { hair: 'grey', acc: 'mustache', acc2: 'hardhat' , prop: 'radio' }, palette: { H: '#9e9e9e', B: '#1f2a44', P: '#1f2a44', W: '#8395a7' } },
  { id: 'barista',    name: '카페 바리스타', grade: 'D', role: 'healer', trait: 'regen',     skill: { type: 'heal',   power: 25 },  look: { hair: 'bun', acc: 'coffee', acc2: 'badge' , prop: 'apron' }, palette: { H: '#c97b4a', B: '#6d4c41', P: '#3e2723', W: '#ffcc80' } },
  { id: 'courier',    name: '택배 기사',     grade: 'D', role: 'melee',  trait: 'crit',      skill: { type: 'strike', power: 3 },   look: { hair: 'cap', acc: 'badge' , prop: 'parcel' },             palette: { H: '#2b2b2b', B: '#f39c12', P: '#34495e', W: '#95a5a6' } },
  { id: 'contract',   name: '계약직 최',     grade: 'D', role: 'ranged', trait: 'lucky',     skill: { type: 'sweep',  power: 1.2 }, look: { hair: 'side', acc: 'lanyard' , prop: 'phone' },          palette: { H: '#7f8c8d', B: '#95a5a6', P: '#2c3e50', W: '#bdc3c7' } },
  // C (5) -------------------------------------------------------------------
  { id: 'vlookup',    name: 'VLOOKUP 분석가', grade: 'C', role: 'ranged', trait: 'crit',     skill: { type: 'chain',  power: 2.2, name: '참조 추적' }, look: { hair: 'short', acc: 'glasses' , prop: 'pen' },         palette: { H: '#1b3a6b', B: '#55efc4', P: '#1b3a6b', W: '#00b894' } },
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
  { id: 'cleaner',    name: '미화 여사님',   grade: 'D', role: 'healer', trait: 'lucky',     skill: { type: 'cleanse', power: 14, name: '싹 치우기' },  look: { hair: 'bun', acc: 'badge', prop: 'mop' },                 palette: { H: '#636e72', B: '#fab1a0', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'sales_kang', name: '영업팀 강과장', grade: 'C', role: 'melee',  trait: 'greedy',    skill: { type: 'strike', power: 4 },   look: { hair: 'side', acc: 'tie', prop: 'briefcase' },            palette: { H: '#1e272e', B: '#e17055', P: '#2d3436', W: '#fdcb6e' } },
  { id: 'legal_yoon', name: '법무팀 윤대리', grade: 'C', role: 'tank',   trait: 'focus',     skill: { type: 'barrier', power: 8, name: '조항의 방패' },  look: { hair: 'long', acc: 'glasses', prop: 'files' },            palette: { H: '#2c2c54', B: '#a29bfe', P: '#2d3436', W: '#dfe6e9' } },
  { id: 'pm_lead',    name: '기획팀장',      grade: 'B', role: 'ranged', trait: 'rally',     skill: { type: 'sweep',  power: 1.8 }, look: { hair: 'bob', acc: 'lanyard', prop: 'pen' },               palette: { H: '#6c5ce7', B: '#55efc4', P: '#2d3436', W: '#00cec9' } },
  { id: 'design_lead', name: '디자인팀장',   grade: 'B', role: 'healer', trait: 'swift',     skill: { type: 'haste',  power: 26, name: 'UI 리디자인' },  look: { hair: 'curly', acc: 'earring', prop: 'tablet' },          palette: { H: '#e84393', B: '#fd79a8', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'cmo',        name: 'CMO',           grade: 'A', role: 'ranged', trait: 'lucky',     skill: { type: 'sweep',  power: 2.2 }, look: { hair: 'long', acc: 'sunglasses', prop: 'phone' },         palette: { H: '#d63031', B: '#ff7675', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'founder',    name: '창업자',        grade: 'S', role: 'melee',  trait: 'crit',      skill: { type: 'ult', power: 3.5 },    look: { hair: 'spiky', acc: 'glasses', prop: 'hoodie' },          palette: { H: '#2d3436', B: '#00b894', P: '#2d3436', W: '#f5f6fa' } },
  // 22차 추가 (6, 여성 5) ---------------------------------------------------------
  { id: 'intern_seo', name: '인턴 서연',     grade: 'D', role: 'ranged', trait: 'lucky',     skill: { type: 'strike', power: 3 },   look: { hair: 'long', acc: 'lanyard', prop: 'tablet' },           palette: { H: '#4a2c2a', B: '#ffeaa7', P: '#2d3436', W: '#fd79a8' } },
  { id: 'pr_yoo',     name: '홍보팀 유주임', grade: 'C', role: 'melee',  trait: 'swift',     skill: { type: 'haste',   power: 30, name: '보도자료 스프린트' }, look: { hair: 'bob', acc: 'earring', prop: 'phone' },             palette: { H: '#e17055', B: '#ffffff', P: '#2d3436', W: '#e84393' } },
  { id: 'nurse_han',  name: '사내 간호사',   grade: 'C', role: 'healer', trait: 'regen',     skill: { type: 'heal',   power: 28 },  look: { hair: 'bun', acc: 'badge', prop: 'clipboard' },           palette: { H: '#6c5ce7', B: '#dfe6e9', P: '#2d3436', W: '#00cec9' } },
  { id: 'lab_park',   name: '연구소 박박사', grade: 'B', role: 'ranged', trait: 'crit',      skill: { type: 'burn',    power: 1.0, name: '가설 검증' }, look: { hair: 'long', acc: 'glasses', prop: 'laptop' },            palette: { H: '#b2bec3', B: '#f5f6fa', P: '#2d3436', W: '#0984e3' } },
  { id: 'chro',       name: 'CHRO',          grade: 'A', role: 'healer', trait: 'rally',     skill: { type: 'revive', power: 55, name: '인사 복구' },  look: { hair: 'side', acc: 'earring', acc2: 'badge', prop: 'files' }, palette: { H: '#2d3436', B: '#e84393', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'cso',        name: '전략실장 서하늘', grade: 'S', role: 'ranged', trait: 'rally',   skill: { type: 'ult',     power: 3.6, name: '전략 브리핑' }, look: { hair: 'long', acc: 'earring', prop: 'tablet' },        palette: { H: '#c8b6ff', B: '#f5f6fa', P: '#2f3640', W: '#8c7ae6' } },
  { id: 'ai_lead',    name: 'AI연구소장 루나', grade: 'S', role: 'healer', trait: 'regen',   skill: { type: 'cleanse', power: 32,  name: '시스템 복구' },   look: { hair: 'long', acc: 'glasses', prop: 'laptop' },         palette: { H: '#9ff3e6', B: '#ffffff', P: '#1e272e', W: '#00cec9' } },
  { id: 'union_chief', name: '노조위원장 강철', grade: 'S', role: 'tank',  trait: 'sturdy',  skill: { type: 'barrier', power: 14,  name: '단체 협약' },     look: { hair: 'spiky', acc: 'headband', prop: 'megaphone' },   palette: { H: '#1e272e', B: '#c23616', P: '#2f3640', W: '#f5f6fa' } },
  { id: 'hacker',     name: '화이트해커 제로', grade: 'S', role: 'melee',  trait: 'crit',    skill: { type: 'execute', power: 6,   name: '제로데이' },       look: { hair: 'bob', acc: 'headset', prop: 'laptop' },          palette: { H: '#1e272e', B: '#2d3436', P: '#1e272e', W: '#00d2ff' } },
  // --- 2026-09-16 roster expansion (12) -------------------------------------
  { id: 'intern_min',    name: '인턴 민지',       grade: 'D', role: 'healer', trait: 'lucky',     skill: { type: 'heal',    power: 22,  name: '응원 메시지' },  look: { hair: 'twin', acc: 'ribbon', prop: 'notebook' },     palette: { H: '#c98a7a', B: '#f7d6e0', P: '#3b3b4f', W: '#ffffff' } },
  { id: 'security_yang', name: '보안팀 양사원',   grade: 'D', role: 'tank',   trait: 'sturdy',    skill: { type: 'barrier', power: 5,   name: '출입 통제' },    look: { hair: 'ponytail', acc: 'badge', prop: 'radio' },      palette: { H: '#1f1f2a', B: '#1f2a44', P: '#1f2a44', W: '#8fb8e8' } },
  { id: 'mail_cho',      name: '사내 우편 조사원', grade: 'D', role: 'melee',  trait: 'swift',     skill: { type: 'haste',   power: 15,  name: '급송' },         look: { hair: 'short', acc: 'cap', prop: 'bag' },            palette: { H: '#6b4a2f', B: '#3f8fd6', P: '#2c3345', W: '#f5f6fa' } },
  { id: 'qa_lee',        name: 'QA 이주연',       grade: 'C', role: 'ranged', trait: 'crit',      skill: { type: 'execute', power: 3.5, name: '버그 리포트' },  look: { hair: 'bob', acc: 'glasses', prop: 'laptop' },        palette: { H: '#1f2f5f', B: '#4a4e69', P: '#22223b', W: '#9ae6b4' } },
  { id: 'reception_go',  name: '안내데스크 고은', grade: 'C', role: 'healer', trait: 'regen',     skill: { type: 'buff',    power: 24,  name: '안내 방송' },    look: { hair: 'long', acc: 'headset', prop: 'mic' },          palette: { H: '#7a4a2f', B: '#ffb7a1', P: '#3b3b3b', W: '#ffffff' } },
  { id: 'trainer_seok',  name: '사내 강사 석훈',  grade: 'C', role: 'tank',   trait: 'rally',     skill: { type: 'taunt',   power: 45,  name: '아침 조회' },    look: { hair: 'short', acc: 'whistle', prop: 'clipboard' },   palette: { H: '#2b2b2b', B: '#e67e22', P: '#2c3e50', W: '#ffffff' } },
  { id: 'translator_ji', name: '번역팀장 지아',   grade: 'B', role: 'ranged', trait: 'focus',     skill: { type: 'sweep',   power: 1.8, name: '다국어 폭풍' },  look: { hair: 'long', acc: 'earring', prop: 'book' },         palette: { H: '#a9c9e8', B: '#d8c3a5', P: '#2f3640', W: '#ffffff' } },
  { id: 'secretary_yun', name: '비서실장 윤서',   grade: 'B', role: 'healer', trait: 'rally',     skill: { type: 'buff',    power: 28,  name: '일정 조정' },    look: { hair: 'bun', acc: 'earring', prop: 'planner' },       palette: { H: '#151515', B: '#2f3640', P: '#151515', W: '#d4a017' } },
  { id: 'logistics_bae', name: '물류팀장 배철',   grade: 'B', role: 'tank',   trait: 'sturdy',    skill: { type: 'barrier', power: 9,   name: '팔레트 벽' },    look: { hair: 'short', acc: 'gloves', prop: 'boxes' },        palette: { H: '#3b2a1a', B: '#7f8c8d', P: '#2f3640', W: '#f39c12' } },
  { id: 'cro',           name: 'CRO 위기관리',    grade: 'A', role: 'tank',   trait: 'sturdy',    skill: { type: 'taunt',   power: 55,  name: '리스크 인수' },  look: { hair: 'bun', acc: 'glasses', acc2: 'badge' },          palette: { H: '#2b2b3a', B: '#37474f', P: '#263238', W: '#ffd54f' } },
  { id: 'cpo',           name: 'CPO 제품총괄',    grade: 'A', role: 'ranged', trait: 'focus',     skill: { type: 'chain',   power: 2.8, name: '로드맵 연쇄' },  look: { hair: 'short', acc: 'headset', prop: 'tablet' },       palette: { H: '#3d2b1f', B: '#00897b', P: '#00695c', W: '#b2dfdb' } },
  { id: 'ir_lead',       name: 'IR 담당임원',     grade: 'A', role: 'ranged', trait: 'greedy',    skill: { type: 'drain',   power: 1.8, name: '자금 회수' },    look: { hair: 'side', acc: 'tie', prop: 'ledger' },            palette: { H: '#1a1a1a', B: '#4a148c', P: '#311b92', W: '#e1bee7' } },
  { id: 'labor_atty',    name: '노무사 서린',      grade: 'A', role: 'healer', trait: 'lifesteal', skill: { type: 'revive',  power: 60,  name: '부당해고 취소' }, look: { hair: 'long', acc: 'glasses', prop: 'files' },        palette: { H: '#4e342e', B: '#eceff1', P: '#90a4ae', W: '#ff8a65' } },
  { id: 'bd_lead',       name: '사업개발실장',     grade: 'A', role: 'melee',  trait: 'splash',    skill: { type: 'sweep',   power: 2.6, name: '동시 다발 제안' }, look: { hair: 'spiky', acc: 'watch', prop: 'briefcase' },    palette: { H: '#212121', B: '#ef6c00', P: '#e65100', W: '#ffe0b2' } },
  { id: 'cdo',           name: 'CDO 하린',        grade: 'A', role: 'ranged', trait: 'crit',      skill: { type: 'drain',   power: 1.5, name: '데이터 폭주' },  look: { hair: 'long', acc: 'earring', prop: 'tablet' },       palette: { H: '#151515', B: '#1e272e', P: '#1e272e', W: '#00d2ff' } },
  { id: 'cco',           name: 'CCO 미소',        grade: 'A', role: 'healer', trait: 'lifesteal', skill: { type: 'heal',    power: 40,  name: '고객 감동' },    look: { hair: 'bob', acc: 'earring', prop: 'phone' },         palette: { H: '#f4a9c8', B: '#ff8a80', P: '#2f3640', W: '#ffffff' } },
  { id: 'chief_of_staff', name: '비서실 총괄 유하', grade: 'S', role: 'melee', trait: 'swift',     skill: { type: 'haste',   power: 45,  name: '초고속 결재' },  look: { hair: 'ponytail', acc: 'earring', prop: 'stamp' },   palette: { H: '#f3e6b8', B: '#f5f6fa', P: '#f5f6fa', W: '#d4a017' } },
  { id: 'chairwoman', name: '이사장',        grade: 'S', role: 'tank',   trait: 'sturdy',    skill: { type: 'ult', power: 3.2 },    look: { hair: 'long', acc: 'crown', acc2: 'earring', prop: 'cane' }, palette: { H: '#f5f6fa', B: '#2d3436', P: '#2d3436', W: '#d4a017' } },
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));
export const heroesOfGrade = (grade) => HEROES.filter((h) => h.grade === grade);

// --- Main hero -------------------------------------------------------------
export const MAIN_ID = 'main';
const MAIN_PAL = { H: '#2b2b2b', P: '#2f3d5c' };
/** Job tree: 인턴(D) → 사원(C) → 트랙 선택 → 대리(B) → 과장(A) → 부장(S). 세 트랙은 사원 직후 갈라지며 되돌릴 수 없다.
 *  영업 트랙 = 근접 단일 딜(치명·팀 리더십), 재무 트랙 = 원거리 광역(영업 마인드·보고서 특화), 총무 트랙 = 탱커(철벽·방패·전체 기절).
 *  주인공은 어느 트랙에서도 같은 인물(젊은 남성, 검은 단발)이며 직급이 오를수록 복장만 격이 오른다. */
export const MAIN_JOBS = Object.freeze({
  intern:  { id: 'intern',  tier: 0, grade: 'D', name: '김인턴', title: '인턴',     track: null,      role: 'melee',  trait: 'swift',  skill: { type: 'strike', power: 3 },   next: ['staff'], look: { hair: 'short', acc: 'lanyard', prop: 'files' }, palette: { ...MAIN_PAL, B: '#ffffff', W: '#9aa5b1' } },
  staff:   { id: 'staff',   tier: 1, grade: 'C', name: '김사원', title: '사원',     track: null,      role: 'melee',  trait: 'swift',  skill: { type: 'strike', power: 3.5 }, next: ['sales_senior', 'finance_senior', 'admin_senior'], look: { hair: 'short', acc: 'tie', prop: 'phone' }, palette: { ...MAIN_PAL, B: '#dff9fb', W: '#95afc0' } },
  // 영업 트랙 — 근접 단일 딜. 보스전에 강함
  sales_senior:   { id: 'sales_senior',   tier: 2, grade: 'B', name: '김대리', title: '영업대리', track: 'sales',   role: 'melee', trait: 'crit',  skill: { type: 'strike', power: 4 },   next: ['sales_manager'], look: { hair: 'short', acc: 'tie', prop: 'phone' },                 palette: { ...MAIN_PAL, B: '#f5b7b1', W: '#c0392b' }, desc: '영업 트랙 · 근접 단일 딜 · 치명타' },
  sales_manager:  { id: 'sales_manager',  tier: 3, grade: 'A', name: '김과장', title: '영업과장', track: 'sales',   role: 'melee', trait: 'rally', skill: { type: 'strike', power: 5 },   next: ['sales'],         look: { hair: 'short', acc: 'tie', prop: 'briefcase' },             palette: { ...MAIN_PAL, B: '#c0392b', W: '#f9ca24' }, desc: '영업 트랙 · 강타 ×5 · 팀 리더십' },
  sales:          { id: 'sales',          tier: 4, grade: 'S', name: '김부장', title: '영업부장', track: 'sales',   role: 'melee', trait: 'crit',  skill: { type: 'strike', power: 6.5 }, next: [],                look: { hair: 'spiky', acc: 'sunglasses', acc2: 'tie', prop: 'briefcase' }, palette: { ...MAIN_PAL, B: '#eb4d4b', W: '#f9ca24' }, desc: '영업 트랙 완성 · 단일 딜 특화. 보스전에 강함' },
  // 재무 트랙 — 원거리 광역. 사냥 속도·골드
  finance_senior: { id: 'finance_senior', tier: 2, grade: 'B', name: '김대리', title: '재무대리', track: 'finance', role: 'ranged', trait: 'greedy', skill: { type: 'sweep', power: 1.6 }, next: ['finance_manager'], look: { hair: 'short', acc: 'glasses', prop: 'calculator' },     palette: { ...MAIN_PAL, B: '#a3e4d7', W: '#16a085' }, desc: '재무 트랙 · 원거리 광역 · 골드 +8%' },
  finance_manager:{ id: 'finance_manager',tier: 3, grade: 'A', name: '김과장', title: '재무과장', track: 'finance', role: 'ranged', trait: 'focus',  skill: { type: 'sweep', power: 2 },   next: ['finance'],         look: { hair: 'short', acc: 'glasses', prop: 'tablet' },          palette: { ...MAIN_PAL, B: '#1abc9c', W: '#f9ca24' }, desc: '재무 트랙 · 광역 ×2 · 보스 피해 +30%' },
  finance:        { id: 'finance',        tier: 4, grade: 'S', name: '김부장', title: '재무부장', track: 'finance', role: 'ranged', trait: 'greedy', skill: { type: 'sweep', power: 2.5 }, next: [],                  look: { hair: 'side', acc: 'glasses', acc2: 'badge', prop: 'calculator' }, palette: { ...MAIN_PAL, B: '#22a6b3', W: '#f9ca24' }, desc: '재무 트랙 완성 · 원거리 광역 딜. 사냥 속도 특화' },
  // 총무 트랙 — 탱커. 생존·방패
  admin_senior:   { id: 'admin_senior',   tier: 2, grade: 'B', name: '김대리', title: '총무대리', track: 'admin',   role: 'tank',  trait: 'sturdy', skill: { type: 'barrier', power: 3 }, next: ['admin_manager'], look: { hair: 'short', acc: 'clipboard', prop: 'radio' },            palette: { ...MAIN_PAL, B: '#f8c471', W: '#e67e22' }, desc: '총무 트랙 · 탱커 · 파티 방패' },
  admin_manager:  { id: 'admin_manager',  tier: 3, grade: 'A', name: '김과장', title: '총무과장', track: 'admin',   role: 'tank',  trait: 'sturdy', skill: { type: 'ult', power: 2.2 },   next: ['admin'],         look: { hair: 'short', acc: 'hardhat', prop: 'radio' },              palette: { ...MAIN_PAL, B: '#e67e22', W: '#f9ca24' }, desc: '총무 트랙 · 전체 기절 · 받는 피해 -20%' },
  admin:          { id: 'admin',          tier: 4, grade: 'S', name: '김부장', title: '총무부장', track: 'admin',   role: 'tank',  trait: 'sturdy', skill: { type: 'ult', power: 3 },     next: [],                look: { hair: 'short', acc: 'hardhat', acc2: 'badge', prop: 'radio' }, palette: { ...MAIN_PAL, B: '#f0932b', W: '#f9ca24' }, desc: '총무 트랙 완성 · 탱커 + 전체 기절. 생존 특화' },
});
/** 사원 이후 세 갈래. 저장된 job id로 트랙을 찾는다 (구버전 senior/manager는 영업 트랙으로 이관됨 — state.migrate). */
export const MAIN_TRACKS = Object.freeze({
  sales:   { id: 'sales',   name: '영업 트랙', color: '#c0392b', desc: '근접 단일 딜. 치명타와 팀 리더십으로 보스를 빠르게 잡는다.' },
  finance: { id: 'finance', name: '재무 트랙', color: '#16a085', desc: '원거리 광역 딜. 골드 보너스와 보스 피해로 사냥 효율을 올린다.' },
  admin:   { id: 'admin',   name: '총무 트랙', color: '#e67e22', desc: '탱커. 방패와 전체 기절로 파티를 지킨다.' },
});
export const MAIN_TIER_TITLES = ['인턴', '사원', '대리', '과장', '부장'];

export function heroBaseStats(def) {
  const g = GRADES[def.grade], r = ROLES[def.role];
  return { atk: g.base.atk * r.atk, hp: g.base.hp * r.hp, interval: r.interval, range: r.range };
}
