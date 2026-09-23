/* 电脑玩家：基于真实物理的加权 A* 规划 + 选道具/放道具策略 */
'use strict';
(function (U) {
  const { step, P } = U.Physics;
  const DT = U.C.DT;
  const { DEFS, DIRS, footprint } = U.Items;
  const MACRO = 6;

  // 动作：x 方向、跳（0 不按 / 1 按住 / 2 轻点=只按前 2 帧）、是否冲刺
  const ACTIONS = [
    { x: 1, j: 0, s: 1 },
    { x: 1, j: 1, s: 1 },
    { x: 0, j: 0, s: 0 },
    { x: -1, j: 0, s: 1 },
    { x: -1, j: 1, s: 1 },
    { x: 0, j: 1, s: 0 },
    { x: 1, j: 0, s: 0 },
    { x: 1, j: 1, s: 0 },
    { x: -1, j: 0, s: 0 },
    { x: -1, j: 1, s: 0 },
    { x: 1, j: 2, s: 1 },
    { x: -1, j: 2, s: 1 },
    { x: 1, j: 2, s: 0 },
    { x: 0, j: 2, s: 0 },
  ];

  // ---------- 身体状态打包 ----------
  const F = ['x', 'y', 'vx', 'vy', 'onGround', 'groundMat', 'groundDir', 'wall', 'wallMat', 'wallT', 'wallMem', 'ceilHoney', 'honeyIgnore', 'coyote', 'jumpBuf', 'prevJump', 'cutArmed', 'lockT', 'facing'];
  const NF = F.length;
  function pack(arr, o, b) {
    arr[o] = b.x; arr[o + 1] = b.y; arr[o + 2] = b.vx; arr[o + 3] = b.vy;
    arr[o + 4] = b.onGround ? 1 : 0; arr[o + 5] = b.groundMat; arr[o + 6] = b.groundDir; arr[o + 7] = b.wall;
    arr[o + 8] = b.wallMat; arr[o + 9] = b.wallT; arr[o + 10] = b.wallMem; arr[o + 11] = b.ceilHoney ? 1 : 0;
    arr[o + 12] = b.honeyIgnore; arr[o + 13] = b.coyote; arr[o + 14] = b.jumpBuf; arr[o + 15] = b.prevJump ? 1 : 0;
    arr[o + 16] = b.cutArmed ? 1 : 0; arr[o + 17] = b.lockT; arr[o + 18] = b.facing;
  }
  function unpack(arr, o, b) {
    b.x = arr[o]; b.y = arr[o + 1]; b.vx = arr[o + 2]; b.vy = arr[o + 3];
    b.onGround = arr[o + 4] === 1; b.groundMat = arr[o + 5]; b.groundDir = arr[o + 6]; b.wall = arr[o + 7];
    b.wallMat = arr[o + 8]; b.wallT = arr[o + 9]; b.wallMem = arr[o + 10]; b.ceilHoney = arr[o + 11] === 1;
    b.honeyIgnore = arr[o + 12]; b.coyote = arr[o + 13]; b.jumpBuf = arr[o + 14]; b.prevJump = arr[o + 15] === 1;
    b.cutArmed = arr[o + 16] === 1; b.lockT = arr[o + 17]; b.facing = arr[o + 18];
    b.dead = 0; b.won = false; b.killer = -1; b.ev = 0;
  }
  function copyBody(dst, src) {
    for (let i = 0; i < NF; i++) dst[F[i]] = src[F[i]];
    dst.dead = 0; dst.won = false; dst.killer = -1; dst.ev = 0; dst.sliding = false; dst.bounceCell = -1; dst.impact = 0; dst.t = 0;
  }

  // ---------- 距离场（从目标出发的 Dijkstra，8 邻接）----------
  const OFF = 8;
  function distanceField(world, rect) {
    const key = rect ? `${rect.x0},${rect.y0},${rect.x1},${rect.y1}` : 'goal';
    world._df = world._df || {};
    const cached = world._df[key];
    if (cached && cached.ver === world.version) return cached;
    const W = world.W, HH = world.H + OFF;
    const N = W * HH;
    const dist = new Float64Array(N).fill(1e9);
    const pass = new Uint8Array(N);
    const pen = new Float32Array(N);
    for (let y = -OFF; y < world.H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y + OFF) * W + x;
        pass[i] = y < 0 ? 1 : world.solid[y * W + x] ? 0 : 1;
        if (y >= 0 && world.wireGrid[y * W + x] >= 0) pen[i] += 6;
      }
    }
    const addPen = (cx, cy, r, v) => {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if (x < 0 || x >= W || y < -OFF || y >= world.H) continue;
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) pen[(y + OFF) * W + x] += v;
        }
      }
    };
    for (const s of world.saws) addPen(s.x, s.y, s.r + 0.6, 6);
    for (const h of world.holes) addPen(h.x, h.y, 1.6, 6);
    for (const f of world.flames) {
      for (let y = Math.floor(f.ry0); y < Math.ceil(f.ry1); y++) for (let x = Math.floor(f.rx0); x < Math.ceil(f.rx1); x++) {
        if (x >= 0 && x < W && y >= -OFF && y < world.H) pen[(y + OFF) * W + x] += 2;
      }
    }
    const g = rect || world.goal;
    // 二叉堆
    const heap = [];
    const push = (d, i) => {
      heap.push([d, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    for (let y = Math.floor(g.y0); y < Math.ceil(g.y1); y++) {
      for (let x = Math.floor(g.x0); x < Math.ceil(g.x1); x++) {
        if (x < 0 || x >= W || y < -OFF || y >= world.H) continue;
        const i = (y + OFF) * W + x;
        if (!pass[i]) continue;
        dist[i] = 0;
        push(0, i);
      }
    }
    const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy, c] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= HH) continue;
        const j = ny * W + nx;
        if (!pass[j]) continue;
        if (dx && dy && (!pass[y * W + nx] || !pass[ny * W + x])) continue;
        const nd = d + c + pen[j];
        if (nd < dist[j]) {
          dist[j] = nd;
          push(nd, j);
        }
      }
    }
    const res = { ver: world.version, dist, W, HH };
    world._df[key] = res;
    return res;
  }
  function dfAt(df, x, y) {
    const cx = Math.floor(x), cy = Math.floor(y) + OFF;
    if (cx < 0 || cx >= df.W || cy < 0 || cy >= df.HH) return 999;
    const d = df.dist[cy * df.W + cx];
    return d > 1e8 ? 999 : d;
  }

  // ---------- 二叉堆（节点索引 + 优先级）----------
  class Heap {
    constructor() { this.f = new Float64Array(4096); this.v = new Int32Array(4096); this.n = 0; }
    push(v, f) {
      if (this.n >= this.f.length) {
        const nf = new Float64Array(this.f.length * 2); nf.set(this.f); this.f = nf;
        const nv = new Int32Array(this.v.length * 2); nv.set(this.v); this.v = nv;
      }
      let k = this.n++;
      const F = this.f, V = this.v;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (F[p] <= f) break;
        F[k] = F[p]; V[k] = V[p];
        k = p;
      }
      F[k] = f; V[k] = v;
    }
    pop() {
      const F = this.f, V = this.v;
      const top = V[0];
      const n = --this.n;
      if (n > 0) {
        const f = F[n], v = V[n];
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          if (l >= n) break;
          let m = l;
          if (l + 1 < n && F[l + 1] < F[l]) m = l + 1;
          if (F[m] >= f) break;
          F[k] = F[m]; V[k] = V[m];
          k = m;
        }
        F[k] = f; V[k] = v;
      }
      return top;
    }
  }

  // ---------- 规划器 ----------
  class Planner {
    /**
     * opts: margin, budget(扩展次数), weight, target(矩形，可选), maxT
     */
    constructor(world, startBody, t0, opts = {}) {
      this.world = world;
      this.t0 = t0;
      this.margin = opts.margin != null ? opts.margin : 0.12;
      this.budget = opts.budget || 12000;
      this.weight = opts.weight || 2.2;
      this.target = opts.target || null;
      this.maxDepth = Math.floor((opts.maxT || 45) / (MACRO * DT));
      this.df = distanceField(world, this.target);
      this.cap = 8192;
      this.pool = new Float64Array(this.cap * NF);
      this.parent = new Int32Array(this.cap);
      this.act = new Int8Array(this.cap);
      this.depth = new Int32Array(this.cap);
      this.frames = new Int8Array(this.cap);
      this.hv = new Float32Array(this.cap);
      this.n = 0;
      this.heap = new Heap();
      this.closed = new Map();
      this.expanded = 0;
      this.done = false;
      this.found = -1;
      this.scratch = U.Physics.newBody(0, 0);
      this.child = U.Physics.newBody(0, 0);
      const h0 = this.h(startBody);
      const r = this.addNode(startBody, -1, -1, 0, MACRO, h0);
      this.best = r;
      this.bestGround = startBody.onGround ? r : -1;
      this.heap.push(r, 0);
      this.inp = { x: 0, jump: false, sprint: false };
      this.q = opts.q || 4;
      this.stall = opts.stall || 6000;
      this.lastImprove = 0;
      this.timed = world.flames.length > 0 || world.bows.length > 0;
    }
    h(b) {
      if (this.target) {
        const t = this.target;
        if (b.x + P.w / 2 > t.x0 && b.x - P.w / 2 < t.x1 && b.y > t.y0 && b.y - P.h < t.y1) return 0;
      }
      return dfAt(this.df, b.x, b.y - P.h * 0.5) / 0.9;
    }
    addNode(b, parent, act, depth, frames, h) {
      if (this.n >= this.cap) {
        const nc = this.cap * 2;
        const np = new Float64Array(nc * NF); np.set(this.pool); this.pool = np;
        const a1 = new Int32Array(nc); a1.set(this.parent); this.parent = a1;
        const a2 = new Int8Array(nc); a2.set(this.act); this.act = a2;
        const a3 = new Int32Array(nc); a3.set(this.depth); this.depth = a3;
        const a4 = new Int8Array(nc); a4.set(this.frames); this.frames = a4;
        const a5 = new Float32Array(nc); a5.set(this.hv); this.hv = a5;
        this.cap = nc;
      }
      const i = this.n++;
      pack(this.pool, i * NF, b);
      this.parent[i] = parent;
      this.act[i] = act;
      this.depth[i] = depth;
      this.frames[i] = frames;
      this.hv[i] = h;
      return i;
    }
    key(b, t) {
      const Q = this.q;
      const kx = Math.round(b.x * Q) + 40;
      const ky = Math.round(b.y * Q) + 64;
      const kvx = Math.max(-31, Math.min(31, Math.round(b.vx / 1.5))) + 32;
      const kvy = Math.max(-31, Math.min(31, Math.round(b.vy / 2))) + 32;
      const fl = (b.onGround ? 1 : 0) | (b.prevJump ? 2 : 0) | (b.wallT > 0 ? 4 : 0) | (b.cutArmed ? 8 : 0);
      let k = (((kx * 512 + ky) * 64 + kvx) * 64 + kvy) * 16 + fl;
      // 有定时陷阱时，允许“原地等待”：静止状态按时间段区分
      if (this.timed && b.onGround && Math.abs(b.vx) < 0.2) k += (Math.floor(t / 0.3) % 24 + 1) * 4294967296;
      return k;
    }
    // 运行一段时间；返回 true 表示已结束
    run(ms) {
      if (this.done) return true;
      const end = performance.now() + ms;
      const world = this.world, margin = this.margin;
      const sc = this.scratch, ch = this.child, inp = this.inp;
      while (true) {
        if ((this.expanded & 15) === 0 && performance.now() > end) return false;
        if (this.heap.n === 0 || this.expanded >= this.budget || this.expanded - this.lastImprove > this.stall) { this.done = true; return true; }
        const ni = this.heap.pop();
        this.expanded++;
        const d = this.depth[ni];
        if (d >= this.maxDepth) continue;
        unpack(this.pool, ni * NF, sc);
        const t0 = this.t0 + d * MACRO * DT;
        for (let ai = 0; ai < ACTIONS.length; ai++) {
          const a = ACTIONS[ai];
          // 剪枝：地面上且未按跳时，“原地跳”与“走路跳”在很多情况下冗余——保留
          copyBody(ch, sc);
          inp.x = a.x; inp.sprint = a.s === 1;
          let t = t0, fr = 0, won = false, dead = false;
          for (; fr < MACRO; fr++) {
            inp.jump = a.j === 1 || (a.j === 2 && fr < 2);
            step(ch, inp, world, t, margin);
            t += DT;
            if (ch.dead) { dead = true; break; }
            if (ch.won) { won = true; fr++; break; }
            if (this.target && this.h(ch) === 0) { won = true; fr++; break; }
          }
          if (dead) continue;
          if (won) {
            const idx = this.addNode(ch, ni, ai, d + 1, fr, 0);
            this.found = idx;
            this.done = true;
            return true;
          }
          const k = this.key(ch, t);
          const prev = this.closed.get(k);
          if (prev !== undefined && prev <= d + 1) continue;
          this.closed.set(k, d + 1);
          const h = this.h(ch);
          const idx = this.addNode(ch, ni, ai, d + 1, MACRO, h);
          this.heap.push(idx, d + 1 + this.weight * h);
          if (h < this.hv[this.best] - 0.01) { this.best = idx; this.lastImprove = this.expanded; }
          if (ch.onGround && (this.bestGround < 0 || h < this.hv[this.bestGround])) this.bestGround = idx;
        }
      }
    }
    // 回溯路径：[{a, frames, x, y}]
    path(idx) {
      if (idx == null) idx = this.found;
      if (idx < 0) return null;
      const out = [];
      while (idx > 0 && this.parent[idx] >= 0) {
        const o = idx * NF;
        out.push({ a: this.act[idx], frames: this.frames[idx], x: this.pool[o], y: this.pool[o + 1] });
        idx = this.parent[idx];
      }
      out.reverse();
      return out;
    }
    bodyAt(idx) {
      const b = U.Physics.newBody(0, 0);
      unpack(this.pool, idx * NF, b);
      return b;
    }
    bestDist() {
      return this.hv[this.best] * 0.9;
    }
  }

  // 同步跑完一个规划（用于评估）
  function planSync(world, body, t0, opts) {
    const p = new Planner(world, body, t0, opts);
    p.run(1e9);
    return p;
  }

  // ---------- 难度 ----------
  const DIFF = {
    easy: { margin: 0.24, react: [0.4, 0.9], noise: 1 / 45, budget: 7000, evalCands: 4, name: '简单' },
    normal: { margin: 0.14, react: [0.18, 0.5], noise: 1 / 100, budget: 11000, evalCands: 7, name: '普通' },
    hard: { margin: 0.07, react: [0.08, 0.25], noise: 1 / 400, budget: 16000, evalCands: 11, name: '困难' },
  };

  // ---------- 奔跑阶段的电脑大脑 ----------
  class RunBrain {
    constructor(player, diff) {
      this.p = player;
      this.d = DIFF[diff] || DIFF.normal;
      this.plan = null;       // [{a, frames, x, y}]
      this.planStartT = 0;
      this.planner = null;
      this.cursor = 0;
      this.frameInMacro = 0;
      this.state = 'init';    // init | planning | wait | exec | stuck | giveup
      this.stuckT = 0;
      this.noiseLeft = 0;
      this.giveUpDir = 1;
      this.react = this.d.react[0] + Math.random() * (this.d.react[1] - this.d.react[0]);
    }
    // 从 tNow+lead 时刻的预测状态开始规划（期间原地待命）
    startPlan(world, body, tNow, lead) {
      const b = U.Physics.cloneBody(body);
      let t = tNow;
      const idle = { x: 0, jump: false, sprint: false };
      const frames = Math.round(lead / DT);
      for (let i = 0; i < frames; i++) { step(b, idle, world, t, 0); t += DT; }
      this.planStartT = t;
      this.lead = lead;
      this.startBody = b;
      this.state = 'planning';
      this.partial = false;
      const reqId = (this.reqId || 0) + 1;
      this.reqId = reqId;
      const opts = { margin: this.d.margin, budget: this.d.budget, weight: 2.2 };
      const pool = U.AIPool;
      if (pool && pool.ok) {
        this.planner = null;
        pool.request({ type: 'plan', world, body: b, t0: t, opts }, (res) => {
          if (this.reqId === reqId && this.state === 'planning') this.onResult(res.found, res.path);
        });
      } else {
        this.planner = new Planner(world, b, t, opts);
      }
    }
    onResult(found, path) {
      this.plan = path || [];
      this.cursor = 0;
      this.frameInMacro = 0;
      this.partial = !found;
      this.planner = null;
      if (this.plan.length) this.state = 'wait';
      else { this.state = 'stuck'; this.stuckT = 0; }
    }
    // 主线程兜底：分时推进规划
    think(ms) {
      if (this.state !== 'planning' || !this.planner) return true;
      const pl = this.planner;
      const done = pl.run(ms);
      if (done) {
        if (pl.found >= 0) this.onResult(true, pl.path());
        else this.onResult(false, pl.path(pl.bestGround >= 0 ? pl.bestGround : pl.best));
      }
      return done;
    }
    // 返回本帧输入
    input(world, body, tNow) {
      const idle = { x: 0, jump: false, sprint: false };
      if (this.state === 'init') return idle;
      if (this.state === 'planning') {
        return idle;
      }
      if (this.state === 'wait') {
        if (tNow > this.planStartT + DT * 0.5) {
          // 结果来晚了：若一直静止且无定时陷阱，整体顺延；否则重算
          const sb = this.startBody;
          const still = sb && body.onGround && Math.abs(body.x - sb.x) < 1e-6 && Math.abs(body.y - sb.y) < 1e-6 && Math.abs(body.vx) < 1e-6 && Math.abs(body.vy) < 1e-6;
          const timed = world.flames.length > 0 || world.bows.length > 0;
          if (still && !timed) this.planStartT = tNow;
          else { this.startPlan(world, body, tNow, Math.min(1.5, (this.lead || 0.2) * 2)); return idle; }
        }
        if (tNow + 1e-6 >= this.planStartT) this.state = 'exec';
        else return idle;
      }
      if (this.state === 'exec') {
        if (!this.plan || this.cursor >= this.plan.length) {
          if (this.partial) { this.state = 'stuck'; this.stuckT = 0; }
          return idle;
        }
        const m = this.plan[this.cursor];
        let a = ACTIONS[m.a];
        if (this.noiseLeft > 0) {
          a = this.noiseAct;
          this.noiseLeft--;
        } else if (this.frameInMacro === 0 && Math.random() < this.d.noise) {
          // 人类式失误：晚跳/松跳/放开冲刺
          const alt = ACTIONS.filter((q) => q !== a && (q.x === a.x || q.j === a.j));
          this.noiseAct = alt[Math.floor(Math.random() * alt.length)];
          this.noiseLeft = 2 + Math.floor(Math.random() * 5);
          this.deviated = true;
          a = this.noiseAct;
        }
        const fi = this.frameInMacro++;
        if (this.frameInMacro >= m.frames) {
          this.frameInMacro = 0;
          this.cursor++;
          this.checkAfter = m;
        }
        return { x: a.x, jump: a.j === 1 || (a.j === 2 && fi < 2), sprint: a.s === 1 };
      }
      if (this.state === 'stuck') {
        this.stuckT += DT;
        return idle;
      }
      if (this.state === 'giveup') {
        return { x: this.giveUpDir, jump: Math.random() < 0.1, sprint: true };
      }
      return idle;
    }
    // 物理步进后调用：检测偏离
    afterStep(world, body, tNow) {
      if (this.checkAfter) {
        const m = this.checkAfter;
        this.checkAfter = null;
        if (this.state === 'exec' && this.noiseLeft <= 0) {
          const dx = body.x - m.x, dy = body.y - m.y;
          if (dx * dx + dy * dy > 0.0025) {
            this.startPlan(world, body, tNow, 0.3);
          }
        }
      }
    }
  }

  // ---------- 地图分析（放置阶段共享）----------
  function analyze(world, spawn, budget) {
    const b = U.Physics.newBody(spawn.x, spawn.y);
    const p = planSync(world, b, 0, { margin: 0.1, budget: budget || 9000, weight: 2.4 });
    const res = { hasPath: p.found >= 0, planner: p };
    if (res.hasPath) {
      res.path = p.path();
      res.pts = res.path.map((m) => ({ x: m.x, y: m.y }));
      res.time = res.path.length * MACRO * DT;
    } else {
      const bi = p.bestGround >= 0 ? p.bestGround : p.best;
      res.frontier = p.bodyAt(bi);
      res.frontierDist = p.hv[bi] * 0.9;
      const pa = p.path(bi) || [];
      res.pts = pa.map((m) => ({ x: m.x, y: m.y }));
    }
    return res;
  }

  function quickCheck(world, spawn, budget) {
    const b = U.Physics.newBody(spawn.x, spawn.y);
    const p = planSync(world, b, 0, { margin: 0.08, budget: budget || 5000, weight: 2.8 });
    return { ok: p.found >= 0, time: p.found >= 0 ? p.depth[p.found] * MACRO * DT : 999, dist: p.found >= 0 ? 0 : p.bestDist(), planner: p };
  }

  // ---------- 选道具 ----------
  function pickItem(options, analysis, world, pid, lastVerdict) {
    // options: [{type, taken}]
    const free = options.map((o, i) => ({ o, i })).filter((q) => q.o.taken < 0);
    if (!free.length) return -1;
    if (Math.random() < 0.18) return free[Math.floor(Math.random() * free.length)].i;
    const hasPath = analysis && analysis.hasPath;
    const othersHaz = world.items.filter((it) => it.owner !== pid && DEFS[it.type].cat === 'hazard').length;
    let best = -1, bestS = -1e9;
    for (const q of free) {
      const d = DEFS[q.o.type];
      let s = Math.random() * 1.5;
      if (!hasPath) {
        if (d.cat === 'block') s += 4 + (q.o.type === 'block3' || q.o.type === 'block2' ? 1 : 0);
        else if (q.o.type === 'ice' || q.o.type === 'conveyor' || q.o.type === 'spring' || q.o.type === 'honey') s += 2.5;
        else if (q.o.type === 'bomb') s += world.items.length > 6 ? 3 : 0.5;
        else s += 0.3;
      } else {
        if (d.cat === 'hazard') s += lastVerdict === 'tooeasy' ? 6 : 4;
        else if (q.o.type === 'coin') s += 2;
        else if (q.o.type === 'bomb') s += othersHaz >= 2 ? 3.5 : 1;
        else s += 1.5;
      }
      if (s > bestS) { bestS = s; best = q.i; }
    }
    return best;
  }

  // ---------- 放道具（生成器，分帧执行）----------
  function* placeJob(game, player, type, diff) {
    const world0 = game.world;
    const level = game.level;
    const D = DIFF[diff] || DIFF.normal;
    const pid = player.idx;
    const spawn = level.spawns[1];
    const def = DEFS[type];
    let an = game.aiAnalysis;
    while (!an) { yield; an = game.aiAnalysis; }
    const rot0 = U.Items.defaultRot(type);
    const inMap = (x, y) => x >= 0 && y >= 0 && x < U.C.W && y < U.C.H;
    const tryPlaceOn = (w, gx, gy, rot) => w.canPlace(type, gx, gy, rot);
    const rand = (a, b) => a + Math.random() * (b - a);
    const ri = (a, b) => Math.floor(rand(a, b + 1));

    // 随便找一个不碍事的位置
    const harmless = () => {
      for (let k = 0; k < 200; k++) {
        const gx = ri(1, U.C.W - 3), gy = ri(0, 5);
        const rot = rot0;
        if (tryPlaceOn(world0, gx, gy, rot)) return { gx, gy, rot };
      }
      return null;
    };

    // --- 炸弹 ---
    if (type === 'bomb') {
      let best = null, bestS = 0;
      const R = U.Items.TIMING.bomb.r;
      const frontier = an.frontier;
      for (const it of world0.items) {
        for (const [cx, cy] of it.cells) {
          let s = 0;
          for (const o of world0.items) {
            const hit = o.cells.some(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 <= R * R);
            if (!hit) continue;
            const cat = DEFS[o.type].cat;
            if (o.owner === pid) s -= cat === 'hazard' ? 1.5 : 0.5;
            else s += cat === 'hazard' ? 2 : an.hasPath ? 0.3 : 0.6;
          }
          if (!an.hasPath && frontier) {
            const dx = cx - frontier.x;
            if (dx > 0 && dx < 7 && Math.abs(cy - frontier.y) < 5) s += 1.5;
          }
          s += Math.random() * 0.5;
          if (s > bestS) { bestS = s; best = { gx: cx, gy: cy, rot: 0 }; }
        }
        yield;
      }
      return best || harmless();
    }

    // --- 金币 ---
    if (type === 'coin') {
      const pts = an.pts || [];
      for (let k = 0; k < 60; k++) {
        const p = pts.length ? pts[Math.floor(rand(0.3, 0.9) * pts.length)] : { x: rand(10, 36), y: rand(8, 14) };
        const gx = Math.floor(p.x + rand(-2, 2)), gy = Math.floor(p.y - rand(1.5, 3.5));
        if (inMap(gx, gy) && tryPlaceOn(world0, gx, gy, 0)) return { gx, gy, rot: 0 };
      }
      return harmless();
    }

    const isBuild = def.cat === 'block' || def.cat === 'surface';

    // --- 无路：搭桥 ---
    if (!an.hasPath && isBuild) {
      const fr = an.frontier || U.Physics.newBody(spawn.x, spawn.y);
      const cands = [];
      const rots = def.rotatable ? [0, 1, 2, 3] : [0];
      for (let n = 0; n < 60 && cands.length < 26; n++) {
        const rot = type === 'spring' ? 0 : type === 'conveyor' ? 0 : rots[Math.floor(Math.random() * rots.length)];
        const fp = footprint(type, rot);
        const dx = rand(2.5, 6.8), dy = Math.round(rand(-2.2, 2.2));
        const topY = Math.floor(fr.y) + dy; // 道具顶面行
        const gx = Math.floor(fr.x + dx - (fp.w > 1 ? rand(0, fp.w - 1) : 0));
        const gy = topY;
        if (!inMap(gx, gy) || !tryPlaceOn(world0, gx, gy, rot)) continue;
        cands.push({ gx, gy, rot });
      }
      yield;
      let best = null, bestS = -1e9;
      const evalN = Math.min(cands.length, D.evalCands + 3);
      for (let i = 0; i < evalN; i++) {
        const c = cands[i];
        const w = world0.clone();
        if (!w.canPlace(type, c.gx, c.gy, c.rot)) continue;
        w.place(type, c.gx, c.gy, c.rot, pid);
        const st = U.Physics.cloneBody(fr);
        st.vx = 0; st.vy = 0;
        const p = new Planner(w, st, 0, { margin: 0.1, budget: 2500, weight: 2.6 });
        while (!p.run(3)) yield;
        const score = (p.found >= 0 ? 100 : 0) - p.bestDist() + Math.random() * 0.8;
        if (score > bestS) { bestS = score; best = c; }
        yield;
      }
      return best || harmless();
    }

    // --- 有路：陷阱 / 方块干扰 ---
    const pts = an.pts || [];
    if (!pts.length) return harmless();
    const baseTime = an.hasPath ? an.time : 999;
    const cands = [];
    for (let n = 0; n < 120 && cands.length < 30; n++) {
      // 路线中后段更容易放陷阱（避开出生点附近）
      const p = pts[Math.floor(rand(0.2, 0.95) * pts.length)];
      let rot = rot0;
      let gx, gy;
      if (type === 'crossbow' || type === 'flame') {
        // 放在路线的侧上方，朝向路线
        const side = Math.floor(Math.random() * 3);
        const dist = type === 'flame' ? ri(1, 3) : ri(2, 7);
        if (side === 0) { gx = Math.floor(p.x); gy = Math.floor(p.y - 1 - dist); rot = 2; }
        else if (side === 1) { gx = Math.floor(p.x + dist + 1); gy = Math.floor(p.y - 0.5); rot = 3; }
        else { gx = Math.floor(p.x - dist - 1); gy = Math.floor(p.y - 0.5); rot = 1; }
      } else if (type === 'spikes') {
        gx = Math.floor(p.x + rand(-1.5, 1.5));
        gy = Math.floor(p.y + rand(-2.5, 0.5));
        rot = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 4);
      } else {
        const fp = footprint(type, rot);
        gx = Math.floor(p.x + rand(-1.8, 1.8) - fp.w / 2 + 0.5);
        gy = Math.floor(p.y - P.h * 0.5 + rand(-2.4, 1.4) - fp.h / 2 + 0.5);
        if (def.rotatable && !def.directional) rot = Math.floor(Math.random() * 4);
      }
      if (!inMap(gx, gy) || !tryPlaceOn(world0, gx, gy, rot)) continue;
      cands.push({ gx, gy, rot });
    }
    yield;
    let best = null, bestS = -1e9;
    const evalN = Math.min(cands.length, D.evalCands);
    for (let i = 0; i < evalN; i++) {
      const c = cands[i];
      const w = world0.clone();
      if (!w.canPlace(type, c.gx, c.gy, c.rot)) continue;
      w.place(type, c.gx, c.gy, c.rot, pid);
      const p = new Planner(w, U.Physics.newBody(spawn.x, spawn.y), 0, { margin: 0.1, budget: 6000, weight: 2.4 });
      while (!p.run(3)) yield;
      if (p.found < 0) continue; // 不能把路完全堵死
      const time = p.depth[p.found] * MACRO * DT;
      // 陷阱：离路线越近越好；方块：让路线变长
      let near = 99;
      const fp = footprint(type, c.rot);
      const hx = c.gx + fp.w / 2, hy = c.gy + fp.h / 2;
      for (const q of pts) near = Math.min(near, Math.hypot(q.x - hx, q.y - P.h / 2 - hy));
      let score = (time - baseTime) * 1.5 + Math.random() * 0.6;
      if (def.cat === 'hazard') score += Math.max(0, 3 - near) * 1.2;
      if (score > bestS) { bestS = score; best = c; }
      yield;
    }
    return best || harmless();
  }

  U.AI = { Planner, RunBrain, analyze, quickCheck, pickItem, placeJob, DIFF, ACTIONS, MACRO, distanceField, planSync };
})(window.UCH);
