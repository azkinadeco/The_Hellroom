// LEVEL 4 — Kolam Renang ("poolrooms"). Five storeys of white tile that keep
// folding back into water. Registers LAYOUTS.poolrooms (overriding the old
// plan in layouts.js), its room furnishing and the level dressing.
//
// The spine of the building is a drained pool five storeys deep: its basin is
// the ground floor, the first floor is its deck, and a smaller pool still full
// of water sits in the middle of the dry basin (a pool inside a pool). Open
// stairs climb out of the basin; water slides spiral down into it. Round it:
//   ground  drain tunnels, a flooded corridor the stairs descend into, a hall
//           of tiled pillars standing in water, a 54 m lane pool that ends in
//           a wall, a changing-room maze, a row of identical shower cubicles
//   floor 2 a shower hall with a waterfall, lifeguard chairs facing the wall,
//           five identical pool rooms in a row, the pool tower balcony
//   floor 3 terraced pools that spill onto the atrium, tiled tunnels behind
//           tiny doorways, a second drained pool, a dark pillar hall
//   floor 4 the walk between two drops, lanes that run into a wall, a maze
//   floor 5 the warden's room you wake in, lanes again, the slide towers
//   atrium x 9..18, z 8..17 · tower x 20..23, z 9..14
import { CELL, POOL_Y, WALL_T } from '../config.js';
import { LAYOUTS } from './layouts.js';
import { FURNISH, DRESS } from './furnish2.js';
import { DIRS, EDGE } from './map.js';
import { roomFrame, sideHasDoorNear, yawFor, aabb } from './generator.js';

const SD = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
const OPPS = { E: 'W', W: 'E', S: 'N', N: 'S' };
const wallOff = WALL_T / 2;
const FH = 3.6;

function helix(cx, cz, r, a0, turns, y0, y1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, y0 + (y1 - y0) * t, cz + Math.sin(a) * r]);
  }
  return pts;
}

// water rectangle over cells (inset in metres)
function flood(f, x0, z0, x1, z1, inset = 0.02, plain = true) {
  f.out.water.push({ minX: x0 * CELL + inset, maxX: (x1 + 1) * CELL - inset, minZ: z0 * CELL + inset, maxZ: (z1 + 1) * CELL - inset, plain });
}

// tiny tiled doorway on an open edge: the 3 m opening closed down to 0.95 x 1.75 m
function portal(f, x, z, side) {
  f.arch(x, z, side);
  const [dx, dz] = SD[side];
  const ex = (x + 0.5) * CELL + dx * CELL / 2, ez = (z + 0.5) * CELL + dz * CELL / 2;
  const alongX = dz !== 0;
  f.prop('low_portal', ex, ez, alongX ? 0 : Math.PI / 2, null);
  for (const s of [-1, 1]) {
    const c = s * (0.475 + 0.5125);
    f.out.colliders.push(alongX
      ? { minX: ex + c - 0.5125, maxX: ex + c + 0.5125, minZ: ez - 0.12, maxZ: ez + 0.12, h: 3 }
      : { minX: ex - 0.12, maxX: ex + 0.12, minZ: ez + c - 0.5125, maxZ: ez + c + 0.5125, h: 3 });
  }
}

// a carved maze inside a room: spanning tree over its cells, a few extra
// openings for loops, the rest walled off
function carveMaze(f, r, rng, loops = 0.18) {
  const inR = (x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const seen = new Set(), open = new Set();
  const k = (x, z) => x + ',' + z;
  const stack = [[r.x0, r.z0]]; seen.add(k(r.x0, r.z0));
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const nb = Object.entries(SD).filter(([, [dx, dz]]) => inR(x + dx, z + dz) && !seen.has(k(x + dx, z + dz)));
    if (!nb.length) { stack.pop(); continue; }
    const [s, [dx, dz]] = rng.pick(nb);
    open.add(f.edgeKey(x, z, s));
    seen.add(k(x + dx, z + dz)); stack.push([x + dx, z + dz]);
  }
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) for (const s of ['E', 'S']) {
    const [dx, dz] = SD[s];
    if (!inR(x + dx, z + dz)) continue;
    const key = f.edgeKey(x, z, s);
    if (open.has(key) || rng.chance(loops)) continue;
    f.wall(x, z, s);
  }
}

// Pools, showers and lifeguard posts have no doors: their doorway is walled
// down to a tiny tiled opening (the door record stays on the room so the
// furnishing keeps it clear; the edge itself becomes an open archway).
const OPEN_TYPES = new Set(['kolam', 'lanes', 'shower', 'jaga', 'pilar', 'labirin', 'cubicle', 'terrace', 'repeat']);
function openUp(f, r, d) {
  f.map.doors.delete(d.key);
  const [x, z] = d.roomCell;
  const side = d.inX === 1 ? 'W' : d.inX === -1 ? 'E' : d.inZ === 1 ? 'N' : 'S';
  portal(f, x, z, side);
  if (r.sign) (f.out.poolSigns = f.out.poolSigns || []).push({ x: d.x - d.inX * (wallOff + 0.11), z: d.z - d.inZ * (wallOff + 0.11), y: 2.42, rot: yawFor(-d.inX, -d.inZ), text: r.sign });
}

