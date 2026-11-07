'use strict';
// =====================================================================
//  fx.js — 演出の司令塔
//  ・3Dの伐採シーン（world.js）に命中・伐採・追撃を伝える
//  ・画面全体の2Dオーバーレイ (#fx) にダメージ数字・閃光・火花・軌跡・
//    残像・稲妻・ルーレット・コインを描く
//  ・ヒットストップ／スローモーションの時間制御
// =====================================================================
const FX = (() => {
  let oc, ox;
  let OW = 1, OH = 1, DPR = 1;
  const parts = [], texts = [], trail = [], ghosts = [], bolts = [], roulettes = [];
  let clock = 0;
  let flash = 0, flashRGB = '255,255,255', hitStop = 0, slowmo = 0, comboPop = 0;
  let quality = 2, allowFlash = true, calm = false, rmotion = false;
  const MAXP = [90, 220, 380], MAXT = [26, 48, 84];
  const TRAIL_MS = 150;
  const flareCache = new Map();
  let P2 = null;
  let targets = { wood: null, gem: null };
  let blocked = () => false;
  let held = null;
  let gl = false;
  let dpsT = 0;
  const focus = { t: 0, dur: 0, x: 0, y: 0, col: '255,255,255', lines: null, k: 0 };
  let lastHit = { t: -9, tier: 0, stier: 0, x: 0, y: 0 };
  // 画面全体: 縁の光（スタイルランクの色）・拍の脈動・空のかなたへ飛んだ木のきらめき
  let vPulse = 0, lastBeat = 1;
  const twinkles = [];
  const hslRGB = (h) => {
    const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return `${f(0)},${f(8)},${f(4)}`;
  };
  const ONO = {
    normal: ['ズバッ!!', 'ザシュッ!!', 'スパーン!!', 'ザンッ!!', 'バキィッ!!', 'ズシャッ!!'],
    crit: ['ドゴォッ!!', 'ズドンッ!!', 'バゴォン!!', 'ドガァッ!!'],
    just: ['キィン!!', 'カキーン!!', 'シャキーン!!'],
    fever: ['ズドドドッ!!', 'ズババババ!!', 'ドドドドッ!!'],
  };
  const ONO_COL = [['#ffffff', '#1a0a00'], ['#ffe14a', '#3a1400'], ['#7fe8ff', '#002a3a'], ['#ff6ab0', '#3a0018'], ['#9dff4a', '#0a2a00']];
  const streaks = [];
  let focusCool = 0;
  const drawers = []; // 菌斬り次元などが足す描画（菌の体力バーなど）

  const FONT_D = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif';
  const FONT_B = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';
  const TIER = [
    null,
    { label: 'CRIT!', fill: '#ffd23a', size: 30 },
    { label: 'SUPER CRIT!!', fill: '#ff8a1a', size: 38 },
    { label: 'ULTRA CRIT!!!', fill: '#ff3d8b', size: 48 },
    { label: 'GOD CRIT!!!!', fill: '#ffffff', size: 62, rainbow: true },
  ];
  const SPEED_COL = ['#aab4c0', '#ffffff', '#9dff4a', '#ffd23a', '#ff8a1a', '#ffffff'];
  // 菌斬り次元にいるときは、3Dの描画と手元の刀を micro.js に切り替える
  const gdim = () => G.S.dim === 'germ' && typeof Micro !== 'undefined' && Micro.ok;
  const W3 = () => (gdim() ? Micro : World);
  // いまいる世界の斬撃ランク・熱狂（森はフィーバー、菌斬り次元は無双）
  const curRank = () => (gdim() ? GM.T.rank : G.T.rank);
  const feverNow = () => (gdim() ? GM.T.musou > 0 : G.T.fever > 0);
  const ROUL = [2, 3, 5, 10, 100];

  // ------------------------------------------------------------- 準備
  function init(opts = {}) {
    oc = document.getElementById('fx');
    ox = oc.getContext('2d');
    if (opts.blocked) blocked = opts.blocked;
    P2 = {};
    for (const k in D.AXE_PATHS) P2[k] = new Path2D(D.AXE_PATHS[k]);
    gl = World.init(document.getElementById('gl'));
    if (gl && typeof Micro !== 'undefined') { try { Micro.init(World.renderer); } catch (e) { console.warn('菌斬り次元の3Dを作れない', e); } }
    World.onLanded = landed;
    World.onAxeChange = onAxeChange;
    resize();
    window.addEventListener('resize', resize);
    bind();
    return gl;
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    OW = window.innerWidth;
    OH = window.innerHeight;
    oc.width = Math.round(OW * DPR);
    oc.height = Math.round(OH * DPR);
    oc.style.width = OW + 'px';
    oc.style.height = OH + 'px';
    const c = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    targets = { wood: c(document.querySelector('#cur-wood .ico')), gem: c(document.querySelector('#cur-gem .ico')), dna: c(document.querySelector('#cur-dna .ico')), factor: c(document.querySelector('#cur-factor .ico')) };
    World.resize();
    if (typeof Micro !== 'undefined' && Micro.ok) Micro.resize();
    reel.t = 1;
  }
  function setQuality(settings) {
    const night = document.body.classList.contains('night');
    calm = night;
    rmotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (night) Sfx.musicLevel(0); // 夜は BGM を止める
    quality = night ? Math.min(1, settings.fx) : settings.fx;
    allowFlash = settings.flash && !night;
    World.setQuality(settings);
    if (typeof Micro !== 'undefined' && Micro.ok) Micro.setQuality(settings);
  }

  // ------------------------------------------------------------- 2D粒子・文字
  function spawn(p) {
    if (!(isFinite(p.x) && isFinite(p.y))) return;
    if (p.vx === undefined) p.vx = 0;
    if (p.vy === undefined) p.vy = 0;
    const max = MAXP[quality];
    if (parts.length >= max) parts.splice(0, parts.length - max + 1);
    parts.push(p);
  }
  function floatText(x, y, s, o = {}) {
    if (!(isFinite(x) && isFinite(y))) return;
    // 画面の端で切れないように、文字幅のぶん内側へ寄せる
    const hw = String(s).length * (o.size || 18) * 0.42 * (o.pop || 1.5) * 0.8;
    x = hw * 2 + 12 >= OW ? OW / 2 : U.clamp(x, hw + 6, OW - hw - 6);
    const max = MAXT[quality];
    if (texts.length >= max) texts.splice(0, texts.length - max + 1);
    const t = { x, y, s, size: o.size || 18, fill: o.fill || '#fff', stroke: o.stroke || 'rgba(30,14,4,0.9)', vy: o.vy || -70, vx: o.vx || 0, life: o.life || 0.9, max: o.life || 0.9, pop: o.pop || 1.5, rainbow: !!o.rainbow, light: !!o.light, font: o.font || FONT_D, rot: o.rot || 0 };
    texts.push(t);
    return t;
  }
  // 連続で出る数字は1つにまとめて、出し直すたびに値を足してポンと跳ねさせる
  const merged = {};
  function mergeText(key, x, y, val, fmtFn, o, win = 0.55) {
    const m = merged[key];
    if (m && texts.includes(m.t) && clock - m.at < win) {
      m.sum += val;
      m.t.s = fmtFn(m.sum, ++m.n);
      m.t.x = x; m.t.y = y; m.t.vy = o.vy || -70;
      m.t.life = m.t.max;
      m.t.size = Math.min((o.size || 18) * 1.6, m.t.size + 1.5);
      m.at = clock;
      return m.t;
    }
    const t = floatText(x, y, fmtFn(val, 1), o);
    merged[key] = { t, sum: val, at: clock, n: 1 };
    return t;
  }
  function burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (opts.speed || 260) * (0.4 + Math.random() * 0.6);
      spawn({ t: opts.t || 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: opts.life || 0.5, max: opts.life || 0.5, s: opts.s || 3, col: opts.col || `hsl(${Math.random() * 360},100%,65%)`, g: opts.g || 0 });
    }
  }
  function confetti(n = 80) {
    n = Math.round(n * [0.3, 0.6, 1][quality]);
    for (let i = 0; i < n; i++) {
      spawn({ t: 'confetti', x: Math.random() * OW, y: -10 - Math.random() * OH * 0.3, vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 160, life: 3, max: 3, s: 4 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12, col: `hsl(${Math.random() * 360},95%,62%)`, ph: Math.random() * 6 });
    }
  }
  function coins(x, y, n, kind = 'wood', onArrive) {
    const tgt = targets[kind];
    if (!tgt) { if (onArrive) onArrive(); return; }
    n = Math.max(1, Math.round(n * [0.4, 0.7, 1][quality]));
    for (let i = 0; i < n; i++) {
      const sx0 = x + (Math.random() - 0.5) * 50, sy0 = y + (Math.random() - 0.5) * 40;
      spawn({ t: kind === 'gem' ? 'gem' : kind === 'dna' ? 'dna' : 'coin', x: sx0, y: sy0, sx: sx0, sy: sy0, cx: sx0 + (Math.random() - 0.5) * 240, cy: Math.min(sy0, tgt.y) - 60 - Math.random() * 120, tx: tgt.x, ty: tgt.y, life: 0.7 + i * 0.03, max: 0.7 + i * 0.03, home: true, s: kind === 'gem' ? 7 : 8, rot: 0, cb: i === n - 1 ? onArrive : null, kind });
    }
  }
  function addFlash(v, rgb = '255,255,255') { flash = Math.min(0.7, Math.max(flash, v)); flashRGB = rgb; }
  function addShake(v) { W3().shake(v); }
  function star4(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y - r * 2); c.quadraticCurveTo(x, y, x + r * 2, y); c.quadraticCurveTo(x, y, x, y + r * 2);
    c.quadraticCurveTo(x, y, x - r * 2, y); c.quadraticCurveTo(x, y, x, y - r * 2);
    c.fill();
  }
  function flareSprite(col) {
    let cv = flareCache.get(col);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g2 = cv.getContext('2d');
    const g = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, `rgba(${col},0.85)`);
    g.addColorStop(1, `rgba(${col},0)`);
    g2.fillStyle = g;
    g2.fillRect(0, 0, 128, 128);
    flareCache.set(col, cv);
    return cv;
  }

  // ------------------------------------------------------------- 2Dの斧（残像用）
  function drawAxe2D(c, axe, gx, gy, ang, k, mirror) {
    if (!axe) axe = { blade: ['#e0e6ec', '#7f8b96'], handle: '#7a5533' };
    c.save();
    c.translate(gx, gy);
    c.rotate(ang);
    c.scale(k * mirror, k);
    c.translate(-56, -18);
    const gr = c.createLinearGradient(20, 0, 60, 34);
    gr.addColorStop(0, axe.blade[0]);
    gr.addColorStop(1, axe.blade[1]);
    c.lineWidth = 2.2 / k;
    c.strokeStyle = '#1a1008';
    c.fillStyle = axe.handle;
    c.fill(P2.handle); c.stroke(P2.handle);
    c.fillStyle = gr;
    if (axe.double) { c.fill(P2.blade2); c.stroke(P2.blade2); } else { c.fill(P2.poll); c.stroke(P2.poll); }
    c.fill(P2.blade); c.stroke(P2.blade);
    c.restore();
  }

  // ------------------------------------------------------------- 手持ちの斧・軌跡
  const hexRGB = (h) => { const n = parseInt(h.slice(1), 16); return `${n >> 16},${(n >> 8) & 255},${n & 255}`; };
  function grab(p) { held = { x: p.x, y: p.y, sp: 0 }; trail.length = 0; W3().grab(p); Sfx.grab(); }
  function drag(p, sp) {
    if (!held) return;
    held.x = p.x; held.y = p.y; held.sp = sp;
    trail.push({ x: p.x, y: p.y, t: performance.now(), sp });
    if (trail.length > 80) trail.shift();
    W3().drag(p);
  }
  function release() { held = null; W3().release(); }
  // 刀の軌跡: 細く鋭い白い芯＋刀の光の色。連斬が伸びるほど太く、大発生中は毒々しい虹
  function drawKatanaTrail(c, now) {
    const st = GM.stats(), eq = st.eq, rk = GM.T.rank, mu = GM.T.musou > 0;
    const RK = ['170,220,255', '170,220,255', '170,255,220', '255,225,120', '255,170,60', '255,80,150', '200,120,255'];
    const glowRGB = rk >= 2 && rk < 7 ? RK[rk] : eq && eq.glow && eq.glow !== 'rainbow' ? hexRGB(eq.glow) : '170,220,255';
    const rb = (eq && eq.glow === 'rainbow') || GM.T.outbreak > 0 || mu || rk >= 7;
    const heat = Math.min(1, GM.T.combo / 60) + (mu ? 0.8 : 0) + rk * 0.08;
    if (held && held.sp > 4 && quality > 0 && Math.random() < 0.7) spawn({ t: 'spark', x: held.x, y: held.y, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.25, max: 0.25, s: 2.2, col: rb ? `hsl(${(clock * 500) % 360},100%,70%)` : `rgb(${glowRGB})` });
    c.save();
    c.lineCap = 'round';
    c.globalCompositeOperation = 'lighter';
    for (const wm of [3.2, 1.6, 0.7]) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        const f = i / (trail.length - 1);
        const age = U.clamp((now - b.t) / TRAIL_MS, 0, 1);
        const alpha = (1 - age) * f * (wm > 2 ? 0.22 : wm > 1 ? 0.5 : 1);
        if (alpha <= 0.01) continue;
        const w = (1.5 + Math.min(1, b.sp / 7) * (6 + heat * 6)) * f * wm;
        const col = wm < 1 ? '255,255,255' : null;
        c.strokeStyle = col ? `rgba(${col},${alpha})` : rb ? `hsla(${(clock * 500 + i * 30) % 360},100%,${wm > 2 ? 55 : 70}%,${alpha})` : `rgba(${glowRGB},${alpha})`;
        c.lineWidth = w;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      }
    }
    c.restore();
  }
  function drawTrail(c) {
    const now = performance.now();
    while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();
    if (trail.length < 2) return;
    if (gdim()) { drawKatanaTrail(c, now); return; }
    const lv = G.S.upg.swing || 0;
    const style = lv >= 40 ? 'flame' : lv >= 25 || G.T.fever > 0 ? 'rainbow' : G.T.golden > 0 ? 'gold' : lv >= 1 ? 'glow' : 'plain';
    const eq = G.stats().eq;
    const glowRGB = eq && eq.glow && eq.glow !== 'rainbow' ? hexRGB(eq.glow) : '255,200,110';
    const passes = style === 'plain' ? [1] : [2.6, 1];
    const offs = lv >= 10 ? [0, 1] : [0];
    c.save();
    c.lineCap = 'round';
    c.globalCompositeOperation = 'lighter';
    for (const off of offs) {
      for (const wm of passes) {
        for (let i = 1; i < trail.length; i++) {
          const a = trail[i - 1], b = trail[i];
          const f = i / (trail.length - 1);
          const age = U.clamp((now - b.t) / TRAIL_MS, 0, 1);
          const alpha = (1 - age) * f * (wm > 1 ? 0.3 : 0.85) * (off ? 0.55 : 1);
          if (alpha <= 0.01) continue;
          const w = (3 + Math.min(1, b.sp / 8) * 18 * (1 + lv * 0.012)) * f * wm * (off ? 0.5 : 1);
          let col;
          if (style === 'plain') col = '255,255,255';
          else if (style === 'glow') col = wm > 1 ? glowRGB : '255,255,255';
          else if (style === 'gold') col = wm > 1 ? '255,190,40' : '255,245,200';
          else if (style === 'flame') col = wm > 1 ? '255,90,20' : '255,225,140';
          c.strokeStyle = col ? `rgba(${col},${alpha})` : `hsla(${(clock * 400 + i * 24) % 360},100%,${wm > 1 ? 55 : 78}%,${alpha})`;
          c.lineWidth = w;
          let ox_ = 0, oy_ = 0;
          if (off) { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; ox_ = (-dy / l) * 12; oy_ = (dx / l) * 12; }
          c.beginPath(); c.moveTo(a.x + ox_, a.y + oy_); c.lineTo(b.x + ox_, b.y + oy_); c.stroke();
        }
      }
    }
    c.restore();
    if (style === 'flame' && held && held.sp > 3 && quality > 0 && Math.random() < 0.6) {
      spawn({ t: 'fire', x: held.x, y: held.y, vx: (Math.random() - 0.5) * 60, vy: -30, life: 0.45, max: 0.45, s: 4 + Math.random() * 5, g: -90 });
    }
  }
  function drawGhosts(c, dt) {
    if (!ghosts.length) return;
    const eq = G.stats().eq;
    const k = U.clamp(Math.min(OW, OH) * 0.0032, 0.9, 1.7);
    for (let i = ghosts.length - 1; i >= 0; i--) {
      const g = ghosts[i];
      g.t += dt;
      const p = g.t / g.dur;
      if (p >= 1) { ghosts.splice(i, 1); continue; }
      const span = 90;
      const x = g.x - g.dir * span + g.dir * span * 2 * U.ease.outCubic(p);
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = `rgba(200,160,255,${0.7 * (1 - p)})`;
      c.lineWidth = 8;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(g.x - g.dir * span, g.y); c.lineTo(x, g.y); c.stroke();
      c.restore();
      c.save();
      c.globalAlpha = 0.55 * (1 - p);
      const th = eq && typeof Axe3D !== 'undefined' ? Axe3D.cached(eq.id) : null;
      if (th) {
        const sz = 74 * k;
        c.translate(x, g.y);
        c.scale(g.dir, 1);
        c.rotate(0.35);
        c.drawImage(th.canvas, -sz / 2, -sz / 2, sz, sz);
      } else drawAxe2D(c, eq, x, g.y, 0.15 * g.dir, k, g.dir);
      c.restore();
    }
  }
  function makeBolt(x, y) {
    const pts = [], n = 12;
    const bx = x + (Math.random() - 0.5) * 120;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([U.lerp(bx, x, t) + (i && i < n ? (Math.random() - 0.5) * 46 : 0), U.lerp(-10, y, t)]);
    }
    return { pts, life: 0.24, max: 0.24 };
  }
  function drawBolts(c, dt) {
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      if (b.delay > 0) { b.delay -= dt; continue; }
      b.life -= dt;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      const a = b.life / b.max;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.lineJoin = 'round';
      c.lineCap = 'round';
      for (const [w, col] of [[14, b.col ? `rgba(${b.col},${0.35 * a})` : `rgba(110,170,255,${0.35 * a})`], [6, b.col ? `rgba(${b.col},${0.9 * a})` : `rgba(190,225,255,${0.9 * a})`], [2, `rgba(255,255,255,${a})`]]) {
        c.strokeStyle = col;
        c.lineWidth = w;
        c.beginPath();
        b.pts.forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py)));
        c.stroke();
      }
      c.restore();
    }
  }

  // ------------------------------------------------------------- ボーナスルーレット
  function startRoulette(r) {
    const cp = sceneCenter();
    roulettes.push({ t: 0, dur: r.delay, m: r.m, x: U.clamp(cp.x, 90, OW - 90), y: U.clamp(cp.y - 70, 150, OH * 0.5), idx: 0, next: 0 });
    if (roulettes.length > 3) roulettes.shift();
  }
  function drawRoulettes(c, real) {
    for (let i = roulettes.length - 1; i >= 0; i--) {
      const r = roulettes[i];
      r.t += real;
      const p = r.t / r.dur;
      let label;
      if (p < 1) {
        if (r.t >= r.next) { r.idx = (r.idx + 1) % ROUL.length; r.next = r.t + 0.035 + p * p * 0.2; Sfx.rouletteTick(); }
        label = ROUL[r.idx];
      } else label = r.m;
      if (r.t > r.dur + 1.3) { roulettes.splice(i, 1); continue; }
      const fade = r.t > r.dur + 0.9 ? 1 - (r.t - r.dur - 0.9) / 0.4 : 1;
      const pop = p >= 1 ? 1 + Math.max(0, 0.5 - (r.t - r.dur) * 2.5) : 1;
      c.save();
      c.globalAlpha = Math.max(0, fade);
      c.translate(r.x, r.y);
      c.scale(pop, pop);
      const w = 132, h = 58;
      c.fillStyle = 'rgba(20,10,30,0.9)';
      c.strokeStyle = label >= 100 ? `hsl(${(clock * 500) % 360},100%,60%)` : label >= 10 ? '#ffd23a' : '#fff3c0';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(-w / 2 + 14, -h / 2); c.arcTo(w / 2, -h / 2, w / 2, h / 2, 14); c.arcTo(w / 2, h / 2, -w / 2, h / 2, 14);
      c.arcTo(-w / 2, h / 2, -w / 2, -h / 2, 14); c.arcTo(-w / 2, -h / 2, w / 2, -h / 2, 14);
      c.closePath();
      c.fill();
      c.stroke();
      c.font = `12px ${FONT_B}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#ffd8a0';
      c.fillText('BONUS', 0, -h / 2 - 9);
      c.font = `${p < 1 ? 30 : 36}px ${FONT_D}`;
      c.lineJoin = 'round';
      c.lineWidth = 5;
      c.strokeStyle = '#2a0f00';
      c.strokeText('×' + label, 0, 3);
      c.fillStyle = label >= 100 ? `hsl(${(clock * 500) % 360},100%,65%)` : label >= 10 ? '#ffd23a' : '#ffffff';
      c.fillText('×' + label, 0, 3);
      c.restore();
    }
  }

  // ------------------------------------------------------------- 3Dが使えないときの簡易な木
  function virtualTrunk() {
    return { cx: OW / 2, top: OH * 0.36, bottom: OH * 0.78, notchY: OH * 0.64, justHalf: OH * 0.03, margin: 22, unit: U.clamp(Math.min(OW, OH) * 0.92, 220, 520) };
  }
  function drawFallbackTree(c) {
    const t = G.T.tree;
    if (!t || !t.alive) return;
    const v = virtualTrunk();
    c.fillStyle = '#7a4a2a';
    c.fillRect(v.cx - 22, v.top, 44, v.bottom - v.top);
    c.fillStyle = '#3fae4f';
    c.beginPath(); c.arc(v.cx, v.top - 30, 90, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,225,74,0.4)';
    c.fillRect(v.cx - 30, v.notchY - v.justHalf, 60, v.justHalf * 2);
  }
  const trunkInfo = () => (gdim() ? null : gl ? World.trunkInfo() : G.T.tree && G.T.tree.alive ? virtualTrunk() : null);
  const sceneCenter = () => (gl ? World.canopyScreen() : { x: OW / 2, y: OH * 0.32 });
  const notchPoint = () => { if (gl) return World.notchScreen(); const v = virtualTrunk(); return { x: v.cx, y: v.notchY }; };
  const unit = () => U.clamp(Math.min(OW, OH) * 0.92, 220, 520);

  // ------------------------------------------------------------- チュートリアルの手本
  function drawDemo(c) {
    if (G.S.tut !== 0 || held) return;
    const ti = trunkInfo();
    if (!ti) return;
    const span = Math.min(OW * 0.3, 140);
    const ph = (clock % 1.6) / 1.6;
    const leg = ph < 0.5 ? ph / 0.5 : (ph - 0.5) / 0.5;
    const dir = ph < 0.5 ? 1 : -1;
    const e = U.ease.inOutSine(U.clamp(leg / 0.45, 0, 1));
    const x0 = ti.cx - dir * span, x = x0 + dir * span * 2 * e;
    c.save();
    c.globalAlpha = 0.65 * (1 - Math.max(0, leg - 0.6) / 0.4);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(x0, ti.notchY); c.lineTo(x, ti.notchY); c.stroke();
    c.globalAlpha = 0.95;
    c.font = `36px ${FONT_B}`;
    c.textAlign = 'center';
    c.textBaseline = 'top';
    c.fillText('👆', x, ti.notchY + 6);
    c.restore();
  }

  // ------------------------------------------------------------- オーバーレイ描画
  function drawOverlay(dt, real) {
    const c = ox;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, OW, OH);
    drawVignette(c, real);
    if (!gl && !gdim()) drawFallbackTree(c);
    for (const f of drawers) { try { f(c, dt, real); } catch (e) { console.error(e); } }
    drawTrail(c);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) {
        if (p.home) { if (p.kind === 'gem') Sfx.gem(); else if (p.kind === 'dna') Sfx.dnaTick(); else Sfx.coin(); UI.bump(p.kind); if (p.cb) p.cb(); }
        parts.splice(i, 1);
        continue;
      }
      const a = p.life / p.max;
      if (p.home) {
        const t = U.ease.inQuad(1 - a), it = 1 - t;
        p.x = it * it * p.sx + 2 * it * t * p.cx + t * t * p.tx;
        p.y = it * it * p.sy + 2 * it * t * p.cy + t * t * p.ty;
      } else {
        p.vy += (p.t === 'chip' ? 900 : p.t === 'confetti' ? 60 : p.t === 'dust' ? -20 : p.t === 'drop' || p.t === 'pix' ? 700 : p.t === 'rcoin' ? 500 : p.g || 0) * dt;
        if (p.t === 'heart' || p.t === 'flake') { p.vx += Math.sin(clock * 3 + (p.ph || 0)) * 40 * dt; p.vy = Math.min(p.vy, 140); }
        if (p.t === 'ember') p.vx += Math.sin(clock * 3 + (p.ph || 0)) * 30 * dt;
        if (p.t === 'confetti' || p.t === 'petal' || p.t === 'feather') { p.vx += Math.sin(clock * 4 + (p.ph || 0)) * 40 * dt; p.vx *= 1 - 1.2 * dt; p.vy = Math.min(p.vy, 90); }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.t === 'spark' || p.t === 'dust' || p.t === 'fire' || p.t === 'shard' || p.t === 'moon' || p.t === 'gearp') { p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; }
        if (p.t === 'implode') { p.x += (p.tx - p.x) * Math.min(1, dt * 9); p.y += (p.ty - p.y) * Math.min(1, dt * 9); }
      }
      if (p.rot !== undefined) p.rot += (p.vr || 0) * dt;
      c.save();
      c.globalAlpha = p.t === 'confetti' ? Math.min(1, a * 3) : Math.min(1, a * 1.6);
      c.translate(p.x, p.y);
      switch (p.t) {
        case 'chip': c.rotate(p.rot); c.fillStyle = p.col; c.fillRect(-p.s, -p.s * 0.4, p.s * 2, p.s * 0.8); break;
        case 'spark': c.strokeStyle = p.col; c.lineWidth = p.s * 0.7; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-p.vx * 0.04, -p.vy * 0.04); c.stroke(); break;
        case 'star': c.fillStyle = p.col; star4(c, 0, 0, p.s * (0.6 + a * 0.6)); break;
        case 'confetti': c.rotate(p.rot); c.scale(1, Math.sin(clock * 9 + p.ph)); c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.5); break;
        case 'dust': c.fillStyle = 'rgba(230,215,190,0.55)'; c.beginPath(); c.arc(0, 0, p.s * (1.6 - a * 0.6), 0, 7); c.fill(); break;
        case 'ring': c.strokeStyle = p.col; c.lineWidth = 4 * a; c.beginPath(); c.arc(0, 0, p.s * (1 - a) + 10, 0, 7); c.stroke(); break;
        case 'flare': {
          const r = p.s * (1.15 - a * 0.55);
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = a;
          c.drawImage(flareSprite(p.col || '255,235,190'), -r, -r, r * 2, r * 2);
          break;
        }
        case 'fire':
          c.fillStyle = a > 0.75 ? '#fff4b0' : a > 0.5 ? '#ffb02e' : a > 0.28 ? '#ff5a1f' : 'rgba(70,50,50,0.8)';
          c.beginPath(); c.arc(0, 0, p.s * (1.7 - a), 0, 7); c.fill();
          break;
        case 'heart': {
          const z = p.s;
          c.rotate(Math.sin(clock * 3 + (p.ph || 0)) * 0.3);
          c.fillStyle = p.col;
          c.beginPath(); c.moveTo(0, z * 0.45); c.bezierCurveTo(-z * 1.1, -z * 0.35, -z * 0.55, -z * 1.15, 0, -z * 0.45); c.bezierCurveTo(z * 0.55, -z * 1.15, z * 1.1, -z * 0.35, 0, z * 0.45); c.fill();
          break;
        }
        case 'flake':
          c.rotate(p.rot); c.strokeStyle = p.col; c.lineWidth = Math.max(1, p.s * 0.22); c.lineCap = 'round';
          for (let k = 0; k < 3; k++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(-p.s, 0); c.lineTo(p.s, 0); c.moveTo(p.s * 0.55, 0); c.lineTo(p.s * 0.8, -p.s * 0.25); c.moveTo(p.s * 0.55, 0); c.lineTo(p.s * 0.8, p.s * 0.25); c.stroke(); }
          break;
        case 'meteor':
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.col; c.lineCap = 'round';
          c.lineWidth = p.s; c.beginPath(); c.moveTo(0, 0); c.lineTo(-p.vx * 0.09, -p.vy * 0.09); c.stroke();
          c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, p.s * 0.8, 0, 7); c.fill();
          break;
        case 'clockface': {
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.col; c.globalAlpha = Math.min(1, a * 1.5);
          const R = p.s * (1.15 - a * 0.15);
          c.lineWidth = 4; c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
          for (let k = 0; k < 12; k++) { const an = (k / 12) * Math.PI * 2; c.lineWidth = k % 3 ? 2 : 5; c.beginPath(); c.moveTo(Math.cos(an) * R * 0.82, Math.sin(an) * R * 0.82); c.lineTo(Math.cos(an) * R * 0.95, Math.sin(an) * R * 0.95); c.stroke(); }
          const t1 = (p.spin || 1) * clock * 9, t2 = (p.spin || 1) * clock * 0.75;
          c.lineWidth = 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(t1) * R * 0.8, Math.sin(t1) * R * 0.8); c.stroke();
          c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(t2) * R * 0.5, Math.sin(t2) * R * 0.5); c.stroke();
          break;
        }
        case 'ribbon': {
          // オーロラの帯（画面の幅いっぱい）
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.sin(a * Math.PI) * 0.7;
          c.translate(-p.x, -p.y);
          c.fillStyle = p.col;
          c.beginPath();
          for (let xx = 0; xx <= OW; xx += 16) c.lineTo(xx, p.by + Math.sin(xx * 0.012 + clock * 2 + p.ph) * 26);
          for (let xx = OW; xx >= 0; xx -= 16) c.lineTo(xx, p.by + 46 + Math.sin(xx * 0.012 + clock * 2 + p.ph + 1) * 30);
          c.closePath(); c.fill();
          break;
        }
        case 'tide': {
          // 画面を横切る大波
          c.translate(-p.x, -p.y); c.globalAlpha = Math.min(1, a * 2) * 0.75;
          const off = (1 - a) * (OW + 400) - 200;
          const g2 = c.createLinearGradient(0, OH * 0.45, 0, OH);
          g2.addColorStop(0, 'rgba(160,240,255,0.9)'); g2.addColorStop(1, 'rgba(10,90,180,0.9)');
          c.fillStyle = g2;
          c.beginPath(); c.moveTo(off - 400, OH);
          for (let xx = -400; xx <= 400; xx += 20) c.lineTo(off + xx, OH * 0.55 + Math.cos((xx / 400) * Math.PI) * -OH * 0.12 + Math.sin(xx * 0.05 + clock * 6) * 10);
          c.lineTo(off + 400, OH); c.closePath(); c.fill();
          break;
        }
        case 'crack':
          c.strokeStyle = p.col; c.lineWidth = 2.4; c.globalAlpha = Math.min(1, a * 2);
          c.beginPath();
          for (const seg of p.pts) { c.moveTo(seg[0], seg[1]); for (let k = 2; k < seg.length; k += 2) c.lineTo(seg[k], seg[k + 1]); }
          c.stroke();
          break;
        case 'dna':
          c.rotate(clock * 6 + (p.ph || 0));
          c.fillStyle = '#5affb0'; c.strokeStyle = '#0a4a2a'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(0, 0, p.s, 0, 7); c.fill(); c.stroke();
          c.strokeStyle = '#ffffff'; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(-p.s * 0.5, -p.s * 0.6); c.bezierCurveTo(p.s * 0.6, -p.s * 0.2, -p.s * 0.6, p.s * 0.2, p.s * 0.5, p.s * 0.6); c.stroke();
          c.beginPath(); c.moveTo(p.s * 0.5, -p.s * 0.6); c.bezierCurveTo(-p.s * 0.6, -p.s * 0.2, p.s * 0.6, p.s * 0.2, -p.s * 0.5, p.s * 0.6); c.stroke();
          break;
        case 'rcoin':
        case 'coin':
          c.fillStyle = '#ffcf4a'; c.strokeStyle = '#8a5a10'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(0, 0, p.s, 0, 7); c.fill(); c.stroke();
          c.fillStyle = '#c98a2a'; c.beginPath(); c.arc(0, 0, p.s * 0.55, 0, 7); c.fill();
          c.strokeStyle = '#ffe9a8'; c.beginPath(); c.arc(0, 0, p.s * 0.3, 0, 7); c.stroke();
          break;
        case 'drop':
          c.rotate(Math.atan2(p.vy, p.vx));
          c.fillStyle = p.col; c.beginPath(); c.ellipse(0, 0, p.s * 1.7, p.s * 0.8, 0, 0, 7); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(p.s * 0.5, -p.s * 0.2, p.s * 0.3, 0, 7); c.fill();
          break;
        case 'pix': c.fillStyle = p.col; c.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); break;
        case 'petal':
          c.rotate(p.rot); c.scale(1, 0.55 + 0.45 * Math.sin(clock * 7 + (p.ph || 0)));
          c.fillStyle = p.col; c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.62, 0, 0, 7); c.fill();
          break;
        case 'feather':
          c.rotate(p.rot); c.scale(1, 0.6 + 0.4 * Math.sin(clock * 5 + (p.ph || 0)));
          c.fillStyle = p.col; c.beginPath(); c.ellipse(0, 0, p.s * 1.7, p.s * 0.5, 0, 0, 7); c.fill();
          c.strokeStyle = 'rgba(180,140,60,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-p.s * 1.9, 0); c.lineTo(p.s * 1.6, 0); c.stroke();
          break;
        case 'moon':
          c.rotate(p.rot); c.globalCompositeOperation = 'lighter';
          c.strokeStyle = p.col; c.lineWidth = 2 + 4 * a; c.lineCap = 'round';
          c.beginPath(); c.arc(0, 0, p.s * (1.5 - a * 0.5), -1.15, 1.15); c.stroke();
          break;
        case 'shard':
          c.rotate(p.rot); c.fillStyle = p.col; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(0, -p.s * 1.3); c.lineTo(p.s * 0.55, p.s * 0.6); c.lineTo(-p.s * 0.55, p.s * 0.6); c.closePath(); c.fill(); c.stroke();
          break;
        case 'gearp':
          c.rotate(p.rot); c.fillStyle = p.col;
          for (let k = 0; k < 6; k++) { c.rotate(Math.PI / 3); c.fillRect(-p.s * 0.22, -p.s * 1.35, p.s * 0.44, p.s * 0.6); }
          c.beginPath(); c.arc(0, 0, p.s, 0, 7); c.fill();
          c.fillStyle = 'rgba(40,20,0,0.6)'; c.beginPath(); c.arc(0, 0, p.s * 0.38, 0, 7); c.fill();
          break;
        case 'implode':
          c.globalCompositeOperation = 'lighter'; c.strokeStyle = p.col; c.lineWidth = 2 + (1 - a) * 5;
          c.beginPath(); c.arc(0, 0, Math.max(1, p.s * a), 0, 7); c.stroke();
          break;
        case 'glitch':
          c.globalCompositeOperation = 'lighter'; c.fillStyle = p.col;
          c.fillRect(-p.s * 2 + (Math.random() - 0.5) * 8, -p.h / 2, p.s * 4, p.h);
          break;
        case 'slash': {
          // 斬撃の閃き: 細長いひし形が一瞬で伸びて消える
          c.rotate(p.rot); c.globalCompositeOperation = 'lighter';
          const L = p.s * (0.75 + 0.25 * (1 - a)), w = p.w * Math.sin(Math.min(1, (1 - a) * 3 + 0.2) * Math.PI) + 1;
          c.globalAlpha = Math.min(1, a * 1.8);
          c.fillStyle = `rgba(${p.col},0.75)`;
          c.beginPath(); c.moveTo(-L, 0); c.lineTo(0, -w * 2.2); c.lineTo(L, 0); c.lineTo(0, w * 2.2); c.closePath(); c.fill();
          c.fillStyle = '#ffffff';
          c.beginPath(); c.moveTo(-L * 0.92, 0); c.lineTo(0, -w * 0.7); c.lineTo(L * 0.92, 0); c.lineTo(0, w * 0.7); c.closePath(); c.fill();
          break;
        }
        case 'xslash': {
          // 会心: 十字に交差する斬撃
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = Math.min(1, a * 1.8);
          for (const k of [-1, 1]) {
            c.save();
            c.rotate(p.rot + k * 0.62);
            const L = p.s * (0.75 + 0.25 * (1 - a)), w = p.w * Math.sin(Math.min(1, (1 - a) * 3 + 0.2) * Math.PI) + 1;
            c.fillStyle = `rgba(${p.col},0.75)`;
            c.beginPath(); c.moveTo(-L, 0); c.lineTo(0, -w * 2.2); c.lineTo(L, 0); c.lineTo(0, w * 2.2); c.closePath(); c.fill();
            c.fillStyle = '#ffffff';
            c.beginPath(); c.moveTo(-L * 0.92, 0); c.lineTo(0, -w * 0.7); c.lineTo(L * 0.92, 0); c.lineTo(0, w * 0.7); c.closePath(); c.fill();
            c.restore();
          }
          break;
        }
        case 'arcslash': {
          // JUST: 三日月の斬撃
          c.rotate(p.rot);
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = Math.min(1, a * 1.8);
          const R = p.s * (0.7 + 0.3 * (1 - a));
          c.fillStyle = `rgba(${p.col},0.8)`;
          c.beginPath(); c.arc(0, 0, R, -1.15, 1.15); c.arc(R * 0.3, 0, R * 0.82, 1.05, -1.05, true); c.closePath(); c.fill();
          c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; c.lineCap = 'round';
          c.beginPath(); c.arc(0, 0, R * 0.97, -1.0, 1.0); c.stroke();
          break;
        }
        case 'wave': {
          // 画面いっぱいに広がる衝撃波
          c.globalCompositeOperation = 'lighter';
          const R = 30 + (Math.hypot(OW, OH) * 0.9) * U.ease.outCubic(1 - a);
          c.strokeStyle = `rgba(${p.col},${0.45 * a})`;
          c.lineWidth = 6 + 26 * a;
          c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
          c.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
          c.lineWidth = 2;
          c.beginPath(); c.arc(0, 0, R, 0, 7); c.stroke();
          break;
        }
        case 'ember': {
          c.globalCompositeOperation = 'lighter';
          const r = p.s * (1.6 + Math.sin(clock * 9 + (p.ph || 0)) * 0.4);
          c.globalAlpha = Math.min(1, a * 1.4);
          c.drawImage(flareSprite(p.col), -r * 2, -r * 2, r * 4, r * 4);
          break;
        }
        case 'pillar': {
          c.globalCompositeOperation = 'lighter';
          const w = p.s * a;
          const gr = c.createLinearGradient(0, -p.y, 0, 0);
          gr.addColorStop(0, `rgba(${p.col},0)`); gr.addColorStop(0.7, `rgba(${p.col},0.6)`); gr.addColorStop(1, 'rgba(255,255,255,0.95)');
          c.fillStyle = gr; c.fillRect(-w / 2, -p.y, w, p.y + 10);
          break;
        }
        case 'gem':
          c.rotate(clock * 4);
          c.fillStyle = '#5ee8ff'; c.strokeStyle = '#0a5a7a'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(0, -p.s); c.lineTo(p.s * 0.8, 0); c.lineTo(0, p.s); c.lineTo(-p.s * 0.8, 0); c.closePath(); c.fill(); c.stroke();
          break;
      }
      c.restore();
    }
    drawGhosts(c, dt);
    drawBolts(c, dt);
    drawDemo(c);
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life -= dt;
      if (t.life <= 0) { texts.splice(i, 1); continue; }
      const age = t.max - t.life;
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.vy *= 1 - 1.5 * dt;
      const s = 1 + (t.pop - 1) * Math.max(0, 1 - age / 0.12);
      c.save();
      c.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
      c.translate(t.x, t.y);
      if (t.rot) c.rotate(t.rot);
      c.scale(s, s);
      c.font = `${t.size}px ${t.font}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = t.light ? 3 : Math.max(3, t.size * 0.2);
      c.strokeStyle = t.stroke;
      c.strokeText(t.s, 0, 0);
      c.fillStyle = t.rainbow ? `hsl(${(clock * 400 + t.x) % 360},100%,65%)` : t.fill;
      c.fillText(t.s, 0, 0);
      c.restore();
    }
    drawRoulettes(c, real);
    drawFocus(c, real);
    drawStreaks(c, real);
    if (flash > 0.01 && allowFlash) {
      c.fillStyle = `rgba(${flashRGB},${flash})`;
      c.fillRect(0, 0, OW, OH);
    }
  }

  // ------------------------------------------------------------- 集中線（マンガの効果線）: 大きな瞬間だけ
  function focusLines(x, y, dur = 0.35, col = '255,255,255', k = 1) {
    if (calm || rmotion || quality === 0 || focusCool > 0) return;
    focusCool = 0.6;
    Object.assign(focus, { t: 0, dur, x, y, col, k, lines: null });
  }
  function drawFocus(c, real) {
    focusCool = Math.max(0, focusCool - real);
    if (focus.dur <= 0) return;
    focus.t += real;
    const p = focus.t / focus.dur;
    if (p >= 1) { focus.dur = 0; return; }
    // 2フレームに1回線を引き直してザワザワさせる
    if (!focus.lines || Math.random() < 0.5) {
      const n = quality >= 2 ? 64 : 40;
      focus.lines = [];
      for (let i = 0; i < n; i++) focus.lines.push([(i / n) * Math.PI * 2 + Math.random() * 0.08, 0.32 + Math.random() * 0.3, 0.006 + Math.random() * 0.016]);
    }
    const R = Math.hypot(OW, OH);
    const base = Math.min(OW, OH) * (0.62 - 0.12 * focus.k);
    c.save();
    c.globalAlpha = (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85) * 0.75;
    c.fillStyle = `rgb(${focus.col})`;
    c.beginPath();
    for (const [a, r0, w] of focus.lines) {
      const rin = base * r0 * 1.6;
      c.moveTo(focus.x + Math.cos(a) * rin, focus.y + Math.sin(a) * rin);
      c.lineTo(focus.x + Math.cos(a - w) * R, focus.y + Math.sin(a - w) * R);
      c.lineTo(focus.x + Math.cos(a + w) * R, focus.y + Math.sin(a + w) * R);
      c.closePath();
    }
    c.fill();
    c.restore();
  }
  // 倍速中: 画面の端を風の線が流れる
  function drawStreaks(c, real) {
    const sp = G.gameSpeed ? G.gameSpeed() : 1;
    if (sp > 1 && !calm && !rmotion && quality > 0 && !blocked() && Math.random() < (sp - 1) * 0.35) {
      const top = Math.random() < 0.5;
      streaks.push({ x: OW + 40, y: top ? OH * (0.12 + Math.random() * 0.18) : OH * (0.62 + Math.random() * 0.16), v: OW * (1.6 + Math.random() * 1.2) * (sp - 0.5), l: 40 + Math.random() * 90 * sp });
    }
    if (!streaks.length) return;
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.28)';
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = streaks.length - 1; i >= 0; i--) {
      const st = streaks[i];
      st.x -= st.v * real;
      if (st.x + st.l < -20) { streaks.splice(i, 1); continue; }
      c.moveTo(st.x, st.y);
      c.lineTo(st.x + st.l, st.y);
    }
    c.stroke();
    c.restore();
  }

  // ------------------------------------------------------------- 画面全体: スタイルランクの色で縁が光り、拍で脈打つ
  function rankRGB(r) {
    const R = D.STYLE.RANKS[r];
    return R.rainbow || feverNow() ? hslRGB((clock * 90) % 360) : hexRGB(R.col);
  }
  function drawVignette(c, real) {
    vPulse = Math.max(0, vPulse - real * 2.2);
    const T = G.T, r = curRank(), fev = feverNow(), gold = !gdim() && T.golden > 0;
    const base = [0, 0, 0.05, 0.09, 0.13, 0.17, 0.21, 0.25][r] + (fev ? 0.12 : 0) + (gold ? 0.08 : 0);
    const a = Math.min(0.5, (base + vPulse) * (calm ? 0.4 : 1));
    // 高ランクでは画面の下から火の粉が昇る
    if (r >= 4 && !calm && !rmotion && quality > 0 && !blocked() && Math.random() < (r - 3) * 7 * real * (quality === 2 ? 1 : 0.5)) {
      spawn({ t: 'ember', x: Math.random() * OW, y: OH + 10, vx: (Math.random() - 0.5) * 30, vy: -(140 + Math.random() * 160 + r * 20), life: 1.6 + Math.random(), max: 2.6, s: 1.6 + Math.random() * 2.2, col: r >= 7 || fev ? hslRGB(Math.random() * 360) : hexRGB(D.STYLE.RANKS[r].col), ph: Math.random() * 6, g: -40 });
    }
    if (a < 0.02) return;
    const col = gold && r < 5 ? '255,200,60' : rankRGB(r);
    const w = Math.min(OW, OH) * (0.1 + a * 0.22);
    c.save();
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, w, 0, 0, OW, w);
    edge(0, OH, 0, OH - w, 0, OH - w, OW, w);
    edge(0, 0, w, 0, 0, 0, w, OH);
    edge(OW, 0, OW - w, 0, OW - w, 0, w, OH);
    c.restore();
  }
  // BGM の拍ごとに画面が脈打つ（Bランク以上・フィーバー中）
  function beatPulse() {
    const bp = Sfx.beatPhase();
    if (bp < 0) { lastBeat = 1; return; }
    if (bp < lastBeat) {
      const r = curRank(), fev = feverNow();
      if ((r >= 3 || fev) && !calm && !blocked()) {
        vPulse = Math.max(vPulse, 0.06 + r * 0.025 + (fev ? 0.08 : 0));
        if (!rmotion) W3().punch(0.006 + r * 0.0025 + (fev ? 0.008 : 0));
        if (r >= 5 || fev) UI.beat();
      }
    }
    lastBeat = bp;
  }
  // スタイルランクが変わったとき
  function onRank(d) {
    const R = D.STYLE.RANKS[d.rank];
    W3().setRank(d.rank, R.col, R.rainbow);
    Sfx.musicLevel(calm || !G.S.settings.bgm ? 0 : gdim() ? Math.max(2, d.rank) : d.rank);
    if (!d.up) { if (d.prev >= 3) Sfx.rankDown(); return; }
    if (blocked()) return;
    Sfx.rankUp(d.rank);
    vPulse = Math.max(vPulse, 0.25 + d.rank * 0.04);
    if (d.rank < 3) return;
    const np = gdim() ? { y: OH * 0.56 } : notchPoint();
    const cx = OW / 2, cy = Math.min(OH * 0.42, np.y - 140);
    floatText(cx, cy, R.id, { size: 84 + d.rank * 12, fill: R.col, stroke: '#1a0a00', rainbow: !!R.rainbow, pop: 2.8, vy: -14, life: 0.95, rot: -0.08 });
    floatText(cx, cy + 58 + d.rank * 4, R.word, { size: 22 + d.rank * 2, fill: '#ffffff', stroke: '#1a0a00', pop: 2.2, vy: -14, life: 0.95 });
    spawn({ t: 'wave', x: cx, y: cy, life: 0.6, max: 0.6, col: rankRGB(d.rank) });
    if (d.rank >= 5) {
      focusLines(cx, cy, 0.5, rankRGB(d.rank), 0.8);
      W3().roll((Math.random() < 0.5 ? -1 : 1) * 0.06);
      addFlash(0.16, rankRGB(d.rank));
      UI.shakeHud();
    }
    UI.wave(d.rank);
    Sfx.vibrate(d.rank >= 5 ? [20, 30, 40] : 12);
  }
  // 倒し方を選ぶ: 最速で斬ると空のかなたへ、会心や複数本は粉々、ランクが高いほど派手な倒れ方が増える
  function fellVariant(d) {
    const tree = d.tree;
    if (tree.boss || tree.rar.id !== 'normal' || clock - lastHit.t > 0.12 && !d.multi) return 'launch';
    const r = Math.random(), rk = G.T.rank;
    if (lastHit.stier >= 5 && r < 0.4) return 'star';
    if ((lastHit.tier >= 2 || d.multi >= 3) && r < 0.6) return 'shatter';
    if (r < 0.06 + rk * 0.025) return 'star';
    if (r < 0.16 + rk * 0.05) return 'shatter';
    return 'launch';
  }
  function drawTwinkles(c, real) {
    for (let i = twinkles.length - 1; i >= 0; i--) {
      const tw = twinkles[i];
      tw.t -= real;
      if (tw.t > 0) continue;
      twinkles.splice(i, 1);
      Sfx.twinkle();
      spawn({ t: 'star', x: tw.x, y: tw.y, life: 0.7, max: 0.7, s: 13, col: '#ffffff' });
      spawn({ t: 'flare', x: tw.x, y: tw.y, life: 0.5, max: 0.5, s: 70, col: '255,250,200' });
      burst(tw.x, tw.y, 10, { col: '#fff6a0', speed: 160, life: 0.5 });
      floatText(tw.x, tw.y + 30, 'キラーン☆', { size: 16, fill: '#fff6a0', stroke: '#3a2a00', vy: -20, life: 0.8, light: true });
    }
  }

  // ------------------------------------------------------------- オートガチャの帯: 引いた結果がレアの色のチップになって流れ続ける
  const reel = { cv: null, cx: null, w: 0, h: 0, chips: [], acc: 0, best: -1, n: 0, t: 1 };
  const RCOL = D.RARITY_ORDER.map((k) => D.RARITY[k].col);
  const RLABS = D.RARITY_ORDER.map((k) => D.RARITY[k].label || k);
  function reelFit() {
    const cv = document.getElementById('rs-reel');
    if (!cv) return;
    const b = cv.getBoundingClientRect();
    if (b.width < 10) return;
    reel.cv = cv;
    reel.cx = cv.getContext('2d');
    if (reel.w !== b.width || reel.h !== b.height) {
      reel.w = b.width; reel.h = b.height;
      cv.width = Math.round(b.width * DPR); cv.height = Math.round(b.height * DPR);
    }
  }
  function onRolls(d) {
    for (let i = d.counts.length - 1; i >= 0; i--) if (d.counts[i] > 0) { reel.best = Math.max(reel.best, i); break; }
    reel.n += d.n;
  }
  function drawReel(real) {
    reel.t += real;
    if (reel.t > 1) { reel.t = 0; reelFit(); }
    const c = reel.cx;
    if (!c) return;
    const W = reel.w, H = reel.h;
    reel.acc += real;
    if (reel.acc >= 1 / 14 && reel.n > 0) {
      reel.acc = 0;
      const ri = reel.best;
      reel.chips.push({ x: W + 20, ri, n: reel.n, born: clock });
      if (ri >= 2) Sfx.rollTick(ri);
      reel.best = -1;
      reel.n = 0;
    }
    const sp = 60 + Math.min(300, G.rollRate() * 5);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, W, H);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = reel.chips.length - 1; i >= 0; i--) {
      const ch = reel.chips[i];
      ch.x -= sp * real;
      if (ch.x < -40) { reel.chips.splice(i, 1); continue; }
      const ri = ch.ri, w = ri >= 5 ? 40 : ri >= 3 ? 32 : ri >= 2 ? 26 : 20, h = H - 6;
      const age = clock - ch.born, pop = ri >= 3 ? 1 + Math.max(0, 0.4 - age) * 1.2 : 1;
      c.save();
      c.translate(ch.x, H / 2);
      c.scale(pop, pop);
      const col = ri >= 9 ? `hsl(${(clock * 300) % 360},100%,65%)` : RCOL[ri];
      // 光彩は影ぼかしを使わず、ひとまわり大きい半透明の角丸で描く（軽い）
      if (ri >= 3) {
        c.globalAlpha = 0.35;
        c.fillStyle = col;
        c.beginPath();
        if (c.roundRect) c.roundRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 8); else c.rect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
        c.fill();
      }
      c.globalAlpha = ri <= 0 ? 0.45 : ri === 1 ? 0.7 : 1;
      c.fillStyle = ri >= 4 ? col : 'rgba(0,0,0,0.55)';
      c.strokeStyle = col;
      c.lineWidth = ri >= 2 ? 2 : 1;
      c.beginPath();
      if (c.roundRect) c.roundRect(-w / 2, -h / 2, w, h, 6); else c.rect(-w / 2, -h / 2, w, h);
      c.fill();
      c.stroke();
      c.fillStyle = ri >= 4 ? '#1a0a1a' : col;
      c.font = `${ri >= 3 ? 12 : 10}px ${FONT_D}`;
      c.fillText(RLABS[ri], 0, 1);
      c.restore();
    }
  }

  // ------------------------------------------------------------- 必殺技（SSR以上の斧）
  const RN = Math.random;
  const pk = (a) => a[Math.floor(RN() * a.length)];
  const qn = () => [0.4, 0.7, 1][quality];
  // 画面の上から降らせる
  function rain(t, cols, n, o = {}) {
    n = Math.round(n * qn());
    for (let i = 0; i < n; i++) {
      const life = (o.life || 2.2) * (0.8 + RN() * 0.4);
      spawn({ t, x: RN() * OW, y: -20 - RN() * 60, vx: (o.vx || 0) + (RN() - 0.5) * 80, vy: (o.vy || 260) + RN() * 200, life, max: life, s: (o.s || 6) * (0.7 + RN() * 0.6), col: pk(cols), rot: RN() * 6, vr: (RN() - 0.5) * 8, ph: RN() * 6, g: o.g || 0, delay: RN() * (o.spread || 0.5) });
    }
  }
  // 一点から四方へ
  function radial(t, cols, n, x, y, o = {}) {
    n = Math.round(n * qn());
    for (let i = 0; i < n; i++) {
      const an = RN() * Math.PI * 2, v = (o.sp || 420) * (0.35 + RN() * 0.65), life = (o.life || 0.9) * (0.7 + RN() * 0.6);
      spawn({ t, x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - (o.up || 0), life, max: life, s: (o.s || 5) * (0.7 + RN() * 0.6), col: pk(cols), rot: RN() * 6, vr: (RN() - 0.5) * 10, ph: RN() * 6, g: o.g || 0, delay: RN() * (o.spread || 0) });
    }
  }
  const toRGB = (c) => (c[0] === '#' ? hexRGB(c) : c);
  const waves = (cols, n, x, y, gap = 0.12) => { for (let i = 0; i < n; i++) spawn({ t: 'wave', x, y, life: 0.7, max: 0.7, col: toRGB(cols[i % cols.length]), delay: i * gap }); };
  const pillar = (x, y, col, w = 70) => spawn({ t: 'pillar', x, y, life: 0.7, max: 0.7, s: w, col });
  function boltsAt(n, x, y, col, spread = 160) {
    for (let i = 0; i < n; i++) {
      const b = makeBolt(x + (RN() - 0.5) * spread, y + (RN() - 0.5) * 60);
      b.col = col; b.life = b.max = 0.3 + RN() * 0.2; b.delay = i * 0.06;
      bolts.push(b);
    }
  }
  const slashes = (n, x, y, col, len = 260, w = 3) => { for (let i = 0; i < n; i++) spawn({ t: 'slash', x: x + (RN() - 0.5) * 70, y: y + (RN() - 0.5) * 90, life: 0.26, max: 0.26, s: len, w, rot: RN() * Math.PI, col, delay: i * 0.045 }); };
  const implode = (x, y, col, sz = 160) => spawn({ t: 'implode', x, y, tx: x, ty: y, life: 0.55, max: 0.55, s: sz, col });
  const bigTxt = (txt, x, y, size, col, o = {}) => floatText(x, y, txt, Object.assign({ size, fill: col, stroke: '#140818', pop: 2.8, vy: -12, life: 1.2 }, o));
  const clockAt = (x, y, col, s = 120, spin = 1) => spawn({ t: 'clockface', x, y, life: 1.1, max: 1.1, s, col, spin });
  function crackAt(x, y, n = 9, col = '#ffffff') {
    const pts = [];
    for (let i = 0; i < n; i++) {
      let an = (i / n) * Math.PI * 2 + RN() * 0.4, px = 0, py = 0;
      const seg = [0, 0];
      for (let k = 0; k < 6; k++) { an += (RN() - 0.5) * 0.7; const L = 30 + RN() * 60; px += Math.cos(an) * L; py += Math.sin(an) * L; seg.push(px, py); }
      pts.push(seg);
    }
    spawn({ t: 'crack', x, y, life: 0.9, max: 0.9, col, pts });
  }
  const ribbon = (col, by, ph = 0) => spawn({ t: 'ribbon', x: 0, y: 0, by, life: 1.8, max: 1.8, col, ph });
  const RAINBOW = ['#ff5a5a', '#ffd23a', '#7aff6a', '#4fe3ff', '#c46bff', '#ff6ad5'];
  // 35種類の必殺技の演出（x, y は当たった所）
  const OV = {
    coinrain: (x, y) => { rain('rcoin', ['#ffcf4a'], 40, { s: 8 }); radial('star', ['#fff3a0', '#ffd23a'], 24, x, y); waves(['#ffd23a', '#fff6a0'], 2, x, y); addFlash(0.3, '255,215,90'); },
    flame: (x, y) => { radial('fire', ['#ff7a1a'], 46, x, y, { sp: 380, s: 9, g: -120 }); waves(['#ff7a1a', '#ffd27a'], 2, x, y); addFlash(0.3, '255,140,60'); },
    meteor: (x, y) => { rain('meteor', ['#fff6a0', '#bfe8ff', '#ffb0e0'], 26, { vx: -380, vy: 520, s: 4, life: 1.2, spread: 0.7 }); radial('star', ['#ffffff', '#fff6a0'], 20, x, y); addFlash(0.2, '200,220,255'); },
    bloom: (x, y) => { radial('petal', ['#ff2a4a', '#b0002a', '#ff7a8a'], 60, x, y, { sp: 360, s: 7, life: 1.6, g: 60 }); waves(['#ff2a4a'], 2, x, y); addFlash(0.25, '255,40,80'); },
    leafstorm: (x, y) => { rain('petal', ['#7aff6a', '#2ab04a', '#c8ff9a'], 44, { s: 7 }); radial('petal', ['#7aff6a', '#2ab04a'], 30, x, y, { s: 6 }); pillar(x, y, '120,255,140', 60); },
    moon: (x, y) => { for (let i = 0; i < 4; i++) spawn({ t: 'moon', x, y, vx: (i - 1.5) * 160, vy: -60, life: 0.7, max: 0.7, s: 60 + i * 20, rot: i * 0.8, col: i % 2 ? '#ffffff' : '#a8c8ff', delay: i * 0.06 }); rain('star', ['#ffffff', '#cfe0ff'], 22, { s: 4 }); addFlash(0.25, '190,210,255'); },
    shardrain: (x, y) => { rain('shard', ['#a8f6ff', '#7fe8ff', '#e8fdff', '#c49bff'], 46, { s: 9 }); radial('shard', ['#a8f6ff', '#ffffff'], 24, x, y, { s: 8 }); waves(['#7fe8ff'], 2, x, y); },
    clock: (x, y) => { clockAt(x, y - 60, '#ffd27a', 130); radial('gearp', ['#e0aa48', '#cfd6e0'], 22, x, y, { s: 7 }); waves(['#ffd27a'], 2, x, y); },
    feathers: (x, y) => { rain('feather', ['#ffffff', '#fff6d8', '#ffe9a8'], 40, { vy: 120, s: 7, life: 2.6 }); pillar(x, y, '255,245,200', 90); addFlash(0.3, '255,250,220'); },
    crack: (x, y) => { crackAt(x, y, 10, '#d8c8ff'); radial('shard', ['#2a1a40', '#6a5a8a', '#000000'], 30, x, y, { s: 8 }); addFlash(0.4, '0,0,0'); },
    hearts: (x, y) => { rain('heart', ['#ff6ab0', '#ff9ad0', '#ffd0e8', '#ff3d8b'], 40, { vy: 160, s: 10 }); radial('heart', ['#ff3d8b', '#ff9ad0'], 24, x, y, { s: 9 }); waves(['#ff6ab0', '#ffd0e8'], 3, x, y); },
    snow: (x, y) => { rain('flake', ['#ffffff', '#cfefff', '#9fd8ff'], 50, { vy: 140, s: 8, life: 2.6 }); radial('flake', ['#ffffff'], 20, x, y, { s: 9 }); addFlash(0.3, '220,240,255'); },
    bolts: (x, y) => { boltsAt(7, x, y, '255,110,200', 220); waves(['#ff6ab0', '#ffffff'], 2, x, y); addFlash(0.4, '255,140,220'); },
    void: (x, y) => { implode(x, y, '#b06aff', 200); radial('spark', ['#b06aff', '#ffffff'], 30, x, y, { sp: 600, life: 0.4 }); addFlash(0.45, '0,0,0'); },
    clockstop: (x, y) => { clockAt(OW / 2, OH * 0.4, '#7fffe8', Math.min(OW, OH) * 0.32, -1); slowmo = Math.max(slowmo, 0.55); bigTxt('時', OW / 2, OH * 0.4, 120, '#7fffe8', { life: 1.1 }); waves(['#7fffe8'], 3, x, y, 0.15); },
    galaxy: (x, y) => { radial('star', ['#ffffff', '#9fd0ff', '#ffb0e0', '#c8a0ff', '#fff0a0'], 60, x, y, { sp: 520, s: 5, life: 1.2 }); waves(['#b39aff', '#7fd0ff', '#ff9ae6'], 3, x, y); },
    thunderstorm: (x, y) => { boltsAt(12, OW / 2, y, '255,240,140', OW * 0.9); addFlash(0.55, '255,255,220'); waves(['#ffe14a'], 2, x, y); },
    inferno: (x, y) => { radial('fire', ['#ff5a1a'], 70, x, y, { sp: 460, s: 12, g: -160 }); pillar(x, y, '255,120,40', 100); addFlash(0.4, '255,120,40'); },
    sun: (x, y) => { spawn({ t: 'flare', x, y: y - 60, life: 0.9, max: 0.9, s: 380, col: '255,210,90' }); for (let i = 0; i < 12; i++) spawn({ t: 'slash', x, y: y - 60, life: 0.5, max: 0.5, s: 240, w: 5, rot: (i / 12) * Math.PI, col: '255,220,120', delay: i * 0.02 }); addFlash(0.4, '255,230,140'); },
    tsunami: (x, y) => { spawn({ t: 'tide', x: 0, y: 0, life: 1.1, max: 1.1, col: '#4fb4ff' }); radial('drop', ['#9fd8ff', '#ffffff', '#5ab8ff'], 40, x, y, { sp: 500, s: 5 }); waves(['#4fe3ff'], 2, x, y); },
    rainbowblades: (x, y) => { for (let i = 0; i < 12; i++) spawn({ t: 'slash', x: x + (RN() - 0.5) * 80, y: y + (RN() - 0.5) * 90, life: 0.3, max: 0.3, s: 280, w: 4, rot: RN() * Math.PI, col: hslRGB(i * 30), delay: i * 0.04 }); waves(RAINBOW, 4, x, y, 0.08); },
    infinity: (x, y) => { bigTxt('∞', x, y - 80, 150, '#ffffff', { rainbow: true }); radial('star', RAINBOW, 40, x, y); waves(['#3affd0', '#ffffff'], 3, x, y); },
    blackhole: (x, y) => { implode(x, y, '#ffb070', 240); implode(x, y, '#b06aff', 160); for (let i = 0; i < 36 * qn(); i++) { const an = RN() * Math.PI * 2, r = 160 + RN() * 200; spawn({ t: 'spark', x: x + Math.cos(an) * r, y: y + Math.sin(an) * r, vx: -Math.cos(an) * 700, vy: -Math.sin(an) * 700, life: 0.3, max: 0.3, s: 3, col: i % 2 ? '#ff9a4a' : '#b06aff' }); } addFlash(0.5, '0,0,0'); },
    phoenixfire: (x, y) => { radial('fire', ['#ff7a1a'], 50, x, y, { sp: 400, s: 10, g: -140 }); rain('feather', ['#ffd060', '#ff7a2a', '#ff3a12'], 24, { vy: 150, s: 7 }); pillar(x, y, '255,140,60', 90); },
    rings: (x, y) => { for (let i = 0; i < 4; i++) spawn({ t: 'ring', x, y, life: 0.7 + i * 0.12, max: 0.7 + i * 0.12, s: 200 + i * 90, col: i % 2 ? '#ffd27a' : '#ffe6b0', delay: i * 0.07 }); radial('star', ['#ffd27a', '#ffffff'], 24, x, y); },
    iai: (x, y) => { addFlash(0.7, '255,255,255'); for (let i = 0; i < 7; i++) spawn({ t: 'slash', x: OW / 2 + (RN() - 0.5) * 60, y: y + (RN() - 0.5) * 160, life: 0.35, max: 0.35, s: OW * 0.75, w: 2, rot: (RN() - 0.5) * 0.9, col: '230,240,255', delay: 0.05 + i * 0.03 }); slowmo = Math.max(slowmo, 0.3); bigTxt('斬', x, y - 90, 110, '#ffffff', { life: 0.9 }); },
    genesis: (x, y) => { pillar(x, y, '255,240,190', 140); waves(['#ffffff', '#ffe680', '#ff9ae6'], 3, x, y); radial('star', ['#ffffff', '#ffe680', '#ff9ae6', '#9fe8ff'], 50, x, y, { sp: 500 }); addFlash(0.5, '255,250,230'); },
    aurora: (x, y) => { ribbon('rgba(90,255,180,0.8)', OH * 0.12, 0); ribbon('rgba(80,200,255,0.7)', OH * 0.2, 2); ribbon('rgba(255,110,230,0.6)', OH * 0.28, 4); rain('star', ['#ffffff', '#bfffe8'], 16, { s: 4 }); },
    glitchstorm: (x, y) => { for (let i = 0; i < 40 * qn(); i++) spawn({ t: 'glitch', x: RN() * OW, y: RN() * OH, life: 0.15 + RN() * 0.3, max: 0.45, s: 10 + RN() * 40, h: 3 + RN() * 12, col: pk(['rgba(80,240,255,0.7)', 'rgba(255,60,120,0.7)', 'rgba(255,255,255,0.6)']), delay: RN() * 0.3 }); bigTxt('ERROR', x, y - 90, 54, '#ff4fd8', { life: 0.9 }); addFlash(0.3, '255,60,200'); },
    golddragon: (x, y) => { boltsAt(8, x, y, '255,215,60', 260); rain('rcoin', ['#ffcf4a'], 30, { s: 8 }); pillar(x, y, '255,215,60', 110); bigTxt('龍', x, y - 100, 110, '#ffd84a'); },
    rainbowfire: (x, y) => { radial('fire', ['#ff7a1a'], 40, x, y, { sp: 400, s: 10, g: -140 }); radial('star', RAINBOW, 40, x, y, { sp: 480 }); pillar(x, y, '255,170,240', 120); waves(RAINBOW, 3, x, y, 0.1); },
    heavenlight: (x, y) => { for (let i = 0; i < 5; i++) spawn({ t: 'pillar', x: (i + 0.5) * (OW / 5), y: OH * (0.55 + RN() * 0.2), life: 0.9, max: 0.9, s: 60, col: '255,250,220', delay: i * 0.08 }); rain('feather', ['#ffffff', '#fff6d8'], 30, { vy: 120, s: 7 }); addFlash(0.4, '255,255,240'); },
    sunpillar: (x, y) => { pillar(x, y, '255,225,120', 220); spawn({ t: 'flare', x, y, life: 1, max: 1, s: 460, col: '255,230,140' }); waves(['#ffd700', '#fff6c0', '#ffd700'], 3, x, y); radial('star', ['#ffd700', '#ffffff'], 50, x, y, { sp: 560 }); addFlash(0.6, '255,240,180'); },
    chaos: (x, y) => { implode(x, y, '#b06aff', 260); crackAt(x, y, 12, '#c49bff'); for (let i = 0; i < 24 * qn(); i++) spawn({ t: 'glitch', x: RN() * OW, y: RN() * OH, life: 0.2 + RN() * 0.3, max: 0.5, s: 12 + RN() * 30, h: 4 + RN() * 10, col: 'rgba(176,106,255,0.7)', delay: RN() * 0.3 }); addFlash(0.6, '0,0,0'); },
    omega: (x, y) => { bigTxt('Ω', OW / 2, OH * 0.38, 170, '#ffffff', { rainbow: true, life: 1.5 }); waves(RAINBOW, 5, x, y, 0.08); pillar(x, y, '255,170,255', 200); boltsAt(8, x, y, '255,120,255', 300); radial('star', RAINBOW, 60, x, y, { sp: 600 }); confetti(160); addFlash(0.6, '255,255,255'); },
  };
  const axeRGB = (a) => (a.glow && a.glow !== 'rainbow' ? hexRGB(a.glow) : hslRGB((clock * 200) % 360));
  const axSeed = (id) => Math.max(0, D.AXES.findIndex((a) => a.id === id));
  // 必殺技の発動: 斧が独自の動きを始め、カットインが走る
  function onSkill(sv) {
    World.skill(sv.sk.motion, sv.delay, sv.dir);
    Sfx.skillStart(axSeed(sv.id));
    if (blocked()) return;
    slowmo = Math.max(slowmo, 0.1);
    vPulse = Math.max(vPulse, 0.35);
    UI.cutIn(sv.axe, 'skill');
  }
  // 必殺技が当たった瞬間
  function onSkillHit(p) {
    const a = G.AX[p.id], sk = D.SKILLS[p.id];
    if (!a || !sk) return;
    Sfx.skillHit(G.RANK[a.r], axSeed(p.id));
    if (blocked() || !p.alive) return;
    World.onProc(p);
    const np = notchPoint(), x = np.x, y = np.y;
    hitStop = Math.max(hitStop, 0.12);
    World.punch(0.14);
    World.shake(1.4);
    World.roll((RN() < 0.5 ? -1 : 1) * 0.07);
    World.flashLight(a.glow && a.glow !== 'rainbow' ? a.glow : '#ffffff', 2);
    focusCool = 0;
    focusLines(x, y, 0.55, axeRGB(a), 1);
    floatText(x, y - 30, U.fmt(p.dmg), { size: 48, fill: '#ffffff', stroke: '#2a0a00', rainbow: G.RANK[a.r] >= 6, pop: 2.6, vy: -60, life: 1.3 });
    floatText(x, y - 92, `${sk.name}!!`, { size: 24, fill: a.glow && a.glow !== 'rainbow' ? a.glow : '#ffffff', stroke: '#1a0a14', rainbow: a.glow === 'rainbow', pop: 2.2, vy: -50, life: 1.3 });
    (OV[sk.ov] || OV.flame)(x, y);
    vPulse = Math.max(vPulse, 0.5);
    UI.shakeHud();
    Sfx.vibrate([30, 30, 60]);
  }

  // ------------------------------------------------------------- 幻想の斧: 斧ごとの斬撃演出
  // 新しい演出キーの音は近いものを使う
  const FX_SND = { gold: 'crystal', meteor: 'galaxy', maple: 'petal', leaf: 'feather', obsidian: 'crystal', heart: 'candy', snow: 'crystal', ragna: 'bolt', chrono: 'gear', sun: 'fire', trident: 'splash', rainbow: 'genesis', infinity: 'galaxy', saturn: 'galaxy', katana: 'beam', aurora: 'genesis', ryujin: 'bolt', houou: 'phoenix', olympus: 'feather', amaterasu: 'genesis', chaos: 'void', omega: 'genesis' };
  function signature(eq, x, y, d, q) {
    const fx = eq && ((D.SKILLS[eq.id] && D.SKILLS[eq.id].fx) || eq.fx);
    if (!fx || quality === 0) return;
    const dir = d.dir || 1;
    const s = Math.max(0, d.stier);
    const n = (k) => Math.max(1, Math.round(k * q * (0.8 + s * 0.15)));
    const R = Math.random;
    const fan = (cnt, t, speed, life, size, cols, extra) => {
      for (let i = 0; i < cnt; i++) {
        const a = (dir > 0 ? 0 : Math.PI) + (R() - 0.5) * 2.4, v = speed * (0.35 + R() * 0.65);
        spawn(Object.assign({ t, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25, life, max: life, s: size * (0.7 + R() * 0.6), col: cols[Math.floor(R() * cols.length)], rot: R() * 6, vr: (R() - 0.5) * 10, ph: R() * 6 }, extra || {}));
      }
    };
    switch (fx) {
      case 'splash':
        fan(n(10), 'drop', 420, 0.7, 4, ['#9fd8ff', '#d8f2ff', '#5ab8ff']);
        if (R() < 0.2) floatText(x - dir * 30, y - 50, 'ビチッ!', { size: 18, fill: '#bfe8ff', stroke: '#0a2a4a', vy: -60, life: 0.6 });
        break;
      case 'candy': fan(n(9), 'star', 360, 0.6, 4.5, ['#ff6ac8', '#7fd8ff', '#ffe14a', '#9dff7a']); break;
      case 'pixel':
        fan(n(12), 'pix', 380, 0.65, 6, ['#7aff6a', '#ffffff', '#ffe14a', '#5ab8ff']);
        if (s >= 3 && R() < 0.3) floatText(x, y - 60, '+1UP', { size: 16, fill: '#7aff6a', stroke: '#002a00', vy: -70, life: 0.7 });
        break;
      case 'beam':
        spawn({ t: 'slash', x, y, life: 0.2, max: 0.2, s: 170 + s * 20, w: 5, rot: (R() - 0.5) * 0.25, col: '60,230,255' });
        fan(n(8), 'spark', 520, 0.3, 2.4, ['#7ff6ff', '#ffffff']);
        break;
      case 'petal': fan(n(10), 'petal', 260, 1.4, 5.5, ['#ffb7d5', '#ff8fbf', '#ffd6ea', '#ffffff']); break;
      case 'moon':
        for (let i = 0; i < 2; i++) spawn({ t: 'moon', x, y, vx: dir * (120 + i * 120), vy: -40 + i * 50, life: 0.45, max: 0.45, s: 34 + i * 16, rot: dir > 0 ? 0 : Math.PI, col: i ? '#ffffff' : '#a8c8ff' });
        fan(n(5), 'star', 240, 0.6, 3, ['#ffffff', '#cfe0ff']);
        break;
      case 'crystal': fan(n(9), 'shard', 460, 0.55, 6, ['#a8f6ff', '#7fe8ff', '#e8fdff', '#c49bff']); break;
      case 'gear': fan(n(6), 'gearp', 340, 0.7, 6, ['#e0aa48', '#cfd6e0', '#b07a20']); break;
      case 'feather': fan(n(6), 'feather', 200, 1.5, 6, ['#ffffff', '#fff6d8', '#ffe9a8']); break;
      case 'galaxy':
        fan(n(12), 'star', 340, 0.8, 3.6, ['#ffffff', '#9fd0ff', '#ffb0e0', '#c8a0ff', '#fff0a0']);
        spawn({ t: 'ring', x, y, life: 0.5, max: 0.5, s: 110, col: '#b39aff' });
        break;
      case 'bolt': {
        const b = makeBolt(x, y);
        b.pts = b.pts.map(([px, py], i, arr) => [x + dir * (i / (arr.length - 1)) * 140 + (R() - 0.5) * 22, y - 40 + (i / (arr.length - 1)) * 40 + (R() - 0.5) * 22]);
        b.life = b.max = 0.16;
        bolts.push(b);
        fan(n(6), 'spark', 480, 0.3, 2.4, ['#fff6a8', '#bfe4ff']);
        break;
      }
      case 'fire': fan(n(9), 'fire', 300, 0.6, 7, ['#ff7a1a'], { g: -120 }); break;
      case 'void':
        for (let i = 0; i < n(8); i++) {
          const a = R() * Math.PI * 2, r = 70 + R() * 70;
          spawn({ t: 'spark', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * 380, vy: -Math.sin(a) * 380, life: 0.22, max: 0.22, s: 2.6, col: i % 2 ? '#ff9a4a' : '#b06aff' });
        }
        spawn({ t: 'implode', x, y, tx: x, ty: y, life: 0.32, max: 0.32, s: 90, col: '#ffb070' });
        break;
      case 'phoenix':
        fan(n(7), 'fire', 320, 0.6, 7, ['#ff7a1a'], { g: -140 });
        fan(n(3), 'feather', 220, 1.2, 6, ['#ffd060', '#ff7a2a']);
        break;
      case 'genesis':
        spawn({ t: 'pillar', x, y, life: 0.35, max: 0.35, s: 46 + s * 6, col: '255,240,190' });
        for (let i = 0; i < 2; i++) spawn({ t: 'ring', x, y, life: 0.5 + i * 0.15, max: 0.5 + i * 0.15, s: 120 + i * 80, col: `hsl(${(clock * 300 + i * 120) % 360},100%,70%)` });
        fan(n(8), 'star', 380, 0.7, 4, ['#ffffff', '#ffe680', '#ff9ae6', '#9fe8ff']);
        break;
      case 'gold': fan(n(8), 'rcoin', 380, 0.8, 5, ['#ffcf4a']); fan(n(5), 'star', 300, 0.5, 3, ['#fff3a0']); break;
      case 'meteor': fan(n(5), 'meteor', 520, 0.45, 3, ['#fff6a0', '#bfe8ff']); break;
      case 'maple': fan(n(9), 'petal', 280, 1.2, 6, ['#ff2a4a', '#ff7a2a', '#b0002a']); break;
      case 'leaf': fan(n(9), 'petal', 260, 1.3, 6, ['#7aff6a', '#2ab04a', '#c8ff9a']); break;
      case 'obsidian': fan(n(9), 'shard', 460, 0.55, 6, ['#2a1a40', '#6a5a8a', '#9a6aff']); break;
      case 'heart': fan(n(7), 'heart', 260, 1, 7, ['#ff6ab0', '#ff3d8b', '#ffd0e8']); break;
      case 'snow': fan(n(8), 'flake', 240, 1.3, 6, ['#ffffff', '#bfe8ff']); break;
      case 'ragna': { const b = makeBolt(x, y); b.col = '255,110,200'; b.life = b.max = 0.18; bolts.push(b); fan(n(6), 'spark', 480, 0.3, 2.4, ['#ff6ab0', '#ffffff']); break; }
      case 'chrono': fan(n(5), 'gearp', 300, 0.6, 5, ['#7fffe8', '#cfd6e0']); if (R() < 0.25) spawn({ t: 'clockface', x, y: y - 40, life: 0.5, max: 0.5, s: 50, col: '#7fffe8' }); break;
      case 'sun': spawn({ t: 'flare', x, y, life: 0.3, max: 0.3, s: 120, col: '255,210,90' }); fan(n(7), 'fire', 300, 0.5, 6, ['#ff7a1a'], { g: -100 }); break;
      case 'trident': fan(n(8), 'drop', 420, 0.7, 4, ['#9fd8ff', '#3affe0']); spawn({ t: 'slash', x, y, life: 0.2, max: 0.2, s: 150, w: 3, rot: -0.2, col: '60,255,224' }); break;
      case 'rainbow': fan(n(10), 'star', 360, 0.7, 4, RAINBOW_C); break;
      case 'infinity': if (R() < 0.3) floatText(x, y - 60, '∞', { size: 34, fill: '#3affd0', rainbow: true, vy: -40, life: 0.6 }); fan(n(8), 'star', 340, 0.6, 3.6, ['#3affd0', '#ffffff']); break;
      case 'saturn': spawn({ t: 'ring', x, y, life: 0.45, max: 0.45, s: 120, col: '#ffd27a' }); fan(n(6), 'star', 300, 0.6, 3.5, ['#ffe6b0', '#ffd27a']); break;
      case 'katana': for (let i = 0; i < 2; i++) spawn({ t: 'slash', x: x + (R() - 0.5) * 30, y: y + (R() - 0.5) * 30, life: 0.18, max: 0.18, s: 220, w: 1.6, rot: (R() - 0.5) * 0.8, col: '230,240,255' }); break;
      case 'aurora': fan(n(10), 'star', 300, 0.8, 3.6, ['#5affb4', '#50c8ff', '#ff6ee6']); break;
      case 'ryujin': { const b = makeBolt(x, y); b.col = '255,215,60'; b.life = b.max = 0.2; bolts.push(b); fan(n(6), 'rcoin', 360, 0.7, 4, ['#ffcf4a']); break; }
      case 'houou': fan(n(8), 'fire', 320, 0.6, 7, ['#ff7a1a'], { g: -140 }); fan(n(6), 'star', 360, 0.7, 4, RAINBOW_C); break;
      case 'olympus': fan(n(6), 'feather', 220, 1.3, 6, ['#ffffff', '#bfe8ff']); spawn({ t: 'flare', x, y, life: 0.25, max: 0.25, s: 110, col: '220,240,255' }); break;
      case 'amaterasu': spawn({ t: 'pillar', x, y, life: 0.3, max: 0.3, s: 50, col: '255,225,120' }); fan(n(8), 'star', 380, 0.7, 4, ['#ffd700', '#ffffff']); break;
      case 'chaos': spawn({ t: 'implode', x, y, tx: x, ty: y, life: 0.3, max: 0.3, s: 90, col: '#b06aff' }); for (let i = 0; i < n(4); i++) spawn({ t: 'glitch', x: x + (R() - 0.5) * 160, y: y + (R() - 0.5) * 120, life: 0.18, max: 0.18, s: 18, h: 6, col: 'rgba(176,106,255,0.7)' }); break;
      case 'omega': spawn({ t: 'wave', x, y, life: 0.45, max: 0.45, col: `${hslRGB((clock * 300) % 360)}` }); fan(n(10), 'star', 420, 0.8, 4.5, RAINBOW_C); break;
      case 'glitch':
        for (let i = 0; i < n(5); i++) spawn({ t: 'glitch', x: x + (R() - 0.5) * 160, y: y + (R() - 0.5) * 120, life: 0.12 + R() * 0.12, max: 0.24, s: 8 + R() * 22, h: 3 + R() * 8, col: R() < 0.5 ? 'rgba(80,240,255,0.7)' : 'rgba(255,60,120,0.7)' });
        if (R() < 0.15) floatText(x + (R() - 0.5) * 80, y - 70, ['ERR', '√-1', 'NaN', '0xDEAD'][Math.floor(R() * 4)], { size: 14, fill: '#ff4fd8', stroke: '#0a0014', vy: -40, life: 0.5, light: true });
        break;
    }
    Sfx.axeHit(FX_SND[fx] || fx);
  }
  const RAINBOW_C = ['#ff5a5a', '#ffd23a', '#7aff6a', '#4fe3ff', '#c46bff', '#ff6ad5'];
  // 斧を持ち替えた瞬間（ガチャの後・図鑑から装備）
  function onAxeChange(def) {
    const ap = World.axeScreen();
    if (!ap || blocked()) return;
    const rank = G.RANK[def.r] || 0;
    const col = def.glow && def.glow !== 'rainbow' ? def.glow : rank >= 5 ? '#ffffff' : '#ffe9a0';
    spawn({ t: 'flare', x: ap.x, y: ap.y, life: 0.5, max: 0.5, s: 140 + rank * 30, col: hexRGB(col) });
    spawn({ t: 'ring', x: ap.x, y: ap.y, life: 0.6, max: 0.6, s: 150 + rank * 20, col });
    burst(ap.x, ap.y, 16 + rank * 6, { col: def.glow === 'rainbow' ? undefined : col, speed: 300 });
    floatText(ap.x, ap.y - 70, def.name, { size: 18 + rank * 2, fill: rank >= 3 ? '#ffe14a' : '#ffffff', rainbow: rank >= 5, pop: 1.8, vy: -50, life: 1.3 });
    if (rank >= 4) { focusLines(ap.x, ap.y, 0.45, '255,255,255', 0.6); addFlash(0.18, '255,240,200'); }
    Sfx.equip(rank);
    Sfx.vibrate(rank >= 3 ? [15, 30, 15] : 12);
  }

  // ------------------------------------------------------------- ★ 命中（メインの気持ちよさ）
  function onSwing(d) {
    if (d.kind === 'tap') Sfx.chop(d.combo, d.tier);
    else Sfx.slash(d.stier, d.just, d.chain, d.combo, d.tier);
    if (blocked()) return;
    const tapLike = d.kind === 'tap';
    let x = d.x, y = d.y;
    if (tapLike || x == null) { const np = notchPoint(); x = np.x; y = np.y; d.y = y; }
    World.onHit(d);
    const q = [0.4, 0.7, 1][quality];
    const s = Math.max(0, d.stier);
    const J = Math.min(2.6, G.stats().juice);
    const lvJ = G.S.upg.just || 0, lvM = G.S.upg.critm || 0;
    const tierInfo = TIER[d.tier];
    if (!tapLike) {
      let hs = 0.022 + 0.011 * s + (d.just ? 0.04 : 0) + d.tier * 0.02;
      if (lvM >= 20 && d.tier >= 1) hs += 0.04;
      hitStop = Math.max(hitStop, Math.min(0.17, hs * (0.85 + 0.12 * J)));
      World.punch(Math.min(0.12, 0.015 + 0.008 * s + (d.just ? 0.03 : 0) + d.tier * 0.012));
      World.shake((0.08 + 0.05 * s + (d.just ? 0.15 : 0)) * Math.min(1.6, J));
      const eqx = G.stats().eq;
      const gcol = eqx && eqx.glow && eqx.glow !== 'rainbow' ? hexRGB(eqx.glow) : eqx && eqx.glow === 'rainbow' ? '255,170,240' : '255,235,190';
      spawn({ t: 'flare', x, y, life: 0.16, max: 0.16, s: (34 + 11 * s + (d.just ? 30 : 0)) * Math.min(1.5, J), col: d.just ? '255,225,90' : d.gold ? '255,200,60' : gcol });
      // 斬った線: 速く振るほど長く太く
      if (s >= 2 || d.just || d.tier) {
        const tr = trail.length >= 2 ? trail[trail.length - 1] : null, tp = trail.length >= 4 ? trail[trail.length - 4] : null;
        const rot = tr && tp ? U.clamp(Math.atan2(tr.y - tp.y, tr.x - tp.x), -0.5, 0.5) * (tr.x >= tp.x ? 1 : -1) : 0;
        // 会心は十字、JUST は三日月、ふつうは一閃（毎回少し角度を揺らす）
        const kind = d.tier >= 1 ? 'xslash' : d.just ? 'arcslash' : 'slash';
        const scol = d.just ? '255,215,70' : d.tier >= 3 ? '255,90,170' : G.T.rank >= 4 ? rankRGB(G.T.rank) : gcol;
        spawn({ t: kind, x, y, life: 0.17 + s * 0.012, max: 0.17 + s * 0.012, s: (90 + s * 26 + (d.just ? 40 : 0)) * Math.min(1.4, J) * (kind === 'arcslash' ? 0.7 : 1), w: 2.4 + s * 0.7 + d.tier * 0.8, rot: rot + (Math.random() - 0.5) * 0.25 + (kind === 'arcslash' && (d.dir || 1) < 0 ? Math.PI : 0), col: scol });
      }
      vPulse = Math.max(vPulse, 0.04 + s * 0.02 + d.tier * 0.06 + (d.just ? 0.05 : 0));
      // 大きな一撃は画面ごと傾く（向きは毎回変わる）
      if (s >= 5 || d.tier >= 2 || (d.just && d.chain > 0 && d.chain % 5 === 0)) World.roll((Math.random() < 0.5 ? -1 : 1) * (0.025 + d.tier * 0.012 + (s >= 5 ? 0.015 : 0)));
      if (d.tier >= 3) spawn({ t: 'wave', x, y, life: 0.55, max: 0.55, col: d.tier >= 4 ? hslRGB((clock * 200) % 360) : '255,120,190' });
      signature(eqx, x, y, d, q);
      if (s >= 2) {
        const nSp = Math.round((5 + 5 * (s - 2)) * J * q);
        for (let i = 0; i < nSp; i++) {
          const a = (d.dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.6, v = 320 + Math.random() * 520;
          spawn({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, max: 0.35, s: 2.8, col: s >= 5 ? `hsl(${Math.random() * 360},100%,70%)` : '#ffe9a0' });
        }
      }
    }
    // 数字
    const size = 20 + 4 * s + (d.just ? 8 : 0) + (tierInfo ? tierInfo.size * 0.35 : 0) - (tapLike ? 4 : 0);
    const dir = d.dir || 1;
    const nx = x + dir * (40 + Math.random() * 20), ny = y - 24 - Math.random() * 16;
    floatText(nx, ny, U.fmt(d.dmg), { size, fill: tierInfo ? tierInfo.fill : G.T.fever > 0 ? '#ffe6ff' : '#ffffff', rainbow: !!(tierInfo && tierInfo.rainbow), pop: 1.5 + s * 0.08 + (d.just ? 0.25 : 0), vy: -110, vx: dir * 45, life: 0.85 });
    if (s >= 1 && quality > 0) {
      const kmh = s >= 2 ? ` ${Math.round((d.speed || 0) * 18)}km/h` : '';
      floatText(nx, ny - size * 0.95, D.CFG.SPEED_LABEL[s] + kmh, { size: 11 + s * 2, fill: SPEED_COL[s], rainbow: s >= 5, pop: 1.3, vy: -110, vx: dir * 45, life: 0.85 });
    }
    if (d.gold > 0) {
      floatText(x - dir * 40, y + 10, '+' + U.fmt(d.gold), { size: 18, fill: '#ffd23a', stroke: '#4a2400', vy: -80, life: 0.8 });
      coins(x, y, 2, 'wood');
    }
    if (tierInfo) {
      floatText(nx, ny - size * 1.9, tierInfo.label, { size: tierInfo.size * 0.42, fill: tierInfo.fill, rainbow: tierInfo.rainbow, pop: 1.8, vy: -90, life: 1.0 });
      burst(x, y, [4, 8, 14][quality] * d.tier, { col: tierInfo.rainbow ? undefined : tierInfo.fill, speed: 220 + d.tier * 120 });
      if (d.tier >= 2) { addFlash(0.1 * d.tier, d.tier >= 4 ? '255,255,255' : '255,220,120'); World.flashLight(d.tier >= 4 ? '#ffffff' : '#ffe0a0', 0.4 * d.tier); }
      if (d.tier >= 3 || (lvM >= 10 && d.tier >= 1)) spawn({ t: 'ring', x, y, life: 0.45, max: 0.45, s: 130 + d.tier * 30, col: tierInfo.fill });
      if (d.tier >= 3) focusLines(x, y, d.tier >= 4 ? 0.6 : 0.35, '255,255,255', d.tier >= 4 ? 1 : 0.5);
      if (d.tier >= 4) { confetti(90); UI.banner('GOD CRIT', '神が降りた ・ 💎+10', 'god'); UI.shakeHud(); }
    }
    if (d.just) {
      const ch = d.chain;
      floatText(x, y + 36, ch >= 2 ? `JUST ×${ch}` : 'JUST!', { size: 21 + Math.min(18, ch * 1.4), fill: '#ffe14a', stroke: '#4a2a00', rainbow: ch >= 10, pop: 2, vy: -30, life: 0.9 });
      spawn({ t: 'ring', x, y, life: 0.4, max: 0.4, s: 100, col: '#ffe14a' });
      if (lvJ >= 10) {
        spawn({ t: 'ring', x, y, life: 0.6, max: 0.6, s: 190, col: '#fff3a0' });
        spawn({ t: 'ring', x, y, life: 0.8, max: 0.8, s: 290, col: '#ffd84a' });
      }
      if (lvJ >= 25) slowmo = Math.max(slowmo, 0.22);
      addFlash(0.06 + Math.min(0.12, ch * 0.01), '255,225,120');
      if (ch > 0 && ch % 10 === 0) { UI.banner(`JUST ×${ch}!!`, '見切りが止まらない', 'combo'); confetti(50); focusLines(x, y, 0.4, '255,240,160', 0.6); }
    }
    // 擬音: 強く斬ったときだけ、斜めの描き文字がドンと出る
    if (!tapLike && !calm && quality > 0 && (s >= 4 || d.tier >= 2 || (d.just && d.chain >= 5)) && Math.random() < 0.65) {
      const set = d.tier >= 2 ? ONO.crit : G.T.fever > 0 && Math.random() < 0.5 ? ONO.fever : d.just && Math.random() < 0.5 ? ONO.just : ONO.normal;
      const oc = d.tier >= 3 ? ONO_COL[1] : G.T.rank >= 4 && Math.random() < 0.6 ? [D.STYLE.RANKS[G.T.rank].col, '#1a0a00'] : U.pick(ONO_COL);
      floatText(x - dir * (70 + Math.random() * 30), y - 78 - Math.random() * 26, U.pick(set), { size: 28 + s * 3 + d.tier * 4 + G.T.rank * 1.5, fill: oc[0], stroke: oc[1], rainbow: G.T.rank >= 7 && Math.random() < 0.5, rot: -dir * (0.12 + Math.random() * 0.26), pop: 2.3, vy: -18, vx: -dir * 20, life: 0.55 });
    }
    lastHit = { t: clock, tier: d.tier, stier: s, x, y };
    comboPop = 1;
    // 実況（コンボの節目）
    const word = D.ANNOUNCE[d.combo];
    if (word && G.COMBO_MS.indexOf(d.combo) < 0) UI.banner(word, `${d.combo} COMBO`, 'combo');
    if (d.blastIn > 0 && d.blastIn <= 3 && quality > 0) floatText(x, y - 80, `爆裂まで ${d.blastIn}`, { size: 13, fill: '#ffb070', vy: -40, life: 0.5, light: true });
  }

  // 追撃（残像・落雷・爆裂）
  function onProc(p) {
    if (p.kind === 'skill') { onSkillHit(p); return; }
    if (p.kind === 'carry') { onCarry(p); return; }
    if (p.kind === 'echo') Sfx.echo(p.n);
    else if (p.kind === 'thunder') Sfx.thunder(p.n);
    else Sfx.blast(G.S.upg.blast || 0);
    if (blocked() || !p.alive) return;
    World.onProc(p);
    const np = notchPoint();
    const x = p.x != null ? p.x : np.x, y = p.y != null ? p.y : np.y;
    const q = [0.4, 0.7, 1][quality];
    if (p.kind === 'echo') {
      const dir = p.n % 2 ? -p.dir : p.dir;
      const yy = y + (p.n - 1) * 8 * (p.n % 2 ? 1 : -1);
      ghosts.push({ x, y: yy, dir, t: 0, dur: 0.15 });
      if (ghosts.length > 4) ghosts.shift();
      floatText(x + dir * 46 + (Math.random() - 0.5) * 30, yy - 14, U.fmt(p.dmg), { size: 17, fill: '#dcc0ff', stroke: '#2a0a4a', vy: -90, vx: dir * 30, life: 0.7 });
      if (p.n === 1) floatText(x + dir * 46, yy - 40, '残像!', { size: 12, fill: '#dcc0ff', vy: -90, life: 0.7 });
      hitStop = Math.max(hitStop, 0.02);
    } else if (p.kind === 'thunder') {
      bolts.push(makeBolt(x, y));
      addFlash(0.28, '170,210,255');
      World.shake(0.4);
      World.punch(0.04);
      burst(x, y, Math.round(16 * q), { col: '#bfe4ff', speed: 420 });
      floatText(x, y - 54, U.fmt(p.dmg), { size: 30, fill: '#e8f6ff', stroke: '#0a2a5a', pop: 2, vy: -80, life: 1 });
      floatText(x, y - 88, p.n > 1 ? `${p.n}連雷!!` : '落雷!', { size: 17, fill: '#9fd8ff', vy: -80, life: 1 });
      hitStop = Math.max(hitStop, 0.05);
    } else {
      const lv = G.S.upg.blast || 0;
      const big = lv >= 10, nova = lv >= 20;
      addFlash(nova ? 0.6 : 0.35, '255,160,60');
      World.shake(nova ? 1.3 : 0.9);
      World.punch(nova ? 0.12 : 0.07);
      hitStop = Math.max(hitStop, nova ? 0.14 : 0.09);
      spawn({ t: 'flare', x, y, life: 0.35, max: 0.35, s: big ? 240 : 150, col: '255,170,60' });
      const rings = nova ? 3 : big ? 2 : 1;
      for (let i = 0; i < rings; i++) spawn({ t: 'ring', x, y, life: 0.5 + i * 0.2, max: 0.5 + i * 0.2, s: 160 + i * 130, col: i ? '#ffd27a' : '#ff8a3a' });
      const n = Math.round((big ? 40 : 24) * q);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * (big ? 440 : 280);
        spawn({ t: 'fire', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, max: 1, s: 8 + Math.random() * 12, g: -60 });
      }
      floatText(x, y - 44, U.fmt(p.dmg), { size: 38, fill: '#ffd27a', stroke: '#4a1400', pop: 2.4, vy: -70, life: 1.2 });
      floatText(x, y - 88, nova ? '超新星!!!' : big ? '大爆裂!!' : '爆裂!', { size: 23, fill: '#ff8a3a', stroke: '#2a0a00', pop: 2, vy: -70, life: 1.2 });
      if (nova) { confetti(80); UI.shakeHud(); focusLines(x, y, 0.45, '255,220,160', 0.8); }
    }
  }

  // 斬撃の余りが、生えたばかりの次の木に入る（ザクッ、ザクッ、ザクッ）
  function onCarry(p) {
    Sfx.carry(p.n);
    if (blocked() || !p.alive) return;
    World.onProc(p);
    const np = notchPoint();
    const dir = p.dir || 1;
    World.punch(0.05);
    World.shake(0.35);
    hitStop = Math.max(hitStop, 0.035);
    spawn({ t: 'slash', x: np.x, y: np.y, life: 0.2, max: 0.2, s: 120 + p.n * 14, w: 3 + p.n * 0.6, rot: -dir * 0.12, col: '255,225,120' });
    spawn({ t: 'flare', x: np.x, y: np.y, life: 0.16, max: 0.16, s: 60 + p.n * 8, col: '255,235,190' });
    for (let i = 0; i < 6; i++) {
      const a = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.4, v = 300 + Math.random() * 400;
      spawn({ t: 'spark', x: np.x, y: np.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3, max: 0.3, s: 2.6, col: '#ffe9a0' });
    }
    floatText(np.x + dir * 50, np.y - 30, U.fmt(p.dmg), { size: 22 + p.n * 2, fill: '#ffe9b0', stroke: '#3a1400', vy: -100, vx: dir * 40, life: 0.75 });
    if (p.n === 2) floatText(np.x - dir * 40, np.y - 70, '貫通!', { size: 16, fill: '#ffd23a', stroke: '#2a0a00', vy: -60, life: 0.6, light: true });
  }

  // 伐採: とどめのスロー＋コイン
  function onFell(d) {
    const tree = d.tree;
    const big = tree.boss || tree.rar.id !== 'normal';
    Sfx.fell(tree.rar.id, tree.boss, d.streak || 0);
    Sfx.vibrate(tree.boss ? [30, 40, 60] : 15);
    const variant = blocked() ? 'launch' : fellVariant(d);
    World.onFell(d, variant);
    if (blocked()) return;
    if (variant === 'star') {
      const np = notchPoint();
      twinkles.push({ t: 0.55, x: U.clamp(np.x + (lastHit.x > np.x ? -1 : 1) * 30 + (Math.random() - 0.5) * 60, 40, OW - 40), y: Math.max(70, OH * 0.1) });
    } else if (variant === 'shatter') {
      Sfx.shatter();
      const np = notchPoint();
      floatText(np.x, np.y - 110, U.pick(['粉砕!!', '木っ端微塵!!', 'バラバラ!!']), { size: 30, fill: '#ffd27a', stroke: '#2a0a00', rot: (Math.random() - 0.5) * 0.3, pop: 2.4, vy: -30, life: 0.7 });
      for (let i = 0; i < 14 * (quality + 1); i++) {
        const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 380;
        spawn({ t: 'chip', x: np.x, y: np.y - 60, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, life: 0.9, max: 0.9, s: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, col: Math.random() < 0.5 ? '#f2d39b' : '#8a5a32' });
      }
    }
    // 普通の木は止めずに次へ（スローはボス・レア木だけ）
    if (!calm && big) {
      slowmo = Math.max(slowmo, 0.55);
      World.finisher(1);
    } else World.finisher(0.12);
    // 一振りで何本も倒した
    if (d.multi >= 2) {
      const np = notchPoint();
      const m = d.multi;
      const prev = merged.multi && merged.multi.t;
      if (prev) { const i = texts.indexOf(prev); if (i >= 0) texts.splice(i, 1); }
      merged.multi = { t: floatText(np.x, np.y - 150, `${m}本斬り${'!'.repeat(Math.min(4, m - 1))}`, { size: 26 + m * 6, fill: m >= 4 ? '#ffffff' : '#ffe14a', stroke: '#2a0a00', rainbow: m >= 4, rot: -0.1, pop: 2.4, vy: -24, life: 1.0 }), at: clock };
      Sfx.multi(m);
      Sfx.ladder(m);
      Sfx.announce(m);
      floatText(OW / 2, OH * 0.28, ['', '', 'DOUBLE!', 'TRIPLE!!', 'QUADRA!!', 'PENTA KILL!!!'][Math.min(5, m)], { size: 30 + m * 7, fill: m >= 4 ? '#ffffff' : '#ffe14a', stroke: '#2a0010', rainbow: m >= 4, rot: -0.06, pop: 2.6, vy: -18, life: 0.8 });
      Sfx.vibrate(10 + m * 8);
      if (m >= 3) { focusLines(np.x, np.y, 0.35 + m * 0.05, '255,240,180', Math.min(1, m / 5)); spawn({ t: 'wave', x: np.x, y: np.y, life: 0.5, max: 0.5, col: '255,220,120' }); }
      if (m >= 5) { UI.banner('一閃 5本斬り!!!', '一振りで森ごと伐り拓いた', 'combo'); confetti(70); }
    }
    const cc = sceneCenter();
    const finisher = clock - lastHit.t < 0.05 && (lastHit.tier >= 2 || lastHit.stier >= 5 || tree.boss);
    if (finisher && !calm) {
      floatText(lastHit.x, lastHit.y - 120, '一刀両断!!', { size: tree.boss ? 46 : 36, fill: '#ffffff', stroke: '#2a0a00', rainbow: tree.boss || lastHit.tier >= 4, rot: -0.12, pop: 2.6, vy: -16, life: 1.1 });
      focusLines(lastHit.x, lastHit.y, 0.5, '255,255,255', 0.9);
      Sfx.vibrate([20, 40, 30]);
    }
    if (big) floatText(cc.x, cc.y - 10, '+' + U.fmt(d.reward), { size: 40, fill: '#ffc04a', stroke: '#4a2400', vy: -70, life: 1.3, pop: 2 });
    else mergeText('reward', cc.x, cc.y - 10, d.reward, (v, n) => `+${U.fmt(v)}${n >= 2 ? ` (${n}本)` : ''}`, { size: 28, fill: '#ffc04a', stroke: '#4a2400', vy: -50, life: 1.1, pop: 1.8 });
    coins(cc.x, cc.y, big ? 16 : 7, 'wood');
    if (d.gems) {
      floatText(cc.x + 60, cc.y + 24, '💎+' + d.gems, { size: 20, fill: '#5ee8ff', stroke: '#06324a', vy: -60, life: 1.2 });
      coins(cc.x, cc.y, Math.min(8, d.gems), 'gem');
    }
    if (d.chest) floatText(cc.x - 60, cc.y + 24, '📦 宝箱GET!', { size: 17, fill: '#ffe08a', stroke: '#4a2400', vy: -50, life: 1.4 });
    if (d.streak >= 3) {
      const m = merged.streak;
      const o = { size: 15 + Math.min(13, Math.floor(d.streak / 5)), fill: d.streak >= 50 ? '#ffe14a' : '#9dff4a', stroke: '#0a2a00', vy: -30, life: 1.1, light: d.streak < 25, rainbow: d.streak >= 100 };
      if (m && texts.includes(m.t) && clock - m.at < 1) { m.t.s = `🔗 ${d.streak}本連続`; m.t.life = m.t.max; m.t.y = cc.y + 56; Object.assign(m.t, { size: o.size, fill: o.fill, rainbow: o.rainbow, light: o.light }); m.at = clock; }
      else merged.streak = { t: floatText(cc.x, cc.y + 56, `🔗 ${d.streak}本連続`, o), at: clock };
    }
    if (big) { confetti(tree.boss ? 80 : 36); addFlash(0.2, '255,230,150'); const np = notchPoint(); focusLines(np.x, np.y, tree.boss ? 0.7 : 0.4, '255,255,255', tree.boss ? 1 : 0.5); }
  }
  // 倒れた木が地面に着いた瞬間
  function landed(tree, pts) {
    Sfx.crash(tree.boss);
    if (blocked()) return;
    for (const p of pts) {
      for (let i = 0; i < quality + 1; i++) spawn({ t: 'dust', x: p.x + (Math.random() - 0.5) * 20, y: p.y, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 40, life: 0.8, max: 0.8, s: 9 + Math.random() * 12 });
    }
    const mid = pts[Math.floor(pts.length / 2)];
    if (!calm && mid) floatText(mid.x, mid.y - 40, 'TIMBER!!', { size: tree.boss ? 40 : 26, fill: '#fff3c4', stroke: '#5a2a00', vy: -40, life: 0.9, pop: 1.8 });
    if (tree.boss) UI.shakeHud();
  }

  // ------------------------------------------------------------- イベント購読
  function bind() {
    G.on('swing', onSwing);
    G.on('proc', onProc);
    G.on('fell', onFell);
    G.on('spawn', (tree) => {
      World.onSpawn(tree);
      // ポンと生える土ぼこり
      if (gl && !blocked() && quality > 0) {
        const b = World.toScreen(0, 0.05, 0.7);
        for (let i = 0; i < 2 + quality; i++) spawn({ t: 'dust', x: b.x + (Math.random() - 0.5) * 40, y: b.y, vx: (Math.random() - 0.5) * 140, vy: -30 - Math.random() * 40, life: 0.45, max: 0.45, s: 6 + Math.random() * 7 });
      }
      Sfx.spawn();
      if (tree.rar.id !== 'normal' && !blocked()) {
        const cc = sceneCenter();
        burst(cc.x, cc.y, 24, { col: tree.rar.id === 'gold' ? '#ffd84a' : tree.rar.id === 'silver' ? '#ffffff' : undefined, speed: 240 });
        UI.banner(tree.rar.id === 'rainbow' ? '虹の木!!' : tree.rar.id === 'gold' ? '金の木!' : '銀の木', tree.rar.id === 'rainbow' ? '報酬×50 ・ 激レア' : tree.rar.id === 'gold' ? '報酬×10' : '報酬×3', 'rare-' + tree.rar.id);
        Sfx.squirrel();
      }
    });
    G.on('bossStart', () => { UI.banner('BOSS BATTLE', '30秒以内に伐り倒せ！', 'boss'); Sfx.boss(); World.shake(0.6); addFlash(0.2, '255,60,60'); World.flashLight('#ff6060', 0.8); });
    G.on('bossWin', (d) => { UI.banner('BOSS DEFEATED!!', `💎+${d.gems} ・ 📦+1`, 'win'); Sfx.bossWin(); confetti(120); });
    G.on('bossFail', (tree) => { World.onBossFail(tree); UI.banner('逃げられた…', '木こりを強化して再挑戦！', 'fail'); Sfx.bossFail(); });
    G.on('stage', (d) => {
      if (d.newBiome) { UI.banner('NEW AREA', World.palette(G.biomeIndex(d.stage)).name, 'area'); confetti(60); }
      else if (!G.isBossStage(d.stage)) Sfx.stage();
    });
    G.on('feverStart', (d) => { UI.banner('FEVER TIME!!', `全ダメージ ×${d.mult} ・ ${d.time}秒`, 'fever'); Sfx.feverStart(); addFlash(0.25, '255,120,220'); confetti(50); Sfx.vibrate([20, 30, 20]); });
    G.on('feverEnd', () => Sfx.feverEnd());
    G.on('comboMs', (d) => {
      if (!blocked()) UI.banner(D.ANNOUNCE[d.n] || `${d.n} COMBO!!`, `${d.n} COMBO ・ 💎+${d.gems}`, 'combo');
      Sfx.milestone();
    });
    G.on('milestone', () => { Sfx.milestone(); confetti(30); });
    G.on('prestige', () => { Sfx.prestige(); confetti(160); addFlash(0.6); });
    G.on('load', () => { World.reset(); parts.length = 0; texts.length = 0; roulettes.length = 0; twinkles.length = 0; World.setRank(0, '#ffffff', false); Sfx.musicLevel(0); });
    G.on('rank', (d) => { if (!gdim()) onRank(d); });
    G.on('gRank', (d) => { if (gdim()) onRank(d); });
    G.on('dim', () => { const r = curRank(), R = D.STYLE.RANKS[r]; W3().setRank(r, R.col, R.rainbow); });
    G.on('skill', onSkill);
    G.on('autoRoll', onRolls);
    G.on('golden', (d) => {
      UI.banner('GOLDEN TIME!!', `${d.time}秒間、斬るたびに木材が噴き出す`, 'golden');
      Sfx.golden();
      addFlash(0.3, '255,210,80');
      World.flashLight('#ffd060', 1.2);
      confetti(40);
    });
    G.on('roulette', (r) => { if (!blocked()) startRoulette(r); });
    G.on('rouletteWin', (r) => {
      Sfx.rouletteWin(r.m);
      if (blocked()) return;
      const cc = sceneCenter();
      floatText(cc.x, cc.y - 120, `×${r.m}  +${U.fmt(r.wood)}`, { size: r.m >= 10 ? 34 : 24, fill: '#ffd23a', stroke: '#3a1a00', rainbow: r.m >= 100, pop: 2.2, vy: -50, life: 1.4 });
      coins(cc.x, cc.y - 100, Math.min(24, 4 + r.m), 'wood');
      if (r.m >= 10) { confetti(r.m >= 100 ? 160 : 60); addFlash(0.25, '255,220,120'); }
      if (r.m >= 100) { UI.banner('×100 JACKPOT!!!', `+${U.fmt(r.wood)} 木材`, 'god'); focusLines(cc.x, cc.y - 100, 0.7, '255,230,120', 1); }
    });
    G.on('streak', (d) => {
      UI.banner(`${d.n}本連続伐採!!`, `💎+${d.gems}${d.chests ? ` ・ 📦+${d.chests}` : ''}`, 'streak');
      Sfx.streak();
      confetti(40);
    });
    G.on('levelUp', (d) => {
      UI.banner(`LEVEL UP!! Lv.${d.lvl}`, `全ダメージ +${Math.round(D.CFG.LEVEL_BONUS * 100)}% ・ 💎+${d.gems}${d.tickets ? ' ・ 🎫+1' : ''}${d.chests ? ' ・ 📦+2' : ''}`, 'level');
      Sfx.levelUp();
      confetti(70);
      addFlash(0.18, '160,255,120');
    });
  }

  // ------------------------------------------------------------- フレーム
  function frame(dt) {
    const real = dt;
    clock += dt;
    if (hitStop > 0) { hitStop -= real; dt *= 0.08; }
    else if (slowmo > 0) { slowmo -= real; dt *= 0.3; }
    flash = Math.max(0, flash - real * 2.4);
    comboPop = Math.max(0, comboPop - real * 6);
    // 木こりの働きを小さな数字で見せる
    dpsT += real;
    if (dpsT > 0.7) {
      dpsT = 0;
      const st = G.stats();
      if (!gdim() && st.dps > 0 && G.T.tree && G.T.tree.alive && !blocked() && quality >= 1) {
        const ti = trunkInfo();
        if (ti) floatText(ti.cx + (Math.random() - 0.5) * 90, ti.bottom - 10, '+' + U.fmt(st.dps * 0.7 * G.gameSpeed()), { size: 12, fill: '#ffe9c9', stroke: 'rgba(40,20,0,0.8)', vy: -45, life: 0.6, light: true });
      }
    }
    beatPulse();
    if (gdim()) Micro.frame(dt, real, blocked());
    else World.frame(dt, real, blocked());
    drawOverlay(dt, real);
    drawTwinkles(ox, real);
    drawReel(real);
  }

  function axeIcon(a, size = 48) {
    const th = gl && typeof Axe3D !== 'undefined' ? Axe3D.thumb(a) : null;
    if (th) return `<img class="axe-img${a.glow === 'rainbow' ? ' rainbow-glow' : ''}" src="${th.url}" width="${size}" height="${size}" alt="" draggable="false">`;
    return axeIconSVG(a, size);
  }
  // 刀の小さな絵（SVG）
  function katanaSVG(k, size = 48) {
    const id = 'kg-' + k.id + '-' + size;
    const glow = k.glow && k.glow !== 'rainbow' ? `filter:drop-shadow(0 0 4px ${k.glow})` : '';
    const ts = (k.k && k.k.tsuba) || 'round';
    const tsuba = ts === 'square' ? '<rect x="11" y="41" width="13" height="11" rx="1" fill="#2a2a32" stroke="#000" stroke-width="1.5" transform="rotate(45 17.5 46.5)"/>' : ts === 'none' ? '' : `<ellipse cx="17.5" cy="46.5" rx="7.5" ry="7.5" fill="${ts === 'flower' || ts === 'star' ? '#d8b040' : '#2a2a32'}" stroke="#000" stroke-width="1.5"/>`;
    return `<svg class="axe-svg${k.glow === 'rainbow' ? ' rainbow-glow' : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" style="${glow}" aria-hidden="true">` +
      `<defs><linearGradient id="${id}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${k.blade[1]}"/><stop offset="1" stop-color="${k.blade[0]}"/></linearGradient></defs>` +
      `<path d="M7 59 L15 51" stroke="${k.handle || '#222'}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M7 59 L15 51" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-dasharray="2 3"/>` +
      tsuba +
      `<path d="M19 44 C 30 33, 44 19, 58 5 C 52 16, 36 32, 22 47 Z" fill="url(#${id})" stroke="#140c18" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M21 45 C 32 34, 45 21, 56 8" stroke="#fff" stroke-opacity=".8" stroke-width="1.4" fill="none"/>` +
      `</svg>`;
  }
  // 一覧用の軽い絵: 3Dの絵を作ったことがあればそれ、なければSVG
  function itemIcon(a, size = 48) {
    const c = gl && typeof Axe3D !== 'undefined' ? Axe3D.cached(a.id) : null;
    if (c) return `<img class="axe-img${a.glow === 'rainbow' ? ' rainbow-glow' : ''}" src="${c.url}" width="${size}" height="${size}" alt="" draggable="false" loading="lazy">`;
    return a.kind === 'katana' ? katanaSVG(a, size) : axeIconSVG(a, size);
  }
  function axeIconSVG(a, size = 48) {
    const P = D.AXE_PATHS;
    const id = 'ag-' + a.id + '-' + size;
    const glow = a.glow && a.glow !== 'rainbow' ? `filter:drop-shadow(0 0 4px ${a.glow})` : '';
    return `<svg class="axe-svg${a.glow === 'rainbow' ? ' rainbow-glow' : ''}" viewBox="0 0 64 64" width="${size}" height="${size}" style="${glow}" aria-hidden="true">` +
      `<defs><linearGradient id="${id}" x1="0.3" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="${a.blade[0]}"/><stop offset="1" stop-color="${a.blade[1]}"/></linearGradient></defs>` +
      `<path d="${P.handle}" fill="${a.handle}" stroke="#1a1008" stroke-width="2"/>` +
      (a.double ? `<path d="${P.blade2}" fill="url(#${id})" stroke="#1a1008" stroke-width="2"/>` : `<path d="${P.poll}" fill="url(#${id})" stroke="#1a1008" stroke-width="2"/>`) +
      `<path d="${P.blade}" fill="url(#${id})" stroke="#1a1008" stroke-width="2"/>` +
      `<path d="${P.edge}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.4" stroke-linecap="round"/>` +
      (a.double ? `<path d="${P.edge2}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.4" stroke-linecap="round"/>` : '') +
      `</svg>`;
  }

  return {
    init, resize, frame, setQuality, floatText, burst, confetti, coins, addShake, addFlash, spawn,
    grab, drag, release, trunkInfo, unit, sceneCenter, axeIconSVG, axeIcon, itemIcon, katanaSVG, focusLines,
    biomeName: () => World.palette(G.biomeIndex(G.S.stage)).name,
    get gl() { return gl; },
    // 菌斬り次元の演出（germfx.js）から使う道具
    lib: {
      floatText, mergeText, spawn, burst, confetti, coins, addFlash, focusLines,
      rain: (...a) => rain(...a), radial: (...a) => radial(...a), waves: (...a) => waves(...a), pillar: (...a) => pillar(...a),
      boltsAt: (...a) => boltsAt(...a), slashes: (...a) => slashes(...a), implode: (...a) => implode(...a), bigTxt: (...a) => bigTxt(...a),
      crackAt: (...a) => crackAt(...a), ribbon: (...a) => ribbon(...a), OV: () => OV, hexRGB, hslRGB,
      hitStop: (v) => { hitStop = Math.max(hitStop, v); }, slowmo: (v) => { slowmo = Math.max(slowmo, v); }, pulse: (v) => { vPulse = Math.max(vPulse, v); },
      comboPop: (v) => { comboPop = Math.max(comboPop, v); },
      get quality() { return quality; }, get W() { return OW; }, get H() { return OH; }, get clock() { return clock; },
      blocked: () => blocked(),
      addDrawer: (f) => drawers.push(f),
      get calm() { return calm; },
    },
    get comboPop() { return comboPop; },
  };
})();
