// city.js — Solmar City: a sun-soaked grid city built from flat-shaded
// boxes with canvas-painted window and road textures. The layout is seeded,
// so the same seed always builds the same city. The module also owns the
// collision data every moving thing asks about: building boxes and the
// city bounds.

import * as THREE from 'three';

// Small deterministic PRNG so a seed rebuilds the same city every time.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROAD_CENTERS = [-150, -100, -50, 0, 50, 100, 150];
const ROAD_WIDTH = 14;
const CITY_HALF = 178;

const BUILDING_COLORS = [
  0xe8dcc8, 0xd9c7a7, 0xc9b8a3, 0xb8c4cc, 0xd8cdb8,
  0xe5d5c0, 0xcbb9d9, 0xa8c8b8, 0xe0c8a8, 0xb8b8c8,
];

// A window grid painted once onto a canvas, tiled over every building face.
function makeWindowTexture(baseColor, rng) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 128, 256);
  const cols = 4;
  const rows = 10;
  const ww = 128 / cols;
  const wh = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.25;
      ctx.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      ctx.fillRect(x * ww + 5, y * wh + 6, ww - 10, wh - 12);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Asphalt with a dashed centre line, tiled along a road strip.
function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#42474e';
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
  }
  ctx.fillStyle = '#f5d76e';
  ctx.fillRect(30, 8, 4, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const city = {
    half: CITY_HALF,
    roadCenters: ROAD_CENTERS,
    roadWidth: ROAD_WIDTH,
    buildings: [], // { minX, maxX, minZ, maxZ, height }
    lamps: [],
  };

  // Ground: warm sand-coloured slab under everything.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 120, CITY_HALF * 2 + 120),
    new THREE.MeshLambertMaterial({ color: 0xc8b48a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // A strip of sea-blue at the south edge: Solmar is a coastal city.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2 + 120, 90),
    new THREE.MeshLambertMaterial({ color: 0x2e86ab }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.2, CITY_HALF + 95);
  scene.add(sea);

  // Roads: one long strip per grid line, both directions.
  const roadTex = makeRoadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const span = CITY_HALF * 2;
  for (const c of ROAD_CENTERS) {
    const texX = roadTex.clone();
    texX.needsUpdate = true;
    texX.repeat.set(span / 14, 1);
    const stripX = new THREE.Mesh(
      new THREE.PlaneGeometry(span, ROAD_WIDTH),
      new THREE.MeshLambertMaterial({ map: texX }),
    );
    stripX.rotation.x = -Math.PI / 2;
    stripX.position.set(0, 0.05, c);
    stripX.receiveShadow = true;
    scene.add(stripX);

    const texZ = roadTex.clone();
    texZ.needsUpdate = true;
    texZ.repeat.set(span / 14, 1);
    const stripZ = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH, span),
      new THREE.MeshLambertMaterial({ map: texZ }),
    );
    stripZ.rotation.x = -Math.PI / 2;
    stripZ.rotation.z = Math.PI / 2;
    stripZ.position.set(c, 0.06, 0);
    stripZ.receiveShadow = true;
    scene.add(stripZ);
  }

  // Sidewalk slabs fill each block, slightly raised above the ground.
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0xb8b0a0 });
  const blockSize = 50 - ROAD_WIDTH;
  for (let ix = 0; ix < ROAD_CENTERS.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_CENTERS.length - 1; iz++) {
      const cx = (ROAD_CENTERS[ix] + ROAD_CENTERS[ix + 1]) / 2;
      const cz = (ROAD_CENTERS[iz] + ROAD_CENTERS[iz + 1]) / 2;
      const slab = new THREE.Mesh(
        new THREE.PlaneGeometry(blockSize, blockSize),
        sidewalkMat,
      );
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(cx, 0.03, cz);
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }

  // Buildings: 1-4 per block, heights rising toward the centre.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a7a68 });
  for (let ix = 0; ix < ROAD_CENTERS.length - 1; ix++) {
    for (let iz = 0; iz < ROAD_CENTERS.length - 1; iz++) {
      const cx = (ROAD_CENTERS[ix] + ROAD_CENTERS[ix + 1]) / 2;
      const cz = (ROAD_CENTERS[iz] + ROAD_CENTERS[iz + 1]) / 2;
      const distCenter = Math.hypot(cx, cz);
      const downtown = distCenter < 90;
      const count = downtown ? 1 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 3);
      for (let b = 0; b < count; b++) {
        const w = 9 + rng() * 14;
        const d = 9 + rng() * 14;
        const maxH = downtown ? 42 : 20;
        const h = 8 + rng() * maxH;
        const ox = (rng() - 0.5) * (blockSize - w - 4);
        const oz = (rng() - 0.5) * (blockSize - d - 4);
        const x = cx + ox;
        const z = cz + oz;
        const color = BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)];
        const tex = makeWindowTexture('#' + color.toString(16).padStart(6, '0'), rng);
        tex.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, Math.round(h / 12)));
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        const sideMat = new THREE.MeshLambertMaterial({ map: tex });
        const building = new THREE.Mesh(boxGeo, [
          sideMat, sideMat, roofMat, roofMat, sideMat, sideMat,
        ]);
        building.scale.set(w, h, d);
        building.position.set(x, h / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        city.buildings.push({
          minX: x - w / 2, maxX: x + w / 2,
          minZ: z - d / 2, maxZ: z + d / 2,
          height: h,
        });
        // Rooftop box on taller towers for a varied skyline.
        if (h > 24 && rng() < 0.6) {
          const cap = new THREE.Mesh(
            boxGeo,
            new THREE.MeshLambertMaterial({ color: 0x9a8a78 }),
          );
          cap.scale.set(w * 0.4, 3, d * 0.4);
          cap.position.set(x, h + 1.5, z);
          cap.castShadow = true;
          scene.add(cap);
        }
      }
    }
  }

  // Street lamps at every other intersection.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
  const lampGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const lampMat = new THREE.MeshLambertMaterial({
    color: 0xfff2b8, emissive: 0x998800,
  });
  for (const cx of ROAD_CENTERS) {
    for (const cz of ROAD_CENTERS) {
      if (Math.abs(cx + cz) % 100 !== 0) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(cx + ROAD_WIDTH / 2 + 1, 3, cz + ROAD_WIDTH / 2 + 1);
      scene.add(pole);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(cx + ROAD_WIDTH / 2 + 1, 6.2, cz + ROAD_WIDTH / 2 + 1);
      scene.add(lamp);
      city.lamps.push([cx + ROAD_WIDTH / 2 + 1, cz + ROAD_WIDTH / 2 + 1]);
    }
  }

  // Palm trees along the southern boulevard and a few random blocks.
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
  const crownGeo = new THREE.ConeGeometry(3.2, 4.5, 7);
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
  const palmSpots = [];
  for (let x = -150; x <= 150; x += 25) palmSpots.push([x, 150 + ROAD_WIDTH / 2 + 3]);
  for (let i = 0; i < 14; i++) {
    palmSpots.push([
      (rng() - 0.5) * 300,
      ROAD_CENTERS[Math.floor(rng() * ROAD_CENTERS.length)] + ROAD_WIDTH / 2 + 3,
    ]);
  }
  for (const [x, z] of palmSpots) {
    if (city.buildings.some((b) => x > b.minX - 2 && x < b.maxX + 2 && z > b.minZ - 2 && z < b.maxZ + 2)) continue;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(crownGeo, crownMat);
    crown.position.set(x, 8.5, z);
    crown.castShadow = true;
    scene.add(crown);
  }

  // Named places the missions use.
  city.places = {
    downtown: { x: 0, z: 0 },
    docks: { x: -125, z: 150 },
    safehouse: { x: 125, z: -125 },
    garage: { x: 50, z: 100 },
    plaza: { x: -50, z: -50 },
    marina: { x: 125, z: 150 },
  };

  city.isRoad = function isRoad(x, z) {
    const half = ROAD_WIDTH / 2;
    for (const c of ROAD_CENTERS) {
      if (Math.abs(z - c) < half || Math.abs(x - c) < half) return true;
    }
    return false;
  };

  // True when a circle at (x, z) with radius r would hit a building or
  // leave the city.
  city.collides = function collides(x, z, r) {
    if (Math.abs(x) > CITY_HALF - 2 || Math.abs(z) > CITY_HALF - 2) return true;
    for (const b of city.buildings) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    }
    return false;
  };

  city.randomRoadPoint = function randomRoadPoint() {
    const c = ROAD_CENTERS[Math.floor(rng() * ROAD_CENTERS.length)];
    const along = (rng() - 0.5) * (CITY_HALF * 2 - 40);
    if (rng() < 0.5) return { x: along, z: c, axis: 'x', dir: rng() < 0.5 ? 1 : -1 };
    return { x: c, z: along, axis: 'z', dir: rng() < 0.5 ? 1 : -1 };
  };

  city.sidewalkPoint = function sidewalkPoint() {
    const c = ROAD_CENTERS[Math.floor(rng() * ROAD_CENTERS.length)];
    const along = (rng() - 0.5) * (CITY_HALF * 2 - 40);
    const off = ROAD_WIDTH / 2 + 1.6;
    if (rng() < 0.5) return { x: along, z: c + (rng() < 0.5 ? off : -off) };
    return { x: c + (rng() < 0.5 ? off : -off), z: along };
  };

  return city;
}
