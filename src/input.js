// Unified input: keyboard + mouse (pointer lock) and touch (joystick + look pad + buttons).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // edge-triggered actions this frame
    this.lookDX = 0; this.lookDY = 0;
    this.move = { x: 0, y: 0 };  // from joystick
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.sensitivity = 1;
    this.invertY = false;
    this.enabled = false;
    this.sprintToggle = false;
    this.crouchToggle = false;
    this.breathHeld = false;
    this._bind();
  }

  _bind() {
    const map = {
      KeyE: 'interact', KeyF: 'flashlight', KeyN: 'nightvision', KeyC: 'crouch', ControlLeft: 'crouch',
      Escape: 'pause', KeyP: 'pause', Tab: 'objectives', Space: 'breath', KeyG: 'throw', KeyM: 'map', KeyR: 'mapfloor',
    };
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = map[e.code];
      if (a) this.pressed.add(a);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== this.canvas) return;
      this.lookDX += e.movementX; this.lookDY += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (document.pointerLockElement !== this.canvas) { this.lock(); return; }
      if (e.button === 0) this.pressed.add('interact');
      if (e.button === 2) this.pressed.add('throw');
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.touch) this._bindTouch();
  }

  lock() {
    if (this.touch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _bindTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    let stickId = null, sx = 0, sy = 0;
    let lookId = null, lx = 0, ly = 0;
    const R = 55;
    const onStart = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest('.tbtn')) continue;
        if (t.clientX < innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = (sx - 70) + 'px'; stick.style.top = (sy - 70) + 'px';
          stick.classList.add('active');
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const d = Math.hypot(dx, dy);
          if (d > R) { dx *= R / d; dy *= R / d; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move.x = dx / R; this.move.y = dy / R;
        } else if (t.identifier === lookId) {
          this.lookDX += (t.clientX - lx) * 2.2; this.lookDY += (t.clientY - ly) * 2.2;
          lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.move.x = this.move.y = 0;
          knob.style.transform = ''; stick.classList.remove('active');
        } else if (t.identifier === lookId) lookId = null;
      }
    };
    const layer = document.getElementById('touch-layer');
    layer.addEventListener('touchstart', onStart, { passive: true });
    layer.addEventListener('touchmove', onMove, { passive: false });
    layer.addEventListener('touchend', onEnd);
    layer.addEventListener('touchcancel', onEnd);
    for (const b of document.querySelectorAll('.tbtn')) {
      const a = b.dataset.action;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (a === 'sprint') { this.sprintToggle = !this.sprintToggle; b.classList.toggle('on', this.sprintToggle); return; }
        if (a === 'breath') { this.breathHeld = true; b.classList.add('on'); return; }
        if (a === 'zoom') { this.zoomToggle = !this.zoomToggle; b.classList.toggle('on', this.zoomToggle); return; }
        this.pressed.add(a);
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (a === 'breath') { this.breathHeld = false; b.classList.remove('on'); }
      });
    }
  }

  // axis -1..1
  axis() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    x += this.move.x; y += this.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintToggle; }
  zooming() { return this.keys.has('KeyZ') || this.zoomToggle; }
  holdingBreath() { return this.keys.has('Space') || this.breathHeld; }
  consume(a) { const had = this.pressed.has(a); this.pressed.delete(a); return had; }
  endFrame() { this.pressed.clear(); this.lookDX = 0; this.lookDY = 0; }
  resetToggles() {
    this.sprintToggle = this.crouchToggle = this.breathHeld = this.zoomToggle = false;
    for (const b of document.querySelectorAll('.tbtn.on')) b.classList.remove('on');
  }
}
