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
  // 次元ごとの言葉（菌→スライム、DNA→ゼリー、刀→剣…）と通貨アイコン
  const HAS_DM = typeof DM !== 'undefined' && !!DM;
  const LL = (t) => (HAS_DM ? DM.L(t) : t);
  const CI = () => (HAS_DM ? DM.LB.curIcon : '🧬');

  // ------------------------------------------------------------- 次元の移動
  const LB = () => (HAS_DM ? DM.LB : { noun: '菌', cur: 'DNA', curIcon: '🧬', wpn: '刀', ally: '免疫細胞', allyIcon: '🛡️', world: 'ミクロの世界', dim: '菌斬り次元', icon: '🧫' });
  const portalOpenable = () => HAS_DM && G.germOpen() && DM.isOpen(S(), 1);
  function setRail(key, icon, label) {
    for (const b of document.querySelectorAll(`[data-open="${key}"]`)) {
      const em = b.querySelector('em'), sp = b.querySelector('span');
      if (em && icon) em.textContent = icon;
      if (sp && label) sp.textContent = label;
    }
  }
  function applyDim() {
    const g = gdim(), lb = LB();
    document.body.classList.toggle('dim-germ', g);
    document.body.dataset.realm = HAS_DM && DM.cur ? DM.realmOf(DM.meta(DM.cur)).id : 'germ';
    const ic = $('#dim-ico');
    if (ic) ic.textContent = g ? '🌲' : lb.icon;
    const b = $('#btn-dim');
    if (b) { b.setAttribute('aria-label', g ? '森へ帰る' : `${lb.dim}へ行く`); b.title = g ? '森へ帰る' : `${lb.dim}へ行く（最後にいた次元）`; }
    const ci = document.querySelector('#cur-dna .ico');
    if (ci) ci.textContent = lb.curIcon;
    const cd = $('#cur-dna');
    if (cd) cd.title = `${lb.cur}（${lb.noun}を斬ると手に入る）`;
    const other = HAS_DM && DM.cur;
    setRail('gcells', lb.allyIcon, other ? '仲間' : '免疫');
    setRail('gkat', '⚔️', lb.wpn);
    if (_) Object.assign(_.TITLES, { gcells: `${lb.allyIcon} ${lb.ally}`, gkat: `⚔️ ${lb.wpn}ガチャ・${lb.wpn}`, gdim: `${lb.icon} ${lb.dim}` });
    Sfx.setMode(g ? 'germ' : 'forest');
    if (g && HAS_DM) Sfx.setTheme(DM.C.music);
    portalBtn();
  }
  // to: 'germ' か 'forest'。idx: 行き先の次元（省略で最後にいた次元）。次元の中から別の次元へも行ける
  function travel(to, idx) {
    if (travelBusy || (UI.blocked() && !portalOn)) return;
    const s = S();
    if (to === 'germ') {
      if (!G.germOpen()) { _.toast('🔒', `転生${GD.CFG.UNLOCK_PRESTIGE}回で開く`, 'ステージを進めて転生しよう'); Sfx.error(); return; }
      if (idx == null) idx = s.dimCur || 0;
      if (HAS_DM && !DM.isOpen(s, idx)) { _.toast('🔒', 'まだ開いていない次元', `前の次元でウェーブ${DM.unlockW(idx - 1)}に着くと開く`); Sfx.error(); return; }
      if (gdim() && (!HAS_DM || idx === DM.cur)) { portalClose(); return; }
    } else if (!gdim()) return;
    portalClose();
    travelBusy = true;
    _.overlayBusy = true;
    _.closeDrawer();
    const w = $('#dim-warp');
    w.hidden = false;
    w.className = 'to-' + to;
    const m = HAS_DM && to === 'germ' ? DM.meta(idx) : null;
    $('#dw-t').textContent = to === 'germ' ? `${m ? m.icon + ' ' + m.name : '菌斬り次元'}へ` : '森へ帰還';
    requestAnimationFrame(() => w.classList.add('on'));
    Sfx.dimWarp(to === 'germ');
    Sfx.vibrate([20, 40, 60]);
    setTimeout(() => {
      if (to === 'germ') GM.enter(idx); else GM.leave();
      disp.dna = G.dstate().dna;
      applyDim();
      if (to === 'germ' && Micro.ok) Micro.warp();
      FX.resize();
      w.classList.add('out');
      setTimeout(() => { w.hidden = true; w.className = ''; travelBusy = false; _.overlayBusy = false; }, 650);
    }, 720);
  }

  // ------------------------------------------------------------- 次元ポータル（211の次元を探す・選ぶ・飛ぶ）
  const PS = { q: '', f: 0, realm: -2, p: 0 };
  let portalEl = null, portalOn = false;
  const PF = [
    ['すべて', () => true],
    ['開いている', (i, o) => o.open],
    ['未訪問', (i, o) => o.open && !o.seen],
    ['★お気に入り', (i) => !!S().dimFav[i]],
    ['まだ', (i, o) => !o.open],
  ];
  function dimInfo(i) {
    const s = S(), m = DM.meta(i), ds = DM.peek(s, i), open = DM.isOpen(s, i);
    const seen = i ? !!(ds && ds.seen) : (s.stats.gVisits || 0) > 0;
    return { m, ds, open, seen, wave: (ds && ds.maxWave) || 1, stars: DM.stars(ds), kinds: ds ? Object.keys(ds.kat || {}).length : 0, tiers: i ? DM.ladTotal(ds) : 0, here: gdim() && DM.cur === i };
  }
  function portalBtn() {
    const pb = $('#btn-portal');
    if (!pb) return;
    const ok = portalOpenable();
    if (pb.hidden === ok) pb.hidden = !ok;
    if (!ok) return;
    let n = 0;
    const s = S(), top = DM.frontier(s);
    for (let i = 1; i <= top; i++) { const ds = DM.peek(s, i); if (!ds || !ds.seen) n++; }
    const bd = pb.querySelector('.badge');
    if (bd) { bd.hidden = !n; bd.textContent = n > 99 ? '99+' : String(n); }
    pb.classList.toggle('pulse', n > 0);
  }
  function portalBuild() {
    portalEl = document.createElement('div');
    portalEl.id = 'portal';
    portalEl.hidden = true;
    portalEl.setAttribute('role', 'dialog');
    portalEl.setAttribute('aria-label', '次元ポータル');
    portalEl.innerHTML = `<div class="pt-back" data-x="1"></div><div class="pt-panel">
      <div class="pt-head"><b>🌀 次元ポータル</b><button type="button" class="pt-x" data-x="1" aria-label="閉じる">✕</button></div>
      <div class="pt-stats"></div>
      <div class="pt-acts"><button type="button" class="btn primary pt-front">⏩ 最前線へ</button><button type="button" class="btn pt-rand">🎲 おまかせ</button><button type="button" class="btn pt-home">🌲 森へ</button></div>
      <input class="pt-q" type="search" placeholder="名前・界・ルールで探す（例: 重力 / スライム / 闇夜）" aria-label="次元を探す">
      <div class="pt-chips pt-f"></div>
      <div class="pt-chips pt-r"></div>
      <div class="pt-grid"></div>
      <div class="pg-nav pt-nav"></div>
    </div>`;
    document.body.appendChild(portalEl);
    portalEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-x]')) { portalClose(); return; }
      const fav = e.target.closest('[data-fav]');
      if (fav) { const i = +fav.dataset.fav, f = S().dimFav; if (f[i]) delete f[i]; else f[i] = 1; Sfx.buy(); portalRender(); return; }
      const card = e.target.closest('[data-dim]');
      if (card) { const i = +card.dataset.dim; if (DM.isOpen(S(), i)) travel('germ', i); else { Sfx.error(); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); } return; }
      const fb = e.target.closest('[data-pf]');
      if (fb) { PS.f = +fb.dataset.pf; PS.p = 0; portalRender(); Sfx.buy(); return; }
      const rb = e.target.closest('[data-pr]');
      if (rb) { PS.realm = +rb.dataset.pr; PS.p = 0; portalRender(); Sfx.buy(); return; }
      const nb = e.target.closest('[data-d]');
      if (nb && nb.closest('.pt-nav')) { PS.p += +nb.dataset.d; portalRender(); Sfx.buy(); return; }
      if (e.target.closest('.pt-front')) { travel('germ', DM.frontier(S())); return; }
      if (e.target.closest('.pt-rand')) { const top = DM.frontier(S()); travel('germ', Math.floor(Math.random() * (top + 1))); return; }
      if (e.target.closest('.pt-home')) { if (gdim()) travel('forest'); else portalClose(); }
    });
    const q = portalEl.querySelector('.pt-q');
    q.addEventListener('input', () => { PS.q = q.value.trim(); PS.p = 0; portalRender(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Escape') portalClose(); });
  }
  function portalOpen() {
    if (!portalOpenable() || travelBusy) return;
    if (!portalEl) portalBuild();
    _.closeDrawer();
    portalOn = true;
    portalEl.hidden = false;
    _.overlayBusy = true;
    requestAnimationFrame(() => portalEl.classList.add('on'));
    // 開いたら今いる次元のページへ
    PS.p = -1;
    portalRender();
    Sfx.dimWarp(true);
  }
  function portalClose() {
    if (!portalOn) return;
    portalOn = false;
    _.overlayBusy = false;
    portalEl.classList.remove('on');
    setTimeout(() => { if (!portalOn) portalEl.hidden = true; }, 220);
  }
  function portalRender() {
    if (!portalEl) return;
    const s = S(), tot = DM.totals(s, true), top = DM.frontier(s);
    portalEl.querySelector('.pt-stats').innerHTML =
      `<span>開いた次元 <b>${tot.open}/${DM.N}</b></span><span>★ <b>${fmt(tot.stars)}</b></span><span>武器 <b>${fmt(tot.kinds)}</b>種</span><span>段位 <b>${fmt(tot.tiers)}</b></span>` +
      `<span class="pt-pow">次元の力 <b>×${fmt(tot.power)}</b><small>（森には ×${fmt(tot.forest)}）</small></span>`;
    const fb = portalEl.querySelector('.pt-f');
    fb.innerHTML = PF.map(([nm], i) => `<button type="button" class="pg-chip${PS.f === i ? ' on' : ''}" data-pf="${i}">${nm}</button>`).join('');
    const rr = portalEl.querySelector('.pt-r');
    const realmCnt = (ri) => { let o = 0; for (let i = 1 + ri * 10; i < 11 + ri * 10; i++) if (i <= top) o++; return o; };
    rr.innerHTML = `<button type="button" class="pg-chip${PS.realm === -2 ? ' on' : ''}" data-pr="-2">全部の界</button><button type="button" class="pg-chip${PS.realm === -1 ? ' on' : ''}" data-pr="-1">🧫 菌</button>` +
      DM.REALMS.map((R, ri) => `<button type="button" class="pg-chip${PS.realm === ri ? ' on' : ''}" data-pr="${ri}">${R.icon} ${R.name.replace(/界$/, '')} <small>${realmCnt(ri)}/10</small></button>`).join('');
    const q = PS.q.toLowerCase();
    const list = [];
    for (let i = 0; i < DM.N; i++) {
      const o = dimInfo(i), m = o.m, R = DM.realmOf(m), gm = DM.GIM[m.gim];
      if (PS.realm !== -2 && m.realm !== PS.realm) continue;
      if (!PF[PS.f][1](i, o)) continue;
      if (q) { const hay = `${m.name} ${R ? R.name + R.noun + R.cur + R.wpn : '菌 DNA 刀'} ${gm.name} ${gm.desc}`.toLowerCase(); if (hay.indexOf(q) < 0) continue; }
      list.push(o);
    }
    const per = window.innerWidth < 640 ? 12 : 24;
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (PS.p < 0) { const k = list.findIndex((o) => o.m.i === (gdim() ? DM.cur : top)); PS.p = k >= 0 ? Math.floor(k / per) : 0; }
    PS.p = Math.max(0, Math.min(pages - 1, PS.p));
    const grid = portalEl.querySelector('.pt-grid');
    grid.innerHTML = list.slice(PS.p * per, PS.p * per + per).map((o) => {
      const m = o.m, i = m.i, R = DM.realmOf(m), gm = DM.GIM[m.gim], fav = !!s.dimFav[i];
      const next = !o.open && i === top + 1;
      const lock = i ? `前の次元「${DM.meta(i - 1).name}」でウェーブ${DM.unlockW(i - 1)}` : `転生${GD.CFG.UNLOCK_PRESTIGE}回で開く`;
      const prevW = i ? DM.peek(s, i - 1) : null;
      const prog = next && prevW ? `あとウェーブ${Math.max(0, DM.unlockW(i - 1) - (prevW.maxWave || 1))}` : '';
      const hue = m.hue + (m.realm >= 0 ? m.realm * 17 : 120);
      return `<div class="pt-card${o.open ? '' : ' locked'}${o.here ? ' here' : ''}${next ? ' next' : ''}" style="--h:${hue}" data-dim="${i}" role="button" tabindex="0" aria-label="${_.esc(m.name)}${o.open ? '' : '（まだ開いていない）'}">
        <span class="pc-ico">${o.open ? m.icon : '🔒'}</span>
        <span class="pc-no">#${i}</span>
        <b class="pc-n">${o.open || next ? _.esc(m.name) : '？？？の次元'}</b>
        <span class="pc-g">${R ? R.name : '原初'} ・ ${gm.icon}${gm.name}</span>
        ${o.open ? `<span class="pc-s">W${o.wave} ・ ★${o.stars} ・ ⚔️${o.kinds}${i ? ` ・ 🏅${o.tiers}` : ''}</span>` : `<span class="pc-s">${next ? '🔓 ' + prog : _.esc(lock)}</span>`}
        ${o.here ? '<em class="pc-here">現在地</em>' : o.open && !o.seen ? '<em class="pc-new">NEW!</em>' : ''}
        <button type="button" class="pc-fav${fav ? ' on' : ''}" data-fav="${i}" aria-label="お気に入り">${fav ? '★' : '☆'}</button>
      </div>`;
    }).join('') || '<p class="muted">見つからなかった</p>';
    portalEl.querySelector('.pt-nav').innerHTML = `<button type="button" class="pg-b" data-d="-1" ${PS.p <= 0 ? 'disabled' : ''}>◀</button><span>${PS.p + 1} / ${pages}ページ ・ ${list.length}件</span><button type="button" class="pg-b" data-d="1" ${PS.p >= pages - 1 ? 'disabled' : ''}>▶</button>`;
  }
  // 新しい次元が開いた
  function onUnlock(d) {
    const m = d.meta, gm = DM.GIM[m.gim], R = DM.realmOf(m);
    Sfx.rankUp(7);
    Sfx.vibrate([30, 40, 30, 40, 80]);
    FX.confetti(180);
    UI.banner('🌀 新しい次元が開いた!!', `${m.icon} ${m.name}（${R.name}）・ ${gm.icon}${gm.name}`, 'win');
    _.toast('🌀', `NEW! ${m.name}`, `右上の 🌀 から行ける ・ ${gm.desc}`, 'gold');
    portalBtn();
    if (d.i === 1 && !UI.blocked()) {
      setTimeout(() => _.modal({
        title: '🌀 次元ポータルが開いた！',
        body: `<p>菌斬り次元でウェーブ${DM.unlockW(0)}に着いたので、次の次元「<b>${_.esc(m.name)}</b>」が開いた。</p><ul class="g-tut"><li>全部で <b>${DM.N}</b> の次元がある（21の界 × 10 ＋ 菌斬り次元）</li><li>界ごとに<b>敵・武器の形・通貨・仲間・BGM</b>が違い、次元ごとに<b>ルール</b>（重力・群体・闇夜・雷雲・鏡写…）が違う</li><li>どの次元でもウェーブ${DM.UNLOCK_W}（奥の次元ほど少し深く、最大40）で次の次元が開く。★（ボス撃破）・武器・段位が<b>次元の力</b>になり、全部の次元と森が強くなる</li><li>仲間はどの次元でも、離れている間も稼ぎ続ける</li></ul><p class="muted">右上の 🌀 でいつでもポータルを開ける。</p>`,
        buttons: [{ text: 'いますぐ行く', cls: 'primary', onClick: () => setTimeout(() => travel('germ', 1), 260) }, { text: 'あとで' }],
      }), 1400);
    }
  }
  // 段位（はしご）の通知はまとめて出す
  let ladAcc = null;
  function onLadder(d) {
    if (!ladAcc) { ladAcc = { gain: 0, gems: 0, top: null }; setTimeout(() => { const a = ladAcc; ladAcc = null; if (!a || !gdim()) return; Sfx.ach(); _.toast('🏅', `段位 +${a.gain}`, `${a.top.l.icon} ${a.top.l.name} ${a.top.to}/${a.top.l.n}段${a.gems ? ` ・ 💎+${a.gems}` : ''}`, a.gain >= 20 ? 'gold' : ''); }, 1200); }
    ladAcc.gain += d.gain;
    ladAcc.gems += d.gems || 0;
    for (const u of d.ups) if (!ladAcc.top || u.to - u.from > ladAcc.top.to - ladAcc.top.from) ladAcc.top = u;
  }
  function onDim(d) {
    if (d.to === 'forest') { const hud = $('#hud'); hud.dataset.rank = String(G.T.rank); hud.style.setProperty('--rkc', D.STYLE.RANKS[G.T.rank].col); }
    if (d.to === 'germ' && d.first && !(d.i > 0)) setTimeout(tutorial, 900);
    if (d.to === 'germ' && HAS_DM && d.i > 0) {
      // 次元に入ったら: 名前とルール（初めてなら武器・通貨・仲間も）
      const m = DM.meta(d.i), gm = DM.GIM[m.gim], lb = DM.LB;
      setTimeout(() => {
        UI.banner(`${m.icon} ${m.name}`, `${gm.icon} ルール「${gm.name}」 ${gm.desc}`, 'stage');
        if (d.first) _.toast(lb.icon, `${DM.realmOf(m).name}へようこそ`, `武器: ${lb.wpn} ・ 通貨: ${lb.curIcon}${lb.cur} ・ 仲間: ${lb.ally} ・ ウェーブ${DM.unlockW(d.i)}で次の次元`, 'gold');
      }, 500);
    }
    portalBtn();
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
      body: `<ol class="g-tut"><li><b>刀をドラッグ</b>して菌を斬る。斬った菌は一瞬止まり、まとめて真っ二つ</li><li><b>群れ</b>（横一列・弧・輪…）は一振りで払えば「一閃」。PENTA KILL・全滅ボーナス</li><li>倒すほど<b>斬撃ランク</b>（E〜SSS）と<b>無双ゲージ</b>がたまる。満タンで<b>無双モード</b></li><li><b>🎰スロット菌</b>は777でDNA×50、<b>💣爆裂菌</b>は誘爆の連鎖、<b>📦宝箱菌</b>・<b>🍀ラッキー細胞</b>も</li><li>10ウェーブごとに<b>巨大病原体</b>。光る<b>弱点</b>を斬って、最後は<b>一刀両断</b></li><li>初めて斬った株は<b>菌図鑑</b>へ。刀ガチャは自動で回り、SSR以上は<b>奥義</b>つき</li></ol><p class="muted">森の木こりはその間も働いている。左上の 🌲 で森へ帰れる。</p>`,
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
  let pbT = 0;
  function frame(dt) {
    const open = G.germOpen();
    pbT -= dt;
    if (pbT <= 0) { pbT = 1; portalBtn(); }
    const bd = $('#btn-dim');
    if (bd && bd.hidden === open) bd.hidden = !open;
    if (bd) bd.classList.toggle('pulse', open && !S().stats.gVisits);
    if (!gdim()) return;
    const g = G.dstate(), T = GM.T, st = GM.stats();
    const k = Math.min(1, dt * 9);
    disp.dna += (g.dna - disp.dna) * k;
    if (Math.abs(g.dna - disp.dna) < Math.max(1, g.dna * 0.0005)) disp.dna = g.dna;
    _.setText('dna', fmt(disp.dna));
    _.setText('dna-rate', `+${fmt(Math.max(GM.dnaRate || 0, GM.cellRate()))}/秒 ・ ${HAS_DM && DM.cur ? '仲間' : '免疫'} ${fmt(st.cellDps)}`);
    _.setText('factor', fmt(S().germ.factor));
    // ウェーブ
    _.setText('wave-n', String(g.wave));
    _.setText('gbiome', Micro.ok ? Micro.biomeName() : GD.BIOMES[0].name);
    if (HAS_DM) {
      const m = DM.meta(DM.cur), gm = DM.GIM[m.gim];
      _.setText('gdim-name', `${m.icon} ${m.name}${DM.cur ? ` ・ ${gm.icon}${gm.name}` : ''}`);
      const uw = DM.unlockW(DM.cur);
      _.setText('gdim-next', DM.cur + 1 < DM.N && (g.maxWave || 1) < uw ? `🌀 W${uw}で次の次元` : '');
    }
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
      _.setText('gboss-name', T.pendingBoss ? LL('⚠️ 巨大病原体 接近中…') : '');
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
    // 斬撃ランク
    const RK = D.STYLE.RANKS, rk = T.rank, nx = RK[rk + 1];
    const lo = RK[rk].th, hi = nx ? nx.th : D.STYLE.MAX;
    _.setScale('grank-g', (T.style - lo) / Math.max(1, hi - lo));
    _.setText('grank-l', RK[rk].id);
    _.setText('grank-w', RK[rk].word);
    _.setText('grank-m', rk ? LL(`DNA×${RK[rk].mult}`) : '');
    _.setCls('grank-box', 'show', T.style > 1.5 || rk > 0);
    const gb = $('#grank-box');
    if (gb && gb.dataset.r !== String(rk)) { gb.dataset.r = String(rk); gb.style.setProperty('--rk', RK[rk].col); const hud = $('#hud'); hud.dataset.rank = String(rk); hud.style.setProperty('--rkc', RK[rk].col); }
    // 無双ゲージ
    if (T.musou > 0) { _.setScale('g-musou-fill', T.musou / (T.musouMax || 1)); _.setText('g-musou-l', `👹 無双 ${T.musou.toFixed(1)}秒`); }
    else { _.setScale('g-musou-fill', T.musouG / 100); _.setText('g-musou-l', '無双ゲージ'); }
    _.setCls('g-musou', 'on', T.musou > 0);
    _.setCls('g-musou', 'near', T.musou <= 0 && T.musouG >= 80);
    // 大発生
    _.setCls('out-bar', 'show', T.outbreak > 0);
    if (T.outbreak > 0) _.setScale('out-fill', T.outbreak / st.outTime);
    updateDock();
  }
  function badges(setBadge) {
    setBadge('dex', dexStats().pending || 0);
    if (!G.germOpen()) return;
    const g = G.dstate();
    let c = 0;
    for (const x of visibleCells()) if (GM.cellCost(x, g.cells[x.id] || 0, 1) <= g.dna) c++;
    setBadge('gcells', c);
    let u = 0;
    for (const x of GD.UPGRADES) if (!GM.upgMaxed(x) && GM.upgCost(x) <= g.dna) u++;
    setBadge('gupg', u);
    let m = 0;
    for (const x of GD.MUTATIONS) if (!GM.mutMaxed(x) && GM.mutCost(x) <= S().germ.factor) m++;
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
    const g = G.dstate();
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
    const g = G.dstate();
    const set = (slot, kind, id, icon, name, sub, cost) => {
      slot.kind = kind; slot.id = id;
      const b = slot.b;
      b.querySelector('.dk-i').textContent = icon;
      b.querySelector('.dk-n').textContent = name;
      b.querySelector('.dk-s').textContent = sub;
      b.querySelector('.dk-c').textContent = CI() + fmt(cost);
      b.classList.toggle('can', cost <= g.dna);
    };
    const sharp = GM.UP.sharp;
    set(dockSlots[0], 'upg', 'sharp', sharp.icon, `切れ味 Lv${GM.lv('sharp')}`, LL('刀のダメージ'), GM.upgCost(sharp));
    const bc = bestCell();
    if (bc) set(dockSlots[1], 'cell', bc.c.id, bc.c.icon, `${bc.c.name} ×${g.cells[bc.c.id] || 0}`, LL('免疫細胞'), bc.cost);
    const an = GM.UP.analyze;
    set(dockSlots[2], 'upg', 'analyze', an.icon, LL(`DNA解析 Lv${GM.lv('analyze')}`), LL('DNA ×1.15'), GM.upgCost(an));
  }

  // ------------------------------------------------------------- タブ: 免疫細胞
  function visibleCells() {
    const g = G.dstate();
    let maxIdx = -1;
    GD.CELLS.forEach((c, i) => { if ((g.cells[c.id] || 0) > 0) maxIdx = i; });
    return GD.CELLS.slice(0, Math.min(GD.CELLS.length, maxIdx + 3));
  }
  function nextMs(n) { for (const [c, x] of GD.MILESTONES) if (n < c) return { at: c, mult: x }; return null; }
  const TabCells = {
    build(root) {
      const s = S(), g = G.dstate();
      root.innerHTML = '';
      const head = _.el('div', 'tab-head');
      const amts = [1, 10, 100, 'max'];
      head.innerHTML = `<div class="seg" role="group" aria-label="まとめ買い">${amts.map((a) => `<button type="button" data-amt="${a}" class="${s.settings.buyAmt === a ? 'on' : ''}">${a === 'max' ? 'MAX' : '×' + a}</button>`).join('')}</div><div class="tab-stat">${LL('免疫の攻撃')} <b class="c-dps">0</b>/秒</div>`;
      head.querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-amt]');
        if (!b) return;
        const v = b.dataset.amt;
        s.settings.buyAmt = v === 'max' ? 'max' : Number(v);
        head.querySelectorAll('[data-amt]').forEach((x) => x.classList.toggle('on', x === b));
        this.update();
      });
      root.appendChild(head);
      root.appendChild(_.el('p', 'muted small tab-note', LL('免疫細胞は画面の端から飛んできて菌を食べる。森にいる間も、離れている間も、ほかの次元にいる間もDNAを稼ぐ。')));
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
      const s = S(), g = G.dstate(), st = GM.stats();
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
        r.bc.textContent = CI() + fmt(cost);
        r.btn.classList.toggle('can', cost <= g.dna);
      }
    },
  };

  // ------------------------------------------------------------- タブ: 研ぎ（強化）
  const TabUpg = {
    build(root) {
      root.innerHTML = '';
      root.appendChild(_.el('div', 'tab-head', LL('<div class="tab-stat">刀のダメージ <b class="u-dmg">0</b></div><div class="tab-stat">DNA倍率 <b class="u-dna">×1</b></div>')));
      this.rows = {};
      for (const [cat, title] of GD.UPG_CATS) {
        root.appendChild(_.el('div', 'sec-title', title));
        const list = _.el('div', 'list');
        for (const u of GD.UPGRADES.filter((x) => x.cat === cat)) {
          const row = _.el('div', 'row upg');
          row.innerHTML = `<div class="r-ico"><span class="emo">${u.icon}</span><b class="r-cnt">0</b></div><div class="r-main"><div class="r-name">${_.esc(LL(u.name))}</div><div class="r-desc">${_.esc(u.desc)}</div><div class="r-sub"></div></div><button type="button" class="buy"><span class="b-n">強化</span><b class="b-c">0</b></button>`;
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
      const g = G.dstate(), st = GM.stats();
      this.dmg.textContent = fmt(st.kdmg);
      this.dna.textContent = `×${fmt(st.dnaMult)}`;
      for (const u of GD.UPGRADES) {
        const r = this.rows[u.id];
        const l = GM.lv(u.id);
        const maxed = GM.upgMaxed(u);
        r.cnt.textContent = String(l);
        r.sub.textContent = LL(upgNow(u.id, st)) + (u.max ? ` ・ Lv${l}/${u.max}` : '');
        const c = GM.upgCost(u);
        r.bc.textContent = maxed ? 'MAX' : CI() + fmt(c);
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
      case 'thunder': return `雷 ${pct(st.thunderP)}・${st.thunderN}体へ`;
      case 'fire': return `炎上 ${pct(st.fireP)}`;
      case 'ice': return `凍結 ${pct(st.iceP)}`;
      case 'boom': return `誘爆 ${pct(st.chainP)}・範囲 ×${(st.boomR / GD.CFG.BOOM_R).toFixed(2)}`;
      case 'musou': return `無双 ${st.musouTime.toFixed(1)}秒`;
      case 'lucky': return `幸運菌 ×${st.luckK.toFixed(2)}`;
      default: return '';
    }
  }

  // ------------------------------------------------------------- タブ: 刀ガチャ・刀
  const kspText = (k, lv) => (k.sp ? Object.keys(k.sp).map((x) => GD.KSP_TEXT[x](k.sp[x] * (1 + 0.2 * (Math.max(1, lv) - 1)))).join(' / ') : 'なし');
  function katDetail(k) {
    const g = G.dstate();
    const n = g.kat[k.id] || 0, lv = G.lvOf(n), R = D.RARITY[k.r];
    const ou = GD.OUGI[k.id], tier = GD.OUGI_TIER[k.r];
    const body = _.el('div', 'axe-detail');
    body.innerHTML = `<div class="ad-icon r-${k.r}">${FX.axeIcon(k, 132)}</div><p class="ad-desc">${_.esc(k.desc)}</p>` +
      `<dl><dt>レア</dt><dd><span class="rb r-${k.r}">${_.RLAB(k.r)}</span> ${_.oneIn(R.p)}</dd>` +
      `<dt>Lv</dt><dd>${n ? `Lv${lv}（${fmt(n)}本・次のLvまで あと${fmt(Math.pow(2, lv) - n)}本）` : '未所持'}</dd>` +
      `<dt>装備時の斬撃</dt><dd>×${(R.tap * (1 + 0.1 * (Math.max(1, lv) - 1))).toFixed(2)}</dd><dt>装備時特性</dt><dd>${_.esc(kspText(k, lv))}</dd>` +
      (ou ? `<dt>奥義</dt><dd>「${_.esc(ou.name)}」 ${tier.need}ゲージで画面の${LL('菌')}を一斉に斬る（×${tier.mult}）</dd>` : '') +
      `<dt>所持ボーナス</dt><dd>${LL('刀')}ダメージ +${(R.pas * 0.5 * Math.max(1, lv) * 100).toFixed(1)}% ・ ${HAS_DM && DM.cur ? '次元の力が少し上がる' : `森の全ダメージ +${Math.round(GD.CFG.KAT_SYNERGY * 100)}%`}</dd></dl>`;
    const isEq = g.keq === k.id;
    _.modal({ title: k.name, body, cls: 'r-' + k.r, buttons: [{ text: isEq ? '装備中' : '装備する', cls: 'primary', disabled: isEq || !n, onClick: () => { GM.equipK(k.id); _.rebuild(); } }, { text: '閉じる' }] });
  }
  const TabKat = {
    build(root) {
      const s = S(), g = G.dstate();
      root.innerHTML = '';
      const st = GM.stats();
      const eq = st.eq;
      if (eq) {
        const ou = GD.OUGI[eq.id];
        const hero = _.el('button', `kat-hero r-${eq.r}`, `<span class="kh-img">${FX.axeIcon(eq, 96)}</span><span class="kh-t"><small>${LL('装備中の刀')}</small><b>${_.esc(eq.name)}</b><span class="rb r-${eq.r}">${_.RLAB(eq.r)}</span>${ou ? `<em>奥義「${_.esc(ou.name)}」</em>` : `<em class="muted">${LL('SSR以上の刀には奥義がある')}</em>`}</span>`);
        hero.type = 'button';
        hero.addEventListener('click', () => katDetail(eq));
        root.appendChild(hero);
      }
      const auto = _.el('div', 'auto-card');
      auto.innerHTML = `<div class="ac-h"><b>⚔️ ${LL('刀ガチャ')}（自動）</b><span class="ac-live">● 回転中</span></div>` +
        `<div class="ac-stats"><div><small>毎秒</small><b class="ac-r">0</b><small>回</small></div><div><small>幸運</small><b class="ac-luck">×1</b></div><div><small>総回転</small><b class="ac-total">0</b></div></div>` +
        `<div class="ac-glvrow"><span>${LL('刀ガチャ')}Lv <b class="ac-glv">1</b></span><div class="ac-gbarw"><i class="ac-gbar"></i></div><small class="ac-gxp"></small></div>` +
        `<p class="ac-boost"></p><div class="ac-feed"></div>`;
      root.appendChild(auto);
      root.appendChild(_.el('p', 'muted small tab-note', LL('菌斬り次元にいる間ずっと回る。連斬が続くほど回転と幸運が上がり、大発生中は回転×2・幸運×1.5。')));
      const tbl = _.el('div', 'rate-tbl');
      tbl.innerHTML = '<div class="rt-h"><span>レア</span><span>基本</span><span>いま</span></div>' + D.RARITY_ORDER.slice().reverse().map((k) => `<div class="rt-r"><span class="rb r-${k}">${_.RLAB(k)}</span><span>${_.oneIn(D.RARITY[k].p)}</span><b class="now-${k}"></b></div>`).join('');
      root.appendChild(tbl);
      const owned = Object.keys(g.kat).length;
      root.appendChild(_.el('div', 'sec-title', `${LL('刀コレクション')} <b>${owned}/${GD.KATANAS.length}</b><span>${HAS_DM && DM.cur ? '1種類ごとに次元の力 +0.2%' : `1種類ごとに森の全ダメージ +${Math.round(GD.CFG.KAT_SYNERGY * 100)}%`} ・ 所持ボーナス ${LL('刀')} +${fmt(Math.round(st.pas * 100))}%</span>`));
      const order = D.RARITY_ORDER.slice().reverse();
      const RI = G.RANK;
      _.paged(root, 'kat', GD.KATANAS.slice().sort((a, b) => order.indexOf(a.r) - order.indexOf(b.r)), 48, [['すべて', () => true], ['持っている', (k) => g.kat[k.id]], ['未入手', (k) => !g.kat[k.id]], ['奥義つき', (k) => !!GD.OUGI[k.id]], ['MYTH以上', (k) => RI[k.r] >= 7]], (k) => {
        const n = g.kat[k.id] || 0;
        const b = _.el('button', `axe-card r-${k.r}${n ? ' owned' : ''}${g.keq === k.id ? ' eq' : ''}`);
        b.type = 'button';
        b.innerHTML = `<span class="ac-r">${_.RLAB(k.r)}${GD.OUGI[k.id] ? '<i class="ac-fan">奥</i>' : ''}</span><div class="ac-icon">${n ? FX.itemIcon(k, 50) : FX.katanaSVG(Object.assign({}, k, { glow: null, blade: ['#3a3a4a', '#1a1a24'], handle: '#2a2a32' }), 50)}</div><div class="ac-name">${n ? _.esc(k.name) : '？？？'}</div><div class="ac-lv">${n ? `Lv${G.lvOf(n)} <small>×${fmt(n)}</small>` : _.oneIn(D.RARITY[k.r].p)}</div>${g.keq === k.id ? '<span class="ac-eq">装備中</span>' : ''}`;
        if (n) b.addEventListener('click', () => katDetail(k)); else b.disabled = true;
        return b;
      });
      Object.assign(this, { aR: auto.querySelector('.ac-r'), aLuck: auto.querySelector('.ac-luck'), aTotal: auto.querySelector('.ac-total'), aGlv: auto.querySelector('.ac-glv'), aGbar: auto.querySelector('.ac-gbar'), aGxp: auto.querySelector('.ac-gxp'), aBoost: auto.querySelector('.ac-boost'), aFeed: auto.querySelector('.ac-feed'), tbl, feedN: -1 });
    },
    update() {
      const s = S(), g = G.dstate(), T = GM.T;
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
      root.appendChild(_.el('div', 'tab-head', '<div class="tab-stat">🧪 変異因子 <b class="m-f">0</b></div><div class="tab-stat">どの次元でもボスを倒すと手に入る</div>'));
      root.appendChild(_.el('p', 'muted small tab-note', '変異は転生してもなくならない。🌿の印は森、🗡️の印は斬る次元（全部の次元）、🌈は両方に効く。'));
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
      const g = S().germ; // 変異因子と変異は全部の次元で共通
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
      const s = S(), st = GM.ST(), gst = GM.stats(), fst = G.stats(), lb = LB();
      root.innerHTML = '';
      const m = HAS_DM ? DM.meta(DM.cur) : null, gm = m ? DM.GIM[m.gim] : null;
      const box = _.el('div', 'prestige-box dim-box');
      box.innerHTML = `<div class="pb-ring" aria-hidden="true"></div><div class="pb-t">${lb.icon} ${_.esc(lb.dim)}</div>` +
        (m && DM.cur ? `<p>${_.esc(DM.realmOf(m).name)} ・ ルール ${gm.icon}${gm.name}: ${_.esc(gm.desc)}</p>` : `<p>森の木こりはずっと働いている。${LL('免疫細胞')}も、森やほかの次元にいる間に${lb.cur}を稼ぐ。</p>`) +
        `<div class="dim-btns">${portalOpenable() ? '<button type="button" class="btn primary big d-portal">🌀 次元ポータル</button>' : ''}<button type="button" class="btn big d-home">🌲 森へ帰る</button></div>`;
      box.querySelector('.d-home').addEventListener('click', () => travel('forest'));
      const pb = box.querySelector('.d-portal');
      if (pb) pb.addEventListener('click', portalOpen);
      root.appendChild(box);
      root.appendChild(_.el('div', 'sec-title', '世界のつながり'));
      const tot = HAS_DM ? DM.totals(s, true) : null;
      const links = _.el('div', 'dim-links');
      links.innerHTML = [
        ...(tot ? [['🌀 次元の力', `×${fmt(tot.power)}`, `★${fmt(tot.stars)} ・ 武器${fmt(tot.kinds)}種 ・ 段位${fmt(tot.tiers)}`], ['🌲 次元の力 → 森', `×${fmt(tot.forest)}`, '次元の力の √ が森に効く']] : []),
        ['🪓 森の斧 → 斬る次元', `×${gst.axeSyn.toFixed(2)}`, '斧1種類ごとに +1%'], ['⚔️ 菌斬り次元の刀 → 森', `×${fst.katMult.toFixed(2)}`, '刀1種類ごとに +1%'],
        ['🧚 精霊 → 斬る次元', `×${gst.spiritK.toFixed(2)}`, '精霊の数の対数で効く'], ['🏆 実績 → 全部', `×${fst.achMult.toFixed(2)}`, ''],
      ].map(([k, v, n]) => `<div class="dl-i"><span>${k}</span><b>${v}</b>${n ? `<small>${n}</small>` : ''}</div>`).join('');
      root.appendChild(links);
      root.appendChild(_.el('div', 'sec-title', `${_.esc(lb.dim)}の記録`));
      const g = G.dstate();
      root.appendChild(_.el('dl', 'records', [
        ['最高ウェーブ', g.maxWave || 1], [`斬った${lb.noun}`, fmt(st.gKills)], ['最高の一閃', `${st.gBestIssen}体`], ['最大連斬', fmt(st.gMaxCombo)],
        ['ボス撃破', fmt(st.gBosses)], ['大発生', fmt(st.gOutbreaks)], ['奥義', fmt(st.gOugi)], [`${lb.wpn}ガチャ`, fmt(st.gRolls) + '回'],
        [`累計${lb.cur}`, fmt(st.gDnaAll)], ['滞在時間', U.fmtTime(st.gTime)],
      ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')));
      // 次元の段位（はしご）
      if (HAS_DM && DM.cur) {
        const lad = g.lad || {};
        let done = 0;
        for (const l of DM.LAD) done += lad[l.k] || 0;
        root.appendChild(_.el('div', 'sec-title', `🏅 段位 <b>${fmt(done)}/${fmt(DM.LAD_N)}</b><span>3段ごとに💎+1・1段ごとに次元の力 +0.1%</span>`));
        const list = _.el('div', 'lad-list');
        list.innerHTML = DM.LAD.map((l) => {
          const d = lad[l.k] || 0, nx = d < l.n ? l.th(d) : null;
          return `<div class="lad${d >= l.n ? ' done' : ''}"><span class="lad-i">${l.icon}</span><b>${l.name}</b><small>${nx != null ? _.esc(l.txt(nx)) : 'コンプリート！'}</small><em>${d}/${l.n}</em><div class="dx-bar"><i style="transform:scaleX(${(d / l.n).toFixed(3)})"></i></div></div>`;
        }).join('');
        root.appendChild(list);
      }
    },
    update() {},
  };

  // ------------------------------------------------------------- タブ: 図鑑（両方の世界のコンプ率と報酬・菌の株）
  function germSVG(X, size, known) {
    if (!known) return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><circle cx="20" cy="21" r="14" fill="#1c1626" stroke="#3a3048" stroke-width="2"/><text x="20" y="27" text-anchor="middle" font-size="16" font-weight="900" fill="#5a4a6a">?</text></svg>`;
    const id = 'gs-' + X.sid;
    const fill = X.pal === 'rainbow' ? `url(#${id})` : `url(#${id})`;
    const stops = X.pal === 'rainbow' ? '<stop offset="0" stop-color="#ff5a5a"/><stop offset=".33" stop-color="#ffd23a"/><stop offset=".66" stop-color="#4fe3ff"/><stop offset="1" stop-color="#c46bff"/>' : `<stop offset="0" stop-color="${X.pal[0]}"/><stop offset="1" stop-color="${X.pal[1]}"/>`;
    const acc = X.acc === 'horns' ? '<path d="M10 11 L13 3 L16 10 Z M24 10 L27 3 L30 11 Z" fill="#fff4e0" stroke="#000" stroke-width="1"/>' : X.acc === 'hat' ? '<rect x="11" y="9" width="18" height="2.5" fill="#1a1424"/><rect x="14" y="2" width="12" height="8" fill="#1a1424"/><rect x="14" y="7" width="12" height="2" fill="#ff3a6a"/>' : X.acc === 'shades' ? '<rect x="11" y="17" width="8" height="5" rx="1" fill="#0a0a12"/><rect x="21" y="17" width="8" height="5" rx="1" fill="#0a0a12"/>' : X.acc === 'halo' ? '<ellipse cx="20" cy="5" rx="9" ry="2.5" fill="none" stroke="#fff2a0" stroke-width="2"/>' : '';
    const eyes = X.acc === 'shades' ? '' : '<circle cx="15" cy="19" r="3.4" fill="#fff"/><circle cx="25" cy="19" r="3.4" fill="#fff"/><circle cx="15.5" cy="19.5" r="1.8" fill="#140a14"/><circle cx="25.5" cy="19.5" r="1.8" fill="#140a14"/>';
    return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs><circle cx="20" cy="22" r="14" fill="${fill}" stroke="#140a14" stroke-width="1.6"/>${eyes}<path d="M16 27 Q20 24 24 27" stroke="#5a0a1a" stroke-width="1.6" fill="none"/>${acc}</svg>`;
  }
  function dexStats() {
    const s = S(), st = s.stats, open = G.germOpen();
    const cats = [
      ['🪓', '斧', Object.keys(s.axes).length, D.AXES.length],
      ['🌲', '森の世界', Math.min(D.BIOMES.length, Math.floor(((st.bestStage || 1) - 1) / 10) + 1), D.BIOMES.length],
      ['👑', '森の主', Math.min(D.BIOMES.length, Math.floor(((st.bestStage || 1) - 1) / 10)), D.BIOMES.length],
      ['🏆', '実績', Object.keys(s.ach).length, D.ACH.length],
    ];
    if (open) {
      // 菌斬り次元の数は入れ替える前の中身（DM.BASE）で数える
      const B = HAS_DM ? DM.BASE : GD;
      const g = s.germ, mw = g.maxWave || 1;
      cats.push(['⚔️', '刀', Object.keys(g.kat).length, B.KATANAS.length], ['🦠', '菌の株', Object.keys(g.dex || {}).length, B.STRAINS.length],
        ['🔬', 'ミクロの世界', Math.min(B.BIOMES.length, Math.floor((mw - 1) / 10) + 1), B.BIOMES.length], ['☣️', 'ボス病原体', Math.min(B.BOSSES.length, Math.floor((mw - 1) / 10)), B.BOSSES.length]);
    }
    const pct = cats.reduce((a, c) => a + c[2] / c[3], 0) / cats.length;
    const steps = Math.floor(pct * 50);
    const pd = portalDex();
    return { cats, pct, steps, pending: Math.max(0, steps - (s.dexClaim || 0)) + (pd ? pd.pending : 0), pd };
  }
  // 次元ポータルの図鑑（別のコンプ率。1%ごとに報酬）
  function portalDex() {
    if (!portalOpenable()) return null;
    const s = S(), t = DM.totals(s), n = DM.N - 1;
    const cats = [
      ['🌀', '開いた次元', t.open, DM.N], ['⚔️', '全次元の武器', t.kinds, n * 440], ['📖', '全次元の敵の種類', t.dex, n * 140],
      ['★', '全次元のボス', t.stars, DM.N * 110], ['🏅', '全次元の段位', t.tiers, n * DM.LAD_N],
    ];
    const pct = cats.reduce((a, c) => a + Math.min(1, c[2] / c[3]), 0) / cats.length;
    const steps = Math.floor(pct * 100);
    return { cats, pct, steps, pending: Math.max(0, steps - (s.dimDexClaim || 0)) };
  }
  function claimDex() {
    const s = S(), d = dexStats();
    if (d.pending <= 0) return;
    let gems = 0;
    const p1 = Math.max(0, d.steps - (s.dexClaim || 0)), p2 = d.pd ? d.pd.pending : 0;
    for (let i = 0; i < p1; i++) gems += 10 + 2 * ((s.dexClaim || 0) + i);
    for (let i = 0; i < p2; i++) gems += 20 + 3 * ((s.dimDexClaim || 0) + i);
    G.gainGems(gems);
    s.dexClaim = Math.max(s.dexClaim || 0, d.steps);
    if (d.pd) s.dimDexClaim = Math.max(s.dimDexClaim || 0, d.pd.steps);
    Sfx.gachaUp(4);
    FX.confetti(120);
    const res = G.autoRoll(60 * d.pending, G.luckNow() * 2);
    _.toast('📖', `図鑑報酬 ×${d.pending}`, `💎+${gems} ・ 斧ガチャ ${fmt(res ? res.n : 0)}回（幸運×2）`, 'gold');
    _.rebuild();
  }
  const TabDex = {
    build(root) {
      const s = S();
      root.innerHTML = '';
      const d = dexStats();
      const box = _.el('div', 'dex-hero');
      box.innerHTML = `<div class="dx-ring" style="--p:${(d.pct * 100).toFixed(1)}"><b>${(d.pct * 100).toFixed(1)}%</b><small>コンプ率</small></div><div class="dx-t"><b>📖 総合図鑑</b><p>2%ごとに報酬（ジェム＋幸運×2の斧ガチャ60回）。両方の世界を集めるほどたまる。</p><button type="button" class="btn primary dx-claim" ${d.pending ? '' : 'disabled'}>${d.pending ? `報酬を受け取る ×${d.pending}` : `次の報酬まで あと${(2 - ((d.pct * 100) % 2)).toFixed(1)}%`}</button></div>`;
      box.querySelector('.dx-claim').addEventListener('click', claimDex);
      root.appendChild(box);
      const list = _.el('div', 'dex-cats');
      list.innerHTML = d.cats.map(([ic, nm, a, b]) => `<div class="dx-cat"><span>${ic} ${nm}</span><b>${fmt(a)}/${fmt(b)}</b><div class="dx-bar"><i style="transform:scaleX(${Math.min(1, a / b)})"></i></div></div>`).join('');
      root.appendChild(list);
      if (d.pd) {
        const pd = d.pd;
        root.appendChild(_.el('div', 'sec-title', `🌀 次元ポータルの図鑑 <b>${(pd.pct * 100).toFixed(2)}%</b><span>1%ごとに報酬（💎）</span>`));
        const pl = _.el('div', 'dex-cats');
        pl.innerHTML = pd.cats.map(([ic, nm, a, b]) => `<div class="dx-cat"><span>${ic} ${nm}</span><b>${fmt(a)}/${fmt(b)}</b><div class="dx-bar"><i style="transform:scaleX(${Math.min(1, a / b)})"></i></div></div>`).join('');
        root.appendChild(pl);
      }
      if (G.germOpen()) {
        const dex = G.dstate().dex || {};
        root.appendChild(_.el('div', 'sec-title', `${LB().icon} ${_.esc(LB().dim)}の${LL('菌図鑑')} <b>${Object.keys(dex).length}/${GD.STRAINS.length}</b><span>${LL(`10種ごとに DNA +${Math.round(GD.CFG.DEX_BONUS * 100)}%`)}（いま ×${GM.stats().dexMult.toFixed(2)}）</span>`));
        _.paged(root, 'dex', GD.STRAINS, 40, [['すべて', () => true], ['登録済み', (x) => dex[x.sid]], ['未登録', (x) => !dex[x.sid]]], (x) => {
          const known = !!dex[x.sid];
          return _.el('div', `dex-cell${known ? ' known' : ''}`, `${germSVG(x, 40, known)}<small>${known ? _.esc(x.name) : `W${x.wave}〜`}</small>${known ? `<em>${fmt(dex[x.sid])}</em>` : ''}`);
        }, 'dex-grid');
      } else root.appendChild(_.el('p', 'muted small tab-note', '転生すると菌斬り次元が開き、刀・菌の株・ミクロの世界・ボス病原体も図鑑に加わる。'));
    },
    update() {},
  };
  function init() {
    _ = UI._;
    Object.assign(_.TITLES, { dex: '📖 図鑑' });
    _.TABS.dex = TabDex;
    Object.assign(_.TITLES, { gcells: '🛡️ 免疫細胞', gupg: '🗡️ 研ぎ', gkat: '⚔️ 刀ガチャ・刀', gmut: '🧬 変異', gdim: '🌀 次元' });
    _.LEFT.push('gcells', 'gupg', 'gkat');
    Object.assign(_.TABS, { gcells: TabCells, gupg: TabUpg, gkat: TabKat, gmut: TabMut, gdim: TabDim });
    const bd = $('#btn-dim');
    if (bd) bd.addEventListener('click', () => { Sfx.unlock(); travel(gdim() ? 'forest' : 'germ'); });
    const bp = $('#btn-portal');
    if (bp) bp.addEventListener('click', () => { Sfx.unlock(); if (portalOn) portalClose(); else portalOpen(); });
    if (HAS_DM) {
      G.on('dimUnlock', onUnlock);
      G.on('ladder', onLadder);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && portalOn) portalClose(); });
    }
    const bb = $('#btn-gboss');
    if (bb) bb.addEventListener('click', () => { if (GM.challengeBoss()) Sfx.boss(); });
    buildDock();
    G.on('dim', onDim);
    G.on('kgLevel', (u) => { if (gdim()) _.toast('🎰', LL(`刀ガチャ Lv${u.lv}!`), `💎+${u.gems} ・ 回転と幸運が少し上がった`); });
    G.on('kEquip', (k) => { if (gdim() && !UI.blocked()) _.toast('⚔️', `${k.name} に持ち替えた`, GD.OUGI[k.id] ? `奥義「${GD.OUGI[k.id].name}」` : _.RLAB(k.r)); });
    G.on('gBuyUpg', () => updateDock(true));
    G.on('gBuyCell', () => updateDock(true));
    G.on('load', applyDim);
    disp.dna = G.dstate() ? G.dstate().dna : 0;
    applyDim();
    if (gdim()) { GM.T.spawnT = 0.6; if (GM.isBossWave(G.dstate().wave) && !G.dstate().farming) { GM.T.pendingBoss = true; GM.T.bossDelay = 2; } }
  }
  return { init, frame, badges, travel, keySlash, applyDim, portalOpen, portalClose, get portalOn() { return portalOn; } };
})();
