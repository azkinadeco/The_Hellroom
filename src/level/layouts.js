// Hand-written building layouts. Each gets (building, rng, def) and carves its
// floors; building.js does edges, furnishing, lights and items afterwards.
import { CELL } from '../config.js';

// ---------------------------------------------------------------------------
// LEVEL 0 — a real two-storey school round a roofed-over courtyard (lapangan).
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

  // the yard has been roofed over: a two-storey covered court, colonnade on
  // every side, the flagpole and the old trees still standing indoors
  F0.room(7, 6, 18, 15, 'lapangan', { noLock: true, noLights: true, mat: { floor: 'paving' } });
  for (const s of ['N', 'S', 'W', 'E']) F0.edges(7, 6, 18, 15, s, (x, z, side) => F0.arch(x, z, side));
  F1.void(7, 6, 18, 15);
  for (const [x, z] of [[9.5, 8.5], [16.5, 8.5], [9.5, 13.5], [16.5, 13.5], [13, 11]]) b.tallLight(1, x * CELL, z * CELL, 3.6 + 2.95, { fall: 0.035, reach2: 380, fixture: 'lamp', state: rng.chance(0.35) ? 'flicker' : 'on' });

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

// LEVEL 3 (mall) lives in mall.js and LEVEL 4 (poolrooms) in pool.js.

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

