// Canvas renderer: scrolling dungeon (0x72 tiles), side-view line combat, effects, projectiles,
// particles, hit flashes, screen shake, stage banners and the boss cut-in.
import { CANVAS_W, CANVAS_H, GROUND_Y, GRID } from '../core/EntityManager.js';
import { heroSprite, monsterSprite, flashSprite } from '../data/sprites.js';
import { cardArt } from '../data/cardArt.js';
import { SKILLS } from '../data/heroes.js';
import { drawCity } from './cityBackdrop.js';
import { GRADES } from '../data/heroes.js';
import { stageLabel, BALANCE } from '../config/balance.js';
import { bossForStage } from '../data/monsters.js';
import { phaseTheme, phaseName, stageModifier } from '../data/stages.js';
import { profileOf } from '../data/profiles.js';
import { fmt } from '../utils/format.js';

const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x / 4294967296; };

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.t = 0;
    this.banner = null;
    this.skillCard = null; // small illustration cut-in for regular skills (one at a time; a new cast replaces it)
    game.on('skill-cast', ({ hero, type }) => { this.skillCard = { hero, type, t: 0, life: 1.6 }; });
    this.selected = null;   // { col, row } selected worksheet cell (Excel-style selection box)
    game.on('challengeStart', ({ stage, boss }) => {
      this.banner = boss
        ? { kind: 'boss', text: `${bossForStage(stage).name} 등장!`, sub: `${bossForStage(stage).desc} · ${BALANCE.BOSS.timeLimit}초 안에 처리`, t: 0, life: 2.4 }
        : { kind: 'challenge', text: `${stageLabel(stage)} 도전`, sub: `${phaseName(stage)}${stageModifier(stage) ? ` · ${stageModifier(stage).name}: ${stageModifier(stage).desc}` : ` · 오류 ${BALANCE.KILLS_PER_STAGE}건 처리 시 클리어`}`, t: 0, life: stageModifier(stage) ? 2.2 : 1.6 };
    });
    game.on('cleared', ({ stage, boss, first }) => {
      this.banner = { kind: 'clear', text: boss ? '보스 처리 완료!' : `${stageLabel(stage)} 마감!`, sub: first ? '첫 클리어 보상 지급' : '반복 클리어', t: 0, life: 1.5 };
    });
    game.on('enrage', ({ boss }) => { this.banner = { kind: 'boss', text: `${boss.def.name} 격노!`, sub: '공격력 상승 · 속도 상승 — 서둘러 마감하세요', t: 0, life: 1.6 }; });
    game.on('ult', ({ hero }) => { const p = profileOf(hero.heroId); this.banner = { kind: 'skill', text: hero.skillName ?? 'ULT', sub: p?.ult ? `"${p.ult}" — ${hero.def.name}` : hero.def.name, hero, t: 0, life: 1.5 }; });
    game.on('overtime-start', (o) => { this.banner = { kind: 'boss', text: '야근 모드 시작!', sub: `${stageLabel(o.stage)} 난이도 · ${BALANCE.OVERTIME.duration}초 · 처치마다 보석`, t: 0, life: 1.8 }; });
    game.on('overtime-end', (r) => { this.banner = { kind: 'clear', text: '야근 종료', sub: `처치 ${r.kills} (엘리트 ${r.elites}) · 보석 +${r.gems} · 카드 +${r.cards}`, t: 0, life: 2.4 }; });
    game.on('milestone', ({ milestone, reward }) => { this.banner = { kind: 'milestone', text: `마일스톤 달성: ${milestone.name}`, sub: `검토 시트에서 수령 — 보석 ${reward.gems}${reward.cards ? ` · 강화 카드 ${reward.cards}` : ''}`, t: 0, life: 2.2 }; });
    game.on('challenge', () => { if (!game.isChallenging() && this.banner?.kind !== 'clear') this.banner = { kind: 'farm', text: `${game.stageLabel()} 자동 사냥`, sub: '', t: 0, life: 1.2 }; });
  }

  draw(dt) {
    this.t += dt;
    const { ctx } = this; const em = this.game.entities;
    ctx.save();
    if (em.shake > 0) ctx.translate((Math.random() - 0.5) * em.shake, (Math.random() - 0.5) * em.shake);
    this.#drawDungeon(em.scroll);
    if (this.game.state.settings.gridlines) this.#drawGridlines();
    this.#drawBossBar(em);
    const entities = [...em.monsters, ...em.heroes].sort((a, b) => a.y - b.y);
    for (const e of entities) (e.kind === 'hero' ? this.#drawHero(e) : this.#drawMonster(e));
    this.#drawEffects(em);
    this.#drawParticles(em);
    this.#drawProjectiles(em);
    this.#drawFloaters(em);
    this.#drawBubbles(em);
    this.#drawBuff(em);
    this.#drawCombo(em);
    this.#drawOvertime();
    ctx.restore();
    if (em.flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${(em.flashT / 0.18) * 0.55})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
    this.#drawSelection();
    this.#drawSkillCard(dt);
    this.#drawBanner(dt);
  }

  /** Faint worksheet gridlines over the dungeon: the cells are 64×52 like the A–M / 1–8 headers. */
  #drawGridlines() {
    const { ctx } = this; const { cellW, cellH } = GRID;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = cellW; x < CANVAS_W; x += cellW) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, CANVAS_H); }
    for (let y = cellH; y < CANVAS_H; y += cellH) { ctx.moveTo(0, y + 0.5); ctx.lineTo(CANVAS_W, y + 0.5); }
    ctx.stroke(); ctx.restore();
  }
  /** Excel selection rectangle with the fill handle. */
  #drawSelection() {
    const s = this.selected; if (!s) return;
    const { ctx } = this; const x = s.col * GRID.cellW, y = s.row * GRID.cellH;
    ctx.save();
    ctx.strokeStyle = '#217346'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, GRID.cellW - 2, GRID.cellH - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y + 2.5, GRID.cellW - 5, GRID.cellH - 5);
    ctx.fillStyle = '#217346'; ctx.fillRect(x + GRID.cellW - 5, y + GRID.cellH - 5, 6, 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(x + GRID.cellW - 4, y + GRID.cellH - 4, 4, 4); ctx.fillStyle = '#217346'; ctx.fillRect(x + GRID.cellW - 3, y + GRID.cellH - 3, 2, 2);
    ctx.restore();
  }

  // ------------------------------------------------------------- dungeon --
  /** Ruined-city backdrop (see cityBackdrop.js) tinted by the current district. */
  #drawDungeon(scroll) {
    const theme = phaseTheme(this.game.state.stage);
    // Pixel-art pass: draw the city at full size, downsample to half (nearest neighbour) and blow it back up, so the
    // backdrop has the same 2px pixel grid as the 2x sprites; scroll is snapped to that grid to avoid shimmer.
    if (!this.bgFull) {
      this.bgFull = document.createElement('canvas'); this.bgFull.width = CANVAS_W; this.bgFull.height = CANVAS_H;
      this.bgSmall = document.createElement('canvas'); this.bgSmall.width = CANVAS_W / 2; this.bgSmall.height = CANVAS_H / 2;
    }
    const fctx = this.bgFull.getContext('2d'), sctx = this.bgSmall.getContext('2d');
    drawCity(fctx, Math.floor(scroll / 2) * 2, this.t, theme, CANVAS_W, CANVAS_H);
    sctx.imageSmoothingEnabled = false; sctx.drawImage(this.bgFull, 0, 0, CANVAS_W / 2, CANVAS_H / 2);
    this.ctx.imageSmoothingEnabled = false; this.ctx.drawImage(this.bgSmall, 0, 0, CANVAS_W, CANVAS_H);
    if (theme.tint > 0) { this.ctx.fillStyle = `hsla(${theme.hue}, 60%, 40%, ${theme.tint})`; this.ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
  }

  // ------------------------------------------------------------ overlays --
  #drawBossBar(em) {
    if (!em.boss) return;
    const b = em.boss; const { ctx } = this;
    const x = 16, y = 8, w = CANVAS_W - 32, h = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 14);
    ctx.fillStyle = '#5a1a12'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), h);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x, y + h + 2, w * Math.min(1, em.bossTimer / BALANCE.BOSS.timeLimit), 4);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${b.def.name}   ${fmt(b.hp)} / ${fmt(b.maxHp)}   ⏱ ${em.bossTimer.toFixed(1)}s`, x + w / 2, y + h / 2);
  }

  /** 야근 모드 HUD (top-left): countdown + kills, like a status-bar timer. */
  #drawOvertime() {
    const o = this.game.overtime; if (!o) return; const { ctx } = this;
    const t = Math.max(0, o.t), urgent = t < 10;
    ctx.save(); ctx.fillStyle = urgent && Math.floor(this.t * 4) % 2 ? 'rgba(160,40,30,0.96)' : 'rgba(20,28,40,0.96)'; ctx.fillRect(8, 8, 244, 42); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(8.5, 8.5, 243, 41);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(8, 8, 244 * (t / BALANCE.OVERTIME.duration), 3);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Consolas, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`야근 모드  ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`, 16, 24);
    ctx.font = '11px Consolas, monospace'; ctx.fillStyle = '#ecf0f1';
    ctx.fillText(`처치 ${o.kills} · 엘리트 ${o.elites} · 예상 보석 +${Math.min(BALANCE.OVERTIME.maxGems, o.kills * BALANCE.OVERTIME.gemsPerKill + o.elites * BALANCE.OVERTIME.gemsPerElite)}`, 16, 40);
    ctx.restore();
  }

  /** Hit combo counter (top-right), Excel style. */
  #drawCombo(em) {
    if (em.combo < 3) return;
    const { ctx } = this; const k = Math.min(1, em.combo / 50);
    const pulse = 1 + Math.max(0, 0.25 - (BALANCE.COMBO.decay - em.comboT) * 2) ;
    ctx.save(); ctx.translate(CANVAS_W - 14, 46); ctx.scale(pulse, pulse); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px Consolas, monospace'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.fillStyle = k < 0.3 ? '#ecf0f1' : k < 0.7 ? '#f1c40f' : '#e74c3c';
    ctx.strokeText(`${em.combo} HIT`, 0, 0); ctx.fillText(`${em.combo} HIT`, 0, 0);
    ctx.font = '11px Consolas, monospace'; ctx.fillStyle = '#bdc3c7'; ctx.strokeText(`=COUNTIF(HITS) · DMG +${Math.round(Math.min(BALANCE.COMBO.max, em.combo * BALANCE.COMBO.perHit) * 100)}%`, 0, 18); ctx.fillText(`=COUNTIF(HITS) · DMG +${Math.round(Math.min(BALANCE.COMBO.max, em.combo * BALANCE.COMBO.perHit) * 100)}%`, 0, 18);
    ctx.restore();
  }

  /** Active party buffs (bottom-left): ATK buff, haste, barrier — one status line each, like Excel's status-bar items. */
  #drawBuff(em) {
    const { ctx } = this; const lines = [];
    if (em.atkBuff.mult > 1 && em.atkBuff.until >= em.time) lines.push(['rgba(142,68,173,0.85)', `▲ 팀 싱크: ATK ×${em.atkBuff.mult.toFixed(2)} (${Math.max(0, em.atkBuff.until - em.time).toFixed(1)}s)`]);
    if (em.slow?.mult < 1 && em.slow.until >= em.time) lines.push(['rgba(39,174,96,0.9)', `▼ 야근 강요: 공격 속도 ×${em.slow.mult.toFixed(2)} (${Math.max(0, em.slow.until - em.time).toFixed(1)}s)`]);
    if (em.hasteBuff?.mult > 1 && em.hasteBuff.until >= em.time) lines.push(['rgba(183,149,11,0.9)', `» 가속: 공격 속도 ×${em.hasteBuff.mult.toFixed(2)} (${Math.max(0, em.hasteBuff.until - em.time).toFixed(1)}s)`]);
    if (em.barrier?.hp > 0 && em.barrier.until >= em.time) lines.push(['rgba(41,128,185,0.9)', `◈ 보호막: ${Math.round(em.barrier.hp)} / ${em.barrier.max} (${Math.max(0, em.barrier.until - em.time).toFixed(1)}s)`]);
    lines.forEach(([bg, text], i) => {
      const y = CANVAS_H - 26 - i * 22;
      ctx.fillStyle = bg; ctx.fillRect(8, y, 260, 20);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, 14, y + 10);
    });
  }

  /** Fill text with a dark outline so white labels stay readable over bright sashes and backgrounds. */
  #txt(text, x, y, stroke = 'rgba(0,0,0,0.65)') { const { ctx } = this; ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); ctx.restore(); ctx.fillText(text, x, y); }
  #artOf(def) { return (def.skin && cardArt(`${def.id}__${def.skin.id}`)) || cardArt(def.id) || null; }
  /** Draw an illustration into a box: cover-fit, anchored to the top (faces live in the top half). */
  #artBox(img, x, y, w, h, frame = '#fff') {
    const { ctx } = this; const s = Math.max(w / img.width, h / img.height); const dw = img.width * s, dh = img.height * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.imageSmoothingEnabled = true; ctx.drawImage(img, x + (w - dw) / 2, y, dw, dh); ctx.restore();
    ctx.strokeStyle = frame; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }
  /** Regular skill cut-in: a name-tag sized illustration card in the top-left (below the boss bar), out of the way of the line. */
  /** Portrait clipped to a leaning parallelogram (anime cut-in shape). */
  #artPara(img, x, y, w, h, skew, frame) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x + skew, y); ctx.lineTo(x + w + skew, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath();
    ctx.save(); ctx.clip();
    if (img) { const sc = Math.max(w / img.width, h / img.height) * 1.15; const dw = img.width * sc, dh = img.height * sc; ctx.imageSmoothingEnabled = true; ctx.drawImage(img, x + (w - dw) / 2 + skew / 2, y - dh * 0.06, dw, dh); }
    else { ctx.fillStyle = '#20222c'; ctx.fillRect(x, y, w + skew, h); }
    ctx.restore();
    ctx.strokeStyle = frame; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  #drawSkillCard(dt) {
    const c = this.skillCard; if (!c) return;
    c.t += dt; if (c.t >= c.life) { this.skillCard = null; return; }
    const { ctx } = this; const k = c.t / c.life; const def = c.hero.def; const col = GRADES[def.grade]?.color ?? '#6c3483';
    // slam in (0→0.12, ease-out), hold, slide out (0.78→1, ease-in)
    const IN = 0.12, OUT = 0.78, OFF = -340;
    const slide = k < IN ? OFF * (1 - (1 - (1 - k / IN)) ** 1) * ((1 - k / IN) ** 2) : k > OUT ? OFF * ((k - OUT) / (1 - OUT)) ** 2 : 0;
    const fade = Math.min(1, k * 12, (1 - k) * 8);
    const W = 132, H = 186, SK = 26, x = 16 + slide, y = 92;
    ctx.save(); ctx.globalAlpha = fade;
    // speed lines behind the portrait while it flies in
    if (k < 0.3) {
      ctx.globalAlpha = fade * (1 - k / 0.3) * 0.5; ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) { const ly = y + 14 + i * 26; ctx.beginPath(); ctx.moveTo(x - 120 - i * 18, ly); ctx.lineTo(x + 40, ly); ctx.stroke(); }
      ctx.globalAlpha = fade;
    }
    // grade band behind the portrait, offset so it reads as a second layer
    ctx.fillStyle = col; ctx.globalAlpha = fade * 0.9;
    ctx.beginPath(); ctx.moveTo(x + SK + 10, y - 8); ctx.lineTo(x + W + SK + 10, y - 8); ctx.lineTo(x + W + 10, y + H + 8); ctx.lineTo(x + 10, y + H + 8); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = fade;
    this.#artPara(this.#artOf(def) ?? heroSprite(def, 'attack', 1), x, y, W, H, SK, '#ffffff');
    // name plate: dark bar sweeping out to the right of the portrait
    const pw = 214, px = x + W + SK - 6, py = y + H - 66;
    ctx.fillStyle = 'rgba(16,18,26,0.88)';
    ctx.beginPath(); ctx.moveTo(px + 12, py); ctx.lineTo(px + pw, py); ctx.lineTo(px + pw - 12, py + 60); ctx.lineTo(px, py + 60); ctx.closePath(); ctx.fill();
    ctx.fillStyle = col; ctx.fillRect(px + 6, py + 58, pw - 12, 3);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif';
    const big = c.hero.skillName ?? SKILLS[c.type]?.name ?? '스킬';
    ctx.fillText(SKILLS[c.type]?.name && SKILLS[c.type].name !== big ? `${def.name} · ${SKILLS[c.type].name} 계열` : def.name, px + 20, py + 16);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px "Malgun Gothic", "Segoe UI", sans-serif';
    this.#txt(big, px + 20, py + 40);
    ctx.restore();
  }
  #drawBanner(dt) {
    const b = this.banner; if (!b) return;
    b.t += dt; if (b.t >= b.life) { this.banner = null; return; }
    const { ctx } = this; const k = b.t / b.life;
    const fade = Math.min(1, k * 6, (1 - k) * 4);
    const slide = k < 0.15 ? (1 - k / 0.15) * -300 : 0;
    ctx.save(); ctx.globalAlpha = fade;
    if (b.kind === 'boss') {
      { const g = ctx.createLinearGradient(0, 0, 0, 280); g.addColorStop(0, 'rgba(30,0,0,0.6)'); g.addColorStop(0.8, 'rgba(30,0,0,0.5)'); g.addColorStop(1, 'rgba(30,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, 280); } // upper band only: the line below stays readable
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(-60 + slide, 150); ctx.lineTo(CANVAS_W + 60 + slide, 110); ctx.lineTo(CANVAS_W + 60 + slide, 210); ctx.lineTo(-60 + slide, 250); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 40px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      this.#txt(b.text, CANVAS_W / 2 - 60 + slide, 178);
      ctx.font = 'bold 15px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = '#f9e79f'; this.#txt(b.sub, CANVAS_W / 2 - 60 + slide, 230);
      // hazard stripes along the sash edges (긴급 tape)
      ctx.fillStyle = '#f1c40f';
      for (let i = -2; i < CANVAS_W / 24 + 4; i++) { const x0 = i * 24 + slide; ctx.beginPath(); ctx.moveTo(x0, 150 - x0 * 0.048); ctx.lineTo(x0 + 12, 150 - (x0 + 12) * 0.048); ctx.lineTo(x0 + 12, 158 - (x0 + 12) * 0.048); ctx.lineTo(x0, 158 - x0 * 0.048); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(x0, 242 - x0 * 0.048); ctx.lineTo(x0 + 12, 242 - (x0 + 12) * 0.048); ctx.lineTo(x0 + 12, 250 - (x0 + 12) * 0.048); ctx.lineTo(x0, 250 - x0 * 0.048); ctx.closePath(); ctx.fill(); }
      const boss = this.game.entities.boss;
      if (boss) {
        const img = monsterSprite(boss.def, 0); ctx.imageSmoothingEnabled = false;
        const sx = CANVAS_W - 300 + slide * 0.5, sy = 28, sc = 2; // boss frames are 3× already → 6× on the cut-in
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(sx + img.width * sc / 2, sy + img.height * sc - 6, img.width * sc / 2, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.drawImage(img, sx, sy, img.width * sc, img.height * sc);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Consolas, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`HP ${Math.round(boss.maxHp).toLocaleString()}  ATK ${Math.round(boss.atk).toLocaleString()}`, sx, sy + img.height * sc + 16);
      }
    } else if (b.kind === 'skill') {
      // ultimate cut-in: purple sash + the caster's sprite blown up on the left
      { const g = ctx.createLinearGradient(0, 0, 0, 280); g.addColorStop(0, 'rgba(40,0,60,0.45)'); g.addColorStop(0.8, 'rgba(40,0,60,0.35)'); g.addColorStop(1, 'rgba(40,0,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, CANVAS_W, 280); }
      ctx.fillStyle = '#6c3483'; ctx.beginPath(); ctx.moveTo(-60 + slide, 130); ctx.lineTo(CANVAS_W + 60 + slide, 170); ctx.lineTo(CANVAS_W + 60 + slide, 250); ctx.lineTo(-60 + slide, 210); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 36px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      this.#txt(b.text, CANVAS_W / 2 + 70 + slide, 190);
      ctx.font = 'bold 14px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = '#e8daef'; this.#txt(b.sub, CANVAS_W / 2 + 70 + slide, 228);
      const art = this.#artOf(b.hero.def);
      if (art) { ctx.save(); ctx.translate(120 + slide * 0.5, 160); ctx.rotate(-0.06); this.#artBox(art, -70, -98, 140, 196, GRADES[b.hero.def.grade]?.color ?? '#fff'); ctx.restore(); }
      else { const img = heroSprite(b.hero.def, 'attack', 1); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 60 + slide * 0.5, 80, img.width * 3, img.height * 3); }
    } else {
      const col = b.kind === 'clear' ? '#217346' : b.kind === 'challenge' ? '#1f5fa8' : b.kind === 'milestone' ? '#b7950b' : '#5d6d7e';
      ctx.fillStyle = col; ctx.globalAlpha = fade * 0.9; ctx.fillRect(slide, 150, CANVAS_W, 64);
      ctx.globalAlpha = fade; ctx.fillStyle = '#fff'; ctx.font = 'bold 28px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      this.#txt(b.text, CANVAS_W / 2 + slide, 174);
      if (b.sub) { ctx.font = '13px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; this.#txt(b.sub, CANVAS_W / 2 + slide, 200); }
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ entities --
  #drawHero(h) {
    const { ctx } = this;
    let frame, bob = 0;
    if (h.anim === 'attack') frame = h.animT < 0.16 ? 0 : h.animT < 0.32 ? 1 : 2;
    else if (h.anim === 'walk') { frame = Math.floor(h.animT * 9) % 4; if (frame % 2 === 0) bob = -2; }
    else frame = Math.floor(h.animT * 5) % 4;
    const img = heroSprite(h.def, h.alive && h.flash > 0 ? 'hit' : h.anim, frame);
    // melee dash: out during the wind-up, back during recovery (purely visual)
    let dash = 0;
    if (h.anim === 'attack' && (h.role === 'melee' || h.role === 'tank') && h.dashTo) {
      const k = h.animT / 0.45; const s = k < 0.3 ? Math.sin((k / 0.3) * Math.PI / 2) : k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.35);
      dash = (h.dashTo - h.homeX) * s;
    }
    const knock = h.flash ? -6 * (h.flash / 0.12) : 0;
    const sx = Math.round(h.x + dash - 32 + knock + (h.shake ? (Math.random() - 0.5) * 3 * h.shake : 0)), sy = Math.round(h.y - 60 + bob);
    this.#shadow(h.x + dash, h.y + 2, 18);
    if (!h.alive) {
      const k = 1; // 자동 부활이 없어졌다 — 쓰러진 모습 그대로 (부활 스킬만이 일으킨다)
      ctx.save(); ctx.globalAlpha = 0.35 + 0.35 * (1 - k); ctx.translate(h.x - 8, h.y); ctx.rotate(-Math.PI / 2 * k); ctx.drawImage(img, -24, -60); ctx.restore();
      ctx.fillStyle = '#bdc3c7'; ctx.font = 'bold 12px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(h.reviveT)}s`, h.x, h.y + 16);
      return;
    }
    if (dash !== 0) { ctx.save(); ctx.globalAlpha = 0.28; ctx.drawImage(img, Math.round(h.x - 32), sy); ctx.globalAlpha = 0.14; ctx.drawImage(img, Math.round(h.x + dash * 0.5 - 32), sy); ctx.restore(); }
    if (h.awakened) { ctx.save(); ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 16 + Math.sin(this.t * 5) * 6; ctx.strokeStyle = 'rgba(255,209,102,0.95)'; ctx.lineWidth = 2; ctx.strokeRect(sx + 12, sy + 2, 40, 62); ctx.restore(); }
    else if (h.star >= 5 || h.def.grade === 'S') { ctx.save(); ctx.shadowColor = '#f1c40f'; ctx.shadowBlur = 14 + Math.sin(this.t * 4) * 5; ctx.strokeStyle = 'rgba(241,196,15,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(sx + 12, sy + 2, 40, 62); ctx.restore(); }
    ctx.drawImage(img, sx, sy);
    if (h.flash > 0) { ctx.globalAlpha = Math.min(1, h.flash / 0.12) * 0.5; ctx.drawImage(flashSprite(img), sx, sy); ctx.globalAlpha = 1; }
    this.#hpBar(h.x, h.y + 6, h.hp / h.maxHp, '#27ae60', 40);
    // 스킬 게이지: 체력 바 바로 아래 한 줄. 주기는 캐릭터마다 다르므로 **차는 속도**가 곧 그 캐릭터의 성격이다.
    if (h.skillUnlocked) this.#skillGauge(h.x, h.y + 13, h.skillCd <= 0 ? 1 : 1 - h.skillCd / Math.max(0.001, h.skillCdMax ?? 5), 40);
    ctx.fillStyle = '#ecf0f1'; ctx.font = 'bold 10px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`Lv${h.level}`, h.x, h.y + 12);
  }

  #drawMonster(m) {
    const { ctx } = this;
    const frame = Math.floor(m.animT * (m.anim === 'walk' ? 8 : 5)) % 4;
    const img = monsterSprite(m.def, frame);
    const knock = m.flash ? 6 * (m.flash / 0.12) : 0;
    const lunge = m.lunge > 0 ? -14 * (m.lunge / 0.2) : 0;
    const cx = m.x + lunge + knock + (m.shake ? (Math.random() - 0.5) * 3 * m.shake : 0);
    const bottom = m.y + 4;
    this.#shadow(m.x, bottom, img.width / 3.2);
    if (!m.alive) {
      const k = Math.min(1, m.deadT * 3.5);
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.translate(m.x, bottom); ctx.scale(1 + k * 0.5, 1 - k); ctx.drawImage(img, -img.width / 2, -img.height); ctx.restore();
      return;
    }
    // Pixel-art rule: never scale the sprite by a fractional factor (it makes outlines uneven / "thick").
    // Spawn pop and attack lunge are expressed as whole-pixel offsets on the 2px grid instead of squash.
    const bounce = m.spawnT < 0.3 ? Math.round(Math.sin((m.spawnT / 0.3) * Math.PI) * -6) * 2 : 0;
    const hop = m.lunge > 0 ? -2 : 0;
    ctx.save();
    if (m.stun > 0) ctx.globalAlpha = 0.7;
    ctx.translate(Math.round(cx / 2) * 2, Math.round((bottom + bounce + hop) / 2) * 2);
    ctx.drawImage(img, -img.width / 2, -img.height);
    if (m.flash > 0) { ctx.globalAlpha = Math.min(1, m.flash / 0.12) * 0.85; ctx.drawImage(flashSprite(img), -img.width / 2, -img.height); }
    ctx.restore();
    if (m.stun > 0) { ctx.fillStyle = '#c39bd3'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('zZ', m.x + 20, bottom - img.height - 4); }
    if (!m.isBoss) this.#hpBar(m.x, bottom + 6, m.hp / m.maxHp, m.elite ? '#f1c40f' : '#e74c3c', m.elite ? 48 : 40);
    if (m.shield > 0) { const w = m.elite ? 48 : 40; ctx.fillStyle = 'rgba(116,185,255,0.9)'; ctx.fillRect(m.x - w / 2, bottom + 4, Math.max(2, w * Math.min(1, m.shield / m.maxHp)), 2); }
    if (m.elite && m.def.affix && m.alive) { ctx.font = 'bold 10px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(m.def.affix.name, m.x, bottom - img.height - 6); ctx.fillStyle = '#f9e79f'; ctx.fillText(m.def.affix.name, m.x, bottom - img.height - 6); }
    if (m.isBoss && m.enraged && m.alive) { ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(this.t * 10) * 0.15; ctx.shadowColor = '#e74c3c'; ctx.shadowBlur = 24; ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 3; ctx.strokeRect(m.x - img.width / 2 + 6, bottom - img.height + 4, img.width - 12, img.height - 8); ctx.restore(); }
    if (m.isBoss && m.warn && m.alive) {
      const p = 0.5 + Math.sin(this.t * 12) * 0.5;
      ctx.save(); ctx.translate(m.x, bottom - img.height - 18 - p * 4); ctx.font = 'bold 26px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText('!', 0, 0); ctx.fillStyle = p > 0.5 ? '#e74c3c' : '#f9e79f'; ctx.fillText('!', 0, 0); ctx.restore();
    }
  }

  // ------------------------------------------------------------- effects --
  #drawEffects(em) {
    const { ctx } = this;
    for (const f of em.effects) {
      const k = f.t / f.life;
      switch (f.type) {
        case 'slash': {
          const r = f.big ? 34 : 24; ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle ?? 0);
          ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = f.big ? 6 : 4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(0, 0, r, -1.2 + k * 0.6, 1.0 + k * 0.8); ctx.stroke();
          ctx.globalAlpha = (1 - k) * 0.5; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r + 6, -0.9 + k * 0.6, 0.8 + k * 0.8); ctx.stroke();
          ctx.restore(); break;
        }
        case 'ring': {
          const r = Math.max(1, 10 + (f.radius - 10) * Math.sqrt(Math.max(0, k))); ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = f.color; ctx.lineWidth = 3 + (1 - k) * 3;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; break;
        }
        case 'sparkle': {
          const n = f.n ?? 6; ctx.fillStyle = f.color;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + i, rr = 12 + k * 26, x = f.x + Math.cos(a) * rr, y = f.y - 20 - k * 40 + Math.sin(a) * rr * 0.5; ctx.globalAlpha = 1 - k; ctx.fillRect(x - 2, y - 1, 4, 2); ctx.fillRect(x - 1, y - 2, 2, 4); }
          ctx.globalAlpha = 1; break;
        }
        case 'puff': {
          ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = f.color;
          for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4, rr = 6 + k * 14; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, Math.max(0.5, 5 - k * 3), 0, Math.PI * 2); ctx.fill(); }
          ctx.globalAlpha = 1; break;
        }
        case 'impact': {
          const n = f.big ? 8 : 6, len = (f.big ? 18 : 11) * (0.4 + k), r0 = 3 + k * 6;
          ctx.save(); ctx.translate(f.x, f.y); ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = f.big ? 3 : 2; ctx.lineCap = 'round'; ctx.beginPath();
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len)); }
          ctx.stroke(); ctx.restore(); break;
        }
        case 'crit': {
          ctx.save(); ctx.translate(f.x, f.y - k * 10); ctx.rotate(k * 0.6); ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color;
          const R = Math.max(1, 16 + k * 10), r = R * 0.45; ctx.beginPath();
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : R; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break;
        }
        case 'stamp': { // 결재 도장: slams down (scale 1.6 → 1), then fades — red office stamp with the text
          const slam = Math.min(1, k / 0.25), sc = 1.6 - 0.6 * slam, a = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
          ctx.save(); ctx.translate(Math.round(f.x), Math.round(f.y)); ctx.rotate(-0.18); ctx.scale(sc, sc); ctx.globalAlpha = a * 0.95;
          const col = f.color ?? '#c0392b'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(-24, -13, 48, 26); ctx.strokeRect(-20, -9, 40, 18);
          ctx.fillStyle = col; ctx.font = 'bold 13px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(f.text ?? '결재', 0, 1);
          ctx.restore(); break;
        }
        case 'papers': { // 서류 폭풍: sheets fan out from the caster over the enemy line, tumbling
          const n = f.n ?? 10; ctx.save();
          for (let i = 0; i < n; i++) {
            const seed = (i * 7919) % 97 / 97, ang = -0.5 + seed * 1.0, spd = 0.6 + ((i * 31) % 13) / 13 * 0.8;
            const x = f.x + k * (f.spread ?? 300) * spd, y = f.y + Math.sin(k * 6 + i) * 10 + ang * 60 * k + k * k * 40;
            ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(k * 5 * (i % 2 ? 1 : -1) + seed); ctx.globalAlpha = Math.max(0, 1 - k * 1.1);
            ctx.fillStyle = '#fdfdfd'; ctx.fillRect(-5, -6, 10, 12); ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 1; ctx.strokeRect(-5, -6, 10, 12);
            ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-3, -3, 6, 1); ctx.fillRect(-3, 0, 6, 1); ctx.fillRect(-3, 3, 4, 1); ctx.restore();
          }
          ctx.restore(); break;
        }
        case 'grid': { // 셀 격자 낙하: a spreadsheet grid drops over the enemy area, cells lighting up in a wave
          const cw = 24, ch = 16, cols = Math.ceil(f.w / cw), rows = Math.ceil(f.h / ch), drop = Math.min(1, k / 0.3), y0 = f.y - (1 - drop) * 60;
          ctx.save(); ctx.globalAlpha = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) * 0.9; ctx.strokeStyle = f.color ?? '#8e44ad'; ctx.lineWidth = 1;
          for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(Math.round(f.x + c * cw) + 0.5, Math.round(y0)); ctx.lineTo(Math.round(f.x + c * cw) + 0.5, Math.round(y0 + rows * ch)); ctx.stroke(); }
          for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(Math.round(f.x), Math.round(y0 + r * ch) + 0.5); ctx.lineTo(Math.round(f.x + cols * cw), Math.round(y0 + r * ch) + 0.5); ctx.stroke(); }
          const wave = k * (cols + rows); ctx.fillStyle = f.color ?? '#8e44ad';
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const d = wave - (c + r); if (d > 0 && d < 3) { ctx.globalAlpha = (1 - d / 3) * 0.55; ctx.fillRect(Math.round(f.x + c * cw) + 1, Math.round(y0 + r * ch) + 1, cw - 1, ch - 1); } }
          ctx.restore(); break;
        }
        case 'chart': { // 실적 차트: four bars shoot up above the hero (buff)
          const hs = [14, 22, 18, 30], cols = ['#27ae60', '#2ecc71', '#1e8449', '#f1c40f'];
          ctx.save(); ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; ctx.translate(Math.round(f.x) - 14, Math.round(f.y) - k * 12);
          ctx.fillStyle = '#2c3e50'; ctx.fillRect(-2, 0, 32, 1);
          for (let i = 0; i < 4; i++) { const hgt = Math.round(hs[i] * Math.min(1, k * 1.6 - i * 0.12)); if (hgt > 0) { ctx.fillStyle = cols[i]; ctx.fillRect(i * 8, -hgt, 6, hgt); } }
          ctx.restore(); break;
        }
        case 'coffee': { // 커피 수혈: a cup with rising steam above a healed hero
          ctx.save(); ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; ctx.translate(Math.round(f.x), Math.round(f.y) - k * 10);
          ctx.fillStyle = '#6d4c41'; ctx.fillRect(-7, 0, 14, 11); ctx.fillStyle = '#fff'; ctx.fillRect(-7, 0, 14, 2); ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 2; ctx.strokeRect(7, 3, 4, 5);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.5;
          for (let i = -1; i <= 1; i++) { ctx.beginPath(); for (let j = 0; j <= 4; j++) { const yy = -2 - j * 3 - k * 10, xx = i * 4 + Math.sin(k * 8 + j + i) * 2; if (j) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); }
          ctx.restore(); break;
        }
        case 'flame': { // 화상: three pixel flames flicker upward
          ctx.save(); ctx.globalAlpha = 1 - k;
          for (let i = -1; i <= 1; i++) { const hgt = 8 + Math.round(Math.sin(this.t * 20 + i) * 3), x = Math.round(f.x + i * 9), y = Math.round(f.y - k * 14); ctx.fillStyle = '#e67e22'; ctx.fillRect(x - 3, y - hgt, 6, hgt); ctx.fillStyle = '#f1c40f'; ctx.fillRect(x - 1, y - hgt + 3, 2, hgt - 5); }
          ctx.restore(); break;
        }
        case 'dash': { // 가속: speed lines trailing behind the hero
          ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = '#f9e79f';
          for (let i = 0; i < 4; i++) { const len = 10 + i * 4, y = Math.round(f.y - 8 + i * 6), x = Math.round(f.x - 20 - k * 30 - i * 5); ctx.fillRect(x - len, y, len, 2); }
          ctx.restore(); break;
        }
        case 'muzzle': { ctx.globalAlpha = 1 - k; ctx.fillStyle = f.color; ctx.fillRect(f.x, f.y - 3, 10 + k * 8, 6); ctx.fillStyle = '#fff'; ctx.fillRect(f.x + 2, f.y - 1, 6, 2); ctx.globalAlpha = 1; break; }
        case 'stars': {
          ctx.fillStyle = f.color; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (let i = 0; i < 3; i++) { const a = this.t * 4 + i * 2.1; ctx.fillText('★', f.x + Math.cos(a) * 18, f.y + Math.sin(a) * 6); }
          break;
        }
      }
    }
  }

  #drawParticles(em) {
    const { ctx } = this;
    for (const p of em.particles) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size); }
    ctx.globalAlpha = 1;
  }

  #shadow(x, y, rx) { const { ctx } = this; ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }

  #hpBar(x, y, ratio, color, w = 44) {
    const { ctx } = this; const h = 5;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = ratio > 0.5 ? color : ratio > 0.25 ? '#f39c12' : '#c0392b';
    ctx.fillRect(x - w / 2, y, Math.max(0, w * Math.min(1, ratio)), h);
  }

  /**
   * 스킬 게이지 — 체력 바보다 얇게(3px), 다 차면 밝게 빛나 '지금 쓴다'가 보이게.
   * 체력과 같은 두께로 그리면 둘이 헷갈린다. 색도 스킬 연출의 보라 계열로 묶는다.
   */
  #skillGauge(x, y, ratio, w = 40) {
    const { ctx } = this; const h = 3; const r = Math.max(0, Math.min(1, ratio)); const full = r >= 1;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#3a3550'; ctx.fillRect(x - w / 2, y, w, h);
    if (full) { // 가득 차면 맥동 — 눈이 가야 하는 순간이다
      const pulse = 0.65 + 0.35 * Math.sin(this.t * 6);
      ctx.fillStyle = `rgba(241, 196, 15, ${pulse.toFixed(3)})`;
      ctx.fillRect(x - w / 2, y, w, h);
    } else {
      ctx.fillStyle = '#8e6bd0'; ctx.fillRect(x - w / 2, y, w * r, h);
    }
  }

  #drawProjectiles(em) {
    const { ctx } = this;
    for (const p of em.projectiles) {
      if (p.kind === 'none') continue;
      const k = Math.min(1, p.t / p.dur);
      const arc = p.hostile ? 26 : 16;
      const x = p.x + (p.tx - p.x) * k, y = p.y + (p.ty - p.y) * k - Math.sin(k * Math.PI) * arc;
      if (p.kind !== 'heal') { // fading trail behind the projectile
        for (let i = 1; i <= 3; i++) { const kk = Math.max(0, k - i * 0.07); const tx = p.x + (p.tx - p.x) * kk, ty = p.y + (p.ty - p.y) * kk - Math.sin(kk * Math.PI) * arc; ctx.globalAlpha = 0.35 - i * 0.1; ctx.fillStyle = p.color || '#fff'; ctx.beginPath(); ctx.arc(tx, ty, 4 - i, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      ctx.save(); ctx.translate(Math.round(x), Math.round(y));
      switch (p.kind) {
        case 'paper': ctx.rotate(k * 6); ctx.fillStyle = '#fff'; ctx.fillRect(-6, -8, 12, 16); ctx.fillStyle = p.color; ctx.fillRect(-4, -5, 8, 2); ctx.fillRect(-4, -1, 6, 2); ctx.fillRect(-4, 3, 8, 2); break;
        case 'bar': ctx.rotate(k * 4); ctx.fillStyle = p.color; ctx.fillRect(-4, -9, 8, 18); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-4, -9, 8, 3); break;
        case 'arrow': ctx.rotate(Math.atan2(p.ty - p.y, p.tx - p.x)); ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-2, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); break;
        case 'drop': ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, 5, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-2, -4, 2, 3); break;
        case 'sand': ctx.fillStyle = p.color; for (let i = 0; i < 5; i++) ctx.fillRect(-6 + i * 3, ((i * 7) % 5) - 2, 2, 2); break;
        case 'heal': ctx.fillStyle = p.color; ctx.fillRect(-3, -1, 6, 2); ctx.fillRect(-1, -3, 2, 6); break;
        default: ctx.fillStyle = p.color || '#555'; ctx.fillRect(-3, -3, 6, 6); ctx.globalAlpha = 0.4; ctx.fillRect(-(p.tx - p.x) * 0.05 - 2, -2, 4, 4);
      }
      ctx.restore();
    }
  }

  /** Character speech bubbles (profile lines) above heroes — pixel-cornered white box with a tail. */
  #drawBubbles(em) {
    const { ctx } = this;
    for (const h of [...em.heroes, ...em.monsters.filter((m) => m.isBoss)]) {
      if (!h.say || !h.alive) continue;
      const a = Math.min(1, h.say.t / 0.3, (3.2 - h.say.t) / 0.15 + 0.01);
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.font = '12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const text = h.say.text.length > 34 ? h.say.text.slice(0, 33) + '…' : h.say.text;
      const w = Math.ceil(ctx.measureText(text).width) + 16, hgt = 24;
      let x = Math.round(h.x - w / 2), y = Math.round(h.y - (h.isBoss ? 150 : 96));
      x = Math.max(6, Math.min(CANVAS_W - w - 6, x));
      ctx.fillStyle = h.isBoss ? '#fdecea' : '#fff'; ctx.fillRect(x, y, w, hgt); ctx.fillStyle = h.isBoss ? '#7b241c' : '#2c3e50'; ctx.fillRect(x - 2, y + 2, 2, hgt - 4); ctx.fillRect(x + w, y + 2, 2, hgt - 4); ctx.fillRect(x + 2, y - 2, w - 4, 2); ctx.fillRect(x + 2, y + hgt, w - 4, 2);
      const tx = Math.round(Math.max(x + 8, Math.min(x + w - 12, h.x - 4))); ctx.fillStyle = '#fff'; ctx.fillRect(tx, y + hgt, 8, 4); ctx.fillRect(tx + 2, y + hgt + 4, 4, 2); ctx.fillStyle = '#2c3e50'; ctx.fillRect(tx - 2, y + hgt + 2, 2, 2); ctx.fillRect(tx + 8, y + hgt + 2, 2, 2);
      ctx.fillStyle = '#222'; ctx.fillText(text, x + 8, y + hgt / 2 + 1);
      ctx.restore();
    }
  }

  #drawFloaters(em) {
    const { ctx } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of em.floaters) {
      const a = 1 - f.t; const y = f.y - f.t * 36;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `bold ${f.big ? 16 : 13}px Consolas, monospace`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
