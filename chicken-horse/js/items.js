/* 道具定义 */
'use strict';
(function (U) {
  const M = U.M;

  // rot: 0=上 1=右 2=下 3=左（顺时针）
  const DIRS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];

  // cat: block 方块 / surface 特殊地面 / hazard 陷阱 / util 功能
  const DEFS = {
    block1: { name: '小木块', cat: 'block', cells: [[0, 0]], mat: M.WOOD, rotatable: false, weight: 7 },
    block2: { name: '木板', cat: 'block', cells: [[0, 0], [1, 0]], mat: M.WOOD, rotatable: true, weight: 8 },
    block3: { name: '长木板', cat: 'block', cells: [[0, 0], [1, 0], [2, 0]], mat: M.WOOD, rotatable: true, weight: 7 },
    blockL: { name: 'L 木块', cat: 'block', cells: [[0, 0], [0, 1], [1, 1]], mat: M.WOOD, rotatable: true, weight: 6 },
    block4: { name: '大木箱', cat: 'block', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], mat: M.WOOD, rotatable: false, weight: 4 },
    ice: { name: '冰块', cat: 'surface', cells: [[0, 0], [1, 0]], mat: M.ICE, rotatable: true, weight: 4 },
    honey: { name: '蜂蜜', cat: 'surface', cells: [[0, 0]], mat: M.HONEY, rotatable: false, weight: 4 },
    conveyor: { name: '传送带', cat: 'surface', cells: [[0, 0], [1, 0], [2, 0]], mat: M.CONVEYOR, rotatable: true, rotMode: 'flip', weight: 3 },
    spring: { name: '弹簧', cat: 'surface', cells: [[0, 0]], mat: M.SPRING, rotatable: true, directional: true, weight: 4 },
    wire: { name: '铁丝网', cat: 'hazard', cells: [[0, 0]], mat: 0, rotatable: false, weight: 6 },
    spikes: { name: '尖刺', cat: 'hazard', cells: [[0, 0]], mat: M.SPIKE, rotatable: true, directional: true, weight: 5 },
    saw: { name: '电锯', cat: 'hazard', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], mat: 0, rotatable: false, weight: 5 },
    crossbow: { name: '弩', cat: 'hazard', cells: [[0, 0]], mat: M.DEVICE, rotatable: true, directional: true, defaultRot: 3, weight: 5 },
    flame: { name: '喷火器', cat: 'hazard', cells: [[0, 0]], mat: M.DEVICE, rotatable: true, directional: true, weight: 4 },
    blackhole: { name: '黑洞', cat: 'hazard', cells: [[0, 0]], mat: 0, rotatable: false, weight: 3 },
    bomb: { name: '炸弹', cat: 'util', cells: [[0, 0]], mat: 0, rotatable: false, weight: 4, instant: true },
    coin: { name: '金币', cat: 'util', cells: [[0, 0]], mat: 0, rotatable: false, weight: 3 },
  };
  for (const k in DEFS) DEFS[k].type = k;

  const TIMING = {
    crossbow: { period: 2.2, first: 1.0, speed: 13, len: 0.9 },
    flame: { period: 3.4, off: 1.6, warn: 0.4, on: 1.4, len: 3 },
    blackhole: { R: 4.5, kill: 0.45, pull: 72 },
    saw: { r: 0.92 },
    bomb: { r: 2.6 },
  };

  // 旋转占格（顺时针 90°×rot）并归一化到 (0,0)
  function footprint(type, rot) {
    const d = DEFS[type];
    let cells = d.cells.map((c) => [c[0], c[1]]);
    if (d.rotatable && d.rotMode !== 'flip' && !d.directional) {
      for (let r = 0; r < (rot & 3); r++) cells = cells.map(([x, y]) => [-y, x]);
    }
    let mx = Infinity, my = Infinity;
    for (const [x, y] of cells) { mx = Math.min(mx, x); my = Math.min(my, y); }
    cells = cells.map(([x, y]) => [x - mx, y - my]);
    let w = 0, h = 0;
    for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
    return { cells, w, h };
  }

  function nextRot(type, rot) {
    const d = DEFS[type];
    if (!d.rotatable) return rot;
    if (d.rotMode === 'flip') return rot === 0 ? 2 : 0;
    if (!d.directional) {
      // 对称形状只在不同形态间切换
      const seen = new Set();
      const key = (r) => JSON.stringify(footprint(type, r).cells.slice().sort());
      seen.add(key(rot));
      for (let i = 1; i <= 4; i++) {
        const r = (rot + i) & 3;
        if (!seen.has(key(r)) || i === 4) return r;
      }
    }
    return (rot + 1) & 3;
  }

  function defaultRot(type) {
    return DEFS[type].defaultRot || 0;
  }

  // 派对盒抽取
  function rollBox(rng, count, round) {
    const keys = Object.keys(DEFS);
    const total = keys.reduce((s, k) => s + DEFS[k].weight, 0);
    const pickOne = () => {
      let r = rng() * total;
      for (const k of keys) {
        r -= DEFS[k].weight;
        if (r <= 0) return k;
      }
      return keys[0];
    };
    const out = [];
    for (let i = 0; i < count; i++) {
      let k = pickOne();
      // 同一种道具最多 2 个
      for (let tries = 0; tries < 8 && out.filter((q) => q === k).length >= 2; tries++) k = pickOne();
      out.push(k);
    }
    // 第一回合至少 2 个方块类，保证能搭桥
    if (round === 1) {
      const blocks = ['block2', 'block3', 'block1', 'blockL', 'block4', 'block3'];
      let n = out.filter((k) => DEFS[k].cat === 'block' || k === 'ice' || k === 'conveyor').length;
      for (let i = 0; n < 2 && i < out.length; i++) {
        const k = out[i];
        if (DEFS[k].cat === 'hazard' || DEFS[k].cat === 'util') {
          out[i] = blocks[Math.floor(rng() * blocks.length)];
          n++;
        }
      }
    }
    // 避免同一盒里炸弹过多
    let bombs = 0;
    for (let i = 0; i < out.length; i++) {
      if (out[i] === 'bomb' && ++bombs > 1) out[i] = 'block2';
    }
    return out;
  }

  U.Items = { DEFS, DIRS, TIMING, footprint, nextRot, defaultRot, rollBox };
})(window.UCH);
