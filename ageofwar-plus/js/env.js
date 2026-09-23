'use strict';
// Age of War Plus — one living environment per age: sky, three parallax layers and ambient life.
// Layers are painted once into bitmaps (far layers at lower resolution) and scrolled with parallax.

const ENV_X0 = -60, ENV_X1 = 1060;         // world range the near layer covers
const LAYER_W = 1240;                       // logical width of the parallax layers
const PARALLAX = { far: 0.22, mid: 0.5 };

const AGE_ENV = [
  null,
  { // 1 Stone Age — warm morning, volcano, jungle
    sky: [[0, '#6ec3f5'], [0.55, '#a9dcf5'], [0.85, '#ffe0a8'], [1, '#ffcf8a']],
    sun: { x: 0.18, y: 118, r: 26, col: '255,236,170' },
    ground: ['#6b532c', '#8f7240', '#9a7c44', '#86693a'],
    bush: ['#1f5e25', '#27702c', '#2f7f33'], clump: ['#467d33', '#356d2b'], patch: ['#4f8d38', '#3c7a2f'],
    haze: 'rgba(255,214,160,0.35)', clouds: 'warm',
  },
  { // 2 Medieval — clear day, hills, castle, windmill
    sky: [[0, '#3aa7f7'], [0.7, '#8fd2fb'], [1, '#c8ecff']],
    sun: { x: 0.8, y: 70, r: 22, col: '255,250,210' },
    ground: ['#6b5a2e', '#8e7743', '#997e45', '#8c7442'],
    bush: ['#1b5f22', '#23702a', '#2c7f30'], clump: ['#3f7a32', '#2f6a28'], patch: ['#4b8a36', '#3a7a2e'],
    haze: 'rgba(200,236,255,0.35)', clouds: 'white',
  },
  { // 3 Renaissance — golden hour by the sea
    sky: [[0, '#5b9fe0'], [0.5, '#9cc6ec'], [0.8, '#ffd9a0'], [1, '#ffbf78']],
    sun: { x: 0.72, y: 150, r: 30, col: '255,220,150' },
    ground: ['#6e5528', '#9a7a3e', '#a8864a', '#94763e'],
    bush: ['#2c5e22', '#3a722a', '#4a8534'], clump: ['#5a8a36', '#48762c'], patch: ['#6a9a40', '#557f34'],
    haze: 'rgba(255,200,140,0.32)', clouds: 'warm',
  },
  { // 4 Modern — hazy overcast, burning city
    sky: [[0, '#7f95a6'], [0.6, '#b5b8b0'], [1, '#d8c8a8']],
    sun: { x: 0.3, y: 95, r: 20, col: '255,240,210' },
    ground: ['#4f4128', '#6e5a36', '#76613a', '#665434'],
    bush: ['#3a4f28', '#465e2e', '#566e36'], clump: ['#5a6a34', '#4a5a2c'], patch: ['#5f6f38', '#4d5c2e'],
    haze: 'rgba(200,190,170,0.4)', clouds: 'grey',
  },
  { // 5 Future — synthwave dusk, neon skyline
    sky: [[0, '#120c38'], [0.45, '#3b1e6e'], [0.78, '#b0407e'], [1, '#ff9a6a']],
    sun: { x: 0.25, y: 160, r: 34, col: '255,150,120' },
    ground: ['#2e2238', '#4a3a52', '#56445c', '#463852'],
    bush: ['#1d3a4a', '#23485a', '#2b566a'], clump: ['#2f5c6e', '#244a5a'], patch: ['#3a7082', '#2d5c6c'],
    haze: 'rgba(255,120,170,0.28)', clouds: 'none', stars: true,
  },
];

// ------------------------------------------------------------------ helpers
function silhouetteHills(x0, x1, yBase, amp, freq, seed, fill, stroke) {
  const r = rng(seed);
  const c = G.ctx;
  const ph = r() * 10;
  c.beginPath();
  c.moveTo(x0, 520);
  for (let x = x0; x <= x1; x += 8) {
    const y = yBase - amp * (0.5 + 0.3 * Math.sin(x * freq + ph) + 0.2 * Math.sin(x * freq * 2.7 + ph * 2));
    c.lineTo(x, y);
  }
  c.lineTo(x1, 520); c.closePath();
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 0.8; c.stroke(); }
}

function mountain(x, yBase, w, h, fill, snow, seed) {
  const r = rng(seed);
  const c = G.ctx;
  c.beginPath();
  c.moveTo(x - w / 2, yBase);
  c.lineTo(x - w * 0.18, yBase - h * 0.7 - r() * h * 0.1);
  c.lineTo(x - w * 0.05, yBase - h * (0.92 + r() * 0.05));
  c.lineTo(x, yBase - h);
  c.lineTo(x + w * 0.12, yBase - h * 0.82);
  c.lineTo(x + w * 0.24, yBase - h * 0.75);
  c.lineTo(x + w / 2, yBase);
  c.closePath();
  c.fillStyle = fill; c.fill();
  if (snow) {
    c.beginPath();
    c.moveTo(x - w * 0.09, yBase - h * 0.82); c.lineTo(x - w * 0.05, yBase - h * 0.93); c.lineTo(x, yBase - h);
    c.lineTo(x + w * 0.1, yBase - h * 0.84); c.lineTo(x + w * 0.04, yBase - h * 0.8); c.lineTo(x - w * 0.02, yBase - h * 0.86);
    c.closePath(); c.fillStyle = snow; c.fill();
  }
}

