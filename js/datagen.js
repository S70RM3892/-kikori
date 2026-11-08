'use strict';
// =====================================================================
//  datagen.js — 森のコンテンツを手続き的に10倍へ
//  ・斧: 75シリーズ × 10本（シリーズごとに色・3Dモデル・特性・必殺技）。
//    シリーズをそろえるとセットボーナス
//  ・バイオーム: 手作りの24に、形容 × 場所 で216を足して240
//  ・実績: バイオーム到達・主の討伐・シリーズ・記録の段位など
//  決まった種の乱数で作るので、毎回同じものができる（セーブと食い違わない）。
// =====================================================================
(() => {
  if (typeof D === 'undefined') return;
  // ------------------------------------------------------------- 道具
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const SY1 = ['ア', 'イ', 'エ', 'オ', 'カ', 'キ', 'ク', 'コ', 'サ', 'シ', 'セ', 'ソ', 'タ', 'ティ', 'ナ', 'ノ', 'ハ', 'フ', 'マ', 'ミ', 'メ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ヴァ', 'ヴィ', 'ガ', 'ギ', 'グ', 'ゼ', 'ダ', 'ディ', 'ド', 'バ', 'ブ', 'ベ', 'ファ', 'フィ', 'クロ', 'グラ', 'ブレ', 'トラ', 'ドラ', 'スカ', 'ルミ', 'セレ', 'アル', 'エル', 'オル', 'ヘル', 'ネオ', 'ゾル', 'ジェ'];
  const SY2 = ['ス', 'ン', 'ル', 'ア', 'ナ', 'オン', 'リア', 'ガ', 'ド', 'ム', 'ラ', 'レス', 'ウス', 'ニア', 'リオン', 'ルカ', 'ディス', 'エル', 'ヴァン', 'ティア', 'ロス', 'ゼス', 'ミラ', 'グナ', 'ファー'];
  const used = new Set();
  // カタカナの架空の名前（重ならないように）
  function kname(r) {
    for (let k = 0; k < 50; k++) {
      const n = 1 + (r() < 0.55 ? 1 : 0);
      let s = '';
      for (let i = 0; i < n; i++) s += SY1[Math.floor(r() * SY1.length)];
      s += SY2[Math.floor(r() * SY2.length)];
      if (!used.has(s) && s.length >= 3) { used.add(s); return s; }
    }
    return 'ノーネーム' + used.size;
  }
  // きりのいい数（有効数字2桁）
  function nice(x) {
    if (x < 100) return Math.round(x);
    const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
    return Math.round(x / p) * p;
  }
  // 色相を deg 回し、明るさを l（-1〜1）だけ足す。U.shiftHue は hsl() を返すので、明るさも hsl のまま足す
  // （以前は hsl を16進として読んでいたため、明るさを変えた色が黒や灰色になっていた）
  const shift = (c, deg, l = 0) => {
    const h = U.shiftHue(c, deg);
    if (!l) return h;
    const m = /^hsl\((\d+),(\d+)%,(\d+)%\)$/.exec(h);
    if (!m) return h;
    return `hsl(${m[1]},${m[2]}%,${Math.max(0, Math.min(100, Math.round(+m[3] + l * 100)))}%)`;
  };
  D.GEN = { mulberry, kname, nice, shift };

  // ------------------------------------------------------------- 斧のシリーズ
  // [名前, 一文字, 刃の明るい色, 暗い色, 光, 3Dモデル(SSR以上), 斬る演出, 必殺技の演出, 動き, 模様, 記号, 伸ばす特性]
  const SERIES = [
    ['溶岩', '炎', '#ffc06a', '#a8200a', '#ff6a1a', 'dragon', 'fire', 'inferno', 'giant', 'flames', '🌋', 'boss'],
    ['氷河', '氷', '#e8fbff', '#2a7ab0', '#8fe8ff', 'crystal', 'crystal', 'snow', 'draw', 'dots', '🧊', 'combo'],
    ['雷雲', '雷', '#fff6a8', '#3a3a8a', '#ffe14a', 'bolt', 'bolt', 'thunderstorm', 'rise', 'lightning', '⚡', 'thunder'],
    ['深緑', '森', '#c8ff9a', '#2a7a2a', '#7aff6a', 'sakura', 'leaf', 'leafstorm', 'vortex', 'dots', '🌿', 'dps'],
    ['桜花', '桜', '#ffe0f0', '#ff5aa8', '#ff9ad0', 'sakura', 'petal', 'bloom', 'dash', 'waves', '🌸', 'golden'],
    ['星屑', '星', '#fff6d0', '#6a4aff', '#b39aff', 'galaxy', 'galaxy', 'meteor', 'throw', 'stars', '✨', 'critm'],
    ['黄金', '金', '#fff2a0', '#c88a00', '#ffd84a', null, 'gold', 'coinrain', 'giant', 'rays', '🪙', 'reward'],
    ['深海', '海', '#b0f0ff', '#0a4a6a', '#3affd0', 'trident', 'splash', 'tsunami', 'vortex', 'waves', '🐚', 'luck'],
    ['月影', '月', '#ffffff', '#6a7ab0', '#c8d8ff', 'crescent', 'moon', 'moon', 'draw', 'stars', '🌙', 'just'],
    ['紅蓮', '紅', '#ff9a7a', '#8a0010', '#ff3a3a', 'phoenix', 'phoenix', 'phoenixfire', 'rise', 'flames', '🔥', 'fever'],
    ['翡翠', '翠', '#c8ffd8', '#1a8a5a', '#6affb0', 'crystal', 'crystal', 'shardrain', 'spin', 'grid', '💚', 'gem'],
    ['紫電', '紫', '#f0d0ff', '#6a1aa8', '#c06aff', 'bolt', 'bolt', 'bolts', 'dash', 'lightning', '💜', 'critc'],
    ['白銀', '銀', '#ffffff', '#a8b4c4', '#e8f0ff', null, 'crystal', 'shardrain', 'spin', 'grid', '🥈', 'reward'],
    ['漆黒', '黒', '#8a8aa0', '#0a0a14', '#6a4aff', 'blackhole', 'void', 'void', 'draw', 'cosmic', '🖤', 'critm'],
    ['太陽', '陽', '#fff6a0', '#ff8a1a', '#ffb02a', 'sun', 'fire', 'sun', 'throw', 'rays', '☀️', 'all'],
    ['疾風', '風', '#e0fff0', '#3ad08a', '#8affc8', 'wing', 'feather', 'feathers', 'dash', 'waves', '🌪️', 'speed'],
    ['砂塵', '砂', '#ffe8b0', '#a87a30', '#ffd27a', null, 'gold', 'coinrain', 'spin', 'dots', '🏜️', 'dps'],
    ['竜鱗', '竜', '#c8ffb0', '#1a6a2a', '#6aff6a', 'dragon', 'fire', 'golddragon', 'rise', 'flames', '🐉', 'boss'],
    ['天使', '翼', '#fffaf0', '#ffd977', '#fff2b0', 'wing', 'feather', 'heavenlight', 'rise', 'rays', '🪽', 'luck'],
    ['悪魔', '魔', '#ff8aa8', '#3a0010', '#ff2a6a', 'blackhole', 'void', 'chaos', 'vortex', 'cosmic', '😈', 'critm'],
    ['機巧', '機', '#ffe0a0', '#6a5a3a', '#ffd27a', 'gear', 'gear', 'clock', 'spin', 'grid', '⚙️', 'roll'],
    ['時計', '時', '#fff0c0', '#8a6a20', '#ffd27a', 'gear', 'chrono', 'clockstop', 'dash', 'grid', '⏰', 'combo'],
    ['水晶', '晶', '#e8fdff', '#2ac8ff', '#7fe8ff', 'crystal', 'crystal', 'shardrain', 'spin', 'grid', '💎', 'critm'],
    ['菓子', '甘', '#ffd6ec', '#ff4fa8', '#ff8fd0', 'candy', 'candy', 'hearts', 'spin', 'dots', '🍬', 'golden'],
    ['大漁', '魚', '#c8e0ff', '#3a5a8a', '#9ad0ff', 'tuna', 'splash', 'tsunami', 'throw', 'waves', '🐟', 'reward'],
    ['ドット', '電', '#a0ffa0', '#2a6a2a', '#6aff6a', 'pixel', 'pixel', 'glitchstorm', 'dash', 'grid', '👾', 'roll'],
    ['ネオン', '光', '#fff0ff', '#ff3af0', '#ff5af0', 'beam', 'beam', 'glitchstorm', 'dash', 'grid', '💡', 'speed'],
    ['虹', '虹', '#ffffff', '#ff8ad0', 'rainbow', 'beam', 'rainbow', 'rainbowblades', 'orbit', 'rays', '🌈', 'all', 1],
    ['銀河', '河', '#e0d0ff', '#3a1a8a', '#9a7aff', 'galaxy', 'galaxy', 'galaxy', 'orbit', 'cosmic', '🌌', 'all', 1],
    ['土星', '環', '#ffe6b0', '#a87a3a', '#ffd27a', 'saturn', 'saturn', 'rings', 'orbit', 'cosmic', '🪐', 'gem'],
    ['海神', '波', '#bff8ff', '#0aa0b0', '#3affe0', 'trident', 'trident', 'tsunami', 'dash', 'waves', '🔱', 'boss'],
    ['鳳凰', '凰', '#fff8d0', '#ff4fd8', 'rainbow', 'phoenix', 'houou', 'rainbowfire', 'rise', 'flames', '🦚', 'fever', 1],
    ['雪華', '雪', '#ffffff', '#9ad8ff', '#cfefff', 'snowflake', 'snow', 'snow', 'vortex', 'dots', '❄️', 'combo'],
    ['恋心', '恋', '#ffd0e8', '#ff3d8b', '#ff6ab0', 'heart', 'heart', 'hearts', 'giant', 'dots', '💗', 'golden'],
    ['稲妻', '稲', '#fff7b8', '#ffb800', '#ffe14a', 'bolt', 'ryujin', 'thunderstorm', 'rise', 'lightning', '🌩️', 'thunder'],
    ['古代', '古', '#e0c8a0', '#6a4a2a', '#c8a070', null, 'obsidian', 'crack', 'giant', 'stripes', '🏺', 'dps'],
    ['骸骨', '骨', '#fffaf0', '#c8bca8', '#ffffff', null, 'crystal', 'crack', 'draw', 'stripes', '💀', 'critc'],
    ['毒沼', '毒', '#c8ff6a', '#4a6a0a', '#a0ff3a', null, 'void', 'chaos', 'vortex', 'waves', '☠️', 'critm'],
    ['宝石', '宝', '#ffd0e0', '#c83a6a', '#ff8ab0', 'crystal', 'crystal', 'shardrain', 'spin', 'grid', '💍', 'gem'],
    ['海賊', '賊', '#e0c890', '#3a2a1a', '#ffd27a', null, 'gold', 'coinrain', 'throw', 'stripes', '🏴‍☠️', 'reward'],
    ['忍者', '忍', '#c8c8d8', '#1a1a2a', '#8a8aff', 'katana', 'katana', 'iai', 'draw', 'stripes', '🥷', 'speed'],
    ['武者', '武', '#e8e8f0', '#6a1a1a', '#ff5a5a', 'katana', 'katana', 'iai', 'giant', 'stripes', '⚔️', 'boss'],
    ['魔法', '術', '#e0c0ff', '#5a2aa8', '#c06aff', 'imaginary', 'glitch', 'glitchstorm', 'draw', 'grid', '🪄', 'luck'],
    ['妖精', '妖', '#f0ffe0', '#7affb0', '#c8ffe0', 'wing', 'feather', 'feathers', 'rise', 'dots', '🧚', 'gem'],
    ['巨人', '巨', '#d8c8b0', '#6a5a4a', '#ffd27a', null, 'obsidian', 'crack', 'giant', 'stripes', '🗿', 'all'],
    ['果実', '果', '#ffe0a0', '#ff6a3a', '#ffb07a', 'candy', 'candy', 'coinrain', 'spin', 'dots', '🍎', 'reward'],
    ['茸', '茸', '#fff0e0', '#e8433f', '#ff8a7a', 'candy', 'leaf', 'leafstorm', 'spin', 'dots', '🍄', 'dps'],
    ['珊瑚', '珊', '#ffd0d8', '#e0406a', '#ff8aa8', 'trident', 'splash', 'tsunami', 'vortex', 'waves', '🪸', 'luck'],
    ['隕石', '隕', '#d8d0e8', '#4a4060', '#b0a0ff', null, 'meteor', 'meteor', 'giant', 'stars', '☄️', 'critm'],
    ['火山', '噴', '#ffb06a', '#6a0a00', '#ff5a1a', 'dragon', 'fire', 'inferno', 'giant', 'flames', '🌋', 'boss'],
    ['極光', '極', '#ffffff', '#3affd0', 'rainbow', 'beam', 'aurora', 'aurora', 'vortex', 'waves', '🌠', 'all'],
    ['聖杯', '聖', '#fff6d0', '#d8a040', '#fff2a0', 'sun', 'genesis', 'genesis', 'giant', 'rays', '🏆', 'luck', 1],
    ['冥府', '冥', '#b0ffb0', '#120818', '#7aff6a', 'blackhole', 'void', 'void', 'vortex', 'cosmic', '👻', 'critm'],
    ['雷神', '神', '#fff7b8', '#ffb800', '#ffe14a', 'bolt', 'ragna', 'bolts', 'rise', 'lightning', '🌩️', 'thunder'],
    ['風神', '嵐', '#e0fff0', '#2ab07a', '#8affc8', 'wing', 'feather', 'feathers', 'orbit', 'waves', '🍃', 'speed'],
    ['水神', '水', '#c0f0ff', '#1a6aff', '#6ab0ff', 'trident', 'trident', 'tsunami', 'vortex', 'waves', '💧', 'luck'],
    ['炎神', '焔', '#ffe0a0', '#ff3a00', '#ff7a1a', 'phoenix', 'phoenix', 'inferno', 'rise', 'flames', '🔥', 'fever'],
    ['地神', '地', '#e0c8a0', '#4a3a1a', '#c8a070', null, 'obsidian', 'crack', 'giant', 'stripes', '⛰️', 'dps'],
    ['天空', '空', '#ffffff', '#7fd8ff', '#bfe8ff', 'wing', 'feather', 'heavenlight', 'rise', 'rays', '☁️', 'luck'],
    ['深淵', '淵', '#c0a0ff', '#10002a', '#b06aff', 'blackhole', 'void', 'blackhole', 'vortex', 'cosmic', '🕳️', 'critm'],
    ['創世', '創', '#ffffff', '#ffd700', '#fff2a0', 'genesis', 'genesis', 'genesis', 'giant', 'rays', '🌅', 'all', 1],
    ['終焉', '終', '#ffffff', '#ff40ff', 'rainbow', 'genesis', 'omega', 'omega', 'omega', 'cosmic', '💠', 'all', 1],
    ['量子', '子', '#e0ffff', '#3a6aff', '#7affff', 'imaginary', 'glitch', 'glitchstorm', 'draw', 'grid', '⚛️', 'roll'],
    ['電脳', '脳', '#a0ffff', '#0a2a4a', '#3affff', 'pixel', 'pixel', 'glitchstorm', 'dash', 'grid', '🧠', 'roll'],
    ['音波', '音', '#fff0e0', '#e0a070', '#ffc890', null, 'gold', 'rings', 'spin', 'rays', '🎵', 'combo'],
    ['香木', '香', '#f0e0c0', '#8a6a3a', '#ffd27a', null, 'leaf', 'leafstorm', 'vortex', 'dots', '🪵', 'dps'],
    ['琥珀', '珀', '#ffe08a', '#c87a10', '#ffc04a', 'crystal', 'gold', 'shardrain', 'spin', 'grid', '🟠', 'gem'],
    ['鋼鉄', '鋼', '#e0e8f0', '#4a5a6a', '#c8d8f0', null, 'obsidian', 'crack', 'giant', 'stripes', '🔩', 'boss'],
    ['夢幻', '夢', '#ffe0ff', '#8a6aff', '#d0b0ff', 'imaginary', 'glitch', 'glitchstorm', 'draw', 'grid', '💭', 'luck'],
    ['光輝', '輝', '#ffffff', '#fff2a0', '#fff6d0', 'sun', 'genesis', 'sunpillar', 'giant', 'rays', '🌟', 'all', 1],
    ['宵闇', '宵', '#a0a0d0', '#1a1a3a', '#8a8aff', 'crescent', 'moon', 'moon', 'draw', 'stars', '🌃', 'just'],
    ['朝焼', '朝', '#ffe0c0', '#ff8a5a', '#ffb08a', 'sun', 'fire', 'sun', 'throw', 'rays', '🌄', 'golden'],
    ['祭', '祭', '#ffd0a0', '#e0402a', '#ffb06a', 'candy', 'candy', 'coinrain', 'spin', 'dots', '🏮', 'golden'],
    ['王家', '王', '#fff2a0', '#8a1a6a', '#ffd84a', null, 'gold', 'coinrain', 'giant', 'rays', '👑', 'reward'],
    ['覇王', '覇', '#ffffff', '#ff2a4a', '#ff6a8a', 'dragon', 'ragna', 'bolts', 'giant', 'lightning', '⚜️', 'all', 1],
  ];
  const SEQ = ['N', 'N', 'R', 'R', 'SR', 'SR', 'SSR', 'UR', 'LR', 'EX'];
  const SEQ_HI = ['SR', 'SSR', 'SSR', 'UR', 'UR', 'LR', 'EX', 'MYTH', 'GOD', 'OMEGA'];
  const NOUN = { N: ['手斧', '薪割り斧'], R: ['戦斧', '鉈斧'], SR: ['大斧', '両刃斧'], SSR: '神斧', UR: '魔斧', LR: '覇斧', EX: '天斧', MYTH: '神話斧', GOD: '神斧', OMEGA: '終極斧' };
  const SKW = ['バースト', 'ブレイク', 'ストライク', 'インパクト', 'ノヴァ', 'レイジ', 'ストーム', 'クラッシュ', 'フォール', 'ドライブ', 'エッジ', 'スラッシュ', 'カタストロフ', 'ジェネシス', 'オーバーロード', 'ディザスター', 'レクイエム', 'ラプソディ', 'ファンタズム', 'エクリプス'];
  const LINES = ['{L}の力よ、目覚めろ！', '{L}ごと、伐り裂け！', 'これが{L}の一撃だ！', '{L}は、止まらない', '{L}に、ひれ伏せ', 'すべての{L}を、この一振りに', '{L}よ、森を照らせ', '{L}の名のもとに！', '燃えろ、{L}の魂！', '{L}が、呼んでいる', '{L}を超えた先へ', '{L}、解放！'];
  const RI = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5, EX: 6, MYTH: 7, GOD: 8, OMEGA: 9 };
  // 特性の量（レアが上がるほど増える）
  const SPK = { reward: 0.06, dps: 0.07, boss: 0.15, critm: 0.3, critc: 0.004, combo: 0.06, fever: 0.4, gem: 0.0006, luck: 0.035, roll: 0.035, speed: 0.05, golden: 0.08, just: 0.03, thunder: 0.012, all: 0.05 };
  const ALL_HI = { EX: 1, MYTH: 1.6, GOD: 3, OMEGA: 6 };
  const gen = mulberry(20261107);
  SERIES.forEach((s, si) => {
    const [label, kanji, light, dark, glow, model, fx, ov, motion, pat, motif, focus, hi] = s;
    const seq = hi ? SEQ_HI : SEQ;
    const ids = [];
    const line = LINES[si % LINES.length].replace(/\{L\}/g, label);
    seq.forEach((r, i) => {
      const ri = RI[r];
      const id = `g_${si}_${i}`;
      const dh = (i - 4.5) * 7;
      const blade = [shift(light, dh, ri >= 6 ? 0.04 : 0), shift(dark, dh, -0.02 * (i % 3))];
      const noun = Array.isArray(NOUN[r]) ? NOUN[r][i % 2] : NOUN[r];
      const fantasy = ri >= 3 && !!model;
      const kn = ri >= 3 ? kname(gen) : '';
      const name = ri >= 3 ? `${label}${noun}・${kn}` : `${label}の${noun}`;
      const sp = {};
      sp[focus] = +(SPK[focus] * (ri + 1)).toFixed(4);
      if (ALL_HI[r]) sp.all = (sp.all || 0) + ALL_HI[r];
      const a = {
        id, r, name, desc: `${label}シリーズ ${i + 1}本目。${ri >= 3 ? `${kn}の名を刻んだ逸品。` : '手になじむ。'}`,
        blade, handle: shift(dark, 20, -0.15), glow: ri >= 2 ? glow : undefined, sp, series: si, gen: true, pasK: 0.25,
      };
      if (fantasy) { a.fantasy = true; a.model = model; a.fx = fx; if (model === 'dragon' || model === 'phoenix' || model === 'wing') a.pal = model === 'dragon' ? [dark, light] : [light, dark]; }
      if (ri >= 2 && i % 2 === 1 && !fantasy) a.double = true;
      D.AXES.push(a);
      ids.push(id);
      if (ri >= 3) {
        D.SKILLS[id] = { name: `${kn}・${SKW[(si * 7 + i * 3) % SKW.length]}`, motion: ri >= 9 ? 'omega' : motion, ov, stamp: kanji, line, pat, motif, fx: fantasy ? undefined : fx };
      }
    });
    // シリーズ = セット（そろえると小さな永続ボーナス）
    const bonus = {};
    bonus[focus] = +(SPK[focus] * 2).toFixed(4);
    D.SETS.push({ id: 'ser' + si, icon: motif, name: `${label}シリーズ`, axes: ids, bonus, gen: true });
  });

  // ------------------------------------------------------------- バイオーム（240）
  const ADJ = ['静寂の', '黄昏の', '幻影の', '灼熱の', '凍てつく', '悠久の', '星降る', '霧深き', '紅蓮の', '翡翠の', '蒼穹の', '黄金の', '白夜の', '常夜の', '花咲く', '嵐の', '雷鳴の', '月光の', '虹色の', '神秘の', '忘却の', '太古の', '約束の', '奇跡の'];
  const PLACE = ['森', '密林', '樹海', '原生林', '大森林', '杜', '林道', '果樹園', '並木道'];
  const base = D.BIOMES.slice();
  const bg = mulberry(2401);
  for (let i = 0; i < 216; i++) {
    const b = base[i % base.length];
    const adj = ADJ[i % ADJ.length], place = PLACE[Math.floor(i / ADJ.length) % PLACE.length];
    const deg = (37 * (1 + Math.floor(i / base.length)) + i * 11) % 360;
    const sh = (c) => shift(c, deg);
    const head = adj.replace(/の$|く$|る$|き$/, '');
    D.BIOMES.push({
      name: adj + place, sky: b.sky.map(sh), hills: b.hills.map(sh), ground: sh(b.ground), trunk: sh(b.trunk), leaves: b.leaves.map(sh),
      shape: b.shape, deco: b.deco, amb: b.amb, night: b.night, tree: `${head}の${b.tree}`, boss: `${head.slice(0, 1)}樹${kname(bg)}`, gen: true,
    });
  }

  // ------------------------------------------------------------- 実績（森）
  const ACH = D.ACH;
  const st = (S, k) => S.stats[k] || 0;
  const a = (id, icon, name, desc, check, gems, w = 0.1, cat = '森') => ACH.push({ id, icon, name, desc, check, gems, w, cat, gen: true });
  D.BIOMES.forEach((b, i) => {
    a('bio' + i, '🗺️', `${b.name}`, `${b.name}にたどり着く（ステージ${i * 10 + 1}）`, (S) => st(S, 'bestStage') >= i * 10 + 1, 2 + Math.floor(i / 10), 0.1, '世界');
    a('bb' + i, '👑', `${b.boss}討伐`, `${b.name}の主「${b.boss}」を倒す`, (S) => st(S, 'bestStage') >= (i + 1) * 10 + 1, 3 + Math.floor(i / 8), 0.1, '世界');
  });
  D.SETS.forEach((set) => {
    if (!set.gen) return;
    a('set_' + set.id, set.icon, `${set.name}コンプ`, `${set.name}の斧を${set.axes.length}本そろえる`, (S) => set.axes.every((id) => S.axes[id]), 25, 0.3, '図鑑');
  });
  // 記録の段位: [統計, 名前, 単位, はじめ, 倍率, 段数]
  const FAM = [
    ['taps', '斬撃', '回斬る', 500, 1.7, 30], ['kills', '伐採', '本伐る', 100, 1.7, 30], ['crits', '会心', '回会心を出す', 50, 1.7, 28],
    ['justs', '見切り', '回JUSTを出す', 30, 1.7, 28], ['greats', '豪腕', '回GREAT以上で斬る', 30, 1.7, 28], ['maxSpeeds', '神速', '回MAX SPEEDで斬る', 5, 1.7, 25],
    ['bosses', '大樹狩り', '体のボスを倒す', 3, 1.5, 25], ['pulls', '手引き', '回ガチャを引く', 10, 1.6, 22], ['rolls', '大回転', '回オートガチャをまわす', 2000, 1.8, 30],
    ['rareRolls', '豪運', '回UR以上を引く', 5, 1.7, 26], ['chestsOpened', '宝探し', '個宝箱を開ける', 5, 1.6, 24], ['squirrels', 'リス使い', '匹黄金リスを捕まえる', 3, 1.5, 20],
    ['fevers', '熱狂', '回フィーバーに入る', 5, 1.6, 25], ['roulettes', '博徒', '回ルーレットを当てる', 5, 1.6, 25], ['goldens', '黄金郷', '回ゴールデンタイムに入る', 3, 1.6, 24],
    ['skills', '必殺', '回必殺技を出す', 5, 1.7, 28], ['multiKills', '一振多伐', '回一振りで複数本倒す', 10, 1.7, 26], ['blasts', '爆裂', '回爆裂斬を出す', 5, 1.7, 24],
    ['thunders', '落雷', '回落雷を落とす', 5, 1.7, 24], ['echoes', '残像', '回残像斬りを出す', 10, 1.7, 24], ['hires', '雇用', '人木こりを雇う', 50, 1.6, 26],
    ['missionsDone', '任務', '回ミッションをこなす', 3, 1.5, 22], ['gemsAll', '宝石商', '個ジェムを集める', 500, 1.6, 26], ['maxCombo', '連撃', 'コンボを達成', 150, 1.35, 22],
  ];
  FAM.forEach(([k, nm, unit, start, ratio, n]) => {
    for (let i = 0; i < n; i++) {
      const th = nice(start * Math.pow(ratio, i));
      a(`fam_${k}_${i}`, '📈', `${nm}・${i + 1}段`, `${U.fmt(th)}${unit}`, (S) => st(S, k) >= th, 1 + Math.floor(i / 4), 0.1, '記録');
    }
  });
  for (let i = 1; i <= 60; i++) { const th = Math.pow(10, 3 + i * 5); a('woodX' + i, '🪵', `木材長者・${i}段`, `累計木材 ${U.fmt(th)}`, (S) => st(S, 'woodAll') >= th, 2 + Math.floor(i / 5), 0.1, '記録'); }
  for (let l = 10; l <= 1000; l += 10) a('lvG' + l, '⭐', `伐採レベル${l}`, `伐採レベル${l}に到達`, (S) => (S.lvl || 1) >= l, 2 + Math.floor(l / 100), 0.1, '記録');
  for (let l = 5; l <= 200; l += 5) a('glvG' + l, '🎰', `ガチャLv${l}`, `斧ガチャLv${l}に到達`, (S) => (S.gachaLv || 1) >= l, 2 + Math.floor(l / 25), 0.1, '記録');
  for (let n = 10; n <= D.AXES.length; n += 10) a('axN' + n, '🪓', `斧${n}種`, `斧を${n}種類集める`, (S) => Object.keys(S.axes).length >= n, 3 + Math.floor(n / 100), 0.1, '図鑑');
  // 説明文の数を最新に
  for (const x of ACH) if (x.id === 'skillAll') x.desc = `${Object.keys(D.SKILLS).length}種類すべての必殺技を見る`;
})();
