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
