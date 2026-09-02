/* 统一输入层：键鼠（指针锁定）+ 触屏双摇杆 */

export const input = {
  moveX: 0, moveZ: 0,          // -1..1，本地坐标
  lookDX: 0, lookDY: 0,        // 本帧视角增量（弧度前的原始像素）
  fire: false, ads: false, sprint: false,
  jumpEdge: false, reloadEdge: false,
  crouchEdge: false, proneEdge: false,
  pickupEdge: false, throwEdge: false, throwCycleEdge: false,
  swap: 0,                     // 1/2/3 = 槽位，0 = 无
  useItem: null,               // 'bandage' | ...
  pauseEdge: false,
  pointerLocked: false,
  touch: false,
};

const keys = Object.create(null);
let sensK = 0.0022, sensT = 0.0032;

export function getSens() { return { sensK, sensT }; }
export function setSens(k, t) { sensK = k; sensT = t; }

export function resetEdges() {
  input.jumpEdge = input.reloadEdge = input.crouchEdge = input.proneEdge = false;
  input.pickupEdge = input.throwEdge = input.throwCycleEdge = input.pauseEdge = false;
  input.swap = 0; input.useItem = null;
  input.lookDX = 0; input.lookDY = 0;
}

function updateMoveFromKeys() {
  let x = 0, z = 0;
  if (keys['KeyW'] || keys['ArrowUp']) z -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) z += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) x -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) x += 1;
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  if (!stickActive) { input.moveX = x; input.moveZ = z; }
  input.sprint = !!keys['ShiftLeft'] || !!keys['ShiftRight'] || stickSprint;
}

const ITEM_KEYS = { Digit4: 'bandage', Digit5: 'firstaid', Digit6: 'medkit', Digit7: 'energy', Digit8: 'adrenal' };

export function detectTouch() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  input.touch = coarse || (('ontouchstart' in window) && noHover && navigator.maxTouchPoints > 0);
  return input.touch;
}
detectTouch();
/* 桌面误判兜底：真的摸了屏幕就切到触屏 HUD */
addEventListener('touchstart', () => {
  if (!input.touch) { input.touch = true; document.body.classList.remove('desktop'); }
}, { capture: true, passive: true });

export function initInput(canvas, hudRoot, onPause) {
  detectTouch();

  addEventListener('keydown', e => {
    if (e.repeat) { return; }
    keys[e.code] = true;
    if (e.code === 'Space') { input.jumpEdge = true; e.preventDefault(); }
    if (e.code === 'KeyR') input.reloadEdge = true;
    if (e.code === 'KeyC') input.crouchEdge = true;
    if (e.code === 'KeyZ') input.proneEdge = true;
    if (e.code === 'KeyF') input.pickupEdge = true;
    if (e.code === 'KeyG') input.throwEdge = true;
    if (e.code === 'KeyB') input.throwCycleEdge = true;
    if (e.code === 'Digit1') input.swap = 1;
    if (e.code === 'Digit2') input.swap = 2;
    if (e.code === 'Digit3') input.swap = 3;
    if (ITEM_KEYS[e.code]) input.useItem = ITEM_KEYS[e.code];
    if (e.code === 'Escape') { input.pauseEdge = true; onPause && onPause(); }
    updateMoveFromKeys();
  });
  addEventListener('keyup', e => { keys[e.code] = false; updateMoveFromKeys(); });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; updateMoveFromKeys(); input.fire = false; });

  /* 指针锁定 */
  canvas.addEventListener('mousedown', e => {
    if (!input.pointerLocked && !input.touch) {
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.ads = true;
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.ads = false;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    if (!input.pointerLocked) return;
    input.lookDX += e.movementX * sensK;
    input.lookDY += e.movementY * sensK;
  });
  addEventListener('wheel', e => {
    input.swap = e.deltaY > 0 ? -1 : -2;  // -1 下一把 / -2 上一把
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    input.pointerLocked = document.pointerLockElement === canvas;
    if (!input.pointerLocked) { input.fire = false; input.ads = false; }
  });

  initTouch(hudRoot);
}

/* ───────── 触屏 ───────── */
let stickActive = false, stickSprint = false;

