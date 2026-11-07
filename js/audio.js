'use strict';
// =====================================================================
//  audio.js — WebAudio で効果音をその場で合成（音声ファイル不要）
// =====================================================================
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let enabled = true, vol = 0.7, vibe = true;
  const last = {};
  let feverTimer = null, feverNext = 0, feverStep = 0;

  function ensure() {
    if (!enabled) return false;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        master = ctx.createGain();
        master.gain.value = vol * 0.55;
        master.connect(comp);
        comp.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; return false; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx.state !== 'closed';
  }
  const ok = () => enabled && ctx && ctx.state === 'running';
  function throttle(name, ms) {
    const t = performance.now();
    if (last[name] && t - last[name] < ms) return true;
    last[name] = t;
    return false;
  }

  function tone(freq, dur, type = 'sine', gain = 0.2, when = 0, slideTo = 0, attack = 0.004) {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  function noise(dur, gain, type = 'bandpass', freq = 1000, q = 1, when = 0, slideTo = 0) {
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(master);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.02);
  }
  const PENTA = [0, 2, 4, 7, 9];
  const note = (semi, base = 523.25) => base * Math.pow(2, semi / 12);
  function comboNote(combo) {
    const step = Math.floor(combo / 3);
    const oct = Math.min(3, Math.floor(step / 5));
    return note(oct * 12 + PENTA[step % 5]);
  }

  // ------------------------------------------------------------- 効果音
  function chop(combo, tier) {
    if (!ok() || throttle('chop', 28)) return;
    const p = 0.85 + Math.random() * 0.3;
    noise(0.09, 0.5, 'bandpass', 1300 * p, 1.4);
    tone(190 * p, 0.09, 'sine', 0.35, 0, 60);
    if (combo > 1) tone(comboNote(combo), 0.12, 'triangle', 0.07, 0.005);
    if (tier >= 1) crit(tier);
  }
  // ---- 斬撃（メイン）: 速さで音が太く、JUSTで金属音、連続JUSTで音程が上がる
  function whoosh(sp) {
    if (!ok() || throttle('whoosh', 110)) return;
    const k = Math.min(1, sp / 10);
    noise(0.12 + k * 0.06, 0.06 + k * 0.1, 'bandpass', 500 + k * 600, 1.2, 0, 2400 + k * 3000);
  }
  function slash(stier, just, chain, combo, tier) {
    if (!ok() || throttle('slash', 22)) return;
    const s = Math.max(0, stier);
    const p = 0.9 + s * 0.06 + Math.random() * 0.08;
    noise(0.08 + s * 0.012, 0.45 + s * 0.05, 'bandpass', 1100 * p, 1.3);
    tone(170 * p, 0.12 + s * 0.02, 'sine', 0.38 + s * 0.03, 0, 50);
    if (s >= 3) noise(0.05, 0.22, 'highpass', 5000, 0.8, 0.005);
    if (s >= 4) tone(95, 0.25, 'sawtooth', 0.1, 0, 40);
    if (combo > 1) tone(comboNote(combo), 0.12, 'triangle', 0.07, 0.006);
    if (just) {
      const up = Math.pow(2, Math.min(chain - 1, 12) / 12);
      tone(2637 * up, 0.5, 'sine', 0.09, 0.01);
      tone(3951 * up, 0.35, 'sine', 0.05, 0.012);
      tone(2650 * up, 0.5, 'triangle', 0.03, 0.01);
    }
    if (tier >= 1) crit(tier);
  }
  function grab() {
    if (!ok() || throttle('grab', 200)) return;
    tone(330, 0.06, 'triangle', 0.06);
    noise(0.05, 0.08, 'highpass', 3000, 0.7);
  }
  function echo(n) {
    if (!ok()) return;
    noise(0.07, 0.25, 'bandpass', 1500 + n * 300, 1.5);
    tone(260 + n * 60, 0.1, 'sine', 0.18, 0, 90);
  }
  function thunder(n) {
    if (!ok()) return;
    noise(0.06, 0.5, 'highpass', 2500, 0.7);
    noise(0.9, 0.35, 'lowpass', 400, 0.7, 0.04, 120);
    tone(55, 0.8, 'sawtooth', 0.12, 0.03, 35);
    if (n > 1) tone(1800, 0.08, 'square', 0.05);
  }
  function blast(lv) {
    if (!ok()) return;
    const big = lv >= 10;
    tone(90, big ? 0.9 : 0.6, 'sine', 0.6, 0, 28);
    noise(big ? 1.1 : 0.7, 0.5, 'lowpass', 900, 0.8, 0, 120);
    noise(0.4, 0.2, 'highpass', 3500, 0.7, 0.02);
    if (lv >= 20) [0, 7, 12, 19].forEach((s, i) => tone(note(s, 196), 0.9, 'sawtooth', 0.04, 0.1 + i * 0.05));
  }
  function unlockFx() {
    if (!ok()) return;
    [0, 4, 7, 11, 14, 19].forEach((s, i) => tone(note(s, 659), 0.22, 'square', 0.045, i * 0.06));
    noise(0.6, 0.1, 'highpass', 6000, 0.7, 0.2);
  }
  function crit(tier) {
    if (!ok()) return;
    const base = [0, 1318, 1567, 1975, 2637][tier];
    tone(base, 0.18, 'square', 0.06);
    tone(base * 1.5, 0.22, 'triangle', 0.08, 0.03);
    if (tier >= 2) [0, 4, 7, 12].forEach((s, i) => tone(note(s + 12 * (tier - 1), 659), 0.16, 'triangle', 0.07, 0.04 + i * 0.045));
    if (tier >= 4) {
      noise(0.9, 0.25, 'highpass', 3000, 0.7, 0, 9000);
      tone(55, 0.9, 'sawtooth', 0.2, 0.05, 30);
      [0, 4, 7, 11, 14].forEach((s) => tone(note(s, 392), 1.2, 'sawtooth', 0.04, 0.05));
    }
  }
  function fell(rar, boss) {
    if (!ok()) return;
    noise(0.35, 0.18, 'lowpass', 700, 0.8);
    tone(120, 0.38, 'sine', 0.5, 0.02, 38);
    noise(0.25, 0.25, 'bandpass', 220, 1.2, 0.03);
    const big = boss || rar === 'gold' || rar === 'rainbow';
    const seq = big ? [0, 4, 7, 12, 16, 19, 24] : [0, 7, 12];
    seq.forEach((s, i) => tone(note(s, 784), 0.14, 'triangle', 0.08, 0.06 + i * 0.05));
  }
  function coin() {
    if (!ok() || throttle('coin', 45)) return;
    tone(1975, 0.07, 'square', 0.035);
    tone(2637, 0.14, 'square', 0.035, 0.05);
  }
  function gem() {
    if (!ok() || throttle('gem', 60)) return;
    tone(2093, 0.1, 'sine', 0.08);
    tone(3136, 0.18, 'sine', 0.06, 0.06);
  }
  function buy() {
    if (!ok() || throttle('buy', 40)) return;
    tone(660, 0.06, 'square', 0.05);
    tone(990, 0.1, 'square', 0.05, 0.05);
  }
  function milestone() {
    if (!ok()) return;
    [0, 4, 7, 12, 16].forEach((s, i) => tone(note(s, 523), 0.18, 'square', 0.05, i * 0.06));
  }
  function error() {
    if (!ok() || throttle('err', 120)) return;
    tone(160, 0.14, 'square', 0.06, 0, 110);
  }
  function feverStart() {
    if (!ok()) return;
    tone(220, 0.5, 'sawtooth', 0.12, 0, 1760);
    noise(0.5, 0.15, 'highpass', 1500, 0.8, 0, 8000);
    [0, 4, 7, 12].forEach((s) => tone(note(s, 523), 0.7, 'square', 0.04, 0.45));
    startLoop();
  }
  function feverEnd() {
    stopLoop();
    if (!ok()) return;
    tone(880, 0.4, 'triangle', 0.08, 0, 220);
  }
  function startLoop() {
    stopLoop();
    if (!ok()) return;
    feverNext = ctx.currentTime + 0.05;
    feverStep = 0;
    feverTimer = setInterval(() => {
      if (!ok()) return;
      while (feverNext < ctx.currentTime + 0.25) {
        const w = feverNext - ctx.currentTime;
        if (feverStep % 2 === 0) tone(150, 0.16, 'sine', 0.35, w, 45);
        else noise(0.04, 0.12, 'highpass', 7000, 0.7, w);
        if (feverStep % 4 === 3) tone(note([0, 7, 5, 12][(feverStep >> 2) % 4], 262), 0.12, 'square', 0.035, w);
        feverNext += 0.19;
        feverStep++;
      }
    }, 90);
  }
  function stopLoop() {
    if (feverTimer) clearInterval(feverTimer);
    feverTimer = null;
  }
  function boss() {
    if (!ok()) return;
    [0, 0.32].forEach((w) => { tone(98, 0.3, 'sawtooth', 0.18, w, 92); noise(0.2, 0.2, 'lowpass', 300, 1, w); });
    tone(73, 0.8, 'sawtooth', 0.15, 0.64, 70);
  }
  function bossWin() {
    if (!ok()) return;
    [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => tone(note(s, 523), 0.2, 'square', 0.05, i * 0.07));
    noise(0.8, 0.12, 'highpass', 4000, 0.7, 0.1);
  }
  function bossFail() {
    if (!ok()) return;
    [7, 6, 5, 0].forEach((s, i) => tone(note(s, 262), 0.28, 'triangle', 0.1, i * 0.22));
  }
  function tick() {
    if (!ok() || throttle('tick', 500)) return;
    tone(1200, 0.05, 'square', 0.05);
  }
  function stage() {
    if (!ok()) return;
    [0, 7, 12].forEach((s, i) => tone(note(s, 659), 0.12, 'triangle', 0.07, i * 0.05));
  }
  function ach() {
    if (!ok() || throttle('ach', 150)) return;
    [0, 4, 7, 12].forEach((s, i) => tone(note(s, 1046), 0.16, 'sine', 0.08, i * 0.06));
  }
  function squirrel() {
    if (!ok()) return;
    [0, 5, 9, 12, 17].forEach((s, i) => tone(note(s, 1318), 0.1, 'sine', 0.05, i * 0.04));
  }
  function chest(tier) {
    if (!ok()) return;
    noise(0.12, 0.3, 'bandpass', 900, 2);
    const seq = [[0, 7], [0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16, 19, 24]][tier] || [0, 7];
    seq.forEach((s, i) => tone(note(s, 784), 0.18, 'square', 0.05, 0.1 + i * 0.06));
  }
  // ガチャ: ドラムロール → レア度ごとの当たり音
  function gachaRoll(dur = 1.2) {
    if (!ok()) return;
    let t = 0, gap = 0.12;
    while (t < dur) { noise(0.06, 0.25, 'bandpass', 180 + t * 300, 1.5, t); t += gap; gap = Math.max(0.035, gap * 0.9); }
    tone(110, dur, 'sawtooth', 0.05, 0, 440);
  }
  function gachaReveal(r) {
    if (!ok()) return;
    const rank = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5 }[r] || 0;
    if (rank <= 1) { tone(rank ? 880 : 660, 0.15, 'triangle', 0.08); return; }
    const seq = rank === 2 ? [0, 4, 7] : rank === 3 ? [0, 4, 7, 12, 16] : [0, 4, 7, 12, 16, 19, 24, 28];
    seq.forEach((s, i) => tone(note(s, 523), 0.25, 'square', 0.05, i * 0.06));
    if (rank >= 3) noise(1.2, 0.12, 'highpass', 5000, 0.7, 0.1);
    if (rank >= 4) [0, 4, 7, 11].forEach((s) => tone(note(s, 261), 1.6, 'sawtooth', 0.035, 0.3));
  }
  function prestige() {
    if (!ok()) return;
    tone(110, 2.2, 'sawtooth', 0.12, 0, 1760);
    noise(2.2, 0.15, 'bandpass', 300, 1, 0, 6000);
    [0, 7, 12, 16, 19, 24].forEach((s, i) => tone(note(s, 392), 1.4, 'triangle', 0.05, 1.6 + i * 0.08));
  }
  function goddess() {
    if (!ok()) return;
    [0, 4, 7, 11, 14, 18].forEach((s, i) => tone(note(s, 698), 0.5, 'sine', 0.05, i * 0.09));
  }

  function setEnabled(v) { enabled = v; if (!v) stopLoop(); if (ctx && master) master.gain.value = v ? vol * 0.55 : 0; }
  function setVolume(v) { vol = v; if (master) master.gain.value = enabled ? vol * 0.55 : 0; }
  function setVibe(v) { vibe = !!v; }
  function vibrate(ms) {
    if (!vibe) return;
    try {
      // ユーザー操作前に呼ぶとブラウザが警告を出すので待つ
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* 非対応 */ }
  }

  return {
    unlock: ensure, setEnabled, setVolume, setVibe, vibrate, whoosh, slash, grab, echo, thunder, blast, unlockFx, chop, crit, fell, coin, gem, buy, milestone, error,
    feverStart, feverEnd, boss, bossWin, bossFail, tick, stage, ach, squirrel, chest, gachaRoll, gachaReveal,
    prestige, goddess,
  };
})();
