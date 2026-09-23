'use strict';
// The 16 units. Each unit type has body dimensions, a "skin" (how every body part is painted)
// and pose functions for walk / idle / attack / shoot / die.

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(clamp(r * f, 0, 255)); g = Math.round(clamp(g * f, 0, 255)); b = Math.round(clamp(b * f, 0, 255));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const SKIN = '#f6e9cf', SKIN_D = '#e2cfa8';

// ------------------------------------------------------------------ body part painters
function paintLeg(L, B, S, far, hipPt) {
  const f = far ? 0.82 : 1;
  const thighCol = shade(S.thigh || SKIN, f), shinCol = shade(S.shin || S.thigh || SKIN, f);
  seg(hipPt, L.a, B.thigh + 1, B.wThigh, B.wThigh * 0.8, thighCol);
  seg(L.knee, L.b, B.shin, B.wShin * 1.05, B.wShin * 0.8, shinCol);
  if (S.knee) S.knee(L, B, f);
  // foot
  save(); tr(L.ank[0], L.ank[1]);
  const fa = clamp(L.b, -35, 35) * 0.4;
  rot(-D(fa) * 0.5);
  const fl = B.H * 0.09, fh = B.H * 0.05;
  const col = shade(S.foot || SKIN, f);
  if (S.boot) {
    blob([-fh * 0.6, -fh * 1.2, fh * 0.4, -fh * 1.1, fl, -fh * 0.1, fl * 0.9, fh * 0.5, -fh * 0.6, fh * 0.5], col, OUT, LW * 0.9, 0.5);
  } else {
    blob([-fh * 0.4, -fh * 0.9, fh * 0.4, -fh * 0.6, fl, 0, fl * 0.85, fh * 0.45, -fh * 0.5, fh * 0.45], col, OUT, LW * 0.9, 0.6);
  }
  restore();
}

function paintArm(A, B, S, far, shPt) {
  const f = far ? 0.82 : 1;
  seg(shPt, A.a, B.upper, B.wUpper, B.wUpper * 0.85, shade(S.upper || SKIN, f));
  seg(A.el, A.b, B.fore, B.wFore * 1.05, B.wFore * 0.85, shade(S.fore || S.upper || SKIN, f));
  if (S.shoulderPad && !far) S.shoulderPad(shPt, A, B);
  circ(A.wr[0] + Math.sin(D(A.b)) * 0.8, A.wr[1] + Math.cos(D(A.b)) * 0.8, B.wFore * 0.62, shade(S.hand || SKIN, f), OUT, LW * 0.8);
}

function paintTorso(R, p, B, S) {
  save(); tr(R.hip[0], R.hip[1]); rot(D(p.lean));
  const t = B.torso, wh = B.wHip / 2, wc = B.wChest / 2;
  const c = G.ctx;
  c.beginPath();
  c.moveTo(-wh, 2);
  c.lineTo(-wc * 0.95, -t * 0.55);
  c.quadraticCurveTo(-wc, -t * 1.02, -wc * 0.2, -t * 1.02);
  c.lineTo(wc * 0.35, -t * 1.0);
  c.quadraticCurveTo(wc * 1.05, -t * 0.95, wc * 0.95, -t * 0.55);
  c.lineTo(wh, 2);
  c.closePath();
  fs(S.torso || SKIN);
  if (S.torsoDetail) S.torsoDetail(B, t, wh, wc);
  restore();
}

function paintHead(R, p, B, S) {
  save(); tr(R.head[0], R.head[1]); rot(D(p.lean + p.head));
  const r = B.headR;
  if (S.hairBack) S.hairBack(r);
  if (!S.noFace) {
    // neck
    rect(-r * 0.35, r * 0.6, r * 0.7, r * 0.6, S.neck || SKIN, OUT, LW * 0.8);
    blob([-r, -r * 0.2, -r * 0.6, -r, r * 0.4, -r * 1.05, r * 1.02, -r * 0.3, r * 1.1, r * 0.3, r * 0.6, r * 0.95, -r * 0.4, r * 0.95], S.face || SKIN, OUT, LW * 0.9);
    // eye + nose
    circ(r * 0.55, -r * 0.12, r * 0.13, OUT, null);
    poly([r * 1.02, -r * 0.05, r * 1.28, r * 0.25, r * 1.0, r * 0.35], S.face || SKIN, OUT, LW * 0.7);
  }
  if (S.headDetail) S.headDetail(r);
  restore();
}

// generic humanoid
function paintHumanoid(p, B, S) {
  const R = solveRig(p, B);
  if (S.behind) S.behind(R, p, B);
  if (S.weaponFar) S.weaponFar(R, p, B);
  paintArm(R.aB, B, S, true, R.sh);
  paintLeg(R.lB, B, S, true, R.hip);
  paintTorso(R, p, B, S);
  paintLeg(R.lF, B, S, false, R.hip);
  if (S.skirt) S.skirt(R, p, B);
  paintHead(R, p, B, S);
  if (S.weaponMid) S.weaponMid(R, p, B);
  paintArm(R.aF, B, S, false, R.sh);
  if (S.weaponNear) S.weaponNear(R, p, B);
  return R;
}

// helper: draw something in the frame of the near hand (axis along forearm, pointing away from elbow)
function inHand(A, extraDeg, fn) {
  save(); tr(A.wr[0], A.wr[1]); rot(-D(A.b + extraDeg)); fn(); restore();
}
// helper: draw weapon in a frame at pos with absolute angle (degrees, 0 = pointing forward +x)
function atAngle(x, y, deg, fn) { save(); tr(x, y); rot(D(deg)); fn(); restore(); }

// ------------------------------------------------------------------ weapons (drawn along +y from the hand)
function wClub(len) {
  const c = G.ctx;
  c.beginPath();
  c.moveTo(-1.3, -3); c.lineTo(-2.2, len * 0.55); c.quadraticCurveTo(-4.4, len * 1.02, 0, len * 1.05);
  c.quadraticCurveTo(4.2, len * 0.95, 2.4, len * 0.5); c.lineTo(1.3, -3); c.closePath();
  fs('#8a4f22');
  pline([0.5, len * 0.6, 1.4, len * 0.72], '#5a3010', 0.7);
  pline([-1.2, len * 0.8, -0.4, len * 0.9], '#5a3010', 0.7);
}
function wSword(len, blade = '#5a5a5a', edge = '#b8b8b8') {
  rect(-1, -4, 2, 5, '#3a2a1a', OUT, 0.6);
  rect(-3.5, 0.5, 7, 1.8, '#c8a030', OUT, 0.6);
  poly([-1.6, 2.3, -1.6, len - 3, 0, len, 1.6, len - 3, 1.6, 2.3], blade, OUT, 0.8);
  pline([0.6, 3, 0.6, len - 3], edge, 0.8);
}
function wRapier(len) {
  circ(0, 1, 2.2, null, '#c8b060', 0.8);
  rect(-3, 1.8, 6, 1.2, '#c8b060', OUT, 0.4);
  poly([-0.7, 3, 0, len, 0.7, 3], '#e8e8e8', OUT, 0.6);
}
function wKnife(len) {
  rect(-1.2, -2, 2.4, 4, '#2a2a2a', OUT, 0.5);
  poly([-1.5, 2, -1.2, len * 0.8, 0, len, 1.6, len * 0.7, 1.6, 2], '#dcdcdc', OUT, 0.7);
}
function wSpear(len, back) {
  pline([0, -back, 0, len], '#8a6a3a', 1.6);
  poly([-1.8, len, 0, len + 7, 1.8, len], '#9a9a9a', OUT, 0.6);
}

