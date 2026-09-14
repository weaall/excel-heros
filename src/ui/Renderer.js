// Canvas renderer: pixel office floor, 64px sprites, HP bars, floating text, boss bar.
import { GRID, CANVAS_W, CANVAS_H } from '../core/EntityManager.js';
import { heroSprite, monsterSprite } from '../data/sprites.js';
import { GRADES } from '../data/heroes.js';
import { fmt } from '../utils/format.js';
import { BALANCE } from '../config/balance.js';

const WALL_H = 96;

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.game = game;
    canvas.width = CANVAS_W; canvas.height = CANVAS_H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.t = 0;
    this.bg = this.#buildBackground();
  }

  draw(dt) {
    this.t += dt;
    const { ctx } = this; const em = this.game.entities;
    ctx.drawImage(this.bg, 0, 0);
    this.#drawBossBar(em);
    const entities = [...em.monsters, ...em.heroes].sort((a, b) => a.y - b.y);
    for (const e of entities) (e.kind === 'hero' ? this.#drawHero(e) : this.#drawMonster(e));
    this.#drawProjectiles(em);
    this.#drawFloaters(em);
    this.#drawBuff(em);
  }

  // ----------------------------------------------------------- background --
  #buildBackground() {
    const c = document.createElement('canvas'); c.width = CANVAS_W; c.height = CANVAS_H;
    const ctx = c.getContext('2d');
    // wall
    const wall = ctx.createLinearGradient(0, 0, 0, WALL_H);
    wall.addColorStop(0, '#dfe6ea'); wall.addColorStop(1, '#c9d3d9');
    ctx.fillStyle = wall; ctx.fillRect(0, 0, CANVAS_W, WALL_H);
    ctx.fillStyle = '#b8c2c8'; ctx.fillRect(0, WALL_H - 8, CANVAS_W, 8);           // baseboard
    ctx.fillStyle = '#9aa5ab'; ctx.fillRect(0, WALL_H - 2, CANVAS_W, 2);
    // windows
    for (const x of [64, 352, 640]) {
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x - 4, 12, 136, 64);
      const sky = ctx.createLinearGradient(0, 16, 0, 72);
      sky.addColorStop(0, '#8ec5ff'); sky.addColorStop(1, '#d9ecff');
      ctx.fillStyle = sky; ctx.fillRect(x, 16, 128, 56);
      ctx.fillStyle = '#7f8c8d'; ctx.fillRect(x + 62, 16, 4, 56); ctx.fillRect(x, 42, 128, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + 8, 22, 22, 6); ctx.fillRect(x + 80, 30, 30, 6); // clouds
    }
    // whiteboard with a tiny chart
    ctx.fillStyle = '#ffffff'; ctx.fillRect(208, 16, 112, 60); ctx.strokeStyle = '#8395a7'; ctx.lineWidth = 3; ctx.strokeRect(208, 16, 112, 60);
    ctx.fillStyle = '#217346'; for (const [i, h] of [[0, 18], [1, 30], [2, 24], [3, 40]]) ctx.fillRect(222 + i * 22, 66 - h, 12, h);
    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(216, 60); ctx.lineTo(240, 48); ctx.lineTo(262, 52); ctx.lineTo(286, 34); ctx.lineTo(310, 30); ctx.stroke();
    // clock
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(560, 44, 18, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(560, 44); ctx.lineTo(560, 32); ctx.moveTo(560, 44); ctx.lineTo(569, 48); ctx.stroke();
    // floor tiles (checker)
    for (let y = WALL_H; y < CANVAS_H; y += 32) for (let x = 0; x < CANVAS_W; x += 32) {
      ctx.fillStyle = ((x / 32 + y / 32) % 2 === 0) ? '#efe9dc' : '#e4ddcf'; ctx.fillRect(x, y, 32, 32);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= CANVAS_W; x += 64) { ctx.moveTo(x + 0.5, WALL_H); ctx.lineTo(x + 0.5, CANVAS_H); }
    for (let y = WALL_H; y <= CANVAS_H; y += 64) { ctx.moveTo(0, y + 0.5); ctx.lineTo(CANVAS_W, y + 0.5); }
    ctx.stroke();
    // plants
    for (const x of [24, CANVAS_W - 40]) {
      ctx.fillStyle = '#b5651d'; ctx.fillRect(x - 10, WALL_H - 18, 20, 18);
      ctx.fillStyle = '#27ae60'; ctx.beginPath(); ctx.ellipse(x, WALL_H - 30, 16, 14, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.ellipse(x - 6, WALL_H - 38, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    // arrow strip on the floor pointing left ("incoming")
    ctx.fillStyle = 'rgba(33,115,70,0.08)'; ctx.fillRect(CANVAS_W - 96, WALL_H, 96, CANVAS_H - WALL_H);
    return c;
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

  #drawBuff(em) {
    if (em.atkBuff.mult <= 1 || em.atkBuff.until < em.time) return;
    const { ctx } = this;
    ctx.fillStyle = 'rgba(142,68,173,0.85)'; ctx.fillRect(8, CANVAS_H - 26, 260, 20);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`▲ 팀 싱크: ATK ×${em.atkBuff.mult.toFixed(2)} (${Math.max(0, em.atkBuff.until - em.time).toFixed(1)}s)`, 14, CANVAS_H - 16);
  }

  // ------------------------------------------------------------ entities --
  #drawHero(h) {
    const { ctx } = this;
    let frame;
    if (h.anim === 'attack') frame = h.animT < 0.15 ? 0 : 1;
    else if (h.anim === 'walk') frame = Math.floor(h.animT * 6) % 2;
    else frame = Math.floor(h.animT * 2) % 2;
    const img = heroSprite(h.def, h.anim, frame);
    const sx = Math.round(h.x - 32 + (h.shake ? (Math.random() - 0.5) * 4 * h.shake : 0)), sy = Math.round(h.y - 32);
    this.#shadow(h.x, h.y + 30, 22);
    if (!h.alive) {
      ctx.globalAlpha = 0.3; ctx.drawImage(img, sx, sy); ctx.globalAlpha = 1;
      ctx.fillStyle = '#7f8c8d'; ctx.font = 'bold 12px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${Math.ceil(h.reviveT)}s`, h.x, h.y + 44);
      return;
    }
    if (h.star >= 5 || h.def.grade === 'S') { ctx.save(); ctx.shadowColor = '#f1c40f'; ctx.shadowBlur = 14 + Math.sin(this.t * 4) * 5; ctx.strokeStyle = 'rgba(241,196,15,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(sx - 3, sy - 3, 70, 70); ctx.restore(); }
    else if (h.star >= 3) { ctx.strokeStyle = GRADES[h.def.grade].color; ctx.lineWidth = 1; ctx.strokeRect(sx - 2.5, sy - 2.5, 69, 69); }
    ctx.drawImage(img, sx, sy);
    this.#hpBar(h.x, h.y + 34, h.hp / h.maxHp, '#27ae60', 44);
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`Lv${h.level}`, h.x, h.y + 39);
  }

  #drawMonster(m) {
    const { ctx } = this;
    const frame = Math.floor(m.animT * 3) % 2;
    const img = monsterSprite(m.def, frame);
    const lunge = m.lunge > 0 ? -10 : 0;
    const sx = Math.round(m.x - img.width / 2 + lunge + (m.shake ? (Math.random() - 0.5) * 4 * m.shake : 0));
    const sy = Math.round(m.y - img.height / 2);
    this.#shadow(m.x, m.y + img.height / 2 - 4, img.width / 3);
    if (!m.alive) { ctx.globalAlpha = Math.max(0, 1 - m.deadT * 4); ctx.drawImage(img, sx, sy); ctx.globalAlpha = 1; return; }
    if (m.stun > 0) ctx.globalAlpha = 0.7;
    ctx.drawImage(img, sx, sy);
    ctx.globalAlpha = 1;
    if (m.stun > 0) { ctx.fillStyle = '#8e44ad'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('zZ', m.x + 20, sy - 4); }
    if (!m.isBoss) this.#hpBar(m.x, m.y + 34, m.hp / m.maxHp, m.elite ? '#f1c40f' : '#e74c3c', m.elite ? 52 : 44);
  }

  #shadow(x, y, rx) { const { ctx } = this; ctx.fillStyle = 'rgba(0,0,0,0.13)'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI * 2); ctx.fill(); }

  #hpBar(x, y, ratio, color, w = 44) {
    const { ctx } = this; const h = 5;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x - w / 2, y, w, h);
    ctx.fillStyle = ratio > 0.5 ? color : ratio > 0.25 ? '#f39c12' : '#c0392b';
    ctx.fillRect(x - w / 2, y, Math.max(0, w * Math.min(1, ratio)), h);
  }

  #drawProjectiles(em) {
    const { ctx } = this;
    for (const p of em.projectiles) {
      const k = Math.min(1, p.t / p.dur);
      const x = p.x + (p.tx - p.x) * k, y = p.y + (p.ty - p.y) * k - Math.sin(k * Math.PI) * 16;
      ctx.fillStyle = p.color || '#555'; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
      ctx.globalAlpha = 0.4; ctx.fillRect(Math.round(x - (p.tx - p.x) * 0.05) - 2, Math.round(y) - 2, 4, 4); ctx.globalAlpha = 1;
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
