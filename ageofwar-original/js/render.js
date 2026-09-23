'use strict';
// Canvas renderer for the original vector art: shapes (solid, linear / radial gradient and bitmap
// fills, strokes), morph shapes, static and dynamic text with the embedded fonts, buttons, masks,
// additive blending, colour transforms / colour matrices, and drop shadow / glow filters.
// Frequently drawn objects (units, turrets...) can be cached as bitmaps per animation frame.

if (typeof makeCanvas === 'undefined') {
  // eslint-disable-next-line no-var
  var makeCanvas = function (w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
}

const R = {
  bitmaps: new Map(),      // bitmap id -> ImageBitmap / HTMLImageElement
  hitCtx: null,
  gradCache: new Map(),
  cacheBytes: 0, cacheBudget: 72 * 1024 * 1024, cache: new Map(), spent: 0, frameBudget: 10,
};

// ------------------------------------------------------------------ math
function mMul(p, c) {
  return [p[0] * c[0] + p[2] * c[1], p[1] * c[0] + p[3] * c[1], p[0] * c[2] + p[2] * c[3], p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4], p[1] * c[4] + p[3] * c[5] + p[5]];
}
function mInv(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
function mApply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
const IDENT = [1, 0, 0, 1, 0, 0];

// ------------------------------------------------------------------ colour transforms
// A colour transform chain: list of steps applied innermost first. Each step is either a Flash
// colour transform [rm, gm, bm, am, ra, ga, ba, aa] or {cm: 4x5 colour matrix}.
function ctCompose(parent, cx, cm) {
  if (!cx && !cm) return parent;
  const steps = [];
  if (cx && !(cx[0] === 1 && cx[1] === 1 && cx[2] === 1 && cx[3] === 1 && !cx[4] && !cx[5] && !cx[6] && !cx[7])) steps.push(cx);
  if (cm) steps.push({ cm });
  if (!steps.length) return parent;
  const all = parent ? steps.concat(parent.steps) : steps;
  return { steps: all, key: all.map(s => s.cm ? 'm' + s.cm.join(',') : s.join(',')).join('|') };
}
function ctApply(ct, c) {
  let r = c[0], g = c[1], b = c[2], a = c[3];
  if (ct) for (const s of ct.steps) {
    if (s.cm) {
      const m = s.cm;
      const nr = m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4];
      const ng = m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9];
      const nb = m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14];
      const na = m[15] * r + m[16] * g + m[17] * b + m[18] * a + m[19];
      r = nr; g = ng; b = nb; a = na;
    } else {
      r = r * s[0] + s[4]; g = g * s[1] + s[5]; b = b * s[2] + s[6]; a = a * s[3] + s[7];
    }
    r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b; a = a < 0 ? 0 : a > 255 ? 255 : a;
  }
  return [r, g, b, a];
}
function cssColor(c) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(c[3] / 255).toFixed(3)})`; }
function ctAlpha(ct) { return ct ? ctApply(ct, [0, 0, 0, 255])[3] / 255 : 1; }

// ------------------------------------------------------------------ paths
function toPath2D(cmds) {
  const p = new Path2D();
  for (let i = 0; i < cmds.length;) {
    const op = cmds[i];
    if (op === 0) { p.moveTo(cmds[i + 1], cmds[i + 2]); i += 3; }
    else if (op === 1) { p.lineTo(cmds[i + 1], cmds[i + 2]); i += 3; }
    else { p.quadraticCurveTo(cmds[i + 1], cmds[i + 2], cmds[i + 3], cmds[i + 4]); i += 5; }
  }
  return p;
}
function pathOf(item) { return item._p || (item._p = toPath2D(item.path)); }

// ------------------------------------------------------------------ fills
function setMatrix(ctx, m) { ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }

function fillStyleFor(ctx, st, ct) {
  if (st.kind === 0) {
    const key = ct ? ct.key : '';
    if (st._ck !== key) { st._ck = key; st._cs = cssColor(ctApply(ct, st.color)); }
    return st._cs;
  }
  return null;
}

// Linear gradients are expressed in shape space exactly (the gradient value is a linear function of
// the shape coordinates), so no clipping is needed.
function linearGradient(ctx, st, ct) {
  const key = 'l' + (ct ? ct.key : '');
  if (st._gk === key && st._g) return st._g;
  const inv = mInv(st.matrix);
  // t(p) = (gx(p) + 819.2) / 1638.4 where gx = inv row 0
  const ax = inv[0] / 1638.4, ay = inv[2] / 1638.4, b0 = (inv[4] + 819.2) / 1638.4;
  const n2 = ax * ax + ay * ay || 1e-12;
  const x0 = -b0 * ax / n2, y0 = -b0 * ay / n2;
  const g = ctx.createLinearGradient(x0, y0, x0 + ax / n2, y0 + ay / n2);
  for (const [r, c] of st.stops) g.addColorStop(Math.min(1, Math.max(0, r)), cssColor(ctApply(ct, c)));
  st._gk = key; st._g = g;
  return g;
}
function radialGradient(ctx, st, ct) {
  const key = 'r' + (ct ? ct.key : '');
  if (st._gk === key && st._g) return st._g;
  const fx = st.kind === 0x13 ? (st.focal || 0) * 819.2 : 0;
  const g = ctx.createRadialGradient(fx, 0, 0, 0, 0, 819.2);
  for (const [r, c] of st.stops) g.addColorStop(Math.min(1, Math.max(0, r)), cssColor(ctApply(ct, c)));
  st._gk = key; st._g = g;
  return g;
}

function drawShapeDef(ctx, def, m, ct) {
  for (const g of def.groups) {
    for (const f of g.fills) {
      const st = f.style;
      if (st.kind === 0) {
        setMatrix(ctx, m); ctx.fillStyle = fillStyleFor(ctx, st, ct); ctx.fill(pathOf(f));
      } else if (st.kind === 0x10) {
        setMatrix(ctx, m); ctx.fillStyle = linearGradient(ctx, st, ct); ctx.fill(pathOf(f));
      } else if (st.kind === 0x12 || st.kind === 0x13) {
        if (!f._pg) { f._pg = new Path2D(); f._pg.addPath(pathOf(f), new DOMMatrix(mInv(st.matrix))); }
        setMatrix(ctx, mMul(m, st.matrix)); ctx.fillStyle = radialGradient(ctx, st, ct); ctx.fill(f._pg);
      } else if (st.kind >= 0x40) {
        const img = R.bitmaps.get(st.bitmap);
        if (!img) continue;
        const bm = st.matrix;
        const bmx = [bm[0] / 20, bm[1] / 20, bm[2] / 20, bm[3] / 20, bm[4], bm[5]];
        ctx.save();
        setMatrix(ctx, m); ctx.clip(pathOf(f));
        setMatrix(ctx, mMul(m, bmx));
        ctx.imageSmoothingEnabled = st.smooth;
        const a = ctAlpha(ct); if (a < 1) ctx.globalAlpha *= a;
        ctx.drawImage(img, 0, 0);
        ctx.restore();
      }
    }
    for (const l of g.lines) {
      const st = l.style;
      setMatrix(ctx, m);
      const sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      ctx.lineWidth = Math.max(st.width, 1 / sc);
      ctx.lineCap = st.startCap === 1 ? 'butt' : st.startCap === 2 ? 'square' : 'round';
      ctx.lineJoin = st.join === 1 ? 'bevel' : st.join === 2 ? 'miter' : 'round';
      if (st.miter) ctx.miterLimit = st.miter;
      const key = ct ? ct.key : '';
      if (st._ck !== key) { st._ck = key; st._cs = cssColor(ctApply(ct, st.color)); }
      ctx.strokeStyle = st._cs;
      ctx.stroke(pathOf(l));
    }
  }
}

// ------------------------------------------------------------------ text
function fontEm(font) { return 1024 * (font.emScale || 1) / 20; }
function glyphPath(font, i) {
  if (!font._gp) font._gp = [];
  return font._gp[i] || (font._gp[i] = toPath2D(font.glyphs[i]));
}

function drawStaticText(ctx, def, m, ct) {
  const tm = mMul(m, def.matrix);
  for (const run of def.runs) {
    const font = Flash.swf.chars.get(run.font);
    if (!font || !font.glyphs.length) continue;
    const s = run.height / fontEm(font);
    ctx.fillStyle = cssColor(ctApply(ct, run.color));
    for (const [gi, gx] of run.glyphs) {
      if (gi >= font.glyphs.length) continue;
      setMatrix(ctx, mMul(tm, [s, 0, 0, s, gx, run.y]));
      ctx.fill(glyphPath(font, gi));
    }
  }
}

const DEVICE_FONTS = { 'Arial': 'Arial, "Helvetica Neue", Helvetica, sans-serif', '_sans': 'Arial, sans-serif', 'Times New Roman': '"Times New Roman", serif' };
function editTextValue(obj) {
  const def = obj.def;
  if (def.variable && obj.parent) {
    const p = obj.parent;
    const v = AVM.getVar({ scope: [p], target: p, orig: p, thisObj: p }, def.variable);
    if (v !== undefined) return toStr(v);
  }
  return obj.text == null ? '' : String(obj.text);
}
function drawEditText(ctx, obj, m, ct) {
  const def = obj.def;
  const str = editTextValue(obj);
  if (!str) return;
  const font = def.font ? Flash.swf.chars.get(def.font) : null;
  const h = def.height;
  const color = cssColor(ctApply(ct, obj.color || def.color));
  const em = font && font.glyphs.length ? fontEm(font) : 0;
  const s = em ? h / em : 0;
  const asc = font && font.ascent ? font.ascent * (em ? s : h / 1024) : h * 0.905;
  const desc = font && font.descent ? font.descent * (em ? s : h / 1024) : h * 0.212;
  const lead = def.leading || 0;
  const family = (font && (DEVICE_FONTS[font.name] || `"${font.name}", Arial, sans-serif`)) || 'Arial, sans-serif';
  const bold = font && (font.bold || /Bold/.test(font.fullName || '')) ? 'bold ' : '';
  const cssFont = `${bold}${h}px ${family}`;
  // measure a line using embedded advances where the glyph exists
  const glyphOf = (ch) => (em && font.map.has(ch.charCodeAt(0)) ? font.map.get(ch.charCodeAt(0)) : -1);
  ctx.font = cssFont;
  const adv = (ch) => { const gi = glyphOf(ch); if (gi >= 0 && font.advances) return font.advances[gi] * s; return ctx.measureText(ch).width; };
  const width = (line) => { let w = 0; for (const ch of line) w += adv(ch); return w; };
  const bw = def.bounds.x1 - def.bounds.x0 - 4;
  let lines = [];
  for (const para of str.split(/\r\n|\r|\n/)) {
    if (!def.wordWrap) { lines.push(para); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && width(test.trimEnd()) > bw) { lines.push(line.trimEnd()); line = word.trimStart(); } else line = test;
    }
    lines.push(line);
  }
  if (!def.multiline && !def.wordWrap) lines = [lines.join(' ')];
  let y = def.bounds.y0 + 2 + asc;
  for (const line of lines) {
    const w = width(line);
    let x = def.bounds.x0 + 2 + (def.leftMargin || 0);
    if (def.align === 1) x = def.bounds.x1 - 2 - w - (def.rightMargin || 0);
    else if (def.align === 2) x = (def.bounds.x0 + def.bounds.x1) / 2 - w / 2;
    for (const ch of line) {
      const gi = glyphOf(ch);
      if (gi >= 0) {
        setMatrix(ctx, mMul(m, [s, 0, 0, s, x, y]));
        ctx.fillStyle = color; ctx.fill(glyphPath(font, gi));
      } else if (ch.trim()) {
        setMatrix(ctx, m);
        ctx.font = cssFont; ctx.fillStyle = color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
        ctx.fillText(ch, x, y);
      }
      x += adv(ch);
    }
    y += asc + desc + lead;
  }
}

// ------------------------------------------------------------------ display list
function sortedChildren(clip) {
  const list = [...clip.children.values()];
  list.sort((a, b) => a.depth - b.depth);
  return list;
}

function colorMatrixOf(obj) {
  if (!obj.filters) return null;
  for (const f of obj.filters) if (f.type === 6) return f.matrix;
  return null;
}

// Draw one display object. m: full matrix to device pixels; ct: colour transform chain.
function drawObj(ctx, obj, m, ct, opts) {
  if (!obj.visible) return;
  const om = mMul(m, obj.matrix);
  const oct = ctCompose(ct, obj.cx, colorMatrixOf(obj));
  if (oct && ctAlpha(oct) <= 0.002) return;
  if (obj.filters && !(opts && opts.noFilters) && obj.filters.some(f => (f.type === 0 || f.type === 2) && !f.inner)) { drawFiltered(ctx, obj, m, ct, om, oct, opts); return; }
  const add = obj.blend === 8;
  if (add) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; }
  drawContent(ctx, obj, om, oct, opts);
  if (add) ctx.restore();
}

function drawContent(ctx, obj, om, oct, opts) {
  const def = obj.def;
  switch (def.type) {
    case 'shape': if (!(opts && opts.inCache) && drawCachedStatic(ctx, def, om, oct, drawShapeDef)) break; drawShapeDef(ctx, def, om, oct); break;
    case 'morph': drawShapeDef(ctx, SWF.morphAt(def, obj.ratio / 65535), om, oct); break;
    case 'text': if (!(opts && opts.inCache) && drawCachedStatic(ctx, def, om, oct, drawStaticText)) break; drawStaticText(ctx, def, om, oct); break;
    case 'edittext': drawEditText(ctx, obj, om, oct); break;
    case 'button': for (const c of obj.stateList(obj.state)) drawObj(ctx, c, om, oct, opts); break;
    case 'sprite': {
      if (obj.cacheKey && opts && opts.cache !== false && !opts.inCache) { drawCachedClip(ctx, obj, om, oct, opts); break; }
      drawChildren(ctx, obj, om, oct, opts);
      break;
    }
  }
}

function drawChildren(ctx, clip, om, oct, opts) {
  const list = sortedChildren(clip);
  let maskEnd = -1;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (maskEnd >= 0 && c.depth > maskEnd) { ctx.restore(); maskEnd = -1; }
    if (c.clipDepth) {
      if (maskEnd >= 0) ctx.restore();
      ctx.save();
      const p = new Path2D();
      clipPathOf(c, om, p);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clip(p);
      maskEnd = c.clipDepth;
      continue;
    }
    drawObj(ctx, c, om, oct, opts);
  }
  if (maskEnd >= 0) ctx.restore();
}

// collect the fill outline of a mask object in device space
function clipPathOf(obj, m, out) {
  const om = mMul(m, obj.matrix);
  const def = obj.def;
  const add = (shape) => { for (const g of shape.groups) for (const f of g.fills) out.addPath(pathOf(f), new DOMMatrix(om)); };
  if (def.type === 'shape') add(def);
  else if (def.type === 'morph') add(SWF.morphAt(def, obj.ratio / 65535));
  else if (def.type === 'sprite') for (const c of sortedChildren(obj)) clipPathOf(c, om, out);
  else if (def.type === 'text') {
    const tm = mMul(om, def.matrix);
    for (const run of def.runs) { const font = Flash.swf.chars.get(run.font); if (!font) continue; const s = run.height / fontEm(font); for (const [gi, gx] of run.glyphs) out.addPath(glyphPath(font, gi), new DOMMatrix(mMul(tm, [s, 0, 0, s, gx, run.y]))); }
  }
}

// ------------------------------------------------------------------ bounds (device space)
function boundsOf(obj, m, acc) {
  acc = acc || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  if (!obj.visible) return acc;
  const om = mMul(m, obj.matrix);
  const def = obj.def;
  const addRect = (b, mm) => {
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      const p = mApply(mm, x, y);
      if (p[0] < acc.x0) acc.x0 = p[0]; if (p[0] > acc.x1) acc.x1 = p[0];
      if (p[1] < acc.y0) acc.y0 = p[1]; if (p[1] > acc.y1) acc.y1 = p[1];
    }
  };
  // (static text bounds are already in character space, after the text matrix)
  if (def.type === 'shape' || def.type === 'morph' || def.type === 'edittext' || def.type === 'text') addRect(def.bounds, om);
  else if (def.type === 'button') for (const c of obj.stateList(obj.state)) boundsOf(c, om, acc);
  else if (def.type === 'sprite') {
    const list = sortedChildren(obj);
    for (const c of list) { if (c.clipDepth) continue; boundsOf(c, om, acc); }
  }
  return acc;
}

// ------------------------------------------------------------------ filters (glow / drop shadow)
function drawFiltered(ctx, obj, m, ct, om, oct, opts) {
  const b = boundsOf(obj, m);
  if (!isFinite(b.x0)) return;
  const pad = 24;
  const x0 = Math.floor(b.x0) - pad, y0 = Math.floor(b.y0) - pad;
  const w = Math.ceil(b.x1 - b.x0) + pad * 2, h = Math.ceil(b.y1 - b.y0) + pad * 2;
  if (w * h > 4e6 || w <= 0 || h <= 0) { drawContent(ctx, obj, om, oct, opts); return; }
  const cv = makeCanvas(w, h);
  const c2 = cv.getContext('2d');
  const o2 = Object.assign({}, opts, { noFilters: true });
  drawObj(c2, obj, mMul([1, 0, 0, 1, -x0, -y0], m), ct, o2);
  c2.setTransform(1, 0, 0, 1, 0, 0);
  const sc = Math.sqrt(Math.abs(om[0] * om[3] - om[1] * om[2])) || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const f of obj.filters) {
    if (f.inner || f.knockout) continue;
    if (f.type !== 0 && f.type !== 2) continue;
    const dist = f.type === 0 ? (f.distance || 0) * sc : 0;
    ctx.shadowColor = cssColor(f.color);
    ctx.shadowBlur = Math.max(f.blurX, f.blurY) * sc * 0.9;
    ctx.shadowOffsetX = Math.cos(f.angle || 0) * dist;
    ctx.shadowOffsetY = Math.sin(f.angle || 0) * dist;
    const reps = Math.min(4, Math.max(1, Math.round(f.strength || 1)));
    // draw only the shadow: move the image far away and offset the shadow back
    const far = 10000;
    ctx.shadowOffsetX += far;
    for (let i = 0; i < reps; i++) ctx.drawImage(cv, x0 - far, y0);
  }
  ctx.restore();
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (obj.blend === 8) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(cv, x0, y0);
  ctx.restore();
}

// ------------------------------------------------------------------ bitmap cache for clips
// A clip with a cacheKey() function is drawn from a bitmap of its current look. The bitmap is made
// in the clip's local space at the current device scale (translation and mirroring are applied
// when blitting), so every animation frame is painted once.
function drawCachedClip(ctx, obj, om, oct, opts) {
  const sx = Math.hypot(om[0], om[1]), sy = Math.hypot(om[2], om[3]);
  const rotated = Math.abs(om[1]) > 1e-6 || Math.abs(om[2]) > 1e-6;
  if (rotated) { drawChildren(ctx, obj, om, oct, opts); return; }
  const flip = om[0] < 0;
  const s = Math.round(sx * 64) / 64;
  const key = obj.def.id + '@' + s + ':' + (Math.round(sy / sx * 64) / 64) + ':' + obj.cacheKey() + (oct ? '#' + oct.key : '');
  let e = R.cache.get(key);
  if (e) { R.cache.delete(key); R.cache.set(key, e); }
  else {
    if (R.spent > R.frameBudget) { drawChildren(ctx, obj, om, oct, opts); return; }
    const t0 = performance.now();
    const lm = [s, 0, 0, sy / sx * s, 0, 0];
    const b = boundsOf(obj, mMul(lm, mInv(obj.matrix)));
    if (!isFinite(b.x0)) return;
    const x0 = Math.floor(b.x0) - 2, y0 = Math.floor(b.y0) - 2;
    const w = Math.ceil(b.x1) - x0 + 2, h = Math.ceil(b.y1) - y0 + 2;
    const cv = makeCanvas(w, h);
    const c2 = cv.getContext('2d');
    drawChildren(c2, obj, mMul([1, 0, 0, 1, -x0, -y0], lm), oct, Object.assign({}, opts, { inCache: true }));
    e = { cv, x0, y0 };
    R.cache.set(key, e);
    R.cacheBytes += w * h * 4;
    while (R.cacheBytes > R.cacheBudget && R.cache.size > 1) {
      const [k, old] = R.cache.entries().next().value;
      R.cache.delete(k); R.cacheBytes -= old.cv.width * old.cv.height * 4;
    }
    R.spent += performance.now() - t0;
  }
  ctx.save();
  if (flip) { ctx.setTransform(-1, 0, 0, 1, Math.round(om[4]), Math.round(om[5])); }
  else ctx.setTransform(1, 0, 0, 1, Math.round(om[4]), Math.round(om[5]));
  ctx.drawImage(e.cv, e.x0, e.y0);
  ctx.restore();
}
function clearRenderCache() { R.cache.clear(); R.cacheBytes = 0; }

// Shapes and static texts never change, so an unrotated one is painted once per scale and colour
// transform and then copied. Rotated or skewed ones (animated body parts) are drawn as vectors.
// a colour transform chain that only fades (no tint): returns its alpha, else -1
function ctOnlyAlpha(ct) {
  if (!ct) return 1;
  let a = 1;
  for (const s of ct.steps) {
    if (s.cm || s[0] !== 1 || s[1] !== 1 || s[2] !== 1 || s[4] || s[5] || s[6] || s[7]) return -1;
    a *= s[3];
  }
  return a > 1 ? -1 : a;
}

function drawCachedStatic(ctx, def, om, oct, paint) {
  if (Math.abs(om[1]) > 1e-6 || Math.abs(om[2]) > 1e-6) return false;
  const fade = ctOnlyAlpha(oct);
  if (fade >= 0) oct = null;
  const flipX = om[0] < 0, flipY = om[3] < 0;
  const sx = Math.abs(om[0]), sy = Math.abs(om[3]);
  const b = def.bounds;
  const w = (b.x1 - b.x0) * sx, h = (b.y1 - b.y0) * sy;
  if (w * h > 6e6 || w < 1 || h < 1) return false;
  const key = (def.type === 'text' ? 't' : 's') + def.id + '@' + sx.toFixed(3) + ',' + sy.toFixed(3) + (oct ? '#' + oct.key : '');
  let e = R.cache.get(key);
  if (e) { R.cache.delete(key); R.cache.set(key, e); }
  else {
    if (R.spent > R.frameBudget) return false;
    const t0 = performance.now();
    const x0 = Math.floor(b.x0 * sx) - 2, y0 = Math.floor(b.y0 * sy) - 2;
    const cv = makeCanvas(Math.ceil(w) + 4, Math.ceil(h) + 4);
    const c2 = cv.getContext('2d');
    c2.lineJoin = 'round'; c2.lineCap = 'round';
    paint(c2, def, [sx, 0, 0, sy, -x0, -y0], oct);
    e = { cv, x0, y0 };
    R.cache.set(key, e);
    R.cacheBytes += cv.width * cv.height * 4;
    while (R.cacheBytes > R.cacheBudget && R.cache.size > 1) {
      const [k, old] = R.cache.entries().next().value;
      R.cache.delete(k); R.cacheBytes -= old.cv.width * old.cv.height * 4;
    }
    R.spent += performance.now() - t0;
  }
  ctx.save();
  ctx.setTransform(flipX ? -1 : 1, 0, 0, flipY ? -1 : 1, Math.round(om[4]), Math.round(om[5]));
  if (fade >= 0 && fade < 1) ctx.globalAlpha *= fade;
  ctx.drawImage(e.cv, e.x0, e.y0);
  ctx.restore();
  return true;
}

// signature of a clip's current look (frames of nested clips, visibility, code-set transforms)
function clipSig(obj) {
  let s = obj.frame + '';
  for (const c of obj.children.values()) {
    if (!c.visible) { s += ',h' + c.depth; continue; }
    if (c instanceof Clip) s += ',' + c.depth + ':' + c.def.id + '(' + clipSig(c) + ')';
    else if (c.def.type === 'morph') s += ',' + c.depth + 'r' + c.ratio;
    if (c.detached) s += '[' + c.matrix.map(v => v.toFixed(2)).join(' ') + ']';
  }
  return s;
}

// ------------------------------------------------------------------ hit testing
function hitObj(obj, m, x, y) {
  if (!obj.visible) return false;
  const om = mMul(m, obj.matrix);
  const def = obj.def;
  if (!R.hitCtx) R.hitCtx = makeCanvas(1, 1).getContext('2d');
  const test = (shape, mm) => {
    const p = mApply(mInv(mm), x, y);
    for (const g of shape.groups) {
      for (const f of g.fills) if (R.hitCtx.isPointInPath(pathOf(f), p[0], p[1])) return true;
      for (const l of g.lines) { R.hitCtx.lineWidth = Math.max(l.style.width, 2); if (R.hitCtx.isPointInStroke(pathOf(l), p[0], p[1])) return true; }
    }
    return false;
  };
  if (def.type === 'shape') return test(def, om);
  if (def.type === 'morph') return test(SWF.morphAt(def, obj.ratio / 65535), om);
  if (def.type === 'text' || def.type === 'edittext') {
    const b = def.bounds;
    const p = mApply(mInv(om), x, y);
    return p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1;
  }
  if (def.type === 'button') { for (const c of obj.stateList('hit')) if (hitObj(c, om, x, y)) return true; return false; }
  if (def.type === 'sprite') { for (const c of sortedChildren(obj)) if (!c.clipDepth && hitObj(c, om, x, y)) return true; }
  return false;
}

// find buttons under a point (topmost first): returns [{btn, m}]
function buttonsAt(obj, m, x, y, out) {
  out = out || [];
  if (!obj.visible) return out;
  const om = mMul(m, obj.matrix);
  if (obj.def.type === 'button') {
    if (obj.enabled !== false && hitObj(obj, m, x, y)) out.push(obj);
    return out;
  }
  if (obj.def.type === 'sprite') {
    const list = sortedChildren(obj);
    for (let i = list.length - 1; i >= 0; i--) buttonsAt(list[i], om, x, y, out);
  }
  return out;
}

// ------------------------------------------------------------------ assets
async function decodeBitmaps(swf) {
  const jobs = [];
  for (const c of swf.chars.values()) {
    if (c.type !== 'bitmap' || !c.jpeg) continue;
    const blob = new Blob([c.jpeg], { type: 'image/jpeg' });
    jobs.push((typeof createImageBitmap === 'function' ? createImageBitmap(blob) : new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = URL.createObjectURL(blob); }))
      .then(img => R.bitmaps.set(c.id, img)).catch(() => {}));
  }
  await Promise.all(jobs);
}

if (typeof module !== 'undefined') module.exports = { R, mMul, mInv, drawObj };
