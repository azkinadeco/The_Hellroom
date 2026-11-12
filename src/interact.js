import * as THREE from 'three';
import { NOISE, PLAYER, HIDE } from './config.js';
import { damp } from './util/rng.js';

const OPEN_ANGLE = -1.55; // doors swing into the room

export class DoorSystem {
  constructor(game, doors) {
    this.game = game;
    this.doors = doors;
    for (const d of doors) { d.target = 0; d.openAmount = 0; }
  }
  open(door, by, fromPos) {
    if (door.target === 1) return;
    door.target = 1;
    this.game.audio.doorCreak({ x: door.x, y: 1.2, z: door.z }, true);
    if (by === 'player') this.game.emitNoise(door.x, door.z, NOISE.door, 'door');
  }
  close(door) {
    if (door.target === 0) return;
    door.target = 0;
    this.game.audio.doorCreak({ x: door.x, y: 1.2, z: door.z }, false);
    this.game.emitNoise(door.x, door.z, NOISE.door, 'door');
  }
  update(dt) {
    for (const d of this.doors) {
      const prev = d.openAmount;
      d.openAmount = damp(d.openAmount, d.target, d.target ? 5 : 7, dt);
      if (Math.abs(d.openAmount - d.target) < 0.002) d.openAmount = d.target;
      if (d.leaf && prev !== d.openAmount) d.leaf.rotation.y = d.baseRot + OPEN_ANGLE * d.openAmount;
    }
  }
}

// Finds what the player is looking at and executes interactions.
export class Interactor {
  constructor(game) {
    this.game = game;
    this.target = null;
    this._f = new THREE.Vector3();
  }

  candidates() {
    const g = this.game, out = [];
    for (const d of g.built.doors) out.push({ kind: 'door', ref: d, x: d.x, y: 1.1, z: d.z, r: 0.9 });
    for (const l of g.built.lockers) { const f = HIDE[l.kind || 'locker'].front; out.push({ kind: 'locker', ref: l, x: l.x + Math.sin(l.rot) * f, y: 1.0, z: l.z + Math.cos(l.rot) * f, r: 0.55 }); }
    for (const it of g.built.items) if (!it.taken) out.push({ kind: 'item', ref: it, x: it.obj.position.x, y: it.obj.position.y, z: it.obj.position.z, r: 0.35 });
    const fb = g.gen.fusebox;
    out.push({ kind: 'fusebox', x: fb.x + Math.sin(fb.rot) * 0.1, y: 1.4, z: fb.z + Math.cos(fb.rot) * 0.1, r: 0.5 });
    const ex = g.gen.exit;
    out.push({ kind: 'exit', x: ex.x, y: 1.2, z: ex.z, r: 1.0 });
    return out;
  }

  update() {
    const g = this.game, p = g.player;
    this.target = null;
    if (!p.alive) return null;
    if (p.hidden) { this.target = { kind: 'locker', ref: p.hidden }; return this.target; }
    const cam = p.camera;
    cam.getWorldDirection(this._f);
    let best = null, bestScore = -1;
    for (const c of this.candidates()) {
      const dx = c.x - cam.position.x, dy = c.y - cam.position.y, dz = c.z - cam.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > PLAYER.reach + c.r * 0.5) continue;
      const dot = (dx * this._f.x + dy * this._f.y + dz * this._f.z) / dist;
      const need = Math.cos(Math.atan2(c.r, dist));
      if (dot < need * 0.985) continue;
      // line of sight to a point nudged towards the player
      const nx = c.x - (dx / dist) * 0.35, nz = c.z - (dz / dist) * 0.35;
      if (!g.world.los(p.pos.x, p.pos.z, nx, nz)) continue;
      const score = dot - dist * 0.02 + (c.kind === 'item' ? 0.05 : 0);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    this.target = best;
    return best;
  }

  label(t) {
    const g = this.game, inv = g.player.inventory;
    if (!t) return '';
    switch (t.kind) {
      case 'door': {
        const d = t.ref;
        if (d.locked) return inv.keys > 0 ? 'Buka kunci pintu' : 'Terkunci — butuh kunci';
        return d.target ? 'Tutup pintu' : 'Buka pintu';
      }
      case 'locker': { const n = HIDE[t.ref.kind || 'locker'].label; return g.player.hidden ? `Keluar dari ${n}` : `Sembunyi di ${n}`; }
      case 'item': return { tape: 'Ambil kaset VHS', eraser: 'Ambil penghapus papan', fuse: 'Ambil sekring', key: 'Ambil kunci', battery: 'Ambil baterai', note: 'Baca catatan', tape: 'Ambil kaset' }[t.ref.type];
      case 'fusebox': {
        const need = g.def.fuses - g.fusesInstalled;
        if (need <= 0) return 'Listrik menyala';
        return inv.fuses > 0 ? `Pasang sekring (${g.fusesInstalled}/${g.def.fuses})` : `Kotak sekring kosong (${g.fusesInstalled}/${g.def.fuses})`;
      }
      case 'exit': return g.powered ? 'KELUAR' : 'Pintu keluar — tidak ada listrik';
    }
    return '';
  }

  activate() {
    const t = this.target, g = this.game, p = g.player;
    if (!t || g.busy) return;
    switch (t.kind) {
      case 'door': {
        const d = t.ref;
        if (d.locked) {
          if (p.inventory.keys > 0) {
            p.inventory.keys--; d.locked = false; g.audio.doorLocked({ x: d.x, y: 1, z: d.z });
            g.hud.toast('Pintu terbuka dengan kunci');
            g.doorSys.open(d, 'player', p.pos);
          } else { g.audio.doorLocked({ x: d.x, y: 1, z: d.z }); g.hud.toast('Terkunci. Kuncinya pasti ada di suatu ruangan.'); }
          break;
        }
        if (d.target) g.doorSys.close(d); else g.doorSys.open(d, 'player', p.pos);
        break;
      }
      case 'locker': g.toggleLocker(t.ref); break;
      case 'item': g.pickup(t.ref); break;
      case 'fusebox': g.useFusebox(); break;
      case 'exit': g.tryExit(); break;
    }
  }
}
