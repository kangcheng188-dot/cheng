'use strict';
// Small vector drawing toolkit used by all the art. Everything is drawn with flat fills and a
// thin dark outline, like the original Flash cartoon style.

const OUT = '#1a1206';          // outline colour
let LW = 0.9;                   // default outline width (logical px)

const G = {
  ctx: null,
  set(ctx) { this.ctx = ctx; },
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function D(deg) { return deg * Math.PI / 180; }

// fill + outline the current path
function fs(fill, stroke = OUT, lw = LW) {
  const c = G.ctx;
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}

function poly(pts, fill, stroke = OUT, lw = LW) {
  const c = G.ctx;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  fs(fill, stroke, lw);
}

// open polyline
function pline(pts, stroke = OUT, lw = LW) {
  const c = G.ctx;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.strokeStyle = stroke; c.lineWidth = lw; c.stroke();
}

// smooth closed curve through points (Catmull-Rom converted to cubic Beziers)
function blobPath(pts, tension = 1) {
  const c = G.ctx, n = pts.length / 2;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const i0 = ((i - 1 + n) % n) * 2, i1 = i * 2, i2 = ((i + 1) % n) * 2, i3 = ((i + 2) % n) * 2;
    const x1 = pts[i1], y1 = pts[i1 + 1], x2 = pts[i2], y2 = pts[i2 + 1];
    const c1x = x1 + (x2 - pts[i0]) / 6 * tension, c1y = y1 + (y2 - pts[i0 + 1]) / 6 * tension;
    const c2x = x2 - (pts[i3] - x1) / 6 * tension, c2y = y2 - (pts[i3 + 1] - y1) / 6 * tension;
    if (i === 0) c.moveTo(x1, y1);
    c.bezierCurveTo(c1x, c1y, c2x, c2y, x2, y2);
  }
  c.closePath();
}
function blob(pts, fill, stroke = OUT, lw = LW, tension = 1) { blobPath(pts, tension); fs(fill, stroke, lw); }

// smooth open curve
function curve(pts, stroke = OUT, lw = LW) {
  const c = G.ctx, n = pts.length / 2;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 0; i < n - 1; i++) {
    const i0 = Math.max(i - 1, 0) * 2, i1 = i * 2, i2 = (i + 1) * 2, i3 = Math.min(i + 2, n - 1) * 2;
    const c1x = pts[i1] + (pts[i2] - pts[i0]) / 6, c1y = pts[i1 + 1] + (pts[i2 + 1] - pts[i0 + 1]) / 6;
    const c2x = pts[i2] - (pts[i3] - pts[i1]) / 6, c2y = pts[i2 + 1] - (pts[i3 + 1] - pts[i1 + 1]) / 6;
    c.bezierCurveTo(c1x, c1y, c2x, c2y, pts[i2], pts[i2 + 1]);
  }
  c.strokeStyle = stroke; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
}

function ell(x, y, rx, ry, fill, stroke = OUT, lw = LW, rot = 0) {
  const c = G.ctx;
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  fs(fill, stroke, lw);
}
function circ(x, y, r, fill, stroke = OUT, lw = LW) { ell(x, y, r, r, fill, stroke, lw); }

function rrectPath(x, y, w, h, r) {
  const c = G.ctx;
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function rrect(x, y, w, h, r, fill, stroke = OUT, lw = LW) { rrectPath(x, y, w, h, r); fs(fill, stroke, lw); }
function rect(x, y, w, h, fill, stroke = OUT, lw = LW) { G.ctx.beginPath(); G.ctx.rect(x, y, w, h); fs(fill, stroke, lw); }

// tapered limb from (0,0) pointing down to (0,len); w0 width at top, w1 at bottom, rounded ends
function limbPath(len, w0, w1) {
  const c = G.ctx, a = w0 / 2, b = w1 / 2;
  c.beginPath();
  c.moveTo(-a, 0);
  c.lineTo(-b, len);
  c.arc(0, len, b, Math.PI, 0, true);
  c.lineTo(a, 0);
  c.arc(0, 0, a, 0, Math.PI, true);
  c.closePath();
}
function limb(len, w0, w1, fill, stroke = OUT, lw = LW) { limbPath(len, w0, w1); fs(fill, stroke, lw); }

function linGrad(x0, y0, x1, y1, stops) {
  const g = G.ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}
function radGrad(x, y, r0, r1, stops) {
  const g = G.ctx.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

function save() { G.ctx.save(); }
function restore() { G.ctx.restore(); }
function tr(x, y) { G.ctx.translate(x, y); }
function rot(a) { G.ctx.rotate(a); }
function scl(x, y) { G.ctx.scale(x, y === undefined ? x : y); }

// text with the chunky outline/shadow the original HUD uses
function text(str, x, y, opt = {}) {
  const c = G.ctx;
  c.font = opt.font || '12px Arial, Helvetica, sans-serif';
  c.textAlign = opt.align || 'left';
  c.textBaseline = opt.base || 'top';
  if (opt.shadow) {
    c.fillStyle = opt.shadow;
    const d = opt.sd || 1;
    c.fillText(str, x + d, y + d);
  }
  if (opt.stroke) {
    c.lineJoin = 'round';
    c.strokeStyle = opt.stroke; c.lineWidth = opt.sw || 2;
    c.strokeText(str, x, y);
  }
  c.fillStyle = opt.color || '#fff';
  c.fillText(str, x, y);
}

// Draw an image that was rendered at the current stage-to-device scale so it lands on whole device
// pixels. That is a plain copy without resampling, about ten times faster on software canvases.
function blitAt(img, x, y, w, h) {
  const c = G.ctx;
  const m = c.getTransform ? c.getTransform() : null;
  if (m && m.b === 0 && m.c === 0 && Math.abs(Math.abs(m.a) * w - img.width) < 1.01 && Math.abs(m.d * h - img.height) < 1.01) {
    const dx = Math.round(m.a * x + m.e), dy = Math.round(m.d * y + m.f);
    c.save();
    if (m.a < 0) { c.setTransform(-1, 0, 0, 1, 0, 0); c.drawImage(img, -dx, dy); }
    else { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(img, dx, dy); }
    c.restore();
  } else c.drawImage(img, x, y, w, h);
}

// Offscreen canvas helper
function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w));
  cv.height = Math.max(1, Math.ceil(h));
  return cv;
}

// Draw into an offscreen canvas at a given pixel scale. fn receives the context already scaled.
function renderTo(w, h, s, fn) {
  const cv = makeCanvas(w * s, h * s);
  const cx = cv.getContext('2d');
  const prev = G.ctx;
  G.set(cx);
  cx.scale(s, s);
  cx.lineJoin = 'round'; cx.lineCap = 'round';
  fn(cx);
  G.set(prev);
  return cv;
}
