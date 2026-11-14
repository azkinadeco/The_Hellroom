// Kejadian ganjil: small things that happen on their own while nothing is
// hunting you. None of them hurts or gives your position away; they only keep
// the building from ever feeling empty.
import * as THREE from 'three';
import { CELL } from './config.js';
import { cloneWithBake } from './level/builder.js';
import { randomReachableCell } from './ai/path.js';

const TMP = new THREE.Vector3();

export class OddEvents {
  constructor(game) {
    this.game = game;
    this.t = 38 + Math.random() * 20;
    this.last = null;
    this.count = 0;
    this.ghost = null;
    this.rate = game.def.odd ?? 1;
  }

  // a point roughly behind the player, `d` metres away, on walkable floor
  behind(d) {
    const g = this.game, p = g.player, m = g.map;
    for (let i = 0; i < 8; i++) {
      const a = p.yaw + (Math.random() - 0.5) * 1.6;           // yaw points backwards along +sin/+cos
      const x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d;
      const [cx, cz] = m.cellOf(x, z);
      if (m.reg(cx, cz) >= 0) return { x, y: 1.4, z };
    }
    return { x: p.pos.x + Math.sin(p.yaw) * d, y: 1.4, z: p.pos.z + Math.cos(p.yaw) * d };
  }
  onScreen(x, y, z, margin = 1.0) {
    TMP.set(x, y, z).project(this.game.camera);
    return TMP.z < 1 && Math.abs(TMP.x) < margin && Math.abs(TMP.y) < margin;
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (this.ghost) this.updateGhost(dt);
    if (!this.rate || !p.alive || g.winT >= 0 || g.liftRide || g.slideRide || g.busy) return;
    if (g.chasers.size || g.danger > 0.5) { this.t = Math.max(this.t, 14); return; }   // never on top of a real threat
    this.t -= dt * this.rate;
    if (this.t > 0) return;
    this.t = 34 + Math.random() * 40;
    const all = Object.keys(this.kinds).filter((k) => k !== this.last);
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    for (const k of all) if (this.kinds[k].call(this)) { this.last = k; this.count++; this.lastAt = g.time; return; }
    this.t = 10;
  }

  get kinds() { return KINDS; }

  // ---- the faceless figure at the end of the hall: gone the moment you really look
  spawnGhost() {
    const g = this.game, p = g.player, m = g.map;
    if (this.ghost || p.hidden || !g.assets.models.figure_stand) return false;
    const [px, pz] = m.cellOf(p.pos.x, p.pos.z);
    for (let i = 0; i < 24; i++) {
      const c = randomReachableCell(m, Math.random, px, pz, 3, 9);
      if (!c || m.reg(c[0], c[1]) < 0) continue;
      const [x, z] = m.center(c[0], c[1]);
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d < 7.5 || d > 26 || !m.los(p.pos.x, p.pos.z, x, z) || this.onScreen(x, 1.2, z, 1.1)) continue;
      const b = g.field.sample(x, 1.4, z, null, null, null, null);
      const obj = cloneWithBake(g.assets.models.figure_stand, [Math.max(0.12, b[0]), b[1]], 0.1);
      obj.position.set(x, 0, z);
      obj.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
      g.levelRoot.add(obj);
      this.ghost = { obj, x, z, seen: 0, life: 40, floor: g.floorK };
      return true;
    }
    return false;
  }
  updateGhost(dt) {
    const g = this.game, p = g.player, G = this.ghost;
    G.life -= dt;
    const d = Math.hypot(G.x - p.pos.x, G.z - p.pos.z);
    const looked = this.onScreen(G.x, 1.2, G.z, 0.8) && g.world.los(p.pos.x, p.pos.z, G.x, G.z);
    if (looked) G.seen += dt;
    if (G.floor !== g.floorK || G.life <= 0 || d < 5 || G.seen > 0.55) {
      const witnessed = G.seen > 0.1 && G.floor === g.floorK;
      G.obj.parent && G.obj.parent.remove(G.obj);
      this.ghost = null;
      if (witnessed) {
        if (!g.clear) g.glitch = Math.max(g.glitch, 0.45);
        g.schedule(0.35, () => { g.glitch = 0; });
        g.audio.crack({ x: G.x, y: 1.4, z: G.z });
        g.stats.ghosts = (g.stats.ghosts || 0) + 1;
      }
    }
  }
  clear() { if (this.ghost) { this.ghost.obj.parent && this.ghost.obj.parent.remove(this.ghost.obj); this.ghost = null; } }
}

const KINDS = {
  // a door nearby swings open (or shut) with nobody there
  door() {
    const g = this.game, p = g.player;
    const c = g.built.doors.filter((d) => { if (d.locked) return false; const q = Math.hypot(d.x - p.pos.x, d.z - p.pos.z); return q > 3.5 && q < 14 && g.entities.every((e) => Math.hypot(e.pos.x - d.x, e.pos.z - d.z) > 3); });
    if (!c.length) return false;
    const d = c[Math.floor(Math.random() * c.length)], pos = { x: d.x, y: 1.2, z: d.z };
    if (d.target) { d.target = 0; g.audio.doorCreak(pos, false); g.schedule(0.5, () => g.audio.doorSlam(pos)); }
    else { d.target = 1; g.audio.doorCreak(pos, true); }
    return true;
  },
  // a locker door rattles
  locker() {
    const g = this.game, p = g.player;
    const c = g.built.lockers.filter((L) => { if (L === p.hidden || (L.kind && L.kind !== 'locker')) return false; const q = Math.hypot(L.x - p.pos.x, L.z - p.pos.z); return q > 2.5 && q < 12; });
    if (!c.length) return false;
    const L = c[Math.floor(Math.random() * c.length)], pos = { x: L.x, y: 1, z: L.z };
    for (let i = 0; i < 3; i++) g.schedule(i * 0.28, () => { if (p.hidden === L) return; L.target = i % 2 ? 0 : -0.22; g.audio.lockerClang(pos, 0.3); });
    g.schedule(0.95, () => { if (p.hidden !== L) L.target = 0; });
    return true;
  },
  steps() { const g = this.game; g.audio.distantSteps(this.behind(11)); return true; },
  whisper() { const g = this.game; if (g.player.hidden) return false; g.audio.whisper(this.behind(3.5), 0.4); return true; },
  bell() {
    const g = this.game;
    if (!['school', 'detention'].includes(g.def.arch)) return false;
    g.audio.schoolBell(this.behind(18));
    return true;
  },
  chalk() {
    const g = this.game, p = g.player;
    const rooms = g.gen.rooms.filter((r) => r.type === 'kelas' && Math.hypot((r.x0 + r.x1 + 1) * CELL / 2 - p.pos.x, (r.z0 + r.z1 + 1) * CELL / 2 - p.pos.z) < 20);
    if (!rooms.length) return false;
    const r = rooms[Math.floor(Math.random() * rooms.length)];
    g.audio.chalkScreech({ x: (r.x0 + r.x1 + 1) * CELL / 2, y: 1.5, z: (r.z0 + r.z1 + 1) * CELL / 2 });
    return true;
  },
  // the mains dip for a moment
  dip() {
    const g = this.game;
    if (g.blackoutT > 0 || g.def.theme === 'mall') return false;   // in the mall darkness is the resident's door
    g.blackoutT = 1.1 + Math.random() * 0.8;
    return true;
  },
  ghost() { return this.spawnGhost(); },
};
