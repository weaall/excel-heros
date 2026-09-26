// Generate card illustrations with an anime-specialised model (Animagine XL 4.0) running as a public Hugging Face
// Space (Gradio API, anonymous ZeroGPU quota). Danbooru-tag prompts in a Blue Archive-like look.
// Usage:
//   node scripts/genCardsHF.mjs ceo coo hr_jung      # given ids
//   node scripts/genCardsHF.mjs                      # every hero/job without a png yet
//   node scripts/genCardsHF.mjs --force ceo          # regenerate
//   node scripts/genCardsHF.mjs --skin [ceo …]       # skin illustrations <id>__casual.png / <id>__formal.png (heroes only unless ids given)
//   node scripts/genCardsHF.mjs --scene [meteor …]   # prologue scenes → assets/story/<id>.png (landscape)
//   SEED=3 SPACE=asahina2k-animagine-xl-4-0 node scripts/genCardsHF.mjs ...
import fs from 'node:fs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';
import { SKINS } from '../src/data/skins.js';
import { PROLOGUE } from '../src/data/prologue.js';
import { PROFILES } from '../src/data/profiles.js';
import { BACK_CLEAR, BACK_NEG, BUILD_EN, height, OUTFIT_BY_ID } from '../src/data/design.js';

const SPACE = process.env.SPACE ?? 'asahina2k-animagine-xl-4-0';
const BASE = `https://${SPACE}.hf.space`;

/**
 * 자세. 전원이 카메라를 정면으로 맞닥뜨리고 있으면 스물네 장이 같은 사진처럼 보인다.
 * id 해시로 고르므로 **같은 카드는 늘 같은 자세**(재현성)이고 카드끼리는 다르다(다양성).
 * 얼굴 규칙은 건드리지 않는다 — 어느 자세든 얼굴은 정면을 보고 완전히 보인다.
 */
const ANGLES = [
  'three quarter view, shoulders angled away, head turned back toward the viewer',
  'three quarter view from the left, torso rotated, chin slightly raised',
  'three quarter view from the right, one shoulder closer to the viewer, head tilted gently',
  'slightly low angle three quarter view, shoulders squared away from the camera',
];
/** 몸 자세 — 캐릭터 설명에 이미 자세가 있으면 주지 않는다(손이 세 개가 된다). */
const BODY_POSES = [
  'one hand resting on the hip, relaxed confident stance',
  'arms folded loosely, leaning back a little',
  'one hand raised near the collar adjusting a lanyard, other arm relaxed',
  'hands clasped together in front, head tilted gently',
  'hand near the chin in thought, elbow bent',
  'one hand tucked into a pocket, other arm hanging relaxed',
];
const hash = (id) => { let h = 0; for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0; return Math.abs(h); };
/** 이미 자세가 박힌 설명인지. 겹치면 몸 자세는 생략하고 각도만 준다. */
const POSED = /\b(arms? crossed|arms? folded|hands? up|holding|hand (on|resting|tucked)|in (one )?hand|across the chest|leaning|pointing|clasp|salute|raised|fist)\b/i;
const poseTag = (id, desc) => {
  const h = hash(id);
  const angle = ANGLES[h % ANGLES.length];
  return POSED.test(desc) ? angle : `${BODY_POSES[(h >> 3) % BODY_POSES.length]}, ${angle}`;
};
/**
 * CUTOUT=1 — generate for a TRANSPARENT background instead of a painted one.
 *
 * Opt-in, not a replacement. The 198 cards that ship today have their backgrounds painted in and
 * work; flipping the default would strand the game on a half-finished set. Set CUTOUT=1, generate
 * a couple, run tools/cutout.py, look at them, and only then decide.
 *
 * Three things change together and none of them works alone:
 *   1. the background becomes one flat bright colour, so there is something uniform to key
 *   2. the shot becomes full body, because a bust cannot be extended into a standing figure later
 *   3. the negatives stop banning full body — they currently forbid exactly what this needs
 */
const CUTOUT = process.env.CUTOUT === '1';

/** What the character is drawn ON when CUTOUT is set. Near-white rather than chroma: a saturated
 *  key colour bleeds into hair edges, and this roster has mint, lavender and pink hair. */
const CUTOUT_BG = 'plain flat white background, solid white backdrop, no scenery, no furniture, no floor, isolated character, studio cutout';

/** Head to feet, with margin. The margin is not styling — tools/cutout.py floods inward from the
 *  image border, so a character touching an edge lets the fill walk into them. */
// Full body that FILLS the height, as blue-utils' standing art does. 'Clear empty margin on
// all sides' shrank the figure until the face was a thumbnail; the cutout needs only a sliver
// of background above the head and below the feet to flood from.
const CUTOUT_SHOT = 'full body, standing, full figure from head to feet, the character fills the frame from top to bottom, a thin strip of empty background above the head and below the feet, feet visible, official art, game cg, standing portrait';

