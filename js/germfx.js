'use strict';
// =====================================================================
//  germfx.js — 菌斬り次元の演出 v2（2Dの文字・閃光・粒、音、バナー）
//  3Dの割れる菌・しずく・刀・爆発は micro.js。ここは G.on('g…') を受けて
//  「斬った」「居合でまとめて割れた」「何体斬り」「連鎖爆発」「無双」「スロット」
//  「とどめの一刀両断」を、画面全体と音で見せる。
// =====================================================================
const GFX = (() => {
  let L = null;
  const RN = Math.random;
  const pk = (a) => a[Math.floor(RN() * a.length)];
  let musicT = 0, biteT = 0, annT = 0, onoT = 0, spdT = 0;
  const RAINBOW = ['#ff5a5a', '#ffd23a', '#7aff6a', '#4fe3ff', '#c46bff', '#ff6ad5'];
  const ANN = [null, null, 'DOUBLE!', 'TRIPLE!!', 'QUADRA!!', 'PENTA KILL!!!', 'HEXA KILL!!!', 'SEPTA KILL!!!', 'OCTA KILL!!!!', 'NONA KILL!!!!', 'DECA KILL!!!!'];
  const annName = (n) => (n < ANN.length ? ANN[n] : n >= 30 ? 'GODLIKE!!!!!' : n >= 20 ? 'UNSTOPPABLE!!!!' : 'RAMPAGE!!!!');
  const SPEED_W = ['', '', '', '鋭い!', '神速!!', '超神速!!!'];
  const ONO = ['ズバッ!!', 'スパァン!!', 'ザンッ!!', 'シュパッ!!', 'ズシャッ!!', 'ザシュッ!!', 'スパッ!!'];
  const ONO_COL = [['#ffffff', '#1a0a20'], ['#7affe8', '#002a24'], ['#ffe14a', '#3a1400'], ['#ff8ad0', '#3a0018'], ['#b8ffb0', '#0a2a00']];
  const on = () => G.S.dim === 'germ';
  const blocked = () => L.blocked();
  const scrRot = (ang) => -ang;
  const glowRGB = () => { const eq = GM.stats().eq; return eq && eq.glow && eq.glow !== 'rainbow' ? L.hexRGB(eq.glow) : '200,235,255'; };
  const kSeed = (id) => 100 + Math.max(0, GD.KATANAS.findIndex((k) => k.id === id));
  const fmt = (x) => U.fmt(x);
  const scr = (x, y) => Micro.toScreen(x, y);
  const bolts = [], arrows = [], slots = [];

  // ------------------------------------------------------------- 斬った
  function onSlice(e) {
    if (!on()) return;
    if (e.deflect) Sfx.deflect(); else Sfx.kSlice(e.stier, e.core, e.crit, e.n);
    if (e.shatter) Sfx.shatter2();
    if (blocked()) return;
    const x = e.x, y = e.y, g = e.g;
    const R = Micro.germScreen(g).r;
    L.spawn({ t: 'slash', x, y, life: 0.2, max: 0.2, s: R * 1.9 + 30, w: 2.2 + e.stier * 0.6, rot: scrRot(e.ang), col: e.deflect ? '200,210,255' : e.crit ? '255,230,120' : glowRGB() });
    if (e.deflect) {
      L.burst(x, y, 10, { speed: 360, col: '#dfe8ff', life: 0.25, s: 2 });
      L.floatText(x, y - 24, 'カキン!', { size: 22, fill: '#dfe8ff', stroke: '#101830', vy: -60, life: 0.6 });
      L.hitStop(0.03);
      return;
    }
    L.radial('spark', ['#ffffff', 'rgba(' + glowRGB() + ',1)'], 6 + e.stier * 2, x, y, { sp: 420, life: 0.25, s: 2 });
    const big = e.crit || e.core || g.boss;
    if (!e.killed || g.boss) {
      const s = Micro.germScreen(g);
      L.mergeText('g' + g.id, s.x, s.y - R - 10, e.dmg, (v) => fmt(v), { size: big ? 26 : 18, fill: e.crit ? '#ffd23a' : '#ffffff', stroke: '#14081a', vy: -50, life: 0.7 }, 0.6);
    }
    if (e.core) L.floatText(x + 18, y - 34, '芯!', { size: 20, fill: '#7affe8', stroke: '#002a24', vy: -70, life: 0.55 });
    if (e.crit) { L.floatText(x - 20, y - 48, '会心!!', { size: 24, fill: '#ffd23a', stroke: '#3a1400', vy: -70, life: 0.65 }); L.hitStop(0.05); Micro.shake(0.12); }
    else L.hitStop(0.015);
    if (e.shatter) { L.floatText(x, y - 60, '砕!!', { size: 34, fill: '#dff6ff', stroke: '#002a3a', vy: -50, life: 0.7, pop: 2.4 }); L.radial('shard', ['#dff6ff', '#9fe0ff', '#ffffff'], 18, x, y, { sp: 520, s: 6 }); }
    const now = L.clock;
    if (e.stier >= 3 && now - spdT > 0.35) { spdT = now; L.floatText(x + 30, y + 26, SPEED_W[e.stier], { size: 16 + e.stier * 3, fill: ['#fff', '#fff', '#fff', '#9dff4a', '#ffd23a', '#ff8ad0'][e.stier], stroke: '#14081a', vy: -40, life: 0.5, rainbow: e.stier >= 5 }); }
  }

  // ------------------------------------------------------------- 倒した（割れるのは micro.js が居合の「間」のあとで）
  function onKill(d) {
    if (!on()) return;
    const g = d.g;
    const s = Micro.germScreen(g);
    const n = d.issen || 1;
    if (d.src !== 'cell') { Sfx.kSplit(n, g.boss); if (d.src === 'slice') Sfx.ladder(n); }
    if (blocked()) return;
    const x = d.x != null ? d.x : s.x, y = d.y != null ? d.y : s.y;
    L.coins(s.x, s.y, g.boss ? 14 : g.v === 'gold' ? 10 : g.v === 'rainbow' ? 16 : n >= 3 ? 3 : 1, 'dna');
    L.mergeText('dna', s.x, s.y - s.r - 16, d.dna, (v) => '+' + fmt(v) + ' 🧬', { size: 18 + Math.min(10, n), fill: '#7affb8', stroke: '#002a14', vy: -60, life: 0.8 }, 0.5);
    if (d.src === 'cell') return;
    // 擬音（一閃が続くほど大きく）
    const now = L.clock;
    if (n >= 2 || now - onoT > 0.18) {
      onoT = now;
      const c = pk(ONO_COL);
      L.floatText(x + (RN() - 0.5) * 40, y - 30, n >= 5 ? pk(['滅!!', '両断!!', '殺菌!!']) : RN() < 0.4 ? pk(GD.KILL_WORDS) : pk(ONO), { size: Math.min(66, 24 + n * 5), fill: c[0], stroke: c[1], rainbow: n >= 8, vy: -40, life: 0.6, pop: 2.4, rot: (RN() - 0.5) * 0.5 });
    }
    // 何体斬り（一閃の掛け声）
    if (n >= 2 && d.src === 'slice') {
      annT = now;
      Sfx.announce(n);
      L.floatText(L.W / 2, L.H * 0.33, annName(n), { size: Math.min(64, 26 + n * 4), fill: n >= 5 ? '#ffffff' : '#ffe14a', stroke: '#2a0010', rainbow: n >= 5, vy: -18, life: 0.7, pop: 2.6, rot: (RN() - 0.5) * 0.12 });
      L.floatText(s.x, s.y + s.r + 10, `${n}体!${'!'.repeat(Math.min(3, Math.floor(n / 3)))}`, { size: Math.min(44, 18 + n * 3), fill: n >= 5 ? '#ff6ab0' : '#ffe14a', stroke: '#2a0010', vy: -30, life: 0.7 });
    }
    L.hitStop(Math.min(0.12, 0.03 + n * 0.012));
    L.pulse(Math.min(0.4, 0.06 + n * 0.03));
    if (n >= 4) { L.addFlash(Math.min(0.35, 0.08 + n * 0.02), '255,255,255'); Micro.punch(0.04 + n * 0.006); }
    if (n >= 3) L.focusLines(x, y, 0.3, glowRGB(), Math.min(1, n / 8));
    if (g.v === 'gold') { Sfx.golden(); L.radial('rcoin', ['#ffcf4a'], 30, s.x, s.y, { sp: 520, s: 7, g: 500 }); L.bigTxt('黄金菌!!', s.x, s.y - 60, 40, '#ffd84a'); L.addFlash(0.3, '255,215,90'); }
    if (g.v === 'rainbow') { L.confetti(90); L.radial('star', RAINBOW, 40, s.x, s.y, { sp: 560 }); L.bigTxt('虹色菌!!!', s.x, s.y - 70, 46, '#ffffff', { rainbow: true }); }
    if (g.v === 'giant') L.waves(['#ff9a4a', '#ffd27a'], 2, s.x, s.y);
    const t = GM.TY[g.type];
    if (!g.child && !g.boss && (t.split || g.v === 'split')) L.floatText(s.x, s.y + 30, '分裂!', { size: 20, fill: '#9affc8', stroke: '#002a14', vy: -40, life: 0.6 });
    if (!g.child && !g.boss && t.burst) L.floatText(s.x, s.y + 30, '胞子!', { size: 20, fill: '#fff0c0', stroke: '#2a2000', vy: -40, life: 0.6 });
  }
  // 居合: まとめて割れた瞬間
  function onRelease(list) {
    if (!on() || blocked() || list.length < 2) return;
    const ps = list.map((d) => scr(d.g.x, d.g.y));
    let cx = 0, cy = 0;
    for (const p of ps) { cx += p.x; cy += p.y; }
    cx /= ps.length; cy /= ps.length;
    const a = ps[0], b = ps[ps.length - 1];
    const len = Math.max(120, Math.hypot(b.x - a.x, b.y - a.y) / 2 + 80);
    L.spawn({ t: 'slash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, life: 0.32, max: 0.32, s: len, w: 4 + list.length, rot: Math.atan2(b.y - a.y, b.x - a.x), col: '255,255,255' });
    L.floatText(cx, cy - 40, 'ズバ' + 'バ'.repeat(Math.min(6, list.length - 1)) + 'ッ!!', { size: Math.min(60, 26 + list.length * 4), fill: '#ffffff', stroke: '#14081a', rainbow: list.length >= 6, vy: -30, life: 0.7, pop: 2.6, rot: -0.1 });
    Sfx.boom(Math.min(8, list.length), list.length >= 6);
    L.addFlash(Math.min(0.45, 0.12 + list.length * 0.03), '255,255,255');
    Micro.shake(Math.min(1, 0.2 + list.length * 0.08));
  }

  // ------------------------------------------------------------- 一閃・連斬
  function onIssen(d) {
    if (!on()) return;
    Sfx.sheath(d.n);
    if (blocked()) return;
    const W = L.W, H = L.H, y = H * 0.42;
    L.spawn({ t: 'slash', x: W / 2, y, life: 0.32, max: 0.32, s: W * 0.62, w: 3 + Math.min(6, d.n * 0.6), rot: -0.08, col: '255,255,255' });
    L.bigTxt(`一閃 ×${d.n}`, W / 2, y - 10, Math.min(72, 34 + d.n * 3), d.n >= 8 ? '#ffffff' : '#ffe14a', { rainbow: d.n >= 8, life: 1.1 });
    L.floatText(W / 2, y + 40, d.name, { size: Math.min(34, 18 + d.n * 1.4), fill: '#ffffff', stroke: '#1a0a20', vy: -24, life: 1.1, pop: 2 });
    if (d.bonus > 0) L.floatText(W / 2, y + 78, `一閃ボーナス 🧬+${fmt(d.bonus)}${d.gems ? ` 💎+${d.gems}` : ''}`, { size: 16, fill: '#7affb8', stroke: '#002a14', vy: -20, life: 1.1 });
    L.pulse(Math.min(0.6, 0.15 + d.n * 0.04));
    if (d.n >= 4) L.slowmo(Math.min(0.4, 0.1 + d.n * 0.03));
    if (d.n >= 6) { L.addFlash(0.3, '255,255,255'); Micro.shake(0.5); UI.shakeHud(); }
    if (d.n >= 8) { L.confetti(60 + d.n * 4); UI.banner(`一閃 ×${d.n}`, d.name, 'issen'); }
  }
  function onComboMs(d) {
    if (!on()) return;
    Sfx.milestone();
    if (blocked()) return;
    L.bigTxt(d.name, L.W / 2, L.H * 0.3, d.n >= 100 ? 58 : 44, d.n >= 100 ? '#ffffff' : '#ff8ad0', { rainbow: d.n >= 300, life: 1.3 });
    L.waves(d.n >= 100 ? RAINBOW : ['#ff6ab0', '#ffd0e8'], d.n >= 100 ? 4 : 2, L.W / 2, L.H * 0.45);
    if (d.n >= 100) { L.confetti(80); L.addFlash(0.25, '255,180,230'); }
  }

  // ------------------------------------------------------------- 群れ
  function onForm(d) {
    if (!on()) return;
    Sfx.formIn();
    if (blocked()) return;
    const mem = GM.T.germs.filter((x) => x.form === d.id);
    if (!mem.length) return;
    let x = 0, y = 0;
    for (const m of mem) { x += m.x; y += m.y; }
    const p = scr(x / mem.length, y / mem.length);
    const cx = Math.max(40, Math.min(L.W - 40, p.x)), cy = Math.max(170, Math.min(L.H - 190, p.y));
    arrows.push({ x: cx, y: cy, tx: L.W / 2, ty: L.H / 2, life: 1.1, n: d.n });
  }
  function onFormClear(d) {
    if (!on()) return;
    Sfx.formClear();
    if (blocked()) return;
    const p = scr(d.x, d.y);
    L.bigTxt('全滅!!', p.x, p.y - 50, 44, '#ffe14a', { life: 1 });
    L.floatText(p.x, p.y - 4, `群れボーナス 🧬+${fmt(d.dna)}`, { size: 17, fill: '#7affb8', stroke: '#002a14', vy: -30, life: 1 });
    L.radial('star', ['#ffe14a', '#ffffff', '#7affb8'], 30, p.x, p.y, { sp: 480 });
    L.waves(['#ffe14a', '#ffffff'], 2, p.x, p.y);
  }

  // ------------------------------------------------------------- ウェーブ・ボス・大発生・無双
  function onWave(d) {
    if (!on() || d.boss) return;
    Sfx.stage();
    if (blocked()) return;
    if (d.biome) UI.banner(Micro.biomePal(GM.biomeIndex(d.wave)).name, `WAVE ${d.wave} ・ 新しいミクロの世界`, 'stage');
    else L.floatText(L.W / 2, L.H * 0.24, `WAVE ${d.wave}`, { size: 30, fill: '#ffffff', stroke: '#14081a', vy: -20, life: 0.9, pop: 2 });
  }
  function onBossStart(d) {
    if (!on()) return;
    Sfx.gBoss();
    UI.banner('WARNING!!', `巨大病原体「${d.def.name}」 ${Math.round(d.time)}秒以内に斬れ！`, 'boss');
    L.addFlash(0.3, '255,40,60');
    Micro.flashLight('#ff4060', 1.2);
    Micro.shake(0.8);
  }
  function onBossPhase(d) {
    if (!on()) return;
    Sfx.bossPhase();
    if (blocked()) return;
    L.bigTxt(`PHASE ${d.phase + 1}!!`, L.W / 2, L.H * 0.3, 56, '#ff4a6a', { life: 1.1 });
    L.floatText(L.W / 2, L.H * 0.3 + 50, d.phase >= 2 ? '病原体が暴走している！ 弱点を狙え' : '病原体が怒った！ 光る弱点を斬れ', { size: 18, fill: '#ffffff', stroke: '#2a0010', vy: -16, life: 1.2 });
    L.addFlash(0.35, '255,40,60');
    Micro.shake(1);
    UI.shakeHud();
  }
  function onWeakSpawn() { if (on() && !blocked()) { const b = GM.T.boss; if (b) { const p = scr(b.x, b.y); L.floatText(p.x, p.y - Micro.germScreen(b).r - 30, '弱点出現!', { size: 18, fill: '#ff8a9a', stroke: '#2a0010', vy: -30, life: 0.9 }); } } }
  function onWeak(d) {
    if (!on()) return;
    Sfx.weak();
    if (blocked()) return;
    const p = { x: d.x, y: d.y };
    L.bigTxt('弱点!!', p.x, p.y - 60, 44, '#ff4a6a', { life: 0.9 });
    L.floatText(p.x, p.y - 10, fmt(d.dmg), { size: 34, fill: '#ffd23a', stroke: '#2a0a00', vy: -50, life: 0.9, pop: 2.4 });
    L.radial('star', ['#ff4a6a', '#ffffff', '#ffd23a'], 26, p.x, p.y, { sp: 520 });
    L.hitStop(0.1);
    L.addFlash(0.3, '255,80,100');
    Micro.punch(0.12);
    Micro.shake(0.8);
  }
  // とどめ: 一刀両断
  function onFinish(d) {
    if (!on()) return;
    Sfx.finish();
    if (blocked()) return;
    const W = L.W, H = L.H, p = scr(d.g.x, d.g.y);
    L.slowmo(0.7);
    L.hitStop(0.18);
    L.addFlash(0.75, '255,255,255');
    L.spawn({ t: 'slash', x: p.x, y: p.y, life: 0.7, max: 0.7, s: Math.hypot(W, H), w: 10, rot: scrRot(d.ang || 0.2), col: '255,255,255' });
    L.bigTxt('一刀両断!!', W / 2, H * 0.38, Math.min(84, W * 0.16), '#ffffff', { rainbow: true, life: 1.8 });
    L.focusLines(p.x, p.y, 0.8, '255,255,255', 1);
    L.confetti(160);
    Micro.punch(0.35);
    UI.shakeHud();
    Sfx.vibrate([60, 40, 120]);
  }
  function onBossWin(d) {
    if (!on()) return;
    Sfx.bossWin();
    setTimeout(() => { if (on()) UI.banner('病原体 撃破!!', `🧪変異因子+${d.factor} ・ 💎+${d.gems}`, 'win'); }, 650);
    L.coins(L.W / 2, L.H * 0.45, 20, 'dna');
  }
  function onBossFail() {
    if (!on()) return;
    Sfx.bossFail();
    UI.banner('逃げられた…', '研ぎ・免疫細胞を強化して再挑戦！', 'fail');
  }
  function onOutbreak(d) {
    if (!on()) return;
    Sfx.outbreak();
    document.body.classList.add('outbreak');
    UI.banner('☣️ OUTBREAK!!', `菌の大発生！ DNA×${GD.CFG.OUT_DNA}・ダメージ×2（${Math.round(d.time)}秒）`, 'fever');
    L.addFlash(0.3, '90,255,140');
    Micro.flashLight('#5aff8a', 1);
  }
  function onOutbreakEnd(d) {
    document.body.classList.remove('outbreak');
    if (!on()) return;
    Sfx.outbreakEnd();
    UI.toast('☣️', `大発生 終了: ${d.kills}体`, `🧬+${fmt(d.dna)}`);
  }
  function onMusou(d) {
    if (!on()) return;
    Sfx.musouStart();
    document.body.classList.add('musou');
    if (blocked()) return;
    UI.banner('👹 無双!!', `ダメージ×${GD.CFG.MUSOU_DMG}・DNA×${GD.CFG.MUSOU_DNA}・群れが押し寄せる（${Math.round(d.time)}秒）`, 'fever');
    L.bigTxt('無双', L.W / 2, L.H * 0.4, Math.min(120, L.W * 0.26), '#ffffff', { rainbow: true, life: 1.4 });
    L.addFlash(0.5, '255,120,220');
    L.confetti(100);
    L.waves(RAINBOW, 5, L.W / 2, L.H * 0.45, 0.07);
    Micro.punch(0.25);
    Sfx.vibrate([30, 30, 60, 30, 90]);
  }
  function onMusouEnd(d) {
    document.body.classList.remove('musou');
    if (!on()) return;
    Sfx.musouEnd();
    if (blocked()) return;
    L.floatText(L.W / 2, L.H * 0.34, `無双 ${d.kills}体斬り!!`, { size: 30, fill: '#ffe14a', stroke: '#2a0010', vy: -20, life: 1.4, pop: 2.2 });
    L.floatText(L.W / 2, L.H * 0.34 + 40, `🧬+${fmt(d.dna)}`, { size: 20, fill: '#7affb8', stroke: '#002a14', vy: -20, life: 1.4 });
  }

  // ------------------------------------------------------------- 誘爆・雷・炎・氷
  function onBoom(e) {
    if (!on()) return;
    Sfx.boom(e.n, e.boss);
    if (blocked()) return;
    const p = scr(e.x, e.y);
    const R = e.r * Micro.ppu;
    L.waves(e.boss ? ['#ffffff', '#ffe14a'] : ['#ffb04a', '#ffffff'], 2, p.x, p.y, 0.06);
    L.radial('fire', ['#ff7a1a'], Math.min(40, 14 + e.n * 2), p.x, p.y, { sp: R * 2.2, s: 8, g: -120, life: 0.6 });
    if (e.n >= 2) L.floatText(p.x, p.y - 30, `誘爆 ×${e.n}!`, { size: Math.min(48, 20 + e.n * 3), fill: '#ffb04a', stroke: '#2a0a00', rainbow: e.n >= 8, vy: -40, life: 0.7, pop: 2.2 });
    L.hitStop(Math.min(0.08, 0.02 + e.n * 0.006));
    if (e.n >= 3) L.addFlash(Math.min(0.3, 0.06 + e.n * 0.02), '255,180,80');
  }
  function onChain(d) {
    if (!on()) return;
    Sfx.announce(Math.min(10, d.n));
    if (blocked()) return;
    L.bigTxt(`連鎖 ×${d.n}!!`, L.W / 2, L.H * 0.28, Math.min(70, 32 + d.n * 3), '#ffb04a', { rainbow: d.n >= 8, life: 1.2 });
    L.floatText(L.W / 2, L.H * 0.28 + 48, `連鎖ボーナス 🧬+${fmt(d.dna)}`, { size: 17, fill: '#7affb8', stroke: '#002a14', vy: -20, life: 1.2 });
    if (d.n >= 6) L.confetti(60);
  }
  function jag(a, b) {
    const pts = [[a.x, a.y]];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const t = i / n, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const off = (RN() - 0.5) * Math.min(60, l * 0.3);
      pts.push([a.x + dx * t + (-dy / l) * off, a.y + dy * t + (dx / l) * off]);
    }
    pts.push([b.x, b.y]);
    return pts;
  }
  function onThunder(d) {
    if (!on()) return;
    Sfx.zap();
    if (blocked()) return;
    const a = scr(d.from.x, d.from.y);
    for (const t of d.to) { const b = scr(t.x, t.y); bolts.push({ pts: jag(a, b), life: 0.28, max: 0.28 }); L.radial('spark', ['#fff6a8', '#ffffff'], 8, b.x, b.y, { sp: 300, life: 0.25, s: 2 }); }
    L.addFlash(0.12, '255,250,200');
  }
  function onBurn(g) { if (!on()) return; Sfx.burn(); if (!blocked()) { const s = Micro.germScreen(g); L.floatText(s.x, s.y - s.r - 20, '炎上!', { size: 18, fill: '#ffb04a', stroke: '#2a0a00', vy: -40, life: 0.6 }); } }
  function onBurnTick(d) { if (!on() || blocked() || L.quality < 1) return; const s = Micro.germScreen(d.g); L.radial('fire', ['#ff7a1a'], 6, s.x, s.y - s.r * 0.3, { sp: 90, s: 6, g: -160, life: 0.5 }); }
  function onFreeze(g) { if (!on()) return; Sfx.freeze(); if (!blocked()) { const s = Micro.germScreen(g); L.floatText(s.x, s.y - s.r - 20, '凍結!', { size: 18, fill: '#bff4ff', stroke: '#002a3a', vy: -40, life: 0.6 }); L.radial('flake', ['#ffffff', '#bff4ff'], 10, s.x, s.y, { sp: 200, s: 6 }); } }

  // ------------------------------------------------------------- スロット菌・宝箱菌・ラッキー細胞・図鑑
  function onSlot(d) {
    if (!on()) return;
    const p = scr(d.x, d.y);
    slots.push(Object.assign({ t: 0, stops: [0.45, 0.72, 1.0], stopped: 0, done: false, x: p.x, y: p.y }, d));
    if (slots.length > 2) slots.shift();
  }
  function slotDone(s) {
    Sfx.slotWin(s.cat);
    if (blocked()) return;
    const W = L.W;
    const cy = Math.min(L.H * 0.3, 260);
    const txt = s.cat === 'jackpot' ? 'JACKPOT!!! ×50' : s.cat === 'triple' ? `${s.reels[0]}${s.reels[0]}${s.reels[0]} ×10!!` : s.cat === 'pair' ? '×3!' : '×1';
    L.bigTxt(txt, W / 2, cy + 70, s.cat === 'jackpot' ? 54 : s.cat === 'triple' ? 42 : 30, s.cat === 'jackpot' ? '#ffffff' : '#ffe14a', { rainbow: s.cat === 'jackpot', life: 1.3 });
    L.floatText(W / 2, cy + 112, `🧬+${fmt(s.dna)}${s.gems ? ` 💎+${s.gems}` : ''}`, { size: 20, fill: '#7affb8', stroke: '#002a14', vy: -20, life: 1.3 });
    L.coins(W / 2, cy + 40, s.cat === 'jackpot' ? 24 : s.cat === 'triple' ? 12 : 4, 'dna');
    if (s.cat === 'jackpot') { L.confetti(220); L.addFlash(0.6, '255,230,120'); UI.banner('🎰 JACKPOT!!!', `7️⃣7️⃣7️⃣ DNA ×50 ・ 💎+${s.gems}`, 'win'); Micro.shake(1.2); }
    else if (s.cat === 'triple') { L.confetti(90); L.addFlash(0.3, '255,230,120'); }
  }
  function onChest(d) {
    if (!on()) return;
    Sfx.chest(2);
    if (blocked()) return;
    const p = scr(d.x, d.y);
    L.bigTxt('宝箱!!', p.x, p.y - 50, 38, '#ffd27a', { life: 1 });
    L.floatText(p.x, p.y - 8, `💎+${d.gems}${d.rolls ? ` ・ 刀ガチャ${d.rolls}連!` : ''}${d.buff ? ' ・ DNA×2' : ''}`, { size: 17, fill: '#ffffff', stroke: '#2a1400', vy: -30, life: 1.2 });
    L.coins(p.x, p.y, d.gems, 'gem');
    L.radial('star', ['#ffd27a', '#ffffff'], 24, p.x, p.y, { sp: 420 });
  }
  function onCritter() { if (!on()) return; Sfx.critter(); UI.toast('🍀', 'ラッキー細胞が来た！', '逃げる前に斬れば大当たり', 'gold'); }
  function onCritterGet(d) {
    if (!on()) return;
    Sfx.critterGet();
    if (blocked()) return;
    const p = scr(d.x, d.y);
    const bonus = { dna: 'DNA×2（60秒）', musou: '無双ゲージ満タン!!', outbreak: '大発生!!' }[d.bonus];
    L.bigTxt('ラッキー!!', p.x, p.y - 60, 44, '#fff2a0', { rainbow: true, life: 1.2 });
    L.floatText(p.x, p.y - 12, `🧬+${fmt(d.dna)} ・ 💎+${d.gems} ・ ${bonus}`, { size: 16, fill: '#ffffff', stroke: '#2a2000', vy: -30, life: 1.3 });
    L.confetti(80);
    L.coins(p.x, p.y, 12, 'dna');
  }
  function onNewStrain(d) {
    if (!on()) return;
    Sfx.newStrain();
    UI.toast('🦠', `NEW! ${d.name}`, `菌図鑑 ${d.n}/${GD.STRAINS.length} ・ 🧬+${fmt(d.dna)} 💎+1`, 'gold');
    if (d.ms) UI.banner(`菌図鑑 ${d.n}種!!`, `DNA +${Math.round(GD.CFG.DEX_BONUS * 100)}% ・ 💎+10`, 'win');
  }

  // ------------------------------------------------------------- 免疫細胞・残心・黄金菌
  function onCell(e) {
    if (!on() || blocked()) return;
    const now = L.clock;
    if (now - biteT > 0.25) {
      biteT = now;
      Sfx.cellBite();
      const s = Micro.germScreen(e.g);
      L.floatText(s.x + (RN() - 0.5) * 30, s.y - s.r * 0.6, pk(['パクッ', 'もぐっ', 'ガブッ', 'ペロッ']), { size: 15, fill: e.cell ? e.cell.col : '#ffffff', stroke: '#14081a', vy: -50, life: 0.55 });
    }
  }
  function onZanshin(e) {
    if (!on()) return;
    Sfx.kSlice(2, false, false, 3);
    if (blocked()) return;
    const s = Micro.germScreen(e.g);
    L.spawn({ t: 'slash', x: s.x, y: s.y, life: 0.25, max: 0.25, s: s.r * 2.4, w: 3, rot: scrRot(e.ang), col: '200,180,255' });
    L.floatText(s.x, s.y - s.r - 20, '残心', { size: 18, fill: '#d8c8ff', stroke: '#14002a', vy: -50, life: 0.6 });
  }
  function onSpawn(g) {
    if (!on() || blocked()) return;
    if (g.v === 'gold') UI.toast('✨', '黄金菌が出た！', `逃げる前に斬れ！ DNA×${GD.CFG.GOLD_DNA}`, 'gold');
    else if (g.v === 'rainbow') UI.toast('🌈', '虹色菌が出た！！', '斬ると大発生が始まる', 'gold');
    else if (g.v === 'lucky') UI.toast('🎰', 'スロット菌が出た！', '斬るとスロットが回る（777でDNA×50）', 'gold');
  }
  function onEscape(g) {
    if (!on() || blocked()) return;
    const name = { rainbow: '虹色菌', lucky: 'スロット菌', critter: 'ラッキー細胞' }[g.v] || '黄金菌';
    L.floatText(L.W / 2, L.H * 0.3, `${name}に逃げられた…`, { size: 20, fill: '#c8c8d8', stroke: '#14081a', vy: -20, life: 1 });
  }

  // ------------------------------------------------------------- 奥義
  function onOugi(p) {
    if (!on()) return;
    Sfx.skillStart(kSeed(p.id));
    if (blocked()) return;
    L.slowmo(0.12);
    L.pulse(0.4);
    UI.cutIn(p.kat, 'skill');
  }
  function patternLines(kind) {
    const out = [];
    const line = (a, b, c, d) => out.push([a, b, c, d]);
    const ray = (cx, cy, ang, len = 0.9) => line(cx - Math.cos(ang) * len, cy - Math.sin(ang) * len, cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
    switch (kind) {
      case 'cross': line(0, 0.15, 1, 0.85); line(1, 0.15, 0, 0.85); break;
      case 'x': for (const o of [-0.12, 0.12]) { line(0, 0.2 + o, 1, 0.8 + o); line(1, 0.2 + o, 0, 0.8 + o); } break;
      case 'grid': for (const k of [0.3, 0.5, 0.7]) { line(0, k, 1, k); line(k, 0.15, k, 0.85); } break;
      case 'rain': for (let i = 0; i < 9; i++) { const x = 0.05 + i * 0.112; line(x, 0.05, x - 0.05, 0.95); } break;
      case 'triple': for (const o of [-0.18, 0, 0.18]) line(0, 0.3 + o, 1, 0.7 + o); break;
      case 'star': for (let i = 0; i < 5; i++) ray(0.5, 0.5, (i / 5) * Math.PI); break;
      case 'fan': for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2); line(0.05, 0.95, 0.05 + Math.cos(a) * 1.3, 0.95 + Math.sin(a) * 1.3); } break;
      case 'zigzag': for (let i = 0; i < 4; i++) line(i % 2 ? 1 : 0, 0.2 + i * 0.18, i % 2 ? 0 : 1, 0.38 + i * 0.18); break;
      case 'circle': for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, b = ((i + 1) / 10) * Math.PI * 2; line(0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.3, 0.5 + Math.cos(b) * 0.36, 0.5 + Math.sin(b) * 0.3); } break;
      case 'spiral': for (let i = 0; i < 12; i++) ray(0.5, 0.5, (i / 12) * Math.PI + i * 0.05, 0.25 + i * 0.05); break;
      case 'omega': for (let i = 0; i < 16; i++) ray(0.5, 0.5, (i / 16) * Math.PI, 1); break;
      default: for (let i = 0; i < 12; i++) ray(RN(), 0.2 + RN() * 0.6, RN() * Math.PI, 0.6);
    }
    return out;
  }
  function onOugiHit(p) {
    if (!on()) return;
    const kat = p.kat, sk = p.sk;
    Sfx.skillHit(G.RANK[kat.r], kSeed(kat.id));
    Sfx.sheath(10);
    if (blocked()) return;
    const W = L.W, H = L.H;
    const col = kat.glow && kat.glow !== 'rainbow' ? L.hexRGB(kat.glow) : null;
    patternLines(sk.slash).forEach((ln, i) => {
      const x1 = ln[0] * W, y1 = ln[1] * H, x2 = ln[2] * W, y2 = ln[3] * H;
      L.spawn({ t: 'slash', x: (x1 + x2) / 2, y: (y1 + y2) / 2, life: 0.4, max: 0.4, s: Math.hypot(x2 - x1, y2 - y1) / 2, w: 4, rot: Math.atan2(y2 - y1, x2 - x1), col: col || L.hslRGB((i * 40 + L.clock * 200) % 360), delay: i * 0.035 });
    });
    const x = W / 2, y = H * 0.45;
    const ov = L.OV()[sk.ov];
    if (ov) ov(x, y);
    L.bigTxt(sk.name, x, H * 0.3, 40, kat.glow && kat.glow !== 'rainbow' ? kat.glow : '#ffffff', { rainbow: kat.glow === 'rainbow', life: 1.4 });
    L.hitStop(0.14);
    L.addFlash(0.5, col || '255,255,255');
    Micro.shake(1.4);
    Micro.punch(0.18);
    Micro.flashLight(kat.glow && kat.glow !== 'rainbow' ? kat.glow : '#ffffff', 2);
    UI.shakeHud();
    Sfx.vibrate([30, 30, 60]);
  }
  function onOugiDone(d) {
    if (!on() || blocked() || !d.kills) return;
    L.floatText(L.W / 2, L.H * 0.36, `奥義 ${d.kills}体撃破!! 🧬+${fmt(d.dna)}`, { size: 22, fill: '#7affb8', stroke: '#002a14', vy: -20, life: 1.3, pop: 2 });
  }

  // ------------------------------------------------------------- 毎フレーム: 体力バー・印・雷・スロット・群れの矢印・怯え
  function drawSlot(c, s, real) {
    s.t += real;
    while (s.stopped < 3 && s.t >= s.stops[s.stopped]) { Sfx.slotStop(s.stopped); s.stopped++; }
    if (s.stopped < 3) Sfx.slotTick();
    if (!s.done && s.stopped >= 3) { s.done = true; slotDone(s); }
    const life = s.t < 3 ? 1 : Math.max(0, 1 - (s.t - 3) / 0.4);
    if (life <= 0) return false;
    const W = L.W, w = 240, h = 92, x = W / 2 - w / 2, y = Math.min(L.H * 0.3, 260) - 60;
    c.save();
    c.globalAlpha = life;
    c.fillStyle = 'rgba(20,6,30,0.9)';
    c.strokeStyle = s.done && s.cat !== 'none' ? `hsl(${(L.clock * 300) % 360},100%,65%)` : '#ffd27a';
    c.lineWidth = 4;
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, 16); else c.rect(x, y, w, h);
    c.fill(); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const SYM = ['🧬', '🦠', '💎', '⭐', '7'];
    for (let i = 0; i < 3; i++) {
      const rx = x + 18 + i * 72, rw = 60;
      c.fillStyle = '#fff8ec';
      c.fillRect(rx, y + 14, rw, h - 28);
      const sym = i < s.stopped ? s.reels[i] : SYM[Math.floor((L.clock * 22 + i * 3) % SYM.length)];
      const off = i < s.stopped ? 0 : ((L.clock * 900 + i * 40) % 30) - 15;
      c.save();
      c.beginPath(); c.rect(rx, y + 14, rw, h - 28); c.clip();
      if (sym === '7') { c.font = '900 44px "Dela Gothic One", system-ui, sans-serif'; c.fillStyle = '#ff2a3a'; c.strokeStyle = '#4a0008'; c.lineWidth = 3; c.strokeText('7', rx + rw / 2, y + h / 2 + off); c.fillText('7', rx + rw / 2, y + h / 2 + off); }
      else { c.font = '36px system-ui, sans-serif'; c.fillText(sym, rx + rw / 2, y + h / 2 + off); }
      c.restore();
    }
    c.restore();
    return true;
  }
  function draw(c, dt, real) {
    if (!on() || !Micro.ok) return;
    const T = GM.T;
    const hold = Micro.holdInfo;
    for (const g of T.germs) {
      if (!g.alive || g.flee) continue;
      const s = Micro.germScreen(g);
      if (!g.boss && !g.core && g.hp < g.maxHp) {
        const w = Math.max(30, s.r * 1.4), x = s.x - w / 2, y = s.y - s.r - 12;
        c.fillStyle = 'rgba(10,0,20,0.6)';
        c.fillRect(x - 1, y - 1, w + 2, 6);
        c.fillStyle = g.hp / g.maxHp > 0.5 ? '#7affb0' : g.hp / g.maxHp > 0.25 ? '#ffd23a' : '#ff5a6a';
        c.fillRect(x, y, w * Math.max(0, g.hp / g.maxHp), 4);
      }
      if (g.v === 'gold' || g.v === 'rainbow' || g.v === 'lucky') {
        const k = Math.max(0, g.life / GD.CFG.GOLD_LIFE);
        c.save();
        c.strokeStyle = g.v === 'gold' ? 'rgba(255,215,80,0.9)' : `hsla(${(L.clock * 300) % 360},100%,65%,0.9)`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(s.x, s.y, s.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        c.stroke();
        c.restore();
      }
      const icon = { bomb: '💣', lucky: '🎰', chest: '📦' }[g.v];
      if (icon) {
        c.save();
        c.font = `${Math.round(Math.max(16, s.r * 0.7))}px system-ui, sans-serif`;
        c.textAlign = 'center';
        c.globalAlpha = 0.95;
        c.fillText(icon, s.x + s.r * 0.6, s.y - s.r * 0.75 + Math.sin(L.clock * 6 + g.ph * 6) * 3);
        c.restore();
        if (g.v === 'bomb' && L.quality > 0 && RN() < 0.4) L.spawn({ t: 'spark', x: s.x + s.r * 0.75, y: s.y - s.r * 1.05, vx: (RN() - 0.5) * 120, vy: -RN() * 160, life: 0.25, max: 0.25, s: 2, col: '#ffb04a' });
      }
      if (g.crit && L.quality > 0 && RN() < 0.7) L.spawn({ t: 'star', x: s.x + (RN() - 0.5) * s.r * 2, y: s.y + (RN() - 0.5) * s.r * 2, vx: 0, vy: 0, life: 0.5, max: 0.5, s: 4, col: pk(RAINBOW) });
      if (g.v === 'armor' && L.quality > 0) {
        c.save();
        c.globalAlpha = 0.5 + 0.3 * Math.sin(L.clock * 6);
        c.font = '700 11px system-ui, sans-serif';
        c.fillStyle = '#dfe8ff';
        c.textAlign = 'center';
        c.fillText('速く or 芯', s.x, s.y + s.r + 16);
        c.restore();
      }
      // 刀が近いと冷や汗
      if (hold.on && !g.boss && !g.core && Math.hypot(hold.x - g.x, hold.y - g.y) < g.r + 1.4) {
        c.save();
        c.fillStyle = '#9ad8ff';
        const sx = s.x + s.r * 0.7, sy = s.y - s.r * 0.55 + ((L.clock * 60) % 12);
        c.beginPath(); c.moveTo(sx, sy - 7); c.quadraticCurveTo(sx + 5, sy + 2, sx, sy + 5); c.quadraticCurveTo(sx - 5, sy + 2, sx, sy - 7); c.fill();
        c.restore();
      }
    }
    // 雷
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= real;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      const a = b.life / b.max;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineJoin = 'round';
      for (const [w, col] of [[9, `rgba(255,240,120,${0.3 * a})`], [3, `rgba(255,255,255,${a})`]]) {
        c.strokeStyle = col; c.lineWidth = w;
        c.beginPath();
        b.pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        c.stroke();
      }
      c.restore();
    }
    // 群れの矢印
    for (let i = arrows.length - 1; i >= 0; i--) {
      const ar = arrows[i];
      ar.life -= real;
      if (ar.life <= 0) { arrows.splice(i, 1); continue; }
      c.save();
      c.globalAlpha = Math.min(1, ar.life * 2);
      c.font = '900 18px "Dela Gothic One", system-ui, sans-serif';
      c.textAlign = 'center';
      c.lineWidth = 4; c.strokeStyle = '#14081a'; c.fillStyle = '#ffe14a';
      const t = `群れ ×${ar.n}!`;
      c.strokeText(t, ar.x, ar.y - 26); c.fillText(t, ar.x, ar.y - 26);
      c.restore();
    }
    // スロット
    for (let i = slots.length - 1; i >= 0; i--) if (!drawSlot(c, slots[i], real)) slots.splice(i, 1);
  }
  function frame(real) {
    if (!on()) return;
    musicT += real;
    if (musicT > 0.5) {
      musicT = 0;
      const T = GM.T;
      const night = document.body.classList.contains('night');
      Sfx.musicLevel(night || !G.S.settings.bgm ? 0 : T.musou > 0 || T.outbreak > 0 || T.boss ? 7 : Math.max(2, T.rank));
    }
  }

  function init() {
    L = FX.lib;
    L.addDrawer(draw);
    Micro.hooks.release = onRelease;
    const ev = {
      gSlice: onSlice, gKill: onKill, gIssen: onIssen, gComboMs: onComboMs, gForm: onForm, gFormClear: onFormClear,
      gWave: onWave, gBossStart: onBossStart, gBossPhase: onBossPhase, gWeakSpawn: onWeakSpawn, gWeak: onWeak, gFinish: onFinish, gBossWin: onBossWin, gBossFail: onBossFail,
      gOutbreak: onOutbreak, gOutbreakEnd: onOutbreakEnd, gMusou: onMusou, gMusouEnd: onMusouEnd,
      gBoom: onBoom, gChain: onChain, gThunder: onThunder, gBurn: onBurn, gBurnTick: onBurnTick, gFreeze: onFreeze,
      gSlot: onSlot, gChest: onChest, gCritter: onCritter, gCritterGet: onCritterGet, gNewStrain: onNewStrain,
      gCell: onCell, gZanshin: onZanshin, gSpawn: onSpawn, gEscape: onEscape, gOugi: onOugi, gOugiHit: onOugiHit, gOugiDone: onOugiDone,
    };
    for (const k in ev) G.on(k, ev[k]);
    G.on('dim', (d) => { Sfx.setMode(d.to); if (d.to !== 'germ') { document.body.classList.remove('outbreak'); document.body.classList.remove('musou'); } });
  }
  return { init, frame, patternLines };
})();
