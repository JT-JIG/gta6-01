// audio.js — all sound is synthesised with WebAudio oscillators and noise,
// so the game ships no audio files and makes no network request. The engine
// hum and the police siren are looping oscillators whose pitch follows the
// game; everything else is a short one-shot blip.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
  }

  // Must run from a user gesture (the Start button) or the browser keeps
  // the AudioContext suspended.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch (err) {
      this.ctx = null;
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  blip(freq, dur, type, volume, slideTo) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(volume || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, volume, lowpass) {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass || 1200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume || 0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
  }

  click() {
    this.blip(880, 0.07, 'square', 0.08);
  }

  shot() {
    this.noiseBurst(0.14, 0.4, 2800);
    this.blip(160, 0.1, 'square', 0.18, 60);
  }

  punch() {
    this.noiseBurst(0.08, 0.25, 500);
  }

  crash() {
    this.noiseBurst(0.25, 0.35, 700);
    this.blip(90, 0.2, 'sawtooth', 0.15, 45);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.2);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.2), 90);
  }

  cash() {
    this.blip(1320, 0.08, 'sine', 0.18);
    setTimeout(() => this.blip(1760, 0.14, 'sine', 0.18), 90);
  }

  missionComplete() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.blip(freq, 0.16, 'triangle', 0.2), i * 110);
    });
  }

  busted() {
    this.blip(440, 0.3, 'sawtooth', 0.15, 220);
    setTimeout(() => this.blip(330, 0.4, 'sawtooth', 0.15, 165), 300);
  }

  // Continuous engine hum: pitch and loudness follow speed (0..1).
  setEngine(on, speed01) {
    if (!this.ready) return;
    if (!on) {
      if (this.engineOsc) {
        try { this.engineOsc.stop(); } catch (err) {}
        this.engineOsc = null;
        this.engineGain = null;
      }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.07, t, 0.08);
  }

  setSiren(on) {
    if (!this.ready) return;
    if (!on) {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch (err) {}
        this.sirenOsc = null;
        this.sirenGain = null;
      }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.06;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = 0;
      this.sirenHigh = true;
    }
  }

  update(dt) {
    if (this.sirenOsc && this.ready) {
      this.sirenTimer += dt;
      if (this.sirenTimer > 0.45) {
        this.sirenTimer = 0;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setValueAtTime(
          this.sirenHigh ? 920 : 660,
          this.ctx.currentTime,
        );
      }
    }
  }

  stopAllLoops() {
    this.setEngine(false, 0);
    this.setSiren(false);
  }
}
