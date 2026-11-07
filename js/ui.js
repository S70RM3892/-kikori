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
    document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openDrawer(b.dataset.open)));
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-back').addEventListener('click', closeDrawer);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawerOpen && !modalCur) closeDrawer(); });
    buildDock();
    buildPips();
    $('#btn-sound').addEventListener('click', () => {
      const st = S().settings;
      st.sound = !st.sound;
      applySettings();
      if (st.sound) { Sfx.unlock(); Sfx.buy(); }
    });
    $('#btn-settings').addEventListener('click', openSettings);
    $('#roll-strip').addEventListener('click', () => openDrawer('gacha'));
    $('#btn-speed').addEventListener('click', () => {
      Sfx.unlock();
      const prevMax = G.speedMax();
      const v = G.cycleSpeed();
      const eff = G.gameSpeed();
      if (eff < v) toast('🌙', '夜は等速', '夜ふかしガード中は倍速にならない（設定でOFF可）');
      else if (v === 1 && prevMax < 3) toast('⏩', `3倍速はステージ${D.CFG.SPEED3_STAGE}で解放`, 'もっと奥の森へ進め');
      Sfx.speed(eff);
      updateSpeedBtn();
      if (eff > 1) banner(`${'▶'.repeat(eff)} ${eff}倍速`, '木こりも木の生え変わりも速くなる', 'speed');
    });
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
    disp.wood = S().wood;
    disp.gems = S().gems;
  }
  let tapOnly = 0;
  function doTap(x, y) {
    if (modalCur || overlayBusy || G.S.study) return;
    if (gdim()) { if (typeof GUI !== 'undefined') GUI.keySlash(); return; }
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
    Sfx.setBgm(st.bgm);
    Sfx.musicLevel(st.bgm && st.sound && !document.body.classList.contains('night') ? G.T.rank : 0);
    U.setNumMode(st.num);
    $('#btn-sound').textContent = st.sound ? '🔊' : '🔇';
    $('#btn-sound').setAttribute('aria-pressed', String(st.sound));
    nightCheck(true);
    FX.setQuality(st);
  }

  // ------------------------------------------------------------- HUD
  function updateSpeedBtn() {
    const v = Math.min(S().settings.speed || 1, G.speedMax());
    const eff = G.gameSpeed();
    setText('speed-x', `×${v}`);
    setCls('btn-speed', 'fast', eff > 1);
    setCls('btn-speed', 'x3', eff >= 3);
    setCls('btn-speed', 'capped', eff < v);
    setCls('hud', 'speedy', eff > 1);
  }
  function updateRollStrip() {
    if (gdim()) {
      const r = GM.kRollRate();
      setText('rs-rate', r < 100 ? r.toFixed(1) : fmt(r));
      setText('rs-luck', `×${GM.kLuckNow().toFixed(2)}`);
      setText('rs-lv', String(S().germ.kgLv || 1));
      setCls('roll-strip', 'boost', GM.T.outbreak > 0 || GM.T.combo >= 30 || G.gameSpeed() > 1);
      return;
    }
    const T = G.T, rate = G.rollRate();
    const boost = T.fever > 0 || T.rank >= 3 || G.gameSpeed() > 1 || G.buffOf('roll') > 1 || G.buffOf('luck') > 1 || T.golden > 0;
    setText('rs-rate', rate < 100 ? rate.toFixed(1) : fmt(rate));
    setText('rs-luck', `×${G.luckNow().toFixed(2)}`);
    setText('rs-lv', String(S().gachaLv || 1));
    setCls('roll-strip', 'boost', boost);
  }
  function bump(kind) {
    const e = kind === 'gem' ? $('#cur-gem') : kind === 'dna' ? $('#cur-dna') : kind === 'factor' ? $('#cur-factor') : $('#cur-wood');
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
    updateLiveHud(dt);
  }

  // 毎フレーム更新する HUD（変化したときだけ DOM に書く）
  const last = {};
  function setText(id, v) { if (last[id] !== v) { last[id] = v; const e = document.getElementById(id); if (e) e.textContent = v; } }
  function setScale(id, f) { const k = 's' + id, v = Math.round(U.clamp(f, 0, 1) * 1000); if (last[k] !== v) { last[k] = v; const e = document.getElementById(id); if (e) e.style.transform = `scaleX(${v / 1000})`; } }
  function setCls(id, cls, on) { const k = 'c' + id + cls; if (last[k] !== on) { last[k] = on; const e = document.getElementById(id); if (e) e.classList.toggle(cls, on); } }
  let hpTrail = 1, comboFade = 0, comboShown = 0, totShown = 0, finishT = 0, finishTot = 0;
  function buildPips() {
    $('#pips').innerHTML = Array.from({ length: D.CFG.TREES_PER_STAGE }, () => '<i></i>').join('');
  }
  function updateLiveHud(dt) {
    const s = S(), T = G.T, st = G.stats();
    // 伐採レベル
    const need = G.xpNeed(s.lvl);
    setText('lvl-n', String(s.lvl));
    setText('lvl-xp', `${Math.floor(s.xp)}/${need}`);
    setScale('lvl-bar', s.xp / need);
    // ステージ
    setText('stage-n', String(s.stage));
    setText('biome', FX.biomeName());
    const pipsMode = s.farming ? 'farm' : G.isBossStage(s.stage) ? 'boss' : 'kills';
    setCls('pips', 'farm', pipsMode === 'farm');
    setCls('pips', 'boss', pipsMode === 'boss');
    if (last.kills !== s.kills || last.pm !== pipsMode) {
      last.kills = s.kills; last.pm = pipsMode;
      $('#pips').querySelectorAll('i').forEach((e, i) => e.classList.toggle('on', i < s.kills));
    }
    // 木の名前・HP
    const tree = T.tree;
    if (tree) {
      const p = World.palette(G.biomeIndex(tree.stage));
      let name = tree.boss ? `BOSS ${p.boss}` : `${tree.rar.name}${p.tree}`;
      if (tree.rar.id !== 'normal') name = `✦ ${name} ✦`;
      setText('tree-name', name);
      setCls('tree-box', 'boss', !!tree.boss);
      setCls('tree-box', 'rare', tree.rar.id !== 'normal');
      const frac = tree.alive ? tree.hp / tree.maxHp : 0;
      hpTrail = frac > hpTrail ? frac : Math.max(frac, hpTrail - dt * 0.9);
      setScale('hp-fill', frac);
      setScale('hp-trail', hpTrail);
      setText('hp-txt', `${fmt(Math.ceil(tree.hp))} / ${fmt(tree.maxHp)}`);
      const bt = tree.boss && tree.alive;
      setCls('boss-timer', 'show', bt);
      if (bt) {
        setText('boss-timer', `⏱ ${T.bossTimer.toFixed(1)}`);
        setCls('boss-timer', 'urgent', T.bossTimer < 10);
        if (T.bossTimer < 10 && Math.floor(T.bossTimer) !== Math.floor(T.bossTimer + dt)) Sfx.tick();
      }
    }
    // コンボと倍率メーター
    if (T.combo > 1) { comboFade = 1; comboShown = T.combo; finishT = 0; }
    else if (finishT > 0) { comboFade = 1; finishT = Math.max(0, finishT - dt); }
    else comboFade = Math.max(0, comboFade - dt * 2);
    const cb = $('#combo-box');
    if (cb) {
      cb.style.opacity = comboFade.toFixed(2);
      setText('combo-n', String(comboShown));
      // 合計ダメージはくるくる回りながら追いつく
      const tot = T.combo > 0 ? T.comboDmg : finishTot;
      totShown = tot < totShown ? tot : totShown + (tot - totShown) * Math.min(1, dt * 10);
      setText('combo-total', fmt(totShown));
      setCls('combo-box', 'finish', finishT > 0);
      const n = comboShown;
      const tierC = n >= 500 ? 't5' : n >= 200 ? 't4' : n >= 100 ? 't3' : n >= 50 ? 't2' : 't1';
      if (last.ctier !== tierC) { last.ctier = tierC; cb.dataset.tier = tierC; }
      const pop = FX.comboPop;
      $('#combo-n').style.transform = `scale(${(1 + pop * 0.32).toFixed(3)})`;
      const chain = T.justChain;
      const mult = G.comboMult() * (T.fever > 0 ? st.feverMult : 1) * G.buffMult('tap') * (chain > 0 ? st.justMult * (1 + 0.1 * Math.min(chain - 1, st.chainCap)) : 1);
      setText('mult', `×${mult < 100 ? mult.toFixed(2) : fmt(mult)}`);
      setScale('heat', Math.log10(Math.max(1, mult)) / 3);
      const heat = mult >= 100 ? 'h4' : mult >= 20 ? 'h3' : mult >= 5 ? 'h2' : 'h1';
      if (last.heat !== heat) { last.heat = heat; cb.dataset.heat = heat; }
      setText('chain', chain >= 2 ? `JUST ×${chain}` : '');
      setScale('combo-win', T.combo > 0 ? T.comboTimer / (T.comboWin || 1) : 0);
    }
    // スタイルランク（画面の左）
    const RK = D.STYLE.RANKS, rk = T.rank, nx = RK[rk + 1];
    const rb = $('#rank-box');
    if (rb) {
      const lo = RK[rk].th, hi = nx ? nx.th : D.STYLE.MAX;
      setScale('rank-g', (T.style - lo) / Math.max(1, hi - lo));
      setText('rank-l', RK[rk].id);
      setText('rank-w', RK[rk].word);
      setText('rank-m', rk ? `報酬×${RK[rk].mult}` : '');
      if (last.rk !== rk) {
        last.rk = rk;
        rb.dataset.r = String(rk);
        rb.style.setProperty('--rk', RK[rk].col);
        const hud = $('#hud');
        hud.dataset.rank = String(rk);
        hud.style.setProperty('--rkc', RK[rk].col);
      }
      setCls('rank-box', 'show', T.style > 1.5 || rk > 0);
    }
    // 必殺技ゲージ（SSR以上の斧を装備しているとき）
    const si = G.skillInfo();
    setCls('skill-box', 'show', !!si);
    if (si) {
      setText('skill-n', si.sk.name);
      setScale('skill-g', si.gauge / si.need);
      setCls('skill-box', 'ready', si.gauge / si.need >= 0.8);
    }
    // フィーバー・ゴールデン
    if (T.fever > 0) {
      setText('fever-l', `FEVER!! ×${st.feverMult}`);
      setScale('fever-fill', T.fever / (T.feverMax || 1));
    } else {
      setText('fever-l', 'FEVER');
      setScale('fever-fill', T.feverGauge / D.CFG.FEVER_NEED);
    }
    setCls('fever', 'on', T.fever > 0);
    setCls('fever', 'near', T.fever <= 0 && T.feverGauge / D.CFG.FEVER_NEED > 0.8);
    setCls('hud', 'golden', T.golden > 0);
    setCls('hud', 'fevering', T.fever > 0);
  }
  // ランクが上がったとき: 端のボタンとドックが順番に跳ねる
  function wave(r) {
    const h = $('#hud');
    h.classList.remove('wave');
    void h.offsetWidth;
    h.classList.add('wave');
    for (const rb of document.querySelectorAll('.rank-box')) { rb.classList.remove('slam'); void rb.offsetWidth; rb.classList.add('slam'); }
  }
  // BGM の拍に合わせて HUD が脈打つ
  function beat() {
    const h = $('#hud');
    h.classList.remove('beat');
    void h.offsetWidth;
    h.classList.add('beat');
  }
  function shakeHud() {
    const h = $('#hud');
    h.classList.remove('shake');
    void h.offsetWidth;
    h.classList.add('shake');
  }

  // ------------------------------------------------------------- 端のウィジェット → 引き出し
  const LEFT = ['workers', 'upgrades', 'gacha'];
  const TITLES = { workers: '🪓 木こり', upgrades: '⚡ 強化', gacha: '🎰 斧ガチャ', quests: '📜 任務・宝箱', ach: '🏆 実績', prestige: '🌀 転生' };
  let drawerOpen = null;
  const wide = () => window.innerWidth >= 1000;
  function openDrawer(name) {
    if (drawerOpen === name) { closeDrawer(); return; }
    drawerOpen = name;
    const d = $('#drawer');
    d.classList.toggle('right', LEFT.indexOf(name) < 0);
    $('#drawer-title').textContent = TITLES[name];
    d.hidden = false;
    requestAnimationFrame(() => d.classList.add('open'));
    $('#drawer-back').hidden = wide();
    document.querySelectorAll('[data-open]').forEach((b) => b.classList.toggle('on', b.dataset.open === name));
    switchTab(name);
    Sfx.buy();
  }
  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = null;
    current = null;
    const d = $('#drawer');
    d.classList.remove('open');
    $('#drawer-back').hidden = true;
    document.querySelectorAll('[data-open]').forEach((b) => b.classList.remove('on'));
    setTimeout(() => { if (!drawerOpen) d.hidden = true; }, 230);
  }

  // ------------------------------------------------------------- 下のクイック購入ドック
  const dock = [];
  function buildDock() {
    const root = $('#dock');
    root.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const b = el('button', 'dk');
      b.type = 'button';
      b.innerHTML = '<i class="dk-fill"></i><span class="dk-ico"></span><b class="dk-name"></b><span class="dk-cost"></span><em class="dk-tag"></em>';
      root.appendChild(b);
      const slot = { b, ico: b.querySelector('.dk-ico'), name: b.querySelector('.dk-name'), cost: b.querySelector('.dk-cost'), tag: b.querySelector('.dk-tag'), fill: b.querySelector('.dk-fill'), act: null, key: '' };
      holdButton(b, () => {
        if (!slot.act) return false;
        const ok = slot.act();
        if (ok === true) { sparkAt(b, '#9dff4a'); b.classList.remove('bought'); void b.offsetWidth; b.classList.add('bought'); updateDock(); }
        else if (ok === false) failShake(b);
        return ok === true && slot.repeat;
      });
      dock.push(slot);
    }
  }
  function dockSet(slot, o) {
    slot.act = o.act;
    slot.repeat = !!o.repeat;
    const key = o.ico + '|' + o.name + '|' + o.cost + '|' + (o.tag || '') + '|' + o.can + '|' + (o.kind || '');
    if (slot.key !== key) {
      slot.key = key;
      slot.ico.textContent = o.ico;
      slot.name.textContent = o.name;
      slot.cost.textContent = o.cost;
      slot.tag.textContent = o.tag || '';
      slot.tag.hidden = !o.tag;
      slot.b.classList.toggle('can', !!o.can);
      slot.b.dataset.kind = o.kind || '';
    }
    slot.fill.style.transform = `scaleX(${U.clamp(o.fill === undefined ? (o.can ? 1 : 0) : o.fill, 0, 1).toFixed(3)})`;
  }
  function bestWorker() {
    const s = S();
    let best = null, bestV = -1, cheap = null;
    for (const w of visibleWorkers()) {
      const n = s.workers[w.id] || 0;
      const c = G.workerCost(w, n, 1);
      if (!cheap || c < cheap.c) cheap = { w, c };
      if (c <= s.wood) { const v = G.unitDps(w) / c; if (v > bestV) { bestV = v; best = { w, c }; } }
    }
    return best || cheap;
  }
  function bestUpgrade(slash) {
    const s = S();
    let pick = null;
    for (const u of D.UPGRADES) {
      if ((u.cat === 'slash') !== slash || G.upgMaxed(u)) continue;
      if (!slash && (u.id === 'night' || u.id === 'squirrel')) continue;
      const c = G.upgCost(u);
      const l = s.upg[u.id] || 0;
      const fxNext = (D.SLASH_FX[u.id] || []).find((x) => x[0] === l + 1);
      const score = c / (fxNext ? 3 : 1);
      if (!pick || score < pick.score) pick = { u, c, l, fxNext, score };
    }
    return pick;
  }
  function updateDock() {
    const s = S();
    // 1) 木こり
    const bw = bestWorker();
    if (bw) {
      const n = s.workers[bw.w.id] || 0;
      const nm = G.nextMilestone(n);
      dockSet(dock[0], {
        kind: 'worker', ico: bw.w.icon, name: `${bw.w.name}`, cost: '🪵' + fmt(bw.c), can: bw.c <= s.wood, fill: s.wood / bw.c, repeat: true,
        tag: nm && nm.at - n <= 3 ? `あと${nm.at - n}人で×${nm.mult}` : `${n}人`,
        act: () => { const ok = G.buyWorker(bw.w.id, 1); if (ok) { Sfx.buy(); if (S().tut === 1) S().tut = 2; } return ok; },
      });
    }
    // 2) 斬撃強化  3) その他の強化
    [[1, true], [2, false]].forEach(([i, slash]) => {
      const bu = bestUpgrade(slash);
      if (!bu) { dockSet(dock[i], { ico: '✅', name: 'MAX', cost: '', can: false, act: null }); return; }
      dockSet(dock[i], {
        kind: slash ? 'slash' : 'upg', ico: bu.u.icon, name: `${bu.u.name} Lv${bu.l + 1}`, cost: '🪵' + fmt(bu.c), can: bu.c <= s.wood, fill: s.wood / bu.c, repeat: true,
        tag: bu.fxNext ? `✨${bu.fxNext[1]}` : '',
        act: () => { const ok = G.buyUpgrade(bu.u.id); if (ok) Sfx.buy(); return ok; },
      });
    });
    // 4) 受け取り系（ミッション → 無料ガチャ → 宝箱 → 無料ガチャの残り時間）
    const mi = s.missions.findIndex((m) => G.missionProgress(m) >= m.target);
    const free = G.freeLeft();
    if (mi >= 0) {
      const m = s.missions[mi];
      dockSet(dock[3], { kind: 'claim', ico: '📜', name: 'ミッション達成', cost: `💎${m.gems}`, can: true, tag: '受け取る',
        act: () => { const r = dock[3].b.getBoundingClientRect(); if (G.claimMission(mi)) { FX.coins(r.left + r.width / 2, r.top, 8, 'gem'); Sfx.milestone(); return true; } return false; } });
    } else if (free <= 0) {
      dockSet(dock[3], { kind: 'free', ico: '🎰', name: '無料ガチャ', cost: 'FREE', can: true, tag: '今すぐ', act: () => { doPull(1, true); return true; } });
    } else if (s.chests > 0) {
      dockSet(dock[3], { kind: 'chest', ico: '📦', name: `宝箱 ×${s.chests}`, cost: '開ける', can: true, act: () => { openChests(S().chests); return true; } });
    } else {
      dockSet(dock[3], { kind: 'wait', ico: '🎰', name: '無料ガチャまで', cost: U.fmtClock(free), can: false, fill: 1 - free / (D.CFG.FREE_PULL_MIN * 60), act: () => { openDrawer('gacha'); return null; } });
    }
  }

  // ------------------------------------------------------------- タブ
  const TABS = {};
  function switchTab(name) {
    tab = name;
    const body = $('#tab-body');
    body.scrollTop = 0;
    current = TABS[name];
    current.build(body);
    current.update();
    if (name === 'ach') S().achSeen = Object.keys(S().ach).length;
  }
  function rebuild() { if (current && drawerOpen) { const b = $('#tab-body'); const y = b.scrollTop; current.build(b); current.update(); b.scrollTop = y; } }

  function setBadge(name, v) {
    const txt = v === true ? '!' : v ? String(v) : '';
    for (const b of document.querySelectorAll(`[data-open="${name}"] .badge`)) {
      if (b.textContent !== txt) b.textContent = txt;
      b.hidden = !txt;
    }
  }
  function updateBadges() {
    const s = S();
    let w = 0;
    for (const x of visibleWorkers()) if (G.workerCost(x, s.workers[x.id] || 0, 1) <= s.wood) w++;
    setBadge('workers', w);
    let u = 0;
    for (const x of D.UPGRADES) if (!G.upgMaxed(x) && G.upgCost(x) <= s.wood) u++;
    setBadge('upgrades', u);
    setBadge('gacha', s.tickets >= 10 || G.freeLeft() <= 0 ? 'FREE' : G.canPull(1) ? true : 0);
    const ready = s.missions.filter((m) => G.missionProgress(m) >= m.target).length;
    setBadge('quests', ready + (s.chests > 0 ? s.chests : 0));
    setBadge('ach', Math.max(0, Object.keys(s.ach).length - (s.achSeen || 0)));
    const g = G.spiritGain();
    setBadge('prestige', g > 0 && g >= Math.max(10, s.spirits * 0.5) ? true : 0);
    if (typeof GUI !== 'undefined') GUI.badges(setBadge);
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
    gacha: '🎰 オートガチャ <small>回転とレア運。ガチャLvでも伸びる</small>',
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
    rollspd: (s) => `基本 毎秒${s.rollBase.toFixed(1)}回`,
    luck: (s) => `基本の幸運 ×${s.luckBase.toFixed(2)}`,
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

  // --- ガチャタブ（オートガチャが主役。プレミアム・ショップ・セット・図鑑）
  const RLAB = (r) => D.RARITY[r].label || r;
  // ページ送りつきの一覧: filters = [[名前, 絞り込み関数], ...]
  const pageState = {};
  function paged(root, key, items, per, filters, renderItem, gridCls = 'axe-grid') {
    const wrap = el('div', 'paged');
    const st = pageState[key] || (pageState[key] = { p: 0, f: 0 });
    const chips = el('div', 'pg-chips');
    const nav = el('div', 'pg-nav');
    const grid = el('div', gridCls);
    const draw = () => {
      const list = filters ? items.filter(filters[st.f][1]) : items;
      const total = Math.max(1, Math.ceil(list.length / per));
      if (st.p >= total) st.p = total - 1;
      grid.innerHTML = '';
      for (const it of list.slice(st.p * per, st.p * per + per)) grid.appendChild(renderItem(it));
      nav.innerHTML = `<button type="button" class="pg-b" data-d="-1" ${st.p <= 0 ? 'disabled' : ''}>◀</button><span>${st.p + 1} / ${total}ページ ・ ${list.length}件</span><button type="button" class="pg-b" data-d="1" ${st.p >= total - 1 ? 'disabled' : ''}>▶</button>`;
      chips.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === st.f));
    };
    if (filters) {
      filters.forEach(([nm], i) => { const b = el('button', 'pg-chip', esc(nm)); b.type = 'button'; b.addEventListener('click', () => { st.f = i; st.p = 0; draw(); }); chips.appendChild(b); });
      wrap.appendChild(chips);
    }
    nav.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; st.p += Number(b.dataset.d); draw(); Sfx.buy(); });
    wrap.appendChild(grid);
    wrap.appendChild(nav);
    root.appendChild(wrap);
    draw();
    return wrap;
  }
  // 斧の必殺技・刀の奥義（カットインはどちらも同じ形）
  const skOf = (a) => (a && (D.SKILLS[a.id] || (typeof GD !== 'undefined' && GD.OUGI[a.id]))) || null;
  const seedOf = (a) => (a.kind === 'katana' ? 100 + GD.KATANAS.indexOf(a) : D.AXES.indexOf(a));
  const gdim = () => G.S.dim === 'germ';
  const oneIn = (p) => '1/' + (p >= 1 ? '1' : U.fmt(Math.round(1 / p)));
  const feed = []; // 最近の当たり
  function bonusText(b) { return Object.keys(b).map((k) => D.SP_TEXT[k](b[k])).join(' ・ '); }
  TABS.gacha = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      // オートガチャ
      const auto = el('div', 'auto-card');
      auto.innerHTML = `<div class="ac-top"><span class="ac-spin" aria-hidden="true">🎰</span><div><small>オートガチャ（ずっと回っている）</small><div class="ac-rate">毎秒 <b class="ac-r">0</b> 回転</div></div></div>` +
        `<div class="ac-boost"></div><div class="ac-stats"><span>🍀 幸運 <b class="ac-luck">×1</b></span><span>累計 <b class="ac-total">0</b>回</span><span>最高 <b class="ac-best">-</b></span></div>` +
        `<div class="ac-lv"><b>ガチャLv <span class="ac-glv">1</span></b><div class="bar"><i class="ac-gbar"></i></div><small class="ac-gxp"></small></div>` +
        `<div class="ac-feed"></div>`;
      root.appendChild(auto);
      // 確率表
      const tbl = el('details', 'rates', `<summary>レアの確率（いまの幸運で）</summary><table><tr><th>レア</th><th>基本</th><th>いま</th><th>持っている</th></tr>${D.RARITY_ORDER.slice().reverse().map((k) => `<tr><td><span class="rb r-${k}">${RLAB(k)}</span></td><td>${oneIn(D.RARITY[k].p)}</td><td class="now-${k}"></td><td>${D.AXES.filter((a) => a.r === k && s.axes[a.id]).length}/${D.AXES.filter((a) => a.r === k).length}</td></tr>`).join('')}</table><p>レアから順に「1/N × 幸運」で判定する。同じ斧を引くほど枚数が増え、枚数が2倍になるごとに Lv が上がる（上限なし）。幸運はガチャLv・強化・スタイルランク・ゴールデンタイム・お守りで上がり、回転はフィーバー（×2）・ランク・倍速・オイルで速くなる。離れている間も回る。</p>`);
      root.appendChild(tbl);
      // ピックアップ
      const pu = G.pickup();
      const hero = el('div', 'gacha-hero');
      hero.innerHTML = (pu ? `<button type="button" class="gh-pu r-${pu.r}" aria-label="ピックアップ: ${esc(pu.name)}"><span class="gh-pu-img">${FX.axeIcon(pu, 92)}</span><span class="gh-pu-txt"><small>本日のピックアップ</small><b>${esc(pu.name)}</b><span><span class="rb r-${pu.r}">${RLAB(pu.r)}</span> <em>出現率UP!</em></span><small class="gh-pu-left"></small></span></button>` : '') +
        `<div class="gh-title">プレミアムガチャ</div><div class="gh-fan">ジェムで引くと <b>幸運×${D.CFG.PREMIUM_LUCK}</b> ・ 10連はSR以上確定</div><div class="gh-pity"></div>`;
      root.appendChild(hero);
      if (pu) hero.querySelector('.gh-pu').addEventListener('click', () => axeDetail(pu, true));
      const btns = el('div', 'gacha-btns');
      btns.innerHTML = `<button type="button" class="pull pf"><span class="pl">無料1回</span><b class="pc"></b><small>${D.CFG.FREE_PULL_MIN}分ごと</small></button>` +
        `<button type="button" class="pull p1"><span class="pl">1回</span><b class="pc"></b></button>` +
        `<button type="button" class="pull p10"><span class="pl">10連</span><b class="pc"></b><small>${s.stats.pulls > 0 ? 'SR以上 1枠確定' : '初回は幻想の斧 1本確定!'}</small></button>`;
      root.appendChild(btns);
      btns.querySelector('.pf').addEventListener('click', () => doPull(1, true));
      btns.querySelector('.p1').addEventListener('click', () => doPull(1));
      btns.querySelector('.p10').addEventListener('click', () => doPull(10));
      // ジェムショップ
      root.appendChild(el('div', 'sec-title', `💎 ジェムショップ<span>効き目は時間制。重ねがけOK</span>`));
      const shop = el('div', 'shop-grid');
      for (const it of D.SHOP) {
        const b = el('button', 'shop-it', `<span class="si-ico">${it.icon}</span><b>${esc(it.name)}</b><small>${esc(it.desc)}</small><em>💎${it.gems}</em>`);
        b.type = 'button';
        b.dataset.id = it.id;
        b.addEventListener('click', () => {
          const r = G.buyShop(it.id);
          if (r.error === 'gems') { toast('💎', 'ジェムが足りない', 'ボス・実績・ガチャLvで集めよう'); Sfx.error(); failShake(b); return; }
          if (r.error === 'dim') { toast('☣️', '菌斬り次元で使う', 'ボス戦・大発生の最中は使えない'); Sfx.error(); failShake(b); return; }
          if (r.ok) { Sfx.unlockFx(); sparkAt(b, '#5ee8ff'); toast(it.icon, `${it.name}！`, it.desc, 'gold'); }
        });
        shop.appendChild(b);
      }
      root.appendChild(shop);
      // セット（シリーズ）: そろえた数が多い順
      const done = G.setsDone();
      root.appendChild(el('div', 'sec-title', `🗂️ 斧のセット・シリーズ <b>${done.length}/${D.SETS.length}</b><span>そろえると永続ボーナス</span>`));
      const setsSorted = D.SETS.slice().sort((a, b) => b.axes.filter((id) => s.axes[id]).length / b.axes.length - a.axes.filter((id) => s.axes[id]).length / a.axes.length);
      paged(root, 'sets', setsSorted, 8, [['すべて', () => true], ['そろった', (x) => x.axes.every((id) => s.axes[id])], ['あと少し', (x) => { const h = x.axes.filter((id) => s.axes[id]).length; return h < x.axes.length && h >= x.axes.length * 0.5; }]], (set) => {
        const have = set.axes.filter((id) => s.axes[id]).length;
        const ok = have === set.axes.length;
        const row = el('div', `set-row${ok ? ' done' : ''}`);
        row.innerHTML = `<div class="set-h"><b>${set.icon} ${esc(set.name)}</b><span>${have}/${set.axes.length}</span></div><div class="set-axes">${set.axes.map((id) => { const a = G.AX[id]; return `<span class="set-ax${s.axes[id] ? ' own' : ''} r-${a.r}" title="${esc(a.name)}">${FX.itemIcon(a, 30)}</span>`; }).join('')}</div><div class="set-b">${ok ? '✅ ' : ''}${esc(bonusText(set.bonus))}</div>`;
        return row;
      }, 'set-list');
      // 図鑑
      const owned = Object.keys(s.axes).length;
      const st = G.stats();
      const fan = D.AXES.filter((a) => a.fantasy);
      const fanOwned = fan.filter((a) => s.axes[a.id]).length;
      root.appendChild(el('div', 'sec-title', `斧コレクション <b>${owned}/${D.AXES.length}</b><span>幻想 ${fanOwned}/${fan.length} ・ 所持ボーナス 全ダメージ +${fmt(Math.round((st.axeMult - 1) * 100))}%</span>`));
      const order = D.RARITY_ORDER.slice().reverse();
      const axes = D.AXES.slice().sort((a, b) => order.indexOf(a.r) - order.indexOf(b.r) || (b.fantasy ? 1 : 0) - (a.fantasy ? 1 : 0));
      const RI = G.RANK;
      paged(root, 'axes', axes, 48, [['すべて', () => true], ['持っている', (a) => s.axes[a.id]], ['未入手', (a) => !s.axes[a.id]], ['SSR以上', (a) => RI[a.r] >= 3], ['MYTH以上', (a) => RI[a.r] >= 7], ['幻想', (a) => a.fantasy]], (a) => {
        const n = s.axes[a.id] || 0;
        const lv = G.lvOf(n);
        const b = el('button', `axe-card r-${a.r}${n ? ' owned' : ''}${s.equip === a.id ? ' eq' : ''}${a.fantasy ? ' fan' : ''}`);
        b.type = 'button';
        b.innerHTML = `<span class="ac-r">${RLAB(a.r)}${a.fantasy ? '<i class="ac-fan">幻</i>' : ''}</span><div class="ac-icon">${n ? FX.itemIcon(a, 50) : FX.axeIconSVG(Object.assign({}, a, { glow: null, blade: ['#3a3a4a', '#1a1a24'], handle: '#2a2a32' }), 50)}</div><div class="ac-name">${n ? esc(a.name) : '？？？'}</div><div class="ac-lv">${n ? `Lv${lv} <small>×${fmt(n)}</small>` : oneIn(D.RARITY[a.r].p)}</div>${s.equip === a.id ? '<span class="ac-eq">装備中</span>' : ''}`;
        if (n) b.addEventListener('click', () => axeDetail(a));
        else b.disabled = true;
        return b;
      });
      Object.assign(this, {
        pf: btns.querySelector('.pf'), p1: btns.querySelector('.p1'), p10: btns.querySelector('.p10'), pity: hero.querySelector('.gh-pity'), puLeft: hero.querySelector('.gh-pu-left'),
        aR: auto.querySelector('.ac-r'), aLuck: auto.querySelector('.ac-luck'), aTotal: auto.querySelector('.ac-total'), aBest: auto.querySelector('.ac-best'), aBoost: auto.querySelector('.ac-boost'),
        aGlv: auto.querySelector('.ac-glv'), aGbar: auto.querySelector('.ac-gbar'), aGxp: auto.querySelector('.ac-gxp'), aFeed: auto.querySelector('.ac-feed'), tbl, shop, feedN: -1,
      });
    },
    update() {
      const s = S(), T = G.T;
      const set = (b, n, cost) => {
        const t = s.tickets >= n;
        b.querySelector('.pc').textContent = t ? `🎫×${n}` : `💎${cost}`;
        b.classList.toggle('can', t || s.gems >= cost);
        b.classList.toggle('free', t);
      };
      set(this.p1, 1, D.CFG.GACHA_1);
      set(this.p10, 10, D.CFG.GACHA_10);
      const fl = G.freeLeft();
      this.pf.querySelector('.pc').textContent = fl <= 0 ? 'FREE!' : U.fmtClock(fl);
      this.pf.classList.toggle('can', fl <= 0);
      this.pf.classList.toggle('free', fl <= 0);
      const left = G.stats().pity - s.pity;
      this.pity.innerHTML = `SSR以上確定まで あと <b>${Math.max(1, left)}</b> 回`;
      if (this.puLeft) {
        const t = Math.ceil(G.pickupLeft());
        this.puLeft.textContent = `入れ替わりまで ${Math.floor(t / 3600)}時間${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}分`;
      }
      // オートガチャの状態
      const rate = G.rollRate(), luck = G.luckNow();
      this.aR.textContent = rate < 100 ? rate.toFixed(1) : fmt(rate);
      this.aLuck.textContent = `×${luck.toFixed(2)}`;
      this.aTotal.textContent = fmt(s.stats.rolls || 0);
      const br = D.RARITY_ORDER[s.stats.bestRoll || 0];
      const ba = s.stats.bestRollAxe && G.AX[s.stats.bestRollAxe];
      this.aBest.innerHTML = ba ? `<span class="rb r-${br}">${RLAB(br)}</span> ${esc(ba.name)}` : '-';
      const boosts = [];
      if (T.fever > 0) boosts.push('🌈フィーバー ×2');
      if (T.rank > 0) boosts.push(`STYLE ${D.STYLE.RANKS[T.rank].id} 回転×${(1 + 0.1 * T.rank).toFixed(1)} 幸運×${(1 + 0.06 * T.rank).toFixed(2)}`);
      if (G.gameSpeed() > 1) boosts.push(`⏩ ×${G.gameSpeed()}`);
      if (T.golden > 0) boosts.push('✨ゴールデン 幸運×2');
      if (G.buffOf('roll') > 1) boosts.push(`⚙️オイル ×${G.buffOf('roll')}`);
      if (G.buffOf('luck') > 1) boosts.push(`🍀お守り ×${G.buffOf('luck')}`);
      this.aBoost.textContent = boosts.length ? boosts.join('  ') : '斬り続けるとランクが上がって回転と幸運がブースト';
      const need = G.gachaNeed(s.gachaLv || 1);
      this.aGlv.textContent = String(s.gachaLv || 1);
      this.aGbar.style.transform = `scaleX(${U.clamp((s.gachaXp || 0) / need, 0, 1)})`;
      this.aGxp.textContent = `${fmt(s.gachaXp || 0)}/${fmt(need)}`;
      if (this.feedN !== feed.length) {
        this.feedN = feed.length;
        this.aFeed.innerHTML = feed.slice(0, 8).map((o) => `<div class="fd r-${o.r}"><span class="rb r-${o.r}">${RLAB(o.r)}</span><b>${esc(o.axe.name)}</b><small>${o.isNew ? 'NEW!' : o.lvUp ? `Lv${o.lv}↑` : '+1'}</small></div>`).join('') || '<div class="fd-empty">UR以上や新しい斧が出るとここに並ぶ</div>';
      }
      for (const k of D.RARITY_ORDER) {
        const c = this.tbl.querySelector('.now-' + k);
        if (c) c.textContent = oneIn(Math.min(1, D.RARITY[k].p * luck));
      }
      this.shop.querySelectorAll('.shop-it').forEach((b) => { const it = D.SHOP.find((x) => x.id === b.dataset.id); b.classList.toggle('can', s.gems >= it.gems); });
    },
  };
  const spText = (a, lv) => (a.sp ? Object.keys(a.sp).map((k) => D.SP_TEXT[k](a.sp[k] * (1 + 0.2 * (Math.max(1, lv) - 1)))).join(' / ') : 'なし');
  function axeDetail(a, preview) {
    const s = S();
    const n = s.axes[a.id] || 0;
    const lv = G.lvOf(n);
    const R = D.RARITY[a.r];
    const tapM = R.tap * (1 + 0.1 * (Math.max(1, lv) - 1));
    const body = el('div', 'axe-detail');
    body.innerHTML = `<div class="ad-icon r-${a.r}">${FX.axeIcon(a, 132)}</div>` +
      (a.fantasy ? '<div class="ad-fan">✦ 幻想の斧 ✦</div>' : '') +
      `<p class="ad-desc">${esc(a.desc)}</p>` +
      `<dl><dt>レア</dt><dd><span class="rb r-${a.r}">${RLAB(a.r)}</span> ${oneIn(R.p)}</dd>` +
      `<dt>Lv</dt><dd>${n ? `Lv${lv}（${fmt(n)}枚・次のLvまで あと${fmt(Math.pow(2, lv) - n)}枚）` : '未所持'}</dd>` +
      `<dt>装備時タップ</dt><dd>×${tapM.toFixed(2)}</dd><dt>装備時特性</dt><dd>${esc(spText(a, lv))}</dd>` +
      (D.SKILLS[a.id] ? `<dt>必殺技</dt><dd>「${esc(D.SKILLS[a.id].name)}」 ${D.SKILL_TIER[a.r].need}ゲージで発動・斬撃×${D.SKILL_TIER[a.r].mult}</dd>` : '') +
      `<dt>所持ボーナス</dt><dd>全ダメージ +${(R.pas * Math.max(1, lv) * 100).toFixed(1)}%${n ? '' : '（入手時）'}</dd></dl>`;
    const isEq = s.equip === a.id;
    const buttons = preview && !n ? [{ text: '閉じる', cls: 'primary' }] : [
      { text: isEq ? '装備中' : '装備する', cls: 'primary', disabled: isEq || !n, onClick: () => { G.equip(a.id); rebuild(); } },
      { text: '閉じる' },
    ];
    modal({ title: a.name, body, cls: 'r-' + a.r, buttons });
  }

  // ------------------------------------------------------------- 斧ごとのカットイン（ガチャで出たとき・必殺技）
  // 画面を止めない帯。get = ガチャで出た（順番待ち）、skill = 必殺技（すぐ出す）
  const ciQ = [];
  let ciBusy = false;
  function cutIn(a, mode, o = {}) {
    if (!a || !skOf(a)) return;
    if (mode === 'skill') { playCutIn(a, mode, o); return; }
    if (ciQ.length >= 3) ciQ.shift();
    ciQ.push({ a, mode, o });
    if (!ciBusy) nextCut();
  }
  function nextCut() {
    const it = ciQ.shift();
    if (!it) { ciBusy = false; return; }
    ciBusy = true;
    playCutIn(it.a, it.mode, it.o, nextCut);
  }
  function cutInHTML(a, mode, o) {
    const sk = skOf(a), R = D.RARITY[a.r];
    const motifs = Array.from({ length: 8 }, (_, i) => `<i style="--d:${(i * 0.13).toFixed(2)}s;--y:${(i * 37) % 90}%">${sk.motif}</i>`).join('');
    const txt = mode === 'skill'
      ? `<small>${a.kind === 'katana' ? '奥義' : '必殺技'}</small><b class="ci-name">${esc(sk.name)}</b><span class="ci-line">${esc(a.name)}</span>`
      : `<div class="ci-top"><span class="rb r-${a.r}">${RLAB(a.r)}</span>${o.isNew ? '<em class="ci-new">NEW!!</em>' : o.lvUp ? `<em class="ci-new">Lv${o.lv}↑</em>` : ''}<small>${oneIn(R.p)}</small></div><b class="ci-name">${esc(a.name)}</b><span class="ci-line">「${esc(sk.line)}」</span>`;
    return `<div class="ci-band"><div class="ci-pat"></div><div class="ci-motif">${motifs}</div><div class="ci-img">${FX.axeIcon(a, mode === 'skill' ? 120 : 150)}</div><div class="ci-txt">${txt}</div><div class="ci-stamp">${esc(sk.stamp)}</div></div>`;
  }
  function ciVars(e, a) {
    e.style.setProperty('--c1', a.blade[0]);
    e.style.setProperty('--c2', a.blade[1]);
    e.style.setProperty('--cg', a.glow && a.glow !== 'rainbow' ? a.glow : '#ffffff');
  }
  function playCutIn(a, mode, o, done) {
    const root = $('#cutins');
    if (!root) { if (done) done(); return; }
    if (mode === 'skill') root.querySelectorAll('.ci-skill').forEach((x) => x.remove());
    const sk = skOf(a);
    const e = el('div', `cutin ci-${mode} pat-${sk.pat}${a.glow === 'rainbow' ? ' rbw' : ''} r-${a.r}`, cutInHTML(a, mode, o || {}));
    ciVars(e, a);
    const dur = mode === 'skill' ? 1050 : 1900;
    e.style.setProperty('--dur', dur + 'ms');
    root.appendChild(e);
    if (mode !== 'skill') { Sfx.cutin(G.RANK[a.r], seedOf(a)); Sfx.vibrate(G.RANK[a.r] >= 4 ? [15, 25, 30] : 12); }
    setTimeout(() => { e.remove(); if (done) done(); }, dur);
  }

  // ------------------------------------------------------------- オートガチャの当たり: 小さなカードと、超レアの演出
  const cardQ = [];
  let cardLive = 0;
  function rareCard(o) {
    if (cardQ.length > 6) cardQ.splice(0, cardQ.length - 6);
    cardQ.push(o);
    pumpCards();
  }
  function pumpCards() {
    const root = $('#rare-cards');
    if (!root) return;
    while (cardQ.length && cardLive < 2 && !overlayBusy) {
      const o = cardQ.shift();
      cardLive++;
      const c = el('div', `rare-card r-${o.r}`, `<span class="rc-img">${FX.axeIcon(o.axe, 46)}</span><span class="rc-t"><span><span class="rb r-${o.r}">${RLAB(o.r)}</span> <small>${oneIn(D.RARITY[o.r].p)}</small></span><b>${esc(o.axe.name)}</b><em>${o.isNew ? 'NEW!' : o.lvUp ? `Lv${o.lv} に上がった` : `${fmt(o.copies)}枚目`}</em></span>`);
      root.appendChild(c);
      Sfx.gachaReveal(o.r);
      setTimeout(() => { c.classList.add('out'); setTimeout(() => { c.remove(); cardLive--; pumpCards(); }, 300); }, 2400);
    }
  }
  // LR 以上: 画面いっぱいに一瞬だけ見せる（タップで閉じる・自動で閉じる）
  const cutQ = [];
  function cutscene(o) {
    cutQ.push(o);
    if (cutQ.length === 1) playCut();
  }
  function playCut() {
    const o = cutQ[0];
    if (!o) return;
    if (overlayBusy || modalCur) { setTimeout(playCut, 600); return; }
    const rk = G.RANK[o.r];
    overlayBusy = true;
    const sk = skOf(o.axe);
    const ov = el('div', `cut-ov r-${o.r}${rk >= 7 ? ' myth' : ''}${sk ? ' pat-' + sk.pat : ''}`);
    ciVars(ov, o.axe);
    ov.innerHTML = `${sk ? '<div class="ci-pat full"></div>' : ''}<div class="gs-rays"></div>${sk ? `<div class="ci-stamp full">${esc(sk.stamp)}</div>` : ''}<div class="cut-in"><div class="cut-odds">${oneIn(D.RARITY[o.r].p)}</div><div class="gs-rar"><span class="rb r-${o.r}">${RLAB(o.r)}</span>${o.isNew ? '<span class="gs-tag pu">NEW</span>' : ''}</div><div class="gs-img">${FX.axeIcon(o.axe, 210)}</div><div class="gs-name">${esc(o.axe.name)}</div>${sk ? `<div class="gs-line">「${esc(sk.line)}」</div>` : ''}<div class="gs-desc">${o.isNew ? esc(o.axe.desc) : o.lvUp ? `Lv${o.lv} に上がった！` : `${fmt(o.copies)}枚目`}</div>${sk ? `<div class="gs-sk">${o.axe.kind === 'katana' ? '奥義' : '必殺技'}「${esc(sk.name)}」</div>` : ''}</div>`;
    document.body.appendChild(ov);
    Sfx.showcase(o.r);
    if (sk) Sfx.cutin(rk, seedOf(o.axe));
    Sfx.vibrate(rk >= 7 ? [40, 40, 80] : [20, 30, 40]);
    FX.confetti(rk >= 7 ? 220 : rk >= 6 ? 160 : 100);
    FX.addFlash(rk >= 7 ? 0.7 : 0.4, rk >= 7 ? '255,255,255' : '255,240,200');
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      ov.classList.add('out');
      setTimeout(() => { ov.remove(); overlayBusy = false; cutQ.shift(); pumpCards(); if (cutQ.length) setTimeout(playCut, 250); }, 250);
    };
    ov.addEventListener('click', close);
    setTimeout(close, rk >= 7 ? 3400 : rk >= 6 ? 2600 : 2000);
  }
  // 画面を止める演出は「初めての LR 以上」と「MYTH 以上」だけ。続けて出すぎないように間をあける
  let lastCut = 0;
  const kfeed = []; // 刀ガチャの最近の当たり
  function onAutoRoll(d) {
    const fd = d.kind === 'katana' ? kfeed : feed;
    for (const o of d.notable) {
      fd.unshift(o);
      if (fd.length > 30) fd.length = 30;
      const rk = G.RANK[o.r];
      if (blocked() && !overlayBusy) continue;
      const now = performance.now();
      if ((rk >= 7 || (rk >= 5 && o.isNew)) && (rk >= 8 || now - lastCut > 6000) && cutQ.length < 3) { lastCut = now; cutscene(o); }
      else if (rk >= 3 && (o.isNew || o.lvUp)) cutIn(o.axe, 'get', o);
      else if (rk >= 4 || o.isNew) rareCard(o);
    }
  }

  function doPull(n, free) {
    if (overlayBusy) return;
    const r = G.pull(n, { free: !!free });
    if (r.error) {
      if (r.error === 'gems') toast('💎', 'ジェムが足りない', 'ボス・ミッション・実績・宝箱で集めよう');
      if (r.error === 'free') toast('🎰', 'まだ無料ガチャは引けない', `あと ${U.fmtClock(G.freeLeft())}`);
      Sfx.error();
      return;
    }
    if (S().tut === 2) S().tut = 3;
    gachaShow(r.res, n, free);
  }
  // ガチャ演出: 光の色が 青→紫→金→虹→白→（暗転） と昇格していき、SSR以上は1本ずつ大きく見せる
  let r0Free = false;
  const STEP = { N: 0, R: 0, SR: 1, SSR: 2, UR: 3, LR: 4, EX: 5, MYTH: 5, GOD: 5, OMEGA: 5 };
  const HYPE = ['', 'キラッ…', '金色の光…！', '虹色！？ 激アツ!!', 'LEGEND…!!!', '？？？？？'];
  function gachaShow(res, n, free) {
    r0Free = !!free;
    overlayBusy = true;
    const rank = (r) => G.RANK[r];
    const spd = Math.max(1, G.gameSpeed());
    const ms = (t) => t / spd;
    const top = res.reduce((m, o) => (rank(o.r) > rank(m) ? o.r : m), 'N');
    let target = STEP[top];
    for (const o of res) FX.axeIcon(o.axe, 8); // 絵を先に作っておく
    // 新しい幻想の斧は低いレアでも1本ずつ見せるので、少なくとも紫の光までは昇格させる
    const fanNew = res.some((o) => o.axe.fantasy && o.isNew);
    if (fanNew && target < 1) target = 1;
    const ov = el('div', `gacha-ov lv-0 top-${top}`);
    ov.style.setProperty('--gs', String(spd));
    ov.innerHTML = `<div class="g-stage"><div class="g-portal"><div class="g-rays"></div><div class="g-ring"></div><div class="g-core">🪓</div></div><div class="g-hype"></div><div class="g-skip">タップでスキップ</div></div>`;
    document.body.appendChild(ov);
    Sfx.gachaRoll((0.9 + target * 0.55) / spd);
    const timers = [];
    let lvNow = 0, revealed = false;
    const setLv = (k) => {
      ov.classList.remove('lv-' + lvNow);
      lvNow = k;
      ov.classList.add('lv-' + k);
      const h = ov.querySelector('.g-hype');
      if (h) h.textContent = HYPE[k];
    };
    const up = (k) => {
      setLv(k);
      Sfx.gachaUp(k);
      Sfx.vibrate(k >= 3 ? [20, 30, 40] : 15);
      FX.addFlash(k >= 5 ? 0.85 : 0.22 + k * 0.08, k >= 5 ? '0,0,0' : k >= 3 ? '255,180,240' : k >= 2 ? '255,220,120' : '200,160,255');
      const p = ov.querySelector('.g-portal');
      if (p) { p.classList.remove('pop'); void p.offsetWidth; p.classList.add('pop'); }
      if (k >= 5) ov.classList.add('crack');
    };
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      timers.forEach(clearTimeout);
      if (lvNow < target) setLv(target);
      ov.classList.add('reveal');
      const grid = el('div', `g-cards n${n}`);
      const step = n > 1 ? 110 / spd : 0;
      res.forEach((o, i) => {
        const c = el('div', `g-card r-${o.r}${o.axe.fantasy ? ' fan' : ''}`);
        c.style.animationDelay = `${(i * step) / 1000}s`;
        c.innerHTML = `<div class="gc-in"><span class="gc-r">${RLAB(o.r)}</span>${o.pickup ? '<span class="gc-pu">UP</span>' : o.axe.fantasy ? '<span class="gc-fan">幻</span>' : ''}${FX.axeIcon(o.axe, n > 1 ? 54 : 124)}<div class="gc-name">${esc(o.axe.name)}</div>` +
          `<div class="gc-tag">${o.isNew ? '<b class="new">NEW!</b>' : o.lvUp ? `<b class="lvup">Lv${o.lv}↑</b>` : `<b class="cv">×${fmt(o.copies)}</b>`}</div></div>`;
        grid.appendChild(c);
        setTimeout(() => {
          Sfx.gachaReveal(o.r);
          if (rank(o.r) >= 3) {
            const r = c.getBoundingClientRect();
            FX.burst(r.left + r.width / 2, r.top + r.height / 2, 30, { speed: 320, col: rank(o.r) >= 4 ? undefined : '#ffd84a' });
          }
        }, i * step + 250 / spd);
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
      if (r0Free) again.textContent = `もう1回（💎${D.CFG.GACHA_1}）`;
      again.addEventListener('click', () => { close(); doPull(n); });
      // SSR以上は1本ずつ大きく見せる（レアの低い順に、最後が一番いい斧）
      const shows = res.filter((o) => rank(o.r) >= 3 || (o.axe.fantasy && o.isNew)).sort((a, b) => rank(a.r) - rank(b.r));
      if (shows.length) {
        btns.classList.add('wait');
        const next = () => {
          const o = shows.shift();
          if (!o || !ov.isConnected) { btns.classList.remove('wait'); return; }
          showcase(ov, o, next);
        };
        setTimeout(next, n > 1 ? res.length * step + 520 / spd : 420 / spd);
      }
    };
    for (let k = 1; k <= target; k++) timers.push(setTimeout(() => up(k), ms(650 + (k - 1) * 560)));
    timers.push(setTimeout(reveal, ms(1000 + target * 560 + (target >= 5 ? 700 : 0))));
    ov.addEventListener('click', (e) => { if (!revealed && !e.target.closest('.btn')) reveal(); });
  }
  function showcase(ov, o, done) {
    const a = o.axe;
    const rk = rank6(o.r);
    const sk = D.SKILLS[a.id];
    const box = el('div', `g-show r-${o.r}${a.fantasy ? ' fan' : ''}${sk ? ' pat-' + sk.pat : ''}`);
    ciVars(box, a);
    box.innerHTML = `${sk ? '<div class="ci-pat full"></div>' : ''}<div class="gs-rays"></div>${sk ? `<div class="ci-stamp full">${esc(sk.stamp)}</div>` : ''}<div class="gs-in">` +
      `<div class="gs-rar"><span class="rb r-${o.r}">${RLAB(o.r)}</span>${a.fantasy ? '<span class="gs-tag fan">幻想の斧</span>' : ''}${o.pickup ? '<span class="gs-tag pu">PICKUP</span>' : ''}</div>` +
      `<div class="gs-img">${FX.axeIcon(a, 210)}</div><div class="gs-name">${esc(a.name)}</div>${sk ? `<div class="gs-line">「${esc(sk.line)}」</div>` : ''}<div class="gs-desc">${esc(a.desc)}</div>${sk ? `<div class="gs-sk">必殺技「${esc(sk.name)}」</div>` : ''}` +
      `<div class="gs-sp">✦ ${esc(spText(a, o.lv))}</div><div class="gs-new">${o.isNew ? 'NEW!!' : o.lvUp ? `Lv${o.lv} にアップ!` : `${fmt(o.copies)}枚目`}</div><div class="gs-btns"></div></div>`;
    const bb = box.querySelector('.gs-btns');
    if (S().equip !== a.id) {
      const eb = el('button', 'btn primary', '装備する');
      eb.type = 'button';
      eb.addEventListener('click', (e) => { e.stopPropagation(); G.equip(a.id); eb.disabled = true; eb.textContent = '装備した！'; Sfx.equip(rk); });
      bb.appendChild(eb);
    } else bb.appendChild(el('span', 'gs-eq', '装備中'));
    const nb = el('button', 'btn', '次へ');
    nb.type = 'button';
    let closed = false;
    const close = () => { if (closed) return; closed = true; box.classList.add('out'); setTimeout(() => { box.remove(); done(); }, 220); };
    nb.addEventListener('click', (e) => { e.stopPropagation(); close(); });
    box.addEventListener('click', (e) => { if (!e.target.closest('.btn')) close(); });
    bb.appendChild(nb);
    ov.appendChild(box);
    Sfx.showcase(o.r);
    if (sk) Sfx.cutin(rk, D.AXES.indexOf(a));
    Sfx.vibrate(rk >= 4 ? [30, 40, 60] : 20);
    FX.confetti(rk >= 5 ? 200 : rk >= 4 ? 140 : 70);
    FX.addFlash(rk >= 5 ? 0.6 : 0.35, rk >= 6 ? '255,120,220' : '255,255,255');
  }
  const rank6 = (r) => G.RANK[r] || 0;

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
      root.appendChild(el('div', 'tab-head', `<div class="tab-stat">実績 <b>${n}/${D.ACH.length}</b></div><div class="tab-stat">ボーナス 両方の世界の全ダメージ <b>+${fmt(Math.round((G.stats().achMult - 1) * 100))}%</b></div>`));
      const cat = (a) => a.cat || (a.germ ? '菌斬り' : '基本');
      const CATS = ['基本', '菌斬り', '世界', '図鑑', '記録'];
      const filt = [['すべて', () => true], ['未達成', (a) => !s.ach[a.id]]].concat(CATS.map((c) => [`${c} ${D.ACH.filter((a) => cat(a) === c && s.ach[a.id]).length}/${D.ACH.filter((a) => cat(a) === c).length}`, (a) => cat(a) === c]));
      paged(root, 'ach', D.ACH, 60, filt, (a) => {
        const got = !!s.ach[a.id];
        return el('div', `ach${got ? ' got' : ''}`, `<span class="a-ico">${got ? a.icon : '🔒'}</span><b>${got ? esc(a.name) : '？？？'}</b><small>${esc(a.desc)}</small><em>💎${a.gems}</em>`);
      }, 'ach-grid');
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
      if (typeof GD !== 'undefined') {
        const open = G.germOpen();
        const gb = el('div', `germ-gate-card${open ? ' open' : ''}`, `<div class="ggc-ring" aria-hidden="true"></div><b>🧫 菌斬り次元</b><p>${open ? '刀で菌を斬るもう一つの世界。変異因子で買う「変異」は森にも効く。' : `転生${GD.CFG.UNLOCK_PRESTIGE}回で開く。刀で菌を斬るもう一つの世界へ行けるようになる。`}</p>${open ? '<button type="button" class="btn primary">次元を移動する</button>' : '<span class="ggc-lock">🔒 転生すると開く</span>'}`);
        const b = gb.querySelector('button');
        if (b) b.addEventListener('click', () => { closeDrawer(); if (typeof GUI !== 'undefined') GUI.travel('germ'); });
        root.appendChild(gb);
      }
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

  // 1回目の転生のあと: 新しい次元が開いた
  function germUnlockModal() {
    if (typeof GUI === 'undefined') return;
    modal({
      title: '🧫 新しい次元が開いた！',
      body: `<div class="gu-ring" aria-hidden="true"></div><p><b class="hl">菌斬り次元</b>へ行けるようになった。</p><p>刀をドラッグして、ただよう菌を斬る。一振りで何体も斬ると<b>一閃</b>。ボスの病原体を倒すと<b>🧪変異因子</b>が手に入り、「変異」で森の木こりや斧ガチャも強くなる。</p><p class="muted">左上の 🧫 ボタンでいつでも行き来できる。</p>`,
      buttons: [{ text: '菌斬り次元へ！', cls: 'primary', onClick: () => GUI.travel('germ') }, { text: 'あとで' }],
    });
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
    while (toastQ.length && root.children.length < 2 && !overlayBusy) {
      const t = toastQ.shift();
      const e = el('div', `toast ${t.cls}`, `<span class="t-ico">${t.icon}</span><div><b>${esc(t.title)}</b>${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</div>`);
      root.appendChild(e);
      setTimeout(() => { e.classList.add('out'); setTimeout(() => { e.remove(); pumpToasts(); }, 300); }, toastQ.length > 3 ? 1400 : 2600);
    }
  }
  const BANNER_PRI = { god: 9, unlock: 8, win: 8, area: 7, boss: 7, fever: 6, 'rare-rainbow': 6, fail: 5, 'rare-gold': 4, combo: 3, 'rare-silver': 2, ms: 3, speed: 2 };
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
    else if (s.tut === 1 && s.wood >= 15) h = '🪵 木材がたまった！下のカードをタップして木こりを雇え';
    else if (s.tut === 2 && s.tickets >= 10) h = '🎰 無料10連ガチャが引ける！左の【ガチャ】へ';
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
    G.T.speedCap = night ? 1 : 3;
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
      row('BGM（ランクで盛り上がる）', tog('bgm')) +
      row('音量', `<input type="range" id="set-vol" min="0" max="1" step="0.05" value="${st.vol}" aria-label="音量">`) +
      row('バイブ', tog('vibe')) +
      row('エフェクト', seg('fx', [[0, '少'], [1, '普'], [2, '多']])) +
      row('画面揺れ', tog('shake')) +
      row('フラッシュ', tog('flash')) +
      row('数字表記', seg('num', [['jp', '万億兆'], ['en', 'K M B'], ['sci', '1e10']])) +
      row('夜ふかしガード', tog('night')) +
      `<p class="muted small">夜ふかしガード: 22時以降は演出を抑えて画面を暖色に、23時以降は寝るよう促す。</p>` +
      `<div class="set-sec">この端末のセーブ</div><p class="muted small">セーブはこの端末のこのブラウザの中だけに保存される（端末ID <b>${esc(deviceId())}</b>）。スマホとPCなど端末ごとに別々のデータで遊べる。データを別の端末へ移すときは「書き出し」→ 移したい端末で「読み込み」。</p>` +
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
          if (b.dataset.armed) { G.hardReset(); applySettings(); disp.wood = 0; closeDrawer(); if (modalCur) modalCur.close(); toast('🧹', 'データを消した'); }
          else { b.dataset.armed = '1'; b.textContent = '本当に消す（元に戻せない）'; }
          break;
      }
    });
    body.addEventListener('input', (e) => {
      if (e.target.id === 'set-vol') { st.vol = Number(e.target.value); applySettings(); }
    });
    modal({ title: '⚙️ 設定', body, cls: 'settings-modal', buttons: [{ text: '閉じる', onClick: () => G.save() }] });
  }

  // 端末ごとのID（セーブとは別に保存。表示用）
  function deviceId() {
    const K = 'dopadopa-kikori-device';
    try {
      let id = localStorage.getItem(K);
      if (!id) { id = Math.random().toString(36).slice(2, 6).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(); localStorage.setItem(K, id); }
      return id;
    } catch (e) { return '保存できない環境'; }
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
    let achBatch = [], achT = null;
    const flushAch = () => {
      achT = null;
      const b = achBatch;
      achBatch = [];
      if (b.length <= 2) b.forEach((a) => toast(a.icon, `実績解除: ${a.name}`, `${a.desc} ・ 💎+${a.gems}`, 'ach'));
      else toast('🏆', `実績 ×${b.length} 解除!!`, `${b.slice(0, 3).map((a) => a.name).join('・')}… ・ 💎+${b.reduce((x, a) => x + a.gems, 0)}`, 'ach');
      Sfx.ach();
    };
    G.on('ach', (a) => { achBatch.push(a); if (!achT) achT = setTimeout(flushAch, 450); });
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
      if (d.sec < 120) { if (d.sec >= 15 && d.gain > 0) toast('🪵', `+${fmt(d.gain)} 木材`, `離席中（${U.fmtTime(d.sec)}）${d.rolls ? ` ・ 🎰${fmt(d.rolls.n)}回` : ''}`); return; }
      const body = el('div', 'offline');
      const ro = d.rolls;
      let rollHtml = '';
      if (ro && ro.n > 0) {
        const parts = D.RARITY_ORDER.map((k, i) => [k, ro.counts[i]]).filter(([k, n]) => n > 0 && G.RANK[k] >= 3).reverse();
        const news = ro.notable.filter((o) => o.isNew).slice(0, 6);
        rollHtml = `<div class="off-rolls"><p>🎰 その間にガチャが <b>${fmt(ro.n)}回</b> まわった</p><div class="off-r">${parts.map(([k, n]) => `<span><span class="rb r-${k}">${RLAB(k)}</span>×${fmt(n)}</span>`).join('')}</div>` +
          (news.length ? `<div class="off-new">${news.map((o) => `<span class="r-${o.r}" title="${esc(o.axe.name)}">${FX.axeIcon(o.axe, 40)}<small>NEW</small></span>`).join('')}</div>` : '') + '</div>';
        for (const o of ro.notable) { feed.unshift(o); }
        if (feed.length > 30) feed.length = 30;
      }
      const gm = d.germ;
      const germHtml = gm && gm.dna > 0 ? `<p class="off-germ">🧫 菌斬り次元では免疫細胞が戦った: <b>🧬+${fmt(gm.dna)}</b>${gm.krolls ? ` ・ 刀ガチャ ${fmt(gm.krolls.n)}回` : ''}</p>` : '';
      body.innerHTML = `<p>${U.fmtTime(d.sec)}の間に木こり達が働いた（効率 ${Math.round(d.eff * 100)}%）</p><div class="big-num wood-num">+0</div>` +
        (d.slept ? `<p class="sleep-bonus">😴 睡眠ボーナス ×${D.CFG.SLEEP_BONUS}！ よく寝た。</p>` : '') + rollHtml + germHtml;
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
    G.on('equip', () => { if (tab === 'upgrades' || tab === 'gacha') rebuild(); });
    G.on('autoRoll', onAutoRoll);
    G.on('kRoll', onAutoRoll);
    G.on('germUnlock', () => setTimeout(germUnlockModal, 2600));
    G.on('skill', () => { const b = $('#skill-box'); if (b) { b.classList.remove('fire'); void b.offsetWidth; b.classList.add('fire'); } });
    G.on('setDone', (set) => {
      banner('セット完成!!', `${set.icon} ${set.name} ・ ${bonusText(set.bonus)}`, 'unlock');
      toast(set.icon, `セット完成: ${set.name}`, bonusText(set.bonus), 'gold');
      Sfx.unlockFx();
      FX.confetti(90);
      if (tab === 'gacha') rebuild();
    });
    G.on('gachaLevel', (d) => {
      toast('🎰', `ガチャLv ${d.lv}!`, `回転 +${D.CFG.GLV_ROLL}/秒 ・ 幸運 +${Math.round(D.CFG.GLV_LUCK * 100)}% ・ 💎+${d.gems}${d.tickets ? ` ・ 🎫+${d.tickets}` : ''}`, 'gold');
      Sfx.levelUp();
      const r = $('#roll-strip');
      if (r) { r.classList.remove('lvup'); void r.offsetWidth; r.classList.add('lvup'); }
    });
    G.on('shop', () => { if (tab === 'gacha' && current) current.update(); });
    G.on('comboEnd', (d) => {
      if (d.n < 10) return;
      finishT = 1.5;
      finishTot = d.dmg;
      totShown = Math.min(totShown, d.dmg);
      setText('combo-fin', d.best && d.n >= 20 ? '自己ベスト!!' : 'FINISH!');
      Sfx.comboFinish(d.best && d.n >= 20);
      if (d.best && d.n >= 30 && !blocked()) banner('BEST COMBO!!', `${d.n}hit ・ 合計 ${fmt(d.dmg)}`, 'combo');
    });
    G.on('stage', (d) => {
      const st = S().stats;
      if (d.stage >= D.CFG.SPEED3_STAGE && !st.speed3) {
        st.speed3 = 1;
        banner('3倍速 解放!!', '右上の ×ボタンで切り替え', 'unlock');
        toast('⏩', '3倍速が使えるようになった', '右上のボタンで ×1 → ×2 → ×3', 'gold');
        Sfx.unlockFx();
      }
    });
    G.on('levelUp', () => { if (tab === 'upgrades') rebuild(); });
  }

  // ------------------------------------------------------------- フレーム
  function frame(dt) {
    updateHud(dt);
    if (typeof GUI !== 'undefined') GUI.frame(dt);
    upT += dt;
    if (upT > 0.12) {
      upT = 0;
      if (current && drawerOpen) current.update();
      updateBadges();
      updateSceneUI();
      updateStudy();
      updateDock();
      updateSpeedBtn();
      updateRollStrip();
      if (toastQ.length && !overlayBusy) pumpToasts();
      if (cardQ.length && !overlayBusy) pumpCards();
    }
    slowT += dt;
    if (slowT > 1) {
      slowT = 0;
      nightT += 1;
      if (nightT >= 20) { nightT = 0; nightCheck(false); }
    }
  }

  // 菌斬り次元の画面（germui.js）から使う道具
  const _ = {
    $, el, esc, fmt, S, modal, toast, banner, setText, setScale, setCls, holdButton, failShake, sparkAt, countUp, rebuild, TABS, TITLES, LEFT,
    RLAB, oneIn, rareCard, cutIn, cutscene, kfeed, skOf, closeDrawer, openDrawer, paged,
    get overlayBusy() { return overlayBusy; }, set overlayBusy(v) { overlayBusy = v; },
    get drawerOpen() { return drawerOpen; },
  };
  return { init, frame, bump, banner, toast, modal, rebuild, blocked, nightCheck, afterHit, tapSwing: doTap, shakeHud, wave, beat, cutIn, openDrawer, closeDrawer, get tab() { return tab; }, _ };
})();
