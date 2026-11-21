// police.js — the wanted level and the chase. Stars rise when the player
// steals cars, hits pedestrians or shoots in public; police cars spawn to
// match and hunt the player along the road grid. Lose them by breaking
// line of sight long enough, or get busted standing still beside them.

import * as THREE from 'three';
import { mulberry32 } from './city.js';

const POLICE_SPEED = 30;
const BUST_DISTANCE = 8;
const BUST_TIME = 3;
const HIDE_DISTANCE = 70;
const HIDE_TIME = 18;

export class Police {
  constructor(scene, city, vehicles, seed) {
    this.scene = scene;
    this.city = city;
    this.vehicles = vehicles;
    this.rng = mulberry32(seed + 303);
    this.cars = []; // { vehicle, axis, dir, repath }
    this.bustTimer = 0;
    this.hideTimer = 0;
    this.ramCooldown = 0;
  }

  desiredCount(wanted) {
    return Math.min(5, wanted);
  }

  spawnCarNear(G) {
    const spot = this.city.randomRoadPoint();
    // Prefer a road a little way from the player, never on top of them.
    const p = G.player.pos;
    const vehicle = this.vehicles.createVehicle(spot.x, spot.z, 0, 0x1a1a2e, 'police');
    vehicle.driver = 'police';
    vehicle.speed = 12;
    // Paint it like a cruiser: white doors read clearly at a glance.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.4, 1.6), doorMat);
    door.position.set(0, 0.6, -0.2);
    vehicle.group.add(door);
    this.cars.push({ vehicle, axis: 'x', dir: 1, repath: 0 });
    return vehicle;
  }

  removeCar(car) {
    this.scene.remove(car.vehicle.group);
    const i = this.vehicles.all.indexOf(car.vehicle);
    if (i !== -1) this.vehicles.all.splice(i, 1);
    const j = this.cars.indexOf(car);
    if (j !== -1) this.cars.splice(j, 1);
  }

  // Grid chase: head along the axis with the bigger gap to the player,
  // re-choosing at every intersection, so cruisers stay on the roads.
  // A cruiser pulls up and stops beside a player who has stopped — that
  // is how a bust happens.
  steerCar(car, dt, G) {
    const v = car.vehicle;
    const p = v.group.position;
    const target = G.player.pos;
    car.repath -= dt;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const dist = Math.hypot(dx, dz);
    const playerSpeed = G.player.vehicle
      ? Math.abs(G.player.vehicle.speed)
      : G.player.speed;
    const centers = this.city.roadCenters;
    const atIntersection = centers.some((c) => Math.abs(p.x - c) < 3)
      && centers.some((c) => Math.abs(p.z - c) < 3);
    if (car.repath <= 0 || atIntersection) {
      car.repath = 1.2;
      if (Math.abs(dx) > Math.abs(dz)) {
        car.axis = 'x';
        car.dir = dx > 0 ? 1 : -1;
      } else {
        car.axis = 'z';
        car.dir = dz > 0 ? 1 : -1;
      }
      v.heading = car.axis === 'x'
        ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (car.dir > 0 ? 0 : Math.PI);
      v.group.rotation.y = v.heading;
    }
    const pullingUp = dist < 9 && playerSpeed < 2;
    const targetSpeed = pullingUp ? 0 : POLICE_SPEED + G.wanted * 1.5;
    v.speed += (targetSpeed - v.speed) * Math.min(1, dt * (pullingUp ? 4 : 1.5));
    const step = v.speed * dt;
    if (car.axis === 'x') p.x += step * car.dir;
    else p.z += step * car.dir;
    // Keep cruisers inside the city.
    const half = this.city.half - 6;
    p.x = Math.max(-half, Math.min(half, p.x));
    p.z = Math.max(-half, Math.min(half, p.z));
  }

  update(dt, G) {
    const wanted = G.wanted;
    this.ramCooldown = Math.max(0, this.ramCooldown - dt);

    // Match the cruiser count to the wanted level.
    const want = this.desiredCount(wanted);
    while (this.cars.length < want) this.spawnCarNear(G);
    while (this.cars.length > want) this.removeCar(this.cars[this.cars.length - 1]);

    if (wanted <= 0) {
      this.bustTimer = 0;
      this.hideTimer = 0;
      G.audio.setSiren(false);
      return;
    }

    G.audio.setSiren(true);
    const playerPos = G.player.pos;
    const playerSpeed = G.player.vehicle
      ? Math.abs(G.player.vehicle.speed)
      : G.player.speed;
    let nearest = Infinity;

    for (const car of this.cars) {
      this.steerCar(car, dt, G);
      const d = car.vehicle.group.position.distanceTo(playerPos);
      nearest = Math.min(nearest, d);
      // A cruiser ramming the player at speed costs health; a cruiser
      // that has pulled up to make an arrest does not keep hitting.
      if (d < 3.6 && car.vehicle.speed > 5 && this.ramCooldown <= 0) {
        this.ramCooldown = 1.2;
        G.audio.crash();
        G.damagePlayer(6 + wanted * 2);
        const v = car.vehicle;
        v.speed *= 0.4;
        if (G.player.vehicle) G.player.vehicle.speed *= 0.6;
      }
    }

    // Busted: standing still (or crawling) with a cruiser right beside.
    if (playerSpeed < 1.5 && nearest < BUST_DISTANCE) {
      this.bustTimer += dt;
      if (this.bustTimer > 0.5) G.hud.setPrompt('BUSTED IN ' + Math.max(0, BUST_TIME - this.bustTimer).toFixed(1) + 's — MOVE!');
      if (this.bustTimer >= BUST_TIME) {
        this.bustTimer = 0;
        G.busted();
        return;
      }
    } else {
      this.bustTimer = 0;
    }

    // Out of sight long enough and the heat drops a star.
    if (nearest > HIDE_DISTANCE) {
      this.hideTimer += dt;
      if (this.hideTimer >= HIDE_TIME) {
        this.hideTimer = 0;
        G.setWanted(wanted - 1);
        G.hud.toast(wanted - 1 > 0 ? 'The heat is cooling off...' : 'You lost them!');
      }
    } else {
      this.hideTimer = 0;
    }
  }
}
