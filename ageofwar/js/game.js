'use strict';
// Age of War remake: simulation (a tick-for-tick port of the original rules at 40 ticks per second),
// enemy AI, HUD, screens, input and rendering.

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
G.set(ctx);

let lang = (localStorage.getItem('aow_lang') || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'));
let T = I18N[lang];
function setLang(l) { lang = l; T = I18N[l]; try { localStorage.setItem('aow_lang', l); } catch (e) {} document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en'; }
setLang(lang);

const FONT_SERIF = '"AoWSerif", "Bookman Old Style", "Songti SC", "Noto Serif CJK SC", "Noto Serif SC", serif';
const FONT_HUD = 'Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif';
const FONT_TITLE = '"AoWTitle", "Castellar", "Trajan Pro", serif';

// ------------------------------------------------------------------ layout
let dpr = 1, scale = 1, offX = 0, offY = 0, viewW = BASE_STAGE_W, cssW = 0, cssH = 0;
let rightX = 0; // how far the right HUD panels move when the view is wider than the original stage
const caches = {};

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
  // keep the stage out of notches / rounded corners
  const [it, ir, ib, il] = safeInsets();
  const aw = Math.max(100, cssW - il - ir), ah = Math.max(100, cssH - it - ib);
  const aspect = aw / ah;
  viewW = clamp(STAGE_H * aspect, BASE_STAGE_W, WORLD_W);
  scale = Math.min(aw * dpr / viewW, ah * dpr / STAGE_H);
  offX = Math.round(il * dpr + (aw * dpr - viewW * scale) / 2);
  offY = Math.round(it * dpr + (ah * dpr - STAGE_H * scale) / 2);
  rightX = viewW - BASE_STAGE_W;
  buildCaches();
  if (S) S.camX = clamp(S.camX, 0, WORLD_W - viewW);
}

function buildCaches() {
  const s = scale;
  caches.bg = renderTo(WORLD_W, STAGE_H, s, () => drawBackground(WORLD_W));
  caches.menuFar = renderTo(WORLD_W + 120, STAGE_H, s, () => drawMenuFar(WORLD_W + 120));
  caches.menuNear = renderTo(WORLD_W + 120, STAGE_H, s, () => drawMenuNear(WORLD_W + 120));
  caches.base = {};
  caches.icons = {};
  caches.panels = null;
}

function baseImage(age, addons) {
  const key = age + '_' + addons;
  if (!caches.base[key]) {
    // draw with generous margins: bases extend left of 0 and up to the tallest tower top
    caches.base[key] = { img: renderTo(200, 360, scale, () => { tr(20, 330); drawBase(age, addons); }), ox: -20, oy: -330 };
  }
  return caches.base[key];
}

// ------------------------------------------------------------------ game state
const Game = { screen: 'start', prevScreen: null, t: 0, fadeT: 0, menuUnit: 1, menuUnitT: 0, soundOn: true, portraitOk: false };
let S = null;

function newMatch(diff) {
  S = {
    diff, tick: 0, cash: START_CASH, xp: 0, tech: 1, etech: 1, addons: 0, eaddons: 0,
    spots: [null, null, null, null], espots: [null, null, null, null],
    units: [], uid: 1, bullets: [], parts: [], fx: [], specials: [],
    pBase: { base: true, side: 1, x: 50, y: GROUND_Y, w: 186.8, h: 76.5, hp: BASE_HP, max: BASE_HP, l: -17.3, r: 169.5, t: 349.5 },
    eBase: { base: true, side: 2, x: 950, y: GROUND_Y, w: 201.2, h: 76.5, hp: BASE_HP, max: BASE_HP, l: 854.8, r: 1055.9, t: 349.5 },
    tray: [0, 0, 0, 0, 0], trainId: 0, trainTimer: -1, trainTotal: 0,
    specTimer: SPECIAL_COOLDOWN - 1, heal: 0,
    ai: { timer: 0, uTimer: -1, check: false, action: 0, uof: 0, techTimer: 0, unitLevel: 1, will: 0, uTotal: 0 },
    camX: 0, pcamX: 0, shakeX: 0, shakeY: 0, paused: false, over: null, overT: 0,
    menu: 'main', desc: '', buildId: 0, flash: 0, evolveFlash: 0,
    inertia: 0,
  };
  S.entities = [S.pBase, S.eBase];
}

// ------------------------------------------------------------------ units
function spawnUnit(id, side) {
  const U = UNITS[id];
  const m = side === 2 ? DIFF_MULT[S.diff] : 1;
  const u = {
    id, side, uid: S.uid++, x: (side === 1 ? PLAYER_SPAWN_X : ENEMY_SPAWN_X) + Math.random(), y: GROUND_Y,
    hp: U.hp * m, max: U.hp * m, dmg: U.dmg * m, rdmg: U.rdmg * m, mr: U.mr, rr: U.rr, w: U.w, h: U.h,
    speed: side === 1 ? UNIT_SPEED : -UNIT_SPEED,
    closest: side === 1 ? 300 : -300, ed: side === 1 ? 300 : -300, limit: 100, target: null, c: 3,
    moving: false, melee: false, ranged: false,
    anim: 'walk', f: 0, len: U.anim.walk, v: 0, hit: 0,
    dead: false, dc: 0, reward: Math.round(U.cost * 1.3), hbT: 0, t: 0,
  };
  u.px = u.x;
  S.units.push(u);
  S.entities.push(u);
  return u;
}

function setAnim(u, label) {
  const A = UNITS[u.id].anim;
  if (u.anim !== label) {
    u.anim = label; u.f = 0;
    pickAnim(u);
  }
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

function damageEntity(e, dmg) {
  if (!e) return;
  e.hp -= dmg;
}

function bloodAt(e, n) {
  if (!e || e.base) return;
  if (e.id === 12) { for (let i = 0; i < 3; i++) addPart('spark', e.x, e.y - e.h / 1.5); return; }
  if (e.id === 15) { for (let i = 0; i < n; i++) addPart('spark', e.x, e.y - e.h / 1.5); return; }
  for (let i = 0; i < n; i++) addPart('blood', e.x, e.y - e.h / 1.5);
}

const MELEE_SFX = { 1: 'hit', 2: 'hit', 3: 'hit', 4: 'metal', 5: 'metal', 6: 'metal', 7: 'metal', 8: 'musket', 9: 'cannon', 10: 'metal', 11: 'gun', 12: 'cannon', 13: 'metal', 14: 'hit', 15: 'boom', 16: 'hit' };
const RANGED_SFX = { 2: 'sling', 5: 'bow', 8: 'musket', 11: 'gun', 14: 'laser', 16: 'ion' };

function unitHit(u, ranged) {
  const e = u.target;
  const dmg = ranged ? u.rdmg : u.dmg;
  if (e) {
    e.hp -= dmg - Math.random() * 2;
    bloodAt(e, 5);
  }
  if (ranged) {
    Sfx.play(RANGED_SFX[u.id] || 'hit');
    if (e) shotFx(u, e);
  } else {
    Sfx.play(MELEE_SFX[u.id] || 'hit');
    if (e && (u.id === 12 || u.id === 15 || u.id === 9)) {
      // cannon style melee: muzzle flash + blast at the target
      const tx = u.side === 1 ? u.x + u.ed : u.x + u.ed;
      addPart(u.id === 15 ? 'ionblast' : 'explosion', tx, GROUND_Y - (e.base ? 25 : e.h * 0.45), { size: u.id === 9 ? 16 : 26, life: 18 });
    }
    if (e && u.id === 8) shotFx(u, e);
  }
}

// purely cosmetic projectile for ranged unit attacks (the original deals the damage instantly)
function shotFx(u, e) {
  const dir = u.side === 1 ? 1 : -1;
  const sx = u.x + dir * u.w * 0.6, sy = u.y - u.h * 0.62;
  let tx = e.base ? (u.side === 1 ? e.l + 20 : e.r - 20) : e.x;
  tx = u.x + u.ed * 1 + (e.base ? 0 : 0);
  if (!e.base) tx = e.x;
  const ty = e.base ? GROUND_Y - 30 - Math.random() * 20 : e.y - e.h * 0.55;
  const kind = { 2: 'stone', 5: 'bolt', 8: 'tracer', 11: 'tracer', 14: 'laser', 16: 'ionbolt' }[u.id] || 'tracer';
  S.fx.push({ kind, x0: sx, y0: sy, x1: tx, y1: ty, t: 0, life: kind === 'stone' ? 10 : 5 });
  if (kind === 'tracer' || kind === 'laser' || kind === 'ionbolt') addPart('flash', sx, sy, { size: 4, life: 3 });
  if (u.id === 8) { for (let i = 0; i < 3; i++) addPart('smoke', sx + dir * 4, sy, { size: 4 + Math.random() * 3, vy: -0.3, life: 30, color: 'rgba(210,210,210,0.8)' }); }
}

function updateUnit(u) {
  u.px = u.x;
  u.t++;
  if (u.hbT > 0) u.hbT--;
  if (!u.dead && u.hp > 0) {
    if (S.heal > 0 && u.side === 1 && u.hp < u.max) u.hp = Math.min(u.max, u.hp + 1);
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
    // advance the animation clip and fire its hit frame
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
        S.cash += u.reward;
        S.xp += u.reward * 2;
        addPart('gold', u.x, u.y - u.h - 6, { value: u.reward });
        Sfx.play('coin');
      } else {
        S.xp += Math.round(u.reward / 2);
      }
      bloodAt(u, 9);
      Sfx.play(u.id === 12 || u.id === 15 ? 'boom' : 'die');
      if (u.id === 12 || u.id === 15) {
        addPart('explosion', u.x, u.y - 20, { size: 40, life: 28 });
        for (let i = 0; i < 6; i++) addPart('smoke', u.x + (Math.random() - 0.5) * u.w * 0.6, u.y - 20, { size: 6 + Math.random() * 6, vy: -0.5, life: 60, color: 'rgba(50,50,50,0.7)' });
      }
      u.anim = 'die'; u.f = 0; u.len = UNITS[u.id].anim.die;
    }
    if (u.f < u.len) u.f++;
    u.dc++;
  }
}

