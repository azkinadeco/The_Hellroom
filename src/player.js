import * as THREE from 'three';
import { PLAYER, NOISE, hideOf } from './config.js';
import { clamp, damp } from './util/rng.js';

const angleWrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector2();
    this.yaw = 0; this.pitch = 0;
    this.eye = PLAYER.eye;
    this.crouched = false;
    this.stamina = PLAYER.staminaMax;
    this.exhausted = false;
    this.breath = PLAYER.breathMax;
    this.battery = 100;
    this.flashlight = false;
    this.nightVision = false;
    this.hidden = null;        // locker reference when hiding
    this.stepDist = 0;
    this.bob = 0;
    this.fear = 0;             // 0..1 drives heartbeat + fx
    this.moving = 0;           // 0..1 movement intensity
    this.alive = true;
    this.lookLock = null;      // forced look target (jumpscare)
    this.inventory = { fuses: 0, keys: 0 };

    // flashlight
    this.light = new THREE.SpotLight(0xfff2d8, 0, 22, 0.5, 0.55, 1.6);
    // held low and to the right, so the shadows it throws are visible from the eye
    this.light.position.set(0.32, -0.28, -0.05);
    this.light.target.position.set(0.1, -0.2, -5);
    this.light.shadow.camera.near = 0.25; this.light.shadow.camera.far = 12;
    this.light.shadow.bias = -0.0008; this.light.shadow.normalBias = 0.03;
    camera.add(this.light); camera.add(this.light.target);
    scene.add(camera);
  }

  spawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.y = 0;
    this.yaw = yaw; this.pitch = 0;
    this.vel.set(0, 0);
    this.crouched = false; this.hidden = null; this.alive = true; this.lookLock = null;
    this.stamina = PLAYER.staminaMax; this.breath = PLAYER.breathMax; this.fear = 0;
    this.eye = PLAYER.eye;
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }

  update(dt, input, world, game) {
    // ----- look -----
    if (!this.lookLock) {
      const s = 0.0022 * input.sensitivity * (this.lookScale || 1);
      this.yaw -= input.lookDX * s;
      this.pitch -= input.lookDY * s * (input.invertY ? -1 : 1);
      if (this.hidden) { // limited look inside a locker
        const base = this.hidden.viewYaw;
        let d = this.yaw - base;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const h = hideOf(this.hidden), yl = h.yaw ?? 0.6;
        this.yaw = base + clamp(d, -yl, yl);
        const pr = h.pitch || [-0.35, 0.3];
        this.pitch = clamp(this.pitch, pr[0], pr[1]);
      }
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }

    // ----- toggles -----
    if (input.consume('flashlight') && this.alive) {
      if (this.battery > 0) { this.flashlight = !this.flashlight; game.audio.click(); if (this.flashlight && this.hidden) game.hint('leak', 'Cahaya senter bocor dari celah tempat sembunyi: penghuni yang lewat akan melihatnya. Matikan lagi kalau ada yang mendekat.', 5); }
      else game.hud.toast('Baterai habis');
    }
    if (input.consume('nightvision') && this.alive) {
      if (this.battery > 0) { this.nightVision = !this.nightVision; game.audio.nvToggle(this.nightVision); }
      else game.hud.toast('Baterai habis');
    }
    // hold-to-crouch (keyboard, if chosen in the settings): crouched exactly while the key is down
    if (input.crouchHold && !input.touch && !this.hidden) {
      const held = input.keys.has(input.binds.crouch) || input.keys.has('ControlLeft');
      input.consume('crouch');
      if (held !== this.crouched) { this.crouched = held; }
    } else if (input.consume('crouch') && !this.hidden) {
      this.crouched = !this.crouched;
      const b = document.querySelector('.tbtn[data-action="crouch"]');
      if (b) b.classList.toggle('on', this.crouched);
    }

    // ----- battery -----
    const drain = (this.flashlight ? PLAYER.batteryDrainLight : 0) + (this.nightVision ? PLAYER.batteryDrainNV : 0);
    this.battery = Math.max(0, this.battery - drain * dt * (game.def.drainMul || 1));
    if (this.battery <= 0 && (this.flashlight || this.nightVision)) {
      this.flashlight = false; this.nightVision = false;
      game.hud.toast('Baterai kamera habis — cari baterai cadangan');
    }
    // dying-battery stutter
    let flash = this.flashlight ? 1 : 0;
    if (this.flashlight && this.battery < 15) flash *= Math.random() < 0.06 ? 0.15 : 0.85 + Math.random() * 0.15;
    this.light.intensity = flash * 11 * (game.def.torchMul || 1);
    this.light.distance = 22 * (game.def.torchMul || 1);

    // ----- breath (only meaningful while hidden) -----
    const holding = (this.hidden || this.exhausted) && input.holdingBreath() && this.breath > 0;   // also to stifle panting after a run
    this.holdingBreath = holding;
    if (holding) {
      this.breath -= PLAYER.breathDrain * dt;
      if (this.breath <= 0) { this.breath = 0; game.audio.gasp(); game.emitNoise(this.pos.x, this.pos.z, NOISE.gasp, 'gasp'); game.hud.toast('Kamu terengah-engah!'); }
    } else this.breath = Math.min(PLAYER.breathMax, this.breath + PLAYER.breathRegen * dt);

    if (this.hidden || !this.alive || this.locked) {
      this.vel.set(0, 0);
      this.moving = 0;
      this._applyCamera(dt);
      return;
    }

    // ----- movement -----
    // keyhole: lean at a closed door and you look through it instead (the body stays put)
    const lw = input.lean ? input.lean() : 0;
    const kd = lw ? game.keyholeDoor() : null;
    if (kd && !this.peekDoor) { this.peekDoor = kd; this.peekBase = this.yaw; game.stats.keyholes = (game.stats.keyholes || 0) + 1; game.audio.click(); }
    if (!kd && this.peekDoor) { this.peekDoor = null; this.yaw = this.peekBase; }
    document.body.classList.toggle('keyhole', !!this.peekDoor);
    if (this.peekDoor) {
      this.yaw = this.peekBase + clamp(angleWrap(this.yaw - this.peekBase), -0.45, 0.45);
      this.pitch = clamp(this.pitch, -0.3, 0.25);
      this.vel.set(0, 0); this.moving = 0; this.lean = 0;
      this._applyCamera(dt);
      return;
    }
    const ax = input.axis();
    // lean round a corner: the head moves out, the body stays behind the wall
    const want = input.lean ? input.lean() : 0;
    let room = 0.48;
    if (want) {   // as far as the wall allows
      for (const r of [0.48, 0.34, 0.2]) { const hx = this.pos.x + Math.cos(this.yaw) * r * want, hz = this.pos.z - Math.sin(this.yaw) * r * want, [qx, qz] = world.collide(hx, hz, 0.16); room = r; if (Math.hypot(qx - hx, qz - hz) < 0.02) break; room = 0; }
    }
    this.lean = damp(this.lean || 0, want * room, 9, dt);
    if (Math.abs(this.lean) > 0.05 && !this.leanUsed) { this.leanUsed = true; game.stats.leans = (game.stats.leans || 0) + 1; }
    if (!want) this.leanUsed = false;
    const wantSprint = input.sprint() && !this.crouched && ax.y < 0 && !this.exhausted;
    if (input.sprintPress && (this.exhausted || ax.y >= 0 || this.crouched)) input.kbSprint = false;   // press-to-sprint ends when you stop or tire
    this.wading = !!(this.water && this.water.some((w) => this.pos.x > w.minX && this.pos.x < w.maxX && this.pos.z > w.minZ && this.pos.z < w.maxZ));
    const speed = (this.crouched ? PLAYER.crouch : wantSprint ? PLAYER.sprint : PLAYER.walk) * (this.wading ? 0.62 : 1) * (want ? 0.4 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = (ax.x * cos + ax.y * sin) * speed;
    const tz = (-ax.x * sin + ax.y * cos) * speed;
    this.vel.x = damp(this.vel.x, tx, PLAYER.accel, dt);
    this.vel.y = damp(this.vel.y, tz, PLAYER.accel, dt);
    const sp = this.vel.length();
    const sprinting = wantSprint && sp > PLAYER.walk * 0.9;
    this.sprinting = sprinting;
    if (sprinting) {
      this.stamina -= PLAYER.staminaDrain * dt * (game.def.staminaMul || 1);
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; game.audio.pant(); }
    } else {
      this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt * (sp < 0.2 ? 1.5 : 1));
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    // out of breath: every few steps of panting can be heard nearby, unless you hold your breath (it costs breath)
    if (this.exhausted && !this.hidden) {
      this.pantT = (this.pantT || 0) - dt;
      if (this.pantT <= 0) {
        this.pantT = 1.1;
        if (!this.holdingBreath) { game.audio.gasp(); game.emitNoise(this.pos.x, this.pos.z, NOISE.pant, 'pant'); game.hint('pant', 'Napasmu terengah setelah berlari, dan penghuni di dekatmu bisa mendengarnya. Tahan napas (' + (input.touch ? 'tombol napas' : input.keyName('breath')) + ') atau jangan berlari sampai habis.', 6); }
      }
    }
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
    const [cx, cz] = world.collide(nx, nz, PLAYER.radius);
    // kill velocity into walls so we slide instead of jitter
    this.vel.x = (cx - this.pos.x) / Math.max(dt, 1e-4);
    this.vel.y = (cz - this.pos.z) / Math.max(dt, 1e-4);
    this.pos.x = cx; this.pos.z = cz;
    if (game.verticalStep) game.verticalStep(this);
    this.moving = clamp(sp / PLAYER.walk, 0, 1.6);

    // ----- footsteps / noise -----
    if (sp > 0.3) {
      this.stepDist += sp * dt;
      const stride = this.crouched ? 0.62 : sprinting ? 0.95 : 0.78;
      this.bob += sp * dt / stride * Math.PI;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        const kind = this.crouched ? 'crouch' : sprinting ? 'sprint' : 'walk';
        if (game.onStep) game.onStep(kind);
        if (this.wading) {
          // wading is loud: every step splashes, crouching only softens it
          game.audio.splash(kind === 'crouch' ? 0.4 : kind === 'sprint' ? 1 : 0.7);
          game.emitNoise(this.pos.x, this.pos.z, NOISE.splash * (kind === 'crouch' ? 0.5 : kind === 'sprint' ? 1.3 : 1), 'step');
        } else {
          // carpet swallows steps, bare tile echoes them
          const surf = game.surfaceAt(this.pos.x, this.pos.z);
          game.audio.footstep(kind, surf);
          game.emitNoise(this.pos.x, this.pos.z, NOISE[kind] * (surf === 'carpet' ? 0.6 : surf === 'tile' ? 1.15 : 1), 'step');
        }
      }
    } else this.bob = damp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, 6, dt);
    this.sprinting = sprinting;
    this._applyCamera(dt);
  }

  _applyCamera(dt) {
    const targetEye = this.hidden ? (hideOf(this.hidden).eye ?? 1.55) : this.crouched ? PLAYER.eyeCrouch : PLAYER.eye;
    this.eye = damp(this.eye, targetEye, 10, dt);
    const bobAmt = this.hidden ? 0 : Math.min(this.moving, 1.4) * (this.sprinting ? 0.055 : 0.035) * (this.bobScale ?? 1);
    const by = Math.abs(Math.sin(this.bob)) * bobAmt;
    const bx = Math.cos(this.bob) * bobAmt * 0.5;
    const c = this.camera;
    if (this.peekDoor) {   // the eye at the keyhole, on the far side of the leaf
      const d = this.peekDoor, nx = d.kind === 'v' ? Math.sign(d.x - this.pos.x) || 1 : 0, nz = d.kind === 'h' ? Math.sign(d.z - this.pos.z) || 1 : 0;
      c.position.set(d.x + nx * 0.14, (this.y || 0) + 1.02, d.z + nz * 0.14);
      c.rotation.set(this.pitch, this.yaw, 0);
      return;
    }
    if (this.hidden) {
      c.position.set(this.hidden.camX, this.eye, this.hidden.camZ);
    } else {
      const ln = this.lean || 0;
      c.position.set(this.pos.x + Math.cos(this.yaw) * (bx + ln), (this.y || 0) + this.eye + by - Math.abs(ln) * 0.12, this.pos.z - Math.sin(this.yaw) * (bx + ln));
    }
    c.rotation.set(this.pitch, this.yaw, Math.cos(this.bob) * bobAmt * 0.25 - (this.hidden ? 0 : (this.lean || 0) * 0.32));
  }
  // where a resident would see you: your head when you lean out, otherwise your body
  headPos() {
    const ln = this.hidden ? 0 : this.lean || 0;
    return { x: this.pos.x + Math.cos(this.yaw) * ln, z: this.pos.z - Math.sin(this.yaw) * ln, leaning: Math.abs(ln) > 0.15 };
  }

  // visibility multiplier used by entity perception (0..~1.6)
  visibility(world) {
    if (this.hidden) return 0;
    let v = world.isLit(this.pos.x, this.pos.z) ? 1.0 : 0.45;
    if (this.flashlight) v += 0.55;
    if (this.crouched) v *= 0.6;
    v *= 0.85 + Math.min(this.moving, 1.5) * 0.15;
    return v;
  }
}
