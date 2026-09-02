/* 特效：粒子池、曳光弹、枪口火焰、爆炸、燃烧区、烟雾、弹壳、伤害飘字 */
import * as THREE from '../vendor/three.module.min.js';

const MAXP = 4200;

export class FX {
  constructor(scene, camera, domLayer) {
    this.scene = scene; this.camera = camera; this.dom = domLayer;
    this.t = 0;
    this._initParticles();
    this._initTracers();
    this._initDecals();
    this.explosions = [];
    this.burns = [];
    this.smokes = [];
    this.flashLights = [];
    this.numbers = [];
    this.numPool = [];
    this._v = new THREE.Vector3();
  }

  _initParticles() {
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAXP * 3);
    this.pCol = new Float32Array(MAXP * 3);
    this.pSize = new Float32Array(MAXP);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size; varying vec3 vC;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * 320.0 / max(0.001,-mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){ vec2 d = gl_PointCoord - vec2(0.5);
          float a = smoothstep(0.5, 0.05, length(d));
          if(a < 0.02) discard;
          gl_FragColor = vec4(vC, a); }`,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.parts = [];
    for (let i = 0; i < MAXP; i++) this.parts.push({ a: false, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, r: 1, g: 1, b: 1, grav: 1, drag: 0.98, fade: 1 });
    this.pi = 0;
  }

  _initTracers() {
    this.tracers = [];
    this.tracerPool = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracerGeoProto = geo;
  }

  _initDecals() {
    this.decals = [];
    this.decalGeo = new THREE.CircleGeometry(0.3, 8);
  }

  spawn(x, y, z, vx, vy, vz, life, size, col, grav, drag) {
    let tries = 0, p;
    do { this.pi = (this.pi + 1) % MAXP; p = this.parts[this.pi]; tries++; } while (p.a && tries < MAXP);
    p.a = true; p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.max = life; p.size = size;
    p.r = ((col >> 16) & 255) / 255; p.g = ((col >> 8) & 255) / 255; p.b = (col & 255) / 255;
    p.grav = grav == null ? 1 : grav;
    p.drag = drag == null ? 0.96 : drag;
    return p;
  }

  sparks(x, y, z, nx, ny, nz, n, col, spd) {
    n = n || 10; col = col == null ? 0xffc25a : col; spd = spd || 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * 0.9;
      const rx = nx + Math.cos(a) * b, ry = ny + Math.sin(b) * 0.9 + 0.3, rz = nz + Math.sin(a) * b;
      const s = spd * (0.4 + Math.random());
      this.spawn(x, y, z, rx * s, ry * s, rz * s, 0.18 + Math.random() * 0.3, 0.055 + Math.random() * 0.05, col, 1.6, 0.9);
    }
  }

  blood(x, y, z, nx, ny, nz, n, col) {
    col = col == null ? 0x4ad9ff : col;
    for (let i = 0; i < (n || 12); i++) {
      const s = 3 + Math.random() * 5;
      this.spawn(x, y, z,
        (nx + (Math.random() - .5)) * s, (ny + Math.random() * .8) * s, (nz + (Math.random() - .5)) * s,
        0.25 + Math.random() * 0.35, 0.06 + Math.random() * 0.07, col, 2.0, 0.92);
    }
  }

  muzzle(x, y, z, dx, dy, dz, col, scale) {
    scale = scale || 1;
    for (let i = 0; i < 7; i++) {
      const s = (5 + Math.random() * 9) * scale;
      this.spawn(x, y, z,
        dx * s + (Math.random() - .5) * 3, dy * s + (Math.random() - .5) * 3, dz * s + (Math.random() - .5) * 3,
        0.05 + Math.random() * 0.05, (0.11 + Math.random() * 0.13) * scale, col, 0.1, 0.85);
    }
    this.flash(x, y, z, col, 2.6 * scale, 0.06);
  }

  shell(x, y, z, dx, dz) {
    this.spawn(x, y, z, -dz * 3 + (Math.random() - .5), 2.4 + Math.random(), dx * 3 + (Math.random() - .5),
      1.1, 0.045, 0xd9a441, 1, 0.98);
  }

  tracer(x0, y0, z0, x1, y1, z1, col, life) {
    let t = this.tracerPool.pop();
    if (!t) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      t = new THREE.Line(g, m);
      t.frustumCulled = false;
      this.scene.add(t);
    }
    const p = t.geometry.attributes.position.array;
    p[0] = x0; p[1] = y0; p[2] = z0; p[3] = x1; p[4] = y1; p[5] = z1;
    t.geometry.attributes.position.needsUpdate = true;
    t.material.color.setHex(col == null ? 0xffd27a : col);
    t.material.opacity = 1;
    t.visible = true;
    this.tracers.push({ o: t, life: life || 0.07, max: life || 0.07 });
  }

  flash(x, y, z, col, intensity, life) {
    const l = new THREE.PointLight(col, intensity, 26, 2);
    l.position.set(x, y, z);
    this.scene.add(l);
    this.flashLights.push({ l, life: life || 0.1, max: life || 0.1, i: intensity });
  }

  explosion(x, y, z, radius, col) {
    col = col == null ? 0xff9a3c : col;
    const geo = new THREE.SphereGeometry(1, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .85, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(radius * 0.28);
    this.scene.add(m);
    this.explosions.push({ m, life: 0.55, max: 0.55, r: radius });
    this.flash(x, y + 1, z, col, 20, 0.3);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
      const s = (6 + Math.random() * 16) * (radius / 7);
      this.spawn(x, y + .6, z, Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s * .8 + 2, Math.sin(a) * Math.cos(e) * s,
        0.4 + Math.random() * 0.5, 0.16 + Math.random() * 0.24, i % 3 ? col : 0xfff0b0, 1.1, 0.93);
    }
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn(x, y + .4, z, Math.cos(a) * 3, 1.6 + Math.random() * 2, Math.sin(a) * 3,
        1.2 + Math.random(), 0.5 + Math.random() * 0.7, 0x3a3a3a, -0.15, 0.95);
    }
    this.decal(x, z, radius * 0.5, 0x1a1108);
  }

  decal(x, z, r, col) {
    const m = new THREE.Mesh(this.decalGeo, new THREE.MeshBasicMaterial({
      color: col == null ? 0x140d06 : col, transparent: true, opacity: .55, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.035 + Math.random() * 0.01, z);
    m.scale.setScalar(r / 0.3);
    this.scene.add(m);
    this.decals.push({ m, life: 22, max: 22 });
    if (this.decals.length > 80) { const d = this.decals.shift(); this.scene.remove(d.m); d.m.material.dispose(); }
  }

  burn(x, z, radius, dur) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshBasicMaterial({
      color: 0xff6a1e, transparent: true, opacity: .34, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z);
    this.scene.add(m);
    const b = { m, x, z, r: radius, life: dur, max: dur };
    this.burns.push(b);
    return b;
  }

  smoke(x, z, radius, dur) {
    const grp = new THREE.Group();
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(radius * (0.4 + Math.random() * 0.35), 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xc8ccd2, transparent: true, opacity: .5, depthWrite: false }));
      s.position.set((Math.random() - .5) * radius * 1.5, Math.random() * radius * .8 + .6, (Math.random() - .5) * radius * 1.5);
      grp.add(s);
    }
    grp.position.set(x, 0, z);
    this.scene.add(grp);
    const sm = { g: grp, x, z, r: radius, life: dur, max: dur };
    this.smokes.push(sm);
    return sm;
  }

  /* 伤害飘字（DOM，投影到屏幕） */
  damageNumber(x, y, z, value, kind) {
    let el = this.numPool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'dmgnum'; this.dom.appendChild(el); }
    el.textContent = kind === 'head' ? Math.round(value) + '!' : Math.round(value);
    el.className = 'dmgnum ' + (kind || '');
    el.style.opacity = '1';
    this.numbers.push({ el, x, y, z, life: 0.85, max: 0.85, up: 0, dx: (Math.random() - .5) * 22 });
  }

  update(dt) {
    this.t += dt;
    // 粒子
    const pos = this.pPos, col = this.pCol, sz = this.pSize;
    for (let i = 0; i < MAXP; i++) {
      const p = this.parts[i];
      if (!p.a) { sz[i] = 0; pos[i * 3 + 1] = -9999; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.a = false; sz[i] = 0; pos[i * 3 + 1] = -9999; continue; }
      p.vy -= 9.8 * p.grav * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.04 && p.grav > 0) { p.y = 0.04; p.vy *= -0.28; p.vx *= .7; p.vz *= .7; }
      const k = p.life / p.max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.r * k; col[i * 3 + 1] = p.g * k; col[i * 3 + 2] = p.b * k;
      sz[i] = p.size * (0.35 + k * 0.65);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.points.geometry.attributes.size.needsUpdate = true;

    // 曳光
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { t.o.visible = false; this.tracerPool.push(t.o); this.tracers.splice(i, 1); }
      else t.o.material.opacity = t.life / t.max;
    }
    // 爆炸球
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      const k = 1 - e.life / e.max;
      e.m.scale.setScalar(e.r * (0.28 + k * 0.95));
      e.m.material.opacity = Math.max(0, 0.9 * (1 - k * k));
      if (e.life <= 0) { this.scene.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); this.explosions.splice(i, 1); }
    }
    // 闪光
    for (let i = this.flashLights.length - 1; i >= 0; i--) {
      const f = this.flashLights[i];
      f.life -= dt;
      if (f.life <= 0) { this.scene.remove(f.l); f.l.dispose && f.l.dispose(); this.flashLights.splice(i, 1); }
      else f.l.intensity = f.i * (f.life / f.max);
    }
    // 燃烧区
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.life -= dt;
      b.m.material.opacity = 0.2 + Math.sin(this.t * 9 + i) * 0.08 + 0.14 * Math.min(1, b.life / 1.5);
      if (Math.random() < dt * 26) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * b.r;
        this.spawn(b.x + Math.cos(a) * r, 0.15, b.z + Math.sin(a) * r,
          (Math.random() - .5), 2.4 + Math.random() * 2.4, (Math.random() - .5),
          0.5 + Math.random() * 0.4, 0.2 + Math.random() * 0.2, Math.random() < .6 ? 0xff7a24 : 0xffd05a, -0.25, 0.95);
      }
      if (b.life <= 0) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.burns.splice(i, 1); }
    }
    // 烟雾
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.life -= dt;
      const k = Math.min(1, (s.max - s.life) / 1.2);
      s.g.children.forEach((c, j) => {
        c.material.opacity = 0.5 * k * Math.min(1, s.life / 2);
        c.position.y += dt * 0.12;
      });
      s.g.scale.setScalar(0.5 + k * 0.5);
      if (s.life <= 0) { this.scene.remove(s.g); this.smokes.splice(i, 1); }
    }
    // 弹坑淡出
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < 3) d.m.material.opacity = 0.55 * (d.life / 3);
      if (d.life <= 0) { this.scene.remove(d.m); d.m.material.dispose(); this.decals.splice(i, 1); }
    }
    // 伤害数字
    const cam = this.camera, W = innerWidth, H = innerHeight;
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.life -= dt; n.up += dt * 46;
      if (n.life <= 0) { n.el.style.opacity = '0'; n.el.style.transform = 'translate(-9999px,-9999px)'; this.numPool.push(n.el); this.numbers.splice(i, 1); continue; }
      this._v.set(n.x, n.y, n.z).project(cam);
      if (this._v.z > 1) { n.el.style.opacity = '0'; continue; }
      const sx = (this._v.x * 0.5 + 0.5) * W + n.dx * (1 - n.life / n.max);
      const sy = (-this._v.y * 0.5 + 0.5) * H - n.up;
      const k = n.life / n.max;
      n.el.style.transform = `translate(${sx}px,${sy}px) scale(${0.8 + k * 0.45})`;
      n.el.style.opacity = String(Math.min(1, k * 2.2));
    }
  }

  burnDamageAt(x, z) {
    for (const b of this.burns) {
      const dx = x - b.x, dz = z - b.z;
      if (dx * dx + dz * dz < b.r * b.r) return true;
    }
    return false;
  }

  smokeBlocks(x0, z0, x1, z1) {
    for (const s of this.smokes) {
      // 线段到圆心距离
      const dx = x1 - x0, dz = z1 - z0;
      const l2 = dx * dx + dz * dz;
      let t = l2 ? ((s.x - x0) * dx + (s.z - z0) * dz) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + dx * t - s.x, pz = z0 + dz * t - s.z;
      if (px * px + pz * pz < s.r * s.r * 0.8) return true;
    }
    return false;
  }
}
