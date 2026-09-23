'use strict';
// Bitmap cache for unit animation frames. Drawing a unit as vector shapes every frame is too slow
// on phones, so each frame of each animation clip is painted once at screen resolution and then
// blitted. Clips are sampled at 20 frames per second of the original 40, like the Flash tweens
// they replace. Least recently used frames are dropped when the memory budget is exceeded.

const Sprites = {
  map: new Map(),
  bounds: new Map(),
  bytes: 0,
  budget: 64 * 1024 * 1024,
  scale: 0,
  spent: 0,           // ms spent creating sprites during the current frame
  frameBudget: 8,
  scratch: null,

  reset(s) { this.map.clear(); this.bounds.clear(); this.bytes = 0; this.scale = s; },
  beginFrame() { this.spent = 0; },
};

function spriteFrames(len) { return Math.max(1, Math.min(24, Math.ceil(len / 2))); }

// the state passed to drawUnit for frame q of a clip
function spriteState(id, anim, v, q, n, len, hit) {
  const f = anim === 'die' ? Math.min(len, (q + 1) * len / n) : (q + 0.5) * len / n;
  return { anim, f, len, hit, v, t: f / len * (Math.PI * 2 / 0.15) };
}

// Measure the painted area of a whole clip once (at low resolution) so every frame canvas is tight.
function clipBounds(id, anim, v, n, len, hit) {
  const key = id + '|' + anim + '|' + v;
  let b = Sprites.bounds.get(key);
  if (b) return b;
  const LS = 0.5, X0 = 200, Y0 = 230, W = 400, H = 270;
  if (!Sprites.scratch) {
    Sprites.scratch = makeCanvas(W * LS, H * LS);
    Sprites.scratchCtx = Sprites.scratch.getContext('2d', { willReadFrequently: true });
  }
  const cx = Sprites.scratchCtx, cw = Sprites.scratch.width, ch = Sprites.scratch.height;
  let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
  const prev = G.ctx;
  G.set(cx);
  for (let q = 0; q < n; q++) {
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, cw, ch);
    cx.setTransform(LS, 0, 0, LS, X0 * LS, Y0 * LS);
    cx.lineJoin = 'round'; cx.lineCap = 'round';
    drawUnit(id, spriteState(id, anim, v, q, n, len, hit));
    const d = cx.getImageData(0, 0, cw, ch).data;
    for (let y = 0; y < ch; y++) {
      const row = y * cw * 4;
      for (let x = 0; x < cw; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
  }
  G.set(prev);
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  const pad = 3;
  b = { x: x0 / LS - X0 - pad, y: y0 / LS - Y0 - pad, w: (x1 - x0 + 1) / LS + pad * 2, h: (y1 - y0 + 1) / LS + pad * 2 };
  Sprites.bounds.set(key, b);
  return b;
}

function getSprite(id, anim, v, q, n, len, hit) {
  const key = id + '|' + anim + '|' + v + '|' + q;
  let spr = Sprites.map.get(key);
  if (spr) { Sprites.map.delete(key); Sprites.map.set(key, spr); return spr; }
  if (Sprites.spent > Sprites.frameBudget) return null;   // too much work this frame: draw vectors instead
  const t0 = performance.now();
  const b = clipBounds(id, anim, v, n, len, hit);
  const img = renderTo(b.w, b.h, scale, () => { tr(-b.x, -b.y); drawUnit(id, spriteState(id, anim, v, q, n, len, hit)); });
  spr = { img, x: b.x, y: b.y, w: img.width / scale, h: img.height / scale };
  Sprites.map.set(key, spr);
  Sprites.bytes += img.width * img.height * 4;
  while (Sprites.bytes > Sprites.budget && Sprites.map.size > 1) {
    const [k, old] = Sprites.map.entries().next().value;
    Sprites.map.delete(k);
    Sprites.bytes -= old.img.width * old.img.height * 4;
  }
  Sprites.spent += performance.now() - t0;
  return spr;
}

// Draw a unit at the current origin (facing right) using the bitmap cache.
function blitUnit(id, anim, f, len, hit, v) {
  if (Sprites.scale !== scale) Sprites.reset(scale);
  const n = spriteFrames(len);
  let q = anim === 'die' ? Math.min(n - 1, Math.floor(f / len * n)) : Math.floor(((f / len) % 1 + 1) % 1 * n) % n;
  if (q < 0) q = 0;
  const spr = getSprite(id, anim, anim === 'attack' ? v : 0, q, n, len, hit);
  if (spr) blitAt(spr.img, spr.x, spr.y, spr.w, spr.h);
  else drawUnit(id, { anim, f, len, hit, v, t: f / len * (Math.PI * 2 / 0.15) });
}
