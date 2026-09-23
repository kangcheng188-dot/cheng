/* 角色绘制：小鸡 / 马 / 绵羊 / 浣熊（原创矢量卡通，粗描边） */
'use strict';
(function (U) {
  const OL = '#231a22';
  const LW = 0.065;

  const CHARS = [
    { id: 'chicken', name: '小鸡', en: 'CHICKEN', body: '#fbf6ea', shade: '#e3d9c6', accent: '#e8413c', particle: ['#ffffff', '#f3ecdf', '#e8413c'] },
    { id: 'horse', name: '马', en: 'HORSE', body: '#b8733a', shade: '#935a2b', accent: '#4a2a17', particle: ['#b8733a', '#4a2a17', '#e3b788'] },
    { id: 'sheep', name: '绵羊', en: 'SHEEP', body: '#f4f1ea', shade: '#d6d0c4', accent: '#3a3440', particle: ['#ffffff', '#ece6da', '#3a3440'] },
    { id: 'raccoon', name: '浣熊', en: 'RACCOON', body: '#8d909c', shade: '#6d707c', accent: '#2a2a33', particle: ['#8d909c', '#2a2a33', '#dadce2'] },
  ];

  function stroke(ctx, w) {
    ctx.lineWidth = w || LW;
    ctx.strokeStyle = OL;
    ctx.stroke();
  }
  function ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(rx, 0.001), Math.max(ry, 0.001), rot, 0, Math.PI * 2);
  }
  function fillStroke(ctx, fill, w) {
    ctx.fillStyle = fill;
    ctx.fill();
    stroke(ctx, w);
  }
  function eye(ctx, x, y, r, look, blink) {
    if (blink) {
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.quadraticCurveTo(x, y + r * 0.6, x + r, y);
      ctx.lineWidth = 0.04;
      ctx.strokeStyle = OL;
      ctx.stroke();
      return;
    }
    ellipse(ctx, x, y, r, r * 1.12);
    fillStroke(ctx, '#ffffff', 0.035);
    ellipse(ctx, x + look * r * 0.35, y + r * 0.08, r * 0.52, r * 0.62);
    ctx.fillStyle = '#16121a';
    ctx.fill();
    ellipse(ctx, x + look * r * 0.35 + r * 0.18, y - r * 0.22, r * 0.17, r * 0.17);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }

  // 腿：从 (hx,hy) 出发，摆角 a，长度 L
  function leg(ctx, hx, hy, a, L, color, w, foot) {
    const kx = hx + Math.sin(a) * L * 0.5, ky = hy + Math.cos(a) * L * 0.5;
    const fx = hx + Math.sin(a * 1.2) * L, fy = hy + Math.cos(a * 1.2) * L;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo(kx + 0.03, ky, fx, fy);
    ctx.lineCap = 'round';
    ctx.lineWidth = w + LW * 1.6;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.stroke();
    if (foot) foot(fx, fy);
  }

  /**
   * 绘制角色（ctx 已处于格单位，原点=脚底中心）
   * a: {state, t, facing, phase, sx, sy, look, blink, tilt, color(玩家色)}
   */
  function draw(ctx, charIdx, a) {
    const c = CHARS[charIdx];
    ctx.save();
    const f = a.facing || 1;
    ctx.rotate(a.tilt || 0);
    ctx.scale((a.sx || 1) * f, a.sy || 1);
    const st = a.state || 'idle';
    const ph = a.phase || 0;
    const t = a.t || 0;
    let bob = 0, legA = 0, legB = 0, armA = 0;
    if (st === 'run') {
      bob = -Math.abs(Math.sin(ph)) * 0.07;
      legA = Math.sin(ph) * 0.9;
      legB = -Math.sin(ph) * 0.9;
      armA = Math.sin(ph) * 0.6;
    } else if (st === 'jump') {
      legA = -0.7; legB = 0.4; armA = -1.2;
    } else if (st === 'fall') {
      legA = 0.3; legB = -0.2; armA = -2.0 + Math.sin(t * 20) * 0.3;
    } else if (st === 'slide') {
      legA = 0.5; legB = -0.3; armA = -2.4;
    } else if (st === 'win') {
      bob = -Math.abs(Math.sin(t * 8)) * 0.15;
      legA = Math.sin(t * 16) * 0.5; legB = -legA; armA = -2.6 + Math.sin(t * 16) * 0.4;
    } else {
      bob = Math.sin(t * 3) * 0.015;
    }
    ctx.translate(0, bob);
    const look = a.look != null ? a.look : 0.6;
    const blink = a.blink;
    const fns = [drawChicken, drawHorse, drawSheep, drawRaccoon];
    fns[charIdx](ctx, c, { legA, legB, armA, look, blink, st, t, ph });
    ctx.restore();
  }

  function drawChicken(ctx, c, p) {
    // 尾羽
    ctx.beginPath();
    ctx.moveTo(-0.28, -0.62);
    ctx.quadraticCurveTo(-0.52, -0.86, -0.46, -0.98);
    ctx.quadraticCurveTo(-0.4, -0.8, -0.34, -0.78);
    ctx.quadraticCurveTo(-0.5, -0.72, -0.52, -0.78);
    ctx.quadraticCurveTo(-0.44, -0.58, -0.26, -0.5);
    ctx.closePath();
    fillStroke(ctx, c.shade);
    // 腿
    const foot = (x, y) => {
      ctx.beginPath();
      ctx.moveTo(x - 0.06, y);
      ctx.lineTo(x + 0.14, y);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.1, y - 0.05);
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = '#e8891c';
      ctx.stroke();
    };
    leg(ctx, -0.1, -0.3, p.legB, 0.3, '#f39a2b', 0.05, foot);
    leg(ctx, 0.08, -0.3, p.legA, 0.3, '#ffae3b', 0.05, foot);
    // 身体
    ellipse(ctx, 0, -0.56, 0.37, 0.34);
    fillStroke(ctx, c.body);
    ctx.save();
    ellipse(ctx, 0, -0.56, 0.37, 0.34);
    ctx.clip();
    ellipse(ctx, -0.05, -0.3, 0.4, 0.14);
    ctx.fillStyle = c.shade;
    ctx.fill();
    ctx.restore();
    ellipse(ctx, 0, -0.56, 0.37, 0.34);
    stroke(ctx);
    // 脖子+头
    ellipse(ctx, 0.14, -0.9, 0.23, 0.25);
    fillStroke(ctx, c.body);
    ctx.beginPath();
    ctx.moveTo(-0.04, -0.78);
    ctx.quadraticCurveTo(0.05, -0.66, 0.26, -0.72);
    ctx.lineWidth = 0.13;
    ctx.strokeStyle = c.body;
    ctx.stroke();
    // 鸡冠
    ctx.beginPath();
    ctx.moveTo(0.0, -1.08);
    ctx.quadraticCurveTo(0.0, -1.24, 0.1, -1.2);
    ctx.quadraticCurveTo(0.14, -1.32, 0.23, -1.22);
    ctx.quadraticCurveTo(0.32, -1.26, 0.32, -1.12);
    ctx.quadraticCurveTo(0.2, -1.06, 0.0, -1.08);
    fillStroke(ctx, c.accent, 0.05);
    // 肉垂
    ellipse(ctx, 0.33, -0.76, 0.05, 0.08);
    fillStroke(ctx, c.accent, 0.04);
    // 喙
    ctx.beginPath();
    ctx.moveTo(0.33, -0.93);
    ctx.lineTo(0.52, -0.87);
    ctx.lineTo(0.33, -0.8);
    ctx.closePath();
    fillStroke(ctx, '#ffb52e', 0.045);
    eye(ctx, 0.2, -0.95, 0.075, p.look, p.blink);
    // 翅膀（贴在身侧的圆润羽翼，空中会扑腾）
    ctx.save();
    ctx.translate(-0.06, -0.6);
    ctx.rotate(-0.25 + p.armA * 0.35);
    ctx.beginPath();
    ctx.moveTo(0.1, -0.1);
    ctx.quadraticCurveTo(-0.22, -0.14, -0.27, 0.06);
    ctx.lineTo(-0.2, 0.05);
    ctx.lineTo(-0.22, 0.13);
    ctx.lineTo(-0.13, 0.1);
    ctx.lineTo(-0.12, 0.17);
    ctx.quadraticCurveTo(0.08, 0.12, 0.1, -0.1);
    ctx.closePath();
    fillStroke(ctx, c.shade, 0.05);
    ctx.restore();
  }

  function drawHorse(ctx, c, p) {
    // 尾巴
    ctx.beginPath();
    ctx.moveTo(-0.28, -0.6);
    ctx.quadraticCurveTo(-0.6, -0.55, -0.52, -0.2);
    ctx.quadraticCurveTo(-0.45, -0.35, -0.38, -0.3);
    ctx.quadraticCurveTo(-0.42, -0.45, -0.26, -0.48);
    ctx.closePath();
    fillStroke(ctx, c.accent);
    const hoof = (x, y) => {
      ctx.beginPath();
      ctx.rect(x - 0.07, y - 0.06, 0.15, 0.08);
      ctx.fillStyle = '#2e1d12';
      ctx.fill();
    };
    leg(ctx, -0.1, -0.32, p.legB, 0.3, c.shade, 0.1, hoof);
    leg(ctx, 0.1, -0.32, p.legA, 0.3, c.body, 0.1, hoof);
    // 身体
    ellipse(ctx, 0, -0.56, 0.32, 0.33);
    fillStroke(ctx, c.body);
    ellipse(ctx, 0.08, -0.5, 0.16, 0.2);
    ctx.fillStyle = '#d99a60';
    ctx.fill();
    // 手臂
    ctx.save();
    ctx.translate(0.02, -0.66);
    ctx.rotate(p.armA * 0.5 + 0.4);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 0.26);
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.09 + LW * 1.6;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.lineWidth = 0.09;
    ctx.strokeStyle = c.shade;
    ctx.stroke();
    ctx.restore();
    // 脖子
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.78);
    ctx.lineTo(0.02, -1.02);
    ctx.lineTo(0.2, -0.98);
    ctx.lineTo(0.18, -0.74);
    ctx.closePath();
    fillStroke(ctx, c.body);
    // 头（长脸）
    ctx.save();
    ctx.translate(0.14, -1.06);
    ctx.rotate(0.35);
    ellipse(ctx, 0.12, 0, 0.3, 0.16);
    fillStroke(ctx, c.body);
    ellipse(ctx, 0.3, 0.03, 0.13, 0.13);
    fillStroke(ctx, '#e8b98a', 0.05);
    ellipse(ctx, 0.36, 0.0, 0.025, 0.03);
    ctx.fillStyle = OL;
    ctx.fill();
    ctx.restore();
    // 耳朵
    ctx.beginPath();
    ctx.moveTo(0.02, -1.14);
    ctx.lineTo(-0.02, -1.36);
    ctx.lineTo(0.12, -1.18);
    ctx.closePath();
    fillStroke(ctx, c.body, 0.05);
    // 鬃毛
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.74);
    ctx.lineTo(-0.2, -0.86);
    ctx.lineTo(-0.1, -0.88);
    ctx.lineTo(-0.16, -1.02);
    ctx.lineTo(-0.04, -1.02);
    ctx.lineTo(-0.06, -1.18);
    ctx.lineTo(0.08, -1.12);
    ctx.lineTo(0.04, -0.95);
    ctx.lineTo(-0.02, -0.78);
    ctx.closePath();
    fillStroke(ctx, c.accent, 0.05);
    eye(ctx, 0.14, -1.1, 0.07, p.look, p.blink);
  }

  function drawSheep(ctx, c, p) {
    const hoof = (x, y) => {
      ellipse(ctx, x + 0.02, y - 0.01, 0.07, 0.04);
      ctx.fillStyle = '#18141c';
      ctx.fill();
    };
    leg(ctx, -0.12, -0.3, p.legB, 0.3, '#2c2731', 0.07, hoof);
    leg(ctx, 0.1, -0.3, p.legA, 0.3, '#3a3440', 0.07, hoof);
    // 羊毛团
    const puffs = [
      [0, -0.6, 0.3], [-0.24, -0.5, 0.2], [0.22, -0.5, 0.2], [-0.2, -0.76, 0.2], [0.18, -0.78, 0.2], [0, -0.86, 0.2], [-0.02, -0.4, 0.2],
    ];
    ctx.beginPath();
    for (const [x, y, r] of puffs) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.lineWidth = LW * 2;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.fillStyle = c.body;
    ctx.fill();
    // 羊毛阴影
    ctx.beginPath();
    ctx.arc(-0.08, -0.42, 0.14, 0, Math.PI * 2);
    ctx.arc(0.12, -0.46, 0.12, 0, Math.PI * 2);
    ctx.fillStyle = c.shade;
    ctx.fill();
    // 头
    ctx.save();
    ctx.translate(0.26, -0.78);
    ctx.rotate(0.15);
    // 耳朵
    ellipse(ctx, -0.12, -0.08, 0.12, 0.05, -0.5);
    fillStroke(ctx, '#2c2731', 0.045);
    ellipse(ctx, 0.04, 0, 0.17, 0.21);
    fillStroke(ctx, c.accent);
    // 头顶羊毛
    ctx.beginPath();
    ctx.arc(-0.03, -0.2, 0.08, 0, Math.PI * 2);
    ctx.arc(0.07, -0.21, 0.08, 0, Math.PI * 2);
    ctx.fillStyle = c.body;
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = OL;
    ctx.stroke();
    eye(ctx, 0.08, -0.04, 0.065, p.look, p.blink);
    ellipse(ctx, 0.12, 0.12, 0.05, 0.025);
    ctx.fillStyle = '#6d6570';
    ctx.fill();
    ctx.restore();
  }

  function drawRaccoon(ctx, c, p) {
    // 环纹尾巴
    ctx.save();
    ctx.translate(-0.24, -0.4);
    ctx.rotate(-0.9 + Math.sin(p.t * 4) * 0.08 + (p.st === 'run' ? Math.sin(p.ph) * 0.15 : 0));
    ellipse(ctx, 0, -0.26, 0.12, 0.3);
    fillStroke(ctx, c.body);
    ctx.save();
    ellipse(ctx, 0, -0.26, 0.12, 0.3);
    ctx.clip();
    ctx.fillStyle = c.accent;
    for (let i = 0; i < 3; i++) ctx.fillRect(-0.2, -0.5 + i * 0.16, 0.4, 0.07);
    ctx.restore();
    ellipse(ctx, 0, -0.26, 0.12, 0.3);
    stroke(ctx);
    ctx.restore();
    const foot = (x, y) => {
      ellipse(ctx, x + 0.03, y - 0.02, 0.08, 0.045);
      ctx.fillStyle = c.accent;
      ctx.fill();
    };
    leg(ctx, -0.1, -0.3, p.legB, 0.3, '#44454f', 0.09, foot);
    leg(ctx, 0.09, -0.3, p.legA, 0.3, '#55565f', 0.09, foot);
    // 身体
    ellipse(ctx, 0, -0.56, 0.31, 0.32);
    fillStroke(ctx, c.body);
    ellipse(ctx, 0.07, -0.5, 0.15, 0.2);
    ctx.fillStyle = '#d8dae0';
    ctx.fill();
    // 手臂
    ctx.save();
    ctx.translate(0.04, -0.66);
    ctx.rotate(p.armA * 0.5 + 0.3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 0.24);
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.08 + LW * 1.6;
    ctx.strokeStyle = OL;
    ctx.stroke();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = '#55565f';
    ctx.stroke();
    ctx.restore();
    // 头
    // 耳朵
    ellipse(ctx, -0.12, -1.13, 0.09, 0.1);
    fillStroke(ctx, c.body, 0.05);
    ellipse(ctx, 0.2, -1.15, 0.09, 0.1);
    fillStroke(ctx, c.body, 0.05);
    ellipse(ctx, 0.2, -1.14, 0.045, 0.05);
    ctx.fillStyle = c.accent;
    ctx.fill();
    ellipse(ctx, 0.06, -0.93, 0.29, 0.25);
    fillStroke(ctx, c.body);
    // 白色脸颊
    ellipse(ctx, 0.2, -0.86, 0.17, 0.12);
    ctx.fillStyle = '#eceef2';
    ctx.fill();
    // 眼罩
    ctx.beginPath();
    ctx.moveTo(-0.14, -0.98);
    ctx.quadraticCurveTo(0.08, -1.08, 0.32, -0.98);
    ctx.quadraticCurveTo(0.34, -0.9, 0.26, -0.88);
    ctx.quadraticCurveTo(0.1, -0.94, -0.1, -0.86);
    ctx.closePath();
    ctx.fillStyle = c.accent;
    ctx.fill();
    // 鼻子
    ellipse(ctx, 0.35, -0.86, 0.05, 0.04);
    ctx.fillStyle = OL;
    ctx.fill();
    eye(ctx, 0.18, -0.96, 0.068, p.look, p.blink);
    ellipse(ctx, 0.06, -0.93, 0.29, 0.25);
    stroke(ctx, 0.05);
  }

  // 头像（用于 HUD / 计分板 / 光标）
  function drawPortrait(ctx, charIdx, x, y, size, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    const s = size / 1.0;
    ctx.scale(s, s);
    ctx.translate(-0.1, 0.95);
    draw(ctx, charIdx, { state: 'idle', t: opts.t || 0, facing: 1, look: 0.4, blink: false });
    ctx.restore();
  }

  U.Chars = { CHARS, draw, drawPortrait };
})(window.UCH);
