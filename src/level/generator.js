// Procedural school floor-plan generator.
// Corridors run on every BLOCK-th row/column; a random spanning tree of corridor
// segments keeps the halls connected while removed segments merge blocks into
// big rooms (library / study hall) or become solid wall. Blocks become
// classrooms, or are split into offices / storage rooms.
import { BLOCK, CELL, WALL_T } from '../config.js';
import { RNG } from '../util/rng.js';
import { LevelMap, DIRS, EDGE } from './map.js';

const SIDE_N = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }; // inward normals
const yawFor = (fx, fz) => Math.atan2(fx, fz); // rotation that points model +Z along (fx,fz)

export function generateLevel(def, seed = def.seed) {
  const rng = new RNG(seed);
  const bx = def.blocksX, bz = def.blocksZ;
  const W = bx * BLOCK + 1, H = bz * BLOCK + 1;
  const map = new LevelMap(W, H);
  const out = {
    map, rooms: [], props: [], colliders: [], lockers: [], lights: [], items: [],
    start: null, exit: null, fusebox: null, decals: [],
  };

  // ---------- 1. corridor graph & spanning tree ----------
  const nodeId = (i, j) => i + j * (bx + 1);
  const segs = [];
  for (let j = 0; j <= bz; j++) for (let i = 0; i < bx; i++) segs.push({ a: nodeId(i, j), b: nodeId(i + 1, j), hor: true, i, j });
  for (let j = 0; j < bz; j++) for (let i = 0; i <= bx; i++) segs.push({ a: nodeId(i, j), b: nodeId(i, j + 1), hor: false, i, j });
  const parent = Array.from({ length: (bx + 1) * (bz + 1) }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  rng.shuffle(segs);
  for (const s of segs) {
    const ra = find(s.a), rb = find(s.b);
    if (ra !== rb) { parent[ra] = rb; s.keep = true; }
  }
  for (const s of segs) if (!s.keep && rng.chance(0.45)) s.keep = true;

  const segCells = (s) => {
    const cells = [];
    for (let k = 1; k < BLOCK; k++) cells.push(s.hor ? [s.i * BLOCK + k, s.j * BLOCK] : [s.i * BLOCK, s.j * BLOCK + k]);
    return cells;
  };
  // intersections are always hall (tree touches every node)
  for (let j = 0; j <= bz; j++) for (let i = 0; i <= bx; i++) map.setReg(i * BLOCK, j * BLOCK, 0);
  for (const s of segs) if (s.keep) for (const [x, z] of segCells(s)) map.setReg(x, z, 0);

  // ---------- 2. blocks -> rooms ----------
  const blockRoom = new Map(); // "i,j" -> room
  let nextId = 1;
  const newRoom = (x0, z0, x1, z1, type) => {
    const r = { id: nextId++, type, x0, z0, x1, z1, doors: [], locked: false, spots: [] };
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) map.setReg(x, z, r.id);
    out.rooms.push(r);
    return r;
  };
  const bCells = (i, j) => [i * BLOCK + 1, j * BLOCK + 1, i * BLOCK + BLOCK - 1, j * BLOCK + BLOCK - 1];
  // merge blocks across removed interior segments
  for (const s of segs) {
    if (s.keep) continue;
    const interior = s.hor ? s.j > 0 && s.j < bz : s.i > 0 && s.i < bx;
    if (!interior) continue;
    const A = s.hor ? [s.i, s.j - 1] : [s.i - 1, s.j];
    const B = [s.i, s.j];
    if (blockRoom.has(A.join()) || blockRoom.has(B.join()) || !rng.chance(def.mergeChance ?? 0.6)) continue;
    const [ax0, az0] = bCells(...A); const [, , bx1, bz1] = bCells(...B);
    const r = newRoom(ax0, az0, bx1, bz1, rng.pick(def.bigRooms || ['library', 'studyhall']));
    blockRoom.set(A.join(), r); blockRoom.set(B.join(), r);
  }
  for (let j = 0; j < bz; j++) for (let i = 0; i < bx; i++) {
    if (blockRoom.has(i + ',' + j)) continue;
    const [x0, z0, x1, z1] = bCells(i, j);
    if (rng.chance(0.28)) {
      const types = rng.shuffle([...(def.smallRooms || ['storage', 'office', 'restroom'])]);
      if (rng.chance(0.5)) { newRoom(x0, z0, x0 + 1, z1, types[0]); newRoom(x0 + 2, z0, x1, z1, types[1]); }
      else { newRoom(x0, z0, x1, z0 + 1, types[0]); newRoom(x0, z0 + 2, x1, z1, types[1]); }
    } else newRoom(x0, z0, x1, z1, 'classroom');
  }

  // ---------- 3. doors ----------
  const addDoor = (x, z, d, room) => {
    const [kind, ex, ez] = map.edgeOf(x, z, d);
    const k = map.key(kind, ex, ez);
    if (map.doors.has(k)) return null;
    const door = {
      key: k, kind, ex, ez, locked: false, open: false, openAmount: 0, room,
      x: kind === 'v' ? ex * CELL : (ex + 0.5) * CELL,
      z: kind === 'h' ? ez * CELL : (ez + 0.5) * CELL,
      // inward direction (towards room) from the hall side
      inX: -d.dx, inZ: -d.dz,
      roomCell: [x, z],
    };
    map.doors.set(k, door);
    room.doors.push(door);
    return door;
  };
  for (const r of out.rooms) {
    const cand = [];
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) {
      for (const d of DIRS) {
        if (map.reg(x + d.dx, z + d.dz) !== 0) continue;
        // avoid the cells right beside corridor intersections for nicer look
        const side = d.dx === 1 ? 'E' : d.dx === -1 ? 'W' : d.dz === 1 ? 'S' : 'N';
        cand.push({ x, z, d, side });
      }
    }
    if (!cand.length) continue;
    rng.shuffle(cand);
    const want = r.type === 'library' || r.type === 'studyhall' || r.type === 'gym' ? 2 : 1;
    const usedSides = new Set();
    for (const c of cand) {
      if (r.doors.length >= want) break;
      if (usedSides.has(c.side)) continue;
      if (addDoor(c.x, c.z, c.d, r)) usedSides.add(c.side);
    }
  }
  // rooms without hall access: connect to an adjacent room, or remove
  for (const r of out.rooms) {
    if (r.doors.length) continue;
    outer: for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) for (const d of DIRS) {
      const n = map.reg(x + d.dx, z + d.dz);
      if (n > 0 && n !== r.id && out.rooms.find((o) => o.id === n).doors.length) { addDoor(x, z, d, r); break outer; }
    }
  }
  map.computeEdges();
  const reach = map.bfs(0, 0, 'reach');
  out.rooms = out.rooms.filter((r) => {
    const ok = reach[r.x0 + r.z0 * W] >= 0;
    if (!ok) { for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) map.setReg(x, z, -1); }
    return ok;
  });
  map.computeEdges();
  for (const r of out.rooms) {
    r.w = r.x1 - r.x0 + 1; r.h = r.z1 - r.z0 + 1;
    r.cx = (r.x0 + r.w / 2) * CELL; r.cz = (r.z0 + r.h / 2) * CELL;
  }

  // ---------- 4. start room, locked rooms ----------
  const classrooms = out.rooms.filter((r) => r.type === 'classroom');
  const startRoom = [...classrooms].sort((a, b) => (a.cx + a.cz) - (b.cx + b.cz))[0] || out.rooms[0];
  startRoom.isStart = true;
  const startDoor = startRoom.doors[0];
  const distFromStart = map.bfs(...startDoor.roomCell, 'reach');
  const roomDist = (r) => distFromStart[r.x0 + r.z0 * W];

  // ---------- 5. exit & fuse box ----------
  let best = null;
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (map.reg(x, z) !== 0) continue;
    for (const d of DIRS) {
      if (map.reg(x + d.dx, z + d.dz) !== -1 || map.edge(x, z, d) !== EDGE.WALL) continue;
      const dd = distFromStart[x + z * W];
      if (!best || dd > best.dist) best = { x, z, d, dist: dd };
    }
  }
  {
    const { x, z, d } = best;
    const [cx, cz] = map.center(x, z);
    map.exitKey = map.edgeKey(x, z, d);
    out.exit = {
      key: map.exitKey, cell: [x, z], d,
      x: cx + d.dx * CELL / 2, z: cz + d.dz * CELL / 2,
      rot: yawFor(-d.dx, -d.dz), // faces into the hallway
    };
    // look for a free wall near the exit for the fuse box
    const used = new Set([map.exitKey]);
    const fbCells = [[x, z]];
    for (const d2 of DIRS) if (map.canStep(x, z, d2)) fbCells.push([x + d2.dx, z + d2.dz]);
    for (const [fx, fz] of fbCells) {
      for (const d2 of DIRS) {
        const k = map.edgeKey(fx, fz, d2);
        if (used.has(k) || map.edge(fx, fz, d2) !== EDGE.WALL || map.reg(fx, fz) !== 0) continue;
        const [ccx, ccz] = map.center(fx, fz);
        out.fusebox = {
          key: k, cell: [fx, fz],
          x: ccx + d2.dx * (CELL / 2 - WALL_T / 2), z: ccz + d2.dz * (CELL / 2 - WALL_T / 2),
          rot: yawFor(-d2.dx, -d2.dz),
        };
        break;
      }
      if (out.fusebox) break;
    }
    if (!out.fusebox) { // fallback: mount beside exit
      out.fusebox = { key: null, cell: [x, z], x: out.exit.x - d.dx * 0.12 + d.dz * 1.25, z: out.exit.z - d.dz * 0.12 + d.dx * 1.25, rot: out.exit.rot };
    }
  }
  const reserved = new Set([map.exitKey, out.fusebox.key]);

  // locked rooms: far from start, never the start room, prefer small rooms
  const lockable = out.rooms.filter((r) => !r.isStart && r.doors.length === 1)
    .sort((a, b) => roomDist(b) - roomDist(a));
  const lockedRooms = lockable.slice(0, def.keys);
  for (const r of lockedRooms) { r.locked = true; r.doors[0].locked = true; }

  // ---------- 6. furnish rooms ----------
  for (const r of out.rooms) furnishRoom(r, map, rng, out);

  // ---------- 7. hallway dressing (lockers, fountains, clocks) ----------
  dressHalls(map, rng, out, reserved);

  // ---------- 8. lights ----------
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (map.reg(x, z) !== 0) continue;
    const horiz = map.reg(x + 1, z) === 0 || map.reg(x - 1, z) === 0;
    const state = rng.chance(def.lightsOff) ? 'off' : rng.chance(def.flicker) ? 'flicker' : 'on';
    const [cx, cz] = map.center(x, z);
    out.lights.push({ x: cx, z: cz, rot: horiz ? Math.PI / 2 : 0, state, cell: [x, z] });
  }
  for (const r of out.rooms) {
    const state = r.isStart ? 'on' : rng.chance(def.lightsOff) ? 'off' : rng.chance(def.flicker) ? 'flicker' : 'on';
    for (let z = r.z0; z <= r.z1; z += 2) for (let x = r.x0; x <= r.x1; x += 2) {
      const ex = Math.min(x + 2, r.x1 + 1), ez = Math.min(z + 2, r.z1 + 1);
      out.lights.push({ x: (x + ex) / 2 * CELL, z: (z + ez) / 2 * CELL, rot: 0, state, cell: [x, z], room: r.id });
    }
  }
  for (const l of out.lights) if (l.state !== 'off') {
    if (l.room) {
      const r = out.rooms.find((o) => o.id === l.room);
      for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) map.lit[x + z * W] = 1;
    } else map.lit[l.cell[0] + l.cell[1] * W] = 1;
  }

  // ---------- 9. items ----------
  const takeSpot = (r) => {
    if (!r.spots.length) return null;
    return r.spots.splice(rng.int(0, r.spots.length - 1), 1)[0];
  };
  const spread = (pool, n, avoid = []) => { // farthest-point sampling over room centers
    const chosen = [];
    const pts = [...avoid];
    const cand = [...pool];
    while (chosen.length < n && cand.length) {
      let bi = 0, bd = -1;
      cand.forEach((r, i) => {
        const d = pts.length ? Math.min(...pts.map((p) => Math.hypot(p[0] - r.cx, p[1] - r.cz))) : roomDist(r);
        const score = d + rng.range(0, 6);
        if (score > bd) { bd = score; bi = i; }
      });
      const r = cand.splice(bi, 1)[0];
      chosen.push(r); pts.push([r.cx, r.cz]);
    }
    return chosen;
  };
  const startPt = [startRoom.cx, startRoom.cz];
  const place = (type, r, extra = {}) => {
    const s = takeSpot(r);
    if (!s) return false;
    out.items.push({ type, x: s[0], y: s[1], z: s[2], room: r.id, ...extra });
    return true;
  };
  // fuses: one in every locked room, the rest spread out
  let fuseCount = 0;
  for (const r of lockedRooms) if (fuseCount < def.fuses && place('fuse', r)) fuseCount++;
  const openRooms = out.rooms.filter((r) => !r.locked && !r.isStart);
  for (const r of spread(openRooms, def.fuses - fuseCount, [startPt, ...lockedRooms.map((l) => [l.cx, l.cz])])) {
    if (place('fuse', r)) fuseCount++;
  }
  // keys go in unlocked rooms that are not the start room, roughly mid-distance
  const keyRooms = [...openRooms].sort((a, b) => roomDist(a) - roomDist(b));
  for (let i = 0; i < lockedRooms.length; i++) {
    const r = keyRooms[Math.min(keyRooms.length - 1, Math.floor(keyRooms.length * (0.25 + 0.3 * i)))];
    if (!place('key', r)) place('key', rng.pick(openRooms));
  }
  const batteryRooms = rng.shuffle([...openRooms]);
  for (let i = 0; i < def.batteries; i++) place('battery', batteryRooms[i % batteryRooms.length]);
  place('note', startRoom, { note: 0 });
  const noteRooms = rng.shuffle([...openRooms]);
  for (let i = 1; i < def.notes; i++) place('note', noteRooms[i % noteRooms.length], { note: i });
  place('battery', startRoom);
  place('eraser', startRoom);
  const eraserRooms = rng.shuffle([...openRooms]);
  for (let i = 1; i < (def.erasers || 0); i++) place('eraser', eraserRooms[i % eraserRooms.length]);

  // ---------- 10. player start ----------
  {
    const r = startRoom;
    const f = r.front; // furnishing stored the board side frame
    const p = f.toWorld(f.width / 2 + 1.5, f.depth - 1.5);
    // camera forward is (-sin yaw, -cos yaw); face the chalkboard (-n)
    out.start = { x: p[0], z: p[1], yaw: Math.atan2(f.n[0], f.n[1]) };
  }

  // floor stains for grime
  for (let i = 0; i < W * H * 0.12; i++) {
    const x = rng.int(0, W - 1), z = rng.int(0, H - 1);
    if (map.reg(x, z) < 0) continue;
    out.decals.push({ x: (x + rng.range(0.15, 0.85)) * CELL, z: (z + rng.range(0.15, 0.85)) * CELL, s: rng.range(0.6, 1.8), r: rng.range(0, 6.28) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Room furnishing. Each room gets a local frame: u runs along its "front" wall,
// v points inward. Props are emitted in world space with AABB colliders.
// ---------------------------------------------------------------------------
function roomFrame(r, side) {
  const n = SIDE_N[side];
  const x0 = r.x0 * CELL, z0 = r.z0 * CELL, x1 = (r.x1 + 1) * CELL, z1 = (r.z1 + 1) * CELL;
  const alongX = side === 'N' || side === 'S';
  const width = alongX ? x1 - x0 : z1 - z0;
  const depth = alongX ? z1 - z0 : x1 - x0;
  const toWorld = (u, v) => {
    switch (side) {
      case 'N': return [x0 + u, z0 + v];
      case 'S': return [x0 + u, z1 - v];
      case 'W': return [x0 + v, z0 + u];
      default: return [x1 - v, z0 + u];
    }
  };
  return { side, n, width, depth, toWorld, alongX };
}

function doorSides(r) {
  const s = new Set();
  for (const d of r.doors) {
    // door inward vector points from hall into room; side is the opposite
    if (d.inX === 1) s.add('W'); else if (d.inX === -1) s.add('E');
    else if (d.inZ === 1) s.add('N'); else s.add('S');
  }
  return s;
}

// does the wall segment (u from a to b, on frame's front side) contain a door?
function sideHasDoorNear(r, frame, uA, uB) {
  for (const d of r.doors) {
    const ds = d.inX === 1 ? 'W' : d.inX === -1 ? 'E' : d.inZ === 1 ? 'N' : 'S';
    if (ds !== frame.side) continue;
    // door u coordinate
    const p = frame.alongX ? d.x - r.x0 * CELL : d.z - r.z0 * CELL;
    if (p + 0.9 > uA && p - 0.9 < uB) return true;
  }
  return false;
}

function emitProp(out, type, wx, wz, rot, size, opts = {}) {
  out.props.push({ type, x: wx, z: wz, y: opts.y || 0, rot, ...opts });
  if (size) {
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    const hx = (size[0] * c + size[1] * s) / 2, hz = (size[0] * s + size[1] * c) / 2;
    out.colliders.push({ minX: wx - hx, maxX: wx + hx, minZ: wz - hz, maxZ: wz + hz, h: size[2] || 1 });
  }
}

function furnishRoom(r, map, rng, out) {
  const ds = doorSides(r);
  const sides = ['N', 'S', 'W', 'E'];
  const free = sides.filter((s) => !ds.has(s));
  const longSide = r.w >= r.h ? (rng.chance(0.5) ? 'N' : 'S') : (rng.chance(0.5) ? 'W' : 'E');
  let frontSide = free.length ? rng.pick(free) : longSide;
  if (r.type === 'classroom' && free.length === 0) frontSide = 'N';
  const f = roomFrame(r, frontSide);
  r.front = f;
  const faceIn = yawFor(f.n[0], f.n[1]);     // facing away from front wall
  const faceFront = yawFor(-f.n[0], -f.n[1]); // facing the front wall
  const opposite = { N: 'S', S: 'N', W: 'E', E: 'W' }[frontSide];
  const back = roomFrame(r, opposite);
  const W_ = f.width, D = f.depth;
  const at = (u, v) => f.toWorld(u, v);
  const spot = (u, v, y) => { const [x, z] = at(u, v); r.spots.push([x, y, z]); };
  const wallOff = WALL_T / 2;

  const lockerOnBackWall = (u) => {
    if (sideHasDoorNear(r, back, u - 0.6, u + 0.6)) return false;
    const [x, z] = back.toWorld(u, wallOff + 0.3);
    out.lockers.push({ kind: 'locker', x, z, rot: yawFor(back.n[0], back.n[1]) });
    out.colliders.push(aabb(x, z, 0.62, 0.58, yawFor(back.n[0], back.n[1])));
    return true;
  };

  if (r.type === 'classroom' || r.type === 'studyhall') {
    if (!sideHasDoorNear(r, f, W_ / 2 - 1.7, W_ / 2 + 1.7)) {
      const [bx, bz] = at(W_ / 2, wallOff);
      emitProp(out, 'chalkboard', bx, bz, faceIn, null);
      const [cx, cz] = at(W_ / 2, wallOff);
      emitProp(out, 'wall_clock', cx, cz, faceIn, null, { y: 2.55 });
    }
    const [tx, tz] = at(W_ / 2, 0.8);
    emitProp(out, 'teacher_desk', tx, tz, faceIn, [1.5, 0.75, 0.8]);
    spot(W_ / 2 - 0.45, 0.8, 0.79); spot(W_ / 2 + 0.4, 0.8, 0.79);
    for (let v = 3; v < D - 1; v += 3) for (let u = 3; u < W_ - 1; u += 3) {
      if (rng.chance(0.08)) continue;
      const [x, z] = at(u + rng.range(-0.12, 0.12), v + rng.range(-0.1, 0.1));
      if (rng.chance(0.08)) { emitProp(out, 'chair_fallen', x, z, faceFront + rng.range(-1, 1), [0.6, 0.6, 0.5]); continue; }
      const rot = faceFront + rng.range(-0.12, 0.12);
      emitProp(out, 'student_desk', x, z, rot, [0.7, 1.1, 0.8]);
      // desk top is toward the board from the desk origin
      r.spots.push([x - f.n[0] * 0.25, 0.77, z - f.n[1] * 0.25]);
    }
    if (rng.chance(0.6)) lockerOnBackWall(W_ - 1.2);
    if (!sideHasDoorNear(r, back, 0, 2.4)) {
      const [x, z] = back.toWorld(1.5, wallOff + 0.18);
      emitProp(out, 'bookshelf', x, z, yawFor(back.n[0], back.n[1]), [1.2, 0.36, 1.8]);
    }
    const [bx2, bz2] = at(0.5, 0.5); emitProp(out, 'trash_bin', bx2, bz2, rng.range(0, 6), [0.4, 0.4, 0.5]);
  } else if (r.type === 'library') {
    // shelves on the cell-boundary lines, aisles along cell centers
    for (let v = 3; v < D - 1; v += 3) for (let u = 3; u < W_ - 1; u += 3) {
      if (rng.chance(0.15)) continue;
      const [x, z] = at(u, v);
      const rot = (rng.chance(0.5) ? faceIn : faceFront);
      emitProp(out, 'bookshelf', x, z, rot, [1.2, 0.36, 1.8]);
      r.spots.push([x + f.n[0] * 0.5, 0.03, z + f.n[1] * 0.5]);
    }
    const [tx, tz] = at(W_ / 2, 0.8);
    emitProp(out, 'teacher_desk', tx, tz, faceIn, [1.5, 0.75, 0.8]);
    spot(W_ / 2, 0.8, 0.79);
    lockerOnBackWall(1.0);
  } else if (r.type === 'restroom') {
    // row of hideable stalls against the back wall, sinks on the front wall
    const n = Math.floor((W_ - 0.4) / 0.97);
    const startU = (W_ - n * 0.97) / 2 + 0.485;
    const rotBack = yawFor(back.n[0], back.n[1]);
    for (let i = 0; i < n; i++) {
      const u = startU + i * 0.97;
      if (sideHasDoorNear(r, back, u - 0.6, u + 0.6)) continue;
      const [x, z] = back.toWorld(u, wallOff + 0.7);
      out.lockers.push({ kind: 'stall', x, z, rot: rotBack });
      // partitions only: the stall interior stays walkable for the hiding camera
      const c = Math.abs(Math.cos(rotBack)) > 0.5;
      for (const s of [-1, 1]) {
        const [px, pz] = back.toWorld(u + s * 0.47, wallOff + 0.7);
        out.colliders.push(c ? { minX: px - 0.03, maxX: px + 0.03, minZ: pz - 0.7, maxZ: pz + 0.7, h: 2 } : { minX: px - 0.7, maxX: px + 0.7, minZ: pz - 0.03, maxZ: pz + 0.03, h: 2 });
      }
      const [fx, fz] = back.toWorld(u, wallOff + 1.38);
      out.colliders.push(c ? { minX: fx - 0.48, maxX: fx + 0.48, minZ: fz - 0.03, maxZ: fz + 0.03, h: 2 } : { minX: fx - 0.03, maxX: fx + 0.03, minZ: fz - 0.48, maxZ: fz + 0.48, h: 2 });
    }
    if (!sideHasDoorNear(r, f, W_ / 2 - 1.0, W_ / 2 + 1.0)) {
      const [sx, sz] = at(W_ / 2, wallOff);
      emitProp(out, 'sink_counter', sx, sz, faceIn, null);
      const [cx, cz] = at(W_ / 2, wallOff + 0.25);
      out.colliders.push(aabb(cx, cz, 1.6, 0.5, faceIn));
      spot(W_ / 2 - 0.6, 0.3, 0.9);
    }
    const [bx2, bz2] = at(0.5, 0.5); emitProp(out, 'trash_bin', bx2, bz2, 0, [0.4, 0.4, 0.5]);
    spot(W_ / 2, D / 2 + 0.3, 0.02); spot(1.0, D / 2, 0.02);
  } else if (r.type === 'gym') {
    // bleachers along the front wall, hoops on the two short ends
    for (let u = 1.8; u < W_ - 1.6; u += 3.2) {
      if (sideHasDoorNear(r, f, u - 1.6, u + 1.6)) continue;
      const [x, z] = at(u, wallOff + 1.0);
      emitProp(out, 'bleachers', x, z, faceFront + Math.PI, [3.0, 2.0, 1.5]);
      r.spots.push([x, 0.78, z]);
    }
    for (const side of f.alongX ? ['W', 'E'] : ['N', 'S']) {
      const sf = roomFrame(r, side);
      if (sideHasDoorNear(r, sf, sf.width / 2 - 1, sf.width / 2 + 1)) continue;
      const [hx, hz] = sf.toWorld(sf.width / 2, wallOff);
      emitProp(out, 'basketball_hoop', hx, hz, yawFor(sf.n[0], sf.n[1]), null);
    }
    for (let i = 0; i < 5; i++) {
      const u = rng.range(1, W_ - 1), v = rng.range(D * 0.45, D - 1);
      if (Math.abs(((u % 3) + 3) % 3 - 1.5) < 0.6 || Math.abs(((v % 3) + 3) % 3 - 1.5) < 0.6) continue;
      const [x, z] = at(u, v);
      emitProp(out, rng.chance(0.5) ? 'cardboard_box' : 'chair_fallen', x, z, rng.range(0, 6), [0.6, 0.6, 0.5]);
    }
    lockerOnBackWall(1.2); lockerOnBackWall(W_ - 1.2);
    spot(W_ / 2, D * 0.6, 0.02); spot(W_ / 3, D * 0.75, 0.02); spot(W_ * 0.7, D * 0.5, 0.02);
  } else if (r.type === 'storage') {
    for (let i = 0; i < 6; i++) {
      const u = rng.range(0.6, W_ - 0.6), v = rng.range(1.0, D - 0.6);
      const [x, z] = at(u, v);
      if (Math.abs(((u % 3) + 3) % 3 - 1.5) < 0.6 || Math.abs(((v % 3) + 3) % 3 - 1.5) < 0.6) continue; // keep aisles
      emitProp(out, 'cardboard_box', x, z, rng.range(0, 6), [0.6, 0.6, 0.5]);
      r.spots.push([x, 0.52, z]);
    }
    if (!sideHasDoorNear(r, f, 0, 2.6)) {
      const [x, z] = at(1.4, wallOff + 0.25);
      emitProp(out, 'locker_bank', x, z, faceIn, [2.4, 0.5, 1.95]);
    }
    const [sx, sz] = at(W_ - 0.8, wallOff + 0.18);
    if (!sideHasDoorNear(r, f, W_ - 1.6, W_)) emitProp(out, 'bookshelf', sx, sz, faceIn, [1.2, 0.36, 1.8]);
    lockerOnBackWall(W_ / 2);
    spot(W_ / 2, D / 2, 0.02); spot(1.5, D - 1.5, 0.02);
  } else { // office
    const [tx, tz] = at(W_ / 2, 1.6);
    emitProp(out, 'teacher_desk', tx, tz, faceIn, [1.5, 0.75, 0.8]);
    spot(W_ / 2 - 0.4, 1.6, 0.79); spot(W_ / 2 + 0.4, 1.6, 0.79);
    if (!sideHasDoorNear(r, f, 0, 2.4)) {
      const [x, z] = at(0.9, wallOff + 0.18);
      emitProp(out, 'bookshelf', x, z, faceIn, [1.2, 0.36, 1.8]);
    }
    const [cx, cz] = at(W_ - 1.0, 2.6); emitProp(out, 'chair_fallen', cx, cz, rng.range(0, 6), [0.6, 0.6, 0.5]);
    const [bx2, bz2] = at(0.5, D - 0.6); emitProp(out, 'trash_bin', bx2, bz2, 0, [0.4, 0.4, 0.5]);
    lockerOnBackWall(W_ - 1.0);
    spot(W_ / 2, D - 1.5, 0.02);
  }
  if (!r.spots.length) { const [x, z] = at(W_ / 2, D / 2); r.spots.push([x, 0.02, z]); }
}

function aabb(x, z, w, d, rot) {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, h: 2 };
}

function dressHalls(map, rng, out, reserved) {
  const { W, H } = map;
  const hideCount = new Map(); // corridor-run id -> lockers
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (map.reg(x, z) !== 0) continue;
    const [cx, cz] = map.center(x, z);
    let axis = null;
    const walls = DIRS.filter((d) => map.edge(x, z, d) === EDGE.WALL && !reserved.has(map.edgeKey(x, z, d)));
    rng.shuffle(walls);
    for (const d of walls) {
      const ax = d.dx !== 0 ? 'x' : 'z';
      if (axis && axis !== ax) continue;
      const roll = rng.next();
      const rot = yawFor(-d.dx, -d.dz);
      const along = [d.dz, d.dx]; // tangent along wall
      const base = (depth) => [cx + d.dx * (CELL / 2 - WALL_T / 2 - depth / 2), cz + d.dz * (CELL / 2 - WALL_T / 2 - depth / 2)];
      if (roll < 0.36) {
        const [px, pz] = base(0.5);
        emitProp(out, 'locker_bank', px, pz, rot, [2.4, 0.5, 1.95]);
        axis = ax;
      } else if (roll < 0.62) {
        const n = rng.chance(0.5) ? 2 : 1;
        const [px, pz] = base(0.55);
        const o = rng.pick([-0.7, 0, 0.7]);
        for (let i = 0; i < n; i++) {
          const k = o + (i - (n - 1) / 2) * 0.62;
          const lx = px + along[0] * k, lz = pz + along[1] * k;
          out.lockers.push({ kind: 'locker', x: lx, z: lz, rot });
          out.colliders.push(aabb(lx, lz, 0.62, 0.58, rot));
        }
        axis = ax;
      } else if (roll < 0.68) {
        const [px, pz] = base(0);
        emitProp(out, 'water_fountain', px, pz, rot, null);
        const [qx, qz] = base(0.4);
        out.colliders.push(aabb(qx, qz, 0.5, 0.4, rot));
        axis = ax;
      } else if (roll < 0.72) {
        const [px, pz] = base(0.4);
        emitProp(out, 'trash_bin', px + along[0] * 0.9, pz + along[1] * 0.9, rot, [0.4, 0.4, 0.5]);
      } else if (roll < 0.76) {
        const [px, pz] = base(0);
        emitProp(out, 'wall_clock', px, pz, rot, null, { y: 2.45 });
      }
    }
  }
  // guarantee: every hall cell is within ~3 cells of a hideable locker
  const lockerCells = out.lockers.map((l) => map.cellOf(l.x, l.z));
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (map.reg(x, z) !== 0) continue;
    if (lockerCells.some(([lx, lz]) => Math.abs(lx - x) + Math.abs(lz - z) <= 3)) continue;
    const d = DIRS.find((dd) => map.edge(x, z, dd) === EDGE.WALL && !reserved.has(map.edgeKey(x, z, dd)));
    if (!d) continue;
    const [cx, cz] = map.center(x, z);
    // avoid overlapping an existing locker bank in this cell
    const lx = cx + d.dx * (CELL / 2 - WALL_T / 2 - 0.275), lz = cz + d.dz * (CELL / 2 - WALL_T / 2 - 0.275);
    const clash = out.colliders.some((c) => lx > c.minX - 0.3 && lx < c.maxX + 0.3 && lz > c.minZ - 0.3 && lz < c.maxZ + 0.3);
    if (clash) continue;
    const rot = yawFor(-d.dx, -d.dz);
    out.lockers.push({ kind: 'locker', x: lx, z: lz, rot });
    out.colliders.push(aabb(lx, lz, 0.62, 0.58, rot));
    lockerCells.push([x, z]);
  }
}
