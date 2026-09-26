// Derived character design: height, build, eye colour, wing side and wing tier.
//
// These are NOT stored per character. They come from data the character already has — role, id,
// palette — so there is no second copy to drift. Every consumer imports from here: the character
// sheet, the illustration prompts, the pixel dolls, and whatever draws a codex later. Two files
// computing "which side is the wing on" independently is how a card ends up with its wing on the
// left in one screen and the right in another.

/** Stable per-id number. The pose angles already use this trick: same card, same answer, forever. */
export const hash = (id) => [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0);

/**
 * 시트 방향 — the side the back sheet leans out on.
 *
 * The sheet floats BEHIND the character, tilted, and shows past the silhouette on one side only.
 * Which side varies per character (five sheets all leaning the same way make the party row look
 * stamped) but is fixed by id: a sheet that moves between renders belongs to a different person.
 * These are the same answers the wing had, so nothing already decided moves.
 */
export const sheetSide = (id) => (hash(id) % 2 === 0 ? 'left' : 'right');
export const sheetSideKo = (id) => (sheetSide(id) === 'left' ? '왼쪽' : '오른쪽');

/**
 * 등 뒤의 시트 — the grade device. It is DRAWN BY THE GAME, never by the illustration model.
 *
 * Why not painted: the model cannot keep a grid (D must be exactly 3x2 on all eleven D cards), it
 * cannot emit alpha (a translucent panel keyed off white comes out as an opaque pale slab), and a
 * painted sheet cannot fill up as the character levels. Drawn as its own layer under the cutout,
 * the sheet gets real transparency, per-screen size, animation, and the character's live numbers.
 *
 * GRADE sets the STRUCTURE — columns, chrome, extras. It never sets the size; the lesson from the
 * halo and the wing both is that rank has to be visible as structure, because an adjective does
 * not survive the render and size runs into every slot width at once.
 *
 * NEVER ABOVE THE HEAD. Top edge between the shoulder and the ear. A sheet over the head reads as
 * the reference's halo, which is the one thing this device exists to not be.
 */
export const SHEET_BY_GRADE = {
  D: { cols: 3, chrome: '선만 있는 격자', extra: '—' },
  C: { cols: 4, chrome: '격자 + 머리글 행(A, B, C…)', extra: '—' },
  B: { cols: 5, chrome: '머리글 행·열 + 수식 입력줄', extra: '조건부 서식 색' },
  A: { cols: 6, chrome: '머리글 + 수식 입력줄 + 금색 테두리', extra: '작은 막대 차트' },
  S: { cols: 7, chrome: '시트 탭 세 장이 겹침 + 금색 테두리', extra: '차트 + 셀에서 숫자가 흘러내림' },
};
export const sheetTier = (grade) => SHEET_BY_GRADE[grade] ?? SHEET_BY_GRADE.C;

/** Rows open with ★. One row per star, five at ★5 — the sheet literally grows as you invest. */
export const SHEET_ROWS_MAX = 5;

/**
 * 채워진 칸 — how much of the sheet is filled, from the character's live state.
 *   rows  = ★ (1..5)
 *   fill  = level / levelCap, left to right, top to bottom, across the OPEN rows
 *   gold  = 각성 turns filled cells gold and writes a formula in the formula bar (B and up)
 *   bars  = 스킬 레벨 drives the chart bar heights (A and up)
 * Pure: the caller passes numbers, so this runs the same in the web game, a test and Unity.
 */
export function sheetFill({ grade, star = 1, level = 1, cap = 80, awakened = false, skillLv = 0 }) {
  const t = sheetTier(grade);
  const rows = Math.max(1, Math.min(SHEET_ROWS_MAX, star | 0 || 1));
  const cells = rows * t.cols;
  const ratio = Math.max(0, Math.min(1, cap > 0 ? level / cap : 0));
  return { cols: t.cols, rows, cells, filled: Math.round(cells * ratio), gold: !!awakened, bars: Math.max(0, skillLv | 0) };
}

/**
 * 특성 → 셀 무늬. Each trait is a spreadsheet feature, so a player who knows Excel reads the
 * trait off the sheet without a tooltip — and ten traits give ten visibly different sheets
 * inside the same grade.
 */
