// Entity AI. Three original anomalies:
//  - Monitor:    patrols, sees & hears, chases with a whistle, checks lockers.
//  - Substitute: only moves while nobody is looking at it.
import * as THREE from 'three';
import { CELL, hideOf } from '../config.js';
import { findPath, randomReachableCell } from './path.js';
import { cloneWithBake } from '../level/builder.js';
import { applyEntityLook, lookIndex } from '../render/entityLook.js';
import { angleDiff, clamp } from '../util/rng.js';
const PV = new THREE.Vector3();

const TMP = new THREE.Vector3();

export class Entity {
  constructor(game, kind, spawnCell) {
    this.game = game;
    this.kind = kind;
    const assets = game.assets;
    const key = 'entity_' + kind;
    this.obj = applyEntityLook(cloneWithBake(assets.models[key], [0.5, 0], 0, lookIndex));
    this.obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    game.scene.add(this.obj);
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.actions = {};
    for (const clip of assets.animations[key] || []) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    const [x, z] = game.map.center(...spawnCell);
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.path = null; this.pathIdx = 0;
    this.state = 'patrol';
    this.stateT = 0;
    this.waitT = 1 + Math.random() * 2;
    this.bakeT = 0;
    this.radius = 0.35;
    this.speedMul = game.diff.speed * (game.def.speedMul || 1);
    this.stepAcc = 0;
    this.headNode = this.obj.getObjectByName('Head');
  }

  play(name, fade = 0.25, once = false) {
    const a = this.actions[name];
    if (!a || this.current === a) return a;
    a.reset();
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    return a;
  }

