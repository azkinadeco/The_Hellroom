// Multi-floor buildings from hand-written layouts (school, hospital, pool, mall).
// Every floor is its own LevelMap on the same grid; floors are FH apart.
// Floors are linked by stairs (walkable ramps through a shaft), lifts and
// slides. Cells marked VOID (-2) are open space seen from above: atriums,
// tall halls, courtyards. Railings run round them automatically.
import { CELL, WALL_H, WALL_T } from '../config.js';
import { RNG } from '../util/rng.js';
import { LevelMap, DIRS, EDGE, VOID } from './map.js';
import { furnishRoom, dressHalls, yawFor } from './generator.js';
import { furnishExtra, dressExtra } from './furnish2.js';
import { LAYOUTS } from './layouts.js';

export const SLAB = 0.6;
export const FH = WALL_H + SLAB;          // floor-to-floor height
export const SIDES = { E: DIRS[0], W: DIRS[1], S: DIRS[2], N: DIRS[3] };
export const OPP = { E: 'W', W: 'E', S: 'N', N: 'S' };

export class Floor {
  constructor(b, k) {
    this.b = b; this.k = k;
    const { W, H } = b;
    const map = this.map = new LevelMap(W, H);
    this.out = {
      map, k, rooms: [], props: [], colliders: [], lockers: [], lights: [], items: [],
      start: null, exit: null, fusebox: null, decals: [], water: [], steps: [], signs: [], liftDoors: [],
      openAbove: new Uint8Array(W * H), noFloor: new Uint8Array(W * H), noCeil: new Uint8Array(W * H),
      hallMat: null,
    };
    this.nextId = 1;
  }
  idx(x, z) { return x + z * this.b.W; }
  fill(x0, z0, x1, z1, v) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      if (this.map.inside(x, z)) this.map.setReg(x, z, v);
  }
  hall(x0, z0, x1, z1) { this.fill(x0, z0, x1, z1, 0); }
  void(x0, z0, x1, z1) { this.fill(x0, z0, x1, z1, VOID); }
  solid(x0, z0, x1, z1) { this.fill(x0, z0, x1, z1, -1); }
  sky(x0, z0, x1, z1) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.out.noCeil[this.idx(x, z)] = 1;
  }
  room(x0, z0, x1, z1, type, o = {}) {
    const r = { id: this.nextId++, type, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1),
      doors: [], locked: false, spots: [], k: this.k, ...o };
    this.fill(r.x0, r.z0, r.x1, r.z1, r.id);
    this.out.rooms.push(r);
    return r;
  }
  edgeKey(x, z, side) { return this.map.edgeKey(x, z, SIDES[side]); }
  // door from room cell (x,z) towards `side`
  door(r, x, z, side, locked = false) {
    const d = SIDES[side], map = this.map;
    const [kind, ex, ez] = map.edgeOf(x, z, d);
    const k = map.key(kind, ex, ez);
    if (map.doors.has(k)) return map.doors.get(k);
    const door = {
      key: k, kind, ex, ez, locked, open: false, openAmount: 0, room: r,
      x: kind === 'v' ? ex * CELL : (ex + 0.5) * CELL,
      z: kind === 'h' ? ez * CELL : (ez + 0.5) * CELL,
      inX: -d.dx, inZ: -d.dz, roomCell: [x, z],
    };
    map.doors.set(k, door);
    r.doors.push(door);
    return door;
  }
  arch(x, z, side) { this.map.openKeys.add(this.edgeKey(x, z, side)); }
  rail(x, z, side) { this.map.railKeys.add(this.edgeKey(x, z, side)); }
  wall(x, z, side) { this.map.wallKeys.add(this.edgeKey(x, z, side)); }
  // every edge along one side of a rectangle
  edges(x0, z0, x1, z1, side, fn) {
    if (side === 'N' || side === 'S') { const z = side === 'N' ? z0 : z1; for (let x = x0; x <= x1; x++) fn(x, z, side); }
    else { const x = side === 'W' ? x0 : x1; for (let z = z0; z <= z1; z++) fn(x, z, side); }
  }
  // a door on the room side that touches a hall, in the middle of that side
  autoDoor(r, sides = null, rng = null) {
    const cand = [];
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) for (const [s, d] of Object.entries(SIDES)) {
      if (sides && !sides.includes(s)) continue;
      if (this.map.reg(x + d.dx, z + d.dz) !== 0) continue;
      cand.push({ x, z, s });
    }
    if (!cand.length) return null;
    const bySide = {};
    for (const c of cand) (bySide[c.s] = bySide[c.s] || []).push(c);
    const s = sides ? sides.find((q) => bySide[q]) : Object.keys(bySide)[rng ? Math.floor(rng.next() * Object.keys(bySide).length) : 0];
    const list = bySide[s];
    const c = list[Math.min(list.length - 1, rng ? Math.floor(rng.range(0.25, 0.75) * list.length) : Math.floor(list.length / 2))];
    return this.door(r, c.x, c.z, c.s);
  }
  prop(type, x, z, rot, size = null, o = {}) {
    this.out.props.push({ type, x, z, y: o.y || 0, rot, ...o });
    if (size) {
      const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
      const hx = (size[0] * c + size[1] * s) / 2, hz = (size[0] * s + size[1] * c) / 2;
      this.out.colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h: size[2] || 1 });
    }
  }
  light(x, z, o = {}) { this.out.lights.push({ x, z, rot: 0, state: 'on', cell: this.map.cellOf(x, z), ...o }); }
}

