// Generates docs/CHARACTERS.md — the cast, laid out so a redesign can see what it is working with,
// and so an illustrator has everything for one character in one block.
//
// WHY THIS IS NOT ART_PROMPTS.md
// ------------------------------
// ART_PROMPTS.md is the prompt STRING for each hero: what gets sent to the model. This is the
// character sheet. The difference matters — a per-card view cannot show you that thirteen
// characters shared a hairstyle, and only the whole table could.
//
// WHAT IS STORED AND WHAT IS DERIVED
// ----------------------------------
// Stored in profiles.js / heroes.js: the things that cannot be computed — nickname, department,
// bio, hobby, feature, look, palette.
// Derived here: height, build, eye colour, wing side, wing tier. They come from data the character
// already has, so they cannot drift from it, and every consumer (this doc, the prompts, the pixel
// dolls, a future codex screen) reads the SAME function rather than its own guess.
//
//   node scripts/charSheet.mjs
import fs from 'node:fs';
import { HEROES, MAIN_JOBS, GRADES, ROLES } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';
// One source for the derived design. charSheet had its own copies of wingSide,
// WING_BY_GRADE, height and colorName — two implementations of the same rule, which is
// the drift this very document warns about.
import { wingSideKo, WING_BY_GRADE, BUILD, height, colorName } from '../src/data/design.js';

const HAIR = {
  short: '짧은 머리', bob: '단발', bun: '쪽진 머리', side: '가르마', bald: '민머리',
  spiky: '뻗친 머리', long: '긴 머리', curly: '곱슬', ponytail: '포니테일', twin: '트윈테일',
  braid: '땋은 머리', lowbun: '낮은 쪽머리', undercut: '투블럭', wavy: '웨이브',
  bangs: '일자 앞머리', halfup: '반묶음', messy: '부스스한 머리', pixie: '숏컷',
  sidetail: '한쪽 묶음', hime: '히메컷', slicked: '올백', shaggy: '샤기컷',
};