// ---------------------------------------------------------------------------
function poolrooms(b, rng) {
  const F = b.F;
  const [F0, F1, F2, F3, F4] = F;
  // doors are cut once every hall exists (rooms and halls are carved in any order)
  const pending = [];
  const R = (f, x0, z0, x1, z1, type, sign, o = {}) => { const r = f.room(x0, z0, x1, z1, type, { sign, ...o }); pending.push([f, r, o.ds || null]); return r; };
  const G = (f, x0, z0, x1, z1, type, sign, o = {}) => f.room(x0, z0, x1, z1, type, { sign, ...o });
  const tunnel = (f, x0, z0, x1, z1, o = {}) => G(f, x0, z0, x1, z1, 'tunnel', null, { noLock: true, noLights: true, noItems: true, mat: { floor: 'pool_floor', wall: 'pool_wall' }, ...o });

  // ---- the atrium: dry basin on the ground floor, open through every storey
  const basin = G(F0, 9, 8, 18, 17, 'basin', null, { noLock: true, noLights: true, noItems: false });
  void basin;
  for (let k = 1; k <= 4; k++) F[k].void(9, 8, 18, 17);
  // ---- the pool tower east of it (slides land in its water)
  R(F0, 20, 9, 23, 14, 'kolam', 'KOLAM MENARA', { noLock: true, ds: ['E'] });
  for (let k = 1; k <= 4; k++) F[k].void(20, 9, 23, 14);

  // ======================= GROUND FLOOR (k 0) =======================
  F0.hall(3, 2, 3, 23);                        // west spine
  F0.hall(1, 3, 2, 3);                         // to the way out
  F0.hall(4, 5, 10, 6); F0.hall(11, 6, 17, 6); // north corridor, narrowing ...
  F0.hall(18, 5, 24, 5); F0.hall(18, 7, 24, 7); F0.hall(18, 6, 18, 6); // ... and splitting round the cubicles
  F0.hall(24, 6, 24, 23);                      // east spine
  F0.hall(4, 18, 23, 18);                      // south corridor, its west half under water
  flood(F0, 4, 18, 12, 18);
  flood(F0, 6, 17, 6, 17); // the foot of the stairs runs down into it
  // drain tunnel from the west spine into the basin
  tunnel(F0, 4, 12, 8, 12);
  F0.arch(4, 12, 'W'); portal(F0, 8, 12, 'E');
  // rooms
  R(F0, 4, 1, 8, 4, 'office', 'KANTOR', { ds: ['S'] });
  R(F0, 9, 1, 13, 4, 'changing', 'GANTI PRIA', { ds: ['S'] });
  R(F0, 14, 1, 17, 5, 'changing', 'GANTI WANITA', { ds: ['S'] });
  R(F0, 18, 1, 23, 3, 'storage', 'GUDANG KLORIN', { ds: ['S'] });
  F0.hall(20, 4, 20, 4);
  // a row of identical shower cubicles between the two branches
  for (let x = 19; x <= 23; x++) R(F0, x, 6, x, 6, 'cubicle', 'BILAS 6', { ds: [x % 2 ? 'N' : 'S'], noLock: true });
  R(F0, 4, 7, 8, 11, 'storage', 'RUANG POMPA', { ds: ['W'] });
  R(F0, 4, 13, 5, 17, 'restroom', 'TOILET', { ds: ['W'] });
  R(F0, 7, 13, 8, 17, 'storage', 'GUDANG', { ds: ['S'] });
  R(F0, 9, 19, 19, 24, 'pilar', 'AULA PILAR', { noLock: true, ds: ['N'] });
  R(F0, 4, 19, 8, 23, 'jaga', 'POS PENGAWAS', { ds: ['N'] });
  const mz0 = R(F0, 20, 19, 23, 24, 'labirin', 'RUANG GANTI', { noLock: true, ds: ['E'] });
  carveMaze(F0, mz0, rng);
  const ln0 = G(F0, 25, 6, 26, 23, 'lanes', 'LINTASAN 50 M', { noLock: true }); openUp(F0, ln0, F0.door(ln0, 25, 6, 'W'));
  R(F0, 19, 8, 19, 17, 'storage', 'GUDANG PELAMPUNG', { ds: ['E'] });
  F0.hall(20, 8, 23, 8); F0.hall(20, 15, 23, 17);
  F0.prop('pool_steps', 22.5 * CELL, 15 * CELL + wallOff + 0.53, 0, [2.4, 1.05, 0.6]);  // steps up into the wall

  // ======================= FIRST FLOOR (k 1): the deck ===============
  const ring = (f, x0 = 8, z0 = 7, x1 = 19, z1 = 18) => { f.hall(x0, z0, x1, z0); f.hall(x0, z1, x1, z1); f.hall(x0, z0, x0, z1); f.hall(x1, z0, x1, z1); };
  ring(F1);
  // open stairs out of the basin onto the deck, two corners
  const tile = { mat: 'pool_floor', open: true };
  b.stair(0, 9, 15, 'S', 3, tile);
  b.stair(0, 18, 10, 'N', 3, tile);
  // the stairs that come up out of the flooded corridor
  b.stair(0, 6, 17, 'N', 3, { mat: 'pool_floor' });
  F1.hall(6, 14, 7, 14);
  // up to floor 3
  b.stair(1, 13, 6, 'N', 2, { mat: 'pool_floor' });
  F1.hall(2, 6, 12, 6); F1.hall(14, 6, 19, 6);
  R(F1, 1, 1, 7, 5, 'shower', 'RUANG BILAS', { noLock: true, ds: ['S'] });
  R(F1, 9, 1, 12, 5, 'office', 'PELATIH', { ds: ['S'] });
  R(F1, 14, 1, 19, 5, 'jaga', 'POS PENGAWAS', { ds: ['S'] });
  R(F1, 20, 1, 26, 7, 'kolam', 'KOLAM LATIHAN', { noLock: true, ds: ['W'] });
  R(F1, 2, 7, 7, 12, 'restroom', 'TOILET', { ds: ['E'] });
  // five identical pool rooms in a row, one door in and one out
  F1.hall(1, 18, 7, 18); F1.hall(19, 18, 26, 18);
  const reps = [9, 11, 13, 15, 17].map((x) => G(F1, x, 19, x + 1, 21, 'repeat', 'KOLAM 7', { noLock: true }));
  openUp(F1, reps[0], F1.door(reps[0], 9, 19, 'N')); openUp(F1, reps[4], F1.door(reps[4], 18, 19, 'N'));
  for (let i = 0; i < 4; i++) F1.arch(reps[i].x1, 20, 'E');
  R(F1, 9, 22, 18, 24, 'pilar', 'RUANG TUNGGU', { noLock: true, ds: ['W'], dark: true });
  F1.hall(8, 19, 8, 24);
  const mz1 = R(F1, 1, 19, 7, 24, 'labirin', 'RUANG GANTI', { noLock: true, ds: ['N'] });
  carveMaze(F1, mz1, rng);
  R(F1, 20, 15, 23, 17, 'storage', 'GUDANG', { ds: ['S'] });
  R(F1, 24, 8, 26, 17, 'changing', 'GANTI', { ds: ['S'] });
  R(F1, 20, 19, 26, 24, 'kolam', 'KOLAM AIR HANGAT', { noLock: true, ds: ['N'] });
  F1.hall(20, 8, 23, 8);

  // ======================= SECOND FLOOR (k 2) ========================
  F2.hall(8, 7, 25, 7); F2.hall(8, 7, 8, 24); F2.hall(19, 7, 19, 24);
  F2.hall(9, 12, 18, 12);                                    // bridge across the atrium
  F2.hall(10, 4, 16, 4); F2.hall(16, 5, 16, 6);              // from the stairs
  // terraced pools spilling onto the atrium
  const t1 = G(F2, 9, 18, 13, 21, 'terrace', 'KOLAM TERAS', { noLock: true });
  const t2 = G(F2, 14, 18, 18, 21, 'terrace', 'KOLAM TERAS', { noLock: true });
  openUp(F2, t1, F2.door(t1, 9, 20, 'W')); openUp(F2, t2, F2.door(t2, 18, 20, 'E'));
  F2.arch(13, 19, 'E'); F2.arch(13, 20, 'E');
  R(F2, 9, 22, 18, 24, 'pilar', 'AULA PILAR II', { noLock: true, ds: ['W'], dark: true });
  // tiled tunnels behind tiny doors, and the west spine
  tunnel(F2, 4, 4, 9, 4); portal(F2, 9, 4, 'E'); F2.arch(4, 4, 'W');
  F2.hall(3, 2, 3, 4); F2.hall(3, 11, 3, 22);
  tunnel(F2, 3, 5, 3, 10); F2.arch(3, 5, 'N'); portal(F2, 3, 10, 'S');
  // the drained pool: its deck is the floor above
  const dry = G(F2, 4, 6, 7, 16, 'dry', 'KOLAM KERING', { noLock: true });
  portal(F2, 4, 13, 'W');
  void dry;
  F3.void(4, 6, 7, 16);
  b.stair(2, 5, 8, 'N', 3, tile);
  R(F2, 4, 17, 7, 22, 'changing', 'GANTI', { ds: ['E'] });
  R(F2, 1, 18, 2, 22, 'restroom', 'BILAS', { ds: ['E'] });
  R(F2, 9, 1, 15, 3, 'office', 'JURI', { ds: ['S'] });
  R(F2, 17, 1, 22, 6, 'restroom', 'TOILET', { ds: ['W'] });
  // east: stairs up beside the tower
  b.stair(2, 25, 8, 'S', 2, { mat: 'pool_floor' });
  F2.hall(24, 7, 24, 7);
  R(F2, 24, 10, 26, 17, 'kolam', 'KOLAM DALAM', { noLock: true, ds: ['W'] });
  F2.hall(20, 15, 23, 15);  F2.hall(23, 16, 23, 16);
  R(F2, 20, 16, 22, 24, 'storage', 'GUDANG HANDUK', { ds: ['W'] });
  R(F2, 23, 18, 26, 24, 'jaga', 'POS PENGAWAS', { ds: ['N'] });
  F2.hall(20, 8, 23, 8);
  F2.hall(23, 17, 23, 17);
  void F2;

  // ======================= THIRD FLOOR (k 3) =========================
  F3.hall(3, 5, 8, 5); F3.hall(8, 6, 8, 21); F3.hall(8, 7, 25, 7); F3.hall(19, 7, 19, 18); F3.hall(8, 18, 19, 18);
  F3.hall(14, 8, 14, 17);                                    // bridge the other way
  F3.hall(24, 10, 25, 19); F3.hall(20, 18, 23, 18);
  R(F3, 1, 1, 7, 4, 'office', 'JURI', { ds: ['S'] });
  R(F3, 9, 1, 18, 6, 'shower', 'AIR TERJUN', { noLock: true, ds: ['S'] });
  R(F3, 19, 1, 26, 6, 'jaga', 'MENARA PENGAWAS', { ds: ['S'] });
  R(F3, 9, 19, 20, 21, 'lanes', 'LINTASAN', { noLock: true, ds: ['W'] });
  const mz3 = R(F3, 1, 17, 7, 24, 'labirin', 'RUANG GANTI', { noLock: true, ds: ['E'] });
  carveMaze(F3, mz3, rng);
  R(F3, 1, 6, 2, 15, 'restroom', 'BILAS', { ds: ['N'] });
  F3.hall(1, 5, 2, 5);
  b.stair(3, 24, 20, 'S', 2, { mat: 'pool_floor' });
  R(F3, 20, 15, 23, 17, 'storage', 'GUDANG', { ds: ['S'] });
  R(F3, 21, 22, 26, 24, 'kolam', 'KOLAM GELAP', { noLock: true, dark: true, ds: ['N'] });
  F3.hall(21, 19, 23, 21);
  F3.hall(20, 8, 23, 8);

  // ======================= TOP FLOOR (k 4) ===========================
  ring(F4);
  F4.hall(8, 6, 27, 6);
  const start = R(F4, 9, 1, 13, 5, 'office', 'RUANG PENJAGA', { ds: ['S'] });
  const ln4 = G(F4, 14, 3, 26, 5, 'lanes', 'LINTASAN', { noLock: true }); openUp(F4, ln4, F4.door(ln4, 14, 5, 'S'));
  R(F4, 14, 1, 26, 2, 'storage', 'GUDANG', { ds: ['E'] });
  F4.hall(27, 1, 27, 6);
  R(F4, 1, 1, 7, 5, 'shower', 'RUANG BILAS', { noLock: true, ds: ['S'] });
  F4.hall(1, 6, 7, 6);
  R(F4, 4, 8, 7, 12, 'restroom', 'BILAS', { ds: ['E'] });
  R(F4, 4, 13, 7, 17, 'jaga', 'POS PENGAWAS', { ds: ['E'] });
  R(F4, 9, 19, 18, 23, 'kolam', 'KOLAM TERTINGGI', { noLock: true, ds: ['N'] });
  F4.hall(19, 19, 19, 22); F4.hall(20, 22, 25, 22);
  R(F4, 20, 19, 23, 21, 'changing', 'GANTI', { ds: ['W'] });
  R(F4, 24, 8, 26, 17, 'changing', 'GANTI', { ds: ['N'] });
  F4.hall(24, 7, 26, 7);
  const mz4 = R(F4, 1, 18, 7, 24, 'labirin', 'RUANG GANTI', { noLock: true, ds: ['E'] });
  F4.hall(8, 19, 8, 21);
  carveMaze(F4, mz4, rng);
  F4.hall(20, 8, 23, 8);

  // ---- slides into the basin pool and the tower
  b.slide(4, 8, 10, 'E', 0, [[30, 14.6, 30.5], ...helix(34.5, 30, 4.4, Math.PI, 2.3, 14.2, 2.0, 60), [37.5, 0.55, 34]], { color: 0xd8b13a });
  b.slide(3, 19, 15, 'W', 0, [...helix(50.5, 46.5, 4.2, 0, 1.6, 10.8, 1.8, 44), [46.5, 0.55, 44]], { color: 0x3f8fc9 });
  b.slide(4, 19, 12, 'E', 0, [[61.5, 14.8, 37.5], ...helix(66, 36, 3.6, Math.PI, 3.4, 14.2, 1.6, 80), [66, 0.55, 41]], { color: 0xc9473f });
  // diving boards out over the drops
  for (const [k, x, z, side] of [[4, 13, 18, 'N'], [3, 24, 13, 'W'], [2, 8, 15, 'E'], [1, 14, 7, 'S']]) {
    const [dx, dz] = SD[side], cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    F[k].prop('diving_board', cx + dx * 0.9, cz + dz * 0.9, Math.atan2(dx, dz), [0.8, 0.8, 1]);
  }
  // lights hung high under the atrium roof and in the tower
  for (const x of [11, 16.5]) for (const z of [10, 15.5]) b.tallLight(4, x * CELL, z * CELL, 4 * FH + 2.95, { fall: 0.012, reach2: 900, fixture: 'lamp' });
  b.tallLight(4, 22 * CELL, 12 * CELL, 4 * FH + 2.95, { fall: 0.016, reach2: 700, fixture: 'lamp' });
  b.tallLight(3, 5.5 * CELL, 11 * CELL, 3 * FH + 2.95, { fall: 0.03, reach2: 400, fixture: 'lamp', state: 'flicker' });
  for (const [f, r, ds] of pending) {
    const d = f.autoDoor(r, ds, rng);
    if (!d) { if (typeof process !== 'undefined') console.warn('pool: no door for', f.k, r.sign); continue; }
    if (OPEN_TYPES.has(r.type)) openUp(f, r, d);
  }
  b.start = { k: 4, room: start };
  b.exit = { k: 0, x: 1, z: 3, side: 'W' };
}
LAYOUTS.poolrooms = poolrooms;

