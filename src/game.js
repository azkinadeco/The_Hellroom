import * as THREE from 'three';
import { LEVELS, DIFFICULTY, NOISE, CELL, HIDE } from './config.js';
import { generateLevel } from './level/generator.js';
import { generateBuilding, FH } from './level/building.js';
import { buildLevel, cloneWithBake, buildSlides } from './level/builder.js';
import { bakeUniforms } from './render/bake.js';
import { VHS } from './render/vhs.js';
import { World } from './world.js';
import { Player } from './player.js';
import { DoorSystem, Interactor } from './interact.js';
import { spawnEntity, ENTITY_INFO } from './ai/creatures.js';
import { randomReachableCell } from './ai/path.js';
import { Anomalies } from './anomalies.js';
import { NOTES, TAPES, PA_LINES } from './story.js';
import { clamp, damp, angleDiff } from './util/rng.js';

const CUES = {
  whistle: 'Peluit melengking', step: 'Langkah berat', scrape: 'Gesekan seperti batu', scream: 'Jeritan anak',
  announce: 'Suara dari corong pengeras suara', door: 'Pintu berderit', bell: 'Bel sekolah berbunyi', chalk: 'Kapur berderit di papan', locker: 'Dentang loker', slam: 'Pintu dibanting',
  hiss: 'Desisan panjang', ruler: 'Penggaris besi diketuk', chorus: 'Jeritan banyak mulut', bones: 'Gemeretak tulang',
  whisper: 'Bisikan dari kegelapan', squelch: 'Bunyi daging basah',
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
    this.clear = s.screen === 'clear';
    // clear HD: sharper image (full resolution) and none of the broken-tape effects
    this.baseScale = this.clear ? (high ? 1 : 0.9) : (high ? 1 : 0.7) * (this.input.touch ? 0.8 : 1);
    this.vhs.scale = this.baseScale;
    this.vhs.enabled = true;
    this.vhs.uniforms.uClean.value = this.clear ? 1 : 0;
    document.body.classList.toggle('clear-screen', this.clear);
    this.input.sensitivity = s.sens;
    this.input.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.vhs.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ level
  loadLevel(index, difficulty, defOverride = null) {
    this.unload();
    const def = this.def = defOverride || LEVELS[index];
    this.levelIndex = index;
    this.diffKey = difficulty;
    this.diff = DIFFICULTY[difficulty];
    const scaled = { ...def, batteries: Math.max(1, Math.round(def.batteries * this.diff.batteries)) };
    // a level is a stack of floors; single-floor levels are a stack of one
    let gens, start, startFloor = 0;
    if (def.layout) {
      const B = this.bgen = generateBuilding(scaled);
      gens = B.floors; start = B.start; startFloor = B.startFloor;
    } else {
      this.bgen = null;
      const g = generateLevel(scaled);
      gens = [g]; start = { ...g.start };
    }
    this.floors = gens.map((gen, k) => {
      const built = buildLevel(gen, this.assets, def, { FH, k });
      this.scene.add(built.root);
      const world = new World(gen, built);
      // distance (in cells) to the nearest open space: far from any atrium the
      // other floors cannot be seen and are not drawn
      const W = gen.map.W, H = gen.map.H, near = new Uint8Array(W * H).fill(255);
      const oa = gen.openAbove || [], nf = gen.noFloor || [];
      for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
        const i = x + z * W;
        if (gen.map.region[i] !== -2 && !oa[i] && !nf[i]) continue;
        for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dz)), j = nx + nz * W;
          if (d < near[j]) near[j] = d;
        }
      }
      return { k, gen, built, world, map: gen.map, field: built.field, doorSys: new DoorSystem(this, built.doors), near };
    });
    this.exitFloor = this.floors.find((f) => f.gen.exit) || this.floors[0];
    this.fuseFloor = this.floors.find((f) => f.gen.fusebox) || this.floors[0];
    this.stairs = this.bgen ? this.bgen.stairs : [];
    this.slides = this.bgen ? this.bgen.slides : [];
    // slides live in absolute coordinates, i.e. in floor 0's group
    if (this.slides.length) buildSlides(this.slides, this.floors[0].built.root, (x, y, z) => {
      for (let k = Math.min(this.floors.length - 1, Math.floor((y - 0.3) / FH)); k >= 0; k--) {
        const m = this.floors[k].map, [cx, cz] = m.cellOf(x, z), r = m.reg(cx, cz);
        if (r >= 0 && !(this.floors[k].gen.noFloor || [])[cx + cz * m.W]) return k * FH;
      }
      return 0;
    });
    this.setFloor(startFloor);
    this.interactor = new Interactor(this);
    this.anomalies = new Anomalies(this);
    this.scene.fog = new THREE.FogExp2(0x070806, def.fog);
    this.scene.background = new THREE.Color(0x070806);
    this.start = start;

    const p = this.player;
    p.spawn(start.x, start.z, start.yaw);
    p.battery = 100; p.flashlight = false; p.nightVision = false;
    p.water = this.gen.water; p.y = 0;
    this.audio.setTheme(def.theme || null); this.themeT = 0;
    this.camera.fov = 72; this.camera.updateProjectionMatrix();
    p.inventory = { fuses: 0, keys: 0, erasers: 0 };
    this.projectiles = [];
    this.hintT = 0;
    this.timers = [];
    this.paT = 55 + Math.random() * 35;
    this.blackoutT = 0;
    this.fusesInstalled = 0;
    this.powered = false;
    this.time = 0;
    this.stats = { spotted: 0, notes: 0 };
    this.busy = false;
    this.deathT = -1; this.winT = -1;
    this.glitch = 0; this.danger = 0; this.gazeFx = 0; this.deathRoll = 0; this.deathDrop = 0;
    this.vhs.uniforms.uFade.value = 0;
    this.chasers.clear();
    this.lockerReason = null;
    this.liftRide = null; this.slideRide = null; p.locked = false; this.liftDir = 1;
    this.met = this.met || new Set();
    this.input.resetToggles();

    // entities spawn far from the player, preferring hallways
    const [sx, sz] = this.map.cellOf(start.x, start.z);
    const dist = this.map.bfs(sx, sz);
    const cand = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 10 && this.map.region[i] === 0) cand.push([i % this.map.W, (i / this.map.W) | 0, dist[i]]);
    if (!cand.length) for (let i = 0; i < dist.length; i++) if (dist[i] >= 6) cand.push([i % this.map.W, (i / this.map.W) | 0, dist[i]]);
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
    for (const f of this.floors || []) {
      this.scene.remove(f.built.root);
      f.built.root.traverse((o) => { if (o.isInstancedMesh || (o.isMesh && o.geometry.getAttribute('bake'))) o.geometry.dispose(); });
    }
    this.floors = []; this.levelRoot = null;
  }

  // ------------------------------------------------------------------ floors
  // The floor the player is on always sits at y = 0 so every system keeps
  // working in floor-local coordinates; the other floors are moved round it.
  setFloor(k) {
    const f = this.floors[k];
    this.floorK = k;
    if (this.player) this.player.water = f.gen.water;
    this.gen = f.gen; this.map = f.map; this.built = f.built; this.world = f.world; this.field = f.field; this.doorSys = f.doorSys;
    this.levelRoot = f.built.root;
    for (const o of this.floors) {
      o.built.root.position.y = (o.k - k) * FH;
      o.built.root.updateMatrixWorld(true);
    }
    this.floorVis();
  }
  floorVis() {
    const k = this.floorK, f = this.floors[k], p = this.player;
    const [cx, cz] = f.map.cellOf(p.pos.x, p.pos.z);
    const d = f.map.inside(cx, cz) ? f.near[cx + cz * f.map.W] : 255;
    const open = this.def && this.def.seeAll && d <= (this.def.seeNear ?? 5);
    for (const o of this.floors) o.built.root.visible = o.k === k || (Math.abs(o.k - k) <= 1 && d <= 6) || open || !!this.slideRide;
  }
  // height of the walkable surface at (x, z) on the current floor
  groundY(x, z) {
    for (const s of this.stairs) {
      if (this.floorK !== s.k && this.floorK !== s.k + 1) continue;
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      const L = s.len * CELL;
      const t = s.d.dx > 0 ? (x - s.minX) / L : s.d.dx < 0 ? (s.maxX - x) / L : s.d.dz > 0 ? (z - s.minZ) / L : (s.maxZ - z) / L;
      return clamp(t, 0, 1) * FH - (this.floorK - s.k) * FH;
    }
    return 0;
  }
  // called by the player after moving: climb, and cross to the next floor halfway up
  verticalStep(p) {
    if (!this.stairs.length) { p.y = 0; return; }
    p.y = this.groundY(p.pos.x, p.pos.z);
    for (const s of this.stairs) {
      if (p.pos.x < s.minX || p.pos.x > s.maxX || p.pos.z < s.minZ || p.pos.z > s.maxZ) continue;
      if (this.floorK === s.k && p.y > FH / 2) { this.changeFloor(s.k + 1, { cell: s.cells[s.len - 1], stair: s }); p.y -= FH; }
      else if (this.floorK === s.k + 1 && p.y < -FH / 2) { this.changeFloor(s.k, { cell: s.cells[0], stair: s }); p.y += FH; }
      break;
    }
  }
  changeFloor(k, via = {}) {
    if (k === this.floorK || !this.floors[k]) return;
    const prev = this.floorK;
    this.setFloor(k);
    this.hud.caption(`Lantai ${k + 1}`, 1.6);
    // the resident does not stay behind: a hunter follows up the same stairs,
    // anything else turns up somewhere else on the new floor
    const kinds = this.entities.map((e) => ({ kind: e.kind, chasing: this.chasers.has(e) }));
    for (const e of this.entities) { e.remove(); this.onChaseEnd(e); }
    this.entities = [];
    for (const { kind, chasing } of kinds) {
      if (chasing && via.cell) {
        const at = this.time + 2.2 + Math.random() * 1.5, token = (this.floorToken = (this.floorToken || 0) + 1);
        this.schedule(2.2 + Math.random() * 1.5, () => {
          if (this.floorK !== k || token !== this.floorToken || !this.player.alive) { this.spawnFar(kind); return; }
          const e = spawnEntity(this, kind, via.cell);
          this.entities.push(e);
          e.onNoise(this.player.pos.x, this.player.pos.z, 1, 'alert');
          this.audio.stinger();
        });
        void at;
      } else this.spawnFar(kind);
    }
    void prev;
  }
  // ---------------------------------------------------------------- lifts
  liftDef(L) { return this.bgen && this.bgen.lifts.find((q) => q.x === L.x && q.z === L.z); }
  liftTarget(L) {
    const B = this.liftDef(L);
    if (!B) return null;
    let dir = this.liftDir || 1;
    if (!B.floors.includes(this.floorK + dir)) dir = -dir;
    if (!B.floors.includes(this.floorK + dir)) return null;
    this.liftDir = dir;
    return this.floorK + dir;
  }
  rideLift(L) {
    const target = this.liftTarget(L);
    if (target === null || this.liftRide) return;
    // now and then the lift has its own idea of where to go
    const B = this.liftDef(L);
    let to = target;
    if (Math.random() < 0.22) { const alt = B.floors.filter((k) => k !== this.floorK && k !== target); if (alt.length) to = alt[Math.floor(Math.random() * alt.length)]; }
    const p = this.player;
    this.busy = true; p.locked = true; p.crouched = false;
    p.pos.x = L.cx - L.d.dx * 0.3; p.pos.z = L.cz - L.d.dz * 0.3;
    this.liftRide = { L, to, asked: target, t: 0, switched: false };
    this.audio.liftDoors();
    for (const e of this.entities) this.onChaseEnd(e);
  }
  updateLift(dt) {
    const R = this.liftRide;
    if (!R) return;
    R.t += dt;
    const p = this.player;
    if (!R.switched) {
      R.L.set(clamp(1 - R.t / 0.8, 0, 1));
      if (R.t > 0.8 && !R.hum) { R.hum = true; this.audio.liftHum(2.6); }
      if (R.t > 0.9) { p.camera.position.y += Math.sin(R.t * 55) * 0.006; this.flickerVal = Math.random() < 0.1 ? 0.3 : 1; }
      if (R.t > 3.4) {
        R.switched = true;
        this.changeFloor(R.to, {});
        R.L2 = (this.built.lifts || []).find((q) => q.x === R.L.x && q.z === R.L.z) || R.L;
        R.L2.set(0);
        this.audio.liftDing();
        if (R.to !== R.asked) this.schedule(0.6, () => this.hud.caption(`…lift berhenti di Lantai ${R.to + 1}. Kamu menekan ${R.asked + 1}.`, 3.5));
        R.t2 = 0;
      }
    } else {
      R.t2 += dt;
      if (R.t2 > 0.5 && !R.doors) { R.doors = true; this.audio.liftDoors(); }
      R.L2.set(clamp((R.t2 - 0.5) / 0.8, 0, 1));
      if (R.t2 > 1.35) { this.liftRide = null; this.busy = false; p.locked = false; }
    }
  }
  // ---------------------------------------------------------------- slides
  rideSlide(S) {
    if (this.slideRide || this.busy) return;
    const p = this.player;
    this.busy = true; p.locked = true; p.crouched = false;
    this.slideRide = { S, u: 0, v: 2.5 };
    for (const e of this.entities) this.onChaseEnd(e);
    this.audio.whoosh(Math.min(6, S.length / 8));
    this.emitNoise(p.pos.x, p.pos.z, 10, 'step');
  }
  updateSlide(dt) {
    const R = this.slideRide;
    if (!R) return;
    const S = R.S, c = S.curve, p = this.player, cam = this.camera;
    const T = c.getTangentAt(Math.min(R.u, 1));
    R.v = Math.min(13, R.v + dt * (2 + Math.max(0, -T.y) * 14));
    R.u += (R.v * dt) / S.length;
    const u = Math.min(R.u, 1), P = c.getPointAt(u);
    const base = this.floorK * FH;
    cam.position.set(P.x, P.y - base + 0.95, P.z);
    const look = c.getPointAt(Math.min(1, u + 3 / S.length));
    cam.lookAt(look.x, look.y - base + 0.75, look.z);
    p.pos.x = P.x; p.pos.z = P.z;
    if (R.u >= 1) {
      this.slideRide = null;
      if (S.to !== this.floorK) this.changeFloor(S.to, {});
      p.pos.set(S.end[0], 0, S.end[2]); p.y = 0;
      p.yaw = Math.atan2(-T.x, -T.z); p.pitch = -0.25;
      p.locked = false; this.busy = false;
      this.audio.splash(1.3);
      this.emitNoise(p.pos.x, p.pos.z, 22, 'step');
      this.glitch = this.clear ? 0 : 0.25;
      this.hud.toast('BYUR! Suaranya menggema di seluruh kolam.', 2.5);
    }
  }
  spawnFar(kind) {
    const [px, pz] = this.map.cellOf(this.player.pos.x, this.player.pos.z);
    const c = randomReachableCell(this.map, Math.random, px, pz, 9, 40) || randomReachableCell(this.map, Math.random, px, pz, 4, 60);
    if (c) this.entities.push(spawnEntity(this, kind, c));
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

  surfaceAt(x, z) {
    const th = this.def.theme;
    if (th === 'backroom') return 'carpet';
    if (th === 'pool' || th === 'mall') return 'tile';
    const [cx, cz] = this.map.cellOf(x, z);
    const r = this.map.reg(cx, cz);
    if (r <= 0) return 'tile';
    const room = this.gen.rooms.find((q) => q.id === r);
    if (room && room.type === 'forest') return 'carpet';
    if (this.def.layout === 'hospital' || (room && ['restroom', 'lapangan', 'stairs', 'lift'].includes(room.type))) return 'tile';
    return 'wood';
  }

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
    if (!p.alive || this.liftRide || this.slideRide) return;
    // inside (or climbing into) a hiding spot only a resident that pulls the door open can get you
    if ((p.hidden || p.entering) && !locker) {
      entity.state = entity.kind === 'shade' ? 'lurk' : entity.kind === 'eyes' ? 'watch' : 'patrol';
      entity.waitT = 1.5; entity.path = null;
      // a hunter that lost you at the door checks the hiding spot instead (hold your breath!)
      if (p.hidden && entity.targetLocker) entity.targetLocker(p.hidden, false);
      return;
    }
    if (this.godMode) { // test rooms: shrug the hit off and throw the resident back
      this.hud.toast(`Mode kebal: serangan ${(ENTITY_INFO[entity.kind] || {}).name || ''} diabaikan`, 2);
      this.audio.stinger();
      const [cx, cz] = entity.cell();
      const t = randomReachableCell(this.map, Math.random, cx, cz, 6, 12);
      if (t && entity.kind !== 'eyes') { const [x, z] = this.map.center(...t); entity.pos.set(x, 0, z); }
      entity.state = entity.kind === 'eyes' ? 'watch' : entity.kind === 'shade' ? 'lurk' : 'patrol';
      entity.path = null; entity.gaze = 0; entity.calmT = 5; entity.suspicion = 0; entity.waitT = 3;
      if (entity.kind === 'substitute' || entity.kind === 'gaper') { entity.aware = false; entity.target = null; }
      if (locker) this.toggleLocker(locker);
      this.onChaseEnd(entity);
      return;
    }
    p.alive = false;
    this.busy = true;
    this.deathT = 0;
    this.killer = entity;
    if (locker) { // dragged out of the locker
      const h = HIDE[locker.kind || 'locker'];
      locker.target = h.open;
      p.hidden = null;
      p.pos.x = locker.x + Math.sin(locker.rot) * h.exit; p.pos.z = locker.z + Math.cos(locker.rot) * h.exit;
    }
    this.audio.jumpscare();
    this.audio.sting(entity.kind, entity.pos);
    this.ui.scare && this.ui.scare(this.clear);
    this.input.resetToggles();
  }

  toggleLocker(L) {
    const p = this.player;
    if (this.busy) return;
    this.busy = true;
    const h = HIDE[L.kind || 'locker'];
    L.target = h.open;
    this.audio.lockerClang({ x: L.x, y: 1, z: L.z }, 0.35);
    this.emitNoise(L.x, L.z, NOISE.locker, 'locker');
    const entering = !p.hidden;
    if (entering) p.entering = true;
    setTimeout(() => {
      p.entering = false;
      if (!p.alive) { this.busy = false; return; }
      if (entering) {
        L.viewYaw = L.rot + Math.PI;
        L.camX = L.x + Math.sin(L.rot) * h.cam; L.camZ = L.z + Math.cos(L.rot) * h.cam;
        p.hidden = L; p.crouched = false; p.hideT = this.time;
        p.yaw = L.viewYaw; p.pitch = 0;
        p.flashlight = false;
        this.hud.toast(this.input.touch ? 'Tahan tombol NAPAS saat ada yang mendekat' : 'Tahan SPASI untuk menahan napas', 2.5);
      } else {
        p.hidden = null;
        p.pos.x = L.x + Math.sin(L.rot) * h.exit; p.pos.z = L.z + Math.cos(L.rot) * h.exit;
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
    if (it.type === 'tape') {
      it.taken = true; it.obj.visible = false;
      this.stats.tape = true;
      const tp = TAPES[this.def.id];
      if (this.onTape) this.onTape(this.def.id);
      this.audio.pickup();
      if (tp) this.ui.showNote(tp.title, tp.body);
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
      if (this.hintsSeen.has('eraser')) this.hud.toast('Penghapus papan diambil');
      this.hint('eraser', this.input.touch ? 'Tekan LEMPAR untuk melempar penghapus — bunyinya memancing Petugas ke sana.' : 'Tekan G / klik kanan untuk melempar penghapus — bunyinya memancing Petugas ke sana.', 5);
    }
    else if (it.type === 'battery') { p.battery = Math.min(100, p.battery + 45); this.hud.toast('Baterai kamera +45%'); }
  }

  readNote(it) {
    const list = NOTES[this.def.id] || Object.values(NOTES).flat();
    const idx = this.def.endless ? (it.note + this.def.floor * 2) % list.length : it.note % list.length;
    const n = list[idx];
    if (!it.read) { it.read = true; this.stats.notes++; if (!this.def.endless && this.onNoteRead) this.onNoteRead(this.def.id + ':' + idx); }
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
      this.exitFloor.built.exitObj.traverse((o) => { if (o.isMesh && o.material.userData.emissive) sign.push(o); });
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
    this.runTimers();
    this.updatePA(dt);

    if (input.consume('pause')) { this.ui.pause(); input.endFrame(); return; }
    if (input.consume('objectives')) this.hud.showObjectives(this.objectiveText());

    // camcorder zoom: narrower FOV, slower look, small battery cost
    const zoom = input.zooming() && p.alive && p.battery > 0;
    const fov = damp(this.camera.fov, zoom ? 26 : 72, 8, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    p.lookScale = fov / 72;
    p.zooming = zoom;
    if (zoom) p.battery = Math.max(0, p.battery - 0.15 * dt);
    p.update(dt, input, this.world, this);
    if (input.consume('throw')) this.throwEraser();
    this.updateProjectiles(dt);
    this.updateHints(dt);
    this.cullChunks(dt);
    this.adaptResolution(dt);
    this.interactor.update();
    if (input.consume('interact') && !this.busy && p.alive) this.interactor.activate();

    this.updateLift(dt);
    this.updateSlide(dt);
    if (!this.liftRide && !this.slideRide) for (const e of this.entities) e.update(dt);
    this.anomalies.update(dt);
    // first sighting unlocks the resident's archive entry
    this.metT = (this.metT || 0) - dt;
    if (this.metT <= 0 && p.alive) {
      this.metT = 0.4;
      for (const e of this.entities) {
        if (this.met.has(e.kind) || e.distTo(p.pos) > 22 || !this.isSeenByPlayer(e)) continue;
        this.met.add(e.kind);
        if (this.onMeet && this.onMeet(e.kind)) this.hud.caption(`📁 Arsip Penghuni baru: ${(ENTITY_INFO[e.kind] || {}).name}`, 3);
      }
    }
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
    let interference = this.danger > 0.45 && !this.clear ? (Math.random() < this.danger * 0.25 ? 0.35 : 1) : 1;
    this.world.blackout = this.blackoutT > 0;
    if (this.blackoutT > 0) { this.blackoutT -= dt; interference = this.blackoutT < 0.6 || Math.random() < 0.02 ? 0.6 : 0.1; }
    bakeUniforms.uFlicker.value = this.flickerVal;
    bakeUniforms.uPower.value = damp(bakeUniforms.uPower.value, interference, 20, dt);
    for (const f of this.floors) {
      const fm = f.built.fixtureMats;
      if (fm.flicker) fm.flicker.emissiveIntensity = this.flickerVal;
      if (fm.on) fm.on.emissiveIntensity = bakeUniforms.uPower.value;
    }
    bakeUniforms.uNV.value = p.nightVision ? 0.55 : 0;
    this.themeT -= dt;
    if (this.themeT <= 0) {
      if (this.def.theme === 'pool') { this.themeT = 0.8 + Math.random() * 3; this.audio.drip(); }
      else if (this.def.theme === 'mall') { this.themeT = 4.5; this.audio.mallChord(); }
      else this.themeT = 99;
    }
    // pool water: drifting caustics, dims with the lights
    if (this.built.waterMat) {
      const m = this.built.waterMat.map; m.offset.x = (this.time * 0.021) % 1; m.offset.y = (Math.sin(this.time * 0.3) * 0.03 + this.time * 0.012) % 1;
      const k = 0.15 + 0.85 * bakeUniforms.uPower.value * (this.world.blackout ? 0.15 : 1) + (p.nightVision ? 0.4 : 0);
      for (const pm of this.built.poolMats) pm.color.copy(pm.userData.base).multiplyScalar(Math.min(1.2, k));
    }
    this.ambient.intensity = p.nightVision ? 0.4 : 0.05;

    // death sequence: snap to the resident's face, FOV punch, fall, cut to static
    if (this.deathT >= 0) {
      this.deathT += dt;
      const k = this.killer, T = this.deathT;
      const head = k.headNode ? k.headNode.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(k.pos.x, 1.7, k.pos.z);
      const dx = k.pos.x - p.camera.position.x, dz = k.pos.z - p.camera.position.z;
      const dist = Math.hypot(dx, dz);
      // pull it right up to the lens and make it face us
      const want = k.kind === 'centipede' ? 1.0 : k.kind === 'eyes' ? 0.9 : 0.62;
      if (dist > want) { const step = Math.min(dist - want, dt * (T < 0.25 ? 14 : 5)); k.pos.x -= (dx / dist) * step; k.pos.z -= (dz / dist) * step; }
      k.yaw = Math.atan2(-dx, -dz);
      const hx = head.x - p.camera.position.x, hz = head.z - p.camera.position.z;
      const tYaw = Math.atan2(-hx, -hz);
      const tPitch = Math.atan2(head.y - p.camera.position.y, Math.hypot(hx, hz));
      let dy = tYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const snap = Math.min(1, dt * (T < 0.3 ? 30 : 10));
      p.yaw += dy * snap; p.pitch += (tPitch - p.pitch) * snap;
      p.lookLock = true;
      // lens punch-in, then the camcorder drops
      const fovT = T < 0.12 ? 44 : T < 1.0 ? 50 : 50 + (T - 1.0) * 30;
      this.camera.fov += (fovT - this.camera.fov) * Math.min(1, dt * 18); this.camera.updateProjectionMatrix();
      this.deathRoll = T > 1.0 ? Math.min(1.3, (T - 1.0) * 2.4) : 0;
      this.deathDrop = T > 1.0 ? Math.min(1.1, (T - 1.0) * 2.0) : 0;
      if (!this.clear) { p.camera.position.x += (Math.random() - 0.5) * 0.05 * (T < 1 ? 1 : 0.3); p.camera.position.y += (Math.random() - 0.5) * 0.05 * (T < 1 ? 1 : 0.3); }
      // short tear on impact, a clean look at its face, then the tape breaks up
      this.glitch = this.clear ? 0 : T < 0.08 ? 0.7 : T < 1.0 ? 0.04 : clamp((T - 1.0) * 1.2, 0, 1);
      this.vhs.uniforms.uFade.value = clamp((T - 1.35) / 0.35, 0, 1);
      if (T > 1.75 && this.state === 'playing') {
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
    if (this.deathT >= 0 && this.deathRoll) {
      this.camera.rotation.z += this.deathRoll * 0.9;
      this.camera.position.y -= this.deathDrop;
    }
    u.uDanger.value = this.state === 'playing' ? (this.deathT >= 0 && this.deathT < 1 ? 0.15 : this.danger) : 0;
    u.uNV.value = this.player.nightVision ? 1 : 0;
    u.uGlitch.value = Math.max(this.glitch, (this.gazeFx || 0) * 0.3);
    u.uBattery.value = this.player.battery / 100;
    this.vhs.render(this.scene, this.camera, t);
  }

  // ---------------------------------------------------------------- timers & PA
  schedule(delay, fn) { this.timers.push({ at: this.time + delay, fn }); }
  runTimers() {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.time) { const t = this.timers.splice(i, 1)[0]; t.fn(); }
    }
  }
  updatePA(dt) {
    if (!this.player.alive || this.winT >= 0) return;
    this.paT -= dt;
    if (this.paT > 0) return;
    this.paT = 75 + Math.random() * 60;
    const early = this.def.id === 1;
    const r = Math.random();
    const kind = r < (early ? 0.6 : 0.4) ? 'flavor' : (early || r < 0.72) ? 'locate' : 'blackout';
    const lines = PA_LINES[kind];
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.audio.paChime();
    this.schedule(1.3, () => {
      this.audio.paVoice(2.8);
      this.hud.toast('📢 "' + line + '"', 5);
    });
    if (kind === 'locate') {
      this.schedule(4.5, () => {
        if (!this.player.alive || this.player.hidden) return; // hiding fools the cameras
        const p = this.player.pos;
        const fx = p.x + (Math.random() - 0.5) * 8, fz = p.z + (Math.random() - 0.5) * 8;
        for (const e of this.entities) e.onNoise(fx, fz, 1, 'alert');
      });
    } else if (kind === 'blackout') {
      this.schedule(4.2, () => { this.blackoutT = 14; this.audio.doorSlam({ x: this.player.pos.x + 10, y: 2, z: this.player.pos.z }); });
    }
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
    if (this.hintsSeen.has(id) || this.hud.toastT > 0.3) return; // never cover announcements
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
    const first = this.entities[0];
    if (first && this.hintT > 10 && ENTITY_INFO[first.kind] && ENTITY_INFO[first.kind].hint) this.hint('ent_' + first.kind, ENTITY_INFO[first.kind].hint, 6);
    if (this.danger > 0.3) this.hint('entity', 'Ada yang berpatroli di dekatmu. Menjauh, atau sembunyi di loker sebelum terlihat.', 5);
    if (p.battery < 60) this.hint('battery', 'Senter & mode malam menguras baterai kamera. Matikan saat tidak perlu.', 5);
    if (!p.hidden && !p.flashlight && !this.world.isLit(p.pos.x, p.pos.z)) this.hint('dark', t ? 'Gelap. Tekan SENTER — tapi cahaya membuatmu lebih mudah terlihat.' : 'Gelap. Tekan F untuk senter — tapi cahaya membuatmu lebih mudah terlihat.', 5);
  }

  // ---------------------------------------------------------------- performance
  // hide instanced chunks the fog would swallow anyway
  cullChunks(dt) {
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT > 0) return;
    this.cullT = 0.2;
    if (this.floors.length > 1) this.floorVis();
    const c = this.camera.position, far = this.player.nightVision ? 40 : 34;
    for (const m of this.floors.flatMap((f) => (f.built.root.visible ? f.built.chunked : []))) {
      const b = m.userData.chunk;
      const dx = Math.max(b.minX - c.x, 0, c.x - b.maxX), dz = Math.max(b.minZ - c.z, 0, c.z - b.maxZ);
      m.visible = dx * dx + dz * dz < far * far;
    }
    // doors are separate animated objects: skip the ones the fog has eaten
    for (const f of this.floors) {
      const show = f.built.root.visible;
      for (const d of f.built.doors) if (d.obj) d.obj.visible = show && (d.x - c.x) ** 2 + (d.z - c.z) ** 2 < far * far;
    }
  }
  adaptResolution(dt) {
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
    const why = this.lockerReason; this.lockerReason = null;
    if (why === 'seen') return `${(ENTITY_INFO[k.kind] || {}).name || 'Penghuni'} melihatmu masuk ke ${k.lockerTarget && k.lockerTarget.kind === 'stall' ? 'bilik' : 'loker'}. Bersembunyilah saat tidak sedang terlihat.`;
    if (why === 'breath') return `${(ENTITY_INFO[k.kind] || {}).name || 'Penghuni'} mendengar napasmu. Saat ada yang mendekati tempat persembunyianmu, tahan napas (${this.input.touch ? 'tombol NAPAS' : 'SPASI'}) sampai langkahnya pergi.`;
    if (this.blackoutT > 0 && (k.kind === 'substitute' || k.kind === 'gaper')) return `Lampu padam, dan dalam gelap ${ENTITY_INFO[k.kind].name} bebas bergerak. Nyalakan senter saat listrik mati.`;
    return (ENTITY_INFO[k.kind] && ENTITY_INFO[k.kind].death) || 'Sesuatu menemukanmu.';
  }
}
