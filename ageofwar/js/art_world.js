'use strict';
// Battlefield scenery, the five bases with their tower extensions, turrets and projectiles.

// ------------------------------------------------------------------ palette
const PAL = {
  sky0: '#3fb2fd', sky1: '#4bc1ff',
  ground: '#997e45', groundDark: '#7d6536', groundLight: '#a88c52',
  grass: '#3f8a2c', grassDark: '#2c6b1f', grassLight: '#5aa83a',
  bush: '#237a2a', bushDark: '#1b5f22', bushLight: '#2f9133',
  far: '#2f8c5a', farLight: '#3aa56b',
  canopy: '#01b901', canopyLight: '#22d31c', canopyDark: '#0c8f0c',
  canopy2: '#0e7a24', canopy3: '#0f9a2e',
  trunk: '#8a7b42', trunkDark: '#6b5e30',
  pine: '#1f5a20', pine2: '#2c8a38', pine3: '#2f9a5e',
  stone: '#6d6c60',
};

// ------------------------------------------------------------------ trees & bushes
// cloud-like outline made of bumps around an ellipse (the original's hand drawn canopies)
function scallopPath(x, y, w, h, n, seed, flatBottom) {
  const r = rng(seed);
  const c = G.ctx;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
    let ry = h / 2;
    let py = y + Math.sin(a) * ry * (0.9 + r() * 0.12);
    if (flatBottom && Math.sin(a) > 0.35) py = y + ry * (0.72 + r() * 0.12);
    pts.push([x + Math.cos(a) * w / 2 * (0.9 + r() * 0.12), py]);
  }
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const dx = mx - x, dy = (my - y) * (w / h);
    const d = Math.hypot(dx, dy) || 1;
    const bulge = Math.hypot(q[0] - p[0], q[1] - p[1]) * (0.35 + r() * 0.2);
    c.quadraticCurveTo(mx + dx / d * bulge, my + dy / d * bulge * (h / w), q[0], q[1]);
  }
  c.closePath();
}
function drawCanopy(x, y, w, h, fill, dark, seed) {
  scallopPath(x, y, w, h, Math.max(7, Math.round(w / 9)), seed, true);
  fs(fill);
  const r = rng(seed * 3 + 1);
  const c = G.ctx;
  c.save(); scallopPath(x, y, w, h, Math.max(7, Math.round(w / 9)), seed, true); c.clip();
  // little inner bump strokes
  for (let i = 0; i < Math.round(w / 22) + 1; i++) {
    const bx = x + (r() - 0.5) * w * 0.7, by = y + (r() - 0.35) * h * 0.55;
    c.beginPath();
    c.arc(bx, by, w * (0.07 + r() * 0.06), Math.PI * 0.15, Math.PI * 0.95);
    c.strokeStyle = dark; c.lineWidth = 0.8; c.stroke();
  }
  c.restore();
}

function drawTrunk(x, yBase, h, w, lean, branches) {
  const c = G.ctx;
  const top = yBase - h;
  for (const b of branches || []) {
    const [bx, by, ex, ey, bw] = b;
    c.beginPath();
    c.moveTo(bx - bw, by + bw);
    c.quadraticCurveTo((bx + ex) / 2 - bw * 0.5, (by + ey) / 2 + bw, ex, ey);
    c.lineTo(ex + bw * 0.6, ey + bw * 0.4);
    c.quadraticCurveTo((bx + ex) / 2 + bw, (by + ey) / 2 + bw * 2, bx + bw, by + bw * 3);
    c.closePath();
    fs(PAL.trunk);
  }
  c.beginPath();
  c.moveTo(x - w * 1.3, yBase + 1);
  c.quadraticCurveTo(x - w * 0.6, yBase - 4, x - w * 0.55, yBase - h * 0.25);
  c.bezierCurveTo(x - w * 0.5, yBase - h * 0.6, x - w * 0.45 + lean * 0.6, top + h * 0.2, x - w * 0.5 + lean, top);
  c.lineTo(x + w * 0.5 + lean, top);
  c.bezierCurveTo(x + w * 0.45 + lean * 0.6, top + h * 0.25, x + w * 0.5, yBase - h * 0.5, x + w * 0.6, yBase - h * 0.2);
  c.quadraticCurveTo(x + w * 0.7, yBase - 4, x + w * 1.4, yBase + 1);
  c.closePath();
  fs(PAL.trunk);
  // bark lines
  c.beginPath();
  c.moveTo(x - w * 0.05, yBase - 3); c.quadraticCurveTo(x - w * 0.2, yBase - h * 0.5, x + lean * 0.8, top + 8);
  c.moveTo(x + w * 0.3, yBase - h * 0.35); c.lineTo(x + w * 0.2, yBase - h * 0.55);
  c.strokeStyle = OUT; c.lineWidth = 0.6; c.stroke();
}

