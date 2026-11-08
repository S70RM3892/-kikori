'use strict';
// =====================================================================
//  dimgen.js — 次元ポータル: 21の「界」× 10 ＝ 210 の斬る次元（＋菌斬り次元 ＝ 211）
//  ・界ごと: 敵14種（3Dの形）・武器の形・通貨・仲間・世界の名前・BGMの音階
//  ・次元ごと: ルール（重力・群体・巨体・闇夜・雷雲・鏡写…21種）と色合い
//  ・中身（株140・ボス110・世界100・武器440・奥義）は入ったときに決まった種の乱数で作る
//    （同じ次元はいつも同じ中身になるので、セーブと食い違わない）
//  ・次元の段位: 1次元に約1,600段の「はしご」。値から段数を計算するので何十万段でも軽い
//  菌斬り次元（0番）は germdata.js / germgen.js の中身そのまま。
// =====================================================================
const DM = (() => {
  if (typeof GD === 'undefined' || typeof D === 'undefined' || !D.GEN || !GD.KGEN) return null;
  const { mulberry, nice, shift } = D.GEN;
  const KG = GD.KGEN, SG = GD.SGEN;
  // 次元 i でこのウェーブに着くと、次の次元 i+1 が開く（奥ほど少し深く: 15 → 20 → … → 40）
  const UNLOCK_W = 15;
  const unlockW = (i) => UNLOCK_W + 5 * Math.floor(Math.max(0, i) / 40);

  // 菌斬り次元の中身（入れ替える前のもの）
  const BASE = {
    i: 0, TYPES: GD.TYPES, STRAINS: GD.STRAINS, STRAIN: GD.STRAIN, BOSSES: GD.BOSSES, BIOMES: GD.BIOMES,
    KATANAS: GD.KATANAS, OUGI: GD.OUGI, KSERIES: GD.KSERIES, CELLS: GD.CELLS, KILL_WORDS: GD.KILL_WORDS,
    LB: { noun: '菌', cur: 'DNA', curIcon: '🧬', wpn: '刀', ally: '免疫細胞', allyIcon: '🛡️', world: 'ミクロの世界', dim: '菌斬り次元', icon: '🧫' },
    music: null, starter: 'k_bokuto', kind: 'katana', cls: 'slash',
  };
  // 敵の強さの型（菌の14種と同じ並び: 体力・稼ぎ・速さ・大きさ・出始めるウェーブ・分裂・胞子）
  const TPL = BASE.TYPES.map((t) => ({ hp: t.hp, dna: t.dna, sp: t.sp, size: t.size, wave: t.wave, split: t.split, burst: t.burst }));

  // ------------------------------------------------------------- ルール（次元ごとに1つ）
  const GIM = {
    normal: { name: '標準', pre: '', icon: '⚪', desc: '基本のルール。まずはここで腕ならし' },
    gravity: { name: '重力', pre: '重力の', icon: '⤴️', desc: '敵が下から放り上げられて飛んでくる。落ちる前に斬れ（通貨×1.15）', toss: 0.7, dna: 1.15 },
    swarm: { name: '群体', pre: '群れなす', icon: '🐝', desc: '小さな敵が大量に湧く（数×1.8・体力×0.45）', max: 1.8, size: 0.74, hp: 0.45, dna: 0.62, gap: 0.55 },
    giant: { name: '巨体', pre: '巨大', icon: '🗿', desc: '大きな敵が少しだけ（体力×2.6・通貨×2.8）', max: 0.55, size: 1.42, hp: 2.6, dna: 2.8, sp: 0.75 },
    speed: { name: '疾風', pre: '疾風の', icon: '💨', desc: '敵がすばやい（速さ×1.7・通貨×1.35）', sp: 1.7, dna: 1.35 },
    split: { name: '分裂', pre: '分裂する', icon: '🫧', desc: '斬ると35%で2つに分かれる', splitP: 0.35, dna: 0.92 },
    bomb: { name: '爆裂', pre: '爆裂', icon: '💣', desc: '爆裂する敵が5倍。誘爆の連鎖が起きやすい', bomb: 5, chain: 0.2 },
    armor: { name: '鉄壁', pre: '鉄壁の', icon: '🛡️', desc: '装甲の敵が多い。速く振るか芯を斬れ（通貨×1.5）', armor: 0.3, dna: 1.5 },
    ghost: { name: '幽玄', pre: '幽玄の', icon: '🌫️', desc: 'ときどき透ける敵が多い（通貨×1.4）', ghost: 0.3, dna: 1.4 },
    gold: { name: '黄金', pre: '黄金の', icon: '🪙', desc: '黄金の敵とスロットが出やすい（体力×1.3）', gold: 4, lucky: 2, hp: 1.3 },
    dark: { name: '闇夜', pre: '闇夜の', icon: '🌑', desc: '刃のまわりしか見えない（通貨×1.5）', dark: 1, dna: 1.5 },
    ice: { name: '氷河', pre: '氷河の', icon: '🧊', desc: '斬ると凍りやすい。凍った敵は次の一太刀で砕ける（氷刃 +25%）', ice: 0.25 },
    storm: { name: '雷雲', pre: '雷雲の', icon: '🌩️', desc: '空から雷が落ちて、勝手に敵を撃つ', storm: 1 },
    frenzy: { name: '修羅', pre: '修羅の', icon: '👹', desc: '無双ゲージが2.5倍たまり、無双が3秒長い', musou: 2.5, musouT: 3 },
    chain: { name: '連鎖', pre: '連鎖する', icon: '⚡', desc: '雷刃が走りやすい（+20%・2体多く）', thunder: 0.2, thunderN: 2 },
    vortex: { name: '渦潮', pre: '渦巻く', icon: '🌀', desc: '敵が画面の中心をぐるぐる回る（通貨×1.2）', vortex: 1, dna: 1.2 },
    mirror: { name: '鏡写', pre: '鏡写しの', icon: '🪞', desc: '斬ると左右反対の位置の敵にも一太刀が入る', mirror: 1 },
    regen: { name: '再生', pre: '再生する', icon: '💚', desc: '傷が治る敵。一気に斬れ（通貨×1.6）', regen: 0.08, dna: 1.6 },
    rush: { name: '乱舞', pre: '乱舞する', icon: '🎏', desc: '群れが次々に押し寄せる（群れの間隔×0.4）', form: 0.4 },
    lucky: { name: '豪運', pre: '豪運の', icon: '🍀', desc: 'スロット・宝箱・ラッキーが3倍', lucky: 3 },
    fire: { name: '灼熱', pre: '灼熱の', icon: '♨️', desc: '斬ると燃えやすい（炎刃 +25%・やけど×2）', fire: 0.25, burn: 2 },
    slow: { name: '時止め', pre: '時の止まる', icon: '⏸️', desc: '4体以上まとめて斬ると、一瞬だけ時間がゆっくりになる', slow: 1 },
  };
  const GIM_IDS = Object.keys(GIM).filter((k) => k !== 'normal');

  // ------------------------------------------------------------- 界（テーマ）
  // types: [名前, 3Dの形, 明るい色, 暗い色]（強さは菌の14種と同じ並び）
  // form: 武器の形 / wsuf: 武器の名前の終わり / bg: 世界の色 [上, 下] / amb: 漂うもの
  const REALMS = [
    {
      id: 'slime', icon: '🟢', name: '粘体界', noun: 'スライム', cur: 'ゼリー', curIcon: '🟩', wpn: '剣', form: 'sword', wsuf: ['剣', 'ブレード', '刃'],
      ally: '冒険者', allyIcons: ['🧝', '🛡️', '🏹', '🧙'], world: 'エリア', kill: ['ぷちっ', 'ぷるっ', 'べちゃ', '弾'],
      places: ['ぷるぷる草原', 'ねばねば沼', 'スライム洞窟', 'ゼリーの森', 'とろとろ渓谷', 'ぷにぷに丘', '粘液の湖', 'ぬるぬる神殿', 'ぽよぽよ雲海', 'ぷるるん城'],
      bg: [['#0a2a14', '#3ad07a'], ['#0a1a3a', '#3a8aff'], ['#2a1a0a', '#d0a03a'], ['#1a0a2a', '#a03ad0']], amb: ['bubble', 'dot'],
      music: { root: [0, 5, 3, -2], arp: [0, 4, 7, 12, 16, 12, 7, 4], bpm: 128 },
      types: [['スライム', 'slime', '#7aff9a', '#1a8a4a'], ['しずくスライム', 'drop', '#8ad8ff', '#1a5aa8'], ['ぷるぷるキューブ', 'cube', '#ffd36a', '#c9781a'], ['トゲスライム', 'spiky', '#ff7a7a', '#a01a2a'], ['はねスライム', 'bat', '#9fffe0', '#1a8a7a'], ['ぶどうスライム', 'grape', '#c8a0ff', '#5a2a9a'], ['うずスライム', 'spiral', '#ff9ae6', '#a8288a'], ['キングスライム', 'slime', '#c8ff6a', '#4a8a1a'], ['メタルスライム', 'drop', '#eef2f8', '#56606e'], ['もこもこスライム', 'fuzzy', '#f0e6c8', '#8a7a5a'], ['のびスライム', 'rod', '#a0f0ff', '#3a8ab0'], ['からまりスライム', 'knot', '#ff9a4a', '#8a2a00'], ['ほうせきスライム', 'crystal', '#7affff', '#2a5aff'], ['やみスライム', 'void', '#5a2a8a', '#14001f']],
    },
    {
      id: 'crystal', icon: '💎', name: '晶界', noun: '魔晶', cur: '魔晶石', curIcon: '🔷', wpn: '大剣', form: 'greatsword', wsuf: ['大剣', '巨剣', '剛剣'],
      ally: '錬金術師', allyIcons: ['⚗️', '🔮', '📜', '🧪'], world: '鉱脈', kill: ['パキン', '砕', '割', 'キラッ'],
      places: ['水晶の洞窟', '紫水晶の谷', '金剛石の山', '翠玉の湖', '紅玉の神殿', '蒼玉の海', '黄玉の砂漠', '月長石の森', '黒曜石の城', '虹晶の空'],
      bg: [['#0a0a2a', '#5a3ad0'], ['#001a2a', '#2ab0d0'], ['#1a001a', '#d03aa0'], ['#0a1a0a', '#3ad07a']], amb: ['spark', 'dot'],
      music: { root: [0, 3, 8, 7], arp: [0, 7, 12, 15, 19, 15, 12, 7], bpm: 124 },
      types: [['魔晶', 'crystal', '#7affff', '#2a5aff'], ['八面晶', 'octa', '#ff9ae6', '#a8288a'], ['四面晶', 'tetra', '#ffe14a', '#a87a00'], ['十二面晶', 'dodeca', '#9affb0', '#1a7a4a'], ['晶洞', 'geode', '#c8a0ff', '#4a1a8a'], ['柱晶', 'prism', '#a0f0ff', '#2a6aa8'], ['金剛晶', 'diamond', '#ffffff', '#8ab0d8'], ['群晶', 'spiky', '#ff9a8a', '#a01a2a'], ['双晶', 'chain', '#ffd36a', '#c9781a'], ['環晶', 'torus', '#6ae0ff', '#1a6aa8'], ['結晶核', 'ico', '#e0e8ff', '#5a6aa8'], ['ねじれ晶', 'knot', '#ff9a4a', '#8a2a00'], ['立方晶', 'cube', '#b0ffe8', '#2a8a7a'], ['虚晶', 'void', '#5a2a8a', '#14001f']],
    },
    {
      id: 'fruit', icon: '🍎', name: '果実界', noun: '果実魔', cur: '果汁', curIcon: '🧃', wpn: '包丁', form: 'cleaver', wsuf: ['包丁', '牛刀', '菜切り'],
      ally: '農家', allyIcons: ['👩‍🌾', '🧺', '🚜', '🌻'], world: '果樹園', kill: ['スパッ', 'ジュワッ', 'ザクッ', '果汁!!'],
      places: ['リンゴ園', 'ミカン山', 'スイカ畑', 'バナナ島', 'イチゴ温室', 'ブドウ棚', 'モモの里', 'レモン海岸', 'メロン宮殿', 'トロピカル楽園'],
      bg: [['#2a0a0a', '#ff6a4a'], ['#2a1a00', '#ffb03a'], ['#0a2a0a', '#6ad04a'], ['#2a002a', '#d04ab0']], amb: ['dot', 'bubble'],
      music: { root: [0, 5, 7, 5], arp: [0, 4, 7, 12, 7, 4, 9, 7], bpm: 136 },
      types: [['リンゴ魔', 'apple', '#ff6a5a', '#a01a1a'], ['ミカン魔', 'orange', '#ffb03a', '#c95a00'], ['サクランボ魔', 'cherry', '#ff3a5a', '#8a0010'], ['イチゴ魔', 'berry', '#ff4a6a', '#a0102a'], ['バナナ魔', 'banana', '#fff06a', '#c9a01a'], ['ブドウ魔', 'grape', '#a06aff', '#3a1a8a'], ['洋ナシ魔', 'pear', '#c8ff6a', '#6a9a1a'], ['スイカ魔', 'melon', '#4ad06a', '#0a5a1a'], ['モモ魔', 'peach', '#ffc0b0', '#e0606a'], ['キウイ魔', 'fuzzy', '#b08a4a', '#5a3a1a'], ['レモン魔', 'lemon', '#fff04a', '#c9b000'], ['パイン魔', 'pine', '#ffd04a', '#a06a00'], ['ドラゴンフルーツ魔', 'spiky', '#ff4ab0', '#8a0a5a'], ['禁断の果実魔', 'apple', '#c84aff', '#2a0a4a']],
    },
    {
      id: 'ghost', icon: '👻', name: '霊界', noun: '亡霊', cur: '魂', curIcon: '🔮', wpn: '大鎌', form: 'scythe', wsuf: ['鎌', '大鎌', '死神鎌'],
      ally: '陰陽師', allyIcons: ['🧿', '📿', '🏮', '⛩️'], world: '霊域', kill: ['成仏', '祓', 'ヒュッ', '滅'],
      places: ['墓場', '古寺', '竹林', '廃病院', '鬼火の沼', '百鬼の道', '黄泉の坂', '幽霊船', '狐の社', '冥府の門'],
      bg: [['#05000a', '#3a1a5a'], ['#000a0a', '#1a5a5a'], ['#0a0005', '#5a1a3a'], ['#000005', '#1a2a5a']], amb: ['spark', 'organelle'],
      music: { root: [0, 1, 6, 5], arp: [0, 3, 6, 12, 15, 12, 6, 3], bpm: 116 },
      types: [['おばけ', 'ghost', '#f0f4ff', '#8a9ab8'], ['人魂', 'wisp', '#7affff', '#1a6aff'], ['ドクロ', 'skull', '#fffaf0', '#8a7a6a'], ['提灯おばけ', 'lantern', '#ff9a4a', '#a02a00'], ['目玉おばけ', 'eyeball', '#ffffff', '#c8a0a0'], ['唐傘おばけ', 'kasa', '#ff6a8a', '#8a1a3a'], ['小鬼', 'imp', '#ff7a5a', '#7a1a0a'], ['コウモリ霊', 'bat', '#8a6aaa', '#2a1a3a'], ['ろくろ首', 'rod', '#ffe0d0', '#c08a7a'], ['鬼火', 'flame', '#6affb0', '#0a7a4a'], ['がしゃどくろ', 'skull', '#e8e0c8', '#5a5040'], ['怨霊', 'void', '#5a2a8a', '#14001f'], ['化け狐', 'fuzzy', '#ffd08a', '#c0601a'], ['大入道', 'ghost', '#c0c8ff', '#3a3a8a']],
    },
    {
      id: 'mech', icon: '🤖', name: '機界', noun: '機兵', cur: '歯車', curIcon: '⚙️', wpn: '光剣', form: 'saber', wsuf: ['セイバー', '光剣', 'ビームブレード'],
      ally: '整備士', allyIcons: ['🔧', '🔩', '🛠️', '📡'], world: '工場', kill: ['ガシャン', 'ボカン', '停止', '破壊'],
      places: ['組立ライン', '歯車塔', '溶鉱炉', '電脳倉庫', 'ネジの谷', 'ロボ墓場', '発電所', '地下鉄', '宇宙港', '中央演算塔'],
      bg: [['#0a0a10', '#4a5a6a'], ['#001014', '#1a8aa0'], ['#100a00', '#a06a1a'], ['#0a0014', '#5a3aa0']], amb: ['spark', 'dot'],
      music: { root: [0, 0, 3, 5], arp: [0, 12, 7, 12, 3, 12, 5, 12], bpm: 140 },
      types: [['ロボ兵', 'robot', '#d0d8e0', '#4a5a6a'], ['ドローン', 'drone', '#6ae0ff', '#1a5a8a'], ['歯車兵', 'gear', '#ffd36a', '#8a5a1a'], ['ブロック兵', 'cube', '#ff7a5a', '#7a1a0a'], ['円盤兵', 'ufo', '#c0c8d0', '#3a4a5a'], ['ボール兵', 'bot', '#9affb0', '#1a7a4a'], ['地雷兵', 'spiky', '#ff4a4a', '#3a0a0a'], ['リング兵', 'torus', '#a0f0ff', '#2a6aa8'], ['重装ロボ', 'robot', '#8a9aaa', '#2a3a4a'], ['ナノ群', 'fuzzy', '#c0d0e0', '#5a6a7a'], ['ケーブル蛇', 'spiral', '#ffe14a', '#3a3a3a'], ['結晶AI', 'crystal', '#7affff', '#2a5aff'], ['戦車兵', 'golem', '#7a8a5a', '#2a3a1a'], ['マザーCPU', 'dodeca', '#ff6af0', '#3a0a4a']],
    },
    {
      id: 'star', icon: '⭐', name: '星界', noun: '星獣', cur: '星屑', curIcon: '🌟', wpn: '星槍', form: 'spear', wsuf: ['槍', '星槍', '光槍'],
      ally: '天文学者', allyIcons: ['🔭', '🛰️', '🚀', '🪐'], world: '星域', kill: ['キラン', '流星', '撃墜', '☆'],
      places: ['月面', '小惑星帯', '土星の環', '銀河の川', '星雲', '流星群', '木星の嵐', '彗星の尾', '白色矮星', '宇宙の果て'],
      bg: [['#00000a', '#1a1a5a'], ['#05000a', '#3a1a5a'], ['#000508', '#0a3a5a'], ['#0a0005', '#4a0a3a']], amb: ['spark', 'dot'],
      music: { root: [0, 4, 7, 2], arp: [0, 7, 11, 14, 19, 14, 11, 7], bpm: 126 },
      types: [['星獣', 'star', '#fff06a', '#c9a01a'], ['惑星獣', 'planet', '#ff9a6a', '#8a3a1a'], ['隕石獣', 'rock', '#b0a090', '#4a3a2a'], ['UFO獣', 'ufo', '#c0c8d0', '#3a4a5a'], ['三日月獣', 'moon', '#fff6c0', '#a89a4a'], ['彗星獣', 'drop', '#a0f0ff', '#2a6aa8'], ['太陽獣', 'sun', '#ffd04a', '#ff5a00'], ['星雲獣', 'blob', '#ff9ae6', '#5a1a8a'], ['衛星獣', 'ball', '#e0e8ff', '#5a6aa8'], ['宇宙クラゲ', 'jelly', '#c8a0ff', '#4a1a8a'], ['リング惑星獣', 'planet', '#8affd0', '#1a6a5a'], ['ブラックホール', 'blackhole', '#5a2a8a', '#000000'], ['星の結晶', 'crystal', '#ffffff', '#6a8aff'], ['銀河獣', 'spiral', '#d0b0ff', '#2a0a5a']],
    },
    {
      id: 'ice', icon: '❄️', name: '氷界', noun: '氷魔', cur: '氷晶', curIcon: '🧊', wpn: '氷爪', form: 'claw', wsuf: ['爪', '氷爪', '鉤爪'],
      ally: '雪の精', allyIcons: ['☃️', '⛄', '🌨️', '🎿'], world: '雪原', kill: ['パリン', '凍結', '砕', 'シャリ'],
      places: ['氷河', '雪の森', 'つらら洞窟', '凍った湖', '吹雪の峠', '氷の宮殿', 'オーロラの空', '永久凍土', '雪の村', '絶対零度'],
      bg: [['#001020', '#8ad0ff'], ['#000a1a', '#4a8ad0'], ['#0a1020', '#c0e0ff'], ['#00101a', '#3ad0d0']], amb: ['dot', 'bubble'],
      music: { root: [0, -3, 2, -5], arp: [0, 7, 12, 14, 12, 7, 2, 7], bpm: 118 },
      types: [['氷魔', 'cube', '#c8f0ff', '#4a8ad0'], ['雪だるま魔', 'snowman', '#ffffff', '#a0b8d0'], ['つらら魔', 'icicle', '#e0f8ff', '#5aa0d0'], ['雪の結晶魔', 'snowflake', '#ffffff', '#7ab0ff'], ['雪玉魔', 'ball', '#f4f8ff', '#a8b8d0'], ['氷晶魔', 'crystal', '#a0f0ff', '#2a6aa8'], ['吹雪魔', 'cloud', '#e8f0ff', '#8a9ab8'], ['雪男', 'fuzzy', '#ffffff', '#8a9aaa'], ['氷柱魔', 'prism', '#c0e8ff', '#3a7ab0'], ['氷のトゲ魔', 'spiky', '#b0e8ff', '#1a5a9a'], ['凍った炎', 'flame', '#7ad8ff', '#1a3a8a'], ['氷の竜卵', 'egg', '#d0f0ff', '#4a7aa8'], ['オーロラ魔', 'spiral', '#7affb0', '#2a3aa8'], ['絶対零度', 'void', '#3a5a8a', '#000a1a']],
    },
    {
      id: 'fire', icon: '🔥', name: '炎界', noun: '炎魔', cur: '火種', curIcon: '🔥', wpn: '炎剣', form: 'greatsword', wsuf: ['炎剣', '焔刃', '劫火剣'],
      ally: '火消し', allyIcons: ['🧯', '🚒', '💧', '🪣'], world: '火山', kill: ['ジュッ', '爆', '燃', '消火'],
      places: ['溶岩の川', '噴火口', '灼熱砂漠', '炎の神殿', '火の山', 'マグマ洞窟', '煉獄', '太陽の表面', '火竜の巣', '終焉の業火'],
      bg: [['#1a0000', '#ff5a1a'], ['#1a0a00', '#ffa01a'], ['#100000', '#c01a3a'], ['#1a0500', '#ff3a00']], amb: ['spark', 'dot'],
      music: { root: [0, 1, 5, 3], arp: [0, 3, 7, 10, 12, 10, 7, 3], bpm: 144 },
      types: [['火の玉', 'flame', '#ffd04a', '#ff3a00'], ['マグマ魔', 'blob', '#ff7a2a', '#5a0a00'], ['火の粉', 'ball', '#ffb03a', '#c03a00'], ['溶岩石', 'rock', '#8a4a3a', '#2a0a05'], ['炎のトゲ', 'spiky', '#ff6a3a', '#8a0a00'], ['火山弾', 'drop', '#ff9a4a', '#6a1a00'], ['火竜の卵', 'egg', '#ffd08a', '#c04a1a'], ['炎のしずく', 'lemon', '#ffe04a', '#ff6a00'], ['不死鳥の羽', 'feather', '#ff9a3a', '#c01a3a'], ['炎の輪', 'torus', '#ffb02a', '#ff2a00'], ['太陽のかけら', 'sun', '#fff06a', '#ff8a00'], ['燃える骸', 'skull', '#ffd0a0', '#8a2a00'], ['煉獄魔', 'imp', '#ff4a2a', '#3a0000'], ['業火の核', 'void', '#ff3a00', '#1a0000']],
    },
    {
      id: 'sea', icon: '🌊', name: '深海界', noun: '深海魔', cur: '真珠', curIcon: '🫧', wpn: '銛', form: 'spear', wsuf: ['銛', '三叉槍', '突槍'],
      ally: '潜水士', allyIcons: ['🤿', '⚓', '🚤', '🧜'], world: '海域', kill: ['ブクッ', 'ザブン', '突', '泡'],
      places: ['珊瑚礁', '海溝', '沈没船', '海底火山', '昆布の森', '深海平原', '竜宮城', '渦潮', '氷の海', '海の底の底'],
      bg: [['#000a1a', '#0a5aa0'], ['#000510', '#1a3a8a'], ['#001014', '#0a8a8a'], ['#000005', '#1a1a5a']], amb: ['bubble', 'organelle'],
      music: { root: [0, -2, 3, -4], arp: [0, 5, 7, 12, 17, 12, 7, 5], bpm: 112 },
      types: [['クラゲ魔', 'jelly', '#c8a0ff', '#4a1a8a'], ['タコ魔', 'octo', '#ff7a6a', '#8a1a1a'], ['貝魔', 'shell', '#ffe0c8', '#c08a6a'], ['ウニ魔', 'spiky', '#5a3a6a', '#1a0a2a'], ['フグ魔', 'puffer', '#ffe08a', '#a07a1a'], ['ヒトデ魔', 'star', '#ff9a6a', '#a03a1a'], ['泡魔', 'bubble', '#c0f0ff', '#4a8ab0'], ['チョウチン魔', 'eyeball', '#ffffff', '#3a5a8a'], ['サンゴ魔', 'fuzzy', '#ff8ab0', '#a01a5a'], ['ウミヘビ魔', 'spiral', '#6affd0', '#0a5a4a'], ['真珠魔', 'ball', '#fff8f0', '#c8b8a8'], ['大王イカ魔', 'octo', '#ffb0a0', '#6a1a2a'], ['海の結晶', 'crystal', '#7affff', '#0a5a9a'], ['深淵魔', 'void', '#1a2a5a', '#000008']],
    },
    {
      id: 'candy', icon: '🍬', name: '菓子界', noun: 'お菓子魔', cur: '砂糖', curIcon: '🍬', wpn: 'ナイフ', form: 'dagger', wsuf: ['ナイフ', 'ケーキナイフ', 'パレット'],
      ally: 'パティシエ', allyIcons: ['🧑‍🍳', '🥄', '🍰', '🧁'], world: 'お菓子の国', kill: ['サクッ', 'パクッ', 'あまっ', 'ザクッ'],
      places: ['ドーナツ通り', 'チョコの川', 'グミの森', 'キャンディ城', 'ケーキ山', 'マカロン広場', 'プリン島', 'クッキー砂漠', 'わたあめ雲', 'お菓子の家'],
      bg: [['#2a0a1a', '#ff8ad0'], ['#1a0a00', '#d08a4a'], ['#0a1a2a', '#8ad0ff'], ['#1a0a2a', '#c08aff']], amb: ['dot', 'bubble'],
      music: { root: [0, 5, 9, 7], arp: [0, 4, 7, 12, 16, 19, 16, 12], bpm: 138 },
      types: [['ドーナツ魔', 'donut', '#ffb0d0', '#a05a3a'], ['カップケーキ魔', 'cupcake', '#ff9ad0', '#a0603a'], ['キャンディ魔', 'candy', '#ff6a8a', '#a01a4a'], ['ペロペロ魔', 'lollipop', '#7affd0', '#ff4ab0'], ['マカロン魔', 'macaron', '#b0ffd0', '#ffb0d0'], ['グミ魔', 'cube', '#ff5a5a', '#8a0a2a'], ['チョコ魔', 'cube', '#8a5a3a', '#3a1a0a'], ['プリン魔', 'pudding', '#ffe08a', '#8a4a1a'], ['わたあめ魔', 'cloud', '#ffd0f0', '#c08ad0'], ['こんぺいとう魔', 'spiky', '#fff0a0', '#ff8ab0'], ['ケーキ魔', 'cake', '#fff8f0', '#ff6a8a'], ['クッキー魔', 'cookie', '#d8a060', '#7a4a1a'], ['ゼリー魔', 'drop', '#8affd0', '#1a8a6a'], ['ブラックチョコ魔', 'void', '#3a1a0a', '#0a0000']],
    },
    {
      id: 'sky', icon: '☁️', name: '天空界', noun: '雲魔', cur: '雷光', curIcon: '⚡', wpn: '刀', form: 'katana', wsuf: ['丸', '切', '正'],
      ally: '風使い', allyIcons: ['🪁', '🌬️', '🎐', '🪽'], world: '空域', kill: ['ゴロゴロ', 'サッ', '晴', 'ピカッ'],
      places: ['雲海', '虹の橋', '雷の峰', '風の谷', '天空の城', '嵐の目', '朝焼けの空', '夕焼けの空', '星空の端', '成層圏'],
      bg: [['#0a1a3a', '#8ac8ff'], ['#1a0a2a', '#ff9ad0'], ['#0a0a1a', '#5a6ab0'], ['#1a1a0a', '#ffd08a']], amb: ['bubble', 'dot'],
      music: { root: [0, 5, 2, 7], arp: [0, 7, 12, 16, 14, 12, 7, 4], bpm: 130 },
      types: [['雲魔', 'cloud', '#ffffff', '#8a9ab8'], ['雷雲魔', 'cloud', '#8a8aa8', '#2a2a3a'], ['雨粒魔', 'drop', '#8ad8ff', '#1a5aa8'], ['虹魔', 'torus', '#ff9ae6', '#5a8aff'], ['風の精魔', 'spiral', '#c0fff0', '#3a9a8a'], ['雷魔', 'spiky', '#fff06a', '#8a6a00'], ['ひょう魔', 'cube', '#e0f0ff', '#6a8ab0'], ['竜巻魔', 'cone', '#c0c8d0', '#4a5a6a'], ['凧魔', 'kite', '#ff6a6a', '#3a3a8a'], ['太陽魔', 'sun', '#fff06a', '#ff8a00'], ['月魔', 'moon', '#fff6c0', '#a89a4a'], ['羽魔', 'feather', '#ffffff', '#a0b0c0'], ['オーロラ魔', 'blob', '#7affb0', '#3a3aa8'], ['嵐の王', 'void', '#3a3a5a', '#05050a']],
    },
    {
      id: 'toxic', icon: '🍄', name: '毒沼界', noun: '毒魔', cur: '胞子', curIcon: '🍄', wpn: '大鎌', form: 'scythe', wsuf: ['鎌', '毒鎌', '草刈り鎌'],
      ally: '薬師', allyIcons: ['🌿', '💊', '⚗️', '🍵'], world: '沼地', kill: ['ドロッ', '解毒', 'ジュッ', '浄'],
      places: ['毒の沼', 'キノコの森', '腐海', '霧の湿原', '胞子の谷', 'ぬかるみ', '毒ガス洞窟', '苔の神殿', 'どろどろ川', '瘴気の城'],
      bg: [['#0a1a00', '#6aa01a'], ['#1a0a1a', '#8a3aa0'], ['#0a1a0a', '#3a8a3a'], ['#141400', '#8a8a1a']], amb: ['bubble', 'spark'],
      music: { root: [0, 1, 3, -1], arp: [0, 3, 6, 10, 13, 10, 6, 3], bpm: 120 },
      types: [['毒キノコ魔', 'mushroom', '#ff4a4a', '#f0e8d0'], ['毒スライム', 'slime', '#9aff4a', '#3a6a0a'], ['毒の泡', 'bubble', '#c0ff6a', '#4a8a1a'], ['胞子魔', 'fuzzy', '#d0e08a', '#6a7a2a'], ['毒トゲ魔', 'spiky', '#a04aff', '#2a0a4a'], ['毒ガス魔', 'cloud', '#9aff6a', '#3a5a1a'], ['ヘドロ魔', 'blob', '#6a7a3a', '#1a2a0a'], ['紫キノコ魔', 'mushroom', '#c06aff', '#f0e0ff'], ['毒のしずく', 'drop', '#a0ff4a', '#2a7a0a'], ['腐った果実魔', 'apple', '#8a6a3a', '#2a1a0a'], ['寄生魔', 'phage', '#c8b0ff', '#5a3ab8'], ['毒蛇魔', 'spiral', '#6aff6a', '#1a4a1a'], ['瘴気の結晶', 'crystal', '#b0ff6a', '#3a5a0a'], ['毒の王', 'void', '#3a5a0a', '#050a00']],
    },
    {
      id: 'rock', icon: '🪨', name: '岩界', noun: '岩魔', cur: '鉱石', curIcon: '🪨', wpn: '大剣', form: 'greatsword', wsuf: ['大剣', '岩斬り', '断岩剣'],
      ally: '鉱夫', allyIcons: ['⛏️', '🧨', '🚃', '🔦'], world: '岩場', kill: ['ゴッ', '粉砕', 'ドゴッ', '割'],
      places: ['石切り場', '鍾乳洞', '断崖', '砂岩の谷', '火成岩の丘', '巨石群', '化石の層', '地底湖', '大地の裂け目', '星の核'],
      bg: [['#1a1408', '#a08a5a'], ['#0a0a0a', '#6a6a6a'], ['#1a0a05', '#a05a3a'], ['#0a0a14', '#5a5a8a']], amb: ['dot', 'spark'],
      music: { root: [0, -2, 0, -5], arp: [0, 7, 5, 7, 10, 7, 5, 3], bpm: 110 },
      types: [['岩魔', 'rock', '#b0a090', '#4a3a2a'], ['小石魔', 'ball', '#c0b8a8', '#5a5048'], ['岩石ゴーレム', 'golem', '#a09080', '#3a3028'], ['鉱石魔', 'ore', '#8a8a9a', '#2a2a3a'], ['砂岩魔', 'cube', '#e0c08a', '#8a6a3a'], ['トゲ岩魔', 'spiky', '#8a7a6a', '#2a2018'], ['化石魔', 'shell', '#e8d8c0', '#8a7a5a'], ['溶岩石魔', 'rock', '#5a3a3a', '#1a0505'], ['宝石魔', 'diamond', '#ff6a8a', '#8a0a2a'], ['鍾乳石魔', 'icicle', '#e8e0d0', '#8a8070'], ['巨岩魔', 'rock', '#7a7a7a', '#202020'], ['金鉱魔', 'ore', '#ffd04a', '#6a4a0a'], ['大地の結晶', 'crystal', '#a0ffc0', '#2a6a4a'], ['星の核魔', 'void', '#5a3a1a', '#0a0500']],
    },
    {
      id: 'geo', icon: '📐', name: '幾何界', noun: '図形魔', cur: '定理', curIcon: '📐', wpn: '光剣', form: 'saber', wsuf: ['光剣', '直線刃', 'ベクトル'],
      ally: '数学者', allyIcons: ['🧮', '📏', '📊', '♾️'], world: '空間', kill: ['証明', 'Q.E.D.', '解', '∴'],
      places: ['ユークリッド平面', '双曲空間', '球面', 'トーラス面', 'フラクタルの森', '座標の海', '無限遠点', '虚数軸', '位相の迷宮', '超立方体'],
      bg: [['#000a14', '#1a6aa0'], ['#0a0014', '#5a1aa0'], ['#000a0a', '#0a8a6a'], ['#0a0a0a', '#4a4a6a']], amb: ['spark', 'dot'],
      music: { root: [0, 7, 5, 2], arp: [0, 4, 7, 11, 14, 11, 7, 4], bpm: 132 },
      types: [['正四面体', 'tetra', '#ffe14a', '#a87a00'], ['立方体', 'cube', '#6ae0ff', '#1a6aa8'], ['正八面体', 'octa', '#ff9ae6', '#a8288a'], ['正十二面体', 'dodeca', '#9affb0', '#1a7a4a'], ['正二十面体', 'ico', '#ff9a6a', '#a03a1a'], ['円環体', 'torus', '#c8a0ff', '#4a1a8a'], ['三葉結び目', 'knot', '#ff6a6a', '#8a0a1a'], ['円錐', 'cone', '#ffd36a', '#c9781a'], ['六角柱', 'prism', '#a0f0ff', '#2a6aa8'], ['球', 'bubble', '#e0e8ff', '#5a6aa8'], ['星形多面体', 'spiky', '#ffffff', '#8a8aff'], ['らせん', 'spiral', '#7affb0', '#1a6a4a'], ['メビウスの輪', 'knot', '#b0ffff', '#2a5a8a'], ['超立方体', 'cube', '#ff4af0', '#2a0a3a']],
    },
    {
      id: 'cyber', icon: '💾', name: '電脳界', noun: '電脳ウイルス', cur: 'ビット', curIcon: '💾', wpn: '光剣', form: 'saber', wsuf: ['セイバー', 'プログラム', 'ファイアウォール'],
      ally: 'プログラマー', allyIcons: ['💻', '🖥️', '⌨️', '🛰️'], world: 'サーバー', kill: ['削除', 'DELETE', '駆除', '0x00'],
      places: ['メモリの海', 'CPUの塔', '回路の森', 'データの川', '暗号の迷宮', 'キャッシュの谷', 'クラウド', '量子計算機', 'ネットの深層', 'カーネル'],
      bg: [['#000a05', '#0a8a3a'], ['#00050a', '#0a5aa0'], ['#0a000a', '#8a0a8a'], ['#000000', '#2a2a2a']], amb: ['spark', 'dot'],
      music: { root: [0, 3, 0, -2], arp: [0, 12, 0, 12, 7, 19, 7, 15], bpm: 150 },
      types: [['バグ', 'spiky', '#7aff7a', '#0a5a0a'], ['グリッチ', 'cube', '#ff4af0', '#3a0a4a'], ['ワーム', 'chain', '#ffe14a', '#8a5a00'], ['トロイ', 'robot', '#c0c8d0', '#3a4a5a'], ['スパム', 'drop', '#ff6a6a', '#8a0a0a'], ['ボット', 'bot', '#6ae0ff', '#1a5a8a'], ['マルウェア', 'void', '#5a2a8a', '#14001f'], ['パケット', 'cube', '#a0f0ff', '#2a6aa8'], ['ポップアップ', 'ufo', '#ffd36a', '#c9781a'], ['トラッキングクッキー', 'cookie', '#d8a060', '#7a4a1a'], ['ランサム', 'skull', '#ff3a3a', '#2a0000'], ['ルートキット', 'knot', '#ff9a4a', '#8a2a00'], ['量子ビット', 'ico', '#7affff', '#2a5aff'], ['ゼロデイ', 'void', '#200010', '#ff0040']],
    },
    {
      id: 'time', icon: '⏳', name: '時界', noun: '時魔', cur: '刻', curIcon: '⏳', wpn: '刀', form: 'katana', wsuf: ['丸', '時雨', '刻'],
      ally: '時計職人', allyIcons: ['🕰️', '⌚', '⏰', '📅'], world: '時代', kill: ['チクタク', '停止', '刻', 'ボーン'],
      places: ['原始時代', '古代遺跡', '戦国の世', '江戸の町', '明治の港', '昭和の街', '令和の都', '未来都市', '時の狭間', '時の終わり'],
      bg: [['#1a1408', '#c0a050'], ['#0a0a14', '#5a6aa0'], ['#14080a', '#a05a6a'], ['#000a0a', '#3a8a8a']], amb: ['dot', 'spark'],
      music: { root: [0, 5, 3, 7], arp: [0, 7, 12, 7, 0, 7, 12, 15], bpm: 120 },
      types: [['時計魔', 'clock', '#fff6d8', '#c08a2a'], ['砂時計魔', 'hourglass', '#ffe0a0', '#8a6a2a'], ['歯車魔', 'gear', '#ffd36a', '#8a5a1a'], ['振り子魔', 'bell', '#d8c08a', '#6a5a2a'], ['ベル魔', 'bell', '#ffd04a', '#a07a00'], ['懐中時計魔', 'clock', '#e0e8f0', '#5a6a7a'], ['時の卵', 'egg', '#fff0d0', '#c0a06a'], ['時の結晶', 'crystal', '#a0f0ff', '#2a6aa8'], ['時のらせん', 'spiral', '#ffd0a0', '#8a4a1a'], ['時の輪', 'torus', '#ffe08a', '#8a6a1a'], ['過去の亡霊', 'ghost', '#e0d8c8', '#6a6050'], ['未来ロボ', 'robot', '#c0e8ff', '#2a4a6a'], ['時の番人', 'imp', '#a08aff', '#2a1a6a'], ['時の終わり', 'void', '#2a2a3a', '#000000']],
    },
    {
      id: 'dream', icon: '💭', name: '夢界', noun: '夢魔', cur: '夢のかけら', curIcon: '💤', wpn: 'ナイフ', form: 'dagger', wsuf: ['ナイフ', '夢刃', '短剣'],
      ally: '夢守', allyIcons: ['🌙', '🛏️', '🧸', '🕯️'], world: '夢', kill: ['すやぁ', 'ポフッ', '夢', 'ふわっ'],
      places: ['まどろみの丘', '雲の上', 'おもちゃ箱', '逆さまの街', 'お菓子の夢', '空飛ぶ島', '迷子の森', '鏡の国', '星降る夜', '目覚めの手前'],
      bg: [['#0a0a2a', '#8a6ad0'], ['#1a0a2a', '#ff9ad0'], ['#000a1a', '#6ab0ff'], ['#14001a', '#c06aff']], amb: ['bubble', 'spark'],
      music: { root: [0, 4, 9, 5], arp: [0, 7, 11, 16, 11, 7, 4, 2], bpm: 108 },
      types: [['まくら魔', 'pillow', '#ffffff', '#c0b8e0'], ['夢の泡', 'bubble', '#ffd0ff', '#8a6ad0'], ['ひつじ雲魔', 'cloud', '#fff8f0', '#c8b8a8'], ['月魔', 'moon', '#fff6c0', '#a89a4a'], ['星魔', 'star', '#fff06a', '#c9a01a'], ['ハート魔', 'heart', '#ff6a9a', '#a01a4a'], ['悪夢魔', 'ghost', '#8a6aaa', '#2a1a3a'], ['ねむり魔', 'slime', '#c0b0ff', '#5a4aa0'], ['おもちゃ魔', 'cube', '#ff9a4a', '#3a6aff'], ['夢の鍵魔', 'kite', '#ffd04a', '#8a5a00'], ['夢の卵', 'egg', '#ffe0ff', '#a06ad0'], ['逆さ魔', 'cone', '#a0f0ff', '#3a6aa8'], ['夢の結晶', 'crystal', '#ffd0ff', '#8a3ab0'], ['悪夢の王', 'void', '#3a1a5a', '#05000a']],
    },
    {
      id: 'music', icon: '🎵', name: '音界', noun: '音魔', cur: '音符', curIcon: '🎵', wpn: '刀', form: 'katana', wsuf: ['丸', '鳴', '響'],
      ally: '楽団員', allyIcons: ['🎻', '🎺', '🥁', '🎹'], world: 'ステージ', kill: ['ジャーン', '♪', 'ドン', 'パーン'],
      places: ['ライブハウス', '野外フェス', 'オペラ座', 'ジャズバー', 'ロックの丘', '電子音の街', '雅楽の庭', '合唱の聖堂', 'ヒップホップ通り', '宇宙ドーム公演'],
      bg: [['#14000a', '#c01a6a'], ['#000a14', '#1a6ac0'], ['#0a0a00', '#c0a01a'], ['#0a0014', '#6a1ac0']], amb: ['spark', 'dot'],
      music: { root: [0, 5, 7, 0], arp: [0, 4, 7, 12, 16, 12, 7, 4], bpm: 146 },
      types: [['音符魔', 'note', '#ffffff', '#3a3a5a'], ['ベル魔', 'bell', '#ffd04a', '#a07a00'], ['太鼓魔', 'drum', '#ff6a5a', '#6a1a0a'], ['シンバル魔', 'disc', '#ffe08a', '#8a6a1a'], ['スピーカー魔', 'cube', '#4a4a4a', '#0a0a0a'], ['マイク魔', 'mic', '#c0c8d0', '#2a2a3a'], ['レコード魔', 'disc', '#3a3a3a', '#ff3a5a'], ['トライアングル魔', 'tetra', '#e0e8f0', '#6a7a8a'], ['ハート魔', 'heart', '#ff6a9a', '#a01a4a'], ['星魔', 'star', '#fff06a', '#c9a01a'], ['鈴魔', 'ball', '#ffd04a', '#c08a00'], ['音波魔', 'torus', '#7affff', '#1a6aa8'], ['不協和音魔', 'spiky', '#ff4a4a', '#3a0a0a'], ['沈黙の王', 'void', '#1a1a2a', '#000000']],
    },
    {
      id: 'void', icon: '🕳️', name: '虚空界', noun: '虚無', cur: '虚数', curIcon: '🌀', wpn: '大鎌', form: 'scythe', wsuf: ['鎌', '虚鎌', '終鎌'],
      ally: '次元旅人', allyIcons: ['🧭', '🗝️', '🌌', '🕳️'], world: '虚空', kill: ['虚', '無', '消滅', '…'],
      places: ['裂け目', '反転世界', '無の海', '重力井戸', '事象の地平', '忘却の庭', '影の都', '逆さ時間', '虚数空間', '全ての終わり'],
      bg: [['#05000a', '#2a0a4a'], ['#000000', '#1a1a3a'], ['#0a0005', '#4a0a2a'], ['#000005', '#0a1a3a']], amb: ['spark', 'organelle'],
      music: { root: [0, 1, 0, 6], arp: [0, 6, 12, 13, 18, 13, 12, 6], bpm: 114 },
      types: [['虚無', 'void', '#5a2a8a', '#14001f'], ['ブラックホール', 'blackhole', '#3a1a5a', '#000000'], ['虚空の目', 'eyeball', '#ffffff', '#5a0a8a'], ['影魔', 'ghost', '#3a3a5a', '#05050a'], ['反物質', 'bubble', '#ff4af0', '#1a001a'], ['裂け目魔', 'spiky', '#8a2aff', '#0a0014'], ['重力魔', 'planet', '#6a4aaa', '#0a0a1a'], ['影の結び目', 'knot', '#5a3a8a', '#0a0014'], ['虚数体', 'ico', '#8a6aff', '#14002a'], ['忘却魔', 'fuzzy', '#6a6a8a', '#1a1a2a'], ['次元のかけら', 'crystal', '#c06aff', '#2a0a4a'], ['影の竜卵', 'egg', '#3a2a5a', '#05000a'], ['無限らせん', 'spiral', '#a06aff', '#10002a'], ['虚空の王', 'blackhole', '#ff2a6a', '#000000']],
    },
    {
      id: 'divine', icon: '🪽', name: '神界', noun: '神獣', cur: '神気', curIcon: '✴️', wpn: '神刀', form: 'katana', wsuf: ['丸', '天剣', '神剣'],
      ally: '神官', allyIcons: ['⛩️', '📯', '🕊️', '👼'], world: '天界', kill: ['昇天', '聖', '光', '浄化'],
      places: ['天の門', '雲の神殿', '黄金の庭', '光の滝', '星の玉座', '虹の回廊', '天使の泉', '神々の山', '永遠の都', '創世の間'],
      bg: [['#1a1408', '#fff0a0'], ['#0a0a1a', '#c0d0ff'], ['#1a0a14', '#ffd0f0'], ['#0a1414', '#c0fff0']], amb: ['spark', 'bubble'],
      music: { root: [0, 5, 9, 7], arp: [0, 4, 7, 12, 16, 19, 24, 19], bpm: 124 },
      types: [['天使魔', 'angel', '#ffffff', '#e0d0a0'], ['光の玉', 'ball', '#fff6c0', '#e0b04a'], ['聖なる卵', 'egg', '#fffaf0', '#e0c88a'], ['天の羽', 'feather', '#ffffff', '#c0c8e0'], ['光輪魔', 'torus', '#fff06a', '#c9a01a'], ['神の目', 'eyeball', '#ffffff', '#e0b04a'], ['聖杯魔', 'cupcake', '#ffd04a', '#a07a00'], ['天馬の雲', 'cloud', '#ffffff', '#c0d0ff'], ['星の使い', 'star', '#fff06a', '#c9a01a'], ['天の鐘', 'bell', '#ffe08a', '#a08a3a'], ['太陽神獣', 'sun', '#fff06a', '#ff8a00'], ['月神獣', 'moon', '#e0e8ff', '#6a7ab0'], ['神の結晶', 'diamond', '#ffffff', '#a0c0ff'], ['堕天使', 'angel', '#5a4a6a', '#0a0010']],
    },
    {
      id: 'chaos', icon: '🌈', name: '混沌界', noun: '混沌', cur: '混沌石', curIcon: '🌈', wpn: '混沌刃', form: 'mix', wsuf: ['刃', '剣', '鎌', '爪', '槍'],
      ally: '混沌の使徒', allyIcons: ['🌈', '🎲', '🃏', '♾️'], world: '混沌', kill: ['カオス!!', '混', '沌', '!?'],
      places: ['ごちゃまぜの街', 'さかさまの海', '虹色の砂漠', '全部の森', 'ねじれた空', 'まだらの山', '騒がしい城', '色のない谷', '終わらない階段', '始まりの終わり'],
      bg: [['#1a001a', '#ff4ab0'], ['#001a1a', '#4affd0'], ['#1a1a00', '#d0ff4a'], ['#000a1a', '#4a6aff']], amb: ['spark', 'bubble', 'organelle'],
      music: { root: [0, 6, 1, 7], arp: [0, 7, 1, 13, 6, 18, 12, 5], bpm: 152 },
      types: null, // 他の界から14種を混ぜる
    },
  ];
  // 混沌界: 他の界の敵を混ぜる
  {
    const r = mulberry(31337);
    const all = [];
    REALMS.forEach((R) => { if (R.types) R.types.forEach((t) => all.push(t)); });
    const pick = [];
    while (pick.length < 14) {
      const t = all[Math.floor(r() * all.length)];
      if (pick.some((x) => x[1] === t[1])) continue;
      pick.push(['混沌' + t[0].replace(/魔$/, ''), t[1], t[2], t[3]]);
    }
    REALMS[REALMS.length - 1].types = pick;
  }
  const FORMS = ['katana', 'sword', 'greatsword', 'scythe', 'spear', 'claw', 'saber', 'dagger', 'cleaver'];

  // ------------------------------------------------------------- 界ごとの追加の敵（20種から、次元ごとに14種を選ぶ）
  const EXTRA = {
    slime: [['ちびスライム', 'ball', '#b0ffc0', '#3a9a5a'], ['とげ玉スライム', 'puffer', '#ffd06a', '#a0601a'], ['かさスライム', 'mushroom', '#ff8ab0', '#f0e8ff'], ['ぷるぷる卵', 'egg', '#d0fff0', '#5ab08a'], ['雲スライム', 'cloud', '#e0f0ff', '#8aa0c0'], ['ハートスライム', 'heart', '#ff9ac0', '#c03a6a']],
    crystal: [['結晶ゴーレム', 'golem', '#a0d0ff', '#3a5a9a'], ['鉱石魔晶', 'ore', '#c0a0ff', '#4a2a8a'], ['氷晶', 'icicle', '#d0f8ff', '#5aa0d0'], ['星晶', 'star', '#fff0a0', '#c09a1a'], ['晶球', 'bubble', '#e0d0ff', '#7a5ac0'], ['晶の卵', 'egg', '#c0ffff', '#2a8aa0']],
    fruit: [['ココナツ魔', 'fuzzy', '#a07a4a', '#4a2a10'], ['マンゴー魔', 'lemon', '#ffb04a', '#c04a10'], ['ブルーベリー魔', 'ball', '#6a6aff', '#1a1a6a'], ['ライチ魔', 'spiky', '#ff8a9a', '#a01a3a'], ['ザクロ魔', 'apple', '#c81a3a', '#4a0010'], ['柿魔', 'orange', '#ff8a2a', '#a03a00']],
    ghost: [['のっぺらぼう', 'egg', '#fff0e0', '#c0a080'], ['からかさ小僧', 'kasa', '#8affb0', '#1a6a3a'], ['一つ目小僧', 'eyeball', '#ffffff', '#5a3a2a'], ['人魂の群れ', 'wisp', '#ffb0ff', '#8a1a8a'], ['ぬりかべ', 'cube', '#a8a090', '#4a4030'], ['雪女の霊', 'ghost', '#d0f0ff', '#5a8ab0']],
    mech: [['ミサイル兵', 'cone', '#ff6a4a', '#6a1a0a'], ['衛星兵', 'planet', '#c0d0e0', '#3a4a5a'], ['電池兵', 'prism', '#7aff7a', '#1a6a1a'], ['スパナ兵', 'gear', '#d0d0d8', '#4a4a5a'], ['レーダー兵', 'disc', '#6ae0ff', '#1a4a6a'], ['監視ボール', 'eyeball', '#ffffff', '#ff3a3a']],
    star: [['流れ星獣', 'drop', '#fff6a0', '#c0a01a'], ['宇宙飛行獣', 'bot', '#ffffff', '#5a6a8a'], ['月うさぎ獣', 'moon', '#ffe0f0', '#a07ab0'], ['星座獣', 'tetra', '#c0d0ff', '#3a4aaa'], ['宇宙ゴミ獣', 'rock', '#8a8a9a', '#2a2a3a'], ['オーロラ獣', 'spiral', '#7affd0', '#3a3aa8']],
    ice: [['氷のヒナ魔', 'egg', '#e0f0ff', '#3a5a8a'], ['かまくら魔', 'pudding', '#ffffff', '#a0b8d0'], ['霜柱魔', 'prism', '#e0f8ff', '#7ab0d0'], ['冬の精魔', 'angel', '#e8f8ff', '#8ab0d0'], ['氷山魔', 'rock', '#d0f0ff', '#5a8ab0'], ['つらら蝙蝠', 'bat', '#c0e8ff', '#3a6a9a']],
    fire: [['火打ち石魔', 'ore', '#c0a090', '#ff5a00'], ['マッチ魔', 'rod', '#ffd0a0', '#ff3a00'], ['ほむら蝙蝠', 'bat', '#ff8a3a', '#6a1a00'], ['火の鳥の雛', 'egg', '#ffb04a', '#c02a00'], ['炎の目', 'eyeball', '#fff0a0', '#ff3a00'], ['溶岩スライム', 'slime', '#ff6a2a', '#6a0a00']],
    sea: [['イソギンチャク魔', 'fuzzy', '#ff9ad0', '#8a1a5a'], ['ヤドカリ魔', 'shell', '#ffb08a', '#8a3a1a'], ['エイ魔', 'kite', '#8ab0d0', '#2a3a5a'], ['ナマコ魔', 'rod', '#6a5a4a', '#2a1a10'], ['ヒトデ王', 'star', '#ffb06a', '#a04a1a'], ['泡クラゲ魔', 'bubble', '#c0e0ff', '#5a8ab0']],
    candy: [['マシュマロ魔', 'pillow', '#ffffff', '#ffd0e0'], ['アイス魔', 'cone', '#fff0d0', '#c08a4a'], ['ゼリービーンズ魔', 'lemon', '#7aff7a', '#ff4ab0'], ['チョコバナナ魔', 'banana', '#6a3a1a', '#ffe08a'], ['金平糖王', 'spiky', '#ffb0e0', '#a03a8a'], ['ハートチョコ魔', 'heart', '#8a4a2a', '#3a1a0a']],
    sky: [['つばめ雲魔', 'feather', '#c0d0ff', '#3a4a8a'], ['風船魔', 'bubble', '#ff6a6a', '#8a1a1a'], ['虹の泡魔', 'bubble', '#ffd0ff', '#5aa0ff'], ['かみなり小僧', 'imp', '#fff06a', '#8a6a00'], ['夜明け魔', 'sun', '#ffb06a', '#c04a3a'], ['気球魔', 'pear', '#ffd04a', '#a03a1a']],
    toxic: [['毒ガマ魔', 'blob', '#7aff4a', '#1a5a0a'], ['毒針魔', 'spiky', '#c0ff4a', '#3a6a0a'], ['腐った卵魔', 'egg', '#c0c08a', '#5a5a1a'], ['毒雲魔', 'cloud', '#a0ff6a', '#3a5a1a'], ['毒の目', 'eyeball', '#e0ffc0', '#5aa01a'], ['瘴気の霊', 'ghost', '#c0ffa0', '#3a6a1a']],
    rock: [['ころころ岩魔', 'ball', '#a09080', '#4a3a2a'], ['砂時計岩魔', 'hourglass', '#e0c08a', '#8a6a3a'], ['石像魔', 'skull', '#c8c0b0', '#5a5040'], ['水晶岩魔', 'geode', '#a0e0ff', '#3a5a8a'], ['砂嵐魔', 'cloud', '#e0c08a', '#8a6a3a'], ['隕石岩魔', 'rock', '#5a4a4a', '#ff5a1a']],
    geo: [['円柱', 'drum', '#ffd36a', '#c9781a'], ['クラインの壺', 'bell', '#a0f0ff', '#3a6aa8'], ['ハート曲線', 'heart', '#ff6a9a', '#a01a4a'], ['四角錐', 'cone', '#9affb0', '#1a7a4a'], ['コッホ雪片', 'snowflake', '#ffffff', '#5a6aa8'], ['無限大', 'torus', '#ffe14a', '#a87a00']],
    cyber: [['ポップアップ広告', 'pillow', '#fff06a', '#ff3a3a'], ['フィッシング', 'kite', '#6ae0ff', '#1a4a6a'], ['ゾンビPC', 'robot', '#6a8a6a', '#1a2a1a'], ['データ雲', 'cloud', '#a0f0ff', '#2a6aa8'], ['パスワード破り', 'gear', '#ff4af0', '#3a0a4a'], ['ビット玉', 'ico', '#7aff7a', '#0a5a0a']],
    time: [['時計うさぎ魔', 'clock', '#ffffff', '#ff8ab0'], ['日時計魔', 'sun', '#ffe08a', '#a07a1a'], ['カレンダー魔', 'pillow', '#ffffff', '#ff3a3a'], ['タイムカプセル魔', 'egg', '#c0c8d0', '#4a5a6a'], ['化石時計魔', 'shell', '#e0d0b0', '#8a7a5a'], ['未来の卵魔', 'egg', '#a0f0ff', '#2a6aa8']],
    dream: [['あくび魔', 'slime', '#ffe0f0', '#a07ab0'], ['寝言魔', 'note', '#c0b0ff', '#5a4aa0'], ['ゆめ蝙蝠', 'bat', '#d0a0ff', '#4a2a8a'], ['星の羊雲', 'cloud', '#ffffd0', '#a0a070'], ['ねがお魔', 'moon', '#ffd0f0', '#8a5ab0'], ['ぬいぐるみ魔', 'fuzzy', '#ffc0a0', '#a05a3a']],
    music: [['メトロノーム魔', 'tetra', '#d0a080', '#6a3a1a'], ['ラッパ魔', 'cone', '#ffd04a', '#a07a00'], ['ピアノ魔', 'pillow', '#ffffff', '#1a1a1a'], ['ト音記号魔', 'spiral', '#ffffff', '#3a3a5a'], ['カスタネット魔', 'macaron', '#ff5a5a', '#3a3aff'], ['ハーモニカ魔', 'cube', '#c0c8d0', '#4a5a6a']],
    void: [['虚ろな影', 'ghost', '#1a1a2a', '#000000'], ['逆さの月', 'moon', '#5a3a8a', '#0a0014'], ['虚無の卵', 'egg', '#2a1a3a', '#000000'], ['裂け目の目', 'eyeball', '#ff4af0', '#1a001a'], ['空間のゆがみ', 'torus', '#8a6aff', '#14002a'], ['忘却の雲', 'cloud', '#4a4a6a', '#0a0a14']],
    divine: [['小天使魔', 'angel', '#fff6d0', '#e0b04a'], ['聖なる鐘魔', 'bell', '#fff0a0', '#c09a1a'], ['光の羽根', 'feather', '#fffaf0', '#e0c88a'], ['神の盃', 'cupcake', '#ffd04a', '#a07a00'], ['天の星', 'star', '#ffffff', '#a0c0ff'], ['神鏡魔', 'disc', '#e0e8ff', '#8a9ab0']],
    chaos: null,
  };
  {
    const r = mulberry(4242);
    const all = [];
    REALMS.forEach((R) => { if (R.id !== 'chaos') (EXTRA[R.id] || []).concat(R.types).forEach((t) => all.push(t)); });
    const used = new Set(REALMS[REALMS.length - 1].types.map((t) => t[1]));
    const pick = [];
    while (pick.length < 6) { const t = all[Math.floor(r() * all.length)]; if (used.has(t[1])) continue; used.add(t[1]); pick.push(['混沌' + t[0].replace(/魔$/, ''), t[1], t[2], t[3]]); }
    EXTRA.chaos = pick;
  }

  // ------------------------------------------------------------- 敵の特徴（次元ごとに3つ。同じ姿でも次元が違えば動きが違う）
  // acc: 特徴の目印の小物 / hp・dna・sp・size: 強さの倍率
  const TRAITS = {
    shield: { name: '盾持ち', pre: '盾持ち', icon: '🛡️', desc: '盾でダメージを0.35倍に減らす（芯・会心・貫く武器は通る）', acc: 'shield' },
    blink: { name: 'ワープ', pre: 'ワープ', icon: '🌀', desc: 'ときどき瞬間移動する', acc: 'antenna' },
    dash: { name: '突進', pre: '突進', icon: '💨', desc: 'ときどき猛スピードで突っ込む', acc: 'helmet' },
    clone: { name: '分身', pre: '分身', icon: '👥', desc: '初めて当たると2体に分かれる', acc: 'mask' },
    heal: { name: '癒し手', pre: '癒しの', icon: '💚', desc: 'まわりの仲間の傷を治す', acc: 'cross' },
    shrink: { name: 'ちぢみ', pre: 'ちぢみ', icon: '🔻', desc: '当たるたびに小さくなる', acc: 'ribbon' },
    rage: { name: '激昂', pre: '激昂', icon: '💢', desc: '体力が半分を切ると2倍速くなる', acc: 'horns' },
    float: { name: 'ふわふわ', pre: 'ふわふわ', icon: '🎈', desc: '大きく揺れながら漂う', acc: 'flower' },
    spin: { name: '回転', pre: '回転', icon: '🔄', desc: '遅い斬撃を弾く（撃つ武器は効く）', acc: 'eyepatch' },
    hide: { name: '隠れ身', pre: '隠れ', icon: '🫥', desc: 'ときどき消えて当たらない', acc: 'scarf' },
    magnet: { name: '磁石', pre: '磁石', icon: '🧲', desc: 'まわりの敵を引き寄せる（まとめて倒すチャンス）', acc: 'antenna' },
    bloat: { name: 'ふくらみ', pre: 'ふくらみ', icon: '🎈', desc: 'だんだん大きくなる。大きいほど稼げるが、やがて逃げる', acc: null, dna: 1.2 },
    rich: { name: '金持ち', pre: '金持ち', icon: '💰', desc: '通貨を3倍落とすが、逃げ足が速い', acc: 'tophat', dna: 3, sp: 1.3 },
    tough: { name: '頑丈', pre: '頑丈な', icon: '🧱', desc: '体力2倍', acc: 'helmet', hp: 2, size: 1.12 },
    swift: { name: '俊足', pre: '俊足', icon: '⚡', desc: '動きが1.8倍速い', acc: 'mustache', sp: 1.8 },
    tiny: { name: 'ちび', pre: 'ちび', icon: '🐣', desc: '小さくて弱いが当てにくい', acc: 'crown', size: 0.65, hp: 0.5, dna: 0.8 },
  };
  const TRAIT_IDS = Object.keys(TRAITS);
  const ACCS = ['horns', 'hat', 'shades', 'halo', 'crown', 'mask', 'ribbon', 'helmet', 'mustache', 'scarf', 'eyepatch', 'flower', 'tophat'];

  // ------------------------------------------------------------- 武器の種類（次元ごとに1つ）
  // cls: slash = ドラッグで斬る / shoot = 押して撃つ（押したままで連射）
  // fire（撃つ武器）: rate 1秒に何発 / dmg 1発の倍率 / n 弾の数 / spread ばらけ / sp 弾の速さ / pierce 貫通 / aoe 爆発の半径
  //   beam 光線 / homing 追尾 / bounce 跳ね返り / ret 戻ってくる / range 届く距離
  const WK = {
    katana: { cls: 'slash', name: '刀', icon: '🗡️', wsuf: ['丸', '切', '正'] },
    sword: { cls: 'slash', name: '剣', icon: '⚔️', wsuf: ['剣', 'ブレード', '刃'] },
    greatsword: { cls: 'slash', name: '大剣', icon: '⚔️', wsuf: ['大剣', '巨剣', '剛剣'] },
    dagger: { cls: 'slash', name: 'ナイフ', icon: '🔪', wsuf: ['ナイフ', '短剣', '小刀'] },
    cleaver: { cls: 'slash', name: '包丁', icon: '🔪', wsuf: ['包丁', '牛刀', '鉈'] },
    saber: { cls: 'slash', name: '光剣', icon: '⚔️', wsuf: ['セイバー', '光剣', 'ビーム刃'] },
    spear: { cls: 'slash', name: '槍', icon: '🔱', wsuf: ['槍', '銛', '矛'] },
    scythe: { cls: 'slash', name: '大鎌', icon: '⚔️', wsuf: ['鎌', '大鎌', '死神鎌'] },
    claw: { cls: 'slash', name: '爪', icon: '🐾', wsuf: ['爪', '鉤爪', '手甲'] },
    handgun: { cls: 'shoot', name: '拳銃', icon: '🔫', wsuf: ['銃', 'リボルバー', 'ハンドガン'], fire: { rate: 4, dmg: 0.75, n: 1, spread: 0.015, sp: 44 } },
    machinegun: { cls: 'shoot', name: 'マシンガン', icon: '🔫', wsuf: ['マシンガン', 'ガトリング', '連射銃'], fire: { rate: 8, dmg: 0.17, n: 1, spread: 0.075, sp: 48 } },
    shotgun: { cls: 'shoot', name: 'ショットガン', icon: '🔫', wsuf: ['ショットガン', '散弾銃', 'ブラスター'], fire: { rate: 1.3, dmg: 0.2, n: 6, spread: 0.26, sp: 36, range: 8 } },
    sniper: { cls: 'shoot', name: '狙撃銃', icon: '🎯', wsuf: ['ライフル', '狙撃銃', 'スナイパー'], fire: { rate: 0.8, dmg: 3.0, n: 1, spread: 0, sp: 140, pierce: 99 } },
    rocket: { cls: 'shoot', name: 'ランチャー', icon: '🚀', wsuf: ['ランチャー', '砲', 'バズーカ'], fire: { rate: 0.8, dmg: 0.9, n: 1, spread: 0.02, sp: 17, aoe: 1.9 } },
    laser: { cls: 'shoot', name: '光線銃', icon: '🔦', wsuf: ['レーザー', '光線銃', 'ビーム砲'], fire: { rate: 10, dmg: 0.055, n: 1, beam: 1, pierce: 99 } },
    bow: { cls: 'shoot', name: '弓', icon: '🏹', wsuf: ['弓', '長弓', '弩'], fire: { rate: 1.8, dmg: 0.9, n: 1, spread: 0.01, sp: 34, pierce: 1 } },
    staff: { cls: 'shoot', name: '魔法の杖', icon: '🪄', wsuf: ['杖', '魔杖', 'ワンド'], fire: { rate: 2.4, dmg: 0.5, n: 2, spread: 0.5, sp: 12, homing: 7 } },
    shuriken: { cls: 'shoot', name: '手裏剣', icon: '✴️', wsuf: ['手裏剣', '苦無', '円月輪'], fire: { rate: 2.6, dmg: 0.26, n: 1, spread: 0.02, sp: 26, bounce: 2 } },
    boomerang: { cls: 'shoot', name: 'ブーメラン', icon: '🪃', wsuf: ['ブーメラン', '投げ輪', '戻り刃'], fire: { rate: 1.1, dmg: 0.26, n: 1, spread: 0, sp: 20, pierce: 99, ret: 4.6 } },
  };
  const SLASH_K = Object.keys(WK).filter((k) => WK[k].cls === 'slash');
  const SHOOT_K = Object.keys(WK).filter((k) => WK[k].cls === 'shoot');
  // 武器の名前に使う、界ごとの言葉
  const WTHEME = {
    slime: ['ぷる', 'ねば', 'ゼリー', 'しずく', 'ぷに', 'とろ', 'ぽよ', 'ぷるん', 'グミ', 'ムース', 'もち', 'ジェル'],
    crystal: ['水晶', '紫晶', '金剛', '翠玉', '紅玉', '蒼玉', '黄玉', '月長石', '黒曜', '虹晶', '琥珀', '瑠璃'],
    fruit: ['リンゴ', 'ミカン', 'バナナ', 'スイカ', 'イチゴ', 'ブドウ', 'モモ', 'レモン', 'メロン', 'キウイ', 'パイン', 'ザクロ'],
    ghost: ['人魂', '提灯', '卒塔婆', '鬼火', '狐火', '百鬼', '黄泉', '冥府', '怨念', '御札', '数珠', '髑髏'],
    mech: ['歯車', 'ネジ', '鋼鉄', '電磁', '原子', '合金', 'プラズマ', 'ターボ', 'ギア', 'ロボ', 'サイバー', 'メカ'],
    star: ['流星', '彗星', '銀河', '星雲', '月光', '日輪', '惑星', '土星', '北斗', '天狼', '昴', '宇宙'],
    ice: ['氷柱', '雪月', '吹雪', '霜', '氷河', '凍土', '白銀', 'オーロラ', '雪華', '氷晶', '冬将軍', '極寒'],
    fire: ['火炎', '劫火', '溶岩', '火山', '焔', '烈火', '紅蓮', '炎竜', '灼熱', '火の鳥', '爆炎', '煉獄'],
    sea: ['珊瑚', '真珠', '深海', '潮', '渦潮', '海竜', '波', '人魚', '竜宮', '貝', '海神', '錨'],
    candy: ['ドーナツ', 'チョコ', 'キャンディ', 'マカロン', 'プリン', 'ケーキ', 'クッキー', 'グミ', 'わたあめ', 'ショコラ', 'パフェ', 'ワッフル'],
    sky: ['雷雲', '虹', '旋風', '青空', '雲海', '天空', '暁', '夕焼', '嵐', 'そよ風', '稲妻', '翼'],
    toxic: ['毒', '瘴気', '胞子', '苔', '沼', '腐蝕', '紫毒', '猛毒', '茸', '霧', '泥', '蟲毒'],
    rock: ['岩', '鋼岩', '花崗', '玄武', '大地', '砂岩', '巨石', '鉱脈', '金塊', '化石', '断崖', '地殻'],
    geo: ['円', '三角', '四角', '黄金比', 'π', '∞', 'ベクトル', 'フラクタル', '螺旋', '多面', '座標', '虚数'],
    cyber: ['ビット', 'バイト', 'ピクセル', 'データ', 'ネット', 'コード', 'バグ', 'キャッシュ', 'ノード', 'クラウド', '量子', 'ロジック'],
    time: ['刻', '秒針', '砂時計', '振り子', '暦', '永劫', '刹那', '未来', '過去', '時空', '歯車', '暁'],
    dream: ['夢', 'まどろみ', 'ひつじ', '枕', '星屑', '月夜', 'おもちゃ', '綿', '虹色', '夜想', 'うたた寝', '幻'],
    music: ['音符', '旋律', '和音', '鼓動', 'リズム', 'ビート', 'ソナタ', 'ロック', 'ジャズ', '雅楽', '合唱', '交響'],
    void: ['虚無', '深淵', '影', '裂け目', '反物質', '事象', '忘却', '無限', '暗黒', '特異点', '零', '終焉'],
    divine: ['神', '天', '聖', '光輪', '天使', '神鳴', '神風', '神楽', '天照', '月読', '須佐', '八咫'],
    chaos: ['混沌', 'カオス', '乱', '渦', '万華', '狂', 'でたらめ', 'ごちゃ', '反転', '逆', '謎', '∞'],
  };

  // ------------------------------------------------------------- 次元の一覧（0 = 菌斬り次元）
  const PER = 10;
  const LIST = [{ i: 0, id: 'd0', realm: -1, local: 0, name: '菌斬り次元', icon: '🧫', gim: 'normal', hue: 0, kind: 'katana' }];
  REALMS.forEach((R, ri) => {
    const r = mulberry(77 + ri * 131);
    const pool = GIM_IDS.slice();
    for (let k = pool.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = pool[k]; pool[k] = pool[j]; pool[j] = t; }
    // 武器の種類: 1番目は界の武器、残り9つは近接4〜5・遠距離4〜5になるように混ぜる
    const base = R.form === 'mix' ? 'sword' : R.form;
    const sl = SLASH_K.filter((x) => x !== base), sh = SHOOT_K.slice();
    for (const a of [sl, sh]) for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = a[k]; a[k] = a[j]; a[j] = t; }
    const kinds = [base];
    const nSh = 4 + (ri % 2);
    for (let k = 0; k < 9; k++) kinds.push(k < nSh ? sh[k] : sl[k - nSh]);
    for (let k = kinds.length - 1; k > 1; k--) { const j = 1 + Math.floor(r() * k); const t = kinds[k]; kinds[k] = kinds[j]; kinds[j] = t; }
    for (let k = 0; k < PER; k++) {
      const gim = k === 0 ? 'normal' : pool[k - 1];
      const i = LIST.length;
      LIST.push({ i, id: 'd' + i, realm: ri, local: k, name: `${GIM[gim].pre}${R.noun}次元`, icon: R.icon, gim, hue: k ? (k * 47 + ri * 13) % 360 : 0, kind: kinds[k] });
    }
  });
  const N = LIST.length;
  const realmOf = (m) => (m && m.realm >= 0 ? REALMS[m.realm] : null);

  // ------------------------------------------------------------- 次元の中身（入ったときに作る）
  const WADJ = ['', '深き', '燃える', '凍てつく', '輝く', '眠れる', '狂った', '古の', '天上の', '果ての'];
  const ARANK = ['見習い', '新米', '一人前の', '熟練の', '精鋭の', '歴戦の', '達人の', '英雄の', '伝説の', '聖なる', '神速の', '天上の', '時空の', '無限の'];
  const BLINES = ['すべてを、のみこむ', '斬れるものなら、斬ってみろ', '王の前に、ひれ伏せ', 'この次元は、我が城', 'まだ、本気ではない', '何度でも、よみがえる', 'お前の刃は、届かない', '終わりのない悪夢を', '次元ごと、砕いてやる', 'ここから先へは、通さない', '我こそが、この界の主', '最後に笑うのは、私だ'];
  function gen(i) {
    const m = LIST[i], R = realmOf(m);
    const r = mulberry(5003 + i * 7919);
    const hue = m.hue, hT = Math.round(hue * 0.35);
    // 敵: 界の20種から14種（1番目の次元は界の基本の14種）。特徴3つを割り当て、名前と動きを変える
    const pool = R.types.concat(EXTRA[R.id] || []);
    let pickI;
    if (m.local === 0) pickI = R.types.map((t, k) => k);
    else {
      const idx = pool.map((t, k) => k).slice(1);
      for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = idx[k]; idx[k] = idx[j]; idx[j] = t; }
      pickI = [0].concat(idx.slice(0, 13));
    }
    const tr = TRAIT_IDS.slice();
    for (let k = tr.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = tr[k]; tr[k] = tr[j]; tr[j] = t; }
    const traits = m.local === 0 ? [['rich', 'tiny', 'swift', 'tough'][m.realm % 4]] : tr.slice(0, 3);
    const TYPES = pickI.map((pi, k) => {
      const t = pool[pi];
      const has = m.local === 0 ? k % 3 === 2 : k % 4 !== 0;
      const T0 = has ? TRAITS[traits[(k - 1) % traits.length] || traits[0]] : null;
      const tid = T0 ? TRAIT_IDS.find((x) => TRAITS[x] === T0) : null;
      const base = Object.assign({}, TPL[k]);
      if (T0) { base.hp *= T0.hp || 1; base.dna *= T0.dna || 1; base.sp *= T0.sp || 1; base.size *= T0.size || 1; }
      return Object.assign(base, {
        id: 't' + k, name: T0 ? T0.pre + t[0] : t[0], shape: t[1], col: [shift(t[2], hT), shift(t[3], hT)], cap: shift(t[2], hT, 0.16),
        desc: `${R.name}に棲む${t[0]}（空想）。${T0 ? `特徴「${T0.name}」: ${T0.desc}。` : ''}`, trait: tid, tacc: T0 ? T0.acc : null,
      });
    });
    // 株の小物も次元ごとに違う組み合わせ
    const acc = ACCS.slice();
    for (let k = acc.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = acc[k]; acc[k] = acc[j]; acc[j] = t; }
    const STRAINS = [], STRAIN = {};
    for (const t of TYPES) {
      for (let s = 0; s < 10; s++) {
        const pal = s ? (SG.PAL[s] === 'rainbow' ? 'rainbow' : SG.PAL[s].map((c) => shift(c, hT))) : t.col;
        const x = { sid: `${t.id}_${s}`, type: t.id, s, name: SG.ADJ[s] + t.name, pal, cap: s ? SG.CAP[s] : t.cap, acc: s ? acc[(s - 1) % 5] : null, tacc: t.tacc, trait: t.trait, hp: 1 + 0.12 * s, dna: 1 + 0.18 * s, sp: 1 + 0.04 * s, wave: s ? t.wave + s * 9 : t.wave };
        STRAINS.push(x);
        STRAIN[x.sid] = x;
      }
    }
    const BOSSES = [];
    for (let k = 0; k < 110; k++) {
      const t = TYPES[(k * 5) % 14];
      const s = k % 10;
      const pal = s ? (SG.PAL[s] === 'rainbow' ? ['#ffb0ff', '#4a0a6a'] : SG.PAL[s].map((c) => shift(c, hT))) : t.col;
      BOSSES.push({ name: `${KG.TITLES[(k + i) % KG.TITLES.length]}・${SG.ADJ[s]}${t.name}`, type: t.id, strain: s, crown: k % 3 === 0 || k % 10 === 9, col: pal, line: BLINES[(k + i) % BLINES.length], gen: true });
    }
    const BIOMES = [];
    for (let k = 0; k < 100; k++) {
      const base = R.bg[k % R.bg.length];
      const deg = (hue + (k % 10) * 29 + Math.floor(k / 10) * 13) % 360;
      BIOMES.push({ name: WADJ[Math.floor(k / 10)] + R.places[k % 10], bg: base.map((c) => shift(c, deg)), amb: R.amb[k % R.amb.length], ambCol: shift(base[1], deg, 0.15), light: shift(base[1], deg, 0.3), rainbow: k % 10 === 9, gen: true });
    }
    // 武器: 44シリーズ × 10本。種類（刀・剣・拳銃・弓…）は次元ごと、名前は界の言葉、色は次元ごと
    // 遠距離の武器は「間合い」→連射速度、「残心」→弾が増える、に読み替える。
    // MYTH以上の名物武器は、この次元のルールを強める「理」つき
    const KATANAS = [], OUGI = {}, KSERIES = [];
    const names = new Set();
    const kind = m.kind || R.form, K0 = WK[kind] || WK.sword;
    const shoot = K0.cls === 'shoot';
    const theme = WTHEME[R.id] || [R.noun];
    const gimN = GIM[m.gim];
    KG.KS.forEach((s, si) => {
      const [kanji, label, light, dark, glow, fx, tsuba, slash, ov, pat, motif, focus0, line, hi] = s;
      const seq = hi ? KG.SEQ_HI : KG.SEQ;
      const ids = [];
      // 混沌界は系譜ごとに形が変わる（近接か遠距離かは次元で同じ）
      const form = R.form === 'mix' ? (shoot ? SHOOT_K : SLASH_K)[(si + i) % (shoot ? SHOOT_K : SLASH_K).length] : kind;
      const KW = WK[form];
      const focus = shoot && focus0 === 'reach' ? 'rate' : shoot && focus0 === 'zanshin' ? 'multi' : focus0;
      seq.forEach((rr, k) => {
        const ri = KG.RI[rr];
        let nm = '';
        for (let t = 0; t < 60 && (!nm || names.has(nm)); t++) {
          const th = theme[Math.floor(r() * theme.length)], suf = KW.wsuf[Math.floor(r() * KW.wsuf.length)];
          nm = ri >= 9 ? `${gimN.name === '標準' ? '' : gimN.name}${th}${suf}` : ri >= 3 ? th + KG.C2[Math.floor(r() * KG.C2.length)] + suf : ri >= 2 ? kanji + th + suf : th + suf + (t > 8 ? KG.C2[Math.floor(r() * KG.C2.length)] : '');
        }
        names.add(nm);
        const dh = (k - 4.5) * 8 + hue;
        const sp = {};
        sp[focus] = +((KG.KSPK[focus] || KG.KSPK.issen) * (ri + 1)).toFixed(4);
        if (KG.ALL_HI[rr]) sp.all = (sp.all || 0) + KG.ALL_HI[rr];
        if (hi && ri >= 7 && m.gim !== 'normal') sp.gim = ri >= 9 ? 2 : ri >= 8 ? 1 : 0.5;
        const w = {
          id: `w${i}_${si}_${k}`, r: rr, name: ri >= 3 ? `${label}「${nm}」` : nm, desc: `${label}の系譜、${k + 1}本目の${KW.name}。${line}。${sp.gim ? `この次元のルール「${gimN.name}」を強める。` : ''}`,
          blade: [shift(light, dh, ri >= 6 ? 0.05 : 0), shift(dark, dh)], handle: shift(dark, dh + 30, -0.12), glow: ri >= 2 ? glow : undefined,
          k: { form, cls: KW.cls, tsuba: k % 3 ? tsuba : KG.TSUBA[(si + k) % KG.TSUBA.length], hamon: ri >= 2 ? shift(light, dh + 20, 0.15) : undefined, len: +(0.85 + 0.05 * Math.min(ri, 8) + r() * 0.08).toFixed(2), curve: +(0.6 + r() * 1.2).toFixed(2), fx: ri >= 4 ? fx || undefined : undefined, twin: ri >= 7 && k % 3 === 0 },
          sp, series: si, gen: true, pasK: 0.25, kind: 'katana', model: 'blade', dim: i,
        };
        KATANAS.push(w);
        ids.push(w.id);
        if (ri >= 3) OUGI[w.id] = { name: kanji + KG.OUGI_W[(si * 7 + k * 5 + i) % KG.OUGI_W.length], slash, ov, stamp: kanji, line: `${line}！`, pat, motif };
      });
      KSERIES.push({ id: 'ks' + si, icon: motif, name: `${label}の系譜`, ids, focus });
    });
    const CELLS = BASE.CELLS.map((c, k) => Object.assign({}, c, { name: ARANK[k] + R.ally, icon: R.allyIcons[k % R.allyIcons.length], col: shift(c.col, hue), desc: `${R.name}の${R.ally}。画面の端から${R.noun}を倒す。` }));
    const music = Object.assign({}, R.music, { tr: (m.local % 5) - 2, bpm: R.music.bpm + (m.local % 3) * 4 });
    return {
      i, meta: m, realm: R, TYPES, STRAINS, STRAIN, BOSSES, BIOMES, KATANAS, OUGI, KSERIES, CELLS, KILL_WORDS: R.kill,
      LB: { noun: R.noun, cur: R.cur, curIcon: R.curIcon, wpn: R.form === 'mix' ? (shoot ? '飛び道具' : '混沌刃') : K0.name, ally: R.ally, allyIcon: R.allyIcons[0], world: R.world, dim: m.name, icon: R.icon },
      music, starter: KATANAS[0].id, kind, cls: K0.cls, traits,
    };
  }
  const cache = new Map();
  function content(i) {
    if (!i) return BASE;
    let c = cache.get(i);
    if (c) { cache.delete(i); cache.set(i, c); return c; }
    c = gen(i);
    cache.set(i, c);
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    return c;
  }

  // ------------------------------------------------------------- 今の次元（GD の中身を入れ替える）
  let curI = 0, curC = BASE, LRX = null, LMAP = null;
  const PROTECT = ['一刀両断', '太刀', '抜刀', '返す刀', '刀身', '変異'];
  function buildLabel(c) {
    if (c === BASE) { LRX = null; LMAP = null; return; }
    const L = c.LB;
    const pairs = [
      ['菌斬り次元', L.dim], ['巨大病原体', `巨大${L.noun}`], ['ボス病原体', `ボス${L.noun}`], ['病原体', 'ボス'],
      ['免疫細胞', L.ally], ['免疫', L.ally], ['ミクロの世界', L.world], ['殺菌', '撃破'], ['除菌', '撃破'], ['ラッキー細胞', 'ラッキー妖精'],
      ['菌の株', `${L.noun}の種類`], ['菌', L.noun], ['DNA', L.cur], ['刀', L.wpn],
    ];
    LMAP = new Map(pairs);
    for (const w of PROTECT) LMAP.set(w, w);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    LRX = new RegExp([...LMAP.keys()].sort((a, b) => b.length - a.length).map(esc).join('|'), 'g');
  }
  function use(i) {
    i = Math.max(0, Math.min(N - 1, i | 0));
    if (curI) touched.add(curI);
    touched.add(i);
    const c = content(i);
    curI = i;
    curC = c;
    GD.TYPES = c.TYPES; GD.STRAINS = c.STRAINS; GD.STRAIN = c.STRAIN; GD.BOSSES = c.BOSSES; GD.BIOMES = c.BIOMES;
    GD.KATANAS = c.KATANAS; GD.OUGI = c.OUGI; GD.KSERIES = c.KSERIES; GD.CELLS = c.CELLS; GD.KILL_WORDS = c.KILL_WORDS;
    GD.GIM = i ? GIM[LIST[i].gim] : GIM.normal;
    buildLabel(c);
    return c;
  }
  const L = (s) => (LRX && s ? String(s).replace(LRX, (m) => LMAP.get(m)) : s);

  // ------------------------------------------------------------- 状態（セーブ）
  // 0番は S.germ（そのまま）。1番以降は S.dims['d' + i]
  function fresh() { return Object.assign(GD.freshGerm(), { gs: GD.freshStats(), lad: {}, hk: 0, idle: 0, seen: 0 }); }
  const peek = (S, i) => (i ? (S.dims && S.dims['d' + i]) || null : S.germ);
  const maxW = (S, i) => { const d = peek(S, i); return (d && d.maxWave) || 1; };
  // 開いているか: 0番は転生1回、1番以降は前の次元のウェーブ15
  function isOpen(S, i) {
    if (!i) return (S.stats.prestiges || 0) >= GD.CFG.UNLOCK_PRESTIGE;
    if (i >= N) return false;
    return isOpen(S, 0) && maxW(S, i - 1) >= unlockW(i - 1);
  }
  // 開いている中でいちばん先（最前線）
  function frontier(S) {
    if (!isOpen(S, 0)) return -1;
    let i = 0;
    while (i + 1 < N && maxW(S, i) >= unlockW(i)) i++;
    return i;
  }
  const stars = (ds) => (ds ? Math.floor(((ds.maxWave || 1) - 1) / 10) : 0);

  // 武器の id → 番号（シリーズ×10 + 何本目）
  const widx = (id) => { const p = id.split('_'); return (+p[1]) * 10 + (+p[2]); };
  const sidx = (sid) => { const p = sid.split('_'); return (+p[0].slice(1)) * 10 + (+p[1]); };
  // 個数の列を36進で「.」区切りに。0が続くところは「_長さ」にまとめる（例: 3._a.1 = 3, 0×10, 1）
  function packCounts(obj, n, idx) {
    const a = new Array(n).fill(0);
    let last = -1;
    for (const k in obj) { const j = idx(k); if (j >= 0 && j < n && obj[k] > 0) { a[j] = obj[k]; last = Math.max(last, j); } }
    const out = [];
    for (let j = 0; j <= last;) {
      if (a[j]) { out.push(Math.round(a[j]).toString(36)); j++; continue; }
      let z = 0;
      while (j <= last && !a[j]) { z++; j++; }
      out.push(z === 1 ? '' : '_' + z.toString(36));
    }
    return out.join('.');
  }
  function unpackCounts(s, i, mk) {
    const o = {};
    if (!s) return o;
    let j = 0;
    for (const v of s.split('.')) {
      if (!v) { j++; continue; }
      if (v[0] === '_') { j += parseInt(v.slice(1), 36) || 0; continue; }
      o[mk(j)] = parseInt(v, 36);
      j++;
    }
    return o;
  }
  // 武器・図鑑・奥義は今の次元でしか変わらないので、ほかの次元は前に詰めた文字列を使い回す
  const packCache = new Map(), touched = new Set();
  function pack(ds, i) {
    const o = {};
    let pc = packCache.get(i);
    if (!pc || pc.src !== ds || touched.has(i)) {
      pc = { src: ds, katc: packCounts(ds.kat || {}, 440, widx), dexc: packCounts(ds.dex || {}, 140, sidx), ouc: packCounts(ds.ougiSeen || {}, 440, widx) };
      packCache.set(i, pc);
    }
    for (const k in ds) {
      const v = ds[k];
      if (k === 'kat') o.katc = pc.katc;
      else if (k === 'dex') o.dexc = pc.dexc;
      else if (k === 'ougiSeen') o.ouc = pc.ouc;
      else if (k === 'gs') { const g = {}; for (const x in v) if (v[x]) g[x] = v[x]; o.gs = g; }
      else if (k === 'factor' || k === 'muts') continue;
      else o[k] = v;
    }
    return o;
  }
  function unpack(o, i) {
    const ds = Object.assign(fresh(), o);
    const w = (j) => `w${i}_${Math.floor(j / 10)}_${j % 10}`;
    if ('katc' in o) { ds.kat = unpackCounts(o.katc, i, w); delete ds.katc; }
    if ('dexc' in o) { ds.dex = unpackCounts(o.dexc, i, (j) => `t${Math.floor(j / 10)}_${j % 10}`); delete ds.dexc; }
    if ('ouc' in o) { ds.ougiSeen = unpackCounts(o.ouc, i, w); delete ds.ouc; }
    ds.gs = Object.assign(GD.freshStats(), o.gs || {});
    return ds;
  }
  function packAll(dims) {
    const o = {};
    for (const k in dims || {}) o[k] = pack(dims[k], +k.slice(1));
    touched.clear();
    if (curI) touched.add(curI); // 今の次元は次のセーブでも詰め直す
    return o;
  }
  function unpackAll(dims) {
    const o = {};
    for (const k in dims || {}) {
      const i = +k.slice(1);
      if (!(i >= 1 && i < N) || !dims[k] || typeof dims[k] !== 'object') continue;
      o[k] = dims[k].katc !== undefined || dims[k].dexc !== undefined || !dims[k].gs || !dims[k].kat ? unpack(dims[k], i) : dims[k];
    }
    return o;
  }

  // ------------------------------------------------------------- 次元の段位（実績のはしご）
  // th: 何段目（0〜）のしきい値。値から達成した段数を数える
  const lin = (a, b) => (t) => a + b * t;
  const geo = (a, rr) => (t) => nice(a * Math.pow(rr, t));
  const cnt = (o) => (o ? Object.keys(o).length : 0);
  const sumv = (o) => { let s = 0; for (const k in o || {}) s += o[k] || 0; return s; };
  const LAD = [
    { k: 'wave', icon: '🌊', name: 'ウェーブ到達', n: 100, th: lin(5, 5), v: (ds) => ds.maxWave || 1, txt: (x) => `ウェーブ${x}に到達` },
    { k: 'boss', icon: '👑', name: 'ボス討伐', n: 110, th: lin(1, 1), v: (ds) => stars(ds), txt: (x) => `ボスを${x}体倒す（10ウェーブごと）` },
    { k: 'world', icon: '🗺️', name: '世界の踏破', n: 100, th: lin(1, 1), v: (ds) => stars(ds) + 1, txt: (x) => `${x}番目の世界にたどり着く` },
    { k: 'dex', icon: '📖', name: '図鑑', n: 140, th: lin(1, 1), v: (ds) => cnt(ds.dex), txt: (x) => `敵を${x}種類図鑑に登録` },
    { k: 'kinds', icon: '⚔️', name: '武器コレクション', n: 440, th: lin(1, 1), v: (ds) => cnt(ds.kat), txt: (x) => `武器を${x}種類集める` },
    { k: 'series', icon: '🎴', name: '系譜コンプ', n: 44, th: lin(1, 1), v: (ds) => ds.ser || 0, txt: (x) => `武器の系譜を${x}個そろえる` },
    { k: 'kills', icon: '💀', name: '撃破', n: 40, th: geo(50, 1.6), v: (ds) => ds.gs.gKills || 0, txt: (x) => `${U.fmt(x)}体倒す` },
    { k: 'slices', icon: '🗡️', name: '太刀筋', n: 40, th: geo(100, 1.6), v: (ds) => ds.gs.gSlices || 0, txt: (x) => `${U.fmt(x)}回振る` },
    { k: 'cores', icon: '🎯', name: '芯斬り', n: 35, th: geo(20, 1.6), v: (ds) => ds.gs.gCores || 0, txt: (x) => `芯を${U.fmt(x)}回斬る` },
    { k: 'crits', icon: '💥', name: '会心', n: 35, th: geo(10, 1.6), v: (ds) => ds.gs.gCrits || 0, txt: (x) => `会心を${U.fmt(x)}回出す` },
    { k: 'rolls', icon: '🎰', name: '武器ガチャ', n: 40, th: geo(200, 1.7), v: (ds) => ds.gs.gRolls || 0, txt: (x) => `武器ガチャを${U.fmt(x)}回まわす` },
    { k: 'ougi', icon: '🌟', name: '奥義', n: 30, th: geo(2, 1.6), v: (ds) => ds.gs.gOugi || 0, txt: (x) => `奥義を${U.fmt(x)}回出す` },
    { k: 'musou', icon: '👹', name: '無双', n: 30, th: geo(1, 1.5), v: (ds) => ds.gs.gMusou || 0, txt: (x) => `無双モードに${U.fmt(x)}回入る` },
    { k: 'booms', icon: '💣', name: '誘爆', n: 30, th: geo(5, 1.6), v: (ds) => ds.gs.gBooms || 0, txt: (x) => `${U.fmt(x)}回爆発させる` },
    { k: 'forms', icon: '🎏', name: '群れ斬り', n: 30, th: geo(2, 1.55), v: (ds) => ds.gs.gForms || 0, txt: (x) => `群れを${U.fmt(x)}回全滅させる` },
    { k: 'slots', icon: '🎰', name: 'スロット', n: 25, th: geo(1, 1.5), v: (ds) => ds.gs.gSlots || 0, txt: (x) => `スロットを${U.fmt(x)}回まわす` },
    { k: 'gold', icon: '✨', name: '黄金', n: 25, th: geo(2, 1.6), v: (ds) => ds.gs.gGoldens || 0, txt: (x) => `黄金の敵を${U.fmt(x)}体斬る` },
    { k: 'out', icon: '☣️', name: '大発生', n: 25, th: geo(1, 1.5), v: (ds) => ds.gs.gOutbreaks || 0, txt: (x) => `大発生を${U.fmt(x)}回むかえる` },
    { k: 'combo', icon: '🔥', name: '連斬', n: 25, th: geo(20, 1.3), v: (ds) => ds.gs.gMaxCombo || 0, txt: (x) => `連斬${U.fmt(x)}を達成` },
    { k: 'issen', icon: '⚡', name: '一閃', n: 40, th: lin(2, 1), v: (ds) => ds.gs.gBestIssen || 0, txt: (x) => `一振りで${x}体斬る` },
    { k: 'cur', icon: '🪙', name: '通貨', n: 40, th: geo(1000, 8), v: (ds) => ds.gs.gDnaAll || 0, txt: (x) => `通貨を累計${U.fmt(x)}集める` },
    { k: 'time', icon: '⏱️', name: '滞在', n: 25, th: geo(60, 1.5), v: (ds) => ds.gs.gTime || 0, txt: (x) => `${U.fmtTime(x)}過ごす` },
    { k: 'allies', icon: '🛡️', name: '仲間', n: 30, th: geo(5, 1.6), v: (ds) => sumv(ds.cells), txt: (x) => `仲間を${U.fmt(x)}人集める` },
    { k: 'upg', icon: '⚙️', name: '研ぎ', n: 30, th: geo(5, 1.35), v: (ds) => sumv(ds.upg), txt: (x) => `研ぎを合計${U.fmt(x)}Lvにする` },
    { k: 'glv', icon: '🎲', name: 'ガチャLv', n: 40, th: lin(5, 5), v: (ds) => ds.kgLv || 1, txt: (x) => `武器ガチャLv${x}に到達` },
    { k: 'prest', icon: '♻️', name: '次元転生', n: 30, th: geo(1, 1.4), v: (ds) => ds.prest || 0, txt: (x) => `この次元で${U.fmt(x)}回転生する` },
    { k: 'pp', icon: '💠', name: '次元のかけら', n: 40, th: geo(1, 1.6), v: (ds) => ds.pp || 0, txt: (x) => `次元のかけらを${U.fmt(x)}個集める` },
  ];
  const LAD_N = LAD.reduce((s, l) => s + l.n, 0);
  function ladDone(l, v) {
    if (!(v > 0)) return 0;
    // 1次関数は割り算で、等比は数える（段数は最大でも数十）
    const t0 = l.th(0);
    if (v < t0) return 0;
    const t1 = l.th(1);
    if (l.th(2) - t1 === t1 - t0) return Math.min(l.n, Math.floor((v - t0) / (t1 - t0)) + 1);
    let d = 0;
    while (d < l.n && l.th(d) <= v) d++;
    return d;
  }
  // ds の全はしごを数え、増えた段数ぶん報酬を返す
  function ladEval(ds) {
    if (!ds.lad) ds.lad = {};
    let tot = 0, gain = 0;
    const ups = [];
    for (const l of LAD) {
      const d = ladDone(l, l.v(ds));
      const had = ds.lad[l.k] || 0;
      if (d > had) { ds.lad[l.k] = d; gain += d - had; ups.push({ l, from: had, to: d }); }
      tot += Math.max(d, had);
    }
    return { tot, gain, ups };
  }
  const ladTotal = (ds) => { let s = 0; for (const k in (ds && ds.lad) || {}) s += ds.lad[k]; return s; };

  // ------------------------------------------------------------- 合計と「次元の力」
  let TOT = null, totAt = -1e9;
  function totals(S, force) {
    const now = Date.now();
    if (!force && TOT && now - totAt < 1500) return TOT;
    totAt = now;
    let open = 0, visited = 0, st = 0, kinds = 0, tiers = 0, dex = 0, top = 0, pp = 0;
    for (let i = 0; i < N; i++) {
      if (!isOpen(S, i)) break;
      open++;
      const ds = peek(S, i);
      if (!ds) continue;
      if (i ? ds.seen : (S.stats.gVisits || 0) > 0) visited++;
      st += stars(ds);
      pp += ds.pp || 0;
      if (i) { kinds += cnt(ds.kat); tiers += ladTotal(ds); dex += cnt(ds.dex); }
      top = i;
    }
    const power = (1 + 0.1 * st) * (1 + 0.002 * kinds) * (1 + 0.001 * tiers) * (1 + 0.01 * pp);
    TOT = { open, visited, stars: st, kinds, tiers, dex, top, pp, power, forest: Math.sqrt(power) };
    return TOT;
  }
  const dirty = () => { totAt = -1e9; if (typeof G !== 'undefined' && G.dirty) G.dirty(); };

  return {
    N, LIST, REALMS, GIM, BASE, UNLOCK_W, unlockW, LAD, LAD_N, FORMS, WK, SLASH_K, SHOOT_K, TRAITS,
    traitsOf: (i) => (i ? content(i).traits : []),
    content, use, L, fresh, peek, isOpen, frontier, stars, pack, unpack, packAll, unpackAll,
    ladDone, ladEval, ladTotal, totals, dirty, realmOf,
    get cur() { return curI; },
    get C() { return curC; },
    get LB() { return curC.LB; },
    meta: (i) => LIST[i],
  };
})();

if (typeof module !== 'undefined') module.exports = { DM };
