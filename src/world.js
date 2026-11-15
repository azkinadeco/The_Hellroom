// Collision world: thin walls on cell edges, doors, and prop AABBs.
import { CELL, WALL_T, DOOR_W } from './config.js';
import { DIRS, EDGE } from './level/map.js';

export class World {
  constructor(gen, built) {
    this.map = gen.map;
    this.exitKey = gen.map.exitKey;
    this.colliders = gen.colliders;
    this.buckets = new Map();
    for (const c of this.colliders) {
      for (let z = Math.floor(c.minZ / CELL); z <= Math.floor(c.maxZ / CELL); z++)
        for (let x = Math.floor(c.minX / CELL); x <= Math.floor(c.maxX / CELL); x++) {
          const k = x + ',' + z;
          if (!this.buckets.has(k)) this.buckets.set(k, []);
          this.buckets.get(k).push(c);
        }
    }
    this.doors = built.doors;
  }

  // Is there a prop between an eye at (x0,z0) and a body at (x1,z1) tall enough to hide it?
  // Only props within `near` metres of the body count: further off, a low desk is
  // below the line from the resident's eyes down to you.
  cover(x0, z0, x1, z1, minH, near = 2.4) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
    if (L < 0.8) return false;
    const seen = new Set();
    for (let s = 0.35; s <= Math.min(near, L - 0.4); s += 0.5) {
      const k = Math.floor((x1 - dx / L * s) / CELL) + ',' + Math.floor((z1 - dz / L * s) / CELL);
      const b = this.buckets.get(k);
      if (!b) continue;
      for (const c of b) {
        if (seen.has(c) || (c.h ?? 1) < minH) continue;
        seen.add(c);
        // 2D slab test of the sight line against the box (slightly shrunk so grazing edges do not hide you)
        const ix = 0.06, mnX = c.minX + ix, mxX = c.maxX - ix, mnZ = c.minZ + ix, mxZ = c.maxZ - ix;
        let t0 = 0, t1 = 1;
        for (const [o, d, lo, hi] of [[x0, dx, mnX, mxX], [z0, dz, mnZ, mxZ]]) {
          if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
          let a = (lo - o) / d, b2 = (hi - o) / d; if (a > b2) [a, b2] = [b2, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, b2);
          if (t0 > t1) break;
        }
        // the box must sit between the two, not behind the body
        if (t0 <= t1 && t1 < 1 - 0.25 / L && t0 > 0) return true;
      }
    }
    return false;
  }

  // segments (x0,z0,x1,z1) for walls around a cell
  _edgeSegments(x, z, d, out) {
    const m = this.map;
    const e = m.edge(x, z, d);
    if (e === EDGE.OPEN) return;
    if (e === EDGE.NONE && m.reg(x, z) < 0) return;
    let x0, z0, x1, z1;
    if (d.dx !== 0) { const ex = (d.dx > 0 ? x + 1 : x) * CELL; x0 = x1 = ex; z0 = z * CELL; z1 = z0 + CELL; }
    else { const ez = (d.dz > 0 ? z + 1 : z) * CELL; z0 = z1 = ez; x0 = x * CELL; x1 = x0 + CELL; }
    if (e === EDGE.DOOR) {
      const door = m.doorAt(x, z, d);
      const h = DOOR_W / 2;
      if (d.dx !== 0) {
        out.push([x0, z0, x0, door.z - h], [x0, door.z + h, x0, z1]);
        if (door.openAmount < 0.6) out.push([x0, door.z - h, x0, door.z + h]);
      } else {
        out.push([x0, z0, door.x - h, z0], [door.x + h, z0, x1, z0]);
        if (door.openAmount < 0.6) out.push([door.x - h, z0, door.x + h, z0]);
      }
      return;
    }
    out.push([x0, z0, x1, z1]);
  }

  // resolve a circle against everything; returns corrected [x,z]
  collide(px, pz, r) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    const segs = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx, z = cz + dz;
      if (!this.map.inside(x, z)) continue;
      for (const d of DIRS) this._edgeSegments(x, z, d, segs);
    }
    const rr = r + WALL_T / 2;
    for (let iter = 0; iter < 3; iter++) {
      for (const [x0, z0, x1, z1] of segs) {
        const vx = x1 - x0, vz = z1 - z0;
        const len2 = vx * vx + vz * vz || 1e-6;
        let t = ((px - x0) * vx + (pz - z0) * vz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + vx * t, qz = z0 + vz * t;
        const ddx = px - qx, ddz = pz - qz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-4;
          const push = rr - d;
          px += (ddx / d) * push; pz += (ddz / d) * push;
        }
      }
      const seen = new Set();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const b = this.buckets.get((cx + dx) + ',' + (cz + dz));
        if (!b) continue;
        for (const c of b) {
          if (seen.has(c)) continue; seen.add(c);
          const qx = Math.max(c.minX, Math.min(px, c.maxX));
          const qz = Math.max(c.minZ, Math.min(pz, c.maxZ));
          const ddx = px - qx, ddz = pz - qz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = r - d;
            px += (ddx / d) * push; pz += (ddz / d) * push;
          } else { // centre inside box: push out along shallowest axis
            const l = px - c.minX, rgt = c.maxX - px, t = pz - c.minZ, btm = c.maxZ - pz;
            const m = Math.min(l, rgt, t, btm);
            if (m === l) px = c.minX - r; else if (m === rgt) px = c.maxX + r;
            else if (m === t) pz = c.minZ - r; else pz = c.maxZ + r;
          }
        }
      }
    }
    return [px, pz];
  }

  los(x0, z0, x1, z1) { return this.map.los(x0, z0, x1, z1); }
  isLit(x, z) {
    if (this.blackout) return false;
    const [cx, cz] = this.map.cellOf(x, z);
    return this.map.inside(cx, cz) && this.map.lit[cx + cz * this.map.W] === 1;
  }
}
