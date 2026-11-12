import * as THREE from 'three';
import { PLAYER, NOISE } from './config.js';
import { clamp, damp } from './util/rng.js';

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
    this.light.position.set(0.18, -0.15, 0);
    this.light.target.position.set(0.1, -0.2, -5);
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
        this.yaw = base + clamp(d, -0.6, 0.6);
        const pr = this.hidden.kind === 'stall' ? [-0.9, 0.3] : [-0.35, 0.3];
        this.pitch = clamp(this.pitch, pr[0], pr[1]);
      }
      this.pitch = clamp(this.pitch, -1.45, 1.45);
    }

    // ----- toggles -----
    if (input.consume('flashlight') && this.alive) {
      if (this.battery > 0) { this.flashlight = !this.flashlight; game.audio.click(); }
      else game.hud.toast('Baterai habis');
    }
    if (input.consume('nightvision') && this.alive) {
      if (this.battery > 0) { this.nightVision = !this.nightVision; game.audio.nvToggle(this.nightVision); }
      else game.hud.toast('Baterai habis');
    }
    if (input.consume('crouch') && !this.hidden) {
      this.crouched = !this.crouched;
      const b = document.querySelector('.tbtn[data-action="crouch"]');
      if (b) b.classList.toggle('on', this.crouched);
    }

    // ----- battery -----
    const drain = (this.flashlight ? PLAYER.batteryDrainLight : 0) + (this.nightVision ? PLAYER.batteryDrainNV : 0);
    this.battery = Math.max(0, this.battery - drain * dt);
    if (this.battery <= 0 && (this.flashlight || this.nightVision)) {
      this.flashlight = false; this.nightVision = false;
      game.hud.toast('Baterai kamera habis — cari baterai cadangan');
    }
    // dying-battery stutter
    let flash = this.flashlight ? 1 : 0;
    if (this.flashlight && this.battery < 15) flash *= Math.random() < 0.06 ? 0.15 : 0.85 + Math.random() * 0.15;
    this.light.intensity = flash * 11;

    // ----- breath (only meaningful while hidden) -----
    const holding = this.hidden && input.holdingBreath() && this.breath > 0;
    this.holdingBreath = holding;
    if (holding) {
      this.breath -= PLAYER.breathDrain * dt;
      if (this.breath <= 0) { this.breath = 0; game.audio.gasp(); game.emitNoise(this.pos.x, this.pos.z, NOISE.gasp, 'gasp'); game.hud.toast('Kamu terengah-engah!'); }
    } else this.breath = Math.min(PLAYER.breathMax, this.breath + PLAYER.breathRegen * dt);

    if (this.hidden || !this.alive) {
      this.vel.set(0, 0);
      this.moving = 0;
      this._applyCamera(dt);
      return;
    }

    // ----- movement -----
    const ax = input.axis();
    const wantSprint = input.sprint() && !this.crouched && ax.y < 0 && !this.exhausted;
    this.wading = !!(this.water && this.water.some((w) => this.pos.x > w.minX && this.pos.x < w.maxX && this.pos.z > w.minZ && this.pos.z < w.maxZ));
    const speed = (this.crouched ? PLAYER.crouch : wantSprint ? PLAYER.sprint : PLAYER.walk) * (this.wading ? 0.62 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const tx = (ax.x * cos + ax.y * sin) * speed;
    const tz = (-ax.x * sin + ax.y * cos) * speed;
    this.vel.x = damp(this.vel.x, tx, PLAYER.accel, dt);
    this.vel.y = damp(this.vel.y, tz, PLAYER.accel, dt);
    const sp = this.vel.length();
    const sprinting = wantSprint && sp > PLAYER.walk * 0.9;
    if (sprinting) {
      this.stamina -= PLAYER.staminaDrain * dt;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; game.audio.pant(); }
    } else {
      this.stamina = Math.min(PLAYER.staminaMax, this.stamina + PLAYER.staminaRegen * dt * (sp < 0.2 ? 1.5 : 1));
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
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
    const targetEye = this.hidden ? 1.55 : this.crouched ? PLAYER.eyeCrouch : PLAYER.eye;
    this.eye = damp(this.eye, targetEye, 10, dt);
    const bobAmt = this.hidden ? 0 : Math.min(this.moving, 1.4) * (this.sprinting ? 0.055 : 0.035);
    const by = Math.abs(Math.sin(this.bob)) * bobAmt;
    const bx = Math.cos(this.bob) * bobAmt * 0.5;
    const c = this.camera;
    if (this.hidden) {
      c.position.set(this.hidden.camX, this.eye, this.hidden.camZ);
    } else {
      c.position.set(this.pos.x + Math.cos(this.yaw) * bx, (this.y || 0) + this.eye + by, this.pos.z - Math.sin(this.yaw) * bx);
    }
    c.rotation.set(this.pitch, this.yaw, Math.cos(this.bob) * bobAmt * 0.25);
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
