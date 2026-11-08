'use strict';
// =====================================================================
//  germ.js — 菌斬り次元のゲームロジック v2（DOM非依存）
//  気持ちよさの柱:
//  ・群れ: 一振りでまとめて斬れる隊列（放り上げ・横一列・縦一列・弧・輪・蛇・V字・破裂）
//  ・一閃: 0.5秒以内に斬り続けると同じ一振り。2体目以降は倍率アップ
//  ・斬撃ランク E〜SSS（斬り方の多彩さと勢い）。上がるほどDNAとガチャが伸び、画面が変わる
//  ・無双モード: ゲージが満タンでダメージ×4・DNA×2・群れが押し寄せる
//  ・誘爆: 爆裂菌や誘爆で連鎖爆発。雷刃・炎刃・氷刃の秘技
//  ・スロット菌（777）・宝箱菌・ラッキー細胞・ボスの段階と弱点ととどめ
//  ・株（14種×10）と図鑑。初めて斬った株は図鑑に登録
//  状態は G.S.germ（セーブされる）、ここの T は実行時だけ。演出は G.on('g…') で購読する。
// =====================================================================
const GM = (() => {
  const C = GD.CFG;
  const S = () => G.S;
  // 今の次元の状態（0番 = 菌斬り次元は G.S.germ、1番以降は G.S.dims）と、その次元の記録
  const HAS_DM = typeof DM !== 'undefined' && !!DM;
  const DI = () => (HAS_DM ? DM.cur : 0);
  const gs = () => G.dstate();
  const ST = () => (DI() ? gs().gs : G.S.stats);
  const GIM = () => GD.GIM || {};
  const TY = {}, CE = {}, UP = {}, MU = {}, KAT = {};
  GD.UPGRADES.forEach((u) => (UP[u.id] = u));
  GD.MUTATIONS.forEach((m) => (MU[m.id] = m));
  let STR = {};
  const RANK = G.RANK;
  const POOL = {};
  // 次元を入れ替えたら、敵・仲間・武器の表を作り直す（同じオブジェクトを使い回す）
  function rebind() {
    for (const k in TY) delete TY[k];
    for (const k in CE) delete CE[k];
    for (const k in KAT) delete KAT[k];
    GD.TYPES.forEach((t) => (TY[t.id] = t));
    GD.CELLS.forEach((c) => (CE[c.id] = c));
    GD.KATANAS.forEach((k) => (KAT[k.id] = k));
    D.RARITY_ORDER.forEach((r) => (POOL[r] = GD.KATANAS.filter((k) => k.r === r)));
    STR = GD.STRAIN || {};
  }
  rebind();
  const SR = D.STYLE;
  const lvOf = G.lvOf;
  const emit = (e, d) => G.emit(e, d);
  const rnd = Math.random;
  const rand = (a, b) => a + rnd() * (b - a);
  // 特殊個体（v2 で増やしたもの）
  Object.assign(GD.VARIANTS, {
    bomb: { name: '爆裂', hp: 0.8, dna: 3, sp: 0.9, size: 1 },
    lucky: { name: 'スロット', hp: 0.7, dna: 2, sp: 1.3, size: 1 },
    chest: { name: '宝箱', hp: 1.2, dna: 4, sp: 0.9, size: 1.1 },
  });

  const T = {
    time: 0, germs: [], nid: 1, spawnT: 0.6, combo: 0, comboT: 0, stroke: null,
    outbreak: 0, outNext: 70, outKills: 0, outDna: 0, ougi: 0, ougiPending: null,
    boss: null, bossTimer: 0, pendingBoss: false, bossDelay: 0, summonT: 0, weakT: 0,
    cellT: 0.5, rollAcc: 0, pending: [], dirty: true, st: null, stT: 0,
    bounds: { x0: -4.3, x1: 4.3, y0: -6.5, y1: 5.5 },
    dnaAcc: 0, dnaT: 0, dnaEMA: 0, bgAcc: 0,
    rank: 0, style: 0, lastSids: [], musou: 0, musouMax: 1, musouG: 0, musouKills: 0, musouDna: 0, lastKillT: -9,
    formT: 3, formId: 1, forms: {}, booms: [], chain: { n: 0, t: -9 }, critT: 40, burnT: 0, firstLucky: 0,
    stormT: 2, slowT: 0, ladT: 0, idleT: 0, allT: 0,
  };

  // ------------------------------------------------------------- 計算
  const lv = (id) => gs().upg[id] || 0;
  const open = () => G.germOpen();
  const inDim = () => S().dim === 'germ';
  function curve(base, g1, g2, w) {
    const a = Math.min(w, C.HP_SW) - 1, b = Math.max(0, w - C.HP_SW);
    return base * Math.pow(g1, a) * Math.pow(g2, b);
  }
  // 1番以降の次元は、初めて入ったときの強さに合わせて体力を上げる（gs().hk）。新しい次元も毎回ちゃんと遊べるように
  const hkNow = () => (DI() ? Math.max(1, gs().hk || 1) : 1);
  const hpAt = (w) => curve(C.HP_BASE, C.HP_G, C.HP_G2, w) * hkNow();
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
    for (const id in g.kat) { const k = KAT[id]; if (k) pas += D.RARITY[k.r].pas * 0.5 * (k.pasK || 1) * lvOf(g.kat[id]); }
    const eq = g.keq && g.kat[g.keq] ? KAT[g.keq] : null;
    const eqLv = eq ? lvOf(g.kat[eq.id]) : 0;
    const sp = {};
    if (eq && eq.sp) for (const k in eq.sp) sp[k] = eq.sp[k] * (1 + 0.2 * (eqLv - 1));
    const st = { eq, eqLv, sp, pas };
    // 森の斧を集めるほど刀も強くなる（逆に刀の種類は森の全ダメージに効く）
    st.axeSyn = 1 + C.AXE_SYNERGY * Object.keys(s.axes).length;
    // 精霊は森では1体ごとに効くが、ここでは対数で効かせる（転生を重ねた人が一瞬で終盤まで行かないように）
    st.spiritK = 1 + 0.6 * Math.log2(1 + (s.spirits || 0) * G.mutv('m_spirit'));
    // 次元の力: 全部の次元の★・武器の種類・段位が、どの次元のダメージにも効く
    st.dimPower = HAS_DM ? DM.totals(s).power : 1;
    st.global = f.achMult * st.spiritK * f.levelMult * (1 + pas) * st.axeSyn * G.mutv('m_all') * (1 + (sp.all || 0)) * st.dimPower;
    const gm = GIM();
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
    const dex = g.dex ? Object.keys(g.dex).length : 0;
    st.dexN = dex;
    st.dexMult = 1 + C.DEX_BONUS * Math.floor(dex / C.DEX_STEP);
    st.dnaMult = Math.pow(1.15, lv('analyze')) * G.mutv('m_dna') * (1 + (sp.dna || 0)) * G.buffOf('dna') * st.dexMult * (gm.dna || 1);
    st.goldK = (1 + 0.15 * lv('gold') + (sp.gold || 0)) * (gm.gold || 1);
    st.outTime = C.OUT_TIME + lv('outbreak') + G.mutv('m_fever') + (sp.out || 0);
    st.outFreq = 1 + 0.05 * lv('outbreak');
    st.bossM = (1 + 0.25 * lv('boss')) * G.mutv('m_boss') * (1 + (sp.boss || 0));
    st.bossTime = C.BOSS_TIME + lv('boss');
    // 秘技
    st.thunderP = Math.min(0.8, 0.02 * lv('thunder') + (sp.thunder || 0) + (gm.thunder || 0));
    st.thunderN = 1 + Math.floor(lv('thunder') / 8) + (gm.thunderN || 0);
    st.fireP = Math.min(0.8, 0.02 * lv('fire') + (sp.fire || 0) + (gm.fire || 0));
    st.iceP = Math.min(0.8, 0.02 * lv('ice') + (sp.ice || 0) + (gm.ice || 0));
    st.chainP = Math.min(0.85, C.BOOM_CHAIN + 0.04 * lv('boom') + (sp.boom || 0) + (gm.chain || 0));
    st.boomR = C.BOOM_R * (1 + 0.04 * lv('boom'));
    st.musouTime = C.MUSOU_TIME + 0.5 * lv('musou') + G.mutv('m_fever') + (sp.musou || 0) + (gm.musouT || 0);
    st.musouGain = (1 + 0.05 * lv('musou')) * (gm.musou || 1);
    st.luckK = (1 + 0.15 * lv('lucky') + (sp.luckg || 0)) * (gm.lucky || 1);
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
    let base = Math.min(C.MAX_CAP, C.MAX_GERMS + Math.floor((g.wave - 1) / C.MAX_STEP)) + lv('culture');
    base = Math.max(2, Math.round(base * (GIM().max || 1)));
    if (T.musou > 0) base = Math.round(base * 1.6);
    return T.outbreak > 0 ? Math.min(28, Math.round(base * 2.2 + 4)) : base;
  }
  const comboMult = () => 1 + Math.min(T.combo, stats().comboCap) * C.COMBO_PCT;
  const styleMult = () => SR.RANKS[T.rank].mult;
  function speedTier(v) {
    let t = 0;
    for (const x of C.SPEED_TIERS) if (v >= x) t++;
    return t;
  }

  // ------------------------------------------------------------- DNA・斬撃ランク・無双ゲージ
  function gainDna(x) {
    if (!(x > 0)) return;
    const g = gs();
    g.dna += x;
    if (!isFinite(g.dna)) g.dna = Number.MAX_VALUE;
    ST().gDnaAll = Math.min(Number.MAX_VALUE, (ST().gDnaAll || 0) + x);
    T.dnaAcc += x;
  }
  function styleAdd(p) {
    if (!(p > 0)) return;
    T.style = Math.min(SR.MAX, T.style + p * (T.musou > 0 ? 1.5 : 1));
    updateRank();
  }
  function updateRank() {
    let r = 0;
    for (let i = SR.RANKS.length - 1; i >= 0; i--) if (T.style >= SR.RANKS[i].th) { r = i; break; }
    if (r === T.rank) return;
    const prev = T.rank;
    T.rank = r;
    if (r > (ST().gBestRank || 0)) ST().gBestRank = r;
    emit('gRank', { rank: r, prev, up: r > prev });
  }
  function musouAdd(p) {
    if (T.musou > 0 || !(p > 0)) return;
    T.musouG = Math.min(100, T.musouG + p * stats().musouGain);
    if (T.musouG >= 100) startMusou();
  }
  function startMusou() {
    const st = stats();
    T.musou = st.musouTime;
    T.musouMax = T.musou;
    T.musouG = 0; T.musouKills = 0; T.musouDna = 0;
    ST().gMusou++;
    T.formT = 0.3; T.spawnT = 0;
    emit('gMusou', { time: T.musou });
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
  // 株: ウェーブが進むと新しい株が出る（新しい株ほど出やすい）
  function pickStrain(t) {
    const maxS = Math.min(9, Math.floor((gs().wave - t.wave) / 9));
    if (maxS <= 0) return 0;
    return rnd() < 0.45 ? maxS : Math.floor(rnd() * (maxS + 1));
  }
  function pickVariant() {
    const st = stats(), w = gs().wave;
    if (rnd() < C.RAINBOW_CHANCE * st.goldK) return 'rainbow';
    if (rnd() < C.GOLD_CHANCE * st.goldK) return 'gold';
    if (rnd() < C.LUCKY_CHANCE * st.luckK) return 'lucky';
    if (rnd() < C.CHEST_CHANCE * st.luckK) return 'chest';
    const gm = GIM();
    if (w >= 3 && rnd() < C.BOMB_CHANCE * (1 + 0.04 * lv('boom')) * (gm.bomb || 1)) return 'bomb';
    if (gm.armor && w >= 2 && rnd() < gm.armor) return 'armor';
    if (gm.ghost && w >= 2 && rnd() < gm.ghost) return 'ghost';
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
    const s = o.strain != null ? o.strain : o.boss || o.core || o.critter ? 0 : pickStrain(t);
    const X = STR[`${t.id}_${s}`] || { sid: `${t.id}_0`, hp: 1, dna: 1, sp: 1 };
    const v = o.v !== undefined ? o.v : o.boss || o.child || o.minion || o.form ? null : pickVariant();
    const V = v && GD.VARIANTS[v] ? GD.VARIANTS[v] : null;
    const ob = T.outbreak > 0 && !o.boss;
    const w = g.wave;
    let r = C.R_BASE * t.size * (V ? V.size : 1) * (ob ? 0.8 : 1) * (o.child ? 0.62 : 1) * (o.minion ? 0.7 : 1) * (o.form ? C.FORM_R : 1);
    let hp = hpAt(w) * t.hp * X.hp * (V ? V.hp : 1) * (ob ? 0.35 : 1) * (o.child ? 0.3 : 1) * (o.minion ? 0.25 : 1) * (o.form ? C.FORM_HP : 1);
    let dna = dnaAt(w) * t.dna * X.dna * (V ? V.dna : 1) * (o.child ? 0.4 : 1) * (o.minion ? 0.3 : 1) * (o.form ? C.FORM_DNA : 1);
    const gm = GIM();
    const plain = !o.boss && !o.core && !o.critter;
    if (plain) { r *= gm.size || 1; hp *= gm.hp || 1; }
    // 重力: 下から放り上げる / 渦潮: 画面の中心を回る
    if (plain && !o.path && !o.child && !o.minion && !o.form && o.x === undefined) {
      const b = T.bounds, W = b.x1 - b.x0, H = b.y1 - b.y0;
      if (gm.toss && rnd() < gm.toss) {
        const grav = 9, x0 = b.x0 + W * (0.12 + 0.76 * rnd());
        o.path = { t0: T.time, kind: 'toss', x0, y0: b.y0 - 1, vx: ((b.x0 + b.x1) / 2 - x0) * 0.22 + (rnd() - 0.5) * 1.2, vy: Math.sqrt(2 * grav * (H + 0.6)) * (0.8 + rnd() * 0.2), g: -grav };
        o.x = x0; o.y = b.y0 - 1;
      } else if (gm.vortex && rnd() < 0.85) {
        const R = 1.2 + rnd() * Math.min(W, H) * 0.34, a0 = rnd() * Math.PI * 2;
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        o.path = { t0: T.time, kind: 'ring', x0: cx, y0: cy, vx: 0, vy: 0, a0, w: (rnd() < 0.5 ? 1 : -1) * (0.45 + rnd() * 0.4), R };
        o.x = cx + Math.cos(a0) * R; o.y = cy + Math.sin(a0) * R;
      }
    }
    if (o.boss) { r = C.R_BASE * 2.7 * Math.min(1.25, t.size); hp = o.hp; dna = o.dna; }
    if (o.critter) { r = 0.62; hp = hpAt(w) * 0.2; dna = 0; }
    if (o.core) { r = 0.42; hp = 1e300; dna = 0; }
    const p = o.x !== undefined ? { x: o.x, y: o.y } : edgePoint(r);
    const ge = {
      id: T.nid++, type: t.id, v, x: p.x, y: p.y, vx: 0, vy: 0, r, hp, maxHp: hp, dna,
      alive: true, born: T.time, seed: (rnd() * 1e9) | 0, ph: rnd(), cool: 0,
      boss: !!o.boss, bossDef: o.bossDef || null, child: !!o.child, minion: !!o.minion, flee: false,
      life: v === 'gold' || v === 'rainbow' || v === 'lucky' ? C.GOLD_LIFE : 0, sp: 1.1 * t.sp * X.sp * (V ? V.sp : 1) * (ob ? 1.25 : 1) * (o.child ? 1.4 : 1) * (o.boss ? 1 : gm.sp || 1),
      tx: 0, ty: 0, hitT: -9, strain: s, sid: X.sid, form: o.form || 0, path: o.path || null, crit: !!o.critter, core: !!o.core,
      burn: null, frozen: 0, phase: 0, wasIn: false,
    };
    const q = o.boss ? { x: 0, y: (T.bounds.y0 + T.bounds.y1) / 2 + 0.6 } : innerPoint(r + 0.3);
    ge.tx = q.x; ge.ty = q.y;
    if (o.ang !== undefined) { ge.vx = Math.cos(o.ang) * (o.speed || 4); ge.vy = Math.sin(o.ang) * (o.speed || 4); }
    T.germs.push(ge);
    emit('gSpawn', ge);
    return ge;
  }
  function find(id) { for (const x of T.germs) if (x.id === id) return x; return null; }
  function ghostHidden(ge) { return ge.v === 'ghost' && Math.sin(T.time * 2.2 + ge.ph * 6.28) < -0.35; }
  function removeGerm(ge) { const i = T.germs.indexOf(ge); if (i >= 0) T.germs.splice(i, 1); }
  const targetable = (x) => x.alive && !x.flee && !x.core && !x.crit;

  // ------------------------------------------------------------- 群れ（一振りでまとめて斬れる隊列）
  const FORMS = ['toss', 'row', 'col', 'arc', 'ring', 'snake', 'v', 'burst', 'toss', 'row'];
  function spawnForm(kind) {
    const b = T.bounds, g = gs();
    kind = kind || FORMS[Math.floor(rnd() * FORMS.length)];
    const t = pickType(), s = pickStrain(t);
    const W = b.x1 - b.x0, H = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let n = Math.min(14, 4 + Math.floor(g.wave / 15) + (T.musou > 0 ? 3 : 0) + Math.floor(rnd() * 3));
    const gap = 1.3;
    if (kind === 'col') n = Math.min(n, Math.max(3, Math.floor(H / gap)));
    if (kind === 'row') n = Math.min(n, Math.max(3, Math.floor(W / gap) + 1));
    const id = T.formId++;
    T.forms[id] = { id, n, alive: n, dna: 0, kind, broken: false };
    const bombAt = rnd() < 0.3 ? Math.floor(rnd() * n) : -1;
    const mk = (i, path, x, y) => spawn({ form: id, type: t.id, strain: s, v: i === bombAt ? 'bomb' : null, x, y, path: path ? Object.assign({ t0: T.time }, path) : null });
    const dir = rnd() < 0.5 ? 1 : -1;
    const grav = 9, hTop = H + 0.6, vyTop = Math.sqrt(2 * grav * hTop);
    const mid = (n - 1) / 2;
    if (kind === 'toss') {
      for (let i = 0; i < n; i++) { const x0 = b.x0 + W * (0.12 + 0.76 * rnd()); mk(i, { kind: 'toss', x0, y0: b.y0 - 1, vx: (cx - x0) * 0.22 + (rnd() - 0.5) * 1.2, vy: vyTop * (0.82 + rnd() * 0.18), g: -grav, delay: i * 0.13 }, x0, b.y0 - 1); }
    } else if (kind === 'row') {
      const vy = vyTop * 0.92;
      for (let i = 0; i < n; i++) mk(i, { kind: 'toss', x0: cx + (i - mid) * gap, y0: b.y0 - 1, vx: 0, vy, g: -grav }, cx + (i - mid) * gap, b.y0 - 1);
    } else if (kind === 'col') {
      const x0 = dir > 0 ? b.x0 - 1.2 : b.x1 + 1.2, y0 = cy + (rnd() - 0.5) * 1;
      for (let i = 0; i < n; i++) mk(i, { kind: 'line', x0, y0, ox: 0, oy: (i - mid) * gap, vx: dir * (2.3 + g.wave / 90), vy: 0 }, x0, y0 + (i - mid) * gap);
    } else if (kind === 'arc') {
      const R = Math.min(2.6, W * 0.32), x0 = dir > 0 ? b.x0 - R - 1 : b.x1 + R + 1, y0 = cy + (rnd() - 0.5) * H * 0.4;
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / Math.max(1, n - 1)) * Math.PI; mk(i, { kind: 'line', x0, y0, ox: -dir * Math.cos(a) * R, oy: Math.sin(a) * R, vx: dir * 2.1, vy: 0 }, x0, y0); }
    } else if (kind === 'ring') {
      const R = 1.5 + n * 0.09, x0 = dir > 0 ? b.x0 - R - 1 : b.x1 + R + 1, y0 = cy + (rnd() - 0.5) * H * 0.3;
      for (let i = 0; i < n; i++) mk(i, { kind: 'ring', x0, y0, vx: dir * 1.7, vy: (rnd() - 0.5) * 0.6, a0: (i / n) * Math.PI * 2, w: 1.2 * dir, R }, x0, y0);
    } else if (kind === 'snake') {
      const x0 = dir > 0 ? b.x0 - 1.2 : b.x1 + 1.2, y0 = cy + (rnd() - 0.5) * H * 0.4;
      for (let i = 0; i < n; i++) mk(i, { kind: 'snake', x0, y0, vx: dir * 2.6, A: Math.min(2, H * 0.18), k: 1.1, ph: rnd() * 6, delay: i * 0.3 }, x0, y0);
    } else if (kind === 'v') {
      const x0 = dir > 0 ? b.x0 - 3 : b.x1 + 3, y0 = cy + (rnd() - 0.5) * H * 0.4;
      for (let i = 0; i < n; i++) mk(i, { kind: 'line', x0, y0, ox: -dir * Math.abs(i - mid) * 0.85, oy: (i - mid) * 0.95, vx: dir * 2.4, vy: 0 }, x0, y0);
    } else {
      // 破裂: 画面の中で弾けて飛び散る
      const q = innerPoint(2);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const ge = mk(i, null, q.x, q.y); ge.vx = Math.cos(a) * 6; ge.vy = Math.sin(a) * 6; ge.tx = q.x + Math.cos(a) * 3; ge.ty = q.y + Math.sin(a) * 3; }
    }
    emit('gForm', { id, kind, n });
  }
  function formGone(ge, cleared) {
    const F = ge.form && T.forms[ge.form];
    if (!F) return;
    F.alive--;
    if (!cleared) F.broken = true;
    if (F.alive > 0) return;
    delete T.forms[ge.form];
    if (F.broken) return;
    const bonus = F.dna * 1.5;
    gainDna(bonus);
    ST().gForms++;
    styleAdd(10);
    musouAdd(10);
    emit('gFormClear', { n: F.n, dna: bonus, kind: F.kind, x: ge.x, y: ge.y });
  }

  // ------------------------------------------------------------- ダメージ（ボスの段階・弱点）
  function hurt(ge, d) {
    ge.hp -= d;
    ge.hitT = T.time;
    if (ge.boss && ge.hp > 0) {
      const f = ge.hp / ge.maxHp;
      const ph = f < 1 / 3 ? 2 : f < 2 / 3 ? 1 : 0;
      if (ph > ge.phase) {
        ge.phase = ph;
        emit('gBossPhase', { g: ge, phase: ph });
        spawnForm('ring');
        T.weakT = Math.min(T.weakT, 0.4);
        styleAdd(6);
      }
    }
  }

  // ------------------------------------------------------------- 斬る
  // o: { speed: 振りの速さ, core: 芯を通ったか, ang: 振った向き（ワールド）, x, y: 画面の当たった所 }
  function slice(id, o) {
    const ge = find(id);
    if (!ge || !ge.alive || ge.flee) return null;
    if (ge.cool > T.time) return null;
    if (ghostHidden(ge)) return { miss: true, g: ge };
    ge.cool = T.time + C.HIT_COOL;
    const s = S(), st = stats();
    if (ge.core) return weakHit(ge, o);
    const stier = speedTier(o.speed || 0);
    let bonus = C.SPEED_BONUS[stier];
    if (bonus > 0) bonus *= st.drawK;
    let dmg = st.kdmg * (1 + bonus);
    const core = !!o.core;
    if (core) dmg *= st.coreM;
    const crit = rnd() < st.critC;
    if (crit) dmg *= st.critM;
    let shatter = false;
    if (ge.frozen > 0) { dmg *= 2.5; ge.frozen = 0; shatter = true; }
    T.combo++;
    T.comboT = st.comboWin;
    dmg *= comboMult();
    // 一閃: 前の1体から0.5秒以内に斬り続けると、同じ一振りとして数える
    if (T.stroke && T.stroke.kills > 0 && T.time - T.stroke.last > C.ISSEN_GAP) { strokeEnd(); strokeStart(); }
    const k = T.stroke ? T.stroke.kills : 0;
    dmg *= 1 + Math.min(k, C.ISSEN_CAP) * st.issen;
    if (T.outbreak > 0) dmg *= 2;
    if (T.musou > 0) dmg *= C.MUSOU_DMG;
    if (ge.boss) dmg *= st.bossM;
    let deflect = false;
    if (ge.v === 'armor' && stier < 3 && !core && T.musou <= 0) { dmg *= 0.08; deflect = true; ST().gDeflects++; }
    hurt(ge, dmg);
    ST().gSlices++;
    if (core) ST().gCores++;
    if (crit) ST().gCrits++;
    if (T.combo > ST().gMaxCombo) ST().gMaxCombo = T.combo;
    for (const [n, name] of GD.COMBO_MS) if (T.combo === n) emit('gComboMs', { n, name });
    if (T.stroke) T.stroke.hits++;
    G.gainXp(0.25);
    styleAdd(0.4 + (core ? 0.8 : 0) + (crit ? 0.8 : 0) + (stier >= 3 ? 0.5 : 0));
    // 奥義ゲージ
    const oi = ougiInfo();
    if (oi && !T.ougiPending) {
      T.ougi += 1 + (core ? 1 : 0) + (crit ? 2 : 0) + (T.musou > 0 ? 1 : 0);
      if (T.ougi >= oi.need) { T.ougi = 0; fireOugi(oi); }
    }
    const killed = ge.hp <= 0;
    const ev = { g: ge, dmg, core, crit, stier, deflect, shatter, combo: T.combo, x: o.x, y: o.y, ang: o.ang || 0, n: k + 1, killed };
    if (!killed && !ge.path) {
      // 斬られた勢いで流される
      ge.vx += Math.cos(ev.ang) * (ge.boss ? 0.4 : 3.2);
      ge.vy += Math.sin(ev.ang) * (ge.boss ? 0.4 : 3.2);
    }
    emit('gSlice', ev);
    // 秘技: 雷は斬った瞬間、炎と氷は倒しきれなかったとき
    if (!deflect && rnd() < st.thunderP) thunder(ge, dmg);
    if (!killed && !deflect && !ge.boss) {
      if (rnd() < st.zanshin) T.pending.push({ t: T.time + 0.32, kind: 'zanshin', id: ge.id, dmg: dmg * 0.6, ang: ev.ang + Math.PI / 2 });
      if (!ge.burn && rnd() < st.fireP) { ge.burn = { t: 2.5, dmg: dmg * 0.35 * (GIM().burn || 1) }; ST().gFire++; emit('gBurn', ge); }
      if (!ge.frozen && rnd() < st.iceP) { ge.frozen = 2.5; ge.path = null; ge.vx = 0; ge.vy = 0; ST().gIce++; emit('gFreeze', ge); }
    }
    if (killed) kill(ge, { src: 'slice', ang: ev.ang, issen: k + 1, x: o.x, y: o.y, core, crit, stier });
    // 鏡写: 左右反対の位置にいる敵にも一太刀
    if (GIM().mirror && !o.mirror && !deflect) {
      let best = null, bd = 1e9;
      for (const x of T.germs) {
        if (x === ge || !targetable(x) || x.boss) continue;
        const d = Math.hypot(x.x + ge.x, x.y - ge.y);
        if (d < bd && d < x.r + 1.1) { bd = d; best = x; }
      }
      if (best) { emit('gMirror', { from: ge, to: best }); slice(best.id, { speed: o.speed, core: false, ang: Math.PI - (o.ang || 0), mirror: true }); }
    }
    return ev;
  }
  // ボスの弱点（周りを回る光る核）
  function weakHit(ge, o) {
    const b = T.boss;
    ge.alive = false;
    removeGerm(ge);
    T.weakT = C.WEAK_RESPAWN;
    if (!b || !b.alive) return null;
    const st = stats();
    const dmg = st.kdmg * C.WEAK_MULT * st.bossM * comboMult() * (T.musou > 0 ? C.MUSOU_DMG : 1) * (T.outbreak > 0 ? 2 : 1);
    T.combo++; T.comboT = st.comboWin;
    ST().gWeak++;
    styleAdd(5);
    musouAdd(8);
    hurt(b, dmg);
    emit('gWeak', { g: b, core: ge, dmg, x: o.x, y: o.y, ang: o.ang || 0 });
    if (b.hp <= 0) kill(b, { src: 'slice', ang: o.ang || 0, issen: 1, x: o.x, y: o.y });
    return { g: ge, weak: true, dmg, killed: false, n: 1 };
  }
  function kill(ge, o) {
    if (!ge.alive) return;
    ge.alive = false;
    ge.ang = o.ang || 0;
    const s = S(), g = gs(), st = stats();
    const issen = o.issen || 1;
    let dna = ge.dna * st.dnaMult * (1 + Math.min(issen - 1, C.ISSEN_CAP) * st.issen) * (T.outbreak > 0 ? C.OUT_DNA : 1) * (1 + (comboMult() - 1) * 0.5) * styleMult() * (T.musou > 0 ? C.MUSOU_DNA : 1);
    gainDna(dna);
    ST().gKills++;
    T.lastKillT = T.time;
    if (ge.v === 'gold') ST().gGoldens++;
    if (ge.v === 'rainbow') ST().gRainbows++;
    if (ge.v && ge.v !== 'gold' && ge.v !== 'rainbow') ST().gElites++;
    if (ge.child) ST().gSplits++;
    if (T.outbreak > 0) { T.outKills++; T.outDna += dna; }
    if (T.musou > 0) { T.musouKills++; T.musouDna += dna; }
    if (T.stroke && o.src === 'slice') { T.stroke.kills++; T.stroke.dna += dna; T.stroke.last = T.time; }
    if (rnd() < 0.0015 * G.mutv('m_gem') || ge.v === 'rainbow') G.gainGems(ge.v === 'rainbow' ? 10 : 1);
    // 斬撃ランク: 違う株を続けて斬ると多彩さボーナス
    const variety = !T.lastSids.includes(ge.sid);
    T.lastSids.push(ge.sid);
    if (T.lastSids.length > 3) T.lastSids.shift();
    const src = o.src;
    styleAdd((src === 'slice' ? 2 + Math.min(4, issen - 1) : src === 'boom' ? 1.5 : 1) * (variety ? SR.VARIETY : 1));
    musouAdd(src === 'slice' ? 2.2 + Math.min(5, issen - 1) * 0.8 + (o.core ? 0.6 : 0) : src === 'boom' ? 0.8 : 0.5);
    removeGerm(ge);
    const t = TY[ge.type];
    // 図鑑: 初めて斬った株
    let fresh = null;
    if (!ge.boss && !ge.core && !ge.crit) {
      const dex = g.dex || (g.dex = {});
      if (!dex[ge.sid]) {
        dex[ge.sid] = 1;
        const X = STR[ge.sid];
        const rew = dnaAt(g.wave) * 15 * st.dnaMult;
        gainDna(rew);
        G.gainGems(1);
        T.dirty = true;
        const n = Object.keys(dex).length;
        const ms = n % C.DEX_STEP === 0;
        if (ms) G.gainGems(10);
        fresh = { sid: ge.sid, name: X ? X.name : t.name, dna: rew, n, ms };
      } else dex[ge.sid]++;
    }
    emit('gKill', { g: ge, dna, issen, src, ang: ge.ang, x: o.x, y: o.y, core: !!o.core, crit: !!o.crit, stier: o.stier || 0 });
    if (fresh) emit('gNewStrain', fresh);
    if (ge.form) formGone(ge, true);
    // 特殊な菌のごほうび
    if (ge.v === 'lucky') slot(ge);
    if (ge.v === 'chest') chest(ge);
    if (ge.crit) critterGet(ge);
    // 誘爆
    if (ge.v === 'bomb' || ge.boss || (src === 'boom' && rnd() < st.chainP && (o.gen || 0) < 14)) queueBoom(ge, o.gen || 0);
    // 分裂・胞子
    if (!ge.child && !ge.boss && !ge.crit) {
      const nSplit = (t.split || 0) + (ge.v === 'split' ? 2 : 0) + (GIM().splitP && !ge.form && rnd() < GIM().splitP ? 2 : 0);
      for (let i = 0; i < nSplit; i++) spawn({ child: true, type: t.id, strain: ge.strain, x: ge.x + (i - (nSplit - 1) / 2) * ge.r * 0.8, y: ge.y, ang: ge.ang + (i % 2 ? Math.PI / 2 : -Math.PI / 2) });
      for (let i = 0; i < (t.burst || 0); i++) spawn({ child: true, type: t.id, strain: ge.strain, x: ge.x, y: ge.y, ang: (i / t.burst) * Math.PI * 2 + rnd() });
    }
    if (ge.v === 'rainbow' && T.outbreak <= 0 && !T.boss) startOutbreak();
    if (ge.boss) {
      ST().gFinish++;
      for (const x of T.germs) if (x.core) { x.alive = false; }
      T.germs = T.germs.filter((x) => !x.core);
      emit('gFinish', { g: ge, ang: ge.ang, x: o.x, y: o.y });
      bossWin(ge);
      return;
    }
    if (!ge.child && !ge.minion && !ge.crit && !T.pendingBoss && !T.boss) {
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
      const st = ST();
      if (sk.kills > st.gBestIssen) st.gBestIssen = sk.kills;
      if (sk.kills >= 5) st.gIssen5++;
      const bonus = sk.dna * 0.05 * (sk.kills - 1);
      gainDna(bonus);
      const gems = sk.kills >= 15 ? 3 : sk.kills >= 8 ? 1 : 0;
      if (gems) G.gainGems(gems);
      styleAdd(sk.kills * 1.5);
      emit('gIssen', { n: sk.kills, dna: sk.dna + bonus, bonus, gems, name: GD.issenName(sk.kills) });
      // 時止め: まとめて斬ると敵の動きがゆっくりに
      if (GIM().slow && sk.kills >= 4) { T.slowT = Math.min(2.5, 0.8 + sk.kills * 0.12); emit('gSlowmo', { n: sk.kills, t: T.slowT }); }
    }
    return sk;
  }

  // ------------------------------------------------------------- 秘技: 雷・誘爆
  function thunder(src, dmg) {
    const st = stats();
    const list = T.germs.filter((x) => x !== src && targetable(x)).map((x) => ({ x, d: Math.hypot(x.x - src.x, x.y - src.y) })).filter((q) => q.d < 3.6).sort((a, b) => a.d - b.d).slice(0, st.thunderN);
    if (!list.length) return;
    ST().gThunder++;
    emit('gThunder', { from: src, to: list.map((q) => q.x) });
    for (const q of list) {
      hurt(q.x, dmg * 0.6);
      if (q.x.hp <= 0) kill(q.x, { src: 'thunder', ang: Math.atan2(q.x.y - src.y, q.x.x - src.x) + Math.PI / 2 });
    }
  }
  function queueBoom(ge, gen) {
    const st = stats();
    T.booms.push({ t: T.time + C.BOOM_DELAY, x: ge.x, y: ge.y, r: st.boomR * (ge.boss ? 3.2 : ge.v === 'bomb' ? 1.25 : 1), gen, boss: !!ge.boss });
  }
  function doBoom(b) {
    const st = stats();
    if (T.time - T.chain.t > 1.2) T.chain.n = 0;
    T.chain.n++;
    T.chain.t = T.time;
    ST().gBooms++;
    emit('gBoom', { x: b.x, y: b.y, r: b.r, n: T.chain.n, boss: b.boss });
    for (const ge of T.germs.slice()) {
      if (!targetable(ge)) continue;
      const dx = ge.x - b.x, dy = ge.y - b.y, d = Math.hypot(dx, dy);
      if (d > b.r + ge.r) continue;
      const dmg = Math.max(ge.maxHp * (ge.boss ? 0.04 : 0.85), st.kdmg * 2.5) * (T.musou > 0 ? C.MUSOU_DMG : 1) * (ge.boss ? st.bossM : 1);
      hurt(ge, dmg);
      if (!ge.path && !ge.boss) { ge.vx += (dx / (d || 1)) * 5; ge.vy += (dy / (d || 1)) * 5; }
      if (ge.hp <= 0) kill(ge, { src: 'boom', ang: Math.atan2(dy, dx) + Math.PI / 2, gen: b.gen + 1 });
    }
  }
  function chainEnd() {
    const n = T.chain.n;
    T.chain.n = 0;
    if (n < 2) return;
    const s = ST();
    if (n > (s.gBestChain || 0)) s.gBestChain = n;
    const bonus = dnaAt(gs().wave) * n * n * 0.5 * stats().dnaMult;
    gainDna(bonus);
    styleAdd(n * 2);
    emit('gChain', { n, dna: bonus });
  }

  // ------------------------------------------------------------- スロット菌・宝箱菌・ラッキー細胞
  const SYM = ['🧬', '🦠', '💎', '⭐', '7'];
  function slot(ge) {
    const st = stats(), g = gs(), s = S();
    const r = rnd() / (1 + 0.08 * lv('lucky'));
    const cat = r < 0.03 ? 'jackpot' : r < 0.15 ? 'triple' : r < 0.6 ? 'pair' : 'none';
    const pick = (ex) => { let y; do { y = SYM[Math.floor(rnd() * SYM.length)]; } while (ex.includes(y)); return y; };
    let reels;
    if (cat === 'jackpot') reels = ['7', '7', '7'];
    else if (cat === 'triple') { const x = SYM[Math.floor(rnd() * 4)]; reels = [x, x, x]; }
    else if (cat === 'pair') { const x = rnd() < 0.35 ? '7' : pick([]); reels = [x, x, pick([x])]; }
    else { const a = pick([]), b = pick([a]); reels = [a, b, pick([a, b])]; }
    const mult = { jackpot: 50, triple: 10, pair: 3, none: 1 }[cat];
    const dna = dnaAt(g.wave) * 40 * mult * st.dnaMult;
    gainDna(dna);
    const gems = cat === 'jackpot' ? 20 : cat === 'triple' ? (reels[0] === '💎' ? 15 : 5) : 0;
    if (gems) G.gainGems(gems);
    ST().gSlots++;
    if (cat === 'jackpot') ST().gJackpots++;
    if (cat === 'jackpot' || cat === 'triple') { musouAdd(30); styleAdd(15); }
    emit('gSlot', { reels, cat, mult, dna, gems, x: ge.x, y: ge.y });
  }
  function chest(ge) {
    const gems = 3 + Math.floor(rnd() * 6);
    G.gainGems(gems);
    const rolls = rnd() < 0.35 ? 15 : 0;
    const buff = rnd() < 0.25;
    if (buff) G.addBuff('chest_dna', 'dna', 2, 120, 'DNA増殖', '🧬');
    ST().gChests++;
    styleAdd(6);
    emit('gChest', { gems, rolls, buff, x: ge.x, y: ge.y });
    if (rolls) kroll(rolls, kLuckNow() * 2);
  }
  function spawnCritter() {
    const b = T.bounds, dir = rnd() < 0.5 ? 1 : -1;
    const y = rand(b.y0 + 1, b.y1 - 1), x0 = dir > 0 ? b.x0 - 1 : b.x1 + 1;
    const ge = spawn({ critter: true, v: 'critter', type: GD.TYPES[0].id, x: x0, y, path: { kind: 'line', t0: T.time, x0, y0: y, ox: 0, oy: 0, vx: (dir * (b.x1 - b.x0 + 2)) / 3.8, vy: 0, wob: 1 } });
    emit('gCritter', ge);
  }
  function critterGet(ge) {
    const st = stats(), g = gs();
    const dna = dnaAt(g.wave) * 60 * st.dnaMult;
    gainDna(dna);
    G.gainGems(3);
    ST().gCritters++;
    const r = rnd();
    const bonus = r < 0.4 ? 'dna' : r < 0.75 ? 'musou' : 'outbreak';
    if (bonus === 'dna') G.addBuff('critter_dna', 'dna', 2, 60, 'ラッキーDNA', '🍀');
    else if (bonus === 'musou' && T.musou <= 0) { T.musouG = 99.9; musouAdd(1); }
    else if (T.outbreak <= 0 && !T.boss) startOutbreak();
    styleAdd(12);
    emit('gCritterGet', { dna, gems: 3, bonus, x: ge.x, y: ge.y });
  }

  // ------------------------------------------------------------- ウェーブ・ボス・大発生
  function advanceWave() {
    const g = gs(), s = S();
    const prevBiome = biomeIndex(g.wave);
    const prevMax = g.maxWave || 1;
    g.wkills = 0;
    g.wave++;
    if (g.wave > g.maxWave) g.maxWave = g.wave;
    if (HAS_DM && g.maxWave > prevMax) {
      // ★（ボスを倒すごと）が増えると次元の力が上がる。ウェーブ15で次の次元が開く
      if (DM.stars(g) > Math.floor((prevMax - 1) / 10)) { DM.dirty(); T.dirty = true; }
      const nx = DI() + 1;
      const uw = DM.unlockW(DI());
      if (prevMax < uw && g.maxWave >= uw && nx < DM.N) { DM.dirty(); emit('dimUnlock', { i: nx, meta: DM.meta(nx), from: DI() }); }
    }
    if (g.wave > (ST().gBestWave || 1)) ST().gBestWave = g.wave;
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
    for (const x of T.germs) if (!x.form) x.flee = true;
    const ge = spawn({ boss: true, type: B.type, strain: B.strain || 0, bossDef: B, hp, dna: dnaAt(g.wave) * t.dna * 40, x: 0, y: T.bounds.y1 + 3 });
    T.boss = ge;
    T.bossTimer = st.bossTime;
    T.summonT = 3;
    T.weakT = 2.5;
    emit('gBossStart', { g: ge, def: B, time: T.bossTimer });
  }
  function bossWin(ge) {
    T.boss = null;
    const g = gs(), s = S();
    ST().gBosses++;
    const factor = 1 + Math.floor(g.wave / C.FACTOR_EVERY);
    s.germ.factor += factor; // 変異因子はどの次元のボスからでも、共通の 🧪 に入る
    S().stats.gFactorAll += factor;
    const gems = 5 + Math.floor(g.wave / 10) * 2;
    G.gainGems(gems);
    G.gainXp(30);
    const w = g.wave;
    for (const x of T.germs) if (x.minion) x.flee = true;
    styleAdd(25);
    musouAdd(40);
    advanceWave();
    emit('gBossWin', { g: ge, factor, gems, wave: w, def: ge.bossDef });
    G.save();
  }
  function bossFail() {
    const ge = T.boss;
    T.boss = null;
    if (ge) { ge.alive = false; removeGerm(ge); }
    T.germs = T.germs.filter((x) => !x.core);
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
    ST().gOutbreaks++;
    T.spawnT = 0;
    T.formT = Math.min(T.formT, 0.6);
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
    ST().gOugi++;
    gs().ougiSeen[oi.kat.id] = 1;
    emit('gOugi', T.ougiPending);
  }
  const PAT = {
    cross: [Math.PI / 4, -Math.PI / 4], x: [Math.PI / 3, -Math.PI / 3], grid: [0, Math.PI / 2], rain: [Math.PI / 2], triple: [Math.PI / 5],
    star: [0, Math.PI / 5, (2 * Math.PI) / 5, (3 * Math.PI) / 5, (4 * Math.PI) / 5], fan: [Math.PI / 6, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3],
    zigzag: [0.3, -0.3], circle: null, spiral: null, random: null, omega: null,
  };
  function ougiHit(p) {
    const st = stats();
    const list = T.germs.filter((x) => x.alive && !x.flee && !x.core);
    const angs = PAT[p.sk.slash];
    let kills = 0;
    const dna0 = ST().gDnaAll;
    const hits = [];
    for (const ge of list) {
      const ang = angs ? angs[Math.floor(rnd() * angs.length)] : rnd() * Math.PI;
      const d = p.dmg * (ge.boss ? st.bossM : 1) * (T.outbreak > 0 ? 2 : 1) * (T.musou > 0 ? C.MUSOU_DMG : 1);
      hurt(ge, d);
      hits.push({ g: ge, dmg: d, ang });
    }
    emit('gOugiHit', Object.assign({ hits }, p));
    for (const h of hits) if (h.g.hp <= 0 && h.g.alive) { kills++; kill(h.g, { src: 'ougi', ang: h.ang, issen: kills }); }
    styleAdd(8 + kills);
    emit('gOugiDone', { kills, dna: ST().gDnaAll - dna0, sk: p.sk, kat: p.kat });
  }

  // ------------------------------------------------------------- 免疫細胞（放置）
  function cellAttack(sec) {
    const st = stats();
    if (st.cellDps <= 0) return;
    const list = T.germs.filter((x) => targetable(x) && !ghostHidden(x));
    if (!list.length) return;
    const g = gs();
    let best = null;
    for (const c of GD.CELLS) if (g.cells[c.id]) best = c;
    list.sort((a, b) => a.hp - b.hp);
    const tgt = rnd() < 0.6 ? list[0] : list[Math.floor(rnd() * list.length)];
    const d = st.cellDps * sec * (T.outbreak > 0 ? 2 : 1) * (T.musou > 0 ? 2 : 1) * (tgt.boss ? st.bossM : 1);
    hurt(tgt, d);
    emit('gCell', { g: tgt, dmg: d, cell: best });
    if (tgt.hp <= 0) { ST().gCellKills++; kill(tgt, { src: 'cell', ang: rnd() * Math.PI }); }
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
  const mutLv = (id) => (G.S.germ.muts && G.S.germ.muts[id]) || 0;
  const mutCost = (m, l = mutLv(m.id)) => Math.ceil(m.base * Math.pow(m.growth, l));
  const mutMaxed = (m) => mutLv(m.id) >= m.max;
  function buyMut(id) {
    const m = MU[id], g = G.S.germ;
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
  function kLuckNow() { return stats().luckBase * (1 + 0.002 * Math.min(T.combo, 100)) * (1 + 0.04 * T.rank) * (T.outbreak > 0 ? 1.25 : 1) * (T.musou > 0 ? 1.25 : 1) * G.buffOf('luck'); }
  function kRollRate() {
    if (S().study || !inDim()) return 0;
    return stats().rollBase * (T.outbreak > 0 ? 1.5 : 1) * (T.musou > 0 ? 1.5 : 1) * (1 + 0.06 * T.rank) * (1 + 0.003 * Math.min(T.combo, 100)) * G.buffOf('roll') * G.gameSpeed();
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
    if (key in ST()) ST()[key]++;
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
    ST().gRolls += n;
    ST().gRareRolls += rare;
    const ups = kgXp(n, quiet);
    if (RANK[best.r] > (ST().gBestKat || 0)) ST().gBestKat = RANK[best.r];
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

  // ------------------------------------------------------------- 雷雲（空から雷）
  function storm() {
    const list = T.germs.filter((x) => targetable(x) && !x.boss && x.wasIn);
    if (!list.length) return;
    const tg = list[Math.floor(rnd() * list.length)];
    const dmg = stats().kdmg * 2.5 * comboMult();
    ST().gThunder++;
    hurt(tg, dmg);
    emit('gStorm', { g: tg, dmg });
    if (tg.hp <= 0) kill(tg, { src: 'thunder', ang: Math.PI / 2 });
  }

  // ------------------------------------------------------------- 仲間の放置収入（全部の次元）
  // 今いる次元は実際に斬っているので除く。森にいる間は最後にいた次元もここで稼ぐ
  function idleAll(sec) {
    if (!(sec > 0) || !open()) return 0;
    const s = S(), here = inDim() ? DI() : -1;
    let tot = 0;
    const add = (ds, i, v) => {
      if (!(v > 0) || !ds) return;
      ds.dna += v;
      if (!isFinite(ds.dna)) ds.dna = Number.MAX_VALUE;
      const stt = i ? ds.gs : s.stats;
      if (stt) stt.gDnaAll = Math.min(Number.MAX_VALUE, (stt.gDnaAll || 0) + v);
      if (i === DI()) T.dnaAcc += v;
      tot += i ? 0 : v;
    };
    if (here !== 0) add(s.germ, 0, (DI() === 0 ? cellRate() : s.germ.idle || 0) * sec);
    if (HAS_DM) for (const k in s.dims) {
      const i = +k.slice(1);
      if (i === here) continue;
      add(s.dims[k], i, (i === DI() ? cellRate() : s.dims[k].idle || 0) * sec);
    }
    return tot;
  }
  // 今の次元の段位（はしご）を数えて、増えた段の💎を渡す
  function ladTick() {
    if (!HAS_DM || !DI()) return;
    const g = gs();
    g.ser = GD.KSERIES.reduce((n, x) => n + (x.ids.every((id) => g.kat[id]) ? 1 : 0), 0);
    const r = DM.ladEval(g);
    if (r.gain > 0) {
      // 段位は3段ごとに💎+1
      T.ladGem = (T.ladGem || 0) + r.gain / 3;
      const gems = Math.floor(T.ladGem);
      T.ladGem -= gems;
      if (gems) G.gainGems(gems);
      DM.dirty();
      T.dirty = true;
      emit('ladder', { i: DI(), gain: r.gain, gems, ups: r.ups });
    }
  }
  // 1番以降の次元の体力の倍率（初めて入ったときに決まる）: 次元の力の85%ぶんを打ち消し、奥の次元ほど少し硬い
  function hkFor(i) {
    const P = HAS_DM ? DM.totals(S(), true).power : 1;
    return Math.max(1, Math.pow(P, 0.85) * (1 + 0.04 * i));
  }
  function useDim(i) {
    if (!HAS_DM) return;
    DM.use(i);
    rebind();
    T.st = null;
    T.dirty = true;
  }

  // ------------------------------------------------------------- 次元の移動
  function resetRun() {
    T.germs.length = 0;
    T.combo = 0; T.comboT = 0; T.stroke = null; T.pending = [];
    T.outbreak = 0; T.outNext = rand(C.OUT_MIN * 0.5, C.OUT_MAX * 0.6);
    T.boss = null; T.pendingBoss = false; T.ougiPending = null; T.spawnT = 0.8;
    T.musou = 0; T.musouG = 0; T.style = 0; T.rank = 0; T.lastSids = []; T.forms = {}; T.booms = []; T.chain = { n: 0, t: -9 };
    T.formT = 2.5; T.critT = rand(C.CRIT_MIN * 0.5, C.CRIT_MAX * 0.7);
  }
  // i: 行き先の次元（省略で最後にいた次元）。次元の中から別の次元へも直接行ける（hop）
  function enter(i) {
    const s = S();
    if (!open()) return false;
    if (i == null) i = s.dimCur || 0;
    if (HAS_DM && !DM.isOpen(s, i)) i = 0;
    const hop = inDim();
    if (hop && i === DI()) return false;
    if (hop) { gs().idle = cellRate(); strokeEnd(); }
    useDim(i);
    const g = gs();
    s.dim = 'germ';
    s.dimCur = i;
    ST().gVisits++;
    if (!g.dex) g.dex = {};
    if (i) { g.seen = (g.seen || 0) + 1; if (!g.hk) g.hk = hkFor(i); DM.dirty(); }
    resetRun();
    if (!g.keq || !KAT[g.keq]) { const id = HAS_DM ? DM.C.starter : 'k_bokuto'; g.kat[id] = g.kat[id] || 1; g.keq = id; }
    dirty();
    emit('dim', { to: 'germ', first: ST().gVisits === 1, hop, i });
    // 初めて来たときは、すぐにスロット菌とラッキー細胞を見せる
    if (ST().gVisits <= 2) { T.firstLucky = 14; T.critT = 28; }
    // 入ったらすぐ斬れるように、最初の3体は画面の中に出す
    if (isBossWave(g.wave) && !g.farming) { T.pendingBoss = true; T.bossDelay = 2.2; }
    else for (let i = 0; i < 3; i++) { const q = innerPoint(1); spawn({ x: q.x, y: q.y }); }
    return true;
  }
  function leave() {
    if (!inDim()) return false;
    gs().idle = cellRate();
    strokeEnd();
    S().dim = 'forest';
    resetRun();
    emit('dim', { to: 'forest', away: G.takeAway() });
    G.save();
    return true;
  }

  // ------------------------------------------------------------- 移動とティック
  function setBounds(b) { T.bounds = b; }
  function pathPos(ge, p, age) {
    if (p.kind === 'toss') return [p.x0 + p.vx * age, p.y0 + p.vy * age + 0.5 * p.g * age * age];
    if (p.kind === 'ring') { const a = p.a0 + p.w * age; return [p.x0 + p.vx * age + Math.cos(a) * p.R, p.y0 + p.vy * age + Math.sin(a) * p.R]; }
    if (p.kind === 'snake') { const x = p.x0 + p.vx * age; return [x, p.y0 + Math.sin((x - p.x0) * p.k + p.ph) * p.A]; }
    const wob = p.wob ? Math.sin(age * 6) * 0.6 : 0;
    return [p.x0 + p.vx * age + (p.ox || 0), p.y0 + p.vy * age + (p.oy || 0) + wob];
  }
  function move(dt) {
    const b = T.bounds;
    const list = T.germs;
    for (let i = list.length - 1; i >= 0; i--) {
      const ge = list[i];
      if (!ge.alive) { list.splice(i, 1); continue; }
      if (ge.frozen > 0) { ge.frozen = Math.max(0, ge.frozen - dt); continue; }
      if (ge.life > 0) { ge.life -= dt; if (ge.life <= 0) ge.flee = true; }
      const inside = ge.x > b.x0 - 0.2 && ge.x < b.x1 + 0.2 && ge.y > b.y0 - 0.2 && ge.y < b.y1 + 0.2;
      if (inside) ge.wasIn = true;
      // ボスの弱点はボスの周りを回る
      if (ge.core) {
        const B = T.boss;
        if (!B || !B.alive) { ge.alive = false; list.splice(i, 1); continue; }
        const a = T.time * 1.7 + ge.ph * 6;
        ge.x = B.x + Math.cos(a) * (B.r + 0.45);
        ge.y = B.y + Math.sin(a) * (B.r * 0.85 + 0.35);
        continue;
      }
      if (ge.path && !ge.flee) {
        const p = ge.path;
        const age = T.time - p.t0 - (p.delay || 0);
        if (age < 0) continue;
        const [x, y] = pathPos(ge, p, age);
        ge.vx = (x - ge.x) / Math.max(dt, 1e-3);
        ge.vy = (y - ge.y) / Math.max(dt, 1e-3);
        ge.x = x; ge.y = y;
        const out = ge.x < b.x0 - 3.5 || ge.x > b.x1 + 3.5 || ge.y < b.y0 - 3 || ge.y > b.y1 + 4;
        if ((ge.wasIn && !inside && (ge.x < b.x0 - 1.4 || ge.x > b.x1 + 1.4 || ge.y < b.y0 - 1.6 || ge.y > b.y1 + 1.6)) || out || age > 12) {
          list.splice(i, 1);
          if (ge.form) formGone(ge, false);
          emit(ge.crit ? 'gEscape' : 'gGone', ge);
        }
        continue;
      }
      if (ge.flee) {
        // 画面の外へ逃げる
        const dx = ge.x >= 0 ? 1 : -1;
        ge.vx += dx * 9 * dt;
        ge.vy += 2 * dt;
        ge.x += ge.vx * dt;
        ge.y += ge.vy * dt;
        if (Math.abs(ge.x) > Math.max(-b.x0, b.x1) + ge.r * 3 || ge.y > b.y1 + ge.r * 4) {
          list.splice(i, 1);
          if (ge.form) formGone(ge, false);
          if (ge.v === 'gold' || ge.v === 'rainbow' || ge.v === 'lucky') emit('gEscape', ge);
          else emit('gGone', ge);
        }
        continue;
      }
      if (ge.boss) {
        // ボスは中央でゆらゆら（段階が進むと速く動く）
        const k = 1 + ge.phase * 0.6;
        ge.tx = Math.sin(T.time * 0.5 * k) * (b.x1 - b.x0) * (0.18 + ge.phase * 0.06);
        ge.ty = (b.y0 + b.y1) / 2 + 1 + Math.sin(T.time * 0.8 * k) * (0.5 + ge.phase * 0.4);
      } else if (Math.hypot(ge.tx - ge.x, ge.ty - ge.y) < 0.6) {
        const q = innerPoint(ge.r + 0.3);
        ge.tx = q.x; ge.ty = q.y;
      }
      const dx = ge.tx - ge.x, dy = ge.ty - ge.y, d = Math.hypot(dx, dy) || 1;
      const sp = ge.boss ? (inside ? 1.6 * (1 + ge.phase * 0.5) : 4) : ge.sp * (inside ? 1 : 3.5);
      const k = Math.min(1, dt * 1.6);
      ge.vx += ((dx / d) * sp - ge.vx) * k;
      ge.vy += ((dy / d) * sp - ge.vy) * k;
      ge.x += ge.vx * dt;
      ge.y += ge.vy * dt;
    }
    // 重なりすぎないように押し合う（隊列は形を保つ）
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.flee || a.path || a.core) continue;
      for (let j = i + 1; j < list.length; j++) {
        const c = list[j];
        if (c.flee || c.path || c.core) continue;
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
    if (T.bgAcc >= 1) { idleAll(T.bgAcc * G.gameSpeed()); T.bgAcc = 0; }
  }
  const HAS_G = () => typeof G !== 'undefined' && G.S && G.S.germ;
  function tick(dt) {
    if (!HAS_G()) return;
    const s = S();
    if (s.study) return;
    T.time += dt;
    T.dnaT += dt;
    if (T.dnaT >= 1) { const r = T.dnaAcc / T.dnaT; T.dnaEMA = T.dnaEMA ? T.dnaEMA * 0.7 + r * 0.3 : r; T.dnaAcc = 0; T.dnaT = 0; }
    // 全部の次元の段位と★を、ときどき数え直す（放置で通貨が増えるので）
    T.allT -= dt;
    if (T.allT <= 0 && HAS_DM) {
      T.allT = 30;
      for (const k in s.dims) { const r = DM.ladEval(s.dims[k]); if (r.gain > 0) { G.gainGems(Math.ceil(r.gain / 3)); DM.dirty(); } }
    }
    if (!inDim()) { bgTick(dt); return; }
    ST().gTime += dt;
    const g = gs(), st = stats();
    let gdt = dt * G.gameSpeed();
    if (T.slowT > 0) { T.slowT -= dt; gdt *= 0.35; }
    // ほかの次元の仲間の稼ぎ（1秒ごと）と、今の次元の段位
    T.idleT += dt;
    if (T.idleT >= 1) { idleAll(T.idleT * G.gameSpeed()); T.idleT = 0; g.idle = cellRate(); }
    T.ladT -= dt;
    if (T.ladT <= 0) { T.ladT = 1; ladTick(); }
    // 雷雲・再生
    const gmk = GIM();
    if (gmk.storm && !T.pendingBoss) { T.stormT -= gdt; if (T.stormT <= 0) { T.stormT = rand(1.1, 2.4); storm(); } }
    if (gmk.regen) for (const x of T.germs) if (x.alive && !x.core && x.hp < x.maxHp && T.time - x.hitT > 0.8) x.hp = Math.min(x.maxHp, x.hp + x.maxHp * gmk.regen * gdt);
    // 連斬
    if (T.combo > 0) {
      T.comboT -= dt;
      if (T.comboT <= 0) {
        emit('gComboEnd', { n: T.combo });
        T.combo = 0;
        T.style *= SR.BREAK;
        updateRank();
      }
    }
    // 斬撃ランクは時間で下がる（無双中は下がらない）
    if (T.style > 0 && T.musou <= 0) {
      T.style = Math.max(0, T.style - (SR.DECAY + SR.DECAY_RANK * T.rank) * 0.9 * dt);
      updateRank();
    }
    // 無双モード
    if (T.musou > 0) {
      T.musou -= dt;
      if (T.musou <= 0) {
        T.musou = 0;
        if (T.musouKills > (ST().gMusouKills || 0)) ST().gMusouKills = T.musouKills;
        emit('gMusouEnd', { kills: T.musouKills, dna: T.musouDna });
      }
    } else if (T.time - T.lastKillT > 2.5 && T.musouG > 0) T.musouG = Math.max(0, T.musouG - 6 * dt);
    // 大発生
    if (T.outbreak > 0) {
      T.outbreak -= dt;
      if (T.outbreak <= 0) { T.outbreak = 0; emit('gOutbreakEnd', { kills: T.outKills, dna: T.outDna }); }
    } else if (!T.boss && !T.pendingBoss) {
      T.outNext -= dt;
      if (T.outNext <= 0) startOutbreak();
    }
    // 遅れて入る斬撃（残心）・奥義・誘爆
    if (T.pending.length) {
      for (let i = 0; i < T.pending.length; i++) {
        const p = T.pending[i];
        if (T.time < p.t) continue;
        T.pending.splice(i--, 1);
        const ge = find(p.id);
        if (!ge || !ge.alive) continue;
        hurt(ge, p.dmg);
        emit('gZanshin', { g: ge, dmg: p.dmg, ang: p.ang });
        if (ge.hp <= 0) kill(ge, { src: 'zanshin', ang: p.ang });
      }
    }
    if (T.ougiPending && T.time >= T.ougiPending.t) { const p = T.ougiPending; T.ougiPending = null; ougiHit(p); }
    if (T.booms.length) {
      const due = T.booms.filter((b) => T.time >= b.t);
      if (due.length) { T.booms = T.booms.filter((b) => T.time < b.t); for (const b of due) doBoom(b); }
    }
    if (T.chain.n > 0 && T.time - T.chain.t > 1.2) chainEnd();
    // 押したまま間があいたら、そこで一閃を区切る
    if (T.stroke && T.stroke.kills > 0 && T.time - T.stroke.last > C.ISSEN_GAP) { strokeEnd(); strokeStart(); }
    // 炎刃: 0.5秒ごとに燃える
    T.burnT += dt;
    if (T.burnT >= 0.5) {
      T.burnT = 0;
      for (const ge of T.germs.slice()) {
        if (!ge.burn || !ge.alive) continue;
        hurt(ge, ge.burn.dmg);
        ge.burn.t -= 0.5;
        emit('gBurnTick', { g: ge, dmg: ge.burn.dmg });
        if (ge.hp <= 0) kill(ge, { src: 'fire', ang: rnd() * Math.PI });
        else if (ge.burn.t <= 0) ge.burn = null;
      }
    }
    // ボス
    if (T.pendingBoss) {
      T.bossDelay -= dt;
      if (T.bossDelay <= 0) startBoss();
    } else if (T.boss) {
      T.bossTimer -= dt;
      T.summonT -= gdt;
      if (T.summonT <= 0 && T.germs.length < 9) {
        T.summonT = 3.2 / (1 + T.boss.phase * 0.5);
        const b = T.boss;
        for (let i = 0; i < 2 + T.boss.phase; i++) spawn({ minion: true, type: b.type, strain: b.strain, x: b.x + (i % 2 ? 1 : -1) * b.r * 0.9, y: b.y - b.r * 0.4, ang: (i % 2 ? 0 : Math.PI) + rand(-0.5, 0.5) });
        emit('gSummon', { g: b });
      }
      T.weakT -= dt;
      if (T.weakT <= 0 && !T.germs.some((x) => x.core)) { spawn({ core: true, v: 'core', type: T.boss.type, x: T.boss.x, y: T.boss.y }); T.weakT = 99; emit('gWeakSpawn', T.boss); }
      if (T.bossTimer <= 0) bossFail();
    } else {
      // 次の菌
      T.spawnT -= gdt;
      if (T.spawnT <= 0) {
        const alive = T.germs.filter((x) => !x.flee && !x.form && !x.crit && !x.core).length;
        if (alive < maxGerms()) spawn();
        T.spawnT = C.SPAWN_GAP * (T.outbreak > 0 ? 0.22 : T.musou > 0 ? 0.35 : alive < 3 ? 0.4 : 1) * (gmk.gap || 1);
      }
    }
    // 群れ
    T.formT -= gdt;
    if (T.formT <= 0 && !T.pendingBoss) {
      spawnForm();
      T.formT = (T.musou > 0 ? 2.2 : T.outbreak > 0 ? 3 : rand(C.FORM_MIN, C.FORM_MAX) * (T.boss ? 1.6 : 1)) * (gmk.form || 1);
    }
    if (T.firstLucky > 0) { T.firstLucky -= dt; if (T.firstLucky <= 0 && !T.boss && !T.pendingBoss) spawn({ v: 'lucky' }); }
    // ラッキー細胞
    T.critT -= dt;
    if (T.critT <= 0) {
      if (!T.germs.some((x) => x.crit) && !T.pendingBoss) spawnCritter();
      T.critT = rand(C.CRIT_MIN, C.CRIT_MAX) / st.luckK;
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
    void g;
  }

  // ------------------------------------------------------------- 離れていた間
  function offline(sec, eff, slept) {
    if (!open()) return null;
    const k0 = eff * (slept ? 1.5 : 1);
    // 今いる次元の仲間のぶん（idleAll は今いる次元を除いて、ほかの全部の次元に入れる）
    let here = 0;
    if (inDim()) { here = cellRate() * sec * k0; gainDna(here); }
    const dna = idleAll(sec * k0) + (inDim() && DI() === 0 ? here : 0);
    const nd = HAS_DM ? Object.keys(S().dims).filter((k) => (S().dims[k].idle || 0) > 0).length : 0;
    const k = inDim() ? kroll(Math.min(C.OFFLINE_ROLL_MAX, Math.floor(stats().rollBase * sec * eff * 0.5)), stats().luckBase, true) : null;
    return { dna, here, dims: nd, cur: DI(), krolls: k };
  }

  // セーブを読んだら、最後にいた次元の中身に入れ替える
  G.on('load', () => { useDim(HAS_DM && DM.isOpen(G.S, G.S.dimCur || 0) ? G.S.dimCur || 0 : 0); if (!(G.S.dimCur >= 0) || DI() !== G.S.dimCur) G.S.dimCur = DI(); });

  return {
    T, C, TY, CE, UP, MU, KAT, POOL, ST, DI, GIM, rebind, useDim, idleAll, hkFor, ladTick,
    stats, dirty, tick, slice, strokeStart, strokeEnd, enter, leave, setBounds, open, inDim,
    hpAt, dnaAt, biomeIndex, isBossWave, bossDef, maxGerms, comboMult, styleMult, speedTier, ghostHidden,
    buyCell, cellCost, cellMax, unitCellDps, buyUpg, upgCost, upgMaxed, buyMut, mutCost, mutMaxed, mutLv,
    kroll, kLuckNow, kRollRate, kgNeed, equipK, ougiInfo, challengeBoss, cellRate, offline, startOutbreak, startMusou, spawnForm,
    lv, msMult, spawn,
    get dnaRate() { return T.dnaEMA; },
  };
})();

if (typeof module !== 'undefined') module.exports = { GM };