  cell() { return this.game.map.cellOf(this.pos.x, this.pos.z); }
  distTo(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  goTo(cx, cz) {
    const [sx, sz] = this.cell();
    this.path = findPath(this.game.map, sx, sz, cx, cz);
    this.pathIdx = 0;
    return !!this.path;
  }
  goToWorld(x, z) { const [cx, cz] = this.game.map.cellOf(x, z); this.finalPoint = { x, z }; return this.goTo(cx, cz); }

  // follow path; returns true when finished
  followPath(dt, speed) {
    if (!this.path || this.pathIdx >= this.path.length) {
      if (this.finalPoint) {
        const done = this.moveToward(this.finalPoint.x, this.finalPoint.z, dt, speed, 0.4);
        if (done) this.finalPoint = null;
        return done;
      }
      return true;
    }
    // string-pull: cut straight to a later cell on the path when the whole body fits (no zig-zag across open floor)
    this.smoothT = (this.smoothT || 0) - dt;
    if (this.smoothT <= 0 && !this.noSmooth && this.pathIdx < this.path.length - 1) {
      this.smoothT = 0.25;
      for (let k = Math.min(this.pathIdx + 5, this.path.length - 1); k > this.pathIdx; k--) {
        const [kx, kz] = this.game.map.center(...this.path[k]);
        if (this.clearRun(kx, kz, Math.min(this.radius, 0.4))) { this.pathIdx = k; break; }
      }
    }
    const [cx, cz] = this.path[this.pathIdx];
    const [wx, wz] = this.game.map.center(cx, cz);
    // open doors on the way
    const [mx, mz] = this.cell();
    if (mx !== cx || mz !== cz) {
      const d = { dx: Math.sign(cx - mx), dz: Math.sign(cz - mz) };
      if (Math.abs(cx - mx) + Math.abs(cz - mz) === 1) {
        const door = this.game.map.doorAt(mx, mz, d);
        if (door && door.openAmount < 0.7) {
          if (door.locked) { this.path = null; return true; }
          if (door.wedged) {
            // first look for a way round: if it is not much longer than going through, take it instead of battering
            if (this.wedgeChecked !== door) {
              this.wedgeChecked = door;
              const goal = this.path[this.path.length - 1], left = this.path.length - this.pathIdx;
              door.locked = true; const alt = findPath(this.game.map, mx, mz, goal[0], goal[1]); door.locked = false;
              if (alt && alt.length <= left + 6) { this.path = alt; this.pathIdx = 0; this.game.stats.wedgeDetours = (this.game.stats.wedgeDetours || 0) + 1; return false; }
            }
            this.velocity = 0; this.faceToward(door.x, door.z, dt); if (!this.game.batterDoor(door, this, dt)) return false;
          }
          this.game.doorSys.open(door, this, this.pos);
          this.faceToward(door.x, door.z, dt);
          if (door.openAmount < 0.6) { this.velocity = 0; return false; }
        }
      }
    }
    const isLast = this.pathIdx === this.path.length - 1 && !this.finalPoint;
    if (this.moveToward(wx, wz, dt, speed, isLast ? 0.3 : 0.6)) this.pathIdx++;
    return false;
  }

  moveToward(x, z, dt, speed, tol = 0.3, collide = false) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) { this.velocity = 0; return true; }
    const step = Math.min(d, speed * dt);
    let nx = this.pos.x + (dx / d) * step, nz = this.pos.z + (dz / d) * step;
    if (collide) [nx, nz] = this.game.world.collide(nx, nz, Math.min(this.radius, 0.4));   // doorways are 1.1 m: a wider body would wedge in them
    this.velocity = Math.hypot(nx - this.pos.x, nz - this.pos.z) / Math.max(dt, 1e-4);
    this.pos.x = nx; this.pos.z = nz;
    this.faceToward(x, z, dt, 8);
    return false;
  }
  faceToward(x, z, dt, rate = 6) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += angleDiff(this.yaw, target) * Math.min(1, rate * dt);
  }

  // is a straight run to (x, z) free for the whole body, not just its centre line?
  clearRun(x, z, half = 0.45) {
    const w = this.game.map, dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) return true;
    const ox = (-dz / d) * half, oz = (dx / d) * half;
    return w.los(this.pos.x, this.pos.z, x, z, true) && w.los(this.pos.x + ox, this.pos.z + oz, x + ox, z + oz, true) && w.los(this.pos.x - ox, this.pos.z - oz, x - ox, z - oz, true);
  }
  // where to stand to inspect a hiding spot: the furthest point in front of it that is real floor in view of its door
  lockerPoint(L) {
    const h = hideOf(L), m = this.game.map;
    const at = (f) => [L.x + Math.sin(L.rot) * f, L.z + Math.cos(L.rot) * f];
    const [ox, oz] = at(h.front + 0.25);
    for (const f of [h.inspect + (this.reach || 0), h.inspect, h.front + 0.5]) {
      const [x, z] = at(f), [cx, cz] = m.cellOf(x, z);
      if (m.reg(cx, cz) >= 0 && m.los(ox, oz, x, z)) return { x, z };
    }
    return { x: ox, z: oz };
  }

  // can this entity see the player? returns 0..1 strength
  sees(range, fovDeg) {
    const p = this.game.player;
    if (p.hidden || !p.alive) return 0;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    const vis = p.visibility(this.game.world);
    const r = range * this.game.diff.sight * (0.55 + vis * 0.45);
    if (d > r) return 0;
    if (d > 1.6) {
      const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz)));
      if (ang > (fovDeg * Math.PI / 360)) return 0;
    }
    if (!this.game.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) return 0;
    return clamp((1 - d / r) * 1.4 + 0.15, 0, 1) * Math.min(1.3, vis);
  }

  // is a spot on the floor plan in front of it, near enough and in plain view?
  seesSpot(q) {
    const dx = q.x - this.pos.x, dz = q.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d > 16 || d < 1) return false;
    if (this.sight[1] < 360 && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) * 360 / Math.PI > this.sight[1]) return false;
    return this.game.world.los(this.pos.x, this.pos.z, q.x, q.z);
  }

  // How fast this resident is noticing the player right now (awareness per second, 0 = not at all).
  // A sight cone with a narrow sharp centre and a short blurry edge that only catches movement;
  // light, crouching, standing still, the torch pointed at it, low cover and open sky all count.
  perceive(range, fovDeg) {
    const g = this.game, p = g.player;
    if (p.hidden || !p.alive) return 0;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const open = g.openness(p.pos.x, p.pos.z), mov = Math.min(p.moving || 0, 1.5);
    // how much of you there is to see
    let vis = g.world.isLit(p.pos.x, p.pos.z) || this.darkSight ? 1 : 0.45;   // some see as well in the dark
    if (p.flashlight) {
      vis += 0.45;
      // the beam pointed straight at it gives you away from far off
      const cd = g.camera.getWorldDirection(PV), q = (-dx * cd.x - dz * cd.z) / Math.max(d, 1e-3) / Math.max(Math.hypot(cd.x, cd.z), 1e-3);
      if (q > 0.85) vis += 0.8 * (q - 0.85) / 0.15;
    }
    if (g.lightning > 0.5 && g.inRain) vis = Math.max(vis, 1.6 * g.lightning);   // caught in the lightning
    if (p.crouched) vis *= 0.35;
    vis *= mov < 0.1 ? 0.55 : 0.8 + mov * 0.2;
    if (p.sprinting) vis *= 1.25;
    let R = range * g.diff.sight;
    if (open === 2) { R = Math.max(R * 2.4, 42); vis = Math.max(vis, p.crouched ? 0.55 : 0.9); }   // a figure against the open sky
    else if (open === 1) R *= 1.5;
    const reach = R * (0.4 + 0.6 * Math.min(vis, 1.2) / 1.2);
    if (d > reach) return 0;
    // where in the cone
    const ang = Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) * 180 / Math.PI, half = fovDeg / 2;
    let cone;
    if (half >= 180 || ang <= half) cone = 1;
    else if (ang <= half + 35 && d < reach * 0.4 && mov > 0.1) cone = 0.35;      // the corner of its eye: only movement
    else if (d < 1.3 && !p.crouched) cone = 1;                                    // brushed right past it
    else return 0;
    // leaning out: it can only see your head, so the line goes to the head and there is less of you
    const hp = p.headPos ? p.headPos() : { x: p.pos.x, z: p.pos.z, leaning: false };
    if (hp.leaning) {
      if (!g.world.los(this.pos.x, this.pos.z, hp.x, hp.z)) return 0;
      if (!g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) vis *= 0.45;      // body round the corner
    } else if (!g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) return 0;
    // cover: crouched behind a desk, a crate, a bench; anything tall hides you standing
    if (d > 1.6 && g.world.cover(this.pos.x, this.pos.z, p.pos.x, p.pos.z, p.crouched ? 0.7 : 1.75)) return 0;
    const k = Math.pow(1 - d / reach, 0.7);
    return cone * (vis * k * 3.2 + (d < 2.5 ? 4 * (1 - d / 2.5) : 0));
  }

  updateCommon(dt) {
    // occlusion: beyond the torch's shadow range and with walls in every line from the eye, it is not drawn
    // (three lines: centre and both flanks, so a wide body round a corner still shows)
    const cam = this.game.camera.position;
    this.cullT = (this.cullT || 0) - dt;
    if (this.cullT <= 0) {
      this.cullT = 0.2;
      const m = this.game.map, dx = this.pos.x - cam.x, dz = this.pos.z - cam.z, d = Math.hypot(dx, dz);
      let seen = d < 13 || !m;
      if (!seen) { const ox = -dz / d * (this.radius + 0.3), oz = dx / d * (this.radius + 0.3); seen = m.los(cam.x, cam.z, this.pos.x, this.pos.z) || m.los(cam.x, cam.z, this.pos.x + ox, this.pos.z + oz) || m.los(cam.x, cam.z, this.pos.x - ox, this.pos.z - oz); }
      if (!seen && this.game.openness && this.game.openness(this.pos.x, this.pos.z)) seen = true;   // open voids: other storeys look in
      this.culled = !seen;
      for (const c of this.obj.children) if (!c.isLight) c.visible = seen;
    }
    // far away the skeleton only needs ten updates a second
    this.mixAcc = (this.mixAcc || 0) + dt;
    if ((Math.hypot(cam.x - this.pos.x, cam.z - this.pos.z) < 20 && !this.culled) || this.mixAcc >= (this.culled ? 0.25 : 0.1)) { this.mixer.update(this.mixAcc); this.mixAcc = 0; }
    this.obj.position.copy(this.pos);
    if (this.dropY) this.obj.position.y += this.dropY;
    if (this.game.stairs && this.game.stairs.length) this.obj.position.y += this.game.groundY(this.pos.x, this.pos.z);
    this.obj.rotation.y = this.yaw;
    this.bakeT -= dt;
    if (this.bakeT <= 0) {
      this.bakeT = 0.25;
      const b = this.game.field.sample(this.pos.x, 1.4, this.pos.z, null, null, null, null);
      for (const m of this.obj.userData.bakeMats) m.userData.bake.value.set(Math.max(0.05, b[0]), b[1]);
    }
    // procedural fallback animation when the model has no clips
    if (!Object.keys(this.actions).length) {
      this.obj.position.y += Math.abs(Math.sin(performance.now() * 0.006)) * 0.05 * Math.min(1, (this.velocity || 0));
    }
  }

  onNoise() {}
  remove() { this.game.scene.remove(this.obj); }
}

