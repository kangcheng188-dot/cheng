/* 枪械系统：开火、后坐、换弹、武器进化、弹道与特化效果 */
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS, EVO_THRESHOLDS, QUALITY } from './data.js';
import { sfx } from './audio.js';
import { raySphere } from './enemies.js';

export class Weapon {
  constructor(id) {
    this.id = id;
    this.def = WEAPONS[id];
    this.level = 0;             // 0..4
    this.kills = 0;
    this.ammo = this.def.mag;
    this.reloading = false;
    this.reloadT = 0;
    this.cd = 0;
    this.spin = 0;
    this.freeAmmoT = 0;
    this.boltT = 0;
  }
  get quality() { return QUALITY[this.level]; }
  get maxMag() { return this.def.melee ? Infinity : Math.round(this.def.mag * (1 + this.level * 0.20)); }
  get dmg() { return this.def.dmg * (1 + this.level * 0.12); }
  get reloadTime() { return this.def.reload * (1 - this.level * 0.08); }
  get recoilV() { return this.def.recoilV * (1 - this.level * 0.10); }
  get recoilH() { return this.def.recoilH * (1 - this.level * 0.10); }
  get maxed() { return this.level >= 4; }
  get evoNext() { return this.level >= 4 ? null : EVO_THRESHOLDS[this.level]; }
  get evoProgress() {
    if (this.level >= 4) return 1;
    const prev = this.level === 0 ? 0 : EVO_THRESHOLDS[this.level - 1];
    return Math.max(0, Math.min(1, (this.kills - prev) / (EVO_THRESHOLDS[this.level] - prev)));
  }
  addKill(game) {
    this.kills++;
    if (this.level < 4 && this.kills >= EVO_THRESHOLDS[this.level]) {
      this.level++;
      this.ammo = Math.min(this.maxMag, this.ammo + 10);
      sfx('evolve');
      game && game.onEvolve(this);
    }
  }
}

/* 简易枪械模型（挂在角色手上） */
export function buildWeaponModel(id) {
  const def = WEAPONS[id];
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: .55, metalness: .65 });
  const body = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: .5, metalness: .7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: .8, metalness: .1 });
  const add = (w, h, d, x, y, z, mat) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || body);
    mm.position.set(x, y, z); mm.castShadow = true; g.add(mm); return mm;
  };
  switch (id) {
    case 'P92': add(.09, .16, .10, 0, -.05, -.02, dark); add(.07, .08, .34, 0, .05, .12, body); break;
    case 'PAN': {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(.28, .26, .07, 18), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: .4, metalness: .8 }));
      p.rotation.x = Math.PI / 2; p.position.set(0, 0, .34); g.add(p);
      add(.05, .05, .30, 0, 0, .08, dark); break;
    }
    case 'M134': {
      add(.14, .14, .30, 0, 0, .02, dark);
      const barrels = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const b = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .72, 8), body);
        b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * .07, Math.sin(a) * .07, .5);
        barrels.add(b);
      }
      g.add(barrels); g.userData.barrels = barrels;
      add(.26, .26, .18, 0, -.02, -.16, dark);
      break;
    }
    case 'RPG7':
      add(.09, .09, 1.05, 0, .02, .28, body);
      { const w = new THREE.Mesh(new THREE.ConeGeometry(.1, .28, 10), new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: .7 }));
        w.rotation.x = -Math.PI / 2; w.position.set(0, .02, .92); g.add(w); }
      add(.06, .12, .12, 0, -.08, -.05, wood);
      break;
    case 'XBOW':
      add(.05, .06, .58, 0, 0, .18, dark);
      add(.62, .03, .05, 0, .02, .34, body);
      add(.05, .1, .16, 0, -.07, -.02, wood);
      break;
    case 'TESLA':
      add(.09, .13, .46, 0, 0, .14, body);
      { const coil = new THREE.Mesh(new THREE.TorusGeometry(.07, .022, 6, 14), new THREE.MeshBasicMaterial({ color: 0xb98cff }));
        coil.position.set(0, .01, .42); g.add(coil); g.userData.coil = coil; }
      add(.06, .13, .1, 0, -.09, -.04, dark);
      break;
    case 'M24': case 'AWM':
      add(.07, .09, .92, 0, 0, .26, body);
      add(.07, .07, .34, 0, -.05, -.16, wood);
      { const sc = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .3, 10), dark);
        sc.rotation.x = Math.PI / 2; sc.position.set(0, .09, .2); g.add(sc); }
      break;
    case 'S686': case 'S12K':
      add(.08, .08, .74, -.03, 0, .22, body); add(.08, .08, .74, .03, 0, .22, body);
      add(.07, .12, .28, 0, -.06, -.14, wood);
      break;
    case 'M249':
      add(.11, .13, .84, 0, 0, .24, body);
      add(.16, .14, .24, 0, -.06, .04, dark);
      add(.06, .12, .2, 0, -.1, -.1, dark);
      break;
    case 'AKM':
      add(.08, .10, .70, 0, 0, .2, body);
      add(.07, .17, .12, 0, -.11, .02, dark);
      add(.07, .09, .30, 0, -.02, -.2, wood);
      { const mag = new THREE.Mesh(new THREE.BoxGeometry(.06, .2, .1), dark); mag.rotation.x = .3; mag.position.set(0, -.14, .1); g.add(mag); }
      break;
    case 'UMP45':
      add(.07, .09, .48, 0, 0, .14, body);
      add(.06, .18, .09, 0, -.11, .04, dark);
      add(.05, .07, .22, 0, 0, -.16, dark);
      break;
    default: // M416 等步枪
      add(.08, .10, .66, 0, 0, .2, body);
      add(.06, .16, .10, 0, -.10, .04, dark);
      add(.06, .08, .26, 0, -.01, -.18, dark);
      { const rail = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .3), dark); rail.position.set(0, .07, .18); g.add(rail); }
      break;
  }
  g.userData.def = def;
  return g;
}

