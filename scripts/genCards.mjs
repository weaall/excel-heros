// Generate card illustrations with a free, login-free text-to-image endpoint (pollinations.ai) in a
// Blue Archive-like clean cel-shaded anime style, one per hero, into assets/cards/<id>.jpg, and update the manifest.
// Usage:
//   node scripts/genCards.mjs                 # all heroes/jobs that have no jpg yet
//   node scripts/genCards.mjs ceo coo hr_jung # only these ids
//   node scripts/genCards.mjs --force ceo     # regenerate even if the file exists
//   SEED=12 node scripts/genCards.mjs ceo     # different seed
import fs from 'node:fs';
import { HEROES, MAIN_JOBS, GRADES, ROLES } from '../src/data/heroes.js';
import { PROFILES } from '../src/data/profiles.js';

const STYLE = 'Blue Archive style official character illustration, 2D anime, flat cel shading, clean thin lineart, big glossy sparkling eyes, small glowing halo above head, pastel gradient background, bust-up, centered, looking at viewer, masterpiece, best quality';
const HAIR = { short: 'short neat hair', bob: 'chin-length bob cut', grey: 'grey hair', bun: 'hair tied in a bun', cap: 'wearing a cap', side: 'side-swept hair', bald: 'bald head', spiky: 'spiky messy hair', long: 'long flowing hair', curly: 'curly hair' };
const ACC = { tie: 'necktie', headset: 'call-center headset', mustache: 'mustache', hardhat: 'yellow hard hat', coffee: 'holding a coffee cup', badge: 'name badge on chest', lanyard: 'ID card lanyard', glasses: 'thin-rimmed glasses', beard: 'short beard', clipboard: 'holding a clipboard', earring: 'small earrings', sunglasses: 'sunglasses', flower: 'flower hairpin', scarf: 'light scarf', crown: 'small golden crown', files: 'holding a stack of files', apron: 'barista apron', radio: 'walkie-talkie', parcel: 'holding a parcel box', phone: 'holding a smartphone', pen: 'holding a pen', suspenders: 'suspenders', hoodie: 'hoodie', magnifier: 'holding a magnifying glass', calculator: 'holding a calculator', ledger: 'holding a ledger', watch: 'smart watch', briefcase: 'briefcase', cane: 'walking cane', laptop: 'holding a laptop', mop: 'holding a mop', tablet: 'holding a drawing tablet' };
const ROLE = { tank: 'confident protective stance', melee: 'energetic pose with sleeves rolled up', ranged: 'playful pose holding office supplies', healer: 'gentle warm smile' };
const GRADE = { D: 'simple casual office wear', C: 'smart casual office wear with one signature accessory', B: 'team leader outfit with lanyard and refined details', A: 'sharp executive suit with luxurious details', S: 'legendary executive outfit with gold trim, dramatic rim light, sparkling particles' };

/** Nearest plain colour name for a hex value (models follow names far better than hex codes). */
function colorName(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 0.08) return l > 0.85 ? 'white' : l > 0.6 ? 'light grey' : l > 0.3 ? 'grey' : 'black';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const name = h < 15 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal' : h < 250 ? 'blue' : h < 290 ? 'purple' : h < 335 ? 'pink' : 'red';
  return (l > 0.72 ? 'light ' : l < 0.3 ? 'dark ' : '') + name;
}
function prompt(def, id) {
  const p = PROFILES[id] ?? {}; const look = def.look ?? {}; const pal = def.palette ?? {};
  const who = p.gender === 'F' ? '1girl, cute young woman office worker' : '1boy, handsome young man office worker';
  const hairName = look.hair === 'bald' ? 'bald head' : `${colorName(pal.H ?? '#3b2a1a')} ${HAIR[look.hair] ?? 'short hair'}`;
  const outfit = `${colorName(pal.B ?? '#dfe6e9')} ${GRADE[def.grade]}`;
  const bits = [ACC[look.acc], ACC[look.acc2], ACC[look.prop]].filter(Boolean).join(', ');
  return `${STYLE}, ${who}, ${bits}, ${hairName}, ${outfit}, ${ROLE[def.role]}, ${colorName(pal.W ?? '#ffffff')} accent details`;
}

const args = process.argv.slice(2); const force = args.includes('--force'); const ids = args.filter((a) => !a.startsWith('--'));
const seed = Number(process.env.SEED ?? 7);
const defs = [...HEROES.map((h) => [h.id, h, h.id]), ...Object.values(MAIN_JOBS).map((j) => [j.id, j, 'main'])].filter(([id]) => !ids.length || ids.includes(id));
const outDir = new URL('../assets/cards/', import.meta.url);
const manifestPath = new URL('manifest.json', outDir);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function gen(id, def, profileId) {
  const file = `${id}.jpg`; const target = new URL(file, outDir);
  if (!force && fs.existsSync(target)) { console.log(`skip ${id} (exists)`); return true; }
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt(def, profileId))}?width=768&height=896&nologo=true&seed=${seed + id.length}&model=flux`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(150000) });
      if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) throw new Error(`${res.status} ${res.headers.get('content-type')}`);
      const buf = Buffer.from(await res.arrayBuffer()); if (buf.length < 8000) throw new Error('too small');
      fs.writeFileSync(target, buf);
      manifest.cards[id] = { file, crop: [0, 0, 1, 0.94] }; // crop the bottom strip (service watermark)
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`ok   ${id} ${(buf.length / 1024).toFixed(0)} KB`); return true;
    } catch (e) { console.log(`retry ${id} (${attempt}): ${e.message}`); await new Promise((r) => setTimeout(r, (/429/.test(e.message) ? 25000 : 5000) * attempt)); } // 429 = rate limit: back off hard
  }
  console.log(`FAIL ${id}`); return false;
}
if (args.includes('--manifest')) {
  // rebuild the manifest from the files on disk (jpg preferred, svg fallback) — used after parallel runs
  const all = [...HEROES.map((h) => h.id), ...Object.values(MAIN_JOBS).map((j) => j.id)];
  const cards = {};
  for (const id of all) {
    if (fs.existsSync(new URL(`${id}.jpg`, outDir))) cards[id] = { file: `${id}.jpg`, crop: [0, 0, 1, 0.94] };
    else if (fs.existsSync(new URL(`${id}.svg`, outDir))) cards[id] = `${id}.svg`;
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ cards }, null, 2) + '\n');
  console.log(`manifest: ${Object.keys(cards).length} cards (${Object.values(cards).filter((c) => typeof c === 'object').length} jpg)`);
} else {
  let ok = 0;
  const gap = Number(process.env.GAP_MS ?? 12000); // the free endpoint rate-limits (~1 image / 10 s); stay under it
  for (const [id, def, pid] of defs) { if (await gen(id, def, pid)) ok++; await new Promise((r) => setTimeout(r, gap)); }
  console.log(`done: ${ok}/${defs.length}`);
}
