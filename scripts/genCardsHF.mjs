// Generate card illustrations with an anime-specialised model (Animagine XL 4.0) running as a public Hugging Face
// Space (Gradio API, anonymous ZeroGPU quota). Danbooru-tag prompts in a Blue Archive-like look.
// Usage:
//   node scripts/genCardsHF.mjs ceo coo hr_jung      # given ids
//   node scripts/genCardsHF.mjs                      # every hero/job without a png yet
//   node scripts/genCardsHF.mjs --force ceo          # regenerate
//   node scripts/genCardsHF.mjs --skin [ceo …]       # skin illustrations <id>__casual.png / <id>__formal.png (heroes only unless ids given)
//   SEED=3 SPACE=asahina2k-animagine-xl-4-0 node scripts/genCardsHF.mjs ...
import fs from 'node:fs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';
import { SKINS } from '../src/data/skins.js';
import { PROFILES } from '../src/data/profiles.js';

const SPACE = process.env.SPACE ?? 'asahina2k-animagine-xl-4-0';
const BASE = `https://${SPACE}.hf.space`;
const STYLE_TAGS = 'blue archive style, halo, flat color, cel shading, clean lineart, anime coloring, vivid pastel colors, soft blurred background, muted simple background, depth of field, character focus';
/** Backgrounds: by character (department flavour), else by grade. Kept bright and readable behind a bust/cowboy shot. */
const BG_BY_ID = {
  main: 'modern office, cubicles, computer monitors, morning light', intern: 'modern office, cubicles, morning light', staff: 'modern office, desks, window light',
  sales_senior: 'sales floor, phones, afternoon light', sales_manager: 'meeting room, sales chart on whiteboard, sunset window', sales: 'city skyline through window, sunset, executive office',
  finance_senior: 'accounting office, ledgers, window light', finance_manager: 'finance office, charts on screens, dusk', finance: 'executive office, charts on screens, evening city lights',
  admin_senior: 'supply room, shelves and boxes, warm light', admin_manager: 'office building lobby, security desk, warm lights', admin: 'building rooftop at sunset, city, warm light',
  parttime: 'bright reception desk, lobby, flowers', guard: 'office building lobby, security desk, glass doors', barista: 'cozy cafe interior, espresso machine, warm light', courier: 'open delivery van door, parcels, sunny, close-up background', contract: 'open-plan office, plants, bright window', cleaner: 'quiet office corridor at dawn, soft light',
  helpdesk: 'server room, blue lights, cables', macro: 'developer workspace, multiple monitors, code on screen, neon accents', dev_lead: 'developer workspace, monitors, night city window', cto: 'bright high-tech office, glass walls, holographic screens, daylight',
  intern_min: 'sunny office with sticky notes and plants', security_yang: 'bright office lobby gate, blue accent lights, daylight', mail_cho: 'office hallway with mailboxes, motion blur', qa_lee: 'dim dev room, monitors with bug lists', reception_go: 'bright hotel-like lobby desk, flowers', trainer_seok: 'training room, whiteboard, morning light', translator_ji: 'international office, flags, airport window', secretary_yun: 'executive floor corridor, marble, morning', logistics_bae: 'warehouse with pallets, golden light', cdo: 'bright data centre, white and cyan holographic charts, soft front light', cco: 'bright customer lounge, flowers, warm light', chief_of_staff: 'executive office, sunrise, papers flying',
  cso: 'strategy room, glass wall with galaxy-like data constellations, night', ai_lead: 'server room glowing mint, floating screens', union_chief: 'company courtyard, bright afternoon, banners', hacker: 'dim room with bright monitor glow on the face, cyan and magenta neon signs',
  hr_jung: 'bright HR office, bookshelves, plants', welfare: 'office break room, snacks, warm light', design_lead: 'design studio, drawing tablets, colorful posters', pm_lead: 'meeting room, sticky notes on glass wall', cmo: 'marketing office, billboards visible through window, sunset',
  acct_lead: 'accounting office, paper stacks, calculator, window light', cfo: 'executive office, stock charts, evening city lights', audit_han: 'archive room, file cabinets, desk lamp', legal_yoon: 'law library, bookshelves, warm lamp',
  vlookup: 'data analytics office, large screens with charts', pivot: 'boardroom, long table, city view', ga_lead: 'supply storage room, shelves, boxes', sales_kang: 'business district street, glass towers, sunny',
  coo: 'executive floor, panoramic city window, golden hour', ceo: 'grand executive office, panoramic city skyline, golden light, sparkles', chairman: 'grand hall, marble, bright golden light, chandelier, sparkles', founder: 'startup garage loft, whiteboard, warm sunset light, sparkles',
};
const BG_BY_GRADE = { D: 'modern office background, window light', C: 'bright office lobby background', B: 'meeting room background, plants', A: 'executive office background, city skyline, sunset', S: 'grand hall background, bright golden light, sparkles' };
const NEG = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, cropped head, head out of frame, close-up, hair over eyes, covered face, hand over face, backlighting, silhouette, dark face, shadowed face, low key lighting, full body, wide shot, distant, small face, tiny face, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry face, 3d, realistic, photo, multiple views, busy background, cluttered background, high contrast background, nsfw';
const HAIR = { short: 'short hair', bob: 'bob cut', grey: 'grey hair', bun: 'hair bun', cap: 'baseball cap', side: 'swept bangs', bald: 'bald', spiky: 'spiked hair', long: 'long hair', curly: 'curly hair' };
const ACC = { tie: 'necktie', headset: 'headset', mustache: 'mustache', hardhat: 'hardhat', coffee: 'holding coffee cup', badge: 'name tag', lanyard: 'lanyard', glasses: 'glasses', beard: 'beard', clipboard: 'holding clipboard', earring: 'earrings', sunglasses: 'sunglasses', flower: 'hair flower', scarf: 'scarf', crown: 'crown', files: 'holding folder', apron: 'apron', radio: 'walkie-talkie', parcel: 'holding box', phone: 'holding phone', pen: 'holding pen', suspenders: 'suspenders', hoodie: 'hoodie', magnifier: 'magnifying glass', calculator: 'calculator', ledger: 'holding book', watch: 'wristwatch', briefcase: 'briefcase', cane: 'cane', laptop: 'laptop', mop: 'holding mop', tablet: 'drawing tablet' };
const ROLE = { tank: 'confident, arms crossed', melee: 'energetic, clenched hand, sleeves rolled up', ranged: 'playful, one hand up', healer: 'gentle smile, hands together' };
const GRADE = { D: 'casual office wear', C: 'business casual, id card', B: 'team leader look, refined details', A: 'executive, luxurious details', S: 'legendary executive, gold trim, sparkles, light particles, glowing' };
/** Per-character outfits so the roster does not read as 34 copies of one suit (women especially). */
const OUTFIT_BY_ID = {
  parttime: 'reception uniform, vest, ribbon tie, pleated skirt', barista: 'striped shirt, brown barista apron, rolled sleeves, hair tied', contract: 'oversized beige cardigan, blouse, pleated skirt, sneakers',
  hr_jung: 'teal blazer, white blouse, pencil skirt, earrings', acct_lead: 'black turtleneck, high-waist trousers, glasses', welfare: 'pastel knit sweater, long skirt, scarf', coo: 'sharp navy pantsuit, gold buttons, heels',
  ceo: 'white long coat over black dress, gold accents, small sunglasses, pale skin, brightly lit face, confident smile', helpdesk: 'hoodie over collared shirt, headset, sneakers', cleaner: 'work jumpsuit, headscarf, rubber gloves, mop', legal_yoon: 'black long coat, white collar, thin glasses',
  pm_lead: 'denim jacket over blouse, sticky notes, lanyard', design_lead: 'colorful paint-splattered smock, beret, drawing tablet', cmo: 'trendy red dress suit, sunglasses pushed up, statement earrings',
  intern_seo: 'oversized cardigan, lanyard, sneakers, tablet', pr_yoo: 'bomber jacket, mini skirt, press badge, smartphone', nurse_han: 'white nurse uniform, nurse cap, clipboard', lab_park: 'white lab coat over sweater, glasses, laptop',
  intern_min: 'pastel pink cardigan over white blouse, twin tails with ribbons, notebook hugged to chest, bright cheerful smile', security_yang: 'navy security uniform, black ponytail, radio on shoulder, serious but kind eyes', mail_cho: 'blue postal jacket, backwards cap, mail bag, running pose, grin', qa_lee: 'dark purple hoodie, navy bob, round glasses, laptop covered in stickers, deadpan', reception_go: 'coral blazer, long brown hair, headset, holding a microphone, warm smile', trainer_seok: 'orange coach vest over white shirt, whistle, clipboard, energetic', translator_ji: 'beige trench coat, long silver-blue hair, book, elegant', secretary_yun: 'charcoal pencil suit, black hair bun, gold earrings, leather planner, composed', logistics_bae: 'grey work jacket, orange gloves, stacked boxes, sturdy, friendly', cdo: 'black suit with cyan accents, long black hair with a blue streak tucked behind ear, face fully visible, bright cyan eyes, holographic charts, cool confident gaze, front lighting', cco: 'coral suit, pink bob, headset phone, radiant smile, flowers', chief_of_staff: 'white and gold executive suit, platinum long ponytail, stamp in hand, sharp confident smile, speed lines',
  cso: 'white and navy executive suit dress, lavender long wavy hair, star earrings, holographic tablet, serene confident smile', ai_lead: 'white lab coat over mint blouse, long mint hair, round glasses, floating holographic screens, soft smile', union_chief: 'red jacket with white armband, black spiky hair, megaphone, broad grin, muscular', hacker: 'black oversized hoodie, neon cyan headset, short black bob with cyan streak, pale skin, face lit by screen glow, bright eyes, laptop, playful smirk',
  chro: 'elegant mauve suit dress, pearl earrings, folder', chairwoman: 'black formal gown-style suit, silver hair, small crown, cane',
  staff_park: 'white shirt sleeves rolled, loosened tie, lanyard', guard: 'navy security uniform, cap, radio', courier: 'orange delivery uniform, cap, gloves, parcel', vlookup: 'vest over shirt, glasses, pen',
  pivot: 'suspenders, shirt, bald, beard', macro: 'dark hoodie, headphones, laptop', audit_han: 'trench coat, sunglasses, magnifying glass', dev_lead: 'flannel shirt, headset, coffee cup', ga_lead: 'grey work vest, gloves, boxes',
  cfo: 'three-piece purple suit, pocket watch, glasses', cto: 'black turtleneck under blazer, sunglasses', chairman: 'golden formal suit, cane, crown, beard', founder: 'hoodie under blazer, sneakers, glasses', sales_kang: 'sharp navy suit, red tie, briefcase',
  // main hero: the SAME young man in every job (short black hair, light skin, clean-shaven) — only the outfit climbs with the tier
  intern: 'young man, short black hair, white shirt, lanyard, files', staff: 'young man, short black hair, light blue shirt, tie, phone',
  sales_senior: 'young man, short black hair, white shirt with rolled sleeves, red necktie, red lanyard, holding phone, confident grin', sales_manager: 'young man, short black hair, dark red blazer over white shirt, red necktie, briefcase, confident', sales: 'young man, short black spiky hair, red suit, sunglasses, briefcase',
  finance_senior: 'young man, short black hair, navy vest over mint shirt, teal necktie, glasses, holding calculator, calm', finance_manager: 'young man, short black hair, teal suit, glasses, tablet with charts, composed', finance: 'young man, short black hair, teal suit, glasses, calculator',
  admin_senior: 'young man, short black hair, orange work vest over white shirt, work gloves, clipboard, friendly', admin_manager: 'young man, short black hair, orange work jacket, yellow hardhat, walkie-talkie, reliable', admin: 'young man, short black hair, orange and gold executive work coat, yellow hardhat under arm, walkie-talkie, steady smile',
};

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
  const hair = look.hair === 'bald' ? 'bald' : `${colorName(pal.H ?? '#3b2a1a')} hair, ${HAIR[look.hair] ?? 'short hair'}`;
  const outfit = outfitOverride ? `${outfitOverride}, ${GRADE[def.grade]}` : OUTFIT_BY_ID[def.id] ? `${OUTFIT_BY_ID[def.id]}, ${GRADE[def.grade]}` : `${GRADE[def.grade]}, ${colorName(pal.B ?? '#dfe6e9')} jacket`;
  const bits = outfitOverride || OUTFIT_BY_ID[def.id] ? '' : [ACC[look.acc], ACC[look.acc2], ACC[look.prop]].filter(Boolean).join(', ');
  return `${who}, ${hair}, ${bits ? bits + ', ' : ''}${outfit}, ${ROLE[def.role]}`;
}
const SKIN_BG = { casual: 'city street at dusk, cafe lights, after work', formal: 'company anniversary hall, banners, warm chandelier light' };
export function prompt(def, profileId, skin = null) {
  const bg = skin ? SKIN_BG[skin.id] ?? BG_BY_GRADE[def.grade] : BG_BY_ID[def.id] ?? BG_BY_ID[profileId] ?? BG_BY_GRADE[def.grade];
  return `${describe(def, profileId, skin?.prompt ?? null)}, looking at viewer, face fully visible, eyes visible, head in frame, medium shot, upper body, waist up, face focus, soft even front lighting, bright face, ${bg} (soft, out of focus), ${STYLE_TAGS}, masterpiece, best quality, very aesthetic, absurdres`;
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
  fs.writeFileSync(new URL('manifest.json', outDir), JSON.stringify({ cards }, null, 2) + '\n');
  return cards;
}