// ------------------------------------------------------------------ FAR layers (drawn in layer space 0..LAYER_W, y 0..500)
const ENV_FAR = [
  null,
  () => { // stone: distant mountains + volcano
    mountain(160, 420, 420, 190, '#9aa8c8', 'rgba(255,255,255,0.7)', 3);
    mountain(1060, 420, 460, 210, '#94a2c2', 'rgba(255,255,255,0.7)', 5);
    // volcano
    const c = G.ctx;
    c.beginPath(); c.moveTo(430, 420); c.lineTo(600, 250); c.lineTo(650, 250); c.lineTo(830, 420); c.closePath();
    c.fillStyle = '#8a7f98'; c.fill();
    c.beginPath(); c.moveTo(600, 250); c.lineTo(650, 250); c.lineTo(640, 262); c.lineTo(612, 262); c.closePath(); c.fillStyle = '#ff7a2a'; c.fill();
    c.fillStyle = 'rgba(255,120,40,0.55)';
    c.beginPath(); c.moveTo(618, 262); c.lineTo(600, 330); c.lineTo(612, 330); c.lineTo(628, 262); c.closePath(); c.fill();
    silhouetteHills(0, LAYER_W, 420, 60, 0.008, 11, '#7f9fb0');
    silhouetteHills(0, LAYER_W, 432, 40, 0.013, 12, '#6f93a0');
  },
  () => { // medieval: blue hills + castle
    silhouetteHills(0, LAYER_W, 405, 90, 0.006, 21, '#8fb8d8');
    const c = G.ctx;
    // castle on the hill
    const cx = 760, cy = 330;
    c.fillStyle = '#7fa0c0';
    c.fillRect(cx - 50, cy - 30, 100, 40);
    for (const [tx, th] of [[-50, 60], [-18, 78], [18, 66], [48, 58]]) {
      c.fillRect(cx + tx - 8, cy - th, 16, th);
      c.beginPath(); c.moveTo(cx + tx - 10, cy - th); c.lineTo(cx + tx, cy - th - 16); c.lineTo(cx + tx + 10, cy - th); c.closePath(); c.fill();
    }
    for (let i = -46; i < 50; i += 8) c.fillRect(cx + i, cy - 36, 5, 6);
    silhouetteHills(0, LAYER_W, 425, 60, 0.011, 22, '#79aa8e');
    silhouetteHills(0, LAYER_W, 438, 38, 0.017, 23, '#6aa07e');
  },
  () => { // renaissance: sea, coastal town with domes
    const c = G.ctx;
    c.fillStyle = linGrad(0, 330, 0, 440, [[0, '#5d8fc0'], [1, '#86b4d6']]);
    c.fillRect(0, 336, LAYER_W, 110);
    c.strokeStyle = 'rgba(255,240,210,0.5)'; c.lineWidth = 1;
    const r = rng(31);
    for (let i = 0; i < 40; i++) { const x = r() * LAYER_W, y = 345 + r() * 60; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + r() * 14, y); c.stroke(); }
    // sun glitter
    c.fillStyle = 'rgba(255,230,170,0.35)';
    for (let i = 0; i < 18; i++) c.fillRect(870 + (r() - 0.5) * 80, 342 + i * 4, 10 + r() * 30, 1.5);
    // town on the headland
    silhouetteHills(0, 520, 380, 70, 0.009, 32, '#b9a58a');
    const town = [[60, 30, 26], [96, 22, 36], [130, 34, 22], [170, 26, 30], [205, 40, 26], [248, 28, 20], [280, 36, 24]];
    for (const [x, w, h] of town) { c.fillStyle = '#d8c2a0'; c.fillRect(x, 330 - h, w, h + 20); c.fillStyle = '#b86a4a'; c.beginPath(); c.moveTo(x - 2, 330 - h); c.lineTo(x + w / 2, 330 - h - 10); c.lineTo(x + w + 2, 330 - h); c.fill(); }
    // cathedral dome + campanile
    c.fillStyle = '#e2cfae'; c.fillRect(150, 280, 40, 40);
    c.beginPath(); c.arc(170, 280, 20, Math.PI, 0); c.fillStyle = '#c47a52'; c.fill();
    c.fillStyle = '#e2cfae'; c.fillRect(214, 250, 12, 70);
    c.beginPath(); c.moveTo(212, 250); c.lineTo(220, 232); c.lineTo(228, 250); c.fillStyle = '#b86a4a'; c.fill();
    silhouetteHills(0, LAYER_W, 445, 34, 0.015, 33, '#8ea46a');
  },
  () => { // modern: ruined skyline
    const c = G.ctx;
    const r = rng(41);
    let x = 0;
    while (x < LAYER_W) {
      const w = 24 + r() * 46, h = 60 + r() * 120;
      c.fillStyle = r() < 0.5 ? '#8a8f94' : '#7c8288';
      c.beginPath(); c.moveTo(x, 440); c.lineTo(x, 440 - h);
      if (r() < 0.45) { c.lineTo(x + w * 0.3, 440 - h + 10 + r() * 20); c.lineTo(x + w * 0.55, 440 - h - 6); c.lineTo(x + w * 0.8, 440 - h + 18); }
      c.lineTo(x + w, 440 - h + (r() < 0.3 ? 20 : 0)); c.lineTo(x + w, 440); c.closePath(); c.fill();
      c.fillStyle = 'rgba(40,40,45,0.35)';
      for (let wy = 440 - h + 10; wy < 430; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (r() < 0.55) c.fillRect(wx, wy, 4, 6);
      x += w + r() * 6;
    }
    silhouetteHills(0, LAYER_W, 450, 26, 0.02, 42, '#76705e');
  },
  () => { // future: neon megacity
    const c = G.ctx;
    const r = rng(51);
    let x = 0;
    const neon = ['#ff4fd8', '#4ff0ff', '#ffe04f', '#8a7bff'];
    while (x < LAYER_W) {
      const w = 22 + r() * 40, h = 90 + r() * 170;
      c.fillStyle = r() < 0.5 ? '#2a1f52' : '#33265e';
      c.beginPath(); c.moveTo(x, 450); c.lineTo(x, 450 - h + 8); c.lineTo(x + w * 0.5, 450 - h); c.lineTo(x + w, 450 - h + 8); c.lineTo(x + w, 450); c.closePath(); c.fill();
      if (r() < 0.35) { c.fillStyle = '#2a1f52'; c.fillRect(x + w * 0.45, 450 - h - 26, 2, 26); }
      for (let wy = 450 - h + 16; wy < 440; wy += 10) for (let wx = x + 4; wx < x + w - 5; wx += 7) if (r() < 0.35) { c.fillStyle = neon[(r() * 4) | 0]; c.globalAlpha = 0.35 + r() * 0.5; c.fillRect(wx, wy, 3, 4); }
      c.globalAlpha = 1;
      if (r() < 0.25) { c.fillStyle = neon[(r() * 4) | 0]; c.fillRect(x + 3, 450 - h + 20, w - 6, 3); }
      x += w + r() * 4;
    }
    silhouetteHills(0, LAYER_W, 452, 20, 0.02, 52, '#241a3e');
  },
];

