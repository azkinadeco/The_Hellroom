// Hand-written building layouts. Each gets (building, rng, def) and carves its
// floors; building.js does edges, furnishing, lights and items afterwards.
import { CELL } from '../config.js';

// ---------------------------------------------------------------------------
// LEVEL 0 — a real two-storey school round an open-air courtyard (lapangan).
// Ring corridors face the yard through a colonnade on the ground floor and a
// balcony upstairs; classrooms, offices, toilets, canteen, library, UKS and the
// hall sit round the outside. Two stairwells link the floors.
//
//   x 2..5 west wing · 6 corridor · 7..18 yard · 19 corridor · 20..23 east wing
//   z 1..4 north wing · 5 corridor · 6..15 yard · 16 corridor · 17..20 south
// ---------------------------------------------------------------------------
function school(b, rng) {
  const [F0, F1] = b.F;
  const kelas = (f, x0, z0, x1, z1, name) => { const r = f.room(x0, z0, x1, z1, 'kelas', { sign: name }); f.autoDoor(r, null, rng); return r; };
  const named = (f, x0, z0, x1, z1, type, sign, o = {}) => { const r = f.room(x0, z0, x1, z1, type, { sign, ...o }); f.autoDoor(r, null, rng); return r; };
  for (const f of [F0, F1]) { f.hall(6, 5, 19, 5); f.hall(6, 16, 19, 16); f.hall(6, 5, 6, 16); f.hall(19, 5, 19, 16); }

  // courtyard: open to the night sky, colonnade on every side
  F0.room(7, 6, 18, 15, 'lapangan', { noLock: true, noLights: true, mat: { floor: 'paving' } });
  for (const s of ['N', 'S', 'W', 'E']) F0.edges(7, 6, 18, 15, s, (x, z, side) => F0.arch(x, z, side));
  F1.void(7, 6, 18, 15); F1.sky(7, 6, 18, 15);

  // north wing + stairwell (12) + store under the stairs (13)
  kelas(F0, 6, 1, 8, 4, 'KELAS 1-A'); kelas(F0, 9, 1, 11, 4, 'KELAS 1-B');
  kelas(F0, 14, 1, 16, 4, 'KELAS 1-C'); named(F0, 17, 1, 19, 4, 'library', 'PERPUSTAKAAN');
  named(F0, 13, 1, 13, 4, 'storage', 'GUDANG');
  b.stair(0, 12, 4, 'N', 2, { mat: 'floor_tile' });
  F1.hall(12, 2, 13, 2); F1.hall(13, 3, 13, 4);
  kelas(F1, 6, 1, 8, 4, 'KELAS 2-A'); kelas(F1, 9, 1, 11, 4, 'KELAS 2-B');
  kelas(F1, 14, 1, 16, 4, 'KELAS 2-C'); named(F1, 17, 1, 19, 4, 'lab', 'LAB BIOLOGI');

  // south wing, mirrored stairwell (13) and toilets (12)
  named(F0, 6, 17, 8, 20, 'guru', 'RUANG GURU'); kelas(F0, 9, 17, 11, 20, 'KELAS 1-D');
  kelas(F0, 14, 17, 16, 20, 'KELAS 1-E'); named(F0, 17, 17, 19, 20, 'kantin', 'KANTIN', { noLock: true });
  named(F0, 12, 17, 12, 20, 'restroom', 'TOILET');
  b.stair(0, 13, 17, 'S', 2, { mat: 'floor_tile' });
  F1.hall(12, 19, 13, 19); F1.hall(12, 17, 12, 18);
  kelas(F1, 6, 17, 8, 20, 'KELAS 3-A'); kelas(F1, 9, 17, 11, 20, 'KELAS 3-B');
  kelas(F1, 14, 17, 16, 20, 'KELAS 3-C'); kelas(F1, 17, 17, 19, 20, 'KELAS 3-D');

  // west wing: entrance lobby with the main doors
  kelas(F0, 2, 5, 5, 7, 'KELAS 1-F'); named(F0, 2, 8, 5, 9, 'restroom', 'TOILET');
  F0.hall(2, 10, 5, 11);
  named(F0, 2, 12, 5, 13, 'uks', 'UKS'); kelas(F0, 2, 14, 5, 16, 'KELAS 1-G');
  kelas(F1, 2, 5, 5, 7, 'KELAS 2-D'); named(F1, 2, 8, 5, 9, 'restroom', 'TOILET');
  named(F1, 2, 10, 5, 11, 'kepsek', 'KEPALA SEKOLAH'); named(F1, 2, 12, 5, 13, 'office', 'TATA USAHA');
  kelas(F1, 2, 14, 5, 16, 'KELAS 2-E');

  // east wing: the assembly hall below, classrooms above
  const aula = F0.room(20, 5, 23, 16, 'gym', { sign: 'AULA' });
  F0.door(aula, 20, 7, 'W'); F0.door(aula, 20, 14, 'W');
  kelas(F1, 20, 5, 23, 7, 'KELAS 2-F'); const start = kelas(F1, 20, 8, 23, 10, 'KELAS 2-G');
  kelas(F1, 20, 11, 23, 13, 'KELAS 2-H'); kelas(F1, 20, 14, 23, 16, 'KELAS 2-I');

  b.start = { k: 1, room: start };
  b.exit = { k: 0, x: 2, z: 10, side: 'W' };
}