// ---------------------------------------------------------------------------
// furnishing
// ---------------------------------------------------------------------------
const frameOf = (r, side) => roomFrame(r, side);
const cellsOf = (r, f) => { const out = []; for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (f.map.reg(x, z) === r.id) out.push([x, z]); return out; };
const spotAt = (r, x, z, y = 0.02) => r.spots.push([x, y, z]);
const floats = (f, rng, w, n) => {
  for (let i = 0; i < n; i++) {
    const x = rng.range(w.minX + 0.6, w.maxX - 0.6), z = rng.range(w.minZ + 0.6, w.maxZ - 0.6);
    f.prop(rng.chance(0.55) ? 'float_ring' : 'beach_ball', x, z, rng.range(0, 6.28), null, { y: POOL_Y + (rng.chance(0.5) ? 0.02 : 0.1) });
  }
};
// lane ropes along X (or Z) on every cell line strictly inside [a, b]
function laneRopes(f, alongX, lines, from, to) {
  for (const l of lines) for (let c = from; c < to - 0.01; c += 3) {
    const m = c + 1.5;
    if (alongX) f.prop('lane_rope_lo', m, l, 0, null, { y: POOL_Y }); else f.prop('lane_rope_lo', l, m, Math.PI / 2, null, { y: POOL_Y });
  }
}