// ---------------------------------------------------------------------------
// Configurable hunter: patrols, sees & hears, chases, checks hiding spots.
// Several residents (Petugas, Guru Bertopeng, Murid Pucat, Kelabang Murid) are tuned versions.
export class Monitor extends Entity {
  constructor(game, cell, kind = 'monitor', o = {}) {
    super(game, kind, cell);
    this.suspicion = 0;
    this.lastSeen = null;
    this.lostT = 0;
    this.searchPts = [];
    this.walk = o.walk ?? 1.55; this.run = (o.run ?? 4.35) * 0.92;   // a step slower than before: you can outrun them for a while
    this.sight = o.sight ?? [16, 120, 30, 360];   // range, fov, chase range, chase fov (360: once it has you it tracks you all round)
    this.lockers = o.lockers ?? true;
    this.stepEvery = o.stepEvery ?? 1.1;
    this.stepVol = o.stepVol ?? [0.35, 0.6];
    if (o.radius) this.radius = o.radius;
    this.play('Idle');
    this.whistleCd = 0;
    this.seenEnterLocker = false;
  }

  chaseSound() { this.game.audio.whistle(this.pos); }
  sense() {
    const c = this.state === 'chase';
    return this.sees(c ? this.sight[2] : this.sight[0], c ? this.sight[3] : this.sight[1]);
  }
  onIdle() {}

  setState(s) {
    if (this.state === s) return;
    this.state = s; this.stateT = 0; this.cautious = false;
    if (s === 'chase') {
      if (this.whistleCd <= 0) { this.chaseSound(); this.whistleCd = 12; }
      this.game.onChaseStart(this);
    }
  }

