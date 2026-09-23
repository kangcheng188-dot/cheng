'use strict';
// A small Flash Player for the original Age of War file: display list (movie clips, buttons, text
// fields), timelines (play / stop / goto / labels / sounds), mouse and keyboard events, and an
// ActionScript 1/2 (AVM1) interpreter that runs the original game code as it is.

const Flash = {
  swf: null, root: null, global: null,
  mouse: { x: -100, y: -100, down: false },
  keys: new Set(),
  onSound: null, onStream: null, onURL: null, onMouseHide: null,
  frame: 0,
  overBtn: null, pressBtn: null,
};

const DYN = 16384; // script-created children live above the timeline's depths

// ------------------------------------------------------------------ display objects
class DObj {
  constructor(def, parent) {
    this.def = def; this.parent = parent;
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.cx = null; this.ratio = 0; this.name = ''; this.depth = 0; this.clipDepth = 0;
    this.visible = true; this.filters = null; this.blend = 0;
    this.detached = false; this.placedAt = 0; this.removed = false;
    this.props = Object.create(null);
    this._d = null;
  }
  get root() { return Flash.root; }
  decomp() {
    if (!this._d) {
      const m = this.matrix;
      this._d = { sx: Math.hypot(m[0], m[1]), sy: Math.hypot(m[2], m[3]), rx: Math.atan2(m[1], m[0]), ry: Math.atan2(-m[2], m[3]) };
    }
    return this._d;
  }
  recompose() {
    const d = this._d, m = this.matrix;
    this.matrix = [d.sx * Math.cos(d.rx), d.sx * Math.sin(d.rx), -d.sy * Math.sin(d.ry), d.sy * Math.cos(d.ry), m[4], m[5]];
    this.detached = true;
  }
  setMatrixFromTimeline(m) { this.matrix = m.slice(); this._d = null; }
  get x() { return this.matrix[4]; }
  set x(v) { this.matrix = this.matrix.slice(); this.matrix[4] = v; this.detached = true; }
  get y() { return this.matrix[5]; }
  set y(v) { this.matrix = this.matrix.slice(); this.matrix[5] = v; this.detached = true; }
  get xscale() { return this.decomp().sx * 100; }
  set xscale(v) { this.decomp().sx = v / 100; this.recompose(); }
  get yscale() { return this.decomp().sy * 100; }
  set yscale(v) { this.decomp().sy = v / 100; this.recompose(); }
  get rotation() { let r = this.decomp().rx * 180 / Math.PI; return r > 180 ? r - 360 : r; }
  set rotation(v) {
    v = ((v + 180) % 360 + 360) % 360 - 180;
    const d = this.decomp(); const nr = v * Math.PI / 180; const delta = nr - d.rx;
    d.rx += delta; d.ry += delta; this.recompose();
  }
  get alpha() { return this.cx ? this.cx[3] : 1; }
  set alpha(a) { this.cx = this.cx ? this.cx.slice() : [1, 1, 1, 1, 0, 0, 0, 0]; this.cx[3] = a; }
  worldMatrix() { return this.parent ? mMul(this.parent.worldMatrix(), this.matrix) : this.matrix; }
  // bounds in the parent's coordinates
  boundsInParent() { return boundsOf(this, IDENT); }
  remove() {
    if (!this.parent) return;
    const p = this.parent;
    if (p.children && p.children.get(this.depth) === this) p.children.delete(this.depth);
    this.removed = true;
  }
}

