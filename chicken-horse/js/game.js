/* 游戏流程：派对盒 → 放置 → 奔跑 → 计分 →（电路格切换）→ … → 胜利 */
'use strict';
(function (U) {
  const { W, H, DT, PLAYER_COLORS, PTS } = U.C;
  const { clamp, lerp } = U.util;
  const { DEFS, footprint, nextRot, defaultRot, rollBox, TIMING } = U.Items;
  const { EV, CAUSE } = U.Physics;
  const A = U.Audio;
  const FX = U.FX;

  const G = {
    state: 'title',
    level: null,
    world: null,
    players: [],
    round: 0,
    time: 0,
    paused: false,
    speed: 1,
    settings: { cpu: 3, diff: 'normal', humans: 1, win: 5, chars: [0, 1] },
    box: null,
    place: null,
    run: null,
    score: null,
    win: null,
    transition: null,
    aiAnalysis: null,
    analysisJob: null,
    banner: null,
    events: [],
  };

  const CAUSE_TEXT = {
    [CAUSE.FALL]: '掉下去了', [CAUSE.SPIKE]: '被扎了', [CAUSE.WIRE]: '被铁丝网缠住', [CAUSE.SAW]: '被电锯切了',
    [CAUSE.ARROW]: '中箭了', [CAUSE.FLAME]: '被烤熟了', [CAUSE.HOLE]: '被黑洞吞了',
  };

  G.init = function () {
    G.level = U.Level.buildMainframe();
    G.world = new U.World(G.level);
    U.Render.build(G.level);
    G.players = [];
  };

  function newAnim() {
    return { state: 'idle', phase: 0, facing: 1, sx: 1, sy: 1, squash: 0, tilt: 0, look: 0.6, blink: false, blinkT: 2 + Math.random() * 3, scale: 1, offY: 0, hideTag: false };
  }

  // ---------------- 开局 ----------------
  G.startMatch = function (settings) {
    Object.assign(G.settings, settings || {});
    const S = G.settings;
    G.world = new U.World(G.level);
    FX.clear();
    const humans = S.humans;
    const used = new Set();
    G.players = [];
    const total = Math.min(4, humans + S.cpu);
    for (let i = 0; i < total; i++) {
      const human = i < humans;
      let char = human ? S.chars[i] : -1;
      if (char == null || char < 0 || used.has(char)) {
        char = [0, 1, 2, 3].find((c) => !used.has(c) && !(S.chars.slice(0, humans).includes(c)));
      }
      used.add(char);
      G.players.push({
        idx: i,
        char,
        color: PLAYER_COLORS[i],
        human,
        slot: human ? i : -1,
        tag: human ? (humans > 1 ? `${i + 1}P` : '你') : 'CPU',
        name: U.Chars.CHARS[char].name,
        pts: 0,
        breakdown: { goal: 0, first: 0, trap: 0, solo: 0, coin: 0, comeback: 0 },
        body: U.Physics.newBody(G.level.spawns[i].x, G.level.spawns[i].y),
        visible: false,
        anim: newAnim(),
        cursor: { x: W / 2, y: 8 },
        underdog: false,
        dryRounds: 0,
      });
    }
    G.round = 0;
    G.winner = null;
    G.lastVerdict = null;
    G.state = 'intro';
    G.stateT = 0;
    A.musicMode('menu');
    A.play('boxOpen');
  };

  G.nextRound = function () {
    G.round++;
    G.aiAnalysis = null;
    G.analysisJob = null;
    G.transition = null;
    const hadTiles = G.world.circuitSolid.size > 0 || G.world.circuitMarks.size > 0;
    if (G.round > 1 && hadTiles) {
      const r = G.world.materialize();
      const addedSet = new Set(r.added.map((e) => e[0]));
      const delayOf = (idx) => ((idx % W) - 8) * 0.03 + (((idx / W) | 0) % 3) * 0.02;
      G.transition = {
        t: 0, removed: r.removed, added: r.added, addedSet,
        delay: (idx) => 0.35 + delayOf(idx),
        delayOld: (idx) => delayOf(idx),
        dur: 1.6,
      };
      for (const [idx, pid] of r.removed) {
        const x = idx % W, y = (idx / W) | 0;
        setTimeout(() => FX.pixels(x, y, PLAYER_COLORS[pid], 4, true), Math.max(0, delayOf(idx)) * 1000);
      }
      if (r.removed.length) A.play('derez');
      if (r.added.length) setTimeout(() => A.play('materialize'), 380);
      G.state = 'shift';
      G.stateT = 0;
    } else {
      G.enterBox();
    }
  };

  // ---------------- 地图分析（给电脑用，分帧）----------------
  function startAnalysis() {
    const sp = G.level.spawns[1];
    G.aiAnalysis = null;
    G.analysisJob = null;
    const pool = U.AIPool;
    if (pool && pool.ok) {
      const round = G.round;
      G.analysisReq = pool.request({ type: 'analyze', world: G.world, spawn: sp, budget: 9000 }, (res) => {
        if (G.round === round && res.analysis) G.aiAnalysis = res.analysis;
      });
      return;
    }
    const b = U.Physics.newBody(sp.x, sp.y);
    G.analysisJob = new U.AI.Planner(G.world, b, 0, { margin: 0.1, budget: 9000, weight: 2.4 });
  }
  function stepAnalysis(ms) {
    const pl = G.analysisJob;
    if (!pl) return;
    if (pl.run(ms)) {
      const res = { hasPath: pl.found >= 0 };
      if (res.hasPath) {
        const path = pl.path();
        res.pts = path.map((m) => ({ x: m.x, y: m.y }));
        res.time = path.length * U.AI.MACRO * DT;
      } else {
        const bi = pl.bestGround >= 0 ? pl.bestGround : pl.best;
        res.frontier = pl.bodyAt(bi);
        res.pts = (pl.path(bi) || []).map((m) => ({ x: m.x, y: m.y }));
      }
      G.aiAnalysis = res;
      G.analysisJob = null;
    }
  }

  // ---------------- 派对盒 ----------------
  G.enterBox = function () {
    G.state = 'box';
    G.stateT = 0;
    const n = G.players.length;
    const count = Math.min(7, n + 2);
    const types = rollBox(Math.random, count, G.round);
    G.box = {
      t: 0,
      items: types.map((type) => ({ type, taken: -1, takeT: 0 })),
      doneT: null,
      hover: [0, 0],
      dropSound: false,
      openSound: false,
    };
    for (const p of G.players) {
      p.pick = -1;
      p.item = null;
      p.placed = false;
      p.visible = false;
      p.pickDelay = 0.7 + Math.random() * 1.6;
      p.boxCursor = { x: 0, y: 0, init: false };
    }
    startAnalysis();
    A.musicMode('menu');
  };

  G.boxOpen = function () {
    return G.state === 'box' && G.box && G.box.t > 1.25;
  };

  G.pickItem = function (p, i) {
    const B = G.box;
    if (!G.boxOpen() || p.pick >= 0 || !B.items[i] || B.items[i].taken >= 0) return false;
    B.items[i].taken = p.idx;
    B.items[i].takeT = B.t;
    p.pick = i;
    p.item = { type: B.items[i].type, rot: defaultRot(B.items[i].type) };
    A.play('pick');
    return true;
  };

  function updateBox(dt) {
    const B = G.box;
    B.t += dt;
    stepAnalysis(5);
    if (!B.dropSound && B.t > 0.35) { B.dropSound = true; A.play('boxDrop'); FX.addShake(0.3); }
    if (!B.openSound && B.t > 0.9) { B.openSound = true; A.play('boxOpen'); }
    if (!G.boxOpen()) return;
    // 电脑挑选
    for (const p of G.players) {
      if (p.human || p.pick >= 0) continue;
      if (B.t - 1.25 < p.pickDelay) continue;
      if (!G.aiAnalysis && B.t < 4.5) continue;
      const i = U.AI.pickItem(B.items, G.aiAnalysis, G.world, p.idx, G.lastVerdict);
      if (i >= 0) G.pickItem(p, i);
    }
    // 人类：键盘 / 手柄在道具之间移动
    for (const p of G.players) {
      if (!p.human || p.pick >= 0) continue;
      const s = p.slot;
      const n = B.items.length;
      const cols = U.UI ? U.UI.boxCols(n) : n;
      let h = B.hover[s] || 0;
      const move = (d) => {
        for (let k = 0; k < n; k++) {
          h = (h + d + n) % n;
          if (B.items[h].taken < 0) break;
        }
        A.play('hover');
      };
      if (U.Input.pressed(s, 'x') && U.Input.get(s).x > 0) move(1);
      if (U.Input.pressed(s, 'x') && U.Input.get(s).x < 0) move(-1);
      const iy = U.Input.get(s).y;
      if (U.Input.pressed(s, 'y') && iy > 0) move(cols);
      if (U.Input.pressed(s, 'y') && iy < 0) move(-cols);
      if (B.items[h] && B.items[h].taken >= 0) move(1);
      B.hover[s] = h;
      if (U.Input.pressed(s, 'confirm')) G.pickItem(p, h);
    }
    const all = G.players.every((p) => p.pick >= 0) || B.items.every((it) => it.taken >= 0);
    if (all && B.doneT == null) B.doneT = B.t;
    if (B.doneT != null && B.t - B.doneT > 0.9) G.enterPlace();
  }

  // ---------------- 放置 ----------------
  G.enterPlace = function () {
    G.state = 'place';
    G.stateT = 0;
    G.place = { t: 0, doneT: null };
    const n = G.players.length;
    G.players.forEach((p, k) => {
      p.placed = !p.item;
      p.cursor = { x: W / 2 + (k - (n - 1) / 2) * 2.5, y: 9 };
      p.invalidT = 0;
      if (!p.human && p.item) {
        p.placeJob = null;
        p.placeReq = false;
        p.placeTarget = undefined;
        p.botWait = 0.35 + Math.random() * 0.6;
      }
    });
    // 电脑按顺序（错开）思考，后思考的能看到前面放下的道具
    let order = 0;
    for (const p of G.players) {
      if (p.human || !p.item) continue;
      p.placeAt = 0.3 + order * 1.5 + Math.random() * 0.5;
      p.prevBot = order > 0 ? G.players.filter((q) => !q.human && q.item)[order - 1] : null;
      order++;
    }
    if (!G.aiAnalysis && !G.analysisJob && !(U.AIPool && U.AIPool.ok)) startAnalysis();
  };

  // 道具左上角格子（由光标位置吸附）
  G.itemGrid = function (p) {
    const fp = footprint(p.item.type, p.item.rot);
    return { gx: Math.round(p.cursor.x - fp.w / 2), gy: Math.round(p.cursor.y - fp.h / 2), fp };
  };
  G.canPlaceFor = function (p) {
    if (!p.item) return false;
    const { gx, gy } = G.itemGrid(p);
    return G.world.canPlace(p.item.type, gx, gy, p.item.rot);
  };
  G.rotateFor = function (p) {
    if (!p.item || p.placed) return;
    const nr = nextRot(p.item.type, p.item.rot);
    if (nr !== p.item.rot) { p.item.rot = nr; A.play('rotate'); }
  };

  G.tryPlace = function (p) {
    if (!p.item || p.placed) return false;
    const { gx, gy, fp } = G.itemGrid(p);
    const type = p.item.type;
    if (!G.world.canPlace(type, gx, gy, p.item.rot)) {
      p.invalidT = 0.35;
      A.play('invalid');
      return false;
    }
    if (type === 'bomb') {
      const cx = gx + 0.5, cy = gy + 0.5;
      const removed = G.world.explode(cx, cy, TIMING.bomb.r);
      FX.explosion(cx, cy, TIMING.bomb.r);
      for (const it of removed) {
        const c = it.cells[0];
        FX.debris(c[0] + 0.5, c[1] + 0.5, DEFS[it.type].cat === 'hazard' ? '#8b93a6' : '#c98b4b', 8);
      }
      A.play('bomb');
    } else {
      const it = G.world.place(type, gx, gy, p.item.rot, p.idx);
      it.dropT = G.time;
      FX.dust(gx + fp.w / 2, gy + fp.h, 10, 1.5);
      A.play('place');
      FX.addShake(0.12);
    }
    p.placed = true;
    p.lastPlaced = { type, gx, gy };
    p.item = null;
    return true;
  };

  function nearestValid(p, radius) {
    const { gx, gy } = G.itemGrid(p);
    for (let r = 0; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (G.world.canPlace(p.item.type, gx + dx, gy + dy, p.item.rot)) return { gx: gx + dx, gy: gy + dy };
      }
    }
    return null;
  }

  function updatePlace(dt) {
    const Pl = G.place;
    Pl.t += dt;
    stepAnalysis(4);
    const limit = U.C.PLACE_TIME_LIMIT;
    // 人类
    for (const p of G.players) {
      if (p.placed || !p.item) continue;
      if (p.invalidT > 0) p.invalidT -= dt;
      if (!p.human) continue;
      const s = p.slot;
      const inp = U.Input.get(s);
      if (inp.x || inp.y) {
        const sp = 13;
        p.cursor.x = clamp(p.cursor.x + inp.x * sp * dt, -1, W + 1);
        p.cursor.y = clamp(p.cursor.y + inp.y * sp * dt, -1, H + 1);
      }
      if (U.Input.pressed(s, 'rotate')) G.rotateFor(p);
      if (U.Input.pressed(s, 'confirm')) G.tryPlace(p);
      if (Pl.t > limit) {
        // 超时：合法就放下，否则丢弃
        if (!G.tryPlace(p)) {
          const nv = nearestValid(p, 2);
          if (nv) {
            const fp = footprint(p.item.type, p.item.rot);
            p.cursor.x = nv.gx + fp.w / 2; p.cursor.y = nv.gy + fp.h / 2;
            G.tryPlace(p);
          } else { p.placed = true; p.item = null; }
        }
      }
    }
    // 电脑
    const pool = U.AIPool;
    let budgetLeft = 7;
    for (const p of G.players) {
      if (p.human || p.placed || !p.item) continue;
      if (p.placeTarget === undefined) {
        const ready = Pl.t > p.placeAt || (p.prevBot && (p.prevBot.placed || p.prevBot.placeTarget === null) && Pl.t > p.placeAt * 0.5);
        if (ready && !p.placeReq) {
          p.placeReq = true;
          if (pool && pool.ok) {
            const round = G.round;
            pool.request({ type: 'place', world: G.world, pid: p.idx, itemType: p.item.type, diff: G.settings.diff }, (res) => {
              if (G.round !== round || G.state !== 'place' || p.placed) return;
              p.placeTarget = res.target || null;
              if (res.analysis && !G.aiAnalysis) G.aiAnalysis = res.analysis;
            });
          } else {
            p.placeJob = U.AI.placeJob(G, p, p.item.type, G.settings.diff);
          }
        }
        if (p.placeJob && budgetLeft > 0) {
          const t0 = performance.now();
          const end = t0 + budgetLeft;
          let r;
          while (performance.now() < end) {
            r = p.placeJob.next();
            if (r.done) { p.placeTarget = r.value || null; p.placeJob = null; break; }
          }
          budgetLeft -= performance.now() - t0;
        }
        // 思考时光标四处晃
        p.cursor.x += Math.sin(G.time * 1.3 + p.idx * 2) * dt * 3;
        p.cursor.y += Math.cos(G.time * 1.1 + p.idx) * dt * 2;
        continue;
      }
      if (p.placeTarget === null) { p.placed = true; p.item = null; continue; }
      const tg = p.placeTarget;
      if (tg.rot !== p.item.rot && p.item.type !== 'bomb') {
        p.rotT = (p.rotT || 0) + dt;
        if (p.rotT > 0.25) { p.rotT = 0; p.item.rot = nextRot(p.item.type, p.item.rot); A.play('rotate'); if (DEFS[p.item.type].directional || DEFS[p.item.type].rotMode === 'flip') p.item.rot = tg.rot; }
      }
      const fp = footprint(p.item.type, tg.rot);
      const tx = tg.gx + fp.w / 2, ty = tg.gy + fp.h / 2;
      const dx = tx - p.cursor.x, dy = ty - p.cursor.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.min(d, (6 + d * 2.5) * dt);
      if (d > 0.01) { p.cursor.x += (dx / d) * sp; p.cursor.y += (dy / d) * sp; }
      if (d < 0.05) {
        p.botWait -= dt;
        if (p.botWait <= 0) {
          p.item.rot = tg.rot;
          if (!G.tryPlace(p)) {
            const nv = nearestValid(p, 3);
            if (nv) { p.placeTarget = { gx: nv.gx, gy: nv.gy, rot: tg.rot }; p.botWait = 0.15; }
            else { p.placed = true; p.item = null; }
          }
        }
      }
    }
    const all = G.players.every((p) => p.placed);
    if (all && Pl.doneT == null) Pl.doneT = Pl.t;
    if (Pl.doneT != null && Pl.t - Pl.doneT > 0.8) G.enterRun();
  }

  // ---------------- 奔跑 ----------------
  G.enterRun = function () {
    G.state = 'run';
    G.stateT = 0;
    G.run = { t: 0, started: false, readyT: 0, acc: 0, order: [], deaths: [], endT: null, fast: false, goT: null, allHumansDone: false };
    const maxP = Math.max(...G.players.map((q) => q.pts));
    const minP = Math.min(...G.players.map((q) => q.pts));
    for (const it of G.world.coins) { it.taken = false; it.carrier = -1; it.hidden = false; }
    G.world.circuitMarks = new Map();
    G.players.forEach((p, k) => {
      const sp = G.level.spawns[k];
      p.body = U.Physics.newBody(sp.x, sp.y);
      p.visible = true;
      p.alive = true;
      p.finished = false;
      p.dead = 0;
      p.killer = -1;
      p.coin = null;
      p.anim = newAnim();
      p.anim.scale = 0;
      p.spawnT = k * 0.12;
      p.underdog = G.round > 2 && p.pts === minP && maxP - p.pts >= 1.5;
      p.brain = null;
      p.watch = null;
      if (!p.human) {
        p.brain = new U.AI.RunBrain(p, G.settings.diff);
        p.brain.startPlan(G.world, p.body, 0, p.brain.react);
      }
      FX.ring(sp.x, sp.y - 0.5, 1.2, p.color, 0.4);
    });
    A.play('spawn');
    A.musicMode('run');
  };

  function thinkBrains(ms) {
    const active = G.players.filter((p) => p.brain && p.brain.state === 'planning');
    if (!active.length) return;
    const each = ms / active.length;
    for (const p of active) p.brain.think(each);
  }

  function humanInput(p) {
    const inp = U.Input.get(p.slot);
    let sprint = inp.sprint;
    if (U.Input.touchMode && Math.abs(inp.x) > 0.8) sprint = true;
    if (G.settings.autoSprint && !inp.sprint) sprint = true;
    return { x: inp.x, jump: inp.jump, sprint };
  }

  function simStep() {
    const R = G.run;
    const world = G.world;
    for (const p of G.players) {
      if (!p.alive || p.finished) continue;
      const b = p.body;
      let inp;
      if (p.human) inp = humanInput(p);
      else inp = p.brain.input(world, b, R.t);
      U.Physics.step(b, inp, world, R.t, 0);
      if (p.brain) p.brain.afterStep(world, b, R.t + DT);
      handleEvents(p, b);
      if (!p.alive || p.finished) continue;
      // 电路板标记
      const marked = world.markCircuit(b, p.idx);
      if (marked.length) {
        for (const idx of marked) if (Math.random() < 0.6) FX.pixels(idx % W, (idx / W) | 0, p.color, 1);
        A.play('circuit');
      }
      // 金币
      if (!p.coin) {
        for (const c of world.coins) {
          if (c.taken) continue;
          const cx = c.gx + 0.5, cy = c.gy + 0.5;
          if (U.util.circleRect(cx, cy, 0.42, b.x - 0.35, b.y - 0.92, b.x + 0.35, b.y)) {
            c.taken = true; c.carrier = p.idx; c.hidden = true; p.coin = c;
            A.play('coin');
            FX.sparks(cx, cy, 10, '#ffd95a');
            FX.text(cx, cy - 0.6, '金币!', '#ffd95a', 0.8);
            break;
          }
        }
      }
    }
    R.t += DT;
  }

  function handleEvents(p, b) {
    const ev = b.ev;
    if (!ev && !b.sliding) return;
    const a = p.anim;
    if (ev & EV.JUMP) { A.play('jump'); FX.dust(b.x, b.y, 4, 0.8); a.sx = 0.82; a.sy = 1.2; }
    if (ev & EV.WALLJUMP) { A.play('walljump'); FX.sparks(b.x - b.facing * 0.35, b.y - 0.5, 5, '#ffffff', b.facing); a.sx = 0.85; a.sy = 1.15; }
    if (ev & EV.LAND) {
      const v = b.impact || 0;
      if (v > 6) { A.play('land', v); FX.dust(b.x, b.y, Math.min(10, 2 + v / 2), 1); }
      a.sx = 1 + Math.min(0.28, v / 60); a.sy = 1 - Math.min(0.25, v / 70);
    }
    if (ev & EV.BOUNCE) {
      A.play('bounce');
      const id = G.world.occ[b.bounceCell];
      const it = G.world.items.find((q) => q.id === id);
      if (it) it.bounceT = G.time;
      a.sx = 0.75; a.sy = 1.3;
    }
    if (b.sliding && Math.random() < 0.3) {
      FX.sparks(b.x + (b.wall || 0) * 0.36, b.y - 0.3, 1, '#dde6f5');
      A.play('slide');
    }
    if (ev & EV.DIE) killPlayer(p);
    if (ev & EV.GOAL) finishPlayer(p);
  }

  function killPlayer(p) {
    const b = p.body;
    p.alive = false;
    p.dead = b.dead;
    p.killer = b.killer;
    p.visible = false;
    G.run.deaths.push({ pid: p.idx, cause: b.dead, killer: b.killer, t: G.run.t });
    const c = U.Chars.CHARS[p.char];
    const dy = b.dead === CAUSE.FALL ? Math.min(b.y - 1, H + 0.2) : b.y - 0.5;
    FX.death(b.x, dy, c.particle, p.char);
    FX.text(b.x, dy - 1.2, CAUSE_TEXT[b.dead] || '挂了', '#ffffff', 0.7);
    A.play('death');
    if (p.coin) {
      const coin = p.coin;
      coin.taken = false; coin.hidden = false; coin.carrier = -1;
      FX.sparks(coin.gx + 0.5, coin.gy + 0.5, 6, '#ffd95a');
      p.coin = null;
    }
  }

  function finishPlayer(p) {
    const R = G.run;
    p.finished = true;
    R.order.push(p.idx);
    p.finishT = G.time;
    p.anim.state = 'win';
    const b = p.body;
    A.play('goal');
    FX.confetti(b.x, b.y - 0.8, 36);
    const first = R.order.length === 1;
    FX.text(b.x, b.y - 2.2, first ? '第一!' : '终点!', first ? '#ffd23f' : '#ffffff', 0.95);
  }

  function updateRun(dt) {
    const R = G.run;
    // 出生动画
    for (const p of G.players) {
      if (p.alive && !p.finished && p.anim.scale < 1) {
        p.spawnT -= dt;
        if (p.spawnT <= 0) p.anim.scale = Math.min(1, p.anim.scale + dt * 5);
      }
    }
    if (!R.started) {
      R.readyT += dt;
      thinkBrains(10);
      const planning = G.players.some((p) => p.brain && p.brain.state === 'planning' && p.brain.planStartT <= 0.95);
      if (R.readyT > 1.2 && (!planning || R.readyT > 4)) {
        R.started = true;
        R.goT = G.time;
        A.play('go');
      } else if (!R.readySound && R.readyT > 0.2) {
        R.readySound = true;
        A.play('ready');
      }
      return;
    }
    thinkBrains(6);
    const speed = R.fast ? 3 : 1;
    R.acc += dt * speed;
    let steps = 0;
    while (R.acc >= DT && steps < 12) {
      simStep();
      R.acc -= DT;
      steps++;
    }
    if (R.acc > DT * 4) R.acc = 0;
    // 放弃的电脑：冲进坑里；看门狗：长时间没有进展也放弃
    for (const p of G.players) {
      if (!p.brain || !p.alive || p.finished) continue;
      const br = p.brain;
      const wd = p.watch || (p.watch = { x: p.body.x, y: p.body.y, t: R.t });
      if (Math.hypot(p.body.x - wd.x, p.body.y - wd.y) > 0.6) { wd.x = p.body.x; wd.y = p.body.y; wd.t = R.t; }
      const idleFor = R.t - wd.t;
      if ((br.state === 'stuck' && br.stuckT > 1.5) || (idleFor > 4 && br.state !== 'giveup' && br.state !== 'planning')) {
        br.state = 'giveup';
        br.giveUpT = R.t;
        br.giveUpDir = p.body.x < 20 ? 1 : p.body.x > 26 ? -1 : 1;
        FX.text(p.body.x, p.body.y - 2, '我放弃…', '#dfe8ff', 0.6);
      }
      if (br.state === 'giveup' && R.t - br.giveUpT > 3) {
        p.body.dead = CAUSE.FALL;
        p.body.killer = -1;
        killPlayer(p);
      }
    }
    const active = G.players.filter((p) => p.alive && !p.finished);
    R.allHumansDone = G.players.every((p) => !p.human || !p.alive || p.finished);
    if (!active.length || R.t > U.C.RUN_TIME_LIMIT) {
      if (R.endT == null) {
        R.endT = G.time;
        if (R.t > U.C.RUN_TIME_LIMIT) {
          for (const p of active) { p.alive = false; p.timeout = true; }
          G.banner = { text: '时间到!', t: 0, color: '#ffd23f' };
        }
      }
    }
    if (R.endT != null && G.time - R.endT > 1.4) G.enterScore();
    // 动画
    for (const p of G.players) if (p.visible) updateAnim(p, dt);
    // 到达终点后消失
    for (const p of G.players) {
      if (p.finished && p.visible && G.time - p.finishT > 1.1) {
        p.visible = false;
        FX.confetti(p.body.x, p.body.y - 0.6, 18);
        FX.ring(p.body.x, p.body.y - 0.5, 1.5, p.color);
      }
    }
  }

  function updateAnim(p, dt) {
    const a = p.anim, b = p.body;
    a.sx = lerp(a.sx, 1, 1 - Math.exp(-dt * 14));
    a.sy = lerp(a.sy, 1, 1 - Math.exp(-dt * 14));
    a.blinkT -= dt;
    if (a.blinkT < 0) { a.blink = true; if (a.blinkT < -0.12) { a.blink = false; a.blinkT = 2 + Math.random() * 3; } }
    if (p.finished) { a.state = 'win'; a.facing = 1; return; }
    if (b.sliding && b.wall) {
      a.state = 'slide';
      a.facing = -b.wall;
    } else if (!b.onGround) {
      a.state = b.vy < 0 ? 'jump' : 'fall';
      if (Math.abs(b.vx) > 0.5) a.facing = Math.sign(b.vx);
    } else if (Math.abs(b.vx) > 0.4) {
      a.state = 'run';
      a.phase += Math.abs(b.vx) * dt * 2.3;
      a.facing = b.facing;
    } else {
      a.state = 'idle';
      a.facing = b.facing;
    }
    a.tilt = a.state === 'run' ? clamp(b.vx * 0.012, -0.12, 0.12) : a.state === 'slide' ? -b.wall * 0.1 : 0;
    a.look = 0.6;
  }

  // ---------------- 计分 ----------------
  G.enterScore = function () {
    G.state = 'score';
    G.stateT = 0;
    const R = G.run;
    const n = G.players.length;
    const finishers = G.players.filter((p) => p.finished);
    const gc = finishers.length;
    let verdict = null;
    if (gc === 0) verdict = 'nowin';
    else if (gc === n && n > 1) verdict = 'tooeasy';
    const segs = G.players.map(() => []);
    const add = (pid, cat, v) => segs[pid].push({ cat, v });
    if (!verdict) {
      for (const p of finishers) {
        add(p.idx, 'goal', PTS.goal);
      }
      if (gc >= 2) add(R.order[0], 'first', PTS.first);
      if (gc === 1 && n >= 3) add(finishers[0].idx, 'solo', PTS.solo);
      for (const d of R.deaths) {
        if (d.killer >= 0 && d.killer !== d.pid && d.killer < n) add(d.killer, 'trap', PTS.trap);
      }
      for (const p of finishers) if (p.coin) add(p.idx, 'coin', PTS.coin);
      for (const p of finishers) if (p.underdog) add(p.idx, 'comeback', PTS.comeback);
    } else if (verdict === 'tooeasy') {
      for (const p of finishers) if (p.coin) add(p.idx, 'coin', PTS.coin);
    }
    // 金币被带到终点：永久移除
    for (const p of finishers) {
      if (p.coin) { G.world.remove(p.coin); p.coin = null; }
    }
    for (const it of G.world.coins) { it.taken = false; it.hidden = false; }
    const before = G.players.map((p) => p.pts);
    const order = [];
    segs.forEach((list, pid) => list.forEach((s) => order.push({ pid, ...s })));
    // 按类别顺序播放
    const catOrder = ['goal', 'first', 'solo', 'trap', 'coin', 'comeback'];
    order.sort((a, b) => catOrder.indexOf(a.cat) - catOrder.indexOf(b.cat) || a.pid - b.pid);
    G.score = { t: 0, verdict, segs, order, before, shown: 0, doneT: null, applied: false };
    for (let i = 0; i < n; i++) {
      const got = segs[i].reduce((s, q) => s + q.v, 0);
      G.players[i].dryRounds = got > 0 ? 0 : G.players[i].dryRounds + 1;
    }
    G.lastVerdict = verdict;
    A.musicMode('score');
    if (verdict === 'tooeasy') { G.banner = { text: '太简单了!', sub: '所有人都到了终点，本回合不计分', t: 0, color: '#7fd3ff' }; A.play('tooEasy'); }
    else if (verdict === 'nowin') { G.banner = { text: '没有赢家!', sub: '没人到达终点，本回合不计分', t: 0, color: '#ff8a7a' }; A.play('tooEasy'); }
    else G.banner = null;
  };

  function applyScore() {
    const S = G.score;
    if (S.applied) return;
    S.applied = true;
    S.segs.forEach((list, pid) => {
      const p = G.players[pid];
      for (const s of list) {
        p.pts = Math.round((p.pts + s.v) * 100) / 100;
        p.breakdown[s.cat] = Math.round((p.breakdown[s.cat] + s.v) * 100) / 100;
      }
    });
  }

  function updateScore(dt) {
    const S = G.score;
    S.t += dt;
    const start = 1.0, per = 0.42;
    const shouldShow = Math.max(0, Math.floor((S.t - start) / per) + 1);
    while (S.shown < Math.min(shouldShow, S.order.length)) {
      const seg = S.order[S.shown];
      A.play('segment', Math.min(8, S.shown));
      S.shown++;
      if (seg.cat === 'trap') A.play('tick', 2);
    }
    if (S.shown >= S.order.length && S.doneT == null && S.t > start) S.doneT = S.t;
    if (S.doneT != null) {
      applyScore();
      const wantAdvance = G.anyConfirm();
      if ((S.t - S.doneT > 1.0 && wantAdvance) || S.t - S.doneT > 4.2) G.afterScore();
    }
  }

  G.anyConfirm = function () {
    const r = G._confirmFlag;
    G._confirmFlag = false;
    let k = false;
    for (let s = 0; s < 2; s++) if (U.Input.pressed(s, 'confirm') || U.Input.pressed(s, 'jump')) k = true;
    return r || k;
  };
  G.confirm = function () {
    G._confirmFlag = true;
  };

  G.afterScore = function () {
    applyScore();
    G.banner = null;
    const win = G.settings.win;
    const over = G.players.filter((p) => p.pts >= win - 1e-9);
    if (over.length) {
      over.sort((a, b) => b.pts - a.pts);
      if (over.length === 1 || over[0].pts > over[1].pts + 1e-9) {
        G.enterWin(over[0]);
        return;
      }
    }
    G.nextRound();
  };

  // ---------------- 胜利 ----------------
  G.enterWin = function (p) {
    G.state = 'win';
    G.stateT = 0;
    G.winner = p;
    G.win = { t: 0 };
    A.play('fanfare');
    A.musicMode('menu');
    if (U.UI && U.UI.onWin) U.UI.onWin(p);
  };

  // ---------------- 主更新 ----------------
  G.update = function (dt) {
    G.time += dt;
    G.stateT += dt;
    if (G.banner) G.banner.t += dt;
    switch (G.state) {
      case 'intro':
        if (G.stateT > 2.1) G.nextRound();
        break;
      case 'shift':
        G.transition.t += dt;
        if (G.transition.t > G.transition.dur) { G.transition = null; G.enterBox(); }
        break;
      case 'box': updateBox(dt); break;
      case 'place': updatePlace(dt); break;
      case 'run': updateRun(dt); break;
      case 'score': updateScore(dt); break;
      case 'win': G.win.t += dt; break;
      default: break;
    }
    // 镜头
    const Rn = U.Render;
    if (G.state === 'run') {
      const pts = G.players.filter((p) => p.visible).map((p) => ({ x: p.body.x, y: p.body.y - 0.5 }));
      if (pts.length) Rn.target = Rn.followView(pts);
      else if (!G.run.started) Rn.target = Rn.fullView();
    } else {
      Rn.target = Rn.fullView();
    }
  };

  U.Game = G;
})(window.UCH);