  onNoise(x, z, strength, type) {
    if (this.state === 'chase' || this.state === 'attack' || this.state === 'locker') return;
    // fooled twice in a minute by the same trick (a thrown eraser, an alarm clock, a knock), it starts to see through it
    if (['throw', 'alarm', 'knock'].includes(type)) {
      const g = this.game, log = (this.lureLog || (this.lureLog = {}))[type] = ((this.lureLog || {})[type] || []).filter((t) => g.time - t < 60);
      if (log.length >= 2 && Math.random() < 0.65) {
        this.awareness = Math.max(this.awareness || 0, 0.22); this.glimpse = { x, z, t: g.time };
        g.stats.luresIgnored = (g.stats.luresIgnored || 0) + 1;
        if (this.distTo(g.player.pos) < 25) g.hint('wise', 'Penghuni mulai tidak tertipu pengalih yang sama. Ganti cara: lempar, weker, atau ketuk dinding bergantian.', 6);
        return;
      }
      log.push(g.time);
    }
    // a faint everyday sound only makes it stop and look that way
    if (strength < 0.22 && ['step', 'door', 'pant', 'pickup', 'locker'].includes(type) && this.state === 'patrol') {
      this.awareness = Math.max(this.awareness || 0, 0.22); this.glimpse = { x, z, t: this.game.time }; this.waitT = Math.max(this.waitT || 0, 1.2);
      this.game.stats.glances = (this.game.stats.glances || 0) + 1;
      return;
    }
    this.investigatePt = { x, z };
    this.suspicion = Math.max(this.suspicion, type === 'alert' ? 0.75 : 0.35);
    this.setState('investigate');
    this.goToWorld(x, z);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt;
    this.whistleCd -= dt;
    // awareness: outside a chase it has to notice you first
    const hunting = this.state === 'chase' || this.state === 'attack';
    let see = 0;
    if (hunting) see = this.sense();
    else {
      const gain = this.perceive(this.sight[0], this.sight[1]) * (this.state === 'wait' ? 1.5 : this.cautious ? 1.25 : 1) * (g.def.awareMul || 1);
      if (gain > 0) { this.awareness = Math.min(1.2, (this.awareness || 0) + gain * dt); this.glimpse = { x: p.pos.x, z: p.pos.z, t: g.time }; }
      else if (this.spotsLight !== false && g.beamSpot && this.seesSpot(g.beamSpot)) {
        // your light moving on a dark wall: it comes to see where it is coming from (never past half-aware on light alone)
        if ((this.awareness || 0) < 0.6) this.awareness = Math.min(0.6, (this.awareness || 0) + 0.45 * dt);
        this.glimpse = { x: (g.beamSpot.x + p.pos.x) / 2, z: (g.beamSpot.z + p.pos.z) / 2, t: g.time };
        g.stats.beamSpotted = (g.stats.beamSpotted || 0) + dt;
      }
      else this.awareness = Math.max(0, (this.awareness || 0) - dt * 0.28);
      if (this.awareness >= 1) see = 1;
      this.checkDoors(dt);
      this.checkPrints(dt);
    }
    if (see > 0) {
      this.suspicion = Math.min(1.2, this.suspicion + see * dt * (this.distTo(p.pos) < 4 ? 6 : 1.9));
      this.lastSeen = { x: p.pos.x, z: p.pos.z, t: g.time };
      this.lostT = 0;
      const tr = this.trail || (this.trail = []);
      if (!tr.length || g.time - tr[tr.length - 1].t > 0.25) { tr.push({ x: p.pos.x, z: p.pos.z, t: g.time }); if (tr.length > 8) tr.shift(); }
    } else this.suspicion = Math.max(0, this.suspicion - dt * (this.state === 'chase' ? 0 : 0.12));

    // seen = hunted: no slow suspicion build-up, it comes straight for you and
    // keeps coming for as long as it can see you (or until you hide)
    if (see > 0 && this.state !== 'chase' && this.state !== 'attack' && (this.state !== 'locker' || !this.lockerSure)) {
      this.suspicion = 1.2; this.path = null; this.setState('chase');
    } else if (!hunting && this.state !== 'locker' && (this.awareness || 0) >= 0.45 && this.glimpse && g.time - this.glimpse.t < 0.3
      && (this.state !== 'investigate' || !this.investigatePt || Math.hypot(this.investigatePt.x - this.glimpse.x, this.investigatePt.z - this.glimpse.z) > 2.5)) {
      // half-noticed: go and see what moved there
      this.investigatePt = { x: this.glimpse.x, z: this.glimpse.z };
      this.suspicion = Math.max(this.suspicion, 0.65);
      this.setState('investigate'); this.lookT = 0; this.goToWorld(this.glimpse.x, this.glimpse.z);
    } else if (this.state !== 'chase' && this.state !== 'attack' && this.state !== 'locker' && this.suspicion >= 1) this.setState('chase');

    let speed = 0;
    switch (this.state) {
      case 'patrol': {
        this.checkLockers(dt);
        if (this.state !== 'patrol') break;
        // now and then it stops dead and listens: hearing far sharper for a few seconds
        if (this.listenT > 0) {
          this.listenT -= dt; this.velocity = 0; this.yaw += Math.sin(g.time * 1.3) * dt * 0.6;
          break;
        }
        if (this.hears !== false && g.time > (this.nextListen ?? (this.nextListen = g.time + 15 + Math.random() * 20)) && this.distTo(p.pos) < 26) {
          this.nextListen = g.time + 22 + Math.random() * 25; this.listenT = 3; this.velocity = 0;
          g.audio.sniff({ x: this.pos.x, y: 1.5, z: this.pos.z }); g.stats.listens = (g.stats.listens || 0) + 1;
          if (this.distTo(p.pos) < 16) g.hint('listen', 'Penghuni berhenti dan mengendus: saat itu pendengarannya jauh lebih tajam. Diam dulu sampai ia bergerak lagi.', 5);
          break;
        }
        if ((this.awareness || 0) > 0.18 && this.glimpse && g.time - this.glimpse.t < 1.5) {   // something there? stop and look
          this.velocity = 0; this.faceToward(this.glimpse.x, this.glimpse.z, dt, 3); this.waitT = Math.max(this.waitT || 0, 0.6); break;
        }
        if (this.waitT > 0) {
          this.waitT -= dt; this.velocity = 0;
          this.yaw += Math.sin(g.time * 0.7) * dt * 0.5;
          this.onIdle(dt);
          if (this.waitT <= 0) {
            const [cx, cz] = this.cell();
            // now and then it goes to look at the spot you keep hiding in
            const fav = this.lockers && g.favouriteHide && g.favouriteHide(this);
            if (fav) { fav.checkedT = g.time; this.searchPts = [{ L: fav }]; this.peek = null; this.peekNext = null; this.path = null; this.setState('search'); g.stats.favChecks = (g.stats.favChecks || 0) + 1; break; }
            const t = (g.pickPatrol && g.pickPatrol(this)) || randomReachableCell(g.map, Math.random, cx, cz, 4, 18);
            if (t) this.goTo(...t);
          }
          break;
        }
        speed = this.walk * this.speedMul;
        if (this.followPath(dt, speed)) this.waitT = 1.5 + Math.random() * 3;
        break;
      }
      case 'investigate': {
        speed = (this.intercept ? this.run * 0.8 : this.suspicion > 0.6 ? this.walk * 1.6 : this.walk * 1.15) * this.speedMul;
        // the last few metres to whatever it heard or glimpsed: slow, head sweeping, eyes sharper
        const ip = this.investigatePt, close = !this.intercept && ip && Math.hypot(ip.x - this.pos.x, ip.z - this.pos.z) < 3.5;
        this.cautious = !!close;
        if (close) speed *= 0.55;
        if (see > 0 && this.stateT > 0.5) { this.goToWorld(p.pos.x, p.pos.z); this.stateT = 0; }
        const arrived = this.followPath(dt, speed);
        if (this.cautious && !arrived) this.yaw += Math.sin(g.time * 2.3) * dt * 1.4;
        if (arrived) {
          this.velocity = 0;
          if (!this.lookT) this.lookT = 2.5;
          this.lookT -= dt;
          this.yaw += dt * 1.6;
          if (this.lookT <= 0) { this.lookT = 0; this.intercept = false; this.setState('patrol'); this.waitT = 0.5; }
        }
        this.checkLockers(dt);
        break;
      }
      case 'chase': {
        speed = this.run * this.speedMul * this.chasePace(dt);
        // the torch full in its face from close by: it flinches for a moment (not the blind, and only now and then)
        if (this.stunT > 0) { this.stunT -= dt; this.velocity = 0; this.faceToward(p.pos.x, p.pos.z, dt, 2); break; }
        if (p.flashlight && !p.hidden && this.kind !== 'pale' && g.time > (this.dazzleCd || 0)) {
          const d = this.distTo(p.pos), cd = g.camera.getWorldDirection(PV);
          const q = ((this.pos.x - p.pos.x) * cd.x + (this.pos.z - p.pos.z) * cd.z) / Math.max(d, 1e-3) / Math.max(Math.hypot(cd.x, cd.z), 1e-3);
          if (d < 5 && d > 1.4 && q > 0.94 && g.world.los(p.pos.x, p.pos.z, this.pos.x, this.pos.z)) {
            this.stunT = 0.9; this.dazzleCd = g.time + 15;
            p.battery = Math.max(0, p.battery - 3);
            g.audio.scrape(this.pos, 0.4, 0.35);
            g.stats.dazzles = (g.stats.dazzles || 0) + 1;
            g.hint('dazzle', 'Sorotan senter tepat ke wajahnya dari dekat membuatnya silau sesaat. Hanya sekali tiap beberapa belas detik — pakai untuk kabur.', 6);
            break;
          }
        }
        const d = this.distTo(p.pos);
        // saw them climb into the locker? then it knows exactly where they are
        if (p.hidden && this.lastSeen && g.time - this.lastSeen.t < 1.2) { this.targetLocker(p.hidden, true); break; }
        if (see > 0 && !p.hidden) {
          // run straight at them only when the whole body fits; otherwise go round by the cells
          this.detourT = (this.detourT || 0) - dt;
          let direct = this.detourT <= 0 && this.clearRun(p.pos.x, p.pos.z);
          if (!direct) {
            this.repathT = (this.repathT || 0) - dt;
            if (this.repathT <= 0 || !this.path) { this.repathT = 0.35; this.finalPoint = null; this.goTo(...g.map.cellOf(p.pos.x, p.pos.z)); }
            if (!this.path || this.followPath(dt, speed)) direct = true;
          }
          if (direct) {
            this.moveToward(p.pos.x, p.pos.z, dt, speed, 0.1, true);
            this.path = null;
            // pressed against a corner or a prop: stop pushing and path round it
            this.stuckT = (this.velocity || 0) < speed * 0.3 && d > 1.3 ? (this.stuckT || 0) + dt : 0;
            if (this.stuckT > 0.3) { this.stuckT = 0; this.detourT = 1.4; this.repathT = 0; }
          }
          if (d < 1.25) { this.attack(); break; }
        } else {
          this.lostT += dt;
          // lost sight: it runs on to where you were going, not to where you vanished
          if (!this.path && this.lastSeen) { const q = this.predictEscape(); this.goToWorld(q.x, q.z); }
          // the further you got before it lost you, the sooner it stops running and starts searching
          const gap = this.lastSeen ? Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) : 0;
          const giveUp = p.hidden ? 5 : gap > 18 ? 2.5 : gap > 12 ? 3.5 : 5;
          if (this.followPath(dt, speed) || this.lostT > giveUp) {
            this.setState('search');
            this.suspicion = 0.6;
            this.searchPts = this.planSearch();
            this.path = null;
          }
        }
        break;
      }
      case 'search': {
        speed = this.walk * 1.4 * this.speedMul;
        if (this.peek) {                                   // standing in front of a hiding spot, looking at it
          this.velocity = 0; this.faceToward(this.peek.x, this.peek.z, dt, 6);
          this.peekT -= dt; if (this.peekT <= 0) this.peek = null;
        } else if ((!this.path || this.pathIdx >= this.path.length) && !this.finalPoint) {
          if (this.peekNext) { this.peek = this.peekNext; this.peekNext = null; this.peekT = 1.3; break; }
          const n = this.searchPts.shift();
          if (!n) {
            g.onChaseEnd(this);
            this.suspicion = 0.2; this.awareness = 0.3;
            // sometimes it only pretends to give up: it stands stock-still near the spot, watching, then leaves
            if (!this.statue && this.lastSeen && Math.random() < 0.35) { this.setState('wait'); this.lurkT = 8 + Math.random() * 4; this.velocity = 0; g.stats.lurks = (g.stats.lurks || 0) + 1; }
            else { this.setState('patrol'); this.waitT = 1; }
          }
          else if (n.L) { const q = this.lockerPoint(n.L); if (this.goToWorld(q.x, q.z)) this.peekNext = n.L; else this.finalPoint = null; }
          else if (n.room) { (this.roomsSearched || (this.roomsSearched = new Map())).set(n.room, g.time); if (this.goTo(...n.c)) this.peekNext = n.look; g.stats.roomsSwept = (g.stats.roomsSwept || 0) + 1; }
          else this.goTo(...n);
          const [cx, cz] = this.cell(); (this.searched || (this.searched = new Map())).set(cx + cz * g.map.W, g.time);
        } else this.followPath(dt, speed);
        this.checkLockers(dt);
        break;
      }
      case 'wait': {   // silent, still, watching where it lost you
        this.velocity = 0;
        if (this.lastSeen) this.faceToward(this.lastSeen.x, this.lastSeen.z, dt, 1.2);
        this.yaw += Math.sin(g.time * 0.5) * dt * 0.25;
        this.checkLockers(dt);
        if (this.state !== 'wait') break;
        this.lurkT -= dt;
        if (this.lurkT <= 0) { this.setState('patrol'); this.waitT = 0.5; }
        break;
      }
      case 'locker': { // walking to / inspecting a locker
        const L = this.lockerTarget;
        speed = (this.lockerSure ? this.run : this.walk * 1.2) * this.speedMul;
        const { x: fx, z: fz } = this.lockerPt || (this.lockerPt = this.lockerPoint(L));   // long bodies stop further back so the head stays outside
        let arrived = (this.path && this.pathIdx < this.path.length) || this.finalPoint ? this.followPath(dt, speed) : this.moveToward(fx, fz, dt, speed, 0.25, false);
        // cannot get there (no way round, or wedged): close enough with the door in view counts, otherwise give up
        if (!arrived && !this.inspectT && this.stateT > 10) {
          if (this.distTo(L) < 3 && g.world.los(this.pos.x, this.pos.z, fx, fz)) arrived = true;
          else { this.setState('patrol'); this.waitT = 1; this.suspicion = 0.3; this.path = null; g.onChaseEnd(this); break; }
        }
        if (arrived || this.inspectT > 0 || this.distTo({ x: fx, z: fz }) < 0.35) {
          this.velocity = 0;
          this.faceToward(L.x, L.z, dt, 10);
          this.inspectT = (this.inspectT || 0) + dt;
          // only a breath it can actually hear for a while gives you away
          if (p.hidden === L && this.inspectT > 0.6 && !p.holdingBreath && this.game.time - (p.hideT || 0) > 1.0) this.breathHeard += dt;
          const caught = this.lockerSure || this.breathHeard > 1.3;
          if (caught && p.hidden === L) { this.game.lockerReason = this.lightLeak ? 'light' : this.lockerSure ? 'seen' : 'breath'; this.attack(L); break; }
          if (this.inspectT > 3.4) { if (p.hidden === L) g.stats.inspected = (g.stats.inspected || 0) + 1; this.inspectT = 0; this.setState('patrol'); this.waitT = 1; this.suspicion = 0.3; g.onChaseEnd(this); }
        }
        break;
      }
      case 'attack':
        this.velocity = 0;
        this.faceToward(p.camera.position.x, p.camera.position.z, dt, 12);
        break;
    }

