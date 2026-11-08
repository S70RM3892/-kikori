#!/usr/bin/env node
// =====================================================================
//  菌斬り次元のバランスシミュレータ: js/*.js をそのまま読み込み、
//  刀を振るボットを走らせてウェーブの進み方を見る。
//    node tools/germsim.js [分数=60] [一振り/秒=1.2] [精霊=30] [seed]
//  一振りでは近くの菌を1〜4体まとめて斬る（人間の平均的なスワイプを想定）。
// =====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MIN = Number(process.argv[2] || 60);
const SPS = Number(process.argv[3] || 1.2);
const SPIRITS = Number(process.argv[4] || 30);
let seed = Number(process.argv[5] || 4242);
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let simNow = Date.UTC(2026, 0, 1, 12);
class FakeDate extends Date { static now() { return simNow; } }
const M = Object.create(Math);
M.random = rng;
const ctx = vm.createContext({ console, Math: M, Date: FakeDate, TextEncoder, TextDecoder, btoa, atob });
for (const f of ['util.js', 'data.js', 'datagen.js', 'germdata.js', 'germgen.js', 'dimgen.js', 'game.js', 'germ.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const G = vm.runInContext('G', ctx), GM = vm.runInContext('GM', ctx), GD = vm.runInContext('GD', ctx), D = vm.runInContext('D', ctx), DM = vm.runInContext('DM', ctx);
// SIM_DIMS=n: ウェーブ15で次の次元が開いたらすぐ移る（最前線を追う人）。n番目の次元まで
const SIM_DIMS = Number(process.env.SIM_DIMS || 0);
if (process.env.SIM_GCFG) Object.assign(GD.CFG, JSON.parse(process.env.SIM_GCFG));
G.init(null);
const S = G.S;
// 1回転生した直後くらいの状態
S.stats.prestiges = 1; S.spirits = SPIRITS; S.lvl = 30; S.settings.night = false;
for (const a of D.AXES.slice(0, 25)) S.axes[a.id] = 2;
for (let i = 0; i < 40; i++) S.ach['x' + i] = 1;
G.dirty();
GM.enter();
const ev = { boss: 0, fail: 0, out: 0, ougi: 0, maxIssen: 0, wave: [] };
G.on('gBossWin', () => ev.boss++);
G.on('gBossFail', () => ev.fail++);
G.on('gOutbreak', () => ev.out++);
G.on('gOugi', () => ev.ougi++);
G.on('gIssen', (d) => { ev.maxIssen = Math.max(ev.maxIssen, d.n); });
const TIER_V = [0.8, 2, 3.6, 5.8, 8.6, 11];
const TIER_P = [0.03, 0.17, 0.35, 0.3, 0.12, 0.03];
const pickV = () => { let r = rng(); for (let i = 0; i < 6; i++) { r -= TIER_P[i]; if (r <= 0) return TIER_V[i]; } return 3; };
let g = G.dstate();
function shop() {
  g = G.dstate();
  // ボスに負けたら少し稼いでから再挑戦
  if (g.farming && GM.T.time - (shop.failT || 0) > 25) GM.challengeBoss();
  for (let k = 0; k < 40; k++) {
    const opts = [];
    const sharp = GM.UP.sharp;
    opts.push({ c: GM.upgCost(sharp), f: () => GM.buyUpg('sharp'), w: 1 });
    opts.push({ c: GM.upgCost(GM.UP.analyze), f: () => GM.buyUpg('analyze'), w: 1.6 });
    for (const id of ['issen', 'core', 'combo', 'crit', 'draw', 'culture', 'boss', 'zanshin', 'reach', 'immune', 'gold', 'outbreak', 'krollspd', 'kluck']) {
      const u = GM.UP[id];
      if (!GM.upgMaxed(u)) opts.push({ c: GM.upgCost(u), f: () => GM.buyUpg(id), w: id === 'culture' ? 1.2 : id === 'immune' ? 0.9 : 0.35 });
    }
    // 免疫細胞: DPS/コストが一番いいもの
    let best = null;
    for (const c of GD.CELLS) {
      const have = g.cells[c.id] || 0;
      if (have === 0 && c.cost > g.dna * 2) continue;
      const v = GM.unitCellDps(c) / GM.cellCost(c, have, 1);
      if (!best || v > best.v) best = { v, c, cost: GM.cellCost(c, have, 1) };
    }
    if (best) opts.push({ c: best.cost, f: () => GM.buyCell(best.c.id, 1), w: 0.8 });
    opts.sort((a, b) => a.c / a.w - b.c / b.w);
    const o = opts[0];
    if (!o || o.c > g.dna) break;
    o.f();
  }
  for (const m of GD.MUTATIONS) while (!GM.mutMaxed(m) && GM.mutCost(m) <= S.germ.factor) GM.buyMut(m.id);
}
G.on('gBossFail', () => { shop.failT = GM.T.time; });
const dt = 1 / 30;
let t = 0, nextStroke = 0, nextShop = 0, nextLog = 0, dimT = 0;
const dimLog = [];
const marks = [10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200];
const reached = {};
while (t < MIN * 60) {
  simNow += dt * 1000;
  G.tick(dt);
  GM.tick(dt);
  t += dt;
  // 撃つ武器: 押しっぱなしで、0.35秒ごとに狙う敵を変える（ときどき指を離す）
  if (GM.stats().cls === 'shoot') {
    if (t >= nextStroke) {
      nextStroke = t + 0.35;
      const list = GM.T.germs.filter((x) => x.alive && !x.flee);
      const hold = rng() < 0.85 && list.length;
      if (hold) {
        const ge = list[Math.floor(rng() * list.length)];
        if (!GM.T.trig) GM.trigger(true, ge.x, ge.y); else GM.aimAt(ge.x, ge.y);
      } else if (GM.T.trig) GM.trigger(false);
    }
  } else if (t >= nextStroke) {
    nextStroke = t + (1 / SPS) * (0.7 + rng() * 0.6);
    const list = GM.T.germs.filter((x) => x.alive && !x.flee);
    if (list.length) {
      const want = rng() < 0.45 ? 1 : rng() < 0.55 ? 2 : rng() < 0.6 ? 3 : 4 + Math.floor(rng() * 3);
      GM.strokeStart();
      const v = pickV();
      for (let i = 0; i < Math.min(want, list.length); i++) {
        const ge = list[i];
        // 1体に1〜2回（残ったら追い打ち）
        for (let r = 0; r < 2 && ge.alive; r++) {
          GM.T.time += 0.08;
          GM.slice(ge.id, { speed: v, core: rng() < 0.3, ang: rng() * 6.28, x: 0, y: 0 });
        }
      }
      GM.strokeEnd();
    }
  }
  if (t >= nextShop) {
    nextShop = t + 1;
    shop();
    if (SIM_DIMS && g.maxWave >= DM.unlockW(DM.cur) && DM.cur < SIM_DIMS) {
      const from = DM.cur;
      GM.enter(from + 1);
      g = G.dstate();
      const tt = DM.totals(S, true);
      dimLog.push(`${from + 1}${GM.stats().cls === 'shoot' ? '🔫' : ''}:${((t - dimT) / 60).toFixed(1)}分`);
      if ((from + 1) % 10 === 0 || from + 1 === SIM_DIMS) console.log(`${(t / 60).toFixed(1)}分 次元${from + 1}「${DM.meta(from + 1).name}」へ  力×${tt.power.toFixed(1)} ★${tt.stars} 武器${tt.kinds} 段位${tt.tiers} hk ${fmt(g.hk)} 💎${fmt(S.gems)}`);
      dimT = t;
    }
  }
  for (const m of marks) if (!reached[m] && g.maxWave >= m) reached[m] = t;
  if (t >= nextLog) {
    nextLog += Number(process.env.SIM_LOG || 300);
    const st = GM.stats();
    if (!SIM_DIMS || process.env.SIM_LOG) console.log(`${(t / 60).toFixed(0).padStart(3)}分 dim${DM.cur} wave ${String(g.wave).padStart(3)} (max ${g.maxWave}) dna ${G.U ? '' : ''}${fmt(g.dna)} sharp ${GM.lv('sharp')} ana ${GM.lv('analyze')} cells ${fmt(st.cellDps)}/s kdmg ${fmt(st.kdmg)} hp ${fmt(GM.hpAt(g.wave))} 🧪${g.factor} kat ${Object.keys(g.kat).length} boss ${ev.boss}/${ev.fail}f out ${ev.out} ougi ${ev.ougi} maxIssen ${ev.maxIssen}`);
  }
}
function fmt(x) { return x >= 1e6 ? x.toExponential(2) : x >= 100 ? Math.round(x).toString() : x.toFixed(1); }
console.log('到達時間:', Object.entries(reached).map(([w, s]) => `W${w}=${(s / 60).toFixed(1)}分`).join(' '));
if (SIM_DIMS) console.log('次元ごとの到達時間（W15まで）:', dimLog.join(' '));
console.log('刀:', Object.keys(g.kat).length, '種 / 装備', g.keq, ' 刀ガチャLv', g.kgLv, ' 回転', S.stats.gRolls, ' 森の木材', fmt(S.wood));
