'use strict';
// =====================================================================
//  world.js — 画面いっぱいの3D伐採シーン（Three.js r128）
//  ・木: 切り株と上部に分かれた幹＋樹冠。ダメージで切り込みが深くなり、
//        倒れると切り株の年輪が見える
//  ・斧: 指（マウス）に追従。命中時は幹に食い込んで一瞬止まる
//  ・木片・葉・コインは InstancedMesh でまとめて描く
// =====================================================================
const World = (() => {
  const T3 = window.THREE;
  let ok = false;
  let renderer = null, scene = null, camera = null;
  let W = 1, H = 1;
  let time = 0, wtime = 0, quality = 2, allowShake = true;
  let dynScale = 1, perfT = 0, perfAcc = 0, perfN = 0; // 重い端末では描画解像度を自動で下げる
  let v1, v2, m4, q4, e3, s3, cTmp, cWhite, raycaster, plane, ndc;

  let sky = null, skyU = null, ground = null, groundMat = null, scenery = null;
  let amb = null, ambPos = null, ambVel = null, ambMat = null, ambType = 'leaf';
  let hemi = null, sun = null, lightBoost = 0, lightCol = null, hemiBase = 0.95;
  let cur = null;
  const fallers = [];
  let band = null, arrows = [];
  let axe = null, axeKey = '', axeScene = null, axeLights = null, onAxeChange = null, warmT = 0, warmAcc = 0;
  const hold = { on: false, x: 0, y: 0, ax: 0, ay: 0, az: 0, mirror: 1, tilt: 0, stick: 0, sx: 0, sy: 0, sz: 0, vx: 0, vy: 0, pt: 0, grabT: 0 };
  let workers = [], workerKey = '';
  const emojiTex = new Map();
  let chips = null, leaves = null, coins = null;
  const P = { chips: [], leaves: [], coins: [] };
  const blasts = [];
  const cam = { base: null, look: null, fovBase: 48, shake: 0, punch: 0, kick: 0, dolly: 0 };
  let pal = null, palIdx = -1;
  let tex = {}, geo = {};
  let feverMix = 0, goldenMix = 0, bossMix = 0;
  let onLanded = null;
  const WOOD = { r: 0.96, g: 0.85, b: 0.64 };

  const rnd = Math.random;
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ------------------------------------------------------------- パレット（バイオーム）
  const palMemo = new Map();
  function palette(idx) {
    if (palMemo.has(idx)) return palMemo.get(idx);
    const b = D.BIOMES[idx % D.BIOMES.length];
    const loop = Math.floor(idx / D.BIOMES.length);
    let p;
    if (!loop) p = Object.assign({ loop: 0 }, b);
    else {
      const deg = (loop * 67) % 360;
      const sh = (c) => U.shiftHue(c, deg);
      p = Object.assign({}, b, {
        loop, name: `異界${loop > 1 ? loop : ''}・${b.name}`,
        sky: b.sky.map(sh), hills: b.hills.map(sh), ground: sh(b.ground), trunk: sh(b.trunk), leaves: b.leaves.map(sh),
      });
    }
    palMemo.set(idx, p);
    return p;
  }

  // ------------------------------------------------------------- 初期化
  function init(canvas) {
    if (!T3) return false;
    try {
      renderer = new T3.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      console.warn('WebGL を使えない', e);
      return false;
    }
    ok = true;
    v1 = new T3.Vector3(); v2 = new T3.Vector3(); m4 = new T3.Matrix4(); q4 = new T3.Quaternion();
    e3 = new T3.Euler(); s3 = new T3.Vector3(); cTmp = new T3.Color(); cWhite = new T3.Color(1, 1, 1);
    raycaster = new T3.Raycaster(); plane = new T3.Plane(new T3.Vector3(0, 0, 1), 0); ndc = new T3.Vector2();
    lightCol = new T3.Color();
    scene = new T3.Scene();
    camera = new T3.PerspectiveCamera(48, 1, 0.1, 500);
    cam.base = new T3.Vector3(0, 3.6, 12);
    cam.look = new T3.Vector3(0, 2.9, 0);
    hemi = new T3.HemisphereLight(0xffffff, 0x445533, 0.95);
    scene.add(hemi);
    sun = new T3.DirectionalLight(0xfff2d8, 0.9);
    sun.position.set(7, 12, 9);
    scene.add(sun);
    const fill = new T3.DirectionalLight(0xffffff, 0.28);
    fill.position.set(-8, 5, 7);
    scene.add(fill);
    makeTextures();
    makeGeometries();
    skyU = { top: { value: new T3.Color('#69c6ff') }, bottom: { value: new T3.Color('#d6f3ff') } };
    sky = new T3.Mesh(new T3.SphereGeometry(300, 24, 16), new T3.ShaderMaterial({
      uniforms: skyU, side: T3.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.7 + 0.12, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }',
    }));
    scene.add(sky);
    groundMat = new T3.MeshStandardMaterial({ color: 0x4a9a52, roughness: 1, flatShading: true });
    const gg = new T3.CircleGeometry(160, 48, 0, Math.PI * 2);
    const gp = gg.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), y = gp.getY(i);
      const r = Math.hypot(x, y);
      if (r > 9) gp.setZ(i, (rnd() - 0.5) * Math.min(2.4, (r - 9) * 0.08));
    }
    gg.computeVertexNormals();
    ground = new T3.Mesh(gg, groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    makeParticles();
    makeBand();
    makeAmbient();
    // 斧は別のシーンに置き、専用のスタジオ照明＋映り込みで描く（背景の色を拾わない）
    axeScene = new T3.Scene();
    if (typeof Axe3D !== 'undefined') { Axe3D.init(renderer); axeLights = Axe3D.studio(axeScene); }
    resize();
    return true;
  }

  function makeTextures() {
    // 樹皮（縦の筋）
    let c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    let g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 46; i++) { g.fillStyle = `rgba(0,0,0,${0.06 + rnd() * 0.2})`; g.fillRect(rnd() * 64, 0, 1 + rnd() * 4, 256); }
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.16})`; g.fillRect(rnd() * 64, rnd() * 256, 2 + rnd() * 9, 1 + rnd() * 3); }
    tex.bark = new T3.CanvasTexture(c);
    tex.bark.wrapS = tex.bark.wrapT = T3.RepeatWrapping;
    tex.bark.repeat.set(2, 1);
    // 年輪（切り口）
    c = document.createElement('canvas');
    c.width = c.height = 256;
    g = c.getContext('2d');
    g.fillStyle = '#f2d39b';
    g.fillRect(0, 0, 256, 256);
    for (let r = 5; r < 120; r += 5 + rnd() * 5) {
      g.strokeStyle = `rgba(150,95,40,${0.3 + rnd() * 0.35})`;
      g.lineWidth = 1.5 + rnd() * 1.6;
      g.beginPath(); g.arc(128 + (rnd() - 0.5) * 3, 128 + (rnd() - 0.5) * 3, r, 0, 7); g.stroke();
    }
    g.strokeStyle = '#6b4220';
    g.lineWidth = 12;
    g.beginPath(); g.arc(128, 128, 122, 0, 7); g.stroke();
    tex.ring = new T3.CanvasTexture(c);
    // 丸い点（環境パーティクル）
    c = document.createElement('canvas');
    c.width = c.height = 64;
    g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.8)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 64, 64);
    tex.dot = new T3.CanvasTexture(c);
  }
  function makeGeometries() {
    geo.ico = new T3.IcosahedronGeometry(1, 1);
    geo.ico0 = new T3.IcosahedronGeometry(1, 0);
    geo.cone = new T3.ConeGeometry(1, 1, 9, 1);
    geo.sphere = new T3.SphereGeometry(1, 14, 10);
    geo.hemi = new T3.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.octa = new T3.OctahedronGeometry(1, 0);
    geo.box = new T3.BoxGeometry(1, 1, 1);
    geo.cyl = new T3.CylinderGeometry(1, 1, 1, 10, 1);
    geo.band = new T3.CylinderGeometry(1, 1, 1, 32, 1, true);
  }

  // ------------------------------------------------------------- 画面サイズとカメラ
  function resize() {
    if (!ok) return;
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, [1, 1.5, 2][quality] || 2) * dynScale));
    renderer.setSize(W, H, false);
    const aspect = W / Math.max(1, H);
    camera.aspect = aspect;
    cam.fovBase = aspect < 0.8 ? 54 : 46;
    // 木（高さ ~8.5）と左右の余白（幅 ~6.8）が収まる距離
    const tanV = Math.tan((cam.fovBase * Math.PI) / 360);
    const dist = Math.max(9.6 / 2 / tanV, 7.2 / 2 / (tanV * aspect));
    cam.base.set(0, 3.3 + dist * 0.06, dist);
    cam.look.set(0, aspect < 0.8 ? 3.0 : 3.25, 0);
    camera.fov = cam.fovBase;
    camera.updateProjectionMatrix();
  }
  function setQuality(settings) {
    const night = document.body.classList.contains('night');
    const rm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const q = night ? Math.min(1, settings.fx) : settings.fx;
    allowShake = settings.shake && !night && !rm;
    if (q !== quality) { quality = q; resize(); }
  }

  // ------------------------------------------------------------- 背景（バイオーム）
  function applyBiome(idx) {
    palIdx = idx;
    pal = palette(idx);
    skyU.top.value.set(pal.sky[0]);
    skyU.bottom.value.set(pal.sky[1]);
    scene.fog = new T3.Fog(new T3.Color(pal.sky[1]), 26, 150);
    groundMat.color.set(pal.ground);
    hemi.color.set(pal.night ? '#9aa0d0' : '#ffffff');
    hemi.groundColor.set(pal.ground);
    hemiBase = pal.night ? 0.8 : 0.95;
    sun.color.set(pal.night ? '#a8b0ff' : '#fff2d8');
    sun.intensity = pal.night ? 0.55 : 0.9;
    buildScenery(idx);
    ambType = pal.amb;
    const ac = { leaf: pal.leaves[2], maple: '#ff8a2a', snow: '#ffffff', sand: '#fff0c8', petal: '#ffc0dc', spore: '#e6b0ff', ember: '#ffa040', sparkle: '#a8f8ff', cloud: '#ffffff', star: '#ffffff' }[ambType] || '#ffffff';
    ambMat.color.set(ac);
    ambMat.blending = ambType === 'ember' || ambType === 'sparkle' || ambType === 'star' || ambType === 'spore' ? T3.AdditiveBlending : T3.NormalBlending;
    ambMat.size = ambType === 'cloud' ? 1.6 : ambType === 'snow' ? 0.2 : 0.17;
    ambMat.needsUpdate = true;
    for (let i = 0; i < ambPos.length / 3; i++) resetAmb(i, true);
  }
  function buildScenery(idx) {
    if (scenery) {
      scene.remove(scenery.grp);
      scenery.mats.forEach((m) => m.dispose());
    }
    const grp = new T3.Group();
    const mats = [];
    const rng = mulberry(idx * 7919 + 3);
    const mk = (o) => { const m = new T3.MeshStandardMaterial(Object.assign({ flatShading: true, roughness: 1 }, o)); mats.push(m); return m; };
    const hillMats = [mk({ color: pal.hills[0] }), mk({ color: pal.hills[1] })];
    for (let i = 0; i < 18; i++) {
      const a = Math.PI * (0.05 + rng() * 0.9) + Math.PI; // 奥側
      const r = 55 + rng() * 45;
      const m = new T3.Mesh(geo.ico0, hillMats[i % 2]);
      m.position.set(Math.cos(a) * r, -3, Math.sin(a) * r);
      m.scale.set(14 + rng() * 18, 7 + rng() * 16, 12 + rng() * 14);
      m.rotation.y = rng() * 3;
      grp.add(m);
    }
    const leafM = mk({ color: pal.leaves[1] }), trunkM = mk({ color: pal.trunk }), rockM = mk({ color: pal.night ? '#5a5a70' : '#8d8a84' });
    const capM = mk({ color: pal.leaves[0] });
    for (let i = 0; i < 26; i++) {
      let x = (rng() - 0.5) * 60, z = -6 - rng() * 38;
      if (Math.abs(x) < 6 && z > -10) x += 10 * (x < 0 ? -1 : 1);
      const s = 0.7 + rng() * 1.6;
      if (rng() < 0.72) {
        const t = new T3.Mesh(geo.cyl, trunkM);
        t.scale.set(0.18 * s, 1.4 * s, 0.18 * s);
        t.position.set(x, 0.7 * s, z);
        grp.add(t);
        let top;
        if (pal.shape === 'conifer' || pal.shape === 'palm') { top = new T3.Mesh(geo.cone, leafM); top.scale.set(1.1 * s, 2.6 * s, 1.1 * s); top.position.set(x, 2.3 * s, z); }
        else if (pal.shape === 'mushroom') { top = new T3.Mesh(geo.hemi, capM); top.scale.set(1.2 * s, 0.9 * s, 1.2 * s); top.position.set(x, 1.35 * s, z); }
        else if (pal.shape === 'crystal') { top = new T3.Mesh(geo.octa, leafM); top.scale.set(0.5 * s, 1.6 * s, 0.5 * s); top.position.set(x, 2.2 * s, z); }
        else { top = new T3.Mesh(geo.ico, leafM); top.scale.setScalar(1.15 * s); top.position.set(x, 2.1 * s, z); }
        grp.add(top);
      } else {
        const r = new T3.Mesh(geo.ico0, rockM);
        r.scale.set(0.7 * s, 0.45 * s, 0.6 * s);
        r.position.set(x, 0.2 * s, z);
        r.rotation.set(rng() * 3, rng() * 3, 0);
        grp.add(r);
      }
    }
    const celM = new T3.MeshBasicMaterial({ color: pal.night ? '#fff6dc' : '#fffbe6', fog: false });
    mats.push(celM);
    const cel = new T3.Mesh(geo.sphere, celM);
    cel.position.set(-40 + rng() * 80, 55 + rng() * 15, -170);
    cel.scale.setScalar(pal.night ? 6 : 10);
    grp.add(cel);
    scene.add(grp);
    scenery = { grp, mats };
  }
  function makeAmbient() {
    const n = 150;
    ambPos = new Float32Array(n * 3);
    ambVel = new Float32Array(n * 3);
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.BufferAttribute(ambPos, 3));
    ambMat = new T3.PointsMaterial({ size: 0.17, map: tex.dot, transparent: true, depthWrite: false, color: 0xffffff, sizeAttenuation: true });
    amb = new T3.Points(g, ambMat);
    amb.frustumCulled = false;
    scene.add(amb);
  }
  function resetAmb(i, anywhere) {
    const t = ambType;
    let x = (rnd() - 0.5) * 26, y = anywhere ? rnd() * 13 : 13, z = -10 + rnd() * 16;
    let vx = (rnd() - 0.5) * 0.6, vy = -(0.5 + rnd() * 0.8), vz = 0;
    if (t === 'snow') vy = -(0.4 + rnd() * 0.5);
    else if (t === 'sand') { vx = 2 + rnd() * 3; vy = -0.1; if (!anywhere) { x = -13; y = rnd() * 6; } }
    else if (t === 'ember' || t === 'spore') { vy = 0.6 + rnd() * 1.0; if (!anywhere) y = 0; }
    else if (t === 'sparkle' || t === 'star') { vx = 0; vy = 0; y = 1 + rnd() * 14; z = -16 + rnd() * 16; }
    else if (t === 'cloud') { vx = 0.4 + rnd() * 0.5; vy = 0; y = 7 + rnd() * 6; z = -20 + rnd() * 8; if (!anywhere) x = -15; }
    ambPos[i * 3] = x; ambPos[i * 3 + 1] = y; ambPos[i * 3 + 2] = z;
    ambVel[i * 3] = vx; ambVel[i * 3 + 1] = vy; ambVel[i * 3 + 2] = vz;
  }
  function stepAmbient(dt) {
    const n = ambPos.length / 3;
    const sway = ambType === 'leaf' || ambType === 'maple' || ambType === 'petal';
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      ambPos[k] += (ambVel[k] + (sway ? Math.sin(time * 1.4 + i) * 0.5 : 0)) * dt;
      ambPos[k + 1] += ambVel[k + 1] * dt;
      ambPos[k + 2] += ambVel[k + 2] * dt;
      if (ambPos[k + 1] < -0.2 || ambPos[k + 1] > 15 || ambPos[k] > 15 || ambPos[k] < -15) resetAmb(i, false);
    }
    amb.geometry.attributes.position.needsUpdate = true;
    if (ambType === 'star' || ambType === 'sparkle') ambMat.opacity = 0.6 + 0.4 * Math.sin(time * 3);
  }

  // ------------------------------------------------------------- 木の組み立て
  function trunkPart(rBottom, rTop, h, y0, segs, barkMat, capMat, barkCol) {
    const g = new T3.CylinderGeometry(rTop, rBottom, h, 18, segs, false);
    g.translate(0, y0 + h / 2, 0);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = 0.82 + rnd() * 0.3;
      col[i * 3] = barkCol.r * v; col[i * 3 + 1] = barkCol.g * v; col[i * 3 + 2] = barkCol.b * v;
    }
    g.setAttribute('color', new T3.BufferAttribute(col, 3));
    const mesh = new T3.Mesh(g, [barkMat, capMat, capMat]);
    return { mesh, g, base: Float32Array.from(g.attributes.position.array), baseCol: Float32Array.from(col) };
  }
  function leafMaterials(tree) {
    const id = tree.rar.id;
    const mk = (c, o) => new T3.MeshStandardMaterial(Object.assign({ color: c, flatShading: true, roughness: 0.85 }, o));
    let ms;
    if (id === 'gold') ms = ['#ffd23a', '#e0a000', '#fff0a0'].map((c) => mk(c, { metalness: 0.4, roughness: 0.35, emissive: new T3.Color('#6a4200'), emissiveIntensity: 0.7 }));
    else if (id === 'silver') ms = ['#e8eef6', '#aab8c8', '#ffffff'].map((c) => mk(c, { metalness: 0.45, roughness: 0.3, emissive: new T3.Color('#3a4250'), emissiveIntensity: 0.5 }));
    else if (id === 'rainbow') ms = [0, 1, 2].map(() => mk('#ffffff', { emissive: new T3.Color('#ff00ff'), emissiveIntensity: 0.6, roughness: 0.5 }));
    else {
      ms = pal.leaves.map((c) => mk(c));
      if (pal.shape === 'crystal') ms.forEach((m) => { m.transparent = true; m.opacity = 0.9; m.emissive = m.color.clone().multiplyScalar(0.5); m.roughness = 0.2; m.metalness = 0.15; });
      if (pal.deco === 'ember') ms.forEach((m) => { m.emissive = new T3.Color('#a02000'); m.emissiveIntensity = 0.55; });
      if (pal.deco === 'stars') ms.forEach((m) => { m.emissive = m.color.clone(); m.emissiveIntensity = 0.4; });
      if (pal.deco === 'cloud') ms.forEach((m) => { m.roughness = 1; });
    }
    if (tree.boss) ms.forEach((m) => { m.color.multiplyScalar(0.72); m.emissive = new T3.Color('#500000'); m.emissiveIntensity = 0.6; });
    ms.forEach((m) => { m.userData.baseEm = m.emissive.clone(); m.userData.baseEi = m.emissiveIntensity; });
    return ms;
  }

  function buildTree(tree) {
    const rng = mulberry(tree.seed);
    const k = (tree.boss ? 1.32 : 1) * (0.92 + rng() * 0.16);
    const h = 4.3 * k;
    const r0 = 0.56 * k * (0.92 + rng() * 0.16) * (pal.shape === 'mushroom' ? 1.25 : 1);
    const r1 = r0 * (pal.shape === 'mushroom' ? 0.92 : 0.64);
    const ny = h * 0.27, nh = 0.42 * k;
    const rAt = (y) => r0 + (r1 - r0) * (y / h);
    const mats = [], geos = [];
    const barkMat = new T3.MeshStandardMaterial({ color: 0xffffff, map: tex.bark, vertexColors: true, roughness: 0.95, flatShading: true });
    barkMat.userData.baseEm = new T3.Color(0, 0, 0);
    barkMat.userData.baseEi = 1;
    if (pal.shape === 'crystal') { barkMat.emissive = new T3.Color('#1a6a80'); barkMat.userData.baseEm = barkMat.emissive.clone(); }
    const capMat = new T3.MeshStandardMaterial({ map: tex.ring, roughness: 0.9 });
    mats.push(barkMat, capMat);
    const trunkCol = new T3.Color(pal.shape === 'crystal' ? '#c8f6ff' : pal.trunk);
    if (tree.boss) trunkCol.multiplyScalar(0.75);
    const root = new T3.Group();
    const stump = trunkPart(r0, rAt(ny), ny, 0, 10, barkMat, capMat, trunkCol);
    const upperT = trunkPart(rAt(ny), r1, h - ny, ny, 20, barkMat, capMat, trunkCol);
    geos.push(stump.g, upperT.g);
    root.add(stump.mesh);
    const pivot = new T3.Group();
    pivot.position.y = ny;
    root.add(pivot);
    const upper = new T3.Group();
    upper.position.y = -ny;
    pivot.add(upper);
    upper.add(upperT.mesh);
    const lm = leafMaterials(tree);
    mats.push(...lm);
    const canopy = new T3.Group();
    upper.add(canopy);
    let top = h + 2;
    const add = (g, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
      const m = new T3.Mesh(g, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
      m.rotation.set(rx, ry, rz);
      canopy.add(m);
      return m;
    };
    const shape = pal.shape;
    if (shape === 'conifer') {
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const rad = (2.05 - i * 0.42) * k, hh = 1.75 * k;
        const y = h - 0.55 * k + i * 0.95 * k + hh / 2;
        add(geo.cone, lm[i % 2], 0, y, 0, rad, hh, rad, 0, rng() * 3, 0);
        if (pal.deco === 'snow' && tree.rar.id === 'normal') {
          const sm = new T3.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.6 });
          sm.userData.baseEm = new T3.Color(0, 0, 0); sm.userData.baseEi = 1;
          mats.push(sm);
          add(geo.cone, sm, 0, y + hh * 0.28, 0, rad * 0.52, hh * 0.46, rad * 0.52);
        }
        top = y + hh / 2;
      }
      if (pal.deco === 'ember') {
        const em = new T3.MeshBasicMaterial({ color: '#ffd060' });
        mats.push(em);
        for (let i = 0; i < 14; i++) { const a = rng() * 6.28, y = h + rng() * 3.2 * k, r = (1.8 - (y - h) * 0.4) * k * rng(); add(geo.sphere, em, Math.cos(a) * r, y, Math.sin(a) * r, 0.07 * k); }
      }
    } else if (shape === 'palm') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
        const m = add(geo.ico, lm[i % 3], Math.cos(a) * 1.25 * k, h + 0.1 * k, Math.sin(a) * 1.25 * k, 0.5 * k, 0.13 * k, 1.75 * k);
        m.rotation.order = 'YXZ';
        m.rotation.set(0.42 + rng() * 0.2, Math.PI / 2 - a, 0); // 外向きに伸ばして垂らす
      }
      const nut = new T3.MeshStandardMaterial({ color: '#6b4320', flatShading: true });
      nut.userData.baseEm = new T3.Color(0, 0, 0); nut.userData.baseEi = 1;
      mats.push(nut);
      for (let i = 0; i < 3; i++) add(geo.sphere, nut, (i - 1) * 0.28 * k, h - 0.15 * k, 0.25 * k, 0.2 * k);
      top = h + 0.8 * k;
    } else if (shape === 'mushroom') {
      add(geo.hemi, lm[0], 0, h - 0.1 * k, 0, 2.3 * k, 1.55 * k, 2.3 * k);
      const spot = new T3.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.7 });
      spot.userData.baseEm = new T3.Color(0, 0, 0); spot.userData.baseEi = 1;
      mats.push(spot);
      for (let i = 0; i < 11; i++) {
        const a = rng() * Math.PI * 2, el = 0.2 + rng() * 1.1;
        const x = Math.cos(a) * Math.cos(el) * 2.25 * k, y = h - 0.1 * k + Math.sin(el) * 1.52 * k, z = Math.sin(a) * Math.cos(el) * 2.25 * k;
        const m = add(geo.sphere, spot, x, y, z, 0.28 * k, 0.12 * k, 0.28 * k);
        m.quaternion.setFromUnitVectors(new T3.Vector3(0, 1, 0), new T3.Vector3(x, y - (h - 0.1 * k), z).normalize());
      }
      top = h + 1.5 * k;
    } else if (shape === 'crystal') {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.4;
        const tilt = 0.25 + rng() * 0.55;
        const len = (1.3 + rng() * 0.9) * k;
        const m = add(geo.octa, lm[i % 3], Math.cos(a) * 0.55 * k, h + len * 0.6, Math.sin(a) * 0.55 * k, 0.32 * k, len, 0.32 * k);
        m.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      }
      add(geo.octa, lm[2], 0, h + 1.5 * k, 0, 0.4 * k, 1.8 * k, 0.4 * k);
      top = h + 3.2 * k;
    } else {
      const cy = h + 1.05 * k;
      add(geo.ico, lm[0], 0, cy + 0.35 * k, 0, 1.6 * k);
      const n = 6 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.6;
        const d = (1.0 + rng() * 0.5) * k;
        add(geo.ico, lm[1 + (i % 2)], Math.cos(a) * d, cy + (rng() - 0.35) * 0.9 * k, Math.sin(a) * d * 0.85, (0.85 + rng() * 0.5) * k, undefined, undefined, rng() * 3, rng() * 3, 0);
      }
      if (pal.deco === 'stars' || pal.amb === 'petal' || pal.deco === 'cloud') {
        const dm = new T3.MeshBasicMaterial({ color: pal.deco === 'stars' ? '#fff8c0' : '#ffffff' });
        mats.push(dm);
        for (let i = 0; i < 16; i++) {
          const a = rng() * Math.PI * 2, el = (rng() - 0.3) * 1.2;
          add(geo.sphere, dm, Math.cos(a) * Math.cos(el) * 1.9 * k, cy + Math.sin(el) * 1.6 * k + 0.3 * k, Math.sin(a) * Math.cos(el) * 1.7 * k, 0.07 * k);
        }
      }
      top = cy + 1.9 * k;
    }
    // ボスの顔と王冠
    if (tree.boss) {
      const y = h * 0.62, r = rAt(y);
      const eyeM = new T3.MeshStandardMaterial({ color: '#fff36a', emissive: new T3.Color('#ffcc00'), emissiveIntensity: 1 });
      const redM = new T3.MeshBasicMaterial({ color: '#d00000' });
      const darkM = new T3.MeshStandardMaterial({ color: '#1a0000' });
      const goldM = new T3.MeshStandardMaterial({ color: '#ffcf3a', metalness: 0.5, roughness: 0.3, emissive: new T3.Color('#7a5000'), emissiveIntensity: 0.7 });
      [eyeM, darkM, goldM].forEach((m) => { m.userData.baseEm = m.emissive.clone(); m.userData.baseEi = m.emissiveIntensity; });
      mats.push(eyeM, redM, darkM, goldM);
      for (const s of [-1, 1]) {
        const eye = new T3.Mesh(geo.sphere, eyeM); eye.scale.set(r * 0.27, r * 0.2, r * 0.12); eye.position.set(s * r * 0.42, y, r * 0.93); upper.add(eye);
        const pu = new T3.Mesh(geo.sphere, redM); pu.scale.set(r * 0.09, r * 0.09, r * 0.05); pu.position.set(s * r * 0.38, y, r * 1.04); upper.add(pu);
        const br = new T3.Mesh(geo.box, darkM); br.scale.set(r * 0.52, r * 0.09, r * 0.09); br.position.set(s * r * 0.42, y + r * 0.32, r * 0.98); br.rotation.z = s * 0.45; upper.add(br);
      }
      const mo = new T3.Mesh(geo.box, darkM); mo.scale.set(r * 0.7, r * 0.15, r * 0.1); mo.position.set(0, y - r * 0.42, r * 0.95); upper.add(mo);
      const crown = new T3.Group();
      const band2 = new T3.Mesh(geo.cyl, goldM); band2.scale.set(0.75 * k, 0.32 * k, 0.75 * k); crown.add(band2);
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const c = new T3.Mesh(geo.cone, goldM); c.scale.set(0.2 * k, 0.5 * k, 0.2 * k); c.position.set(Math.cos(a) * 0.62 * k, 0.38 * k, Math.sin(a) * 0.62 * k); crown.add(c); }
      crown.position.y = top + 0.2 * k;
      upper.add(crown);
    }
    root.scale.setScalar(0.01);
    scene.add(root);
    return {
      tree, root, pivot, upper, canopy, stump, upperT, barkMat, lm, mats, geos, h, r0, r1, ny, nh, rAt, top, k,
      dmgShown: -1, grow: 0, shake: 0, flash: 0, dir: 1, falling: false,
    };
  }

  // 切り込み: 正面(+z)側の頂点を内側へ押し込み、色を木の地肌に寄せる
  function applyNotch(o, dmg) {
    const rn = o.rAt(o.ny);
    const depth = rn * 0.93 * U.clamp(dmg, 0, 1);
    for (const part of [o.stump, o.upperT]) {
      const pos = part.g.attributes.position, col = part.g.attributes.color, b = part.base, bc = part.baseCol;
      const pa = pos.array, ca = col.array;
      for (let i = 0; i < pos.count; i++) {
        const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
        const rad = Math.hypot(x, z);
        const dy = Math.abs(y - o.ny) / o.nh;
        let kx = 1, t = 0;
        if (dy < 1 && rad > 1e-4 && depth > 0) {
          const a = Math.atan2(x, z);
          const w = Math.max(0, Math.cos(a * 1.25));
          const cut = depth * Math.pow(w, 0.55) * (1 - dy);
          if (cut > 0) {
            kx = Math.max(0.06, (rad - cut) / rad);
            t = Math.min(1, cut / (rn * 0.25));
          }
        }
        pa[i * 3] = x * kx;
        pa[i * 3 + 2] = z * kx;
        ca[i * 3] = bc[i * 3] + (WOOD.r - bc[i * 3]) * t;
        ca[i * 3 + 1] = bc[i * 3 + 1] + (WOOD.g - bc[i * 3 + 1]) * t;
        ca[i * 3 + 2] = bc[i * 3 + 2] + (WOOD.b - bc[i * 3 + 2]) * t;
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  }
  function disposeTree(o) {
    scene.remove(o.root);
    o.geos.forEach((g) => g.dispose());
    o.mats.forEach((m) => m.dispose());
  }

  // ------------------------------------------------------------- JUSTの帯
  function makeBand() {
    band = new T3.Mesh(geo.band, new T3.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.3, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide }));
    band.visible = false;
    scene.add(band);
    const am = new T3.MeshBasicMaterial({ color: 0xffe14a });
    arrows = [-1, 1].map((s) => {
      const m = new T3.Mesh(geo.cone, am);
      m.rotation.z = s * (Math.PI / 2);
      m.visible = false;
      scene.add(m);
      return m;
    });
  }

  // ------------------------------------------------------------- 斧（3D）
  const DEFAULT_AXE = { id: '_none', r: 'N', blade: ['#e0e6ec', '#7f8b96'], handle: '#7a5533' };
  function buildAxe(def) {
    const first = !axe;
    if (axe) { axeScene.remove(axe.g); axe.P.dispose(); }
    def = def || DEFAULT_AXE;
    const P = Axe3D.build(def);
    const g = new T3.Group();
    const S = 1 / 40;
    P.grp.scale.setScalar(S);
    P.grp.position.set(-56 * S, 18 * S, 0);
    g.add(P.grp);
    axeScene.add(g);
    axe = { g, P, def, spin: first ? 0 : 1, act: 0 };
    if (!first && onAxeChange) onAxeChange(def);
  }

  // ------------------------------------------------------------- 3D粒子
  function makeParticles() {
    const inst = (g, mat, n, colors) => {
      const m = new T3.InstancedMesh(g, mat, n);
      m.instanceMatrix.setUsage(T3.DynamicDrawUsage);
      if (colors) for (let i = 0; i < n; i++) m.setColorAt(i, cWhite);
      m.count = 0;
      m.frustumCulled = false;
      m.userData.max = n;
      scene.add(m);
      return m;
    };
    chips = inst(new T3.BoxGeometry(0.15, 0.055, 0.26), new T3.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), 280, true);
    leaves = inst(new T3.PlaneGeometry(0.28, 0.18), new T3.MeshStandardMaterial({ roughness: 0.9, side: T3.DoubleSide }), 220, true);
    coins = inst(new T3.CylinderGeometry(0.22, 0.22, 0.05, 14), new T3.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.55, roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.7 }), 160, false);
  }
  function stepInst(mesh, arr, dt, kind) {
    for (let i = arr.length - 1; i >= 0; i--) { arr[i].life -= dt; if (arr[i].life <= 0) arr.splice(i, 1); }
    let n = 0;
    for (const p of arr) {
      if (kind === 'leaf') {
        p.vy = Math.max(p.vy - 2.6 * dt, -1.1);
        p.vx += Math.sin(time * 3 + p.ph) * 2.2 * dt;
        p.vx *= 1 - 1.2 * dt;
        p.vz *= 1 - 1.2 * dt;
      } else p.vy -= 17 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const floor = 0.03 * p.s;
      if (p.y < floor) {
        p.y = floor;
        if (kind !== 'leaf' && p.vy < -1.5) { p.vy *= -0.32; p.vx *= 0.55; p.vz *= 0.55; p.ax *= 0.5; p.ay *= 0.5; p.az *= 0.5; }
        else { p.vy = 0; p.vx *= 0.82; p.vz *= 0.82; p.ax *= 0.8; p.ay *= 0.8; p.az *= 0.8; }
      }
      p.rx += p.ax * dt; p.ry += p.ay * dt; p.rz += p.az * dt;
      const fade = Math.min(1, p.life / 0.45);
      e3.set(p.rx, p.ry, p.rz);
      q4.setFromEuler(e3);
      s3.setScalar(p.s * fade);
      v1.set(p.x, p.y, p.z);
      m4.compose(v1, q4, s3);
      mesh.setMatrixAt(n, m4);
      if (p.c && mesh.instanceColor) mesh.setColorAt(n, p.c);
      if (++n >= mesh.userData.max) break;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  const qn = () => [0.4, 0.7, 1][quality];
  function emitChips(x, y, z, dir, n, power, light, dark) {
    n = Math.round(n * qn());
    for (let i = 0; i < n; i++) {
      P.chips.push({
        x, y, z, vx: dir * (1.5 + rnd() * 4.5) * power + (rnd() - 0.5) * 1.6, vy: 1.5 + rnd() * 4.5 * power, vz: 0.6 + rnd() * 3,
        rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6, ax: (rnd() - 0.5) * 26, ay: (rnd() - 0.5) * 26, az: (rnd() - 0.5) * 26,
        life: 1.4 + rnd() * 1.2, s: 0.7 + rnd() * 0.9, c: rnd() < 0.6 ? light : dark,
      });
    }
    if (P.chips.length > chips.userData.max) P.chips.splice(0, P.chips.length - chips.userData.max);
  }
  function emitLeaves(x, y, z, n, spread, cols) {
    n = Math.round(n * qn());
    for (let i = 0; i < n; i++) {
      P.leaves.push({
        x: x + (rnd() - 0.5) * spread, y: y + (rnd() - 0.5) * spread * 0.6, z: z + (rnd() - 0.2) * spread * 0.6,
        vx: (rnd() - 0.5) * 2.5, vy: rnd() * 1.5, vz: rnd() * 1.2, rx: rnd() * 6, ry: rnd() * 6, rz: rnd() * 6,
        ax: (rnd() - 0.5) * 6, ay: (rnd() - 0.5) * 6, az: (rnd() - 0.5) * 6, life: 2 + rnd() * 1.5, s: 0.8 + rnd() * 0.6,
        c: cols[Math.floor(rnd() * cols.length)], ph: rnd() * 6,
      });
    }
    if (P.leaves.length > leaves.userData.max) P.leaves.splice(0, P.leaves.length - leaves.userData.max);
  }
  function emitCoins(x, y, z, n, power) {
    n = Math.round(n * qn());
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      P.coins.push({
        x, y, z, vx: Math.cos(a) * (1 + rnd() * 3) * power, vy: 4 + rnd() * 5 * power, vz: Math.abs(Math.sin(a)) * (1 + rnd() * 3) + 1,
        rx: rnd() * 6, ry: rnd() * 6, rz: 0, ax: 8 + rnd() * 10, ay: (rnd() - 0.5) * 10, az: 0, life: 1.6 + rnd() * 0.8, s: 0.8 + rnd() * 0.5,
      });
    }
    if (P.coins.length > coins.userData.max) P.coins.splice(0, P.coins.length - coins.userData.max);
  }

  // ------------------------------------------------------------- 木こり（絵文字のスプライト）
  const SLOTS = [[-1.45, 0.75], [1.45, 0.75], [-2.3, -0.1], [2.3, -0.1], [-1.1, -1.3], [1.1, -1.3], [-2.9, -1.4], [2.9, -1.4], [-1.9, -2.6], [1.9, -2.6], [0, -2.5], [-3.6, -0.6], [3.6, -0.6], [0, -3.6]];
  function emojiTexture(ch) {
    if (emojiTex.has(ch)) return emojiTex.get(ch);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ch, 64, 70);
    const t = new T3.CanvasTexture(c);
    emojiTex.set(ch, t);
    return t;
  }
  function syncWorkers() {
    const owned = D.WORKERS.filter((w) => (G.S.workers[w.id] || 0) > 0);
    const key = owned.map((w) => w.id).join(',');
    if (key === workerKey) return;
    workerKey = key;
    for (const w of workers) { scene.remove(w.sp); w.sp.material.dispose(); }
    workers = owned.slice(0, SLOTS.length).map((w, i) => {
      const sp = new T3.Sprite(new T3.SpriteMaterial({ map: emojiTexture(w.icon), transparent: true, alphaTest: 0.15 }));
      const [x, z] = SLOTS[i];
      sp.position.set(x, 0.55, z);
      sp.scale.setScalar(1.1);
      scene.add(sp);
      return { sp, x, z, side: x < 0 ? -1 : 1, period: 0.7 + (i % 5) * 0.11, ph: rnd(), id: w.id };
    });
  }

  // ------------------------------------------------------------- 座標変換
  function toScreen(x, y, z) {
    v1.set(x, y, z).project(camera);
    return { x: ((v1.x + 1) / 2) * W, y: ((1 - v1.y) / 2) * H };
  }
  function pointOnPlane(sx, sy, z) {
    ndc.set((sx / W) * 2 - 1, -(sy / H) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    plane.set(v2.set(0, 0, 1), -z);
    const out = new T3.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  }
  // 当たり判定用の幹（スクリーン座標）
  function trunkInfo() {
    if (!ok || !cur || !cur.tree.alive || cur.grow < 0.6) return null;
    const o = cur;
    const rn = o.rAt(o.ny);
    const pb = toScreen(0, 0.05, o.r0), pt = toScreen(0, o.h, o.r1), pn = toScreen(0, o.ny, rn), pe = toScreen(rn, o.ny, 0);
    const zone = o.h * G.stats().justZone;
    const pz = toScreen(0, o.ny + zone, rn);
    return {
      cx: pn.x, top: pt.y, bottom: pb.y, notchY: pn.y, justHalf: Math.max(7, Math.abs(pz.y - pn.y)),
      margin: Math.max(8, Math.abs(pe.x - pn.x) * 1.05), unit: U.clamp(Math.min(W, H) * 0.92, 220, 520),
    };
  }
  function canopyScreen() {
    if (!ok) return { x: W / 2, y: H * 0.4 };
    const o = cur || fallers[fallers.length - 1];
    return o ? toScreen(0, (o.h + o.top) / 2, 0.5) : toScreen(0, 5, 0);
  }
  function notchScreen() {
    if (!ok) return { x: W / 2, y: H * 0.6 };
    const o = cur;
    return o ? toScreen(0, o.ny, o.rAt(o.ny)) : toScreen(0, 1.2, 0.5);
  }
  function hitWorld(sy) {
    const o = cur;
    if (!o) return null;
    const rn = o.rAt(o.ny);
    const p = pointOnPlane(W / 2, sy, rn);
    if (!p) return null;
    p.x = 0;
    p.y = U.clamp(p.y, 0.15, o.h);
    p.z = o.rAt(p.y) * 0.95;
    return p;
  }

  // ------------------------------------------------------------- イベント
  // セーブ読み込み・データ消去のときは作り直す
  function reset() {
    if (!ok) return;
    if (cur) { disposeTree(cur); cur = null; }
    while (fallers.length) disposeTree(fallers.pop());
    P.chips.length = 0; P.leaves.length = 0; P.coins.length = 0;
  }
  function onSpawn(tree) {
    if (!ok) return;
    ensureBiome(G.biomeIndex(tree.stage));
    for (const f of fallers) f.stump.mesh.visible = false;
    if (cur) { disposeTree(cur); cur = null; }
    cur = buildTree(tree);
  }
  function onHit(d) {
    if (!ok || !cur) return null;
    const o = cur;
    const s = Math.max(0, d.stier);
    o.shake = Math.min(1.8, o.shake + 0.5 + s * 0.14 + (d.just ? 0.3 : 0));
    o.flash = Math.min(1, 0.55 + s * 0.08 + (d.just ? 0.3 : 0) + d.tier * 0.1);
    o.dir = d.dir || 1;
    const p = d.y != null ? hitWorld(d.y) : null;
    const hp = p || v2.set(0, o.ny, o.rAt(o.ny));
    const light = cTmp.set(WOOD.r, WOOD.g, WOOD.b).clone();
    const dark = new T3.Color(pal.trunk);
    emitChips(hp.x, hp.y, hp.z + 0.1, o.dir, 5 + s * 3 + (d.just ? 6 : 0) + d.tier * 3, 0.8 + s * 0.15, light, dark);
    if (rnd() < 0.5 + s * 0.08) emitLeaves(0, o.h + 1.2 * o.k, 0.3, 2 + s, 3.2 * o.k, pal.leaves.map((c) => new T3.Color(c)));
    if (d.gold > 0) emitCoins(hp.x, hp.y + 0.2, hp.z + 0.2, 4 + s, 0.9);
    // 斧を幹に食い込ませる
    hold.stick = Math.max(hold.stick, 0.05 + s * 0.012 + (d.just ? 0.04 : 0));
    hold.sx = hp.x - o.dir * 0.12;
    hold.sy = hp.y;
    hold.sz = hp.z * 0.55;
    cam.kick = -o.dir * (0.05 + s * 0.03);
    return hp;
  }
  function onProc(p) {
    if (!ok || !cur) return;
    const o = cur;
    const hp = (p.y != null && hitWorld(p.y)) || v2.set(0, o.ny, o.rAt(o.ny));
    if (p.kind === 'thunder') { flashLight('#bfe0ff', 1.6); o.flash = 1; o.shake = Math.min(1.8, o.shake + 0.6); }
    else if (p.kind === 'blast') {
      const lv = G.S.upg.blast || 0;
      flashLight('#ffb060', lv >= 20 ? 2.2 : 1.4);
      const m = new T3.Mesh(geo.sphere, new T3.MeshBasicMaterial({ color: lv >= 20 ? 0xfff0c0 : 0xff8a3a, transparent: true, opacity: 0.9, blending: T3.AdditiveBlending, depthWrite: false }));
      m.position.copy(hp);
      m.scale.setScalar(0.2);
      scene.add(m);
      blasts.push({ m, t: 0, dur: lv >= 10 ? 0.55 : 0.4, size: lv >= 20 ? 6 : lv >= 10 ? 4.5 : 3 });
      emitChips(hp.x, hp.y, hp.z, 1, 14, 1.6, new T3.Color('#ffd27a'), new T3.Color('#ff6a2a'));
      emitChips(hp.x, hp.y, hp.z, -1, 14, 1.6, new T3.Color('#ffd27a'), new T3.Color('#ff6a2a'));
      o.shake = 1.8;
    } else if (p.kind === 'echo') {
      emitChips(hp.x, hp.y, hp.z, p.n % 2 ? -1 : 1, 4, 0.8, new T3.Color('#e0c8ff'), new T3.Color('#a080e0'));
      o.shake = Math.min(1.8, o.shake + 0.3);
    }
  }
  function onFell(d) {
    if (!ok || !cur) return;
    const o = cur;
    cur = null;
    o.falling = true;
    o.fallT = 0;
    o.dir = d.tree.side || 1;
    o.landed = false;
    // 倒れる側の縁を蝶番にする
    const rn = o.rAt(o.ny);
    o.pivot.position.x = o.dir * rn * 0.9;
    o.upper.position.x = -o.dir * rn * 0.9;
    const big = d.tree.boss || d.tree.rar.id !== 'normal';
    emitCoins(0, o.h * 0.8, 0.6, big ? 46 : 16, big ? 1.4 : 1);
    emitLeaves(0, o.h + 1.2 * o.k, 0.3, big ? 30 : 12, 3 * o.k, pal.leaves.map((c) => new T3.Color(c)));
    fallers.push(o);
    if (fallers.length > 3) disposeTree(fallers.shift());
  }
  function onBossFail(tree) {
    if (!ok || !cur) return;
    const o = cur;
    cur = null;
    o.escape = true;
    o.fallT = 0;
    fallers.push(o);
  }
  function landing(o) {
    const len = o.h - o.ny + (o.top - o.h) * 0.6;
    cam.shake = Math.min(1.6, cam.shake + (o.tree.boss ? 1.3 : 0.7));
    const tipX = o.dir * (len + 0.5);
    emitLeaves(tipX * 0.8, 0.8, 0.2, 18, 3, pal.leaves.map((c) => new T3.Color(c)));
    if (onLanded) {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push(toScreen(o.dir * (0.5 + (len * i) / 6), 0.1, 0.3));
      onLanded(o.tree, pts);
    }
  }
  function finisher(power) {
    cam.dolly = Math.max(cam.dolly, cam.base.z * (0.08 + 0.06 * power));
    cam.punch = Math.max(cam.punch, 0.08 + 0.06 * power);
  }
  function flashLight(col, amt) {
    lightCol.set(col);
    lightBoost = Math.max(lightBoost, amt);
  }
  function shake(v) { if (allowShake) cam.shake = Math.min(1.8, cam.shake + v); }
  function punch(v) { cam.punch = Math.max(cam.punch, v); }

  // ------------------------------------------------------------- 斧の操作
  function grab(p) {
    hold.on = true;
    hold.x = p.x; hold.y = p.y; hold.pt = p.t; hold.vx = 0; hold.vy = 0;
    hold.grabT = 0;
    const ti = trunkInfo();
    hold.mirror = ti && p.x > ti.cx ? -1 : 1;
  }
  function drag(p) {
    if (!hold.on) return;
    const dt = Math.max(0.004, (p.t - hold.pt) / 1000);
    hold.vx = hold.vx * 0.55 + ((p.x - hold.x) / dt) * 0.45;
    hold.vy = hold.vy * 0.55 + ((p.y - hold.y) / dt) * 0.45;
    if (Math.abs(hold.vx) > 80) hold.mirror = hold.vx > 0 ? 1 : -1;
    hold.x = p.x; hold.y = p.y; hold.pt = p.t;
  }
  function release() { hold.on = false; }
  function updateAxe(dt, real, busy) {
    const eq = G.stats().eq;
    const key = eq ? eq.id : '-';
    // ガチャなどの画面が開いている間は持ち替えない（閉じた瞬間に登場させる）
    if (key !== axeKey && (!busy || !axe)) { axeKey = key; buildAxe(eq); }
    const g = axe.g;
    const sp = Math.hypot(hold.vx, hold.vy) / Math.max(1, Math.min(W, H));
    axe.act += ((hold.on ? Math.min(1, sp * 0.6) : 0) + (hold.stick > 0 ? 1 : 0) - axe.act) * Math.min(1, real * 8);
    axe.P.tick(time, real, axe.act);
    for (const s of axe.P.glows) s.material.opacity = Math.min(1, s.userData.base * (1 + lightBoost * 0.35 + axe.act * 0.5));
    // 命中の閃光で斧もギラッと光る。フィーバー中は縁の光が虹色に回る
    if (axeLights) {
      axeLights.key.intensity = 1 + lightBoost * 0.5 + axe.act * 0.25;
      axeLights.rim.color.set(0xbcd8ff);
      if (feverMix > 0.01) axeLights.rim.color.lerp(cTmp.setHSL((time * 0.25) % 1, 1, 0.6), feverMix);
      axeLights.rim.intensity = 0.9 + feverMix * 0.8;
    }
    hold.stick = Math.max(0, hold.stick - real);
    const o = cur;
    let tx, ty, tz, rz, ry, sx;
    if (hold.on) {
      hold.grabT += real;
      const front = o ? o.rAt(o.ny) + 0.55 : 1;
      const p = pointOnPlane(hold.x, hold.y, front);
      const tilt = U.clamp(Math.atan2(hold.vy, Math.abs(hold.vx) + 1), -1.1, 1.1);
      hold.tilt += (tilt - hold.tilt) * Math.min(1, real * 18);
      if (hold.stick > 0) { tx = hold.sx; ty = hold.sy; tz = hold.sz; }
      else if (p) { tx = p.x; ty = Math.max(0.15, p.y); tz = p.z; }
      else { tx = g.position.x; ty = g.position.y; tz = g.position.z; }
      rz = -hold.tilt * hold.mirror;
      ry = -0.32 * hold.mirror;
      sx = hold.mirror;
      const f = hold.stick > 0 ? 1 : Math.min(1, real * (hold.grabT < 0.15 ? 18 : 40));
      g.position.x += (tx - g.position.x) * f;
      g.position.y += (ty - g.position.y) * f;
      g.position.z += (tz - g.position.z) * f;
    } else {
      // 待機中: 切り込みに刺さっている
      // 刃先だけ幹の正面に食い込ませ、柄は右手前へ突き出す
      if (o) {
        const sc = o.root.scale.x;
        const rn = o.rAt(o.ny) * sc;
        tx = 0.08 * sc; ty = (o.ny + 0.12) * o.root.scale.y; tz = rn * 0.92;
      } else { tx = 0.6; ty = 0.4; tz = 0.8; }
      const f = Math.min(1, real * 10);
      g.position.x += (tx - g.position.x) * f;
      g.position.y += (ty - g.position.y) * f;
      g.position.z += (tz - g.position.z) * f;
      rz = 0.3 + Math.sin(time * 2.2) * 0.03;
      ry = -0.85;
      sx = -1;
    }
    let k = 1.05;
    if (axe.spin > 0) {
      // 装備した瞬間: くるくる回りながら大きくなって手元に来る
      axe.spin = Math.max(0, axe.spin - real * 1.6);
      const p = 1 - axe.spin;
      k *= Math.max(0.01, U.ease.outBack(p));
      ry += (1 - U.ease.outCubic(p)) * Math.PI * 4;
    }
    g.rotation.set(0, ry, rz);
    g.scale.set(sx * k, k, k);
  }
  // 斧の画面上の位置（装備演出の光などに使う）
  function axeScreen() {
    if (!ok || !axe) return null;
    return toScreen(axe.g.position.x, axe.g.position.y, axe.g.position.z);
  }

  // ------------------------------------------------------------- フレーム
  function ensureBiome(idx) { if (idx !== palIdx) applyBiome(idx); }
  function setLeafEmissive(o, col, amt) {
    for (const m of o.lm) {
      if (amt > 0) { m.emissive.copy(m.userData.baseEm).lerp(col, Math.min(1, amt)); m.emissiveIntensity = Math.max(m.userData.baseEi, 0.6 * amt + m.userData.baseEi); }
      else { m.emissive.copy(m.userData.baseEm); m.emissiveIntensity = m.userData.baseEi; }
    }
  }
  function frame(dt, real, busy) {
    if (!ok) return;
    time += dt;
    // 倍速: 木の生え変わり・倒れる速さ・木こりの手つきも速くする
    const spd = G.gameSpeed ? G.gameSpeed() : 1;
    wtime += dt * spd;
    ensureBiome(G.biomeIndex(G.S.stage));
    const T = G.T;
    if (!cur && T.tree && T.tree.alive) onSpawn(T.tree); // 起動・読み込み直後
    // フィーバー: 空と光が虹色に回る
    feverMix += ((T.fever > 0 ? 1 : 0) - feverMix) * Math.min(1, real * 3);
    goldenMix += ((T.golden > 0 ? 1 : 0) - goldenMix) * Math.min(1, real * 5);
    if (feverMix > 0.01) {
      const h = (time * 0.18) % 1;
      cTmp.set(pal.sky[0]); skyU.top.value.copy(cTmp.lerp(new T3.Color().setHSL(h, 0.85, 0.55), feverMix));
      cTmp.set(pal.sky[1]); skyU.bottom.value.copy(cTmp.lerp(new T3.Color().setHSL((h + 0.3) % 1, 0.9, 0.7), feverMix));
      hemi.color.set(pal.night ? '#9aa0d0' : '#ffffff').lerp(new T3.Color().setHSL((h + 0.6) % 1, 1, 0.65), feverMix * 0.6);
    } else {
      skyU.top.value.set(pal.sky[0]);
      skyU.bottom.value.set(pal.sky[1]);
    }
    lightBoost = Math.max(0, lightBoost - real * 5);
    hemi.intensity = hemiBase + lightBoost + feverMix * 0.25 * (0.5 + 0.5 * Math.sin(time * 9.5));
    if (lightBoost > 0.01) hemi.color.lerp(lightCol, Math.min(1, lightBoost * 0.5));
    stepAmbient(dt);
    syncWorkers();

    // 現在の木
    const o = cur;
    if (o) {
      o.grow = Math.min(1, o.grow + (dt * spd) / 0.42);
      const gs = Math.max(0.01, U.ease.outElastic(o.grow) * 0.9 + o.grow * 0.1);
      o.root.scale.setScalar(gs);
      const dmg = 1 - o.tree.hp / o.tree.maxHp;
      if (Math.abs(dmg - o.dmgShown) > 0.004) { o.dmgShown = dmg; applyNotch(o, dmg); }
      o.shake = Math.max(0, o.shake - real * 4.5);
      o.flash = Math.max(0, o.flash - real * 7);
      o.root.rotation.z = Math.sin(time * 46) * 0.022 * o.shake + o.dir * 0.03 * o.shake;
      o.root.rotation.x = Math.sin(time * 37) * 0.012 * o.shake;
      o.canopy.rotation.z = Math.sin(time * 28) * 0.05 * o.shake;
      // 被弾フラッシュ・レア・ゴールデン・虹
      const fl = o.flash;
      o.barkMat.emissive.copy(o.barkMat.userData.baseEm).lerp(cWhite, fl * 0.9);
      if (goldenMix > 0.01) o.barkMat.emissive.lerp(cTmp.set('#ffb400'), goldenMix * (0.45 + 0.25 * Math.sin(time * 12)));
      if (o.tree.rar.id === 'rainbow') { for (let i = 0; i < o.lm.length; i++) { cTmp.setHSL((time * 0.35 + i * 0.25) % 1, 1, 0.55); o.lm[i].emissive.copy(cTmp); } }
      else if (fl > 0.01 || feverMix > 0.01 || goldenMix > 0.01) {
        cTmp.setHSL((time * 0.3) % 1, 1, 0.6);
        const col = goldenMix > 0.01 ? new T3.Color('#ffb400') : feverMix > 0.01 ? cTmp.clone() : cWhite;
        setLeafEmissive(o, fl > 0.01 ? cWhite : col, Math.max(fl * 0.7, feverMix * 0.35 * (0.6 + 0.4 * Math.sin(time * 9.5)), goldenMix * 0.5));
      } else setLeafEmissive(o, cWhite, 0);
      // JUSTの帯
      if (o.tree.alive && o.grow >= 1) {
        const rn = o.rAt(o.ny);
        const zone = o.h * G.stats().justZone;
        const chain = T.justChain;
        band.visible = true;
        band.position.set(0, o.ny, 0);
        band.scale.set(rn * 1.14, zone * 2, rn * 1.14);
        band.material.opacity = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(time * 6)) + Math.min(0.3, chain * 0.03);
        band.material.color.set(chain >= 2 ? cTmp.setHSL((time * 0.9) % 1, 1, 0.6) : cTmp.set('#ffe14a'));
        arrows.forEach((a, i) => {
          const s = i === 0 ? -1 : 1;
          a.visible = true;
          a.material.color.copy(band.material.color);
          a.position.set(s * (rn + 0.42 + 0.06 * Math.sin(time * 6)), o.ny, 0.3);
          a.scale.set(0.11, 0.26, 0.11);
        });
      } else { band.visible = false; arrows.forEach((a) => (a.visible = false)); }
    } else { band.visible = false; arrows.forEach((a) => (a.visible = false)); }

    // 倒れる木・逃げるボス
    for (let i = fallers.length - 1; i >= 0; i--) {
      const f = fallers[i];
      f.fallT += dt * (1 + (spd - 1) * 0.5);
      if (f.escape) {
        f.root.position.y += dt * 7;
        f.root.scale.multiplyScalar(Math.max(0.5, 1 - dt * 1.5));
        if (f.fallT > 1.1) { disposeTree(f); fallers.splice(i, 1); }
        continue;
      }
      const dur = 0.62;
      const p = Math.min(1, f.fallT / dur);
      let ang = (Math.PI / 2) * 0.97 * p * p * p;
      if (p >= 1) {
        if (!f.landed) { f.landed = true; landing(f); }
        const b = f.fallT - dur;
        ang = (Math.PI / 2) * 0.97 - Math.abs(Math.sin(b * 13)) * Math.exp(-b * 6) * 0.16;
      }
      f.pivot.rotation.z = -f.dir * ang;
      if (f.fallT > dur + 0.8) {
        const s = (f.fallT - dur - 0.8) / 0.55;
        f.root.position.y = -s * 3;
        if (s >= 1) { disposeTree(f); fallers.splice(i, 1); }
      }
    }
    // 爆発の光球
    for (let i = blasts.length - 1; i >= 0; i--) {
      const b = blasts[i];
      b.t += dt;
      const p = b.t / b.dur;
      if (p >= 1) { scene.remove(b.m); b.m.material.dispose(); blasts.splice(i, 1); continue; }
      b.m.scale.setScalar(0.3 + b.size * U.ease.outCubic(p));
      b.m.material.opacity = 0.9 * (1 - p);
    }
    // 木こり
    for (const w of workers) {
      const ph = (wtime / w.period + w.ph) % 1;
      const jerk = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
      w.sp.material.rotation = -w.side * jerk * 0.45;
      w.sp.position.y = 0.55 + Math.abs(Math.sin(time * 5 + w.ph * 6)) * 0.06;
      w.sp.scale.set(w.side * -1.1, 1.1, 1);
      if (jerk > 0.95 && o && o.tree.alive && rnd() < 0.08) emitChips(0, 0.5, 0.2, -w.side, 1, 0.5, cTmp.set(WOOD.r, WOOD.g, WOOD.b).clone(), new T3.Color(pal.trunk));
    }
    stepInst(chips, P.chips, dt, 'chip');
    stepInst(leaves, P.leaves, dt, 'leaf');
    stepInst(coins, P.coins, dt, 'coin');
    updateAxe(dt, real, busy);

    // カメラ
    cam.shake = Math.max(0, cam.shake - real * 2.4);
    cam.punch *= Math.pow(0.002, real);
    cam.kick *= Math.pow(0.0004, real);
    cam.dolly *= Math.pow(0.02, real);
    // ボスは大きいので少し引いて全身を見せる
    bossMix += ((cur && cur.tree.boss ? 1 : 0) - bossMix) * Math.min(1, real * 3);
    const sway = Math.sin(time * 0.33) * 0.35 + feverMix * Math.sin(time * 1.7) * 0.6;
    camera.position.set(cam.base.x + sway + cam.kick, cam.base.y + feverMix * Math.sin(time * 2.3) * 0.15 + bossMix * 0.9, cam.base.z * (1 + bossMix * 0.2) - cam.dolly);
    if (cam.shake > 0.01 && allowShake) {
      camera.position.x += (rnd() - 0.5) * cam.shake * 0.45;
      camera.position.y += (rnd() - 0.5) * cam.shake * 0.32;
    }
    camera.lookAt(cam.look.x + cam.kick * 0.4, cam.look.y - cam.dolly * 0.05 + bossMix * 0.9, cam.look.z);
    camera.fov = cam.fovBase * (1 - Math.min(0.3, cam.punch));
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    // 斧: 深度はそのまま（幹に食い込むと隠れる）で上から描く
    renderer.autoClear = false;
    renderer.render(axeScene, camera);
    renderer.autoClear = true;
    // 図鑑・ガチャ用の斧の画像を少しずつ作っておく
    warmT += real;
    if (warmT > 2.5 && warmT < 1e9 && (warmAcc += real) >= 0.1) {
      warmAcc = 0;
      if (!Axe3D.warmStep()) warmT = 1e9;
    }
    // 2秒ごとに平均フレーム時間を見て解像度を調整（落ちすぎたら下げ、余裕があれば戻す）
    perfAcc += real; perfN++; perfT += real;
    if (perfT >= 2) {
      const avg = perfAcc / perfN;
      perfT = 0; perfAcc = 0; perfN = 0;
      const prev = dynScale;
      if (avg > 0.028 && dynScale > 0.55) dynScale = Math.max(0.55, dynScale - 0.15);
      else if (avg < 0.018 && dynScale < 1) dynScale = Math.min(1, dynScale + 0.1);
      if (dynScale !== prev) resize();
    }
  }

  return {
    get ok() { return ok; },
    init, resize, frame, setQuality, palette, trunkInfo, canopyScreen, notchScreen, toScreen,
    reset, onSpawn, onHit, onProc, onFell, onBossFail, finisher, flashLight, shake, punch, grab, drag, release,
    set onLanded(fn) { onLanded = fn; },
    set onAxeChange(fn) { onAxeChange = fn; },
    axeScreen,
    biomeName: () => palette(G.biomeIndex(G.S.stage)).name,
  };
})();