// ------------------------------------------------------------------ MID layers
const ENV_MID = [
  null,
  () => { // stone: jungle canopy wall + giant ferns
    const r = rng(61);
    for (let x = -20; x < LAYER_W; x += 38 + r() * 30) drawCanopy(x, 360 + r() * 16, 70 + r() * 50, 46 + r() * 20, '#3f8f6a', '#347a5a', (x * 3) | 0);
    for (let x = 0; x < LAYER_W; x += 60 + r() * 50) {
      const h = 60 + r() * 50;
      drawTrunk(x, 420, h, 4, 2, []);
      // palm-like fronds
      const c = G.ctx;
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.45;
        c.beginPath(); c.moveTo(x + 2, 420 - h);
        c.quadraticCurveTo(x + Math.cos(a) * 20, 420 - h + Math.sin(a) * 20 - 6, x + Math.cos(a) * 36, 420 - h + Math.sin(a) * 26 + 16);
        c.lineWidth = 5; c.strokeStyle = '#2f7a54'; c.stroke();
      }
    }
    silhouetteHills(0, LAYER_W, 440, 20, 0.03, 62, '#3a8060');
  },
  () => { // medieval: rolling hills with fields and hedges
    silhouetteHills(0, LAYER_W, 420, 50, 0.009, 71, '#6ab35a', 'rgba(30,60,20,0.35)');
    const c = G.ctx;
    const r = rng(72);
    for (let i = 0; i < 12; i++) {
      const x = r() * LAYER_W, y = 392 + r() * 30, w = 50 + r() * 70;
      c.fillStyle = r() < 0.5 ? '#c8c060' : '#8cc860';
      c.beginPath(); c.ellipse(x, y, w / 2, 7, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(80,90,30,0.4)'; c.lineWidth = 0.6;
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x - w / 2 + 6, y + k * 2.5); c.lineTo(x + w / 2 - 6, y + k * 2.5); c.stroke(); }
    }
    for (let x = 0; x < LAYER_W; x += 90 + r() * 80) drawCanopy(x, 398, 30 + r() * 16, 20, '#3f8f3a', '#2f7a2e', (x * 7) | 0);
    // windmill tower (blades animated separately)
    const wx = 700, wy = 400;
    poly([wx - 12, wy, wx - 8, wy - 52, wx + 8, wy - 52, wx + 12, wy], '#e8dcc0', 'rgba(60,40,20,0.6)', 0.8);
    poly([wx - 10, wy - 52, wx, wy - 64, wx + 10, wy - 52], '#b04a30', 'rgba(60,40,20,0.6)', 0.8);
    rect(wx - 3, wy - 14, 6, 14, '#6a4a2a', null);
  },
  () => { // renaissance: cypress, vineyards and a villa
    const c = G.ctx;
    silhouetteHills(0, LAYER_W, 425, 40, 0.01, 81, '#9ab25a', 'rgba(60,70,20,0.35)');
    const r = rng(82);
    for (let i = 0; i < 6; i++) {
      const x0 = r() * LAYER_W, y0 = 400 + r() * 20;
      c.strokeStyle = '#5f7a30'; c.lineWidth = 2;
      for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x0, y0 + k * 3); c.lineTo(x0 + 70, y0 + k * 3 - 4); c.stroke(); }
    }
    for (let x = 20; x < LAYER_W; x += 50 + r() * 70) {
      const h = 50 + r() * 40;
      c.beginPath(); c.moveTo(x, 420); c.quadraticCurveTo(x - 9, 420 - h * 0.6, x, 420 - h); c.quadraticCurveTo(x + 9, 420 - h * 0.6, x, 420);
      c.fillStyle = '#2f5a2a'; c.fill(); c.strokeStyle = 'rgba(20,40,10,0.5)'; c.lineWidth = 0.7; c.stroke();
    }
    // villa
    const vx = 640;
    rect(vx, 360, 70, 44, '#efe0c0', 'rgba(80,60,30,0.6)', 0.8);
    poly([vx - 6, 360, vx + 35, 342, vx + 76, 360], '#c07048', 'rgba(80,40,20,0.6)', 0.8);
    for (let k = 0; k < 4; k++) rect(vx + 8 + k * 15, 372, 7, 12, '#7a5a3a', null);
  },
  () => { // modern: bombed houses, bare trees, telegraph poles
    const c = G.ctx;
    silhouetteHills(0, LAYER_W, 432, 24, 0.012, 91, '#7f7a62');
    const r = rng(92);
    for (let x = 30; x < LAYER_W; x += 110 + r() * 90) {
      const w = 40 + r() * 30, h = 34 + r() * 30;
      c.fillStyle = '#a09a8a';
      c.beginPath(); c.moveTo(x, 425); c.lineTo(x, 425 - h); c.lineTo(x + w * 0.35, 425 - h - 12); c.lineTo(x + w * 0.5, 425 - h + 6); c.lineTo(x + w * 0.7, 425 - h - 4); c.lineTo(x + w, 425 - h + 14); c.lineTo(x + w, 425); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(40,40,40,0.5)'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#3a3a3a'; for (let k = 0; k < 3; k++) c.fillRect(x + 6 + k * (w / 3), 425 - h + 12, 6, 8);
    }
    for (let x = 0; x < LAYER_W; x += 70 + r() * 60) {
      c.strokeStyle = '#5a5044'; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(x, 428); c.lineTo(x + 2, 380); c.moveTo(x + 1, 400); c.lineTo(x - 10, 388); c.moveTo(x + 2, 392); c.lineTo(x + 12, 380); c.stroke();
    }
    for (let x = 60; x < LAYER_W; x += 160) { c.strokeStyle = '#4a4036'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, 428); c.lineTo(x, 370); c.moveTo(x - 7, 376); c.lineTo(x + 7, 376); c.stroke(); }
    c.strokeStyle = 'rgba(40,35,30,0.6)'; c.lineWidth = 0.6;
    for (let x = 60; x < LAYER_W - 160; x += 160) { c.beginPath(); c.moveTo(x - 7, 376); c.quadraticCurveTo(x + 80, 386, x + 153, 376); c.stroke(); }
  },
  () => { // future: sleek towers, bridges, antennas
    const c = G.ctx;
    const r = rng(101);
    for (let x = 10; x < LAYER_W; x += 90 + r() * 90) {
      const w = 18 + r() * 20, h = 80 + r() * 90;
      c.fillStyle = linGrad(x, 0, x + w, 0, [[0, '#3c2c6c'], [1, '#221846']]);
      c.beginPath(); c.moveTo(x, 440); c.lineTo(x + 2, 440 - h); c.quadraticCurveTo(x + w / 2, 440 - h - 14, x + w - 2, 440 - h); c.lineTo(x + w, 440); c.closePath(); c.fill();
      c.fillStyle = '#4ff0ff'; c.globalAlpha = 0.7; c.fillRect(x + 3, 440 - h + 12, w - 6, 2); c.fillRect(x + 3, 440 - h * 0.5, w - 6, 2); c.globalAlpha = 1;
      c.fillStyle = '#ff4fd8'; c.fillRect(x + w / 2 - 1, 440 - h - 22, 2, 12);
    }
    c.strokeStyle = 'rgba(79,240,255,0.5)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, 360); c.quadraticCurveTo(400, 380, 820, 350); c.quadraticCurveTo(1030, 336, LAYER_W, 356); c.stroke();
    silhouetteHills(0, LAYER_W, 440, 16, 0.02, 102, '#1e1636');
  },
];

