'use strict';
// =====================================================================
//  axe3d.js — 斧の3Dモデル（Three.js r128）
//  ・普通の斧: 共通のシルエットに、レア度ごとの色・磨かれた刃先・光
//  ・幻想の斧（data.js の model 指定）: 1本ずつ専用の形と動き
//  ・斧は背景と別のパス（専用のスタジオ照明＋映り込み）で描くので、
//    どのバイオームでも色が濁らない。黒い輪郭で背景から浮かせる
//  ・ガチャのカードや図鑑の画像もこの3Dモデルから描き出す
//  座標は 64x64 の箱（SVG と同じく x 右・y 下）。握りは下端 (32,62)、
//  刃の当たり所は (56,18)。
// =====================================================================
const Axe3D = (() => {
  const T3 = window.THREE;
  let renderer = null, envTex = null;
  let thumbRT = null, thumbScene = null, thumbCam = null;
  const thumbs = new Map();
  const shared = {};
  let OUT_MAT = null;
  const OUTLINE = 1.15;
  const deg = (d) => (d * Math.PI) / 180;
  const col = (c) => new T3.Color(c);
  const RANKS = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5, EX: 6, MYTH: 7, GOD: 8, OMEGA: 9 };

  // 共通の斧の形（data.js の AXE_PATHS と同じ形を点列で持つ）
  const BLADE = [30, 11, 44, 9, 'c', 50, 3, 59, 5, 60, 17, 'c', 61, 29, 52, 35, 46, 30, 30, 25];
  const POLL = [30, 12, 24, 13, 24, 23, 30, 24];
  // 刃先の磨かれた帯（刃の外周に沿った三日月）
  const EDGE = [44, 9, 'c', 50, 3, 59, 5, 60, 17, 'c', 61, 29, 52, 35, 46, 30, 46.8, 26.3, 'c', 51.5, 28.6, 56.4, 25, 56.1, 17.4, 'c', 55.8, 9.6, 50.4, 7.4, 45.2, 12.4];

  // ------------------------------------------------------------- 形づくりの道具
  function shapeOf(pts) {
    const s = new T3.Shape();
    s.moveTo(pts[0], -pts[1]);
    for (let i = 2; i < pts.length; ) {
      if (pts[i] === 'c') { s.bezierCurveTo(pts[i + 1], -pts[i + 2], pts[i + 3], -pts[i + 4], pts[i + 5], -pts[i + 6]); i += 7; }
      else { s.lineTo(pts[i], -pts[i + 1]); i += 2; }
    }
    s.closePath();
    return s;
  }
  function mirrorPts(pts) {
    const out = [];
    for (let i = 0; i < pts.length; ) {
      if (pts[i] === 'c') { out.push('c', 64 - pts[i + 1], pts[i + 2], 64 - pts[i + 3], pts[i + 4], 64 - pts[i + 5], pts[i + 6]); i += 7; }
      else { out.push(64 - pts[i], pts[i + 1]); i += 2; }
    }
    return out;
  }
  function extrude(shape, depth, bevel = 0, curve = 10) {
    const g = new T3.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: 1, curveSegments: curve });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  // 頂点色のグラデーション: f(x, y, z) が 0 → c0、1 → c1
  function paint(g, c0, c1, f) {
    const p = g.attributes.position, a = col(c0), b = col(c1), t = new T3.Color();
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const k = Math.max(0, Math.min(1, f(p.getX(i), p.getY(i), p.getZ(i))));
      t.copy(a).lerp(b, k);
      arr[i * 3] = t.r; arr[i * 3 + 1] = t.g; arr[i * 3 + 2] = t.b;
    }
    g.setAttribute('color', new T3.BufferAttribute(arr, 3));
    return g;
  }
  // 輪郭用の外殻: 角度で重み付けした頂点法線の方向に膨らませる（角でも割れない）
  function hull(src, thick) {
    const g = src.index ? src.toNonIndexed() : src.clone();
    const p = g.attributes.position, n = p.count;
    const acc = new Map();
    const key = (i) => `${Math.round(p.getX(i) * 16)}|${Math.round(p.getY(i) * 16)}|${Math.round(p.getZ(i) * 16)}`;
    const V = [new T3.Vector3(), new T3.Vector3(), new T3.Vector3()];
    const e1 = new T3.Vector3(), e2 = new T3.Vector3(), fn = new T3.Vector3();
    for (let i = 0; i + 2 < n; i += 3) {
      for (let k = 0; k < 3; k++) V[k].fromBufferAttribute(p, i + k);
      e1.subVectors(V[1], V[0]);
      e2.subVectors(V[2], V[0]);
      fn.crossVectors(e1, e2);
      if (fn.lengthSq() < 1e-10) continue;
      fn.normalize();
      for (let k = 0; k < 3; k++) {
        e1.subVectors(V[(k + 1) % 3], V[k]);
        e2.subVectors(V[(k + 2) % 3], V[k]);
        const ang = e1.angleTo(e2);
        const kk = key(i + k);
        let s = acc.get(kk);
        if (!s) { s = [0, 0, 0]; acc.set(kk, s); }
        s[0] += fn.x * ang; s[1] += fn.y * ang; s[2] += fn.z * ang;
      }
    }
    for (let i = 0; i < n; i++) {
      const s = acc.get(key(i));
      if (!s) continue;
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      p.setXYZ(i, p.getX(i) + (s[0] / l) * thick, p.getY(i) + (s[1] / l) * thick, p.getZ(i) + (s[2] / l) * thick);
    }
    for (const a of ['normal', 'uv', 'color']) if (g.attributes[a]) g.deleteAttribute(a);
    return g;
  }

  // ------------------------------------------------------------- テクスチャ（使い回す）
  function canvasTex(key, size, draw) {
    if (shared[key]) return shared[key];
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new T3.CanvasTexture(c);
    shared[key] = t;
    return t;
  }
  const dotTex = () => canvasTex('dot', 64, (g) => {
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
  });
  const swirlTex = () => canvasTex('swirl', 256, (g) => {
    g.fillStyle = '#fff6fb';
    g.fillRect(0, 0, 256, 256);
    for (const [c, w, off] of [['#ff4fa8', 26, 0], ['#7fd8ff', 12, Math.PI]]) {
      g.strokeStyle = c;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      for (let t = 0; t <= Math.PI * 7; t += 0.05) {
        const r = (t / (Math.PI * 7)) * 124;
        const x = 128 + Math.cos(t + off) * r, y = 128 + Math.sin(t + off) * r;
        if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  });
  const galaxyTex = () => canvasTex('galaxy', 256, (g) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const core = g.createRadialGradient(128, 128, 0, 128, 128, 60);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.25, 'rgba(255,214,240,0.85)');
    core.addColorStop(1, 'rgba(120,60,200,0)');
    g.fillStyle = core;
    g.fillRect(0, 0, 256, 256);
    const cols = ['#ffffff', '#9fd0ff', '#ffb0e0', '#c8a0ff', '#fff0a0'];
    for (let arm = 0; arm < 3; arm++) {
      for (let k = 0; k < 700; k++) {
        const t = k / 700;
        const r = 10 + t * 112;
        const a = (arm * Math.PI * 2) / 3 + t * 4.4 + (rnd() - 0.5) * 0.5;
        const j = 4 + t * 12;
        g.globalAlpha = 0.35 + rnd() * 0.6;
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        const s = 0.8 + rnd() * 2;
        g.fillRect(128 + Math.cos(a) * r + (rnd() - 0.5) * j, 128 + Math.sin(a) * r + (rnd() - 0.5) * j, s, s);
      }
    }
    g.globalAlpha = 1;
  });
  const diskTex = () => canvasTex('disk', 256, (g) => {
    const rg = g.createRadialGradient(128, 128, 56, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.2, 'rgba(255,214,140,1)');
    rg.addColorStop(0.5, 'rgba(255,110,40,0.9)');
    rg.addColorStop(0.8, 'rgba(150,20,80,0.5)');
    rg.addColorStop(1, 'rgba(60,0,60,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 60; i++) {
      const r = 64 + rnd() * 56, a = rnd() * Math.PI * 2;
      g.strokeStyle = `rgba(255,${180 + Math.floor(rnd() * 70)},120,${0.15 + rnd() * 0.3})`;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      g.arc(128, 128, r, a, a + 0.4 + rnd() * 1.2);
      g.stroke();
    }
  });
  const glyphTex = () => canvasTex('glyph', 128, (g) => {
    g.font = 'italic 900 96px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 18;
    g.fillStyle = '#ffe6ff';
    g.fillText('i', 64, 70);
  });

  // ------------------------------------------------------------- 組み立ての文脈
  function ctx(def) {
    const grp = new T3.Group();
    const P = { grp, def, mats: [], geos: [], hulls: [], ticks: [], glows: [] };
    P.std = (o) => { const m = new T3.MeshStandardMaterial(Object.assign({ flatShading: true, roughness: 0.4, metalness: 0.2 }, o)); P.mats.push(m); return m; };
    P.basic = (o) => { const m = new T3.MeshBasicMaterial(o); P.mats.push(m); return m; };
    // outline: true = 黒い輪郭 / false = なし / '#rrggbb' = その色の輪郭
    P.add = (geo, mat, x = 0, y = 0, z = 0, outline = true, parent = grp) => {
      P.geos.push(geo);
      const m = new T3.Mesh(geo, mat);
      m.position.set(x, -y, z);
      parent.add(m);
      if (outline) { m.userData.outline = outline; P.hulls.push(m); }
      return m;
    };
    P.glow = (color, x, y, size, opacity = 0.55, z = -3, blending = T3.AdditiveBlending, parent = grp) => {
      const m = new T3.SpriteMaterial({ map: dotTex(), color, transparent: true, opacity, blending, depthWrite: false });
      P.mats.push(m);
      const s = new T3.Sprite(m);
      s.position.set(x, -y, z);
      s.scale.set(size, size, 1);
      s.userData.base = opacity;
      s.userData.size = size;
      parent.add(s);
      if (blending === T3.AdditiveBlending) P.glows.push(s);
      return s;
    };
    return P;
  }
  // 柄（共通）。rings: 金属の巻き、pommel: 柄頭、gem: 柄頭を宝石に
  function handle(P, color, o = {}) {
    P.add(new T3.CylinderGeometry(2.7, 3.1, 56, 10), P.std({ color, roughness: 0.72, metalness: o.metal || 0.05 }), 32, 36, 0);
    if (o.rings) {
      const rm = o.ringGlow ? P.basic({ color: o.rings }) : P.std({ color: o.rings, metalness: 0.9, roughness: 0.3 });
      for (const y of o.ringsAt || [47, 52.5, 58]) P.add(new T3.CylinderGeometry(3.4, 3.4, 1.9, 10), rm, 32, y, 0, false);
    }
    if (o.pommel) {
      const gem = !!o.gem;
      P.add(gem ? new T3.OctahedronGeometry(4.3, 0) : new T3.SphereGeometry(3.9, 12, 8),
        P.std({ color: o.pommel, metalness: gem ? 0.3 : 0.92, roughness: gem ? 0.12 : 0.25, emissive: gem ? o.pommel : '#000000', emissiveIntensity: gem ? 0.55 : 0 }), 32, 64, 0);
    }
  }
  const lighten = (c, k = 0.55) => col(c).lerp(col('#ffffff'), k);

  // ------------------------------------------------------------- 刀以外の武器（次元ポータル）: 剣・大剣・短剣・包丁・光剣・槍・大鎌・爪
  // 座標は刀と同じ（握りが x=32・y=52 あたり、刃は y の小さい方＝上へ伸びる）
  function formBlade(P, def, K) {
    const form = K.form;
    const rank = RANKS[def.r] || 0;
    const fx = form === 'saber' ? 'beam' : K.fx || '';
    const glowC = def.glow && def.glow !== 'rainbow' ? def.glow : form === 'saber' ? def.blade[0] : '#ffffff';
    const cEdge = col(K.hamon || def.blade[0]), cBody = col(def.blade[1]), cHi = col(def.blade[0]), tc = new T3.Color();
    const gold = rank >= 3 ? '#ffd45a' : '#c8a050';
    const metal = P.std({ color: rank >= 5 ? gold : '#8a8f9a', metalness: 0.9, roughness: 0.28, emissive: rank >= 6 ? glowC : '#000000', emissiveIntensity: rank >= 6 ? 0.25 : 0 });
    const shapeFrom = (pts) => { const sh = new T3.Shape(); sh.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], -pts[i][1]); sh.closePath(); return sh; };
    // 頂点色: k(x, y) が 1 に近いほど刃先の色
    const colorize = (g, kf) => {
      const p = g.attributes.position, arr = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = -p.getY(i);
        const k = Math.max(0, Math.min(1, kf(x, y)));
        tc.copy(cBody).lerp(cHi, 0.3).lerp(cEdge, k);
        arr[i * 3] = tc.r; arr[i * 3 + 1] = tc.g; arr[i * 3 + 2] = tc.b;
      }
      g.setAttribute('color', new T3.BufferAttribute(arr, 3));
      return g;
    };
    let bladeMat;
    if (fx === 'beam') bladeMat = P.basic({ color: glowC, transparent: true, opacity: 0.88, blending: T3.AdditiveBlending, depthWrite: false });
    else if (fx === 'void' || fx === 'galaxy') bladeMat = P.std({ color: '#ffffff', vertexColors: true, metalness: 0.6, roughness: 0.25, emissive: fx === 'void' ? '#3a0a5a' : '#1a2a6a', emissiveIntensity: 0.9 });
    else if (fx === 'crystal') bladeMat = P.std({ color: '#ffffff', vertexColors: true, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.88, emissive: glowC, emissiveIntensity: 0.35 });
    else bladeMat = P.std({ color: '#ffffff', vertexColors: true, metalness: 0.9, roughness: 0.16, emissive: glowC, emissiveIntensity: def.glow ? 0.12 : 0.05 });
    const len = K.len || 1;
    let L = 92 * len, cxf = () => 32, y0 = 37, tip = [32, 37 - L];
    // 左右対称の刃（剣・大剣・短剣）
    const straight = (Lb, w0, w1, taper, base) => {
      const N = 18, l = [], r = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = base - t * Lb, w = (w0 + (w1 - w0) * t) * (t < taper ? 1 : Math.max(0.02, 1 - (t - taper) / (1 - taper)));
        l.push([32 - w / 2, y]); r.push([32 + w / 2, y]);
      }
      const g = extrude(shapeFrom(l.concat(r.reverse())), Math.max(1.2, w0 * 0.2), 0.45, 4);
      colorize(g, (x, y) => { const t = (base - y) / Lb, w = (w0 + (w1 - w0) * t) / 2; const u = Math.abs(x - 32) / Math.max(0.5, w); return u > 0.62 ? (u - 0.62) / 0.3 : u < 0.14 && t < 0.75 ? -0.4 : 0; });
      return g;
    };
    const grip = (y1, y2, r, wrapC) => {
      const h = y2 - y1;
      P.add(new T3.CylinderGeometry(r, r * 1.08, h, 12), P.std({ color: def.handle, roughness: 0.8, metalness: 0.05 }), 32, (y1 + y2) / 2, 0);
      const wrap = P.std({ color: wrapC || lighten(def.handle, 0.35), roughness: 0.7 });
      for (let y = y1 + 2; y <= y2 - 1.5; y += 3.2) P.add(new T3.CylinderGeometry(r * 1.12, r * 1.12, 0.9, 12), wrap, 32, y, 0, false);
    };
    if (form === 'sword' || form === 'greatsword' || form === 'dagger') {
      const big = form === 'greatsword', small = form === 'dagger';
      L = 92 * len * (big ? 1.08 : small ? 0.55 : 0.95);
      const w0 = big ? 11 : small ? 5.8 : 6.4, w1 = big ? 8 : small ? 4.2 : 4.6;
      P.add(straight(L, w0, w1, big ? 0.9 : 0.84, 37), bladeMat, 0, 0, 0, fx !== 'beam');
      const gw = big ? 26 : small ? 11 : 18;
      P.add(new T3.BoxGeometry(gw, big ? 3.4 : 2.6, big ? 5 : 4), metal, 32, 38.8, 0);
      for (const sx of [-1, 1]) P.add(new T3.SphereGeometry(big ? 2.4 : 1.8, 10, 8), metal, 32 + sx * gw / 2, 38.8, 0, false);
      const gEnd = big ? 62 : small ? 53 : 57;
      grip(40.3, gEnd, big ? 2.6 : 2.2);
      if (small) { const tg = new T3.TorusGeometry(3, 0.9, 8, 18); P.add(tg, metal, 32, gEnd + 3.4, 0); }
      else P.add(rank >= 4 ? new T3.OctahedronGeometry(3.8, 0) : new T3.SphereGeometry(3.3, 12, 8), rank >= 4 ? P.std({ color: glowC, metalness: 0.3, roughness: 0.12, emissive: glowC, emissiveIntensity: 0.5 }) : metal, 32, gEnd + 2.6, 0);
      tip = [32, 37 - L];
    } else if (form === 'cleaver') {
      L = 92 * len * 0.72;
      const N = 18, sp = [], ed = [];
      for (let i = 0; i <= N; i++) { const t = i / N, y = 37 - t * L; sp.push([29.5, y]); ed.push([29.5 + 11.5 * (1 - Math.pow(t, 2.6)) + 0.3, y]); }
      const g = extrude(shapeFrom(sp.concat(ed.reverse())), 1.3, 0.4, 4);
      colorize(g, (x) => (x - 29.5) / 11.5 > 0.72 ? ((x - 29.5) / 11.5 - 0.72) / 0.25 : 0);
      P.add(g, bladeMat, 0, 0, 0, true);
      P.add(new T3.CylinderGeometry(2.9, 2.9, 3, 12), metal, 32, 38.6, 0);
      P.add(new T3.BoxGeometry(5.6, 20, 4.4), P.std({ color: def.handle, roughness: 0.85, metalness: 0.02 }), 32, 50.5, 0);
      for (const y of [44, 50.5, 57]) P.add(new T3.CylinderGeometry(1, 1, 4.8, 10), metal, 32, y, 0, false, undefined).rotation.x = Math.PI / 2;
      tip = [29.5, 37 - L];
    } else if (form === 'saber') {
      L = 92 * len * 1.02;
      const b = P.add(new T3.CylinderGeometry(1.7, 1.9, L, 14), bladeMat, 32, 37 - L / 2, 0, false);
      const core = new T3.Mesh(b.geometry, P.basic({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false }));
      core.scale.set(0.5, 1, 0.5);
      b.add(core);
      P.add(new T3.SphereGeometry(1.8, 12, 8), bladeMat, 32, 37 - L, 0, false);
      P.add(new T3.CylinderGeometry(3.1, 2.7, 3.4, 16), metal, 32, 38.6, 0);
      P.add(new T3.CylinderGeometry(2.4, 2.4, 20, 14), P.std({ color: '#3a3f4a', metalness: 0.85, roughness: 0.35 }), 32, 50.5, 0);
      for (const y of [44, 47, 50, 53]) P.add(new T3.CylinderGeometry(2.6, 2.6, 1, 14), metal, 32, y, 0, false);
      P.add(new T3.BoxGeometry(1.6, 2.4, 1.6), P.basic({ color: glowC }), 34.2, 43, 0, false);
      P.add(new T3.CylinderGeometry(2.7, 2.2, 2.4, 14), metal, 32, 61.6, 0);
      tip = [32, 37 - L];
    } else if (form === 'spear') {
      L = 92 * len * 1.15;
      const top = 37 - L * 0.72, Lt = L * 0.28;
      P.add(new T3.CylinderGeometry(1.6, 1.8, 66 - top, 10), P.std({ color: def.handle, roughness: 0.75, metalness: 0.05 }), 32, (66 + top) / 2, 0);
      const N = 16, l = [], r = [];
      for (let i = 0; i <= N; i++) { const t = i / N, y = top - t * Lt, w = 10 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.75) + 1.2 * (1 - t); l.push([32 - w / 2, y]); r.push([32 + w / 2, y]); }
      const g = extrude(shapeFrom(l.concat(r.reverse())), 1.6, 0.5, 4);
      colorize(g, (x, y) => { const t = (top - y) / Lt, w = 5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.75) + 0.6; return Math.abs(x - 32) / w > 0.6 ? (Math.abs(x - 32) / w - 0.6) / 0.35 : 0; });
      P.add(g, bladeMat, 0, 0, 0, fx !== 'beam');
      P.add(new T3.TorusGeometry(2.2, 0.9, 8, 16), metal, 32, top + 1, 0).rotation.x = Math.PI / 2;
      P.add(new T3.ConeGeometry(2.6, 6, 8), P.std({ color: '#e0283a', roughness: 0.8 }), 32, top + 5.5, 0, false);
      P.add(new T3.SphereGeometry(2.2, 10, 8), metal, 32, 66.5, 0);
      cxf = () => 32; y0 = top; tip = [32, top - Lt];
    } else if (form === 'scythe') {
      L = 92 * len * 1.08;
      const top = 37 - L * 0.86;
      P.add(new T3.CylinderGeometry(1.7, 1.9, 66 - top, 10), P.std({ color: def.handle, roughness: 0.75, metalness: 0.05 }), 32, (66 + top) / 2, 0);
      const Lb = L * 0.62, N = 20, outer = [], inner = [];
      for (let i = 0; i <= N; i++) {
        const s = i / N, cx = 32 + s * Lb, cy = top + 2 + s * s * Lb * 0.42 - s * Lb * 0.06, w = 11 * Math.pow(1 - s, 0.75) + 0.4;
        outer.push([cx, cy - w * 0.5]); inner.push([cx, cy + w * 0.5]);
      }
      const g = extrude(shapeFrom(outer.concat(inner.reverse())), 1.4, 0.45, 4);
      colorize(g, (x, y) => { const s = Math.max(0, Math.min(1, (x - 32) / Lb)), cy = top + 2 + s * s * Lb * 0.42 - s * Lb * 0.06, w = 11 * Math.pow(1 - s, 0.75) + 0.4; return (y - cy) / (w * 0.5) > 0.35 ? ((y - cy) / (w * 0.5) - 0.35) / 0.5 : 0; });
      P.add(g, bladeMat, 0, 0, 0, fx !== 'beam');
      P.add(new T3.CylinderGeometry(2.4, 2.4, 5, 12), metal, 32, top + 2, 0);
      P.add(new T3.ConeGeometry(2, 4.5, 8), metal, 32, top - 2.5, 0).rotation.z = Math.PI;
      for (const y of [48, 56]) P.add(new T3.CylinderGeometry(2.3, 2.3, 1.6, 10), metal, 32, y, 0, false);
      cxf = (t) => 32 + t * Lb; y0 = top; tip = [32 + Lb, top + Lb * 0.36];
      L = Math.max(L, (66 - top));
    } else if (form === 'claw') {
      L = 92 * len * 0.62;
      P.add(new T3.BoxGeometry(17, 5, 5), metal, 32, 41.5, 0);
      grip(44, 58, 2.3);
      for (const dx of [-5.5, 0, 5.5]) {
        const N = 14, l = [], r = [];
        for (let i = 0; i <= N; i++) { const t = i / N, y = 39 - t * L, x = 32 + dx - 5 * t * t + dx * 0.25 * t, w = 2.8 * (1 - t * 0.85); l.push([x - w / 2, y]); r.push([x + w / 2, y]); }
        const g = extrude(shapeFrom(l.concat(r.reverse())), 1.1, 0.35, 4);
        colorize(g, () => 0.25);
        P.add(g, bladeMat, 0, 0, 0, fx !== 'beam');
      }
      cxf = (t) => 32 - 5 * t * t; y0 = 39; tip = [27, 39 - L];
    }
    // 光・炎・星・虹（刀と同じ演出）
    const along = (t) => [cxf(t), y0 - (y0 - tip[1]) * t];
    if (def.glow) for (let i = 0; i < 3; i++) { const [x, y] = along(0.3 + i * 0.25); P.glow(glowC, x + 1, y, 30 + rank * 3, 0.32); }
    if (fx === 'flame') {
      const fl = [];
      for (let i = 0; i < 7; i++) { const [x, y] = along(0.1 + i * 0.12); fl.push(P.glow(i % 2 ? '#ffb02e' : '#ff5a1f', x + 2, y, 14, 0.7, 2)); }
      P.ticks.push((t) => fl.forEach((f, i) => { const k = 0.7 + 0.5 * Math.sin(t * 13 + i * 1.7); f.scale.set(14 * k, 20 * k, 1); f.material.opacity = 0.45 + 0.3 * k; }));
    }
    if (fx === 'void' || fx === 'galaxy') {
      const st2 = [];
      for (let i = 0; i < 9; i++) { const [x, y] = along(0.08 + i * 0.1); st2.push(P.glow(i % 3 ? '#ffffff' : glowC, x + (Math.random() - 0.5) * 3, y, 5, 0.9, 2)); }
      P.ticks.push((t) => st2.forEach((f, i) => { f.material.opacity = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i * 1.3)); }));
    }
    if (fx === 'rainbow' || def.glow === 'rainbow') {
      const c2 = new T3.Color();
      P.ticks.push((t) => { if (bladeMat.emissive) { bladeMat.emissive.copy(c2.setHSL((t * 0.25) % 1, 1, 0.5)); bladeMat.emissiveIntensity = 0.45; } else bladeMat.color.setHSL((t * 0.25) % 1, 1, 0.6); });
    }
    if (fx === 'beam') { const [x, y] = along(0.5); P.glow(glowC, x, y, 70, 0.45); }
    P.blade = { L: Math.max(L, 52 - tip[1] - 16), tip };
  }

  // ------------------------------------------------------------- 普通の斧
  function classic(P, def) {
    const rank = RANKS[def.r] || 0;
    const rainbow = def.glow === 'rainbow';
    const glowC = rainbow ? '#ff66cc' : def.glow || null;
    const bm = P.std({ color: '#ffffff', vertexColors: true, metalness: 0.6, roughness: 0.42, envMapIntensity: 0.85, emissive: glowC || def.blade[1], emissiveIntensity: glowC ? 0.26 : 0.05 });
    // 刃: 柄側は暗く、刃先へ向かって明るく
    const grad = (x) => (Math.abs(x - 32) - 3) / 27;
    const blade = (pts) => P.add(paint(extrude(shapeOf(pts), 4, 1.2), def.blade[1], def.blade[0], grad), bm);
    blade(BLADE);
    if (def.double) blade(mirrorPts(BLADE));
    else P.add(paint(extrude(shapeOf(POLL), 4.6, 1), def.blade[1], def.blade[1], () => 0), bm);
    // 磨かれた刃先（光る斧は刃先が発光）
    const em = P.std({ color: lighten(def.blade[0], 0.6), metalness: 0.9, roughness: 0.22, emissive: glowC || '#000000', emissiveIntensity: glowC ? 0.85 : 0 });
    P.add(extrude(shapeOf(EDGE), 4.4, 1.3), em, 0, 0, 0, false);
    if (def.double) P.add(extrude(shapeOf(mirrorPts(EDGE)), 4.4, 1.3), em, 0, 0, 0, false);
    handle(P, def.handle, rank >= 2 ? { rings: rank >= 3 ? '#ffd45a' : '#cfd8e3', pommel: rank >= 3 ? (rank >= 5 ? '#ffffff' : glowC || '#ffd45a') : null, gem: rank >= 4 } : {});
    if (glowC) P.glow(glowC, 46, 18, 50, 0.5);
    if (def.double && glowC) P.glow(glowC, 18, 18, 46, 0.45);
    P.bladeMat = bm;
    if (rainbow) {
      const c = new T3.Color();
      P.ticks.push((t) => {
        c.setHSL((t * 0.4) % 1, 1, 0.55);
        bm.emissive.copy(c);
        em.emissive.copy(c);
        for (const s of P.glows) s.material.color.copy(c);
      });
    }
  }

  // ------------------------------------------------------------- 幻想の斧
  // 羽根の扇（天翼・不死鳥）
  function feathers(P, cols, emissive, ei, flames) {
    const base = [34, 20];
    const ang = [80, 57, 35, 13, -9, -30], len = [16, 22, 26, 27, 22, 16];
    const fs = [];
    const fm = P.std({ color: '#ffffff', vertexColors: true, roughness: 0.5, metalness: 0.15, emissive, emissiveIntensity: ei });
    ang.forEach((a, i) => {
      const L = len[i], W = 4.4 + L * 0.08;
      const s = new T3.Shape();
      s.moveTo(0, 0);
      s.bezierCurveTo(L * 0.3, W, L * 0.75, W * 0.95, L, 0.4);
      s.bezierCurveTo(L * 0.78, -W * 0.45, L * 0.3, -W * 0.55, 0, 0);
      const g = paint(extrude(s, 1.1, 0.45, 8), cols[0], cols[1], (x) => x / L);
      const m = P.add(g, fm, base[0], base[1], (i - 2.5) * 0.55);
      m.rotation.z = deg(a);
      m.userData.a = deg(a);
      fs.push(m);
      if (flames) {
        const tip = P.glow(i % 2 ? '#ffd060' : '#ff7a2a', base[0] + Math.cos(deg(a)) * L, base[1] - Math.sin(deg(a)) * L, 14, 0.75, 2);
        tip.userData.flame = true;
      }
    });
    P.ticks.push((t, dt, act) => {
      fs.forEach((m, i) => { m.rotation.z = m.userData.a + Math.sin(t * 3 + i * 0.5) * 0.05 * (1 + act * 1.5); });
      if (flames) for (const s of P.glows) if (s.userData.flame) { const k = 0.75 + Math.random() * 0.5; s.scale.set(s.userData.size * k, s.userData.size * k * 1.2, 1); }
    });
  }

  const MODELS = {
    // 冷凍マグロ: 凍った本マグロを斧として振り回す
    tuna(P) {
      const fish = new T3.Group();
      fish.position.set(41, -35, 0);
      fish.rotation.z = -0.48;
      P.grp.add(fish);
      const body = new T3.SphereGeometry(1, 22, 14);
      body.scale(8.5, 25, 7);
      paint(body, '#16264a', '#e4ecf5', (x) => (x + 3.5) / 9);
      P.add(body, P.std({ vertexColors: true, metalness: 0.6, roughness: 0.28, emissive: '#7fc8ff', emissiveIntensity: 0.1, flatShading: false }), 0, 0, 0, true, fish);
      const fin = P.std({ color: '#23365e', metalness: 0.6, roughness: 0.35 });
      P.add(extrude(shapeOf([0, 21, -10, 33, 'c', -5, 31, -2, 29, 0, 27.5, 'c', 2, 29, 5, 31, 10, 33]), 1.6, 0.5), fin, 0, 0, 0, true, fish);
      P.add(extrude(shapeOf([-7.6, -5, -14, 2, -8, 7]), 1.4, 0.4), fin, 0, 0, 0, true, fish);
      P.add(extrude(shapeOf([7.4, 4, 12.5, 10.5, 6.6, 11]), 1.2, 0.4), P.std({ color: '#f2d44a', metalness: 0.5, roughness: 0.35 }), 0, 0, 0, true, fish);
      P.add(extrude(shapeOf([1.5, -9, 8, -3, 2.5, -4]), 0.8, 0.3), fin, 0, 0, 5.9, true, fish);
      P.add(new T3.SphereGeometry(2.3, 12, 8), P.std({ color: '#ffffff', roughness: 0.2 }), 2.4, -18, 4.3, false, fish);
      P.add(new T3.SphereGeometry(1.25, 10, 6), P.basic({ color: '#05060a' }), 2.8, -18.3, 5.9, false, fish);
      P.glow('#bfe8ff', 46, 20, 40, 0.28);
    },
    // ペロペロキャンディ斧: 回るうず巻き
    candy(P) {
      P.add(new T3.CylinderGeometry(1.9, 1.9, 44, 10), P.std({ color: '#fffaf2', roughness: 0.45 }), 32, 41, 0);
      const disc = new T3.Group();
      disc.position.set(44, -17, 0);
      P.grp.add(disc);
      const g = new T3.CylinderGeometry(15, 15, 5, 40, 1);
      g.rotateX(Math.PI / 2);
      const face = P.std({ map: swirlTex(), roughness: 0.22, metalness: 0.05, emissive: '#ffc0e0', emissiveIntensity: 0.15, flatShading: false });
      P.add(g, [P.std({ color: '#ff5fae', roughness: 0.3 }), face, face], 0, 0, 0, true, disc);
      const bow = P.std({ color: '#ff3d8b', roughness: 0.4 });
      for (const s of [-1, 1]) {
        const c = P.add(new T3.ConeGeometry(3.2, 7, 6), bow, 32 + s * 4, 33, 1.5, true);
        c.rotation.z = (-s * Math.PI) / 2;
      }
      P.add(new T3.SphereGeometry(2.1, 10, 6), bow, 32, 33, 1.8, false);
      P.ticks.push((t, dt, act) => { disc.rotation.z -= dt * (1.2 + act * 6); });
    },
    // ドット斧: 斧の形を方眼で塗ったボクセル
    pixel(P) {
      const cs = 3.2, N = 20;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      const c2 = cv.getContext('2d');
      const pb = new Path2D(D.AXE_PATHS.blade), pp = new Path2D(D.AXE_PATHS.poll), ph = new Path2D(D.AXE_PATHS.handle);
      const grid = [];
      for (let gy = 0; gy < N; gy++) {
        for (let gx = 0; gx < N; gx++) {
          const x = (gx + 0.5) * cs, y = (gy + 0.5) * cs;
          grid.push(c2.isPointInPath(pb, x, y) || c2.isPointInPath(pp, x, y) ? 'b' : c2.isPointInPath(ph, x, y) ? 'h' : '');
        }
      }
      const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? '' : grid[y * N + x]);
      const tpl = new T3.BoxGeometry(cs, cs, 5).toNonIndexed();
      const tp = tpl.attributes.position.array, tn = tpl.attributes.normal.array, nv = tp.length / 3;
      const cells = [];
      for (let gy = 0; gy < N; gy++) {
        for (let gx = 0; gx < N; gx++) {
          const v = at(gx, gy);
          if (v) cells.push([gx, gy, v]);
          else if (at(gx - 1, gy) || at(gx + 1, gy) || at(gx, gy - 1) || at(gx, gy + 1)) cells.push([gx, gy, 'o']);
        }
      }
      const pos = new Float32Array(cells.length * nv * 3), nor = new Float32Array(cells.length * nv * 3), cl = new Float32Array(cells.length * nv * 3);
      const cc = new T3.Color();
      cells.forEach(([gx, gy, v], ci) => {
        const x = (gx + 0.5) * cs, y = -(gy + 0.5) * cs;
        if (v === 'o') cc.set('#1b1530');
        else if (v === 'h') cc.set(gy % 2 ? '#7c4a1e' : '#b0702e');
        else cc.set(x > 52 ? '#ffffff' : x > 45 ? '#d2dcea' : x > 37 ? '#9aa8be' : '#6c7890');
        for (let k = 0; k < nv; k++) {
          const o = (ci * nv + k) * 3;
          pos[o] = tp[k * 3] + x; pos[o + 1] = tp[k * 3 + 1] + y; pos[o + 2] = tp[k * 3 + 2];
          nor[o] = tn[k * 3]; nor[o + 1] = tn[k * 3 + 1]; nor[o + 2] = tn[k * 3 + 2];
          cl[o] = cc.r; cl[o + 1] = cc.g; cl[o + 2] = cc.b;
        }
      });
      tpl.dispose();
      const g = new T3.BufferGeometry();
      g.setAttribute('position', new T3.BufferAttribute(pos, 3));
      g.setAttribute('normal', new T3.BufferAttribute(nor, 3));
      g.setAttribute('color', new T3.BufferAttribute(cl, 3));
      P.add(g, P.std({ vertexColors: true, roughness: 0.55, metalness: 0.1, emissive: '#ffffff', emissiveIntensity: 0.08 }), 0, 0, 0, false);
    },
    // ビームアックス: 光の刃
    beam(P, def) {
      P.add(new T3.CylinderGeometry(3, 3.3, 40, 12), P.std({ color: '#2b3140', metalness: 0.92, roughness: 0.26 }), 32, 43, 0);
      P.add(new T3.BoxGeometry(9, 9, 8), P.std({ color: '#3a4252', metalness: 0.9, roughness: 0.22 }), 32, 18, 0);
      for (const y of [27, 33]) {
        const r = P.add(new T3.TorusGeometry(3.7, 0.7, 6, 16), P.basic({ color: '#7ff6ff' }), 32, y, 0, false);
        r.rotation.x = Math.PI / 2;
      }
      const layer = (k, depth, mat, outline = false) => {
        const g = extrude(shapeOf(BLADE), depth, 0);
        g.translate(-46, 18, 0); g.scale(k, k, 1); g.translate(46, -18, 0);
        return P.add(g, mat, 0, 0, 0, outline);
      };
      const rb = def.glow === 'rainbow';
      const bc = def.glow && !rb && def.id !== 'x_beam' ? def.glow : '#4ff0ff';
      const outer = P.basic({ color: rb ? '#ff6ad5' : bc === '#4ff0ff' ? '#18c8ff' : bc, transparent: true, opacity: 0.45, blending: T3.AdditiveBlending, depthWrite: false });
      const mid = P.basic({ color: bc, transparent: true, opacity: 0.85, blending: T3.AdditiveBlending, depthWrite: false });
      if (rb) P.ticks.push((t) => { mid.color.setHSL((t * 0.3) % 1, 1, 0.6); outer.color.setHSL((t * 0.3 + 0.15) % 1, 1, 0.55); });
      layer(1.16, 1.2, outer);
      layer(1.0, 1.8, mid, '#00313f');
      layer(0.74, 2.4, P.basic({ color: '#f4ffff' }));
      P.glow('#3ae0ff', 46, 18, 56, 0.6);
      P.ticks.push((t) => { const f = 0.85 + Math.sin(t * 47) * 0.06 + Math.random() * 0.08; mid.opacity = f; outer.opacity = 0.35 + f * 0.15; });
    },
    // 桜吹雪の斧: 五枚の花びら
    sakura(P) {
      const pm = P.std({ color: '#ffffff', vertexColors: true, roughness: 0.45, metalness: 0.08, emissive: '#ff9ac8', emissiveIntensity: 0.22 });
      const ps = [];
      [-64, -32, 0, 32, 64].forEach((a, i) => {
        const s = new T3.Shape();
        s.moveTo(0, 0);
        s.bezierCurveTo(5, 6, 12, 6.8, 17, 2.4);
        s.lineTo(14.8, 0);
        s.lineTo(17, -2.4);
        s.bezierCurveTo(12, -6.8, 5, -6, 0, 0);
        const m = P.add(paint(extrude(s, 1.2, 0.5, 8), '#fff0f7', '#ff6aae', (x) => x / 17), pm, 37, 18, (i - 2) * 0.55);
        m.rotation.z = deg(a);
        m.userData.a = deg(a);
        ps.push(m);
      });
      P.add(new T3.SphereGeometry(3.6, 12, 8), P.std({ color: '#ffd24a', metalness: 0.85, roughness: 0.25 }), 37, 18, 1.8, false);
      handle(P, '#2a1018', { rings: '#e8c060', pommel: '#e8c060' });
      P.glow('#ff9ad0', 46, 18, 48, 0.4);
      P.ticks.push((t, dt, act) => ps.forEach((m, i) => { m.rotation.z = m.userData.a + Math.sin(t * 2.2 + i) * 0.045 * (1 + act); }));
    },
    // 三日月斧ルナ
    crescent(P) {
      const s = new T3.Shape();
      s.absarc(42, -18, 19, deg(95), deg(-95), true);
      s.absarc(36, -18, 15, deg(-75), deg(75), false);
      s.closePath();
      const g = paint(extrude(s, 4, 1.2, 24), '#7f9ce0', '#ffffff', (x, y) => (Math.hypot(x - 36, y + 18) - 13) / 8);
      P.add(g, P.std({ color: '#ffffff', vertexColors: true, metalness: 0.8, roughness: 0.18, emissive: '#8fb8ff', emissiveIntensity: 0.3 }));
      P.add(new T3.BoxGeometry(8, 4, 4), P.std({ color: '#c8d4ff', metalness: 0.9, roughness: 0.25 }), 35, 18, 0);
      const star = P.add(new T3.OctahedronGeometry(3.4, 0), P.std({ color: '#fff3a0', emissive: '#ffd84a', emissiveIntensity: 0.8, roughness: 0.2 }), 31, 18, 2.2);
      handle(P, '#1a2348', { rings: '#dfe8ff', pommel: '#dfe8ff' });
      P.glow('#a8c8ff', 50, 18, 54, 0.55);
      P.ticks.push((t) => { star.rotation.y = t * 2; star.rotation.z = t * 0.7; });
    },
    // 水晶斧クリスタリア: 結晶の扇
    crystal(P) {
      const cm = P.std({ color: '#a8f6ff', metalness: 0.25, roughness: 0.05, emissive: '#2ac8ff', emissiveIntensity: 0.32 });
      [[-50, 15, 4.2], [-25, 20, 5], [0, 25, 5.8], [25, 20, 5], [50, 15, 4.2]].forEach(([a, L, W], i) => {
        const g = new T3.OctahedronGeometry(1, 0);
        g.scale(L / 2, W / 2, 1.9);
        g.translate(L / 2, 0, 0);
        g.rotateZ(deg(a));
        P.add(g, cm, 32, 18, (i % 2) * 0.8);
      });
      P.add(new T3.BoxGeometry(6, 7, 6), P.std({ color: '#dfe8f4', metalness: 0.9, roughness: 0.2 }), 31, 18, 0);
      handle(P, '#c8d4e4', { metal: 0.8, rings: '#7fe8ff', pommel: '#7fe8ff', gem: true });
      P.glow('#7fe8ff', 46, 18, 52, 0.5);
      P.ticks.push((t) => { cm.emissiveIntensity = 0.28 + 0.12 * Math.sin(t * 4); });
    },
    // 歯車斧クロックワーク: 回る歯車
    gear(P) {
      const gearShape = (R, r, teeth, hole, wins) => {
        const s = new T3.Shape();
        const st = (Math.PI * 2) / teeth;
        for (let j = 0; j < teeth; j++) {
          const a = j * st;
          const pts = [[r, a], [R, a + st * 0.22], [R, a + st * 0.48], [r, a + st * 0.7]];
          pts.forEach(([rr, aa], k) => { const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr; if (!j && !k) s.moveTo(x, y); else s.lineTo(x, y); });
        }
        s.closePath();
        const h = new T3.Path();
        h.absarc(0, 0, hole, 0, Math.PI * 2, true);
        s.holes.push(h);
        for (let k = 0; k < wins; k++) {
          const w = new T3.Path();
          const a = (k / wins) * Math.PI * 2;
          w.absarc(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, r * 0.2, 0, Math.PI * 2, true);
          s.holes.push(w);
        }
        return s;
      };
      const big = P.add(extrude(gearShape(16.5, 13, 12, 3.5, 5), 4, 0.8, 16), P.std({ color: '#e0aa48', metalness: 0.95, roughness: 0.28 }), 45, 18, 0);
      const small = P.add(extrude(gearShape(8.4, 6.4, 8, 1.8, 0), 3, 0.6, 12), P.std({ color: '#cfd6e0', metalness: 0.95, roughness: 0.25 }), 29, 9, -2.6);
      const hub = P.add(new T3.CylinderGeometry(3.4, 3.4, 7, 12), P.std({ color: '#5a3a1a', metalness: 0.6, roughness: 0.4 }), 45, 18, 0, false);
      hub.rotation.x = Math.PI / 2;
      handle(P, '#4a2c18', { rings: '#e0aa48', pommel: '#e0aa48' });
      P.glow('#ffd27a', 45, 18, 44, 0.3);
      P.ticks.push((t, dt, act) => {
        const w = dt * (0.6 + act * 5);
        big.rotation.z -= w;
        small.rotation.z += w * (16.5 / 8.4);
      });
    },
    // 天翼斧セラフィム
    wing(P, def) {
      feathers(P, def.pal || ['#fffaf0', '#ffd977'], def.pal ? def.pal[1] : '#fff6d0', 0.28, false);
      const halo = P.add(new T3.TorusGeometry(6.5, 0.9, 8, 28), P.basic({ color: '#ffe680' }), 32, 1, 0, false);
      halo.rotation.x = 1.2;
      handle(P, '#f6f1e6', { rings: '#f0c84a', pommel: '#f0c84a' });
      P.glow('#fff2b0', 44, 16, 60, 0.5);
      P.ticks.push((t) => { halo.position.y = -1 + Math.sin(t * 2.2) * 0.9; halo.rotation.z = t * 0.8; });
    },
    // 不死鳥斧フェニクス: 燃える羽根
    phoenix(P, def) {
      feathers(P, def.pal || ['#fff2a0', '#ff3a12'], def.pal ? def.pal[1] : '#ff6a1a', 0.55, true);
      handle(P, '#d8a640', { metal: 0.7, rings: '#ff4a1a', pommel: '#ff2a3a', gem: true });
      P.glow('#ff7a2a', 44, 16, 64, 0.55);
    },
    // 銀河斧ギャラクシア: 宇宙を切り取った円盤
    galaxy(P) {
      const disc = new T3.Group();
      disc.position.set(45, -18, 0);
      P.grp.add(disc);
      const plate = new T3.CylinderGeometry(19.5, 19.5, 2.2, 48);
      plate.rotateX(Math.PI / 2);
      P.add(plate, P.std({ color: '#0b0620', roughness: 0.3, metalness: 0.4 }), 0, 0, 0, true, disc);
      const spiral = P.add(new T3.CircleGeometry(18.6, 48), P.basic({ map: galaxyTex(), transparent: true, blending: T3.AdditiveBlending, depthWrite: false }), 0, 0, 1.25, false, disc);
      const rim = P.add(new T3.TorusGeometry(19.4, 0.75, 6, 48), P.basic({ color: '#c99aff' }), 0, 0, 0, false, disc);
      handle(P, '#1c1442', { rings: '#b39aff', pommel: '#ffd84a', gem: true });
      P.glow('#9a7aff', 45, 18, 62, 0.5);
      P.ticks.push((t, dt, act) => { spiral.rotation.z -= dt * (0.5 + act * 2.5); rim.material.color.setHSL(0.72 + Math.sin(t * 2) * 0.06, 1, 0.75); });
    },
    // 雷霆斧ケラウノス: 稲妻の刃と放電
    bolt(P) {
      const bm = P.std({ color: '#fff7b8', metalness: 0.3, roughness: 0.3, emissive: '#ffd23a', emissiveIntensity: 0.75 });
      P.add(extrude(shapeOf([38, 3, 60, 6, 50, 15, 63, 17, 41, 35, 48, 22, 36, 22, 44, 13]), 4, 1, 4), bm);
      P.add(new T3.BoxGeometry(7, 11, 6), P.std({ color: '#d8a640', metalness: 0.9, roughness: 0.3 }), 34, 15, 0);
      handle(P, '#2a2a3a', { rings: '#ffd23a', pommel: '#ffd23a' });
      P.glow('#ffe14a', 50, 18, 56, 0.55);
      const lm = new T3.LineBasicMaterial({ color: '#cfeaff', transparent: true, blending: T3.AdditiveBlending, depthWrite: false });
      P.mats.push(lm);
      const arcs = [];
      for (let i = 0; i < 3; i++) {
        const g = new T3.BufferGeometry();
        g.setAttribute('position', new T3.BufferAttribute(new Float32Array(8 * 3), 3));
        P.geos.push(g);
        const l = new T3.Line(g, lm);
        P.grp.add(l);
        arcs.push(l);
      }
      let next = 0;
      P.ticks.push((t) => {
        if (t < next) return;
        next = t + 0.05 + Math.random() * 0.05;
        for (const l of arcs) {
          const a = l.geometry.attributes.position;
          let x = 40 + Math.random() * 20, y = -(5 + Math.random() * 26);
          const dx = (Math.random() - 0.3) * 4, dy = (Math.random() - 0.5) * 4;
          for (let k = 0; k < 8; k++) { a.setXYZ(k, x, y, 3.2); x += dx + (Math.random() - 0.5) * 3; y += dy + (Math.random() - 0.5) * 3; }
          a.needsUpdate = true;
          l.visible = Math.random() < 0.8;
        }
      });
    },
    // 焔竜斧ヴォルカ: 口を開けた竜の頭
    dragon(P, def) {
      const pc = def.pal || ['#4a0610', '#d0341c'];
      const head = paint(extrude(shapeOf([30, 9, 38, 4, 49, 6, 58, 10, 63, 13.5, 58, 15.5, 47, 17, 58, 19.5, 61, 22.5, 52, 27, 41, 28.5, 31, 25]), 7, 1.5, 6), pc[0], pc[1], (x) => (x - 30) / 32);
      P.add(head, P.std({ color: '#ffffff', vertexColors: true, metalness: 0.55, roughness: 0.35, emissive: '#ff2a00', emissiveIntensity: 0.1 }));
      const tooth = P.std({ color: '#fff6e0', roughness: 0.4 });
      for (let i = 0; i < 4; i++) {
        const u = P.add(new T3.ConeGeometry(0.9, 2.8, 5), tooth, 50 + i * 2.6, 16.6 - i * 0.25, 2.2, false);
        u.rotation.z = Math.PI;
        P.add(new T3.ConeGeometry(0.9, 2.6, 5), tooth, 50 + i * 2.6, 18.6 + i * 0.4, 2.2, false);
      }
      const horn = P.std({ color: '#ece0c4', roughness: 0.5 });
      for (const z of [-2.6, 2.6]) { const h = P.add(new T3.ConeGeometry(1.9, 12, 6), horn, 33, 2, z); h.rotation.z = 0.95; }
      P.add(new T3.SphereGeometry(1.7, 10, 6), P.basic({ color: '#ffdd33' }), 49, 9.5, 4.6, false);
      P.add(new T3.BoxGeometry(0.6, 2.6, 0.6), P.basic({ color: '#120000' }), 49.2, 9.5, 6.3, false);
      handle(P, '#1a0808', { rings: '#ff3a1a', pommel: '#ff2a2a', gem: true });
      const fire = P.glow('#ff7a1a', 57, 17.5, 26, 0.9, 3);
      P.glow('#ff3a1a', 46, 16, 58, 0.45);
      P.ticks.push(() => { const k = 0.8 + Math.random() * 0.5; fire.scale.set(26 * k, 22 * k, 1); fire.material.opacity = 0.7 + Math.random() * 0.3; });
    },
    // 黒穴斧ホライゾン: 事象の地平線と降着円盤
    blackhole(P) {
      P.glow('#14041f', 46, 18, 74, 0.9, -6, T3.NormalBlending);
      P.add(new T3.SphereGeometry(8.5, 24, 16), P.basic({ color: '#000000' }), 46, 18, 0, false);
      P.add(new T3.TorusGeometry(9.3, 0.7, 8, 40), P.basic({ color: '#ffe2b0' }), 46, 18, 0, false);
      const tilt = new T3.Group();
      tilt.position.set(46, -18, 0);
      tilt.rotation.x = -1.12;
      P.grp.add(tilt);
      const dm = P.basic({ map: diskTex(), transparent: true, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide });
      const disk = P.add(new T3.RingGeometry(10, 23.5, 48, 1), dm, 0, 0, 0, false, tilt);
      const disk2 = P.add(new T3.RingGeometry(9.5, 27, 40, 1), P.basic({ map: diskTex(), transparent: true, opacity: 0.35, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide }), 0, 0, 0, false, tilt);
      handle(P, '#0d0816', { rings: '#b06aff', ringGlow: true, pommel: '#2a0a4a', gem: true });
      P.glow('#ff9a4a', 46, 18, 50, 0.35);
      P.ticks.push((t, dt, act) => { disk.rotation.z -= dt * (1.4 + act * 4); disk2.rotation.z -= dt * (0.9 + act * 2); });
    },
    // 創世斧ジェネシス: 光の刃と周回する小さな刃、二重の光輪
    genesis(P, def) {
      classic(P, Object.assign({}, def, { blade: ['#ffffff', '#ffd76a'], handle: '#ffffff', glow: 'rainbow', double: true, r: 'LR' }));
      const orbit = new T3.Group();
      orbit.position.set(40, -16, 0);
      orbit.rotation.x = 1.05;
      P.grp.add(orbit);
      const om = P.std({ color: '#ffffff', metalness: 0.6, roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.6 });
      for (let i = 0; i < 3; i++) {
        const g = extrude(shapeOf(BLADE), 3, 0.8);
        g.translate(-46, 18, 0); g.scale(0.34, 0.34, 0.34);
        const a = (i / 3) * Math.PI * 2;
        const m = P.add(g, om, Math.cos(a) * 24, -Math.sin(a) * 24, 0, true, orbit);
        m.rotation.z = a;
      }
      const r1 = P.add(new T3.TorusGeometry(25, 0.6, 6, 64), P.basic({ color: '#ffe680' }), 40, 16, 0, false);
      const r2 = P.add(new T3.TorusGeometry(21, 0.45, 6, 64), P.basic({ color: '#ff80e0' }), 40, 16, 0, false);
      r1.rotation.x = 1.2;
      r2.rotation.set(0.4, 0.9, 0);
      P.glow('#ffffff', 40, 16, 70, 0.4);
      P.ticks.push((t, dt, act) => {
        orbit.rotation.z += dt * (1.1 + act * 3);
        r1.rotation.z += dt * 0.7;
        r2.rotation.y += dt * 0.9;
        r2.material.color.setHSL((t * 0.3) % 1, 1, 0.7);
        om.emissive.setHSL((t * 0.4 + 0.5) % 1, 1, 0.6);
      });
    },
    // 恋の斧: ふくらんだハートが鼓動する
    heart(P, def) {
      const s = new T3.Shape();
      s.moveTo(0, -13);
      s.bezierCurveTo(-4, -9, -16, -3, -15, 5);
      s.bezierCurveTo(-14, 13, -4, 14, 0, 8);
      s.bezierCurveTo(4, 14, 14, 13, 15, 5);
      s.bezierCurveTo(16, -3, 4, -9, 0, -13);
      const g = paint(extrude(s, 5, 1.8, 14), def.blade[1], def.blade[0], (x, y) => (y + 13) / 26);
      const h = P.add(g, P.std({ color: '#ffffff', vertexColors: true, metalness: 0.2, roughness: 0.18, emissive: def.blade[1], emissiveIntensity: 0.25 }), 45, 18, 0);
      h.rotation.z = -Math.PI / 2;
      handle(P, def.handle, { rings: '#ff6ab0', pommel: '#ff3d8b', gem: true });
      P.glow(def.glow, 46, 18, 50, 0.45);
      P.ticks.push((t) => { const b = Math.pow(Math.max(0, Math.sin(t * 5)), 12); h.scale.setScalar(1 + 0.09 * b); });
    },
    // 雪華斧: 六方向に枝を伸ばす雪の結晶
    snowflake(P, def) {
      const g = new T3.Group();
      g.position.set(45, -18, 0);
      P.grp.add(g);
      const m = P.std({ color: '#f2fbff', metalness: 0.3, roughness: 0.1, emissive: def.blade[1], emissiveIntensity: 0.35 });
      for (let i = 0; i < 6; i++) {
        const arm = new T3.Group();
        arm.rotation.z = (i * Math.PI) / 3;
        g.add(arm);
        P.add(new T3.BoxGeometry(17, 2.6, 2.4), m, 8.5, 0, 0, true, arm);
        for (const [d, L] of [[7, 6], [12, 4.5]]) {
          for (const sg of [-1, 1]) {
            const b = P.add(new T3.BoxGeometry(L, 1.8, 2), m, d + L * 0.35, -sg * L * 0.35, 0, true, arm);
            b.rotation.z = sg * 0.8;
          }
        }
      }
      const hub = new T3.CylinderGeometry(4.2, 4.2, 3.2, 6);
      hub.rotateX(Math.PI / 2);
      P.add(hub, P.std({ color: '#bfe8ff', metalness: 0.4, roughness: 0.1, emissive: '#7fd8ff', emissiveIntensity: 0.5 }), 0, 0, 0, true, g);
      handle(P, def.handle, { metal: 0.6, rings: '#ffffff', pommel: '#bfe8ff', gem: true });
      P.glow(def.glow, 45, 18, 54, 0.5);
      P.ticks.push((t, dt, act) => { g.rotation.z -= dt * (0.35 + act * 3); });
    },
    // 太陽斧: 光を放つ円盤と回る光線
    sun(P, def) {
      const g = new T3.Group();
      g.position.set(46, -18, 0);
      P.grp.add(g);
      const disc = new T3.CylinderGeometry(9, 9, 4, 28);
      disc.rotateX(Math.PI / 2);
      const dm = P.std({ color: def.blade[0], metalness: 0.4, roughness: 0.3, emissive: def.blade[1], emissiveIntensity: 0.8 });
      P.add(disc, dm, 0, 0, 0, true, g);
      const rm = P.std({ color: def.blade[0], metalness: 0.6, roughness: 0.3, emissive: def.blade[1], emissiveIntensity: 0.6 });
      const rays = new T3.Group();
      g.add(rays);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const c = P.add(new T3.ConeGeometry(2.4, i % 2 ? 6 : 9, 4), rm, Math.cos(a) * (i % 2 ? 12 : 13.5), -Math.sin(a) * (i % 2 ? 12 : 13.5), 0, true, rays);
        c.rotation.z = a - Math.PI / 2;
      }
      handle(P, def.handle, { rings: '#ffd45a', pommel: def.blade[1], gem: true });
      P.glow(def.glow, 46, 18, 70, 0.6);
      P.ticks.push((t, dt, act) => { rays.rotation.z -= dt * (0.5 + act * 3); dm.emissiveIntensity = 0.7 + 0.2 * Math.sin(t * 4); });
    },
    // 海神斧: 横向きの三叉の刃
    trident(P, def) {
      const pm = P.std({ color: def.blade[0], metalness: 0.85, roughness: 0.2, emissive: def.blade[1], emissiveIntensity: 0.25 });
      const gm = P.std({ color: '#ffd45a', metalness: 0.95, roughness: 0.25 });
      P.add(new T3.BoxGeometry(3.6, 24, 3.6), gm, 38, 18, 0);
      P.add(new T3.BoxGeometry(6, 4, 4), gm, 35, 18, 0);
      for (const [y, L] of [[8, 18], [18, 22], [28, 18]]) {
        P.add(new T3.BoxGeometry(L, 2.6, 2.6), pm, 39 + L / 2, y, 0);
        const tip = P.add(new T3.ConeGeometry(2.3, 6, 4), pm, 40 + L + 2.5, y, 0);
        tip.rotation.z = -Math.PI / 2;
      }
      P.add(new T3.SphereGeometry(2.6, 12, 8), P.std({ color: '#ffffff', emissive: def.glow, emissiveIntensity: 0.8, roughness: 0.1 }), 38, 18, 2.4, false);
      handle(P, def.handle, { rings: '#ffd45a', pommel: def.glow, gem: true });
      P.glow(def.glow, 50, 18, 56, 0.45);
    },
    // 土星斧: 縞模様の惑星と傾いた輪、まわる小さな月
    saturn(P, def) {
      const g = new T3.Group();
      g.position.set(46, -18, 0);
      P.grp.add(g);
      const pl = paint(new T3.SphereGeometry(10, 26, 18), def.blade[1], def.blade[0], (x, y) => 0.5 + 0.5 * Math.sin(y * 0.9));
      const planet = P.add(pl, P.std({ color: '#ffffff', vertexColors: true, roughness: 0.6, metalness: 0.1, flatShading: false }), 0, 0, 0, true, g);
      const tilt = new T3.Group();
      tilt.rotation.set(-1.2, 0.35, 0);
      g.add(tilt);
      P.add(new T3.RingGeometry(12.5, 19.5, 56, 1), P.std({ color: def.blade[0], side: T3.DoubleSide, roughness: 0.5, metalness: 0.3, emissive: def.glow, emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }), 0, 0, 0, false, tilt);
      P.add(new T3.RingGeometry(20.5, 22, 56, 1), P.basic({ color: def.glow, side: T3.DoubleSide, transparent: true, opacity: 0.5, blending: T3.AdditiveBlending, depthWrite: false }), 0, 0, 0, false, tilt);
      const moon = P.add(new T3.SphereGeometry(2.2, 12, 8), P.std({ color: '#e8e8f0', roughness: 0.8 }), 24, 0, 0, true, g);
      handle(P, def.handle, { rings: '#ffd27a', pommel: '#ffd27a' });
      P.glow(def.glow, 46, 18, 60, 0.4);
      P.ticks.push((t, dt, act) => {
        planet.rotation.y += dt * (0.8 + act * 2);
        moon.position.set(Math.cos(t * 1.4) * 24, Math.sin(t * 1.4) * 7, Math.sin(t * 1.4) * 10);
      });
    },
    // 斬鉄斧: 柄から反りのある刀身が伸びる
    katana(P, def) {
      const g = paint(extrude(shapeOf([33, 13, 'c', 44, 12.5, 55, 10.5, 63, 6, 'c', 60, 10.5, 52, 15.5, 33, 19]), 1.8, 0.6, 16), def.blade[1], def.blade[0], (x, y) => (-y - 12.5) / 5.5);
      P.add(g, P.std({ color: '#ffffff', vertexColors: true, metalness: 0.9, roughness: 0.12, emissive: '#cfe8ff', emissiveIntensity: 0.12 }));
      const ts = new T3.CylinderGeometry(5.5, 5.5, 1.8, 8);
      ts.rotateZ(Math.PI / 2);
      P.add(ts, P.std({ color: '#2a2a2a', metalness: 0.8, roughness: 0.3 }), 32.5, 16, 0);
      P.add(new T3.BoxGeometry(3, 6, 3.4), P.std({ color: '#ffd45a', metalness: 0.95, roughness: 0.2 }), 35, 16, 0);
      handle(P, def.handle, { rings: '#e8e8f0', ringsAt: [44, 48, 52, 56, 60], pommel: '#ffd45a' });
      P.glow(def.glow, 50, 12, 46, 0.4);
    },
    // 刀（菌斬り次元）: 柄・鍔・はばき・反りのある刀身。刃文は頂点色、特殊な刀身は def.k.fx
    blade(P, def) {
      const K = def.k || {};
      if (K.form && K.form !== 'katana') { formBlade(P, def, K); return; }
      const rank = RANKS[def.r] || 0;
      const L = 92 * (K.len || 1), curve = K.curve == null ? 1 : K.curve;
      const wood = !!K.wood, fx = K.fx || '';
      const N = 22;
      const cx = (t) => 32 - curve * 7 * t * t;
      const wd = (t) => 3.5 - 0.9 * t;
      const spine = [], edge = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, y = 36 - t * L;
        spine.push([cx(t) - wd(t) / 2, y]);
        // 切っ先: 刃の側が丸く峰へ回り込む
        const k = t < 0.86 ? 1 : Math.cos(((t - 0.86) / 0.14) * (Math.PI / 2));
        edge.push([cx(t) - wd(t) / 2 + wd(t) * Math.max(0.05, k), y]);
      }
      const bladeShape = (pts) => { const sh = new T3.Shape(); sh.moveTo(pts[0][0], -pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], -pts[i][1]); sh.closePath(); return sh; };
      const outline = spine.concat(edge.slice().reverse());
      const mkBlade = () => {
        const g = extrude(bladeShape(outline), wood ? 2.2 : 1.1, wood ? 0.6 : 0.45, 4);
        // 刃文: 刃先側は明るく、波打つ境目から地の色
        const p = g.attributes.position, arr = new Float32Array(p.count * 3);
        const cEdge = col(K.hamon || def.blade[0]), cBody = col(def.blade[1]), cHi = col(def.blade[0]), tc = new T3.Color();
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = -p.getY(i);
          const t = Math.max(0, Math.min(1, (36 - y) / L));
          const left = cx(t) - wd(t) / 2;
          const u = (x - left) / wd(t); // 0 = 峰 1 = 刃
          const line = 0.58 - 0.1 * Math.sin(t * 38) * (wood ? 0 : 1);
          const k = wood ? 0.5 + u * 0.4 : u > line ? 1 : u > line - 0.12 ? (u - line + 0.12) / 0.12 : 0;
          tc.copy(cBody).lerp(cHi, 0.25 + 0.25 * (1 - t)).lerp(cEdge, k);
          arr[i * 3] = tc.r; arr[i * 3 + 1] = tc.g; arr[i * 3 + 2] = tc.b;
        }
        g.setAttribute('color', new T3.BufferAttribute(arr, 3));
        return g;
      };
      const glowC = def.glow && def.glow !== 'rainbow' ? def.glow : '#ffffff';
      let bladeMat;
      if (fx === 'beam') bladeMat = P.basic({ color: glowC, transparent: true, opacity: 0.85, blending: T3.AdditiveBlending, depthWrite: false });
      else if (fx === 'void' || fx === 'galaxy') bladeMat = P.std({ color: '#ffffff', vertexColors: true, metalness: 0.6, roughness: 0.25, emissive: fx === 'void' ? '#3a0a5a' : '#1a2a6a', emissiveIntensity: 0.9 });
      else if (fx === 'crystal') bladeMat = P.std({ color: '#ffffff', vertexColors: true, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.88, emissive: glowC, emissiveIntensity: 0.35 });
      else bladeMat = P.std({ color: '#ffffff', vertexColors: true, flatShading: false, metalness: wood ? 0 : 0.92, roughness: wood ? 0.75 : 0.14, emissive: glowC, emissiveIntensity: def.glow ? 0.12 : 0.05 });
      const blades = [];
      const addBlade = (rot) => {
        const holder = new T3.Group();
        holder.position.set(32, -37, 0);
        holder.rotation.z = rot;
        P.grp.add(holder);
        const inner = new T3.Group();
        inner.position.set(-32, 37, 0);
        holder.add(inner);
        const m = P.add(mkBlade(), bladeMat, 0, 0, 0, fx === 'beam' ? false : true, inner);
        blades.push(m);
        if (fx === 'beam') {
          // 光る芯
          const core = new T3.Mesh(m.geometry, P.basic({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
          core.scale.set(0.55, 1, 0.5);
          core.position.x = 14.5;
          m.add(core);
        }
        return holder;
      };
      if (K.twin) { addBlade(0.2); addBlade(-0.2); } else addBlade(0);
      // はばき・鍔・柄
      const gold = rank >= 3 ? '#ffd45a' : '#c8a050';
      P.add(new T3.BoxGeometry(3.6, 3.2, 3.2), P.std({ color: gold, metalness: 0.95, roughness: 0.2 }), 32, 37.6, 0, false);
      const tsubaCol = rank >= 5 ? gold : rank >= 3 ? '#3a3040' : '#2a2a2a';
      const tsubaMat = P.std({ color: tsubaCol, metalness: 0.85, roughness: 0.3, emissive: rank >= 6 ? glowC : '#000000', emissiveIntensity: rank >= 6 ? 0.3 : 0 });
      const ts = K.tsuba || 'round';
      const star = (n, r1, r2) => { const sh = new T3.Shape(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? r2 : r1; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } sh.closePath(); return sh; };
      const flower = (n, r) => { const sh = new T3.Shape(); for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI * 2, rr = r * (0.78 + 0.22 * Math.abs(Math.cos((a * n) / 2))); if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } return sh; };
      let tg = null;
      if (ts === 'round') tg = new T3.CylinderGeometry(6.4, 6.4, 1.6, 28);
      else if (ts === 'square') { tg = new T3.BoxGeometry(11, 1.6, 9.5); }
      else if (ts === 'ring') { tg = new T3.TorusGeometry(5.4, 1.2, 8, 28); tg.rotateX(Math.PI / 2); }
      else if (ts === 'flower' || ts === 'star' || ts === 'gear') {
        const sh = ts === 'flower' ? flower(5, 7) : ts === 'star' ? star(5, 7.4, 3.6) : star(12, 6.8, 5.6);
        tg = new T3.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false, curveSegments: 4 });
        tg.translate(0, 0, -0.8);
        tg.rotateX(Math.PI / 2);
      }
      if (tg) P.add(tg, tsubaMat, 32, 39.8, 0);
      P.add(new T3.CylinderGeometry(2.3, 2.5, 22, 12), P.std({ color: def.handle, roughness: 0.8, metalness: 0.05 }), 32, 51.5, 0);
      const wrap = P.std({ color: lighten(def.handle, 0.35), roughness: 0.7 });
      for (let y = 43; y <= 60; y += 3.4) {
        const d = new T3.OctahedronGeometry(1.6, 0);
        d.scale(1, 1.2, 1.9);
        P.add(d, wrap, 32, y, 0, false);
      }
      P.add(new T3.CylinderGeometry(2.7, 2.6, 2.2, 12), P.std({ color: gold, metalness: 0.9, roughness: 0.25 }), 32, 63.4, 0);
      // 光・炎・星
      const tipY = 36 - L * 0.55;
      if (def.glow) for (let i = 0; i < 3; i++) P.glow(glowC, cx(0.3 + i * 0.25) + 1, 36 - L * (0.3 + i * 0.25), 30 + rank * 3, 0.32);
      if (fx === 'flame') {
        const fl = [];
        for (let i = 0; i < 7; i++) fl.push(P.glow(i % 2 ? '#ffb02e' : '#ff5a1f', cx(i / 7) + 2, 36 - L * (0.1 + i * 0.12), 14, 0.7, 2));
        P.ticks.push((t) => fl.forEach((f, i) => { const k = 0.7 + 0.5 * Math.sin(t * 13 + i * 1.7); f.scale.set(14 * k, 20 * k, 1); f.material.opacity = 0.45 + 0.3 * k; }));
      }
      if (fx === 'void' || fx === 'galaxy') {
        const st2 = [];
        for (let i = 0; i < 9; i++) st2.push(P.glow(i % 3 ? '#ffffff' : glowC, cx(i / 9) + (Math.random() - 0.5) * 3, 36 - L * (0.08 + i * 0.1), 5, 0.9, 2));
        P.ticks.push((t) => st2.forEach((f, i) => { f.material.opacity = 0.3 + 0.7 * Math.abs(Math.sin(t * 3 + i * 1.3)); }));
      }
      if (fx === 'rainbow') {
        const c2 = new T3.Color();
        P.ticks.push((t) => { if (bladeMat.emissive) { bladeMat.emissive.copy(c2.setHSL((t * 0.25) % 1, 1, 0.5)); bladeMat.emissiveIntensity = 0.45; } });
      }
      if (fx === 'beam') P.glow(glowC, cx(0.5), tipY, 70, 0.45);
      P.blade = { L, tip: [cx(1), 36 - L] };
    },
    // 虚数斧イマジナリ: 現実に存在しないホログラム。ときどきバグる
    imaginary(P) {
      const holo = (c) => {
        const m = new T3.ShaderMaterial({
          uniforms: { uT: { value: 0 }, uCol: { value: col(c) } },
          vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix * normal); vY = position.y; gl_Position = projectionMatrix * mv; }',
          fragmentShader: 'uniform float uT; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6); float s = 0.55 + 0.45 * step(0.45, fract(vY * 0.42 - uT * 1.7)); gl_FragColor = vec4(uCol * (0.35 + f * 1.4) * s, 1.0); }',
          transparent: true, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide,
        });
        P.mats.push(m);
        return m;
      };
      const geoms = () => {
        const a = extrude(shapeOf(BLADE), 4, 1.2), b = extrude(shapeOf(mirrorPts(BLADE)), 4, 1.2);
        const h = new T3.CylinderGeometry(2.7, 3.1, 56, 8);
        h.translate(32, -36, 0);
        return [a, b, h];
      };
      const dark = P.basic({ color: '#0a0014', transparent: true, opacity: 0.8 });
      const layers = [];
      const mk = (mat, ox, outline = false) => { const g = new T3.Group(); g.position.x = ox; P.grp.add(g); for (const geo of geoms()) P.add(geo, mat, 0, 0, 0, outline, g); layers.push(g); return g; };
      mk(dark, 0, '#2a0040');
      const mats = [holo('#5ff4ff'), holo('#ff3a6a'), holo('#3a6aff')];
      mk(mats[0], 0);
      const red = mk(mats[1], -0.9), blue = mk(mats[2], 0.9);
      const glyph = new T3.Sprite(new T3.SpriteMaterial({ map: glyphTex(), transparent: true, blending: T3.AdditiveBlending, depthWrite: false }));
      P.mats.push(glyph.material);
      glyph.scale.set(14, 14, 1);
      P.grp.add(glyph);
      P.glow('#ff4fd8', 32, 16, 64, 0.35);
      let glitch = 0, next = 0.8;
      P.ticks.push((t, dt) => {
        for (const m of mats) m.uniforms.uT.value = t;
        glyph.position.set(28 + Math.sin(t * 1.3) * 2, 6 + Math.sin(t * 2.1) * 2, 4);
        if (t > next) { glitch = 0.08 + Math.random() * 0.1; next = t + 0.4 + Math.random() * 1.6; }
        glitch = Math.max(0, glitch - dt);
        const j = glitch > 0 ? 2.6 : 0.9;
        red.position.x = -j + (glitch > 0 ? (Math.random() - 0.5) * 3 : 0);
        blue.position.x = j + (glitch > 0 ? (Math.random() - 0.5) * 3 : 0);
        red.position.y = glitch > 0 ? (Math.random() - 0.5) * 2 : 0;
        layers[1].scale.y = glitch > 0 ? 1 + (Math.random() - 0.5) * 0.08 : 1;
      });
    },
  };

  // ------------------------------------------------------------- 組み立て
  function outlineMat(c) {
    if (c === true) return OUT_MAT;
    return new T3.MeshBasicMaterial({ color: c, side: T3.BackSide });
  }
  function aura(P, def, rank) {
    const rainbow = def.glow === 'rainbow' || rank >= 9;
    const col = def.glow && def.glow !== 'rainbow' ? def.glow : '#ffffff';
    const grp = new T3.Group();
    grp.position.set(44, -18, 0);
    P.grp.add(grp);
    const rings = [];
    const n = rank >= 9 ? 3 : rank >= 8 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const m = P.basic({ color: col, transparent: true, opacity: 0.8, blending: T3.AdditiveBlending, depthWrite: false });
      const r = P.add(new T3.TorusGeometry(25 + i * 4, 0.55, 6, 64), m, 0, 0, 0, false, grp);
      r.rotation.set(1.15 + i * 0.45, i * 0.8, 0);
      rings.push(r);
    }
    const sparks = [];
    for (let i = 0; i < (rank >= 9 ? 14 : rank >= 8 ? 11 : 8); i++) {
      const sp = P.glow(col, (i / 2 - 3) * 6, 0, 7, 0.95, 4, T3.AdditiveBlending, grp);
      sp.userData.ph = i / 7;
      sp.userData.x = Math.sin(i * 2.4) * 22;
      sparks.push(sp);
    }
    let pillar = null;
    if (rank >= 8) {
      pillar = P.glow(col, 0, 0, 1, 0.5, -5, T3.AdditiveBlending, grp);
      pillar.scale.set(16, 110, 1);
    }
    const c = new T3.Color();
    P.ticks.push((t) => {
      rings.forEach((r, i) => { r.rotation.z = t * (0.6 + i * 0.3) * (i % 2 ? -1 : 1); });
      for (const sp of sparks) {
        const ph = (t * 0.35 + sp.userData.ph) % 1;
        sp.position.set(sp.userData.x * (1 - ph * 0.3), -24 + ph * 52, 4);
        sp.material.opacity = Math.sin(ph * Math.PI) * 0.95;
      }
      if (pillar) pillar.material.opacity = 0.35 + 0.15 * Math.sin(t * 3);
      if (rainbow) {
        rings.forEach((r, i) => r.material.color.setHSL((t * 0.25 + i * 0.2) % 1, 1, 0.65));
        sparks.forEach((sp, i) => sp.material.color.setHSL((t * 0.3 + i * 0.07) % 1, 1, 0.7));
        if (pillar) pillar.material.color.copy(c.setHSL((t * 0.2) % 1, 1, 0.7));
      }
    });
  }
  function build(def) {
    if (!OUT_MAT) OUT_MAT = new T3.MeshBasicMaterial({ color: '#150c07', side: T3.BackSide });
    const P = ctx(def);
    const fn = (def.model && MODELS[def.model]) || classic;
    fn(P, def);
    const rank = RANKS[def.r] || 0;
    if (rank >= 7) aura(P, def, rank);
    for (const m of P.hulls) {
      const mat = outlineMat(m.userData.outline);
      if (mat !== OUT_MAT) P.mats.push(mat);
      const om = new T3.Mesh(hull(m.geometry, OUTLINE), mat);
      om.userData.outlineMesh = true;
      P.geos.push(om.geometry);
      m.add(om);
    }
    P.tick = (t, dt, act) => { for (const f of P.ticks) f(t, dt, act || 0); };
    P.dispose = () => { P.geos.forEach((g) => g.dispose()); P.mats.forEach((m) => m.dispose()); };
    return P;
  }

  // ------------------------------------------------------------- 照明と映り込み
  // 斧専用のスタジオ照明: どのバイオームでも同じ色で見える
  function studio(sc, k = 1) {
    sc.add(new T3.HemisphereLight(0xffffff, 0x4c4652, 0.62 * k));
    const key = new T3.DirectionalLight(0xfff1dc, 1.0 * k);
    key.position.set(4, 7, 8);
    sc.add(key);
    const rim = new T3.DirectionalLight(0xbcd8ff, 0.9 * k);
    rim.position.set(-7, 3, -5);
    sc.add(rim);
    if (envTex) sc.environment = envTex;
    return { key, rim };
  }
  // 金属が映す周りの景色（上が明るく下が暗いスタジオ＋ソフトボックス）
  function makeEnv() {
    const es = new T3.Scene();
    const sg = new T3.SphereGeometry(20, 24, 12);
    const top = col('#fdfbff'), mid = col('#8a93a6'), bot = col('#2a2420'), t = new T3.Color();
    const p = sg.attributes.position, arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 20;
      if (y > 0) t.copy(mid).lerp(top, Math.pow(y, 0.7)); else t.copy(mid).lerp(bot, Math.pow(-y, 0.6));
      arr[i * 3] = t.r; arr[i * 3 + 1] = t.g; arr[i * 3 + 2] = t.b;
    }
    sg.setAttribute('color', new T3.BufferAttribute(arr, 3));
    es.add(new T3.Mesh(sg, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.BackSide })));
    const panel = (w, h, x, y, z, c) => {
      const m = new T3.Mesh(new T3.PlaneGeometry(w, h), new T3.MeshBasicMaterial({ color: c, side: T3.DoubleSide }));
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      es.add(m);
    };
    panel(18, 7, 0, 6, 15, '#ffffff');
    panel(14, 4, 0, 0.5, 16, '#c9d1dd');
    panel(6, 15, -15, 3, 5, '#ffe6c8');
    panel(5, 12, 15, 2, -8, '#cfe2ff');
    panel(24, 3, 0, 16, 0, '#ffffff');
    const pm = new T3.PMREMGenerator(renderer);
    const rt = pm.fromScene(es, 0.035);
    pm.dispose();
    es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt.texture;
  }
  function init(r) {
    renderer = r;
    try { envTex = makeEnv(); } catch (e) { console.warn('映り込みを作れない', e); envTex = null; }
    return !!envTex;
  }

  // ------------------------------------------------------------- カード・図鑑用の画像
  function ensureThumb() {
    if (thumbScene) return;
    thumbScene = new T3.Scene();
    studio(thumbScene, 0.85);
    thumbCam = new T3.PerspectiveCamera(22, 1, 0.1, 100);
  }
  // 3Dモデルを斜めに構えた絵にして返す（{ url, canvas }）。WebGL が無ければ null。
  // opts（{ env, rot }）を渡すと映り込みの強さや向きを変えた試し描き（キャッシュしない）
  const THUMB_ROT = [-0.2, -0.3, -0.62];
  const KATANA_ROT = [-0.12, -0.35, -0.8];
  function thumb(def, px = 224, opts) {
    if (!renderer || !def) return null;
    const hit = !opts && thumbs.get(def.id);
    if (hit) return hit;
    let P = null;
    try {
      ensureThumb();
      const SS = px * 2;
      if (!thumbRT) thumbRT = new T3.WebGLRenderTarget(SS, SS);
      P = build(def);
      P.tick(0.3, 0, 0); // 虹色の斧は金色寄りの色で止める
      // 斜めに構えると正面の照明を強く拾って白飛びするので、映り込みを弱める
      const envK = opts && opts.env != null ? opts.env : 0.85;
      for (const m of P.mats) if (m.isMeshStandardMaterial) m.envMapIntensity = (m.envMapIntensity == null ? 1 : m.envMapIntensity) * envK;
      const rot = (opts && opts.rot) || (def.kind === 'katana' ? KATANA_ROT : THUMB_ROT);
      const holder = new T3.Group();
      P.grp.position.set(-32, 34, 0);
      holder.add(P.grp);
      holder.scale.setScalar(1 / 40);
      holder.rotation.set(rot[0], rot[1], rot[2]);
      thumbScene.add(holder);
      holder.updateMatrixWorld(true);
      const box = new T3.Box3(), tb = new T3.Box3();
      holder.traverse((o) => {
        if (!o.isMesh || o.userData.outlineMesh) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(tb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
      });
      const c = box.getCenter(new T3.Vector3()), sz = box.getSize(new T3.Vector3());
      const fit = Math.max(sz.x, sz.y) * 1.14;
      const dist = fit / 2 / Math.tan((thumbCam.fov * Math.PI) / 360) + sz.z / 2;
      thumbCam.position.set(c.x, c.y, c.z + dist);
      thumbCam.lookAt(c);
      thumbCam.updateProjectionMatrix();
      const prevCol = renderer.getClearColor(new T3.Color()), prevA = renderer.getClearAlpha();
      renderer.setRenderTarget(thumbRT);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(thumbScene, thumbCam);
      const buf = new Uint8Array(SS * SS * 4);
      renderer.readRenderTargetPixels(thumbRT, 0, 0, SS, SS, buf);
      renderer.setRenderTarget(null);
      renderer.setClearColor(prevCol, prevA);
      thumbScene.remove(holder);
      P.dispose();
      P = null;
      // 上下反転＋加算合成の光を不透明度に直す
      const big = document.createElement('canvas');
      big.width = big.height = SS;
      const bg = big.getContext('2d');
      const img = bg.createImageData(SS, SS);
      for (let y = 0; y < SS; y++) img.data.set(buf.subarray((SS - 1 - y) * SS * 4, (SS - y) * SS * 4), y * SS * 4);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const m = Math.max(d[i], d[i + 1], d[i + 2]); if (d[i + 3] < m) d[i + 3] = m; }
      bg.putImageData(img, 0, 0);
      const out = document.createElement('canvas');
      out.width = out.height = px;
      const og = out.getContext('2d');
      og.imageSmoothingEnabled = true;
      og.imageSmoothingQuality = 'high';
      const gc = def.glow === 'rainbow' ? '#ff9ae6' : def.glow;
      if (gc) { og.shadowColor = gc; og.shadowBlur = px * 0.07; }
      og.drawImage(big, 0, 0, px, px);
      const res = { url: out.toDataURL('image/png'), canvas: out };
      if (!opts) {
        thumbs.set(def.id, res);
        if (thumbs.size > 260) thumbs.delete(thumbs.keys().next().value);
      }
      return res;
    } catch (e) {
      console.warn('斧の画像を作れない', e);
      if (P) P.dispose();
      renderer.setRenderTarget(null);
      return null;
    }
  }
  // 起動後に少しずつ画像を作っておく（1回に1本）
  let warmList = null;
  function warmStep() {
    if (!renderer) return false;
    if (!warmList) {
      const S = typeof G !== 'undefined' ? G.S : null;
      const hi = (a) => (RANKS[a.r] || 0) >= 3;
      warmList = D.AXES.filter((a) => hi(a) && S && S.axes[a.id]).concat(typeof GD !== 'undefined' && S && S.germ ? GD.KATANAS.filter((k) => hi(k) && S.germ.kat && S.germ.kat[k.id]) : []).slice(0, 120);
    }
    while (warmList.length) {
      const a = warmList.shift();
      if (!thumbs.has(a.id)) { thumb(a); return true; }
    }
    return false;
  }

  return {
    get ok() { return !!renderer; },
    get env() { return envTex; },
    init, build, studio, thumb, warmStep,
    cached: (id) => thumbs.get(id) || null,
  };
})();
