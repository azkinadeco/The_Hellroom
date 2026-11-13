// Batch 19 variety pass: after a floor is furnished, every room gets a few
// extra props drawn from a per-theme recipe for its type (so no two rooms of
// a kind come out alike), and the halls get extinguishers, posters, cameras,
// bins and the like with spacing rules. Everything goes through free(),
// which keeps the walking lines between cell centres clear for the AI,
// stays off doors, stairs, lifts, lockers, item spots and other furniture.
// Uses its own RNG so it doesn't shift the rest of the level generation.
import { CELL, WALL_T, hideOf } from '../config.js';
import { RNG } from '../util/rng.js';
import { DIRS, EDGE } from './map.js';
import { yawFor } from './generator.js';

const wallOff = WALL_T / 2;
const AISLE = 0.36;          // half-width kept clear round every walking line

export function themeOf(def) {
  if (def.layout === 'endless') return def.style || 'school';
  return { school: 'school', detention: 'detention', hospital: 'hospital', mall: 'mall', poolrooms: 'pool', museum: 'museum' }[def.layout] || 'school';
}

// [type, w, d, h, mode, chance, maxPerRoom]
//   mode: 'wall' stands against a wall facing in, 'free' on an interior cell
//   corner, 'hang' is a wall piece with no collider (posters, extinguisher)
const R = {
  school: {
    kelas: [['poster_a', 0.6, 0.02, 0, 'hang', 0.6, 1], ['wall_speaker', 0.4, 0.2, 0, 'hang', 0.5, 1],
      ['bag_pile', 0.8, 0.6, 0.4, 'wall', 0.45, 1], ['umbrella_stand', 0.32, 0.32, 0.9, 'wall', 0.3, 1], ['globe_stand', 0.42, 0.42, 1.0, 'wall', 0.3, 1],
      ['projector_cart', 0.72, 0.52, 1.3, 'wall', 0.2, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.25, 1]],
    guru: [['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.8, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.6, 2], ['globe_stand', 0.42, 0.42, 1.0, 'wall', 0.4, 1],
      ['poster_a', 0.6, 0.02, 0, 'hang', 0.5, 1], ['projector_cart', 0.72, 0.52, 1.3, 'wall', 0.4, 1], ['umbrella_stand', 0.32, 0.32, 0.9, 'wall', 0.5, 1]],
    kepsek: [['globe_stand', 0.42, 0.42, 1.0, 'wall', 0.9, 1], ['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.7, 1], ['umbrella_stand', 0.32, 0.32, 0.9, 'wall', 0.6, 1]],
    office: [['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.6, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.7, 2], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.5, 1], ['poster_a', 0.6, 0.02, 0, 'hang', 0.4, 1]],
    library: [['globe_stand', 0.42, 0.42, 1.0, 'wall', 0.7, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.6, 2], ['stacked_chairs', 0.5, 0.5, 1.3, 'wall', 0.4, 1], ['poster_a', 0.6, 0.02, 0, 'hang', 0.5, 1]],
    lab: [['globe_stand', 0.42, 0.42, 1.0, 'wall', 0.3, 1], ['poster_a', 0.6, 0.02, 0, 'hang', 0.6, 1], ['fire_extinguisher', 0.25, 0.25, 0, 'hang', 0.7, 1], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.4, 1]],
    uks: [['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.6, 1], ['poster_a', 0.6, 0.02, 0, 'hang', 0.6, 1], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.3, 1]],
    kantin: [['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.6, 2], ['stacked_chairs', 0.5, 0.5, 1.3, 'wall', 0.8, 3], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.6, 1], ['poster_a', 0.6, 0.02, 0, 'hang', 0.6, 1]],
    gym: [['sports_rack', 1.05, 0.55, 1.0, 'wall', 1.0, 2], ['stacked_chairs', 0.5, 0.5, 1.3, 'wall', 1.0, 4], ['wall_speaker', 0.4, 0.2, 0, 'hang', 1.0, 2], ['fire_extinguisher', 0.25, 0.25, 0, 'hang', 0.8, 1]],
    storage: [['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.8, 3], ['stacked_chairs', 0.5, 0.5, 1.3, 'wall', 0.6, 2],
      ['cleaning_cart', 0.95, 0.5, 0.9, 'wall', 0.6, 1], ['paper_pile', 1.0, 0.7, 0.25, 'free', 0.5, 1]],
    restroom: [['cleaning_cart', 0.95, 0.5, 0.9, 'wall', 0.4, 1], ['fallen_tile', 0.9, 0.9, 0.05, 'free', 0.3, 1]],
    hall: { hang: [['fire_extinguisher', 9], ['poster_a', 7], ['wall_speaker', 10]],
      floor: [['cleaning_cart', 0.95, 0.5, 0.9, 30], ['bag_pile', 0.8, 0.6, 0.4, 24], ['umbrella_stand', 0.32, 0.32, 0.9, 22], ['fallen_tile', 0.9, 0.9, 0.05, 26]] },
  },
  detention: {
    sel: [['wall_chains', 0.7, 0.1, 0, 'hang', 0.35, 1], ['intercom_panel', 0.25, 0.06, 0, 'hang', 0.4, 1], ['paper_pile', 1.0, 0.7, 0.25, 'free', 0.15, 1]],
    hukuman: [['punish_stool', 0.42, 0.42, 1.2, 'wall', 0.9, 2], ['chair_broken', 0.65, 0.65, 0.45, 'free', 0.4, 1], ['wall_chains', 0.7, 0.1, 0, 'hang', 0.5, 2], ['intercom_panel', 0.25, 0.06, 0, 'hang', 0.6, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.5, 1]],
    office: [['barred_cabinet', 0.92, 0.45, 1.6, 'wall', 0.8, 2], ['file_boxes', 0.85, 0.5, 0.9, 'wall', 0.7, 2], ['intercom_panel', 0.25, 0.06, 0, 'hang', 0.6, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.4, 1]],
    guru: [['barred_cabinet', 0.92, 0.45, 1.6, 'wall', 0.6, 1], ['file_boxes', 0.85, 0.5, 0.9, 'wall', 0.7, 2], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.5, 1], ['intercom_panel', 0.25, 0.06, 0, 'hang', 0.5, 1]],
    kepsek: [['barred_cabinet', 0.92, 0.45, 1.6, 'wall', 0.8, 1], ['file_boxes', 0.85, 0.5, 0.9, 'wall', 0.7, 1]],
    library: [['file_boxes', 0.85, 0.5, 0.9, 'wall', 0.8, 3], ['barred_cabinet', 0.92, 0.45, 1.6, 'wall', 0.5, 1], ['paper_pile', 1.0, 0.7, 0.25, 'free', 0.5, 1]],
    storage: [['file_boxes', 0.85, 0.5, 0.9, 'wall', 0.7, 2], ['barred_cabinet', 0.92, 0.45, 1.6, 'wall', 0.4, 1], ['paper_pile', 1.0, 0.7, 0.25, 'free', 0.5, 1]],
    kantin: [['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.3, 1], ['intercom_panel', 0.25, 0.06, 0, 'hang', 0.6, 1]],
    kelas: [['punish_stool', 0.42, 0.42, 1.2, 'wall', 0.7, 1], ['intercom_panel', 0.25, 0.06, 0, 'hang', 0.6, 1]],
    uks: [['intercom_panel', 0.25, 0.06, 0, 'hang', 0.6, 1]],
    gym: [['wall_chains', 0.7, 0.1, 0, 'hang', 0.6, 2], ['punish_stool', 0.42, 0.42, 1.2, 'wall', 0.6, 2]],
    hall: { hang: [['intercom_panel', 10], ['cctv_camera', 9]],
      floor: [['file_boxes', 0.85, 0.5, 0.9, 30], ['paper_pile', 1.0, 0.7, 0.25, 26]] },
  },
  hospital: {
    ward: [['oxygen_tanks', 0.6, 0.35, 1.3, 'wall', 0.4, 1], ['poster_c', 0.56, 0.03, 0, 'hang', 0.5, 1], ['crash_cart', 0.78, 0.52, 1.0, 'wall', 0.2, 1]],
    icu: [['oxygen_tanks', 0.6, 0.35, 1.3, 'wall', 0.8, 2], ['crash_cart', 0.78, 0.52, 1.0, 'wall', 0.7, 1], ['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.4, 1]],
    igd: [['crash_cart', 0.78, 0.52, 1.0, 'wall', 0.9, 1], ['oxygen_tanks', 0.6, 0.35, 1.3, 'wall', 0.7, 1], ['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.4, 1]],
    surgery: [['crash_cart', 0.78, 0.52, 1.0, 'wall', 0.8, 1], ['oxygen_tanks', 0.6, 0.35, 1.3, 'wall', 0.8, 1], ['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.6, 1]],
    radiology: [['oxygen_tanks', 0.6, 0.35, 1.3, 'wall', 0.4, 1], ['poster_c', 0.56, 0.03, 0, 'hang', 0.6, 1]],
    pharmacy: [['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.9, 2], ['specimen_fridge', 0.72, 0.67, 1.75, 'wall', 0.7, 1]],
    morgue: [['specimen_fridge', 0.72, 0.67, 1.75, 'wall', 0.8, 1], ['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.4, 1]],
    lab: [['specimen_fridge', 0.72, 0.67, 1.75, 'wall', 0.9, 1], ['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.5, 1]],
    office: [['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.7, 1], ['poster_c', 0.56, 0.03, 0, 'hang', 0.5, 1], ['paper_pile', 1.0, 0.7, 0.25, 'wall', 0.4, 1], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.3, 1]],
    storage: [['supply_rack', 1.22, 0.47, 1.8, 'wall', 0.9, 2], ['box_pile_b', 0.9, 0.9, 1.4, 'wall', 0.6, 1], ['pipe_bundle', 3, 0.3, 0, 'hang', 0.5, 1], ['oxygen_tanks', 0.6, 0.35, 1.3, 'wall', 0.4, 1]],
    restroom: [['mop_bucket', 0.4, 0.4, 1.0, 'wall', 0.5, 1]],
    hall: { hang: [['poster_c', 9], ['fire_extinguisher', 10], ['emergency_light', 14]],
      floor: [['vending_machine', 0.92, 0.77, 1.85, 30], ['oxygen_tanks', 0.6, 0.35, 1.3, 24], ['water_dispenser', 0.34, 0.34, 1.4, 26]] },
  },
  mall: {
    mstore: [['fuse_cabinet', 0.6, 0.25, 0, 'hang', 0.6, 2], ['pipe_bundle', 3, 0.3, 0, 'hang', 0.4, 1], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.8, 3], ['cleaning_cart', 0.95, 0.5, 0.9, 'wall', 0.5, 1]],
    moffice: [['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.6, 1]],
    mfash: [['shopping_bags', 0.8, 0.55, 0.5, 'wall', 0.4, 1]],
    mshoe: [['shopping_bags', 0.8, 0.55, 0.5, 'wall', 0.5, 1]],
    mbeauty: [['shopping_bags', 0.8, 0.55, 0.5, 'wall', 0.4, 1]],
    mdept: [['shopping_bags', 0.8, 0.55, 0.5, 'free', 0.6, 2]],
    mmarket: [['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.6, 2], ['shopping_bags', 0.8, 0.55, 0.5, 'free', 0.6, 2]],
    marcade: [['claw_machine', 0.9, 0.9, 1.95, 'wall', 1.0, 3]],
    mkids: [['claw_machine', 0.9, 0.9, 1.95, 'wall', 0.6, 1]],
    mvacant: [['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.6, 1]],
    mxxi: [['queue_posts', 2.4, 0.35, 1.0, 'free', 1.0, 2]],
    mlost: [['shopping_bags', 0.8, 0.55, 0.5, 'wall', 0.7, 1]],
    hall: { hang: [],
      floor: [['potted_palm', 0.62, 0.62, 1.8, 12], ['recycle_bins', 1.22, 0.42, 0.95, 16], ['massage_chair', 0.82, 1.22, 1.3, 22]] },
  },
  pool: {
    changing: [['towel_cart', 0.92, 0.52, 1.1, 'wall', 0.6, 1], ['mop_bucket', 0.4, 0.4, 1.0, 'wall', 0.4, 1], ['poster_b', 0.6, 0.02, 0, 'hang', 0.4, 1]],
    office: [['kickboard_rack', 1.05, 0.45, 1.2, 'wall', 0.5, 1], ['lifering_stand', 0.32, 0.32, 1.6, 'wall', 0.4, 1], ['water_dispenser', 0.34, 0.34, 1.4, 'wall', 0.5, 1], ['poster_b', 0.6, 0.02, 0, 'hang', 0.5, 1]],
    storage: [['pipe_bundle', 3, 0.3, 0, 'hang', 0.6, 2], ['fuse_cabinet', 0.6, 0.25, 0, 'hang', 0.5, 1], ['box_pile_c', 1.25, 1.05, 0.9, 'free', 0.4, 1], ['kickboard_rack', 1.05, 0.45, 1.2, 'wall', 0.8, 2], ['pool_robot', 1.1, 0.8, 0.4, 'wall', 0.6, 1], ['towel_cart', 0.92, 0.52, 1.1, 'wall', 0.5, 1], ['lounge_chair', 0.68, 1.92, 0.8, 'wall', 0.5, 2], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.4, 1]],
    restroom: [['mop_bucket', 0.4, 0.4, 1.0, 'wall', 0.6, 1], ['towel_cart', 0.92, 0.52, 1.1, 'wall', 0.3, 1]],
    jaga: [['lifering_stand', 0.32, 0.32, 1.6, 'wall', 0.7, 1], ['lounge_chair', 0.68, 1.92, 0.8, 'wall', 0.4, 1]],
    kolam: [['lounge_chair', 0.68, 1.92, 0.8, 'wall', 0.6, 2], ['lifering_stand', 0.32, 0.32, 1.6, 'wall', 0.7, 1], ['pool_robot', 1.1, 0.8, 0.4, 'wall', 0.3, 1]],
    pool: [['lounge_chair', 0.68, 1.92, 0.8, 'wall', 0.6, 2], ['lifering_stand', 0.32, 0.32, 1.6, 'wall', 0.7, 1]],
    hall: { hang: [['poster_b', 12], ['fire_extinguisher', 14]],
      floor: [['lounge_chair', 0.68, 1.92, 0.8, 18], ['lifering_stand', 0.32, 0.32, 1.6, 16], ['towel_cart', 0.92, 0.52, 1.1, 30], ['mop_bucket', 0.4, 0.4, 1.0, 26]] },
  },
  museum: {
    gallery: [['info_sign', 0.42, 0.32, 1.15, 'wall', 0.5, 1], ['vase_set', 1.22, 0.52, 1.5, 'wall', 0.4, 1]],
    vitrine: [['info_sign', 0.42, 0.32, 1.15, 'wall', 0.6, 1]],
    exhibit: [['info_sign', 0.42, 0.32, 1.15, 'wall', 0.8, 1]],
    office: [['map_table', 1.42, 0.92, 0.9, 'free', 0.6, 1], ['armour_stand', 0.62, 0.52, 1.9, 'wall', 0.35, 1]],
    storage: [['sarcophagus', 0.97, 2.27, 0.9, 'free', 0.8, 2], ['armour_stand', 0.62, 0.52, 1.9, 'wall', 0.8, 3], ['vase_set', 1.22, 0.52, 1.5, 'wall', 0.7, 2], ['fossil_skeleton', 1.8, 0.6, 1.2, 'free', 0.5, 1], ['box_pile_a', 1.1, 0.7, 0.8, 'wall', 0.7, 2]],
    statues: [['info_sign', 0.42, 0.32, 1.15, 'wall', 0.4, 1]],
    hall: { hang: [],
      floor: [['info_sign', 0.42, 0.32, 1.15, 14], ['vase_set', 1.22, 0.52, 1.5, 22], ['armour_stand', 0.62, 0.52, 1.9, 22]] },
  },
};
R.backroom = { storage: R.school.storage, office: R.school.office,
  hall: { hang: [['poster_b', 14]], floor: [['fallen_tile', 0.9, 0.9, 0.05, 14], ['paper_pile', 1.0, 0.7, 0.25, 20], ['chair_broken', 0.65, 0.65, 0.45, 24]] } };

export function dressVariety(f, def, reserved) {
  if (globalThis.__noVariety) return;   // perf comparison hook
  const theme = themeOf(def);
  const book = R[theme];
  if (!book) return;
  const rng = new RNG(((def.seed || 1) * 31 + f.k * 977 + 0x5eed) >>> 0);
  const P = placer(f, reserved);
  for (const r of f.out.rooms) {
    const list = book[r.type];
    if (!list || r.closed) continue;
    const order = rng.shuffle([...list]);
    for (const [type, w, d, h, mode, p, max] of order) {
      const n = rng.chance(p) ? 1 + (max > 1 ? rng.int(0, max - 1) : 0) : 0;
      for (let i = 0; i < n; i++) {
        if (mode === 'hang') P.hang(r.id, type, rng);
        else if (mode === 'wall') P.wall(r.id, type, w, d, h, rng);
        else P.free(r.id, type, w, d, h, rng);
      }
    }
  }
  if (book.hall) P.halls(book.hall, rng);
  if (f.out.exit) P.exitSign(f.out.exit);
}

function placer(f, reserved) {
  const m = f.map, out = f.out;
  const byId = new Map(out.rooms.map((r) => [r.id, r]));
  const blockedCell = (x, z) => { const r = byId.get(m.reg(x, z)); return !!r && (r.type === 'stairs' || r.type === 'lift'); };
  const doorPts = [...m.doors.values()].map((d) => [d.x, d.z]);
  if (out.exit) doorPts.push([out.exit.x, out.exit.z]);
  if (out.fusebox) doorPts.push([out.fusebox.x, out.fusebox.z]);
  for (const L of out.liftDoors || []) { const [cx, cz] = m.center(L.x, L.z); doorPts.push([cx, cz]); }
  const hung = [];   // wall pieces placed so far: [x, z]
  const wet = (x, z) => out.water.some((w) => x > w.minX - 0.2 && x < w.maxX + 0.2 && z > w.minZ - 0.2 && z < w.maxZ + 0.2);
  const box = (x, z, w, d, rot) => { const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)); const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2; return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }; };
  const hit = (a, b, pad = 0) => a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
  // does the (padded) box touch a walking line between two cell centres?
  const aisle = (b) => {
    const e = { minX: b.minX - AISLE, maxX: b.maxX + AISLE, minZ: b.minZ - AISLE, maxZ: b.maxZ + AISLE };
    const i0 = Math.floor(e.minX / CELL) - 1, i1 = Math.floor(e.maxX / CELL) + 1, j0 = Math.floor(e.minZ / CELL) - 1, j1 = Math.floor(e.maxZ / CELL) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (m.reg(i, j) < 0) continue;
      const [cx, cz] = m.center(i, j);
      if (cx > e.minX && cx < e.maxX && cz > e.minZ && cz < e.maxZ) return true;
      for (const d of DIRS) {
        if (d.dx < 0 || d.dz < 0 || !m.canStep(i, j, d)) continue;
        const [nx, nz] = m.center(i + d.dx, j + d.dz);
        if (d.dx) { if (cz > e.minZ && cz < e.maxZ && Math.max(cx, nx) > e.minX && Math.min(cx, nx) < e.maxX) return true; }
        else if (cx > e.minX && cx < e.maxX && Math.max(cz, nz) > e.minZ && Math.min(cz, nz) < e.maxZ) return true;
      }
    }
    return false;
  };
  const ok = (reg, x, z, w, d, rot, opt = {}) => {
    const b = box(x, z, w, d, rot);
    for (const [px, pz] of [[b.minX + 0.02, b.minZ + 0.02], [b.maxX - 0.02, b.minZ + 0.02], [b.minX + 0.02, b.maxZ - 0.02], [b.maxX - 0.02, b.maxZ - 0.02], [x, z]]) {
      const [cx, cz] = m.cellOf(px, pz);
      if (m.reg(cx, cz) !== reg || blockedCell(cx, cz) || out.noFloor[cx + cz * m.W]) return false;
    }
    if (!opt.wet && wet(x, z)) return false;
    for (const c of out.colliders) if (hit(b, c, 0.06)) return false;
    for (const L of out.lockers) {
      const H = hideOf(L), sz = H.size || [0.62, 0.58];
      if (hit(b, box(L.x, L.z, sz[0] + 0.08, sz[1] + 0.08, L.rot), 0.05)) return false;
      // keep the space in front of every hiding spot clear (where the player steps out / is inspected)
      for (const dd of [H.exit || 0.85, H.inspect || 1.0]) {
        const px = L.x + Math.sin(L.rot) * dd, pz = L.z + Math.cos(L.rot) * dd;
        if (hit(b, { minX: px, maxX: px, minZ: pz, maxZ: pz }, 0.6)) return false;
      }
    }
    for (const [dx, dz] of doorPts) if (dx > b.minX - 1.1 && dx < b.maxX + 1.1 && dz > b.minZ - 1.1 && dz < b.maxZ + 1.1) return false;
    for (const p of out.props) if (Math.abs(p.x - x) < 0.25 && Math.abs(p.z - z) < 0.25) return false;
    const rr = byId.get(reg);
    if (rr) for (const s of rr.spots) if (s[1] < 0.1 && s[0] > b.minX - 0.25 && s[0] < b.maxX + 0.25 && s[2] > b.minZ - 0.25 && s[2] < b.maxZ + 0.25) return false;
    if (aisle(b)) return false;
    return true;
  };
  // wall edges of a region: [{x, z, d, rot, wx, wz}] (wx,wz = point on the wall face)
  const edgeCache = new Map();
  const edges = (reg) => {
    if (edgeCache.has(reg)) return edgeCache.get(reg);
    const list = [];
    for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
      if (m.reg(x, z) !== reg || blockedCell(x, z)) continue;
      for (const d of DIRS) {
        if (m.edge(x, z, d) !== EDGE.WALL || reserved.has(m.edgeKey(x, z, d))) continue;
        const [cx, cz] = m.center(x, z);
        list.push({ x, z, d, rot: yawFor(-d.dx, -d.dz), wx: cx + d.dx * (CELL / 2 - wallOff), wz: cz + d.dz * (CELL / 2 - wallOff) });
      }
    }
    edgeCache.set(reg, list);
    return list;
  };
  const put = (type, x, z, rot, size) => { f.prop(type, x, z, rot, size); };
  const api = {
    // floor prop against a wall, its back to the wall
    wall(reg, type, w, d, h, rng, opt = {}) {
      const es = rng.shuffle([...edges(reg)]);
      for (const e of es) {
        for (const a of rng.shuffle([-0.95, 0.95, 0, -0.5, 0.5])) {
          const tx = e.d.dz, tz = e.d.dx;   // along the wall
          const off = d / 2 + 0.03;
          const x = e.wx - e.d.dx * off + tx * a, z = e.wz - e.d.dz * off + tz * a;
          if (Math.abs(a) + w / 2 > 1.48) continue;
          if (!ok(reg, x, z, w, d, e.rot, opt)) continue;
          put(type, x, z, e.rot + (opt.jitter ? rng.range(-0.15, 0.15) : 0), [w, d, h]);
          return [x, z];
        }
      }
      return null;
    },
    // floor prop on an interior cell corner
    free(reg, type, w, d, h, rng, opt = {}) {
      const cands = [];
      for (let z = 1; z < m.H; z++) for (let x = 1; x < m.W; x++) {
        if (![m.reg(x, z), m.reg(x - 1, z), m.reg(x, z - 1), m.reg(x - 1, z - 1)].every((q) => q === reg)) continue;
        cands.push([x * CELL, z * CELL]);
      }
      for (const [x, z] of rng.shuffle(cands)) {
        const rot = rng.range(0, 6.28);
        const px = x + rng.range(-0.2, 0.2), pz = z + rng.range(-0.2, 0.2);
        if (!ok(reg, px, pz, w, d, rot, opt)) continue;
        put(type, px, pz, rot, [w, d, h]);
        return [px, pz];
      }
      return null;
    },
    // wall piece (no collider): poster, extinguisher, camera …
    hang(reg, type, rng, opt = {}) {
      const es = rng.shuffle([...edges(reg)]);
      for (const e of es) {
        for (const a of type === 'pipe_bundle' ? [0] : rng.shuffle([0, -0.8, 0.8])) {
          const tx = e.d.dz, tz = e.d.dx;
          const x = e.wx + tx * a, z = e.wz + tz * a;
          if (hung.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < (opt.space || 1.2))) continue;
          if (out.props.some((p) => Math.hypot(p.x - x, p.z - z) < 1.1)) continue;
          if (out.lockers.some((L) => Math.hypot(L.x - x, L.z - z) < 1.0)) continue;
          if (doorPts.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 1.0)) continue;
          const probe = { minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 };
          if (out.colliders.some((c) => hit(probe, c) && (c.h || 1) > 1.2)) continue;
          hung.push([x, z]);
          f.prop(type, x, z, e.rot, null);
          return [x, z];
        }
      }
      return null;
    },
    // a lit KELUAR sign on a hall wall facing the way to the exit doors
    exitSign(ex) {
      const [ecx, ecz] = ex.cell;
      const cand = edges(0).filter((e) => Math.abs(e.x - ecx) + Math.abs(e.z - ecz) <= 3 && m.edgeKey(e.x, e.z, e.d) !== ex.key)
        .sort((a, b) => (Math.abs(a.x - ecx) + Math.abs(a.z - ecz)) - (Math.abs(b.x - ecx) + Math.abs(b.z - ecz)));
      for (const e of cand) {
        if (e.d.dx === ex.d.dx && e.d.dz === ex.d.dz) continue;   // not on the exit wall itself
        const x = e.wx, z = e.wz;
        if (out.lockers.some((L) => Math.hypot(L.x - x, L.z - z) < 1.0) || out.props.some((p) => Math.hypot(p.x - x, p.z - z) < 0.6)) continue;
        if (doorPts.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 0.8)) continue;
        f.prop('exit_sign', x, z, e.rot, null);
        hung.push([x, z]);
        return;
      }
    },
    // hall dressing: wall pieces every so often, a few floor props, with spacing
    halls(book, rng) {
      const es = rng.shuffle([...edges(0)]);
      const last = new Map();   // type -> placed points
      const far = (type, x, z, gap) => (last.get(type) || []).every(([a, b]) => Math.hypot(a - x, b - z) >= gap);
      const mark = (type, x, z) => { if (!last.has(type)) last.set(type, []); last.get(type).push([x, z]); };
      for (const e of es) {
        const roll = rng.next();
        if (roll < 0.34 && book.hang.length) {
          const [type, gap] = rng.pick(book.hang);
          if (!far(type, e.wx, e.wz, gap)) continue;
          const a = rng.pick([0, -0.8, 0.8]);
          const x = e.wx + e.d.dz * a, z = e.wz + e.d.dx * a;
          if (hung.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 2.5)) continue;
          if (out.props.some((q) => Math.hypot(q.x - x, q.z - z) < 1.1)) continue;
          if (out.lockers.some((L) => Math.hypot(L.x - x, L.z - z) < 1.0)) continue;
          if (doorPts.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 1.0)) continue;
          hung.push([x, z]); mark(type, x, z);
          f.prop(type, x, z, e.rot, null);
        } else if (roll < 0.46 && book.floor.length) {
          const [type, w, d, h, gap] = rng.pick(book.floor);
          const off = d / 2 + 0.03;
          // floor props sit towards a cell corner, clear of the wall centre
          // where the safety lockers go
          const a = rng.chance(0.5) ? 0.95 : -0.95;
          if (Math.abs(a) + w / 2 > 1.48) continue;
          const x = e.wx - e.d.dx * off + e.d.dz * a, z = e.wz - e.d.dz * off + e.d.dx * a;
          if (!far(type, x, z, gap) || ![...last.values()].flat().every(([p, q]) => Math.hypot(p - x, q - z) > 2.5)) continue;          if (!ok(0, x, z, w, d, e.rot)) continue;
          put(type, x, z, e.rot, [w, d, h]);
          mark(type, x, z);
        }
      }
    },
  };
  return api;
}