// ------------------------------------------------------------------ NEAR layer: the battlefield itself (world coords)
function envProps(age, W) {
  const c = G.ctx;
  const r = rng(700 + age);
  if (age === 1) {
    // ferns, bones and rocks
    for (let i = 0; i < 7; i++) {
      const x = 240 + r() * 520;
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.33;
        c.beginPath(); c.moveTo(x, 410);
        c.quadraticCurveTo(x + Math.cos(a) * 14, 410 + Math.sin(a) * 18, x + Math.cos(a) * 26, 410 + Math.sin(a) * 26 + 6);
        c.lineWidth = 3.2; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 2; c.strokeStyle = '#4c9a3c'; c.stroke();
      }
    }
    // dinosaur rib cage on the ground
    const bx = 470;
    for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(bx + k * 9, 432, 10 - k, Math.PI, Math.PI * 1.95); c.lineWidth = 2.6; c.strokeStyle = OUT; c.stroke(); c.lineWidth = 1.6; c.strokeStyle = '#efe6cf'; c.stroke(); }
    pline([bx - 10, 432, bx + 48, 432], OUT, 2.4); pline([bx - 10, 432, bx + 48, 432], '#efe6cf', 1.4);
    ell(bx + 56, 430, 7, 4.5, '#efe6cf', OUT, 0.7);
  } else if (age === 2) {
    // wooden fence + haystacks
    for (let x = 290; x < 420; x += 16) { rect(x, 396, 3.5, 16, '#9a7446', OUT, 0.7); }
    rect(286, 399, 136, 3, '#a8804e', OUT, 0.6); rect(286, 405, 136, 3, '#a8804e', OUT, 0.6);
    for (const hx of [600, 640]) { blob([hx - 16, 412, hx - 12, 396, hx, 390, hx + 12, 396, hx + 16, 412], '#e6c35a'); pline([hx - 10, 400, hx + 10, 400], '#b8942e', 0.8); pline([hx - 12, 406, hx + 12, 406], '#b8942e', 0.8); }
  } else if (age === 3) {
    // low stone wall, barrels, cart wheel
    for (let x = 300; x < 470; x += 14) rect(x, 400 + (x % 28 ? 0 : 1), 13, 9, x % 28 ? '#c9bda0' : '#b9ad90', OUT, 0.6);
    for (let x = 307; x < 470; x += 14) rect(x, 392, 13, 9, '#c2b596', OUT, 0.6);
    for (const bx of [620, 638]) { rrect(bx - 7, 396, 14, 16, 3, '#8a5a30', OUT, 0.8); pline([bx - 7, 400, bx + 7, 400], '#3a3a3a', 1); pline([bx - 7, 408, bx + 7, 408], '#3a3a3a', 1); }
    circ(700, 405, 9, null, OUT, 2.2); circ(700, 405, 9, null, '#7a5028', 1.2);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; pline([700 - Math.cos(a) * 9, 405 - Math.sin(a) * 9, 700 + Math.cos(a) * 9, 405 + Math.sin(a) * 9], '#7a5028', 1); }
  } else if (age === 4) {
    // sandbags, barbed wire, tank traps, craters
    for (let k = 0; k < 7; k++) ell(300 + k * 11, 410, 7, 4, '#b8a57a', OUT, 0.7);
    for (let k = 0; k < 6; k++) ell(305 + k * 11, 403, 7, 4, '#c4b286', OUT, 0.7);
    for (const tx of [560, 610, 760]) {
      pline([tx - 8, 414, tx + 8, 398], OUT, 3.2); pline([tx - 8, 414, tx + 8, 398], '#5a5e62', 2);
      pline([tx + 8, 414, tx - 8, 398], OUT, 3.2); pline([tx + 8, 414, tx - 8, 398], '#6a6e72', 2);
      pline([tx, 416, tx, 396], OUT, 3.2); pline([tx, 416, tx, 396], '#4e5256', 2);
    }
    c.strokeStyle = '#3a3a3a'; c.lineWidth = 0.8;
    c.beginPath(); for (let x = 420; x < 540; x += 4) { const y = 404 + Math.sin(x * 0.7) * 4; if (x === 420) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
    for (let x = 420; x < 540; x += 20) { pline([x, 398, x, 412], '#4a3a2a', 1.4); }
    for (const cx of [380, 690, 880]) { ell(cx, 436, 26, 5, '#4a3c24', OUT, 0.7); ell(cx, 434, 20, 3, '#3a2e1c', null); }
  } else if (age === 5) {
    // glowing crystals and metal debris
    for (const [x, h, col] of [[330, 22, '#4ff0ff'], [345, 14, '#4ff0ff'], [610, 26, '#ff4fd8'], [626, 16, '#ff4fd8'], [800, 20, '#8a7bff']]) {
      poly([x - 5, 414, x - 2, 414 - h, x + 2, 414 - h - 4, x + 5, 414], col, OUT, 0.8);
      poly([x - 1, 414, x, 414 - h + 2, x + 3, 414], 'rgba(255,255,255,0.6)', null);
    }
    for (const [x, w] of [[460, 30], [720, 22]]) { poly([x, 414, x + 4, 404, x + w, 400, x + w + 3, 414], '#6a6e84', OUT, 0.8); pline([x + 6, 408, x + w - 2, 405], '#4ff0ff', 1); }
  }
}

