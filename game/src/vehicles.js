// vehicles.js — the car factory and the player's driving. Cars are
// low-poly box builds: body, cabin, wheels that spin and steer. Parked
// cars wait along the streets to be stolen; traffic and police cars are
// created here too and registered in one list, so every system sees them.

import * as THREE from 'three';
import { mulberry32 } from './city.js';

const CAR_COLORS = [
  0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad,
  0xe67e22, 0xecf0f1, 0x2c3e50, 0x16a085, 0xd35400,
];

const MAX_SPEED = 34;
const MAX_REVERSE = 12;
const ACCEL = 22;
const BRAKE = 34;
const DRAG = 0.55;

export function buildCarMesh(color, isPolice) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.58, 2.1), glassMat);
  cabin.position.set(0, 1.12, -0.2);
  cabin.castShadow = true;
  group.add(cabin);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.9), bodyMat);
  hood.position.set(0, 0.88, 1.6);
  group.add(hood);

  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  const wheelSpots = [
    [-0.95, 0.36, 1.45], [0.95, 0.36, 1.45],
    [-0.95, 0.36, -1.45], [0.95, 0.36, -1.45],
  ];
  for (const [x, y, z] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights: two small warm boxes at the front.
  const lightMat = new THREE.MeshLambertMaterial({
    color: 0xfff6c8, emissive: 0x777744,
  });
  for (const x of [-0.6, 0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    lamp.position.set(x, 0.6, 2.21);
    group.add(lamp);
  }

  let lightBar = null;
  if (isPolice) {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }),
    );
    red.position.x = -0.32;
    const blue = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2255ff, emissive: 0x0022aa }),
    );
    blue.position.x = 0.32;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.set(0, 1.5, -0.2);
    group.add(lightBar);
    group.userData.redLight = red;
    group.userData.blueLight = blue;
  }

  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  return group;
}

export class Vehicles {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 77);
    this.all = [];
  }

  createVehicle(x, z, heading, color, kind) {
    const isPolice = kind === 'police';
    const group = buildCarMesh(color, isPolice);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const vehicle = {
      group,
      wheels: group.userData.wheels,
      speed: 0,
      heading,
      color,
      kind: kind || 'civilian',
      driver: null, // 'player' | 'traffic' | 'police' | null (parked)
      steer: 0,
      flashTimer: 0,
    };
    this.all.push(vehicle);
    return vehicle;
  }

  // Parked cars line the streets, noses along the road, ready to steal.
  spawnParked(count) {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 20) {
      guard++;
      const spot = this.city.randomRoadPoint();
      const off = this.city.roadWidth / 2 - 1.6;
      let x;
      let z;
      let heading;
      if (spot.axis === 'x') {
        x = spot.x;
        z = spot.z + (this.rng() < 0.5 ? off : -off);
        heading = this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        x = spot.x + (this.rng() < 0.5 ? off : -off);
        z = spot.z;
        heading = this.rng() < 0.5 ? 0 : Math.PI;
      }
      if (this.city.collides(x, z, 2.4)) continue;
      if (this.all.some((v) => v.group.position.distanceTo(new THREE.Vector3(x, 0, z)) < 6)) continue;
      const color = CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
      this.createVehicle(x, z, heading, color, 'civilian');
      placed++;
    }
  }

  nearestVehicle(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const v of this.all) {
      if (v.driver === 'player') continue;
      const d = v.group.position.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    return best;
  }

  // Arcade driving for the player's car: accelerate, brake/reverse,
  // steering that tightens at low speed, drag, and building bounces.
  drivePlayer(dt, G) {
    const v = G.player.vehicle;
    if (!v) return;
    const input = G.input;
    const forward = input.down('KeyW') || input.down('ArrowUp');
    const back = input.down('KeyS') || input.down('ArrowDown');
    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');

    if (forward) v.speed += ACCEL * dt;
    if (back) {
      if (v.speed > 0.5) v.speed -= BRAKE * dt;
      else v.speed -= ACCEL * 0.55 * dt;
    }
    v.speed -= v.speed * DRAG * dt;
    if (!forward && !back && Math.abs(v.speed) < 0.2) v.speed = 0;
    v.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, v.speed));

    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    const speedFactor = Math.min(1, Math.abs(v.speed) / 8);
    const steerAmount = steerInput * 1.9 * speedFactor * dt * (v.speed >= 0 ? 1 : -1);
    v.heading += steerAmount;
    v.steer = steerInput * 0.4;

    const dx = Math.sin(v.heading) * v.speed * dt;
    const dz = Math.cos(v.heading) * v.speed * dt;
    const nx = v.group.position.x + dx;
    const nz = v.group.position.z + dz;
    const hitX = this.city.collides(nx, v.group.position.z, 2.1);
    const hitZ = this.city.collides(v.group.position.x, nz, 2.1);
    if (hitX || hitZ) {
      if (Math.abs(v.speed) > 8) {
        G.audio.crash();
        G.damagePlayer(Math.min(12, Math.abs(v.speed) * 0.5));
        G.hud.toast('Crash!');
      }
      v.speed *= -0.25;
    } else {
      v.group.position.x = nx;
      v.group.position.z = nz;
    }
    v.group.rotation.y = v.heading;
  }

  // Nudge the player's car out of other cars it overlaps, and slow both.
  resolveCarCollisions(G) {
    const playerCar = G.player.vehicle;
    if (!playerCar) return;
    const pp = playerCar.group.position;
    for (const v of this.all) {
      if (v === playerCar) continue;
      const d = v.group.position.distanceTo(pp);
      if (d < 3.4 && d > 0.01) {
        const push = (3.4 - d) / 2;
        const dirX = (pp.x - v.group.position.x) / d;
        const dirZ = (pp.z - v.group.position.z) / d;
        pp.x += dirX * push;
        pp.z += dirZ * push;
        if (Math.abs(playerCar.speed) > 10) {
          G.audio.crash();
          playerCar.speed *= 0.5;
          v.speed = 0;
        }
      }
    }
  }

  update(dt, G) {
    for (const v of this.all) {
      // Spin the wheels with the car's speed; front wheels yaw with steer.
      const spin = (v.speed / 0.36) * dt;
      v.wheels.forEach((wheel, i) => {
        wheel.rotation.x += spin;
        if (i < 2) wheel.rotation.y = v.steer || 0;
      });
      // Police light bars flash red/blue.
      if (v.kind === 'police' && v.group.userData.redLight) {
        v.flashTimer += dt;
        const phase = Math.floor(v.flashTimer * 4) % 2 === 0;
        v.group.userData.redLight.material.emissiveIntensity = phase ? 2.2 : 0.2;
        v.group.userData.blueLight.material.emissiveIntensity = phase ? 0.2 : 2.2;
      }
    }
  }
}
