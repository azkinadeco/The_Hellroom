// Entity AI. Three original anomalies:
//  - Monitor:    patrols, sees & hears, chases with a whistle, checks lockers.
//  - Substitute: only moves while nobody is looking at it.
import * as THREE from 'three';
import { CELL, hideOf } from '../config.js';
import { findPath, randomReachableCell } from './path.js';
import { cloneWithBake } from '../level/builder.js';
import { applyEntityLook, lookIndex } from '../render/entityLook.js';
import { angleDiff, clamp } from '../util/rng.js';

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
    this.speedMul = game.diff.speed;
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
    if (collide) [nx, nz] = this.game.world.collide(nx, nz, this.radius);
    this.velocity = Math.hypot(nx - this.pos.x, nz - this.pos.z) / Math.max(dt, 1e-4);
    this.pos.x = nx; this.pos.z = nz;
    this.faceToward(x, z, dt, 8);
    return false;
  }
  faceToward(x, z, dt, rate = 6) {
    const target = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.yaw += angleDiff(this.yaw, target) * Math.min(1, rate * dt);
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

  updateCommon(dt) {
    this.mixer.update(dt);
    this.obj.position.copy(this.pos);
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
// Several residents (Petugas, Guru Bertopeng, Si Pucat, Kelabang) are tuned versions.
export class Monitor extends Entity {
  constructor(game, cell, kind = 'monitor', o = {}) {
    super(game, kind, cell);
    this.suspicion = 0;
    this.lastSeen = null;
    this.lostT = 0;
    this.searchPts = [];
    this.walk = o.walk ?? 1.55; this.run = o.run ?? 4.35;
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
    this.state = s; this.stateT = 0;
    if (s === 'chase') {
      if (this.whistleCd <= 0) { this.chaseSound(); this.whistleCd = 12; }
      this.game.onChaseStart(this);
    }
  }

  onNoise(x, z, strength, type) {
    if (this.state === 'chase' || this.state === 'attack' || this.state === 'locker') return;
    this.investigatePt = { x, z };
    this.suspicion = Math.max(this.suspicion, type === 'alert' ? 0.75 : 0.35);
    this.setState('investigate');
    this.goToWorld(x, z);
  }

  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt;
    this.whistleCd -= dt;
    const see = this.sense();
    if (see > 0) {
      this.suspicion = Math.min(1.2, this.suspicion + see * dt * (this.distTo(p.pos) < 4 ? 6 : 1.9));
      this.lastSeen = { x: p.pos.x, z: p.pos.z, t: g.time };
      this.lostT = 0;
    } else this.suspicion = Math.max(0, this.suspicion - dt * (this.state === 'chase' ? 0 : 0.12));

    // seen = hunted: no slow suspicion build-up, it comes straight for you and
    // keeps coming for as long as it can see you (or until you hide)
    if (see > 0 && this.state !== 'chase' && this.state !== 'attack' && (this.state !== 'locker' || !this.lockerSure)) {
      this.suspicion = 1.2; this.path = null; this.setState('chase');
    } else if (this.state !== 'chase' && this.state !== 'attack' && this.state !== 'locker' && this.suspicion >= 1) this.setState('chase');

    let speed = 0;
    switch (this.state) {
      case 'patrol': {
        this.checkLockers(dt);
        if (this.state !== 'patrol') break;
        if (this.waitT > 0) {
          this.waitT -= dt; this.velocity = 0;
          this.yaw += Math.sin(g.time * 0.7) * dt * 0.5;
          this.onIdle(dt);
          if (this.waitT <= 0) {
            const [cx, cz] = this.cell();
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
        speed = (this.suspicion > 0.6 ? this.walk * 1.6 : this.walk * 1.15) * this.speedMul;
        if (see > 0 && this.stateT > 0.5) { this.goToWorld(p.pos.x, p.pos.z); this.stateT = 0; }
        if (this.followPath(dt, speed)) {
          this.velocity = 0;
          if (!this.lookT) this.lookT = 2.5;
          this.lookT -= dt;
          this.yaw += dt * 1.6;
          if (this.lookT <= 0) { this.lookT = 0; this.setState('patrol'); this.waitT = 0.5; }
        }
        this.checkLockers(dt);
        break;
      }
      case 'chase': {
        speed = this.run * this.speedMul;
        const d = this.distTo(p.pos);
        // saw them climb into the locker? then it knows exactly where they are
        if (p.hidden && this.lastSeen && g.time - this.lastSeen.t < 1.2) { this.targetLocker(p.hidden, true); break; }
        if (see > 0 && !p.hidden) {
          this.moveToward(p.pos.x, p.pos.z, dt, speed, 0.1, true);
          this.path = null;
          if (d < 1.25) { this.attack(); break; }
        } else {
          this.lostT += dt;
          if (!this.path && this.lastSeen) this.goToWorld(this.lastSeen.x, this.lastSeen.z);
          if (this.followPath(dt, speed) || this.lostT > 5) {
            this.setState('search');
            this.suspicion = 0.6;
            const [cx, cz] = this.cell();
            this.searchPts = [0, 1, 2].map(() => randomReachableCell(g.map, Math.random, cx, cz, 1, 4)).filter(Boolean);
            this.path = null;
          }
        }
        break;
      }
      case 'search': {
        speed = this.walk * 1.4 * this.speedMul;
        if (!this.path || this.pathIdx >= this.path.length) {
          const n = this.searchPts.shift();
          if (n) this.goTo(...n); else { this.setState('patrol'); this.waitT = 1; this.suspicion = 0.2; g.onChaseEnd(this); }
        } else this.followPath(dt, speed);
        this.checkLockers(dt);
        break;
      }
      case 'locker': { // walking to / inspecting a locker
        const L = this.lockerTarget;
        speed = (this.lockerSure ? this.run : this.walk * 1.2) * this.speedMul;
        const fd = hideOf(L).inspect + (this.reach || 0);   // long bodies stop further back so the head stays outside
        const fx = L.x + Math.sin(L.rot) * fd, fz = L.z + Math.cos(L.rot) * fd;
        const arrived = this.path && this.pathIdx < this.path.length ? this.followPath(dt, speed) : this.moveToward(fx, fz, dt, speed, 0.25, true);
        if (arrived || this.distTo({ x: fx, z: fz }) < 0.35) {
          this.velocity = 0;
          this.faceToward(L.x, L.z, dt, 10);
          this.inspectT = (this.inspectT || 0) + dt;
          // only a breath it can actually hear for a while gives you away
          if (p.hidden === L && this.inspectT > 0.6 && !p.holdingBreath && this.game.time - (p.hideT || 0) > 1.0) this.breathHeard += dt;
          const caught = this.lockerSure || this.breathHeard > 1.3;
          if (caught && p.hidden === L) { this.game.lockerReason = this.lockerSure ? 'seen' : 'breath'; this.attack(L); break; }
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
    const d = Math.hypot(L.x - this.pos.x, L.z - this.pos.z);
    const fd = hideOf(L).front + 0.3;
    if (d > 4.5 || !this.game.world.los(this.pos.x, this.pos.z, L.x + Math.sin(L.rot) * fd, L.z + Math.cos(L.rot) * fd)) return;
    const breathing = !p.holdingBreath;
    const chance = (breathing ? 0.35 + p.fear * 0.5 : 0.02) * this.game.diff.hearing * (1 - d / 4.5);
    if (Math.random() < chance * dt) this.targetLocker(L, false);
  }

  targetLocker(L, sure) {
    this.lockerTarget = L; this.lockerSure = sure; this.inspectT = 0; this.breathHeard = 0;
    this.setState('locker');
    const fd = hideOf(L).inspect + (this.reach || 0);   // long bodies stop further back so the head stays outside
    const fx = L.x + Math.sin(L.rot) * fd, fz = L.z + Math.cos(L.rot) * fd;
    this.goToWorld(fx, fz);
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


