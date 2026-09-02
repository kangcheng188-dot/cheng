/* 《突出重围》— 数据表
 * 枪械数值沿用《和平精英》本体设定，敌人/关卡按 SPEC.md 第 3、4 节。 */

export const AMMO = {
  '9mm':   { name: '9mm',      max: 300 },
  '.45':   { name: '.45ACP',   max: 300 },
  '5.56':  { name: '5.56mm',   max: 360 },
  '7.62':  { name: '7.62mm',   max: 360 },
  '12g':   { name: '12号弹',   max: 80  },
  '.300':  { name: '.300马格努姆', max: 60 },
  'rocket':{ name: '火箭弹',   max: 8   },
  'bolt':  { name: '弩箭',     max: 40  },
  'cell':  { name: '能量电池', max: 400 },
};

/* quality: 0白 1绿 2蓝 3紫 4金 */
export const QUALITY = [
  { name: '普通', color: '#d8dde3', glow: 'rgba(216,221,227,.45)' },
  { name: '精良', color: '#5fd66a', glow: 'rgba(95,214,106,.5)'  },
  { name: '稀有', color: '#4aa8ff', glow: 'rgba(74,168,255,.55)' },
  { name: '史诗', color: '#c06bff', glow: 'rgba(192,107,255,.55)'},
  { name: '传说', color: '#ffc23c', glow: 'rgba(255,194,60,.7)'  },
];
export const EVO_THRESHOLDS = [8, 20, 40, 70];

