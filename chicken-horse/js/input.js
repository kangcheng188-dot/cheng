/* 输入：键盘 / 鼠标 / 触屏 / 手柄 → 每名本地玩家的虚拟手柄 */
'use strict';
(function (U) {
  const keys = Object.create(null);
  const pointers = new Map();
  const mouse = { x: 0, y: 0, inside: false, down: false, moved: false };
  let wheel = 0;
  let touchMode = false;
  try {
    touchMode = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && !(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  } catch (_) { /* 忽略 */ }
  let lastTouchTime = 0;
  const handlers = { down: null, move: null, up: null, wheel: null, key: null };

  const SCHEMES = {
    solo: {
      left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
      jump: ['Space', 'KeyW', 'ArrowUp', 'KeyZ', 'KeyK'], sprint: ['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyL'],
      rotate: ['KeyR', 'KeyQ', 'KeyE', 'KeyC'], confirm: ['Space', 'Enter', 'KeyZ', 'KeyK', 'NumpadEnter'],
      pause: [],
    },
    p1: {
      left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
      jump: ['Space', 'KeyW'], sprint: ['ShiftLeft', 'KeyG'], rotate: ['KeyQ', 'KeyE', 'KeyR'], confirm: ['Space'],
      pause: [],
    },
    p2: {
      left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
      jump: ['ArrowUp', 'Enter', 'Numpad0', 'NumpadEnter'], sprint: ['ShiftRight', 'Numpad1', 'Slash'],
      rotate: ['Period', 'Numpad2', 'Delete'], confirm: ['Enter', 'Numpad0', 'NumpadEnter'],
      pause: [],
    },
  };

  const blank = () => ({ x: 0, y: 0, jump: false, sprint: false, rotate: false, confirm: false, pause: false, analog: false });

  // 每个本地人类玩家：{scheme, pad, touch}
  let slots = [{ scheme: 'solo', pad: -1, touch: true }];
  const state = [blank(), blank()];
  const prev = [blank(), blank()];
  // 触屏虚拟摇杆由 UI 写入
  const touchCtrl = { x: 0, y: 0, jump: false, sprint: false };
  let padCache = [];

  // 本帧之前按下过的键（即使已经松开也算一次，避免快速点按被漏掉）
  const latched = new Set();
  function any(list) {
    for (let i = 0; i < list.length; i++) if (keys[list[i]] || latched.has(list[i])) return true;
    return false;
  }

  function readPads() {
    padCache = [];
    if (!navigator.getGamepads) return;
    const gps = navigator.getGamepads();
    for (let i = 0; i < gps.length; i++) {
      const g = gps[i];
      if (!g || !g.connected) continue;
      const b = (n) => !!(g.buttons[n] && (g.buttons[n].pressed || g.buttons[n].value > 0.5));
      let ax = g.axes[0] || 0, ay = g.axes[1] || 0;
      if (Math.abs(ax) < 0.22) ax = 0;
      if (Math.abs(ay) < 0.22) ay = 0;
      if (b(14)) ax = -1;
      if (b(15)) ax = 1;
      if (b(12)) ay = -1;
      if (b(13)) ay = 1;
      padCache.push({
        index: g.index,
        x: ax, y: ay,
        jump: b(0),
        sprint: b(2) || b(7) || b(6),
        rotate: b(1) || b(3) || b(4) || b(5),
        confirm: b(0),
        pause: b(9),
      });
    }
  }

  function update() {
    readPads();
    for (let s = 0; s < 2; s++) {
      Object.assign(prev[s], state[s]);
      const slot = slots[s];
      const o = blank();
      if (slot) {
        const K = SCHEMES[slot.scheme];
        if (K) {
          let x = 0, y = 0;
          if (any(K.left)) x -= 1;
          if (any(K.right)) x += 1;
          if (any(K.up)) y -= 1;
          if (any(K.down)) y += 1;
          o.x = x; o.y = y;
          o.jump = any(K.jump);
          o.sprint = any(K.sprint);
          o.rotate = any(K.rotate);
          o.confirm = any(K.confirm);
          o.pause = any(K.pause);
        }
        // 手柄：单人时任意手柄都给 1P；双人时按序分配
        const pads = slots.length === 1 ? padCache : padCache.filter((p, i) => i === s);
        for (const p of pads) {
          if (p.x) { o.x = p.x; o.analog = true; }
          if (p.y) o.y = p.y;
          o.jump = o.jump || p.jump;
          o.sprint = o.sprint || p.sprint;
          o.rotate = o.rotate || p.rotate;
          o.confirm = o.confirm || p.confirm;
          o.pause = o.pause || p.pause;
        }
        if (slot.touch) {
          if (touchCtrl.x) { o.x = touchCtrl.x; o.analog = true; }
          o.jump = o.jump || touchCtrl.jump;
          o.sprint = o.sprint || touchCtrl.sprint;
        }
      }
      state[s] = o;
    }
    latched.clear();
  }

  function get(s) {
    return state[s] || blank();
  }
  function pressed(s, k) {
    return !!(state[s] && state[s][k] && !prev[s][k]);
  }
  function setSlots(n) {
    slots = n >= 2
      ? [{ scheme: 'p1', pad: 0, touch: true }, { scheme: 'p2', pad: 1, touch: false }]
      : [{ scheme: 'solo', pad: -1, touch: true }];
  }
  function anyPadConnected() {
    return padCache.length > 0;
  }

  function init(canvas) {
    const gameKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (gameKeys.has(e.code)) e.preventDefault();
      if (!keys[e.code] && handlers.key) handlers.key(e.code);
      keys[e.code] = true;
      latched.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      for (const k in keys) keys[k] = false;
      touchCtrl.x = 0; touchCtrl.jump = false; touchCtrl.sprint = false;
    });

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        touchMode = true;
        lastTouchTime = performance.now();
      }
      const ptr = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), type: e.pointerType, button: e.button, role: null, data: null };
      pointers.set(e.pointerId, ptr);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
      if (e.pointerType === 'mouse') { mouse.down = true; mouse.x = p.x; mouse.y = p.y; }
      if (handlers.down) handlers.down(ptr, e);
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (e.pointerType === 'mouse') {
        mouse.x = p.x; mouse.y = p.y; mouse.inside = true; mouse.moved = true;
        if (performance.now() - lastTouchTime > 800) touchMode = false;
      }
      const ptr = pointers.get(e.pointerId);
      if (ptr) {
        ptr.x = p.x; ptr.y = p.y;
        if (handlers.move) handlers.move(ptr, e);
      } else if (handlers.move && e.pointerType === 'mouse') {
        handlers.move({ id: 'hover', x: p.x, y: p.y, type: 'mouse', role: 'hover' }, e);
      }
    });
    const up = (e) => {
      const ptr = pointers.get(e.pointerId);
      if (e.pointerType === 'mouse') mouse.down = false;
      if (ptr) {
        const p = pos(e);
        ptr.x = p.x; ptr.y = p.y;
        pointers.delete(e.pointerId);
        if (handlers.up) handlers.up(ptr, e);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.inside = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      wheel += Math.sign(e.deltaY);
      if (handlers.wheel) handlers.wheel(Math.sign(e.deltaY));
      e.preventDefault();
    }, { passive: false });
    // iOS 双击缩放 / 长按菜单
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('gamepadconnected', () => { U.Input.padJustConnected = true; });
  }

  U.Input = {
    init, update, get, pressed, setSlots, anyPadConnected,
    keys, pointers, mouse, handlers, touchCtrl,
    get touchMode() { return touchMode; },
    set touchMode(v) { touchMode = v; },
    isTouchDevice: () => 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    padJustConnected: false,
  };
})(window.UCH);
