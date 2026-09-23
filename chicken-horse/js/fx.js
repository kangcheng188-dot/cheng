/* 粒子特效 */
'use strict';
(function (U) {
  const list = [];
  const MAX = 700;
  let shake = 0;

  function add(p) {
    if (list.length >= MAX) list.shift();
    p.life = p.life || 1;
    p.max = p.life;
    p.rot = p.rot || 0;
    p.vr = p.vr || 0;
    p.grav = p.grav != null ? p.grav : 0;
    p.drag = p.drag != null ? p.drag : 0.98;
    list.push(p);
    return p;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  const FX = {
    list,
    get shake() { return shake; },
    addShake(v) { shake = Math.min(1.2, shake + v); },
    dust(x, y, n = 6, spread = 1, col = '#c9d3e6') {
      for (let i = 0; i < n; i++) {
        add({ type: 'dust', x: x + rnd(-0.3, 0.3), y: y - rnd(0, 0.1), vx: rnd(-2, 2) * spread, vy: rnd(-1.6, -0.3), size: rnd(0.1, 0.22), life: rnd(0.3, 0.55), color: col, grav: -1, drag: 0.9 });
      }
    },
    sparks(x, y, n = 5, col = '#ffe38a', dirx = 0) {
      for (let i = 0; i < n; i++) {
        add({ type: 'spark', x, y, vx: rnd(-3, 3) + dirx * 3, vy: rnd(-4, 1), size: rnd(0.04, 0.08), life: rnd(0.15, 0.35), color: col, grav: 20, drag: 0.94 });
      }
    },
    death(x, y, colors, charIdx) {
      const type = charIdx === 2 ? 'wool' : charIdx === 0 ? 'feather' : 'fur';
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, s = rnd(2, 9);
        add({
          type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3,
          size: type === 'wool' ? rnd(0.12, 0.3) : rnd(0.12, 0.24), life: rnd(0.9, 1.8),
          color: colors[i % colors.length], grav: type === 'feather' ? 4 : 10, drag: type === 'feather' ? 0.9 : 0.93,
          rot: Math.random() * 6, vr: rnd(-8, 8), sway: Math.random() * 6,
        });
      }
      add({ type: 'ring', x, y, size: 0.2, grow: 7, life: 0.35, color: '#ffffff', drag: 1 });
      add({ type: 'flash', x, y, size: 1.6, life: 0.18, color: '#ffffff', drag: 1 });
      shake = Math.min(1.2, shake + 0.25);
    },
    confetti(x, y, n = 40, colors) {
      const cols = colors || ['#ff5a4f', '#3f8cff', '#3cc95b', '#ffc234', '#c47bff', '#ffffff'];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + rnd(-1.1, 1.1), s = rnd(5, 13);
        add({ type: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rnd(0.1, 0.2), life: rnd(1.2, 2.2), color: cols[i % cols.length], grav: 9, drag: 0.93, rot: Math.random() * 6, vr: rnd(-12, 12), sway: Math.random() * 6 });
      }
    },
    explosion(x, y, r) {
      add({ type: 'flash', x, y, size: r * 1.6, life: 0.2, color: '#fff6c8', drag: 1 });
      add({ type: 'ring', x, y, size: 0.4, grow: r * 5, life: 0.4, color: '#ffd23f', drag: 1 });
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, s = rnd(1, 7);
        add({ type: 'smoke', x: x + Math.cos(a) * 0.3, y: y + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, size: rnd(0.4, 0.9), life: rnd(0.6, 1.3), color: i % 3 ? '#3a3a44' : '#ff9a1a', grav: -2, drag: 0.9 });
      }
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2, s = rnd(6, 14);
        add({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: rnd(0.05, 0.1), life: rnd(0.3, 0.6), color: '#ffd23f', grav: 12, drag: 0.94 });
      }
      shake = Math.min(1.2, shake + 0.9);
    },
    debris(x, y, color, n = 10) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = rnd(3, 9);
        add({ type: 'chunk', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, size: rnd(0.12, 0.3), life: rnd(0.6, 1.2), color, grav: 26, drag: 0.97, rot: Math.random() * 6, vr: rnd(-10, 10) });
      }
    },
    pixels(x, y, color, n = 6, up = false) {
      for (let i = 0; i < n; i++) {
        add({ type: 'pixel', x: x + rnd(0, 1), y: y + rnd(0, 1), vx: rnd(-1, 1), vy: up ? rnd(-3, -0.5) : rnd(-1, 1), size: rnd(0.08, 0.18), life: rnd(0.35, 0.8), color, grav: up ? -2 : 0, drag: 0.92 });
      }
    },
    ring(x, y, r, color, life = 0.35) {
      add({ type: 'ring', x, y, size: 0.1, grow: r / life, life, color, drag: 1 });
    },
    text(x, y, str, color = '#fff', size = 0.9) {
      add({ type: 'text', x, y, vx: 0, vy: -1.6, str, size, life: 1.1, color, drag: 0.96 });
    },
    update(dt) {
      shake = Math.max(0, shake - dt * 2.5);
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.vx = (p.vx || 0) * Math.pow(p.drag, dt * 60);
        p.vy = (p.vy || 0) * Math.pow(p.drag, dt * 60) + p.grav * dt;
        if (p.sway != null) p.vx += Math.sin(p.life * 6 + p.sway) * dt * 6;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        if (p.grow) p.size += p.grow * dt;
      }
    },
    draw(ctx) {
      for (const p of list) {
        const k = p.life / p.max;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.6);
        switch (p.type) {
          case 'dust':
          case 'smoke':
            ctx.fillStyle = p.color;
            ctx.globalAlpha = k * (p.type === 'smoke' ? 0.75 : 0.6);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2);
            ctx.fill();
            break;
          case 'spark':
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
            ctx.stroke();
            break;
          case 'feather':
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size, p.size * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(40,30,40,.6)';
            ctx.lineWidth = 0.025;
            ctx.stroke();
            break;
          case 'wool':
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.arc(p.x + p.size * 0.6, p.y + p.size * 0.2, p.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(40,30,40,.5)';
            ctx.lineWidth = 0.03;
            ctx.stroke();
            break;
          case 'fur':
          case 'chunk':
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
            ctx.strokeStyle = 'rgba(30,20,30,.7)';
            ctx.lineWidth = 0.03;
            ctx.strokeRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
            break;
          case 'confetti':
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) + 0.15);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
            break;
          case 'pixel':
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            break;
          case 'ring':
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = k;
            ctx.lineWidth = 0.12 * k + 0.02;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'flash': {
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            g.addColorStop(0, p.color);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalAlpha = k;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            break;
          }
          case 'text':
            break; // 文字在屏幕空间绘制（见 drawText）
        }
        ctx.restore();
      }
    },
    // 屏幕空间文字（避免极小字号）
    drawText(ctx, toScreen, scale) {
      for (const p of list) {
        if (p.type !== 'text') continue;
        const k = p.life / p.max;
        const s = toScreen(p.x, p.y);
        const size = Math.max(12, Math.min(34, p.size * scale));
        const pop = k > 0.85 ? U.util.ease.outBack((1 - k) / 0.15) : 1;
        U.util.drawText(ctx, p.str, s.x, s.y, { size: size * pop, color: p.color, alpha: Math.min(1, k * 2.5) });
      }
    },
    clear() { list.length = 0; shake = 0; },
  };
  U.FX = FX;
})(window.UCH);