export class WeaponSystem {
  constructor(game) { this.game = game; }

  canFire(w, player) {
    if (!w) return false;
    if (w.reloading || w.cd > 0 || w.boltT > 0) return false;
    if (w.def.melee) return true;
    return w.ammo > 0;
  }

  tick(dt, w, firing) {
    if (!w) return;
    if (w.cd > 0) w.cd -= dt;
    if (w.boltT > 0) w.boltT -= dt;
    if (w.freeAmmoT > 0) w.freeAmmoT -= dt;
    if (w.reloading) {
      w.reloadT -= dt;
      if (w.reloadT <= 0) {
        w.reloading = false;
        const need = w.maxMag - w.ammo;
        const got = this.game.takeAmmo(w.def.ammo, need);
        w.ammo += got;
      }
    }
    if (w.def.spinUp) {
      if (firing && this.canFire(w, null)) { if (w.spin < 1) { if (w.spin === 0) sfx('spin'); w.spin = Math.min(1, w.spin + dt / w.def.spinUp); } }
      else w.spin = Math.max(0, w.spin - dt / (w.def.spinUp * 0.7));
    }
  }

  reload(w) {
    if (!w || w.reloading || w.def.melee) return;
    if (w.ammo >= w.maxMag) return;
    if (this.game.reserveOf(w.def.ammo) <= 0) return;
    w.reloading = true;
    w.reloadT = w.reloadTime;
    sfx('reload');
  }

  /* 主开火 */
  fire(w, player, camera, dt) {
    const game = this.game, fx = game.fx, world = game.world, enemies = game.enemies;
    if (!this.canFire(w, player)) {
      if (w && !w.reloading && w.ammo <= 0 && !w.def.melee && w.cd <= 0) {
        w.cd = 0.35; sfx('dryfire'); game.hud.hint('弹匣已空 — 按 R 换弹');
        if (game.reserveOf(w.def.ammo) > 0) this.reload(w);
      }
      return false;
    }
    const def = w.def;
    if (def.spinUp && w.spin < 1) return false;

    w.cd = def.interval * (def.melee ? 1 : (1 - w.level * 0.02));
    if (def.bolt) w.boltT = def.interval * 0.55;

    // 弹药
    if (!def.melee) {
      const free = w.maxed && def.perk === 'freeammo' && w.freeAmmoT > 0;
      if (!free) w.ammo--;
      if (w.maxed && def.perk === 'freeammo' && w.freeAmmoT <= 0) w.freeAmmoT = 3.0;
    }

    // origin / direction（相机为准，保证准心即命中点）
    const cd = new THREE.Vector3();
    camera.getWorldDirection(cd);
    const co = new THREE.Vector3();
    camera.getWorldPosition(co);

    const muzzle = player.getMuzzleWorld();
    if (def.melee) {
      this.melee(w, player, co, cd);
      return true;
    }

    // 散布
    let spread = def.spread;
    if (player.ads) spread *= 0.35;
    if (player.stance === 'crouch') spread *= 0.75;
    if (player.stance === 'prone') spread *= 0.5;
    const moving = Math.hypot(player.vx, player.vz);
    spread *= 1 + Math.min(1.6, moving * 0.18);
    spread *= (1 + player.recoilAccum * 0.13);

    const pellets = def.pellets;
    for (let i = 0; i < pellets; i++) {
      const d = cd.clone();
      const s = spread * (Math.PI / 180);
      if (s > 0) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * s;
        const up = new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(d, up).normalize();
        const trueUp = new THREE.Vector3().crossVectors(right, d).normalize();
        d.addScaledVector(right, Math.cos(a) * r).addScaledVector(trueUp, Math.sin(a) * r).normalize();
      }
      if (def.projectile === 'rocket') {
        // 弹道收敛：从枪口指向准心命中点，而不是与相机平行
        const aimT = Math.min(def.range, game.world.rayWorld(co.x, co.y, co.z, d.x, d.y, d.z, def.range));
        const ax = co.x + d.x * aimT, ay = co.y + d.y * aimT, az = co.z + d.z * aimT;
        const rd = new THREE.Vector3(ax - muzzle.x, ay - muzzle.y, az - muzzle.z).normalize();
        game.spawnRocket(muzzle.x, muzzle.y, muzzle.z, rd, w);
      } else {
        this.hitscan(w, player, co, d, muzzle);
      }
    }

