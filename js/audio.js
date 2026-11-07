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
  // 倒れ始め: メキメキ＋報酬のきらめき（地響きは crash で着地時に）
  function fell(rar, boss) {
    if (!ok()) return;
    noise(0.45, 0.16, 'bandpass', 420, 2.5, 0, 1200);
    tone(70, 0.35, 'sawtooth', 0.05, 0, 120);
    const big = boss || rar === 'gold' || rar === 'rainbow';
    const seq = big ? [0, 4, 7, 12, 16, 19, 24] : [0, 7, 12];
    seq.forEach((s, i) => tone(note(s, 784), 0.14, 'triangle', 0.08, 0.06 + i * 0.05));
  }
  function crash(boss) {
    if (!ok()) return;
    tone(boss ? 70 : 110, 0.5, 'sine', 0.6, 0, 32);
    noise(0.5, 0.3, 'lowpass', 600, 0.8);
    noise(0.3, 0.25, 'bandpass', 200, 1.2, 0.02);
    if (boss) tone(45, 0.9, 'sawtooth', 0.15, 0.05, 30);
  }
  function rouletteTick() {
    if (!ok() || throttle('rtick', 30)) return;
    tone(1500 + Math.random() * 200, 0.03, 'square', 0.035);
  }
  function rouletteWin(m) {
    if (!ok()) return;
    const seq = m >= 100 ? [0, 4, 7, 12, 16, 19, 24, 28, 31] : m >= 10 ? [0, 4, 7, 12, 16, 19, 24] : m >= 5 ? [0, 4, 7, 12] : [0, 7, 12];
    seq.forEach((s, i) => tone(note(s, 659), 0.18, 'square', 0.05, i * 0.05));
    if (m >= 10) noise(0.9, 0.12, 'highpass', 5000, 0.7, 0.1);
  }
  function golden() {
    if (!ok()) return;
    for (let i = 0; i < 12; i++) tone(note([0, 4, 7, 12][i % 4] + 12 * Math.floor(i / 4), 784), 0.14, 'triangle', 0.05, i * 0.04);
    noise(0.8, 0.12, 'highpass', 6000, 0.7, 0.05);
  }
  function streak() {
    if (!ok()) return;
    [0, 5, 9, 12, 17].forEach((s, i) => tone(note(s, 587), 0.16, 'square', 0.05, i * 0.06));
  }
  function levelUp() {
    if (!ok()) return;
    [0, 4, 7, 12, 7, 12, 16, 24].forEach((s, i) => tone(note(s, 523), 0.2, i < 4 ? 'triangle' : 'square', 0.055, i * 0.07));
    tone(1046, 0.9, 'sine', 0.05, 0.5, 2093);
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
  const RANKS = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5, EX: 6 };
  // 昇格演出: 光の色が変わるたびに鳴る（5 = EX の暗転）
  function gachaUp(step) {
    if (!ok()) return;
    if (step >= 5) {
      noise(0.7, 0.45, 'highpass', 1800, 0.6);
      tone(45, 1.4, 'sawtooth', 0.25, 0.05, 25);
      noise(1.4, 0.22, 'lowpass', 260, 0.8, 0.1);
      [0, 1, 6, 7].forEach((st, i) => tone(note(st, 131), 1.2, 'sawtooth', 0.03, 0.3 + i * 0.02));
      return;
    }
    const base = [0, 0, 4, 7, 12][step] || 0;
    [0, 4, 7, 12].forEach((st, i) => tone(note(st + base, 392), 0.32, 'triangle', 0.065, i * 0.045));
    noise(0.35, 0.15, 'highpass', 3000, 0.7, 0, 9000);
    tone(80, 0.45, 'sine', 0.38, 0, 38);
  }
  // SSR以上を1本ずつ見せるときのファンファーレ
  function showcase(r) {
    if (!ok()) return;
    const rank = RANKS[r] || 0;
    const seq = rank >= 6 ? [0, 7, 12, 16, 19, 24, 28, 31, 36] : rank >= 5 ? [0, 4, 7, 12, 16, 19, 24, 28] : rank >= 4 ? [0, 4, 7, 12, 16, 19, 24] : [0, 4, 7, 12, 16];
    seq.forEach((st, i) => tone(note(st, 392), 0.36, i % 2 ? 'square' : 'triangle', 0.05, i * 0.07));
    [0, 4, 7].forEach((st) => tone(note(st, 196), 1.5, 'sawtooth', 0.03, seq.length * 0.07));
    noise(1.2, 0.12, 'highpass', 5000, 0.7, 0.1);
    if (rank >= 6) tone(55, 1.8, 'sine', 0.3, 0, 30);
  }
  function equip(rank) {
    if (!ok() || throttle('equip', 200)) return;
    tone(1318, 0.3, 'triangle', 0.08);
    tone(2637, 0.5, 'sine', 0.05, 0.05);
    noise(0.3, 0.1, 'highpass', 6000, 0.7);
    if (rank >= 3) [0, 4, 7, 12].forEach((st, i) => tone(note(st, 784), 0.2, 'square', 0.04, 0.1 + i * 0.05));
  }
  function speed(n) {
    if (!ok()) return;
    for (let i = 0; i < n; i++) tone(660 * Math.pow(1.26, i), 0.09, 'square', 0.05, i * 0.07);
    noise(0.3, 0.12, 'bandpass', 800, 1, 0, 5000);
  }
  function comboFinish(best) {
    if (!ok()) return;
    (best ? [0, 4, 7, 12, 16, 19, 24] : [0, 7, 12]).forEach((st, i) => tone(note(st, 659), 0.18, 'square', 0.045, i * 0.05));
  }
  // 幻想の斧: 斬るたびに斧ごとの音を重ねる
  function axeHit(kind) {
    if (!ok() || throttle('axe', 55)) return;
    const pent = () => PENTA[Math.floor(Math.random() * 5)];
    switch (kind) {
      case 'splash': noise(0.14, 0.35, 'lowpass', 900, 1, 0, 300); tone(420, 0.12, 'sine', 0.12, 0, 160); break;
      case 'candy': tone(1400 + Math.random() * 300, 0.08, 'sine', 0.12, 0, 2400); tone(2100, 0.06, 'triangle', 0.05, 0.03); break;
      case 'pixel': [0, 4, 7].forEach((st, i) => tone(note(st + 12, 523), 0.05, 'square', 0.05, i * 0.03)); break;
      case 'beam': tone(220, 0.22, 'sawtooth', 0.07, 0, 90); tone(880, 0.18, 'sine', 0.05, 0, 330); noise(0.12, 0.08, 'highpass', 4000, 0.7); break;
      case 'petal': tone(note(pent() + 12, 659), 0.3, 'triangle', 0.06); break;
      case 'moon': tone(1568, 0.6, 'sine', 0.05); tone(2349, 0.5, 'sine', 0.03, 0.02); break;
      case 'crystal': tone(2637 + Math.random() * 200, 0.4, 'sine', 0.06); tone(3520, 0.3, 'sine', 0.03, 0.03); break;
      case 'gear': for (let i = 0; i < 3; i++) tone(1800 + i * 200, 0.025, 'square', 0.04, i * 0.035); break;
      case 'feather': noise(0.25, 0.06, 'highpass', 3500, 0.6); tone(note(pent() + 24, 523), 0.35, 'sine', 0.04); break;
      case 'galaxy': for (let i = 0; i < 3; i++) tone(note(pent() + 12 * (1 + (i % 2)), 659), 0.4, 'sine', 0.035, i * 0.04); break;
      case 'bolt': noise(0.05, 0.25, 'highpass', 5000, 0.8); tone(2400, 0.05, 'square', 0.04, 0, 600); break;
      case 'fire': noise(0.3, 0.22, 'bandpass', 600, 0.8, 0, 2400); break;
      case 'void': tone(90, 0.5, 'sine', 0.3, 0, 28); noise(0.4, 0.1, 'lowpass', 300, 0.8, 0, 80); break;
      case 'phoenix': noise(0.3, 0.2, 'bandpass', 700, 0.8, 0, 2600); tone(1200, 0.25, 'sine', 0.05, 0.05, 2400); break;
      case 'genesis': [0, 4, 7, 12].forEach((st) => tone(note(st, 523), 0.45, 'triangle', 0.035)); tone(2093, 0.5, 'sine', 0.04, 0.02); break;
      case 'glitch': for (let i = 0; i < 4; i++) tone(200 + Math.random() * 2400, 0.03, 'square', 0.04, i * 0.025); break;
    }
  }
  function gachaReveal(r) {
    if (!ok()) return;
    const rank = Math.min(5, RANKS[r] || 0);
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
    unlock: ensure, setEnabled, setVolume, setVibe, vibrate, whoosh, slash, grab, echo, thunder, blast, unlockFx,
    crash, rouletteTick, rouletteWin, golden, streak, levelUp, chop, crit, fell, coin, gem, buy, milestone, error,
    feverStart, feverEnd, boss, bossWin, bossFail, tick, stage, ach, squirrel, chest, gachaRoll, gachaReveal,
    prestige, goddess, gachaUp, showcase, equip, speed, comboFinish, axeHit,
  };
})();