// the dry basin with a full pool in the middle of it
FURNISH.basin = (r, f, rng, P) => {
  const w = { minX: 11 * CELL, maxX: 17 * CELL, minZ: 10 * CELL, maxZ: 16 * CELL };
  f.out.water.push(w);
  laneRopes(f, false, [13 * CELL, 15 * CELL], w.minZ, w.maxZ);
  floats(f, rng, w, 4);
  // ladders up the deep walls that lead nowhere but the deck railing
  for (const [x, z, side] of [[12, 8, 'N'], [15, 8, 'N'], [11, 17, 'S'], [16, 17, 'S'], [9, 10, 'W'], [18, 14, 'E']]) {
    const [dx, dz] = SD[side], cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    P('wall_ladder', cx + dx * (CELL / 2 - wallOff - 0.12), cz + dz * (CELL / 2 - wallOff - 0.12), yawFor(-dx, -dz), null);
  }
  // pool ladders hooked over the inner pool edge
  P('pool_ladder', w.minX, 12.5 * CELL, Math.PI / 2, null); P('pool_ladder', w.maxX, 13.5 * CELL, -Math.PI / 2, null);
  // drains and a lifeguard chair down on the dry floor, facing the wall
  for (const [x, z] of [[10, 9], [17, 16], [13.5, 8.6], [10, 13]]) P('drain_grate', x * CELL, z * CELL, 0, null);
  P('lifeguard_chair', 17.5 * CELL, 9.0 * CELL, yawFor(0, -1), [0.8, 1.1, 2]);
  P('tile_bench', 9.25 * CELL, 12.5 * CELL, Math.PI / 2, [1.8, 0.45, 0.5]);
  P('beach_ball', 10.8 * CELL, 15.6 * CELL, 1.2, null, { y: 0.2 });
  for (const [x, z] of [[10.5, 11.5], [17.5, 12.5], [12.2, 9.5], [15.5, 16.5], [10.5, 9.5]]) spotAt(r, x * CELL, z * CELL);
  // pool lamps set into the deep walls, and a glow under the water
  for (const [x, z] of [[11, 8.3], [16, 8.3], [11, 17.7], [16, 17.7], [9.3, 12.5], [18.7, 13.5]]) f.light(x * CELL, z * CELL, { y: 2.4, fixture: 'none', fall: 0.05, reach2: 260, state: rng.chance(0.2) ? 'flicker' : 'on' });
  for (const [x, z] of [[12.5, 12], [15.5, 14]]) f.light(x * CELL, z * CELL, { y: 0.2, fixture: 'none', fall: 0.06, reach2: 200 });
};

