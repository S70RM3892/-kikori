'use strict';
// =====================================================================
//  germdata.js — 菌斬り次元（転生で開く、刀で菌を斬るもう一つの世界）のデータ
//  数値バランスはここに集約。免疫細胞・菌の形の説明は教科書的な事実に沿わせ、
//  空想のものには（空想）と書く。
// =====================================================================
const GD = (() => {
  const CFG = {
    UNLOCK_PRESTIGE: 1, // 転生1回で開く
    WAVE_KILLS: 25, // 1ウェーブで斬る菌の数
    BOSS_EVERY: 10,
    BOSS_TIME: 30,
    BOSS_HP_MULT: 12, // ボスの体力 = 同じウェーブの菌 × これ
    HP_BASE: 3, HP_G: 1.3, HP_G2: 1.22, HP_SW: 120, // 菌の体力（ウェーブごとに増える）
    DNA_BASE: 1, DNA_G: 1.18, DNA_G2: 1.12, // 1体あたりのDNA
    R_BASE: 0.85, // 菌の半径（画面の短い辺 = 10）
    MAX_GERMS: 5, MAX_STEP: 12, MAX_CAP: 11, // 同時に出る数（12ウェーブごとに+1）
    SPAWN_GAP: 0.3, // 次の菌が湧くまで（秒）
    COMBO_WIN: 1.15, COMBO_PCT: 0.004, COMBO_CAP: 200, // 連斬（コンボ）
    ISSEN_PCT: 0.25, // 一振りで斬った2体目以降のダメージ・DNA倍率（1体ごと）
    ISSEN_GAP: 0.5, ISSEN_CAP: 20, // 前の1体から0.5秒以内に斬れば同じ一閃。倍率は20体ぶんまで
    CORE: 0.36, CORE_MULT: 2, // 芯（菌の中心）を斬ったとき
    CRIT_BASE: 0.05, CRIT_MULT: 2.5,
    SPEED_TIERS: [1.4, 2.8, 4.8, 7.5, 10.5], // 振りの速さのしきい値（画面の短い辺/秒）
    SPEED_BONUS: [-0.4, 0, 0.3, 0.7, 1.2, 2],
    HIT_COOL: 0.16, // 同じ菌を連続で斬れる間隔（秒）
    OUT_MIN: 60, OUT_MAX: 120, OUT_TIME: 9, OUT_DNA: 3, // アウトブレイク（菌の大発生）
    GOLD_CHANCE: 0.018, GOLD_DNA: 25, GOLD_LIFE: 7,
    RAINBOW_CHANCE: 0.0018, RAINBOW_DNA: 150,
    ELITE_CHANCE: 0.07,
    CELL_TICK: 0.5, CELL_SOUL: 0.02, // 免疫細胞の攻撃間隔・斬撃に乗るDPSの割合
    // 刀ガチャ（菌斬り次元にいる間ずっと自動で回る）
    ROLL_BASE: 1, ROLL_STEP: 0.2, LUCK_STEP: 0.04,
    KLV_BASE: 120, KLV_GROW: 1.3, KLV_ROLL: 0.12, KLV_LUCK: 0.02,
    ROLL_TICK_MAX: 400,
    OUGI_DELAY: 0.55, // 奥義のカットインから斬撃が入るまで
    FACTOR_EVERY: 20, // ボスで手に入る変異因子（ウェーブ20ごとに+1）
    OFFLINE_ROLL_MAX: 50000,
    AXE_SYNERGY: 0.01, // 森の斧1種類につき刀ダメージ+1%
    KAT_SYNERGY: 0.01, // 刀1種類につき森の全ダメージ+1%
  };

  // ---------------------------------------------------------------- 菌（敵）
  // shape: 3Dの形 / col: [明, 暗] / cap: 斬ったときの断面の色 / hp・dna・sp・size: 倍率 / wave: 出始めるウェーブ
  // split: 斬ると分裂する数 / burst: 斬ると小さな胞子をまく数
  const TYPES = [
    { id: 'coccus', name: '球菌', shape: 'ball', col: ['#8dff7a', '#1f9a4a'], cap: '#eaff6a', hp: 1, dna: 1, sp: 1, size: 1, wave: 1, desc: '球の形をした細菌のなかま。まんまる。' },
    { id: 'bacillus', name: '桿菌', shape: 'rod', col: ['#6ae0ff', '#1a6aa8'], cap: '#c8fbff', hp: 1.2, dna: 1.3, sp: 1.5, size: 1, wave: 2, desc: '棒の形をした細菌。べん毛で泳ぐ。' },
    { id: 'strepto', name: 'レンサ球菌', shape: 'chain', col: ['#ffd36a', '#c9781a'], cap: '#fff2a0', hp: 1.6, dna: 1.7, sp: 0.8, size: 1.15, wave: 3, desc: '球菌が鎖のようにつながったもの。' },
    { id: 'virus', name: 'トゲトゲウイルス', shape: 'spiky', col: ['#ff7a7a', '#a01a2a'], cap: '#ffd0d0', hp: 1.7, dna: 1.9, sp: 1, size: 1.05, wave: 4, desc: '表面のトゲ（スパイク）で細胞に取りつくウイルス。' },
    { id: 'vibrio', name: 'ビブリオ', shape: 'comma', col: ['#9fffe0', '#1a8a7a'], cap: '#e0fff4', hp: 1, dna: 1.6, sp: 2.1, size: 0.9, wave: 5, desc: 'コンマのように曲がった細菌。素早い。' },
    { id: 'staph', name: 'ブドウ球菌', shape: 'grape', col: ['#ffe14a', '#a87a00'], cap: '#fff6b0', hp: 2.2, dna: 2.3, sp: 0.7, size: 1.25, wave: 6, desc: 'ブドウの房のように集まる球菌。' },
    { id: 'spiral', name: 'らせん菌', shape: 'spiral', col: ['#ff9ae6', '#a8288a'], cap: '#ffe0f6', hp: 1.5, dna: 1.8, sp: 1.3, size: 1.1, wave: 8, desc: 'ねじれたらせん形の細菌。回りながら進む。' },
    { id: 'amoeba', name: 'アメーバ', shape: 'blob', col: ['#c8ff6a', '#4a8a1a'], cap: '#f4ffc0', hp: 3.2, dna: 4, sp: 0.5, size: 1.45, wave: 10, split: 2, desc: '形を変えて動く単細胞生物。斬ると分裂する！' },
    { id: 'phage', name: 'バクテリオファージ', shape: 'phage', col: ['#c8b0ff', '#5a3ab8'], cap: '#efe6ff', hp: 2.5, dna: 3, sp: 0.9, size: 1.25, wave: 12, desc: '頭にDNAを詰め、尾と脚で細菌に取りつくウイルス。' },
    { id: 'spore', name: 'カビの胞子', shape: 'fuzzy', col: ['#f0e6c8', '#8a7a5a'], cap: '#fffbe8', hp: 2, dna: 2.6, sp: 0.6, size: 1.15, wave: 15, burst: 3, desc: '斬ると小さな胞子をまき散らす。' },
    { id: 'parame', name: 'ゾウリムシ', shape: 'slipper', col: ['#a0f0ff', '#3a8ab0'], cap: '#e6fbff', hp: 3, dna: 3.5, sp: 1.1, size: 1.4, wave: 20, desc: '全身の細かい毛（繊毛）で泳ぐ単細胞生物。' },
    { id: 'knot', name: 'ねじれ菌', shape: 'knot', col: ['#ff9a4a', '#8a2a00'], cap: '#ffe0b0', hp: 4, dna: 5, sp: 0.8, size: 1.15, wave: 30, desc: 'からまった結び目のような謎の菌（空想）。硬い。' },
    { id: 'nano', name: 'ナノ結晶体', shape: 'crystal', col: ['#7affff', '#2a5aff'], cap: '#e8ffff', hp: 5, dna: 6.5, sp: 1.4, size: 1.05, wave: 40, desc: '結晶でできた寄生体（空想）。' },
    { id: 'void', name: '虚無菌', shape: 'void', col: ['#5a2a8a', '#14001f'], cap: '#e0b0ff', hp: 7, dna: 9, sp: 1.2, size: 1.2, wave: 60, desc: '次元のすき間から湧いた菌（空想）。' },
  ];
  // 特殊個体
  const VARIANTS = {
    gold: { name: '黄金', hp: 0.6, dna: CFG.GOLD_DNA, sp: 2.2, size: 1 },
    rainbow: { name: '虹色', hp: 1, dna: CFG.RAINBOW_DNA, sp: 1.6, size: 1.1 },
    giant: { name: '巨大', hp: 6, dna: 8, sp: 0.5, size: 1.7 },
    armor: { name: '装甲', hp: 2.5, dna: 4, sp: 0.8, size: 1.05 }, // 遅い振りや芯を外すと弾かれる
    split: { name: '分裂', hp: 1.2, dna: 2, sp: 1, size: 1.1 },
    ghost: { name: '幽霊', hp: 1, dna: 3, sp: 1.2, size: 1 }, // ときどき透けて斬れない
  };

  // ---------------------------------------------------------------- ボス（10ウェーブごと）
  const BOSSES = [
    { name: 'キング・コッカス', type: 'coccus', crown: true, col: ['#9dff8a', '#0a6a2a'], line: 'まんまるの王が、すべてを丸のみにする' },
    { name: 'マザー・アメーバ', type: 'amoeba', col: ['#d8ff8a', '#3a7a0a'], line: '斬っても斬っても、増える' },
    { name: 'ファージ要塞', type: 'phage', col: ['#d0b8ff', '#3a1a98'], line: '脚を広げて、取りついてくる' },
    { name: 'スパイク皇帝', type: 'virus', crown: true, col: ['#ff8a8a', '#7a0018'], line: '王冠のトゲは、伊達じゃない' },
    { name: 'らせん竜', type: 'spiral', col: ['#ffb0ee', '#8a0a6a'], line: 'うねり、ねじれ、噛み砕く' },
    { name: '胞子の城', type: 'spore', col: ['#fff4d8', '#6a5a3a'], line: '城壁から胞子の雨が降る' },
    { name: 'ゾウリムシ艦長', type: 'parame', col: ['#b8f8ff', '#1a6a90'], line: '全繊毛、全速前進！' },
    { name: 'ねじれ大魔王', type: 'knot', crown: true, col: ['#ffb070', '#6a1a00'], line: 'ほどけない結び目' },
    { name: 'ナノ女王', type: 'nano', crown: true, col: ['#a8ffff', '#1a3ad8'], line: '結晶の玉座から見下ろす' },
    { name: '虚無の王', type: 'void', crown: true, col: ['#8a4aca', '#0a0014'], line: '次元の裂け目の、その奥' },
    { name: 'パンデミック・ロード', type: 'virus', crown: true, col: ['#ff4a8a', '#2a0010'], line: '世界中に、広がれ' },
  ];

  // ---------------------------------------------------------------- ミクロの世界（10ウェーブごとに変わる）
  // bg: [上, 下] / amb: 漂うもの / light: 光の色
  const BIOMES = [
    { name: '血管の川', bg: ['#4a0614', '#b0203a'], amb: 'rbc', ambCol: '#ff4a5a', light: '#ffc8c8' },
    { name: '腸内フローラ', bg: ['#142a05', '#6a8a1a'], amb: 'bubble', ambCol: '#e8ff9a', light: '#e8ffc0' },
    { name: 'ペトリ皿', bg: ['#2a1805', '#c08a2a'], amb: 'dot', ambCol: '#fff0a0', light: '#ffe8b0' },
    { name: '肺胞の森', bg: ['#3a0a2a', '#d06a9a'], amb: 'bubble', ambCol: '#ffd6ee', light: '#ffd8ee' },
    { name: '細胞の海', bg: ['#001a3a', '#1a7ac0'], amb: 'organelle', ambCol: '#9ae0ff', light: '#c0e8ff' },
    { name: '神経の網', bg: ['#14002a', '#6a3ac8'], amb: 'spark', ambCol: '#d8b0ff', light: '#dcc8ff' },
    { name: '骨髄の洞窟', bg: ['#2a1a1a', '#c8a8a0'], amb: 'dot', ambCol: '#fff0e8', light: '#fff4f0' },
    { name: 'リンパの迷宮', bg: ['#002a28', '#1ab0a0'], amb: 'bubble', ambCol: '#b0fff0', light: '#c8fff4' },
    { name: '量子ミクロ界', bg: ['#000814', '#0a4a6a'], amb: 'spark', ambCol: '#7affff', light: '#b0ffff' },
    { name: '原初のスープ', bg: ['#1a0a2a', '#2a9a7a'], amb: 'organelle', ambCol: '#ffe0a0', light: '#fff4c8', rainbow: true },
  ];

  // ---------------------------------------------------------------- 研ぎ（DNAで買う強化）
  const UPGRADES = [
    { id: 'sharp', cat: 'blade', icon: '🗡️', name: '切れ味', desc: '刀のダメージ +100%（25Lvごとにさらに×2）', base: 10, growth: 1.14, max: 0 },
    { id: 'draw', cat: 'blade', icon: '💨', name: '抜刀術', desc: '速く振ったときのボーナス +10%', base: 40, growth: 1.25, max: 40 },
    { id: 'issen', cat: 'blade', icon: '⚡', name: '一閃', desc: '一振りで2体目以降を斬る倍率 +3%/体', base: 120, growth: 1.3, max: 30 },
    { id: 'core', cat: 'blade', icon: '🎯', name: '芯斬り', desc: '芯の判定 +4%・芯の倍率 +0.05', base: 80, growth: 1.28, max: 25 },
    { id: 'combo', cat: 'blade', icon: '🔥', name: '連斬', desc: '連斬の受付 +0.08秒・上限 +10', base: 60, growth: 1.27, max: 30 },
    { id: 'crit', cat: 'blade', icon: '💥', name: '会心', desc: '会心率 +0.5%・会心倍率 +0.05', base: 150, growth: 1.3, max: 40 },
    { id: 'zanshin', cat: 'blade', icon: '👥', name: '残心', desc: '斬った菌に遅れてもう一太刀（確率 +3%）', base: 300, growth: 1.35, max: 25 },
    { id: 'reach', cat: 'blade', icon: '🌊', name: '斬撃波', desc: '刀の当たり判定が広がる +6%', base: 500, growth: 1.4, max: 15 },
    { id: 'analyze', cat: 'eco', icon: '🧬', name: 'DNA解析', desc: '手に入るDNA ×1.15（重ねがけ）', base: 250, growth: 2.5, max: 0 },
    { id: 'culture', cat: 'eco', icon: '🧫', name: '培養', desc: '同時に出る菌 +1', base: 2000, growth: 5, max: 5 },
    { id: 'gold', cat: 'eco', icon: '✨', name: '黄金菌センサー', desc: '黄金菌・虹色菌の出現率 +15%', base: 400, growth: 1.45, max: 20 },
    { id: 'outbreak', cat: 'eco', icon: '☣️', name: 'アウトブレイク', desc: '大発生の時間 +1秒・頻度 +5%', base: 800, growth: 1.5, max: 20 },
    { id: 'immune', cat: 'eco', icon: '🛡️', name: '免疫強化', desc: '免疫細胞の攻撃 ×1.2（重ねがけ）', base: 1000, growth: 3, max: 0 },
    { id: 'boss', cat: 'eco', icon: '👑', name: '病原体特効', desc: 'ボスへのダメージ +25%・制限時間 +1秒', base: 1500, growth: 1.55, max: 20 },
    { id: 'krollspd', cat: 'gacha', icon: '🎰', name: '刀ガチャ高速回転', desc: '刀ガチャ +0.2回/秒', base: 3000, growth: 30, max: 10 },
    { id: 'kluck', cat: 'gacha', icon: '🍀', name: '刀ガチャの幸運', desc: '刀ガチャの幸運 +4%', base: 9000, growth: 40, max: 10 },
  ];
  const UPG_CATS = [['blade', '刀の技'], ['eco', '研究'], ['gacha', '刀ガチャ']];

  // ---------------------------------------------------------------- 免疫細胞（放置で菌を倒す仲間）
  // 実在する細胞の説明は医学の教科書的な内容（自然免疫・獲得免疫）に沿わせた
  const CELLS = [
    { id: 'c1', icon: '⚪', col: '#f4f4ff', name: '好中球', desc: '血液に多い白血球。菌を取り込んで消化する（貪食）。', cost: 15, dps: 0.125 },
    { id: 'c2', icon: '🟡', col: '#ffe08a', name: 'マクロファージ', desc: '組織にいる大食いの食細胞。菌を次々と貪食する。', cost: 140, dps: 1 },
    { id: 'c3', icon: '✳️', col: '#ffb0f0', name: '樹状細胞', desc: '敵の情報（抗原）をT細胞に伝える伝令役。', cost: 1500, dps: 6.25 },
    { id: 'c4', icon: '🔴', col: '#ff6a6a', name: 'NK細胞', desc: '敵を事前に覚えていなくても、感染した細胞を攻撃する。', cost: 1.7e4, dps: 40 },
    { id: 'c5', icon: '🗡️', col: '#ff9a4a', name: 'キラーT細胞', desc: '感染した細胞を狙い撃ちにする細胞傷害性T細胞。', cost: 2e5, dps: 250 },
    { id: 'c6', icon: '📣', col: '#6ae0ff', name: 'ヘルパーT細胞', desc: '免疫全体の司令塔。B細胞やキラーT細胞を活性化する。', cost: 2.6e6, dps: 1625 },
    { id: 'c7', icon: '🔵', col: '#6a8aff', name: 'B細胞', desc: '形質細胞に変わって抗体を作る。', cost: 3.5e7, dps: 10500 },
    { id: 'c8', icon: '🧠', col: '#c8a8ff', name: '記憶細胞', desc: '一度戦った敵を覚えていて、次はすぐに反撃する。', cost: 5e8, dps: 75000 },
    { id: 'c9', icon: '🎯', col: '#ffd84a', name: '抗体ミサイル', desc: 'Y字の抗体を束ねて撃ち込む（空想）。', cost: 8e9, dps: 550000 },
    { id: 'c10', icon: '🤖', col: '#b0c8d8', name: 'ナノボット隊', desc: '血管を巡回する医療ナノマシン（空想）。', cost: 1.5e11, dps: 4.25e06 },
    { id: 'c11', icon: '💉', col: '#9affc8', name: 'ワクチン聖騎士', desc: '免疫の記憶を剣に宿した騎士（空想）。', cost: 3e12, dps: 3.5e07 },
    { id: 'c12', icon: '🌌', col: '#a87aff', name: '量子抗体', desc: 'あらゆる可能性の菌を同時に無力化する（空想）。', cost: 7e13, dps: 3e08 },
    { id: 'c13', icon: '☀️', col: '#ffcc33', name: '免疫の太陽神', desc: '熱すぎない程度に燃えて菌を焼く（空想）。', cost: 2e15, dps: 2.75e09 },
    { id: 'c14', icon: '♾️', col: '#ff6af0', name: '無限免疫', desc: '「病気」という概念ごと斬る（空想）。', cost: 6e16, dps: 2.5e10 },
  ];
  const MILESTONES = [[25, 2], [50, 2], [100, 2], [150, 2], [200, 2], [300, 3], [500, 3], [1000, 5]];

  // ---------------------------------------------------------------- 変異（ボスの🧪変異因子で買う。森にも効く）
  // k: 1Lvごとの効果、mul: true なら重ねがけ（×(1+k)^Lv）
  const MUTATIONS = [
    { id: 'm_photo', icon: '🌿', name: '光合成ブースト', desc: '森の木こりDPS', k: 0.5, mul: true, max: 20, base: 1, growth: 1.5 },
    { id: 'm_tap', icon: '🪓', name: '斧の突然変異', desc: '森の斬撃ダメージ', k: 0.5, mul: true, max: 20, base: 1, growth: 1.5 },
    { id: 'm_wood', icon: '🪵', name: '木材の発酵', desc: '森の木材', k: 0.4, mul: true, max: 20, base: 2, growth: 1.6 },
    { id: 'm_blade', icon: '🗡️', name: '刃の遺伝子', desc: '刀のダメージ', k: 0.5, mul: true, max: 20, base: 1, growth: 1.5 },
    { id: 'm_dna', icon: '🧬', name: '二重らせん', desc: 'DNA', k: 0.5, mul: true, max: 20, base: 2, growth: 1.6 },
    { id: 'm_cells', icon: '🛡️', name: '免疫記憶', desc: '免疫細胞の攻撃', k: 0.5, mul: true, max: 20, base: 1, growth: 1.5 },
    { id: 'm_roll', icon: '🎰', name: 'ガチャ細胞分裂', desc: '斧ガチャ・刀ガチャの回転', k: 0.15, max: 10, base: 3, growth: 1.8 },
    { id: 'm_luck', icon: '🍀', name: '幸運遺伝子', desc: '斧ガチャ・刀ガチャの幸運', k: 0.1, max: 10, base: 3, growth: 1.8 },
    { id: 'm_spirit', icon: '🧚', name: '精霊との共生', desc: '精霊1体あたりの効果', k: 0.1, max: 10, base: 4, growth: 1.9 },
    { id: 'm_gem', icon: '💎', name: '結晶化', desc: 'ジェムが出る確率', k: 0.1, max: 10, base: 4, growth: 1.9 },
    { id: 'm_offline', icon: '😴', name: '冬眠遺伝子', desc: '離れている間の効率', k: 0.05, max: 6, base: 5, growth: 2 },
    { id: 'm_fever', icon: '🔥', name: '熱狂物質', desc: 'フィーバー・大発生の秒数', k: 1, add: true, max: 10, base: 3, growth: 1.8 },
    { id: 'm_boss', icon: '👑', name: '捕食者の本能', desc: '両方の世界のボスへのダメージ', k: 0.2, max: 15, base: 2, growth: 1.7 },
    { id: 'm_combo', icon: '⛓️', name: '連鎖反応', desc: '両方の世界のコンボ受付', k: 0.05, add: true, max: 10, base: 3, growth: 1.8 },
    { id: 'm_xp', icon: '⭐', name: '成長ホルモン', desc: '伐採レベルの経験値', k: 0.2, max: 10, base: 2, growth: 1.7 },
    { id: 'm_all', icon: '🌈', name: '完全変異', desc: '両方の世界の全ダメージ', k: 0.25, mul: true, max: 30, base: 5, growth: 1.7 },
  ];

  // ---------------------------------------------------------------- 刀（刀ガチャで出る）
  // blade: [刃先の明るい色, 地の暗い色] / handle: 柄糸の色 / glow: 光
  // k: { tsuba: 鍔の形, hamon: 刃文の色, len: 長さ, curve: 反り, fx: 特殊な刀身 }
  // sp: 装備したときの特性（菌斬り次元の中で効く）
  const KATANAS = [
    { id: 'k_bokuto', r: 'N', name: '木刀', desc: '修学旅行のおみやげ。', blade: ['#e8c890', '#a87a40'], handle: '#6a4a2a', k: { tsuba: 'none', wood: true } },
    { id: 'k_takemitsu', r: 'N', name: '竹光', desc: '竹でできた見せかけの刀。軽い。', blade: ['#d8f0a0', '#7aa040'], handle: '#3a5a2a', k: { tsuba: 'round', wood: true } },
    { id: 'k_rusty', r: 'N', name: '錆び刀', desc: '蔵の奥から出てきた。', blade: ['#c89060', '#6a4a2a'], handle: '#3a2a20', k: { tsuba: 'square' } },
    { id: 'k_namakura', r: 'N', name: 'なまくら', desc: '切れ味はお察し。', blade: ['#c8ccd0', '#7a8088'], handle: '#2a2a3a', k: { tsuba: 'round' } },
    { id: 'k_practice', r: 'N', name: '練習刀', desc: '刃引きしてある。', blade: ['#e0e4ea', '#9aa4b0'], handle: '#1a1a2a', k: { tsuba: 'round' } },
    { id: 'k_kitchen', r: 'N', name: '柳刃刀', desc: '刺身を引くための長い包丁。', blade: ['#f4f8ff', '#a8b4c0'], handle: '#e8d8b0', k: { tsuba: 'none', len: 0.75, curve: 0.1 } },
    { id: 'k_uchi', r: 'R', name: '打刀', desc: '腰に差す、ふつうの刀。', blade: ['#f0f4fa', '#8a96a6'], handle: '#1a1a40', k: { tsuba: 'round' } },
    { id: 'k_waki', r: 'R', name: '脇差', desc: '短めの相棒。', blade: ['#f4f6fa', '#909aa8'], handle: '#401a1a', k: { tsuba: 'square', len: 0.72 } },
    { id: 'k_tachi', r: 'R', name: '太刀', desc: '反りが深い、馬上の刀。', blade: ['#f6f8fc', '#8a94a4'], handle: '#2a1a0a', k: { tsuba: 'flower', curve: 1.6 } },
    { id: 'k_kodachi', r: 'R', name: '小太刀', desc: '素早く振れる。', blade: ['#eef4ff', '#8aa0c0'], handle: '#1a3a2a', k: { tsuba: 'round', len: 0.8 }, sp: { combo: 0.1 } },
    { id: 'k_iron', r: 'R', name: '鉄刀', desc: 'ずっしり重い。', blade: ['#d8dde4', '#5f6a78'], handle: '#2a2a2a', k: { tsuba: 'square' }, sp: { kdmg: 0.1 } },
    { id: 'k_alcohol', r: 'R', name: '消毒刀', desc: 'アルコールでふいてある。', blade: ['#e8fbff', '#7ab8d8'], handle: '#ffffff', k: { tsuba: 'round' }, sp: { dna: 0.1 } },
    { id: 'k_frost', r: 'SR', name: '氷刃「霜月」', desc: '菌も凍らせて止める。', blade: ['#e8fbff', '#59c8ff'], handle: '#1a3a5a', glow: '#7fe0ff', k: { tsuba: 'flower', hamon: '#bff4ff' }, sp: { combo: 0.25 } },
    { id: 'k_homura', r: 'SR', name: '炎刃「焔丸」', desc: '熱で殺菌。', blade: ['#ffd15a', '#ff4a1a'], handle: '#3a0a0a', glow: '#ff7a2a', k: { tsuba: 'star', hamon: '#ffe08a', fx: 'flame' }, sp: { crit: 0.02 } },
    { id: 'k_narukami', r: 'SR', name: '雷刃「鳴神」', desc: '電撃で痺れさせる。', blade: ['#fff6a8', '#ffb800'], handle: '#1a1a40', glow: '#ffe14a', k: { tsuba: 'gear', hamon: '#ffffff' }, sp: { issen: 0.05 } },
    { id: 'k_hayate', r: 'SR', name: '風刃「疾風」', desc: '振ると風が菌を集める。', blade: ['#d8ffe8', '#3ad08a'], handle: '#1a4a30', glow: '#6affb0', k: { tsuba: 'flower', curve: 1.3 }, sp: { reach: 0.1 } },
    { id: 'k_shion', r: 'SR', name: '毒刃「紫苑」', desc: '毒をもって毒を制す。', blade: ['#f0d8ff', '#8a3ad8'], handle: '#2a0a3a', glow: '#c06aff', k: { tsuba: 'star', hamon: '#f0c0ff' }, sp: { zanshin: 0.05 } },
    { id: 'k_byakuya', r: 'SR', name: '光刃「白夜」', desc: '夜を昼に変える光。', blade: ['#ffffff', '#c8d8f0'], handle: '#e8e0c0', glow: '#ffffff', k: { tsuba: 'round', hamon: '#ffffff' }, sp: { gold: 0.2 } },
    { id: 'k_suzune', r: 'SR', name: '音刃「鈴音」', desc: '鳴るたびに菌が震える。', blade: ['#fff0e0', '#e0a070'], handle: '#8a2a2a', glow: '#ffc890', k: { tsuba: 'ring' }, sp: { core: 0.1 } },
    { id: 'k_kinkui', r: 'SSR', name: '妖刀「菌喰」', desc: '斬った菌を喰らって強くなる。', blade: ['#c8ff9a', '#2a7a1a'], handle: '#0a1a0a', glow: '#7aff4a', k: { tsuba: 'star', hamon: '#eaffc0', curve: 1.4 }, sp: { dna: 0.5 } },
    { id: 'k_mukin', r: 'SSR', name: '名刀「無菌丸」', desc: '刃に菌が一匹もいない。', blade: ['#ffffff', '#9ad8ff'], handle: '#ffffff', glow: '#bfefff', k: { tsuba: 'flower', hamon: '#e8fbff' }, sp: { kdmg: 0.5 } },
    { id: 'k_uv', r: 'SSR', name: '紫外線刀UV', desc: '紫外線は殺菌灯にも使われる。', blade: ['#e8b0ff', '#5a0aa8'], handle: '#14001f', glow: '#c06aff', k: { tsuba: 'gear', fx: 'beam' }, sp: { crit: 0.04 } },
    { id: 'k_boil', r: 'SSR', name: '煮沸刀「百度」', desc: '煮沸は昔からの消毒法。', blade: ['#ffe0c0', '#ff6a3a'], handle: '#3a1a0a', glow: '#ff9a4a', k: { tsuba: 'round', fx: 'flame' }, sp: { boss: 0.5 } },
    { id: 'k_penicillin', r: 'SSR', name: '抗生剣ペニシリン', desc: '1928年にフレミングがアオカビから見つけた抗生物質の名を持つ。', blade: ['#d8ffd0', '#3aa86a'], handle: '#1a3a2a', glow: '#8affb0', k: { tsuba: 'flower', hamon: '#ffffff' }, sp: { zanshin: 0.1 } },
    { id: 'k_leuko', r: 'SSR', name: '白血刀', desc: '白血球の魂が宿る。', blade: ['#ffffff', '#ffb0c0'], handle: '#8a0a1a', glow: '#ffd0d8', k: { tsuba: 'round', hamon: '#ffffff' }, sp: { cells: 0.5 } },
    { id: 'k_kamaitachi', r: 'SSR', name: '鎌鼬', desc: '見えない風の刃で斬る。', blade: ['#e8fff0', '#6ad0a0'], handle: '#0a2a1a', glow: '#a0ffd0', k: { tsuba: 'none', curve: 2, len: 0.9 }, sp: { reach: 0.25 } },
    { id: 'k_tsubame', r: 'SSR', name: '燕返し', desc: '振り下ろしてすぐ切り返す。', blade: ['#f0f4ff', '#3a4a8a'], handle: '#0a0a2a', glow: '#8aa0ff', k: { tsuba: 'square', len: 1.25 }, sp: { issen: 0.12 } },
    { id: 'k_macro', r: 'UR', name: '免疫刀マクロファージ', desc: '斬るたびに菌を飲みこむ。', blade: ['#fff0a0', '#e0a000'], handle: '#3a2a00', glow: '#ffd84a', k: { tsuba: 'flower', hamon: '#ffffff', curve: 1.2 }, sp: { cells: 1, dna: 0.3 } },
    { id: 'k_antibody', r: 'UR', name: '抗体剣Y', desc: '抗体はY字形。二股の刃で捕まえる。', blade: ['#e0f0ff', '#3a6aff'], handle: '#0a1a4a', glow: '#6aa0ff', k: { tsuba: 'star', twin: true }, sp: { issen: 0.2 } },
    { id: 'k_jenner', r: 'UR', name: '種痘刀ジェンナー', desc: '1796年、ジェンナーが種痘を試したことにちなむ。', blade: ['#fff8f0', '#c8a080'], handle: '#4a2a1a', glow: '#ffe0c0', k: { tsuba: 'round', hamon: '#ffffff' }, sp: { kdmg: 1 } },
    { id: 'k_pasteur', r: 'UR', name: 'パスツールの刃', desc: '加熱殺菌の父の名を持つ。', blade: ['#ffffff', '#ff8a6a'], handle: '#2a0a0a', glow: '#ffa080', k: { tsuba: 'gear', fx: 'flame' }, sp: { boss: 1 } },
    { id: 'k_helix', r: 'UR', name: '双刃「二重らせん」', desc: 'DNAの二重らせんのように絡む二本の刃。', blade: ['#a0ffff', '#ff6ad5'], handle: '#14002a', glow: '#c8a0ff', k: { tsuba: 'ring', twin: true, hamon: '#ffffff' }, sp: { dna: 1 } },
    { id: 'k_leeuwen', r: 'UR', name: '顕微刀レーウェンフック', desc: '自作の顕微鏡で微生物を見た人の名を持つ。', blade: ['#e8fff8', '#2a9a8a'], handle: '#3a2a10', glow: '#8affe8', k: { tsuba: 'ring', hamon: '#ffffff' }, sp: { core: 0.3 } },
    { id: 'k_quark', r: 'LR', name: '光速刀クォーク', desc: '光より速く振ったことがある（気がする）。', blade: ['#ffffff', '#4fe3ff'], handle: '#001a2a', glow: '#4fe3ff', k: { tsuba: 'none', fx: 'beam' }, sp: { combo: 0.6, issen: 0.2 } },
    { id: 'k_superpos', r: 'LR', name: '量子刀「重ね合わせ」', desc: '斬った状態と斬っていない状態が重なっている。', blade: ['#ffffff', '#b06aff'], handle: '#14002a', glow: '#d0a0ff', k: { tsuba: 'gear', fx: 'beam' }, sp: { zanshin: 0.2, crit: 0.05 } },
    { id: 'k_nano', r: 'LR', name: 'ナノブレード', desc: '刃先の厚さは原子数個ぶん。', blade: ['#e8ffff', '#2a6aff'], handle: '#0a0a1a', glow: '#7affff', k: { tsuba: 'square', fx: 'crystal' }, sp: { kdmg: 2 } },
    { id: 'k_plasma', r: 'LR', name: 'プラズマ刀', desc: '刀身は一億度（空想）。', blade: ['#fff0ff', '#ff3ad8'], handle: '#1a0014', glow: '#ff6af0', k: { tsuba: 'gear', fx: 'beam' }, sp: { boss: 1.5, kdmg: 0.5 } },
    { id: 'k_chrono', r: 'LR', name: '時渡りの刀', desc: '斬撃が少し未来に届く。', blade: ['#fff6d8', '#c08a2a'], handle: '#2a1a00', glow: '#ffd27a', k: { tsuba: 'gear', hamon: '#ffffff', curve: 1.3 }, sp: { out: 3, combo: 0.4 } },
    { id: 'k_murakumo', r: 'EX', name: '天叢雲', desc: '雲を呼ぶ神話の剣の名を持つ。', blade: ['#ffffff', '#6a8ab0'], handle: '#1a1a3a', glow: '#c8e0ff', k: { tsuba: 'flower', hamon: '#ffffff', len: 1.2 }, sp: { all: 1 } },
    { id: 'k_futsu', r: 'EX', name: '布都御魂', desc: '国を平らげた神話の剣の名を持つ。', blade: ['#fff6e0', '#d8a040'], handle: '#3a0a0a', glow: '#ffcf6a', k: { tsuba: 'star', hamon: '#ffffff', len: 1.15 }, sp: { kdmg: 3, gold: 0.5 } },
    { id: 'k_totsuka', r: 'EX', name: '十束剣', desc: '大蛇を斬った神話の剣の名を持つ。', blade: ['#ffe0e0', '#c81a3a'], handle: '#1a0005', glow: '#ff5a7a', k: { tsuba: 'round', hamon: '#ffd0d8', len: 1.3, curve: 0.5 }, sp: { boss: 3, issen: 0.3 } },
    { id: 'k_habakiri', r: 'EX', name: '天羽々斬', desc: '天をも斬る神話の剣の名を持つ。', blade: ['#f0f8ff', '#4a7aff'], handle: '#000a2a', glow: '#8ab0ff', k: { tsuba: 'ring', hamon: '#ffffff', len: 1.25 }, sp: { reach: 0.4, crit: 0.06 } },
    { id: 'k_hoshikiri', r: 'MYTH', name: '星斬り', desc: '流れ星を斬ったという刀。', blade: ['#fff8d0', '#7a5aff'], handle: '#0a0420', glow: '#b39aff', k: { tsuba: 'star', fx: 'galaxy', len: 1.3 }, sp: { all: 2, dna: 1 } },
    { id: 'k_ryuuga', r: 'MYTH', name: '龍牙刀', desc: '龍の牙を鍛えた。', blade: ['#fff0c0', '#2a9a5a'], handle: '#0a2a14', glow: '#5affa0', k: { tsuba: 'flower', hamon: '#ffe08a', curve: 1.8, len: 1.3 } , sp: { kdmg: 5, boss: 2 } },
    { id: 'k_gekkou', r: 'MYTH', name: '月光', desc: '月明かりだけで斬る。', blade: ['#ffffff', '#a8c8ff'], handle: '#000814', glow: '#e0ecff', k: { tsuba: 'ring', fx: 'beam', len: 1.35 }, sp: { crit: 0.1, zanshin: 0.3 } },
    { id: 'k_kamigoroshi', r: 'GOD', name: '神殺し', desc: '神でさえ斬れる。', blade: ['#ffffff', '#ff2a4a'], handle: '#0a0000', glow: '#ff3a5a', k: { tsuba: 'star', fx: 'void', len: 1.4 }, sp: { all: 4, boss: 3 } },
    { id: 'k_shinra', r: 'GOD', name: '森羅万象刀', desc: '森と菌、両方の世界を斬る。', blade: ['#ffffff', '#ffd700'], handle: '#2a1a00', glow: 'rainbow', k: { tsuba: 'flower', fx: 'rainbow', len: 1.4 }, sp: { all: 3, dna: 2, cells: 2 } },
    { id: 'k_omega', r: 'OMEGA', name: 'Ω・終刀', desc: '一千万回に一度だけ鞘から抜ける。', blade: ['#ffffff', '#ff40ff'], handle: '#000000', glow: 'rainbow', k: { tsuba: 'gear', fx: 'rainbow', len: 1.5, twin: true }, sp: { all: 8, issen: 0.5, dna: 3 } },
  ];
  KATANAS.forEach((k) => { k.kind = 'katana'; k.model = 'blade'; });
  const KSP_TEXT = {
    kdmg: (v) => `刀ダメージ +${Math.round(v * 100)}%`,
    dna: (v) => `DNA +${Math.round(v * 100)}%`,
    issen: (v) => `一閃の倍率 +${Math.round(v * 100)}%/体`,
    core: (v) => `芯の判定 +${Math.round(v * 100)}%`,
    crit: (v) => `会心率 +${Math.round(v * 1000) / 10}%`,
    combo: (v) => `連斬の受付 +${Math.round(v * 100) / 100}秒`,
    gold: (v) => `黄金菌 +${Math.round(v * 100)}%`,
    cells: (v) => `免疫細胞 +${Math.round(v * 100)}%`,
    boss: (v) => `ボス特効 +${Math.round(v * 100)}%`,
    zanshin: (v) => `残心 +${Math.round(v * 100)}%`,
    reach: (v) => `間合い +${Math.round(v * 100)}%`,
    out: (v) => `大発生 +${Math.round(v * 10) / 10}秒`,
    all: (v) => `全ダメージ +${Math.round(v * 100)}%`,
  };

  // ---------------------------------------------------------------- 奥義（SSR以上の刀。ゲージが満ちると画面の菌を一斉に斬る）
  // slash: 画面を走る斬撃の形 / ov: 画面の演出（fx.js の必殺技演出を流用）/ pat・stamp・line・motif: カットイン
  const OUGI = {
    k_kinkui: { name: '妖・菌喰らい', slash: 'fan', ov: 'bloom', stamp: '喰', line: 'お前の命、いただく', pat: 'waves', motif: '🦠' },
    k_mukin: { name: '無菌一閃', slash: 'cross', ov: 'iai', stamp: '無', line: 'ここはもう、無菌室だ', pat: 'stripes', motif: '✨' },
    k_uv: { name: '紫外線照射', slash: 'rain', ov: 'void', stamp: '紫', line: '光を浴びて、消えろ', pat: 'rays', motif: '🟣' },
    k_boil: { name: '百度煮沸斬', slash: 'grid', ov: 'inferno', stamp: '沸', line: 'グツグツ……ジュワッ！', pat: 'flames', motif: '♨️' },
    k_penicillin: { name: 'ペニシリン・ショック', slash: 'star', ov: 'leafstorm', stamp: '抗', line: 'カビから生まれた、奇跡の一太刀', pat: 'dots', motif: '💊' },
    k_leuko: { name: '白血球の大行進', slash: 'triple', ov: 'feathers', stamp: '白', line: '全員、突撃ーっ！', pat: 'dots', motif: '⚪' },
    k_kamaitachi: { name: '鎌鼬・旋風', slash: 'spiral', ov: 'leafstorm', stamp: '風', line: '見えたときには、もう斬れている', pat: 'waves', motif: '🌪️' },
    k_tsubame: { name: '燕返し', slash: 'zigzag', ov: 'iai', stamp: '燕', line: '返す刀で、もう一度', pat: 'stripes', motif: '🐦' },
    k_macro: { name: '貪食・大喰らい', slash: 'circle', ov: 'coinrain', stamp: '喰', line: 'ぜんぶ、まるのみ', pat: 'rays', motif: '🟡' },
    k_antibody: { name: '抗体ロックオン', slash: 'x', ov: 'rings', stamp: '抗', line: '狙った菌は、逃がさない', pat: 'grid', motif: '🎯' },
    k_jenner: { name: '種痘・千年免疫', slash: 'star', ov: 'genesis', stamp: '痘', line: '人類の反撃は、ここから始まった', pat: 'rays', motif: '💉' },
    k_pasteur: { name: '低温殺菌斬', slash: 'grid', ov: 'flame', stamp: '殺', line: '熱すぎず、確実に', pat: 'flames', motif: '🥛' },
    k_helix: { name: 'ダブルヘリックス', slash: 'spiral', ov: 'galaxy', stamp: '螺', line: '命の設計図ごと、書き換える', pat: 'cosmic', motif: '🧬' },
    k_leeuwen: { name: '三百倍の眼', slash: 'circle', ov: 'shardrain', stamp: '眼', line: '小さくても、見えている', pat: 'dots', motif: '🔬' },
    k_quark: { name: '光速抜刀', slash: 'rain', ov: 'meteor', stamp: '光', line: '光は、まっすぐ届く', pat: 'lightning', motif: '⚡' },
    k_superpos: { name: '観測斬り', slash: 'random', ov: 'glitchstorm', stamp: '量子', line: '見た瞬間に、斬れている', pat: 'grid', motif: '⚛️' },
    k_nano: { name: 'ナノスケール・カット', slash: 'grid', ov: 'shardrain', stamp: '微', line: '原子のすき間を、通す', pat: 'grid', motif: '🔷' },
    k_plasma: { name: 'プラズマ・バースト', slash: 'star', ov: 'bolts', stamp: '雷', line: '一億度の、ひと振り', pat: 'lightning', motif: '💥' },
    k_chrono: { name: '時渡り・未来斬', slash: 'circle', ov: 'clockstop', stamp: '時', line: '未来の菌も、今のうちに', pat: 'grid', motif: '⏳' },
    k_murakumo: { name: '叢雲・天変', slash: 'fan', ov: 'thunderstorm', stamp: '雲', line: '雲を呼び、雷を落とせ', pat: 'lightning', motif: '☁️' },
    k_futsu: { name: '布都・国平らげ', slash: 'x', ov: 'heavenlight', stamp: '神', line: 'この国の菌を、平らげる', pat: 'rays', motif: '⛩️' },
    k_totsuka: { name: '八岐大蛇斬り', slash: 'fan', ov: 'golddragon', stamp: '蛇', line: '八つの首を、一太刀で', pat: 'flames', motif: '🐍' },
    k_habakiri: { name: '天羽々・斬天', slash: 'rain', ov: 'sunpillar', stamp: '天', line: '天ごと、斬り裂け', pat: 'rays', motif: '🌤️' },
    k_hoshikiri: { name: '流星斬り', slash: 'random', ov: 'meteor', stamp: '星', line: '流れ星に、願う前に斬る', pat: 'stars', motif: '🌠' },
    k_ryuuga: { name: '龍牙・天昇', slash: 'spiral', ov: 'golddragon', stamp: '龍', line: '牙は、天まで届く', pat: 'flames', motif: '🐉' },
    k_gekkou: { name: '月光・無音斬', slash: 'triple', ov: 'moon', stamp: '月', line: '音もなく、月が満ちる', pat: 'stars', motif: '🌙' },
    k_kamigoroshi: { name: '神殺し・終焉', slash: 'omega', ov: 'chaos', stamp: '殺', line: '神も、菌も、等しく斬る', pat: 'cosmic', motif: '☠️' },
    k_shinra: { name: '森羅万象・次元斬', slash: 'omega', ov: 'rainbowblades', stamp: '森羅', line: '森も、菌も、ひとつの世界', pat: 'rays', motif: '🌈' },
    k_omega: { name: 'Ω・次元終斬', slash: 'omega', ov: 'omega', stamp: 'Ω', line: '一千万回に一度の、終わりの一太刀', pat: 'cosmic', motif: '💠' },
  };
  // need: ゲージ（1太刀+1、芯+1、会心+2）、mult: 1太刀の何倍で画面の菌を全部斬るか
  const OUGI_TIER = { SSR: { need: 40, mult: 6 }, UR: { need: 34, mult: 9 }, LR: { need: 30, mult: 13 }, EX: { need: 26, mult: 18 }, MYTH: { need: 22, mult: 26 }, GOD: { need: 18, mult: 38 }, OMEGA: { need: 14, mult: 60 } };

  // 一振りで何体斬ったか（一閃）の呼び名
  const ISSEN_NAME = ['', '', '二枚おろし', '三段斬り', '四方斬り', '五月雨斬り', '六道斬り', '七星斬り', '八岐斬り', '九頭龍閃', '十文字・十連斬'];
  const issenName = (n) => (n < ISSEN_NAME.length ? ISSEN_NAME[n] : n >= 30 ? '無双・千本斬り' : n >= 20 ? '百花繚乱' : '乱れ斬り・' + n + '連');
  // 連斬の節目（○人斬り）
  const COMBO_MS = [[10, '十人斬り'], [30, '三十人斬り'], [50, '五十人斬り'], [100, '百人斬り!!'], [200, '二百人斬り!!'], [300, '三百人斬り!!!'], [500, '五百人斬り!!!'], [1000, '千人斬り!!!!'], [2000, '二千人斬り!!!!'], [5000, '五千人斬り!!!!!']];
  // 斬ったときに出る文字
  const KILL_WORDS = ['斬', '断', '裂', '滅', '殺菌', '討', '両断', '撃破'];

  // ---------------------------------------------------------------- 実績・ミッション（D.ACH / D.MISSIONS に足す）
  const freshStats = () => ({
    gSlices: 0, gKills: 0, gBestIssen: 0, gMaxCombo: 0, gBosses: 0, gOutbreaks: 0, gGoldens: 0, gRainbows: 0,
    gCores: 0, gCrits: 0, gOugi: 0, gRolls: 0, gRareRolls: 0, gBestWave: 1, gSplits: 0, gElites: 0, gTime: 0,
    gDnaAll: 0, gVisits: 0, gIssen5: 0, gDeflects: 0, gCellKills: 0, gFactorAll: 0, gGotUR: 0, gGotLR: 0,
    gGotEX: 0, gGotMYTH: 0, gGotGOD: 0, gGotOMEGA: 0, gBestKat: 0, gMutBuys: 0,
  });
  const freshGerm = () => ({
    dna: 0, factor: 0, wave: 1, maxWave: 1, wkills: 0, farming: false,
    upg: {}, cells: {}, muts: {}, kat: {}, keq: null, kgLv: 1, kgXp: 0, ougiSeen: {},
  });

  function addAch(ACH) {
    const st = (S, k) => S.stats[k] || 0;
    const a = (id, icon, name, desc, check, gems) => ACH.push({ id, icon, name, desc, check, gems, germ: true });
    a('gOpen', '🧫', '菌斬り次元', '菌斬り次元に入る', (S) => st(S, 'gVisits') >= 1, 30);
    [[10, '殺菌デビュー'], [100, '除菌中'], [1000, '除菌率99%'], [1e4, '除菌率99.9%'], [1e5, '除菌率99.99%'], [1e6, '無菌の世界']].forEach(([n, nm], i) =>
      a('gk' + i, '🦠', nm, `菌を${n.toLocaleString()}体斬る`, (S) => st(S, 'gKills') >= n, [10, 20, 40, 80, 150, 300][i]));
    [[100, '刀の素振り'], [1e4, '刀の鬼'], [1e5, '千刃'], [1e6, '万刃']].forEach(([n, nm], i) =>
      a('gs' + i, '🗡️', nm, `刀を${n.toLocaleString()}回振る`, (S) => st(S, 'gSlices') >= n, [10, 40, 100, 250][i]));
    [[2, '二枚おろし'], [3, '三段斬り'], [5, '五月雨斬り'], [8, '八岐斬り'], [10, '十連斬'], [15, '乱れ斬り十五'], [20, '百花繚乱'], [30, '無双']].forEach(([n, nm], i) =>
      a('gi' + i, '⚡', nm, `一振りで菌を${n}体斬る`, (S) => st(S, 'gBestIssen') >= n, [10, 20, 40, 80, 120, 200, 300, 500][i]));
    [[10, '十人斬り'], [50, '五十人斬り'], [100, '百人斬り'], [300, '三百人斬り'], [1000, '千人斬り']].forEach(([n, nm], i) =>
      a('gc' + i, '🔥', nm, `連斬${n}を達成`, (S) => st(S, 'gMaxCombo') >= n, [10, 30, 60, 150, 400][i]));
    [10, 20, 30, 50, 75, 100, 150, 200, 300].forEach((n, i) =>
      a('gw' + i, '🧪', `ウェーブ${n}`, `菌斬り次元のウェーブ${n}に到達`, (S) => st(S, 'gBestWave') >= n, 20 + i * 20));
    [[1, '病原体討伐'], [10, '病原体ハンター'], [50, 'パンデミック阻止']].forEach(([n, nm], i) =>
      a('gb' + i, '👑', nm, `ボス病原体を${n}体倒す`, (S) => st(S, 'gBosses') >= n, [30, 100, 300][i]));
    [[1, 'アウトブレイク'], [10, '大発生の常連'], [50, '感染爆発マスター']].forEach(([n, nm], i) =>
      a('go' + i, '☣️', nm, `大発生を${n}回むかえる`, (S) => st(S, 'gOutbreaks') >= n, [20, 60, 150][i]));
    [[1, '黄金菌'], [25, '黄金菌ハンター'], [100, '金の亡者']].forEach(([n, nm], i) =>
      a('gg' + i, '✨', nm, `黄金菌を${n}体斬る`, (S) => st(S, 'gGoldens') >= n, [20, 80, 200][i]));
    [[1, '虹色菌'], [10, '虹の殺菌者']].forEach(([n, nm], i) =>
      a('gr' + i, '🌈', nm, `虹色菌を${n}体斬る`, (S) => st(S, 'gRainbows') >= n, [80, 300][i]));
    [[100, '芯を捉えた'], [1000, '芯の達人'], [1e4, '芯の極み']].forEach(([n, nm], i) =>
      a('gcore' + i, '🎯', nm, `芯を${n.toLocaleString()}回斬る`, (S) => st(S, 'gCores') >= n, [15, 50, 150][i]));
    [[1, '奥義開眼'], [50, '奥義の使い手'], [500, '奥義の極み']].forEach(([n, nm], i) =>
      a('gu' + i, '💥', nm, `刀の奥義を${n}回出す`, (S) => st(S, 'gOugi') >= n, [20, 80, 250][i]));
    a('guAll', '📜', '奥義皆伝', `${Object.keys(OUGI).length}種類すべての奥義を見る`, (S) => Object.keys((S.germ && S.germ.ougiSeen) || {}).length >= Object.keys(OUGI).length, 800);
    const kinds = (S) => Object.keys((S.germ && S.germ.kat) || {}).length;
    [[10, '刀コレクター'], [25, '刀剣マニア'], [KATANAS.length, '刀剣コンプリート']].forEach(([n, nm], i) =>
      a('gkat' + i, '⚔️', nm, `刀を${n}種類集める`, (S) => kinds(S) >= n, [30, 120, 1000][i]));
    ['UR', 'LR', 'EX', 'MYTH', 'GOD', 'OMEGA'].forEach((r, i) =>
      a('gget' + r, '🌟', `${r === 'OMEGA' ? 'Ω' : r}の刀`, `刀ガチャで${r === 'OMEGA' ? 'Ω' : r}を引く`, (S) => st(S, 'gGot' + r) >= 1, [20, 50, 120, 300, 800, 2000][i]));
    [[1000, '刀ガチャ千回'], [1e5, '刀ガチャ十万回'], [1e7, '刀ガチャ一千万回']].forEach(([n, nm], i) =>
      a('groll' + i, '🎰', nm, `刀ガチャを${n.toLocaleString()}回まわす`, (S) => st(S, 'gRolls') >= n, [20, 80, 300][i]));
    CELLS.forEach((c, i) => a('gcell_' + c.id, c.icon, `${c.name}の仲間`, `${c.name}を仲間にする`, (S) => ((S.germ && S.germ.cells[c.id]) || 0) >= 1, 5 + i * 5));
    [[1, 'はじめての変異'], [10, '突然変異体'], [50, '進化の果て']].forEach(([n, nm], i) =>
      a('gm' + i, '🧬', nm, `変異を${n}回強化する`, (S) => st(S, 'gMutBuys') >= n, [20, 80, 250][i]));
    [[1e3, '千'], [1e6, '百万'], [1e9, '十億'], [1e12, '一兆'], [1e16, '一京'], [1e20, '一垓'], [1e28, '一穣']].forEach(([n, nm], i) =>
      a('gd' + i, '🧬', `DNA${nm}`, `累計DNA ${nm} に到達`, (S) => st(S, 'gDnaAll') >= n, 10 + i * 20));
    [[1, '分裂を斬る'], [100, '分裂の連鎖']].forEach(([n, nm], i) =>
      a('gsp' + i, '🫧', nm, `分裂した菌を${n}体斬る`, (S) => st(S, 'gSplits') >= n, [15, 60][i]));
    a('gdef', '🛡️', 'カキン！', '装甲菌に刀を弾かれる', (S) => st(S, 'gDeflects') >= 1, 10);
    a('gcell1k', '🛡️', '免疫の勝利', '免疫細胞で菌を1000体倒す', (S) => st(S, 'gCellKills') >= 1000, 60);
    [[600, '10分間の殺菌'], [3600, '1時間の殺菌']].forEach(([n, nm], i) =>
      a('gt' + i, '⏱️', nm, `菌斬り次元で${n / 60}分過ごす`, (S) => st(S, 'gTime') >= n, [30, 100][i]));
  }
  const MISSIONS = [
    { t: 'gKills', stat: 'gKills', base: 60, grow: 1.2, germ: true, text: (n) => `菌斬り次元で菌を${n}体斬る` },
    { t: 'gSlices', stat: 'gSlices', base: 150, grow: 1.2, germ: true, text: (n) => `刀を${n}回振る` },
    { t: 'gIssen5', stat: 'gIssen5', base: 3, grow: 1.12, germ: true, text: (n) => `一振りで5体以上を${n}回斬る` },
    { t: 'gCores', stat: 'gCores', base: 25, grow: 1.18, germ: true, text: (n) => `芯を${n}回斬る` },
    { t: 'gBosses', stat: 'gBosses', base: 1, grow: 1.04, germ: true, text: (n) => `ボス病原体を${n}体倒す` },
    { t: 'gOugi', stat: 'gOugi', base: 2, grow: 1.1, germ: true, text: (n) => `刀の奥義を${n}回出す` },
    { t: 'gRolls', stat: 'gRolls', base: 400, grow: 1.25, germ: true, text: (n) => `刀ガチャを${n}回まわす` },
  ];

  return {
    CFG, TYPES, VARIANTS, BOSSES, BIOMES, UPGRADES, UPG_CATS, CELLS, MILESTONES, MUTATIONS, KATANAS, KSP_TEXT,
    OUGI, OUGI_TIER, ISSEN_NAME, issenName, COMBO_MS, KILL_WORDS, MISSIONS, freshStats, freshGerm, addAch,
  };
})();

// 実績とミッションは森と同じ一覧に足す（実績の数は両方の世界の全ダメージに効く）
if (typeof D !== 'undefined') {
  GD.addAch(D.ACH);
  for (const m of GD.MISSIONS) D.MISSIONS.push(m);
}
if (typeof module !== 'undefined') module.exports = { GD };
