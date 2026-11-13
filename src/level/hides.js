// Batch 19: hiding spots that belong to the room they are in.
// Furnishing still drops plain lockers (and stalls) wherever a room needs a
// place to hide; this pass, run once per floor after furnishing, turns them
// into whatever that room would really have: a wardrobe in the house, the
// teacher's desk in a classroom, a bed or a curtained bay in a ward, drawers
// in the morgue, crates in the store room, fitting rooms in a clothes shop…
// Counts stay about the same: a locker becomes one other spot, a converted
// piece of furniture replaces the room's locker, and only rooms that had no
// hiding place at all may gain one. Every candidate must stand against a
// real wall, keep clear of doors and other furniture, leave its front (where
// you climb out and where a resident stands to check it) free, and stay out
// of the walking lines through the cell centres (all depths <= 1.12 m).
import { CELL, WALL_T, HIDE } from '../config.js';
import { RNG } from '../util/rng.js';
import { DIRS, EDGE } from './map.js';
import { aabb, yawFor } from './generator.js';

const wallOff = WALL_T / 2;

// theme -> room type (or HALL) -> rule
//   swap: weighted kinds a locker may become ('locker' keeps it)
//   conv: [prop type, kind, chance, top] furniture that becomes the hiding spot
//   add:  kinds tried on a free wall when the room has no hiding spot
const OFFICE = { swap: [['filing', 3], ['wardrobe', 1], ['locker', 1]], conv: [['teacher_desk', 'desk', 0.45, 0.78]] };
const CLASS = { swap: [['filing', 2], ['wardrobe', 2], ['locker', 1]], conv: [['teacher_desk', 'desk', 0.5, 0.78]] };
const STORE = { swap: [['crate', 3], ['filing', 1]], add: ['crate'], addP: 0.5 };
const WARD = { swap: [['bed', 2], ['curtain', 2], ['laundry', 1]], conv: [['hospital_bed', 'bed', 0.35, 0.58]] };
const BASE = {
  kelas: CLASS, exhibit: CLASS, classroom: CLASS, studyhall: CLASS,
  guru: { swap: [['wardrobe', 2], ['filing', 2]] },
  kepsek: { swap: [['wardrobe', 2], ['filing', 1]], conv: [['teacher_desk', 'desk', 0.6, 0.78]] },
  office: OFFICE, library: { swap: [['filing', 3], ['wardrobe', 1]] }, lab: { swap: [['filing', 2], ['locker', 1]] },
  uks: { swap: [['bed', 2], ['curtain', 2]] }, kantin: { swap: [['crate', 2], ['wardrobe', 1]] },
  gym: { swap: [['locker', 2], ['crate', 1]] }, storage: STORE,
  hukuman: { swap: [['filing', 1], ['locker', 2]] },
  sel: { conv: [['cell_bunk', 'cot', 0.3, 0.47]] },
  ward: WARD, icu: WARD, igd: { swap: [['curtain', 3], ['laundry', 2]] },
  radiology: { swap: [['curtain', 2], ['filing', 1]] }, surgery: { swap: [['laundry', 2], ['curtain', 1]] },
  pharmacy: { add: ['filing'], addP: 0.6 }, morgue: { swap: [['morgue', 1]], add: ['morgue'], addP: 1 },
  house: { swap: [['wardrobe', 3]], conv: [['house_bed', 'bed', 0.3, 0.58]] },
  gallery: { add: ['crate', 'wardrobe'], addP: 0.25 }, vitrine: { add: ['crate'], addP: 0.25 }, statuehall: { add: ['crate'], addP: 0.2 },
  // mall shops (mall.js)
  mfash: { add: ['fitting'], addP: 0.7 }, mdept: { add: ['fitting', 'wardrobe'], addP: 1 },
  mhome: { add: ['wardrobe'], addP: 0.9 }, mkids: { add: ['photo'], addP: 0.5 }, marcade: { add: ['photo'], addP: 0.9 },
  mshoe: { add: ['crate'], addP: 0.3 }, moffice: { add: ['filing'], addP: 0.6 }, msecurity: { add: ['filing'], addP: 0.8 },
  mstore: { add: ['crate'], addP: 0.5 }, mlost: { add: ['crate'], addP: 0.6 }, mprojector: { add: ['crate'], addP: 0.5 },
  // poolrooms (pool.js)
  shower: { add: ['shower', 'shower'], addP: 0.9 }, cubicle: { add: ['shower'], addP: 0.35 }, jaga: { swap: [['cabin', 2], ['locker', 1]] },
  changing: { swap: [['locker', 3], ['cabin', 1]] },
};
const THEMES = {
  school: { HALL: { swap: [['locker', 6], ['filing', 1]] } },
  detention: { HALL: { swap: [['locker', 4], ['filing', 1]] }, office: OFFICE },
  hospital: { HALL: { swap: [['laundry', 3], ['locker', 2]] }, storage: { swap: [['laundry', 1], ['filing', 1]] }, office: { swap: [['filing', 2], ['locker', 1]] } },
  mall: { HALL: { swap: [['locker', 3], ['photo', 2]] } },
  pool: { HALL: { swap: [['locker', 3], ['cabin', 2], ['shower', 1]] }, restroom: { add: ['shower'], addP: 0.4 } },
  museum: { HALL: { swap: [['crate', 3], ['locker', 2], ['wardrobe', 1]] }, storage: { swap: [['crate', 1]], add: ['crate'], addP: 0.6 } },
  backroom: { HALL: { swap: [['filing', 2], ['wardrobe', 2], ['crate', 1], ['locker', 1]] } },
};
const THEME_OF = { school: 'school', detention: 'detention', hospital: 'hospital', mall: 'mall', poolrooms: 'pool', museum: 'museum' };