const count = (rows, pick) => {
  const m = new Map();
  for (const r of rows) for (const v of [pick(r)].flat().filter(Boolean)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const rows = HEROES.map((h) => ({ h, p: PROFILES[h.id] ?? {}, look: h.look ?? {} }));

let md = `# 캐릭터 설정

> \`node scripts/charSheet.mjs\`로 생성. **손으로 고치지 말 것** — 다음 실행에 덮어쓴다.
> 바꾸려면 \`src/data/heroes.js\`(외형·팔레트)와 \`src/data/profiles.js\`(인물·취미·특징)를 고친다.
> 규칙은 \`docs/CHARACTER_DESIGN.md\`에 있다.

## 저장된 것과 파생되는 것

| | |
|---|---|
| **저장** | 별명 · 부서 · 성별 · 소개 · 취미 · 특징 · 머리/소품 · 팔레트 |
| **파생** | 키 · 체형 · 눈색 · 날개 방향 · 날개 등급 |

파생값은 캐릭터가 이미 가진 데이터에서 나온다. 그래서 **데이터와 어긋날 수가 없고**, 이 문서·프롬프트·
도트·도감이 전부 같은 함수를 읽는다. 따로 적어 두면 언젠가 갈라진다.

`;

// ---------------------------------------------------------------- repetition first
md += `## 겹치는 곳\n\n`;
const hairs = count(rows, (r) => r.look.hair);
md += `**머리 ${hairs.length}종 / ${rows.length}명** — 최다 ${hairs[0][1]}명 (${HAIR[hairs[0][0]] ?? hairs[0][0]})\n\n`;
md += hairs.map(([k, n]) => `${HAIR[k] ?? k} ${n}`).join(' · ') + `\n\n`;

const accs = count(rows, (r) => [r.look.acc, r.look.acc2, r.look.prop]);
md += `**소품 ${accs.length}종** · `;
md += `**성별** ` + count(rows, (r) => r.p.gender ?? '?').map(([k, n]) => `${k === 'F' ? '여' : '남'} ${n}`).join(' · ');
md += ` · **날개** ` + count(rows, (r) => wingSideKo(r.h.id)).map(([k, n]) => `${k} ${n}`).join(' · ') + `\n\n`;

const gradeKeys = [...new Set(HEROES.map((h) => h.grade))];
const roleKeys = [...new Set(HEROES.map((h) => h.role))];
md += `| 등급＼역할 | ${roleKeys.map((r) => ROLES[r]?.name ?? r).join(' | ')} |\n`;
md += `|---|${roleKeys.map(() => '---').join('|')}|\n`;
for (const g of gradeKeys) {
  const cells = roleKeys.map((r) => rows.filter((x) => x.h.grade === g && x.h.role === r).length || '—');
  md += `| **${g}** | ${cells.join(' | ')} |\n`;
}

// ---------------------------------------------------------------- wing ladder
md += `\n## 날개 사다리\n\n`;
md += `한쪽만. 깃털이 아니라 **셀·막대그래프 모양의 빛 조각**. 크기가 아니라 **조각 수와 층**으로 오른다.\n\n`;
md += `| 등급 | 조각 | 층 | 폭 | 빛 |\n|---|---|---|---|---|\n`;
for (const g of gradeKeys) {
  const w = WING_BY_GRADE[g];
  md += `| **${g}** | ${w.seg} | ${w.layer} | ${w.spanKo} | ${w.light} |\n`;
}
md += `\n색은 각 캐릭터의 \`palette.W\`를 쓴다 — 55명이 전부 다른 강조색을 가지고 있으므로 날개도 55종이 된다.\n`;

// ---------------------------------------------------------------- per-character blocks
md += `\n---\n\n## 사원 명단\n`;
for (const g of gradeKeys) {
  const inGrade = rows.filter((r) => r.h.grade === g);
  const w = WING_BY_GRADE[g];
  md += `\n### ${g} · ${GRADES[g]?.label ?? ''} — ${inGrade.length}명\n`;
  for (const { h, p, look } of inGrade) {
    const props = [look.acc, look.acc2, look.prop].filter(Boolean).join(' · ') || '—';
    md += `\n#### ${h.name}${p.nick ? ` — ${p.nick}` : ''}\n\n`;
    md += `\`${h.id}\` · ${p.dept ?? '—'} · ${ROLES[h.role]?.name ?? h.role} · ${p.gender === 'F' ? '여성' : '남성'}\n\n`;
    md += `| | |\n|---|---|\n`;
    md += `| 키 · 체형 | ${height(h, p)}cm · ${BUILD[h.role] ?? '—'} |\n`;
    md += `| 머리 | ${HAIR[look.hair] ?? look.hair ?? '—'} · \`${h.palette?.H ?? '—'}\` |\n`;
    md += `| 눈 | ${colorName(h.palette?.W, true)} 눈 |\n`;
    md += `| 소품 | ${props} |\n`;
    md += `| 날개 | **${wingSideKo(h.id)}** · 조각 ${w.seg}개 ${w.layer}층 · \`${h.palette?.W ?? '—'}\` |\n`;
    md += `| 팔레트 | 머리 \`${h.palette?.H ?? '—'}\` · 상의 \`${h.palette?.B ?? '—'}\` · 강조 \`${h.palette?.W ?? '—'}\` |\n`;
    md += `| 취미 | ${p.hobby ?? '—'} |\n`;
    md += `| **특징** | **${p.feature ?? '—'}** |\n`;
    // The short line is what the card UI renders — it stays short on purpose, because both
    // the web panel and the Unity card sheet lay it out in a fixed frame. The long one is for
    // whoever draws this character and lives only in the document.
    md += `
> **${p.bio ?? '—'}**
`;
    if (p.story) md += `>
> ${p.story}
`;
    if (p.line) md += `>\n> 평소 — "${p.line}"\n`;
    if (p.ult) md += `> EX — "${p.ult}"\n`;
  }
}

// ---------------------------------------------------------------- main hero
md += `\n---\n\n## 주인공 (김인턴) — 승진 트랙\n\n`;
md += `한 사람이다. 승진해도 같은 인물 — **남성, 검은 단발**, 11개 직급 전부 동일. 바뀌는 것은 복장의\n`;
md += `격과 날개뿐이고, 얼굴·머리·체형은 고정이다. 트랙(영업·재무·총무)은 **소품과 색**으로 구별한다.\n\n`;
md += `| id | 직급 | 트랙 | 등급 | 역할 | 날개 | 다음 |\n|---|---|---|---|---|---|---|\n`;
for (const j of Object.values(MAIN_JOBS)) {
  const w = WING_BY_GRADE[j.grade] ?? WING_BY_GRADE.D;
  md += `| \`${j.id}\` | ${j.title ?? j.name} | ${j.track ?? '—'} | ${j.grade} | ${ROLES[j.role]?.name ?? j.role} `
      + `| ${wingSideKo('main')} · 조각 ${w.seg} | ${(j.next ?? []).join(', ') || '—'} |\n`;
}
md += `\n주인공의 날개는 **${wingSideKo('main')}** 고정이다 — 승진해도 방향은 바뀌지 않는다.\n`;

fs.writeFileSync(new URL('../docs/CHARACTERS.md', import.meta.url), md);
console.log(`docs/CHARACTERS.md: ${rows.length} heroes + ${Object.keys(MAIN_JOBS).length} jobs`);
console.log(`  hair ${hairs.length} styles, busiest ${hairs[0][0]} x${hairs[0][1]}`);
console.log(`  wings: ` + count(rows, (r) => wingSideKo(r.h.id)).map(([k, n]) => `${k} ${n}`).join(', '));