// a floor of tiled pillars standing in still water
FURNISH.pilar = (r, f, rng, P) => {
  const wet = r.k === 0;
  if (wet) flood(f, r.x0, r.z0, r.x1, r.z1);
  for (let z = r.z0 + 1; z <= r.z1; z++) for (let x = r.x0 + 1; x <= r.x1; x++) {
    if (rng.chance(0.06)) continue;
    P('tile_pillar', x * CELL, z * CELL, 0, [0.62, 0.62, 3]);
  }
  if (!wet) for (let i = 0; i < 3; i++) P('drain_grate', (r.x0 + rng.int(0, r.w - 1) + 0.5) * CELL, (r.z0 + rng.int(0, r.h - 1) + 0.5) * CELL, 0, null);
  if (wet) floats(f, rng, { minX: r.x0 * CELL, maxX: (r.x1 + 1) * CELL, minZ: r.z0 * CELL, maxZ: (r.z1 + 1) * CELL }, 3);
  // somewhere in the middle, one lifeguard chair facing a pillar
  const cx = r.x0 + Math.floor(r.w / 2), cz = r.z0 + Math.floor(r.h / 2);
  P('lifeguard_chair', cx * CELL + 0.75, cz * CELL + 0.75, yawFor(-1, -1), [0.8, 1.1, 2]);
  for (let i = 0; i < 6; i++) spotAt(r, (r.x0 + rng.int(0, r.w - 1) + rng.range(0.3, 0.7)) * CELL, (r.z0 + rng.int(0, r.h - 1) + rng.range(0.3, 0.7)) * CELL, 0.03);
};