function drawBigTree(x, yBase, s, seed, colors) {
  const col = colors || [PAL.canopy, PAL.canopyDark];
  drawTrunk(x, yBase, 80 * s, 9 * s, 3 * s, [
    [x + 2 * s, yBase - 48 * s, x + 20 * s, yBase - 75 * s, 2.2 * s],
    [x - 3 * s, yBase - 40 * s, x - 22 * s, yBase - 55 * s, 2 * s]]);
  drawCanopy(x - 26 * s, yBase - 58 * s, 26 * s, 12 * s, col[0], col[1], seed + 3);
  drawCanopy(x + 2 * s, yBase - 106 * s, 100 * s, 58 * s, col[0], col[1], seed);
}

function drawPine(x, yBase, h, w, fill, dark) {
  const c = G.ctx;
  const tiers = 4;
  c.beginPath();
  c.moveTo(x, yBase - h);
  for (let i = 0; i < tiers; i++) {
    const ty = yBase - h + (h * 0.95) * ((i + 1) / tiers);
    const tw = w * (0.3 + 0.7 * (i + 1) / tiers) / 2;
    c.lineTo(x + tw, ty);
    if (i < tiers - 1) c.lineTo(x + tw * 0.4, ty - h * 0.06);
  }
  for (let i = tiers - 1; i >= 0; i--) {
    const ty = yBase - h + (h * 0.95) * ((i + 1) / tiers);
    const tw = w * (0.3 + 0.7 * (i + 1) / tiers) / 2;
    if (i < tiers - 1) c.lineTo(x - tw * 0.4, ty - h * 0.06);
    c.lineTo(x - tw, ty);
  }
  c.closePath();
  fs(fill);
  c.beginPath();
  c.moveTo(x + w * 0.02, yBase - h * 0.8); c.lineTo(x + w * 0.08, yBase - h * 0.55);
  c.moveTo(x - w * 0.1, yBase - h * 0.5); c.lineTo(x - w * 0.04, yBase - h * 0.3);
  c.moveTo(x + w * 0.14, yBase - h * 0.35); c.lineTo(x + w * 0.2, yBase - h * 0.15);
  c.strokeStyle = dark; c.lineWidth = 0.7; c.stroke();
}

// row of rounded bush mounds
function drawBushRow(x0, x1, yTop, yBot, fill, seed, bump) {
  const r = rng(seed);
  let x = x0;
  while (x < x1) {
    const w = bump * (0.8 + r() * 0.9);
    const h = (yBot - yTop) * (0.55 + r() * 0.45);
    scallopPath(x + w / 2, yBot - h / 2 + 4, w, h, Math.max(6, Math.round(w / 8)), (seed * 31 + x) | 0, false);
    fs(fill);
    x += w * (0.55 + r() * 0.3);
  }
}

// leafy ground cover: jagged clump of broad pointed lobes (fern-like, like the original)
function leafClump(x, y, w, h, fill, seed) {
  const r = rng(seed);
  const c = G.ctx;
  const n = Math.max(2, Math.round(w / 11));
  c.beginPath();
  c.moveTo(x - w / 2, y + 2);
  for (let i = 0; i < n; i++) {
    const x0 = x - w / 2 + i / n * w, x1 = x - w / 2 + (i + 1) / n * w;
    const lean = (r() - 0.5) * w / n * 1.4;
    const th = h * (0.45 + r() * 0.6);
    c.quadraticCurveTo(x0 + (x1 - x0) * 0.15, y - th * 0.5, (x0 + x1) / 2 + lean, y - th);
    c.quadraticCurveTo(x0 + (x1 - x0) * 0.8, y - th * 0.35, x1, y - h * 0.12 * r());
  }
  c.lineTo(x + w / 2, y + 2);
  c.closePath();
  fs(fill);
}
function tuft(x, y, w, h, fill, seed) { leafClump(x, y, w, h, fill, seed); }

// flat grass patch lying on the dirt
function grassPatch(x, y, w, fill, seed) {
  const r = rng(seed);
  const c = G.ctx;
  c.beginPath();
  c.moveTo(x - w / 2, y + 1.5);
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const tx = x - w / 2 + (i + 0.5) / n * w;
    c.lineTo(tx - w / n * 0.2, y - 0.5);
    c.lineTo(tx + (r() - 0.3) * 6, y - 2.5 - r() * 3);
    c.lineTo(tx + w / n * 0.3, y);
  }
  c.lineTo(x + w / 2 + 4, y + 0.5);
  c.lineTo(x + w / 2 - 2, y + 2);
  c.closePath();
  fs(fill, OUT, 0.7);
}