// ------------------------------------------------------------------ turrets
function placeTurret(side, spot, id) {
  const tu = { id, side, spot, st: 0, c: 0, ed: 100000, edH: 0, target: null, ang: side === 1 ? 0 : 180, anim: 0, playing: false };
  tu.rx = side === 1 ? PLAYER_BASE_X + TURRET_SPOT_X : ENEMY_BASE_X - TURRET_SPOT_X;
  tu.ry = GROUND_Y + TURRET_SPOT_Y[spot];
  (side === 1 ? S.spots : S.espots)[spot] = tu;
  return tu;
}

function updateTurret(tu) {
  const T0 = TURRETS[tu.id];
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
function fireTurret(tu) {
  const T0 = TURRETS[tu.id];
  createBullet(tu.rx, tu.ry, tu.ang, T0.dmg, T0.bullet, tu.side);
  Sfx.play(TURRET_SFX[tu.id]);
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

function bulletHit(b, e) {
  e.hp -= b.dmg;
  const t = b.type;
  if (t === 1 || t === 3) { for (let i = 0; i < 4; i++) addPart('debris', b.x, b.y); }
  if (t === 4) { for (let i = 0; i < 3; i++) addPart('fireshard', b.x, b.y, { side: b.side }); addPart('explosion', b.x, b.y, { size: 14, life: 28 }); Sfx.play('boom'); }
  if (t === 6) { for (let i = 0; i < 5; i++) addPart('debris', b.x, b.y, { v: 1 }); }
  if (t === 7) { for (let i = 0; i < 3; i++) addPart('shrapnel', b.x, b.y, { side: b.side }); addPart('explosion', b.x, b.y, { size: 18, life: 28 }); Sfx.play('boom'); }
  if (t === 9) { addPart('explosion', b.x, b.y, { size: 16, life: 28 }); Sfx.play('boom'); }
  if (t === 'meteor') { for (let i = 0; i < 4; i++) addPart('debris', b.x, b.y); Sfx.play('boom'); }
  if (t === 'bomb') { addPart('explosion', b.x, b.y - 10, { size: 34, life: 28 }); addPart('flash', b.x, b.y - 10, { size: 26, life: 6 }); Sfx.play('boom'); }
  if (t !== 2) bloodAt(e, 5);
  b.dead = true;
}

function bulletGround(b) {
  const t = b.type;
  if (t === 1 || t === 3 || t === 'meteor') { for (let i = 0; i < 7; i++) addPart('debris', b.x, b.y - (t === 'meteor' ? 10 : 0)); if (t === 'meteor') { Sfx.play('boom'); addPart('explosion', b.x, b.y - 6, { size: 18, life: 20 }); } }
  if (t === 4) { for (let i = 0; i < 3; i++) addPart('fireshard', b.x, b.y, { side: b.side }); addPart('burn', b.x, b.y); addPart('explosion', b.x, b.y, { size: 14, life: 28 }); Sfx.play('boom'); }
  if (t === 6) { for (let i = 0; i < 5; i++) addPart('debris', b.x, b.y, { v: 1 }); }
  if (t === 7) { for (let i = 0; i < 4; i++) addPart('shrapnel', b.x, b.y, { side: b.side }); addPart('explosion', b.x, b.y, { size: 18, life: 28 }); Sfx.play('boom'); }
  if (t === 9) { addPart('explosion', b.x, b.y, { size: 16, life: 28 }); Sfx.play('boom'); }
  if (t === 'bomb') { addPart('explosion', b.x, b.y - 10, { size: 34, life: 28 }); addPart('flash', b.x, b.y - 12, { size: 30, life: 6 }); Sfx.play('boom'); }
  b.dead = true;
}

function updateBullet(b) {
  b.px = b.x; b.py = b.y; b.t++;
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
  }
  p.px = p.x; p.py = p.y;
  S.parts.push(p);
  return p;
}

function updatePart(p) {
  p.px = p.x; p.py = p.y; p.t++;
  switch (p.type) {
    case 'blood': case 'debris': case 'splash': case 'spark':
      p.g += p.gf; p.vx /= 1.1; p.x += p.vx; p.y += p.g; p.rot += p.rv || 0;
      if (p.y > GROUND_Y || p.t > (p.type === 'spark' ? 20 : 200)) p.dead = true;
      break;
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
        if (e) { e.hp -= p.dmgP; addPart('explosion', p.x, p.y, { size: 8, life: 20 }); bloodAt(e, 5); p.dead = true; }
      }
      if (p.type === 'fireshard' && p.t % 2 === 0) addPart('smoke', p.x, p.y, { size: 2, vy: -0.4, life: 12, color: 'rgba(255,160,40,0.8)' });
      break;
    }
    case 'oil': {
      p.g += p.gf; p.y += p.g;
      const e = hitTest(p.x, p.y, p.side);
      if (e) { e.hp -= p.dmg; for (let i = 0; i < 3; i++) addPart('splash', p.x, p.y); bloodAt(e, 2); p.dead = true; }
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

// ------------------------------------------------------------------ specials
function useSpecial() {
  if (!S || S.over || S.specTimer < SPECIAL_COOLDOWN) { Sfx.play('deny'); return; }
  S.specTimer = 0;
  const age = S.tech;
  if (age === 1) S.specials.push({ kind: 1, timer: 200, cc: 0 });
  if (age === 2) S.specials.push({ kind: 2, timer: 200, cc: 0 });
  if (age === 3) { S.specials.push({ kind: 3, timer: 600 }); S.heal = 600; Sfx.play('heal'); }
  if (age === 4) { S.specials.push({ kind: 4, x: -100, px: -100, y: 200, cc: 0 }); Sfx.play('plane'); }
  if (age === 5) { S.specials.push({ kind: 5, x: 150, y: GROUND_Y, cc: 0, timer: 57 }); }
  if (age !== 3 && age !== 4) Sfx.play('special');
}

function updateSpecials() {
  S.shakeX = 0; S.shakeY = 0;
  for (const sp of S.specials) {
    if (sp.kind === 1 || sp.kind === 2) {
      sp.cc++; sp.timer--;
      if (sp.cc === (sp.kind === 1 ? 9 : 5)) {
        sp.cc = 0;
        const rotD = 80 + Math.floor(Math.random() * 20), r = D(rotD);
        const b = { type: sp.kind === 1 ? 'meteor' : 'arrow', x: Math.floor(Math.random() * 500) + 200, y: -100, vx: 10 * Math.cos(r), vy: 10 * Math.sin(r), g: 0, dmg: 200, side: 1, rot: r, scale: (Math.floor(Math.random() * 70) + 120) / 100, t: 0 };
        b.px = b.x; b.py = b.y;
        S.bullets.push(b);
      }
      const a = sp.kind === 1 ? 5 : 2;
      S.shakeX += Math.random() * a * 2 - a; S.shakeY += Math.random() * a * 2 - a;
      if (sp.timer <= 0) sp.done = true;
    } else if (sp.kind === 3) {
      sp.timer--; if (sp.timer <= 0) sp.done = true;
    } else if (sp.kind === 4) {
      sp.px = sp.x; sp.cc++;
      if (sp.cc === 15 && sp.x < 700) {
        const b = { type: 'bomb', x: sp.x, y: sp.y, vx: 4, vy: 1, g: 0, dmg: 400, side: 1, rot: 0, spin: Math.floor(Math.random() * 10) - 5, t: 0 };
        b.px = b.x; b.py = b.y;
        S.bullets.push(b); sp.cc = 0;
      }
      sp.x += 4;
      S.shakeX += Math.random() * 2 - 1; S.shakeY += Math.random() * 2 - 1;
      if (sp.x > 1000) sp.done = true;
    } else if (sp.kind === 5) {
      sp.cc++; sp.timer--;
      if (sp.cc === 5 && sp.x < 700) {
        const hx = sp.x + 34, hy = sp.y - 5 + 1.2;
        const e = hitTest(hx, hy, 1);
        if (e) { e.hp -= 1000; bloodAt(e, 5); }
        addPart('ionblast', sp.x + 30, sp.y - 20, { size: 58, life: 16 });
        addPart('beam', sp.x + 30, sp.y - 5, { life: 10 });
        Sfx.play('ion');
        sp.x += 50; sp.cc = 0;
      }
      S.shakeX += Math.random() * 2 - 1; S.shakeY += Math.random() * 2 - 1;
      if (sp.timer <= 0) sp.done = true;
    }
  }
  S.specials = S.specials.filter(s => !s.done);
  if (S.heal > 0) S.heal--;
}

// ------------------------------------------------------------------ enemy AI (port of the original)
function enemyTurret(spot, id) {
  // like the original, building on the 4th spot checks the 3rd spot instead
  const check = spot === 3 ? 2 : spot;
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
  if (S.cash < U.cost) { Sfx.play('deny'); return; }
  const slot = S.tray.indexOf(0);
  if (slot < 0) { Sfx.play('deny'); return; }
  S.cash -= U.cost;
  S.tray[slot] = id;
  if (slot === 0) startTraining(id);
  Sfx.play('buy');
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

function freeSpots() { const r = []; for (let i = 0; i <= S.addons; i++) if (!S.spots[i]) r.push(i); return r; }
function usedSpots() { const r = []; for (let i = 0; i < 4; i++) if (S.spots[i]) r.push(i); return r; }

function chooseTurret(id) {
  if (S.cash < TURRETS[id].cost) { Sfx.play('deny'); return; }
  if (!freeSpots().length) { Sfx.play('deny'); S.desc = T.cantBuild; return; }
  S.menu = 'build'; S.buildId = id; S.desc = '';
  Sfx.play('click');
}
function buildAt(spot) {
  const id = S.buildId;
  if (S.cash < TURRETS[id].cost || S.spots[spot]) { Sfx.play('deny'); return; }
  S.cash -= TURRETS[id].cost;
  placeTurret(1, spot, id);
  S.menu = 'main'; S.buildId = 0; S.desc = '';
  Sfx.play('build');
  for (let i = 0; i < 6; i++) addPart('debris', TURRET_SPOT_X, GROUND_Y + TURRET_SPOT_Y[spot] + 6);
}
function sellAt(spot) {
  const tu = S.spots[spot];
  if (!tu) return;
  S.cash += Math.round(TURRETS[tu.id].cost / 2);
  S.spots[spot] = null;
  S.menu = 'main'; S.desc = '';
  Sfx.play('coin');
}
function addSlot() {
  if (S.addons >= 3) { Sfx.play('deny'); return; }
  const cost = SLOT_COST[S.addons];
  if (S.cash < cost) { Sfx.play('deny'); return; }
  S.cash -= cost; S.addons++;
  Sfx.play('build');
}
function evolve() {
  if (S.tech >= 5) { Sfx.play('deny'); return; }
  if (S.xp < EVOLVE_XP[S.tech - 1]) { Sfx.play('deny'); return; }
  S.tech++;
  S.pBase.max += EVOLVE_BASE_HP * S.tech; S.pBase.hp += EVOLVE_BASE_HP * S.tech;
  S.evolveFlash = 40;
  Sfx.play('evolve');
  if (S.menu === 'units' || S.menu === 'turrets') S.menu = 'main';
}

// ------------------------------------------------------------------ simulation step
function step() {
  if (!S || S.paused) return;
  if (S.over) {
    S.overT++;
    for (const p of S.parts) updatePart(p);
    S.parts = S.parts.filter(p => !p.dead);
    if (S.overT % 6 === 0 && S.overT < 60) {
      const b = S.over === 'win' ? S.eBase : S.pBase;
      addPart('explosion', b.l + 20 + Math.random() * (b.r - b.l - 60), GROUND_Y - Math.random() * 90, { size: 26 + Math.random() * 16, life: 28 });
      Sfx.play('boom');
    }
    if (S.overT === 70) { Game.screen = S.over === 'win' ? 'victory' : 'defeat'; Game.t = 0; Sfx.play(S.over === 'win' ? 'win' : 'lose'); }
    return;
  }
  S.tick++;
  S.pcamX = S.camX;
  if (S.specTimer < SPECIAL_COOLDOWN) S.specTimer++;
  updateTraining();
  updateAI();
  for (const u of S.units) updateUnit(u);
  S.units = S.units.filter(u => u.dc <= 80);
  for (const tu of S.spots) if (tu) updateTurret(tu);
  for (const tu of S.espots) if (tu) updateTurret(tu);
  for (const b of S.bullets) updateBullet(b);
  S.bullets = S.bullets.filter(b => !b.dead);
  for (const p of S.parts) updatePart(p);
  S.parts = S.parts.filter(p => !p.dead);
  for (const f of S.fx) f.t++;
  S.fx = S.fx.filter(f => f.t <= f.life);
  updateSpecials();
  if (S.evolveFlash > 0) S.evolveFlash--;
  // camera: edge scrolling with the mouse like the original, plus keyboard and drag inertia
  const edge = Input.edgeScroll();
  if (edge) S.camX += edge;
  if (Input.keys.left) S.camX -= 8;
  if (Input.keys.right) S.camX += 8;
  if (!Input.drag && Math.abs(S.inertia) > 0.1) { S.camX += S.inertia; S.inertia *= 0.9; }
  S.camX = clamp(S.camX, 0, WORLD_W - viewW);
  // base destroyed?
  if (Math.round(S.eBase.hp) < 0 && !S.over) { S.over = 'win'; S.overT = 0; }
  else if (Math.round(S.pBase.hp) < 0 && !S.over) { S.over = 'lose'; S.overT = 0; }
}

// ------------------------------------------------------------------ input
const Input = {
  x: -1, y: -1, over: false, mouse: false, down: false, drag: null, keys: {}, hoverId: null, pressId: null,
  toStage(e) {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) * dpr - offX) / scale, ((e.clientY - r.top) * dpr - offY) / scale];
  },
  edgeScroll() {
    if (!this.mouse || !this.over || Game.screen !== 'play' || this.y <= 120 || this.y > STAGE_H) return 0;
    if (S.menu === 'build' || S.menu === 'sell') { /* still scroll */ }
    if (this.x > viewW - 100 && this.x <= viewW) return (this.x - (viewW - 100)) / 10;
    if (this.x < 100 && this.x >= 0) return -(100 - this.x) / 10;
    return 0;
  },
};