export const LAYOUTS = { school };
export { CELL };

// ---------------------------------------------------------------------------
// LEVEL 2 — Rumah Sakit: three floors along a central spine corridor, a lift
// that serves every floor, two stairwells that do NOT line up (west links
// 1-2, east links 2-3), and in the south wing a forest that grows through
// all three storeys under an open night sky, with balconies over it and a
// steel stair that goes down into the trees.
//   spine corridor z 9..10 · north wing z 4..8 · south wing z 11..18
// ---------------------------------------------------------------------------
function hospital(b, rng) {
  const [F0, F1, F2] = b.F;
  const R = (f, x0, z0, x1, z1, type, sign, o = {}) => { const r = f.room(x0, z0, x1, z1, type, { sign, ...o }); f.autoDoor(r, null, rng); return r; };
  for (const f of b.F) f.hall(6, 9, 26, 10);
  // ---- ground floor
  F0.hall(1, 7, 5, 12);                                        // lobby + main doors
  R(F0, 6, 4, 8, 8, 'igd', 'IGD');
  R(F0, 10, 4, 10, 8, 'storage', 'GUDANG LINEN');
  R(F0, 11, 4, 13, 8, 'ward', 'BANGSAL A');
  R(F0, 15, 4, 18, 8, 'radiology', 'RADIOLOGI');
  R(F0, 19, 4, 22, 8, 'pharmacy', 'APOTEK');
  R(F0, 23, 4, 26, 8, 'ward', 'BANGSAL B');
  R(F0, 6, 11, 9, 15, 'ward', 'BANGSAL C');
  R(F0, 10, 11, 13, 15, 'morgue', 'KAMAR JENAZAH');
  R(F0, 14, 11, 14, 13, 'restroom', 'TOILET');
  const forest = F0.room(15, 11, 25, 18, 'forest', { sign: 'BANGSAL TAMAN', mat: { floor: 'forest_ground', wall: 'forest_wall' }, noLights: true, noLock: true });
  F0.door(forest, 16, 11, 'N');
  R(F0, 26, 11, 26, 14, 'storage', 'GUDANG');
  b.stair(0, 9, 8, 'N', 2, { mat: 'hosp_floor' });                 // west stairs, 1 -> 2
  // ---- first floor
  F1.hall(2, 9, 5, 10);
  R(F1, 2, 4, 5, 8, 'ward', 'BANGSAL D'); R(F1, 6, 4, 8, 8, 'ward', 'BANGSAL E');
  F1.hall(9, 6, 10, 6); F1.hall(10, 7, 10, 8);
  R(F1, 11, 4, 13, 8, 'surgery', 'RUANG OPERASI');
  R(F1, 15, 4, 18, 8, 'ward', 'BANGSAL F'); R(F1, 19, 4, 21, 8, 'office', 'RUANG DOKTER');
  R(F1, 23, 5, 23, 8, 'storage', 'GUDANG'); R(F1, 24, 4, 26, 8, 'ward', 'BANGSAL G');
  R(F1, 2, 11, 5, 15, 'ward', 'BANGSAL H'); R(F1, 6, 11, 9, 15, 'icu', 'ICU'); R(F1, 10, 11, 13, 15, 'ward', 'BANGSAL I');
  R(F1, 14, 11, 14, 13, 'restroom', 'TOILET');
  F1.hall(15, 11, 25, 11); F1.void(15, 12, 25, 18);              // balcony over the trees
  b.stair(1, 22, 8, 'N', 2, { mat: 'hosp_floor' });                // east stairs, 2 -> 3
  b.stair(0, 20, 13, 'N', 2, { open: true, mat: 'hosp_floor' });   // steel stair down into the forest
  // ---- second floor
  R(F2, 6, 4, 8, 8, 'ward', 'BANGSAL J');
  const start = R(F2, 9, 4, 13, 8, 'icu', 'ICU 2');
  R(F2, 15, 4, 18, 8, 'ward', 'BANGSAL K'); R(F2, 19, 4, 21, 8, 'ward', 'BANGSAL L');
  F2.hall(22, 6, 23, 6); F2.hall(23, 7, 23, 8);
  R(F2, 24, 4, 26, 8, 'office', 'KEPALA RUANGAN');
  R(F2, 6, 11, 9, 15, 'ward', 'BANGSAL M'); R(F2, 10, 11, 13, 15, 'surgery', 'RUANG OPERASI 2');
  R(F2, 14, 11, 14, 13, 'restroom', 'TOILET');
  F2.hall(15, 11, 25, 11); F2.void(15, 12, 25, 18); F2.sky(15, 12, 25, 18);
  b.lift(14, 8, 'S', [0, 1, 2]);
  // the forest is lit by a cold light from somewhere far above
  for (const [x, z] of [[17.5, 14.5], [23.5, 16.5], [19.5, 17.5]]) b.tallLight(0, x * 3, z * 3, 9.6, { fall: 0.035, reach2: 300, fixture: 'none', state: rng.chance(0.3) ? 'flicker' : 'on' });
  b.start = { k: 2, room: start };
  b.exit = { k: 0, x: 1, z: 9, side: 'W' };
}

