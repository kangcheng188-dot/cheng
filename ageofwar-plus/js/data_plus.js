'use strict';
// Extra data and text for Age of War Plus.

// Upgrades: each level adds 10%. Cost scales with the average unit cost of the current age,
// so buying early is cheaper (a real decision instead of a gold dump).
const UPGRADES = [
  { key: 'atk', max: 5, per: 0.10 },
  { key: 'hp', max: 5, per: 0.10 },
  { key: 'loot', max: 5, per: 0.10 },
];
const AGE_AVG_COST = [0, 47, 208, 533, 3500, 10333];
function upgradeCost(key, level, age) { return Math.round(AGE_AVG_COST[age] * 1.6 * (level + 1) / 5) * 5; }

// Enemy special attacks: cooldown (ticks) and damage factor per difficulty. The player keeps the
// original 2000-tick cooldown and full damage.
const ENEMY_SPECIAL_CD = [0, 4800, 4200, 3200];
const ENEMY_SPECIAL_DMG = [0, 0.4, 0.5, 0.7];

// Plus: a small passive income per second so a wiped-out, broke player can always recover.
const PASSIVE_INCOME = [0, 2, 5, 12, 40, 100];

const ACHIEVEMENTS = [
  { id: 'win1' }, { id: 'win2' }, { id: 'win3' }, { id: 'fast' }, { id: 'fortress' }, { id: 'future' },
  { id: 'towers' }, { id: 'super' }, { id: 'wrath' }, { id: 'hundred' }, { id: 'rich' }, { id: 'maxup' }, { id: 'noturret' },
];