const STYLE_TAGS_BASE = 'blue archive style, centered composition, character centered in frame, flat color, cel shading, thin clean lineart, consistent line weight, anime coloring, vivid pastel colors, character focus';
// `soft blurred background, depth of field` asks for a background to blur; with CUTOUT there is
// nothing behind the character and those tags only produce a smudge that will not key cleanly.
const STYLE_TAGS = CUTOUT ? STYLE_TAGS_BASE
  : `${STYLE_TAGS_BASE}, soft blurred background, muted simple background, depth of field`;
/** Backgrounds: by character (department flavour), else by grade. Kept bright and readable behind a bust/cowboy shot. */
const BG_BY_ID = {
  main: 'modern office, cubicles, computer monitors, morning light', intern: 'modern office, cubicles, morning light', staff: 'modern office, desks, window light',
  sales_senior: 'sales floor, phones, afternoon light', sales_manager: 'meeting room, sales chart on whiteboard, sunset window', sales: 'city skyline through window, sunset, executive office',
  finance_senior: 'accounting office, ledgers, window light', finance_manager: 'finance office, charts on screens, dusk', finance: 'executive office, charts on screens, evening city lights',
  admin_senior: 'supply room, shelves and boxes, warm light', admin_manager: 'office building lobby, security desk, warm lights', admin: 'building rooftop at sunset, city, warm light',
  parttime: 'bright reception desk, lobby, flowers', guard: 'office building lobby, security desk, glass doors', barista: 'cozy cafe interior, espresso machine, warm light', courier: 'office lobby, daylight', contract: 'open-plan office, plants, bright window', cleaner: 'quiet office corridor, plain daylight',
  helpdesk: 'office IT desk close behind him, a monitor, daylight', macro: 'developer workspace, multiple monitors, code on screen, neon accents', dev_lead: 'developer workspace, monitors, night city window', cto: 'bright high-tech office, glass walls, holographic screens, daylight',
  intern_min: 'sunny office with sticky notes and plants', security_yang: 'bright office lobby gate, blue accent lights, daylight', mail_cho: 'office hallway with mailboxes, plain daylight', qa_lee: 'dim dev room, monitors with bug lists', reception_go: 'bright hotel-like lobby desk, flowers', trainer_seok: 'training room, whiteboard, morning light', translator_ji: 'international office, flags, airport window', secretary_yun: 'executive floor corridor, marble, morning', logistics_bae: 'warehouse with pallets, golden light', cdo: 'bright data centre, white and cyan holographic charts, soft front light', cco: 'bright customer lounge, flowers, warm light', chief_of_staff: 'executive office, sunrise, papers flying',
  chro: 'bright HR lounge, plants, warm morning light, bokeh',
  cso: 'strategy room, glass wall with galaxy-like data constellations, night', ai_lead: 'server room glowing mint, floating screens', union_chief: 'company courtyard, bright afternoon, banners', hacker: 'dim room with bright monitor glow on the face, cyan and magenta neon signs',
  hr_jung: 'bright HR office, bookshelves, plants', welfare: 'office break room, snacks, warm light', design_lead: 'design studio, soft colorful posters, bright daylight, bokeh', pm_lead: 'bright meeting room, sticky notes on a glass wall, morning light, bokeh', cmo: 'rooftop terrace at sunset, neon billboards, bokeh city lights',
  acct_lead: 'accounting office, paper stacks, calculator, window light', cfo: 'executive office, glowing stock charts, city lights at dusk, bokeh', audit_han: 'archive room, file cabinets, desk lamp', legal_yoon: 'law library, bookshelves, warm lamp',
  vlookup: 'data analytics office, large screens with charts', pivot: 'boardroom, long table, city view', ga_lead: 'supply storage room, shelves, boxes', sales_kang: 'business district street, glass towers, sunny',
  coo: 'executive floor, panoramic city window, golden hour, light particles', ceo: 'grand executive office, panoramic city skyline, golden light, sparkles', chairman: 'grand hall, marble, bright golden light, chandelier, sparkles', founder: 'sunset sky with soft clouds behind her, warm golden light, sparkles',
};
const BG_BY_GRADE = { D: 'modern office background, window light', C: 'bright office lobby background', B: 'meeting room background, plants', A: 'executive office background, city skyline, sunset', S: 'grand hall background, bright golden light, sparkles' };
/** Prologue panels (src/data/prologue.js). Landscape story art; the cast is incidental, the moment is the subject. */
const SCENES = {
  deadline: '1girl, a tired office worker in a white blouse sitting at her desk late at night, chin resting on her hand, monitors full of spreadsheets around her, paper stacks, dark office, city lights through the window behind her, warm desk lamp, face fully visible',
  meteor: '1boy, close up portrait of a young office worker in a white shirt, looking up with wide shocked eyes, his face lit orange from above, streaks of falling fire reflected in his glasses and in the dark office window behind him, night, face fully visible',
  impact: '1girl, an office worker crouching behind an overturned desk with one arm raised to shield her face, papers and shattered glass flying past her, a white shockwave and orange fire rising from the street far behind the window, detailed office interior, face fully visible',
  errors: '1girl, close up portrait of an office worker in a blouse, terrified expression with one hand over her mouth, red glowing error symbols and broken grid fragments reflected in her wide eyes and floating around her, dark street at dawn, red rim light, face fully visible',
  halo: '1boy, a young office worker in a white shirt looking up in wonder as a glowing golden halo ring forms above his head, soft golden light on his face, dust drifting in dawn light, ruined street behind him, upper body, face fully visible',
  awaken: '1boy, a young man in a white shirt and lanyard with a golden halo above his head, holding a glowing sword of light made from a keyboard, determined expression, golden energy aura, bright rim light, upper body, face fully visible',
  roster: '1boy, a young man with short black hair in a white shirt and lanyard, a golden halo above his head, holding a printed roster sheet with both hands, determined expression, bright office lobby with morning light behind him, upper body, face fully visible',
};
const SCENE_STYLE = 'blue archive style, anime key visual, flat color, cel shading, clean lineart, anime coloring, vivid pastel colors, depth of field, cinematic composition, soft even front lighting, bright face, masterpiece, best quality, very aesthetic, absurdres';
const SCENE_NEG = 'lowres, bad anatomy, bad hands, extra digit, text, watermark, signature, username, worst quality, low quality, jpeg artifacts, 3d, realistic, photo, retro poster, woodblock print, monochrome, empty room, no people, faceless, back view, gore, blood, nsfw';
const HALO_SCENES = new Set(['halo', 'awaken', 'roster']); // the ring only exists from the fifth panel on
export const scenePrompt = (id) => `${SCENES[id] ?? id}, ${HALO_SCENES.has(id) ? 'halo, ' : ''}${SCENE_STYLE}`;
export const sceneNeg = (id) => (HALO_SCENES.has(id) ? SCENE_NEG : `angel halo above head, glowing ring above head, ${SCENE_NEG}`);

