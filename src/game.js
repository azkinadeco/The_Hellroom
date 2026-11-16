import * as THREE from 'three';
import { LEVELS, DIFFICULTY, NOISE, CELL, HIDE, hideOf } from './config.js';
import { generateLevel } from './level/generator.js';
import { generateBuilding, FH } from './level/building.js';
import { buildLevel, cloneWithBake, buildSlides } from './level/builder.js';
import { bakeUniforms } from './render/bake.js';
import { VHS } from './render/vhs.js';
import { Dust } from './render/dressing.js';
import { Beam, Mist, buildWebs, flashlightCookie } from './render/ambience.js';
import { Footprints } from './footprints.js';
import { Rain } from './render/rain.js';
import { updateSkyEyes, resetSkyEyes } from './render/skyeye.js';
import { World } from './world.js';
import { Player } from './player.js';
import { DoorSystem, Interactor } from './interact.js';
import { spawnEntity, ENTITY_INFO } from './ai/creatures.js';
import { randomReachableCell } from './ai/path.js';
import { Anomalies } from './anomalies.js';
import { AutoMap } from './automap.js';
import { OddEvents } from './events.js';
import { addGlass } from './level/glass.js';
import { NOTES, TAPES, PA_LINES, PA_THEME, FILM_NEED } from './story.js';
import { clamp, damp, angleDiff } from './util/rng.js';

// residents throw shadows in the flashlight beam
function shadowCaster(obj) { if (obj) obj.traverse((o) => { if (o.isMesh && !(o.material && o.material.transparent)) o.castShadow = true; }); }

const CUES = { sniff: 'Sesuatu mengendus udara',
  whistle: 'Peluit melengking', step: 'Langkah berat', scrape: 'Gesekan seperti batu', scream: 'Jeritan anak',
  announce: 'Suara dari corong pengeras suara', door: 'Pintu berderit', bell: 'Bel sekolah berbunyi', chalk: 'Kapur berderit di papan', locker: 'Dentang loker', slam: 'Pintu dibanting',
  hiss: 'Desisan panjang', tick: 'Detak jam kakek', chime: 'Dentang lonceng jam', chorus: 'Jeritan banyak mulut', bones: 'Gemeretak tulang',
  whisper: 'Bisikan dari kegelapan', squelch: 'Bunyi daging basah', alarm: 'Jam weker berdering', glass: 'Pecahan kaca terinjak',
};

