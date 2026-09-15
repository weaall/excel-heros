// Generates docs/ART_PROMPTS.md: one consistent illustration prompt per hero (for Firefly / Midjourney / SD),
// built from heroes.js (grade, role, look, palette) and profiles.js (nickname, department, bio).
// Usage: node scripts/artPrompts.mjs
import fs from 'node:fs';
import { HEROES, MAIN_JOBS, GRADES, ROLES } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';

const STYLE = 'clean anime-style character illustration, bust-up portrait, soft cel shading, bright office lighting, crisp lineart, expressive eyes, modern Korean office worker, pastel spreadsheet-green accent, plain light background, centered, high detail, 1:1';
const NEG = 'text, watermark, logo, extra fingers, blurry, low quality, dark, gore, weapon';
const ROLE_POSE = { tank: 'confident stance, arms crossed or holding a clipboard like a shield', melee: 'dynamic pose, sleeves rolled up, ready to work', ranged: 'holding office supplies (papers, tablet or phone), playful aiming pose', healer: 'warm smile, offering coffee or snacks, gentle pose' };
const GRADE_FLAIR = { D: 'casual office wear, simple design', C: 'smart casual, one signature accessory', B: 'team-lead outfit, lanyard and detailed accessories', A: 'executive suit, luxurious details, subtle glow', S: 'legendary aura, gold trim, dramatic rim light, ornate accessories' };
const HAIR = { short: 'short hair', bob: 'bob cut', grey: 'grey hair', bun: 'hair bun', cap: 'cap', side: 'side-parted hair', bald: 'bald', spiky: 'spiky hair', long: 'long hair', curly: 'curly hair' };
const ACC = { tie: 'necktie', headset: 'headset', mustache: 'mustache', hardhat: 'hard hat', coffee: 'coffee cup', badge: 'name badge', lanyard: 'ID lanyard', glasses: 'glasses', beard: 'beard', clipboard: 'clipboard', earring: 'earrings', sunglasses: 'sunglasses', flower: 'hair flower', scarf: 'scarf', crown: 'small gold crown', files: 'stack of files', apron: 'barista apron', radio: 'walkie-talkie', parcel: 'parcel box', phone: 'smartphone', pen: 'pen', suspenders: 'suspenders', hoodie: 'hoodie', magnifier: 'magnifying glass', calculator: 'calculator', ledger: 'ledger book', watch: 'smart watch', briefcase: 'briefcase', cane: 'walking cane', laptop: 'laptop', mop: 'mop', tablet: 'drawing tablet' };

const genderWord = (g) => (g === 'F' ? 'young woman' : 'man');
function prompt(def, id) {
  const p = PROFILES[id] ?? {}; const look = def.look ?? {};
  const bits = [HAIR[look.hair], ACC[look.acc], ACC[look.acc2], ACC[look.prop]].filter(Boolean);
  const colors = def.palette ? `hair color ${def.palette.H}, outfit color ${def.palette.B}, accent ${def.palette.W}` : '';
  return `${genderWord(p.gender)}, ${p.nick ?? def.name} of the ${p.dept ?? 'office'}, ${bits.join(', ')}, ${GRADE_FLAIR[def.grade]}, ${ROLE_POSE[def.role]}, ${colors}, ${STYLE}`;
}

let md = `# 카드 일러스트 프롬프트\n\n> \`node scripts/artPrompts.mjs\`로 생성. 결과 이미지는 \`assets/cards/<id>.png\`로 저장하고 \`assets/cards/manifest.json\`에 등록.\n\n## 스타일 가이드 (모든 카드 공통)\n\n- **구도**: 상반신(bust-up), 정면~3/4, 얼굴이 이미지 위쪽 절반에. 1:1, 512px 이상.\n- **화풍**: 깔끔한 애니메이션 셀 셰이딩, 밝은 사무실 조명, 또렷한 선. 등급이 오를수록 의상·소품이 화려해지고 S는 금색 림라이트.\n- **톤**: 귀엽고 매력적이되 선정적이지 않게(전체 이용가). 여성 캐릭터는 세련된 오피스룩 + 개성 소품, 남성 캐릭터는 든든하거나 유머러스하게.\n- **공통 프롬프트 꼬리**: \`${STYLE}\`\n- **네거티브**: \`${NEG}\`\n\n## 영웅별 프롬프트\n\n| id | 이름 | 등급/역할 | 프롬프트 |\n|---|---|---|---|\n`;
for (const h of HEROES) md += `| \`${h.id}\` | ${h.name} (${PROFILES[h.id]?.nick ?? ''}) | ${h.grade} · ${ROLES[h.role].name} | ${prompt(h, h.id)} |\n`;
md += `\n## 메인 영웅 (직급별)\n\n| id | 직급 | 프롬프트 |\n|---|---|---|\n`;
for (const j of Object.values(MAIN_JOBS)) md += `| \`${j.id}\` | ${j.title} | ${prompt(j, 'main')} |\n`;
md += `\n## 등록 예시\n\n\`\`\`json\n{ "cards": { "ceo": "ceo.png", "coo": "coo.png", "hr_jung": "hr_jung.png" } }\n\`\`\`\n`;
fs.writeFileSync(new URL('../docs/ART_PROMPTS.md', import.meta.url), md);
console.log(`docs/ART_PROMPTS.md: ${HEROES.length + Object.keys(MAIN_JOBS).length} prompts (grades: ${Object.keys(GRADES).join('/')})`);