class Clip extends DObj {
  constructor(def, parent) {
    super(def, parent);
    this.children = new Map();
    this.frame = 0;
    this.playing = true;
    this.fresh = true;
    this.clipEvents = null;
  }
  get totalFrames() { return this.def.frames.length; }
  child(name) {
    for (const c of this.children.values()) if (c.name === name) return c;
    return null;
  }
  label(l) { const f = this.def.labels[l]; return f === undefined ? -1 : f + 1; }
  gotoAndStop(f) { this.playing = false; this.goto(f); runQueue(); }
  gotoAndPlay(f) { this.playing = true; this.goto(f); runQueue(); }
  stop() { this.playing = false; }
  play() { this.playing = true; }
  goto(f) {
    let n;
    if (typeof f === 'string') { n = this.label(f); if (n < 0) { const k = parseInt(f, 10); if (isNaN(k)) return; n = k; } }
    else n = Math.floor(toNum(f));
    if (!(n >= 1)) n = 1;
    n = Math.min(this.totalFrames, n);
    if (n === this.frame) return;
    this.seek(n);
  }
  seek(n) {
    if (n > this.frame) {
      for (let f = this.frame + 1; f <= n; f++) this.applyFrame(f, f === n, null);
    } else {
      const old = this.children;
      this.children = new Map();
      for (const [d, c] of old) if (d >= DYN) this.children.set(d, c);
      for (let f = 1; f <= n; f++) this.applyFrame(f, f === n, old);
      for (const [d, c] of old) if (this.children.get(d) !== c) c.removed = true;
    }
    this.frame = n;
  }
  applyFrame(f, isTarget, reuse) {
    const ops = this.def.frames[f - 1];
    if (!ops) return;
    for (const op of ops) {
      if (op.op === 'place') this.place(op, f, reuse);
      else if (op.op === 'remove') { const c = this.children.get(op.depth); if (c) { c.removed = true; this.children.delete(op.depth); } }
      else if (op.op === 'action') { if (isTarget) queueAction(this, op.code); }
      else if (op.op === 'sound') { if (isTarget && Flash.onSound) Flash.onSound(op.id, op.info, this); }
    }
    if (isTarget && this.def.stream && this.def.stream.startFrame === f - 1 && Flash.onStream) Flash.onStream(this.def, this);
  }
  place(op, f, reuse) {
    let o = this.children.get(op.depth);
    if (op.id !== undefined && (!op.move || !o || o.def.id !== op.id)) {
      const prev = reuse && reuse.get(op.depth);
      if (prev && prev.def.id === op.id && prev.placedAt === f) { o = prev; o.removed = false; }
      else {
        const old = o;
        if (old) old.removed = true;
        o = makeInstance(op.id, this);
        if (!o) return;
        // "move + new character" swaps the character but keeps the old transform and colour
        if (op.move && old) { o.matrix = old.matrix.slice(); o.cx = old.cx; o.name = old.name; o.ratio = old.ratio; o.clipDepth = old.clipDepth; }
        o.placedAt = f;
        o.depth = op.depth;
        if (op.name) o.name = op.name;
        if (op.clipActions) { o.clipEvents = op.clipActions; }
        this.children.set(op.depth, o);
        if (op.matrix) o.setMatrixFromTimeline(op.matrix);
        if (op.cxform) o.cx = op.cxform;
        if (op.clipActions) for (const ev of op.clipActions) if (ev.events & 1) queueAction(o, ev.code, o);
      }
      o.depth = op.depth;
      this.children.set(op.depth, o);
    }
    if (!o) return;
    if (op.matrix && !o.detached) o.setMatrixFromTimeline(op.matrix);
    if (op.cxform && !o.detached) o.cx = op.cxform;
    if (op.ratio !== undefined) o.ratio = op.ratio;
    if (op.name) o.name = op.name;
    if (op.clipDepth) o.clipDepth = op.clipDepth;
    if (op.filters) o.filters = op.filters;
    if (op.blend !== undefined) o.blend = op.blend;
  }
  // script API
  attachMovie(link, name, depth) {
    const id = Flash.swf.exports[link];
    if (id === undefined) return undefined;
    const o = this.addChild(makeInstance(id, this), name, depth);
    if (o && Flash.onAttach) Flash.onAttach(o, link);
    return o;
  }
  createEmpty(name, depth) {
    return this.addChild(new Clip({ type: 'sprite', id: -1, frames: [[]], labels: {} }, this), name, depth);
  }
  addChild(o, name, depth) {
    if (!o) return undefined;
    const d = DYN + toNum(depth);
    const old = this.children.get(d);
    if (old) old.removed = true;
    o.name = String(name); o.depth = d; o.parent = this;
    this.children.set(d, o);
    return o;
  }
}

class ButtonObj extends DObj {
  constructor(def, parent) {
    super(def, parent);
    this.state = 'up';
    this.enabled = true;
    this.cache = {};
  }
  get states() { return this.cache; }
  stateList(s) {
    if (!this.cache[s]) {
      const list = [];
      for (const rec of this.def.records) if (rec[s]) {
        const o = makeInstance(rec.id, this);
        if (!o) continue;
        o.setMatrixFromTimeline(rec.matrix); o.cx = rec.cxform || null; o.depth = rec.depth;
        if (rec.filters) o.filters = rec.filters;
        if (rec.blend) o.blend = rec.blend;
        list.push(o);
      }
      list.sort((a, b) => a.depth - b.depth);
      this.cache[s] = list;
    }
    return this.cache[s];
  }
  setState(s) { if (this.state !== s) { this.state = s; } }
  // the timeline the button lives in (scope of its scripts)
  get timeline() { let p = this.parent; while (p && !(p instanceof Clip)) p = p.parent; return p; }
}

function makeInstance(id, parent) {
  const def = Flash.swf.chars.get(id);
  if (!def) return null;
  if (def.type === 'sprite') {
    const c = new Clip(def, parent);
    c.seek(1);
    return c;
  }
  if (def.type === 'button') return new ButtonObj(def, parent);
  const o = new DObj(def, parent);
  if (def.type === 'edittext') o.text = def.text;
  return o;
}

// ------------------------------------------------------------------ frame loop
const actionQueue = [];
function queueAction(clip, code, self) { actionQueue.push([clip, code, self]); }
function runQueue() {
  let guard = 0;
  while (actionQueue.length && guard++ < 5000) {
    const [clip, code, self] = actionQueue.shift();
    if (clip.removed && !self) continue;
    try { AVM.runBlock(code, self || clip, self || clip); } catch (e) { reportError(e, clip); }
  }
}
let errCount = 0;
function reportError(e, clip) { if (errCount++ < 20 && typeof console !== 'undefined') console.warn('AS error in', clip && clip.def && clip.def.id, e); }

function allClips(root) {
  const out = [];
  const walk = (c) => {
    out.push(c);
    const list = [...c.children.values()].sort((a, b) => a.depth - b.depth);
    for (const k of list) if (k instanceof Clip) walk(k);
      else if (k instanceof ButtonObj) for (const s of ['up', 'over', 'down']) if (k.cache[s]) for (const o of k.cache[s]) if (o instanceof Clip) walk(o);
  };
  walk(root);
  return out;
}

