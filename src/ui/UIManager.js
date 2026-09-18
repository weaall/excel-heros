// DOM layer: ribbon, formula bar, sheets, task pane, card grid, quests, boss-key view, dialogs.
import { BALANCE, teamUpgradeCost, isBossStage, stageLabel } from '../config/balance.js';
import { HEROES, GRADES, GRADE_ORDER, ROLES, TRAITS, SKILLS, MAIN_ID, MAIN_TIER_TITLES, MAIN_TRACKS, heroesOfGrade } from '../data/heroes.js';
import { stagePool, eliteChance, bossForStage, MONSTER_TYPES, BOSSES, PALETTES, phaseOf } from '../data/monsters.js';
import { DIVISIONS, PERKS, divisionOf, divisionName } from '../data/divisions.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { phaseName, stageModifier } from '../data/stages.js';
import * as Achievements from '../core/AchievementManager.js';
import * as Milestones from '../core/MilestoneManager.js';
import { MILESTONES, milestoneValue } from '../data/milestones.js';
import { profileOf, PROFILES } from '../data/profiles.js';
import { extraOf } from '../data/profilesExtra.js';
import { PROLOGUE } from '../data/prologue.js';
import { artVersion } from '../data/cardArt.js';
import { SLOT_ORDER, gradeColor } from '../data/equipment.js';
import { STEALTH_TEXT, STEALTH_HIDE, STEALTH_TUTORIAL, STEALTH_STAGE, STEALTH_DYN, stealthLogLine, stealthStatus } from '../data/stealthLabels.js';
import { TUTORIAL_BONUS } from '../data/tutorial.js';
import { MANUAL, skillRows } from '../data/manual.js';
import { EPISODES, episodeUnlocked } from '../data/story.js';
import { ALL_CLEAR_BONUS, STREAK } from '../data/quests.js';
import { heroIconDataURL, cardCanvas, portraitCanvas, monsterSprite, heroSprite } from '../data/sprites.js';
import { cardArtUrl, cardArtUrlFor } from '../data/cardArt.js';
import { GRID } from '../core/EntityManager.js';
import * as Quests from '../core/QuestManager.js';
import { fmt, fmtTime, pct, stars } from '../utils/format.js';
import * as Ads from './Ads.js';
import { starMult } from '../config/balance.js';
import { SPARK_COST, PICKUP_RATE } from '../data/pickup.js';

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
/** 오류_도감 rows: which phases (0-based) a monster type can appear in — mirrors stagePool()'s rotation. */
const typePhases = (idx) => { const out = []; for (let p = 0; p < 20; p++) { const start = (p * 2) % MONSTER_TYPES.length; if ([0, 1, 2].some((k) => (start + k) % MONSTER_TYPES.length === idx)) out.push(p); } return out; };
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
  /** 메인_전투의 행 번호 개수: 캔버스 8행 아래로 '들어가는 만큼만'. 고정 하한이 있으면 시트가 화면보다 길어진다. */
  #homeRowCount(H) { return Math.max(4, Math.floor((H - 28 - GRID.rows * GRID.cellH) / 22)); }
  #buildGridHeaders() {
    const sheets = $('.sheets'); const W = sheets.clientWidth || 900, H = sheets.clientHeight || 640;
    const colCount = Math.max(GRID.cols, Math.ceil((W - 28) / GRID.cellW) + 1);
    const letters = (i) => (i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
    const cols = $('#col-headers'), rows = $('#row-headers'); cols.innerHTML = ''; rows.innerHTML = '';
    for (let c = 0; c < colCount; c++) cols.append(el('span', {}, letters(c)));
    for (let r = 0; r < GRID.rows; r++) rows.append(el('span', { class: 'tall' }, String(r + 1)));
    const small = this.#homeRowCount(H);
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
    const rows = $('#row-headers'); const need = GRID.rows + this.#homeRowCount(H);
    while (rows.children.length < need) rows.append(el('span', {}, String(rows.children.length + 1)));
    while (rows.children.length > need) rows.lastChild.remove(); // 창이 줄면 행도 줄어야 한다 — 안 그러면 시트가 세로로 넘친다
    this.#buildLog(); // 남는 높이가 달라졌으니 로그 줄 수도 다시 잡는다
  }

  #bind() {
    document.title = '통합 문서1 - Excel';
    document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => this.switchSheet(b.dataset.sheet)));
    document.querySelectorAll('[data-ribbon]').forEach((b) => b.addEventListener('click', () => this.showRibbon(b.dataset.ribbon)));
    document.querySelectorAll('.bs-item[data-bs]').forEach((b) => b.addEventListener('click', () => this.openBackstage(b.dataset.bs)));
    $('#bs-close').addEventListener('click', () => this.closeBackstage());
    $('#qa-stealth').addEventListener('click', () => { if (!this.game.state.settings.excel) this.game.toggleExcel(); });
    $('#qa-normal').addEventListener('click', () => { if (this.game.state.settings.excel) this.game.toggleExcel(); });
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.game.persist(); this.toast('저장됨'); return; }
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!$('#ctx-menu').hidden) this.closeContextMenu();
      else if (!$('#lightbox').hidden) this.closeLightbox();
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
    $('#qa-import').addEventListener('click', () => this.#openImportDialog());
    $('#qa-pull1').addEventListener('click', () => { this.switchSheet('gacha'); this.#pull(1); });
    $('#qa-pull10').addEventListener('click', () => { this.switchSheet('gacha'); this.#pull(10); });
    $('#qa-auto-party').addEventListener('click', () => {
      const min = $('#qa-party-grade')?.value || null;
      const p = this.game.autoParty(min);
      const kept = min && p.every((id) => this.game.isMain(id) || GRADE_ORDER.indexOf(this.game.heroDef(id).grade) >= GRADE_ORDER.indexOf(min));
      this.toast(min && !kept ? `${min}급 이상이 부족해 전체에서 편성했습니다` : `파티 자동 편성${min ? ` (${min}급 이상)` : ''}: ${p.length}명`);
    });
    $('#qa-login').addEventListener('click', () => { const r = this.game.claimLogin(); this.toast(r ? `출근 보상: ${rewardText(r)}` : '오늘은 이미 출근 도장을 찍었습니다'); });
    $('#qa-ad').addEventListener('click', () => this.openModal('광고 보상', this.#adMenu())); // (legacy handler below kept for reference)
    if (false) $('#qa-ad').addEventListener('click', () => this.playAd(() => { const r = this.game.adReward('instant'); if (r) this.toast(`광고 보상 +${fmt(r.gold)} 골드`); }));
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
    this.game.on('milestone', ({ milestone, reward }) => this.toast(`🏁 ${milestone.name} 달성! 보석 +${reward.gems}${reward.cards ? ` · 카드 +${reward.cards}` : ''}`));
    this.game.on('history', () => { if (document.querySelector('#sheet-chart.active')) this.#drawCharts(); });

    $('#qa-upgrade-all').addEventListener('click', () => { const n = this.game.upgradeCheapestLoop(); this.toast(n ? `자동 합계: 업그레이드 ${n}회 적용` : '골드가 부족합니다'); });
    this.game.on('bestiary', (key) => { const t = MONSTER_TYPES.find((m) => m.id === key) ?? BOSSES.find((b) => b.id === key); if (t) this.toast(`📒 오류 도감에 「${t.name}」 등록 (${this.game.bestiaryDiscovered()} / ${MONSTER_TYPES.length + BOSSES.length})`); if (document.querySelector('#sheet-codex.active')) this.#buildCodex(); });
    this.filter = { grade: '', role: '', div: '', owned: '', sort: 'grade' };
    const divSel = $('#rf-div'); for (const d of Object.values(DIVISIONS)) divSel.append(el('option', { value: d.id }, d.name));
    for (const k of ['grade', 'role', 'div', 'owned', 'sort']) $(`#rf-${k}`).addEventListener('change', (e) => { this.filter[k] = e.target.value; this.#buildCards(); });
    $('#btn-dismiss-all')?.addEventListener('click', () => {
      const grade = $('#rf-dismiss-grade').value; const list = this.game.dismissCandidates(grade);
      if (!list.length) { this.toast(grade + '급 이하에 방출할 여분 카드가 없습니다 (파티·즐겨찾기·조각 없는 카드는 제외)'); return; }
      const names = list.slice(0, 6).map((v) => v.def.name).join(', ') + (list.length > 6 ? ' 외 ' + (list.length - 6) + '장' : '');
      this.#askConfirm('여분 카드 일괄 방출', grade + '급 이하 여분 ' + list.length + '장을 방출합니다.\n' + names + '\n\n파티·즐겨찾기·조각이 없는 카드는 제외됩니다. 되돌릴 수 없습니다.', { ok: '방출', danger: true }).then((yes) => {
        if (!yes) return;
        const r = this.game.dismissAll(grade);
        this.toast(r.count + '장 방출 → 강화 카드 ' + fmt(r.cards) + '장' + (r.gold ? ', 골드 ' + fmt(r.gold) : ''));
      });
    });
    // 코드 등록은 **삽입 › 보석 코드 등록… 한 곳에서만** 한다. 뽑기 시트에 있던 입력란은 뺐다 —
    // 픽업 카드와 뽑기 버튼 사이에 끼여 흐름을 끊었고, 같은 기능이 두 곳에 있으면 한쪽은 잊혀진다.
    $('#qa-code')?.addEventListener('click', () => this.#openCodeDialog());
    // 교육 목록 켜고 끄기. ✕ 로 숨기면 되돌릴 입구가 없었다 — 이제 보기 › 표시에서 다시 켠다.
    $('#qa-tutorial')?.addEventListener('change', (e) => this.game.hideTutorial(!e.target.checked));
    $('#tut-hide')?.addEventListener('click', () => this.game.hideTutorial(true));
    $('#qa-manual')?.addEventListener('click', () => this.showManual());
    // 수식 대응: Enter 로 제출. 입력 칸이 자동으로 포커스를 받으므로 손을 옮길 필요가 없다.
    $('#brace-input')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const ok = this.game.submitBraceFormula(e.target.value);
      this.#closeBrace(ok);
    });
    this.game.on('brace-open', () => this.#refreshBrace());
    this.game.on('brace-close', (r) => this.#closeBrace(r?.ok ?? null));
    $('#promo-hint-go')?.addEventListener('click', () => this.openDetail(MAIN_ID));
    $('#promo-hint-hide')?.addEventListener('click', () => { this.promoHintSnooze = Date.now() + 10 * 60 * 1000; $('#promo-hint').hidden = true; });
    this.game.on('tutorial', () => this.#refreshTutorial());
    $('#prestige-hint-go')?.addEventListener('click', () => { $('#prestige-hint').hidden = true; this.openBackstage('options'); });
    $('#prestige-hint-hide')?.addEventListener('click', () => { $('#prestige-hint').hidden = true; this.prestigeHintSnooze = Date.now() + 15 * 60000; });
    $('#rf-clear').addEventListener('click', () => { this.filter = { grade: '', role: '', div: '', owned: '', sort: 'grade' }; for (const k of ['grade', 'role', 'div', 'owned']) $(`#rf-${k}`).value = ''; $('#rf-sort').value = 'grade'; this.#buildCards(); });
    // account / cloud save (Google sign-in → backend session)
    $('#cloud-url').addEventListener('change', (e) => { this.game.setCloud({ url: e.target.value }); this.#refreshCloud(); });
    $('#cloud-name').addEventListener('change', (e) => { this.game.setCloud({ name: e.target.value }); this.#refreshCloud(); });
    $('#cloud-test').addEventListener('click', async () => { const c = this.game.cloud; if (!c.configured()) { this.toast('서버 주소가 설정되지 않았습니다'); return; } try { const p = await c.ping(); this.toast(p.google ? '서버 연결 성공 · Google 로그인 사용 가능' : '서버 연결 성공 · 서버에 GOOGLE_CLIENT_ID가 없습니다'); } catch (e) { this.toast(`연결 실패: ${e.message}`); } });
    $('#cloud-push').addEventListener('click', async () => { const c = this.game.cloud; if (!c.enabled()) { this.toast('먼저 Google로 로그인하세요'); return; } try { const r = await c.push(); this.toast(r ? '계정에 저장했습니다' : c.lastError ?? '저장 보류'); } catch (e) { this.toast(`저장 실패: ${c.lastError ?? e.message}`); } this.#refreshCloud(); });
    $('#cloud-pull').addEventListener('click', async () => { const c = this.game.cloud; if (!c.enabled()) { this.toast('먼저 Google로 로그인하세요'); return; } try { const r = await c.pull(); if (!r) { this.toast('계정에 저장본이 없습니다'); return; } this.#offerSaveChoice(r, false); } catch (e) { this.toast(`불러오기 실패: ${e.message}`); } });
    $('#btn-logout').addEventListener('click', async () => { await this.game.cloud.auth.logout(); this.toast('로그아웃했습니다 · 이 브라우저 저장은 유지됩니다'); this.#refreshCloud(); });
    $('#account-btn').addEventListener('click', () => this.openBackstage('options'));
    this.game.on('cloud', () => this.#refreshCloud()); this.game.on('board', () => this.#refreshBoard());
    this.game.on('affection', ({ id, level }) => { if (level === BALANCE.AFFECTION.unlockSecret || level === BALANCE.AFFECTION.unlockLine || level === BALANCE.AFFECTION.maxLevel) this.toast(`♥ ${this.game.heroDef(id).name} 호감도 Lv ${level}${level === BALANCE.AFFECTION.unlockLine ? ' · 개인 메시지가 사내 메신저에 도착' : level === BALANCE.AFFECTION.maxLevel ? ' · MAX' : ' · 사무실 비화 해금'}`); this.#refreshDetail(); });
    this.game.on('gacha-art', () => { const box = $('#pickup-cards'); if (box) box.dataset.key = ''; this.#refreshGacha(); if (document.querySelector('#sheet-album.active')) this.#buildAlbum(); });
    this.game.on('equipment', () => this.#refreshDetail());
    this.game.on('dispatch', () => this.#refreshDispatch()); this.game.on('skin', () => { if (document.querySelector('#sheet-album.active')) this.#buildAlbum(); });
    $('#btn-dispatch').addEventListener('click', () => { const ids = [...document.querySelectorAll('#dispatch-pick input:checked')].map((i) => i.value); if (!ids.length) { this.toast('출장 보낼 대기 사원을 선택하세요 (파티 밖 카드)'); return; } if (this.game.startDispatch(ids)) this.toast(`출장 출발 · ${BALANCE.DISPATCH.hours}시간 후 복귀`); else this.toast('출장을 시작할 수 없습니다 (하루 2회, 진행 중이면 대기)'); });
    $('#btn-prologue')?.addEventListener('click', () => this.showPrologue());
    $('#btn-dispatch-claim').addEventListener('click', () => { const r = this.game.claimDispatch(); if (r) this.toast(`출장 복귀: 보석 +${r.gems} · 강화 카드 +${r.cards}`); });
    $('#album-owned').addEventListener('change', () => this.#buildAlbum());
    this.game.on('story', () => { if (document.querySelector('#sheet-story.active')) this.#buildStory(this.storyId, { listOnly: true }); });
    this.game.on('auth', (user) => { this.#refreshCloud(); if (user) this.#afterLogin(user); else if (this.game.cloud.configured() && globalThis.EXCEL_HEROES_CLOUD?.googleClientId) this.showLoginGate(); });
    Ads.setupAds();
    $('#rank-refresh').addEventListener('click', () => { this.game.cloud.board = null; this.#refreshBoard(true); });
    $('#btn-claim-all').addEventListener('click', () => { const r = this.game.claimAll(); this.toast(r.count ? `한꺼번에 수령 ${r.count}건: 보석 +${r.gems}${r.gold ? ` · 골드 +${fmt(r.gold)}` : ''}${r.cards ? ` · 카드 +${r.cards}` : ''}` : '수령할 보상이 없습니다'); this.#refreshQuests(); });
    $('#btn-overtime').addEventListener('click', () => { if (this.game.startOvertime()) { this.switchSheet('home'); this.toast('야근 모드 시작: 60초 동안 최대한 많이 처치하세요'); } else this.toast('야근 모드는 하루 한 번입니다'); this.#refreshQuests(); });
    this.game.on('overtime-end', (r) => { this.toast(`야근 종료: 처치 ${r.kills} · 보석 +${r.gems} · 카드 +${r.cards}`); this.openModal('야근 결과 보고서', `<table class="xl-table compact"><tbody><tr><th>난이도</th><td>${stageLabel(r.stage)}</td></tr><tr><th>처치</th><td>${r.kills} (엘리트 ${r.elites})</td></tr><tr><th>보석</th><td>+${r.gems}</td></tr><tr><th>강화 카드</th><td>+${r.cards}</td></tr><tr><th>개인 최고</th><td>${r.best} 처치</td></tr></tbody></table><p class="muted small">내일 다시 야근할 수 있습니다. 파티가 강해질수록 같은 60초에 더 많이 처치합니다.</p>`); });
    this.game.on('cloud', () => this.#refreshCloud()); this.game.on('board', () => this.#refreshBoard());
    Ads.setupAds();
    $('#pane-bulk5').addEventListener('click', () => { const n = this.game.upgradeAllMany(5); this.toast(n ? `일괄 레벨업: 파티 전원 총 ${n}레벨` : '골드가 부족합니다'); });
    $('#pane-bulk-max').addEventListener('click', () => { const n = this.game.upgradeAllMany(200); this.toast(n ? `일괄 레벨업(최대): 총 ${n}레벨` : '골드가 부족합니다'); });
    $('#qa-challenge').addEventListener('click', () => { if (this.game.isChallenging()) this.game.cancelChallenge(); else this.game.startChallenge(); });
    $('#qa-auto').addEventListener('change', (e) => this.game.setAutoAdvance(e.target.checked));
    $('#qa-auto-up').addEventListener('change', (e) => this.game.setAutoUpgrade(e.target.checked));
    $('#set-sound').addEventListener('change', (e) => { this.sound?.unlock(); this.game.setSound(e.target.checked); });
    $('#btn-prestige').addEventListener('click', () => {
      const info = this.game.prestigeInfo(); if (!info.eligible) return;
      this.#askConfirm('회사 이전', `지분 +${info.gain} (파티 ATK·골드 영구 +${Math.round(info.gain * info.perShare * 100)}%)

초기화: 스테이지 · 골드 · 영웅 레벨 · 회사 업그레이드
유지: 보유 영웅·별·강화·강화 카드·보석·직급·업적`, { ok: '이전하기' }).then((yes) => {
        if (!yes) return;
        const r = this.game.prestige(); if (r) this.openModal('회사 이전 완료', `<p>새 사옥으로 이전했습니다. <b>지분 +${r.gain}</b> (총 ${r.total})</p><p class="muted">파티 ATK·골드 영구 +${Math.round(r.total * r.perShare * 100)}%. Phase 1-1부터 다시 시작합니다.</p>`);
      });
    });
    $('#set-auto-up').addEventListener('change', (e) => this.game.setAutoUpgrade(e.target.checked));
    $('#set-auto').addEventListener('change', (e) => this.game.setAutoAdvance(e.target.checked));
    $('#set-stealth').addEventListener('change', (e) => this.game.toggleExcel(e.target.checked));

    for (const [id, v] of [['#banner-pickup', 'pickup'], ['#banner-standard', 'standard']]) {
      $(id)?.addEventListener('click', () => { this.game.state.settings.banner = v; this.game.persist(); this.#refreshGacha(); });
    }
    $('#pull1').addEventListener('click', () => this.#pull(1));
    $('#pull10').addEventListener('click', () => this.#pull(10));

    $('#btn-login').addEventListener('click', () => { const r = this.game.claimLogin(); if (r) this.toast(`출근 보상: ${rewardText(r)}`); });
    $('#btn-allclear').addEventListener('click', () => { const r = this.game.claimAllClear(); if (r) this.toast(`전체 완료 보너스: ${rewardText(r)}`); });
    if ($('#btn-ad-instant')) $('#btn-ad-instant').addEventListener('click', () => this.playAd(() => { const r = this.game.adReward('instant'); if (r) this.toast(`광고 보상 +${fmt(r.gold)} 골드`); }));

    $('#btn-export').addEventListener('click', () => { $('#save-text').value = this.game.exportSave(); $('#save-text').select(); this.toast('저장 문자열을 내보냈습니다'); });
    $('#btn-import').addEventListener('click', () => {
      try { this.game.importSave($('#save-text').value); this.toast('저장 데이터를 불러왔습니다'); }
      catch { this.toast('가져오기 실패: 올바르지 않은 문자열'); }
    });
    // 완전 초기화는 저장을 비우는 게 아니라 **처음부터 다시 하는 것**이다. 그래서 오프닝을 다시 틀고
    // 신입 사원 교육 목록도 1번 항목부터 되살린다. 그러지 않으면 저장만 비워진 채 게임 한가운데에 서 있게 된다.
    for (const id of ['#btn-reset', '#btn-reset2']) $(id)?.addEventListener('click', () => {
      const msg = '이 통합 문서를 삭제하고 처음부터 시작할까요?\n\n'
        + '보유 영웅·보석·강화 카드·업적·직급·지분까지 모두 사라지고, 오프닝과 신입 사원 교육을 처음부터 다시 보게 됩니다.\n'
        + '되돌릴 수 없습니다.';
      this.#askConfirm('통합 문서 삭제', msg, { ok: '삭제하고 새로 시작', danger: true }).then(async (yes) => {
        if (!yes) return;
        // 서버 기록을 **먼저** 지운다. 로컬만 지우면 이후 자동 저장이 영구히 거부된다(6-96).
        const srv = await this.game.cloud?.resetServer() ?? { ok: true, skipped: true };
        this.game.reset();
        this.switchSheet('home'); this.showRibbon('home');
        await this.showPrologue();   // 오프닝부터 다시 (showPrologue 가 prologueSeen 을 다시 세운다)
        this.#refreshTutorial();     // 교육 목록은 1번 항목부터
        // 서버 초기화가 실패했으면 숨기지 않는다 — 그대로 두면 저장이 계속 거부되는데 왜인지 알 수 없다.
        if (srv.ok) this.toast(srv.skipped ? '새 통합 문서에서 다시 시작합니다' : '새 통합 문서에서 다시 시작합니다 (서버 기록도 초기화)');
        else this.openModal('서버 기록이 남았습니다', `<p>이 브라우저는 초기화됐지만 <b>서버 기록을 지우지 못했습니다</b>: ${srv.error}</p><p class="muted">서버에 초기화 전 기록이 남아 있으면 자동 저장이 "진행이 뒤로 갔다"며 거부됩니다. 연결을 확인한 뒤 <b>검토 › 계정</b>에서 다시 초기화하거나 「지금 저장」을 눌러 주세요.</p>`);
      });
    });
    $('#modal-ok').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.closeModal(); });

    window.addEventListener('pagehide', () => { this.game.persist(); this.game.cloud?.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.game.persist(); this.game.cloud?.flush(); } });
  }

  #subscribe() {
    const g = this.game;
    g.on('roster', () => { this.#refreshHeroTable(); this.#refreshTeamTable(); this.#buildCards(); this.#refreshDetail(); this.#refreshBenchGold(); this.#refreshPromoHint(); });
    g.on('party', () => { this.#buildHeroTable(); this.#buildCards(); this.#refreshDetail(); });
    g.on('cards', () => { $('#cards-cell').textContent = fmt(g.state.cards); $('#cards-top').textContent = fmt(g.state.cards); this.#refreshDetail(); });
    g.on('main', (job) => this.openModal('승진 발표', `<p><b>김인턴</b>이(가) <b>${job.title}</b>(${job.grade}급)으로 승진했습니다!</p><p class="muted">${job.desc ?? '스탯과 스킬이 강화되었습니다.'}</p>`));
    g.on('stage', () => { this.#refreshStage(); this.#refreshPrestige(); });
    g.on('kills', () => this.#refreshStage());
    g.on('challenge', () => { this.#refreshStage(); this.#refreshSettings(); });
    g.on('wipe', () => this.toast(this.game.isChallenging() ? '팀 전원 번아웃 — 재정비 후 계속' : '팀 전원 번아웃 — 직전 스테이지에서 자동 사냥'));
    g.on('gems', () => this.#refreshGacha());
    g.on('quests', () => this.#refreshQuests());
    g.on('challenge', () => { if (this.game.isChallenging() && Math.random() < 0.6) this.game.sayLine(); });
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
      this.#refreshNowDoing(); // 0.25s tick: the line must follow the game, not wait for a stage event
      this.#refreshBrace();  // 예고는 한 대 앞서 뜬다 — 버튼도 같은 속도로 따라가야 한다
      this.#refreshHeroTable(true);
      { const el$ = $('#daily-reset'); if (el$ && document.querySelector('#sheet-quests.active')) { const now = new Date(); const mid = new Date(now); mid.setHours(24, 0, 0, 0); const sec = Math.max(0, Math.floor((mid - now) / 1000)); el$.textContent = `· 초기화까지 ${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`; } }
      if (document.querySelector('#sheet-quests.active') && this.game.dispatchInfo().active) this.#refreshDispatch(true);
      this.#refreshTeamTable(true);
      if (this.game.state.settings.excel && this.stealthTimer >= 0.5) { this.stealthTimer = 0; this.#refreshStealth(); }
      this.#refreshFormulaSheetValues();
      if (document.querySelector('#sheet-chart.active')) { this.chartTimer = (this.chartTimer ?? 0) + 0.25; if (this.chartTimer >= 1) { this.chartTimer = 0; this.#drawCharts(); } }
    }
  }

  switchSheet(name) {
    this.closeBackstage(); this.closeContextMenu();
    if (name === 'chart') { this.#drawCharts(); this.#refreshBoard(true); }
    document.querySelectorAll('.sheet').forEach((s) => s.classList.toggle('active', s.id === `sheet-${name}`));
    document.querySelectorAll('.sheet-tab').forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
    if (SHEET_RIBBON[name]) this.#activateRibbon(SHEET_RIBBON[name]);
    if (name === 'quests') this.#refreshQuests();
    if (name === 'codex') this.#buildCodex();
    if (name === 'story') this.#buildStory();
    if (name === 'album') this.#buildAlbum();
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
      item(g.isFavorite(ent.heroId) ? '♥' : '♡', g.isFavorite(ent.heroId) ? '즐겨찾기 해제' : '즐겨찾기', () => g.toggleFavorite(ent.heroId));
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
    item('▤', '페이지 레이아웃 / 기본 보기 (Esc)', () => g.toggleExcel());
    item('▤', '셀 서식…', () => this.toast('셀 서식: 이 셀은 게임 개체(그림)입니다'), { sc: 'Ctrl+1' });
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`; menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  }
  closeContextMenu() { const m = $('#ctx-menu'); if (m && !m.hidden) m.hidden = true; }

  /** Full-size illustration viewer (original file, no downscaling). */
  openLightbox(src, caption = '') {
    const lb = $('#lightbox'); $('img', lb).src = src; $('.lb-caption', lb).textContent = caption; lb.hidden = false;
    if (!lb.dataset.bound) { lb.dataset.bound = '1'; lb.addEventListener('click', () => this.closeLightbox()); }
  }
  closeLightbox() { const lb = $('#lightbox'); if (lb && !lb.hidden) { lb.hidden = true; return true; } return false; }

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
    // 도감 구성: owned per grade (doughnut, Excel default palette by grade colour)
    const byGrade = GRADE_ORDER.slice().reverse().map((gr) => { const all = HEROES.filter((h) => h.grade === gr), owned = all.filter((h) => g.state.heroes[h.id]?.owned).length; return { label: `${gr} ${owned}/${all.length}`, value: owned, color: GRADES[gr].color }; });
    this.#doughnutChart($('#chart-grade'), '도감 구성 (보유 카드 등급별)', byGrade, `${byGrade.reduce((a, b) => a + b.value, 0)} / ${HEROES.length}`);
    // 부문 편성: party members per division
    const div = {}; for (const id of g.state.party) { const d = divisionOf(g.isMain(id) ? 'main' : id); div[d] = (div[d] ?? 0) + 1; }
    this.#doughnutChart($('#chart-division'), '파티 부문 편성', Object.entries(div).map(([d, n]) => ({ label: `${DIVISIONS[d].name} ${n}`, value: n, color: DIVISIONS[d].color })), `${g.state.party.length}명`);
  }
  /** Excel-style doughnut chart with a centre label and a right-hand legend. */
  #doughnutChart(canvas, title, slices, centre = '') {
    if (!canvas) return; const ctx = canvas.getContext('2d'); const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#595959'; ctx.font = '14px "Malgun Gothic", "Segoe UI", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, W / 2, 16);
    const total = slices.reduce((a, s) => a + s.value, 0); const cx = 120, cy = H / 2 + 12, R = 74, r = 44;
    if (!total) { ctx.strokeStyle = '#d9d9d9'; ctx.lineWidth = R - r; ctx.beginPath(); ctx.arc(cx, cy, (R + r) / 2, 0, Math.PI * 2); ctx.stroke(); }
    let a0 = -Math.PI / 2;
    for (const s of slices) { if (!s.value) continue; const a1 = a0 + (s.value / total) * Math.PI * 2; ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(cx, cy, R, a0, a1); ctx.arc(cx, cy, r, a1, a0, true); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); a0 = a1; }
    ctx.fillStyle = '#333'; ctx.font = 'bold 15px "Segoe UI", Arial'; ctx.fillText(centre, cx, cy);
    ctx.textAlign = 'left'; ctx.font = '11.5px "Malgun Gothic", "Segoe UI", sans-serif';
    slices.forEach((s, i) => { const y = 48 + i * 20; ctx.fillStyle = s.color; ctx.fillRect(220, y - 6, 12, 12); ctx.fillStyle = '#404040'; ctx.fillText(`${s.label}${total ? ` (${Math.round((s.value / total) * 100)}%)` : ''}`, 240, y); });
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
    const stealth = s.settings.excel;
    const mode = $('#stage-mode');
    mode.textContent = stealth ? STEALTH_STAGE.mode(challenging) : challenging ? (boss ? '보스 도전 중' : '도전 중') : '자동 사냥';
    mode.className = `cell v stage-mode ${challenging ? 'challenge' : 'farm'}`;
    const pool = stagePool(s.stage);
    const bossDef = bossForStage(s.stage);
    $('#stage-monster').textContent = boss ? `보스: ${bossDef.name}` : pool.map((m) => m.name).join(' · ');
    const req = g.killsRequired();
    $('#kill-bar').style.width = challenging ? `${Math.min(100, (s.kills / req) * 100)}%` : '100%';
    $('#kill-bar').style.opacity = challenging ? '1' : '0.35';
    $('#kill-text').textContent = stealth ? STEALTH_STAGE.kills(s.kills, req, challenging)
      : boss ? `보스 · 제한 ${BALANCE.BOSS_TIME_LIMIT}초` : challenging ? `${s.kills} / ${req}행 처리` : `사냥 중 · 처치 ${s.kills}`;
    const ec = eliteChance(s.stage);
    const mod = stageModifier(s.stage);
    $('#stage-hint').textContent = stealth ? STEALTH_STAGE.hint(s.stage)
      : boss ? `${bossDef.desc} · ${BALANCE.BOSS_TIME_LIMIT}초 제한` : mod ? `${mod.name}: ${mod.desc}` : ec > 0 ? `엘리트 출현 ${Math.round(ec * 100)}% (HP ×${BALANCE.ELITE.hp}, 골드 ×${BALANCE.ELITE.gold})` : '';
    const next = g.nextStage();
    const fc = g.challengeForecast(challenging ? s.stage : next);
    $('#qa-challenge-label').textContent = stealth ? STEALTH_DYN.challenge(challenging)
      : challenging ? '도전 중단' : `${stageLabel(next)} 도전${isBossStage(next) ? ' (보스)' : ''}`;
    this.#refreshNowDoing();
    const fcEl = $('#qa-forecast'); fcEl.textContent = `승산 ${Math.round(fc.prob * 100)}% · ${fc.label}${fc.boss && fc.bossTime ? ` · 예상 ${fc.bossTime.toFixed(0)}s` : ''}`;
    fcEl.className = `rb-forecast ${fc.prob >= 0.7 ? 'good' : fc.prob >= BALANCE.SAFE_ADVANCE.min ? 'mid' : 'bad'}`;
    if (!stealth && !challenging && g.waitingAdvance) $('#stage-hint').textContent = `자동 진행 대기: ${stageLabel(next)} 승산 ${Math.round(fc.prob * 100)}% (강화하면 자동 재개)`;
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
        el('td', { class: 'num lvl' }), el('td', { class: 'num atk' }), el('td', { class: 'num eq' }), el('td', { class: 'num cost' }),
        el('td', { class: 'act' }, btn('+1', () => { if (!this.game.upgradeHero(id)) this.toast('골드가 부족합니다'); }, 'up'), btn('+10', () => { const n = this.game.upgradeHeroMany(id, 10); if (!n) this.toast('골드가 부족합니다'); }, 'up10')),
      );
      tbody.append(row); this.heroRows.set(id, row);
    }
    this.#refreshHeroTable();
  }
  #refreshHeroTable(light = false) {
    const gold = this.game.state.gold;
    for (const [id, row] of this.heroRows) {
      const v = this.game.heroView(id);
      if (!light) { $('.lvl', row).textContent = v.entry.level; $('.atk', row).textContent = fmt(v.atk); $('.cost', row).textContent = v.atLevelCap ? '상한' : fmt(v.cost); $('.cost', row).classList.toggle('bad', !!v.atLevelCap); $('.cost', row).title = v.atLevelCap ? v.levelCapHint : '';
        const eqCell = $('.eq', row); if (eqCell) { const n = this.game.equipOf(v.id).filter((x) => x.item).length; eqCell.textContent = `${n}/4`; eqCell.className = `num eq ${n === 4 ? 'ok' : n ? '' : 'bad'}`; eqCell.title = v.equip.setName ? `${v.equip.setName} · 모든 능력치 +${v.equip.setPct}%` : '비품 탭에서 착용하거나 자동 장착을 누르세요'; } }
      $('.up', row).disabled = gold < v.cost; $('.up10', row).disabled = gold < v.cost; row.classList.toggle('affordable', gold >= v.cost);
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
      if (!light) { $('.lvl', row).textContent = `${lvl}/${t.max}`; $('.cost', row).textContent = maxed ? 'MAX' : fmt(cost); const sub = $('.sub', row); if (sub) sub.textContent = key === 'payroll' ? `${t.desc} · 현재 ${(this.game.gemDropChance() * 100).toFixed(1)}% (엘리트 ×${BALANCE.GEM_DROP.eliteMult})` : key === 'coffee' ? `${t.desc} · 현재 +${Math.round((this.game.speedMult() - 1) * 100)}%` : `${t.desc} · 현재 +${Math.round(this.game.hpBonus() * 100)}%`; }
      $('.up', row).disabled = maxed || s.gold < cost;
    }
  }

  // -------------------------------------------------------------- cards --
  #rosterOrder() {
    const s = this.game.state;
    // grade first (S → D), then favourites, then owned — so the grid reads as grade sections
    const rank = (id) => { const e = s.heroes[id]; const g = GRADE_ORDER.indexOf(this.game.heroDef(id).grade); return g * 1000 + (this.game.isFavorite(id) ? 200 : 0) + (e.owned ? 100 : 0); };
    const f = this.filter ?? { sort: 'grade' };
    let ids = HEROES.map((h) => h.id);
    if (f.grade) ids = ids.filter((id) => this.game.heroDef(id).grade === f.grade);
    if (f.role) ids = ids.filter((id) => this.game.heroDef(id).role === f.role);
    if (f.div) ids = ids.filter((id) => divisionOf(id) === f.div);
    if (f.owned === '1') ids = ids.filter((id) => s.heroes[id].owned);
    if (f.owned === '0') ids = ids.filter((id) => !s.heroes[id].owned);
    if (f.owned === 'party') ids = ids.filter((id) => s.party.includes(id));
    const view = (id) => this.game.heroView(id);
    const sorters = {
      grade: (a, b) => rank(b) - rank(a),
      power: (a, b) => (s.heroes[b].owned ? view(b).power : -1) - (s.heroes[a].owned ? view(a).power : -1) || rank(b) - rank(a),
      atk: (a, b) => (s.heroes[b].owned ? view(b).atk : -1) - (s.heroes[a].owned ? view(a).atk : -1) || rank(b) - rank(a),
      level: (a, b) => (s.heroes[b].owned ? s.heroes[b].level : -1) - (s.heroes[a].owned ? s.heroes[a].level : -1) || rank(b) - rank(a),
      star: (a, b) => (s.heroes[b].owned ? s.heroes[b].star : -1) - (s.heroes[a].owned ? s.heroes[a].star : -1) || rank(b) - rank(a),
      name: (a, b) => this.game.heroDef(a).name.localeCompare(this.game.heroDef(b).name, 'ko'),
    };
    ids.sort(sorters[f.sort] ?? sorters.grade);
    const mainFits = (!f.grade || this.game.heroDef(MAIN_ID).grade === f.grade) && (!f.role || this.game.heroDef(MAIN_ID).role === f.role) && (!f.div || divisionOf('main') === f.div) && f.owned !== '0';
    this.filterActive = !!(f.grade || f.role || f.div || f.owned || (f.sort && f.sort !== 'grade'));
    return mainFits ? [MAIN_ID, ...ids] : ids;
  }
  #buildCards() {
    const grid = $('#card-grid'); grid.innerHTML = '';
    const tbody = $('#roster-table tbody'); tbody.innerHTML = '';
    const maxAtk = Math.max(1, ...this.#rosterOrder().filter((id) => this.game.state.heroes[id].owned).map((id) => this.game.heroView(id).atk));
    let currentGrade = null;
    const order = this.#rosterOrder();
    $('#roster-filter').classList.toggle('on', !!this.filterActive);
    $('#rf-count').textContent = this.filterActive ? `${order.length}개 레코드 중 ${order.length}개 표시 (필터 적용)` : `${order.length}개 레코드`;
    if (!order.length) grid.append(el('div', { class: 'filter-empty' }, '조건에 맞는 카드가 없습니다. 필터를 지워 보세요.'));
    for (const id of order) {
      const v = this.game.heroView(id); const e = v.entry;
      if (!v.isMain && v.def.grade !== currentGrade && (this.filter?.sort ?? 'grade') === 'grade') { // grade section header (S → D), like grouped rows in a sheet
        currentGrade = v.def.grade;
        const all = HEROES.filter((h) => h.grade === currentGrade), owned = all.filter((h) => this.game.state.heroes[h.id].owned).length;
        grid.append(el('div', { class: 'grade-section', style: `--gc:${v.grade.color}; --gb:${v.grade.bg}` }, el('b', {}, `${currentGrade} · ${v.grade.label}`), el('span', { class: 'muted small' }, ` 보유 ${owned} / ${all.length} · 확률 ${+(v.grade.rate * 100).toFixed(1)}%`)));
      }
      const c = cardCanvas(v.def, {
        star: v.star, owned: e.owned,
        title: v.isMain ? `${v.def.title} · Lv ${e.level}` : (e.owned ? `${stars(e.star)} · Lv ${e.level}` : ''),
        sub: e.enhance ? `+${e.enhance}` : '', awakened: !!e.awakened, bond: e.owned && v.affection.maxed,
      });
      const wrap = el('div', { class: `card ${v.inParty ? 'in-party' : ''} ${e.owned ? '' : 'locked'} ${e.owned && (v.def.grade === 'S' || v.def.grade === 'A' || e.awakened) ? 'holo' : ''}`, title: `${v.traitName}: ${v.traitDesc}`, onclick: () => this.openDetail(id), onmouseenter: (ev) => this.#showCardMemo(id, ev), onmousemove: (ev) => this.#moveCardMemo(ev), onmouseleave: () => this.#hideCardMemo() }, c);
      if (e.owned && (v.def.grade === 'S' || v.def.grade === 'A' || e.awakened)) wrap.append(el('span', { class: 'holo-sheen' }));
      if (this.game.isFavorite(id)) wrap.append(el('span', { class: 'card-fav', title: '즐겨찾기' }, '♥'));
      if (v.inParty) wrap.append(el('span', { class: 'card-badge' }, '배치'));
      if (e.owned && v.affection.level >= BALANCE.AFFECTION.unlockSecret) wrap.append(el('span', { class: 'card-heart', title: `호감도 Lv ${v.affection.level}` }, `♥${v.affection.level}`));
      if (v.isMain) wrap.append(el('span', { class: 'card-badge main' }, '메인'));
      if (v.canPromote) wrap.append(el('span', { class: 'card-star-up', title: `조각 ${v.promoteCost}개로 ★${v.star + 1} — 레벨 상한이 열립니다` }, '★↑'));
      grid.append(wrap);
      const partyBtn = e.owned && !v.isMain
        ? btn(v.inParty ? '해제' : '배치', () => this.game.toggleParty(id), `small ${v.inParty ? '' : 'primary'}`, !v.inParty && this.game.state.party.length >= BALANCE.PARTY_SIZE)
        : el('span', { class: 'muted small' }, v.isMain ? '고정' : '-');
      tbody.append(el('tr', {
        class: `roster-row ${e.owned ? '' : 'locked'} ${v.inParty ? 'in-party' : ''}`,
        title: e.owned ? `${v.def.name} 상세 보기` : '미보유',
        onclick: (ev) => { if (ev.target.closest('button')) return; this.openDetail(id); }, // the 배치 button keeps its own click
      },
        el('td', {}, v.def.name), el('td', { style: `color:${v.grade.color}` }, v.def.grade), el('td', {}, ROLES[v.def.role].name), el('td', { style: `color:${DIVISIONS[divisionOf(v.isMain ? 'main' : id)].color}` }, divisionName(v.isMain ? 'main' : id)), el('td', {}, v.traitName),
        el('td', {}, v.isMain ? v.def.title : (e.owned ? stars(e.star) : '미보유')), el('td', { class: 'num' }, e.owned ? e.level : '-'),
        el('td', { class: 'num', style: 'font-weight:700' }, e.owned ? fmt(v.power) : '-'),
        el('td', { class: 'num databar-td' }, el('div', { class: 'bar', style: `width:${e.owned ? Math.max(2, Math.round((v.atk / maxAtk) * 96)) : 0}%` }), el('span', {}, e.owned ? fmt(v.atk) : '-')),
        el('td', { class: 'num', style: 'color:#e84393' }, e.owned ? `♥${v.affection.level}` : '-'),
        el('td', { class: `num shard-td ${v.canPromote ? 'can-star' : ''}`, title: v.canPromote ? `조각 ${v.promoteCost}개로 ★${v.star + 1} 돌파 가능` : '' },
          e.owned ? (v.canPromote ? `▲ ${e.shards} / ${v.promoteCost}` : String(e.shards)) : '-'),
        el('td', { class: 'ctl' }, partyBtn)));
    }
    const upCount = HEROES.filter((h) => this.game.heroView(h.id).canPromote).length;
    const upBox = $('#star-ready'); if (upBox) { upBox.hidden = upCount === 0; upBox.textContent = `★ 한계 돌파 가능 ${upCount}장`; }
    $('#party-count').textContent = `${this.game.state.party.length} / ${BALANCE.PARTY_SIZE}`;
    this.#refreshSynergy();
    const col = this.game.collection();
    $('#collection-text').textContent = `${col.owned} / ${col.total}종 · ATK +${Math.round(col.atk * 100)}% · 골드 +${Math.round(col.gold * 100)}%`;
    $('#qa-collection').textContent = `도감 ${col.owned} / ${col.total}종 · ATK +${Math.round(col.atk * 100)}% · 골드 +${Math.round(col.gold * 100)}%`;
  }

  /** 부문 시너지 summary in the roster head and the party task pane. */
  #refreshSynergy() {
    const syn = this.game.synergy();
    const parts = syn.sets.map((x) => `${x.name} ${x.count}명 (ATK +${Math.round(x.atk * 100)}%${x.hp ? `, HP +${Math.round(x.hp * 100)}%` : ''} · ${x.perk.desc})`);
    if (syn.balanced) parts.push('균형 편성 (HP +10%)');
    const txt = $('#synergy-text'); if (txt) txt.textContent = parts.length ? parts.join(' · ') : '없음';
    const pane = $('#pane-synergy'); if (!pane) return; pane.innerHTML = '';
    for (const x of syn.sets) pane.append(el('tr', {}, el('td', { style: `color:${x.color}; font-weight:700` }, x.name), el('td', { class: 'num' }, x.count), el('td', { class: 'eff' }, `ATK +${Math.round(x.atk * 100)}%${x.hp ? ` · HP +${Math.round(x.hp * 100)}%` : ''} · ${x.perk.desc}`)));
    pane.append(el('tr', { class: syn.balanced ? '' : 'off' }, el('td', {}, '균형 편성'), el('td', { class: 'num' }, syn.balanced ? '4/4' : `${new Set(this.game.state.party.map((id) => this.game.heroDef(id).role)).size}/4`), el('td', { class: 'eff' }, syn.balanced ? 'HP +10%' : '탱커·근접·원거리·힐러 모두 편성 시 HP +10%')));
    if (!syn.sets.length) pane.append(el('tr', { class: 'off' }, el('td', { colspan: 3, class: 'eff' }, '같은 부문 2명 이상을 편성하면 시너지가 켜집니다')));
  }

  /** 사내_메신저: episode list + chat log rendered as worksheet rows that appear one by one. */
  #buildStory(selectId = this.storyId, { listOnly = false } = {}) {
    const g = this.game, s = g.state; const list = $('#story-list tbody'); if (!list) return; list.innerHTML = '';
    const personal = HEROES.filter((h) => s.heroes[h.id]?.owned && g.affectionOf(h.id).lineUnlocked && extraOf(h.id));
    $('#story-count').textContent = `${EPISODES.filter((e) => s.storyRead[e.id]).length} / ${EPISODES.length}`;
    const rows = [...EPISODES.map((ep) => ({ kind: 'ep', id: ep.id, ep })), ...personal.map((h) => ({ kind: 'dm', id: `dm:${h.id}`, hero: h }))];
    for (const r of rows) {
      const unlocked = r.kind === 'dm' || episodeUnlocked(r.ep, s.maxStage); const read = r.kind === 'dm' || !!s.storyRead[r.id];
      const tr = el('tr', { class: `${unlocked ? '' : 'locked'} ${this.storyId === r.id ? 'active' : ''}`, onclick: () => { if (!unlocked) { this.toast(`${phaseName((r.ep.phase - 1) * 10 + 1)}에 도달하면 열립니다`); return; } this.storyId = r.id; this.#buildStory(r.id); } },
        el('td', {}, r.kind === 'dm' ? '♥' : String(r.ep.phase)),
        el('td', {}, r.kind === 'dm' ? `1:1 · ${r.hero.name}` : unlocked ? `${r.ep.room} · ${r.ep.title}` : `${r.ep.room} · ???`, el('div', { class: 'sub' }, r.kind === 'dm' ? '개인 메시지' : unlocked ? phaseName((r.ep.phase - 1) * 10 + 1) : `Phase ${r.ep.phase}-1 도달 시`)),
        el('td', { class: 'small' }, r.kind === 'dm' ? '호감도 Lv5' : !unlocked ? '🔒' : read ? '읽음' : el('b', { style: 'color:#217346' }, `NEW · 보석 +${BALANCE.STORY.gems}`)));
      list.append(tr);
    }
    if (listOnly) return;
    const log = $('#story-log tbody'); log.innerHTML = '';
    if (!selectId) { log.append(el('tr', {}, el('td', { colspan: 3, class: 'muted small' }, '왼쪽 목록에서 에피소드를 선택하세요.'))); return; }
    let lines, title;
    if (selectId.startsWith('dm:')) { const hid = selectId.slice(3); const x = extraOf(hid), p = PROFILES[hid]; lines = [[hid, p.line], ['main', '(답장을 고민하는 중…)'], [hid, x.line2]]; title = `1:1 ${g.heroDef(hid).name}`; }
    else { const ep = EPISODES.find((e) => e.id === selectId); if (!ep || !episodeUnlocked(ep, s.maxStage)) return; lines = ep.lines; title = ep.title; }
    if (this.storyTimer) clearInterval(this.storyTimer);
    const t0 = new Date(); t0.setHours(9, 12, 0, 0);
    const name = (who) => who === 'sys' ? '시스템' : who === 'main' ? `${g.heroDef(MAIN_ID).name} (나)` : (HERO_BY_ID_SAFE(who)?.name ?? who);
    const HERO_BY_ID_SAFE = (id) => HEROES.find((h) => h.id === id);
    const icon = (who) => { const def = who === 'main' ? g.heroDef(MAIN_ID) : HERO_BY_ID_SAFE(who); return def ? el('img', { src: heroIconDataURL(def), alt: '' }) : null; };
    let i = 0;
    const typing = el('tr', { class: 'typing' }, el('td', { class: 'num' }, ''), el('td', {}, ''), el('td', {}, '입력 중…')); log.append(typing);
    const step = () => {
      if (i >= lines.length) { clearInterval(this.storyTimer); this.storyTimer = null; typing.remove();
        if (!selectId.startsWith('dm:')) { const gems = g.readStory(selectId); if (gems) { log.append(el('tr', {}, el('td', { colspan: 3, class: 'story-reward' }, `✓ ${title} 읽음 — 보석 +${gems}`))); this.toast(`메신저 로그 확인 · 보석 +${gems}`); } }
        return; }
      const [who, text] = lines[i++]; const t = new Date(t0.getTime() + i * 47000);
      const tr = el('tr', { class: who === 'sys' ? 'sys' : who === 'main' ? 'me' : '' }, el('td', { class: 'num small' }, `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`), el('td', { class: 'who' }, icon(who), name(who)), el('td', {}, text));
      typing.before(tr); this.game.emit('sfx', 'coin');
    };
    step(); this.storyTimer = setInterval(step, 650);
  }

  /** Mandatory sign-in screen (when a cloud server is configured). Resolves once the player is logged in. */
  showLoginGate() {
    const gate = $('#login-gate'); if (!gate) return Promise.resolve();
    const a = this.game.cloud.auth; if (a.loggedIn()) return Promise.resolve();
    gate.hidden = false; this.game.paused = true;
    const note = $('#lg-note'); const box = $('#gsi-gate'); box.innerHTML = '';
    a.renderButton(box, { size: 'large', text: 'signin_with' }).then((ok) => { note.textContent = ok ? 'Google 계정으로 로그인하면 바로 시작합니다.' : 'Google 로그인 스크립트를 불러오지 못했습니다. 새로 고침해 주세요.'; });
    return new Promise((resolve) => {
      const off = a.on((user) => { if (user) { off(); gate.hidden = true; this.game.paused = false; resolve(user); } else if (a.error) note.textContent = a.error; });
    });
  }

  /** Small idle-sprite preview used by the skin chips. */
  #skinPreview(def, k = 2) {
    const c = document.createElement('canvas'); c.width = 32 * k; c.height = 56 * k; c.className = 'skin-prev'; c.style.width = `${32 * k}px`; c.style.height = `${56 * k}px`; const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; // 2k× pixel preview
    const img = heroSprite(def, 'idle', 0); if (img) ctx.drawImage(img, 16, 4, 32, 56, 0, 0, 32 * k, 56 * k); // default scale → 64×64 frame, doll at (16,4) 32×56
    return c;
  }

  /** A-grade arrival: a short banner over the reveal dialog — loud enough to notice, quiet enough that S still wins. */
  #showHeroBanner(r) {
    const host = $('#modal-body'); if (!host) return;
    const v = this.game.heroView(r.heroId); const def = v.def;
    host.querySelector('.hero-banner')?.remove();
    const art = cardArtUrlFor(def) ?? cardArtUrl(def.id);
    const el$ = el('div', { class: 'hero-banner', style: `--gc:${v.grade.color}` },
      art && !/\.svg$/i.test(art) ? el('img', { src: art, alt: '' }) : null,
      el('div', { class: 'hb-text' },
        el('b', {}, `${def.grade}급 ${v.grade.label}`),
        el('span', {}, def.name),
        el('small', {}, r.isNew ? '신규 영입' : `조각 +${r.shards ?? 0}`)));
    host.append(el$);
    setTimeout(() => el$.classList.add('out'), 1500);
    setTimeout(() => el$.remove(), 2000);
  }

  /** S-grade splash: the full illustration slides in over the reveal dialog with the character's line. */
  #showSplash(r) {
    const url = cardArtUrl(r.heroId); if (!url || /\.svg$/i.test(url)) return;
    const p = profileOf(r.heroId); const modal = $('#modal .dialog');
    const dust = el('div', { class: 'dust' }, ...Array.from({ length: 26 }, (_, k) =>
      el('i', { style: `--x:${(k * 37) % 100}%; --d:${2.2 + (k % 5) * 0.6}s; --w:${0.1 * (k % 9)}s; --s:${2 + (k % 4)}px` })));
    const formula = el('div', { class: 'splash-formula' }, el('span', { class: 'fx-name' }, 'A1'), el('span', { class: 'fx-fx' }, 'fx'), el('code', {}, ''));
    const sp = el('div', { class: 'splash legend', onclick: () => sp.remove() },
      el('div', { class: 'shock' }), el('div', { class: 'beams' }), dust,
      el('img', { src: url, alt: r.def.name }),
      el('div', { class: 'ribbon' }, el('b', {}, 'S'), el('span', {}, 'LEGENDARY')),
      formula,
      el('div', { class: 'cap' }, el('div', { class: 'nm' }, `${r.def.name}${p ? ` · ${p.nick}` : ''}`), p ? el('div', { class: 'q' }, `"${p.line}"`) : null),
      el('div', { class: 'hint' }, '클릭하여 닫기'));
    modal.append(sp);
    // 이름이 수식으로 조회되어 나온다 — 화려함을 이 게임의 언어로 번역하는 부분
    const code = formula.querySelector('code');
    const text = `=VLOOKUP("${r.def.name}", 인사_명단, 2, FALSE)`;
    let i = 0;
    const type = setInterval(() => {
      code.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(type); setTimeout(() => { code.classList.add('done'); code.textContent = `${r.def.name} · S · ${r.def.title ?? '전설'}`; sp.classList.add('resolved'); }, 260); }
    }, 26);
    setTimeout(() => { clearInterval(type); if (sp.isConnected) sp.remove(); }, 4800);
  }

  /** 오류_도감 sheet: one row per monster type (+ bosses), thumbnails greyed out until first kill. */
  #buildCodex() {
    const tbody = $('#codex-table tbody'); if (!tbody) return; tbody.innerHTML = '';
    const g = this.game; const total = MONSTER_TYPES.length + BOSSES.length;
    $('#codex-count').textContent = `${g.bestiaryDiscovered()} / ${total}`;
    const row = (def, thumbDef, cls, kind, appear, traits) => {
      const n = g.bestiaryCount(def.id), ne = g.bestiaryCount(def.id + '!'), known = n > 0;
      const sprite = monsterSprite(thumbDef, 0); let thumb;
      if (sprite) { thumb = document.createElement('canvas'); thumb.width = 64; thumb.height = 64; thumb.className = 'thumb'; const cx = thumb.getContext('2d'); cx.imageSmoothingEnabled = false; const sc = Math.min(64 / sprite.width, 64 / sprite.height); const w = Math.floor(sprite.width * sc), h = Math.floor(sprite.height * sc); cx.drawImage(sprite, Math.floor((64 - w) / 2), 64 - h, w, h); }
      tbody.append(el('tr', { class: `${cls} ${known ? '' : 'unknown'}` },
        el('td', {}, thumb ?? ''), el('td', { class: 'name' }, known ? def.name : '???', el('div', { class: 'sub' }, known ? (def.desc ?? '') : '처치하면 공개')),
        el('td', {}, el('span', { class: `tag ${kind === '보스' ? 'boss' : ''}` }, kind)), el('td', { class: 'small' }, appear),
        el('td', { class: 'small' }, ...traits.map((t) => el('span', { class: `tag ${t.cls ?? ''}` }, t.label))),
        el('td', { class: 'num' }, known ? fmt(n) : '-'), el('td', { class: 'num' }, known ? fmt(ne) : '-')));
    };
    MONSTER_TYPES.forEach((t, i) => {
      const phases = typePhases(i).slice(0, 3);
      const appear = phases.map((p) => `Phase ${p + 1}`).join(', ') + (typePhases(i).length > 3 ? ' …' : '');
      const traits = [];
      if (t.ranged) traits.push({ label: t.ranged === 'drop' ? '원거리 · 낙하' : t.ranged === 'paper' ? '원거리 · 서류' : '원거리 · 광선', cls: 'ranged' });
      else traits.push({ label: '근접' });
      const pal = PALETTES[phases[0] % PALETTES.length];
      row(t, { ...t, palette: pal, hue: ((phases[0] % PALETTES.length) * 36) % 360 }, '', '일반', appear, traits);
    });
    BOSSES.forEach((b, i) => row(b, b, 'boss', '보스', `Phase ${i + 1}, ${i + 1 + BOSSES.length}, ${i + 1 + 2 * BOSSES.length} … (10의 배수 스테이지)`, [{ label: b.desc, cls: 'boss' }]));
  }

  // ------------------------------------------------------ hero detail --
  openDetail(id) { this.detailId = id; this.#renderDetail(); $('#modal').hidden = false; this.game.markTutorial('detail'); }
  #refreshDetail() { if (this.detailId && !$('#modal').hidden) this.#renderDetail(); }
  /**
   * Card detail dialog, laid out like a worksheet record: art on the left; on the right a header line, a stat table
   * (each row = one number with its own controls), then trait / skill / ★ ladder / profile sections; grouped action bar.
   */
  #renderDetail() {
    const id = this.detailId; const g = this.game; const v = g.heroView(id); const e = v.entry; const s = g.state;
    const p = profileOf(v.isMain ? 'main' : id);
    $('#modal-title').textContent = v.isMain ? `${v.def.name} · ${v.def.title} (메인 영웅)` : `${v.def.name} · ${v.grade.name}급 ${v.grade.label}`;
    const body = $('#modal-body'); body.innerHTML = '';
    const artUrl = cardArtUrlFor(v.def) ?? cardArtUrl(v.isMain ? v.def.id : id);
    const portrait = artUrl && !/\.svg$/i.test(artUrl)
      ? el('img', { class: 'detail-art', src: artUrl, alt: v.def.name, title: '클릭하면 원본 크기로 봅니다', onclick: () => this.openLightbox(artUrl, `${v.def.name} · ${p?.nick ?? ''}`) })
      : portraitCanvas(v.def, 3);
    // 설명은 기본적으로 **접는다**(툴팁). 정보 탭이 길어진 건 행마다 설명이 셀 안에 펼쳐져서였다 —
    // 전투력 한 행이 네 줄을 차지했다. `open`을 준 행만 펼쳐 둔다: 지금 누를 버튼의 비용처럼 행동에
    // 직접 쓰이는 숫자들.
    const row = (label, value, ctrl = null, hint = null, open = false) => {
      const plain = typeof hint === 'string' ? hint : null;
      const cell = el('td', { class: 'val' }, value, hint && (open || !plain) ? el('div', { class: 'hint' }, hint) : null);
      const tr = el('tr', {}, el('th', {}, label), cell, el('td', { class: 'ctl' }, ctrl));
      if (plain && !open) { tr.title = plain; tr.classList.add('has-tip'); }
      return tr;
    };
    const sb = (label, fn, cls = '', disabled = false, title = '') => { const b = btn(label, fn, `small ${cls}`, disabled); if (title) b.title = title; return b; };
    // --- header
    const head = el('div', { class: 'dt-head' },
      el('span', { class: 'dt-grade', style: `background:${v.grade.color}` }, v.def.grade),
      el('b', { class: 'dt-name' }, v.def.name),
      p ? el('span', { class: 'dt-nick' }, `${p.nick} · ${p.dept}`) : null,
      p ? (() => { const d = DIVISIONS[divisionOf(v.isMain ? 'main' : id)]; return el('span', { class: 'dt-div', style: `border-color:${d.color}; color:${d.color}`, title: `부문 특성 (2명 이상): ${PERKS[d.id].desc}` }, `${d.name} 부문`); })() : null,
      el('span', { class: 'dt-role' }, `${ROLES[v.def.role].name}${v.isMain ? ` · ${MAIN_TIER_TITLES[v.def.tier]}` : ` · ${stars(v.star)}`}${v.awakened ? ' · ✦각성' : ''}`),
      e.owned && v.affection.maxed ? el('span', { class: 'dt-bond', title: '호감도 Lv 10: 절친 칭호 · 카드 핑크 프레임' }, '♥ 절친') : null,
      e.owned ? sb(g.isFavorite(id) ? '♥' : '♡', () => g.toggleFavorite(id), g.isFavorite(id) ? 'fav on' : 'fav', false, '즐겨찾기') : null);
    // --- stat table
    const table = el('table', { class: 'dt-table' });
    if (!e.owned) {
      // 미보유 카드도 판단 재료는 줘야 한다 — '쫓을 가치가 있나'에 답하는 줄들
      const pick = Object.values(g.pickup()).includes(id);
      const pity = { a: BALANCE.PITY_A - s.pity.sinceA, s: BALANCE.PITY_S - s.pity.sinceS };
      table.append(row('상태', pick ? '미보유 · 오늘의 픽업' : '미보유', null, '삽입 › 데이터 가져오기에서 영입'));
      table.append(row('★1 전투력', fmt(v.power), null, '보유하면 레벨·★·강화로 올라갑니다 (ATK×2 + HP÷10)'));
      table.append(row('★1 ATK', fmt(v.atk)));
      table.append(row('★1 HP', fmt(v.hp)));
      table.append(row('공격 속도', `${v.interval}s`));
      table.append(row('영입 확률', `${v.def.grade}급 ${(v.grade.rate * 100).toFixed(v.grade.rate < 0.01 ? 1 : 0)}%`, null,
        `${pick ? '픽업 중이라 같은 등급 안에서 더 잘 나옵니다. ' : ''}모집 포인트로 교환하는 천장도 있습니다`));
      table.append(row('천장까지', `A 이상 ${pity.a}회 · S ${pity.s}회`, null, '뽑을수록 줄어듭니다 — 모집 포인트 교환과는 별개입니다'));
    }
    else {
      table.append(row('레벨', `Lv ${e.level} / ${v.levelCap}`, el('div', { class: 'ctl-group' },
        sb('-10', () => { if (!g.downgradeHero(id, 10)) this.toast('레벨 1입니다'); }, '', e.level <= 1, `레벨 -10 · 골드 환급`),
        sb('-1', () => { if (!g.downgradeHero(id, 1)) this.toast('레벨 1입니다'); }, '', e.level <= 1, `레벨 -1 · 골드 ${fmt(v.refundPerLevel)} 환급`),
        sb('+1', () => { if (!g.upgradeHero(id)) this.toast('골드가 부족합니다'); }, 'primary', s.gold < v.cost, `레벨 +1 · 골드 ${fmt(v.cost)}`),
        sb('+10', () => { if (!g.upgradeHeroMany(id, 10)) this.toast('골드가 부족합니다'); }, 'primary', s.gold < v.cost, '레벨 +10 (골드가 되는 만큼)'),
        sb('초기화', () => { const r = g.resetHeroLevel(id); this.toast(r ? `레벨 초기화: 골드 ${fmt(r)} 환급` : '레벨 1입니다'); }, 'danger', e.level <= 1, '레벨 1로 되돌리고 전액 환급')),
        v.atLevelCap ? `레벨 상한 도달 — ${v.levelCapHint}` : `다음 레벨 골드 ${fmt(v.cost)} · 되돌리면 ${fmt(v.refundPerLevel)} 환급`, true));
      table.append(row('전투력', fmt(v.power), null, '등급·★·레벨·강화·비품을 합친 비교값 (ATK×2 + HP÷10) — 등급이 낮아도 이 숫자가 높으면 더 셉니다'));
      table.append(row('공격력 ATK', fmt(v.atk)));
      table.append(row('체력 HP', fmt(v.hp)));
      if (!v.isMain && v.star < BALANCE.MAX_STAR) { const k = starMult(v.star + 1) / starMult(v.star); table.append(row(`★${v.star + 1} 미리보기`, `ATK ${fmt(Math.floor(v.atk * k))} · HP ${fmt(Math.floor(v.hp * k))}`, null, `한계 돌파 시 ×${k.toFixed(2)} · 강화 한계 ${BALANCE.ENHANCE_CAP_BY_STAR[v.star] ?? v.enhanceCap}`)); }
      table.append(row('공격 속도', `${v.interval}s`));
      table.append(row('강화', `+${e.enhance} / 한계 ${v.enhanceCap}`,
        sb(v.enhanceMaxed ? 'MAX' : `+1 (카드 ${v.enhanceCost})`, () => { if (!g.enhance(id)) this.toast(v.enhanceMaxed ? `★${v.star} 카드의 강화 한계는 +${v.enhanceCap}입니다. ★승급이나 각성으로 한계를 올리세요` : '강화 카드가 부족합니다'); }, v.canEnhance ? 'primary' : '', !v.canEnhance, '강화 카드로 +4% ATK/HP'),
        v.isMain ? '한계는 직급 승진으로 상승' : `한계 = ★×10${v.awakened ? ' + 각성 10' : ''} · 보유 강화 카드 ${fmt(s.cards)}장`));
      if (!v.isMain) table.append(row('조각', v.promoteCost !== null ? `${e.shards} / ${v.promoteCost}` : `${e.shards} (최대 ★)`,
        el('div', { class: 'ctl-group' },
          sb(`★ 한계 돌파`, () => this.#promoteWithDialog(id), v.canPromote ? 'primary' : '', !v.canPromote, v.promoteCost !== null ? `조각 ${v.promoteCost}개로 ★${v.star + 1}` : '최대 ★'),
          sb(`조각→카드`, () => g.convertShards(id), '', e.shards <= 0, `조각 ${e.shards}개 → 강화 카드 ${e.shards * v.shardCardValue}장`),
          (() => { const sc = g.scoutInfo(id); return sb(sc.cost !== null ? `스카우트 (골드 ${fmt(sc.cost)})` : '스카우트', () => {
            if (g.scoutShard(id) === null) this.toast(g.scoutInfo(id).why || '지금은 스카우트할 수 없습니다');
            else this.toast(`경력직 스카우트 — 조각 +1 (오늘 ${g.scoutInfo(id).left}회 남음)`);
          }, sc.can ? 'primary' : '', !sc.can, `골드로 조각 1개를 삽니다 · 오늘 ${sc.left} / ${sc.perDay}회 남음${sc.why ? ' — ' + sc.why : ''}`); })()),
        v.promoteCost !== null ? `다음 한계 돌파까지 조각 ${Math.max(0, v.promoteCost - e.shards)}개 · 같은 카드가 또 나오면 조각 5~10 · 스카우트는 하루 ${BALANCE.SCOUT.perDay}회` : '★5 · 각성으로 계속 성장'));
      if (!v.isMain && v.star >= BALANCE.AWAKEN.star) table.append(row('각성', v.awakened ? '✦ 완료' : '가능',
        v.awakened ? null : sb(`✦ 각성 (카드 ${v.awakenCost})`, () => { if (g.awaken(id)) this.#showAwaken(id); else this.toast('강화 카드가 부족합니다'); }, 'primary', !v.canAwaken),
        `ATK/HP +${Math.round(BALANCE.AWAKEN.atk * 100)}% · 특성 ×${BALANCE.AWAKEN.trait} · 스킬 ×${BALANCE.AWAKEN.skill} · 강화 한계 +${BALANCE.ENHANCE_CAP_AWAKEN}`));
    }
    table.append(row('특성', el('span', { class: 'nm-trait' }, v.traitName), null, v.traitDesc, true));
    // --- 스킬 pane: one record per number (name / effect / power / cooldown / level), then the ★ growth ladder
    const sl = g.skillLevelInfo(id); const SK = SKILLS[v.def.skill.type]; const L = BALANCE.SKILL_LEVEL;
    const skillPane = el('div', { class: 'dt-sections pane-skill' }, el('table', { class: 'dt-table' },
      row('스킬명', el('span', { class: 'nm-skill' }, v.skillName), null, `${SK.name} 계열${v.def.skill.name && v.def.skill.name !== SK.name ? ` · ${v.def.name} 고유 명칭` : ''}`),
      row('효과', v.skillDesc, null, v.skillUnlocked ? null : el('span', { class: 'lock' }, `🔒 ${v.skillUnlockHint}`)),
      v.skillStarNote ? row('★ 효과', v.skillStarNote, null, '중복 카드로 ★을 올리면 스킬의 성질 자체가 바뀝니다') : null,
      row('위력', `×${(v.def.skill.power * v.skillPower).toFixed(2)}`, null, `기본 ×${v.def.skill.power}${sl.level ? ` · 스킬 Lv ×${sl.power.toFixed(2)}` : ''}${!v.isMain && v.star >= BALANCE.SKILL_BOOST_STAR ? ` · ★${BALANCE.SKILL_BOOST_STAR} ×${BALANCE.SKILL_BOOST_MULT}` : ''}${v.awakened ? ` · 각성 ×${BALANCE.AWAKEN.skill}` : ''}`),
      row('대기 시간', `${(SK.cooldown * sl.cooldown).toFixed(1)}s`, null, `기본 ${SK.cooldown}s${sl.level ? ` · 스킬 Lv ×${sl.cooldown.toFixed(2)}` : ''}`),
      SK.duration ? row('지속', `${SK.duration}s`) : null,
      e.owned ? row('스킬 Lv', `${sl.level} / ${sl.max}`,
        v.skillUnlocked ? sb(sl.cost === null ? 'MAX' : `강화 Lv ${sl.level + 1} (카드 ${sl.cost})`, () => { if (g.upgradeSkill(id)) { this.toast(`${v.def.name} 스킬 Lv ${sl.level + 1}: 위력 +${Math.round(L.powerPerLevel * 100)}%, 대기 -${Math.round(L.cooldownPerLevel * 100)}%`); this.#refreshDetail(); } else this.toast('강화 카드가 부족합니다'); }, sl.can ? 'primary' : '', !sl.can) : null,
        v.skillUnlocked ? `Lv당 위력 +${Math.round(L.powerPerLevel * 100)}% · 대기 -${Math.round(L.cooldownPerLevel * 100)}% · 카드 ${L.cardCost[v.def.grade]} × 다음 Lv` : `해금 후 강화 가능 · ${v.skillUnlockHint}`) : null,
      v.isMain
        ? row('승진 효과', MAIN_TIER_TITLES[v.def.tier], null, `스킬 해금 = ${MAIN_TIER_TITLES[BALANCE.MAIN_SKILL_TIER]} · 스킬 ×${BALANCE.SKILL_BOOST_MULT} = ${MAIN_TIER_TITLES[BALANCE.MAIN_SKILL_BOOST_TIER]} · 트랙마다 스킬 종류가 다름`)
        : row('★ 성장', el('div', { class: 'star-perks' }, ...[[2, '스킬 해금'], [3, `특성 ×${BALANCE.STAR_TRAIT_BOOST.mult}`], [4, `스킬 ×${BALANCE.SKILL_BOOST_MULT}`], [5, '각성']].map(([st, label]) => el('span', { class: `perk ${v.star >= st ? 'on' : ''}` }, `★${st} ${label}`))), null, `현재 ${stars(v.star)} · 한계 돌파로 다음 단계 해금`)));
    // --- 스킨 pane: what is equipped, how each skin unlocks, then a grid of 6× previews
    const skins = e.owned ? g.skinsOf(id) : []; const activeSkin = skins.find((x) => x.active);
    const skinPane = el('div', { class: 'dt-sections pane-skin' });
    if (!e.owned) skinPane.append(el('p', { class: 'muted small' }, '미보유 카드입니다. 획득하면 기본 복장 외에 사복·정장 스킨을 장착할 수 있습니다.'));
    else {
      skinPane.append(el('table', { class: 'dt-table' },
        row('장착 중', activeSkin ? activeSkin.name : '기본', activeSkin ? sb('기본으로', () => { g.equipSkin(id, null); this.#refreshDetail(); }) : null, activeSkin ? activeSkin.desc : '입사 당시 복장 · 카드 일러스트와 도트 원본'),
        row('해금', `${skins.filter((x) => x.owned).length} / ${skins.length}`, null, skins.map((x) => `${x.name}: ${x.unlock.affection ? `호감도 Lv ${x.unlock.affection}` : `보석 ${x.unlock.gems}`}`).join(' · ')),
        row('적용 범위', '도트 · 카드 · 앨범', null, '전투 도트 팔레트가 바뀌고, 스킨 일러스트가 있으면 카드와 앨범도 교체됩니다')));
      const chip = (sk, label, sub, active, cls, onclick, title = '') => el('button', { class: `skin-chip ${active ? 'active' : ''} ${cls}`, title, style: sk ? `--sc:${sk.frame}` : '', onclick },
        this.#skinPreview({ ...v.def, skin: sk ?? undefined }, 3), el('span', { class: 'skin-name' }, label), el('small', {}, sub));
      skinPane.append(el('div', { class: 'skin-grid' },
        chip(null, '기본', activeSkin ? '클릭하여 장착' : '장착 중', !activeSkin, '', () => { g.equipSkin(id, null); this.#refreshDetail(); }),
        ...skins.map((sk) => chip(sk, sk.name, sk.owned ? (sk.active ? '장착 중' : '보유 · 클릭하여 장착') : sk.canUnlock ? `${sk.reason} · 클릭하여 해금` : sk.reason, sk.active, sk.owned ? '' : 'locked',
          () => { if (sk.owned) { g.equipSkin(id, sk.active ? null : sk.id); this.#refreshDetail(); } else if (sk.canUnlock) { if (g.unlockSkin(id, sk.id)) { g.equipSkin(id, sk.id); this.toast(`스킨 「${sk.name}」 해금 · 장착`); this.#refreshDetail(); } } else this.toast(sk.reason); }, sk.desc))));
    }
    // --- 프로필 pane: the personnel record
    const dv = p ? DIVISIONS[divisionOf(v.isMain ? 'main' : id)] : null;
    const profilePane = el('div', { class: 'dt-sections pane-profile' }, p ? el('table', { class: 'dt-table' },
      row('이름', v.def.name, null, v.isMain ? `${v.def.title} · 승진으로 직급이 바뀝니다` : `${v.grade.name}급 ${v.grade.label}`),
      row('별명', p.nick),
      row('부서', p.dept, null, dv ? `${dv.name} 부문 · 부문 특성(2명 이상): ${PERKS[dv.id].desc}` : null),
      row('직무', `${ROLES[v.def.role].name}`, null, `특성 ${v.traitName} · 스킬 ${v.skillName}`),
      row('소개', el('span', { class: 'bio' }, p.bio)),
      row('한마디', el('span', { class: 'quote' }, `"${p.line}"`), null, v.def.grade === 'S' || v.isMain ? '필살기: 스킬 발동 시 컷인 대사' : null)) : el('p', { class: 'muted small' }, '프로필 정보가 없습니다.'));
    // --- 호감도 pane: level / xp / bonus / 간식, then the unlock ladder (비화 · 개인 메시지 · 사복 스킨 + 절친)
    const affPane = el('div', { class: 'dt-sections pane-affection' });
    if (!e.owned) affPane.append(el('p', { class: 'muted small' }, '미보유 카드입니다. 획득 후 파티에 넣고 함께 일하면 호감도가 오릅니다.'));
    else {
      const a = v.affection, A = BALANCE.AFFECTION, x = extraOf(v.isMain ? 'main' : id);
      const hearts = el('span', { class: 'hearts' }, ...Array.from({ length: A.maxLevel }, (_, i) => el('span', { class: i < a.level ? '' : 'off' }, '♥')));
      affPane.append(el('table', { class: 'dt-table' },
        row('호감도', el('span', {}, hearts, ` Lv ${a.level}${a.maxed ? ' MAX' : ''}`), null, a.maxed ? '절친 · 카드 핑크 프레임' : `다음 Lv까지 ${a.next - a.xp} xp`),
        row('경험치', a.maxed ? 'MAX' : `${a.xp} / ${a.next}`, null, el('div', { class: 'aff-bar' }, el('i', { style: `width:${Math.round(a.pct * 100)}%` }))),
        row('보너스', `ATK/HP +${Math.round(a.bonus * 100)}%`, null, `Lv당 +${Math.round(A.bonusPerLevel * 100)}% · 최대 +${Math.round(A.bonusPerLevel * A.maxLevel * 100)}%`),
        row('간식', a.gifted ? '오늘 완료 ✓' : a.maxed ? '-' : `골드 ${fmt(g.giftCost())}`,
          sb(a.gifted ? '오늘 간식 완료' : a.maxed ? '호감도 MAX' : `간식 사주기 (+${A.giftXp} xp)`, () => { if (g.giveGift(id)) { this.toast(`${v.def.name}: "${p?.line ?? '고마워요'}"`); this.#refreshDetail(); } else this.toast('골드가 부족하거나 오늘은 이미 사줬습니다'); }, a.gifted || a.maxed ? '' : 'primary', a.gifted || a.maxed || s.gold < g.giftCost()),
          `하루 1회 · 파티에서 처치 +${A.xpPerKill} · 보스 +${A.xpPerBoss}`)));
      const ms = (lv, title, body, on) => el('li', { class: on ? 'on' : 'off' }, el('b', {}, `Lv ${lv}`), el('span', { class: 'ms-title' }, title), el('div', { class: 'ms-body' }, on ? body : `🔒 Lv ${lv} 달성 시 공개`));
      affPane.append(el('div', { class: 'dt-sec aff-ladder' }, el('b', {}, '해금'), el('ul', { class: 'aff-ms' },
        ms(A.unlockSecret, '사무실 비화', x?.secret ?? '', a.secretUnlocked),
        ms(A.unlockLine, '개인 메시지 (사내 메신저)', x ? `"${x.line2}"` : '', a.lineUnlocked),
        ms(A.maxLevel, '절친 칭호 · 사복 스킨 · 핑크 프레임', '스킨 탭에서 「퇴근 사복」을 장착할 수 있습니다', a.maxed))));
    }
    // --- 비품 pane: the four slots, then the bag filtered to the slot being filled
    const equipPane = el('div', { class: 'dt-sections pane-equip' });
    if (!e.owned) equipPane.append(el('p', { class: 'muted small' }, '미보유 카드입니다. 획득하면 비품을 착용할 수 있습니다.'));
    else {
      const eq = g.equipOf(id); const stats = v.equip;
      const slotRows = el('table', { class: 'dt-table' },
        ...eq.map((sl) => row(`${sl.icon} ${sl.name}`,
          sl.item ? el('span', { style: `color:${gradeColor(sl.item.grade)}; font-weight:700` }, sl.item.label) : el('span', { class: 'muted' }, '비어 있음'),
          sl.item ? el('div', { class: 'ctl-group' },
            (() => { const c = g.equipUpgradeCost(sl.item); return sb(c === null ? 'MAX' : `강화 +${sl.item.lv + 1} (${fmt(c)}g)`, () => { if (g.upgradeEquip(sl.item.id)) this.toast(`${sl.item.label} 강화`); else this.toast('골드가 부족합니다'); }, c !== null && s.gold >= c ? 'primary' : '', c === null || s.gold < c); })(),
            sb('해제', () => { g.unequipItem(id, sl.slot); })) : null,
          sl.item ? `${sl.label} +${sl.item.pct}% · ${sl.item.grade}급 · Lv ${sl.item.lv}/${BALANCE.EQUIP.maxLevel}` : `${sl.label}을(를) 올려 줍니다 · 아래에서 착용`)),
        row('세트', stats.setName || '미완성', null, stats.setName ? `모든 능력치 +${stats.setPct}% (4부위 착용 +${BALANCE.EQUIP.setAny}% · 같은 등급 풀세트는 등급별 +${BALANCE.EQUIP.setSame.D}~${BALANCE.EQUIP.setSame.S}%)` : `4부위를 모두 채우면 +${BALANCE.EQUIP.setAny}%, 같은 등급으로 맞추면 최대 +${BALANCE.EQUIP.setSame.S}%`),
        row('합계', `ATK +${stats.atk}% · HP +${stats.hp}%`, null, `스킬 위력 +${stats.skill}% · 공격 속도 +${stats.speed}%`));
      equipPane.append(slotRows);
      equipPane.append(el('div', { class: 'dt-sec equip-auto' }, el('b', {}, '자동'),
        sb('이 사원 자동 장착', () => { const n = g.autoEquip(id); this.toast(n ? n + '부위를 최적 비품으로 교체했습니다' : '이미 최적입니다'); }, 'primary'),
        sb('파티 전체 자동 장착', () => { const r = g.autoEquipParty(); this.toast(r.changed ? r.heroes + '명 · ' + r.changed + '부위 교체' : '파티 전원이 이미 최적입니다'); }),
        el('span', { class: 'ds small' }, '슬롯별 최고 성능과 같은 등급 풀세트 중 더 강한 쪽을 고릅니다. 다른 사원이 착용 중인 비품은 건드리지 않습니다.')));
      // bag: pick the slot to browse, newest first, worn items marked
      this.equipSlot ??= 'keyboard';
      const bag = g.equipItems();
      const tabs = el('div', { class: 'eq-slots' }, ...eq.map((sl) => el('button', { class: `eq-slot ${this.equipSlot === sl.slot ? 'active' : ''}`, onclick: () => { this.equipSlot = sl.slot; this.#renderDetail(); } }, `${sl.icon} ${sl.name}`, el('small', {}, ` ${bag.filter((it) => it.slot === sl.slot).length}`))));
      const list = bag.filter((it) => it.slot === this.equipSlot);
      const tbody = el('tbody');
      for (const it of list) {
        const worn = it.wornBy ? g.heroDef(it.wornBy).name : null;
        const here = it.wornBy === id;
        tbody.append(el('tr', { class: here ? 'done' : '' },
          el('td', { class: 'name', style: `color:${gradeColor(it.grade)}` }, it.label, el('div', { class: 'sub' }, `${it.grade}급 · Lv ${it.lv}${worn ? ` · ${worn} 착용 중` : ''}`)),
          el('td', { class: 'num' }, `+${it.pct}%`),
          el('td', { class: 'ctl' }, here ? sb('해제', () => g.unequipItem(id, it.slot)) : sb('착용', () => { g.equipItem(id, it.id); }, 'primary'),
            worn ? null : sb('분해', () => { const gold = g.dismantleEquip(it.id); if (gold) this.toast(`분해 +${fmt(gold)} 골드`); }, 'danger'))));
      }
      if (!list.length) tbody.append(el('tr', {}, el('td', { colspan: '3', class: 'muted small' }, '이 슬롯의 비품이 없습니다. 스테이지를 마감하면 나옵니다 (보스는 확정).')));
      equipPane.append(el('div', { class: 'dt-sec equip-bag' }, el('b', {}, '창고'),
        el('span', { class: 'ds small' }, `${bag.length} / ${BALANCE.EQUIP.inventoryMax}개 · 착용 중인 비품은 분해되지 않습니다`),
        sb('D·C급 일괄 분해', () => {
          const junk = bag.filter((it) => !it.wornBy && (it.grade === 'D' || it.grade === 'C')).map((it) => it.id);
          if (!junk.length) { this.toast('분해할 D·C급 비품이 없습니다'); return; }
          const gold = g.dismantleEquip(junk); this.toast(`${junk.length}개 분해 +${fmt(gold)} 골드`);
        }, 'danger')));
      equipPane.append(tabs, el('table', { class: 'xl-table compact eq-table' }, el('thead', {}, el('tr', {}, el('th', {}, '비품'), el('th', { class: 'num' }, '효과'), el('th', {}, ''))), tbody));
    }

    // tabs: 정보 · 스킬 · 비품 · 스킨 · 프로필 · 호감도 — remembered across refreshes (old 'growth' key → 스킬)
    this.detailTab ??= 'info'; if (this.detailTab === 'growth') this.detailTab = 'skill';
    const panes = { info: table, skill: skillPane, equip: equipPane, skin: skinPane, profile: profilePane, affection: affPane };
    if (!panes[this.detailTab]) this.detailTab = 'info';
    const tabDefs = [['info', '정보', ''], ['skill', '스킬', e.owned && v.skillUnlocked ? `Lv ${sl.level}` : ''], ['equip', '비품', e.owned ? `${g.equipOf(id).filter((x) => x.item).length}/${SLOT_ORDER.length}` : ''], ['skin', '스킨', activeSkin ? activeSkin.name : ''], ['profile', '프로필', ''], ['affection', '호감도', e.owned ? `♥${v.affection.level}` : '']];
    const tabs = el('div', { class: 'dt-tabs' }, ...tabDefs.map(([k, label, badge]) =>
      el('button', { class: `dt-tab ${this.detailTab === k ? 'active' : ''}`, onclick: () => { this.detailTab = k; this.#renderDetail(); } }, label, badge ? el('small', {}, badge) : null)));
    for (const [k, pane] of Object.entries(panes)) pane.hidden = k !== this.detailTab;
    body.append(el('div', { class: 'dt' }, portrait, el('div', { class: 'dt-info' }, head, tabs, table, skillPane, equipPane, skinPane, profilePane, affPane)));
    // --- action bar
    if (e.owned) {
      body.append(el('div', { class: 'dt-actions' },
        btn(v.inParty ? '파티 해제' : '파티 배치', () => g.toggleParty(id), v.inParty ? '' : 'primary', v.isMain && v.inParty && s.party.length === 1),
        el('span', { class: 'spacer' }),
        v.isMain ? null : (() => { const b = btn(`카드 방출 (+${v.dismissCards}장)`, () => { this.#askConfirm('카드 방출', `${v.def.name} 카드를 방출하고 강화 카드 ${v.dismissCards}장을 받습니다.

되돌릴 수 없습니다.`, { ok: '방출', danger: true }).then((yes) => { if (yes) g.dismiss(id); }); }, 'danger', !v.canDismiss); if (!v.canDismiss && v.dismissBlockedReason) b.title = v.dismissBlockedReason; return b; })(),
        v.canDismiss || v.isMain ? null : el('span', { class: 'muted small' }, v.dismissBlockedReason)));
    }
    if (v.isMain) body.append(this.#mainPromoPanel(v.mainPromo));
    $('#modal-actions').innerHTML = ''; $('#modal-actions').append(el('span', { class: 'muted small', style: 'margin-right:auto' }, `골드 ${fmt(s.gold)} · 강화 카드 ${fmt(s.cards)}장`), btn('닫기', () => this.closeModal(), 'primary'));
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
    this.openModal('★ 한계 돌파 완료', body);
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
      el('span', { class: info.hasStage ? 'ok' : 'bad' }, `${stageLabel(info.stage)} 클리어`), ' · ',
      el('span', { class: info.hasLevel ? 'ok' : 'bad' }, `Lv ${info.levelNow} / ${info.level}`), ' · ',
      el('span', { class: info.hasEnhance ? 'ok' : 'bad' }, `강화 +${info.enhanceNow} / +${info.enhance}`)));
    if (!info.hasEnhance || !info.hasLevel) box.append(el('p', { class: 'muted small' }, '승진은 구매가 아니라 졸업입니다 — 현재 직급의 레벨과 강화를 모두 채워야 다음 직급으로 갑니다.'));
    if (info.options.length > 1) box.append(el('p', { class: 'small muted' }, '트랙을 고르면 이후 승진은 그 트랙 안에서만 진행됩니다 (변경 불가).'));
    const opts = el('div', { class: 'promo-options' });
    for (const job of info.options) {
      const tr = job.track ? MAIN_TRACKS[job.track] : null;
      opts.append(el('div', { class: 'promo-opt', style: tr ? `--tc:${tr.color}` : '' }, tr ? el('div', { class: 'promo-track', title: tr.desc }, tr.name) : null, cardCanvas(job, { title: `${job.title} · ${job.grade}급` }),
        el('div', { class: 'small muted' }, job.desc ?? `${ROLES[job.role].name} · ${job.grade}급`),
        el('div', { class: 'small', style: 'color:#1f5fa8' }, `특성: ${TRAITS[job.trait].name}`),
        btn(`${job.title}으로 승진`, () => { if (!this.game.promoteMain(job.id)) this.toast('승진 조건이 충족되지 않았습니다'); }, 'primary', !info.ok)));
    }
    box.append(opts);
    return box;
  }

  // ------------------------------------------------------------- gacha --
  /**
   * 코드 등록. 입구는 삽입 탭의 대화상자 하나뿐이다.
   * @param {HTMLInputElement} input 코드 입력란
   * @param {HTMLElement} msg 결과를 쓸 자리
   * @param {HTMLButtonElement|null} go 누른 버튼 (있으면 처리 중 비활성화)
   */
  async #redeemCode(input, msg, go = null) {
    if (go) go.disabled = true;
    const r = await this.game.redeemCodeAsync(input.value);
    if (go) go.disabled = false;
    if (!r.ok) { msg.textContent = r.reason; msg.className = 'code-msg bad'; input.select?.(); return false; }
    const parts = [r.gems && `보석 +${r.gems}`, r.cards && `강화 카드 +${r.cards}`, r.gold && `골드 +${fmt(r.gold)}`].filter(Boolean).join(' · ');
    msg.textContent = `${r.label}: ${parts}`; msg.className = 'code-msg ok';
    input.value = ''; this.toast(`코드 사용 — ${parts}`);
    return true;
  }

  /**
   * 삽입 › 보석 코드 등록… — 시트를 찾아 들어가지 않고 등록한다.
   * 코드 입력란이 가져오기 시트 한가운데 끼여 있어 "어디서 하는지 모르겠다"는 말이 나왔던 자리다.
   */
  #openCodeDialog() {
    const input = el('input', { type: 'text', maxlength: '32', placeholder: '예: helloheros', autocomplete: 'off', spellcheck: 'false', class: 'code-dlg-input' });
    const msg = el('div', { class: 'code-msg' }, '코드 하나당 계정에 한 번만 사용할 수 있습니다.');
    const go = btn('등록', () => this.#redeemCode(input, msg, go), 'primary');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.#redeemCode(input, msg, go); });
    const body = el('div', { class: 'code-dlg' },
      el('label', { for: '' }, '코드'),
      el('div', { class: 'code-dlg-row' }, input, go),
      msg,
      el('span', { class: 'muted small' }, '보석 · 강화 카드 · 골드가 코드에 따라 지급됩니다. 로그인하면 계정 기준으로, 아니면 이 브라우저 기준으로 한 번만 쓸 수 있습니다.'),
    );
    this.openModal('보석 코드 등록', body);
    setTimeout(() => input.focus(), 0);
  }

  /**
   * 삽입 › 외부 데이터 가져오기… — **자리를 옮기지 않는** 영입 대화상자.
   * 시트를 바꾸지 않으므로 전투를 보던 중에도 쓸 수 있다. 결과는 기존 공개 연출 모달로 넘어간다.
   */
  #openImportDialog() {
    const g = this.game, s = g.state;
    const ids = g.pickup();
    const body = el('div', { class: 'import-dlg' });
    body.append(el('table', { class: 'xl-table compact', html: `<tbody>
      <tr><th>보유 보석</th><td class="num">${fmt(s.gems)}</td></tr>
      <tr><th>A 이상 확정까지</th><td class="num">${BALANCE.PITY_A - s.pity.sinceA}회</td></tr>
      <tr><th>S 확정까지</th><td class="num">${BALANCE.PITY_S - s.pity.sinceS}회</td></tr>
      <tr><th>모집 포인트</th><td class="num">${fmt(g.recruitPoints())}</td></tr>
      <tr><th>선택한 창구</th><td>${(s.settings.banner ?? 'pickup') === 'standard' ? '일반 모집 — 등급 안에서 완전 균등' : '픽업 모집 — 그 등급의 절반은 픽업 카드'}</td></tr>
      <tr><th>오늘의 픽업</th><td>${Object.entries(ids).map(([gr, id]) => `${gr}급 ${g.heroView(id).def.name}`).join(' · ')}</td></tr>
      <tr><th>픽업 기간</th><td>${g.pickupDaysLeft()}일 남음 · 3일마다 교체</td></tr>
    </tbody>` }));
    // 창구를 여기서도 고를 수 있어야 한다 — 시트에만 두면 대화상자로 뽑는 사람은 못 고른다
    const bannerRow = el('div', { class: 'detail-actions' });
    const mk = (v, label, tip) => {
      const b2 = btn(label, () => { g.state.settings.banner = v; g.persist(); this.closeModal(); this.#openImportDialog(); }, (s.settings.banner ?? 'pickup') === v ? 'primary' : '');
      b2.title = tip; return b2;
    };
    bannerRow.append(
      el('span', { class: 'muted small' }, '창구 '),
      mk('pickup', '픽업 모집', '그 등급이 나오면 절반은 오늘의 픽업 카드'),
      mk('standard', '일반 모집', '픽업 가중 없음 — 등급 안에서 완전 균등'),
    );
    body.append(bannerRow);
    const row = el('div', { class: 'detail-actions' });
    const one = g.pullCost(1), ten = g.pullCost(10);
    row.append(
      btn(`1행 가져오기 (보석 ${fmt(one)})`, () => this.#pull(1), '', s.gems < one),
      btn(`10행 가져오기 (보석 ${fmt(ten)})`, () => this.#pull(10), 'primary', s.gems < ten),
      btn('가져오기 시트 열기', () => { this.closeModal(); this.switchSheet('gacha'); }),
    );
    body.append(row);
    body.append(el('span', { class: 'muted small' }, '10행은 첫 회차에 S가 확정입니다. 모집 포인트 교환은 가져오기 시트에서 합니다.'));
    this.openModal('외부 데이터 가져오기', body);
  }
  #pull(n) {
    const res = this.game.pull(n);
    if (!res) return;
    for (const r of res) this.gachaLog.unshift(r);
    this.gachaLog.length = Math.min(this.gachaLog.length, 30);
    this.#refreshGacha();
  }
  /** 창구 선택 상태와 그 창구의 실제 확률 한 줄. 숫자는 카드 수에서 계산한다 — 손으로 적으면 어긋난다. */
  #refreshBanner() {
    const s = this.game.state; const b = s.settings.banner ?? 'pickup';
    for (const [id, v] of [['#banner-pickup', 'pickup'], ['#banner-standard', 'standard']]) {
      const el2 = $(id); if (!el2) continue;
      el2.classList.toggle('active', b === v); el2.setAttribute('aria-checked', String(b === v));
    }
    // 확률 표의 등급 줄도 창구에 맞춘다 — "(픽업 2.5%)" 는 일반 창구에서 거짓이다.
    for (const gr of ['S', 'A']) {
      const rate = $(`#rate-${gr}`), sub = $(`#rate-${gr}-note`); if (!rate) continue;
      const n = heroesOfGrade(gr).length;
      rate.textContent = `${(GRADES[gr].rate * 100).toFixed(GRADES[gr].rate < 0.01 ? 1 : 0)}%`;
      if (sub) sub.textContent = b === 'standard' ? `(${n}종 균등 · 한 장당 ${(GRADES[gr].rate / n * 100).toFixed(2)}%)` : `(픽업 ${(GRADES[gr].rate * PICKUP_RATE * 100).toFixed(2)}%)`;
    }
    const note = $('#banner-note'); if (!note) return;
    const nS = heroesOfGrade('S').length, nA = heroesOfGrade('A').length;
    const pct = (x) => `${(x * 100).toFixed(2)}%`;
    if (b === 'pickup') {
      note.textContent = `픽업 범위: S 픽업 ${pct(GRADES.S.rate * PICKUP_RATE)} · 그 외 S 한 장당 ${pct(GRADES.S.rate * (1 - PICKUP_RATE) / nS)} (S ${nS}종) · A 픽업 ${pct(GRADES.A.rate * PICKUP_RATE)}`;
    } else {
      note.textContent = `전체 범위: 픽업 가중 없음 — S 한 장당 ${pct(GRADES.S.rate / nS)} (S ${nS}종) · A 한 장당 ${pct(GRADES.A.rate / nA)} (A ${nA}종). 픽업이 아닌 카드를 노리면 이쪽이 두 배 유리합니다.`;
    }
  }
  #refreshGacha() {
    const s = this.game.state;
    this.#refreshBanner();
    $('#gems-cell').textContent = fmt(s.gems); $('#gems-top').textContent = fmt(s.gems);
    $('#pull1').disabled = s.gems < this.game.pullCost(1); $('#pull10').disabled = s.gems < this.game.pullCost(10);
    $('#pity-a').textContent = BALANCE.PITY_A - s.pity.sinceA;
    $('#pity-s').textContent = BALANCE.PITY_S - s.pity.sinceS;
    $('#total-pulls').textContent = s.stats.totalPulls;
    const pg = s.stats.pullGrades ?? {}; $('#pull-grades').textContent = s.stats.totalPulls ? `· S ${pg.S ?? 0} · A ${pg.A ?? 0} · B ${pg.B ?? 0} · C ${pg.C ?? 0} · D ${pg.D ?? 0}` : '';
    $('#pull10').innerHTML = s.stats.totalPulls === 0 ? '10행 가져오기<small>보석 900 · 첫 10행 S 확정</small>' : '10행 가져오기<small>보석 900</small>';
    this.#refreshPickup();
    $('#qa-pull1').disabled = s.gems < this.game.pullCost(1); $('#qa-pull10').disabled = s.gems < this.game.pullCost(10);
    $('#qa-pity-a').textContent = BALANCE.PITY_A - s.pity.sinceA; $('#qa-pity-s').textContent = BALANCE.PITY_S - s.pity.sinceS;
    const tbody = $('#gacha-log tbody'); tbody.innerHTML = '';
    this.gachaLog.forEach((r, i) => tbody.append(el('tr', { class: `g-${r.grade}` },
      el('td', {}, String(this.gachaLog.length - i)), el('td', { style: `color:${GRADES[r.grade].color}` }, r.grade), el('td', {}, r.def.name), el('td', { class: r.pickup ? 'pickup' : '' }, `${r.isNew ? '신규 입사' : `조각 +${r.shards}`}${r.exchange ? ' · 모집 포인트 교환' : r.pickup ? ' · 픽업' : ''}`))));
  }
  /** 오늘의 픽업 cards on the gacha sheet (rebuilt when the date changes). */
  #refreshPickup() {
    const box = $('#pickup-cards'); if (!box) return; const s = this.game.state; const ids = this.game.pickup(); const pts = this.game.recruitPoints();
    $('#pickup-period').textContent = `${this.game.pickupDaysLeft()}일 남음 · 3일마다 교체`; $('#recruit-points').innerHTML = `모집 포인트 <b>${pts}</b>`;
    const key = `${s.daily.date}|${pts}|${Object.values(ids).map((id) => `${id}:${s.heroes[id]?.owned ? 1 : 0}:${s.heroes[id]?.star ?? 0}`).join(',')}`;
    if (box.dataset.key === key) return; box.dataset.key = key; box.innerHTML = '';
    for (const [grade, id] of Object.entries(ids)) {
      const v = this.game.heroView(id); const e = v.entry;
      const wrap = el('div', { class: `card ${e.owned ? '' : 'locked'} holo`, title: `${v.def.name} · ${v.traitName}: ${v.traitDesc}`, onclick: () => this.openDetail(id) },
        cardCanvas(v.def, { star: v.star, owned: e.owned, title: e.owned ? `${stars(e.star)} · Lv ${e.level}` : '미보유', awakened: !!e.awakened }),
        el('span', { class: 'holo-sheen' }), el('span', { class: 'pickup-tag' }, `${grade} 픽업`), e.owned ? el('span', { class: 'pickup-owned' }, `조각 ${e.shards}`) : null);
      const cost = SPARK_COST[grade], can = this.game.canExchangePickup(grade);
      const col = el('div', { class: 'card-col' }, wrap,
        el('div', { class: 'spark-bar' }, el('i', { style: `width:${Math.min(100, Math.round(pts / cost * 100))}%` })),
        el('div', { class: 'spark-txt' }, `${Math.min(pts, cost)} / ${cost}`),
        btn(e.owned ? `교환 (조각 +${BALANCE.DUPLICATE_SHARDS_MAX})` : '모집 포인트로 영입', () => { const r = this.game.exchangePickup(grade); if (r) { this.gachaLog.unshift(r); this.gachaLog.length = Math.min(this.gachaLog.length, 30); this.#refreshGacha(); } }, `spark ${can ? 'primary' : ''}`, !can));
      box.append(col);
    }
  }
  #showGachaResults(results) {
    const hasS = results.some((r) => r.grade === 'S'), hasA = results.some((r) => r.grade === 'A');
    const body = el('div', { class: 'reveal-body' }, el('p', { class: 'muted small reveal-hint' }, `CSV 원본에서 ${results.length}행을 가져오는 중… (클릭하면 모두 공개)`));
    const grid = el('div', { class: 'card-grid result reveal' });
    const flips = [];
    for (const r of results) {
      const front = el('div', { class: 'flip-face front' },
        cardCanvas(r.def, { star: this.game.state.heroes[r.heroId].star, title: r.isNew ? '신규 입사!' : `조각 +${r.shards}`, sub: r.guaranteed ? '보장' : '', awakened: !!this.game.state.heroes[r.heroId].awakened }),
        r.isNew ? el('span', { class: 'card-badge new' }, 'NEW') : null, r.pickup ? el('span', { class: 'pickup-tag' }, '픽업') : null);
      const back = el('div', { class: `flip-face back g-${r.grade}` }, el('span', { class: 'back-x' }, 'X'), el('span', { class: 'back-row' }, `ROW ${String(results.indexOf(r) + 1).padStart(2, '0')}`));
      const flip = el('div', { class: `flip grade-${r.grade}` }, el('div', { class: 'flip-inner' }, back, front));
      const wrap = el('div', { class: `card ${r.isNew ? 'new' : ''} ${r.grade === 'S' || r.grade === 'A' ? 'holo' : ''}`, onclick: () => { if (flip.classList.contains('revealed')) this.openDetail(r.heroId); } }, flip,
        r.isNew && profileOf(r.heroId) ? el('div', { class: 'card-quote hidden-until' }, `"${profileOf(r.heroId).line}"`) : null);
      grid.append(wrap); flips.push({ flip, r, wrap });
    }
    body.append(grid);
    this.openModal('데이터 가져오기', body);
    // 연속 뽑기: keep pulling without leaving the dialog, while the gems last
    {
      const acts = $('#modal-actions'); acts.innerHTML = '';
      const again = (n, cost, cls) => {
        const b = btn(`${n}행 더 (보석 ${fmt(cost)})`, () => { if (this.game.state.gems < cost) { this.toast('보석이 부족합니다'); return; } this.#pull(n); }, cls, this.game.state.gems < cost);
        b.id = `again-${n}`; return b;
      };
      acts.append(again(1, this.game.pullCost(1), 'small'), again(10, this.game.pullCost(10), 'primary small'),
        el('span', { class: 'muted small', style: 'margin:0 auto 0 8px' }, `보유 보석 ${fmt(this.game.state.gems)}`),
        btn('닫기', () => this.closeModal(), 'primary'));
    }
    const modal = $('#modal .dialog');
    let i = 0; const timers = [];
    // rarity "tell": high-grade cards glow on their back before they turn, so the player sees it coming
    for (const f of flips) if (f.r.grade === 'S' || f.r.grade === 'A') f.flip.querySelector('.back').classList.add(`pre-${f.r.grade}`);
    /** Full-dialog burst for A / S: rotating light rays, flying sparks, a grade stamp, then it fades. */
    const burst = (f) => {
      const g = f.r.grade; const fx = el('div', { class: `reveal-fx ${g}` },
        el('div', { class: 'rays' }),
        el('div', { class: 'sparks' }, ...Array.from({ length: g === 'S' ? 18 : 10 }, (_, k) => el('span', { style: `--a:${(k / (g === 'S' ? 18 : 10)) * 360}deg; --d:${0.35 + (k % 3) * 0.12}s` }))),
        el('div', { class: 'stamp' }, el('b', {}, g), el('span', {}, g === 'S' ? '전설 · LEGENDARY' : '영웅 · EPIC')));
      modal.append(fx);
      const r = f.flip.getBoundingClientRect(), m = modal.getBoundingClientRect();
      fx.style.setProperty('--cx', `${r.left + r.width / 2 - m.left}px`); fx.style.setProperty('--cy', `${r.top + r.height / 2 - m.top}px`);
      setTimeout(() => fx.remove(), g === 'S' ? 1700 : 1000);
    };
    const revealOne = (f) => {
      if (f.flip.classList.contains('revealed')) return;
      f.flip.classList.add('revealed'); f.wrap.querySelector('.hidden-until')?.classList.remove('hidden-until');
      if (f.r.grade === 'S') { modal.classList.add('jackpot'); setTimeout(() => modal.classList.remove('jackpot'), 900); this.game.emit('sfx', 'jackpot'); burst(f); setTimeout(() => this.#showSplash(f.r), 700); }
      else if (f.r.grade === 'A') { modal.classList.add('epic'); setTimeout(() => modal.classList.remove('epic'), 700); this.game.emit('sfx', 'levelup'); burst(f); this.#showHeroBanner(f.r); }
      else this.game.emit('sfx', 'coin');
    };
    const finish = () => { $('.reveal-hint', body).textContent = `${results.length}행 가져오기 완료${hasS ? ' — 전설 등급 등장!' : hasA ? ' — 영웅 등급 등장' : ''}. 카드를 누르면 상세.`; if (hasS) modal.classList.add('has-s'); };
    // pacing: a beat of suspense before a high-grade card turns, and a longer pause after it so the burst can land
    const step = () => {
      if (i >= flips.length) { finish(); return; }
      const f = flips[i++]; const g = f.r.grade;
      const before = g === 'S' ? 650 : g === 'A' ? 350 : 0, after = g === 'S' ? 1300 : g === 'A' ? 750 : (flips.length > 1 ? 170 : 120);
      if (before) f.flip.querySelector('.back').classList.add('charging');
      timers.push(setTimeout(() => { revealOne(f); timers.push(setTimeout(step, after)); }, before));
    };
    timers.push(setTimeout(step, 250));
    grid.addEventListener('click', () => { if (i < flips.length) { timers.forEach(clearTimeout); while (i < flips.length) revealOne(flips[i++]); finish(); } }, { once: true });
  }

  // ------------------------------------------------------------- quests --
  #refreshQuests() {
    const s = this.game.state; const g = this.game;
    $('#daily-date').textContent = s.daily.date;
    const login = $('#btn-login'); login.disabled = s.daily.loginClaimed; login.textContent = s.daily.loginClaimed ? '출근 완료 ✓' : '출근 도장 찍기';
    const streak = Quests.nextStreak(s), bonus = Quests.streakGems(streak);
    $('#streak-text').textContent = s.daily.loginClaimed ? `연속 출근 ${s.login.streak}일째${bonus ? ` · 오늘 보너스 보석 +${bonus}` : ''}` : (streak > 1 ? `연속 출근 ${streak}일째 도장 → 보석 +${bonus} 추가` : `연속 출근 시작 (내일부터 하루당 보석 +${STREAK.gemsPerDay}, 최대 ${STREAK.maxDays}일치)`);
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
    this.#refreshDispatch();
    { const c = g.claimableSummary(); const b = $('#btn-claim-all'); if (b) { b.disabled = c.total === 0; $('#claim-all-count').textContent = c.total; b.title = c.total ? `업무 ${c.quests} · 전체 완료 ${c.allClear} · 업적 ${c.ach} · 마일스톤 ${c.ms} · 출장 ${c.dispatch}` : '수령할 보상이 없습니다'; } }
    const ob = $('#btn-overtime'); if (ob) { ob.disabled = !this.game.canOvertime(); ob.textContent = this.game.overtime ? '야근 중…' : s.daily.overtimeDone ? '오늘 야근 완료 ✓' : '야근 시작'; const ot = $('#overtime-text'); if (s.daily.overtimeDone) ot.textContent = `오늘의 야근을 마쳤습니다 · 개인 최고 ${s.stats.overtimeBest ?? 0} 처치 · 누적 ${s.stats.overtimes ?? 0}회`; }
    const all = Quests.allQuestsClaimed(s);
    $('#btn-allclear').disabled = !all || s.daily.allClearClaimed;
    $('#allclear-text').textContent = s.daily.allClearClaimed ? '오늘의 전체 완료 보너스를 받았습니다.' : `모든 업무 완료 시 보석 ${ALL_CLEAR_BONUS.gems} + 강화 카드 ${ALL_CLEAR_BONUS.cards}`;
    this.#refreshAchievements(); this.#refreshMilestones();
    const left = g.adsLeft();
    $('#ad-left').textContent = `오늘 남은 광고 ${left} / ${BALANCE.AD.perDay}회`;
    { const box = $('#ad-offers'); if (box) { box.innerHTML = ''; box.append(this.#adTable()); } }
  }

  /** 출장 box: bench pick list (checkbox chips) + status/timer + start/claim buttons. */
  #refreshDispatch(light = false) {
    const box = $('#dispatch-pick'); if (!box) return; const g = this.game; const info = g.dispatchInfo(); const D = BALANCE.DISPATCH;
    const fmtT = (sec) => `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
    const txt = $('#dispatch-text');
    if (info.active) txt.textContent = info.done ? `복귀 완료: ${info.heroIds.map((id) => g.heroDef(id).name).join(', ')} → 보석 +${info.reward.gems} · 카드 +${info.reward.cards}` : `출장 중: ${info.heroIds.map((id) => g.heroDef(id).name).join(', ')} · 남은 시간 ${fmtT(info.remaining)} · 예정 보상 보석 +${info.reward.gems}, 카드 +${info.reward.cards}`;
    else txt.textContent = info.bench.length ? `오늘 남은 출장 ${info.left} / ${D.maxPerDay} · 대기 사원 ${info.bench.length}명 중 최대 ${D.slots}명 선택 (등급이 높을수록 보석 ↑)` : '파티 밖에 대기 중인 사원이 없습니다. 카드를 더 모으거나 파티에서 빼 두세요.';
    $('#btn-dispatch').hidden = info.active; $('#btn-dispatch').disabled = !info.canStart;
    $('#btn-dispatch-claim').hidden = !info.active; $('#btn-dispatch-claim').disabled = !info.done; $('#btn-dispatch-claim').textContent = info.done ? '복귀 · 보상 받기' : `복귀까지 ${fmtT(info.remaining)}`;
    if (light) return;
    box.innerHTML = '';
    // 높은 등급이 위로: 등급(S→D) → ★ → 레벨 순. 출장 보석은 등급이 높을수록 커서 고르기 쉬운 순서다.
    const rank = (id) => { const v = g.heroView(id); return GRADES[v.def.grade].base.atk * 10000 + v.star * 100 + v.entry.level; };
    const ids = [...(info.active ? info.heroIds : info.bench)].sort((a, b) => rank(b) - rank(a));
    for (const id of ids) {
      const v = g.heroView(id); const away = info.active;
      const cb = el('input', { type: 'checkbox', value: id }); cb.checked = away; cb.disabled = away;
      const lab = el('label', { class: away ? 'away' : '', style: `--gc:${v.grade.color}` }, cb, el('img', { src: heroIconDataURL(v.def), alt: '' }), el('span', {}, `${v.def.name} `, el('b', { style: `color:${v.grade.color}` }, v.def.grade)), away ? el('small', { class: 'muted' }, ' 출장 중') : null);
      cb.addEventListener('change', () => { const on = [...box.querySelectorAll('input:checked')]; if (on.length > D.slots) { cb.checked = false; this.toast(`최대 ${D.slots}명`); } lab.classList.toggle('on', cb.checked); const picked = [...box.querySelectorAll('input:checked')].map((i) => i.value); if (picked.length && !info.active) { const p = info.preview(picked); txt.textContent = `선택 ${picked.length}명 → 보석 +${p.gems} · 카드 +${p.cards} · 각 호감도 +${D.affectionXp} (${D.hours}시간)`; } });
      box.append(lab);
    }
  }

  /** 사원_앨범: illustration gallery (owned in colour, unowned greyed), equipped skin art when present. */
  #buildAlbum() {
    const grid = $('#album-grid'); if (!grid) return; grid.innerHTML = ''; const g = this.game; const ownedOnly = $('#album-owned').checked;
    const ids = [MAIN_ID, ...HEROES.map((h) => h.id)]; let owned = 0, shown = 0;
    for (const id of ids) {
      const v = g.heroView(id); const e = v.entry; if (e.owned) owned++;
      if (ownedOnly && !e.owned) continue;
      const url = cardArtUrlFor(v.def) ?? cardArtUrl(v.isMain ? v.def.id : id); if (!url) continue; shown++;
      const p = profileOf(v.isMain ? 'main' : id);
      grid.append(el('div', { class: `album-item ${e.owned ? '' : 'locked'}`, style: `--gc:${v.grade.color}`, title: p ? `${p.nick} · "${p.line}"` : v.def.name, onclick: () => { if (e.owned) this.openLightbox(url, `${v.def.name} · ${p?.nick ?? ''}${v.def.skin ? ` · ${v.def.skin.name}` : ''}`); else this.openDetail(id); } },
        el('img', { src: url, alt: v.def.name, loading: 'lazy' }), v.def.skin ? el('span', { class: 'skin-tag' }, v.def.skin.name) : null,
        el('div', { class: 'cap' }, el('span', {}, v.def.name), el('b', {}, v.def.grade))));
    }
    $('#album-count').textContent = `${owned} / ${ids.length}${ownedOnly ? ` · 표시 ${shown}` : ''}`;
  }

  /** Excel comment-style memo that follows the pointer over roster cards: art + nick + line. */
  #showCardMemo(id, ev) {
    const memo = $('#card-memo'); if (!memo) return; const v = this.game.heroView(id); const p = profileOf(v.isMain ? 'main' : id);
    const url = cardArtUrlFor(v.def) ?? cardArtUrl(v.isMain ? v.def.id : id); if (!url || !p) { memo.hidden = true; return; }
    $('img', memo).src = url; $('b', memo).textContent = `${v.def.name} · ${p.nick}`; $('.memo-dept', memo).textContent = `${p.dept} · ${v.grade.name}급 ${v.grade.label}`; $('em', memo).textContent = `"${p.line}"`;
    memo.hidden = false; this.#moveCardMemo(ev);
  }
  #moveCardMemo(ev) { const memo = $('#card-memo'); if (memo.hidden) return; const x = Math.min(window.innerWidth - 272, ev.clientX + 18), y = Math.min(window.innerHeight - 170, ev.clientY + 12); memo.style.left = `${x}px`; memo.style.top = `${y}px`; }
  #hideCardMemo() { const memo = $('#card-memo'); if (memo) memo.hidden = true; }

  #refreshMilestones() {
    const s = this.game.state; const tbody = $('#ms-table tbody'); if (!tbody) return; tbody.innerHTML = '';
    $('#ms-count').textContent = `${Milestones.claimedCount(s)} / ${MILESTONES.length}`;
    for (const m of Milestones.pending(s)) { // reached, waiting to be claimed
      tbody.append(el('tr', { class: 'done' }, el('td', { class: 'name' }, m.name, el('div', { class: 'sub' }, m.desc)),
        el('td', { class: 'num' }, '달성 ✓'), el('td', { class: 'small' }, `보석 ${m.reward.gems}${m.reward.cards ? ` · 카드 ${m.reward.cards}` : ''}`),
        el('td', { class: 'act' }, btn('수령', () => { const r = this.game.claimMilestone(m.id); if (r) this.toast(`마일스톤 수령: 보석 +${r.reward.gems}${r.reward.cards ? ` · 카드 +${r.reward.cards}` : ''}`); }, 'primary'))));
    }
    for (const m of Milestones.upcoming(s)) {
      const v = milestoneValue(s, m);
      tbody.append(el('tr', {}, el('td', { class: 'name' }, m.name, el('div', { class: 'sub' }, m.desc)),
        el('td', { class: 'num databar-td' }, el('div', { class: 'bar', style: `width:${Math.min(96, Math.round((v / m.target) * 96))}%` }), el('span', {}, `${fmt(v)} / ${fmt(m.target)}`)),
        el('td', { class: 'small' }, `보석 ${m.reward.gems}${m.reward.cards ? ` · 카드 ${m.reward.cards}` : ''}`),
        el('td', { class: 'small muted' }, '진행 중')));
    }
    const recent = MILESTONES.filter((m) => Milestones.isClaimed(s, m.id)).slice(-3).reverse();
    for (const m of recent) tbody.append(el('tr', { class: 'claimed' }, el('td', { class: 'name' }, m.name, el('div', { class: 'sub' }, m.desc)), el('td', { class: 'num' }, '완료'), el('td', { class: 'small' }, `보석 ${m.reward.gems}${m.reward.cards ? ` · 카드 ${m.reward.cards}` : ''}`), el('td', { class: 'small muted' }, '지급됨')));
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

  /** Rewarded-ad menu (일일 업무 block and the ribbon button share it): one row per offer with today's count and a button. */
  #adTable() {
    const g = this.game; const tb = el('tbody');
    for (const o of g.adOffers()) {
      tb.append(el('tr', { class: o.can ? '' : 'done' },
        el('td', { class: 'name' }, o.name, el('div', { class: 'sub' }, o.desc)),
        el('td', { class: 'small' }, o.value),
        el('td', { class: 'num' }, `${o.left} / ${o.perDay}`),
        el('td', { class: 'ctl' }, btn(o.can ? '광고 보기' : (o.reason || '불가'), () => this.watchAd(o.key), o.can ? 'primary small' : 'small', !o.can))));
    }
    return el('table', { class: 'xl-table compact ad-table' }, el('thead', {}, el('tr', {}, el('th', {}, '보상'), el('th', {}, '지급'), el('th', { class: 'num' }, '오늘'), el('th', {}, ''))), tb);
  }
  #adMenu() {
    return el('div', {}, el('p', { class: 'small muted' }, `광고 1편 = 보상 1개 · 하루 총 ${BALANCE.AD.perDay}회 · 모든 보상은 고정 지급 (방치 배율 없음)`), this.#adTable());
  }
  /** Watch an ad for one offer, then grant it. */
  watchAd(key) {
    const o = this.game.adOffers().find((x) => x.key === key); if (!o?.can) { this.toast(o?.reason || '지금은 받을 수 없습니다'); return; }
    this.playAd(() => {
      const r = this.game.adReward(key); if (!r) { this.toast('보상을 지급할 수 없습니다'); return; }
      this.toast(r.gold ? `광고 보상 +${fmt(r.gold)} 골드` : r.gems ? `광고 보상 +${r.gems} 보석` : r.cards ? `광고 보상 +${r.cards} 강화 카드` : r.dispatch ? '출장 복귀 완료 — 검토 시트에서 보상을 받으세요' : '야근 1회가 추가되었습니다');
      if (!$('#modal').hidden && $('#modal-title').textContent === '광고 보상') this.openModal('광고 보상', this.#adMenu());
      this.#refreshQuests(); this.#refreshDispatch?.();
    }, key);
  }
  /** Placeholder ad: full-screen countdown, then `onDone`. Replace with a rewarded-ad SDK later. */
  playAd(onDone, key = 'gold') {
    if (this.game.adsLeft(key) <= 0) { this.toast('오늘 볼 수 있는 광고를 모두 시청했습니다'); return; }
    if (Ads.available()) { // rewarded break through the configured provider; falls back to the placeholder when no ad is available
      Ads.showRewarded(key).then((r) => {
        if (r.viewed) { onDone(); this.game.cloud?.recordAd(key); this.#refreshQuests(); }
        else if (r.reason === 'dismissed') this.toast('광고를 끝까지 봐야 보상을 받을 수 있습니다');
        else this.#placeholderAd(onDone);
      });
      return;
    }
    this.#placeholderAd(onDone);
  }
  #placeholderAd(onDone) {
    const ov = $('#ad-overlay'); const cnt = $('#ad-count'); let left = BALANCE.AD.durationSec;
    ov.hidden = false; cnt.textContent = left;
    const iv = setInterval(() => { left -= 1; cnt.textContent = left; if (left <= 0) { clearInterval(iv); ov.hidden = true; onDone(); this.#refreshQuests(); } }, 1000);
  }

  // ---------------------------------------------------------- settings --
  #refreshSettings() {
    const st = this.game.state.settings;
    $('#qa-auto').checked = st.autoAdvance; $('#set-auto').checked = st.autoAdvance; $('#set-stealth').checked = st.excel;
    const tut = $('#qa-tutorial'); if (tut) tut.checked = !(this.game.state.tutorial?.hidden ?? false);
    $('#qa-gridlines').checked = st.gridlines !== false; $('#set-gridlines').checked = st.gridlines !== false; $('#qa-sound').checked = !!st.sound;
    $('#set-safe').checked = st.safeAdvance !== false;
    $('#cloud-url').value = st.cloud?.url ?? ''; $('#cloud-name').value = st.cloud?.name ?? ''; this.#refreshCloud();
    $('#qa-auto-up').checked = !!st.autoUpgrade; $('#set-auto-up').checked = !!st.autoUpgrade;
    $('#set-sound').checked = !!st.sound;
    this.#refreshPrestige();
  }

  #refreshCloud() {
    const c = this.game.cloud, a = c.auth, user = a.user; const box = $('#cloud-status'); if (!box) return;
    const sc = $('#status-cloud'); if (sc) { const busy = c.status === 'saving' || c.status === 'loading' || a.pending; sc.classList.toggle('busy', !!busy); sc.textContent = !c.configured() ? '' : a.pending ? '계정 확인 중…' : c.status === 'saving' ? '계정에 저장 중…' : c.status === 'loading' ? '계정 저장본 불러오는 중…' : user ? (c.lastPush ? `☁ ${new Date(c.lastPush).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 저장됨` : '☁ 로그인됨') : '☁ 로그인 필요'; }
    const gateNote = $('#lg-note'); if (gateNote && a.pending) gateNote.textContent = '계정 확인 중…';
    // title bar account
    $('#account-name').textContent = user ? user.name : '김인턴';
    const av = $('#account-avatar'); av.innerHTML = ''; if (user?.picture) av.append(el('img', { src: user.picture, alt: '', referrerpolicy: 'no-referrer' })); else av.textContent = (user?.name ?? '김').slice(0, 1);
    $('#account-btn').title = user ? `${user.name}${user.email ? ` · ${user.email}` : ''} (파일 › 옵션)` : '계정 (파일 › 옵션)';
    // options page
    const gsi = $('#gsi-button'), card = $('#account-card');
    card.hidden = !user; gsi.hidden = !!user;
    if (user) { $('#account-pic').src = user.picture ?? ''; $('#account-title').textContent = user.name; $('#account-sub').textContent = user.email ?? 'Google 계정'; }
    else if (!c.configured() || !a.base() || !globalThis.EXCEL_HEROES_CLOUD?.googleClientId) gsi.classList.add('unconfigured');
    else { gsi.classList.remove('unconfigured'); if (!gsi.dataset.rendered && !document.querySelector('#backstage')?.hidden) { gsi.dataset.rendered = '1'; a.renderButton(gsi); } }
    box.className = `small ${c.status === 'ok' ? 'ok' : c.status === 'error' || c.status === 'rejected' || a.error ? 'error' : 'muted'}`;
    if (!c.configured()) box.textContent = '서버가 설정되지 않아 이 브라우저에만 저장됩니다.';
    else if (!user) box.textContent = a.error ?? '로그인하면 진행 상황이 계정에 저장되어 어느 기기에서든 이어서 할 수 있습니다.';
    else if (c.status === 'ok') box.textContent = `계정에 저장됨 · 마지막 저장 ${c.lastPush ? new Date(c.lastPush).toLocaleTimeString() : '-'} · 2분마다 자동`;
    else if (c.lastError) box.textContent = c.lastError;
    else box.textContent = '로그인됨 · 2분마다 자동 저장';
  }
  /** After a login: compare the account's save with this browser's progress and let the player choose. */
  async #afterLogin(user) {
    const c = this.game.cloud; let me = null;
    try { me = await c.me(); } catch (e) { this.toast(`계정 정보를 불러올 수 없습니다: ${e.message}`); return; }
    if (!me?.save) { try { await c.push(); this.toast(`${user.name}님 환영합니다 · 현재 진행을 계정에 저장했습니다`); } catch { /* status line shows the reason */ } return; }
    const local = this.game.state;
    const same = Math.abs((me.save.playSeconds ?? 0) - Math.floor(local.stats.playSeconds)) < 5 && me.save.maxStage === local.maxStage;
    if (same) { this.toast(`${user.name}님 환영합니다`); return; }
    const r = await c.pull(); if (!r) return;
    this.#offerSaveChoice(r, true);
  }
  /** Modal: keep this browser's progress (and upload it) or load the account's save. */
  #offerSaveChoice(r, fromLogin) {
    const s = r.save, local = this.game.state; const when = new Date(r.updatedAt).toLocaleString();
    const body = el('div', {},
      el('p', { class: 'small' }, fromLogin ? '이 브라우저의 진행과 계정에 저장된 진행이 다릅니다. 어느 쪽을 이어서 할까요?' : '계정 저장본으로 현재 진행을 덮어쓸 수 있습니다.'),
      el('div', { class: 'save-choice' },
        el('div', { class: 'opt' }, el('b', {}, '계정 저장본'), el('div', { class: 'small' }, `최고 ${stageLabel(Math.max(1, s.maxStage | 0))} · 플레이 ${fmtTime(s.stats?.playSeconds ?? 0)} · 보석 ${fmt(s.gems | 0)}`), el('div', { class: 'small muted' }, `저장 ${when}`),
          btn('이 저장본 불러오기', () => { this.game.loadCloudSave(s); this.closeModal(); this.toast('계정 저장본을 불러왔습니다'); }, 'primary')),
        el('div', { class: 'opt' }, el('b', {}, '이 브라우저 진행'), el('div', { class: 'small' }, `최고 ${stageLabel(Math.max(1, local.maxStage | 0))} · 플레이 ${fmtTime(local.stats.playSeconds)} · 보석 ${fmt(local.gems | 0)}`), el('div', { class: 'small muted' }, '계정 저장본을 이 진행으로 덮어씁니다'),
          btn('이 진행 유지 · 계정에 저장', async () => { this.closeModal(); try { await this.game.cloud.push(true); this.toast('현재 진행을 계정에 저장했습니다'); } catch (e) { this.toast(`저장 실패: ${e.message}`); } }))));
    this.openModal('저장본 선택', body);
  }
  #refreshBoard(fetch = false) {
    const tbody = $('#rank-table tbody'); if (!tbody) return; const c = this.game.cloud;
    if (!c.configured()) { tbody.innerHTML = ''; tbody.append(el('tr', {}, el('td', { colspan: 7, class: 'muted small' }, '클라우드 서버가 설정되면 순위표가 표시됩니다. 로그인한 플레이어의 저장본이 순위에 오릅니다.'))); return; }
    if (fetch) { c.fetchBoard(50).catch((e) => { tbody.innerHTML = ''; tbody.append(el('tr', {}, el('td', { colspan: 7, class: 'muted small' }, `순위표를 불러올 수 없습니다: ${e.message}`))); }); if (!c.board) return; }
    const b = c.board; if (!b) return; tbody.innerHTML = '';
    const rows = [...b.rows, ...(b.mine ? [b.mine] : [])];
    if (!rows.length) tbody.append(el('tr', {}, el('td', { colspan: 7, class: 'muted small' }, '아직 등록된 사원이 없습니다. "지금 업로드"로 첫 줄을 채워 보세요.')));
    for (const r of rows) tbody.append(el('tr', { class: r.me ? 'me' : '' }, el('td', { class: 'num' }, r.rank), el('td', { class: 'name' }, r.picture ? el('img', { src: r.picture, class: 'icon round', alt: '', referrerpolicy: 'no-referrer' }) : null, `${r.name}${r.me ? ' (나)' : ''}`), el('td', { class: 'num' }, stageLabel(Math.max(1, r.maxCleared))), el('td', { class: 'num' }, r.shares), el('td', { class: 'num' }, fmt(r.dps)), el('td', { class: 'num' }, r.collection), el('td', { class: 'num' }, fmtTime(r.playSeconds))));
  }

  /** Show the 회사 이전 suggestion only while the player is actually walled, and never nag more than once per 15 min. */
  /** One plain sentence in the status bar: what the game is doing right now, and what it is waiting for. */
  /** What the game is doing right now, as data — the plain and disguised lines are two renderings of this. */
  #nowDoing() {
    const g = this.game, s = g.state;
    if (g.paused) return { kind: 'paused' };
    if (g.overtime) return { kind: 'overtime', seconds: Math.ceil(g.overtime.t) };
    if (g.entities.traveling) return { kind: 'travel' };
    if (g.isChallenging()) return isBossStage(s.stage) ? { kind: 'boss', seconds: BALANCE.BOSS_TIME_LIMIT } : { kind: 'challenge', done: s.kills, total: BALANCE.KILLS_PER_STAGE };
    if (g.waitingAdvance) return { kind: 'waiting' };
    return { kind: 'farm' };
  }
  #refreshNowDoing() {
    const box = $('#now-doing'); if (!box) return;
    const g = this.game, s = g.state;
    let txt;
    if (s.settings.excel) { box.textContent = stealthStatus(this.#nowDoing()); return; } // 위장 중에는 재계산 진행 상황으로 읽힌다
    if (g.paused) txt = '⏸ 로그인 대기';
    else if (g.overtime) txt = `🌙 야근 모드 — 남은 ${Math.ceil(g.overtime.t)}초, 처치할수록 보석`;
    else if (g.entities.traveling) txt = `🚶 ${stageLabel(g.combatStage())}(으)로 이동 중`;
    else if (g.isChallenging()) {
      const boss = isBossStage(s.stage);
      txt = boss ? `⚑ ${stageLabel(s.stage)} 보스전 — 제한 ${BALANCE.BOSS_TIME_LIMIT}초` : `⚑ ${stageLabel(s.stage)} 도전 중 — ${s.kills} / ${BALANCE.KILLS_PER_STAGE} 처치`;
    } else if (g.waitingAdvance) txt = `⏳ ${stageLabel(s.stage)}에서 사냥하며 대기 — 승산이 오르면 자동으로 다음 단계`;
    else txt = `🔁 ${stageLabel(s.stage)} 반복 사냥 중 — 골드·비품을 모으는 중`;
    box.textContent = txt;
  }
  /**
   * 신입 사원 교육 목록. 읽고 닫는 안내가 아니라 직접 해야 지워지는 체크리스트다.
   * 현재 항목은 노란 줄로 강조하고, 그 항목이 가리키는 버튼도 함께 깜빡여 어디를 눌러야 하는지 남기지 않는다.
   */
  #refreshTutorial() {
    const box = $('#tutorial'); if (!box) return;
    const t = this.game.tutorialState();
    // 보기 › 표시 체크박스를 여기서 맞춘다. ✕ 는 'tutorial' 만 emit 하므로 설정 갱신에만 두면 갈라진다.
    const cb = $('#qa-tutorial'); if (cb) cb.checked = !t.hidden;
    if (t.hidden || (t.allDone && t.bonusPaid)) { box.hidden = true; this.#tutorialTarget(null); return; }
    box.hidden = false;
    // 위장 모드에서는 **같은 자리에 문서 검사 결과**를 그린다. 창을 지우면 아래 「파티 관리」가
    // 322px 올라가 레이아웃이 뒤집힌다(6-101). 높이는 CSS 로 고정돼 있어 어느 쪽이든 같다.
    if (this.game.state.settings.excel) {
      $('#tut-head-title').textContent = STEALTH_TUTORIAL.title;
      $('#tut-count').textContent = `${STEALTH_TUTORIAL.steps.length} / ${STEALTH_TUTORIAL.steps.length}`;
      const sl = $('#tut-list'); sl.innerHTML = '';
      for (const [title, text] of STEALTH_TUTORIAL.steps) {
        sl.append(el('li', { class: 'done' }, el('span', { class: 'mark' }, '✔'), el('span', { class: 't' }, title), el('span', { class: 'd' }, text)));
      }
      this.#tutorialTarget(null);
      return;
    }
    $('#tut-head-title').textContent = '신입 사원 교육';
    $('#tut-count').textContent = `${t.steps.filter((x) => x.ok).length} / ${t.steps.length}`;
    const list = $('#tut-list'); list.innerHTML = '';
    for (const st of t.steps) {
      const now = st === t.current;
      list.append(el('li', { class: `${st.ok ? 'done' : ''} ${now ? 'now' : ''}` },
        el('span', { class: 'mark' }, st.ok ? '\u2714' : '\u25a1'),
        el('span', { class: 't' }, st.title),
        el('span', { class: 'd' }, st.text),
        el('span', { class: 'r' }, `보상 보석 ${st.gems}`)));
    }
    if (t.allDone && !t.bonusPaid) list.append(el('li', { class: 'now' }, el('span', { class: 'mark' }, '\u2605'), el('span', { class: 't' }, `수료 보상 보석 ${TUTORIAL_BONUS}`)));
    this.#tutorialTarget(t.current?.target ?? null);
  }
  /** Blink the element the current step points at, so "어디를 눌러야 하지"가 남지 않는다. */
  #tutorialTarget(sel) {
    if (this.tutTarget === sel) return;
    document.querySelector('.tut-point')?.classList.remove('tut-point');
    this.tutTarget = sel;
    if (sel) document.querySelector(sel)?.classList.add('tut-point');
  }
  /**
   * 대기 카드에 잠긴 골드. 낮은 등급을 골드로 키운 게 낭비처럼 느껴지는 건 그 돈이 어디 갔는지 안 보이기 때문이다.
   * 얼마가 어디 잠겨 있고 한 번에 꺼낼 수 있다는 걸 숫자와 버튼으로 같이 보여 준다.
   */
  #refreshBenchGold() {
    const box = $('#bench-gold'); if (!box) return;
    const { gold, heroes } = this.game.benchGold();
    if (!heroes || gold <= 0) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '';
    box.append(
      el('span', {}, this.game.state.settings.excel ? `${STEALTH_DYN.bench(heroes)} · ` : `대기 사원 ${heroes}명에 골드 `), el('b', {}, fmt(gold)), el('span', {}, this.game.state.settings.excel ? ' 셀' : ' 잠김'),
      btn('회수', () => { const r = this.game.reclaimBenchLevels(); this.toast(`골드 +${fmt(r.gold)} 회수`); }, 'small primary', false, '대기 중인 카드의 레벨을 되돌려 골드를 전액 돌려받습니다 (등급과 무관하게 레벨 값 그대로)'));
  }
  /**
   * 주인공 승진 안내. 상한에 걸린 순간은 계정 전체가 멈춘 순간이라, 이전(prestige) 안내보다 위에 둔다.
   */
  /**
   * 수식 대응 줄. 보스가 특수 공격을 예고하면 전투 화면 위에 `=SUM(a, b)` 가 뜨고, 제한 시간 안에 답을 치면
   * 그 한 방이 약해진다. 엑셀로 위장한 게임에서 위기를 넘기는 방법이 셀에 숫자를 넣는 것이라는 게 요점이다.
   */
  /**
   * 게임 설명. 시스템이 스무 개쯤 쌓이는 동안 설명은 툴팁에만 있었는데, 툴팁은 **이미 그 버튼을 찾은
   * 사람**에게만 보인다. 여기서 한 번에 읽을 수 있게 한다. 스킬 표는 SKILLS 에서 직접 읽어 오므로
   * 스킬을 고치면 설명도 같이 바뀐다.
   */
  showManual() {
    const wrap = el('div', { class: 'manual' });
    const table = (rows) => {
      const t = el('table', { class: 'xl-table compact manual-table' });
      for (const [k, v] of rows) t.append(el('tr', {}, el('td', { class: 'mk' }, k), rich('td', v)));
      return t;
    };
    /** `**굵게**` 만 해석한다 — 설명에 별표가 그대로 찍히지 않게. */
    const rich = (tag, text) => {
      const node = el(tag, {});
      for (const part of String(text).split(/(\*\*[^*]+\*\*)/g)) {
        if (!part) continue;
        node.append(part.startsWith('**') ? el('b', {}, part.slice(2, -2)) : document.createTextNode(part));
      }
      return node;
    };
    for (const ch of MANUAL) {
      wrap.append(el('h4', { class: 'manual-h' }, ch.title));
      for (const p of ch.body ?? []) { const n = rich('p', p); n.className = 'manual-p'; wrap.append(n); }
      if (ch.rows) wrap.append(table(ch.rows));
    }
    wrap.append(el('h4', { class: 'manual-h' }, '스킬'));
    wrap.append(el('p', { class: 'manual-p' }, '★2에서 해금됩니다. N은 스킬 레벨과 강화에 따라 오르는 수치입니다.'));
    wrap.append(table(skillRows(SKILLS).map(([n, d]) => [n, d])));
    this.openModal('게임 설명', wrap, { wide: true });
  }
  #refreshBrace() {
    const bar = $('#brace-bar'); if (!bar) return;
    const b = this.game.braceInfo();
    if (!b.open) { if (!bar.hidden) this.#closeBrace(); return; }
    if (bar.hidden) {
      bar.hidden = false;
      $('#brace-formula').textContent = `=SUM(${b.a}, ${b.b})`;
      const inp = $('#brace-input'); inp.value = ''; inp.disabled = false; inp.focus();
    }
    $('#brace-left').textContent = `${b.left.toFixed(1)}초`;
    $('#brace-timer').style.width = `${Math.max(0, (b.left / b.limit) * 100)}%`;
  }
  #closeBrace(ok = null) {
    const bar = $('#brace-bar'); if (!bar || bar.hidden) return;
    bar.classList.remove('ok', 'miss');
    if (ok !== null) bar.classList.add(ok ? 'ok' : 'miss');
    const inp = $('#brace-input'); if (inp) inp.disabled = true;
    setTimeout(() => { bar.hidden = true; bar.classList.remove('ok', 'miss'); }, ok === null ? 0 : 420);
  }
  #refreshPromoHint() {
    const box = $('#promo-hint'); if (!box) return;
    if (this.promoHintSnooze && Date.now() < this.promoHintSnooze) { box.hidden = true; return; }
    const a = this.game.mainPromoAdvice();
    if (!a) { box.hidden = true; return; }
    $('#promo-hint-title').textContent = a.kind === 'ready' ? '승진할 수 있습니다' : '주인공이 레벨 상한에 걸렸습니다';
    $('#promo-hint-text').textContent = a.text;
    box.classList.toggle('blocked', a.kind === 'capped');
    box.hidden = false;
  }
  #refreshPrestigeHint() {
    const box = $('#prestige-hint'); if (!box) return;
    if (this.prestigeHintSnooze && Date.now() < this.prestigeHintSnooze) { box.hidden = true; return; }
    const a = this.game.prestigeAdvice();
    if (!a) { box.hidden = true; return; }
    $('#prestige-hint-text').textContent = a.text;
    box.hidden = false;
  }
  #refreshPrestige() {
    const info = this.game.prestigeInfo(); const el$ = $('#prestige-info'); if (!el$) return;
    el$.innerHTML = `현재 지분 <b>${info.shares}</b> (파티 ATK·골드 +${Math.round(info.bonus * 100)}%) · 이전 ${info.count}회<br>` +
      (info.eligible ? `지금 이전하면 지분 <b>+${info.gain}</b> (+${Math.round(info.gain * info.perShare * 100)}%)` : `Phase ${info.minCleared / BALANCE.BOSS_EVERY}-10 클리어(스테이지 ${info.minCleared}) 후 이전 가능 · 현재 최고 클리어 ${this.game.state.maxCleared}`);
    $('#btn-prestige').disabled = !info.eligible;
    $('#shares-top').textContent = info.shares;
    this.#refreshPromoHint();
    this.#refreshPrestigeHint();
    this.#refreshTutorial();
    this.#refreshBenchGold();
  }
  #buildFormulaSheet() {
    // the 게임 공식 table was hidden from the backstage by request; keep the builder harmless if the element is absent
    if ($('#formula-list')) $('#formula-list').innerHTML = [
      ['업그레이드 비용', '=FLOOR(10 * 1.12 ^ (Level - 1))'],
      ['몬스터 HP', '=FLOOR(50 * 1.18 ^ (Stage - 1))'],
      ['몬스터 ATK', '=FLOOR(1 * 1.13 ^ (Stage - 1))'],
      ['엘리트', `HP ×${BALANCE.ELITE.hp} · ATK ×${BALANCE.ELITE.atk} · 골드 ×${BALANCE.ELITE.gold} (5스테이지부터 확률 증가, 최대 30%)`],
      ['처치 골드', '=FLOOR(5 * 1.15 ^ (Stage - 1)) * (1 + 영업 마인드 + 도감 + 지분 + 부문)'],
      ['보석 드롭', '=IF(RAND() < 0.5% + 성과급 Lv × 0.1%, 1, 0) · 엘리트 ×3'],
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
    this.#applyStealthLabels(on);
    if (on) this.game.markTutorial('stealth');
    $('#canvas-wrap').hidden = on; $('#stealth-view').hidden = !on;
    $('#status-ready').textContent = on ? '계산 중 (4개 프로세서): 37%' : '준비';
    $('#set-stealth').checked = on;
    $('#qa-stealth').classList.toggle('active', on); $('#qa-normal').classList.toggle('active', !on);
    if (on) this.closeBackstage();
    this.#refreshTutorial();  // 교육 창 ↔ 문서 검사 — 자리는 그대로, 말만 바뀐다
    this.#refreshStage();     // 모드·처리·힌트 세 줄도 어휘가 바뀐다
    this.#buildLog();         // 로그 본문도 (다음 이벤트까지 옛 문구가 남는다)
    this.#refreshBenchGold(); // 잠긴 골드 줄
    this.#refreshFormulaBar();
    if (on) { this.#refreshStealth(); this.closeModal(); }
    if (!silent) this.toast(on ? '페이지 레이아웃 보기 (Esc: 기본 보기)' : '기본 보기');
  }
  /**
   * Swap the UI's wording in and out of disguise. The play area was already text; what still gave the game away was
   * the vocabulary — a sheet tab called 메인_전투, a ribbon button called 파티 자동 편성, a status line saying 사냥 중.
   * Only the first text node of each element is touched, so icons and sub-labels keep their place, and the original
   * is parked in data-real so turning the disguise off restores it exactly.
   */
  #applyStealthLabels(on) {
    const firstText = (host) => [...host.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    for (const [sel, spec] of Object.entries(STEALTH_TEXT)) {
      const host = document.querySelector(sel); if (!host) continue;
      const node = firstText(host); if (!node) continue;
      const text = typeof spec === 'string' ? spec : spec.text;
      if (on) { if (host.dataset.real === undefined) host.dataset.real = node.textContent; node.textContent = text; }
      else if (host.dataset.real !== undefined) { node.textContent = host.dataset.real; delete host.dataset.real; }
      const small = host.querySelector('small');
      if (small && typeof spec === 'object' && spec.sub !== undefined) {
        if (on) { if (small.dataset.real === undefined) small.dataset.real = small.textContent; small.textContent = spec.sub; }
        else if (small.dataset.real !== undefined) { small.textContent = small.dataset.real; delete small.dataset.real; }
      }
    }
    for (const sel of STEALTH_HIDE) document.querySelector(sel)?.classList.toggle('stealth-hidden', on);
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
      // 위장 중에는 본문을 재계산 로그로 **대체**한다 — 접두사만 바꾸면 게임 문장이 통째로 남는다(6-101).
      const body = this.game.state.settings.excel ? stealthLogLine(row.row) : row.text;
      tbody.append(el('tr', { class: 'log' }, el('td', {}, `#${row.row}`), el('td', {}, `Processing Row #${row.row}... ${body}`), el('td', {}, '시스템'), el('td', {}, 'OK'), el('td', { class: 'num' }, '')));
    }
  }

  // --------------------------------------------------------------- log --
  /**
   * 로그는 '남는 높이만큼만' 쌓는다. 고정 14줄이면 짧은 화면에서 시트가 세로로 넘쳐 스크롤바가 생겼다.
   * 캔버스(8행)와 상태 행을 뺀 나머지를 22px로 나눈 값. 최소 3줄은 남겨 로그가 사라지지는 않게 한다.
   */
  #logCapacity() {
    const h = ($('.sheets')?.clientHeight ?? 640) - 28 - GRID.rows * GRID.cellH - 22; // 헤더 · 캔버스 · 상태 행
    return Math.max(0, Math.min(20, Math.floor(h / 22)));
  }
  #buildLog() { const tb = $('#log-table tbody'); tb.innerHTML = ''; for (const r of this.game.logs.slice(-this.#logCapacity())) this.#appendLog(r); }
  #appendLog(row) {
    const tb = $('#log-table tbody');
    // 위장 중에는 본문을 재계산 로그로 바꾼다. 로그 표는 **둘**이다 — 여기(홈 시트)와 위장 표.
    // 한쪽만 고치면 다른 쪽에서 "COO 호감도 Lv 1" 이 그대로 보인다(6-101).
    const text = this.game.state.settings.excel ? stealthLogLine(row.row) : row.text;
    tb.prepend(el('tr', { class: `k-${row.kind}`, title: new Date(row.t).toLocaleTimeString('ko-KR') }, el('td', {}, `#${row.row}`), el('td', {}, text)));
    while (tb.children.length > this.#logCapacity()) tb.lastChild.remove();
  }

  // ------------------------------------------------------------- dialogs --
  /**
   * Yes/no in the game's own modal instead of window.confirm — an OS dialog breaks the Excel disguise the moment it
   * appears. Resolves true only when the player takes the action.
   */
  #askConfirm(title, message, { ok = '확인', danger = false } = {}) {
    return new Promise((resolve) => {
      const lines = String(message).split('\n').map((t) => (t ? el('p', {}, t) : el('div', { style: 'height:6px' })));
      this.openModal(title, el('div', { class: 'ask' }, ...lines));
      const acts = $('#modal-actions'); acts.innerHTML = '';
      let done = false; const finish = (v) => { if (done) return; done = true; this.closeModal(); resolve(v); };
      acts.append(btn('취소', () => finish(false)), btn(ok, () => finish(true), danger ? 'danger' : 'primary'));
      const onEsc = (e) => { if (e.key === 'Escape') { document.removeEventListener('keydown', onEsc, true); finish(false); } };
      document.addEventListener('keydown', onEsc, true);
    });
  }

  openModal(title, content, { wide = false } = {}) {
    this.detailId = null;
    $('#modal-title').textContent = title;
    $('#modal .dialog')?.classList.toggle('wide', !!wide); // 설명처럼 긴 내용은 좁은 창에서 읽히지 않는다
    const body = $('#modal-body'); body.innerHTML = '';
    if (typeof content === 'string') body.innerHTML = content; else body.append(content);
    $('#modal-actions').innerHTML = ''; $('#modal-actions').append(btn('확인', () => this.closeModal(), 'primary'));
    $('#modal').hidden = false;
  }
  closeModal() { $('#modal').hidden = true; this.detailId = null; if (this.pendingCoach) { this.pendingCoach = false; setTimeout(() => this.showCoach(), 200); } }
  showOffline(rep) {
    const body = el('div', {}, el('table', { class: 'xl-table compact', html: `<tbody>
        <tr><td>자리 비운 시간</td><td class="num">${fmtTime(rep.elapsed)}${rep.capped ? ' (최대 10시간 적용)' : ''}</td></tr>
        <tr><td>방치 수익률</td><td class="num">${rep.goldPerSec.toFixed(2)} gold/s × 60%</td></tr>
        <tr><td><b>정산 골드</b></td><td class="num"><b>+${fmt(rep.gold)}</b></td></tr></tbody>` }));
    const goldOffer = this.game.adOffers().find((o) => o.key === 'gold');
    if (goldOffer?.can) body.append(el('div', { class: 'ad-box' }, btn(`광고 보고 유휴 골드 1시간분 받기 (${goldOffer.value})`, () => { this.closeModal(); this.watchAd('gold'); }, 'primary'), el('span', { class: 'muted small' }, ' 고정 지급 · 방치 배율 없음')));
    this.openModal('백그라운드 계산 완료', body);
  }
  /**
   * Prologue: one illustrated panel per scene, narration lines fading in. Resolves when it is finished or skipped,
   * and remembers that it was seen (settings.prologueSeen) so it only interrupts the first session.
   */
  showPrologue() {
    const box = $('#prologue'); if (!box) return Promise.resolve();
    return new Promise((resolve) => {
      const img = $('#pl-art'), dots = $('#pl-dots'); let i = 0, done = false;
      dots.innerHTML = ''; PROLOGUE.forEach(() => dots.append(el('i', {})));
      const v = artVersion() ? `?v=${artVersion()}` : ''; // same build stamp as the cards: regenerated panels are never stale
      for (const sc of PROLOGUE) { const pre = new Image(); pre.src = `assets/story/${sc.id}.webp${v}`; } // warm the cache
      const finish = () => {
        if (done) return; done = true;
        box.hidden = true; this.game.state.settings.prologueSeen = true; this.game.persist();
        document.removeEventListener('keydown', onKey); resolve();
      };
      const show = () => {
        const sc = PROLOGUE[i];
        img.classList.remove('on');
        const next = new Image();
        next.onload = () => { img.src = next.src; img.classList.add('on'); };
        next.onerror = () => { img.removeAttribute('src'); };
        next.src = `assets/story/${sc.id}.webp${v}`;
        $('#pl-title').textContent = `${i + 1}. ${sc.title}`;
        const t = $('#pl-text'); t.innerHTML = '';
        sc.lines.forEach((line, n) => t.append(el('p', { style: `animation-delay:${0.12 + n * 0.5}s` }, line)));
        [...dots.children].forEach((d, n) => d.classList.toggle('on', n <= i));
        $('#pl-prev').disabled = i === 0;
        $('#pl-next').textContent = i === PROLOGUE.length - 1 ? '시작하기' : '다음';
      };
      const step = (d) => { const n = i + d; if (n < 0) return; if (n >= PROLOGUE.length) return finish(); i = n; show(); };
      const onKey = (e) => { if (e.key === 'Escape') finish(); else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') step(-1); else if (e.key === 'ArrowRight') step(1); };
      $('#pl-next').onclick = () => step(1);
      $('#pl-prev').onclick = () => step(-1);
      $('#pl-skip').onclick = finish;
      document.addEventListener('keydown', onKey);
      box.hidden = false; show();
    });
  }
  /** First-run guide: 4 Excel-style help balloons that point at the things a new player needs (skippable, once). */
  showCoach() {
    const st = this.game.state.settings; if (st.coachDone) return;
    const steps = [
      { sel: '.ribbon-tab[data-ribbon="insert"]', title: '1. 직원 데이터 가져오기', text: '삽입 탭(또는 아래 데이터_가져오기 시트)에서 보석으로 카드를 뽑습니다. 시작 보석 1,000으로 10행 가져오기 한 번은 바로 됩니다. 첫 10행은 S 확정!' },
      { sel: '.task-pane', title: '2. 파티 관리', text: '오른쫀 작업 창에서 골드로 파티를 레벨업하고 회사 업그레이드를 삽니다. 카드를 눌러 상세 창에서 배치·승급·스킨을 다룹니다.' },
      { sel: '.ribbon-tab[data-ribbon="review"]', title: '3. 검토 = 일일 업무', text: '출근 도장, 일일 업무, 업적, 마일스톤, 출장, 야근 모드가 여기 모여 있습니다. 완료된 보상은 「한꺼번에 수령」 한 번으로.' },
      { sel: '#qa-challenge', title: '4. 다음 단계 도전', text: '파티가 충분히 강해지면 다음 스테이지에 도전합니다. 승산이 표시되고, 자동 진행을 켜면 알아서 올라갑니다. Esc는 전투 화면을 표로 바꾸는 보스 키입니다.' },
    ];
    const box = $('#coach'); if (!box) return; let i = 0; let hl = box.querySelector('.coach-hl'); if (!hl) { hl = el('div', { class: 'coach-hl' }); box.prepend(hl); }
    const finish = () => { box.hidden = true; st.coachDone = true; this.game.persist(); };
    const show = () => {
      const s = steps[i]; const t = document.querySelector(s.sel); if (!t) { i++; return i < steps.length ? show() : finish(); }
      const r = t.getBoundingClientRect(); hl.style.left = `${r.left - 4}px`; hl.style.top = `${r.top - 4}px`; hl.style.width = `${r.width + 8}px`; hl.style.height = `${r.height + 8}px`;
      const bx = box.querySelector('.coach-box'); const left = Math.min(window.innerWidth - 320, Math.max(8, r.left)); const top = r.bottom + 12 + 300 > window.innerHeight ? Math.max(8, r.top - 150) : r.bottom + 12;
      bx.style.left = `${left}px`; bx.style.top = `${top}px`;
      $('#coach-title').textContent = s.title; $('#coach-text').textContent = s.text; $('#coach-step').textContent = `${i + 1} / ${steps.length}`; $('#coach-next').textContent = i === steps.length - 1 ? '시작하기' : '다음';
      box.hidden = false;
    };
    $('#coach-next').onclick = () => { i++; if (i >= steps.length) finish(); else show(); };
    $('#coach-skip').onclick = finish;
    show();
  }
  showWelcome() {
    this.pendingCoach = true;
    this.openModal('새 통합 문서', `
      <p>어느 날 아침, 도시에 <b>스프레드시트 괴물</b>이 나타났습니다. 시트를 잘못 병합한 누군가의 실수였다는 소문도 있습니다. 회사 직원들은 사무용품을 들고 폐허가 된 거리로 나섰습니다. 본사까지 가는 길, 열 개의 지구를 되찾아야 합니다.</p>
      <p><b>엑셀 히어로즈</b>: 파티가 셀 A1:M8 안에서 자동으로 괴물을 처리합니다.</p>
      <ul>
        <li><b>홈</b> — 전투. 오른쪽 <b>파티 관리</b> 창에서 강화. <b>데이터</b> — 카드 명단·승급·직급 승진. <b>삽입</b> — 직원 데이터 가져오기(뽑기). <b>검토</b> — 일일 업무.</li>
        <li>시작 보석 <b>${BALANCE.STARTING_GEMS}</b>개: 바로 10행 가져오기를 해보세요.</li>
        <li><b>Esc</b> 또는 보기 › 페이지 레이아웃: 전투 화면만 텍스트 표로 바뀌고 나머지 레이아웃은 그대로입니다.</li>
      </ul>`);
  }
  toast(text) {
    const t = $('#toast'); t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.hidden = true; }, 1800);
  }
}