function initTouch(root) {
  const stick = root.querySelector('#stick');
  const knob = root.querySelector('#stickKnob');
  const lookZone = root.querySelector('#lookZone');
  let stickId = null, sx = 0, sy = 0;
  const R = 58;

  function stickStart(e, t) {
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    stickActive = true;
    stick.classList.add('on');
  }
  function stickMove(t) {
    let dx = t.clientX - sx, dy = t.clientY - sy;
    const d = Math.hypot(dx, dy);
    const cl = Math.min(d, R);
    const nx = d ? dx / d : 0, ny = d ? dy / d : 0;
    knob.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
    input.moveX = nx * (cl / R);
    input.moveZ = ny * (cl / R);
    stickSprint = (cl / R) > 0.92;
    input.sprint = stickSprint;
  }
  function stickEnd() {
    stickId = null; stickActive = false; stickSprint = false;
    input.moveX = 0; input.moveZ = 0; input.sprint = false;
    knob.style.transform = 'translate(0,0)';
    stick.classList.remove('on');
    updateMoveFromKeys();
  }

  let lookId = null, lx = 0, ly = 0, lookMoved = 0, lookStart = 0;
  root.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      const inStick = t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.42;
      if (inStick && stickId === null) { stickStart(e, t); stickMove(t); e.preventDefault(); }
      else if (lookId === null && !t.target.closest('.btn,.med,.wslot')) {
        lookId = t.identifier; lx = t.clientX; ly = t.clientY; lookMoved = 0; lookStart = performance.now();
      }
    }
  }, { passive: false });

  root.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickMove(t); e.preventDefault(); }
      else if (t.identifier === lookId) {
        const dx = t.clientX - lx, dy = t.clientY - ly;
        input.lookDX += dx * sensT; input.lookDY += dy * sensT;
        lookMoved += Math.abs(dx) + Math.abs(dy);
        lx = t.clientX; ly = t.clientY;
        e.preventDefault();
      }
    }
  }, { passive: false });

  function endTouch(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) stickEnd();
      if (t.identifier === lookId) lookId = null;
    }
  }
  root.addEventListener('touchend', endTouch, { passive: true });
  root.addEventListener('touchcancel', endTouch, { passive: true });

  /* HUD 按钮：按住类 */
  bindHold(root.querySelector('#btnFire'), v => input.fire = v);
  bindHold(root.querySelector('#btnFire2'), v => input.fire = v);
  bindToggle(root.querySelector('#btnAds'), () => input.ads = !input.ads);
  bindTap(root.querySelector('#btnReload'), () => input.reloadEdge = true);
  bindTap(root.querySelector('#btnJump'), () => input.jumpEdge = true);
  bindTap(root.querySelector('#btnCrouch'), () => input.crouchEdge = true);
  bindTap(root.querySelector('#btnProne'), () => input.proneEdge = true);
  bindTap(root.querySelector('#btnPick'), () => input.pickupEdge = true);
  bindTap(root.querySelector('#btnThrow'), () => input.throwEdge = true);
  bindTap(root.querySelector('#btnThrowCycle'), () => input.throwCycleEdge = true);
  root.querySelectorAll('.med').forEach(el => bindTap(el, () => input.useItem = el.dataset.item));
  root.querySelectorAll('.wslot').forEach(el => bindTap(el, () => input.swap = +el.dataset.slot));
}

function stop(e) { e.preventDefault(); e.stopPropagation(); }
export function bindHold(el, set) {
  if (!el) return;
  el.addEventListener('touchstart', e => { stop(e); set(true); el.classList.add('on'); }, { passive: false });
  el.addEventListener('touchend',   e => { stop(e); set(false); el.classList.remove('on'); }, { passive: false });
  el.addEventListener('touchcancel',e => { set(false); el.classList.remove('on'); }, { passive: true });
  el.addEventListener('mousedown',  e => { stop(e); set(true); el.classList.add('on'); });
  addEventListener('mouseup', () => { set(false); el.classList.remove('on'); });
}
export function bindTap(el, fn) {
  if (!el) return;
  let used = false;
  el.addEventListener('touchstart', e => { stop(e); used = true; fn(); el.classList.add('on'); }, { passive: false });
  el.addEventListener('touchend', e => { stop(e); el.classList.remove('on'); }, { passive: false });
  el.addEventListener('click', e => { stop(e); if (used) { used = false; return; } fn(); });
}
export function bindToggle(el, fn) {
  if (!el) return;
  bindTap(el, () => { fn(); el.classList.toggle('on'); });
}
