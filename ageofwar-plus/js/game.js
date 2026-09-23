'use strict';
// Age of War Plus: simulation (the original rules at 40 ticks per second, extended with game speed,
// upgrades and enemy special attacks), input, camera, world rendering and the main loop.
// The HUD lives in hud.js and the menus in screens.js.

const cv = document.getElementById('game');
const ctx = cv.getContext('2d', { alpha: false });
G.set(ctx);

const FONT_SERIF = '"AoWSerif", "Bookman Old Style", "Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif';
const FONT_HUD = '"Trebuchet MS", Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const FONT_TITLE = '"AoWTitle", "Castellar", "Trajan Pro", serif';

// ------------------------------------------------------------------ layout
const VIEW_MIN = 700, VIEW_MAX = ENV_X1 - ENV_X0;
const TOP_H = 52, BAR_Y = 438;
let dpr = 1, scale = 1, offX = 0, offY = 0, viewW = 800, cssW = 0, cssH = 0;
const caches = { base: {}, icons: {}, ui: {} };

function storedLang() { try { return localStorage.getItem('aow_lang'); } catch (e) { return null; } }
let lang = storedLang() || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
let T = I18N[lang];
function setLang(l) {
  lang = l; T = I18N[l];
  try { localStorage.setItem('aow_lang', l); } catch (e) {}
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
  caches.ui = {};
}
setLang(lang);

function safeInsets() {
  const el = document.getElementById('safe');
  if (!el) return [0, 0, 0, 0];
  const cs = getComputedStyle(el);
  return [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(v => parseFloat(v) || 0);
}

function resize() {
  cssW = window.innerWidth; cssH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2, Game.maxDpr || 9);
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  const [it, ir, ib, il] = safeInsets();
  const aw = Math.max(100, cssW - il - ir), ah = Math.max(100, cssH - it - ib);
  viewW = clamp(STAGE_H * aw / ah, VIEW_MIN, VIEW_MAX);
  scale = Math.min(aw * dpr / viewW, ah * dpr / STAGE_H);
  offX = Math.round(il * dpr + (aw * dpr - viewW * scale) / 2);
  offY = Math.round(it * dpr + (ah * dpr - STAGE_H * scale) / 2);
  caches.base = {}; caches.icons = {}; caches.ui = {};
  if (S) S.camX = S.pcamX = clampCam(S.camX);
}
function camRange() { return [ENV_X0, Math.max(ENV_X0, ENV_X1 - viewW)]; }
function clampCam(x) { const r = camRange(); return clamp(x, r[0], r[1]); }

function baseImage(age, addons) {
  const key = age + '_' + addons;
  if (!caches.base[key]) caches.base[key] = { img: renderTo(200, 360, scale, () => { tr(20, 330); drawBase(age, addons); }), ox: -20, oy: -330 };
  return caches.base[key];
}

// ------------------------------------------------------------------ game state
const Game = { screen: 'title', t: 0, portraitOk: false, overlay: null, touchTip: null, titleAge: 1 };
let S = null;

function newMatch(diff) {
  const base = (side, x, l, r, w) => ({ base: true, side, x, y: GROUND_Y, w, h: 76.5, hp: BASE_HP, max: BASE_HP, l, r, t: 349.5, flash: 0, dAcc: 0, dT: 0 });
  S = {
    diff, tick: 0, cash: START_CASH, xp: 0, tech: 1, etech: 1, addons: 0, eaddons: 0,
    spots: [null, null, null, null], espots: [null, null, null, null],
    units: [], uid: 1, bullets: [], parts: [], fx: [], specials: [], nums: [],
    pBase: base(1, 50, -17.3, 169.5, 186.8), eBase: base(2, 950, 854.8, 1055.9, 201.2),
    tray: [0, 0, 0, 0, 0], trainId: 0, trainTimer: -1, trainTotal: 0,
    specTimer: SPECIAL_COOLDOWN - 1, heal: 0, eheal: 0, eSpec: { t: 0, warn: 0 },
    ai: { timer: 0, uTimer: -1, check: false, action: 0, uof: 0, techTimer: 0, unitLevel: 1, will: 0, uTotal: 0 },
    up: { atk: 0, hp: 0, loot: 0 },
    stats: { kills: 0, lost: 0, gold: 0, dmg: 0, specials: 0, turrets: 0 },
    camX: ENV_X0, pcamX: ENV_X0, camTarget: null, shakeX: 0, shakeY: 0, spShakeX: 0, spShakeY: 0, trauma: 0,
    paused: false, over: null, overT: 0, speed: Settings.speed || 1, slow: 0,
    popup: null, mode: null, buildId: 0, banners: [], cine: null, tip: null, tutT: 0,
    inertia: 0, uidBase: Math.random(),
  };
  S.entities = [S.pBase, S.eBase];
  Meta.unlockedNow = [];
}

// ------------------------------------------------------------------ units
function spawnUnit(id, side, raw) {
  const U = UNITS[id];
  const m = side === 2 ? DIFF_MULT[S.diff] : 1;
  const ua = side === 1 && !raw ? 1 + S.up.atk * UPGRADES[0].per : 1;
  const uh = side === 1 && !raw ? 1 + S.up.hp * UPGRADES[1].per : 1;
  const u = {
    id, side, uid: S.uid++, x: (side === 1 ? PLAYER_SPAWN_X : ENEMY_SPAWN_X) + Math.random(), y: GROUND_Y,
    hp: U.hp * m * uh, max: U.hp * m * uh, dmg: U.dmg * m * ua, rdmg: U.rdmg * m * ua, mr: U.mr, rr: U.rr, w: U.w, h: U.h,
    speed: side === 1 ? UNIT_SPEED : -UNIT_SPEED,
    closest: side === 1 ? 300 : -300, ed: side === 1 ? 300 : -300, limit: 100, target: null, c: 3,
    moving: false, melee: false, ranged: false,
    anim: 'walk', f: 0, len: U.anim.walk, v: 0, hit: 0,
    dead: false, dc: 0, reward: Math.round(U.cost * 1.3), hbT: 0, t: 0, flash: 0, dAcc: 0, dT: 0, lastSp: null,
  };
  u.px = u.x;
  S.units.push(u);
  S.entities.push(u);
  if (side === 1 && id === 16 && !raw) Meta.unlock('super');
  return u;
}

function setAnim(u, label) {
  if (u.anim !== label) { u.anim = label; u.f = 0; pickAnim(u); }
}
function pickAnim(u) {
  const A = UNITS[u.id].anim;
  if (u.anim === 'attack') {
    u.v = A.attack.length > 1 ? (Math.random() < 0.5 ? 0 : 1) : 0;
    u.len = A.attack[u.v][0]; u.hit = A.attack[u.v][1];
  } else if (u.anim === 'shoot' || u.anim === 'shootwalk') {
    u.len = A[u.anim][0]; u.hit = A[u.anim][1];
  } else { u.len = A[u.anim]; u.hit = 0; }
}

function scanUnit(u) {
  u.target = null;
  let closest = u.side === 1 ? 300 : -300, ed = closest;
  const es = S.entities;
  for (let a = es.length - 1; a >= 0; a--) {
    const e = es[a];
    const dist = e.x - u.x;
    const hw = e.w / 2;
    if (u.side === 1 && dist > 0) {
      if (closest > dist) { closest = dist; u.limit = u.w / 2 + hw + 2; }
      if (e.side !== u.side && ed > dist - hw) { ed = dist - hw; u.target = e; }
    } else if (u.side === 2 && dist < 0) {
      if (closest < dist) { closest = dist; u.limit = u.w / 2 + hw + 2; }
      if (e.side !== u.side && ed < dist + hw) { ed = dist + hw; u.target = e; }
    }
  }
  u.closest = closest; u.ed = ed;
}

// every point of damage goes through here: stats, hit flash, damage numbers and special kill credit
function dealDamage(e, amt, side, sp) {
  if (!e || !(amt > 0)) return;
  e.hp -= amt;
  if (e.side === 2) S.stats.dmg += amt;
  e.flash = 4;
  if (!e.base) e.lastSp = sp || null;
  if (Settings.dmgNumbers) { e.dAcc += amt; if (!e.dT) e.dT = 12; }
  if (e.base && e.side === 1) S.trauma = Math.min(1, S.trauma + Math.min(0.2, amt / 500));
}

function bloodAt(e, n) {
  if (!e || e.base) return;
  if (e.id === 12 || e.id === 15) { for (let i = 0; i < (e.id === 12 ? 3 : n); i++) addPart('spark', e.x, e.y - e.h / 1.5); return; }
  if (!Settings.blood) { for (let i = 0; i < 2; i++) addPart('spark', e.x, e.y - e.h / 1.5); return; }
  for (let i = 0; i < n; i++) addPart('blood', e.x, e.y - e.h / 1.5);
}

const MELEE_SFX = { 1: 'hit', 2: 'hit', 3: 'hitHeavy', 4: 'slash', 5: 'metal', 6: 'metal', 7: 'slash', 8: 'musket', 9: 'cannon', 10: 'hitHeavy', 11: 'gun', 12: 'cannon', 13: 'slash', 14: 'hitHeavy', 15: 'boom', 16: 'hitHeavy' };
const RANGED_SFX = { 2: 'sling', 5: 'bow', 8: 'musket', 11: 'gun', 14: 'laser', 16: 'ion' };

