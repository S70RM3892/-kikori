#!/usr/bin/env node
// =====================================================================
//  バランスシミュレータ: 実際のゲームロジック（js/*.js）をそのまま読み込み、
//  貪欲に買い物をするボットを走らせて進行速度を確認する。
//    node tools/sim.js [分数=180] [斬撃/秒=2] [seed]
//  斬撃は「幹を横切る回数/秒」。速さのランクとJUST率は人間の平均的なスワイプを想定。
// =====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MIN = Number(process.argv[2] || 180);
const TPS = Number(process.argv[3] || 2);
let seed = Number(process.argv[4] || 12345);
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

let simNow = Date.UTC(2026, 0, 1, 12);
class FakeDate extends Date { static now() { return simNow; } }
const sandboxMath = Object.create(Math);
sandboxMath.random = rng;
const ctx = vm.createContext({ console, Math: sandboxMath, Date: FakeDate, TextEncoder, TextDecoder, btoa, atob });
for (const f of ['util.js', 'data.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const G = vm.runInContext('G', ctx);
const D = vm.runInContext('D', ctx);
const U = vm.runInContext('U', ctx);
if (process.env.SIM_CFG) Object.assign(D.CFG, JSON.parse(process.env.SIM_CFG));

G.init(null);
const S = () => G.S;
const ev = { bossFail: 0, bossWin: 0, gacha: 0, fevers: 0 };
G.on('bossFail', () => ev.bossFail++);
G.on('bossWin', () => ev.bossWin++);
G.on('feverStart', () => ev.fevers++);
const gsrc = {};
const addG = (k, n) => { gsrc[k] = (gsrc[k] || 0) + (n || 0); };
G.on('ach', (a) => addG('ach', a.gems));
G.on('missionClaim', (d) => addG('mission', d.m.gems));
G.on('fell', (d) => addG(d.tree.boss ? 'boss' : 'tree', d.gems));
G.on('chest', (r) => addG('chest', r.gems));
G.on('comboMs', (d) => addG('combo', d.gems));
G.on('daily', (d) => addG('daily', d.r.gems));
G.on('gacha', (d) => addG('dupe', d.res.reduce((x, o) => x + o.gems, 0)));
G.on('swing', (d) => { if (d.tier === 4) addG('god', 10); });

// 速さランクの分布（0..5）とJUST率: 普通に頑張って振る人
const TIER_P = [0.02, 0.16, 0.36, 0.32, 0.11, 0.03];
const TIER_V = [0.8, 1.8, 3.4, 5.6, 8.2, 11];
const pJust = (st) => Math.min(0.85, 0.3 * (st.justZone / D.CFG.JUST_ZONE));
function manualMult(st) {
  let sm = 0;
  for (let t = 0; t < 6; t++) { const b = D.CFG.SPEED_BONUS[t]; sm += TIER_P[t] * (1 + (b > 0 ? b * st.swingMult : b)); }
  const jm = 1 + pJust(st) * (st.justMult * 1.25 - 1);
  const proc = 1 + st.echoChance * st.echoCount * st.echoDmg + st.thunderChance * st.thunderCount * st.thunderMult + (st.blastEvery ? st.blastMult / st.blastEvery : 0);
  return sm * jm * proc;
}
function effective(st) {
  const combo = 1 + Math.min(st.comboCap, TPS * st.comboWin > 1 ? 400 : 0) * D.CFG.COMBO_PCT;
  const crit = 1 + st.critC * (st.critM * 1.31 - 1);
  return (st.dps + TPS * st.tap * crit * manualMult(st)) * combo;
}
function sampleSwing() {
  let r = rng(), t = 0;
  while (t < 5 && r > TIER_P[t]) { r -= TIER_P[t]; t++; }
  const st = G.stats();
  return { kind: 'swing', speed: TIER_V[t], just: rng() < pJust(st), dir: rng() < 0.5 ? -1 : 1 };
}
function evalWith(fn) {
  const s = S();
  const snap = JSON.stringify({ w: s.workers, u: s.upg });
  fn(s);
  G.dirty();
  const st = G.stats();
  const e = effective(st) * st.reward * st.avgRarity;
  const o = JSON.parse(snap);
  s.workers = o.w; s.upg = o.u;
  G.dirty();
  return e;
}
const SKIP = new Set(['gem', 'chest', 'squirrel', 'night']);
function shop() {
  for (let guard = 0; guard < 200; guard++) {
    const s = S();
    const st = G.stats();
    const base = effective(st) * st.reward * st.avgRarity;
    const cands = [];
    for (const w of D.WORKERS) {
      const have = s.workers[w.id] || 0;
      const cost = G.workerCost(w, have, 1);
      const e = evalWith((x) => { x.workers[w.id] = have + 1; });
      cands.push({ kind: 'w', id: w.id, cost, gain: e - base });
    }
    for (const u of D.UPGRADES) {
      if (G.upgMaxed(u)) continue;
      const cost = G.upgCost(u);
      if (SKIP.has(u.id)) { if (cost < s.wood * 0.02) cands.push({ kind: 'u', id: u.id, cost, gain: base * 1e-9, cheap: true }); continue; }
      const e = evalWith((x) => { x.upg[u.id] = (x.upg[u.id] || 0) + 1; });
      cands.push({ kind: 'u', id: u.id, cost, gain: e - base });
    }
    for (const c of cands) c.ratio = c.gain / c.cost;
    cands.sort((a, b) => b.ratio - a.ratio);
    const best = cands[0];
    let pick = null;
    if (best && best.cost <= s.wood) pick = best;
    else {
      const cheap = cands.find((c) => c.cheap && c.cost <= s.wood);
      const alt = cands.find((c) => c.cost <= s.wood && c.ratio >= best.ratio * 0.35);
      pick = cheap || alt;
    }
    if (!pick) return;
    if (pick.kind === 'w') G.buyWorker(pick.id, 1); else G.buyUpgrade(pick.id);
  }
}

const DT = 0.1;
let t = 0, tapAcc = 0, lastFailE = 0, bossCd = 0, lastMax = 1, lastMaxT = 0;
const report = [];
const firstReach = {};
let prestigeLog = [];
while (t < MIN * 60) {
  t += DT;
  simNow += DT * 1000;
  tapAcc += TPS * DT;
  while (tapAcc >= 1) { tapAcc -= 1; G.swing(sampleSwing()); }
  G.tick(DT);
  const s = S();
  if (Math.round(t * 10) % 5 === 0) {
    shop();
    while (s.tickets >= 10 || s.gems >= D.CFG.GACHA_10) { if (G.pull(10).error) break; ev.gacha++; }
    while (s.chests > 0) G.openChest();
    for (let i = 0; i < 3; i++) G.claimMission(i);
    if (G.T.squirrel && rng() < 0.03) G.catchSquirrel();
  }
  if (s.farming) {
    bossCd -= DT;
    const e = effective(G.stats());
    if (bossCd <= 0 && e > lastFailE * 1.25) { G.challengeBoss(); lastFailE = e; bossCd = 20; }
  }
  if (s.maxStage > lastMax) { lastMax = s.maxStage; lastMaxT = t; }
  for (const m of [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200]) if (s.stats.bestStage >= m && !firstReach[m]) firstReach[m] = (t / 60).toFixed(1);
  // 転生判定: 8分以上停滞し、獲得量が現在の精霊数以上
  const gain = G.spiritGain();
  if (gain > 0 && t - lastMaxT > 480 && gain >= Math.max(5, s.spirits * 0.8)) {
    prestigeLog.push(`${(t / 60).toFixed(1)}分: ステージ${s.maxStage}で転生 +${gain}精霊 (計${s.spirits + gain})`);
    G.prestige();
    lastMax = s.maxStage; lastMaxT = t; lastFailE = 0;
  }
  const EVERY = Number(process.env.SIM_EVERY || 600);
  if (Math.abs(t % EVERY) < DT / 2 || t >= MIN * 60) {
    const st = G.stats();
    const wk = D.WORKERS.map((w) => s.workers[w.id] || 0).filter((x) => x).join('/');
    report.push(`${(t / 60).toFixed(0).padStart(4)}分 st${String(s.stage).padStart(3)} max${String(s.maxStage).padStart(3)} ` +
      `DPS ${U.fmt(st.dps).padStart(8)} tap ${U.fmt(st.tap).padStart(8)} 木 ${U.fmt(s.wood).padStart(8)} ` +
      `income ${U.fmt(G.incomeRate()).padStart(8)}/s 精霊${s.spirits} 💎${s.gems} 斧${Object.keys(s.axes).length} 実績${Object.keys(s.ach).length} [${wk}]` + (process.env.SIM_UPG ? ' ' + JSON.stringify(s.upg) + ' eq=' + s.equip + ' g=' + st.global.toFixed(2) + ' axTap=' + st.axeTap.toFixed(2) : ''));
  }
}
console.log(report.join('\n'));
console.log('初到達(分):', JSON.stringify(firstReach));
console.log(prestigeLog.join('\n'));
console.log('gems by source', JSON.stringify(gsrc));
console.log('events', JSON.stringify(ev), 'upg', JSON.stringify(S().upg));