// The negatives split, because CUTOUT needs the opposite of what the painted cards need.
//
// NEG_BASE currently forbids `full body`, `legs`, `feet`, `standing full figure` and `close-up` —
// which is right for a waist-up card and is exactly what a standing figure requires. Those bans
// are dropped under CUTOUT and replaced with bans on the SCENERY, because anything painted behind
// the character is something tools/cutout.py cannot key away.
const NEG_BASE = 'thick outlines, heavy lineart, bold black outlines, sketchy lines, rough linework, six fingers, extra fingers, fused fingers, malformed hands, deformed hand, too many fingers, long fingers, picture frame, ornate frame, gold frame, border, framed painting, window frame, rectangular border, poster, canvas edge, inset panel, vignette border, overwhelming background effects, character off center, character at the edge of frame, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, cropped head, head out of frame, top of head cut off, hair touching the top edge of the image, close-up, legs, knees, feet, shoes, standing full figure, hair over eyes, covered face, hand over face, face mask, surgical mask, mouth mask, scarf over face, veil, covered mouth, backlighting, silhouette, dark face, shadowed face, low key lighting, full body, wide shot, distant, small face, tiny face, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry face, 3d, realistic, photo, multiple views, stiff symmetrical frontal pose, mugshot, id photo, busy background, cluttered background, high contrast background, nsfw';
const NEG_CUTOUT = 'thick outlines, heavy lineart, bold black outlines, sketchy lines, rough linework, six fingers, extra fingers, fused fingers, malformed hands, deformed hand, too many fingers, long fingers, picture frame, ornate frame, gold frame, border, framed painting, window frame, rectangular border, poster, canvas edge, inset panel, vignette border, overwhelming background effects, character off center, character at the edge of frame, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, cropped head, head out of frame, top of head cut off, hair touching the top edge of the image, hair over eyes, covered face, hand over face, face mask, surgical mask, mouth mask, scarf over face, veil, covered mouth, backlighting, silhouette, dark face, shadowed face, low key lighting, small face, tiny face, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry face, 3d, realistic, photo, multiple views, stiff symmetrical frontal pose, mugshot, id photo, busy background, cluttered background, high contrast background, nsfw, background details, office background, furniture, desk, window, city, skyline, plants, wall, floor, ground, shadow on the ground, drop shadow, gradient background, textured background, patterned background, scenery, indoors, outdoors, cast shadow, ground shadow, shadow under feet, speed lines, motion lines, floor lines';
// The wing is ONE, on ONE shoulder, and is not a bird. Every one of those has to be said:
// 'a single wing' in the positive prompt is routinely answered with a symmetric pair.
/**
 * ART=ba2 — the prompt in the order and vocabulary Animagine XL 4.0 was trained on:
 *   count → COPYRIGHT → subject → shot → style → quality.
 * The copyright tag ("blue archive") near the front is what carries a game's house look; at the
 * end of a long prompt it was one tag among eighty. Its quality ladder is "high score, great score"
 * with "newest" for the current style — "best quality, very aesthetic" are the previous
 * generation's tags. And the reference's look is NOT flat colour: soft two-step cel shading, big
 * glossy eyes, bright hair highlights, so "flat color" goes and those go in.
 */