function unitHit(u, ranged) {
  const e = u.target;
  const dmg = ranged ? u.rdmg : u.dmg;
  if (e) { dealDamage(e, dmg - Math.random() * 2, u.side); bloodAt(e, 5); }
  if (ranged) {
    Sfx.play(RANGED_SFX[u.id] || 'hit', u.x);
    if (e) shotFx(u, e);
  } else {
    Sfx.play(MELEE_SFX[u.id] || 'hit', u.x);
    if (e && (u.id === 12 || u.id === 15 || u.id === 9)) {
      const tx = u.x + u.ed;
      addPart(u.id === 15 ? 'ionblast' : 'explosion', tx, GROUND_Y - (e.base ? 25 : e.h * 0.45), { size: u.id === 9 ? 16 : 26, life: 18 });
      if (u.id !== 9) S.trauma = Math.min(1, S.trauma + 0.08);
    }
    if (e && u.id === 8) shotFx(u, e);
  }
}

// purely cosmetic projectile for ranged unit attacks (the original deals the damage instantly)
function shotFx(u, e) {
  const dir = u.side === 1 ? 1 : -1;
  const sx = u.x + dir * u.w * 0.6, sy = u.y - u.h * 0.62;
  const tx = e.base ? u.x + u.ed : e.x;
  const ty = e.base ? GROUND_Y - 30 - Math.random() * 20 : e.y - e.h * 0.55;
  const kind = { 2: 'stone', 5: 'bolt', 8: 'tracer', 11: 'tracer', 14: 'laser', 16: 'ionbolt' }[u.id] || 'tracer';
  S.fx.push({ kind, x0: sx, y0: sy, x1: tx, y1: ty, t: 0, life: kind === 'stone' ? 10 : 5 });
  if (kind === 'tracer' || kind === 'laser' || kind === 'ionbolt') addPart('flash', sx, sy, { size: 4, life: 3, col: kind === 'tracer' ? 'warm' : kind === 'laser' ? 'red' : 'cool' });
  if (u.id === 8) { for (let i = 0; i < 3; i++) addPart('smoke', sx + dir * 4, sy, { size: 4 + Math.random() * 3, vy: -0.3, life: 30, color: 'rgba(210,210,210,0.8)' }); }
}

function updateUnit(u) {
  u.t++;
  if (u.hbT > 0) u.hbT--;
  if (u.flash > 0) u.flash--;
  if (!u.dead && u.hp > 0) {
    if ((u.side === 1 ? S.heal : S.eheal) > 0 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + 1);
    if (Math.abs(u.closest) > u.limit) { u.x += u.speed; u.moving = true; } else u.moving = false;
    const aed = Math.abs(u.ed);
    if (aed < u.mr) { u.melee = true; u.ranged = false; }
    else if (aed < u.rr) { u.melee = false; u.ranged = true; }
    else { u.melee = false; u.ranged = false; }
    if (!u.melee && !u.moving && !u.ranged) setAnim(u, 'idle');
    else if (u.melee && !u.moving) setAnim(u, 'attack');
    else if (u.ranged && u.moving) setAnim(u, 'shootwalk');
    else if (u.ranged && !u.moving) setAnim(u, 'shoot');
    else if (!u.melee && u.moving && !u.ranged) setAnim(u, 'walk');
    u.f++;
    if (u.f > u.len) { u.f = 1; pickAnim(u); }
    if (u.hit && u.f === u.hit) {
      if (u.anim === 'attack') unitHit(u, !!UNITS[u.id].anim.meleeIsRanged);
      else unitHit(u, true);
    }
    u.c--;
    if (u.c === 0) { scanUnit(u); u.c = 5; }
  } else {
    if (!u.dead) {
      u.dead = true;
      const i = S.entities.indexOf(u);
      if (i >= 0) S.entities.splice(i, 1);
      if (u.side === 2) {
        S.ai.uof--;
        const gold = Math.round(u.reward * (1 + S.up.loot * UPGRADES[2].per));
        S.cash += gold; S.xp += u.reward * 2;
        S.stats.kills++; S.stats.gold += gold;
        if (u.lastSp && u.lastSp.side === 1) { u.lastSp.kills++; if (u.lastSp.kills >= 8) Meta.unlock('wrath'); }
        addPart('gold', u.x, u.y - u.h - 6, { value: gold });
        Sfx.play('coin', u.x);
      } else {
        S.xp += Math.round(u.reward / 2);
        S.stats.lost++;
      }
      bloodAt(u, 9);
      Sfx.play(u.id === 12 || u.id === 15 ? 'boom' : 'die', u.x);
      if (u.id === 12 || u.id === 15) {
        addPart('explosion', u.x, u.y - 20, { size: 40, life: 28 });
        S.trauma = Math.min(1, S.trauma + 0.25);
        for (let k = 0; k < 6; k++) addPart('smoke', u.x + (Math.random() - 0.5) * u.w * 0.6, u.y - 20, { size: 6 + Math.random() * 6, vy: -0.5, life: 60, color: 'rgba(50,50,50,0.7)' });
      }
      u.anim = 'die'; u.f = 0; u.len = UNITS[u.id].anim.die;
    }
    if (u.f < u.len) u.f++;
    u.dc++;
  }
}

// ------------------------------------------------------------------ turrets
function placeTurret(side, spot, id) {
  const tu = { id, side, spot, st: 0, c: 0, ed: 100000, edH: 0, target: null, ang: side === 1 ? 0 : 180, anim: 0, playing: false, born: 0 };
  tu.rx = side === 1 ? PLAYER_BASE_X + TURRET_SPOT_X : ENEMY_BASE_X - TURRET_SPOT_X;
  tu.ry = GROUND_Y + TURRET_SPOT_Y[spot];
  (side === 1 ? S.spots : S.espots)[spot] = tu;
  return tu;
}

function updateTurret(tu) {
  const T0 = TURRETS[tu.id];
  if (tu.born < 20) tu.born++;
  tu.c++;
  if (tu.c === 10) {
    tu.ed = 100000; tu.target = null;
    for (let a = S.entities.length - 1; a >= 0; a--) {
      const e = S.entities[a];
      if (e.side === tu.side) continue;
      const d = Math.hypot(e.x - tu.rx, e.y - tu.ry);
      if (tu.ed > d) { tu.ed = d; tu.edH = e.h; tu.target = e; }
    }
    tu.c = 0;
  }
  if (tu.ed < T0.range) {
    if (!T0.noAim && tu.target) {
      const tx = tu.target.x, ty = tu.target.y - tu.edH / 1.3;
      tu.ang = Math.round(Math.atan2(ty - tu.ry, tx - tu.rx) * 180 / Math.PI);
    }
    tu.st++;
    if (tu.st >= T0.rate) { tu.playing = true; tu.st = 0; }
  }
  if (tu.playing) {
    tu.anim++;
    if (T0.shots.includes(tu.anim)) fireTurret(tu);
    if (tu.anim >= T0.alen) { tu.anim = 0; tu.playing = false; }
  }
}

const TURRET_SFX = [null, 'sling', 'egg', 'catapult', 'catapult', 'catapult', 'oil', 'cannon', 'cannon', 'cannon', 'mg', 'rocket', 'mg', 'laser', 'laser', 'ion'];
const MUZZLE = [0, 0, 16, 0, 0, 0, 0, 30, 36, 36, 28, 26, 30, 30, 30, 30];
function fireTurret(tu) {
  const T0 = TURRETS[tu.id];
  createBullet(tu.rx, tu.ry, tu.ang, T0.dmg, T0.bullet, tu.side);
  Sfx.play(TURRET_SFX[tu.id], tu.rx);
  const L = MUZZLE[tu.id];
  if (L) {
    const r = D(tu.ang), mx = tu.rx + Math.cos(r) * L, my = tu.ry + Math.sin(r) * L;
    addPart('glow', mx, my, { size: tu.id >= 13 ? 16 : 12, life: 5, col: tu.id === 13 ? 'green' : tu.id === 14 ? 'red' : tu.id === 15 ? 'cool' : 'warm' });
    if (tu.id >= 7 && tu.id <= 9) for (let i = 0; i < 4; i++) addPart('smoke', mx, my, { size: 3 + Math.random() * 4, vx: Math.cos(r) * 0.6, vy: -0.4, life: 30, color: 'rgba(200,200,200,0.7)' });
  }
}

// ------------------------------------------------------------------ bullets
function createBullet(x, y, rotDeg, dmg, type, side) {
  const r = D(rotDeg);
  const b = { x, y, px: x, py: y, type, dmg, side, g: 0, rot: r, dead: false, t: 0 };
  switch (type) {
    case 1: case 2: {
      const k = type === 1 ? 5 : 4;
      b.vx = 7 * Math.cos(r); b.vy = 7 * Math.sin(r); b.x += b.vx * k; b.y += b.vy * k; b.gf = 0.05; b.spin = type === 1 ? D(2) : D(Math.random() * 6 - 3);
      break;
    }
    case 3: case 4:
      b.vx = 7 * Math.cos(r); b.vy = 7 * Math.sin(r);
      b.y += side === 1 ? -b.vx * 5 : b.vx * 5; b.gf = 0.05; b.spin = D(type === 3 ? 2 : 6);
      break;
    case 5:
      b.x += side === 1 ? 116 : -116; b.y += 7; b.timer = 40; b.cc = 0;
      break;
    case 6: case 7: case 8:
      b.vx = 7 * Math.cos(r); b.vy = 7 * Math.sin(r); b.x += b.vx * 5; b.y += b.vy * 5; b.gf = 0.02; b.sub = 4;
      break;
    case 9: case 10: case 11: case 12: {
      const off = type === 9 ? 200 : type === 12 ? 100 : 42;
      b.vx = 0.2 * Math.cos(r); b.vy = 0.2 * Math.sin(r); b.x += b.vx * off; b.y += b.vy * off; b.sub = 8;
      break;
    }
  }
  b.px = b.x; b.py = b.y;
  S.bullets.push(b);
  return b;
}