Flash.tick = function () {
  Flash.frame++;
  const clips = allClips(Flash.root);
  // 1. timelines move on
  for (const c of clips) {
    if (c.removed) continue;
    if (c.fresh) { c.fresh = false; continue; }
    if (c.playing && c.totalFrames > 1) c.seek(c.frame >= c.totalFrames ? 1 : c.frame + 1);
  }
  runQueue();
  // 2. enterFrame handlers
  for (const c of clips) {
    if (c.removed) continue;
    if (c.clipEvents) for (const ev of c.clipEvents) if (ev.events & 2) { try { AVM.runBlock(ev.code, c, c); } catch (e) { reportError(e, c); } }
    const f = c.props.onEnterFrame;
    if (f instanceof ASFunction) { try { AVM.call(f, c, []); } catch (e) { reportError(e, c); } }
    runQueue();
  }
  Flash.updateButtons();
};

// ------------------------------------------------------------------ buttons and mouse
function buttonTarget() {
  const list = buttonsAt(Flash.root, IDENT, Flash.mouse.x, Flash.mouse.y);
  return list.length ? list[0] : null;
}
function runButtonActions(btn, bit) {
  const tl = btn.timeline;
  if (!tl) return;
  for (const a of btn.def.actions) if (a.cond & bit) { try { AVM.runBlock(a.code, tl, tl); } catch (e) { reportError(e, tl); } }
  runQueue();
}
Flash.updateButtons = function () {
  const b = buttonTarget();
  if (b !== Flash.overBtn) {
    if (Flash.overBtn && !Flash.overBtn.removed) { Flash.overBtn.setState('up'); runButtonActions(Flash.overBtn, 0x02); }
    Flash.overBtn = b;
    if (b) { b.setState(Flash.mouse.down && Flash.pressBtn === b ? 'down' : 'over'); runButtonActions(b, 0x01); }
  }
};
Flash.mouseMove = function (x, y) { Flash.mouse.x = x; Flash.mouse.y = y; Flash.updateButtons(); };
Flash.mouseDown = function (x, y) {
  Flash.mouse.x = x; Flash.mouse.y = y; Flash.mouse.down = true;
  Flash.updateButtons();
  const b = Flash.overBtn;
  Flash.pressBtn = b;
  if (b) { b.setState('down'); runButtonActions(b, 0x04); }
  return !!b;
};
Flash.mouseUp = function (x, y) {
  Flash.mouse.x = x; Flash.mouse.y = y; Flash.mouse.down = false;
  Flash.updateButtons();
  const b = Flash.pressBtn;
  Flash.pressBtn = null;
  if (b && b === Flash.overBtn && !b.removed) { b.setState('over'); runButtonActions(b, 0x08); }
};

// ------------------------------------------------------------------ AVM1
class ASFunction {
  constructor(o) { Object.assign(this, o); this.props = Object.create(null); }
}
const PROPS = ['_x', '_y', '_xscale', '_yscale', '_currentframe', '_totalframes', '_alpha', '_visible', '_width', '_height', '_rotation', '_target', '_framesloaded', '_name', '_droptarget', '_url', '_highquality', '_focusrect', '_soundbuftime', '_quality', '_xmouse', '_ymouse'];

function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === undefined || v === null) return NaN;
  if (typeof v === 'string') { if (!v.trim()) return NaN; const n = Number(v); return n; }
  return NaN;
}
function toStr(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number') { if (isNaN(v)) return 'NaN'; return String(Math.abs(v) < 1e15 && Number.isInteger(v) ? v : parseFloat(v.toPrecision(15))); }
  if (v instanceof DObj) return '_level0' + targetPath(v);
  if (Array.isArray(v)) return v.map(toStr).join(',');
  if (v instanceof ASFunction) return '[type Function]';
  return String(v);
}
function toBool(v) { if (typeof v === 'number') return !isNaN(v) && v !== 0; return !!v; }
function targetPath(o) { const parts = []; while (o && o.parent) { parts.unshift(o.name); o = o.parent; } return parts.length ? '.' + parts.join('.') : ''; }

const MathObj = Object.assign(Object.create(null), {
  abs: Math.abs, atan: Math.atan, atan2: Math.atan2, cos: Math.cos, sin: Math.sin, tan: Math.tan, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil,
  round: (v) => Math.floor(toNum(v) + 0.5), random: Math.random, min: Math.min, max: Math.max, pow: Math.pow, PI: Math.PI, exp: Math.exp, log: Math.log, asin: Math.asin, acos: Math.acos,
});
const KeyObj = Object.assign(Object.create(null), { isDown: (k) => Flash.keys.has(toNum(k)), SPACE: 32, LEFT: 37, RIGHT: 39, UP: 38, DOWN: 40, ENTER: 13, ESCAPE: 27 });
const MouseObj = Object.assign(Object.create(null), { hide: () => { Flash.onMouseHide && Flash.onMouseHide(true); }, show: () => { Flash.onMouseHide && Flash.onMouseHide(false); } });
function ASArray(...args) { if (args.length === 1 && typeof args[0] === 'number') return new Array(args[0]); return args; }
const GLOBALS = {
  Math: MathObj, Key: KeyObj, Mouse: MouseObj, Array: ASArray,
  Number: (v) => toNum(v), String: (v) => toStr(v), Boolean: (v) => toBool(v),
  parseInt: (v, r) => parseInt(toStr(v), r), parseFloat: (v) => parseFloat(toStr(v)), isNaN: (v) => isNaN(toNum(v)),
  getTimer: () => Math.round(performance.now()), trace: () => {}, escape: (s) => escape(toStr(s)), unescape: (s) => unescape(toStr(s)),
  NaN, Infinity,
};

