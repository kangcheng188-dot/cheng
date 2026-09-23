'use strict';
// Turrets (drawn around their pivot, facing right), projectiles and particles.

const WOOD = '#9a6a36', WOOD_D = '#6e4a24', WOOD_L = '#c08a4a';
const BRASS = '#d2a13a', BRASS_D = '#9a7020';
const OLIVE = '#5f6f2e', OLIVE_D = '#3f4c1c', OLIVE_L = '#7f9040';

function stoneBall(x, y, r, col = '#8a8a80') {
  circ(x, y, r, col);
  ell(x - r * 0.3, y - r * 0.35, r * 0.35, r * 0.25, 'rgba(255,255,255,0.35)', null);
}

// k: firing animation progress 0..1 (0 = at rest / loaded)
const TURRET_DRAW = [
  null,
  // 1 rock slingshot
  (k) => {
    scl(0.72);
    rect(-12, -2, 24, 6, WOOD);
    poly([6, -2, 10, -10, 12, -9, 9, -2], WOOD_D);
    poly([6, 4, 10, 11, 12, 10, 9, 4], WOOD_D);
    const pull = k > 0 && k < 0.2 ? 0 : k < 0.35 ? (k - 0.2) / 0.15 : 1;
    const bx = lerp(10, -8, pull);
    pline([11, -9, bx, 1, 11, 10], '#d01818', 1.6);
    if (pull > 0.4) stoneBall(bx - 2, 1, 2.8);
    rect(-14, -5, 5, 12, '#d01818');
  },
  // 2 egg automatic (a hen on a wooden mount)
  (k) => {
    scl(0.82);
    rect(-12, 2, 22, 6, WOOD);
    rect(-10, 8, 4, 6, WOOD_D); rect(4, 8, 4, 6, WOOD_D);
    const sq = k > 0 && k < 0.6 ? Math.sin(k / 0.6 * Math.PI) * 1.5 : 0;
    // hen body facing left, tail pointing right (eggs fly out to the right)
    blob([-10, 0, -6, -8, 4, -9 + sq, 12, -6, 11, 2, 0, 3], '#f7f7f0');
    poly([10, -8, 16, -12, 14, -4], '#f0f0e6');
    circ(-9, -9, 3.6, '#f7f7f0');
    poly([-12, -10, -16, -9, -12, -7], '#e8a020');
    poly([-10, -13, -9, -16, -7, -13], '#d02020');
    circ(-10, -9.5, 0.7, OUT, null);
    pline([-2, -4, 3, -2, 6, -5], '#bdbdb0', 0.8);
  },
  // 3 primitive catapult: bone lever on a dino skull
  (k) => {
    scl(0.82);
    const sw = k <= 0 ? 0 : k < 0.2 ? -k / 0.2 * 0.2 : k < 0.35 ? lerp(-0.2, 2.6, (k - 0.2) / 0.15) : lerp(2.6, 0, (k - 0.35) / 0.65);
    save(); rot(sw);
    poly([0, -2, -34, -3, -34, 1, 0, 2], '#f4efe0');
    ell(-36, -3, 6, 3.5, WOOD_D);
    if (k <= 0 || k > 0.45) stoneBall(-36, -6.5, 4);
    restore();
    // skull
    blob([-6, -6, 2, -11, 14, -9, 22, -4, 20, 3, 8, 6, -4, 5], '#f4efe0');
    circ(7, -4, 2.8, '#2a2418');
    poly([16, 2, 22, 2, 20, 6], '#f4efe0');
    poly([-2, -9, -8, -16, 0, -11], '#f4efe0');
    pline([12, 2, 13, 5, 15, 2, 16, 5], OUT, 0.6);
    circ(0, 0, 2, WOOD_D);
  },
  // 4 catapult
  (k) => catapultDraw(k, false),
  // 5 fire catapult
  (k) => catapultDraw(k, true),
  // 6 oil: long wooden arm with a cauldron
  (k) => {
    const c = G.ctx;
    c.beginPath(); c.moveTo(-6, 4); c.quadraticCurveTo(50, -40, 108, -26); c.lineTo(108, -22); c.quadraticCurveTo(50, -34, -6, 10); c.closePath();
    fs(WOOD);
    poly([-10, -6, 18, -30, 22, -26, -6, 0], WOOD_D);
    rect(-12, 0, 14, 10, WOOD_D);
    pline([108, -24, 103, -6], OUT, 0.8); pline([108, -24, 114, -6], OUT, 0.8);
    const tilt = k > 0 && k < 0.8 ? Math.sin(Math.min(1, k / 0.3) * Math.PI / 2) * 0.9 * (k < 0.6 ? 1 : (0.8 - k) / 0.2) : 0;
    save(); tr(108, -6); rot(tilt);
    blob([-9, 0, 9, 0, 8, 9, 0, 12, -8, 9], '#2c2c2c');
    ell(0, 0, 9.5, 2.5, '#1a1a1a');
    rect(-3, -2, 6, 2, '#555', OUT, 0.5);
    restore();
  },
  // 7 small cannon (brass)
  (k) => cannonDraw(k, BRASS, BRASS_D, '#f0cf6a', 0.64),
  // 8 large cannon (steel)
  (k) => cannonDraw(k, '#4c5462', '#2c323a', '#8a93a3', 0.8),
  // 9 explosive cannon (dark red)
  (k) => cannonDraw(k, '#7c1818', '#4a0c0c', '#c04444', 0.84),
  // 10 single turret
  (k) => mgDraw(k, 1),
  // 11 rocket turret
  (k) => {
    const rec = k > 0 && k < 0.3 ? (1 - k / 0.3) * 2 : 0;
    save(); tr(-rec, 0);
    rrect(-14, -8, 30, 16, 2, OLIVE);
    rect(-14, -2, 30, 4, '#c8b030', null);
    rrect(-14, -8, 30, 16, 2, null);
    rect(14, -6, 4, 12, OLIVE_D);
    circ(16, -3, 1.6, '#222', null); circ(16, 3, 1.6, '#222', null);
    rect(-10, -11, 8, 3, OLIVE_D);
    restore();
  },
  // 12 double turret
  (k) => mgDraw(k, 2),
  // 13 titanium shooter
  (k) => {
    rrect(-14, -6, 26, 12, 3, '#c02020');
    rect(-10, -6, 4, 12, '#aaa'); rect(4, -6, 4, 12, '#aaa');
    rect(-4, -2, 7, 4, '#f0e040', OUT, 0.6);
    rect(12, -3, 5, 6, '#9a9a9a');
    const gl = k > 0 && k < 0.4 ? 1.5 : 1;
    circ(19, 0, 3.4 * gl, radGrad(19, 0, 0, 7 * gl, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(120,255,120,0.9)'], [1, 'rgba(60,255,60,0)']]), null);
  },
  // 14 laser cannon
  (k) => futurePod(k, '#ff2a2a', 'rgba(255,60,60,'),
  // 15 ion ray
  (k) => futurePod(k, '#2a7aff', 'rgba(60,140,255,'),
];

function catapultDraw(k, fire) {
  const sw = k <= 0 ? 0 : k < 0.12 ? -k / 0.12 * 0.25 : k < 0.2 ? lerp(-0.25, 2.4, (k - 0.12) / 0.08) : lerp(2.4, 0, (k - 0.2) / 0.8);
  save(); rot(sw);
  // arm with rope bindings
  rect(-44, -2.5, 46, 5, WOOD_L);
  for (let x = -34; x < -6; x += 7) pline([x, -2.5, x + 2, 2.5], OUT, 0.6);
  rect(-26, -3.5, 12, 7, '#d8c9a0', OUT, 0.6);
  // bucket
  blob([-50, -4, -38, -4, -40, 4, -48, 4], WOOD_D);
  if (k <= 0 || k > 0.25) {
    if (fire) {
      circ(-44, -7, 4.5, radGrad(-44, -8, 0, 7, [[0, '#fff6a0'], [0.4, '#ffb020'], [1, '#e04010']]));
    } else stoneBall(-44, -7, 4.5, '#6f6f68');
  }
  restore();
  // brass gear mount
  const c = G.ctx;
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2, r = i % 2 ? 7 : 8.6;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath(); fs(BRASS);
  circ(0, 0, 3.4, BRASS_D);
  poly([4, -6, 12, -12, 14, -8, 8, -2], BRASS);
  poly([4, 6, 12, 12, 14, 8, 8, 2], BRASS);
}

function cannonDraw(k, col, dark, light, s) {
  const rec = k > 0 && k < 0.25 ? (1 - k / 0.25) * 3 : 0;
  save(); scl(s); tr(-rec, 0);
  const c = G.ctx;
  c.beginPath();
  c.moveTo(-16, -7);
  c.bezierCurveTo(-6, -8.5, 10, -5, 26, -4.2);
  c.lineTo(28, -5); c.lineTo(28, 5); c.lineTo(26, 4.2);
  c.bezierCurveTo(10, 5, -6, 8.5, -16, 7);
  c.quadraticCurveTo(-22, 0, -16, -7);
  c.closePath();
  fs(linGrad(0, -8, 0, 8, [[0, light], [0.35, col], [1, dark]]));
  circ(-21, 0, 2.6, dark);
  pline([-6, -7.6, -6, 7.6], OUT, 0.7);
  pline([12, -4.6, 12, 4.6], OUT, 0.7);
  ell(-2, -4, 8, 1.3, 'rgba(255,255,255,0.35)', null);
  restore();
}

function mgDraw(k, barrels) {
  const rec = k > 0 && k < 0.15 ? 1.5 : 0;
  // housing
  rrect(-13, -8, 20, 16, 2.5, OLIVE);
  rect(-13, -8, 20, 4, OLIVE_L, OUT, 0.6);
  rect(-9, -3, 10, 6, OLIVE_D, OUT, 0.6);
  // barrels
  const ys = barrels === 2 ? [-3.5, 3.5] : [0];
  for (const y of ys) {
    rect(7 - rec, y - 1.6, 20, 3.2, '#3a3a3a');
    rect(20 - rec, y - 2.2, 4, 4.4, '#2a2a2a');
  }
  rect(5, -5, 4, 10, '#4a4a4a');
  if (k > 0 && k < 0.12) {
    for (const y of ys) {
      poly([28, y, 34, y - 3, 38, y, 34, y + 3], '#ffe060', '#ff9000', 0.6);
    }
  }
}

function futurePod(k, core, glow) {
  // white spinning pod on the spire with a glowing orb
  blob([-12, 0, -8, -8, 4, -9, 12, -4, 12, 4, 4, 9, -8, 8], '#f2f2f2');
  poly([-12, -2, -18, 0, -12, 2], '#dcdcdc');
  ell(-2, 0, 6, 5, '#9a9a9a');
  circ(-2, 0, 3.2, '#5a5a5a');
  const pulse = k > 0 && k < 1 ? 1.35 : 1;
  const r = 5 * pulse;
  circ(10, 0, r * 1.9, radGrad(10, 0, 0, r * 1.9, [[0, glow + '0.8)'], [1, glow + '0)']]), null);
  circ(10, 0, r * 0.75, core, null);
  circ(10, 0, r * 0.35, '#fff', null);
}

// Draw a turret at the current origin. side 2 = enemy (mirrored so it stays upright).
function drawTurret(id, angleDeg, k, side) {
  save();
  if (TURRETS[id].noAim) {
    if (side === 2) scl(-1, 1);
  } else {
    rot(D(angleDeg));
    if (side === 2) scl(1, -1);
  }
  TURRET_DRAW[id](k);
  restore();
}

// ------------------------------------------------------------------ projectiles
function drawBullet(b) {
  const c = G.ctx;
  save(); tr(b.x, b.y);
  switch (b.type) {
    case 1: stoneBall(0, 0, 2.6, '#7d7a70'); break;
    case 2: rot(b.rot); ell(0, 0, 3.2, 2.4, '#fbf8ee', OUT, 0.7); break;
    case 3: stoneBall(0, 0, 4.2, '#7a766b'); break;
    case 4: {
      rot(Math.atan2(b.vy, b.vx));
      poly([0, -4, -14, 0, 0, 4], 'rgba(255,140,20,0.8)', null);
      circ(0, 0, 4.6, radGrad(0, -1, 0, 6, [[0, '#fffbd0'], [0.45, '#ffb21c'], [1, '#e33d0b']]), '#a02000', 0.6);
      break;
    }
    case 6: circ(0, 0, 3.2, '#222'); break;
    case 7: circ(0, 0, 4, '#1a1a1a'); circ(-1, -1.3, 1.2, '#a02020', null); break;
    case 8: rot(Math.atan2(b.vy, b.vx)); rect(-6, -0.9, 8, 1.8, '#ffe36a', '#b08000', 0.4); break;
    case 9: {
      rot(Math.atan2(b.vy, b.vx));
      poly([-18, -1.5, -30, 0, -18, 1.5], 'rgba(255,220,60,0.9)', null);
      poly([-12, 0, -22, -3, -22, 3], '#ffb030', null);
      rect(-12, -2, 16, 4, '#8a8f80');
      poly([4, -2, 9, 0, 4, 2], '#b02020');
      poly([-12, -2, -15, -5, -9, -2], '#555'); poly([-12, 2, -15, 5, -9, 2], '#555');
      break;
    }
    case 10: case 11: case 12: {
      const col = b.type === 10 ? [255, 40, 40] : b.type === 11 ? [60, 150, 255] : [70, 255, 90];
      circ(0, 0, 7, radGrad(0, 0, 0, 7, [[0, `rgba(${col},0.8)`], [1, `rgba(${col},0)`]]), null);
      circ(0, 0, 2.4, '#fff', null);
      break;
    }
    case 'meteor': {
      scl(b.scale);
      const g = radGrad(0, 0, 0, 12, [[0, 'rgba(255,240,120,0.95)'], [0.5, 'rgba(255,140,20,0.7)'], [1, 'rgba(255,60,0,0)']]);
      circ(0, -4, 12, g, null);
      stoneBall(0, 0, 5, '#6b6358');
      break;
    }
    case 'arrow': {
      rot(Math.atan2(b.vy, b.vx));
      pline([-14, 0, 6, 0], '#7a5230', 1.2);
      poly([6, -2, 11, 0, 6, 2], '#c8c8c8', OUT, 0.5);
      poly([-14, 0, -18, -3, -12, 0], '#2f8f2f', null); poly([-14, 0, -18, 3, -12, 0], '#2f8f2f', null);
      pline([9, 0, 11, 0], '#f0e060', 1.2);
      break;
    }
    case 'bomb': {
      rot(Math.atan2(b.vy, b.vx));
      ell(0, 0, 6, 2.6, '#4d5a2a');
      poly([-5, 0, -9, -3, -9, 3], '#3a4520');
      break;
    }
  }
  restore();
}

// ------------------------------------------------------------------ particles
const BLOOD = ['#c80000', '#a00000', '#e01818'];
function drawParticle(p) {
  const c = G.ctx;
  c.globalAlpha = clamp(p.alpha, 0, 1);
  switch (p.type) {
    case 'gold': {
      circ(p.x - 12, p.y + 6, 4.2, linGrad(p.x - 15, 0, p.x - 9, 0, [[0, '#8a7000'], [0.5, '#ffe54a'], [1, '#b89400']]), '#5a4a00', 0.7);
      text('+ ' + p.value, p.x - 4, p.y, { font: 'bold 12px Arial, sans-serif', color: '#ffff33', stroke: '#3a3000', sw: 2.4 });
      break;
    }
    case 'blood':
      save(); tr(p.x, p.y); rot(p.rot);
      ell(0, 0, p.size, p.size * 0.7, BLOOD[p.v % 3], null);
      restore();
      break;
    case 'spark':
      circ(p.x, p.y, p.size, p.v % 2 ? '#ffd040' : '#ff8a20', null);
      break;
    case 'debris':
      save(); tr(p.x, p.y); rot(p.rot);
      poly([-p.size, -p.size * 0.6, p.size * 0.8, -p.size, p.size, p.size * 0.7, -p.size * 0.6, p.size], p.v % 2 ? '#8a7a55' : '#6b6b62', OUT, 0.5);
      restore();
      break;
    case 'smoke':
      circ(p.x, p.y, p.size, p.color || 'rgba(120,120,120,0.8)', null);
      break;
    case 'fire':
      circ(p.x, p.y, p.size * 1.8, radGrad(p.x, p.y, 0, p.size * 1.8, [[0, 'rgba(255,240,150,0.9)'], [0.5, 'rgba(255,140,20,0.7)'], [1, 'rgba(255,40,0,0)']]), null);
      break;
    case 'oil':
      ell(p.x, p.y, 1.6, 2.4, '#1c140c', null);
      break;
    case 'splash':
      circ(p.x, p.y, p.size, '#2a2016', null);
      break;
    case 'explosion': {
      // expanding fireball + smoke (original part7 / part12 animations)
      const t = p.t / p.life;
      const R = p.size * (0.4 + t * 0.8);
      if (t < 0.35) circ(p.x, p.y - R * 0.3, R * 1.1, radGrad(p.x, p.y - R * 0.3, 0, R * 1.1, [[0, '#ffffff'], [0.3, '#fff2a0'], [0.7, '#ffae20'], [1, 'rgba(255,90,0,0)']]), null);
      const sa = t < 0.35 ? 0.6 : 0.8 * (1 - t);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2 + p.v;
        circ(p.x + Math.cos(a) * R * 0.45, p.y - R * 0.45 + Math.sin(a) * R * 0.35 - t * 10, R * 0.5, `rgba(${t < 0.3 ? '70,70,70' : '60,60,60'},${sa})`, t < 0.5 ? OUT : null, 0.6);
      }
      break;
    }
    case 'flash':
      circ(p.x, p.y, p.size, `rgba(255,255,255,${1 - p.t / p.life})`, null);
      break;
    case 'ionblast': {
      const t = p.t / p.life;
      const R = p.size * (0.6 + t * 0.6);
      circ(p.x, p.y, R, radGrad(p.x, p.y, 0, R, [[0, 'rgba(255,255,255,0.95)'], [0.25, 'rgba(200,240,255,0.9)'], [0.6, 'rgba(60,160,255,0.55)'], [1, 'rgba(30,80,255,0)']]), null);
      break;
    }
    case 'beam': {
      const a = 1 - p.t / p.life;
      c.fillStyle = linGrad(p.x - 10, 0, p.x + 10, 0, [[0, 'rgba(80,170,255,0)'], [0.5, `rgba(220,245,255,${a})`], [1, 'rgba(80,170,255,0)']]);
      c.fillRect(p.x - 10, 0, 20, p.y);
      break;
    }
  }
  c.globalAlpha = 1;
}

// ------------------------------------------------------------------ special attack scenery
function drawPlane(x, y, t) {
  save(); tr(x, y);
  const c = G.ctx;
  // fuselage (olive WWII style bomber)
  c.beginPath();
  c.moveTo(-44, -2); c.quadraticCurveTo(-30, -8, 10, -7); c.quadraticCurveTo(34, -6, 40, 0); c.quadraticCurveTo(30, 6, 0, 6); c.lineTo(-44, 3); c.closePath();
  fs(linGrad(0, -8, 0, 6, [[0, '#8a9a58'], [1, '#56662a']]));
  poly([-44, -2, -52, -14, -44, -14, -34, -4], '#6f7f3a');
  poly([-40, 1, -54, 4, -40, 4], '#6f7f3a');
  // wing
  poly([-6, 0, 10, 0, 4, 8, -18, 8], '#5f6f2e');
  // cockpit
  blob([12, -7, 18, -11, 26, -9, 26, -6], '#bfe0f0', OUT, 0.7);
  // propeller
  rect(40, -2, 3, 4, '#555');
  const pa = t * 2.2;
  ell(44, 0, 1.2, 10 * Math.abs(Math.cos(pa)) + 1, '#333', null);
  ell(44, 0, 1.2, 10 * Math.abs(Math.sin(pa)) + 1, 'rgba(60,60,60,0.6)', null);
  circ(17, -1, 2, '#fff', OUT, 0.5); circ(17, -1, 1, '#c02020', null);
  restore();
}