export const ART = process.env.ART ?? 'ba1';
// 'official art, game cg' and a rim light pulled in a grey studio gradient that the flood could
// not remove; 'white background, simple background' are the tags this model reads for a blank.
const BA2_STYLE = 'blue archive, white background, simple background, soft cel shading, bright clean colors, large sparkling detailed eyes, glossy hair highlights, clean thin lineart';
const BA2_QUALITY = 'masterpiece, high score, great score, absurdres, newest';
const BA2_NEG = 'low score, bad score, average score, worst quality, low quality, old, early, sketch, flat color, monochrome, muted colors, realistic, gradient background, grey background, beige background, studio backdrop, vignette, shadow, drop shadow, open shirt, unbuttoned shirt, bare chest, cleavage, navel, midriff';
const NEG = (CUTOUT ? NEG_CUTOUT : NEG_BASE) + ', ' + BACK_NEG + (ART === 'ba2' ? ', ' + BA2_NEG : '');
/** 낮은 등급에 연출이 붙지 않게 — 긍정 프롬프트가 아니라 네거티브로 막아야 구도가 살아남는다. */
const PLAIN_NEG = 'glowing aura, magic effects, light particles, sparkles, gold trim, dramatic rim light, neon lights, energy glow, floating holograms';
export const negFor = (grade) => (grade === 'D' || grade === 'C' ? `${PLAIN_NEG}, ${NEG}` : NEG);
// ponytail and twin were missing here, and the fallback below is `?? 'short hair'` — so
// 인턴 민지's twin tails and two ponytails were not merely undescribed, they were drawn as
// SHORT HAIR. A dictionary with a plausible default fails louder than one that drops the
// key, because the wrong answer looks like an answer.
// `grey` and `cap` are gone from the shape slot: grey is a COLOUR that collides
// with palette.H (CFO came out as "white hair, grey hair") and a cap is headwear.
// Twelve values were really nine shapes for 55 characters.
const HAIR = { ponytail: 'ponytail', twin: 'twin tails', braid: 'braided hair', lowbun: 'low bun', undercut: 'undercut', wavy: 'wavy hair', bangs: 'straight bangs', halfup: 'half-up hair', messy: 'messy hair', pixie: 'pixie cut', sidetail: 'side ponytail', hime: 'hime cut', slicked: 'slicked-back hair', shaggy: 'shaggy hair', short: 'short hair', bob: 'bob cut', grey: 'grey hair', bun: 'hair bun', cap: 'baseball cap', side: 'swept bangs', bald: 'bald', spiky: 'spiked hair', long: 'long hair', curly: 'curly hair' };
// Thirteen keys used by heroes.js were missing from this map and `.filter(Boolean)` threw
// them away in silence: headband megaphone ribbon notebook cap bag mic whistle book
// planner gloves boxes stamp. Those characters were generated without the props that
// define them, and the model filled the gap with whatever it liked.
const ACC = { headband: 'headband', megaphone: 'holding megaphone', ribbon: 'hair ribbon', notebook: 'holding notebook', cap: 'baseball cap', bag: 'shoulder bag', mic: 'holding microphone', whistle: 'whistle', book: 'holding book', planner: 'holding planner', gloves: 'gloves', boxes: 'stack of boxes', stamp: 'holding stamp', tie: 'necktie', headset: 'headset', mustache: 'mustache', hardhat: 'hardhat', coffee: 'holding coffee cup', badge: 'name tag', lanyard: 'lanyard', glasses: 'glasses', beard: 'beard', clipboard: 'holding clipboard', earring: 'earrings', sunglasses: 'sunglasses', flower: 'hair flower', scarf: 'scarf', crown: 'crown', files: 'holding folder', apron: 'apron', radio: 'walkie-talkie', parcel: 'holding box', phone: 'holding phone', pen: 'holding pen', suspenders: 'suspenders', hoodie: 'hoodie', magnifier: 'magnifying glass', calculator: 'calculator', ledger: 'holding book', watch: 'wristwatch', briefcase: 'briefcase', cane: 'cane', laptop: 'laptop', mop: 'holding mop', tablet: 'drawing tablet' };
const ROLE = { tank: 'confident, arms crossed', melee: 'energetic, clenched hand, sleeves rolled up', ranged: 'playful, one hand up', healer: 'gentle smile, hands together' };
/** Rank through the clothes, not through light in the air — see GRADE_CUTOUT below. */
const GRADE = { D: 'plain everyday office wear, neat and simple, natural daylight, calm friendly expression, beautiful detailed face', C: 'business casual, id card, neat and tidy, soft daylight, beautiful detailed face', B: 'team leader look, refined details, soft light particles, beautiful detailed face', A: 'executive, luxurious details, gold accents, sparkles, light particles, beautiful detailed face', S: 'legendary executive, gold trim, sparkles, light particles, glowing, beautiful detailed face' };
/** Cutout mode: the same ladder with every off-body effect removed. Tailoring carries the rank. */
const GRADE_CUTOUT = { D: 'plain everyday office wear, neat and simple, calm friendly expression, beautiful detailed face', C: 'business casual, id card, neat and tidy, beautiful detailed face', B: 'team leader look, refined tailoring, crisp collar and cuffs, beautiful detailed face', A: 'executive tailoring, luxurious fabric, gold trim on the collar and cuffs, ornate buttons, beautiful detailed face', S: 'legendary executive tailoring, gold embroidery on collar and cuffs, gold trim, ornate buttons, beautiful detailed face' };
const TIER = CUTOUT ? GRADE_CUTOUT : GRADE;

