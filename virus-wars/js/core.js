/* ===========================================================
   core.js — 常量、阵营、细胞与触手的模拟逻辑
   规则依据原版《Tentacle Wars》:
     · 所有细胞每 2 秒恢复 1 点能量（中立细胞不恢复）
     · 能量到 15/40/80/120/160 进化，跌破 5/30/60/100/140 退化
     · 进化不加快恢复，只提升「触手输送力」与可同时伸出的触手数(1~3)
     · 触手每一节 = 1 点能量，由本体支付
     · 接通后每输送 1 点：友方 +1 / 敌方 −1；敌方归零即被同化，重置为 10 点
     · 剪断已接通的触手 → 触手上剩余节数一次性注入对面（注射战术）
     · 剪断未接通的触手 → 能量退回本体
   =========================================================== */
(function (global) {
  'use strict';

  /* ---------------------------- 常量 ---------------------------- */

  var WORLD_W = 1000, WORLD_H = 640;

  var EVOLVE_UP   = [15, 40, 80, 120, 160];   // 升级门槛
  var EVOLVE_DOWN = [5, 30, 60, 100, 140];    // 退化门槛（迟滞）
  var LEVEL_RADIUS = [24, 30, 36, 42, 48, 55];
  var MAX_LEVEL = 5;

  var REGEN        = 0.5;   // 每秒恢复能量（= 每 2 秒 +1）
  var NODE_SPACING = 15;    // 触手每节的像素间距（1 节 = 1 能量）
  var GROW_SPEED   = 86;    // 触手生长速度 px/s
  var PULSE_SPEED  = 265;   // 能量沿触手流动速度 px/s
  var PUMP_BASE    = 1.5;   // 0 级细胞每秒输送量
  var PUMP_PER_LV  = 0.5;   // 每提升一级增加的输送量
  var CAPTURE_ENERGY = 10;  // 被同化后重置到的能量

  /** 阵营。0=中立，1=玩家，2+ = 敌方 */
  var FACTIONS = [
    { id: 0, name: '中立',   h: 150, s: 8,  l: 62 },
    { id: 1, name: '你',     h: 96,  s: 72, l: 55 },
    { id: 2, name: '赤菌',   h: 355, s: 82, l: 58 },
    { id: 3, name: '蓝菌',   h: 206, s: 88, l: 57 },
    { id: 4, name: '紫菌',   h: 275, s: 76, l: 63 },
    { id: 5, name: '橙菌',   h: 32,  s: 92, l: 55 }
  ];
  var PLAYER = 1;

  /** 取阵营色，可覆盖亮度与透明度 */
  function fcol(id, l, a) {
    var f = FACTIONS[id] || FACTIONS[0];
    var L = (l === undefined || l === null) ? f.l : l;
    if (a === undefined || a === null) return 'hsl(' + f.h + ',' + f.s + '%,' + L + '%)';
    return 'hsla(' + f.h + ',' + f.s + '%,' + L + '%,' + a + ')';
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }

  /* ---------------------------- 细胞 ---------------------------- */

  var _cellId = 0;

  function Cell(x, y, owner, energy, maxEnergy) {
    this.id = ++_cellId;
    this.x = x; this.y = y;
    this.owner = owner | 0;
    this.energy = energy;
    this.maxEnergy = maxEnergy || 100;
    this.level = 0;
    this.seed = Math.random() * 100;
    this.spin = Math.random() * Math.PI * 2;
    this.flash = 0;        // 被击中/被同化时的高光
    this.captureAnim = 0;  // 同化动画进度
    this.hitDir = 0;
    this.pop = 0;          // 进化时的缩放弹跳
    this.syncLevel(true);
  }

  Cell.prototype.radius = function () {
    var r = LEVEL_RADIUS[this.level];
    return r * (1 + this.pop * 0.18);
  };

  /** 根据能量刷新等级（带迟滞），返回是否进化了 */
  Cell.prototype.syncLevel = function (silent) {
    var changed = 0, guard = 0;
    while (guard++ < 12) {
      if (this.level < MAX_LEVEL && this.energy >= EVOLVE_UP[this.level]) { this.level++; changed = 1; }
      else if (this.level > 0 && this.energy < EVOLVE_DOWN[this.level - 1]) { this.level--; changed = -1; }
      else break;
    }
    if (changed > 0 && !silent) this.pop = 1;
    return changed;
  };

  /** 触手输送力（能量/秒） */
  Cell.prototype.pumpRate = function () { return PUMP_BASE + PUMP_PER_LV * this.level; };

  /** 可同时伸出的触手数：1 → 2(40能量) → 3(120能量) */
  Cell.prototype.maxTentacles = function () { return Math.min(3, 1 + Math.floor(this.level / 2)); };

  Cell.prototype.isNeutral = function () { return this.owner === 0; };

  Cell.prototype.update = function (dt) {
    if (!this.isNeutral() && this.energy < this.maxEnergy) {
      this.energy = Math.min(this.maxEnergy, this.energy + REGEN * dt);
    }
    this.syncLevel();
    this.spin += dt * (0.12 + this.level * 0.02);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt * 2.6);
    if (this.captureAnim > 0) this.captureAnim = Math.max(0, this.captureAnim - dt * 1.4);
  };

  /* ---------------------------- 触手 ---------------------------- */

  var _tentId = 0;

  /**
   * 触手：从 from 细胞长向 to 细胞。
   * 状态 growing → connected。剪断时按状态结算能量。
   */
  function Tentacle(from, to) {
    this.id = ++_tentId;
    this.from = from;
    this.to = to;
    this.owner = from.owner;
    this.state = 'growing';
    this.grown = 0;            // 已长出的长度（像素）
    this.paidNodes = 0;        // 已支付能量的节数
    this.growCost = 0;         // 累积待支付
    this.pumpAcc = 0;
    this.pulses = [];          // {p:0..1}
    this.dead = false;
    this.age = 0;
    this.wob = Math.random() * Math.PI * 2;
    this.recomputePath();
  }

  /** 起点/终点贴着两个细胞的边缘，中间给一点有机的弧度 */
  Tentacle.prototype.recomputePath = function () {
    var a = this.from, b = this.to;
    var dx = b.x - a.x, dy = b.y - a.y;
    var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var ux = dx / d, uy = dy / d;
    this.ax = a.x + ux * (a.radius() - 3);
    this.ay = a.y + uy * (a.radius() - 3);
    this.bx = b.x - ux * (b.radius() - 3);
    this.by = b.y - uy * (b.radius() - 3);
    var mx = (this.ax + this.bx) / 2, my = (this.ay + this.by) / 2;
    var bend = Math.min(26, d * 0.09) * (this.id % 2 ? 1 : -1);
    this.cx = mx - uy * bend;
    this.cy = my + ux * bend;
    this.len = this._approxLen();
  };

  Tentacle.prototype._approxLen = function () {
    var last = null, sum = 0;
    for (var i = 0; i <= 12; i++) {
      var p = this.pointAt(i / 12, true);
      if (last) sum += dist(last[0], last[1], p[0], p[1]);
      last = p;
    }
    return sum;
  };

  /** 二次贝塞尔取点；raw=true 时不加摆动 */
  Tentacle.prototype.pointAt = function (t, raw, time) {
    var mt = 1 - t;
    var x = mt * mt * this.ax + 2 * mt * t * this.cx + t * t * this.bx;
    var y = mt * mt * this.ay + 2 * mt * t * this.cy + t * t * this.by;
    if (raw) return [x, y];
    // 垂直方向的呼吸摆动，越靠中间越明显
    var dx = this.bx - this.ax, dy = this.by - this.ay;
    var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var nx = -dy / d, ny = dx / d;
    var amp = Math.sin(t * Math.PI) * 3.0;
    var w = Math.sin(t * 7 + (time || 0) * 2.2 + this.wob) * amp;
    return [x + nx * w, y + ny * w];
  };

  Tentacle.prototype.progress = function () { return clamp(this.grown / this.len, 0, 1); };

  /** 触手上现存的节数 = 可注射的能量 */
  Tentacle.prototype.nodeCount = function () {
    return Math.max(0, Math.floor(this.grown / NODE_SPACING));
  };

  Tentacle.prototype.update = function (dt, game) {
    this.age += dt;
    if (this.from.owner !== this.owner) { game.killTentacle(this, 'lost'); return; }

    if (this.state === 'growing') {
      // 先付钱再生长：本体没能量就停在原地
      var want = GROW_SPEED * dt;
      var need = (this.grown + want) / NODE_SPACING - this.paidNodes;
      if (need > 0) {
        var afford = Math.min(need, Math.max(0, this.from.energy));
        this.from.energy -= afford;
        this.paidNodes += afford;
        if (afford < need - 1e-6) {
          want = Math.max(0, (this.paidNodes + 0) * NODE_SPACING - this.grown);
        }
      }
      this.grown += want;
      if (this.grown >= this.len) {
        this.grown = this.len;
        this.state = 'connected';
        game.onConnect(this);
      }
    } else if (this.state === 'connected') {
      this.grown = this.len;   // 两端细胞胀缩时保持贴合
      var tgt = this.to, src = this.from;
      var friendly = tgt.owner === src.owner;
      var full = friendly && tgt.energy >= tgt.maxEnergy - 0.001;
      if (!full && src.energy >= 1) {
        this.pumpAcc += src.pumpRate() * dt;
        while (this.pumpAcc >= 1 && src.energy >= 1) {
          this.pumpAcc -= 1;
          src.energy -= 1;
          this.pulses.push({ p: 0 });
        }
      } else {
        this.pumpAcc = Math.min(this.pumpAcc, 1);
      }
    }

    // 能量脉冲沿触手前进
    var step = PULSE_SPEED * dt / Math.max(1, this.len);
    for (var i = this.pulses.length - 1; i >= 0; i--) {
      var pl = this.pulses[i];
      pl.p += step;
      if (pl.p >= 1) {
        this.pulses.splice(i, 1);
        game.deliver(this, 1);
      }
    }
  };

  /* ---------------------------- 粒子 ---------------------------- */

  function Particle(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.color = color; this.size = size;
  }
  Particle.prototype.update = function (dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vx *= 1 - dt * 1.6; this.vy *= 1 - dt * 1.6;
    this.life -= dt;
  };

  /* ---------------------------- 导出 ---------------------------- */

  global.TW = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H,
    EVOLVE_UP: EVOLVE_UP, EVOLVE_DOWN: EVOLVE_DOWN,
    LEVEL_RADIUS: LEVEL_RADIUS, MAX_LEVEL: MAX_LEVEL,
    REGEN: REGEN, NODE_SPACING: NODE_SPACING, GROW_SPEED: GROW_SPEED,
    PULSE_SPEED: PULSE_SPEED, CAPTURE_ENERGY: CAPTURE_ENERGY,
    FACTIONS: FACTIONS, PLAYER: PLAYER,
    fcol: fcol, clamp: clamp, dist: dist,
    Cell: Cell, Tentacle: Tentacle, Particle: Particle
  };
})(window);