// deaths per map and difficulty in this session (for the mercy rule)
const DEATHS = new Map();

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
    this.audio.occlude = (pos) => this.occlusion(pos);
    // the heartbeat in your hands: a controller or phone pulses with it once fear is high
    this.audio.onBeat = (f) => { this.beatAt = this.time; if (f > 0.45 && this.state === 'playing' && !this.calm) this.input.rumble(45, Math.min(0.6, 0.12 + 0.4 * f)); };
    this.dust = new Dust(260);
    this.scene.add(this.dust.points);
    // haze in the torch beam, mist on the floor, an uneven lens
    this.beam = new Beam(this.player.light); this.camera.add(this.beam.mesh);
    this.rain = new Rain(); this.scene.add(this.rain.lines);
    this.mist = new Mist();   // settings holder; the mist itself is drawn by the post pass
    this.player.light.map = flashlightCookie();
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
    const q = s.quality === 'ultra' ? 2 : s.quality === 'high' ? 1 : 0;
    // render at the window's own size and let the frame-rate governor (autoRes) climb towards
    // the preset's supersampling ceiling only while the GPU keeps 60 fps
    this.pixelRatio = 1;
    this.resMax = Math.max(1, Math.min(devicePixelRatio || 1, [1, 1.5, 2][q]));
    this.clear = s.screen === 'clear';
    // clear HD: sharper image (full resolution) and none of the broken-tape effects
    this.baseScale = this.clear ? (q ? 1 : 0.9) : (q ? 1 : 0.8) * (this.input.touch && !q ? 0.9 : 1);
    this.vhs.setSamples(q ? 4 : 0, q > 0);
    this.vhs.setFx(q, this.clear);
    this.fxCut = 0; this.mistOff = false;
    bakeUniforms.uFx.value = q;
    this.fxQ = q;
    // the flashlight casts real shadows on the higher presets
    const sh = q > 0;
    if (this.renderer.shadowMap.enabled !== sh || this.shadowQ !== q) {
      this.renderer.shadowMap.enabled = sh;
      this.renderer.shadowMap.type = q > 1 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      const L = this.player.light;
      L.castShadow = sh;
      L.shadow.mapSize.set(q > 1 ? 2048 : 1024, q > 1 ? 2048 : 1024);
      if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; }
      this.shadowQ = q;
      this.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    }
    this.resScale = Math.min(this.resScale || 1, this.resMax); this.resCap = this.resMax; this.resCapT = 0;
    if (s.autoRes === false) this.resScale = this.resMax;
    this.vhs.scale = this.baseScale * this.resScale;
    this.vhs.enabled = true;
    this.vhs.uniforms.uClean.value = this.clear ? 1 : 0;
    document.body.classList.toggle('clear-screen', this.clear);
    this.baseFov = s.fov || 72;
    this.vhs.uniforms.uBright.value = Math.max(0.7, Math.min(1.5, s.bright || 1));
    this.calm = !!s.calm;
    this.player.bobScale = s.bob === false ? 0 : 1;
    this.input.vibrate = s.vibrate !== false;
    document.body.classList.toggle('big-text', !!s.bigText);
    if (this.state === 'menu' || !this.input.zooming()) { this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix(); }
    this.input.setBinds(s.binds);
    this.input.crouchHold = s.crouchMode === 'hold'; this.input.sprintPress = s.sprintMode === 'press'; if (!this.input.sprintPress) this.input.kbSprint = false;
    this.input.sensitivity = s.sens;
    this.input.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    this.resize();
  }
  // The director. Stress builds while something is close or chasing and
  // drains in quiet; past the limit the building gives you a breather
  // (patrols drift off for a while). A chase that drags on tires the hunter.
  direct(dt, danger, chase) {
    if (chase) this.chaseT += dt; else this.chaseT = Math.max(0, this.chaseT - dt * 2);
    if (danger > 0.5 || chase) this.stress += dt / (this.diffKey === 'mimpi' ? 70 : 45);
    else this.stress = Math.max(0, this.stress - dt / 90);
    if (this.stress > 1 && !chase) { this.stress = 0.35; this.graceT = Math.max(this.graceT, this.diff.grace * 1.5); this.stats.breathers = (this.stats.breathers || 0) + 1; }
    const tire = this.chaseT > 20 ? Math.max(0.88, 1 - (this.chaseT - 20) / 50 * 0.12) : 1;
    for (const e of this.entities) {
      if (e.baseSpeedMul === undefined) e.baseSpeedMul = e.speedMul;
      e.speedMul = e.baseSpeedMul * (this.mercy || 1) * (this.chasers.has(e) ? tire : 1);
    }
  }
  // Dynamic resolution: a slow machine trades sharpness for frame rate, a fast one wins it back.
  // Frame-rate governor aiming at 60 fps: under ~50 fps it renders fewer pixels, with steady
  // vsync-bound frames it adds them back up to the preset's ceiling. After a drop the level that
  // was too slow stays out of reach for a while, so it does not see-saw.
  autoRes(rdt) {
    if (this.settings.autoRes === false || !(rdt > 0)) return;
    const a = this._ar || (this._ar = { avg: 1 / 60, t: 0 });
    a.avg += (Math.min(rdt, 0.1) - a.avg) * 0.06;
    a.t += rdt;
    if (this.resCapT > 0 && (this.resCapT -= rdt) <= 0) this.resCap = this.resMax;
    let s = this.resScale || 1;
    const lo = 0.65;
    // already at the floor and still far too slow: give up the dearest effect (contact shadows), then the mist
    if (a.t > 3 && a.avg > 1 / 22 && s <= lo && this.fxQ > 0 && (this.fxCut || 0) < 2) {
      a.t = 0; this.fxCut = (this.fxCut || 0) + 1;
      if (this.fxCut === 1) this.vhs.aoStrength = 0; else this.mistOff = true;
      return;
    }
    if (a.t > 1.5 && a.avg > 1 / 50 && s > lo) { this.resCap = Math.max(lo, s - 0.02); this.resCapT = 20; s = Math.max(lo, s * 0.88); }
    else if (a.t > 4 && a.avg < 1 / 57 && s < Math.min(this.resMax, this.resCap) - 0.01) s = Math.min(this.resMax, this.resCap, s + 0.08);
    else return;
    a.t = 0; this.resScale = s;
    this.vhs.scale = this.baseScale * s;
    this.vhs.setSize(innerWidth, innerHeight, this.pixelRatio);
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
    resetSkyEyes();
    const def = this.def = defOverride || LEVELS[index];
    this.levelIndex = index;
    this.diffKey = difficulty;
    this.diff = DIFFICULTY[difficulty];
    // mercy: after the third death on the same map this session residents lose a step (never on the two hardest settings)
    const dk = (def.endless ? 'endless' : def.id) + ':' + difficulty, nd = DEATHS.get(dk) || 0;
    this.deathKey = dk;
    this.mercy = ['sulit', 'mimpi'].includes(difficulty) ? 1 : 1 - 0.03 * Math.min(Math.max(nd - 2, 0), 3);
    this.stress = 0; this.chaseT = 0;
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
      { const oa = gen.openAbove || [], nc = gen.noCeil || []; const webs = buildWebs(gen.map, def, (def.seed || 1) * 31 + k, oa.length || nc.length ? gen.map.region.map((_, i) => (oa[i] || nc[i] ? 1 : 0)) : null); if (webs) built.root.add(webs); }
      // stair shafts and lift cabins are dead ends on their own floor: residents may cross them after you, never roam into them
      gen.map.avoid = new Uint8Array(gen.map.W * gen.map.H);
      for (const r of gen.rooms) if (r.type === 'stairs' || r.type === 'lift') for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) gen.map.avoid[x + z * gen.map.W] = 1;
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
    for (const f of this.floors) f.glass = def.glass === 0 ? [] : addGlass(f, def, start, f.k === startFloor);
    this.setFloor(startFloor);
    this.interactor = new Interactor(this);
    this.anomalies = new Anomalies(this);
    if (!this.automap) this.automap = new AutoMap(this);
    this.automap.reset();
    this.odd = new OddEvents(this);
    // per-level look: tint of the baked light, colour of the dark
    const fogC = def.fogColor ?? 0x070806;
    this.scene.fog = new THREE.FogExp2(fogC, def.fog);
    this.scene.background = new THREE.Color(fogC);
    const tint = def.tint || [1, 0.98, 0.9];
    bakeUniforms.uBakeTint.value.setRGB(tint[0], tint[1], tint[2]);
    bakeUniforms.uGrime.value = def.grime ?? ({ detention: 1.35, hospital: 1.1, school: 1.0, backroom: 0.9, pool: 0.8, mall: 0.7, museum: 0.65 }[def.arch] ?? 1);
    bakeUniforms.uFH.value = FH;
    // how much hangs in the air here
    this.haze = def.haze ?? ({ pool: 1.0, detention: 0.9, hospital: 0.8, school: 0.65, backroom: 0.6, museum: 0.55, mall: 0.5 }[def.arch] ?? 0.7);
    this.mist.u.uAmt.value = (def.mist ?? ({ pool: 0.55, detention: 0.5, hospital: 0.45, school: 0.32, museum: 0.3, backroom: 0.25, mall: 0.25 }[def.arch] ?? 0.35));
    { const c = new THREE.Color(fogC); this.mist.u.uCol.value.setRGB(0.1 + c.r * 2 + 0.1 * tint[0], 0.1 + c.g * 2 + 0.1 * tint[1], 0.1 + c.b * 2 + 0.1 * tint[2]); }
    this.vhs.uniforms.uGrade.value.set(...(def.grade || [1, 1, 1]));
    this.dust.u.uCol.value.setRGB(0.9 * tint[0], 0.86 * tint[1], 0.74 * tint[2]);
    this.start = start;

    const p = this.player;
    p.spawn(start.x, start.z, start.yaw);
    p.battery = 100; p.flashlight = false; p.nightVision = false;
    p.water = this.gen.water; p.y = 0;
    this.audio.setTheme(def.theme || null); this.themeT = 0;
    this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    p.inventory = { fuses: 0, keys: 0, erasers: 0, alarms: def.startAlarms || 0, wedges: def.wedges ?? (def.endless ? 1 : 2) };
    this.alarms = [];
    this.radioOn = def.radio !== false;
    this.installing = null;
    this.struggle = null; this.struggleUsed = false;
    this.trainDone = null; this.trainFinished = false;
    this.trace = null;
    this.fearT = 0; this.fakeHunt = 0;
    if (!this.prints) this.prints = new Footprints(this); this.prints.reset();
    this.marks = [];   // where residents spotted you (shown on the floor plan for a minute)
    this.projectiles = [];
    this.hintT = 0;
    this.timers = [];
    this.paT = 55 + Math.random() * 35;
    this.blackoutT = 0;
    this.fusesInstalled = 0;
    this.powered = false;
    this.time = 0;
    this.stats = { spotted: 0, notes: 0 };
    this.quietT = 0; this.graceT = 0;
    this.checkpoint = null; this.retries = 0;
    this.assist = null; this.assistT = 0; this.assistSig = null;
    for (const f of this.floors) for (const d of f.built.doors) d.wasLocked = !!d.locked;
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
      shadowCaster(this.entities[this.entities.length - 1].obj);
    }
    this.audio.setAmbience(true);
    // warm up shaders now instead of stuttering during play
    this.renderer.compile(this.scene, this.camera);
  }

  unload() {
    if (this.automap) this.automap.setOpen(false);
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
    if (this.rain) this.rain.setFloor(this.floors, k);
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
    if (this.odd) this.odd.clear();
    this.setFloor(k);
    this.hud.caption(`Lantai ${k + 1}`, 1.6);
    if (this.automap) { this.automap.view = k; this.automap.dirty = true; }
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
          const e = spawnEntity(this, kind, via.cell, { emerged: true });
          shadowCaster(e.obj);
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
    // never lose the resident: if nothing is reachable from where the player stands, take the walkable cell furthest away
    if (!c) {
      const m = this.map; let best = null, bd = -1;
      for (let i = 0; i < m.region.length; i++) { if (m.region[i] < 0 || (m.avoid && m.avoid[i])) continue; const x = i % m.W, z = (i / m.W) | 0, d = Math.abs(x - px) + Math.abs(z - pz); if (d > bd) { bd = d; best = [x, z]; } }
      if (best) { this.entities.push(spawnEntity(this, kind, best)); shadowCaster(this.entities[this.entities.length - 1].obj); }
      return;
    }
    if (c) { this.entities.push(spawnEntity(this, kind, c)); shadowCaster(this.entities[this.entities.length - 1].obj); }
  }

  // ------------------------------------------------------------------ events
  emitNoise(x, z, radius, type) {
    const m = this.map, rr = radius * this.diff.hearing * (type === 'step' ? (this.def.noiseMul || 1) * (this.inRain ? 0.55 : 1) : 1);
    let cost = null;
    for (const e of this.entities) {
      let d = Math.hypot(e.pos.x - x, e.pos.z - z), r = rr * (e.listenT > 0 ? 1.8 : 1);
      if (d >= r) continue;
      // out of sight the sound has to find its way round: through doorways (a closed door muffles it), along halls
      if (!this.world.los(e.pos.x, e.pos.z, x, z)) {
        if (!cost) { const [sx, sz] = m.cellOf(x, z); cost = m.soundCost(sx, sz, rr / CELL + 2); }
        const [ex, ez] = m.cellOf(e.pos.x, e.pos.z), c = cost[ex + ez * m.W];
        d = Math.max(d, (c - 0.5) * CELL);
        r *= 0.8;
      }
      if (d < r) {
        // where it thinks the sound came from: faint and round corners means a wider guess
        const st = 1 - d / r, err = type === 'alert' ? 0 : (1 - st) * (this.world.los(e.pos.x, e.pos.z, x, z) ? 1.2 : 3.5), a = Math.random() * Math.PI * 2;
        let ex = x + Math.cos(a) * err * Math.random(), ez = z + Math.sin(a) * err * Math.random();
        { const [cx, cz] = m.cellOf(ex, ez); if (m.reg(cx, cz) < 0) { ex = x; ez = z; } }
        e.onNoise(ex, ez, st, type); if (type === 'throw') this.stats.lures = (this.stats.lures || 0) + 1; if (type === 'knock') this.stats.knockLures = (this.stats.knockLures || 0) + 1; }
    }
  }
  alert(x, z, src) {
    this.hud.toast('Jeritan itu memanggil sesuatu…', 2.5);
    for (const e of this.entities) if (e !== src && Math.hypot(e.pos.x - x, e.pos.z - z) < 48) e.onNoise(x, z, 1, 'alert');
  }
  onChaseStart(e) {
    if (!this.chasers.has(e) && this.player.alive) { this.marks.push({ k: this.floorK, x: this.player.pos.x, z: this.player.pos.z, t: this.time, kind: e.kind }); if (this.marks.length > 12) this.marks.shift(); if (this.automap) this.automap.dirty = true; }
    if (!this.chasers.has(e)) { this.chasers.add(e); this.stats.spotted++; this.audio.stinger(); this.input.rumble(180, 0.7); }
  }
  onChaseEnd(e) {
    if (this.chasers.delete(e) && this.player.alive) {
      this.graceT = this.diff.grace; this.quietT = 0; this.stats.escapes = (this.stats.escapes || 0) + 1;
      // relief, when the last hunter has lost you
      if (!this.chasers.size && this.state === 'playing') { this.audio.exhale(); this.hud.caption('— lolos —', 1.6); this.relief = 1; }
    }
  }
  // Pacing: after an escape patrols wander off for a while; after a long quiet
  // stretch the next patrol leg ends somewhere near the player instead.
  pickPatrol(e) {
    const m = this.map, p = this.player;
    const [px, pz] = m.cellOf(p.pos.x, p.pos.z), [cx, cz] = e.cell();
    if (this.graceT > 0) {
      for (let i = 0; i < 6; i++) { const c = randomReachableCell(m, Math.random, cx, cz, 4, 18); if (c && Math.abs(c[0] - px) + Math.abs(c[1] - pz) >= 10) return c; }
      return null;
    }
    if (this.quietT > this.diff.quiet) { this.quietT = this.diff.quiet * 0.4; this.stats.lured = (this.stats.lured || 0) + 1; return randomReachableCell(m, Math.random, px, pz, 4, 8); }
    // end game: once the power is back (or one fuse short), the residents start to haunt the way out
    const guard = this.guardPatrol(e, cx, cz);
    if (guard) return guard;
    return this.coverPatrol(e, px, pz, cx, cz);
  }
  guardPatrol(e, cx, cz) {
    const late = this.powered || this.fusesInstalled >= (this.def.fuses || 0) - 1;
    if (!late || this.def.training || Math.random() > 0.4) return null;
    const f = this.floors[this.floorK], spot = (this.powered ? f.gen.exit : null) || f.gen.fusebox || f.gen.exit;
    if (!spot || !spot.cell) return null;
    const m = this.map, dist = m.bfs(spot.cell[0], spot.cell[1]), from = m.bfs(cx, cz), cand = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 1 && dist[i] <= 3 && from[i] >= 0 && !(m.avoid && m.avoid[i])) cand.push(i);
    if (!cand.length) return null;
    const i = cand[Math.floor(Math.random() * cand.length)];
    this.stats.guards = (this.stats.guards || 0) + 1;
    if (Math.hypot(...m.center(i % m.W, (i / m.W) | 0).map((v, k) => v - (k ? this.player.pos.z : this.player.pos.x))) < 30) this.hint('guard', this.powered ? 'Listrik menyala, dan penghuni mulai berkeliaran di dekat pintu darurat. Tunggu ia pergi sebelum mendekat.' : 'Tinggal satu sekring: penghuni mulai berjaga di dekat kotak panel.', 6);
    return [i % m.W, (i / m.W) | 0];
  }
  // Ordinary patrol leg: prefer rooms nobody has walked through for a while,
  // and halls the player has spent time in (an old trail, never where they stand now).
  // a hiding spot the player keeps going back to, worth a look now and then
  favouriteHide(e) {
    const L = (this.built.lockers || []).filter((q) => (q.used || 0) >= 2 && this.time - (q.checkedT ?? -1e9) > 60).sort((a, b) => b.used - a.used)[0];
    return L && Math.random() < 0.3 + 0.1 * Math.min(4, L.used - 2) ? L : null;
  }
  coverPatrol(e, px, pz, cx, cz) {
    const f = this.floors[this.floorK], m = this.map;
    if (!f || !f.heat) return null;
    const dist = m.bfs(cx, cz), W = m.W, cand = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 4 && dist[i] <= 18 && !(m.avoid && m.avoid[i])) cand.push(i);
    if (!cand.length) return null;
    let best = -1, bs = -Infinity;
    for (let k = 0; k < 10; k++) {
      const i = cand[Math.floor(Math.random() * cand.length)], x = i % W, z = (i / W) | 0;
      if (Math.abs(x - px) + Math.abs(z - pz) < 5) continue;
      const stale = Math.min(this.time - (f.visit.get(m.region[i]) ?? -1e9), 150) / 150;
      let heat = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (m.inside(x + dx, z + dz)) heat += f.heat[x + dx + (z + dz) * W];
      const s = stale + Math.min(heat / 30, 1) * 0.6 + Math.random() * 0.35;
      if (s > bs) { bs = s; best = i; }
    }
    return best >= 0 ? [best % W, (best / W) | 0] : null;
  }
  // every half second: the player's trail cools, and residents mark the rooms they pass through
  updateTrail(dt) {
    const f = this.floors[this.floorK], m = this.map, p = this.player;
    if (!f || !m) return;
    if (!f.heat || f.heat.length !== m.W * m.H) { f.heat = new Float32Array(m.W * m.H); f.visit = new Map(); }
    this.trailT = (this.trailT || 0) - dt;
    if (this.trailT > 0) return;
    this.trailT = 0.5;
    const k = Math.exp(-0.5 / 120), h = f.heat;
    for (let i = 0; i < h.length; i++) h[i] *= k;
    const [x, z] = m.cellOf(p.pos.x, p.pos.z);
    if (m.inside(x, z) && !p.hidden) h[x + z * m.W] += 0.5;
    for (const e of this.entities) { const [ex, ez] = e.cell(); if (m.inside(ex, ez)) f.visit.set(m.region[ex + ez * m.W], this.time); }
  }

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

  // How clearly the player hears a sound at pos: 1 in plain view, lower the further the sound has
  // to travel round walls (closed doors count extra), about 0.15 when it only gets through stone.
  occlusion(pos) {
    const m = this.map, cam = this.camera;
    if (!m || this.state !== 'playing') return 1;
    if (pos.y !== undefined && Math.abs(pos.y - cam.position.y) > 2.6) return this.openness(pos.x, pos.z) ? 0.7 : 0.3;   // another storey
    const lx = cam.position.x, lz = cam.position.z;
    if (m.los(lx, lz, pos.x, pos.z)) return 1;
    const [cx, cz] = m.cellOf(lx, lz);
    if (!this._occ || this._occ.k !== cx + cz * m.W || this._occ.map !== m || this.time - this._occ.t > 0.25) {
      this._occ = { k: cx + cz * m.W, map: m, t: this.time, cost: Float32Array.from(m.soundCost(cx, cz, 14)) };
    }
    const [sx, sz] = m.cellOf(pos.x, pos.z);
    if (!m.inside(sx, sz)) return 0.5;
    const c = this._occ.cost[sx + sz * m.W], d = Math.hypot(pos.x - lx, pos.z - lz);
    if (!isFinite(c)) return 0.18;
    return Math.max(0.2, Math.min(0.8, 0.8 - (Math.max(0, (c - 0.5) * CELL - d)) / 30));
  }

  // Door wedges: crouch at a closed door and jam it. A resident has to batter it open (loud, a few
  // seconds), which breaks the wedge; crouch at it again to pull the wedge out and keep it.
  wedgeDoor(d) {
    const p = this.player;
    if (d.wedged) {
      d.wedged = false; p.inventory.wedges++; this.removeWedge(d);
      this.hud.toast('Ganjal dilepas.', 1.6); this.audio.click(); return;
    }
    if (d.target || d.openAmount > 0.05) { this.hud.toast('Tutup pintunya dulu.', 1.6); return; }
    if (!p.inventory.wedges) { this.hud.toast('Tidak punya ganjal pintu lagi.', 1.6); return; }
    p.inventory.wedges--; d.wedged = true; d.bang = 0;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.12), new THREE.MeshLambertMaterial({ color: 0x5a3c22 }));
    m.position.set(d.x, 0.035 + (this.player.y || 0), d.z); m.rotation.y = Math.random();
    this.levelRoot.add(m); d.wedgeObj = m;
    this.audio.knock({ x: d.x, y: 0.3, z: d.z });
    this.emitNoise(d.x, d.z, NOISE.locker, 'locker');
    this.stats.wedges = (this.stats.wedges || 0) + 1;
    this.hud.toast('Pintu diganjal. Penghuni harus mendobraknya.', 2.2);
    this.hint('wedge', 'Ganjal membuat penghuni mendobrak pintu beberapa detik, dan suaranya terdengar jauh. Gunakan waktu itu untuk kabur atau sembunyi.', 6);
  }
  removeWedge(d) { if (d.wedgeObj) { d.wedgeObj.parent && d.wedgeObj.parent.remove(d.wedgeObj); d.wedgeObj = null; } }
  // a resident batters a wedged door; true once it gives
  batterDoor(d, e, dt) {
    d.bang = (d.bang || 0) + dt;
    e.bangT = (e.bangT || 0) - dt;
    if (e.bangT <= 0) {
      e.bangT = 0.55;
      this.audio.doorSlam({ x: d.x, y: 1.2, z: d.z });
      if (d.setLeaf) d.setLeaf(-0.06 - Math.random() * 0.06); else if (d.leaf) d.leaf.rotation.y = d.baseRot - 0.08;
      this.input.rumble(40, 0.25 * Math.max(0, 1 - Math.hypot(d.x - this.player.pos.x, d.z - this.player.pos.z) / 15));
    }
    if (d.bang < 2.8 * (this.diff.speed > 1.1 ? 0.75 : 1)) return false;
    d.wedged = false; d.bang = 0; this.removeWedge(d); this.stats.battered = (this.stats.battered || 0) + 1;
    this.audio.crack({ x: d.x, y: 0.4, z: d.z });
    this.doorSys.open(d, e, e.pos);
    // a door jammed shut from inside means someone is in there: it goes through every hiding spot in the room
    if (d.room && e.state !== 'chase' && e.lockers !== false && e.searchPts !== undefined) {
      const R = d.room, spots = (this.built.lockers || []).filter((L) => { const [cx, cz] = this.map.cellOf(L.x, L.z); return this.map.reg(cx, cz) === R.id; }).slice(0, 4);
      if (spots.length) {
        e.searchPts = spots.map((L) => ({ L })); e.peek = null; e.peekNext = null; e.path = null; e.finalPoint = null; e.setState('search');
        e.awareness = Math.max(e.awareness || 0, 0.6); this.stats.roomRaids = (this.stats.roomRaids || 0) + 1;
        this.hint('raid', 'Pintu yang diganjal dari dalam memberi tahu penghuni ada sesuatu di ruangan itu: ia akan memeriksa semua tempat sembunyinya.', 6);
      }
    }
    return true;
  }

  // a closed door right in front of the player, for peeking through its keyhole
  keyholeDoor() {
    const p = this.player;
    if (!this.built || p.hidden || !p.alive) return null;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bd = 1.15;
    for (const d of this.built.doors) {
      if (d.openAmount > 0.05 || d.target) continue;
      const dx = d.x - p.pos.x, dz = d.z - p.pos.z, dist = Math.hypot(dx, dz);
      if (dist > bd || (dx * fx + dz * fz) / Math.max(dist, 1e-3) < 0.6) continue;
      best = d; bd = dist;
    }
    return best;
  }

  updateStruggle(dt) {
    const S = this.struggle, p = this.player;
    if (!S) return;
    const e = S.e;
    S.t += dt;
    if (this.input.consume('interact')) { S.n++; this.input.rumble(40, 0.5); if (this.audio.ready) this.audio._thud(null, this.audio.t, 0.18); }
    // you are held: no walking, eyes on it
    p.vel.set(0, 0);
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z; p.yaw += angleDiff(p.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 10); p.pitch *= 0.9;
    this.dread = 1;
    const T = this.input.touch ? 'AKSI' : this.input.keyName('interact');
    this.hud.caption(`MERONTA! tekan ${T} berulang  ${'■'.repeat(S.n).padEnd(S.need, '□')}`, 0.2);
    if (S.n >= S.need) {
      this.struggle = null; p.locked = false;
      const d = Math.hypot(dx, dz) || 1; let nx = e.pos.x + dx / d * 1.8, nz = e.pos.z + dz / d * 1.8; [nx, nz] = this.world.collide(nx, nz, Math.min(e.radius || 0.4, 0.4));
      e.pos.x = nx; e.pos.z = nz; e.stunT = 1.8; e.path = null;
      if (e.state !== 'chase') { e.lastSeen = { x: p.pos.x, z: p.pos.z, t: this.time }; e.state = 'patrol'; e.setState('chase'); }
      this.audio.impact(); this.input.rumble(220, 1); this.stats.struggles = (this.stats.struggles || 0) + 1;
      this.hud.toast('Lepas! Lari!', 1.6);
      this.hint('struggle', 'Kamu berhasil meronta lepas, tapi hanya sekali tiap bab. Lain kali cengkeramannya tidak terlepas.', 5);
      return;
    }
    if (S.t >= S.dur) { this.struggle = null; p.locked = false; e.stunT = 0; this.killPlayer(e, null, true); }
  }

  // a door shut in a hunter's face: it reels back for a moment
  onDoorSlam(d) {
    const p = this.player, nx = d.kind === 'v' ? 1 : 0, nz = d.kind === 'h' ? 1 : 0;
    const side = (x, z) => Math.sign((x - d.x) * nx + (z - d.z) * nz);
    for (const e of this.chasers) {
      if (Math.hypot(e.pos.x - d.x, e.pos.z - d.z) > 1.9 || side(e.pos.x, e.pos.z) === side(p.pos.x, p.pos.z)) continue;
      e.stunT = 0.9; e.path = null;
      this.audio.doorSlam({ x: d.x, y: 1.2, z: d.z }); this.input.rumble(120, 0.6);
      this.stats.slams = (this.stats.slams || 0) + 1;
      this.hint('slam', 'Pintu dibanting tepat di depannya: ia tertahan sesaat. Lari sekarang!', 4);
    }
  }

  // the wall straight in front of the player, if there is one within reach
  wallAhead() {
    const p = this.player;
    if (!this.map || p.hidden || !p.alive) return null;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    for (const r of [0.55, 0.8, 1.05]) {
      const x = p.pos.x + fx * r, z = p.pos.z + fz * r, [qx, qz] = this.world.collide(x, z, 0.12);
      if (Math.hypot(qx - x, qz - z) > 0.03 || !this.map.los(p.pos.x, p.pos.z, x, z)) return { x: p.pos.x + fx * (r - 0.15), z: p.pos.z + fz * (r - 0.15) };
    }
    return null;
  }
  // knock on it: a sound with nothing thrown, to pull a resident round a corner
  knock() {
    const w = this.wallAhead();
    if (!w) { this.hud.toast('Tidak ada dinding di depanmu untuk diketuk.', 1.6); return; }
    if ((this.knockCd || 0) > this.time) return;
    this.knockCd = this.time + 3;
    this.audio.knock({ x: w.x, y: 1.3, z: w.z });
    this.emitNoise(w.x, w.z, NOISE.knock, 'knock');
    this.stats.knocks = (this.stats.knocks || 0) + 1;
    this.input.rumble(60, 0.3);
  }

  // 2 = under the open sky (courtyard, forest hall, roofless), 1 = an atrium or void several storeys high, 0 = indoors
  openness(x, z) {
    const f = this.floors[this.floorK], m = this.map;
    if (!f || !m) return 0;
    if (!f.open || f.open.length !== m.W * m.H) {
      const o = f.open = new Uint8Array(m.W * m.H), g = f.gen, nc = g.noCeil || [], oa = g.openAbove || [];
      const sky = new Set(g.rooms.filter((r) => r.type === 'lapangan' || r.type === 'forest').map((r) => r.id));
      for (let i = 0; i < o.length; i++) o[i] = nc[i] || sky.has(m.region[i]) ? 2 : oa[i] || m.region[i] === -2 ? 1 : 0;
    }
    const [cx, cz] = m.cellOf(x, z);
    return m.inside(cx, cz) ? f.open[cx + cz * m.W] : 0;
  }

  isSeenByPlayer(e) {
    const p = this.player;
    if (!p.alive || e.form === 'statue') return false;
    const cam = this.camera;
    const v = (this._seeV || (this._seeV = new THREE.Vector3())).set(e.pos.x, 1.1, e.pos.z);
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

  killPlayer(entity, locker = null, force = false) {
    const p = this.player;
    if (!p.alive || this.liftRide || this.slideRide || this.struggle) return;
    // inside (or climbing into) a hiding spot only a resident that pulls the door open can get you
    if ((p.hidden || p.entering) && !locker) {
      entity.state = entity.kind === 'shade' ? 'lurk' : entity.kind === 'eyes' ? 'watch' : 'patrol';
      entity.waitT = 1.5; entity.path = null;
      // a hunter that lost you at the door checks the hiding spot instead (hold your breath!)
      if (p.hidden && entity.targetLocker) entity.targetLocker(p.hidden, false);
      return;
    }
    // once per chapter you can tear yourself free: mash interact before its grip closes
    if (!force && !locker && !this.godMode && !this.struggleUsed && this.diffKey !== 'mimpi' && entity.sight && entity.form !== 'statue') {
      this.struggleUsed = true;
      this.struggle = { e: entity, t: 0, n: 0, need: { mudah: 5, normal: 7, sulit: 9 }[this.diffKey] || 7, dur: 1.6 }; p.locked = true;
      entity.velocity = 0; entity.stunT = 99;
      this.input.consume('interact');
      this.audio.impact(); this.input.rumble(300, 0.9);
      if (!this.calm) { this.glitch = Math.max(this.glitch, 0.35); this.schedule(0.12, () => { this.glitch = 0; }); }
      return;
    }
    if (this.godMode) { // test rooms: shrug the hit off and throw the resident back
      this.hud.toast(this.def.training ? 'Tertangkap! Di ruang latihan kamu tidak mati. Coba lagi: putuskan pandangannya, lalu sembunyi.' : `Mode kebal: serangan ${(ENTITY_INFO[entity.kind] || {}).name || ''} diabaikan`, this.def.training ? 3 : 2);
      this.audio.stinger();
      const [cx, cz] = entity.cell();
      const t = randomReachableCell(this.map, Math.random, cx, cz, 6, 12);
      if (t && entity.kind !== 'eyes') { const [x, z] = this.map.center(...t); entity.pos.set(x, 0, z); }
      entity.state = entity.kind === 'eyes' ? 'watch' : entity.kind === 'shade' ? 'lurk' : 'patrol';
      entity.path = null; entity.gaze = 0; entity.calmT = 5; entity.suspicion = 0; entity.waitT = 3;
      if (entity.kind === 'echo' || entity.kind === 'gaper') { entity.aware = false; entity.target = null; }
      if (entity.statue) entity.state = 'patrol';
      if (locker) this.toggleLocker(locker);
      this.onChaseEnd(entity);
      return;
    }
    p.alive = false;
    if (this.deathKey && !this.def.test) DEATHS.set(this.deathKey, (DEATHS.get(this.deathKey) || 0) + 1);
    this.busy = true;
    this.deathT = 0;
    this.killer = entity;
    this.faceFlashed = false; this.scareFrame = 0;
    if (locker) { // dragged out of the locker
      const h = hideOf(locker);
      locker.target = h.open;
      p.hidden = null;
      p.pos.x = locker.x + Math.sin(locker.rot) * h.exit; p.pos.z = locker.z + Math.cos(locker.rot) * h.exit;
    }
    // how it gets you: most lunge, the spider drops from above, the clock and the statue stand silent first
    this.scareLv = this.calm ? 'tenang' : this.settings.scare || 'penuh';
    this.scareStyle = entity.kind === 'spider' ? 'drop' : (entity.kind === 'clock' || entity.statue) ? 'still' : 'lunge';
    this.scareDelay = this.scareStyle === 'still' ? 0.45 : 0;
    const hit = () => {
      if (this.deathT < 0) return;
      this.audio.jumpscare(); this.audio.impact();
      this.input.rumble(700, 1);
      this.schedule(0.35, () => this.input.rumble(200, 0.8)); this.schedule(1.15, () => this.input.rumble(260, 1));
      this.audio.sting(entity.kind, entity.pos);
      this.ui.scare && this.ui.scare(this.clear || this.scareLv !== 'penuh');
    };
    if (this.scareDelay) { this.audio.setAmbience(false); this.schedule(this.scareDelay, hit); } else hit();
    this.input.resetToggles();
  }

  toggleLocker(L) {
    const p = this.player;
    if (this.busy) return;
    this.busy = true;
    const h = hideOf(L);
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
        const lat = h.lat || 0;
        L.camX = L.x + Math.sin(L.rot) * h.cam + Math.cos(L.rot) * lat; L.camZ = L.z + Math.cos(L.rot) * h.cam - Math.sin(L.rot) * lat;
        p.hidden = L; p.crouched = false; p.hideT = this.time;
        L.used = (L.used || 0) + 1; L.usedFloor = this.floorK;   // residents learn favourite hiding spots
        p.yaw = L.viewYaw; p.pitch = h.look || 0;
        p.flashlight = false;
        this.hud.toast(this.input.touch ? 'Tahan tombol NAPAS saat ada yang mendekat' : `Tahan ${this.input.keyName('breath').toUpperCase()} untuk menahan napas`, 2.5);
      } else {
        p.hidden = null;
        p.pos.x = L.x + Math.sin(L.rot) * h.exit; p.pos.z = L.z + Math.cos(L.rot) * h.exit;
        p.yaw = L.rot + Math.PI;
      }
      L.target = entering ? h.ajar || 0 : 0;   // some spots stay open a crack while you are inside
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
    if (it.type === 'alarm' && p.inventory.alarms >= 2) { this.hud.toast('Kamu hanya bisa membawa 2 jam weker'); return; }
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
      this.hint('eraser', this.input.touch ? 'Tekan LEMPAR untuk melempar penghapus — bunyinya memancing penghuni ke sana.' : 'Tekan G / klik kanan untuk melempar penghapus — bunyinya memancing penghuni ke sana.', 5);
    }
    else if (it.type === 'alarm') {
      p.inventory.alarms++;
      if (this.hintsSeen.has('alarm')) this.hud.toast('Jam weker diambil');
      this.hint('alarm', this.input.touch ? 'Tekan WEKER untuk meletakkan jam weker. Lima detik kemudian ia berdering dan memanggil penghuni ke sana.' : 'Tekan Q untuk meletakkan jam weker. Lima detik kemudian ia berdering dan memanggil penghuni ke sana.', 6);
    }
    else if (it.type === 'battery' && it.grave) {
      p.battery = Math.min(100, p.battery + 30); this.stats.graves = (this.stats.graves || 0) + 1;
      this.hud.toast('Baterai ini dari kameramu sendiri. Rekaman sebelumnya berhenti di sini. (+30%)', 4.5);
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

  // Seating fuses takes a moment per fuse, with the panel crackling and sparking (a little noise);
  // walking off or being caught stops it, and the fuses stay in your pocket.
  useFusebox() {
    const p = this.player;
    if (this.powered || this.installing) return;
    if (p.inventory.fuses <= 0) { this.hud.toast(`Butuh ${this.def.fuses - this.fusesInstalled} sekring lagi`); return; }
    this.installing = { t: 0, need: Math.min(2.6, 0.9 + 0.55 * p.inventory.fuses), x: p.pos.x, z: p.pos.z, spark: 0 };
    this.hint('install', 'Memasang sekring butuh waktu dan panelnya berderak. Tetap di tempat sampai selesai, atau menjauh untuk membatalkan.', 5);
  }
  updateInstall(dt) {
    const I = this.installing, p = this.player;
    if (!I) return;
    if (!p.alive || p.hidden || Math.hypot(p.pos.x - I.x, p.pos.z - I.z) > 0.6) { this.installing = null; this.hud.toast('Pemasangan dibatalkan.', 1.4); return; }
    I.t += dt; I.spark -= dt;
    const fb = this.gen.fusebox;
    if (I.spark <= 0) { I.spark = 0.35 + Math.random() * 0.2; this.audio.scrape({ x: fb.x, y: 1.4, z: fb.z }, 0.12, 0.18); this.emitNoise(fb.x, fb.z, NOISE.fuse * 0.45, 'fuse'); }
    this.hud.caption(`Memasang sekring… ${Math.round(Math.min(1, I.t / I.need) * 100)}%`, 0.3);
    if (I.t >= I.need) { this.installing = null; this.finishFuses(); }
  }
  finishFuses() {
    const p = this.player;
    this.fusesInstalled += p.inventory.fuses;
    p.inventory.fuses = 0;
    const fb = this.gen.fusebox;
    this.audio.fuseInsert({ x: fb.x, y: 1.4, z: fb.z });
    this.emitNoise(fb.x, fb.z, NOISE.fuse, 'fuse');
    this.showFuses();
    if (this.fusesInstalled < this.def.fuses && this.canCheckpoint()) {
      this.checkpoint = this.snapshot();
      this.hint('checkpoint', 'Kotak panel menyimpan rekamanmu. Kalau kamu mati, kamu bisa melanjutkan dari sini.', 5);
    }
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

  // physical fuses seated in the panel sockets + the row of lamps
  showFuses() {
    const B = this.fuseFloor.built, fuseObj = B.fuseObj;
    for (let i = 1; i <= 3; i++) {
      const slot = fuseObj.getObjectByName('Slot' + i);
      if (!slot || slot.userData.filled || i > Math.ceil(this.fusesInstalled * 3 / this.def.fuses)) continue;
      const f = cloneWithBake(this.assets.models.item_fuse, [0.6, 0]);
      slot.add(f); slot.userData.filled = true;
    }
    const frac = this.fusesInstalled / this.def.fuses;
    B.lamps.forEach((l, i) => { if (frac >= (i + 1) / B.lamps.length - 1e-6) l.material.emissive.set(0x22ff55); });
  }

  // ---------------------------------------------------------------- checkpoint
  // Seating fuses in the panel saves the run (not on Sulit, not in endless).
  canCheckpoint() { return !this.diff.noCheckpoint && !this.def.endless; }
  snapshot() {
    const p = this.player, fb = this.fuseFloor.gen.fusebox;
    return {
      floorK: this.fuseFloor.k, x: fb.x + Math.sin(fb.rot) * 0.95, z: fb.z + Math.cos(fb.rot) * 0.95, yaw: fb.rot,
      battery: p.battery, inventory: { ...p.inventory, wedges: (p.inventory.wedges || 0) + this.floors.reduce((a, f) => a + f.built.doors.filter((d) => d.wedged).length, 0) }, fusesInstalled: this.fusesInstalled, time: this.time,
      stats: { ...this.stats },
      taken: this.floors.map((f) => f.built.items.slice(0, f.gen.items.length).map((it, i) => (it.taken ? i : -1)).filter((i) => i >= 0)),
      read: this.floors.map((f) => f.built.items.slice(0, f.gen.items.length).map((it, i) => (it.read ? i : -1)).filter((i) => i >= 0)),
      unlocked: this.floors.map((f) => f.built.doors.filter((d) => d.wasLocked && !d.locked).map((d) => d.key)),
      map: this.automap.dump(),
    };
  }
  // call right after loadLevel() of the same level
  restore(cp) {
    const p = this.player;
    this.floors.forEach((f, k) => {
      for (const i of cp.taken[k] || []) { const it = f.built.items[i]; if (it) { it.taken = true; it.obj.visible = false; } }
      for (const i of cp.read[k] || []) { const it = f.built.items[i]; if (it) it.read = true; }
      for (const d of f.built.doors) if ((cp.unlocked[k] || []).includes(d.key)) d.locked = false;
    });
    if (cp.floorK !== this.floorK) this.setFloor(cp.floorK);
    p.pos.set(cp.x, 0, cp.z); p.y = 0; p.yaw = cp.yaw; p.pitch = 0;
    p.battery = Math.max(cp.battery, 25);
    p.inventory = { ...cp.inventory };
    this.fusesInstalled = cp.fusesInstalled;
    this.showFuses();
    this.time = cp.time;
    this.stats = { ...cp.stats, retries: (this.retries = (this.retries || 0) + 1) };
    this.automap.load(cp.map);
    this.checkpoint = cp;
    // the resident starts somewhere else, never next to the panel
    const kinds = this.entities.map((e) => e.kind);
    for (const e of this.entities) e.remove();
    this.entities = []; this.chasers.clear();
    for (const k of kinds) this.spawnFar(k);
    this.graceT = this.diff.grace;
  }

  tryExit() {
    if (!this.powered) { this.audio.doorLocked(this.gen.exit); this.hud.toast('Tidak ada listrik. Pasang semua sekring di kotak panel.'); return; }
    if (this.busy) return;
    this.busy = true;
    this.winT = 0;
    this.audio.doorCreak({ x: this.gen.exit.x, y: 1.2, z: this.gen.exit.z }, true);
    this.audio.setAmbience(false);
  }

  // called by the player on every footfall: broken glass underfoot
  onStep(kind) {
    const p = this.player, f = this.floors[this.floorK];
    const P = f && f.glass && f.glass.find((q) => Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < q.r);
    if (!P) return;
    if (kind === 'crouch') { this.hint('glass2', 'Pelan-pelan… jongkok membuat pecahan kaca tidak berbunyi.', 3.5); return; }
    this.audio.glassCrunch({ x: P.x, y: 0.1, z: P.z }, kind === 'sprint' ? 1 : 0.7);
    this.emitNoise(P.x, P.z, NOISE.glass * (kind === 'sprint' ? 1.25 : 1), 'glass');
    this.stats.glass = (this.stats.glass || 0) + 1;
    this.hint('glass', 'Pecahan kaca! Bunyinya terdengar jauh. Jongkok untuk melewatinya, atau cari jalan memutar.', 5);
  }

  // ---------------------------------------------------------------- assist
  // No progress for a long while: a mark nobody drew appears on the floor plan,
  // on the room that holds the next thing you need.
  updateAssist(dt) {
    if (this.settings.assist === false || this.diff.noAssist || this.winT >= 0) return;
    this.assistT = (this.assistT || 0) + dt;
    this.assistTick = (this.assistTick || 0) - dt;
    if (this.assistTick > 0) return;
    this.assistTick = 1;
    const p = this.player, items = this.floors.flatMap((f) => f.built.items.slice(0, f.gen.items.length).map((it) => ({ it, f })));
    const sig = p.inventory.fuses + this.fusesInstalled * 7 + items.filter((q) => q.it.type === 'key' && q.it.taken).length * 50 + (this.powered ? 1000 : 0);
    if (sig !== this.assistSig) { this.assistSig = sig; this.assistT = 0; if (this.assist) { this.assist = null; this.automap.dirty = true; } return; }
    if (this.assist || this.assistT < (this.diff.assistAfter || 240)) return;
    const roomMark = (f, id) => { const r = f.gen.rooms.find((q) => q.id === id); return r ? { k: f.k, x: (r.x0 + r.x1 + 1) * CELL / 2, z: (r.z0 + r.z1 + 1) * CELL / 2, r: Math.max(r.x1 - r.x0 + 1, r.z1 - r.z0 + 1) * CELL / 2 } : null; };
    const point = (f, q) => ({ k: f.k, x: q.x, z: q.z, r: CELL });
    let mark = null;
    if (this.powered) mark = point(this.exitFloor, this.exitFloor.gen.exit);
    else if (p.inventory.fuses + this.fusesInstalled >= this.def.fuses || (p.inventory.fuses && !items.some((q) => q.it.type === 'fuse' && !q.it.taken))) mark = point(this.fuseFloor, this.fuseFloor.gen.fusebox);
    else {
      const want = (type) => items.filter((q) => q.it.type === type && !q.it.taken)
        .sort((a, b) => (Math.abs(a.f.k - this.floorK) * 60 + Math.hypot(a.it.x - p.pos.x, a.it.z - p.pos.z)) - (Math.abs(b.f.k - this.floorK) * 60 + Math.hypot(b.it.x - p.pos.x, b.it.z - p.pos.z)));
      const lockedRoom = (q) => { const r = q.f.gen.rooms.find((o) => o.id === q.it.room); return !!(r && r.doors && r.doors.length && r.doors.every((d) => d.locked)); };
      const fuses = want('fuse');
      let pick = fuses.find((q) => !lockedRoom(q) || p.inventory.keys > 0) || want('key')[0] || fuses[0];
      if (pick) mark = roomMark(pick.f, pick.it.room) || point(pick.f, pick.it);
    }
    if (!mark) return;
    this.assist = mark; this.automap.dirty = true;
    this.stats.assists = (this.stats.assists || 0) + 1;
    this.hud.toast(this.diff.noMap ? 'Kamu merasa harus pergi ke suatu tempat…' : `Ada tanda di denahmu yang tidak kamu buat. (${this.input.touch ? 'PETA' : this.input.keyName('map')})`, 4.5);
    this.audio.whisper({ x: p.pos.x, y: 1.5, z: p.pos.z }, 0.25);
  }

  // ---------------------------------------------------------------- evidence
  // Hold the zoom on a resident: every second on tape counts towards its field
  // recording in the archive (kept between runs).
  updateFilm(dt, zoom) {
    const p = this.player;
    this.film = this.film || {};
    let fx = null;
    if (zoom && p.alive) {
      for (const e of this.entities) {
        const have = this.film[e.kind] || 0;
        if (have >= FILM_NEED || e.distTo(p.pos) > 30) continue;
        const head = e.headNode ? e.headNode.getWorldPosition(this._fv || (this._fv = new THREE.Vector3())) : (this._fv || (this._fv = new THREE.Vector3())).set(e.pos.x, 1.2, e.pos.z);
        head.project(this.camera);
        if (head.z >= 1 || Math.abs(head.x) > 0.55 || Math.abs(head.y) > 0.7 || !this.isSeenByPlayer(e)) continue;
        const now = Math.min(FILM_NEED, have + dt);
        this.film[e.kind] = now;
        fx = { kind: e.kind, f: now / FILM_NEED };
        this.hint('film', 'Kameramu merekam bukti. Tahan zoom ke arah penghuni sampai meterannya penuh untuk membuka rekaman lapangan di Arsip.', 5);
        if (now >= FILM_NEED) {
          this.stats.films = (this.stats.films || 0) + 1;
          this.audio.pickup();
          this.hud.caption(`📼 Bukti terekam: ${(ENTITY_INFO[e.kind] || {}).name} — lihat di Arsip`, 4);
          if (this.onFilm) this.onFilm(e.kind, now);
        } else if (Math.floor(now) !== Math.floor(have) && this.onFilm) this.onFilm(e.kind, now);
        break;
      }
    }
    this.filmFx = fx;
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
    // the floor plan: M opens it, R (or PETA again on touch) leafs through the floors
    if (input.consume('map')) {
      const a = this.automap;
      if (this.diff.noMap) this.hud.toast('Tidak ada denah di Mimpi Buruk.', 2);
      else if (!a.open) { if (p.alive) { a.setOpen(true); this.hint('map', 'Denah hanya memuat tempat yang sudah kamu lihat. Permainan TIDAK berhenti saat denah terbuka.', 5); } }
      else if (input.touch && a.seen.length > 1 && (a.view + 1) % a.seen.length !== this.floorK) a.cycle();
      else a.setOpen(false);
    }
    if (input.consume('mapfloor') && this.automap.open) this.automap.cycle();
    if (!p.alive && this.automap.open) this.automap.setOpen(false);
    this.automap.update(dt);
    this.prints.update(dt);
    { // the pocket radio hisses louder the nearer a resident is (within 22 m, through walls) - and a resident
      // right next to it hears it too
      let dmin = Infinity; for (const e of this.entities) if (e.form !== 'statue') dmin = Math.min(dmin, Math.hypot(e.pos.x - this.player.pos.x, e.pos.z - this.player.pos.z));
      const k = Math.max(0, 1 - dmin / 22); this.radioK = k;
      this.audio.setRadio(this.radioOn && this.player.alive, k, dt);
      if (this.radioOn && k > 0.25) this.hint('radio', 'Radio saku berdesis makin keras saat penghuni mendekat, bahkan dari balik tembok. Tapi dari dekat ia juga bisa mendengarnya: matikan (' + (this.input.touch ? 'tombol radio' : this.input.keyName('radio')) + ') saat bersembunyi.', 7);
      this.radioNoiseT = (this.radioNoiseT || 0) - dt;
      if (this.radioOn && k > 0.6 && this.radioNoiseT <= 0) { this.radioNoiseT = 1.5; this.emitNoise(this.player.pos.x, this.player.pos.z, 3 + k * 2.5, 'radio'); }
    }
    this.updateInstall(dt);
    this.updateStruggle(dt);
    { // where the torch beam lands: residents that cannot see you may still see your light on a dark wall
      this.beamT = (this.beamT || 0) - dt;
      if (this.beamT <= 0) {
        this.beamT = 0.25; this.beamSpot = null;
        const p = this.player, c = this.camera.position;
        if (p.flashlight && !p.hidden && p.alive && this.map) {
          const d = this.camera.getWorldDirection(this._bd || (this._bd = new THREE.Vector3())), h = Math.hypot(d.x, d.z);
          if (h > 0.25) for (let r = 1; r <= 12; r += 0.5) { const x = c.x + d.x / h * r, z = c.z + d.z / h * r; if (!this.map.los(c.x, c.z, x, z)) { const q = { x: c.x + d.x / h * (r - 0.6), z: c.z + d.z / h * (r - 0.6) }; if (!this.world.isLit(q.x, q.z)) this.beamSpot = q; break; } }
        }
      }
    }
    { // trails for the death debrief: the last 20 s of you and of every resident on this floor
      this.traceT = (this.traceT || 0) - dt;
      if (this.traceT <= 0) {
        this.traceT = 0.5;
        const T = this.trace || (this.trace = { k: this.floorK, p: [], e: new Map() });
        if (T.k !== this.floorK) { T.k = this.floorK; T.p = []; T.e.clear(); }
        T.p.push([this.player.pos.x, this.player.pos.z]); if (T.p.length > 40) T.p.shift();
        for (const e of this.entities) { const a = T.e.get(e) || []; a.push([e.pos.x, e.pos.z]); if (a.length > 40) a.shift(); T.e.set(e, a); }
      }
    }
    if (this.def.training) this.updateTraining();
    { // rain: loudness from open sky round the player; standing in it soaks your shoes
      const R = this.rain, m = this.map, p = this.player;
      let lv = 0;
      if (R.cells && m) {
        const [cx, cz] = m.cellOf(p.pos.x, p.pos.z);
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const x = cx + dx, z = cz + dz; if (m.inside(x, z) && R.open[x + z * m.W]) lv += dx === 0 && dz === 0 ? 8 : 1; }
        lv = Math.min(1, lv / 14);
        this.inRain = m.inside(cx, cz) && !!R.open[cx + cz * m.W] && !p.hidden;
        if (this.inRain) { this.prints.wetT = Math.max(this.prints.wetT, 18); this.hint('rain', 'Hujan menyamarkan langkahmu, tapi sepatumu basah: jejakmu akan tertinggal di lantai dalam.', 6); }
      } else this.inRain = false;
      this.audio.setRain(lv, dt);
      // lightning: a flicker of white down the shafts, thunder a moment later. In the flash you are
      // as visible as in daylight to anything that looks your way, and so are they to you.
      this.flashT = Math.max(0, (this.flashT || 0) - dt);
      if (R.cells && this.def.thunder !== false) {
        this.boltT = (this.boltT ?? 15 + Math.random() * 20) - dt;
        if (this.boltT <= 0) {
          this.boltT = 25 + Math.random() * 40;
          const k = Math.max(0.25, lv);
          this.flashT = 0.55; this.flashK = k;
          this.schedule(0.4 + Math.random() * 1.6, () => this.audio.thunder(0.4 + 0.6 * k));
          if (k > 0.5) this.input.rumble(300, 0.3 * k);
        }
      }
      const fl = this.flashT > 0 ? (this.flashT > 0.42 || (this.flashT > 0.18 && this.flashT < 0.28) ? 1 : 0.15) * (this.flashK || 1) : 0;
      this.ambient.color.setRGB(0.85 + fl * 0.1, 0.9 + fl * 0.05, 1);
      this.lightning = fl;
    }

    // camcorder zoom: narrower FOV, slower look, small battery cost
    const zoom = input.zooming() && p.alive && p.battery > 0;
    // being hunted: how close the nearest hunter is drives the red edge, a narrowing view, the riser and its footfalls in the camera
    { let dmin = Infinity; for (const e of this.chasers) dmin = Math.min(dmin, Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z));
      const want = this.chasers.size ? 0.45 + 0.55 * clamp(1 - dmin / 14, 0, 1) : 0;
      this.dread = damp(this.dread || 0, want, want > (this.dread || 0) ? 4 : 1.5, dt);
      this.audio.setChaseDist && this.audio.setChaseDist(this.chasers.size ? dmin : Infinity, dt);
      if (this.chasers.size && dmin < 7 && !this.calm && p.alive) { const a = (1 - dmin / 7) * 0.025; this.camera.position.x += (Math.random() - 0.5) * a; this.camera.position.y += (Math.random() - 0.5) * a; } }
    const fov = damp(this.camera.fov, zoom ? 26 : this.baseFov - (this.dread || 0) * (this.calm ? 2 : 7), 8, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    p.lookScale = fov / this.baseFov;
    p.zooming = zoom;
    if (zoom) p.battery = Math.max(0, p.battery - 0.15 * dt);
    p.update(dt, input, this.world, this);
    if (input.consume('throw')) this.throwEraser();
    if (input.consume('alarm')) this.setAlarm();
    if (input.consume('knock')) this.knock();
    if (input.consume('radio')) { this.radioOn = !this.radioOn; this.audio.click(); this.hud.toast(this.radioOn ? 'Radio saku menyala.' : 'Radio saku dimatikan.', 1.2); }
    this.updateAlarms(dt);
    this.updateProjectiles(dt);
    this.updateHints(dt);
    this.cullChunks(dt);
    this.adaptResolution(dt);
    this.interactor.update();
    if (!this.struggle && input.consume('interact') && !this.busy && p.alive) this.interactor.activate();

    this.updateLift(dt);
    this.updateSlide(dt);
    if (!this.liftRide && !this.slideRide) for (const e of this.entities) e.update(dt);
    this.anomalies.update(dt);
    this.odd.update(dt);
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
    this.updateFilm(dt, zoom);
    this.updateAssist(dt);
    this.doorSys.update(dt);
    this.cullDoors();
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
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      near = Math.min(near, d);
      const los = d < 18 && this.world.los(e.pos.x, e.pos.z, p.pos.x, p.pos.z);
      danger = Math.max(danger, clamp(1 - d / (los ? 16 : 9), 0, 1) * (los ? 1 : 0.6) * (e.form === 'statue' ? 0.3 + 0.7 * (e.wake || 0) : 1));
    }
    const chase = this.chasers.size > 0 ? 1 : 0;
    danger = Math.max(danger, chase * 0.55);
    this.danger = damp(this.danger, danger, 3, dt);
    if (this.graceT > 0) this.graceT -= dt;
    this.direct(dt, danger, chase);
    // listening: crouched (or hidden) and still for a second, the building quietens and footsteps stand out
    { const still = p.alive && (p.hidden || (p.crouched && (p.moving || 0) < 0.1));
      this.listenHold = still ? (this.listenHold || 0) + dt : 0;
      const k = this.listenHold > 1 ? 1 : 0;
      this.audio.setFocus(k, dt); this.focusing = !!k;
      if (k && this.entities.some((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 25)) this.hint('focus', 'Jongkok diam sebentar untuk menyimak: suara bangunan meredup dan langkah penghuni terdengar lebih jelas.', 5); }
    // near misses: a hunter passes within arm's reach of you (hidden or crouched) without noticing, then moves on
    for (const e of this.entities) {
      if (!e.sight || this.chasers.has(e) || !p.alive) { e.nearMiss = false; continue; }
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (d < 2.6 && (p.hidden || p.crouched) && (e.awareness || 0) < 0.45) e.nearMiss = true;
      else if (e.nearMiss && d > 4.5) {
        e.nearMiss = false;
        if (this.time - (this.lastNearMiss ?? -1e9) > 20) {
          this.lastNearMiss = this.time; this.stats.nearMisses = (this.stats.nearMisses || 0) + 1;
          p.fear = Math.max(p.fear, 0.9); this.audio.heartbeat(1); this.input.rumble(140, 0.5);
          this.hud.caption('…nyaris', 1.4);
          this.hint('nearmiss', 'Nyaris. Ia lewat tepat di sebelahmu tanpa melihat. Tunggu langkahnya menjauh sebelum bergerak.', 5);
        }
      }
    }
    // hallucinations: a long stretch of high fear starts to play tricks - a false alarm in the eye,
    // footsteps closing in from behind that stop dead, a figure that is not there
    if (p.fear > 0.55 && !chase && !p.hidden) this.fearT = (this.fearT || 0) + dt; else this.fearT = Math.max(0, (this.fearT || 0) - dt * 0.5);
    if (this.fearT > 14 && Math.random() < dt * 0.25) {
      this.fearT = 0; this.stats.hallucinations = (this.stats.hallucinations || 0) + 1;
      const r = Math.random();
      if (r < 0.35) { this.fakeHunt = 0.9; this.audio.stinger(); if (!this.clear && !this.calm) { this.glitch = Math.max(this.glitch, 0.3); this.schedule(0.25, () => { this.glitch = 0; }); } }
      else if (r < 0.75) for (let i = 0; i < 4; i++) this.schedule(i * 0.45, () => this.audio.heavyStep({ x: p.pos.x + Math.sin(p.yaw) * (5 - i), y: 0.2, z: p.pos.z + Math.cos(p.yaw) * (5 - i) }, 0.35 + i * 0.1));
      else if (this.odd) this.odd.spawnGhost();
      this.hint('hallu', 'Terlalu lama ketakutan, kamera dan telingamu mulai menipu. Tidak semua yang kamu dengar atau lihat itu nyata.', 6);
    }
    if (this.fakeHunt > 0) this.fakeHunt -= dt;
    // residents sharing a floor call each other: the hunter gives away where you are, the others cut you off
    if (this.entities.length > 1 && chase) {
      this.callT = (this.callT || 0) - dt;
      if (this.callT <= 0) {
        this.callT = 1.5;
        for (const A of this.chasers) {
          if (!A.lastSeen || this.time - A.lastSeen.t > 2) continue;
          for (const B of this.entities) {
            if (B === A || !B.receiveCall || Math.hypot(B.pos.x - A.lastSeen.x, B.pos.z - A.lastSeen.z) > 45) continue;
            if (B.receiveCall({ x: A.lastSeen.x, z: A.lastSeen.z }, A)) {
              this.stats.calls = (this.stats.calls || 0) + 1;
              this.hint('duo', 'Dua penghuni di lantai ini saling memanggil: saat satu mengejarmu, yang lain berlari menghadang dari depan.', 6);
            }
          }
        }
      }
    }
    this.updateTrail(dt);
    if (danger > 0.25 || chase || p.hidden) this.quietT = Math.max(0, this.quietT - dt * 4); else this.quietT += dt;
    p.fear = damp(p.fear, Math.max(this.danger, chase * 0.8), 2, dt);
    let interference = this.danger > 0.45 && !this.clear ? (Math.random() < this.danger * 0.25 ? 0.35 : 1) : 1;
    this.world.blackout = this.blackoutT > 0;
    if (this.blackoutT > 0) { this.blackoutT -= dt; interference = this.blackoutT < 0.6 || Math.random() < 0.02 ? 0.6 : 0.1; }
    if (this.calm) { this.flickerVal = Math.max(0.88, this.flickerVal); if (this.blackoutT <= 0) interference = Math.max(interference, 0.8); else interference = 0.1; }   // no strobing
    bakeUniforms.uFlicker.value = this.flickerVal;
    bakeUniforms.uPower.value = damp(bakeUniforms.uPower.value, interference, 20, dt);
    for (const f of this.floors) {
      const fm = f.built.fixtureMats;
      if (fm.flicker) fm.flicker.emissiveIntensity = this.flickerVal;
      if (fm.on) fm.on.emissiveIntensity = bakeUniforms.uPower.value;
      for (const g of f.built.glowMats) g.m.opacity = g.base * bakeUniforms.uPower.value * (g.flick ? this.flickerVal : 1) * (p.nightVision ? 0.4 : 1);
    }
    bakeUniforms.uNV.value = p.nightVision ? 0.55 : 0;
    bakeUniforms.uTime.value = this.time;
    { const L = p.light; L.shadow.autoUpdate = false; this.shadowTick = !this.shadowTick; if (L.castShadow && L.intensity > 0.5 && this.shadowTick) L.shadow.needsUpdate = true; }   // 30 Hz is plenty
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
    this.ambient.intensity = (p.nightVision ? 0.4 : 0.05) + (this.lightning || 0) * 1.4;

    // death sequence: snap to the resident's face, FOV punch, fall, cut to static
    if (this.deathT >= 0) {
      this.deathT += dt;
      const k = this.killer, T0 = this.deathT, T = Math.max(0, T0 - (this.scareDelay || 0));   // T: time since the hit
      const pre = T0 < (this.scareDelay || 0);   // the silent beat before a 'still' catch
      if (this.scareStyle === 'drop') k.dropY = Math.max(0, 1.8 * (1 - T / 0.22));
      const head = k.headNode ? k.headNode.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(k.pos.x, 1.7, k.pos.z);
      const dx = k.pos.x - p.camera.position.x, dz = k.pos.z - p.camera.position.z;
      const dist = Math.hypot(dx, dz);
      // pull it right up to the lens and make it face us
      const want = { centipede: 1.0, eyes: 0.9, spider: 1.3, clock: 0.8, weaver: 0.9, echo: 1.0, squid: 0.9 }[k.kind] ?? 0.62;
      // it lunges right into the lens, then settles back a little: the face fills the frame for an instant
      const reach = T0 < (this.scareDelay || 0) ? want * 1.6 : T < 0.18 ? want * 0.55 : want;
      if (dist > reach) { const step = Math.min(dist - reach, dt * (T < 0.18 ? 26 : 5)); k.pos.x -= (dx / dist) * step; k.pos.z -= (dz / dist) * step; }
      else if (T >= 0.18 && dist < want) { const step = Math.min(want - dist, dt * 1.5); k.pos.x += (dx / dist) * step; k.pos.z += (dz / dist) * step; }
      k.yaw = Math.atan2(-dx, -dz);
      const hx = head.x - p.camera.position.x, hz = head.z - p.camera.position.z;
      const tYaw = Math.atan2(-hx, -hz);
      const tPitch = Math.atan2(head.y - p.camera.position.y, Math.hypot(hx, hz));
      let dy = tYaw - p.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      const snap = Math.min(1, dt * (T0 < (this.scareDelay || 0) ? 2.5 : T < 0.3 ? 30 : 10));
      p.yaw += dy * snap; p.pitch += (tPitch - p.pitch) * snap;
      p.lookLock = true;
      // lens punch-in, then the camcorder drops
      const fovT = pre ? this.baseFov : T < 0.12 ? 44 : T < 1.0 ? 50 : 50 + (T - 1.0) * 30;
      this.camera.fov += (fovT - this.camera.fov) * Math.min(1, dt * 18); this.camera.updateProjectionMatrix();
      this.deathRoll = T > 1.0 ? Math.min(1.3, (T - 1.0) * 2.4) : 0;
      this.deathDrop = T > 1.0 ? Math.min(1.1, (T - 1.0) * 2.0) : 0;
      { // the camera is knocked about: hard at the hit, softer while it stares, again on the second flash
        const amp = pre ? 0.004 : this.scareLv === 'tenang' ? 0.01 : (this.scareLv === 'lembut' ? 0.5 : 1) * (T < 0.35 ? 0.16 * (1 - T / 0.35) + 0.04 : T > 1.12 && T < 1.3 ? 0.09 : 0.02) * (this.clear ? 0.6 : 1);
        p.camera.position.x += (Math.random() - 0.5) * amp; p.camera.position.y += (Math.random() - 0.5) * amp;
        p.camera.rotation.z += (Math.random() - 0.5) * amp * 0.8;
      }
      // flash frames: red, negative, red at the hit; a negative frame and its face once more just before the tape dies
      if (this.scareLv === 'lembut') this.scareFrame = !pre && T < 0.06 ? 1 : 0;
      else if (this.scareLv === 'penuh') {
        this.scareFrame = pre ? 0 : T < 0.05 ? 1 : T < 0.09 ? 2 : T < 0.13 ? 1 : T > 1.15 && T < 1.21 ? 2 : 0;
        if (T > 1.15 && !this.faceFlashed) { this.faceFlashed = true; this.audio.flashHit(); this.ui.faceFlash && this.ui.faceFlash(k.kind); }
      } else this.scareFrame = 0;
      // short tear on impact, a clean look at its face, then the tape breaks up
      this.glitch = this.clear || pre ? 0 : T < 0.08 ? 0.7 : T < 1.0 ? 0.04 : clamp((T - 1.0) * 1.2, 0, 1);
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
    { let w = 0, who = null; for (const e of this.entities) if ((e.awareness || 0) > w) { w = e.awareness; who = e; }
      this.audio.setWatch(Math.min(1, w), chase, dt);
      this.stats.maxWatch = Math.max(this.stats.maxWatch || 0, chase ? 1 : w);
      // a peek: leaning out with a resident in view, unnoticed
      if (Math.abs(p.lean || 0) > 0.15 && !chase && w < 0.45 && this.entities.some((e) => this.isSeenByPlayer(e))) this.peekT = (this.peekT || 0) + dt; else this.peekT = 0;
      if (p.peekDoor && this.entities.some((e) => this.isSeenByPlayer(e))) this.stats.keyholeSpots = (this.stats.keyholeSpots || 0) + 1;
      if (this.peekT > 1.5) { this.peekT = -1e9; this.stats.peeks = (this.stats.peeks || 0) + 1; }
      // first time something half-notices you: say what the eye means
      if (w > 0.35 && !chase && who) this.hint('watch', 'Ikon mata terisi: penghuni mulai menyadarimu. Jongkok, matikan senter, menjauh dari pandangannya, atau berlindung di balik meja sebelum matanya penuh.', 6);
      if (p.crouched && w > 0.05 && !chase) this.hint('crouch_cover', 'Saat jongkok di balik meja, peti, atau bangku, penghuni tidak bisa melihatmu. ' + (this.input.touch ? 'Tahan tombol condong' : 'Tahan ' + this.input.keyName('leanLeft') + ' / ' + this.input.keyName('leanRight')) + ' untuk mengintip dari balik sudut.', 6); }
    this.hud.update(dt, this);
    input.endFrame();
  }

  render(t) {
    if (this.prints && this.map) this.prints.render();
    const u = this.vhs.uniforms;
    if (this.deathT >= 0 && this.deathRoll) {
      this.camera.rotation.z += this.deathRoll * 0.9;
      this.camera.position.y -= this.deathDrop;
    }
    u.uDanger.value = this.state === 'playing' ? (this.deathT >= 0 && this.deathT < 1 ? 0.15 : this.danger) : 0;
    u.uNV.value = this.player.nightVision ? 1 : 0;
    u.uFlash.value = this.calm ? Math.min(0.3, this.lightning || 0) : (this.lightning || 0);
    u.uScare.value = this.deathT >= 0 ? (this.scareFrame || 0) : 0;
    u.uChase.value = this.state === 'playing' && this.deathT < 0 ? (this.dread || 0) * (this.calm ? 0.4 : 1) : 0;
    u.uPulse.value = Math.exp(-Math.max(0, this.time - (this.beatAt ?? -9)) * 5);
    u.uGlitch.value = Math.max(this.glitch, (this.gazeFx || 0) * 0.3);
    u.uBattery.value = this.player.battery / 100;
    this.dust.update(this.camera, t, Math.min(1, this.player.light.intensity / 9), this.vhs.target.height);
    if (this.rain.cells) this.rain.update(this.camera, t, 0.35 + 0.65 * bakeUniforms.uPower.value + (this.flashT > 0 ? 2 : 0));
    { const fl = Math.min(1, this.player.light.intensity / 9), rdt = Math.min(0.1, Math.max(0, t - (this.lastRenderT ?? t)));
      this.beam.update(t, fl, this.fxQ ? this.haze : 0);
      const V = this.vhs.uniforms, on = this.fxQ > 0 && !this.mistOff && this.state !== 'menu' && !!this.map && !this.player.nightVision;
      V.uMist.value = on ? this.mist.u.uAmt.value : 0;
      if (on) {
        const gy = this.groundY(this.player.pos.x, this.player.pos.z);
        this.mistY = (this.mistY ?? gy) + (gy - (this.mistY ?? gy)) * Math.min(1, rdt * 3);
        V.uGround.value = this.mistY; V.uMistLight.value = fl;
        V.uMistCol.value.copy(this.mist.u.uCol.value).multiplyScalar(0.35 + 0.65 * bakeUniforms.uPower.value);
      } }
    updateSkyEyes(t, Math.min(0.1, Math.max(0, t - (this.lastRenderT ?? t))), bakeUniforms.uPower.value); this.lastRenderT = t;
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
    this.paT = this.def.paBlackout ? 40 + Math.random() * 30 : 75 + Math.random() * 60;
    const early = this.def.id === 1;
    const r = Math.random();
    const kind = this.def.paBlackout && r < 0.7 ? 'blackout' : r < (early ? 0.6 : 0.4) ? 'flavor' : (early || r < 0.72) ? 'locate' : 'blackout';
    const themed = PA_THEME[this.def.arch];
    const lines = kind === 'flavor' && themed && Math.random() < 0.7 ? themed : PA_LINES[kind];
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

  // where the last recording of this level ended: your old battery is still there
  placeGrave(G) {
    const f = this.floors[G.k];
    if (!f || !this.assets.models.item_battery) return;
    const b = f.field.sample(G.x, 0.3, G.z, null, null, null, null);
    const obj = cloneWithBake(this.assets.models.item_battery, [Math.max(0.2, b[0]), b[1]], 0.25);
    obj.position.set(G.x, 0.03, G.z); obj.rotation.y = G.x * 7.3;
    f.built.root.add(obj);
    f.built.items.push({ type: 'battery', grave: true, x: G.x, y: 0, z: G.z, obj, taken: false });
  }

  // ---------------------------------------------------------------- alarm clock
  // Set down at your feet; rings 5 s later for 9 s and every resident that can
  // hear it comes to look. One use each.
  setAlarm() {
    const p = this.player;
    if (p.hidden || !p.alive || this.busy) return;
    if (!p.inventory.alarms) { this.hud.toast('Kamu tidak membawa jam weker'); return; }
    let x = p.pos.x - Math.sin(p.yaw) * 0.55, z = p.pos.z - Math.cos(p.yaw) * 0.55;
    if (!this.world.los(p.pos.x, p.pos.z, x, z)) { x = p.pos.x; z = p.pos.z; }
    p.inventory.alarms--;
    const b = this.field.sample(x, 0.3, z, null, null, null, null);
    const obj = cloneWithBake(this.assets.models.item_alarm, [Math.max(0.2, b[0]), b[1]], 0.25);
    obj.position.set(x, (p.y || 0) + 0.106, z); obj.rotation.y = p.yaw; obj.scale.setScalar(1.4);
    this.levelRoot.add(obj);
    this.alarms.push({ obj, x, z, y: obj.position.y, t: 0, ringT: 0, floor: this.floorK, rot: p.yaw });
    this.audio.click();
    this.stats.alarms = (this.stats.alarms || 0) + 1;
    this.hud.toast('Jam weker diputar… 5 detik. Menjauh!', 2.5);
  }
  updateAlarms(dt) {
    for (const A of this.alarms) {
      if (A.done) continue;
      A.t += dt;
      if (A.t < 5) { if (Math.floor(A.t * 2) !== Math.floor((A.t - dt) * 2) && A.floor === this.floorK) this.audio.tick({ x: A.x, y: 0.2, z: A.z }, 0.35); continue; }
      if (A.t > 14) { A.done = true; A.obj.position.set(A.x, A.y, A.z); A.obj.rotation.set(0, A.rot, 0.0); continue; }
      A.obj.position.x = A.x + (Math.random() - 0.5) * 0.012; A.obj.position.z = A.z + (Math.random() - 0.5) * 0.012;
      A.obj.rotation.z = (Math.random() - 0.5) * 0.12;
      A.ringT -= dt;
      if (A.ringT <= 0 && A.floor === this.floorK) {
        A.ringT = 0.8;
        this.audio.alarmRing({ x: A.x, y: 0.2, z: A.z });
        // louder than anything the player does: it pulls residents off a search, not off a chase
        let heard = 0;
        for (const e of this.entities) {
          const d = Math.hypot(e.pos.x - A.x, e.pos.z - A.z), r = NOISE.alarm * this.diff.hearing * (this.world.los(e.pos.x, e.pos.z, A.x, A.z) ? 1 : 0.7);
          if (d < r && d > 1.5) { e.onNoise(A.x, A.z, 1 - d / r, 'alert'); heard++; }
        }
        if (heard && !A.lured) { A.lured = true; this.stats.lures = (this.stats.lures || 0) + 1; }
      }
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
      // a hit on a resident's head or body: it flinches (longer for a head shot), and the eraser drops
      if (!pr.hit) for (const e of this.entities) {
        if (e.form === 'statue' || !e.sight) continue;
        const dx = nx - e.pos.x, dz = nz - e.pos.z, rr = (e.radius || 0.4) + 0.15;
        if (dx * dx + dz * dz > rr * rr || ny < 0.4 || ny > 2.3) continue;
        const head = ny > 1.35;
        e.stunT = Math.max(e.stunT || 0, head ? 1.1 : 0.5);
        if (!this.chasers.has(e)) { e.awareness = Math.max(e.awareness || 0, 0.7); e.glimpse = { x: this.player.pos.x, z: this.player.pos.z, t: this.time }; }
        pr.hit = true; this.audio.clack({ x: nx, y: ny, z: nz }); if (this.audio.ready) this.audio._thud(null, this.audio.t, 0.25);
        this.stats.headshots = (this.stats.headshots || 0) + (head ? 1 : 0); this.stats.bodyHits = (this.stats.bodyHits || 0) + 1;
        if (head) this.hud.caption('— kena kepala —', 1.2);
        this.hint('hit', 'Lemparan yang mengenai penghuni membuatnya terhuyung sesaat (lebih lama kalau kena kepala), tapi ia tahu dari mana datangnya.', 6);
        v.x *= -0.2; v.z *= -0.2; nx = o.position.x; nz = o.position.z;
        break;
      }
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
    if (this.state !== 'playing' || !CUES[kind]) return;
    const p = this.player;
    const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d > 32) return;
    // sound ring: an arc round the crosshair pointing at the sound (red for the residents' own noises)
    if (this.settings.soundRing && !((kind === 'door' || kind === 'locker' || kind === 'glass') && d < 3)) {
      const rel = angleDiff(Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw)), Math.atan2(dx, dz));
      this.hud.ping(-rel, Math.max(0.25, 1 - d / 32), ['step', 'whistle', 'hiss', 'chorus', 'scream', 'bones', 'squelch', 'tick', 'chime', 'whisper', 'scrape', 'sniff'].includes(kind));
    }
    if (!this.settings.subs) return;
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
    if (!p.hidden && this.built.lockers.some((L) => Math.hypot(L.x - p.pos.x, L.z - p.pos.z) < 2.2)) { const L = this.built.lockers.find((q) => Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < 2.2), n = hideOf(L).label; this.hint('locker', `${n[0].toUpperCase() + n.slice(1)} bisa dipakai untuk bersembunyi.`, 4); }
    const first = this.entities[0];
    if (first && this.hintT > 10 && ENTITY_INFO[first.kind] && ENTITY_INFO[first.kind].hint) this.hint('ent_' + first.kind + (first.statue ? '_statue' : ''), first.hintText || ENTITY_INFO[first.kind].hint, first.statue ? 8 : 6);
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
      for (const m of f.built.hideMeshes || []) m.visible = show && m.userData.pts.some(([x, z]) => (x - c.x) ** 2 + (z - c.z) ** 2 < far * far);
    }
  }
  // doors are one batch per model: each frame keep only the ones in fog range and in view
  cullDoors() {
    const cam = this.camera, c = cam.position, far = this.player.nightVision ? 40 : 34;
    cam.updateMatrixWorld();
    this._frus = this._frus || new THREE.Frustum(); this._pv = this._pv || new THREE.Matrix4();
    this._frus.setFromProjectionMatrix(this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (const f of this.floors) {
      const show = f.built.root.visible;
      for (const b of f.built.doorBatches || []) { b.cull(c.x, c.z, far, show, this._frus, f.built.root.matrixWorld); b.refresh(); }
    }
  }
  // frame-time average for the FPS readout; the resolution itself is governed by autoRes()
  adaptResolution() {
    this.frameEma += (this.realDt - this.frameEma) * 0.05;
  }

  // training: steps ticked off as the player does them
  trainingSteps() {
    const p = this.player, st = this.stats, inp = this.input, T = inp.touch;
    const k = (a) => (T ? '' : ` [${inp.keyName(a)}]`);
    return [
      ['crouch', `Jongkok${k('crouch')}`, () => p.crouched],
      ['lean', `Condong ke kiri atau kanan${T ? '' : ` [${inp.keyName('leanLeft')}/${inp.keyName('leanRight')}]`}`, () => (st.leans || 0) > 0],
      ['knock', `Ketuk dinding${k('knock')}`, () => (st.knocks || 0) > 0],
      ['hide', `Sembunyi di loker dan tahan napas${k('breath')}`, () => !!p.hidden && p.holdingBreath],
      ['wedge', 'Ganjal pintu (jongkok + interaksi di pintu tertutup)', () => (st.wedges || 0) > 0],
      ['escape', 'Lolos sekali dari kejaran Jam Berlidah', () => (st.escapes || 0) > 0],
    ];
  }
  updateTraining() {
    if (this.hud.objT < 1) { this.hud.objT = 1; this.hud.objectives.classList.add('show'); }   // the checklist stays up
    const done = this.trainDone || (this.trainDone = new Set());
    for (const [id, text, test] of this.trainingSteps()) {
      if (done.has(id) || !test()) continue;
      done.add(id); this.audio.click();
      this.hud.toast(`✓ ${text}`, 1.8); this.hud.showObjectives(this.objectiveText(), 3);
    }
    if (done.size === this.trainingSteps().length && !this.trainFinished) {
      this.trainFinished = true;
      this.schedule(2, () => this.hud.toast('Latihan selesai. Kamu siap merekam. Kembali ke menu…', 4));
      if (this.onTrainingDone) this.onTrainingDone();
    }
  }
  objectiveText() {
    if (this.def && this.def.training) {
      const done = this.trainDone || new Set();
      return ['LATIHAN — Ruang Latihan', ...this.trainingSteps().map(([id, text]) => `${done.has(id) ? '■' : '□'} ${text}`)].join('\n');
    }
    const p = this.player;
    const lines = [`${this.def.code} — ${this.def.name}`];
    if (!this.powered) {
      lines.push(`□ Kumpulkan sekring (${p.inventory.fuses + this.fusesInstalled}/${this.def.fuses})`);
      lines.push(`□ Pasang di kotak panel (${this.fusesInstalled}/${this.def.fuses})`);
    } else lines.push('■ Listrik menyala');
    lines.push(this.powered ? '□ Keluar lewat pintu darurat' : '□ Pintu darurat (terkunci)');
    return lines.join('\n');
  }

  // the floor plan with how it ended: your path (dark), the resident's (red, dotted), an X where it caught you
  drawDebrief(cv) {
    const T = this.trace, killer = this.killer;
    if (!T || !this.automap || T.k !== this.floorK) return false;
    const P = this.player;
    // make sure the last stretch is on the paper even if you never looked at it
    const s = this.automap.seen[this.floorK], m = this.map;
    for (const [x, z] of [...T.p, ...((killer && T.e.get(killer)) || [])]) { const [cx, cz] = m.cellOf(x, z); if (m.inside(cx, cz)) s[cx + cz * m.W] = 1; }
    const off = document.createElement('canvas'); let box = null, uu = 8;
    this.automap.draw(off, (c, u, at) => {
      uu = u; box = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, z] of [...T.p, ...((killer && T.e.get(killer)) || [])]) { const [a, b] = at(x, z); box[0] = Math.min(box[0], a); box[1] = Math.min(box[1], b); box[2] = Math.max(box[2], a); box[3] = Math.max(box[3], b); }
      const line = (pts, col, dash, w) => { if (pts.length < 2) return; c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash); c.beginPath(); pts.forEach(([x, z], i) => { const [a, b] = at(x, z); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke(); c.setLineDash([]); };
      line(T.p, 'rgba(42,38,30,0.85)', [], 2.5);
      for (const [e, pts] of T.e) line(pts, e === killer ? '#b3261e' : 'rgba(179,38,30,0.45)', [5, 4], e === killer ? 3 : 2);
      const [x, z] = at(P.pos.x, P.pos.z), r = Math.max(5, u * 0.6);
      c.strokeStyle = '#b3261e'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - r, z - r); c.lineTo(x + r, z + r); c.moveTo(x + r, z - r); c.lineTo(x - r, z + r); c.stroke();
    });
    if (!box) return false;
    // crop to the chase, at least 7 cells across, padded by two
    const pad = 10, mg = uu * 2, cx = (box[0] + box[2]) / 2 + pad, cz = (box[1] + box[3]) / 2 + pad;
    const w = Math.max(box[2] - box[0] + mg * 2, uu * 7), hgt = Math.max(box[3] - box[1] + mg * 2, uu * 5);
    const W = Math.max(w, hgt * 1.4), H = W / 1.4;
    const sc = Math.min(3, 480 / W);
    cv.width = Math.round(W * sc); cv.height = Math.round(H * sc);
    const c2 = cv.getContext('2d'); c2.fillStyle = '#e6dfc8'; c2.fillRect(0, 0, cv.width, cv.height); c2.imageSmoothingEnabled = true;
    c2.drawImage(off, cx - W / 2, cz - H / 2, W, H, 0, 0, cv.width, cv.height);
    return true;
  }

  deathCause(k) {
    const why = this.lockerReason; this.lockerReason = null;
    if (why === 'seen') return `${(ENTITY_INFO[k.kind] || {}).name || 'Penghuni'} melihatmu masuk ke ${hideOf(k.lockerTarget).label}. Bersembunyilah saat tidak sedang terlihat.`;
    if (why === 'light') return `${(ENTITY_INFO[k.kind] || {}).name || 'Penghuni'} melihat cahaya senter dari celah ${hideOf(k.lockerTarget).label}. Matikan senter sebelum bersembunyi.`;
    if (why === 'breath') return `${(ENTITY_INFO[k.kind] || {}).name || 'Penghuni'} mendengar napasmu. Saat ada yang mendekati tempat persembunyianmu, tahan napas (${this.input.touch ? 'tombol NAPAS' : 'SPASI'}) sampai langkahnya pergi.`;
    if (this.blackoutT > 0 && !k.statue && (k.kind === 'echo' || k.kind === 'gaper')) return `Lampu padam, dan dalam gelap ${ENTITY_INFO[k.kind].name} bebas bergerak. Nyalakan senter saat listrik mati.`;
    return k.deathText || (ENTITY_INFO[k.kind] && ENTITY_INFO[k.kind].death) || 'Sesuatu menemukanmu.';
  }
}
