/* 电脑玩家后台计算线程：路线规划 / 地图分析 / 放道具决策 */
'use strict';
self.window = self;
if (!self.UCH || !self.UCH.AI) {
  importScripts('util.js', 'level.js', 'items.js', 'physics.js', 'world.js', 'ai.js');
}
(function (U) {
  const level = U.Level.buildMainframe();
  let world = null;
  let worldKey = '';

  function getWorld(w) {
    const key = w.uid + ':' + w.version;
    if (key !== worldKey || !world) {
      world = new U.World(level);
      world.items = w.items.map((it) => Object.assign({}, it));
      world.nextId = w.nextId;
      world.circuitSolid = new Map(w.circuit);
      world.rebuild();
      worldKey = key;
    }
    return world;
  }

  function summarizeAnalysis(an) {
    const out = { hasPath: an.hasPath, pts: an.pts, time: an.time };
    if (an.frontier) out.frontier = an.frontier;
    return out;
  }

  self.onmessage = (e) => {
    const m = e.data;
    try {
      if (m.type === 'ping') {
        self.postMessage({ type: 'pong', id: m.id });
        return;
      }
      const wd = getWorld(m.world);
      if (m.type === 'plan') {
        const p = new U.AI.Planner(wd, m.body, m.t0, m.opts);
        p.run(1e9);
        const res = { type: 'result', id: m.id, found: p.found >= 0, expanded: p.expanded };
        if (res.found) res.path = p.path();
        else {
          const bi = p.bestGround >= 0 ? p.bestGround : p.best;
          res.path = p.path(bi);
        }
        self.postMessage(res);
      } else if (m.type === 'analyze') {
        const an = U.AI.analyze(wd, m.spawn, m.budget);
        self.postMessage({ type: 'result', id: m.id, analysis: summarizeAnalysis(an) });
      } else if (m.type === 'place') {
        const game = { world: wd, level, aiAnalysis: null };
        game.aiAnalysis = summarizeAnalysis(U.AI.analyze(wd, level.spawns[1], 7000));
        const player = { idx: m.pid };
        const job = U.AI.placeJob(game, player, m.itemType, m.diff);
        let r;
        do { r = job.next(); } while (!r.done);
        self.postMessage({ type: 'result', id: m.id, target: r.value || null, analysis: game.aiAnalysis });
      }
    } catch (err) {
      self.postMessage({ type: 'result', id: m.id, error: String(err && err.stack || err) });
    }
  };
})(self.UCH);
