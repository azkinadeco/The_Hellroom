import * as THREE from 'three';
import { LEVELS, DIFFICULTY, NOISE, CELL } from './config.js';
import { generateLevel } from './level/generator.js';
import { buildLevel, cloneWithBake } from './level/builder.js';
import { bakeUniforms } from './render/bake.js';
import { VHS } from './render/vhs.js';
import { World } from './world.js';
import { Player } from './player.js';
import { DoorSystem, Interactor } from './interact.js';
import { spawnEntity } from './ai/entities.js';
import { NOTES } from './story.js';
import { clamp, damp, angleDiff } from './util/rng.js';

const CUES = {
  whistle: 'Peluit melengking', step: 'Langkah berat', scrape: 'Gesekan seperti batu', scream: 'Jeritan anak',
  door: 'Pintu berderit', bell: 'Bel sekolah berbunyi', chalk: 'Kapur berderit di papan', locker: 'Dentang loker', slam: 'Pintu dibanting',
};

export class Game {
  constructor({ canvas, assets, audio, input, hud, settings, ui }) {
    this.assets = assets; this.audio = audio; this.input = input; this.hud = hud; this.settings = settings; this.ui = ui;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 70);
    this.vhs = new VHS(this.renderer);
    this.player = new Player(this.camera, this.scene);
    this.ambient = new THREE.AmbientLight(0xd8e0d0, 0.05);
    this.scene.add(this.ambient);
    this.state = 'menu';
    this.time = 0;
    this.entities = [];
    this.levelRoot = null;
    this.flickerT = 0; this.flickerVal = 1;
    this.danger = 0; this.glitch = 0;
    this.chasers = new Set();
    this.projectiles = [];
    this.hintsSeen = new Set();
    this.onHint = null;
    this.cueCd = {};
    this.frameEma = 1 / 60; this.perfT = 0;
    audio.onCue = (k, pos) => this.onCue(k, pos);
    this.applySettings();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  applySettings() {
    const s = this.settings;
    const high = s.quality === 'high';
    this.pixelRatio = Math.min(devicePixelRatio || 1, high ? 1.5 : 1);
    this.baseScale = (high ? 1 : 0.7) * (this.input.touch ? 0.8 : 1);
    this.vhs.scale = this.baseScale;
    this.vhs.enabled = s.vhs;
    this.input.sensitivity = s.sens;
    this.input.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.vhs.enabled ? 1 : this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.vhs.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ level
  loadLevel(index, difficulty) {
    this.unload();
    const def = this.def = LEVELS[index];
    this.levelIndex = index;
    this.diffKey = difficulty;
    this.diff = DIFFICULTY[difficulty];
    const scaled = { ...def, batteries: Math.max(1, Math.round(def.batteries * this.diff.batteries)) };
    this.gen = generateLevel(scaled);
    this.map = this.gen.map;
    this.built = buildLevel(this.gen, this.assets, def);
    this.levelRoot = this.built.root;
    this.scene.add(this.levelRoot);
    this.field = this.built.field;
    this.world = new World(this.gen, this.built);
    this.doorSys = new DoorSystem(this, this.built.doors);
    this.interactor = new Interactor(this);
    this.scene.fog = new THREE.FogExp2(0x070806, def.fog);
    this.scene.background = new THREE.Color(0x070806);

    const p = this.player;
    p.spawn(this.gen.start.x, this.gen.start.z, this.gen.start.yaw);
    p.battery = 100; p.flashlight = false; p.nightVision = false;
    p.inventory = { fuses: 0, keys: 0, erasers: 0 };
    this.projectiles = [];
    this.hintT = 0;
    this.fusesInstalled = 0;
    this.powered = false;
    this.time = 0;
    this.stats = { spotted: 0, notes: 0 };
    this.busy = false;
    this.deathT = -1; this.winT = -1;
    this.glitch = 0; this.danger = 0;
    this.chasers.clear();
    this.input.resetToggles();

    // entities spawn far from the player, preferring hallways
    const [sx, sz] = this.map.cellOf(this.gen.start.x, this.gen.start.z);
    const dist = this.map.bfs(sx, sz);
    const cand = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 10 && this.map.region[i] === 0) cand.push([i % this.map.W, (i / this.map.W) | 0, dist[i]]);
    cand.sort((a, b) => b[2] - a[2]);
    const used = [];
    for (const e of def.entities) {
      let pick = cand.find((c) => used.every((u) => Math.abs(u[0] - c[0]) + Math.abs(u[1] - c[1]) > 6)) || cand[0];
      // shuffle a little so runs differ
      const pool = cand.filter((c) => used.every((u) => Math.abs(u[0] - c[0]) + Math.abs(u[1] - c[1]) > 6)).slice(0, 12);
      if (pool.length) pick = pool[Math.floor(Math.random() * pool.length)];
      used.push(pick);
      this.entities.push(spawnEntity(this, e.type, [pick[0], pick[1]]));
    }
    this.audio.setAmbience(true);
    // warm up shaders now instead of stuttering during play
    this.renderer.compile(this.scene, this.camera);
  }