function hitTest(x, y, side) {
  const es = S.entities;
  for (let a = es.length - 1; a >= 0; a--) {
    const e = es[a];
    if (e.side === side) continue;
    if (e.base) { if (x >= e.l && x <= e.r && y >= e.t && y <= GROUND_Y + 1) return e; }
    else if (x >= e.x - e.w / 2 && x <= e.x + e.w / 2 && y >= e.y - e.h && y <= e.y + 0.5) return e;
  }
  return null;
}

function boom(x, y, size, snd) {
  addPart('explosion', x, y, { size, life: 28 });
  if (snd !== false) Sfx.play(size >= 30 ? 'boomBig' : 'boom', x);
  if (size >= 18) S.trauma = Math.min(1, S.trauma + size / 260);
}

function bulletHit(b, e) {
  dealDamage(e, b.dmg, b.side, b.sp);
  const t = b.type;
  if (t === 1 || t === 3) { for (let i = 0; i < 4; i++) addPart('debris', b.x, b.y); Sfx.play('rock', b.x); }
  if (t === 4) { for (let i = 0; i < 3; i++) addPart('fireshard', b.x, b.y, { side: b.side }); boom(b.x, b.y, 14); }
  if (t === 6) { for (let i = 0; i < 5; i++) addPart('debris', b.x, b.y, { v: 1 }); Sfx.play('thud', b.x); }
  if (t === 7) { for (let i = 0; i < 3; i++) addPart('shrapnel', b.x, b.y, { side: b.side }); boom(b.x, b.y, 18); }
  if (t === 9) boom(b.x, b.y, 16);
  if (t === 8 || t === 12) Sfx.play('metal', b.x);
  if (t === 'meteor') { for (let i = 0; i < 4; i++) addPart('debris', b.x, b.y); boom(b.x, b.y - 6, 18); }
  if (t === 'bomb') { boom(b.x, b.y - 10, 34); addPart('flash', b.x, b.y - 10, { size: 26, life: 6 }); }
  if (t !== 2) bloodAt(e, 5);
  b.dead = true;
}

function bulletGround(b) {
  const t = b.type;
  if (t === 1 || t === 3 || t === 'meteor') {
    for (let i = 0; i < 7; i++) addPart('debris', b.x, b.y - (t === 'meteor' ? 10 : 0));
    if (t === 'meteor') boom(b.x, b.y - 6, 18); else Sfx.play('rock', b.x);
  }
  if (t === 4) { for (let i = 0; i < 3; i++) addPart('fireshard', b.x, b.y, { side: b.side }); addPart('burn', b.x, b.y); boom(b.x, b.y, 14); }
  if (t === 6) { for (let i = 0; i < 5; i++) addPart('debris', b.x, b.y, { v: 1 }); }
  if (t === 7) { for (let i = 0; i < 4; i++) addPart('shrapnel', b.x, b.y, { side: b.side }); boom(b.x, b.y, 18); }
  if (t === 9) boom(b.x, b.y, 16);
  if (t === 'bomb') { boom(b.x, b.y - 10, 34); addPart('flash', b.x, b.y - 12, { size: 30, life: 6 }); }
  if (t === 'arrow') addPart('stuck', b.x, GROUND_Y, { rot: Math.atan2(b.vy + b.g, b.vx), life: 60 });
  b.dead = true;
}

function updateBullet(b) {
  b.t++;
  const t = b.type;
  if (t === 5) {
    b.timer--; b.cc++;
    if (b.cc === 2) { addPart('oil', b.x + (Math.random() * 2 - 1), b.y + (Math.random() * 2 - 1), { side: b.side, dmg: b.dmg }); b.cc = 0; }
    if (b.timer <= 0) b.dead = true;
    return;
  }
  if (b.sub) {
    for (let s = 0; s < b.sub && !b.dead; s++) {
      if (t >= 9) {
        if (t === 9 || b.vx < 15) { b.x += b.vx; b.y += b.vy; b.vx *= 1.01; b.vy *= 1.01; }
      } else { b.g += b.gf; b.x += b.vx; b.y += b.vy + b.g; }
      if (b.y > GROUND_Y) { bulletGround(b); break; }
      const e = hitTest(b.x, b.y, b.side);
      if (e) { bulletHit(b, e); break; }
    }
    if (t === 9 && !b.dead && b.t % 2 === 0) addPart('smoke', b.x - Math.cos(b.rot) * 14, b.y - Math.sin(b.rot) * 14, { size: 2.5, vy: -0.2, life: 18, color: 'rgba(230,230,230,0.7)' });
    if (b.x < -100 || b.x > WORLD_W + 100 || b.y < -300) b.dead = true;
    return;
  }
  if (t === 'meteor' || t === 'arrow') {
    b.g += 0.05; b.x += b.vx; b.y += b.vy + b.g;
    if (t === 'meteor') addPart('smoke', b.x, b.y - 2, { size: 5 * b.scale, vy: -1, life: 25, shrink: 0.04, color: 'rgba(255,190,60,0.9)', fire: 1 });
  } else if (t === 'bomb') {
    if (b.g < 15) b.g += 0.2;
    b.vx /= 1.02; b.x += b.vx; b.y += b.vy + b.g;
    b.rot += D(b.spin);
  } else {
    b.g += b.gf; b.x += b.vx; b.y += b.vy + b.g; b.rot += b.spin || 0;
  }
  if (b.y > GROUND_Y) { bulletGround(b); return; }
  const e = hitTest(b.x, b.y, b.side);
  if (e) bulletHit(b, e);
}

// ------------------------------------------------------------------ particles
function addPart(type, x, y, o = {}) {
  const p = Object.assign({ type, x, y, px: x, py: y, vx: 0, vy: 0, g: 0, alpha: 1, t: 0, life: 60, size: 2, rot: Math.random() * 6, v: (Math.random() * 12) | 0 }, o);
  switch (type) {
    case 'blood': p.vx = Math.random() * 2 - 1; p.g = Math.random() * 1.5 - 1; p.gf = 0.2; p.x += Math.random() * 6 - 3; p.y += Math.random() * 6 - 3; p.size = 1 + Math.random() * 1.4; p.rv = (Math.random() * 4 - 1.5) * 0.1; break;
    case 'debris': p.vx = Math.random() * 6 - 3; p.g = -(Math.random() * 3) + 1; p.gf = 0.15; p.x += Math.random() * 9 - 4; p.y += Math.random() * 9 - 4; p.size = 1.2 + Math.random() * 1.2; p.rv = (Math.random() * 4 - 1.5) * 0.1; break;
    case 'spark': p.vx = Math.random() * 4 - 2; p.g = -Math.random() * 2; p.gf = 0.2; p.size = 0.8 + Math.random(); p.life = 20; break;
    case 'gold': p.vy = 3; p.life = 999; break;
    case 'fireshard': case 'shrapnel': {
      const a = D(-90 + (Math.random() * 60 - 30));
      p.vx = 7 * Math.cos(a); p.vy = 7 * Math.sin(a) + Math.random(); p.gf = 0.2; p.dmgP = type === 'fireshard' ? 10 : 30; p.size = type === 'fireshard' ? 2.5 : 1.6;
      break;
    }
    case 'oil': p.g = 1; p.gf = 0.2; break;
    case 'splash': p.vx = Math.random() * 6 - 3; p.g = -(Math.random() * 3) + 1; p.gf = 0.15; p.size = 1 + Math.random(); break;
    case 'burn': p.life = 100; p.x += Math.random() * 6 - 3; p.y += Math.random() * 6 - 3; p.size = 4; break;
    case 'explosion': p.life = o.life || 28; p.size = o.size || 16; p.v = Math.random() * 6; break;
    case 'smoke': p.life = o.life || 25; break;
    case 'flash': p.life = o.life || 4; break;
    case 'ionblast': p.life = o.life || 14; p.size = o.size || 50; break;
    case 'glow': p.life = o.life || 6; break;
  }
  p.px = p.x; p.py = p.y;
  S.parts.push(p);
  return p;
}

