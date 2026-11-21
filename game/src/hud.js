// hud.js — every 2D layer: money, health, wanted stars, speed, the
// mission objective, the canvas minimap, prompts, toasts, and the menus
// (start, pause, wasted, busted, mission briefing). The minimap is drawn
// fresh each frame from the city layout and the live positions.

export class Hud {
  constructor(city) {
    this.city = city;
    this.el = {};
    for (const id of [
      'money', 'health-fill', 'stars', 'speed', 'objective', 'prompt',
      'toast', 'minimap', 'crosshair', 'start-screen', 'pause-menu',
      'end-screen', 'end-title', 'end-text', 'briefing', 'briefing-title',
      'briefing-text', 'continue-btn', 'speed-label',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.minimapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.toastTimer = 0;
    this.briefingTimer = 0;
  }

  setObjective(text) {
    if (this.el.objective) this.el.objective.textContent = text;
  }

  setPrompt(text) {
    if (this.el.prompt) this.el.prompt.textContent = text || '';
  }

  toast(text, seconds) {
    if (!this.el.toast) return;
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastTimer = seconds || 3.5;
  }

  showBriefing(title, text) {
    if (!this.el.briefing) return;
    this.el['briefing-title'].textContent = title;
    this.el['briefing-text'].textContent = text;
    this.el.briefing.classList.add('show');
    this.briefingTimer = 6;
  }

  hideBriefing() {
    if (this.el.briefing) this.el.briefing.classList.remove('show');
  }

  showStart(hasSave) {
    this.el['start-screen'].classList.remove('hidden');
    if (this.el['continue-btn']) {
      this.el['continue-btn'].style.display = hasSave ? 'block' : 'none';
    }
  }

  hideStart() {
    this.el['start-screen'].classList.add('hidden');
  }

  showPause() {
    this.el['pause-menu'].classList.remove('hidden');
  }

  hidePause() {
    this.el['pause-menu'].classList.add('hidden');
  }

  showEnd(title, text) {
    this.el['end-title'].textContent = title;
    this.el['end-text'].textContent = text;
    this.el['end-screen'].classList.remove('hidden');
  }

  hideEnd() {
    this.el['end-screen'].classList.add('hidden');
  }

  starsText(wanted) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < wanted ? '★' : '☆';
    return s;
  }

  update(G, dt) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0 && this.el.toast) this.el.toast.classList.remove('show');
    }
    if (this.briefingTimer > 0) {
      this.briefingTimer -= dt;
      if (this.briefingTimer <= 0) this.hideBriefing();
    }
    if (this.el.money) this.el.money.textContent = '$' + Math.round(G.money).toLocaleString('en-US');
    if (this.el['health-fill']) {
      this.el['health-fill'].style.width = Math.max(0, Math.min(100, G.health)) + '%';
      this.el['health-fill'].style.background = G.health > 30 ? '#39d353' : '#e5484d';
    }
    if (this.el.stars) {
      this.el.stars.textContent = this.starsText(G.wanted);
      this.el.stars.classList.toggle('hot', G.wanted > 0);
    }
    const speed = G.player.vehicle
      ? Math.abs(G.player.vehicle.speed) * 3.6
      : G.player.speed * 3.6;
    if (this.el.speed) this.el.speed.textContent = Math.round(speed);
    if (this.el['speed-label']) {
      this.el['speed-label'].textContent = G.player.vehicle ? 'km/h — driving' : 'km/h — on foot';
    }
    if (this.el.crosshair) {
      this.el.crosshair.style.display = G.player.onFoot && G.state === 'playing' ? 'block' : 'none';
    }
    this.drawMinimap(G);
  }

  // North-up minimap: roads, building blocks, the player arrow, cars,
  // police cruisers and the mission beacon.
  drawMinimap(G) {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const size = 180;
    const half = this.city.half;
    const toMap = (x, z) => [
      ((x + half) / (half * 2)) * size,
      ((z + half) / (half * 2)) * size,
    ];
    ctx.fillStyle = 'rgba(12, 20, 28, 0.85)';
    ctx.fillRect(0, 0, size, size);

    // Roads.
    ctx.strokeStyle = '#5a6470';
    ctx.lineWidth = 5;
    for (const c of this.city.roadCenters) {
      const [mx] = toMap(c, 0);
      const [, mz] = toMap(0, c);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, mz);
      ctx.lineTo(size, mz);
      ctx.stroke();
    }
    // Building blocks.
    ctx.fillStyle = '#2e3a44';
    for (const b of this.city.buildings) {
      const [x1, z1] = toMap(b.minX, b.minZ);
      const [x2, z2] = toMap(b.maxX, b.maxZ);
      ctx.fillRect(x1, z1, Math.max(1, x2 - x1), Math.max(1, z2 - z1));
    }
    // Mission beacon: a blinking green diamond.
    if (G.missions.markerPos && Math.floor(G.time * 2) % 2 === 0) {
      const [x, z] = toMap(G.missions.markerPos.x, G.missions.markerPos.z);
      ctx.fillStyle = '#39ff88';
      ctx.beginPath();
      ctx.moveTo(x, z - 6);
      ctx.lineTo(x + 5, z);
      ctx.lineTo(x, z + 6);
      ctx.lineTo(x - 5, z);
      ctx.closePath();
      ctx.fill();
    }
    // Traffic and parked cars.
    ctx.fillStyle = '#f5d76e';
    for (const v of G.vehicles.all) {
      if (v.kind === 'police') continue;
      const [x, z] = toMap(v.group.position.x, v.group.position.z);
      ctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    // Police cruisers flash blue/red.
    const policeColor = Math.floor(G.time * 3) % 2 === 0 ? '#4d8dff' : '#ff4d4d';
    ctx.fillStyle = policeColor;
    for (const car of G.police.cars) {
      const [x, z] = toMap(car.vehicle.group.position.x, car.vehicle.group.position.z);
      ctx.beginPath();
      ctx.arc(x, z, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // The player: a white arrow pointing where they face.
    const [px, pz] = toMap(G.player.pos.x, G.player.pos.z);
    const heading = G.player.vehicle ? G.player.vehicle.heading : G.player.yaw;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)));
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Frame.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }
}