function drawNearLayer(age) {
  const E = AGE_ENV[age];
  const c = G.ctx;
  const W = ENV_X1;
  // trees
  if (age === 5) {
    // alien glowing plants instead of trees
    const r = rng(505);
    for (let x = ENV_X0 + 40; x < W; x += 110 + r() * 60) {
      const h = 60 + r() * 40;
      c.beginPath(); c.moveTo(x - 4, 412); c.quadraticCurveTo(x - 10, 412 - h * 0.6, x + 2, 412 - h); c.lineTo(x + 6, 412 - h); c.quadraticCurveTo(x, 412 - h * 0.6, x + 5, 412); c.closePath();
      fs('#3a2c5a');
      circ(x + 4, 412 - h - 5, 9, '#ff6fd8', OUT, 0.8); circ(x + 4, 412 - h - 5, 4, '#fff0ff', null);
      circ(x - 10, 412 - h * 0.55, 6, '#4ff0ff', OUT, 0.7);
    }
  } else if (age === 4) {
    // shattered stumps and a burnt tree
    drawTrunk(200, 410, 70, 7, 3, [[200, 370, 214, 350, 1.8], [199, 380, 184, 366, 1.6]]);
    drawTrunk(760, 408, 56, 6, -2, [[760, 376, 746, 362, 1.4]]);
    stump(130, 410); stump(860, 408); stump(520, 410);
  } else {
    const canopyCol = age === 3 ? ['#4a9a2e', '#3a7a22'] : [PAL.canopy, PAL.canopyDark];
    drawPine(95, 402, 58, 30, age === 3 ? '#2c6a2a' : PAL.pine2, '#1d6326');
    drawPine(488, 392, 88, 50, age === 1 ? '#2a7a40' : PAL.pine2, '#1d6326');
    drawTrunk(280, 392, 36, 6, 3, [[279, 372, 268, 362, 1.4]]);
    drawCanopy(277, 346, 54, 34, age === 1 ? '#1f7a3e' : PAL.canopy2, '#084a14', 5);
    drawTrunk(620, 396, 70, 7, -3, [[620, 360, 640, 342, 1.8]]);
    drawCanopy(618, 324, 66, 40, age === 3 ? '#6aa83a' : PAL.canopy3, '#0a6a1e', 21);
    drawBigTree(190, 410, 1.0, 11, canopyCol);
    drawBigTree(922, 410, 1.0, 29, canopyCol);
  }
  // bush mounds
  const mounds = [[-70, 80, 36], [-10, 70, 40], [60, 70, 34], [120, 80, 30], [205, 120, 40], [300, 80, 30], [360, 70, 22],
    [405, 90, 34], [455, 120, 50], [545, 80, 36], [600, 80, 30], [640, 110, 38], [720, 70, 28], [770, 90, 34], [840, 90, 30], [900, 110, 40], [980, 60, 30], [1020, 60, 34]];
  let i = 0;
  for (const [mx, mw, mh] of mounds) {
    scallopPath(mx + mw / 2, 408 - mh / 2, mw, mh + 4, Math.max(6, Math.round(mw / 11)), (mx * 13 + 7) | 0, false);
    fs(E.bush[i++ % 3]);
  }
  envProps(age, W);
  const rg = rng(313 + age);
  for (let x = ENV_X0; x < W + 10; x += 34 + rg() * 40) leafClump(x, 406 + rg() * 2, 30 + rg() * 34, 8 + rg() * 9, E.clump[rg() < 0.55 ? 0 : 1], (x * 7) | 0);
  // ground (extends down to the bottom of the taller Plus stage)
  const r = rng(77);
  c.beginPath();
  c.moveTo(ENV_X0 - 5, 403);
  for (let x = ENV_X0 - 5; x <= W + 5; x += 18) c.lineTo(x, 402 + r() * 4);
  c.lineTo(W + 5, 505); c.lineTo(ENV_X0 - 5, 505); c.closePath();
  c.fillStyle = linGrad(0, 403, 0, 505, [[0, E.ground[0]], [0.12, E.ground[1]], [0.3, E.ground[2]], [1, E.ground[3]]]);
  c.fill(); c.strokeStyle = OUT; c.lineWidth = LW; c.stroke();
  for (let k = 0; k < 16; k++) grassPatch(ENV_X0 + rg() * (W - ENV_X0), 416 + rg() * 20, 14 + rg() * 26, E.patch[rg() < 0.5 ? 0 : 1], k * 13 + 5);
  for (let k = 0; k < 16; k++) ell(ENV_X0 + rg() * (W - ENV_X0), 414 + rg() * 24, 2 + rg() * 3, 1.3 + rg() * 1.4, rg() < 0.5 ? '#6d6b5e' : '#5a584c', OUT, 0.6);
  // darker dirt band under the battlefield where the command bar sits
  c.fillStyle = linGrad(0, 432, 0, 505, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.28)']]);
  c.fillRect(ENV_X0 - 5, 432, W - ENV_X0 + 10, 75);
}