// an ordinary pool with a tiled deck round it (light lane ropes, toys, a chair that faces the wall)
FURNISH.kolam = (r, f, rng, P) => {
  const w = { minX: r.x0 * CELL + 1.5, maxX: (r.x1 + 1) * CELL - 1.5, minZ: r.z0 * CELL + 1.5, maxZ: (r.z1 + 1) * CELL - 1.5 };
  f.out.water.push(w);
  const alongX = w.maxX - w.minX >= w.maxZ - w.minZ;
  if (alongX) { const ls = []; for (let z = r.z0 + 1; z <= r.z1; z += (r.h > 6 ? 3 : 1)) ls.push(z * CELL); laneRopes(f, true, ls, w.minX, w.maxX); }
  else { const ls = []; for (let x = r.x0 + 1; x <= r.x1; x += (r.w > 6 ? 3 : 1)) ls.push(x * CELL); laneRopes(f, false, ls, w.minZ, w.maxZ); }
  const midX = (w.minX + w.maxX) / 2, midZ = (w.minZ + w.maxZ) / 2;
  if (alongX) { P('pool_ladder', w.minX, midZ + 1.5, Math.PI / 2, null); P('pool_ladder', w.maxX, midZ - 1.5, -Math.PI / 2, null); }
  else { P('pool_ladder', midX + 1.5, w.minZ, 0, null); P('pool_ladder', midX - 1.5, w.maxZ, Math.PI, null); }
  floats(f, rng, w, 2);
  const corners = [[r.x0 * CELL + 0.75, r.z0 * CELL + 0.75, -1, 0], [(r.x1 + 1) * CELL - 0.75, (r.z1 + 1) * CELL - 0.75, 1, 0]];
  const [cx, cz, dx, dz] = rng.pick(corners);
  P('lifeguard_chair', cx, cz, yawFor(dx, dz), [0.8, 1.1, 2]);
  for (const [x, z] of [[r.x0 * CELL + 0.75, midZ], [(r.x1 + 1) * CELL - 0.75, midZ], [midX, r.z0 * CELL + 0.75], [midX, (r.z1 + 1) * CELL - 0.75]]) spotAt(r, x, z);
};

// lanes filling the whole room and running into the far wall
FURNISH.lanes = (r, f, rng, P) => {
  const alongX = r.w >= r.h;
  const d = r.doors[0];
  // the dry strip is at the door end
  let x0 = r.x0, x1 = r.x1, z0 = r.z0, z1 = r.z1;
  if (alongX) { if (d && d.x < r.cx) x0++; else x1--; } else { if (d && d.z < r.cz) z0++; else z1--; }
  flood(f, x0, z0, x1, z1, 0.08, false);
  const W0 = x0 * CELL + 0.08, W1 = (x1 + 1) * CELL - 0.08, Z0 = z0 * CELL + 0.08, Z1 = (z1 + 1) * CELL - 0.08;
  if (alongX) {
    const lines = []; for (let z = r.z0 + 1; z <= r.z1; z++) lines.push(z * CELL);
    if (r.h === 1) lines.push((r.z0 + 0.5) * CELL);
    laneRopes(f, true, lines, x0 * CELL, (x1 + 1) * CELL);
  } else {
    const lines = []; for (let x = r.x0 + 1; x <= r.x1; x++) lines.push(x * CELL);
    laneRopes(f, false, lines, z0 * CELL, (z1 + 1) * CELL);
  }
  // ladders and steps at the dry end, a chair watching the wall where the lanes vanish
  const dryAt = alongX ? (x0 > r.x0 ? 'W' : 'E') : (z0 > r.z0 ? 'N' : 'S');
  const fr = frameOf(r, dryAt);
  const yaw = yawFor(fr.n[0], fr.n[1]);
  for (let u = 1.5; u < fr.width; u += 3) {
    const [lx, lz] = fr.toWorld(u + 0.6, CELL);
    P('pool_ladder', lx, lz, yaw, null);
  }
  const [cx, cz] = fr.toWorld(fr.width - 0.6, 1.0);
  if (!sideHasDoorNear(r, fr, fr.width - 1.4, fr.width)) P('lifeguard_chair', cx, cz, yaw, [0.8, 1.1, 2]);
  const [bx, bz] = fr.toWorld(0.5, 0.6); P('tile_bench', bx, bz, yaw + Math.PI / 2, [1.8, 0.45, 0.5]);
  floats(f, rng, { minX: W0, maxX: W1, minZ: Z0, maxZ: Z1 }, Math.max(1, Math.round(r.w * r.h / 10)));
  for (let i = 0; i < 4; i++) spotAt(r, rng.range(W0 + 0.5, W1 - 0.5), rng.range(Z0 + 0.5, Z1 - 0.5), 0.03);
  const [sx, sz] = fr.toWorld(fr.width / 2, 1.5); spotAt(r, sx, sz);
};

// terraced pool open to the atrium on one side, water right up to the parapet
FURNISH.terrace = (r, f, rng, P) => {
  flood(f, r.x0, r.z0, r.x1, r.z1 - 1, 0.04, false);
  for (let x = r.x0 + 1; x <= r.x1; x++) for (let z = r.z0; z < r.z1; z++) P('lane_rope_lo', x * CELL, (z + 0.5) * CELL, Math.PI / 2, null, { y: POOL_Y });
  floats(f, rng, { minX: r.x0 * CELL, maxX: (r.x1 + 1) * CELL, minZ: r.z0 * CELL, maxZ: r.z1 * CELL }, 2);
  for (let x = r.x0; x <= r.x1; x += 2) P('tile_bench', (x + 0.5) * CELL, (r.z1 + 1) * CELL - wallOff - 0.3, 0, [1.8, 0.45, 0.5]);
  for (let x = r.x0; x <= r.x1; x++) spotAt(r, (x + 0.5) * CELL, r.z1 * CELL + 1.5);
};

