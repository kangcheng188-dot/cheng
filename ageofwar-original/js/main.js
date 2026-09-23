'use strict';
// Age of War (original file edition): loads the original age_of_war.swf, runs it in the small Flash
// player (player.js / render.js / sound.js) and adapts it to phones, tablets and PCs: scaling,
// touch controls (tap = click, drag = scroll the battlefield), a pause button and sound.

// archive.org does not allow cross-site downloads, so outside a bundle the player asks for the file
// once and keeps a copy in the browser's Cache Storage for later visits
const SWF_SOURCES = (window.AOW_SWF_SOURCES || ['age_of_war.swf']);
const SWF_CACHE = 'aowo-swf', SWF_CACHE_KEY = 'age_of_war.swf';
const STAGE_W = 650, STAGE_H = 450, FPS = 40;

const App = {
  cv: document.getElementById('game'),
  ctx: null, dpr: 1, scale: 1, ox: 0, oy: 0,
  touch: false, mouseHidden: false, running: false,
  drag: null, parkTimer: 0, keyTicks: 0,
};
App.ctx = App.cv.getContext('2d', { alpha: false });

const T = (() => {
  const zh = (navigator.language || '').toLowerCase().startsWith('zh');
  return zh ? {
    loading: '正在载入原版游戏文件…', parsing: '正在解析原版素材…', failTitle: '无法载入原版游戏文件',
    failText: '这个版本直接运行 2007 年原版的 age_of_war.swf。请从下面的链接下载这个文件，然后在这里选择它（只需一次，浏览器会记住）：',
    pick: '选择 age_of_war.swf', link: '在 archive.org 下载', rotate: '横过来玩效果更好', go: '继续',
    note: '原作 Louissi · Max Games（2007）。本页只是在浏览器里运行原版文件。',
  } : {
    loading: 'Loading the original game file…', parsing: 'Reading the original art…', failTitle: 'Could not load the original game file',
    failText: 'This edition runs the original 2007 age_of_war.swf. Download it from the link below, then choose it here (only once, your browser keeps it):',
    pick: 'Choose age_of_war.swf', link: 'Download from archive.org', rotate: 'Turn your device sideways', go: 'Continue',
    note: 'Original game by Louissi · Max Games (2007). This page runs the original file in your browser.',
  };
})();

// ------------------------------------------------------------------ loading
async function fetchBytes(url, onProgress) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const total = +r.headers.get('content-length') || 3628478;
  if (!r.body || !r.body.getReader) return new Uint8Array(await r.arrayBuffer());
  const reader = r.body.getReader();
  const chunks = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(Math.min(1, got / total));
  }
  const out = new Uint8Array(got); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
function isSwf(u8) { return u8 && u8.length > 8 && (u8[0] === 0x43 || u8[0] === 0x46) && u8[1] === 0x57 && u8[2] === 0x53; }

function setStatus(text, k) {
  document.getElementById('ltxt').textContent = text;
  document.getElementById('lbar').style.width = Math.round((k || 0) * 100) + '%';
}

async function rememberedSwf() {
  try {
    const r = await (await caches.open(SWF_CACHE)).match(SWF_CACHE_KEY);
    return r ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch (e) { return null; }
}
async function rememberSwf(u8) {
  try { await (await caches.open(SWF_CACHE)).put(SWF_CACHE_KEY, new Response(u8)); } catch (e) { /* private mode etc. */ }
}

async function boot() {
  document.getElementById('lnote').textContent = T.note;
  setStatus(T.loading, 0);
  for (const url of SWF_SOURCES) {
    try {
      const u8 = await fetchBytes(url, (k) => setStatus(T.loading, k * 0.8));
      if (isSwf(u8)) { await start(u8); return; }
    } catch (e) { /* try the next source */ }
  }
  const kept = await rememberedSwf();
  if (isSwf(kept)) { await start(kept); return; }
  showPicker();
}

function showPicker() {
  document.getElementById('load').hidden = true;
  const p = document.getElementById('pick');
  p.hidden = false;
  document.getElementById('ptitle').textContent = T.failTitle;
  document.getElementById('ptext').textContent = T.failText;
  const a = document.getElementById('plink'); a.textContent = T.link;
  document.getElementById('pbtn').textContent = T.pick;
  document.getElementById('pfile').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const u8 = new Uint8Array(await f.arrayBuffer());
    if (!isSwf(u8)) return;
    p.hidden = true; document.getElementById('load').hidden = false;
    rememberSwf(u8);
    await start(u8);
  };
}

