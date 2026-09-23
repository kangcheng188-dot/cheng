'use strict';
// Age of War Plus HUD: top status bar (gold, XP, base health, minimap, speed / pause / sound),
// bottom command bar (unit cards, training queue, turrets, upgrades, evolve, special), popups,
// banners, tutorial tips and achievement toasts. Also the small UI kit shared with the menus.

// ------------------------------------------------------------------ UI kit
const UI = {
  gold: '#d6ad52', goldHi: '#ffe7a0', ink: '#1a1206',
  panelTop: 'rgba(40,29,16,0.94)', panelBot: 'rgba(20,14,7,0.94)',
};
function fmt(n) {
  n = Math.floor(n);
  if (n >= 100000) return Math.round(n / 1000) + 'k';
  if (n >= 10000) return (Math.floor(n / 100) / 10) + 'k';
  return String(n);
}
function fmtFull(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function fmtTime(ticks) { const s = Math.floor(ticks / FPS); return T.minutes(Math.floor(s / 60), s % 60); }

function uiText(str, x, y, size, color, opt = {}) {
  text(str, x, y, Object.assign({ font: `${opt.weight || 'bold'} ${size}px ${opt.family || FONT_HUD}`, color, base: opt.base || 'middle' }, opt));
}
function uiPanel(x, y, w, h, opt = {}) {
  const c = G.ctx;
  const r = opt.r || 10;
  if (opt.shadow !== false) { c.fillStyle = 'rgba(0,0,0,0.3)'; rrectPath(x + 2, y + 3, w, h, r); c.fill(); }
  rrect(x, y, w, h, r, linGrad(0, y, 0, y + h, [[0, opt.top || UI.panelTop], [1, opt.bot || UI.panelBot]]), opt.border || UI.gold, opt.lw || 1.5);
  c.strokeStyle = 'rgba(255,235,180,0.12)'; c.lineWidth = 1;
  rrectPath(x + 2.5, y + 2.5, w - 5, h - 5, Math.max(2, r - 2)); c.stroke();
}
const BTN_STYLE = {
  gold: [['#ffe9a0', '#e2b448', '#a5761c'], '#5a3c08', '#2a1a00'],
  dark: [['#5b4630', '#3d2d1a', '#281c0e'], '#c9a24a', '#ffe7a0'],
  red: [['#ff8a70', '#d23a24', '#8a1a0c'], '#4a0c04', '#fff'],
  green: [['#b5f08a', '#4fb52c', '#2a7414'], '#123a06', '#fff'],
  blue: [['#9ad8ff', '#3a8fd8', '#1a4f8a'], '#0a2440', '#fff'],
  grey: [['#8a8a8a', '#5c5c5c', '#3c3c3c'], '#222', '#ccc'],
};
function uiButton(id, x, y, w, h, label, onClick, opt = {}) {
  const c = G.ctx;
  const enabled = opt.enabled !== false;
  const b = { id, x, y, w, h, onClick: enabled ? onClick : (opt.onDisabled || (() => Sfx.play('deny'))), tip: opt.tip };
  buttons.push(b);
  const hv = hovered(b), pr = pressed(b);
  const st = BTN_STYLE[enabled ? (opt.kind || 'gold') : 'grey'];
  const r = opt.r === undefined ? Math.min(10, h / 2.6) : opt.r;
  const oy = pr ? 1.5 : 0;
  c.fillStyle = 'rgba(0,0,0,0.35)'; rrectPath(x + 1, y + 3, w, h, r); c.fill();
  rrect(x, y + oy, w, h, r, linGrad(0, y + oy, 0, y + h + oy, [[0, st[0][0]], [0.45, st[0][1]], [1, st[0][2]]]), st[1], 1.4);
  c.fillStyle = `rgba(255,255,255,${hv && enabled ? 0.28 : 0.16})`;
  rrectPath(x + 3, y + 2 + oy, w - 6, h * 0.42, Math.max(2, r - 3)); c.fill();
  if (opt.icon) opt.icon(x, y + oy, w, h);
  if (label) uiText(label, x + w / 2 + (opt.lx || 0), y + h / 2 + oy + (opt.ly || 0), opt.size || 15, st[2], { align: 'center', family: opt.family, stroke: opt.stroke, sw: opt.sw });
  return b;
}
function coinIcon(x, y, r) {
  circ(x, y, r, linGrad(x - r, y - r, x + r, y + r, [[0, '#fff3a0'], [0.45, '#f2c21c'], [1, '#9a6c00']]), '#5a3c00', Math.max(0.6, r / 7));
  circ(x, y, r * 0.62, null, 'rgba(120,80,0,0.7)', Math.max(0.5, r / 9));
  ell(x - r * 0.3, y - r * 0.35, r * 0.22, r * 0.34, 'rgba(255,255,255,0.7)', null);
}
function starIcon(x, y, r, fill, stroke) {
  const c = G.ctx; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); fs(fill, stroke || '#5a3c00', Math.max(0.8, r / 9));
}
function trophyIcon(x, y, s, on) {
  const g = on ? linGrad(x - 8 * s, y - 8 * s, x + 8 * s, y + 8 * s, [[0, '#fff3a0'], [0.5, '#f2c21c'], [1, '#9a6c00']]) : '#5d574c';
  const st = on ? '#5a3c00' : '#2c2922';
  save(); tr(x, y); scl(s);
  const c = G.ctx;
  c.beginPath(); c.arc(-7, -4, 4, Math.PI * 0.5, Math.PI * 1.5); c.strokeStyle = st; c.lineWidth = 2.6; c.stroke(); c.strokeStyle = on ? '#f2c21c' : '#5d574c'; c.lineWidth = 1.4; c.stroke();
  c.beginPath(); c.arc(7, -4, 4, -Math.PI * 0.5, Math.PI * 0.5); c.strokeStyle = st; c.lineWidth = 2.6; c.stroke(); c.strokeStyle = on ? '#f2c21c' : '#5d574c'; c.lineWidth = 1.4; c.stroke();
  poly([-8, -9, 8, -9, 6, 1, 2, 4, 2, 7, 5, 9, -5, 9, -2, 7, -2, 4, -6, 1], g, st, 1);
  if (on) ell(-3, -5, 1.4, 3, 'rgba(255,255,255,0.7)', null);
  restore();
}
function lockIcon(x, y, s) {
  save(); tr(x, y); scl(s);
  const c = G.ctx; c.beginPath(); c.arc(0, -3, 4, Math.PI, 0); c.strokeStyle = '#8a8478'; c.lineWidth = 1.8; c.stroke();
  rrect(-5.5, -3, 11, 9, 2, '#8a8478', '#3a3630', 0.8);
  restore();
}

