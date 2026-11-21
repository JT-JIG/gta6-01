// pedestrians.js — Solmar's sidewalk crowd. Peds stroll the sidewalks,
// turn at corners, and scatter when a car bears down on them or a shot
// rings out. They never die: a hit-and-run just sends them sprinting and
// earns the player a wanted star.

import * as THREE from 'three';
import { mulberry32 } from './city.js';
import { buildPersonMesh } from './player.js';

const SHIRTS = [
  0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6,
  0xe67e22, 0x1abc9c, 0xfd79a8, 0x636e72, 0x00b894,
];
const PANTS = [0x2c3e50, 0x5d4037, 0x37474f, 0x4a235a, 0x1a1a2e];
const SKINS = [0xf1c27d, 0xc98a5a, 0x8d5524, 0xffdbac, 0x6b4423];

export class Pedestrians {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 201);
    this.peds = [];
  }

  spawn(count) {
    for (let i = 0; i < count; i++) {
      const spot = this.city.sidewalkPoint();
      const shirt = SHIRTS[Math.floor(this.rng() * SHIRTS.length)];
      const pants = PANTS[Math.floor(this.rng() * PANTS.length)];
      const skin = SKINS[Math.floor(this.rng() * SKINS.length)];
      const group = buildPersonMesh(shirt, pants, skin);
      group.position.set(spot.x, 0, spot.z);
      this.scene.add(group);
      const axis = this.rng() < 0.5 ? 'x' : 'z';
      this.peds.push({
        group,
        axis,
        dir: this.rng() < 0.5 ? 1 : -1,
        speed: 1.4 + this.rng() * 1.2,
        state: 'walk',
        fleeTimer: 0,
        fleeX: 0,
        fleeZ: 0,
        phase: this.rng() * 6,
        hitCooldown: 0,
      });
    }
  }

  nearest(pos, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const p of this.peds) {
      const d = p.group.position.distanceTo(pos);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  // Frighten every ped near a point: they sprint away from it.
  scare(x, z, radius) {
    for (const p of this.peds) {
      const dx = p.group.position.x - x;
      const dz = p.group.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d < radius && d > 0.01) {
        p.state = 'flee';
        p.fleeTimer = 2.5 + this.rng() * 1.5;
        p.fleeX = dx / d;
        p.fleeZ = dz / d;
      }
    }
  }

  update(dt, G) {
    const playerPos = G.player.pos;
    const playerCar = G.player.vehicle;
    for (const p of this.peds) {
      p.hitCooldown = Math.max(0, p.hitCooldown - dt);
      const pos = p.group.position;

      // A fast car closing in sends nearby peds running.
      if (playerCar && Math.abs(playerCar.speed) > 6) {
        const d = pos.distanceTo(playerCar.group.position);
        if (d < 9 && p.state !== 'flee') {
          const dx = pos.x - playerCar.group.position.x;
          const dz = pos.z - playerCar.group.position.z;
          const len = Math.hypot(dx, dz) || 1;
          p.state = 'flee';
          p.fleeTimer = 2.5;
          p.fleeX = dx / len;
          p.fleeZ = dz / len;
          // A close call at speed still counts against the player.
          if (d < 3 && p.hitCooldown <= 0) {
            p.hitCooldown = 4;
            G.addWanted(1, 'Hit a pedestrian!');
          }
        }
      }

      if (p.state === 'flee') {
        p.fleeTimer -= dt;
        const step = 6.5 * dt;
        const nx = pos.x + p.fleeX * step;
        const nz = pos.z + p.fleeZ * step;
        if (!this.city.collides(nx, pos.z, 0.5)) pos.x = nx;
        if (!this.city.collides(pos.x, nz, 0.5)) pos.z = nz;
        p.group.rotation.y = Math.atan2(p.fleeX, p.fleeZ);
        p.phase += dt * 14;
        if (p.fleeTimer <= 0) p.state = 'walk';
      } else {
        const step = p.speed * dt;
        if (p.axis === 'x') pos.x += step * p.dir;
        else pos.z += step * p.dir;
        // Turn at intersections, or at the city's edge.
        const centers = this.city.roadCenters;
        const nearCrossing = centers.some((c) => Math.abs(pos.x - c) < 1.5)
          && centers.some((c) => Math.abs(pos.z - c) < 1.5);
        if ((nearCrossing && this.rng() < dt * 1.2) || Math.abs(pos.x) > this.city.half - 8 || Math.abs(pos.z) > this.city.half - 8) {
          if (this.rng() < 0.6) {
            p.axis = p.axis === 'x' ? 'z' : 'x';
            p.dir = this.rng() < 0.5 ? 1 : -1;
          } else {
            p.dir *= -1;
          }
        }
        const targetYaw = p.axis === 'x'
          ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
          : (p.dir > 0 ? 0 : Math.PI);
        p.group.rotation.y = targetYaw;
        p.phase += dt * p.speed * 4;
      }

      // Limb swing while walking or fleeing.
      const swing = Math.sin(p.phase) * (p.state === 'flee' ? 0.8 : 0.45);
      const u = p.group.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
    }
  }
}
