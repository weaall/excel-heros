// DOM layer: ribbon, formula bar, sheets, tables, stealth view, dialogs.
import { BALANCE, teamUpgradeCost, isBossStage, stageLabel } from '../config/balance.js';
import { HEROES, GRADES, GRADE_ORDER, ROLES } from '../data/heroes.js';
import { monsterForStage } from '../data/monsters.js';
import { heroIconDataURL } from '../data/sprites.js';
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

const STEALTH_FORMULAS = ['=SUMIFS(Sheet2!D:D,Sheet2!A:A,"Q3",Sheet2!B:B,">0")', '=IFERROR(VLOOKUP(A14,Sheet3!$A:$F,4,FALSE),"")', '=INDEX(Data!$C:$C,MATCH(B2,Data!$A:$A,0))'];

export class UIManager {
  constructor(game, renderer) {
    this.game = game; this.renderer = renderer;
    this.acc = 0; this.formulaIdx = 0; this.formulaTimer = 0; this.stealthTimer = 0;
    this.heroRows = new Map(); this.teamRows = new Map(); this.rosterRows = new Map();
    this.gachaLog = [];
    this.#bind();
    this.#subscribe();
    this.rebuildAll();
    this.applyStealth(game.state.settings.stealth, true);
  }

  // ----------------------------------------------------------------- bind --
  #bind() {
    document.title = 'Book1 - Excel';
    document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => this.switchSheet(b.dataset.sheet)));
    $('#btn-stealth').addEventListener('click', () => this.game.toggleStealth());
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!$('#modal').hidden) this.closeModal(); else this.game.toggleStealth();
    });

    $('#qa-upgrade-all').addEventListener('click', () => { const n = this.game.upgradeCheapestLoop(); this.toast(n ? `AutoSum: ${n} upgrade(s) applied` : 'Not enough Gold'); });
    $('#qa-boss').addEventListener('click', () => { if (!this.game.challengeBoss()) this.toast('No boss to challenge from here'); });
    $('#qa-autoboss').addEventListener('change', (e) => this.game.setAutoBoss(e.target.checked));
    $('#set-autoboss').addEventListener('change', (e) => this.game.setAutoBoss(e.target.checked));
    $('#set-stealth').addEventListener('change', (e) => this.game.toggleStealth(e.target.checked));

    $('#pull1').addEventListener('click', () => this.#pull(1));
    $('#pull10').addEventListener('click', () => this.#pull(10));

    $('#btn-export').addEventListener('click', () => { $('#save-text').value = this.game.exportSave(); $('#save-text').select(); this.toast('Save exported to the text box'); });
    $('#btn-import').addEventListener('click', () => {
      try { this.game.importSave($('#save-text').value); this.toast('Save imported'); }
      catch (e) { this.toast('Import failed: invalid save string'); }
    });
    $('#btn-reset').addEventListener('click', () => { if (confirm('Delete this workbook and start over? This cannot be undone.')) this.game.reset(); });
    $('#modal-ok').addEventListener('click', () => this.closeModal());
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') this.closeModal(); });

    window.addEventListener('beforeunload', () => this.game.persist());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.game.persist(); });
  }

  #subscribe() {
    const g = this.game;
    g.on('roster', () => { this.#refreshHeroTable(); this.#refreshTeamTable(); this.#refreshRoster(); });
    g.on('party', () => { this.#buildHeroTable(); this.#refreshRoster(); });
    g.on('stage', () => this.#refreshStage());
    g.on('kills', () => this.#refreshStage());
    g.on('gems', () => this.#refreshGacha());
    g.on('stealth', (on) => this.applyStealth(on));
    g.on('settings', () => this.#refreshSettings());
    g.on('toast', (t) => this.toast(t));
    g.on('gacha', (results) => this.#showGachaResults(results));
    g.on('reset', () => { this.rebuildAll(); this.toast('Workbook reloaded'); });
    g.on('log', (row) => this.#appendLog(row));
    g.on('saved', () => { const s = $('#status-ready'); s.textContent = 'Saved'; setTimeout(() => { s.textContent = this.game.state.settings.stealth ? 'Calculating (4 processors): 37%' : 'Ready'; }, 800); });
  }

  rebuildAll() {
    this.#buildHeroTable(); this.#buildTeamTable(); this.#buildRoster(); this.#refreshStage(); this.#refreshGacha(); this.#refreshSettings(); this.#buildFormulaSheet(); this.#buildLog();
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
      if (this.game.state.settings.stealth && this.stealthTimer >= 0.5) { this.stealthTimer = 0; this.#refreshStealth(); }
      this.#refreshFormulaSheetValues();
    }
  }

  switchSheet(name) {
    document.querySelectorAll('.sheet').forEach((s) => s.classList.toggle('active', s.id === `sheet-${name}`));
    document.querySelectorAll('[data-sheet]').forEach((b) => b.classList.toggle('active', b.dataset.sheet === name));
  }

  // ------------------------------------------------------------ status --
  #refreshStatus() {
    const s = this.game.state;
    $('#status-gold').textContent = `Gold: ${fmt(s.gold)}`;
    $('#status-gems').textContent = `Gems: ${fmt(s.gems)}`;
    $('#status-dps').textContent = `DPS: ${fmt(this.game.entities.dps())}`;
    $('#gold-cell').textContent = fmt(s.gold);
  }

  #refreshFormulaBar() {
    const s = this.game.state; const g = this.game;
    if (s.settings.stealth) {
      $('#namebox').textContent = 'D14';
      $('#formula').textContent = STEALTH_FORMULAS[this.formulaIdx % STEALTH_FORMULAS.length];
      return;
    }
    const kills = g.killsRequired();
    const list = [
      `=SUM(Hero_ATK) = ${fmt(g.partyATK())}`,
      `=PROGRESS("${g.stageLabel()}", ${s.kills}/${kills}) = ${pct(s.kills / kills)}`,
      `=DPS(Sheet1!A1:G15) = ${fmt(g.entities.dps())}/s`,
      `=IDLE_RATE(MAX_STAGE=${s.maxStage}) = ${g.goldPerSecAt(s.maxStage).toFixed(2)} gold/s`,
    ];
    $('#namebox').textContent = g.stageLabel();
    $('#formula').textContent = list[this.formulaIdx % list.length];
  }

  #refreshStage() {
    const s = this.game.state; const g = this.game;
    const boss = isBossStage(s.stage);
    $('#stage-label').textContent = g.stageLabel();
    $('#stage-monster').textContent = boss ? 'BOSS: Emergency Ticket' : monsterForStage(s.stage).name;
    const req = g.killsRequired();
    $('#kill-bar').style.width = `${Math.min(100, (s.kills / req) * 100)}%`;
    $('#kill-text').textContent = boss ? `Boss  ·  ${BALANCE.BOSS_TIME_LIMIT}s limit` : `${s.kills} / ${req} rows processed`;
    $('#qa-boss').disabled = !(isBossStage(s.stage + 1) && s.stage + 1 <= s.maxStage);
    this.#refreshFormulaBar();
  }

  // ------------------------------------------------------- hero table --
  #buildHeroTable() {
    const tbody = $('#hero-table tbody'); tbody.innerHTML = ''; this.heroRows.clear();
    for (const id of this.game.state.party) {
      const v = this.game.heroView(id);
      const row = el('tr', { 'data-id': id },
        el('td', { class: 'name' }, el('img', { src: heroIconDataURL(v.def), class: 'icon', alt: '' }), el('span', {}, v.def.name), el('span', { class: 'grade', style: `color:${v.grade.color}` }, ` ${stars(v.star)}`)),
        el('td', { class: 'num lvl' }), el('td', { class: 'num atk' }), el('td', { class: 'num cost' }),
        el('td', { class: 'act' }, el('button', { class: 'xl-btn up', onclick: () => { if (!this.game.upgradeHero(id)) this.toast('Not enough Gold'); } }, 'Upgrade')),
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
      const btn = $('.up', row); btn.disabled = gold < v.cost; row.classList.toggle('affordable', gold >= v.cost);
    }
    if (light) return;
    $('#party-dps').textContent = fmt(this.game.partyDPS());
  }

  #buildTeamTable() {
    const tbody = $('#team-table tbody'); tbody.innerHTML = ''; this.teamRows.clear();
    for (const [key, t] of Object.entries(BALANCE.TEAM_UPGRADES)) {
      const row = el('tr', {}, el('td', { class: 'name' }, t.name, el('div', { class: 'sub' }, t.desc)), el('td', { class: 'num lvl' }), el('td', { class: 'num cost' }),
        el('td', { class: 'act' }, el('button', { class: 'xl-btn up', onclick: () => { if (!this.game.upgradeTeam(key)) this.toast('Not enough Gold'); } }, 'Buy')));
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

  // ------------------------------------------------------------ roster --
  #buildRoster() {
    const tbody = $('#roster-table tbody'); tbody.innerHTML = ''; this.rosterRows.clear();
    const sorted = HEROES.slice().sort((a, b) => GRADE_ORDER.indexOf(b.grade) - GRADE_ORDER.indexOf(a.grade));
    for (const def of sorted) {
      const row = el('tr', { 'data-id': def.id },
        el('td', { class: 'name wide' },
          el('img', { src: heroIconDataURL(def), class: 'icon', alt: '' }), el('span', {}, def.name),
          el('div', { class: 'sub' }, el('span', { class: 'grade', style: `color:${GRADES[def.grade].color}` }, GRADES[def.grade].name), ` · ${ROLES[def.role].name}`),
          el('div', { class: 'sub skill' })),
        el('td', { class: 'star' }),
        el('td', { class: 'num shards' }),
        el('td', { class: 'act stack' },
          el('button', { class: 'xl-btn deploy', onclick: () => this.game.toggleParty(def.id) }, 'Deploy'),
          el('button', { class: 'xl-btn promote', onclick: () => { if (!this.game.promote(def.id)) this.toast('Not enough shards'); } }, 'Promote')),
      );
      tbody.append(row); this.rosterRows.set(def.id, row);
    }
    this.#refreshRoster();
  }
  #refreshRoster() {
    for (const [id, row] of this.rosterRows) {
      const v = this.game.heroView(id); const e = v.entry;
      row.classList.toggle('locked', !e.owned); row.classList.toggle('in-party', v.inParty);
      $('.star', row).innerHTML = e.owned
        ? `<span style="color:${v.grade.color}">${stars(e.star)}</span><div class="sub">Lv ${e.level} · ATK ${fmt(v.atk)}</div>`
        : '<span class="muted">Locked</span>';
      $('.shards', row).textContent = e.owned ? (v.promoteCost === null ? `${e.shards} (MAX)` : `${e.shards} / ${v.promoteCost}`) : '-';
      $('.skill', row).textContent = `${v.skillName}: ${v.skillDesc}${v.skillUnlocked ? '' : ' (★2 unlock)'}`;
      const dep = $('.deploy', row); dep.textContent = v.inParty ? 'Bench' : 'Deploy'; dep.disabled = !e.owned;
      $('.promote', row).disabled = !v.canPromote;
    }
    $('#party-count').textContent = `${this.game.state.party.length} / ${BALANCE.PARTY_SIZE}`;
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
    $('#gems-cell').textContent = fmt(s.gems);
    $('#pull1').disabled = s.gems < BALANCE.GACHA_SINGLE_COST; $('#pull10').disabled = s.gems < BALANCE.GACHA_TEN_COST;
    $('#pity-exec').textContent = `${BALANCE.PITY_EXECUTIVE - s.pity.sinceExecutive} pulls`;
    $('#pity-ceo').textContent = `${BALANCE.PITY_CEO - s.pity.sinceCEO} pulls`;
    $('#total-pulls').textContent = s.stats.totalPulls;
    const tbody = $('#gacha-log tbody'); tbody.innerHTML = '';
    this.gachaLog.forEach((r, i) => tbody.append(el('tr', { class: `g-${r.grade}` },
      el('td', {}, String(this.gachaLog.length - i)), el('td', { style: `color:${GRADES[r.grade].color}` }, GRADES[r.grade].name), el('td', {}, r.def.name), el('td', {}, r.isNew ? 'NEW HIRE' : `+${r.shards} shards`))));
  }
  #showGachaResults(results) {
    const rows = results.map((r) => `<tr class="g-${r.grade}"><td style="color:${GRADES[r.grade].color};font-weight:600">${GRADES[r.grade].name}</td><td><img class="icon" src="${heroIconDataURL(r.def)}" alt=""> ${r.def.name}</td><td>${r.isNew ? '<b>NEW HIRE</b>' : `+${r.shards} shards`}</td></tr>`).join('');
    this.openModal('Import Data — Complete', `<p class="muted">${results.length} row(s) imported from CSV source.</p><table class="xl-table compact"><thead><tr><th>Grade</th><th>Name</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  // ---------------------------------------------------------- settings --
  #refreshSettings() {
    const st = this.game.state.settings;
    $('#qa-autoboss').checked = st.autoBoss; $('#set-autoboss').checked = st.autoBoss; $('#set-stealth').checked = st.stealth;
  }

  #buildFormulaSheet() {
    $('#formula-list').innerHTML = [
      ['Upgrade cost', '=FLOOR(10 * 1.12 ^ (Level - 1))'],
      ['Monster HP', '=FLOOR(50 * 1.18 ^ (Stage - 1))'],
      ['Monster ATK', '=FLOOR(1 * 1.13 ^ (Stage - 1))'],
      ['Gold per kill', '=FLOOR(5 * 1.15 ^ (Stage - 1)) * (1 + Payroll)'],
      ['Hero ATK', '=FLOOR(Base * 1.10 ^ (Level - 1) * StarMult)'],
      ['Hero HP', '=FLOOR(Base * 1.08 ^ (Level - 1) * StarMult * (1 + Chairs))'],
      ['Boss HP / time', '=MonsterHP * 8   /   30s limit'],
      ['Offline gold', '=IdleGoldPerSec(MaxStage) * MIN(Seconds, 43200) * 0.8'],
      ['Pity', 'Executive+ within 50 pulls, CEO within 100 pulls'],
    ].map(([k, f]) => `<tr><td>${k}</td><td class="mono">${f}</td></tr>`).join('');
  }
  #refreshFormulaSheetValues() {
    const s = this.game.state.stats; const st = this.game.state;
    $('#stats-list').innerHTML = [
      ['Max stage reached', stageLabel(st.maxStage)], ['Total kills', fmt(s.totalKills)], ['Total gold earned', fmt(s.totalGold)],
      ['Total pulls', s.totalPulls], ['Boss kills / fails', `${s.bossKills} / ${s.bossFails}`], ['Play time', fmtTime(s.playSeconds)],
      ['Idle rate (max stage)', `${this.game.goldPerSecAt(st.maxStage).toFixed(2)} gold/s`],
    ].map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join('');
  }

  // ------------------------------------------------------------ stealth --
  applyStealth(on, silent = false) {
    document.body.classList.toggle('stealth', on);
    $('#canvas-wrap').hidden = on; $('#stealth-view').hidden = !on;
    $('#status-ready').textContent = on ? 'Calculating (4 processors): 37%' : 'Ready';
    $('#set-stealth').checked = on;
    this.#refreshFormulaBar();
    if (on) this.#refreshStealth();
    if (!silent) this.toast(on ? 'Boss key ON (Esc to return)' : 'Boss key OFF');
  }
  #refreshStealth() {
    const em = this.game.entities; const tbody = $('#stealth-table tbody'); tbody.innerHTML = '';
    let n = 2;
    for (const h of em.heroes) {
      tbody.append(el('tr', {}, el('td', {}, `A${n++}`), el('td', {}, `Process ${h.def.name}`), el('td', {}, 'HR'), el('td', {}, h.alive ? `${Math.round((h.hp / h.maxHp) * 100)}%` : 'Pending'), el('td', { class: 'num' }, fmt(h.atk))));
    }
    for (const m of em.monsters.filter((m) => m.alive)) {
      tbody.append(el('tr', {}, el('td', {}, `B${n++}`), el('td', {}, `Validate ${m.def.name}`), el('td', {}, 'QA'), el('td', {}, `${Math.round((m.hp / m.maxHp) * 100)}%`), el('td', { class: 'num' }, fmt(m.hp))));
    }
    for (const row of this.game.logs.slice(-8).reverse()) {
      tbody.append(el('tr', { class: 'log' }, el('td', {}, `#${row.row}`), el('td', {}, `Processing Row #${row.row}... ${row.text}`), el('td', {}, 'SYS'), el('td', {}, 'OK'), el('td', { class: 'num' }, '')));
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
  openModal(title, html) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
  closeModal() { $('#modal').hidden = true; }
  showOffline(rep) {
    this.openModal('Background Calculation Complete', `
      <table class="xl-table compact"><tbody>
        <tr><td>Away time</td><td class="num">${fmtTime(rep.elapsed)}${rep.capped ? ' (capped at 12h)' : ''}</td></tr>
        <tr><td>Idle rate</td><td class="num">${rep.goldPerSec.toFixed(2)} gold/s × 80%</td></tr>
        <tr><td><b>Gold collected</b></td><td class="num"><b>+${fmt(rep.gold)}</b></td></tr>
      </tbody></table>`);
  }
  showWelcome() {
    this.openModal('New Workbook', `
      <p>Welcome to <b>Excel Heroes</b>. Your party auto-hunts inside cells <b>A1:G15</b>.</p>
      <ul>
        <li><b>Home</b> — battle & upgrades. <b>Data</b> — HR roster & promotion. <b>Insert</b> — import staff (gacha).</li>
        <li>You start with <b>${BALANCE.STARTING_GEMS} Gems</b>: try a 10-row import right away.</li>
        <li>Press <b>Esc</b> (or the 🔒 button) to hide the canvas and show only boring spreadsheet rows.</li>
      </ul>`);
  }
  toast(text) {
    const t = $('#toast'); t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.hidden = true; }, 1800);
  }
}
