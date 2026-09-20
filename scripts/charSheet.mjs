// Generates docs/CHARACTERS.md — the cast, laid out so a redesign can see what it is working with.
//
// WHY THIS IS NOT ART_PROMPTS.md
// ------------------------------
// ART_PROMPTS.md is the prompt STRING for each hero: what gets sent to the model. This is the
// character sheet: who they are, what they look like, and — the part that matters for a redesign —
// where the roster repeats itself. Fifty-five cards built from ten hairstyles and one pose per role
// will produce faces that blur together, and no per-card prompt shows you that. Only the whole
// table does.
//
// Everything here is read from src/data/heroes.js and src/data/profiles.js. Nothing is written by
// hand, so the sheet cannot drift from the game the way a hand-kept design doc does.
//
//   node scripts/charSheet.mjs
import fs from 'node:fs';
import { HEROES, MAIN_JOBS, GRADES, ROLES } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';

const HAIR = {
  short: '짧은 머리', bob: '단발', grey: '백발', bun: '쪽진 머리', cap: '모자',
  side: '가르마', bald: '민머리', spiky: '뻗친 머리', long: '긴 머리', curly: '곱슬',
};

const count = (rows, pick) => {
  const m = new Map();
  for (const r of rows) for (const v of [pick(r)].flat().filter(Boolean)) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

const rows = HEROES.map((h) => ({ h, p: PROFILES[h.id] ?? {}, look: h.look ?? {} }));

let md = `# 캐릭터 설정

> \`node scripts/charSheet.mjs\`로 생성. 손으로 고치지 말 것 — 다음 실행에 덮어쓴다.
> 바꾸려면 \`src/data/heroes.js\`(외형·팔레트)와 \`src/data/profiles.js\`(인물)를 고친다.

일러스트 프롬프트 자체는 \`docs/ART_PROMPTS.md\`에 있다. 이 문서는 **프롬프트가 보여 주지 않는 것**을
본다: 로스터 전체를 한 장에 놓았을 때 어디가 겹치고 어디가 비어 있는지.

## 어디를 고치면 무엇이 바뀌나

| 바꾸고 싶은 것 | 고칠 곳 |
|---|---|
| 머리·소품·안경 | \`heroes.js\`의 \`look\` (\`hair\` \`acc\` \`acc2\` \`prop\`) |
| 색 | \`heroes.js\`의 \`palette\` — H 머리 · B 상의 · P 하의 · W 강조 |
| 별명·부서·성별·소개·대사 | \`profiles.js\` |
| 등급이 화려해지는 방식 | \`scripts/artPrompts.mjs\`의 \`GRADE_FLAIR\` |
| 역할별 자세 | 같은 파일의 \`ROLE_POSE\` |
| 헤일로 사다리 | \`scripts/genCardsHF.mjs\`의 \`HALO_BY_GRADE\` |

`;

// ---------------------------------------------------------------- the repetition, first
md += `## 겹치는 곳 (재디자인에서 먼저 볼 것)\n\n`;

const hairs = count(rows, (r) => r.look.hair);
md += `### 머리 — ${hairs.length}종으로 ${rows.length}명\n\n`;
md += `| 머리 | 인원 | 누가 |\n|---|---|---|\n`;
for (const [k, n] of hairs) {
  const who = rows.filter((r) => r.look.hair === k).map((r) => r.h.name).join(', ');
  md += `| ${HAIR[k] ?? k} | ${n} | ${who} |\n`;
}
md += `\n`;

const accs = count(rows, (r) => [r.look.acc, r.look.acc2, r.look.prop]);
md += `### 소품 — ${accs.length}종\n\n`;
md += accs.map(([k, n]) => `\`${k}\` ${n}`).join(' · ') + `\n\n`;

const genders = count(rows, (r) => r.p.gender ?? '?');
md += `### 성별 · 역할 · 등급\n\n`;
md += `- 성별: ` + genders.map(([k, n]) => `${k === 'F' ? '여성' : k === 'M' ? '남성' : '미지정'} ${n}`).join(' · ') + `\n`;
md += `- 등급: ` + count(rows, (r) => r.h.grade).map(([k, n]) => `${k} ${n}`).join(' · ') + `\n`;
md += `- 역할: ` + count(rows, (r) => ROLES[r.h.role]?.name ?? r.h.role).map(([k, n]) => `${k} ${n}`).join(' · ') + `\n\n`;

// grade x role matrix — the empty cells are the ones worth arguing about
const gradeKeys = [...new Set(HEROES.map((h) => h.grade))];
const roleKeys = [...new Set(HEROES.map((h) => h.role))];
md += `| 등급＼역할 | ${roleKeys.map((r) => ROLES[r]?.name ?? r).join(' | ')} |\n`;
md += `|---|${roleKeys.map(() => '---').join('|')}|\n`;
for (const g of gradeKeys) {
  const cells = roleKeys.map((r) => rows.filter((x) => x.h.grade === g && x.h.role === r).length || '—');
  md += `| **${g}** | ${cells.join(' | ')} |\n`;
}
md += `\n`;

// ---------------------------------------------------------------- the cast
md += `## 사원 명단\n\n`;
for (const g of gradeKeys) {
  const inGrade = rows.filter((r) => r.h.grade === g);
  md += `### ${g} · ${GRADES[g]?.label ?? ''} (${inGrade.length}명)\n\n`;
  md += `| id | 이름 | 별명 | 부서 | 역할 | 성별 | 머리 | 소품 | 팔레트 | 소개 |\n`;
  md += `|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const { h, p, look } of inGrade) {
    const props = [look.acc, look.acc2, look.prop].filter(Boolean).join(' · ') || '—';
    const pal = h.palette ? `H \`${h.palette.H}\` B \`${h.palette.B}\` W \`${h.palette.W}\`` : '—';
    md += `| \`${h.id}\` | ${h.name} | ${p.nick ?? '—'} | ${p.dept ?? '—'} | ${ROLES[h.role]?.name ?? h.role} `
        + `| ${p.gender === 'F' ? '여' : p.gender === 'M' ? '남' : '?'} | ${HAIR[look.hair] ?? look.hair ?? '—'} `
        + `| ${props} | ${pal} | ${p.bio ?? '—'} |\n`;
  }
  md += `\n`;
}