  unload() {
    for (const e of this.entities) e.remove();
    this.entities = [];
    if (this.levelRoot) {
      this.scene.remove(this.levelRoot);
      this.levelRoot.traverse((o) => { if (o.isInstancedMesh || (o.isMesh && o.geometry.getAttribute('bake'))) o.geometry.dispose(); });
      this.levelRoot = null;
    }
  }

  // ------------------------------------------------------------------ events
  emitNoise(x, z, radius, type) {
    for (const e of this.entities) {
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      let r = radius * this.diff.hearing;
      if (!this.world.los(e.pos.x, e.pos.z, x, z)) r *= 0.55;
      if (d < r) e.onNoise(x, z, 1 - d / r, type);
    }
  }
  alert(x, z, src) {
    this.hud.toast('Jeritan itu memanggil sesuatu…', 2.5);
    for (const e of this.entities) if (e !== src && Math.hypot(e.pos.x - x, e.pos.z - z) < 48) e.onNoise(x, z, 1, 'alert');
  }
  onChaseStart(e) {
    if (!this.chasers.has(e)) { this.chasers.add(e); this.stats.spotted++; this.audio.stinger(); }
  }
  onChaseEnd(e) { this.chasers.delete(e); }

  isSeenByPlayer(e) {
    const p = this.player;
    if (!p.alive) return false;
    const cam = this.camera;
    const v = new THREE.Vector3(e.pos.x, 1.1, e.pos.z);
    const d = cam.position.distanceTo(v);
    if (d > 38) return false;
    // test several points on the body so partially visible counts
    let inView = false;
    for (const y of [0.3, 1.0, 1.6]) {
      v.set(e.pos.x, y, e.pos.z).project(cam);
      if (v.z < 1 && Math.abs(v.x) < 1.02 && Math.abs(v.y) < 1.02) { inView = true; break; }
    }
    if (!inView) return false;
    if (!this.world.los(cam.position.x, cam.position.z, e.pos.x, e.pos.z)) return false;
    if (d < 3.5 || p.nightVision || this.world.isLit(e.pos.x, e.pos.z)) return true;
    if (p.flashlight && p.light.intensity > 2) {
      const f = new THREE.Vector3(); cam.getWorldDirection(f);
      const to = new THREE.Vector3(e.pos.x - cam.position.x, 1.1 - cam.position.y, e.pos.z - cam.position.z).normalize();
      if (f.dot(to) > Math.cos(0.5) && d < 20) return true;
    }
    return false;
  }

  killPlayer(entity, locker = null) {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    this.busy = true;
    this.deathT = 0;
    this.killer = entity;
    if (locker) { // dragged out of the locker
      locker.target = -1.6;
      p.hidden = null;
      p.pos.x = locker.x + Math.sin(locker.rot) * 0.9; p.pos.z = locker.z + Math.cos(locker.rot) * 0.9;
    }
    this.audio.jumpscare();
    this.input.resetToggles();
  }

