/* 《突出重围》主控：状态机、波次、拾取、空投、投掷物、结算 */
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS, ITEMS, THROWABLES, AMMO, WAVES, ENEMIES, ARMOR, DIFFICULTY, MAPS, TITLES, QUALITY, PERK_TEXT } from './data.js';
import { World } from './world.js';
import { FX } from './fx.js';
import { Player } from './player.js';
import { EnemyManager, raySphere } from './enemies.js';
import { Weapon, WeaponSystem, buildWeaponModel } from './weapons.js';
import { HUD } from './hud.js';
import { input, initInput, detectTouch, resetEdges, setSens } from './input.js';
import { initAudio, resumeAudio, sfx, setVolume, startMusic, stopMusic } from './audio.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

const PREP_TIME = 30;
const SUPPLY_TIME = 20;
const HOLD_TIME = 40;
const BLOCKADE = [82, 68, 54];

class Game {
  constructor() {
    this.canvas = $('#cv');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.08, 520);
    this.mapId = 'wasteland';
    this.diffId = 'normal';
    this.quality = 'mid';
    this.state = 'menu';
    this.paused = false;
    this.time = 0;
    this.shakeAmt = 0;
    this.speedScale = 1;
    this.drops = [];
    this.grenades = [];
    this.rockets = [];
    this.pendingSpawns = 0;
    this.slots = [null, null, null];
    this.slotIdx = 0;
    this.inv = {};
    this.reserve = {};
    this.throwType = 'frag';
    this.stats = { kills: 0, heads: 0, dmg: 0, shots: 0, hits: 0, time: 0 };
    this.nearPickup = null;

