// main.js — Solmar City boot and game loop. Builds the world, wires the
// systems into one game object, runs the third-person camera and the
// state machine (menu / playing / paused / wasted / busted), and stages
// the ?shot= setups the screenshots are taken from.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { Player } from './player.js';
import { Vehicles } from './vehicles.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { Combat } from './combat.js';
import { Hud } from './hud.js';
import { hasSave, loadGame, saveGame, clearSave } from './save.js';

const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed')) || 7;
const SHOT = params.get('shot') || null;

const game = {
  state: 'menu',
  time: 0,
  money: 250,
  health: 100,
  wanted: 0,
  completedMissions: 0,
  cameraYaw: Math.PI,
  cameraPitch: 0.32,
  shakeTimer: 0,
  saveTimer: 0,
};

// --- Renderer, scene, lights ---------------------------------------------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec9e8);
scene.fog = new THREE.Fog(0x9fd4e8, 130, 420);

const camera = new THREE.PerspectiveCamera(
  62, window.innerWidth / window.innerHeight, 0.1, 900,
);
camera.position.set(0, 8, -14);

const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 400;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 1.1));

game.scene = scene;
game.camera = camera;
game.renderer = renderer;

// --- Systems ---------------------------------------------------------------
const city = buildCity(scene, SEED);
game.city = city;
game.input = new Input(canvas);
game.audio = new AudioSystem();
game.player = new Player(scene, city, 4, 24);
game.vehicles = new Vehicles(scene, city, SEED);
game.traffic = new Traffic(scene, city, game.vehicles, SEED);
game.pedestrians = new Pedestrians(scene, city, SEED);
game.police = new Police(scene, city, game.vehicles, SEED);
game.missions = new Missions(scene, city, SEED);
game.combat = new Combat(scene);
game.hud = new Hud(city);

game.vehicles.spawnParked(16);
game.traffic.spawn(11);
game.pedestrians.spawn(20);

// --- Player state helpers --------------------------------------------------
game.setWanted = function setWanted(n) {
  game.wanted = Math.max(0, Math.min(5, Math.round(n)));
};

game.addWanted = function addWanted(n, reason) {
  const before = game.wanted;
  game.setWanted(game.wanted + n);
  if (reason && game.wanted > before) game.hud.toast(reason);
};

game.damagePlayer = function damagePlayer(amount) {
  if (game.state !== 'playing') return;
  game.health -= amount;
  game.shakeTimer = 0.25;
  if (game.health <= 0) {
    game.health = 0;
    game.wasted();
  }
};

game.wasted = function wasted() {
  game.state = 'wasted';
  game.audio.stopAllLoops();
  game.audio.busted();
  const lost = Math.round(game.money * 0.1);
  game.money -= lost;
  game.hud.showEnd('WASTED', 'Rex went down. The hospital kept $' + lost + ' of your cash.');
  game.saveNow();
};

game.busted = function busted() {
  game.state = 'busted';
  game.audio.stopAllLoops();
  game.audio.busted();
  const lost = Math.round(game.money * 0.15);
  game.money -= lost;
  game.setWanted(0);
  game.hud.showEnd('BUSTED', 'The Solmar PD caught up with you. Bail cost $' + lost + '.');
  game.saveNow();
};

game.respawn = function respawn() {
  game.health = 100;
  game.setWanted(0);
  if (game.player.vehicle) {
    game.player.vehicle.driver = null;
    game.player.vehicle.speed = 0;
  }
  game.player.vehicle = null;
  game.player.onFoot = true;
  game.player.group.visible = true;
  const home = city.places.safehouse;
  game.player.setPosition(home.x, home.z);
  game.hud.hideEnd();
  game.state = 'playing';
  game.saveNow();
};

game.saveNow = function saveNow() {
  saveGame({
    money: game.money,
    missionIndex: game.missions.index,
    completedMissions: game.completedMissions,
    health: game.health,
    position: [game.player.pos.x, game.player.pos.z],
  });
};

// --- Starting, pausing, menus ----------------------------------------------
function startPlaying(fromSave) {
  game.audio.init();
  game.audio.click();
  game.input.requestLock();
  game.hud.hideStart();
  game.hud.hidePause();
  game.hud.hideEnd();
  game.state = 'playing';
  if (fromSave) {
    const data = loadGame();
    if (data) {
      game.money = data.money;
      game.health = data.health;
      game.completedMissions = data.completedMissions || 0;
      game.player.setPosition(data.position[0], data.position[1]);
      if (data.missionIndex < 3) {
        game.missions.start(game, data.missionIndex);
      } else {
        game.missions.freeRoam = true;
        game.missions.index = 3;
        game.hud.setObjective('Free roam — press M for a delivery job');
      }
      game.hud.toast('Welcome back to Solmar City');
    }
  } else {
    game.money = 250;
    game.health = 100;
    game.completedMissions = 0;
    game.setWanted(0);
    game.player.setPosition(4, 24);
    game.missions.start(game, 0);
  }
  game.saveNow();
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    game.audio.stopAllLoops();
    game.input.releaseLock();
    game.hud.showPause();
  } else if (game.state === 'paused') {
    game.state = 'playing';
    game.hud.hidePause();
    game.input.requestLock();
  }
}