LAYOUTS.hospital = hospital;

// ---------------------------------------------------------------------------
// LEVEL 4 — Kolam Renang: five storeys of white tile round one enormous pool
// hall (18 m high). Ring balconies on every floor, bridges that cross the
// void at two different heights, a pool tower in the east wing, pools and
// flooded rooms on the upper floors, and water slides from the balconies
// down into the water. The four stairwells never line up.
//   hall void x 6..19, z 6..17 · ring x 5 / 20, z 5 / 18 · wings outside
// ---------------------------------------------------------------------------
function helix(cx, cz, r, a0, turns, y0, y1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, y0 + (y1 - y0) * t, cz + Math.sin(a) * r]);
  }
  return pts;
}
function poolrooms(b, rng) {
  const F = b.F;
  const R = (f, x0, z0, x1, z1, type, sign, o = {}) => { const r = f.room(x0, z0, x1, z1, type, { sign, ...o }); f.autoDoor(r, null, rng); return r; };
  const flood = (f, x0, z0, x1, z1) => f.out.water.push({ minX: x0 * CELL + 0.02, maxX: (x1 + 1) * CELL - 0.02, minZ: z0 * CELL + 0.02, maxZ: (z1 + 1) * CELL - 0.02 });
  for (const f of F) { f.hall(5, 5, 20, 5); f.hall(5, 18, 20, 18); f.hall(5, 5, 5, 18); f.hall(20, 5, 20, 18); }
  // ---- the hall: pool on the ground floor, open space above it
  const hall = F[0].room(6, 6, 19, 17, 'pool', { sign: null, noLock: true, noLights: true });
  for (const s of ['N', 'S', 'W', 'E']) F[0].edges(6, 6, 19, 17, s, (x, z, side) => F[0].arch(x, z, side));
  void hall;
  for (let k = 1; k <= 4; k++) F[k].void(6, 6, 19, 17);
  F[2].hall(6, 8, 19, 8);                         // bridge across, floor 3
  F[3].hall(16, 6, 16, 17);                       // bridge the other way, floor 4
  // ---- the pool tower (east wing), four storeys of open space
  R(F[0], 21, 12, 24, 19, 'pool', 'KOLAM MENARA', { noLock: true });
  for (let k = 1; k <= 3; k++) F[k].void(21, 12, 24, 19);
  F[3].hall(21, 12, 24, 12);
  // ---- floor 1 (ground)
  R(F[0], 5, 1, 7, 4, 'storage', 'RUANG POMPA'); R(F[0], 9, 1, 13, 4, 'office', 'KANTOR');
  R(F[0], 14, 1, 20, 4, 'changing', 'GANTI PRIA');
  R(F[0], 1, 5, 4, 9, 'changing', 'GANTI WANITA'); R(F[0], 1, 10, 4, 12, 'restroom', 'BILAS');
  F[0].hall(1, 13, 4, 16); R(F[0], 1, 17, 4, 18, 'storage', 'GUDANG');
  R(F[0], 5, 19, 10, 22, 'flooded', 'KOLAM ANAK'); flood(F[0], 5, 19, 10, 22);
  R(F[0], 11, 19, 15, 22, 'restroom', 'TOILET'); R(F[0], 16, 19, 20, 22, 'changing', 'LOKER');
  R(F[0], 21, 5, 24, 11, 'changing', 'LOKER STAF');
  b.stair(0, 8, 4, 'N', 2, { mat: 'pool_floor' });
  // ---- floor 2
  R(F[1], 5, 1, 7, 4, 'changing', 'GANTI'); F[1].hall(8, 2, 9, 2); F[1].hall(9, 3, 9, 4);
  R(F[1], 10, 1, 13, 4, 'office', 'PELATIH'); R(F[1], 14, 1, 20, 4, 'pool', 'KOLAM LATIHAN', { noLock: true });
  R(F[1], 1, 5, 4, 8, 'restroom', 'BILAS'); F[1].hall(1, 9, 4, 14); flood(F[1], 1, 9, 4, 14);
  R(F[1], 1, 15, 4, 18, 'storage', 'GUDANG');
  R(F[1], 5, 19, 10, 22, 'changing', 'GANTI'); R(F[1], 11, 19, 14, 22, 'office', 'P3K');
  R(F[1], 17, 19, 20, 22, 'restroom', 'TOILET'); R(F[1], 21, 5, 24, 11, 'changing', 'LOKER');
  b.stair(1, 16, 19, 'S', 2, { mat: 'pool_floor' });
  // ---- floor 3
  R(F[2], 5, 1, 9, 4, 'pool', 'KOLAM AIR HANGAT', { noLock: true }); R(F[2], 10, 1, 13, 4, 'office', 'KANTOR');
  R(F[2], 14, 1, 20, 4, 'changing', 'GANTI');
  F[2].hall(15, 19, 15, 21); F[2].hall(16, 21, 16, 21);
  R(F[2], 5, 19, 9, 22, 'restroom', 'TOILET'); R(F[2], 10, 19, 14, 22, 'flooded', 'RUANG RENDAM'); flood(F[2], 10, 19, 14, 22);
  R(F[2], 17, 19, 20, 22, 'storage', 'GUDANG');
  R(F[2], 1, 5, 4, 12, 'changing', 'GANTI'); R(F[2], 1, 13, 4, 13, 'storage', 'GUDANG HANDUK'); R(F[2], 1, 15, 4, 18, 'office', 'JURI');
  R(F[2], 21, 5, 24, 11, 'pool', 'KOLAM DALAM', { noLock: true });
  b.stair(2, 4, 14, 'W', 2, { mat: 'pool_floor' });
  // ---- floor 4
  R(F[3], 5, 1, 12, 4, 'restroom', 'BILAS'); R(F[3], 13, 1, 20, 4, 'pool', 'KOLAM GELAP', { noLock: true, dark: true });
  R(F[3], 1, 5, 4, 12, 'storage', 'GUDANG'); F[3].hall(2, 13, 4, 13); F[3].hall(2, 14, 2, 14);
  R(F[3], 1, 15, 4, 18, 'changing', 'GANTI');
  R(F[3], 5, 19, 12, 22, 'office', 'TRIBUN'); R(F[3], 13, 19, 20, 22, 'changing', 'GANTI');
  R(F[3], 21, 5, 24, 6, 'storage', 'GUDANG'); R(F[3], 21, 9, 24, 11, 'restroom', 'TOILET');
  b.stair(3, 21, 7, 'E', 2, { mat: 'pool_floor' });
  // ---- floor 5 (top): the warden's room you wake up in
  const start = R(F[4], 5, 1, 12, 4, 'office', 'RUANG PENJAGA'); R(F[4], 13, 1, 20, 4, 'changing', 'GANTI');
  R(F[4], 1, 5, 4, 11, 'restroom', 'BILAS'); R(F[4], 1, 12, 4, 18, 'storage', 'GUDANG');
  R(F[4], 5, 19, 12, 22, 'pool', 'KOLAM TERTINGGI', { noLock: true }); R(F[4], 13, 19, 20, 22, 'storage', 'GUDANG');
  F[4].hall(23, 7, 23, 8); F[4].hall(21, 8, 22, 8); R(F[4], 21, 9, 24, 11, 'changing', 'GANTI');
  // ---- slides
  b.slide(4, 5, 13, 'E', 0, [[25, 14.9, 40.5], ...helix(32, 40.5, 6, Math.PI, 2.25, 14.4, 2.2, 54), [36.5, 0.55, 47]], { color: 0xd8b13a });
  b.slide(3, 16, 14, 'E', 0, [[54.5, 10.6, 44], [57, 8.6, 41], [56, 6.4, 36.5], [53, 4.4, 38], [53.5, 2.6, 43], [54, 0.55, 49]], { color: 0x3f8fc9 });
  b.slide(2, 10, 8, 'S', 0, [[31.5, 7.4, 30], [29, 6, 32.5], [25.5, 4.6, 31], [23.5, 3.2, 27], [24.5, 1.8, 23], [27, 0.55, 21.5]], { color: 0xc9473f });
  b.slide(3, 23, 12, 'S', 0, [[70.5, 11.3, 43], ...helix(69, 50, 3.5, -Math.PI / 2 + 0.4, 3, 10.9, 1.6, 60), [69, 0.55, 55]], { color: 0x5fb36a });
  // diving boards over the drop
  for (const [k, x, z, side] of [[3, 10, 5, 'S'], [2, 20, 13, 'W'], [4, 14, 18, 'N']]) {
    const d = SIDES_[side], cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
    F[k].prop('diving_board', cx + d[0] * 0.9, cz + d[1] * 0.9, Math.atan2(d[0], d[1]), [0.8, 0.8, 1]);
  }
  // high lights in the ceiling of the hall and the tower
  for (const x of [27, 39, 51]) for (const z of [27, 45]) b.tallLight(4, x, z, 4 * 3.6 + 2.95, { fall: 0.012, reach2: 900, fixture: 'lamp' });
  b.tallLight(3, 69, 48, 3 * 3.6 + 2.95, { fall: 0.02, reach2: 600, fixture: 'lamp' });
  b.start = { k: 4, room: start };
  b.exit = { k: 0, x: 1, z: 14, side: 'W' };
}
const SIDES_ = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
LAYOUTS.poolrooms = poolrooms;