// ------------------------------------------------------------------ caches
const Env = {
  cache: {},       // age -> { far, mid, near, scale }
  age: 1, from: 0, fade: 1,
  amb: [], t: 0,
  get(age) {
    let e = this.cache[age];
    if (e && e.scale === scale && e.viewW === viewW) return e;
    // full device resolution when affordable (aligned 1:1 blits), half resolution on very dense screens
    const es = scale <= 2.25 ? scale : scale / 2;
    const span = ENV_X1 - ENV_X0;
    const fw = Math.ceil(40 + viewW + (span - viewW) * PARALLAX.far), mw = Math.ceil(40 + viewW + (span - viewW) * PARALLAX.mid);
    e = {
      scale, viewW, fw, mw,
      // sky, sun, far scenery and the haze band are one opaque image (the sky gradient is vertical, so it
      // can scroll with the far parallax); this keeps the per-frame overdraw low on software renderers
      far: renderTo(fw, 490, es, () => { tr(0, 10); paintSkyLayer(age); ENV_FAR[age](); G.ctx.fillStyle = AGE_ENV[age].haze; G.ctx.fillRect(0, 330, LAYER_W, 110); }),
      mid: renderTo(mw, 230, es, () => { tr(0, -250); ENV_MID[age](); }),  // drawn 22px higher so it peeks over the bushes
      near: renderTo(span, 250, es, () => { tr(-ENV_X0, -255); drawNearLayer(age); }),
    };
    this.cache[age] = e;
    // keep at most two ages in memory
    for (const k of Object.keys(this.cache)) if (+k !== age && +k !== this.from && +k !== this.age) delete this.cache[k];
    return e;
  },
  setAge(age, instant) {
    if (age === this.age) return;
    this.from = instant ? 0 : this.age;
    this.age = age;
    this.fade = instant ? 1 : 0;
    this.makeAmbient();
  },
  tick() { if (this.fade < 1) this.fade = Math.min(1, this.fade + 1 / 80); },
  reset(age) { this.cache = {}; this.age = age; this.from = 0; this.fade = 1; this.makeAmbient(); },
  makeAmbient() {
    const a = this.age;
    const r = rng(900 + a);
    const amb = [];
    const cloudKind = AGE_ENV[a].clouds;
    if (cloudKind !== 'none') for (let i = 0; i < 7; i++) amb.push({ k: 'cloud', x: r() * 1400, y: 40 + r() * 150, s: 0.6 + r() * 0.8, v: 0.05 + r() * 0.08, p: 0.08 + r() * 0.1, tone: cloudKind, seed: i * 17 + a });
    if (a === 1) {
      amb.push({ k: 'smoke', x: 625, y: 250, p: PARALLAX.far });
      for (let i = 0; i < 3; i++) amb.push({ k: 'ptero', x: r() * 1400, y: 90 + r() * 100, v: 0.35 + r() * 0.25, p: 0.35, ph: r() * 6, s: 0.7 + r() * 0.4 });
    } else if (a === 2) {
      amb.push({ k: 'mill', x: 700, y: 326, p: PARALLAX.mid });
      for (let i = 0; i < 5; i++) amb.push({ k: 'bird', x: r() * 1400, y: 80 + r() * 90, v: 0.3 + r() * 0.2, p: 0.3, ph: r() * 6 });
    } else if (a === 3) {
      amb.push({ k: 'ship', x: 930, y: 346, p: PARALLAX.far });
      amb.push({ k: 'balloon', x: 300, y: 150, v: 0.04, p: 0.2 });
      for (let i = 0; i < 4; i++) amb.push({ k: 'bird', x: r() * 1400, y: 110 + r() * 80, v: 0.25 + r() * 0.2, p: 0.3, ph: r() * 6, white: true });
    } else if (a === 4) {
      for (const x of [140, 420, 760, 1080]) amb.push({ k: 'column', x, y: 300 + r() * 40, p: PARALLAX.far });
      amb.push({ k: 'plane', x: r() * 1400, y: 70 + r() * 40, v: 0.9, p: 0.25 });
      amb.push({ k: 'flash', p: PARALLAX.far, t: 0 });
    } else if (a === 5) {
      for (let i = 0; i < 70; i++) amb.push({ k: 'star', x: r() * 1400, y: r() * 200, p: 0.04, ph: r() * 6, s: 0.4 + r() * 1.2 });
      amb.push({ k: 'planet', x: 980, y: 100, p: 0.05 });
      for (let i = 0; i < 6; i++) amb.push({ k: 'car', x: r() * 1400, y: 250 + r() * 70, v: (r() < 0.5 ? 1 : -1) * (1 + r() * 1.5), p: PARALLAX.far, col: r() < 0.5 ? '#4ff0ff' : '#ff4fd8' });
      amb.push({ k: 'ship', x: 200, y: 140, v: 0.12, p: 0.12, fut: true });
    }
    this.amb = amb;
  },
};