function updatePart(p) {
  p.t++;
  switch (p.type) {
    case 'blood': case 'debris': case 'splash': case 'spark':
      p.g += p.gf; p.vx /= 1.1; p.x += p.vx; p.y += p.g; p.rot += p.rv || 0;
      if (p.y > GROUND_Y) {
        // blood leaves a small stain on the ground for a while
        if (p.type === 'blood' && Math.random() < 0.25) { p.type = 'stain'; p.y = GROUND_Y + Math.random() * 3; p.t = 0; p.life = 160; p.vx = 0; p.g = 0; }
        else p.dead = true;
      } else if (p.t > (p.type === 'spark' ? 20 : 200)) p.dead = true;
      break;
    case 'stain': p.alpha = Math.min(1, (p.life - p.t) / 40); if (p.t >= p.life) p.dead = true; break;
    case 'stuck': p.alpha = Math.min(1, (p.life - p.t) / 15); if (p.t >= p.life) p.dead = true; break;
    case 'gold':
      p.y -= p.vy; p.vy /= 1.1;
      if (p.vy <= 0.2) p.alpha -= 0.02;
      if (p.alpha <= 0) p.dead = true;
      break;
    case 'fireshard': case 'shrapnel': {
      p.g += p.gf; p.x += p.vx; p.y += p.vy + p.g;
      if (p.vy + p.g > 0) {
        if (p.y > GROUND_Y) { addPart('explosion', p.x, p.y, { size: 8, life: 20 }); if (p.type === 'fireshard') addPart('burn', p.x, p.y); p.dead = true; break; }
        const e = hitTest(p.x, p.y, p.side);
        if (e) { dealDamage(e, p.dmgP, p.side); addPart('explosion', p.x, p.y, { size: 8, life: 20 }); bloodAt(e, 5); p.dead = true; }
      }
      if (p.type === 'fireshard' && p.t % 2 === 0) addPart('smoke', p.x, p.y, { size: 2, vy: -0.4, life: 12, color: 'rgba(255,160,40,0.8)' });
      break;
    }
    case 'oil': {
      p.g += p.gf; p.y += p.g;
      const e = hitTest(p.x, p.y, p.side);
      if (e) { dealDamage(e, p.dmg, p.side); for (let i = 0; i < 3; i++) addPart('splash', p.x, p.y); bloodAt(e, 2); p.dead = true; }
      else if (p.y > GROUND_Y) { p.dead = true; addPart('splash', p.x, GROUND_Y); }
      break;
    }
    case 'burn': p.alpha = 1 - p.t / p.life; if (p.t >= p.life) p.dead = true; break;
    case 'smoke':
      p.y += p.vy || -1; p.x += p.vx || 0; p.size = Math.max(0, p.size - (p.shrink ? p.size * p.shrink : 0.04));
      p.alpha = 1 - p.t / p.life; if (p.t >= p.life || p.size <= 0) p.dead = true;
      break;
    default:
      if (p.t >= p.life) p.dead = true;
  }
}

// ------------------------------------------------------------------ specials (both sides)
function useSpecial(side = 1) {
  if (!S || S.over) return;
  if (side === 1) {
    if (S.specTimer < SPECIAL_COOLDOWN) { Sfx.play('deny'); return; }
    S.specTimer = 0; S.stats.specials++;
    tutorialDone('special');
  }
  const age = side === 1 ? S.tech : S.etech;
  const dir = side === 1 ? 1 : -1;
  const sp = { kind: age, side, dir, cc: 0, kills: 0, mult: side === 1 ? 1 : ENEMY_SPECIAL_DMG[S.diff] };
  if (age <= 2) sp.timer = 200;
  if (age === 3) { sp.timer = 600; if (side === 1) S.heal = 600; else S.eheal = Math.round(600 * sp.mult); Sfx.play('heal'); }
  if (age === 4) { sp.x = sp.px = side === 1 ? -100 : 1100; sp.y = 200; Sfx.play('plane'); }
  if (age === 5) { sp.x = side === 1 ? 150 : 850; sp.y = GROUND_Y; sp.timer = 57; }
  S.specials.push(sp);
  if (age !== 3 && age !== 4) Sfx.play('special');
}

function updateSpecials() {
  S.spShakeX = 0; S.spShakeY = 0;
  for (const sp of S.specials) {
    const dir = sp.dir;
    if (sp.kind === 1 || sp.kind === 2) {
      sp.cc++; sp.timer--;
      if (sp.cc === (sp.kind === 1 ? 9 : 5)) {
        sp.cc = 0;
        const r = D(80 + Math.floor(Math.random() * 20));
        let x = Math.floor(Math.random() * 500) + 200;
        if (dir < 0) x = WORLD_W - x;
        const b = { type: sp.kind === 1 ? 'meteor' : 'arrow', x, y: -100, vx: 10 * Math.cos(r) * dir, vy: 10 * Math.sin(r), g: 0, dmg: 200 * sp.mult, side: sp.side, rot: r, scale: (Math.floor(Math.random() * 70) + 120) / 100, t: 0, sp };
        b.px = b.x; b.py = b.y;
        S.bullets.push(b);
      }
      const a = sp.kind === 1 ? 5 : 2;
      S.spShakeX += Math.random() * a * 2 - a; S.spShakeY += Math.random() * a * 2 - a;
      if (sp.timer <= 0) sp.done = true;
    } else if (sp.kind === 3) {
      sp.timer--; if (sp.timer <= 0) sp.done = true;
    } else if (sp.kind === 4) {
      sp.cc++;
      if (sp.cc === 15 && (dir > 0 ? sp.x < 700 : sp.x > 300)) {
        const b = { type: 'bomb', x: sp.x, y: sp.y, vx: 4 * dir, vy: 1, g: 0, dmg: 400 * sp.mult, side: sp.side, rot: 0, spin: Math.floor(Math.random() * 10) - 5, t: 0, sp };
        b.px = b.x; b.py = b.y;
        S.bullets.push(b); sp.cc = 0;
      }
      sp.x += 4 * dir;
      S.spShakeX += Math.random() * 2 - 1; S.spShakeY += Math.random() * 2 - 1;
      if (dir > 0 ? sp.x > 1000 : sp.x < 0) sp.done = true;
    } else if (sp.kind === 5) {
      sp.cc++; sp.timer--;
      if (sp.cc === 5 && (dir > 0 ? sp.x < 700 : sp.x > 300)) {
        const e = hitTest(sp.x + 34 * dir, sp.y - 5 + 1.2, sp.side);
        if (e) { dealDamage(e, 1000 * sp.mult, sp.side, sp); bloodAt(e, 5); }
        addPart('ionblast', sp.x + 30 * dir, sp.y - 20, { size: 58, life: 16 });
        addPart('beam', sp.x + 30 * dir, sp.y - 5, { life: 10 });
        Sfx.play('laserBig', sp.x);
        S.trauma = Math.min(1, S.trauma + 0.12);
        sp.x += 50 * dir; sp.cc = 0;
      }
      S.spShakeX += Math.random() * 2 - 1; S.spShakeY += Math.random() * 2 - 1;
      if (sp.timer <= 0) sp.done = true;
    }
  }
  S.specials = S.specials.filter(s => !s.done);
  if (S.heal > 0) S.heal--;
  if (S.eheal > 0) S.eheal--;
}

// The enemy uses the special attack of its age too, after a warning, when it is worth it.
function updateEnemySpecial() {
  const E = S.eSpec;
  if (E.warn > 0) {
    E.warn--;
    if (E.warn === 0) { useSpecial(2); E.t = 0; }
    return;
  }
  E.t++;
  if (E.t < ENEMY_SPECIAL_CD[S.diff]) return;
  let n = 0, deep = false, hurt = 0;
  for (const u of S.units) {
    if (u.dead) continue;
    if (u.side === 1) { n++; if (u.x > 620) deep = true; }
    else if (u.hp < u.max * 0.6) hurt++;
  }
  const worth = S.etech === 3 ? hurt >= 2 : (n >= 3 || deep);
  if (worth) {
    E.warn = 80;
    banner(T.enemySpecialWarn(T.specialName[S.etech - 1]), null, 'warn');
    Sfx.play('warn');
  }
}

// ------------------------------------------------------------------ enemy AI (port of the original)
function enemyTurret(spot, id) {
  const check = spot === 3 ? 2 : spot;   // like the original, the 4th spot checks the 3rd
  if (!S.espots[check]) placeTurret(2, spot, id);
}
function esell(spot) { S.espots[spot] = null; }

function updateAI() {
  const A = S.ai;
  A.techTimer++;
  if (A.unitLevel === 1) { if (A.techTimer === 1500) A.unitLevel++; }
  else if (A.unitLevel === 2) { if (A.techTimer === 5000) A.unitLevel++; }
  if (A.techTimer === 8000 && S.etech !== 5) {
    S.etech++;
    S.eBase.hp += EVOLVE_BASE_HP * S.etech; S.eBase.max += EVOLVE_BASE_HP * S.etech;
    A.unitLevel = 1; A.techTimer = 0;
    banner(T.enemyEvolved(T.ageNames[S.etech - 1]), null, 'enemy');
    Sfx.play('enemyEvolve');
  }
  const t = A.techTimer, e = S.etech;
  if (e === 1) {
    if (t === 1000) enemyTurret(0, 1);
    else if (t === 4000) { esell(0); enemyTurret(0, 2); }
    else if (t === 6000) { esell(0); enemyTurret(0, 3); }
  } else if (e === 2) {
    if (t === 1000) { esell(0); enemyTurret(0, 4); }
    else if (t === 4000) { S.eaddons = Math.max(S.eaddons, 1); esell(0); enemyTurret(0, 6); }
    else if (t === 6000) enemyTurret(1, 5);
  } else if (e === 3) {
    if (t === 1000) { esell(0); enemyTurret(0, 7); }
    else if (t === 4000) { S.eaddons = Math.max(S.eaddons, 2); esell(1); enemyTurret(1, 7); }
    else if (t === 6000) { esell(1); esell(0); enemyTurret(2, 9); }
  } else if (e === 4) {
    if (t === 5000) enemyTurret(0, 10);
    else if (t === 7000) { S.eaddons = Math.max(S.eaddons, 2); esell(2); esell(0); enemyTurret(1, 11); }
  } else if (e === 5) {
    if (t === 5000) enemyTurret(0, 13);
    else if (t === 12000) { esell(1); esell(0); esell(2); enemyTurret(1, 14); }
    else if (t === 20000) { S.eaddons = 3; esell(1); esell(0); esell(2); enemyTurret(3, 15); }
  }
  A.timer++;
  if (A.timer === 40) {
    A.action = Math.random() < 0.3 ? 1 : 3;
    A.timer = 0; A.check = true;
  }
  if (A.check && A.action === 1 && A.uTimer < -5 && A.uof < 6) {
    let type = Math.floor(Math.random() * A.unitLevel) + 1;
    type += (S.etech - 1) * 3;
    A.will = type; A.uTimer = UNITS[type].train; A.uTotal = A.uTimer;
    A.uof++; A.check = false;
  }
  if (A.uTimer === 0) spawnUnit(A.will, 2);
  A.uTimer--;
}

