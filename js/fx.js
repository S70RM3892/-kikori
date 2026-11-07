'use strict';
// =====================================================================
//  fx.js — 描画と演出
//   ・#scene  : 背景・木・木こり・ステージ情報（シーン座標）
//   ・#fx     : 画面全体のパーティクルと数字（ビューポート座標）
// =====================================================================
const FX = (() => {
  let sc, sx, oc, ox;
  let W = 1, H = 1, OW = 1, OH = 1, DPR = 1;
  let rect = { left: 0, top: 0, width: 1, height: 1 };
  const parts = [], texts = [], falling = [], amb = [];
  let clock = 0, sclock = 0;
  let shake = 0, flash = 0, flashRGB = '255,255,255', hitStop = 0;
  let treeShake = 0, treeSquash = 0, growT = 1, axeT = 1, comboPop = 0, comboShown = 0, comboFade = 0, comboMultShown = 1;
  let hpTrail = 1;
  let bgCanvas = null, bgKey = '';
  let palIdx = -1, pal = null;
  let quality = 2, allowShake = true, allowFlash = true, calm = false;
  const MAXP = [90, 240, 460], MAXT = [24, 45, 80];
  let P2 = null;
  const GEO = { gy: 0, th: 0, tw: 0, cr: 0, cx: 0, hudBottom: 90 };
  const geoMap = new Map();
  const wPhase = {};
  let targets = { wood: null, gem: null };
  let blocked = () => false; // モーダル中はシーン由来の演出を止める

  const FONT_D = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic", system-ui, sans-serif';
  const FONT_B = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';

  // ------------------------------------------------------------- 準備
  function init(opts = {}) {
    sc = document.getElementById('scene');
    oc = document.getElementById('fx');
    sx = sc.getContext('2d');
    ox = oc.getContext('2d');
    if (opts.blocked) blocked = opts.blocked;
    P2 = {};
    for (const k in D.AXE_PATHS) P2[k] = new Path2D(D.AXE_PATHS[k]);
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(sc);
    bind();
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = sc.getBoundingClientRect();
    rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    sc.width = Math.round(W * DPR);
    sc.height = Math.round(H * DPR);
    OW = window.innerWidth;
    OH = window.innerHeight;
    oc.width = Math.round(OW * DPR);
    oc.height = Math.round(OH * DPR);
    oc.style.width = OW + 'px';
    oc.style.height = OH + 'px';
    const woodEl = document.querySelector('#cur-wood .ico');
    const gemEl = document.querySelector('#cur-gem .ico');
    const c = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    targets = { wood: c(woodEl), gem: c(gemEl) };
    const bn = document.getElementById('banners');
    if (bn) { bn.style.left = r.left + 'px'; bn.style.top = r.top + 'px'; bn.style.width = r.width + 'px'; bn.style.height = r.height + 'px'; }
    // トーストはゲーム画面を隠さないよう、タブの上（スマホ）かパネル下部（PC）に出す
    const ts = document.getElementById('toasts');
    const tabsEl = document.getElementById('tabs'), panelEl = document.getElementById('panel');
    if (ts && tabsEl && panelEl) {
      const tr = tabsEl.getBoundingClientRect(), pr = panelEl.getBoundingClientRect();
      const atBottom = tr.top > window.innerHeight / 2;
      ts.style.top = 'auto';
      ts.style.bottom = (atBottom ? window.innerHeight - tr.top + 10 : 16) + 'px';
      ts.style.left = (atBottom ? window.innerWidth / 2 : pr.left + pr.width / 2) + 'px';
    }
    computeGeo();
    bgKey = '';
    seedAmbient();
  }
  function computeGeo() {
    GEO.gy = H * 0.86;
    GEO.cx = W / 2;
    GEO.hudBottom = 92;
    let th = H * 0.27, cr = Math.min(W * 0.26, H * 0.22);
    const avail = GEO.gy - GEO.hudBottom - 8;
    const need = th + cr * 1.55;
    if (need > avail) { const k = Math.max(0.4, avail / need); th *= k; cr *= k; }
    GEO.th = th;
    GEO.cr = cr;
    GEO.tw = U.clamp(cr * 0.32, 14, 52);
  }
  function setQuality(settings) {
    const night = document.body.classList.contains('night');
    calm = night;
    quality = night ? Math.min(1, settings.fx) : settings.fx;
    const rm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    allowShake = settings.shake && !night && !rm;
    allowFlash = settings.flash && !night;
  }

  // ------------------------------------------------------------- 乱数・色
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const palMemo = new Map();
  function palette(idx) {
    if (palMemo.has(idx)) return palMemo.get(idx);
    const p = makePalette(idx);
    palMemo.set(idx, p);
    return p;
  }
  function makePalette(idx) {
    const b = D.BIOMES[idx % D.BIOMES.length];
    const loop = Math.floor(idx / D.BIOMES.length);
    if (!loop) return Object.assign({ loop: 0 }, b);
    const deg = (loop * 67) % 360;
    const sh = (c) => U.shiftHue(c, deg);
    return Object.assign({}, b, {
      loop, name: `異界${loop > 1 ? loop : ''}・${b.name}`,
      sky: b.sky.map(sh), hills: b.hills.map(sh), ground: sh(b.ground), trunk: sh(b.trunk), leaves: b.leaves.map(sh),
    });
  }
  function ensurePalette() {
    const idx = G.biomeIndex(G.S.stage);
    if (idx !== palIdx) { palIdx = idx; pal = palette(idx); bgKey = ''; seedAmbient(); }
    return pal;
  }
  const biomeName = () => ensurePalette().name;

  // ------------------------------------------------------------- 背景
  function buildBg() {
    const key = palIdx + ':' + W + 'x' + H;
    if (key === bgKey && bgCanvas) return;
    bgKey = key;
    bgCanvas = bgCanvas || document.createElement('canvas');
    bgCanvas.width = Math.round(W * DPR);
    bgCanvas.height = Math.round(H * DPR);
    const c = bgCanvas.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = pal;
    const g = c.createLinearGradient(0, 0, 0, GEO.gy);
    g.addColorStop(0, p.sky[0]);
    g.addColorStop(1, p.sky[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // 太陽 / 月
    const r = mulberry(palIdx * 977 + 13);
    const sxp = W * (0.15 + r() * 0.7), syp = GEO.gy * 0.32;
    const rad = Math.min(W, H) * 0.07;
    const glow = c.createRadialGradient(sxp, syp, rad * 0.4, sxp, syp, rad * 3.2);
    glow.addColorStop(0, p.night ? 'rgba(255,250,230,0.45)' : 'rgba(255,255,220,0.65)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, W, GEO.gy);
    c.fillStyle = p.night ? '#fff6dc' : '#fffbe6';
    c.beginPath(); c.arc(sxp, syp, rad, 0, Math.PI * 2); c.fill();
    if (p.night) {
      c.fillStyle = p.sky[0];
      c.beginPath(); c.arc(sxp + rad * 0.45, syp - rad * 0.2, rad * 0.85, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 70; i++) { c.globalAlpha = 0.3 + r() * 0.7; c.fillRect(r() * W, r() * GEO.gy * 0.8, 1.5, 1.5); }
      c.globalAlpha = 1;
    }
    // 山並み 2層
    for (let layer = 0; layer < 2; layer++) {
      const base = GEO.gy - (layer === 0 ? H * 0.2 : H * 0.09);
      const amp = layer === 0 ? H * 0.09 : H * 0.05;
      const f1 = 0.004 + r() * 0.004, f2 = 0.011 + r() * 0.01, ph = r() * 10;
      c.fillStyle = p.hills[layer];
      c.beginPath();
      c.moveTo(0, GEO.gy);
      for (let x = 0; x <= W + 8; x += 8) c.lineTo(x, base - Math.sin(x * f1 + ph) * amp - Math.sin(x * f2 + ph * 2) * amp * 0.45);
      c.lineTo(W, GEO.gy);
      c.closePath();
      c.fill();
    }
    // 地面
    c.fillStyle = p.ground;
    c.fillRect(0, GEO.gy, W, H - GEO.gy);
    const gg = c.createLinearGradient(0, GEO.gy, 0, H);
    gg.addColorStop(0, 'rgba(255,255,255,0.18)');
    gg.addColorStop(0.08, 'rgba(255,255,255,0)');
    gg.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = gg;
    c.fillRect(0, GEO.gy, W, H - GEO.gy);
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = GEO.gy + 4 + r() * (H - GEO.gy - 8);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y - 6); c.moveTo(x, y); c.lineTo(x + 3, y - 7); c.stroke();
    }
  }

  // ------------------------------------------------------------- 環境パーティクル
  function seedAmbient() {
    amb.length = 0;
    if (!pal) return;
    const n = [8, 18, 30][quality] || 18;
    for (let i = 0; i < n; i++) amb.push(newAmb(true));
  }
  function newAmb(anywhere) {
    const t = pal.amb;
    const p = { x: Math.random() * W, y: anywhere ? Math.random() * H : -10, s: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 3, ph: Math.random() * 6 };
    if (t === 'snow') { p.vx = -8 + Math.random() * 16; p.vy = 20 + Math.random() * 25; p.s = 1.5 + Math.random() * 2.5; }
    else if (t === 'sand') { p.vx = 40 + Math.random() * 60; p.vy = 4 + Math.random() * 8; p.x = anywhere ? p.x : -10; p.y = anywhere ? p.y : Math.random() * H; }
    else if (t === 'ember' || t === 'spore') { p.vx = -6 + Math.random() * 12; p.vy = -(15 + Math.random() * 30); p.y = anywhere ? p.y : H + 10; }
    else if (t === 'sparkle' || t === 'star') { p.vx = 0; p.vy = 0; p.life = Math.random() * 3; }
    else if (t === 'cloud') { p.vx = 8 + Math.random() * 10; p.vy = 0; p.s = 10 + Math.random() * 16; p.x = anywhere ? p.x : -40; p.y = anywhere ? Math.random() * GEO.gy * 0.7 : Math.random() * GEO.gy * 0.7; }
    else { p.vx = -10 + Math.random() * 20; p.vy = 18 + Math.random() * 22; }
    return p;
  }
  function drawAmbient(c, dt) {
    const t = pal.amb;
    for (let i = 0; i < amb.length; i++) {
      const p = amb[i];
      p.x += (p.vx + Math.sin(sclock * 1.5 + p.ph) * (t === 'leaf' || t === 'maple' || t === 'petal' ? 12 : 0)) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.life !== undefined) { p.life -= dt; if (p.life < 0) { amb[i] = newAmb(true); amb[i].life = 2 + Math.random() * 2; continue; } }
      if (p.y > H + 12 || p.y < -30 || p.x > W + 50 || p.x < -50) { amb[i] = newAmb(false); continue; }
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      if (t === 'snow') { c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(0, 0, p.s, 0, 7); c.fill(); }
      else if (t === 'sand') { c.fillStyle = 'rgba(255,240,200,0.6)'; c.fillRect(0, 0, p.s * 1.6, 1.5); }
      else if (t === 'ember') { c.fillStyle = `rgba(255,${120 + (p.ph * 20) | 0},40,${0.5 + 0.5 * Math.sin(sclock * 6 + p.ph)})`; c.fillRect(-1.5, -1.5, 3, 3); }
      else if (t === 'spore') { c.fillStyle = `rgba(230,180,255,${0.4 + 0.4 * Math.sin(sclock * 3 + p.ph)})`; c.beginPath(); c.arc(0, 0, p.s * 0.6, 0, 7); c.fill(); }
      else if (t === 'sparkle' || t === 'star') {
        const a = Math.max(0, Math.sin((p.life || 0) * 2));
        c.fillStyle = t === 'star' ? `rgba(255,255,255,${a})` : `rgba(160,250,255,${a})`;
        star4(c, 0, 0, p.s * 0.9);
      } else if (t === 'cloud') {
        c.rotate(-p.rot);
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.beginPath(); c.arc(0, 0, p.s, 0, 7); c.arc(p.s * 0.9, 2, p.s * 0.7, 0, 7); c.arc(-p.s * 0.9, 3, p.s * 0.6, 0, 7); c.fill();
      } else {
        const col = t === 'petal' ? '#ffc0dc' : t === 'maple' ? (p.ph > 3 ? '#ff6a2b' : '#ffb21f') : pal.leaves[2];
        c.fillStyle = col;
        c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, 7); c.fill();
      }
      c.restore();
    }
  }
  function star4(c, x, y, r) {
    c.beginPath();
    c.moveTo(x, y - r * 2); c.quadraticCurveTo(x, y, x + r * 2, y); c.quadraticCurveTo(x, y, x, y + r * 2);
    c.quadraticCurveTo(x, y, x - r * 2, y); c.quadraticCurveTo(x, y, x, y - r * 2);
    c.fill();
  }

  // ------------------------------------------------------------- 木
  function geoOf(tree) {
    let g = geoMap.get(tree.seed);
    if (g) return g;
    const r = mulberry(tree.seed);
    const blobs = [{ x: 0, y: 0, r: 0.6, c: 0 }];
    const n = 5 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.5;
      const d = 0.4 + r() * 0.16;
      blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.78 - 0.04, r: 0.34 + r() * 0.16, c: 1 + (i % 2) });
    }
    blobs.sort((a, b) => a.y - b.y);
    const dots = [];
    for (let i = 0; i < 14; i++) dots.push({ x: (r() - 0.5) * 1.7, y: (r() - 0.6) * 1.3, s: 0.03 + r() * 0.05, ph: r() * 6 });
    const shards = [];
    const ns = 5 + Math.floor(r() * 3);
    for (let i = 0; i < ns; i++) shards.push({ a: -Math.PI / 2 + (i - (ns - 1) / 2) * (0.42 + r() * 0.1), l: 0.9 + r() * 0.7, w: 0.18 + r() * 0.1 });
    g = { blobs, dots, shards, lean: (r() - 0.5) * 0.08, hs: 0.92 + r() * 0.16, ws: 0.9 + r() * 0.2, tiers: 3 + Math.floor(r() * 2) };
    geoMap.set(tree.seed, g);
    if (geoMap.size > 8) geoMap.delete(geoMap.keys().next().value);
    return g;
  }
  function leafCols(tree) {
    const id = tree.rar.id;
    if (id === 'silver') return ['#dfe7f0', '#9db0c6', '#ffffff'];
    if (id === 'gold') return ['#ffcf33', '#d99400', '#fff1a0'];
    return pal.leaves;
  }
  function blobCol(tree, cols, i) {
    if (tree.rar.id === 'rainbow') return `hsl(${(sclock * 160 + i * 52) % 360},95%,${i % 3 === 2 ? 75 : 58}%)`;
    return cols[i % 3 === 0 ? 0 : i % 3];
  }
  function treeMetrics(tree) {
    const g = geoOf(tree);
    const k = tree.boss ? 1.16 : 1;
    return { g, th: GEO.th * g.hs * k, tw: GEO.tw * g.ws * k, cr: GEO.cr * k, h0: GEO.th * g.hs * k * 0.34 };
  }

  function drawTrunk(c, tree, m, dmgFrac, side) {
    const { th, tw } = m;
    const shape = pal.shape;
    const top = shape === 'mushroom' ? tw * 0.95 : tw * 0.72;
    const tg = c.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    if (shape === 'crystal') { tg.addColorStop(0, '#d8fbff'); tg.addColorStop(1, pal.trunk); }
    else { tg.addColorStop(0, pal.trunk); tg.addColorStop(0.65, pal.trunk); tg.addColorStop(1, 'rgba(0,0,0,0.55)'); }
    c.beginPath();
    c.moveTo(-tw / 2 - tw * 0.18, 0);
    c.quadraticCurveTo(-tw / 2, -tw * 0.1, -tw / 2, -tw * 0.3);
    c.lineTo(-top / 2, -th);
    c.lineTo(top / 2, -th);
    c.lineTo(tw / 2, -tw * 0.3);
    c.quadraticCurveTo(tw / 2, -tw * 0.1, tw / 2 + tw * 0.18, 0);
    c.closePath();
    c.fillStyle = pal.trunk;
    c.fill();
    c.fillStyle = tg;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.stroke();
    if (shape !== 'crystal' && shape !== 'mushroom') {
      c.strokeStyle = 'rgba(0,0,0,0.22)';
      c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const x = (-0.25 + i * 0.25) * tw;
        c.beginPath(); c.moveTo(x, -th * 0.12 - i * 6); c.quadraticCurveTo(x + 3, -th * 0.5, x - 1, -th * (0.7 + i * 0.08)); c.stroke();
      }
    }
    // 切り込み（ダメージで深くなる）
    if (dmgFrac > 0.002) {
      const h0 = m.h0, d = tw * 0.82 * Math.min(1, dmgFrac);
      const ex = side * (tw / 2 - (tw / 2 - top / 2) * (h0 / th));
      c.beginPath();
      c.moveTo(ex, -h0 - d * 0.55);
      c.lineTo(ex - side * d, -h0);
      c.lineTo(ex, -h0 + d * 0.3);
      c.closePath();
      c.fillStyle = '#f6dcaa';
      c.fill();
      c.strokeStyle = 'rgba(60,30,10,0.7)';
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = 'rgba(200,140,70,0.6)';
      c.beginPath(); c.moveTo(ex - side * d * 0.6, -h0 - d * 0.1); c.lineTo(ex, -h0 - d * 0.35); c.stroke();
    }
  }

  function drawCanopy(c, tree, m, wob) {
    const { g, th, cr } = m;
    const shape = pal.shape;
    const cols = leafCols(tree);
    c.save();
    c.translate(0, -th);
    c.rotate(g.lean + wob);
    if (tree.rar.id !== 'normal' && quality > 0) {
      c.shadowColor = tree.rar.id === 'gold' ? '#ffd84a' : tree.rar.id === 'silver' ? '#ffffff' : `hsl(${(sclock * 160) % 360},100%,60%)`;
      c.shadowBlur = 22 + Math.sin(sclock * 5) * 8;
    } else if (tree.boss && quality > 0) {
      c.shadowColor = 'rgba(255,40,40,0.8)';
      c.shadowBlur = 18 + Math.sin(sclock * 4) * 6;
    }
    if (shape === 'conifer') {
      const tiers = g.tiers;
      for (let i = 0; i < tiers; i++) {
        const y0 = -cr * 0.15 - i * cr * 0.55, w = cr * (1.05 - i * 0.2), hgt = cr * 0.95;
        c.fillStyle = blobCol(tree, cols, i);
        c.beginPath(); c.moveTo(0, y0 - hgt); c.lineTo(w, y0); c.lineTo(-w, y0); c.closePath(); c.fill();
        if (pal.deco === 'snow' && tree.rar.id === 'normal') {
          c.fillStyle = '#ffffff';
          c.beginPath(); c.moveTo(0, y0 - hgt); c.lineTo(w * 0.42, y0 - hgt * 0.58); c.lineTo(w * 0.15, y0 - hgt * 0.5);
          c.lineTo(0, y0 - hgt * 0.6); c.lineTo(-w * 0.2, y0 - hgt * 0.48); c.lineTo(-w * 0.42, y0 - hgt * 0.58); c.closePath(); c.fill();
        }
      }
      if (pal.deco === 'ember') {
        c.shadowBlur = 0;
        for (const d of g.dots) {
          c.fillStyle = `rgba(255,${200 + Math.sin(sclock * 8 + d.ph) * 55 | 0},60,${0.6 + 0.4 * Math.sin(sclock * 6 + d.ph)})`;
          c.beginPath(); c.arc(d.x * cr * 0.7, d.y * cr * 1.2 - cr * 0.6, d.s * cr, 0, 7); c.fill();
        }
      }
    } else if (shape === 'palm') {
      c.shadowBlur = 0;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.48 + Math.sin(sclock * 1.6 + i) * 0.04;
        const L = cr * (1.05 + (i % 2) * 0.15);
        c.save();
        c.rotate(a + Math.PI / 2);
        c.fillStyle = blobCol(tree, cols, i);
        c.beginPath();
        c.moveTo(0, 0);
        c.quadraticCurveTo(L * 0.28, -L * 0.45, L * 0.06, -L);
        c.quadraticCurveTo(-L * 0.24, -L * 0.45, 0, 0);
        c.fill();
        c.restore();
      }
      c.fillStyle = '#6b4320';
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc((i - 1) * cr * 0.13, cr * 0.06, cr * 0.09, 0, 7); c.fill(); }
    } else if (shape === 'mushroom') {
      const capW = cr * 1.2, capH = cr * 0.95;
      const capCol = tree.rar.id === 'rainbow' ? blobCol(tree, cols, 0) : cols[0];
      c.fillStyle = capCol;
      c.beginPath(); c.ellipse(0, -cr * 0.1, capW, capH, 0, Math.PI, 0); c.closePath(); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.beginPath(); c.ellipse(0, -cr * 0.1, capW, capH * 0.2, 0, 0, Math.PI); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.92)';
      for (const d of g.dots.slice(0, 8)) {
        const x = d.x * capW * 0.55, y = -cr * 0.25 - Math.abs(d.y) * capH * 0.55;
        c.beginPath(); c.arc(x, y, d.s * cr * 2.2, 0, 7); c.fill();
      }
    } else if (shape === 'crystal') {
      for (let i = 0; i < g.shards.length; i++) {
        const s = g.shards[i];
        c.save();
        c.rotate(s.a + Math.PI / 2);
        const L = s.l * cr, w = s.w * cr;
        const gr = c.createLinearGradient(-w, 0, w, 0);
        gr.addColorStop(0, tree.rar.id === 'rainbow' ? blobCol(tree, cols, i) : cols[2]);
        gr.addColorStop(1, tree.rar.id === 'rainbow' ? blobCol(tree, cols, i + 1) : cols[1]);
        c.fillStyle = gr;
        c.globalAlpha *= 0.92;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(w, -L * 0.7); c.lineTo(0, -L); c.lineTo(-w, -L * 0.7); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.8)';
        c.lineWidth = 1.2;
        c.stroke();
        c.restore();
      }
    } else {
      const k = cr * 0.95;
      for (let i = 0; i < g.blobs.length; i++) {
        const b = g.blobs[i];
        c.fillStyle = blobCol(tree, cols, b.c === 0 ? 0 : b.c);
        if (tree.rar.id === 'rainbow') c.fillStyle = blobCol(tree, cols, i);
        c.beginPath(); c.arc(b.x * k, b.y * k - k * 0.42, b.r * k, 0, 7); c.fill();
      }
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,255,255,0.18)';
      for (const b of g.blobs) { if (b.y > 0) continue; c.beginPath(); c.arc(b.x * k - b.r * k * 0.3, b.y * k - k * 0.42 - b.r * k * 0.32, b.r * k * 0.42, 0, 7); c.fill(); }
      if (pal.deco === 'stars' || pal.shape === 'round') {
        const isStar = pal.deco === 'stars';
        const isPetal = pal.amb === 'petal';
        if (isStar || isPetal) {
          for (const d of g.dots) {
            c.fillStyle = isStar ? `rgba(255,255,230,${0.5 + 0.5 * Math.sin(sclock * 3 + d.ph)})` : 'rgba(255,255,255,0.85)';
            if (isStar) star4(c, d.x * k * 0.75, d.y * k * 0.8 - k * 0.42, d.s * k * 0.9);
            else { c.beginPath(); c.arc(d.x * k * 0.75, d.y * k * 0.8 - k * 0.42, d.s * k * 0.8, 0, 7); c.fill(); }
          }
        }
      }
    }
    c.shadowBlur = 0;
    // レア木のキラキラ
    if (tree.rar.id !== 'normal' && quality > 0) {
      for (let i = 0; i < 4; i++) {
        const d = g.dots[i];
        const a = Math.max(0, Math.sin(sclock * 4 + d.ph * 3));
        c.fillStyle = `rgba(255,255,255,${a})`;
        star4(c, d.x * cr * 0.9, d.y * cr - cr * 0.45, cr * 0.035 * (1 + a));
      }
    }
    c.restore();
  }

  function drawBossFace(c, m, angry) {
    const { th, tw } = m;
    const y = -th * 0.55;
    const blink = Math.sin(sclock * 1.3) > 0.97 ? 0.15 : 1;
    c.fillStyle = '#ffeb3b';
    c.strokeStyle = '#2a0000';
    c.lineWidth = 2;
    for (const s of [-1, 1]) {
      c.save();
      c.translate(s * tw * 0.2, y);
      c.scale(1, blink);
      c.beginPath(); c.ellipse(0, 0, tw * 0.13, tw * 0.1, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#d00000';
      c.beginPath(); c.arc(s * -tw * 0.02, 0, tw * 0.05, 0, 7); c.fill();
      c.fillStyle = '#ffeb3b';
      c.restore();
      c.beginPath(); c.moveTo(s * tw * 0.36, y - tw * 0.2); c.lineTo(s * tw * 0.08, y - tw * (angry ? 0.08 : 0.14)); c.lineWidth = 3; c.stroke(); c.lineWidth = 2;
    }
    c.fillStyle = '#2a0000';
    c.beginPath(); c.moveTo(-tw * 0.18, y + tw * 0.28); c.quadraticCurveTo(0, y + tw * (angry ? 0.12 : 0.2), tw * 0.18, y + tw * 0.28); c.lineTo(tw * 0.12, y + tw * 0.34); c.lineTo(-tw * 0.12, y + tw * 0.34); c.closePath(); c.fill();
  }

  function drawTreeFull(c, tree, x, y, k, alpha, wob, opt = {}) {
    const m = treeMetrics(tree);
    const dmg = 1 - tree.hp / tree.maxHp;
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    if (opt.fall) {
      c.translate(0, -m.h0);
      c.rotate(opt.fall);
      c.translate(0, m.h0);
      c.beginPath();
      c.rect(-W * 2, -H * 3, W * 4, H * 3 - m.h0);
      c.clip();
    }
    c.scale(k * (1 + treeSquash * 0.06), k * (1 - treeSquash * 0.08));
    if (pal.shape === 'palm') {
      drawPalmTrunk(c, tree, m, opt.fall ? 1 : dmg);
    } else {
      drawTrunk(c, tree, m, opt.fall ? 1 : dmg, tree.side);
    }
    drawCanopy(c, tree, m, wob);
    if (tree.boss) {
      drawBossFace(c, m, tree.hp / tree.maxHp < 0.5);
      c.font = `${Math.round(m.cr * 0.45)}px ${FONT_B}`;
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      const crownY = pal.shape === 'conifer' ? -m.th - m.cr * 1.85 : -m.th - m.cr * 1.5;
      c.fillText('👑', 0, crownY + Math.sin(sclock * 3) * 3);
    }
    c.restore();
  }
  function drawPalmTrunk(c, tree, m, dmg) {
    const { th, tw } = m;
    c.fillStyle = pal.trunk;
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 1.5;
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const bend = (t) => Math.pow(t, 2) * tw * 0.9 * (tree.side || 1) * -0.6;
      const w0 = tw * (1 - t0 * 0.35) / 2, w1 = tw * (1 - t1 * 0.35) / 2;
      c.beginPath();
      c.moveTo(bend(t0) - w0, -th * t0);
      c.lineTo(bend(t1) - w1 * 1.1, -th * t1);
      c.lineTo(bend(t1) + w1 * 1.1, -th * t1);
      c.lineTo(bend(t0) + w0, -th * t0);
      c.closePath();
      c.fill();
      c.stroke();
    }
    drawTrunkNotchOnly(c, m, dmg, tree.side);
  }
  function drawTrunkNotchOnly(c, m, dmgFrac, side) {
    if (dmgFrac <= 0.002) return;
    const { tw, h0 } = m;
    const d = tw * 0.8 * Math.min(1, dmgFrac);
    const ex = side * tw / 2;
    c.beginPath(); c.moveTo(ex, -h0 - d * 0.55); c.lineTo(ex - side * d, -h0); c.lineTo(ex, -h0 + d * 0.3); c.closePath();
    c.fillStyle = '#f6dcaa'; c.fill();
    c.strokeStyle = 'rgba(60,30,10,0.7)'; c.stroke();
  }
  function drawStump(c, tree, x, y) {
    const m = treeMetrics(tree);
    const { tw, h0 } = m;
    c.save();
    c.translate(x, y);
    c.fillStyle = pal.trunk;
    c.beginPath();
    c.moveTo(-tw / 2 - tw * 0.18, 0);
    c.quadraticCurveTo(-tw / 2, -tw * 0.1, -tw / 2, -h0 * 0.8);
    c.lineTo(tw / 2, -h0 * 0.8 - tw * 0.08);
    c.quadraticCurveTo(tw / 2, -tw * 0.1, tw / 2 + tw * 0.18, 0);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fill();
    c.fillStyle = '#f6dcaa';
    c.beginPath(); c.ellipse(0, -h0 * 0.8 - tw * 0.04, tw / 2, tw * 0.16, -0.08, 0, 7); c.fill();
    c.strokeStyle = 'rgba(150,90,40,0.6)';
    c.lineWidth = 1;
    for (let i = 1; i <= 3; i++) { c.beginPath(); c.ellipse(0, -h0 * 0.8 - tw * 0.04, tw / 2 * i / 4, tw * 0.16 * i / 4, -0.08, 0, 7); c.stroke(); }
    c.restore();
  }

  // ------------------------------------------------------------- 斧
  function drawAxe(c, axe, gx, gy, ang, k, mirror, glowPhase) {
    if (!axe) axe = { blade: ['#e0e6ec', '#7f8b96'], handle: '#7a5533' };
    c.save();
    c.translate(gx, gy);
    c.rotate(ang);
    c.scale(k * mirror, k);
    c.translate(-32, -62);
    if (axe.glow && quality > 0) {
      c.shadowColor = axe.glow === 'rainbow' ? `hsl(${(clock * 200) % 360},100%,60%)` : axe.glow;
      c.shadowBlur = 16 + Math.sin(glowPhase * 6) * 6;
    }
    const gr = c.createLinearGradient(20, 0, 60, 34);
    gr.addColorStop(0, axe.blade[0]);
    gr.addColorStop(1, axe.blade[1]);
    c.lineWidth = 2.2 / k;
    c.strokeStyle = '#1a1008';
    c.fillStyle = axe.handle;
    c.fill(P2.handle); c.stroke(P2.handle);
    c.fillStyle = gr;
    if (axe.double) { c.fill(P2.blade2); c.stroke(P2.blade2); }
    else { c.fill(P2.poll); c.stroke(P2.poll); }
    c.fill(P2.blade); c.stroke(P2.blade);
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.stroke(P2.edge);
    if (axe.double) c.stroke(P2.edge2);
    c.restore();
  }
  function axePose(tree) {
    const m = treeMetrics(tree);
    const side = tree.side;
    const nx = GEO.cx + side * m.tw * 0.5, ny = GEO.gy - m.h0;
    const L = U.clamp(m.th * 0.5, 34, 104);
    const k = L / 56;
    // 斧の刃先（握りからの相対・ミラー前）≈ (26,-44)。命中時の角度で刃先が切り込みに来る位置に握りを置く
    const hitA = -side * 0.22;
    const ex = -26 * side, ey = -44;
    const rx = ex * Math.cos(hitA) - ey * Math.sin(hitA), ry = ex * Math.sin(hitA) + ey * Math.cos(hitA);
    return { gx: nx - rx * k, gy: ny - ry * k, k, side, hitA, restA: side * 0.85 };
  }

  // ------------------------------------------------------------- シーン描画
  function drawScene(dt) {
    const c = sx;
    ensurePalette();
    buildBg();
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    let ox_ = 0, oy_ = 0;
    if (shake > 0.01 && allowShake) { ox_ = (Math.random() - 0.5) * shake * 18; oy_ = (Math.random() - 0.5) * shake * 12; }
    c.clearRect(0, 0, W, H);
    c.save();
    c.translate(ox_, oy_);
    c.drawImage(bgCanvas, 0, 0, W, H);
    drawAmbient(c, dt);
    const T = G.T, S = G.S;

    // フィーバー
    if (T.fever > 0) {
      const a = 0.16 + 0.08 * Math.sin(sclock * 10);
      const g = c.createLinearGradient(0, 0, W, H);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsla(${(sclock * 120 + i * 60) % 360},100%,60%,${a})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      if (quality > 0) {
        c.save();
        c.translate(GEO.cx, GEO.gy - GEO.th);
        c.rotate(sclock * 0.6);
        c.fillStyle = 'rgba(255,255,255,0.08)';
        for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(W, -40); c.lineTo(W, 40); c.closePath(); c.fill(); }
        c.restore();
      }
    }

    // 倒れていく木
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      const dur = f.fast ? 0.32 : 0.5;
      const p = Math.min(1, f.t / dur);
      if (p >= 1 && !f.landed) { f.landed = true; landed(f); }
      const fade = f.landed ? Math.max(0, 1 - (f.t - dur) / 0.28) : 1;
      if (fade <= 0) { falling.splice(i, 1); continue; }
      const ang = f.tree.side * (Math.PI / 2) * 0.96 * U.ease.inQuad(p);
      if (f.escaped) {
        drawTreeFull(c, f.tree, GEO.cx, GEO.gy - f.t * 260, Math.max(0, 1 - f.t), Math.max(0, 1 - f.t * 1.2), 0);
      } else {
        drawStump(c, f.tree, GEO.cx, GEO.gy);
        drawTreeFull(c, f.tree, GEO.cx, GEO.gy, 1, fade, 0, { fall: ang });
      }
    }

    // 現在の木
    const tree = T.tree;
    if (tree && tree.alive) {
      growT = Math.min(1, growT + dt / 0.32);
      const k = U.ease.outBack(growT);
      const wob = Math.sin(sclock * 38) * 0.05 * treeShake;
      const shx = Math.sin(sclock * 70) * 5 * treeShake;
      drawTreeFull(c, tree, GEO.cx + shx, GEO.gy, Math.max(0.01, k), 1, wob);
      // 斧
      const pose = axePose(tree);
      const eq = G.stats().eq;
      const swing = axeT < 0.35 ? U.ease.outQuad(axeT / 0.35) : 1 - U.ease.inOutSine((axeT - 0.35) / 0.65);
      const ang = U.lerp(pose.restA, pose.hitA, axeT >= 1 ? 0 : swing);
      drawAxe(c, eq, pose.gx + shx * 0.3, pose.gy, ang, pose.k * Math.min(1, k), pose.side > 0 ? -1 : 1, clock);
    }

    drawWorkers(c, dt);
    c.restore();
    drawHud(c, dt);
  }

  function landed(f) {
    if (f.escaped || blocked()) return;
    addShake(f.tree.boss ? 0.9 : 0.35);
    const m = treeMetrics(f.tree);
    const len = m.th + m.cr;
    for (let i = 0; i < (quality + 1) * 5; i++) {
      const x = GEO.cx + f.tree.side * (Math.random() * len);
      spawn({ t: 'dust', x: rect.left + x, y: rect.top + GEO.gy - 4, vx: (Math.random() - 0.5) * 80, vy: -20 - Math.random() * 40, life: 0.7, max: 0.7, s: 8 + Math.random() * 10 });
    }
    if (!calm) floatText(rect.left + GEO.cx + f.tree.side * len * 0.5, rect.top + GEO.gy - 30, 'TIMBER!', { size: f.tree.boss ? 34 : 22, fill: '#fff3c4', stroke: '#5a2a00', vy: -40, life: 0.8 });
  }

  // 木こり達
  function drawWorkers(c, dt) {
    const S = G.S;
    const st = G.stats();
    const owned = D.WORKERS.filter((w) => (S.workers[w.id] || 0) > 0);
    if (!owned.length) return;
    const n = owned.length, per = Math.ceil(n / 2);
    const tw = GEO.tw;
    const room = W / 2 - tw - 20;
    const sp = Math.min(32, room / per);
    const size = Math.round(U.clamp(sp * 0.95, 14, 26));
    c.font = `${size}px ${FONT_B}`;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    const total = st.dps || 1;
    owned.forEach((w, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      const x = GEO.cx + side * (tw * 0.9 + 18 + k * sp);
      const period = 0.75 + (i % 5) * 0.12;
      const prev = wPhase[w.id] || 0;
      const ph = (prev + dt / period) % 1;
      if (ph < prev && G.T.tree && G.T.tree.alive && !blocked()) {
        const share = st.wdps[w.id] / total;
        if (quality >= 2 && share > 0.02) {
          floatText(rect.left + x + side * -6, rect.top + GEO.gy - size - 6, U.fmt(st.wdps[w.id] * period), { size: 11, fill: '#ffe9c9', stroke: 'rgba(40,20,0,0.8)', vy: -45, life: 0.6, light: true });
        }
        if (quality >= 1 && Math.random() < 0.5) spawnChip(rect.left + GEO.cx - side * tw * 0.4, rect.top + GEO.gy - GEO.th * 0.15, 1);
      }
      wPhase[w.id] = ph;
      const jerk = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
      const bob = Math.abs(Math.sin(sclock * 5 + i)) * 2;
      c.save();
      c.translate(x, GEO.gy + 2 - bob);
      c.rotate(-side * jerk * 0.45);
      c.scale(side, 1);
      c.fillText(w.icon, 0, 0);
      c.restore();
    });
  }

  // HUD（シーン内）
  function txt(c, s, x, y, size, fill, opts = {}) {
    c.font = `${opts.weight || ''} ${size}px ${opts.body ? FONT_B : FONT_D}`;
    c.textAlign = opts.align || 'left';
    c.textBaseline = opts.base || 'top';
    if (opts.stroke !== false) {
      c.lineJoin = 'round';
      c.lineWidth = opts.lw || Math.max(3, size * 0.22);
      c.strokeStyle = opts.strokeCol || 'rgba(20,10,4,0.85)';
      c.strokeText(s, x, y);
    }
    c.fillStyle = fill;
    c.fillText(s, x, y);
  }
  function drawHud(c, dt) {
    const S = G.S, T = G.T;
    const L = 16;
    // ステージ
    txt(c, 'STAGE', L, 9, 10, '#ffe7c2', { body: true, weight: 800 });
    txt(c, String(S.stage), L + 44, 4, 20, '#ffffff');
    const bn = biomeName();
    txt(c, bn, L, 30, 11, '#fff3e0', { body: true, weight: 700, lw: 3 });
    // 進捗ピップ
    const py = 48;
    if (S.farming) {
      txt(c, '周回中', L, py - 3, 10, '#ffb0a0', { body: true, weight: 800, lw: 3 });
    } else if (!G.isBossStage(S.stage)) {
      for (let i = 0; i < D.CFG.TREES_PER_STAGE; i++) {
        c.fillStyle = i < S.kills ? '#ffc04a' : 'rgba(0,0,0,0.35)';
        c.strokeStyle = 'rgba(0,0,0,0.5)';
        c.lineWidth = 1;
        c.beginPath(); c.arc(L + 4 + i * 9, py + 3, 3.4, 0, 7); c.fill(); c.stroke();
      }
    }
    // コンボ
    if (T.combo > 1) { comboFade = 1; comboShown = T.combo; comboMultShown = G.comboMult(); } else comboFade = Math.max(0, comboFade - dt * 2);
    if (comboFade > 0 && comboShown > 1) {
      comboPop = Math.max(0, comboPop - dt * 6);
      const n = comboShown;
      const col = n >= 500 ? `hsl(${(sclock * 300) % 360},100%,65%)` : n >= 200 ? '#ff4d9a' : n >= 100 ? '#ff8a1a' : n >= 50 ? '#ffd23a' : '#ffffff';
      c.save();
      c.globalAlpha = comboFade;
      const x = W - L, sz = 26 + Math.min(14, n / 40);
      c.translate(x, 6);
      c.scale(1 + comboPop * 0.35, 1 + comboPop * 0.35);
      txt(c, String(n), 0, 0, sz, col, { align: 'right' });
      c.restore();
      c.save();
      c.globalAlpha = comboFade;
      txt(c, `COMBO ×${comboMultShown.toFixed(2)}`, W - L, 38, 10, '#fff3e0', { align: 'right', body: true, weight: 800, lw: 3 });
      const frac = T.combo > 0 ? U.clamp(T.comboTimer / (T.comboWin || 1), 0, 1) : 0;
      c.fillStyle = 'rgba(0,0,0,0.4)';
      c.fillRect(W - L - 70, 53, 70, 3);
      c.fillStyle = col;
      c.fillRect(W - L - 70 * frac, 53, 70 * frac, 3);
      c.restore();
    }
    // 木の名前とHPバー
    const tree = T.tree;
    if (tree) {
      const p = palette(G.biomeIndex(tree.stage));
      let name = tree.boss ? `BOSS ${p.boss}` : `${tree.rar.name}${p.tree}`;
      const bw = Math.min(W - 2 * L, 340), bx = (W - bw) / 2, by = 74, bh = 11;
      const nameCol = tree.boss ? '#ff6b6b' : tree.rar.id === 'gold' ? '#ffd84a' : tree.rar.id === 'silver' ? '#eef4ff' : tree.rar.id === 'rainbow' ? `hsl(${(sclock * 200) % 360},100%,70%)` : '#ffffff';
      if (tree.rar.id !== 'normal') name = `✦ ${name} ✦`;
      txt(c, name, W / 2, 58, 12, nameCol, { align: 'center', body: true, weight: 800, lw: 3.5 });
      const frac = tree.alive ? tree.hp / tree.maxHp : 0;
      hpTrail = frac > hpTrail ? frac : Math.max(frac, hpTrail - dt * 0.9);
      c.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(c, bx - 2, by - 2, bw + 4, bh + 4, 6); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.75)';
      roundRect(c, bx, by, bw * hpTrail, bh, 4); c.fill();
      const hg = c.createLinearGradient(bx, 0, bx + bw, 0);
      if (tree.boss) { hg.addColorStop(0, '#ff2a2a'); hg.addColorStop(1, '#ff8a3a'); }
      else { hg.addColorStop(0, '#ff5a3a'); hg.addColorStop(0.5, '#ffc93a'); hg.addColorStop(1, '#7bff4a'); }
      c.fillStyle = hg;
      roundRect(c, bx, by, bw * frac, bh, 4); c.fill();
      txt(c, `${U.fmt(Math.ceil(tree.hp))} / ${U.fmt(tree.maxHp)}`, W / 2, by - 0.5, 9, '#ffffff', { align: 'center', body: true, weight: 800, lw: 2.5 });
      if (tree.boss && tree.alive) {
        const t = T.bossTimer;
        const urgent = t < 10;
        const s = 1 + (urgent ? Math.max(0, Math.sin(sclock * 10)) * 0.15 : 0);
        c.save();
        c.translate(W / 2, by + bh + 4);
        c.scale(s, s);
        txt(c, `⏱ ${t.toFixed(1)}`, 0, 0, 15, urgent ? '#ff4040' : '#ffe0e0', { align: 'center' });
        c.restore();
        if (urgent && Math.floor(t) !== Math.floor(t + dt)) Sfx.tick();
      }
    }
    // フィーバーゲージ
    const fy = H - 14, fx0 = L, fw = W - 2 * L;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(c, fx0, fy, fw, 8, 4); c.fill();
    let f, label;
    if (T.fever > 0) {
      f = T.fever / (T.feverMax || 1);
      const g = c.createLinearGradient(fx0, 0, fx0 + fw, 0);
      for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(sclock * 240 + i * 60) % 360},100%,60%)`);
      c.fillStyle = g;
      label = `FEVER!! ×${G.stats().feverMult}`;
    } else {
      f = T.feverGauge / D.CFG.FEVER_NEED;
      c.fillStyle = f > 0.8 ? `hsl(${(sclock * 300) % 360},100%,60%)` : '#ff3d8b';
      label = 'FEVER';
    }
    roundRect(c, fx0, fy, fw * U.clamp(f, 0, 1), 8, 4); c.fill();
    txt(c, label, fx0 + 2, fy - 14, 10, T.fever > 0 ? '#ffffff' : '#ffd0e4', { body: true, weight: 800, lw: 3 });
  }
  function roundRect(c, x, y, w, h, r) {
    w = Math.max(0, w);
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ------------------------------------------------------------- オーバーレイ（粒子・数字）
  function spawn(p) {
    const max = MAXP[quality];
    if (parts.length >= max) parts.splice(0, parts.length - max + 1);
    parts.push(p);
  }
  function spawnChip(x, y, n) {
    for (let i = 0; i < n; i++) {
      spawn({ t: 'chip', x, y, vx: (Math.random() - 0.5) * 260, vy: -120 - Math.random() * 220, life: 0.8, max: 0.8, s: 3 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, col: Math.random() < 0.5 ? '#f3d29a' : '#c8894a' });
    }
  }
  function floatText(x, y, s, o = {}) {
    const max = MAXT[quality];
    if (texts.length >= max) texts.splice(0, texts.length - max + 1);
    texts.push({ x, y, s, size: o.size || 18, fill: o.fill || '#fff', stroke: o.stroke || 'rgba(30,14,4,0.9)', vy: o.vy || -70, vx: o.vx || 0, life: o.life || 0.9, max: o.life || 0.9, pop: o.pop || 1.5, rainbow: !!o.rainbow, light: !!o.light, font: o.font || FONT_D });
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
      const sx0 = x + (Math.random() - 0.5) * 40, sy0 = y + (Math.random() - 0.5) * 30;
      spawn({ t: kind === 'gem' ? 'gem' : 'coin', x: sx0, y: sy0, sx: sx0, sy: sy0, cx: sx0 + (Math.random() - 0.5) * 220, cy: Math.min(sy0, tgt.y) - 60 - Math.random() * 120, tx: tgt.x, ty: tgt.y, life: 0.75 + i * 0.03, max: 0.75 + i * 0.03, home: true, s: kind === 'gem' ? 7 : 8, rot: 0, last: i === n - 1, cb: i === n - 1 ? onArrive : null, kind });
    }
  }

  function drawOverlay(dt) {
    const c = ox;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, OW, OH);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.home) { if (p.kind === 'gem') Sfx.gem(); else Sfx.coin(); UI.bump(p.kind); if (p.cb) p.cb(); }
        parts.splice(i, 1);
        continue;
      }
      const a = p.life / p.max;
      if (p.home) {
        const t = U.ease.inQuad(1 - a);
        const it = 1 - t;
        p.x = it * it * p.sx + 2 * it * t * p.cx + t * t * p.tx;
        p.y = it * it * p.sy + 2 * it * t * p.cy + t * t * p.ty;
      } else {
        p.vy += (p.t === 'chip' ? 900 : p.t === 'confetti' ? 60 : p.t === 'dust' ? -20 : p.g || 0) * dt;
        if (p.t === 'confetti') p.vx += Math.sin(clock * 4 + p.ph) * 40 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.t === 'spark' || p.t === 'dust') { p.vx *= 1 - 2.5 * dt; p.vy *= 1 - 2.5 * dt; }
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
        case 'coin': {
          c.fillStyle = '#ffcf4a'; c.strokeStyle = '#8a5a10'; c.lineWidth = 1.5;
          c.beginPath(); c.arc(0, 0, p.s, 0, 7); c.fill(); c.stroke();
          c.fillStyle = '#c98a2a'; c.beginPath(); c.arc(0, 0, p.s * 0.55, 0, 7); c.fill();
          c.strokeStyle = '#ffe9a8'; c.beginPath(); c.arc(0, 0, p.s * 0.3, 0, 7); c.stroke();
          break;
        }
        case 'gem': {
          c.rotate(clock * 4);
          c.fillStyle = '#5ee8ff'; c.strokeStyle = '#0a5a7a'; c.lineWidth = 1.5;
          c.beginPath(); c.moveTo(0, -p.s); c.lineTo(p.s * 0.8, 0); c.lineTo(0, p.s); c.lineTo(-p.s * 0.8, 0); c.closePath(); c.fill(); c.stroke();
          break;
        }
      }
      c.restore();
    }
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
    if (flash > 0.01 && allowFlash) {
      c.fillStyle = `rgba(${flashRGB},${flash})`;
      c.fillRect(0, 0, OW, OH);
    }
  }

  // ------------------------------------------------------------- 演出API
  function addShake(v) { if (allowShake) shake = Math.min(1.2, shake + v); }
  function addFlash(v, rgb = '255,255,255') { flash = Math.min(0.7, Math.max(flash, v)); flashRGB = rgb; }
  function notchPoint() {
    const tree = G.T.tree;
    if (!tree) return { x: rect.left + GEO.cx, y: rect.top + GEO.gy - GEO.th * 0.2 };
    const m = treeMetrics(tree);
    return { x: rect.left + GEO.cx + tree.side * m.tw * 0.45, y: rect.top + GEO.gy - m.h0 };
  }
  function sceneCenter() { return { x: rect.left + GEO.cx, y: rect.top + GEO.gy - GEO.th - GEO.cr * 0.6 }; }

  const TIER = [
    null,
    { label: 'CRIT!', fill: '#ffd23a', size: 30 },
    { label: 'SUPER CRIT!!', fill: '#ff8a1a', size: 38 },
    { label: 'ULTRA CRIT!!!', fill: '#ff3d8b', size: 48 },
    { label: 'GOD CRIT!!!!', fill: '#ffffff', size: 62, rainbow: true },
  ];

  function onTap(d) {
    axeT = 0;
    Sfx.chop(d.combo, d.tier);
    if (blocked()) return;
    const np = notchPoint();
    const x = d.x != null ? d.x : np.x + (Math.random() - 0.5) * 60;
    const y = d.y != null ? d.y : np.y - 40 - Math.random() * 40;
    if (d.alive) {
      treeShake = Math.min(1.6, treeShake + 0.6 + d.tier * 0.3);
      spawnChip(np.x, np.y, [2, 4, 6][quality] + d.tier * 2);
      if (Math.random() < 0.3 && quality > 0) {
        const cc = sceneCenter();
        spawn({ t: 'chip', x: cc.x + (Math.random() - 0.5) * GEO.cr * 1.5, y: cc.y + (Math.random() - 0.5) * GEO.cr, vx: (Math.random() - 0.5) * 40, vy: 10, life: 1.4, max: 1.4, s: 4, rot: 0, vr: 3, col: pal ? pal.leaves[0] : '#3fae4f' });
      }
    }
    const tier = TIER[d.tier];
    const jitter = (Math.random() - 0.5) * 50;
    if (!tier) {
      floatText(x + jitter, y - 10, U.fmt(d.dmg), { size: 18 + Math.min(8, d.combo / 60), fill: G.T.fever > 0 ? '#ffe6ff' : '#ffffff', vy: -110, life: 0.7 });
    } else {
      floatText(x + jitter, y - 24, U.fmt(d.dmg), { size: tier.size, fill: tier.fill, rainbow: tier.rainbow, pop: 2.2, vy: -90, life: 1.0 });
      floatText(x + jitter, y - 24 - tier.size * 0.9, tier.label, { size: tier.size * 0.42, fill: tier.fill, rainbow: tier.rainbow, pop: 1.8, vy: -90, life: 1.0, font: FONT_D });
      burst(np.x, np.y, [4, 8, 14][quality] * d.tier, { col: tier.rainbow ? undefined : tier.fill, speed: 200 + d.tier * 120 });
      treeSquash = Math.min(1, 0.4 + d.tier * 0.2);
      addShake(0.12 * d.tier);
      if (d.tier >= 2) { addFlash(0.12 * d.tier, d.tier >= 4 ? '255,255,255' : '255,220,120'); hitStop = 0.03 * d.tier; }
      if (d.tier >= 3) spawn({ t: 'ring', x: np.x, y: np.y, life: 0.5, max: 0.5, s: 140, col: tier.fill });
      if (d.tier >= 4) { confetti(90); UI.banner('GOD CRIT', '神が降りた ・ 💎+10', 'god'); }
    }
    comboPop = 1;
    if (G.COMBO_MS.indexOf(d.combo) >= 0) { burst(rect.left + W - 50, rect.top + 24, 24, { speed: 260 }); }
  }

  function onFell(d) {
    const tree = d.tree;
    falling.push({ tree: Object.assign({}, tree), t: 0, fast: G.T.respawn < 0.5, landed: false });
    if (falling.length > 3) falling.shift();
    growT = 0;
    if (blocked()) return;
    const cc = sceneCenter();
    const big = tree.boss || tree.rar.id !== 'normal';
    floatText(cc.x, cc.y - 10, '+' + U.fmt(d.reward), { size: big ? 34 : 24, fill: '#ffc04a', stroke: '#4a2400', vy: -70, life: 1.2, pop: 1.8 });
    coins(cc.x, cc.y, big ? 14 : 6, 'wood');
    if (d.gems) {
      floatText(cc.x + 50, cc.y + 20, '💎+' + d.gems, { size: 18, fill: '#5ee8ff', stroke: '#06324a', vy: -60, life: 1.2 });
      coins(cc.x, cc.y, Math.min(8, d.gems), 'gem');
    }
    if (d.chest) floatText(cc.x - 50, cc.y + 20, '📦 宝箱GET!', { size: 16, fill: '#ffe08a', stroke: '#4a2400', vy: -50, life: 1.4 });
    if (big) { confetti(tree.boss ? 70 : 30); addFlash(0.18, '255,230,150'); }
    Sfx.fell(tree.rar.id, tree.boss);
    Sfx.vibrate(tree.boss ? [30, 40, 60] : 15);
  }

  // ------------------------------------------------------------- イベント購読
  function bind() {
    G.on('tap', onTap);
    G.on('fell', onFell);
    G.on('spawn', (tree) => {
      growT = 0;
      treeShake = 0;
      if (tree.rar.id !== 'normal' && !blocked()) {
        const cc = sceneCenter();
        burst(cc.x, cc.y, 20, { col: tree.rar.id === 'gold' ? '#ffd84a' : tree.rar.id === 'silver' ? '#ffffff' : undefined, speed: 220 });
        UI.banner(tree.rar.id === 'rainbow' ? '虹の木!!' : tree.rar.id === 'gold' ? '金の木!' : '銀の木', tree.rar.id === 'rainbow' ? '報酬×50 ・ 激レア' : tree.rar.id === 'gold' ? '報酬×10' : '報酬×3', 'rare-' + tree.rar.id);
        Sfx.squirrel();
      }
    });
    G.on('bossStart', () => { UI.banner('BOSS BATTLE', '30秒以内に伐り倒せ！', 'boss'); Sfx.boss(); addShake(0.5); addFlash(0.2, '255,60,60'); });
    G.on('bossWin', (d) => { UI.banner('BOSS DEFEATED!!', `💎+${d.gems} ・ 📦+1`, 'win'); Sfx.bossWin(); confetti(120); });
    G.on('bossFail', (tree) => {
      falling.push({ tree: Object.assign({}, tree), t: 0, escaped: true, landed: true });
      UI.banner('逃げられた…', '木こりを強化して再挑戦！', 'fail');
      Sfx.bossFail();
    });
    G.on('stage', (d) => {
      if (d.newBiome) {
        palIdx = -1;
        ensurePalette();
        UI.banner('NEW AREA', pal.name, 'area');
        confetti(60);
      } else if (!G.isBossStage(d.stage)) {
        Sfx.stage();
      }
    });
    G.on('feverStart', (d) => { UI.banner('FEVER TIME!!', `全ダメージ ×${d.mult} ・ ${d.time}秒`, 'fever'); Sfx.feverStart(); addFlash(0.25, '255,120,220'); confetti(50); Sfx.vibrate([20, 30, 20]); });
    G.on('feverEnd', () => Sfx.feverEnd());
    G.on('comboMs', (d) => { if (!blocked()) { UI.banner(`${d.n} COMBO!!`, `💎+${d.gems}`, 'combo'); } Sfx.milestone(); });
    G.on('milestone', (d) => { Sfx.milestone(); confetti(30); });
    G.on('prestige', () => { Sfx.prestige(); confetti(160); addFlash(0.6); });
    G.on('load', () => { palIdx = -1; falling.length = 0; growT = 0; });
  }

  // ------------------------------------------------------------- フレーム
  function frame(dt) {
    clock += dt;
    if (hitStop > 0) { hitStop -= dt; dt *= 0.15; }
    sclock += dt;
    shake = Math.max(0, shake - dt * 2.2);
    flash = Math.max(0, flash - dt * 2.4);
    treeShake = Math.max(0, treeShake - dt * 4);
    treeSquash = Math.max(0, treeSquash - dt * 5);
    axeT = Math.min(1, axeT + dt / 0.16);
    drawScene(dt);
    drawOverlay(dt);
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
    sceneCenter, notchPoint, axeIconSVG, biomeName, palette,
    get rect() { return rect; },
  };
})();
