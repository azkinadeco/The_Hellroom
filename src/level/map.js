// Grid map with thin walls living on cell edges.
// region: -1 = void (solid), -2 = open space (atrium / tall hall seen from
// above: no floor, railings round it), 0 = hallway, >=1 = room id
import { CELL, DOOR_W } from '../config.js';

export const EDGE = { NONE: 0, OPEN: 1, WALL: 2, DOOR: 3, RAIL: 4 };
export const VOID = -2;
export const DIRS = [
  { dx: 1, dz: 0, name: 'E' },
  { dx: -1, dz: 0, name: 'W' },
  { dx: 0, dz: 1, name: 'S' },
  { dx: 0, dz: -1, name: 'N' },
];

export class LevelMap {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.region = new Int16Array(W * H).fill(-1);
    this.ve = new Uint8Array((W + 1) * H); // vertical edges (constant x)
    this.he = new Uint8Array(W * (H + 1)); // horizontal edges (constant z)
    this.doors = new Map();                 // edgeKey -> door record
    this.exitKey = null;
    this.lit = new Uint8Array(W * H);       // 1 if the cell has a working light
    // hand-made layouts: archways between regions, railings, forced walls
    this.openKeys = new Set(); this.railKeys = new Set(); this.wallKeys = new Set();
  }
  inside(x, z) { return x >= 0 && z >= 0 && x < this.W && z < this.H; }
  reg(x, z) { return this.inside(x, z) ? this.region[x + z * this.W] : -1; }
  setReg(x, z, r) { this.region[x + z * this.W] = r; }

  // Edge addressing: returns [kind, ex, ez]
  edgeOf(x, z, d) {
    if (d.dx === 1) return ['v', x + 1, z];
    if (d.dx === -1) return ['v', x, z];
    if (d.dz === 1) return ['h', x, z + 1];
    return ['h', x, z];
  }
  key(kind, ex, ez) { return kind + ex + ',' + ez; }
  edgeKey(x, z, d) { const [k, ex, ez] = this.edgeOf(x, z, d); return this.key(k, ex, ez); }
  getE(kind, ex, ez) {
    return kind === 'v' ? this.ve[ex + ez * (this.W + 1)] : this.he[ex + ez * this.W];
  }
  setE(kind, ex, ez, v) {
    if (kind === 'v') this.ve[ex + ez * (this.W + 1)] = v; else this.he[ex + ez * this.W] = v;
  }
  edge(x, z, d) { const [k, ex, ez] = this.edgeOf(x, z, d); return this.getE(k, ex, ez); }
  doorAt(x, z, d) { return this.doors.get(this.edgeKey(x, z, d)); }

  computeEdges() {
    const { W, H } = this;
    for (let z = 0; z < H; z++) for (let ex = 0; ex <= W; ex++) {
      this.setE('v', ex, z, this._edgeType(this.reg(ex - 1, z), this.reg(ex, z), this.key('v', ex, z)));
    }
    for (let ez = 0; ez <= H; ez++) for (let x = 0; x < W; x++) {
      this.setE('h', x, ez, this._edgeType(this.reg(x, ez - 1), this.reg(x, ez), this.key('h', x, ez)));
    }
  }
  _edgeType(a, b, k) {
    if (this.doors.has(k)) return EDGE.DOOR;
    if (a === -1 && b === -1) return EDGE.NONE;
    if (a === -1 || b === -1) return EDGE.WALL;
    if (this.wallKeys.has(k)) return EDGE.WALL;
    if (this.openKeys.has(k)) return EDGE.OPEN;
    if (this.railKeys.has(k)) return EDGE.RAIL;
    if (a === b) return EDGE.OPEN;
    if (a === VOID || b === VOID) return EDGE.RAIL;   // balcony edge over an atrium
    return EDGE.WALL;
  }

  // Can an agent step from cell (x,z) in direction d?
  // mode 'entity': unlocked doors are passable (entities push them open)
  // mode 'reach':  every door is passable (used for generation checks)
  canStep(x, z, d, mode = 'entity') {
    const nx = x + d.dx, nz = z + d.dz;
    if (this.reg(nx, nz) < 0) return false;
    const e = this.edge(x, z, d);
    if (e === EDGE.OPEN) return true;
    if (e === EDGE.DOOR) {
      if (mode === 'reach') return true;
      const door = this.doorAt(x, z, d);
      return door && !door.locked;
    }
    return false;
  }

  cellOf(wx, wz) { return [Math.floor(wx / CELL), Math.floor(wz / CELL)]; }
  center(x, z) { return [(x + 0.5) * CELL, (z + 0.5) * CELL]; }

  bfs(sx, sz, mode = 'entity') {
    const dist = new Int32Array(this.W * this.H).fill(-1);
    const q = [sx + sz * this.W];
    dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % this.W, z = (c / this.W) | 0;
      for (const d of DIRS) {
        if (!this.canStep(x, z, d, mode)) continue;
        const n = (x + d.dx) + (z + d.dz) * this.W;
        if (dist[n] >= 0) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
    return dist;
  }

  // Line of sight in world XZ. Walls and closed doors block. Returns true if clear.
  los(x0, z0, x1, z1) {
    let cx = Math.floor(x0 / CELL), cz = Math.floor(z0 / CELL);
    const tx = Math.floor(x1 / CELL), tz = Math.floor(z1 / CELL);
    const dx = x1 - x0, dz = z1 - z0;
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tMaxX = dx !== 0 ? (((stepX > 0 ? cx + 1 : cx) * CELL) - x0) / dx : Infinity;
    let tMaxZ = dz !== 0 ? (((stepZ > 0 ? cz + 1 : cz) * CELL) - z0) / dz : Infinity;
    let guard = 0;
    while ((cx !== tx || cz !== tz) && guard++ < 200) {
      let d, t;
      if (tMaxX < tMaxZ) { d = stepX > 0 ? DIRS[0] : DIRS[1]; t = tMaxX; tMaxX += tDeltaX; }
      else { d = stepZ > 0 ? DIRS[2] : DIRS[3]; t = tMaxZ; tMaxZ += tDeltaZ; }
      if (t > 1) break;
      const e = this.edge(cx, cz, d);
      if (e === EDGE.WALL || e === EDGE.NONE) return false;
      if (e === EDGE.DOOR) {
        const door = this.doorAt(cx, cz, d);
        if (!door || door.openAmount < 0.5) return false;
        // must pass through the opening, not the wall beside it
        const px = x0 + dx * t, pz = z0 + dz * t;
        const off = d.dx !== 0 ? pz - door.z : px - door.x;
        if (Math.abs(off) > DOOR_W / 2) return false;
      }
      cx += d.dx; cz += d.dz;
      if (this.reg(cx, cz) === -1) return false;
    }
    return true;
  }
}
