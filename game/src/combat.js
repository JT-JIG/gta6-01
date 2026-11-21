// combat.js — on-foot gunplay. Left click fires a hitscan pistol from the
// camera's centre: a tracer streak, a muzzle flash, a bang, and a
// consequence — shooting in public draws the cops. Right click throws a
// punch at anyone close enough to reach.

import * as THREE from 'three';

const FIRE_INTERVAL = 0.22;
const PUNCH_INTERVAL = 0.45;
const SHOT_RANGE = 90;

export class Combat {
  constructor(scene) {
    this.scene = scene;
    this.fireCooldown = 0;
    this.punchCooldown = 0;
    this.tracers = [];
    this.raycaster = new THREE.Raycaster();
    this.flash = new THREE.PointLight(0xffcc66, 0, 12);
    this.flash.position.set(0, 2, 0);
    scene.add(this.flash);
  }

  makeTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0.9,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  shoot(G) {
    if (this.fireCooldown > 0) return;
    this.fireCooldown = FIRE_INTERVAL;
    const camera = G.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const from = camera.position.clone();
    let end = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(SHOT_RANGE));

    // What did the shot hit first — a pedestrian, a car, or a building?
    let hitPed = null;
    let hitDist = SHOT_RANGE;
    for (const ped of G.pedestrians.peds) {
      const to = ped.group.position.clone().sub(from);
      const along = to.dot(this.raycaster.ray.direction);
      if (along < 1 || along > SHOT_RANGE) continue;
      const closest = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(along));
      if (closest.distanceTo(ped.group.position) < 1.4 && along < hitDist) {
        hitDist = along;
        hitPed = ped;
      }
    }
    let hitCar = null;
    for (const v of G.vehicles.all) {
      const to = v.group.position.clone().sub(from);
      const along = to.dot(this.raycaster.ray.direction);
      if (along < 1 || along > hitDist) continue;
      const closest = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(along));
      if (closest.distanceTo(v.group.position) < 2.6) {
        hitDist = along;
        hitCar = v;
        hitPed = null;
      }
    }
    end = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(hitDist));
    this.makeTracer(from, end);
    this.flash.position.copy(G.player.pos).add(new THREE.Vector3(0, 1.6, 0));
    this.flash.intensity = 14;
    G.audio.shot();

    if (hitPed) {
      G.pedestrians.scare(hitPed.group.position.x, hitPed.group.position.z, 14);
      G.hud.toast('You shot a civilian!');
      G.addWanted(1, 'Shooting in public');
    } else if (hitCar) {
      G.hud.toast('Bullet hit a car!');
      G.addWanted(1, 'Shooting in public');
    } else {
      // A shot nobody sees is still a shot: the sound carries.
      G.pedestrians.scare(G.player.pos.x, G.player.pos.z, 18);
      if (G.wanted === 0 && Math.random() < 0.5) G.addWanted(1, 'Shots fired!');
    }
  }

  punch(G) {
    if (this.punchCooldown > 0) return;
    this.punchCooldown = PUNCH_INTERVAL;
    G.audio.punch();
    const target = G.pedestrians.nearest(G.player.pos, 2.6);
    if (target) {
      G.pedestrians.scare(target.group.position.x, target.group.position.z, 10);
      G.hud.toast('You punched a pedestrian!');
      G.addWanted(1, 'Assault!');
    }
  }

  update(dt, G) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 160);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    if (G.state !== 'playing' || !G.player.onFoot) return;
    if (G.input.mousePressed(0)) this.shoot(G);
    if (G.input.mousePressed(2)) this.punch(G);
  }
}