function colorName(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) return l > 0.85 ? 'white' : l > 0.6 ? 'silver' : l > 0.3 ? 'grey' : 'black';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const name = h < 15 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'blonde' : h < 160 ? 'green' : h < 200 ? 'aqua' : h < 250 ? 'blue' : h < 290 ? 'purple' : h < 335 ? 'pink' : 'red';
  if ((name === 'orange' || name === 'red' || name === 'blonde') && l < 0.35) return 'brown'; // dark warm tones read as brown hair, not orange
  return (l > 0.72 ? 'light ' : l < 0.3 ? 'dark ' : '') + name;
}
/** Character description only (who / hair / accessories / outfit / role) — shared by the card and pixel-sprite prompts. */
export function describe(def, profileId, outfitOverride = null) {
  const p = PROFILES[profileId] ?? {}; const look = def.look ?? {}; const pal = def.palette ?? {};
  const who = p.gender === 'F' ? '1girl, solo' : '1boy, solo, male focus';
  const outfitText = outfitOverride ?? OUTFIT_BY_ID[def.id] ?? '';
  // The outfit line sometimes names the hair itself ("short black bob with a cyan streak"). Two
  // hair descriptions in one prompt make the model pick one or blend them — the hacker came out
  // with an undercut AND a bob — so the hand-written one wins and the derived one steps aside.
  const outfitNamesHair = /\b(hair|bob|ponytail|twin tails|bun|braid|bald|pixie|undercut)\b/i.test(outfitText);
  const outfitNamesHairColor = /\b(black|white|silver|grey|gray|brown|blonde|blond|red|pink|blue|green|purple|lavender|mint|platinum|orange|navy)\b[\w\s-]{0,14}\b(hair|bob|ponytail|twin tails|bun|braid)\b/i.test(outfitText);
  const hairColor = look.hair === 'bald' ? 'bald' : `${colorName(pal.H ?? '#3b2a1a')} hair`;
  const hair = outfitNamesHairColor ? '' : outfitNamesHair ? hairColor
             : look.hair === 'bald' ? 'bald' : `${hairColor}, ${HAIR[look.hair] ?? 'short hair'}`;
  const outfit = outfitOverride ? `${outfitOverride}, ${TIER[def.grade]}` : OUTFIT_BY_ID[def.id] ? `${OUTFIT_BY_ID[def.id]}, ${TIER[def.grade]}` : `${TIER[def.grade]}, ${colorName(pal.B ?? '#dfe6e9')} jacket`;
  const bits = outfitOverride || OUTFIT_BY_ID[def.id] ? '' : [ACC[look.acc], ACC[look.acc2], ACC[look.prop]].filter(Boolean).join(', ');
  // build, feature and hobby were in the data and never reached the model. The feature is the
  // one thing that makes this character rather than a person in the same job — it goes in.
  const body = BUILD_EN[def.role] ?? '';
  // Only an English feature reaches the model: SDXL reads English and Danbooru tags, and a
  // Korean sentence in the prompt is noise that crowds out tags it can read. featureEn is
  // optional; until a character has one, its feature stays in the document only.
  const mark = p.featureEn ? `, ${p.featureEn}` : '';
  return `${who}, ${hair ? hair + ', ' : ''}${bits ? bits + ', ' : ''}${outfit}, ${body}, ${ROLE[def.role]}${mark}`;
}
const SKIN_BG = { casual: 'cafe window close behind him, warm evening lights, bokeh', formal: 'warm party lights close behind him, soft golden bokeh' };
export function prompt(def, profileId, skin = null) {
  const desc = describe(def, profileId, skin?.prompt ?? null);
  const head = 'looking at viewer, face fully visible, eyes visible, whole head in frame with clear empty space above the hair, face focus, soft even front lighting, bright face';

  if (CUTOUT) {
    // No 'face focus' here: it pulls the camera in while 'full body' pushes it out, and the
    // model settles the argument by cutting the head off (the first CFO test did exactly that).
    const headFull = head.replace(', face focus', '');
    if (ART === 'ba2') {
      // Split the count tags off the front of the description so the copyright can sit behind them.
      const m = desc.match(/^(1girl, solo|1boy, solo, male focus)(, )?/);
      const who = m ? m[1] : '';
      const rest = m ? desc.slice(m[0].length) : desc;
      return `${who}, ${BA2_STYLE}, ${rest}, ${poseTag(def.id, desc)}, ${headFull}, ${CUTOUT_SHOT}, `
           + `${BACK_CLEAR}, ${CUTOUT_BG}, ${BA2_QUALITY}`;
    }
    return `${desc}, ${poseTag(def.id, desc)}, ${headFull}, ${CUTOUT_SHOT}, ${BACK_CLEAR}, `
         + `${CUTOUT_BG}, ${STYLE_TAGS}, masterpiece, best quality, very aesthetic, absurdres`;
  }

  const bg = skin ? SKIN_BG[skin.id] ?? BG_BY_GRADE[def.grade] : BG_BY_ID[def.id] ?? BG_BY_ID[profileId] ?? BG_BY_GRADE[def.grade];
  return `${desc}, ${poseTag(def.id, desc)}, ${head}, medium shot, upper body, waist up, `
       + `${BACK_CLEAR}, ${bg} (soft, out of focus), ${STYLE_TAGS}, masterpiece, best quality, very aesthetic, absurdres`;
}

