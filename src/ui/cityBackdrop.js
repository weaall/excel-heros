// Ruined-city backdrop for the side-view battle: the monsters appeared overnight and the company's staff fight their
// way through the districts. Parallax layers (sky → far skyline → damaged buildings → sidewalk/road → rubble) are all
// world-anchored by hashing the column index, so they scroll consistently and never pop. Pure Canvas 2D, no assets.
const hash = (n) => { let x = (n * 2654435761) >>> 0; x ^= x >>> 15; x = (x * 2246822519) >>> 0; x ^= x >>> 13; return x / 4294967296; };
const rnd = (seed, i) => hash(seed * 7919 + i * 104729);

export const HORIZON = 262;    // where the road meets the buildings
const SIDEWALK = 292;          // sidewalk / road boundary

/** theme: { sky: [top, horizon], glow, far, mid, window, road } (see stages.js PHASES). */
export function drawCity(ctx, scroll, t, theme, W, H) {
  drawSky(ctx, theme, t, scroll, W);
  drawSkyline(ctx, scroll * 0.15, theme.far, W, 0.55, 1000);          // far silhouettes
  drawBuildings(ctx, scroll * 0.45, theme, W, 2000);                    // damaged mid buildings with windows
  drawSmoke(ctx, scroll * 0.45, t, W, 2000);
  drawRoad(ctx, scroll, theme, W, H);
  drawRubble(ctx, scroll, theme, W, H, 3000);
  drawAsh(ctx, t, W, H);
}

function drawSky(ctx, theme, t, scroll, W) {
  const g = ctx.createLinearGradient(0, 0, 0, HORIZON); g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, HORIZON);
  // low sun / moon with a haze glow, drifting very slowly
  const sx = ((W * 0.72 - scroll * 0.03) % (W + 200) + W + 200) % (W + 200) - 100, sy = 120;
  const glow = ctx.createRadialGradient(sx, sy, 6, sx, sy, 120); glow.addColorStop(0, theme.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, HORIZON);
  ctx.fillStyle = theme.glow.replace(/[\d.]+\)$/, '0.9)'); ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill();
  // drifting clouds / smoke haze bands
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 4; i++) { const cx = ((i * 260 + t * 6 * (1 + i * 0.2) - scroll * 0.05) % (W + 300) + W + 300) % (W + 300) - 150; ctx.beginPath(); ctx.ellipse(cx, 40 + i * 38, 120, 12 + i * 3, 0, 0, Math.PI * 2); ctx.fill(); }
}

