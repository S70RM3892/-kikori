'use strict';
// =====================================================================
//  input.js — 斧のドラッグ操作
//  シーンのどこを押しても斧をつかむ。押したまま幹を左右に横切ると1撃。
//  横切った瞬間の速さでランクが決まり、切り込みの高さならJUST。
// =====================================================================
const Input = (() => {
  let wrap = null;
  let held = null;
  const TOUCH_LIFT = 30; // 指で刃先が隠れないよう少し上に持つ

  function init() {
    wrap = document.getElementById('scene-wrap');
    wrap.addEventListener('pointerdown', down);
    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerup', up);
    wrap.addEventListener('pointercancel', up);
    wrap.addEventListener('lostpointercapture', up);
    wrap.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 菌斬り次元: 刀で菌を斬る（線分と円の当たり判定）
  const germ = () => G.S.dim === 'germ' && typeof GM !== 'undefined' && typeof Micro !== 'undefined' && Micro.ok;
  const blade = (e, type) => ({ x: e.clientX, y: e.clientY - (type === 'mouse' ? 0 : TOUCH_LIFT), t: e.timeStamp || performance.now() });

  function down(e) {
    if (e.target.closest('button')) return;
    if (e.button !== undefined && e.button > 0) return;
    if (held || UI.blocked()) return;
    e.preventDefault();
    Sfx.unlock();
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 古いブラウザ */ }
    const p = blade(e, e.pointerType);
    held = { id: e.pointerId, type: e.pointerType, pts: [p], start: p, moved: 0, lastSide: 0, lastOut: p, whoosh: 0 };
    if (germ()) { GM.strokeStart(); FX.grab(p); return; }
    held.lastSide = sideOf(p, FX.trunkInfo());
    FX.grab(p);
  }

  function move(e) {
    if (!held || e.pointerId !== held.id) return;
    e.preventDefault();
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const evs = list && list.length ? list : [e];
    for (const ev of evs) step(blade(ev, held.type));
  }

  function step(p) {
    const pts = held.pts;
    const prev = pts[pts.length - 1];
    if (p.t < prev.t) p.t = prev.t;
    held.moved += Math.hypot(p.x - prev.x, p.y - prev.y);
    pts.push(p);
    while (pts.length > 3 && p.t - pts[0].t > 140) pts.shift();
    const ti = FX.trunkInfo();
    const sp = speedNow(ti);
    FX.drag(p, sp);
    if (sp >= 2.5 && p.t - held.whoosh > 140) { held.whoosh = p.t; if (germ()) Sfx.kWhoosh(sp); else Sfx.whoosh(sp); }
    if (germ()) { germCut(prev, p, sp); return; }
    if (!ti) { held.lastSide = 0; return; }
    const side = sideOf(p, ti);
    if (side === 0) return;
    if (held.lastSide !== 0 && side !== held.lastSide) {
      // 幹の中心線を横切った → 交点の高さを求める
      const a = held.lastOut;
      const k = (ti.cx - a.x) / (p.x - a.x || 1e-6);
      const y = a.y + (p.y - a.y) * k;
      if (y >= ti.top && y <= ti.bottom) chop(ti, y, side, sp);
    }
    held.lastSide = side;
    held.lastOut = p;
  }

  function sideOf(p, ti) {
    if (!ti) return 0;
    const d = p.x - ti.cx;
    if (Math.abs(d) < ti.margin) return 0;
    return d > 0 ? 1 : -1;
  }

  // 直近 ~70ms の移動距離 ÷ 時間（シーン短辺/秒）
  function speedNow(ti) {
    const pts = held.pts;
    const last = pts[pts.length - 1];
    let i = pts.length - 1, len = 0;
    while (i > 0 && last.t - pts[i - 1].t <= 70) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      i--;
    }
    const dt = (last.t - pts[i].t) / 1000;
    if (dt < 0.008) return 0;
    const unit = ti ? ti.unit : FX.unit();
    return len / dt / unit;
  }

  function chop(ti, y, dir, sp) {
    if (UI.blocked()) return;
    const just = Math.abs(y - ti.notchY) <= ti.justHalf;
    const r = G.swing({ kind: 'swing', x: ti.cx, y, speed: sp, just, dir });
    if (!r) return;
    Sfx.vibrate(just ? 22 : r.stier >= 3 ? 16 : 8);
    UI.afterHit();
  }

  function up(e) {
    if (!held || e.pointerId !== held.id) return;
    const dur = (e.timeStamp || performance.now()) - held.start.t;
    const tapLike = held.moved < 14 && dur < 350;
    held = null;
    FX.release();
    if (germ()) {
      if (tapLike) germTap(e.clientX, e.clientY - (e.pointerType === 'mouse' ? 0 : TOUCH_LIFT * 0.5));
      GM.strokeEnd();
      return;
    }
    if (tapLike) UI.tapSwing(e.clientX, e.clientY);
  }
  // 線分 a→b が菌の円を通ったら斬る。中心の近くを通ったら「芯」
  function germCut(a, b, sp) {
    if (UI.blocked()) return;
    const st = GM.stats();
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    if (L2 < 4) return;
    // 時刻がまとめて届いて速さが測れないときは、動いた距離で振ったとみなす
    if (sp === 0 && L2 >= 100) sp = 1.5;
    if (sp < 0.7) return;
    const ang = Math.atan2(-dy, dx);
    const list = GM.T.germs.slice();
    for (const ge of list) {
      if (!ge.alive || ge.flee) continue;
      const s = Micro.germScreen(ge);
      const rr = s.r * st.reach * (ge.boss ? 0.92 : 1.08) + 6;
      let t = ((s.x - a.x) * dx + (s.y - a.y) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + dx * t, cy = a.y + dy * t;
      const dist = Math.hypot(s.x - cx, s.y - cy);
      if (dist > rr) continue;
      const r = GM.slice(ge.id, { speed: sp, core: dist <= s.r * st.core, ang, x: cx, y: cy });
      if (r && !r.miss) Sfx.vibrate(r.killed ? (r.n >= 3 ? 20 : 12) : 6);
    }
  }
  // タップ（突き）: 指の下の菌を弱く斬る
  function germTap(x, y) {
    if (UI.blocked()) return;
    let best = null, bd = 1e9;
    for (const ge of GM.T.germs) {
      if (!ge.alive || ge.flee) continue;
      const s = Micro.germScreen(ge);
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < s.r * 1.2 && d < bd) { bd = d; best = { ge, s }; }
    }
    if (!best) return;
    GM.slice(best.ge.id, { speed: 0.9, core: bd <= best.s.r * GM.stats().core, ang: Math.random() < 0.5 ? 0.7 : -0.7, x, y });
  }

  return { init, get holding() { return !!held; } };
})();
