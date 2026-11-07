'use strict';
// =====================================================================
//  ui.js — HUD・タブ・モーダル・トースト・バナー
// =====================================================================
const UI = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const fmt = (n) => U.fmt(n);
  const S = () => G.S;

  let tab = 'workers';
  const disp = { wood: 0, gems: 0 };
  let upT = 0, slowT = 0, nightT = 0, nightSnooze = 0;
  const modalQ = [];
  let modalCur = null;
  let overlayBusy = false; // ガチャ・転生演出中
  let current = null; // 現在のタブ実装
  let bannerCur = null;
  const toastQ = [];

  // ------------------------------------------------------------- 初期化
  function init() {
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) switchTab(b.dataset.tab);
    });
    $('#btn-sound').addEventListener('click', () => {
      const st = S().settings;
      st.sound = !st.sound;
      applySettings();
      if (st.sound) { Sfx.unlock(); Sfx.buy(); }
    });
    $('#btn-settings').addEventListener('click', openSettings);
    $('#btn-study').addEventListener('click', openStudy);
    $('#btn-boss').addEventListener('click', () => { if (G.challengeBoss()) Sfx.boss(); });
    $('#critter').addEventListener('click', onCritter);

    // 斧はドラッグで操作（input.js）。キーボードは軽い一振り
    Input.init();
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      const t = e.target;
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SUMMARY')) return;
      if (modalCur || overlayBusy) return;
      e.preventDefault();
      Sfx.unlock();
      doTap(null, null);
    });

    bindEvents();
    applySettings();
    switchTab('workers');
    disp.wood = S().wood;
    disp.gems = S().gems;
  }
  let tapOnly = 0;
  function doTap(x, y) {
    if (modalCur || overlayBusy || G.S.study) return;
    const r = G.tap(x, y);
    if (!r) return;
    Sfx.vibrate(r.tier >= 2 ? 25 : 6);
    // タップだけで遊んでいる人にドラッグを教える
    if (++tapOnly === 6) toast('🪓', '斧はドラッグで振れ！', '幹を左右に速く横切るほど強い。切り込みを狙うとJUST');
  }
  // ドラッグで1撃入ったとき（input.js から）
  function afterHit() {
    tapOnly = 0;
    if (S().tut === 0 && S().stats.taps >= 8) S().tut = 1;
  }
  const blocked = () => !!modalCur || overlayBusy || !!G.S.study;

  function applySettings() {
    const st = S().settings;
    Sfx.setEnabled(st.sound);
    Sfx.setVolume(st.vol);
    Sfx.setVibe(st.vibe);
    U.setNumMode(st.num);
    $('#btn-sound').textContent = st.sound ? '🔊' : '🔇';
    $('#btn-sound').setAttribute('aria-pressed', String(st.sound));
    nightCheck(true);
    FX.setQuality(st);
  }

  // ------------------------------------------------------------- HUD
  function bump(kind) {
    const e = kind === 'gem' ? $('#cur-gem') : $('#cur-wood');
    if (!e) return;
    e.classList.remove('bump');
    void e.offsetWidth;
    e.classList.add('bump');
  }
  function updateHud(dt) {
    const s = S();
    const k = Math.min(1, dt * 9);
    disp.wood += (s.wood - disp.wood) * k;
    if (Math.abs(s.wood - disp.wood) < Math.max(1, s.wood * 0.0005)) disp.wood = s.wood;
    disp.gems += (s.gems - disp.gems) * k;
    if (Math.abs(s.gems - disp.gems) < 0.5) disp.gems = s.gems;
    $('#wood').textContent = fmt(disp.wood);
    $('#gems').textContent = fmt(Math.round(disp.gems));
    const rate = Math.max(G.T.incomeEMA || 0, G.incomeRate());
    $('#wood-rate').textContent = `+${fmt(rate)}/秒 ・ DPS ${fmt(G.stats().dps)}`;
    const tk = $('#cur-ticket');
    tk.hidden = s.tickets <= 0;
    $('#tickets').textContent = fmt(s.tickets);
    const sp = $('#cur-spirit');
    sp.hidden = s.spirits <= 0;
    $('#spirits').textContent = fmt(s.spirits);
  }

  // ------------------------------------------------------------- タブ
  const TABS = {};
  function switchTab(name) {
    tab = name;
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => {
      const on = b.dataset.tab === name;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    const body = $('#tab-body');
    body.scrollTop = 0;
    current = TABS[name];
    current.build(body);
    current.update();
    if (name === 'ach') S().achSeen = Object.keys(S().ach).length;
  }
  function rebuild() { if (current) { const b = $('#tab-body'); const y = b.scrollTop; current.build(b); current.update(); b.scrollTop = y; } }

  function setBadge(name, v) {
    const b = document.querySelector(`#tabs [data-tab="${name}"] .badge`);
    if (!b) return;
    const txt = v === true ? '!' : v ? String(v) : '';
    if (b.textContent !== txt) b.textContent = txt;
    b.hidden = !txt;
  }
  function updateBadges() {
    const s = S();
    let w = 0;
    for (const x of visibleWorkers()) if (G.workerCost(x, s.workers[x.id] || 0, 1) <= s.wood) w++;
    setBadge('workers', w);
    let u = 0;
    for (const x of D.UPGRADES) if (!G.upgMaxed(x) && G.upgCost(x) <= s.wood) u++;
    setBadge('upgrades', u);
    setBadge('gacha', s.tickets >= 10 ? 'FREE' : G.canPull(1) ? true : 0);
    const ready = s.missions.filter((m) => G.missionProgress(m) >= m.target).length;
    setBadge('quests', ready + (s.chests > 0 ? s.chests : 0));
    setBadge('ach', Math.max(0, Object.keys(s.ach).length - (s.achSeen || 0)));
    const g = G.spiritGain();
    setBadge('prestige', g > 0 && g >= Math.max(10, s.spirits * 0.5) ? true : 0);
  }

  // --- 木こりタブ
  function visibleWorkers() {
    const s = S();
    let maxIdx = -1;
    D.WORKERS.forEach((w, i) => { if ((s.workers[w.id] || 0) > 0) maxIdx = i; });
    return D.WORKERS.slice(0, Math.min(D.WORKERS.length, maxIdx + 3));
  }
  function holdButton(btn, fn) {
    let timer = null, rep = null;
    const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = null; };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      Sfx.unlock();
      fn(btn);
      stop();
      timer = setTimeout(() => { rep = setInterval(() => { if (!btn.isConnected || !fn(btn)) stop(); }, 90); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(btn); } });
  }
  function failShake(btn) {
    btn.classList.remove('nope');
    void btn.offsetWidth;
    btn.classList.add('nope');
    Sfx.error();
  }
  function sparkAt(btn, col) {
    const r = btn.getBoundingClientRect();
    FX.burst(r.left + r.width / 2, r.top + r.height / 2, 10, { col, speed: 180, life: 0.4 });
  }

  TABS.workers = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      const head = el('div', 'tab-head');
      const amts = [1, 10, 100, 'max'];
      head.innerHTML = `<div class="seg" role="group" aria-label="まとめ買い">${amts.map((a) => `<button type="button" data-amt="${a}" class="${s.settings.buyAmt === a ? 'on' : ''}">${a === 'max' ? 'MAX' : '×' + a}</button>`).join('')}</div>` +
        `<div class="tab-stat">木こりDPS <b class="w-dps">0</b></div>`;
      head.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-amt]');
        if (!b) return;
        const v = b.dataset.amt;
        s.settings.buyAmt = v === 'max' ? 'max' : Number(v);
        head.querySelectorAll('[data-amt]').forEach((x) => x.classList.toggle('on', x === b));
        this.update();
      });
      root.appendChild(head);
      const list = el('div', 'list');
      this.rows = {};
      this.vis = visibleWorkers();
      for (const w of this.vis) {
        const row = el('div', 'row worker');
        row.innerHTML =
          `<div class="r-ico"><span class="emo">${w.icon}</span><b class="r-cnt">0</b></div>` +
          `<div class="r-main"><div class="r-name">${esc(w.name)} <em class="r-mult"></em></div>` +
          `<div class="r-sub"></div><div class="r-desc">${esc(w.desc)}</div>` +
          `<div class="r-ms"><i></i><span></span></div></div>` +
          `<button type="button" class="buy"><span class="b-n">×1</span><b class="b-c">0</b></button>`;
        const btn = row.querySelector('.buy');
        holdButton(btn, () => {
          const ok = G.buyWorker(w.id, S().settings.buyAmt);
          if (ok) { Sfx.buy(); sparkAt(btn, '#9dff4a'); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); if (S().tut === 1) S().tut = 2; }
          else failShake(btn);
          this.update();
          return ok;
        });
        this.rows[w.id] = { row, cnt: row.querySelector('.r-cnt'), mult: row.querySelector('.r-mult'), sub: row.querySelector('.r-sub'), ms: row.querySelector('.r-ms i'), msT: row.querySelector('.r-ms span'), btn, bn: row.querySelector('.b-n'), bc: row.querySelector('.b-c') };
        list.appendChild(row);
      }
      if (this.vis.length < D.WORKERS.length) {
        list.appendChild(el('div', 'row locked', `<div class="r-ico"><span class="emo">❔</span></div><div class="r-main"><div class="r-name">？？？</div><div class="r-sub">もっと稼ぐと次の木こりが現れる</div></div>`));
      }
      root.appendChild(list);
      this.dps = head.querySelector('.w-dps');
    },
    update() {
      const s = S(), st = G.stats();
      if (visibleWorkers().length !== this.vis.length) { rebuild(); return; }
      this.dps.textContent = fmt(st.dps);
      for (const w of this.vis) {
        const r = this.rows[w.id];
        const n = s.workers[w.id] || 0;
        r.cnt.textContent = n;
        const mm = G.milestoneMult(n);
        r.mult.textContent = mm > 1 ? `×${fmt(mm)}` : '';
        const unit = G.unitDps(w);
        const share = st.dps > 0 ? (st.wdps[w.id] / st.dps) * 100 : 0;
        r.sub.textContent = n > 0 ? `1人 ${fmt(unit)}/秒 ・ 計 ${fmt(st.wdps[w.id])}/秒（${share.toFixed(share < 10 ? 1 : 0)}%）` : `1人 ${fmt(unit)}/秒`;
        const nm = G.nextMilestone(n);
        if (nm) {
          const prev = D.MILESTONES.filter((m) => m[0] <= n).map((m) => m[0]).pop() || 0;
          r.ms.style.width = `${U.clamp(((n - prev) / (nm.at - prev)) * 100, 0, 100)}%`;
          r.msT.textContent = `${nm.at}人で ×${nm.mult}`;
        } else { r.ms.style.width = '100%'; r.msT.textContent = 'MAX'; }
        const amt = s.settings.buyAmt;
        let k = amt === 'max' ? G.maxAffordable(w, n, s.wood) : amt;
        const showK = Math.max(1, k);
        const cost = G.workerCost(w, n, showK);
        r.bn.textContent = amt === 'max' ? `MAX ×${showK}` : `雇う ×${showK}`;
        r.bc.textContent = '🪵' + fmt(cost);
        const can = cost <= s.wood && (amt !== 'max' || k > 0);
        r.btn.classList.toggle('can', can);
        r.row.classList.toggle('dim', !can && n === 0);
      }
    },
  };

  // --- 強化タブ
  const UCAT = {
    slash: '⚔️ 斬撃 <small>強化するほど1撃が派手で気持ちよくなる</small>',
    combo: '🔥 コンボ・フィーバー',
    econ: '🏭 木こり・経済',
    luck: '🍀 運・その他',
  };
  const UFMT = {
    tap: (s) => `斬撃基礎 ${fmt(s.tapBase)}`,
    swing: (s) => `GREAT ×${(1 + D.CFG.SPEED_BONUS[3] * s.swingMult).toFixed(1)} / MAX ×${(1 + D.CFG.SPEED_BONUS[5] * s.swingMult).toFixed(1)}`,
    just: (s) => `JUST ×${s.justMult.toFixed(1)} ・ 幅${Math.round(s.justZone * 200)}%`,
    echo: (s) => (s.echoCount ? `${Math.round(s.echoChance * 100)}%で残像${s.echoCount}体（${Math.round(s.echoDmg * 100)}%）` : 'なし'),
    thunder: (s) => (s.thunderCount ? `${Math.round(s.thunderChance * 100)}%で落雷${s.thunderCount}発（×${s.thunderMult}）` : 'なし'),
    blast: (s) => (s.blastEvery ? `${s.blastEvery}撃ごとに爆裂 ×${s.blastMult}` : 'なし'),
    soul: (s) => `DPSの ${(s.soul * 100).toFixed(1)}%`,
    critc: (s) => `会心率 ${(s.critC * 100).toFixed(0)}%`,
    critm: (s) => `会心 ×${s.critM.toFixed(2)}`,
    combo: (s) => `受付 ${s.comboWin.toFixed(1)}秒`,
    combocap: (s) => `上限 ${s.comboCap}コンボ（×${(1 + s.comboCap * D.CFG.COMBO_PCT).toFixed(1)}）`,
    fever: (s) => `×${s.feverMult} ・ ${s.feverTime.toFixed(2)}秒`,
    guild: (s) => `DPS ×${fmt(s.guild)}`,
    market: (s) => `報酬 ×${fmt(s.market)}`,
    squirrel: (s) => `間隔 ×${s.sqInterval.toFixed(2)}`,
    gem: (s) => `ジェム率 ${(s.gem * 100).toFixed(1)}%`,
    rare: (s) => `レア木 ×${s.rare.toFixed(2)}`,
    chest: (s) => `宝箱率 ${(s.chest * 100).toFixed(1)}%`,
    night: (s) => `オフライン ${Math.round(s.offline * 100)}%`,
  };
  TABS.upgrades = {
    build(root) {
      root.innerHTML = '';
      const st = G.stats();
      root.appendChild(el('div', 'tab-head', `<div class="tab-stat">斬撃 <b class="u-tap">${fmt(st.tap)}</b></div><div class="tab-stat">会心 <b class="u-crit">${(st.critC * 100).toFixed(0)}% ×${st.critM.toFixed(1)}</b></div>`));
      const list = el('div', 'list');
      this.rows = {};
      let cat = '';
      for (const u of D.UPGRADES) {
        if (u.cat !== cat) {
          cat = u.cat;
          list.appendChild(el('div', `upg-cat c-${cat}`, UCAT[cat] || ''));
        }
        const row = el('div', `row upg${u.cat === 'slash' ? ' slash' : ''}`);
        row.innerHTML = `<div class="r-ico"><span class="emo">${u.icon}</span><b class="r-cnt">0</b></div>` +
          `<div class="r-main"><div class="r-name">${esc(u.name)}</div><div class="r-desc">${esc(u.desc)}</div><div class="r-sub"></div><div class="r-fx"></div></div>` +
          `<button type="button" class="buy"><span class="b-n">強化</span><b class="b-c">0</b></button>`;
        const btn = row.querySelector('.buy');
        holdButton(btn, () => {
          const ok = G.buyUpgrade(u.id);
          if (ok) { Sfx.buy(); sparkAt(btn, '#ffd23a'); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); this.refreshText(u.id); }
          else failShake(btn);
          this.update();
          return ok;
        });
        this.rows[u.id] = { row, lv: row.querySelector('.r-cnt'), sub: row.querySelector('.r-sub'), fx: row.querySelector('.r-fx'), btn, bn: row.querySelector('.b-n'), bc: row.querySelector('.b-c') };
        list.appendChild(row);
        this.refreshText(u.id);
      }
      root.appendChild(list);
      this.tap = root.querySelector('.u-tap');
      this.crit = root.querySelector('.u-crit');
    },
    refreshText(id) {
      const u = G.UP[id], r = this.rows[id];
      const fxl = D.SLASH_FX[id];
      if (fxl) {
        const l = S().upg[id] || 0;
        const nx = fxl.find((x) => x[0] > l);
        const got = fxl.filter((x) => x[0] <= l).map((x) => x[1]);
        r.fx.innerHTML = (got.length ? `<span class="fx-on">✨${got.map(esc).join('・')}</span>` : '') + (nx ? `<span class="fx-next">Lv${nx[0]}で演出解放: ${esc(nx[1])}</span>` : '');
      }
      if (G.upgMaxed(u)) { r.sub.textContent = UFMT[id](G.stats()) + '（MAX）'; return; }
      const p = G.previewUpgrade(id);
      r.sub.textContent = `${UFMT[id](p.cur)} → ${UFMT[id](p.next)}`;
    },
    update() {
      const s = S(), st = G.stats();
      this.tap.textContent = fmt(st.tap);
      this.crit.textContent = `${(st.critC * 100).toFixed(0)}% ×${st.critM.toFixed(1)}`;
      for (const u of D.UPGRADES) {
        const r = this.rows[u.id];
        r.lv.textContent = 'Lv' + (s.upg[u.id] || 0);
        if (G.upgMaxed(u)) {
          r.bn.textContent = 'MAX';
          r.bc.textContent = '—';
          r.btn.classList.remove('can');
          r.btn.disabled = true;
          continue;
        }
        const c = G.upgCost(u);
        r.bc.textContent = '🪵' + fmt(c);
        r.btn.classList.toggle('can', c <= s.wood);
      }
    },
  };

  // --- ガチャタブ
  TABS.gacha = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      const hero = el('div', 'gacha-hero');
      hero.innerHTML = `<div class="gh-title">斧ガチャ</div><div class="gh-sub">LR 0.1% ・ UR 0.9% ・ SSR 4.5% ・ SR 14.5%</div><div class="gh-pity"></div>`;
      root.appendChild(hero);
      const btns = el('div', 'gacha-btns');
      btns.innerHTML = `<button type="button" class="pull p1"><span class="pl">1回</span><b class="pc"></b></button>` +
        `<button type="button" class="pull p10"><span class="pl">10連</span><b class="pc"></b><small>SR以上 1枠確定</small></button>`;
      root.appendChild(btns);
      btns.querySelector('.p1').addEventListener('click', () => doPull(1));
      btns.querySelector('.p10').addEventListener('click', () => doPull(10));
      root.appendChild(el('details', 'rates', `<summary>排出率と仕組み</summary><table><tr><th>レア</th><th>確率</th><th>装備タップ倍率</th><th>所持ボーナス/Lv</th></tr>${D.RARITY_ORDER.slice().reverse().map((k) => { const r = D.RARITY[k]; return `<tr><td><span class="rb r-${k}">${k}</span></td><td>${(r.rate * 100).toFixed(1)}%</td><td>×${r.tap}</td><td>+${Math.round(r.pas * 100)}%</td></tr>`; }).join('')}</table><p>同じ斧が出ると Lv アップ（最大 Lv${D.CFG.AXE_MAX_LV}）。最大 Lv 後の重複はジェムに変換。${G.stats().pity}回引いて SSR 以上が出なければ次は SSR 確定（天井）。チケット🎫は1枚で1回分。</p>`));
      const owned = Object.keys(s.axes).length;
      const st = G.stats();
      root.appendChild(el('div', 'sec-title', `斧コレクション <b>${owned}/${D.AXES.length}</b><span>所持ボーナス 全ダメージ +${fmt(Math.round((st.axeMult - 1) * 100))}%</span>`));
      const grid = el('div', 'axe-grid');
      const order = D.RARITY_ORDER.slice().reverse();
      const axes = D.AXES.slice().sort((a, b) => order.indexOf(a.r) - order.indexOf(b.r));
      for (const a of axes) {
        const lv = s.axes[a.id] || 0;
        const b = el('button', `axe-card r-${a.r}${lv ? ' owned' : ''}${s.equip === a.id ? ' eq' : ''}`);
        b.type = 'button';
        b.innerHTML = `<span class="ac-r">${a.r}</span><div class="ac-icon">${FX.axeIconSVG(a, 44)}</div><div class="ac-name">${lv ? esc(a.name) : '？？？'}</div><div class="ac-lv">${lv ? 'Lv' + lv : ''}</div>${s.equip === a.id ? '<span class="ac-eq">装備中</span>' : ''}`;
        if (lv) b.addEventListener('click', () => axeDetail(a));
        else b.disabled = true;
        grid.appendChild(b);
      }
      root.appendChild(grid);
      this.p1 = btns.querySelector('.p1');
      this.p10 = btns.querySelector('.p10');
      this.pity = hero.querySelector('.gh-pity');
    },
    update() {
      const s = S();
      const set = (b, n, cost) => {
        const t = s.tickets >= n;
        b.querySelector('.pc').textContent = t ? `🎫×${n}` : `💎${cost}`;
        b.classList.toggle('can', t || s.gems >= cost);
        b.classList.toggle('free', t);
      };
      set(this.p1, 1, D.CFG.GACHA_1);
      set(this.p10, 10, D.CFG.GACHA_10);
      const left = G.stats().pity - s.pity;
      this.pity.innerHTML = `SSR以上確定まで あと <b>${Math.max(1, left)}</b> 回`;
    },
  };
  function axeDetail(a) {
    const s = S();
    const lv = s.axes[a.id] || 0;
    const R = D.RARITY[a.r];
    const tapM = R.tap * (1 + 0.1 * (lv - 1));
    const sp = a.sp ? Object.keys(a.sp).map((k) => D.SP_TEXT[k](a.sp[k] * (1 + 0.2 * (lv - 1)))).join(' / ') : 'なし';
    const body = el('div', 'axe-detail');
    body.innerHTML = `<div class="ad-icon r-${a.r}">${FX.axeIconSVG(a, 96)}</div>` +
      `<p class="ad-desc">${esc(a.desc)}</p>` +
      `<dl><dt>レア</dt><dd><span class="rb r-${a.r}">${a.r}</span> Lv${lv}/${D.CFG.AXE_MAX_LV}</dd>` +
      `<dt>装備時タップ</dt><dd>×${tapM.toFixed(2)}</dd><dt>装備時特性</dt><dd>${esc(sp)}</dd>` +
      `<dt>所持ボーナス</dt><dd>全ダメージ +${Math.round(R.pas * lv * 100)}%</dd></dl>`;
    const isEq = s.equip === a.id;
    modal({
      title: a.name, body, cls: 'r-' + a.r,
      buttons: [
        { text: isEq ? '装備中' : '装備する', cls: 'primary', disabled: isEq, onClick: () => { G.equip(a.id); Sfx.milestone(); rebuild(); } },
        { text: '閉じる' },
      ],
    });
  }
  function doPull(n) {
    if (overlayBusy) return;
    const r = G.pull(n);
    if (r.error) {
      if (r.error === 'gems') toast('💎', 'ジェムが足りない', 'ボス・ミッション・実績・宝箱で集めよう');
      Sfx.error();
      return;
    }
    if (S().tut === 2) S().tut = 3;
    gachaShow(r.res, n);
  }
  function gachaShow(res, n) {
    overlayBusy = true;
    const rank = (r) => G.RANK[r];
    const top = res.reduce((m, o) => (rank(o.r) > rank(m) ? o.r : m), 'N');
    const ov = el('div', `gacha-ov top-${top}`);
    ov.innerHTML = `<div class="g-stage"><div class="g-portal"><div class="g-rays"></div><div class="g-core">🪓</div></div><div class="g-hype">${rank(top) >= 4 ? '!!! 激アツ !!!' : rank(top) >= 3 ? '金色の光…！' : rank(top) >= 2 ? 'なにかが光った…' : ''}</div><div class="g-skip">タップでスキップ</div></div>`;
    document.body.appendChild(ov);
    Sfx.gachaRoll(rank(top) >= 3 ? 1.6 : 1.1);
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      ov.classList.add('reveal');
      const grid = el('div', `g-cards n${n}`);
      res.forEach((o, i) => {
        const c = el('div', `g-card r-${o.r}`);
        c.style.animationDelay = `${i * (n > 1 ? 0.11 : 0)}s`;
        c.innerHTML = `<div class="gc-in"><span class="gc-r">${o.r}</span>${FX.axeIconSVG(o.axe, n > 1 ? 46 : 110)}<div class="gc-name">${esc(o.axe.name)}</div>` +
          `<div class="gc-tag">${o.isNew ? '<b class="new">NEW!</b>' : o.lvUp ? `<b class="lvup">Lv${o.lv}↑</b>` : `<b class="cv">💎+${o.gems}</b>`}</div></div>`;
        grid.appendChild(c);
        setTimeout(() => {
          Sfx.gachaReveal(o.r);
          if (rank(o.r) >= 3) {
            const r = c.getBoundingClientRect();
            FX.burst(r.left + r.width / 2, r.top + r.height / 2, 30, { speed: 320, col: rank(o.r) >= 4 ? undefined : '#ffd84a' });
            if (rank(o.r) >= 4) { FX.confetti(140); FX.addFlash(0.5); }
          }
        }, i * (n > 1 ? 110 : 0) + 250);
      });
      const st = ov.querySelector('.g-stage');
      st.innerHTML = '';
      st.appendChild(grid);
      const btns = el('div', 'g-btns');
      const again = el('button', 'btn primary', `もう${n === 10 ? '10連' : '1回'}！`);
      again.type = 'button';
      const ok = el('button', 'btn', 'OK');
      ok.type = 'button';
      btns.append(again, ok);
      st.appendChild(btns);
      const close = () => { ov.remove(); overlayBusy = false; if (tab === 'gacha') rebuild(); };
      ok.addEventListener('click', close);
      again.disabled = !G.canPull(n);
      again.addEventListener('click', () => { close(); doPull(n); });
      if (rank(top) >= 3) FX.confetti(rank(top) >= 4 ? 160 : 70);
    };
    ov.addEventListener('click', (e) => { if (!revealed && !e.target.closest('.btn')) reveal(); });
    setTimeout(reveal, rank(top) >= 3 ? 1700 : 1150);
  }

  // --- ミッション・宝箱・ログボタブ
  TABS.quests = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      root.appendChild(el('div', 'sec-title', 'ミッション <span>クリアでジェムと宝箱</span>'));
      const list = el('div', 'list missions');
      this.cards = [];
      s.missions.forEach((m, i) => {
        const c = el('div', 'mission');
        c.innerHTML = `<div class="m-main"><div class="m-text">${esc(G.missionText(m))}</div><div class="m-bar"><i></i></div><div class="m-prog"></div></div>` +
          `<button type="button" class="claim"><span>受け取る</span><b>💎${m.gems}${m.chest ? ' 📦' : ''}</b></button>`;
        const btn = c.querySelector('.claim');
        btn.addEventListener('click', () => {
          if (G.claimMission(i)) {
            const r = btn.getBoundingClientRect();
            FX.coins(r.left + r.width / 2, r.top, 8, 'gem');
            Sfx.milestone();
            FX.burst(r.left + r.width / 2, r.top + r.height / 2, 18, { speed: 240 });
            rebuild();
          } else failShake(btn);
        });
        this.cards.push({ m, bar: c.querySelector('.m-bar i'), prog: c.querySelector('.m-prog'), btn, c });
        list.appendChild(c);
      });
      root.appendChild(list);
      const chest = el('div', 'chest-box');
      chest.innerHTML = `<div class="cb-ico">📦</div><div class="cb-main"><div class="cb-t">宝箱 <b class="cb-n">×0</b></div><div class="cb-s">木を伐ると低確率でドロップ。ボスは確定。</div></div>` +
        `<div class="cb-btns"><button type="button" class="btn small primary cb-1">開ける</button><button type="button" class="btn small cb-all">全部</button></div>`;
      chest.querySelector('.cb-1').addEventListener('click', () => openChests(1));
      chest.querySelector('.cb-all').addEventListener('click', () => openChests(S().chests));
      root.appendChild(chest);
      this.cn = chest.querySelector('.cb-n');
      this.c1 = chest.querySelector('.cb-1');
      this.ca = chest.querySelector('.cb-all');
      root.appendChild(el('div', 'sec-title', `ログインボーナス <span>累計 ${s.stats.loginDays}日</span>`));
      const strip = el('div', 'login-strip');
      const idx = (s.stats.loginDays - 1) % D.LOGIN.length;
      D.LOGIN.forEach((r, i) => {
        const d = el('div', `ls-day${i < idx ? ' got' : i === idx ? ' today' : ''}`);
        d.innerHTML = `<small>${i + 1}日目</small><b>${loginText(r)}</b>`;
        strip.appendChild(d);
      });
      root.appendChild(strip);
    },
    update() {
      const s = S();
      for (const c of this.cards) {
        const p = Math.min(c.m.target, G.missionProgress(c.m));
        c.bar.style.width = `${(p / c.m.target) * 100}%`;
        c.prog.textContent = `${fmt(p)} / ${fmt(c.m.target)}`;
        const done = p >= c.m.target;
        c.btn.classList.toggle('can', done);
        c.c.classList.toggle('done', done);
      }
      this.cn.textContent = '×' + s.chests;
      this.c1.disabled = s.chests <= 0;
      this.ca.disabled = s.chests <= 1;
    },
  };
  const loginText = (r) => (r.gems ? `💎${r.gems}` : r.chests ? `📦×${r.chests}` : `🎫×${r.tickets}`);
  function openChests(n) {
    if (n <= 0 || overlayBusy) return;
    const results = [];
    for (let i = 0; i < n; i++) { const r = G.openChest(); if (!r) break; results.push(r); }
    if (!results.length) return;
    const best = results.reduce((m, r) => (D.CHESTS.indexOf(r.c) > D.CHESTS.indexOf(m.c) ? r : m), results[0]);
    const tier = D.CHESTS.indexOf(best.c);
    const wood = results.reduce((a, r) => a + r.wood, 0), gems = results.reduce((a, r) => a + r.gems, 0), tk = results.reduce((a, r) => a + r.tickets, 0);
    const body = el('div', `chest-open t${tier}`);
    const counts = D.CHESTS.map((c) => [c, results.filter((r) => r.c === c).length]).filter((x) => x[1]);
    body.innerHTML = `<div class="co-box" style="--cc:${best.c.col}">📦</div><div class="co-name">${results.length > 1 ? `${results.length}個 開封！` : esc(best.c.name)}</div>` +
      (results.length > 1 ? `<div class="co-counts">${counts.map(([c, k]) => `<span style="color:${c.col}">${esc(c.name)}×${k}</span>`).join(' ')}</div>` : '') +
      `<ul class="co-rew"><li>🪵 +${fmt(wood)}</li><li>💎 +${gems}</li>${tk ? `<li>🎫 +${tk}</li>` : ''}</ul>`;
    Sfx.chest(tier);
    modal({ title: '宝箱', body, cls: 'chest-modal', buttons: [{ text: 'やったー！', cls: 'primary', onClick: () => { const c = FX.sceneCenter(); FX.coins(c.x, c.y, 10, 'wood'); FX.coins(c.x, c.y, 6, 'gem'); } }] });
    if (tier >= 2) FX.confetti(tier >= 3 ? 140 : 60);
    if (tab === 'quests') rebuild();
  }

  // --- 実績タブ
  TABS.ach = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      const n = Object.keys(s.ach).length;
      root.appendChild(el('div', 'tab-head', `<div class="tab-stat">実績 <b>${n}/${D.ACH.length}</b></div><div class="tab-stat">ボーナス 全ダメージ <b>+${Math.round(n * D.CFG.ACH_BONUS * 100)}%</b></div>`));
      const grid = el('div', 'ach-grid');
      for (const a of D.ACH) {
        const got = !!s.ach[a.id];
        grid.appendChild(el('div', `ach${got ? ' got' : ''}`, `<span class="a-ico">${got ? a.icon : '🔒'}</span><b>${got ? esc(a.name) : '？？？'}</b><small>${esc(a.desc)}</small><em>💎${a.gems}</em>`));
      }
      root.appendChild(grid);
      const st = s.stats;
      root.appendChild(el('div', 'sec-title', '記録'));
      root.appendChild(el('dl', 'records', [
        ['総タップ', fmt(st.taps)], ['総伐採', fmt(st.kills)], ['最大コンボ', fmt(st.maxCombo)], ['最高ステージ', st.bestStage],
        ['会心 / GOD', `${fmt(st.crits)} / ${st.gods}`], ['ガチャ', fmt(st.pulls) + '回'], ['累計木材', fmt(st.woodAll)], ['プレイ時間', U.fmtTime(st.playTime)],
      ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')));
    },
    update() {},
  };

  // --- 転生タブ
  TABS.prestige = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      const box = el('div', 'prestige-box');
      box.innerHTML = `<div class="pb-ring" aria-hidden="true"></div><div class="pb-t">転生（年輪リセット）</div>` +
        `<p>木材・木こり・強化・ステージをリセットして森の精霊🧚を得る。<b>精霊1体につき全ダメージ +${D.CFG.SPIRIT_BONUS * 100}%</b>。ジェム・斧・実績・宝箱は残る。</p>` +
        `<div class="pb-now"><div><small>現在の精霊</small><b class="pb-have"></b></div><div><small>今転生すると</small><b class="pb-gain"></b></div></div>` +
        `<div class="pb-next"></div><button type="button" class="btn primary big pb-go">転生する</button>`;
      box.querySelector('.pb-go').addEventListener('click', confirmPrestige);
      root.appendChild(box);
      root.appendChild(el('div', 'sec-title', `転生ボーナス <span>転生 ${s.stats.prestiges}回</span>`));
      const ul = el('ul', 'perks');
      for (const p of D.PERKS) ul.appendChild(el('li', G.perk(p.n) ? 'on' : '', `<b>${p.n}回</b>${esc(p.text)}`));
      root.appendChild(ul);
      this.have = box.querySelector('.pb-have');
      this.gain = box.querySelector('.pb-gain');
      this.next = box.querySelector('.pb-next');
      this.go = box.querySelector('.pb-go');
    },
    update() {
      const s = S();
      const g = G.spiritGain();
      this.have.textContent = `${fmt(s.spirits)}体（×${fmt(1 + s.spirits * D.CFG.SPIRIT_BONUS)}）`;
      this.gain.textContent = g > 0 ? `+${fmt(g)}体` : '—';
      const minS = D.CFG.PRESTIGE_MIN_STAGE;
      this.next.textContent = s.maxStage < minS ? `ステージ${minS}到達で転生できる（いま最高 ${s.maxStage}）` : `ステージ${s.maxStage + 1}到達で +${fmt(G.spiritGain(s.maxStage + 1))}体`;
      this.go.disabled = g <= 0;
    },
  };
  function confirmPrestige() {
    const g = G.spiritGain();
    if (g <= 0) return;
    const s = S();
    const after = 1 + (s.spirits + g) * D.CFG.SPIRIT_BONUS;
    modal({
      title: '本当に転生する？',
      body: `<p>ステージ${s.maxStage}までの年輪を刻んで、精霊 <b class="hl">+${fmt(g)}体</b> を得る。</p><p>全ダメージ ×${fmt(1 + s.spirits * D.CFG.SPIRIT_BONUS)} → <b class="hl">×${fmt(after)}</b></p><p class="muted">リセット: 木材・木こり・強化・ステージ</p>`,
      buttons: [{ text: '転生する！', cls: 'primary', onClick: doPrestige }, { text: 'やめる' }],
    });
  }
  function doPrestige() {
    overlayBusy = true;
    const ov = el('div', 'prestige-ov', '<div class="po-ring"></div><div class="po-t">転生</div>');
    document.body.appendChild(ov);
    Sfx.prestige();
    setTimeout(() => {
      const g = G.prestige();
      disp.wood = 0;
      rebuild();
      setTimeout(() => {
        ov.classList.add('out');
        setTimeout(() => {
          ov.remove();
          overlayBusy = false;
          modal({ title: '転生完了！', body: `<div class="big-num">🧚 +${fmt(g)}</div><p>精霊の加護で全ダメージ ×${fmt(1 + S().spirits * D.CFG.SPIRIT_BONUS)}。さっきより遥かに速く伐れるはず。</p>`, buttons: [{ text: '伐りまくる', cls: 'primary' }] });
        }, 600);
      }, 500);
    }, 1300);
  }

  // ------------------------------------------------------------- モーダル
  function modal(o) {
    modalQ.push(o);
    if (!modalCur) nextModal();
  }
  function nextModal() {
    const o = modalQ.shift();
    if (!o) { modalCur = null; return; }
    const root = $('#modal-root');
    const back = el('div', 'modal-back');
    const box = el('div', `modal ${o.cls || ''}`);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = `<div class="m-title">${esc(o.title || '')}</div>`;
    const body = el('div', 'm-body');
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    box.appendChild(body);
    const btns = el('div', 'm-btns');
    const close = () => {
      back.classList.add('out');
      setTimeout(() => { back.remove(); modalCur = null; nextModal(); }, 160);
      if (o.onClose) o.onClose();
    };
    (o.buttons || [{ text: 'OK', cls: 'primary' }]).forEach((b, i) => {
      const btn = el('button', `btn ${b.cls || ''}`, esc(b.text));
      btn.type = 'button';
      if (b.disabled) btn.disabled = true;
      btn.addEventListener('click', () => { if (b.keep) { b.onClick && b.onClick(btn, close); return; } close(); if (b.onClick) b.onClick(btn); });
      btns.appendChild(btn);
      if (i === 0) setTimeout(() => btn.focus(), 30);
    });
    box.appendChild(btns);
    back.appendChild(box);
    if (o.dismiss !== false) back.addEventListener('click', (e) => { if (e.target === back) close(); });
    root.appendChild(back);
    modalCur = { o, close, box };
    if (o.onOpen) o.onOpen(box, close);
  }

  // ------------------------------------------------------------- トースト / バナー
  function toast(icon, title, sub, cls = '') {
    toastQ.push({ icon, title, sub, cls });
    pumpToasts();
  }
  function pumpToasts() {
    const root = $('#toasts');
    while (toastQ.length && root.children.length < 2) {
      const t = toastQ.shift();
      const e = el('div', `toast ${t.cls}`, `<span class="t-ico">${t.icon}</span><div><b>${esc(t.title)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</div>`);
      root.appendChild(e);
      setTimeout(() => { e.classList.add('out'); setTimeout(() => { e.remove(); pumpToasts(); }, 300); }, toastQ.length > 3 ? 1400 : 2600);
    }
  }
  const BANNER_PRI = { god: 9, unlock: 8, win: 8, area: 7, boss: 7, fever: 6, 'rare-rainbow': 6, fail: 5, 'rare-gold': 4, combo: 3, 'rare-silver': 2, ms: 3 };
  function banner(title, sub, type) {
    if (blocked() && type !== 'god') return;
    const pri = BANNER_PRI[type] || 1;
    const now = performance.now();
    if (bannerCur && bannerCur.el.isConnected && bannerCur.pri > pri && now - bannerCur.t < 900) return;
    if (bannerCur && bannerCur.el.isConnected) bannerCur.el.remove();
    const e = el('div', `banner b-${type}`, `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`);
    $('#banners').appendChild(e);
    bannerCur = { el: e, pri, t: now };
    e.addEventListener('animationend', (ev) => { if (ev.target === e) e.remove(); });
  }

  // ------------------------------------------------------------- シーン上のUI
  function updateSceneUI() {
    const s = S(), T = G.T;
    $('#btn-boss').hidden = !s.farming;
    // バフ
    const box = $('#buffs');
    const now = Date.now();
    const live = s.buffs.filter((b) => b.end > now);
    if (box.childElementCount !== live.length) {
      box.innerHTML = live.map((b) => `<div class="buff" data-k="${b.k}"><span>${b.icon}</span><b>${esc(b.name)}</b><i></i></div>`).join('');
    }
    live.forEach((b, i) => {
      const c = box.children[i];
      if (!c) return;
      c.querySelector('i').textContent = Math.ceil((b.end - now) / 1000) + 's';
    });
    // 黄金リス
    const cr = $('#critter');
    if (T.squirrel) {
      const sq = T.squirrel;
      if (cr.hidden || cr.dataset.kind !== sq.kind) {
        cr.hidden = false;
        cr.dataset.kind = sq.kind;
        cr.className = 'critter ' + sq.kind;
        cr.innerHTML = sq.kind === 'goddess' ? '<span>⛲</span><small>泉の女神</small>' : '<span>🐿️</span><small>黄金リス</small>';
        cr.setAttribute('aria-label', sq.kind === 'goddess' ? '泉の女神' : '黄金リス');
        cr.style.left = `${sq.x * 100}%`;
        cr.style.top = `${sq.y * 100}%`;
      }
      cr.classList.toggle('leaving', sq.life < 3);
    } else if (!cr.hidden) cr.hidden = true;
    // チュートリアル
    const hint = $('#hint');
    let h = '';
    if (s.tut === 0) h = '🪓 斧をドラッグして幹をスパッと横切れ！';
    else if (s.tut === 1 && s.wood >= 15) h = '🪵 木材がたまった！下の【木こり】で雇え';
    else if (s.tut === 2 && s.tickets >= 10) h = '🎰 無料10連ガチャが引ける！【ガチャ】へ';
    if (s.tut === 1 && Object.keys(s.workers).length) s.tut = 2;
    if (s.tut === 2 && s.stats.pulls >= 10) s.tut = 3;
    if (hint.textContent !== h) hint.textContent = h;
    hint.hidden = !h;
  }
  function onCritter() {
    const r = G.catchSquirrel();
    if (!r) return;
    $('#critter').hidden = true;
    if (r.goddess) return;
    const fx = r.fx;
    Sfx.squirrel();
    const c = FX.sceneCenter();
    FX.burst(c.x, c.y, 30, { col: '#ffd84a', speed: 300 });
    banner(`${fx.icon} ${fx.name}！`, r.detail, 'combo');
    toast(fx.icon, `黄金リス: ${fx.name}`, r.detail, 'gold');
    if (fx.id === 'lucky') FX.coins(c.x, c.y, 16, 'wood');
    if (fx.id === 'gems' || fx.id === 'jackpot') FX.coins(c.x, c.y, 10, 'gem');
  }
  function goddessModal() {
    Sfx.goddess();
    const eq = G.stats().eq;
    const mine = eq ? eq.name : 'ふつうの斧';
    modal({
      title: '⛲ 泉の女神',
      cls: 'goddess',
      dismiss: false,
      body: `<p class="gd-say">「あなたが泉に落としたのは、この<b>金の斧</b>ですか？ それともこの<b>銀の斧</b>ですか？」</p>`,
      buttons: [
        { text: '金の斧です', onClick: () => G.goddessAnswer(false) },
        { text: '銀の斧です', onClick: () => G.goddessAnswer(false) },
        { text: `いいえ、${mine}です`, cls: 'primary', onClick: () => G.goddessAnswer(true) },
      ],
    });
  }

  // ------------------------------------------------------------- 勉強ブースト
  const STUDY_LINES = ['スマホを置け。ペンを持て。', '1問でも多く解け。', '京大の二次は待ってくれない。', '現役合格はこの1分から。', '木こりは働いてる。お前も働け。', '分からない問題こそ伸びしろ。'];
  function openStudy() {
    if (S().study) { showStudy(); return; }
    const body = el('div', 'study-pick');
    body.innerHTML = `<p>勉強中はゲームがロックされる。<b>時間いっぱい完走</b>すると、その時間ぶんの木材 <b>×${D.CFG.STUDY_MULT}</b>（放置効率100%換算）と 💎(分×2)、🎫が手に入る。途中でやめたらボーナスなし。</p>` +
      `<p class="muted">タブを閉じても時間はカウントされる。終わったら戻ってきて受け取れ。</p>`;
    const go = (min) => () => { if (G.startStudy(min)) showStudy(); };
    modal({ title: '📚 勉強ブースト', body, buttons: [{ text: '25分', cls: 'primary', onClick: go(25) }, { text: '50分', cls: 'primary', onClick: go(50) }, { text: '90分', cls: 'primary', onClick: go(90) }, { text: 'やめとく' }] });
  }
  let studyEl = null, abortArmed = 0;
  function showStudy() {
    if (studyEl) return;
    studyEl = el('div', 'study-ov');
    studyEl.innerHTML = `<div class="so-in"><div class="so-t">📚 勉強中</div><div class="so-clock">--:--</div><div class="so-line"></div><div class="so-rew"></div><button type="button" class="btn so-abort">中断する</button></div>`;
    document.body.appendChild(studyEl);
    studyEl.querySelector('.so-line').textContent = U.pick(STUDY_LINES);
    const s = S().study;
    studyEl.querySelector('.so-rew').textContent = `完走報酬: 🪵+${fmt(s.rate * s.min * 60 * D.CFG.STUDY_MULT)} ・ 💎+${s.min * 2} ・ 🎫+${s.min >= 50 ? 2 : 1}`;
    const ab = studyEl.querySelector('.so-abort');
    ab.addEventListener('click', () => {
      if (performance.now() - abortArmed < 4000) { G.abortStudy(); return; }
      abortArmed = performance.now();
      ab.textContent = 'ほんとにやめる？（ボーナス没収）';
      setTimeout(() => { if (ab.isConnected) ab.textContent = '中断する'; }, 4000);
    });
  }
  function hideStudy() { if (studyEl) { studyEl.remove(); studyEl = null; } }
  function updateStudy() {
    const s = S();
    if (s.study) {
      if (!studyEl) showStudy();
      studyEl.querySelector('.so-clock').textContent = U.fmtClock(G.studyLeft());
    } else if (studyEl) hideStudy();
  }

  // ------------------------------------------------------------- 夜ふかしガード
  function nightCheck(force) {
    const st = S().settings;
    const h = new Date().getHours();
    const night = st.night && (h >= 22 || h < 5);
    if (document.body.classList.contains('night') !== night || force) {
      document.body.classList.toggle('night', night);
      $('#night-tint').hidden = !night;
      if (!force) FX.setQuality(st);
    }
    const late = st.night && (h >= 23 || h < 5);
    if (late && !force && Date.now() > nightSnooze && !modalCur && !overlayBusy && !S().study) {
      nightSnooze = Date.now() + 15 * 60000;
      const d = new Date();
      modal({
        title: `🌙 もう${d.getHours()}時${String(d.getMinutes()).padStart(2, '0')}分`,
        cls: 'night-modal',
        body: `<p class="big-say">寝ろ。</p><p>木こりは寝てる間も働く。<b>6時間以上</b>離れて戻ると <b>睡眠ボーナス ×${D.CFG.SLEEP_BONUS}</b>。</p><p class="muted">寝る前や寝床でのスマホは夜ふかし・睡眠不足のもと（厚生労働省「Good Sleepガイド」）。</p>`,
        buttons: [
          { text: 'セーブして寝る', cls: 'primary', onClick: sleepScreen },
          { text: 'あと15分だけ' },
        ],
      });
    }
  }
  function sleepScreen() {
    G.save();
    const ov = el('div', 'sleep-ov', `<div class="sl-in"><div class="sl-moon">🌙</div><div class="sl-t">おやすみ</div><p>セーブした。画面を閉じて寝ろ。</p><button type="button" class="btn small">まだ起きてる</button></div>`);
    document.body.appendChild(ov);
    overlayBusy = true;
    ov.querySelector('button').addEventListener('click', () => { ov.remove(); overlayBusy = false; });
  }

  // ------------------------------------------------------------- 設定
  function openSettings() {
    const st = S().settings;
    const body = el('div', 'settings');
    const row = (label, html) => `<div class="set-row"><span>${label}</span><div>${html}</div></div>`;
    const tog = (k) => `<button type="button" class="tog${st[k] ? ' on' : ''}" data-k="${k}" aria-pressed="${st[k]}">${st[k] ? 'ON' : 'OFF'}</button>`;
    const seg = (k, opts) => `<div class="seg">${opts.map(([v, t]) => `<button type="button" data-k="${k}" data-v="${v}" class="${String(st[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    body.innerHTML =
      row('サウンド', tog('sound')) +
      row('音量', `<input type="range" id="set-vol" min="0" max="1" step="0.05" value="${st.vol}" aria-label="音量">`) +
      row('バイブ', tog('vibe')) +
      row('エフェクト', seg('fx', [[0, '少'], [1, '普'], [2, '多']])) +
      row('画面揺れ', tog('shake')) +
      row('フラッシュ', tog('flash')) +
      row('数字表記', seg('num', [['jp', '万億兆'], ['en', 'K M B'], ['sci', '1e10']])) +
      row('夜ふかしガード', tog('night')) +
      `<p class="muted small">夜ふかしガード: 22時以降は演出を抑えて画面を暖色に、23時以降は寝るよう促す。</p>` +
      `<div class="set-sec">セーブ</div><div class="set-btns"><button type="button" class="btn small" data-act="save">今すぐセーブ</button><button type="button" class="btn small" data-act="export">書き出し</button><button type="button" class="btn small" data-act="import">読み込み</button></div>` +
      `<div class="set-io" hidden><textarea id="set-io-text" rows="4" aria-label="セーブデータ"></textarea><div class="set-btns"><button type="button" class="btn small primary" data-act="copy">コピー</button><button type="button" class="btn small primary" data-act="load">このデータを読み込む</button></div></div>` +
      `<div class="set-sec">危険</div><div class="set-btns"><button type="button" class="btn small danger" data-act="reset">データを全部消す</button></div>` +
      `<div class="set-sec">このゲームについて</div><p class="muted small">数字の単位は寛永11年版『塵劫記』の万進（無量大数＝10の68乗）。𥝱は表示できない環境があるので「秭」で表記。睡眠の話は厚生労働省「健康づくりのための睡眠ガイド2023」より。</p>`;
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('tog')) {
        const k = b.dataset.k;
        st[k] = !st[k];
        b.classList.toggle('on', st[k]);
        b.textContent = st[k] ? 'ON' : 'OFF';
        b.setAttribute('aria-pressed', String(st[k]));
        applySettings();
        return;
      }
      if (b.dataset.v !== undefined) {
        const k = b.dataset.k;
        st[k] = k === 'fx' ? Number(b.dataset.v) : b.dataset.v;
        b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        applySettings();
        rebuild();
        return;
      }
      const io = body.querySelector('.set-io'), ta = body.querySelector('#set-io-text');
      switch (b.dataset.act) {
        case 'save': G.save(); toast('💾', 'セーブした'); break;
        case 'export': io.hidden = false; ta.value = G.exportSave(); ta.select(); body.querySelector('[data-act=load]').hidden = true; body.querySelector('[data-act=copy]').hidden = false; break;
        case 'import': io.hidden = false; ta.value = ''; ta.placeholder = '書き出したテキストを貼り付け'; ta.focus(); body.querySelector('[data-act=load]').hidden = false; body.querySelector('[data-act=copy]').hidden = true; break;
        case 'copy': {
          const done = () => toast('📋', 'コピーした');
          try { navigator.clipboard.writeText(ta.value).then(done, () => { ta.select(); toast('📋', '選択したのでコピーして'); }); } catch (err) { ta.select(); }
          break;
        }
        case 'load':
          if (G.importSave(ta.value)) { applySettings(); rebuild(); toast('✅', '読み込んだ'); if (modalCur) modalCur.close(); }
          else toast('⚠️', '読み込めない', 'テキストが壊れているかも');
          break;
        case 'reset':
          if (b.dataset.armed) { G.hardReset(); applySettings(); disp.wood = 0; switchTab('workers'); if (modalCur) modalCur.close(); toast('🧹', 'データを消した'); }
          else { b.dataset.armed = '1'; b.textContent = '本当に消す（元に戻せない）'; }
          break;
      }
    });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'set-vol') { st.vol = Number(e.target.value); applySettings(); }
    });
    modal({ title: '⚙️ 設定', body, cls: 'settings-modal', buttons: [{ text: '閉じる', onClick: () => G.save() }] });
  }

  // ------------------------------------------------------------- 数字カウントアップ
  function countUp(elm, to, dur = 1.2) {
    const t0 = performance.now();
    const stepF = (now) => {
      const p = Math.min(1, (now - t0) / (dur * 1000));
      elm.textContent = '+' + fmt(to * U.ease.outCubic(p));
      if (p < 1 && elm.isConnected) requestAnimationFrame(stepF);
    };
    requestAnimationFrame(stepF);
  }

  // ------------------------------------------------------------- ゲームイベント
  function bindEvents() {
    G.on('ach', (a) => { toast(a.icon, `実績解除: ${a.name}`, `${a.desc} ・ 💎+${a.gems}`, 'ach'); Sfx.ach(); });
    G.on('missionReady', (m) => toast('📜', 'ミッション達成！', `${G.missionText(m)} → 受け取れ`, 'mission'));
    G.on('milestone', (d) => { banner(`${d.w.name} ×${d.mult}!`, `${d.count}人到達ボーナス`, 'ms'); });
    G.on('sqSpawn', (sq) => { if (sq.kind === 'squirrel') Sfx.squirrel(); else Sfx.goddess(); });
    G.on('goddess', goddessModal);
    G.on('goddessResult', (r) => {
      if (r.honest) {
        modal({ title: '⛲ 泉の女神', cls: 'goddess', body: '<p class="gd-say">「なんと正直な木こりでしょう。ご褒美をあげましょう」</p><ul class="co-rew"><li>💎 +50</li><li>🎫 +3</li><li>⛲ 女神の祝福 全ダメージ×10（30秒）</li></ul>', buttons: [{ text: 'ありがたき幸せ', cls: 'primary' }] });
        FX.confetti(100);
        Sfx.bossWin();
      } else {
        modal({ title: '⛲ 泉の女神', cls: 'goddess', body: '<p class="gd-say">「嘘つきは泥棒の始まりです」</p><p class="muted">女神は泉に帰っていった…</p>', buttons: [{ text: 'すみませんでした' }] });
        Sfx.bossFail();
      }
    });
    G.on('daily', (d) => {
      const body = el('div', 'daily');
      body.innerHTML = `<div class="login-strip">${D.LOGIN.map((r, i) => `<div class="ls-day${i < d.idx ? ' got' : i === d.idx ? ' today stamp' : ''}"><small>${i + 1}日目</small><b>${loginText(r)}</b></div>`).join('')}</div><p>累計ログイン <b>${d.day}日</b>。報酬は受け取り済み。</p>`;
      modal({ title: `📅 ログインボーナス ${((d.day - 1) % 7) + 1}日目`, body, buttons: [{ text: '受け取った', cls: 'primary' }] });
      Sfx.milestone();
    });
    G.on('offline', (d) => {
      if (d.sec < 120) { if (d.sec >= 15 && d.gain > 0) toast('🪵', `+${fmt(d.gain)} 木材`, `離席中（${U.fmtTime(d.sec)}）`); return; }
      const body = el('div', 'offline');
      body.innerHTML = `<p>${U.fmtTime(d.sec)}の間に木こり達が働いた（効率 ${Math.round(d.eff * 100)}%）</p><div class="big-num wood-num">+0</div>` +
        (d.slept ? `<p class="sleep-bonus">😴 睡眠ボーナス ×${D.CFG.SLEEP_BONUS}！ よく寝た。</p>` : '');
      modal({
        title: 'おかえり！', body, buttons: [{ text: '受け取る', cls: 'primary', onClick: () => { const c = FX.sceneCenter(); FX.coins(c.x, c.y, 16, 'wood'); } }],
        onOpen: (box) => countUp(box.querySelector('.wood-num'), d.gain),
      });
    });
    G.on('studyStart', () => showStudy());
    G.on('studyDone', (d) => {
      hideStudy();
      const body = el('div', 'offline');
      body.innerHTML = `<p>${d.min}分 完走。よくやった。</p><div class="big-num wood-num">+0</div><ul class="co-rew"><li>💎 +${d.gems}</li><li>🎫 +${d.tickets}</li></ul><p class="muted">この調子で次の${d.min}分もいけ。</p>`;
      modal({ title: '🎓 勉強おつかれ！', body, buttons: [{ text: '受け取る', cls: 'primary', onClick: () => { const c = FX.sceneCenter(); FX.coins(c.x, c.y, 16, 'wood'); } }], onOpen: (box) => countUp(box.querySelector('.wood-num'), d.wood) });
      FX.confetti(140);
      Sfx.bossWin();
    });
    G.on('studyAbort', (d) => { hideStudy(); toast('📚', '勉強を中断した', `ボーナスなし ・ 木材 +${fmt(d.wood)}`); });
    G.on('load', () => { disp.wood = S().wood; disp.gems = S().gems; });
    G.on('buyWorker', () => { if (tab === 'workers' && current) current.update(); });
    G.on('buyUpgrade', (d) => {
      const hitFx = (D.SLASH_FX[d.u.id] || []).find((x) => x[0] === d.lv);
      if (!hitFx) return;
      banner('演出解放！', `${d.u.icon} ${hitFx[1]}`, 'unlock');
      toast('✨', `演出解放: ${hitFx[1]}`, `${d.u.name} Lv${d.lv}`, 'gold');
      Sfx.unlockFx();
      FX.confetti(70);
    });
    G.on('equip', () => { if (tab === 'upgrades') rebuild(); });
  }

  // ------------------------------------------------------------- フレーム
  function frame(dt) {
    updateHud(dt);
    upT += dt;
    if (upT > 0.12) {
      upT = 0;
      if (current) current.update();
      updateBadges();
      updateSceneUI();
      updateStudy();
    }
    slowT += dt;
    if (slowT > 1) {
      slowT = 0;
      nightT += 1;
      if (nightT >= 20) { nightT = 0; nightCheck(false); }
    }
  }

  return { init, frame, bump, banner, toast, modal, rebuild, blocked, nightCheck, afterHit, tapSwing: doTap, get tab() { return tab; } };
})();
