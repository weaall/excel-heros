// Generate card illustrations with an anime-specialised model (Animagine XL 4.0) running as a public Hugging Face
// Space (Gradio API, anonymous ZeroGPU quota). Danbooru-tag prompts in a Blue Archive-like look.
// Usage:
//   node scripts/genCardsHF.mjs ceo coo hr_jung      # given ids
//   node scripts/genCardsHF.mjs                      # every hero/job without a png yet
//   node scripts/genCardsHF.mjs --force ceo          # regenerate
//   SEED=3 SPACE=asahina2k-animagine-xl-4-0 node scripts/genCardsHF.mjs ...
import fs from 'node:fs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';

const SPACE = process.env.SPACE ?? 'asahina2k-animagine-xl-4-0';
const BASE = `https://${SPACE}.hf.space`;
const STYLE_TAGS = 'blue archive style, halo, flat color, cel shading, clean lineart, anime coloring, vivid pastel colors, detailed background, depth of field';
/** Backgrounds: by character (department flavour), else by grade. Kept bright and readable behind a bust/cowboy shot. */
const BG_BY_ID = {
  main: 'modern office, cubicles, computer monitors, morning light', intern: 'modern office, cubicles, morning light', staff: 'modern office, desks, window light', senior: 'office floor, glass partitions, afternoon light', manager: 'meeting room, whiteboard, large window', sales: 'city skyline through window, sunset, executive office', finance: 'executive office, charts on screens, evening city lights', admin: 'office building lobby, security desk, warm lights',
  parttime: 'bright reception desk, lobby, flowers', guard: 'office building lobby, security desk, glass doors', barista: 'cozy cafe interior, espresso machine, warm light', courier: 'city street, delivery van, sunny day', contract: 'open-plan office, plants, bright window', cleaner: 'quiet office corridor at dawn, soft light',
  helpdesk: 'server room, blue lights, cables', macro: 'developer workspace, multiple monitors, code on screen, neon accents', dev_lead: 'developer workspace, monitors, night city window', cto: 'high-tech office, glass walls, holographic screens',
  hr_jung: 'bright HR office, bookshelves, plants', welfare: 'office break room, snacks, warm light', design_lead: 'design studio, drawing tablets, colorful posters', pm_lead: 'meeting room, sticky notes on glass wall', cmo: 'marketing office, billboards visible through window, sunset',
  acct_lead: 'accounting office, paper stacks, calculator, window light', cfo: 'executive office, stock charts, evening city lights', audit_han: 'archive room, file cabinets, desk lamp', legal_yoon: 'law library, bookshelves, warm lamp',
  vlookup: 'data analytics office, large screens with charts', pivot: 'boardroom, long table, city view', ga_lead: 'supply storage room, shelves, boxes', sales_kang: 'business district street, glass towers, sunny',
  coo: 'executive floor, panoramic city window, golden hour', ceo: 'grand executive office, panoramic city skyline, golden light, sparkles', chairman: 'grand hall, marble, golden light rays, chandelier, sparkles', founder: 'startup garage loft, whiteboard, warm sunset light, sparkles',
};
const BG_BY_GRADE = { D: 'modern office background, window light', C: 'bright office lobby background', B: 'meeting room background, plants', A: 'executive office background, city skyline, sunset', S: 'grand hall background, golden light rays, sparkles, dramatic lighting' };
const NEG = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry, 3d, realistic, photo, multiple views, nsfw';
const HAIR = { short: 'short hair', bob: 'bob cut', grey: 'grey hair', bun: 'hair bun', cap: 'baseball cap', side: 'swept bangs', bald: 'bald', spiky: 'spiked hair', long: 'long hair', curly: 'curly hair' };
const ACC = { tie: 'necktie', headset: 'headset', mustache: 'mustache', hardhat: 'hardhat', coffee: 'holding coffee cup', badge: 'name tag', lanyard: 'lanyard', glasses: 'glasses', beard: 'beard', clipboard: 'holding clipboard', earring: 'earrings', sunglasses: 'sunglasses', flower: 'hair flower', scarf: 'scarf', crown: 'crown', files: 'holding folder', apron: 'apron', radio: 'walkie-talkie', parcel: 'holding box', phone: 'holding phone', pen: 'holding pen', suspenders: 'suspenders', hoodie: 'hoodie', magnifier: 'magnifying glass', calculator: 'calculator', ledger: 'holding book', watch: 'wristwatch', briefcase: 'briefcase', cane: 'cane', laptop: 'laptop', mop: 'holding mop', tablet: 'drawing tablet' };
const ROLE = { tank: 'confident, arms crossed', melee: 'energetic, clenched hand, sleeves rolled up', ranged: 'playful, one hand up', healer: 'gentle smile, hands together' };
const GRADE = { D: 'office lady, casual office wear', C: 'office lady, business casual, id card', B: 'team leader, blazer, lanyard', A: 'executive, formal suit, luxurious', S: 'legendary executive, ornate formal suit, gold trim, sparkles, light particles, glowing' };

