/* ===========================================================
   main.js — 界面、存档、关卡流程
   =========================================================== */
(function (global) {
  'use strict';

  var TW = global.TW;
  var SAVE_KEY = 'tentacle-wars-save-v1';

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------- 存档 ---------------------------- */

  var save = { unlocked: 1, stars: {}, best: {}, sound: true };

  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          save.unlocked = Math.max(1, s.unlocked | 0);
          save.stars = s.stars || {};
          save.best = s.best || {};
          save.sound = s.sound !== false;
        }
      }
    } catch (e) { /* 无痕模式等情况直接用默认值 */ }
  }
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  /* ---------------------------- 启动 ---------------------------- */

  var game, canvas, curLevel = null, isSkirmish = false;
  var lastHud = 0;

  function boot() {
    loadSave();
    canvas = $('game');
    game = new Game(canvas);
    global.game = game;

    game.onEnd = onLevelEnd;
    game.onEvent = function (type) {
      if (type === 'demo-end') startDemo();
    };

    global.Sfx.setEnabled(save.sound);
    $('btn-sound').textContent = save.sound ? '🔊' : '🔈';

    buildLevelGrid();
    bindUI();
    startDemo();
    showScreen('menu');

    layoutOverlay();
    window.addEventListener('resize', function () { game.resize(); updateRotateHint(); });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { game.resize(); updateRotateHint(); }, 240);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game.state === 'playing' && !game.demo) doPause();
    });

    var last = performance.now();
    (function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.update(dt);
      game.draw();
      if (now - lastHud > 90) { lastHud = now; updateHud(); }
      requestAnimationFrame(frame);
    })(last);
  }

  /* ---------------------------- 屏幕切换 ---------------------------- */

  var SCREENS = ['menu', 'levels', 'skirmish', 'howto', 'pause', 'result'];

  function showScreen(name) {
    SCREENS.forEach(function (s) { $(s).classList.toggle('hidden', s !== name); });
    var inGame = (name === null || name === 'pause');
    $('hud').classList.toggle('hidden', !(inGame && curLevel));
    if (name !== null && name !== 'pause') $('tip').classList.add('hidden');
    updateRotateHint();
  }

  /** 竖屏时把整层界面旋转 90°，和画布里的世界朝向对齐 */
  function layoutOverlay() {
    var el = $('overlay');
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    if (game.portrait) {
      el.style.width = h + 'px';
      el.style.height = w + 'px';
      el.style.transform = 'translateX(' + w + 'px) rotate(90deg)';
    } else {
      el.style.width = ''; el.style.height = ''; el.style.transform = '';
    }
  }

  function updateRotateHint() {
    layoutOverlay();
    var show = game && game.portrait && curLevel && game.state === 'playing';
    $('rotate-hint').classList.toggle('hidden', !show);
  }

  /* ---------------------------- 选关界面 ---------------------------- */

  function buildLevelGrid() {
    var grid = $('level-grid');
    grid.innerHTML = '';
    global.LEVELS.forEach(function (lv) {
      var b = document.createElement('button');
      var locked = lv.no > save.unlocked;
      b.className = 'lv' + (locked ? ' locked' : '');
      var st = save.stars[lv.no] || 0;
      b.innerHTML = '<span class="n">' + (locked ? '🔒' : lv.no) + '</span>' +
        '<span class="t">' + lv.name + '</span>' +
        '<span class="s">' + (st ? new Array(st + 1).join('★') : '') + '</span>';
      if (!locked) b.addEventListener('click', function () { global.Sfx.click(); startLevel(lv.no); });
      grid.appendChild(b);
    });
  }

  /* ---------------------------- 关卡流程 ---------------------------- */

  function startDemo() {
    if (curLevel) return;
    game.start(global.makeSkirmish({ enemies: 3, size: 'm', diff: 'n' }), true);
  }

  function startLevel(no) {
    isSkirmish = false;
    curLevel = global.LEVELS[no - 1];
    game.start(curLevel, false);
    showScreen(null);
    showTip(curLevel.hint, 9);
  }

  function startSkirmish(opt) {
    isSkirmish = true;
    curLevel = global.makeSkirmish(opt);
    game.start(curLevel, false);
    showScreen(null);
    showTip(null);
  }

  function backToMenu() {
    curLevel = null;
    startDemo();
    showScreen('menu');
  }

  function starsFor(lv, sec) {
    if (sec <= lv.par) return 3;
    if (sec <= lv.par * 1.7) return 2;
    return 1;
  }

  function onLevelEnd(won, sec) {
    var lv = curLevel;
    $('result-title').textContent = won ? '培养皿已被同化' : '你的菌群灭绝了';
    $('result-title').style.color = won ? '' : '#ff7a6e';

    var st = 0;
    if (won && !isSkirmish) {
      st = starsFor(lv, sec);
      save.stars[lv.no] = Math.max(save.stars[lv.no] || 0, st);
      if (!save.best[lv.no] || sec < save.best[lv.no]) save.best[lv.no] = sec;
      if (lv.no >= save.unlocked && lv.no < global.LEVELS.length) save.unlocked = lv.no + 1;
      persist();
      buildLevelGrid();
    }

    var starEls = $('result-stars').children;
    for (var i = 0; i < 3; i++) starEls[i].className = i < st ? 'on' : '';
    $('result-stars').style.display = (won && !isSkirmish) ? '' : 'none';

    var meta = '用时 ' + fmt(sec);
    if (won && !isSkirmish) {
      meta += ' · 三星线 ' + fmt(lv.par);
      if (save.best[lv.no]) meta += ' · 最佳 ' + fmt(save.best[lv.no]);
    }
    $('result-meta').textContent = meta;

    var hasNext = won && !isSkirmish && lv.no < global.LEVELS.length && lv.no + 1 <= save.unlocked;
    $('btn-next').classList.toggle('hidden', !hasNext);
    if (isSkirmish) $('btn-next').classList.add('hidden');

    showScreen('result');
  }

  function fmt(s) {
    s = Math.round(s);
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }

  function doPause() {
    if (!curLevel || game.state !== 'playing') return;
    game.setPaused(true);
    showScreen('pause');
    $('hud').classList.remove('hidden');
  }
  function doResume() {
    game.setPaused(false);
    showScreen(null);
    updateRotateHint();
  }
  function doRestart() {
    if (!curLevel) return;
    game.start(curLevel, false);
    showScreen(null);
    showTip(curLevel.hint, 7);
  }

  /* ---------------------------- 提示条 ---------------------------- */

  var tipTimer = null;
  function showTip(html, sec) {
    var el = $('tip');
    if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
    if (!html) { el.classList.add('hidden'); return; }
    el.innerHTML = html;
    el.classList.remove('hidden');
    tipTimer = setTimeout(function () { el.classList.add('hidden'); }, (sec || 6) * 1000);
  }

  /* ---------------------------- HUD ---------------------------- */

  function updateHud() {
    if (!curLevel || game.demo) return;
    $('hud-no').textContent = isSkirmish ? '随机对战' : ('关卡 ' + curLevel.no);
    $('hud-name').textContent = curLevel.name;
    $('hud-timer').textContent = fmt(game.elapsed);
    $('hud-objective').textContent = curLevel.winAll ? '占领培养皿中所有细胞' : '同化所有敌方细胞';

    var stats = game.factionStats();
    var total = 0, k;
    for (k in stats) total += stats[k].energy;
    if (total <= 0) return;

    var bar = $('force-bar');
    var order = [1, 2, 3, 4, 5, 0];
    var html = '';
    for (var i = 0; i < order.length; i++) {
      var f = order[i];
      if (!stats[f]) continue;
      var pct = stats[f].energy / total * 100;
      html += '<i style="width:' + pct.toFixed(2) + '%;background:' +
        TW.fcol(f, f === 0 ? 45 : null) + '"></i>';
    }
    bar.innerHTML = html;
  }

  /* ---------------------------- 事件绑定 ---------------------------- */

  function bindUI() {
    function tap(id, fn) {
      var el = $(id);
      if (el) el.addEventListener('click', function (e) { e.preventDefault(); global.Sfx.resume(); global.Sfx.click(); fn(); });
    }

    tap('btn-campaign', function () { showScreen('levels'); });
    tap('btn-skirmish', function () { showScreen('skirmish'); });
    tap('btn-howto', function () { showScreen('howto'); });
    tap('btn-reset-save', function () {
      if (!confirm('确定要清除所有关卡进度吗？')) return;
      save.unlocked = 1; save.stars = {}; save.best = {};
      persist(); buildLevelGrid();
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
      b.addEventListener('click', function () { global.Sfx.click(); showScreen('menu'); });
    });

    // 随机对战选项
    var skOpt = { enemies: 2, size: 'm', diff: 'n' };
    [['sk-enemies', 'enemies'], ['sk-size', 'size'], ['sk-diff', 'diff']].forEach(function (pair) {
      var box = $(pair[0]);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        Array.prototype.forEach.call(box.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        var v = b.getAttribute('data-v');
        skOpt[pair[1]] = pair[1] === 'enemies' ? parseInt(v, 10) : v;
        global.Sfx.click();
      });
    });
    tap('btn-sk-start', function () { startSkirmish(skOpt); });

    tap('btn-pause', doPause);
    tap('btn-resume', doResume);
    tap('btn-pause-restart', doRestart);
    tap('btn-pause-menu', backToMenu);
    tap('btn-restart', doRestart);
    tap('btn-retry', doRestart);
    tap('btn-result-menu', function () {
      curLevel = null; startDemo();
      showScreen(isSkirmish ? 'skirmish' : 'levels');
    });
    tap('btn-next', function () {
      var n = curLevel.no + 1;
      if (n <= global.LEVELS.length) startLevel(n);
      else backToMenu();
    });
    tap('btn-sound', function () {
      save.sound = !save.sound;
      global.Sfx.setEnabled(save.sound);
      $('btn-sound').textContent = save.sound ? '🔊' : '🔈';
      persist();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (game.state === 'playing' && curLevel) doPause();
        else if (game.state === 'paused') doResume();
      } else if (e.key === 'r' || e.key === 'R') {
        if (curLevel && (game.state === 'playing' || game.state === 'paused')) doRestart();
      }
    });

    // 首次交互解锁音频
    ['pointerdown', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function once() {
        global.Sfx.resume();
        window.removeEventListener(ev, once);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
