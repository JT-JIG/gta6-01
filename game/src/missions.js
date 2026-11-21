// missions.js — the story of Solmar City. Rex Vega, a getaway driver
// whose last job went wrong, works off his debt to fixer Mara Quinn one
// job at a time. Three story missions, then repeatable delivery work for
// cash. A glowing beacon marks every objective, on the ground and on the
// minimap.

import * as THREE from 'three';
import { mulberry32 } from './city.js';

const STORY = [
  {
    title: 'The Pickup',
    giver: 'Mara Quinn',
    briefing: 'Rex, you owe me. A package is waiting downtown — collect it and run it to the docks. No cops, no drama. $500 when it lands.',
    reward: 500,
    stages: [
      { type: 'goto', place: 'downtown', text: 'Pick up the package downtown', radius: 8 },
      { type: 'goto', place: 'docks', text: 'Deliver the package to the docks', radius: 8 },
    ],
  },
  {
    title: 'Lose the Heat',
    giver: 'Mara Quinn',
    briefing: 'That pickup was hotter than I thought — the cops are on you. Shake them, then lie low at the safehouse until it blows over. $750.',
    reward: 750,
    stages: [
      { type: 'loseCops', text: 'Lose the cops (drop to 0 stars)', wantedAtStart: 2 },
      { type: 'goto', place: 'safehouse', text: 'Reach the safehouse', radius: 8 },
    ],
  },
  {
    title: 'The Getaway',
    giver: 'Mara Quinn',
    briefing: 'Last job, Rex. A buyer wants the car at the marina garage — the fast one, parked by the plaza. Cops will be all over you. Ninety seconds. $1,000 and we are square.',
    reward: 1000,
    stages: [
      { type: 'goto', place: 'plaza', text: 'Steal the getaway car at the plaza', radius: 8, wantedAtStart: 1 },
      { type: 'timed', place: 'marina', text: 'Reach the marina drop-off!', radius: 10, seconds: 90, wantedAtStart: 3 },
    ],
  },
];

export class Missions {
  constructor(scene, city, seed) {
    this.scene = scene;
    this.city = city;
    this.rng = mulberry32(seed + 401);
    this.index = 0; // story mission in progress
    this.stage = 0;
    this.active = false;
    this.timer = 0;
    this.markerPos = null;
    this.marker = null;
    this.freeRoam = false;
    this.sideJob = null;
    this.buildMarker();
  }

  buildMarker() {
    const group = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x39ff88, transparent: true, opacity: 0.35,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 40, 12, 1, true), beamMat);
    beam.position.y = 20;
    group.add(beam);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 24), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    group.add(ring);
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 3, 4),
      new THREE.MeshBasicMaterial({ color: 0x39ff88 }),
    );
    cone.position.y = 6;
    cone.rotation.x = Math.PI;
    group.add(cone);
    group.userData.cone = cone;
    group.visible = false;
    this.scene.add(group);
    this.marker = group;
  }

  current() {
    return STORY[this.index] || null;
  }

  currentStage() {
    const mission = this.current();
    if (!mission) return null;
    return mission.stages[this.stage] || null;
  }

  start(G, index) {
    this.index = index;
    this.stage = 0;
    this.active = true;
    this.freeRoam = false;
    const mission = this.current();
    G.hud.showBriefing(mission.title, mission.giver + ': ' + mission.briefing);
    this.enterStage(G);
  }

  enterStage(G) {
    const stage = this.currentStage();
    if (!stage) {
      this.finishMission(G);
      return;
    }
    if (stage.wantedAtStart) G.setWanted(stage.wantedAtStart);
    if (stage.seconds) this.timer = stage.seconds;
    if (stage.place) {
      const place = this.city.places[stage.place];
      this.markerPos = new THREE.Vector3(place.x, 0, place.z);
      this.marker.position.copy(this.markerPos);
      this.marker.visible = true;
    } else {
      this.markerPos = null;
      this.marker.visible = false;
    }
    G.hud.setObjective(this.objectiveText());
  }

  objectiveText() {
    if (!this.active) {
      if (this.sideJob) return this.sideJob.text;
      return 'Free roam — press M for a delivery job';
    }
    const mission = this.current();
    const stage = this.currentStage();
    if (!stage) return mission.title + ' — complete!';
    let text = mission.title + ': ' + stage.text;
    if (stage.type === 'timed') text += ' (' + Math.max(0, Math.ceil(this.timer)) + 's)';
    return text;
  }

  finishMission(G) {
    const mission = this.current();
    this.active = false;
    this.marker.visible = false;
    this.markerPos = null;
    G.money += mission.reward;
    G.audio.cash();
    G.audio.missionComplete();
    G.hud.toast('Mission complete: ' + mission.title + ' — +$' + mission.reward);
    G.completedMissions = (G.completedMissions || 0) + 1;
    this.index++;
    G.saveNow();
    if (this.index < STORY.length) {
      G.hud.showBriefing(
        'Next job unlocked',
        STORY[this.index].title + ' — press M when you are ready.',
      );
    } else {
      this.freeRoam = true;
      G.hud.showBriefing(
        'Square with Mara',
        'You did it, Rex. The debt is paid and Solmar is yours. Delivery jobs still pay — press M any time.',
      );
    }
  }

  failMission(G, reason) {
    this.active = false;
    this.marker.visible = false;
    this.markerPos = null;
    this.stage = 0;
    G.hud.toast('Mission failed: ' + reason + ' — press M to retry');
  }

  // A quick paid errand between story missions: drive to a random place.
  startSideJob(G) {
    const names = Object.keys(this.city.places);
    const place = names[Math.floor(this.rng() * names.length)];
    const pay = 100 + Math.floor(this.rng() * 5) * 50;
    const target = this.city.places[place];
    this.sideJob = { place, pay, text: 'Delivery job: reach ' + place + ' — $' + pay };
    this.markerPos = new THREE.Vector3(target.x, 0, target.z);
    this.marker.position.copy(this.markerPos);
    this.marker.visible = true;
    G.hud.setObjective(this.objectiveText());
    G.hud.toast('New delivery job: ' + place + ' pays $' + pay);
  }

  completeSideJob(G) {
    G.money += this.sideJob.pay;
    G.audio.cash();
    G.hud.toast('Delivery done — +$' + this.sideJob.pay);
    this.sideJob = null;
    this.marker.visible = false;
    this.markerPos = null;
    G.hud.setObjective(this.objectiveText());
    G.saveNow();
  }

  update(dt, G) {
    // Animate the beacon.
    if (this.marker.visible) {
      this.marker.userData.cone.position.y = 6 + Math.sin(G.time * 2.2) * 0.8;
      this.marker.userData.cone.rotation.y += dt * 1.5;
    }

    // Side job completion.
    if (this.sideJob && this.markerPos) {
      if (G.player.pos.distanceTo(this.markerPos) < 8) this.completeSideJob(G);
      return;
    }
    if (!this.active) return;

    const stage = this.currentStage();
    if (!stage) return;

    if (stage.type === 'timed') {
      this.timer -= dt;
      G.hud.setObjective(this.objectiveText());
      if (this.timer <= 0) {
        this.failMission(G, 'Out of time');
        return;
      }
    }

    if (stage.type === 'loseCops') {
      if (G.wanted <= 0) {
        this.stage++;
        this.enterStage(G);
      }
      return;
    }

    if ((stage.type === 'goto' || stage.type === 'timed') && this.markerPos) {
      if (G.player.pos.distanceTo(this.markerPos) < (stage.radius || 8)) {
        G.audio.pickup();
        this.stage++;
        this.enterStage(G);
      }
    }
  }
}
