/* 仿生人：外观、AI、受击、死亡；含 BOSS 三阶段 */
import * as THREE from '../vendor/three.module.min.js';
import { ENEMIES } from './data.js';
import { sfx } from './audio.js';

const G = {
  head: new THREE.BoxGeometry(0.46, 0.46, 0.46),
  visor: new THREE.BoxGeometry(0.40, 0.13, 0.06),
  torso: new THREE.BoxGeometry(0.72, 0.95, 0.42),
  hip: new THREE.BoxGeometry(0.62, 0.30, 0.40),
  arm: new THREE.BoxGeometry(0.20, 0.80, 0.20),
  leg: new THREE.BoxGeometry(0.24, 0.86, 0.24),
  gun: new THREE.BoxGeometry(0.14, 0.14, 0.86),
  core: new THREE.SphereGeometry(0.16, 10, 8),
  rotor: new THREE.BoxGeometry(1.5, 0.04, 0.12),
  drone: new THREE.BoxGeometry(0.75, 0.28, 0.75),
  shield: new THREE.BoxGeometry(1.25, 1.5, 0.16),
};

function m(color, rough = 0.7, metal = 0.45) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}
function glow(color) {
  return new THREE.MeshBasicMaterial({ color });
}

export class EnemyManager {
  constructor(scene, world, fx, game) {
    this.scene = scene; this.world = world; this.fx = fx; this.game = game;
    this.list = [];
    this.mats = {};
    this.glows = {};
    for (const k in ENEMIES) {
      this.mats[k] = m(ENEMIES[k].color);
      this.glows[k] = glow(ENEMIES[k].eye);
    }
    this.darkM = m(0x4e5560, 0.85, 0.3);
    this.shieldM = new THREE.MeshStandardMaterial({ color: 0xff8a2a, transparent: true, opacity: .55, roughness: .3, metalness: .6 });
    this.boss = null;
    this._tmp = new THREE.Vector3();
  }

