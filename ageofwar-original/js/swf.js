'use strict';
// A small reader for the original Age of War SWF file. It turns the Flash tags we need into plain
// objects: vector shapes and morph shapes (as fill / line paths), sprites with their timelines,
// buttons, fonts, static and dynamic texts, the JPEG, sounds, frame labels and exported names.
// Nothing from the file is copied into this project; the file is read when the game starts.

class SwfReader {
  constructor(u8, pos = 0) { this.b = u8; this.p = pos; this.bit = 0; this.bits = 0; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  align() { this.bits = 0; }
  u8() { this.align(); return this.b[this.p++]; }
  u16() { this.align(); const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  s16() { this.align(); const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
  u32() { this.align(); const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  fixed8() { this.align(); const v = this.dv.getInt16(this.p, true) / 256; this.p += 2; return v; }
  fixed() { this.align(); const v = this.dv.getInt32(this.p, true) / 65536; this.p += 4; return v; }
  f32() { this.align(); const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
  ub(n) {
    let v = 0;
    while (n > 0) {
      if (this.bits === 0) { this.bit = this.b[this.p++]; this.bits = 8; }
      const take = Math.min(n, this.bits);
      v = (v << take) | ((this.bit >> (this.bits - take)) & ((1 << take) - 1));
      this.bits -= take; n -= take;
    }
    return v >>> 0;
  }
  sb(n) { if (!n) return 0; const v = this.ub(n); return v & (1 << (n - 1)) ? v - 2 ** n : v; }
  fb(n) { return this.sb(n) / 65536; }
  str() { this.align(); let e = this.p; while (this.b[e]) e++; let s = ''; for (let i = this.p; i < e; i++) s += String.fromCharCode(this.b[i]); this.p = e + 1; try { return decodeURIComponent(escape(s)); } catch (err) { return s; } }
  rect() { const n = this.ub(5); const r = { x0: this.sb(n) / 20, x1: this.sb(n) / 20, y0: this.sb(n) / 20, y1: this.sb(n) / 20 }; this.align(); return r; }
  // matrix as [a, b, c, d, tx, ty] in pixels (canvas setTransform order)
  matrix() {
    let a = 1, d = 1, b = 0, c = 0;
    if (this.ub(1)) { const n = this.ub(5); a = this.fb(n); d = this.fb(n); }
    if (this.ub(1)) { const n = this.ub(5); b = this.fb(n); c = this.fb(n); }
    const n = this.ub(5); const tx = this.sb(n) / 20, ty = this.sb(n) / 20;
    this.align();
    return [a, b, c, d, tx, ty];
  }
  rgb() { return [this.u8(), this.u8(), this.u8(), 255]; }
  rgba() { return [this.u8(), this.u8(), this.u8(), this.u8()]; }
  argb() { const a = this.u8(); return [this.u8(), this.u8(), this.u8(), a]; }
  // color transform: [rm, gm, bm, am, ra, ga, ba, aa] (multipliers as fractions, adds in 0..255)
  cxform(alpha) {
    const hasAdd = this.ub(1), hasMult = this.ub(1), n = this.ub(4);
    const c = [1, 1, 1, 1, 0, 0, 0, 0];
    if (hasMult) { c[0] = this.sb(n) / 256; c[1] = this.sb(n) / 256; c[2] = this.sb(n) / 256; if (alpha) c[3] = this.sb(n) / 256; }
    if (hasAdd) { c[4] = this.sb(n); c[5] = this.sb(n); c[6] = this.sb(n); if (alpha) c[7] = this.sb(n); }
    this.align();
    return c;
  }
}

const SWF = {
  async inflate(u8) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate');
      const out = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
      return new Uint8Array(out);
    }
    if (typeof pako !== 'undefined') return pako.inflate(u8);
    throw new Error('No zlib support');
  },

  async parse(u8) {
    const sig = String.fromCharCode(u8[0], u8[1], u8[2]);
    let data;
    if (sig === 'CWS') {
      const body = await SWF.inflate(u8.subarray(8));
      data = new Uint8Array(8 + body.length); data.set(u8.subarray(0, 8)); data.set(body, 8);
    } else if (sig === 'FWS') data = u8;
    else throw new Error('Not a SWF file');
    const r = new SwfReader(data, 8);
    const frame = r.rect();
    const rate = r.fixed8(); const frames = r.u16();
    const swf = { version: data[3], width: frame.x1 - frame.x0, height: frame.y1 - frame.y0, rate, frames, chars: new Map(), exports: {}, bg: [255, 255, 255, 255], jpegTables: null };
    swf.root = SWF.timeline(r, data.length, swf, 0);
    swf.root.frameCount = frames;
    while (swf.root.frames.length > frames) swf.root.frames.pop();
    return swf;
  },

  // Parse tags until End; returns a sprite definition (its timeline).
  timeline(r, end, swf, id) {
    const sp = { type: 'sprite', id, frames: [[]], labels: {}, stream: null };
    let cur = sp.frames[0];
    while (r.p < end) {
      const h = r.u16();
      const code = h >> 6; let len = h & 0x3f;
      if (len === 0x3f) len = r.u32();
      const start = r.p, next = start + len;
      if (code === 0) break;
      try {
        switch (code) {
          case 1: cur = []; sp.frames.push(cur); break;                         // ShowFrame
          case 9: swf.bg = r.rgb(); break;                                        // SetBackgroundColor
          case 43: sp.labels[r.str()] = sp.frames.length - 1; break;              // FrameLabel
          case 12: cur.push({ op: 'action', code: r.b.slice(start, next) }); break; // DoAction
          case 4: case 26: case 70: cur.push(SWF.place(r, code, next)); break;    // PlaceObject(2/3)
          case 5: r.u16(); cur.push({ op: 'remove', depth: r.u16() }); break;     // RemoveObject
          case 28: cur.push({ op: 'remove', depth: r.u16() }); break;             // RemoveObject2
          case 15: cur.push({ op: 'sound', id: r.u16(), info: SWF.soundInfo(r) }); break; // StartSound
          case 18: case 45: {                                                      // SoundStreamHead(2)
            r.u8(); const f = r.u8();
            const fmt = f >> 4, rateIdx = (f >> 2) & 3, stereo = f & 1;
            r.u16(); if (fmt === 2) r.s16();
            sp.stream = { fmt, rate: [5512, 11025, 22050, 44100][rateIdx], stereo, blocks: [], startFrame: null };
            break;
          }
          case 19: if (sp.stream) {                                                // SoundStreamBlock
            const s = sp.stream;
            if (s.startFrame === null) s.startFrame = sp.frames.length - 1;
            s.blocks.push(r.b.slice(start + (s.fmt === 2 ? 4 : 0), next));
          } break;
          case 39: {                                                               // DefineSprite
            const sid = r.u16(); const fc = r.u16();
            const def = SWF.timeline(r, next, swf, sid);
            def.frameCount = fc;
            while (def.frames.length > fc && def.frames.length > 1 && def.frames[def.frames.length - 1].length === 0) def.frames.pop();
            swf.chars.set(sid, def);
            break;
          }
          case 2: case 22: case 32: case 83: { const s = SWF.shape(r, code, next); swf.chars.set(s.id, s); break; }
          case 46: case 84: { const s = SWF.morph(r, code, next); swf.chars.set(s.id, s); break; }
          case 7: case 34: { const bt = SWF.button(r, code, next); swf.chars.set(bt.id, bt); break; }
          case 10: case 48: case 75: { const f = SWF.font(r, code, next); swf.chars.set(f.id, f); break; }
          case 11: case 33: { const t = SWF.text(r, code, next); swf.chars.set(t.id, t); break; }
          case 37: { const t = SWF.editText(r, next); swf.chars.set(t.id, t); break; }
          case 8: swf.jpegTables = r.b.slice(start, next); break;
          case 6: case 21: case 35: {
            const bid = r.u16();
            let jpeg, alpha = null;
            if (code === 35) { const off = r.u32(); jpeg = r.b.slice(r.p, r.p + off); alpha = r.b.slice(r.p + off, next); }
            else jpeg = r.b.slice(r.p, next);
            swf.chars.set(bid, { type: 'bitmap', id: bid, jpeg: SWF.fixJpeg(jpeg, code === 6 ? swf.jpegTables : null), alphaZ: alpha });
            break;
          }
          case 20: case 36: {
            const bid = r.u16(); const fmt = r.u8(); const w = r.u16(), hh = r.u16();
            const colors = fmt === 3 ? r.u8() + 1 : 0;
            swf.chars.set(bid, { type: 'bitmap', id: bid, lossless: { fmt, w, h: hh, colors, alpha: code === 36, z: r.b.slice(r.p, next) } });
            break;
          }
          case 14: {                                                               // DefineSound
            const sid = r.u16(); const f = r.u8(); const samples = r.u32();
            swf.chars.set(sid, { type: 'sound', id: sid, fmt: f >> 4, rate: [5512, 11025, 22050, 44100][(f >> 2) & 3], bits16: (f >> 1) & 1, stereo: f & 1, samples, data: r.b.slice(r.p, next) });
            break;
          }
          case 56: {                                                               // ExportAssets
            const n = r.u16();
            for (let i = 0; i < n; i++) { const cid = r.u16(); const name = r.str(); swf.exports[name] = cid; const c = swf.chars.get(cid); if (c) c.exportName = name; }
            break;
          }
          case 88: { const fid = r.u16(); const nm = r.str(); const f = swf.chars.get(fid); if (f) f.fullName = nm; break; }
        }
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('SWF tag', code, 'failed', e);
      }
      r.p = next; r.align();
    }
    return sp;
  },

  fixJpeg(j, tables) {
    // strip the erroneous FFD9FFD8 header some Flash exporters write, and merge JPEGTables
    let s = 0;
    if (j[0] === 0xff && j[1] === 0xd9 && j[2] === 0xff && j[3] === 0xd8) s = 4;
    j = j.subarray(s);
    if (tables && tables.length > 4) {
      const t = tables.subarray(0, tables.length - 2);
      const out = new Uint8Array(t.length + j.length - 2); out.set(t); out.set(j.subarray(2), t.length);
      return out;
    }
    // remove any EOI/SOI pairs in the middle (JPEG data split in two streams)
    for (let i = 2; i < j.length - 3; i++) {
      if (j[i] === 0xff && j[i + 1] === 0xd9 && j[i + 2] === 0xff && j[i + 3] === 0xd8) {
        const out = new Uint8Array(j.length - 4); out.set(j.subarray(0, i)); out.set(j.subarray(i + 4), i); return out;
      }
    }
    return j;
  },

  soundInfo(r) {
    const f = r.u8();
    const info = { stop: !!(f & 0x20), noMultiple: !!(f & 0x10), loops: 1 };
    if (f & 0x01) r.u32();
    if (f & 0x02) r.u32();
    if (f & 0x04) info.loops = r.u16();
    if (f & 0x08) { const n = r.u8(); r.p += n * 8; }
    return info;
  },

  place(r, code, end) {
    const o = { op: 'place' };
    if (code === 4) {
      o.id = r.u16(); o.depth = r.u16(); o.matrix = r.matrix();
      if (r.p < end) o.cxform = r.cxform(false);
      return o;
    }
    const f = r.u8(), f2 = code === 70 ? r.u8() : 0;
    o.depth = r.u16();
    o.move = !!(f & 0x01);
    if (code === 70 && (f2 & 0x08)) r.str();          // class name
    if (f & 0x02) o.id = r.u16();
    if (f & 0x04) o.matrix = r.matrix();
    if (f & 0x08) o.cxform = r.cxform(true);
    if (f & 0x10) o.ratio = r.u16();
    if (f & 0x20) o.name = r.str();
    if (f & 0x40) o.clipDepth = r.u16();
    if (code === 70) {
      if (f2 & 0x01) o.filters = SWF.filters(r);
      if (f2 & 0x02) o.blend = r.u8();
      if (f2 & 0x04) o.cacheAsBitmap = r.u8();
    }
    if (f & 0x80) o.clipActions = SWF.clipActions(r, end);
    return o;
  },

  // onClipEvent handlers: [{events (bit mask: 1 load, 2 enterFrame, 4 unload...), key, code}]
  clipActions(r, end) {
    r.u16(); r.u32();
    const list = [];
    while (r.p < end) {
      const ev = r.u32();
      if (!ev) break;
      let size = r.u32();
      let key = 0;
      if (ev & 0x20000) { key = r.u8(); size--; }
      list.push({ events: ev, key, code: r.b.slice(r.p, r.p + size) });
      r.p += size;
    }
    return list;
  },

  filters(r) {
    const n = r.u8(); const list = [];
    for (let i = 0; i < n; i++) {
      const t = r.u8();
      const f = { type: t };
      switch (t) {
        case 0: f.color = r.rgba(); f.blurX = r.fixed(); f.blurY = r.fixed(); f.angle = r.fixed(); f.distance = r.fixed(); f.strength = r.fixed8(); { const fl = r.u8(); f.inner = !!(fl & 0x80); f.knockout = !!(fl & 0x40); f.passes = fl & 31; } break;
        case 1: f.blurX = r.fixed(); f.blurY = r.fixed(); f.passes = r.u8() >> 3; break;
        case 2: f.color = r.rgba(); f.blurX = r.fixed(); f.blurY = r.fixed(); f.strength = r.fixed8(); { const fl = r.u8(); f.inner = !!(fl & 0x80); f.knockout = !!(fl & 0x40); f.passes = fl & 31; } break;
        case 3: f.shadow = r.rgba(); f.highlight = r.rgba(); f.blurX = r.fixed(); f.blurY = r.fixed(); f.angle = r.fixed(); f.distance = r.fixed(); f.strength = r.fixed8(); r.u8(); break;
        case 4: case 7: { const nc = r.u8(); f.colors = []; for (let k = 0; k < nc; k++) f.colors.push(r.rgba()); f.ratios = []; for (let k = 0; k < nc; k++) f.ratios.push(r.u8()); f.blurX = r.fixed(); f.blurY = r.fixed(); f.angle = r.fixed(); f.distance = r.fixed(); f.strength = r.fixed8(); r.u8(); break; }
        case 5: { const mx = r.u8(), my = r.u8(); r.f32(); r.f32(); r.p += mx * my * 4; r.rgba(); r.u8(); break; }
        case 6: f.matrix = []; for (let k = 0; k < 20; k++) f.matrix.push(r.f32()); break;
      }
      list.push(f);
    }
    return list;
  },

  // ---------------------------------------------------------------- shapes
  fillStyles(r, ver, morph) {
    let n = r.u8(); if (n === 0xff) n = r.u16();
    const out = [];
    for (let i = 0; i < n; i++) out.push(SWF.fillStyle(r, ver, morph));
    return out;
  },
  fillStyle(r, ver, morph) {
    const col = () => (ver >= 3 || morph ? r.rgba() : r.rgb());
    const t = r.u8();
    const s = { kind: t };
    if (t === 0) { s.color = col(); if (morph) s.color2 = r.rgba(); }
    else if (t === 0x10 || t === 0x12 || t === 0x13) {
      s.matrix = r.matrix(); if (morph) s.matrix2 = r.matrix();
      const f = r.u8(); s.spread = (f >> 6) & 3; s.interp = (f >> 4) & 3; const ng = f & 15;
      s.stops = []; if (morph) s.stops2 = [];
      for (let k = 0; k < ng; k++) {
        const ratio = r.u8(); const c = col(); s.stops.push([ratio / 255, c]);
        if (morph) { const r2 = r.u8(); s.stops2.push([r2 / 255, r.rgba()]); }
      }
      if (t === 0x13) { s.focal = r.fixed8(); if (morph) s.focal2 = r.fixed8(); }
    } else if (t >= 0x40 && t <= 0x43) {
      s.bitmap = r.u16(); s.matrix = r.matrix(); if (morph) s.matrix2 = r.matrix();
      s.repeat = !(t & 1); s.smooth = !(t & 2);
    }
    return s;
  },

  lineStyles(r, ver, morph) {
    let n = r.u8(); if (n === 0xff) n = r.u16();
    const out = [];
    for (let i = 0; i < n; i++) {
      const s = { width: r.u16() / 20 };
      if (morph) s.width2 = r.u16() / 20;
      if (ver === 4) {
        const f1 = r.u8(), f2 = r.u8();
        s.startCap = f1 >> 6; s.join = (f1 >> 4) & 3; const hasFill = (f1 >> 3) & 1;
        s.noHScale = !!(f1 & 4); s.noVScale = !!(f1 & 2); s.pixelHinting = !!(f1 & 1);
        s.noClose = !!(f2 & 4); s.endCap = f2 & 3;
        if (s.join === 2) s.miter = r.fixed8();
        if (hasFill) { s.fill = SWF.fillStyle(r, 4, morph); s.color = s.fill.color || [0, 0, 0, 255]; }
        else { s.color = r.rgba(); if (morph) s.color2 = r.rgba(); }
      } else {
        s.color = ver >= 3 || morph ? r.rgba() : r.rgb();
        if (morph) s.color2 = r.rgba();
      }
      out.push(s);
    }
    return out;
  },

  // Read shape records into a flat list: style changes and edges (in twips, relative moves resolved).
  records(r, ver, fillBits, lineBits, withStyles) {
    const recs = [];
    let x = 0, y = 0;
    let fb = fillBits, lb = lineBits;
    for (;;) {
      const isEdge = r.ub(1);
      if (!isEdge) {
        const flags = r.ub(5);
        if (flags === 0) break;
        const rec = { t: 's' };
        if (flags & 1) { const n = r.ub(5); x = r.sb(n); y = r.sb(n); rec.move = [x, y]; }
        if (flags & 2) rec.f0 = r.ub(fb);
        if (flags & 4) rec.f1 = r.ub(fb);
        if (flags & 8) rec.ls = r.ub(lb);
        if (flags & 16 && withStyles) {
          rec.fills = SWF.fillStyles(r, ver, false);
          rec.lines = SWF.lineStyles(r, ver, false);
          fb = r.ub(4); lb = r.ub(4);
        }
        recs.push(rec);
      } else {
        const straight = r.ub(1);
        const n = r.ub(4) + 2;
        if (straight) {
          let dx = 0, dy = 0;
          if (r.ub(1)) { dx = r.sb(n); dy = r.sb(n); }
          else if (r.ub(1)) dy = r.sb(n); else dx = r.sb(n);
          recs.push({ t: 'l', x0: x, y0: y, x1: x + dx, y1: y + dy });
          x += dx; y += dy;
        } else {
          const cx = x + r.sb(n), cy = y + r.sb(n);
          const ax = cx + r.sb(n), ay = cy + r.sb(n);
          recs.push({ t: 'q', x0: x, y0: y, cx, cy, x1: ax, y1: ay });
          x = ax; y = ay;
        }
      }
    }
    r.align();
    return recs;
  },

  shape(r, code, end) {
    const ver = { 2: 1, 22: 2, 32: 3, 83: 4 }[code];
    const id = r.u16(); const bounds = r.rect();
    if (ver === 4) { r.rect(); r.u8(); }
    const fills = SWF.fillStyles(r, ver, false);
    const lines = SWF.lineStyles(r, ver, false);
    const fb = r.ub(4), lb = r.ub(4);
    const recs = SWF.records(r, ver, fb, lb, true);
    return { type: 'shape', id, bounds, groups: SWF.buildGroups(recs, fills, lines) };
  },

  // Turn records into style groups: for each fill style, closed contours; for each line style, polylines.
  buildGroups(recs, fills, lines) {
    const groups = [];
    let g = { fills, lines, fillEdges: fills.map(() => []), lineEdges: lines.map(() => []) };
    groups.push(g);
    let f0 = 0, f1 = 0, ls = 0;
    for (const rec of recs) {
      if (rec.t === 's') {
        if (rec.fills) {
          g = { fills: rec.fills, lines: rec.lines, fillEdges: rec.fills.map(() => []), lineEdges: rec.lines.map(() => []) };
          groups.push(g); f0 = f1 = ls = 0;
        }
        if (rec.f0 !== undefined) f0 = rec.f0;
        if (rec.f1 !== undefined) f1 = rec.f1;
        if (rec.ls !== undefined) ls = rec.ls;
        continue;
      }
      if (f1 && g.fillEdges[f1 - 1]) g.fillEdges[f1 - 1].push(rec);
      if (f0 && g.fillEdges[f0 - 1]) g.fillEdges[f0 - 1].push(rec.t === 'l' ? { t: 'l', x0: rec.x1, y0: rec.y1, x1: rec.x0, y1: rec.y0 } : { t: 'q', x0: rec.x1, y0: rec.y1, cx: rec.cx, cy: rec.cy, x1: rec.x0, y1: rec.y0 });
      if (ls && g.lineEdges[ls - 1]) g.lineEdges[ls - 1].push(rec);
    }
    return groups.map(gr => ({
      fills: gr.fills.map((st, i) => ({ style: st, path: SWF.contours(gr.fillEdges[i]) })).filter(f => f.path.length),
      lines: gr.lines.map((st, i) => ({ style: st, path: SWF.polyline(gr.lineEdges[i]) })).filter(l => l.path.length),
    }));
  },

  // Chain directed edges into closed contours. Output: flat command array [op, ...] in pixels
  // (op 0 = moveTo x y, 1 = lineTo x y, 2 = quadTo cx cy x y).
  contours(edges) {
    if (!edges.length) return [];
    const key = (x, y) => x + ',' + y;
    const byStart = new Map();
    edges.forEach((e, i) => { const k = key(e.x0, e.y0); let l = byStart.get(k); if (!l) byStart.set(k, l = []); l.push(i); });
    const used = new Uint8Array(edges.length);
    const out = [];
    for (let i = 0; i < edges.length; i++) {
      if (used[i]) continue;
      let e = edges[i]; used[i] = 1;
      const sx = e.x0, sy = e.y0;
      out.push(0, sx / 20, sy / 20);
      for (;;) {
        if (e.t === 'l') out.push(1, e.x1 / 20, e.y1 / 20); else out.push(2, e.cx / 20, e.cy / 20, e.x1 / 20, e.y1 / 20);
        if (e.x1 === sx && e.y1 === sy) break;
        const l = byStart.get(key(e.x1, e.y1));
        let nxt = -1;
        if (l) for (const j of l) if (!used[j]) { nxt = j; break; }
        if (nxt < 0) break;
        used[nxt] = 1; e = edges[nxt];
      }
    }
    return out;
  },

  polyline(edges) {
    const out = [];
    let lx = null, ly = null;
    for (const e of edges) {
      if (e.x0 !== lx || e.y0 !== ly) out.push(0, e.x0 / 20, e.y0 / 20);
      if (e.t === 'l') out.push(1, e.x1 / 20, e.y1 / 20); else out.push(2, e.cx / 20, e.cy / 20, e.x1 / 20, e.y1 / 20);
      lx = e.x1; ly = e.y1;
    }
    return out;
  },

  morph(r, code, end) {
    const id = r.u16(); const b0 = r.rect(); const b1 = r.rect();
    if (code === 84) { r.rect(); r.rect(); r.u8(); }
    const offset = r.u32(); const endPos = r.p + offset;
    const fills = SWF.fillStyles(r, 3, true);
    const lines = SWF.lineStyles(r, code === 84 ? 4 : 3, true);
    const fb = r.ub(4), lb = r.ub(4);
    const startRecs = SWF.records(r, 3, fb, lb, false);
    r.p = endPos; r.align();
    const fb2 = r.ub(4), lb2 = r.ub(4);
    const endRecs = SWF.records(r, 3, fb2, lb2, false);
    return { type: 'morph', id, bounds: b0, bounds2: b1, fills, lines, startRecs, endRecs, cache: new Map() };
  },

  // Interpolate a morph shape at ratio t (0..1) into a normal shape definition.
  morphAt(m, t) {
    const key = Math.round(t * 1000);
    if (m.cache.has(key)) return m.cache.get(key);
    const L = (a, b) => a + (b - a) * t;
    const LC = (a, b) => [0, 1, 2, 3].map(i => Math.round(L(a[i], b[i])));
    const LM = (a, b) => a.map((v, i) => L(v, b[i]));
    const fills = m.fills.map(s => {
      const o = { kind: s.kind };
      if (s.kind === 0) o.color = LC(s.color, s.color2);
      else if (s.stops) { o.matrix = LM(s.matrix, s.matrix2); o.spread = s.spread; o.interp = s.interp; o.stops = s.stops.map((st, i) => [L(st[0], s.stops2[i][0]), LC(st[1], s.stops2[i][1])]); if (s.focal !== undefined) o.focal = L(s.focal, s.focal2); }
      else if (s.bitmap !== undefined) { o.bitmap = s.bitmap; o.matrix = LM(s.matrix, s.matrix2); o.repeat = s.repeat; o.smooth = s.smooth; }
      return o;
    });
    const lines = m.lines.map(s => ({ width: L(s.width, s.width2), color: LC(s.color, s.color2 || s.color) }));
    // pair the edges of both shapes; the end shape only carries edges and moves
    const endEdges = m.endRecs.filter(e => e.t !== 's');
    const recs = [];
    let k = 0;
    for (const rec of m.startRecs) {
      if (rec.t === 's') { recs.push(rec); continue; }
      const e2 = endEdges[k++] || rec;
      const q = (e) => e.t === 'q' ? e : { t: 'q', x0: e.x0, y0: e.y0, cx: (e.x0 + e.x1) / 2, cy: (e.y0 + e.y1) / 2, x1: e.x1, y1: e.y1 };
      if (rec.t === 'l' && e2.t === 'l') recs.push({ t: 'l', x0: L(rec.x0, e2.x0), y0: L(rec.y0, e2.y0), x1: L(rec.x1, e2.x1), y1: L(rec.y1, e2.y1) });
      else { const a = q(rec), b = q(e2); recs.push({ t: 'q', x0: L(a.x0, b.x0), y0: L(a.y0, b.y0), cx: L(a.cx, b.cx), cy: L(a.cy, b.cy), x1: L(a.x1, b.x1), y1: L(a.y1, b.y1) }); }
    }
    // after interpolation, chained points may not match bit-for-bit: round to 1/100 twip
    for (const e of recs) if (e.t !== 's') for (const p of ['x0', 'y0', 'x1', 'y1', 'cx', 'cy']) if (e[p] !== undefined) e[p] = Math.round(e[p] * 100) / 100;
    const shape = { type: 'shape', id: m.id, bounds: m.bounds, groups: SWF.buildGroups(recs, fills, lines), morphRatio: t };
    if (m.cache.size > 64) m.cache.clear();
    m.cache.set(key, shape);
    return shape;
  },

  // ---------------------------------------------------------------- buttons
  button(r, code, end) {
    const id = r.u16();
    const bt = { type: 'button', id, records: [], actions: [] };
    let actOff = 0, actPos = 0;
    if (code === 34) { r.u8(); actPos = r.p; actOff = r.u16(); }
    for (;;) {
      const f = r.u8();
      if (f === 0) break;
      const rec = { hit: !!(f & 8), down: !!(f & 4), over: !!(f & 2), up: !!(f & 1) };
      rec.id = r.u16(); rec.depth = r.u16(); rec.matrix = r.matrix();
      if (code === 34) rec.cxform = r.cxform(true);
      if (f & 0x10) rec.filters = SWF.filters(r);
      if (f & 0x20) rec.blend = r.u8();
      bt.records.push(rec);
    }
    if (code === 7) bt.actions.push({ cond: 0x08, code: r.b.slice(r.p, end) });
    else if (actOff) {
      // BUTTONCONDACTION list; cond bits: 1 rollOver, 2 rollOut, 4 press, 8 release, key code in bits 9-15
      let p = actPos + actOff;
      for (;;) {
        const size = r.b[p] | (r.b[p + 1] << 8);
        const cond = r.b[p + 2] | (r.b[p + 3] << 8);
        const stop = size ? p + size : end;
        bt.actions.push({ cond, key: (cond >> 9) & 0x7f, code: r.b.slice(p + 4, stop) });
        if (!size) break;
        p += size;
      }
    }
    return bt;
  },

  // ---------------------------------------------------------------- text
  font(r, code, end) {
    const id = r.u16();
    const font = { type: 'font', id, glyphs: [], codes: [], map: new Map(), advances: null, ascent: 0, descent: 0, emScale: code === 75 ? 20 : 1 };
    if (code === 10) {
      const start = r.p; const first = r.u16(); const n = first / 2; const offs = [first];
      for (let i = 1; i < n; i++) offs.push(r.u16());
      for (let i = 0; i < n; i++) { r.p = start + offs[i]; r.align(); const fb = r.ub(4), lb = r.ub(4); font.glyphs.push(SWF.glyph(SWF.records(r, 1, fb, lb, false))); }
      return font;
    }
    const f = r.u8(); r.u8();
    const nameLen = r.u8(); let name = ''; for (let i = 0; i < nameLen; i++) name += String.fromCharCode(r.u8());
    font.name = name.replace(/\0/g, ''); font.bold = !!(f & 1); font.italic = !!(f & 2);
    const wide = !!(f & 0x08), wideCodes = !!(f & 0x04), layout = !!(f & 0x80);
    const n = r.u16(); const start = r.p;
    if (!n) return font;
    const offs = []; for (let i = 0; i < n; i++) offs.push(wide ? r.u32() : r.u16());
    const codeOff = wide ? r.u32() : r.u16();
    for (let i = 0; i < n; i++) { r.p = start + offs[i]; r.align(); const fb = r.ub(4), lb = r.ub(4); font.glyphs.push(SWF.glyph(SWF.records(r, 3, fb, lb, false))); }
    r.p = start + codeOff; r.align();
    for (let i = 0; i < n; i++) { const c = wideCodes ? r.u16() : r.u8(); font.codes.push(c); font.map.set(c, i); }
    if (layout) {
      font.ascent = r.u16() / 20; font.descent = r.u16() / 20; r.s16();
      font.advances = []; for (let i = 0; i < n; i++) font.advances.push(r.s16() / 20);
    }
    return font;
  },
  // glyphs have a single implicit fill style
  glyph(recs) {
    const g = SWF.buildGroups(recs, [{ kind: 0, color: [0, 0, 0, 255] }], [])[0];
    return g.fills.length ? g.fills[0].path : [];
  },

  text(r, code, end) {
    const id = r.u16(); const bounds = r.rect(); const matrix = r.matrix();
    const gb = r.u8(), ab = r.u8();
    const t = { type: 'text', id, bounds, matrix, runs: [] };
    let font = null, color = [0, 0, 0, 255], x = 0, y = 0, height = 12;
    for (;;) {
      const f = r.u8();
      if (f === 0) break;
      if (f & 0x80 && !(f & 0x70)) {
        if (f & 8) font = r.u16();
        if (f & 4) color = code === 33 ? r.rgba() : r.rgb();
        if (f & 1) x = r.s16() / 20;
        if (f & 2) y = r.s16() / 20;
        if (f & 8) height = r.u16() / 20;
        const n = r.u8();
        const glyphs = [];
        let gx = x;
        for (let i = 0; i < n; i++) { const gi = r.ub(gb); const adv = r.sb(ab) / 20; glyphs.push([gi, gx]); gx += adv; }
        r.align();
        t.runs.push({ font, color, y, height, glyphs });
        x = gx;
      } else break;
    }
    return t;
  },

  editText(r, end) {
    const id = r.u16(); const bounds = r.rect();
    const f1 = r.u8(), f2 = r.u8();
    const t = { type: 'edittext', id, bounds, text: '', color: [0, 0, 0, 255], height: 12, align: 0, font: null };
    t.wordWrap = !!(f1 & 0x40); t.multiline = !!(f1 & 0x20); t.html = !!(f2 & 0x02); t.useOutlines = !!(f2 & 0x01); t.border = !!(f2 & 0x08); t.autoSize = !!(f2 & 0x40);
    if (f1 & 0x01) t.font = r.u16();
    if (f2 & 0x80) r.str();
    if (f1 & 0x01) t.height = r.u16() / 20;
    if (f1 & 0x04) t.color = r.rgba();
    if (f1 & 0x02) r.u16();
    if (f2 & 0x20) { t.align = r.u8(); t.leftMargin = r.u16() / 20; t.rightMargin = r.u16() / 20; t.indent = r.u16() / 20; t.leading = r.s16() / 20; }
    t.variable = r.str();
    if (f1 & 0x80) t.text = r.str();
    if (t.html) t.text = t.text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n$/, '');
    return t;
  },
};

if (typeof module !== 'undefined') module.exports = { SWF, SwfReader };