export const SHEET_TRAIT = {
  crit:      { ko: '빨간 강조 셀이 드문드문',          excel: '조건부 서식: 상위 10%' },
  swift:     { ko: '셀마다 → 화살표 아이콘',          excel: '아이콘 집합' },
  greedy:    { ko: '₩ 통화 서식, 금색 숫자',          excel: '통화 표시 형식' },
  sturdy:    { ko: '굵은 바깥 테두리, 틀 고정선',     excel: '굵은 테두리 + 틀 고정' },
  lifesteal: { ko: '커피색 데이터 막대',              excel: '데이터 막대' },
  focus:     { ko: '모서리의 빨간 메모 삼각형',       excel: '메모 표시' },
  rally:     { ko: '맨 아래 굵은 합계 행',            excel: '요약 행 (=SUM)' },
  lucky:     { ko: '별 아이콘이 흩어진 셀',           excel: '아이콘 집합 (별)' },
  regen:     { ko: '초록 데이터 막대가 차오름',       excel: '데이터 막대 (녹색)' },
  splash:    { ko: '가로로 병합된 넓은 셀',           excel: '셀 병합' },
};

/** 역할 → 시트로 공격하는 방식. The sheet is the weapon; the role decides how it is swung. */
export const SHEET_ATTACK = {
  tank:   { ko: '시트가 앞으로 나와 셀 격자 벽이 된다',        skill: '틀 고정 — 격자가 굳어 피해를 막는다' },
  melee:  { ko: '행 하나가 뜯겨 나와 칼날처럼 벤다',           skill: '행 삭제 — 한 줄이 통째로 적을 긋는다' },
  ranged: { ko: '셀이 떨어져 나가 숫자 탄환으로 날아간다',     skill: '채우기 핸들 — 셀이 줄지어 연사된다' },
  healer: { ko: '초록 =SUM 셀이 아군에게 날아가 붙는다',       skill: '자동 합계 — 파티 전원에게 초록 셀' },
};

/** 체형 — role first, because that is what the silhouette has to say at 128px. */
export const BUILD = { tank: '다부진 체격', melee: '탄탄한 체격', ranged: '호리호리한 체격', healer: '아담한 체격' };
export const BUILD_EN = { tank: 'broad sturdy build', melee: 'athletic build', ranged: 'slender build', healer: 'slim build' };

/** 키 — a band per role, and the id picks a spot inside it. A tank is always tall; no two tanks
 *  are the same tall. */
const HEIGHT_BAND = { tank: [176, 190], melee: [170, 182], ranged: [163, 176], healer: [155, 168] };
export function height(def, profile) {
  const [lo, hi] = HEIGHT_BAND[def.role] ?? [165, 175];
  const base = lo + (hash(def.id) % (hi - lo + 1));
  return profile?.gender === 'F' ? Math.max(150, base - 8) : base;
}

/** Hue name for a hex, in Korean or English. Used for eyes (palette.W) and hair (palette.H). */
export function colorName(hex, ko = false) {
  if (!hex) return ko ? '검은' : 'black';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) {
    const grey = l > 0.85 ? ['흰', 'white'] : l > 0.6 ? ['은', 'silver'] : l > 0.3 ? ['회', 'grey'] : ['검은', 'black'];
    return ko ? grey[0] : grey[1];
  }
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const table = h < 15 ? ['붉은', 'red'] : h < 40 ? ['주황', 'orange'] : h < 65 ? ['황금', 'golden']
              : h < 160 ? ['초록', 'green'] : h < 200 ? ['청록', 'aqua'] : h < 250 ? ['푸른', 'blue']
              : h < 290 ? ['보라', 'purple'] : h < 335 ? ['분홍', 'pink'] : ['붉은', 'red'];
  const lead = l > 0.72 ? (ko ? '밝은 ' : 'light ') : l < 0.3 ? (ko ? '짙은 ' : 'dark ') : '';
  return lead + (ko ? table[0] : table[1]);
}

/**
 * What the illustration is told about the back: NOTHING is there. The game draws the sheet under
 * the cutout, so the painted character must leave that space empty — a wing, a halo or a floating
 * screen painted in would sit in front of the drawn sheet and fight it.
 */
