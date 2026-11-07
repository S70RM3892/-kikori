'use strict';
// =====================================================================
//  germui.js — 菌斬り次元の画面（HUD・タブ・クイック購入・次元移動の演出）
//  ui.js の部品（UI._）を使い、森の画面と同じ見た目でそろえる。
// =====================================================================
const GUI = (() => {
  let _ = null;
  const S = () => G.S;
  const gdim = () => G.S.dim === 'germ';
  const disp = { dna: 0 };
  let comboFade = 0, comboShown = 0, bossTrail = 1, travelBusy = false;
  const dockSlots = [];
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => U.fmt(n);
  const pct = (v) => `${Math.round(v * 100)}%`;

  // ------------------------------------------------------------- 次元の移動
  function applyDim() {
    const g = gdim();
    document.body.classList.toggle('dim-germ', g);
    const ic = $('#dim-ico');
    if (ic) ic.textContent = g ? '🌲' : '🧫';
    const b = $('#btn-dim');
    if (b) b.setAttribute('aria-label', g ? '森へ帰る' : '菌斬り次元へ行く');
    Sfx.setMode(g ? 'germ' : 'forest');
  }
  function travel(to) {
    if (travelBusy || UI.blocked()) return;
    if (to === 'germ' && !G.germOpen()) { _.toast('🔒', `転生${GD.CFG.UNLOCK_PRESTIGE}回で開く`, 'ステージを進めて転生しよう'); Sfx.error(); return; }
    if ((to === 'germ') === gdim()) return;
    travelBusy = true;
    _.overlayBusy = true;
    _.closeDrawer();
    const w = $('#dim-warp');
    w.hidden = false;
    w.className = 'to-' + to;
    $('#dw-t').textContent = to === 'germ' ? '菌斬り次元へ' : '森へ帰還';
    requestAnimationFrame(() => w.classList.add('on'));
    Sfx.dimWarp(to === 'germ');
    Sfx.vibrate([20, 40, 60]);
    setTimeout(() => {
      if (to === 'germ') GM.enter(); else GM.leave();
      applyDim();
      if (to === 'germ' && Micro.ok) Micro.warp();
      FX.resize();
      w.classList.add('out');
      setTimeout(() => { w.hidden = true; w.className = ''; travelBusy = false; _.overlayBusy = false; }, 650);
    }, 720);
  }
  function onDim(d) {
    if (d.to === 'germ' && d.first) setTimeout(tutorial, 900);
    if (d.to === 'forest' && d.away) {
      const a = d.away;
      const r = a.rolls;
      if (a.wood > 0 || (r && r.n)) _.toast('🌲', '森に帰ってきた', `木こりが稼いだ 🪵+${fmt(a.wood)}${r ? ` ・ 斧ガチャ ${fmt(r.n)}回${r.news.length ? `（NEW ${r.news.length}本）` : ''}${r.best ? ` 最高 ${_.RLAB(r.best.r)}` : ''}` : ''}`);
      if (r) for (const o of r.news.slice(0, 3)) _.rareCard(o);
    }
  }
  function tutorial() {
    _.modal({
      title: '🧫 菌斬り次元へようこそ',
      body: `<ol class="g-tut"><li><b>刀をドラッグ</b>して菌を斬る。速く振るほど強い</li><li>菌の<b>中心（芯）</b>を通すとダメージ×${GD.CFG.CORE_MULT}</li><li><b>一振りで何体も</b>斬ると「一閃」。続けて斬るほど倍率が上がる</li><li>${GD.CFG.WAVE_KILLS}体でウェーブが進む。10ウェーブごとに<b>巨大病原体</b></li><li>ボスを倒すと<b>🧪変異因子</b>。「変異」は<b>森にも効く</b></li><li><b>刀ガチャ</b>はここにいる間ずっと自動で回る。SSR以上の刀には<b>奥義</b></li></ol><p class="muted">森の木こりはその間も働いている。左上の 🌲 で森へ帰れる。</p>`,
      buttons: [{ text: '斬りまくる！', cls: 'primary' }],
    });
  }
  // キーボード（スペース）: 近くの菌を一太刀
  function keySlash() {
    const list = GM.T.germs.filter((x) => x.alive && !x.flee);
    if (!list.length || !Micro.ok) return;
    const g = list[Math.floor(Math.random() * list.length)];
    const s = Micro.germScreen(g);
    FX.grab({ x: s.x - 60, y: s.y });
    FX.drag({ x: s.x + 60, y: s.y }, 4);
    FX.release();
    GM.strokeStart();
    GM.slice(g.id, { speed: 3.2, core: false, ang: (Math.random() - 0.5) * 0.8, x: s.x, y: s.y });
    GM.strokeEnd();
  }

  // ------------------------------------------------------------- HUD
  function frame(dt) {
    const open = G.germOpen();
    const bd = $('#btn-dim');
    if (bd && bd.hidden === open) bd.hidden = !open;
    if (bd) bd.classList.toggle('pulse', open && !S().stats.gVisits);
    if (!gdim()) return;
    const g = S().germ, T = GM.T, st = GM.stats();
    const k = Math.min(1, dt * 9);
    disp.dna += (g.dna - disp.dna) * k;
    if (Math.abs(g.dna - disp.dna) < Math.max(1, g.dna * 0.0005)) disp.dna = g.dna;
    _.setText('dna', fmt(disp.dna));
    _.setText('dna-rate', `+${fmt(Math.max(GM.dnaRate || 0, GM.cellRate()))}/秒 ・ 免疫 ${fmt(st.cellDps)}`);
    _.setText('factor', fmt(g.factor));
    // ウェーブ
    _.setText('wave-n', String(g.wave));
    _.setText('gbiome', Micro.ok ? Micro.biomeName() : GD.BIOMES[0].name);
    const boss = T.boss;
    _.setCls('wave-box', 'boss', !!boss || T.pendingBoss);
    if (boss) {
      _.setText('gboss-name', `👑 ${boss.bossDef ? boss.bossDef.name : 'BOSS'}`);
      const f = Math.max(0, boss.hp / boss.maxHp);
      bossTrail = f > bossTrail ? f : Math.max(f, bossTrail - dt * 0.9);
      _.setScale('gboss-fill', f);
      _.setText('gboss-txt', `${fmt(Math.max(0, Math.ceil(boss.hp)))} / ${fmt(boss.maxHp)}`);
      _.setText('gboss-timer', `⏱ ${T.bossTimer.toFixed(1)}`);
      _.setCls('gboss-timer', 'urgent', T.bossTimer < 10);
      _.setCls('gboss-timer', 'show', true);
      _.setText('wave-txt', '');
      _.setScale('wave-fill', 0);
    } else {
      _.setCls('gboss-timer', 'show', false);
      _.setText('gboss-name', T.pendingBoss ? '⚠️ 巨大病原体 接近中…' : '');
      const need = GD.CFG.WAVE_KILLS;
      _.setScale('wave-fill', g.farming ? 1 : g.wkills / need);
      _.setText('wave-txt', g.farming ? '修行中（ボスに再挑戦できる）' : `${g.wkills}/${need}体`);
      _.setCls('wave-box', 'farm', g.farming);
    }
    const bb = $('#btn-gboss');
    const showB = g.farming && !boss && !T.pendingBoss;
    if (bb && bb.hidden === showB) bb.hidden = !showB;
    // 連斬
    if (T.combo > 1) { comboFade = 1; comboShown = T.combo; } else comboFade = Math.max(0, comboFade - dt * 2);
    _.setCls('gcombo-box', 'show', comboFade > 0.02);
    if (comboFade > 0.02) {
      _.setText('gcombo-n', String(comboShown));
      _.setText('gcombo-mult', `×${GM.comboMult().toFixed(2)}`);
      _.setScale('gcombo-win', T.combo > 0 ? T.comboT / st.comboWin : 0);
      const e = $('#gcombo-box');
      if (e) e.style.opacity = String(Math.min(1, comboFade * 2));
      _.setCls('gcombo-box', 'hot', T.combo >= 50);
    }
    // 奥義ゲージ
    const oi = GM.ougiInfo();
    _.setCls('ougi-box', 'show', !!oi);
    if (oi) {
      _.setText('ougi-n', oi.sk.name);
      _.setScale('ougi-g', oi.gauge / oi.need);
      _.setCls('ougi-box', 'ready', oi.gauge / oi.need >= 0.8);
    }
    // 大発生
    _.setCls('out-bar', 'show', T.outbreak > 0);
    if (T.outbreak > 0) _.setScale('out-fill', T.outbreak / st.outTime);
    updateDock();
  }
  function badges(setBadge) {
    if (!G.germOpen()) return;
    const g = S().germ;
    let c = 0;
    for (const x of visibleCells()) if (GM.cellCost(x, g.cells[x.id] || 0, 1) <= g.dna) c++;
    setBadge('gcells', c);
    let u = 0;
    for (const x of GD.UPGRADES) if (!GM.upgMaxed(x) && GM.upgCost(x) <= g.dna) u++;
    setBadge('gupg', u);
    let m = 0;
    for (const x of GD.MUTATIONS) if (!GM.mutMaxed(x) && GM.mutCost(x) <= g.factor) m++;
    setBadge('gmut', m);
  }

  // ------------------------------------------------------------- 下のクイック購入
  function buildDock() {
    const root = $('#g-dock');
    if (!root) return;
    root.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const b = _.el('button', 'dk', '<em class="dk-i"></em><span class="dk-t"><b class="dk-n"></b><small class="dk-s"></small></span><i class="dk-c"></i>');
      b.type = 'button';
      const slot = { b, kind: null, id: null };
      _.holdButton(b, () => {
        let ok = false;
        if (slot.kind === 'upg') ok = GM.buyUpg(slot.id);
        else if (slot.kind === 'cell') ok = GM.buyCell(slot.id, 1);
        if (ok) { Sfx.buy(); _.sparkAt(b, '#7affb8'); } else _.failShake(b);
        updateDock(true);
        return ok;
      });
      root.appendChild(b);
      dockSlots.push(slot);
    }
  }
  function bestCell() {
    const g = S().germ;
    let best = null;
    for (const c of visibleCells()) {
      const have = g.cells[c.id] || 0;
      const cost = GM.cellCost(c, have, 1);
      const v = GM.unitCellDps(c) / cost;
      if (!best || v > best.v || (have === 0 && cost <= g.dna && best.cost > g.dna)) best = { c, v, cost };
    }
    return best;
  }
  let dockT = 0;
  function updateDock(force) {
    dockT += 0.016;
    if (!force && dockT < 0.15) return;
    dockT = 0;
    if (!dockSlots.length) return;
    const g = S().germ;
    const set = (slot, kind, id, icon, name, sub, cost) => {
      slot.kind = kind; slot.id = id;
      const b = slot.b;
      b.querySelector('.dk-i').textContent = icon;
      b.querySelector('.dk-n').textContent = name;
      b.querySelector('.dk-s').textContent = sub;
      b.querySelector('.dk-c').textContent = '🧬' + fmt(cost);
      b.classList.toggle('can', cost <= g.dna);
    };
    const sharp = GM.UP.sharp;
    set(dockSlots[0], 'upg', 'sharp', sharp.icon, `切れ味 Lv${GM.lv('sharp')}`, '刀のダメージ', GM.upgCost(sharp));
    const bc = bestCell();
    if (bc) set(dockSlots[1], 'cell', bc.c.id, bc.c.icon, `${bc.c.name} ×${g.cells[bc.c.id] || 0}`, '免疫細胞', bc.cost);
    const an = GM.UP.analyze;
    set(dockSlots[2], 'upg', 'analyze', an.icon, `DNA解析 Lv${GM.lv('analyze')}`, 'DNA ×1.15', GM.upgCost(an));
  }

  // ------------------------------------------------------------- タブ: 免疫細胞
  function visibleCells() {
    const g = S().germ;
    let maxIdx = -1;
    GD.CELLS.forEach((c, i) => { if ((g.cells[c.id] || 0) > 0) maxIdx = i; });
    return GD.CELLS.slice(0, Math.min(GD.CELLS.length, maxIdx + 3));
  }
  function nextMs(n) { for (const [c, x] of GD.MILESTONES) if (n < c) return { at: c, mult: x }; return null; }
  const TabCells = {
    build(root) {
      const s = S(), g = s.germ;
      root.innerHTML = '';
      const head = _.el('div', 'tab-head');
      const amts = [1, 10, 100, 'max'];
      head.innerHTML = `<div class="seg" role="group" aria-label="まとめ買い">${amts.map((a) => `<button type="button" data-amt="${a}" class="${s.settings.buyAmt === a ? 'on' : ''}">${a === 'max' ? 'MAX' : '×' + a}</button>`).join('')}</div><div class="tab-stat">免疫の攻撃 <b class="c-dps">0</b>/秒</div>`;
      head.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-amt]');
        if (!b) return;
        const v = b.dataset.amt;
        s.settings.buyAmt = v === 'max' ? 'max' : Number(v);
        head.querySelectorAll('[data-amt]').forEach((x) => x.classList.toggle('on', x === b));
        this.update();
      });
      root.appendChild(head);
      root.appendChild(_.el('p', 'muted small tab-note', '免疫細胞は画面の端から飛んできて菌を食べる。森にいる間も、離れている間もDNAを稼ぐ。'));
      const list = _.el('div', 'list');
      this.rows = {};
      this.vis = visibleCells();
      for (const c of this.vis) {
        const row = _.el('div', 'row worker cell-row');
        row.innerHTML = `<div class="r-ico"><span class="emo">${c.icon}</span><b class="r-cnt">0</b></div><div class="r-main"><div class="r-name">${_.esc(c.name)} <em class="r-mult"></em></div><div class="r-sub"></div><div class="r-desc">${_.esc(c.desc)}</div><div class="r-ms"><i></i><span></span></div></div><button type="button" class="buy"><span class="b-n">×1</span><b class="b-c">0</b></button>`;
        const btn = row.querySelector('.buy');
        _.holdButton(btn, () => {
          const ok = GM.buyCell(c.id, S().settings.buyAmt);
          if (ok) { Sfx.buy(); _.sparkAt(btn, '#7affb8'); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } else _.failShake(btn);
          this.update();
          return ok;
        });
        this.rows[c.id] = { row, cnt: row.querySelector('.r-cnt'), mult: row.querySelector('.r-mult'), sub: row.querySelector('.r-sub'), ms: row.querySelector('.r-ms i'), msT: row.querySelector('.r-ms span'), btn, bn: row.querySelector('.b-n'), bc: row.querySelector('.b-c') };
        list.appendChild(row);
      }
      if (this.vis.length < GD.CELLS.length) list.appendChild(_.el('div', 'row locked', '<div class="r-ico"><span class="emo">❔</span></div><div class="r-main"><div class="r-name">？？？</div><div class="r-sub">仲間を増やすと次の細胞が現れる</div></div>'));
      root.appendChild(list);
      this.dps = head.querySelector('.c-dps');
      void g;
    },
    update() {
      const s = S(), g = s.germ, st = GM.stats();
      this.dps.textContent = fmt(st.cellDps);
      if (visibleCells().length !== this.vis.length) { _.rebuild(); return; }
      for (const c of this.vis) {
        const r = this.rows[c.id];
        const have = g.cells[c.id] || 0;
        const amt = s.settings.buyAmt;
        const n = amt === 'max' ? Math.max(1, GM.cellMax(c, have, g.dna)) : amt;
        const cost = GM.cellCost(c, have, n);
        r.cnt.textContent = fmt(have);
        r.mult.textContent = GM.msMult(have) > 1 ? `×${fmt(GM.msMult(have))}` : '';
        r.sub.textContent = `1体 ${fmt(GM.unitCellDps(c))}/秒 ・ 合計 ${fmt(st.cdps[c.id] || 0)}/秒`;
        const nm = nextMs(have);
        r.ms.style.transform = `scaleX(${nm ? U.clamp(have / nm.at, 0, 1) : 1})`;
        r.msT.textContent = nm ? `${nm.at}体で ×${nm.mult}` : 'MAX';
        r.bn.textContent = `×${fmt(n)}`;
        r.bc.textContent = '🧬' + fmt(cost);
        r.btn.classList.toggle('can', cost <= g.dna);
      }
    },
  };

  // ------------------------------------------------------------- タブ: 研ぎ（強化）
  const TabUpg = {
    build(root) {
      root.innerHTML = '';
      root.appendChild(_.el('div', 'tab-head', '<div class="tab-stat">刀のダメージ <b class="u-dmg">0</b></div><div class="tab-stat">DNA倍率 <b class="u-dna">×1</b></div>'));
      this.rows = {};
      for (const [cat, title] of GD.UPG_CATS) {
        root.appendChild(_.el('div', 'sec-title', title));
        const list = _.el('div', 'list');
        for (const u of GD.UPGRADES.filter((x) => x.cat === cat)) {
          const row = _.el('div', 'row upg');
          row.innerHTML = `<div class="r-ico"><span class="emo">${u.icon}</span><b class="r-cnt">0</b></div><div class="r-main"><div class="r-name">${_.esc(u.name)}</div><div class="r-desc">${_.esc(u.desc)}</div><div class="r-sub"></div></div><button type="button" class="buy"><span class="b-n">強化</span><b class="b-c">0</b></button>`;
          const btn = row.querySelector('.buy');
          _.holdButton(btn, () => {
            const ok = GM.buyUpg(u.id);
            if (ok) { Sfx.unlockFx(); _.sparkAt(btn, '#7affe8'); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } else if (!GM.upgMaxed(u)) _.failShake(btn);
            this.update();
            return ok;
          });
          this.rows[u.id] = { row, cnt: row.querySelector('.r-cnt'), sub: row.querySelector('.r-sub'), btn, bc: row.querySelector('.b-c'), bn: row.querySelector('.b-n') };
          list.appendChild(row);
        }
        root.appendChild(list);
      }
      this.dmg = root.querySelector('.u-dmg');
      this.dna = root.querySelector('.u-dna');
    },
    update() {
      const g = S().germ, st = GM.stats();
      this.dmg.textContent = fmt(st.kdmg);
      this.dna.textContent = `×${fmt(st.dnaMult)}`;
      for (const u of GD.UPGRADES) {
        const r = this.rows[u.id];
        const l = GM.lv(u.id);
        const maxed = GM.upgMaxed(u);
        r.cnt.textContent = String(l);
        r.sub.textContent = upgNow(u.id, st) + (u.max ? ` ・ Lv${l}/${u.max}` : '');
        const c = GM.upgCost(u);
        r.bc.textContent = maxed ? 'MAX' : '🧬' + fmt(c);
        r.bn.textContent = maxed ? '完了' : '強化';
        r.btn.classList.toggle('can', !maxed && c <= g.dna);
        r.btn.disabled = maxed;
      }
    },
  };
  function upgNow(id, st) {
    switch (id) {
      case 'sharp': return `いま ${fmt(st.kdmg)}/太刀`;
      case 'draw': return `速さボーナス ×${st.drawK.toFixed(1)}`;
      case 'issen': return `2体目以降 +${pct(st.issen)}/体`;
      case 'core': return `芯 ${pct(st.core)}・×${st.coreM.toFixed(2)}`;
      case 'combo': return `受付 ${st.comboWin.toFixed(2)}秒・上限 ${st.comboCap}`;
      case 'crit': return `会心 ${pct(st.critC)}・×${st.critM.toFixed(2)}`;
      case 'zanshin': return `残心 ${pct(st.zanshin)}`;
      case 'reach': return `間合い ×${st.reach.toFixed(2)}`;
      case 'analyze': return `DNA ×${fmt(st.dnaMult)}`;
      case 'culture': return `同時に ${GM.maxGerms()}体`;
      case 'gold': return `黄金菌 ×${st.goldK.toFixed(2)}`;
      case 'outbreak': return `大発生 ${st.outTime}秒`;
      case 'immune': return `免疫 ×${fmt(st.imm)}`;
      case 'boss': return `ボス ×${st.bossM.toFixed(2)}・${st.bossTime}秒`;
      case 'krollspd': return `刀ガチャ ${st.rollBase.toFixed(1)}回/秒`;
      case 'kluck': return `幸運 ×${st.luckBase.toFixed(2)}`;
      default: return '';
    }
  }

  // ------------------------------------------------------------- タブ: 刀ガチャ・刀
  const kspText = (k, lv) => (k.sp ? Object.keys(k.sp).map((x) => GD.KSP_TEXT[x](k.sp[x] * (1 + 0.2 * (Math.max(1, lv) - 1)))).join(' / ') : 'なし');
  function katDetail(k) {
    const g = S().germ;
    const n = g.kat[k.id] || 0, lv = G.lvOf(n), R = D.RARITY[k.r];
    const ou = GD.OUGI[k.id], tier = GD.OUGI_TIER[k.r];
    const body = _.el('div', 'axe-detail');
    body.innerHTML = `<div class="ad-icon r-${k.r}">${FX.axeIcon(k, 132)}</div><p class="ad-desc">${_.esc(k.desc)}</p>` +
      `<dl><dt>レア</dt><dd><span class="rb r-${k.r}">${_.RLAB(k.r)}</span> ${_.oneIn(R.p)}</dd>` +
      `<dt>Lv</dt><dd>${n ? `Lv${lv}（${fmt(n)}本・次のLvまで あと${fmt(Math.pow(2, lv) - n)}本）` : '未所持'}</dd>` +
      `<dt>装備時の斬撃</dt><dd>×${(R.tap * (1 + 0.1 * (Math.max(1, lv) - 1))).toFixed(2)}</dd><dt>装備時特性</dt><dd>${_.esc(kspText(k, lv))}</dd>` +
      (ou ? `<dt>奥義</dt><dd>「${_.esc(ou.name)}」 ${tier.need}ゲージで画面の菌を一斉に斬る（×${tier.mult}）</dd>` : '') +
      `<dt>所持ボーナス</dt><dd>刀ダメージ +${(R.pas * 0.5 * Math.max(1, lv) * 100).toFixed(1)}% ・ 森の全ダメージ +${Math.round(GD.CFG.KAT_SYNERGY * 100)}%</dd></dl>`;
    const isEq = g.keq === k.id;
    _.modal({ title: k.name, body, cls: 'r-' + k.r, buttons: [{ text: isEq ? '装備中' : '装備する', cls: 'primary', disabled: isEq || !n, onClick: () => { GM.equipK(k.id); _.rebuild(); } }, { text: '閉じる' }] });
  }
  const TabKat = {
    build(root) {
      const s = S(), g = s.germ;
      root.innerHTML = '';
      const st = GM.stats();
      const eq = st.eq;
      if (eq) {
        const ou = GD.OUGI[eq.id];
        const hero = _.el('button', `kat-hero r-${eq.r}`, `<span class="kh-img">${FX.axeIcon(eq, 96)}</span><span class="kh-t"><small>装備中の刀</small><b>${_.esc(eq.name)}</b><span class="rb r-${eq.r}">${_.RLAB(eq.r)}</span>${ou ? `<em>奥義「${_.esc(ou.name)}」</em>` : '<em class="muted">SSR以上の刀には奥義がある</em>'}</span>`);
        hero.type = 'button';
        hero.addEventListener('click', () => katDetail(eq));
        root.appendChild(hero);
      }
      const auto = _.el('div', 'auto-card');
      auto.innerHTML = `<div class="ac-h"><b>⚔️ 刀ガチャ（自動）</b><span class="ac-live">● 回転中</span></div>` +
        `<div class="ac-stats"><div><small>毎秒</small><b class="ac-r">0</b><small>回</small></div><div><small>幸運</small><b class="ac-luck">×1</b></div><div><small>総回転</small><b class="ac-total">0</b></div></div>` +
        `<div class="ac-glvrow"><span>刀ガチャLv <b class="ac-glv">1</b></span><div class="ac-gbarw"><i class="ac-gbar"></i></div><small class="ac-gxp"></small></div>` +
        `<p class="ac-boost"></p><div class="ac-feed"></div>`;
      root.appendChild(auto);
      root.appendChild(_.el('p', 'muted small tab-note', '菌斬り次元にいる間ずっと回る。連斬が続くほど回転と幸運が上がり、大発生中は回転×2・幸運×1.5。'));
      const tbl = _.el('div', 'rate-tbl');
      tbl.innerHTML = '<div class="rt-h"><span>レア</span><span>基本</span><span>いま</span></div>' + D.RARITY_ORDER.slice().reverse().map((k) => `<div class="rt-r"><span class="rb r-${k}">${_.RLAB(k)}</span><span>${_.oneIn(D.RARITY[k].p)}</span><b class="now-${k}"></b></div>`).join('');
      root.appendChild(tbl);
      const owned = Object.keys(g.kat).length;
      root.appendChild(_.el('div', 'sec-title', `刀コレクション <b>${owned}/${GD.KATANAS.length}</b><span>1種類ごとに森の全ダメージ +${Math.round(GD.CFG.KAT_SYNERGY * 100)}% ・ 所持ボーナス 刀 +${fmt(Math.round(st.pas * 100))}%</span>`));
      const grid = _.el('div', 'axe-grid');
      const order = D.RARITY_ORDER.slice().reverse();
      for (const k of GD.KATANAS.slice().sort((a, b) => order.indexOf(a.r) - order.indexOf(b.r))) {
        const n = g.kat[k.id] || 0;
        const b = _.el('button', `axe-card r-${k.r}${n ? ' owned' : ''}${g.keq === k.id ? ' eq' : ''}`);
        b.type = 'button';
        b.innerHTML = `<span class="ac-r">${_.RLAB(k.r)}${GD.OUGI[k.id] ? '<i class="ac-fan">奥</i>' : ''}</span><div class="ac-icon">${FX.axeIcon(k, 50)}</div><div class="ac-name">${n ? _.esc(k.name) : '？？？'}</div><div class="ac-lv">${n ? `Lv${G.lvOf(n)} <small>×${fmt(n)}</small>` : _.oneIn(D.RARITY[k.r].p)}</div>${g.keq === k.id ? '<span class="ac-eq">装備中</span>' : ''}`;
        if (n) b.addEventListener('click', () => katDetail(k)); else b.disabled = true;
        grid.appendChild(b);
      }
      root.appendChild(grid);
      Object.assign(this, { aR: auto.querySelector('.ac-r'), aLuck: auto.querySelector('.ac-luck'), aTotal: auto.querySelector('.ac-total'), aGlv: auto.querySelector('.ac-glv'), aGbar: auto.querySelector('.ac-gbar'), aGxp: auto.querySelector('.ac-gxp'), aBoost: auto.querySelector('.ac-boost'), aFeed: auto.querySelector('.ac-feed'), tbl, feedN: -1 });
    },
    update() {
      const s = S(), g = s.germ, T = GM.T;
      const rate = GM.kRollRate(), luck = GM.kLuckNow();
      this.aR.textContent = rate < 100 ? rate.toFixed(1) : fmt(rate);
      this.aLuck.textContent = `×${luck.toFixed(2)}`;
      this.aTotal.textContent = fmt(s.stats.gRolls || 0);
      const need = GM.kgNeed(g.kgLv || 1);
      this.aGlv.textContent = String(g.kgLv || 1);
      this.aGbar.style.transform = `scaleX(${U.clamp((g.kgXp || 0) / need, 0, 1)})`;
      this.aGxp.textContent = `${fmt(g.kgXp || 0)}/${fmt(need)}`;
      const boosts = [];
      if (T.outbreak > 0) boosts.push('☣️大発生 回転×2 幸運×1.5');
      if (T.combo > 0) boosts.push(`🔥連斬${T.combo} 回転×${(1 + 0.005 * Math.min(T.combo, 100)).toFixed(2)}`);
      if (G.gameSpeed() > 1) boosts.push(`⏩ ×${G.gameSpeed()}`);
      if (G.buffOf('roll') > 1) boosts.push(`⚙️オイル ×${G.buffOf('roll')}`);
      if (G.buffOf('luck') > 1) boosts.push(`🍀お守り ×${G.buffOf('luck')}`);
      this.aBoost.textContent = boosts.length ? boosts.join('  ') : '斬り続けると回転と幸運がブースト';
      const kf = _.kfeed;
      if (this.feedN !== kf.length) {
        this.feedN = kf.length;
        this.aFeed.innerHTML = kf.slice(0, 8).map((o) => `<div class="fd r-${o.r}"><span class="rb r-${o.r}">${_.RLAB(o.r)}</span><b>${_.esc(o.axe.name)}</b><small>${o.isNew ? 'NEW!' : o.lvUp ? `Lv${o.lv}↑` : '+1'}</small></div>`).join('') || '<div class="fd-empty">UR以上や新しい刀が出るとここに並ぶ</div>';
      }
      for (const k of D.RARITY_ORDER) {
        const c = this.tbl.querySelector('.now-' + k);
        if (c) c.textContent = _.oneIn(Math.min(1, D.RARITY[k].p * luck));
      }
    },
  };

  // ------------------------------------------------------------- タブ: 変異
  function mutVal(m, l) { return m.add ? `+${fmt(m.k * l)}` : m.mul ? `×${fmt(Math.pow(1 + m.k, l))}` : `+${Math.round(m.k * l * 100)}%`; }
  const TabMut = {
    build(root) {
      root.innerHTML = '';
      root.appendChild(_.el('div', 'tab-head', '<div class="tab-stat">🧪 変異因子 <b class="m-f">0</b></div><div class="tab-stat">ボス病原体を倒すと手に入る</div>'));
      root.appendChild(_.el('p', 'muted small tab-note', '変異は転生してもなくならない。🌿の印は森、🗡️の印は菌斬り次元、🌈は両方に効く。'));
      const list = _.el('div', 'list');
      this.rows = {};
      for (const m of GD.MUTATIONS) {
        const row = _.el('div', 'row upg mut-row');
        row.innerHTML = `<div class="r-ico"><span class="emo">${m.icon}</span><b class="r-cnt">0</b></div><div class="r-main"><div class="r-name">${_.esc(m.name)}</div><div class="r-desc">${_.esc(m.desc)} ${m.add ? `+${m.k}` : m.mul ? `×${1 + m.k}（重ねがけ）` : `+${Math.round(m.k * 100)}%`} /Lv</div><div class="r-sub"></div></div><button type="button" class="buy"><span class="b-n">変異</span><b class="b-c">0</b></button>`;
        const btn = row.querySelector('.buy');
        _.holdButton(btn, () => {
          const ok = GM.buyMut(m.id);
          if (ok) { Sfx.unlockFx(); _.sparkAt(btn, '#c8a0ff'); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); _.toast(m.icon, `${m.name} Lv${GM.mutLv(m.id)}`, `${m.desc} ${mutVal(m, GM.mutLv(m.id))}`); } else if (!GM.mutMaxed(m)) _.failShake(btn);
          this.update();
          return ok;
        });
        this.rows[m.id] = { cnt: row.querySelector('.r-cnt'), sub: row.querySelector('.r-sub'), btn, bc: row.querySelector('.b-c'), bn: row.querySelector('.b-n') };
        list.appendChild(row);
      }
      root.appendChild(list);
      this.f = root.querySelector('.m-f');
    },
    update() {
      const g = S().germ;
      this.f.textContent = fmt(g.factor);
      for (const m of GD.MUTATIONS) {
        const r = this.rows[m.id];
        const l = GM.mutLv(m.id), maxed = GM.mutMaxed(m), c = GM.mutCost(m);
        r.cnt.textContent = String(l);
        r.sub.textContent = `いま ${mutVal(m, l)}${maxed ? '' : ` → ${mutVal(m, l + 1)}`} ・ Lv${l}/${m.max}`;
        r.bc.textContent = maxed ? 'MAX' : '🧪' + fmt(c);
        r.bn.textContent = maxed ? '完了' : '変異';
        r.btn.classList.toggle('can', !maxed && c <= g.factor);
        r.btn.disabled = maxed;
      }
    },
  };

  // ------------------------------------------------------------- タブ: 次元（記録と帰り道）
  const TabDim = {
    build(root) {
      const s = S(), st = s.stats, g = s.germ, gst = GM.stats(), fst = G.stats();
      root.innerHTML = '';
      const box = _.el('div', 'prestige-box dim-box');
      box.innerHTML = `<div class="pb-ring" aria-hidden="true"></div><div class="pb-t">🌲 森へ帰る</div><p>森の木こりはずっと働いている。菌斬り次元の免疫細胞も、森にいる間にDNAを稼ぐ。</p><button type="button" class="btn primary big">森へ帰る</button>`;
      box.querySelector('button').addEventListener('click', () => travel('forest'));
      root.appendChild(box);
      root.appendChild(_.el('div', 'sec-title', '2つの世界のつながり'));
      root.appendChild(_.el('dl', 'records', [
        ['森の斧の種類 → 刀', `×${gst.axeSyn.toFixed(2)}`], ['刀の種類 → 森', `×${fst.katMult.toFixed(2)}`], ['精霊 → 刀', `×${gst.spiritK.toFixed(2)}`], ['実績 → 両方', `×${fst.achMult.toFixed(2)}`],
      ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')));
      root.appendChild(_.el('div', 'sec-title', '菌斬り次元の記録'));
      root.appendChild(_.el('dl', 'records', [
        ['最高ウェーブ', st.gBestWave], ['斬った菌', fmt(st.gKills)], ['最高の一閃', `${st.gBestIssen}体`], ['最大連斬', fmt(st.gMaxCombo)],
        ['ボス撃破', fmt(st.gBosses)], ['大発生', fmt(st.gOutbreaks)], ['奥義', fmt(st.gOugi)], ['刀ガチャ', fmt(st.gRolls) + '回'],
        ['累計DNA', fmt(st.gDnaAll)], ['滞在時間', U.fmtTime(st.gTime)],
      ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')));
      void g;
    },
    update() {},
  };

  function init() {
    _ = UI._;
    Object.assign(_.TITLES, { gcells: '🛡️ 免疫細胞', gupg: '🗡️ 研ぎ', gkat: '⚔️ 刀ガチャ・刀', gmut: '🧬 変異', gdim: '🌀 次元' });
    _.LEFT.push('gcells', 'gupg', 'gkat');
    Object.assign(_.TABS, { gcells: TabCells, gupg: TabUpg, gkat: TabKat, gmut: TabMut, gdim: TabDim });
    const bd = $('#btn-dim');
    if (bd) bd.addEventListener('click', () => { Sfx.unlock(); travel(gdim() ? 'forest' : 'germ'); });
    const bb = $('#btn-gboss');
    if (bb) bb.addEventListener('click', () => { if (GM.challengeBoss()) Sfx.boss(); });
    buildDock();
    G.on('dim', onDim);
    G.on('kgLevel', (u) => { if (gdim()) _.toast('🎰', `刀ガチャ Lv${u.lv}!`, `💎+${u.gems} ・ 回転と幸運が少し上がった`); });
    G.on('kEquip', (k) => { if (gdim() && !UI.blocked()) _.toast('⚔️', `${k.name} に持ち替えた`, GD.OUGI[k.id] ? `奥義「${GD.OUGI[k.id].name}」` : _.RLAB(k.r)); });
    G.on('gBuyUpg', () => updateDock(true));
    G.on('gBuyCell', () => updateDock(true));
    G.on('load', applyDim);
    disp.dna = S().germ ? S().germ.dna : 0;
    applyDim();
    if (gdim()) { GM.T.spawnT = 0.6; if (GM.isBossWave(S().germ.wave) && !S().germ.farming) { GM.T.pendingBoss = true; GM.T.bossDelay = 2; } }
  }
  return { init, frame, badges, travel, keySlash, applyDim };
})();
