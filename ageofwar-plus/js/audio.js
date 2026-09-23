'use strict';
// Age of War Plus audio: sampled CC0 sound effects (Kenney) with stereo position, streamed music
// (cynicmusic, CC0) and a synthesized fallback for anything not loaded yet.

const SFX_FILES = ['punch1', 'punch2', 'punch3', 'punchH1', 'punchH2', 'metal1', 'metal2', 'metal3', 'plate1', 'plate2',
  'slash1', 'slash2', 'draw1', 'wood1', 'wood2', 'plank', 'rock1', 'rock2', 'soft1', 'soft2', 'boom1', 'boom2', 'boom3',
  'boomBig', 'boomBig2', 'laser1', 'laser2', 'laserBig', 'laserRetro', 'force', 'thruster', 'engine', 'coin1', 'coin2',
  'click', 'select', 'confirm', 'deny', 'open', 'close', 'tick', 'latch', 'powerUp', 'jVictory', 'jDefeat', 'jEvolve',
  'jEnemyEvolve', 'jAchieve', 'jWarn'];

// sound event -> [sample variants, volume, pitch jitter, throttle ms]
const SFX_MAP = {
  hit: [['punch1', 'punch2', 'punch3'], 0.45, 0.12, 45],
  hitHeavy: [['punchH1', 'punchH2'], 0.55, 0.1, 60],
  metal: [['metal1', 'metal2', 'metal3', 'plate1'], 0.32, 0.12, 50],
  slash: [['slash1', 'slash2'], 0.35, 0.1, 60],
  boom: [['boom1', 'boom2', 'boom3'], 0.5, 0.1, 60],
  boomBig: [['boomBig', 'boomBig2'], 0.8, 0.05, 120],
  catapult: [['wood1', 'wood2'], 0.45, 0.08, 80],
  rock: [['rock1', 'rock2'], 0.35, 0.12, 60],
  laser: [['laser1', 'laser2'], 0.22, 0.1, 45],
  ion: [['laserRetro'], 0.22, 0.1, 50],
  laserBig: [['laserBig'], 0.5, 0.05, 80],
  force: [['force'], 0.5, 0, 200],
  coin: [['coin1', 'coin2'], 0.3, 0.1, 70],
  click: [['click'], 0.5, 0.05, 30],
  select: [['select'], 0.5, 0.05, 30],
  buy: [['confirm'], 0.45, 0.05, 40],
  deny: [['deny'], 0.45, 0, 120],
  open: [['open'], 0.45, 0, 60],
  close: [['close'], 0.45, 0, 60],
  tick: [['tick'], 0.4, 0, 30],
  build: [['plank', 'latch'], 0.6, 0.05, 80],
  evolve: [['jEvolve'], 0.8, 0, 500],
  enemyEvolve: [['jEnemyEvolve'], 0.7, 0, 500],
  win: [['jVictory'], 0.9, 0, 500],
  lose: [['jDefeat'], 0.9, 0, 500],
  achieve: [['jAchieve'], 0.7, 0, 400],
  warn: [['jWarn'], 0.7, 0, 400],
  special: [['thruster'], 0.6, 0, 300],
  plane: [['engine'], 0.55, 0, 800],
  powerUp: [['powerUp'], 0.45, 0, 200],
  thud: [['soft1', 'soft2'], 0.35, 0.1, 60],
};

