'use strict';
// =====================================================================
//  germgen.js — 菌斬り次元のコンテンツを手続き的に10倍へ（＋ドーパミン強化の調整値）
//  ・菌の株: 14種 × 10株 = 140（色・小物・強さが違う。初めて斬ると図鑑に登録）
//  ・ボス病原体 110、ミクロの世界 100
//  ・刀: 44シリーズ × 10本を足して約490本。SSR以上は奥義つき
//  ・秘技（雷・炎・氷・誘爆・無双・幸運）の強化と、記録の実績
// =====================================================================
(() => {
  if (typeof GD === 'undefined' || typeof D === 'undefined' || !D.GEN) return;
  const { mulberry, kname, nice, shift } = D.GEN;

  // ------------------------------------------------------------- 調整値（v2: 斬る数と気持ちよさを増やす）
  Object.assign(GD.CFG, {
    WAVE_KILLS: 45, MAX_GERMS: 7, MAX_STEP: 15, MAX_CAP: 14,
    HP_G: 1.33, HP_G2: 1.24, ROLL_BASE: 0.6, ROLL_STEP: 0.15, KLV_ROLL: 0.06,
    SPAWN_GAP: 0.24,
    FORM_MIN: 5, FORM_MAX: 9, // 群れ（一振りでまとめて斬れる隊列）の間隔
    FORM_HP: 0.35, FORM_DNA: 0.5, FORM_R: 0.72,
    MUSOU_TIME: 7, MUSOU_DMG: 4, MUSOU_DNA: 2, // 無双モード
    BOOM_R: 2.4, BOOM_CHAIN: 0.22, BOOM_DELAY: 0.12, // 誘爆
    BOMB_CHANCE: 0.05, LUCKY_CHANCE: 0.014, CHEST_CHANCE: 0.008,
    CRIT_MIN: 45, CRIT_MAX: 90, // ラッキー細胞の間隔（秒）
    WEAK_MULT: 8, WEAK_RESPAWN: 4, // ボスの弱点
    DEX_STEP: 10, DEX_BONUS: 0.04, // 図鑑10種ごとにDNA +4%
  });
  const fs0 = GD.freshStats;
  GD.freshStats = () => Object.assign(fs0(), {
    gBestRank: 0, gMusou: 0, gBooms: 0, gBestChain: 0, gSlots: 0, gJackpots: 0, gForms: 0, gChests: 0, gCritters: 0,
    gThunder: 0, gFire: 0, gIce: 0, gWeak: 0, gFinish: 0, gMusouKills: 0,
  });
  const fg0 = GD.freshGerm;
  GD.freshGerm = () => Object.assign(fg0(), { dex: {} });

  // ------------------------------------------------------------- 秘技（新しい強化）
  GD.UPG_CATS.push(['skill', '秘技']);
  GD.UPGRADES.push(
    { id: 'thunder', cat: 'skill', icon: '⚡', name: '雷刃', desc: '斬ると近くの菌へ雷が走る（確率 +2%・8Lvごとに1体ふえる）', base: 600, growth: 1.42, max: 25 },
    { id: 'fire', cat: 'skill', icon: '🔥', name: '炎刃', desc: '斬った菌が燃えて体力を削られ続ける（確率 +2%）', base: 700, growth: 1.42, max: 25 },
    { id: 'ice', cat: 'skill', icon: '❄️', name: '氷刃', desc: '斬った菌が凍る。凍った菌は次の一太刀で ×2.5（確率 +2%）', base: 800, growth: 1.42, max: 25 },
    { id: 'boom', cat: 'skill', icon: '💥', name: '誘爆', desc: '倒した菌が爆発して周りを巻きこむ確率 +4%・範囲 +4%', base: 1200, growth: 1.45, max: 20 },
    { id: 'musou', cat: 'skill', icon: '👹', name: '無双', desc: '無双モードの時間 +0.5秒・ゲージのたまり +5%', base: 900, growth: 1.4, max: 20 },
    { id: 'lucky', cat: 'skill', icon: '🎰', name: '幸運菌', desc: 'スロット菌・宝箱菌・ラッキー細胞が出やすい +15%', base: 1500, growth: 1.5, max: 15 },
  );
  Object.assign(GD.KSP_TEXT, {
    thunder: (v) => `雷刃 +${Math.round(v * 100)}%`, fire: (v) => `炎刃 +${Math.round(v * 100)}%`, ice: (v) => `氷刃 +${Math.round(v * 100)}%`,
    luckg: (v) => `幸運菌 +${Math.round(v * 100)}%`, musou: (v) => `無双 +${Math.round(v * 10) / 10}秒`, boom: (v) => `誘爆 +${Math.round(v * 100)}%`,
  });

  // ------------------------------------------------------------- 菌の株（14種 × 10株）
  const ADJ = ['', '紅', '蒼', '翠', '金', '紫', '白銀', '漆黒', '虹', '幻'];
  const PAL = [null, ['#ff9a8a', '#a01a2a'], ['#9ac8ff', '#1a3a9a'], ['#9affb0', '#1a7a4a'], ['#fff0a0', '#b08a00'], ['#e0a8ff', '#5a1a9a'], ['#ffffff', '#8a96a6'], ['#7a7a8a', '#0a0a14'], 'rainbow', ['#ffd0ff', '#2ad0b0']];
  const CAP = [null, '#ffd0c8', '#d0e8ff', '#d8ffe0', '#fff8c8', '#f0d8ff', '#ffffff', '#c8b0ff', '#ffffff', '#e8fff8'];
  const ACC = [null, null, 'horns', null, 'hat', null, 'shades', 'horns', 'halo', 'hat'];
  GD.STRAIN_ADJ = ADJ;
  GD.STRAINS = [];
  GD.STRAIN = {};
  GD.TYPES.forEach((t) => {
    for (let s = 0; s < 10; s++) {
      const x = {
        sid: `${t.id}_${s}`, type: t.id, s, name: ADJ[s] + t.name, pal: s ? PAL[s] : t.col, cap: s ? CAP[s] : t.cap, acc: ACC[s],
        hp: 1 + 0.12 * s, dna: 1 + 0.18 * s, sp: 1 + 0.04 * s, wave: s ? t.wave + s * 9 : t.wave,
      };
      GD.STRAINS.push(x);
      GD.STRAIN[x.sid] = x;
    }
  });

  // ------------------------------------------------------------- ボス病原体（110）
  const TITLES = ['キング', 'クイーン', 'マザー', 'ロード', 'エンペラー', '大魔王', '将軍', '女帝', '総帥', '覇王', '暴君', '始祖', '教皇', '大公', '魔神', '巨神', 'ジェネラル', 'カイザー', 'ツァーリ', 'ファラオ'];
  const BLINES = ['すべてを、のみこむ', '増えて、増えて、増え続ける', '世界は、菌のものになる', 'この体内は、我が城', '斬れるものなら、斬ってみろ', '細胞のすき間から、来た', '免疫なんて、効かない', '王の前に、ひれ伏せ', '終わらない感染', '次の宿主は、お前だ'];
  for (let i = GD.BOSSES.length; i < 110; i++) {
    const t = GD.TYPES[(i * 5) % GD.TYPES.length];
    const s = 1 + (i % 9);
    const pal = PAL[s] === 'rainbow' ? ['#ffb0ff', '#4a0a6a'] : PAL[s];
    GD.BOSSES.push({ name: `${TITLES[i % TITLES.length]}・${ADJ[s]}${t.name}`, type: t.id, strain: s, crown: i % 3 === 0, col: pal, line: BLINES[i % BLINES.length], gen: true });
  }

  // ------------------------------------------------------------- ミクロの世界（100）
  const ORGAN = ['肝臓', '腎臓', '心臓', '胃', '脳', '脊髄', '網膜', '鼓膜', '舌', '鼻腔', '気管', '膵臓', '脾臓', '皮膚', '毛細血管', '声帯', '涙腺', '扁桃'];
  const PL = ['の迷宮', 'の海', 'の峡谷', 'の神殿', 'の楽園'];
  const base = GD.BIOMES.slice();
  for (let i = 0; i < 90; i++) {
    const b = base[i % base.length];
    const deg = (29 * (1 + Math.floor(i / base.length)) + i * 13) % 360;
    const sh = (c) => shift(c, deg);
    GD.BIOMES.push({ name: ORGAN[i % ORGAN.length] + PL[Math.floor(i / ORGAN.length) % PL.length], bg: b.bg.map(sh), amb: b.amb, ambCol: sh(b.ambCol), light: sh(b.light), rainbow: i % 10 === 9, gen: true });
  }

  // ------------------------------------------------------------- 刀のシリーズ（44 × 10）
  // [一文字, 二つ名, 明, 暗, 光, 刀身の特殊, 鍔, 斬撃の形, 演出, 模様, 記号, 特性, 決め台詞]
  const KS = [
    ['雷', '鳴神', '#fff6a8', '#3a3a8a', '#ffe14a', 'beam', 'gear', 'x', 'bolts', 'lightning', '⚡', 'thunder', '稲妻よ、走れ'],
    ['炎', '焔', '#ffd15a', '#8a1a00', '#ff7a2a', 'flame', 'star', 'fan', 'inferno', 'flames', '🔥', 'fire', '燃え尽きろ'],
    ['氷', '霜', '#e8fbff', '#2a7ab0', '#8fe8ff', 'crystal', 'flower', 'grid', 'snow', 'dots', '❄️', 'ice', '凍てつけ'],
    ['風', '疾風', '#e0fff0', '#2ab07a', '#8affc8', '', 'flower', 'spiral', 'leafstorm', 'waves', '🌪️', 'reach', '風と共に'],
    ['月', '朧', '#ffffff', '#6a7ab0', '#c8d8ff', 'beam', 'ring', 'triple', 'moon', 'stars', '🌙', 'core', '月下に散れ'],
    ['花', '桜花', '#ffe0f0', '#ff5aa8', '#ff9ad0', '', 'flower', 'fan', 'bloom', 'waves', '🌸', 'combo', '花と散れ'],
    ['影', '影法師', '#8a8aa0', '#0a0a14', '#6a4aff', 'void', 'square', 'zigzag', 'void', 'cosmic', '🌑', 'zanshin', '影より斬る'],
    ['光', '白光', '#ffffff', '#c8d8f0', '#ffffff', 'beam', 'round', 'rain', 'heavenlight', 'rays', '✨', 'gold', '光あれ'],
    ['毒', '紫毒', '#e8b0ff', '#4a0a6a', '#c06aff', '', 'star', 'cross', 'chaos', 'waves', '☠️', 'zanshin', '毒をもって制す'],
    ['龍', '龍王', '#c8ffb0', '#1a6a2a', '#6aff6a', '', 'flower', 'spiral', 'golddragon', 'flames', '🐉', 'boss', '龍の咆哮'],
    ['鬼', '鬼神', '#ff9a8a', '#4a0010', '#ff3a3a', 'flame', 'star', 'x', 'inferno', 'flames', '👹', 'boss', '鬼の一太刀'],
    ['狐', '妖狐', '#fff0d0', '#ff8a2a', '#ffb06a', 'flame', 'flower', 'fan', 'bloom', 'waves', '🦊', 'gold', '化かされたな'],
    ['鶴', '千鶴', '#ffffff', '#e0e8f0', '#ffd0d8', '', 'round', 'triple', 'feathers', 'rays', '🕊️', 'combo', '千年の舞'],
    ['虎', '白虎', '#ffffff', '#4a4a5a', '#c8d8ff', '', 'square', 'cross', 'crack', 'stripes', '🐯', 'issen', '牙を剥け'],
    ['鳳', '鳳翼', '#fff8d0', '#ff4fd8', 'rainbow', 'flame', 'flower', 'star', 'rainbowfire', 'flames', '🦚', 'all', '蘇る炎', 1],
    ['海', '蒼海', '#b0f0ff', '#0a4a6a', '#3affd0', '', 'ring', 'rain', 'tsunami', 'waves', '🌊', 'dna', '海を割れ'],
    ['山', '霊峰', '#e0e8f0', '#4a5a6a', '#c8d8f0', '', 'square', 'grid', 'crack', 'stripes', '🏔️', 'boss', '山をも断つ'],
    ['星', '星詠', '#fff6d0', '#6a4aff', '#b39aff', 'galaxy', 'star', 'random', 'meteor', 'stars', '⭐', 'crit', '星を穿て'],
    ['宙', '宙', '#e0d0ff', '#10002a', '#9a7aff', 'galaxy', 'gear', 'omega', 'galaxy', 'cosmic', '🌌', 'all', '宇宙の果てまで', 1],
    ['夢', '夢幻', '#ffe0ff', '#8a6aff', '#d0b0ff', 'beam', 'ring', 'circle', 'glitchstorm', 'grid', '💭', 'luckg', '夢か現か'],
    ['刻', '刻読', '#fff0c0', '#8a6a20', '#ffd27a', '', 'gear', 'circle', 'clockstop', 'grid', '⏳', 'combo', '時を斬る'],
    ['雪', '雪月', '#ffffff', '#9ad8ff', '#cfefff', 'crystal', 'flower', 'rain', 'snow', 'dots', '☃️', 'ice', '白く染まれ'],
    ['雲', '叢雲', '#ffffff', '#6a8ab0', '#c8e0ff', '', 'round', 'fan', 'thunderstorm', 'lightning', '☁️', 'thunder', '雲を呼べ'],
    ['霧', '霧隠', '#e0e8e8', '#5a6a6a', '#c8d8d8', '', 'ring', 'spiral', 'void', 'waves', '🌫️', 'zanshin', '霧の中から'],
    ['金', '黄金', '#fff2a0', '#c88a00', '#ffd84a', '', 'flower', 'circle', 'coinrain', 'rays', '🪙', 'gold', '金色に輝け'],
    ['銀', '白銀', '#ffffff', '#a8b4c4', '#e8f0ff', 'crystal', 'round', 'cross', 'shardrain', 'grid', '🥈', 'crit', '銀の閃き'],
    ['紅', '紅蓮', '#ff9a7a', '#8a0010', '#ff3a3a', 'flame', 'star', 'fan', 'phoenixfire', 'flames', '🌹', 'fire', '紅に染まれ'],
    ['蒼', '蒼天', '#c0e0ff', '#1a3a9a', '#6ab0ff', 'beam', 'ring', 'rain', 'heavenlight', 'rays', '🔷', 'reach', '蒼き空へ'],
    ['翠', '翠嵐', '#c8ffd8', '#1a8a5a', '#6affb0', '', 'flower', 'spiral', 'leafstorm', 'waves', '💚', 'dna', '翠の嵐'],
    ['紫', '紫電', '#f0d0ff', '#6a1aa8', '#c06aff', 'beam', 'gear', 'x', 'bolts', 'lightning', '💜', 'thunder', '紫電一閃'],
    ['黒', '黒曜', '#6a6a7a', '#050510', '#8a6aff', 'void', 'square', 'zigzag', 'crack', 'cosmic', '🖤', 'crit', '闇に還れ'],
    ['白', '純白', '#ffffff', '#e8f0ff', '#ffffff', 'beam', 'round', 'triple', 'genesis', 'rays', '🤍', 'cells', '一点の曇りなく'],
    ['虹', '虹彩', '#ffffff', '#ff8ad0', 'rainbow', 'rainbow', 'flower', 'star', 'rainbowblades', 'rays', '🌈', 'all', '七色に輝け', 1],
    ['獅子', '獅子王', '#ffe0a0', '#a86a1a', '#ffd27a', '', 'star', 'cross', 'crack', 'stripes', '🦁', 'boss', '王者の牙'],
    ['蛇', '大蛇', '#c8ff9a', '#2a5a1a', '#7aff6a', '', 'ring', 'zigzag', 'void', 'waves', '🐍', 'zanshin', '八つの首'],
    ['蝶', '胡蝶', '#ffd0ff', '#a83ad8', '#ff9ae6', '', 'flower', 'spiral', 'feathers', 'dots', '🦋', 'combo', '夢の舞'],
    ['蜂', '女王蜂', '#fff0a0', '#3a2a00', '#ffd84a', '', 'gear', 'rain', 'coinrain', 'dots', '🐝', 'issen', '千の針'],
    ['鈴', '鈴鳴', '#fff0e0', '#e0a070', '#ffc890', '', 'ring', 'circle', 'rings', 'rays', '🎐', 'core', '鈴の音'],
    ['血', '血桜', '#ffb0c0', '#6a0010', '#ff3a5a', 'flame', 'flower', 'fan', 'bloom', 'flames', '🩸', 'crit', '散れ、紅く'],
    ['骸', '骸王', '#fffaf0', '#8a7a6a', '#ffffff', '', 'square', 'grid', 'crack', 'stripes', '💀', 'boss', '骸の刃'],
    ['機', '機巧', '#e0e8f0', '#4a5a6a', '#7affff', 'beam', 'gear', 'grid', 'glitchstorm', 'grid', '⚙️', 'cells', '歯車が回る'],
    ['電', '電光', '#a0ffff', '#0a2a4a', '#3affff', 'beam', 'gear', 'zigzag', 'glitchstorm', 'grid', '🔌', 'thunder', '電光石火'],
    ['聖', '聖光', '#fff6d0', '#d8a040', '#fff2a0', 'beam', 'flower', 'star', 'sunpillar', 'rays', '⛪', 'cells', '聖なる光'],
    ['魔', '魔刃', '#e0a0ff', '#2a0a4a', '#b06aff', 'void', 'star', 'omega', 'chaos', 'cosmic', '😈', 'all', '魔に堕ちろ', 1],
  ];
  const SEQ = ['N', 'N', 'R', 'R', 'SR', 'SR', 'SSR', 'UR', 'LR', 'EX'];
  const SEQ_HI = ['SR', 'SSR', 'SSR', 'UR', 'UR', 'LR', 'EX', 'MYTH', 'GOD', 'OMEGA'];
  const RI = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, LR: 5, EX: 6, MYTH: 7, GOD: 8, OMEGA: 9 };
  const C2 = ['月', '影', '光', '牙', '閃', '風', '鬼', '神', '皇', '華', '雪', '嵐', '焔', '霞', '露', '龍', '鳳', '翼', '刃', '王', '天', '零', '夜', '星', '嶺', '玉', '蓮', '鏡', '鋼', '心'];
  const SUF = ['', '丸', '切', '正', '宗', '守', '国', '綱'];
  const OUGI_W = ['一閃', '乱舞', '烈破', '天翔', '螺旋斬', '千手斬', '滅却', '轟斬', '覇王斬', '無限斬', '神楽', '残月', '流星斬', '百花', '散華', '双牙', '極光斬', '断罪', '天誅', '無双'];
  const KSPK = { thunder: 0.016, fire: 0.016, ice: 0.016, reach: 0.025, core: 0.03, combo: 0.06, zanshin: 0.012, gold: 0.08, boss: 0.15, issen: 0.02, dna: 0.1, crit: 0.006, cells: 0.12, luckg: 0.1, all: 0.1 };
  const ALL_HI = { EX: 1, MYTH: 2, GOD: 3.5, OMEGA: 7 };
  const TSUBA = ['round', 'square', 'flower', 'star', 'gear', 'ring'];
  const names = new Set(GD.KATANAS.map((k) => k.name));
  const kg = mulberry(4892);
  GD.KSERIES = [];
  KS.forEach((s, si) => {
    const [kanji, label, light, dark, glow, fx, tsuba, slash, ov, pat, motif, focus, line, hi] = s;
    const seq = hi ? SEQ_HI : SEQ;
    const ids = [];
    seq.forEach((r, i) => {
      const ri = RI[r];
      let nm = '';
      for (let k = 0; k < 40 && (!nm || names.has(nm)); k++) nm = kanji + C2[Math.floor(kg() * C2.length)] + SUF[Math.floor(kg() * SUF.length)];
      names.add(nm);
      const name = ri >= 3 ? `${label}「${nm}」` : nm;
      const dh = (i - 4.5) * 8;
      const sp = {};
      sp[focus] = +(KSPK[focus] * (ri + 1)).toFixed(4);
      if (ALL_HI[r]) sp.all = (sp.all || 0) + ALL_HI[r];
      const k = {
        id: `kg_${si}_${i}`, r, name, desc: `${label}の系譜、${i + 1}振り目。${line}。`,
        blade: [shift(light, dh, ri >= 6 ? 0.05 : 0), shift(dark, dh)], handle: shift(dark, 30, -0.12), glow: ri >= 2 ? glow : undefined,
        k: { tsuba: i % 3 ? tsuba : TSUBA[(si + i) % TSUBA.length], hamon: ri >= 2 ? shift(light, dh + 20, 0.15) : undefined, len: +(0.85 + 0.05 * Math.min(ri, 8) + kg() * 0.08).toFixed(2), curve: +(0.6 + kg() * 1.2).toFixed(2), fx: ri >= 4 ? fx || undefined : undefined, twin: ri >= 7 && i % 3 === 0 },
        sp, series: si, gen: true, pasK: 0.25, kind: 'katana', model: 'blade',
      };
      GD.KATANAS.push(k);
      ids.push(k.id);
      if (ri >= 3) GD.OUGI[k.id] = { name: kanji + OUGI_W[(si * 7 + i * 5) % OUGI_W.length], slash, ov, stamp: kanji, line: `${line}！`, pat, motif };
    });
    GD.KSERIES.push({ id: 'ks' + si, icon: motif, name: `${label}の系譜`, ids, focus });
  });

  // ------------------------------------------------------------- 実績（菌斬り次元）
  const ACH = D.ACH;
  const st = (S, k) => S.stats[k] || 0;
  const a = (id, icon, name, desc, check, gems, w = 0.1, cat = '菌斬り') => ACH.push({ id, icon, name, desc, check, gems, w, cat, gen: true, germ: true });
  const mw = (S) => (S.germ && S.germ.maxWave) || 1;
  GD.BIOMES.forEach((b, i) => a('mw' + i, '🔬', `${b.name}`, `菌斬り次元「${b.name}」にたどり着く（ウェーブ${i * 10 + 1}）`, (S) => mw(S) >= i * 10 + 1, 2 + Math.floor(i / 8), 0.1, '世界'));
  GD.BOSSES.forEach((b, i) => a('mb' + i, '👑', `${b.name}討伐`, `ボス病原体「${b.name}」を倒す`, (S) => mw(S) >= (i + 1) * 10 + 1, 3 + Math.floor(i / 6), 0.1, '世界'));
  GD.STRAINS.forEach((x) => a('dex_' + x.sid, '🦠', `${x.name}`, `「${x.name}」を斬って図鑑に登録`, (S) => !!(S.germ && S.germ.dex && S.germ.dex[x.sid]), 2, 0.1, '図鑑'));
  GD.KSERIES.forEach((x) => a('kser_' + x.id, x.icon, `${x.name}コンプ`, `${x.name}の刀を10本そろえる`, (S) => !!(S.germ && x.ids.every((id) => S.germ.kat[id])), 25, 0.3, '図鑑'));
  const FAM = [
    ['gSlices', '太刀筋', '回刀を振る', 300, 1.7, 30], ['gKills', '殺菌', '体の菌を斬る', 200, 1.7, 30], ['gCores', '芯', '回芯を斬る', 50, 1.7, 28],
    ['gCrits', '会心', '回会心を出す', 30, 1.7, 26], ['gOugi', '奥義', '回奥義を出す', 3, 1.6, 26], ['gRolls', '刀ガチャ', '回刀ガチャをまわす', 1000, 1.8, 28],
    ['gBosses', '病原体狩り', '体のボスを倒す', 2, 1.45, 25], ['gOutbreaks', '大発生', '回大発生をむかえる', 2, 1.5, 24], ['gGoldens', '黄金菌', '体の黄金菌を斬る', 3, 1.6, 24],
    ['gDnaAll', 'DNA', 'のDNAを集める', 1e4, 6, 30], ['gCellKills', '免疫', '体を免疫細胞が倒す', 100, 1.7, 26], ['gMusou', '無双', '回無双モードに入る', 2, 1.55, 26],
    ['gBooms', '誘爆', '回爆発させる', 10, 1.7, 26], ['gSlots', 'スロット', '回スロットを回す', 2, 1.5, 22], ['gForms', '群れ斬り', '回群れを全滅させる', 3, 1.6, 26],
    ['gThunder', '雷刃', '回雷を走らせる', 10, 1.7, 24], ['gFire', '炎刃', '回燃やす', 10, 1.7, 24], ['gIce', '氷刃', '回凍らせる', 10, 1.7, 24],
    ['gMaxCombo', '連斬', '連斬を達成', 30, 1.3, 22], ['gBestIssen', '一閃', '体を一振りで斬る', 2, 1.22, 18], ['gBestChain', '連鎖', '連鎖の誘爆を起こす', 2, 1.3, 16],
  ];
  FAM.forEach(([k, nm, unit, start, ratio, n]) => {
    for (let i = 0; i < n; i++) {
      const th = nice(start * Math.pow(ratio, i));
      a(`gfam_${k}_${i}`, '🧫', `${nm}・${i + 1}段`, `${U.fmt(th)}${unit}`, (S) => st(S, k) >= th, 1 + Math.floor(i / 4), 0.1, '記録');
    }
  });
  for (let n = 10; n <= GD.KATANAS.length; n += 10) a('kN' + n, '⚔️', `刀${n}本`, `刀を${n}種類集める`, (S) => Object.keys((S.germ && S.germ.kat) || {}).length >= n, 3 + Math.floor(n / 80), 0.1, '図鑑');
  for (let l = 5; l <= 200; l += 5) a('kglv' + l, '🎰', `刀ガチャLv${l}`, `刀ガチャLv${l}に到達`, (S) => ((S.germ && S.germ.kgLv) || 1) >= l, 2 + Math.floor(l / 25), 0.1, '記録');
  // 「刀剣コンプリート」は全部の刀に合わせる
  for (const x of ACH) {
    if (x.id === 'gkat2') { x.desc = `刀を${GD.KATANAS.length}種類集める`; x.check = (S) => Object.keys((S.germ && S.germ.kat) || {}).length >= GD.KATANAS.length; }
    if (x.id === 'guAll') { const n = Object.keys(GD.OUGI).length; x.desc = `${n}種類すべての奥義を見る`; x.check = (S) => Object.keys((S.germ && S.germ.ougiSeen) || {}).length >= n; }
  }
})();