export const WEAPONS = {
  P92: {
    id: 'P92', name: 'P92', cn: '手枪', slot: 'side', ammo: '9mm',
    dmg: 26, interval: 0.11, mag: 15, reload: 1.9, pellets: 1, spread: 1.2,
    recoilV: 0.55, recoilH: 0.35, auto: false, range: 90, adsFov: 55,
    muzzle: '#ffd27a', sound: 'pistol', perk: null,
  },
  S686: {
    id: 'S686', name: 'S686', cn: '霰弹枪', slot: 'main', ammo: '12g',
    dmg: 24, interval: 0.30, mag: 2, reload: 2.4, pellets: 9, spread: 4.5,
    recoilV: 2.6, recoilH: 0.9, auto: false, range: 45, adsFov: 58,
    muzzle: '#ffb45a', sound: 'shotgun', perk: 'fire',
  },
  S12K: {
    id: 'S12K', name: 'S12K', cn: '霰弹枪', slot: 'main', ammo: '12g',
    dmg: 22, interval: 0.20, mag: 5, reload: 2.6, pellets: 9, spread: 5.0,
    recoilV: 2.2, recoilH: 0.8, auto: false, range: 45, adsFov: 58,
    muzzle: '#ffb45a', sound: 'shotgun', perk: 'fire',
  },
  UMP45: {
    id: 'UMP45', name: 'UMP45', cn: '冲锋枪', slot: 'main', ammo: '.45',
    dmg: 35, interval: 0.092, mag: 25, reload: 2.3, pellets: 1, spread: 1.6,
    recoilV: 0.75, recoilH: 0.42, auto: true, range: 110, adsFov: 50,
    muzzle: '#ffd27a', sound: 'smg', perk: 'lifesteal',
  },
  M416: {
    id: 'M416', name: 'M416', cn: '突击步枪', slot: 'main', ammo: '5.56',
    dmg: 41, interval: 0.086, mag: 30, reload: 2.1, pellets: 1, spread: 1.1,
    recoilV: 0.92, recoilH: 0.36, auto: true, range: 220, adsFov: 42,
    muzzle: '#ffe08a', sound: 'rifle', perk: 'pierce',
  },
  AKM: {
    id: 'AKM', name: 'AKM', cn: '突击步枪', slot: 'main', ammo: '7.62',
    dmg: 49, interval: 0.100, mag: 30, reload: 2.6, pellets: 1, spread: 1.5,
    recoilV: 1.42, recoilH: 0.62, auto: true, range: 220, adsFov: 42,
    muzzle: '#ffdd7a', sound: 'rifle', perk: 'pierce',
  },
  M24: {
    id: 'M24', name: 'M24', cn: '狙击枪', slot: 'main', ammo: '7.62',
    dmg: 79, interval: 1.80, mag: 5, reload: 3.2, pellets: 1, spread: 0.15,
    recoilV: 3.4, recoilH: 0.5, auto: false, range: 500, adsFov: 22,
    muzzle: '#fff0b0', sound: 'sniper', perk: 'explosive', bolt: true,
  },
  AWM: {
    id: 'AWM', name: 'AWM', cn: '狙击枪', slot: 'main', ammo: '.300',
    dmg: 120, interval: 1.90, mag: 5, reload: 4.6, pellets: 1, spread: 0.1,
    recoilV: 4.0, recoilH: 0.5, auto: false, range: 600, adsFov: 18,
    muzzle: '#fff0b0', sound: 'sniper', perk: 'explosive', bolt: true, crate: true,
  },
  M249: {
    id: 'M249', name: 'M249', cn: '轻机枪', slot: 'main', ammo: '5.56',
    dmg: 45, interval: 0.075, mag: 100, reload: 8.2, pellets: 1, spread: 2.2,
    recoilV: 1.05, recoilH: 0.55, auto: true, range: 240, adsFov: 45,
    muzzle: '#ffe08a', sound: 'lmg', perk: 'freeammo', crate: true,
  },
  M134: {
    id: 'M134', name: 'M134', cn: '米尼岗', slot: 'main', ammo: '7.62',
    dmg: 40, interval: 0.045, mag: 200, reload: 6.0, pellets: 1, spread: 3.0,
    recoilV: 0.55, recoilH: 0.75, auto: true, range: 200, adsFov: 55,
    muzzle: '#ffcf6a', sound: 'minigun', perk: 'freeammo', spinUp: 0.6, crate: true,
  },
  XBOW: {
    id: 'XBOW', name: '战术弩', cn: '特殊武器', slot: 'main', ammo: 'bolt',
    dmg: 105, interval: 1.20, mag: 1, reload: 1.6, pellets: 1, spread: 0.2,
    recoilV: 1.2, recoilH: 0.2, auto: false, range: 300, adsFov: 30,
    muzzle: '#9fe8ff', sound: 'bow', perk: 'bigpierce', silent: true, pierceBase: 2,
  },
  TESLA: {
    id: 'TESLA', name: '电击步枪', cn: '特殊武器', slot: 'main', ammo: 'cell',
    dmg: 30, interval: 0.10, mag: 40, reload: 2.4, pellets: 1, spread: 1.0,
    recoilV: 0.4, recoilH: 0.25, auto: true, range: 140, adsFov: 48,
    muzzle: '#b98cff', sound: 'tesla', perk: 'chainplus', chain: 3,
  },
  RPG7: {
    id: 'RPG7', name: 'RPG-7', cn: '火箭筒', slot: 'main', ammo: 'rocket',
    dmg: 180, interval: 1.6, mag: 1, reload: 3.4, pellets: 1, spread: 0.4,
    recoilV: 3.2, recoilH: 0.6, auto: false, range: 300, adsFov: 45,
    muzzle: '#ff9a4a', sound: 'rpg', perk: 'bigboom', projectile: 'rocket',
    splash: 7.5, crate: true,
  },
  PAN: {
    id: 'PAN', name: '平底锅', cn: '近战', slot: 'melee', ammo: null,
    dmg: 80, interval: 0.7, mag: Infinity, reload: 0, pellets: 1, spread: 0,
    recoilV: 0, recoilH: 0, auto: false, range: 3.2, adsFov: 65,
    muzzle: '#cccccc', sound: 'pan', perk: null, melee: true,
  },
};

export const PERK_TEXT = {
  pierce:    '满级特化：子弹贯穿 2 名敌人',
  fire:      '满级特化：火焰弹，命中点燃',
  explosive: '满级特化：爆炸弹头',
  lifesteal: '满级特化：命中吸血 8%',
  freeammo:  '满级特化：连续射击 3 秒不耗弹',
  bigpierce: '满级特化：贯穿 5 名敌人',
  chainplus: '满级特化：闪电连锁范围加倍',
  bigboom:   '满级特化：爆炸范围加倍',
};

