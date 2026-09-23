'use strict';
// Skeleton + animation helpers for the humanoid units. Units are drawn facing right with the
// origin between the feet on the ground. Limb angles are in degrees measured from "straight down",
// positive values swing the limb forward (towards +x).

function dirv(a) { const r = D(a); return [Math.sin(r), Math.cos(r)]; }

// two bone IK: returns [upperAngle, bend] so that a chain from (sx,sy) reaches (tx,ty).
// flip chooses on which side the elbow/knee points.
function ik2(sx, sy, tx, ty, l1, l2, flip) {
  const dx = tx - sx, dy = ty - sy;
  let d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.01);
  const base = Math.atan2(dx, dy) * 180 / Math.PI;          // angle of target from "down"
  const a1 = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)) * 180 / Math.PI;
  const a2 = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1)) * 180 / Math.PI;
  const upper = flip ? base - a1 : base + a1;
  const bend = flip ? 180 - a2 : -(180 - a2);
  return [upper, bend];
}

function newPose() {
  return { x: 0, y: 0, lean: 0, head: 0, tF: 0, kF: 0, tB: 0, kB: 0, sF: 0, eF: 0, sB: 0, eB: 0, w: 0, fall: 0, grip: null, lift: 0 };
}

function lerpPose(a, b, t) {
  const o = newPose();
  for (const k in o) if (typeof a[k] === 'number') o[k] = lerp(a[k], b[k] !== undefined ? b[k] : a[k], t);
  o.grip = t < 0.5 ? a.grip : b.grip;
  return o;
}

// keyframes: [[time0..1, poseDeltaObject], ...]; returns interpolated pose object (plain numbers)
function keys(list, t) {
  if (t <= list[0][0]) return list[0][1];
  for (let i = 0; i < list.length - 1; i++) {
    const [t0, p0] = list[i], [t1, p1] = list[i + 1];
    if (t <= t1) {
      const u = smooth((t - t0) / (t1 - t0 || 1));
      const o = {};
      for (const k in p0) o[k] = lerp(p0[k], p1[k] !== undefined ? p1[k] : p0[k], u);
      for (const k in p1) if (!(k in o)) o[k] = p1[k];
      return o;
    }
  }
  return list[list.length - 1][1];
}

function applyTo(p, o) { for (const k in o) p[k] = o[k]; return p; }

// walking legs + arm swing. ph: 0..1
function walkLegs(p, ph, amp = 26, knee = 44) {
  const a = Math.PI * 2 * ph;
  p.tF = amp * Math.sin(a);
  p.tB = -amp * Math.sin(a);
  p.kF = knee * Math.pow(Math.max(0, Math.cos(a)), 1.4) + 4;
  p.kB = knee * Math.pow(Math.max(0, -Math.cos(a)), 1.4) + 4;
  p.lean = 4;
  return p;
}
function walkArms(p, ph, amp = 22) {
  const a = Math.PI * 2 * ph;
  p.sF = -amp * Math.sin(a) + 4; p.eF = 22 + 6 * Math.cos(a);
  p.sB = amp * Math.sin(a) + 4; p.eB = 22 - 6 * Math.cos(a);
  return p;
}
function idleBody(p, ph) {
  const a = Math.PI * 2 * ph;
  p.tF = 6; p.kF = 8; p.tB = -6; p.kB = 6;
  p.lean = 1.5 + Math.sin(a) * 1.2;
  p.sF = 8 + Math.sin(a) * 3; p.eF = 18;
  p.sB = -4 - Math.sin(a) * 3; p.eB = 18;
  return p;
}

// Solve the rig: returns joint positions for the given pose and body dimensions.
function solveRig(p, B) {
  const legH = (a, k) => B.thigh * Math.cos(D(a)) + B.shin * Math.cos(D(a - k));
  const hipY = -Math.max(legH(p.tF, p.kF), legH(p.tB, p.kB)) - B.foot + p.y - p.lift;
  const hip = [p.x, hipY];
  const td = [Math.sin(D(p.lean)), -Math.cos(D(p.lean))];
  const neck = [hip[0] + td[0] * B.torso, hip[1] + td[1] * B.torso];
  const sh = [hip[0] + td[0] * (B.torso - B.shoulderDrop) + B.shoulderX, hip[1] + td[1] * (B.torso - B.shoulderDrop)];
  const hd = dirv(180 - p.lean - p.head);
  const head = [neck[0] + hd[0] * (B.neck + B.headR * 0.9), neck[1] + hd[1] * (B.neck + B.headR * 0.9)];
  const leg = (a, k) => {
    const d1 = dirv(a), knee = [hip[0] + d1[0] * B.thigh, hip[1] + d1[1] * B.thigh];
    const d2 = dirv(a - k), ank = [knee[0] + d2[0] * B.shin, knee[1] + d2[1] * B.shin];
    return { a, b: a - k, knee, ank };
  };
  const arm = (s, e) => {
    const d1 = dirv(s), el = [sh[0] + d1[0] * B.upper, sh[1] + d1[1] * B.upper];
    const d2 = dirv(s + e), wr = [el[0] + d2[0] * B.fore, el[1] + d2[1] * B.fore];
    return { a: s, b: s + e, el, wr };
  };
  return { hip, neck, sh, head, lF: leg(p.tF, p.kF), lB: leg(p.tB, p.kB), aF: arm(p.sF, p.eF), aB: arm(p.sB, p.eB) };
}

// Solve arms so hands reach grip points (world-of-unit coordinates) for two handed weapons.
function gripArms(p, B, gF, gB) {
  const R = solveRig(p, B);
  if (gF) { const [u, e] = ik2(R.sh[0], R.sh[1], gF[0], gF[1], B.upper, B.fore, true); p.sF = u; p.eF = e; }
  if (gB) { const [u, e] = ik2(R.sh[0], R.sh[1], gB[0], gB[1], B.upper, B.fore, true); p.sB = u; p.eB = e; }
}

// Body dimensions for a given height
function bodyDims(H, o = {}) {
  return Object.assign({
    H, thigh: H * 0.235, shin: H * 0.225, foot: H * 0.035, torso: H * 0.3, neck: H * 0.02,
    headR: H * 0.095, upper: H * 0.17, fore: H * 0.16, shoulderDrop: H * 0.035, shoulderX: 0,
    wThigh: H * 0.095, wShin: H * 0.075, wUpper: H * 0.075, wFore: H * 0.062,
    wHip: H * 0.19, wChest: H * 0.22,
  }, o);
}

// draw a limb segment from point with absolute angle
function seg(pt, ang, len, w0, w1, fill, lw) {
  save(); tr(pt[0], pt[1]); rot(-D(ang));
  limb(len, w0, w1, fill, OUT, lw || LW * 0.9);
  restore();
}
