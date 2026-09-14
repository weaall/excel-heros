// Canvas renderer: scrolling dungeon (0x72 tiles), side-view line combat, effects, projectiles,
// particles, hit flashes, screen shake, stage banners and the boss cut-in.
import { CANVAS_W, CANVAS_H, GROUND_Y, GRID } from '../core/EntityManager.js';
import { heroSprite, monsterSprite, flashSprite } from '../data/sprites.js';
import { TILES, PROPS, drawTile, drawProp, packReady } from '../data/packSprites.js';
import { GRADES } from '../data/heroes.js';
import { stageLabel, BALANCE } from '../config/balance.js';
import { bossForStage } from '../data/monsters.js';
import { phaseTheme, phaseName, stageModifier } from '../data/stages.js';
import { fmt } from '../utils/format.js';

const TILE = 32;                       // 16px tiles drawn at 2x
const WALL_ROWS = 3;                   // wall band height in tiles
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x / 4294967296; };

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.t = 0;
    this.banner = null;
    this.selected = null;   // { col, row } selected worksheet cell (Excel-style selection box)
    game.on('challengeStart', ({ stage, boss }) => {
      this.banner = boss
        ? { kind: 'boss', text: `${bossForStage(stage).name} 등장!`, sub: `${bossForStage(stage).desc} · ${BALANCE.BOSS_TIME_LIMIT}초 안에 처리`, t: 0, life: 2.4 }
        : { kind: 'challenge', text: `${stageLabel(stage)} 도전`, sub: `${phaseName(stage)}${stageModifier(stage) ? ` · ${stageModifier(stage).name}: ${stageModifier(stage).desc}` : ` · 오류 ${BALANCE.KILLS_PER_STAGE}건 처리 시 클리어`}`, t: 0, life: stageModifier(stage) ? 2.2 : 1.6 };
    });
    game.on('cleared', ({ stage, boss, first }) => {
      this.banner = { kind: 'clear', text: boss ? '보스 처리 완료!' : `${stageLabel(stage)} 마감!`, sub: first ? '첫 클리어 보상 지급' : '반복 클리어', t: 0, life: 1.5 };
    });
    game.on('ult', ({ hero }) => { this.banner = { kind: 'skill', text: hero.skillName ?? 'ULT', sub: hero.def.name, hero, t: 0, life: 1.3 }; });
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
    this.#drawBuff(em);
    this.#drawCombo(em);
    ctx.restore();
    if (em.flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${(em.flashT / 0.18) * 0.55})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
    this.#drawSelection();
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
  #drawDungeon(scroll) {
    const { ctx } = this;
    const phase = Math.floor((this.game.state.stage - 1) / BALANCE.BOSS_EVERY);
    if (!packReady()) { this.#drawFallbackDungeon(scroll); return; }
    // wall band (parallax 0.6) with banners, holes, fountains and columns
    const wallOff = Math.floor((scroll * 0.6) % TILE);
    const wallCol0 = Math.floor((scroll * 0.6) / TILE);
    const flame = Math.floor(this.t * 6) % 3;
    for (let i = -1; i <= CANVAS_W / TILE + 1; i++) {
      const col = wallCol0 + i, dx = i * TILE - wallOff;
      drawTile(ctx, TILES.wall_top, dx, 0);
      const m5 = ((col % 5) + 5) % 5, m7 = ((col % 7) + 7) % 7, m9 = ((col % 9) + 9) % 9;
      if (m7 === 3) { // animated fountain
        drawTile(ctx, TILES.fountain_top, dx, 0); drawTile(ctx, [64 + 16 * flame, 16], dx, TILE); drawTile(ctx, [64 + 16 * flame, 32], dx, TILE * 2); continue;
      }
      if (m9 === 5) { drawTile(ctx, TILES.wall_mid, dx, TILE); drawTile(ctx, TILES.column_top, dx, TILE); drawTile(ctx, TILES.column_mid, dx, TILE * 2); drawTile(ctx, TILES.column_base, dx, TILE * 3); continue; }
      const banner = m5 === 1 ? ['banner_red', 'banner_blue', 'banner_green', 'banner_yellow'][((Math.floor(col / 5) + phase) % 4 + 4) % 4] : null;
      drawTile(ctx, banner ? TILES[banner] : TILES.wall_mid, dx, TILE);
      drawTile(ctx, TILES.wall_mid, dx, TILE * 2);
    }
    // floor (full-speed scroll), tile picked per world column/row so it stays put while scrolling
    const floorOff = Math.floor(scroll % TILE), col0 = Math.floor(scroll / TILE);
    for (let row = WALL_ROWS; row < CANVAS_H / TILE; row++) {
      for (let i = -1; i <= CANVAS_W / TILE + 1; i++) {
        const col = col0 + i; const k = hash(col * 101 + row * 7 + phase * 3);
        const tile = TILES.floor[k < 0.62 ? 0 : Math.floor(k * TILES.floor.length)];
        drawTile(ctx, tile, i * TILE - floorOff, row * TILE);
      }
    }
    // floor props along the wall base and the bottom edge (crates, flasks, coins) — world-anchored like the tiles
    const PROP_KEYS = ['crate', 'flask_red', 'flask_blue', 'flask_green', 'coin'];
    for (let i = -1; i <= CANVAS_W / TILE + 1; i++) {
      const col = col0 + i, k = hash(col * 31 + phase * 17), dx = i * TILE - floorOff;
      if (k < 0.14) drawProp(ctx, PROPS[PROP_KEYS[Math.min(PROP_KEYS.length - 1, Math.floor(k / 0.14 * PROP_KEYS.length))]], dx, WALL_ROWS * TILE - (k < 0.028 ? 16 : 0), 2);
      const k2 = hash(col * 53 + phase * 29 + 7);
      if (k2 > 0.9) drawProp(ctx, PROPS.crate, dx, CANVAS_H - 44, 2);
    }
    // phase tint so deeper phases feel different, plus a soft vignette at the wall base
    const theme = phaseTheme(this.game.state.stage);
    if (theme.tint > 0) { ctx.fillStyle = `hsla(${theme.hue}, 60%, 40%, ${theme.tint})`; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); }
    const g = ctx.createLinearGradient(0, WALL_ROWS * TILE, 0, WALL_ROWS * TILE + 40);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, WALL_ROWS * TILE, CANVAS_W, 40);
  }

  #drawFallbackDungeon(scroll) {
    const { ctx } = this;
    ctx.fillStyle = '#2c3440'; ctx.fillRect(0, 0, CANVAS_W, TILE * WALL_ROWS);
    ctx.fillStyle = '#3d4654'; ctx.fillRect(0, TILE * WALL_ROWS, CANVAS_W, CANVAS_H);
    const off = Math.floor(scroll % TILE);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath();
    for (let x = -off; x <= CANVAS_W; x += TILE) { ctx.moveTo(x + 0.5, TILE * WALL_ROWS); ctx.lineTo(x + 0.5, CANVAS_H); }
    for (let y = TILE * WALL_ROWS; y <= CANVAS_H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(CANVAS_W, y + 0.5); }
    ctx.stroke();
  }

  // ------------------------------------------------------------ overlays --
  #drawBossBar(em) {
    if (!em.boss) return;
    const b = em.boss; const { ctx } = this;
    const x = 16, y = 8, w = CANVAS_W - 32, h = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 4, y - 4, w + 8, h + 14);
    ctx.fillStyle = '#5a1a12'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#e74c3c'; ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), h);
    ctx.fillStyle = '#f1c40f'; ctx.fillRect(x, y + h + 2, w * Math.min(1, em.bossTimer / BALANCE.BOSS_TIME_LIMIT), 4);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${b.def.name}   ${fmt(b.hp)} / ${fmt(b.maxHp)}   ⏱ ${em.bossTimer.toFixed(1)}s`, x + w / 2, y + h / 2);
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

  #drawBuff(em) {
    if (em.atkBuff.mult <= 1 || em.atkBuff.until < em.time) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(142,68,173,0.85)'; ctx.fillRect(8, CANVAS_H - 26, 260, 20);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`▲ 팀 싱크: ATK ×${em.atkBuff.mult.toFixed(2)} (${Math.max(0, em.atkBuff.until - em.time).toFixed(1)}s)`, 14, CANVAS_H - 16);
  }

  #drawBanner(dt) {
    const b = this.banner; if (!b) return;
    b.t += dt; if (b.t >= b.life) { this.banner = null; return; }
    const { ctx } = this; const k = b.t / b.life;
    const fade = Math.min(1, k * 6, (1 - k) * 4);
    const slide = k < 0.15 ? (1 - k / 0.15) * -300 : 0;
    ctx.save(); ctx.globalAlpha = fade;
    if (b.kind === 'boss') {
      ctx.fillStyle = 'rgba(30,0,0,0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(-60 + slide, 150); ctx.lineTo(CANVAS_W + 60 + slide, 110); ctx.lineTo(CANVAS_W + 60 + slide, 210); ctx.lineTo(-60 + slide, 250); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 40px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.text, CANVAS_W / 2 - 60 + slide, 178);
      ctx.font = 'bold 15px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = '#f9e79f'; ctx.fillText(b.sub, CANVAS_W / 2 - 60 + slide, 230);
      const boss = this.game.entities.boss;
      if (boss) { const img = monsterSprite(boss.def, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(img, CANVAS_W - 300 + slide * 0.5, 100, img.width * 2, img.height * 2); }
    } else if (b.kind === 'skill') {
      // ultimate cut-in: purple sash + the caster's sprite blown up on the left
      ctx.fillStyle = 'rgba(40,0,60,0.35)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx.fillStyle = '#6c3483'; ctx.beginPath(); ctx.moveTo(-60 + slide, 130); ctx.lineTo(CANVAS_W + 60 + slide, 170); ctx.lineTo(CANVAS_W + 60 + slide, 250); ctx.lineTo(-60 + slide, 210); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 36px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.text, CANVAS_W / 2 + 70 + slide, 190);
      ctx.font = 'bold 14px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = '#e8daef'; ctx.fillText(b.sub, CANVAS_W / 2 + 70 + slide, 228);
      const img = heroSprite(b.hero.def, 'attack', 1); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 60 + slide * 0.5, 80, img.width * 3, img.height * 3);
    } else {
      const col = b.kind === 'clear' ? '#217346' : b.kind === 'challenge' ? '#1f5fa8' : '#5d6d7e';
      ctx.fillStyle = col; ctx.globalAlpha = fade * 0.9; ctx.fillRect(slide, 150, CANVAS_W, 64);
      ctx.globalAlpha = fade; ctx.fillStyle = '#fff'; ctx.font = 'bold 28px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.text, CANVAS_W / 2 + slide, 174);
      if (b.sub) { ctx.font = '13px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(b.sub, CANVAS_W / 2 + slide, 200); }
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
      const k = Math.min(1, (BALANCE.HERO_REVIVE_SEC - h.reviveT) * 4);
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
    const pop = m.spawnT < 0.3 ? Math.min(1.15, m.spawnT / 0.3 * 1.15) * (m.spawnT > 0.22 ? (1.15 - (m.spawnT - 0.22) / 0.08 * 0.15) / 1.15 : 1) : 1;
    const sqx = (m.lunge > 0 ? 1.12 : 1) * pop, sqy = (m.lunge > 0 ? 0.9 : 1) * pop;
    ctx.save();
    if (m.stun > 0) ctx.globalAlpha = 0.7;
    ctx.translate(Math.round(cx), Math.round(bottom)); ctx.scale(sqx, sqy);
    ctx.drawImage(img, -img.width / 2, -img.height);
    if (m.flash > 0) { ctx.globalAlpha = Math.min(1, m.flash / 0.12) * 0.85; ctx.drawImage(flashSprite(img), -img.width / 2, -img.height); }
    ctx.restore();
    if (m.stun > 0) { ctx.fillStyle = '#c39bd3'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('zZ', m.x + 20, bottom - img.height - 4); }
    if (!m.isBoss) this.#hpBar(m.x, bottom + 6, m.hp / m.maxHp, m.elite ? '#f1c40f' : '#e74c3c', m.elite ? 48 : 40);
    if (m.shield > 0) { const w = m.elite ? 48 : 40; ctx.fillStyle = 'rgba(116,185,255,0.9)'; ctx.fillRect(m.x - w / 2, bottom + 4, Math.max(2, w * Math.min(1, m.shield / m.maxHp)), 2); }
    if (m.elite && m.def.affix && m.alive) { ctx.font = 'bold 10px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(m.def.affix.name, m.x, bottom - img.height - 6); ctx.fillStyle = '#f9e79f'; ctx.fillText(m.def.affix.name, m.x, bottom - img.height - 6); }
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
          const r = 10 + (f.radius - 10) * Math.sqrt(k); ctx.globalAlpha = (1 - k) * 0.8; ctx.strokeStyle = f.color; ctx.lineWidth = 3 + (1 - k) * 3;
          ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; break;
        }
        case 'sparkle': {
          const n = f.n ?? 6; ctx.fillStyle = f.color;
          for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + i, rr = 12 + k * 26, x = f.x + Math.cos(a) * rr, y = f.y - 20 - k * 40 + Math.sin(a) * rr * 0.5; ctx.globalAlpha = 1 - k; ctx.fillRect(x - 2, y - 1, 4, 2); ctx.fillRect(x - 1, y - 2, 2, 4); }
          ctx.globalAlpha = 1; break;
        }
        case 'puff': {
          ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = f.color;
          for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4, rr = 6 + k * 14; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 5 - k * 3, 0, Math.PI * 2); ctx.fill(); }
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
          const R = 16 + k * 10, r = R * 0.45; ctx.beginPath();
          for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : R; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore(); break;
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