let buttons = []; // rebuilt every frame: {id, x, y, w, h, onClick, onHover, desc}

function findButton(x, y) {
  for (let i = buttons.length - 1; i >= 0; i--) {
    const b = buttons[i];
    const pad = Input.mouse ? 0 : 4; // bigger touch targets
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

cv.addEventListener('pointerdown', (e) => {
  Sfx.init();
  if (Game.soundOn) Sfx.startMusic();
  cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
  Input.mouse = e.pointerType === 'mouse';
  const [x, y] = Input.toStage(e);
  Input.x = x; Input.y = y; Input.over = true; Input.down = true;
  const b = findButton(x, y);
  Input.pressId = b ? b.id : null;
  if (b && b.desc && !Input.mouse) Game.touchDesc = [b.desc, performance.now()];
  if (!b && Game.screen === 'play' && S && !S.paused) {
    Input.drag = { x0: x, cam0: S.camX, lastX: x, moved: 0, t: performance.now() };
    S.inertia = 0;
  }
  e.preventDefault();
});
cv.addEventListener('pointermove', (e) => {
  Input.mouse = e.pointerType === 'mouse';
  const [x, y] = Input.toStage(e);
  const dx = x - Input.x;
  Input.x = x; Input.y = y; Input.over = true;
  if (Input.drag && S) {
    Input.drag.moved += Math.abs(dx);
    S.camX = clamp(Input.drag.cam0 - (x - Input.drag.x0), 0, WORLD_W - viewW);
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
  if (b && b.id === Input.pressId && b.onClick) { b.onClick(); }
  else if (!b && Input.drag && Input.drag.moved < 6) worldTap(x, y);
  if (Input.drag && performance.now() - Input.drag.t > 80 && S) S.inertia = 0;
  Input.drag = null; Input.pressId = null;
  if (!Input.mouse) { Input.over = false; }
});
cv.addEventListener('pointercancel', () => { Input.drag = null; Input.down = false; });
cv.addEventListener('pointerleave', () => { if (Input.mouse) Input.over = false; });
cv.addEventListener('wheel', (e) => {
  if (Game.screen === 'play' && S) { S.camX = clamp(S.camX + (e.deltaX || e.deltaY) * 0.6, 0, WORLD_W - viewW); e.preventDefault(); }
}, { passive: false });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) togglePause(); }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') Input.keys.left = true;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') Input.keys.right = true;
  if (Game.screen === 'play' && S && !S.paused && !S.over) {
    if (e.code === 'Escape') { S.menu = 'main'; S.desc = ''; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 4) {
      const ids = unitIdsForAge(S.tech);
      if (ids[n - 1]) trainUnit(ids[n - 1]);
    }
    if (e.code === 'KeyQ') useSpecial();
    if (e.code === 'KeyE') evolve();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') Input.keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') Input.keys.right = false;
});

