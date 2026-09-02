/* 玩家：第三人称角色、越肩相机、移动/姿态、血量护甲、倒地自救 */
import * as THREE from '../vendor/three.module.min.js';
import { ARMOR } from './data.js';
import { buildWeaponModel } from './weapons.js';

const STANCE = {
  stand:  { h: 1.80, eye: 1.62, speed: 5.4, sprint: 8.0, camY: 1.58 },
  crouch: { h: 1.28, eye: 1.10, speed: 2.9, sprint: 3.4,  camY: 1.10 },
  prone:  { h: 0.62, eye: 0.45, speed: 1.5, sprint: 1.7,  camY: 0.55 },
};

export class Player {
  constructor(scene, camera, world) {
    this.scene = scene; this.camera = camera; this.world = world;
    this.x = 0; this.y = 0; this.z = 21;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = Math.PI; this.pitch = -0.06;
    this.recoilPitch = 0; this.recoilYaw = 0; this.recoilAccum = 0;
    this.stance = 'stand';
    this.grounded = true;
    this.ads = false;
    this.hp = 100; this.maxHp = 100;
    this.boost = 0;
    this.helmet = 2; this.helmetDur = ARMOR.helmet[2].dur;
    this.vest = 2;   this.vestDur = ARMOR.vest[2].dur;
    this.downed = false; this.downT = 0; this.revives = 3;
    this.dead = false;
    this.speedBuff = 0; this.speedBuffT = 0;
    this.gunKick = 0;
    this.bob = 0;
    this.camDist = 4.2;
    this.camDistCur = 4.2;
    this.lastHitT = -99;
    this.blindT = 0;
    this.useT = 0; this.useItem = null;
    this.fov = 75;
    this.build();
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  build() {
    const g = new THREE.Group();
    const cloth = new THREE.MeshStandardMaterial({ color: 0x8c9a6e, roughness: .9, metalness: .05 });
    const gear  = new THREE.MeshStandardMaterial({ color: 0x5c6656, roughness: .8, metalness: .2 });
    const skin  = new THREE.MeshStandardMaterial({ color: 0xd8ab82, roughness: .85 });
    const helm  = new THREE.MeshStandardMaterial({ color: 0x6d7c62, roughness: .7, metalness: .3 });
    const patch = new THREE.MeshStandardMaterial({ color: 0xf5c33b, roughness: .6, emissive: 0x3a2c06 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(.62, .78, .34), cloth); torso.position.y = 1.16; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(.68, .58, .40), gear); vest.position.y = 1.20; g.add(vest);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.46, .52, .22), gear); pack.position.set(0, 1.18, -.28); g.add(pack);
    const hip = new THREE.Mesh(new THREE.BoxGeometry(.55, .26, .32), gear); hip.position.y = .70; g.add(hip);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.30, .32, .30), skin); head.position.y = 1.72; g.add(head);
    const hel = new THREE.Mesh(new THREE.BoxGeometry(.36, .22, .36), helm); hel.position.y = 1.83; g.add(hel);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(.36, .05, .10), helm); brim.position.set(0, 1.76, .20); g.add(brim);
    this.helmetMesh = hel;

    const mkLimb = (w, h, d, mat, x, y) => {
      const piv = new THREE.Group(); piv.position.set(x, y, 0);
      const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mm.position.y = -h / 2; piv.add(mm); g.add(piv); return piv;
    };
    this.lLeg = mkLimb(.22, .72, .24, cloth, -.16, .74);
    this.rLeg = mkLimb(.22, .72, .24, cloth, .16, .74);
    this.lArm = mkLimb(.18, .62, .20, cloth, -.40, 1.50);
    this.rArm = mkLimb(.18, .62, .20, cloth, .40, 1.50);

    // 识别用肩章（和平精英式亮色标识）
    const sh1 = new THREE.Mesh(new THREE.BoxGeometry(.20, .06, .22), patch); sh1.position.set(-.34, 1.42, 0); g.add(sh1);
    const sh2 = new THREE.Mesh(new THREE.BoxGeometry(.20, .06, .22), patch); sh2.position.set(.34, 1.42, 0); g.add(sh2);

    this.hand = new THREE.Group();
    this.hand.position.set(.36, 1.30, .26);
    g.add(this.hand);

    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.mesh = g;
    this.scene.add(g);

    this.muzzleRef = new THREE.Object3D();
    this.muzzleRef.position.set(0, 0, 0.75);
    this.hand.add(this.muzzleRef);
  }

  setWeaponModel(id) {
    if (this.gunModel) this.hand.remove(this.gunModel);
    this.gunModel = id ? buildWeaponModel(id) : null;
    if (this.gunModel) {
      this.hand.add(this.gunModel);
      const tip = { P92: .32, PAN: .1, M134: .9, RPG7: .9, XBOW: .5, M24: .78, AWM: .8, M249: .72, AKM: .58, UMP45: .42, S686: .62, S12K: .62, TESLA: .45 };
      this.muzzleRef.position.set(0, 0.02, tip[id] != null ? tip[id] : 0.56);
    }
  }

  getMuzzleWorld() {
    this.muzzleRef.getWorldPosition(this._v);
    return { x: this._v.x, y: this._v.y, z: this._v.z };
  }

  get stanceDef() { return STANCE[this.stance]; }

  applyRecoil(pitch, yaw) {
    this.recoilPitch += pitch;
    this.recoilYaw += yaw;
  }

  armorReduce(dmg, head) {
    let d = dmg;
    if (head && this.helmet > 0) {
      const a = ARMOR.helmet[this.helmet];
      const absorbed = d * a.red;
      this.helmetDur -= absorbed;
      d -= absorbed;
      if (this.helmetDur <= 0) { this.helmet = 0; this.helmetDur = 0; }
    } else if (!head && this.vest > 0) {
      const a = ARMOR.vest[this.vest];
      const absorbed = d * a.red;
      this.vestDur -= absorbed;
      d -= absorbed;
      if (this.vestDur <= 0) { this.vest = 0; this.vestDur = 0; }
    }
    return d;
  }

  update(dt, input, game, t) {
    if (this.dead) return;
    const S = this.stanceDef;

    // 视角
    if (!game.paused) {
      this.yaw -= input.lookDX;
      this.pitch -= input.lookDY;
    }
    this.pitch = Math.max(-1.25, Math.min(1.15, this.pitch));
    // 后坐恢复
    this.recoilPitch *= Math.pow(0.0025, dt);
    this.recoilYaw *= Math.pow(0.0025, dt);
    this.recoilAccum = Math.max(0, this.recoilAccum - dt * 7);
    this.gunKick = Math.max(0, this.gunKick - dt * 7);

    // 姿态
    if (input.crouchEdge) this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
    if (input.proneEdge) this.stance = this.stance === 'prone' ? 'stand' : 'prone';
    if (this.downed) this.stance = 'prone';

    // 移动
    const yaw = this.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = input.moveX * rx + (-input.moveZ) * fx;
    let mz = input.moveX * rz + (-input.moveZ) * fz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }

    let speed = S.speed;
    const wantSprint = input.sprint && !this.ads && ml > 0.6 && input.moveZ < -0.2 && !this.downed;
    if (wantSprint) speed = S.sprint;
    if (this.ads) speed *= 0.55;
    if (this.downed) speed = 1.2;
    if (this.useT > 0) speed *= 0.45;
    if (this.speedBuffT > 0) speed *= (1 + this.speedBuff);
    this.sprinting = wantSprint;

    const accel = this.grounded ? 14 : 3.2;
    this.vx += (mx * speed - this.vx) * Math.min(1, dt * accel);
    this.vz += (mz * speed - this.vz) * Math.min(1, dt * accel);

    // 跳跃 / 重力
    if (input.jumpEdge && this.grounded && this.stance === 'stand' && !this.downed) {
      this.vy = 5.6; this.grounded = false;
    }
    this.vy -= 22 * dt;
    this.y += this.vy * dt;

    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const r = 0.42;
    const STEP = this.stance === 'prone' ? 0.35 : 1.25;   // 翻越沙袋/矮墙
    const res = this.world.resolve(nx, nz, this.y, r, S.h, STEP);
    this.x = res.x; this.z = res.z;

    const floor = this.world.floorAt(this.x, this.z, this.y + (this.vy > 0 ? 0 : 0.35), r, STEP + 0.1);
    if (this.y <= floor + 0.001 && this.vy <= 0) {
      // 平滑上台阶，避免瞬移
      const dh = floor - this.y;
      this.y = dh > 0.12 ? this.y + Math.min(dh, dt * 7.5) : floor;
      this.vy = 0; this.grounded = true;
    } else if (this.y > floor) {
      this.grounded = false;
    }
    if (this.y < 0) { this.y = 0; this.vy = 0; this.grounded = true; }

    // 加速药剂
    if (this.speedBuffT > 0) this.speedBuffT -= dt;
    if (this.blindT > 0) this.blindT -= dt;

    // 能量 → 缓回血
    if (this.boost > 0 && !this.downed) {
      const rate = this.boost > 75 ? 3.0 : this.boost > 50 ? 2.1 : this.boost > 25 ? 1.5 : 1.0;
      this.boost = Math.max(0, this.boost - dt * 1.2);
      if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + rate * dt);
    }
    // 脱战自动回血（原版模式设定）
    if (!this.downed && t - this.lastHitT > 7 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + dt * 2.2);
    }

    // 倒地
    if (this.downed) {
      this.downT -= dt;
      if (this.downT <= 0) game.playerDie();
    }

    // 使用道具
    if (this.useT > 0) {
      this.useT -= dt;
      if (this.useT <= 0) { game.finishUseItem(); }
    }

    // 走路动画
    const sp = Math.hypot(this.vx, this.vz);
    this.bob += dt * (2 + sp * 1.5);
    const swing = Math.sin(this.bob * 2.4) * Math.min(0.9, sp * 0.16);
    this.lLeg.rotation.x = swing; this.rLeg.rotation.x = -swing;
    if (this.downed) {
      this.mesh.rotation.x = -Math.PI / 2.1;
      this.mesh.position.set(this.x, this.y + 0.35, this.z);
    } else {
      this.mesh.rotation.x = 0;
      this.mesh.position.set(this.x, this.y, this.z);
    }
    this.mesh.rotation.y = this.yaw + Math.PI;
    this.mesh.scale.y = this.stance === 'prone' ? 0.55 : this.stance === 'crouch' ? 0.78 : 1;

    const aimPitch = this.pitch + this.recoilPitch;
    this.lArm.rotation.x = -1.35 - aimPitch * 0.6;
    this.rArm.rotation.x = -1.35 - aimPitch * 0.6 + this.gunKick * 0.45;
    this.hand.position.set(this.ads ? 0.06 : 0.36, 1.30 - (this.gunKick * 0.03), 0.26);
    this.hand.rotation.x = -aimPitch + this.gunKick * 0.5;
    this.hand.rotation.y = 0;
    if (this.gunModel && this.gunModel.userData.barrels) this.gunModel.userData.barrels.rotation.z += dt * 26 * (game.currentWeapon ? game.currentWeapon.spin : 0);

    this.updateCamera(dt, game);
  }

  updateCamera(dt, game) {
    const cam = this.camera;
    const aimYaw = this.yaw + this.recoilYaw;
    const aimPitch = Math.max(-1.3, Math.min(1.2, this.pitch + this.recoilPitch));

    const targetFov = this.ads ? (game.currentWeapon ? game.currentWeapon.def.adsFov : 45) : (this.sprinting ? 82 : 75);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 12);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }

    const S = this.stanceDef;
    const headY = this.y + (this.downed ? 0.5 : S.camY);
    const wantDist = this.ads ? 1.35 : (this.stance === 'prone' ? 3.0 : 4.2);
    const shoulder = this.ads ? 0.42 : 0.72;
    this.camDistCur += (wantDist - this.camDistCur) * Math.min(1, dt * 10);

    const fx = -Math.sin(aimYaw) * Math.cos(aimPitch);
    const fy = Math.sin(aimPitch);
    const fz = -Math.cos(aimYaw) * Math.cos(aimPitch);
    const rx = Math.cos(aimYaw), rz = -Math.sin(aimYaw);

    // 相机避障
    let dist = this.camDistCur;
    const ox = this.x + rx * shoulder, oy = headY, oz = this.z + rz * shoulder;
    const wallT = this.world.rayWorld(ox, oy, oz, -fx, -fy, -fz, dist + 0.5);
    if (wallT < dist + 0.5) dist = Math.max(0.6, wallT - 0.45);

    const sh = game.shakeAmt;
    cam.position.set(
      ox - fx * dist + (Math.random() - .5) * sh,
      oy - fy * dist + 0.12 + (Math.random() - .5) * sh,
      oz - fz * dist + (Math.random() - .5) * sh
    );
    cam.rotation.order = 'YXZ';
    cam.rotation.y = aimYaw;
    cam.rotation.x = aimPitch;
    cam.rotation.z = 0;
  }

  aimDir(out) {
    const aimYaw = this.yaw + this.recoilYaw;
    const aimPitch = this.pitch + this.recoilPitch;
    out.set(-Math.sin(aimYaw) * Math.cos(aimPitch), Math.sin(aimPitch), -Math.cos(aimYaw) * Math.cos(aimPitch));
    return out;
  }
}
