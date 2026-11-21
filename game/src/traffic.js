// traffic.js — the city's background drivers. Each traffic car owns a
// road: it drives along its axis, slows for the car ahead, and at
// intersections sometimes turns onto the cross street. Cars the player
// steals drop out of the flow; new ones filter in at the edges.

import * as THREE from 'three';
import { mulberry32 } from './city.js';

const TRAFFIC_COLORS = [
  0xb03a2e, 0x2e86c1, 0xd4ac0d, 0x229954, 0x7d3c98,
  0xca6f1e, 0xeaecee, 0x1c2833, 0x148f77, 0x6e2c00,
];

export class Traffic {
  constructor(scene, city, vehicles, seed) {
    this.scene = scene;
    this.city = city;
    this.vehicles = vehicles;
    this.rng = mulberry32(seed + 131);
    this.cars = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const spot = this.city.randomRoadPoint();
      const color = TRAFFIC_COLORS[Math.floor(this.rng() * TRAFFIC_COLORS.length)];
      const heading = spot.axis === 'x'
        ? (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (spot.dir > 0 ? 0 : Math.PI);
      const vehicle = this.vehicles.createVehicle(spot.x, spot.z, heading, color, 'civilian');
      vehicle.driver = 'traffic';
      vehicle.speed = 7 + this.rng() * 4;
      this.cars.push({
        vehicle,
        axis: spot.axis,
        dir: spot.dir,
        cruise: vehicle.speed,
        nextTurnAt: 0,
      });
    }
  }

  // Is another car close ahead on the same road? Then ease off.
  carAhead(car) {
    const p = car.vehicle.group.position;
    const look = 11;
    for (const other of this.vehicles.all) {
      if (other === car.vehicle) continue;
      const op = other.group.position;
      const dx = op.x - p.x;
      const dz = op.z - p.z;
      const ahead = car.axis === 'x' ? dx * car.dir : dz * car.dir;
      const side = car.axis === 'x' ? Math.abs(dz) : Math.abs(dx);
      if (ahead > 0 && ahead < look && side < 2.6) return true;
    }
    return false;
  }

  turnAtIntersection(car) {
    const p = car.vehicle.group.position;
    const centers = this.city.roadCenters;
    const nearX = centers.some((c) => Math.abs(p.x - c) < 2.5);
    const nearZ = centers.some((c) => Math.abs(p.z - c) < 2.5);
    if (!nearX || !nearZ) return;
    if (this.rng() > 0.45) return;
    // Turn onto the cross street: snap to the crossing's centre line.
    if (car.axis === 'x') {
      const c = centers.reduce((a, b) => (Math.abs(p.x - a) < Math.abs(p.x - b) ? a : b));
      p.x = c;
      car.axis = 'z';
      car.dir = this.rng() < 0.5 ? 1 : -1;
      car.vehicle.heading = car.dir > 0 ? 0 : Math.PI;
    } else {
      const c = centers.reduce((a, b) => (Math.abs(p.z - a) < Math.abs(p.z - b) ? a : b));
      p.z = c;
      car.axis = 'x';
      car.dir = this.rng() < 0.5 ? 1 : -1;
      car.vehicle.heading = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    car.vehicle.group.rotation.y = car.vehicle.heading;
  }

  update(dt, G) {
    const half = this.city.half - 6;
    for (const car of this.cars) {
      const v = car.vehicle;
      if (v.driver !== 'traffic') continue; // stolen by the player
      const blocked = this.carAhead(car);
      const target = blocked ? 0 : car.cruise;
      v.speed += (target - v.speed) * Math.min(1, dt * 2.5);
      const step = v.speed * dt;
      if (car.axis === 'x') v.group.position.x += step * car.dir;
      else v.group.position.z += step * car.dir;
      this.turnAtIntersection(car);
      // Leaving the city? Wrap to the far side, still on its road.
      const p = v.group.position;
      if (car.axis === 'x' && Math.abs(p.x) > half) p.x = -Math.sign(p.x) * half;
      if (car.axis === 'z' && Math.abs(p.z) > half) p.z = -Math.sign(p.z) * half;
    }
    // Keep the flow topped up if the player stole cars.
    const active = this.cars.filter((c) => c.vehicle.driver === 'traffic').length;
    if (active < 7 && this.rng() < dt * 0.5) this.spawn(1);
  }
}