function cloudPuff(x, y, s, tone, seed) {
  const r = rng(seed);
  const col = tone === 'grey' ? 'rgba(170,170,165,0.85)' : tone === 'warm' ? 'rgba(255,244,228,0.9)' : 'rgba(255,255,255,0.92)';
  const sh = tone === 'grey' ? 'rgba(120,120,118,0.7)' : 'rgba(200,215,235,0.8)';
  const c = G.ctx;
  c.fillStyle = sh;
  c.beginPath(); c.ellipse(x, y + 6 * s, 46 * s, 10 * s, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = col;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + (i - 2) * 16 * s + r() * 6, y - (i === 2 ? 12 : r() * 8) * s, (14 + r() * 8) * s, 0, Math.PI * 2); c.fill(); }
}

// sprite caches for ambient objects so they are cheap to draw
const AmbSprites = {};
function ambSprite(key, w, h, fn) {
  const k = key + '@' + scale;
  if (!AmbSprites[k]) AmbSprites[k] = renderTo(w, h, scale, fn);
  return AmbSprites[k];
}

function drawAmbient(camX, t, layer) {
  const c = G.ctx;
  const E = Env;
  for (const o of E.amb) {
    const inFar = o.p <= 0.3;
    if ((layer === 'far') !== inFar) continue;
    const sx = (x) => x - camX * o.p;
    switch (o.k) {
      case 'cloud': {
        const x = ((o.x + t * o.v) % 1600) - 200;
        const img = ambSprite('cloud' + o.tone + o.seed, 140, 70, () => cloudPuff(70, 45, 1, o.tone, o.seed));
        c.drawImage(img, sx(x) - 70 * o.s, o.y - 45 * o.s, 140 * o.s, 70 * o.s);
        break;
      }
      case 'star': {
        const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.03 + o.ph));
        c.fillStyle = `rgba(255,255,255,${a})`;
        c.fillRect(sx(o.x), o.y, o.s, o.s);
        break;
      }
      case 'planet': {
        const img = ambSprite('planet', 120, 80, () => {
          circ(60, 40, 26, radGrad(52, 32, 4, 30, [[0, '#ffd0a0'], [0.6, '#e07a6a'], [1, '#7a3a6a']]), null);
          const cc = G.ctx; cc.beginPath(); cc.ellipse(60, 42, 50, 9, -0.25, 0, Math.PI * 2); cc.strokeStyle = 'rgba(255,220,200,0.7)'; cc.lineWidth = 3; cc.stroke();
          circ(18, 18, 7, '#e8e0ff', null);
        });
        c.drawImage(img, sx(o.x) - 60, o.y - 40, 120, 80);
        break;
      }
      case 'smoke': {
        for (let i = 0; i < 9; i++) {
          const k = ((t * 0.004 + i / 9) % 1);
          const px = sx(o.x) + Math.sin(k * 5 + i) * 6 + k * 50, py = o.y - 150 * 0.25 - k * 110 + 115;
          c.fillStyle = `rgba(90,80,90,${0.45 * (1 - k)})`;
          c.beginPath(); c.arc(px, py - 20, 8 + k * 26, 0, Math.PI * 2); c.fill();
        }
        const g = 0.35 + 0.15 * Math.sin(t * 0.05);
        c.fillStyle = `rgba(255,120,40,${g})`; c.beginPath(); c.arc(sx(o.x), o.y + 2, 14, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'column': {
        for (let i = 0; i < 8; i++) {
          const k = ((t * 0.003 + i / 8) % 1);
          const px = sx(o.x) + k * 40 + Math.sin(k * 4 + i) * 5, py = o.y - k * 160;
          c.fillStyle = `rgba(60,58,56,${0.5 * (1 - k)})`;
          c.beginPath(); c.arc(px, py, 7 + k * 22, 0, Math.PI * 2); c.fill();
        }
        c.fillStyle = `rgba(255,140,60,${0.35 + 0.2 * Math.sin(t * 0.2 + o.x)})`;
        c.beginPath(); c.arc(sx(o.x), o.y + 4, 6, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'flash': {
        if ((t % 260) < 6) {
          const fx = sx(200 + ((t / 260) | 0) * 337 % 900);
          c.fillStyle = `rgba(255,230,180,${0.5 - (t % 260) * 0.08})`;
          c.beginPath(); c.arc(fx, 330, 30, 0, Math.PI * 2); c.fill();
        }
        break;
      }
      case 'ptero': {
        const x = ((o.x + t * o.v) % 1600) - 200, y = o.y + Math.sin(t * 0.02 + o.ph) * 10;
        const f = Math.sin(t * 0.12 + o.ph);
        save(); tr(sx(x), y); scl(o.s);
        c.fillStyle = '#5a4a6a';
        c.beginPath(); c.moveTo(-14, 0); c.lineTo(0, -2); c.lineTo(14, 0); c.lineTo(0, 3); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-4, 0); c.lineTo(-18, -10 * f); c.lineTo(-8, 1); c.moveTo(4, 0); c.lineTo(16, -10 * f); c.lineTo(8, 1); c.fill();
        c.beginPath(); c.moveTo(14, 0); c.lineTo(20, -3); c.lineTo(15, 1); c.fill();
        restore();
        break;
      }
      case 'bird': {
        const x = ((o.x + t * o.v) % 1600) - 200, y = o.y + Math.sin(t * 0.03 + o.ph) * 6;
        const f = Math.sin(t * 0.2 + o.ph) * 3;
        c.strokeStyle = o.white ? 'rgba(255,255,255,0.9)' : 'rgba(40,40,50,0.8)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(sx(x) - 5, y - f); c.quadraticCurveTo(sx(x) - 2, y - 2, sx(x), y); c.quadraticCurveTo(sx(x) + 2, y - 2, sx(x) + 5, y - f); c.stroke();
        break;
      }
      case 'mill': {
        save(); tr(sx(o.x), o.y); rot(t * 0.02);
        for (let k = 0; k < 4; k++) { rot(Math.PI / 2); poly([-1.5, 0, -3, -34, 5, -34, 1.5, 0], 'rgba(240,230,210,0.95)', 'rgba(60,40,20,0.6)', 0.6); }
        restore();
        circ(sx(o.x), o.y, 2.5, '#6a4a2a', null);
        break;
      }
      case 'ship': {
        if (o.fut) {
          const x = ((o.x + t * o.v) % 1600) - 200;
          const img = ambSprite('fship', 90, 30, () => {
            poly([4, 16, 30, 8, 80, 10, 88, 16, 80, 22, 30, 24], '#2a2a44', null);
            for (let k = 0; k < 6; k++) circ(36 + k * 7, 16, 1.4, '#ffe04f', null);
            circ(6, 16, 5, 'rgba(79,240,255,0.8)', null);
          });
          c.drawImage(img, sx(x) - 45, o.y - 15, 90, 30);
        } else {
          const bob = Math.sin(t * 0.04) * 1.5;
          const img = ambSprite('ship', 50, 50, () => {
            poly([6, 38, 44, 38, 38, 46, 12, 46], '#6a4a2a', null);
            rect(24, 8, 2, 30, '#5a3a1a', null);
            poly([26, 10, 42, 30, 26, 32], '#f4ecd8', null); poly([24, 12, 10, 30, 24, 32], '#ece2cc', null);
            poly([26, 8, 32, 10, 26, 12], '#c03030', null);
          });
          c.drawImage(img, sx(o.x) - 25, o.y - 40 + bob, 50, 50);
        }
        break;
      }
      case 'balloon': {
        const x = ((o.x + t * o.v) % 1600) - 200, y = o.y + Math.sin(t * 0.01) * 8;
        const img = ambSprite('balloon', 40, 60, () => {
          const cc = G.ctx;
          cc.beginPath(); cc.moveTo(20, 44); cc.bezierCurveTo(2, 30, 2, 4, 20, 4); cc.bezierCurveTo(38, 4, 38, 30, 20, 44); cc.closePath();
          cc.fillStyle = linGrad(4, 0, 36, 0, [[0, '#c03a3a'], [0.5, '#f0d060'], [1, '#c03a3a']]); cc.fill();
          cc.strokeStyle = 'rgba(80,40,20,0.6)'; cc.lineWidth = 0.8; cc.stroke();
          pline([14, 44, 16, 52], 'rgba(60,40,20,0.8)', 0.6); pline([26, 44, 24, 52], 'rgba(60,40,20,0.8)', 0.6);
          rect(15, 52, 10, 6, '#8a5a30', null);
        });
        c.drawImage(img, sx(x) - 20, y - 30, 40, 60);
        break;
      }
      case 'plane': {
        const x = ((o.x + t * o.v) % 2000) - 300;
        c.fillStyle = 'rgba(60,64,70,0.8)';
        save(); tr(sx(x), o.y); scl(0.35);
        c.beginPath(); c.moveTo(-40, 0); c.quadraticCurveTo(0, -6, 40, 0); c.quadraticCurveTo(0, 5, -40, 0); c.fill();
        c.beginPath(); c.moveTo(-6, 0); c.lineTo(8, 0); c.lineTo(-4, 18); c.lineTo(-14, 18); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(-6, 0); c.lineTo(8, 0); c.lineTo(-4, -16); c.lineTo(-14, -16); c.closePath(); c.fill();
        restore();
        break;
      }
      case 'car': {
        let x = (o.x + t * o.v) % 1600; if (x < 0) x += 1600; x -= 200;
        const X = sx(x);
        c.fillStyle = o.col; c.globalAlpha = 0.9;
        c.fillRect(X, o.y, 5, 2);
        c.globalAlpha = 0.35; c.fillRect(X - o.v * 12, o.y, o.v * 12, 1.5);
        c.globalAlpha = 1;
        break;
      }
    }
  }
}

function paintSkyLayer(age) {
  const E = AGE_ENV[age];
  const c = G.ctx;
  c.fillStyle = linGrad(0, 0, 0, 430, E.sky);
  c.fillRect(0, -10, LAYER_W, 490);
  const s = E.sun, sx = 890 * s.x + 20;
  c.fillStyle = radGrad(sx, s.y, 0, s.r * 4, [[0, `rgba(${s.col},0.9)`], [0.25, `rgba(${s.col},0.5)`], [1, `rgba(${s.col},0)`]]);
  c.fillRect(sx - s.r * 4, s.y - s.r * 4, s.r * 8, s.r * 8);
  c.fillStyle = `rgba(${s.col},1)`;
  c.beginPath(); c.arc(sx, s.y, s.r, 0, Math.PI * 2); c.fill();
}

function drawEnvLayers(age, camX, t, a) {
  const c = G.ctx;
  const e = Env.get(age);
  c.globalAlpha = a;
  const fx = -((camX - ENV_X0) * PARALLAX.far) - 20;
  blitAt(e.far, fx, -10, e.fw, 490);
  drawAmbient(camX, t, 'far');
  const mx = -((camX - ENV_X0) * PARALLAX.mid) - 20;
  blitAt(e.mid, mx, 228, e.mw, 230);
  drawAmbient(camX, t, 'mid');
  c.globalAlpha = 1;
}

// Draw the whole environment for the current camera (world near layer is drawn by the caller in world space)
function drawEnvironment(camX, t) {
  const E = Env;
  if (E.from && E.fade < 1) {
    drawEnvLayers(E.from, camX, t, 1);
    drawEnvLayers(E.age, camX, t, E.fade);
  } else drawEnvLayers(E.age, camX, t, 1);
}

function drawNear(camX) {
  const E = Env;
  const c = G.ctx;
  const draw = (age, a) => {
    const e = Env.get(age);
    c.globalAlpha = a;
    blitAt(e.near, ENV_X0, 255, ENV_X1 - ENV_X0, 250);
    c.globalAlpha = 1;
  };
  if (E.from && E.fade < 1) { draw(E.from, 1); draw(E.age, E.fade); }
  else draw(E.age, 1);
}
