// Unified input: keyboard + mouse (pointer lock) and touch (joystick + look pad + buttons).
// Keyboard actions can be rebound (settings.binds: action -> KeyboardEvent.code).
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', sprint: 'ShiftLeft', crouch: 'KeyC', interact: 'KeyE',
  flashlight: 'KeyF', nightvision: 'KeyN', zoom: 'KeyZ', throw: 'KeyG', alarm: 'KeyQ', breath: 'Space',
  map: 'KeyM', mapfloor: 'KeyR', objectives: 'Tab', leanLeft: 'KeyX', leanRight: 'KeyV', knock: 'KeyT',
};
export const BIND_LABELS = {
  forward: 'Maju', back: 'Mundur', left: 'Kiri', right: 'Kanan', sprint: 'Lari', crouch: 'Jongkok', interact: 'Interaksi',
  flashlight: 'Senter', nightvision: 'Mode malam', zoom: 'Zoom kamera', throw: 'Lempar penghapus', alarm: 'Pasang jam weker', breath: 'Tahan napas',
  map: 'Denah', mapfloor: 'Denah: ganti lantai', objectives: 'Tujuan', leanLeft: 'Condong kiri', leanRight: 'Condong kanan', knock: 'Ketuk dinding',
};
const HELD = new Set(['forward', 'back', 'left', 'right', 'sprint', 'zoom', 'breath', 'leanLeft', 'leanRight']);
export function keyLabel(code) {
  if (!code) return '—';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift kanan')
    .replace('ControlLeft', 'Ctrl').replace('ControlRight', 'Ctrl kanan').replace('AltLeft', 'Alt').replace('AltRight', 'Alt kanan').replace('Space', 'Spasi');
}
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
    this.pad = { move: { x: 0, y: 0 }, sprint: false, zoom: false, breath: false, prev: [], edges: new Set(), seen: false };
    this.vibrate = true;
    this.binds = { ...DEFAULT_BINDS };
    this.capture = null;   // settings screen waiting for a key
    this._bind();
  }

  _bind() {
    const fixed = { ControlLeft: 'crouch', Escape: 'pause', KeyP: 'pause' };
    addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); e.stopPropagation(); const fn = this.capture; this.capture = null; fn(e.code); return; }
      if (e.code === 'Tab' && this.enabled) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      for (const a in this.binds) if (this.binds[a] === e.code && !HELD.has(a)) this.pressed.add(a);
      if (fixed[e.code] && !Object.values(this.binds).includes(e.code)) this.pressed.add(fixed[e.code]);
    }, true);
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
    const R = 46;
    const onStart = (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest('.tbtn')) continue;
        if (t.clientX < innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          { const h = stick.offsetWidth / 2 || 62; stick.style.left = (sx - h) + 'px'; stick.style.top = (sy - h) + 'px'; stick.style.bottom = 'auto'; }
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
        if (a === 'leanLeft' || a === 'leanRight') { this.leanTouch = a === 'leanLeft' ? -1 : 1; b.classList.add('on'); return; }
        this.pressed.add(a);
      }, { passive: false });
      b.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (a === 'breath') { this.breathHeld = false; b.classList.remove('on'); }
        if (a === 'leanLeft' || a === 'leanRight') { this.leanTouch = 0; b.classList.remove('on'); }
      });
    }
  }

  // ---- gamepad (standard mapping). Called once per frame, also in menus.
  poll(dt) {
    const P = this.pad;
    P.edges.clear();
    let gp = null;
    try { for (const g of (navigator.getGamepads ? navigator.getGamepads() : [])) if (g && g.connected && g.buttons.length >= 10) { gp = g; break; } } catch (_) { /* not allowed */ }
    if (!gp) { P.move.x = P.move.y = 0; P.sprint = P.zoom = P.breath = false; P.lean = 0; this.gp = null; return; }
    this.gp = gp;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const down = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const MAP = { 0: 'interact', 1: 'crouch', 2: 'flashlight', 3: 'nightvision', 4: 'throw', 8: 'map', 9: 'pause', 11: 'knock', 12: 'objectives', 14: 'alarm', 15: 'mapfloor' };
    for (let i = 0; i < gp.buttons.length; i++) {
      const d = down(i);
      if (d && !P.prev[i]) { P.edges.add(i); P.seen = true; if (this.enabled && MAP[i]) this.pressed.add(MAP[i]); if (this.enabled && i === 10) this.sprintToggle = !this.sprintToggle; }
      P.prev[i] = d;
    }
    if (!this.enabled) { P.move.x = P.move.y = 0; return; }
    P.move.x = dz(gp.axes[0] || 0); P.move.y = dz(gp.axes[1] || 0);
    if (P.move.x || P.move.y) P.seen = true;
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    this.lookDX += rx * Math.abs(rx) * 1500 * dt; this.lookDY += ry * Math.abs(ry) * 1000 * dt;
    P.zoom = down(6); P.sprint = down(7); P.breath = down(5);
    P.lean = down(13) ? Math.sign(rx || P.move.x) : 0;   // hold d-pad down and tip a stick to lean
  }
  // short buzz on the phone and the controller
  rumble(ms = 120, strength = 0.6) {
    if (!this.vibrate) return;
    try { if (this.touch && navigator.vibrate) navigator.vibrate(ms); } catch (_) { /* ignore */ }
    try { const a = this.gp && this.gp.vibrationActuator; if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch(() => {}); } catch (_) { /* ignore */ }
  }

  // axis -1..1
  axis() {
    let x = 0, y = 0;
    const k = this.keys;
    const b = this.binds;
    if (k.has(b.forward) || k.has('ArrowUp')) y -= 1;
    if (k.has(b.back) || k.has('ArrowDown')) y += 1;
    if (k.has(b.left) || k.has('ArrowLeft')) x -= 1;
    if (k.has(b.right) || k.has('ArrowRight')) x += 1;
    x += this.move.x + this.pad.move.x; y += this.move.y + this.pad.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  setBinds(b) { this.binds = { ...DEFAULT_BINDS, ...(b || {}) }; }
  // what to print in prompts for an action
  keyName(a) { return keyLabel(this.binds[a]); }
  sprint() { return this.keys.has(this.binds.sprint) || this.sprintToggle || this.pad.sprint; }
  zooming() { return this.keys.has(this.binds.zoom) || this.zoomToggle || this.pad.zoom; }
  // -1 lean left, 1 lean right, 0 upright (keyboard, touch buttons, d-pad down + stick on a pad)
  lean() { return (this.keys.has(this.binds.leanRight) || this.leanTouch > 0 ? 1 : 0) - (this.keys.has(this.binds.leanLeft) || this.leanTouch < 0 ? 1 : 0) + (this.pad.lean || 0); }
  holdingBreath() { return this.keys.has(this.binds.breath) || this.breathHeld || this.pad.breath; }
  consume(a) { const had = this.pressed.has(a); this.pressed.delete(a); return had; }
  endFrame() { this.pressed.clear(); this.lookDX = 0; this.lookDY = 0; }
  resetToggles() {
    this.sprintToggle = this.crouchToggle = this.breathHeld = this.zoomToggle = false;
    for (const b of document.querySelectorAll('.tbtn.on')) b.classList.remove('on');
  }
}