// ------------------------------------------------------------------ cavemen
const leopardSpots = (B, t, wh, wc, seed) => {
  const r = rng(seed);
  for (let i = 0; i < 7; i++) ell(-wc * 0.7 + r() * wc * 1.3, -t * 0.9 + r() * t * 0.85, 1.1 + r() * 0.6, 0.9 + r() * 0.4, '#8a6a1a', null);
};
function caveHair(r) {
  blob([-r * 1.25, r * 0.2, -r * 1.3, -r * 0.9, -r * 0.4, -r * 1.4, r * 0.7, -r * 1.25, r * 1.05, -r * 0.55, r * 0.1, -r * 0.7, -r * 0.2, r * 0.3, -r * 0.6, r * 2.0, -r * 1.4, r * 2.2], '#3d2b1a', OUT, LW * 0.9);
}
function caveBeard(r) {
  blob([-r * 0.2, r * 0.05, r * 0.35, r * 0.2, r * 1.05, r * 0.3, r * 0.9, r * 1.25, r * 0.2, r * 1.7, -r * 0.35, r * 1.2], '#1e1712', OUT, LW * 0.8);
  // white band across the eyes (the mask-like face of the original cavemen)
  poly([r * 0.2, -r * 0.35, r * 1.05, -r * 0.3, r * 1.08, r * 0.08, r * 0.25, r * 0.05], '#ffffff', OUT, LW * 0.6);
  circ(r * 0.62, -r * 0.13, r * 0.12, OUT, null);
}
const caveSkin = {
  torso: '#d8b43c',
  torsoDetail(B, t, wh, wc) {
    // skin shoulder on one side (one-strap tunic)
    const c = G.ctx;
    c.save(); c.beginPath(); c.moveTo(-wc * 0.2, -t * 1.05); c.lineTo(wc * 1.1, -t * 1.05); c.lineTo(wc * 1.1, -t * 0.72); c.lineTo(wc * 0.3, -t * 0.7); c.closePath();
    c.fillStyle = SKIN; c.fill(); c.restore();
    leopardSpots(B, t, wh, wc, 5);
  },
  skirt(R, p, B) {
    save(); tr(R.hip[0], R.hip[1]); rot(D(p.lean));
    const w = B.wHip * 0.62, h = B.H * 0.13;
    poly([-w, -2, w, -2, w * 1.05, h * 0.7, w * 0.5, h, 0, h * 0.75, -w * 0.5, h * 1.05, -w * 1.05, h * 0.65], '#d8b43c', OUT, LW * 0.9);
    ell(-w * 0.4, h * 0.3, 1.2, 0.9, '#8a6a1a', null); ell(w * 0.4, h * 0.45, 1.1, 0.9, '#8a6a1a', null);
    restore();
  },
  hairBack: caveHair,
  headDetail: caveBeard,
};

function caveWalk(p, ph) { walkLegs(p, ph, 24, 40); walkArms(p, ph, 18); return p; }

const UNIT_ART = [];

// 1 club man
UNIT_ART[1] = {
  B: bodyDims(44),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') { caveWalk(p, ph); p.sF = 18 - 8 * Math.sin(ph * 6.283); p.eF = 12; }
    else if (st.anim === 'attack') {
      idleBody(p, 0.2); p.tF = 14; p.kF = 10; p.tB = -12;
      applyTo(p, keys([[0, { sF: 30, eF: 20, lean: 4 }], [0.3, { sF: 175, eF: 25, lean: -8 }], [0.42, { sF: 185, eF: 20, lean: -10 }],
        [0.5, { sF: 75, eF: 5, lean: 16 }], [0.62, { sF: 60, eF: 15, lean: 14 }], [1, { sF: 30, eF: 20, lean: 4 }]], ph));
      p.sB = -20 + p.lean;
    } else { idleBody(p, ph); p.sF = 14; p.eF = 16; }
    return p;
  },
  skin: Object.assign({}, caveSkin, {
    // the club extends from the fist, angled forward from the forearm
    weaponNear(R) { inHand(R.aF, 22, () => wClub(18)); },
  }),
};

// 2 slingshot man
UNIT_ART[2] = {
  B: bodyDims(44),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') { caveWalk(p, ph); }
    else if (st.anim === 'shoot' || st.anim === 'shootwalk') {
      if (st.anim === 'shootwalk') caveWalk(p, ph); else idleBody(p, 0.3);
      const hit = st.hit / st.len;
      applyTo(p, keys([[0, { sF: 80, eF: 5, sB: 60, eB: 40 }], [hit * 0.8, { sF: 88, eF: 2, sB: 70, eB: 60 }], [hit, { sF: 88, eF: 2, sB: 76, eB: 25 }], [1, { sF: 80, eF: 5, sB: 60, eB: 40 }]], ph));
    } else if (st.anim === 'attack') {
      idleBody(p, 0.2);
      applyTo(p, keys([[0, { sF: 40, eF: 30, lean: 4 }], [0.35, { sF: 150, eF: 30, lean: -6 }], [0.5, { sF: 80, eF: 10, lean: 14 }], [1, { sF: 40, eF: 30, lean: 4 }]], ph));
    } else { idleBody(p, ph); }
    return p;
  },
  skin: Object.assign({}, caveSkin, {
    torso: '#d8b43c',
    torsoDetail(B, t, wh, wc) {
      const c = G.ctx;
      c.save(); c.beginPath(); c.rect(-wc * 1.2, -t * 0.45, wc * 2.4, t * 0.6); c.fillStyle = SKIN; c.fill(); c.restore();
      pline([-wh, -t * 0.45, wh, -t * 0.45], OUT, 0.6);
      leopardSpots(B, t * 0.55, wh, wc, 9);
    },
    skirt(R, p, B) {
      save(); tr(R.hip[0], R.hip[1]); rot(D(p.lean));
      const w = B.wHip * 0.6, h = B.H * 0.1;
      poly([-w, -3, w, -3, w * 0.9, h * 0.8, 0, h, -w * 0.9, h * 0.8], '#8a5a2a', OUT, LW * 0.9);
      restore();
    },
    headDetail(r) { caveBeard(r); rect(-r * 1.25, -r * 0.8, r * 2.3, r * 0.42, '#e8c830', OUT, LW * 0.6); },
    weaponNear(R, p) {
      inHand(R.aF, 0, () => {
        pline([0, -1, 0, 5], '#7a4a1a', 1.8);
        pline([0, 5, -3, 10], '#7a4a1a', 1.6); pline([0, 5, 3, 10], '#7a4a1a', 1.6);
      });
      if (p.sF > 70) {
        // rubber band to the far hand
        const h = R.aB.wr;
        const tipX = R.aF.wr[0] + Math.sin(D(R.aF.b)) * 9, tipY = R.aF.wr[1] + Math.cos(D(R.aF.b)) * 9;
        pline([tipX - 2, tipY - 2, h[0], h[1], tipX + 2, tipY + 2], '#6a3a1a', 0.7);
        circ(h[0], h[1], 1.5, '#7d7a70', OUT, 0.5);
      }
    },
  }),
};

