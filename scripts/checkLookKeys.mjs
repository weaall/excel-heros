// Every `look` key in heroes.js must have a description in BOTH prompt dictionaries.
//
// A key that is missing does not error: genCardsHF falls back to 'short hair' and ACC entries are
// dropped by `.filter(Boolean)`. So a character loses the thing that defines them and the image
// still comes out looking like an image. Sixteen keys were in that state — three hairstyles and
// thirteen props — and the only reason it surfaced was laying the whole roster out in one table.
//
//   node scripts/checkLookKeys.mjs
import fs from 'node:fs';
import { HEROES, MAIN_JOBS } from '../src/data/heroes.js';

function keysOf(file, name) {
  const src = fs.readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
  const open = src.indexOf(`const ${name} = {`);
  if (open < 0) throw new Error(`${file}: no ${name}`);
  const body = src.slice(open, src.indexOf('};', open));
  return new Set([...body.matchAll(/(\w+):/g)].map((m) => m[1]));
}

const defs = [...HEROES, ...Object.values(MAIN_JOBS)];
let bad = 0;

for (const file of ['genCardsHF.mjs', 'artPrompts.mjs']) {
  const hair = keysOf(file, 'HAIR');
  const acc = keysOf(file, 'ACC');
  for (const d of defs) {
    const look = d.look ?? {};
    if (look.hair && !hair.has(look.hair)) { console.log(`${file}: HAIR missing '${look.hair}' (${d.id})`); bad++; }
    for (const slot of ['acc', 'acc2', 'prop']) {
      const v = look[slot];
      if (v && !acc.has(v)) { console.log(`${file}: ACC missing '${v}' (${d.id}.${slot})`); bad++; }
    }
  }
}

console.log(bad === 0
  ? `OK — every look key in ${defs.length} definitions is described in both dictionaries`
  : `${bad} undescribed key(s)`);
process.exit(bad === 0 ? 0 : 1);