// ------------------------------------------------------------------ battlefield background
function drawGround(W, yEdge, seed) {
  const c = G.ctx;
  const r = rng(seed);
  c.beginPath();
  c.moveTo(-5, yEdge);
  for (let x = -5; x <= W + 5; x += 18) c.lineTo(x, yEdge - 1 + r() * 4);
  c.lineTo(W + 5, STAGE_H + 2); c.lineTo(-5, STAGE_H + 2); c.closePath();
  c.fillStyle = linGrad(0, yEdge, 0, STAGE_H, [[0, '#6e5a2e'], [0.18, '#937943'], [0.4, PAL.ground], [1, '#8f7641']]);
  c.fill();
  c.strokeStyle = OUT; c.lineWidth = LW; c.stroke();
}

function drawBackground(W) {
  const c = G.ctx;
  c.fillStyle = linGrad(0, 0, 0, 400, [[0, PAL.sky0], [1, PAL.sky1]]);
  c.fillRect(0, 0, W, STAGE_H);

  // pines at the back
  drawPine(442, 386, 48, 26, PAL.pine3, '#1f6e45');
  drawPine(95, 402, 58, 30, PAL.pine2, '#1d6326');
  drawPine(388, 398, 78, 44, PAL.pine, '#123a13');
  drawPine(487, 392, 90, 52, PAL.pine2, '#1d6326');
  drawPine(833, 398, 62, 34, PAL.pine2, '#1d6326');

  // trees
  drawTrunk(280, 392, 36, 6, 3, [[279, 372, 268, 362, 1.4]]);
  drawCanopy(277, 346, 54, 34, PAL.canopy2, '#084a14', 5);
  drawTrunk(620, 396, 70, 7, -3, [[620, 360, 640, 342, 1.8]]);
  drawCanopy(618, 324, 66, 40, PAL.canopy3, '#0a6a1e', 21);
  drawTrunk(677, 396, 28, 3, 0, [[677, 380, 668, 372, 1]]);
  drawCanopy(677, 360, 34, 14, PAL.canopy, PAL.canopyDark, 7);
  drawTrunk(756, 400, 74, 5, 2, [[756, 372, 740, 362, 1.4], [760, 356, 780, 346, 1.4]]);
  drawCanopy(756, 330, 46, 24, PAL.canopy3, '#0a6a1e', 41);
  drawCanopy(776, 348, 26, 12, PAL.canopy3, '#0a6a1e', 43);
  drawCanopy(746, 368, 24, 12, PAL.canopy3, '#0a6a1e', 45);
  drawBigTree(190, 410, 1.0, 11);
  drawBigTree(922, 410, 1.0, 29);

  // bushes: a few big mounds + filler, hand placed like the original
  const mounds = [
    [-10, 70, 40, '#1d6423'], [60, 70, 34, '#236d29'], [120, 80, 30, '#1d6423'],
    [205, 120, 40, '#1b5f21'], [300, 80, 30, '#1d6423'], [360, 70, 22, '#2b7a2e'],
    [405, 90, 34, '#1d6423'], [455, 120, 58, '#2a7f30'], [545, 80, 36, '#236d29'],
    [600, 80, 30, '#1b5f21'], [640, 110, 38, '#1d6423'], [720, 70, 28, '#236d29'],
    [770, 90, 34, '#1b5f21'], [840, 90, 30, '#1d6423'], [900, 110, 40, '#236d29'], [980, 60, 30, '#1d6423'],
  ];
  for (const [mx, mw, mh, col] of mounds) {
    scallopPath(mx + mw / 2, 408 - mh / 2, mw, mh + 4, Math.max(6, Math.round(mw / 11)), (mx * 13 + 7) | 0, false);
    fs(col);
  }
  // lighter leafy ground cover in front of the bushes
  const rg = rng(313);
  for (let x = -10; x < W + 10; x += 34 + rg() * 40) {
    leafClump(x, 406 + rg() * 2, 30 + rg() * 34, 8 + rg() * 9, rg() < 0.55 ? '#3f7a32' : '#2f6a28', (x * 7) | 0);
  }

  drawGround(W, 403, 77);

  // scattered grass patches and pebbles on the dirt
  for (let i = 0; i < 12; i++) {
    const x = rg() * W, y = 416 + rg() * 30;
    grassPatch(x, y, 14 + rg() * 26, rg() < 0.5 ? '#4b8a36' : '#3a7a2e', i * 13 + 5);
  }
  for (let i = 0; i < 12; i++) {
    const x = rg() * W, y = 414 + rg() * 34;
    ell(x, y, 2 + rg() * 3, 1.3 + rg() * 1.4, rg() < 0.5 ? '#6d6b5e' : '#5a584c', OUT, 0.6);
  }
  // a log / stones
  blob([268, 404, 276, 400, 290, 401, 292, 406, 280, 408, 270, 408], '#5f5c50', OUT, 0.8);
  stump(128, 410); stump(862, 408);
}