  toggleLocker(L) {
    const p = this.player;
    if (this.busy) return;
    this.busy = true;
    L.target = -1.6;
    this.audio.lockerClang({ x: L.x, y: 1, z: L.z }, 0.35);
    this.emitNoise(L.x, L.z, NOISE.locker, 'locker');
    const entering = !p.hidden;
    setTimeout(() => {
      if (!p.alive) { this.busy = false; return; }
      if (entering) {
        L.viewYaw = L.rot + Math.PI;
        L.camX = L.x + Math.sin(L.rot) * 0.34; L.camZ = L.z + Math.cos(L.rot) * 0.34;
        p.hidden = L; p.crouched = false;
        p.yaw = L.viewYaw; p.pitch = 0;
        p.flashlight = false;
        this.hud.toast(this.input.touch ? 'Tahan tombol NAPAS saat ada yang mendekat' : 'Tahan SPASI untuk menahan napas', 2.5);
      } else {
        p.hidden = null;
        p.pos.x = L.x + Math.sin(L.rot) * 0.85; p.pos.z = L.z + Math.cos(L.rot) * 0.85;
        p.yaw = L.rot + Math.PI;
      }
      L.target = 0;
      setTimeout(() => { this.busy = false; this.audio.lockerClang({ x: L.x, y: 1, z: L.z }, 0.25); }, 250);
    }, 330);
  }

  pickup(it) {
    const p = this.player;
    if (it.type === 'note') {
      this.readNote(it);
      return;
    }
    if (it.type === 'eraser' && p.inventory.erasers >= 3) { this.hud.toast('Tanganmu sudah penuh (maks. 3 penghapus)'); return; }
    it.taken = true;
    it.obj.visible = false;
    this.audio.pickup();
    this.emitNoise(p.pos.x, p.pos.z, NOISE.pickup, 'pickup');
    if (it.type === 'fuse') {
      p.inventory.fuses++;
      const total = p.inventory.fuses + this.fusesInstalled;
      this.hud.toast(`Sekring ditemukan (${total}/${this.def.fuses})` + (total >= this.def.fuses ? ' — bawa ke kotak panel' : ''));
    } else if (it.type === 'key') { p.inventory.keys++; this.hud.toast('Kunci ruangan ditemukan'); }
    else if (it.type === 'eraser') {
      p.inventory.erasers++;
      this.hud.toast('Penghapus papan diambil');
      this.hint('eraser', this.input.touch ? 'Tekan LEMPAR untuk melempar penghapus — bunyinya memancing Petugas ke sana.' : 'Tekan G / klik kanan untuk melempar penghapus — bunyinya memancing Petugas ke sana.', 5);
    }
    else if (it.type === 'battery') { p.battery = Math.min(100, p.battery + 45); this.hud.toast('Baterai kamera +45%'); }
  }

  readNote(it) {
    const list = NOTES[this.def.id] || [];
    const n = list[it.note % list.length];
    if (!it.read) { it.read = true; this.stats.notes++; }
    this.audio.pickup();
    this.ui.showNote(n.title, n.body);
  }

  useFusebox() {
    const p = this.player;
    if (this.powered) return;
    if (p.inventory.fuses <= 0) { this.hud.toast(`Butuh ${this.def.fuses - this.fusesInstalled} sekring lagi`); return; }
    this.fusesInstalled += p.inventory.fuses;
    p.inventory.fuses = 0;
    const fb = this.gen.fusebox;
    this.audio.fuseInsert({ x: fb.x, y: 1.4, z: fb.z });
    this.emitNoise(fb.x, fb.z, NOISE.fuse, 'fuse');
    // show physical fuses seated in the panel sockets
    const fuseObj = this.built.fuseObj;
    for (let i = 1; i <= 3; i++) {
      const slot = fuseObj.getObjectByName('Slot' + i);
      if (!slot || slot.userData.filled || i > Math.ceil(this.fusesInstalled * 3 / this.def.fuses)) continue;
      const f = cloneWithBake(this.assets.models.item_fuse, [0.6, 0]);
      slot.add(f); slot.userData.filled = true;
    }
    const frac = this.fusesInstalled / this.def.fuses;
    this.built.lamps.forEach((l, i) => { if (frac >= (i + 1) / this.built.lamps.length - 1e-6) l.material.emissive.set(0x22ff55); });
    if (this.fusesInstalled >= this.def.fuses) {
      this.powered = true;
      this.audio.powerUp();
      this.hud.toast('Listrik menyala! Pintu darurat terbuka.', 3.5);
      // alarm: every entity converges on the panel
      setTimeout(() => this.emitNoise(fb.x, fb.z, 40, 'alert'), 1500);
      const sign = [];
      this.built.exitObj.traverse((o) => { if (o.isMesh && o.material.userData.emissive) sign.push(o); });
      for (const s of sign) s.material.emissiveIntensity = 2.2;
    } else this.hud.toast(`Sekring terpasang (${this.fusesInstalled}/${this.def.fuses})`);
  }

