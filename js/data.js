'use strict';
// =====================================================================
//  data.js — ゲームデータ定義（数値バランスはここに集約）
// =====================================================================
const D = (() => {
  const CFG = {
    TREES_PER_STAGE: 15, // 1ステージの本数（次の木がすぐ生えるので多めに斬らせる）
    BOSS_EVERY: 10,
    BOSS_TIME: 30,
    BOSS_HP_MULT: 8,
    HP_BASE: 10,
    HP_G1: 1.65, // ステージ毎のHP成長率（〜SW）
    HP_G2: 1.25, // SW以降
    HP_SW: 100,
    REWARD_PER_HP: 0.5,
    REWARD_DECAY: 0.985, // ステージが進むほど HP あたりの報酬が減る（インフレの暴走止め）
    RESPAWN: 0.16, // 倒してから次の木が生えるまで（秒）。間を空けずにザクザク斬り続けられるように短く
    RESPAWN_FAST: 0.1, // 生えてすぐ倒したとき・斬撃の余りが次の木に入るとき
    RESPAWN_SLOW: 0.8, // ボスが出る前・ボスに逃げられた後は一呼吸おく
    CARRY_MAX: 5, // 斬撃の余りで続けて倒せる木の数（一振りで最大5本）
    CARRY_DELAY: 0.12, // 次の木が生えてから余りの斬撃が入るまで
    COST_GROWTH: 1.15,
    COMBO_WINDOW: 0.9,
    COMBO_PCT: 0.005, // 1コンボ毎に全ダメージ+0.5%（木こりにも乗る）
    COMBO_CAP: 100,
    FEVER_NEED: 200,
    FEVER_TIME: 8,
    FEVER_MULT: 3,
    CRIT_BASE: 0.05,
    CRIT_MULT: 3,
    SOUL_BASE: 0.02, // 斬撃に木こりDPSの2%を上乗せ
    // --- 斬撃（斧をドラッグして幹を横切る）
    SPEED_TIERS: [1.2, 2.5, 4.5, 7, 10], // 振る速さのしきい値（シーン短辺/秒）。超えた数がランク
    SPEED_BONUS: [-0.5, 0, 0.3, 0.7, 1.2, 2], // ランク0..5 の倍率-1（プラス分は剛腕スイングで伸びる）
    SPEED_LABEL: ['ソフト…', 'NICE', 'GOOD!', 'GREAT!!', 'EXCELLENT!!!', 'MAX SPEED!!!!'],
    TAP_MULT: 0.4, // ドラッグせずタップしただけの一振り
    JUST_ZONE: 0.08, // JUST判定の半幅（幹の高さに対する比）
    JUST_MULT: 1.6,
    GEM_DROP: 0.002,
    CHEST_DROP: 0.002,
    SQUIRREL_MIN: 60,
    SQUIRREL_MAX: 150,
    SQUIRREL_LIFE: 13,
    GODDESS_RATE: 0.14,
    OFFLINE_BASE: 0.5,
    OFFLINE_CAP_H: 24,
    SLEEP_H: 6,
    SLEEP_BONUS: 1.5,
    GACHA_1: 50,
    GACHA_10: 450,
    PITY: 50,
    AXE_MAX_LV: 10,
    ACH_BONUS: 0.01,
    SPIRIT_BONUS: 0.1,
    PRESTIGE_MIN_STAGE: 25,
    STUDY_MULT: 2,
    // --- ドーパミン追加分
    LEVEL_BONUS: 0.02, // 伐採レベル1ごとに全ダメージ+2%
    GOLDEN_CHANCE: 0.012, // 1撃ごとにゴールデンタイム突入
    GOLDEN_TIME: 5,
    GOLDEN_RATE: 0.3, // ゴールデン中、1撃ごとに木1本の30%ぶんの木材
    ROULETTE_CHANCE: 0.12, // 倒した瞬間にボーナスルーレット
    ROULETTE_DELAY: 1.1,
    FREE_PULL_MIN: 8, // 無料ガチャの間隔（分）
    PICKUP_SHARE: 0.5, // ピックアップ斧と同じレアを引いたとき、ピックアップが出る割合
    SPEEDS: [1, 2, 3], // 倍速モード
    SPEED3_STAGE: 30, // 3倍速の解放ステージ
  };

  // ---------------------------------------------------------------- 木こり軍団（自動DPS）
  const WORKERS = [
    { id: 'w1', icon: '🧒', name: '見習い木こり', desc: '斧の持ち方から勉強中。', cost: 15, dps: 0.3 },
    { id: 'w2', icon: '🧔', name: 'ベテラン木こり', desc: 'この道40年。腰が強い。', cost: 110, dps: 2 },
    { id: 'w3', icon: '🦫', name: 'ビーバー隊', desc: '前歯がチェーンソー級。', cost: 1200, dps: 14 },
    { id: 'w4', icon: '🪚', name: 'チェーンソー兄貴', desc: 'ブォンブォンうるさい。', cost: 1.3e4, dps: 85 },
    { id: 'w5', icon: '🐻', name: '怪力グマ', desc: '素手で幹をへし折る。', cost: 1.5e5, dps: 480 },
    { id: 'w6', icon: '🤖', name: '伐採ロボ KIKORI-01', desc: '24時間稼働。眠らない（キミは寝ろ）。', cost: 1.9e6, dps: 2800 },
    { id: 'w7', icon: '🚜', name: '森林重機ハーベスタ', desc: '伐って枝払って丸太にするまで3秒。', cost: 2.8e7, dps: 1.8e4 },
    { id: 'w8', icon: '🐉', name: '木喰いドラゴン', desc: '主食は樹齢千年の大木。', cost: 4.5e8, dps: 1.25e5 },
    { id: 'w9', icon: '🧙', name: '森の大魔導士', desc: '伐採魔法《ティンバー》を詠唱する。', cost: 8e9, dps: 9e5 },
    { id: 'w10', icon: '🛸', name: '宇宙伐採船', desc: '軌道上からレーザーで伐る。', cost: 1.6e11, dps: 7e6 },
    { id: 'w11', icon: '⏳', name: '時空の木こり', desc: '過去と未来の木もまとめて伐る。', cost: 3.5e12, dps: 5.5e7 },
    { id: 'w12', icon: '🌀', name: '異次元チェーンソー', desc: '次元の裂け目ごと切断。', cost: 9e13, dps: 4.6e8 },
    { id: 'w13', icon: '🌌', name: '銀河伐採機構', desc: '銀河中の森を一括管理。', cost: 2.6e15, dps: 4e9 },
    { id: 'w14', icon: '♾️', name: '概念の斧', desc: '「木」という概念ごと伐る。', cost: 9e16, dps: 4e10 },
  ];
  // 所持数マイルストーン [所持数, 倍率]
  const MILESTONES = [[25, 2], [50, 2], [100, 2], [150, 2], [200, 2], [250, 2], [300, 2], [400, 2], [500, 3],
    [750, 3], [1000, 5]];

  // ---------------------------------------------------------------- 強化
  const UPGRADES = [
    // --- 斬撃（メインの気持ちよさ。レベルを上げるほど演出も派手になる）
    { id: 'tap', cat: 'slash', icon: '🪓', name: '斧研ぎ', desc: '斬撃の基礎ダメージUP（25Lvごとに2倍）', base: 20, growth: 1.22, max: 200 },
    { id: 'swing', cat: 'slash', icon: '🌪️', name: '剛腕スイング', desc: '速く振ったときのボーナス +15%。軌跡が派手になる', base: 300, growth: 2.6, max: 50 },
    { id: 'just', cat: 'slash', icon: '🎯', name: '見切り', desc: 'JUSTの判定幅と倍率UP。連続JUSTの上限UP', base: 800, growth: 2.8, max: 40 },
    { id: 'echo', cat: 'slash', icon: '👥', name: '残像斬り', desc: '斬撃の残像が追撃する確率 +2%（15Lvごとに残像+1）', base: 8000, growth: 3.2, max: 40 },
    { id: 'thunder', cat: 'slash', icon: '⚡', name: '雷神の加護', desc: '斬るたびに落雷が落ちる確率UP（15Lvごとに雷+1）', base: 8e4, growth: 3.8, max: 30 },
    { id: 'blast', cat: 'slash', icon: '☄️', name: '爆裂斬', desc: 'コンボ中、一定回数ごとに大爆発（Lvで間隔短縮・威力UP）', base: 4e5, growth: 4.2, max: 30 },
    { id: 'critc', cat: 'slash', icon: '🎲', name: '会心の心得', desc: 'クリティカル率 +1%', base: 250, growth: 2.3, max: 25 },
    { id: 'critm', cat: 'slash', icon: '💥', name: '会心の一撃', desc: 'クリティカル倍率 +0.25', base: 1000, growth: 2.4, max: 28 },
    // --- コンボ・フィーバー
    { id: 'combo', cat: 'combo', icon: '⏱️', name: 'コンボ維持', desc: 'コンボ受付時間 +0.1秒', base: 600, growth: 2.8, max: 12 },
    { id: 'combocap', cat: 'combo', icon: '🔥', name: 'コンボ上限', desc: 'コンボ倍率の上限 +50コンボ', base: 2000, growth: 3, max: 18 },
    { id: 'fever', cat: 'combo', icon: '🌈', name: 'フィーバー強化', desc: 'フィーバー倍率 +0.5・時間 +0.25秒', base: 5000, growth: 3.2, max: 20 },
    // --- 木こり・経済
    { id: 'soul', cat: 'econ', icon: '👊', name: '木こり魂', desc: '斬撃に木こりDPSの+0.5%を上乗せ', base: 500, growth: 2.6, max: 40 },
    { id: 'guild', cat: 'econ', icon: '🏭', name: '木こり組合', desc: '木こり全員のDPS ×1.3', base: 5e4, growth: 12, max: 30 },
    { id: 'market', cat: 'econ', icon: '💰', name: '木材市場', desc: '伐採報酬 ×1.2', base: 3e4, growth: 12, max: 30 },
    // --- 運・その他
    { id: 'squirrel', cat: 'luck', icon: '🐿️', name: 'リスの好物', desc: '黄金リスの出現間隔 -8%', base: 4000, growth: 5.5, max: 10 },
    { id: 'gem', cat: 'luck', icon: '💎', name: 'ジェム鉱脈', desc: 'ジェムドロップ率 +0.5%', base: 9000, growth: 5.5, max: 20 },
    { id: 'rare', cat: 'luck', icon: '🍀', name: 'レア木の加護', desc: 'レア木の出現率 +15%', base: 1.2e4, growth: 5, max: 20 },
    { id: 'chest', cat: 'luck', icon: '📦', name: '宝箱センサー', desc: '宝箱ドロップ率 +0.4%', base: 2e4, growth: 5.5, max: 15 },
    { id: 'night', cat: 'luck', icon: '🌙', name: '夜勤手当', desc: 'オフライン効率 +5%', base: 1e4, growth: 6.5, max: 10 },
  ];

  // ---------------------------------------------------------------- 斧（ガチャ）
  const RARITY = {
    N: { rate: 0.50, tap: 1.2, pas: 0.01, col: '#b9c3cf', gem: 2 },
    R: { rate: 0.30, tap: 1.5, pas: 0.02, col: '#4fb4ff', gem: 4 },
    SR: { rate: 0.145, tap: 2, pas: 0.05, col: '#c46bff', gem: 10 },
    SSR: { rate: 0.045, tap: 3, pas: 0.15, col: '#ffcc33', gem: 40 },
    UR: { rate: 0.008, tap: 5, pas: 0.4, col: '#ff4d8d', gem: 120 },
    LR: { rate: 0.001, tap: 10, pas: 1.2, col: '#ffffff', gem: 400 },
    EX: { rate: 0.001, tap: 16, pas: 2, col: '#ff2a6a', gem: 800 },
  };
  const RARITY_ORDER = ['N', 'R', 'SR', 'SSR', 'UR', 'LR', 'EX'];
  // blade: [明, 暗], handle, glow
  const AXES = [
    { id: 'a_rusty', r: 'N', name: '錆びた斧', desc: '物置の奥で眠っていた。', blade: ['#c98b5a', '#7a4a2a'], handle: '#6b4a2f' },
    { id: 'a_stone', r: 'N', name: '石斧', desc: '原始の力。', blade: ['#a9a9a9', '#5f5f5f'], handle: '#7a5533' },
    { id: 'a_maki', r: 'N', name: '薪割り斧', desc: 'じいちゃんの愛用品。', blade: ['#d7dde3', '#7f8b96'], handle: '#9a6a3a' },
    { id: 'a_hand', r: 'N', name: '手斧', desc: '片手でサクッと。', blade: ['#e3e7ea', '#8d99a3'], handle: '#3f3f46' },
    { id: 'a_toy', r: 'N', name: 'ピコピコ斧', desc: 'ピコッ。', blade: ['#ff8fc8', '#e0438f'], handle: '#ffd84a' },
    { id: 'a_iron', r: 'R', name: '鉄の斧', desc: 'ずっしり重い。', blade: ['#dfe6ee', '#6f7c8a'], handle: '#5a3a22' },
    { id: 'a_steel', r: 'R', name: '鋼の斧', desc: '刃こぼれ知らず。', blade: ['#f2f7ff', '#8aa0bd'], handle: '#2c2f3a' },
    { id: 'a_double', r: 'R', name: '両刃の斧', desc: '行きも帰りも伐る。', blade: ['#eef2f6', '#7d8894'], handle: '#6a4428', double: true },
    { id: 'a_throw', r: 'R', name: '投げ斧', desc: '投げても戻ってくる。', blade: ['#b8f0d0', '#3aa86a'], handle: '#4a3020', sp: { combo: 0.1 } },
    { id: 'a_fire', r: 'R', name: '消防斧', desc: '真っ赤なヤツ。', blade: ['#ff6a5a', '#b5241a'], handle: '#222222' },
    { id: 'a_silver', r: 'SR', name: '銀の斧', desc: '泉の女神の落とし物。', blade: ['#ffffff', '#a9b8c8'], handle: '#cfd8e3', sp: { reward: 0.25 } },
    { id: 'a_flame', r: 'SR', name: '炎の斧', desc: '伐った木が燃える。', blade: ['#ffd15a', '#ff4a1a'], handle: '#3a1a10', sp: { critm: 1 }, glow: '#ff7a2a' },
    { id: 'a_ice', r: 'SR', name: '氷の斧', desc: '時間が止まって見える。', blade: ['#e8fbff', '#59c8ff'], handle: '#2a4a6a', sp: { combo: 0.3 }, glow: '#7fe0ff' },
    { id: 'a_thunder', r: 'SR', name: '雷の斧', desc: 'ピシャーン。', blade: ['#fff6a8', '#ffb800'], handle: '#2a2a40', sp: { critc: 0.02 }, glow: '#ffe14a' },
    { id: 'a_wind', r: 'SR', name: '風の斧', desc: '振るだけで木こりが加速。', blade: ['#d8ffe8', '#3ad08a'], handle: '#2a5a40', sp: { dps: 0.3 }, glow: '#6affb0' },
    { id: 'a_gold', r: 'SSR', name: '金の斧', desc: '正直者だけが持てる。', blade: ['#fff2a8', '#e0a000'], handle: '#ffe08a', sp: { reward: 0.6 }, glow: '#ffd84a' },
    { id: 'a_dragon', r: 'SSR', name: '竜殺しの斧', desc: 'ボス特効。', blade: ['#ffb3a8', '#b3001b'], handle: '#2a0a0a', sp: { boss: 1 }, glow: '#ff3a3a', double: true },
    { id: 'a_star', r: 'SSR', name: '星砕きの斧', desc: '会心の一撃が星をも砕く。', blade: ['#fff8d0', '#7a5aff'], handle: '#1a1440', sp: { critm: 2 }, glow: '#b39aff' },
    { id: 'a_kikui', r: 'SSR', name: '妖斧「木喰」', desc: '血のように赤い木目。', blade: ['#ff9ad0', '#7a0040'], handle: '#1a0010', sp: { fever: 2 }, glow: '#ff3a9a' },
    { id: 'a_ygg', r: 'SSR', name: '世界樹の枝斧', desc: '枝なのに鉄より硬い。', blade: ['#c8ffb0', '#2a9a3a'], handle: '#6a4a20', sp: { gem: 0.005 }, glow: '#7aff6a' },
    { id: 'a_ragna', r: 'UR', name: '神斧ラグナロク', desc: '世界の終わりを伐り拓く。', blade: ['#ffffff', '#ff4d8d'], handle: '#2a0a2a', sp: { all: 0.5 }, glow: '#ff6aa8', double: true },
    { id: 'a_void', r: 'UR', name: '虚空斧ヴォイド', desc: '刃が見えない。', blade: ['#c0a0ff', '#10002a'], handle: '#000000', sp: { critc: 0.05 }, glow: '#a06aff' },
    { id: 'a_chrono', r: 'UR', name: '時空斧クロノス', desc: 'フィーバーの時が止まる。', blade: ['#a8fff0', '#008a8a'], handle: '#3a2a10', sp: { fever: 3, combo: 0.3 }, glow: '#4affe0' },
    { id: 'a_shinra', r: 'LR', name: '森羅万象断ち', desc: 'この世のすべてを伐る。', blade: ['#ffffff', '#ffcf3a'], handle: '#ffffff', sp: { all: 1 }, glow: 'rainbow', double: true },
    { id: 'a_inf', r: 'LR', name: '∞斧インフィニティ', desc: '会心が止まらない。', blade: ['#ffffff', '#3affd0'], handle: '#101010', sp: { critm: 5, critc: 0.08 }, glow: 'rainbow' },
    // --- 幻想の斧（現実には存在しない斧。1本ずつ専用の3Dモデルと斬撃演出がある）
    { id: 'x_tuna', r: 'R', fantasy: true, model: 'tuna', fx: 'splash', name: '冷凍マグロ', desc: 'カッチカチに凍った本マグロ。なぜか木が伐れる。', blade: ['#dfe7f0', '#1d2d50'], handle: '#23365e', glow: '#9fd8ff', sp: { reward: 0.15 } },
    { id: 'x_candy', r: 'R', fantasy: true, model: 'candy', fx: 'candy', name: 'ペロペロキャンディ斧', desc: 'あまい。とにかくあまい。うず巻きが回る。', blade: ['#ffd6ec', '#ff4fa8'], handle: '#fffaf2', glow: '#ff8fd0', sp: { combo: 0.15 } },
    { id: 'x_pixel', r: 'SR', fantasy: true, model: 'pixel', fx: 'pixel', name: 'ドット斧', desc: '8bitの世界から来た。当たり判定は四角い。', blade: ['#ffffff', '#6c7890'], handle: '#b0702e', glow: '#7aff6a', sp: { critc: 0.03 } },
    { id: 'x_beam', r: 'SR', fantasy: true, model: 'beam', fx: 'beam', name: 'ビームアックス', desc: '刃が光でできている。ブォン。', blade: ['#f4ffff', '#18c8ff'], handle: '#2b3140', glow: '#3ae0ff', sp: { speed: 0.3 } },
    { id: 'x_sakura', r: 'SR', fantasy: true, model: 'sakura', fx: 'petal', name: '桜吹雪の斧', desc: '振るたびに花びらが舞う。春は無敵。', blade: ['#fff0f7', '#ff6aae'], handle: '#2a1018', glow: '#ff9ad0', sp: { golden: 0.5 } },
    { id: 'x_luna', r: 'SSR', fantasy: true, model: 'crescent', fx: 'moon', name: '三日月斧ルナ', desc: '月の欠けた部分で伐る。JUSTが広がる。', blade: ['#ffffff', '#7f9ce0'], handle: '#1a2348', glow: '#a8c8ff', sp: { just: 0.25, critm: 1 } },
    { id: 'x_crystal', r: 'SSR', fantasy: true, model: 'crystal', fx: 'crystal', name: '水晶斧クリスタリア', desc: '結晶が勝手に伸びて刃になった。', blade: ['#e8fdff', '#2ac8ff'], handle: '#c8d4e4', glow: '#7fe8ff', sp: { critm: 2.5 } },
    { id: 'x_gear', r: 'SSR', fantasy: true, model: 'gear', fx: 'gear', name: '歯車斧クロックワーク', desc: '回るほど速く伐れる機械仕掛け。', blade: ['#ffe0a0', '#b07a20'], handle: '#4a2c18', glow: '#ffd27a', sp: { dps: 0.6 } },
    { id: 'x_seraph', r: 'SSR', fantasy: true, model: 'wing', fx: 'feather', name: '天翼斧セラフィム', desc: '天使の翼でできている。幸運を呼ぶ。', blade: ['#fffaf0', '#ffd977'], handle: '#f6f1e6', glow: '#fff2b0', sp: { roul: 0.6 } },
    { id: 'x_galaxy', r: 'UR', fantasy: true, model: 'galaxy', fx: 'galaxy', name: '銀河斧ギャラクシア', desc: '刃の中で銀河が回っている。', blade: ['#e0d0ff', '#3a1a8a'], handle: '#1c1442', glow: '#9a7aff', sp: { all: 0.6, gem: 0.004 } },
    { id: 'x_kera', r: 'UR', fantasy: true, model: 'bolt', fx: 'bolt', name: '雷霆斧ケラウノス', desc: '神話の雷を斧の形に固めた。斬るたびに落雷。', blade: ['#fff7b8', '#ffb800'], handle: '#2a2a3a', glow: '#ffe14a', sp: { thunder: 0.15, all: 0.3 } },
    { id: 'x_volca', r: 'UR', fantasy: true, model: 'dragon', fx: 'fire', name: '焔竜斧ヴォルカ', desc: '竜の頭そのもの。ボスを噛み砕く。', blade: ['#ff8a5a', '#7a0610'], handle: '#1a0808', glow: '#ff5a1a', sp: { boss: 1.5, critm: 2 } },
    { id: 'x_horizon', r: 'LR', fantasy: true, model: 'blackhole', fx: 'void', name: '黒穴斧ホライゾン', desc: '刃の先に事象の地平線。木も光も吸い込む。', blade: ['#ffd08a', '#1a0626'], handle: '#0d0816', glow: '#ff9a4a', sp: { all: 1, reward: 0.5 } },
    { id: 'x_phoenix', r: 'LR', fantasy: true, model: 'phoenix', fx: 'phoenix', name: '不死鳥斧フェニクス', desc: '燃え尽きても蘇る。フィーバーが終わらない。', blade: ['#fff2a0', '#ff3a12'], handle: '#d8a640', glow: '#ff7a2a', sp: { fever: 4, all: 0.8 } },
    { id: 'x_genesis', r: 'EX', fantasy: true, model: 'genesis', fx: 'genesis', name: '創世斧ジェネシス', desc: '世界を最初に伐り拓いた、はじまりの斧。', blade: ['#ffffff', '#ffd76a'], handle: '#ffffff', glow: 'rainbow', double: true, sp: { all: 2, critm: 5, golden: 1 } },
    { id: 'x_imag', r: 'EX', fantasy: true, model: 'imaginary', fx: 'glitch', name: '虚数斧イマジナリ', desc: '実在しない。でも確かに伐れる。√-1。', blade: ['#5ff4ff', '#ff3a6a'], handle: '#0a0014', glow: '#ff4fd8', double: true, sp: { all: 1.5, critc: 0.1, echo: 0.5 } },
  ];
  // 斧のシルエット（64x64、握りは下端 (32,62)）。Canvas の Path2D と SVG で共用。
  const AXE_PATHS = {
    handle: 'M29.5 9 L34.5 9 L35 59 Q35 63 32 63 Q29 63 29 59 Z',
    blade: 'M30 11 L44 9 C50 3 59 5 60 17 C61 29 52 35 46 30 L30 25 Z',
    blade2: 'M34 11 L20 9 C14 3 5 5 4 17 C3 29 12 35 18 30 L34 25 Z',
    poll: 'M30 12 L24 13 L24 23 L30 24 Z',
    edge: 'M51 5.5 C57.5 8.5 60.5 20 55 30.5',
    edge2: 'M13 5.5 C6.5 8.5 3.5 20 9 30.5',
  };
  const SP_TEXT = {
    reward: (v) => `伐採報酬 +${Math.round(v * 100)}%`,
    critm: (v) => `会心倍率 +${(Math.round(v * 10) / 10)}`,
    critc: (v) => `会心率 +${(Math.round(v * 1000) / 10)}%`,
    combo: (v) => `コンボ受付 +${(Math.round(v * 100) / 100)}秒`,
    dps: (v) => `木こりDPS +${Math.round(v * 100)}%`,
    boss: (v) => `ボスへのダメージ +${Math.round(v * 100)}%`,
    fever: (v) => `フィーバー +${(Math.round(v * 10) / 10)}秒`,
    gem: (v) => `ジェム率 +${(Math.round(v * 1000) / 10)}%`,
    all: (v) => `全ダメージ +${Math.round(v * 100)}%`,
    speed: (v) => `速さボーナス +${Math.round(v * 100)}%`,
    golden: (v) => `ゴールデン率 +${Math.round(v * 100)}%`,
    roul: (v) => `ルーレット率 +${Math.round(v * 100)}%`,
    just: (v) => `JUSTの幅 +${Math.round(v * 100)}%`,
    echo: (v) => `残像率 +${Math.round(v * 100)}%`,
    thunder: (v) => `落雷率 +${Math.round(v * 100)}%`,
  };

  // ---------------------------------------------------------------- バイオーム（10ステージ毎）
  const BIOMES = [
    { name: 'はじまりの森', sky: ['#69c6ff', '#d6f3ff'], hills: ['#8fd19b', '#5cae6c'], ground: '#4a9a52', trunk: '#7a4a2a', leaves: ['#3fae4f', '#2f8e3e', '#5cc865'], shape: 'round', amb: 'leaf', tree: 'カシの木', boss: '暴れ大樹トレントン' },
    { name: '紅葉の山', sky: ['#ff9f5a', '#ffe0b0'], hills: ['#d0784a', '#a5502e'], ground: '#8a5a32', trunk: '#5a3420', leaves: ['#ff6a2b', '#ffa21f', '#e0381e'], shape: 'round', amb: 'maple', tree: 'モミジ', boss: '紅蓮のカエデ大王' },
    { name: '白銀の雪原', sky: ['#9cbcff', '#eef4ff'], hills: ['#e3ecf8', '#c7d6ea'], ground: '#f4f7fc', trunk: '#5b4636', leaves: ['#2f6e5a', '#24584a', '#3d8a70'], shape: 'conifer', deco: 'snow', amb: 'snow', tree: 'モミの木', boss: '氷結樹フロスティア' },
    { name: '灼熱の砂漠', sky: ['#ffc45a', '#fff0c2'], hills: ['#ebbd6d', '#d39a45'], ground: '#e8c27c', trunk: '#8a6236', leaves: ['#4caf50', '#2e8b3a', '#6cc04a'], shape: 'palm', amb: 'sand', tree: 'ヤシの木', boss: '砂塵のヤシ将軍' },
    { name: '夜桜の里', sky: ['#22163f', '#7a4a8a'], hills: ['#3b2a5a', '#2a1f45'], ground: '#3a2d55', trunk: '#4a3040', leaves: ['#ffb7d5', '#ff8fbf', '#ffd6ea'], shape: 'round', amb: 'petal', tree: 'サクラ', boss: '妖桜ヨザクラ', night: true },
    { name: 'キノコの森', sky: ['#43246a', '#b06fd8'], hills: ['#5a3a7a', '#432a60'], ground: '#3a2a50', trunk: '#efe6d8', leaves: ['#e8433f', '#ff6b5a', '#c42f2b'], shape: 'mushroom', amb: 'spore', tree: 'オバケキノコ', boss: '胞子大王ポルチーニ' },
    { name: '灼炎の火山', sky: ['#2a0b0b', '#b83a1c'], hills: ['#4a1a12', '#2a0e0a'], ground: '#2a1410', trunk: '#2a1a14', leaves: ['#ff5a1f', '#ffb21f', '#ff2a1f'], shape: 'conifer', deco: 'ember', amb: 'ember', tree: 'ほのおの木', boss: '灼熱樹ボルケイノ', night: true },
    { name: '水晶の洞窟', sky: ['#0b2433', '#1f6a8a'], hills: ['#14485e', '#0e3446'], ground: '#123a4a', trunk: '#8fe8ff', leaves: ['#7af5ff', '#3ad0ff', '#c4fbff'], shape: 'crystal', amb: 'sparkle', tree: 'クリスタルツリー', boss: '水晶樹クリスタリオン', night: true },
    { name: '天空の島', sky: ['#4aa8ff', '#d4ecff'], hills: ['#ffffff', '#e3f1ff'], ground: '#9fd67a', trunk: '#c9a77a', leaves: ['#ffffff', '#eaf6ff', '#d2e8ff'], shape: 'round', deco: 'cloud', amb: 'cloud', tree: 'わたぐもの木', boss: '雲海樹ニンバス' },
    { name: '星海の宇宙', sky: ['#04030d', '#1a1440'], hills: ['#1d1a3a', '#120f28'], ground: '#1a1636', trunk: '#5a4a9a', leaves: ['#3a2a8a', '#5a3ab0', '#7a5ad0'], shape: 'round', deco: 'stars', amb: 'star', tree: '星の木', boss: '宇宙樹コスモ・ユグドラシル', night: true },
  ];

  // レア木（ボス以外）
  const TREE_RARITY = [
    { id: 'normal', name: '', mult: 1, gems: 0 },
    { id: 'silver', name: '銀の', mult: 3, gems: 0, p: 0.05 },
    { id: 'gold', name: '金の', mult: 10, gems: 1, p: 0.012 },
    { id: 'rainbow', name: '虹の', mult: 50, gems: 5, p: 0.002 },
  ];

  // ---------------------------------------------------------------- 黄金リスの効果
  const SQUIRREL_FX = [
    { id: 'frenzy', w: 30, icon: '🔥', name: '狂乱', text: '全ダメージ ×7（30秒）' },
    { id: 'click', w: 16, icon: '👆', name: '連打狂乱', text: '斬撃 ×77（12秒）' },
    { id: 'lucky', w: 28, icon: '🍀', name: 'ラッキー', text: '大量の木材をゲット' },
    { id: 'gems', w: 12, icon: '💎', name: 'ジェムの雨', text: 'ジェムが降ってきた' },
    { id: 'fever', w: 10, icon: '🌈', name: '即フィーバー', text: 'いきなりフィーバー突入' },
    { id: 'chest', w: 8, icon: '📦', name: '宝箱', text: '宝箱×2をゲット' },
    { id: 'jackpot', w: 1.5, icon: '🎰', name: '大当たり', text: '斬撃 ×777（7秒）＋💎77' },
  ];

  // ---------------------------------------------------------------- ボーナスルーレット・連続伐採・実況
  const ROULETTE = [{ m: 2, w: 50 }, { m: 3, w: 25 }, { m: 5, w: 15 }, { m: 10, w: 8 }, { m: 100, w: 1 }];
  const STREAK_MS = [[10, 5, 0], [25, 10, 1], [50, 20, 1], [100, 40, 2], [200, 80, 3], [500, 150, 5]]; // [本数, ジェム, 宝箱]
  // スタイルランク: 斬り方で上がり、時間で下がる。上がるほど画面全体・BGM・報酬が変わる
  const STYLE = {
    MAX: 210, DECAY: 4, DECAY_RANK: 3, // 毎秒の減り（ランクが高いほど速く減る）
    BREAK: 0.45, // コンボが切れたら残る割合
    VARIETY: 1.25, // 直前と違う斬り方なら
    RANKS: [
      { id: 'E', th: 0, word: '', col: '#9aa6b2', mult: 1 },
      { id: 'D', th: 10, word: 'ザクッ', col: '#7fd0ff', mult: 1.03 },
      { id: 'C', th: 25, word: 'ノッてきた!', col: '#7aff8a', mult: 1.06 },
      { id: 'B', th: 45, word: 'アツい!!', col: '#ffe14a', mult: 1.1 },
      { id: 'A', th: 70, word: '止まらない!!', col: '#ff9a2a', mult: 1.15 },
      { id: 'S', th: 100, word: '神斬り!!!', col: '#ff3d8b', mult: 1.25 },
      { id: 'SS', th: 135, word: '天下無双!!!!', col: '#c46bff', mult: 1.35 },
      { id: 'SSS', th: 175, word: '森羅万象!!!!!', col: '#ffffff', mult: 1.5, rainbow: true },
    ],
  };
  const ANNOUNCE = { 10: 'NICE!', 25: 'GREAT!', 50: 'AWESOME!!', 100: 'UNSTOPPABLE!!', 200: 'GODLIKE!!!', 300: 'LEGENDARY!!!', 500: 'MYTHIC!!!!', 777: 'JACKPOT!!!!', 1000: '伐採神!!!!!', 2000: '∞' };

  // ---------------------------------------------------------------- 宝箱
  const CHESTS = [
    { id: 'wood', name: '木の宝箱', w: 60, col: '#c08a4a', sec: 120, gems: [1, 3], ticket: 0 },
    { id: 'silver', name: '銀の宝箱', w: 28, col: '#d9e4f0', sec: 480, gems: [4, 8], ticket: 0 },
    { id: 'gold', name: '金の宝箱', w: 10, col: '#ffcc33', sec: 1500, gems: [12, 25], ticket: 1 },
    { id: 'rainbow', name: '虹の宝箱', w: 2, col: '#ff6ad5', sec: 3600, gems: [50, 100], ticket: 3 },
  ];

  // ---------------------------------------------------------------- ログインボーナス（7日ループ）
  const LOGIN = [
    { gems: 100 }, { chests: 2 }, { gems: 150 }, { tickets: 1 }, { gems: 200 }, { chests: 5 }, { tickets: 10 },
  ];

  // ---------------------------------------------------------------- 転生パーク（転生回数で解放）
  const PERKS = [
    { n: 1, text: '転生後、見習い木こり×10 で再スタート' },
    { n: 2, text: 'ボス失敗後、10本伐ると自動で再挑戦' },
    { n: 3, text: '転生後、ステージ6から再スタート' },
    { n: 5, text: 'オフライン効率 +25%' },
    { n: 7, text: '転生後、ステージ16から再スタート' },
    { n: 10, text: 'ガチャ天井 50回 → 40回' },
    { n: 15, text: '転生後、ステージ31から再スタート' },
  ];

  // ---------------------------------------------------------------- ミッション
  const MISSIONS = [
    { t: 'kills', stat: 'kills', base: 30, grow: 1.2, text: (n) => `木を${n}本伐採する` },
    { t: 'taps', stat: 'taps', base: 200, grow: 1.2, text: (n) => `${n}回斬る` },
    { t: 'justs', stat: 'justs', base: 15, grow: 1.18, text: (n) => `JUSTを${n}回出す` },
    { t: 'greats', stat: 'greats', base: 20, grow: 1.18, text: (n) => `GREAT以上の速さで${n}回斬る` },
    { t: 'crits', stat: 'crits', base: 20, grow: 1.2, text: (n) => `クリティカルを${n}回出す` },
    { t: 'combo', special: 'combo', base: 60, add: 25, text: (n) => `${n}コンボを達成する` },
    { t: 'bosses', stat: 'bosses', base: 1, grow: 1.04, text: (n) => `ボスを${n}体倒す` },
    { t: 'hires', stat: 'hires', base: 10, grow: 1.18, text: (n) => `木こりを${n}人雇う` },
    { t: 'pulls', stat: 'pulls', base: 1, grow: 1.08, text: (n) => `ガチャを${n}回引く` },
    { t: 'chests', stat: 'chestsOpened', base: 1, grow: 1.06, text: (n) => `宝箱を${n}個開ける` },
    { t: 'squirrels', stat: 'squirrels', base: 1, grow: 1.02, text: (n) => `黄金リスを${n}匹捕まえる` },
    { t: 'fevers', stat: 'fevers', base: 1, grow: 1.06, text: (n) => `フィーバーを${n}回発動する` },
    { t: 'stage', special: 'stage', text: (n) => `ステージ${n}に到達する` },
    { t: 'roulettes', stat: 'roulettes', base: 2, grow: 1.08, text: (n) => `ボーナスルーレットを${n}回当てる` },
    { t: 'goldens', stat: 'goldens', base: 1, grow: 1.05, text: (n) => `ゴールデンタイムを${n}回出す` },
  ];

  // ---------------------------------------------------------------- 実績
  const ACH = [];
  function ach(id, icon, name, desc, check, gems = 10) { ACH.push({ id, icon, name, desc, check, gems }); }
  const st = (S, k) => S.stats[k] || 0;
  [[100, '連打デビュー'], [1000, '指が覚醒した'], [1e4, '指に残像'], [1e5, '指が光速'], [1e6, '指が神']].forEach(([n, nm], i) =>
    ach('tap' + i, '🪓', nm, `${n.toLocaleString()}回斬る`, (S) => st(S, 'taps') >= n, [10, 20, 40, 80, 150][i]));
  [[10, '初伐採'], [100, '森の掃除屋'], [1000, '森林破壊予備軍'], [1e4, '伐採マシーン'], [1e5, '森の天敵'], [1e6, 'ハゲ山量産']].forEach(([n, nm], i) =>
    ach('kill' + i, '🌲', nm, `木を${n.toLocaleString()}本伐採`, (S) => st(S, 'kills') >= n, [10, 20, 40, 80, 120, 200][i]));
  [[1e3, '千'], [1e6, '百万'], [1e9, '十億'], [1e12, '一兆'], [1e16, '一京'], [1e20, '一垓'], [1e28, '一穣'], [1e40, '一正'], [1e52, '恒河沙'], [1e64, '不可思議'], [1e68, '無量大数']].forEach(([n, nm], i) =>
    ach('wood' + i, '🪵', `木材${nm}`, `累計木材 ${nm} に到達`, (S) => st(S, 'woodAll') >= n, 10 + i * 15));
  [10, 20, 30, 50, 75, 100, 150, 200, 300].forEach((n, i) =>
    ach('stage' + i, '🗺️', `ステージ${n}`, `ステージ${n}に到達`, (S) => st(S, 'bestStage') >= n, 15 + i * 15));
  [[50, 'コンボ入門'], [100, '百連撃'], [300, '止まらない指'], [1000, '千手観音'], [3000, '指がもげる']].forEach(([n, nm], i) =>
    ach('combo' + i, '🔥', nm, `${n}コンボ達成`, (S) => st(S, 'maxCombo') >= n, [10, 20, 40, 80, 150][i]));
  ach('just1', '🎯', '見切った', 'JUSTを出す', (S) => st(S, 'justs') >= 1, 10);
  ach('just100', '🎯', '見切りの達人', 'JUSTを100回', (S) => st(S, 'justs') >= 100, 40);
  ach('just1000', '🗡️', '剣聖', 'JUSTを1000回', (S) => st(S, 'justs') >= 1000, 120);
  ach('chain10', '⛓️', '10連JUST', 'JUSTを10回連続で出す', (S) => st(S, 'maxChain') >= 10, 50);
  ach('chain30', '🧘', '無我の境地', 'JUSTを30回連続で出す', (S) => st(S, 'maxChain') >= 30, 150);
  ach('spd1', '💨', '音速の木こり', 'MAX SPEEDで斬る', (S) => st(S, 'maxSpeeds') >= 1, 30);
  ach('spd100', '☄️', '光速の木こり', 'MAX SPEEDで100回斬る', (S) => st(S, 'maxSpeeds') >= 100, 100);
  ach('echo1', '👥', '残像だ', '残像斬りを出す', (S) => st(S, 'echoes') >= 1, 20);
  ach('thunder1', '⚡', '落雷', '雷神の加護を発動', (S) => st(S, 'thunders') >= 1, 30);
  ach('blast1', '☄️', '爆裂デビュー', '爆裂斬を発動', (S) => st(S, 'blasts') >= 1, 40);
  ach('blast100', '☄️', '爆裂魔', '爆裂斬を100回', (S) => st(S, 'blasts') >= 100, 120);
  [5, 10, 25, 50, 100].forEach((n, i) => ach('lvl' + i, '⭐', `伐採レベル${n}`, `伐採レベル${n}に到達`, (S) => (S.lvl || 1) >= n, [10, 20, 50, 100, 200][i]));
  ach('roul10', '🎰', '10倍キター', 'ボーナスルーレットで×10', (S) => st(S, 'bestRoulette') >= 10, 30);
  ach('roul100', '💯', '100倍!!!', 'ボーナスルーレットで×100', (S) => st(S, 'bestRoulette') >= 100, 150);
  ach('roul50', '🎰', 'ルーレット中毒', 'ボーナスルーレットを50回当てる', (S) => st(S, 'roulettes') >= 50, 60);
  ach('golden1', '✨', 'ゴールデンタイム', 'ゴールデンタイムに入る', (S) => st(S, 'goldens') >= 1, 20);
  ach('golden25', '👑', '黄金の木こり', 'ゴールデンタイム25回', (S) => st(S, 'goldens') >= 25, 80);
  ach('streak25', '🔗', '25本連続', 'コンボを切らずに木を25本', (S) => st(S, 'bestStreak') >= 25, 40);
  ach('rankA', '🅰️', 'Aランク', 'スタイルランクAに到達', (S) => st(S, 'bestRank') >= 4, 20);
  ach('rankS', '💥', 'Sランク', 'スタイルランクSに到達', (S) => st(S, 'bestRank') >= 5, 50);
  ach('rankSSS', '🌈', '森羅万象', 'スタイルランクSSSに到達', (S) => st(S, 'bestRank') >= 7, 200);
  ach('multi2', '⚔️', '二本斬り', '一振りで木を2本倒す', (S) => st(S, 'bestMulti') >= 2, 15);
  ach('multi3', '🌀', '三本斬り', '一振りで木を3本倒す', (S) => st(S, 'bestMulti') >= 3, 40);
  ach('multi5', '⚡', '一閃五本', '一振りで木を5本倒す', (S) => st(S, 'bestMulti') >= 5, 120);
  ach('streak100', '🔗', '100本連続', 'コンボを切らずに木を100本', (S) => st(S, 'bestStreak') >= 100, 150);
  ach('crit0', '💥', '会心デビュー', 'クリティカルを100回', (S) => st(S, 'crits') >= 100, 10);
  ach('crit1', '💥', '会心中毒', 'クリティカルを1万回', (S) => st(S, 'crits') >= 1e4, 50);
  ach('super', '💫', 'スーパー！', 'SUPER CRITを出す', (S) => st(S, 'supers') >= 1, 15);
  ach('ultra', '🌟', 'ウルトラ！！', 'ULTRA CRITを出す', (S) => st(S, 'ultras') >= 1, 40);
  ach('god', '⚡', '神が降りた', 'GOD CRITを出す', (S) => st(S, 'gods') >= 1, 100);
  ach('god10', '⚡', '神の常連', 'GOD CRITを10回', (S) => st(S, 'gods') >= 10, 200);
  [[1, 'フィーバー！'], [10, 'フィーバー常習犯'], [100, 'ずっとフィーバー']].forEach(([n, nm], i) =>
    ach('fever' + i, '🌈', nm, `フィーバーを${n}回`, (S) => st(S, 'fevers') >= n, [10, 30, 80][i]));
  [[1, 'ボスキラー'], [10, 'ボスハンター'], [50, 'ボスの悪夢']].forEach(([n, nm], i) =>
    ach('boss' + i, '👹', nm, `ボスを${n}体撃破`, (S) => st(S, 'bosses') >= n, [20, 50, 100][i]));
  [[1, 'リス発見'], [10, 'リス使い'], [50, 'リスの王']].forEach(([n, nm], i) =>
    ach('sq' + i, '🐿️', nm, `黄金リスを${n}匹`, (S) => st(S, 'squirrels') >= n, [15, 40, 100][i]));
  [[10, 'ガチャデビュー'], [100, 'ガチャ沼'], [500, '沼の主'], [1000, '石油王']].forEach(([n, nm], i) =>
    ach('pull' + i, '🎰', nm, `ガチャを${n}回`, (S) => st(S, 'pulls') >= n, [10, 40, 100, 200][i]));
  ach('gotSSR', '✨', 'SSRキター！', 'SSRの斧を入手', (S) => st(S, 'gotSSR') >= 1, 30);
  ach('gotUR', '💖', 'URキタァァ！！', 'URの斧を入手', (S) => st(S, 'gotUR') >= 1, 80);
  ach('gotLR', '🌈', '伝説', 'LRの斧を入手', (S) => st(S, 'gotLR') >= 1, 300);
  ach('gotEX', '🌌', '幻想の向こう側', 'EXの斧を入手', (S) => st(S, 'gotEX') >= 1, 500);
  const fantasyOwned = (S) => AXES.filter((a) => a.fantasy && S.axes[a.id]).length;
  ach('fantasy1', '🐟', 'ありえない斧', '幻想の斧を1本入手', (S) => fantasyOwned(S) >= 1, 15);
  ach('fantasy5', '✨', '幻想コレクター', '幻想の斧を5本集める', (S) => fantasyOwned(S) >= 5, 60);
  ach('fantasy10', '🌠', '幻想マニア', '幻想の斧を10本集める', (S) => fantasyOwned(S) >= 10, 150);
  ach('fantasyAll', '🪐', '幻想コンプリート', '幻想の斧をすべて集める', (S) => fantasyOwned(S) >= AXES.filter((a) => a.fantasy).length, 600);
  ach('allAxes', '👑', '斧コンプリート', 'すべての斧を集める', (S) => Object.keys(S.axes).length >= AXES.length, 1000);
  ach('gold1', '🌟', '金の木', '金の木を伐採', (S) => st(S, 'gold') >= 1, 15);
  ach('rainbow1', '🌈', '虹の木', '虹の木を伐採', (S) => st(S, 'rainbow') >= 1, 50);
  ach('rainbow10', '🌈', '虹ハンター', '虹の木を10本伐採', (S) => st(S, 'rainbow') >= 10, 150);
  [[1, '開封の儀'], [50, '宝箱マニア'], [500, 'トレジャーハンター']].forEach(([n, nm], i) =>
    ach('chest' + i, '📦', nm, `宝箱を${n}個開ける`, (S) => st(S, 'chestsOpened') >= n, [10, 40, 120][i]));
  [[1, '輪廻'], [5, '転生のプロ'], [10, '悟り'], [25, '涅槃']].forEach(([n, nm], i) =>
    ach('pres' + i, '🌀', nm, `転生を${n}回`, (S) => st(S, 'prestiges') >= n, [50, 100, 200, 400][i]));
  [[10, '雇用主'], [100, '社長'], [500, '大企業'], [2000, '財閥'], [10000, '木こり帝国']].forEach(([n, nm], i) =>
    ach('hire' + i, '🏢', nm, `木こりを累計${n}人雇う`, (S) => st(S, 'hires') >= n, [10, 20, 50, 100, 200][i]));
  WORKERS.forEach((w, i) => ach('own_' + w.id, w.icon, `初めての${w.name}`, `${w.name}を雇う`, (S) => (S.workers[w.id] || 0) >= 1, 5 + i * 5));
  [[10, '依頼人'], [100, 'ミッションの鬼']].forEach(([n, nm], i) =>
    ach('mis' + i, '📜', nm, `ミッションを${n}回クリア`, (S) => st(S, 'missionsDone') >= n, [30, 150][i]));
  [[3, '三日坊主じゃない'], [7, '皆勤賞'], [30, '習慣化']].forEach(([n, nm], i) =>
    ach('login' + i, '📅', nm, `ログイン${n}日`, (S) => st(S, 'loginDays') >= n, [30, 70, 300][i]));
  ach('goddess', '⛲', '正直者', '泉の女神に正直に答える', (S) => st(S, 'goddess') >= 1, 50);
  ach('study1', '📚', '勉強もできる木こり', '勉強ブーストを完走', (S) => st(S, 'studies') >= 1, 50);
  ach('study10', '🎓', '合格する木こり', '勉強ブーストを10回完走', (S) => st(S, 'studies') >= 10, 300);
  ach('sleep1', '😴', '寝る子は育つ', '6時間以上休んで戻ってくる', (S) => st(S, 'sleeps') >= 1, 50);

  // 斬撃系の強化で解放される演出（レベル到達でバナー表示）
  const SLASH_FX = {
    swing: [[1, '光る斬撃の軌跡'], [10, '二重の軌跡'], [25, '虹色の軌跡'], [40, '炎の軌跡']],
    just: [[1, 'JUSTの衝撃波'], [10, '黄金の波紋'], [25, 'JUSTスローモーション']],
    echo: [[1, '残像 1体'], [15, '残像 2体'], [30, '残像 3体']],
    thunder: [[1, '落雷'], [15, '二連雷'], [30, '三連神雷']],
    blast: [[1, '爆裂'], [10, '大爆裂'], [20, '超新星']],
    critm: [[10, '会心の衝撃波'], [20, '会心で時が止まる']],
  };

  return { STYLE, ROULETTE, STREAK_MS, ANNOUNCE, SLASH_FX, AXE_PATHS, CFG, WORKERS, MILESTONES, UPGRADES, RARITY, RARITY_ORDER, AXES, SP_TEXT, BIOMES, TREE_RARITY, SQUIRREL_FX, CHESTS, LOGIN, PERKS, MISSIONS, ACH };
})();