const AVM = {
  cache: new Map(),

  // Decode a block of actions once: ops[] of [opcode, a, b, c], byte offset -> op index map.
  decode(code) {
    let d = AVM.cache.get(code);
    if (d) return d;
    const ops = []; const at = new Map();
    const dv = new DataView(code.buffer, code.byteOffset, code.byteLength);
    const str = (q) => { let e = q; while (e < code.length && code[e]) e++; let s = ''; for (let i = q; i < e; i++) s += String.fromCharCode(code[i]); try { s = decodeURIComponent(escape(s)); } catch (err) {} return [s, e + 1]; };
    const fnEnds = [];
    let p = 0;
    while (p < code.length) {
      at.set(p, ops.length);
      const op = code[p++];
      if (op === 0) { ops.push([0]); continue; }
      let len = 0;
      if (op >= 0x80) { len = dv.getUint16(p, true); p += 2; }
      const b = p; p += len;
      switch (op) {
        case 0x88: { const n = dv.getUint16(b, true); let q = b + 2; const pool = []; for (let i = 0; i < n; i++) { const [s, nq] = str(q); pool.push(s); q = nq; } ops.push([op, pool]); break; }
        case 0x96: {
          const vals = []; let q = b;
          while (q < b + len) {
            const t = code[q++];
            if (t === 0) { const [s, nq] = str(q); vals.push(0, s); q = nq; }
            else if (t === 1) { vals.push(1, dv.getFloat32(q, true)); q += 4; }
            else if (t === 2) vals.push(1, null);
            else if (t === 3) vals.push(1, undefined);
            else if (t === 4) vals.push(2, code[q++]);
            else if (t === 5) vals.push(1, !!code[q++]);
            else if (t === 6) { const tmp = new DataView(new ArrayBuffer(8)); tmp.setUint32(0, dv.getUint32(q + 4, true), true); tmp.setUint32(4, dv.getUint32(q, true), true); vals.push(1, tmp.getFloat64(0, true)); q += 8; }
            else if (t === 7) { vals.push(1, dv.getInt32(q, true)); q += 4; }
            else if (t === 8) vals.push(3, code[q++]);
            else if (t === 9) { vals.push(3, dv.getUint16(q, true)); q += 2; }
            else break;
          }
          ops.push([op, vals]); break;
        }
        case 0x81: ops.push([op, dv.getUint16(b, true)]); break;
        case 0x8C: case 0x8B: ops.push([op, str(b)[0]]); break;
        case 0x83: { const [u, q] = str(b); ops.push([op, u, str(q)[0]]); break; }
        case 0x9A: ops.push([op, code[b]]); break;
        case 0x9F: ops.push([op, code[b], code[b] & 2 ? dv.getUint16(b + 1, true) : 0]); break;
        case 0x99: case 0x9D: ops.push([op, p + dv.getInt16(b, true)]); break;
        case 0x87: ops.push([op, code[b]]); break;
        case 0x8A: ops.push([op, dv.getUint16(b, true), code[b + 2]]); break;
        case 0x8D: ops.push([op, code[b]]); break;
        case 0x9B: case 0x8E: {
          let [name, q] = str(b);
          const np = dv.getUint16(q, true); q += 2;
          const params = []; let regCount = 0, flags = 0;
          if (op === 0x8E) {
            regCount = code[q]; flags = dv.getUint16(q + 1, true); q += 3;
            for (let i = 0; i < np; i++) { const reg = code[q++]; const [pn, nq] = str(q); q = nq; params.push([reg, pn]); }
          } else for (let i = 0; i < np; i++) { const [pn, nq] = str(q); q = nq; params.push([0, pn]); }
          const size = dv.getUint16(q, true);
          const info = { name, params, regCount, flags, f2: op === 0x8E, bodyStart: ops.length + 1, bodyEndByte: p + size };
          ops.push([op, info]);
          fnEnds.push(info);
          break;
        }
        case 0x94: ops.push([op, p + dv.getUint16(b, true)]); break;
        default: ops.push([op]);
      }
    }
    at.set(p, ops.length);
    for (const f of fnEnds) f.bodyEnd = at.get(f.bodyEndByte) ?? ops.length;
    d = { ops, at };
    AVM.cache.set(code, d);
    return d;
  },

  // Run a frame / event script: scope is the clip itself.
  runBlock(code, clip, thisObj) {
    const d = AVM.decode(code);
    const ctx = { d, scope: [clip], thisObj: thisObj || clip, target: clip, orig: clip, regs: [], pool: [] };
    AVM.exec(ctx, 0, d.ops.length);
  },

  call(fn, thisObj, args) {
    if (typeof fn === 'function') return fn.apply(thisObj, args);
    if (!(fn instanceof ASFunction)) return undefined;
    const act = Object.create(null);
    const regs = new Array(Math.max(4, fn.regCount + 1));
    if (fn.f2) {
      let r = 1; const fl = fn.flags;
      if (fl & 0x01) regs[r++] = thisObj;
      if (fl & 0x04) regs[r++] = args;
      if (fl & 0x10) regs[r++] = undefined;
      if (fl & 0x40) regs[r++] = Flash.root;
      if (fl & 0x80) regs[r++] = (thisObj instanceof DObj ? thisObj.parent : fn.target && fn.target.parent);
      if (fl & 0x100) regs[r++] = Flash.global;
      if (!(fl & 0x02)) act.this = thisObj;
      if (!(fl & 0x08)) act.arguments = args;
    } else { act.this = thisObj; act.arguments = args; }
    fn.params.forEach(([reg, name], i) => { if (reg) regs[reg] = args[i]; else act[name] = args[i]; });
    const ctx = { d: fn.d, scope: fn.scope.concat([act]), thisObj, target: fn.target, orig: fn.target, regs, pool: fn.pool, act };
    return AVM.exec(ctx, fn.start, fn.end);
  },

  resolveTarget(ctx, path) {
    if (path instanceof DObj) return path;
    if (path === undefined || path === null) return undefined;
    path = String(path);
    if (path === '') return ctx.orig;
    let o = path.startsWith('/') || path.startsWith('_root') || path.startsWith('_level0') ? Flash.root : ctx.target;
    for (const part of path.split(/[.\/:]/)) {
      if (!part || part === '_root' || part === '_level0') continue;
      if (!o) return undefined;
      if (part === '_parent' || part === '..') o = o.parent;
      else if (part === 'this') continue;
      else { const v = AVM.getMember(o, part); o = v instanceof DObj ? v : undefined; }
    }
    return o;
  },

  getVar(ctx, name) {
    if (/[.\/:]/.test(name)) {
      const i = Math.max(name.lastIndexOf('.'), name.lastIndexOf(':'));
      if (i > 0) { const t = AVM.resolveTarget(ctx, name.slice(0, i)); return t === undefined ? undefined : AVM.getMember(t, name.slice(i + 1)); }
      return AVM.resolveTarget(ctx, name);
    }
    switch (name) {
      case 'this': return ctx.thisObj;
      case '_root': case '_level0': return Flash.root;
      case '_parent': return ctx.target && ctx.target.parent;
      case '_global': return Flash.global;
    }
    for (let i = ctx.scope.length - 1; i >= 0; i--) {
      const s = ctx.scope[i];
      if (s instanceof DObj) {
        if (name in s.props) return s.props[name];
        const c = s.child ? s.child(name) : null;
        if (c) return c;
        if (name.charCodeAt(0) === 95) { const v = AVM.getMember(s, name); if (v !== undefined) return v; }
      } else if (name in s) return s[name];
    }
    if (Flash.global && name in Flash.global) return Flash.global[name];
    if (name in GLOBALS) return GLOBALS[name];
    return undefined;
  },

  setVar(ctx, name, v) {
    if (/[.\/:]/.test(name)) {
      const i = Math.max(name.lastIndexOf('.'), name.lastIndexOf(':'));
      if (i > 0) { const t = AVM.resolveTarget(ctx, name.slice(0, i)); if (t !== undefined) AVM.setMember(t, name.slice(i + 1), v); }
      return;
    }
    for (let i = ctx.scope.length - 1; i >= 0; i--) {
      const s = ctx.scope[i];
      if (s instanceof DObj) break;
      if (name in s) { s[name] = v; return; }
    }
    if (ctx.target) AVM.setMember(ctx.target, name, v);
  },

  getMember(o, k) {
    if (o === undefined || o === null) return undefined;
    k = typeof k === 'number' ? k : String(k);
    if (o instanceof DObj) return clipGet(o, k);
    if (Array.isArray(o)) {
      if (k === 'length') return o.length;
      if (typeof k === 'number' || /^\d+$/.test(k)) return o[+k];
      const m = ARRAY_METHODS[k]; if (m) return m.bind(o);
      return o[k];
    }
    if (typeof o === 'string') { if (k === 'length') return o.length; const m = STRING_METHODS[k]; if (m) return m.bind(o); return undefined; }
    if (o instanceof ASFunction) return o.props[k];
    if (typeof o === 'object' || typeof o === 'function') return o[k];
    return undefined;
  },

  setMember(o, k, v) {
    if (o === undefined || o === null) return;
    if (o instanceof DObj) { clipSet(o, String(k), v); return; }
    if (Array.isArray(o)) { if (k === 'length') o.length = toNum(v) | 0; else o[typeof k === 'number' ? k : (/^\d+$/.test(k) ? +k : k)] = v; return; }
    if (o instanceof ASFunction) { o.props[k] = v; return; }
    if (typeof o === 'object') o[k] = v;
  },

  exec(ctx, start, end) {
    const { ops, at } = ctx.d;
    const st = [];
    const pop = () => st.length ? st.pop() : undefined;
    let pc = start, steps = 0;
    while (pc < end) {
      if (++steps > 200000) throw new Error('script too long');
      const o = ops[pc++];
      const op = o[0];
      switch (op) {
        case 0: return undefined;
        case 0x88: ctx.pool = o[1]; break;
        case 0x96: {
          const v = o[1];
          for (let i = 0; i < v.length; i += 2) {
            const t = v[i], x = v[i + 1];
            st.push(t === 0 ? x : t === 1 ? x : t === 2 ? ctx.regs[x] : ctx.pool[x]);
          }
          break;
        }
        case 0x17: pop(); break;
        case 0x4C: st.push(st[st.length - 1]); break;
        case 0x4D: { const a = pop(), b = pop(); st.push(a, b); break; }
        case 0x87: ctx.regs[o[1]] = st[st.length - 1]; break;
        // timeline control on the current target
        case 0x04: { const t = ctx.target; if (t instanceof Clip) { t.goto(t.frame + 1); t.playing = false; } break; }
        case 0x05: { const t = ctx.target; if (t instanceof Clip) { t.goto(t.frame - 1); t.playing = false; } break; }
        case 0x06: if (ctx.target instanceof Clip) ctx.target.play(); break;
        case 0x07: if (ctx.target instanceof Clip) ctx.target.stop(); break;
        case 0x81: { const t = ctx.target; if (t instanceof Clip) { t.goto(o[1] + 1); t.playing = false; } break; }
        case 0x8C: { const t = ctx.target; if (t instanceof Clip) { t.goto(o[1]); t.playing = false; } break; }
        case 0x9F: {
          const f = pop(); const t = ctx.target;
          if (t instanceof Clip) {
            if (typeof f === 'string' && isNaN(Number(f))) {
              const i = f.lastIndexOf(':');
              if (i >= 0) { const tt = AVM.resolveTarget(ctx, f.slice(0, i)); if (tt instanceof Clip) { tt.goto(f.slice(i + 1)); tt.playing = !!(o[1] & 1); } }
              else { t.goto(f); t.playing = !!(o[1] & 1); }
            } else { t.goto(toNum(f) + o[2]); t.playing = !!(o[1] & 1); }
          }
          break;
        }
        case 0x8B: ctx.target = o[1] ? AVM.resolveTarget({ target: ctx.orig, orig: ctx.orig }, o[1]) || ctx.orig : ctx.orig; break;
        case 0x20: { const t = pop(); ctx.target = t ? AVM.resolveTarget({ target: ctx.orig, orig: ctx.orig }, t) || ctx.orig : ctx.orig; break; }
        case 0x8A: case 0x8D: break;
        // arithmetic
        case 0x0A: { const b = pop(), a = pop(); st.push(toNum(a) + toNum(b)); break; }
        case 0x47: { const b = pop(), a = pop(); st.push(typeof a === 'string' || typeof b === 'string' || a instanceof DObj || b instanceof DObj ? toStr(a) + toStr(b) : toNum(a) + toNum(b)); break; }
        case 0x0B: { const b = pop(), a = pop(); st.push(toNum(a) - toNum(b)); break; }
        case 0x0C: { const b = pop(), a = pop(); st.push(toNum(a) * toNum(b)); break; }
        case 0x0D: { const b = pop(), a = pop(); st.push(toNum(a) / toNum(b)); break; }
        case 0x3F: { const b = pop(), a = pop(); st.push(toNum(a) % toNum(b)); break; }
        case 0x50: st.push(toNum(pop()) + 1); break;
        case 0x51: st.push(toNum(pop()) - 1); break;
        case 0x18: st.push(Math.trunc(toNum(pop())) || 0); break;
        case 0x4A: st.push(toNum(pop())); break;
        case 0x4B: st.push(toStr(pop())); break;
        case 0x60: { const b = pop(), a = pop(); st.push(toNum(a) & toNum(b)); break; }
        case 0x61: { const b = pop(), a = pop(); st.push(toNum(a) | toNum(b)); break; }
        case 0x62: { const b = pop(), a = pop(); st.push(toNum(a) ^ toNum(b)); break; }
        case 0x63: { const b = pop(), a = pop(); st.push(toNum(a) << toNum(b)); break; }
        case 0x64: { const b = pop(), a = pop(); st.push(toNum(a) >> toNum(b)); break; }
        case 0x65: { const b = pop(), a = pop(); st.push(toNum(a) >>> toNum(b)); break; }
        // comparison / logic
        case 0x0E: { const b = pop(), a = pop(); st.push(toNum(a) === toNum(b)); break; }
        case 0x0F: { const b = pop(), a = pop(); st.push(toNum(a) < toNum(b)); break; }
        case 0x49: { const b = pop(), a = pop(); st.push(asEquals(a, b)); break; }
        case 0x66: { const b = pop(), a = pop(); st.push(a === b); break; }
        case 0x48: { const b = pop(), a = pop(); st.push(asLess(a, b)); break; }
        case 0x67: { const b = pop(), a = pop(); st.push(asLess(b, a)); break; }
        case 0x10: { const b = pop(), a = pop(); st.push(toBool(a) && toBool(b)); break; }
        case 0x11: { const b = pop(), a = pop(); st.push(toBool(a) || toBool(b)); break; }
        case 0x12: st.push(!toBool(pop())); break;
        case 0x13: { const b = pop(), a = pop(); st.push(toStr(a) === toStr(b)); break; }
        case 0x29: { const b = pop(), a = pop(); st.push(toStr(a) < toStr(b)); break; }
        case 0x68: { const b = pop(), a = pop(); st.push(toStr(a) > toStr(b)); break; }
        case 0x14: case 0x31: st.push(toStr(pop()).length); break;
        case 0x15: case 0x35: { const n = toNum(pop()), i = toNum(pop()), s = toStr(pop()); st.push(s.substr(Math.max(0, i - 1), n)); break; }
        case 0x21: { const b = pop(), a = pop(); st.push(toStr(a) + toStr(b)); break; }
        case 0x32: case 0x36: st.push(toStr(pop()).charCodeAt(0) || 0); break;
        case 0x33: case 0x37: st.push(String.fromCharCode(toNum(pop()))); break;
        case 0x44: { const v = pop(); st.push(v === undefined ? 'undefined' : v === null ? 'null' : v instanceof ASFunction || typeof v === 'function' ? 'function' : v instanceof DObj ? (v instanceof Clip ? 'movieclip' : 'object') : typeof v); break; }
        case 0x30: st.push(Math.floor(Math.random() * Math.max(0, toNum(pop()) || 0))); break;
        case 0x34: st.push(Math.round(performance.now())); break;
        case 0x26: pop(); break;
        // variables
        case 0x1C: st.push(AVM.getVar(ctx, toStr(pop()))); break;
        case 0x1D: { const v = pop(); AVM.setVar(ctx, toStr(pop()), v); break; }
        case 0x3C: { const v = pop(); const n = toStr(pop()); if (ctx.act) ctx.act[n] = v; else AVM.setMember(ctx.target, n, v); break; }
        case 0x41: { const n = toStr(pop()); if (ctx.act) { if (!(n in ctx.act)) ctx.act[n] = undefined; } break; }
        case 0x3A: { const k = pop(); const ob = pop(); if (ob instanceof DObj) delete ob.props[k]; else if (ob && typeof ob === 'object') delete ob[k]; st.push(true); break; }
        case 0x3B: { const n = toStr(pop()); if (ctx.target) delete ctx.target.props[n]; st.push(true); break; }
        case 0x4E: { const k = pop(); const ob = pop(); st.push(AVM.getMember(ob, k)); break; }
        case 0x4F: { const v = pop(); const k = pop(); const ob = pop(); AVM.setMember(ob, k, v); break; }
        case 0x22: { const i = toNum(pop()); const t = AVM.resolveTarget(ctx, pop()); st.push(t ? clipGet(t, PROPS[i]) : undefined); break; }
        case 0x23: { const v = pop(); const i = toNum(pop()); const t = AVM.resolveTarget(ctx, pop()); if (t) clipSet(t, PROPS[i], v); break; }
        // objects
        case 0x42: { const n = toNum(pop()); const a = []; for (let i = 0; i < n; i++) a.push(pop()); st.push(a); break; }
        case 0x43: { const n = toNum(pop()); const ob = {}; for (let i = 0; i < n; i++) { const v = pop(); ob[toStr(pop())] = v; } st.push(ob); break; }
        case 0x40: {
          const name = toStr(pop()); const n = toNum(pop());
          const args = []; for (let i = 0; i < n; i++) args.push(pop());
          if (name === 'Array') st.push(ASArray(...args));
          else if (name === 'Object') st.push({});
          else { const f = AVM.getVar(ctx, name); if (f instanceof ASFunction) { const ob = {}; AVM.call(f, ob, args); st.push(ob); } else st.push({}); }
          break;
        }
        case 0x53: { const m = pop(); const ob = pop(); const n = toNum(pop()); for (let i = 0; i < n; i++) pop(); st.push({}); break; }
        // calls
        case 0x3D: {
          const name = toStr(pop()); const n = toNum(pop());
          const args = []; for (let i = 0; i < n; i++) args.push(pop());
          const f = AVM.getVar(ctx, name);
          st.push(f !== undefined ? AVM.call(f, ctx.target, args) : undefined);
          break;
        }
        case 0x52: {
          const m = pop(); const ob = pop(); const n = toNum(pop());
          const args = []; for (let i = 0; i < n; i++) args.push(pop());
          if (m === undefined || m === '') st.push(AVM.call(ob, ctx.thisObj, args));
          else { const f = AVM.getMember(ob, m); st.push(f !== undefined ? AVM.call(f, ob, args) : undefined); }
          break;
        }
        case 0x3E: return pop();
        case 0x9B: case 0x8E: {
          const info = o[1];
          const fn = new ASFunction({ name: info.name, params: info.params, regCount: info.regCount, flags: info.flags, f2: info.f2,
            d: ctx.d, start: info.bodyStart, end: info.bodyEnd, scope: ctx.scope.slice(), target: ctx.target, pool: ctx.pool });
          if (info.name) { if (ctx.act) ctx.act[info.name] = fn; else AVM.setMember(ctx.target, info.name, fn); }
          else st.push(fn);
          pc = info.bodyEnd;
          break;
        }
        // control flow
        case 0x99: pc = at.get(o[1]) ?? end; break;
        case 0x9D: if (toBool(pop())) pc = at.get(o[1]) ?? end; break;
        case 0x94: pop(); break;
        // movie clip helpers
        case 0x25: { const t = AVM.resolveTarget(ctx, pop()); if (t) t.remove(); break; }
        case 0x24: pop(); pop(); pop(); break;
        case 0x83: if (Flash.onURL) Flash.onURL(o[1], o[2]); break;
        case 0x9A: { const w = pop(); const u = pop(); if (Flash.onURL) Flash.onURL(toStr(u), toStr(w)); break; }
        case 0x09: if (Flash.onStopSounds) Flash.onStopSounds(); break;
        case 0x08: break;
        default: break;
      }
    }
    return undefined;
  },
};

