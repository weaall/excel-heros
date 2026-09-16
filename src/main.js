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
import { loadCardArt, onCardArtLoaded } from './data/cardArt.js';

// Boot screen: every step reports here so a slow network shows progress instead of a frozen page.
const bootStep = (pct, text) => { const b = document.getElementById('boot-bar'), t = document.getElementById('boot-status'); if (b) b.style.width = `${pct}%`; if (t) t.textContent = text; };
bootStep(10, '스프라이트를 불러오는 중…');
// Hand-made sprite sheets (assets/sprites/manifest.json) override the procedural art when present.
const [sheetCount, packOk] = await Promise.all([loadSpriteSheets(), loadPack()]);
// Card illustrations load in the background (WebP thumbnails, ~1.7 MB total); cards re-render as they arrive.
let artDone = 0; const artPromise = loadCardArt().then((n) => { console.info(`[cardArt] ${n} illustration(s) loaded`); return n; });
if (!packOk) console.warn('[pack] CC0 sprite pack unavailable; using procedural art');
if (sheetCount) console.info(`[sprites] ${sheetCount} sheet(s) loaded`);

bootStep(30, '저장 데이터를 확인하는 중…');
const save = new SaveManager();
const loaded = save.load();
const game = new GameManager({ state: loaded ?? createInitialState(), save });
const renderer = new Renderer(document.getElementById('battle'), game);
const ui = new UIManager(game, renderer);
ui.sound = new SoundManager(game);
document.addEventListener('pointerdown', () => ui.sound.unlock(), { once: true });

// --- Account first -----------------------------------------------------------
// With a cloud server configured, the game does not start until the player signs in with Google; the account copy
// is the source of truth and this browser's save is only an offline cache.
const devGuest = location.hostname === 'localhost' && new URLSearchParams(location.search).has('guest'); // local testing only
const needGate = !devGuest && game.cloud.configured() && !!globalThis.EXCEL_HEROES_CLOUD?.googleClientId && !game.cloud.auth.loggedIn();
bootStep(55, needGate ? '로그인을 기다리는 중…' : '계정을 확인하는 중…');
if (needGate) { document.getElementById('boot')?.classList.add('done'); await ui.showLoginGate(); }
let cloudLoaded = false;
if (game.cloud.enabled()) {
  try {
    const r = await game.cloud.pull(); // server copy wins when it is newer or further along
    const local = game.state; const srv = r?.save;
    if (srv && ((r.updatedAt ?? 0) > (local.lastSaved ?? 0) + 5000 || (srv.stats?.playSeconds ?? 0) > local.stats.playSeconds + 30)) { game.loadCloudSave(srv); cloudLoaded = true; }
  } catch { /* offline or server down: keep local */ }
}
bootStep(85, '통합 문서를 여는 중…');
const startState = game.state;
if (loaded || cloudLoaded) {
  const report = SaveManager.computeOffline(startState, Date.now(), (stage) => game.goldPerSecAt(stage));
  if (report && report.gold > 0) { game.applyOffline(report); ui.showOffline(report); }
} else {
  game.log('새 통합 문서가 생성되었습니다. 입사를 환영합니다!', 'info');
  ui.showWelcome();
}
game.persist();
bootStep(100, '준비 완료');
setTimeout(() => { const b = document.getElementById('boot'); if (b) { b.classList.add('done'); setTimeout(() => b.remove(), 300); } }, 150);
// re-render cards when illustrations finish arriving (progressive: roster refresh every few images, once at the end)
onCardArtLoaded((id, n) => { artDone = n; if (n % 8 === 0) game.emit('roster'); });
artPromise.then(() => { game.emit('roster'); game.emit('gacha-art'); });

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
