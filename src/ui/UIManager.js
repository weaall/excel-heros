// DOM layer: ribbon, formula bar, sheets, task pane, card grid, quests, boss-key view, dialogs.
import { BALANCE, teamUpgradeCost, isBossStage, stageLabel } from '../config/balance.js';
import { HEROES, GRADES, GRADE_ORDER, ROLES, TRAITS, MAIN_ID, MAIN_TIER_TITLES } from '../data/heroes.js';
import { stagePool, eliteChance, BOSS } from '../data/monsters.js';
import { DAILY_QUESTS, ALL_CLEAR_BONUS } from '../data/quests.js';
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
  #buildGridHeaders() {
    const cols = $('#col-headers'), rows = $('#row-headers');
    for (let c = 0; c < GRID.cols; c++) cols.append(el('span', {}, String.fromCharCode(65 + c)));
    for (let r = 0; r < GRID.rows; r++) rows.append(el('span', {}, String(r + 1)));
  }

  #bind() {
    document.title = '통합 문서1 - Excel';
    document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => this.switchSheet(b.dataset.sheet)));
    $('#btn-stealth').addEventListener('click', () => this.game.toggleExcel());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!$('#modal').hidden) this.closeModal(); else this.game.toggleExcel();
    });

    $('#qa-upgrade-all').addEventListener('click', () => { const n = this.game.upgradeCheapestLoop(); this.toast(n ? `자동 합계: 업그레이드 ${n}회 적용` : '골드가 부족합니다'); });
    $('#qa-challenge').addEventListener('click', () => { if (this.game.isChallenging()) this.game.cancelChallenge(); else this.game.startChallenge(); });
    $('#qa-auto').addEventListener('change', (e) => this.game.setAutoAdvance(e.target.checked));
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
    g.on('stage', () => this.#refreshStage());
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
    }
  }

  switchSheet(name) {
    document.querySelectorAll('.sheet').forEach((s) => s.classList.toggle('active', s.id === `sheet-${name}`));
    document.querySelectorAll('.ribbon-tab, .sheet-tab').forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
    if (name === 'quests') this.#refreshQuests();
  }

  // ------------------------------------------------------------ status --
  #refreshStatus() {
    const s = this.game.state;
    $('#status-gold').textContent = `골드: ${fmt(s.gold)}`;
    $('#status-gems').textContent = `보석: ${fmt(s.gems)}`;
    $('#status-dps').textContent = `DPS: ${fmt(this.game.entities.dps())}`;
    $('#gold-cell').textContent = fmt(s.gold); $('#gems-top').textContent = fmt(s.gems);
    const claimable = DAILY_QUESTS.some((q) => Quests.questDone(s, q.id) && !Quests.questClaimed(s, q.id)) || !s.daily.loginClaimed;
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
    $('#namebox').textContent = g.stageLabel();
    $('#formula').textContent = list[this.formulaIdx % list.length];
  }

  #refreshStage() {
    const s = this.game.state; const g = this.game;
    const challenging = g.isChallenging(); const boss = g.bossActive();
    $('#stage-label').textContent = g.stageLabel();
    const mode = $('#stage-mode');
    mode.textContent = challenging ? (boss ? '보스 도전 중' : '도전 중') : '자동 사냥';
    mode.className = `stage-mode ${challenging ? 'challenge' : 'farm'}`;
    const pool = stagePool(s.stage);
    $('#stage-monster').textContent = boss ? `보스: ${BOSS.name}` : pool.map((m) => m.name).join(' · ');
    const req = g.killsRequired();
    $('#kill-bar').style.width = challenging ? `${Math.min(100, (s.kills / req) * 100)}%` : '100%';
    $('#kill-text').textContent = boss ? `보스 · 제한 ${BALANCE.BOSS_TIME_LIMIT}초` : challenging ? `${s.kills} / ${req}행 처리` : `사냥 중 · 처치 ${s.kills}`;
    const ec = eliteChance(s.stage);
    $('#stage-hint').textContent = boss ? '30초 안에 처리하지 못하면 직전 스테이지에서 자동 사냥' : ec > 0 ? `엘리트 출현 ${Math.round(ec * 100)}% (HP ×${BALANCE.ELITE.hp}, 골드 ×${BALANCE.ELITE.gold})` : '';
    const next = g.nextStage();
    $('#qa-challenge-label').textContent = challenging ? '도전 중단' : `${stageLabel(next)} 도전${isBossStage(next) ? ' (보스)' : ''}`;
    this.#refreshBestiary(boss ? [BOSS] : pool);
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
    for (const id of this.#rosterOrder()) {
      const v = this.game.heroView(id); const e = v.entry;
      const c = cardCanvas(v.def, {
        star: v.star, owned: e.owned,
        title: v.isMain ? `${v.def.title} · Lv ${e.level}` : (e.owned ? `${stars(e.star)} · Lv ${e.level}` : ''),
        sub: e.enhance ? `+${e.enhance}` : '',
      });
      const wrap = el('div', { class: `card ${v.inParty ? 'in-party' : ''} ${e.owned ? '' : 'locked'}`, title: `${v.traitName}: ${v.traitDesc}`, onclick: () => this.openDetail(id) }, c);
      if (v.inParty) wrap.append(el('span', { class: 'card-badge' }, '배치'));
      if (v.isMain) wrap.append(el('span', { class: 'card-badge main' }, '메인'));
      grid.append(wrap);
      tbody.append(el('tr', { class: e.owned ? '' : 'locked' },
        el('td', {}, v.def.name), el('td', { style: `color:${v.grade.color}` }, v.def.grade), el('td', {}, ROLES[v.def.role].name), el('td', {}, v.traitName),
        el('td', {}, v.isMain ? v.def.title : (e.owned ? stars(e.star) : '미보유')), el('td', { class: 'num' }, e.owned ? e.level : '-'), el('td', { class: 'num' }, e.owned ? e.shards : '-')));
    }
    $('#party-count').textContent = `${this.game.state.party.length} / ${BALANCE.PARTY_SIZE}`;
  }

  // ------------------------------------------------------ hero detail --
  openDetail(id) { this.detailId = id; this.#renderDetail(); $('#modal').hidden = false; }
  #refreshDetail() { if (this.detailId && !$('#modal').hidden) this.#renderDetail(); }
  #renderDetail() {
    const id = this.detailId; const g = this.game; const v = g.heroView(id); const e = v.entry; const s = g.state;
    $('#modal-title').textContent = v.isMain ? `${v.def.name} · ${v.def.title} (메인 영웅)` : `${v.def.name} · ${v.grade.name}급 ${v.grade.label}`;
    const body = $('#modal-body'); body.innerHTML = '';
    body.append(el('div', { class: 'detail-head' }, portraitCanvas(v.def, 2),
      el('div', { class: 'detail-stats' },
        el('div', { class: 'detail-line', html: `<b style="color:${v.grade.color}">${v.def.grade}</b> · ${ROLES[v.def.role].name}${v.isMain ? ` · ${MAIN_TIER_TITLES[v.def.tier]}` : ` · ${stars(v.star)}`}` }),
        el('div', { class: 'detail-line' }, e.owned ? `Lv ${e.level}  ·  강화 +${e.enhance}` : '미보유 (데이터 가져오기에서 획득)'),
        el('div', { class: 'detail-line' }, `ATK ${fmt(v.atk)}  ·  HP ${fmt(v.hp)}  ·  공격 ${v.interval}s`),
        el('div', { class: 'detail-line trait' }, `특성 · ${v.traitName}: ${v.traitDesc}`),
        el('div', { class: 'detail-line skill' }, `스킬 · ${v.skillName}: ${v.skillDesc}`, v.skillUnlocked ? '' : el('span', { class: 'muted' }, ` (${v.skillUnlockHint})`)),
        e.owned && !v.isMain ? el('div', { class: 'detail-line muted' }, `조각 ${e.shards}${v.promoteCost !== null ? ` / 다음 ★ ${v.promoteCost}` : ' (최대 ★)'}`) : null,
      )));
    const actions = el('div', { class: 'detail-actions' });
    if (e.owned) {
      actions.append(btn(v.inParty ? '파티 해제' : '파티 배치', () => g.toggleParty(id), v.inParty ? '' : 'primary', v.isMain && v.inParty && s.party.length === 1));
      if (!v.isMain) actions.append(btn(`★ 승급 (조각 ${v.promoteCost ?? '-'})`, () => { if (!g.promote(id)) this.toast('조각이 부족합니다'); }, '', !v.canPromote));
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
    const tbody = $('#gacha-log tbody'); tbody.innerHTML = '';
    this.gachaLog.forEach((r, i) => tbody.append(el('tr', { class: `g-${r.grade}` },
      el('td', {}, String(this.gachaLog.length - i)), el('td', { style: `color:${GRADES[r.grade].color}` }, r.grade), el('td', {}, r.def.name), el('td', {}, r.isNew ? '신규 입사' : `조각 +${r.shards}`))));
  }
  #showGachaResults(results) {
    const body = el('div', {}, el('p', { class: 'muted' }, `CSV 원본에서 ${results.length}행을 가져왔습니다.`));
    const grid = el('div', { class: 'card-grid result' });
    for (const r of results) {
      grid.append(el('div', { class: `card ${r.isNew ? 'new' : ''}`, onclick: () => this.openDetail(r.heroId) },
        cardCanvas(r.def, { star: this.game.state.heroes[r.heroId].star, title: r.isNew ? '신규 입사!' : `조각 +${r.shards}` }),
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
    for (const q of DAILY_QUESTS) {
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
    const left = g.adsLeft();
    $('#ad-left').textContent = `오늘 남은 광고 ${left} / ${BALANCE.AD.perDay}회`;
    $('#btn-ad-instant').disabled = left <= 0;
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
    tb.prepend(el('tr', { class: `k-${row.kind}` }, el('td', {}, `#${row.row}`), el('td', {}, row.text)));
    while (tb.children.length > 12) tb.lastChild.remove();
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