function asEquals(a, b) {
  if (a === b) return true;
  if ((a === undefined || a === null) && (b === undefined || b === null)) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (typeof a === 'object' || typeof b === 'object' || typeof a === 'function' || typeof b === 'function') return false;
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  return toNum(a) === toNum(b);
}
function asLess(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a < b;
  return toNum(a) < toNum(b);
}

const ARRAY_METHODS = {
  push(...v) { this.push(...v); return this.length; },
  pop() { return this.pop(); },
  shift() { return this.shift(); },
  unshift(...v) { this.unshift(...v); return this.length; },
  splice(...a) { return this.splice(toNum(a[0]), ...(a.length > 1 ? [toNum(a[1]), ...a.slice(2)] : [])); },
  slice(a, b) { return this.slice(a, b); },
  join(s) { return this.map(toStr).join(s === undefined ? ',' : toStr(s)); },
  concat(...a) { return this.concat(...a); },
  reverse() { return this.reverse(); },
  sort() { return this.sort(); },
  toString() { return toStr(this); },
};
const STRING_METHODS = {
  charAt(i) { return this.charAt(i); }, charCodeAt(i) { return this.charCodeAt(i); }, indexOf(s, i) { return this.indexOf(s, i); },
  substr(a, b) { return this.substr(a, b); }, substring(a, b) { return this.substring(a, b); }, split(s) { return this.split(s); },
  toUpperCase() { return this.toUpperCase(); }, toLowerCase() { return this.toLowerCase(); }, slice(a, b) { return this.slice(a, b); },
};