// ------------------------------------------------------------------ dino rider (3)
function drawDino(st, rider) {
  const c = G.ctx;
  const ph = st.anim === 'walk' ? st.f / st.len : st.anim === 'idle' ? 0 : 0.0;
  const w = Math.sin(ph * Math.PI * 2);
  let headDip = 0;
  if (st.anim === 'attack') {
    const k = st.f / st.len, hk = st.hit / st.len;
    headDip = keys([[0, { d: 0 }], [hk * 0.7, { d: -10 }], [hk, { d: 18 }], [hk + 0.15, { d: 12 }], [1, { d: 0 }]], k).d;
  } else if (st.anim === 'idle') headDip = Math.sin(st.f / st.len * Math.PI * 2) * 2;
  const green = '#3f9a2c', greenD = '#2f7a20', belly = '#8fcf5a';
  // legs: far legs first
  const legs = (xOff, phase, far) => {
    const a = Math.sin((ph + phase) * Math.PI * 2) * 18;
    save(); tr(xOff, -20); rot(-D(a) * 0.9);
    limb(18, 9, 7, far ? greenD : green);
    restore();
    const fx = xOff + Math.sin(D(a)) * 18 * 0.9;
    ell(fx + 2, -2, 5, 2.6, far ? greenD : green);
  };
  legs(-20, 0.5, true); legs(16, 0, true);
  // tail
  c.beginPath(); c.moveTo(-26, -34); c.quadraticCurveTo(-46, -34 + w, -58, -18 + w * 2); c.quadraticCurveTo(-44, -26, -24, -22); c.closePath(); fs(green);
  // body
  blob([-30, -30, -18, -44, 6, -46, 24, -38, 30, -26, 20, -16, -4, -14, -26, -18], green);
  c.save(); blobPath([-30, -30, -18, -44, 6, -46, 24, -38, 30, -26, 20, -16, -4, -14, -26, -18]); c.clip();
  ell(0, -12, 30, 7, belly, null); c.restore();
  blobPath([-30, -30, -18, -44, 6, -46, 24, -38, 30, -26, 20, -16, -4, -14, -26, -18]); fs(null);
  // back plates
  for (let i = 0; i < 4; i++) poly([-18 + i * 10, -43, -13 + i * 10, -50, -8 + i * 10, -44], greenD, OUT, 0.7);
  legs(-16, 0, false); legs(20, 0.5, false);
  // head with nose horn and frill
  save(); tr(26, -34); rot(D(headDip));
  blob([-4, -8, 6, -12, 18, -8, 26, -2, 22, 5, 8, 6, -2, 4], green);
  poly([16, -8, 21, -18, 21, -8], '#f4efe0', OUT, 0.7);
  poly([4, -10, 0, -20, 9, -11], '#f4efe0', OUT, 0.7);
  circ(12, -4, 2.2, '#f0d020', OUT, 0.6); circ(12.6, -4, 0.8, OUT, null);
  pline([14, 3, 24, 1], OUT, 0.7);
  restore();
  // saddle
  poly([-8, -44, 10, -46, 12, -40, -8, -39], '#8a5a2a', OUT, 0.8);
}

UNIT_ART[3] = {
  B: bodyDims(40),
  pose(st) {
    const p = newPose();
    // rider sitting on the dino
    p.tF = 70; p.kF = 80; p.tB = 60; p.kB = 70; p.lean = 2;
    p.sF = 60; p.eF = 30; p.sB = 50; p.eB = 40;
    if (st.anim === 'attack') {
      const k = st.f / st.len, hk = st.hit / st.len;
      applyTo(p, keys([[0, { sF: 60, eF: 30, lean: 2 }], [hk * 0.7, { sF: 40, eF: 10, lean: -6 }], [hk, { sF: 95, eF: 0, lean: 14 }], [1, { sF: 60, eF: 30, lean: 2 }]], k));
    } else if (st.anim === 'walk') {
      p.y = Math.abs(Math.sin(st.f / st.len * Math.PI * 2)) * -1.5;
    }
    return p;
  },
  draw(st, p) {
    save(); scl(0.74); drawDino(st); restore();
    save(); tr(0, -20 + p.y);
    const B = this.B;
    const S = this.skin;
    // rider without legs visible below the saddle (draw legs as bent over the dino's side)
    paintHumanoid(p, B, S);
    restore();
  },
  skin: Object.assign({}, caveSkin, {
    hairBack(r) {
      // feather mohawk
      const cols = ['#e04a8a', '#8a3ad0', '#e04a8a', '#3a8ad0', '#e04a8a'];
      for (let i = 0; i < 5; i++) {
        save(); rot(D(-60 + i * 22)); poly([-1, -r * 0.9, 0, -r * 2.6, 1.2, -r * 0.9], cols[i], OUT, 0.5); restore();
      }
    },
    noFace: true,
    headDetail(r) {
      // skull mask
      blob([-r * 0.9, -r * 0.2, -r * 0.4, -r * 1.05, r * 0.7, -r * 0.9, r * 1.5, -r * 0.2, r * 1.3, r * 0.5, r * 0.4, r * 1.05, -r * 0.6, r * 0.8], '#f6f3e8', OUT, LW * 0.9);
      circ(r * 0.5, -r * 0.2, r * 0.25, '#222', null);
      pline([r * 0.7, r * 0.5, r * 0.8, r * 0.8, r * 0.95, r * 0.5, r * 1.05, r * 0.8], OUT, 0.5);
    },
    weaponNear(R, p) {
      // long spear held forward, slightly tilted
      const A = R.aF;
      save(); tr(A.wr[0], A.wr[1]); rot(D(-8 + (p.sF - 60) * 0.35));
      pline([-26, 0, 30, 0], '#b08850', 1.6);
      poly([30, -2, 38, 0, 30, 2], '#9a9a9a', OUT, 0.6);
      restore();
    },
  }),
};

// ------------------------------------------------------------------ medieval armour (sword man / archer)
const ARMOR = '#3b3b3e', ARMOR_L = '#6a6a70', TRIM = '#e6d23a';
const darkArmor = {
  torso: ARMOR, thigh: ARMOR, shin: '#4a4a4f', upper: ARMOR, fore: '#4a4a4f', hand: '#2a2a2c', foot: '#9a9a9a', boot: true, neck: ARMOR,
  torsoDetail(B, t, wh, wc) {
    pline([-wc * 0.6, -t * 0.95, wc * 0.3, -t * 0.2, wc * 0.3, 0], TRIM, 1.1);
    pline([-wh * 0.9, -t * 0.1, wh * 0.9, -t * 0.1], TRIM, 1);
    ell(wc * 0.2, -t * 0.7, wc * 0.5, t * 0.18, ARMOR_L, null);
  },
  knee(L, B, f) { circ(L.knee[0], L.knee[1], B.wThigh * 0.55, shade('#6a6a70', f), OUT, 0.6); pline([L.knee[0] - 1.5, L.knee[1] + 1, L.knee[0] + 1.5, L.knee[1] + 1], TRIM, 0.8); },
  shoulderPad(sh, A, B) { save(); tr(sh[0], sh[1]); blob([-4, -2, 0, -4.5, 5, -2, 4.5, 3, -3, 3], ARMOR_L, OUT, 0.8); pline([-3, 1.5, 4, 1.5], TRIM, 0.8); restore(); },
  noFace: true,
  headDetail(r) {
    blob([-r * 1.05, r * 0.9, -r * 1.1, -r * 0.4, -r * 0.4, -r * 1.2, r * 0.7, -r * 1.1, r * 1.15, -r * 0.2, r * 1.1, r * 1.0], '#4a4a50', OUT, LW);
    rect(r * 0.1, -r * 0.25, r * 1.05, r * 0.22, '#111', null);
    pline([-r * 0.2, -r * 1.15, -r * 0.2, r * 0.9], TRIM, 0.8);
    ell(-r * 0.3, -r * 0.6, r * 0.4, r * 0.25, 'rgba(255,255,255,0.25)', null);
  },
};

UNIT_ART[4] = {
  B: bodyDims(50, { headR: 50 * 0.088 }),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') { walkLegs(p, ph, 24, 40); walkArms(p, ph, 14); p.sF = 20; p.eF = 40; }
    else if (st.anim === 'attack') {
      idleBody(p, 0.2); p.tF = 16; p.tB = -14;
      const hk = st.hit / st.len;
      if (st.v === 0) applyTo(p, keys([[0, { sF: 20, eF: 40, lean: 3 }], [hk * 0.75, { sF: 170, eF: 30, lean: -8 }], [hk, { sF: 80, eF: 0, lean: 16 }], [1, { sF: 20, eF: 40, lean: 3 }]], ph));
      else applyTo(p, keys([[0, { sF: 20, eF: 40, lean: 3 }], [hk * 0.7, { sF: -30, eF: 90, lean: -4 }], [hk, { sF: 95, eF: 5, lean: 14 }], [1, { sF: 20, eF: 40, lean: 3 }]], ph));
    } else { idleBody(p, ph); p.sF = 20; p.eF = 40; }
    return p;
  },
  skin: Object.assign({}, darkArmor, { weaponNear(R) { inHand(R.aF, -55, () => wSword(24)); } }),
};