    addEventListener('resize', () => this.onResize());
    this.bindMenu();
    $('#loading').classList.add('hidden');
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }

  bindMenu() {
    document.querySelectorAll('#mapPicks .pick').forEach(b => b.onclick = () => {
      document.querySelectorAll('#mapPicks .pick').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); this.mapId = b.dataset.map; sfx('ui');
    });
    document.querySelectorAll('#diffPicks .pick').forEach(b => b.onclick = () => {
      document.querySelectorAll('#diffPicks .pick').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); this.diffId = b.dataset.diff; sfx('ui');
    });
    $('#startBtn').onclick = () => { initAudio(); resumeAudio(); this.start(); };
    $('#resumeBtn').onclick = () => this.setPause(false);
    $('#quitBtn').onclick = () => location.reload();
    $('#againBtn').onclick = () => location.reload();
    $('#lobbyBtn').onclick = () => location.reload();
    $('#volRange').oninput = e => setVolume(e.target.value / 100);
    $('#sensRange').oninput = e => { const k = e.target.value / 100; setSens(0.0022 * k, 0.0032 * k); };
    document.querySelectorAll('#qualityBtns button').forEach(b => b.onclick = () => {
      document.querySelectorAll('#qualityBtns button').forEach(x => x.classList.remove('on'));
      b.classList.add('on'); this.setQuality(b.dataset.q);
    });
  }

  setQuality(q) {
    this.quality = q;
    if (q === 'low') { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1)); this.renderer.shadowMap.enabled = false; }
    else if (q === 'mid') { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); this.renderer.shadowMap.enabled = true; }
    else { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true; }
    this.scene && this.scene.traverse(o => { if (o.isMesh) o.material.needsUpdate = true; });
  }

  /* ═════ 开局 ═════ */
  start() {
    this.diff = DIFFICULTY[this.diffId];
    this.scene = new THREE.Scene();
    this.world = new World(this.scene, this.renderer, this.mapId);
    this.fx = new FX(this.scene, this.camera, $('#dmgLayer'));
    this.player = new Player(this.scene, this.camera, this.world);
    this.player.revives = this.diff.revives;
    this.enemies = new EnemyManager(this.scene, this.world, this.fx, this);
    this.ws = new WeaponSystem(this);
    this.hud = new HUD(this);

    detectTouch();
    initInput(this.canvas, $('#hud'), () => this.setPause(!this.paused));
    document.body.classList.toggle('desktop', !input.touch);
    $('#btnPause').onclick = () => this.setPause(true);

    // 初始装备（原版：出生自带二级头 / 二级甲）
    this.reserve = {}; for (const k in AMMO) this.reserve[k] = 0;
    this.reserve['.45'] = 120; this.reserve['9mm'] = 90; this.reserve['5.56'] = 60; this.reserve['7.62'] = 60;
    this.inv = { bandage: 4, firstaid: 2, medkit: 0, energy: 2, adrenal: 1, frag: 2, molotov: 1, freeze: 1, smoke: 1 };
    this.slots = [new Weapon('UMP45'), null, new Weapon('P92')];
    this.slotIdx = 0;
    this.player.setWeaponModel('UMP45');

    this.scatterLoot();

    this.wave = 0;
    this.state = 'prep';
    this.phaseT = PREP_TIME;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.holdT = HOLD_TIME;
    this.blockIdx = 0;
    this.world.setBlockade(BLOCKADE[0]);
    this.stats = { kills: 0, heads: 0, dmg: 0, shots: 0, hits: 0, time: 0 };
    this.time = 0;
    this.blockDmgT = 0;

    $('#menu').classList.add('hidden');
    this.hud.show();
    this.hud.banner('突出重围', '备战期 · 搜集物资');
    this.hud.hint('30 秒备战期：拾取物资、熟悉地形', 4);
    startMusic(false);
    sfx('siren');

    this.last = performance.now();
    this.fpsT = 0; this.fpsN = 0;
    if (!this._looping) { this._looping = true; requestAnimationFrame(t => this.loop(t)); }
  }

  setPause(on) {
    if (this.state === 'menu' || this.state === 'over') return;
    this.paused = on;
    $('#pause').classList.toggle('hidden', !on);
    if (on && document.pointerLockElement) document.exitPointerLock();
  }

  /* ═════ 物资 ═════ */
  makeDropMesh(kind, data) {
    const g = new THREE.Group();
    let color = 0xcfd8dd, h = 0.4;
    if (kind === 'weapon') { const m = buildWeaponModel(data); m.rotation.y = Math.PI / 2; m.scale.setScalar(1.15); m.position.y = 0.42; g.add(m); }
    else {
      if (kind === 'ammo') color = 0xb8925a;
      if (kind === 'item') color = parseInt((ITEMS[data].color || '#fff').slice(1), 16);
      if (kind === 'throw') color = parseInt(THROWABLES[data].color.slice(1), 16);
      if (kind === 'armor') color = data.type === 'helmet' ? 0x6a7a5a : 0x5a6a7a;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42),
        new THREE.MeshStandardMaterial({ color, roughness: .7, metalness: .2 }));
      b.position.y = 0.35; b.castShadow = true; g.add(b);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.56, 20),
      new THREE.MeshBasicMaterial({ color: 0xf5c33b, transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
    return g;
  }

  addDrop(x, z, kind, data, label, crate) {
    const g = this.makeDropMesh(kind, data);
    g.position.set(x, 0, z);
    this.scene.add(g);
    const d = { mesh: g, x, z, kind, data, label, taken: false, crate: !!crate, spin: Math.random() * 6 };
    this.drops.push(d);
    return d;
  }

  scatterLoot() {
    const guns = ['M416', 'AKM', 'UMP45', 'S12K', 'S686', 'M24', 'XBOW', 'TESLA', 'M416', 'AKM', 'UMP45', 'PAN'];
    const pts = [];
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 66;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    pts.forEach(([x, z], i) => {
      const roll = Math.random();
      if (i < guns.length) { const g = guns[i]; this.addDrop(x, z, 'weapon', g, WEAPONS[g].name); return; }
      if (roll < 0.30) { const t = ['5.56', '7.62', '.45', '12g', '9mm'][i % 5]; this.addDrop(x, z, 'ammo', t, AMMO[t].name + ' ×30'); }
      else if (roll < 0.58) { const k = ['bandage', 'firstaid', 'energy', 'adrenal', 'medkit'][i % 5]; this.addDrop(x, z, 'item', k, ITEMS[k].name); }
      else if (roll < 0.80) { const k = ['frag', 'molotov', 'freeze', 'smoke'][i % 4]; this.addDrop(x, z, 'throw', k, THROWABLES[k].name); }
      else { const type = Math.random() < .5 ? 'helmet' : 'vest'; const lv = Math.random() < .35 ? 3 : 2;
             this.addDrop(x, z, 'armor', { type, lv }, ARMOR[type][lv].name); }
    });
  }

  airdrop() {
    const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 26;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const crateGuns = ['AWM', 'M249', 'M134', 'RPG7'];
    const gun = crateGuns[Math.floor(Math.random() * crateGuns.length)];
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xb8442a, roughness: .8, metalness: .2 }));
    box.position.y = 0.65; box.castShadow = true; g.add(box);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.24, 1.65),
      new THREE.MeshStandardMaterial({ color: 0xf5c33b })); stripe.position.y = 0.9; g.add(stripe);
    const chute = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d4, side: THREE.DoubleSide, roughness: 1 }));
    chute.position.y = 4.2; g.add(chute);
    const smokeM = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: .3, side: THREE.DoubleSide, depthWrite: false }));
    smokeM.position.y = 3; g.add(smokeM);
    g.position.set(x, 70, z);
    this.scene.add(g);
    const d = { mesh: g, x, z, kind: 'crate', data: gun, label: `空投箱 · ${WEAPONS[gun].name}`, taken: false, crate: true, fall: true, chute, spin: 0 };
    this.drops.push(d);
    this.hud.hint('空投已投放 — 查看小地图', 3);
    return d;
  }

  takeDrop(d) {
    d.taken = true;
    this.scene.remove(d.mesh);
    sfx('pickup');
    if (d.kind === 'weapon' || d.kind === 'crate') {
      const id = d.data;
      const def = WEAPONS[id];
      const w = new Weapon(id);
      if (def.slot === 'side' || def.melee) {
        const old = this.slots[2]; this.slots[2] = w;
        if (old) this.addDrop(this.player.x + 1, this.player.z, 'weapon', old.id, WEAPONS[old.id].name);
      } else {
        let idx = this.slots[0] ? (this.slots[1] ? this.slotIdx : 1) : 0;
        if (idx > 1) idx = this.slotIdx <= 1 ? this.slotIdx : 0;
        const old = this.slots[idx];
        this.slots[idx] = w;
        if (old) this.addDrop(this.player.x + 1.2, this.player.z, 'weapon', old.id, WEAPONS[old.id].name);
        this.switchSlot(idx);
      }
      this.giveAmmo(def.ammo, def.mag * 3);
      this.hud.hint(`拾取 ${def.name}${d.crate ? '（空投）' : ''}`, 1.6);
      if (d.crate) {
        this.helmetUp(3); this.vestUp(3);
        this.inv.medkit = (this.inv.medkit || 0) + 1;
        this.inv.firstaid = (this.inv.firstaid || 0) + 2;
        this.hud.hint('空投：三级头 + 三级甲 + 医疗箱', 2.6);
      }
    } else if (d.kind === 'ammo') {
      this.giveAmmo(d.data, 30);
      this.hud.hint(`拾取 ${AMMO[d.data].name} ×30`, 1.2);
    } else if (d.kind === 'item') {
      const it = ITEMS[d.data];
      this.inv[d.data] = Math.min(it.max, (this.inv[d.data] || 0) + 1);
      this.hud.hint(`拾取 ${it.name}`, 1.2);
    } else if (d.kind === 'throw') {
      const t = THROWABLES[d.data];
      this.inv[d.data] = Math.min(t.max, (this.inv[d.data] || 0) + 1);
      this.hud.hint(`拾取 ${t.name}`, 1.2);
    } else if (d.kind === 'armor') {
      if (d.data.type === 'helmet') this.helmetUp(d.data.lv); else this.vestUp(d.data.lv);
      this.hud.hint(`装备 ${ARMOR[d.data.type][d.data.lv].name}`, 1.4);
    }
  }

  helmetUp(lv) { if (lv >= this.player.helmet) { this.player.helmet = lv; this.player.helmetDur = ARMOR.helmet[lv].dur; } }
  vestUp(lv) { if (lv >= this.player.vest) { this.player.vest = lv; this.player.vestDur = ARMOR.vest[lv].dur; } }

  giveAmmo(type, n) {
    if (!type) return;
    this.reserve[type] = Math.min(AMMO[type].max, (this.reserve[type] || 0) + n);
  }
  reserveOf(type) { return type ? (this.reserve[type] || 0) : 0; }
  takeAmmo(type, n) {
    const have = this.reserve[type] || 0;
    const got = Math.min(have, n);
    this.reserve[type] = have - got;
    return got;
  }

  get currentWeapon() {
    if (this.player && this.player.downed) {
      const side = this.slots[2];
      if (side && !side.def.melee) return side;
      if (!this._downPistol) this._downPistol = new Weapon('P92');
      return this._downPistol;                    // 倒地只能用手枪
    }
    return this.slots[this.slotIdx];
  }

  switchSlot(i) {
    if (i < 0 || i > 2 || !this.slots[i]) return;
    if (i === this.slotIdx) return;
    this.slotIdx = i;
    const w = this.slots[i];
    if (w.reloading) { w.reloading = false; w.reloadT = 0; }
    this.player.setWeaponModel(w.id);
    this.player.gunKick = 0.6;
    sfx('reload');
  }
  cycleSlot(dir) {
    for (let k = 1; k <= 3; k++) {
      const i = ((this.slotIdx + dir * k) % 3 + 3) % 3;
      if (this.slots[i]) { this.switchSlot(i); return; }
    }
  }

  /* ═════ 战斗回调 ═════ */
  onHit(head) { this.hud.hitMark(head); this._lastHead = !!head; if (head) this.stats.heads++; }

  onEvolve(w) {
    const q = QUALITY[w.level];
    this.hud.hint(`武器进化：${w.def.name} → ${q.name}${w.maxed ? ' · ' + (PERK_TEXT[w.def.perk] || '') : ''}`, 2.6);
    this.hud.banner(`${w.def.name} 进化`, q.name + (w.maxed ? ' · 特化解锁' : ''));
  }

  onEnemyKilled(e, opts) {
    this.stats.kills++;
    const w = opts.weapon || this.currentWeapon;
    if (w && w.addKill) w.addKill(this);
    this.hud.killFeedAdd(w ? w.def.name : '爆炸', e.def.name, !!this._lastHead);
    this._lastHead = false;
    sfx('kill');
    // 掉落
    const r = Math.random();
    if (e.def.elite || e.def.boss) {
      this.addDrop(e.x + 1, e.z, 'item', 'medkit', ITEMS.medkit.name);
      this.addDrop(e.x - 1, e.z, 'item', 'adrenal', ITEMS.adrenal.name);
      if (e.def.boss) this.addDrop(e.x, e.z + 2, 'weapon', 'M134', WEAPONS.M134.name);
    } else if (r < 0.22) {
      const t = ['5.56', '7.62', '.45', '12g'][Math.floor(Math.random() * 4)];
      this.addDrop(e.x, e.z, 'ammo', t, AMMO[t].name + ' ×30');
    } else if (r < 0.32) {
      const k = ['bandage', 'firstaid', 'energy', 'adrenal'][Math.floor(Math.random() * 4)];
      this.addDrop(e.x, e.z, 'item', k, ITEMS[k].name);
    } else if (r < 0.38) {
      const k = ['frag', 'molotov', 'freeze'][Math.floor(Math.random() * 3)];
      this.addDrop(e.x, e.z, 'throw', k, THROWABLES[k].name);
    }
    this.updateEnemyCount();
  }

  updateEnemyCount() { /* HUD 每帧读取 */ }

  bossPhase(n) {
    this.hud.banner(`泰坦 · 阶段 ${n}`, n === 2 ? '装甲展开 · 核心暴露' : n === 3 ? '狂暴 · 全场清扫' : '');
    if (n === 3) startMusic(true);
  }

  shake(a) { this.shakeAmt = Math.min(0.55, this.shakeAmt + a); }

  blind(t) { this.player.blindT = Math.max(this.player.blindT, t); }

  healPlayer(n) { this.player.hp = Math.min(this.player.maxHp, this.player.hp + n); }

  damagePlayer(dmg, fromX, fromZ, type) {
    const p = this.player;
    if (p.dead || this.state === 'over') return;
    if (p.downed) { p.downT -= dmg * 0.05; return; }
    const head = Math.random() < 0.12;
    let d = p.armorReduce(dmg, head);
    p.hp -= d;
    p.lastHitT = this.time;
    sfx('hurt');
    this.shake(Math.min(0.3, d / 90));
    const ang = Math.atan2(fromX - p.x, -(fromZ - p.z)) - p.yaw;
    this.hud.damageDir(-ang);
    if (p.hp <= 0) {
      p.hp = 0;
      if (p.revives > 0) {
        p.revives--; p.downed = true; p.downT = 10; p.stance = 'prone';
        this.hud.banner('你已倒地', `剩余重整旗鼓 ${p.revives}`);
        sfx('lose');
      } else this.playerDie();
    }
  }

  playerSplash(x, y, z, radius, dmg) {
    const p = this.player;
    const d = Math.hypot(p.x - x, p.z - z, (p.y + 1) - y);
    if (d > radius) return;
    this.damagePlayer(dmg * (1 - d / radius) * 0.85, x, z, 'splash');
  }

  playerDie() {
    if (this.state === 'over') return;
    this.player.dead = true;
    this.endGame(false);
  }

  finishUseItem() {
    const p = this.player, id = p.useItem;
    if (!id) return;
    const def = ITEMS[id];
    p.useItem = null;
    if (def.heal) p.hp = Math.min(def.cap, Math.max(p.hp, Math.min(p.hp + def.heal, def.cap)));
    if (def.boost) p.boost = Math.min(100, p.boost + def.boost);
    if (def.speed) { p.speedBuff = def.speed; p.speedBuffT = def.dur; this.hud.hint('加速药剂生效 · 移速 +45%', 2); }
    if (p.downed && (id === 'firstaid' || id === 'medkit')) {
      p.downed = false; p.downT = 0; p.stance = 'stand';
      p.hp = Math.max(p.hp, 40);
      this.hud.banner('自救成功', '重整旗鼓');
    }
    sfx('pickup');
  }

  useItemStart(id) {
    const p = this.player;
    if (p.useT > 0 || !this.inv[id]) return;
    if (p.downed && id !== 'firstaid' && id !== 'medkit') { this.hud.hint('倒地时只能使用急救包/医疗箱', 1.5); return; }
    const def = ITEMS[id];
    if (def.heal && p.hp >= def.cap && !p.downed) { this.hud.hint(`生命值已高于 ${def.cap}`, 1.4); return; }
    this.inv[id]--;
    p.useItem = id;
    p.useT = def.use * (p.downed ? 0.6 : 1);
  }

  /* ═════ 投掷物 / 火箭 ═════ */
  spawnGrenade(x, y, z, tx, tz, type, fromEnemy) {
    const isMissile = type === 'missile';
    const def = isMissile ? { fuse: 0, radius: 6, dmg: 55, color: '#ff8a3c' } : THROWABLES[type];
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      isMissile ? new THREE.ConeGeometry(0.18, 0.7, 8) : new THREE.SphereGeometry(0.17, 10, 8),
      new THREE.MeshStandardMaterial({ color: parseInt(def.color.slice(1), 16), roughness: .6, metalness: .3 })
    );
    g.add(body); g.position.set(x, y, z); this.scene.add(g);
    const dx = tx - x, dz = tz - z;
    const dist = Math.hypot(dx, dz);
    const tt = isMissile ? Math.max(0.5, dist / 26) : clamp(dist / 17, 0.45, 1.9);
    const vy = isMissile ? (0 - y) / tt + 0.5 * 16 * tt : (0.9 - y) / tt + 0.5 * 20 * tt;
    this.grenades.push({
      mesh: g, x, y, z, vx: dx / tt, vy, vz: dz / tt,
      type, fuse: isMissile ? tt : def.fuse, fromEnemy: !!fromEnemy, grav: isMissile ? 16 : 20, isMissile,
    });
    return g;
  }

  throwGrenade() {
    const type = this.throwType;
    if (!this.inv[type]) { this.hud.hint(`没有${THROWABLES[type].name}了`, 1.2); return; }
    this.inv[type]--;
    const p = this.player;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const m = p.getMuzzleWorld();
    const dist = 26;
    this.spawnGrenade(m.x, m.y + 0.3, m.z, p.x + dir.x * dist, p.z + dir.z * dist, type, false);
    this.hud.hint(`投出 ${THROWABLES[type].name}`, 1);
  }

  cycleThrow() {
    const keys = Object.keys(THROWABLES);
    let i = keys.indexOf(this.throwType);
    for (let k = 1; k <= keys.length; k++) {
      const n = keys[(i + k) % keys.length];
      if (this.inv[n] > 0) { this.throwType = n; this.hud.hint('切换投掷物：' + THROWABLES[n].name, 1.2); return; }
    }
    this.throwType = keys[(i + 1) % keys.length];
  }

  spawnRocket(x, y, z, dir, weapon) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.75, 8),
      new THREE.MeshStandardMaterial({ color: 0x6a5a3a, roughness: .6 }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.rockets.push({ mesh: m, x, y, z, dx: dir.x, dy: dir.y, dz: dir.z, speed: 46, life: 5, weapon });
  }

  updateProjectiles(dt) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.vy -= g.grav * dt;
      g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
      if (g.y < 0.16) {
        g.y = 0.16; g.vy *= -0.30; g.vx *= 0.30; g.vz *= 0.30;
        g.grounded = true;
        if (g.isMissile) g.fuse = 0;
      }
      if (g.grounded) {                      // 地面滚动摩擦，避免落点漂移
        const f = Math.pow(0.02, dt);
        g.vx *= f; g.vz *= f;
        if (Math.abs(g.vx) < 0.08) g.vx = 0;
        if (Math.abs(g.vz) < 0.08) g.vz = 0;
      }
      // 撞墙反弹
      if (this.world.rayWorld(g.x, g.y, g.z, Math.sign(g.vx) || 1, 0, 0, 0.3) < 0.3) g.vx *= -0.4;
      if (this.world.rayWorld(g.x, g.y, g.z, 0, 0, Math.sign(g.vz) || 1, 0.3) < 0.3) g.vz *= -0.4;
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.rotation.x += dt * 8; g.mesh.rotation.z += dt * 5;
      if (g.isMissile) this.fx.spawn(g.x, g.y, g.z, 0, 0, 0, 0.35, 0.2, 0xff9a3c, -0.1, 0.9);
      g.fuse -= dt;
      if (g.fuse <= 0) { this.detonate(g); this.scene.remove(g.mesh); this.grenades.splice(i, 1); }
    }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      const step = r.speed * dt;
      const wallT = this.world.rayWorld(r.x, r.y, r.z, r.dx, r.dy, r.dz, step);
      const hit = this.enemies.raycast(r.x, r.y, r.z, r.dx, r.dy, r.dz, Math.min(step, wallT));
      this.fx.spawn(r.x, r.y, r.z, 0, 0.4, 0, 0.45, 0.25, 0xff9a3c, -0.15, 0.9);
      if (hit) {
        this.enemies.explode(r.x + r.dx * hit.t, r.y + r.dy * hit.t, r.z + r.dz * hit.t, r.weapon.maxed ? 15 : 7.5, r.weapon.dmg);
        this.scene.remove(r.mesh); this.rockets.splice(i, 1); continue;
      }
      if (wallT < step) {
        this.enemies.explode(r.x + r.dx * wallT, r.y + r.dy * wallT, r.z + r.dz * wallT, r.weapon.maxed ? 15 : 7.5, r.weapon.dmg);
        this.scene.remove(r.mesh); this.rockets.splice(i, 1); continue;
      }
      r.x += r.dx * step; r.y += r.dy * step; r.z += r.dz * step;
      r.mesh.position.set(r.x, r.y, r.z);
      r.mesh.lookAt(r.x + r.dx, r.y + r.dy, r.z + r.dz);
      r.mesh.rotateX(Math.PI / 2);
      r.life -= dt;
      if (r.life <= 0 || r.y < -2) { this.scene.remove(r.mesh); this.rockets.splice(i, 1); }
    }
  }

  detonate(g) {
    const t = g.type;
    if (t === 'missile') {
      this.fx.explosion(g.x, g.y, g.z, 6);
      sfx('explode', Math.hypot(this.player.x - g.x, this.player.z - g.z));
      this.playerSplash(g.x, g.y, g.z, 6, 55 * this.diff.dmg);
      this.explodeBarrelsNear(g.x, g.z, 6);
      return;
    }
    const def = THROWABLES[t];
    if (t === 'frag') {
      this.fx.explosion(g.x, g.y, g.z, def.radius);
      sfx('explode', Math.hypot(this.player.x - g.x, this.player.z - g.z));
      if (!g.fromEnemy) {
        const before = this.enemies.list.length;
        this.enemies.damageArea(g.x, g.y, g.z, def.radius, def.dmg, null, { weapon: this.currentWeapon });
        this.stats.dmg += def.dmg * 0.5;
      } else this.playerSplash(g.x, g.y, g.z, def.radius, def.dmg * this.diff.dmg);
      this.explodeBarrelsNear(g.x, g.z, def.radius);
    } else if (t === 'molotov') {
      this.fx.burn(g.x, g.z, def.radius, def.burn);
      this.fx.explosion(g.x, g.y, g.z, 2.5, 0xff6a1e);
      sfx('explode', Math.hypot(this.player.x - g.x, this.player.z - g.z));
    } else if (t === 'freeze') {
      this.fx.explosion(g.x, g.y, g.z, def.radius, 0x6fd7ff);
      this.enemies.freezeArea(g.x, g.z, def.radius, def.freeze);
      sfx('arc');
    } else if (t === 'smoke') {
      this.fx.smoke(g.x, g.z, def.radius, def.smoke);
      sfx('explode', 40);
    }
  }

  /* 油桶 */
  raycastBarrel(ox, oy, oz, dir, maxT) {
    let best = null, bt = maxT;
    for (const b of this.world.barrels) {
      if (b.dead) continue;
      const t = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, b.x, 0.75, b.z, 0.72);
      if (t >= 0 && t < bt) { bt = t; best = { b, t }; }
    }
    return best;
  }
  damageBarrel(b, dmg) {
    if (b.dead) return;
    b.hp -= dmg;
    if (b.hp <= 0) {
      this.world.killBarrel(b);
      this.enemies.explode(b.x, 1.0, b.z, 8.5, 130);
    }
  }
  explodeBarrelsNear(x, z, radius) {
    for (const b of this.world.barrels) {
      if (b.dead) continue;
      if (Math.hypot(b.x - x, b.z - z) < radius + 0.8) {
        setTimeout(() => { if (!b.dead && this.state !== 'menu') this.damageBarrel(b, 999); }, 90 + Math.random() * 180);
      }
    }
  }

  /* ═════ 波次状态机 ═════ */
  startWave(n) {
    const w = WAVES[n - 1];
    this.wave = n;
    this.state = 'wave';
    this.spawnQueue = [];
    const mult = this.diff.count;
    for (const type in w.spawns) {
      const c = Math.round(w.spawns[type] * mult);
      for (let i = 0; i < c; i++) this.spawnQueue.push(type);
    }
    if (w.elite) for (let i = 0; i < (w.elite === true ? 2 : w.elite); i++) this.spawnQueue.push('elite');
    if (w.boss) { this.spawnQueue.push('boss'); this.bossReinforce = 0; }
    // 打乱
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    // BOSS 先出
    if (w.boss) this.spawnQueue.unshift('boss');
    this.pendingSpawns = this.spawnQueue.length;
    this.spawnTimer = 0;

    if (w.shrink) {
      this.blockIdx = Math.min(BLOCKADE.length - 1, this.blockIdx + 1);
      this.world.setBlockade(BLOCKADE[this.blockIdx]);
      this.hud.hint('封锁线正在收缩！', 3);
    }
    if (w.crate) this.airdrop();

    const label = w.boss ? '首领波' : (w.elite ? '精英波' : `第 ${n} 关`);
    this.hud.banner(w.boss ? w.name : `第 ${n} 关 · ${w.name}`, w.boss ? '首领降临' : (w.elite ? '精英波 · 小心重装单位' : `共 ${this.pendingSpawns} 名敌人`));
    sfx(w.boss ? 'boss' : 'wave');
    if (n >= 10 || w.boss) startMusic(true);
  }

  startSupply() {
    this.state = 'supply';
    this.phaseT = SUPPLY_TIME;
    this.airdrop();
    this.hud.banner('补给期', `${SUPPLY_TIME} 秒后下一波`);
    this.hud.hint('补给期：空投已刷新，抓紧补给', 3);
    sfx('siren');
    // 补给期小恢复
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
    this.giveAmmo('5.56', 40); this.giveAmmo('7.62', 40); this.giveAmmo('.45', 40);
    this.giveAmmo('12g', 12); this.giveAmmo('9mm', 30); this.giveAmmo('cell', 60); this.giveAmmo('bolt', 6);
  }

  startExtraction() {
    this.state = 'extract';
    this.holdT = HOLD_TIME;
    this.world.setBlockade(95);
    this.world.extraction.visible = true;
    this.hud.banner('突围阶段', '前往撤离点并坚守 40 秒');
    this.hud.hint('封锁线已被击穿 —— 冲向北面停机坪！', 4);
    sfx('siren');
    startMusic(true);
    this.extractSpawnT = 0;
  }

  spawnAt(type) {
    const gates = this.world.gates;
    // 一半从随机方位（保持"四面合围"），一半从靠近玩家的方位（保证交火节奏）
    let g;
    if (Math.random() < 0.5) g = gates[Math.floor(Math.random() * gates.length)];
    else {
      const pa = Math.atan2(this.player.z, this.player.x);
      let bi = 0, bd = 9;
      for (let i = 0; i < gates.length; i++) {
        let d = Math.abs(((gates[i].a - pa + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < bd) { bd = d; bi = i; }
      }
      g = gates[(bi + (Math.floor(Math.random() * 3) - 1) + gates.length) % gates.length];
    }
    const R = Math.max(34, Math.min(78, this.world.blockadeR - 4));
    const jitter = (Math.random() - 0.5) * 22;
    const a = g.a + jitter / R;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    const e = this.enemies.spawn(type, x, z);
    if (e) this.fx.sparks(x, 1, z, 0, 1, 0, 12, ENEMIES[type].eye, 5);
    return e;
  }

  updateState(dt) {
    const p = this.player;
    if (this.state === 'prep') {
      this.phaseT -= dt;
      this.hud.setPhase('备战期', this.fmt(this.phaseT), this.phaseT < 6);
      if (this.phaseT <= 0) this.startWave(1);
    } else if (this.state === 'wave') {
      const w = WAVES[this.wave - 1];
      if (!w) { this.startWave(1); return; }
      // 逐个刷新
      if (this.spawnQueue.length) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const n = Math.min(this.spawnQueue.length, 1 + Math.floor(this.wave / 5));
          for (let i = 0; i < n; i++) this.spawnAt(this.spawnQueue.pop());
          this.pendingSpawns = this.spawnQueue.length;
          this.spawnTimer = 0.55;
        }
      }
      // BOSS 波持续增援
      if (w.boss && this.enemies.boss) {
        this.bossReinforce -= dt;
        if (this.bossReinforce <= 0) {
          this.bossReinforce = 7;
          const t = ['grunt', 'rifleman', 'bomber', 'drone'][Math.floor(Math.random() * 4)];
          for (let i = 0; i < 3; i++) this.spawnAt(t);
        }
      }
      this.hud.setPhase(w.boss ? '首领战' : `第 ${this.wave} 关 · ${w.name}`, `${this.enemies.alive() + this.spawnQueue.length}`, false);
      if (!this.spawnQueue.length && this.enemies.alive() === 0) {
        if (this.wave >= WAVES.length) this.startExtraction();
        else this.startSupply();
      }
    } else if (this.state === 'supply') {
      this.phaseT -= dt;
      this.hud.setPhase('补给期', this.fmt(this.phaseT), this.phaseT < 6);
      if (this.phaseT <= 0) this.startWave(this.wave + 1);
    } else if (this.state === 'extract') {
      const d = Math.hypot(p.x - 0, p.z + 62);
      const inZone = d < 12.5;
      if (inZone) {
        this.holdT -= dt;
        this.hud.setPhase('坚守撤离点', this.fmt(this.holdT), this.holdT < 10);
      } else {
        this.hud.setPhase('前往撤离点', `${Math.round(d)}m`, true);
      }
      // 持续增援
      this.extractSpawnT -= dt;
      if (this.extractSpawnT <= 0 && this.enemies.alive() < 26) {
        this.extractSpawnT = 2.0;
        const pool = ['grunt', 'grunt', 'rifleman', 'bomber', 'drone', 'heavy', 'shocker'];
        for (let i = 0; i < 3; i++) this.spawnAt(pool[Math.floor(Math.random() * pool.length)]);
      }
      // 直升机
      if (this.holdT < 12 && !this.heliIn) {
        this.heliIn = true;
        this.world.heli.visible = true;
        this.world.heli.position.set(120, 34, -62);
        sfx('heli');
        this.hud.hint('撤离直升机正在接近', 3);
      }
      if (this.heliIn) {
        const h = this.world.heli;
        const tgt = new THREE.Vector3(0, this.holdT <= 0 ? 2.6 : 9, -62);
        h.position.lerp(tgt, Math.min(1, dt * 0.55));
        h.rotation.y = Math.PI / 2;
      }
      if (this.holdT <= 0) {
        this.endGame(true);
      }
    }
  }

  fmt(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  endGame(win) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.won = win;
    stopMusic();
    sfx(win ? 'win' : 'lose');
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(() => this.hud.showResult(this, win), 900);
  }

  computeScore(win) {
    const st = this.stats;
    const acc = st.shots ? st.hits / st.shots : 0;
    let s = 0;
    s += Math.min(45, this.wave * 3);
    s += Math.min(22, st.kills * 0.16);
    s += Math.min(14, acc * 26);
    s += Math.min(8, st.heads * 0.35);
    s += win ? 14 : 0;
    s += Math.min(5, this.player.revives * 1.8);
    return Math.round(clamp(s, 0, 100));
  }

  titleFor(score, win) {
    let t = TITLES[0];
    for (const x of TITLES) if (score >= x.min) t = x;
    if (!win && t.min >= 82) t = TITLES[2];
    return t;
  }

  /* ═════ 主循环 ═════ */
  loop(now) {
    requestAnimationFrame(t => this.loop(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;

    // FPS
    this.fpsT += dt; this.fpsN++;
    if (this.fpsT > 0.5) { $('#fps').textContent = Math.round(this.fpsN / this.fpsT) + ' FPS'; this.fpsT = 0; this.fpsN = 0; }

    if (this.state === 'menu') { resetEdges(); return; }
    if (this.paused) { resetEdges(); this.renderer.render(this.scene, this.camera); return; }

    if (this.state !== 'over') { this.time += dt; this.stats.time += dt; }

    const p = this.player;

    // 输入 → 动作
    if (this.state !== 'over') {
      if (input.swap === -1) this.cycleSlot(1);
      else if (input.swap === -2) this.cycleSlot(-1);
      else if (input.swap > 0) this.switchSlot(input.swap - 1);
      if (input.useItem) this.useItemStart(input.useItem);
      if (input.throwEdge) this.throwGrenade();
      if (input.throwCycleEdge) this.cycleThrow();
      if (input.reloadEdge) this.ws.reload(this.currentWeapon);
      if (input.pickupEdge && this.nearPickup) this.takeDrop(this.nearPickup);
    }
    p.ads = input.ads && !p.downed;

    p.update(dt, input, this, this.time);

    // 开火
    const w = this.currentWeapon;
    this.ws.tick(dt, w, input.fire);
    if (this.slots[0] && this.slots[0] !== w) this.ws.tick(dt, this.slots[0], false);
    if (this.slots[1] && this.slots[1] !== w) this.ws.tick(dt, this.slots[1], false);
    if (this.slots[2] && this.slots[2] !== w) this.ws.tick(dt, this.slots[2], false);
    if (input.fire && this.state !== 'over' && !p.dead) {
      if (w && (w.def.auto || !this._firedTap) && this.state !== 'menu') {
        if (this.ws.fire(w, p, this.camera, dt)) this._firedTap = true;
      }
    }
    if (!input.fire) this._firedTap = false;

    this.enemies.update(dt, p, this.time);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.updateBlockade(dt);
    this.fx.update(dt);
    this.world.update(dt, this.time, p.mesh.position);
    if (this.state !== 'over') this.updateState(dt);

    this.shakeAmt *= Math.pow(0.02, dt);

    // 环境音：低血心跳 + 无人机嗡鸣
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT <= 0) {
      this.ambT = 0.85;
      if (p.hp < 30 && !p.dead && this.state !== 'over') sfx('heartbeat');
      let nd = null, ndd = 60;
      for (const e of this.enemies.list) {
        if (e.dead || !e.def.flying) continue;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < ndd) { ndd = d; nd = e; }
      }
      if (nd) sfx('drone', ndd);
    }

    this.touch = input.touch;
    this.pointerLocked = input.pointerLocked;
    this.hud.update(dt, this);

    resetEdges();
    this.renderer.render(this.scene, this.camera);
  }

  updateDrops(dt) {
    const p = this.player;
    let near = null, nd = 2.6;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.taken) { this.drops.splice(i, 1); continue; }
      if (d.fall) {
        d.mesh.position.y -= dt * 9;
        if (d.mesh.position.y <= 0) { d.mesh.position.y = 0; d.fall = false; if (d.chute) d.mesh.remove(d.chute);
          this.fx.sparks(d.x, 0.3, d.z, 0, 1, 0, 14, 0xcfa060, 4); }
        continue;
      }
      d.spin += dt;
      d.mesh.rotation.y = d.spin * 0.8;
      d.mesh.position.y = Math.sin(d.spin * 1.6) * 0.06;
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < nd && Math.abs(p.y) < 3) { nd = dist; near = d; }
    }
    this.nearPickup = near;
    // 触屏自动无需按键提示；键鼠用 F
    if (near && !input.touch) { /* 提示在 HUD */ }
  }

  updateBlockade(dt) {
    const p = this.player;
    const r = Math.hypot(p.x, p.z);
    if (r > this.world.blockadeR && !p.dead && this.state !== 'over') {
      this.blockDmgT -= dt;
      if (this.blockDmgT <= 0) {
        this.blockDmgT = 0.6;
        const over = (r - this.world.blockadeR);
        this.damagePlayer(4 + over * 0.8, p.x * 2, p.z * 2, 'zone');
      }
    }
  }
}

const game = new Game();
/* 调试/自动化测试句柄（只读引用，便于在控制台检查状态） */
game.__W = id => new Weapon(id);
window.__game = game;
window.__WEAPONS = WEAPONS;
window.__ENEMIES = ENEMIES;
window.__WAVES = WAVES;
