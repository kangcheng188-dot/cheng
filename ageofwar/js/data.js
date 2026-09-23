'use strict';
// All gameplay numbers below were taken from the original Age of War (Louissi / Max Games, 2007)
// so the remake plays exactly like it. The original ran at 40 frames per second and every
// timer here is expressed in those frames ("ticks").

const FPS = 40;
const STAGE_H = 450;
const WORLD_W = 1000;
const GROUND_Y = 425;
const BASE_STAGE_W = 650;

// Units: name key, cost, training time (ticks), hp, melee dmg, ranged dmg, melee range, ranged range,
// hitzone width/height (from the original hit boxes) and animation timings (length / hit frame).
const UNITS = [
  null,
  { key: 'club',      cost: 15,     train: 40,  hp: 55,   dmg: 16,  rdmg: 0,   mr: 20,  rr: 0,   w: 31.6,  h: 44.3,
    anim: { idle: 50, walk: 43, attack: [[40, 20]], die: 24 } },
  { key: 'sling',     cost: 25,     train: 40,  hp: 42,   dmg: 10,  rdmg: 8,   mr: 20,  rr: 100, w: 31.6,  h: 44.3,
    anim: { idle: 50, walk: 43, attack: [[40, 20]], shoot: [32, 26], shootwalk: [43, 30], die: 24 } },
  { key: 'dino',      cost: 100,    train: 100, hp: 160,  dmg: 40,  rdmg: 0,   mr: 45,  rr: 0,   w: 81.4,  h: 62.3,
    anim: { idle: 48, walk: 40, attack: [[45, 21]], die: 50 } },
  { key: 'sword',     cost: 50,     train: 70,  hp: 100,  dmg: 35,  rdmg: 0,   mr: 20,  rr: 0,   w: 31.6,  h: 44.3,
    anim: { idle: 55, walk: 40, attack: [[47, 32], [50, 27]], die: 44 } },
  { key: 'archer',    cost: 75,     train: 50,  hp: 80,   dmg: 20,  rdmg: 9,   mr: 20,  rr: 130, w: 31.6,  h: 44.3,
    anim: { idle: 55, walk: 40, attack: [[47, 37], [50, 30]], shoot: [40, 15], shootwalk: [40, 16], die: 44 } },
  { key: 'knight',    cost: 500,    train: 100, hp: 300,  dmg: 60,  rdmg: 0,   mr: 60,  rr: 0,   w: 98.4,  h: 69,
    anim: { idle: 120, walk: 40, attack: [[52, 23]], die: 22 } },
  { key: 'dueler',    cost: 200,    train: 100, hp: 200,  dmg: 79,  rdmg: 0,   mr: 25,  rr: 0,   w: 33.5,  h: 51.3,
    anim: { idle: 125, walk: 47, attack: [[36, 18], [46, 24]], die: 27 } },
  { key: 'musket',    cost: 400,    train: 100, hp: 160,  dmg: 40,  rdmg: 20,  mr: 25,  rr: 130, w: 33.5,  h: 51.3,
    // the musketeer's close-range "attack" is his shooting animation and uses ranged damage
    anim: { idle: 85, walk: 47, attack: [[46, 13]], meleeIsRanged: true, shoot: [46, 13], shootwalk: [48, 1], die: 70 } },
  { key: 'cannoneer', cost: 1000,   train: 200, hp: 600,  dmg: 120, rdmg: 0,   mr: 25,  rr: 0,   w: 33.5,  h: 51.3,
    anim: { idle: 110, walk: 48, attack: [[78, 27]], die: 65 } },
  { key: 'meleeinf',  cost: 1500,   train: 100, hp: 350,  dmg: 100, rdmg: 0,   mr: 25,  rr: 0,   w: 33.5,  h: 51.3,
    anim: { idle: 129, walk: 49, attack: [[30, 14]], die: 26 } },
  { key: 'infantry',  cost: 2000,   train: 100, hp: 300,  dmg: 60,  rdmg: 30,  mr: 25,  rr: 130, w: 33.5,  h: 51.3,
    anim: { idle: 94, walk: 47, attack: [[21, 7]], shoot: [21, 7], shootwalk: [48, 3], die: 26 } },
  { key: 'tank',      cost: 7000,   train: 300, hp: 1200, dmg: 300, rdmg: 0,   mr: 100, rr: 0,   w: 173.5, h: 57.3,
    anim: { idle: 1, walk: 10, attack: [[63, 30]], die: 42 } },
  { key: 'godblade',  cost: 5000,   train: 100, hp: 1000, dmg: 250, rdmg: 0,   mr: 40,  rr: 0,   w: 44.5,  h: 69,
    anim: { idle: 58, walk: 47, attack: [[37, 23]], die: 65 } },
  { key: 'blaster',   cost: 6000,   train: 100, hp: 800,  dmg: 130, rdmg: 80,  mr: 40,  rr: 130, w: 44.5,  h: 69,
    anim: { idle: 94, walk: 34, attack: [[31, 20], [24, 12]], shoot: [14, 6], shootwalk: [38, 21], die: 46 } },
  { key: 'warmachine',cost: 20000,  train: 300, hp: 3000, dmg: 600, rdmg: 0,   mr: 100, rr: 0,   w: 116.5, h: 57,
    anim: { idle: 28, walk: 28, attack: [[90, 13]], die: 34 } },
  { key: 'super',     cost: 150000, train: 100, hp: 4000, dmg: 400, rdmg: 400, mr: 40,  rr: 150, w: 44.5,  h: 69,
    anim: { idle: 94, walk: 34, attack: [[31, 20], [24, 12]], shoot: [14, 6], shootwalk: [38, 21], die: 46 } },
];
const UNIT_SPEED = 0.7; // px per tick, same for every unit in the original

