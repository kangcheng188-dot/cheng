/* WebAudio 合成音效 —— 无任何外部音频资源 */

let ctx = null, master = null, musicGain = null, sfxGain = null;
let noiseBuf = null;
let started = false;

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);

  const len = ctx.sampleRate * 2;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
  started = true;
}
export function setVolume(v) { if (master) master.gain.value = v; }
export function audioReady() { return !!ctx && started; }

function noise(dur, gain, filterType, freq, q) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = filterType || 'lowpass';
  f.frequency.value = freq || 1200; if (q) f.Q.value = q;
  const g = ctx.createGain();
  s.connect(f); f.connect(g); g.connect(sfxGain);
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.start(t); s.stop(t + dur + 0.02);
  return { src: s, filter: f, gain: g, t };
}

function tone(type, f0, f1, dur, gain, delay) {
  const o = ctx.createOscillator(); o.type = type;
  const g = ctx.createGain();
  o.connect(g); g.connect(sfxGain);
  const t = ctx.currentTime + (delay || 0);
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
  return o;
}

/* 距离衰减系数 */
function att(dist) {
  if (dist == null) return 1;
  return Math.max(0.05, 1 - dist / 140);
}

const SFX = {
  pistol(d) { const a = att(d) * 0.5; noise(0.11, a, 'bandpass', 1500, 1.2); tone('square', 320, 90, 0.07, a * 0.35); },
  rifle(d)  { const a = att(d) * 0.6; noise(0.13, a, 'bandpass', 1150, 1.0); tone('sawtooth', 240, 70, 0.08, a * 0.4); tone('sine', 90, 45, 0.12, a * 0.35); },
  smg(d)    { const a = att(d) * 0.45; noise(0.09, a, 'bandpass', 1750, 1.4); tone('square', 300, 110, 0.05, a * 0.3); },
  shotgun(d){ const a = att(d) * 0.75; noise(0.28, a, 'lowpass', 900); tone('sawtooth', 150, 40, 0.2, a * 0.5); },
  sniper(d) { const a = att(d) * 0.9; noise(0.42, a, 'lowpass', 1400); tone('sawtooth', 180, 38, 0.3, a * 0.6); tone('sine', 70, 30, 0.5, a * 0.4); },
  lmg(d)    { const a = att(d) * 0.6; noise(0.12, a, 'bandpass', 1000, 0.9); tone('sawtooth', 210, 60, 0.09, a * 0.42); },
  minigun(d){ const a = att(d) * 0.42; noise(0.07, a, 'bandpass', 1300, 1.1); tone('square', 260, 120, 0.04, a * 0.28); },
  bow(d)    { const a = att(d) * 0.5; noise(0.07, a, 'highpass', 2600); tone('triangle', 900, 300, 0.09, a * 0.25); },
  tesla(d)  { const a = att(d) * 0.45; noise(0.13, a, 'highpass', 1800); tone('sawtooth', 1400, 260, 0.12, a * 0.22); },
  rpg(d)    { const a = att(d) * 0.8; noise(0.5, a, 'lowpass', 700); tone('sawtooth', 130, 45, 0.4, a * 0.5); },
  pan(d)    { const a = att(d) * 0.6; tone('triangle', 1400, 420, 0.28, a * 0.4); tone('sine', 700, 220, 0.34, a * 0.25); noise(0.1, a * 0.4, 'bandpass', 2600, 3); },
  spin()    { tone('sawtooth', 90, 340, 0.6, 0.16); },
  dryfire() { noise(0.05, 0.22, 'highpass', 3000); },
  reload()  { noise(0.07, 0.3, 'bandpass', 900, 3); noise(0.07, 0.26, 'bandpass', 1500, 3); setTimeout(() => ctx && noise(0.09, 0.3, 'bandpass', 700, 3), 220); },
  hit()     { tone('square', 1500, 900, 0.05, 0.2); },
  headshot(){ tone('square', 2400, 1200, 0.09, 0.3); tone('sine', 1200, 600, 0.12, 0.2); },
  kill()    { tone('triangle', 900, 1500, 0.1, 0.22); tone('triangle', 1500, 2100, 0.1, 0.18, 0.08); },
  hurt()    { noise(0.2, 0.4, 'lowpass', 500); tone('sawtooth', 180, 60, 0.22, 0.22); },
  explode(d){ const a = att(d) * 0.95; noise(0.75, a, 'lowpass', 480); tone('sine', 110, 26, 0.62, a * 0.6); tone('sawtooth', 70, 22, 0.5, a * 0.4); },
  pickup()  { tone('sine', 700, 1250, 0.1, 0.22); },
  drone(d)  { const a = att(d) * 0.25; const n = noise(0.4, a, 'bandpass', 420, 6); },
  arc(d)    { const a = att(d) * 0.5; noise(0.22, a, 'highpass', 2200); tone('sawtooth', 800, 120, 0.2, a * 0.2); },
  siren()   { tone('sawtooth', 380, 760, 0.75, 0.2); tone('sawtooth', 760, 380, 0.75, 0.18, 0.75); },
  wave()    { tone('sine', 220, 440, 0.4, 0.3); tone('sine', 330, 660, 0.5, 0.24, 0.18); },
  boss()    { tone('sawtooth', 70, 34, 1.6, 0.5); tone('square', 140, 60, 1.3, 0.22); noise(1.4, 0.4, 'lowpass', 300); },
  heartbeat(){ tone('sine', 60, 32, 0.16, 0.5); tone('sine', 55, 28, 0.14, 0.36, 0.24); },
  heli()    { for (let i = 0; i < 24; i++) setTimeout(() => { if (ctx) { noise(0.06, 0.2, 'lowpass', 260); tone('sine', 70, 50, 0.06, 0.14); } }, i * 110); },
  win()     { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.4, 0.25, i * 0.16)); },
  lose()    { [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.5, 0.22, i * 0.22)); },
  ui()      { tone('sine', 900, 1200, 0.06, 0.16); },
  shield()  { tone('square', 400, 200, 0.12, 0.2); noise(0.1, 0.2, 'bandpass', 800, 4); },
  evolve()  { [660, 880, 1170, 1320].forEach((f, i) => tone('triangle', f, f * 1.2, 0.22, 0.2, i * 0.07)); },
};

export function sfx(name, dist) {
  if (!ctx || ctx.state !== 'running') return;
  const fn = SFX[name];
  if (fn) { try { fn(dist); } catch (e) { /* ignore */ } }
}

/* ── 战斗环境 BGM：低频脉冲 + 缓慢和声 ── */
let musicNodes = null;
export function startMusic(intense) {
  if (!ctx) return;
  stopMusic();
  const t = ctx.currentTime;
  const nodes = [];
  const base = intense ? 55 : 41.2;
  [1, 1.5, 2.02].forEach((mul, i) => {
    const o = ctx.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'sine';
    o.frequency.value = base * mul;
    const g = ctx.createGain(); g.gain.value = i === 0 ? 0.16 : 0.07;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400;
    o.connect(f); f.connect(g); g.connect(musicGain); o.start(t);
    nodes.push(o);
  });
  const lfo = ctx.createOscillator(); lfo.frequency.value = intense ? 1.6 : 0.7;
  const lg = ctx.createGain(); lg.gain.value = 0.09;
  lfo.connect(lg); lg.connect(musicGain.gain); lfo.start(t);
  nodes.push(lfo);
  musicNodes = nodes;
}
export function stopMusic() {
  if (musicNodes) { musicNodes.forEach(n => { try { n.stop(); } catch (e) {} }); musicNodes = null; }
}