// tiled tunnel: a low vault through every cell, dark but for one lamp
FURNISH.tunnel = (r, f, rng, P) => {
  const alongX = r.w >= r.h;
  const cells = cellsOf(r, f);
  cells.forEach(([x, z], i) => {
    const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    P('tile_tunnel', cx, cz, alongX ? 0 : Math.PI / 2, null);
    for (const s of [-1, 1]) {
      f.out.colliders.push(alongX
        ? { minX: cx - 1.5, maxX: cx + 1.5, minZ: cz + s * 1.15 - 0.25, maxZ: cz + s * 1.15 + 0.25, h: 2.4 }
        : { minX: cx + s * 1.15 - 0.25, maxX: cx + s * 1.15 + 0.25, minZ: cz - 1.5, maxZ: cz + 1.5, h: 2.4 });
    }
    if (i % 3 === 1) f.light(cx, cz, { y: 2.2, rot: alongX ? Math.PI / 2 : 0, state: rng.chance(0.4) ? 'flicker' : rng.chance(0.3) ? 'off' : 'on', fall: 0.35, reach2: 40 });
  });
};

// the drained pool on the second floor: steps, ladders, a dead lane rope
FURNISH.dry = (r, f, rng, P) => {
  for (const [x, z, side] of [[4, 9, 'W'], [7, 11, 'E'], [6, 16, 'S'], [7, 6, 'N']]) {
    const [dx, dz] = SD[side], cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    P('wall_ladder', cx + dx * (CELL / 2 - wallOff - 0.12), cz + dz * (CELL / 2 - wallOff - 0.12), yawFor(-dx, -dz), null);
  }
  P('pool_steps', 5.5 * CELL, 17 * CELL - wallOff - 0.53, Math.PI, [2.4, 1.05, 0.6]);
  for (let z = 10; z <= 15; z++) P('lane_rope_lo', 6 * CELL + Math.sin(z) * 0.3, (z + 0.5) * CELL, Math.PI / 2 + Math.sin(z * 2.3) * 0.12, null, { y: 0.05 });
  for (const [x, z] of [[5.5, 12.5], [6.5, 14.5], [4.5, 15.5]]) P('drain_grate', x * CELL, z * CELL, 0, null);
  P('beach_ball', 4.6 * CELL, 10.4 * CELL, 0.3, null, { y: 0.2 });
  P('lifeguard_chair', 6.9 * CELL, 13.2 * CELL, yawFor(1, 0), [0.8, 1.1, 2]);
  for (const [x, z] of [[4.5, 11.5], [6.5, 13.6], [5.5, 15.5], [4.4, 14.5]]) spotAt(r, x * CELL, z * CELL);
};

// shower hall: rows of shower posts in shallow water, a waterfall on the back wall
FURNISH.shower = (r, f, rng, P) => {
  flood(f, r.x0, r.z0, r.x1, r.z1, 0.05);
  const ds = new Set(r.doors.map((d) => (d.inX === 1 ? 'W' : d.inX === -1 ? 'E' : d.inZ === 1 ? 'N' : 'S')));
  const back = ['N', 'S', 'W', 'E'].find((s) => OPPS[s] && ds.has(OPPS[s]) && !ds.has(s)) || 'N';
  const fr = frameOf(r, back);
  const yaw = yawFor(fr.n[0], fr.n[1]);
  for (let u = 1.5; u + 1.5 <= fr.width + 0.01; u += 3) {
    const [x, z] = fr.toWorld(u, wallOff);
    P('water_curtain', x, z, yaw, null);
    const [cx, cz] = fr.toWorld(u, 0.5); f.out.colliders.push(aabb(cx, cz, 3, 0.6, yaw));
  }
  for (let v = 3; v < fr.depth - 1; v += 3) for (let u = (v / 3) % 2 ? 3 : 6; u < fr.width - 1; u += 6) {
    const [x, z] = fr.toWorld(u, v + 0.0);
    P('shower_column', x, z, 0, [0.4, 0.4, 2.3]);
    P('drain_grate', ...fr.toWorld(u + 1.5, v + 1.5), 0, null);
  }
  for (let i = 0; i < 4; i++) { const [x, z] = fr.toWorld(rng.range(1, fr.width - 1), rng.range(1.5, fr.depth - 0.8)); spotAt(r, x, z, 0.03); }
};

// lifeguard post: a row of tall chairs, every one turned to face the wall
FURNISH.jaga = (r, f, rng, P) => {
  const ds = new Set(r.doors.map((d) => (d.inX === 1 ? 'W' : d.inX === -1 ? 'E' : d.inZ === 1 ? 'N' : 'S')));
  const back = ['N', 'S', 'W', 'E'].find((s) => !ds.has(s) && ds.has(OPPS[s])) || ['N', 'S', 'W', 'E'].find((s) => !ds.has(s));
  const fr = frameOf(r, back);
  const toWall = yawFor(-fr.n[0], -fr.n[1]);
  // on the cell lines between the aisles, all turned the same way
  for (let v = 1.0; v < Math.min(fr.depth - 1.0, 8); v += 6) for (let u = 3; u < fr.width - 0.5; u += 3) {
    const [x, z] = fr.toWorld(u, v);
    P('lifeguard_chair', x, z, toWall, [0.8, 1.1, 2]);
    if (rng.chance(0.25)) spotAt(r, x, z, 1.57);
  }
  const [lx, lz] = fr.toWorld(fr.width - 0.6, fr.depth - 0.4);
  if (!sideHasDoorNear(r, roomFrame(r, OPPS[back]), fr.width - 1.3, fr.width)) {
    f.out.lockers.push({ kind: 'locker', x: lx, z: lz, rot: yawFor(-fr.n[0], -fr.n[1]) });
    f.out.colliders.push(aabb(lx, lz, 0.62, 0.58, 0));
  }
  const [sx, sz] = fr.toWorld(fr.width / 2, fr.depth - 1.5); spotAt(r, sx, sz);
};

