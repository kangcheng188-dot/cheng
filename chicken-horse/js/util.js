/* 超级鸡马 · 主机架 —— 通用工具 */
'use strict';
window.UCH = window.UCH || {};
(function (U) {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const approach = (v, target, amount) =>
    v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);

  // 可复现的随机数（mulberry32）
  function makeRng(seed) {
    let a = seed >>> 0;
    const rng = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.range = (lo, hi) => lo + (hi - lo) * rng();
    rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (p) => rng() < p;
    return rng;
  }
  const R = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);

  const ease = {
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inCubic: (t) => t * t * t,
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    },
    outBounce: (t) => {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    },
  };

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  // amt > 0 变亮，amt < 0 变暗（-1..1）
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    if (amt >= 0) return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
    return rgbToHex(r * (1 + amt), g * (1 + amt), b * (1 + amt));
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const FONT_CN = '"ZCOOL KuaiLe","Fredoka","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC",sans-serif';
  const FONT_UI = '"Fredoka","ZCOOL KuaiLe","PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif';

  // 原作风格：粗描边白字
  function drawText(ctx, str, x, y, o = {}) {
    const size = o.size || 20;
    ctx.save();
    ctx.font = `${o.weight || 700} ${size}px ${o.font || FONT_CN}`;
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = o.baseline || 'middle';
    if (o.rot) {
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      x = 0; y = 0;
    }
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.shadow !== false) {
      ctx.fillStyle = o.shadowColor || 'rgba(10,14,30,.55)';
      const sd = o.shadowDist != null ? o.shadowDist : size * 0.08;
      ctx.lineJoin = 'round';
      if (o.stroke !== false) {
        ctx.strokeStyle = o.shadowColor || 'rgba(10,14,30,.55)';
        ctx.lineWidth = o.lw != null ? o.lw : size * 0.22;
        ctx.strokeText(str, x, y + sd);
      }
      ctx.fillText(str, x, y + sd);
    }
    if (o.stroke !== false) {
      ctx.strokeStyle = o.strokeColor || '#1b1830';
      ctx.lineWidth = o.lw != null ? o.lw : size * 0.22;
      ctx.lineJoin = 'round';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = o.color || '#fff';
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function measure(ctx, str, size, font) {
    ctx.save();
    ctx.font = `700 ${size}px ${font || FONT_CN}`;
    const w = ctx.measureText(str).width;
    ctx.restore();
    return w;
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function aabbOverlap(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }
  function circleRect(cx, cy, r, x0, y0, x1, y1) {
    const nx = clamp(cx, x0, x1), ny = clamp(cy, y0, y1);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  U.util = { clamp, lerp, sign, approach, makeRng, R, ease, hexToRgb, rgbToHex, shade, rgba, mix, roundRect, drawText, measure, dist, aabbOverlap, circleRect, FONT_CN, FONT_UI };

  // 全局常量
  U.C = {
    W: 46,
    H: 26,
    DT: 1 / 60,
    PLAYER_COLORS: ['#ff5a4f', '#3f8cff', '#3cc95b', '#ffc234'],
    PLAYER_NAMES: ['1P', '2P', '3P', '4P'],
    POINTS_TO_WIN: 5,
    PTS: { goal: 1.0, first: 0.2, trap: 0.2, solo: 0.6, coin: 0.2, comeback: 0.6 },
    RUN_TIME_LIMIT: 60,
    PLACE_TIME_LIMIT: 30,
  };
})(window.UCH);