// ---------------------------------------------------------------------------
// LEVEL 3 — Mal: three floors of shops round a central atrium you can see
// every floor from, with escalators in the void and a skylight on top. Glass
// shop fronts, some shutters down. East of the mall, behind a passage, sits a
// whole housing estate under the mall roof: a street, houses with tiled
// roofs, lamp posts and a parked car, three storeys of mall looking down.
//   ring x 10 / 19, z 8 / 17 · atrium x 11..18, z 9..16 · street x 25..33
// ---------------------------------------------------------------------------
function mall(b, rng) {
  const F = b.F;
  // shop with a glass front on every hall-facing edge and an open entrance in
  // the middle; closed shops keep their shutters down
  const shop = (f, x0, z0, x1, z1, name, open = true, type = 'shop2') => {
    const r = f.room(x0, z0, x1, z1, type, { sign: name, mallSign: true, noLock: true });
    const front = [];
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) for (const s of ['N', 'S', 'W', 'E']) {
      const d = SIDES_[s];
      if (f.map.reg(x + d[0], z + d[1]) === 0) front.push({ x, z, s });
    }
    if (!front.length) return r;
    const bySide = {};
    for (const e of front) (bySide[e.s] = bySide[e.s] || []).push(e);
    const side = Object.keys(bySide).sort((a, c) => bySide[c].length - bySide[a].length)[0];
    const list = bySide[side], mid = list[Math.floor(list.length / 2)];
    r.storefront = { side, list, mid };
    r.frontPref = { N: 'S', S: 'N', W: 'E', E: 'W' }[side];
    for (const e of list) {
      if (open && e === mid) f.arch(e.x, e.z, e.s);
      else if (open) f.map.glassKeys.add(f.edgeKey(e.x, e.z, e.s));
      else r.shutters = list;
    }
    if (!open) { r.noItems = true; r.noLights = true; r.closed = true; }
    return r;
  };
  for (const f of F) { f.hall(10, 8, 19, 8); f.hall(10, 17, 19, 17); f.hall(10, 8, 10, 17); f.hall(19, 8, 19, 17); }
  F[0].hall(11, 9, 18, 16);                              // plaza under the atrium
  F[1].void(11, 9, 18, 16); F[2].void(11, 9, 18, 16); F[2].sky(11, 9, 18, 16);
  // west corridor + lobby, east passage to the estate
  F[0].hall(1, 11, 9, 13);
  for (const k of [1, 2]) F[k].hall(5, 11, 9, 13);
  for (const f of F) f.hall(20, 12, 23, 13);
  F[0].hall(24, 12, 24, 13);
  // ---- ground floor shops
  shop(F[0], 3, 3, 9, 10, 'DEPARTEMEN STORE', true, 'dept');
  shop(F[0], 10, 3, 12, 7, 'TOKO SEPATU'); shop(F[0], 13, 3, 15, 7, 'OPTIK'); shop(F[0], 16, 3, 19, 7, 'MAINAN', false);
  shop(F[0], 3, 14, 9, 21, 'SWALAYAN', true, 'market');
  shop(F[0], 10, 18, 13, 22, 'KASET & CD'); shop(F[0], 14, 18, 16, 22, 'JAM TANGAN', false); shop(F[0], 17, 18, 19, 22, 'BUSANA');
  shop(F[0], 20, 8, 24, 11, 'ELEKTRONIK'); shop(F[0], 20, 14, 24, 17, 'SALON', false);
  // ---- first floor
  shop(F[1], 3, 3, 9, 10, 'DEPARTEMEN STORE 2', true, 'dept');
  shop(F[1], 10, 3, 12, 7, 'BUKU'); shop(F[1], 13, 3, 15, 7, 'FOTO STUDIO', false); shop(F[1], 16, 3, 19, 7, 'MAINAN');
  shop(F[1], 3, 14, 9, 21, 'GAME CENTER', true, 'dept');
  shop(F[1], 10, 18, 13, 22, 'ROTI', false); shop(F[1], 14, 18, 16, 22, 'KACAMATA'); shop(F[1], 17, 18, 19, 22, 'SEPEDA');
  shop(F[1], 20, 8, 23, 11, 'TOKO EMAS'); shop(F[1], 20, 14, 23, 17, 'APOTEK');
  // ---- second floor
  const fc = F[2].room(10, 3, 19, 7, 'kantin', { sign: 'PUJASERA', mallSign: true, noLock: true, frontPref: 'N' });
  for (let x = 10; x <= 19; x++) F[2].arch(x, 7, 'S');
  shop(F[2], 3, 3, 9, 10, 'BIOSKOP', true, 'cinema');
  shop(F[2], 3, 14, 9, 21, 'ARENA BERMAIN', false);
  shop(F[2], 10, 18, 13, 22, 'SALON'); shop(F[2], 14, 18, 16, 22, 'TOKO KUE', false); shop(F[2], 17, 18, 19, 22, 'TOKO KAIN');
  shop(F[2], 20, 8, 23, 11, 'ELEKTRONIK'); shop(F[2], 20, 14, 23, 17, 'BUSANA');
  // ---- escalators in the atrium, a lift by the lobby
  b.stair(0, 13, 15, 'W', 3, { escalator: true, mat: 'mall_floor' });
  F[1].hall(11, 9, 12, 9); F[2].hall(16, 9, 18, 9);
  b.stair(1, 13, 9, 'E', 3, { escalator: true, mat: 'mall_floor' });
  b.lift(4, 12, 'E', [0, 1, 2]);
  // ---- the estate: a street under the mall roof, houses on both sides
  const street = F[0].room(25, 3, 33, 22, 'street', { sign: null, noLock: true, noLights: true, mat: { floor: 'asphalt', wall: 'house_wall' } });
  F[0].arch(25, 12, 'W'); F[0].arch(25, 13, 'W');
  for (const k of [1, 2]) { F[k].void(25, 3, 33, 22); F[k].hall(24, 3, 24, 22); }
  F[2].sky(25, 3, 33, 22);
  const names = ['No. 1', 'No. 3', 'No. 5', 'No. 7', 'No. 2', 'No. 4', 'No. 6', 'No. 8'];
  let n = 0;
  for (const z0 of [3, 7, 15, 19]) { const h = F[0].room(26, z0, 28, z0 + 2, 'house', { sign: names[n++], mat: { floor: 'floor_classroom', wall: 'wall_classroom' } }); F[0].door(h, 28, z0 + 1, 'E'); }
  for (const z0 of [3, 8, 13, 18]) { const h = F[0].room(31, z0, 33, z0 + 2, 'house', { sign: names[n++], mat: { floor: 'floor_classroom', wall: 'wall_classroom' } }); F[0].door(h, 31, z0 + 1, 'W'); }
  void street;
  b.start = { k: 2, room: fc };
  b.exit = { k: 0, x: 1, z: 12, side: 'W' };
}
LAYOUTS.mall = mall;

