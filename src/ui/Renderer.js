// Canvas renderer: draws the A1:G15 grid, pixel sprites, "conditional formatting" HP bars.
import { GRID, CANVAS_W, CANVAS_H } from '../core/EntityManager.js';
import { heroSprite, monsterSprite } from '../data/sprites.js';
import { GRADES } from '../data/heroes.js';
import { fmt } from '../utils/format.js';
import { BALANCE } from '../config/balance.js';

const COLS = 'ABCDEFG';
const GRID_LINE = '#d4d4d4', HEADER_BG = '#f3f3f3', HEADER_FG = '#444', SELECT = '#217346';

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.t = 0;
  }

  draw(dt) {
    this.t += dt;
    const { ctx } = this; const em = this.game.entities;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    this.#drawGrid();
    this.#drawBossBar(em);
    this.#drawSelection(em);

    const entities = [...em.monsters, ...em.heroes].sort((a, b) => a.y - b.y);
    for (const e of entities) (e.kind === 'hero' ? this.#drawHero(e) : this.#drawMonster(e));
    this.#drawProjectiles(em);
    this.#drawFloaters(em);
    this.#drawBuff(em);
    this.#drawHeaders();
  }

  // ---------------------------------------------------------------- grid --
  #drawGrid() {
    const { ctx } = this; const { cols, rows, cellW, cellH, headerW, headerH } = GRID;
    ctx.strokeStyle = GRID_LINE; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) { const x = headerW + c * cellW + 0.5; ctx.moveTo(x, headerH); ctx.lineTo(x, CANVAS_H); }
    for (let r = 0; r <= rows; r++) { const y = headerH + r * cellH + 0.5; ctx.moveTo(headerW, y); ctx.lineTo(CANVAS_W, y); }
    ctx.stroke();
  }

  #drawHeaders() {
    const { ctx } = this; const { cols, rows, cellW, cellH, headerW, headerH } = GRID;
    ctx.fillStyle = HEADER_BG;
    ctx.fillRect(0, 0, CANVAS_W, headerH); ctx.fillRect(0, 0, headerW, CANVAS_H);
    ctx.strokeStyle = '#c6c6c6'; ctx.beginPath();
    ctx.moveTo(0, headerH + 0.5); ctx.lineTo(CANVAS_W, headerH + 0.5);
    ctx.moveTo(headerW + 0.5, 0); ctx.lineTo(headerW + 0.5, CANVAS_H);
    for (let c = 1; c < cols; c++) { const x = headerW + c * cellW + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, headerH); }
    for (let r = 1; r < rows; r++) { const y = headerH + r * cellH + 0.5; ctx.moveTo(0, y); ctx.lineTo(headerW, y); }
    ctx.stroke();
    ctx.fillStyle = HEADER_FG; ctx.font = '11px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let c = 0; c < cols; c++) ctx.fillText(COLS[c], headerW + c * cellW + cellW / 2, headerH / 2 + 1);
    for (let r = 0; r < rows; r++) ctx.fillText(String(r + 1), headerW / 2, headerH + r * cellH + cellH / 2 + 1);
    // selected-cell header highlight (leader's column/row)
    const lead = this.game.entities.heroes[0];
    if (lead) {
      const { c, r } = this.#cellOf(lead);
      ctx.fillStyle = 'rgba(33,115,70,0.15)';
      ctx.fillRect(headerW + c * cellW, 0, cellW, headerH); ctx.fillRect(0, headerH + r * cellH, headerW, cellH);
      ctx.fillStyle = SELECT; ctx.fillRect(headerW + c * cellW, headerH - 2, cellW, 2); ctx.fillRect(headerW - 2, headerH + r * cellH, 2, cellH);
    }
  }

  #cellOf(e) {
    const c = Math.min(GRID.cols - 1, Math.max(0, Math.floor((e.x - GRID.headerW) / GRID.cellW)));
    const r = Math.min(GRID.rows - 1, Math.max(0, Math.floor((e.y - GRID.headerH) / GRID.cellH)));
    return { c, r };
  }

  #drawSelection(em) {
    const lead = em.heroes[0]; if (!lead) return;
    const { c, r } = this.#cellOf(lead); const { ctx } = this;
    const x = GRID.headerW + c * GRID.cellW, y = GRID.headerH + r * GRID.cellH;
    ctx.fillStyle = 'rgba(33,115,70,0.06)'; ctx.fillRect(x, y, GRID.cellW, GRID.cellH);
    ctx.strokeStyle = SELECT; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, GRID.cellW - 2, GRID.cellH - 2);
    ctx.fillStyle = SELECT; ctx.fillRect(x + GRID.cellW - 5, y + GRID.cellH - 5, 5, 5); // fill handle
    ctx.lineWidth = 1;
  }

  #drawBossBar(em) {
    if (!em.boss) return;
    const b = em.boss; const { ctx } = this;
    const x = GRID.headerW, y = GRID.headerH, w = GRID.cols * GRID.cellW, h = GRID.cellH;
    const hpRatio = Math.max(0, b.hp / b.maxHp);
    ctx.fillStyle = '#fde9e7'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#f1948a'; ctx.fillRect(x, y, w * hpRatio, h);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x, y + h - 3, w * Math.min(1, em.bossTimer / BALANCE.BOSS_TIME_LIMIT), 3);
    ctx.fillStyle = '#5a1a12'; ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${b.def.name}   ${fmt(b.hp)} / ${fmt(b.maxHp)}   ⏱ ${em.bossTimer.toFixed(1)}s`, x + w / 2, y + h / 2 - 1);
  }

  // ------------------------------------------------------------ entities --
  #drawHero(h) {
    const { ctx } = this;
    let frame;
    if (h.anim === 'attack') frame = h.animT < 0.15 ? 0 : 1;
    else if (h.anim === 'walk') frame = Math.floor(h.animT * 6) % 2;
    else frame = Math.floor(h.animT * 2) % 2;
    const img = heroSprite(h.def, h.anim, frame);
    const sx = h.x - 16 + (h.shake ? (Math.random() - 0.5) * 4 * h.shake : 0), sy = h.y - 16;

    if (!h.alive) {
      ctx.globalAlpha = 0.3; ctx.drawImage(img, Math.round(sx), Math.round(sy)); ctx.globalAlpha = 1;
      ctx.fillStyle = '#7f8c8d'; ctx.font = '10px "Segoe UI", Arial'; ctx.textAlign = 'center';
      ctx.fillText(`${Math.ceil(h.reviveT)}s`, h.x, h.y + 26);
      return;
    }
    // star effects: ≥3 grade-colored cell border, 5 golden glow
    if (h.star >= 5) { ctx.save(); ctx.shadowColor = '#f1c40f'; ctx.shadowBlur = 10 + Math.sin(this.t * 4) * 4; ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.strokeRect(sx - 3, sy - 3, 38, 38); ctx.restore(); }
    else if (h.star >= 3) { ctx.strokeStyle = GRADES[h.def.grade].color; ctx.lineWidth = 1; ctx.strokeRect(sx - 2.5, sy - 2.5, 37, 37); }

    ctx.drawImage(img, Math.round(sx), Math.round(sy));
    this.#hpBar(h.x, h.y + 18, h.hp / h.maxHp, '#27ae60');
    ctx.fillStyle = '#333'; ctx.font = '9px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`Lv${h.level}`, h.x, h.y + 22);
  }

  #drawMonster(m) {
    const { ctx } = this;
    const frame = Math.floor(m.animT * 3) % 2;
    const img = monsterSprite(m.def, frame);
    const lunge = m.lunge > 0 ? -8 : 0;
    const sx = m.x - img.width / 2 + lunge + (m.shake ? (Math.random() - 0.5) * 4 * m.shake : 0);
    const sy = m.y - img.height / 2;
    if (!m.alive) { ctx.globalAlpha = Math.max(0, 1 - m.deadT * 4); ctx.drawImage(img, Math.round(sx), Math.round(sy)); ctx.globalAlpha = 1; return; }
    if (m.stun > 0) { ctx.globalAlpha = 0.7; }
    ctx.drawImage(img, Math.round(sx), Math.round(sy));
    ctx.globalAlpha = 1;
    if (m.stun > 0) { ctx.fillStyle = '#8e44ad'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('zZ', m.x + 10, sy - 2); }
    if (!m.isBoss) this.#hpBar(m.x, m.y + 18, m.hp / m.maxHp, '#e74c3c');
  }

  #hpBar(x, y, ratio, color) {
    const { ctx } = this; const w = 28, h = 3;
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = ratio > 0.5 ? color : ratio > 0.25 ? '#f39c12' : '#c0392b';
    ctx.fillRect(x - w / 2, y, Math.max(0, w * Math.min(1, ratio)), h);
  }

  #drawProjectiles(em) {
    const { ctx } = this;
    for (const p of em.projectiles) {
      const k = Math.min(1, p.t / p.dur);
      const x = p.x + (p.tx - p.x) * k, y = p.y + (p.ty - p.y) * k - Math.sin(k * Math.PI) * 10;
      ctx.fillStyle = p.color || '#555'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      ctx.globalAlpha = 0.4; ctx.fillRect(Math.round(x - (p.tx - p.x) * 0.05) - 1, Math.round(y) - 1, 2, 2); ctx.globalAlpha = 1;
    }
  }

  #drawFloaters(em) {
    const { ctx } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of em.floaters) {
      const a = 1 - f.t; const y = f.y - f.t * 28;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `bold ${f.big ? 13 : 11}px Consolas, monospace`;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(f.text, f.x, y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  #drawBuff(em) {
    if (em.atkBuff.mult <= 1 || em.atkBuff.until < em.time) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(142,68,173,0.12)'; ctx.fillRect(GRID.headerW, CANVAS_H - GRID.cellH, GRID.cols * GRID.cellW, GRID.cellH);
    ctx.fillStyle = '#6c3483'; ctx.font = 'bold 11px "Segoe UI", Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`▲ 팀 싱크: ATK ×${em.atkBuff.mult.toFixed(2)} (${Math.max(0, em.atkBuff.until - em.time).toFixed(1)}s)`, GRID.headerW + 6, CANVAS_H - GRID.cellH / 2);
  }
}