// Turrets: cost, ticks between shots, bullet type, damage, range, firing animation length and the
// frames of that animation that release a projectile (the real fire rate comes from both numbers).
const TURRETS = [
  null,
  { key: 'rockslingshot', cost: 100,    rate: 30,  bullet: 1,  dmg: 12,  range: 350, alen: 32, shots: [6] },
  { key: 'eggauto',       cost: 200,    rate: 11,  bullet: 2,  dmg: 5,   range: 300, alen: 10, shots: [6] },
  { key: 'primcatapult',  cost: 500,    rate: 70,  bullet: 3,  dmg: 25,  range: 400, alen: 55, shots: [8] },
  { key: 'catapult',      cost: 500,    rate: 70,  bullet: 3,  dmg: 40,  range: 400, alen: 99, shots: [20] },
  { key: 'firecatapult',  cost: 750,    rate: 70,  bullet: 4,  dmg: 50,  range: 400, alen: 99, shots: [20] },
  { key: 'oil',           cost: 1000,   rate: 100, bullet: 5,  dmg: 4,   range: 300, alen: 77, shots: [21], noAim: true },
  { key: 'smallcannon',   cost: 1500,   rate: 70,  bullet: 6,  dmg: 30,  range: 500, alen: 45, shots: [2] },
  { key: 'largecannon',   cost: 3000,   rate: 70,  bullet: 6,  dmg: 70,  range: 500, alen: 80, shots: [2] },
  { key: 'explcannon',    cost: 6000,   rate: 70,  bullet: 7,  dmg: 100, range: 500, alen: 80, shots: [2] },
  { key: 'singleturret',  cost: 7000,   rate: 40,  bullet: 8,  dmg: 70,  range: 500, alen: 45, shots: [3] },
  { key: 'rocketturret',  cost: 9000,   rate: 50,  bullet: 9,  dmg: 100, range: 500, alen: 40, shots: [2] },
  { key: 'doubleturret',  cost: 14000,  rate: 22,  bullet: 8,  dmg: 60,  range: 500, alen: 40, shots: [2, 21] },
  { key: 'titanium',      cost: 24000,  rate: 40,  bullet: 12, dmg: 100, range: 400, alen: 40, shots: [2] },
  { key: 'laser',         cost: 40000,  rate: 10,  bullet: 10, dmg: 40,  range: 500, alen: 3,  shots: [2] },
  { key: 'ion',           cost: 100000, rate: 10,  bullet: 11, dmg: 60,  range: 500, alen: 3,  shots: [2] },
];

const EVOLVE_XP = [4000, 14000, 45000, 200000];
const SLOT_COST = [1000, 3000, 7500];
const SPECIAL_COOLDOWN = 2000;          // ticks (50 s)
const START_CASH = 175;
const BASE_HP = 500;
const EVOLVE_BASE_HP = 300;             // * new age number
const DIFF_MULT = [1, 1, 1.3, 2];       // enemy hp & damage per difficulty (1 normal, 2 harder, 3 impossible)

