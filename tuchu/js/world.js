/* 场景构建：废土基地 / 丧尸营地，掩体、油桶、哨塔、封锁线、撤离点 */
import * as THREE from '../vendor/three.module.min.js';

export const GROUND = 220;

const THEME = {
  wasteland: {
    sky: [0x2b1c10, 0xd98a3c, 0x8a5a24],
    fog: 0xb07a3e, fogNear: 60, fogFar: 210,
    ground: 0x9c7b4d, ground2: 0x8a6a40,
    sun: 0xffe0b0, sunI: 2.5, hemi: 0xffe6c0, hemiG: 0xa07f52, hemiI: 1.35,
    amb: 0xa08868, ambI: 1.05, fill: 0xffb877, fillI: 0.75,
    concrete: 0xbdb6a6, metal: 0x939aa0, rust: 0xb0724a,
    night: false,
  },
  zombie: {
    sky: [0x05070f, 0x14263a, 0x0a1220],
    fog: 0x0d1522, fogNear: 35, fogFar: 165,
    ground: 0x3c4436, ground2: 0x2e3629,
    sun: 0xa8ceff, sunI: 1.15, hemi: 0x9dc0ee, hemiG: 0x39472e, hemiI: 0.95,
    amb: 0x54627a, ambI: 0.95, fill: 0x6f8fbf, fillI: 0.5,
    concrete: 0x8b918e, metal: 0x767d82, rust: 0x8a6449,
    night: true,
  },
};

export class World {
  constructor(scene, renderer, mapId) {
    this.scene = scene;
    this.mapId = mapId;
    this.theme = THEME[mapId] || THEME.wasteland;
    this.colliders = [];     // {x0,z0,x1,z1,y0,y1,soft}
    this.barrels = [];       // 可引爆油桶
    this.gates = [];         // 刷新门 8 方位
    this.props = [];
    this.lights = [];
    this.blockadeR = 82;
    this.build(renderer);
  }

  build(renderer) {
    const T = this.theme, S = this.scene;
    S.background = this.makeSky();
    S.fog = new THREE.Fog(T.fog, T.fogNear, T.fogFar);

    const hemi = new THREE.HemisphereLight(T.hemi, T.hemiG, T.hemiI);
    S.add(hemi);
    const amb = new THREE.AmbientLight(T.amb, T.ambI);
    S.add(amb);
    const sun = new THREE.DirectionalLight(T.sun, T.sunI);
    sun.position.set(-70, 90, 48);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = -95; c.right = 95; c.top = 95; c.bottom = -95; c.near = 1; c.far = 260;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.03;
    S.add(sun); S.add(sun.target);
    this.sun = sun;
    // 补光：从相反方向打亮背面，避免角色/掩体变成剪影
    const fill = new THREE.DirectionalLight(T.fill, T.fillI);
    fill.position.set(60, 42, -70);
    S.add(fill);
    this.fill = fill;

    this.buildGround();
    this.buildCompound();
    this.buildContainers();
    this.buildSandbags();
    this.buildTowers();
    this.buildWrecks();
    this.buildBarrels();
    this.buildFences();
    this.buildDust();
    this.buildBlockade();
    this.buildExtraction();
    this.buildGates();
  }

