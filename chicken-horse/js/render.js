/* 渲染：镜头、图层、世界绘制 */
'use strict';
(function (U) {
  const { W, H, PLAYER_COLORS } = U.C;
  const { clamp, lerp, rgba, drawText } = U.util;
  const LA = U.LevelArt;

  const R = {
    canvas: null,
    ctx: null,
    dpr: 1,
    vw: 800,
    vh: 450,
    cam: { x: W / 2, y: H / 2, s: 20 },
    target: { x: W / 2, y: H / 2, s: 20 },
    layers: null,
    hudTop: 0,
    viewPad: { top: 0, bottom: 0 },
  };

  R.init = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.resize();
    window.addEventListener('resize', R.resize);
    window.addEventListener('orientationchange', () => setTimeout(R.resize, 200));
  };

  R.resize = function () {
    const c = R.canvas;
    R.dpr = Math.min(2, window.devicePixelRatio || 1);
    R.vw = Math.max(1, c.clientWidth || window.innerWidth);
    R.vh = Math.max(1, c.clientHeight || window.innerHeight);
    c.width = Math.round(R.vw * R.dpr);
    c.height = Math.round(R.vh * R.dpr);
    const full = R.fullView();
    R.target = full;
    R.cam = Object.assign({}, full);
  };

  R.build = function (level) {
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    const bgPPT = mobile ? 16 : 22;
    const hiPPT = mobile ? 48 : 64;
    R.layers = {
      bg: LA.buildBackground(level, bgPPT),
      boards: level.boards.map((b, i) => Object.assign(LA.buildBoard(b, hiPPT, 11 + i * 7), { b })),
      terrain: LA.buildTerrain(level, hiPPT),
      tilePPT: hiPPT,
    };
  };

  // 适配整张地图
  R.fullView = function () {
    const padTop = R.viewPad.top, padBot = R.viewPad.bottom;
    const x0 = -0.5, x1 = W + 0.5, y0 = -1.5, y1 = H + 0.3;
    const s = Math.min(R.vw / (x1 - x0), (R.vh - padTop - padBot) / (y1 - y0));
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 - (padTop - padBot) / 2 / s, s };
  };

  // 奔跑阶段：框住存活玩家
  R.followView = function (points) {
    const full = R.fullView();
    if (!points.length) return full;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    const mobile = Math.min(R.vw, R.vh) < 500;
    const minW = mobile ? 22 : 30;
    x0 -= 7; x1 += 7; y0 -= 5; y1 += 3.5;
    let w = Math.max(minW, x1 - x0), h = Math.max(minW * 0.5, y1 - y0);
    let s = Math.min(R.vw / w, (R.vh - R.viewPad.top) / h);
    s = clamp(s, full.s, full.s * 2.4);
    const vwT = R.vw / s, vhT = R.vh / s;
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // 限制在地图附近
    const bx0 = -2, bx1 = W + 2, by0 = -5, by1 = H + 1.5;
    if (vwT < bx1 - bx0) cx = clamp(cx, bx0 + vwT / 2, bx1 - vwT / 2);
    else cx = W / 2;
    if (vhT < by1 - by0) cy = clamp(cy, by0 + vhT / 2, by1 - vhT / 2);
    else cy = full.y;
    return { x: cx, y: cy, s };
  };

  R.update = function (dt, speed) {
    const k = 1 - Math.exp(-dt * (speed || 4));
    R.cam.x = lerp(R.cam.x, R.target.x, k);
    R.cam.y = lerp(R.cam.y, R.target.y, k);
    R.cam.s = lerp(R.cam.s, R.target.s, k);
  };
  R.snap = function () {
    R.cam = Object.assign({}, R.target);
  };

  R.worldTransform = function (ctx) {
    const { x, y, s } = R.cam;
    const sh = U.FX.shake;
    const ox = sh ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const oy = sh ? (Math.random() - 0.5) * sh * 0.5 : 0;
    const d = R.dpr;
    ctx.setTransform(d * s, 0, 0, d * s, d * (R.vw / 2 - (x + ox) * s), d * (R.vh / 2 - (y + oy) * s));
  };
  R.screenTransform = function (ctx) {
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  };
  R.toWorld = function (px, py) {
    const { x, y, s } = R.cam;
    return { x: (px - R.vw / 2) / s + x, y: (py - R.vh / 2) / s + y };
  };
  R.toScreen = function (wx, wy) {
    const { x, y, s } = R.cam;
    return { x: (wx - x) * s + R.vw / 2, y: (wy - y) * s + R.vh / 2 };
  };

  // ---------------- 世界绘制 ----------------
  R.drawWorld = function (G, t) {
    const ctx = R.ctx;
    const L = R.layers;
    const world = G.world;
    const runT = G.state === 'run' && G.run && G.run.started ? G.run.t : null;
    R.screenTransform(ctx);
    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, R.vw, R.vh);
    R.worldTransform(ctx);

    // 背景（轻微视差）
    const px = (R.cam.x - W / 2) * 0.12, py = (R.cam.y - H / 2) * 0.08;
    const BG = LA.BG;
    ctx.save();
    ctx.translate(px, py);
    ctx.drawImage(L.bg.canvas, BG.x0, BG.y0, BG.x1 - BG.x0, BG.y1 - BG.y0);
    // 闪烁 LED
    const vx0 = R.cam.x - R.vw / 2 / R.cam.s - 1, vx1 = R.cam.x + R.vw / 2 / R.cam.s + 1;
    for (const l of L.bg.leds) {
      if (l.x < vx0 - px || l.x > vx1 - px) continue;
      const v = Math.sin(t * l.s + l.p);
      if (v < -0.2) continue;
      ctx.globalAlpha = l.a * (0.5 + 0.5 * v);
      ctx.fillStyle = l.c;
      ctx.fillRect(l.x - 0.07, l.y - 0.07, 0.14, 0.14);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    LA.drawDataStreams(ctx, t);

    // 电路板
    for (const bd of L.boards) {
      const b = bd.b;
      ctx.drawImage(bd.canvas, b.x0 - bd.pad, b.y0 - bd.pad, b.x1 - b.x0 + bd.pad * 2, b.y1 - b.y0 + bd.pad * 2);
      // 走线上流动的光点
      ctx.fillStyle = 'rgba(180,255,220,.9)';
      bd.traces.forEach((pts, i) => {
        let len = 0;
        const segs = [];
        for (let k = 1; k < pts.length; k++) {
          const l = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
          segs.push(l);
          len += l;
        }
        if (len <= 0) return;
        let d = ((t * 2.2 + i * 1.7) % (len + 3));
        if (d > len) return;
        for (let k = 0; k < segs.length; k++) {
          if (d <= segs[k]) {
            const u = d / segs[k];
            const x = lerp(pts[k][0], pts[k + 1][0], u) + b.x0, y = lerp(pts[k][1], pts[k + 1][1], u) + b.y0;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            ctx.arc(x, y, 0.09, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.arc(x, y, 0.22, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          d -= segs[k];
        }
      });
      ctx.globalAlpha = 1;
    }

    // 本回合经过的电路格（发光）
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    for (const [idx, pid] of world.circuitMarks) {
      const x = idx % W, y = (idx / W) | 0;
      const col = PLAYER_COLORS[pid] || '#ffffff';
      ctx.fillStyle = rgba(col, 0.42 + pulse * 0.12);
      ctx.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
      ctx.strokeStyle = rgba(col, 0.95);
      ctx.lineWidth = 0.06;
      ctx.strokeRect(x + 0.1, y + 0.1, 0.8, 0.8);
    }

    // 地形
    const T = L.terrain;
    ctx.drawImage(T.canvas, T.x0, T.y0, T.w, T.h);

    // 电路实体格（含出现/消失动画）
    const tr = G.transition;
    for (const [idx, pid] of world.circuitSolid) {
      const x = idx % W, y = (idx / W) | 0;
      let sc = 1;
      if (tr && tr.added && tr.addedSet.has(idx)) {
        const k = clamp((tr.t - tr.delay(idx)) / 0.3, 0, 1);
        if (k <= 0) continue;
        sc = U.util.ease.outBack(k);
      }
      const img = LA.circuitTile(PLAYER_COLORS[pid] || '#8899aa', L.tilePPT);
      if (sc !== 1) {
        ctx.drawImage(img, x + 0.5 - sc / 2, y + 0.5 - sc / 2, sc, sc);
      } else {
        ctx.drawImage(img, x, y, 1, 1);
      }
    }
    if (tr && tr.removed) {
      for (const [idx, pid] of tr.removed) {
        const k = clamp((tr.t - tr.delayOld(idx)) / 0.3, 0, 1);
        if (k >= 1) continue;
        const x = idx % W, y = (idx / W) | 0;
        const img = LA.circuitTile(PLAYER_COLORS[pid] || '#8899aa', L.tilePPT);
        ctx.globalAlpha = 1 - k;
        const sc = 1 - k * 0.6;
        ctx.drawImage(img, x + 0.5 - sc / 2, y + 0.5 - sc / 2, sc, sc);
        ctx.globalAlpha = 1;
      }
    }

    // 终点旗
    LA.drawFlag(ctx, G.level, t);

    // 道具
    for (const it of world.items) {
      if (it.hidden) continue;
      if (it.dropT != null) {
        const k = clamp((t - it.dropT) / 0.25, 0, 1);
        ctx.save();
        const fp = U.Items.footprint(it.type, it.rot);
        const cx = it.gx + fp.w / 2, cy = it.gy + fp.h / 2;
        const sc = 1 + (1 - U.util.ease.outBack(k)) * 0.35;
        ctx.translate(cx, cy);
        ctx.scale(sc, sc);
        ctx.translate(-cx, -cy);
        U.ItemArt.draw(ctx, it, t, runT);
        ctx.restore();
      } else {
        U.ItemArt.draw(ctx, it, t, runT);
      }
    }
    // 火焰 & 箭
    if (runT != null) {
      for (const f of world.flames) U.ItemArt.flameJet(ctx, f, t, runT);
      R.drawArrows(ctx, world, runT);
    }

    // 玩家
    if (G.players) {
      for (const p of G.players) if (p.visible) R.drawPlayer(ctx, p, t);
    }

    U.FX.draw(ctx);
  };

  R.drawArrows = function (ctx, world, runT) {
    const T = U.Items.TIMING.crossbow;
    const tStart = runT - T.first;
    if (tStart < 0) return;
    for (const w of world.bows) {
      const kMax = Math.floor(tStart / T.period);
      const travel = (w.range + T.len) / T.speed;
      const kMin = Math.max(0, Math.floor((tStart - travel - 0.8) / T.period));
      for (let k = kMin; k <= kMax; k++) {
        const age = tStart - k * T.period;
        let tip = age * T.speed;
        let stuck = false;
        if (tip > w.range) {
          const since = (tip - w.range) / T.speed;
          if (since > 0.7) continue;
          tip = w.range + 0.25;
          stuck = true;
        }
        ctx.save();
        ctx.translate(w.sx + w.dx * tip, w.sy + w.dy * tip);
        ctx.rotate(Math.atan2(w.dy, w.dx));
        if (stuck) ctx.globalAlpha = 0.85;
        U.ItemArt.arrow(ctx, Math.min(T.len, tip + 0.1));
        ctx.restore();
      }
    }
  };

  R.drawPlayer = function (ctx, p, t) {
    const b = p.body;
    const a = p.anim;
    ctx.save();
    ctx.translate(b.x, b.y + (a.offY || 0));
    // 脚下阴影
    if (b.onGround) {
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.42, 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const sc = a.scale != null ? a.scale : 1;
    ctx.scale(sc, sc);
    U.Chars.draw(ctx, p.char, {
      state: a.state, t: t + p.idx * 1.3, facing: a.facing, phase: a.phase,
      sx: a.sx, sy: a.sy, look: a.look, blink: a.blink, tilt: a.tilt,
    });
    // 头顶的玩家色标记
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#1b1830';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    const my = -1.62 + Math.sin(t * 4 + p.idx) * 0.04;
    ctx.moveTo(-0.16, my - 0.16);
    ctx.lineTo(0.16, my - 0.16);
    ctx.lineTo(0, my + 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 携带的金币
    if (p.coin) {
      ctx.save();
      ctx.translate(-0.5, -2.35);
      U.ItemArt.draw(ctx, { type: 'coin', rot: 0, gx: 0, gy: 0 }, t, null);
      ctx.restore();
    }
    ctx.restore();
  };

  // 屏幕空间：玩家名字标签
  R.drawPlayerTags = function (G) {
    const ctx = R.ctx;
    if (!G.players) return;
    R.screenTransform(ctx);
    for (const p of G.players) {
      if (!p.visible || p.anim.hideTag) continue;
      const s = R.toScreen(p.body.x, p.body.y - 1.95);
      const size = clamp(R.cam.s * 0.42, 10, 16);
      drawText(ctx, p.tag, s.x, s.y - size * 0.4, { size, color: p.color, font: U.util.FONT_UI, lw: size * 0.28 });
    }
  };

  U.Render = R;
})(window.UCH);