    // animation by speed
    if (this.state !== 'attack' && !this.busyAnim) {
      const v = this.velocity || 0;
      if (v > this.walk * 1.7) this.play('Run'); else if (v > 0.2) this.play('Walk'); else this.play('Idle');
      if (this.current) this.current.timeScale = v > 0.2 ? clamp(v / (v > this.walk * 1.7 ? this.run : this.walk), 0.6, 1.6) : 1;
    }
    // heavy footsteps
    if ((this.velocity || 0) > 0.3) {
      this.stepAcc += (this.velocity || 0) * dt;
      if (this.stepAcc > this.stepEvery) { this.stepAcc = 0; g.audio.heavyStep(this.pos, this.stepVol[this.state === 'chase' ? 1 : 0]); }
    }
    this.updateCommon(dt);
  }

  // occasionally sniff out a breathing player in a nearby locker
  checkLockers(dt) {
    const p = this.game.player;
    if (!p.hidden || !this.lockers) return;
    const L = p.hidden;
    // a lit torch inside a hiding spot shows through every gap: in view and within 10 m, it knows
    if (p.flashlight && this.state !== 'locker') {
      const fd = hideOf(L).front + 0.3, fx = L.x + Math.sin(L.rot) * fd, fz = L.z + Math.cos(L.rot) * fd, dl = Math.hypot(fx - this.pos.x, fz - this.pos.z);
      if (dl < 10 && Math.abs(angleDiff(this.yaw, Math.atan2(fx - this.pos.x, fz - this.pos.z))) < 1.3 && this.game.world.los(this.pos.x, this.pos.z, fx, fz)) {
        this.game.stats.lightLeaks = (this.game.stats.lightLeaks || 0) + 1;
        this.targetLocker(L, true); this.lightLeak = true; return;
      }
    }
    const d = Math.hypot(L.x - this.pos.x, L.z - this.pos.z);
    const fd = hideOf(L).front + 0.3;
    if (d > 4.5 || !this.game.world.los(this.pos.x, this.pos.z, L.x + Math.sin(L.rot) * fd, L.z + Math.cos(L.rot) * fd)) return;
    const breathing = !p.holdingBreath;
    const chance = (breathing ? 0.35 + p.fear * 0.5 : 0.02) * this.game.diff.hearing * (1 - d / 4.5);
    if (Math.random() < chance * dt) this.targetLocker(L, false);
  }

  // Door memory: it remembers the doors it has seen on its rounds. One the player has opened
  // or shut since then is a trail: it gets suspicious and goes to look on the other side.
  checkDoors(dt) {
    const g = this.game;
    this.doorT = (this.doorT || 0) - dt;
    if (this.doorT > 0 || !g.built || !g.built.doors) return;
    this.doorT = 0.5;
    const mem = this.doorMem || (this.doorMem = new Map());
    if (this.doorFloor !== g.floorK) { mem.clear(); this.doorFloor = g.floorK; }
    for (const d of g.built.doors) {
      if (d.locked) continue;
      const dx = d.x - this.pos.x, dz = d.z - this.pos.z, dist = Math.hypot(dx, dz);
      if (dist > 11 || dist < 0.8) continue;
      // in front of it and in plain view (aim a little short of the door, on this side)
      if (Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > 1.3) continue;
      if (!g.world.los(this.pos.x, this.pos.z, d.x - dx / dist * 0.4, d.z - dz / dist * 0.4)) continue;
      const was = mem.get(d), now = d.target;
      mem.set(d, now);
      if (was === undefined || was === now || !d.byPlayer || this.state === 'locker') continue;
      // the far side of the doorway, if it is floor
      const fx = d.x + dx / dist * 1.6, fz = d.z + dz / dist * 1.6, [cx, cz] = g.map.cellOf(fx, fz);
      const at = g.map.reg(cx, cz) >= 0 ? { x: fx, z: fz } : { x: d.x, z: d.z };
      this.awareness = Math.max(this.awareness || 0, 0.55);
      this.glimpse = { x: at.x, z: at.z, t: g.time };
      g.stats.doorsNoticed = (g.stats.doorsNoticed || 0) + 1;
      break;
    }
  }

  // Wet footprints: a fresh trail in front of it is followed to its newest end.
  checkPrints(dt) {
    const g = this.game, P = g.prints;
    if (!P || !P.list.length || this.state === 'locker') return;
    this.printT = (this.printT || 0) - dt;
    if (this.printT > 0) return;
    this.printT = 0.6;
    const q = P.near(g.floorK, this.pos.x, this.pos.z, this.keenNose ? 11 : 7, this.keenNose ? 40 : 30);
    if (!q || q === this.lastPrint) return;
    const dx = q.x - this.pos.x, dz = q.z - this.pos.z;
    if (Math.hypot(dx, dz) > 1.2 && Math.abs(angleDiff(this.yaw, Math.atan2(dx, dz))) > 1.2) return;
    if (!g.world.los(this.pos.x, this.pos.z, q.x, q.z)) return;
    const end = P.trailEnd(q, 14);
    this.lastPrint = end;
    if (end === q && Math.hypot(dx, dz) < 1.5) return;   // standing on the last print already
    this.awareness = Math.max(this.awareness || 0, 0.55);
    this.glimpse = { x: end.x, z: end.z, t: g.time };
    g.stats.printsFollowed = (g.stats.printsFollowed || 0) + 1;
  }

  // Another resident is chasing the player and calls out where they are. Instead of
  // running after the same back it heads for the far side, to cut the player off.
  receiveCall(lkp, from) {
    const g = this.game, m = g.map;
    if (this.state === 'chase' || this.state === 'attack' || this.state === 'locker' || this.form === 'statue') return false;
    let dx = lkp.x - from.pos.x, dz = lkp.z - from.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    // the walkable cell nearest to a point 5 m beyond the player, reachable from here
    const [cx, cz] = this.cell(), dist = m.bfs(cx, cz), ax = lkp.x + dx * 5, az = lkp.z + dz * 5;
    let best = -1, bd = Infinity;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < 0 || (m.avoid && m.avoid[i])) continue;
      const [x, z] = m.center(i % m.W, (i / m.W) | 0), q = Math.hypot(x - ax, z - az);
      if (q < bd && Math.hypot(x - lkp.x, z - lkp.z) < 9) { bd = q; best = i; }
    }
    if (best < 0) return false;
    const [tx, tz] = m.center(best % m.W, (best / m.W) | 0);
    this.awareness = Math.max(this.awareness || 0, 0.6);
    this.suspicion = Math.max(this.suspicion, 0.9);
    this.investigatePt = { x: tx, z: tz }; this.intercept = true;
    this.setState('investigate'); this.lookT = 0; this.goToWorld(tx, tz);
    return true;
  }

  // How hard it is running right now, as a share of its top speed. A chase starts slower (a
  // head start), then every 5-8 s it falters for 1.5 s - it pants, hisses or stumbles, you can
  // hear it - and close behind a sprinting player it only just gains on them.
  chasePace(dt) {
    const g = this.game, p = g.player;
    if (this.stateT < 0.05) { this.lullT = 0; this.nextLull = 4 + Math.random() * 3; }
    let k = Math.min(1, 0.68 + this.stateT / 2.2 * 0.32);
    this.nextLull -= dt;
    if (this.nextLull <= 0 && this.lullT <= 0) {
      this.lullT = 1.5; this.nextLull = 5 + Math.random() * 3;
      g.audio.sniff && g.audio.sniff({ x: this.pos.x, y: 1.4, z: this.pos.z });
      g.stats.lulls = (g.stats.lulls || 0) + 1;
      if (this.distTo(p.pos) < 18) g.hint('lull', 'Pengejar sesekali melambat sebentar dan terengah: itu kesempatanmu memutus pandangannya.', 5);
    }
    if (this.lullT > 0) { this.lullT -= dt; k *= 0.55; }
    // a big body takes corners badly: a sharp turn costs it speed for a moment
    const turn = Math.abs(angleDiff(this.prevYaw ?? this.yaw, this.yaw)) / Math.max(dt, 1e-3); this.prevYaw = this.yaw;
    this.cornerT = turn > 2.6 ? 0.45 : Math.max(0, (this.cornerT || 0) - dt);
    if (this.cornerT > 0) k *= 0.72 - Math.min(0.12, (this.radius || 0.4) * 0.15);
    // close behind a sprinting player: barely faster than them, never a sudden burst
    const d = this.distTo(p.pos), ps = Math.hypot(p.vel.x, p.vel.y);
    if (d < 4 && ps > 3) k = Math.min(k, (ps * 1.03) / Math.max(0.1, this.run * this.speedMul));
    return k;
  }

  // Dead reckoning from the trail of sightings: the walkable cell nearest to where the
  // player would be 1.6 s after vanishing at their last speed (at most 7 m on), reachable
  // within a few cells of the vanishing point.
  predictEscape() {
    const g = this.game, m = g.map, ls = this.lastSeen, tr = this.trail || [];
    const old = tr.filter((q) => ls.t - q.t >= 0.4).pop();
    if (!old || ls.t - old.t > 1.6) return ls;
    const dt = Math.max(0.2, ls.t - old.t), vx = (ls.x - old.x) / dt, vz = (ls.z - old.z) / dt, sp = Math.hypot(vx, vz);
    if (sp < 0.6) return ls;
    const k = Math.min(1.6, 7 / sp), tx = ls.x + vx * k, tz = ls.z + vz * k;
    const [lx, lz] = m.cellOf(ls.x, ls.z), dist = m.bfs(lx, lz);
    let best = null, bd = Infinity;
    for (let i = 0; i < dist.length; i++) {
      if (dist[i] < 0 || dist[i] > 4) continue;
      const [x, z] = m.center(i % m.W, (i / m.W) | 0), d = Math.hypot(x - tx, z - tz);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (!best) return ls;
    this.predicted = best; g.stats.predicted = (g.stats.predicted || 0) + 1;
    return Math.hypot(best.x - ls.x, best.z - ls.z) < 1 ? ls : best;
  }

  // Where to look after losing them: ahead along the way they were running,
  // the hiding spots nearest that guess, and one spot nearby it has not
  // searched lately. It knows nothing about where the player really is.
  planSearch() {
    const g = this.game, m = g.map, ls = this.lastSeen, tr = this.trail || [], pts = [];
    if (!ls) return pts;
    this.peek = null; this.peekNext = null;
    const old = tr.filter((q) => ls.t - q.t >= 0.5).pop() || tr[0];
    let hx = 0, hz = 0;
    if (old) { const dx = ls.x - old.x, dz = ls.z - old.z, d = Math.hypot(dx, dz); if (d > 0.4) { hx = dx / d; hz = dz / d; } }
    const [lx, lz] = m.cellOf(ls.x, ls.z), dist = m.bfs(lx, lz);
    const fresh = (i) => !this.searched || !(g.time - (this.searched.get(i) ?? -1e9) < 30);
    const guess = { x: ls.x + hx * 9, z: ls.z + hz * 9 };
    // 1. the cell nearest to where they were heading
    if (hx || hz) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < dist.length; i++) {
        if (dist[i] < 1 || dist[i] > 6 || (m.avoid && m.avoid[i]) || !fresh(i)) continue;
        const [x, z] = m.center(i % m.W, (i / m.W) | 0), q = Math.hypot(x - guess.x, z - guess.z);
        if (q < bd) { bd = q; best = i; }
      }
      if (best >= 0) pts.push([best % m.W, (best / m.W) | 0]);
    }
    // 2. up to two hiding spots near the guess (or near where it lost them)
    const at = hx || hz ? guess : ls;
    const spots = (g.built.lockers || []).filter((L) => { const [cx, cz] = m.cellOf(L.x, L.z), i = cx + cz * m.W; return dist[i] >= 0 && dist[i] <= 6 && Math.hypot(L.x - ls.x, L.z - ls.z) < 12; })
      .sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z)).slice(0, 3);
    for (const L of spots.slice(0, Math.random() < 0.5 ? 1 : 2)) if (this.lockers) pts.push({ L });
    // 3. the nearest rooms off the spot, in order, each looked into from its doorway (not ones searched lately)
    { const roomAt = new Map();
      for (let i = 0; i < dist.length; i++) { const r = m.region[i]; if (r <= 0 || dist[i] < 0 || dist[i] > 8 || (m.avoid && m.avoid[i])) continue; const cur = roomAt.get(r); if (!cur || dist[i] < dist[cur]) roomAt.set(r, i); }
      const rooms = [...roomAt.entries()].filter(([r]) => !this.roomsSearched || !(g.time - (this.roomsSearched.get(r) ?? -1e9) < 45)).sort((a, b) => dist[a[1]] - dist[b[1]]).slice(0, 2);
      for (const [r, i] of rooms) {
        const room = g.gen.rooms.find((q) => q.id === r);
        const look = room ? { x: (room.x0 + room.x1 + 1) * CELL / 2, z: (room.z0 + room.z1 + 1) * CELL / 2 } : { x: m.center(i % m.W, (i / m.W) | 0)[0], z: m.center(i % m.W, (i / m.W) | 0)[1] };
        pts.push({ room: r, c: [i % m.W, (i / m.W) | 0], look });
      }
    }
    // 4. somewhere close it has not looked yet
    const [cx, cz] = this.cell();
    for (let k = 0; k < 4; k++) { const c = randomReachableCell(m, Math.random, cx, cz, 1, 4); if (c && fresh(c[0] + c[1] * m.W)) { pts.push(c); break; } }
    return pts.slice(0, 5);
  }

  targetLocker(L, sure) {
    this.lockerTarget = L; this.lockerSure = sure; this.inspectT = 0; this.breathHeard = 0; this.lightLeak = false;
    this.setState('locker');
    this.lockerPt = this.lockerPoint(L);
    this.goToWorld(this.lockerPt.x, this.lockerPt.z);
    if (!sure) this.game.hud.toast(`Ada yang mendekati ${hideOf(L).label}mu… tahan napas!`, 2.5);
  }

  attack(locker = null) {
    this.setState('attack');
    const a = this.play('Attack', 0.1, true);
    this.game.killPlayer(this, locker);
    return a;
  }
}