  makeSky() {
    const cvs = document.createElement('canvas');
    cvs.width = 8; cvs.height = 256;
    const g = cvs.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    const [a, b, cc] = this.theme.sky;
    grd.addColorStop(0, '#' + a.toString(16).padStart(6, '0'));
    grd.addColorStop(0.62, '#' + b.toString(16).padStart(6, '0'));
    grd.addColorStop(1, '#' + cc.toString(16).padStart(6, '0'));
    g.fillStyle = grd; g.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(cvs);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  groundTexture() {
    const cvs = document.createElement('canvas');
    cvs.width = cvs.height = 512;
    const g = cvs.getContext('2d');
    const base = '#' + this.theme.ground.toString(16).padStart(6, '0');
    const alt = '#' + this.theme.ground2.toString(16).padStart(6, '0');
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = Math.random() * 9 + 1;
      g.fillStyle = Math.random() < 0.5 ? alt : base;
      g.globalAlpha = 0.35 + Math.random() * 0.4;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 0.16; g.strokeStyle = '#000';
    for (let i = 0; i < 90; i++) {
      g.beginPath();
      const x = Math.random() * 512, y = Math.random() * 512;
      g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 90, y + (Math.random() - .5) * 90);
      g.lineWidth = Math.random() * 2; g.stroke();
    }
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(46, 46);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  buildGround() {
    const geo = new THREE.PlaneGeometry(GROUND * 2, GROUND * 2, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: this.groundTexture(), roughness: 1, metalness: 0 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    this.scene.add(m);
    this.ground = m;

    /* 沥青停机坪 */
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(13, 40),
      new THREE.MeshStandardMaterial({ color: 0x2e2e30, roughness: .95 })
    );
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.02, -62);
    pad.receiveShadow = true; this.scene.add(pad);
    const hMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: .8 });
    [[0, 0, 1.4, 9], [-3.2, 0, 1.2, 4], [3.2, 0, 1.2, 4]].forEach(([dx, dz, w, h]) => {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), hMat);
      b.rotation.x = -Math.PI / 2; b.position.set(dx, 0.04, -62 + dz);
      this.scene.add(b);
    });
  }

  mat(color, rough = 0.85, metal = 0.05) {
    return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }

  /* 添加一个盒子障碍：位置为中心底面 */
  box(x, y, z, w, h, d, material, rotY = 0, opts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = opts.noShadow ? false : true;
    m.receiveShadow = true;
    this.scene.add(m);
    if (!opts.ghost) {
      // 旋转后的包围盒（保守取轴对齐外接）
      const cs = Math.abs(Math.cos(rotY)), sn = Math.abs(Math.sin(rotY));
      const hw = (w * cs + d * sn) / 2, hd = (w * sn + d * cs) / 2;
      this.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: y, y1: y + h });
    }
    this.props.push(m);
    return m;
  }

  buildCompound() {
    const T = this.theme;
    const cm = this.mat(T.concrete, 0.95);
    const dm = this.mat(T.concrete === 0x8f8a7e ? 0x77726a : 0x4b504e, 0.95);
    // 中央主楼（两层，带缺口）
    this.box(0, 0, 6, 26, 0.6, 20, dm);                 // 地台
    this.box(-12, 0.6, 6, 1.2, 7, 20, cm);              // 西墙
    this.box(12, 0.6, 6, 1.2, 7, 20, cm);               // 东墙
    this.box(-4.5, 0.6, -3.4, 16, 7, 1.2, cm);          // 北墙左
    this.box(9.5, 0.6, -3.4, 4, 7, 1.2, cm);            // 北墙右（留门）
    this.box(0, 0.6, 15.4, 24, 7, 1.2, cm);             // 南墙
    this.box(0, 7.6, 6, 26, 0.7, 20, dm);               // 楼板（屋顶）
    // 屋顶矮墙
    this.box(-12.6, 8.3, 6, 0.6, 1.3, 20, cm);
    this.box(12.6, 8.3, 6, 0.6, 1.3, 20, cm);
    this.box(0, 8.3, -3.9, 26, 1.3, 0.6, cm);
    this.box(0, 8.3, 15.9, 26, 1.3, 0.6, cm);
    // 楼内隔断
    this.box(-4, 0.6, 8, 0.9, 7, 9, cm);
    this.box(5, 0.6, 3, 9, 7, 0.9, cm);
    // 上屋顶的坡道
    for (let i = 0; i < 8; i++) {
      this.box(15.6, i * 0.95, 2 + i * 1.5, 3.4, 0.95, 1.6, dm);
    }
    // 侧楼
    this.box(-34, 0, -14, 16, 6.4, 14, cm);
    this.box(-34, 6.4, -14, 17, 0.7, 15, dm);
    this.box(34, 0, 18, 14, 5.6, 16, cm);
    this.box(34, 5.6, 18, 15, 0.7, 17, dm);
  }

  buildContainers() {
    const cols = [0xc2593c, 0x3f6ea8, 0x4f7a4a, 0xb99a3a, 0x8a4a6a, 0x3f6f76];
    const spots = [
      [-24, 30, 0], [-14, 37, .15], [-30, 40, 0], [20, 30, .2], [26, 34, 0],
      [-46, 6, 1.57], [-46, 14, 1.57], [46, -6, 1.57], [46, 2, 1.57],
      [8, -28, 0], [16, -32, .3], [-10, -30, 0], [-18, -36, .15],
      [-40, -34, .8], [40, -34, -.7], [-52, 34, .4], [52, 26, -.4],
      [30, 48, 0], [-30, 48, 0], [0, 44, 1.57], [-56, -12, 0], [56, 12, 0],
      [12, 52, .5], [-12, 56, -.5], [-60, 18, 1.2], [60, -20, -1.2],
    ];
    const stack = new Set([1, 4, 7, 11, 15, 19, 23]);
    spots.forEach((s, i) => {
      const c = cols[i % cols.length];
      const m = this.mat(c, 0.9, 0.25);
      this.box(s[0], 0, s[1], 12.2, 2.9, 2.9, m, s[2]);
      if (stack.has(i)) this.box(s[0], 2.9, s[1], 12.2, 2.9, 2.9, this.mat(cols[(i + 3) % cols.length], .9, .25), s[2]);
    });
  }

  buildSandbags() {
    const m = this.mat(0xc2ad78, 1);
    const lines = [
      [-16, 22, 0, 14], [16, 22, 0, 14], [0, 26, 0, 18],
      [-30, -6, 1.57, 12], [30, -6, 1.57, 12],
      [-8, -18, 0, 12], [10, -18, 0, 12],
      [-44, 22, .6, 10], [44, 22, -.6, 10],
      [-22, -44, 0, 14], [22, -44, 0, 14],
      [0, -46, 0, 16], [-38, 44, .3, 12], [38, 44, -.3, 12],
      [-58, -30, .9, 10], [58, 30, .9, 10],
    ];
    lines.forEach(([x, z, r, len]) => {
      const n = Math.round(len / 1.7);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 1.7;
        const px = x + Math.cos(r) * off, pz = z + Math.sin(r) * off;
        this.box(px, 0, pz, 1.75, 0.62, 1.0, m, r + (Math.random() - .5) * .12, { ghost: true, noShadow: false });
        this.box(px, 0.62, pz, 1.6, 0.58, 0.95, m, r + (Math.random() - .5) * .2, { ghost: true });
      }
      const cs = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
      const hw = (len * cs + 1.2 * sn) / 2, hd = (len * sn + 1.2 * cs) / 2;
      this.colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0: 0, y1: 1.2, low: true });
    });
  }

  buildTowers() {
    const T = this.theme;
    const wood = this.mat(0x6b5638, 1);
    const plat = this.mat(0x5a4a30, 1);
    [[-48, 46], [48, 46], [-48, -46], [48, -46], [0, 62]].forEach(([x, z]) => {
      for (const [dx, dz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]])
        this.box(x + dx, 0, z + dz, 0.55, 8.6, 0.55, wood, 0, { ghost: true });
      this.box(x, 8.6, z, 6.4, 0.5, 6.4, plat);
      this.box(x, 9.1, z - 3.1, 6.4, 1.1, 0.4, plat);
      this.box(x, 9.1, z + 3.1, 6.4, 1.1, 0.4, plat);
      this.box(x - 3.1, 9.1, z, 0.4, 1.1, 6.4, plat);
      this.box(x + 3.1, 9.1, z, 0.4, 1.1, 6.4, plat);
      // 梯子（阶梯化，可走上去）
      for (let i = 0; i < 9; i++)
        this.box(x + 3.6 + i * 0.02, i * 0.96, z + 4.2 - i * 0.55, 2.2, 0.96, 0.9, wood, 0, { noShadow: true });
    });
  }

  buildWrecks() {
    const body = this.mat(this.theme.rust, 0.95, 0.3);
    const glass = new THREE.MeshStandardMaterial({ color: 0x203038, roughness: .3, metalness: .6 });
    const spots = [[-14, 40, .6], [22, 40, -1.1], [-36, 12, 2.1], [38, -18, .4], [6, -40, 1.9], [-52, -4, .2], [52, 4, 2.6]];
    spots.forEach(([x, z, r]) => {
      this.box(x, 0.35, z, 5.4, 1.5, 2.4, body, r);
      this.box(x - Math.cos(r) * 0.4, 1.85, z - Math.sin(r) * 0.4, 2.6, 1.15, 2.2, glass, r, { ghost: true });
      for (const s of [[-1.9, -1.25], [1.9, -1.25], [-1.9, 1.25], [1.9, 1.25]]) {
        const wx = x + Math.cos(r) * s[0] - Math.sin(r) * s[1];
        const wz = z + Math.sin(r) * s[0] + Math.cos(r) * s[1];
        const w = new THREE.Mesh(new THREE.CylinderGeometry(.62, .62, .42, 12), this.mat(0x1c1c1e, 1));
        w.position.set(wx, .62, wz); w.rotation.z = Math.PI / 2; w.rotation.y = r;
        w.castShadow = true; this.scene.add(w);
      }
    });
  }

  buildBarrels() {
    const rustM = this.mat(0xa8452a, .85, .35);
    const geo = new THREE.CylinderGeometry(0.62, 0.62, 1.5, 14);
    const spots = [
      [-20, 18], [-18.4, 19.2], [-21, 20], [20, 18], [21.6, 19.4],
      [-6, 30], [-4.4, 31.2], [8, 30], [-40, 30], [-38.6, 31.4],
      [40, 30], [-28, -20], [-26.5, -21], [28, -20], [0, -34], [1.6, -35],
      [-50, 12], [50, -12], [14, 12], [-14, 12], [-34, -44], [34, -44],
      [-60, 40], [60, 40], [4, 56], [-6, 56],
    ];
    spots.forEach(([x, z]) => {
      const m = new THREE.Mesh(geo, rustM);
      m.position.set(x, 0.75, z); m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
      const col = { x0: x - .62, x1: x + .62, z0: z - .62, z1: z + .62, y0: 0, y1: 1.5, low: true };
      this.colliders.push(col);
      this.barrels.push({ mesh: m, x, z, hp: 45, dead: false, collider: col });
    });
  }

  buildFences() {
    const m = this.mat(0x59606a, .8, .5);
    const seg = (x, z, r, len) => {
      const n = Math.round(len / 4);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 4;
        const px = x + Math.cos(r) * off, pz = z + Math.sin(r) * off;
        this.box(px, 0, pz, 3.8, 2.6, 0.14, m, r, { ghost: true });
        this.box(px - Math.cos(r) * 1.9, 0, pz - Math.sin(r) * 1.9, 0.2, 3.0, 0.2, m, r, { ghost: true });
      }
      const cs = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
      this.colliders.push({
        x0: x - (len * cs + .4 * sn) / 2, x1: x + (len * cs + .4 * sn) / 2,
        z0: z - (len * sn + .4 * cs) / 2, z1: z + (len * sn + .4 * cs) / 2,
        y0: 0, y1: 2.6,
      });
    };
    seg(-34, 58, 0, 28); seg(34, 58, 0, 28);
    seg(-66, 26, 1.57, 28); seg(66, -26, 1.57, 28);
    seg(-20, -58, 0, 24); seg(24, -58, 0, 24);
  }

  buildDust() {
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * 190;
      pos[i * 3 + 1] = Math.pow(Math.random(), 1.8) * 15 + .3;
      pos[i * 3 + 2] = (Math.random() - .5) * 190;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: this.theme.night ? 0x9fc4e8 : 0xffe0b0,
      size: 0.13, transparent: true, opacity: this.theme.night ? .22 : .3,
      depthWrite: false, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(g, mat);
    this.scene.add(this.dust);
  }

  buildBlockade() {
    const g = new THREE.CylinderGeometry(1, 1, 46, 96, 1, true);
    const cvs = document.createElement('canvas'); cvs.width = 4; cvs.height = 128;
    const c2 = cvs.getContext('2d');
    const gr = c2.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(255,40,40,0)');
    gr.addColorStop(.35, 'rgba(255,60,50,.30)');
    gr.addColorStop(.78, 'rgba(255,80,55,.75)');
    gr.addColorStop(1, 'rgba(255,170,120,1)');
    c2.fillStyle = gr; c2.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(cvs);
    // wrapT 必须 Clamp：否则顶部透明处会与底部亮色环绕插值，出现一条横贯天空的亮线
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(60, 1);
    const m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9,
    });
    this.blockade = new THREE.Mesh(g, m);
    this.blockade.position.y = 22;
    this.blockade.scale.set(this.blockadeR, 1, this.blockadeR);
    this.scene.add(this.blockade);
    this.blockadeTex = tex;
  }

  buildExtraction() {
    const grp = new THREE.Group();
    grp.position.set(0, 0, -62);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(11.5, 13, 48),
      new THREE.MeshBasicMaterial({ color: 0x4affc0, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = .06; grp.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(12.4, 12.4, 40, 44, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x18ff9a, transparent: true, opacity: .30, side: THREE.DoubleSide, depthWrite: false })
    );
    beam.position.y = 20; grp.add(beam);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 2.6, 8),
        new THREE.MeshBasicMaterial({ color: 0x6affd0 }));
      p.position.set(Math.cos(a) * 12.2, 1.3, Math.sin(a) * 12.2); grp.add(p);
    }
    grp.visible = false;
    this.scene.add(grp);
    this.extraction = grp;
    this.extractionPos = new THREE.Vector3(0, 0, -62);
    this.extractRing = ring; this.extractBeam = beam;

    // 直升机（撤离时出现）
    const heli = new THREE.Group();
    const bodyM = this.mat(0x3c4a3a, .8, .4);
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 5, 6, 12), bodyM);
    b.rotation.z = Math.PI / 2; heli.add(b);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(6, .5, .5), bodyM);
    tail.position.x = -5.4; heli.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.9, .3), bodyM);
    fin.position.set(-8.1, .9, 0); heli.add(fin);
    const rotor = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(11, .1, .55), this.mat(0x22262a, .7, .5));
      bl.rotation.y = i * Math.PI / 4; rotor.add(bl);
    }
    rotor.position.y = 2.1; heli.add(rotor);
    heli.visible = false; heli.scale.setScalar(1.1);
    this.scene.add(heli);
    this.heli = heli; this.heliRotor = rotor;
  }

  buildGates() {
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      this.gates.push({ a, x: Math.cos(a) * 88, z: Math.sin(a) * 88 });
    }
  }

  setBlockade(r) {
    this.blockadeR = r;
    if (this.blockade) this.blockade.scale.set(r, 1, r);
  }

  update(dt, t, playerPos) {
    if (this.blockadeTex) this.blockadeTex.offset.x = (t * 0.06) % 1;
    if (this.blockade) this.blockade.material.opacity = 0.55 + Math.sin(t * 3) * 0.18;
    if (this.dust) {
      this.dust.position.x = playerPos.x; this.dust.position.z = playerPos.z;
      this.dust.rotation.y = t * 0.008;
    }
    if (this.extraction && this.extraction.visible) {
      this.extractRing.scale.setScalar(1 + Math.sin(t * 2.2) * 0.035);
      this.extractBeam.material.opacity = 0.26 + Math.sin(t * 2.6) * 0.09;
    }
    if (this.heli && this.heli.visible) this.heliRotor.rotation.y += dt * 34;
    if (this.sun) { this.sun.position.set(playerPos.x - 70, 90, playerPos.z + 48); this.sun.target.position.copy(playerPos); this.sun.target.updateMatrixWorld(); }
  }

  /* 射线 vs 场景 AABB，返回最近命中距离（无命中返回 Infinity） */
  rayWorld(ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD;
    for (const c of this.colliders) {
      const t = rayAABB(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.y1, c.z1);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  /* 圆柱体（半径 r，脚底 y，身高 h）与场景碰撞求解，返回修正后的 x,z
     step：可直接跨上去的高度（翻越沙袋等低掩体），低于它的障碍不阻挡 */
  resolve(x, z, y, r, h, step) {
    step = step == null ? 0 : step;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const c of this.colliders) {
        if (c.dead) continue;
        if (c.y1 <= y + step + 0.02) continue;          // 够矮 → 可翻越
        if (y + h <= c.y0 + 0.02 || y >= c.y1 - 0.02) continue;
        const cx = Math.max(c.x0, Math.min(x, c.x1));
        const cz = Math.max(c.z0, Math.min(z, c.z1));
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = cx + dx / d * r; z = cz + dz / d * r;
        } else {
          // 圆心在盒内，推向最近的面
          const l = x - c.x0, rr = c.x1 - x, u = z - c.z0, dn = c.z1 - z;
          const m = Math.min(l, rr, u, dn);
          if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r;
          else if (m === u) z = c.z0 - r; else z = c.z1 + r;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x, z };
  }

  /* 给定 x,z 与当前高度，返回可站立的地面高度（可踩箱顶 / 翻上矮墙） */
  floorAt(x, z, fromY, r, step) {
    step = step == null ? 0.55 : step;
    let best = 0;
    for (const c of this.colliders) {
      if (c.dead) continue;
      if (x < c.x0 - r * .55 || x > c.x1 + r * .55 || z < c.z0 - r * .55 || z > c.z1 + r * .55) continue;
      if (c.y1 <= fromY + step && c.y1 > best) best = c.y1;
    }
    return best;
  }

  killBarrel(b) {
    if (b.dead) return;
    b.dead = true;
    b.collider.dead = true;
    this.scene.remove(b.mesh);
  }
}

export function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
    } else {
      const inv = 1 / d[i];
      let t1 = (lo[i] - o[i]) * inv, t2 = (hi[i] - o[i]) * inv;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}