// Optional Hugging Face token (HF_TOKEN env or a .hf_token file next to package.json, git-ignored): a logged-in
// user gets a far larger ZeroGPU quota than anonymous callers, which is what stalls long batches.
const tokenFile = new URL('../.hf_token', import.meta.url);
// Quota pools: every token in .hf_token (one) and .hf_tokens (one per line, git-ignored) is a separate ZeroGPU pool, and the
// anonymous per-IP quota is one more. On a quota error the script rotates to the next pool instead of waiting.
// HF_ANON=1 → anonymous only. HF_TOKEN env → that token first. Tokens are never printed.
const tokensFile = new URL('../.hf_tokens', import.meta.url);
const TOKEN_POOL = process.env.HF_ANON ? [''] : [...new Set([
  process.env.HF_TOKEN ?? (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : ''),
  ...(fs.existsSync(tokensFile) ? fs.readFileSync(tokensFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []),
].filter(Boolean)), '']; // '' = anonymous, always last
let poolIdx = 0;
const HF_TOKEN = TOKEN_POOL[0];
let AUTH = HF_TOKEN ? { authorization: `Bearer ${HF_TOKEN}` } : {};
const poolName = () => (TOKEN_POOL[poolIdx] ? `token #${poolIdx + 1}` : 'anonymous');
/** Switch to the next quota pool; returns false when every pool has been tried this round. */
export function rotatePool() { if (poolIdx + 1 >= TOKEN_POOL.length) return false; poolIdx++; AUTH = TOKEN_POOL[poolIdx] ? { authorization: `Bearer ${TOKEN_POOL[poolIdx]}` } : {}; return true; }
export const poolCount = () => TOKEN_POOL.length;

/** Alternative to the Space: HF serverless Inference Providers (needs a token with the "Inference Providers" permission;
 *  free accounts get a small monthly credit). Set HF_MODE=api to route callGenerate here. */
export async function callInference(text, seed, { width = 832, height = 1216, neg = NEG, steps = 28, model = process.env.HF_MODEL ?? 'cagliostrolab/animagine-xl-4.0' } = {}) {
  if (!HF_TOKEN) throw new Error('HF_MODE=api needs a token (.hf_token) with Inference Providers permission');
  const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, { method: 'POST', headers: { 'content-type': 'application/json', ...AUTH }, body: JSON.stringify({ inputs: text, parameters: { negative_prompt: neg, width, height, num_inference_steps: steps, guidance_scale: 5, seed } }), signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error(`inference ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const ct = r.headers.get('content-type') ?? ''; if (!ct.startsWith('image/')) throw new Error('inference returned ' + ct);
  return Buffer.from(await r.arrayBuffer());
}
let fnIndex = null;
export async function callGenerate(text, seed, { width = 832, height = 1216, style = 'Anim4gine', neg = NEG, steps = 28 } = {}) {
  if (process.env.HF_MODE === 'api') return callInference(style === 'Pixel art' ? `pixel art, ${text}` : text, seed, { width, height, neg, steps });
  const data = [text, neg, seed, width, height, 5, steps, 'Euler a', `${width} x ${height}`, style, false, 0.55, 1.5, true];
  // Gradio queue protocol (the /call shortcut swallows error text). fn_index of the 'generate' endpoint is read from /config once.
  fnIndex ??= (await (await fetch(`${BASE}/config`, { headers: AUTH })).json()).dependencies.findIndex((d) => d.api_name === 'generate');
  const session_hash = Math.random().toString(36).slice(2);
  const r = await fetch(`${BASE}/queue/join`, { method: 'POST', headers: { 'content-type': 'application/json', ...AUTH }, body: JSON.stringify({ data, fn_index: fnIndex, session_hash, trigger_id: null }) });
  if (!r.ok) throw new Error(`join ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const ev = await fetch(`${BASE}/queue/data?session_hash=${session_hash}`, { headers: AUTH, signal: AbortSignal.timeout(300000) });
  const reader = ev.body.getReader(); const dec = new TextDecoder(); let buf = '', out = null;
  outer: while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const m = JSON.parse(line.slice(5));
      if (m.msg === 'process_completed') { if (m.output?.error !== undefined || !m.success) throw new Error(`space: ${String(m.output?.error ?? 'failed').slice(0, 300)}`); out = m.output.data; break outer; }
      if (m.msg === 'close_stream') break outer;
    }
  }
  if (!out) throw new Error('stream closed without a result');
  const img = out[0]?.[0]?.image ?? out[0]?.[0];
  if (process.env.DEBUG) console.log('image object:', JSON.stringify(img).slice(0, 400));
  const candidates = [img?.url, img?.path && `${BASE}/gradio_api/file=${img.path}`, img?.path && `${BASE}/file=${img.path}`].filter(Boolean);
  if (!candidates.length) throw new Error('no image in response: ' + JSON.stringify(out).slice(0, 200));
  let ir = null; for (const u of candidates) { ir = await fetch(u); if (ir.ok) break; if (process.env.DEBUG) console.log('image fetch', ir.status, u); }
  if (!ir?.ok) throw new Error(`image ${ir?.status}`);
  return Buffer.from(await ir.arrayBuffer());
}

/** Rebuild assets/cards/manifest.json from the files on disk: png (generated art) > svg (vector placeholder). */
export function rebuildManifest() {
  const outDir = new URL('../assets/cards/', import.meta.url); const cards = {};
  const baseIds = [...HEROES.map((h) => h.id), ...Object.values(MAIN_JOBS).map((j) => j.id)];
  for (const id of [...baseIds, ...baseIds.flatMap((b) => (SKINS[b] ?? []).map((sk) => `${b}__${sk.id}`))]) {
    if (fs.existsSync(new URL(`${id}.png`, outDir))) cards[id] = fs.existsSync(new URL(`thumb/${id}.webp`, outDir)) ? { file: `${id}.png`, thumb: `thumb/${id}.webp` } : `${id}.png`; // thumb: drawn on cards; file: lightbox / splash
    else if (fs.existsSync(new URL(`${id}.svg`, outDir))) cards[id] = `${id}.svg`;
  }
  // build stamp = newest art file on disk; it only changes when an illustration does, so caches stay warm otherwise
  let newest = 0;
  for (const f of fs.readdirSync(outDir)) { if (!/\.(png|webp|svg)$/i.test(f)) continue; const t = fs.statSync(new URL(f, outDir)).mtimeMs; if (t > newest) newest = t; }
  const thumbDir = new URL('thumb/', outDir);
  if (fs.existsSync(thumbDir)) for (const f of fs.readdirSync(thumbDir)) { const t = fs.statSync(new URL(f, thumbDir)).mtimeMs; if (t > newest) newest = t; }
  fs.writeFileSync(new URL('manifest.json', outDir), JSON.stringify({ version: Math.round(newest / 1000), cards }, null, 2) + '\n');
  return cards;
}

const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain && process.argv.includes('--manifest')) {
  const cards = rebuildManifest();
  console.log(`manifest: ${Object.keys(cards).length} cards (${Object.values(cards).filter((f) => (typeof f === 'string' ? f : f.file).endsWith('.png')).length} png, ${Object.values(cards).filter((f) => f.thumb).length} thumbs)`);
} else if (isMain) {
  const args = process.argv.slice(2); const force = args.includes('--force'); const ids = args.filter((a) => !a.startsWith('--'));
  const seed = Number(process.env.SEED ?? 1);
  const sceneMode = args.includes('--scene');
  const skinMode = args.includes('--skin');
  const baseDefs = [...HEROES.map((h) => [h.id, h, h.id]), ...Object.values(MAIN_JOBS).map((j) => [j.id, j, 'main'])];
  const defs = sceneMode
    ? PROLOGUE.map((sc) => [sc.id, null, null, null]).filter(([id]) => !ids.length || ids.includes(id))
    : skinMode
    ? baseDefs.filter(([id, , pid]) => ids.length ? ids.includes(id) : pid !== 'main').flatMap(([id, def, pid]) => (SKINS[id] ?? []).map((sk) => [`${id}__${sk.id}`, def, pid, sk])) // heroes only by default (main jobs: pass ids)
    : baseDefs.filter(([id]) => !ids.length || ids.includes(id));
  // Cutout art goes to its own folder and never touches the live cards or their manifest: it is
  // the replacement being built, and the game keeps showing the old art until it is complete.
  const outDir = new URL(sceneMode ? '../assets/story/' : CUTOUT ? '../assets/cards_cutout/' : '../assets/cards/', import.meta.url); const manifestPath = new URL('manifest.json', new URL('../assets/cards/', import.meta.url));
  if (sceneMode || CUTOUT) fs.mkdirSync(outDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let ok = 0;
  for (const [id, def, pid, skin = null] of defs) {
    const file = `${id}${process.env.OUT_SUFFIX ?? ''}.png`; const target = new URL(file, outDir);
    if (!force && fs.existsSync(target)) { console.log(`skip ${id}`); ok++; continue; } // (manifest entries may be { file, thumb } objects)
    const text = sceneMode ? scenePrompt(id) : prompt(def, pid, skin);
    // ZeroGPU quota: the Space answers "You have exceeded your free ZeroGPU quota (90s requested vs. Ns left). Try again in H:MM:SS" — wait that long.
    // Each image needs 90 s of quota; the account quota and the anonymous per-IP quota (HF_ANON=1) are separate pools.
    const maxAttempts = Number(process.env.MAX_ATTEMPTS ?? 12), quotaWait = Number(process.env.QUOTA_WAIT_MS ?? 240000);
    let soonestReset = Infinity; // ms until the first pool refills, across the pools tried in this rotation
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const size = CUTOUT && ART === 'ba2' ? { width: 768, height: 1344 } : {};
        const buf = await callGenerate(text, seed + id.length, sceneMode ? { width: 1216, height: 832, neg: sceneNeg(id) } : { ...size, neg: negFor(def?.grade) });
        fs.writeFileSync(target, buf);
        if (!sceneMode && !CUTOUT) { manifest.cards[id] = file; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); }
        console.log(`ok   ${id} ${(buf.length / 1024).toFixed(0)} KB  ${new Date().toLocaleTimeString()}`); ok++; break;
      } catch (e) { const quota = /quota|event error/i.test(e.message); const congested = /No GPU was available/i.test(e.message); const m = e.message.match(/Try again in (\d+):(\d\d):(\d\d)/); const asked = m ? ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + 30) * 1000 : 0; if (asked) soonestReset = Math.min(soonestReset, asked); const rotated = (quota || congested) && rotatePool(); const wait = rotated ? 2000 : quota ? (Number.isFinite(soonestReset) ? soonestReset : quotaWait) : 15000; if (!rotated) soonestReset = Infinity; console.log(`retry ${id} (${attempt}): ${e.message}${rotated ? ` — switching to ${poolName()}` : quota ? ` — every pool is short of the 90 s an image costs; waiting ${(wait / 60000).toFixed(0)} min for the first one to refill` : congested ? ' — every pool is congested; waiting 15 s' : ''}`); if (quota && !rotated) poolIdx = 0, AUTH = TOKEN_POOL[0] ? { authorization: `Bearer ${TOKEN_POOL[0]}` } : {}; await new Promise((r) => setTimeout(r, wait)); } // (was: 15000)); }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`done: ${ok}/${defs.length} (quota pools: ${poolCount()})`);
}
