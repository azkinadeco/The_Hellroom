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