// ------------------------------------------------------------------ player actions
function trainUnit(id) {
  const U = UNITS[id];
  if (!S || S.over) return;
  if (S.cash < U.cost) { Sfx.play('deny'); flashCash(); return; }
  const slot = S.tray.indexOf(0);
  if (slot < 0) { Sfx.play('deny'); return; }
  S.cash -= U.cost;
  S.tray[slot] = id;
  if (slot === 0) startTraining(id);
  Sfx.play('buy');
  tutorialDone('train');
}
function startTraining(id) {
  if (S.trainId === 0) { S.trainTimer = UNITS[id].train; S.trainId = id; S.trainTotal = S.trainTimer; }
}
function updateTraining() {
  if (S.trainTimer > 0) S.trainTimer--;
  if (S.trainTimer === 0) {
    spawnUnit(S.trainId, 1);
    S.trainId = 0; S.trainTotal = 0; S.trainTimer = -1;
    S.tray.shift(); S.tray.push(0);
    if (S.tray[0] !== 0) startTraining(S.tray[0]);
  }
}
function flashCash() { if (S) S.cashFlash = 16; }

function freeSpots() { const r = []; for (let i = 0; i <= S.addons; i++) if (!S.spots[i]) r.push(i); return r; }
function usedSpots() { const r = []; for (let i = 0; i < 4; i++) if (S.spots[i]) r.push(i); return r; }

function chooseTurret(id) {
  if (S.cash < TURRETS[id].cost) { Sfx.play('deny'); flashCash(); return; }
  const free = freeSpots();
  if (!free.length) { Sfx.play('deny'); banner(T.cantBuild, null, 'small'); return; }
  S.buildId = id;
  if (free.length === 1) { buildAt(free[0]); return; }
  S.popup = null; S.mode = 'build';
  S.camTarget = ENV_X0;
  Sfx.play('select');
}
function buildAt(spot) {
  const id = S.buildId;
  if (!id || S.cash < TURRETS[id].cost || S.spots[spot]) { Sfx.play('deny'); return; }
  S.cash -= TURRETS[id].cost;
  placeTurret(1, spot, id);
  S.popup = null; S.mode = null; S.buildId = 0;
  S.stats.turrets++;
  Sfx.play('build', TURRET_SPOT_X);
  for (let i = 0; i < 8; i++) addPart('debris', TURRET_SPOT_X, GROUND_Y + TURRET_SPOT_Y[spot] + 6);
  addPart('smoke', TURRET_SPOT_X, GROUND_Y + TURRET_SPOT_Y[spot], { size: 10, vy: -0.3, life: 30, color: 'rgba(220,210,190,0.6)' });
  if (usedSpots().length === 4) Meta.unlock('towers');
  tutorialDone('turret');
}
function sellAt(spot) {
  const tu = S.spots[spot];
  if (!tu) return;
  const refund = Math.round(TURRETS[tu.id].cost / 2);
  S.cash += refund;
  S.spots[spot] = null;
  S.mode = null;
  addPart('gold', TURRET_SPOT_X, tu.ry - 14, { value: refund });
  for (let i = 0; i < 6; i++) addPart('debris', TURRET_SPOT_X, tu.ry);
  Sfx.play('coin', TURRET_SPOT_X);
}
function addSlot() {
  if (S.addons >= 3) { Sfx.play('deny'); return; }
  const cost = SLOT_COST[S.addons];
  if (S.cash < cost) { Sfx.play('deny'); flashCash(); return; }
  S.cash -= cost; S.addons++;
  Sfx.play('build', TURRET_SPOT_X);
  S.camTarget = ENV_X0;
}
function buyUpgrade(i) {
  const U = UPGRADES[i], lvl = S.up[U.key];
  if (lvl >= U.max) { Sfx.play('deny'); return; }
  const cost = upgradeCost(U.key, lvl, S.tech);
  if (S.cash < cost) { Sfx.play('deny'); flashCash(); return; }
  S.cash -= cost;
  S.up[U.key] = lvl + 1;
  // units already on the field get the bonus too
  const k = (1 + (lvl + 1) * U.per) / (1 + lvl * U.per);
  for (const u of S.units) {
    if (u.side !== 1 || u.dead) continue;
    if (U.key === 'atk') { u.dmg *= k; u.rdmg *= k; }
    if (U.key === 'hp') { u.max *= k; u.hp *= k; }
    if (U.key !== 'loot') addPart('glow', u.x, u.y - u.h * 0.5, { size: 26, life: 14, col: U.key === 'atk' ? 'red' : 'cool' });
  }
  Sfx.play('powerUp');
  if (S.up[U.key] >= U.max) Meta.unlock('maxup');
}
function evolve() {
  if (!S || S.over) return;
  if (S.tech >= 5 || S.xp < EVOLVE_XP[S.tech - 1]) { Sfx.play('deny'); return; }
  S.tech++;
  S.pBase.max += EVOLVE_BASE_HP * S.tech; S.pBase.hp += EVOLVE_BASE_HP * S.tech;
  S.cine = { t: 0, age: S.tech };
  S.slow = 50;
  S.popup = S.popup === 'upgrades' ? 'upgrades' : null;
  if (S.mode === 'build') { S.mode = null; S.buildId = 0; }
  Env.setAge(S.tech);
  banner(T.ageNames[S.tech - 1], lang === 'zh' ? '新的时代来临了！' : 'A new age begins!', 'age');
  Sfx.play('evolve');
  if (S.tech === 5) Meta.unlock('future');
  tutorialDone('evolve');
}

function banner(title, sub, style) {
  if (!S) return;
  if (style === 'warn' || style === 'small') S.banners = S.banners.filter(b => b.style !== style);
  S.banners.push({ title, sub, style, t: 0, life: style === 'age' ? 150 : style === 'small' ? 70 : 110 });
}

// ------------------------------------------------------------------ simulation step
function step() {
  if (!S) return;
  if (S.over) {
    S.overT++;
    for (const p of S.parts) updatePart(p);
    S.parts = S.parts.filter(p => !p.dead);
    for (const u of S.units) if (u.dead) { if (u.f < u.len) u.f++; if (u.dc < 60) u.dc++; }
    if (S.overT % 6 === 0 && S.overT < 66) {
      const b = S.over === 'win' ? S.eBase : S.pBase;
      boom(b.l + 20 + Math.random() * (b.r - b.l - 60), GROUND_Y - Math.random() * 90, 26 + Math.random() * 16);
    }
    if (S.overT === 80) endMatch();
    return;
  }
  S.tick++;
  if (S.specTimer < SPECIAL_COOLDOWN) S.specTimer++;
  if (S.tick % FPS === 0) S.cash += PASSIVE_INCOME[S.tech];
  updateTraining();
  updateAI();
  updateEnemySpecial();
  for (const u of S.units) updateUnit(u);
  S.units = S.units.filter(u => u.dc <= 80);
  for (const tu of S.spots) if (tu) updateTurret(tu);
  for (const tu of S.espots) if (tu) updateTurret(tu);
  for (const b of S.bullets) updateBullet(b);
  S.bullets = S.bullets.filter(b => !b.dead);
  for (const p of S.parts) updatePart(p);
  S.parts = S.parts.filter(p => !p.dead);
  if (S.parts.length > 900) S.parts.splice(0, S.parts.length - 900);
  for (const f of S.fx) f.t++;
  S.fx = S.fx.filter(f => f.t <= f.life);
  updateSpecials();
  // damage numbers (summed over a few ticks so fast hits do not spam)
  const flush = (e, x, y) => {
    if (e.dT > 0 && --e.dT === 0) {
      if (e.dAcc >= 1 && S.nums.length < 50) S.nums.push({ x: x + (Math.random() * 10 - 5), y, v: Math.round(e.dAcc), side: e.side, t: 0 });
      e.dAcc = 0;
    }
  };
  for (const u of S.units) flush(u, u.x, u.y - u.h - 10);
  flush(S.pBase, 80, 330); flush(S.eBase, 920, 330);
  for (const n of S.nums) n.t++;
  S.nums = S.nums.filter(n => n.t < 40);
  for (const bs of [S.pBase, S.eBase]) if (bs.flash > 0) bs.flash--;
  if (S.cashFlash > 0) S.cashFlash--;
  if (S.cash >= 50000) Meta.unlock('rich');
  if (S.stats.kills >= 100) Meta.unlock('hundred');
  if (S.tick % 600 === 0) saveMatch();
  updateTutorial();
  if (Math.round(S.eBase.hp) < 0) { S.over = 'win'; S.overT = 0; S.popup = null; S.mode = null; S.camTarget = ENV_X1 - viewW; }
  else if (Math.round(S.pBase.hp) < 0) { S.over = 'lose'; S.overT = 0; S.popup = null; S.mode = null; S.camTarget = ENV_X0; }
}

