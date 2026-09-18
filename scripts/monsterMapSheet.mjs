// 손그림 몬스터/보스 맵을 PNG 한 장으로 — 브라우저 없이(캔버스 없이) 검수하려고.
// 맵이 문자 배열이라 그대로 색을 입히면 된다. 사용법: node scripts/monsterMapSheet.mjs out.png [배율] [팔레트번호] [boss]
import fs from 'node:fs';
import { encodePNG } from './png.mjs';
import { MONSTER_MAPS, MONSTER_ACCENTS, BOSS_MAPS } from '../src/data/monsterArt.js';
import { PALETTES } from '../src/data/monsters.js';

const [, , out = 'mon.png', scArg = '4', palArg = '0', which = 'mon'] = process.argv;
const sc = Number(scArg), pal = PALETTES[Number(palArg) % PALETTES.length];
const maps = which === 'boss' ? BOSS_MAPS : MONSTER_MAPS;
const ids = (process.env.IDS ? process.env.IDS.split(',') : Object.keys(maps)).filter((i) => maps[i]);

const darken = (h, k = 0.7) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
const lighten = (h, k = 0.3) => '#' + [1, 3, 5].map((i) => { const v = parseInt(h.slice(i, i + 2), 16); return Math.round(v + (255 - v) * k).toString(16).padStart(2, '0'); }).join('');
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const cell = (id) => {
  const Y = MONSTER_ACCENTS[id] ?? '#f1c40f';
  return { M: pal.M, D: pal.D, l: lighten(pal.M, 0.3), E: '#1b1b1b', L: '#ffffff', K: '#ffb0b0', Y, y: darken(Y, 0.7), C: '#f1c40f', G: '#4d5656' };
};

const w = Math.max(...ids.map((id) => Math.max(...maps[id].map((r) => r.length))));
const h = Math.max(...ids.map((id) => maps[id].length));
const cw = w * sc + 8, ch = h * sc + 8;
const cols = Math.min(8, ids.length), rows = Math.ceil(ids.length / cols);
const W = cols * cw, H = rows * ch;
const px = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W * H; i++) { px[i * 4] = 122; px[i * 4 + 1] = 136; px[i * 4 + 2] = 152; px[i * 4 + 3] = 255; }

ids.forEach((id, n) => {
  const map = maps[id], p = cell(id);
  const ox = (n % cols) * cw + 4, oy = Math.floor(n / cols) * ch + 4;
  map.forEach((row, y) => [...row].forEach((chr, x) => {
    if (chr === '.') return;
    const col = p[chr] ?? '#ff00ff';   // 정의되지 않은 글자는 자홍색으로 튀게 — 조용히 넘어가면 못 찾는다
    const [r, g, b] = rgb(col);
    for (let yy = 0; yy < sc; yy++) for (let xx = 0; xx < sc; xx++) {
      const o = ((oy + y * sc + yy) * W + ox + x * sc + xx) * 4;
      if (o < 0 || o >= px.length) continue;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }));
});
fs.writeFileSync(out, encodePNG(W, H, px));
console.log(`wrote ${out} ${W}x${H} — ${ids.length}종 (${which}, 팔레트 ${pal.name})`);