// ------------------------------------------------------------------ movie clip properties for scripts
function clipGet(o, k) {
  switch (k) {
    case '_x': return o.x;
    case '_y': return o.y;
    case '_xscale': return o.xscale;
    case '_yscale': return o.yscale;
    case '_rotation': return o.rotation;
    case '_alpha': return o.alpha * 100;
    case '_visible': return o.visible;
    case '_width': { const b = localBounds(o, true); return b ? b.x1 - b.x0 : 0; }
    case '_height': { const b = localBounds(o, true); return b ? b.y1 - b.y0 : 0; }
    case '_currentframe': return o.frame || 1;
    case '_totalframes': case '_framesloaded': return o.totalFrames || 1;
    case '_name': return o.name;
    case '_parent': return o.parent || undefined;
    case '_root': return Flash.root;
    case '_target': return targetPath(o).replace(/\./g, '/') || '/';
    case '_xmouse': { const p = mApply(mInv(o.worldMatrix()), Flash.mouse.x, Flash.mouse.y); return p[0]; }
    case '_ymouse': { const p = mApply(mInv(o.worldMatrix()), Flash.mouse.x, Flash.mouse.y); return p[1]; }
    case 'text': if (o.def.type === 'edittext') return o.text; break;
  }
  if (k in o.props) return o.props[k];
  if (o instanceof Clip) {
    const c = o.child(k);
    if (c) return c;
    const m = CLIP_METHODS[k];
    if (m) return m.bind(o);
  }
  return undefined;
}
function clipSet(o, k, v) {
  switch (k) {
    case '_x': { const n = toNum(v); if (!isNaN(n)) o.x = n; return; }
    case '_y': { const n = toNum(v); if (!isNaN(n)) o.y = n; return; }
    case '_xscale': { const n = toNum(v); if (!isNaN(n)) o.xscale = n; return; }
    case '_yscale': { const n = toNum(v); if (!isNaN(n)) o.yscale = n; return; }
    case '_rotation': { const n = toNum(v); if (!isNaN(n)) o.rotation = n; return; }
    case '_alpha': { const n = toNum(v); if (!isNaN(n)) o.alpha = n / 100; return; }
    case '_visible': o.visible = toBool(v); return;
    case '_width': case '_height': {
      const n = toNum(v); const b = localBounds(o, true);
      if (!b || isNaN(n)) return;
      const cur = k === '_width' ? b.x1 - b.x0 : b.y1 - b.y0;
      if (cur > 0) { if (k === '_width') o.xscale = o.xscale * n / cur; else o.yscale = o.yscale * n / cur; }
      return;
    }
    case '_name': o.name = toStr(v); return;
    case 'text': if (o.def.type === 'edittext') { o.text = toStr(v); return; } break;
  }
  o.props[k] = v;
}