  tryExit() {
    if (!this.powered) { this.audio.doorLocked(this.gen.exit); this.hud.toast('Tidak ada listrik. Pasang semua sekring di kotak panel.'); return; }
    if (this.busy) return;
    this.busy = true;
    this.winT = 0;
    this.audio.doorCreak({ x: this.gen.exit.x, y: 1.2, z: this.gen.exit.z }, true);
    this.audio.setAmbience(false);
  }

  // ------------------------------------------------------------------ loop
  update(dt) {
    const input = this.input, p = this.player;
    if (this.state !== 'playing') { input.endFrame(); return; }
    this.time += dt;

    if (input.consume('pause')) { this.ui.pause(); input.endFrame(); return; }
    if (input.consume('objectives')) this.hud.showObjectives(this.objectiveText());

    p.update(dt, input, this.world, this);
    if (input.consume('throw')) this.throwEraser();
    this.updateProjectiles(dt);
    this.updateHints(dt);
    this.adaptResolution(dt);
    this.interactor.update();
    if (input.consume('interact') && !this.busy && p.alive) this.interactor.activate();

    for (const e of this.entities) e.update(dt);
    this.doorSys.update(dt);
    for (const L of this.built.lockers) {
      const tgt = L.target || 0;
      if (Math.abs(L.angle - tgt) > 0.001) L.setDoor(damp(L.angle, tgt, 14, dt));
    }
    // item idle motion
    for (const it of this.built.items) if (!it.taken && (it.type === 'fuse' || it.type === 'key' || it.type === 'battery')) it.obj.rotation.y += dt * 0.6;

    // flicker + danger
    this.flickerT -= dt;
    if (this.flickerT <= 0) { this.flickerT = 0.04 + Math.random() * (Math.random() < 0.2 ? 0.5 : 0.12); this.flickerVal = Math.random() < 0.3 ? Math.random() * 0.25 : 0.75 + Math.random() * 0.25; }
    let danger = 0, near = Infinity;
    for (const e of this.entities) {
      if (e.kind === 'pupil') continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      near = Math.min(near, d);
      const los = d < 18 && this.world.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      danger = Math.max(danger, clamp(1 - d / (los ? 16 : 9), 0, 1) * (los ? 1 : 0.6));
    }
    const chase = this.chasers.size > 0 ? 1 : 0;
    danger = Math.max(danger, chase * 0.55);
    this.danger = damp(this.danger, danger, 3, dt);
    p.fear = damp(p.fear, Math.max(this.danger, chase * 0.8), 2, dt);
    const interference = this.danger > 0.45 ? (Math.random() < this.danger * 0.25 ? 0.35 : 1) : 1;
    bakeUniforms.uFlicker.value = this.flickerVal;
    bakeUniforms.uPower.value = damp(bakeUniforms.uPower.value, interference, 20, dt);
    if (this.built.fixtureMats.flicker) this.built.fixtureMats.flicker.emissiveIntensity = this.flickerVal;
    if (this.built.fixtureMats.on) this.built.fixtureMats.on.emissiveIntensity = bakeUniforms.uPower.value;
    bakeUniforms.uNV.value = p.nightVision ? 0.55 : 0;
    this.ambient.intensity = p.nightVision ? 0.4 : 0.05;

    // death sequence
    if (this.deathT >= 0) {
      this.deathT += dt;
      const k = this.killer;
      const hy = k.headNode ? k.headNode.getWorldPosition(new THREE.Vector3()).y : 1.7;
      const dx = k.pos.x - p.camera.position.x, dz = k.pos.z - p.camera.position.z;
      const tYaw = Math.atan2(-dx, -dz);
      const tPitch = Math.atan2(hy - p.camera.position.y, Math.hypot(dx, dz));
      let dy = tYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 14); p.pitch += (tPitch - p.pitch) * Math.min(1, dt * 14);
      p.lookLock = true;
      // pull the entity right into the camera
      const want = 0.75;
      const dist = Math.hypot(dx, dz);
      if (dist > want) { k.pos.x -= (dx / dist) * Math.min(dist - want, dt * 6); k.pos.z -= (dz / dist) * Math.min(dist - want, dt * 6); }
      p.camera.position.x += (Math.random() - 0.5) * 0.04; p.camera.position.y += (Math.random() - 0.5) * 0.04;
      this.glitch = clamp(this.deathT * 0.8, 0, 1);
      if (this.deathT > 1.7 && this.state === 'playing') {
        this.state = 'dead';
        this.audio.setAmbience(false);
        this.ui.showDeath(this.deathCause(k));
      }
    }
    // win sequence
    if (this.winT >= 0) {
      this.winT += dt;
      const ex = this.built.exitObj;
      const a = clamp(this.winT / 1.2, 0, 1) * 1.4;
      const L = ex.getObjectByName('LeafL'), R = ex.getObjectByName('LeafR');
      if (L) L.rotation.y = a; if (R) R.rotation.y = -a;
      this.built.exitGlow.material.color.setScalar(clamp(this.winT, 0, 1));
      this.vhs.uniforms.uWhite.value = clamp((this.winT - 0.8) / 1.6, 0, 1);
      if (this.winT > 2.8 && this.state === 'playing') { this.state = 'won'; this.ui.showWin(); }
    } else this.vhs.uniforms.uWhite.value = 0;