// ---------------------------------------------------------------------------
// LEVEL 1 — Sayap Detensi: a panopticon. Three storeys of detention cells and
// punishment rooms round one open well; at the bottom of the well hundreds of
// exam desks all face the guard tower that stands in the middle, reached on
// the upper floors only by narrow bridges. East of the well a three-storey
// stair hall where open flights cross each other in every direction.
//   well x 9..18, z 7..16 · ring x 8 / 19, z 6 / 17 · stair hall x 21..26
// ---------------------------------------------------------------------------
function detention(b, rng) {
  const [F0, F1, F2] = b.F;
  const R = (f, x0, z0, x1, z1, type, sign, o = {}) => { const r = f.room(x0, z0, x1, z1, type, { sign, ...o }); f.autoDoor(r, null, rng); return r; };
  const cells = (f, xs, z0, z1, side, from = 1) => xs.map((x, i) => {
    const r = f.room(x, z0, x, z1, 'sel', { sign: 'SEL ' + String(from + i).padStart(2, '0'), dark: rng.chance(0.3) });
    f.autoDoor(r, [side], rng); return r;
  });
  const range = (a, c) => Array.from({ length: c - a + 1 }, (_, i) => a + i);
  for (const f of b.F) { f.hall(8, 6, 19, 6); f.hall(8, 17, 19, 17); f.hall(8, 6, 8, 17); f.hall(19, 6, 19, 17); }
  // ---- the well: exam desks below, open above, the tower in the middle
  const well = F0.room(9, 7, 18, 16, 'ujian', { sign: null, noLock: true, noLights: true, towerX: 14 * CELL, towerZ: 12 * CELL });
  for (const s of ['N', 'S', 'W', 'E']) F0.edges(9, 7, 18, 16, s, (x, z, side) => F0.arch(x, z, side));
  void well;
  for (const f of [F1, F2]) f.void(9, 7, 18, 16);
  F1.hall(9, 11, 12, 11); F1.hall(15, 12, 18, 12);              // bridges, floor 2
  F2.hall(13, 7, 13, 10); F2.hall(14, 13, 14, 16);              // bridges, floor 3
  const tower = [F0, F1, F2].map((f, k) => f.room(13, 11, 14, 12, 'office', { sign: 'POS PENGAWAS ' + (k + 1), noLock: k === 0 }));
  F0.door(tower[0], 13, 11, 'W'); F0.door(tower[0], 14, 12, 'E');
  F1.door(tower[1], 13, 11, 'W'); F1.door(tower[1], 14, 12, 'E');
  F2.door(tower[2], 13, 11, 'N'); F2.door(tower[2], 14, 12, 'S');
  // ---- the stair hall: open flights crossing in three storeys of space
  F0.hall(20, 11, 20, 12); F0.hall(21, 6, 26, 17);
  F1.void(21, 6, 26, 17); F1.hall(20, 12, 25, 12); F1.hall(24, 10, 24, 11);
  F2.void(21, 6, 26, 17); F2.hall(20, 8, 25, 8); F2.hall(20, 16, 23, 16);
  const tile = { mat: 'floor_tile', open: true };
  b.stair(0, 22, 15, 'N', 3, tile);      // A  ground -> 2, up northwards
  b.stair(0, 24, 7, 'S', 3, tile);       // C  ground -> 2, up southwards
  b.stair(1, 25, 11, 'N', 3, tile);      // B  2 -> 3
  b.stair(1, 21, 13, 'S', 3, tile);      // D  2 -> 3, the other way
  // ---- ground floor: entrance, counselling, canteen, hall
  F0.hall(1, 11, 7, 12);
  R(F0, 2, 7, 7, 10, 'office', 'TATA TERTIB'); R(F0, 2, 13, 7, 16, 'guru', 'RUANG BK');
  cells(F0, range(8, 13), 4, 5, 'S', 1);
  F0.hall(14, 1, 14, 5);
  R(F0, 8, 1, 13, 3, 'hukuman', 'RUANG HUKUMAN');
  R(F0, 15, 1, 19, 3, 'storage', 'GUDANG');
  R(F0, 15, 4, 16, 5, 'restroom', 'TOILET'); R(F0, 17, 4, 19, 5, 'office', 'PIKET');
  R(F0, 8, 18, 13, 22, 'kantin', 'KANTIN', { noLock: true }); R(F0, 14, 18, 19, 22, 'gym', 'AULA');
  // ---- floor 2: punishment classes, library, a row of cells
  F1.hall(2, 11, 7, 11);
  R(F1, 2, 6, 7, 10, 'hukuman', 'HUKUMAN A');
  R(F1, 2, 12, 4, 13, 'restroom', 'TOILET'); R(F1, 5, 12, 7, 13, 'storage', 'GUDANG');
  R(F1, 2, 14, 7, 17, 'hukuman', 'HUKUMAN B');
  R(F1, 8, 2, 13, 5, 'library', 'PERPUSTAKAAN');
  F1.hall(14, 3, 19, 3); F1.hall(19, 4, 19, 5);
  R(F1, 14, 1, 19, 2, 'guru', 'RUANG PIKET');
  cells(F1, range(14, 18), 4, 5, 'S', 21);
  cells(F1, [...range(8, 12), ...range(14, 19)], 18, 19, 'N', 31);
  F1.hall(13, 18, 13, 22);
  R(F1, 8, 20, 12, 22, 'uks', 'UKS'); R(F1, 14, 20, 19, 22, 'lab', 'LAB IPA');
  // ---- floor 3: the cell block you wake up in
  F2.hall(4, 11, 7, 12);
  R(F2, 2, 7, 7, 10, 'kepsek', 'KEPALA SEKOLAH'); R(F2, 2, 13, 7, 16, 'library', 'ARSIP');
  const c3 = cells(F2, [3], 11, 11, 'E', 41).concat(cells(F2, [3], 12, 12, 'E', 42));
  F2.hall(13, 1, 13, 5);
  const top = cells(F2, [...range(8, 12), ...range(14, 19)], 4, 5, 'S', 51);
  R(F2, 8, 1, 12, 3, 'hukuman', 'HUKUMAN C'); R(F2, 14, 1, 19, 3, 'office', 'KEPALA ASRAMA');
  R(F2, 8, 18, 11, 22, 'kelas', 'KELAS 3-X'); R(F2, 12, 18, 15, 22, 'guru', 'RUANG BK 2'); R(F2, 16, 18, 19, 22, 'hukuman', 'HUKUMAN D');
  void c3;
  // a cold light high over the well and over the stair hall
  for (const [x, z] of [[10.5, 8.5], [17.5, 15.5], [10.5, 15.5], [17.5, 8.5]]) b.tallLight(2, x * CELL, z * CELL, 2 * 3.6 + 2.95, { fall: 0.03, reach2: 420, fixture: 'lamp', state: rng.chance(0.3) ? 'flicker' : 'on' });
  for (const [x, z] of [[23.5, 9.5], [23.5, 14.5]]) b.tallLight(2, x * CELL, z * CELL, 2 * 3.6 + 2.95, { fall: 0.035, reach2: 380, fixture: 'lamp', state: rng.chance(0.4) ? 'flicker' : 'on' });
  const start = top[2];
  start.dark = false;
  b.start = { k: 2, room: start };
  b.exit = { k: 0, x: 1, z: 11, side: 'W' };
}
LAYOUTS.detention = detention;

