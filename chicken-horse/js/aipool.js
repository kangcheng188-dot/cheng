/* 后台计算线程池（不可用时自动退回主线程分时计算） */
'use strict';
(function (U) {
  const Pool = {
    workers: [],
    ok: false,
    seq: 0,
    cbs: new Map(),
    load: [],
    uidSeq: 1,
  };

  Pool.init = function () {
    if (typeof Worker === 'undefined' || /[?&]noworker/.test(location.search)) return;
    try {
      const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
      let url;
      const inline = document.getElementById('uch-worker-src');
      if (inline) url = URL.createObjectURL(new Blob([inline.textContent], { type: 'text/javascript' }));
      else url = new URL('js/ai_worker.js', location.href).href;
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        const idx = i;
        w.onmessage = (e) => Pool.onMessage(idx, e.data);
        w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); Pool.fail(idx); };
        Pool.workers.push(w);
        Pool.load.push(0);
      }
      // 探测：收到 pong 才启用
      Pool.workers.forEach((w) => w.postMessage({ type: 'ping', id: 0 }));
    } catch (_) {
      Pool.workers = [];
      Pool.ok = false;
    }
  };

  Pool.onMessage = function (idx, m) {
    if (m.type === 'pong') { Pool.ok = true; return; }
    Pool.load[idx] = Math.max(0, Pool.load[idx] - 1);
    const cb = Pool.cbs.get(m.id);
    Pool.cbs.delete(m.id);
    if (m.error) console.warn('AI worker error', m.error);
    if (cb) cb(m);
  };

  Pool.fail = function (idx) {
    Pool.load[idx] = 1e9;
    if (Pool.load.every((l) => l >= 1e9)) Pool.ok = false;
  };

  Pool.serializeWorld = function (world) {
    if (!world.uid) world.uid = Pool.uidSeq++;
    return {
      uid: world.uid,
      version: world.version,
      nextId: world.nextId,
      items: world.items.map((it) => ({ id: it.id, type: it.type, gx: it.gx, gy: it.gy, rot: it.rot, owner: it.owner, cells: it.cells, w: it.w, h: it.h })),
      circuit: [...world.circuitSolid.entries()],
    };
  };

  // msg: {type, world(实例), ...}；cb(result)
  Pool.request = function (msg, cb) {
    if (!Pool.ok) return -1;
    const id = ++Pool.seq;
    msg.id = id;
    msg.world = Pool.serializeWorld(msg.world);
    let best = 0;
    for (let i = 1; i < Pool.workers.length; i++) if (Pool.load[i] < Pool.load[best]) best = i;
    Pool.load[best]++;
    Pool.cbs.set(id, cb);
    Pool.workers[best].postMessage(msg);
    return id;
  };

  Pool.cancel = function (id) {
    Pool.cbs.delete(id);
  };

  U.AIPool = Pool;
})(window.UCH);
