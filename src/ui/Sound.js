// Zero-dependency WebAudio SFX. Everything is synthesised (no audio files), rate-limited per sound,
// muted while the boss key (Excel mode) is on, and off by default — this is a game pretending to be a spreadsheet.
const MIN_GAP = { hit: 0.06, hurt: 0.08, kill: 0.05, coin: 0.05, skill: 0.15, ult: 0.3, boss: 1, clear: 0.5, gacha: 0.2, chest: 0.2, wipe: 1, upgrade: 0.05, levelup: 0.2, prestige: 1 };

export class SoundManager {
  constructor(game) {
    this.game = game; this.ctx = null; this.last = {};
    game.on('sfx', (name) => this.play(name));
    game.on('cleared', ({ boss }) => this.play(boss ? 'ult' : 'clear'));
    game.on('challengeStart', ({ boss }) => { if (boss) this.play('boss'); });
    game.on('gacha', () => this.play('gacha'));
    game.on('wipe', () => this.play('wipe'));
    game.on('prestige', () => this.play('prestige'));
  }
  get enabled() { return !!this.game.state.settings.sound && !this.game.state.settings.excel; }
  /** Must be called from a user gesture at least once so the AudioContext may start. */
  unlock() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; } }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  play(name) {
    if (!this.enabled) return;
    this.unlock(); const ac = this.ctx; if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (now - (this.last[name] ?? -1) < (MIN_GAP[name] ?? 0.1)) return;
    this.last[name] = now;
    const fn = this[`_${name}`]; if (fn) fn.call(this, ac, now);
  }

  // --- primitives ---------------------------------------------------------
  #tone(ac, t, { freq = 440, to = null, type = 'square', dur = 0.12, vol = 0.08, delay = 0 }) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t + delay);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + delay + dur);
    g.gain.setValueAtTime(0.0001, t + delay); g.gain.exponentialRampToValueAtTime(vol, t + delay + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g).connect(ac.destination); o.start(t + delay); o.stop(t + delay + dur + 0.02);
  }
  #noise(ac, t, { dur = 0.08, vol = 0.06, freq = 800, delay = 0 }) {
    const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t + delay); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    src.connect(f).connect(g).connect(ac.destination); src.start(t + delay);
  }

  // --- sounds --------------------------------------------------------------
  _hit(ac, t) { this.#noise(ac, t, { dur: 0.06, vol: 0.05, freq: 1200 }); this.#tone(ac, t, { freq: 220, to: 90, type: 'triangle', dur: 0.07, vol: 0.05 }); }
  _hurt(ac, t) { this.#tone(ac, t, { freq: 160, to: 70, type: 'sawtooth', dur: 0.12, vol: 0.05 }); }
  _kill(ac, t) { this.#noise(ac, t, { dur: 0.12, vol: 0.07, freq: 500 }); this.#tone(ac, t, { freq: 300, to: 60, type: 'square', dur: 0.14, vol: 0.05 }); }
  _coin(ac, t) { this.#tone(ac, t, { freq: 1320, type: 'square', dur: 0.06, vol: 0.04 }); this.#tone(ac, t, { freq: 1760, type: 'square', dur: 0.1, vol: 0.04, delay: 0.06 }); }
  _skill(ac, t) { this.#tone(ac, t, { freq: 400, to: 1200, type: 'sawtooth', dur: 0.18, vol: 0.05 }); this.#noise(ac, t, { dur: 0.15, vol: 0.04, freq: 2000, delay: 0.05 }); }
  _ult(ac, t) { for (const [i, f] of [262, 330, 392, 523].entries()) this.#tone(ac, t, { freq: f, type: 'square', dur: 0.35, vol: 0.05, delay: i * 0.07 }); this.#noise(ac, t, { dur: 0.4, vol: 0.05, freq: 300, delay: 0.25 }); }
  _boss(ac, t) { this.#tone(ac, t, { freq: 110, to: 55, type: 'sawtooth', dur: 0.7, vol: 0.08 }); this.#tone(ac, t, { freq: 165, to: 82, type: 'square', dur: 0.7, vol: 0.04, delay: 0.05 }); }
  _clear(ac, t) { for (const [i, f] of [523, 659, 784].entries()) this.#tone(ac, t, { freq: f, type: 'square', dur: 0.16, vol: 0.06, delay: i * 0.09 }); }
  _gacha(ac, t) { for (const [i, f] of [660, 880, 1100, 1320, 1760].entries()) this.#tone(ac, t, { freq: f, type: 'triangle', dur: 0.12, vol: 0.05, delay: i * 0.05 }); }
  _chest(ac, t) { for (const [i, f] of [1568, 1976, 2637].entries()) this.#tone(ac, t, { freq: f, type: 'triangle', dur: 0.14, vol: 0.05, delay: i * 0.06 }); }
  _wipe(ac, t) { this.#tone(ac, t, { freq: 300, to: 60, type: 'sawtooth', dur: 0.6, vol: 0.06 }); }
  _upgrade(ac, t) { this.#tone(ac, t, { freq: 880, to: 1100, type: 'square', dur: 0.07, vol: 0.04 }); }
  _levelup(ac, t) { this.#tone(ac, t, { freq: 784, type: 'square', dur: 0.08, vol: 0.05 }); this.#tone(ac, t, { freq: 1175, type: 'square', dur: 0.14, vol: 0.05, delay: 0.08 }); }
  _prestige(ac, t) { for (const [i, f] of [392, 494, 587, 784, 988].entries()) this.#tone(ac, t, { freq: f, type: 'triangle', dur: 0.3, vol: 0.06, delay: i * 0.1 }); }
}
