/* ===========================================================
   Sfx — 纯 WebAudio 合成音效，不依赖任何外部资源
   =========================================================== */
(function (global) {
  'use strict';

  var Sfx = {
    ctx: null,
    master: null,
    enabled: true,
    _lastPulse: 0,

    init: function () {
      if (this.ctx) return;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    },

    /** 浏览器要求用户手势后才能出声 */
    resume: function () {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    setEnabled: function (on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.32 : 0;
    },

    _tone: function (o) {
      if (!this.enabled || !this.ctx) return;
      var ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + o.dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.gain || 0.2, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    },

    _noise: function (dur, gain, freq, delay) {
      if (!this.enabled || !this.ctx) return;
      var ctx = this.ctx, t0 = ctx.currentTime + (delay || 0);
      var n = Math.floor(ctx.sampleRate * dur);
      var buf = ctx.createBuffer(1, n, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      var src = ctx.createBufferSource(); src.buffer = buf;
      var flt = ctx.createBiquadFilter(); flt.type = 'bandpass';
      flt.frequency.value = freq || 900; flt.Q.value = 0.9;
      var g = ctx.createGain(); g.gain.value = gain || 0.15;
      src.connect(flt); flt.connect(g); g.connect(this.master);
      src.start(t0);
    },

    /* ---------- 具体音效 ---------- */

    connect: function () { this._tone({ f: 220, f2: 520, dur: 0.22, type: 'triangle', gain: 0.18 }); },

    reject: function () { this._tone({ f: 160, f2: 90, dur: 0.16, type: 'square', gain: 0.09 }); },

    cut: function () { this._noise(0.2, 0.22, 1600); this._tone({ f: 700, f2: 200, dur: 0.14, type: 'sawtooth', gain: 0.08 }); },

    inject: function () {
      this._tone({ f: 300, f2: 1100, dur: 0.18, type: 'sawtooth', gain: 0.16 });
      this._noise(0.22, 0.18, 2200, 0.02);
    },

    pulse: function () {
      // 输送能量的滴答声：限流，避免同一帧堆叠
      var now = performance.now();
      if (now - this._lastPulse < 55) return;
      this._lastPulse = now;
      this._tone({ f: 640 + Math.random() * 90, dur: 0.05, type: 'sine', gain: 0.045 });
    },

    capture: function (mine) {
      var base = mine ? 330 : 200;
      this._tone({ f: base, dur: 0.3, type: 'triangle', gain: 0.16 });
      this._tone({ f: base * 1.5, dur: 0.3, type: 'triangle', gain: 0.11, delay: 0.06 });
      this._tone({ f: base * 2, dur: 0.34, type: 'sine', gain: 0.09, delay: 0.12 });
    },

    evolve: function () {
      this._tone({ f: 420, f2: 840, dur: 0.28, type: 'triangle', gain: 0.11 });
    },

    win: function () {
      var n = [392, 494, 587, 784];
      for (var i = 0; i < n.length; i++) this._tone({ f: n[i], dur: 0.55, type: 'triangle', gain: 0.15, delay: i * 0.13 });
    },

    lose: function () {
      var n = [330, 262, 220, 165];
      for (var i = 0; i < n.length; i++) this._tone({ f: n[i], dur: 0.6, type: 'sawtooth', gain: 0.1, delay: i * 0.17 });
    },

    click: function () { this._tone({ f: 520, dur: 0.05, type: 'square', gain: 0.06 }); }
  };

  global.Sfx = Sfx;
})(window);
