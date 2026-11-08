'use strict';
// =====================================================================
//  micro.js — 菌斬り次元の3Dシーン（Three.js r128）
//  ・顕微鏡をのぞいたような液体の世界に、顔のある菌がただよう
//  ・斬られた菌はクリッピング平面で2つに割れ、断面（中身の色）を見せて飛び散る
//  ・刀は指に追従（専用の照明で上から描く）。免疫細胞は画面の端から飛んできて菌を食べる
//  カメラは正面からまっすぐ見るので、画面の座標と z=0 の平面がそのまま対応する
//  （当たり判定は Input が画面の座標で行う）。
// =====================================================================
const Micro = (() => {
  const T3 = window.THREE;
  let ok = false, R = null, scene = null, camera = null, kScene = null;
  let W = 1, H = 1, ppu = 40, camZ = 20, visW = 10, visH = 10;
  let time = 0, allowShake = true, quality = 2;
  let bgU = null, hemi = null, key = null, rim = null, kLights = null;
  let biomeIdx = -1, pal = null;
  const geos = new Map(), objs = new Map(), halves = [], dashes = [];
  let drops = null;
  const DP = [];
  let amb = null, ambKey = '';
  const AMB = [];
  let kat = null, katId = '';
  const hold = { on: false, x: 0, y: 0, ang: 1.9, tx: 0, ty: 0, px: 0, py: 0, spd: 0, flourish: 0, swing: 0 };
  const cam = { shake: 0, punch: 0, roll: 0, kick: 0 };
  let v1, v2, v3, q1, cTmp, cWhite, cGold;
  let glowT = null;
  let lightBoost = 0, lightCol = null, outMix = 0, bossMix = 0;
  const rnd = Math.random;
  const col = (c) => new T3.Color(c);

  // ------------------------------------------------------------- 準備
  function init(renderer) {
    if (!T3 || !renderer || typeof GM === 'undefined') return false;
    R = renderer;
    R.localClippingEnabled = true;
    v1 = new T3.Vector3(); v2 = new T3.Vector3(); v3 = new T3.Vector3(); q1 = new T3.Quaternion();
    cTmp = new T3.Color(); cWhite = new T3.Color(1, 1, 1); cGold = new T3.Color('#ffb400'); lightCol = new T3.Color();
    scene = new T3.Scene();
    camera = new T3.PerspectiveCamera(40, 1, 0.1, 400);
    hemi = new T3.HemisphereLight(0xffffff, 0x302040, 0.85);
    scene.add(hemi);
    key = new T3.DirectionalLight(0xffffff, 0.95);
    key.position.set(-4, 7, 10);
    scene.add(key);
    rim = new T3.DirectionalLight(0xffffff, 0.9);
    rim.position.set(2, -3, -9);
    scene.add(rim);
    if (typeof Axe3D !== 'undefined' && Axe3D.env) scene.environment = null; // 映り込みは材質ごとに入れる
    bgU = { top: { value: new T3.Color('#4a0614') }, bot: { value: new T3.Color('#b0203a') }, hi: { value: new T3.Color('#ffc8c8') }, t: { value: 0 }, swirl: { value: 0 } };
    const bg = new T3.Mesh(new T3.SphereGeometry(160, 32, 16), new T3.ShaderMaterial({
      uniforms: bgU, side: T3.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 bot; uniform vec3 hi; uniform float t; uniform float swirl; varying vec3 vP;',
        'void main(){',
        '  vec2 p = vP.xy;',
        '  float a = atan(p.y, p.x) + swirl * (1.0 - length(p) * 2.0); float r = length(p);',
        '  vec2 q = vec2(cos(a), sin(a)) * r * 9.0 + vec2(t * 0.05, t * 0.03);',
        '  float h = clamp(vP.y * 1.6 + 0.5, 0.0, 1.0);',
        '  vec3 c = mix(bot, top, h);',
        '  float n = sin(q.x * 1.7 + sin(q.y * 1.3 + t * 0.4)) * sin(q.y * 1.9 + sin(q.x * 1.1 - t * 0.3));',
        '  float n2 = sin(q.x * 3.1 - t * 0.2 + sin(q.y * 2.3)) * sin(q.y * 2.7 + t * 0.25);',
        '  c += hi * (smoothstep(0.55, 1.0, n) * 0.16 + smoothstep(0.75, 1.0, n2) * 0.1);',
        '  c *= 1.0 - smoothstep(0.18, 0.42, r) * 0.35;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}',
      ].join('\n'),
    }));
    scene.add(bg);
    scene.fog = new T3.Fog(0x200008, 30, 60);
    // しずく（InstancedMesh）
    const dg = new T3.SphereGeometry(1, 8, 6);
    const dm = new T3.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05 });
    if (typeof Axe3D !== 'undefined' && Axe3D.env) { dm.envMap = Axe3D.env; dm.envMapIntensity = 0.6; }
    drops = new T3.InstancedMesh(dg, dm, 380);
    drops.instanceMatrix.setUsage(T3.DynamicDrawUsage);
    // 色のバッファは最大数ぶん先に作る（count=0 のあとで作ると長さ0になる）
    drops.instanceColor = new T3.InstancedBufferAttribute(new Float32Array(380 * 3).fill(1), 3);
    drops.instanceColor.setUsage(T3.DynamicDrawUsage);
    drops.count = 0;
    drops.frustumCulled = false;
    scene.add(drops);
    // 刀は別のシーン（専用の照明）
    kScene = new T3.Scene();
    if (typeof Axe3D !== 'undefined') kLights = Axe3D.studio(kScene);
    ok = true;
    resize();
    return true;
  }
  function setQuality(s) { quality = s.fx; allowShake = s.shake !== false; }
  function resize() {
    if (!ok) return;
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    camera.aspect = W / H;
    if (W <= H) { visW = 10; visH = (10 * H) / W; } else { visH = 10; visW = (10 * W) / H; }
    camZ = visH / 2 / Math.tan((camera.fov * Math.PI) / 360);
    ppu = H / visH;
    camera.updateProjectionMatrix();
    if (scene.fog) { scene.fog.near = camZ + 4; scene.fog.far = camZ + 34; }
    // 菌が泳ぐ範囲（上のHUD・下のドック・左右のボタンを避ける）
    const top = Math.max(150, H * 0.2), bot = Math.max(150, H * 0.18), side = Math.max(34, W * 0.07);
    GM.setBounds({ x0: -visW / 2 + side / ppu, x1: visW / 2 - side / ppu, y0: -visH / 2 + bot / ppu, y1: visH / 2 - top / ppu });
  }
  const toScreen = (x, y) => ({ x: W / 2 + x * ppu, y: H / 2 - y * ppu });
  const toWorld = (px, py) => ({ x: (px - W / 2) / ppu, y: -(py - H / 2) / ppu });
  function germScreen(ge) { const p = toScreen(ge.x, ge.y); p.r = ge.r * ppu; return p; }

  // ------------------------------------------------------------- 景色（ミクロの世界）
  function biomePal(idx) {
    const b = GD.BIOMES[idx % GD.BIOMES.length];
    const loop = Math.floor(idx / GD.BIOMES.length);
    if (!loop) return Object.assign({ loop: 0 }, b);
    const deg = (loop * 67) % 360;
    const sh = (c) => U.shiftHue(c, deg);
    const NUM = ['弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾'];
    return Object.assign({}, b, { loop, name: b.name + '・' + (NUM[loop - 1] || '∞'), bg: b.bg.map(sh), ambCol: sh(b.ambCol), light: sh(b.light) });
  }
  function ensureBiome() {
    const idx = GM.biomeIndex(G.dstate().wave);
    if (idx === biomeIdx) return;
    biomeIdx = idx;
    pal = biomePal(idx);
    bgU.top.value.set(pal.bg[0]);
    bgU.bot.value.set(pal.bg[1]);
    bgU.hi.value.set(pal.light);
    scene.fog.color.set(pal.bg[0]).lerp(col(pal.bg[1]), 0.4);
    hemi.color.set(pal.light);
    hemi.groundColor.set(pal.bg[0]);
    rim.color.set(pal.light);
    makeAmb(pal.amb, pal.ambCol);
  }
  function makeAmb(type, c) {
    const k = type + c;
    if (k === ambKey) return;
    ambKey = k;
    if (amb) { scene.remove(amb); amb.geometry.dispose(); amb.material.dispose(); }
    let g;
    if (type === 'rbc') { g = new T3.TorusGeometry(0.5, 0.3, 8, 18); g.scale(1, 1, 0.55); }
    else if (type === 'bubble') g = new T3.SphereGeometry(0.42, 14, 10);
    else if (type === 'organelle') { g = new T3.SphereGeometry(0.4, 12, 8); g.scale(1.6, 0.8, 0.8); }
    else if (type === 'spark') g = new T3.OctahedronGeometry(0.16, 0);
    else g = new T3.SphereGeometry(0.2, 8, 6);
    const m = new T3.MeshStandardMaterial({ color: c, roughness: type === 'bubble' ? 0.05 : 0.45, metalness: 0.05, transparent: true, opacity: type === 'bubble' ? 0.32 : 0.62, emissive: c, emissiveIntensity: type === 'spark' ? 0.9 : 0.18, depthWrite: false });
    const n = [14, 26, 40][quality] || 26;
    amb = new T3.InstancedMesh(g, m, n);
    amb.frustumCulled = false;
    scene.add(amb);
    AMB.length = 0;
    for (let i = 0; i < n; i++) AMB.push(resetAmb({}, true, type));
  }
  function resetAmb(a, anywhere, type) {
    const z = -3 - rnd() * 20;
    const span = (camZ - z) / camZ;
    a.x = anywhere ? (rnd() - 0.5) * visW * span * 1.2 : -visW * span * 0.65;
    a.y = (rnd() - 0.5) * visH * span * 1.1;
    a.z = z;
    a.vx = (type === 'rbc' ? 0.9 : 0.25) * (0.5 + rnd());
    a.vy = (rnd() - 0.5) * 0.25;
    a.s = 0.7 + rnd() * 0.9;
    a.rx = rnd() * 6; a.ry = rnd() * 6; a.vr = (rnd() - 0.5) * 1.2;
    a.span = span;
    return a;
  }
  const mtx = new (window.THREE ? window.THREE.Matrix4 : Object)();
  function stepAmb(dt) {
    if (!amb) return;
    const e = new T3.Euler(), q = new T3.Quaternion(), p = new T3.Vector3(), s = new T3.Vector3();
    for (let i = 0; i < AMB.length; i++) {
      const a = AMB[i];
      a.x += a.vx * dt * (1 + outMix * 2);
      a.y += a.vy * dt + Math.sin(time * 0.6 + i) * 0.05 * dt;
      a.rx += a.vr * dt; a.ry += a.vr * 0.7 * dt;
      if (a.x > visW * a.span * 0.65) resetAmb(a, false, pal ? pal.amb : '');
      e.set(a.rx, a.ry, 0);
      q.setFromEuler(e);
      p.set(a.x, a.y, a.z);
      s.setScalar(a.s);
      mtx.compose(p, q, s);
      amb.setMatrixAt(i, mtx);
    }
    amb.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------- 菌の形（頂点色で1つのジオメトリに）
  function part(list, geo, color, mat4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (mat4) g.applyMatrix4(mat4);
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push({ g, color });
  }
  function merge(list) {
    let n = 0;
    for (const p of list) n += p.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), cl = new Float32Array(n * 3);
    let o = 0;
    const c = new T3.Color();
    for (const p of list) {
      const P = p.g.attributes.position, N = p.g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        pos[(o + i) * 3] = P.getX(i); pos[(o + i) * 3 + 1] = P.getY(i); pos[(o + i) * 3 + 2] = P.getZ(i);
        nor[(o + i) * 3] = N.getX(i); nor[(o + i) * 3 + 1] = N.getY(i); nor[(o + i) * 3 + 2] = N.getZ(i);
        if (typeof p.color === 'function') p.color(P.getX(i), P.getY(i), P.getZ(i), c); else c.copy(p.color);
        cl[(o + i) * 3] = c.r; cl[(o + i) * 3 + 1] = c.g; cl[(o + i) * 3 + 2] = c.b;
      }
      o += P.count;
      p.g.dispose();
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T3.BufferAttribute(nor, 3));
    g.setAttribute('color', new T3.BufferAttribute(cl, 3));
    g.computeBoundingSphere();
    return g;
  }
  const M4 = () => new T3.Matrix4();
  const at = (x, y, z, s = 1, rx = 0, ry = 0, rz = 0, sx, sy, sz) => {
    const m = M4().compose(new T3.Vector3(x, y, z), new T3.Quaternion().setFromEuler(new T3.Euler(rx, ry, rz)), new T3.Vector3(sx || s, sy || s, sz || s));
    return m;
  };
  // 体のグラデーション（上が明るく、下が暗い）。'rainbow' は横に虹色
  function bodyCol(palette) {
    if (palette === 'rainbow') return (x, y, z, c) => c.setHSL((((x + 1.5) / 3) % 1 + 1) % 1, 0.95, 0.6 + 0.12 * y);
    const a = col(palette[0]), b = col(palette[1]);
    return (x, y, z, c) => { const k = Math.max(0, Math.min(1, 0.5 + y * 0.45 + z * 0.2)); c.copy(b).lerp(a, k); };
  }
  function bumpy(geo, amp, freq, seed = 1) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      v1.fromBufferAttribute(p, i);
      const k = 1 + amp * Math.sin(v1.x * freq + seed) * Math.sin(v1.y * freq * 1.3 + seed * 2) * Math.sin(v1.z * freq * 0.9 + seed * 3);
      v1.multiplyScalar(k);
      p.setXYZ(i, v1.x, v1.y, v1.z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  // 顔: 目・黒目・光・まゆ・口（z+ がカメラ側）
  let lastFace = null;
  function face(list, x, y, z, s, mood = 'angry') {
    lastFace = { x, y, z, s };
    const white = col('#ffffff'), black = col('#140a14'), mouthC = col('#5a0a1a');
    for (const sx of [-1, 1]) {
      part(list, new T3.SphereGeometry(0.25, 14, 10), white, at(x + sx * 0.3 * s, y + 0.12 * s, z, s, 0, 0, 0, s, s * 1.1, s * 0.7));
      part(list, new T3.SphereGeometry(0.13, 10, 8), black, at(x + sx * 0.28 * s, y + 0.1 * s, z + 0.15 * s, s));
      part(list, new T3.SphereGeometry(0.045, 6, 4), white, at(x + sx * 0.25 * s, y + 0.16 * s, z + 0.27 * s, s));
      if (mood === 'angry') part(list, new T3.BoxGeometry(0.34, 0.08, 0.08), black, at(x + sx * 0.3 * s, y + 0.44 * s, z + 0.05 * s, s, 0, 0, -sx * 0.45));
    }
    const m = new T3.TorusGeometry(0.16, 0.045, 6, 14, Math.PI);
    part(list, m, mouthC, at(x, y - 0.24 * s, z + 0.02 * s, s, 0, 0, mood === 'happy' ? Math.PI : 0));
  }
  function fib(n, i) {
    const y = 1 - ((i + 0.5) / n) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    return new T3.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
  }
  // 形づくりの道具（次元ポータルの敵）
  function deform(geo, f) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { v1.fromBufferAttribute(p, i); f(v1); p.setXYZ(i, v1.x, v1.y, v1.z); }
    geo.computeVertexNormals();
    return geo;
  }
  const lathe = (P, seg) => new T3.LatheGeometry(P.map(([r, y]) => new T3.Vector2(r, y)), seg);
  function latheR(P, y) {
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    }
    return 0.5;
  }
  function leaf() { const g = new T3.SphereGeometry(1, 10, 8); g.scale(0.5, 1, 0.12); g.translate(0, 0.9, 0); return g; }
  // 色: パレットの i 番目（0 = 明るい色・1 = 暗い色）を白／黒へ寄せる。虹色のときは白と紫
  function pc(pal, i, toW = 0, toB = 0) {
    const x = pal === 'rainbow' ? col(i ? '#a06aff' : '#ffffff') : col(pal[i]);
    if (toW) x.lerp(cWhite, toW);
    if (toB) x.lerp(col('#000000'), toB);
    return x;
  }
  // 球面にとげ・結晶を並べる（顔の前はあける）
  function spikes(L, color, n, r, mk, skip = 0.72) {
    for (let i = 0; i < n; i++) {
      const d = fib(n, i);
      if (d.z > skip && Math.abs(d.x) < 0.6 && Math.abs(d.y) < 0.6) continue;
      const q = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 1, 0), d);
      part(L, mk(d), color, M4().compose(d.clone().multiplyScalar(r), q, new T3.Vector3(1, 1, 1)));
    }
  }
  const SHAPES = {
    ball(L, c) { part(L, bumpy(new T3.IcosahedronGeometry(1, 3), 0.05, 4), c); face(L, 0, 0.05, 0.82, 1); },
    chain(L, c) {
      for (let i = -1; i <= 1; i++) part(L, new T3.SphereGeometry(0.55, 16, 12), c, at(i * 0.92, Math.abs(i) * -0.18, 0));
      face(L, 0, 0, 0.45, 0.85);
    },
    grape(L, c) {
      part(L, new T3.SphereGeometry(0.5, 14, 10), c, at(0, 0, 0.15));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(L, new T3.SphereGeometry(0.46, 14, 10), c, at(Math.cos(a) * 0.68, Math.sin(a) * 0.62, -0.12 + (i % 2) * 0.18)); }
      face(L, 0, 0, 0.58, 0.8);
    },
    rod(L, c) {
      const pts = [];
      for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); pts.push(new T3.Vector2(Math.cos(a) * 0.55, -0.8 + Math.sin(a) * 0.55)); }
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); pts.push(new T3.Vector2(Math.cos(a) * 0.55, 0.8 + Math.sin(a) * 0.55)); }
      part(L, new T3.LatheGeometry(pts, 18), c, at(0, 0, 0, 1, 0, 0, Math.PI / 2));
      for (const s of [-1, 1]) {
        const cv = new T3.CatmullRomCurve3([new T3.Vector3(-1.25, s * 0.15, 0), new T3.Vector3(-1.65, s * 0.35, 0.05), new T3.Vector3(-2.05, s * 0.1, 0), new T3.Vector3(-2.45, s * 0.38, -0.05)]);
        part(L, new T3.TubeGeometry(cv, 16, 0.045, 5, false), c);
      }
      face(L, 0.35, 0.02, 0.48, 0.8);
    },
    spiral(L, c) {
      const pts = [];
      for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * Math.PI * 5; pts.push(new T3.Vector3(-1.4 + t * 2.8, Math.cos(a) * 0.35, Math.sin(a) * 0.35)); }
      part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3(pts), 90, 0.27, 8, false), c);
      face(L, 0, 0.05, 0.72, 0.7);
    },
    comma(L, c) {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = -0.3 + (i / 10) * 1.9; pts.push(new T3.Vector3(Math.cos(a) * 0.9 - 0.3, Math.sin(a) * 0.9 - 0.3, 0)); }
      part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3(pts), 24, 0.42, 10, false), c);
      for (const p of [pts[0], pts[pts.length - 1]]) part(L, new T3.SphereGeometry(0.42, 10, 8), c, at(p.x, p.y, 0));
      const fl = new T3.CatmullRomCurve3([new T3.Vector3(-0.85, 0.6, 0), new T3.Vector3(-1.25, 1.0, 0.05), new T3.Vector3(-1.5, 0.75, 0), new T3.Vector3(-1.9, 1.05, 0)]);
      part(L, new T3.TubeGeometry(fl, 14, 0.05, 5, false), c);
      face(L, 0.2, 0.25, 0.42, 0.7);
    },
    spiky(L, c, pal) {
      part(L, bumpy(new T3.IcosahedronGeometry(0.85, 3), 0.04, 5), c);
      const tip = pal === 'rainbow' ? col('#ffffff') : col(pal[0]).lerp(cWhite, 0.4);
      for (let i = 0; i < 26; i++) {
        const d = fib(26, i);
        if (d.z > 0.72 && Math.abs(d.x) < 0.6 && Math.abs(d.y) < 0.6) continue;
        const q = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 1, 0), d);
        const base = d.clone().multiplyScalar(0.98);
        part(L, new T3.CylinderGeometry(0.05, 0.07, 0.36, 6), c, M4().compose(base.clone().addScaledVector(d, 0.16), q, new T3.Vector3(1, 1, 1)));
        part(L, new T3.SphereGeometry(0.12, 8, 6), tip, M4().compose(base.clone().addScaledVector(d, 0.36), q, new T3.Vector3(1, 1, 1)));
      }
      face(L, 0, 0, 0.76, 0.85);
    },
    phage(L, c, pal) {
      const metal = pal === 'rainbow' ? col('#ffffff') : col(pal[1]).lerp(col('#888899'), 0.5);
      const head = new T3.IcosahedronGeometry(0.66, 0);
      head.scale(1, 1.18, 1);
      part(L, head, c, at(0, 0.62, 0));
      part(L, new T3.CylinderGeometry(0.22, 0.22, 0.12, 8), metal, at(0, -0.06, 0));
      part(L, new T3.CylinderGeometry(0.13, 0.13, 0.72, 8), metal, at(0, -0.46, 0));
      part(L, new T3.CylinderGeometry(0.32, 0.32, 0.09, 6), metal, at(0, -0.86, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const k = new T3.Vector3(Math.cos(a), 0, Math.sin(a));
        const p1 = new T3.Vector3(0, -0.88, 0).addScaledVector(k, 0.3), p2 = p1.clone().addScaledVector(k, 0.45).add(new T3.Vector3(0, 0.25, 0)), p3 = p2.clone().addScaledVector(k, 0.25).add(new T3.Vector3(0, -0.65, 0));
        part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3([p1, p2, p3]), 8, 0.04, 4, false), metal);
      }
      face(L, 0, 0.62, 0.58, 0.72);
    },
    blob(L, c) { part(L, bumpy(new T3.IcosahedronGeometry(1, 3), 0.2, 2.2, 2), c); face(L, 0, 0.1, 0.92, 0.95); },
    fuzzy(L, c, pal) {
      part(L, bumpy(new T3.IcosahedronGeometry(0.82, 3), 0.05, 6), c);
      const hair = pal === 'rainbow' ? col('#ffffff') : col(pal[0]).lerp(cWhite, 0.25);
      for (let i = 0; i < 56; i++) {
        const d = fib(56, i);
        if (d.z > 0.75 && Math.abs(d.x) < 0.55 && Math.abs(d.y) < 0.55) continue;
        const q = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 1, 0), d);
        part(L, new T3.ConeGeometry(0.035, 0.38, 4), hair, M4().compose(d.clone().multiplyScalar(0.95), q, new T3.Vector3(1, 1, 1)));
      }
      face(L, 0, 0, 0.75, 0.82);
    },
    slipper(L, c, pal) {
      const g = new T3.SphereGeometry(1, 22, 14);
      g.scale(1.35, 0.72, 0.6);
      part(L, g, c);
      const ci = pal === 'rainbow' ? col('#ffffff') : col(pal[0]).lerp(cWhite, 0.3);
      for (let i = 0; i < 44; i++) {
        const a = (i / 44) * Math.PI * 2, d = new T3.Vector3(Math.cos(a) * 1.35, Math.sin(a) * 0.72, 0);
        const n = new T3.Vector3(Math.cos(a) / 1.35, Math.sin(a) / 0.72, 0).normalize();
        const q = new T3.Quaternion().setFromUnitVectors(new T3.Vector3(0, 1, 0), n);
        part(L, new T3.ConeGeometry(0.025, 0.2, 3), ci, M4().compose(d.addScaledVector(n, 0.08), q, new T3.Vector3(1, 1, 1)));
      }
      face(L, 0.35, 0.05, 0.52, 0.72);
    },
    knot(L, c) { part(L, new T3.TorusKnotGeometry(0.6, 0.22, 90, 10, 2, 3), c); face(L, 0, 0, 0.95, 0.75); },
    crystal(L, c) {
      const g = new T3.OctahedronGeometry(0.9, 0);
      g.scale(0.85, 1.25, 0.85);
      part(L, g, c);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const s = new T3.OctahedronGeometry(0.35, 0); s.scale(0.7, 1.3, 0.7); part(L, s, c, at(Math.cos(a) * 0.75, -0.4 + (i % 2) * 0.5, Math.sin(a) * 0.5, 1, 0, 0, Math.cos(a) * 0.7)); }
      face(L, 0, 0.05, 0.62, 0.75);
    },
    void(L, c) {
      const g = new T3.IcosahedronGeometry(1, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { v1.fromBufferAttribute(p, i); const k = 1 + 0.18 * Math.abs(Math.sin(v1.x * 7) * Math.sin(v1.y * 6 + 1)); v1.multiplyScalar(k); p.setXYZ(i, v1.x, v1.y, v1.z); }
      part(L, g, c);
      face(L, 0, 0.05, 0.92, 0.95);
    },
    // ===== 次元ポータルの敵（界ごとの形）=====
    slime(L, c) {
      const g = deform(new T3.SphereGeometry(1, 26, 18), (v) => { v.x *= 1.12; v.y *= v.y < 0 ? 0.62 : 0.86; if (v.y < -0.45) v.y = -0.45 - (v.y + 0.45) * 0.25; });
      part(L, g, c, at(0, -0.05, 0));
      part(L, new T3.ConeGeometry(0.26, 0.42, 14), c, at(0.02, 0.92, 0, 1, 0, 0, -0.35));
      face(L, 0, 0.08, 0.84, 0.92);
    },
    drop(L, c) {
      part(L, deform(new T3.SphereGeometry(0.9, 24, 18), (v) => { if (v.y > 0) { const t = v.y / 0.9, k = 1 - Math.pow(t, 1.2) * 0.85; v.x *= k; v.z *= k; v.y *= 1.5; } }), c, at(0, -0.15, 0));
      face(L, 0, -0.1, 0.72, 0.9);
    },
    lemon(L, c) {
      part(L, deform(new T3.SphereGeometry(0.85, 24, 16), (v) => { v.x *= 1.35; const k = 1 - 0.3 * Math.pow(Math.abs(v.x) / 1.15, 4); v.y *= k; v.z *= k; }), c);
      for (const sx of [-1, 1]) part(L, new T3.ConeGeometry(0.12, 0.28, 8), c, at(sx * 1.22, 0, 0, 1, 0, 0, -sx * Math.PI / 2));
      face(L, 0, 0, 0.74, 0.85);
    },
    cube(L, c) {
      part(L, deform(new T3.BoxGeometry(1.5, 1.5, 1.5, 6, 6, 6), (v) => { const n = v.clone().normalize().multiplyScalar(1.06); v.lerp(n, 0.22); }), c);
      face(L, 0, 0, 0.8, 0.85);
    },
    pillow(L, c) {
      part(L, deform(new T3.BoxGeometry(1.9, 1.3, 0.9, 8, 6, 4), (v) => { const ex = Math.abs(v.x) / 0.95, ey = Math.abs(v.y) / 0.65; v.z *= 1 - 0.55 * Math.max(ex * ex, ey * ey); v.x *= 1 - 0.08 * ey; v.y *= 1 - 0.08 * ex; }), c);
      face(L, 0, 0, 0.38, 0.75, 'happy');
    },
    bat(L, c, pal) {
      part(L, bumpy(new T3.IcosahedronGeometry(0.78, 3), 0.04, 4), c);
      const wc = pc(pal, 1, 0, 0.25);
      for (const sx of [-1, 1]) {
        const sh = new T3.Shape();
        sh.moveTo(0, 0.3); sh.lineTo(1.0, 0.75); sh.lineTo(1.25, 0.1); sh.quadraticCurveTo(1.05, 0.02, 0.95, -0.25); sh.quadraticCurveTo(0.75, -0.05, 0.6, -0.3); sh.quadraticCurveTo(0.4, -0.05, 0, -0.2); sh.closePath();
        part(L, new T3.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: false }), wc, at(sx * 0.55, 0.05, sx > 0 ? -0.2 : -0.14, 1, 0, sx > 0 ? 0 : Math.PI, 0));
        part(L, new T3.ConeGeometry(0.15, 0.36, 6), c, at(sx * 0.36, 0.8, 0, 1, 0, 0, -sx * 0.3));
      }
      face(L, 0, 0, 0.66, 0.8);
    },
    octa(L, c) { const g = new T3.OctahedronGeometry(1, 0); g.scale(0.92, 1.25, 0.92); part(L, g, c); face(L, 0, 0.05, 0.5, 0.62); },
    tetra(L, c) { const g = new T3.TetrahedronGeometry(1.2, 0); g.rotateX(-0.62); g.rotateY(Math.PI / 4); part(L, g, c); face(L, 0, -0.1, 0.62, 0.62); },
    dodeca(L, c) { part(L, new T3.DodecahedronGeometry(1, 0), c); face(L, 0, 0.02, 0.74, 0.8); },
    ico(L, c) { part(L, new T3.IcosahedronGeometry(1, 0), c); face(L, 0, 0.02, 0.7, 0.78); },
    geode(L, c, pal) {
      part(L, bumpy(new T3.IcosahedronGeometry(0.85, 2), 0.12, 3, 4), pc(pal, 1, 0, 0.45));
      spikes(L, c, 18, 0.95, (d) => new T3.ConeGeometry(0.16, 0.62, 6), 0.7);
      face(L, 0, 0, 0.76, 0.8);
    },
    prism(L, c) {
      part(L, new T3.CylinderGeometry(0.72, 0.72, 1.5, 6), c, at(0, 0, 0, 1, 0, Math.PI / 6, 0));
      part(L, new T3.ConeGeometry(0.72, 0.55, 6), c, at(0, 1.02, 0, 1, 0, Math.PI / 6, 0));
      part(L, new T3.ConeGeometry(0.72, 0.55, 6), c, at(0, -1.02, 0, 1, Math.PI, Math.PI / 6, 0));
      face(L, 0, 0.05, 0.56, 0.7);
    },
    diamond(L, c) {
      part(L, new T3.CylinderGeometry(0.58, 1.0, 0.42, 8), c, at(0, 0.3, 0));
      part(L, new T3.ConeGeometry(1.0, 1.15, 8), c, at(0, -0.48, 0, 1, Math.PI, 0, 0));
      face(L, 0, 0.12, 0.8, 0.7);
    },
    torus(L, c) { part(L, new T3.TorusGeometry(0.72, 0.34, 14, 34), c); face(L, 0, -0.72, 0.24, 0.55); },
    // --- 果実
    apple(L, c) {
      part(L, deform(new T3.SphereGeometry(1, 26, 20), (v) => { const rr = Math.hypot(v.x, v.z); v.y = v.y * 0.92 - 0.2 * Math.pow(Math.max(0, 1 - rr), 3) * Math.sign(v.y); }), c);
      part(L, new T3.CylinderGeometry(0.05, 0.06, 0.4, 6), col('#5a3a1a'), at(0.05, 0.98, 0, 1, 0, 0, -0.25));
      part(L, leaf(), col('#4ac04a'), at(0.28, 1.0, 0, 0.42, 0, 0, -0.6));
      face(L, 0, 0, 0.84, 0.92);
    },
    orange(L, c) {
      part(L, bumpy(deform(new T3.SphereGeometry(1, 28, 20), (v) => { v.y *= 0.9; }), 0.012, 22), c);
      part(L, new T3.CylinderGeometry(0.1, 0.1, 0.1, 8), col('#3a6a1a'), at(0, 0.9, 0));
      part(L, leaf(), col('#3ab04a'), at(0.2, 0.94, 0.05, 0.35, 0, 0, -0.9));
      face(L, 0, 0, 0.84, 0.92);
    },
    cherry(L, c) {
      for (const sx of [-1, 1]) part(L, new T3.SphereGeometry(0.58, 18, 14), c, at(sx * 0.5, -0.38, sx * 0.08));
      const stem = col('#3a6a1a');
      for (const sx of [-1, 1]) part(L, new T3.TubeGeometry(new T3.QuadraticBezierCurve3(new T3.Vector3(sx * 0.45, 0.12, 0), new T3.Vector3(sx * 0.2, 0.8, 0), new T3.Vector3(0.05, 1.05, 0)), 10, 0.04, 5, false), stem);
      part(L, leaf(), col('#4ac04a'), at(0.25, 1.05, 0, 0.45, 0, 0, -0.5));
      face(L, -0.5, -0.36, 0.5, 0.6);
    },
    berry(L, c) {
      const P = [[0.01, 0.82], [0.62, 0.78], [0.92, 0.52], [0.95, 0.18], [0.8, -0.22], [0.55, -0.62], [0.25, -0.95], [0.01, -1.05]];
      part(L, lathe(P, 22), c);
      const seed = col('#fff2a0');
      for (let i = 0; i < 30; i++) {
        const d = fib(30, i);
        if (d.y > 0.7 || (d.z > 0.75 && Math.abs(d.x) < 0.5 && d.y > -0.4 && d.y < 0.5)) continue;
        const y = d.y * 0.85, rr = latheR(P, y) * 0.98, a = Math.atan2(d.z, d.x);
        part(L, new T3.SphereGeometry(0.05, 5, 4), seed, at(Math.cos(a) * rr, y, Math.sin(a) * rr, 1, 0, 0, 0, 1, 1.5, 1));
      }
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(L, leaf(), col('#3ab04a'), at(Math.cos(a) * 0.32, 0.86, Math.sin(a) * 0.32, 0.38, 0, -a, 0.35)); }
      face(L, 0, 0.12, 0.82, 0.85);
    },
    banana(L, c, pal) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const a = -1.0 + (i / 12) * 2.0; pts.push(new T3.Vector3(Math.sin(a) * 1.3, -Math.cos(a) * 0.9 + 0.5, 0)); }
      const cv = new T3.CatmullRomCurve3(pts);
      part(L, deform(new T3.TubeGeometry(cv, 32, 0.36, 12, false), (v) => { const t = Math.abs(v.x) / 1.15; const k = 1 - 0.55 * Math.pow(Math.min(1, t), 3); const cy = -Math.cos(Math.asin(Math.max(-1, Math.min(1, v.x / 1.3)))) * 0.9 + 0.5; v.y = cy + (v.y - cy) * k; v.z *= k; }), c);
      const tip = pc(pal, 1, 0, 0.5);
      part(L, new T3.ConeGeometry(0.09, 0.22, 6), tip, at(-1.12, 0.06, 0, 1, 0, 0, 0.9));
      part(L, new T3.CylinderGeometry(0.08, 0.1, 0.3, 6), tip, at(1.15, 0.12, 0, 1, 0, 0, -0.9));
      face(L, 0, -0.42, 0.24, 0.55);
    },
    pear(L, c) {
      part(L, lathe([[0.01, -1.0], [0.6, -0.95], [0.9, -0.6], [0.92, -0.2], [0.7, 0.15], [0.5, 0.45], [0.42, 0.7], [0.25, 0.92], [0.01, 0.98]], 24), c);
      part(L, new T3.CylinderGeometry(0.04, 0.05, 0.35, 6), col('#5a3a1a'), at(0.04, 1.1, 0, 1, 0, 0, -0.2));
      face(L, 0, -0.38, 0.8, 0.8);
    },
    melon(L, c, pal) {
      const a = pc(pal, 0), b = pc(pal, 1, 0, 0.35);
      const stripes = pal === 'rainbow' ? c : (x, y, z, cc) => { const k = Math.sin(Math.atan2(z, x) * 8 + Math.sin(y * 5) * 0.6) > 0.25; cc.copy(k ? b : a); };
      part(L, deform(new T3.SphereGeometry(1, 30, 20), (v) => { v.x *= 1.12; v.y *= 0.92; }), stripes);
      face(L, 0, 0.02, 0.86, 0.95);
    },
    peach(L, c) {
      part(L, deform(new T3.SphereGeometry(1, 26, 20), (v) => { const k = 1 - 0.1 * Math.exp(-(v.x * v.x) * 30) * Math.max(0, v.z); v.z *= k; if (v.y > 0.6) v.y += (v.y - 0.6) * 0.5 * Math.max(0, 1 - Math.abs(v.x) * 3); }), c);
      part(L, leaf(), col('#4ac04a'), at(0.18, 1.0, 0, 0.5, 0, 0, -0.7));
      face(L, 0, -0.05, 0.84, 0.9);
    },
    pine(L, c, pal) {
      const a = pc(pal, 0), b = pc(pal, 1, 0, 0.25);
      const dia = pal === 'rainbow' ? c : (x, y, z, cc) => { const u = Math.atan2(z, x) * 3, v = y * 5; cc.copy(Math.abs(Math.sin(u + v)) * Math.abs(Math.sin(u - v)) > 0.25 ? a : b); };
      part(L, deform(new T3.SphereGeometry(0.82, 24, 18), (v) => { v.y *= 1.25; }), dia, at(0, -0.15, 0));
      const g = col('#3ab04a');
      for (let i = 0; i < 7; i++) { const t = (i / 6 - 0.5) * 1.6; part(L, new T3.ConeGeometry(0.1, 0.75 - Math.abs(t) * 0.25, 4), g, at(Math.sin(t) * 0.25, 1.12, Math.cos(i) * 0.05, 1, 0, 0, -t * 0.7)); }
      face(L, 0, -0.1, 0.72, 0.8);
    },
    // --- 霊界
    ghost(L, c) {
      part(L, new T3.SphereGeometry(0.85, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), c, at(0, 0.25, 0));
      part(L, deform(new T3.CylinderGeometry(0.85, 0.98, 1.0, 22, 4, true), (v) => { if (v.y < -0.3) v.y += Math.sin(Math.atan2(v.z, v.x) * 6) * 0.13; }), c, at(0, -0.25, 0));
      for (const sx of [-1, 1]) part(L, new T3.SphereGeometry(0.2, 10, 8), c, at(sx * 0.95, -0.05, 0.1, 1, 0, 0, sx * 0.4, 1.3, 0.8, 0.8));
      face(L, 0, 0.22, 0.74, 0.82);
    },
    wisp(L, c) {
      part(L, deform(new T3.SphereGeometry(0.85, 24, 18), (v) => { if (v.y > 0) { const t = v.y / 0.85, k = 1 - Math.pow(t, 1.1) * 0.9; v.x *= k; v.z *= k; v.y *= 1.9; v.x += Math.sin(t * 2.4) * 0.45 * t; } }), c, at(0, -0.35, 0));
      face(L, 0, -0.32, 0.7, 0.8);
    },
    flame(L, c) {
      const fl = (k, sx) => deform(new T3.SphereGeometry(0.8 * k, 20, 16), (v) => { if (v.y > 0) { const t = v.y / (0.8 * k), q = 1 - Math.pow(t, 0.9) * 0.92; v.x *= q; v.z *= q; v.y *= 2.1; v.x += Math.sin(t * 3) * 0.12 * k * sx; } });
      part(L, fl(1, 1), c, at(0, -0.32, 0));
      part(L, fl(0.55, -1), c, at(-0.56, -0.48, -0.12));
      part(L, fl(0.55, 1), c, at(0.56, -0.48, -0.12));
      face(L, 0, -0.32, 0.66, 0.75);
    },
    skull(L, c) {
      part(L, new T3.SphereGeometry(0.9, 22, 16), c, at(0, 0.18, 0, 1, 0, 0, 0, 1, 0.95, 1));
      part(L, deform(new T3.BoxGeometry(0.95, 0.42, 0.75, 3, 2, 3), (v) => { v.x *= 1 - 0.25 * (0.21 - v.y); }), c, at(0, -0.6, 0.12));
      const blk = col('#120810');
      for (const sx of [-1, 1]) {
        part(L, new T3.SphereGeometry(0.24, 12, 10), blk, at(sx * 0.34, 0.12, 0.66, 1, 0, 0, 0, 1, 1.1, 0.6));
        part(L, new T3.SphereGeometry(0.07, 8, 6), col('#ff4a4a'), at(sx * 0.34, 0.12, 0.8));
      }
      part(L, new T3.ConeGeometry(0.1, 0.18, 3), blk, at(0, -0.18, 0.84, 1, 0, 0, Math.PI));
      for (let i = -2; i <= 2; i++) part(L, new T3.BoxGeometry(0.12, 0.16, 0.06), col('#ffffff'), at(i * 0.15, -0.46, 0.5));
      lastFace = { x: 0, y: 0.15, z: 0.78, s: 0.9 };
    },
    lantern(L, c) {
      const body = new T3.SphereGeometry(0.9, 22, 18);
      body.scale(0.85, 1.1, 0.85);
      part(L, body, c);
      const rib = col('#3a1a0a');
      for (let i = -3; i <= 3; i++) { const y = i * 0.28, r = 0.765 * Math.sqrt(Math.max(0.05, 1 - (y / 0.99) * (y / 0.99))); part(L, new T3.TorusGeometry(r, 0.025, 4, 28), rib, at(0, y, 0, 1, Math.PI / 2)); }
      for (const y of [1.0, -1.0]) part(L, new T3.CylinderGeometry(0.42, 0.42, 0.16, 18), rib, at(0, y, 0));
      part(L, new T3.SphereGeometry(0.3, 14, 10), col('#ffffff'), at(0.05, 0.25, 0.66, 1, 0, 0, 0, 1, 1, 0.6));
      part(L, new T3.SphereGeometry(0.15, 10, 8), col('#140a14'), at(0.07, 0.24, 0.8));
      part(L, new T3.SphereGeometry(0.2, 10, 8), col('#ff3a5a'), at(0, -0.42, 0.72, 1, 0.4, 0, 0, 0.9, 1.5, 0.5));
      lastFace = { x: 0, y: 0.15, z: 0.66, s: 0.85 };
    },
    eyeball(L, c, pal) {
      part(L, new T3.SphereGeometry(0.95, 26, 20), col('#fff8f2'));
      const iris = pal === 'rainbow' ? c : pc(pal, 1);
      part(L, new T3.SphereGeometry(0.965, 22, 8, 0, Math.PI * 2, 0, 0.58), iris, at(0, 0, 0, 1, Math.PI / 2));
      part(L, new T3.SphereGeometry(0.975, 18, 6, 0, Math.PI * 2, 0, 0.28), col('#0a0610'), at(0, 0, 0, 1, Math.PI / 2));
      part(L, new T3.SphereGeometry(0.1, 8, 6), col('#ffffff'), at(0.18, 0.2, 0.93));
      const vein = col('#ff5a6a');
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; const p1 = new T3.Vector3(Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.74); const p2 = new T3.Vector3(Math.cos(a + 0.2) * 0.85, Math.sin(a + 0.2) * 0.85, 0.42); part(L, new T3.TubeGeometry(new T3.LineCurve3(p1, p2), 2, 0.018, 4, false), vein); }
      lastFace = { x: 0, y: 0, z: 0.84, s: 0.9 };
    },
    kasa(L, c) {
      part(L, new T3.ConeGeometry(1.05, 1.15, 12), c, at(0, 0.25, 0));
      const wood = col('#6a4a2a');
      part(L, new T3.CylinderGeometry(0.05, 0.05, 1.1, 6), wood, at(0, -0.75, 0));
      part(L, new T3.BoxGeometry(0.3, 0.1, 0.42), wood, at(0, -1.3, 0.1));
      part(L, new T3.SphereGeometry(0.26, 14, 10), col('#ffffff'), at(0, 0.3, 0.5, 1, 0, 0, 0, 1, 1, 0.7));
      part(L, new T3.SphereGeometry(0.13, 10, 8), col('#140a14'), at(0, 0.28, 0.66));
      part(L, new T3.SphereGeometry(0.2, 10, 8), col('#ff3a5a'), at(0.05, -0.18, 0.7, 1, 0, 0, 0, 0.8, 1.4, 0.4));
      lastFace = { x: 0, y: 0.25, z: 0.5, s: 0.7 };
    },
    imp(L, c) {
      part(L, bumpy(new T3.IcosahedronGeometry(0.88, 3), 0.04, 4), c);
      const horn = col('#fff2d0');
      for (const sx of [-1, 1]) {
        part(L, new T3.ConeGeometry(0.13, 0.5, 8), horn, at(sx * 0.42, 0.88, 0, 1, 0, 0, -sx * 0.4));
        part(L, new T3.ConeGeometry(0.12, 0.38, 6), c, at(sx * 0.9, 0.25, 0, 1, 0, 0, -sx * 1.2));
      }
      part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3([new T3.Vector3(0.5, -0.6, -0.5), new T3.Vector3(1.0, -0.8, -0.6), new T3.Vector3(1.2, -0.4, -0.6)]), 10, 0.05, 5, false), c);
      part(L, new T3.ConeGeometry(0.12, 0.25, 4), c, at(1.24, -0.28, -0.6));
      face(L, 0, 0.05, 0.76, 0.9);
    },
    // --- 機界
    robot(L, c, pal) {
      part(L, deform(new T3.BoxGeometry(1.4, 1.15, 1.0, 4, 4, 4), (v) => { const n = v.clone().normalize(); v.addScaledVector(n, 0.04); }), c);
      const m = pc(pal, 1, 0, 0.4);
      part(L, new T3.CylinderGeometry(0.04, 0.04, 0.45, 6), m, at(0, 0.8, 0));
      part(L, new T3.SphereGeometry(0.11, 10, 8), col('#ff4a4a'), at(0, 1.05, 0));
      for (const sx of [-1, 1]) part(L, new T3.CylinderGeometry(0.2, 0.2, 0.18, 14), m, at(sx * 0.78, 0.05, 0, 1, 0, 0, Math.PI / 2));
      const eye = col('#7affff');
      for (const sx of [-1, 1]) part(L, new T3.BoxGeometry(0.32, 0.16, 0.06), eye, at(sx * 0.3, 0.15, 0.52));
      part(L, new T3.BoxGeometry(0.62, 0.16, 0.06), col('#1a1a24'), at(0, -0.25, 0.52));
      for (let i = -2; i <= 2; i++) part(L, new T3.BoxGeometry(0.03, 0.12, 0.07), m, at(i * 0.12, -0.25, 0.53));
      lastFace = { x: 0, y: 0.1, z: 0.52, s: 0.9 };
    },
    bot(L, c, pal) {
      part(L, new T3.SphereGeometry(0.92, 26, 18), c);
      const m = pc(pal, 1, 0, 0.35);
      part(L, new T3.TorusGeometry(0.93, 0.06, 6, 36), m, at(0, -0.1, 0, 1, Math.PI / 2));
      part(L, new T3.CylinderGeometry(0.035, 0.035, 0.45, 6), m, at(0.25, 1.05, 0, 1, 0, 0, -0.3));
      part(L, new T3.SphereGeometry(0.09, 8, 6), col('#ffe04a'), at(0.33, 1.28, 0));
      face(L, 0, 0.12, 0.78, 0.85);
    },
    drone(L, c) {
      part(L, new T3.SphereGeometry(0.62, 20, 14), c);
      const m = col('#3a4a5a');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4, x = Math.cos(a) * 1.05, z = Math.sin(a) * 1.05;
        part(L, new T3.CylinderGeometry(0.05, 0.05, 1.0, 6), m, at(x / 2, 0.2, z / 2, 1, 0, -a, Math.PI / 2));
        part(L, new T3.CylinderGeometry(0.4, 0.4, 0.04, 20), col('#c8d8e8'), at(x, 0.3, z));
      }
      face(L, 0, -0.02, 0.5, 0.62);
    },
    gear(L, c) {
      part(L, new T3.CylinderGeometry(0.82, 0.82, 0.42, 28), c, at(0, 0, 0, 1, Math.PI / 2));
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; part(L, new T3.BoxGeometry(0.3, 0.3, 0.4), c, at(Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0, 1, 0, 0, a)); }
      face(L, 0, 0.05, 0.12, 0.6);
    },
    ufo(L, c, pal) {
      part(L, deform(new T3.SphereGeometry(1, 30, 16), (v) => { v.x *= 1.3; v.z *= 1.3; v.y *= 0.33; }), c);
      part(L, new T3.SphereGeometry(0.55, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), pc(pal, 0, 0.55), at(0, 0.22, 0));
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; part(L, new T3.SphereGeometry(0.08, 8, 6), col(i % 2 ? '#ffe04a' : '#ff4a8a'), at(Math.cos(a) * 1.18, -0.02, Math.sin(a) * 1.18)); }
      face(L, 0, 0.3, 0.38, 0.5);
    },
    golem(L, c) {
      part(L, bumpy(new T3.BoxGeometry(1.4, 1.1, 1.0, 4, 4, 4), 0.06, 3), c, at(0, -0.25, 0));
      part(L, bumpy(new T3.BoxGeometry(0.85, 0.7, 0.75, 3, 3, 3), 0.06, 4, 2), c, at(0, 0.6, 0.05));
      for (const sx of [-1, 1]) part(L, bumpy(new T3.BoxGeometry(0.4, 0.95, 0.45, 2, 3, 2), 0.06, 4, 3), c, at(sx * 0.98, -0.3, 0, 1, 0, 0, sx * 0.15));
      face(L, 0, 0.55, 0.4, 0.55);
    },
    // --- 星界
    star(L, c) {
      const sh = new T3.Shape();
      for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.48 : 1.15; if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r); else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      sh.closePath();
      const g = new T3.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 2, curveSegments: 4 });
      g.translate(0, 0, -0.15);
      part(L, g, c);
      face(L, 0, -0.05, 0.3, 0.6);
    },
    planet(L, c, pal) {
      part(L, new T3.SphereGeometry(0.85, 26, 18), c);
      const ringG = new T3.TorusGeometry(1.32, 0.07, 6, 56);
      ringG.scale(1, 1, 0.25);
      part(L, ringG, pc(pal, 0, 0.35), at(0, 0, 0, 1, 1.25, 0, 0.35));
      face(L, 0, 0.15, 0.72, 0.8);
    },
    rock(L, c) { part(L, bumpy(new T3.IcosahedronGeometry(0.95, 1), 0.18, 2.4, 5), c); face(L, 0, 0.02, 0.74, 0.85); },
    ore(L, c, pal) {
      part(L, bumpy(new T3.IcosahedronGeometry(0.9, 1), 0.16, 2.4, 7), pc(pal, 1, 0, 0.45));
      spikes(L, c, 9, 0.85, () => new T3.OctahedronGeometry(0.2, 0), 0.6);
      face(L, 0, 0, 0.72, 0.8);
    },
    moon(L, c) {
      part(L, new T3.TorusGeometry(0.62, 0.36, 14, 26, Math.PI * 1.25), c, at(0.15, 0, 0, 1, 0, 0, Math.PI * 0.375));
      face(L, -0.55, 0.1, 0.24, 0.5);
    },
    sun(L, c, pal) {
      part(L, new T3.SphereGeometry(0.82, 24, 16), c);
      const ray = pc(pal, 0, 0.2);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; part(L, new T3.ConeGeometry(0.16, 0.42, 6), ray, at(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0, 1, 0, 0, a - Math.PI / 2)); }
      face(L, 0, 0.02, 0.7, 0.8);
    },
    blackhole(L, c, pal) {
      part(L, new T3.SphereGeometry(0.72, 24, 16), col('#05000a'));
      const disk = new T3.TorusGeometry(1.08, 0.2, 8, 48);
      disk.scale(1, 1, 0.22);
      part(L, disk, pal === 'rainbow' ? c : pc(pal, 0, 0.2), at(0, 0, 0, 1, 1.2, 0, 0.25));
      part(L, new T3.TorusGeometry(0.76, 0.04, 6, 36), pc(pal, 0, 0.5), at(0, 0, 0.05));
      face(L, 0, 0.05, 0.6, 0.7);
    },
    jelly(L, c, pal) {
      part(L, new T3.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c, at(0, -0.05, 0, 1, 0, 0, 0, 1, 0.9, 1));
      part(L, new T3.CylinderGeometry(0.9, 0.86, 0.12, 24), c, at(0, -0.1, 0));
      const tc = pc(pal, 0, 0.3);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2, x = Math.cos(a) * 0.55, z = Math.sin(a) * 0.55; const pts = []; for (let k = 0; k <= 6; k++) pts.push(new T3.Vector3(x + Math.sin(k * 1.2 + i) * 0.12, -0.15 - k * 0.2, z)); part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3(pts), 12, 0.045, 5, false), tc); }
      face(L, 0, 0.25, 0.7, 0.75);
    },
    // --- 氷界
    snowman(L, c) {
      part(L, new T3.SphereGeometry(0.72, 22, 16), c, at(0, -0.5, 0));
      part(L, new T3.SphereGeometry(0.52, 22, 16), c, at(0, 0.55, 0));
      part(L, new T3.ConeGeometry(0.08, 0.38, 8), col('#ff8a2a'), at(0, 0.48, 0.62, 1, Math.PI / 2));
      for (const y of [-0.25, -0.55]) part(L, new T3.SphereGeometry(0.07, 8, 6), col('#1a1a1a'), at(0, y, 0.7));
      face(L, 0, 0.58, 0.4, 0.55);
    },
    icicle(L, c) {
      part(L, new T3.ConeGeometry(0.5, 2.0, 10), c, at(0, -0.1, 0, 1, Math.PI));
      for (const sx of [-1, 1]) part(L, new T3.ConeGeometry(0.22, 1.0, 8), c, at(sx * 0.48, 0.3, -0.12, 1, Math.PI));
      face(L, 0, 0.58, 0.28, 0.45);
    },
    snowflake(L, c) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(L, new T3.BoxGeometry(0.16, 1.1, 0.12), c, at(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0, 1, 0, 0, a - Math.PI / 2));
        for (const s2 of [-1, 1]) part(L, new T3.BoxGeometry(0.1, 0.42, 0.1), c, at(Math.cos(a) * 0.78 + Math.cos(a + s2 * 0.9) * 0.14, Math.sin(a) * 0.78 + Math.sin(a + s2 * 0.9) * 0.14, 0, 1, 0, 0, a + s2 * 0.9 - Math.PI / 2));
      }
      part(L, new T3.CylinderGeometry(0.42, 0.42, 0.2, 6), c, at(0, 0, 0, 1, Math.PI / 2));
      face(L, 0, 0, 0.12, 0.42);
    },
    cloud(L, c) {
      for (const [x, y, r] of [[0, 0.15, 0.62], [-0.62, -0.1, 0.48], [0.62, -0.08, 0.5], [-0.3, -0.3, 0.5], [0.32, -0.32, 0.5], [0.2, 0.42, 0.42]]) part(L, new T3.SphereGeometry(r, 16, 12), c, at(x, y, 0));
      face(L, 0, -0.05, 0.5, 0.65);
    },
    egg(L, c) { part(L, lathe([[0.01, -0.92], [0.5, -0.82], [0.8, -0.45], [0.85, 0], [0.72, 0.5], [0.42, 0.88], [0.01, 1.02]], 24), c); face(L, 0, -0.05, 0.74, 0.8); },
    feather(L, c, pal) {
      const g = new T3.SphereGeometry(1, 20, 14);
      g.scale(0.42, 1.2, 0.1);
      part(L, deform(g, (v) => { v.x += Math.sin(v.y * 1.4) * 0.12; }), c, at(0, 0, 0, 1, 0, 0, -0.35));
      part(L, new T3.CylinderGeometry(0.03, 0.04, 2.7, 6), pc(pal, 0, 0.6), at(0.04, -0.15, 0.06, 1, 0, 0, -0.35));
      face(L, -0.12, 0.25, 0.1, 0.42);
    },
    // --- 深海界
    octo(L, c) {
      part(L, deform(new T3.SphereGeometry(0.75, 22, 16), (v) => { v.y *= v.y > 0 ? 1.25 : 0.8; }), c, at(0, 0.3, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2, dx = Math.cos(a), dz = Math.sin(a);
        const pts = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(new T3.Vector3(dx * (0.45 + t * 0.55) + Math.sin(t * 4 + i) * 0.08, -0.05 - t * 0.85 + Math.pow(t, 3) * 0.55, dz * (0.4 + t * 0.4))); }
        part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3(pts), 14, 0.12, 6, false), c);
      }
      face(L, 0, 0.32, 0.64, 0.75);
    },
    shell(L, c) {
      part(L, deform(new T3.SphereGeometry(1, 28, 12, 0, Math.PI, 0, Math.PI / 2), (v) => { const a = Math.atan2(v.z, v.x); const k = 1 + 0.07 * Math.cos(a * 11); v.x *= k; v.z *= k; v.y *= 0.55; }), c, at(0, -0.25, 0, 1, Math.PI / 2 - 0.25, 0, 0));
      part(L, new T3.CylinderGeometry(0.98, 0.98, 0.16, 28, 1, false, 0, Math.PI), c, at(0, -0.3, 0, 1, Math.PI / 2 - 0.25, 0, 0));
      face(L, 0, 0.12, 0.42, 0.7);
    },
    puffer(L, c, pal) {
      part(L, new T3.SphereGeometry(0.92, 24, 18), c);
      spikes(L, pc(pal, 0, 0.5), 30, 0.92, () => new T3.ConeGeometry(0.05, 0.24, 5), 0.7);
      for (const sx of [-1, 1]) part(L, new T3.ConeGeometry(0.22, 0.35, 6), c, at(sx * 0.98, 0, 0, 1, 0, 0, -sx * Math.PI / 2, 1, 1, 0.3));
      face(L, 0, 0.1, 0.8, 0.95, 'happy');
    },
    bubble(L, c) { part(L, new T3.SphereGeometry(0.95, 28, 20), c); part(L, new T3.SphereGeometry(0.18, 10, 8), col('#ffffff'), at(0.38, 0.45, 0.72, 1, 0, 0, 0, 1, 0.6, 0.5)); face(L, 0, -0.05, 0.82, 0.88, 'happy'); },
    // --- 菓子界
    donut(L, c, pal) {
      const icing = pc(pal, 0), dough = col('#d8a060');
      const two = (x, y, z, cc) => cc.copy(z > -0.05 ? icing : dough);
      part(L, new T3.TorusGeometry(0.62, 0.36, 16, 34), pal === 'rainbow' ? c : two, at(0, 0, 0, 1, -0.5));
      const sp = ['#ff4a6a', '#4ad0ff', '#ffe04a', '#7aff7a', '#ffffff'];
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2 + (i % 3) * 0.2, r = 0.62 + ((i * 37) % 7 - 3) * 0.05; part(L, new T3.BoxGeometry(0.05, 0.16, 0.05), col(sp[i % sp.length]), at(Math.cos(a) * r, Math.sin(a) * r * Math.cos(0.5) + 0.04, 0.3 + Math.sin(a) * r * Math.sin(0.5) * 0.4, 1, 0, 0, a * 3)); }
      face(L, 0, -0.55, 0.48, 0.55);
    },
    cupcake(L, c, pal) {
      const cup = pc(pal, 1, 0.1);
      part(L, deform(new T3.CylinderGeometry(0.78, 0.55, 0.8, 20), (v) => { const a = Math.atan2(v.z, v.x); const k = 1 + 0.05 * Math.cos(a * 14); v.x *= k; v.z *= k; }), cup, at(0, -0.55, 0));
      for (let i = 0; i < 4; i++) part(L, new T3.TorusGeometry(0.72 - i * 0.17, 0.2 - i * 0.02, 10, 26), c, at(0, -0.05 + i * 0.22, 0, 1, Math.PI / 2));
      part(L, new T3.SphereGeometry(0.16, 12, 8), col('#ff2a4a'), at(0, 0.82, 0));
      face(L, 0, -0.55, 0.62, 0.6);
    },
    candy(L, c, pal) {
      const g = new T3.SphereGeometry(0.75, 24, 16);
      g.scale(1.15, 0.85, 0.85);
      part(L, g, c);
      const w = pc(pal, 0, 0.3);
      for (const sx of [-1, 1]) part(L, deform(new T3.ConeGeometry(0.5, 0.7, 10, 2), (v) => { v.x *= 1 + 0.1 * Math.sin(v.y * 9); }), w, at(sx * 1.08, 0, 0, 1, 0, 0, sx * Math.PI / 2));
      face(L, 0, 0, 0.6, 0.72);
    },
    lollipop(L, c, pal) {
      const a = pc(pal, 0), b = pc(pal, 1);
      const swirl = pal === 'rainbow' ? c : (x, y, z, cc) => { const r = Math.hypot(x, y), t = Math.atan2(y, x); cc.copy(Math.sin(t * 2 + r * 9) > 0 ? a : b); };
      part(L, new T3.CylinderGeometry(0.88, 0.88, 0.32, 32), swirl, at(0, 0.25, 0, 1, Math.PI / 2));
      part(L, new T3.CylinderGeometry(0.06, 0.06, 1.2, 8), col('#fffaf0'), at(0, -1.1, 0));
      face(L, 0, 0.25, 0.14, 0.6);
    },
    macaron(L, c, pal) {
      for (const y of [0.3, -0.3]) part(L, deform(new T3.SphereGeometry(0.9, 24, 12), (v) => { v.y *= 0.36; }), c, at(0, y, 0));
      part(L, new T3.CylinderGeometry(0.78, 0.78, 0.2, 24), pc(pal, 1, 0.35), at(0, 0, 0));
      face(L, 0, 0.32, 0.72, 0.6);
    },
    pudding(L, c, pal) {
      part(L, new T3.CylinderGeometry(0.62, 0.9, 1.05, 24), c, at(0, -0.15, 0));
      part(L, new T3.CylinderGeometry(0.62, 0.64, 0.14, 24), pc(pal, 1), at(0, 0.42, 0));
      part(L, new T3.SphereGeometry(0.14, 10, 8), col('#ff2a4a'), at(0, 0.6, 0));
      face(L, 0, -0.1, 0.72, 0.72);
    },
    cake(L, c, pal) {
      part(L, new T3.CylinderGeometry(0.9, 0.9, 0.95, 28), c, at(0, -0.25, 0));
      part(L, new T3.CylinderGeometry(0.92, 0.92, 0.12, 28), col('#fffaf5'), at(0, 0.26, 0));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(L, new T3.SphereGeometry(0.13, 8, 6), col('#fffaf5'), at(Math.cos(a) * 0.72, 0.36, Math.sin(a) * 0.72)); }
      part(L, new T3.ConeGeometry(0.2, 0.32, 10), pc(pal, 1, 0.1), at(0, 0.5, 0, 1, Math.PI));
      face(L, 0, -0.25, 0.82, 0.72);
    },
    cookie(L, c) {
      part(L, bumpy(new T3.CylinderGeometry(0.95, 0.95, 0.3, 30, 1), 0.03, 6), c, at(0, 0, 0, 1, Math.PI / 2));
      const ch = col('#3a1a0a');
      for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.2 + (i % 4) * 0.18; if (r < 0.45 && Math.sin(a) > -0.2) continue; part(L, new T3.SphereGeometry(0.09, 6, 5), ch, at(Math.cos(a) * r, Math.sin(a) * r, 0.14)); }
      face(L, 0, 0.1, 0.08, 0.62);
    },
    kite(L, c, pal) {
      const g = new T3.OctahedronGeometry(1, 0);
      g.scale(0.85, 1.2, 0.14);
      part(L, g, c);
      const tail = pc(pal, 1, 0.2);
      part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3([new T3.Vector3(0, -1.15, 0), new T3.Vector3(0.25, -1.55, 0), new T3.Vector3(-0.15, -1.95, 0)]), 10, 0.025, 4, false), tail);
      for (const [x, y] of [[0.22, -1.5], [-0.08, -1.88]]) part(L, new T3.OctahedronGeometry(0.12, 0), tail, at(x, y, 0, 1, 0, 0, 0, 1.4, 0.7, 0.4));
      face(L, 0, 0.05, 0.08, 0.5);
    },
    cone(L, c) { part(L, new T3.ConeGeometry(0.9, 1.75, 26), c, at(0, 0.05, 0)); face(L, 0, -0.35, 0.56, 0.62); },
    mushroom(L, c, pal) {
      const cap = pc(pal, 0), stem = pc(pal, 1);
      part(L, deform(new T3.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), (v) => { v.y *= 0.72; }), cap, at(0, 0.12, 0));
      for (let i = 0; i < 9; i++) { const d = fib(18, i); if (d.y < 0.15) continue; part(L, new T3.SphereGeometry(0.12, 8, 6), col('#ffffff'), at(d.x * 0.98, 0.12 + d.y * 0.72, d.z * 0.98, 1, 0, 0, 0, 1, 0.5, 1)); }
      part(L, new T3.CylinderGeometry(0.42, 0.5, 0.9, 18), stem, at(0, -0.4, 0));
      face(L, 0, -0.36, 0.42, 0.55);
    },
    // --- 時界・音界・夢界・神界
    clock(L, c, pal) {
      part(L, new T3.CylinderGeometry(0.88, 0.88, 0.32, 32), col('#fffaf0'), at(0, 0, 0, 1, Math.PI / 2));
      part(L, new T3.TorusGeometry(0.9, 0.1, 8, 36), c);
      const ink = col('#1a1a24');
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; part(L, new T3.BoxGeometry(0.05, 0.12, 0.04), ink, at(Math.cos(a) * 0.72, Math.sin(a) * 0.72, 0.17, 1, 0, 0, a + Math.PI / 2)); }
      part(L, new T3.BoxGeometry(0.06, 0.48, 0.04), ink, at(0.12, -0.2, 0.2, 1, 0, 0, 0.5));
      part(L, new T3.BoxGeometry(0.05, 0.34, 0.04), ink, at(-0.13, -0.12, 0.2, 1, 0, 0, -0.9));
      for (const sx of [-1, 1]) part(L, new T3.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), pc(pal, 1, 0.1), at(sx * 0.55, 0.88, 0, 1, 0, 0, -sx * 0.5));
      face(L, 0, 0.28, 0.1, 0.5);
    },
    hourglass(L, c, pal) {
      const glass = pc(pal, 0, 0.55), wood = pc(pal, 1, 0, 0.2);
      for (const sy of [1, -1]) part(L, lathe([[0.08, 0], [0.45, 0.25 * sy], [0.62, 0.6 * sy], [0.6, 0.9 * sy]].map(([r, y]) => [r, y]).sort((p, q) => p[1] - q[1]), 18), glass);
      for (const y of [1.0, -1.0]) part(L, new T3.CylinderGeometry(0.78, 0.78, 0.16, 20), wood, at(0, y, 0));
      for (const sx of [-1, 1]) part(L, new T3.CylinderGeometry(0.05, 0.05, 2.0, 6), wood, at(sx * 0.7, 0, 0.12));
      part(L, new T3.ConeGeometry(0.42, 0.42, 16), c, at(0, -0.62, 0));
      face(L, 0, 0.5, 0.5, 0.5);
    },
    bell(L, c) {
      part(L, lathe([[0.01, 0.95], [0.3, 0.92], [0.45, 0.7], [0.52, 0.2], [0.72, -0.35], [0.98, -0.62], [1.0, -0.72], [0.9, -0.72]], 26), c);
      part(L, new T3.SphereGeometry(0.2, 12, 8), col('#5a4a2a'), at(0, -0.82, 0));
      part(L, new T3.TorusGeometry(0.14, 0.04, 6, 14), c, at(0, 1.05, 0));
      face(L, 0, 0.05, 0.5, 0.62);
    },
    heart(L, c) {
      const sh = new T3.Shape();
      sh.moveTo(0, -1.0);
      sh.bezierCurveTo(-0.6, -0.5, -1.1, 0, -1.0, 0.4);
      sh.bezierCurveTo(-0.95, 0.95, -0.25, 1.05, 0, 0.55);
      sh.bezierCurveTo(0.25, 1.05, 0.95, 0.95, 1.0, 0.4);
      sh.bezierCurveTo(1.1, 0, 0.6, -0.5, 0, -1.0);
      const g = new T3.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.12, bevelSegments: 3, curveSegments: 12 });
      g.translate(0, 0, -0.2);
      part(L, g, c);
      face(L, 0, 0.1, 0.38, 0.62, 'happy');
    },
    note(L, c, pal) {
      const head = new T3.SphereGeometry(0.62, 20, 14);
      head.scale(1.25, 0.85, 0.8);
      part(L, head, c, at(-0.25, -0.55, 0, 1, 0, 0, 0.35));
      const ink = pc(pal, 1, 0, 0.3);
      part(L, new T3.CylinderGeometry(0.07, 0.07, 1.7, 8), ink, at(0.45, 0.3, 0));
      part(L, new T3.TubeGeometry(new T3.CatmullRomCurve3([new T3.Vector3(0.45, 1.12, 0), new T3.Vector3(0.85, 0.85, 0), new T3.Vector3(0.95, 0.45, 0), new T3.Vector3(0.75, 0.15, 0)]), 14, 0.08, 6, false), ink);
      face(L, -0.25, -0.55, 0.42, 0.55);
    },
    drum(L, c, pal) {
      part(L, new T3.CylinderGeometry(0.85, 0.85, 1.1, 28), c);
      const rim = pc(pal, 0, 0.5);
      for (const y of [0.55, -0.55]) part(L, new T3.TorusGeometry(0.86, 0.06, 6, 32), rim, at(0, y, 0, 1, Math.PI / 2));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; part(L, new T3.CylinderGeometry(0.025, 0.025, 1.2, 4), rim, at(Math.cos(a) * 0.87, 0, Math.sin(a) * 0.87, 1, 0, 0, i % 2 ? 0.35 : -0.35)); }
      face(L, 0, 0, 0.78, 0.7);
    },
    disc(L, c, pal) {
      const a = pc(pal, 0), b = pc(pal, 1);
      const grooves = pal === 'rainbow' ? c : (x, y, z, cc) => { const r = Math.hypot(x, y); cc.copy(r < 0.32 ? b : Math.sin(r * 40) > 0.6 ? b : a); };
      part(L, new T3.CylinderGeometry(1.0, 1.0, 0.12, 40), grooves, at(0, 0, 0, 1, Math.PI / 2));
      face(L, 0, 0.05, 0.02, 0.6);
    },
    mic(L, c, pal) {
      part(L, bumpy(new T3.SphereGeometry(0.62, 22, 16), 0.02, 18), c, at(0, 0.45, 0));
      part(L, new T3.CylinderGeometry(0.2, 0.26, 1.2, 14), pc(pal, 1, 0, 0.3), at(0, -0.45, 0));
      part(L, new T3.TorusGeometry(0.62, 0.05, 6, 30), pc(pal, 0, 0.4), at(0, 0.45, 0, 1, Math.PI / 2));
      face(L, 0, 0.45, 0.48, 0.62);
    },
    angel(L, c) {
      part(L, new T3.SphereGeometry(0.75, 24, 16), c);
      part(L, new T3.TorusGeometry(0.42, 0.06, 8, 28), col('#fff2a0'), at(0, 1.0, -0.1, 1, Math.PI / 2 - 0.3));
      const w = col('#ffffff');
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
        const g = new T3.SphereGeometry(1, 14, 10);
        g.scale(0.22, 0.62 - k * 0.12, 0.08);
        part(L, g, w, at(sx * (0.8 + k * 0.18), 0.25 - k * 0.12, -0.3, 1, 0, 0, -sx * (0.7 + k * 0.35)));
      }
      face(L, 0, 0.02, 0.62, 0.78, 'happy');
    },
  };
  // 光る形・回る形
  const GLOW = new Set(['wisp', 'flame', 'sun', 'lantern', 'jelly', 'star', 'bubble']);
  const SPIN_Y = new Set(['knot', 'crystal', 'octa', 'tetra', 'dodeca', 'ico', 'prism', 'diamond', 'geode', 'ore']);
  const SPIN_Z = new Set(['gear', 'snowflake', 'disc', 'lollipop']);
  function accessory(L, acc) {
    const f = lastFace;
    if (!f || !acc) return;
    const { x, y, z, s } = f;
    if (acc === 'horns') {
      for (const sx of [-1, 1]) part(L, new T3.ConeGeometry(0.11 * s, 0.42 * s, 8), col('#fff4e0'), at(x + sx * 0.42 * s, y + 0.78 * s, z - 0.25 * s, 1, 0, 0, -sx * 0.45));
    } else if (acc === 'hat') {
      part(L, new T3.CylinderGeometry(0.5 * s, 0.5 * s, 0.05 * s, 18), col('#1a1424'), at(x, y + 0.66 * s, z - 0.3 * s, 1, -0.25));
      part(L, new T3.CylinderGeometry(0.3 * s, 0.32 * s, 0.42 * s, 16), col('#1a1424'), at(x, y + 0.88 * s, z - 0.36 * s, 1, -0.25));
      part(L, new T3.CylinderGeometry(0.325 * s, 0.335 * s, 0.09 * s, 16), col('#ff3a6a'), at(x, y + 0.72 * s, z - 0.32 * s, 1, -0.25));
    } else if (acc === 'shades') {
      for (const sx of [-1, 1]) part(L, new T3.BoxGeometry(0.34 * s, 0.2 * s, 0.06 * s), col('#0a0a12'), at(x + sx * 0.29 * s, y + 0.12 * s, z + 0.27 * s));
      part(L, new T3.BoxGeometry(0.2 * s, 0.04 * s, 0.04 * s), col('#0a0a12'), at(x, y + 0.16 * s, z + 0.28 * s));
    } else if (acc === 'halo') {
      part(L, new T3.TorusGeometry(0.4 * s, 0.05 * s, 6, 24), col('#fff2a0'), at(x, y + 0.95 * s, z - 0.25 * s, 1, Math.PI / 2 - 0.35));
    }
  }
  function shapeGeo(shape, palette, acc) {
    const k = shape + '|' + (palette === 'rainbow' ? 'rb' : palette.join(',')) + '|' + (acc || '');
    let g = geos.get(k);
    if (g) return g;
    const L = [];
    lastFace = null;
    (SHAPES[shape] || SHAPES.ball)(L, bodyCol(palette), palette);
    accessory(L, acc);
    g = merge(L);
    geos.set(k, g);
    return g;
  }
  function glowTex() {
    if (glowT) return glowT;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    glowT = new T3.CanvasTexture(c);
    return glowT;
  }

  // ------------------------------------------------------------- 菌の出現と見た目
  function palOf(ge) {
    if (ge.crit) return ['#fff8c0', '#ffb000'];
    if (ge.boss && ge.bossDef) return ge.bossDef.col;
    if (ge.v === 'gold') return ['#fff2a0', '#c88a00'];
    if (ge.v === 'rainbow') return 'rainbow';
    if (ge.v === 'armor') return ['#eef2f8', '#56606e'];
    if (ge.v === 'bomb') return ['#ff7a5a', '#2a0000'];
    if (ge.v === 'lucky') return ['#ffe0ff', '#7a1aa8'];
    if (ge.v === 'chest') return ['#ffd27a', '#6a3a10'];
    const X = GD.STRAIN && GD.STRAIN[ge.sid];
    return X ? X.pal : GM.TY[ge.type].col;
  }
  const accOf = (ge) => (ge.crit ? 'halo' : ge.boss || ge.core ? null : (GD.STRAIN && GD.STRAIN[ge.sid] && GD.STRAIN[ge.sid].acc) || null);
  let coreG = null;
  function onSpawn(ge) {
    if (!ok || objs.has(ge.id)) return;
    const t = GM.TY[ge.type];
    if (ge.core) {
      // ボスの弱点: 白く脈打つ光の核
      const m = new T3.MeshBasicMaterial({ color: '#ffffff' });
      const mesh = new T3.Mesh(coreG || (coreG = new T3.IcosahedronGeometry(1, 2)), m);
      const grp = new T3.Group();
      grp.add(mesh);
      const aura = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex(), color: '#ff3a5a', transparent: true, opacity: 0.9, blending: T3.AdditiveBlending, depthWrite: false }));
      grp.add(aura);
      grp.position.set(ge.x, ge.y, 0.4);
      scene.add(grp);
      objs.set(ge.id, { ge, grp, mesh, mat: m, aura, crown: null, t, born: time, flash: 0, sq: 0, sqAng: 0, z: 0.4, palette: ['#ffffff', '#ff2a4a'], dir: 1, isCore: true });
      return;
    }
    const palette = palOf(ge);
    const mat = new T3.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05, emissive: 0x000000 });
    if (typeof Axe3D !== 'undefined' && Axe3D.env) { mat.envMap = Axe3D.env; mat.envMapIntensity = 0.55; }
    if (ge.v === 'gold') { mat.metalness = 0.75; mat.roughness = 0.18; mat.envMapIntensity = 1.2; }
    if (ge.v === 'armor') { mat.metalness = 0.85; mat.roughness = 0.22; mat.envMapIntensity = 1.1; }
    if (ge.v === 'ghost') { mat.transparent = true; mat.opacity = 0.8; }
    const baseEm = t.shape === 'void' ? col('#5a1a8a').multiplyScalar(0.35) : GLOW.has(t.shape) && palette !== 'rainbow' ? col(palette[0]).multiplyScalar(0.32) : null;
    if (baseEm) mat.emissive.copy(baseEm);
    if (ge.crit) { mat.metalness = 0.6; mat.roughness = 0.2; mat.envMapIntensity = 1.3; }
    const mesh = new T3.Mesh(shapeGeo(ge.crit ? 'ball' : t.shape, palette, accOf(ge)), mat);
    const grp = new T3.Group();
    grp.add(mesh);
    let aura = null;
    if (ge.v || ge.boss) {
      const ac = { gold: '#ffd84a', rainbow: '#ffffff', armor: '#b0c8ff', giant: '#ff9a4a', split: '#7affb0', bomb: '#ff3a1a', lucky: '#ff6af0', chest: '#ffd27a', critter: '#fff2a0' }[ge.v] || (ge.boss ? '#ff3a5a' : '#c8a0ff');
      aura = new T3.Sprite(new T3.SpriteMaterial({ map: glowTex(), color: ac, transparent: true, opacity: 0.55, blending: T3.AdditiveBlending, depthWrite: false }));
      aura.position.z = -0.6;
      grp.add(aura);
    }
    let crown = null;
    if (ge.boss && ge.bossDef && ge.bossDef.crown) {
      const cg = new T3.CylinderGeometry(0.5, 0.42, 0.28, 10, 1, true);
      crown = new T3.Group();
      const cm = new T3.MeshStandardMaterial({ color: '#ffd45a', metalness: 0.95, roughness: 0.2, side: T3.DoubleSide, emissive: '#ff9a00', emissiveIntensity: 0.25 });
      if (Axe3D.env) { cm.envMap = Axe3D.env; cm.envMapIntensity = 1.2; }
      crown.add(new T3.Mesh(cg, cm));
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const sp = new T3.Mesh(new T3.ConeGeometry(0.1, 0.3, 5), cm); sp.position.set(Math.cos(a) * 0.46, 0.27, Math.sin(a) * 0.46); crown.add(sp); }
      crown.position.set(0, 1.05, 0);
      crown.rotation.x = 0.25;
      mesh.add(crown);
    }
    grp.position.set(ge.x, ge.y, 0);
    grp.scale.setScalar(0.001);
    scene.add(grp);
    objs.set(ge.id, { ge, grp, mesh, mat, aura, crown, t, born: time, flash: 0, sq: 0, sqAng: 0, z: (rnd() - 0.5) * 0.4, palette, face: 1, spin: rnd() * 6, dir: 1, baseEm });
  }
  function disposeObj(o) {
    scene.remove(o.grp);
    o.mat.dispose();
    if (o.aura) o.aura.material.dispose();
    if (o.crown) o.crown.traverse((x) => { if (x.isMesh) { if (x.geometry) x.geometry.dispose(); } });
  }
  function remove(id) {
    const o = objs.get(id);
    if (!o) return;
    disposeObj(o);
    objs.delete(id);
  }
  // 斬った（まだ生きている）: 白く光ってつぶれる
  function onSlice(e) {
    const o = objs.get(e.g.id);
    if (!o) return;
    o.flash = e.deflect ? 0.6 : 1;
    o.sq = e.deflect ? 0.4 : 1;
    o.sqAng = e.ang;
    const n = e.deflect ? 6 : e.killed ? 0 : 8 + e.stier * 2;
    if (n) emitDrops(e.g.x, e.g.y, n, capCol(o), 4 + e.stier, e.ang, e.g.r);
    if (e.shatter) emitDrops(e.g.x, e.g.y, 26, '#dff6ff', 9, e.ang, e.g.r);
    if (e.g.boss) { cam.shake = Math.max(cam.shake, 0.25); }
  }
  function capCol(o) {
    const ge = o.ge;
    if (ge.v === 'gold' || ge.crit) return '#fff6c0';
    if (ge.v === 'rainbow') return '#ffffff';
    if (ge.v === 'bomb') return '#ffb03a';
    if (ge.boss && ge.bossDef) return col(ge.bossDef.col[0]).lerp(cWhite, 0.4).getStyle();
    const X = GD.STRAIN && GD.STRAIN[ge.sid];
    return (X && X.cap) || o.t.cap;
  }
  // 倒した: 斬られた向きで2つに割れる（免疫細胞のときは、はじけて消える）
  const dying = [];
  let lineG = null;
  const hooks = { release: null };
  function cutLine(x, y, ang, len, w, c) {
    const g = new T3.Group();
    const mk = (cc, sw, op) => { const m = new T3.Mesh(lineG || (lineG = new T3.PlaneGeometry(1, 1)), new T3.MeshBasicMaterial({ color: cc, transparent: true, opacity: op, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide })); m.scale.set(1, sw, 1); g.add(m); return m; };
    mk(c, w * 5, 0.45);
    mk('#ffffff', w, 1);
    g.position.set(x, y, 1);
    g.rotation.z = ang;
    g.scale.set(0.001, 1, 1);
    g.userData.len = len;
    scene.add(g);
    return g;
  }
  function dropLine(g) { if (!g) return; scene.remove(g); g.children.forEach((m) => m.material.dispose()); }
  function onKill(d) {
    const o = objs.get(d.g.id);
    if (!o) return;
    objs.delete(d.g.id);
    const cc = capCol(o);
    const big = d.g.boss ? 3 : 1;
    if (d.src === 'cell' || o.isCore) {
      emitDrops(d.g.x, d.g.y, 14, cc, 3, rnd() * 6, d.g.r);
      disposeObj(o);
      return;
    }
    const hold = d.g.boss ? 0.55 : d.src === 'slice' || d.src === 'zanshin' || d.src === 'thunder' || d.src === 'ougi' ? 0.085 : 0;
    if (hold <= 0 || quality < 1) { doSplit(o, d, cc, big); return; }
    const gc = (GM.stats().eq && GM.stats().eq.glow && GM.stats().eq.glow !== 'rainbow') ? GM.stats().eq.glow : '#bfe8ff';
    const len = d.g.boss ? visW * 1.6 : d.g.r * 3;
    const item = { o, d, cc, big, t0: time, tRel: time + hold, line: cutLine(d.g.x, d.g.y, d.ang, len, d.g.boss ? 0.12 : 0.05, gc) };
    // 一閃: 斬り続けている間に倒した菌は、最後にまとめて割る
    if (d.src === 'slice') for (const x of dying) if (x.d.src === 'slice' && !x.d.g.boss) x.tRel = Math.min(x.t0 + 0.45, Math.max(x.tRel, time + 0.1));
    dying.push(item);
  }
  function releaseAll() { for (const x of dying) if (!x.d.g.boss) x.tRel = Math.min(x.tRel, time); }
  function doSplit(o, d, cc, big) {
    split(o, d.ang, cc, big);
    emitDrops(d.g.x, d.g.y, Math.round((14 + (d.issen || 1) * 3) * big * (d.g.boss ? 2.5 : 1)), cc, 7 * Math.sqrt(big), d.ang, d.g.r);
    if (d.g.boss) { cam.shake = Math.max(cam.shake, 1.6); cam.punch = Math.max(cam.punch, 0.3); boomFx({ x: d.g.x, y: d.g.y, r: d.g.r * 2.5, n: 1, boss: true }); }
    else cam.shake = Math.max(cam.shake, 0.12 + Math.min(0.5, (d.issen || 1) * 0.06));
  }
  function stepDying() {
    if (!dying.length) return;
    const out = [];
    for (let i = dying.length - 1; i >= 0; i--) {
      const x = dying[i], o = x.o, k = time - x.t0;
      o.grp.position.set(x.d.g.x + (rnd() - 0.5) * 0.07 * x.big, x.d.g.y + (rnd() - 0.5) * 0.07 * x.big, o.z);
      o.mat.emissive.setRGB(1, 1, 1).multiplyScalar(0.3 + 0.3 * Math.abs(Math.sin(k * 50)));
      if (x.line) { x.line.scale.x = Math.max(0.001, Math.min(1, k / 0.05) * x.line.userData.len); }
      if (time >= x.tRel) { dying.splice(i, 1); dropLine(x.line); doSplit(o, x.d, x.cc, x.big); out.push(x.d); }
    }
    if (out.length && hooks.release) hooks.release(out);
  }
  // 爆発: 光の球が広がる
  const flashes = [];
  let ballG = null;
  function boomFx(e) {
    if (!ok) return;
    const m = new T3.Mesh(ballG || (ballG = new T3.SphereGeometry(1, 18, 12)), new T3.MeshBasicMaterial({ color: e.boss ? '#ffffff' : '#ffb04a', transparent: true, opacity: 0.85, blending: T3.AdditiveBlending, depthWrite: false }));
    m.position.set(e.x, e.y, 0.5);
    m.scale.setScalar(0.2);
    scene.add(m);
    flashes.push({ m, t: 0, dur: e.boss ? 0.6 : 0.32, r: e.r });
    emitDrops(e.x, e.y, e.boss ? 40 : 16, e.boss ? '#ffffff' : '#ffd27a', e.boss ? 14 : 8, rnd() * 6, e.r * 0.4);
    cam.shake = Math.max(cam.shake, Math.min(1.4, 0.25 + 0.06 * (e.n || 1)));
  }
  function stepFlashes(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.t += dt;
      const p = f.t / f.dur;
      if (p >= 1) { scene.remove(f.m); f.m.material.dispose(); flashes.splice(i, 1); continue; }
      f.m.scale.setScalar(Math.max(0.01, f.r * (0.25 + 0.75 * U.ease.outCubic(p))));
      f.m.material.opacity = 0.85 * (1 - p);
    }
  }
  function split(o, ang, cc, big) {
    const nW = new T3.Vector3(-Math.sin(ang), Math.cos(ang), 0);
    const dir = new T3.Vector3(Math.cos(ang), Math.sin(ang), 0);
    for (const side of [1, -1]) {
      const plane = new T3.Plane();
      const mat = o.mat.clone();
      mat.clippingPlanes = [plane];
      mat.emissive.set('#ffffff');
      mat.emissiveIntensity = 0.35;
      mat.side = T3.FrontSide;
      const capM = new T3.MeshBasicMaterial({ color: cc, side: T3.BackSide, clippingPlanes: [plane] });
      const holder = new T3.Group();
      holder.position.copy(o.grp.position);
      const inner = new T3.Group();
      inner.scale.copy(o.mesh.scale).multiply(o.grp.scale);
      inner.rotation.copy(o.mesh.rotation);
      inner.add(new T3.Mesh(o.mesh.geometry, mat));
      inner.add(new T3.Mesh(o.mesh.geometry, capM));
      holder.add(inner);
      scene.add(holder);
      const sp = (2.4 + rnd() * 0.8) / Math.sqrt(big);
      halves.push({
        holder, inner, mats: [mat, capM], plane, n: nW.clone().multiplyScalar(side), axis: dir.clone(),
        v: nW.clone().multiplyScalar(side * sp).addScaledVector(dir, 1.2 + rnd() * 0.6), spin: side * (2.6 + rnd() * 1.4), t: 0, dur: 0.78 * Math.sqrt(big), s0: inner.scale.clone(),
      });
    }
    disposeObj(o);
  }
  function stepHalves(dt) {
    for (let i = halves.length - 1; i >= 0; i--) {
      const h = halves[i];
      h.t += dt;
      const p = h.t / h.dur;
      if (p >= 1) { scene.remove(h.holder); h.mats.forEach((m) => m.dispose()); halves.splice(i, 1); continue; }
      h.holder.position.addScaledVector(h.v, dt);
      h.v.multiplyScalar(Math.pow(0.12, dt));
      h.v.y -= 1.8 * dt;
      h.holder.rotateOnWorldAxis(h.axis, h.spin * dt);
      const k = p < 0.55 ? 1 : 1 - U.ease.inQuad((p - 0.55) / 0.45);
      h.inner.scale.copy(h.s0).multiplyScalar(Math.max(0.001, k));
      h.holder.updateMatrixWorld();
      v1.copy(h.n).applyQuaternion(h.holder.quaternion);
      h.plane.setFromNormalAndCoplanarPoint(v1, h.holder.position);
      h.mats[0].emissiveIntensity = Math.max(0, 0.35 - h.t * 1.2);
    }
  }
  // しずく
  function emitDrops(x, y, n, c, power, ang, r = 0.8) {
    if (!drops) return;
    n = Math.round(n * [0.45, 0.75, 1][quality]);
    const cc = col(c);
    for (let i = 0; i < n; i++) {
      if (DP.length >= 380) DP.shift();
      const a = ang + Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) + (rnd() - 0.5) * 1.6;
      const v = power * (0.3 + rnd() * 0.8);
      DP.push({ x: x + (rnd() - 0.5) * r * 0.8, y: y + (rnd() - 0.5) * r * 0.8, z: (rnd() - 0.2) * 0.8, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: (rnd() - 0.3) * 2, s: (0.05 + rnd() * 0.11) * Math.min(2, r * 1.2), life: 0.5 + rnd() * 0.5, max: 1, c: cc });
    }
  }
  const dM = new (window.THREE ? window.THREE.Matrix4 : Object)();
  function stepDrops(dt) {
    let n = 0;
    for (let i = DP.length - 1; i >= 0; i--) {
      const d = DP[i];
      d.life -= dt;
      if (d.life <= 0) { DP.splice(i, 1); continue; }
      d.vx *= Math.pow(0.08, dt); d.vy *= Math.pow(0.08, dt); d.vz *= Math.pow(0.08, dt);
      d.vy -= 1.4 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    }
    for (const d of DP) {
      const s = d.s * Math.min(1, d.life * 3);
      dM.makeScale(s, s, s);
      dM.setPosition(d.x, d.y, d.z);
      drops.setMatrixAt(n, dM);
      drops.setColorAt(n, d.c);
      n++;
    }
    drops.count = n;
    drops.instanceMatrix.needsUpdate = true;
    if (drops.instanceColor) drops.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------- 免疫細胞が飛んでくる
  function onCell(e) {
    if (!ok || !e.cell || dashes.length > 10 || quality < 1) return;
    const side = rnd() < 0.5 ? -1 : 1;
    const from = new T3.Vector3(side * (visW / 2 + 0.5), (rnd() - 0.3) * visH * 0.5, 0.6);
    const m = new T3.MeshStandardMaterial({ color: e.cell.col, roughness: 0.35, emissive: e.cell.col, emissiveIntensity: 0.3, transparent: true });
    if (Axe3D.env) { m.envMap = Axe3D.env; m.envMapIntensity = 0.5; }
    const mesh = new T3.Mesh(bumpGeo(), m);
    mesh.position.copy(from);
    const s = 0.32 + Math.min(0.4, GD.CELLS.indexOf(e.cell) * 0.03);
    mesh.scale.setScalar(s);
    scene.add(mesh);
    dashes.push({ mesh, m, from, to: new T3.Vector3(e.g.x, e.g.y, 0.6), t: 0, s, ge: e.g });
  }
  let cellG = null;
  const bumpGeo = () => cellG || (cellG = bumpy(new T3.IcosahedronGeometry(1, 2), 0.12, 3, 4));
  function stepDashes(dt) {
    for (let i = dashes.length - 1; i >= 0; i--) {
      const d = dashes[i];
      d.t += dt;
      if (d.ge && d.ge.alive) d.to.set(d.ge.x, d.ge.y, 0.6);
      if (d.t < 0.22) {
        const k = U.ease.inQuad(d.t / 0.22);
        d.mesh.position.lerpVectors(d.from, d.to, k);
        d.mesh.scale.set(d.s * (1 + k * 0.5), d.s * (1 - k * 0.25), d.s);
        d.mesh.rotation.z = Math.atan2(d.to.y - d.from.y, d.to.x - d.from.x);
      } else {
        const k = (d.t - 0.22) / 0.3;
        if (k >= 1) { scene.remove(d.mesh); d.m.dispose(); dashes.splice(i, 1); continue; }
        d.mesh.position.copy(d.to);
        d.mesh.scale.setScalar(d.s * (1.3 + k * 0.8));
        d.m.opacity = 1 - k;
      }
    }
  }

  // ------------------------------------------------------------- 刀
  function ensureKatana() {
    const eq = GM.stats().eq;
    const id = eq ? eq.id : '';
    if (id === katId) return;
    katId = id;
    if (kat) { kScene.remove(kat.holder); kat.P.dispose(); kat = null; }
    if (!eq || typeof Axe3D === 'undefined') return;
    const P = Axe3D.build(eq);
    const inner = new T3.Group();
    P.grp.position.set(-32, 52, 0);
    inner.add(P.grp);
    inner.scale.setScalar(1 / 34);
    const holder = new T3.Group();
    holder.add(inner);
    kScene.add(holder);
    kat = { P, holder, inner, len: (P.blade ? P.blade.L + 16 : 108) / 34 };
    hold.flourish = Math.max(hold.flourish, 0.6);
  }
  function grab(p) {
    const w = toWorld(p.x, p.y);
    hold.on = true;
    hold.tx = w.x; hold.ty = w.y; hold.px = w.x; hold.py = w.y;
  }
  function drag(p) {
    const w = toWorld(p.x, p.y);
    const dx = w.x - hold.px, dy = w.y - hold.py;
    const d = Math.hypot(dx, dy);
    if (d > 0.05) {
      const a = Math.atan2(dy, dx);
      hold.ang = lerpAng(hold.ang, a, Math.min(1, d * 0.9));
      hold.px = w.x; hold.py = w.y;
    }
    hold.tx = w.x; hold.ty = w.y;
  }
  function release() { hold.on = false; }
  const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
  function updateKatana(dt, real) {
    ensureKatana();
    if (!kat) return;
    let gx, gy, ang;
    if (hold.on) {
      // 切っ先が指の所に来るように、振っている向きに刀身を寝かせる
      ang = hold.ang;
      const L = kat.len * 0.85;
      gx = hold.tx - Math.cos(ang) * L;
      gy = hold.ty - Math.sin(ang) * L;
    } else {
      // 構え: 右下で切っ先を左上に向けて待つ
      ang = 2.05 + Math.sin(time * 1.1) * 0.05;
      gx = visW / 2 - 1.3;
      gy = -visH / 2 + 2.2 + Math.sin(time * 1.6) * 0.08;
    }
    const k = 1 - Math.exp(-real * (hold.on ? 40 : 8));
    hold.x += (gx - hold.x) * k;
    hold.y += (gy - hold.y) * k;
    const h = kat.holder;
    h.position.set(hold.x, hold.y, 1.8);
    hold.flourish = Math.max(0, hold.flourish - real * 1.4);
    const fl = hold.flourish > 0 ? U.ease.outCubic(1 - hold.flourish) * Math.PI * 2 * (hold.flourish > 0 ? 1 : 0) : 0;
    h.rotation.set(0, 0, 0);
    h.rotateZ(ang - Math.PI / 2 + fl);
    h.rotateY(0.55 + Math.sin(time * 0.8) * 0.1);
    h.scale.setScalar(1 + musouMix * 0.25 + rankMix * 0.06);
    kat.P.tick(time, real, hold.on ? 1 : 0);
  }
  // 奥義: 刀が回って光る
  function ougi() { hold.flourish = 1; cam.punch = Math.max(cam.punch, 0.2); lightBoost = 1.5; lightCol.set('#ffffff'); }

  // ------------------------------------------------------------- フレーム
  function frame(dt, real) {
    if (!ok) return;
    time += dt;
    bgU.t.value = time;
    ensureBiome();
    const T = GM.T;
    outMix += ((T.outbreak > 0 ? 1 : 0) - outMix) * Math.min(1, real * 3);
    bossMix += ((T.boss ? 1 : 0) - bossMix) * Math.min(1, real * 2);
    bgU.swirl.value = outMix * Math.sin(time * 0.7) * 0.6 + (warpT > 0 ? warpT * 6 : 0);
    if (pal && pal.rainbow) { cTmp.setHSL((time * 0.05) % 1, 0.6, 0.35); bgU.top.value.copy(cTmp); }
    if (outMix > 0.01) {
      // 大発生: 背景が毒々しく脈打つ
      cTmp.set(pal.bg[1]).lerp(col('#2aff6a'), outMix * (0.35 + 0.15 * Math.sin(time * 8)));
      bgU.bot.value.copy(cTmp);
    } else if (pal) bgU.bot.value.set(pal.bg[1]);
    lightBoost = Math.max(0, lightBoost - real * 4);
    hemi.intensity = 0.85 + lightBoost * 0.6 + outMix * 0.15;
    key.intensity = 0.95 + lightBoost * 0.4;
    stepDying();
    stepFlashes(dt);
    rankMix += (rankTarget - rankMix) * Math.min(1, real * 2);
    const mu = GM.T.musou > 0;
    musouMix += ((mu ? 1 : 0) - musouMix) * Math.min(1, real * 3);
    if (pal && !pal.rainbow) bgU.top.value.set(pal.bg[0]);
    if (rankMix > 0.01 || musouMix > 0.01) {
      if (rankRainbow || musouMix > 0.01) rankCol.setHSL((time * (mu ? 0.5 : 0.2)) % 1, 0.9, 0.6);
      bgU.hi.value.copy(col(pal ? pal.light : '#ffffff')).lerp(rankCol, Math.max(rankMix * 0.7, musouMix));
      bgU.top.value.lerp(rankCol, Math.max(rankMix * 0.25, musouMix * 0.45));
      hemi.intensity += rankMix * 0.25 + musouMix * 0.35;
    } else if (pal) bgU.hi.value.set(pal.light);
    // 菌（まだ形のない菌がいたら作る）
    if (objs.size < T.germs.length) for (const ge of T.germs) if (ge.alive && !objs.has(ge.id)) onSpawn(ge);
    for (const [id, o] of objs) {
      const ge = o.ge;
      if (!ge.alive && !ge.flee) { remove(id); continue; }
      const age = time - o.born;
      const pop = age < 0.4 ? Math.max(0.001, U.ease.outElastic(Math.min(1, age / 0.4))) : 1;
      o.grp.position.set(ge.x, ge.y, o.z);
      o.grp.scale.setScalar(pop);
      o.flash = Math.max(0, o.flash - real * 5);
      o.sq = Math.max(0, o.sq - real * 5);
      const r = ge.r;
      const w = Math.sin(time * (ge.boss ? 2 : 4) + ge.ph * 6.28) * 0.06;
      // 斬られた向きにつぶれる
      const sq = o.sq * 0.35;
      const ca = Math.cos(o.sqAng), sa = Math.sin(o.sqAng);
      const sx = 1 + w - sq * Math.abs(sa) + sq * 0.5 * Math.abs(ca), sy = 1 - w - sq * Math.abs(ca) + sq * 0.5 * Math.abs(sa);
      const vx = ge.vx;
      if (Math.abs(vx) > 0.25) o.dir = vx >= 0 ? 1 : -1;
      const shape = o.t.shape;
      o.mesh.scale.set(r * sx * o.dir, r * sy, r);
      if (shape === 'rod' || shape === 'comma' || shape === 'slipper' || shape === 'spiral' || shape === 'chain') o.mesh.rotation.z = Math.max(-0.6, Math.min(0.6, Math.atan2(ge.vy, Math.abs(vx) + 0.01))) * o.dir * 0.8 + Math.sin(time * 3 + ge.ph * 9) * 0.08;
      else o.mesh.rotation.z = Math.sin(time * 1.3 + ge.ph * 6) * 0.15;
      o.mesh.rotation.y = Math.sin(time * 0.9 + ge.ph * 4) * 0.35;
      // 刀が近づくと震えて縮こまる
      const near = hold.on && Math.hypot(hold.tx - ge.x, hold.ty - ge.y) < ge.r + 1.4;
      o.fear = Math.max(0, (o.fear || 0) + (near ? real * 6 : -real * 3));
      if (o.fear > 0.01) { o.fear = Math.min(1, o.fear); o.mesh.rotation.z += (rnd() - 0.5) * 0.25 * o.fear; o.mesh.scale.multiplyScalar(1 - 0.08 * o.fear); }
      if (o.isCore) { const k = 1 + 0.25 * Math.sin(time * 14); o.mesh.scale.setScalar(ge.r * k); o.aura.scale.setScalar(ge.r * 4.5 * k); }
      if (SPIN_Y.has(shape)) o.mesh.rotation.y += time * 0.6;
      else if (SPIN_Z.has(shape)) o.mesh.rotation.z += time * 0.8 + ge.ph * 6;
      if (o.isCore) continue;
      // 光り方
      const m = o.mat;
      if (ge.v === 'rainbow') m.emissive.setHSL((time * 0.5) % 1, 1, 0.45);
      else if (ge.v === 'gold') m.emissive.copy(cGold).multiplyScalar(0.35 + 0.15 * Math.sin(time * 6));
      else if (ge.v === 'split') m.emissive.set('#3aff8a').multiplyScalar(0.15 + 0.15 * Math.sin(time * 5));
      else if (ge.boss) m.emissive.set('#ff2040').multiplyScalar(GM.T.bossTimer < 8 ? 0.25 + 0.25 * Math.sin(time * 14) : 0.05 + 0.12 * ge.phase * (0.6 + 0.4 * Math.sin(time * 6)));
      else if (ge.v === 'bomb') m.emissive.set('#ff3a00').multiplyScalar(0.25 + 0.35 * Math.max(0, Math.sin(time * 9 + ge.ph * 6)));
      else if (ge.v === 'lucky' || ge.crit) m.emissive.setHSL((time * 0.6 + ge.ph) % 1, 1, 0.4);
      else if (o.baseEm) m.emissive.copy(o.baseEm);
      else m.emissive.setRGB(0, 0, 0);
      if (ge.frozen > 0) m.emissive.set('#7ad8ff').multiplyScalar(0.55);
      if (ge.burn) m.emissive.set('#ff6a1a').multiplyScalar(0.35 + 0.25 * Math.sin(time * 22 + ge.ph * 9));
      if (o.flash > 0.01) m.emissive.lerp(cWhite, o.flash * 0.85);
      if (ge.v === 'ghost') { const hid = GM.ghostHidden(ge); m.opacity += ((hid ? 0.12 : 0.85) - m.opacity) * Math.min(1, real * 10); }
      if (o.aura) {
        o.aura.scale.setScalar(r * (ge.boss ? 3.4 : 2.9) * (1 + 0.08 * Math.sin(time * 5 + ge.ph * 6)));
        if (ge.v === 'rainbow') o.aura.material.color.setHSL((time * 0.4) % 1, 1, 0.7);
      }
    }
    stepHalves(dt);
    stepDrops(dt);
    stepDashes(dt);
    stepAmb(dt);
    updateKatana(dt, real);
    if (warpT > 0) warpT = Math.max(0, warpT - real * 1.6);
    // カメラ
    cam.shake = Math.max(0, cam.shake - real * 2.6);
    cam.punch *= Math.pow(0.003, real);
    cam.roll *= Math.pow(0.004, real);
    const sway = 0.12;
    camera.position.set(Math.sin(time * 0.31) * sway, Math.sin(time * 0.23) * sway * 0.6, camZ * (1 + bossMix * 0.03) * (1 + warpT * 0.6));
    if (cam.shake > 0.01 && allowShake) {
      camera.position.x += (rnd() - 0.5) * cam.shake * 0.4;
      camera.position.y += (rnd() - 0.5) * cam.shake * 0.3;
    }
    camera.lookAt(0, 0, 0);
    if (Math.abs(cam.roll) > 0.0005 && allowShake) camera.rotateZ(cam.roll);
    camera.fov = 40 * (1 - Math.min(0.3, cam.punch)) * (1 + warpT * 0.4);
    camera.updateProjectionMatrix();
    R.render(scene, camera);
    R.autoClear = false;
    R.render(kScene, camera);
    R.autoClear = true;
  }
  let warpT = 0;
  let rankMix = 0, rankTarget = 0, rankRainbow = false, musouMix = 0;
  const rankCol = new (window.THREE ? window.THREE.Color : Object)();
  function setRank(r, c, rainbow) { rankTarget = r >= 3 ? Math.min(1, (r - 2) / 5) : 0; rankRainbow = !!rainbow; if (!rainbow && rankCol.set) rankCol.set(c); }
  function warp() { warpT = 1; cam.punch = 0.4; }
  function reset() {
    for (const [id] of objs) remove(id);
    for (const h of halves) { scene.remove(h.holder); h.mats.forEach((m) => m.dispose()); }
    halves.length = 0;
    DP.length = 0;
    for (const d of dashes) { scene.remove(d.mesh); d.m.dispose(); }
    dashes.length = 0;
    for (const x of dying) { dropLine(x.line); disposeObj(x.o); }
    dying.length = 0;
    for (const f of flashes) { scene.remove(f.m); f.m.material.dispose(); }
    flashes.length = 0;
    biomeIdx = -1;
  }
  function bind() {
    G.on('gSpawn', onSpawn);
    G.on('gSlice', onSlice);
    G.on('gKill', onKill);
    G.on('gCell', onCell);
    G.on('gGone', (ge) => remove(ge.id));
    G.on('gEscape', (ge) => remove(ge.id));
    G.on('gZanshin', (e) => onSlice({ g: e.g, ang: e.ang, stier: 2, killed: e.g.hp <= 0 }));
    G.on('gOugi', ougi);
    G.on('gBoom', boomFx);
    G.on('gIssen', releaseAll);
    G.on('dim', () => reset());
    G.on('load', () => reset());
  }
  function shake(v) { if (allowShake) cam.shake = Math.min(1.8, cam.shake + v); }
  function punch(v) { cam.punch = Math.max(cam.punch, v); }
  function roll(v) { if (Math.abs(v) > Math.abs(cam.roll)) cam.roll = v; }
  function flashLight(c, amt) { lightCol.set(c); lightBoost = Math.max(lightBoost, amt); }

  return {
    get ok() { return ok; },
    init(r) { const res = init(r); if (res) bind(); return res; },
    resize, setQuality, frame, toScreen, toWorld, germScreen, grab, drag, release, shake, punch, roll, flashLight, warp, emitDrops, setRank, releaseAll, hooks,
    get holdInfo() { return { on: hold.on, x: hold.tx, y: hold.ty }; },
    get ppu() { return ppu; },
    get debug() { return { halves: halves.length, objs: objs.size, drops: DP.length, kids: scene ? scene.children.length : 0, clip: R && R.localClippingEnabled }; },
    biomeName: () => (pal ? pal.name : GD.BIOMES[0].name),
    biomePal,
    katanaTip() { if (!kat) return null; return toScreen(hold.tx, hold.ty); },
  };
})();
