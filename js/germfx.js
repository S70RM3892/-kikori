'use strict';
// =====================================================================
//  germfx.js — 菌斬り次元の演出（2Dの文字・閃光・粒、音、バナー）
//  3Dの割れる菌・しずく・刀は micro.js。ここは G.on('g…') を受けて
//  「斬った」「割れた」「一閃」「百人斬り」「大発生」「奥義」を画面全体で見せる。
// =====================================================================
const GFX = (() => {
  let L = null;
  const RN = Math.random;
  const pk = (a) => a[Math.floor(RN() * a.length)];
  let musicT = 0, biteT = 0;
  const RAINBOW = ['#ff5a5a', '#ffd23a', '#7aff6a', '#4fe3ff', '#c46bff', '#ff6ad5'];
  const on = () => G.S.dim === 'germ';
  const blocked = () => L.blocked();
  // 画面の角度（y は下向き）: ワールドの角度 ang の向きに伸びる線
  const scrRot = (ang) => -ang;
  const glowRGB = () => { const eq = GM.stats().eq; return eq && eq.glow && eq.glow !== 'rainbow' ? L.hexRGB(eq.glow) : '200,235,255'; };
  const kSeed = (id) => 100 + Math.max(0, GD.KATANAS.findIndex((k) => k.id === id));
  const fmt = (x) => U.fmt(x);

  // ------------------------------------------------------------- 斬った
  function onSlice(e) {
    if (!on()) return;
    if (e.deflect) Sfx.deflect(); else Sfx.kSlice(e.stier, e.core, e.crit, e.n);
    if (blocked()) return;
    const x = e.x, y = e.y;
    const g = e.g;
    const R = Micro.germScreen(g).r;
    // 刃の閃き（斬った向きに細長く）
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
      const key = 'g' + g.id;
      L.mergeText(key, Micro.germScreen(g).x, Micro.germScreen(g).y - R - 10, e.dmg, (v) => fmt(v), { size: big ? 26 : 18, fill: e.crit ? '#ffd23a' : '#ffffff', stroke: '#14081a', vy: -50, life: 0.7 }, 0.6);
    }
    if (e.core) L.floatText(x + 18, y - 34, '芯!', { size: 20, fill: '#7affe8', stroke: '#002a24', vy: -70, life: 0.55 });
    if (e.crit) { L.floatText(x - 20, y - 48, '会心!!', { size: 24, fill: '#ffd23a', stroke: '#3a1400', vy: -70, life: 0.65 }); L.hitStop(0.05); Micro.shake(0.12); }
    else L.hitStop(0.015);
  }

  // ------------------------------------------------------------- 割れた
  function onKill(d) {
    if (!on()) return;
    const g = d.g;
    const s = Micro.germScreen(g);
    const n = d.issen || 1;
    if (d.src !== 'cell') Sfx.kSplit(n, g.boss);
    if (blocked()) return;
    const x = d.x != null ? d.x : s.x, y = d.y != null ? d.y : s.y;
    // DNA が数字とともにカウンターへ飛ぶ
    L.coins(s.x, s.y, g.boss ? 14 : g.v === 'gold' ? 10 : g.v === 'rainbow' ? 16 : n >= 3 ? 3 : 1, 'dna');
    L.mergeText('dna', s.x, s.y - s.r - 16, d.dna, (v) => '+' + fmt(v) + ' 🧬', { size: 18, fill: '#7affb8', stroke: '#002a14', vy: -60, life: 0.8 }, 0.5);
    if (d.src === 'cell') return;
    // 斬った文字（一閃で続くほど大きく）
    if (n >= 2 || RN() < 0.35 || g.v || g.boss) {
      const word = g.boss ? '撃破' : n >= 5 ? pk(['滅', '両断', '殺菌']) : pk(GD.KILL_WORDS);
      L.floatText(x + (RN() - 0.5) * 30, y - 20, word, { size: Math.min(64, 26 + n * 5), fill: n >= 5 ? '#ffffff' : '#fff6d8', stroke: '#1a0a20', rainbow: n >= 8, vy: -40, life: 0.6, pop: 2.4, rot: (RN() - 0.5) * 0.4 });
    }
    if (n >= 2) L.floatText(s.x, s.y + s.r + 10, `${n}体!${'!'.repeat(Math.min(3, Math.floor(n / 3)))}`, { size: Math.min(44, 18 + n * 3), fill: n >= 5 ? '#ff6ab0' : '#ffe14a', stroke: '#2a0010', vy: -30, life: 0.7 });
    L.hitStop(Math.min(0.12, 0.03 + n * 0.012));
    if (n >= 4) { L.addFlash(Math.min(0.35, 0.08 + n * 0.02), '255,255,255'); Micro.punch(0.04 + n * 0.006); }
    if (n >= 3) L.focusLines(x, y, 0.3, glowRGB(), Math.min(1, n / 8));
    if (g.v === 'gold') {
      Sfx.golden();
      L.radial('rcoin', ['#ffcf4a'], 30, s.x, s.y, { sp: 520, s: 7, g: 500 });
      L.bigTxt('黄金菌!!', s.x, s.y - 60, 40, '#ffd84a');
      L.addFlash(0.3, '255,215,90');
    }
    if (g.v === 'rainbow') {
      L.confetti(90);
      L.radial('star', RAINBOW, 40, s.x, s.y, { sp: 560 });
      L.bigTxt('虹色菌!!!', s.x, s.y - 70, 46, '#ffffff', { rainbow: true });
    }
    if (g.v === 'giant') L.waves(['#ff9a4a', '#ffd27a'], 2, s.x, s.y);
    const t = GM.TY[g.type];
    if (!g.child && !g.boss && (t.split || g.v === 'split')) L.floatText(s.x, s.y + 30, '分裂!', { size: 20, fill: '#9affc8', stroke: '#002a14', vy: -40, life: 0.6 });
    if (!g.child && !g.boss && t.burst) L.floatText(s.x, s.y + 30, '胞子!', { size: 20, fill: '#fff0c0', stroke: '#2a2000', vy: -40, life: 0.6 });
  }

  // ------------------------------------------------------------- 一閃（一振りで何体も）
  function onIssen(d) {
    if (!on()) return;
    Sfx.sheath(d.n);
    if (blocked()) return;
    const W = L.W, H = L.H;
    const y = H * 0.42;
    // 画面を横切る白い一閃
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

  // ------------------------------------------------------------- ウェーブ・ボス・大発生
  function onWave(d) {
    if (!on()) return;
    if (d.boss) return;
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
  function onBossWin(d) {
    if (!on()) return;
    Sfx.bossWin();
    UI.banner('病原体 撃破!!', `🧪変異因子+${d.factor} ・ 💎+${d.gems}`, 'win');
    L.confetti(140);
    L.addFlash(0.5, '255,255,255');
    L.slowmo(0.5);
  }
  function onBossFail(d) {
    if (!on()) return;
    Sfx.bossFail();
    UI.banner('逃げられた…', '研ぎ・免疫細胞を強化して再挑戦！', 'fail');
  }
  function onOutbreak(d) {
    if (!on()) return;
    Sfx.outbreak();
    document.body.classList.add('outbreak');
    UI.banner('☣️ OUTBREAK!!', `菌の大発生！ DNA×${GD.CFG.OUT_DNA}・ダメージ×2・刀ガチャ×2（${Math.round(d.time)}秒）`, 'fever');
    L.addFlash(0.3, '90,255,140');
    Micro.flashLight('#5aff8a', 1);
  }
  function onOutbreakEnd(d) {
    document.body.classList.remove('outbreak');
    if (!on()) return;
    Sfx.outbreakEnd();
    UI.toast('☣️', `大発生 終了: ${d.kills}体`, `🧬+${fmt(d.dna)}`);
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
  }
  function onEscape(g) {
    if (!on() || blocked()) return;
    L.floatText(L.W / 2, L.H * 0.3, g.v === 'rainbow' ? '虹色菌に逃げられた…' : '黄金菌に逃げられた…', { size: 20, fill: '#c8c8d8', stroke: '#14081a', vy: -20, life: 1 });
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
  // 斬撃の形（画面の座標の線: [x1, y1, x2, y2] を 0..1 で）
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
      const len = Math.hypot(x2 - x1, y2 - y1) / 2;
      L.spawn({ t: 'slash', x: (x1 + x2) / 2, y: (y1 + y2) / 2, life: 0.4, max: 0.4, s: len, w: 4, rot: Math.atan2(y2 - y1, x2 - x1), col: col || L.hslRGB((i * 40 + L.clock * 200) % 360), delay: i * 0.035 });
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

  // ------------------------------------------------------------- 毎フレーム: 菌の体力バー・黄金菌の印・BGM
  function draw(c) {
    if (!on() || !Micro.ok) return;
    const T = GM.T;
    for (const g of T.germs) {
      if (!g.alive || g.flee) continue;
      const s = Micro.germScreen(g);
      if (!g.boss && g.hp < g.maxHp) {
        const w = Math.max(30, s.r * 1.4), x = s.x - w / 2, y = s.y - s.r - 12;
        c.fillStyle = 'rgba(10,0,20,0.6)';
        c.fillRect(x - 1, y - 1, w + 2, 6);
        c.fillStyle = g.hp / g.maxHp > 0.5 ? '#7affb0' : g.hp / g.maxHp > 0.25 ? '#ffd23a' : '#ff5a6a';
        c.fillRect(x, y, w * Math.max(0, g.hp / g.maxHp), 4);
      }
      if (g.v === 'gold' || g.v === 'rainbow') {
        // 逃げるまでの残り時間の輪
        const k = Math.max(0, g.life / GD.CFG.GOLD_LIFE);
        c.save();
        c.strokeStyle = g.v === 'gold' ? 'rgba(255,215,80,0.9)' : `hsla(${(L.clock * 300) % 360},100%,65%,0.9)`;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(s.x, s.y, s.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        c.stroke();
        c.restore();
      }
      if (g.v === 'armor' && L.quality > 0) {
        c.save();
        c.globalAlpha = 0.5 + 0.3 * Math.sin(L.clock * 6);
        c.font = '700 11px system-ui, sans-serif';
        c.fillStyle = '#dfe8ff';
        c.textAlign = 'center';
        c.fillText('速く or 芯', s.x, s.y + s.r + 16);
        c.restore();
      }
    }
  }
  function frame(real) {
    if (!on()) return;
    musicT += real;
    if (musicT > 0.5) {
      musicT = 0;
      const T = GM.T;
      const night = document.body.classList.contains('night');
      const lvl = night ? 0 : T.outbreak > 0 || T.boss ? 7 : T.combo >= 100 ? 6 : T.combo >= 60 ? 5 : T.combo >= 30 ? 4 : T.combo >= 10 ? 3 : 2;
      Sfx.musicLevel(lvl);
    }
  }

  function init() {
    L = FX.lib;
    L.addDrawer(draw);
    G.on('gSlice', onSlice);
    G.on('gKill', onKill);
    G.on('gIssen', onIssen);
    G.on('gComboMs', onComboMs);
    G.on('gWave', onWave);
    G.on('gBossStart', onBossStart);
    G.on('gBossWin', onBossWin);
    G.on('gBossFail', onBossFail);
    G.on('gOutbreak', onOutbreak);
    G.on('gOutbreakEnd', onOutbreakEnd);
    G.on('gCell', onCell);
    G.on('gZanshin', onZanshin);
    G.on('gSpawn', onSpawn);
    G.on('gEscape', onEscape);
    G.on('gOugi', onOugi);
    G.on('gOugiHit', onOugiHit);
    G.on('gOugiDone', onOugiDone);
    G.on('dim', (d) => { Sfx.setMode(d.to); if (d.to !== 'germ') document.body.classList.remove('outbreak'); });
  }
  return { init, frame, patternLines };
})();