function drawSkyline(ctx, off, color, W, alpha, seed) {
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
  const unit = 56; const off0 = Math.floor(off / unit);
  for (let i = -1; i <= W / unit + 2; i++) {
    const col = off0 + i, x = i * unit - (off % unit); const h = 60 + rnd(seed, col) * 120, w = unit - 6 - rnd(seed, col + 1) * 14;
    const top = HORIZON - h; ctx.beginPath(); ctx.moveTo(x, HORIZON);
    // jagged, broken top edge
    const steps = 4; for (let s = 0; s <= steps; s++) { const px = x + (w * s) / steps; const dy = rnd(seed, col * 10 + s) < 0.35 ? rnd(seed, col * 20 + s) * 26 : 0; ctx.lineTo(px, top + dy); }
    ctx.lineTo(x + w, HORIZON); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBuildings(ctx, off, theme, W, seed) {
  const unit = 96; const off0 = Math.floor(off / unit);
  for (let i = -1; i <= W / unit + 2; i++) {
    const col = off0 + i, x = i * unit - (off % unit); const w = 70 + rnd(seed, col) * 22, h = 90 + rnd(seed, col + 3) * 110; const top = HORIZON - h;
    const broken = rnd(seed, col + 7) < 0.55; // most buildings lost a corner
    ctx.fillStyle = theme.mid; ctx.beginPath(); ctx.moveTo(x, HORIZON); ctx.lineTo(x, top + (broken ? 18 : 0));
    if (broken) { const cut = 0.35 + rnd(seed, col + 9) * 0.4; ctx.lineTo(x + w * cut * 0.5, top + 30); ctx.lineTo(x + w * cut, top + 4); ctx.lineTo(x + w * (cut + 0.2), top + 22); ctx.lineTo(x + w, top + 10); }
    else ctx.lineTo(x + w, top);
    ctx.lineTo(x + w, HORIZON); ctx.closePath(); ctx.fill();
    // facade shade strip
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + w - 10, top + 24, 10, h - 24);
    // windows: lit (yellow), dark, or blown out (black hole with soot)
    const cols = Math.floor((w - 12) / 12), rows = Math.floor((h - 40) / 14);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x + 8 + c * 12, wy = top + 30 + r * 14; if (broken && wy < top + 34) continue;
      const k = rnd(seed, col * 1000 + r * 40 + c);
      if (k < 0.12) { ctx.fillStyle = theme.window; ctx.fillRect(wx, wy, 6, 8); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(wx + 1, wy + 1, 2, 3); }
      else if (k < 0.3) { ctx.fillStyle = '#0c0f16'; ctx.fillRect(wx - 1, wy - 1, 8, 10); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(wx - 2, wy + 8, 10, 3); }
      else { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(wx, wy, 6, 8); }
    }
    // cracks
    if (rnd(seed, col + 13) < 0.6) { ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); let cx = x + 10 + rnd(seed, col + 17) * (w - 20), cy = HORIZON - 10; ctx.moveTo(cx, cy); for (let s = 0; s < 5; s++) { cx += (rnd(seed, col * 31 + s) - 0.5) * 18; cy -= 12 + rnd(seed, col * 37 + s) * 14; ctx.lineTo(cx, cy); } ctx.stroke(); }
    // ground-floor rubble line
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 4, HORIZON - 6, w + 8, 6);
  }
}

function drawSmoke(ctx, off, t, W, seed) {
  const unit = 96; const off0 = Math.floor(off / unit);
  for (let i = -1; i <= W / unit + 2; i++) {
    const col = off0 + i; if (rnd(seed, col + 21) > 0.28) continue;
    const x = i * unit - (off % unit) + 30 + rnd(seed, col + 23) * 30, base = HORIZON - 90 - rnd(seed, col + 3) * 110 + 10;
    for (let p = 0; p < 6; p++) { const k = ((t * 0.25 + p / 6 + rnd(seed, col + p)) % 1); const r = 6 + k * 22, y = base - k * 110, dx = Math.sin((t + p) * 0.8 + col) * 10 * k; ctx.fillStyle = `rgba(60,60,70,${0.32 * (1 - k)})`; ctx.beginPath(); ctx.arc(x + dx + k * 14, y, r, 0, Math.PI * 2); ctx.fill(); }
  }
}

