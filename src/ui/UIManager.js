// DOM layer: ribbon, formula bar, sheets, task pane, card grid, quests, boss-key view, dialogs.
import { BALANCE, teamUpgradeCost, isBossStage, stageLabel } from '../config/balance.js';
import { HEROES, GRADES, GRADE_ORDER, ROLES, TRAITS, MAIN_ID, MAIN_TIER_TITLES } from '../data/heroes.js';
import { stagePool, eliteChance, bossForStage } from '../data/monsters.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { phaseName, stageModifier } from '../data/stages.js';
import * as Achievements from '../core/AchievementManager.js';
import { ALL_CLEAR_BONUS } from '../data/quests.js';
import { heroIconDataURL, cardCanvas, portraitCanvas, monsterSprite } from '../data/sprites.js';
import { GRID } from '../core/EntityManager.js';
import * as Quests from '../core/QuestManager.js';
import { fmt, fmtTime, pct, stars } from '../utils/format.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
};
const btn = (label, onclick, cls = '', disabled = false) => { const b = el('button', { class: `xl-btn ${cls}`, onclick }, label); b.disabled = disabled; return b; };

const RIBBON_SHEET = { home: 'home', insert: 'gacha', data: 'roster', review: 'quests' };
const GameManager_HISTORY_STEP = () => 5;
const SHEET_RIBBON = { home: 'home', gacha: 'insert', roster: 'data', quests: 'review' };
const COLS = 'ABCDEFGHIJKLM';
const STEALTH_FORMULAS = ['=SUMIFS(Sheet2!D:D,Sheet2!A:A,"Q3",Sheet2!B:B,">0")', '=IFERROR(VLOOKUP(A14,Sheet3!$A:$F,4,FALSE),"")', '=INDEX(Data!$C:$C,MATCH(B2,Data!$A:$A,0))'];
const rewardText = (r) => [r.gems && `보석 ${r.gems}`, r.gold && `골드 ${fmt(r.gold)}`, r.cards && `카드 ${r.cards}`].filter(Boolean).join(' · ');

export class UIManager {
  constructor(game, renderer) {
    this.game = game; this.renderer = renderer;
    this.acc = 0; this.formulaIdx = 0; this.formulaTimer = 0; this.stealthTimer = 0;
    this.heroRows = new Map(); this.teamRows = new Map();
    this.gachaLog = []; this.detailId = null;
    this.#buildGridHeaders();
    this.#bind();
    this.#subscribe();
    this.rebuildAll();
    this.applyStealth(game.state.settings.excel, true);
  }