async function start(u8) {
  setStatus(T.parsing, 0.85);
  await new Promise(r => setTimeout(r, 30));
  const swf = await SWF.parse(u8);
  Flash.swf = swf;
  await decodeBitmaps(swf);
  setStatus(T.parsing, 1);
  Flash.global = Object.create(null);
  Flash.onSound = (id, info) => Snd.onStartSound(id, info);
  Flash.onStream = (def) => Snd.onStream(def);
  Flash.onStopSounds = () => Snd.stopAll();
  Flash.onURL = (url) => { if (/^https?:/.test(url)) { try { window.open(url, '_blank', 'noopener'); } catch (e) {} } };
  Flash.onMouseHide = (h) => { App.mouseHidden = h; };
  Flash.onAttach = (o, link) => { if (link === 'ennemy') o.cacheKey = () => clipSig(o); else if (link === 'bg') o.cacheKey = () => 'bg'; };
  const root = new Clip(swf.root, null);
  Flash.root = root;
  root.seek(1); runQueue();
  document.getElementById('load').hidden = true;
  App.running = true;
  resize();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ layout
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  App.dpr = Math.min(window.devicePixelRatio || 1, 2);
  App.cv.width = Math.round(w * App.dpr); App.cv.height = Math.round(h * App.dpr);
  App.cv.style.width = w + 'px'; App.cv.style.height = h + 'px';
  const s = Math.min(w / STAGE_W, h / STAGE_H);
  App.scale = s * App.dpr;
  App.ox = Math.round((w - STAGE_W * s) / 2 * App.dpr);
  App.oy = Math.round((h - STAGE_H * s) / 2 * App.dpr);
  if (typeof clearRenderCache === 'function') clearRenderCache();
  document.getElementById('rotate').hidden = !(h > w * 1.1 && App.touch && !App.rotateOk);
  placeToolbar();
}
// the toolbar sits in the black side bar when there is one, otherwise on the ground at bottom left
function placeToolbar() {
  const tb = document.getElementById('tb');
  const s = App.scale / App.dpr;
  const side = App.ox / App.dpr, top = App.oy / App.dpr;
  if (side >= 48) {
    tb.style.flexDirection = 'column';
    tb.style.left = Math.max(6, side / 2 - 17) + 'px';
    tb.style.top = (top + STAGE_H * s / 2 - 52) + 'px';
  } else if (top >= 38) {
    tb.style.flexDirection = 'row';
    tb.style.left = (side + 6) + 'px';
    tb.style.top = (top + STAGE_H * s + 4) + 'px';
  } else {
    tb.style.flexDirection = 'row';
    tb.style.left = (side + 6) + 'px';
    tb.style.top = (top + (STAGE_H - 34) * s - 4) + 'px';
  }
}

// ------------------------------------------------------------------ main loop
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - last; last = now;
  if (dt > 250) dt = 250;
  acc += dt;
  let ticked = false, n = 0;
  while (acc >= 1000 / FPS && n < 4) {
    acc -= 1000 / FPS; n++;
    tick();
    ticked = true;
  }
  if (n >= 4) acc = 0;
  if (ticked) render();
}

function inGame() { return !!(Flash.root && Flash.root.child('game') && Flash.root.child('menu')); }

function tick() {
  if (App.keyTicks > 0 && --App.keyTicks === 0) Flash.keys.delete(32);
  Flash.tick();
  if (App.parkTimer > 0 && --App.parkTimer === 0) parkMouse();
  document.getElementById('bpause').hidden = !(App.touch && inGame());
}

function render() {
  const c = App.ctx;
  R.spent = 0;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000'; c.fillRect(0, 0, App.cv.width, App.cv.height);
  c.save();
  c.beginPath(); c.rect(App.ox, App.oy, STAGE_W * App.scale, STAGE_H * App.scale); c.clip();
  c.fillStyle = cssColor(Flash.swf.bg); c.fillRect(App.ox, App.oy, STAGE_W * App.scale, STAGE_H * App.scale);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // the original replaces the mouse pointer with its own cursor clip; on touch screens it is hidden
  const cur = Flash.root.child('cursor');
  const hideCur = cur && (App.touch || !App.pointerIn);
  if (hideCur) cur.visible = false;
  drawObj(c, Flash.root, [App.scale, 0, 0, App.scale, App.ox, App.oy], null, {});
  if (hideCur) cur.visible = true;
  c.restore();
  App.cv.style.cursor = !App.touch && App.mouseHidden && cur && App.pointerIn ? 'none' : 'default';
}

