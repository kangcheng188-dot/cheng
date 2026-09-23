'use strict';
// Procedural sound effects (Web Audio). No samples are shipped; every sound is synthesized.

const Sfx = {
  ctx: null, master: null, noiseBuf: null, on: true, musicOn: true, last: {},
  music: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.on ? 0.55 : 0;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.value = v ? 0.55 : 0;
  },
  // throttle identical sounds so big battles stay pleasant
  ok(name, gap) {
    const t = performance.now();
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  },
  noise(dur, freq, q, vol, type = 'lowpass', sweep) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  tone(freq, dur, vol, type = 'square', slide, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  play(name) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'hit': if (this.ok(name, 45)) this.noise(0.09, 900, 1, 0.35); break;
      case 'metal': if (this.ok(name, 60)) { this.tone(1300 + Math.random() * 400, 0.12, 0.08, 'triangle', 700); this.noise(0.05, 3000, 2, 0.15, 'highpass'); } break;
      case 'swing': if (this.ok(name, 60)) this.noise(0.12, 1800, 3, 0.12, 'bandpass', 500); break;
      case 'sling': if (this.ok(name, 60)) this.noise(0.14, 2400, 4, 0.1, 'bandpass', 900); break;
      case 'bow': if (this.ok(name, 60)) { this.tone(220, 0.08, 0.1, 'triangle', 120); this.noise(0.1, 2600, 3, 0.08, 'bandpass'); } break;
      case 'musket': if (this.ok(name, 70)) { this.noise(0.35, 1400, 0.8, 0.5, 'lowpass', 200); } break;
      case 'gun': if (this.ok(name, 45)) { this.noise(0.12, 2600, 0.8, 0.35, 'lowpass', 600); } break;
      case 'mg': if (this.ok(name, 35)) { this.noise(0.07, 3200, 0.8, 0.28, 'lowpass', 900); } break;
      case 'cannon': if (this.ok(name, 90)) { this.noise(0.6, 600, 0.7, 0.7, 'lowpass', 80); this.tone(90, 0.3, 0.3, 'sine', 40); } break;
      case 'boom': if (this.ok(name, 70)) { this.noise(0.9, 900, 0.6, 0.8, 'lowpass', 60); this.tone(70, 0.5, 0.35, 'sine', 30); } break;
      case 'catapult': if (this.ok(name, 90)) { this.tone(160, 0.12, 0.15, 'sawtooth', 70); this.noise(0.2, 700, 2, 0.15, 'bandpass'); } break;
      case 'egg': if (this.ok(name, 60)) this.tone(900, 0.05, 0.06, 'square', 1400); break;
      case 'splat': if (this.ok(name, 60)) this.noise(0.15, 500, 1, 0.2); break;
      case 'laser': if (this.ok(name, 50)) this.tone(1600, 0.12, 0.08, 'square', 300); break;
      case 'ion': if (this.ok(name, 50)) this.tone(900, 0.18, 0.08, 'sawtooth', 2400); break;
      case 'rocket': if (this.ok(name, 80)) this.noise(0.5, 1800, 1, 0.3, 'bandpass', 300); break;
      case 'oil': if (this.ok(name, 150)) this.noise(0.6, 300, 1, 0.2); break;
      case 'die': if (this.ok(name, 80)) this.tone(260 + Math.random() * 60, 0.18, 0.06, 'sawtooth', 120); break;
      case 'coin': if (this.ok(name, 60)) { this.tone(1320, 0.07, 0.07, 'square'); this.tone(1760, 0.12, 0.07, 'square', null, 0.06); } break;
      case 'click': this.tone(700, 0.05, 0.08, 'triangle', 500); break;
      case 'buy': this.tone(520, 0.06, 0.08, 'triangle'); this.tone(780, 0.08, 0.08, 'triangle', null, 0.05); break;
      case 'deny': this.tone(180, 0.15, 0.1, 'square', 120); break;
      case 'build': this.noise(0.25, 600, 1, 0.3); this.tone(200, 0.12, 0.12, 'triangle', 300); break;
      case 'evolve': [0, 4, 7, 12].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.35, 0.1, 'triangle', null, i * 0.12)); break;
      case 'special': this.noise(1.2, 400, 0.7, 0.5, 'lowpass', 80); this.tone(110, 0.8, 0.2, 'sawtooth', 55); break;
      case 'heal': [0, 5, 9, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.5, 0.06, 'sine', null, i * 0.08)); break;
      case 'plane': this.noise(3.5, 200, 3, 0.2, 'bandpass', 120); break;
      case 'win': [0, 4, 7, 12, 7, 12].forEach((n, i) => this.tone(392 * Math.pow(2, n / 12), 0.4, 0.1, 'triangle', null, i * 0.16)); break;
      case 'lose': [7, 3, 0, -5].forEach((n, i) => this.tone(330 * Math.pow(2, n / 12), 0.5, 0.1, 'triangle', null, i * 0.22)); break;
    }
  },
  // a light looping march in the spirit of the original's music
  startMusic() {
    if (!this.ctx || this.music) return;
    const c = this.ctx;
    const bus = c.createGain(); bus.gain.value = 0.16; bus.connect(this.master);
    const notes = [0, 0, 7, 5, 3, 3, 5, 7, 8, 7, 5, 3, 2, 3, 5, 2];
    const bass = [0, 0, -4, -4, -2, -2, -5, -5];
    let step = 0;
    const tick = () => {
      if (!this.musicOn || !this.on) { step++; return; }
      const t = c.currentTime + 0.05;
      const base = 196;
      if (step % 2 === 0) {
        const n = notes[(step / 2) % notes.length];
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = base * Math.pow(2, n / 12);
        const g = c.createGain(); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.35);
      }
      if (step % 4 === 0) {
        const n = bass[(step / 4) % bass.length];
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = base / 2 * Math.pow(2, n / 12);
        const g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.55);
      }
      // snare-ish drum on the off beats
      if (step % 4 === 2) {
        const src = c.createBufferSource(); src.buffer = this.noiseBuf;
        const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
        const g = c.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        src.connect(f); f.connect(g); g.connect(bus); src.start(t); src.stop(t + 0.15);
      }
      step++;
    };
    this.music = setInterval(tick, 150);
  },
};