export class Building {
  constructor(def, rng) {
    this.def = def; this.rng = rng;
    this.W = def.size[0]; this.H = def.size[1];
    this.F = Array.from({ length: def.floors }, (_, k) => new Floor(this, k));
    this.stairs = []; this.lifts = []; this.slides = [];
    this.start = null; this.exit = null; this.fuse = null;
  }
  // straight flight from floor k (entered from behind the first cell) up to k+1
  // (left past the last cell). Both floors share the shaft cells.
  stair(k, x, z, side, len = 2, o = {}) {
    const d = SIDES[side];
    const cells = Array.from({ length: len }, (_, i) => [x + d.dx * i, z + d.dz * i]);
    const [lx, lz] = cells[len - 1];
    const mat = o.mat || null;
    for (const f of [this.F[k], this.F[k + 1]]) {
      f.room(x, z, lx, lz, 'stairs', { mat, escalator: !!(o.escalator || o.open), noItems: true });
      if (o.escalator || o.open) for (const [cx, cz] of cells) for (const s of Object.keys(SIDES)) if (s !== side && s !== OPP[side]) f.rail(cx, cz, s);
    }
    this.F[k].arch(x, z, OPP[side]);
    this.F[k + 1].arch(lx, lz, side);
    for (const [cx, cz] of cells) {
      this.F[k].out.openAbove[this.F[k].idx(cx, cz)] = 1;
      this.F[k + 1].out.noFloor[this.F[k + 1].idx(cx, cz)] = 1;
    }
    const s = { k, x, z, side, d, len, cells, escalator: !!o.escalator, open: !!o.open, mat,
      minX: Math.min(x, lx) * CELL, maxX: (Math.max(x, lx) + 1) * CELL, minZ: Math.min(z, lz) * CELL, maxZ: (Math.max(z, lz) + 1) * CELL,
      bottom: [x - d.dx, z - d.dz], top: [lx + d.dx, lz + d.dz] };
    this.stairs.push(s);
    this.F[k].out.steps.push(s);
    return s;
  }
  // magic lift cabin: present on every listed floor at the same spot
  lift(x, z, side, floors) {
    for (const k of floors) {
      const f = this.F[k];
      const r = f.room(x, z, x, z, 'lift', { noItems: true, liftSide: side, noLock: true, mat: { wall: 'lift_wall', floor: 'floor_tile' }, sign: null });
      f.arch(x, z, side);
      f.out.liftDoors.push({ x, z, side });
      r.spots = [];
    }
    const L = { x, z, side, floors, cx: (x + 0.5) * CELL, cz: (z + 0.5) * CELL };
    this.lifts.push(L);
    return L;
  }
  // ride from (floor a, point) to (floor b, point); pts are absolute [x, y, z]
  slide(a, b, pts, o = {}) {
    const s = { from: a, to: b, pts, color: o.color || 0xd8b13a, end: pts[pts.length - 1], splash: !!o.splash };
    this.slides.push(s);
    return s;
  }
  // a light hung high in a tall space: lights every floor it can reach
  tallLight(k0, x, z, yAbs, o = {}) {
    for (const f of this.F) {
      const y = yAbs - f.k * FH;
      if (y < -FH || y > FH * 3) continue;
      f.light(x, z, { y, fall: o.fall ?? 0.05, reach2: o.reach2 ?? 420, fixture: f.k === k0 ? (o.fixture || 'lamp') : 'none', state: o.state || 'on', tall: true });
    }
  }
}