function endMatch() {
  const win = S.over === 'win';
  const pct = Math.max(0, S.pBase.hp / S.pBase.max);
  const ok = [win, win && pct >= 0.5, win && S.tick <= 48000];
  const stars = ok.filter(Boolean).length;
  S.result = { win, stars, ok, time: S.tick };
  if (win) {
    Meta.record(S.diff, stars, S.tick);
    Meta.unlock('win1');
    if (S.diff >= 2) Meta.unlock('win2');
    if (S.diff === 3) Meta.unlock('win3');
    if (S.tick < 36000) Meta.unlock('fast');
    if (pct > 0.5) Meta.unlock('fortress');
    if (S.stats.turrets === 0) Meta.unlock('noturret');
  }
  Meta.games++; Store.set('games', Meta.games);
  Meta.toast = null;   // the end screen lists what was unlocked
  clearSave();
  Game.screen = 'end'; S.endT = 0;
  Sfx.pauseMusic();
  Sfx.play(win ? 'win' : 'lose');
}

// camera, shake and slow motion run in real time, independent of the game speed
function updateCamera() {
  if (S.camTarget !== null && S.camTarget !== undefined) {
    const tgt = clampCam(S.camTarget);
    S.camX += (tgt - S.camX) * 0.14;
    if (Math.abs(tgt - S.camX) < 0.5) { S.camX = tgt; S.camTarget = null; }
  }
  const edge = Input.edgeScroll();
  if (edge) { S.camX += edge; S.camTarget = null; }
  if (Input.keys.left) { S.camX -= 9; S.camTarget = null; }
  if (Input.keys.right) { S.camX += 9; S.camTarget = null; }
  if (!Input.drag && Math.abs(S.inertia) > 0.1) { S.camX += S.inertia; S.inertia *= 0.9; }
  S.camX = clampCam(S.camX);
  const k = S.trauma * S.trauma * 7;
  S.shakeX = S.spShakeX + (Math.random() * 2 - 1) * k;
  S.shakeY = S.spShakeY + (Math.random() * 2 - 1) * k;
  S.trauma = Math.max(0, S.trauma - 0.03);
  if (S.cine) { S.cine.t++; if (S.cine.t > 150) S.cine = null; }
  if (S.banners.length) { const b = S.banners[0]; if (++b.t > b.life) S.banners.shift(); }
}

// positions at the start of a display tick, for interpolation between ticks
function snapPrev() {
  S.pcamX = S.camX;
  for (const u of S.units) u.px = u.x;
  for (const b of S.bullets) { b.px = b.x; b.py = b.y; }
  for (const p of S.parts) { p.px = p.x; p.py = p.y; }
  for (const sp of S.specials) if (sp.kind === 4) sp.px = sp.x;
}

// ------------------------------------------------------------------ input
const Input = {
  x: -1, y: -1, over: false, mouse: false, down: false, drag: null, keys: {}, pressId: null, pressBtn: null,
  toStage(e) {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) * dpr - offX) / scale, ((e.clientY - r.top) * dpr - offY) / scale];
  },
  edgeScroll() {
    if (!this.mouse || !this.over || Game.screen !== 'play' || Game.overlay || this.y <= TOP_H + 8 || this.y > BAR_Y - 4 || (S && (S.paused || S.popup))) return 0;
    if (this.x > viewW - 60 && this.x <= viewW) return (this.x - (viewW - 60)) / 6;
    if (this.x < 60 && this.x >= 0) return -(60 - this.x) / 6;
    return 0;
  },
};

let buttons = []; // rebuilt every frame: {id, x, y, w, h, onClick, onDown, onDrag, tip}

function findButton(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    const pad = Input.mouse ? 0 : 3;
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}
function hovered(b) { return Input.over && Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h; }
function pressed(b) { return Input.down && Input.pressId === b.id && hovered(b); }

function ensureAudio() {
  Sfx.init();
  applyAudioSettings();
  const want = Game.screen === 'play' ? 'battle' : 'title';
  const el = Sfx.audioEls[want];
  if (Sfx.track !== want || !el || el.paused) Sfx.playMusic(want);
}

cv.addEventListener('pointerdown', (e) => {
  Input.mouse = e.pointerType === 'mouse';
  if (Game.screen !== 'end') ensureAudio(); else Sfx.init();
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  const [x, y] = Input.toStage(e);
  Input.x = x; Input.y = y; Input.over = true; Input.down = true;
  const b = findButton(x, y);
  Input.pressId = b ? b.id : null; Input.pressBtn = b;
  if (b && b.onDown) b.onDown(x, y);
  if (b && b.tip && !Input.mouse) Game.touchTip = { b, t: performance.now() };
  if (!b && Game.screen === 'play' && S && !S.paused && !Game.overlay && y > TOP_H && y < BAR_Y) {
    Input.drag = { x0: x, cam0: S.camX, lastX: x, moved: 0, t: performance.now() };
    S.inertia = 0; S.camTarget = null;
  }
  e.preventDefault();
});
cv.addEventListener('pointermove', (e) => {
  Input.mouse = e.pointerType === 'mouse';
  const [x, y] = Input.toStage(e);
  const dx = x - Input.x;
  Input.x = x; Input.y = y; Input.over = true;
  if (Input.down && Input.pressBtn && Input.pressBtn.onDrag) Input.pressBtn.onDrag(x, y);
  if (Input.drag && S) {
    Input.drag.moved += Math.abs(dx);
    S.camX = clampCam(Input.drag.cam0 - (x - Input.drag.x0));
    S.pcamX = S.camX;
    const now = performance.now();
    const dt = Math.max(1, now - Input.drag.t);
    S.inertia = -(x - Input.drag.lastX) / dt * 25;
    Input.drag.lastX = x; Input.drag.t = now;
  }
});
cv.addEventListener('pointerup', (e) => {
  const [x, y] = Input.toStage(e);
  Input.x = x; Input.y = y; Input.down = false;
  const b = findButton(x, y);
  if (b && b.id === Input.pressId && b.onClick) b.onClick(x, y);
  else if (!b && (!Input.drag || Input.drag.moved < 6)) worldTap(x, y);
  if (Input.drag && performance.now() - Input.drag.t > 80 && S) S.inertia = 0;
  Input.drag = null; Input.pressId = null; Input.pressBtn = null;
  if (!Input.mouse) Input.over = false;
});
cv.addEventListener('pointercancel', () => { Input.drag = null; Input.down = false; Input.pressBtn = null; });
cv.addEventListener('pointerleave', () => { if (Input.mouse) Input.over = false; });
cv.addEventListener('wheel', (e) => {
  if (Game.screen === 'play' && S && !Game.overlay) { S.camX = clampCam(S.camX + (e.deltaX || e.deltaY) * 0.6); S.camTarget = null; e.preventDefault(); }
}, { passive: false });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') Input.keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') Input.keys.right = true;
  if (Game.screen !== 'play' || !S || S.over) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
  if (e.code === 'Escape') {
    if (Game.overlay) Game.overlay = null;
    else if (S.popup || S.mode) { S.popup = null; S.mode = null; S.buildId = 0; }
    else togglePause();
    return;
  }
  if (S.paused || Game.overlay) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= 4) { const ids = unitIdsForAge(S.tech); if (ids[n - 1]) trainUnit(ids[n - 1]); }
  if (e.code === 'KeyQ') useSpecial(1);
  if (e.code === 'KeyE') evolve();
  if (e.code === 'KeyT') togglePopup('turrets');
  if (e.code === 'KeyU') togglePopup('upgrades');
  if (e.code === 'KeyX') cycleSpeed();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') Input.keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') Input.keys.right = false;
});

function togglePause() {
  if (Game.screen !== 'play' || !S || S.over) return;
  S.paused = !S.paused;
  Game.overlay = null;
  if (S.paused) saveMatch();
  Sfx.play(S.paused ? 'open' : 'close');
}
function togglePopup(name) {
  if (!S || S.over) return;
  S.mode = null; S.buildId = 0;
  S.popup = S.popup === name ? null : name;
  Sfx.play(S.popup ? 'open' : 'close');
}
function cycleSpeed() {
  S.speed = S.speed % 3 + 1;
  Settings.speed = S.speed; saveSettings();
  Sfx.play('tick');
}

// tap on the battlefield: close menus, or show the health bar of the tapped units
function worldTap(x, y) {
  if (!S || Game.screen !== 'play' || S.paused || Game.overlay) return;
  if (S.popup) { S.popup = null; Sfx.play('close'); return; }
  const wx = x + S.camX;
  for (const u of S.units) {
    if (u.dead) continue;
    if (wx >= u.x - u.w / 2 && wx <= u.x + u.w / 2 && y >= u.y - u.h - 12 && y <= u.y + 2) u.hbT = 100;
  }
}