export const ENEMIES = {
  grunt: {
    id: 'grunt', name: '仿生兵', hp: 100, speed: 5.0, dmg: 12,
    atkRange: 2.4, atkInterval: 1.0, scale: 1, color: 0xb9cadd, eye: 0xff3b3b,
    score: 100, ranged: false, headScale: 1,
  },
  rifleman: {
    id: 'rifleman', name: '仿生突击兵', hp: 130, speed: 4.1, dmg: 9,
    atkRange: 18, atkInterval: 0.6, burst: 3, scale: 1.02, color: 0x9aacc2, eye: 0xff3b3b,
    score: 150, ranged: true,
  },
  bomber: {
    id: 'bomber', name: '爆破仿生人', hp: 90, speed: 6.0, dmg: 55,
    atkRange: 2.6, atkInterval: 0.5, scale: 0.98, color: 0xd9705f, eye: 0xffe14a,
    score: 180, ranged: false, suicide: true, splash: 6,
  },
  drone: {
    id: 'drone', name: '侦察无人机', hp: 60, speed: 5.4, dmg: 6,
    atkRange: 22, atkInterval: 0.45, scale: 0.8, color: 0x87a3b8, eye: 0x4ad9ff,
    score: 160, ranged: true, flying: true, hoverY: 6.2,
  },
  heavy: {
    id: 'heavy', name: '重装仿生人', hp: 480, speed: 2.9, dmg: 26,
    atkRange: 3.0, atkInterval: 1.4, scale: 1.5, color: 0xb08a63, eye: 0xff7a2a,
    score: 350, ranged: false, frontShield: 0.7,
  },
  sniper: {
    id: 'sniper', name: '仿生狙击手', hp: 110, speed: 3.4, dmg: 65,
    atkRange: 60, atkInterval: 3.2, charge: 1.6, scale: 1.0, color: 0x8b90a8, eye: 0xff2020,
    score: 260, ranged: true, laser: true, preferDist: 42,
  },
  pyro: {
    id: 'pyro', name: '纵火仿生人', hp: 150, speed: 4.2, dmg: 10,
    atkRange: 16, atkInterval: 2.4, scale: 1.05, color: 0xdda657, eye: 0xff9a2a,
    score: 240, ranged: true, molotov: true, volatile: true,
  },
  shocker: {
    id: 'shocker', name: '电击仿生人', hp: 160, speed: 4.0, dmg: 18,
    atkRange: 9, atkInterval: 1.6, scale: 1.05, color: 0x9b80cf, eye: 0xc08cff,
    score: 260, ranged: true, blind: true, arc: true,
  },
  elite: {
    id: 'elite', name: '仿生督军', hp: 900, speed: 4.2, dmg: 35,
    atkRange: 3.6, atkInterval: 1.6, scale: 1.7, color: 0xf0c257, eye: 0xffd24a,
    score: 800, ranged: false, elite: true, slam: 8, shield: 300,
  },
  boss: {
    id: 'boss', name: '仿生领主·泰坦', hp: 6000, speed: 2.2, dmg: 40,
    atkRange: 40, atkInterval: 0.5, scale: 3.4, color: 0x848b9e, eye: 0xff2a2a,
    score: 5000, ranged: true, boss: true,
  },
};

/* 15 关波次表 —— SPEC 2.2 */
export const WAVES = [
  { n: 1,  name: '试探',     spawns: { grunt: 8 } },
  { n: 2,  name: '压迫',     spawns: { grunt: 8, rifleman: 4 } },
  { n: 3,  name: '爆破',     spawns: { grunt: 8, rifleman: 3, bomber: 3 }, note: '油桶连锁爆炸' },
  { n: 4,  name: '空袭',     spawns: { grunt: 7, rifleman: 4, bomber: 2, drone: 3 } },
  { n: 5,  name: '精英波',   spawns: { grunt: 8, rifleman: 5, heavy: 2, drone: 3 }, elite: true },
  { n: 6,  name: '交叉火力', spawns: { grunt: 8, rifleman: 6, sniper: 3, bomber: 3 } },
  { n: 7,  name: '潮涌',     spawns: { grunt: 10, rifleman: 6, bomber: 4, drone: 4 }, shrink: true },
  { n: 8,  name: '燃烧',     spawns: { grunt: 8, rifleman: 5, pyro: 4, heavy: 2, drone: 5 } },
  { n: 9,  name: '电磁',     spawns: { grunt: 8, rifleman: 6, shocker: 4, sniper: 3, drone: 5 } },
  { n: 10, name: '精英波',   spawns: { grunt: 8, rifleman: 6, heavy: 3, drone: 8 }, elite: 2, crate: true },
  { n: 11, name: '铁壁',     spawns: { heavy: 6, rifleman: 8, grunt: 10, shocker: 4 } },
  { n: 12, name: '蜂群',     spawns: { drone: 16, rifleman: 8, grunt: 8 } },
  { n: 13, name: '绞杀',     spawns: { grunt: 10, rifleman: 8, bomber: 5, heavy: 4, sniper: 4, pyro: 3 }, shrink: true },
  { n: 14, name: '黎明前',   spawns: { grunt: 10, rifleman: 8, bomber: 5, heavy: 4, shocker: 4, drone: 5 }, elite: 3 },
  { n: 15, name: '仿生领主·泰坦', spawns: {}, boss: true },
];

