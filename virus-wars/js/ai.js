/* ===========================================================
   ai.js — 敌方菌群的行为
   每个阵营一个控制器，按 think 间隔做一次决策：
     1) 整理自己的触手（撤掉浪费的、该注射的就注射）
     2) 防守：给被攻击的细胞补能量
     3) 进攻：挑性价比最高的目标伸触手
   =========================================================== */
(function (global) {
  'use strict';

  var TW = global.TW;

  function AIController(fid, cfg) {
    this.fid = fid;
    this.cfg = cfg || { aggr: 0.5, think: 2.0, skill: 0.3 };
    this.timer = Math.random() * this.cfg.think;
    this.idle = 0;   // 距上一次伸出触手过了多久
  }

  AIController.prototype.update = function (dt, game) {
    this.timer -= dt;
    this.idle += dt;
    if (this.timer > 0) return;
    this.timer = this.cfg.think * (0.7 + Math.random() * 0.6);
    this.decide(game);
  };

  AIController.prototype.decide = function (game) {
    var fid = this.fid, cfg = this.cfg;
    var mine = [], foes = [];
    for (var i = 0; i < game.cells.length; i++) {
      var c = game.cells[i];
      if (c.owner === fid) mine.push(c); else foes.push(c);
    }
    if (!mine.length) return;

    this.maintain(game, fid, cfg);
    if (cfg.skill > 0.25) this.defend(game, fid, cfg, mine);
    this.attack(game, fid, cfg, mine, foes);
  };

  /* ---------------- 1. 整理已有触手 ---------------- */

  AIController.prototype.maintain = function (game, fid, cfg) {
    var list = game.tentacles.slice();
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.dead || t.from.owner !== fid) continue;
      var src = t.from, tgt = t.to;

      // 已经喂饱的自己人 → 收回触手，腾出接口
      if (t.state === 'connected' && tgt.owner === fid && tgt.energy >= tgt.maxEnergy - 2) {
        game.cutTentacle(t, true); continue;
      }
      // 补血补到本体比对方还虚 → 停手，别把自己抽干
      if (t.state === 'connected' && tgt.owner === fid && src.energy <= 8 && tgt.energy > 18) {
        game.cutTentacle(t, true); continue;
      }
      // 注射战术：触手里的能量已经够一击拿下 → 剪断秒杀
      if (cfg.skill > 0.45 && t.state === 'connected' && tgt.owner !== fid &&
          t.nodeCount() >= Math.ceil(tgt.energy) && tgt.energy > 0) {
        game.cutTentacle(t, true); continue;
      }
      // 本体快空了还在硬打 → 撤（撤退时能量也会注射出去，不亏）
      if (cfg.skill > 0.4 && t.state === 'connected' && tgt.owner !== fid &&
          src.energy < 2 && tgt.energy > src.pumpRate() * 8) {
        game.cutTentacle(t, true); continue;
      }
      // 还在生长但本体已经没钱了，而且离目标还很远 → 放弃
      if (cfg.skill > 0.55 && t.state === 'growing' && src.energy < 1 && t.progress() < 0.35 && t.age > 4) {
        game.cutTentacle(t, true); continue;
      }
    }
  };

  /* ---------------- 2. 防守 ---------------- */

  AIController.prototype.defend = function (game, fid, cfg, mine) {
    var worst = null, worstScore = 0;
    for (var i = 0; i < mine.length; i++) {
      var c = mine[i];
      var incoming = game.incomingAttack(c);
      if (!incoming) continue;
      var score = incoming / Math.max(1, c.energy);
      if (c.energy < 22 && score > worstScore) { worstScore = score; worst = c; }
    }
    if (!worst) return;
    if (game.isFedBy(worst, fid)) return;

    var best = null, bestD = 1e9;
    for (var j = 0; j < mine.length; j++) {
      var s = mine[j];
      if (s === worst) continue;
      if (!game.hasFreeSlot(s)) continue;
      if (s.energy < 18) continue;
      var d = TW.dist(s.x, s.y, worst.x, worst.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (best && bestD / TW.NODE_SPACING < best.energy * 0.7) game.connect(best, worst, true);
  };

  /* ---------------- 3. 进攻 ---------------- */

  AIController.prototype.attack = function (game, fid, cfg, mine, foes) {
    // 同时进行的进攻数量上限，随进攻欲上升
    var ongoing = 0;
    for (var i = 0; i < game.tentacles.length; i++) {
      var t = game.tentacles[i];
      if (!t.dead && t.from.owner === fid && t.to.owner !== fid) ongoing++;
    }
    var cap = Math.max(1, Math.ceil(mine.length * (0.25 + cfg.aggr * 0.4)));
    if (ongoing >= cap) return;

    var reserve = 12 + (1 - cfg.aggr) * 20;   // 出手前想留的家底
    var best = null, bestScore = -1;
    // 憋太久没动手就逐渐放宽标准，避免双方互相干瞪眼
    var bold = this.idle > 20 ? 1 + Math.min(1.4, (this.idle - 20) / 22) : 1;

    for (var a = 0; a < mine.length; a++) {
      var src = mine[a];
      if (!game.hasFreeSlot(src)) continue;
      if (src.energy < reserve) continue;
      var pump = src.pumpRate();

      for (var b = 0; b < foes.length; b++) {
        var tgt = foes[b];
        if (game.linked(src, tgt)) continue;
        var allies = game.attackersOn(tgt, fid);
        if (allies >= (cfg.skill > 0.6 ? 3 : 2)) continue;

        var d = TW.dist(src.x, src.y, tgt.x, tgt.y);
        var buildCost = d / TW.NODE_SPACING;
        if (buildCost > src.energy - 4) continue;

        // 打穿目标要多久：净输出 = 自己的输送力 − 对方的回血（中立不回血）
        var eff = pump * (1 + allies * 0.8) - (tgt.owner === 0 ? 0 : TW.REGEN);
        if (eff <= 0.2) continue;
        var secs = tgt.energy / eff;
        if (secs > 70 * bold) continue;

        // 这段时间里我要花多少、能有多少
        var spend = buildCost + pump * secs;
        var have = src.energy + TW.REGEN * secs;
        if (spend > have * (0.72 + cfg.aggr * 0.55) * bold) continue;

        // 目标价值：上限高的、玩家的、快死的更值钱
        var value = 1 + tgt.maxEnergy / 240;
        if (tgt.owner === TW.PLAYER) value *= 1.2 + cfg.aggr * 0.4;
        else if (tgt.owner !== 0) value *= 1.05;
        if (tgt.owner !== 0 && tgt.energy < 12) value *= 1.6;      // 补刀
        if (game.incomingAttack(tgt) > 0) value *= 1.15;           // 抢人头

        var score = value / (secs * 0.06 + d * 0.003 + 1);
        score *= 0.85 + Math.random() * 0.35 * (1 - cfg.skill);    // 水平越低越随机

        if (score > bestScore) { bestScore = score; best = { s: src, t: tgt }; }
      }
    }

    if (best && game.connect(best.s, best.t, true)) this.idle = 0;
  };

  global.AIController = AIController;
})(window);
