/* 音频：WebAudio 合成的音效与“主机架”电子乐（全部原创） */
'use strict';
(function (U) {
  let ctx = null, master = null, sfxBus = null, musicBus = null, musicFilter = null, noiseBuf = null;
  let muted = false, musicOn = true;
  try { muted = localStorage.getItem('uch_muted') === '1'; } catch (_) { /* 无存储 */ }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp);
    comp.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 900;
    musicFilter.Q.value = 0.7;
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.42;
    musicBus.connect(musicFilter);
    musicFilter.connect(master);
    // 白噪声
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function env(g, t, a, d, peak, sus = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
  }

  function tone(type, f0, f1, dur, vol, opts = {}) {
    if (!ctx || muted) return;
    const t = now() + (opts.delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    env(g, t, opts.attack || 0.005, dur, vol);
    let node = o;
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter;
      f.frequency.value = opts.ff || 1200;
      f.Q.value = opts.q || 1;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.bus || sfxBus);
    o.start(t);
    o.stop(t + (opts.attack || 0.005) + dur + 0.05);
  }

  function noise(dur, vol, ftype, f0, f1, opts = {}) {
    if (!ctx || muted) return;
    const t = now() + (opts.delay || 0);
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(f0 || 1000, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = opts.q || 0.8;
    const g = ctx.createGain();
    env(g, t, opts.attack || 0.004, dur, vol);
    s.connect(f);
    f.connect(g);
    g.connect(opts.bus || sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.1);
  }

  let lastPlay = {};
  function throttle(name, ms) {
    const n = performance.now();
    if (lastPlay[name] && n - lastPlay[name] < ms) return false;
    lastPlay[name] = n;
    return true;
  }

  const SFX = {
    jump() { if (!throttle('jump', 40)) return; tone('square', 330, 640, 0.12, 0.09, { filter: 'lowpass', ff: 2400 }); },
    walljump() { tone('square', 420, 820, 0.12, 0.09, { filter: 'lowpass', ff: 2600 }); noise(0.06, 0.08, 'highpass', 2000); },
    land(v) { if (!throttle('land', 60)) return; noise(0.08, Math.min(0.25, 0.05 + v * 0.01), 'lowpass', 500, 120); },
    slide() { if (!throttle('slide', 90)) return; noise(0.09, 0.035, 'bandpass', 2600, 1800, { q: 3 }); },
    bounce() { tone('sine', 180, 720, 0.25, 0.22); tone('triangle', 360, 1100, 0.2, 0.08, { delay: 0.02 }); },
    death() {
      noise(0.35, 0.3, 'lowpass', 1800, 150);
      tone('square', 520, 90, 0.35, 0.1, { filter: 'lowpass', ff: 1500 });
      tone('sine', 900, 1200, 0.08, 0.08, { delay: 0.02 });
    },
    goal() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((f, i) => tone('square', f, f, 0.16, 0.08, { delay: i * 0.08, filter: 'lowpass', ff: 3000 }));
      tone('triangle', 1568, 1568, 0.4, 0.06, { delay: 0.32 });
    },
    boxDrop() { noise(0.25, 0.25, 'lowpass', 600, 100); tone('sine', 120, 60, 0.25, 0.25); },
    boxOpen() {
      noise(0.3, 0.18, 'bandpass', 1500, 5000, { q: 1.5 });
      [660, 880, 1320].forEach((f, i) => tone('triangle', f, f * 1.02, 0.15, 0.07, { delay: 0.05 + i * 0.05 }));
    },
    pick() { tone('square', 700, 1400, 0.1, 0.08, { filter: 'lowpass', ff: 3000 }); tone('sine', 1400, 1400, 0.12, 0.06, { delay: 0.07 }); },
    hover() { if (!throttle('hover', 50)) return; tone('sine', 1200, 1250, 0.04, 0.035); },
    place() { noise(0.12, 0.3, 'lowpass', 900, 150); tone('sine', 150, 70, 0.14, 0.25); },
    invalid() { if (!throttle('invalid', 150)) return; tone('square', 180, 150, 0.14, 0.07, { filter: 'lowpass', ff: 900 }); },
    rotate() { tone('triangle', 900, 1100, 0.05, 0.06); },
    bomb() {
      noise(0.9, 0.55, 'lowpass', 2400, 60);
      tone('sine', 110, 30, 0.8, 0.45);
      noise(0.4, 0.2, 'highpass', 3000, 800, { delay: 0.05 });
    },
    fuse() { noise(0.4, 0.06, 'highpass', 5000, 3000); },
    arrow() { if (!throttle('arrow', 80)) return; tone('triangle', 900, 300, 0.12, 0.05); noise(0.1, 0.05, 'highpass', 3000, 6000); },
    thunk() { if (!throttle('thunk', 80)) return; noise(0.06, 0.08, 'lowpass', 1200, 300); },
    flame() { if (!throttle('flame', 300)) return; noise(1.2, 0.07, 'bandpass', 700, 400, { q: 0.6, attack: 0.08 }); },
    coin() { tone('square', 988, 988, 0.07, 0.07, { filter: 'lowpass', ff: 4000 }); tone('square', 1319, 1319, 0.22, 0.07, { delay: 0.07, filter: 'lowpass', ff: 4000 }); },
    tick(i) { tone('square', 500 + (i || 0) * 60, 500 + (i || 0) * 60, 0.05, 0.05, { filter: 'lowpass', ff: 2500 }); },
    segment(i) { tone('triangle', 440 * Math.pow(1.122, i || 0), 440 * Math.pow(1.122, i || 0) * 1.5, 0.18, 0.1); },
    circuit() { if (!throttle('circuit', 45)) return; tone('square', 1800 + Math.random() * 600, 2400, 0.03, 0.02, { filter: 'bandpass', ff: 2500, q: 2 }); },
    materialize() {
      for (let i = 0; i < 6; i++) tone('square', 300 + i * 150, 600 + i * 200, 0.06, 0.035, { delay: i * 0.05, filter: 'lowpass', ff: 3000 });
    },
    derez() { noise(0.4, 0.08, 'bandpass', 3000, 400, { q: 2 }); },
    spawn() { tone('sine', 400, 900, 0.12, 0.1); noise(0.1, 0.08, 'bandpass', 3000, 1500); },
    ready() { tone('square', 660, 660, 0.12, 0.07, { filter: 'lowpass', ff: 2500 }); },
    go() { tone('square', 990, 990, 0.3, 0.09, { filter: 'lowpass', ff: 3000 }); tone('square', 1320, 1320, 0.3, 0.05, { filter: 'lowpass', ff: 3000 }); },
    click() { tone('triangle', 800, 1000, 0.05, 0.08); },
    fanfare() {
      const seq = [523, 523, 659, 784, 659, 784, 1047];
      seq.forEach((f, i) => tone('square', f, f, i === seq.length - 1 ? 0.6 : 0.13, 0.08, { delay: i * 0.13, filter: 'lowpass', ff: 3500 }));
      seq.forEach((f, i) => tone('triangle', f / 2, f / 2, 0.12, 0.06, { delay: i * 0.13 }));
    },
    tooEasy() { [600, 500, 400].forEach((f, i) => tone('square', f, f * 0.95, 0.16, 0.07, { delay: i * 0.14, filter: 'lowpass', ff: 1800 })); },
    saw() { if (!throttle('saw', 500)) return; tone('sawtooth', 110, 105, 0.5, 0.012, { filter: 'bandpass', ff: 1600, q: 4 }); },
  };

  // ---------------- 音乐：128 BPM 机房电子乐 ----------------
  const BPM = 128;
  const STEP = 60 / BPM / 4; // 16 分音符
  let seqTimer = null, nextTime = 0, stepIdx = 0, musicPlaying = false;
  // A 小调：Am - F - C - G
  const CHORDS = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ];
  const BASS = [45, 41, 48, 43];
  // 主旋律（每小节 16 步，-1 为休止）
  const LEAD = [
    [76, -1, 76, 79, -1, 76, 74, -1, 72, -1, 74, -1, 76, -1, -1, -1],
    [77, -1, 76, 74, -1, 72, -1, 69, -1, 72, 74, -1, 72, -1, -1, -1],
    [72, -1, 72, 76, -1, 79, -1, 76, 79, -1, 84, -1, 83, -1, 79, -1],
    [79, -1, 77, 76, -1, 74, -1, 71, -1, 74, 76, -1, 74, -1, 71, -1],
  ];
  // “嘟嘟嘟嘟”机器人元音段（每 4 小节的后两小节）
  const DOO = [
    [69, -1, -1, 69, -1, -1, 69, -1, 69, -1, -1, -1, -1, -1, -1, -1],
    [67, -1, -1, 67, -1, -1, 67, -1, 71, -1, -1, -1, -1, -1, -1, -1],
  ];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function mTone(type, freq, t, dur, vol, cutoff) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    let n = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      n = f;
    }
    n.connect(g);
    g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function kick(t) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g);
    g.connect(musicBus);
    o.start(t);
    o.stop(t + 0.22);
  }
  function hat(t, open) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(open ? 0.12 : 0.07, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.12 : 0.04));
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.15);
  }
  function snare(t) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.16);
    mTone('triangle', 190, t, 0.08, 0.12);
  }
  // 机器人“嘟”：锯齿波 + 两个共振峰
  function doo(freq, t, dur) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq * 0.97, t);
    o.frequency.linearRampToValueAtTime(freq, t + 0.04);
    const g = ctx.createGain();
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 350; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 800; f2.Q.value = 8;
    const mixG = ctx.createGain();
    mixG.gain.value = 1;
    o.connect(f1); o.connect(f2);
    f1.connect(g); f2.connect(g);
    g.connect(musicBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.02);
    g.gain.setValueAtTime(0.55, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function scheduleStep(i, t) {
    const bar = Math.floor(i / 16) % 8;
    const s = i % 16;
    const chordI = bar % 4;
    const section = Math.floor(i / 128) % 2; // 0: 主旋律段 1: 嘟嘟段
    // 鼓
    if (s % 4 === 0) kick(t);
    if (s % 8 === 4) snare(t);
    if (s % 2 === 1) hat(t, s % 4 === 3);
    // 贝斯：八分音符八度跳
    if (s % 2 === 0) {
      const m = BASS[chordI] + (s % 4 === 2 ? 12 : 0);
      mTone('square', mtof(m), t, STEP * 1.6, 0.16, 700);
    }
    // 琶音
    const ch = CHORDS[chordI];
    const arp = ch[(s % 3)] + 12 + (s % 6 >= 3 ? 12 : 0);
    mTone('triangle', mtof(arp), t, STEP * 0.9, 0.05);
    // 主旋律 / 嘟嘟
    if (section === 0) {
      const n = LEAD[chordI][s];
      if (n > 0) mTone('square', mtof(n), t, STEP * 1.8, 0.07, 2600);
    } else if (bar >= 4) {
      const n = DOO[bar % 2][s];
      if (n > 0) doo(mtof(n - 12), t, STEP * 2.5);
    } else {
      const n = LEAD[chordI][s];
      if (n > 0 && s % 2 === 0) mTone('square', mtof(n - 12), t, STEP * 1.5, 0.05, 1500);
    }
  }

  function scheduler() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(stepIdx, nextTime);
      nextTime += STEP;
      stepIdx++;
    }
  }

  function startMusic() {
    if (!ensure() || musicPlaying || !musicOn) return;
    musicPlaying = true;
    nextTime = ctx.currentTime + 0.1;
    stepIdx = 0;
    seqTimer = setInterval(scheduler, 30);
  }
  function stopMusic() {
    musicPlaying = false;
    if (seqTimer) clearInterval(seqTimer);
    seqTimer = null;
  }
  // mode: 'menu'（低通）| 'run'（全频）
  function musicMode(mode) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = mode === 'run' ? 16000 : mode === 'score' ? 1400 : 900;
    musicFilter.frequency.cancelScheduledValues(t);
    musicFilter.frequency.setTargetAtTime(f, t, 0.25);
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('uch_muted', m ? '1' : '0'); } catch (_) { /* 无存储 */ }
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
  }

  U.Audio = {
    unlock, startMusic, stopMusic, musicMode, setMuted,
    get muted() { return muted; },
    play(name, arg) {
      if (!ctx || muted) return;
      const f = SFX[name];
      if (f) f(arg);
    },
  };
})(window.UCH);