function stump(x, y) {
  poly([x - 8, y, x - 6, y - 12, x - 3, y - 9, x, y - 15, x + 3, y - 11, x + 6, y - 13, x + 8, y], PAL.trunk);
  pline([x - 2, y - 3, x - 1, y - 8], OUT, 0.6);
}

// Title screen background (a wider forest with parallax layers)
function drawMenuFar(W) {
  const c = G.ctx;
  c.fillStyle = linGrad(0, 0, 0, 400, [[0, '#3db0fb'], [1, '#56c6ff']]);
  c.fillRect(0, 0, W, STAGE_H);
  for (let i = 0; i < 12; i++) {
    const x = i * 90 - 20 + (i % 2) * 30;
    rect(x - 3, 300 + (i % 3) * 8 + 10, 6, 40, '#8fc7a4', null);
    drawCanopy(x, 300 + (i % 3) * 8, 60, 30, '#78cfa6', '#66bb92', i * 17);
  }
  for (let i = 0; i < 9; i++) drawPine(40 + i * 110, 362, 60 + (i % 3) * 12, 34, '#62c592', '#54ad80');
  drawBushRow(-10, W + 10, 330, 380, '#5dbd92', 5, 50);
}
function drawMenuNear(W) {
  for (let i = 0; i < 6; i++) drawPine(20 + i * 170, 392, 70 + (i % 2) * 20, 40, PAL.pine2, '#1d6326');
  drawBigTree(610, 398, 1.05, 91);
  drawBigTree(140, 402, 0.8, 57, [PAL.canopy3, '#0b6b20']);
  drawBushRow(-20, W + 20, 346, 402, '#1c5e22', 13, 60);
  drawBushRow(-20, W + 20, 358, 404, '#23702a', 17, 56);
  const r = rng(9);
  for (let x = -10; x < W + 10; x += 22 + r() * 30) leafClump(x, 398 + r() * 3, 26 + r() * 30, 10 + r() * 12, r() < 0.55 ? '#3f7a32' : '#2f6a28', (x * 5) | 0);
  drawGround(W, 396, 9);
  for (let i = 0; i < 14; i++) ell(r() * W, 410 + r() * 36, 2 + r() * 3, 1.4 + r(), '#6d6b5e', OUT, 0.6);
  for (let i = 0; i < 5; i++) grassPatch(40 + i * 150 + r() * 60, 428 + r() * 14, 60 + r() * 50, '#3f7a32', i * 7 + 1);
}

// ------------------------------------------------------------------ bases
// All bases are drawn for the player (left side, facing right) with origin at (0, GROUND_Y).
// The enemy base is the same drawing mirrored around x = 1000.

// angular cel-shaded boulder given as polygon points (relative to base origin)
function boulder(pts, seed) {
  const r = rng(seed);
  const n = pts.length / 2;
  let cx = 0, cy = 0, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) { cx += pts[i * 2]; cy += pts[i * 2 + 1]; minY = Math.min(minY, pts[i * 2 + 1]); maxY = Math.max(maxY, pts[i * 2 + 1]); }
  cx /= n; cy /= n;
  blob(pts, '#8e8b80', OUT, LW, 0.35);
  const c = G.ctx;
  c.save(); blobPath(pts, 0.35); c.clip();
  // dark lower-right facet
  c.beginPath();
  c.moveTo(cx - 40, cy + (maxY - cy) * 0.25 + 6);
  c.quadraticCurveTo(cx, cy + (maxY - cy) * 0.1, cx + 40, cy - 6);
  c.lineTo(cx + 40, maxY + 5); c.lineTo(cx - 40, maxY + 5); c.closePath();
  c.fillStyle = '#716f63'; c.fill();
  // light top facet
  c.beginPath();
  c.moveTo(cx - 30, minY - 2);
  c.lineTo(cx + 18 + r() * 10, minY - 2);
  c.quadraticCurveTo(cx + 6, cy - (cy - minY) * 0.1, cx - 30, cy - (cy - minY) * 0.2 + 4);
  c.closePath();
  c.fillStyle = '#a7a498'; c.fill();
  // crack line
  c.beginPath();
  c.moveTo(cx - 6 + r() * 12, cy - 4); c.lineTo(cx + 4, cy + 6); c.lineTo(cx + 2 + r() * 6, cy + 12);
  c.strokeStyle = 'rgba(40,40,40,0.5)'; c.lineWidth = 0.6; c.stroke();
  c.restore();
  blobPath(pts, 0.35); fs(null);
}