function pickW(rng, list) {
  const tot = list.reduce((a, [, w]) => a + w, 0);
  let t = rng.next() * tot;
  for (const [k, w] of list) { t -= w; if (t <= 0) return k; }
  return list[list.length - 1][0];
}

export function varyHides(f, def, seed = 0) {
  const theme = def.layout === 'endless' ? (def.style || 'school') : (THEME_OF[def.layout] || 'school');
  const rules = { ...BASE, ...(THEMES[theme] || {}) };
  const rng = new RNG((seed * 7 + 19 + f.k * 1013) >>> 0);
  const m = f.map, out = f.out;
  const roomOf = (x, z) => { const id = m.reg(...m.cellOf(x, z)); return id; };
  const rooms = new Map(out.rooms.map((r) => [r.id, r]));
  const doors = [...m.doors.values()];
  const same = (c, x, z) => Math.abs((c.minX + c.maxX) / 2 - x) < 1e-3 && Math.abs((c.minZ + c.maxZ) / 2 - z) < 1e-3;
  const hit = (a, b, pad = 0.02) => a.minX < b.maxX - pad && a.maxX > b.minX + pad && a.minZ < b.maxZ - pad && a.maxZ > b.minZ + pad;
  const inside = (c, x, z) => x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ;

  // can a spot of `kind` stand with its back on the wall at (wx, wz), facing n?
  // `ignore` = colliders that are about to go away
  function fits(kind, wx, wz, n, region, ignore) {
    const h = HIDE[kind], rot = yawFor(n[0], n[1]);
    const x = wx + n[0] * h.wall, z = wz + n[1] * h.wall;
    const box = aabb(x, z, h.size[0], h.size[1], rot);
    const t = [n[1], -n[0]];             // along the wall
    const half = h.size[0] / 2;
    // the whole back must be against a solid wall of the same region
    for (let s = -half + 0.08; s <= half - 0.08 + 1e-6; s += Math.max(0.2, half - 0.08)) {
      const px = wx + t[0] * s + n[0] * 0.3, pz = wz + t[1] * s + n[1] * 0.3;
      const [cx, cz] = m.cellOf(px, pz);
      if (m.reg(cx, cz) !== region) return null;
      const d = DIRS.find((q) => q.dx === -Math.round(n[0]) && q.dz === -Math.round(n[1]));
      if (m.edge(cx, cz, d) !== EDGE.WALL) return null;
    }
    // footprint corners in the region too
    for (const [px, pz] of [[box.minX + 0.05, box.minZ + 0.05], [box.maxX - 0.05, box.minZ + 0.05], [box.minX + 0.05, box.maxZ - 0.05], [box.maxX - 0.05, box.maxZ - 0.05]]) if (roomOf(px, pz) !== region) return null;
    for (const d of doors) {
      const dx = Math.max(box.minX - d.x, 0, d.x - box.maxX), dz = Math.max(box.minZ - d.z, 0, d.z - box.maxZ);
      if (dx * dx + dz * dz < 1.0) return null;
    }
    for (const c of out.colliders) if (!ignore.includes(c) && hit(box, c)) return null;
    // room to climb out and for a resident to stand and listen
    for (const dist of [h.exit, h.inspect]) {
      const px = x + n[0] * dist, pz = z + n[1] * dist;
      if (m.reg(...m.cellOf(px, pz)) < 0) return null;
      for (const c of out.colliders) if (!ignore.includes(c) && (inside(c, px, pz) || hit(c, { minX: px - 0.25, maxX: px + 0.25, minZ: pz - 0.25, maxZ: pz + 0.25 }, 0))) return null;
    }
    for (const L of out.lockers) if (!ignore.includes(L) && Math.hypot(L.x - x, L.z - z) < 0.3) return null;
    return { x, z, rot, box };
  }
  // axis-aligned wall behind a spot centred at (x, z) facing rot, or null
  function wallBehind(x, z, rot, wallDist) {
    const n = [Math.round(Math.sin(rot) * 1e3) / 1e3, Math.round(Math.cos(rot) * 1e3) / 1e3];
    if (Math.abs(Math.abs(n[0]) + Math.abs(n[1]) - 1) > 1e-2) return null;
    const nn = [Math.round(n[0]), Math.round(n[1])];
    let wx = x - nn[0] * wallDist, wz = z - nn[1] * wallDist;
    const e = nn[0] ? wx - nn[0] * wallOff : wz - nn[1] * wallOff;   // the cell edge
    if (Math.abs(e / CELL - Math.round(e / CELL)) * CELL > 0.06) return null;
    // snap onto the wall face (hall lockers stand a little off it)
    if (nn[0]) wx = Math.round(e / CELL) * CELL + nn[0] * wallOff; else wz = Math.round(e / CELL) * CELL + nn[1] * wallOff;
    return { wx, wz, n: nn };
  }
  const place = (kind, p) => {
    const L = { kind, x: p.x, z: p.z, rot: p.rot };
    out.lockers.push(L);
    out.colliders.push(aabb(p.x, p.z, HIDE[kind].size[0], HIDE[kind].size[1], p.rot));
    return L;
  };
  const remove = (L) => {
    out.lockers.splice(out.lockers.indexOf(L), 1);
    const h = HIDE[L.kind];
    const i = out.colliders.findIndex((c) => same(c, L.x, L.z) && Math.abs((c.maxX - c.minX) - aabb(0, 0, h.size[0], h.size[1], L.rot).maxX * 2) < 0.05);
    if (i >= 0) out.colliders.splice(i, 1);
  };
  const ownCollider = (L) => out.colliders.filter((c) => same(c, L.x, L.z));

  // 1. lockers become what the room would have
  const byRegion = new Map();
  for (const L of out.lockers.slice()) {
    const reg = roomOf(L.x, L.z);
    if (!byRegion.has(reg)) byRegion.set(reg, []);
    byRegion.get(reg).push(L);
    if (L.kind !== 'locker') continue;
    const r = rooms.get(reg), rule = reg === 0 ? rules.HALL : r && rules[r.type];
    if (!rule || !rule.swap) continue;
    const kind = pickW(rng, rule.swap);
    if (kind === 'locker') continue;
    const w = wallBehind(L.x, L.z, L.rot, HIDE.locker.wall);
    if (!w) continue;
    const ign = [L, ...ownCollider(L)];
    const p = fits(kind, w.wx, w.wz, w.n, reg, ign);
    if (!p) continue;
    remove(L);
    const L2 = place(kind, p);
    const lst = byRegion.get(reg); lst[lst.indexOf(L)] = L2;
  }

  // 2. furniture that turns into the hiding spot, and rooms that had none
  for (const r of out.rooms) {
    const rule = rules[r.type];
    if (!rule) continue;
    const mine = byRegion.get(r.id) || [];
    for (const [type, kind, chance, top] of rule.conv || []) {
      if (!rng.chance(chance)) continue;
      const cands = out.props.filter((p) => p.type === type && !(p.y > 0.05) && roomOf(p.x, p.z) === r.id);
      rng.shuffle(cands);
      for (const pr of cands) {
        // the wall the piece stands against: the nearest room side
        const x0 = r.x0 * CELL, z0 = r.z0 * CELL, x1 = (r.x1 + 1) * CELL, z1 = (r.z1 + 1) * CELL;
        const sides = [[pr.x - x0, [1, 0]], [x1 - pr.x, [-1, 0]], [pr.z - z0, [0, 1]], [z1 - pr.z, [0, -1]]].sort((a, b) => a[0] - b[0]);
        const [dist, n] = sides[0];
        if (dist > 1.4) continue;
        const wx = pr.x - n[0] * (dist - wallOff), wz = pr.z - n[1] * (dist - wallOff);
        const own = out.colliders.filter((c) => same(c, pr.x, pr.z));
        const old = mine.find((L) => L.kind === 'locker' || L.kind === 'filing' || L.kind === 'wardrobe');
        const ign = [...own, ...(old ? [old, ...ownCollider(old)] : [])];
        const p = fits(kind, wx, wz, n, r.id, ign);
        if (!p) continue;
        out.props.splice(out.props.indexOf(pr), 1);
        for (const c of own) out.colliders.splice(out.colliders.indexOf(c), 1);
        if (old) { remove(old); mine.splice(mine.indexOf(old), 1); }
        mine.push(place(kind, p));
        if (top) for (const s of r.spots) if (s[1] > 0.1 && Math.hypot(s[0] - pr.x, s[2] - pr.z) < 1.1) s[1] = top;
        break;
      }
    }
    if (rule.add && !mine.length && rng.chance(rule.addP ?? 0.5)) {
      for (const kind of rule.add) {
        const p = freeWall(r, kind);
        if (p) mine.push(place(kind, p));
      }
    }
    byRegion.set(r.id, mine);
  }

  // a free stretch of solid wall in room r for a spot of `kind`
  function freeWall(r, kind) {
    const x0 = r.x0 * CELL, z0 = r.z0 * CELL, x1 = (r.x1 + 1) * CELL, z1 = (r.z1 + 1) * CELL;
    const walls = rng.shuffle([
      [[x0 + wallOff, null], [1, 0]], [[x1 - wallOff, null], [-1, 0]], [[null, z0 + wallOff], [0, 1]], [[null, z1 - wallOff], [0, -1]],
    ]);
    const half = HIDE[kind].size[0] / 2;
    for (const [[fx, fz], n] of walls) {
      const len = fx !== null ? z1 - z0 : x1 - x0;
      // stay off the walking lines that run into the wall (u = 1.5, 4.5 …) when the piece is narrow
      const us = [];
      for (let u = half + 0.15; u <= len - half - 0.15 + 1e-6; u += 0.25) us.push(u);
      rng.shuffle(us);
      for (const u of us) {
        const wx = fx !== null ? fx : x0 + u, wz = fz !== null ? fz : z0 + u;
        const p = fits(kind, wx, wz, n, r.id, []);
        if (p) return p;
      }
    }
    return null;
  }
}
