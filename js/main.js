'use strict';
// =====================================================================
//  main.js — 起動とメインループ
// =====================================================================
(function () {
  let started = false;
  function start(hotData) {
    if (started) return;
    started = true;
    G.init(hotData && hotData.save ? hotData.save : null);
    FX.init({ blocked: () => UI.blocked() });
    UI.init();
    G.applyOffline(Date.now());
    G.checkDaily();
    G.save();
    try { if (document.fonts) document.fonts.load('20px "Dela Gothic One"'); } catch (e) { /* フォント読み込み失敗時はフォールバック */ }

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      try {
        G.tick(dt);
        FX.frame(dt);
        UI.frame(dt);
      } catch (e) {
        console.error(e);
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    // 自動セーブ（非表示中はしない＝復帰時にオフライン計算する）
    setInterval(() => { if (!document.hidden) G.save(); }, 10000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) G.save();
      else { G.applyOffline(Date.now()); last = performance.now(); }
    });
    window.addEventListener('pagehide', () => G.save());

    const hot = window.claude && window.claude.hot;
    if (hot && typeof hot.snapshot === 'function') {
      try { hot.snapshot(() => ({ save: G.serialize() })); } catch (e) { /* ビューア外 */ }
    }
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