function baseStone() {
  const c = G.ctx;
  c.save(); c.scale(0.93, 0.88);
  // moss/grass strip hanging on the left
  blob([-8, -122, 4, -138, 22, -132, 18, -96, 0, -86, -8, -90], '#2a8a2a');
  // back row
  boulder([-6, -96, 4, -138, 22, -150, 30, -142, 24, -104, 6, -92], 1);
  boulder([18, -104, 30, -128, 58, -134, 72, -118, 66, -96, 34, -92], 2);
  boulder([58, -106, 74, -124, 96, -120, 108, -96, 96, -84, 64, -88], 3);
  // cave mouth (dark)
  c.beginPath(); c.moveTo(64, 0); c.lineTo(66, -58); c.quadraticCurveTo(76, -86, 90, -78); c.lineTo(94, 0); c.closePath();
  fs('#222820');
  c.beginPath(); c.moveTo(70, -2); c.lineTo(72, -54); c.quadraticCurveTo(78, -72, 86, -70);
  c.strokeStyle = '#39402f'; c.lineWidth = 2; c.stroke();
  // middle row
  boulder([-8, -60, 0, -92, 30, -98, 42, -80, 34, -56, 4, -50], 4);
  boulder([30, -60, 40, -88, 70, -92, 72, -60, 58, -46, 36, -48], 5);
  // right wall of the cave
  boulder([86, 0, 84, -60, 94, -86, 110, -88, 116, -40, 118, 0], 6);
  // bottom row
  boulder([-8, -4, -6, -46, 22, -58, 44, -44, 44, -6, 10, 2], 7);
  boulder([36, 0, 34, -40, 56, -54, 70, -40, 68, 0], 8);
  boulder([104, 2, 108, -18, 122, -22, 128, 2], 9);
  c.restore();
}

function brickLines(x, y, w, h, rows, color) {
  const c = G.ctx;
  c.strokeStyle = color; c.lineWidth = 0.6;
  c.beginPath();
  const rh = h / rows;
  for (let i = 1; i < rows; i++) { c.moveTo(x, y + i * rh); c.lineTo(x + w, y + i * rh); }
  for (let i = 0; i < rows; i++) {
    const off = (i % 2) * 6;
    for (let bx = x + 4 + off; bx < x + w - 2; bx += 12) { c.moveTo(bx, y + i * rh); c.lineTo(bx, y + (i + 1) * rh); }
  }
  c.stroke();
}

function baseMedieval() {
  const c = G.ctx;
  // main hall
  const wallTop = -86;
  rect(-4, wallTop, 104, 86, '#b4b4b4');
  c.save(); c.beginPath(); c.rect(-4, wallTop, 104, 86); c.clip();
  brickLines(-4, wallTop, 104, 86, 12, '#8e8e8e');
  c.restore();
  // side face shading
  poly([100, wallTop, 108, wallTop - 6, 108, -6, 100, 0], '#8f8f8f');
  // buttress strips
  for (const bx of [8, 30, 52]) poly([bx, -2, bx + 4, -52, bx + 8, -52, bx + 6, -2], '#9a9a9a');
  // door
  c.beginPath(); c.moveTo(64, 0); c.lineTo(64, -44); c.quadraticCurveTo(80, -66, 96, -44); c.lineTo(96, 0); c.closePath();
  fs('#3a3a3a');
  c.beginPath(); c.moveTo(68, 0); c.lineTo(68, -42); c.quadraticCurveTo(80, -58, 92, -42); c.lineTo(92, 0); c.closePath();
  fs(linGrad(68, 0, 92, 0, [[0, '#4d4d4d'], [1, '#9a9a9a']]));
  c.strokeStyle = '#222'; c.lineWidth = 0.8; c.beginPath();
  for (let x = 71; x < 92; x += 4) { c.moveTo(x, -48); c.lineTo(x, -2); }
  for (let y = -44; y < 0; y += 6) { c.moveTo(68, y); c.lineTo(92, y); }
  c.stroke();
  // blue slate roof
  poly([-8, wallTop, 30, wallTop - 20, 112, wallTop - 20, 112, wallTop - 6, 100, wallTop], '#3a5a9a');
  poly([-8, wallTop, 30, wallTop - 20, 44, wallTop - 20, 8, wallTop], '#4a6db0', null);
  pline([-8, wallTop, 30, wallTop - 20, 112, wallTop - 20], OUT);
  // gargoyle statue
  const gx = 94, gy = wallTop - 20;
  poly([gx - 3, gy, gx - 4, gy - 10, gx - 1, gy - 18, gx + 3, gy - 16, gx + 5, gy - 8, gx + 4, gy], '#9c9c9c');
  poly([gx - 1, gy - 14, gx - 10, gy - 30, gx - 2, gy - 20], '#bdbdbd');
  poly([gx + 2, gy - 14, gx + 8, gy - 32, gx + 4, gy - 18], '#bdbdbd');
  circ(gx + 1, gy - 20, 2.6, '#a9a9a9');
  // round tower stub
  rect(26, wallTop - 30, 54, 16, '#b8b8b8');
}

