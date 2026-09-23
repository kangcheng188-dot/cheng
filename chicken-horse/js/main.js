/* 启动、菜单、主循环 */
'use strict';
(function (U) {
  const G = U.Game, R = U.Render, IN = U.Input, A = U.Audio, UI = U.UI, FX = U.FX;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);

  // ---------------- 设置 ----------------
  const DEFAULTS = { cpu: 3, diff: 'normal', win: 5, humans: 1, chars: [0, 1] };
  let settings = Object.assign({}, DEFAULTS);
  try {
    const s = JSON.parse(localStorage.getItem('uch_settings') || 'null');
    if (s) settings = Object.assign(settings, s);
  } catch (_) { /* 无存储 */ }
  function saveSettings() {
    try { localStorage.setItem('uch_settings', JSON.stringify(settings)); } catch (_) { /* 无存储 */ }
  }

  // ---------------- 屏幕切换 ----------------
  const screens = ['scr-title', 'scr-setup', 'scr-help', 'scr-pause', 'scr-win'];
  let helpReturn = 'scr-title';
  function show(id) {
    for (const s of screens) $(s).hidden = s !== id;
    const first = id && $(id).querySelector('.btn.primary, .btn.green, .card, .btn');
    if (first && !IN.touchMode) setTimeout(() => first.focus({ preventScroll: true }), 30);
  }
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 1800);
  }

  function updateSoundBtns() {
    const txt = A.muted ? '音效：关' : '音效：开';
    $('btn-sound').textContent = txt;
    $('btn-sound2').textContent = txt;
  }

  // ---------------- 标题展示 ----------------
  function showcase() {
    G.state = 'title';
    G.players = [0, 1, 2, 3].map((c, i) => {
      const sp = G.level.spawns[i];
      const b = U.Physics.newBody(sp.x, sp.y);
      b.facing = 1;
      return {
        idx: i, char: c, color: U.C.PLAYER_COLORS[i], human: false, tag: '', body: b, visible: true,
        anim: { state: 'idle', phase: 0, facing: 1, sx: 1, sy: 1, tilt: 0, look: 0.6, blink: false, blinkT: 1 + Math.random() * 3, scale: 1, hideTag: true },
      };
    });
  }
  function updateShowcase(dt) {
    for (const p of G.players) {
      const a = p.anim;
      a.blinkT -= dt;
      if (a.blinkT < 0) { a.blink = true; if (a.blinkT < -0.12) { a.blink = false; a.blinkT = 2 + Math.random() * 3; } }
      // 偶尔跳一下
      if (Math.random() < dt * 0.25 && p.body.onGround) {
        p.jumpV = -8;
      }
      if (p.jumpV != null) {
        p.body.y += p.jumpV * dt;
        p.jumpV += 40 * dt;
        a.state = p.jumpV < 0 ? 'jump' : 'fall';
        if (p.body.y >= 16) { p.body.y = 16; p.jumpV = null; a.state = 'idle'; a.sx = 1.2; a.sy = 0.82; }
      }
      a.sx += (1 - a.sx) * Math.min(1, dt * 12);
      a.sy += (1 - a.sy) * Math.min(1, dt * 12);
    }
  }

  // ---------------- 选角界面 ----------------
  let picking = 0;
  const cardCanvases = [];
  function buildCards() {
    const box = $('chars');
    box.innerHTML = '';
    U.Chars.CHARS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'card';
      b.type = 'button';
      b.setAttribute('aria-label', c.name);
      const cv = document.createElement('canvas');
      cv.width = 160; cv.height = 160;
      b.appendChild(cv);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = c.name;
      b.appendChild(nm);
      b.addEventListener('click', () => {
        A.unlock();
        A.play('click');
        const other = picking === 0 ? 1 : 0;
        if (settings.humans > 1 && settings.chars[other] === i) settings.chars[other] = settings.chars[picking];
        settings.chars[picking] = i;
        refreshSetup();
      });
      box.appendChild(b);
      cardCanvases.push(cv);
    });
  }
  function drawCards(t) {
    cardCanvases.forEach((cv, i) => {
      const ctx = cv.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const g = ctx.createRadialGradient(80, 90, 10, 80, 90, 80);
      g.addColorStop(0, 'rgba(255,255,255,.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 160, 160);
      ctx.translate(80, 138);
      ctx.scale(92, 92);
      const sel = settings.chars[0] === i || (settings.humans > 1 && settings.chars[1] === i);
      U.Chars.draw(ctx, i, { state: sel ? 'win' : 'idle', t: t + i, facing: 1, look: 0.4 });
    });
  }
  function setSeg(id, val) {
    for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === String(val));
  }
  function refreshSetup() {
    const cards = $('chars').children;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      c.classList.toggle('sel1', settings.chars[0] === i);
      c.classList.toggle('sel2', settings.humans > 1 && settings.chars[1] === i);
      c.querySelectorAll('.badge').forEach((e) => e.remove());
      if (settings.chars[0] === i) { const s = document.createElement('span'); s.className = 'badge b1'; s.textContent = '1P'; c.appendChild(s); }
      if (settings.humans > 1 && settings.chars[1] === i) { const s = document.createElement('span'); s.className = 'badge b2'; s.textContent = '2P'; c.appendChild(s); }
    }
    const maxCpu = 4 - settings.humans;
    if (settings.cpu > maxCpu) settings.cpu = maxCpu;
    if (settings.humans === 1 && settings.cpu < 1) settings.cpu = 1;
    for (const b of $('seg-cpu').querySelectorAll('button')) {
      const v = +b.dataset.v;
      b.disabled = v > maxCpu;
      b.style.opacity = v > maxCpu ? 0.35 : 1;
    }
    setSeg('seg-cpu', settings.cpu);
    setSeg('seg-diff', settings.diff);
    setSeg('seg-win', settings.win);
    setSeg('seg-humans', settings.humans);
    setSeg('seg-picking', picking);
    $('seg-picking').hidden = settings.humans < 2;
    $('humans-note').hidden = settings.humans < 2;
    $('setup-title').textContent = settings.humans > 1 ? '选择角色（1P / 2P）' : '选择你的角色';
    saveSettings();
  }
  function bindSeg(id, key, parse) {
    $(id).addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      A.unlock();
      A.play('click');
      const v = parse(b.dataset.v);
      if (key === 'picking') picking = v;
      else settings[key] = v;
      if (key === 'humans' && v > 1 && settings.chars[1] === settings.chars[0]) settings.chars[1] = (settings.chars[0] + 1) % 4;
      if (key === 'humans' && v === 1) picking = 0;
      refreshSetup();
    });
  }

  // ---------------- 游戏控制 ----------------
  let inGame = false;
  function startGame() {
    A.unlock();
    A.startMusic();
    IN.setSlots(settings.humans);
    inGame = true;
    G.paused = false;
    show(null);
    G.startMatch({ cpu: settings.cpu, diff: settings.diff, win: settings.win, humans: settings.humans, chars: settings.chars.slice() });
    requestWakeLock();
  }
  function toTitle() {
    inGame = false;
    G.paused = false;
    FX.clear();
    G.world = new U.World(G.level);
    G.transition = null;
    G.banner = null;
    showcase();
    show('scr-title');
    A.musicMode('menu');
  }
  function pause(on) {
    if (!inGame || G.state === 'win') return;
    G.paused = on;
    show(on ? 'scr-pause' : null);
    IN.touchCtrl.x = 0; IN.touchCtrl.jump = false; IN.touchCtrl.sprint = false;
    UI.stick = null;
  }
  UI.onPause = () => pause(true);
  UI.onWin = () => {
    setTimeout(() => { if (G.state === 'win') show('scr-win'); }, 1600);
  };

  let wakeLock = null;
  async function requestWakeLock() {
    try { if (navigator.wakeLock && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { wakeLock = null; }
  }
  function tryFullscreen() {
    if (!IN.isTouchDevice()) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (_) { /* 忽略 */ } }).catch(() => {});
    } catch (_) { /* 不支持全屏 */ }
  }

  // ---------------- 键盘 / 手柄菜单导航 ----------------
  function activeScreen() {
    return screens.map($).find((s) => !s.hidden) || (!$('rotate').hidden ? $('rotate') : null);
  }
  function moveFocus(dir) {
    const scr = activeScreen();
    if (!scr) return;
    const items = [...scr.querySelectorAll('button:not([disabled])')].filter((b) => b.offsetParent !== null);
    if (!items.length) return;
    const cur = document.activeElement;
    let i = items.indexOf(cur);
    if (i < 0) { items[0].focus(); return; }
    // 按空间位置找最近的
    const r0 = cur.getBoundingClientRect();
    const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bestD = Infinity;
    for (const b of items) {
      if (b === cur) continue;
      const r = b.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 4) continue;
      const d = along + across * 2.2;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) best.focus();
  }
  IN.handlers.key = (code) => {
    A.unlock();
    const scr = activeScreen();
    if (scr) {
      if (code === 'ArrowLeft' || code === 'KeyA') moveFocus('left');
      else if (code === 'ArrowRight' || code === 'KeyD') moveFocus('right');
      else if (code === 'ArrowUp' || code === 'KeyW') moveFocus('up');
      else if (code === 'ArrowDown' || code === 'KeyS') moveFocus('down');
      else if (code === 'Escape') {
        if (scr.id === 'scr-pause') pause(false);
        else if (scr.id === 'scr-help') show(helpReturn);
        else if (scr.id === 'scr-setup') show('scr-title');
      }
      return;
    }
    if (!inGame) return;
    if (code === 'Escape' || code === 'KeyP') pause(true);
    else if (code === 'KeyF' && G.state === 'run' && G.run && G.run.allHumansDone) G.run.fast = !G.run.fast;
    else if (code === 'KeyM') { A.setMuted(!A.muted); updateSoundBtns(); toast(A.muted ? '已静音' : '声音已打开'); }
  };
  let padPrev = {};
  function pollMenuPad() {
    if (!navigator.getGamepads) return;
    const gps = navigator.getGamepads();
    const now = {};
    for (const g of gps) {
      if (!g) continue;
      const b = (n) => !!(g.buttons[n] && g.buttons[n].pressed);
      now.l = now.l || b(14) || g.axes[0] < -0.6;
      now.r = now.r || b(15) || g.axes[0] > 0.6;
      now.u = now.u || b(12) || g.axes[1] < -0.6;
      now.d = now.d || b(13) || g.axes[1] > 0.6;
      now.a = now.a || b(0);
      now.b = now.b || b(1);
      now.start = now.start || b(9);
    }
    const edge = (k) => now[k] && !padPrev[k];
    const scr = activeScreen();
    if (scr) {
      if (edge('l')) moveFocus('left');
      if (edge('r')) moveFocus('right');
      if (edge('u')) moveFocus('up');
      if (edge('d')) moveFocus('down');
      if (edge('a') && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.click();
      if (edge('b') || edge('start')) {
        if (scr.id === 'scr-pause') pause(false);
        else if (scr.id === 'scr-help') show(helpReturn);
      }
    } else if (inGame && edge('start')) pause(true);
    padPrev = now;
  }

  // ---------------- 横屏提示 ----------------
  let rotateDismissed = false;
  function checkOrientation() {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    $('rotate').hidden = !(IN.isTouchDevice() && portrait && !rotateDismissed);
  }

  // ---------------- 主循环 ----------------
  let last = performance.now();
  let fpsAcc = 0, fpsN = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.016;
    dt = Math.min(dt, 0.05);
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) { U.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    IN.update();
    pollMenuPad();
    const scale = U.timeScale || 1;
    if (!G.paused) {
      if (G.state === 'title') { G.time += dt; updateShowcase(dt); R.target = R.fullView(); }
      else G.update(dt * scale);
      FX.update(dt * scale);
    }
    R.update(dt, G.state === 'run' ? 3.2 : 3.5);
    R.drawWorld(G, G.time);
    UI.draw(G.time);
    if (!$('scr-setup').hidden) drawCards(G.time);
    requestAnimationFrame(frame);
  }

  // ---------------- 启动 ----------------
  function boot() {
    if (U.AIPool) U.AIPool.init();
    R.init($('game'));
    IN.init($('game'));
    UI.init();
    G.init();
    buildCards();
    showcase();
    updateSoundBtns();

    $('btn-play').addEventListener('click', () => { A.unlock(); A.startMusic(); A.play('click'); tryFullscreen(); refreshSetup(); show('scr-setup'); });
    $('btn-help').addEventListener('click', () => { A.unlock(); A.play('click'); helpReturn = 'scr-title'; show('scr-help'); });
    $('btn-help-close').addEventListener('click', () => { A.play('click'); show(helpReturn); });
    $('btn-sound').addEventListener('click', () => { A.unlock(); A.setMuted(!A.muted); updateSoundBtns(); if (!A.muted) { A.startMusic(); A.play('click'); } });
    $('btn-sound2').addEventListener('click', () => { A.setMuted(!A.muted); updateSoundBtns(); });
    $('btn-back').addEventListener('click', () => { A.play('click'); show('scr-title'); });
    $('btn-start').addEventListener('click', () => { A.play('click'); startGame(); });
    $('btn-resume').addEventListener('click', () => pause(false));
    $('btn-restart').addEventListener('click', () => { G.paused = false; startGame(); });
    $('btn-quit').addEventListener('click', () => toTitle());
    $('btn-again').addEventListener('click', () => startGame());
    $('btn-menu').addEventListener('click', () => toTitle());
    $('btn-rotate-ok').addEventListener('click', () => { rotateDismissed = true; checkOrientation(); });
    bindSeg('seg-cpu', 'cpu', (v) => +v);
    bindSeg('seg-diff', 'diff', (v) => v);
    bindSeg('seg-win', 'win', (v) => +v);
    bindSeg('seg-humans', 'humans', (v) => +v);
    bindSeg('seg-picking', 'picking', (v) => +v);
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && inGame && G.state !== 'win') pause(true);
      if (!document.hidden && wakeLock === null && inGame) requestWakeLock();
    });

    // 调试 / 自动测试：?demo=1 全电脑对战
    if (params.get('demo')) {
      settings = Object.assign({}, settings, { humans: 0, cpu: 4 });
      IN.setSlots(1);
      inGame = true;
      show(null);
      U.timeScale = +(params.get('speed') || 1);
      G.startMatch({ humans: 0, cpu: 4, diff: params.get('diff') || 'normal', win: +(params.get('win') || 5), chars: [] });
    } else {
      show('scr-title');
    }
    const hideLoading = () => { $('loading').hidden = true; };
    if (document.fonts && document.fonts.load) {
      Promise.race([
        Promise.all([document.fonts.load('40px "ZCOOL KuaiLe"', '超级鸡马主机架派对盒开始'), document.fonts.load('700 20px "Fredoka"', 'CPU 1P')]),
        new Promise((r) => setTimeout(r, 1500)),
      ]).then(hideLoading, hideLoading);
    } else hideLoading();
    requestAnimationFrame(frame);
  }

  U.App = { startGame, toTitle, pause, settings: () => settings, show };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.UCH);