// ---------------------------------------------------------------------------
// LEVEL 5 — Ruang Patung: a three-storey museum. A domed rotunda in the middle
// with a statue nine metres tall, grand open stairs climbing round it, and
// galleries that open into one another. East of the rotunda the statue hall:
// three storeys high, its floor a crowd of figures, crossed by bridges.
//   rotunda x 12..17, z 10..15 · ring x 11 / 18, z 9 / 16 · statue hall x 20..28
// ---------------------------------------------------------------------------
function museum(b, rng) {
  const [F0, F1, F2] = b.F;
  const R = (f, x0, z0, x1, z1, type, sign, o = {}) => { const r = f.room(x0, z0, x1, z1, type, { sign, ...o }); f.autoDoor(r, null, rng); return r; };
  const G = (f, x0, z0, x1, z1, type, sign, o = {}) => f.room(x0, z0, x1, z1, type, { sign, ...o });
  // wide opening between two galleries along a shared wall
  const open = (f, x, z0, z1, side) => { for (let z = z0; z <= z1; z++) side === 'E' || side === 'W' ? f.arch(x, z, side) : f.arch(z, x, side); };
  for (const f of b.F) { f.hall(11, 9, 18, 9); f.hall(11, 16, 18, 16); f.hall(11, 9, 11, 16); f.hall(18, 9, 18, 16); }
  // ---- the rotunda
  F0.hall(12, 10, 17, 15);
  F1.void(12, 10, 17, 15); F2.void(12, 10, 17, 15); F2.sky(12, 10, 17, 15);
  F1.hall(12, 10, 12, 11); F1.hall(17, 10, 17, 10); F2.hall(17, 14, 17, 15);
  const stone = { mat: 'marble', open: true };
  b.stair(0, 12, 14, 'N', 3, stone);
  b.stair(1, 17, 11, 'S', 3, stone);
  F0.prop('plinth', 15 * CELL, 13 * CELL, 0, [2.6, 2.6, 3], { scale: 3.2 });
  F0.prop('figure_stand', 15 * CELL, 13 * CELL, Math.PI, null, { scale: 4.2, y: 2.85 });
  b.lift(18, 17, 'N', [0, 1, 2]);
  // ---- the statue hall: three storeys, a crowd of figures on its floor
  const hall = G(F0, 20, 3, 28, 22, 'statuehall', 'AULA PATUNG', { noLock: true, noLights: true, faceAll: Math.PI / 2 * 3 });
  F0.hall(19, 12, 19, 13); F0.arch(20, 12, 'W'); F0.arch(20, 13, 'W');
  void hall;
  F1.void(20, 3, 28, 22); F1.hall(19, 12, 27, 12); F1.hall(28, 3, 28, 18);
  F2.void(20, 3, 28, 22); F2.hall(19, 6, 19, 19); F2.hall(20, 6, 28, 6); F2.hall(20, 19, 28, 19);
  b.stair(0, 28, 21, 'N', 3, stone);
  // ---- ground floor
  F0.hall(1, 12, 10, 13);
  const g1 = G(F0, 3, 3, 7, 8, 'gallery', 'GALERI LUKISAN I');
  const g2 = R(F0, 8, 3, 12, 8, 'gallery', 'GALERI LUKISAN II');
  R(F0, 13, 3, 17, 8, 'vitrine', 'KOLEKSI TOPENG');
  open(F0, 7, 5, 6, 'E'); open(F0, 12, 5, 6, 'E');
  void g1; void g2;
  R(F0, 3, 9, 10, 11, 'storage', 'GUDANG KOLEKSI'); R(F0, 3, 14, 10, 16, 'office', 'KURATOR');
  F0.hall(3, 17, 17, 17);
  R(F0, 3, 18, 7, 22, 'exhibit', 'PAMERAN: KELAS 1996', { noLock: true });
  R(F0, 8, 18, 12, 22, 'gallery', 'GALERI PATUNG'); R(F0, 13, 18, 14, 22, 'restroom', 'TOILET'); R(F0, 15, 18, 17, 22, 'storage', 'GUDANG');
  // ---- first floor
  G(F1, 3, 3, 10, 8, 'gallery', 'GALERI MODERN');
  R(F1, 11, 3, 17, 8, 'statues', 'RUANG PATUNG', { noLock: true });
  open(F1, 10, 5, 6, 'E');
  R(F1, 3, 9, 10, 13, 'vitrine', 'ARKEOLOGI'); R(F1, 3, 14, 10, 16, 'gallery', 'GALERI POTRET');
  G(F1, 3, 17, 10, 22, 'gallery', 'RUANG PATUNG II', { noLock: true });
  R(F1, 11, 17, 17, 22, 'gallery', 'GALERI GELAP', { dark: true });
  open(F1, 10, 19, 20, 'E');
  // ---- second floor
  G(F2, 3, 3, 10, 8, 'statues', 'GUDANG PATUNG', { noLock: true, dark: true });
  R(F2, 11, 3, 17, 8, 'office', 'RESTORASI');
  open(F2, 10, 5, 5, 'E');
  F2.hall(3, 12, 10, 12);
  R(F2, 3, 9, 10, 11, 'gallery', 'GALERI WAJAH');
  const start = R(F2, 3, 13, 10, 16, 'office', 'RUANG JAGA MALAM');
  G(F2, 3, 17, 10, 22, 'vitrine', 'KOLEKSI MATA');
  R(F2, 11, 17, 17, 22, 'exhibit', 'PAMERAN: KELAS TERAKHIR', { noLock: true });
  open(F2, 10, 19, 20, 'E');
  // light from the dome and from lamps hung high in the statue hall
  for (const [x, z] of [[13.5, 11.5], [16.5, 14.5]]) b.tallLight(2, x * CELL, z * CELL, 2 * 3.6 + 2.95, { fall: 0.02, reach2: 520, fixture: 'none' });
  for (const z of [6.5, 12.5, 18.5]) b.tallLight(2, 24.5 * CELL, z * CELL, 2 * 3.6 + 2.95, { fall: 0.03, reach2: 520, fixture: 'lamp', state: rng.chance(0.35) ? 'flicker' : 'on' });
  b.start = { k: 2, room: start };
  b.exit = { k: 0, x: 1, z: 12, side: 'W' };
}
LAYOUTS.museum = museum;
