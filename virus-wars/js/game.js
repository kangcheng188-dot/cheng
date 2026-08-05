/* ===========================================================
   game.js — 模拟主循环、输入、视图变换、胜负判定
   =========================================================== */
(function (global) {
  'use strict';

  var TW = global.TW;
  var W = TW.WORLD_W, H = TW.WORLD_H;

  function pointSegDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = TW.clamp(t, 0, 1);
    var qx = ax + dx * t, qy = ay + dy * t;
    return Math.hypot(px - qx, py - qy);
  }

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cells = [];
    this.tentacles = [];
    this.particles = [];
    this.ais = [];
    this.state = 'idle';           // idle | playing | paused | ending | over
    this.time = 0;
    this.elapsed = 0;
    this.demo = false;
    this.autoRotate = true;
    this.level = null;
    this.endTimer = 0;
    this.won = false;

    this.selected = null;
    this.dragFrom = null;
    this.dragPt = null;
    this.dragMoved = 0;
    this.hover = null;
    this.slash = null;
    this.slashFade = 0;
    this.portrait = false;

    this.onEnd = null;
    this.onEvent = null;           // (type, payload) 给 UI 用

    this._bindInput();
    this.resize();
  }

  /* ---------------------------- 视图 ---------------------------- */

  Game.prototype.resize = function () {
    var c = this.canvas;
    var cw = c.clientWidth || window.innerWidth;
    var ch = c.clientHeight || window.innerHeight;
    var dpr = Math.min(2.5, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(cw * dpr));
    c.height = Math.max(1, Math.round(ch * dpr));

    var rot = this.autoRotate && ch > cw * 1.04;
    var availW = rot ? ch : cw, availH = rot ? cw : ch;
    var s = Math.min(availW / W, availH / H);

    this.view = { cw: cw, ch: ch, dpr: dpr, rot: rot, s: s };
    this.portrait = rot;
  };

  Game.prototype.applyTransform = function () {
    var v = this.view, s = v.s, d = v.dpr;
    if (v.rot) {
      this.ctx.setTransform(0, d * s, -d * s, 0, d * (v.cw / 2 + s * H / 2), d * (v.ch / 2 - s * W / 2));
    } else {
      this.ctx.setTransform(d * s, 0, 0, d * s, d * (v.cw / 2 - s * W / 2), d * (v.ch / 2 - s * H / 2));
    }
  };

  Game.prototype.toWorld = function (x, y) {
    var v = this.view, s = v.s;
    if (v.rot) return { x: (y - v.ch / 2) / s + W / 2, y: (v.cw / 2 - x) / s + H / 2 };
    return { x: (x - v.cw / 2) / s + W / 2, y: (y - v.ch / 2) / s + H / 2 };
  };

  /* ---------------------------- 开局 ---------------------------- */

  Game.prototype.start = function (level, demo) {
    this.level = level;
    this.demo = !!demo;
    this.cells = [];
    this.tentacles = [];
    this.particles = [];
    this.ais = [];
    this.time = 0;
    this.elapsed = 0;
    this.endTimer = 0;
    this.won = false;
    this.selected = this.dragFrom = this.hover = null;
    this.slash = null;

    for (var i = 0; i < level.cells.length; i++) {
      var d = level.cells[i];
      this.cells.push(new TW.Cell(d.x, d.y, d.owner, d.energy, d.max));
    }

    var cfgs = level.ai || {};
    for (var k in cfgs) this.ais.push(new global.AIController(parseInt(k, 10), cfgs[k]));
    if (demo) {
      // 演示模式下玩家阵营也交给 AI
      this.ais.push(new global.AIController(TW.PLAYER, global.AI_PRESETS.brisk));
    }
    this.state = 'playing';
  };

  Game.prototype.setPaused = function (p) {
    if (this.state === 'playing' && p) this.state = 'paused';
    else if (this.state === 'paused' && !p) this.state = 'playing';
  };

  /* ---------------------------- 查询工具 ---------------------------- */

  Game.prototype.outCount = function (cell) {
    var n = 0;
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (!t.dead && t.from === cell) n++;
    }
    return n;
  };

  Game.prototype.hasFreeSlot = function (cell) {
    return this.outCount(cell) < cell.maxTentacles();
  };

  Game.prototype.linked = function (a, b) {
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (t.dead) continue;
      if (t.owner !== a.owner) continue;
      if ((t.from === a && t.to === b) || (t.from === b && t.to === a)) return true;
    }
    return false;
  };

  Game.prototype.attackersOn = function (cell, fid) {
    var n = 0;
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (!t.dead && t.to === cell && t.from.owner === fid) n++;
    }
    return n;
  };

  Game.prototype.incomingAttack = function (cell) {
    var n = 0;
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (!t.dead && t.to === cell && t.state === 'connected' && t.from.owner !== cell.owner) n++;
    }
    return n;
  };

  Game.prototype.isFedBy = function (cell, fid) {
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (!t.dead && t.to === cell && t.from.owner === fid) return true;
    }
    return false;
  };

  Game.prototype.cellAt = function (x, y, pad) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < this.cells.length; i++) {
      var c = this.cells[i];
      var d = TW.dist(x, y, c.x, c.y);
      if (d < c.radius() + (pad || 10) && d < bestD) { bestD = d; best = c; }
    }
    return best;
  };

  Game.prototype.tentacleAt = function (x, y, owner, tol) {
    tol = tol || 15;
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (t.dead || (owner !== undefined && t.owner !== owner)) continue;
      var prog = t.progress();
      for (var k = 0; k <= 16; k++) {
        var a = t.pointAt(prog * k / 16, true);
        var b = t.pointAt(prog * Math.min(1, (k + 1) / 16), true);
        if (pointSegDist(x, y, a[0], a[1], b[0], b[1]) < tol) return t;
      }
    }
    return null;
  };

  Game.prototype.tentaclesCrossing = function (ax, ay, bx, by, owner) {
    var hit = [];
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (t.dead || t.owner !== owner) continue;
      var prog = t.progress();
      for (var k = 0; k <= 14; k++) {
        var p = t.pointAt(prog * k / 14, true);
        if (pointSegDist(p[0], p[1], ax, ay, bx, by) < 13) { hit.push(t); break; }
      }
    }
    return hit;
  };

  /* ---------------------------- 触手操作 ---------------------------- */

  Game.prototype.connect = function (from, to, silent) {
    if (!from || !to || from === to) return false;
    if (from.owner === 0) return false;
    if (!this.hasFreeSlot(from)) { if (!silent) global.Sfx.reject(); return false; }
    if (this.linked(from, to)) { if (!silent) global.Sfx.reject(); return false; }
    if (from.energy < 1) { if (!silent) global.Sfx.reject(); return false; }
    var t = new TW.Tentacle(from, to);
    this.tentacles.push(t);
    if (!silent) global.Sfx.connect();
    return true;
  };

  Game.prototype.onConnect = function () { /* 接通瞬间的钩子，留给音效/特效 */ };

  /** 单点能量抵达目标 */
  Game.prototype.deliver = function (t, amount) {
    var src = t.from, tgt = t.to;
    for (var i = 0; i < amount; i++) {
      if (tgt.owner === src.owner) {
        tgt.energy = Math.min(tgt.maxEnergy, tgt.energy + 1);
      } else {
        tgt.energy -= 1;
        tgt.flash = Math.min(1, tgt.flash + 0.5);
        if (tgt.energy <= 0) this.capture(tgt, src.owner);
      }
    }
    tgt.syncLevel();
    if (src.owner === TW.PLAYER || tgt.owner === TW.PLAYER) global.Sfx.pulse();
  };

  Game.prototype.capture = function (cell, newOwner) {
    var old = cell.owner;
    cell.owner = newOwner;
    cell.energy = Math.min(TW.CAPTURE_ENERGY, cell.maxEnergy);
    cell.level = 0;
    cell.syncLevel(true);
    cell.captureAnim = 1;
    cell.flash = 1;

    // 原主人从这颗细胞伸出的触手全部断掉
    for (var i = 0; i < this.tentacles.length; i++) {
      var t = this.tentacles[i];
      if (!t.dead && t.from === cell && t.owner === old) this.killTentacle(t);
    }

    this.burst(cell.x, cell.y, newOwner, 26, 130);
    global.Sfx.capture(newOwner === TW.PLAYER);
    if (this.onEvent) this.onEvent('capture', { cell: cell, from: old, to: newOwner });
  };

  /** 玩家/AI 主动剪断：结算注射或退款 */
  Game.prototype.cutTentacle = function (t, silent) {
    if (!t || t.dead) return;
    var nodes = t.nodeCount();
    if (t.state === 'connected' && nodes > 0) {
      // 一次性把触手里的能量射进对面
      var pending = nodes + t.pulses.length;
      this.deliver(t, pending);
      this.burst(t.to.x, t.to.y, t.owner, 14, 90);
      if (!silent) global.Sfx.inject();
      var mid = t.pointAt(0.5, true);
      this.burst(mid[0], mid[1], t.owner, 8, 60);
    } else {
      // 还没接上 → 能量退回本体
      t.from.energy = Math.min(t.from.maxEnergy, t.from.energy + nodes);
      t.from.syncLevel();
      if (!silent) global.Sfx.cut();
      var mid2 = t.pointAt(0.5, true);
      this.burst(mid2[0], mid2[1], t.owner, 8, 60);
    }
    this.killTentacle(t);
  };

  /** 无结算地移除（本体易主时用） */
  Game.prototype.killTentacle = function (t) {
    if (t.dead) return;
    t.dead = true;
    var i = this.tentacles.indexOf(t);
    if (i >= 0) this.tentacles.splice(i, 1);
  };

  Game.prototype.burst = function (x, y, owner, n, speed) {
    var f = TW.FACTIONS[owner] || TW.FACTIONS[0];
    var col = 'hsla(' + f.h + ',' + f.s + '%,72%,ALPHA)';
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.2832;
      var v = speed * (0.25 + Math.random() * 0.9);
      this.particles.push(new TW.Particle(
        x + Math.cos(a) * 4, y + Math.sin(a) * 4,
        Math.cos(a) * v, Math.sin(a) * v,
        0.4 + Math.random() * 0.6, col, 1.6 + Math.random() * 2.6));
    }
  };

  /* ---------------------------- 主循环 ---------------------------- */

  Game.prototype.update = function (dt) {
    this.time += dt;
    if (this.state !== 'playing' && this.state !== 'ending') return;
    if (this.state === 'playing') this.elapsed += dt;

    var i;
    for (i = 0; i < this.cells.length; i++) this.cells[i].update(dt);
    // 快照遍历：模拟过程中可能有触手被同化/剪断而移出数组
    var list = this.tentacles.slice();
    for (i = 0; i < list.length; i++) {
      var t = list[i];
      if (t.dead) continue;
      t.recomputePath();
      t.update(dt, this);
    }
    if (this.state === 'playing') {
      for (i = 0; i < this.ais.length; i++) this.ais[i].update(dt, this);
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    if (this.slashFade > 0) {
      this.slashFade -= dt * 3;
      if (this.slashFade <= 0) this.slash = null;
    }

    if (this.state === 'playing') this.checkEnd();
    else if (this.state === 'ending') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        this.state = 'over';
        if (this.demo) { if (this.onEvent) this.onEvent('demo-end'); }
        else if (this.onEnd) this.onEnd(this.won, this.elapsed);
      }
    }
  };

  Game.prototype.checkEnd = function () {
    var mine = 0, foes = 0, neutral = 0;
    for (var i = 0; i < this.cells.length; i++) {
      var o = this.cells[i].owner;
      if (o === TW.PLAYER) mine++;
      else if (o === 0) neutral++;
      else foes++;
    }
    if (this.demo) {
      if (foes === 0 || mine === 0) { this.won = false; this.state = 'ending'; this.endTimer = 1.6; }
      return;
    }
    if (mine === 0) {
      // 还有触手在飞就再等等
      this.won = false; this.state = 'ending'; this.endTimer = 1.4;
      global.Sfx.lose();
      return;
    }
    var need = this.level.winAll ? (foes + neutral) : foes;
    if (need === 0) {
      this.won = true; this.state = 'ending'; this.endTimer = 1.4;
      global.Sfx.win();
    }
  };

  Game.prototype.factionStats = function () {
    var m = {};
    for (var i = 0; i < this.cells.length; i++) {
      var c = this.cells[i];
      if (!m[c.owner]) m[c.owner] = { cells: 0, energy: 0 };
      m[c.owner].cells++;
      m[c.owner].energy += Math.max(1, c.energy);
    }
    return m;
  };

  /* ---------------------------- 绘制 ---------------------------- */

  Game.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform();

    global.Render.drawBackground(ctx, this.time);

    var i;
    for (i = 0; i < this.tentacles.length; i++) global.Render.drawTentacle(ctx, this.tentacles[i], this.time);

    if (this.dragFrom && this.dragPt) {
      var target = this.hover;
      var ok = !target || target !== this.dragFrom;
      global.Render.drawDrag(ctx, this.dragFrom, this.dragPt.x, this.dragPt.y, this.time, ok);
    }

    for (i = 0; i < this.cells.length; i++) {
      var c = this.cells[i];
      global.Render.drawCell(ctx, c, this.time, {
        used: this.outCount(c),
        selected: c === this.selected || c === this.dragFrom,
        hover: c === this.hover && this.dragFrom && c !== this.dragFrom,
        valid: true
      });
    }

    global.Render.drawParticles(ctx, this.particles);
    if (this.slash && this.slashFade > 0) {
      ctx.globalAlpha = TW.clamp(this.slashFade, 0, 1);
      global.Render.drawSlash(ctx, this.slash);
      ctx.globalAlpha = 1;
    }
  };

  /* ---------------------------- 输入 ---------------------------- */

  Game.prototype._bindInput = function () {
    var self = this, c = this.canvas;
    var down = false, slashing = false, startPt = null, lastPt = null;

    function pos(e) {
      var r = c.getBoundingClientRect();
      return self.toWorld(e.clientX - r.left, e.clientY - r.top);
    }

    c.addEventListener('pointerdown', function (e) {
      if (self.state !== 'playing' || self.demo) return;
      c.setPointerCapture && c.setPointerCapture(e.pointerId);
      var p = pos(e);
      down = true; startPt = p; lastPt = p; self.dragMoved = 0;

      var cell = self.cellAt(p.x, p.y);
      if (cell) {
        if (self.selected && self.selected !== cell) {
          self.connect(self.selected, cell);
          self.selected = null;
          down = false;
          return;
        }
        if (cell.owner === TW.PLAYER) {
          self._reSelect = (self.selected === cell);
          self.dragFrom = cell;
          self.selected = cell;
          self.dragPt = p;
        } else {
          self.selected = null;
        }
        return;
      }

      // 点自己的触手 = 剪断
      var t = self.tentacleAt(p.x, p.y, TW.PLAYER);
      if (t) { self.cutTentacle(t); down = false; return; }

      self.selected = null;
      slashing = true;
      self.slash = [{ x: p.x, y: p.y }];
      self.slashFade = 1;
    });

    c.addEventListener('pointermove', function (e) {
      if (self.state !== 'playing' || self.demo) return;
      var p = pos(e);
      if (self.dragFrom) {
        self.dragPt = p;
        self.dragMoved += TW.dist(p.x, p.y, lastPt.x, lastPt.y);
        self.hover = self.cellAt(p.x, p.y, 14);
      } else if (slashing && down) {
        var cut = self.tentaclesCrossing(lastPt.x, lastPt.y, p.x, p.y, TW.PLAYER);
        for (var i = 0; i < cut.length; i++) self.cutTentacle(cut[i]);
        self.slash.push({ x: p.x, y: p.y });
        if (self.slash.length > 26) self.slash.shift();
        self.slashFade = 1;
      } else if (!down) {
        self.hover = self.cellAt(p.x, p.y, 6);
      }
      lastPt = p;
    });

    function up(e) {
      if (self.demo) return;
      if (self.dragFrom) {
        var p = self.dragPt;
        var target = p ? self.cellAt(p.x, p.y, 14) : null;
        if (target && target !== self.dragFrom) {
          self.connect(self.dragFrom, target);
          self.selected = null;
        } else if (self.dragMoved > 16 || self._reSelect) {
          self.selected = null;   // 拖到空处 / 再点一次自己 → 取消选中
        }
        self.dragFrom = null; self.dragPt = null; self.hover = null;
      }
      down = false; slashing = false;
    }

    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', function () { if (!down) self.hover = null; });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  global.Game = Game;
})(window);
