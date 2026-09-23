/* 道具绘制（格单位，原点 = 道具占格左上角） */
'use strict';
(function (U) {
  const { roundRect, shade } = U.util;
  const { DEFS, DIRS, TIMING, footprint } = U.Items;
  const OL = '#241a1a';

  function cellSet(fp) {
    const s = new Set();
    for (const [x, y] of fp.cells) s.add(x + ',' + y);
    return s;
  }

  // ---- 木块 ----
  function wood(ctx, fp) {
    const has = cellSet(fp);
    for (const [x, y] of fp.cells) {
      const i = 0.03;
      roundRect(ctx, x + i, y + i, 1 - 2 * i, 1 - 2 * i, 0.1);
      ctx.fillStyle = '#c98b4b';
      ctx.fill();
      // 木纹板条
      ctx.save();
      roundRect(ctx, x + i, y + i, 1 - 2 * i, 1 - 2 * i, 0.1);
      ctx.clip();
      ctx.fillStyle = '#d99e5c';
      ctx.fillRect(x, y, 1, 0.16);
      ctx.fillStyle = '#b07638';
      ctx.fillRect(x, y + 0.84, 1, 0.16);
      ctx.strokeStyle = 'rgba(90,50,20,.55)';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(x, y + 0.36); ctx.lineTo(x + 1, y + 0.36);
      ctx.moveTo(x, y + 0.62); ctx.lineTo(x + 1, y + 0.62);
      ctx.moveTo(x + 0.3 + ((x * 7 + y * 3) % 3) * 0.15, y + 0.36);
      ctx.lineTo(x + 0.3 + ((x * 7 + y * 3) % 3) * 0.15, y + 0.62);
      ctx.stroke();
      // 木节
      ctx.beginPath();
      ctx.ellipse(x + 0.7 - ((x + y) % 2) * 0.35, y + 0.49, 0.06, 0.035, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100,55,20,.5)';
      ctx.fill();
      ctx.restore();
      roundRect(ctx, x + i, y + i, 1 - 2 * i, 1 - 2 * i, 0.1);
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = OL;
      ctx.stroke();
      // 钉子
      ctx.fillStyle = '#6b5a4a';
      for (const [nx, ny] of [[0.16, 0.2], [0.84, 0.2], [0.16, 0.8], [0.84, 0.8]]) {
        ctx.beginPath();
        ctx.arc(x + nx, y + ny, 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
      // 相邻格之间的连接（去掉内缝的感觉）
      if (has.has(x + 1 + ',' + y)) {
        ctx.fillStyle = '#c98b4b';
        ctx.fillRect(x + 0.93, y + 0.2, 0.14, 0.6);
      }
      if (has.has(x + ',' + (y + 1))) {
        ctx.fillStyle = '#c98b4b';
        ctx.fillRect(x + 0.2, y + 0.93, 0.6, 0.14);
      }
    }
  }

  function ice(ctx, fp, t) {
    for (const [x, y] of fp.cells) {
      roundRect(ctx, x + 0.03, y + 0.03, 0.94, 0.94, 0.12);
      const g = ctx.createLinearGradient(x, y, x + 1, y + 1);
      g.addColorStop(0, '#dff8ff');
      g.addColorStop(1, '#7fd3f5');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#2e6f96';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 0.06;
      ctx.beginPath();
      ctx.moveTo(x + 0.2, y + 0.3); ctx.lineTo(x + 0.4, y + 0.15);
      ctx.moveTo(x + 0.22, y + 0.55); ctx.lineTo(x + 0.62, y + 0.2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(x + 0.12, y + 0.08, 0.76, 0.07);
    }
    // 闪光
    const s = (t * 0.6) % 3;
    if (s < 1) {
      const [x, y] = fp.cells[0];
      ctx.fillStyle = `rgba(255,255,255,${0.6 * Math.sin(s * Math.PI)})`;
      ctx.beginPath();
      ctx.arc(x + 0.3 + s * 0.4, y + 0.3, 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function honey(ctx, fp, t) {
    for (const [x, y] of fp.cells) {
      ctx.beginPath();
      ctx.moveTo(x + 0.1, y + 0.05);
      ctx.lineTo(x + 0.9, y + 0.05);
      ctx.quadraticCurveTo(x + 1.0, y + 0.05, x + 0.98, y + 0.2);
      ctx.lineTo(x + 0.97, y + 0.85);
      // 底部滴落
      const d1 = 0.1 + 0.08 * Math.sin(t * 2 + x);
      const d2 = 0.14 + 0.1 * Math.sin(t * 1.6 + y + 1);
      ctx.quadraticCurveTo(x + 0.9, y + 0.98, x + 0.78, y + 0.95);
      ctx.quadraticCurveTo(x + 0.72, y + 0.95 + d1, x + 0.66, y + 0.95);
      ctx.quadraticCurveTo(x + 0.5, y + 1.0, x + 0.38, y + 0.95);
      ctx.quadraticCurveTo(x + 0.3, y + 0.95 + d2, x + 0.22, y + 0.95);
      ctx.quadraticCurveTo(x + 0.03, y + 0.98, x + 0.03, y + 0.8);
      ctx.lineTo(x + 0.03, y + 0.2);
      ctx.quadraticCurveTo(x + 0.02, y + 0.05, x + 0.1, y + 0.05);
      ctx.closePath();
      const g = ctx.createLinearGradient(x, y, x, y + 1);
      g.addColorStop(0, '#ffcf4a');
      g.addColorStop(1, '#e88a0c');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#6b3a06';
      ctx.stroke();
      // 蜂巢纹
      ctx.strokeStyle = 'rgba(160,80,0,.35)';
      ctx.lineWidth = 0.035;
      const hex = (cx, cy, r) => {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 3) * k;
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
      };
      hex(x + 0.35, y + 0.45, 0.13);
      hex(x + 0.62, y + 0.6, 0.13);
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath();
      ctx.ellipse(x + 0.25, y + 0.2, 0.12, 0.05, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function conveyor(ctx, fp, rot, t) {
    const w = fp.w;
    const dir = rot === 0 ? 1 : -1;
    roundRect(ctx, 0.02, 0.1, w - 0.04, 0.8, 0.4);
    ctx.fillStyle = '#383d4a';
    ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = OL;
    ctx.stroke();
    // 皮带上的箭头
    ctx.save();
    roundRect(ctx, 0.08, 0.14, w - 0.16, 0.72, 0.36);
    ctx.clip();
    ctx.fillStyle = '#2a2e38';
    ctx.fillRect(0, 0, w, 1);
    const off = ((t * 4.5 * dir) % 0.5 + 0.5) % 0.5;
    ctx.fillStyle = '#ffcc33';
    for (let x = -1 + off; x < w + 1; x += 0.5) {
      ctx.beginPath();
      if (dir > 0) {
        ctx.moveTo(x, 0.14); ctx.lineTo(x + 0.14, 0.14); ctx.lineTo(x + 0.28, 0.3); ctx.lineTo(x + 0.14, 0.46); ctx.lineTo(x, 0.46); ctx.lineTo(x + 0.14, 0.3);
      } else {
        ctx.moveTo(x + 0.28, 0.14); ctx.lineTo(x + 0.14, 0.14); ctx.lineTo(x, 0.3); ctx.lineTo(x + 0.14, 0.46); ctx.lineTo(x + 0.28, 0.46); ctx.lineTo(x + 0.14, 0.3);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // 滚轮
    for (const cx of [0.42, w - 0.42]) {
      ctx.beginPath();
      ctx.arc(cx, 0.62, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#9aa3b5';
      ctx.fill();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = OL;
      ctx.stroke();
      const a = t * 8 * dir;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 0.14, 0.62 + Math.sin(a) * 0.14);
      ctx.lineTo(cx - Math.cos(a) * 0.14, 0.62 - Math.sin(a) * 0.14);
      ctx.stroke();
    }
  }

  // 以格中心为原点旋转绘制方向性道具
  function withDir(ctx, rot, fn) {
    ctx.save();
    ctx.translate(0.5, 0.5);
    ctx.rotate((rot * Math.PI) / 2);
    ctx.translate(-0.5, -0.5);
    fn();
    ctx.restore();
  }

  function spring(ctx, rot, t, it) {
    const comp = it && it.bounceT ? Math.max(0, 1 - (t - it.bounceT) * 5) : 0;
    const ext = it && it.bounceT ? Math.max(0, Math.sin(Math.min(1, (t - it.bounceT) * 4) * Math.PI) * 0.25) : 0;
    withDir(ctx, rot, () => {
      // 底座
      roundRect(ctx, 0.06, 0.74, 0.88, 0.22, 0.06);
      ctx.fillStyle = '#5b6273';
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = OL;
      ctx.stroke();
      // 弹簧圈
      const top = 0.32 - ext + comp * 0.2;
      ctx.beginPath();
      const n = 4;
      for (let i = 0; i <= n * 2; i++) {
        const yy = 0.74 - ((0.74 - top) * i) / (n * 2);
        ctx.lineTo(i % 2 ? 0.78 : 0.22, yy);
      }
      ctx.lineWidth = 0.1;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = '#d7dde8';
      ctx.stroke();
      // 顶板
      roundRect(ctx, 0.02, top - 0.24, 0.96, 0.24, 0.08);
      ctx.fillStyle = '#e8413c';
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(0.12, top - 0.19, 0.5, 0.05);
    });
  }

  function wire(ctx, t) {
    // 木桩 + 铁丝圈
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(0.44, 0.08, 0.12, 0.86);
    ctx.lineWidth = 0.045;
    ctx.strokeStyle = OL;
    ctx.strokeRect(0.44, 0.08, 0.12, 0.86);
    ctx.lineWidth = 0.06;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.ellipse(0.5, 0.25 + k * 0.25, 0.42, 0.16, 0.25 * (k % 2 ? 1 : -1), 0, Math.PI * 2);
      ctx.strokeStyle = '#2b2d33';
      ctx.lineWidth = 0.09;
      ctx.stroke();
      ctx.strokeStyle = '#b6bcc6';
      ctx.lineWidth = 0.045;
      ctx.stroke();
    }
    // 倒刺
    ctx.strokeStyle = '#2b2d33';
    ctx.lineWidth = 0.05;
    const barbs = [[0.12, 0.2], [0.85, 0.3], [0.1, 0.52], [0.9, 0.48], [0.16, 0.8], [0.84, 0.76], [0.5, 0.1], [0.5, 0.9]];
    for (const [x, y] of barbs) {
      ctx.beginPath();
      ctx.moveTo(x - 0.07, y - 0.07); ctx.lineTo(x + 0.07, y + 0.07);
      ctx.moveTo(x + 0.07, y - 0.07); ctx.lineTo(x - 0.07, y + 0.07);
      ctx.stroke();
    }
  }

  function spikes(ctx, rot) {
    withDir(ctx, rot, () => {
      roundRect(ctx, 0.02, 0.58, 0.96, 0.4, 0.06);
      ctx.fillStyle = '#586074';
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.fillStyle = '#7b849a';
      ctx.fillRect(0.08, 0.62, 0.84, 0.08);
      for (let k = 0; k < 3; k++) {
        const x = 0.04 + k * 0.31;
        ctx.beginPath();
        ctx.moveTo(x, 0.6);
        ctx.lineTo(x + 0.155, 0.02);
        ctx.lineTo(x + 0.31, 0.6);
        ctx.closePath();
        const g = ctx.createLinearGradient(x, 0, x + 0.31, 0);
        g.addColorStop(0, '#f2f5fa');
        g.addColorStop(0.5, '#c3cad6');
        g.addColorStop(1, '#8c95a6');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = OL;
        ctx.stroke();
      }
    });
  }

  function saw(ctx, t, spinning) {
    const a = spinning ? t * 14 : 0;
    // 支架
    ctx.fillStyle = '#4b5263';
    ctx.beginPath();
    ctx.moveTo(0.7, 1.95); ctx.lineTo(1.3, 1.95); ctx.lineTo(1.1, 1.0); ctx.lineTo(0.9, 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.save();
    ctx.translate(1, 1);
    ctx.rotate(a);
    const teeth = 16, R = 0.96, r = 0.78;
    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2;
      const a1 = ((i + 0.55) / teeth) * Math.PI * 2;
      ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
      ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-0.2, -0.2, 0.1, 0, 0, 1);
    g.addColorStop(0, '#f4f6fa');
    g.addColorStop(0.6, '#b9c0cc');
    g.addColorStop(1, '#7d8697');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = OL;
    ctx.stroke();
    // 纹理弧
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.arc(0, 0, 0.55, -0.4, 0.9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(60,70,90,.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 0.55, 2.6, 3.9);
    ctx.stroke();
    // 中心
    ctx.beginPath();
    ctx.arc(0, 0, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#e8413c';
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#2c2f38';
    ctx.fill();
    ctx.restore();
  }

  function crossbow(ctx, rot, runT) {
    // rot 表示射击方向；以“朝右”为基准绘制
    const T = TIMING.crossbow;
    let loaded = true, pull = 0.0;
    if (runT != null) {
      const s = runT - T.first;
      if (s >= 0) {
        const ph = s % T.period;
        loaded = ph > 0.5;
        pull = ph > T.period - 0.5 ? (ph - (T.period - 0.5)) / 0.5 : 0;
      } else {
        pull = Math.max(0, 1 + s / 0.5);
      }
    }
    withDir(ctx, (rot + 3) & 3, () => {
      // 机身底座
      roundRect(ctx, 0.08, 0.3, 0.84, 0.62, 0.1);
      ctx.fillStyle = '#6a7285';
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = OL;
      ctx.stroke();
      // 枪托
      roundRect(ctx, 0.0, 0.42, 0.9, 0.18, 0.06);
      ctx.fillStyle = '#8a5a2e';
      ctx.fill();
      ctx.stroke();
      // 弓臂
      ctx.beginPath();
      ctx.moveTo(0.62, 0.04);
      ctx.quadraticCurveTo(0.92 - pull * 0.1, 0.51, 0.62, 0.98);
      ctx.lineWidth = 0.13;
      ctx.strokeStyle = OL;
      ctx.stroke();
      ctx.lineWidth = 0.07;
      ctx.strokeStyle = '#a86a32';
      ctx.stroke();
      // 弦
      const sx = 0.52 - pull * 0.28;
      ctx.beginPath();
      ctx.moveTo(0.62, 0.06);
      ctx.lineTo(loaded ? sx : 0.64, 0.51);
      ctx.lineTo(0.62, 0.96);
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = '#eee4cf';
      ctx.stroke();
      if (loaded) {
        ctx.fillStyle = '#6e4a24';
        ctx.fillRect(sx, 0.47, 0.48, 0.07);
        ctx.beginPath();
        ctx.moveTo(sx + 0.48, 0.43); ctx.lineTo(sx + 0.62, 0.505); ctx.lineTo(sx + 0.48, 0.58);
        ctx.fillStyle = '#c8ced8';
        ctx.fill();
        ctx.lineWidth = 0.03;
        ctx.strokeStyle = OL;
        ctx.stroke();
      }
    });
  }

  function arrow(ctx, len) {
    // 以箭尖为原点，朝 +x
    ctx.fillStyle = '#7a4d22';
    ctx.fillRect(-len, -0.04, len - 0.14, 0.08);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(-0.18, -0.1); ctx.lineTo(-0.18, 0.1);
    ctx.closePath();
    ctx.fillStyle = '#d4d9e2';
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.fillStyle = '#e8413c';
    ctx.beginPath();
    ctx.moveTo(-len, 0); ctx.lineTo(-len + 0.22, -0.12); ctx.lineTo(-len + 0.3, 0); ctx.lineTo(-len + 0.22, 0.12);
    ctx.closePath();
    ctx.fill();
  }

  function flamethrower(ctx, rot, runT) {
    const st = runT != null ? U.Physics.flameState(runT) : 0;
    withDir(ctx, rot, () => {
      // 机身（喷口朝上）
      roundRect(ctx, 0.08, 0.3, 0.84, 0.66, 0.1);
      ctx.fillStyle = '#5c6275';
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = OL;
      ctx.stroke();
      // 危险条纹
      ctx.save();
      roundRect(ctx, 0.08, 0.66, 0.84, 0.3, 0.1);
      ctx.clip();
      for (let i = -2; i < 6; i++) {
        ctx.fillStyle = i % 2 ? '#1f2128' : '#ffc233';
        ctx.beginPath();
        ctx.moveTo(i * 0.2, 1); ctx.lineTo(i * 0.2 + 0.1, 1); ctx.lineTo(i * 0.2 + 0.3, 0.6); ctx.lineTo(i * 0.2 + 0.2, 0.6);
        ctx.fill();
      }
      ctx.restore();
      roundRect(ctx, 0.08, 0.3, 0.84, 0.66, 0.1);
      ctx.stroke();
      // 喷口
      roundRect(ctx, 0.28, 0.02, 0.44, 0.32, 0.06);
      ctx.fillStyle = '#8b93a6';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = st === 1 ? '#ff7a1a' : st === 2 ? '#ffd23f' : '#23252c';
      ctx.fillRect(0.36, 0.02, 0.28, 0.08);
      // 指示灯
      ctx.beginPath();
      ctx.arc(0.5, 0.5, 0.08, 0, Math.PI * 2);
      ctx.fillStyle = st ? '#ff3b2f' : '#4a1f1f';
      ctx.fill();
    });
  }

  function flameJet(ctx, f, t, runT) {
    const st = U.Physics.flameState(runT);
    if (!st || f.len <= 0) return;
    ctx.save();
    const it = f.item;
    ctx.translate(it.gx + 0.5, it.gy + 0.5);
    ctx.rotate((f.dir * Math.PI) / 2 - Math.PI / 2);
    // 现在火焰朝 +x，起点在 0.5
    if (st === 1) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 6 + i * 0.33) % 1;
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = i % 2 ? '#ff9a1a' : '#ffd23f';
        ctx.beginPath();
        ctx.arc(0.55 + k * 0.5, Math.sin(i * 7 + t * 20) * 0.1, 0.1 * (1 - k) + 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const L = f.len;
      const flick = Math.sin(t * 40) * 0.05;
      const layers = [
        ['rgba(255,70,20,.85)', 0.42 + flick],
        ['rgba(255,150,30,.9)', 0.3 + flick],
        ['rgba(255,230,90,.95)', 0.17],
      ];
      for (const [col, w] of layers) {
        ctx.beginPath();
        ctx.moveTo(0.5, -w * 0.5);
        const end = 0.5 + L;
        for (let k = 0; k <= 8; k++) {
          const x = 0.5 + (L * k) / 8;
          const wob = Math.sin(t * 30 + k * 1.7) * 0.06;
          ctx.lineTo(x, -w * (0.5 + k * 0.08) + wob);
        }
        ctx.quadraticCurveTo(end + 0.3, 0, end, w * 1.1);
        for (let k = 8; k >= 0; k--) {
          const x = 0.5 + (L * k) / 8;
          const wob = Math.sin(t * 27 + k * 2.1) * 0.06;
          ctx.lineTo(x, w * (0.5 + k * 0.08) + wob);
        }
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function blackhole(ctx, t) {
    ctx.save();
    ctx.translate(0.5, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1.2);
    g.addColorStop(0, 'rgba(160,60,255,.55)');
    g.addColorStop(0.5, 'rgba(90,30,180,.22)');
    g.addColorStop(1, 'rgba(60,20,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1.2, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(-t * (2 + i * 0.7) + i * 1.6);
      ctx.beginPath();
      ctx.arc(0, 0, 0.26 + i * 0.1, 0, Math.PI * 1.2);
      ctx.lineWidth = 0.07 - i * 0.012;
      ctx.strokeStyle = i % 2 ? '#c47bff' : '#7d3bff';
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#07030d';
    ctx.fill();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#e6c8ff';
    ctx.stroke();
    ctx.restore();
  }

  function bomb(ctx, t) {
    ctx.save();
    ctx.translate(0.5, 0.56);
    ctx.beginPath();
    ctx.arc(0, 0, 0.38, 0, Math.PI * 2);
    ctx.fillStyle = '#23242b';
    ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.13, -0.13, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fill();
    ctx.fillStyle = '#4a4c57';
    ctx.fillRect(0.08, -0.46, 0.16, 0.14);
    ctx.beginPath();
    ctx.moveTo(0.16, -0.46);
    ctx.quadraticCurveTo(0.24, -0.62, 0.36, -0.56);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#b08850';
    ctx.stroke();
    const s = 0.06 + Math.abs(Math.sin(t * 20)) * 0.06;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.arc(0.37, -0.57, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function coin(ctx, t) {
    ctx.save();
    ctx.translate(0.5, 0.5 + Math.sin(t * 3) * 0.05);
    const sx = Math.max(0.12, Math.abs(Math.cos(t * 2.6)));
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 0.36, 0, Math.PI * 2);
    ctx.fillStyle = '#f5b82e';
    ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = '#7a4e08';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.26, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd95a';
    ctx.fill();
    // 星
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.08 : 0.18;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = '#e8961a';
    ctx.fill();
    ctx.restore();
  }

  /**
   * 绘制道具
   * it: {type, rot, gx, gy, ...}；ctx 已在格单位
   * t: 实时秒；runT: 奔跑阶段时间（非奔跑为 null）
   */
  function draw(ctx, it, t, runT, opts = {}) {
    const fp = footprint(it.type, it.rot);
    ctx.save();
    ctx.translate(it.gx, it.gy);
    switch (it.type) {
      case 'block1': case 'block2': case 'block3': case 'blockL': case 'block4': wood(ctx, fp); break;
      case 'ice': ice(ctx, fp, t); break;
      case 'honey': honey(ctx, fp, t); break;
      case 'conveyor': conveyor(ctx, fp, it.rot, runT != null || opts.animate ? t : 0); break;
      case 'spring': spring(ctx, it.rot, t, it); break;
      case 'wire': wire(ctx, t); break;
      case 'spikes': spikes(ctx, it.rot); break;
      case 'saw': saw(ctx, t, runT != null || opts.animate); break;
      case 'crossbow': crossbow(ctx, it.rot, runT); break;
      case 'flame': flamethrower(ctx, it.rot, runT); break;
      case 'blackhole': blackhole(ctx, t); break;
      case 'bomb': bomb(ctx, t); break;
      case 'coin': if (!it.taken) coin(ctx, t); break;
    }
    ctx.restore();
  }

  // 图标：在 (cx,cy) 居中、边长 size（像素）的框里绘制
  function icon(ctx, type, cx, cy, size, t, rot) {
    const r = rot != null ? rot : U.Items.defaultRot(type);
    const fp = footprint(type, r);
    const span = Math.max(fp.w, fp.h, type === 'blackhole' ? 1.6 : 1);
    const s = (size / span) * 0.9;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-fp.w / 2, -fp.h / 2);
    draw(ctx, { type, rot: r, gx: 0, gy: 0 }, t, null, { animate: true });
    ctx.restore();
  }

  U.ItemArt = { draw, icon, arrow, flameJet };
})(window.UCH);