const Sfx = {
  ctx: null, master: null, sfxBus: null, musicBus: null, noiseBuf: null,
  buf: {}, last: {}, on: true, musicOn: true, sfxVol: 0.8, musicVol: 0.5,
  track: null, audioEls: {}, loadStarted: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    this.applyVolumes();
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loadAll();
  },
  applyVolumes() {
    if (!this.master) return;
    this.master.gain.value = this.on ? 1 : 0;
    this.sfxBus.gain.value = this.sfxVol * 0.9;
    this.musicBus.gain.value = this.musicOn ? this.musicVol * 0.6 : 0;
    for (const k in this.audioEls) { const el = this.audioEls[k]; if (!el._routed) el.volume = this.on && this.musicOn ? this.musicVol * 0.6 : 0; }
  },
  setOn(v) { this.on = v; this.applyVolumes(); if (!v) this.pauseMusic(); else if (this.track) this.playMusic(this.track, true); },
  loadAll() {
    if (this.loadStarted) return;
    this.loadStarted = true;
    for (const name of SFX_FILES) {
      fetch('audio/' + name + '.mp3').then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
        .then(ab => new Promise((ok, bad) => { const p = this.ctx.decodeAudioData(ab, ok, bad); if (p && p.then) p.then(ok, bad); }))
        .then(b => { this.buf[name] = b; }).catch(() => {});
    }
  },
  ok(name, gap) {
    const t = performance.now();
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  },
  // pan / attenuate by the world x position relative to the camera
  spatial(x) {
    if (x === undefined || !S) return { pan: 0, g: 1 };
    const cx = S.camX + viewW / 2;
    const dx = (x - cx) / (viewW / 2);
    const off = Math.abs(dx) > 1.1;
    return { pan: clamp(dx * 0.55, -0.8, 0.8), g: off ? 0.45 : 1 };
  },
  sample(name, vol, rate, x) {
    const b = this.buf[name];
    if (!b) return false;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = b; src.playbackRate.value = rate;
    const g = c.createGain();
    const sp = this.spatial(x);
    g.gain.value = vol * sp.g;
    src.connect(g);
    if (c.createStereoPanner && sp.pan) { const p = c.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); p.connect(this.sfxBus); }
    else g.connect(this.sfxBus);
    src.start();
    return true;
  },
  noise(dur, freq, q, vol, type = 'lowpass', sweep, x) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    const g = c.createGain(); const sp = this.spatial(x);
    g.gain.setValueAtTime(vol * sp.g, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g);
    if (c.createStereoPanner && sp.pan) { const p = c.createStereoPanner(); p.pan.value = sp.pan; g.connect(p); p.connect(this.sfxBus); } else g.connect(this.sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  },
  tone(freq, dur, vol, type = 'square', slide, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // synthesized sounds for weapons that have no sample
  synth(name, x) {
    switch (name) {
      case 'sling': this.noise(0.14, 2400, 4, 0.1, 'bandpass', 900, x); break;
      case 'bow': this.tone(220, 0.08, 0.08, 'triangle', 120); this.noise(0.1, 2600, 3, 0.07, 'bandpass', undefined, x); break;
      case 'musket': this.noise(0.4, 1500, 0.8, 0.45, 'lowpass', 180, x); break;
      case 'gun': this.noise(0.12, 2600, 0.8, 0.3, 'lowpass', 600, x); break;
      case 'mg': this.noise(0.07, 3200, 0.8, 0.24, 'lowpass', 900, x); break;
      case 'cannon': this.noise(0.7, 600, 0.7, 0.6, 'lowpass', 70, x); this.tone(85, 0.3, 0.25, 'sine', 38); break;
      case 'egg': this.tone(900, 0.05, 0.05, 'square', 1400); break;
      case 'oil': this.noise(0.6, 300, 1, 0.18, 'lowpass', undefined, x); break;
      case 'rocket': this.noise(0.5, 1800, 1, 0.26, 'bandpass', 300, x); break;
      case 'die': this.tone(240 + Math.random() * 60, 0.16, 0.04, 'sawtooth', 110); break;
      case 'heal': [0, 5, 9, 12, 16].forEach((n, i) => this.tone(523 * Math.pow(2, n / 12), 0.5, 0.05, 'sine', null, i * 0.08)); break;
      default: {
        // fallback when a sample is still loading
        if (name === 'boom' || name === 'boomBig') this.noise(0.8, 800, 0.6, 0.6, 'lowpass', 60, x);
        else if (name === 'coin') { this.tone(1320, 0.07, 0.06, 'square'); this.tone(1760, 0.1, 0.06, 'square', null, 0.06); }
        else if (name === 'click' || name === 'select' || name === 'tick') this.tone(700, 0.05, 0.07, 'triangle', 500);
        else if (name === 'deny') this.tone(180, 0.15, 0.08, 'square', 120);
        else this.noise(0.08, 900, 1, 0.25, 'lowpass', undefined, x);
      }
    }
  },
  play(name, x) {
    if (!this.ctx || !this.on || this.sfxVol <= 0) return;
    const m = SFX_MAP[name];
    if (!m) { if (this.ok(name, 45)) this.synth(name, x); return; }
    if (!this.ok(name, m[3])) return;
    const v = m[0][(Math.random() * m[0].length) | 0];
    const rate = 1 + (Math.random() * 2 - 1) * m[2];
    if (!this.sample(v, m[1], rate, x)) this.synth(name, x);
    if (name === 'build' && this.buf.latch) setTimeout(() => this.sample('latch', 0.4, 1), 120);
  },
  // ---------------------------------------------------------------- music (streamed)
  musicEl(track) {
    if (this.audioEls[track]) return this.audioEls[track];
    const el = new Audio('audio/music_' + track + '.mp3');
    el.loop = true; el.preload = 'auto'; el.crossOrigin = 'anonymous';
    try {
      if (this.ctx && this.ctx.createMediaElementSource) {
        const node = this.ctx.createMediaElementSource(el);
        node.connect(this.musicBus); el._routed = true;
      }
    } catch (e) { el._routed = false; }
    this.audioEls[track] = el;
    this.applyVolumes();
    return el;
  },
  playMusic(track, force) {
    if (!this.ctx) { this.track = track; return; }
    if (this.track === track && !force) { const el = this.audioEls[track]; if (el && !el.paused) return; }
    for (const k in this.audioEls) if (k !== track) this.audioEls[k].pause();
    this.track = track;
    if (!this.on || !this.musicOn) return;
    const el = this.musicEl(track);
    const p = el.play(); if (p && p.catch) p.catch(() => {});
  },
  pauseMusic() { for (const k in this.audioEls) this.audioEls[k].pause(); },
  setMusicOn(v) { this.musicOn = v; this.applyVolumes(); if (v && this.track) this.playMusic(this.track, true); else this.pauseMusic(); },
};