UNIT_ART[5] = {
  B: bodyDims(50, { headR: 50 * 0.088 }),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk' || st.anim === 'shootwalk') { walkLegs(p, ph, 24, 40); }
    else idleBody(p, ph);
    if (st.anim === 'attack') {
      const hk = st.hit / st.len;
      applyTo(p, keys([[0, { sF: 60, lean: 3 }], [hk * 0.7, { sF: 20, lean: -4 }], [hk, { sF: 100, lean: 14 }], [1, { sF: 60, lean: 3 }]], ph));
      p._xb = 1;
    } else {
      let rec = 0;
      if (st.anim === 'shoot' || st.anim === 'shootwalk') { const hk = st.hit / st.len; rec = ph > hk && ph < hk + 0.15 ? 1 : 0; }
      p._aim = 1; p._rec = rec;
    }
    // crossbow held with both hands
    const B = this.B;
    const R0 = solveRig(p, B);
    let thrust = 0;
    if (st.anim === 'attack') { const hk = st.hit / st.len; thrust = keys([[0, { t: 0 }], [hk * 0.7, { t: -1 }], [hk, { t: 1.2 }], [1, { t: 0 }]], ph).t; }
    const cx = R0.sh[0] + 7 - (p._rec || 0) + thrust * 5, cy = R0.sh[1] + 5 - thrust;
    p._cb = [cx, cy];
    gripArms(p, B, [cx + 4, cy + 1], [cx - 4, cy + 2]);
    return p;
  },
  skin: Object.assign({}, darkArmor, {
    weaponMid(R, p) {
      const [cx, cy] = p._cb;
      atAngle(cx, cy, 0, () => {
        rect(-9, -1.4, 20, 2.8, '#6a4020', OUT, 0.7);
        const c = G.ctx;
        c.beginPath(); c.moveTo(9, -8); c.quadraticCurveTo(13, 0, 9, 8); c.strokeStyle = OUT; c.lineWidth = 2.2; c.stroke();
        c.strokeStyle = '#8a8a8a'; c.lineWidth = 1.2; c.stroke();
        pline([9, -8, 4, 0, 9, 8], '#ddd', 0.5);
        if (!p._rec) pline([4, 0, 12, 0], '#c8a060', 0.9);
      });
    },
  }),
};

// ------------------------------------------------------------------ knight on horse (6)
function drawHorse(st) {
  const c = G.ctx;
  const ph = st.anim === 'walk' ? st.f / st.len : 0;
  const coat = '#2e2e30';
  const plate = '#76767c';
  const leg = (x, phase, far) => {
    const a = st.anim === 'walk' ? Math.sin((ph + phase) * Math.PI * 2) * 20 : st.anim === 'attack' ? Math.sin(st.f / st.len * Math.PI * 2 + phase * 6) * 4 : 0;
    save(); tr(x, -26); rot(-D(a));
    limb(12, 6.5, 5, far ? '#1e1e20' : coat);
    tr(0, 12); rot(D(Math.max(0, a) * 1.1));
    limb(11, 4.6, 4, far ? '#55555b' : plate);
    rect(-3, 10, 6.5, 3.2, '#111', OUT, 0.6);
    restore();
  };
  leg(-19, 0.5, true); leg(17, 0, true);
  // tail
  c.beginPath(); c.moveTo(-28, -40); c.quadraticCurveTo(-40, -32, -38, -14); c.quadraticCurveTo(-34, -26, -26, -34); c.closePath(); fs('#141414');
  // body
  blob([-28, -38, -16, -45, 14, -45, 26, -38, 24, -26, -24, -26], coat);
  leg(-14, 0, false); leg(22, 0.5, false);
  // neck rising high + armoured head
  const nod = st.anim === 'walk' ? Math.sin(ph * Math.PI * 4) * 2 : st.anim === 'attack' ? -Math.sin(st.f / st.len * Math.PI) * 4 : 0;
  save(); tr(18, -40); rot(D(nod));
  poly([-8, 4, 2, -22, 10, -28, 16, -18, 10, 4], coat);
  // head
  blob([6, -28, 14, -33, 26, -26, 28, -19, 14, -17], '#3a3a3e');
  poly([7, -30, 8, -38, 12, -32], '#1e1e1e', OUT, 0.6); poly([11, -31, 14, -38, 15, -31], '#1e1e1e', OUT, 0.6);
  poly([10, -31, 27, -25, 27, -19, 12, -21], plate, OUT, 0.7);
  pline([12, -27, 25, -22], TRIM, 0.9);
  circ(14, -27, 2, TRIM, OUT, 0.5);
  // red crinet over the neck with yellow edge
  poly([-8, 4, 1, -20, 9, -27, 8, -18, 3, 4], '#c81010', OUT, 0.7);
  pline([1, -20, 9, -27], TRIM, 0.9);
  restore();
  // red caparison draped over the body, yellow border
  const drape = st.anim === 'walk' ? Math.sin(ph * Math.PI * 2) * 1.2 : 0;
  const cap = () => {
    c.beginPath();
    c.moveTo(-30, -40); c.quadraticCurveTo(-24, -48, -8, -47); c.quadraticCurveTo(10, -48, 20, -44);
    c.quadraticCurveTo(28, -40, 27, -32);
    c.lineTo(25 + drape, -15); c.quadraticCurveTo(12, -12, 0, -15 - drape);
    c.quadraticCurveTo(-14, -12, -29 - drape, -15);
    c.quadraticCurveTo(-34, -28, -30, -40); c.closePath();
  };
  cap(); fs('#d01212');
  // lower shading band + folds, drawn as plain shapes (clipping is slow on phones)
  poly([-31, -28, 27, -28, 25 + drape, -16, 0, -16, -29 - drape, -16], 'rgba(0,0,0,0.16)', null);
  pline([-12, -46, -14, -14], '#9a0c0c', 0.8); pline([8, -47, 9, -13], '#9a0c0c', 0.8);
  c.beginPath(); c.moveTo(-29 - drape, -15); c.quadraticCurveTo(-14, -12, 0, -15 - drape); c.quadraticCurveTo(12, -12, 25 + drape, -15);
  c.strokeStyle = TRIM; c.lineWidth = 1.8; c.stroke();
  cap(); fs(null);
  circ(18, -32, 3.2, TRIM, OUT, 0.6); circ(18, -32, 1.4, '#9a0c0c', null);
}

UNIT_ART[6] = {
  B: bodyDims(46),
  pose(st) {
    const p = newPose();
    p.tF = 70; p.kF = 85; p.tB = 60; p.kB = 75; p.lean = 0;
    p.sF = 70; p.eF = 20; p.sB = 30; p.eB = 60;
    if (st.anim === 'attack') {
      const k = st.f / st.len, hk = st.hit / st.len;
      applyTo(p, keys([[0, { sF: 70, lean: 0, x: 0 }], [hk * 0.7, { sF: 55, lean: -6, x: -2 }], [hk, { sF: 88, lean: 12, x: 3 }], [1, { sF: 70, lean: 0, x: 0 }]], k));
    } else if (st.anim === 'walk') p.y = -Math.abs(Math.sin(st.f / st.len * Math.PI * 2)) * 1.5;
    return p;
  },
  draw(st, p) {
    drawHorse(st);
    save(); tr(-6, -31 + p.y);
    paintHumanoid(p, this.B, this.skin);
    restore();
  },
  skin: {
    torso: '#c8c8cc', thigh: '#b8b8bc', shin: '#a8a8ae', upper: '#c0c0c4', fore: '#b0b0b4', hand: '#8a8a8e', foot: '#9a9a9e', boot: true, neck: '#b0b0b4',
    torsoDetail(B, t, wh, wc) { ell(wc * 0.2, -t * 0.7, wc * 0.55, t * 0.2, '#e8e8ec', null); pline([-wh, -t * 0.1, wh, -t * 0.1], '#8a8a8e', 0.8); },
    noFace: true,
    headDetail(r) {
      blob([-r * 1.0, r * 1.0, -r * 1.05, -r * 0.5, -r * 0.3, -r * 1.25, r * 0.7, -r * 1.1, r * 1.1, -r * 0.2, r * 1.05, r * 1.05], '#d0d0d4', OUT, LW);
      rect(r * 0.15, -r * 0.3, r * 0.95, r * 0.2, '#222', null);
      for (let i = 0; i < 3; i++) circ(r * 0.6, r * 0.2 + i * r * 0.25, r * 0.06, '#333', null);
    },
    weaponNear(R, p) {
      // lance (white with red stripes) held under the arm, pointing forward
      const A = R.aF;
      save(); tr(A.wr[0], A.wr[1]); rot(D(3 + (p.sF - 70) * 0.2));
      // white lance with red spiral stripes (no clipping: stripes follow the taper)
      const hw = (x) => lerp(2.2, 0.7, (x + 24) / 70);
      poly([-24, -2.2, 46, -0.7, 46, 0.7, -24, 2.2], '#ffffff', null);
      for (let x = -24; x < 44; x += 8) {
        const a = x, b = Math.min(46, x + 4);
        poly([a, -hw(a), b, -hw(b), b - 2, hw(b - 2), a - 2, hw(a - 2)], '#d01414', null);
      }
      poly([-24, -2.2, 46, -0.7, 46, 0.7, -24, 2.2], null, OUT, LW);
      poly([-12, -4, -8, -4, -8, 4, -12, 4], '#9a9a9a', OUT, 0.6);
      restore();
    },
  },
};