// cached unit / turret portraits for the cards
function unitPortrait(id) {
  const key = 'p' + id;
  if (!caches.icons[key]) {
    caches.icons[key] = renderTo(60, 38, scale, () => {
      const c = G.ctx;
      c.beginPath(); c.rect(0, 0, 60, 38); c.clip();
      c.fillStyle = radGrad(30, 30, 2, 34, [[0, 'rgba(255,230,160,0.35)'], [1, 'rgba(255,230,160,0)']]);
      c.fillRect(0, 0, 60, 38);
      const U = UNITS[id];
      const sc = Math.min(32 / U.h, 58 / U.w, 0.85);
      tr(30 - (U.w > 90 ? 4 : 0), 36);
      scl(sc);
      drawShadow(U.w);
      drawUnit(id, { anim: 'idle', f: 10, len: UNITS[id].anim.idle, hit: 0, v: 0, t: 0 });
    });
  }
  return caches.icons[key];
}
const TURRET_ICON = { 1: [0.9, 24, 26], 2: [0.9, 22, 24], 3: [0.62, 32, 30], 4: [0.52, 33, 31], 5: [0.52, 33, 31], 6: [0.3, 9, 25],
  7: [0.72, 23, 26], 8: [0.6, 20, 26], 9: [0.6, 20, 26], 10: [0.85, 22, 25], 11: [0.8, 22, 25], 12: [0.8, 21, 25], 13: [0.9, 21, 25], 14: [0.95, 20, 25], 15: [0.95, 20, 25] };
function turretPortrait(id) {
  const key = 't' + id;
  if (!caches.icons[key]) {
    caches.icons[key] = renderTo(60, 44, scale, () => {
      const c = G.ctx;
      c.beginPath(); c.rect(0, 0, 60, 44); c.clip();
      c.fillStyle = radGrad(30, 26, 2, 34, [[0, 'rgba(255,230,160,0.3)'], [1, 'rgba(255,230,160,0)']]);
      c.fillRect(0, 0, 60, 44);
      const [s, x, y] = TURRET_ICON[id] || [0.8, 22, 25];
      tr(x, y); scl(s);
      drawTurret(id, id === 6 ? 0 : -12, 0, 1);
    });
  }
  return caches.icons[key];
}

// age specific emblem for the special attack button
function specialEmblem(age, x, y, r) {
  const c = G.ctx;
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
  const bg = [null, ['#ff9a3a', '#7a1e08'], ['#bfe6ff', '#3a6a9a'], ['#fff6a0', '#d29a10'], ['#cfe8e0', '#5a7a70'], ['#4a3aa0', '#0a0a2a']][age];
  c.fillStyle = radGrad(x, y - r * 0.3, 1, r * 1.3, [[0, bg[0]], [1, bg[1]]]);
  c.fillRect(x - r, y - r, r * 2, r * 2);
  save(); tr(x, y);
  if (age === 1) {
    for (let i = 0; i < 3; i++) {
      save(); tr(-8 + i * 9, -8 + i * 6 - (i === 1 ? 6 : 0)); rot(0.9);
      poly([-2.5, -3, -14, -1, -14, 1, -2.5, 3], 'rgba(255,220,80,0.9)', null);
      circ(0, 0, 3.6 - i * 0.3, '#6b6358', '#2a2014', 0.8);
      restore();
    }
  } else if (age === 2) {
    for (let i = 0; i < 4; i++) {
      save(); tr(-11 + i * 7, -2 + (i % 2) * 6); rot(1.2);
      pline([-10, 0, 7, 0], '#6a4222', 1.6); poly([7, -2.4, 12, 0, 7, 2.4], '#d8d8d8', '#333', 0.6); poly([-10, 0, -14, -3, -8, 0], '#2f8f2f', null); poly([-10, 0, -14, 3, -8, 0], '#2f8f2f', null);
      restore();
    }
  } else if (age === 3) {
    rect(-3.5, -12, 7, 24, '#fff', '#b07a00', 1); rect(-12, -3.5, 24, 7, '#fff', '#b07a00', 1); rect(-3, -11.5, 6, 23, '#fff', null);
    c.fillStyle = radGrad(0, 0, 0, 16, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); c.fillRect(-16, -16, 32, 32);
  } else if (age === 4) {
    save(); scl(0.42); drawPlane(4, -6, 0); restore();
    for (let i = 0; i < 3; i++) { save(); tr(-6 + i * 6, 6 + i * 3); rot(1.2); ell(0, 0, 3, 1.4, '#4d5a2a', '#222', 0.5); restore(); }
  } else {
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 9; i++) c.fillRect(((i * 37) % 40) - 20, ((i * 23) % 40) - 20, 1, 1);
    c.fillStyle = linGrad(-4, 0, 4, 0, [[0, 'rgba(80,190,255,0)'], [0.5, 'rgba(230,250,255,0.95)'], [1, 'rgba(80,190,255,0)']]);
    c.fillRect(-4, -4, 8, 30);
    save(); tr(0, -9); rot(-0.3);
    rect(-12, -3, 8, 6, '#3a6ab0', '#111', 0.6); rect(4, -3, 8, 6, '#3a6ab0', '#111', 0.6); rect(-4, -4.5, 8, 9, '#d8d8d8', '#111', 0.6);
    restore();
  }
  restore();
  c.restore();
}

function upgradeIcon(key, x, y, s) {
  save(); tr(x, y); scl(s);
  if (key === 'atk') {
    save(); rot(-0.7);
    rect(-2, -16, 4, 22, linGrad(-2, 0, 2, 0, [[0, '#eef2f5'], [1, '#8a96a0']]), '#2a2f33', 0.9);
    poly([-2, -16, 0, -20, 2, -16], '#eef2f5', '#2a2f33', 0.9);
    rect(-7, 5, 14, 3, '#c8a030', '#3a2800', 0.8); rect(-1.6, 8, 3.2, 7, '#6a4222', '#2a1a00', 0.8); circ(0, 16, 2, '#c8a030', '#3a2800', 0.7);
    restore();
    save(); rot(0.7); scl(-1, 1);
    rect(-2, -16, 4, 22, linGrad(-2, 0, 2, 0, [[0, '#eef2f5'], [1, '#8a96a0']]), '#2a2f33', 0.9);
    poly([-2, -16, 0, -20, 2, -16], '#eef2f5', '#2a2f33', 0.9);
    rect(-7, 5, 14, 3, '#c8a030', '#3a2800', 0.8); rect(-1.6, 8, 3.2, 7, '#6a4222', '#2a1a00', 0.8); circ(0, 16, 2, '#c8a030', '#3a2800', 0.7);
    restore();
  } else if (key === 'hp') {
    const c = G.ctx;
    c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(9, -12, 14, -13); c.quadraticCurveTo(15, 6, 0, 17); c.quadraticCurveTo(-15, 6, -14, -13); c.quadraticCurveTo(-9, -12, 0, -16); c.closePath();
    fs(linGrad(0, -16, 0, 17, [[0, '#6fb0ff'], [1, '#1f4f9a']]), '#0a1f40', 1.2);
    rect(-2.2, -9, 4.4, 17, '#fff', null); rect(-7, -3, 14, 4.4, '#fff', null);
  } else {
    blob([-12, 4, -10, -6, -4, -9, 4, -9, 10, -6, 12, 4, 8, 14, -8, 14], linGrad(0, -9, 0, 14, [[0, '#b88a4a'], [1, '#6a4a22']]), '#2a1a06', 1);
    rect(-5, -13, 10, 5, '#8a6230', '#2a1a06', 0.8);
    pline([-6, -9, 6, -9], '#c8a030', 1.6);
    coinIcon(0, 4, 5.5);
  }
  restore();
}