document.getElementById('start-btn').addEventListener('click', () => startPlaying(false));
document.getElementById('continue-btn').addEventListener('click', () => startPlaying(true));
document.getElementById('resume-btn').addEventListener('click', () => togglePause());
document.getElementById('restart-btn').addEventListener('click', () => {
  clearSave();
  window.location.href = window.location.pathname;
});
document.getElementById('quit-btn').addEventListener('click', () => {
  game.saveNow();
  game.state = 'menu';
  game.hud.hidePause();
  game.hud.showStart(hasSave());
});
document.getElementById('end-btn').addEventListener('click', () => {
  game.audio.click();
  game.respawn();
});
canvas.addEventListener('click', () => {
  if (game.state === 'playing') game.input.requestLock();
});

// --- Entering and stealing cars --------------------------------------------
function tryEnterExitCar() {
  const player = game.player;
  if (!player.onFoot) {
    player.exitVehicle();
    game.audio.click();
    game.hud.setPrompt('');
    return;
  }
  const car = game.vehicles.nearestVehicle(player.pos, 4.6);
  if (!car) return;
  const wasTraffic = car.driver === 'traffic';
  const wasParked = car.driver === null;
  const wasPolice = car.kind === 'police';
  player.enterVehicle(car);
  game.audio.click();
  if (wasPolice) game.addWanted(2, 'You stole a police cruiser!');
  else if (wasTraffic || wasParked) game.addWanted(1, 'Car stolen!');
  game.hud.setPrompt('');
}

// --- Third-person camera ----------------------------------------------------
const camTarget = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const camForward = new THREE.Vector3();

function updateCamera(dt) {
  const input = game.input;
  // Mouse look; on foot the camera also eases round behind the player
  // while they run, so the game plays fine with no pointer lock at all.
  // A locked camera (the chase screenshot) holds its yaw.
  if (!game.lockCamera) {
    game.cameraYaw -= input.takeMouseDX() * 0.0028;
    game.cameraPitch += input.takeMouseDY() * 0.0022;
  } else {
    input.takeMouseDX();
    input.takeMouseDY();
  }
  game.cameraPitch = Math.max(0.05, Math.min(0.9, game.cameraPitch));

  if (game.state === 'menu') {
    game.cameraYaw += dt * 0.06;
  } else if (!game.lockCamera && !game.player.vehicle && game.player.speed > 0.5) {
    let diff = game.player.yaw - game.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    game.cameraYaw += diff * Math.min(1, dt * 1.4);
  }

  // Behind a car the camera swings round to follow its heading.
  const driving = !!game.player.vehicle;
  if (driving && !game.lockCamera) {
    const heading = game.player.vehicle.heading;
    let diff = heading - game.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    game.cameraYaw += diff * Math.min(1, dt * 1.8);
  }

  const focus = game.player.pos;
  camTarget.set(focus.x, focus.y + 2.1, focus.z);
  const dist = driving ? 10 : 8;
  const height = driving ? 4.1 : 3.8;
  camForward.set(Math.sin(game.cameraYaw), 0, Math.cos(game.cameraYaw));
  camDesired.copy(camTarget)
    .addScaledVector(camForward, -dist)
    .add(new THREE.Vector3(0, height * (0.5 + game.cameraPitch), 0));
  camera.position.lerp(camDesired, Math.min(1, dt * 7));
  if (game.shakeTimer > 0) {
    game.shakeTimer -= dt;
    camera.position.x += (Math.random() - 0.5) * 0.3;
    camera.position.y += (Math.random() - 0.5) * 0.3;
  }
  camTarget.addScaledVector(camForward, 3.5);
  camera.lookAt(camTarget);
  // Keep the sun's shadow frustum over the player.
  sun.position.set(focus.x + 80, 120, focus.z + 40);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.target.updateMatrixWorld();
}