export const BACK_CLEAR = 'nothing on the back, nothing behind the shoulders, clear empty space around the upper body';
export const BACK_NEG = 'wings, angel wings, feathered wings, halo, glowing ring above the head, floating screens, holographic panels, floating papers, backpack, cape';

/**
 * 의상 — one garment line per character.
 *
 * Grade sets the FINISH (how expensive the clothes look); this sets the GARMENT. Without it the
 * roster is five strings for fifty-six people and every D grade wears the same shirt, which is
 * exactly the failure the hair had before it was redistributed.
 *
 * CLOTHING ONLY. No lighting, no particles, nothing behind the character — the cutout removes the
 * background by flooding in from the border, so anything floating in the gap is not connected to
 * the border, survives the flood, and lands on the transparent plate as debris. Expression and
 * what the hands hold are on the body and stay.
 */
export const OUTFIT_BY_ID = {
  parttime: 'reception uniform, vest, ribbon tie',
  barista: 'striped shirt, brown barista apron, rolled sleeves, hair tied',
  contract: 'oversized beige cardigan over a blouse',
  hr_jung: 'teal blazer over a white blouse, earrings',
  acct_lead: 'black turtleneck, high-waist trousers, glasses',
  welfare: 'pastel knit sweater, scarf',
  coo: 'elegant tailored navy pantsuit with gold buttons and a thin gold chain, silk blouse, sleek side-swept bob, sharp confident smile, holding a slim tablet',
  ceo: 'white long coat over black dress, gold accents, small sunglasses, pale skin, brightly lit face, confident smile',
  helpdesk: 'hoodie over a collared shirt, headset around the neck',
  cleaner: 'work jumpsuit, headscarf, rubber gloves',
  legal_yoon: 'black long coat, white collar, thin glasses',
  pm_lead: 'crisp denim jacket over a white blouse, neat bob, lanyard, holding a fanned stack of planning documents, confident bright smile',
  design_lead: 'oversized artist smock over a striped tee, curly pink hair under a beret, holding a drawing tablet and a stylus, bright cheerful smile, a few paint smudges on the smock',
  cmo: 'stylish scarlet blazer over white top, long wavy hair, sunglasses pushed up on head, statement gold earrings, playful wink',
  intern_seo: 'oversized cardigan, lanyard, holding a tablet',
  pr_yoo: 'bomber jacket over a top, press badge',
  nurse_han: 'white nurse uniform, nurse cap, clipboard',
  lab_park: 'white lab coat over sweater, glasses, laptop',
  intern_min: 'pastel pink cardigan over white blouse, twin tails with ribbons, notebook hugged to chest, bright cheerful smile',
  security_yang: 'navy security uniform, black ponytail, radio on shoulder, serious but kind eyes',
  mail_cho: 'blue postal jacket over a grey tee, backwards cap, a mail bag strap across the chest, a bundle of envelopes in one hand, bright grin',
  qa_lee: 'dark purple hoodie, navy bob, round glasses, laptop covered in stickers, deadpan',
  reception_go: 'coral blazer, long brown hair, headset, holding a microphone, warm smile',
  trainer_seok: 'orange coach vest over white shirt, whistle, clipboard, energetic',
  translator_ji: 'beige trench coat, long silver-blue hair, book, elegant',
  secretary_yun: 'charcoal pencil suit, black hair bun, gold earrings, leather planner, composed',
  logistics_bae: 'grey work jacket, orange gloves, stacked boxes, sturdy, friendly',
  cdo: 'black suit with cyan accents and a gold pin, long black hair with a bright blue streak tucked behind her ear, bright cyan eyes, calm confident smile, one hand resting on a slim tablet',
  cco: 'coral suit, pink bob, headset phone, radiant smile, flowers',
  chief_of_staff: 'white and gold executive suit with a thin gold chain, platinum long ponytail, an approval stamp in one hand, sharp confident smile',
  cso: 'white and navy executive suit dress, lavender long wavy hair, star earrings, holographic tablet, serene confident smile',
  ai_lead: 'white and gold lab coat over a mint blouse, very long mint hair, round glasses, a slim holographic panel held at her side, serene commanding presence',
  union_chief: 'crimson and gold leader coat with a white armband over a dark shirt, blond spiked hair, a union pin on the lapel, broad confident grin',
  hacker: 'long black techwear coat open over a hooded top, glowing cyan circuit lines running through the fabric, neon cyan headset, short black bob with a bright cyan streak, confident smirk',
  chro: 'elegant mauve suit dress with pearl earrings and a gold brooch, long wavy hair, warm reassuring smile, one hand resting lightly over her heart with fingers together',
  chairwoman: 'black formal gown-style suit, silver hair, small crown, cane',
  staff_park: 'white shirt sleeves rolled, loosened tie, lanyard',
  guard: 'navy security uniform, cap, radio',
  courier: 'cheerful young woman in a delivery worker jacket with an orange collar, baseball cap, name tag, hands on the strap of a shoulder bag',
  vlookup: 'vest over shirt, glasses, pen',
  pivot: 'suspenders over a crisp white shirt, dark hair in a neat low bun, reading glasses',
  macro: 'charcoal zip hoodie over a plain tee, headphones around the neck, a laptop tucked under one arm, messy black hair, tired but pleased half smile',
  audit_han: 'trench coat, sunglasses, magnifying glass',
  dev_lead: 'flannel shirt, headset, coffee cup',
  ga_lead: 'grey work vest, gloves, boxes',
  cro: 'charcoal double-breasted suit with a gold pin, dark hair in a neat bun, thin glasses, calm unshakeable gaze',
  cpo: 'teal shirt with rolled sleeves, headset around neck, short brown hair, holding a tablet showing a product roadmap, focused smile',
  ir_lead: 'deep purple three-piece suit, swept black hair, gold tie pin, holding a leather ledger, composed confident smile',
  labor_atty: 'ivory pantsuit over a soft blouse, long brown wavy hair, thin glasses, arms loosely folded, warm reassuring smile, soft white light',
  bd_lead: 'orange blazer over a white shirt, spiked black hair, wristwatch, three business cards fanned between her fingers, energetic grin',
  cfo: 'deep purple three-piece suit with a gold pocket watch chain, silver hair swept back, thin gold-rimmed glasses, sharp calculating smile',
  cto: 'black turtleneck under a tailored charcoal blazer, spiky black hair, tinted glasses pushed up on her head, confident smirk',
  chairman: 'golden formal suit dress, cane, small gold crown, silver hair in an elegant updo',
  founder: 'white and gold founder coat worn open over a fitted black turtleneck, long silver hair, thin gold-rimmed glasses, arms loosely crossed, calm visionary gaze, thin gold embroidery on the collar and cuffs of the coat',
  sales_kang: 'sharp navy suit, red tie, briefcase',
  intern: 'young man, short black hair, white shirt, lanyard, files',
  staff: 'young man, short black hair, light blue shirt, tie, phone',
  sales_senior: 'young man, short black hair, white shirt with rolled sleeves, red necktie, red lanyard, holding phone, confident grin',
  sales_manager: 'young man, short black hair, dark red blazer over white shirt, red necktie, briefcase, confident',
  sales: 'young man, short black spiky hair, red suit, sunglasses, briefcase',
  finance_senior: 'young man, short black hair, navy vest over mint shirt, teal necktie, glasses, holding calculator, calm',
  finance_manager: 'young man, short black hair, teal suit, glasses, tablet with charts, composed',
  finance: 'young man, short black hair, teal suit, glasses, calculator',
  admin_senior: 'young man, short black hair, orange work vest over white shirt, work gloves, clipboard, friendly',
  admin_manager: 'young man, short black hair, orange work jacket, yellow hardhat, walkie-talkie, reliable',
  admin: 'young man, short black hair, orange and gold executive work coat, yellow hardhat under arm, walkie-talkie, steady smile',
};
export const outfit = (id) => OUTFIT_BY_ID[id] ?? null;

/** Words that do not belong in an outfit. `scripts/checkOutfits.mjs` enforces this. */
export const OFF_BODY = /behind (her|him|them)(?! ear)|bokeh|light particles|rim light|sparkl|floating|orbiting|drifting|confetti|petals|motion lines|in the distance|aura|dramatic|daylight/i;
