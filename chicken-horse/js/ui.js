/* 画布界面：HUD、派对盒、放置、奔跑触屏控制、计分板、横幅 */
'use strict';
(function (U) {
  const { W, H, PLAYER_COLORS } = U.C;
  const { clamp, lerp, ease, roundRect, drawText, rgba, shade, FONT_UI, FONT_CN } = U.util;
  const { DEFS, footprint, TIMING } = U.Items;
  const G = U.Game;
  const R = U.Render;
  const IN = U.Input;
  const A = U.Audio;

  const UI = { buttons: [], stick: null, joyRest: null };

  const CAT = {
    goal: { label: '终点', color: null },
    first: { label: '首位', color: '#ffd23f' },
    trap: { label: '陷阱', color: '#ff5a4f' },
    solo: { label: '独行', color: '#b57bff' },
    coin: { label: '金币', color: '#ffc63a' },
    comeback: { label: '逆袭', color: '#4fe0e0' },
  };
  UI.CAT = CAT;

  const unit = () => clamp(Math.min(R.vw, R.vh) / 400, 0.72, 1.7);

  // ---------------- 按钮 ----------------
  function button(id, x, y, r, opts) {
    UI.buttons.push(Object.assign({ id, x, y, r }, opts));
  }
  function hitButton(px, py) {
    for (let i = UI.buttons.length - 1; i >= 0; i--) {
      const b = UI.buttons[i];
      if (b.w) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b;
      } else if ((px - b.x) ** 2 + (py - b.y) ** 2 <= (b.r * (b.pad || 1.15)) ** 2) return b;
    }
    return null;
  }
  function drawRoundButton(ctx, b, label, opts = {}) {
    const pressed = b.pressed;
    ctx.save();
    ctx.globalAlpha = opts.alpha != null ? opts.alpha : 0.9;
    ctx.beginPath();
    ctx.arc(b.x, b.y + (pressed ? 2 : 0), b.r, 0, Math.PI * 2);
    ctx.fillStyle = opts.color || 'rgba(255,255,255,.18)';
    ctx.fill();
    if (pressed) {
      ctx.fillStyle = 'rgba(255,255,255,.28)';
      ctx.fill();
    }
    ctx.lineWidth = Math.max(2, b.r * 0.08);
    ctx.strokeStyle = opts.stroke || 'rgba(255,255,255,.75)';
    ctx.stroke();
    ctx.restore();
    drawText(ctx, label, b.x, b.y + (pressed ? 2 : 0), { size: opts.size || b.r * 0.62, color: opts.textColor || '#fff', font: FONT_CN, lw: (opts.size || b.r * 0.62) * 0.2 });
  }

  // ---------------- 指针 ----------------
  UI.init = function () {
    IN.handlers.down = (ptr, e) => {
      A.unlock();
      const b = hitButton(ptr.x, ptr.y);
      if (b) {
        ptr.role = 'btn';
        ptr.btn = b.id;
        b.pressed = true;
        UI.pressedIds.add(b.id);
        if (b.onPress) b.onPress(ptr);
        return;
      }
      const st = G.state;
      const human = G.players && G.players.find((p) => p.human && p.slot === 0);
      if (st === 'box' && human) {
        const i = UI.boxHit(ptr.x, ptr.y);
        if (i >= 0) G.pickItem(human, i);
        ptr.role = 'box';
      } else if (st === 'place' && human && human.item && !human.placed) {
        if (ptr.type === 'mouse') {
          const w = R.toWorld(ptr.x, ptr.y);
          human.cursor.x = w.x; human.cursor.y = w.y;
          if (e.button === 2) G.rotateFor(human);
          else G.tryPlace(human);
          ptr.role = 'mouse';
        } else {
          ptr.role = 'drag';
          ptr.lx = ptr.x; ptr.ly = ptr.y;
          ptr.moved = 0;
        }
      } else if (st === 'run') {
        if (ptr.type !== 'mouse') {
          if (ptr.x < R.vw * 0.5) {
            ptr.role = 'stick';
            UI.stick = { id: ptr.id, ox: ptr.x, oy: ptr.y, x: ptr.x, y: ptr.y };
            updateStick();
          } else {
            ptr.role = 'jumpzone';
            UI.jumpPtrs.add(ptr.id);
            IN.touchCtrl.jump = true;
          }
        }
      } else if (st === 'score') {
        G.confirm();
      }
    };
    IN.handlers.move = (ptr) => {
      const st = G.state;
      const human = G.players && G.players.find((p) => p.human && p.slot === 0);
      if (ptr.role === 'stick' && UI.stick && UI.stick.id === ptr.id) {
        UI.stick.x = ptr.x; UI.stick.y = ptr.y;
        updateStick();
      } else if (ptr.role === 'drag' && human && human.item) {
        const dx = ptr.x - ptr.lx, dy = ptr.y - ptr.ly;
        ptr.lx = ptr.x; ptr.ly = ptr.y;
        ptr.moved += Math.abs(dx) + Math.abs(dy);
        const k = 1.25 / R.cam.s; // 相对拖动，略微放大灵敏度
        human.cursor.x = clamp(human.cursor.x + dx * k, -1, W + 1);
        human.cursor.y = clamp(human.cursor.y + dy * k, -1, H + 1);
      } else if (ptr.type === 'mouse' && (ptr.role === 'hover' || ptr.role === 'mouse' || !ptr.role)) {
        if (st === 'place' && human && human.item && !human.placed) {
          const w = R.toWorld(ptr.x, ptr.y);
          human.cursor.x = w.x; human.cursor.y = w.y;
        } else if (st === 'box' && human && human.pick < 0) {
          const i = UI.boxHit(ptr.x, ptr.y);
          if (i >= 0 && G.box.hover[0] !== i) { G.box.hover[0] = i; A.play('hover'); }
          UI.mouseBox = { x: ptr.x, y: ptr.y, t: G.time };
        }
      }
    };
    IN.handlers.up = (ptr) => {
      if (ptr.role === 'btn') {
        const b = UI.buttons.find((q) => q.id === ptr.btn);
        UI.pressedIds.delete(ptr.btn);
        if (b) { b.pressed = false; if (b.onRelease) b.onRelease(ptr); }
      } else if (ptr.role === 'stick') {
        UI.stick = null;
        IN.touchCtrl.x = 0;
      } else if (ptr.role === 'jumpzone') {
        UI.jumpPtrs.delete(ptr.id);
        if (!UI.jumpPtrs.size && !UI.pressedIds.has('jump')) IN.touchCtrl.jump = false;
      }
    };
    IN.handlers.wheel = (d) => {
      const human = G.players && G.players.find((p) => p.human && p.slot === 0);
      if (G.state === 'place' && human) G.rotateFor(human);
    };
  };
  UI.pressedIds = new Set();
  UI.jumpPtrs = new Set();

  function updateStick() {
    const s = UI.stick;
    const u = unit();
    const max = 52 * u;
    let dx = s.x - s.ox;
    // 跟随手指：超出范围时底座跟着移动
    if (Math.abs(dx) > max) { s.ox = s.x - Math.sign(dx) * max; dx = s.x - s.ox; }
    const dy = s.y - s.oy;
    if (Math.abs(dy) > max * 1.4) s.oy = s.y - Math.sign(dy) * max * 1.4;
    let v = dx / max;
    if (Math.abs(v) < 0.18) v = 0;
    IN.touchCtrl.x = clamp(v * 1.15, -1, 1);
  }

  // ---------------- 派对盒布局 ----------------
  UI.boxCols = function (n) {
    return n <= 4 ? n : Math.ceil(n / 2);
  };
  UI.boxLayout = function (n) {
    const u = unit();
    const cols = UI.boxCols(n);
    const rows = Math.ceil(n / cols);
    const size = Math.min(118 * u, (R.vw * 0.8) / cols - 14 * u, (R.vh * 0.52) / rows - 26 * u);
    const gap = 16 * u;
    const totalW = cols * size + (cols - 1) * gap;
    const totalH = rows * (size + 22 * u) + (rows - 1) * gap;
    const x0 = R.vw / 2 - totalW / 2;
    const y0 = R.vh * 0.44 - totalH / 2;
    const slots = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const rowW = inRow * size + (inRow - 1) * gap;
      const x = R.vw / 2 - rowW / 2 + c * (size + gap);
      slots.push({ x, y: y0 + r * (size + 22 * u + gap), s: size });
    }
    return { slots, size, x0, y0, totalW, totalH };
  };
  UI.boxHit = function (px, py) {
    if (!G.box) return -1;
    const L = UI.boxLayout(G.box.items.length);
    for (let i = 0; i < L.slots.length; i++) {
      const s = L.slots[i];
      if (px >= s.x - 6 && px <= s.x + s.s + 6 && py >= s.y - 6 && py <= s.y + s.s + 6) return i;
    }
    return -1;
  };

  // 玩家栏（屏幕底部）的位置
  function trayPos(i, n) {
    const u = unit();
    const w = Math.min(170 * u, (R.vw - 40) / n);
    return { x: R.vw / 2 + (i - (n - 1) / 2) * w, y: R.vh - 44 * u, w };
  }

  function drawPortraitChip(ctx, p, x, y, r, t, opts = {}) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = opts.bg || '#1d2233';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.strokeStyle = p.color;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
    ctx.clip();
    if (opts.dim) ctx.globalAlpha = 0.45;
    ctx.translate(x, y + r * 0.95);
    const s = r * 1.25;
    ctx.scale(s, s);
    U.Chars.draw(ctx, p.char, { state: 'idle', t: t + p.idx, facing: 1, look: 0.5 });
    ctx.restore();
    ctx.restore();
  }

  // 简单图标
  function iconSkull(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.arc(0, -0.1, 0.5, Math.PI, 0);
    ctx.lineTo(0.5, 0.15);
    ctx.lineTo(0.3, 0.25); ctx.lineTo(0.3, 0.45); ctx.lineTo(-0.3, 0.45); ctx.lineTo(-0.3, 0.25); ctx.lineTo(-0.5, 0.15);
    ctx.closePath();
    ctx.fillStyle = '#f2f2f2';
    ctx.fill();
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = '#1b1830';
    ctx.stroke();
    ctx.fillStyle = '#1b1830';
    ctx.beginPath(); ctx.arc(-0.2, -0.05, 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.2, -0.05, 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-0.03, 0.12, 0.06, 0.1);
    ctx.restore();
  }
  function iconFlag(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#e9edf3';
    ctx.fillRect(-0.4, -0.5, 0.1, 1);
    ctx.beginPath();
    ctx.moveTo(-0.3, -0.5); ctx.lineTo(0.5, -0.3); ctx.lineTo(-0.3, -0.08);
    ctx.closePath();
    ctx.fillStyle = '#ff4136';
    ctx.fill();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = '#1b1830';
    ctx.stroke();
    ctx.restore();
  }
  function iconCoin(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x - s * 0.5, y - s * 0.5);
    ctx.scale(s, s);
    U.ItemArt.draw(ctx, { type: 'coin', rot: 0, gx: 0, gy: 0 }, 0, null);
    ctx.restore();
  }
  function iconCursor(ctx, x, y, s, color) {
    // 手套指针
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0.05, 0.95);
    ctx.lineTo(0.3, 0.72);
    ctx.lineTo(0.5, 1.1);
    ctx.lineTo(0.68, 1.02);
    ctx.lineTo(0.5, 0.64);
    ctx.lineTo(0.84, 0.62);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 0.12;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1830';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.12, 0.22);
    ctx.lineTo(0.14, 0.6);
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 0.08;
    ctx.stroke();
    ctx.restore();
  }
  UI.iconCursor = iconCursor;

  // ---------------- HUD ----------------
  function drawHUD(ctx, t) {
    const u = unit();
    const r = 17 * u;
    const top = 14 * u + r;
    let x = 14 * u + r;
    for (const p of G.players) {
      drawPortraitChip(ctx, p, x, top, r, t, { dim: G.state === 'run' && (!p.alive && !p.finished) });
      if (G.state === 'run') {
        if (p.finished) iconFlag(ctx, x + r * 0.75, top + r * 0.7, r * 0.8);
        else if (!p.alive) iconSkull(ctx, x + r * 0.7, top + r * 0.7, r * 0.75);
        if (p.coin) iconCoin(ctx, x - r * 0.8, top + r * 0.75, r * 0.8);
      }
      drawText(ctx, p.tag, x, top + r + 9 * u, { size: 10 * u, color: p.color, font: FONT_UI, lw: 3 * u });
      x += r * 2 + 10 * u;
    }
    // 回合信息
    drawText(ctx, `主机架 · 第 ${G.round} 回合`, R.vw / 2, 16 * u, { size: 13 * u, color: '#cfe3ff', lw: 3.5 * u });
  }

  function drawTopButtons(ctx) {
    const u = unit();
    const r = 18 * u;
    const pb = { x: R.vw - 16 * u - r, y: 16 * u + r, r, id: 'pause', pad: 1.4, onRelease: () => UI.onPause && UI.onPause() };
    button(pb.id, pb.x, pb.y, pb.r, pb);
    const b = UI.buttons[UI.buttons.length - 1];
    b.pressed = UI.pressedIds.has('pause');
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(pb.x, pb.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,16,30,.55)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(pb.x - r * 0.3, pb.y - r * 0.35, r * 0.2, r * 0.7);
    ctx.fillRect(pb.x + r * 0.1, pb.y - r * 0.35, r * 0.2, r * 0.7);
    ctx.restore();
  }

  // ---------------- 横幅 ----------------
  function drawBanner(ctx) {
    const B = G.banner;
    if (!B) return;
    const u = unit();
    const k = clamp(B.t / 0.35, 0, 1);
    const sc = ease.outBack(k);
    const y = G.state === 'score' ? Math.max(40 * u, (UI.scoreTop || 120) - 52 * Math.min(u, 1.3)) : R.vh * 0.3;
    ctx.save();
    ctx.translate(R.vw / 2, y);
    ctx.scale(sc, sc);
    ctx.rotate(-0.04);
    const bs = G.state === 'score' ? Math.min(u, 1.3) : u;
    drawText(ctx, B.text, 0, 0, { size: 40 * bs, color: B.color || '#fff', lw: 9 * bs });
    if (B.sub) drawText(ctx, B.sub, 0, 30 * bs, { size: 14 * bs, color: '#ffffff', lw: 4 * bs });
    ctx.restore();
  }

  // ---------------- 派对盒 ----------------
  function drawCrate(ctx, x, y, w, h, lidOpen, t) {
    ctx.save();
    // 箱体
    roundRect(ctx, x - w / 2, y - h / 2, w, h, w * 0.06);
    ctx.fillStyle = '#b8743a';
    ctx.fill();
    ctx.lineWidth = Math.max(3, w * 0.025);
    ctx.strokeStyle = '#2b1a0f';
    ctx.stroke();
    // 木板纹
    ctx.save();
    roundRect(ctx, x - w / 2, y - h / 2, w, h, w * 0.06);
    ctx.clip();
    ctx.fillStyle = '#c98b4b';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - w / 2, y - h / 2 + (i * h) / 4 + 3, w, h / 4 - 8);
    ctx.fillStyle = '#8f5627';
    ctx.fillRect(x - w / 2, y - h / 2, w * 0.1, h);
    ctx.fillRect(x + w / 2 - w * 0.1, y - h / 2, w * 0.1, h);
    ctx.restore();
    // 彩带
    ctx.fillStyle = '#ff5a4f';
    ctx.fillRect(x - w * 0.07, y - h / 2, w * 0.14, h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2b1a0f';
    ctx.strokeRect(x - w * 0.07, y - h / 2, w * 0.14, h);
    // 标签
    roundRect(ctx, x - w * 0.3, y - h * 0.14, w * 0.6, h * 0.28, 6);
    ctx.fillStyle = '#fff2cf';
    ctx.fill();
    ctx.stroke();
    drawText(ctx, '派对盒', x, y, { size: h * 0.17, color: '#c0392b', stroke: false, shadow: false });
    ctx.restore();
    // 盖子
    if (lidOpen < 1) {
      ctx.save();
      const lx = x + lidOpen * w * 0.9, ly = y - h / 2 - lidOpen * h * 1.5;
      ctx.translate(lx, ly);
      ctx.rotate(lidOpen * 1.2);
      roundRect(ctx, -w * 0.56, -h * 0.14, w * 1.12, h * 0.2, 8);
      ctx.fillStyle = '#d99a58';
      ctx.fill();
      ctx.lineWidth = Math.max(3, w * 0.025);
      ctx.strokeStyle = '#2b1a0f';
      ctx.stroke();
      ctx.fillStyle = '#ff5a4f';
      ctx.fillRect(-w * 0.07, -h * 0.14, w * 0.14, h * 0.2);
      // 蝴蝶结
      ctx.beginPath();
      ctx.ellipse(-w * 0.1, -h * 0.2, w * 0.1, h * 0.08, -0.4, 0, Math.PI * 2);
      ctx.ellipse(w * 0.1, -h * 0.2, w * 0.1, h * 0.08, 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5a4f';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawBox(ctx, t) {
    const B = G.box;
    const u = unit();
    const n = B.items.length;
    ctx.fillStyle = 'rgba(4,8,18,.5)';
    ctx.fillRect(0, 0, R.vw, R.vh);
    const L = UI.boxLayout(n);
    const cw = Math.min(260 * u, R.vw * 0.4), ch = cw * 0.62;
    const cx = R.vw / 2;
    // 掉落
    const dropK = clamp(B.t / 0.35, 0, 1);
    const cy = lerp(-ch, R.vh * 0.5, ease.outBounce(dropK));
    const shakeX = B.t > 0.35 && B.t < 0.9 ? Math.sin(B.t * 60) * 4 * u : 0;
    const lid = clamp((B.t - 0.9) / 0.4, 0, 1);
    const opened = B.t > 0.9;
    if (!opened || lid < 1 || B.t < 1.3) drawCrate(ctx, cx + shakeX, cy, cw, ch, lid, t);
    if (!opened) {
      drawText(ctx, '派对盒!', R.vw / 2, R.vh * 0.18, { size: 38 * u, color: '#ffd23f', lw: 9 * u, rot: -0.05 });
      return;
    }
    // 面板
    const pk = clamp((B.t - 0.9) / 0.35, 0, 1);
    const pad = 22 * u;
    ctx.save();
    ctx.globalAlpha = pk;
    roundRect(ctx, L.x0 - pad, L.y0 - pad - 30 * u, L.totalW + pad * 2, L.totalH + pad * 2 + 30 * u, 22 * u);
    ctx.fillStyle = 'rgba(22,30,52,.92)';
    ctx.fill();
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
    ctx.restore();
    drawText(ctx, '选一个道具!', R.vw / 2, L.y0 - pad - 6 * u, { size: 22 * u, color: '#ffd23f', lw: 6 * u, alpha: pk });
    // 道具
    for (let i = 0; i < n; i++) {
      const it = B.items[i];
      const s = L.slots[i];
      const k = clamp((B.t - 0.95 - i * 0.05) / 0.35, 0, 1);
      if (k <= 0) continue;
      const e = ease.outBack(k);
      let x = lerp(cx - s.s / 2, s.x, e), y = lerp(cy - s.s / 2, s.y, e);
      let alpha = 1;
      let scale = e;
      if (it.taken >= 0) {
        // 飞向玩家栏
        const q = clamp((B.t - it.takeT) / 0.45, 0, 1);
        const tp = trayPos(it.taken, G.players.length);
        const tx = tp.x - s.s * 0.25, ty = tp.y - s.s * 0.25 - 30 * u;
        x = lerp(s.x, tx, ease.inOut(q));
        y = lerp(s.y, ty, ease.inOut(q)) - Math.sin(q * Math.PI) * 50 * u;
        scale = lerp(1, 0.5, q);
      } else if (B.doneT != null) {
        // 没人要的道具落下消失
        const q = clamp((B.t - B.doneT) / 0.6, 0, 1);
        y += q * q * R.vh * 0.6;
        alpha = 1 - q;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + (s.s * scale) / 2, y + (s.s * scale) / 2);
      ctx.scale(scale, scale);
      ctx.translate(-s.s / 2, -s.s / 2);
      const hovered = G.players.filter((p) => p.pick < 0 && hoverOf(p) === i);
      roundRect(ctx, 0, 0, s.s, s.s, 14 * u);
      ctx.fillStyle = it.taken >= 0 ? rgba(PLAYER_COLORS[it.taken], 0.35) : '#f4ead2';
      ctx.fill();
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = hovered.length ? hovered[0].color : '#2b2233';
      if (hovered.length) ctx.lineWidth = 5 * u;
      ctx.stroke();
      const bob = it.taken < 0 ? Math.sin(t * 3 + i) * 3 * u : 0;
      U.ItemArt.icon(ctx, it.type, s.s / 2, s.s / 2 + bob, s.s * 0.7, t);
      if (it.taken < 0 && B.doneT == null) {
        drawText(ctx, DEFS[it.type].name, s.s / 2, s.s + 12 * u, { size: 13 * u, color: '#fff', lw: 3.5 * u });
      }
      ctx.restore();
    }
    // 光标
    for (const p of G.players) {
      if (p.pick >= 0) continue;
      const pos = cursorForBox(p, L, t);
      if (!pos) continue;
      iconCursor(ctx, pos.x, pos.y, 26 * u, p.color);
      drawText(ctx, p.tag, pos.x + 26 * u, pos.y + 34 * u, { size: 12 * u, color: p.color, font: FONT_UI, lw: 3.5 * u });
    }
    // 玩家栏
    drawTray(ctx, t);
  }

  function hoverOf(p) {
    const B = G.box;
    if (p.human) {
      if (IN.touchMode && p.slot === 0) return -1;
      return B.hover[p.slot];
    }
    return p.botHover != null ? p.botHover : -1;
  }

  function cursorForBox(p, L, t) {
    const B = G.box;
    if (p.human) {
      if (p.slot === 0 && IN.touchMode) return null;
      if (p.slot === 0 && UI.mouseBox && G.time - UI.mouseBox.t < 3 && !IN.anyPadConnected()) return { x: UI.mouseBox.x, y: UI.mouseBox.y };
      const s = L.slots[B.hover[p.slot]];
      if (!s) return null;
      return { x: s.x + s.s * 0.62, y: s.y + s.s * 0.55 };
    }
    // 电脑光标：在空闲道具间游走
    if (!p.botCursor) p.botCursor = { x: R.vw / 2, y: R.vh * 0.8, target: -1, switchT: 0 };
    const c = p.botCursor;
    c.switchT -= 1 / 60;
    if (c.switchT <= 0 || c.target < 0 || B.items[c.target].taken >= 0) {
      const free = B.items.map((it, i) => (it.taken < 0 ? i : -1)).filter((i) => i >= 0);
      c.target = free.length ? free[Math.floor(Math.random() * free.length)] : -1;
      c.switchT = 0.4 + Math.random() * 0.6;
    }
    p.botHover = c.target;
    const s = L.slots[c.target];
    if (s) {
      const tx = s.x + s.s * (0.3 + (p.idx % 2) * 0.4), ty = s.y + s.s * (0.35 + (p.idx > 1 ? 0.3 : 0));
      c.x = lerp(c.x, tx, 0.12);
      c.y = lerp(c.y, ty, 0.12);
    }
    return { x: c.x, y: c.y };
  }

  function drawTray(ctx, t) {
    const u = unit();
    const n = G.players.length;
    for (const p of G.players) {
      const tp = trayPos(p.idx, n);
      drawPortraitChip(ctx, p, tp.x - 22 * u, tp.y, 18 * u, t);
      drawText(ctx, p.tag, tp.x - 22 * u, tp.y + 26 * u, { size: 11 * u, color: p.color, font: FONT_UI, lw: 3 * u });
      if (p.item && (G.state === 'place' || (G.box && p.pick >= 0 && G.box.t - G.box.items[p.pick].takeT > 0.45))) {
        roundRect(ctx, tp.x + 2 * u, tp.y - 20 * u, 40 * u, 40 * u, 8 * u);
        ctx.fillStyle = '#f4ead2';
        ctx.fill();
        ctx.lineWidth = 2.5 * u;
        ctx.strokeStyle = p.color;
        ctx.stroke();
        U.ItemArt.icon(ctx, p.item.type, tp.x + 22 * u, tp.y, 30 * u, t);
      } else if (G.state === 'place' && p.placed) {
        drawText(ctx, '✓', tp.x + 22 * u, tp.y, { size: 24 * u, color: '#3cff9a', lw: 5 * u, font: FONT_UI });
      } else if (G.state === 'box') {
        drawText(ctx, '…', tp.x + 22 * u, tp.y - 4 * u, { size: 20 * u, color: '#ffffff', lw: 4 * u });
      }
    }
  }

  // ---------------- 放置 ----------------
  function drawPlaceWorld(ctx, t) {
    // 放置网格（原作放置阶段会显示格线）
    const anyHuman = G.players.some((p) => p.human && p.item && !p.placed);
    const ga = anyHuman ? 0.1 : 0.05;
    ctx.strokeStyle = `rgba(200,225,255,${ga})`;
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y++) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    // 禁放区：出生点与终点
    for (const z of [G.level.spawnZone, G.level.goalZone]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,90,79,.22)';
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      for (let k = -8; k < 12; k += 0.6) { ctx.moveTo(z.x0 + k, z.y1); ctx.lineTo(z.x0 + k + (z.y1 - z.y0), z.y0); }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,90,79,.35)';
      ctx.setLineDash([0.25, 0.2]);
      ctx.lineWidth = 0.06;
      ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      ctx.setLineDash([]);
    }
    // 世界坐标：虚影
    for (const p of G.players) {
      if (!p.item || p.placed) continue;
      const { gx, gy, fp } = G.itemGrid(p);
      const ok = G.world.canPlace(p.item.type, gx, gy, p.item.rot);
      const it = { type: p.item.type, rot: p.item.rot, gx, gy };
      // 占格底色
      for (const [x, y] of fp.cells) {
        ctx.fillStyle = ok ? 'rgba(255,255,255,.14)' : 'rgba(10,6,14,.5)';
        ctx.fillRect(gx + x, gy + y, 1, 1);
      }
      ctx.save();
      const wob = p.invalidT > 0 ? Math.sin(t * 60) * 0.08 : 0;
      ctx.translate(wob, 0);
      ctx.globalAlpha = 0.9;
      U.ItemArt.draw(ctx, it, t, null, { animate: true });
      ctx.restore();
      // 外框：合法 = 玩家色实线；非法 = 红色虚线 + 暗色蒙层 + ✕
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = ok ? p.color : '#ff3b30';
      if (!ok) ctx.setLineDash([0.18, 0.12]);
      for (const [x, y] of fp.cells) ctx.strokeRect(gx + x + 0.04, gy + y + 0.04, 0.92, 0.92);
      ctx.setLineDash([]);
      if (!ok) {
        ctx.fillStyle = 'rgba(40,0,0,.35)';
        for (const [x, y] of fp.cells) ctx.fillRect(gx + x, gy + y, 1, 1);
        const cx = gx + fp.w / 2, cy = gy + fp.h / 2;
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = 0.16;
        ctx.beginPath();
        ctx.moveTo(cx - 0.35, cy - 0.35); ctx.lineTo(cx + 0.35, cy + 0.35);
        ctx.moveTo(cx + 0.35, cy - 0.35); ctx.lineTo(cx - 0.35, cy + 0.35);
        ctx.stroke();
      }
      // 炸弹范围
      if (p.item.type === 'bomb') {
        ctx.setLineDash([0.25, 0.2]);
        ctx.strokeStyle = 'rgba(255,210,63,.9)';
        ctx.lineWidth = 0.08;
        ctx.beginPath();
        ctx.arc(gx + 0.5, gy + 0.5, TIMING.bomb.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 弩的射线预览
      if (p.item.type === 'crossbow' || p.item.type === 'flame') {
        const [dx, dy] = U.Items.DIRS[p.item.rot];
        const len = p.item.type === 'flame' ? TIMING.flame.len : 8;
        ctx.setLineDash([0.2, 0.25]);
        ctx.strokeStyle = p.item.type === 'flame' ? 'rgba(255,140,40,.8)' : 'rgba(255,255,255,.55)';
        ctx.lineWidth = 0.07;
        ctx.beginPath();
        ctx.moveTo(gx + 0.5 + dx * 0.5, gy + 0.5 + dy * 0.5);
        ctx.lineTo(gx + 0.5 + dx * (0.5 + len), gy + 0.5 + dy * (0.5 + len));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  function drawPlace(ctx, t) {
    const u = unit();
    // 光标
    for (const p of G.players) {
      if (!p.item || p.placed) continue;
      const s = R.toScreen(p.cursor.x, p.cursor.y);
      iconCursor(ctx, s.x + 6 * u, s.y + 6 * u, 24 * u, p.color);
      drawText(ctx, p.tag, s.x + 32 * u, s.y + 38 * u, { size: 12 * u, color: p.color, font: FONT_UI, lw: 3.5 * u });
    }
    drawTray(ctx, t);
    const human = G.players.find((p) => p.human && p.item && !p.placed);
    const Pl = G.place;
    if (human) {
      const left = Math.max(0, U.C.PLACE_TIME_LIMIT - Pl.t);
      if (left < 10) drawText(ctx, String(Math.ceil(left)), R.vw / 2, 58 * u, { size: 32 * u, color: left < 4 ? '#ff5a4f' : '#ffd23f', lw: 8 * u });
      drawText(ctx, '放置你的道具', R.vw / 2, 36 * u, { size: 18 * u, color: '#ffffff', lw: 5 * u });
      if (IN.touchMode) {
        drawText(ctx, '在屏幕任意处拖动来移动道具', R.vw / 2, 60 * u, { size: 12 * u, color: '#cfe3ff', lw: 3.5 * u });
        const r = 32 * u;
        const main = G.players.find((p) => p.human && p.slot === 0);
        if (main && main.item && !main.placed) {
          const ok = G.canPlaceFor(main);
          const by = R.vh - 72 * u - r;
          button('rotate', R.vw - 24 * u - r, by - r * 2.3, r * 0.9, { onPress: () => G.rotateFor(main) });
          drawRoundButton(ctx, UI.buttons[UI.buttons.length - 1], '旋转', { size: 14 * u, color: 'rgba(63,140,255,.55)' });
          button('place', R.vw - 24 * u - r, by, r * 1.1, { onPress: () => G.tryPlace(main) });
          drawRoundButton(ctx, UI.buttons[UI.buttons.length - 1], '放置', { size: 16 * u, color: ok ? 'rgba(60,200,90,.85)' : 'rgba(200,60,60,.6)' });
        }
      } else {
        drawText(ctx, '方向键/鼠标 移动 · R/右键/滚轮 旋转 · 空格/左键 放置', R.vw / 2, R.vh - 96 * u, { size: 12 * u, color: '#cfe3ff', lw: 3.5 * u });
      }
    }
  }

  // ---------------- 奔跑 ----------------
  function drawRun(ctx, t) {
    const u = unit();
    const Rn = G.run;
    if (!Rn.started) {
      const k = clamp(Rn.readyT / 0.3, 0, 1);
      drawText(ctx, '准备…', R.vw / 2, R.vh * 0.32, { size: 46 * u * ease.outBack(k), color: '#ffffff', lw: 10 * u });
    } else if (G.time - Rn.goT < 0.8) {
      const k = clamp((G.time - Rn.goT) / 0.25, 0, 1);
      const a = 1 - clamp((G.time - Rn.goT - 0.5) / 0.3, 0, 1);
      drawText(ctx, '开始!', R.vw / 2, R.vh * 0.32, { size: 58 * u * ease.outBack(k), color: '#3cff9a', lw: 12 * u, alpha: a, rot: -0.06 });
    }
    // 快进
    const activeBots = G.players.some((p) => !p.human && p.alive && !p.finished);
    if (Rn.started && Rn.allHumansDone && activeBots && Rn.endT == null) {
      const r = 24 * u;
      button('fast', R.vw - 16 * u - r * 3.2, 16 * u + 18 * u, r, { pad: 1.3, onPress: () => { Rn.fast = !Rn.fast; } });
      const b = UI.buttons[UI.buttons.length - 1];
      drawRoundButton(ctx, b, Rn.fast ? '×3' : '快进', { size: 13 * u, color: Rn.fast ? 'rgba(60,200,90,.85)' : 'rgba(10,16,30,.6)' });
      if (!IN.touchMode) drawText(ctx, '按 F 快进', R.vw - 16 * u - r * 3.2, 16 * u + 18 * u + r + 12 * u, { size: 11 * u, color: '#cfe3ff', lw: 3 * u });
    }
    // 触屏控制
    const human = G.players.find((p) => p.human && p.slot === 0);
    if (IN.touchMode && human && human.alive && !human.finished) {
      // 摇杆
      const base = 52 * u;
      const s = UI.stick;
      const ox = s ? s.ox : 26 * u + base + 20 * u, oy = s ? s.oy : R.vh - 36 * u - base;
      ctx.save();
      ctx.globalAlpha = s ? 0.75 : 0.35;
      ctx.beginPath();
      ctx.arc(ox, oy, base, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.6)';
      ctx.stroke();
      const kx = s ? clamp(s.x - s.ox, -base, base) : 0;
      ctx.beginPath();
      ctx.arc(ox + kx, oy, 24 * u, 0, Math.PI * 2);
      ctx.fillStyle = human.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      // 冲刺提示
      if (Math.abs(IN.touchCtrl.x) > 0.8) {
        ctx.globalAlpha = 0.9;
        drawText(ctx, '冲!', ox + kx, oy - 40 * u, { size: 14 * u, color: '#ffd23f', lw: 3.5 * u });
      }
      ctx.restore();
      if (!s) drawText(ctx, '← 左半屏拖动 →', ox, oy - base - 14 * u, { size: 11 * u, color: 'rgba(220,235,255,.8)', lw: 3 * u });
      // 跳 & 冲
      const jr = 44 * u;
      button('jump', R.vw - 26 * u - jr, R.vh - 30 * u - jr, jr, {
        pad: 1.35,
        onPress: () => { IN.touchCtrl.jump = true; },
        onRelease: () => { if (!UI.jumpPtrs.size) IN.touchCtrl.jump = false; },
      });
      const jb = UI.buttons[UI.buttons.length - 1];
      jb.pressed = UI.pressedIds.has('jump') || UI.jumpPtrs.size > 0;
      drawRoundButton(ctx, jb, '跳', { size: 24 * u, color: 'rgba(60,140,255,.55)' });
      const sr = 32 * u;
      button('sprint', R.vw - 26 * u - jr * 2 - sr - 18 * u, R.vh - 24 * u - sr, sr, {
        onPress: () => { IN.touchCtrl.sprint = true; },
        onRelease: () => { IN.touchCtrl.sprint = false; },
      });
      const sb = UI.buttons[UI.buttons.length - 1];
      sb.pressed = UI.pressedIds.has('sprint');
      drawRoundButton(ctx, sb, '冲', { size: 18 * u, color: 'rgba(255,190,50,.5)' });
    }
    // 看自己死亡/到终点提示
    if (human && Rn.started && (!human.alive || human.finished) && Rn.endT == null) {
      const msg = human.finished ? '到达终点! 等其他玩家…' : '你挂了… 看看别人吧';
      drawText(ctx, msg, R.vw / 2, R.vh - 30 * u, { size: 15 * u, color: '#ffffff', lw: 4 * u });
    }
  }

  // ---------------- 计分板 ----------------
  function drawScore(ctx, t) {
    const S = G.score;
    const u = Math.min(unit(), 1.3);
    const n = G.players.length;
    const k = clamp(S.t / 0.4, 0, 1);
    ctx.fillStyle = `rgba(4,8,18,${0.55 * k})`;
    ctx.fillRect(0, 0, R.vw, R.vh);
    const u2 = u;
    const pw = Math.min(R.vw - 30 * u2, 640 * u2);
    const rowH = Math.min(48 * u2, (R.vh * 0.6) / n);
    const ph = rowH * n + 70 * u2;
    const px = R.vw / 2 - pw / 2;
    const py = Math.max(G.banner ? 96 * u2 : 50 * u2, R.vh / 2 - ph / 2 + (G.banner ? 26 * u2 : 0));
    UI.scoreTop = py;
    const slide = (1 - ease.outCubic(k)) * R.vh;
    ctx.save();
    ctx.translate(0, slide);
    roundRect(ctx, px, py, pw, ph, 20 * u);
    ctx.fillStyle = 'rgba(20,26,46,.94)';
    ctx.fill();
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
    drawText(ctx, `第 ${G.round} 回合 · 计分`, R.vw / 2, py + 22 * u, { size: 18 * u, color: '#ffd23f', lw: 5 * u });
    const barX = px + 110 * u2;
    const barW = pw - 110 * u2 - 48 * u2;
    const win = G.settings.win;
    const scale = barW / win;
    // 终点线
    const fx = barX + barW;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.setLineDash([6 * u, 5 * u]);
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(fx, py + 42 * u);
    ctx.lineTo(fx, py + ph - 14 * u);
    ctx.stroke();
    ctx.setLineDash([]);
    iconFlag(ctx, fx + 10 * u, py + 44 * u, 18 * u);
    // 已展示的段
    const shownSegs = S.order.slice(0, S.shown);
    G.players.forEach((p, i) => {
      const y = py + 50 * u + i * rowH;
      const cyy = y + rowH / 2;
      drawPortraitChip(ctx, p, px + 32 * u, cyy, Math.min(20 * u, rowH * 0.36), t);
      drawText(ctx, p.tag, px + 68 * u, cyy - 8 * u, { size: 13 * u, color: p.color, font: FONT_UI, lw: 3.5 * u });
      drawText(ctx, p.name, px + 68 * u, cyy + 10 * u, { size: 11 * u, color: '#dfe8ff', lw: 3 * u });
      // 条
      const bh = Math.min(26 * u, rowH * 0.5);
      roundRect(ctx, barX, cyy - bh / 2, barW, bh, bh / 2);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fill();
      let x = barX;
      // 旧分数（按类别累计）
      const before = S.before[i];
      if (before > 0) {
        const w = Math.min(barW, before * scale);
        roundRect(ctx, x, cyy - bh / 2, w, bh, Math.min(bh / 2, w / 2));
        ctx.fillStyle = shade(p.color, -0.25);
        ctx.fill();
        ctx.lineWidth = 2 * u;
        ctx.strokeStyle = '#11131c';
        ctx.stroke();
        x += w;
      }
      const mine = shownSegs.filter((q) => q.pid === i);
      mine.forEach((q, qi) => {
        const idxAll = S.order.indexOf(q);
        const appearT = 1.0 + idxAll * 0.42;
        const g = clamp((S.t - appearT) / 0.3, 0, 1);
        const w = Math.max(0, Math.min(barX + barW - x + 30 * u, q.v * scale * ease.outCubic(g)));
        const col = CAT[q.cat].color || p.color;
        ctx.fillStyle = col;
        ctx.fillRect(x, cyy - bh / 2, w, bh);
        ctx.strokeStyle = '#11131c';
        ctx.lineWidth = 2 * u;
        ctx.strokeRect(x, cyy - bh / 2, w, bh);
        // 标签
        const la = 1 - clamp((S.t - appearT - 1.4) / 0.5, 0, 1);
        if (la > 0) drawText(ctx, CAT[q.cat].label, x + w / 2, cyy - bh / 2 - 9 * u - (1 - g) * 10 * u, { size: 11 * u, color: col, lw: 3 * u, alpha: la });
        x += w;
      });
      // 当前总分（小字）
      const total = S.applied ? p.pts : S.before[i] + mine.reduce((a, q) => a + q.v, 0);
      drawText(ctx, total.toFixed(1), fx + 20 * u2, cyy, { size: 11 * u2, color: '#dfe8ff', font: FONT_UI, lw: 3 * u2 });
      // 冠军标记
      if (S.applied && p.pts >= win - 1e-9) drawText(ctx, '★', fx + 20 * u2, cyy - 16 * u2, { size: 16 * u2, color: '#ffd23f', lw: 4 * u2 });
    });
    if (S.doneT != null && S.t - S.doneT > 1.0) {
      const a = 0.6 + 0.4 * Math.sin(t * 5);
      drawText(ctx, IN.touchMode ? '点击继续' : '按 空格 / 点击 继续', R.vw / 2, py + ph + 22 * u, { size: 14 * u, color: '#ffffff', lw: 4 * u, alpha: a });
    }
    ctx.restore();
    // 图例
    if (S.shown === 0 && S.t > 0.6 && !S.order.length && !S.verdict) {
      drawText(ctx, '本回合没人得分', R.vw / 2, py - 20 * u, { size: 16 * u, color: '#ffffff', lw: 4 * u });
    }
  }

  // ---------------- 开局：地图标题卡 ----------------
  function drawIntro(ctx, t) {
    const u = unit();
    const k = G.stateT;
    const inK = clamp(k / 0.45, 0, 1), outK = clamp((k - 1.7) / 0.35, 0, 1);
    const slide = (1 - ease.outBack(inK)) * -R.vw + ease.inCubic(outK) * R.vw;
    ctx.save();
    ctx.translate(slide, 0);
    const bh = 110 * u;
    const y = R.vh * 0.42;
    ctx.fillStyle = 'rgba(8,40,30,.92)';
    ctx.fillRect(0, y - bh / 2, R.vw, bh);
    ctx.fillStyle = '#c9a54a';
    ctx.fillRect(0, y - bh / 2, R.vw, 4 * u);
    ctx.fillRect(0, y + bh / 2 - 4 * u, R.vw, 4 * u);
    // 走线装饰
    ctx.strokeStyle = 'rgba(201,165,74,.35)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const x = (i * R.vw) / 8 + 20 * u;
      ctx.moveTo(x, y - bh / 2 + 10 * u); ctx.lineTo(x + 30 * u, y - bh / 2 + 10 * u); ctx.lineTo(x + 50 * u, y - bh / 2 + 30 * u);
    }
    ctx.stroke();
    drawText(ctx, '主机架', R.vw / 2, y - 8 * u, { size: 50 * u, color: '#3cff9a', lw: 11 * u, rot: -0.03 });
    drawText(ctx, 'MAINFRAME', R.vw / 2, y + 34 * u, { size: 16 * u, color: '#d8f5e6', font: FONT_UI, lw: 4 * u });
    ctx.restore();
  }

  // ---------------- 电路切换提示 ----------------
  function drawShift(ctx, t) {
    const u = unit();
    const tr = G.transition;
    const a = clamp(tr.t / 0.3, 0, 1) * (1 - clamp((tr.t - tr.dur + 0.4) / 0.4, 0, 1));
    drawText(ctx, '电路重组!', R.vw / 2, R.vh * 0.14, { size: 30 * u, color: '#3cff9a', lw: 8 * u, alpha: a });
    const sub = G.round === 2 ? '上回合你们跑过的电路格，这回合变成了实体方块' : '旧电路消失，新路径变成实体';
    drawText(ctx, sub, R.vw / 2, R.vh * 0.14 + 30 * u, { size: 13 * u, color: '#ffffff', lw: 3.5 * u, alpha: a });
  }

  // ---------------- 胜利 ----------------
  function drawWin(ctx, t) {
    const u = unit();
    const p = G.winner;
    if (!p) return;
    const k = clamp(G.win.t / 0.6, 0, 1);
    ctx.fillStyle = `rgba(4,8,18,${0.62 * k})`;
    ctx.fillRect(0, 0, R.vw, R.vh);
    // 聚光
    const g = ctx.createRadialGradient(R.vw / 2, R.vh * 0.58, 10, R.vw / 2, R.vh * 0.58, R.vh * 0.5);
    g.addColorStop(0, rgba(p.color, 0.45 * k));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, R.vw, R.vh);
    const s = Math.min(R.vh * 0.22, 118 * u);
    ctx.save();
    ctx.translate(R.vw / 2, R.vh * 0.7);
    ctx.scale(s * ease.outBack(k), s * ease.outBack(k));
    U.Chars.draw(ctx, p.char, { state: 'win', t: G.win.t, facing: 1, look: 0.3 });
    ctx.restore();
    drawText(ctx, `${p.tag === '你' ? '你' : p.tag + ' ' + p.name} 赢了!`, R.vw / 2, R.vh * 0.16, { size: 42 * u * ease.outBack(k), color: p.color, lw: 10 * u, rot: -0.04 });
    drawText(ctx, `${p.pts.toFixed(1)} 分`, R.vw / 2, R.vh * 0.16 + 40 * u, { size: 18 * u, color: '#ffd23f', lw: 5 * u });
    if (Math.random() < 0.25) {
      const w = R.toWorld(R.vw * (0.2 + Math.random() * 0.6), R.vh * 0.05);
      U.FX.confetti(w.x, w.y, 4);
    }
  }

  // ---------------- 总入口 ----------------
  UI.draw = function (t) {
    const ctx = R.ctx;
    UI.buttons = [];
    // 世界坐标部分（放置虚影）
    if (G.state === 'place') {
      R.worldTransform(ctx);
      drawPlaceWorld(ctx, t);
    }
    R.screenTransform(ctx);
    U.FX.drawText(ctx, R.toScreen, R.cam.s);
    if (G.state === 'run') R.drawPlayerTags(G);
    R.screenTransform(ctx);
    const inGame = ['shift', 'box', 'place', 'run', 'score'].includes(G.state);
    if (G.state === 'intro') drawIntro(ctx, t);
    if (G.state === 'shift') drawShift(ctx, t);
    if (G.state === 'box') drawBox(ctx, t);
    if (G.state === 'place') drawPlace(ctx, t);
    if (G.state === 'run') drawRun(ctx, t);
    if (G.state === 'score') drawScore(ctx, t);
    if (inGame) {
      if (G.state !== 'box' && G.state !== 'score') drawHUD(ctx, t);
      drawTopButtons(ctx);
    }
    if (G.state === 'win') drawWin(ctx, t);
    drawBanner(ctx);
    // 按钮按下状态同步
    for (const b of UI.buttons) if (UI.pressedIds.has(b.id)) b.pressed = true;
  };

  U.UI = UI;
})(window.UCH);