// ------------------------------------------------------------------ renaissance
const rWalk = (p, ph) => { walkLegs(p, ph, 24, 42); walkArms(p, ph, 16); return p; };
const shirtArms = { upper: '#f4f4f0', fore: '#f4f4f0' };
function blackHair(r) { blob([-r * 1.05, r * 0.4, -r * 1.1, -r * 0.7, -r * 0.2, -r * 1.3, r * 0.8, -r * 1.05, r * 0.95, -r * 0.55, r * 0.2, -r * 0.65, -r * 0.3, r * 0.2, -r * 0.6, r * 0.8], '#161616', OUT, LW * 0.8); }
function blackHairFront(r) { blob([-r * 1.08, r * 0.5, -r * 1.12, -r * 0.6, -r * 0.3, -r * 1.25, r * 0.7, -r * 1.1, r * 1.02, -r * 0.5, r * 0.55, -r * 0.62, r * 0.1, -r * 0.5, -r * 0.35, -r * 0.1, -r * 0.55, r * 0.7], '#161616', OUT, LW * 0.8); }

UNIT_ART[7] = {
  B: bodyDims(51),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') { rWalk(p, ph); p.sF = 30; p.eF = 40; }
    else if (st.anim === 'attack') {
      idleBody(p, 0.2); p.tF = 24; p.kF = 20; p.tB = -20; p.kB = 6;
      const hk = st.hit / st.len;
      if (st.v === 0) applyTo(p, keys([[0, { sF: 40, eF: 40, lean: 4 }], [hk * 0.7, { sF: 30, eF: 90, lean: -2 }], [hk, { sF: 88, eF: 0, lean: 18 }], [1, { sF: 40, eF: 40, lean: 4 }]], ph));
      else applyTo(p, keys([[0, { sF: 40, eF: 40, lean: 4 }], [hk * 0.7, { sF: 150, eF: 20, lean: -6 }], [hk, { sF: 70, eF: 10, lean: 16 }], [1, { sF: 40, eF: 40, lean: 4 }]], ph));
      p.sB = -40; p.eB = 60;
    } else { idleBody(p, ph); p.sF = 30; p.eF = 40; }
    return p;
  },
  skin: Object.assign({}, shirtArms, {
    torso: '#f4f4f0', thigh: '#3c3c8e', shin: '#8a5a32', foot: '#6a4424', boot: true, hand: SKIN,
    torsoDetail(B, t, wh, wc) {
      poly([-wh * 1.02, 2, -wc, -t * 0.55, -wc * 0.6, -t, wc * 0.1, -t * 0.98, -wh * 0.05, 2], '#7a4a2a', OUT, 0.7);
      rect(-wh, -2, wh * 2, 3, '#4a2a14', OUT, 0.6);
    },
    hairBack: blackHair,
    headDetail: blackHairFront,
    weaponNear(R) { inHand(R.aF, -70, () => wRapier(26)); },
  }),
};

function musketPose(p, B, st, ph, aimUp) {
  const R0 = solveRig(p, B);
  const k = (st.anim === 'shoot' || st.anim === 'shootwalk' || st.anim === 'attack') ? 1 : 0;
  let rec = 0;
  if (k) { const hk = st.hit / st.len; const d = ph - hk; rec = d >= 0 && d < 0.12 ? (1 - d / 0.12) : 0; }
  const cx = R0.sh[0] + (k ? 2 : 3) - rec * 2, cy = R0.sh[1] + (k ? 2 : 8);
  const ang = k ? -2 - rec * 8 : -10;
  p._gun = [cx, cy, ang, rec];
  const a = D(ang);
  gripArms(p, B, [cx + Math.cos(a) * 12, cy + Math.sin(a) * 12 + 1], [cx + Math.cos(a) * 2, cy + Math.sin(a) * 2 + 2]);
  return p;
}
function drawLongGun(x, y, ang, len, stock, metal, rec) {
  atAngle(x, y, ang, () => {
    poly([-10, -1.5, 4, -1.2, 4, 1.8, -8, 4.5, -11, 3.5], stock, OUT, 0.7);
    rect(2, -1.4, len, 2.4, stock, OUT, 0.6);
    rect(4, -2.2, len, 1.6, metal, OUT, 0.6);
    if (rec > 0.5) {
      poly([len + 5, -1.5, len + 12, -5, len + 16, -1, len + 12, 3], '#fff4a0', '#ffa020', 0.6);
    }
  });
}

UNIT_ART[8] = {
  B: bodyDims(51),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk' || st.anim === 'shootwalk') rWalk(p, ph); else idleBody(p, ph);
    return musketPose(p, this.B, st, ph);
  },
  skin: Object.assign({}, shirtArms, {
    torso: '#f4f4f0', thigh: '#3c3c8e', shin: '#8a5a32', foot: '#6a4424', boot: true,
    torsoDetail(B, t, wh, wc) {
      poly([-wh * 1.02, 2, -wc, -t * 0.55, -wc * 0.8, -t, -wc * 0.2, -t, -wh * 0.2, 2], '#7a4a2a', OUT, 0.7);
      pline([-wc * 0.6, -t * 0.95, wh * 0.9, 0], '#5a3218', 1.4);
      rect(-wh, -2, wh * 2, 3, '#4a2a14', OUT, 0.6);
    },
    hairBack: blackHair,
    headDetail(r) {
      // wide brimmed hat with a red feather
      ell(0, -r * 0.55, r * 2.0, r * 0.35, '#7a4a28', OUT, 0.8);
      blob([-r * 0.9, -r * 0.6, -r * 0.7, -r * 1.5, r * 0.6, -r * 1.55, r * 0.9, -r * 0.6], '#8a5530', OUT, 0.8);
      poly([-r * 0.5, -r * 1.3, -r * 1.2, -r * 2.4, -r * 0.1, -r * 1.5], '#e02020', OUT, 0.6);
    },
    weaponMid(R, p) { const [x, y, a, rec] = p._gun; drawLongGun(x, y, a, 24, '#5a3418', '#2a2a2a', rec); },
  }),
};