// ---------------------------------------------------------------------------
export class Substitute extends Entity {
  constructor(game, cell, kind = 'substitute') {
    super(game, kind, cell);
    this.speed = 4.4;
    this.poses = ['Pose1', 'Pose2', 'Pose3', 'Pose4'].filter((n) => this.actions[n]);
    this.play('Idle');
    this.seenT = 0; this.unseenT = 0;
    this.aware = false;
    this.target = null;
    this.retargetT = 0;
    this.scrapeT = 0;
    this.poseT = 0;
    this.radius = 0.3;
  }
  onNoise(x, z) { this.aware = true; this.target = { x, z }; this.retargetT = 0; }
  moveSound() { this.game.audio.scrape(this.pos, 0.5, 0.18); }

  update(dt) {
    const g = this.game, p = g.player;
    const seen = g.isSeenByPlayer(this);
    this.seen = seen;
    const d = this.distTo(p.pos);
    if (seen) {
      this.seenT += dt; this.unseenT = 0;
      this.velocity = 0;
      if (this.mixer.timeScale !== 0) { this.mixer.timeScale = 0; }
    } else {
      this.unseenT += dt; this.seenT = 0;
      this.mixer.timeScale = 1;
      // does it sense the player?
      const vis = p.hidden ? 0 : p.visibility(g.world);
      if (!p.hidden && d < 26 * g.diff.sight && vis > 0.3 && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) {
        this.aware = true; this.target = { x: p.pos.x, z: p.pos.z };
      }
      this.retargetT -= dt;
      if (this.aware && this.target) {
        if (this.retargetT <= 0) { this.goToWorld(this.target.x, this.target.z); this.retargetT = 0.6; }
        const done = this.followPath(dt, this.speed * this.speedMul);
        if (done && this.distTo(this.target) < 1) { this.aware = false; this.target = null; }
      } else {
        if (!this.path || this.pathIdx >= this.path.length) {
          const [cx, cz] = this.cell();
          const t = randomReachableCell(g.map, Math.random, cx, cz, 3, 12);
          if (t) this.goTo(...t);
        }
        this.followPath(dt, this.speed * 0.45 * this.speedMul);
      }
      // jittery pose swaps while moving
      this.poseT -= dt;
      if (this.poses.length && this.poseT <= 0 && (this.velocity || 0) > 0.1) {
        this.poseT = 0.35 + Math.random() * 0.4;
        const name = this.poses[Math.floor(Math.random() * this.poses.length)];
        if (this.current) this.current.stop();
        this.current = null;
        this.play(name, 0, true);
      }
      if ((this.velocity || 0) > 0.1) {
        this.scrapeT -= dt;
        if (this.scrapeT <= 0) { this.scrapeT = 0.55; if (d < 22) this.moveSound(); }
      }
      if (!p.hidden && p.alive && d < 1.1) { this.state = 'attack'; g.killPlayer(this); }
    }
    this.updateCommon(dt);
  }
}