function stainedWindow(x, y, w, h) {
  const c = G.ctx;
  c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * 0.5); c.quadraticCurveTo(x + w / 2, y - w * 0.2, x + w, y + w * 0.5); c.lineTo(x + w, y + h); c.closePath();
  fs('#8a7a5a');
  const ix = x + 1.5, iy = y + 1.5, iw = w - 3, ih = h - 3;
  c.save();
  c.beginPath(); c.moveTo(ix, iy + ih); c.lineTo(ix, iy + iw * 0.5); c.quadraticCurveTo(ix + iw / 2, iy - iw * 0.2, ix + iw, iy + iw * 0.5); c.lineTo(ix + iw, iy + ih); c.closePath();
  c.clip();
  // lozenge pattern: yellow ground with red centre panes, cyan and green diamonds (as in the original)
  c.fillStyle = '#f4e21a'; c.fillRect(ix - 1, iy - 6, iw + 2, ih + 8);
  const cw = iw / 3, chh = ih / 5;
  c.fillStyle = '#e41b1b'; c.fillRect(ix + cw, iy + ih * 0.12, cw, ih * 0.8);
  for (let j = 0; j < 6; j++) {
    const yy = iy + j * chh;
    for (const [xx, col] of [[ix + cw * 0.5, j % 2 ? '#27c95a' : '#1bd0e0'], [ix + cw * 2.5, j % 2 ? '#1bd0e0' : '#27c95a']]) {
      c.beginPath(); c.moveTo(xx, yy - chh * 0.45); c.lineTo(xx + cw * 0.48, yy); c.lineTo(xx, yy + chh * 0.45); c.lineTo(xx - cw * 0.48, yy); c.closePath();
      c.fillStyle = col; c.fill();
    }
  }
  c.strokeStyle = '#222'; c.lineWidth = 0.6;
  c.beginPath();
  for (let i = 1; i < 3; i++) { c.moveTo(ix + i * cw, iy - 5); c.lineTo(ix + i * cw, iy + ih); }
  for (let j = 1; j < 5; j++) { c.moveTo(ix, iy + j * chh); c.lineTo(ix + iw, iy + j * chh); }
  c.stroke();
  c.restore();
}

function baseRenaissance() {
  const c = G.ctx;
  const top = -110;
  // lower stone part
  rect(-4, -48, 76, 48, '#bda57e');
  c.save(); c.beginPath(); c.rect(-4, -48, 76, 48); c.clip(); brickLines(-4, -48, 76, 48, 6, '#9c8762'); c.restore();
  // wooden gallery roof
  poly([-8, -48, -4, -58, 78, -58, 82, -48], '#7a5a3a');
  // tower body
  rect(0, top, 64, top * -1 - 58, '#c9b184');
  stainedWindow(4, top + 8, 13, 46);
  stainedWindow(22, top + 8, 13, 46);
  stainedWindow(42, top + 8, 13, 46);
  // chapel roof (brown shingles) + side entrance
  poly([56, -74, 82, -104, 104, -74, 100, -70, 82, -94, 60, -70], '#8a6a4a');
  c.save(); c.beginPath(); c.moveTo(60, -70); c.lineTo(82, -94); c.lineTo(100, -70); c.closePath(); c.clip();
  c.strokeStyle = '#5e4630'; c.lineWidth = 0.6; c.beginPath();
  for (let y = -94; y < -70; y += 4) { c.moveTo(56, y); c.lineTo(104, y); }
  c.stroke(); c.restore();
  rect(64, -72, 34, 72, '#b39a70');
  c.beginPath(); c.moveTo(70, 0); c.lineTo(70, -38); c.quadraticCurveTo(81, -56, 92, -38); c.lineTo(92, 0); c.closePath(); fs('#2b2620');
  stainedWindow(4, -44, 12, 34);
  // stone blocks at the foot
  poly([62, 0, 64, -8, 72, -8, 72, 0], '#a6a6a0');
  // window ledges
  rect(-2, top, 68, 4, '#a9a9a2');
  rect(-2, -62, 68, 5, '#a9a9a2');
}