// Positions from the original stage.
const PLAYER_BASE_X = 0, ENEMY_BASE_X = 1000;
const PLAYER_SPAWN_X = 150, ENEMY_SPAWN_X = 860;
const PLAYER_BASE_HIT = { x: 50, half: 93.4, left: -17.3, right: 169.5, top: 349.5 };
const ENEMY_BASE_HIT = { x: 950, half: 100.6, left: 855.4, right: 1056.8, top: 349.5 };
const TURRET_SPOT_X = 52;
const TURRET_SPOT_Y = [-80, -125, -172, -220];

// ---------------------------------------------------------------------------------------------
// Text. The English strings are the original game's; Chinese is a translation.
const I18N = {
  en: {
    title: 'AGE OF WAR',
    play: 'Play', instructions: 'Instructions', extras: 'Extras', moreGames: 'Play more games',
    byline: 'A game by louissi', tribute: 'Fan remake of the 2007 Flash classic · mobile / tablet / PC',
    difficulty: 'Difficulty:', chooseDiff: 'Choose a difficulty to start the game:',
    normal: 'Normal', harder: 'Harder', impossible: 'Impossible',
    backToMenu: 'Click here to return to the menu',
    instrText: [
      'The goal of the game is to survive and destroy the ennemy base.',
      '',
      'The game is divided in 5 ages. To move to the next age, you need',
      'Xp points. To gain these points, you have to kill ennemy units.',
      'You also gain Xp points when one of your units is killed. You can',
      'also build defences. Finding the balance between defence and',
      'offence is the key.',
      '',
      'You will also be able to use a special attack. This attack will need',
      ' time to be available again after you use it. Each age have its own',
      'special attack.',
      '',
      'You cannot repair your base, but it will gain health points',
      'everytime you evolve to the next age. Protect your base at all cost!',
    ],
    controlsText: 'Controls: move the mouse to the screen edges, drag, swipe or use the arrow keys to scroll the battlefield. Keys 1-4 train units, Q = special attack, E = evolve, Space = pause. On iPhone, "Add to Home Screen" plays full screen.',
    extrasTitle: 'Extras:', extrasSub: 'All the units of the five ages:',
    victory: 'Victory!', victorySub: 'Congratulations, you won the war and destroyed your ennemy.',
    defeat: 'Defeat!', defeatSub: "Maybe you didn't tried hard enough?",
    playAgain: 'Play again?', mainMenu: 'Back to the main menu',
    paused: 'PAUSED', resume: 'Press space again to resume', resumeTouch: 'Tap to resume',
    menu: 'Menu', menuUnits: 'Menu - Units', menuTurrets: 'Menu - Turrets', sellTitle: 'Sell a turret',
    special: 'Special:', exp: 'Exp:', cancel: 'CANCEL',
    trainMenu: 'Train units menu', turretMenu: 'Build turrets menu', sellMenu: 'Sell a turret',
    addSpot: (p) => p + '$ - Add a turret spot', cantBuild: "Can't build any more",
    evolve: (x) => x + ' Xp - Evolve to next age', cantEvolve: 'You cannot evolve anymore',
    returnPrev: 'Return to previous menu',
    unitInfo: (c, n) => c + '$ - ' + n, training: (n) => 'Training ' + n + '...',
    sellInfo: (n, p) => 'Sell ' + n + ' for ' + p + '$',
    specialName: ['Meteor shower', 'Arrow rain', 'Healing', 'Air strike', 'Ion cannon'],
    specialReady: (n) => n + ' - special attack', specialWait: (s) => 'Special attack recharging... ' + s + 's',
    rotate: 'Turn your device sideways for the best view', rotateGo: 'Play anyway',
    tapToStart: 'Play', loading: 'Loading',
    lang: '中文', sound: 'Sound', fullscreen: 'Fullscreen',
    unitNames: [null, 'Club man', 'Slingshot man', 'Dino rider', 'Sword man', 'Archer', 'Knight', 'Dueler',
      'Mousquettere', 'Canoneer', 'Melee Infantry', 'Infantry', 'Tank', "God's Blade", 'Blaster', 'War machine', 'Super Soldier'],
    turretNames: [null, 'Rock slingshot', 'Egg automatic', 'Primitive Catapult', 'Catapult', 'Fire Catapult', 'Oil',
      'Small Cannon', 'Large Cannon', 'Explosives Cannon', 'Single Turret', 'Rocket Turret', 'Double Turret',
      'Titanium Shooter', 'LazerCannon', 'IonRay'],
    ageNames: ['Stone Age', 'Medieval Age', 'Renaissance Age', 'Modern Age', 'Future Age'],
  },
  zh: {
    title: 'AGE OF WAR',
    play: '开始游戏', instructions: '游戏说明', extras: '兵种图鉴', moreGames: '更多游戏',
    byline: '原作：louissi', tribute: '2007 年经典 Flash 游戏复刻版 · 手机 / 平板 / 电脑',
    difficulty: '难度：', chooseDiff: '选择难度开始游戏：',
    normal: '普通', harder: '困难', impossible: '地狱',
    backToMenu: '点击这里返回菜单',
    instrText: [
      '游戏目标：守住自己的基地，并摧毁敌人的基地。',
      '',
      '游戏分为 5 个时代。要进入下一个时代，你需要经验值（Xp）。',
      '消灭敌方单位可以获得经验值；你的单位阵亡时也会获得少量经验值。',
      '你还可以建造炮塔防守。在防守与进攻之间找到平衡是取胜关键。',
      '',
      '你还可以使用特殊攻击。使用后需要等待一段时间才能再次使用，',
      '每个时代都有自己独特的特殊攻击。',
      '',
      '基地无法修复，但每进化到下一个时代，基地的生命值都会提升。',
      '不惜一切代价保护你的基地！',
    ],
    controlsText: '操作：鼠标移到屏幕左右边缘、按住拖动、手指滑动或方向键来滚动战场；数字键 1-4 训练兵种，Q 特殊攻击，E 进化，空格暂停。iPhone 可“添加到主屏幕”全屏游玩。',
    extrasTitle: '兵种图鉴：', extrasSub: '五个时代的全部兵种：',
    victory: '胜利！', victorySub: '恭喜你赢得了战争，摧毁了敌人的基地。',
    defeat: '失败！', defeatSub: '也许你还不够努力？',
    playAgain: '再玩一次？', mainMenu: '返回主菜单',
    paused: '已暂停', resume: '再按一次空格键继续', resumeTouch: '点击屏幕继续',
    menu: '菜单', menuUnits: '菜单 - 兵种', menuTurrets: '菜单 - 炮塔', sellTitle: '出售炮塔',
    special: '特殊:', exp: '经验:', cancel: '取消',
    trainMenu: '训练兵种', turretMenu: '建造炮塔', sellMenu: '出售炮塔',
    addSpot: (p) => p + '$ - 增加炮塔位', cantBuild: '炮塔位已满',
    evolve: (x) => x + ' Xp - 进化到下一个时代', cantEvolve: '已经是最终时代',
    returnPrev: '返回上一级菜单',
    unitInfo: (c, n) => c + '$ - ' + n, training: (n) => '正在训练 ' + n + '...',
    sellInfo: (n, p) => '出售 ' + n + '，返还 ' + p + '$',
    specialName: ['流星雨', '箭雨', '治疗之光', '空袭轰炸', '离子炮'],
    specialReady: (n) => n + ' - 特殊攻击', specialWait: (s) => '特殊攻击冷却中... ' + s + ' 秒',
    rotate: '请把设备横过来，画面更完整', rotateGo: '继续竖屏玩',
    tapToStart: '开始', loading: '载入中',
    lang: 'English', sound: '声音', fullscreen: '全屏',
    unitNames: [null, '棍棒手', '投石手', '恐龙骑士', '剑士', '弩手', '骑士', '决斗剑客',
      '火枪手', '手炮兵', '近战步兵', '步枪兵', '坦克', '神之刃', '爆能枪兵', '战争机器', '超级战士'],
    turretNames: [null, '投石弹弓', '鸡蛋机枪', '原始投石机', '投石机', '火焰投石机', '滚油锅',
      '小型火炮', '大型火炮', '爆破火炮', '单管机枪塔', '火箭炮塔', '双管机枪塔',
      '钛合金射手', '激光炮', '离子射线'],
    ageNames: ['石器时代', '中世纪', '文艺复兴', '现代', '未来'],
  },
};