// ---------------------------------------------------------------- the main hero
md += `## 주인공 (김인턴) — 승진 트랙\n\n`;
md += `한 사람이고, 승진해도 같은 사람이다: 남성, 검은 단발. 사원 직후 영업·재무·총무로 갈라지고 되돌릴 수 없다.\n\n`;
md += `| id | 직급 | 트랙 | 등급 | 역할 | 다음 |\n|---|---|---|---|---|---|\n`;
for (const j of Object.values(MAIN_JOBS)) {
  md += `| \`${j.id}\` | ${j.title ?? j.name} | ${j.track ?? '—'} | ${j.grade} | ${ROLES[j.role]?.name ?? j.role} `
      + `| ${(j.next ?? []).join(', ') || '—'} |\n`;
}

md += `\n## 대사\n\n| id | 평소 | EX |\n|---|---|---|\n`;
for (const { h, p } of rows) md += `| \`${h.id}\` | ${p.line ?? '—'} | ${p.ult ?? '—'} |\n`;
md += `| \`main\` | ${PROFILES.main?.line ?? '—'} | ${PROFILES.main?.ult ?? '—'} |\n`;

fs.writeFileSync(new URL('../docs/CHARACTERS.md', import.meta.url), md);
console.log(`docs/CHARACTERS.md: ${rows.length} heroes + ${Object.keys(MAIN_JOBS).length} jobs`);
console.log(`  hair styles ${hairs.length} across ${rows.length} cards — busiest: ${hairs[0][0]} x${hairs[0][1]}`);
console.log(`  props ${accs.length}`);