// one of five identical rooms: the same pool, chair, bench, ring
FURNISH.repeat = (r, f, rng, P) => {
  const x0 = r.x0 * CELL, z0 = r.z0 * CELL;
  const w = { minX: x0 + 1.2, maxX: x0 + 4.8, minZ: z0 + 3.3, maxZ: z0 + 7.8 };
  f.out.water.push(w);
  P('lane_rope_lo', x0 + 3, z0 + 5.55, Math.PI / 2, null, { y: POOL_Y });
  P('float_ring', x0 + 2.2, z0 + 6.6, 0.7, null, { y: POOL_Y + 0.02 });
  P('lifeguard_chair', x0 + 5.3, z0 + 8.2, 0, [0.8, 1.1, 2]);
  P('tile_bench', x0 + 3, z0 + 0.4, 0, [1.8, 0.45, 0.5]);
  P('pool_ladder', x0 + 2.4, w.minZ, 0, null);
  r.spots.push([x0 + 0.8, 0.02, z0 + 5.5]);
};

// changing-room maze: lockers along the walls of the carved passages
FURNISH.labirin = (r, f, rng, P) => {
  const m = f.map;
  let n = 0;
  for (const [x, z] of cellsOf(r, f)) {
    const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    const walls = DIRS.filter((d) => m.edge(x, z, d) === EDGE.WALL);
    if (!walls.length) continue;
    const d = rng.pick(walls), rot = yawFor(-d.dx, -d.dz), along = [d.dz, d.dx];
    const bx = cx + d.dx * (CELL / 2 - wallOff - 0.3), bz = cz + d.dz * (CELL / 2 - wallOff - 0.3);
    const roll = n++ % 3;
    if (roll === 0) {        // a short run of lockers you can hide in
      for (const o of [-0.66, 0, 0.66]) {
        const lx = bx + along[0] * o, lz = bz + along[1] * o;
        f.out.lockers.push({ kind: 'locker', x: lx, z: lz, rot });
        f.out.colliders.push(aabb(lx, lz, 0.62, 0.58, rot));
      }
    } else if (roll === 1) P('tile_bench', cx + d.dx * (CELL / 2 - wallOff - 0.25), cz + d.dz * (CELL / 2 - wallOff - 0.25), rot, [1.8, 0.45, 0.5]);
    else if (walls.length >= 3) P('lifeguard_chair', cx + d.dx * 0.6, cz + d.dz * 0.6, yawFor(d.dx, d.dz), [0.8, 1.1, 2]);
    if (rng.chance(0.35)) spotAt(r, cx + rng.range(-0.5, 0.5), cz + rng.range(-0.5, 0.5));
    if (rng.chance(0.4)) f.light(cx, cz, { state: rng.chance(0.25) ? 'flicker' : 'on' });
  }
  if (!r.spots.length) spotAt(r, r.cx, r.cz);
};

// a single shower cubicle (they are all the same)
FURNISH.cubicle = (r, f, rng, P) => {
  const cx = (r.x0 + 0.5) * CELL, cz = (r.z0 + 0.5) * CELL;
  P('shower_column', cx, cz, 0, [0.4, 0.4, 2.3]);
  P('drain_grate', cx + 0.9, cz + 0.9, 0, null);
  r.spots.push([cx - 0.9, 0.03, cz - 0.9]);
};

// ---------------------------------------------------------------------------
// level dressing: chairs that face the walls at dead ends, drains, benches,
// toys drifting in the flooded halls
// ---------------------------------------------------------------------------
DRESS.poolrooms = (f, rng, reserved) => {
  const m = f.map, W = m.W, H = m.H;
  for (const sg of f.out.poolSigns || []) f.out.signs.push(sg);
  const wet = (x, z) => f.out.water.some((w) => x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (m.reg(x, z) !== 0) continue;
    const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    const open = DIRS.filter((d) => m.edge(x, z, d) === EDGE.OPEN && m.reg(x + d.dx, z + d.dz) >= 0);
    const walls = DIRS.filter((d) => m.edge(x, z, d) === EDGE.WALL && !reserved.has(m.edgeKey(x, z, d)));
    // dead end: a lifeguard chair looking at the wall
    if (open.length === 1 && walls.length === 3) {
      const d = { dx: -open[0].dx, dz: -open[0].dz };
      P0(f, 'lifeguard_chair', cx + d.dx * 0.55, cz + d.dz * 0.55, yawFor(d.dx, d.dz), [0.8, 1.1, 2]);
      continue;
    }
    if (wet(cx, cz)) { if (rng.chance(0.07)) f.prop('float_ring', cx + rng.range(-0.8, 0.8), cz + rng.range(-0.8, 0.8), rng.range(0, 6), null, { y: POOL_Y + 0.05 }); continue; }
  }
};
const P0 = (f, type, x, z, rot, size, o) => f.prop(type, x, z, rot, size, o);