// bounds in parent coordinates (cached for clips whose look did not change)
function localBounds(o, inParent) {
  const key = o instanceof Clip ? o.frame + ':' + o.children.size : 'x';
  if (!o._lb || o._lbk !== key) {
    const save = o.matrix; o.matrix = IDENT;
    o._lb = boundsOf(o, IDENT); o._lbk = key;
    o.matrix = save;
  }
  const b = o._lb;
  if (!isFinite(b.x0)) return null;
  if (!inParent) return b;
  const m = o.matrix;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
    const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5];
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  return { x0, y0, x1, y1 };
}

const CLIP_METHODS = {
  gotoAndStop(f) { this.playing = false; this.goto(f); },
  gotoAndPlay(f) { this.playing = true; this.goto(f); },
  play() { this.play(); },
  stop() { this.stop(); },
  nextFrame() { this.playing = false; this.goto(this.frame + 1); },
  prevFrame() { this.playing = false; this.goto(this.frame - 1); },
  attachMovie(link, name, depth) { return this.attachMovie(toStr(link), name, depth); },
  createEmptyMovieClip(name, depth) { return this.createEmpty(name, depth); },
  removeMovieClip() { this.remove(); },
  getBytesLoaded() { return 1; },
  getBytesTotal() { return 1; },
  getURL(u, w) { if (Flash.onURL) Flash.onURL(toStr(u), toStr(w)); },
  hitTest(a, b, shape) {
    if (a instanceof DObj) {
      const r1 = boundsOf(this, this.parent ? this.parent.worldMatrix() : IDENT), r2 = boundsOf(a, a.parent ? a.parent.worldMatrix() : IDENT);
      return r1.x0 <= r2.x1 && r2.x0 <= r1.x1 && r1.y0 <= r2.y1 && r2.y0 <= r1.y1;
    }
    const x = toNum(a), y = toNum(b);
    const pm = this.parent ? this.parent.worldMatrix() : IDENT;
    if (toBool(shape)) return hitObj(this, pm, x, y);
    const lb = localBounds(this, false);
    if (!lb) return false;
    const p = mApply(mInv(mMul(pm, this.matrix)), x, y);
    return p[0] >= lb.x0 && p[0] <= lb.x1 && p[1] >= lb.y0 && p[1] <= lb.y1;
  },
  swapDepths() {},
  getDepth() { return this.depth - DYN; },
};

if (typeof module !== 'undefined') module.exports = { Flash, DObj, Clip, ButtonObj, makeInstance, runQueue, AVM };