    // 表现
    fx.muzzle(muzzle.x, muzzle.y, muzzle.z, cd.x, cd.y, cd.z, def.muzzle, def.melee ? 0 : (def.pellets > 1 ? 1.5 : 1));
    if (!def.silent) fx.flash(muzzle.x, muzzle.y, muzzle.z, def.muzzle, 4, 0.05);
    fx.shell(muzzle.x, muzzle.y - 0.1, muzzle.z, cd.x, cd.z);
    sfx(def.sound, 0);
    if (def.silent) { /* 弩：无枪声 */ }

    // 后坐
    const rv = this.game.player.ads ? w.recoilV * 0.6 : w.recoilV;
    const rh = this.game.player.ads ? w.recoilH * 0.6 : w.recoilH;
    player.applyRecoil(rv * 0.012, (Math.random() - 0.5) * rh * 0.014);
    player.recoilAccum = Math.min(9, player.recoilAccum + 1);
    player.gunKick = Math.min(1, player.gunKick + (def.pellets > 1 ? 0.9 : 0.35));
    game.shake(def.pellets > 1 ? 0.22 : (def.bolt ? 0.3 : 0.08));
    return true;
  }

  hitscan(w, player, origin, dir, muzzle) {
    const game = this.game, fx = game.fx, world = game.world, enemies = game.enemies;
    const def = w.def;
    let ox = origin.x, oy = origin.y, oz = origin.z;
    let remaining = def.range;
    let pierce = 0;
    if (w.maxed && def.perk === 'pierce') pierce = 2;
    if (def.pierceBase) pierce = def.pierceBase;
    if (w.maxed && def.perk === 'bigpierce') pierce = 5;
    const skipped = [];
    let lastPoint = null;

    for (let step = 0; step <= pierce; step++) {
      const wallT = world.rayWorld(ox, oy, oz, dir.x, dir.y, dir.z, remaining);
      let hit = enemies.raycast(ox, oy, oz, dir.x, dir.y, dir.z, Math.min(wallT, remaining));
      // 已穿透过的敌人跳过
      while (hit && skipped.includes(hit.e)) {
        const nx = ox + dir.x * (hit.t + 0.05), ny = oy + dir.y * (hit.t + 0.05), nz = oz + dir.z * (hit.t + 0.05);
        remaining -= (hit.t + 0.05); ox = nx; oy = ny; oz = nz;
        if (remaining <= 0) { hit = null; break; }
        hit = enemies.raycast(ox, oy, oz, dir.x, dir.y, dir.z, Math.min(world.rayWorld(ox, oy, oz, dir.x, dir.y, dir.z, remaining), remaining));
      }
      // 油桶
      const barrel = game.raycastBarrel(ox, oy, oz, dir, Math.min(wallT, remaining, hit ? hit.t : Infinity));

      if (barrel) {
        lastPoint = { x: ox + dir.x * barrel.t, y: oy + dir.y * barrel.t, z: oz + dir.z * barrel.t };
        fx.sparks(lastPoint.x, lastPoint.y, lastPoint.z, -dir.x, -dir.y, -dir.z, 8, 0xffd27a);
        game.damageBarrel(barrel.b, w.dmg);
        break;
      }
      if (hit) {
        const px = ox + dir.x * hit.t, py = oy + dir.y * hit.t, pz = oz + dir.z * hit.t;
        lastPoint = { x: px, y: py, z: pz };
        let dmg = w.dmg;
        const applied = enemies.hit(hit.e, dmg, hit.head, player.x, player.z, { weapon: w });
        fx.blood(px, py, pz, -dir.x, 0.4, -dir.z, hit.head ? 16 : 10, hit.e.def.eye);
        fx.damageNumber(px, py, pz, applied, hit.head ? 'head' : '');
        game.onHit(hit.head);
        game.stats.dmg += applied;
        game.stats.hits++;
        // 特化
        if (w.maxed) {
          if (def.perk === 'fire') { hit.e.burnT = 3.5; fx.burn(px, pz, 2.4, 3.0); }
          if (def.perk === 'explosive') { enemies.explode(px, py, pz, 5.5, w.dmg * 0.55, hit.e); }
          if (def.perk === 'lifesteal') game.healPlayer(applied * 0.08);
        }
        if (def.chain || (w.maxed && def.perk === 'chainplus')) {
          this.chain(w, hit.e, px, py, pz, (w.maxed ? (def.chain || 3) + 2 : def.chain || 3), w.maxed ? 14 : 8);
        }
        skipped.push(hit.e);
        remaining -= hit.t + 0.1;
        ox = px + dir.x * 0.1; oy = py + dir.y * 0.1; oz = pz + dir.z * 0.1;
        if (remaining <= 0) break;
        continue;
      }
      // 打到墙 / 空
      const t = Math.min(wallT, remaining);
      lastPoint = { x: ox + dir.x * t, y: oy + dir.y * t, z: oz + dir.z * t };
      if (wallT < remaining) {
        fx.sparks(lastPoint.x, lastPoint.y, lastPoint.z, -dir.x, -dir.y, -dir.z, 7);
        if (w.maxed && def.perk === 'explosive') enemies.explode(lastPoint.x, lastPoint.y, lastPoint.z, 5.5, w.dmg * 0.5);
      }
      break;
    }
    game.stats.shots++;
    if (lastPoint) {
      const tcol = def.silent ? 0x9fe8ff : (w.maxed ? 0xffc23c : def.muzzle);
      if (def.pellets > 1 ? Math.random() < 0.5 : true)
        fx.tracer(muzzle.x, muzzle.y, muzzle.z, lastPoint.x, lastPoint.y, lastPoint.z, tcol, 0.055);
    }
  }

  chain(w, from, px, py, pz, count, radius) {
    const game = this.game, enemies = game.enemies, fx = game.fx;
    let cur = from, cx = px, cy = py, cz = pz;
    const used = [from];
    for (let i = 0; i < count; i++) {
      let best = null, bd = radius;
      for (const e of enemies.list) {
        if (e.dead || used.includes(e)) continue;
        const d = Math.hypot(e.x - cx, e.z - cz, (e.y + e.bodyY) - cy);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      const tx = best.x, ty = best.y + best.bodyY, tz = best.z;
      fx.tracer(cx, cy, cz, tx, ty, tz, 0xb98cff, 0.14);
      for (let k = 1; k < 6; k++) {
        const kk = k / 6;
        fx.spawn(cx + (tx - cx) * kk + (Math.random() - .5) * .6, cy + (ty - cy) * kk + (Math.random() - .5) * .6, cz + (tz - cz) * kk + (Math.random() - .5) * .6,
          0, 0, 0, 0.16, 0.1, 0xd0a8ff, 0, 0.9);
      }
      const applied = enemies.hit(best, w.dmg * 0.6, false, cx, cz, { weapon: w, silent: true });
      fx.damageNumber(tx, ty, tz, applied, 'chain');
      game.stats.dmg += applied;
      used.push(best);
      cur = best; cx = tx; cy = ty; cz = tz;
    }
  }

  melee(w, player, origin, dir) {
    const game = this.game, enemies = game.enemies, fx = game.fx;
    sfx('pan');
    player.gunKick = 1;
    game.shake(0.16);
    const hit = enemies.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.def.range);
    if (hit) {
      const px = origin.x + dir.x * hit.t, py = origin.y + dir.y * hit.t, pz = origin.z + dir.z * hit.t;
      const applied = enemies.hit(hit.e, w.dmg, hit.head, player.x, player.z, { weapon: w });
      fx.blood(px, py, pz, -dir.x, .5, -dir.z, 14, hit.e.def.eye);
      fx.damageNumber(px, py, pz, applied, hit.head ? 'head' : '');
      game.onHit(hit.head);
      game.stats.dmg += applied;
      game.stats.hits++;
    }
    game.stats.shots++;
  }
}