  buildHumanoid(def, key) {
    const g = new THREE.Group();
    const body = this.mats[key], eye = this.glows[key];
    const head = new THREE.Mesh(G.head, body); head.position.y = 1.68; g.add(head);
    const visor = new THREE.Mesh(G.visor, eye); visor.position.set(0, 1.70, 0.235); g.add(visor);
    const torso = new THREE.Mesh(G.torso, body); torso.position.y = 1.05; g.add(torso);
    const core = new THREE.Mesh(G.core, eye); core.position.set(0, 1.12, 0.22); core.scale.setScalar(0.55); g.add(core);
    const hip = new THREE.Mesh(G.hip, this.darkM); hip.position.y = 0.46; g.add(hip);
    const la = new THREE.Mesh(G.arm, this.darkM); la.position.set(-0.46, 1.06, 0); g.add(la);
    const ra = new THREE.Mesh(G.arm, this.darkM); ra.position.set(0.46, 1.06, 0); g.add(ra);
    const ll = new THREE.Mesh(G.leg, this.darkM); ll.position.set(-0.17, 0.0, 0); g.add(ll);
    const rl = new THREE.Mesh(G.leg, this.darkM); rl.position.set(0.17, 0.0, 0); g.add(rl);
    ll.geometry = G.leg; rl.geometry = G.leg;
    ll.position.y = 0.0; rl.position.y = 0.0;
    // 腿以髋部为轴
    const lPiv = new THREE.Group(); lPiv.position.set(-0.17, 0.44, 0); lPiv.add(ll); ll.position.set(0, -0.43, 0); g.add(lPiv);
    const rPiv = new THREE.Group(); rPiv.position.set(0.17, 0.44, 0); rPiv.add(rl); rl.position.set(0, -0.43, 0); g.add(rPiv);
    const laPiv = new THREE.Group(); laPiv.position.set(-0.46, 1.45, 0); laPiv.add(la); la.position.set(0, -0.40, 0); g.add(laPiv);
    const raPiv = new THREE.Group(); raPiv.position.set(0.46, 1.45, 0); raPiv.add(ra); ra.position.set(0, -0.40, 0); g.add(raPiv);

    g.userData.parts = { head, visor, torso, core, lPiv, rPiv, laPiv, raPiv };
    if (def.ranged && !def.flying) {
      const gun = new THREE.Mesh(G.gun, this.darkM);
      gun.position.set(0, -0.36, 0.45); raPiv.add(gun);
      g.userData.parts.gun = gun;
    }
    if (def.frontShield) {
      const sh = new THREE.Mesh(G.shield, this.shieldM);
      sh.position.set(-0.15, 1.05, 0.5); g.add(sh);
      g.userData.parts.shield = sh;
    }
    if (def.molotov || def.volatile) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10), m(0xd94a2a, .6, .5));
      tank.position.set(0, 1.15, -0.34); g.add(tank);
    }
    if (def.elite) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 6), glow(0xffd24a));
      crown.position.y = 2.05; g.add(crown);
    }
    return g;
  }

  buildDrone(def) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(G.drone, this.mats.drone); g.add(body);
    const eye = new THREE.Mesh(G.core, this.glows.drone); eye.position.set(0, -0.1, 0.36); g.add(eye);
    const rotors = [];
    for (const [dx, dz] of [[-.44, -.44], [.44, -.44], [-.44, .44], [.44, .44]]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), this.darkM);
      arm.position.set(dx, 0.06, dz); g.add(arm);
      const r = new THREE.Mesh(G.rotor, this.darkM);
      r.position.set(dx, 0.18, dz); g.add(r); rotors.push(r);
    }
    const gun = new THREE.Mesh(G.gun, this.darkM); gun.scale.setScalar(0.7); gun.position.set(0, -0.2, 0.3); g.add(gun);
    g.userData.parts = { rotors, eye, gun };
    return g;
  }

  buildBoss(def) {
    const g = new THREE.Group();
    const body = m(def.color, 0.5, 0.3);
    const dark = m(0x515a66, 0.7, 0.35);
    const eye = glow(def.eye);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.5), body); torso.position.y = 3.2; g.add(torso);
    const chestL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), dark); chestL.position.set(-0.7, 3.5, 0.78); g.add(chestL);
    const chestR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), dark); chestR.position.set(0.7, 3.5, 0.78); g.add(chestR);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), glow(0xff5a2a)); core.position.set(0, 3.4, 0.6); g.add(core);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.95), body); head.position.y = 4.75; g.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.2, 0.1), eye); visor.position.set(0, 4.8, 0.5); g.add(visor);
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.2), body); shoulderL.position.set(-1.75, 4.05, 0); g.add(shoulderL);
    const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 1.2), body); shoulderR.position.set(1.75, 4.05, 0); g.add(shoulderR);
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 2.6, 12), dark);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(1.75, 3.5, 1.0); g.add(cannon);
    const cannon2 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 2.6, 12), dark);
    cannon2.rotation.x = Math.PI / 2; cannon2.position.set(-1.75, 3.5, 1.0); g.add(cannon2);
    const pods = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), dark); pods.position.set(0, 4.4, -0.8); g.add(pods);
    for (const s of [-1, 1]) {
      const lp = new THREE.Group(); lp.position.set(s * 0.72, 2.2, 0);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.3, 0.75), dark); thigh.position.y = -0.6; lp.add(thigh);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.4, 0.62), body); shin.position.y = -1.9; lp.add(shin);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 1.3), dark); foot.position.set(0, -2.7, 0.2); lp.add(foot);
      g.add(lp);
      if (s < 0) g.userData.lPiv = lp; else g.userData.rPiv = lp;
    }
    g.userData.parts = { core, visor, head, torso, cannon, cannon2, chestL, chestR, shoulderL, shoulderR };
    return g;
  }

  spawn(type, x, z, opts) {
    const def = ENEMIES[type];
    if (!def) return null;
    const d = this.game.diff;
    let mesh;
    if (def.boss) mesh = this.buildBoss(def);
    else if (def.flying) mesh = this.buildDrone(def);
    else mesh = this.buildHumanoid(def, type);
    mesh.scale.setScalar(def.boss ? 1.4 : def.scale);
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    const y = def.flying ? def.hoverY : 0;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const hpMul = (opts && opts.hpMul || 1) * d.hp;
    const e = {
      type, def, mesh, x, y, z, vx: 0, vz: 0, vy: 0,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      shield: def.shield ? def.shield * hpMul : 0, maxShield: def.shield ? def.shield * hpMul : 0,
      atkT: Math.random() * 0.8, chargeT: 0, dead: false, yaw: 0, walk: Math.random() * 6,
      stun: 0, freeze: 0, burnT: 0, phase: 1, bossT: 0, salvo: 0, laser: null,
      stuckT: 0, sidePref: 0, sideT: 0, escapeT: 0, escapeX: 0, escapeZ: 0, bestDist: null, noProg: 0,
      radius: (def.boss ? 3.1 : 0.55 * def.scale),
      height: (def.boss ? 7.9 : 1.9 * def.scale),
      headY: (def.boss ? 6.70 : 1.68 * def.scale),
      headR: (def.boss ? 0.88 : 0.30 * def.scale),
      bodyY: (def.boss ? 4.6 : 1.05 * def.scale),
      bodyR: (def.boss ? 2.1 : 0.52 * def.scale),
      spawnT: 0.35, hitFlash: 0, targetSlot: Math.random() * Math.PI * 2,
    };
    if (def.laser) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      e.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xff2020, transparent: true, opacity: .6, depthWrite: false }));
      e.laser.frustumCulled = false;
      this.scene.add(e.laser);
    }
    if (def.boss) { this.boss = e; sfx('boss'); }
    this.list.push(e);
    return e;
  }

  alive() { let n = 0; for (const e of this.list) if (!e.dead) n++; return n; }

  clear() {
    for (const e of this.list) { this.scene.remove(e.mesh); if (e.laser) this.scene.remove(e.laser); }
    this.list.length = 0; this.boss = null;
  }

  /* 射线 vs 敌人（球体近似），返回 {e, t, head, point} */
  raycast(ox, oy, oz, dx, dy, dz, maxD, skip) {
    let best = null, bt = maxD;
    for (const e of this.list) {
      if (e.dead || e === skip) continue;
      const hy = e.y + e.headY, by = e.y + e.bodyY;
      let t = raySphere(ox, oy, oz, dx, dy, dz, e.x, hy, e.z, e.headR);
      if (t >= 0 && t < bt) { bt = t; best = { e, t, head: true }; }
      t = raySphere(ox, oy, oz, dx, dy, dz, e.x, by, e.z, e.bodyR);
      if (t >= 0 && t < bt) { bt = t; best = { e, t, head: false }; }
      if (!e.def.boss) {
        t = raySphere(ox, oy, oz, dx, dy, dz, e.x, e.y + 0.45 * e.def.scale, e.z, 0.42 * e.def.scale);
        if (t >= 0 && t < bt) { bt = t; best = { e, t, head: false }; }
      }
    }
    return best;
  }

  hit(e, dmg, head, fromX, fromZ, opts) {
    if (e.dead) return 0;
    opts = opts || {};
    let d = dmg;
    if (head) d *= e.def.boss && e.phase >= 2 ? 3 : 2;
    // 重装正面护盾
    if (e.def.frontShield && !opts.ignoreShield) {
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const tx = fromX - e.x, tz = fromZ - e.z;
      const l = Math.hypot(tx, tz) || 1;
      if ((tx / l) * fx + (tz / l) * fz > 0.35) d *= (1 - e.def.frontShield);
    }
    if (e.def.boss && e.phase === 1 && !head) d *= 0.6;
    if (e.shield > 0) {
      const absorbed = Math.min(e.shield, d);
      e.shield -= absorbed; d -= absorbed;
      sfx('shield', dist2(e, this.game.player));
    }
    e.hp -= d;
    e.hitFlash = 0.09;
    if (!opts.silent) sfx(head ? 'headshot' : 'hit');
    if (e.hp <= 0) { this.kill(e, opts); return d; }
    if (!e.def.boss && !e.def.elite) {
      e.stun = Math.min(0.22, 0.05 + d / 260);
      const kx = e.x - fromX, kz = e.z - fromZ, kl = Math.hypot(kx, kz) || 1;
      const kb = Math.min(2.6, d / 45);
      e.vx += kx / kl * kb; e.vz += kz / kl * kb;
    }
    return d;
  }

  kill(e, opts) {
    if (e.dead) return;
    e.dead = true;
    const col = e.def.eye;
    this.fx.blood(e.x, e.y + e.bodyY, e.z, 0, 0.6, 0, e.def.boss ? 60 : 18, col);
    this.fx.sparks(e.x, e.y + e.bodyY, e.z, 0, 1, 0, e.def.boss ? 60 : 14, 0xffc25a, e.def.boss ? 16 : 8);
    if (e.def.suicide || e.def.volatile) {
      this.explode(e.x, e.y + 0.8, e.z, e.def.splash || 5, (e.def.dmg || 40) * 0.8, e);
    }
    if (e.def.boss) {
      for (let i = 0; i < 8; i++) setTimeout(() => this.fx.explosion(
        e.x + (Math.random() - .5) * 6, 1 + Math.random() * 4, e.z + (Math.random() - .5) * 6, 6), i * 130);
      this.boss = null;
    }
    this.scene.remove(e.mesh);
    if (e.laser) { this.scene.remove(e.laser); e.laser = null; }
    this.game.onEnemyKilled(e, opts || {});
  }

  explode(x, y, z, radius, dmg, source) {
    this.fx.explosion(x, y, z, radius);
    sfx('explode', dist2({ x, z }, this.game.player));
    this.damageArea(x, y, z, radius, dmg, source);
    this.game.explodeBarrelsNear(x, z, radius);
    this.game.playerSplash(x, y, z, radius, dmg);
  }

  damageArea(x, y, z, radius, dmg, source, opts) {
    for (const e of this.list) {
      if (e.dead || e === source) continue;
      const dx = e.x - x, dz = e.z - z, dy = (e.y + e.bodyY) - y;
      const d = Math.sqrt(dx * dx + dz * dz + dy * dy);
      if (d > radius) continue;
      const falloff = 1 - (d / radius) * 0.65;
      this.hit(e, dmg * falloff, false, x, z, Object.assign({ ignoreShield: true, silent: true }, opts));
    }
  }

  freezeArea(x, z, radius, dur) {
    for (const e of this.list) {
      if (e.dead) continue;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz <= radius * radius) {
        e.freeze = Math.max(e.freeze, dur);
        e.mesh.traverse(o => { if (o.isMesh && o.material.color) o.material.__frozen = true; });
      }
    }
  }

  update(dt, player, t) {
    const world = this.world, fx = this.fx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) { this.list.splice(i, 1); continue; }
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        e.mesh.scale.setScalar((e.def.boss ? 1.4 : e.def.scale) * (0.4 + 0.6 * (1 - Math.max(0, e.spawnT) / 0.35)));
      }
      if (e.hitFlash > 0) {
        e.hitFlash -= dt;
        e.mesh.visible = true;
      }
      if (e.freeze > 0) { e.freeze -= dt; }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick = (e.burnTick || 0) + dt;
        if (e.burnTick > 0.5) { e.burnTick = 0; this.hit(e, 9, false, e.x, e.z, { silent: true, ignoreShield: true }); }
        if (Math.random() < dt * 12) fx.spawn(e.x + (Math.random() - .5), e.y + Math.random() * 1.5, e.z + (Math.random() - .5), 0, 2.4, 0, 0.4, 0.16, 0xff7a24, -0.3, 0.94);
      }
      if (fx.burnDamageAt(e.x, e.z) && e.y < 1) e.burnT = Math.max(e.burnT, 0.6);
      if (e.stun > 0) e.stun -= dt;

      if (e.def.boss) this.updateBoss(e, dt, player, t);
      else this.updateNormal(e, dt, player, t);

      // 位置写回
      e.mesh.position.set(e.x, e.y, e.z);
      e.mesh.rotation.y = e.yaw;
      // 冻结变色
      if (e.freeze > 0) { e.mesh.traverse(o => { if (o.isMesh) o.material === this.mats[e.type] && (o.material = o.material); }); }
    }
  }

  updateNormal(e, dt, player, t) {
    const def = e.def, world = this.world, fx = this.fx;
    const STEP = def.flying ? 0 : (def.boss ? 0.6 : 1.25);   // 可翻越沙袋等矮掩体
    const px = player.x, pz = player.z, py = player.y;
    let dx = px - e.x, dz = pz - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    const wantYaw = Math.atan2(nx, nz);
    let dy = wantYaw - e.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += dy * Math.min(1, dt * 7);

    const slow = e.freeze > 0 ? 0 : (e.stun > 0 ? 0.25 : 1);
    let speed = def.speed * slow * (this.game.speedScale || 1);
    if (def.suicide && dist < 14) speed *= 1.35;

    // 目标距离
    let want = def.ranged ? (def.preferDist || (def.atkRange * 0.72)) : (def.atkRange * 0.6);
    if (def.flying) want = def.atkRange * 0.6;

    let mx = 0, mz = 0;
    if (dist > want) { mx = nx; mz = nz; }
    else if (dist < want * 0.68 && def.ranged) { mx = -nx; mz = -nz; }
    else if (def.ranged) { mx = -nz * Math.sin(e.targetSlot + t * 0.4); mz = nx * Math.sin(e.targetSlot + t * 0.4); }

    // 分离力
    let sx = 0, sz = 0;
    for (const o of this.list) {
      if (o === e || o.dead) continue;
      if (Math.abs(o.y - e.y) > 3) continue;
      const ox = e.x - o.x, oz = e.z - o.z;
      const d2 = ox * ox + oz * oz;
      const rr = (e.radius + o.radius) * 1.25;
      if (d2 < rr * rr && d2 > 1e-4) {
        const d = Math.sqrt(d2);
        sx += ox / d * (1 - d / rr); sz += oz / d * (1 - d / rr);
      }
    }
    mx += sx * 1.5; mz += sz * 1.5;

    // ── 上下文转向：在扇形内挑一条既朝向玩家又最通畅的路 ──
    if (!def.flying && (mx || mz)) {
      const ml0 = Math.hypot(mx, mz) || 1;
      const dxw = mx / ml0, dzw = mz / ml0;
      const probeY = e.y + STEP + 0.2;         // 低于此高度的掩体可翻越，不算障碍
      const MAXP = 5.5;
      let bestS = -1e9, bx = dxw, bz = dzw;
      for (let i = 0; i < 12; i++) {
        const a = (i - 5.5) * 0.29;
        const ca = Math.cos(a), sa = Math.sin(a);
        const cx = dxw * ca - dzw * sa, cz = dxw * sa + dzw * ca;
        const free = Math.min(MAXP, world.rayWorld(e.x, probeY, e.z, cx, 0, cz, MAXP));
        const align = cx * dxw + cz * dzw;
        let sc = free + align * 2.4;
        if (e.sidePref) sc += (a * e.sidePref > 0 ? 0.9 : 0);   // 卡住时固定绕一侧
        if (sc > bestS) { bestS = sc; bx = cx; bz = cz; }
      }
      mx = bx; mz = bz;
    }

    if (e.escapeT > 0) { e.escapeT -= dt; mx = e.escapeX; mz = e.escapeZ; }
    const ml = Math.hypot(mx, mz);
    if (ml > 0.001) { mx /= ml; mz /= ml; } else { mx = mz = 0; }
    e.vx += (mx * speed - e.vx) * Math.min(1, dt * 6);
    e.vz += (mz * speed - e.vz) * Math.min(1, dt * 6);
    const px0 = e.x, pz0 = e.z;
    e.x += e.vx * dt; e.z += e.vz * dt;

    if (def.flying) {
      const target = def.hoverY + Math.sin(t * 1.6 + e.targetSlot) * 1.2;
      e.y += (target - e.y) * Math.min(1, dt * 2.2);
      const parts = e.mesh.userData.parts;
      if (parts && parts.rotors) parts.rotors.forEach((r, k) => r.rotation.y += dt * (48 + k));
      e.mesh.rotation.z = -e.vx * 0.05;
      e.mesh.rotation.x = e.vz * 0.05;
    } else {
      const res = world.resolve(e.x, e.z, e.y, e.radius, e.height, STEP);
      e.x = res.x; e.z = res.z;
      const floor = world.floorAt(e.x, e.z, e.y + 0.3, e.radius, STEP + 0.15);
      e.y += (floor - e.y) * Math.min(1, dt * 9);
      // ── 卡住检测：想动却几乎没位移，就固定绕一侧一段时间 ──
      e.stuckT = (e.stuckT || 0);
      if (dist > want + 0.6 && Math.hypot(e.x - px0, e.z - pz0) < speed * dt * 0.35) {
        e.stuckT += dt;
        if (e.stuckT > 0.45 && !e.sidePref) { e.sidePref = Math.random() < 0.5 ? 1 : -1; e.sideT = 2.4; }
        // 顽固卡死 → 全向搜索一条最通畅的路并锁定一段时间
        if (e.stuckT > 2.2 && e.escapeT <= 0) {
          let bs = -1, bx = 0, bz = 0;
          for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2;
            const cx = Math.sin(a), cz = Math.cos(a);
            const free = world.rayWorld(e.x, e.y + STEP + 0.2, e.z, cx, 0, cz, 9);
            const toward = (cx * nx + cz * nz) * 1.4;
            if (free + toward > bs) { bs = free + toward; bx = cx; bz = cz; }
          }
          e.escapeX = bx; e.escapeZ = bz; e.escapeT = 1.6; e.stuckT = 0; e.sidePref = 0;
        }
      } else if (e.stuckT > 0) e.stuckT = Math.max(0, e.stuckT - dt * 2);
      if (e.sidePref) { e.sideT -= dt; if (e.sideT <= 0) { e.sidePref = 0; e.stuckT = 0; } }

      // 防卡死兜底：长时间无法靠近玩家 → 以"增援"形式重新投放到玩家附近
      if (e.bestDist == null || dist < e.bestDist - 1.5) { e.bestDist = dist; e.noProg = 0; }
      else e.noProg = (e.noProg || 0) + dt;
      if (e.noProg > 9 && dist > want + 3) {
        const a = Math.atan2(player.z, player.x) + (Math.random() - 0.5) * 2.2;
        const R = Math.max(22, Math.min(this.world.blockadeR - 8, 42));
        this.fx.sparks(e.x, e.y + 1, e.z, 0, 1, 0, 12, def.eye, 5);
        e.x = Math.cos(a) * R; e.z = Math.sin(a) * R; e.y = def.flying ? def.hoverY : 0;
        e.vx = e.vz = 0; e.noProg = 0; e.bestDist = null; e.escapeT = 0; e.stuckT = 0;
        this.fx.sparks(e.x, e.y + 1, e.z, 0, 1, 0, 14, def.eye, 6);
      }
      // 行走动画
      const sp = Math.hypot(e.vx, e.vz);
      e.walk += dt * (2.2 + sp * 1.6);
      const p = e.mesh.userData.parts;
      if (p && p.lPiv) {
        const a = Math.sin(e.walk * 2.2) * Math.min(0.85, sp * 0.2);
        p.lPiv.rotation.x = a; p.rPiv.rotation.x = -a;
        if (def.ranged) { p.raPiv.rotation.x = -1.35; p.laPiv.rotation.x = -1.0; }
        else { p.laPiv.rotation.x = -a * 0.75; p.raPiv.rotation.x = a * 0.75; }
        if (p.core) p.core.scale.setScalar(0.55 + Math.sin(t * 6) * 0.08);
      }
    }
    // 场外限制
    const R = this.world.blockadeR + 6;
    const rr = Math.hypot(e.x, e.z);
    if (rr > R) { e.x = e.x / rr * R; e.z = e.z / rr * R; }

    // 自爆闪烁
    if (def.suicide) {
      const p = e.mesh.userData.parts;
      const rate = dist < 10 ? 16 : 6;
      if (p && p.core) p.core.visible = (Math.sin(t * rate) > -0.2);
      if (p && p.visor) p.visor.visible = p.core.visible;
    }

    // 攻击
    e.atkT -= dt * (e.freeze > 0 ? 0 : 1);
    const canSee = this.hasLOS(e, player);
    if (def.laser && e.laser) {
      const show = dist < def.atkRange && canSee && e.chargeT > 0;
      e.laser.visible = show;
      if (show) {
        const a = e.laser.geometry.attributes.position.array;
        a[0] = e.x; a[1] = e.y + 1.5; a[2] = e.z;
        a[3] = px; a[4] = py + 1.2; a[5] = pz;
        e.laser.geometry.attributes.position.needsUpdate = true;
        e.laser.material.opacity = 0.25 + (1 - e.chargeT / def.charge) * 0.7;
      }
    }
    if (e.atkT <= 0 && dist <= def.atkRange && (def.ranged ? canSee : true) && e.freeze <= 0) {
      if (def.charge) {
        if (e.chargeT <= 0) { e.chargeT = def.charge; }
        e.chargeT -= dt;
        if (e.chargeT <= 0) {
          e.chargeT = 0; e.atkT = def.atkInterval;
          this.enemyShoot(e, player, def.dmg, 0xff3020);
        }
      } else if (def.suicide) {
        if (dist < def.atkRange) {
          this.explode(e.x, e.y + 0.9, e.z, def.splash, def.dmg, e);
          e.hp = 0; this.kill(e, { silent: true });
        }
      } else if (def.ranged) {
        e.atkT = def.atkInterval;
        if (def.molotov) this.throwMolotov(e, player);
        else if (def.arc) this.arcAttack(e, player, dist);
        else {
          const burst = def.burst || 1;
          for (let b = 0; b < burst; b++)
            setTimeout(() => { if (!e.dead) this.enemyShoot(e, player, def.dmg, def.eye); }, b * 90);
        }
      } else {
        e.atkT = def.atkInterval;
        this.meleeAttack(e, player, dist);
      }
    }
    if (def.charge && (dist > def.atkRange || !canSee)) e.chargeT = 0;
  }

  meleeAttack(e, player, dist) {
    const def = e.def;
    const p = e.mesh.userData.parts;
    if (p && p.raPiv) {
      p.raPiv.rotation.x = -2.2;
      setTimeout(() => { if (!e.dead && p.raPiv) p.raPiv.rotation.x = 0; }, 220);
    }
    if (dist <= def.atkRange + 0.6) {
      setTimeout(() => {
        if (e.dead) return;
        const d2 = Math.hypot(this.game.player.x - e.x, this.game.player.z - e.z);
        if (d2 <= def.atkRange + 1.0) this.game.damagePlayer(def.dmg * this.game.diff.dmg, e.x, e.z, def.slam ? 'slam' : 'melee');
      }, 180);
    }
    if (def.slam) {
      setTimeout(() => {
        if (e.dead) return;
        this.fx.explosion(e.x, 0.4, e.z, def.slam, 0xffc23c);
        const d2 = Math.hypot(this.game.player.x - e.x, this.game.player.z - e.z);
        if (d2 < def.slam) this.game.damagePlayer(def.dmg * 0.6 * this.game.diff.dmg, e.x, e.z, 'slam');
      }, 200);
    }
  }

  arcAttack(e, player, dist) {
    const def = e.def;
    this.fx.tracer(e.x, e.y + 1.4, e.z, player.x, player.y + 1.1, player.z, 0xc08cff, 0.16);
    for (let i = 0; i < 8; i++) {
      const k = i / 8;
      this.fx.spawn(e.x + (player.x - e.x) * k + (Math.random() - .5), e.y + 1.4 + (player.y + 1 - e.y - 1.4) * k, e.z + (player.z - e.z) * k + (Math.random() - .5),
        0, 0, 0, 0.2, 0.1, 0xc08cff, 0, 0.9);
    }
    sfx('arc', dist);
    this.game.damagePlayer(def.dmg * this.game.diff.dmg, e.x, e.z, 'shock');
    this.game.blind(1.1);
  }

  throwMolotov(e, player) {
    const gx = player.x + (Math.random() - .5) * 4, gz = player.z + (Math.random() - .5) * 4;
    this.game.spawnGrenade(e.x, e.y + 1.4, e.z, gx, gz, 'molotov', true);
  }

  enemyShoot(e, player, dmg, col) {
    const ox = e.x, oy = e.y + (e.def.flying ? 0 : 1.45), oz = e.z;
    const tx = player.x + (Math.random() - .5) * 0.9;
    const ty = player.y + 1.05 + (Math.random() - .5) * 0.5;
    const tz = player.z + (Math.random() - .5) * 0.9;
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const wallT = this.world.rayWorld(ox, oy, oz, dx, dy, dz, l);
    this.fx.tracer(ox, oy, oz, ox + dx * Math.min(l, wallT), oy + dy * Math.min(l, wallT), oz + dz * Math.min(l, wallT), col || 0xff5a3c, 0.06);
    this.fx.muzzle(ox + dx * 0.6, oy + dy * 0.6, oz + dz * 0.6, dx, dy, dz, col || 0xff8a4a, 0.55);
    sfx(e.def.charge ? 'sniper' : 'rifle', Math.hypot(player.x - e.x, player.z - e.z));
    if (wallT < l - 0.4) {
      this.fx.sparks(ox + dx * wallT, oy + dy * wallT, oz + dz * wallT, -dx, -dy, -dz, 6);
      return;
    }
    if (this.fx.smokeBlocks(ox, oz, player.x, player.z) && Math.random() < 0.75) return;
    // 命中判定（玩家胶囊）
    const t = raySphere(ox, oy, oz, dx, dy, dz, player.x, player.y + 1.0, player.z, 0.55);
    if (t >= 0 && t <= l + 0.5) this.game.damagePlayer(dmg * this.game.diff.dmg, e.x, e.z, 'bullet');
  }

  hasLOS(e, player) {
    const ox = e.x, oy = e.y + 1.4, oz = e.z;
    let dx = player.x - ox, dy = (player.y + 1.05) - oy, dz = player.z - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    return this.world.rayWorld(ox, oy, oz, dx, dy, dz, l) >= l - 0.6;
  }

  /* ── BOSS ── */
  updateBoss(e, dt, player, t) {
    const def = e.def;
    const ratio = e.hp / e.maxHp;
    const newPhase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (newPhase !== e.phase) {
      e.phase = newPhase;
      sfx('boss');
      this.game.bossPhase(newPhase);
      this.fx.explosion(e.x, 3.4, e.z, 10, 0xff6a2a);
      const p = e.mesh.userData.parts;
      if (newPhase >= 2 && p.core) { p.core.material = new THREE.MeshBasicMaterial({ color: 0xff3020 }); p.chestL.position.x = -1.15; p.chestR.position.x = 1.15; }
      if (newPhase === 3 && p.visor) p.visor.material = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    }
    let dx = player.x - e.x, dz = player.z - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist, nz = dz / dist;
    const wantYaw = Math.atan2(nx, nz);
    let dyaw = wantYaw - e.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    e.yaw += dyaw * Math.min(1, dt * 2.0);

    const speed = def.speed * (e.phase === 3 ? 1.5 : e.phase === 2 ? 1.2 : 1) * (e.freeze > 0 ? 0 : 1);
    if (dist > 16) { e.vx += (nx * speed - e.vx) * dt * 2.4; e.vz += (nz * speed - e.vz) * dt * 2.4; }
    else { e.vx *= 0.9; e.vz *= 0.9; }
    e.x += e.vx * dt; e.z += e.vz * dt;
    const bres = this.world.resolve(e.x, e.z, e.y, e.radius, e.height, 2.0);
    e.x = bres.x; e.z = bres.z;
    const rr = Math.hypot(e.x, e.z), R = this.world.blockadeR - 6;
    if (rr > R) { e.x = e.x / rr * R; e.z = e.z / rr * R; }

    const lp = e.mesh.userData.lPiv, rp = e.mesh.userData.rPiv;
    e.walk += dt * (1.2 + Math.hypot(e.vx, e.vz) * 0.9);
    if (lp) { const a = Math.sin(e.walk * 2) * 0.35; lp.rotation.x = a; rp.rotation.x = -a; }
    e.mesh.position.y = Math.abs(Math.sin(e.walk * 2)) * 0.12;

    e.bossT -= dt;
    if (e.bossT <= 0 && e.freeze <= 0) {
      const roll = Math.random();
      if (e.phase === 1) {
        if (roll < 0.65) { this.bossStrafe(e, player); e.bossT = 2.6; }
        else { this.bossSummon(e, 'grunt', 4); e.bossT = 5.5; }
      } else if (e.phase === 2) {
        if (roll < 0.45) { this.bossStrafe(e, player); e.bossT = 2.2; }
        else if (roll < 0.8) { this.bossMissiles(e, player); e.bossT = 4.4; }
        else { this.bossSummon(e, 'rifleman', 4); e.bossT = 5.0; }
      } else {
        if (roll < 0.4) { this.bossSweep(e, player); e.bossT = 3.6; }
        else if (roll < 0.72) { this.bossMissiles(e, player); e.bossT = 3.4; }
        else { this.bossSummon(e, 'bomber', 5); e.bossT = 4.2; }
      }
    }
    const p = e.mesh.userData.parts;
    if (p && p.core) p.core.scale.setScalar(1 + Math.sin(t * 4) * (e.phase >= 2 ? 0.18 : 0.06));
  }

  bossStrafe(e, player) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (e.dead) return;
        const side = i % 2 ? 1.75 : -1.75;
        const ox = e.x + Math.cos(e.yaw) * side * 1.4, oy = 4.9, oz = e.z - Math.sin(e.yaw) * side * 1.4;
        this.enemyShootFrom(e, ox, oy, oz, player, 14, 0xff5030, 1.6);
      }, i * 90);
    }
  }
  bossMissiles(e, player) {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (e.dead) return;
        const a = (i - 2.5) * 0.24;
        const tx = player.x + Math.cos(a) * 6 * Math.random(), tz = player.z + Math.sin(a) * 6 * Math.random();
        this.game.spawnGrenade(e.x, 6.2, e.z, tx, tz, 'missile', true);
      }, i * 150);
    }
  }
  bossSweep(e, player) {
    const dur = 1.4;
    for (let i = 0; i < 22; i++) {
      setTimeout(() => {
        if (e.dead) return;
        const a = e.yaw + (i / 22 - 0.5) * 1.5;
        const tx = e.x + Math.sin(a) * 40, tz = e.z + Math.cos(a) * 40;
        this.fx.tracer(e.x, 6.7, e.z, tx, 0.4, tz, 0xffe14a, 0.22);
        this.fx.explosion(e.x + Math.sin(a) * Math.min(40, Math.hypot(player.x - e.x, player.z - e.z) + 4),
          0.4, e.z + Math.cos(a) * Math.min(40, Math.hypot(player.x - e.x, player.z - e.z) + 4), 4.5, 0xffd24a);
      }, i * (dur * 1000 / 22));
    }
  }
  bossSummon(e, type, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 6;
      const s = this.spawn(type, e.x + Math.cos(a) * r, e.z + Math.sin(a) * r);
      if (s) this.fx.explosion(s.x, 0.8, s.z, 3, 0x4ad9ff);
    }
    this.game.updateEnemyCount();
  }
  enemyShootFrom(e, ox, oy, oz, player, dmg, col, spread) {
    const tx = player.x + (Math.random() - .5) * spread;
    const ty = player.y + 1.05 + (Math.random() - .5) * spread * 0.5;
    const tz = player.z + (Math.random() - .5) * spread;
    let dx = tx - ox, dy = ty - oy, dz = tz - oz;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const wallT = this.world.rayWorld(ox, oy, oz, dx, dy, dz, l);
    this.fx.tracer(ox, oy, oz, ox + dx * Math.min(l, wallT), oy + dy * Math.min(l, wallT), oz + dz * Math.min(l, wallT), col, 0.06);
    this.fx.muzzle(ox + dx, oy + dy, oz + dz, dx, dy, dz, col, 0.8);
    sfx('lmg', Math.hypot(player.x - ox, player.z - oz));
    if (wallT < l - 0.4) return;
    const t = raySphere(ox, oy, oz, dx, dy, dz, player.x, player.y + 1.0, player.z, 0.6);
    if (t >= 0 && t <= l + 0.5) this.game.damagePlayer(dmg * this.game.diff.dmg, ox, oz, 'bullet');
  }
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const ex = cx - ox, ey = cy - oy, ez = cz - oz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - r * r;
  if (c > 0 && b < 0) return -1;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = b - s;
  return t < 0 ? (c <= 0 ? 0 : -1) : t;
}
function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