const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain && process.argv.includes('--manifest')) {
  const cards = rebuildManifest();
  console.log(`manifest: ${Object.keys(cards).length} cards (${Object.values(cards).filter((f) => (typeof f === 'string' ? f : f.file).endsWith('.png')).length} png, ${Object.values(cards).filter((f) => f.thumb).length} thumbs)`);
} else if (isMain) {
  const args = process.argv.slice(2); const force = args.includes('--force'); const ids = args.filter((a) => !a.startsWith('--'));
  const seed = Number(process.env.SEED ?? 1);
  const skinMode = args.includes('--skin');
  const baseDefs = [...HEROES.map((h) => [h.id, h, h.id]), ...Object.values(MAIN_JOBS).map((j) => [j.id, j, 'main'])];
  const defs = skinMode
    ? baseDefs.filter(([id, , pid]) => ids.length ? ids.includes(id) : pid !== 'main').flatMap(([id, def, pid]) => (SKINS[id] ?? []).map((sk) => [`${id}__${sk.id}`, def, pid, sk])) // heroes only by default (main jobs: pass ids)
    : baseDefs.filter(([id]) => !ids.length || ids.includes(id));
  const outDir = new URL('../assets/cards/', import.meta.url); const manifestPath = new URL('manifest.json', outDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let ok = 0;
  for (const [id, def, pid, skin = null] of defs) {
    const file = `${id}.png`; const target = new URL(file, outDir);
    if (!force && fs.existsSync(target)) { console.log(`skip ${id}`); ok++; continue; } // (manifest entries may be { file, thumb } objects)
    const text = prompt(def, pid, skin);
    // ZeroGPU quota: the Space answers "You have exceeded your free ZeroGPU quota (90s requested vs. Ns left). Try again in H:MM:SS" — wait that long.
    // Each image needs 90 s of quota; the account quota and the anonymous per-IP quota (HF_ANON=1) are separate pools.
    const maxAttempts = Number(process.env.MAX_ATTEMPTS ?? 12), quotaWait = Number(process.env.QUOTA_WAIT_MS ?? 240000);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const buf = await callGenerate(text, seed + id.length);
        fs.writeFileSync(target, buf); manifest.cards[id] = file; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        console.log(`ok   ${id} ${(buf.length / 1024).toFixed(0)} KB  ${new Date().toLocaleTimeString()}`); ok++; break;
      } catch (e) { const quota = /quota|event error/i.test(e.message); const m = e.message.match(/Try again in (\d+):(\d\d):(\d\d)/); const asked = m ? ((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + 30) * 1000 : 0; const rotated = quota && rotatePool(); const wait = rotated ? 2000 : quota ? (asked || quotaWait) : 15000; console.log(`retry ${id} (${attempt}): ${e.message}${rotated ? ` — switching to ${poolName()}` : quota ? ` — waiting ${(wait / 60000).toFixed(1)} min for GPU quota` : ''}`); if (quota && !rotated) poolIdx = 0, AUTH = TOKEN_POOL[0] ? { authorization: `Bearer ${TOKEN_POOL[0]}` } : {}; await new Promise((r) => setTimeout(r, wait)); } // (was: 15000)); }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`done: ${ok}/${defs.length} (quota pools: ${poolCount()})`);
}