const PLUS_TEXT = {
  en: {
    subtitle: 'PLUS', newGame: 'New game', continueGame: 'Continue', achievementsBtn: 'Achievements', settings: 'Settings',
    classic: 'Classic edition', classicHint: 'The faithful 2007 version',
    credits: 'Original game by Louissi · Music: cynicmusic (CC0) · Sound: Kenney (CC0)',
    diffDesc: ['Original balance. A good first war.', 'Enemy units have 30% more health and damage.', 'Enemy units are twice as strong. For veterans.'],
    best: 'Best', noRecord: 'Not won yet',
    ageLabel: 'Age', xpMax: 'MAX', toNext: 'to next age',
    turrets: 'Turrets', upgrades: 'Upgrades', evolveBtn: 'Evolve', specialBtn: 'Special', queue: 'Queue',
    slots: (n) => 'Turret spots ' + n + '/4', addSlot: 'Add spot', sell: 'Sell', close: 'Close',
    tapSpot: 'Tap a flashing spot on your base', tapSell: 'Tap a turret to sell it', cancel: 'Cancel',
    dmg: 'Dmg', range: 'Range', rate: 'Rate', hp: 'HP',
    upName: { atk: 'Forge', hp: 'Armor', loot: 'Spoils' },
    upDesc: { atk: '+10% unit damage', hp: '+10% unit health', loot: '+10% gold from kills' },
    maxed: 'MAX', level: 'Lv',
    evolveTo: (a) => 'Evolve to the ' + a, enemyEvolved: (a) => 'The enemy reached the ' + a + '!',
    youEvolved: (a) => a,
    enemySpecialWarn: (n) => '⚠ Enemy ' + n + ' incoming!',
    speed: 'Speed', paused: 'Paused', resume: 'Resume', restart: 'Restart', mainMenu: 'Main menu',
    music: 'Music', sfx: 'Sound effects', dmgNumbers: 'Damage numbers', blood: 'Blood', hints: 'Tutorial hints', language: 'Language',
    on: 'On', off: 'Off',
    victory: 'Victory!', defeat: 'Defeat!', victorySub: 'You won the war and destroyed the enemy base.', defeatSub: 'Your base has fallen. Try another strategy!',
    stats: { time: 'Time', kills: 'Enemies killed', lost: 'Units lost', gold: 'Gold earned', dmg: 'Damage dealt', age: 'Highest age', turrets: 'Turrets built', specials: 'Specials used' },
    newAch: 'Achievement unlocked', playAgain: 'Play again', achTitle: 'Achievements', unlocked: (a, b) => a + ' / ' + b + ' unlocked',
    ach: {
      win1: ['First Victory', 'Win a war on any difficulty'],
      win2: ['Hardened', 'Win on Harder'],
      win3: ['The Impossible', 'Win on Impossible'],
      fast: ['Blitzkrieg', 'Win in under 15 minutes of game time'],
      fortress: ['Fortress', 'Win with more than half of your base health left'],
      future: ['Time Traveller', 'Reach the Future Age'],
      towers: ['Tower Defense', 'Have 4 turrets at the same time'],
      super: ['Super Soldier', 'Train a Super Soldier'],
      wrath: ['Wrath from Above', 'Kill 8 enemies with one special attack'],
      hundred: ['Centurion', 'Kill 100 enemies in one war'],
      rich: ['Treasure Hoard', 'Hold 50,000 gold at once'],
      maxup: ['Master Smith', 'Max out an upgrade'],
      noturret: ['Boots on the Ground', 'Win without building a turret'],
    },
    tut: {
      train: 'Tap a unit card to train soldiers.\nThey march on the enemy base by themselves.',
      earn: 'Killing enemies gives gold and XP.\nXP lets you evolve to the next age.',
      turret: 'Turrets defend your base.\nOpen the turret menu and build one.',
      special: 'Your special attack is ready!\nUse it when many enemies are on the field.',
      evolve: 'You have enough XP — evolve now!\nNew age: stronger units, turrets and a bigger base.',
      tapToClose: 'Tap to close',
    },
    gallery: 'Unit gallery', galleryBtn: 'Units',
    minutes: (m, s) => m + ':' + String(s).padStart(2, '0'),
  },
  zh: {
    subtitle: 'PLUS 重制版', newGame: '新游戏', continueGame: '继续游戏', achievementsBtn: '成就', settings: '设置',
    classic: '经典版', classicHint: '忠于 2007 原版',
    credits: '原作 Louissi · 音乐 cynicmusic (CC0) · 音效 Kenney (CC0)',
    diffDesc: ['原版数值，适合第一次开战。', '敌方单位生命与攻击 +30%。', '敌方单位强度翻倍，老兵专用。'],
    best: '最佳', noRecord: '尚未获胜',
    ageLabel: '时代', xpMax: '已满', toNext: '距下一时代',
    turrets: '炮塔', upgrades: '强化', evolveBtn: '进化', specialBtn: '特殊攻击', queue: '队列',
    slots: (n) => '炮位 ' + n + '/4', addSlot: '增加炮位', sell: '出售', close: '关闭',
    tapSpot: '点击基地上闪烁的炮位', tapSell: '点击要出售的炮塔', cancel: '取消',
    dmg: '伤害', range: '射程', rate: '射速', hp: '生命',
    upName: { atk: '锻造', hp: '护甲', loot: '战利品' },
    upDesc: { atk: '单位伤害 +10%', hp: '单位生命 +10%', loot: '击杀金币 +10%' },
    maxed: '已满', level: '等级',
    evolveTo: (a) => '进化到' + a, enemyEvolved: (a) => '敌人进入了' + a + '！',
    youEvolved: (a) => a,
    enemySpecialWarn: (n) => '⚠ 敌方即将发动：' + n + '！',
    speed: '速度', paused: '已暂停', resume: '继续', restart: '重新开始', mainMenu: '主菜单',
    music: '音乐', sfx: '音效', dmgNumbers: '伤害数字', blood: '流血效果', hints: '新手提示', language: '语言',
    on: '开', off: '关',
    victory: '胜利！', defeat: '失败！', victorySub: '你赢得了战争，摧毁了敌人的基地。', defeatSub: '基地失守了，换个战术再来一次！',
    stats: { time: '用时', kills: '消灭敌人', lost: '损失单位', gold: '获得金币', dmg: '造成伤害', age: '最高时代', turrets: '建造炮塔', specials: '特殊攻击' },
    newAch: '解锁成就', playAgain: '再玩一次', achTitle: '成就', unlocked: (a, b) => '已解锁 ' + a + ' / ' + b,
    ach: {
      win1: ['初战告捷', '在任意难度下赢得战争'],
      win2: ['百炼成钢', '在困难难度下获胜'],
      win3: ['不可能的胜利', '在地狱难度下获胜'],
      fast: ['闪电战', '15 分钟游戏时间内获胜'],
      fortress: ['固若金汤', '获胜时基地生命值高于一半'],
      future: ['时空旅人', '进化到未来时代'],
      towers: ['塔防大师', '同时拥有 4 座炮塔'],
      super: ['超级战士', '训练一名超级战士'],
      wrath: ['天降正义', '一次特殊攻击消灭 8 个敌人'],
      hundred: ['百人斩', '一场战争中消灭 100 个敌人'],
      rich: ['富甲一方', '同时持有 50,000 金币'],
      maxup: ['铸造大师', '把任意一项强化升到满级'],
      noturret: ['步兵为王', '不建造任何炮塔赢得战争'],
    },
    tut: {
      train: '点击下方的兵种卡片训练士兵。\n士兵会自动向敌方基地进攻。',
      earn: '消灭敌人可以获得金币和经验值。\n经验值足够就能进化到下一个时代。',
      turret: '炮塔可以守护基地。\n打开炮塔菜单建造一座吧。',
      special: '特殊攻击已就绪！\n敌人越多，用它越划算。',
      evolve: '经验值足够了，快进化！\n新时代有更强的兵种、炮塔和更坚固的基地。',
      tapToClose: '点击关闭',
    },
    gallery: '兵种图鉴', galleryBtn: '图鉴',
    minutes: (m, s) => m + ' 分 ' + String(s).padStart(2, '0') + ' 秒',
  },
};
for (const l of ['en', 'zh']) Object.assign(I18N[l], PLUS_TEXT[l]);
