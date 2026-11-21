// input.js — keyboard, mouse and pointer-lock input for Solmar City.
// One Input instance owns the key state, edge-triggered presses and the
// mouse deltas the camera consumes each frame. Arrow keys also steer the
// camera, so the game stays playable without pointer lock.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouseButtons = new Set();
    this.pressedButtons = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = true;

    window.addEventListener('keydown', (event) => {
      if (!this.enabled) return;
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressedKeys.add(event.code);
      if (event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pressedKeys.clear();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.mouseDX += event.movementX || 0;
      this.mouseDY += event.movementY || 0;
    });
    canvas.addEventListener('mousedown', (event) => {
      this.mouseButtons.add(event.button);
      this.pressedButtons.add(event.button);
    });
    window.addEventListener('mouseup', (event) => {
      this.mouseButtons.delete(event.button);
    });
  }

  // Ask the browser for pointer lock on the game canvas. Browsers only
  // grant it from a user gesture, so call this from a click handler.
  requestLock() {
    if (this.locked) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (err) {
      // Pointer lock is a nicety, never a requirement.
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down.
  pressed(code) {
    return this.pressedKeys.has(code);
  }

  mousePressed(button) {
    return this.pressedButtons.has(button);
  }

  mouseDown(button) {
    return this.mouseButtons.has(button);
  }

  takeMouseDX() {
    const dx = this.mouseDX;
    this.mouseDX = 0;
    return dx;
  }

  takeMouseDY() {
    const dy = this.mouseDY;
    this.mouseDY = 0;
    return dy;
  }

  // Call once per frame, after every system has read this frame's edges.
  postUpdate() {
    this.pressedKeys.clear();
    this.pressedButtons.clear();
  }

  clearAll() {
    this.keys.clear();
    this.pressedKeys.clear();
    this.mouseButtons.clear();
    this.pressedButtons.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