UNIT_ART[9] = {
  B: bodyDims(51),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') rWalk(p, ph); else idleBody(p, ph);
    const B = this.B;
    const R0 = solveRig(p, B);
    let rec = 0, raise = 0;
    if (st.anim === 'attack') {
      const hk = st.hit / st.len;
      raise = keys([[0, { r: 0 }], [hk * 0.6, { r: 1 }], [1, { r: 1 }]], ph).r;
      const d = ph - hk; rec = d >= 0 && d < 0.15 ? 1 - d / 0.15 : 0;
      if (ph > 0.8) raise = 1 - (ph - 0.8) / 0.2;
    }
    const cx = R0.sh[0] + 1 - rec * 3, cy = R0.sh[1] + 12 - raise * 6;
    p._hc = [cx, cy, -6 * raise - rec * 12, rec];
    gripArms(p, B, [cx + 8, cy + 1], [cx - 3, cy + 3]);
    return p;
  },
  skin: {
    torso: '#9aa0aa', thigh: '#3a3a44', shin: '#6a4a2a', foot: '#4a3018', boot: true, upper: '#f0f0ec', fore: '#f0f0ec',
    torsoDetail(B, t, wh, wc) { ell(wc * 0.2, -t * 0.65, wc * 0.6, t * 0.22, '#c8ccd4', null); rect(-wh, -3, wh * 2, 3, '#4a2a14', OUT, 0.6); },
    hairBack: blackHair,
    headDetail(r) {
      // morion helmet
      const c = G.ctx;
      c.beginPath(); c.moveTo(-r * 1.9, -r * 0.3); c.quadraticCurveTo(-r * 1.4, -r * 0.6, -r * 0.9, -r * 0.8);
      c.quadraticCurveTo(0, -r * 2.2, r * 0.9, -r * 0.8); c.quadraticCurveTo(r * 1.4, -r * 0.6, r * 1.9, -r * 0.3);
      c.quadraticCurveTo(0, -r * 0.8, -r * 1.9, -r * 0.3); c.closePath();
      fs('#a8adb6');
      poly([-r * 0.4, -r * 1.5, 0, -r * 2.1, r * 0.4, -r * 1.5], '#c8ccd4', OUT, 0.6);
    },
    weaponMid(R, p) {
      const [x, y, a, rec] = p._hc;
      atAngle(x, y, a, () => {
        rect(-8, -1.5, 8, 3, '#5a3418', OUT, 0.6);
        const c = G.ctx;
        c.beginPath(); c.moveTo(-1, -3.2); c.lineTo(17, -2.6); c.lineTo(18, -3.6); c.lineTo(19, 3.6); c.lineTo(17, 2.6); c.lineTo(-1, 3.2); c.closePath();
        fs(linGrad(0, -3, 0, 3, [[0, '#9aa0a8'], [1, '#4a4f58']]));
        if (rec > 0.3) { circ(24, 0, 5 + rec * 3, radGrad(24, 0, 0, 8, [[0, '#fff'], [0.4, '#ffd040'], [1, 'rgba(255,120,0,0)']]), null); circ(28, -3, 5, 'rgba(200,200,200,0.7)', null); }
      });
    },
  },
};

// ------------------------------------------------------------------ modern soldiers
const camo = (B, t, wh, wc) => {
  const r = rng(3);
  for (let i = 0; i < 6; i++) ell(-wc * 0.7 + r() * wc * 1.4, -t * 0.9 + r() * t * 0.8, 2 + r() * 1.5, 1.2 + r(), r() < 0.5 ? '#5a5a30' : '#a09a6a', null);
  pline([-wc * 0.5, -t * 0.95, wh * 0.4, -t * 0.1], '#3a3a20', 1.2);
  rect(-wh, -3, wh * 2, 3, '#3a3a20', OUT, 0.6);
};
const soldier = {
  torso: '#8a8458', thigh: '#8a8458', shin: '#7a7450', foot: '#3a3a28', boot: true, upper: '#8a8458', fore: SKIN, hand: '#4a4a30',
  torsoDetail: camo,
  behind(R, p, B) {
    // backpack
    save(); tr(R.hip[0], R.hip[1]); rot(D(p.lean));
    rrect(-B.wChest * 0.95, -B.torso * 0.95, B.wChest * 0.5, B.torso * 0.6, 2, '#5a6a30');
    restore();
  },
  headDetail(r) {
    // helmet + goggles
    const c = G.ctx;
    c.beginPath(); c.moveTo(-r * 1.25, r * 0.1); c.quadraticCurveTo(-r * 1.2, -r * 1.5, r * 0.2, -r * 1.4); c.quadraticCurveTo(r * 1.3, -r * 1.2, r * 1.25, -r * 0.1); c.closePath();
    fs('#5f6f36');
    ell(r * 0.2, -r * 0.9, r * 0.5, r * 0.3, '#7f8f4a', null);
    rect(-r * 0.2, -r * 0.4, r * 1.35, r * 0.45, '#2a2a2a', OUT, 0.6);
    rect(r * 0.4, -r * 0.33, r * 0.7, r * 0.3, '#9ad0e0', null);
    rect(-r * 0.3, r * 0.3, r * 1.3, r * 0.5, '#3a3a2a', OUT, 0.5);
  },
};

UNIT_ART[10] = {
  B: bodyDims(51),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') { rWalk(p, ph); p.sF = 30 - 10 * Math.sin(ph * 6.283); p.eF = 50; }
    else if (st.anim === 'attack') {
      idleBody(p, 0.2); p.tF = 22; p.kF = 18; p.tB = -18;
      const hk = st.hit / st.len;
      applyTo(p, keys([[0, { sF: 30, eF: 60, lean: 6 }], [hk * 0.7, { sF: 10, eF: 100, lean: 0 }], [hk, { sF: 92, eF: 0, lean: 18 }], [1, { sF: 30, eF: 60, lean: 6 }]], ph));
    } else { idleBody(p, ph); p.sF = 30; p.eF = 50; }
    return p;
  },
  skin: Object.assign({}, soldier, { weaponNear(R) { inHand(R.aF, -80, () => wKnife(11)); } }),
};

function drawRifle(x, y, ang, rec, big) {
  atAngle(x, y, ang, () => {
    poly([-10, -1.5, -2, -2, -2, 2.5, -9, 4], '#2a2a2a', OUT, 0.6);
    rect(-3, -2.4, 14, 4, '#333', OUT, 0.6);
    rect(10, -1.4, 10, 2, '#1e1e1e', OUT, 0.5);
    rect(2, 1.4, 3, 5, '#1e1e1e', OUT, 0.5);
    rect(-1, -4, 6, 1.8, '#222', OUT, 0.5);
    if (rec > 0.5) poly([21, -0.5, 27, -4, 31, 0, 27, 4], '#fff2a0', '#ff9a10', 0.6);
  });
}

UNIT_ART[11] = {
  B: bodyDims(51),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk' || st.anim === 'shootwalk') rWalk(p, ph); else idleBody(p, ph);
    const B = this.B;
    const R0 = solveRig(p, B);
    const k = st.anim === 'shoot' || st.anim === 'shootwalk' || st.anim === 'attack' ? 1 : 0;
    let rec = 0;
    if (k) { const hk = st.hit / st.len; const d = ph - hk; rec = d >= 0 && d < 0.2 ? 1 - d / 0.2 : 0; }
    const cx = R0.sh[0] + 3 - rec * 1.5, cy = R0.sh[1] + (k ? 3 : 8);
    const ang = k ? -1 - rec * 4 : -18;
    p._gun = [cx, cy, ang, rec];
    const a = D(ang);
    gripArms(p, B, [cx + Math.cos(a) * 9, cy + Math.sin(a) * 9 + 1.5], [cx + Math.cos(a) * 1, cy + 2]);
    return p;
  },
  skin: Object.assign({}, soldier, { fore: '#8a8458', weaponMid(R, p) { const [x, y, a, rec] = p._gun; drawRifle(x, y, a, rec); } }),
};