export const ITEMS = {
  bandage:  { id: 'bandage',  name: '绷带',     key: '4', use: 3.0, cd: 0.6, heal: 10, cap: 75,  color: '#e8e8e8', max: 10 },
  firstaid: { id: 'firstaid', name: '急救包',   key: '5', use: 4.0, cd: 0.6, heal: 999, cap: 75, color: '#ff5f5f', max: 6 },
  medkit:   { id: 'medkit',   name: '医疗箱',   key: '6', use: 8.0, cd: 0.6, heal: 999, cap: 100,color: '#ff3b3b', max: 3 },
  energy:   { id: 'energy',   name: '能量饮料', key: '7', use: 4.0, cd: 0.6, boost: 40, color: '#ffc23c', max: 8 },
  adrenal:  { id: 'adrenal',  name: '加速药剂', key: '8', use: 1.2, cd: 0.6, speed: 0.45, dur: 8, color: '#4ad9ff', max: 6 },
};

export const THROWABLES = {
  frag:    { id: 'frag',    name: '破片手雷', dmg: 110, radius: 8,  fuse: 3.0, color: '#5b7a3a', max: 6 },
  molotov: { id: 'molotov', name: '燃烧瓶',   dmg: 8,   radius: 5,  fuse: 1.4, color: '#d4622a', max: 5, burn: 8 },
  freeze:  { id: 'freeze',  name: '冰冻手雷', dmg: 10,  radius: 7,  fuse: 1.8, color: '#6fd7ff', max: 5, freeze: 4 },
  smoke:   { id: 'smoke',   name: '烟雾弹',   dmg: 0,   radius: 8,  fuse: 1.6, color: '#c9ccd2', max: 5, smoke: 12 },
};

export const ARMOR = {
  helmet: [
    { lv: 0, name: '无头盔', red: 0,    dur: 0 },
    { lv: 1, name: '一级头', red: 0.20, dur: 55 },
    { lv: 2, name: '二级头', red: 0.30, dur: 100 },
    { lv: 3, name: '三级头', red: 0.40, dur: 165 },
  ],
  vest: [
    { lv: 0, name: '无护甲', red: 0,    dur: 0 },
    { lv: 1, name: '一级甲', red: 0.20, dur: 200 },
    { lv: 2, name: '二级甲', red: 0.30, dur: 220 },
    { lv: 3, name: '三级甲', red: 0.40, dur: 250 },
  ],
};

export const DIFFICULTY = {
  normal: { id: 'normal', name: '普通',   hp: 1.0, dmg: 1.0, count: 1.0, revives: 3 },
  hard:   { id: 'hard',   name: '困难',   hp: 1.35, dmg: 1.3, count: 1.2, revives: 2 },
  hell:   { id: 'hell',   name: '地狱',   hp: 1.8, dmg: 1.7, count: 1.45, revives: 1 },
};

export const MAPS = {
  wasteland: { id: 'wasteland', name: '废土基地', desc: '沙尘弥漫的废弃军事基地，集装箱与哨塔构成天然掩体。' },
  zombie:    { id: 'zombie',    name: '丧尸营地', desc: '被感染体占领的前哨营地，夜色深沉，敌人更凶猛。' },
};

export const TITLES = [
  { min: 0,   name: '青铜突围者', color: '#c98a5a' },
  { min: 45,  name: '白银突围者', color: '#cfd8e3' },
  { min: 65,  name: '黄金突围者', color: '#ffc23c' },
  { min: 82,  name: '王牌·突出重围', color: '#ff6b3d' },
];