function unitIdsForAge(a) { const b = (a - 1) * 3; const r = [b + 1, b + 2, b + 3]; if (a === 5) r.push(16); return r; }
function turretIdsForAge(a) { const b = (a - 1) * 3; return [b + 1, b + 2, b + 3]; }

// ------------------------------------------------------------------ additive glow sprites
const GLOW_COL = { warm: '255,170,60', hot: '255,230,150', cool: '90,190,255', red: '255,60,50', green: '90,255,110' };
const Glow = { scale: 0, img: {} };
function glowSprite(kind) {
  if (Glow.scale !== scale) { Glow.img = {}; Glow.scale = scale; }
  if (!Glow.img[kind]) {
    const col = GLOW_COL[kind] || GLOW_COL.warm;
    Glow.img[kind] = renderTo(64, 64, Math.min(2, scale) * 0.6, () => {
      const c = G.ctx;
      c.fillStyle = radGrad(32, 32, 0, 32, [[0, `rgba(${col},0.95)`], [0.25, `rgba(${col},0.5)`], [0.6, `rgba(${col},0.14)`], [1, `rgba(${col},0)`]]);
      c.fillRect(0, 0, 64, 64);
    });
  }
  return Glow.img[kind];
}
function glowAt(kind, x, y, r, a) {
  if (a <= 0.01) return;
  const c = G.ctx;
  c.globalAlpha = Math.min(1, a);
  c.drawImage(glowSprite(kind), x - r, y - r, r * 2, r * 2);
}

// ------------------------------------------------------------------ world rendering
function drawWorld(alpha) {
  const c = G.ctx;
  const cam = S.pcamX + (S.camX - S.pcamX) * alpha;
  const sx = S.shakeX, sy = S.shakeY;
  const x0 = cam - 140, x1 = cam + viewW + 140;
  save(); tr(sx * 0.3, sy * 0.3); drawEnvironment(cam, Game.t); restore();
  save();
  tr(-cam + sx, sy);
  drawNear(cam);
  // bases
  const pb = baseImage(S.tech, S.addons), eb = baseImage(S.etech, S.eaddons);
  const drawBaseImg = (b, img, mirror) => {
    save(); if (mirror) { tr(ENEMY_BASE_X, 0); scl(-1, 1); } else tr(PLAYER_BASE_X, 0);
    blitAt(img.img, img.ox, GROUND_Y + img.oy, 200, 360);
    if (b.flash > 0) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = b.flash / 4 * 0.25; c.drawImage(img.img, img.ox, GROUND_Y + img.oy, 200, 360); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    restore();
  };
  drawBaseImg(S.pBase, pb, false);
  drawBaseImg(S.eBase, eb, true);
  for (const tu of S.spots) if (tu) drawTurretObj(tu);
  for (const tu of S.espots) if (tu) drawTurretObj(tu);
  // bullets
  for (const b of S.bullets) {
    const bx = b.px + (b.x - b.px) * alpha;
    if (bx < x0 || bx > x1) continue;
    drawBullet(Object.assign({}, b, { x: bx, y: b.py + (b.y - b.py) * alpha }));
  }
  // unit shadows then units
  for (const u of S.units) {
    const x = u.px + (u.x - u.px) * alpha;
    if (x < x0 || x > x1) continue;
    if (u.dead && u.dc > 60) c.globalAlpha = Math.max(0, 1 - (u.dc - 60) / 20);
    save(); tr(x, u.y); drawShadow(u.dead ? u.w * 0.8 : u.w); restore();
    c.globalAlpha = 1;
  }
  for (const u of S.units) {
    const x = u.px + (u.x - u.px) * alpha;
    if (x < x0 || x > x1) continue;
    drawUnitObj(u, x, alpha);
  }
  // heal auras (green for the player, purple for the enemy)
  for (const side of [1, 2]) {
    if ((side === 1 ? S.heal : S.eheal) <= 0) continue;
    const col = side === 1 ? '230,255,120' : '230,140,255';
    for (const u of S.units) if (u.side === side && !u.dead) {
      const x = u.px + (u.x - u.px) * alpha;
      const a = 0.45 + 0.15 * Math.sin(Game.t * 0.3 + u.uid);
      c.fillStyle = linGrad(0, u.y - 26, 0, u.y + 2, [[0, `rgba(${col},0)`], [1, `rgba(${col},${a})`]]);
      c.fillRect(x - u.w * 0.5, u.y - 26, u.w, 28);
      ell(x, u.y, u.w * 0.55, 4, `rgba(${col},${a})`, null);
    }
  }
  for (const f of S.fx) drawShotFx(f);
  // particles
  for (const p of S.parts) {
    const px = p.px + (p.x - p.px) * alpha;
    if (px < x0 || px > x1 || p.type === 'glow') continue;
    if (p.type === 'stain') { c.globalAlpha = p.alpha * 0.8; ell(px, p.y, p.size * 1.8, p.size * 0.5, '#6a0c08', null); c.globalAlpha = 1; continue; }
    if (p.type === 'stuck') { c.globalAlpha = p.alpha; save(); tr(px, p.y); rot(p.rot); pline([-12, 0, 2, 0], '#7a5230', 1.2); poly([-12, 0, -16, -3, -10, 0], '#2f8f2f', null); restore(); c.globalAlpha = 1; continue; }
    drawParticle(Object.assign({}, p, { x: px, y: p.py + (p.y - p.py) * alpha }));
  }
  // planes of the air strike
  for (const sp of S.specials) {
    if (sp.kind !== 4) continue;
    save(); tr(sp.px + (sp.x - sp.px) * alpha, sp.y); if (sp.dir < 0) scl(-1, 1); drawPlane(0, 0, Game.t); restore();
  }
  drawGlowPass(alpha, x0, x1);
  // health bars of damaged / tapped units
  for (const u of S.units) {
    if (u.dead || u.x < x0 || u.x > x1) continue;
    const hov = Input.mouse && Input.over && Input.y > TOP_H && Input.y < BAR_Y && (() => { const wx = Input.x + cam; return wx >= u.x - u.w / 2 && wx <= u.x + u.w / 2 && Input.y >= u.y - u.h && Input.y <= u.y; })();
    if (u.hp >= u.max - 0.5 && !hov && u.hbT <= 0) continue;
    const x = u.px + (u.x - u.px) * alpha;
    const w = clamp(u.w * 0.55, 18, 44), y = u.y - u.h - 8;
    rect(x - w / 2 - 0.5, y - 0.5, w + 1, 4, 'rgba(0,0,0,0.6)', null);
    rect(x - w / 2, y, w * clamp(u.hp / u.max, 0, 1), 3, u.side === 1 ? '#63d84a' : '#ff4a3a', null);
  }
  // damage numbers
  if (Settings.dmgNumbers) for (const n of S.nums) {
    const k = n.t / 40;
    c.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    const big = n.v >= 200;
    const pop = n.t < 4 ? 1 + (4 - n.t) * 0.12 : 1;
    const size = (big ? 15 : n.v >= 60 ? 12 : 10) * pop;
    text(String(n.v), n.x, n.y - n.t * 0.7, { font: `bold ${size}px ${FONT_HUD}`, color: n.side === 2 ? (big ? '#ffe45a' : '#ffffff') : '#ff7a5a', stroke: 'rgba(40,10,0,0.85)', sw: 2.5, align: 'center', base: 'middle' });
  }
  c.globalAlpha = 1;
  // build / sell markers on the player base
  if (S.mode === 'build' || S.mode === 'sell') {
    const list = S.mode === 'build' ? freeSpots() : usedSpots();
    for (const i of list) {
      const x = TURRET_SPOT_X, y = GROUND_Y + TURRET_SPOT_Y[i];
      const b = { id: 'spot' + i, x: x - 20 - cam + sx, y: y - 20 + sy, w: 40, h: 40, onClick: () => S.mode === 'build' ? buildAt(i) : sellAt(i) };
      buttons.push(b);
      const h = hovered(b);
      const pulse = 0.55 + 0.45 * Math.sin(Game.t * 0.25);
      c.globalCompositeOperation = 'lighter';
      glowAt(S.mode === 'build' ? 'hot' : 'red', x, y, 26, 0.5 + pulse * 0.4);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      drawSpotMarker(x, y, h ? '#ffff00' : S.mode === 'build' ? `rgba(255,230,80,${pulse})` : `rgba(255,60,40,${pulse})`);
      if (S.mode === 'build') { c.globalAlpha = 0.5; save(); tr(x, y); drawTurret(S.buildId, 0, 0, 1); restore(); c.globalAlpha = 1; }
      else text('+' + Math.round(TURRETS[S.spots[i].id].cost / 2), x + 22, y - 6, { font: `bold 11px ${FONT_HUD}`, color: '#ffe45a', stroke: '#3a2000', sw: 2.5 });
    }
  }
  restore();
  drawCinematic(cam);
}