// ------------------------------------------------------------------ tank (12)
function drawTank(st) {
  const c = G.ctx;
  let rec = 0;
  if (st.anim === 'attack') { const d = st.f / st.len - st.hit / st.len; rec = d >= 0 && d < 0.12 ? 1 - d / 0.12 : 0; }
  const wob = st.anim === 'walk' ? Math.sin(st.f / st.len * Math.PI * 2) * 0.4 : 0;
  // tracks
  rrect(-80, -20, 158, 20, 9, '#3a3a34');
  const tr0 = st.anim === 'walk' ? (st.f / st.len) : 0;
  c.save(); rrectPath(-80, -20, 158, 20, 9); c.clip();
  for (let x = -84 + tr0 * 8; x < 82; x += 8) pline([x, -20, x + 2, -17], '#1a1a18', 0.8);
  c.restore();
  for (let i = 0; i < 6; i++) {
    const wx = -58 + i * 23;
    circ(wx, -9, 7.5, '#5a5a4a'); circ(wx, -9, 4, '#8a8a70'); circ(wx, -9, 1.5, '#333', null);
  }
  circ(-72, -12, 5, '#5a5a4a'); circ(70, -12, 5, '#5a5a4a');
  // hull
  save(); tr(0, wob);
  c.beginPath(); c.moveTo(-84, -24); c.lineTo(-76, -34); c.lineTo(70, -34); c.lineTo(84, -24); c.lineTo(76, -18); c.lineTo(-78, -18); c.closePath();
  fs('#6f7a3c');
  // camo blotches
  c.save(); c.clip();
  const r = rng(12);
  for (let i = 0; i < 9; i++) ell(-70 + r() * 150, -30 + r() * 12, 8 + r() * 10, 3 + r() * 3, r() < 0.5 ? '#a89a5c' : '#4a5226', null);
  c.restore();
  c.beginPath(); c.moveTo(-84, -24); c.lineTo(-76, -34); c.lineTo(70, -34); c.lineTo(84, -24); c.lineTo(76, -18); c.lineTo(-78, -18); c.closePath(); fs(null);
  // turret
  save(); tr(-6, -34);
  // barrel
  rect(28 - rec * 5, -12, 70, 4.5, '#6f7a3c');
  rect(92 - rec * 5, -13, 8, 6.5, '#5a6430');
  c.beginPath(); c.moveTo(-34, 0); c.lineTo(-30, -14); c.quadraticCurveTo(0, -24, 30, -14); c.lineTo(36, 0); c.closePath();
  fs('#77823f');
  c.save(); c.clip();
  for (let i = 0; i < 5; i++) ell(-26 + r() * 50, -12 + r() * 10, 7 + r() * 6, 3 + r() * 2, r() < 0.5 ? '#a89a5c' : '#4a5226', null);
  c.restore();
  c.beginPath(); c.moveTo(-34, 0); c.lineTo(-30, -14); c.quadraticCurveTo(0, -24, 30, -14); c.lineTo(36, 0); c.closePath(); fs(null);
  blob([-8, -18, -2, -24, 8, -24, 12, -18], '#8a9a9a', OUT, 0.7);
  if (rec > 0.4) {
    circ(108, -10, 9, radGrad(108, -10, 0, 12, [[0, '#fff'], [0.4, '#ffd040'], [1, 'rgba(255,120,0,0)']]), null);
    circ(114, -14, 6, 'rgba(180,180,180,0.7)', null);
  }
  restore();
  restore();
}

UNIT_ART[12] = { pose() { return null; }, draw(st) { drawTank(st); } };

// ------------------------------------------------------------------ future armour
const ROBO = '#35373d', ROBO_L = '#62656e', ROBO_D = '#202125', RED = '#ff2626';
function roboSkin(base, light, accent, visor) {
  return {
    torso: base, thigh: base, shin: light, upper: base, fore: light, hand: ROBO_D, foot: base, boot: true, neck: ROBO_D,
    torsoDetail(B, t, wh, wc) {
      poly([-wc * 1.15, -t * 1.02, wc * 1.2, -t * 1.0, wc * 1.05, -t * 0.55, wc * 0.4, -t * 0.4, -wc * 0.7, -t * 0.42], base, OUT, 0.8);
      poly([-wc * 0.9, -t * 0.95, wc * 0.9, -t * 0.95, wc * 0.6, -t * 0.45, -wc * 0.5, -t * 0.4], light, OUT, 0.7);
      poly([-wh * 0.4, -t * 0.35, wh * 0.6, -t * 0.35, wh * 0.4, -t * 0.05, -wh * 0.3, -t * 0.05], light, OUT, 0.6);
      rect(wc * 0.1, -t * 0.8, wc * 0.5, t * 0.12, accent, null);
      rect(-wh * 0.2, -t * 0.25, wh * 0.4, t * 0.08, accent, null);
    },
    knee(L, B, f) {
      const [kx, ky] = L.knee;
      poly([kx - 4, ky - 4, kx + 5, ky - 3, kx + 4, ky + 5, kx - 3, ky + 4], shade(light, f), OUT, 0.6);
      poly([kx + 2, ky - 3, kx + 8, ky - 1, kx + 4, ky + 3], shade(base, f), OUT, 0.5);
      ell(kx + 1, ky + 7, 1.2, 2.4, accent, null);
    },
    shoulderPad(sh, A, B) {
      save(); tr(sh[0], sh[1] + 2.5); rot(-D(A.a) * 0.25); scl(0.78);
      poly([-9, 3, -8, -6, -1, -10, 9, -7, 11, 1, 6, 7, -5, 7], base, OUT, 0.9);
      poly([-6, -4, 0, -8, 8, -5, 7, -1, -4, -1], light, OUT, 0.6);
      poly([2, -9, 5, -15, 7, -8], light, OUT, 0.6);
      rect(-3, 2, 7, 1.6, accent, null);
      restore();
    },
    noFace: true,
    headDetail(r) {
      blob([-r * 1.05, r * 1.0, -r * 1.15, -r * 0.4, -r * 0.4, -r * 1.3, r * 0.8, -r * 1.1, r * 1.25, -r * 0.1, r * 1.1, r * 1.1], base, OUT, LW);
      poly([r * 0.1, -r * 0.35, r * 1.25, -r * 0.25, r * 1.2, r * 0.1, r * 0.1, r * 0.05], ROBO_D, null);
      poly([r * 0.35, -r * 0.3, r * 1.2, -r * 0.2, r * 1.15, r * 0.02, r * 0.35, -r * 0.02], visor, null);
      poly([-r * 0.4, -r * 1.25, -r * 0.1, -r * 2.0, r * 0.2, -r * 1.2], light, OUT, 0.6);
      poly([-r * 1.0, -r * 0.2, -r * 1.7, -r * 1.0, -r * 0.8, -r * 0.8], light, OUT, 0.6);
    },
  };
}

UNIT_ART[13] = {
  B: bodyDims(66, { headR: 5.4, wChest: 66 * 0.3, wHip: 66 * 0.22, wThigh: 66 * 0.12, wShin: 66 * 0.1, wUpper: 66 * 0.1, wFore: 66 * 0.09 }),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk') { walkLegs(p, ph, 22, 40); walkArms(p, ph, 10); p.sF = 30 + 4 * Math.sin(ph * 6.283); p.eF = 140; }
    else if (st.anim === 'attack') {
      idleBody(p, 0.2); p.tF = 20; p.kF = 16; p.tB = -18;
      const hk = st.hit / st.len;
      applyTo(p, keys([[0, { sF: 30, eF: 140, lean: 4 }], [hk * 0.7, { sF: 175, eF: 20, lean: -8 }], [hk, { sF: 70, eF: -10, lean: 16 }], [1, { sF: 30, eF: 140, lean: 4 }]], ph));
    } else { idleBody(p, ph); p.sF = 30; p.eF = 140; }
    p.sB = p.sF - 15; p.eB = p.eF + 10;
    return p;
  },
  skin: Object.assign(roboSkin(ROBO, ROBO_L, RED, RED), {
    weaponNear(R) {
      inHand(R.aF, 50, () => {
        rect(-1.5, -6, 3, 8, '#222', OUT, 0.6);
        rect(-5, 1, 10, 2.5, '#555', OUT, 0.6);
        poly([-4.5, 3.5, -7, 40, 0, 50, 7, 42, 4.5, 3.5], '#c8ccd2', OUT, 0.9);
        pline([-1.2, 6, -2, 42], '#e04040', 1.2); pline([0.8, 6, 1.2, 42], '#40c040', 0.8);
        pline([4, 6, 5.4, 40], '#ffffff', 0.8);
      });
    },
  }),
};