// --- Staged states for screenshots ------------------------------------------
// ?shot=cover|foot|chase|mission skips the menu and sets the game up so
// one screenshot shows several systems at once.
function stageShot() {
  game.hud.hideStart();
  game.state = 'playing';
  const player = game.player;
  if (SHOT === 'foot') {
    // On the downtown road, facing the mission beacon 30 units ahead.
    player.setPosition(2, 30);
    game.cameraYaw = Math.PI;
    game.missions.start(game, 0);
    game.hud.hideBriefing();
  } else if (SHOT === 'chase') {
    // The camera looks back from ahead of the car, so the cruisers
    // hunting the player fill the frame behind it.
    const car = game.vehicles.createVehicle(0, -20, 0, 0xc0392b, 'civilian');
    player.enterVehicle(car);
    car.speed = 16;
    game.cameraYaw = Math.PI;
    game.lockCamera = true;
    game.missions.start(game, 0);
    game.missions.stage = 1;
    game.missions.enterStage(game);
    game.setWanted(3);
    game.hud.hideBriefing();
  } else if (SHOT === 'mission') {
    // Westbound on the southern boulevard, the docks beacon dead ahead.
    const car = game.vehicles.createVehicle(-20, 150, -Math.PI / 2, 0x2980b9, 'civilian');
    player.enterVehicle(car);
    car.speed = 14;
    game.cameraYaw = -Math.PI / 2;
    game.missions.start(game, 0);
    game.missions.stage = 1;
    game.missions.enterStage(game);
    game.hud.hideBriefing();
  } else {
    // cover: driving downtown, wanted, mission live, cops closing in.
    const car = game.vehicles.createVehicle(0, 30, Math.PI, 0xc0392b, 'civilian');
    player.enterVehicle(car);
    car.speed = 15;
    game.cameraYaw = Math.PI;
    game.missions.start(game, 0);
    game.missions.stage = 1;
    game.missions.enterStage(game);
    game.setWanted(2);
    game.hud.hideBriefing();
  }
  // Let the police spawn a frame early so they are in the shot, and for
  // the chase pull two cruisers in right behind the player.
  game.police.update(0.5, game);
  if (SHOT === 'chase') {
    const pz = player.pos.z;
    game.police.cars.forEach((car, i) => {
      const p = car.vehicle.group.position;
      p.x = i === 0 ? -1 : 2;
      p.z = pz - 16 - i * 12;
      car.axis = 'z';
      car.dir = 1;
      car.vehicle.heading = 0;
      car.vehicle.group.rotation.y = 0;
      car.vehicle.speed = 18;
    });
  }
  game.hud.setPrompt('');
}

// --- Main loop ---------------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const input = game.input;
  game.time += dt;

  if (game.state === 'playing') {
    if (input.pressed('KeyP') || input.pressed('Escape')) {
      togglePause();
    } else {
      if (input.pressed('KeyM')) {
        if (!game.missions.active && !game.missions.sideJob) {
          if (game.missions.index < 3) game.missions.start(game, game.missions.index);
          else game.missions.startSideJob(game);
        }
      }
      if (input.pressed('KeyE') && !input.down('ShiftLeft')) tryEnterExitCar();
      if (input.pressed('KeyH')) game.hud.hideBriefing();

      game.player.update(dt, game);
      if (game.player.vehicle) {
        game.vehicles.drivePlayer(dt, game);
        game.vehicles.resolveCarCollisions(game);
      }
      game.vehicles.update(dt, game);
      game.traffic.update(dt, game);
      game.pedestrians.update(dt, game);
      game.police.update(dt, game);
      game.missions.update(dt, game);
      game.combat.update(dt, game);

      // Engine hum follows the player's car; silent on foot.
      const car = game.player.vehicle;
      game.audio.setEngine(!!car, car ? Math.abs(car.speed) / 34 : 0);
      game.audio.update(dt);

      // Context prompt: the nearest stealable car.
      if (game.player.onFoot && game.state === 'playing') {
        const near = game.vehicles.nearestVehicle(game.player.pos, 4.6);
        if (near && !game.hud.el.prompt.textContent.startsWith('BUSTED')) {
          game.hud.setPrompt('Press E to enter the car');
        } else if (!game.hud.el.prompt.textContent.startsWith('BUSTED')) {
          game.hud.setPrompt('');
        }
      }

      // Autosave every 30 seconds of play.
      game.saveTimer += dt;
      if (game.saveTimer > 30) {
        game.saveTimer = 0;
        game.saveNow();
      }
    }
  }

  updateCamera(game.state === 'menu' ? 0.016 : dt);
  game.hud.update(game, dt);
  renderer.render(scene, camera);
  input.postUpdate();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boot --------------------------------------------------------------------
if (SHOT) {
  stageShot();
} else {
  // Menu orbit: slow drift over the city behind the start screen.
  game.player.setPosition(4, 24);
  game.hud.showStart(hasSave());
  game.hud.setObjective('Welcome to Solmar City');
}
window.__solmar = game;
animate();