    this.audio.updateListener(this.camera);
    this.audio.update(dt, p.fear, chase, p.pos);
    this.hud.update(dt, this);
    input.endFrame();
  }

  render(t) {
    const u = this.vhs.uniforms;
    u.uDanger.value = this.state === 'playing' ? this.danger : 0;
    u.uNV.value = this.player.nightVision ? 1 : 0;
    u.uGlitch.value = this.glitch;
    u.uBattery.value = this.player.battery / 100;
    this.vhs.render(this.scene, this.camera, t);
  }

  // ---------------------------------------------------------------- throwing
  throwEraser() {
    const p = this.player;
    if (p.hidden || !p.alive || this.busy) return;
    if (p.inventory.erasers <= 0) { this.hud.toast('Tidak ada yang bisa dilempar'); return; }
    p.inventory.erasers--;
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
    const obj = cloneWithBake(this.assets.models.item_eraser, [0.5, 0], 0.25);
    obj.position.copy(this.camera.position).addScaledVector(f, 0.35);
    this.levelRoot.add(obj);
    const vel = f.clone().multiplyScalar(10).add(new THREE.Vector3(0, 2.4, 0));
    this.projectiles.push({ obj, vel, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 8, Math.random() * 12), hit: false });
    this.audio.click();
  }
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i], o = pr.obj, v = pr.vel;
      v.y -= 9.8 * dt;
      let nx = o.position.x + v.x * dt, ny = o.position.y + v.y * dt, nz = o.position.z + v.z * dt;
      const impact = () => {
        if (pr.hit) return;
        pr.hit = true;
        this.audio.clack({ x: o.position.x, y: o.position.y, z: o.position.z });
        this.emitNoise(o.position.x, o.position.z, NOISE.throw, 'throw');
      };
      if (!this.world.los(o.position.x, o.position.z, nx, nz)) { v.x *= -0.25; v.z *= -0.25; nx = o.position.x; nz = o.position.z; impact(); }
      if (ny > 2.9) { v.y = -Math.abs(v.y) * 0.3; ny = 2.9; }
      if (ny <= 0.016) {
        ny = 0.016; impact();
        o.position.set(nx, ny, nz);
        o.rotation.set(0, o.rotation.y, 0);
        this.projectiles.splice(i, 1);
        this.built.items.push({ type: 'eraser', x: nx, y: 0, z: nz, obj: o, taken: false });
        continue;
      }
      o.position.set(nx, ny, nz);
      o.rotation.x += pr.spin.x * dt; o.rotation.y += pr.spin.y * dt; o.rotation.z += pr.spin.z * dt;
    }
  }

  // ---------------------------------------------------------------- subtitles
  onCue(kind, pos) {
    if (!this.settings.subs || this.state !== 'playing' || !CUES[kind]) return;
    const p = this.player;
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 32) return;
    if ((kind === 'door' || kind === 'locker') && d < 3) return; // the player's own actions
    const now = this.time;
    if ((this.cueCd[kind] || 0) > now) return;
    this.cueCd[kind] = now + (kind === 'step' ? 4 : 2.5);
    const rel = angleDiff(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)), Math.atan2(dx, dz));
    const dir = Math.abs(rel) < 0.6 ? 'depan' : Math.abs(rel) > 2.4 ? 'belakang' : rel < 0 ? 'kanan' : 'kiri';
    const arrow = { depan: '↑', belakang: '↓', kanan: '→', kiri: '←' }[dir];
    this.hud.caption(`${arrow} [${CUES[kind]}${d < 9 ? ' — dekat' : ''}, ${dir}]`);
  }

  // ---------------------------------------------------------------- hints
  hint(id, text, dur = 5) {
    if (this.hintsSeen.has(id)) return;
    this.hintsSeen.add(id);
    if (this.onHint) this.onHint(id);
    this.hud.toast(text, dur);
  }
  updateHints(dt) {
    const p = this.player, t = this.input.touch;
    this.hintT += dt;
    if (this.hintT > 7) this.hint('start', t ? 'Berjalan pelan lebih senyap daripada LARI. JONGKOK paling senyap.' : 'Berjalan lebih senyap daripada berlari (Shift). Jongkok (C) paling senyap.', 5.5);
    if (this.hintT < 3 || !p.alive) return;
    if (!p.hidden && this.built.lockers.some((L) => Math.hypot(L.x - p.pos.x, L.z - p.pos.z) < 2.2)) this.hint('locker', 'Loker bisa dipakai untuk bersembunyi.', 4);
    if (this.danger > 0.3) this.hint('entity', 'Ada yang berpatroli di dekatmu. Menjauh, atau sembunyi di loker sebelum terlihat.', 5);
    if (p.battery < 60) this.hint('battery', 'Senter & mode malam menguras baterai kamera. Matikan saat tidak perlu.', 5);
    if (!p.hidden && !p.flashlight && !this.world.isLit(p.pos.x, p.pos.z)) this.hint('dark', t ? 'Gelap. Tekan SENTER — tapi cahaya membuatmu lebih mudah terlihat.' : 'Gelap. Tekan F untuk senter — tapi cahaya membuatmu lebih mudah terlihat.', 5);
  }

  // ---------------------------------------------------------------- performance
  adaptResolution(dt) {
    if (!this.vhs.enabled) return;
    this.frameEma += (this.realDt - this.frameEma) * 0.05;
    this.perfT += dt;
    if (this.perfT < 2) return;
    this.perfT = 0;
    let s = this.vhs.scale;
    if (this.frameEma > 1 / 30 && s > 0.45) s -= 0.1;
    else if (this.frameEma < 1 / 52 && s < this.baseScale) s = Math.min(this.baseScale, s + 0.05);
    if (s !== this.vhs.scale) { this.vhs.scale = s; this.resize(); }
  }

  objectiveText() {
    const p = this.player;
    const lines = [`${this.def.code} — ${this.def.name}`];
    if (!this.powered) {
      lines.push(`□ Kumpulkan sekring (${p.inventory.fuses + this.fusesInstalled}/${this.def.fuses})`);
      lines.push(`□ Pasang di kotak panel (${this.fusesInstalled}/${this.def.fuses})`);
    } else lines.push('■ Listrik menyala');
    lines.push(this.powered ? '□ Keluar lewat pintu darurat' : '□ Pintu darurat (terkunci)');
    return lines.join('\n');
  }

  deathCause(k) {
    if (k.kind === 'monitor') return 'Petugas Ketertiban menemukanmu. Ia tidak punya mata — ia mendengar. Berjalanlah, jangan berlari, dan tahan napas di loker.';
    if (k.kind === 'substitute') return 'Kamu berpaling dari Guru Pengganti. Jaga pandanganmu padanya, dan jangan biarkan ia berada dalam gelap.';
    return 'Sesuatu menemukanmu.';
  }
}