function baseModern() {
  const c = G.ctx;
  // quonset hut
  c.beginPath(); c.moveTo(-6, 0); c.lineTo(-6, -104); c.quadraticCurveTo(70, -112, 92, -40); c.lineTo(92, 0); c.closePath();
  fs(linGrad(0, -110, 0, 0, [[0, '#5a7a3a'], [1, '#34532a']]));
  // ribs
  for (const x of [10, 36, 62]) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, -100 + (x - 10) * 0.15); c.quadraticCurveTo(x + 10, -104, x + 14, -90);
    c.lineTo(x + 14, 0); c.lineTo(x + 9, 0); c.lineTo(x + 9, -86); c.quadraticCurveTo(x + 6, -96, x + 4, -94); c.lineTo(x + 4, 0); c.closePath();
    fs('#8c9a8a');
  }
  // end arch
  c.beginPath(); c.moveTo(78, 0); c.quadraticCurveTo(78, -98, 60, -104); c.quadraticCurveTo(94, -100, 96, 0); c.closePath(); fs('#7f8d7c');
  // concrete tower foot
  poly([18, -104, 26, -114, 72, -114, 80, -104], '#b9b9b9');
}

function baseFuture() {
  const c = G.ctx;
  // white organic shell
  c.beginPath();
  c.moveTo(-6, 0); c.lineTo(-6, -118);
  c.bezierCurveTo(40, -135, 100, -118, 108, -70);
  c.bezierCurveTo(112, -40, 124, -20, 132, 0); c.closePath();
  fs(linGrad(0, -130, 90, 0, [[0, '#ffffff'], [0.6, '#ede8dc'], [1, '#cfc6b3']]));
  // mouth opening
  c.beginPath(); c.moveTo(34, -74); c.bezierCurveTo(46, -104, 90, -100, 96, -64); c.bezierCurveTo(98, -40, 86, -24, 76, -44);
  c.bezierCurveTo(70, -58, 60, -60, 48, -52); c.closePath(); fs('#34302a');
  // ribs / plates
  c.beginPath(); c.moveTo(60, 0); c.bezierCurveTo(56, -20, 62, -40, 80, -44); c.bezierCurveTo(96, -36, 108, -16, 116, 0); c.closePath();
  fs('#f4efe4');
  c.beginPath(); c.moveTo(84, 0); c.bezierCurveTo(88, -14, 94, -24, 104, -28); c.lineTo(126, 0); c.closePath(); fs('#e6decf');
  c.beginPath(); c.moveTo(-6, -40); c.bezierCurveTo(10, -44, 26, -40, 36, -26); c.lineTo(40, 0); c.lineTo(-6, 0); c.closePath(); fs('#efe9dd');
  // window slits
  for (const [x, y] of [[4, -30], [8, -18], [16, -8], [40, -100], [30, -108]]) ell(x, y, 2, 1.5, '#fff', '#5a7a9a', 0.6);
  poly([58, -112, 70, -114, 72, -110, 60, -108], '#bfe6ff', '#4a7aa0', 0.6);
  // spire foot
  poly([36, -120, 44, -134, 66, -134, 74, -120], '#f5f5f5');
}

