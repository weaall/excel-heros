// Bootstrap: load save → offline reward → game loop (sim + UI + canvas).
import { BALANCE, offlineGold } from './config/balance.js';
import { GameManager } from './core/GameManager.js';
import { SaveManager } from './core/SaveManager.js';
import { createInitialState } from './core/state.js';
import { Renderer } from './ui/Renderer.js';
import { UIManager } from './ui/UIManager.js';

const save = new SaveManager();
const loaded = save.load();
const game = new GameManager({ state: loaded ?? createInitialState(), save });
const renderer = new Renderer(document.getElementById('battle'), game);
const ui = new UIManager(game, renderer);

if (loaded) {
  const report = SaveManager.computeOffline(loaded, Date.now(), (stage) => game.goldPerSecAt(stage));
  if (report && report.gold > 0) { game.applyOffline(report); ui.showOffline(report); }
} else {
  game.log('New workbook created. Welcome aboard!', 'info');
  ui.showWelcome();
}
game.persist();

// --- Simulation loop -------------------------------------------------------
// setInterval keeps ticking (≥1 Hz) in throttled/background tabs; the elapsed
// time is simulated in fixed sub-steps so combat speed stays constant. Gaps
// longer than 30 s are paid out with the offline formula instead.
const STEP = 0.1, IDLE_GAP = 30;
let lastSim = performance.now();
function simulate() {
  const now = performance.now();
  let dt = (now - lastSim) / 1000; lastSim = now;
  if (dt <= 0) return;
  if (dt > IDLE_GAP) {
    const seconds = Math.min(dt, BALANCE.OFFLINE_CAP_SEC);
    const gps = game.goldPerSecAt(game.state.maxStage);
    game.applyOffline({ seconds, elapsed: dt, capped: dt > BALANCE.OFFLINE_CAP_SEC, goldPerSec: gps, gold: offlineGold(gps, seconds) });
    dt = STEP;
  }
  while (dt > 0) { const step = Math.min(dt, STEP); game.tick(step); dt -= step; }
}
setInterval(simulate, 50);

// --- Render loop -----------------------------------------------------------
let lastDraw = performance.now();
function frame(now) {
  const dt = Math.min(0.5, (now - lastDraw) / 1000); lastDraw = now;
  ui.update(dt);
  if (!game.state.settings.stealth) renderer.draw(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle (handy for balance tuning in DevTools): EH.game.state.gold = 1e6
window.EH = { game, ui, renderer, BALANCE };