function togglePause() {
  if (Game.screen !== 'play' || !S || S.over) return;
  S.paused = !S.paused;
  Sfx.play('click');
}

// tap/click on the battlefield: show a unit's health bar (the original shows it on mouse over)
function worldTap(x, y) {
  if (!S || Game.screen !== 'play') return;
  const wx = x + S.camX;
  for (const u of S.units) {
    if (u.dead) continue;
    if (wx >= u.x - u.w / 2 && wx <= u.x + u.w / 2 && y >= u.y - u.h - 12 && y <= u.y + 2) u.hbT = 100;
  }
}

function unitIdsForAge(a) { const b = (a - 1) * 3; const r = [b + 1, b + 2, b + 3]; if (a === 5) r.push(16); return r; }
function turretIdsForAge(a) { const b = (a - 1) * 3; return [b + 1, b + 2, b + 3]; }

// ------------------------------------------------------------------ HUD drawing
function woodPanel(w, h, ornament) {
  // wooden plank panel with a dark rim and a golden ornament in a corner (like the original HUD)
  const c = G.ctx;
  c.save();
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.fillStyle = linGrad(0, 0, 0, h, [[0, '#d2a86a'], [1, '#c4975a']]);
  c.fillRect(0, 0, w, h);
  const r = rng((w * 7 + h) | 0);
  for (let y = 9; y < h; y += 10 + r() * 4) {
    c.strokeStyle = 'rgba(120,80,30,0.45)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + r() * 1.5 - 0.7); c.stroke();
  }
  for (let i = 0; i < w / 14; i++) {
    const x = r() * w, y = r() * h;
    c.strokeStyle = 'rgba(140,95,40,0.35)'; c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(x, y, 4 + r() * 6, 0.9, 0, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

function ornament(x, y, flip) {
  save(); tr(x, y); if (flip) scl(-1, 1);
  const c = G.ctx;
  const gold = linGrad(-10, -10, 10, 10, [[0, '#fff6a0'], [0.4, '#f0c830'], [1, '#a07808']]);
  c.beginPath();
  c.moveTo(0, 0); c.bezierCurveTo(-4, -6, -12, -4, -12, -10); c.bezierCurveTo(-8, -8, -6, -14, -2, -12);
  c.bezierCurveTo(-4, -18, 2, -20, 2, -14); c.bezierCurveTo(4, -10, 8, -12, 6, -6);
  c.bezierCurveTo(10, -6, 12, -2, 8, 0); c.closePath();
  fs(gold, '#6a4a00', 0.7);
  circ(-2, -6, 2.4, gold, '#6a4a00', 0.6);
  circ(4, -1, 1.8, '#c01818', '#4a0000', 0.5);
  restore();
}

function buildPanels() {
  const s = scale;
  const p = {};
  p.left = renderTo(128, 74, s, () => {
    woodPanel(124, 69);
    const c = G.ctx;
    rect(122, 0, 4, 71, '#7a5226', OUT, 0.8); rect(0, 67, 126, 4, '#7a5226', OUT, 0.8);
    ornament(118, 67);
  });
  p.right = renderTo(244, 74, s, () => {
    tr(2, 0);
    woodPanel(242, 69);
    rect(-2, 0, 4, 71, '#7a5226', OUT, 0.8); rect(-2, 67, 244, 4, '#7a5226', OUT, 0.8);
    ornament(8, 67, true);
  });
  p.special = renderTo(140, 40, s, () => {
    tr(3, 0);
    woodPanel(137, 35);
    rect(-2, 0, 4, 37, '#7a5226', OUT, 0.8); rect(-2, 33, 139, 4, '#7a5226', OUT, 0.8);
    ornament(8, 33, true);
  });
  caches.panels = p;
}

function goldFrame(x, y, w, h, active) {
  const c = G.ctx;
  rect(x, y, w, h, linGrad(x, y, x + w, y + h, [[0, '#fff3a0'], [0.5, '#e8c030'], [1, '#9a7408']]), OUT, 0.8);
  rect(x + 3, y + 3, w - 6, h - 6, active ? '#8a8a8a' : '#707070', '#3a3a3a', 0.8);
  for (const [cx, cy] of [[x + 1.5, y + 1.5], [x + w - 1.5, y + 1.5], [x + 1.5, y + h - 1.5], [x + w - 1.5, y + h - 1.5]]) {
    rect(cx - 2.6, cy - 2.6, 5.2, 5.2, '#9a0c0c', '#3a0000', 0.6);
    rect(cx - 1.2, cy - 1.6, 1.4, 1.2, 'rgba(255,150,150,0.8)', null);
  }
}

function silhouetteTurret(x, y, col) {
  poly([x - 7, y + 8, x - 4, y + 1, x + 4, y + 1, x + 7, y + 8], col, null);
  rect(x - 7, y - 3, 12, 6, col, null);
  rect(x + 4, y - 1.5, 10, 3, col, null);
}

function menuIcon(kind, x, y) {
  const dark = '#2e2e2e';
  if (kind === 'units') {
    circ(x + 17, y + 12, 5.5, dark, null);
    const c = G.ctx; c.beginPath(); c.moveTo(x + 8, y + 31); c.quadraticCurveTo(x + 8, y + 18, x + 17, y + 18); c.quadraticCurveTo(x + 26, y + 18, x + 26, y + 31); c.closePath(); c.fillStyle = dark; c.fill();
  } else if (kind === 'turrets') silhouetteTurret(x + 15, y + 17, dark);
  else if (kind === 'sell') { silhouetteTurret(x + 17, y + 19, dark); text('$', x + 4, y + 3, { font: 'bold 16px ' + FONT_HUD, color: '#22e022', stroke: '#004000', sw: 1.5 }); }
  else if (kind === 'slot') { silhouetteTurret(x + 17, y + 19, dark); text('+', x + 4, y + 2, { font: 'bold 18px ' + FONT_HUD, color: '#22e022', stroke: '#004000', sw: 1.5 }); }
  else if (kind === 'evolve') {
    const c = G.ctx; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 5.5 : 13; c.lineTo(x + 17.5 + Math.cos(a) * r, y + 18.5 + Math.sin(a) * r); }
    c.closePath(); fs('#ffee00', OUT, 1);
  } else if (kind === 'back') {
    poly([x + 6, y + 17.5, x + 16, y + 8, x + 16, y + 13, x + 29, y + 13, x + 29, y + 22, x + 16, y + 22, x + 16, y + 27], '#d01010', '#400000', 1);
  }
}

// small cached portrait of a unit/turret for the menu buttons
function unitIcon(id) {
  const key = 'u' + id;
  if (!caches.icons[key]) {
    caches.icons[key] = renderTo(29, 29, scale * 1.5, () => {
      const U = UNITS[id];
      const big = U.w > 60;
      const sc = big ? 26 / (U.w + 10) * 1.6 : 26 / (U.h + 4);
      tr(big ? 12 : 14.5, 28);
      scl(Math.min(sc, 0.6 * (big ? 1 : 1.2)));
      drawUnit(id, { anim: 'idle', f: 10, len: UNITS[id].anim.idle, hit: 0, v: 0, t: 0 });
    });
  }
  return caches.icons[key];
}
function turretIcon(id) {
  const key = 't' + id;
  if (!caches.icons[key]) {
    caches.icons[key] = renderTo(29, 29, scale * 1.5, () => {
      tr(id === 6 ? 4 : 16, id === 6 ? 20 : 15);
      const sc = { 3: 0.5, 4: 0.42, 5: 0.42, 6: 0.2, 7: 0.55, 8: 0.5, 9: 0.5, 13: 0.7, 14: 0.8, 15: 0.8 }[id] || 0.7;
      scl(sc);
      if ([3, 4, 5].includes(id)) tr(14, 0);
      TURRET_DRAW[id](0);
    });
  }
  return caches.icons[key];
}

function specialIcon(age, x, y, w, h) {
  const c = G.ctx;
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  if (age === 1) {
    c.fillStyle = linGrad(x, y, x, y + h, [[0, '#5a4a3a'], [1, '#2a2018']]); c.fillRect(x, y, w, h);
    poly([x + 4, y + h, x + 16, y + 8, x + 24, y + 8, x + 36, y + h], '#8a6a4a', OUT, 0.6);
    poly([x + 16, y + 9, x + 24, y + 9, x + 26, y + 14, x + 14, y + 14], '#ff5a10', null);
    ell(x + 20, y + 18, 10, 3, '#ff3a10', '#8a1a00', 0.5);
    circ(x + 42, y + 8, 5, '#6a6a60'); circ(x + 50, y + 16, 4, '#6a6a60');
    circ(x + 20, y + 4, 4, 'rgba(200,200,200,0.8)', null);
  } else if (age === 2) {
    c.fillStyle = '#f4f4f4'; c.fillRect(x, y, w, h);
    for (let i = 0; i < 3; i++) { save(); tr(x + 14 + i * 14, y + 6 + (i % 2) * 6); rot(0.5); pline([-8, 0, 8, 0], '#7a5230', 1.2); poly([8, -2, 12, 0, 8, 2], '#888', null); poly([-8, 0, -11, -2, -6, 0], '#2f8f2f', null); restore(); }
    poly([x + 30, y + h, x + 44, y + 8, x + 56, y + h], '#e8a020', null);
  } else if (age === 3) {
    c.fillStyle = linGrad(x, y, x + w, y, [[0, '#ff4010'], [0.3, '#ffe840'], [0.7, '#ffe840'], [1, '#ff4010']]); c.fillRect(x, y, w, h);
    rect(x + w / 2 - 1.5, y + 3, 3, h - 3, '#111', null);
    rect(x + w / 2 - 9, y + 8, 18, 3, '#111', null);
    circ(x + w / 2, y + 5, 2.5, '#111', null);
  } else if (age === 4) {
    c.fillStyle = linGrad(x, y, x, y + h, [[0, '#cfe8e0'], [1, '#9ab8b0']]); c.fillRect(x, y, w, h);
    save(); tr(x + w / 2 + 2, y + h / 2); scl(0.55); drawPlane(0, 0, 0); restore();
  } else {
    c.fillStyle = '#050a1a'; c.fillRect(x, y, w, h);
    for (let i = 0; i < 10; i++) circ(x + (i * 37) % w, y + (i * 13) % h, 0.6, '#fff', null);
    ell(x + 18, y + h + 6, 30, 10, '#2a5ad0', null);
    save(); tr(x + 36, y + 10); rot(-0.5);
    rect(-10, -2, 7, 4, '#3a6ab0', OUT, 0.5); rect(3, -2, 7, 4, '#3a6ab0', OUT, 0.5); rect(-3, -3, 6, 6, '#cfcfcf', OUT, 0.5);
    restore();
  }
  c.restore();
  rect(x, y, w, h, null, '#111', 1.4);
}

function drawHUD() {
  if (!caches.panels) buildPanels();
  const c = G.ctx;
  const P = caches.panels;
  // light band behind the HUD like the original
  c.fillStyle = linGrad(0, 0, 0, 105, [[0, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]);
  c.fillRect(0, 0, viewW, 105);
  const drawImg = (img, x, y, w, h) => c.drawImage(img, x, y, w, h);
  drawImg(P.left, 0, 0, 128, 74);
  drawImg(P.right, 408 + rightX, 0, 244, 74);
  drawImg(P.special, 512 + rightX, 69, 140, 40);

  // gold + exp
  circ(9, 14, 5.2, linGrad(4, 10, 14, 18, [[0, '#8a7000'], [0.5, '#ffe850'], [1, '#b89400']]), '#5a4a00', 0.8);
  ell(8, 12.5, 1.6, 2.8, 'rgba(255,255,255,0.5)', null);
  text(String(Math.floor(S.cash)), 20, 7, { font: '12px ' + FONT_HUD, color: '#ffff00', stroke: '#6a5000', sw: 2 });
  text(T.exp, 3, 25, { font: '12px ' + FONT_HUD, color: '#111' });
  const ew = c.measureText(T.exp).width;
  text(String(Math.floor(S.xp)), 6 + ew, 25, { font: '12px ' + FONT_HUD, color: '#ff0000', stroke: '#300', sw: 1.2 });

  // training progress + queue
  rect(127.5, 6.5, 217.75, 6.75, '#e8f4fb', '#1a3040', 1);
  if (S.trainTotal > 0) {
    const pr = 1 - S.trainTimer / S.trainTotal;
    rect(128, 7, 216.75 * pr, 5.75, '#e00000', null);
  }
  for (let k = 0; k < 5; k++) {
    rect(349.5 + 12 * k, 4.5, 10, 10, S.tray[k] ? '#3a78c8' : '#e8f4fb', '#1a3040', 1);
    if (S.tray[k]) rect(351.5 + 12 * k, 6.5, 6, 6, '#8ac0ff', null);
  }
  if (S.trainId) text(T.training(T.unitNames[S.trainId]), 129, 15.5, { font: '9px ' + FONT_HUD, color: '#dd0000' });

  // right menu
  const mx = rightX;
  const titles = { main: T.menu, units: T.menuUnits, turrets: T.menuTurrets, build: T.menuTurrets, sell: T.sellTitle };
  text(titles[S.menu], 433 + mx, 5, { font: '14px ' + FONT_HUD, color: '#ffff00', stroke: '#6a5000', sw: 1.6 });
  let hoverDesc = null;
  const hov = (b) => Input.over && Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h;
  const addBtn = (b) => { buttons.push(b); if (hov(b) && b.desc) hoverDesc = b.desc; return b; };

  if (S.menu === 'main') {
    const items = [
      ['units', T.trainMenu, () => { S.menu = 'units'; Sfx.play('click'); }],
      ['turrets', T.turretMenu, () => { S.menu = 'turrets'; Sfx.play('click'); }],
      ['sell', T.sellMenu, () => { if (usedSpots().length) { S.menu = 'sell'; Sfx.play('click'); } else Sfx.play('deny'); }],
      ['slot', S.addons < 3 ? T.addSpot(SLOT_COST[S.addons]) : T.cantBuild, addSlot],
      ['evolve', S.tech < 5 ? T.evolve(EVOLVE_XP[S.tech - 1]) : T.cantEvolve, evolve],
    ];
    items.forEach(([k, d, fn], i) => {
      const b = addBtn({ id: 'm' + k, x: 433 + 40 * i + mx, y: 23, w: 35, h: 35, desc: d, onClick: fn });
      goldFrame(b.x, b.y, b.w, b.h, hov(b));
      menuIcon(k, b.x, b.y);
      if (k === 'evolve' && S.tech < 5 && S.xp >= EVOLVE_XP[S.tech - 1]) {
        const a = 0.35 + 0.35 * Math.sin(Game.t * 0.15);
        rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, `rgba(255,255,160,${a})`, null);
      }
    });
  } else if (S.menu === 'units' || S.menu === 'turrets') {
    const isU = S.menu === 'units';
    const ids = isU ? unitIdsForAge(S.tech) : turretIdsForAge(S.tech);
    const x0 = isU ? 441 : 433;
    ids.forEach((id, i) => {
      const cost = isU ? UNITS[id].cost : TURRETS[id].cost;
      const name = isU ? T.unitNames[id] : T.turretNames[id];
      const b = addBtn({ id: (isU ? 'u' : 't') + id, x: x0 + 40 * i + mx, y: 23, w: 35, h: 35, desc: T.unitInfo(cost, name), onClick: () => isU ? trainUnit(id) : chooseTurret(id) });
      goldFrame(b.x, b.y, b.w, b.h, hov(b));
      c.drawImage(isU ? unitIcon(id) : turretIcon(id), b.x + 3, b.y + 3, 29, 29);
      if (S.cash < cost) rect(b.x + 3, b.y + 3, 29, 29, 'rgba(0,0,0,0.35)', null);
    });
    const bb = addBtn({ id: 'back', x: 611 + mx, y: 23, w: 35, h: 35, desc: T.returnPrev, onClick: () => { S.menu = 'main'; Sfx.play('click'); } });
    goldFrame(bb.x, bb.y, bb.w, bb.h, hov(bb));
    menuIcon('back', bb.x, bb.y);
  } else {
    // CANCEL button (build / sell mode)
    const b = addBtn({ id: 'cancel', x: 462 + mx, y: 25, w: 145, h: 32, onClick: () => { S.menu = 'main'; S.buildId = 0; Sfx.play('click'); } });
    rect(b.x, b.y, b.w, b.h, linGrad(0, b.y, 0, b.y + b.h, [[0, hov(b) ? '#f4f4f4' : '#e4e4e4'], [1, '#b4b4b4']]), '#555', 1);
    text(T.cancel, b.x + b.w / 2, b.y + 9, { font: '14px ' + FONT_HUD, color: '#e00000', align: 'center' });
  }

  // special attack
  text(T.special, 536 + mx, 80, { font: 'bold 12px ' + FONT_HUD, color: '#ffff00', stroke: '#6a5000', sw: 1.6 });
  const sb = addBtn({ id: 'special', x: 586 + mx, y: 73, w: 56, h: 25, desc: S.specTimer >= SPECIAL_COOLDOWN ? T.specialReady(T.specialName[S.tech - 1]) : T.specialWait(Math.ceil((SPECIAL_COOLDOWN - S.specTimer) / FPS)), onClick: useSpecial });
  specialIcon(S.tech, sb.x, sb.y, sb.w, sb.h);
  if (S.specTimer < SPECIAL_COOLDOWN) {
    const k = S.specTimer / SPECIAL_COOLDOWN;
    rect(sb.x + sb.w * k, sb.y, sb.w * (1 - k), sb.h, 'rgba(0,0,0,0.78)', null);
  } else if (hov(sb)) rect(sb.x, sb.y, sb.w, sb.h, 'rgba(255,255,255,0.2)', null);

  // small utility buttons (pause / sound / fullscreen) under the gold panel
  const util = [
    ['pause', () => togglePause()],
    ['sound', () => toggleSound()],
    ['full', () => toggleFullscreen()],
  ];
  util.forEach(([k, fn], i) => {
    const b = addBtn({ id: 'util' + k, x: 4 + i * 27, y: 76, w: 23, h: 20, onClick: fn });
    rrect(b.x, b.y, b.w, b.h, 4, hov(b) ? 'rgba(255,240,200,0.9)' : 'rgba(210,168,106,0.85)', '#5a3a14', 1);
    utilIcon(k, b.x + b.w / 2, b.y + b.h / 2);
  });

  // description line (hover text in the original)
  const td = Game.touchDesc && performance.now() - Game.touchDesc[1] < 1800 ? Game.touchDesc[0] : null;
  const desc = hoverDesc || td || S.desc;
  if (desc) text(desc, 129, 33, { font: '12px ' + FONT_HUD, color: '#ffff33', stroke: '#5a4a00', sw: 2 });
}

function utilIcon(k, x, y) {
  const col = '#3a2408';
  if (k === 'pause') { rect(x - 4, y - 5, 3, 10, col, null); rect(x + 1, y - 5, 3, 10, col, null); }
  else if (k === 'sound') {
    poly([x - 6, y - 2, x - 3, y - 2, x + 1, y - 6, x + 1, y + 6, x - 3, y + 2, x - 6, y + 2], col, null);
    if (Game.soundOn) { G.ctx.beginPath(); G.ctx.arc(x + 1, y, 5, -0.8, 0.8); G.ctx.strokeStyle = col; G.ctx.lineWidth = 1.3; G.ctx.stroke(); }
    else pline([x + 3, y - 3, x + 8, y + 3], '#c00', 1.4);
  } else if (k === 'full') {
    const L = 3.5;
    pline([x - 6, y - 6 + L, x - 6, y - 6, x - 6 + L, y - 6], col, 1.4);
    pline([x + 6 - L, y - 6, x + 6, y - 6, x + 6, y - 6 + L], col, 1.4);
    pline([x - 6, y + 6 - L, x - 6, y + 6, x - 6 + L, y + 6], col, 1.4);
    pline([x + 6 - L, y + 6, x + 6, y + 6, x + 6, y + 6 - L], col, 1.4);
  } else if (k === 'lang') {
    text(lang === 'zh' ? 'EN' : '中', x, y - 6, { font: 'bold 11px ' + FONT_HUD, color: col, align: 'center' });
  }
}

function toggleSound() {
  Game.soundOn = !Game.soundOn;
  Sfx.init(); Sfx.setOn(Game.soundOn);
  if (Game.soundOn) Sfx.startMusic();
  try { localStorage.setItem('aow_sound', Game.soundOn ? '1' : '0'); } catch (e) {}
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

// ------------------------------------------------------------------ world rendering
function drawWorld(alpha) {
  const c = G.ctx;
  const cam = S.pcamX + (S.camX - S.pcamX) * alpha;
  const sx = S.shakeX, sy = S.shakeY;
  // background
  const bw = caches.bg.width, bh = caches.bg.height;
  const srcX = clamp((cam - sx) * scale, 0, bw - viewW * scale);
  c.drawImage(caches.bg, srcX, 0, viewW * scale, bh, 0, sy, viewW, STAGE_H);
  save();
  tr(-cam + sx, sy);
  // bases
  const pb = baseImage(S.tech, S.addons), eb = baseImage(S.etech, S.eaddons);
  c.drawImage(pb.img, PLAYER_BASE_X + pb.ox, GROUND_Y + pb.oy, 200, 360);
  save(); tr(ENEMY_BASE_X, 0); scl(-1, 1); c.drawImage(eb.img, eb.ox, GROUND_Y + eb.oy, 200, 360); restore();
  // turrets
  for (const tu of S.spots) if (tu) drawTurretObj(tu);
  for (const tu of S.espots) if (tu) drawTurretObj(tu);
  // base health bars (world space, like the original)
  baseBar(S.pBase, 3.5, 21, 'left');
  baseBar(S.eBase, WORLD_W - 17.5, WORLD_W - 21, 'right');
  // bullets are below the units in the original
  for (const b of S.bullets) {
    const bb = Object.assign({}, b, { x: b.px + (b.x - b.px) * alpha, y: b.py + (b.y - b.py) * alpha });
    drawBullet(bb);
  }
  // unit shadows then units (in creation order)
  for (const u of S.units) {
    const x = u.px + (u.x - u.px) * alpha;
    if (u.dead && u.dc > 60) c.globalAlpha = Math.max(0, 1 - (u.dc - 60) / 20);
    save(); tr(x, u.y); drawShadow(u.dead ? u.w * 0.8 : u.w); restore();
    c.globalAlpha = 1;
  }
  for (const u of S.units) drawUnitObj(u, alpha);
  // heal aura
  if (S.heal > 0) {
    for (const u of S.units) if (u.side === 1 && !u.dead) {
      const x = u.px + (u.x - u.px) * alpha;
      const a = 0.45 + 0.15 * Math.sin(Game.t * 0.3 + u.uid);
      c.fillStyle = linGrad(0, u.y - 26, 0, u.y + 2, [[0, 'rgba(200,255,80,0)'], [1, `rgba(230,255,120,${a})`]]);
      c.fillRect(x - u.w * 0.5, u.y - 26, u.w, 28);
      ell(x, u.y, u.w * 0.55, 4, `rgba(255,255,150,${a})`, null);
    }
  }
  // cosmetic shots
  for (const f of S.fx) drawShotFx(f);
  // particles
  for (const p of S.parts) {
    const pp = Object.assign({}, p, { x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha });
    drawParticle(pp);
  }
  // specials above everything
  for (const sp of S.specials) {
    if (sp.kind === 4) drawPlane(sp.px + (sp.x - sp.px) * alpha, sp.y, Game.t);
  }
  // build / sell markers
  if (S.menu === 'build' || S.menu === 'sell') {
    const list = S.menu === 'build' ? freeSpots() : usedSpots();
    for (const i of list) {
      const x = TURRET_SPOT_X, y = GROUND_Y + TURRET_SPOT_Y[i];
      const b = { id: 'spot' + i, x: x - 16 - cam + sx, y: y - 16 + sy, w: 32, h: 32, onClick: () => S.menu === 'build' ? buildAt(i) : sellAt(i),
        desc: S.menu === 'sell' ? T.sellInfo(T.turretNames[S.spots[i].id], Math.round(TURRETS[S.spots[i].id].cost / 2)) : null };
      buttons.push(b);
      const h = Input.over && Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h;
      const pulse = 0.6 + 0.4 * Math.sin(Game.t * 0.25);
      drawSpotMarker(x, y, h ? '#ffff00' : `rgba(255,0,0,${pulse})`);
      if (S.menu === 'build' && !Input.mouse) { c.globalAlpha = 0.45; save(); tr(x, y); drawTurret(S.buildId, 0, 0, 1); restore(); c.globalAlpha = 1; }
    }
  }
  restore();
  if (S.evolveFlash > 0) { c.fillStyle = `rgba(255,255,255,${S.evolveFlash / 40 * 0.6})`; c.fillRect(0, 0, viewW, STAGE_H); }
}

function baseBar(b, x, tx, align) {
  const h = 148;
  rect(x, 119.5, 14, h, '#300', OUT, 1);
  const k = clamp(b.hp / b.max, 0, 1);
  rect(x, 119.5 + h * (1 - k), 14, h * k, '#f00', null);
  rect(x, 119.5, 14, h, null, OUT, 1);
  text(String(Math.max(0, Math.round(b.hp))), tx, 122, { font: '11px ' + FONT_HUD, color: '#e00', align: align === 'left' ? 'left' : 'right' });
}

function drawTurretObj(tu) {
  const T0 = TURRETS[tu.id];
  const k = tu.playing ? tu.anim / T0.alen : 0;
  save(); tr(tu.rx, tu.ry);
  drawTurret(tu.id, tu.ang, k, tu.side);
  restore();
}

function drawUnitObj(u, alpha) {
  const c = G.ctx;
  const x = u.px + (u.x - u.px) * alpha;
  const len = Math.max(1, u.len);
  const f = u.dead ? u.f : ((u.f - 1 + alpha) % len + len) % len;
  if (u.dead && u.dc > 60) c.globalAlpha = Math.max(0, 1 - (u.dc - 60) / 20);
  save(); tr(x, u.y);
  if (u.side === 2) scl(-1, 1);
  drawUnit(u.id, { anim: u.anim, f, len, hit: u.hit, v: u.v, t: u.t + alpha });
  restore();
  c.globalAlpha = 1;
  // hover / tap health bar
  const hovered = Input.mouse && Input.over && S && (() => { const wx = Input.x + S.camX; return wx >= u.x - u.w / 2 && wx <= u.x + u.w / 2 && Input.y >= u.y - u.h && Input.y <= u.y; })();
  if (!u.dead && (hovered || u.hbT > 0)) {
    const w = Math.max(20, Math.min(40, u.w * 0.6));
    const y = u.y - u.h - 10;
    rect(x - w / 2, y, w, 3.5, '#400', OUT, 0.8);
    rect(x - w / 2, y, w * clamp(u.hp / u.max, 0, 1), 3.5, '#f00', null);
  }
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

// ------------------------------------------------------------------ screens
function drawMenuBackground() {
  const c = G.ctx;
  const mx = Input.over ? Input.x : viewW / 2, my = Input.over ? Input.y : STAGE_H / 2;
  const fw = caches.menuFar.width / scale;
  c.fillStyle = '#8d7440'; c.fillRect(0, 380, viewW, 80);
  c.drawImage(caches.menuFar, -mx / 10 - 10, -my / 10 + 10, fw, STAGE_H);
  c.drawImage(caches.menuNear, -mx / 5 - 10, -my / 5 + 20 + 20, fw, STAGE_H);
}

function titleText(str, x, y, size) {
  const c = G.ctx;
  c.font = `700 ${size}px ${FONT_TITLE}`;
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillText(str, x + 3, y + 4);
  c.strokeStyle = '#5a4000'; c.lineWidth = 3; c.strokeText(str, x, y);
  c.fillStyle = linGrad(0, y - size * 0.8, 0, y, [[0, '#fff9c0'], [0.35, '#ffe24a'], [0.55, '#c89400'], [0.75, '#fff2a0'], [1, '#b08000']]);
  c.fillText(str, x, y);
}

function serifText(str, x, y, size, opt = {}) {
  text(str, x, y, Object.assign({ font: `bold ${size}px ${FONT_SERIF}`, color: '#fff', shadow: 'rgba(0,0,0,0.75)', sd: Math.max(1, size / 14), align: 'center' }, opt));
}

function menuItem(id, label, x, y, size, onClick) {
  const c = G.ctx;
  c.font = `bold ${size}px ${FONT_SERIF}`;
  const w = c.measureText(label).width;
  const b = { id, x: x - w / 2 - 6, y: y - 2, w: w + 12, h: size + 6, onClick };
  buttons.push(b);
  const hovered = Input.over && Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h;
  serifText(label, x, y, size);
  if (hovered) drawSwordPointer(x - w / 2 - 10, y + size * 0.55);
  return b;
}

function drawSwordPointer(x, y) {
  save(); tr(x, y);
  pline([-40, 0, -4, 0], '#33404a', 3.2);
  pline([-40, 0, -4, 0], '#aab4bd', 1.8);
  poly([-4, -1.6, 2, 0, -4, 1.6], '#aab4bd', '#33404a', 0.6);
  rect(-42, -4.5, 2.5, 9, '#5a4020', OUT, 0.5);
  rect(-50, -1.3, 8, 2.6, '#5a4020', OUT, 0.5);
  circ(-51, 0, 1.8, '#c8a030', OUT, 0.5);
  restore();
}

function translucentBox(x, y, w, h) {
  rrect(x, y, w, h, 18, 'rgba(255,255,255,0.33)', null);
}

function drawTitle() {
  buttons = [];
  drawMenuBackground();
  const cx = viewW / 2;
  titleText(T.title, cx, 80, 58);
  // a unit walking above the menu box, cycling through the ages like the original title screen
  Game.menuUnitT++;
  if (Game.menuUnitT > 200) { Game.menuUnitT = 0; Game.menuUnit = Game.menuUnit % 16 + 1; }
  const U = UNITS[Game.menuUnit];
  save(); tr(cx, 176);
  const sc = U.w > 90 ? 0.75 : 1.2;
  scl(sc);
  drawShadow(U.w);
  drawUnit(Game.menuUnit, { anim: 'walk', f: (Game.t * 1) % U.anim.walk, len: U.anim.walk, hit: 0, v: 0, t: Game.t });
  restore();
  translucentBox(cx - 140, 188, 280, 262);
  menuItem('play', T.play, cx, 202, 26, () => { Game.screen = 'difficulty'; Sfx.play('click'); });
  menuItem('instr', T.instructions, cx, 238, 26, () => { Game.screen = 'instructions'; Sfx.play('click'); });
  menuItem('extras', T.extras, cx, 274, 26, () => { Game.screen = 'extras'; Game.t = 0; Sfx.play('click'); });
  menuItem('more', T.moreGames, cx, 310, 26, () => { window.location.href = '../'; });
  serifText(T.tribute, cx, 356, 11, { color: '#fff' });
  // language + sound toggles
  menuItem('lang', lang === 'zh' ? 'English' : '中文', cx - 60, 382, 17, () => { setLang(lang === 'zh' ? 'en' : 'zh'); caches.icons = {}; Sfx.play('click'); });
  menuItem('snd', (lang === 'zh' ? '声音：' : 'Sound: ') + (Game.soundOn ? (lang === 'zh' ? '开' : 'on') : (lang === 'zh' ? '关' : 'off')), cx + 60, 382, 17, () => toggleSound());
  serifText(T.byline, cx, 422, 15);
}

function drawDifficulty() {
  buttons = [];
  drawMenuBackground();
  const cx = viewW / 2;
  rrect(cx - 290, 32, 580, 384, 22, 'rgba(255,255,255,0.72)', null);
  text(T.difficulty, cx, 50, { font: `bold 40px ${FONT_SERIF}`, color: '#111', align: 'center' });
  text(T.chooseDiff, cx, 104, { font: `bold 15px ${FONT_SERIF}`, color: '#111', align: 'center' });
  const opts = [[T.normal, 1], [T.harder, 2], [T.impossible, 3]];
  opts.forEach(([lab, d], i) => {
    const y = 160 + i * 42;
    const c = G.ctx; c.font = `bold 16px ${FONT_SERIF}`;
    const w = c.measureText(lab).width;
    const b = { id: 'd' + d, x: cx - w / 2 - 20, y: y - 6, w: w + 40, h: 30, onClick: () => startGame(d) };
    buttons.push(b);
    const hv = Input.over && Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h;
    text(lab, cx, y, { font: `bold 16px ${FONT_SERIF}`, color: hv ? '#7a0000' : '#111', align: 'center' });
    if (hv) drawSwordPointer(cx - w / 2 - 12, y + 9);
  });
  text(lang === 'zh' ? '普通：原版数值 · 困难：敌人生命与攻击 ×1.3 · 地狱：×2' : 'Normal: original values · Harder: enemy HP & damage x1.3 · Impossible: x2', cx, 300, { font: `12px ${FONT_SERIF}`, color: '#333', align: 'center' });
  backLink(cx, 380);
}

function backLink(cx, y) {
  const c = G.ctx; c.font = `bold 15px ${FONT_SERIF}`;
  const w = c.measureText(T.backToMenu).width;
  const b = { id: 'back', x: cx - w / 2 - 10, y: y - 6, w: w + 20, h: 28, onClick: () => { Game.screen = 'title'; Sfx.play('click'); } };
  buttons.push(b);
  const hv = Input.over && Input.x >= b.x && Input.x <= b.x + b.w && Input.y >= b.y && Input.y <= b.y + b.h;
  text(T.backToMenu, cx, y, { font: `bold 15px ${FONT_SERIF}`, color: hv ? '#7a0000' : '#111', align: 'center' });
}

function drawInstructions() {
  buttons = [];
  drawMenuBackground();
  const cx = viewW / 2;
  rrect(cx - 290, 32, 580, 384, 22, 'rgba(210,240,255,0.78)', null);
  const lines = T.instrText;
  let y = 46;
  for (const l of lines) {
    text(l, cx - 278, y, { font: `bold ${lang === 'zh' ? 14 : 13.5}px ${FONT_SERIF}`, color: '#111' });
    y += l ? 19 : 12;
  }
  y += 6;
  wrapText(T.controlsText, cx - 278, y, 556, 17, `bold 12.5px ${FONT_SERIF}`, '#224');
  backLink(cx, 382);
}

function wrapText(str, x, y, maxW, lh, font, color) {
  const c = G.ctx; c.font = font;
  const words = lang === 'zh' ? str.split('') : str.split(' ');
  let line = '';
  for (const w of words) {
    const test = line + (lang === 'zh' ? '' : (line ? ' ' : '')) + w;
    if (c.measureText(test).width > maxW && line) { text(line, x, y, { font, color }); y += lh; line = w; }
    else line = test;
  }
  if (line) text(line, x, y, { font, color });
  return y + lh;
}

function drawExtras() {
  buttons = [];
  drawMenuBackground();
  const cx = viewW / 2;
  rrect(cx - 300, 26, 600, 398, 22, 'rgba(255,255,255,0.8)', null);
  text(T.extrasTitle, cx, 34, { font: `bold 30px ${FONT_SERIF}`, color: '#111', align: 'center' });
  text(T.extrasSub, cx, 72, { font: `bold 13px ${FONT_SERIF}`, color: '#111', align: 'center' });
  // unit gallery: 5 rows (ages) x up to 4 units, animated
  for (let a = 1; a <= 5; a++) {
    const ids = unitIdsForAge(a);
    const y = 90 + (a - 1) * 60;
    text(T.ageNames[a - 1], cx - 285, y + 22, { font: `bold 11px ${FONT_SERIF}`, color: '#333' });
    ids.forEach((id, i) => {
      const U = UNITS[id];
      const x = cx - 205 + i * 128;
      save(); tr(x, y + 52);
      const sc = Math.min(0.75, 52 / (U.h + 6), 62 / (U.w + 10));
      scl(sc);
      drawShadow(U.w);
      const anim = (Math.floor(Game.t / 160) + id) % 2 ? 'walk' : 'attack';
      const A = U.anim;
      const len = anim === 'walk' ? A.walk : A.attack[0][0];
      drawUnit(id, { anim, f: Game.t % len, len, hit: anim === 'attack' ? A.attack[0][1] : 0, v: 0, t: Game.t });
      restore();
      text(T.unitNames[id], x + 38, y + 18, { font: `bold 10px ${FONT_HUD}`, color: '#222' });
      text(`$${U.cost}  HP ${U.hp}`, x + 38, y + 31, { font: `10px ${FONT_HUD}`, color: '#555' });
    });
  }
  backLink(cx, 400);
}

function drawEnd(win) {
  buttons = [];
  drawMenuBackground();
  const cx = viewW / 2;
  serifText(win ? T.victory : T.defeat, cx, 172, 72, { color: '#fff' });
  serifText(win ? T.victorySub : T.defeatSub, cx, 262, 14);
  menuItem('again', T.playAgain, cx, 305, 18, () => { Game.screen = 'difficulty'; Sfx.play('click'); });
  menuItem('menu', T.mainMenu, cx, 333, 18, () => { Game.screen = 'title'; Sfx.play('click'); });
}

function drawStart() {
  buttons = [];
  const c = G.ctx;
  c.fillStyle = '#000'; c.fillRect(0, 0, viewW, STAGE_H);
  const cx = viewW / 2;
  const b = { id: 'start', x: 0, y: 0, w: viewW, h: STAGE_H, onClick: () => { Sfx.init(); Game.soundOn && Sfx.startMusic(); Game.screen = 'title'; Game.t = 0; } };
  buttons.push(b);
  const pulse = 0.75 + 0.25 * Math.sin(Game.t * 0.12);
  c.globalAlpha = pulse;
  text(T.tapToStart, cx, 222, { font: `bold 30px ${FONT_SERIF}`, color: '#fff', align: 'center', shadow: '#444', sd: 2 });
  c.globalAlpha = 1;
  titleText(T.title, cx, 150, 44);
}

function drawPaused() {
  const c = G.ctx;
  c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, viewW, STAGE_H);
  serifText(T.paused, viewW / 2, 200, 20);
  serifText(Input.mouse ? T.resume : T.resumeTouch, viewW / 2, 226, 20);
  buttons = [{ id: 'resume', x: 0, y: 0, w: viewW, h: STAGE_H, onClick: togglePause }];
}

function startGame(d) {
  newMatch(d);
  caches.base = {};
  Game.screen = 'play';
  Sfx.play('click');
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
    if (Game.screen === 'play') step();
  }
  const alpha = acc / TICK;
  render(alpha);
}

function render(alpha) {
  const c = ctx;
  G.set(c);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
  if (Game.screen !== 'start' && offY > 1) {
    // letterbox (4:3 tablets, portrait): extend the sky above and the ground below instead of black bars
    c.fillStyle = Game.screen === 'play' ? PAL.sky0 : '#3db0fb';
    c.fillRect(offX, 0, viewW * scale, offY + 2);
    c.fillStyle = '#8d7440';
    c.fillRect(offX, offY + STAGE_H * scale - 2, viewW * scale, cv.height - offY - STAGE_H * scale + 2);
  }
  c.setTransform(scale, 0, 0, scale, offX, offY);
  c.save();
  c.beginPath(); c.rect(0, 0, viewW, STAGE_H); c.clip();
  c.lineJoin = 'round'; c.lineCap = 'round';
  switch (Game.screen) {
    case 'start': drawStart(); break;
    case 'title': drawTitle(); break;
    case 'difficulty': drawDifficulty(); break;
    case 'instructions': drawInstructions(); break;
    case 'extras': drawExtras(); break;
    case 'victory': drawEnd(true); break;
    case 'defeat': drawEnd(false); break;
    case 'play':
      buttons = [];
      drawWorld(S.paused ? 1 : alpha);
      if (!S.paused && !S.over) drawHUD();
      else if (S.over) { buttons = []; drawHUD(); buttons = []; }
      if (S.paused) drawPaused();
      if (S.menu === 'build' && Input.mouse && Input.over && !S.paused) {
        c.globalAlpha = 0.55; save(); tr(Input.x + 10, Input.y + 10); scl(0.8); drawTurret(S.buildId, 0, 0, 1); restore(); c.globalAlpha = 1;
      }
      if (S.menu === 'sell' && Input.mouse && Input.over && !S.paused) text('$', Input.x + 8, Input.y + 2, { font: 'bold 16px ' + FONT_HUD, color: '#22e022', stroke: '#004000', sw: 2 });
      break;
  }
  c.restore();
  // portrait hint for phones
  drawPortraitHint();
  // cursor style
  const b = Input.over ? findButton(Input.x, Input.y) : null;
  cv.style.cursor = b ? 'pointer' : 'default';
}

function drawPortraitHint() {
  if (cssH <= cssW * 1.05 || Game.portraitOk) { document.getElementById('rotate').style.display = 'none'; return; }
  document.getElementById('rotate').style.display = 'flex';
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => { if (document.hidden && S && Game.screen === 'play' && !S.paused && !S.over) S.paused = true; });

function boot() {
  try { Game.soundOn = localStorage.getItem('aow_sound') !== '0'; } catch (e) {}
  Sfx.on = Game.soundOn;
  document.getElementById('rotateGo').textContent = T.rotateGo;
  document.getElementById('rotateTxt').textContent = T.rotate;
  document.getElementById('rotateGo').onclick = () => { Game.portraitOk = true; document.getElementById('rotate').style.display = 'none'; };
  resize();
  requestAnimationFrame(frame);
}

// wait for the fonts so cached text uses them
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('bold 20px AoWSerif'), document.fonts.load('700 40px AoWTitle')]).then(boot, boot);
} else boot();
