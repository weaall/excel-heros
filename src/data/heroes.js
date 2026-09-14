// Hero roster. Names are Excel/office themed so the roster table reads like an HR sheet.
export const GRADES = Object.freeze({
  standard:  { id: 'standard',  name: 'Standard',  rate: 0.60, promote: [10, 20, 40, 80],   color: '#5f6b7a', base: { atk: 6,  hp: 100 } },
  advanced:  { id: 'advanced',  name: 'Advanced',  rate: 0.30, promote: [15, 30, 60, 120],  color: '#2b7cd3', base: { atk: 8,  hp: 130 } },
  executive: { id: 'executive', name: 'Executive', rate: 0.09, promote: [20, 40, 80, 160],  color: '#8e44ad', base: { atk: 11, hp: 160 } },
  ceo:       { id: 'ceo',       name: 'CEO',       rate: 0.01, promote: [25, 50, 100, 200], color: '#d4a017', base: { atk: 15, hp: 200 } },
});
export const GRADE_ORDER = ['standard', 'advanced', 'executive', 'ceo'];

// Roles: multipliers on grade base stats + combat behaviour. range in grid cells.
export const ROLES = Object.freeze({
  tank:   { id: 'tank',   name: 'Tank',   atk: 0.6, hp: 2.0, interval: 1.2, range: 0.6, slot: ['front', 'mid', 'back'] },
  melee:  { id: 'melee',  name: 'Melee',  atk: 1.0, hp: 1.0, interval: 1.0, range: 0.6, slot: ['mid', 'front', 'back'] },
  ranged: { id: 'ranged', name: 'Ranged', atk: 1.1, hp: 0.7, interval: 1.2, range: 5.0, slot: ['back', 'mid', 'front'] },
  healer: { id: 'healer', name: 'Healer', atk: 0.5, hp: 0.8, interval: 1.5, range: 5.0, slot: ['back', 'mid', 'front'] },
});

// Skills (unlocked at ★2, boosted at ★4). power = multiplier of ATK (or of maxHP for heal).
export const SKILLS = Object.freeze({
  strike: { name: 'Power Strike', desc: 'Single target ×{p} damage', cooldown: 8 },
  sweep:  { name: 'Range Sweep',  desc: 'All enemies ×{p} damage',   cooldown: 10 },
  buff:   { name: 'Team Sync',    desc: 'Party ATK +{p}% for 5s',    cooldown: 15 },
  heal:   { name: 'Wellness Day', desc: 'Heal party {p}% max HP',    cooldown: 12 },
  ult:    { name: 'Executive Order', desc: 'All enemies ×{p} damage + 2s stun', cooldown: 14 },
});

/** @type {Array<{id:string,name:string,grade:string,role:string,skill:{type:string,power:number},palette:object}>} */
export const HEROES = [
  // Standard (6) ----------------------------------------------------------
  { id: 'intern',   name: 'Intern Kim',        grade: 'standard', role: 'melee',  skill: { type: 'strike', power: 3 },   palette: { H: '#2b2b2b', B: '#ffffff', P: '#2f3d5c', W: '#9aa5b1' }, starter: true },
  { id: 'clerk',    name: 'Clerk Park',        grade: 'standard', role: 'ranged', skill: { type: 'strike', power: 3 },   palette: { H: '#6b3e1e', B: '#c8d6e5', P: '#3b3b3b', W: '#4b6584' } },
  { id: 'guard',    name: 'Security Guard',    grade: 'standard', role: 'tank',   skill: { type: 'buff',   power: 20 },  palette: { H: '#111111', B: '#1f2a44', P: '#1f2a44', W: '#8395a7' } },
  { id: 'barista',  name: 'Office Barista',    grade: 'standard', role: 'healer', skill: { type: 'heal',   power: 25 },  palette: { H: '#c97b4a', B: '#6d4c41', P: '#3e2723', W: '#ffcc80' } },
  { id: 'courier',  name: 'Mail Courier',      grade: 'standard', role: 'melee',  skill: { type: 'strike', power: 3 },   palette: { H: '#e0b04a', B: '#f39c12', P: '#34495e', W: '#95a5a6' } },
  { id: 'temp',     name: 'Temp Worker',       grade: 'standard', role: 'ranged', skill: { type: 'sweep',  power: 1.2 }, palette: { H: '#7f8c8d', B: '#95a5a6', P: '#2c3e50', W: '#bdc3c7' } },
  // Advanced (5) ----------------------------------------------------------
  { id: 'vlookup',  name: 'VLOOKUP Analyst',   grade: 'advanced', role: 'ranged', skill: { type: 'sweep',  power: 1.5 }, palette: { H: '#1b3a6b', B: '#2b7cd3', P: '#1b3a6b', W: '#74b9ff' } },
  { id: 'pivot',    name: 'Pivot Table Mgr',   grade: 'advanced', role: 'tank',   skill: { type: 'buff',   power: 25 },  palette: { H: '#4a3b2a', B: '#1e5eff', P: '#0b2a6b', W: '#a3c4ff' } },
  { id: 'macro',    name: 'Macro Engineer',    grade: 'advanced', role: 'melee',  skill: { type: 'sweep',  power: 1.5 }, palette: { H: '#1a1a1a', B: '#0984e3', P: '#2d3436', W: '#00cec9' } },
  { id: 'hr',       name: 'HR Specialist',     grade: 'advanced', role: 'healer', skill: { type: 'heal',   power: 30 },  palette: { H: '#5c2e0a', B: '#74b9ff', P: '#2d3436', W: '#ff7675' } },
  { id: 'auditor',  name: 'Internal Auditor',  grade: 'advanced', role: 'melee',  skill: { type: 'strike', power: 4 },   palette: { H: '#3d3d3d', B: '#273c75', P: '#192a56', W: '#dcdde1' } },
  // Executive (3) ---------------------------------------------------------
  { id: 'cfo',      name: 'CFO',               grade: 'executive', role: 'ranged', skill: { type: 'sweep', power: 2 },   palette: { H: '#ececec', B: '#6c5ce7', P: '#2d3436', W: '#ffeaa7' } },
  { id: 'cto',      name: 'CTO',               grade: 'executive', role: 'melee',  skill: { type: 'strike', power: 5 },  palette: { H: '#2d3436', B: '#a29bfe', P: '#2d3436', W: '#00b894' } },
  { id: 'coo',      name: 'COO',               grade: 'executive', role: 'tank',   skill: { type: 'buff',  power: 35 },  palette: { H: '#636e72', B: '#8e44ad', P: '#2c2c54', W: '#dfe6e9' } },
  // CEO (2) ---------------------------------------------------------------
  { id: 'ceo',      name: 'The CEO',           grade: 'ceo', role: 'ranged', skill: { type: 'ult', power: 4 },           palette: { H: '#f5f6fa', B: '#d4a017', P: '#2f3640', W: '#fbc531' } },
  { id: 'chairman', name: 'Chairman',          grade: 'ceo', role: 'tank',   skill: { type: 'ult', power: 3 },           palette: { H: '#dcdde1', B: '#e1b12c', P: '#353b48', W: '#f5f6fa' } },
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map((h) => [h.id, h]));
export const heroesOfGrade = (grade) => HEROES.filter((h) => h.grade === grade);
export const STARTER_HERO = HEROES.find((h) => h.starter).id;

export function heroBaseStats(hero) {
  const g = GRADES[hero.grade], r = ROLES[hero.role];
  return { atk: g.base.atk * r.atk, hp: g.base.hp * r.hp, interval: r.interval, range: r.range };
}