// ---------------------------------------------------------------------------
// MODE TANPA UJUNG — a random multi-storey building every floor. Plan:
//   border · west band · west corridor · atrium · east corridor · east band
// with north/south bands between the corridors. The atrium is open through
// every storey; open flights climb it, alternating sides, so each floor has
// the landing from below on one side and the flight up on the other. Rooms
// are cut from the bands at random widths and drawn from the building's
// theme, and now and then from somewhere else entirely.
// ---------------------------------------------------------------------------
export const ENDLESS_STYLES = {
  school: { rooms: ['kelas', 'kelas', 'kelas', 'guru', 'library', 'uks', 'restroom', 'storage', 'kepsek', 'lab'] },
  hospital: { rooms: ['ward', 'ward', 'icu', 'pharmacy', 'morgue', 'surgery', 'radiology', 'storage', 'restroom', 'office'] },
  pool: { rooms: ['changing', 'changing', 'restroom', 'storage', 'office', 'pool', 'flooded'] },
  museum: { rooms: ['gallery', 'gallery', 'vitrine', 'statues', 'exhibit', 'office', 'storage'] },
  detention: { rooms: ['sel', 'sel', 'hukuman', 'hukuman', 'guru', 'library', 'restroom', 'storage'] },
  backroom: { rooms: ['statues', 'shop', 'shop', 'storage', 'office'] },
};
const ROOM_NAMES = {
  kelas: () => 'KELAS ' + (1 + Math.floor(Math.random() * 3)) + '-' + 'ABCDEFGH'[Math.floor(Math.random() * 8)],
  guru: 'RUANG GURU', library: 'PERPUSTAKAAN', uks: 'UKS', restroom: 'TOILET', storage: 'GUDANG', kepsek: 'KEPALA SEKOLAH', lab: 'LAB',
  ward: 'BANGSAL', icu: 'ICU', pharmacy: 'APOTEK', morgue: 'KAMAR JENAZAH', surgery: 'RUANG OPERASI', radiology: 'RADIOLOGI', office: 'KANTOR',
  changing: 'RUANG GANTI', pool: 'KOLAM', flooded: 'RUANG RENDAM', gallery: 'GALERI', vitrine: 'KOLEKSI', statues: 'RUANG PATUNG',
  exhibit: 'PAMERAN', sel: 'SEL', hukuman: 'RUANG HUKUMAN', shop: null, forest: 'TAMAN', house: 'RUMAH',
};
// the strange thing at the bottom of the atrium
const ATRIUMS = [
  { type: 'lapangan', mat: { floor: 'paving' }, sky: true },
  { type: 'forest', mat: { floor: 'forest_ground', wall: 'forest_wall' }, sky: true },
  { type: 'statuehall', mat: null },
  { type: 'ujian', mat: null },
];
function endless(b, rng, def) {
  const F = b.F, W = b.W, H = b.H, N = F.length;
  const style = ENDLESS_STYLES[def.style];
  const bw = def.band[0], bn = def.band[1];
  const xW = bw + 1, xE = W - bw - 2, zN = bn + 1, zS = H - bn - 2;   // corridors
  const ax0 = xW + 1, ax1 = xE - 1, az0 = zN + 1, az1 = zS - 1;      // atrium
  const name = (type) => { const n = ROOM_NAMES[type]; return typeof n === 'function' ? n() : n; };
  const flood = (f, r) => f.out.water.push({ minX: r.x0 * CELL + 0.02, maxX: (r.x1 + 1) * CELL - 0.02, minZ: r.z0 * CELL + 0.02, maxZ: (r.z1 + 1) * CELL - 0.02 });
  for (const f of F) { f.hall(xW, 1, xW, H - 2); f.hall(xE, 1, xE, H - 2); f.hall(xW, zN, xE, zN); f.hall(xW, zS, xE, zS); }
  // ---- the atrium
  const at = def.atrium;
  const A = ATRIUMS[at];
  const atr = F[0].room(ax0, az0, ax1, az1, A.type, { sign: null, noLock: true, noLights: A.sky, mat: A.mat, towerX: (ax0 + ax1 + 1) / 2 * CELL, towerZ: (az0 + az1 + 1) / 2 * CELL, faceAll: rng.range(0, 6) });
  void atr;
  for (const s of ['N', 'S', 'W', 'E']) F[0].edges(ax0, az0, ax1, az1, s, (x, z, side) => F[0].arch(x, z, side));
  for (let k = 1; k < N; k++) F[k].void(ax0, az0, ax1, az1);
  if (A.sky) F[N - 1].sky(ax0, az0, ax1, az1);
  // ---- open flights, alternating sides
  const mat = (def.textures || [])[0] || (def.theme === 'pool' ? 'pool_floor' : def.theme === 'backroom' ? 'bk_carpet' : 'floor_tile');
  for (let k = 0; k < N - 1; k++) {
    if (k % 2 === 0) { b.stair(k, ax0, az1, 'N', 3, { open: true, mat }); F[k + 1].hall(ax0, az0, ax0, az1 - 3); }
    else { b.stair(k, ax1, az0, 'S', 3, { open: true, mat }); F[k + 1].hall(ax1, az0 + 3, ax1, az1); }
  }
  // bridges across the void on some floors
  for (let k = 1; k < N; k++) if (rng.chance(0.5) && ax1 - ax0 >= 4) {
    const z = rng.int(az0 + 1, az1 - 1);
    for (let x = ax0; x <= ax1; x++) if (F[k].map.reg(x, z) === VOID_) F[k].hall(x, z, x, z);
  }
  // ---- lift in a corner of the east corridor's band (sometimes)
  const lift = N > 2 && rng.chance(0.6) ? [xE + 1, zN] : null;
  if (lift) b.lift(lift[0], lift[1], 'W', F.map((_, k) => k));
  // ---- rooms cut from the bands
  const lobbyZ = Math.floor(H / 2) - 1;
  F[0].hall(1, lobbyZ, xW - 1, lobbyZ + 1);
  const cut = (len) => { const out = []; let p = 0; while (p < len) { let s = Math.min(len - p, rng.int(2, 4)); if (len - p - s === 1) s++; out.push(s); p += s; } return out; };
  const pickType = () => {
    if (rng.chance(0.05)) return rng.pick(['forest', 'flooded', 'statues', 'house', 'pool']);
    return rng.pick(style.rooms);
  };
  const free = (f, x0, z0, x1, z1) => { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (f.map.reg(x, z) !== -1) return false; return true; };
  const make = (f, x0, z0, x1, z1, type) => {
    if (!free(f, x0, z0, x1, z1)) {
      // split around whatever is already there: one-cell slivers become cells or halls
      return null;
    }
    const o = { sign: name(type) };
    if (type === 'forest') Object.assign(o, { mat: { floor: 'forest_ground', wall: 'forest_wall' }, noLights: true, noLock: true });
    if (type === 'house') Object.assign(o, { mat: { floor: 'floor_classroom', wall: 'house_wall' } });
    if (type === 'pool' || type === 'statues') o.noLock = true;
    if (rng.chance(0.08)) o.dark = true;
    const r = f.room(x0, z0, x1, z1, type, o);
    if (!f.autoDoor(r, null, rng)) { f.fill(x0, z0, x1, z1, 0); f.out.rooms.splice(f.out.rooms.indexOf(r), 1); return null; }
    if (type === 'flooded') flood(f, r);
    return r;
  };
  const rooms = [];
  for (const f of F) {
    const band = (along, a0, a1, c0, c1) => {   // along: 'z' (west/east bands) or 'x'
      let p = a0;
      for (const s of cut(a1 - a0 + 1)) {
        let type = pickType();
        const one = s === 1 || (type === 'sel');
        if (type === 'sel') {   // a row of one-cell cells instead
          for (let i = 0; i < s; i++) {
            const q = p + i;
            const r = along === 'z' ? make(f, c0, q, c1, q, 'sel') : make(f, q, c0, q, c1, 'sel');
            if (r) { r.sign = 'SEL ' + String(rooms.length + 1).padStart(2, '0'); rooms.push(r); }
          }
        } else {
          if (one) type = 'storage';
          const r = along === 'z' ? make(f, c0, p, c1, p + s - 1, type) : make(f, p, c0, p + s - 1, c1, type);
          if (r) rooms.push(r);
        }
        p += s;
      }
    };
    // west / east bands run the full height, north / south between corridors
    band('z', 1, H - 2, 1, xW - 1);
    band('z', 1, H - 2, xE + 1, W - 2);
    band('x', xW + 1, xE - 1, 1, zN - 1);
    band('x', xW + 1, xE - 1, zS + 1, H - 2);
    // any cell left over (around the lobby or the lift) joins the corridors
    for (let z = 1; z < H - 1; z++) for (let x = 1; x < W - 1; x++) if (f.map.reg(x, z) === -1) {
      const touch = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => f.map.reg(x + dx, z + dz) === 0);
      if (touch) f.hall(x, z, x, z);
    }
  }
  // ---- lights hung high in the atrium
  const top = (N - 1) * FH_ + 2.95;
  for (const [x, z] of [[ax0 + 0.5, az0 + 0.5], [ax1 + 0.5, az1 + 0.5]]) b.tallLight(N - 1, x * CELL, z * CELL, top, { fall: 0.03, reach2: 500, fixture: A.sky ? 'none' : 'lamp', state: rng.chance(0.3) ? 'flicker' : 'on' });
  // ---- start in a room on the top floor, exit in the ground floor lobby
  const tops = F[N - 1].out.rooms.filter((r) => !['stairs', 'lift', 'forest', 'pool', 'flooded', 'statues'].includes(r.type) && r.doors.length);
  b.start = { k: N - 1, room: rng.pick(tops) };
  b.exit = { k: 0, x: 1, z: lobbyZ, side: 'W' };
}
const VOID_ = -2;
const FH_ = 3.6;
LAYOUTS.endless = endless;