// Tower extension segment (i = 0,1,2) for each age. Origin: segment top-left at (30.75, reg y).
function towerSegment(age, i, isTop) {
  const c = G.ctx;
  const x = 30.75, w = 47, h = 47;
  if (age === 1) {
    // wooden scaffold
    const pole = (px) => rect(px, 0, 5, h + 2, '#d6bf6a');
    pole(0); pole(w - 5);
    c.save(); c.lineCap = 'butt';
    for (const [a, b] of [[[3, 2], [w - 3, h - 2]], [[w - 3, 2], [3, h - 2]]]) {
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      c.strokeStyle = OUT; c.lineWidth = 5.4; c.stroke();
      c.strokeStyle = '#d6bf6a'; c.lineWidth = 3.6; c.stroke();
    }
    c.restore();
    rect(0, h - 2, w, 4, '#cbb25c');
    // rope lashings
    for (const [lx, ly] of [[2.5, 2], [w - 2.5, 2], [2.5, h - 1], [w - 2.5, h - 1], [w / 2, h / 2]]) {
      rect(lx - 3.5, ly - 2.5, 7, 5, '#e8d9a0', OUT, 0.7);
      pline([lx - 3, ly - 2, lx + 3, ly + 2], '#9a8a50', 0.6);
    }
    if (isTop) rect(-2, -2, w + 4, 4, '#cbb25c');
  } else if (age === 2) {
    // round stone tower
    const tx = -8, tw = 60;
    rect(tx, 0, tw, h + 1, '#c4c4c4', null);
    c.save(); c.beginPath(); c.rect(tx, 0, tw, h + 1); c.clip();
    c.fillStyle = linGrad(tx, 0, tx + tw, 0, [[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.25)']]);
    c.fillRect(tx, 0, tw, h + 1);
    brickLines(tx, 0, tw, h + 1, 7, '#9a9a9a');
    c.restore();
    pline([tx, 0, tx, h + 1]); pline([tx + tw, 0, tx + tw, h + 1]);
    if (isTop) {
      c.beginPath(); c.moveTo(tx - 4, 2); c.quadraticCurveTo(tx + tw / 2, -12, tx + tw + 4, 2); c.lineTo(tx + tw / 2, -58); c.closePath();
      fs('#3d5c9c');
      c.beginPath(); c.moveTo(tx - 4, 2); c.quadraticCurveTo(tx + tw / 2, -12, tx + tw + 4, 2); c.strokeStyle = OUT; c.lineWidth = LW; c.stroke();
    }
  } else if (age === 3) {
    rect(-4, 0, 58, h + 1, '#c9b184');
    stainedWindow(-1, 7, 13, 36); stainedWindow(18, 7, 13, 36); stainedWindow(37, 7, 13, 36);
    rect(-6, 0, 62, 5, '#a9a9a2');
    if (isTop) {
      rect(-6, -4, 62, 5, '#b4b4ac');
      for (const hx of [-4, 26, 52]) poly([hx - 3, -3, hx, -14, hx + 3, -3], '#f0ead8');
    }
  } else if (age === 4) {
    rect(4, 0, 38, h + 1, '#8a8a8a');
    rect(2, h - 12, 42, 10, '#c8c8c8');
    poly([42, 0, 45, 2, 45, h + 1, 42, h + 1], '#6a6a6a');
    if (isTop) poly([2, 2, 23, -24, 44, 2], '#cfc3a8');
  } else if (age === 5) {
    rect(18, 0, 10, h + 1, '#f7f7f7');
    ell(23, h - 6, 9, 6, '#f2f2f2');
    ell(23, 8, 6, 4, '#ffffff');
    circ(16, h - 6, 2, '#8fd0ff', '#3a6a9a', 0.5);
    if (isTop) {
      rect(20, -26, 6, 28, '#fafafa');
      poly([23, -70, 25, -30, 21, -30], '#ffffff');
      c.beginPath(); c.moveTo(14, -20); c.quadraticCurveTo(12, -36, 18, -50); c.quadraticCurveTo(16, -34, 22, -24); c.closePath(); fs('#fff');
      c.beginPath(); c.moveTo(32, -20); c.quadraticCurveTo(34, -36, 28, -50); c.quadraticCurveTo(30, -34, 24, -24); c.closePath(); fs('#fff');
    }
  }
}

const BASE_DRAW = [null, baseStone, baseMedieval, baseRenaissance, baseModern, baseFuture];
const SEG_Y = [-148.5, -195.5, -242.5];

function drawBase(age, addons) {
  const c = G.ctx;
  // tower extensions first (they sit behind the building)
  for (let i = 0; i < addons; i++) {
    c.save();
    c.translate(0, SEG_Y[i] - 1);
    c.translate(30.75, 0);
    towerSegment(age, i, i === addons - 1);
    c.restore();
  }
  if (age === 2 && addons === 0) {
    // medieval hall still shows a short tower
  }
  BASE_DRAW[age]();
}

// ------------------------------------------------------------------ turret build spots
function drawSpotMarker(x, y, color) {
  const c = G.ctx;
  c.save(); c.translate(x, y);
  c.strokeStyle = color; c.lineWidth = 1.3;
  const s = 13, k = 5;
  c.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    c.moveTo(sx * s, sy * s + -sy * k); c.lineTo(sx * s, sy * s); c.lineTo(sx * s + -sx * k, sy * s);
  }
  c.stroke();
  c.restore();
}