function colorName(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) return l > 0.85 ? 'white' : l > 0.6 ? 'silver' : l > 0.3 ? 'grey' : 'black';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const name = h < 15 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'blonde' : h < 160 ? 'green' : h < 200 ? 'aqua' : h < 250 ? 'blue' : h < 290 ? 'purple' : h < 335 ? 'pink' : 'red';
  if ((name === 'orange' || name === 'red' || name === 'blonde') && l < 0.35) return 'brown'; // dark warm tones read as brown hair, not orange
  return (l > 0.72 ? 'light ' : l < 0.3 ? 'dark ' : '') + name;
}
export function prompt(def, profileId) {
  const p = PROFILES[profileId] ?? {}; const look = def.look ?? {}; const pal = def.palette ?? {};
  const who = p.gender === 'F' ? '1girl, solo' : '1boy, solo, male focus';
  const hair = look.hair === 'bald' ? 'bald' : `${colorName(pal.H ?? '#3b2a1a')} hair, ${HAIR[look.hair] ?? 'short hair'}`;
  const outfit = GRADE[def.grade].replace('office lady', p.gender === 'F' ? 'office lady' : 'office worker');
  const bits = [ACC[look.acc], ACC[look.acc2], ACC[look.prop]].filter(Boolean).join(', ');
  const bg = BG_BY_ID[def.id] ?? BG_BY_ID[profileId] ?? BG_BY_GRADE[def.grade];
  return `${who}, ${hair}, ${bits}, ${outfit}, ${colorName(pal.B ?? '#dfe6e9')} jacket, ${ROLE[def.role]}, looking at viewer, cowboy shot, ${bg}, ${STYLE_TAGS}, masterpiece, best quality, very aesthetic, absurdres`;
}

async function callGenerate(text, seed) {
  const data = [text, NEG, seed, 832, 1216, 5, 28, 'Euler a', '832 x 1216', 'Anim4gine', false, 0.55, 1.5, true];
  const r = await fetch(`${BASE}/call/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data }) });
  if (!r.ok) throw new Error(`call ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const { event_id } = await r.json();
  const ev = await fetch(`${BASE}/call/generate/${event_id}`, { signal: AbortSignal.timeout(300000) });
  const txt = await ev.text();
  const lines = txt.split('\n'); let lastEvent = '', payload = null;
  for (const line of lines) { if (line.startsWith('event:')) lastEvent = line.slice(6).trim(); else if (line.startsWith('data:') && (lastEvent === 'complete' || lastEvent === 'error')) payload = line.slice(5).trim(); }
  if (lastEvent !== 'complete') throw new Error(`event ${lastEvent}: ${String(payload).slice(0, 300)}`);
  const out = JSON.parse(payload);
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
  for (const id of [...HEROES.map((h) => h.id), ...Object.values(MAIN_JOBS).map((j) => j.id)]) {
    if (fs.existsSync(new URL(`${id}.png`, outDir))) cards[id] = `${id}.png`;
    else if (fs.existsSync(new URL(`${id}.svg`, outDir))) cards[id] = `${id}.svg`;
  }
  fs.writeFileSync(new URL('manifest.json', outDir), JSON.stringify({ cards }, null, 2) + '\n');
  return cards;
}

const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMain && process.argv.includes('--manifest')) {
  const cards = rebuildManifest();
  console.log(`manifest: ${Object.keys(cards).length} cards (${Object.values(cards).filter((f) => f.endsWith('.png')).length} png)`);
} else if (isMain) {
  const args = process.argv.slice(2); const force = args.includes('--force'); const ids = args.filter((a) => !a.startsWith('--'));
  const seed = Number(process.env.SEED ?? 1);
  const defs = [...HEROES.map((h) => [h.id, h, h.id]), ...Object.values(MAIN_JOBS).map((j) => [j.id, j, 'main'])].filter(([id]) => !ids.length || ids.includes(id));
  const outDir = new URL('../assets/cards/', import.meta.url); const manifestPath = new URL('manifest.json', outDir);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  let ok = 0;
  for (const [id, def, pid] of defs) {
    const file = `${id}.png`; const target = new URL(file, outDir);
    if (!force && fs.existsSync(target)) { console.log(`skip ${id}`); ok++; continue; }
    const text = prompt(def, pid);
    // ZeroGPU anonymous quota: an `error` event with no payload means "quota exceeded, wait" — back off for minutes, not seconds
    const maxAttempts = Number(process.env.MAX_ATTEMPTS ?? 12), quotaWait = Number(process.env.QUOTA_WAIT_MS ?? 240000);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const buf = await callGenerate(text, seed + id.length);
        fs.writeFileSync(target, buf); manifest.cards[id] = file; fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
        console.log(`ok   ${id} ${(buf.length / 1024).toFixed(0)} KB  ${new Date().toLocaleTimeString()}`); ok++; break;
      } catch (e) { const quota = /event error/.test(e.message); console.log(`retry ${id} (${attempt}): ${e.message}${quota ? ` — waiting ${quotaWait / 60000} min for GPU quota` : ''}`); await new Promise((r) => setTimeout(r, quota ? quotaWait : 15000)); }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`done: ${ok}/${defs.length}`);
}
