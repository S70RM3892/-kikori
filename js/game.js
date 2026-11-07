'use strict';
// =====================================================================
//  game.js — ゲームロジック（DOM非依存）
//  状態 S は永続化され、T は実行時だけの一時状態。
//  演出側（fx.js / ui.js）は G.on(event, fn) でイベントを購読する。
// =====================================================================
const G = (() => {
  const C = D.CFG;
  const AX = {}, WK = {}, UP = {}, MS = {};
  D.AXES.forEach((a) => (AX[a.id] = a));
  D.WORKERS.forEach((w) => (WK[w.id] = w));
  D.UPGRADES.forEach((u) => (UP[u.id] = u));
  D.MISSIONS.forEach((m) => (MS[m.t] = m));
  const RANK = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 };
  const SAVE_KEY = 'dopadopa-kikori-save-v1';
  const COMBO_MS = [50, 100, 200, 300, 500, 777, 1000, 2000, 3000, 5000, 10000];

  function fresh() {
    return {
      v: 1,
      wood: 0, gems: 0, tickets: 10, chests: 0, spirits: 0,
      stage: 1, maxStage: 1, kills: 0, farming: false,
      workers: {}, upg: {}, axes: {}, equip: null, pity: 0,
      ach: {}, achSeen: 0, missions: [], missionLv: 0, buffs: [],
      stats: {
        taps: 0, crits: 0, supers: 0, ultras: 0, gods: 0, maxCombo: 0, fevers: 0, bosses: 0, squirrels: 0,
        pulls: 0, kills: 0, chestsOpened: 0, gold: 0, rainbow: 0, woodRun: 0, woodAll: 0, prestiges: 0,
        missionsDone: 0, loginDays: 0, studies: 0, sleeps: 0, goddess: 0, hires: 0, bestStage: 1,
        gotSSR: 0, gotUR: 0, gotLR: 0, playTime: 0, gemsAll: 0, bestSpirits: 0, bestBoss: 0,
        justs: 0, maxChain: 0, greats: 0, maxSpeeds: 0, echoes: 0, thunders: 0, blasts: 0,
      },
      daily: { last: '' },
      settings: { sound: true, vol: 0.7, vibe: true, fx: 2, shake: true, flash: true, num: 'jp', night: true, buyAmt: 1 },
      study: null,
      tut: 0,
      lastSave: Date.now(),
      created: Date.now(),
    };
  }

  let S = fresh();
  const T = {
    time: 0, tree: null, respawn: 0, pendingBoss: false,
    combo: 0, comboTimer: 0, comboWin: 1, feverGauge: 0, fever: 0, feverMax: 1,
    bossTimer: 0, squirrel: null, squirrelTimer: 25, farmKills: 0,
    incomeEMA: 0, incomeAcc: 0, incomeT: 0, dpsAcc: 0,
    checkT: 0, dirty: true, st: null,
    justChain: 0, blastCount: 0, pending: [],
  };

  // ------------------------------------------------------------- イベント
  const L = {};
  const on = (ev, fn) => (L[ev] = L[ev] || []).push(fn);
  function emit(ev, d) {
    const a = L[ev];
    if (!a) return;
    for (const f of a) {
      try { f(d); } catch (e) { console.error('[event ' + ev + ']', e); }
    }
  }

  // ------------------------------------------------------------- 計算
  const lv = (id) => S.upg[id] || 0;
  const perk = (n) => (S.stats.prestiges || 0) >= n;
  const isBossStage = (s) => s % C.BOSS_EVERY === 0;
  const biomeIndex = (s) => Math.floor((s - 1) / 10);

  function hpFor(s) {
    const a = Math.min(s, C.HP_SW) - 1, b = Math.max(0, s - C.HP_SW);
    return C.HP_BASE * Math.pow(C.HP_G1, a) * Math.pow(C.HP_G2, b);
  }
  function milestoneMult(n) {
    let m = 1;
    for (const [c, x] of D.MILESTONES) { if (n >= c) m *= x; else break; }
    return m;
  }
  function nextMilestone(n) {
    for (const [c, x] of D.MILESTONES) if (n < c) return { at: c, mult: x };
    return null;
  }
  const rewardRate = (s) => C.REWARD_PER_HP * Math.pow(C.REWARD_DECAY, s - 1);
  const tapBase = (l) => (1 + l) * Math.pow(2, Math.floor(l / 25));

  function calc() {
    const st = {};
    let pas = 0;
    for (const id in S.axes) { const a = AX[id]; if (a) pas += D.RARITY[a.r].pas * S.axes[id]; }
    const eq = S.equip && S.axes[S.equip] ? AX[S.equip] : null;
    const eqLv = eq ? S.axes[eq.id] : 0;
    const sp = {};
    if (eq && eq.sp) for (const k in eq.sp) sp[k] = eq.sp[k] * (1 + 0.2 * (eqLv - 1));
    st.sp = sp; st.eq = eq; st.eqLv = eqLv;
    st.achMult = 1 + Object.keys(S.ach).length * C.ACH_BONUS;
    st.spiritMult = 1 + S.spirits * C.SPIRIT_BONUS;
    st.axeMult = 1 + pas;
    st.global = st.achMult * st.spiritMult * st.axeMult * (1 + (sp.all || 0));
    const guild = Math.pow(1.3, lv('guild'));
    st.wdps = {};
    let dps = 0;
    for (const w of D.WORKERS) {
      const n = S.workers[w.id] || 0;
      const d = n * w.dps * milestoneMult(n) * guild * (1 + (sp.dps || 0)) * st.global;
      st.wdps[w.id] = d;
      dps += d;
    }
    st.dps = dps;
    st.tapBase = tapBase(lv('tap'));
    st.soul = C.SOUL_BASE + 0.005 * lv('soul');
    st.axeTap = eq ? D.RARITY[eq.r].tap * (1 + 0.1 * (eqLv - 1)) : 1;
    st.tap = (st.tapBase * st.global + dps * st.soul) * st.axeTap;
    st.critC = Math.min(0.9, C.CRIT_BASE + 0.01 * lv('critc') + (sp.critc || 0));
    st.critM = C.CRIT_MULT + 0.25 * lv('critm') + (sp.critm || 0);
    // 斬撃強化
    st.swingMult = 1 + 0.15 * lv('swing');
    st.justZone = Math.min(0.26, C.JUST_ZONE + 0.0045 * lv('just'));
    st.justMult = C.JUST_MULT + 0.1 * lv('just');
    st.chainCap = 5 + Math.floor(lv('just') / 2);
    const ec = lv('echo'), th = lv('thunder'), bl = lv('blast');
    st.echoChance = Math.min(1, 0.02 * ec);
    st.echoCount = ec > 0 ? 1 + Math.floor(ec / 15) : 0;
    st.echoDmg = 0.4 + 0.01 * ec;
    st.thunderChance = th > 0 ? Math.min(0.4, 0.02 + 0.006 * th) : 0;
    st.thunderCount = th > 0 ? 1 + Math.floor(th / 15) : 0;
    st.thunderMult = 3 + 0.25 * th;
    st.blastEvery = bl > 0 ? Math.max(10, 40 - bl) : 0;
    st.blastMult = 8 + bl;
    // 演出の強さ（斬撃系の強化レベルが上がるほど派手になる）
    st.juice = 1 + 0.02 * (lv('swing') + lv('just') + ec + th + bl + lv('critc') + lv('critm'));
    st.comboWin = C.COMBO_WINDOW + 0.1 * lv('combo') + (sp.combo || 0);
    st.comboCap = C.COMBO_CAP + 50 * lv('combocap');
    st.feverTime = C.FEVER_TIME + 0.25 * lv('fever') + (sp.fever || 0);
    st.feverMult = C.FEVER_MULT + 0.5 * lv('fever');
    st.guild = guild;
    st.market = Math.pow(1.2, lv('market'));
    st.reward = st.market * (1 + (sp.reward || 0));
    st.boss = 1 + (sp.boss || 0);
    st.gem = C.GEM_DROP + 0.005 * lv('gem') + (sp.gem || 0);
    st.chest = C.CHEST_DROP + 0.004 * lv('chest');
    st.rare = 1 + 0.15 * lv('rare');
    st.sqInterval = Math.pow(0.92, lv('squirrel'));
    st.offline = Math.min(1, C.OFFLINE_BASE + 0.05 * lv('night') + (perk(5) ? 0.25 : 0));
    st.pity = perk(10) ? 40 : C.PITY;
    let rar = 1 - D.TREE_RARITY.slice(1).reduce((a, r) => a + r.p * st.rare, 0);
    for (const r of D.TREE_RARITY.slice(1)) rar += r.p * st.rare * r.mult;
    st.avgRarity = rar;
    return st;
  }
  // 1人あたりDPS（未所持でも計算できる）
  function unitDps(w) {
    const st = stats();
    const n = S.workers[w.id] || 0;
    return w.dps * milestoneMult(n) * st.guild * (1 + (st.sp.dps || 0)) * st.global;
  }
  // 強化をもう1段買ったときのステータス（表示用）
  function previewUpgrade(id) {
    const cur = stats();
    const l = lv(id);
    S.upg[id] = l + 1;
    const next = calc();
    if (l) S.upg[id] = l; else delete S.upg[id];
    return { cur, next };
  }
  function stats() {
    if (T.dirty || !T.st) { T.st = calc(); T.dirty = false; }
    return T.st;
  }
  const dirty = () => { T.dirty = true; };

  // コンボ中は木こりも含めた全ダメージに倍率が乗る
  function comboMult() {
    if (T.combo <= 0) return 1;
    return 1 + Math.min(T.combo, stats().comboCap) * C.COMBO_PCT;
  }
  function buffMult(scope) {
    let m = 1;
    const now = Date.now();
    for (const b of S.buffs) {
      if (b.end <= now) continue;
      if (b.scope === 'all' || (scope === 'tap' && b.scope === 'tap')) m *= b.mult;
    }
    return m;
  }
  function addBuff(k, scope, mult, sec, name, icon) {
    const now = Date.now();
    const ex = S.buffs.find((b) => b.k === k && b.end > now);
    if (ex) { ex.end = Math.max(ex.end, now + sec * 1000); ex.mult = Math.max(ex.mult, mult); }
    else S.buffs.push({ k, scope, mult, end: now + sec * 1000, dur: sec, name, icon });
    emit('buff', { k, name, icon, sec });
  }

  // 放置時の1秒あたり収入（オフライン・勉強ブーストの基準）
  function incomeRate() {
    const st = stats();
    if (st.dps <= 0) return 0;
    const s = Math.max(1, isBossStage(S.stage) ? S.stage - 1 : S.stage);
    const hp = hpFor(s);
    const t = hp / st.dps;
    const cycle = t + (t < 0.6 ? C.RESPAWN_FAST : C.RESPAWN);
    return (hp * rewardRate(s) * st.reward * st.avgRarity) / cycle;
  }

  // lump=true はオフライン・宝箱などの一括収入（秒間収入の表示に混ぜない）
  function gainWood(x, lump) {
    if (!(x > 0)) return;
    S.wood += x;
    if (!isFinite(S.wood)) S.wood = Number.MAX_VALUE;
    S.stats.woodRun = Math.min(Number.MAX_VALUE, S.stats.woodRun + x);
    S.stats.woodAll = Math.min(Number.MAX_VALUE, S.stats.woodAll + x);
    if (!lump) T.incomeAcc += x;
  }
  function gainGems(g) {
    if (!(g > 0)) return;
    S.gems += g;
    S.stats.gemsAll += g;
    emit('gems', g);
  }

  // ------------------------------------------------------------- 木
  function spawnTree() {
    const st = stats();
    const boss = isBossStage(S.stage) && !S.farming;
    let rar = D.TREE_RARITY[0];
    if (!boss) {
      const r = Math.random();
      let acc = 0;
      for (let i = D.TREE_RARITY.length - 1; i >= 1; i--) {
        acc += D.TREE_RARITY[i].p * st.rare;
        if (r < acc) { rar = D.TREE_RARITY[i]; break; }
      }
    }
    const hp = hpFor(S.stage) * (boss ? C.BOSS_HP_MULT : 1);
    T.tree = {
      hp, maxHp: hp, rar, boss, stage: S.stage, born: T.time, alive: true, escaped: false,
      seed: (Math.random() * 1e9) | 0, side: Math.random() < 0.5 ? -1 : 1,
    };
    if (boss) { T.bossTimer = C.BOSS_TIME; emit('bossStart', T.tree); }
    emit('spawn', T.tree);
  }

  function hit(dmg) {
    const tr = T.tree;
    if (!tr || !tr.alive) return;
    tr.hp -= dmg;
    if (tr.hp <= 0) { tr.hp = 0; fell(); }
  }

  function fell() {
    const tr = T.tree;
    tr.alive = false;
    const st = stats();
    const reward = tr.maxHp * rewardRate(tr.stage) * tr.rar.mult * st.reward * (tr.boss ? 1.5 : 1);
    gainWood(reward);
    let gems = tr.rar.gems;
    if (Math.random() < st.gem) gems += 1;
    let chest = Math.random() < st.chest * (tr.rar.id !== 'normal' ? 2 : 1) ? 1 : 0;
    if (tr.boss) {
      const first = S.stage > (S.stats.bestBoss || 0);
      if (first) S.stats.bestBoss = S.stage;
      gems += first ? 20 : 3;
      chest += 1;
    }
    if (gems) gainGems(gems);
    if (chest) S.chests += chest;
    S.stats.kills++;
    if (tr.rar.id === 'gold') S.stats.gold++;
    if (tr.rar.id === 'rainbow') S.stats.rainbow++;
    T.respawn = T.time - tr.born < 0.6 ? C.RESPAWN_FAST : C.RESPAWN;
    emit('fell', { tree: tr, reward, gems, chest });
    if (tr.boss) {
      S.stats.bosses++;
      T.bossTimer = 0;
      emit('bossWin', { stage: S.stage, gems });
      advanceStage();
    } else if (S.farming) {
      T.farmKills++;
      if (perk(2) && T.farmKills >= 10) T.pendingBoss = true;
    } else {
      S.kills++;
      if (S.kills >= C.TREES_PER_STAGE) advanceStage();
    }
  }

  function advanceStage() {
    const prev = biomeIndex(S.stage);
    S.stage++;
    S.kills = 0;
    if (S.stage > S.maxStage) S.maxStage = S.stage;
    if (S.stage > S.stats.bestStage) S.stats.bestStage = S.stage;
    emit('stage', { stage: S.stage, newBiome: biomeIndex(S.stage) !== prev });
  }

  function bossFail() {
    const tr = T.tree;
    tr.alive = false;
    tr.escaped = true;
    S.farming = true;
    S.stage = Math.max(1, S.stage - 1);
    S.kills = 0;
    T.farmKills = 0;
    T.bossTimer = 0;
    T.respawn = C.RESPAWN;
    emit('bossFail', tr);
  }

  function challengeBoss() {
    if (!S.farming) return false;
    S.farming = false;
    S.stage += 1;
    S.kills = 0;
    T.farmKills = 0;
    T.pendingBoss = false;
    if (T.tree) T.tree.alive = false;
    spawnTree();
    return true;
  }

  // ------------------------------------------------------------- 斬撃（メインの気持ちよさ）
  // 斧をドラッグして幹を横切ると1撃。速く振るほど・切り込みの高さを狙うほど強い。
  function speedTier(v) {
    let t = 0;
    for (const th of C.SPEED_TIERS) if (v >= th) t++;
    return t;
  }
  function swing(o = {}) {
    if (S.study) return null;
    const st = stats();
    const isTap = o.kind === 'tap';
    S.stats.taps++;
    T.combo++;
    T.comboTimer = st.comboWin;
    T.comboWin = st.comboWin;
    if (T.combo > S.stats.maxCombo) S.stats.maxCombo = T.combo;
    for (const m of S.missions) if (m.t === 'combo' && T.combo > (m.best || 0)) m.best = T.combo;
    if (COMBO_MS.indexOf(T.combo) >= 0) {
      const g = T.combo >= 2000 ? 15 : T.combo >= 1000 ? 10 : T.combo >= 500 ? 5 : T.combo >= 100 ? 2 : 1;
      gainGems(g);
      emit('comboMs', { n: T.combo, gems: g });
    }
    // 速度ランク（タップは -1 = ランクなし）
    const stier = isTap ? -1 : speedTier(o.speed || 0);
    const bonus = isTap ? 0 : C.SPEED_BONUS[stier];
    const sMult = isTap ? C.TAP_MULT : 1 + (bonus > 0 ? bonus * st.swingMult : bonus);
    if (stier >= 3) S.stats.greats++;
    if (stier >= 5) S.stats.maxSpeeds++;
    // JUST（切り込みの高さで斬る）と連続JUSTチェイン
    const just = !isTap && !!o.just;
    if (just) {
      T.justChain++;
      S.stats.justs++;
      if (T.justChain > S.stats.maxChain) S.stats.maxChain = T.justChain;
    } else if (!isTap) T.justChain = 0;
    const jMult = just ? st.justMult * (1 + 0.1 * Math.min(T.justChain - 1, st.chainCap)) : 1;
    // 会心
    const fever = T.fever > 0;
    let tier = 0;
    if (Math.random() < st.critC + (fever ? 0.25 : 0)) {
      tier = 1; S.stats.crits++;
      if (Math.random() < 0.1) {
        tier = 2; S.stats.supers++;
        if (Math.random() < 0.1) {
          tier = 3; S.stats.ultras++;
          if (Math.random() < 0.1) { tier = 4; S.stats.gods++; }
        }
      }
    }
    const tierMult = tier === 0 ? 1 : st.critM * [1, 1, 3, 10, 50][tier];
    let dmg = st.tap * comboMult() * buffMult('tap') * (fever ? st.feverMult : 1) * tierMult * sMult * jMult;
    const alive = !!(T.tree && T.tree.alive);
    if (alive && T.tree.boss) dmg *= st.boss;
    if (!fever) {
      T.feverGauge += isTap ? 0.6 : 1 + Math.max(0, stier) * 0.2 + (just ? 1 : 0) + (tier ? 2 : 0);
      if (T.feverGauge >= C.FEVER_NEED) startFever();
    }
    if (tier === 4) gainGems(10);
    // 追撃（強化で解放）: 残像・落雷・爆裂
    const procs = [];
    if (alive && !isTap) {
      if (st.echoCount && Math.random() < st.echoChance) {
        for (let k = 1; k <= st.echoCount; k++) procs.push({ kind: 'echo', delay: 0.11 * k, dmg: dmg * st.echoDmg, n: k });
      }
      if (st.thunderCount && Math.random() < st.thunderChance) {
        for (let k = 0; k < st.thunderCount; k++) procs.push({ kind: 'thunder', delay: 0.08 + 0.14 * k, dmg: dmg * st.thunderMult, n: k + 1 });
      }
      if (st.blastEvery) {
        T.blastCount++;
        if (T.blastCount >= st.blastEvery) { T.blastCount = 0; procs.push({ kind: 'blast', delay: 0.06, dmg: dmg * st.blastMult, n: 1 }); }
      }
    }
    const ev = {
      dmg, tier, stier, just, chain: T.justChain, combo: T.combo, x: o.x, y: o.y, dir: o.dir || 1, alive, speed: o.speed || 0,
      kind: isTap ? 'tap' : 'swing', procs: procs.map((p) => p.kind), blastIn: st.blastEvery ? st.blastEvery - T.blastCount : 0,
    };
    emit('swing', ev);
    if (alive) hit(dmg);
    for (const p of procs) T.pending.push({ t: T.time + p.delay, kind: p.kind, dmg: p.dmg, n: p.n, x: o.x, y: o.y, dir: o.dir || 1 });
    return ev;
  }
  // ドラッグしない操作（タップ・キーボード）は弱い一振り
  const tap = (x, y) => swing({ kind: 'tap', x, y });

  function startFever() {
    const st = stats();
    T.fever = st.feverTime;
    T.feverMax = st.feverTime;
    T.feverGauge = 0;
    S.stats.fevers++;
    emit('feverStart', { mult: st.feverMult, time: st.feverTime });
  }

  // ------------------------------------------------------------- 購入
  function workerCost(w, have, n) {
    const r = C.COST_GROWTH;
    return (w.cost * Math.pow(r, have) * (Math.pow(r, n) - 1)) / (r - 1);
  }
  function maxAffordable(w, have, wood) {
    const r = C.COST_GROWTH, c0 = w.cost * Math.pow(r, have);
    if (wood < c0) return 0;
    let n = Math.floor(Math.log((wood * (r - 1)) / c0 + 1) / Math.log(r));
    while (n > 0 && workerCost(w, have, n) > wood) n--; // 誤差対策
    return n;
  }
  function buyAmount(w) {
    const amt = S.settings.buyAmt;
    const have = S.workers[w.id] || 0;
    if (amt === 'max') return Math.max(1, maxAffordable(w, have, S.wood));
    return amt;
  }
  function buyWorker(id, amt) {
    const w = WK[id];
    if (!w) return false;
    const have = S.workers[id] || 0;
    const n = amt === 'max' ? maxAffordable(w, have, S.wood) : amt;
    if (!(n > 0)) return false;
    const cost = workerCost(w, have, n);
    if (cost > S.wood) return false;
    S.wood -= cost;
    S.workers[id] = have + n;
    S.stats.hires += n;
    const before = milestoneMult(have), after = milestoneMult(have + n);
    dirty();
    emit('buyWorker', { w, n, count: have + n });
    if (after > before) emit('milestone', { w, mult: after / before, count: have + n });
    return true;
  }
  const upgCost = (u, l = lv(u.id)) => u.base * Math.pow(u.growth, l);
  const upgMaxed = (u) => u.max > 0 && lv(u.id) >= u.max;
  function buyUpgrade(id) {
    const u = UP[id];
    if (!u || upgMaxed(u)) return false;
    const c = upgCost(u);
    if (c > S.wood) return false;
    S.wood -= c;
    S.upg[id] = lv(id) + 1;
    dirty();
    emit('buyUpgrade', { u, lv: S.upg[id] });
    return true;
  }

  // ------------------------------------------------------------- ガチャ
  function rollRarity() {
    const r = Math.random();
    let acc = 0;
    for (let i = D.RARITY_ORDER.length - 1; i >= 0; i--) {
      const k = D.RARITY_ORDER[i];
      acc += D.RARITY[k].rate;
      if (r < acc) return k;
    }
    return 'N';
  }
  function canPull(n) {
    return S.tickets >= n || S.gems >= (n === 10 ? C.GACHA_10 : C.GACHA_1);
  }
  function pull(n) {
    if (S.study) return { error: 'study' };
    const cost = n === 10 ? C.GACHA_10 : C.GACHA_1;
    if (S.tickets >= n) S.tickets -= n;
    else if (S.gems >= cost) S.gems -= cost;
    else return { error: 'gems' };
    const st = stats();
    const res = [];
    for (let i = 0; i < n; i++) {
      S.pity++;
      let r = rollRarity();
      if (n === 10 && i === n - 1 && !res.some((x) => RANK[x.r] >= 2) && RANK[r] < 2) r = 'SR';
      if (S.pity >= st.pity && RANK[r] < 3) r = 'SSR';
      if (RANK[r] >= 3) S.pity = 0;
      const pool = D.AXES.filter((a) => a.r === r);
      const axe = pool[Math.floor(Math.random() * pool.length)];
      const had = S.axes[axe.id] || 0;
      const out = { axe, r, isNew: !had, lvUp: false, gems: 0, lv: 1 };
      if (!had) S.axes[axe.id] = 1;
      else if (had < C.AXE_MAX_LV) { S.axes[axe.id] = had + 1; out.lvUp = true; }
      else { out.gems = D.RARITY[r].gem; gainGems(out.gems); }
      out.lv = S.axes[axe.id];
      if (r === 'SSR') S.stats.gotSSR++;
      if (r === 'UR') S.stats.gotUR++;
      if (r === 'LR') S.stats.gotLR++;
      res.push(out);
    }
    S.stats.pulls += n;
    // 未装備、または装備中より高レアなら自動装備
    let best = null;
    for (const o of res) if (!best || RANK[o.r] > RANK[best.r]) best = o;
    const cur = S.equip && AX[S.equip];
    if (!cur || RANK[best.r] > RANK[cur.r]) S.equip = best.axe.id;
    dirty();
    emit('gacha', { res, n });
    return { res };
  }
  function equip(id) {
    if (!S.axes[id]) return false;
    S.equip = id;
    dirty();
    emit('equip', AX[id]);
    return true;
  }

  // ------------------------------------------------------------- 宝箱
  function openChest() {
    if (S.chests <= 0) return null;
    S.chests--;
    S.stats.chestsOpened++;
    const c = U.weighted(D.CHESTS);
    const s = Math.max(1, isBossStage(S.stage) ? S.stage - 1 : S.stage);
    const wood = Math.max(incomeRate() * c.sec, hpFor(s) * 3 * (c.sec / 120));
    const gems = U.randInt(c.gems[0], c.gems[1]);
    gainWood(wood, true);
    gainGems(gems);
    S.tickets += c.ticket;
    const r = { c, wood, gems, tickets: c.ticket };
    emit('chest', r);
    return r;
  }

  // ------------------------------------------------------------- 黄金リス / 泉の女神
  function nextSquirrelTime() { return U.rand(C.SQUIRREL_MIN, C.SQUIRREL_MAX) * stats().sqInterval; }
  function catchSquirrel() {
    const sq = T.squirrel;
    if (!sq) return null;
    T.squirrel = null;
    T.squirrelTimer = nextSquirrelTime();
    if (sq.kind === 'goddess') { emit('goddess'); return { goddess: true }; }
    S.stats.squirrels++;
    const fx = U.weighted(D.SQUIRREL_FX);
    let detail = fx.text;
    switch (fx.id) {
      case 'frenzy': addBuff('frenzy', 'all', 7, 30, '狂乱 ×7', '🔥'); break;
      case 'click': addBuff('click', 'tap', 77, 12, '連打狂乱 ×77', '👆'); break;
      case 'lucky': {
        const s = Math.max(1, isBossStage(S.stage) ? S.stage - 1 : S.stage);
        const w = Math.max(incomeRate() * 600, hpFor(s) * 25);
        gainWood(w, true);
        detail = `木材 +${U.fmt(w)}`;
        break;
      }
      case 'gems': { const g = U.randInt(15, 40); gainGems(g); detail = `ジェム +${g}`; break; }
      case 'fever': if (T.fever <= 0) startFever(); else T.fever = T.feverMax; break;
      case 'chest': S.chests += 2; break;
      case 'jackpot': addBuff('jackpot', 'tap', 777, 7, '大当たり ×777', '🎰'); gainGems(77); break;
    }
    emit('sqCatch', { fx, detail });
    return { fx, detail };
  }
  function goddessAnswer(honest) {
    if (honest) {
      S.stats.goddess++;
      gainGems(50);
      S.tickets += 3;
      addBuff('goddess', 'all', 10, 30, '女神の祝福 ×10', '⛲');
    }
    emit('goddessResult', { honest });
  }

  // ------------------------------------------------------------- ミッション
  function newMission(exclude) {
    const types = D.MISSIONS.filter((m) => exclude.indexOf(m.t) < 0);
    const def = types[Math.floor(Math.random() * types.length)];
    const l = S.missionLv;
    let target;
    if (def.special === 'stage') target = S.maxStage + 3;
    else if (def.special === 'combo') target = Math.min(def.base + def.add * l, 800);
    else target = Math.max(1, Math.round(def.base * Math.pow(def.grow, l)));
    return {
      t: def.t, target, start: def.stat ? S.stats[def.stat] || 0 : 0, best: 0, ready: false,
      gems: 15 + Math.min(35, l), chest: Math.random() < 0.3 ? 1 : 0,
    };
  }
  function ensureMissions() {
    S.missions = S.missions.filter((m) => m && MS[m.t]);
    while (S.missions.length < 3) S.missions.push(newMission(S.missions.map((m) => m.t)));
  }
  function missionProgress(m) {
    const def = MS[m.t];
    if (def.special === 'stage') return S.maxStage;
    if (def.special === 'combo') return m.best || 0;
    return (S.stats[def.stat] || 0) - m.start;
  }
  const missionText = (m) => MS[m.t].text(m.target);
  function claimMission(i) {
    const m = S.missions[i];
    if (!m || missionProgress(m) < m.target) return false;
    gainGems(m.gems);
    S.chests += m.chest;
    S.stats.missionsDone++;
    S.missionLv++;
    S.missions[i] = newMission(S.missions.filter((_, j) => j !== i).map((x) => x.t).concat([m.t]));
    emit('missionClaim', { m });
    return true;
  }
  function checkMissions() {
    for (const m of S.missions) {
      if (!m.ready && missionProgress(m) >= m.target) { m.ready = true; emit('missionReady', m); }
    }
  }

  // ------------------------------------------------------------- 実績・ログボ
  function checkAch() {
    for (const a of D.ACH) {
      if (!S.ach[a.id] && a.check(S)) {
        S.ach[a.id] = 1;
        gainGems(a.gems);
        dirty();
        emit('ach', a);
      }
    }
  }
  function checkDaily() {
    const today = U.todayStr();
    if (S.daily.last === today) return;
    S.daily.last = today;
    S.stats.loginDays++;
    const idx = (S.stats.loginDays - 1) % D.LOGIN.length;
    const r = D.LOGIN[idx];
    if (r.gems) gainGems(r.gems);
    if (r.chests) S.chests += r.chests;
    if (r.tickets) S.tickets += r.tickets;
    emit('daily', { day: S.stats.loginDays, idx, r });
  }

  // ------------------------------------------------------------- 転生
  function spiritGain(stage = S.maxStage) {
    if (stage < C.PRESTIGE_MIN_STAGE) return 0;
    return Math.floor(3 * Math.pow(1.15, stage - 20));
  }
  const startStage = () => (perk(15) ? 31 : perk(7) ? 16 : perk(3) ? 6 : 1);
  function prestige() {
    const g = spiritGain();
    if (g <= 0) return 0;
    S.spirits += g;
    S.stats.prestiges++;
    S.stats.bestSpirits = Math.max(S.stats.bestSpirits, g);
    S.wood = 0;
    S.workers = {};
    S.upg = {};
    S.kills = 0;
    S.farming = false;
    S.buffs = [];
    S.stats.woodRun = 0;
    S.stage = startStage();
    S.maxStage = S.stage;
    if (perk(1)) S.workers.w1 = 10;
    T.combo = 0; T.fever = 0; T.feverGauge = 0; T.bossTimer = 0; T.pendingBoss = false; T.farmKills = 0;
    T.incomeEMA = 0;
    dirty();
    spawnTree();
    emit('prestige', { gain: g });
    save();
    return g;
  }

  // ------------------------------------------------------------- 勉強ブースト
  function startStudy(min) {
    if (S.study) return false;
    const now = Date.now();
    S.study = { start: now, end: now + min * 60000, min, rate: incomeRate() };
    T.combo = 0; T.fever = 0;
    save();
    emit('studyStart', S.study);
    return true;
  }
  const studyLeft = () => (S.study ? Math.max(0, (S.study.end - Date.now()) / 1000) : 0);
  function finishStudy() {
    const s = S.study;
    if (!s) return;
    S.study = null;
    S.stats.studies++;
    const wood = s.rate * s.min * 60 * C.STUDY_MULT;
    const gems = s.min * 2;
    const tickets = s.min >= 50 ? 2 : 1;
    gainWood(wood, true);
    gainGems(gems);
    S.tickets += tickets;
    save();
    emit('studyDone', { min: s.min, wood, gems, tickets });
  }
  function abortStudy() {
    const s = S.study;
    if (!s) return;
    S.study = null;
    const sec = (Date.now() - s.start) / 1000;
    const wood = s.rate * sec * stats().offline;
    gainWood(wood, true);
    save();
    emit('studyAbort', { sec, wood });
  }

  // ------------------------------------------------------------- オフライン
  function applyOffline(now = Date.now()) {
    let from = S.lastSave;
    if (S.study) {
      if (now >= S.study.end) { const end = S.study.end; finishStudy(); from = Math.max(from, end); }
      else { S.lastSave = now; return; }
    }
    const sec = Math.min(Math.max(0, (now - from) / 1000), C.OFFLINE_CAP_H * 3600);
    S.lastSave = now;
    if (sec < 3) return;
    const st = stats();
    let gain = incomeRate() * sec * st.offline;
    const slept = sec >= C.SLEEP_H * 3600;
    if (slept) { gain *= C.SLEEP_BONUS; S.stats.sleeps++; }
    gainWood(gain, true);
    emit('offline', { sec, gain, slept, eff: st.offline });
  }

  // ------------------------------------------------------------- メインティック
  function tick(dt) {
    if (S.study) {
      if (Date.now() >= S.study.end) finishStudy();
      return;
    }
    T.time += dt;
    S.stats.playTime += dt;
    const st = stats();

    if (T.combo > 0) {
      T.comboTimer -= dt;
      if (T.comboTimer <= 0) { emit('comboEnd', T.combo); T.combo = 0; T.justChain = 0; T.blastCount = 0; }
    }
    if (T.fever > 0) {
      T.fever -= dt;
      if (T.fever <= 0) { T.fever = 0; emit('feverEnd'); }
    } else if (T.combo === 0 && T.feverGauge > 0) {
      T.feverGauge = Math.max(0, T.feverGauge - 10 * dt);
    }

    if (T.pending.length) {
      for (let i = 0; i < T.pending.length; i++) {
        const p = T.pending[i];
        if (T.time < p.t) continue;
        T.pending.splice(i--, 1);
        const alive = !!(T.tree && T.tree.alive);
        if (p.kind === 'echo') S.stats.echoes++;
        else if (p.kind === 'thunder') S.stats.thunders++;
        else S.stats.blasts++;
        emit('proc', Object.assign({ alive }, p));
        if (alive) hit(p.dmg);
      }
    }
    if (!T.tree) spawnTree();
    if (T.tree.alive) {
      if (st.dps > 0) {
        let d = st.dps * comboMult() * buffMult('all') * (T.fever > 0 ? st.feverMult : 1) * dt;
        if (T.tree.boss) d *= st.boss;
        T.dpsAcc += d;
        hit(d);
      }
      if (T.tree.alive && T.tree.boss) {
        T.bossTimer -= dt;
        if (T.bossTimer <= 0) bossFail();
      }
    } else {
      T.respawn -= dt;
      if (T.respawn <= 0) {
        if (T.pendingBoss) challengeBoss();
        else spawnTree();
      }
    }

    if (T.squirrel) {
      T.squirrel.life -= dt;
      if (T.squirrel.life <= 0) { T.squirrel = null; T.squirrelTimer = nextSquirrelTime(); emit('sqGone'); }
    } else {
      T.squirrelTimer -= dt;
      if (T.squirrelTimer <= 0) {
        T.squirrel = {
          kind: Math.random() < C.GODDESS_RATE ? 'goddess' : 'squirrel',
          life: C.SQUIRREL_LIFE, x: U.rand(0.12, 0.88), y: U.rand(0.34, 0.72),
        };
        emit('sqSpawn', T.squirrel);
      }
    }

    if (S.buffs.length) {
      const now = Date.now(), n = S.buffs.length;
      S.buffs = S.buffs.filter((b) => b.end > now);
      if (S.buffs.length !== n) emit('buffEnd');
    }

    T.incomeT += dt;
    if (T.incomeT >= 1) {
      const r = T.incomeAcc / T.incomeT;
      T.incomeEMA = T.incomeEMA ? T.incomeEMA * 0.75 + r * 0.25 : r;
      T.incomeAcc = 0;
      T.incomeT = 0;
    }

    T.checkT += dt;
    if (T.checkT >= 1) {
      T.checkT = 0;
      checkAch();
      checkMissions();
      checkDaily();
    }
  }

  // ------------------------------------------------------------- セーブ / ロード
  function merge(base, src) {
    for (const k in src) {
      const s = src[k];
      if (!(k in base)) {
        if (typeof s === 'number' && !isFinite(s)) continue;
        base[k] = s;
        continue;
      }
      const b = base[k];
      if (b && typeof b === 'object' && !Array.isArray(b) && s && typeof s === 'object' && !Array.isArray(s)) merge(b, s);
      else if (typeof b === 'number') base[k] = typeof s === 'number' && isFinite(s) ? s : b;
      else if (Array.isArray(b)) base[k] = Array.isArray(s) ? s : b;
      else base[k] = s;
    }
    return base;
  }
  function serialize() { return JSON.stringify(S); }
  function save() {
    S.lastSave = Date.now();
    const json = serialize();
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, json); } catch (e) { /* 保存不可の環境 */ }
    emit('saved', json);
    return json;
  }
  function loadFrom(json) {
    try {
      const o = typeof json === 'string' ? JSON.parse(json) : json;
      if (!o || typeof o !== 'object' || !o.stats) return false;
      S = merge(fresh(), o);
      for (const id in S.axes) if (!AX[id]) delete S.axes[id];
      if (S.equip && !S.axes[S.equip]) S.equip = null;
      if (S.study && !(S.study.end > 0)) S.study = null;
      return true;
    } catch (e) {
      return false;
    }
  }
  function readLocal() {
    try { return typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null; } catch (e) { return null; }
  }
  function reset() {
    T.tree = null; T.combo = 0; T.fever = 0; T.feverGauge = 0; T.bossTimer = 0; T.pendingBoss = false;
    T.justChain = 0; T.blastCount = 0; T.pending = [];
    T.squirrel = null; T.squirrelTimer = 25; T.farmKills = 0; T.incomeEMA = 0;
    dirty();
    ensureMissions();
    spawnTree();
    emit('load');
  }
  // json: 明示的に渡されたセーブ（hot reload / クラウド）。無ければローカル。
  function init(json) {
    const src = json || readLocal();
    if (!(src && loadFrom(src))) S = fresh();
    reset();
  }
  function exportSave() { return U.toB64(save()); }
  function importSave(text) {
    let json;
    try { json = U.fromB64(text); } catch (e) { return false; }
    if (!loadFrom(json)) return false;
    reset();
    save();
    return true;
  }
  function hardReset() {
    S = fresh();
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
    reset();
    save();
  }

  return {
    get S() { return S; },
    T, on, emit, stats, dirty, tick, tap, swing, speedTier, startFever,
    unitDps, previewUpgrade, buyWorker, buyAmount, workerCost, maxAffordable, buyUpgrade, upgCost, upgMaxed,
    pull, canPull, equip, openChest, claimMission, missionProgress, missionText,
    catchSquirrel, goddessAnswer, challengeBoss, prestige, spiritGain, startStage, perk,
    startStudy, abortStudy, finishStudy, studyLeft, applyOffline, checkDaily,
    save, serialize, loadFrom, init, exportSave, importSave, hardReset,
    hpFor, biomeIndex, isBossStage, incomeRate, milestoneMult, nextMilestone, buffMult, comboMult, tapBase,
    AX, WK, UP, RANK, COMBO_MS,
  };
})();

if (typeof module !== 'undefined') module.exports = { G };
