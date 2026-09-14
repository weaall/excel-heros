// Bootstrap: load save → offline reward → game loop (sim + UI + canvas).
import { BALANCE } from './config/balance.js';
import { GameManager } from './core/GameManager.js';
import { SaveManager } from './core/SaveManager.js';
import { createInitialState } from './core/state.js';
import { Renderer } from './ui/Renderer.js';
import { UIManager } from './ui/UIManager.js';
import { SoundManager } from './ui/Sound.js';
import { loadSpriteSheets } from './data/spriteSheets.js';
import { loadPack } from './data/packSprites.js';

// Hand-made sprite sheets (assets/sprites/manifest.json) override the procedural art when present.
const [sheetCount, packOk] = await Promise.all([loadSpriteSheets(), loadPack()]);
if (!packOk) console.warn('[pack] CC0 sprite pack unavailable; using procedural art');
if (sheetCount) console.info(`[sprites] ${sheetCount} sheet(s) loaded`);

const save = new SaveManager();
const loaded = save.load();
const game = new GameManager({ state: loaded ?? createInitialState(), save });
const renderer = new Renderer(document.getElementById('battle'), game);
const ui = new UIManager(game, renderer);
ui.sound = new SoundManager(game);
document.addEventListener('pointerdown', () => ui.sound.unlock(), { once: true });

if (loaded) {
  const report = SaveManager.computeOffline(loaded, Date.now(), (stage) => game.goldPerSecAt(stage));
  if (report && report.gold > 0) { game.applyOffline(report); ui.showOffline(report); }
} else {
  game.log('새 통합 문서가 생성되었습니다. 입사를 환영합니다!', 'info');
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
  if (dt > IDLE_GAP) { game.applyOffline(game.idleReport(dt)); dt = STEP; }
  while (dt > 0) { const step = Math.min(dt, STEP); game.tick(step); dt -= step; }
}
setInterval(simulate, 50);

// --- Render loop -----------------------------------------------------------
let lastDraw = performance.now();
function frame(now) {
  const dt = Math.min(0.5, (now - lastDraw) / 1000); lastDraw = now;
  ui.update(dt);
  // a rendering bug must never kill the frame loop (the sim keeps running regardless)
  if (!game.state.settings.excel) { try { renderer.draw(dt); } catch (e) { if (!frame.warned) { frame.warned = true; console.error("[render]", e); } } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug handle (handy for balance tuning in DevTools): EH.game.state.gold = 1e6
window.EH = { game, ui, renderer, BALANCE };