// ------------------------------------------------------------------ HUD
const hudRects = {};

// Paint a HUD region into an offscreen canvas and reuse it until its key (or hover / press state)
// changes. Anything animated every frame is drawn on top by the caller.
function cachedRegion(name, key, x, y, w, h, paint) {
  const old = caches.ui[name];
  let hov = '';
  if (old && Input.over) for (const b of old.buttons) if (Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h) hov = b.id;
  const k = [key, hov, Input.down ? Input.pressId : '', viewW, scale, lang, x, y, w, h].join('|');
  if (!old || old.key !== k) {
    const img = old && old.w === w && old.h === h && old.s === scale ? old.img : makeCanvas(w * scale, h * scale);
    const cx = img.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, img.width, img.height);
    cx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
    cx.lineJoin = 'round'; cx.lineCap = 'round';
    const prev = G.ctx, saved = buttons;
    G.set(cx); buttons = [];
    paint();
    caches.ui[name] = { key: k, img, buttons, w, h, s: scale };
    G.set(prev); buttons = saved;
  }
  const r = caches.ui[name];
  blitAt(r.img, x, y, w, h);
  for (const b of r.buttons) buttons.push(b);
}

function drawHUD() {
  if (S.over) { drawBanners(); return; }
  drawTopBar();
  drawCommandBar();
  if (S.popup === 'turrets') drawTurretPopup();
  if (S.popup === 'upgrades') drawUpgradePopup();
  if (S.mode) drawModeBanner();
  drawCardTip();
  drawBanners();
  drawTutorial();
}

function topLayout() {
  const ux = viewW - 6 - 3 * 38 + 4;
  const L = 226, R = ux - 8, avail = R - L;
  const mw = clamp(avail * 0.46, 140, 280);
  const bw = Math.min(150, (avail - mw - 16) / 2);
  const mx = (L + R) / 2 - mw / 2;
  return { ux, mw, bw, mx };
}

function drawTopBar() {
  const c = G.ctx;
  const Lo = topLayout();
  for (const b of [S.pBase, S.eBase]) {
    if (b.ghost === undefined || b.ghost < b.hp) b.ghost = b.hp;
    else if (b.ghost > b.hp) b.ghost = Math.max(b.hp, b.ghost - Math.max(0.4, (b.ghost - b.hp) * 0.04));
  }
  const need = S.tech < 5 ? EVOLVE_XP[S.tech - 1] : 0;
  const ready = need && S.xp >= need;
  const cf = S.cashFlash > 0 && Math.floor(S.cashFlash / 3) % 2 === 0;
  const key = [Math.floor(S.cash), cf, Math.floor(S.xp), S.tech, S.speed, Settings.sound,
    Math.round(S.pBase.hp), Math.round(S.eBase.hp), Math.round(S.pBase.ghost), Math.round(S.eBase.ghost), S.pBase.max, S.eBase.max].join(',');
  cachedRegion('top', key, 0, 0, viewW, TOP_H + 16, () => paintTopBar(Lo, need, ready, cf));
  hudRects.gold = { x: 6, y: 5, w: 212, h: 42 };
  // animated bits
  if (ready) { c.fillStyle = `rgba(255,255,255,${0.25 + 0.25 * Math.sin(Game.t * 0.2)})`; rrectPath(14, 31, 196, 9, 4.5); c.fill(); }
  const pk = S.pBase.hp / S.pBase.max;
  if (pk <= 0.25 && pk > 0) { c.fillStyle = `rgba(255,0,0,${0.2 + 0.2 * Math.sin(Game.t * 0.3)})`; rrectPath(Lo.mx - 8 - Lo.bw, 21, Lo.bw, 15, 5); c.fill(); }
  drawMinimap(Lo.mx, 6, Lo.mw, 40);
}