function blasterPose(st, B, p) {
  const ph = st.f / st.len;
  const R0 = solveRig(p, B);
  const k = st.anim === 'shoot' || st.anim === 'shootwalk' ? 1 : 0;
  let rec = 0;
  if (k) { const hk = st.hit / st.len; const d = ph - hk; rec = d >= 0 && d < 0.25 ? 1 - d / 0.25 : 0; }
  if (st.anim === 'attack') {
    // gun butt strike
    const hk = st.hit / st.len;
    const s = keys([[0, { s: 0 }], [hk * 0.7, { s: -1 }], [hk, { s: 1 }], [1, { s: 0 }]], ph).s;
    const cx = R0.sh[0] + 4 + s * 6, cy = R0.sh[1] + 6 - s * 2;
    p._gun = [cx, cy, -20 + s * 20, 0];
  } else {
    const cx = R0.sh[0] + 4 - rec * 2, cy = R0.sh[1] + (k ? 4 : 9);
    p._gun = [cx, cy, k ? -rec * 5 : -15, rec];
  }
  const [cx, cy, ang] = p._gun;
  const a = D(ang);
  gripArms(p, B, [cx + Math.cos(a) * 11, cy + Math.sin(a) * 11 + 2], [cx + Math.cos(a) * 1, cy + 3]);
  return p;
}
function drawBlasterGun(x, y, ang, rec, glow) {
  atAngle(x, y, ang, () => {
    poly([-8, -3, 18, -3, 22, -1, 22, 2, 6, 3, 2, 7, -2, 7, -2, 3, -8, 2], '#2a2b30', OUT, 0.7);
    rect(-4, -5, 14, 2.4, '#4a4c54', OUT, 0.5);
    rect(14, -1.5, 6, 1.5, glow, null);
    if (rec > 0.4) circ(24, 0, 5, radGrad(24, 0, 0, 7, [[0, '#fff'], [0.4, glow], [1, 'rgba(255,0,0,0)']]), null);
  });
}

UNIT_ART[14] = {
  B: bodyDims(64, { headR: 5.4, wChest: 64 * 0.29, wHip: 64 * 0.21, wThigh: 64 * 0.115, wShin: 64 * 0.095, wUpper: 64 * 0.095, wFore: 64 * 0.085 }),
  pose(st) {
    const p = newPose();
    const ph = st.f / st.len;
    if (st.anim === 'walk' || st.anim === 'shootwalk') walkLegs(p, ph, 22, 40); else idleBody(p, ph);
    return blasterPose(st, this.B, p);
  },
  skin: Object.assign(roboSkin(ROBO, ROBO_L, RED, RED), { weaponMid(R, p) { const [x, y, a, rec] = p._gun; drawBlasterGun(x, y, a, rec, '#ff3030'); } }),
};

// 15 war machine (black hover tank)
function drawWarMachine(st) {
  const c = G.ctx;
  let rec = 0;
  if (st.anim === 'attack') { const d = st.f / st.len - st.hit / st.len; rec = d >= 0 && d < 0.1 ? 1 - d / 0.1 : 0; }
  const hover = Math.sin((st.t || 0) * 0.15) * 1.5;
  ell(0, -3, 52, 4, radGrad(0, -3, 0, 52, [[0, 'rgba(90,255,200,0.75)'], [1, 'rgba(90,255,200,0)']]), null);
  save(); tr(0, -9 + hover);
  const dark = linGrad(0, -40, 0, 4, [[0, '#55575e'], [0.35, '#2a2b31'], [1, '#0e0f12']]);
  // rear fin
  poly([-50, -12, -62, -34, -44, -26, -36, -14], '#1c1d22');
  // main hull: sloped nose, angular plates
  poly([-58, -8, -52, -24, -30, -34, 18, -36, 44, -28, 60, -12, 52, 2, -46, 2], dark);
  poly([-40, -26, -24, -32, 14, -33, 30, -28, 10, -24, -30, -22], '#4a4c54', OUT, 0.7);
  poly([20, -26, 42, -26, 56, -12, 34, -12], '#3a3c44', OUT, 0.7);
  // armoured skirt with emitters
  poly([-50, -4, -40, -14, 46, -14, 54, -4, 44, 3, -44, 3], '#1a1b20', OUT, 0.8);
  for (let i = 0; i < 5; i++) { const x = -34 + i * 18; ell(x, -2, 5, 2, '#26282e', OUT, 0.6); ell(x, -0.5, 3.5, 1, 'rgba(120,255,210,0.8)', null); }
  pline([-44, -9, 48, -9], '#5a5c64', 0.8);
  // turret + long barrel
  save(); tr(4, -36);
  rect(10 - rec * 6, -8, 50, 4.5, '#2a2b30');
  rect(14 - rec * 6, -3, 44, 3, '#202126');
  rect(54 - rec * 6, -10, 9, 10, '#18191d');
  poly([-24, 2, -20, -10, -6, -14, 14, -12, 22, -4, 18, 3], '#34363c');
  poly([-16, -8, -4, -11, 10, -10, 6, -6, -12, -5], '#5a5c64', OUT, 0.6);
  circ(14, -4, 1.6, RED, null);
  if (rec > 0.3) circ(68, -5, 10, radGrad(68, -5, 0, 12, [[0, '#fff'], [0.4, '#9fe8ff'], [1, 'rgba(60,160,255,0)']]), null);
  restore();
  circ(48, -18, 2, RED, null); circ(53, -15, 1.4, RED, null);
  restore();
}
UNIT_ART[15] = { pose() { return null; }, draw(st) { drawWarMachine(st); } };

// 16 super soldier: bright silver armour with cyan energy lights
UNIT_ART[16] = {
  B: bodyDims(66, { headR: 5.4, wChest: 66 * 0.31, wHip: 66 * 0.22, wThigh: 66 * 0.12, wShin: 66 * 0.1, wUpper: 66 * 0.1, wFore: 66 * 0.09 }),
  pose(st) { return UNIT_ART[14].pose.call(this, st); },
  skin: Object.assign(roboSkin('#d6d9de', '#f4f6f8', '#28d6ff', '#28d6ff'), { weaponMid(R, p) { const [x, y, a, rec] = p._gun; drawBlasterGun(x, y, a, rec, '#28d6ff'); } }),
};

// ------------------------------------------------------------------ public draw function
// st: {anim, f, len, hit, v, t, deadT}. Draws at the origin facing right.
function drawUnit(id, st) {
  const U = UNIT_ART[id];
  let p = U.pose ? U.pose.call(U, st) : null;
  if (st.anim === 'die') {
    // fall on the back, then lie still
    const k = clamp(st.f / Math.max(1, st.len), 0, 1);
    const e = smooth(k);
    save();
    if (id === 12 || id === 15) {
      // vehicles sink a little and smoke; drawn darker
      tr(0, e * 3);
      G.ctx.filter = `brightness(${1 - 0.6 * e})`;
      U.draw(Object.assign({}, st, { anim: 'idle', f: 0 }), p);
      G.ctx.filter = 'none';
      restore();
      return;
    }
    const big = id === 3 || id === 6;
    if (big) {
      rot(-D(e * 12)); tr(0, e * 4);
      U.draw(Object.assign({}, st, { anim: 'idle', f: 0 }), p || newPose());
      restore();
      return;
    }
    if (p) {
      p.sF = lerp(p.sF, 150, e); p.eF = lerp(p.eF, 20, e);
      p.sB = lerp(p.sB, 170, e); p.eB = lerp(p.eB, 10, e);
      p.tF = lerp(p.tF, 30, e); p.kF = lerp(p.kF, 50, e);
      p.tB = lerp(p.tB, 10, e); p.kB = lerp(p.kB, 20, e);
    }
    const H = U.B ? U.B.H : 40;
    tr(-H * 0.05 * e, 0);
    rot(-D(e * 84));
    tr(0, -e * H * 0.12);
    paintHumanoid(p, U.B, U.skin);
    restore();
    return;
  }
  if (U.draw) U.draw(st, p);
  else paintHumanoid(p, U.B, U.skin);
}

// Soft elliptical ground shadow like the original
function drawShadow(w) {
  ell(0, 0, w * 0.55, 3.2, 'rgba(40,30,10,0.35)', null);
}
