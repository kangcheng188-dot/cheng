'use strict';
// Plays the original game's own sounds (MP3 and raw PCM from the SWF) through Web Audio: event
// sounds started by timeline frames, the streamed intro sound and the looping battle music.

const Snd = {
  ctx: null, master: null, buffers: new Map(), decoding: new Map(), playing: new Map(), muted: false,

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.9; },

  // decode a DefineSound once; returns a promise of an AudioBuffer (or null)
  buffer(id) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    if (this.decoding.has(id)) return this.decoding.get(id);
    const def = Flash.swf.chars.get(id);
    if (!def || def.type !== 'sound' || !this.ctx) return Promise.resolve(null);
    let p;
    if (def.fmt === 2) p = this.decodeMp3(def.data.subarray(2));
    else if (def.fmt === 3 || def.fmt === 0) p = Promise.resolve(this.pcm(def));
    else p = Promise.resolve(null);
    p = p.then(b => { this.buffers.set(id, b); return b; }, () => { this.buffers.set(id, null); return null; });
    this.decoding.set(id, p);
    return p;
  },
  decodeMp3(u8) {
    const ab = u8.slice().buffer;
    return new Promise((ok, bad) => { const r = this.ctx.decodeAudioData(ab, ok, bad); if (r && r.then) r.then(ok, bad); });
  },
  pcm(def) {
    const ch = def.stereo ? 2 : 1;
    const bytes = def.bits16 ? 2 : 1;
    const n = Math.floor(def.data.length / (bytes * ch));
    const buf = this.ctx.createBuffer(ch, n, def.rate);
    const dv = new DataView(def.data.buffer, def.data.byteOffset, def.data.byteLength);
    for (let c = 0; c < ch; c++) {
      const out = buf.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const o = (i * ch + c) * bytes;
        out[i] = bytes === 2 ? dv.getInt16(o, true) / 32768 : (def.data[o] - 128) / 128;
      }
    }
    return buf;
  },
  // preload everything in the background after the first tap, so the first shots are not silent
  preloadAll() { if (!this.ctx) return; for (const c of Flash.swf.chars.values()) if (c.type === 'sound') this.buffer(c.id); },

  onStartSound(id, info) {
    if (!this.ctx) return;
    if (info.stop) { this.stop(id); return; }
    if (info.noMultiple && this.playing.get(id) && this.playing.get(id).size) return;
    this.buffer(id).then(b => { if (b) this.play(id, b, info.loops); });
  },
  play(id, b, loops) {
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    if (loops > 1) { src.loop = true; src.loopCount = loops; }
    src.connect(this.master);
    let set = this.playing.get(id); if (!set) this.playing.set(id, set = new Set());
    set.add(src);
    src.onended = () => set.delete(src);
    src.start();
    if (loops > 1 && loops < 1000) src.stop(this.ctx.currentTime + b.duration * loops);
  },
  stop(id) { const set = this.playing.get(id); if (set) { for (const s of set) { try { s.stop(); } catch (e) {} } set.clear(); } },
  stopAll() { for (const id of this.playing.keys()) this.stop(id); },

  // streamed sound of a sprite (the intro animation): join the MP3 blocks and play once
  onStream(def) {
    if (!this.ctx || !def.stream || def.stream.fmt !== 2) return;
    const key = 'stream' + def.id;
    let p = this.decoding.get(key);
    if (!p) {
      const total = def.stream.blocks.reduce((n, b) => n + b.length, 0);
      const all = new Uint8Array(total); let o = 0;
      for (const b of def.stream.blocks) { all.set(b, o); o += b.length; }
      p = this.decodeMp3(all).catch(() => null);
      this.decoding.set(key, p);
    }
    p.then(b => { if (b) this.play(key, b, 1); });
  },
};