function paintTopBar(Lo, need, ready, cf) {
  const c = G.ctx;
  c.fillStyle = linGrad(0, 0, 0, TOP_H + 16, [[0, 'rgba(0,0,0,0.5)'], [0.7, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);
  c.fillRect(0, 0, viewW, TOP_H + 16);
  // gold, age and experience
  uiPanel(6, 5, 212, 42, { r: 9 });
  coinIcon(21, 18, 7.5);
  uiText(fmtFull(S.cash), 33, 18.5, 17, cf ? '#ff5a4a' : '#ffe45a', { stroke: 'rgba(0,0,0,0.6)', sw: 2.5 });
  const cw = c.measureText(fmtFull(S.cash)).width;
  uiText('+' + PASSIVE_INCOME[S.tech] + '/s', 38 + cw, 20, 9, 'rgba(255,228,90,0.65)');
  uiText(T.ageNames[S.tech - 1], 210, 18.5, 11, '#e8d6ae', { align: 'right' });
  const k = need ? clamp(S.xp / need, 0, 1) : 1;
  rrect(13, 30, 198, 11, 5.5, 'rgba(0,0,0,0.55)', 'rgba(255,230,160,0.35)', 1);
  if (k > 0.01) {
    const col = ready ? [[0, '#fff3a0'], [1, '#e2a91c']] : [[0, '#8fe0ff'], [1, '#2a7fdc']];
    rrect(14, 31, 196 * k, 9, 4.5, linGrad(0, 31, 0, 40, col), null);
  }
  uiText(need ? `${T.exp.replace(':', '')} ${fmtFull(S.xp)} / ${fmtFull(need)}` : `${T.exp.replace(':', '')} ${fmtFull(S.xp)} · ${T.xpMax}`, 112, 36, 8.5, '#fff', { align: 'center', stroke: 'rgba(0,0,0,0.7)', sw: 2 });
  // utility buttons on the right: speed, pause, sound
  const ux = Lo.ux;
  uiButton('speed', ux, 8, 34, 34, 'x' + S.speed, cycleSpeed, { kind: S.speed > 1 ? 'gold' : 'dark', size: 13, tip: { text: T.speed } });
  uiButton('pause', ux + 38, 8, 34, 34, '', togglePause, { kind: 'dark', icon: (x, y) => { rect(x + 11, y + 10, 4.5, 14, UI.goldHi, null); rect(x + 18.5, y + 10, 4.5, 14, UI.goldHi, null); } });
  uiButton('sound', ux + 76, 8, 34, 34, '', toggleSound, { kind: 'dark', icon: (x, y) => speakerIcon(x + 17, y + 17, Settings.sound) });
  // base health bars on both sides of the minimap
  baseHealth(S.pBase, Lo.mx - 8 - Lo.bw, Lo.bw, true);
  baseHealth(S.eBase, Lo.mx + Lo.mw + 8, Lo.bw, false);
}

function speakerIcon(x, y, on) {
  poly([x - 8, y - 3, x - 4, y - 3, x + 1, y - 8, x + 1, y + 8, x - 4, y + 3, x - 8, y + 3], UI.goldHi, null);
  const c = G.ctx;
  if (on) {
    c.strokeStyle = UI.goldHi; c.lineWidth = 1.6;
    c.beginPath(); c.arc(x + 1, y, 5, -0.8, 0.8); c.stroke();
    c.beginPath(); c.arc(x + 1, y, 9, -0.8, 0.8); c.stroke();
  } else pline([x + 4, y - 4, x + 10, y + 4], '#ff6a50', 2), pline([x + 10, y - 4, x + 4, y + 4], '#ff6a50', 2);
}

function baseHealth(b, x, w, mine) {
  const c = G.ctx;
  uiText(mine ? (lang === 'zh' ? '我方基地' : 'Your base') : (lang === 'zh' ? '敌方基地' : 'Enemy base'), mine ? x + 2 : x + w - 2, 13, 9.5, mine ? '#bfe8ff' : '#ffc0b0', { align: mine ? 'left' : 'right', stroke: 'rgba(0,0,0,0.6)', sw: 2 });
  const y = 21, h = 15;
  rrect(x, y, w, h, 5, 'rgba(0,0,0,0.6)', 'rgba(255,230,160,0.5)', 1);
  const k = clamp(b.hp / b.max, 0, 1), g = clamp(b.ghost / b.max, 0, 1);
  const x0 = mine ? x + 1 : x + 1 + (w - 2) * (1 - k);
  if (g > k) { c.fillStyle = 'rgba(255,240,200,0.8)'; if (mine) c.fillRect(x + 1 + (w - 2) * k, y + 1, (w - 2) * (g - k), h - 2); else c.fillRect(x + 1 + (w - 2) * (1 - g), y + 1, (w - 2) * (g - k), h - 2); }
  if (k > 0) {
    const col = mine ? (k > 0.5 ? ['#8ff06a', '#2f9a22'] : k > 0.25 ? ['#ffe070', '#c89010'] : ['#ff8a6a', '#c0200c']) : ['#ff7a6a', '#b01e12'];
    rrect(x0, y + 1, (w - 2) * k, h - 2, 4, linGrad(0, y, 0, y + h, [[0, col[0]], [1, col[1]]]), null);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x0 + 2, y + 2, Math.max(0, (w - 2) * k - 4), 3);
  }
  uiText(fmtFull(Math.max(0, Math.round(b.hp))), x + w / 2, y + h / 2 + 0.5, 10, '#fff', { align: 'center', stroke: 'rgba(0,0,0,0.75)', sw: 2.5 });
}

function drawMinimap(x, y, w, h) {
  const c = G.ctx;
  c.fillStyle = 'rgba(8,10,14,0.72)'; rrectPath(x, y, w, h, 7); c.fill();
  c.strokeStyle = 'rgba(255,230,160,0.55)'; c.lineWidth = 1.2; c.stroke();
  const ix = x + 5, iw = w - 10;
  const wx = (v) => ix + (v - ENV_X0) / (ENV_X1 - ENV_X0) * iw;
  const gy = y + h - 7;
  c.fillStyle = 'rgba(120,100,60,0.6)'; c.fillRect(ix, gy, iw, 2);
  // bases
  const ph = 9 + S.addons * 2.5, eh = 9 + S.eaddons * 2.5;
  c.fillStyle = '#4a8fd8'; c.fillRect(wx(-10), gy - ph, wx(160) - wx(-10), ph);
  c.fillStyle = '#d84a3a'; c.fillRect(wx(840), gy - eh, wx(1010) - wx(840), eh);
  // units
  for (const u of S.units) {
    if (u.dead) continue;
    const r = 1.3 + Math.min(2.2, u.w / 60);
    c.fillStyle = u.side === 1 ? '#9fe0ff' : '#ff7a6a';
    c.fillRect(wx(u.x) - r / 2, gy - r - u.h / 69 * 5, r, r + u.h / 69 * 5);
  }
  for (const sp of S.specials) if (sp.kind === 4 || sp.kind === 5) { c.fillStyle = sp.side === 1 ? '#fff' : '#ffb0a0'; c.fillRect(wx(sp.x) - 2, sp.kind === 4 ? y + 8 : gy - 8, 4, 3); }
  // camera window
  const c0 = wx(S.camX), c1 = wx(S.camX + viewW);
  c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(c0, y + 3, c1 - c0, h - 6);
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.2; c.strokeRect(c0, y + 3, c1 - c0, h - 6);
  const setCam = (px) => { S.camX = clampCam(ENV_X0 + (px - ix) / iw * (ENV_X1 - ENV_X0) - viewW / 2); S.pcamX = S.camX; S.camTarget = null; S.inertia = 0; };
  buttons.push({ id: 'mini', x, y, w, h, onDown: setCam, onDrag: setCam, onClick: () => {} });
}

// ------------------------------------------------------------------ command bar
const CARD_W = 62, CARD_H = 54, CARD_Y = BAR_Y + 5;
const QUEUE_X = 8 + 4 * 68 + 4;

function drawCommandBar() {
  const c = G.ctx;
  const ids = unitIdsForAge(S.tech);
  const bw = 56, gap = 6, xs = viewW - 8 - bw;
  const need = S.tech < 5 ? EVOLVE_XP[S.tech - 1] : 1;
  const evoK = S.tech < 5 ? clamp(S.xp / need, 0, 1) : 1;
  const evoReady = S.tech < 5 && S.xp >= need;
  const spReady = S.specTimer >= SPECIAL_COOLDOWN;
  const key = [S.tech, ids.map(id => S.cash >= UNITS[id].cost ? 1 : 0).join(''), S.tray.join(''), S.trainId, S.popup, S.mode,
    usedSpots().length, S.addons, spReady, Math.floor(evoK * 60), evoReady, Input.mouse].join(',');
  hudRects.cards = { x: 8, y: CARD_Y, w: ids.length * 68 - 6, h: CARD_H };
  hudRects.special = { x: xs, y: CARD_Y, w: bw, h: CARD_H };
  hudRects.evolve = { x: xs - bw - gap, y: CARD_Y, w: bw, h: CARD_H };
  hudRects.upgrades = { x: xs - 2 * (bw + gap), y: CARD_Y, w: bw, h: CARD_H };
  hudRects.turrets = { x: xs - 3 * (bw + gap), y: CARD_Y, w: bw, h: CARD_H };
  cachedRegion('bar', key, 0, BAR_Y - 8, viewW, STAGE_H - BAR_Y + 8, () => paintCommandBar(ids, evoK, evoReady, spReady));
  // animated bits: training progress, special cooldown, glows
  if (S.trainTotal > 0) {
    const k = 1 - S.trainTimer / S.trainTotal;
    c.fillStyle = 'rgba(255,220,120,0.28)'; c.fillRect(QUEUE_X + 1, BAR_Y + 42 - 24 * k, 24, 24 * k);
    rrect(QUEUE_X, BAR_Y + 47, 142 * k, 5, 2.5, '#ffb040', null);
  }
  const cx = xs + bw / 2, cy = CARD_Y + 21, r = 17;
  if (!spReady) {
    const k = S.specTimer / SPECIAL_COOLDOWN;
    const oy = pressed({ id: 'special', x: xs, y: CARD_Y, w: bw, h: CARD_H }) ? 1.5 : 0;
    c.fillStyle = 'rgba(0,0,0,0.62)';
    c.beginPath(); c.moveTo(cx, cy + oy); c.arc(cx, cy + oy, r, -Math.PI / 2 + Math.PI * 2 * k, Math.PI * 1.5); c.closePath(); c.fill();
    uiText(String(Math.ceil((SPECIAL_COOLDOWN - S.specTimer) / FPS)), cx, cy + 0.5 + oy, 12, '#fff', { align: 'center', stroke: 'rgba(0,0,0,0.8)', sw: 2.5 });
  }
  c.globalCompositeOperation = 'lighter';
  if (spReady) glowAt('hot', cx, cy, 34 + 5 * Math.sin(Game.t * 0.2), 0.3);
  if (evoReady) glowAt('hot', xs - bw - gap + bw / 2, CARD_Y + 20, 34 + 5 * Math.sin(Game.t * 0.2 + 1), 0.3);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

function paintCommandBar(ids, evoK, evoReady, spReady) {
  const c = G.ctx;
  c.fillStyle = linGrad(0, BAR_Y - 8, 0, STAGE_H, [[0, 'rgba(18,12,6,0)'], [0.14, 'rgba(26,18,10,0.9)'], [1, 'rgba(10,7,3,0.97)']]);
  c.fillRect(0, BAR_Y - 8, viewW, STAGE_H - BAR_Y + 8);
  c.fillStyle = linGrad(0, 0, viewW, 0, [[0, 'rgba(214,173,82,0.1)'], [0.5, 'rgba(240,200,100,0.9)'], [1, 'rgba(214,173,82,0.1)']]);
  c.fillRect(0, BAR_Y - 1, viewW, 1.5);
  // unit cards
  ids.forEach((id, i) => unitCard(id, i, 8 + i * 68, CARD_Y));
  // training queue
  const qx = QUEUE_X;
  uiText(T.queue, qx, BAR_Y + 10, 9, '#bfa77a');
  for (let i = 0; i < 5; i++) {
    const x = qx + i * 29, y = BAR_Y + 17;
    rrect(x, y, 26, 26, 5, i === 0 && S.trainId ? 'rgba(70,52,26,0.95)' : 'rgba(0,0,0,0.45)', S.tray[i] ? UI.gold : 'rgba(214,173,82,0.3)', 1);
    if (S.tray[i]) c.drawImage(unitPortrait(S.tray[i]), x + 1, y + 5, 24, 15.2);
  }
  if (S.trainId) {
    rrect(qx, BAR_Y + 47, 142, 5, 2.5, 'rgba(0,0,0,0.6)', null);
    uiText(T.unitNames[S.trainId], qx + 71, BAR_Y + 57, 8.5, '#e8d6ae', { align: 'center' });
  }
  // right-hand buttons
  const R = hudRects;
  specialButton(R.special.x, CARD_Y, R.special.w, CARD_H, spReady);
  evolveButton(R.evolve.x, CARD_Y, R.evolve.w, CARD_H, evoK, evoReady);
  uiButton('upgrades', R.upgrades.x, CARD_Y, R.upgrades.w, CARD_H, T.upgrades, () => togglePopup('upgrades'), {
    kind: S.popup === 'upgrades' ? 'gold' : 'dark', size: 10, ly: 17, icon: (x, y, w) => upgradeIcon('atk', x + w / 2, y + 20, 0.72),
  });
  const used = usedSpots().length;
  uiButton('turrets', R.turrets.x, CARD_Y, R.turrets.w, CARD_H, T.turrets, () => togglePopup('turrets'), {
    kind: S.popup === 'turrets' || S.mode ? 'gold' : 'dark', size: 10, ly: 17,
    icon: (x, y, w) => { c.drawImage(turretPortrait(turretIdsForAge(S.tech)[0]), x + w / 2 - 21, y + 2, 42, 30.8); uiText(used + '/' + (S.addons + 1), x + w - 5, y + 8, 9, '#fff', { align: 'right', stroke: 'rgba(0,0,0,0.7)', sw: 2 }); },
  });
}

function unitCard(id, i, x, y) {
  const c = G.ctx;
  const U = UNITS[id], ok = S.cash >= U.cost;
  const b = { id: 'u' + id, x, y, w: CARD_W, h: CARD_H, onClick: () => trainUnit(id), tip: { kind: 'unit', id } };
  buttons.push(b);
  const hv = hovered(b), pr = pressed(b);
  const oy = pr ? 1.5 : 0;
  c.fillStyle = 'rgba(0,0,0,0.35)'; rrectPath(x + 1, y + 3, CARD_W, CARD_H, 7); c.fill();
  rrect(x, y + oy, CARD_W, CARD_H, 7, linGrad(0, y, 0, y + CARD_H, [[0, hv ? '#6a5030' : '#4d3820'], [1, '#22170b']]), ok ? UI.gold : '#6b5a3c', 1.4);
  c.drawImage(unitPortrait(id), x + 1, y + 1 + oy, 60, 38);
  rrect(x + 3, y + CARD_H - 15 + oy, CARD_W - 6, 12, 4, 'rgba(0,0,0,0.5)', null);
  coinIcon(x + 11, y + CARD_H - 9 + oy, 4);
  uiText(fmt(U.cost), x + 18, y + CARD_H - 8.5 + oy, 10, ok ? '#ffe45a' : '#a89878');
  if (Input.mouse) uiText(String(i + 1), x + 6, y + 8 + oy, 9, 'rgba(255,240,200,0.6)');
  const n = S.tray.filter(t => t === id).length;
  if (n) { circ(x + CARD_W - 7, y + 7 + oy, 7, '#d23a24', '#fff', 1.2); uiText(String(n), x + CARD_W - 7, y + 7.5 + oy, 9.5, '#fff', { align: 'center' }); }
  if (!ok) { c.fillStyle = 'rgba(0,0,0,0.42)'; rrectPath(x, y + oy, CARD_W, CARD_H, 7); c.fill(); }
}

function evolveButton(x, y, w, h, k, ready) {
  const c = G.ctx;
  const maxed = S.tech >= 5;
  const need = maxed ? 1 : EVOLVE_XP[S.tech - 1];
  uiButton('evolve', x, y, w, h, maxed ? T.xpMax : T.evolveBtn, evolve, {
    kind: ready ? 'gold' : 'dark', enabled: !maxed, size: 10, ly: 17,
    tip: { text: maxed ? T.cantEvolve : T.evolveTo(T.ageNames[S.tech]) + ' (' + fmtFull(need) + ' XP)' },
    icon: (bx, by) => {
      const cx = bx + w / 2, cy = by + 20;
      c.lineWidth = 3.2; c.strokeStyle = 'rgba(0,0,0,0.45)';
      c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = ready ? '#fff3a0' : '#6fc8ff';
      c.beginPath(); c.arc(cx, cy, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
      starIcon(cx, cy, 9.5, ready ? '#ffee40' : maxed ? '#9a9a9a' : '#e8c060');
    },
  });
}

function specialButton(x, y, w, h, ready) {
  const cx = x + w / 2, r = 17;
  uiButton('special', x, y, w, h, T.specialBtn, () => useSpecial(1), {
    kind: ready ? 'gold' : 'dark', size: lang === 'zh' ? 9 : 10, ly: 17,
    tip: { text: ready ? T.specialReady(T.specialName[S.tech - 1]) : T.specialWait(Math.ceil((SPECIAL_COOLDOWN - S.specTimer) / FPS)) },
    icon: (bx, by) => {
      specialEmblem(S.tech, cx, by + 21, r);
      circ(cx, by + 21, r, null, ready ? '#fff3a0' : '#8a7040', 1.6);
    },
  });
}

// ------------------------------------------------------------------ popups
function popupFrame(x, y, w, h, title, sub) {
  uiPanel(x, y, w, h, { r: 12 });
  uiText(title, x + 14, y + 16, 14, UI.goldHi, { family: FONT_SERIF });
  if (sub) uiText(sub, x + 22 + G.ctx.measureText(title).width, y + 16.5, 10.5, '#bfa77a');
  uiButton('pclose', x + w - 30, y + 5, 24, 22, '✕', () => { S.popup = null; Sfx.play('close'); }, { kind: 'dark', size: 12, r: 6 });
  // swallow taps on the panel background
  buttons.splice(buttons.length - 1, 0, { id: 'pbg', x, y, w, h, onClick: () => {} });
}

function drawTurretPopup() {
  const cw = 100, ch = 118, gap = 6;
  const pw = 12 + 3 * (cw + gap) + 104 + 8, ph = 34 + ch + 10;
  const tb = hudRects.turrets;
  const x = clamp(tb.x + tb.w - pw + 40, 6, viewW - pw - 6), y = BAR_Y - ph - 8;
  const ids = turretIdsForAge(S.tech);
  const key = [S.tech, ids.map(id => S.cash >= TURRETS[id].cost ? 1 : 0).join(''), S.addons, S.addons < 3 && S.cash >= SLOT_COST[S.addons], usedSpots().length].join(',');
  cachedRegion('popT', key, x - 2, y - 2, pw + 6, ph + 8, () => paintTurretPopup(x, y, pw, ph, cw, ch, gap));
}
function paintTurretPopup(x, y, pw, ph, cw, ch, gap) {
  popupFrame(x, y, pw, ph, T.turrets, T.slots(S.addons + 1));
  const ids = turretIdsForAge(S.tech);
  ids.forEach((id, i) => turretCard(id, x + 12 + i * (cw + gap), y + 34, cw, ch));
  // spot / sell column
  const cx = x + 12 + 3 * (cw + gap), cy = y + 34;
  const canAdd = S.addons < 3;
  const addCost = canAdd ? SLOT_COST[S.addons] : 0;
  uiButton('addslot', cx, cy, 104, 58, '', addSlot, {
    kind: 'dark', enabled: canAdd,
    icon: (bx, by) => {
      uiText('+ ' + T.addSlot, bx + 52, by + 18, 11, canAdd ? UI.goldHi : '#ccc', { align: 'center' });
      if (canAdd) { coinIcon(bx + 30, by + 39, 5); uiText(fmtFull(addCost), bx + 38, by + 39.5, 11, S.cash >= addCost ? '#ffe45a' : '#ff8a6a'); }
      else uiText(T.cantBuild, bx + 52, by + 39, 9.5, '#ddd', { align: 'center' });
    },
  });
  const anyTurret = usedSpots().length > 0;
  uiButton('sell', cx, cy + 64, 104, 54, T.sell, () => { S.mode = 'sell'; S.popup = null; S.camTarget = ENV_X0; Sfx.play('select'); }, { kind: 'red', enabled: anyTurret, size: 13 });
}

function turretCard(id, x, y, w, h) {
  const c = G.ctx;
  const T0 = TURRETS[id], ok = S.cash >= T0.cost;
  const b = { id: 't' + id, x, y, w, h, onClick: () => chooseTurret(id) };
  buttons.push(b);
  const hv = hovered(b), pr = pressed(b), oy = pr ? 1.5 : 0;
  rrect(x, y + oy, w, h, 8, linGrad(0, y, 0, y + h, [[0, hv ? '#6a5030' : '#4d3820'], [1, '#22170b']]), ok ? UI.gold : '#6b5a3c', 1.3);
  c.drawImage(turretPortrait(id), x + w / 2 - 30, y + 3 + oy, 60, 44);
  uiText(T.turretNames[id], x + w / 2, y + 55 + oy, lang === 'zh' ? 11 : 10, '#fff2d0', { align: 'center' });
  const rate = (FPS / T0.rate * T0.shots.length);
  const stats = [[T.dmg, String(T0.dmg)], [T.range, String(T0.range)], [T.rate, (rate >= 1 ? rate.toFixed(1) : rate.toFixed(2)) + '/s']];
  stats.forEach(([k, v], i) => {
    uiText(k, x + 8, y + 70 + i * 11 + oy, 9, '#bfa77a');
    uiText(v, x + w - 8, y + 70 + i * 11 + oy, 9, '#fff', { align: 'right' });
  });
  rrect(x + 5, y + h - 17 + oy, w - 10, 13, 4, 'rgba(0,0,0,0.5)', null);
  coinIcon(x + 14, y + h - 10.5 + oy, 4.2);
  uiText(fmtFull(T0.cost), x + 21, y + h - 10 + oy, 10, ok ? '#ffe45a' : '#a89878');
  if (!ok) { c.fillStyle = 'rgba(0,0,0,0.4)'; rrectPath(x, y + oy, w, h, 8); c.fill(); }
}

function drawUpgradePopup() {
  const cw = 118, ch = 124, gap = 6;
  const pw = 12 + 3 * (cw + gap) + 6, ph = 34 + ch + 10;
  const ub = hudRects.upgrades;
  const x = clamp(ub.x + ub.w / 2 - pw / 2, 6, viewW - pw - 6), y = BAR_Y - ph - 8;
  const key = [S.tech, UPGRADES.map(U => S.up[U.key] + ':' + (S.cash >= upgradeCost(U.key, S.up[U.key], S.tech) ? 1 : 0)).join('')].join(',');
  cachedRegion('popU', key, x - 2, y - 2, pw + 6, ph + 8, () => paintUpgradePopup(x, y, pw, ph, cw, ch, gap));
}
function paintUpgradePopup(x, y, pw, ph, cw, ch, gap) {
  popupFrame(x, y, pw, ph, T.upgrades, lang === 'zh' ? '对已有和新训练的单位都生效' : 'Applies to current and new units');
  UPGRADES.forEach((U, i) => {
    const cx = x + 12 + i * (cw + gap), cy = y + 34;
    const lvl = S.up[U.key], maxed = lvl >= U.max;
    const cost = maxed ? 0 : upgradeCost(U.key, lvl, S.tech);
    const ok = !maxed && S.cash >= cost;
    const b = { id: 'up' + i, x: cx, y: cy, w: cw, h: ch, onClick: () => buyUpgrade(i) };
    buttons.push(b);
    const hv = hovered(b), oy = pressed(b) ? 1.5 : 0;
    rrect(cx, cy + oy, cw, ch, 8, linGrad(0, cy, 0, cy + ch, [[0, hv ? '#6a5030' : '#4d3820'], [1, '#22170b']]), ok ? UI.gold : '#6b5a3c', 1.3);
    G.ctx.fillStyle = radGrad(cx + cw / 2, cy + 24, 2, 30, [[0, 'rgba(255,230,160,0.35)'], [1, 'rgba(255,230,160,0)']]);
    G.ctx.fillRect(cx, cy, cw, 50);
    upgradeIcon(U.key, cx + cw / 2, cy + 24 + oy, 1);
    uiText(T.upName[U.key], cx + cw / 2, cy + 52 + oy, 12.5, '#fff2d0', { align: 'center', family: FONT_SERIF });
    uiText(T.upDesc[U.key], cx + cw / 2, cy + 68 + oy, 9.5, '#bfa77a', { align: 'center' });
    for (let k = 0; k < U.max; k++) {
      const px = cx + cw / 2 - (U.max - 1) * 8 + k * 16;
      rrect(px - 5, cy + 80 + oy, 10, 7, 2, k < lvl ? linGrad(0, cy + 80, 0, cy + 87, [[0, '#fff3a0'], [1, '#d29a10']]) : 'rgba(0,0,0,0.5)', k < lvl ? '#5a3c00' : 'rgba(214,173,82,0.4)', 0.8);
    }
    rrect(cx + 8, cy + ch - 24 + oy, cw - 16, 18, 5, maxed ? 'rgba(0,0,0,0.4)' : ok ? linGrad(0, cy + ch - 24, 0, cy + ch - 6, [[0, '#ffe9a0'], [1, '#c8961c']]) : 'rgba(0,0,0,0.5)', null);
    if (maxed) uiText(T.maxed, cx + cw / 2, cy + ch - 14.5 + oy, 11, '#ffe45a', { align: 'center' });
    else {
      coinIcon(cx + cw / 2 - 18, cy + ch - 15 + oy, 4.5);
      uiText(fmtFull(cost), cx + cw / 2 - 10, cy + ch - 14.5 + oy, 11, ok ? '#2a1a00' : '#a89878');
    }
  });
}

function drawModeBanner() {
  const w = 330, h = 36, x = viewW / 2 - w / 2, y = TOP_H + 8;
  uiPanel(x, y, w, h, { r: 10, border: S.mode === 'build' ? '#ffe070' : '#ff7a60' });
  uiText(S.mode === 'build' ? T.tapSpot : T.tapSell, x + 14, y + h / 2, 12.5, '#fff');
  uiButton('mcancel', x + w - 76, y + 6, 68, 24, T.cancel, () => { S.mode = null; S.buildId = 0; Sfx.play('close'); }, { kind: 'red', size: 11, r: 6 });
}

// tooltip for unit cards (hover with a mouse, or a short while after a tap)
function drawCardTip() {
  let tb = null;
  if (Input.mouse && Input.over && !Input.down) { const b = findButton(Input.x, Input.y); if (b && b.tip) tb = b; }
  if (!tb && Game.touchTip && performance.now() - Game.touchTip.t < 1600) tb = Game.touchTip.b;
  if (!tb) return;
  const tip = tb.tip;
  if (tip.kind === 'unit') {
    const U = UNITS[tip.id];
    const w = 176, h = 58;
    const x = clamp(tb.x, 6, viewW - w - 6), y = BAR_Y - h - 10;
    uiPanel(x, y, w, h, { r: 8 });
    uiText(T.unitNames[tip.id], x + 10, y + 13, 12.5, UI.goldHi, { family: FONT_SERIF });
    const hp = Math.round(U.hp * (1 + S.up.hp * 0.1)), dm = Math.round(U.dmg * (1 + S.up.atk * 0.1));
    uiText(`${T.hp} ${hp}   ${T.dmg} ${dm}` + (U.rdmg ? ` / ${Math.round(U.rdmg * (1 + S.up.atk * 0.1))}` : ''), x + 10, y + 30, 10, '#fff');
    uiText(`${T.range} ${U.rr ? U.rr : U.mr}   ${(U.train / FPS).toFixed(1)}s`, x + 10, y + 45, 10, '#bfa77a');
  } else if (tip.text) {
    const c = G.ctx; c.font = `bold 11px ${FONT_HUD}`;
    const w = Math.min(viewW - 12, c.measureText(tip.text).width + 20), h = 24;
    const above = tb.y > STAGE_H / 2;
    const x = clamp(tb.x + tb.w / 2 - w / 2, 6, viewW - w - 6), y = above ? tb.y - h - 8 : tb.y + tb.h + 6;
    uiPanel(x, y, w, h, { r: 7, shadow: false });
    uiText(tip.text, x + w / 2, y + h / 2, 11, '#fff', { align: 'center' });
  }
}

// ------------------------------------------------------------------ banners
function drawBanners() {
  const b = S.banners[0];
  if (!b) return;
  const c = G.ctx;
  const t = b.t, inK = smooth(t / 12), outK = smooth((b.life - t) / 18);
  const a = Math.min(inK, outK);
  c.globalAlpha = a;
  if (b.style === 'age') {
    const y = 150, h = 84;
    c.fillStyle = linGrad(0, y - h / 2, 0, y + h / 2, [[0, 'rgba(0,0,0,0)'], [0.2, 'rgba(20,12,4,0.75)'], [0.8, 'rgba(20,12,4,0.75)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(0, y - h / 2, viewW, h);
    c.fillStyle = linGrad(0, 0, viewW, 0, [[0, 'rgba(240,200,100,0)'], [0.5, 'rgba(255,220,120,0.95)'], [1, 'rgba(240,200,100,0)']]);
    c.fillRect(0, y - 30, viewW, 1.5); c.fillRect(0, y + 30, viewW, 1.5);
    const sc = 1 + (1 - inK) * 0.4;
    save(); tr(viewW / 2, y - 4); scl(sc);
    titleText(b.title, 0, 14, 40);
    restore();
    if (b.sub) uiText(b.sub, viewW / 2, y + 20, 13, '#fff2d0', { align: 'center', family: FONT_SERIF });
  } else if (b.style === 'warn') {
    const y = TOP_H + 30, h = 34;
    const p = 0.75 + 0.25 * Math.sin(t * 0.4);
    c.fillStyle = linGrad(0, 0, viewW, 0, [[0, 'rgba(120,0,0,0)'], [0.25, `rgba(150,10,0,${0.85 * p})`], [0.75, `rgba(150,10,0,${0.85 * p})`], [1, 'rgba(120,0,0,0)']]);
    c.fillRect(0, y - h / 2, viewW, h);
    uiText(b.title, viewW / 2, y, 17, '#fff', { align: 'center', stroke: '#3a0000', sw: 3, family: FONT_SERIF });
  } else if (b.style === 'enemy') {
    const y = 128, h = 44;
    c.fillStyle = linGrad(0, 0, viewW, 0, [[0, 'rgba(60,0,0,0)'], [0.3, 'rgba(70,8,4,0.8)'], [0.7, 'rgba(70,8,4,0.8)'], [1, 'rgba(60,0,0,0)']]);
    c.fillRect(0, y - h / 2, viewW, h);
    uiText(b.title, viewW / 2, y, 19, '#ffd0c0', { align: 'center', stroke: '#2a0000', sw: 3, family: FONT_SERIF });
  } else {
    uiText(b.title, viewW / 2, 150, 15, '#fff', { align: 'center', stroke: '#000', sw: 3 });
  }
  c.globalAlpha = 1;
}

// ------------------------------------------------------------------ tutorial tips
const TIP_TARGET = { train: 'cards', earn: 'gold', turret: 'turrets', special: 'special', evolve: 'evolve' };
function updateTutorial() {
  if (!Settings.hints) { S.tip = null; return; }
  if (S.tip) { S.tip.t++; if (S.tip.auto && S.tip.t > S.tip.auto) closeTip(); return; }
  if (S.tipCool > 0) { S.tipCool--; return; }
  const want = (id) => !Meta.tut[id];
  if (want('train') && S.tick > 30) showTip('train');
  else if (want('earn') && S.stats.kills >= 1) showTip('earn', 320);
  else if (want('special') && S.tick > 1400 && S.specTimer >= SPECIAL_COOLDOWN) showTip('special');
  else if (want('turret') && S.tick > 2600 && S.cash >= 100 && !S.stats.turrets) showTip('turret');
  else if (want('evolve') && S.tech < 5 && S.xp >= EVOLVE_XP[S.tech - 1]) showTip('evolve');
}
function showTip(id, auto) { S.tip = { id, t: 0, auto }; }
function closeTip() { if (S && S.tip) { Meta.tutDone(S.tip.id); S.tip = null; S.tipCool = 200; } }
function tutorialDone(id) { Meta.tutDone(id); if (S && S.tip && S.tip.id === id) { S.tip = null; S.tipCool = 200; } }

function drawTutorial() {
  const tp = S.tip;
  if (!tp || S.popup || S.mode) return;
  const r = hudRects[TIP_TARGET[tp.id]];
  if (!r) return;
  const c = G.ctx;
  const lines = T.tut[tp.id].split('\n');
  c.font = `bold 12px ${FONT_HUD}`;
  const w = Math.max(...lines.map(l => c.measureText(l).width)) + 28, h = lines.length * 17 + 30;
  const below = r.y < STAGE_H / 2;
  const bounce = Math.sin(Game.t * 0.15) * 3;
  const x = clamp(r.x + r.w / 2 - w / 2, 6, viewW - w - 6);
  const y = below ? r.y + r.h + 14 + bounce : r.y - h - 14 + bounce;
  const a = Math.min(1, tp.t / 10);
  c.globalAlpha = a;
  // highlight the target
  c.strokeStyle = `rgba(255,240,150,${0.6 + 0.4 * Math.sin(Game.t * 0.25)})`; c.lineWidth = 2.5;
  rrectPath(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 9); c.stroke();
  uiPanel(x, y, w, h, { r: 10, top: 'rgba(255,248,225,0.97)', bot: 'rgba(240,225,190,0.97)', border: '#8a5a10' });
  const ax = clamp(r.x + r.w / 2, x + 14, x + w - 14);
  if (below) poly([ax - 8, y + 1, ax, y - 9, ax + 8, y + 1], 'rgba(255,248,225,0.97)', null);
  else poly([ax - 8, y + h - 1, ax, y + h + 9, ax + 8, y + h - 1], 'rgba(240,225,190,0.97)', null);
  lines.forEach((l, i) => uiText(l, x + 14, y + 16 + i * 17, 12, '#3a2408'));
  uiText(T.tut.tapToClose, x + w - 12, y + h - 10, 9, '#8a6a3a', { align: 'right', weight: 'normal' });
  buttons.push({ id: 'tip', x, y, w, h, onClick: () => { closeTip(); Sfx.play('close'); } });
  c.globalAlpha = 1;
}

// ------------------------------------------------------------------ achievement toast (any screen)
function drawToast() {
  const ts = Meta.toast;
  if (!ts) return;
  const life = 220, t = ts.t;
  const k = t < 14 ? smooth(t / 14) : t > life - 20 ? smooth((life - t) / 20) : 1;
  const w = 250, h = 46, x = viewW / 2 - w / 2, y = -h + (TOP_H + 8 + h) * k;
  uiPanel(x, y, w, h, { r: 10, border: '#ffe070' });
  G.ctx.globalCompositeOperation = 'lighter'; glowAt('hot', x + 24, y + h / 2, 26, 0.5); G.ctx.globalCompositeOperation = 'source-over'; G.ctx.globalAlpha = 1;
  trophyIcon(x + 24, y + h / 2, 1.2, true);
  uiText(T.newAch, x + 46, y + 14, 9.5, '#bfa77a');
  uiText(T.ach[ts.id][0], x + 46, y + 31, 13.5, UI.goldHi, { family: FONT_SERIF });
}

function tickUI() {
  Env.tick();
  if (Meta.toast && ++Meta.toast.t > 220) Meta.toast = null;
  if (Game.screen === 'title' || Game.screen === 'difficulty' || Game.screen === 'achievements' || Game.screen === 'gallery') titleTick();
  if (Game.screen === 'end' && S && S.endT < 400) S.endT++;
}

function toggleSound() {
  Settings.sound = !Settings.sound;
  saveSettings();
  Sfx.init(); applyAudioSettings();
  Sfx.setOn(Settings.sound);
  if (Settings.sound) Sfx.playMusic(Game.screen === 'play' ? 'battle' : 'title', true);
}
