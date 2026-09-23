/* 角色物理（确定性，固定 60Hz）——游戏与电脑规划器共用 */
'use strict';
(function (U) {
  const M = U.M;
  const { approach, sign } = U.util;

  const P = {
    w: 0.7,
    h: 0.92,
    walk: 6.0,
    run: 9.0,
    accG: 70,
    decG: 60,
    accA: 40,
    decA: 8,
    grav: 46,
    fallMul: 1.2,
    maxFall: 21,
    jumpV: 17.2,
    cut: 0.45,
    coyote: 0.1,
    buffer: 0.12,
    slideMax: 3.4,
    wjX: 8.0,
    wjY: 15.0,
    wjLock: 0.14,
    wallGrace: 0.08,
    convV: 4.5,
    springV: 23,
    iceMul: 0.12,
    honeySpeed: 0.45,
    honeyJump: 0.75,
  };

  // 事件位
  const EV = {
    JUMP: 1,
    WALLJUMP: 2,
    LAND: 4,
    BOUNCE: 8,
    DIE: 16,
    GOAL: 32,
    SLIDE: 64,
    HONEY: 128,
  };

  const BOUND = 99; // 地图边界：实心但不能贴墙

  function newBody(x, y) {
    return {
      x, y, vx: 0, vy: 0,
      onGround: true, groundMat: M.METAL, groundDir: 0,
      wall: 0, wallMat: 0, wallT: 0, wallMem: 0,
      ceilHoney: false, honeyIgnore: 0,
      coyote: 0, jumpBuf: 0, prevJump: false, cutArmed: false, lockT: 0,
      facing: 1, dead: 0, killer: -1, won: false,
      ev: 0, bounceCell: -1, impact: 0, sliding: false, t: 0,
    };
  }

  function cloneBody(b) {
    return Object.assign({}, b);
  }

  function solidAt(world, ix, iy) {
    if (ix < 0 || ix >= world.W) return BOUND;
    if (iy < world.ceilingY) return BOUND;
    if (iy < 0 || iy >= world.H) return 0;
    return world.solid[iy * world.W + ix];
  }

  const EPS = 1e-4;

  // 死因
  const CAUSE = { FALL: 1, SPIKE: 2, WIRE: 3, SAW: 4, ARROW: 5, FLAME: 6, HOLE: 7 };

  function kill(b, cause, owner) {
    if (b.dead || b.won) return;
    b.dead = cause;
    b.killer = owner;
    b.ev |= EV.DIE;
  }

  /**
   * 单步推进
   * input: {x:-1..1, jump:bool, sprint:bool}
   * t: 本回合开始后的秒数（陷阱时序）
   * margin: 规划器使用的陷阱安全边距
   */
  function step(b, input, world, t, margin) {
    const dt = U.C.DT;
    b.ev = 0;
    b.bounceCell = -1;
    if (b.dead || b.won) return b;
    margin = margin || 0;

    const inX = input.x;
    const inJump = !!input.jump;
    const sprint = !!input.sprint;
    const jumpPressed = inJump && !b.prevJump;
    b.prevJump = inJump;
    if (jumpPressed) b.jumpBuf = P.buffer;
    else if (b.jumpBuf > 0) b.jumpBuf = Math.max(0, b.jumpBuf - dt);
    if (b.lockT > 0) b.lockT = Math.max(0, b.lockT - dt);
    if (b.honeyIgnore > 0) b.honeyIgnore = Math.max(0, b.honeyIgnore - dt);

    const ground = b.onGround;
    const gm = b.groundMat;

    // ---- 水平 ----
    let maxSp = sprint ? P.run : P.walk;
    if (ground && gm === M.HONEY) maxSp *= P.honeySpeed;
    if (b.ceilHoney) maxSp *= P.honeySpeed;
    const target = inX * maxSp;
    const pv = ground && gm === M.CONVEYOR ? b.groundDir * P.convV : 0;
    let rel = b.vx - pv;
    let acc;
    if (ground) {
      acc = inX !== 0 ? P.accG : P.decG;
      if (gm === M.ICE) acc *= P.iceMul;
      // 反向时更快刹车
      if (inX !== 0 && sign(inX) !== sign(rel) && gm !== M.ICE) acc *= 1.4;
    } else {
      acc = inX !== 0 ? P.accA : P.decA;
      if (b.lockT > 0) acc *= 0.2;
      if (inX !== 0 && sign(inX) === sign(rel) && Math.abs(rel) > Math.abs(target)) acc = P.decA;
    }
    rel = approach(rel, target, acc * dt);
    b.vx = rel + pv;
    if (inX > 0.1) b.facing = 1;
    else if (inX < -0.1) b.facing = -1;

    // ---- 黑洞吸引 ----
    const holes = world.holes;
    if (holes.length) {
      const cx = b.x, cy = b.y - P.h * 0.5;
      for (let i = 0; i < holes.length; i++) {
        const hlp = holes[i];
        const dx = hlp.x - cx, dy = hlp.y - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < hlp.R && d > 0.001) {
          const k = 1 - d / hlp.R;
          const a = hlp.pull * Math.pow(k, 1.5);
          b.vx += (dx / d) * a * dt;
          b.vy += (dy / d) * a * dt;
        }
      }
    }

    // ---- 竖直 ----
    let sliding = false;
    if (b.ceilHoney && b.honeyIgnore <= 0) {
      // 倒挂在蜂蜜下方
      if (jumpPressed) {
        b.ceilHoney = false;
        b.honeyIgnore = 0.25;
        b.vy = 3;
        b.jumpBuf = 0;
      } else {
        b.vy = 0;
      }
    } else {
      const g = P.grav * (b.vy > 0 ? P.fallMul : 1);
      b.vy += g * dt;
      if (b.cutArmed && !inJump && b.vy < 0) {
        b.vy *= P.cut;
        b.cutArmed = false;
      }
      if (b.vy >= 0) b.cutArmed = false;
      if (b.vy > P.maxFall) b.vy = P.maxFall;
    }

    // 贴墙
    if (!ground && b.wall !== 0) {
      if (b.wallMat === M.HONEY) {
        if (b.vy > 0) b.vy = 0;
        sliding = true;
      } else if (b.wallMat !== M.ICE && b.wallMat !== BOUND && sign(inX) === b.wall && b.vy > P.slideMax) {
        b.vy = P.slideMax;
        sliding = true;
      } else if (b.wallMat !== M.ICE && b.wallMat !== BOUND && sign(inX) === b.wall && b.vy > 0) {
        sliding = true;
      }
    }
    b.sliding = sliding;

    // 起跳
    if (b.jumpBuf > 0) {
      if (ground || b.coyote > 0) {
        const jv = P.jumpV * (ground && gm === M.HONEY ? P.honeyJump : 1);
        b.vy = -jv;
        b.jumpBuf = 0;
        b.coyote = 0;
        b.onGround = false;
        b.cutArmed = true;
        b.ev |= EV.JUMP;
      } else if (b.wallT > 0 && b.wallMem !== 0) {
        b.vx = -b.wallMem * P.wjX;
        b.vy = -P.wjY;
        b.lockT = P.wjLock;
        b.jumpBuf = 0;
        b.wallT = 0;
        b.cutArmed = true;
        b.facing = -b.wallMem;
        b.ev |= EV.WALLJUMP;
      }
    }

    // ---- 移动 + 碰撞（分轴）----
    const hw = P.w * 0.5;
    const H = P.h;
    // X
    let nx = b.x + b.vx * dt;
    if (b.vx > 0) {
      const right = nx + hw;
      const cx = Math.floor(right - EPS);
      const y0 = Math.floor(b.y - H + EPS), y1 = Math.floor(b.y - EPS);
      for (let iy = y0; iy <= y1; iy++) {
        if (solidAt(world, cx, iy)) {
          nx = cx - hw;
          b.vx = 0;
          break;
        }
      }
    } else if (b.vx < 0) {
      const left = nx - hw;
      const cx = Math.floor(left + EPS);
      const y0 = Math.floor(b.y - H + EPS), y1 = Math.floor(b.y - EPS);
      for (let iy = y0; iy <= y1; iy++) {
        if (solidAt(world, cx, iy)) {
          nx = cx + 1 + hw;
          b.vx = 0;
          break;
        }
      }
    }
    b.x = nx;

    // Y
    let ny = b.y + b.vy * dt;
    const x0 = Math.floor(b.x - hw + EPS), x1 = Math.floor(b.x + hw - EPS);
    const wasGround = ground;
    const impactV = b.vy;
    if (b.vy > 0) {
      const cy = Math.floor(ny - EPS);
      for (let ix = x0; ix <= x1; ix++) {
        if (solidAt(world, ix, cy)) {
          ny = cy;
          b.vy = 0;
          break;
        }
      }
    } else if (b.vy < 0) {
      const cy = Math.floor(ny - H + EPS);
      for (let ix = x0; ix <= x1; ix++) {
        if (solidAt(world, ix, cy)) {
          ny = cy + 1 + H;
          b.vy = 0;
          break;
        }
      }
    }
    b.y = ny;

    // ---- 接触探测 ----
    // 脚下
    const fy = Math.floor(b.y + 0.02);
    let gMat = 0, gCell = -1, gCenterMat = 0, gCenterCell = -1;
    const cxCell = Math.floor(b.x);
    for (let ix = x0; ix <= x1; ix++) {
      const m = solidAt(world, ix, fy);
      if (m) {
        if (!gMat || m === M.SPRING || m === M.SPIKE) { gMat = m; gCell = fy * world.W + ix; }
        if (ix === cxCell) { gCenterMat = m; gCenterCell = fy * world.W + ix; }
      }
    }
    if (gCenterMat && gMat !== M.SPRING && gMat !== M.SPIKE) { gMat = gCenterMat; gCell = gCenterCell; }
    const onGround = gMat !== 0 && b.vy >= 0 && Math.abs(b.y - fy) < 0.03;
    b.onGround = onGround;
    if (onGround) {
      b.groundMat = gMat;
      b.groundDir = gCell >= 0 && gMat !== BOUND ? world.cellDir[gCell] : 0;
      b.coyote = P.coyote;
      b.cutArmed = false;
      if (!wasGround) {
        b.ev |= EV.LAND;
        b.impact = impactV;
      }
    } else {
      b.groundMat = 0;
      if (b.coyote > 0) b.coyote = Math.max(0, b.coyote - dt);
    }

    // 头顶
    const hy = Math.floor(b.y - H - 0.02);
    let ceilMat = 0, ceilCell = -1;
    for (let ix = x0; ix <= x1; ix++) {
      const m = solidAt(world, ix, hy);
      if (m) { if (!ceilMat || m === M.SPIKE || m === M.SPRING || m === M.HONEY) { ceilMat = m; ceilCell = hy * world.W + ix; } }
    }
    const touchingCeil = ceilMat !== 0 && Math.abs(b.y - H - (hy + 1)) < 0.03;
    b.ceilHoney = touchingCeil && ceilMat === M.HONEY && b.honeyIgnore <= 0 && b.vy <= 0.01;

    // 左右
    const wy0 = Math.floor(b.y - H + 0.08), wy1 = Math.floor(b.y - 0.08);
    let wall = 0, wallMat = 0, wallCell = -1;
    const rx = Math.floor(b.x + hw + 0.02), lx = Math.floor(b.x - hw - 0.02);
    const touchR = Math.abs(b.x + hw - rx) < 0.03, touchL = Math.abs(b.x - hw - (lx + 1)) < 0.03;
    for (let iy = wy0; iy <= wy1; iy++) {
      if (touchR) {
        const m = solidAt(world, rx, iy);
        if (m && (!wallMat || m === M.SPIKE || m === M.SPRING || m === M.HONEY)) { wall = 1; wallMat = m; wallCell = m === BOUND ? -1 : iy * world.W + rx; }
      }
      if (touchL) {
        const m = solidAt(world, lx, iy);
        if (m && (!wallMat || m === M.SPIKE || m === M.SPRING || m === M.HONEY)) { wall = -1; wallMat = m; wallCell = m === BOUND ? -1 : iy * world.W + lx; }
      }
    }
    b.wall = onGround ? 0 : wall;
    b.wallMat = wallMat;
    if (!onGround && wall !== 0 && wallMat !== M.ICE && wallMat !== BOUND) {
      b.wallT = P.wallGrace;
      b.wallMem = wall;
    } else if (b.wallT > 0) {
      b.wallT = Math.max(0, b.wallT - dt);
    }
    if (onGround) b.wallT = 0;

    // ---- 尖刺 / 弹簧 ----
    // 地面（格子的上表面 dir=0）
    if (onGround && gCell >= 0) {
      const m = world.solid[gCell];
      const d = world.cellDir[gCell];
      if (m === M.SPIKE && d === 0) kill(b, CAUSE.SPIKE, world.cellOwner[gCell]);
      else if (m === M.SPRING && d === 0) {
        b.vy = -P.springV;
        b.onGround = false;
        b.coyote = 0;
        b.cutArmed = false;
        b.ev |= EV.BOUNCE;
        b.bounceCell = gCell;
      }
    }
    // 其他格子的尖刺面：检查所有接触格
    if (!b.dead) {
      if (touchingCeil && ceilCell >= 0) {
        const m = world.solid[ceilCell], d = world.cellDir[ceilCell];
        if (m === M.SPIKE && d === 2) kill(b, CAUSE.SPIKE, world.cellOwner[ceilCell]);
        else if (m === M.SPRING && d === 2) {
          b.vy = P.springV * 0.6;
          b.ev |= EV.BOUNCE;
          b.bounceCell = ceilCell;
        }
      }
      if (wall !== 0 && wallCell >= 0) {
        const m = world.solid[wallCell], d = world.cellDir[wallCell];
        const face = wall === 1 ? 3 : 1; // 右侧墙格朝左的面
        if (m === M.SPIKE && d === face) kill(b, CAUSE.SPIKE, world.cellOwner[wallCell]);
        else if (m === M.SPRING && d === face) {
          b.vx = -wall * P.springV * 0.75;
          b.vy = Math.min(b.vy, -10);
          b.lockT = 0.25;
          b.cutArmed = false;
          b.ev |= EV.BOUNCE;
          b.bounceCell = wallCell;
          b.wall = 0;
          b.wallT = 0;
        }
      }
    }

    // ---- 陷阱重叠 ----
    if (!b.dead) hazardCheck(b, world, t, margin);

    // ---- 终点 / 掉落 ----
    if (!b.dead) {
      const g = world.goal;
      if (b.x + hw > g.x0 && b.x - hw < g.x1 && b.y > g.y0 && b.y - H < g.y1) {
        b.won = true;
        b.ev |= EV.GOAL;
      } else if (b.y - H > world.killY) {
        kill(b, CAUSE.FALL, -1);
      }
    }
    b.t = t;
    return b;
  }

  function hazardCheck(b, world, t, margin) {
    const hw = P.w * 0.5 - 0.06 + margin;
    const x0 = b.x - hw, x1 = b.x + hw;
    const y0 = b.y - P.h + 0.06 - margin, y1 = b.y - 0.02 + margin;
    // 铁丝网（格子）
    const gx0 = Math.max(0, Math.floor(x0)), gx1 = Math.min(world.W - 1, Math.floor(x1));
    const gy0 = Math.max(0, Math.floor(y0)), gy1 = Math.min(world.H - 1, Math.floor(y1));
    for (let iy = gy0; iy <= gy1; iy++) {
      for (let ix = gx0; ix <= gx1; ix++) {
        const hz = world.wireGrid[iy * world.W + ix];
        if (hz >= 0) {
          if (x1 > ix + 0.1 && x0 < ix + 0.9 && y1 > iy + 0.1 && y0 < iy + 0.9) {
            kill(b, CAUSE.WIRE, hz);
            return;
          }
        }
      }
    }
    const circ = (cx, cy, r) => {
      const nx = cx < x0 ? x0 : cx > x1 ? x1 : cx;
      const ny = cy < y0 ? y0 : cy > y1 ? y1 : cy;
      const dx = cx - nx, dy = cy - ny;
      return dx * dx + dy * dy < r * r;
    };
    const saws = world.saws;
    for (let i = 0; i < saws.length; i++) {
      const s = saws[i];
      if (circ(s.x, s.y, s.r)) { kill(b, CAUSE.SAW, s.owner); return; }
    }
    const holes = world.holes;
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      if (circ(h.x, h.y, h.kill)) { kill(b, CAUSE.HOLE, h.owner); return; }
    }
    const flames = world.flames;
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      if (flameActive(f, t, margin > 0 ? 0.25 : 0)) {
        if (x1 > f.rx0 && x0 < f.rx1 && y1 > f.ry0 && y0 < f.ry1) { kill(b, CAUSE.FLAME, f.owner); return; }
      }
    }
    const bows = world.bows;
    for (let i = 0; i < bows.length; i++) {
      const w = bows[i];
      const T = U.Items.TIMING.crossbow;
      const tStart = t - T.first;
      if (tStart < 0) continue;
      const kMax = Math.floor(tStart / T.period);
      const travel = (w.range + T.len) / T.speed;
      const kMin = Math.max(0, Math.floor((tStart - travel) / T.period));
      for (let k = kMin; k <= kMax; k++) {
        const age = tStart - k * T.period;
        const tip = age * T.speed;
        if (tip < 0) continue;
        if (tip > w.range) continue; // 已经钉在墙上，无害
        const tail = Math.max(0, tip - T.len);
        // 箭的矩形
        let ax0, ax1, ay0, ay1;
        const th = 0.12 + margin * 0.5;
        if (w.dx !== 0) {
          const a = w.sx + w.dx * tail, c = w.sx + w.dx * tip;
          ax0 = Math.min(a, c) - margin; ax1 = Math.max(a, c) + margin;
          ay0 = w.sy - th; ay1 = w.sy + th;
        } else {
          const a = w.sy + w.dy * tail, c = w.sy + w.dy * tip;
          ay0 = Math.min(a, c) - margin; ay1 = Math.max(a, c) + margin;
          ax0 = w.sx - th; ax1 = w.sx + th;
        }
        if (x1 > ax0 && x0 < ax1 && y1 > ay0 && y0 < ay1) { kill(b, CAUSE.ARROW, w.owner); return; }
      }
    }
  }

  // 喷火器状态：0 关 1 预警 2 喷射
  function flameState(t) {
    const T = U.Items.TIMING.flame;
    const ph = ((t % T.period) + T.period) % T.period;
    if (ph < T.off) return 0;
    if (ph < T.off + T.warn) return 1;
    return 2;
  }
  // 喷射阶段 = [off+warn, period)；规划器用 pad 把危险时段前后放宽
  function flameActive(f, t, pad) {
    const T = U.Items.TIMING.flame;
    const ph = ((t % T.period) + T.period) % T.period;
    if (ph >= T.off + T.warn - pad) return true;
    return pad > 0 && ph < pad * 0.5;
  }

  U.Physics = { P, EV, CAUSE, BOUND, newBody, cloneBody, step, solidAt, flameState, flameActive, hazardCheck };
})(window.UCH);
