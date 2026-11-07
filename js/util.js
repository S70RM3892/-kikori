'use strict';
// =====================================================================
//  util.js — 汎用ヘルパー（数値表記・乱数・イージング）
//  DOM に触らないので Node のバランスシミュレータからも読み込める。
// =====================================================================
const U = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  function weighted(list, key = 'w') {
    let total = 0;
    for (const it of list) total += it[key];
    let r = Math.random() * total;
    for (const it of list) {
      r -= it[key];
      if (r < 0) return it;
    }
    return list[list.length - 1];
  }

  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1,
  };

  // ---------------------------------------------------------------
  //  数値表記
  //  日本式は寛永11年版『塵劫記』の万進（無量大数 = 10^68）。
  //  𥝱は環境によって豆腐になるので異体字の「秭」を使う。
  // ---------------------------------------------------------------
  const JP_UNITS = ['', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極',
    '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数'];
  const EN_UNITS = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
    'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];
  let numMode = 'jp';

  function sig(v) { // 有効数字3桁前後で丸める
    if (v < 10) return Math.floor(v * 100) / 100;
    if (v < 100) return Math.floor(v * 10) / 10;
    return Math.floor(v);
  }
  function trimNum(v) {
    let s = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.floor(v));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function sci(n) {
    const e = Math.floor(Math.log10(n));
    let m = n / Math.pow(10, e);
    if (m >= 9.995) { m = 1; return '1.00e' + (e + 1); }
    return m.toFixed(2) + 'e' + e;
  }
  function fmt(n) {
    if (n === Infinity) return '∞';
    if (typeof n !== 'number' || n !== n) return '0';
    if (n < 0) return '-' + fmt(-n);
    if (n < 10 && n % 1 !== 0) return trimNum(sig(n));
    const mode = numMode;
    if (mode === 'sci') return n < 1e5 ? Math.floor(n).toLocaleString('en-US') : sci(n);
    const base = mode === 'jp' ? 1e4 : 1e3;
    const units = mode === 'jp' ? JP_UNITS : EN_UNITS;
    if (n < base) return Math.floor(n).toLocaleString('en-US');
    let idx = Math.floor(Math.log10(n) / Math.log10(base));
    let v = n / Math.pow(base, idx);
    if (v < 1) { idx -= 1; v *= base; } // 浮動小数の誤差対策
    v = sig(v);
    if (v >= base) { idx += 1; v = sig(v / base); }
    if (idx >= units.length) return sci(n);
    // 日本式の4桁目（1234万）は小数を付けない
    return trimNum(v) + units[idx];
  }
  function setNumMode(m) { numMode = m; }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}時間${m}分`;
    if (m > 0) return `${m}分${s}秒`;
    return `${s}秒`;
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  function todayStr(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // UTF-8 安全な base64（セーブ書き出し用）
  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromB64(b64) {
    const bin = atob(b64.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // HSL ずらし（ループ後の異界バイオーム用）
  function shiftHue(hex, deg) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    h = (h + deg + 360) % 360;
    return `hsl(${h.toFixed(0)},${(s * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%)`;
  }

  return { clamp, lerp, rand, randInt, pick, chance, weighted, ease, fmt, setNumMode, fmtTime, fmtClock, todayStr, toB64, fromB64, shiftHue };
})();
