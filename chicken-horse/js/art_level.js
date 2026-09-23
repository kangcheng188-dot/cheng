/* 主机架场景美术：机房背景 / 电路板 / 服务器机柜 / CPU 平台 / 终点旗 */
'use strict';
(function (U) {
  const { roundRect, makeRng, rgba, shade } = U.util;
  const { W, H } = U.C;
  const OL = '#111827';

  // 背景范围（格）
  const BG = { x0: -12, y0: -12, x1: W + 12, y1: H + 8 };

  // 在已按 ppt 缩放的画布上绘制清晰文字（避免极小字号）
  function textAt(ctx, str, x, y, size, color, ppt, align) {
    ctx.save();
    ctx.scale(1 / ppt, 1 / ppt);
    ctx.font = `bold ${Math.round(size * ppt)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x * ppt, y * ppt);
    ctx.restore();
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }

  // ---------- 背景（远景机房）----------
  function buildBackground(level, ppt) {
    const bw = BG.x1 - BG.x0, bh = BG.y1 - BG.y0;
    const c = makeCanvas(bw * ppt, bh * ppt);
    const ctx = c.getContext('2d');
    ctx.scale(ppt, ppt);
    ctx.translate(-BG.x0, -BG.y0);
    const rng = makeRng(20180928);

    const g = ctx.createLinearGradient(0, BG.y0, 0, BG.y1);
    g.addColorStop(0, '#07101d');
    g.addColorStop(0.35, '#0e2034');
    g.addColorStop(0.7, '#0c1a2b');
    g.addColorStop(1, '#050a12');
    ctx.fillStyle = g;
    ctx.fillRect(BG.x0, BG.y0, bw, bh);

    // 后墙网格
    ctx.strokeStyle = 'rgba(80,140,200,.05)';
    ctx.lineWidth = 0.04;
    ctx.beginPath();
    for (let x = Math.floor(BG.x0); x <= BG.x1; x += 2) { ctx.moveTo(x, BG.y0); ctx.lineTo(x, BG.y1); }
    for (let y = Math.floor(BG.y0); y <= BG.y1; y += 2) { ctx.moveTo(BG.x0, y); ctx.lineTo(BG.x1, y); }
    ctx.stroke();

    // 远处机架（两排，越远越暗）
    const leds = [];
    const rackRow = (baseY, rackH, col, frame, alpha, gap) => {
      let x = BG.x0 + rng() * 2;
      while (x < BG.x1) {
        const w = 3 + Math.floor(rng() * 2);
        const top = baseY - rackH - rng() * 3;
        ctx.globalAlpha = alpha;
        roundRect(ctx, x, top, w, BG.y1 - top, 0.2);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.lineWidth = 0.12;
        ctx.strokeStyle = frame;
        ctx.stroke();
        // 机架单元
        for (let y = top + 0.5; y < baseY + 6; y += 0.7) {
          ctx.fillStyle = rng() < 0.5 ? shade(col, 0.08) : shade(col, -0.1);
          ctx.fillRect(x + 0.25, y, w - 0.5, 0.5);
          if (rng() < 0.55) {
            const n = 1 + Math.floor(rng() * 3);
            for (let k = 0; k < n; k++) {
              leds.push({
                x: x + 0.45 + k * 0.28 + rng() * 0.05, y: y + 0.25,
                c: ['#3cff9a', '#4fc3ff', '#ffb347', '#3cff9a', '#3cff9a'][Math.floor(rng() * 5)],
                p: rng() * 10, s: 0.5 + rng() * 3, a: alpha, r: 0.06,
              });
            }
          }
          // 通风口
          if (rng() < 0.2) {
            ctx.fillStyle = 'rgba(0,0,0,.35)';
            for (let k = 0; k < 5; k++) ctx.fillRect(x + w - 1.3 + k * 0.2, y + 0.1, 0.08, 0.3);
          }
        }
        ctx.globalAlpha = 1;
        x += w + gap + rng() * 1.5;
      }
    };
    rackRow(8, 14, '#10233a', '#1a3350', 0.55, 0.6);
    rackRow(14, 10, '#13294a', '#21406a', 0.8, 1.6);

    // 大风扇格栅
    const fan = (cx, cy, r) => {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1726';
      ctx.fill();
      ctx.lineWidth = 0.15;
      ctx.strokeStyle = '#1d3452';
      ctx.stroke();
      ctx.lineWidth = 0.08;
      for (let k = 1; k <= 4; k++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * k) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
    };
    fan(23, 3, 2.6);
    fan(-4, 6, 2);
    fan(W + 4, 4, 2.2);

    // 顶部垂下的线缆束
    const cable = (x0, x1, sag, col, w) => {
      ctx.beginPath();
      ctx.moveTo(x0, BG.y0);
      ctx.bezierCurveTo(x0 + 0.5, sag, x1 - 0.5, sag, x1, BG.y0);
      ctx.lineWidth = w + 0.12;
      ctx.strokeStyle = '#04070d';
      ctx.stroke();
      ctx.lineWidth = w;
      ctx.strokeStyle = col;
      ctx.stroke();
    };
    const cableCols = ['#1c2744', '#27183d', '#132e3f', '#2b2238', '#18324a'];
    for (let i = 0; i < 16; i++) {
      const x0 = BG.x0 + rng() * (BG.x1 - BG.x0);
      const span = 4 + rng() * 10;
      cable(x0, x0 + span, -2 + rng() * 5, cableCols[i % cableCols.length], 0.25 + rng() * 0.3);
    }

    // 坑底暗影
    const pit = ctx.createLinearGradient(0, 17, 0, BG.y1);
    pit.addColorStop(0, 'rgba(0,0,0,0)');
    pit.addColorStop(1, 'rgba(0,4,10,.9)');
    ctx.fillStyle = pit;
    ctx.fillRect(BG.x0, 17, bw, BG.y1 - 17);
    // 坑底青绿辉光
    const glow = ctx.createRadialGradient(23, H + 4, 1, 23, H + 4, 16);
    glow.addColorStop(0, 'rgba(40,255,170,.18)');
    glow.addColorStop(1, 'rgba(40,255,170,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(5, H - 10, 36, 20);

    return { canvas: c, leds, ppt };
  }

  // ---------- 电路板 ----------
  function buildBoard(b, ppt, seed) {
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const pad = 0.35;
    const c = makeCanvas((bw + pad * 2) * ppt, (bh + pad * 2) * ppt);
    const ctx = c.getContext('2d');
    ctx.scale(ppt, ppt);
    ctx.translate(pad, pad);
    const rng = makeRng(seed);
    // 板身
    roundRect(ctx, -0.25, -0.25, bw + 0.5, bh + 0.5, 0.35);
    ctx.fillStyle = '#0a3a2a';
    ctx.fill();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = '#06241a';
    ctx.stroke();
    roundRect(ctx, -0.1, -0.1, bw + 0.2, bh + 0.2, 0.25);
    const pg = ctx.createLinearGradient(0, 0, bw, bh);
    pg.addColorStop(0, '#11684a');
    pg.addColorStop(1, '#0c4f38');
    ctx.fillStyle = pg;
    ctx.fill();
    // 格线
    ctx.strokeStyle = 'rgba(120,255,190,.10)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let x = 0; x <= bw; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, bh); }
    for (let y = 0; y <= bh; y++) { ctx.moveTo(0, y); ctx.lineTo(bw, y); }
    ctx.stroke();
    // 走线（直角 + 45°）
    const traces = [];
    for (let i = 0; i < 16; i++) {
      let x = Math.floor(rng() * bw) + 0.5, y = Math.floor(rng() * bh) + 0.5;
      const pts = [[x, y]];
      let dir = Math.floor(rng() * 4);
      const segs = 2 + Math.floor(rng() * 3);
      for (let s = 0; s < segs; s++) {
        const len = 1 + Math.floor(rng() * 4);
        const diag = rng() < 0.35;
        const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][dir];
        let dx = d[0] * len, dy = d[1] * len;
        if (diag) { dx = d[0] * len + (d[1] !== 0 ? len : 0) * (rng() < 0.5 ? 1 : -1); dy = d[1] * len + (d[0] !== 0 ? len : 0) * (rng() < 0.5 ? 1 : -1); }
        x = Math.min(bw - 0.5, Math.max(0.5, x + dx));
        y = Math.min(bh - 0.5, Math.max(0.5, y + dy));
        pts.push([x, y]);
        dir = (dir + (rng() < 0.5 ? 1 : 3)) % 4;
      }
      traces.push(pts);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const pts of traces) {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineWidth = 0.14;
      ctx.strokeStyle = 'rgba(0,30,20,.5)';
      ctx.stroke();
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = '#c9a54a';
      ctx.stroke();
      for (const k of [0, pts.length - 1]) {
        ctx.beginPath();
        ctx.arc(pts[k][0], pts[k][1], 0.12, 0, Math.PI * 2);
        ctx.fillStyle = '#e8c766';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pts[k][0], pts[k][1], 0.05, 0, Math.PI * 2);
        ctx.fillStyle = '#0a3a2a';
        ctx.fill();
      }
    }
    // 芯片
    for (let i = 0; i < 4; i++) {
      const cw = 1.4 + rng() * 1.2, ch = 0.9 + rng() * 0.8;
      const cx = 0.4 + rng() * (bw - cw - 0.8), cy = 0.4 + rng() * (bh - ch - 0.8);
      ctx.fillStyle = '#c0c4cc';
      for (let k = 0.2; k < cw - 0.1; k += 0.25) {
        ctx.fillRect(cx + k, cy - 0.12, 0.1, ch + 0.24);
      }
      roundRect(ctx, cx, cy, cw, ch, 0.08);
      ctx.fillStyle = '#16181f';
      ctx.fill();
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 0.18, cy + 0.18, 0.06, 0, Math.PI * 2);
      ctx.fillStyle = '#3a3d48';
      ctx.fill();
      textAt(ctx, 'IC' + (i + 1), cx + 0.35, cy + ch * 0.55, 0.28, 'rgba(255,255,255,.35)', ppt);
    }
    // 电容
    for (let i = 0; i < 6; i++) {
      const x = 0.5 + rng() * (bw - 1), y = 0.5 + rng() * (bh - 1);
      ctx.beginPath();
      ctx.arc(x, y, 0.22, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#2e5fae' : '#262a33';
      ctx.fill();
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = '#0a0f18';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 0.12, y); ctx.lineTo(x + 0.12, y);
      ctx.moveTo(x, y - 0.12); ctx.lineTo(x, y + 0.12);
      ctx.strokeStyle = 'rgba(220,230,255,.6)';
      ctx.stroke();
    }
    // 安装孔
    for (const [x, y] of [[0.05, 0.05], [bw - 0.05, 0.05], [0.05, bh - 0.05], [bw - 0.05, bh - 0.05]]) {
      ctx.beginPath();
      ctx.arc(x, y, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#d8b659';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#04120c';
      ctx.fill();
    }
    // 丝印
    textAt(ctx, seed % 2 ? 'MAINFRAME-B' : 'MAINFRAME-A', 0.35, bh - 0.35, 0.34, 'rgba(230,255,240,.45)', ppt);
    return { canvas: c, pad, traces, ppt };
  }

  // ---------- 服务器机柜（地形）----------
  function drawCabinet(ctx, x0, y0, x1, y1, label, rng, isStart) {
    const w = x1 - x0, h = y1 - y0;
    // 主体
    ctx.fillStyle = '#3f4c62';
    ctx.fillRect(x0, y0, w, h);
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(255,255,255,.06)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.18)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
    // 顶盖
    ctx.fillStyle = '#8697b1';
    ctx.fillRect(x0, y0, w, 0.28);
    ctx.fillStyle = '#b3c1d6';
    ctx.fillRect(x0, y0, w, 0.08);
    ctx.fillStyle = '#2c3647';
    ctx.fillRect(x0, y0 + 0.28, w, 0.08);
    // 机架单元
    for (let y = y0 + 0.7; y < y1 - 0.3; y += 1.0) {
      roundRect(ctx, x0 + 0.45, y, w - 0.9, 0.78, 0.08);
      ctx.fillStyle = '#2f3a4d';
      ctx.fill();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = '#1a2230';
      ctx.stroke();
      // 硬盘仓
      const bays = Math.floor((w - 1.6) / 0.9);
      for (let k = 0; k < bays; k++) {
        const bx = x0 + 0.65 + k * 0.9;
        roundRect(ctx, bx, y + 0.12, 0.78, 0.54, 0.05);
        ctx.fillStyle = rng() < 0.5 ? '#465570' : '#3d4a62';
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        for (let v = 0; v < 4; v++) ctx.fillRect(bx + 0.1 + v * 0.12, y + 0.22, 0.06, 0.34);
      }
    }
    // 边框描边
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = OL;
    ctx.strokeRect(x0 + 0.05, y0 + 0.05, w - 0.1, h + 2);
    // 四角螺丝
    ctx.fillStyle = '#9fb0c8';
    for (const [sx, sy] of [[x0 + 0.22, y0 + 0.5], [x1 - 0.22, y0 + 0.5]]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
    // 铭牌
    roundRect(ctx, x0 + w / 2 - 1.1, y0 + 0.45, 2.2, 0.5, 0.08);
    ctx.fillStyle = '#1b2331';
    ctx.fill();
    textAt(ctx, label, x0 + w / 2, y0 + 0.71, 0.34, '#7ee0ff', ctx.__ppt, 'center');
    if (isStart) {
      // 电源图标
      const cx = x0 + w / 2, cy = y0 + 3.3;
      ctx.beginPath();
      ctx.arc(cx, cy, 0.95, 0, Math.PI * 2);
      ctx.fillStyle = '#243044';
      ctx.fill();
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 0.55, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + Math.PI * 2);
      ctx.lineWidth = 0.16;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#3cff9a';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 0.7);
      ctx.lineTo(cx, cy - 0.15);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  function drawChip(ctx) {
    // x 21..25, y 15..16 + 底座 22..24, 16..17
    const x0 = 21, y0 = 15;
    // 引脚
    ctx.fillStyle = '#d8b659';
    for (let k = 0; k < 7; k++) {
      ctx.fillRect(x0 + 0.3 + k * 0.52, y0 + 0.9, 0.18, 0.35);
    }
    ctx.fillStyle = '#c0c6d2';
    for (let k = 0; k < 3; k++) {
      ctx.fillRect(22.25 + k * 0.6, 16.9, 0.15, 0.3);
    }
    // 底座
    roundRect(ctx, 22, 16, 2, 1, 0.08);
    ctx.fillStyle = '#1b1f28';
    ctx.fill();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = OL;
    ctx.stroke();
    // 芯片本体
    roundRect(ctx, x0, y0, 4, 1, 0.1);
    const g = ctx.createLinearGradient(0, y0, 0, y0 + 1);
    g.addColorStop(0, '#4a5163');
    g.addColorStop(1, '#262a35');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.fillStyle = '#8e99ad';
    ctx.fillRect(x0 + 0.1, y0 + 0.05, 3.8, 0.1);
    // 金属顶盖
    roundRect(ctx, x0 + 0.9, y0 + 0.22, 2.2, 0.6, 0.06);
    ctx.fillStyle = '#b8c0cc';
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.stroke();
    textAt(ctx, 'CPU', x0 + 2, y0 + 0.53, 0.36, '#39404f', ctx.__ppt, 'center');
  }

  function buildTerrain(level, ppt) {
    // 覆盖 y 14..H+8 全宽（含左右各 1 格外延）
    const X0 = -1, Y0 = 13, X1 = W + 1, Y1 = H + 8;
    const c = makeCanvas((X1 - X0) * ppt, (Y1 - Y0) * ppt);
    const ctx = c.getContext('2d');
    ctx.scale(ppt, ppt);
    ctx.translate(-X0, -Y0);
    const rng = makeRng(77);
    ctx.__ppt = ppt;
    drawCabinet(ctx, -1, 16, 9, Y1, 'SRV-01', rng, true);
    drawCabinet(ctx, 37, 16, W + 1, Y1, 'SRV-02', rng, false);
    drawChip(ctx);
    return { canvas: c, x0: X0, y0: Y0, w: X1 - X0, h: Y1 - Y0, ppt };
  }

  // ---------- 电路实体格精灵 ----------
  const tileCache = new Map();
  function circuitTile(colorHex, ppt) {
    const key = colorHex + ppt;
    if (tileCache.has(key)) return tileCache.get(key);
    const c = makeCanvas(ppt, ppt);
    const ctx = c.getContext('2d');
    ctx.scale(ppt, ppt);
    roundRect(ctx, 0.03, 0.03, 0.94, 0.94, 0.1);
    const g = ctx.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, shade(colorHex, 0.35));
    g.addColorStop(1, shade(colorHex, -0.35));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = shade(colorHex, -0.7);
    ctx.stroke();
    roundRect(ctx, 0.16, 0.16, 0.68, 0.68, 0.06);
    ctx.fillStyle = rgba(shade(colorHex, -0.55), 0.85);
    ctx.fill();
    // 内部电路纹
    ctx.strokeStyle = shade(colorHex, 0.55);
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(0.16, 0.5); ctx.lineTo(0.4, 0.5); ctx.lineTo(0.55, 0.35); ctx.lineTo(0.84, 0.35);
    ctx.moveTo(0.5, 0.84); ctx.lineTo(0.5, 0.65); ctx.lineTo(0.65, 0.65);
    ctx.stroke();
    ctx.fillStyle = shade(colorHex, 0.7);
    ctx.beginPath(); ctx.arc(0.4, 0.5, 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.65, 0.65, 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(0.12, 0.08, 0.76, 0.06);
    tileCache.set(key, c);
    return c;
  }

  // ---------- 终点旗 ----------
  function drawFlag(ctx, level, t) {
    const g = level.goal;
    const px = g.x, base = g.y, top = base - 3.6;
    // 底座
    roundRect(ctx, px - 0.45, base - 0.3, 0.9, 0.3, 0.08);
    ctx.fillStyle = '#5b6479';
    ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = OL;
    ctx.stroke();
    // 旗杆
    ctx.fillStyle = '#e9edf3';
    ctx.fillRect(px - 0.07, top, 0.14, base - top - 0.3);
    ctx.lineWidth = 0.05;
    ctx.strokeRect(px - 0.07, top, 0.14, base - top - 0.3);
    ctx.beginPath();
    ctx.arc(px, top - 0.05, 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.stroke();
    // 飘动的三角锦旗（红底 + 白色横纹 + 黄边）
    const fw = 2.1, fh = 1.35;
    const n = 12;
    const wave = (u) => Math.sin(t * 5 - u * 5) * 0.14 * u;
    const edge = (u, side) => top + 0.1 + (side ? fh * (1 - u * 0.5) + u * fh * 0.0 : fh * u * 0.5) + wave(u);
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const u = i / n; ctx.lineTo(px + 0.07 + u * fw, top + 0.1 + (fh / 2) * u + wave(u)); }
    for (let i = n; i >= 0; i--) { const u = i / n; ctx.lineTo(px + 0.07 + u * fw, top + 0.1 + fh - (fh / 2) * u + wave(u)); }
    ctx.closePath();
    ctx.fillStyle = '#ff4136';
    ctx.fill();
    // 白色横纹
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const u = i / n; ctx.lineTo(px + 0.07 + u * fw, top + 0.1 + fh * 0.4 + wave(u)); }
    for (let i = n; i >= 0; i--) { const u = i / n; ctx.lineTo(px + 0.07 + u * fw, top + 0.1 + fh * 0.6 + wave(u)); }
    ctx.closePath();
    ctx.fillStyle = '#fff4e0';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const u = i / n; ctx.lineTo(px + 0.07 + u * fw, top + 0.1 + (fh / 2) * u + wave(u)); }
    for (let i = n; i >= 0; i--) { const u = i / n; ctx.lineTo(px + 0.07 + u * fw, top + 0.1 + fh - (fh / 2) * u + wave(u)); }
    ctx.closePath();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = OL;
    ctx.stroke();
    void edge;
  }

  // 坑中下落的二进制数据流（动态）
  const streams = [];
  (function initStreams() {
    const rng = makeRng(42);
    for (let i = 0; i < 26; i++) {
      streams.push({
        x: 9.3 + rng() * 27.4,
        speed: 1.5 + rng() * 2.5,
        off: rng() * 20,
        len: 4 + Math.floor(rng() * 5),
        bits: Array.from({ length: 10 }, () => (rng() < 0.5 ? '0' : '1')),
      });
    }
  })();

  function drawDataStreams(ctx, t) {
    const K = 32; // 避免极小字号：放大坐标系绘制文字
    ctx.save();
    ctx.scale(1 / K, 1 / K);
    ctx.font = `bold ${0.5 * K}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    for (const s of streams) {
      if (s.x > 20.5 && s.x < 25.5) continue;
      const head = 17 + ((t * s.speed + s.off) % 16);
      for (let k = 0; k < s.len; k++) {
        const y = head - k * 0.55;
        if (y < 17.2) continue;
        const a = (1 - k / s.len) * 0.4 * Math.min(1, (y - 17.2) / 2);
        ctx.fillStyle = k === 0 ? `rgba(200,255,230,${a + 0.1})` : `rgba(60,255,160,${a})`;
        ctx.fillText(s.bits[(k + Math.floor(t * 3)) % s.bits.length], s.x * K, y * K);
      }
    }
    ctx.restore();
  }

  U.LevelArt = {
    BG, buildBackground, buildBoard, buildTerrain, circuitTile, drawFlag, drawDataStreams, makeCanvas,
  };
})(window.UCH);