export function generateBuilding(def, seed = def.seed) {
  const rng = new RNG(seed);
  const b = new Building(def, rng);
  LAYOUTS[def.layout](b, rng, def);
  finish(b, rng, def);
  return {
    building: b, floors: b.F.map((f) => f.out), stairs: b.stairs, lifts: b.lifts, slides: b.slides,
    start: b.start, startFloor: b.start.k, FH,
  };
}

function finish(b, rng, def) {
  const F = b.F, W = b.W;
  for (const f of F) f.map.computeEdges();
  // open space above: the same cell on the floor above is VOID
  for (const f of F) {
    const up = F[f.k + 1];
    if (!up) continue;
    for (let i = 0; i < W * b.H; i++) {
      const r = f.map.region[i];
      if ((r >= 0 || r === VOID) && up.map.region[i] === VOID) f.out.openAbove[i] = 1;
    }
  }
  for (const f of F) for (const r of f.out.rooms) {
    r.w = r.x1 - r.x0 + 1; r.h = r.z1 - r.z0 + 1;
    r.cx = (r.x0 + r.w / 2) * CELL; r.cz = (r.z0 + r.h / 2) * CELL;
  }
  // ---------- exit + fuse box ----------
  {
    const { k, x, z, side } = b.exit;
    const f = F[k], d = SIDES[side];
    const [cx, cz] = f.map.center(x, z);
    f.map.exitKey = f.map.edgeKey(x, z, d);
    f.out.exit = { key: f.map.exitKey, cell: [x, z], d, x: cx + d.dx * CELL / 2, z: cz + d.dz * CELL / 2, rot: yawFor(-d.dx, -d.dz) };
    const fz = b.fuse || autoFuse(f, x, z);
    const ff = F[fz.k ?? k], fd = SIDES[fz.side];
    const [fcx, fcz] = ff.map.center(fz.x, fz.z);
    ff.out.fusebox = { key: ff.map.edgeKey(fz.x, fz.z, fd), cell: [fz.x, fz.z], x: fcx + fd.dx * (CELL / 2 - WALL_T / 2), z: fcz + fd.dz * (CELL / 2 - WALL_T / 2), rot: yawFor(-fd.dx, -fd.dz) };
  }
  // ---------- locked rooms ----------
  const all = F.flatMap((f) => f.out.rooms);
  const startRoom = b.start.room;
  const st = b.start;
  if (st.x == null) { st.x = startRoom.cx; st.z = startRoom.cz; st.auto = true; }
  const dist = (r) => Math.hypot(r.cx - st.x, r.cz - st.z) + Math.abs(r.k - st.k) * 25;
  const usable = all.filter((r) => !r.noItems && r !== startRoom);
  const lockable = usable.filter((r) => r.doors.length === 1 && !r.noLock).sort((a, c) => dist(c) - dist(a));
  const lockedRooms = lockable.slice(0, def.keys);
  for (const r of lockedRooms) { r.locked = true; r.doors[0].locked = true; }
  // ---------- furnish ----------
  for (const f of F) {
    const reserved = new Set([f.map.exitKey, f.out.fusebox && f.out.fusebox.key].filter(Boolean));
    for (const r of f.out.rooms) if (!furnishExtra(r, f, rng, def)) furnishRoom(r, f.map, rng, f.out);
    dressExtra(f, rng, def, reserved);
    dressHalls(f.map, rng, f.out, reserved, true, def.lockerReach || 3);
  }
  if (st.auto) { // stand at the back of the start room facing its front wall
    const fr = startRoom.front;
    if (fr) { const p = fr.toWorld(fr.width / 2, fr.depth - 1.2); st.x = p[0]; st.z = p[1]; st.yaw = Math.atan2(fr.n[0], fr.n[1]); }
    else st.yaw = 0;
  }
  // ---------- lights ----------
  for (const f of F) {
    const m = f.map, o = f.out;
    const ceilAt = (i) => !o.openAbove[i] && !o.noCeil[i];
    const roll = () => (rng.chance(def.lightsOff) ? 'off' : rng.chance(def.flicker) ? 'flicker' : 'on');
    for (let z = 0; z < b.H; z++) for (let x = 0; x < W; x++) {
      const i = x + z * W;
      if (m.reg(x, z) !== 0 || !ceilAt(i)) continue;
      const horiz = m.reg(x + 1, z) === 0 || m.reg(x - 1, z) === 0;
      const [cx, cz] = m.center(x, z);
      o.lights.push({ x: cx, z: cz, rot: horiz ? Math.PI / 2 : 0, state: roll(), cell: [x, z] });
    }
    for (const r of o.rooms) {
      if (r.noLights) continue;
      const state = r === startRoom ? 'on' : roll();
      for (let z = r.z0; z <= r.z1; z += 2) for (let x = r.x0; x <= r.x1; x += 2) {
        if (!ceilAt(x + z * W)) continue;
        const ex = Math.min(x + 2, r.x1 + 1), ez = Math.min(z + 2, r.z1 + 1);
        o.lights.push({ x: (x + ex) / 2 * CELL, z: (z + ez) / 2 * CELL, rot: 0, state, cell: [x, z], room: r.id });
      }
    }
    for (const l of o.lights) {
      if (l.state === 'off') continue;
      if (l.room) {
        const r = o.rooms.find((q) => q.id === l.room);
        for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) m.lit[x + z * W] = 1;
      } else if (l.tall) {
        const [lx, lz] = l.cell;
        for (let z = lz - 2; z <= lz + 2; z++) for (let x = lx - 2; x <= lx + 2; x++) if (m.inside(x, z)) m.lit[x + z * W] = 1;
      } else m.lit[l.cell[0] + l.cell[1] * W] = 1;
    }
  }
  // ---------- items ----------
  const take = (r) => (r.spots.length ? r.spots.splice(rng.int(0, r.spots.length - 1), 1)[0] : null);
  const place = (type, r, extra = {}) => {
    const s = take(r);
    if (!s) return false;
    F[r.k].out.items.push({ type, x: s[0], y: s[1], z: s[2], room: r.id, ...extra });
    return true;
  };
  const spread = (pool, n, avoid) => {
    const chosen = [], pts = [...avoid], cand = [...pool];
    while (chosen.length < n && cand.length) {
      let bi = 0, bd = -1;
      cand.forEach((r, i) => {
        const d = Math.min(...pts.map((p) => Math.hypot(p[0] - r.cx, p[1] - r.cz) + Math.abs(p[2] - r.k) * 20));
        const s = d + rng.range(0, 6);
        if (s > bd) { bd = s; bi = i; }
      });
      const r = cand.splice(bi, 1)[0];
      chosen.push(r); pts.push([r.cx, r.cz, r.k]);
    }
    return chosen;
  };
  const open = usable.filter((r) => !r.locked && r.spots.length);
  let fuses = 0;
  for (const r of lockedRooms) if (fuses < def.fuses && place('fuse', r)) fuses++;
  for (const r of spread(open, def.fuses - fuses, [[st.x, st.z, st.k], ...lockedRooms.map((l) => [l.cx, l.cz, l.k])])) if (place('fuse', r)) fuses++;
  // any fuse that found no room goes into the farthest open room with space left
  while (fuses < def.fuses) { const r = open.filter((q) => q.spots.length).sort((a, c) => dist(c) - dist(a))[0]; if (!r || !place('fuse', r)) break; fuses++; }
  const byDist = [...open].sort((a, c) => dist(a) - dist(c));
  for (let i = 0; i < lockedRooms.length; i++) {
    const r = byDist[Math.min(byDist.length - 1, Math.floor(byDist.length * (0.25 + 0.3 * i)))];
    if (!r || !place('key', r)) place('key', rng.pick(open));
  }
  const pick = () => rng.pick(open.filter((q) => q.spots.length).length ? open.filter((q) => q.spots.length) : open);
  for (let i = 0; i < def.batteries; i++) place('battery', pick());
  if (startRoom) { place('note', startRoom, { note: 0 }); place('battery', startRoom); place('eraser', startRoom); }
  for (let i = startRoom ? 1 : 0; i < def.notes; i++) place('note', pick(), { note: i });
  if (def.tape !== false) { const far = [...open].sort((a, c) => dist(c) - dist(a)).slice(0, 3); if (far.length) place('tape', rng.pick(far)); }
  for (let i = 1; i < (def.erasers || 0); i++) place('eraser', pick());
}

// a free hall wall next to the exit for the fuse panel
function autoFuse(f, x, z) {
  const m = f.map;
  const cells = [[x, z]];
  for (const d of DIRS) if (m.canStep(x, z, d)) cells.push([x + d.dx, z + d.dz]);
  for (const [fx, fz] of cells) for (const [s, d] of Object.entries(SIDES)) {
    const k = m.edgeKey(fx, fz, d);
    if (k === m.exitKey || m.edge(fx, fz, d) !== EDGE.WALL || m.reg(fx, fz) !== 0) continue;
    return { k: f.k, x: fx, z: fz, side: s };
  }
  return { k: f.k, x, z, side: Object.keys(SIDES).find((s) => m.edge(x, z, SIDES[s]) === EDGE.WALL && m.edgeKey(x, z, SIDES[s]) !== m.exitKey) || 'N' };
}