function drawRoad(ctx, scroll, theme, W, H) {
  // sidewalk with slabs, then asphalt with a scrolling dashed centre line
  ctx.fillStyle = theme.walk ?? '#5c6068'; ctx.fillRect(0, HORIZON, W, SIDEWALK - HORIZON);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, HORIZON, W, 3); ctx.fillRect(0, SIDEWALK - 4, W, 4);
  const slab = 48, so = Math.floor(scroll % slab);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = -so; x <= W; x += slab) { ctx.moveTo(x + 0.5, HORIZON + 3); ctx.lineTo(x + 0.5, SIDEWALK - 4); }
  ctx.stroke();
  ctx.fillStyle = theme.road ?? '#2f3238'; ctx.fillRect(0, SIDEWALK, W, H - SIDEWALK);
  const g = ctx.createLinearGradient(0, SIDEWALK, 0, H); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); ctx.fillStyle = g; ctx.fillRect(0, SIDEWALK, W, H - SIDEWALK);
  // centre line dashes (faded, some missing) and cracks
  const dash = 64, doff = Math.floor(scroll % (dash * 2)), col0 = Math.floor(scroll / (dash * 2));
  for (let i = -1; i <= W / (dash * 2) + 1; i++) { if (hash((col0 + i) * 13) < 0.25) continue; ctx.fillStyle = 'rgba(230,200,90,0.45)'; ctx.fillRect(i * dash * 2 - doff, 372, dash, 5); }
  const cunit = 160, co = Math.floor(scroll % cunit), cc0 = Math.floor(scroll / cunit);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
  for (let i = -1; i <= W / cunit + 1; i++) { const c = cc0 + i; if (hash(c * 17) > 0.6) continue; let x = i * cunit - co + hash(c * 19) * 100, y = SIDEWALK + 10 + hash(c * 23) * 80; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 5; s++) { x += 10 + hash(c * 29 + s) * 22; y += (hash(c * 31 + s) - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
}

function drawRubble(ctx, scroll, theme, W, H, seed) {
  const unit = 128; const off0 = Math.floor(scroll / unit);
  for (let i = -1; i <= W / unit + 1; i++) {
    const col = off0 + i, x = i * unit - (scroll % unit); const k = rnd(seed, col);
    if (k < 0.3) { // concrete rubble pile on the sidewalk
      const px = x + rnd(seed, col + 1) * 60, py = SIDEWALK - 2;
      ctx.fillStyle = '#6e7178'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 14, py - 16); ctx.lineTo(px + 30, py - 10); ctx.lineTo(px + 44, py - 20); ctx.lineTo(px + 60, py); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4a4d55'; ctx.fillRect(px + 20, py - 8, 12, 8); ctx.fillStyle = '#8b8e95'; ctx.fillRect(px + 36, py - 12, 8, 6);
      ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 6, py - 4); ctx.lineTo(px + 10, py - 26); ctx.stroke(); // rebar
    } else if (k < 0.42) { // abandoned car, side view, on the far lane
      const cx = x + 20, cy = SIDEWALK + 26; const body = ['#7f3b3b', '#3b5f7f', '#6b6b3b', '#555'][Math.floor(rnd(seed, col + 2) * 4)];
      ctx.fillStyle = body; ctx.beginPath(); ctx.roundRect(cx, cy - 18, 78, 18, 4); ctx.fill(); ctx.beginPath(); ctx.roundRect(cx + 16, cy - 32, 44, 16, 6); ctx.fill();
      ctx.fillStyle = 'rgba(120,180,220,0.5)'; ctx.fillRect(cx + 20, cy - 29, 16, 10); ctx.fillRect(cx + 40, cy - 29, 16, 10);
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx + 16, cy, 7, 0, Math.PI * 2); ctx.arc(cx + 62, cy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx + 4, cy - 12, 20, 6); // dent
    } else if (k < 0.5) { // bent street lamp
      const lx = x + 90; ctx.strokeStyle = '#3a3d44'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, SIDEWALK); ctx.lineTo(lx + 6, HORIZON - 70); ctx.lineTo(lx + 26, HORIZON - 84); ctx.stroke();
      ctx.fillStyle = rnd(seed, col + 5) < 0.5 ? theme.window : '#222'; ctx.fillRect(lx + 22, HORIZON - 92, 10, 8);
    }
    // scattered papers (the office fled in a hurry)
    if (rnd(seed, col + 8) < 0.5) for (let p = 0; p < 3; p++) { const px = x + rnd(seed, col * 50 + p) * unit, py = SIDEWALK + 20 + rnd(seed, col * 60 + p) * 90; ctx.save(); ctx.translate(px, py); ctx.rotate((rnd(seed, col * 70 + p) - 0.5) * 1.2); ctx.fillStyle = 'rgba(235,235,225,0.85)'; ctx.fillRect(-5, -3, 10, 7); ctx.fillStyle = 'rgba(80,80,80,0.5)'; ctx.fillRect(-3, -1, 6, 1); ctx.fillRect(-3, 1, 5, 1); ctx.restore(); }
  }
}

function drawAsh(ctx, t, W, H) {
  ctx.fillStyle = 'rgba(220,220,220,0.35)';
  for (let i = 0; i < 26; i++) { const x = ((i * 137 + t * (8 + (i % 5) * 3)) % (W + 40)) - 20, y = ((i * 71 + t * (14 + (i % 3) * 6)) % (H + 20)) - 10; ctx.fillRect(x, y, 2, 2); }
}