// ------------------------------------------------------------------ input
function toStage(e) {
  const r = App.cv.getBoundingClientRect();
  return [((e.clientX - r.left) * App.dpr - App.ox) / App.scale, ((e.clientY - r.top) * App.dpr - App.oy) / App.scale];
}
function inStage(x, y) { return x >= 0 && y >= 0 && x <= STAGE_W && y <= STAGE_H; }
// a finger does not hover: after a tap the virtual mouse goes to a neutral spot, so the original's
// hover texts clear and its edge scrolling (mouse near the screen sides) does not keep running
function parkMouse() { Flash.mouseMove(STAGE_W / 2, 64); }

App.cv.addEventListener('pointerdown', (e) => {
  Snd.unlock(); if (!App.soundsPreloaded && Snd.ctx) { App.soundsPreloaded = true; Snd.preloadAll(); }
  App.touch = e.pointerType !== 'mouse';
  App.cv.setPointerCapture && App.cv.setPointerCapture(e.pointerId);
  if (!App.running) return;
  const [x, y] = toStage(e);
  App.pointerIn = inStage(x, y);
  Flash.mouseMove(x, y);
  const onButton = Flash.mouseDown(x, y);
  if (!onButton && App.touch && inGame() && y > 120) {
    const g = Flash.root.child('game');
    App.drag = { x0: x, gx: g.x, moved: 0 };
  }
  e.preventDefault();
});
App.cv.addEventListener('pointermove', (e) => {
  if (!App.running) return;
  const [x, y] = toStage(e);
  if (e.pointerType === 'mouse') { App.touch = false; App.pointerIn = inStage(x, y); }
  if (App.drag) {
    const g = Flash.root.child('game');
    if (g) { App.drag.moved = Math.max(App.drag.moved, Math.abs(x - App.drag.x0)); g.x = Math.max(-350, Math.min(0, App.drag.gx + (x - App.drag.x0))); }
    return;
  }
  if (e.pointerType === 'mouse' || e.buttons) Flash.mouseMove(x, y);
});
App.cv.addEventListener('pointerup', (e) => {
  if (!App.running) return;
  const [x, y] = toStage(e);
  const dragged = App.drag && App.drag.moved > 6;
  App.drag = null;
  if (dragged) { Flash.mouse.down = false; Flash.pressBtn = null; parkMouse(); return; }
  Flash.mouseUp(x, y);
  if (App.touch) { if (y > 120) parkMouse(); else App.parkTimer = 48; }
});
App.cv.addEventListener('pointercancel', () => { App.drag = null; Flash.mouse.down = false; });
App.cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') App.pointerIn = false; });
App.cv.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  Snd.unlock();
  Flash.keys.add(e.keyCode);
  if ([32, 37, 38, 39, 40].includes(e.keyCode)) e.preventDefault();
});
window.addEventListener('keyup', (e) => Flash.keys.delete(e.keyCode));
window.addEventListener('blur', () => Flash.keys.clear());
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (!Snd.ctx) return;
  if (document.hidden) Snd.ctx.suspend(); else Snd.ctx.resume();
});

// toolbar: pause (touch screens have no space bar), sound, fullscreen
document.getElementById('bpause').onclick = () => { Flash.keys.add(32); App.keyTicks = 3; };
const bsnd = document.getElementById('bsnd');
function syncSound() { bsnd.textContent = Snd.muted ? '🔇' : '🔊'; bsnd.setAttribute('aria-label', Snd.muted ? 'Sound off' : 'Sound on'); }
try { Snd.muted = localStorage.getItem('aowo_mute') === '1'; } catch (e) {}
syncSound();
bsnd.onclick = () => { Snd.unlock(); Snd.setMuted(!Snd.muted); try { localStorage.setItem('aowo_mute', Snd.muted ? '1' : '0'); } catch (e) {} syncSound(); };
const bfull = document.getElementById('bfull');
const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
bfull.hidden = !canFull;
bfull.onclick = () => {
  const d = document, el = d.documentElement;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) { const rq = el.requestFullscreen || el.webkitRequestFullscreen; const p = rq && rq.call(el); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); }
  else { const ex = d.exitFullscreen || d.webkitExitFullscreen; if (ex) ex.call(d); }
};
document.getElementById('rtxt').textContent = T.rotate;
document.getElementById('rgo').textContent = T.go;
document.getElementById('rgo').onclick = () => { App.rotateOk = true; document.getElementById('rotate').hidden = true; };

resize();
boot();
