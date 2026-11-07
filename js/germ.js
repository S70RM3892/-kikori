'use strict';
// =====================================================================
//  germ.js — 菌斬り次元のゲームロジック（DOM非依存）
//  ・刀をドラッグして、ただよう菌を斬る。一振りで何体も斬ると「一閃」
//  ・ウェーブを進み、10ウェーブごとに巨大な病原体（ボス）
//  ・免疫細胞（放置）・研ぎ（強化）・刀ガチャ（自動）・変異（森にも効く）
//  状態は G.S.germ（セーブされる）、ここの T は実行時だけ。
//  演出側は G.on('gSlice' など) で購読する。
// =====================================================================
const GM = (() => {
  const C = GD.CFG;
  const S = () => G.S;
  const gs = () => G.S.germ;
  const TY = {}, CE = {}, UP = {}, MU = {}, KAT = {};
  GD.TYPES.forEach((t) => (TY[t.id] = t));
  GD.CELLS.forEach((c) => (CE[c.id] = c));
  GD.UPGRADES.forEach((u) => (UP[u.id] = u));
  GD.MUTATIONS.forEach((m) => (MU[m.id] = m));
  GD.KATANAS.forEach((k) => (KAT[k.id] = k));
  const RANK = G.RANK;
  const POOL = {};
  D.RARITY_ORDER.forEach((r) => (POOL[r] = GD.KATANAS.filter((k) => k.r === r)));
  const lvOf = G.lvOf;
  const emit = (e, d) => G.emit(e, d);
  const rnd = Math.random;
  const rand = (a, b) => a + rnd() * (b - a);

  const T = {
    time: 0, germs: [], nid: 1, spawnT: 0.6, combo: 0, comboT: 0, stroke: null,
    outbreak: 0, outNext: 70, outKills: 0, outDna: 0, ougi: 0, ougiPending: null,
    boss: null, bossTimer: 0, pendingBoss: false, bossDelay: 0, summonT: 0,
    cellT: 0.5, rollAcc: 0, pending: [], dirty: true, st: null, stT: 0,
    bounds: { x0: -4.3, x1: 4.3, y0: -6.5, y1: 5.5 },
    dnaAcc: 0, dnaT: 0, dnaEMA: 0, bgAcc: 0,
  };

  // ------------------------------------------------------------- 計算
  const lv = (id) => gs().upg[id] || 0;
  const open = () => G.germOpen();
  const inDim = () => S().dim === 'germ';
  function curve(base, g1, g2, w) {
    const a = Math.min(w, C.HP_SW) - 1, b = Math.max(0, w - C.HP_SW);
    return base * Math.pow(g1, a) * Math.pow(g2, b);
  }
  const hpAt = (w) => curve(C.HP_BASE, C.HP_G, C.HP_G2, w);
  const dnaAt = (w) => curve(C.DNA_BASE, C.DNA_G, C.DNA_G2, w);
  const biomeIndex = (w) => Math.floor((w - 1) / 10);
  const isBossWave = (w) => w % C.BOSS_EVERY === 0;
  function msMult(n) {
    let m = 1;
    for (const [c, x] of GD.MILESTONES) { if (n >= c) m *= x; else break; }
    return m;
  }
  function calc() {
    const s = S(), g = gs(), f = G.stats();
    let pas = 0;
    for (const id in g.kat) { const k = KAT[id]; if (k) pas += D.RARITY[k.r].pas * 0.5 * lvOf(g.kat[id]); }
    const eq = g.keq && g.kat[g.keq] ? KAT[g.keq] : null;
    const eqLv = eq ? lvOf(g.kat[eq.id]) : 0;
    const sp = {};
    if (eq && eq.sp) for (const k in eq.sp) sp[k] = eq.sp[k] * (1 + 0.2 * (eqLv - 1));
    const st = { eq, eqLv, sp, pas };
    // 森の斧を集めるほど刀も強くなる（逆に刀の種類は森の全ダメージに効く）
    st.axeSyn = 1 + C.AXE_SYNERGY * Object.keys(s.axes).length;
    // 精霊は森では1体ごとに効くが、ここでは対数で効かせる（転生を重ねた人が一瞬で終盤まで行かないように）
    st.spiritK = 1 + 0.6 * Math.log2(1 + (s.spirits || 0) * G.mutv('m_spirit'));
    st.global = f.achMult * st.spiritK * f.levelMult * (1 + pas) * st.axeSyn * G.mutv('m_all') * (1 + (sp.all || 0));
    const imm = Math.pow(1.2, lv('immune')) * G.mutv('m_cells') * (1 + (sp.cells || 0));
    st.cdps = {};
    let cd = 0;
    for (const c of GD.CELLS) {
      const n = g.cells[c.id] || 0;
      const d = n * c.dps * msMult(n) * imm * st.global;
      st.cdps[c.id] = d;
      cd += d;
    }
    st.cellDps = cd;
    st.imm = imm;
    st.kTap = eq ? D.RARITY[eq.r].tap * (1 + 0.1 * (eqLv - 1)) : 1;
    const sh = lv('sharp');
    st.kdmg = ((1 + sh) * Math.pow(2, Math.floor(sh / 25)) * st.global * G.mutv('m_blade') * (1 + (sp.kdmg || 0)) + cd * C.CELL_SOUL) * st.kTap * G.buffOf('kdmg');
    st.critC = Math.min(0.6, C.CRIT_BASE + 0.005 * lv('crit') + (sp.crit || 0));
    st.critM = C.CRIT_MULT + 0.05 * lv('crit');
    st.drawK = 1 + 0.1 * lv('draw');
    st.issen = C.ISSEN_PCT + 0.03 * lv('issen') + (sp.issen || 0);
    st.core = Math.min(0.62, C.CORE * (1 + 0.04 * lv('core') + (sp.core || 0)));
    st.coreM = C.CORE_MULT + 0.05 * lv('core');
    st.comboWin = C.COMBO_WIN + 0.08 * lv('combo') + (sp.combo || 0) + G.mutv('m_combo');
    st.comboCap = C.COMBO_CAP + 10 * lv('combo');
    st.zanshin = Math.min(0.8, 0.03 * lv('zanshin') + (sp.zanshin || 0));
    st.reach = 1 + 0.06 * lv('reach') + (sp.reach || 0);
    st.dnaMult = Math.pow(1.15, lv('analyze')) * G.mutv('m_dna') * (1 + (sp.dna || 0)) * G.buffOf('dna');
    st.goldK = 1 + 0.15 * lv('gold') + (sp.gold || 0);
    st.outTime = C.OUT_TIME + lv('outbreak') + G.mutv('m_fever') + (sp.out || 0);
    st.outFreq = 1 + 0.05 * lv('outbreak');
    st.bossM = (1 + 0.25 * lv('boss')) * G.mutv('m_boss') * (1 + (sp.boss || 0));
    st.bossTime = C.BOSS_TIME + lv('boss');
    const kl = (g.kgLv || 1) - 1;
    st.rollBase = (C.ROLL_BASE + C.ROLL_STEP * lv('krollspd') + C.KLV_ROLL * kl) * G.mutv('m_roll');
    st.luckBase = (1 + C.LUCK_STEP * lv('kluck') + C.KLV_LUCK * kl) * G.mutv('m_luck');
    return st;
  }
  function stats() {
    if (T.dirty || !T.st || T.time - T.stT > 0.5) { T.st = calc(); T.dirty = false; T.stT = T.time; }
    return T.st;
  }
  const dirty = () => { T.dirty = true; };
  function maxGerms() {
    const g = gs();
    const base = Math.min(C.MAX_CAP, C.MAX_GERMS + Math.floor((g.wave - 1) / C.MAX_STEP)) + lv('culture');
    return T.outbreak > 0 ? Math.min(26, Math.round(base * 2.4 + 4)) : base;
  }
  const comboMult = () => 1 + Math.min(T.combo, stats().comboCap) * C.COMBO_PCT;
  function speedTier(v) {
    let t = 0;
    for (const x of C.SPEED_TIERS) if (v >= x) t++;
    return t;
  }

  // ------------------------------------------------------------- DNA
  function gainDna(x) {
    if (!(x > 0)) return;
    const g = gs();
    g.dna += x;
    if (!isFinite(g.dna)) g.dna = Number.MAX_VALUE;
    S().stats.gDnaAll = Math.min(Number.MAX_VALUE, (S().stats.gDnaAll || 0) + x);
    T.dnaAcc += x;
  }
  // 放置のときの1秒あたりDNA（免疫細胞が倒すぶん）
  function cellRate() {
    const st = stats();
    if (st.cellDps <= 0) return 0;
    const w = Math.max(1, gs().wave - (isBossWave(gs().wave) ? 1 : 0));
    const kills = Math.min(5, st.cellDps / (hpAt(w) * 1.6));
    return kills * dnaAt(w) * 1.6 * st.dnaMult;
  }

  // ------------------------------------------------------------- 菌
  function pickType() {
    const w = gs().wave;
    const list = GD.TYPES.filter((t) => t.wave <= w);
    let tot = 0;
    const ws = list.map((t) => { const x = 1 + (t.wave >= w - 8 && t.wave > 1 ? 1.2 : 0); tot += x; return x; });
    let r = rnd() * tot;
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[0];
  }
  function pickVariant() {
    const st = stats(), w = gs().wave;
    if (rnd() < C.RAINBOW_CHANCE * st.goldK) return 'rainbow';
    if (rnd() < C.GOLD_CHANCE * st.goldK) return 'gold';
    if (T.outbreak > 0 || rnd() >= C.ELITE_CHANCE) return null;
    const opts = ['giant'];
    if (w >= 5) opts.push('armor');
    if (w >= 8) opts.push('split');
    if (w >= 15) opts.push('ghost');
    return opts[Math.floor(rnd() * opts.length)];
  }
  function edgePoint(r) {
    const b = T.bounds;
    const side = rnd();
    if (side < 0.4) return { x: b.x0 - r * 1.4, y: rand(b.y0, b.y1) };
    if (side < 0.8) return { x: b.x1 + r * 1.4, y: rand(b.y0, b.y1) };
    return { x: rand(b.x0, b.x1), y: b.y0 - r * 1.4 };
  }
  function innerPoint(m = 0.6) {
    const b = T.bounds;
    return { x: rand(b.x0 + m, b.x1 - m), y: rand(b.y0 + m, b.y1 - m) };
  }
  function spawn(o = {}) {
    const g = gs();
    const t = o.type ? TY[o.type] : pickType();
    const v = o.boss || o.child || o.minion ? null : o.v !== undefined ? o.v : pickVariant();
    const V = v ? GD.VARIANTS[v] : null;
    const ob = T.outbreak > 0 && !o.boss;
    const w = g.wave;
    let r = C.R_BASE * t.size * (V ? V.size : 1) * (ob ? 0.78 : 1) * (o.child ? 0.62 : 1) * (o.minion ? 0.7 : 1);
    let hp = hpAt(w) * t.hp * (V ? V.hp : 1) * (ob ? 0.35 : 1) * (o.child ? 0.3 : 1) * (o.minion ? 0.25 : 1);
    let dna = dnaAt(w) * t.dna * (V ? V.dna : 1) * (o.child ? 0.4 : 1) * (o.minion ? 0.3 : 1);
    if (o.boss) { r = C.R_BASE * 2.7 * Math.min(1.25, t.size); hp = o.hp; dna = o.dna; }
    let p;
    if (o.x !== undefined) p = { x: o.x, y: o.y };
    else p = edgePoint(r);
    const ge = {
      id: T.nid++, type: t.id, v, x: p.x, y: p.y, vx: 0, vy: 0, r, hp, maxHp: hp, dna,
      alive: true, born: T.time, seed: (rnd() * 1e9) | 0, ph: rnd(), cool: 0,
      boss: !!o.boss, bossDef: o.bossDef || null, child: !!o.child, minion: !!o.minion, flee: false,
      life: v === 'gold' || v === 'rainbow' ? C.GOLD_LIFE : 0, sp: 1.1 * t.sp * (V ? V.sp : 1) * (ob ? 1.25 : 1) * (o.child ? 1.4 : 1),
      tx: 0, ty: 0, hitT: -9,
    };
    const q = o.boss ? { x: 0, y: (T.bounds.y0 + T.bounds.y1) / 2 + 0.6 } : innerPoint(r + 0.3);
    ge.tx = q.x; ge.ty = q.y;
    if (o.ang !== undefined) { ge.vx = Math.cos(o.ang) * 4; ge.vy = Math.sin(o.ang) * 4; }
    T.germs.push(ge);
    emit('gSpawn', ge);
    return ge;
  }
  function find(id) { for (const x of T.germs) if (x.id === id) return x; return null; }
  function ghostHidden(ge) { return ge.v === 'ghost' && Math.sin(T.time * 2.2 + ge.ph * 6.28) < -0.35; }
  function removeGerm(ge) { const i = T.germs.indexOf(ge); if (i >= 0) T.germs.splice(i, 1); }

  // ------------------------------------------------------------- 斬る
  // o: { speed: 振りの速さ, core: 芯を通ったか, ang: 振った向き（ワールド）, x, y: 画面の当たった所 }
  function slice(id, o) {
    const ge = find(id);
    if (!ge || !ge.alive || ge.flee) return null;
    if (ge.cool > T.time) return null;
    if (ghostHidden(ge)) return { miss: true, g: ge };
    ge.cool = T.time + C.HIT_COOL;
    const s = S(), st = stats();
    const stier = speedTier(o.speed || 0);
    let bonus = C.SPEED_BONUS[stier];
    if (bonus > 0) bonus *= st.drawK;
    let dmg = st.kdmg * (1 + bonus);
    const core = !!o.core;
    if (core) dmg *= st.coreM;
    const crit = rnd() < st.critC;
    if (crit) dmg *= st.critM;
    T.combo++;
    T.comboT = st.comboWin;
    dmg *= comboMult();
    // 一閃: 前の1体から0.5秒以内に斬り続けると、同じ一振りとして数える
    if (T.stroke && T.stroke.kills > 0 && T.time - T.stroke.last > C.ISSEN_GAP) { strokeEnd(); strokeStart(); }
    const k = T.stroke ? T.stroke.kills : 0;
    dmg *= 1 + Math.min(k, C.ISSEN_CAP) * st.issen;
    if (T.outbreak > 0) dmg *= 2;
    if (ge.boss) dmg *= st.bossM;
    let deflect = false;
    if (ge.v === 'armor' && stier < 3 && !core) { dmg *= 0.08; deflect = true; s.stats.gDeflects++; }
    ge.hp -= dmg;
    ge.hitT = T.time;
    s.stats.gSlices++;
    if (core) s.stats.gCores++;
    if (crit) s.stats.gCrits++;
    if (T.combo > s.stats.gMaxCombo) s.stats.gMaxCombo = T.combo;
    for (const [n, name] of GD.COMBO_MS) if (T.combo === n) emit('gComboMs', { n, name });
    if (T.stroke) T.stroke.hits++;
    G.gainXp(0.25);
    // 奥義ゲージ
    const oi = ougiInfo();
    if (oi && !T.ougiPending) {
      T.ougi += 1 + (core ? 1 : 0) + (crit ? 2 : 0);
      if (T.ougi >= oi.need) { T.ougi = 0; fireOugi(oi); }
    }
    const killed = ge.hp <= 0;
    const ev = { g: ge, dmg, core, crit, stier, deflect, combo: T.combo, x: o.x, y: o.y, ang: o.ang || 0, n: k + 1, killed };
    if (!killed) {
      // 斬られた勢いで流される
      ge.vx += Math.cos(ev.ang) * (ge.boss ? 0.4 : 3.2);
      ge.vy += Math.sin(ev.ang) * (ge.boss ? 0.4 : 3.2);
      if (rnd() < st.zanshin) T.pending.push({ t: T.time + 0.32, kind: 'zanshin', id: ge.id, dmg: dmg * 0.6, ang: ev.ang + Math.PI / 2 });
    }
    emit('gSlice', ev);
    if (killed) kill(ge, { src: 'slice', ang: ev.ang, issen: k + 1, x: o.x, y: o.y });
    return ev;
  }
  function kill(ge, o) {
    if (!ge.alive) return;
    ge.alive = false;
    ge.ang = o.ang || 0;
    const s = S(), g = gs(), st = stats();
    const issen = o.issen || 1;
    let dna = ge.dna * st.dnaMult * (1 + Math.min(issen - 1, C.ISSEN_CAP) * st.issen) * (T.outbreak > 0 ? C.OUT_DNA : 1) * (1 + (comboMult() - 1) * 0.5);
    gainDna(dna);
    s.stats.gKills++;
    if (ge.v === 'gold') s.stats.gGoldens++;
    if (ge.v === 'rainbow') s.stats.gRainbows++;
    if (ge.v && ge.v !== 'gold' && ge.v !== 'rainbow') s.stats.gElites++;
    if (ge.child) s.stats.gSplits++;
    if (T.outbreak > 0) { T.outKills++; T.outDna += dna; }
    if (T.stroke && o.src === 'slice') { T.stroke.kills++; T.stroke.dna += dna; T.stroke.last = T.time; }
    if (rnd() < 0.0015 * G.mutv('m_gem') || (ge.v === 'rainbow')) G.gainGems(ge.v === 'rainbow' ? 10 : 1);
    removeGerm(ge);
    const t = TY[ge.type];
    emit('gKill', { g: ge, dna, issen, src: o.src, ang: ge.ang, x: o.x, y: o.y });
    // 分裂・胞子
    if (!ge.child && !ge.boss) {
      const nSplit = (t.split || 0) + (ge.v === 'split' ? 2 : 0);
      for (let i = 0; i < nSplit; i++) spawn({ child: true, type: t.id, x: ge.x + (i - (nSplit - 1) / 2) * ge.r * 0.8, y: ge.y, ang: ge.ang + (i % 2 ? Math.PI / 2 : -Math.PI / 2) });
      for (let i = 0; i < (t.burst || 0); i++) spawn({ child: true, type: t.id, x: ge.x, y: ge.y, ang: (i / t.burst) * Math.PI * 2 + rnd() });
    }
    if (ge.v === 'rainbow' && T.outbreak <= 0 && !T.boss) startOutbreak();
    if (ge.boss) { bossWin(ge); return; }
    if (!ge.child && !ge.minion && !T.pendingBoss && !T.boss) {
      g.wkills++;
      if (g.wkills >= C.WAVE_KILLS) {
        if (!g.farming) advanceWave();
        else g.wkills = 0;
      }
    }
  }
  function strokeStart() { T.stroke = { kills: 0, hits: 0, dna: 0, t0: T.time, last: T.time }; }
  function strokeEnd() {
    const sk = T.stroke;
    T.stroke = null;
    if (!sk) return null;
    if (sk.kills >= 2) {
      const st = S().stats;
      if (sk.kills > st.gBestIssen) st.gBestIssen = sk.kills;
      if (sk.kills >= 5) st.gIssen5++;
      const bonus = sk.dna * 0.05 * (sk.kills - 1);
      gainDna(bonus);
      const gems = sk.kills >= 15 ? 3 : sk.kills >= 8 ? 1 : 0;
      if (gems) G.gainGems(gems);
      emit('gIssen', { n: sk.kills, dna: sk.dna + bonus, bonus, gems, name: GD.issenName(sk.kills) });
    }
    return sk;
  }

  // ------------------------------------------------------------- ウェーブ・ボス・大発生
  function advanceWave() {
    const g = gs(), s = S();
    const prevBiome = biomeIndex(g.wave);
    g.wkills = 0;
    g.wave++;
    if (g.wave > g.maxWave) g.maxWave = g.wave;
    if (g.wave > (s.stats.gBestWave || 1)) s.stats.gBestWave = g.wave;
    const boss = isBossWave(g.wave);
    emit('gWave', { wave: g.wave, boss, biome: biomeIndex(g.wave) !== prevBiome });
    if (boss) { T.pendingBoss = true; T.bossDelay = 1.4; }
  }
  function bossDef(w) {
    const n = w / C.BOSS_EVERY - 1;
    return GD.BOSSES[((n % GD.BOSSES.length) + GD.BOSSES.length) % GD.BOSSES.length];
  }
  function startBoss() {
    T.pendingBoss = false;
    const g = gs(), st = stats();
    const B = bossDef(g.wave);
    const t = TY[B.type];
    const hp = hpAt(g.wave) * C.BOSS_HP_MULT * t.hp;
    for (const x of T.germs) x.flee = true;
    const ge = spawn({ boss: true, type: B.type, bossDef: B, hp, dna: dnaAt(g.wave) * t.dna * 40, x: 0, y: T.bounds.y1 + 3 });
    T.boss = ge;
    T.bossTimer = st.bossTime;
    T.summonT = 3;
    emit('gBossStart', { g: ge, def: B, time: T.bossTimer });
  }
  function bossWin(ge) {
    T.boss = null;
    const g = gs(), s = S();
    s.stats.gBosses++;
    const factor = 1 + Math.floor(g.wave / C.FACTOR_EVERY);
    g.factor += factor;
    s.stats.gFactorAll += factor;
    const gems = 5 + Math.floor(g.wave / 10) * 2;
    G.gainGems(gems);
    G.gainXp(30);
    const w = g.wave;
    for (const x of T.germs) if (x.minion) x.flee = true;
    advanceWave();
    emit('gBossWin', { g: ge, factor, gems, wave: w, def: ge.bossDef });
    G.save();
  }
  function bossFail() {
    const ge = T.boss;
    T.boss = null;
    if (ge) { ge.alive = false; removeGerm(ge); }
    for (const x of T.germs) if (x.minion) x.flee = true;
    const g = gs();
    g.wave = Math.max(1, g.wave - 1);
    g.wkills = 0;
    g.farming = true;
    emit('gBossFail', { g: ge, def: ge && ge.bossDef });
  }
  function challengeBoss() {
    const g = gs();
    if (!g.farming || T.boss || T.pendingBoss) return false;
    g.farming = false;
    g.wave++;
    g.wkills = 0;
    T.pendingBoss = true;
    T.bossDelay = 0.6;
    emit('gWave', { wave: g.wave, boss: true, biome: false });
    return true;
  }
  function startOutbreak() {
    const st = stats();
    T.outbreak = st.outTime;
    T.outNext = rand(C.OUT_MIN, C.OUT_MAX) / st.outFreq;
    T.outKills = 0; T.outDna = 0;
    S().stats.gOutbreaks++;
    T.spawnT = 0;
    emit('gOutbreak', { time: T.outbreak });
  }

  // ------------------------------------------------------------- 奥義（SSR以上の刀）
  function ougiInfo() {
    const st = stats();
    const eq = st.eq, sk = eq && GD.OUGI[eq.id];
    return sk ? { sk, kat: eq, need: GD.OUGI_TIER[eq.r].need, gauge: T.ougi, mult: GD.OUGI_TIER[eq.r].mult } : null;
  }
  function fireOugi(oi) {
    const st = stats();
    T.ougiPending = { t: T.time + C.OUGI_DELAY, id: oi.kat.id, kat: oi.kat, sk: oi.sk, dmg: st.kdmg * oi.mult * comboMult() };
    S().stats.gOugi++;
    gs().ougiSeen[oi.kat.id] = 1;
    emit('gOugi', T.ougiPending);
  }
  // 斬撃の形ごとの角度（菌が割れる向き）
  const PAT = {
    cross: [Math.PI / 4, -Math.PI / 4], x: [Math.PI / 3, -Math.PI / 3], grid: [0, Math.PI / 2], rain: [Math.PI / 2], triple: [Math.PI / 5],
    star: [0, Math.PI / 5, (2 * Math.PI) / 5, (3 * Math.PI) / 5, (4 * Math.PI) / 5], fan: [Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3],
    zigzag: [0.3, -0.3], circle: null, spiral: null, random: null, omega: null,
  };
  function ougiHit(p) {
    const st = stats();
    const list = T.germs.filter((x) => x.alive && !x.flee);
    const angs = PAT[p.sk.slash];
    let kills = 0, dna0 = S().stats.gDnaAll;
    const hits = [];
    for (const ge of list) {
      const ang = angs ? angs[Math.floor(rnd() * angs.length)] : rnd() * Math.PI;
      const d = p.dmg * (ge.boss ? st.bossM : 1) * (T.outbreak > 0 ? 2 : 1);
      ge.hp -= d;
      ge.hitT = T.time;
      hits.push({ g: ge, dmg: d, ang });
    }
    emit('gOugiHit', Object.assign({ hits }, p));
    for (const h of hits) if (h.g.hp <= 0 && h.g.alive) { kills++; kill(h.g, { src: 'ougi', ang: h.ang, issen: kills }); }
    emit('gOugiDone', { kills, dna: S().stats.gDnaAll - dna0, sk: p.sk, kat: p.kat });
  }

  // ------------------------------------------------------------- 免疫細胞（放置）
  function cellAttack(sec) {
    const st = stats();
    if (st.cellDps <= 0) return;
    const list = T.germs.filter((x) => x.alive && !x.flee && !ghostHidden(x));
    if (!list.length) return;
    const g = gs();
    let best = null;
    for (const c of GD.CELLS) if (g.cells[c.id]) best = c;
    // いちばん弱った菌を狙いやすい
    list.sort((a, b) => a.hp - b.hp);
    const tgt = rnd() < 0.6 ? list[0] : list[Math.floor(rnd() * list.length)];
    const d = st.cellDps * sec * (T.outbreak > 0 ? 2 : 1) * (tgt.boss ? st.bossM : 1);
    tgt.hp -= d;
    emit('gCell', { g: tgt, dmg: d, cell: best });
    if (tgt.hp <= 0) { S().stats.gCellKills++; kill(tgt, { src: 'cell', ang: rnd() * Math.PI }); }
  }
  const cellCost = (c, have, n = 1) => {
    const r = 1.15;
    return (c.cost * Math.pow(r, have) * (Math.pow(r, n) - 1)) / (r - 1);
  };
  function cellMax(c, have, dna) {
    const r = 1.15;
    const base = c.cost * Math.pow(r, have);
    if (dna < base) return 0;
    return Math.max(1, Math.floor(Math.log((dna * (r - 1)) / base + 1) / Math.log(r)));
  }
  function buyCell(id, amt) {
    const c = CE[id], g = gs();
    if (!c) return false;
    const have = g.cells[id] || 0;
    const n = amt === 'max' ? cellMax(c, have, g.dna) : amt;
    if (!(n > 0)) return false;
    const cost = cellCost(c, have, n);
    if (cost > g.dna) return false;
    g.dna -= cost;
    g.cells[id] = have + n;
    dirty();
    emit('gBuyCell', { c, n: g.cells[id], added: n });
    return true;
  }
  function unitCellDps(c) {
    const st = stats(), n = gs().cells[c.id] || 0;
    return c.dps * msMult(n) * st.imm * st.global;
  }

  // ------------------------------------------------------------- 研ぎ・変異
  const upgCost = (u, l = lv(u.id)) => u.base * Math.pow(u.growth, l);
  const upgMaxed = (u) => u.max > 0 && lv(u.id) >= u.max;
  function buyUpg(id) {
    const u = UP[id], g = gs();
    if (!u || upgMaxed(u)) return false;
    const c = upgCost(u);
    if (c > g.dna) return false;
    g.dna -= c;
    g.upg[id] = lv(id) + 1;
    dirty();
    emit('gBuyUpg', { u, lv: g.upg[id] });
    return true;
  }
  const mutLv = (id) => gs().muts[id] || 0;
  const mutCost = (m, l = mutLv(m.id)) => Math.ceil(m.base * Math.pow(m.growth, l));
  const mutMaxed = (m) => mutLv(m.id) >= m.max;
  function buyMut(id) {
    const m = MU[id], g = gs();
    if (!m || mutMaxed(m)) return false;
    const c = mutCost(m);
    if (c > g.factor) return false;
    g.factor -= c;
    g.muts[id] = mutLv(id) + 1;
    S().stats.gMutBuys++;
    dirty();
    G.dirty();
    emit('gBuyMut', { m, lv: g.muts[id] });
    return true;
  }

  // ------------------------------------------------------------- 刀ガチャ（自動）
  function kLuckNow() { return stats().luckBase * (1 + 0.003 * Math.min(T.combo, 100)) * (T.outbreak > 0 ? 1.5 : 1) * G.buffOf('luck'); }
  function kRollRate() {
    if (S().study || !inDim()) return 0;
    return stats().rollBase * (T.outbreak > 0 ? 2 : 1) * (1 + 0.005 * Math.min(T.combo, 100)) * G.buffOf('roll') * G.gameSpeed();
  }
  const kgNeed = (l) => Math.floor(C.KLV_BASE * Math.pow(C.KLV_GROW, l - 1));
  function kgXp(n, quiet) {
    const g = gs();
    g.kgXp = (g.kgXp || 0) + n;
    const ups = [];
    while (g.kgXp >= kgNeed(g.kgLv || 1)) {
      g.kgXp -= kgNeed(g.kgLv || 1);
      g.kgLv = (g.kgLv || 1) + 1;
      const gems = 3 + Math.floor(g.kgLv / 2);
      G.gainGems(gems);
      ups.push({ lv: g.kgLv, gems, tickets: 0 });
    }
    if (ups.length) { dirty(); if (!quiet) emit('kgLevel', ups[ups.length - 1]); }
    return ups;
  }
  function grantK(k, r) {
    const g = gs();
    const had = g.kat[k.id] || 0;
    const now = had + 1;
    g.kat[k.id] = now;
    const key = 'gGot' + r;
    if (key in S().stats) S().stats[key]++;
    return { axe: k, r, isNew: !had, lvUp: had > 0 && lvOf(now) > lvOf(had), lv: lvOf(now), copies: now, gems: 0, kind: 'katana' };
  }
  function autoEquipK(best) {
    const g = gs();
    const cur = g.keq && KAT[g.keq];
    if (best && (!cur || RANK[best.r] > RANK[cur.r])) { g.keq = best.axe.id; emit('kEquip', best.axe); }
  }
  function kroll(n, luck, quiet) {
    if (!(n > 0)) return null;
    const s = S();
    const counts = D.RARITY_ORDER.map(() => 0);
    const notable = [];
    let best = null, rare = 0, changed = false;
    for (let i = 0; i < n; i++) {
      const r = G.rollRarity(luck);
      const ri = RANK[r];
      const pool = POOL[r];
      const o = grantK(pool[Math.floor(rnd() * pool.length)], r);
      counts[ri]++;
      if (ri >= 4) rare++;
      if (o.isNew || o.lvUp) changed = true;
      if (!best || ri > RANK[best.r] || (ri === RANK[best.r] && o.isNew && !best.isNew)) best = o;
      if ((ri >= 4 || (o.isNew && ri >= 2) || (o.lvUp && ri >= 3)) && notable.length < 40) notable.push(o);
    }
    s.stats.gRolls += n;
    s.stats.gRareRolls += rare;
    const ups = kgXp(n, quiet);
    if (RANK[best.r] > (s.stats.gBestKat || 0)) s.stats.gBestKat = RANK[best.r];
    autoEquipK(best);
    if (changed) { dirty(); G.dirty(); }
    const res = { n, counts, best, notable, luck, newSets: [], levelUps: ups.length, gachaLv: gs().kgLv, kind: 'katana' };
    if (!quiet) emit('kRoll', res);
    return res;
  }
  function equipK(id) {
    const g = gs();
    if (!g.kat[id]) return false;
    g.keq = id;
    T.ougi = 0;
    dirty();
    emit('kEquip', KAT[id]);
    return true;
  }

  // ------------------------------------------------------------- 次元の移動
  function resetRun() {
    T.germs.length = 0;
    T.combo = 0; T.comboT = 0; T.stroke = null; T.pending = [];
    T.outbreak = 0; T.outNext = rand(C.OUT_MIN * 0.5, C.OUT_MAX * 0.6);
    T.boss = null; T.pendingBoss = false; T.ougiPending = null; T.spawnT = 0.8;
  }
  function enter() {
    if (!open() || inDim()) return false;
    const g = gs(), s = S();
    s.dim = 'germ';
    s.stats.gVisits++;
    resetRun();
    if (!g.keq) { const k = KAT.k_bokuto; g.kat.k_bokuto = g.kat.k_bokuto || 1; g.keq = k.id; }
    dirty();
    emit('dim', { to: 'germ', first: s.stats.gVisits === 1 });
    // 入ったらすぐ斬れるように、最初の3体は画面の中に出す
    if (isBossWave(g.wave) && !g.farming) { T.pendingBoss = true; T.bossDelay = 2.2; }
    else for (let i = 0; i < 3; i++) { const q = innerPoint(1); spawn({ x: q.x, y: q.y }); }
    G.save();
    return true;
  }
  function leave() {
    if (!inDim()) return false;
    S().dim = 'forest';
    resetRun();
    emit('dim', { to: 'forest', away: G.takeAway() });
    G.save();
    return true;
  }

  // ------------------------------------------------------------- 移動とティック
  function setBounds(b) { T.bounds = b; }
  function move(dt) {
    const b = T.bounds;
    const list = T.germs;
    for (let i = list.length - 1; i >= 0; i--) {
      const ge = list[i];
      if (!ge.alive) { list.splice(i, 1); continue; }
      if (ge.life > 0) { ge.life -= dt; if (ge.life <= 0) ge.flee = true; }
      if (ge.flee) {
        // 画面の外へ逃げる
        const dx = ge.x >= 0 ? 1 : -1;
        ge.vx += dx * 9 * dt;
        ge.vy += 2 * dt;
        ge.x += ge.vx * dt;
        ge.y += ge.vy * dt;
        if (Math.abs(ge.x) > Math.max(-b.x0, b.x1) + ge.r * 3 || ge.y > b.y1 + ge.r * 4) {
          list.splice(i, 1);
          if (ge.v === 'gold' || ge.v === 'rainbow') emit('gEscape', ge);
          else emit('gGone', ge);
        }
        continue;
      }
      if (ge.boss) {
        // ボスは中央でゆらゆら
        ge.tx = Math.sin(T.time * 0.5) * (b.x1 - b.x0) * 0.18;
        ge.ty = (b.y0 + b.y1) / 2 + 1 + Math.sin(T.time * 0.8) * 0.5;
      } else if (Math.hypot(ge.tx - ge.x, ge.ty - ge.y) < 0.6) {
        const q = innerPoint(ge.r + 0.3);
        ge.tx = q.x; ge.ty = q.y;
      }
      const dx = ge.tx - ge.x, dy = ge.ty - ge.y, d = Math.hypot(dx, dy) || 1;
      // 画面の外から入ってくるときは素早く
      const inside = ge.x > b.x0 && ge.x < b.x1 && ge.y > b.y0 && ge.y < b.y1;
      const sp = ge.boss ? (inside ? 1.6 : 4) : ge.sp * (inside ? 1 : 3.5);
      const k = Math.min(1, dt * 1.6);
      ge.vx += ((dx / d) * sp - ge.vx) * k;
      ge.vy += ((dy / d) * sp - ge.vy) * k;
      ge.x += ge.vx * dt;
      ge.y += ge.vy * dt;
    }
    // 重なりすぎないように押し合う
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.flee) continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j];
        if (c.flee) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 0.001, m = (a.r + c.r) * 0.92;
        if (d < m) {
          const p = ((m - d) / d) * 0.5;
          const wa = a.boss ? 0.05 : c.boss ? 0.95 : 0.5;
          a.x -= dx * p * wa * 2; a.y -= dy * p * wa * 2;
          c.x += dx * p * (1 - wa) * 2; c.y += dy * p * (1 - wa) * 2;
        }
      }
    }
  }
  // 森にいる間: 免疫細胞が稼いだDNAだけ入る
  function bgTick(dt) {
    if (!open()) return;
    T.bgAcc += dt;
    if (T.bgAcc >= 1) { gainDna(cellRate() * T.bgAcc * G.gameSpeed()); T.bgAcc = 0; }
  }
  function tick(dt) {
    if (!HAS_G()) return;
    const s = S();
    if (s.study) return;
    T.time += dt;
    T.dnaT += dt;
    if (T.dnaT >= 1) { const r = T.dnaAcc / T.dnaT; T.dnaEMA = T.dnaEMA ? T.dnaEMA * 0.7 + r * 0.3 : r; T.dnaAcc = 0; T.dnaT = 0; }
    if (!inDim()) { bgTick(dt); return; }
    s.stats.gTime += dt;
    const g = gs(), st = stats();
    const gdt = dt * G.gameSpeed();
    // 連斬
    if (T.combo > 0) {
      T.comboT -= dt;
      if (T.comboT <= 0) { emit('gComboEnd', { n: T.combo }); T.combo = 0; }
    }
    // 大発生
    if (T.outbreak > 0) {
      T.outbreak -= dt;
      if (T.outbreak <= 0) { T.outbreak = 0; emit('gOutbreakEnd', { kills: T.outKills, dna: T.outDna }); }
    } else if (!T.boss && !T.pendingBoss) {
      T.outNext -= dt;
      if (T.outNext <= 0) startOutbreak();
    }
    // 遅れて入る斬撃（残心）・奥義
    if (T.pending.length) {
      for (let i = 0; i < T.pending.length; i++) {
        const p = T.pending[i];
        if (T.time < p.t) continue;
        T.pending.splice(i--, 1);
        const ge = find(p.id);
        if (!ge || !ge.alive) continue;
        ge.hp -= p.dmg;
        ge.hitT = T.time;
        emit('gZanshin', { g: ge, dmg: p.dmg, ang: p.ang });
        if (ge.hp <= 0) kill(ge, { src: 'zanshin', ang: p.ang });
      }
    }
    if (T.ougiPending && T.time >= T.ougiPending.t) { const p = T.ougiPending; T.ougiPending = null; ougiHit(p); }
    // 押したまま間があいたら、そこで一閃を区切る
    if (T.stroke && T.stroke.kills > 0 && T.time - T.stroke.last > C.ISSEN_GAP) { strokeEnd(); strokeStart(); }
    // ボス
    if (T.pendingBoss) {
      T.bossDelay -= dt;
      if (T.bossDelay <= 0) startBoss();
    } else if (T.boss) {
      T.bossTimer -= dt;
      T.summonT -= gdt;
      if (T.summonT <= 0 && T.germs.length < 7) {
        T.summonT = 3.2;
        const b = T.boss;
        for (let i = 0; i < 2; i++) spawn({ minion: true, type: b.type, x: b.x + (i ? 1 : -1) * b.r * 0.9, y: b.y - b.r * 0.4, ang: (i ? 0 : Math.PI) + rand(-0.5, 0.5) });
        emit('gSummon', { g: b });
      }
      if (T.bossTimer <= 0) bossFail();
    } else {
      // 次の菌
      T.spawnT -= gdt;
      if (T.spawnT <= 0) {
        const alive = T.germs.filter((x) => !x.flee).length;
        if (alive < maxGerms()) spawn();
        T.spawnT = C.SPAWN_GAP * (T.outbreak > 0 ? 0.22 : alive < 2 ? 0.4 : 1);
      }
    }
    move(gdt);
    // 免疫細胞
    T.cellT -= gdt;
    if (T.cellT <= 0) { T.cellT = C.CELL_TICK; cellAttack(C.CELL_TICK); }
    // 刀ガチャ
    T.rollAcc += kRollRate() * dt;
    if (T.rollAcc >= 1) {
      const n = Math.min(C.ROLL_TICK_MAX, Math.floor(T.rollAcc));
      T.rollAcc = Math.min(T.rollAcc - n, C.ROLL_TICK_MAX);
      kroll(n, kLuckNow());
    }
    void st;
  }
  const HAS_G = () => typeof G !== 'undefined' && G.S && G.S.germ;

  // ------------------------------------------------------------- 離れていた間
  function offline(sec, eff, slept) {
    if (!open()) return null;
    const dna = cellRate() * sec * eff * (slept ? 1.5 : 1);
    gainDna(dna);
    const k = inDim() ? kroll(Math.min(C.OFFLINE_ROLL_MAX, Math.floor(stats().rollBase * sec * eff * 0.5)), stats().luckBase, true) : null;
    return { dna, krolls: k };
  }

  return {
    T, C, TY, CE, UP, MU, KAT, POOL,
    stats, dirty, tick, slice, strokeStart, strokeEnd, enter, leave, setBounds, open, inDim,
    hpAt, dnaAt, biomeIndex, isBossWave, bossDef, maxGerms, comboMult, speedTier, ghostHidden,
    buyCell, cellCost, cellMax, unitCellDps, buyUpg, upgCost, upgMaxed, buyMut, mutCost, mutMaxed, mutLv,
    kroll, kLuckNow, kRollRate, kgNeed, equipK, ougiInfo, challengeBoss, cellRate, offline, startOutbreak,
    lv, msMult, spawn,
    get dnaRate() { return T.dnaEMA; },
  };
})();

if (typeof module !== 'undefined') module.exports = { GM };
