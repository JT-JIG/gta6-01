// player.js — Rex Vega on foot: a low-poly figure with third-person
// movement. WASD moves relative to the camera, Shift runs, and the figure
// turns to face its travel direction. While driving, the player hides
// inside the car and this module just tracks the car's position.

import * as THREE from 'three';

const WALK_SPEED = 6;
const RUN_SPEED = 10;

export function buildPersonMesh(shirtColor, pantsColor, skinColor) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), dark);
  hair.position.y = 1.86;
  group.add(hair);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirt);
  torso.position.y = 1.02;
  torso.castShadow = true;
  group.add(torso);

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.28), pants);
  legL.position.set(-0.17, 0.33, 0);
  legL.castShadow = true;
  group.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.17;
  group.add(legR);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), shirt);
  armL.position.set(-0.44, 1.05, 0);
  group.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.44;
  group.add(armR);

  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armL = armL;
  group.userData.armR = armR;
  return group;
}

export class Player {
  constructor(scene, city, startX, startZ) {
    this.city = city;
    this.group = buildPersonMesh(0x3a7bd5, 0x2c2c34, 0xc98a5a);
    this.group.position.set(startX, 0, startZ);
    scene.add(this.group);
    this.yaw = 0;
    this.speed = 0;
    this.onFoot = true;
    this.vehicle = null;
    this.walkPhase = 0;
    this.scene = scene;
  }

  get pos() {
    return this.group.position;
  }

  get heading() {
    return this.yaw;
  }

  setPosition(x, z) {
    this.group.position.set(x, 0, z);
  }

  enterVehicle(vehicle) {
    this.onFoot = false;
    this.vehicle = vehicle;
    vehicle.driver = 'player';
    this.group.visible = false;
  }

  exitVehicle() {
    if (!this.vehicle) return;
    const v = this.vehicle;
    // Step out to the car's left side, clear of buildings.
    const sideX = Math.cos(v.heading) * 2.4;
    const sideZ = -Math.sin(v.heading) * 2.4;
    let x = v.group.position.x + sideX;
    let z = v.group.position.z + sideZ;
    if (this.city.collides(x, z, 0.6)) {
      x = v.group.position.x - sideX;
      z = v.group.position.z - sideZ;
    }
    this.setPosition(x, z);
    this.yaw = v.heading;
    this.group.visible = true;
    v.driver = null;
    v.speed = 0;
    this.vehicle = null;
    this.onFoot = true;
  }

  // On-foot movement. `camYaw` is the camera's yaw; W walks away from
  // the camera, S toward it. Movement slides along building faces.
  update(dt, G) {
    if (!this.onFoot) {
      if (this.vehicle) {
        this.group.position.copy(this.vehicle.group.position);
        this.yaw = this.vehicle.heading;
      }
      return;
    }
    const input = G.input;
    const camYaw = G.cameraYaw;
    let ix = 0;
    let iz = 0;
    if (input.down('KeyW') || input.down('ArrowUp')) iz -= 1;
    if (input.down('KeyS') || input.down('ArrowDown')) iz += 1;
    if (input.down('KeyA') || input.down('ArrowLeft')) ix -= 1;
    if (input.down('KeyD') || input.down('ArrowRight')) ix += 1;
    // Arrow keys move the player exactly like WASD; the camera turns
    // with the mouse, and eases round behind the player while running.
    const moving = ix !== 0 || iz !== 0;
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = run ? RUN_SPEED : WALK_SPEED;
    if (moving) {
      const len = Math.hypot(ix, iz);
      ix /= len;
      iz /= len;
      // Rotate the input vector by the camera yaw: W walks away from the
      // camera (along its view direction), D strafes to the screen's right.
      const sin = Math.sin(camYaw);
      const cos = Math.cos(camYaw);
      const mx = -iz * sin - ix * cos;
      const mz = -iz * cos + ix * sin;
      const step = speed * dt;
      const nx = this.pos.x + mx * step;
      const nz = this.pos.z + mz * step;
      if (!this.city.collides(nx, this.pos.z, 0.55)) this.pos.x = nx;
      if (!this.city.collides(this.pos.x, nz, 0.55)) this.pos.z = nz;
      this.yaw = Math.atan2(mx, mz);
      this.speed = speed;
      this.walkPhase += dt * speed * 1.6;
    } else {
      this.speed = 0;
    }

    this.group.rotation.y = this.yaw;
    // Simple walk swing on the limbs.
    const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const u = this.group.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.group.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
  }
}