function drawGlowPass(alpha, x0, x1) {
  const c = G.ctx;
  c.globalCompositeOperation = 'lighter';
  for (const p of S.parts) {
    const x = p.px + (p.x - p.px) * alpha;
    if (x < x0 || x > x1) continue;
    const y = p.py + (p.y - p.py) * alpha;
    const k = p.t / p.life;
    switch (p.type) {
      case 'explosion': if (k < 0.6) glowAt('warm', x, y - p.size * 0.3, p.size * 2.6, (1 - k / 0.6) * 0.9); break;
      case 'flash': glowAt(p.col || 'hot', x, y, p.size * 3.2, (1 - k) * 0.9); break;
      case 'glow': glowAt(p.col || 'warm', x, y, p.size * (1 + k * 0.5), (1 - k) * 0.9); break;
      case 'ionblast': glowAt('cool', x, y, p.size * 1.8, (1 - k) * 0.9); break;
      case 'fireshard': glowAt('warm', x, y, 12, 0.7); break;
      case 'burn': glowAt('warm', x, y - 3, 14, p.alpha * 0.55); break;
      case 'beam': glowAt('cool', x, y - 60, 70, (1 - k) * 0.6); break;
    }
  }
  for (const b of S.bullets) {
    const x = b.px + (b.x - b.px) * alpha;
    if (x < x0 || x > x1) continue;
    const y = b.py + (b.y - b.py) * alpha;
    if (b.type === 'meteor') glowAt('warm', x, y - 3, 26 * b.scale, 0.85);
    else if (b.type === 4) glowAt('warm', x, y, 16, 0.8);
    else if (b.type === 9) glowAt('warm', x - Math.cos(b.rot) * 20, y - Math.sin(b.rot) * 20, 14, 0.7);
    else if (b.type === 10) glowAt('red', x, y, 16, 0.8);
    else if (b.type === 11) glowAt('cool', x, y, 16, 0.8);
    else if (b.type === 12) glowAt('green', x, y, 16, 0.8);
  }
  for (const f of S.fx) {
    if (f.kind !== 'laser' && f.kind !== 'ionbolt') continue;
    const k = f.t / f.life;
    glowAt(f.kind === 'laser' ? 'red' : 'cool', lerp(f.x0, f.x1, k), lerp(f.y0, f.y1, k), 12, 0.7);
  }
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

// evolution: light rays from the player's base and a white flash
function drawCinematic(cam) {
  const cn = S.cine;
  if (!cn) return;
  const c = G.ctx;
  const t = cn.t;
  const bx = 70 - cam + S.shakeX, by = 330;
  const a = t < 20 ? t / 20 : Math.max(0, 1 - (t - 20) / 110);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.translate(bx, by);
  c.rotate(t * 0.01);
  for (let i = 0; i < 14; i++) {
    c.rotate(Math.PI * 2 / 14);
    c.fillStyle = `rgba(255,230,150,${0.16 * a})`;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(900, -40 - (i % 3) * 20); c.lineTo(900, 40 + (i % 3) * 20); c.closePath(); c.fill();
  }
  c.restore();
  c.globalCompositeOperation = 'lighter';
  glowAt('hot', bx, by, 160 + t, a * 0.8);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  if (t < 14) { c.fillStyle = `rgba(255,255,255,${(1 - t / 14) * 0.85})`; c.fillRect(0, 0, viewW, STAGE_H); }
}

function drawTurretObj(tu) {
  const T0 = TURRETS[tu.id];
  const k = tu.playing ? tu.anim / T0.alen : 0;
  save(); tr(tu.rx, tu.ry);
  if (tu.born < 20) { const s = 0.6 + 0.4 * smooth(tu.born / 14) + Math.sin(tu.born / 20 * Math.PI) * 0.12; scl(s); }
  drawTurret(tu.id, tu.ang, k, tu.side);
  restore();
}

function drawUnitObj(u, x, alpha) {
  const c = G.ctx;
  const len = Math.max(1, u.len);
  const f = u.dead ? u.f : ((u.f - 1 + alpha) % len + len) % len;
  if (u.dead && u.dc > 60) c.globalAlpha = Math.max(0, 1 - (u.dc - 60) / 20);
  save(); tr(x, u.y);
  if (u.side === 2) scl(-1, 1);
  blitUnit(u.id, u.anim, f, len, u.hit, u.v);
  if (u.flash > 0 && !u.dead) {
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = u.flash / 4 * 0.55;
    blitUnit(u.id, u.anim, f, len, u.hit, u.v);
    c.globalCompositeOperation = 'source-over';
  }
  restore();
  c.globalAlpha = 1;
}

function drawShotFx(f) {
  const k = f.t / f.life;
  const x = lerp(f.x0, f.x1, k), y = lerp(f.y0, f.y1, k) - (f.kind === 'stone' ? Math.sin(k * Math.PI) * 10 : 0);
  if (f.kind === 'stone') circ(x, y, 1.8, '#7d7a70', OUT, 0.5);
  else if (f.kind === 'bolt') { save(); tr(x, y); rot(Math.atan2(f.y1 - f.y0, f.x1 - f.x0)); pline([-6, 0, 4, 0], '#6a4a2a', 1.2); poly([4, -1.5, 7, 0, 4, 1.5], '#aaa', null); restore(); }
  else if (f.kind === 'tracer') { const x2 = lerp(f.x0, f.x1, Math.max(0, k - 0.25)), y2 = lerp(f.y0, f.y1, Math.max(0, k - 0.25)); pline([x2, y2, x, y], 'rgba(255,240,150,0.95)', 1.3); }
  else if (f.kind === 'laser' || f.kind === 'ionbolt') {
    const col = f.kind === 'laser' ? '255,40,40' : '40,210,255';
    const x2 = lerp(f.x0, f.x1, Math.max(0, k - 0.4)), y2 = lerp(f.y0, f.y1, Math.max(0, k - 0.4));
    pline([x2, y2, x, y], `rgba(${col},0.5)`, 4); pline([x2, y2, x, y], '#fff', 1.2);
  }
}

// ------------------------------------------------------------------ fullscreen
function canFullscreen() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
}
function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) {
    const rq = el.requestFullscreen || el.webkitRequestFullscreen;
    if (rq) { const p = rq.call(el); if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {}); }
  } else {
    const ex = d.exitFullscreen || d.webkitExitFullscreen;
    if (ex) ex.call(d);
  }
}

// ------------------------------------------------------------------ main loop
let acc = 0, lastT = performance.now();
const TICK = 1000 / FPS;

// adaptive resolution: if the device cannot keep ~45 fps while playing, render with fewer pixels
const perf = { n: 0, sum: 0 };
function adaptQuality(dt) {
  if (Game.screen !== 'play' || document.hidden || dt > 200) { perf.n = 0; perf.sum = 0; return; }
  perf.n++; perf.sum += dt;
  if (perf.n >= 90) {
    const avg = perf.sum / perf.n;
    perf.n = 0; perf.sum = 0;
    if (avg > 22 && dpr > 1) { Game.maxDpr = Math.max(1, dpr - 0.5); resize(); }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = now - lastT; lastT = now;
  adaptQuality(dt);
  if (dt > 250) dt = 250;
  acc += dt;
  while (acc >= TICK) {
    acc -= TICK;
    Game.t++;
    tickUI();
    if ((Game.screen === 'play' || Game.screen === 'end') && S) {
      snapPrev();
      if (!S.paused && !Game.overlay) {
        let n = S.over ? 1 : S.speed;
        if (S.slow > 0) { S.slow--; n = Game.t % 2; }
        for (let i = 0; i < n; i++) step();
        updateCamera();
      }
    }
  }
  render(acc / TICK);
}

function render(alpha) {
  const c = ctx;
  G.set(c);
  Sprites.beginFrame();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // every screen paints the whole stage, so only the bars around it need clearing
  const sw = viewW * scale, sh = STAGE_H * scale;
  c.fillStyle = '#000';
  if (offX > 0) { c.fillRect(0, 0, offX + 1, cv.height); c.fillRect(offX + sw - 1, 0, cv.width - offX - sw + 1, cv.height); }
  if (offY > 0) { c.fillRect(0, 0, cv.width, offY + 1); c.fillRect(0, offY + sh - 1, cv.width, cv.height - offY - sh + 1); }
  if (offY > 1) {
    // letterbox (4:3 tablets, portrait): extend the sky above and the dirt below instead of black bars
    c.fillStyle = AGE_ENV[Env.age].sky[0][1];
    c.fillRect(offX, 0, viewW * scale, offY + 2);
    c.fillStyle = '#20170d';
    c.fillRect(offX, offY + STAGE_H * scale - 2, viewW * scale, cv.height - offY - STAGE_H * scale + 2);
  }
  c.setTransform(scale, 0, 0, scale, offX, offY);
  c.save();
  c.beginPath(); c.rect(0, 0, viewW, STAGE_H); c.clip();
  c.lineJoin = 'round'; c.lineCap = 'round';
  buttons = [];
  drawScreen(alpha);
  drawToast();
  c.restore();
  drawPortraitHint();
  const b = Input.over && Input.mouse ? findButton(Input.x, Input.y) : null;
  cv.style.cursor = b ? 'pointer' : 'default';
}

function drawPortraitHint() {
  const el = document.getElementById('rotate');
  el.style.display = cssH <= cssW * 1.05 || Game.portraitOk ? 'none' : 'flex';
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (S && Game.screen === 'play' && !S.over) { if (!S.paused) S.paused = true; saveMatch(); }
    Sfx.pauseMusic();
  } else if (Sfx.ctx && Sfx.track) Sfx.playMusic(Sfx.track, true);
});
window.addEventListener('pagehide', () => { if (S && Game.screen === 'play' && !S.over) saveMatch(); });