  // ----------------------------------------------------------------- bind --
  /** Column letters across the whole sheet width and row numbers down its height (8 tall canvas rows, then 22px rows). */
  #buildGridHeaders() {
    const sheets = $('.sheets'); const W = sheets.clientWidth || 900, H = sheets.clientHeight || 640;
    const colCount = Math.max(GRID.cols, Math.ceil((W - 28) / GRID.cellW) + 1);
    const letters = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
    const cols = $('#col-headers'), rows = $('#row-headers'); cols.innerHTML = ''; rows.innerHTML = '';
    for (let c = 0; c < colCount; c++) cols.append(el('span', {}, letters(c)));
    for (let r = 0; r < GRID.rows; r++) rows.append(el('span', { class: 'tall' }, String(r + 1)));
    const small = Math.max(14, Math.ceil((H - 28 - GRID.rows * GRID.cellH) / 22) + 1);
    for (let r = 0; r < small; r++) rows.append(el('span', {}, String(GRID.rows + 1 + r)));
    // other sheets: same worksheet frame (letters + numbers) around their content
    for (const sec of document.querySelectorAll('.sheet:not(.ws)')) {
      const body = el('div', { class: 'ws-body generic' }); while (sec.firstChild) body.append(sec.firstChild);
      const wc = el('div', { class: 'ws-cols' }), wr = el('div', { class: 'ws-rows' });
      for (let c = 0; c < colCount; c++) wc.append(el('span', {}, letters(c)));
      for (let r = 0; r < Math.ceil(H / 22) + 40; r++) wr.append(el('span', {}, String(r + 1)));
      sec.append(el('div', { class: 'ws-corner' }), wc, wr, body); sec.classList.add('ws');
    }
    if (!this.resizeBound) { this.resizeBound = true; let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => this.#rebuildHeaderCounts(), 150); }); }
  }
  #rebuildHeaderCounts() {
    const sheets = $('.sheets'); const W = sheets.clientWidth, H = sheets.clientHeight;
    const colCount = Math.max(GRID.cols, Math.ceil((W - 28) / GRID.cellW) + 1);
    const letters = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
    for (const wc of document.querySelectorAll('.ws-cols')) { const sel = [...wc.children].findIndex((s) => s.classList.contains('sel')); wc.innerHTML = ''; for (let c = 0; c < colCount; c++) wc.append(el('span', { class: c === sel ? 'sel' : '' }, letters(c))); }
    const rows = $('#row-headers'); const need = GRID.rows + Math.max(14, Math.ceil((H - 28 - GRID.rows * GRID.cellH) / 22) + 1);
    while (rows.children.length < need) rows.append(el('span', {}, String(rows.children.length + 1)));
  }

  #bind() {
    document.title = '통합 문서1 - Excel';
    document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => this.switchSheet(b.dataset.sheet)));
    document.querySelectorAll('[data-ribbon]').forEach((b) => b.addEventListener('click', () => this.showRibbon(b.dataset.ribbon)));
    document.querySelectorAll('.bs-item[data-bs]').forEach((b) => b.addEventListener('click', () => this.openBackstage(b.dataset.bs)));
    $('#bs-close').addEventListener('click', () => this.closeBackstage());
    $('#btn-stealth').addEventListener('click', () => this.game.toggleExcel());
    $('#qa-stealth').addEventListener('click', () => this.game.toggleExcel());
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.game.persist(); this.toast('저장됨'); return; }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!$('#ctx-menu').hidden) this.closeContextMenu();
      else if (!$('#modal').hidden) this.closeModal();
      else if (!$('#backstage').hidden) this.closeBackstage();
      else this.game.toggleExcel();
    });
    // decorative Excel chrome
    $('#rr-share').addEventListener('click', () => this.toast('공유: 이 통합 문서는 로컬에만 저장됩니다 (파일 › 저장/내보내기)'));
    $('#rr-comments').addEventListener('click', () => this.switchSheet('quests'));
    $('.tb-search').addEventListener('click', () => this.toast('검색: 리본 탭 홈·삽입·데이터·검토·보기에서 기능을 찾을 수 있습니다'));
    $('#rb-collapse').addEventListener('click', () => { const b = document.querySelector('.ribbon-body'); b.classList.toggle('collapsed'); $('#rb-collapse').textContent = b.classList.contains('collapsed') ? '˅' : '˄'; });
    // quick access toolbar
    $('#qat-save').addEventListener('click', () => { this.game.persist(); this.toast('저장됨 — 통합 문서1'); });
    $('#qat-undo').addEventListener('click', () => this.toast('실행 취소할 작업이 없습니다'));
    $('#qat-redo').addEventListener('click', () => this.toast('다시 실행할 작업이 없습니다'));
    // ribbon panels
    $('#qa-pull1').addEventListener('click', () => { this.switchSheet('gacha'); this.#pull(1); });
    $('#qa-pull10').addEventListener('click', () => { this.switchSheet('gacha'); this.#pull(10); });
    $('#qa-auto-party').addEventListener('click', () => { const p = this.game.autoParty(); this.toast(`파티 자동 편성: ${p.length}명`); });
    $('#qa-login').addEventListener('click', () => { const r = this.game.claimLogin(); this.toast(r ? `출근 보상: ${rewardText(r)}` : '오늘은 이미 출근 도장을 찍었습니다'); });
    $('#qa-ad').addEventListener('click', () => this.playAd(() => { const r = this.game.adReward('instant'); if (r) this.toast(`광고 보상 +${fmt(r.gold)} 골드`); }));
    $('#qa-gridlines').addEventListener('change', (e) => this.game.setGridlines(e.target.checked));
    $('#set-gridlines').addEventListener('change', (e) => this.game.setGridlines(e.target.checked));
    $('#set-safe').addEventListener('change', (e) => this.game.setSafeAdvance(e.target.checked));
    $('#qa-sound').addEventListener('change', (e) => { this.sound?.unlock(); this.game.setSound(e.target.checked); });
    // worksheet cell selection on the battle canvas
    const canvas = $('#battle');
    canvas.addEventListener('click', (e) => this.#selectCellAt(e));
    canvas.addEventListener('dblclick', (e) => { const h = this.#entityAt(e); if (h?.kind === 'hero') this.openDetail(h.heroId); });
    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.#selectCellAt(e); this.#openContextMenu(e.clientX, e.clientY, this.#entityAt(e)); });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx-menu')) this.closeContextMenu(); });
    document.addEventListener('contextmenu', (e) => { if (!e.target.closest('#battle') && !e.target.closest('#ctx-menu')) this.closeContextMenu(); });
    this.game.on('history', () => { if (document.querySelector('#sheet-chart.active')) this.#drawCharts(); });

    $('#qa-upgrade-all').addEventListener('click', () => { const n = this.game.upgradeCheapestLoop(); this.toast(n ? `자동 합계: 업그레이드 ${n}회 적용` : '골드가 부족합니다'); });
    $('#qa-challenge').addEventListener('click', () => { if (this.game.isChallenging()) this.game.cancelChallenge(); else this.game.startChallenge(); });
    $('#qa-auto').addEventListener('change', (e) => this.game.setAutoAdvance(e.target.checked));
    $('#qa-auto-up').addEventListener('change', (e) => this.game.setAutoUpgrade(e.target.checked));
    $('#btn-sound').addEventListener('click', () => { this.sound?.unlock(); this.game.setSound(!this.game.state.settings.sound); });
    $('#set-sound').addEventListener('change', (e) => { this.sound?.unlock(); this.game.setSound(e.target.checked); });
    $('#btn-prestige').addEventListener('click', () => {
      const info = this.game.prestigeInfo(); if (!info.eligible) return;
      if (confirm(`회사 이전을 진행할까요?\n\n지분 +${info.gain} (파티 ATK·골드 영구 +${Math.round(info.gain * info.perShare * 100)}%)\n\n초기화: 스테이지 · 골드 · 영웅 레벨 · 회사 업그레이드\n유지: 보유 영웅·별·강화·강화 카드·보석·직급·업적`)) {
        const r = this.game.prestige(); if (r) this.openModal('회사 이전 완료', `<p>새 사옥으로 이전했습니다. <b>지분 +${r.gain}</b> (총 ${r.total})</p><p class="muted">파티 ATK·골드 영구 +${Math.round(r.total * r.perShare * 100)}%. Phase 1-1부터 다시 시작합니다.</p>`);
      }
    });
    $('#set-auto-up').addEventListener('change', (e) => this.game.setAutoUpgrade(e.target.checked));
    $('#set-auto').addEventListener('change', (e) => this.game.setAutoAdvance(e.target.checked));
    $('#set-stealth').addEventListener('change', (e) => this.game.toggleExcel(e.target.checked));

    $('#pull1').addEventListener('click', () => this.#pull(1));
    $('#pull10').addEventListener('click', () => this.#pull(10));

    $('#btn-login').addEventListener('click', () => { const r = this.game.claimLogin(); if (r) this.toast(`출근 보상: ${rewardText(r)}`); });
    $('#btn-allclear').addEventListener('click', () => { const r = this.game.claimAllClear(); if (r) this.toast(`전체 완료 보너스: ${rewardText(r)}`); });
    $('#btn-ad-instant').addEventListener('click', () => this.playAd(() => { const r = this.game.adReward('instant'); if (r) this.toast(`광고 보상 +${fmt(r.gold)} 골드`); }));

    $('#btn-export').addEventListener('click', () => { $('#save-text').value = this.game.exportSave(); $('#save-text').select(); this.toast('저장 문자열을 내보냈습니다'); });
    $('#btn-import').addEventListener('click', () => {
      try { this.game.importSave($('#save-text').value); this.toast('저장 데이터를 불러왔습니다'); }
      catch { this.toast('가져오기 실패: 올바르지 않은 문자열'); }
    });
    $('#btn-reset').addEventListener('click', () => { if (confirm('이 통합 문서를 삭제하고 처음부터 시작할까요? 되돌릴 수 없습니다.')) this.game.reset(); });
    $('#modal-ok').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.closeModal(); });

    window.addEventListener('beforeunload', () => this.game.persist());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.game.persist(); });
  }

  #subscribe() {
    const g = this.game;
    g.on('roster', () => { this.#refreshHeroTable(); this.#refreshTeamTable(); this.#buildCards(); this.#refreshDetail(); });
    g.on('party', () => { this.#buildHeroTable(); this.#buildCards(); this.#refreshDetail(); });
    g.on('cards', () => { $('#cards-cell').textContent = fmt(g.state.cards); $('#cards-top').textContent = fmt(g.state.cards); this.#refreshDetail(); });
    g.on('main', (job) => this.openModal('승진 발표', `<p><b>김인턴</b>이(가) <b>${job.title}</b>(${job.grade}급)으로 승진했습니다!</p><p class="muted">${job.desc ?? '스탯과 스킬이 강화되었습니다.'}</p>`));
    g.on('stage', () => { this.#refreshStage(); this.#refreshPrestige(); });
    g.on('kills', () => this.#refreshStage());
    g.on('challenge', () => { this.#refreshStage(); this.#refreshSettings(); });
    g.on('wipe', () => this.toast(this.game.isChallenging() ? '팀 전원 번아웃 — 재정비 후 계속' : '팀 전원 번아웃 — 직전 스테이지에서 자동 사냥'));
    g.on('gems', () => this.#refreshGacha());
    g.on('quests', () => this.#refreshQuests());
    g.on('excel', (on) => this.applyStealth(on));
    g.on('settings', () => this.#refreshSettings());
    g.on('toast', (t) => this.toast(t));
    g.on('gacha', (results) => this.#showGachaResults(results));
    g.on('reset', () => { this.rebuildAll(); this.toast('통합 문서를 다시 불러왔습니다'); });
    g.on('log', (row) => this.#appendLog(row));
    g.on('saved', () => { const s = $('#status-ready'); s.textContent = '저장됨'; setTimeout(() => { s.textContent = this.game.state.settings.excel ? '계산 중 (4개 프로세서): 37%' : '준비'; }, 800); });
  }

  rebuildAll() {
    this.#buildHeroTable(); this.#buildTeamTable(); this.#buildCards(); this.#refreshStage(); this.#refreshGacha(); this.#refreshQuests(); this.#refreshSettings(); this.#buildFormulaSheet(); this.#buildLog();
    $('#cards-cell').textContent = fmt(this.game.state.cards); $('#cards-top').textContent = fmt(this.game.state.cards);
  }

  // ---------------------------------------------------------------- loop --
  update(dt) {
    this.acc += dt; this.formulaTimer += dt; this.stealthTimer += dt;
    if (this.formulaTimer >= 3) { this.formulaTimer = 0; this.formulaIdx++; this.#refreshFormulaBar(); }
    if (this.acc >= 0.25) {
      this.acc = 0;
      this.#refreshStatus();
      this.#refreshHeroTable(true);
      this.#refreshTeamTable(true);
      if (this.game.state.settings.excel && this.stealthTimer >= 0.5) { this.stealthTimer = 0; this.#refreshStealth(); }
      this.#refreshFormulaSheetValues();
      if (document.querySelector('#sheet-chart.active')) { this.chartTimer = (this.chartTimer ?? 0) + 0.25; if (this.chartTimer >= 1) { this.chartTimer = 0; this.#drawCharts(); } }
    }
  }

  switchSheet(name) {
    this.closeBackstage(); this.closeContextMenu();
    if (name === 'chart') this.#drawCharts();
    document.querySelectorAll('.sheet').forEach((s) => s.classList.toggle('active', s.id === `sheet-${name}`));
    document.querySelectorAll('.sheet-tab').forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
    if (SHEET_RIBBON[name]) this.#activateRibbon(SHEET_RIBBON[name]);
    if (name === 'quests') this.#refreshQuests();
  }
  /** Ribbon tabs switch the ribbon contents (like Excel) and jump to the matching sheet; 파일 opens the backstage. */
  showRibbon(name) {
    if (name === 'file') { this.openBackstage('info'); return; }
    this.#activateRibbon(name);
    if (RIBBON_SHEET[name]) this.switchSheet(RIBBON_SHEET[name]);
  }
  #activateRibbon(name) {
    document.querySelectorAll('.ribbon-tab').forEach((b) => b.classList.toggle('active', b.dataset.ribbon === name));
    document.querySelectorAll('.ribbon-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
  }
  openBackstage(section = 'info') {
    $('#backstage').hidden = false;
    document.querySelectorAll('.ribbon-tab').forEach((b) => b.classList.toggle('active', b.dataset.ribbon === 'file'));
    document.querySelectorAll('.bs-item[data-bs]').forEach((b) => b.classList.toggle('active', b.dataset.bs === section));
    document.querySelectorAll('.bs-section').forEach((s) => s.classList.toggle('active', s.dataset.bs === section));
    this.#refreshSettings(); this.#refreshFormulaSheetValues();
  }
  closeBackstage() {
    if ($('#backstage').hidden) return;
    $('#backstage').hidden = true;
    const active = document.querySelector('.sheet.active')?.id.replace('sheet-', '') ?? 'home';
    this.#activateRibbon(SHEET_RIBBON[active] ?? 'home');
  }

  // -------------------------------------------------------- context menu --
  #openContextMenu(x, y, ent) {
    const menu = $('#ctx-menu'); menu.innerHTML = '';
    const item = (icon, label, fn, { disabled = false, sc = '' } = {}) => menu.append(el('div', { class: `ctx-item ${disabled ? 'disabled' : ''}`, onclick: () => { if (!disabled) { fn(); this.closeContextMenu(); } } }, el('span', { class: 'ci' }, icon), el('span', {}, label), sc ? el('span', { class: 'sc' }, sc) : null));
    const sep = () => menu.append(el('div', { class: 'ctx-sep' }));
    const g = this.game;
    if (ent?.kind === 'hero') {
      const v = g.heroView(ent.heroId);
      item('👤', `${v.def.name} 상세 보기`, () => this.openDetail(ent.heroId));
      item('▲', `강화 +1 (골드 ${fmt(v.cost)})`, () => { if (!g.upgradeHero(ent.heroId)) this.toast('골드가 부족합니다'); }, { disabled: g.state.gold < v.cost });
      item(v.inParty ? '✕' : '✓', v.inParty ? '파티 해제' : '파티 배치', () => g.toggleParty(ent.heroId), { disabled: v.isMain && g.state.party.length === 1 });
      sep();
    } else if (ent?.kind === 'monster') {
      item('☠', `${ent.def.name} — HP ${fmt(Math.round(ent.hp))} / ${fmt(ent.maxHp)}`, () => {}, { disabled: true });
      if (ent.def.affix) item('★', `접사 ${ent.def.affix.name}: ${ent.def.affix.desc}`, () => {}, { disabled: true });
      sep();
    }
    item('✂', '잘라내기', () => {}, { disabled: true, sc: 'Ctrl+X' });
    item('⧉', '복사', () => this.toast(`복사됨: ${this.#cellFormula() ?? this.#cellRef() ?? ''}`), { sc: 'Ctrl+C' });
    item('📋', '붙여넣기', () => {}, { disabled: true, sc: 'Ctrl+V' });
    sep();
    item('⚑', g.isChallenging() ? '도전 중단' : `${stageLabel(g.nextStage())} 도전`, () => (g.isChallenging() ? g.cancelChallenge() : g.startChallenge()));
    item('Σ', '자동 합계 (가장 싼 업그레이드 반복)', () => { const n = g.upgradeCheapestLoop(); this.toast(n ? `업그레이드 ${n}회` : '골드가 부족합니다'); });
    sep();
    item('▦', `눈금선 ${g.state.settings.gridlines !== false ? '숨기기' : '표시'}`, () => g.setGridlines(!(g.state.settings.gridlines !== false)));
    item('🔒', '보스 키 (Esc)', () => g.toggleExcel());
    item('▤', '셀 서식…', () => this.toast('셀 서식: 이 셀은 게임 개체(그림)입니다'), { sc: 'Ctrl+1' });
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`; menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  }
  closeContextMenu() { const m = $('#ctx-menu'); if (m && !m.hidden) m.hidden = true; }

  // ---------------------------------------------------------- charts --
  /** Excel-style line chart: title, plot area with gridlines, axis labels, one or two series. */
  #lineChart(canvas, title, series, { unit = '', decimals = 0 } = {}) {
    const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#595959'; ctx.font = '14px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, W / 2, 16);
    const L = 54, R = W - 14, T = 34, B = H - 40; const n = Math.max(...series.map((s) => s.data.length));
    const all = series.flatMap((s) => s.data); const max = Math.max(1, ...all) * 1.1, min = 0;
    ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i <= 5; i++) { const y = Math.round(B - (B - T) * (i / 5)) + 0.5; ctx.moveTo(L, y); ctx.lineTo(R, y); }
    ctx.stroke();
    ctx.fillStyle = '#595959'; ctx.font = '10.5px "Segoe UI", Arial'; ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) { const v = min + (max - min) * (i / 5); ctx.fillText(fmt(+v.toFixed(decimals)), L - 6, B - (B - T) * (i / 5)); }
    ctx.strokeStyle = '#bfbfbf'; ctx.beginPath(); ctx.moveTo(L, B + 0.5); ctx.lineTo(R, B + 0.5); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillStyle = '#595959';
    const labels = n >= 2 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
    for (const i of labels) { const x = n > 1 ? L + (R - L) * (i / (n - 1)) : L; const ago = (n - 1 - i) * GameManager_HISTORY_STEP(); ctx.fillText(ago ? `-${Math.round(ago / 60)}분${ago % 60 ? ` ${ago % 60}초` : ''}` : '지금', x, B + 14); }
    ctx.fillText(unit, (L + R) / 2, H - 8);
    const colors = ['#4472c4', '#ed7d31', '#a5a5a5'];
    series.forEach((s, si) => {
      const d = s.data; if (!d.length) return;
      ctx.strokeStyle = colors[si % colors.length]; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
      d.forEach((v, i) => { const x = d.length > 1 ? L + (R - L) * (i / (d.length - 1)) : L; const y = B - (B - T) * ((v - min) / (max - min)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      const lx = d.length > 1 ? R : L, ly = B - (B - T) * ((d[d.length - 1] - min) / (max - min));
      ctx.fillStyle = colors[si % colors.length]; ctx.beginPath(); ctx.arc(lx, ly, 3, 0, Math.PI * 2); ctx.fill();
    });
    // legend
    ctx.font = '11px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'left';
    let lx = L; for (const [i, s] of series.entries()) { ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(lx, H - 30, 14, 3); ctx.fillStyle = '#595959'; ctx.fillText(s.name, lx + 18, H - 28); lx += 18 + ctx.measureText(s.name).width + 16; }
    if (!all.length) { ctx.fillStyle = '#999'; ctx.textAlign = 'center'; ctx.font = '12px "Malgun Gothic", sans-serif'; ctx.fillText('데이터 수집 중… (5초 후 첫 샘플)', (L + R) / 2, (T + B) / 2); }
  }
  #drawCharts() {
    const h = this.game.history; const g = this.game;
    this.#lineChart($('#chart-gold'), '골드 획득 추이 (분당)', [{ name: '골드/분', data: h.goldPerMin.map((v) => Math.round(v)) }], { unit: '시간 (5초 간격)' });
    this.#lineChart($('#chart-dps'), '파티 DPS', [{ name: '실측 DPS', data: h.dps.map((v) => Math.round(v)) }, { name: '이론 DPS', data: h.dps.map(() => Math.round(g.partyDPS())) }], { unit: '시간 (5초 간격)' });
    this.#lineChart($('#chart-stage'), '스테이지 진행', [{ name: '현재 스테이지', data: h.stage }], { unit: '시간 (5초 간격)' });
    const party = g.state.party.map((id) => g.heroView(id));
    this.#barChart($('#chart-party'), '파티 ATK 구성', party.map((v) => ({ label: v.def.name, value: v.atk, color: v.grade.color })));
  }
  /** Excel-style clustered bar chart for the party. */
  #barChart(canvas, title, bars) {
    const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#595959'; ctx.font = '14px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, W / 2, 16);
    const L = 54, R = W - 14, T = 34, B = H - 40; const max = Math.max(1, ...bars.map((b) => b.value)) * 1.15;
    ctx.strokeStyle = '#d9d9d9'; ctx.beginPath(); for (let i = 0; i <= 5; i++) { const y = Math.round(B - (B - T) * (i / 5)) + 0.5; ctx.moveTo(L, y); ctx.lineTo(R, y); } ctx.stroke();
    ctx.fillStyle = '#595959'; ctx.font = '10.5px "Segoe UI", Arial'; ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) ctx.fillText(fmt(Math.round(max * (i / 5))), L - 6, B - (B - T) * (i / 5));
    const slot = (R - L) / Math.max(1, bars.length), bw = Math.min(56, slot * 0.6);
    bars.forEach((b, i) => {
      const x = L + slot * i + (slot - bw) / 2, hgt = (B - T) * (b.value / max);
      ctx.fillStyle = b.color; ctx.fillRect(x, B - hgt, bw, hgt);
      ctx.fillStyle = '#333'; ctx.font = '10.5px "Segoe UI", Arial'; ctx.textAlign = 'center'; ctx.fillText(fmt(b.value), x + bw / 2, B - hgt - 8);
      ctx.fillStyle = '#595959'; ctx.font = '10.5px "Malgun Gothic", sans-serif'; ctx.fillText(b.label.length > 7 ? b.label.slice(0, 6) + '…' : b.label, x + bw / 2, B + 12);
    });
    ctx.strokeStyle = '#bfbfbf'; ctx.beginPath(); ctx.moveTo(L, B + 0.5); ctx.lineTo(R, B + 0.5); ctx.stroke();
  }

  // ----------------------------------------------------- cell selection --
  #cellFromEvent(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * (e.currentTarget.width / r.width), y = (e.clientY - r.top) * (e.currentTarget.height / r.height);
    return { col: Math.max(0, Math.min(GRID.cols - 1, Math.floor(x / GRID.cellW))), row: Math.max(0, Math.min(GRID.rows - 1, Math.floor(y / GRID.cellH))), x, y };
  }
  #entityAt(e) {
    const { x, y } = this.#cellFromEvent(e); const em = this.game.entities;
    const hit = (ent, w, h) => Math.abs(ent.x - x) <= w / 2 && y <= ent.y + 8 && y >= ent.y - h;
    return em.heroes.find((h) => hit(h, 48, 64)) ?? em.monsters.find((m) => m.alive && hit(m, m.w ?? 64, m.h ?? 64)) ?? null;
  }
  #selectCellAt(e) {
    const c = this.#cellFromEvent(e);
    this.selected = { col: c.col, row: c.row }; this.renderer.selected = this.selected;
    document.querySelectorAll('#col-headers span').forEach((s, i) => s.classList.toggle('sel', i === c.col));
    document.querySelectorAll('#row-headers span').forEach((s, i) => s.classList.toggle('sel', i === c.row));
    this.selectedEntity = this.#entityAt(e);
    this.#refreshFormulaBar();
  }
  #cellRef() { return this.selected ? `${COLS[this.selected.col]}${this.selected.row + 1}` : null; }
  /** Formula for whatever stands in the selected cell (hero / monster), or null. */
  #cellFormula() {
    const ent = this.selectedEntity; if (!ent) return null;
    if (ent.kind === 'hero') {
      const alive = ent.alive; const v = this.game.heroView(ent.heroId);
      return `=HERO("${ent.def.name}", LV=${v.entry.level}, ATK=${fmt(ent.atk)}, HP=${alive ? Math.round(ent.hp) : 0}/${ent.maxHp}${alive ? '' : ', STATUS="병가"'})`;
    }
    if (!ent.alive) return null;
    return `=${ent.isBoss ? 'BOSS' : ent.def.chest ? 'CHEST' : 'MONSTER'}("${ent.def.name}", HP=${fmt(Math.round(ent.hp))}/${fmt(ent.maxHp)}, ATK=${fmt(ent.atk)}${ent.elite ? ', ELITE=TRUE' : ''})`;
  }

  // ------------------------------------------------------------ status --
  #refreshStatus() {
    const s = this.game.state;
    $('#status-gold').textContent = `골드: ${fmt(s.gold)}`;
    $('#status-gems').textContent = `보석: ${fmt(s.gems)}`;
    $('#status-dps').textContent = `DPS: ${fmt(this.game.entities.dps())}`;
    $('#gold-cell').textContent = fmt(s.gold); $('#gems-top').textContent = fmt(s.gems);
    const claimable = Quests.activeQuests(s).some((q) => Quests.questDone(s, q.id) && !Quests.questClaimed(s, q.id)) || !s.daily.loginClaimed || Achievements.claimableCount(s) > 0;
    $('#quest-dot').hidden = !claimable;
  }

  #refreshFormulaBar() {
    const s = this.game.state; const g = this.game;
    if (s.settings.excel) {
      $('#namebox').textContent = 'D14';
      $('#formula').textContent = STEALTH_FORMULAS[this.formulaIdx % STEALTH_FORMULAS.length];
      return;
    }
    const kills = g.killsRequired();
    const list = [
      `=SUM(Hero_ATK) = ${fmt(g.partyATK())}`,
      g.isChallenging() ? `=PROGRESS("${g.stageLabel()}", ${s.kills}/${kills}) = ${pct(s.kills / kills)}` : `=FARM("${g.stageLabel()}", KILLS=${s.kills})`,
      `=DPS(Sheet1!A1:M8) = ${fmt(g.entities.dps())}/s`,
      `=IDLE_RATE(MAX_STAGE=${s.maxStage}) = ${g.goldPerSecAt(s.maxStage).toFixed(2)} gold/s`,
    ];
    const ref = this.#cellRef();
    $('#namebox').textContent = ref ?? g.stageLabel();
    $('#status-cell').textContent = ref ? `셀 ${ref}` : '';
    $('#formula').textContent = this.#cellFormula() ?? list[this.formulaIdx % list.length];
  }

  #refreshStage() {
    const s = this.game.state; const g = this.game;
    const challenging = g.isChallenging(); const boss = g.bossActive();
    $('#stage-label').textContent = `${g.stageLabel()} · ${phaseName(s.stage)}`;
    const mode = $('#stage-mode');
    mode.textContent = challenging ? (boss ? '보스 도전 중' : '도전 중') : '자동 사냥';
    mode.className = `cell v stage-mode ${challenging ? 'challenge' : 'farm'}`;
    const pool = stagePool(s.stage);
    const bossDef = bossForStage(s.stage);
    $('#stage-monster').textContent = boss ? `보스: ${bossDef.name}` : pool.map((m) => m.name).join(' · ');
    const req = g.killsRequired();
    $('#kill-bar').style.width = challenging ? `${Math.min(100, (s.kills / req) * 100)}%` : '100%';
    $('#kill-bar').style.opacity = challenging ? '1' : '0.35';
    $('#kill-text').textContent = boss ? `보스 · 제한 ${BALANCE.BOSS_TIME_LIMIT}초` : challenging ? `${s.kills} / ${req}행 처리` : `사냥 중 · 처치 ${s.kills}`;
    const ec = eliteChance(s.stage);
    const mod = stageModifier(s.stage);
    $('#stage-hint').textContent = boss ? `${bossDef.desc} · ${BALANCE.BOSS_TIME_LIMIT}초 제한` : mod ? `${mod.name}: ${mod.desc}` : ec > 0 ? `엘리트 출현 ${Math.round(ec * 100)}% (HP ×${BALANCE.ELITE.hp}, 골드 ×${BALANCE.ELITE.gold})` : '';
    const next = g.nextStage();
    const fc = g.challengeForecast(challenging ? s.stage : next);
    $('#qa-challenge-label').textContent = challenging ? '도전 중단' : `${stageLabel(next)} 도전${isBossStage(next) ? ' (보스)' : ''}`;
    const fcEl = $('#qa-forecast'); fcEl.textContent = `승산 ${Math.round(fc.prob * 100)}% · ${fc.label}${fc.boss && fc.bossTime ? ` · 예상 ${fc.bossTime.toFixed(0)}s` : ''}`;
    fcEl.className = `rb-forecast ${fc.prob >= 0.7 ? 'good' : fc.prob >= BALANCE.SAFE_ADVANCE_MIN ? 'mid' : 'bad'}`;
    if (!challenging && g.waitingAdvance) $('#stage-hint').textContent = `자동 진행 대기: ${stageLabel(next)} 승산 ${Math.round(fc.prob * 100)}% (강화하면 자동 재개)`;
    this.#refreshBestiary(boss ? [bossDef] : pool);
    this.#refreshFormulaBar();
  }
  #refreshBestiary(list) {
    const box = $('#bestiary'); box.innerHTML = '';
    for (const m of list) box.append(el('div', { class: 'beast' }, monsterSprite(m, 0), el('span', {}, m.name)));
  }

  // ------------------------------------------------------- hero table --
  #buildHeroTable() {
    const tbody = $('#hero-table tbody'); tbody.innerHTML = ''; this.heroRows.clear();
    for (const id of this.game.state.party) {
      const v = this.game.heroView(id);
      const row = el('tr', { 'data-id': id },
        el('td', { class: 'name clickable', onclick: () => this.openDetail(id), title: `${v.traitName}: ${v.traitDesc}` },
          el('img', { src: heroIconDataURL(v.def), class: 'icon', alt: '' }), el('span', {}, v.def.name),
          el('div', { class: 'sub', style: `color:${v.grade.color}` }, v.isMain ? `${v.def.grade} · ${v.def.title}` : `${v.def.grade} · ${stars(v.star)}`)),
        el('td', { class: 'num lvl' }), el('td', { class: 'num atk' }), el('td', { class: 'num cost' }),
        el('td', { class: 'act' }, btn('강화', () => { if (!this.game.upgradeHero(id)) this.toast('골드가 부족합니다'); }, 'up')),
      );
      tbody.append(row); this.heroRows.set(id, row);
    }
    this.#refreshHeroTable();
  }
  #refreshHeroTable(light = false) {
    const gold = this.game.state.gold;
    for (const [id, row] of this.heroRows) {
      const v = this.game.heroView(id);
      if (!light) { $('.lvl', row).textContent = v.entry.level; $('.atk', row).textContent = fmt(v.atk); $('.cost', row).textContent = fmt(v.cost); }
      $('.up', row).disabled = gold < v.cost; row.classList.toggle('affordable', gold >= v.cost);
    }
    if (light) return;
    $('#party-dps').textContent = fmt(this.game.partyDPS());
  }

  #buildTeamTable() {
    const tbody = $('#team-table tbody'); tbody.innerHTML = ''; this.teamRows.clear();
    for (const [key, t] of Object.entries(BALANCE.TEAM_UPGRADES)) {
      const row = el('tr', {}, el('td', { class: 'name' }, t.name, el('div', { class: 'sub' }, t.desc)), el('td', { class: 'num lvl' }), el('td', { class: 'num cost' }),
        el('td', { class: 'act' }, btn('구매', () => { if (!this.game.upgradeTeam(key)) this.toast('골드가 부족합니다'); }, 'up')));
      tbody.append(row); this.teamRows.set(key, row);
    }
    this.#refreshTeamTable();
  }
  #refreshTeamTable(light = false) {
    const s = this.game.state;
    for (const [key, row] of this.teamRows) {
      const lvl = s.team[key], t = BALANCE.TEAM_UPGRADES[key], maxed = lvl >= t.max, cost = teamUpgradeCost(key, lvl);
      if (!light) { $('.lvl', row).textContent = `${lvl}/${t.max}`; $('.cost', row).textContent = maxed ? 'MAX' : fmt(cost); }
      $('.up', row).disabled = maxed || s.gold < cost;
    }
  }

  // -------------------------------------------------------------- cards --
  #rosterOrder() {
    const s = this.game.state;
    const rank = (id) => { const e = s.heroes[id]; const g = GRADE_ORDER.indexOf(this.game.heroDef(id).grade); return (e.owned ? 100 : 0) + g; };
    return [MAIN_ID, ...HEROES.map((h) => h.id).sort((a, b) => rank(b) - rank(a))];
  }
  #buildCards() {
    const grid = $('#card-grid'); grid.innerHTML = '';
    const tbody = $('#roster-table tbody'); tbody.innerHTML = '';
    const maxAtk = Math.max(1, ...this.#rosterOrder().filter((id) => this.game.state.heroes[id].owned).map((id) => this.game.heroView(id).atk));
    for (const id of this.#rosterOrder()) {
      const v = this.game.heroView(id); const e = v.entry;
      const c = cardCanvas(v.def, {
        star: v.star, owned: e.owned,
        title: v.isMain ? `${v.def.title} · Lv ${e.level}` : (e.owned ? `${stars(e.star)} · Lv ${e.level}` : ''),
        sub: e.enhance ? `+${e.enhance}` : '', awakened: !!e.awakened,
      });
      const wrap = el('div', { class: `card ${v.inParty ? 'in-party' : ''} ${e.owned ? '' : 'locked'}`, title: `${v.traitName}: ${v.traitDesc}`, onclick: () => this.openDetail(id) }, c);
      if (v.inParty) wrap.append(el('span', { class: 'card-badge' }, '배치'));
      if (v.isMain) wrap.append(el('span', { class: 'card-badge main' }, '메인'));
      grid.append(wrap);
      tbody.append(el('tr', { class: e.owned ? '' : 'locked' },
        el('td', {}, v.def.name), el('td', { style: `color:${v.grade.color}` }, v.def.grade), el('td', {}, ROLES[v.def.role].name), el('td', {}, v.traitName),
        el('td', {}, v.isMain ? v.def.title : (e.owned ? stars(e.star) : '미보유')), el('td', { class: 'num' }, e.owned ? e.level : '-'),
        el('td', { class: 'num databar-td' }, el('div', { class: 'bar', style: `width:${e.owned ? Math.max(2, Math.round((v.atk / maxAtk) * 96)) : 0}%` }), el('span', {}, e.owned ? fmt(v.atk) : '-')),
        el('td', { class: 'num' }, e.owned ? e.shards : '-')));
    }
    $('#party-count').textContent = `${this.game.state.party.length} / ${BALANCE.PARTY_SIZE}`;
    const col = this.game.collection();
    $('#collection-text').textContent = `${col.owned} / ${col.total}종 · ATK +${Math.round(col.atk * 100)}% · 골드 +${Math.round(col.gold * 100)}%`;
    $('#qa-collection').textContent = `도감 ${col.owned} / ${col.total}종 · ATK +${Math.round(col.atk * 100)}% · 골드 +${Math.round(col.gold * 100)}%`;
  }

  // ------------------------------------------------------ hero detail --
  openDetail(id) { this.detailId = id; this.#renderDetail(); $('#modal').hidden = false; }
  #refreshDetail() { if (this.detailId && !$('#modal').hidden) this.#renderDetail(); }
  #renderDetail() {
    const id = this.detailId; const g = this.game; const v = g.heroView(id); const e = v.entry; const s = g.state;
    $('#modal-title').textContent = v.isMain ? `${v.def.name} · ${v.def.title} (메인 영웅)` : `${v.def.name} · ${v.grade.name}급 ${v.grade.label}`;
    const body = $('#modal-body'); body.innerHTML = '';
    body.append(el('div', { class: 'detail-head' }, portraitCanvas(v.def, 3),
      el('div', { class: 'detail-stats' },
        el('div', { class: 'detail-line', html: `<b style="color:${v.grade.color}">${v.def.grade}</b> · ${ROLES[v.def.role].name}${v.isMain ? ` · ${MAIN_TIER_TITLES[v.def.tier]}` : ` · ${stars(v.star)}`}` }),
        el('div', { class: 'detail-line' }, e.owned ? `Lv ${e.level}  ·  강화 +${e.enhance}` : '미보유 (데이터 가져오기에서 획득)'),
        el('div', { class: 'detail-line' }, `ATK ${fmt(v.atk)}  ·  HP ${fmt(v.hp)}  ·  공격 ${v.interval}s${v.awakened ? '  ·  ✦ 각성' : ''}`),
        el('div', { class: 'detail-line trait' }, `특성 · ${v.traitName}: ${v.traitDesc}`),
        el('div', { class: 'detail-line skill' }, `스킬 · ${v.skillName}: ${v.skillDesc}`, v.skillUnlocked ? '' : el('span', { class: 'muted' }, ` (${v.skillUnlockHint})`)),
        e.owned && !v.isMain ? el('div', { class: 'detail-line muted' }, `조각 ${e.shards}${v.promoteCost !== null ? ` / 다음 ★ ${v.promoteCost}` : ' (최대 ★)'}`) : null,
      )));
    const actions = el('div', { class: 'detail-actions' });
    if (e.owned) {
      actions.append(btn(v.inParty ? '파티 해제' : '파티 배치', () => g.toggleParty(id), v.inParty ? '' : 'primary', v.isMain && v.inParty && s.party.length === 1));
      if (!v.isMain) actions.append(btn(`★ 승급 (조각 ${v.promoteCost ?? '-'})`, () => this.#promoteWithDialog(id), '', !v.canPromote));
      if (!v.isMain && v.star >= BALANCE.AWAKEN.star) actions.append(btn(v.awakened ? '각성 완료 ✦' : `✦ 각성 (카드 ${v.awakenCost})`, () => { if (g.awaken(id)) this.#showAwaken(id); else this.toast('강화 카드가 부족합니다'); }, v.awakened ? '' : 'primary', !v.canAwaken));
      actions.append(btn(v.enhanceMaxed ? '강화 MAX' : `강화 +1 (카드 ${v.enhanceCost})`, () => { if (!g.enhance(id)) this.toast('강화 카드가 부족합니다'); }, '', !v.canEnhance));
      if (!v.isMain) {
        actions.append(btn(`조각 → 카드 (${e.shards}개 → ${e.shards * v.shardCardValue}장)`, () => g.convertShards(id), '', e.shards <= 0));
        actions.append(btn(`카드 방출 (+${v.dismissCards}장)`, () => { if (confirm(`${v.def.name} 카드를 방출하고 강화 카드 ${v.dismissCards}장을 받을까요? 되돌릴 수 없습니다.`)) g.dismiss(id); }, 'danger', !v.canDismiss));
      }
    }
    body.append(actions);
    if (v.isMain) body.append(this.#mainPromoPanel(v.mainPromo));
    body.append(el('p', { class: 'muted small' }, `보유 강화 카드: ${fmt(s.cards)}장`));
    $('#modal-actions').innerHTML = ''; $('#modal-actions').append(btn('닫기', () => this.closeModal(), 'primary'));
  }
  /** ★ promotion with a before/after result dialog (card, stars, ATK/HP). */
  #promoteWithDialog(id) {
    const g = this.game; const before = g.heroView(id);
    const b = { star: before.star, atk: before.atk, hp: before.hp };
    if (!g.promote(id)) { this.toast('조각이 부족합니다'); return; }
    const v = g.heroView(id);
    const body = el('div', { class: 'promo-result' },
      el('div', { class: 'promo-card' }, cardCanvas(v.def, { star: v.star, title: `${stars(v.star)} · Lv ${v.entry.level}`, awakened: !!v.entry.awakened })),
      el('div', { class: 'promo-lines' },
        el('h4', {}, `${v.def.name} ${stars(b.star)} → ${stars(v.star)}`),
        el('div', { class: 'detail-line' }, `ATK ${fmt(b.atk)} → `, el('b', {}, fmt(v.atk)), `  (+${Math.round((v.atk / b.atk - 1) * 100)}%)`),
        el('div', { class: 'detail-line' }, `HP ${fmt(b.hp)} → `, el('b', {}, fmt(v.hp))),
        v.star === BALANCE.SKILL_UNLOCK_STAR ? el('div', { class: 'detail-line skill' }, `스킬 해금: ${v.skillName}`) : null,
        v.star === BALANCE.SKILL_BOOST_STAR ? el('div', { class: 'detail-line skill' }, `스킬 강화: 위력 ×${BALANCE.SKILL_BOOST_MULT}`) : null,
        v.star >= BALANCE.AWAKEN.star ? el('div', { class: 'detail-line', style: 'color:#b8860b' }, `✦ 각성 가능 (강화 카드 ${v.awakenCost}장)`) : null,
      ));
    this.openModal('★ 승급 완료', body);
    $('#modal-actions').innerHTML = ''; $('#modal-actions').append(btn('상세로', () => this.openDetail(id)), btn('확인', () => this.closeModal(), 'primary'));
    this.game.emit('sfx', 'levelup');
  }
  #showAwaken(id) {
    const v = this.game.heroView(id);
    const body = el('div', { class: 'promo-result awaken' },
      el('div', { class: 'promo-card' }, cardCanvas(v.def, { star: v.star, title: `${stars(v.star)} · Lv ${v.entry.level}`, awakened: true })),
      el('div', { class: 'promo-lines' }, el('h4', {}, `✦ ${v.def.name} 각성!`),
        el('div', { class: 'detail-line' }, `ATK/HP +${Math.round(BALANCE.AWAKEN.atk * 100)}% · 특성 효과 ×${BALANCE.AWAKEN.trait} · 스킬 위력 ×${BALANCE.AWAKEN.skill}`),
        el('div', { class: 'detail-line' }, `ATK `, el('b', {}, fmt(v.atk)), ` · HP `, el('b', {}, fmt(v.hp))),
        el('div', { class: 'detail-line muted' }, '카드에 금색 테두리가 붙고 전투 중 금빛 오라가 나옵니다.')));
    this.openModal('각성', body);
    $('#modal-actions').innerHTML = ''; $('#modal-actions').append(btn('상세로', () => this.openDetail(id)), btn('확인', () => this.closeModal(), 'primary'));
  }
  #mainPromoPanel(info) {
    const box = el('div', { class: 'promo-box' }, el('h4', {}, '직급 승진'));
    if (info.maxed) { box.append(el('p', { class: 'muted' }, '최고 직급입니다.')); return box; }
    box.append(el('p', { class: 'small' },
      el('span', { class: info.hasCards ? 'ok' : 'bad' }, `강화 카드 ${info.cards}장`), ' · ',
      el('span', { class: info.hasStage ? 'ok' : 'bad' }, `${stageLabel(info.stage)} 클리어`)));
    const opts = el('div', { class: 'promo-options' });
    for (const job of info.options) {
      opts.append(el('div', { class: 'promo-opt' }, cardCanvas(job, { title: `${job.title} · ${job.grade}급` }),
        el('div', { class: 'small muted' }, job.desc ?? `${ROLES[job.role].name} · ${job.grade}급`),
        el('div', { class: 'small', style: 'color:#1f5fa8' }, `특성: ${TRAITS[job.trait].name}`),
        btn(`${job.title}으로 승진`, () => { if (!this.game.promoteMain(job.id)) this.toast('승진 조건이 충족되지 않았습니다'); }, 'primary', !info.ok)));
    }
    box.append(opts);
    return box;
  }

  // ------------------------------------------------------------- gacha --
  #pull(n) {
    const res = this.game.pull(n);
    if (!res) return;
    for (const r of res) this.gachaLog.unshift(r);
    this.gachaLog.length = Math.min(this.gachaLog.length, 30);
    this.#refreshGacha();
  }
  #refreshGacha() {
    const s = this.game.state;
    $('#gems-cell').textContent = fmt(s.gems); $('#gems-top').textContent = fmt(s.gems);
    $('#pull1').disabled = s.gems < BALANCE.GACHA_SINGLE_COST; $('#pull10').disabled = s.gems < BALANCE.GACHA_TEN_COST;
    $('#pity-a').textContent = BALANCE.PITY_A - s.pity.sinceA;
    $('#pity-s').textContent = BALANCE.PITY_S - s.pity.sinceS;
    $('#total-pulls').textContent = s.stats.totalPulls;
    $('#qa-pull1').disabled = s.gems < BALANCE.GACHA_SINGLE_COST; $('#qa-pull10').disabled = s.gems < BALANCE.GACHA_TEN_COST;
    $('#qa-pity-a').textContent = BALANCE.PITY_A - s.pity.sinceA; $('#qa-pity-s').textContent = BALANCE.PITY_S - s.pity.sinceS;
    const tbody = $('#gacha-log tbody'); tbody.innerHTML = '';
    this.gachaLog.forEach((r, i) => tbody.append(el('tr', { class: `g-${r.grade}` },
      el('td', {}, String(this.gachaLog.length - i)), el('td', { style: `color:${GRADES[r.grade].color}` }, r.grade), el('td', {}, r.def.name), el('td', {}, r.isNew ? '신규 입사' : `조각 +${r.shards}`))));
  }
  #showGachaResults(results) {
    const body = el('div', {}, el('p', { class: 'muted' }, `CSV 원본에서 ${results.length}행을 가져왔습니다.`));
    const grid = el('div', { class: 'card-grid result' });
    for (const r of results) {
      grid.append(el('div', { class: `card ${r.isNew ? 'new' : ''}`, onclick: () => this.openDetail(r.heroId) },
        cardCanvas(r.def, { star: this.game.state.heroes[r.heroId].star, title: r.isNew ? '신규 입사!' : `조각 +${r.shards}`, sub: r.guaranteed ? '보장' : '' }),
        r.isNew ? el('span', { class: 'card-badge new' }, 'NEW') : null));
    }
    body.append(grid);
    this.openModal('데이터 가져오기 — 완료', body);
  }

  // ------------------------------------------------------------- quests --
  #refreshQuests() {
    const s = this.game.state; const g = this.game;
    $('#daily-date').textContent = s.daily.date;
    const login = $('#btn-login'); login.disabled = s.daily.loginClaimed; login.textContent = s.daily.loginClaimed ? '출근 완료 ✓' : '출근 도장 찍기';
    const tbody = $('#quest-table tbody'); tbody.innerHTML = '';
    for (const q of Quests.activeQuests(s)) {
      const p = Quests.questProgress(s, q.id), done = Quests.questDone(s, q.id), claimed = Quests.questClaimed(s, q.id);
      const r = Quests.resolveReward(s, q.reward, g.goldMult());
      tbody.append(el('tr', { class: claimed ? 'claimed' : done ? 'done' : '' },
        el('td', { class: 'name' }, q.name, el('div', { class: 'sub' }, q.desc)),
        el('td', { class: 'num' }, `${p} / ${q.target}`),
        el('td', { class: 'small' }, rewardText(r)),
        el('td', { class: 'act' }, btn(claimed ? '완료' : '수령', () => { const rr = g.claimQuest(q.id); if (rr) this.toast(`보상: ${rewardText(rr)}`); }, done && !claimed ? 'primary' : '', !done || claimed))));
    }
    const all = Quests.allQuestsClaimed(s);
    $('#btn-allclear').disabled = !all || s.daily.allClearClaimed;
    $('#allclear-text').textContent = s.daily.allClearClaimed ? '오늘의 전체 완료 보너스를 받았습니다.' : `모든 업무 완료 시 보석 ${ALL_CLEAR_BONUS.gems} + 강화 카드 ${ALL_CLEAR_BONUS.cards}`;
    this.#refreshAchievements();
    const left = g.adsLeft();
    $('#ad-left').textContent = `오늘 남은 광고 ${left} / ${BALANCE.AD.perDay}회`;
    $('#btn-ad-instant').disabled = left <= 0;
  }

  #refreshAchievements() {
    const s = this.game.state; const g = this.game;
    const tbody = $('#ach-table tbody'); tbody.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const value = Achievements.achievementValue(s, a), tier = Achievements.claimedTiers(s, a.id), target = Achievements.nextTarget(s, a.id);
      const maxed = target === null, can = Achievements.canClaim(s, a.id);
      const show = (v) => (a.unit === 'time' ? fmtTime(v) : fmt(v));
      tbody.append(el('tr', { class: maxed ? 'claimed' : can ? 'done' : '' },
        el('td', { class: 'name' }, `${a.name} ${'★'.repeat(tier)}`, el('div', { class: 'sub' }, a.desc)),
        el('td', { class: 'num' }, maxed ? show(value) : `${show(Math.min(value, target))} / ${show(target)}`),
        el('td', { class: 'small' }, maxed ? '완료' : `보석 ${a.gems[tier]}`),
        el('td', { class: 'act' }, btn(maxed ? '완료' : '수령', () => { const r = g.claimAchievement(a.id); if (r) this.toast(`업적 ${a.name} ${r.tier}단계: 보석 +${r.gems}`); }, can ? 'primary' : '', !can))));
    }
  }

  /** Placeholder ad: full-screen countdown, then `onDone`. Replace with a rewarded-ad SDK later. */
  playAd(onDone) {
    if (this.game.adsLeft() <= 0) { this.toast('오늘 볼 수 있는 광고를 모두 시청했습니다'); return; }
    const ov = $('#ad-overlay'); const cnt = $('#ad-count'); let left = BALANCE.AD.durationSec;
    ov.hidden = false; cnt.textContent = left;
    const iv = setInterval(() => { left -= 1; cnt.textContent = left; if (left <= 0) { clearInterval(iv); ov.hidden = true; onDone(); this.#refreshQuests(); } }, 1000);
  }

  // ---------------------------------------------------------- settings --
  #refreshSettings() {
    const st = this.game.state.settings;
    $('#qa-auto').checked = st.autoAdvance; $('#set-auto').checked = st.autoAdvance; $('#set-stealth').checked = st.excel;
    $('#qa-gridlines').checked = st.gridlines !== false; $('#set-gridlines').checked = st.gridlines !== false; $('#qa-sound').checked = !!st.sound;
    $('#set-safe').checked = st.safeAdvance !== false;
    $('#qa-auto-up').checked = !!st.autoUpgrade; $('#set-auto-up').checked = !!st.autoUpgrade;
    $('#set-sound').checked = !!st.sound; $('#btn-sound').textContent = st.sound ? '🔊 효과음' : '🔇 효과음';
    this.#refreshPrestige();
  }

  #refreshPrestige() {
    const info = this.game.prestigeInfo(); const el$ = $('#prestige-info'); if (!el$) return;
    el$.innerHTML = `현재 지분 <b>${info.shares}</b> (파티 ATK·골드 +${Math.round(info.bonus * 100)}%) · 이전 ${info.count}회<br>` +
      (info.eligible ? `지금 이전하면 지분 <b>+${info.gain}</b> (+${Math.round(info.gain * info.perShare * 100)}%)` : `Phase ${info.minCleared / BALANCE.BOSS_EVERY}-10 클리어(스테이지 ${info.minCleared}) 후 이전 가능 · 현재 최고 클리어 ${this.game.state.maxCleared}`);
    $('#btn-prestige').disabled = !info.eligible;
    $('#shares-top').textContent = info.shares;
  }
  #buildFormulaSheet() {
    $('#formula-list').innerHTML = [
      ['업그레이드 비용', '=FLOOR(10 * 1.12 ^ (Level - 1))'],
      ['몬스터 HP', '=FLOOR(50 * 1.18 ^ (Stage - 1))'],
      ['몬스터 ATK', '=FLOOR(1 * 1.13 ^ (Stage - 1))'],
      ['엘리트', `HP ×${BALANCE.ELITE.hp} · ATK ×${BALANCE.ELITE.atk} · 골드 ×${BALANCE.ELITE.gold} (5스테이지부터 확률 증가, 최대 30%)`],
      ['처치 골드', '=FLOOR(5 * 1.15 ^ (Stage - 1)) * (1 + 성과급 + 영업 마인드)'],
      ['영웅 ATK', '=FLOOR(Base * 1.10 ^ (Level - 1) * StarMult * (1 + 0.04 * 강화))'],
      ['영웅 HP', '=FLOOR(Base * 1.08 ^ (Level - 1) * StarMult * (1 + 0.04 * 강화) * (1 + 의자))'],
      ['보스', '=MonsterHP * 8   /   30초 제한, 실패 시 후퇴'],
      ['사냥 / 도전', '기본은 현재 스테이지 무한 사냥. 도전 중 20킬(보스는 30초 내 처치)로 클리어. 실패(전멸·타임아웃) 시 직전 스테이지 사냥으로 복귀, 자동 진행 꺼짐'],
      ['오프라인 골드', '=IdleGoldPerSec(MaxStage) * MIN(Seconds, 36000) * 0.6'],
      ['천장', '50회 내 A 이상, 100회 내 S 확정'],
      ['조각 → 카드', 'D 1 · C 2 · B 4 · A 8 · S 16 장/조각'],
      ['직급 승진', `카드 ${BALANCE.MAIN_PROMOTE_CARDS.join('/')} · 클리어 스테이지 ${BALANCE.MAIN_PROMOTE_STAGE.join('/')}`],
    ].map(([k, f]) => `<tr><td>${k}</td><td class="mono">${f}</td></tr>`).join('');
    $('#trait-list').innerHTML = Object.values(TRAITS).map((t) => `<tr><td>${t.name}</td><td>${t.desc}</td></tr>`).join('');
  }
  #refreshFormulaSheetValues() {
    const s = this.game.state.stats; const st = this.game.state;
    $('#stats-list').innerHTML = [
      ['최고 도달 스테이지', stageLabel(st.maxStage)], ['누적 처치', fmt(s.totalKills)], ['누적 획득 골드', fmt(s.totalGold)],
      ['누적 뽑기', s.totalPulls], ['보스 처치 / 실패', `${s.bossKills} / ${s.bossFails}`], ['강화 횟수', s.enhances], ['플레이 시간', fmtTime(s.playSeconds)],
      ['방치 수익 (최고 스테이지)', `${this.game.goldPerSecAt(st.maxStage).toFixed(2)} gold/s`],
    ].map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('');
  }

  // ------------------------------------------------------------ boss key --
  /** Boss key: only the play area changes (canvas → text rows); the layout stays identical. */
  applyStealth(on, silent = false) {
    document.body.classList.toggle('stealth', on);
    $('#canvas-wrap').hidden = on; $('#stealth-view').hidden = !on;
    $('#status-ready').textContent = on ? '계산 중 (4개 프로세서): 37%' : '준비';
    $('#set-stealth').checked = on;
    $('#btn-stealth').textContent = on ? '🔓 보스 키 해제' : '🔒 보스 키';
    if (on) this.closeBackstage();
    this.#refreshFormulaBar();
    if (on) { this.#refreshStealth(); this.closeModal(); }
    if (!silent) this.toast(on ? '보스 키 ON — 전투 화면을 숨겼습니다 (Esc로 복귀)' : '보스 키 OFF');
  }
  #refreshStealth() {
    const em = this.game.entities; const tbody = $('#stealth-table tbody'); tbody.innerHTML = '';
    let n = 2;
    for (const h of em.heroes) {
      tbody.append(el('tr', {}, el('td', {}, `A${n++}`), el('td', {}, `${h.def.name} 처리`), el('td', {}, '인사'), el('td', {}, h.alive ? `${Math.round((h.hp / h.maxHp) * 100)}%` : '대기'), el('td', { class: 'num' }, fmt(h.atk))));
    }
    for (const m of em.monsters.filter((m) => m.alive)) {
      tbody.append(el('tr', {}, el('td', {}, `B${n++}`), el('td', {}, `${m.def.name} 검증`), el('td', {}, '품질'), el('td', {}, `${Math.round((m.hp / m.maxHp) * 100)}%`), el('td', { class: 'num' }, fmt(m.hp))));
    }
    for (const row of this.game.logs.slice(-10).reverse()) {
      tbody.append(el('tr', { class: 'log' }, el('td', {}, `#${row.row}`), el('td', {}, `Processing Row #${row.row}... ${row.text}`), el('td', {}, '시스템'), el('td', {}, 'OK'), el('td', { class: 'num' }, '')));
    }
  }

  // --------------------------------------------------------------- log --
  #buildLog() { const tb = $('#log-table tbody'); tb.innerHTML = ''; for (const r of this.game.logs.slice(-12)) this.#appendLog(r); }
  #appendLog(row) {
    const tb = $('#log-table tbody');
    tb.prepend(el('tr', { class: `k-${row.kind}`, title: new Date(row.t).toLocaleTimeString('ko-KR') }, el('td', {}, `#${row.row}`), el('td', {}, row.text)));
    while (tb.children.length > 14) tb.lastChild.remove();
  }

  // ------------------------------------------------------------- dialogs --
  openModal(title, content) {
    this.detailId = null;
    $('#modal-title').textContent = title;
    const body = $('#modal-body'); body.innerHTML = '';
    if (typeof content === 'string') body.innerHTML = content; else body.append(content);
    $('#modal-actions').innerHTML = ''; $('#modal-actions').append(btn('확인', () => this.closeModal(), 'primary'));
    $('#modal').hidden = false;
  }
  closeModal() { $('#modal').hidden = true; this.detailId = null; }
  showOffline(rep) {
    const body = el('div', {}, el('table', { class: 'xl-table compact', html: `<tbody>
        <tr><td>자리 비운 시간</td><td class="num">${fmtTime(rep.elapsed)}${rep.capped ? ' (최대 10시간 적용)' : ''}</td></tr>
        <tr><td>방치 수익률</td><td class="num">${rep.goldPerSec.toFixed(2)} gold/s × 60%</td></tr>
        <tr><td><b>정산 골드</b></td><td class="num"><b>+${fmt(rep.gold)}</b></td></tr></tbody>` }));
    if (this.game.adsLeft() > 0 && rep.gold > 0) {
      body.append(el('div', { class: 'ad-box' }, btn(`광고 보고 2배 받기 (+${fmt(rep.gold)} 추가)`, () => {
        this.closeModal();
        this.playAd(() => { const r = this.game.adReward('offline', rep); if (r) this.toast(`광고 보상 +${fmt(r.gold)} 골드`); });
      }, 'primary')));
    }
    this.openModal('백그라운드 계산 완료', body);
  }
  showWelcome() {
    this.openModal('새 통합 문서', `
      <p><b>엑셀 히어로즈</b>에 오신 것을 환영합니다. 파티가 사무실(A1:M8)에서 자동으로 오류 몬스터를 처리합니다.</p>
      <ul>
        <li><b>홈</b> — 전투. 오른쪽 <b>파티 관리</b> 창에서 강화. <b>데이터</b> — 카드 명단·승급·직급 승진. <b>삽입</b> — 직원 데이터 가져오기(뽑기). <b>검토</b> — 일일 업무.</li>
        <li>시작 보석 <b>${BALANCE.STARTING_GEMS}</b>개: 바로 10행 가져오기를 해보세요.</li>
        <li><b>Esc</b> 또는 🔒 보스 키: 전투 화면만 텍스트 표로 바뀌고 나머지 레이아웃은 그대로입니다.</li>
      </ul>`);
  }
  toast(text) {
    const t = $('#toast'); t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.hidden = true; }, 1800);
  }
}
