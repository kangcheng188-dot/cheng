/* 世界：地形 + 道具 + 电路板实体格 → 碰撞/陷阱数据 */
'use strict';
(function (U) {
  const M = U.M;
  const { DEFS, DIRS, TIMING, footprint } = U.Items;

  class World {
    constructor(level) {
      this.level = level;
      this.W = U.C.W;
      this.H = U.C.H;
      this.ceilingY = level.ceilingY;
      this.killY = level.killY;
      this.goal = level.goal;
      const N = this.W * this.H;
      this.solid = new Uint8Array(N);
      this.cellDir = new Int8Array(N);
      this.cellOwner = new Int8Array(N);
      this.occ = new Int16Array(N);
      this.wireGrid = new Int16Array(N);
      this.boardMask = new Uint8Array(N);
      for (const b of level.boards) {
        for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) this.boardMask[y * this.W + x] = 1;
      }
      this.items = [];
      this.nextId = 1;
      this.circuitSolid = new Map(); // idx -> 玩家序号（本回合实体格）
      this.circuitMarks = new Map(); // idx -> 玩家序号（本回合经过的格）
      this.saws = [];
      this.holes = [];
      this.flames = [];
      this.bows = [];
      this.coins = [];
      this.version = 0;
      this.rebuild();
    }

    clone() {
      const w = new World(this.level);
      w.items = this.items.map((it) => ({ id: it.id, type: it.type, gx: it.gx, gy: it.gy, rot: it.rot, owner: it.owner, cells: it.cells }));
      w.nextId = this.nextId;
      w.circuitSolid = new Map(this.circuitSolid);
      w.rebuild();
      return w;
    }

    idx(x, y) {
      return y * this.W + x;
    }

    rebuild() {
      const { W, H } = this;
      const terrain = this.level.terrain;
      this.solid.set(terrain);
      this.cellDir.fill(0);
      this.cellOwner.fill(-1);
      this.occ.fill(0);
      this.wireGrid.fill(-1);
      this.saws = [];
      this.holes = [];
      this.flames = [];
      this.bows = [];
      this.coins = [];
      for (const [idx, pid] of this.circuitSolid) {
        this.solid[idx] = M.CIRCUIT;
        this.cellOwner[idx] = pid;
      }
      for (const it of this.items) {
        const d = DEFS[it.type];
        for (const [cx, cy] of it.cells) {
          const i = cy * W + cx;
          this.occ[i] = it.id;
          this.cellOwner[i] = it.owner;
          if (d.mat) this.solid[i] = d.mat;
          if (it.type === 'conveyor') this.cellDir[i] = it.rot === 0 ? 1 : -1;
          else this.cellDir[i] = it.rot;
          if (it.type === 'wire') this.wireGrid[i] = it.owner;
        }
        if (it.type === 'saw') this.saws.push({ x: it.gx + 1, y: it.gy + 1, r: TIMING.saw.r, owner: it.owner, item: it });
        else if (it.type === 'blackhole') {
          const T = TIMING.blackhole;
          this.holes.push({ x: it.gx + 0.5, y: it.gy + 0.5, R: T.R, kill: T.kill, pull: T.pull, owner: it.owner, item: it });
        } else if (it.type === 'flame') this.flames.push({ item: it, owner: it.owner, dir: it.rot });
        else if (it.type === 'crossbow') this.bows.push({ item: it, owner: it.owner, dir: it.rot });
        else if (it.type === 'coin') this.coins.push(it);
      }
      // 射线：弩箭射程、火焰长度
      for (const b of this.bows) {
        const it = b.item;
        const [dx, dy] = DIRS[b.dir];
        b.dx = dx; b.dy = dy;
        b.sx = it.gx + 0.5 + dx * 0.5;
        b.sy = it.gy + 0.5 + dy * 0.5;
        b.range = this.rayEmpty(it.gx, it.gy, dx, dy, 60);
      }
      for (const f of this.flames) {
        const it = f.item;
        const [dx, dy] = DIRS[f.dir];
        const L = Math.min(TIMING.flame.len, this.rayEmpty(it.gx, it.gy, dx, dy, TIMING.flame.len));
        f.len = L;
        const hw = 0.38;
        if (dx === 1) { f.rx0 = it.gx + 1; f.rx1 = it.gx + 1 + L; f.ry0 = it.gy + 0.5 - hw; f.ry1 = it.gy + 0.5 + hw; }
        else if (dx === -1) { f.rx0 = it.gx - L; f.rx1 = it.gx; f.ry0 = it.gy + 0.5 - hw; f.ry1 = it.gy + 0.5 + hw; }
        else if (dy === -1) { f.ry0 = it.gy - L; f.ry1 = it.gy; f.rx0 = it.gx + 0.5 - hw; f.rx1 = it.gx + 0.5 + hw; }
        else { f.ry0 = it.gy + 1; f.ry1 = it.gy + 1 + L; f.rx0 = it.gx + 0.5 - hw; f.rx1 = it.gx + 0.5 + hw; }
        f.dx = dx; f.dy = dy;
      }
      this.version++;
    }

    // 从格子 (gx,gy) 沿方向走，返回遇到实体前的空格数
    rayEmpty(gx, gy, dx, dy, max) {
      let k = 0;
      let x = gx + dx, y = gy + dy;
      while (k < max) {
        if (x < -2 || x >= this.W + 2 || y < this.ceilingY || y >= this.H + 3) return k;
        const inside = x >= 0 && x < this.W && y >= 0 && y < this.H;
        if (inside && this.solid[y * this.W + x]) return k;
        if ((x < 0 || x >= this.W) && y >= 0) return k + 0.5; // 撞到边界墙
        k++;
        x += dx; y += dy;
      }
      return k;
    }

    inRect(cx, cy, r) {
      return cx + 1 > r.x0 && cx < r.x1 && cy + 1 > r.y0 && cy < r.y1;
    }

    canPlace(type, gx, gy, rot) {
      const d = DEFS[type];
      if (d.instant) return gx >= 0 && gy >= 0 && gx < this.W && gy < this.H;
      const fp = footprint(type, rot);
      for (const [x, y] of fp.cells) {
        const cx = gx + x, cy = gy + y;
        if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return false;
        const i = cy * this.W + cx;
        if (this.level.terrain[i]) return false;
        if (this.circuitSolid.has(i)) return false;
        if (this.occ[i]) return false;
        if (this.inRect(cx, cy, this.level.spawnZone)) return false;
        if (this.inRect(cx, cy, this.level.goalZone)) return false;
      }
      return true;
    }

    place(type, gx, gy, rot, owner) {
      const fp = footprint(type, rot);
      const it = {
        id: this.nextId++,
        type, gx, gy, rot, owner,
        cells: fp.cells.map(([x, y]) => [gx + x, gy + y]),
        w: fp.w, h: fp.h,
        born: performance.now(),
      };
      this.items.push(it);
      this.rebuild();
      return it;
    }

    remove(it) {
      const i = this.items.indexOf(it);
      if (i >= 0) this.items.splice(i, 1);
      this.rebuild();
    }

    // 炸弹：清除半径内的所有道具（地形、电路实体格不受影响）
    explode(cx, cy, r) {
      const removed = [];
      this.items = this.items.filter((it) => {
        const hit = it.cells.some(([x, y]) => {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          return dx * dx + dy * dy <= r * r;
        });
        if (hit) removed.push(it);
        return !hit;
      });
      this.rebuild();
      return removed;
    }

    // 电路板标记：返回新点亮的格子
    markCircuit(b, pid) {
      const P = U.Physics.P;
      const x0 = Math.floor(b.x - P.w / 2 + 0.06), x1 = Math.floor(b.x + P.w / 2 - 0.06);
      const y0 = Math.floor(b.y - P.h + 0.06), y1 = Math.floor(b.y - 0.06);
      const out = [];
      for (let y = y0; y <= y1; y++) {
        if (y < 0 || y >= this.H) continue;
        for (let x = x0; x <= x1; x++) {
          if (x < 0 || x >= this.W) continue;
          const i = y * this.W + x;
          if (!this.boardMask[i] || this.solid[i]) continue;
          if (this.circuitMarks.get(i) !== pid) {
            this.circuitMarks.set(i, pid);
            out.push(i);
          }
        }
      }
      return out;
    }

    // 回合切换：旧实体格消失，本回合标记的格子实体化
    materialize() {
      const removed = [...this.circuitSolid.entries()];
      const next = new Map();
      for (const [i, pid] of this.circuitMarks) {
        if (!this.occ[i] && !this.level.terrain[i]) next.set(i, pid);
      }
      this.circuitSolid = next;
      this.circuitMarks = new Map();
      this.rebuild();
      return { removed, added: [...next.entries()] };
    }
  }

  U.World = World;
})(window.UCH);
