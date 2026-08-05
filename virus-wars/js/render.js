/* ===========================================================
   render.js — 培养皿的画面
   全部在 1000x640 的世界坐标里绘制，缩放由 game.js 的视图矩阵负责
   =========================================================== */
(function (global) {
  'use strict';

  var TW = global.TW;
  var W = TW.WORLD_W, H = TW.WORLD_H;

  var bgCanvas = null;

  /* ---------------------------- 背景 ---------------------------- */

  function buildBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = W; bgCanvas.height = H;
    var g = bgCanvas.getContext('2d');

    var grad = g.createRadialGradient(W * 0.5, H * 0.45, 60, W * 0.5, H * 0.5, W * 0.78);
    grad.addColorStop(0, '#0d2b23');
    grad.addColorStop(0.55, '#082019');
    grad.addColorStop(1, '#03100c');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // 培养基里的絮状物
    for (var i = 0; i < 70; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      var r = 40 + Math.random() * 190;
      var bg = g.createRadialGradient(x, y, 0, x, y, r);
      var a = 0.012 + Math.random() * 0.03;
      bg.addColorStop(0, 'rgba(110,220,150,' + a + ')');
      bg.addColorStop(1, 'rgba(110,220,150,0)');
      g.fillStyle = bg;
      g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
    }

    // 悬浮的微粒
    for (var j = 0; j < 460; j++) {
      var px = Math.random() * W, py = Math.random() * H;
      var pr = 0.4 + Math.random() * 1.5;
      g.fillStyle = 'rgba(180,255,205,' + (0.03 + Math.random() * 0.11) + ')';
      g.beginPath(); g.arc(px, py, pr, 0, 6.2832); g.fill();
    }

    // 细胞网络般的丝状纹理
    g.lineWidth = 1;
    for (var k = 0; k < 46; k++) {
      var sx = Math.random() * W, sy = Math.random() * H;
      var ang = Math.random() * 6.2832, len = 60 + Math.random() * 210;
      g.strokeStyle = 'rgba(120,210,160,' + (0.015 + Math.random() * 0.035) + ')';
      g.beginPath();
      g.moveTo(sx, sy);
      g.quadraticCurveTo(
        sx + Math.cos(ang) * len * 0.5 + (Math.random() - 0.5) * 70,
        sy + Math.sin(ang) * len * 0.5 + (Math.random() - 0.5) * 70,
        sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      g.stroke();
    }

    // 皿壁的暗角
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);
  }

  function drawBackground(ctx, time) {
    if (!bgCanvas) buildBackground();
    ctx.drawImage(bgCanvas, 0, 0);

    // 缓慢漂移的光斑，让画面「活」起来
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 4; i++) {
      var t = time * 0.06 + i * 1.7;
      var x = W * 0.5 + Math.cos(t * 0.7 + i) * W * 0.34;
      var y = H * 0.5 + Math.sin(t * 0.53 + i * 2.1) * H * 0.34;
      var r = 150 + Math.sin(t + i) * 40;
      var g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
      g2.addColorStop(0, 'rgba(70,190,130,0.035)');
      g2.addColorStop(1, 'rgba(70,190,130,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------- 形状工具 ---------------------------- */

  function blobPath(ctx, x, y, r, wob, seed, time, pts) {
    pts = pts || 22;
    ctx.beginPath();
    for (var i = 0; i <= pts; i++) {
      var a = i / pts * 6.2832;
      var rr = r
        + Math.sin(a * 3 + time * 1.5 + seed) * wob
        + Math.sin(a * 5 - time * 1.1 + seed * 1.7) * wob * 0.55
        + Math.sin(a * 2 + time * 0.7 + seed * 0.3) * wob * 0.4;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /* ---------------------------- 细胞 ---------------------------- */

  function drawCell(ctx, c, time, state) {
    var r = c.radius();
    var o = c.owner;
    var wob = 1.4 + c.level * 0.35;

    // 外发光
    ctx.globalCompositeOperation = 'lighter';
    var gl = ctx.createRadialGradient(c.x, c.y, r * 0.55, c.x, c.y, r * 2.15);
    gl.addColorStop(0, TW.fcol(o, o === 0 ? 45 : null, 0.24 + c.flash * 0.3));
    gl.addColorStop(1, TW.fcol(o, null, 0));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(c.x, c.y, r * 2.15, 0, 6.2832); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // 纤毛
    ctx.strokeStyle = TW.fcol(o, null, 0.45);
    ctx.lineWidth = 1.4;
    var cilia = 10 + c.level * 3;
    ctx.beginPath();
    for (var i = 0; i < cilia; i++) {
      var a = i / cilia * 6.2832 + c.spin * 0.6;
      var l = 4 + Math.sin(time * 3 + i * 1.3 + c.seed) * 2.4 + c.level * 0.5;
      ctx.moveTo(c.x + Math.cos(a) * (r + 1), c.y + Math.sin(a) * (r + 1));
      ctx.lineTo(c.x + Math.cos(a) * (r + 1 + l), c.y + Math.sin(a) * (r + 1 + l));
    }
    ctx.stroke();

    // 细胞质
    blobPath(ctx, c.x, c.y, r, wob, c.seed, time);
    var body = ctx.createRadialGradient(c.x - r * 0.3, c.y - r * 0.35, r * 0.15, c.x, c.y, r * 1.05);
    body.addColorStop(0, TW.fcol(o, o === 0 ? 74 : 72, 0.98));
    body.addColorStop(0.55, TW.fcol(o, o === 0 ? 52 : 48, 0.94));
    body.addColorStop(1, TW.fcol(o, o === 0 ? 30 : 24, 0.92));
    ctx.fillStyle = body;
    ctx.fill();

    // 膜
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = TW.fcol(o, o === 0 ? 80 : 78, 0.95);
    ctx.stroke();

    // 细胞核
    ctx.save();
    ctx.clip();
    var nx = c.x + Math.cos(c.spin) * r * 0.18;
    var ny = c.y + Math.sin(c.spin * 1.3) * r * 0.18;
    blobPath(ctx, nx, ny, r * 0.52, wob * 0.8, c.seed + 3, time * 1.3, 16);
    ctx.fillStyle = TW.fcol(o, o === 0 ? 22 : 18, 0.42);
    ctx.fill();
    // 高光
    var hg = ctx.createRadialGradient(c.x - r * 0.42, c.y - r * 0.48, 0, c.x - r * 0.42, c.y - r * 0.48, r * 0.95);
    hg.addColorStop(0, 'rgba(255,255,255,0.30)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(c.x - r * 1.2, c.y - r * 1.2, r * 2.4, r * 2.4);
    ctx.restore();

    // 触手接口：亮点=空闲，暗点=已占用
    var slots = c.maxTentacles(), used = state.used || 0;
    if (slots > 0) {
      for (var s = 0; s < slots; s++) {
        var sa = -Math.PI / 2 + (s - (slots - 1) / 2) * 0.42 + c.spin * 0.25;
        var sx = c.x + Math.cos(sa) * (r + 6.5), sy = c.y + Math.sin(sa) * (r + 6.5);
        ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, 6.2832);
        ctx.fillStyle = s < slots - used ? TW.fcol(o, 88, 0.95) : TW.fcol(o, 40, 0.5);
        ctx.fill();
      }
    }

    // 被击中的闪光
    if (c.flash > 0.01) {
      blobPath(ctx, c.x, c.y, r, wob, c.seed, time);
      ctx.fillStyle = 'rgba(255,255,255,' + (c.flash * 0.3) + ')';
      ctx.fill();
    }

    // 同化涟漪
    if (c.captureAnim > 0.01) {
      var k = 1 - c.captureAnim;
      ctx.strokeStyle = TW.fcol(o, 78, c.captureAnim * 0.8);
      ctx.lineWidth = 3 * c.captureAnim + 0.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, r + k * r * 1.8, 0, 6.2832); ctx.stroke();
    }

    // 选中 / 悬停
    if (state.selected || state.hover) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(time * (state.selected ? 1.1 : 0.5));
      ctx.strokeStyle = state.valid === false ? 'rgba(255,90,80,0.9)' : 'rgba(255,255,255,' + (state.selected ? 0.85 : 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, 6.2832); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 数字
    var n = Math.max(0, Math.floor(c.energy));
    var fs = Math.round(r * 0.92);
    ctx.font = '800 ' + fs + 'px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeText(n, c.x, c.y + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(n, c.x, c.y + 1);
  }

  /* ---------------------------- 触手 ---------------------------- */

  function drawTentacle(ctx, t, time) {
    var prog = t.progress();
    if (prog <= 0.001) return;
    var o = t.owner;
    var nodes = Math.max(1, Math.floor(t.grown / TW.NODE_SPACING));
    var col = TW.fcol(o, 60, 0.95);
    var colDim = TW.fcol(o, 34, 0.85);
    var colHot = TW.fcol(o, 82, 1);

    // 底层的连续外壳
    ctx.beginPath();
    var steps = Math.max(6, Math.floor(nodes * 1.4));
    for (var i = 0; i <= steps; i++) {
      var p = t.pointAt(prog * i / steps, false, time);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colDim;
    ctx.lineWidth = 7.5;
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.stroke();

    // 一节一节的能量珠
    for (var k = 0; k <= nodes; k++) {
      var tt = (k * TW.NODE_SPACING) / Math.max(1, t.len);
      if (tt > prog) break;
      var q = t.pointAt(tt, false, time);
      var breathe = 1 + Math.sin(time * 4 - k * 0.55) * 0.13;
      var rad = (3.5 + (k === nodes ? 1.6 : 0)) * breathe;
      ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, 6.2832);
      ctx.fillStyle = TW.fcol(o, 68, 0.95);
      ctx.fill();
    }

    // 生长中的头部
    if (t.state === 'growing') {
      var head = t.pointAt(prog, false, time);
      ctx.globalCompositeOperation = 'lighter';
      var hg = ctx.createRadialGradient(head[0], head[1], 0, head[0], head[1], 14);
      hg.addColorStop(0, TW.fcol(o, 80, 0.55));
      hg.addColorStop(1, TW.fcol(o, 80, 0));
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(head[0], head[1], 14, 0, 6.2832); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(head[0], head[1], 5.2, 0, 6.2832);
      ctx.fillStyle = colHot; ctx.fill();
    }

    // 流动的能量
    ctx.globalCompositeOperation = 'lighter';
    for (var m = 0; m < t.pulses.length; m++) {
      var pp = t.pointAt(t.pulses[m].p, false, time);
      var pg = ctx.createRadialGradient(pp[0], pp[1], 0, pp[0], pp[1], 11);
      pg.addColorStop(0, 'rgba(255,255,255,0.85)');
      pg.addColorStop(0.35, TW.fcol(o, 78, 0.65));
      pg.addColorStop(1, TW.fcol(o, 78, 0));
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.arc(pp[0], pp[1], 11, 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------- 拖拽预览 ---------------------------- */

  function drawDrag(ctx, from, tx, ty, time, ok) {
    var dx = tx - from.x, dy = ty - from.y;
    var d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    var ux = dx / d, uy = dy / d;
    var ax = from.x + ux * (from.radius() - 2), ay = from.y + uy * (from.radius() - 2);
    var col = ok ? TW.fcol(from.owner, 70, 0.9) : 'rgba(255,95,85,0.9)';

    ctx.save();
    ctx.setLineDash([7, 9]);
    ctx.lineDashOffset = -time * 34;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.restore();

    ctx.beginPath(); ctx.arc(tx, ty, 5, 0, 6.2832);
    ctx.fillStyle = col; ctx.fill();
  }

  /* ---------------------------- 粒子 ---------------------------- */

  function drawParticles(ctx, list) {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var a = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color.replace('ALPHA', (a * 0.9).toFixed(3));
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.85), 0, 6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------- 划线切断的刀痕 ---------------------------- */

  function drawSlash(ctx, pts) {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }

  global.Render = {
    drawBackground: drawBackground,
    drawCell: drawCell,
    drawTentacle: drawTentacle,
    drawDrag: drawDrag,
    drawParticles: drawParticles,
    drawSlash: drawSlash
  };
})(window);
