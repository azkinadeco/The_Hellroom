// Built architecture on top of the bare wall/floor/ceiling shell: skirting,
// chair rails and cornices, arcades with columns and lintels round openings,
// pilasters and beams across corridors, coffered / beamed ceilings, ducts and
// conduit in service areas, slab edges round voids, fake windows on outside
// walls, storefront canopies, door vents (roster) and the main entrance.
// Everything is merged into two vertex-coloured meshes per floor (matte +
// glossy) with light baked per vertex from the floor's LightField.
//
// Each level picks a style with `def.arch` (a name from ARCH_STYLES or an
// object { base: 'name', ...overrides }); missing fields fall back to DEFAULT.
import * as THREE from 'three';
import { CELL, WALL_H, WALL_T, DOOR_W, DOOR_H } from '../config.js';
import { DIRS, EDGE, VOID } from './map.js';
import { bakeMaterial } from '../render/bake.js';

const SRC = new THREE.MeshLambertMaterial({ vertexColors: true }); SRC.name = 'ArchVC';
const SRC_G = new THREE.MeshLambertMaterial({ vertexColors: true }); SRC_G.name = 'ArchGloss'; SRC_G.userData.gloss = 0.6;

// height of the painted dado line in each wall texture (where a chair rail sits)
const DADO = { wall_classroom: 1.235, wall_hall: 1.235, hosp_wall: 1.235, cell_wall: 1.105 };
// surfaces that never get trims
const BARE_TEX = new Set(['forest_wall', 'lift_wall']);
const BARE_ROOMS = new Set(['stairs', 'lift', 'forest', 'street']);

// ---------------------------------------------------------------------------
// styles. Colours are hex; sizes in metres.
const DEFAULT = {
  skirt: { h: 0.1, d: 0.016, c: 0x3b342c },
  rail: null,                       // chair rail on the texture's dado line { h, d, c }
  cornice: [{ h: 0.07, d: 0.045, c: 0xd6d0c2 }],     // stacked from the ceiling down
  opening: { jw: 0.34, jd: 0.05, hh: 0.3, c: 0xcfc8b6, col: 0.4, colEvery: 1, round: false, profile: 'box' },
  beams: null,                      // corridor beams { every, h, w, c, pw, pd }
  ceiling: null,                    // room ceilings { kind: 'coffer'|'beams', minCells, h, w, c, types }
  voidCols: null,                   // columns round voids { size, every, c, profile }
  slab: { c: 0xc9c2b2, d: 0.07 },   // nosing bands on slab edges over voids
  windows: null,                    // { kind: 'dark'|'frosted'|'barred'|'blocks', every }
  ducts: null,                      // { halls: bool, rooms: [types], c }
  conduit: null,                    // { c }
  roster: false,                    // vent blocks over doors
  guards: null,                     // corner guards { c, h }
  bumper: null,                     // bed bumper rails { types, y, h, c }
  fillets: null,                    // rounded inner corners { c, f }
  canopy: null,                     // storefront canopies { c, light }
  soffit: null,                     // service bulkhead along corridor walls { w, h, c }
  portal: { c: 0x5b5249, w: 0.26 }, // main entrance surround
};
export const ARCH_STYLES = {
  school: {
    skirt: { h: 0.14, d: 0.02, c: 0x4a2e19 },
    rail: { h: 0.05, d: 0.022, c: 0x27412f },
    cornice: [{ h: 0.08, d: 0.05, c: 0xe2dccb }],
    opening: { jw: 0.36, jd: 0.05, hh: 0.34, c: 0xd9d2bf, col: 0.42, colEvery: 1, profile: 'box', base: 0x6c675c },
    beams: { every: 2, h: 0.32, w: 0.3, c: 0xddd6c3, pw: 0.34, pd: 0.06 },
    ceiling: { kind: 'beams', minCells: 6, h: 0.3, w: 0.28, c: 0xddd6c3, types: ['kelas', 'guru', 'library', 'lab', 'kantin', 'gym', 'office', 'kepsek', 'uks'] },
    voidCols: { size: 0.42, every: 2, c: 0xd9d2bf, profile: 'box', base: 0x6c675c },
    slab: { c: 0xd9d2bf, d: 0.08, band: 0x2f4a36 },
    roster: true,
    windows: { kind: 'dark', every: 2, frame: 0x3d4a3a },
  },
  hospital: {
    skirt: { h: 0.1, d: 0.014, c: 0x355246 },
    rail: null,
    cornice: [{ h: 0.06, d: 0.035, c: 0xe4e6dc }],
    opening: { jw: 0.3, jd: 0.04, hh: 0.28, c: 0xe2e4da, col: 0.38, colEvery: 2, profile: 'box', base: 0x3c5a4d },
    beams: { every: 3, h: 0.36, w: 0.5, c: 0xdfe1d8, pw: 0.3, pd: 0.05 },
    voidCols: { size: 0.4, every: 2, c: 0xdfe1d8, profile: 'box', base: 0x3c5a4d },
    slab: { c: 0xdfe1d8, d: 0.07, band: 0x5f8a75 },
    windows: { kind: 'frosted', every: 1, frame: 0xc9cdc8 },
    ducts: { halls: false, rooms: ['storage', 'morgue', 'radiology', 'pharmacy'], c: 0x9da3a3 },
    guards: { c: 0xb8bcb6, h: 1.5 },
    soffit: { w: 0.42, h: 0.2, c: 0xe2e4da },
    bumper: { types: ['ward', 'icu', 'igd', 'surgery'], y: 0.78, h: 0.14, c: 0xc9b98f },
  },
  detention: {
    skirt: { h: 0.24, d: 0.025, c: 0x5d605a },
    rail: { h: 0.07, d: 0.03, c: 0x777a72 },
    cornice: [{ h: 0.12, d: 0.06, c: 0x8a8c84 }],
    opening: { jw: 0.36, jd: 0.06, hh: 0.36, c: 0x84867e, col: 0.36, colEvery: 2, profile: 'steel', steel: 0x3a3d3f },
    beams: { every: 2, h: 0.4, w: 0.32, c: 0x8a8c84, pw: 0.34, pd: 0.07 },
    ceiling: { kind: 'beams', minCells: 6, h: 0.36, w: 0.3, c: 0x8a8c84, types: null },
    voidCols: { size: 0.36, every: 2, c: 0x3a3d3f, profile: 'steel' },
    slab: { c: 0x7f827a, d: 0.1, band: 0x45484a },
    windows: { kind: 'barred', every: 2, frame: 0x6a6d68 },
    ducts: { halls: true, rooms: ['storage', 'hukuman'], c: 0x6d7275 },
    conduit: { c: 0x8d9294 },
  },
  mall: {
    skirt: { h: 0.1, d: 0.014, c: 0xb9bcbd, gloss: true },
    cornice: [{ h: 0.05, d: 0.03, c: 0xd9d4c8 }],
    opening: { jw: 0.3, jd: 0.05, hh: 0.45, c: 0xd8d2c6, col: 0.6, colEvery: 2, profile: 'banded', band: 0xc0c4c6 },
    beams: { every: 2, h: 0.34, w: 0.3, c: 0xa9aaa4, pw: 0.3, pd: 0.05 },
    voidCols: { size: 0.6, every: 2, c: 0xd3ccbf, profile: 'banded', band: 0xa9adaf },
    slab: { c: 0xe7e1d5, d: 0.08, band: 0xb9bcbd, gloss: true },
    ducts: { halls: true, narrow: true, rooms: [], c: 0x8f9394 },
    canopy: { c: 0x2f3133, under: 0x1d1e1f, light: 0xfff4dc },
  },
  pool: {
    skirt: { h: 0.17, d: 0.03, c: 0x5aa6b8 },
    cornice: [{ h: 0.06, d: 0.03, c: 0xe6ecee }],
    opening: { jw: 0.36, jd: 0.05, hh: 0.3, c: 0xd8dfe1, col: 0.5, colEvery: 2, profile: 'tiled', band: 0x4d97a8 },
    voidCols: { size: 0.5, every: 2, c: 0xd2dadc, profile: 'tiled', band: 0x4d97a8 },
    slab: { c: 0xe9eef0, d: 0.08, band: 0x5aa6b8 },
    windows: { kind: 'blocks', every: 2, frame: 0xd8dfe1 },
    fillets: { c: 0xe4eaec, f: 0.16 },
  },
  museum: {
    skirt: { h: 0.24, d: 0.03, c: 0x2c211b },
    rail: null,
    cornice: [{ h: 0.07, d: 0.11, c: 0xd9d1bd }, { h: 0.06, d: 0.07, c: 0xc8bea6 }, { h: 0.05, d: 0.035, c: 0xb9ae94 }],
    opening: { jw: 0.42, jd: 0.07, hh: 0.24, c: 0xd9d1bd, col: 0.5, colEvery: 1, round: true, profile: 'classical', base: 0xc8bea6 },
    beams: { every: 2, h: 0.26, w: 0.36, c: 0xd9d1bd, pw: 0.4, pd: 0.07 },
    ceiling: { kind: 'coffer', minCells: 6, h: 0.26, w: 0.34, c: 0xd9d1bd, types: null },
    voidCols: { size: 0.5, every: 2, c: 0xd9d1bd, profile: 'classical', base: 0xc8bea6 },
    slab: { c: 0xd9d1bd, d: 0.12, band: 0x8a7a5a },
    portal: { c: 0xc8bea6, w: 0.34 },
  },
  backroom: {
    skirt: { h: 0.09, d: 0.012, c: 0x8a7a4a },
    cornice: null,
    opening: null,
    slab: { c: 0xc9b98a, d: 0.05 },
  },
};
export function archStyle(def) {
  let a = def.arch;
  if (typeof a === 'string') a = { base: a };
  a = a || { base: def.theme === 'mall' ? 'mall' : def.theme === 'pool' ? 'pool' : def.theme === 'backroom' ? 'backroom' : null };
  return { ...DEFAULT, ...(ARCH_STYLES[a.base] || {}), ...a };
}

// ---------------------------------------------------------------------------
const COL = new Map();
const colOf = (hex) => { if (!COL.has(hex)) COL.set(hex, new THREE.Color(hex)); return COL.get(hex); };
const SHADE = { f: 1, b: 0.8, t: 1.12, d: 0.58, l: 0.84, r: 0.84 };

class Mesher {
  constructor() { this.p = []; this.n = []; this.c = []; this.b = []; this.i = []; }
  // quad a-b-c-d (any winding: it is flipped to face n). bk: [s, f] per corner
  quad(a, b, c, d, n, col, bk, shade = 1, minB = 0) {
    const o = this.p.length / 3;
    const pts = [a, b, c, d];
    for (let k = 0; k < 4; k++) {
      const v = pts[k], q = bk[k] || bk[0];
      this.p.push(v[0], v[1], v[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col.r, col.g, col.b);
      this.b.push(Math.max(minB, q[0] * shade), q[1] * shade);
    }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
    else this.i.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  // axis-aligned box in a local frame F {o:[x,z], t:[x,z], n:[x,z]}:
  // s along t, u along n, y up. bk: [s,f] or (s) => [s,f]. mask: faces to emit
  // f(+n) b(-n) t(+y) d(-y) l(-t) r(+t)
  box(F, s0, s1, u0, u1, y0, y1, hex, bk, mask = 'fbtdlr', minB = 0) {
    const col = colOf(hex);
    const P = (s, u, y) => [F.o[0] + F.t[0] * s + F.n[0] * u, y, F.o[1] + F.t[1] * s + F.n[1] * u];
    const B = typeof bk === 'function' ? bk : () => bk;
    const nT = [F.t[0], 0, F.t[1]], nN = [F.n[0], 0, F.n[1]];
    const b0 = B(s0), b1 = B(s1);
    for (const f of mask) {
      const sh = SHADE[f];
      if (f === 'f') this.quad(P(s0, u1, y0), P(s1, u1, y0), P(s1, u1, y1), P(s0, u1, y1), nN, col, [b0, b1, b1, b0], sh, minB);
      else if (f === 'b') this.quad(P(s0, u0, y0), P(s1, u0, y0), P(s1, u0, y1), P(s0, u0, y1), [-nN[0], 0, -nN[2]], col, [b0, b1, b1, b0], sh, minB);
      else if (f === 't') this.quad(P(s0, u0, y1), P(s1, u0, y1), P(s1, u1, y1), P(s0, u1, y1), [0, 1, 0], col, [b0, b1, b1, b0], sh, minB);
      else if (f === 'd') this.quad(P(s0, u0, y0), P(s1, u0, y0), P(s1, u1, y0), P(s0, u1, y0), [0, -1, 0], col, [b0, b1, b1, b0], sh, minB);
      else if (f === 'l') this.quad(P(s0, u0, y0), P(s0, u1, y0), P(s0, u1, y1), P(s0, u0, y1), [-nT[0], 0, -nT[2]], col, [b0, b0, b0, b0], sh, minB);
      else if (f === 'r') this.quad(P(s1, u0, y0), P(s1, u1, y0), P(s1, u1, y1), P(s1, u0, y1), nT, col, [b1, b1, b1, b1], sh, minB);
    }
  }
  get tris() { return this.i.length / 3; }
  mesh(src) {
    if (!this.i.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('bake', new THREE.Float32BufferAttribute(this.b, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, bakeMaterial(src, 'attr'));
    m.matrixAutoUpdate = false;
    m.name = src.name;
    return m;
  }
}
const XZ = {   // world-axis frames at a point
  x: (o) => ({ o, t: [1, 0], n: [0, 1] }),
  z: (o) => ({ o, t: [0, 1], n: [-1, 0] }),
};

// ---------------------------------------------------------------------------
export function buildArchitecture({ map, gen, def, field, roomById, openAbove, noFloor, noCeil, FH, texFor }) {
  if (typeof window !== 'undefined' && window.__noArch) return { meshes: [], tris: 0 };
  const S = archStyle(def);
  const W = map.W, H = map.H;
  const M = new Mesher(), G = new Mesher();
  const mat = (o) => (o && o.gloss ? G : M);
  const isSpace = (r) => r >= 0 || r === VOID;
  const isSolid = (x, z, d) => { const e = map.edge(x, z, d); return e === EDGE.WALL || e === EDGE.DOOR; };
  const roomOf = (x, z) => roomById.get(map.reg(x, z));
  const typeAt = (x, z) => { const r = roomOf(x, z); return r ? r.type : null; };
  const ceilAt = (x, z) => { if (!map.inside(x, z)) return false; const i = x + z * W; return isSpace(map.reg(x, z)) && !openAbove[i] && !noCeil[i]; };
  const bare = (x, z) => BARE_ROOMS.has(typeAt(x, z)) || BARE_TEX.has(texFor(map.reg(x, z), 'wall'));
  const fixtures = (gen.lights || []).filter((l) => l.fixture !== 'none' && !l.tall)
    .concat(gen.props.filter((p) => (p.y || 0) >= 2.5 && /fan|lamp|chandelier/.test(p.type)).map((p) => ({ x: p.x, z: p.z, big: true })));
  const nearLight = (x, z, r) => fixtures.some((l) => { const q = l.big ? r + 0.3 : r; return Math.abs(l.x - x) < q && Math.abs(l.z - z) < q; });
  // baked light, cached on a 5 cm lattice
  const bc = new Map();
  const bake = (x, y, z, n = null, hint = null) => {
    const k = Math.round(x * 20) + ',' + Math.round(y * 20) + ',' + Math.round(z * 20) + (n ? ',' + n[0] + n[1] : '');
    let v = bc.get(k);
    if (!v) { v = n ? field.sample(x, Math.min(y, WALL_H), z, n[0], 0, n[1], hint) : field.sample(x, Math.min(y, WALL_H - 0.05), z, null, null, null, hint); bc.set(k, v); }
    return v;
  };
  // anything standing at a point that a column must not swallow
  const blockedAt = (px, pz, r) => {
    if (gen.props.some((p) => Math.abs(p.x - px) < r && Math.abs(p.z - pz) < r)) return true;
    if ((gen.items || []).some((p) => Math.abs(p.x - px) < r + 0.3 && Math.abs(p.z - pz) < r + 0.3)) return true;
    if ((gen.lockers || []).some((p) => Math.abs(p.x - px) < r + 0.3 && Math.abs(p.z - pz) < r + 0.3)) return true;
    return (gen.colliders || []).some((c) => px + r > c.minX && px - r < c.maxX && pz + r > c.minZ && pz - r < c.maxZ);
  };
  const newColliders = [], colPts = new Set();
  const pillarAt = (px, pz) => gen.props.some((p) => /pillar/.test(p.type) && Math.abs(p.x - px) < 0.4 && Math.abs(p.z - pz) < 0.4);
  const solidCol = (px, pz, h) => { newColliders.push({ minX: px - h, maxX: px + h, minZ: pz - h, maxZ: pz + h, h: 3, arch: true }); };

  // ---------- outside: solid cells reachable from the map border ----------
  const outside = new Uint8Array(W * H);
  {
    const q = [];
    for (let x = 0; x < W; x++) for (const z of [0, H - 1]) if (map.reg(x, z) === -1 && !outside[x + z * W]) { outside[x + z * W] = 1; q.push(x + z * W); }
    for (let z = 0; z < H; z++) for (const x of [0, W - 1]) if (map.reg(x, z) === -1 && !outside[x + z * W]) { outside[x + z * W] = 1; q.push(x + z * W); }
    for (let i = 0; i < q.length; i++) {
      const x = q[i] % W, z = (q[i] / W) | 0;
      for (const d of DIRS) {
        const nx = x + d.dx, nz = z + d.dz, j = nx + nz * W;
        if (map.inside(nx, nz) && map.reg(nx, nz) === -1 && !outside[j]) { outside[j] = 1; q.push(j); }
      }
    }
  }

  // ---------- wall faces (same split as the wall builder) ----------
  const faces = [];
  const perp = (d) => DIRS.filter((t) => t.dx * d.dx + t.dz * d.dz === 0);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const r = map.reg(x, z), i = x + z * W;
    if (r < 0) continue;
    const c = map.center(x, z);
    for (const d of DIRS) {
      const e = map.edge(x, z, d);
      if (e !== EDGE.WALL && e !== EDGE.DOOR && e !== EDGE.GLASS) continue;
      const n = [-d.dx, -d.dz], t = [n[1], -n[0]];   // tan = up x normal
      const off = CELL / 2 - WALL_T / 2;
      const o = [c[0] + d.dx * off, c[1] + d.dz * off];
      const f = { x, z, r, i, d, n, t, o, c, F: { o, t, n }, a: -CELL / 2, b: CELL / 2, ext: [false, false], inner: [false, false], glass: e === EDGE.GLASS };
      for (const q of perp(d)) {
        const end = q.dx * t[0] + q.dz * t[1] > 0 ? 1 : 0;
        const extend = !isSolid(x, z, q) && !isSolid(x + q.dx, z + q.dz, d) && isSpace(map.reg(x + q.dx, z + q.dz));
        if (extend) { f.ext[end] = true; if (end) f.b = CELL / 2 + WALL_T / 2; else f.a = -CELL / 2 - WALL_T / 2; }
        if (isSolid(x, z, q)) f.inner[end] = true;
      }
      const k = map.edgeKey(x, z, d);
      f.door = map.doors.get(k) || null;
      f.exit = k === map.exitKey;
      f.hole = f.door ? DOOR_W / 2 + 0.085 : f.exit ? 1.0 + 0.085 : 0;
      f.top = openAbove[i] ? FH : WALL_H;
      f.tex = texFor(r, 'wall');
      f.bare = bare(x, z) || r === VOID;
      f.floor = !noFloor[i];
      f.ceil = ceilAt(x, z);
      f.alongX = Math.abs(t[0]) > 0.5;
      f.nb = map.reg(x + d.dx, z + d.dz);
      f.outside = f.nb === -1 && outside[(x + d.dx) + (z + d.dz) * W];
      // light at the two ends, matching the wall's own bake
      f.bk = (y) => { const A = bake(o[0] + t[0] * f.a, y, o[1] + t[1] * f.a, n, c), B = bake(o[0] + t[0] * f.b, y, o[1] + t[1] * f.b, n, c); return (s) => { const w = (s - f.a) / (f.b - f.a); return [A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w]; }; };
      faces.push(f);
    }
  }
  const CS = CELL / 2 - WALL_T / 2;   // inner corner, from the cell centre line
  // a horizontal moulding run along a face between heights y0..y1, depth dep
  const strip = (f, y0, y1, dep, hex, gloss = false, cut = true) => {
    let s0 = f.a, s1 = f.b;
    if (f.ext[0]) s0 = f.a - (f.alongX ? dep : 0); else if (f.inner[0]) s0 = -CS + (f.alongX ? 0 : dep);
    if (f.ext[1]) s1 = f.b + (f.alongX ? dep : 0); else if (f.inner[1]) s1 = CS - (f.alongX ? 0 : dep);
    const bk = f.bk((y0 + y1) / 2);
    const holed = cut && f.hole && y0 < DOOR_H + 0.3;
    const spans = holed ? [[s0, -f.hole, f.ext[0], true], [f.hole, s1, true, f.ext[1]]] : [[s0, s1, f.ext[0], f.ext[1]]];
    // only the faces that can be seen: never the one on the floor / ceiling,
    // end caps only at free wall ends and door openings
    const base = 'f' + (y1 < WALL_H - 0.001 ? 't' : '') + (y0 > 0.001 ? 'd' : '');
    for (const [a, b, ca, cb] of spans) if (b - a > 0.02) (gloss ? G : M).box(f.F, a, b, 0, dep, y0, y1, hex, bk, base + (ca ? 'l' : '') + (cb ? 'r' : ''));
  };

  // ---------- skirting, chair rail, cornice, wall details ----------
  for (const f of faces) {
    if (f.bare) continue;
    const ty = typeAt(f.x, f.z);
    if (f.glass) {   // shop window: only the header above it has a cornice
      if (S.cornice && f.ceil) { let y = WALL_H; for (const c of S.cornice) { strip(f, y - c.h, y, c.d, c.c, false, false); y -= c.h; } }
      continue;
    }
    if (S.skirt && f.floor) strip(f, 0, S.skirt.h, S.skirt.d, S.skirt.c, S.skirt.gloss);
    const dado = DADO[f.tex];
    if (S.rail && dado && f.floor) strip(f, dado - S.rail.h / 2, dado + S.rail.h / 2, S.rail.d, S.rail.c);
    if (S.bumper && S.bumper.types.includes(ty) && f.floor) strip(f, S.bumper.y, S.bumper.y + S.bumper.h, 0.03, S.bumper.c);
    if (S.cornice && f.ceil && f.top === WALL_H) { let y = WALL_H; for (const c of S.cornice) { strip(f, y - c.h, y, c.d, c.c, false, false); y -= c.h; } }
    if (S.soffit && f.r === 0 && f.ceil && f.top === WALL_H) {
      strip(f, WALL_H - S.soffit.h, WALL_H, S.soffit.w, S.soffit.c, false, false);
      strip(f, WALL_H - S.soffit.h - 0.03, WALL_H - S.soffit.h, S.soffit.w + 0.02, 0xc9ccc2, false, false);
    }
    if (S.conduit && f.r === 0 && f.ceil && !f.exit) {
      strip(f, 2.64, 2.68, 0.045, S.conduit.c, false, false);
      if ((f.x + f.z) % 2 === 0) M.box(f.F, -0.07, 0.07, 0, 0.07, 2.58, 2.72, S.conduit.c, f.bk(2.65), 'ftdlr');
    }
    // corner guards on outside corners
    if (S.guards && f.floor) for (const end of [0, 1]) {
      if (!f.ext[end]) continue;
      const e = end ? f.b : f.a, sg = end ? 1 : -1, ov = f.alongX ? 0.014 : 0;
      M.box(f.F, Math.min(e - sg * 0.075, e + sg * ov), Math.max(e - sg * 0.075, e + sg * ov), 0, 0.014, 0.12, S.guards.h, S.guards.c, f.bk(1), 'ftlr');
    }
    // rounded inner corners
    if (S.fillets && f.alongX) for (const end of [0, 1]) {
      if (!f.inner[end]) continue;
      const sg = end ? 1 : -1, ff = S.fillets.f;
      // the other wall at this corner: its normal is -t*sg
      const A = [f.o[0] + f.t[0] * sg * (CS - ff), f.o[1] + f.t[1] * sg * (CS - ff)];
      const B = [f.o[0] + f.t[0] * sg * CS + f.n[0] * ff, f.o[1] + f.t[1] * sg * CS + f.n[1] * ff];
      const nn = [f.n[0] - f.t[0] * sg, 0, f.n[1] - f.t[1] * sg].map((v) => v * Math.SQRT1_2);
      const y1 = f.ceil ? WALL_H : f.top;
      const bk = bake((A[0] + B[0]) / 2, 1.4, (A[1] + B[1]) / 2, null, f.c);
      M.quad([A[0], 0, A[1]], [B[0], 0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], nn, colOf(S.fillets.c), [bk], 1);
    }
  }

  // ---------- doors: vent blocks above, main entrance surround ----------
  for (const f of faces) {
    if (f.bare || f.glass) continue;
    if (S.roster && f.door && f.ceil) {
      const bk = f.bk(2.75), y0 = 2.6, y1 = 2.92, w = 0.58;
      M.box(f.F, -w, w, 0, 0.004, y0, y1, 0x16130f, bk, 'f');
      M.box(f.F, -w - 0.05, w + 0.05, 0, 0.035, y0 - 0.05, y0, 0xd9d2bf, bk, 'ftdlr');
      M.box(f.F, -w - 0.05, w + 0.05, 0, 0.035, y1, y1 + 0.04, 0xd9d2bf, bk, 'fdlr');
      for (const s of [-1, 1]) M.box(f.F, s > 0 ? w : -w - 0.05, s > 0 ? w + 0.05 : -w, 0, 0.035, y0, y1, 0xd9d2bf, bk, 'flr');
      for (let s = -w + 0.13; s < w - 0.05; s += 0.145) M.box(f.F, s - 0.022, s + 0.022, 0, 0.03, y0, y1, 0xcdc6b2, bk, 'flr');
      M.box(f.F, -w, w, 0, 0.03, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, 0xcdc6b2, bk, 'ftd');
    }
    if (f.exit && S.portal) {
      const p = S.portal, bk = f.bk(1.4), x0 = 1.1, x1 = x0 + p.w;
      for (const s of [-1, 1]) {
        M.box(f.F, s > 0 ? x0 : -x1, s > 0 ? x1 : -x0, 0, 0.09, 0, 2.5, p.c, bk, 'ftlr');
        M.box(f.F, s > 0 ? x0 - 0.03 : -x1 - 0.03, s > 0 ? x1 + 0.03 : -x0 + 0.03, 0, 0.12, 0, 0.3, p.c, bk, 'ftlr');
      }
      M.box(f.F, -x1 - 0.06, x1 + 0.06, 0, 0.11, 2.5, 2.58, p.c, bk, 'ftdlr');
    }
  }

  // ---------- fake windows on outside walls ----------
  if (S.windows) {
    const Wn = S.windows;
    const clear = (f, hw) => {
      const near = (px, pz, du, ds) => { const rx = px - f.o[0], rz = pz - f.o[1]; const u = rx * f.n[0] + rz * f.n[1], s = rx * f.t[0] + rz * f.t[1]; return u > -0.3 && u < du && Math.abs(s) < ds; };
      if (gen.props.some((p) => near(p.x, p.z, 0.85, hw + 0.45))) return false;
      if ((gen.lockers || []).some((p) => near(p.x, p.z, 0.9, hw + 0.5))) return false;
      if ((gen.signs || []).some((p) => near(p.x, p.z, 0.3, hw + 0.6))) return false;
      if (gen.fusebox && near(gen.fusebox.x, gen.fusebox.z, 0.5, hw + 0.4)) return false;
      return true;
    };
    for (const f of faces) {
      if (!f.outside || f.bare || f.glass || f.hole || !f.floor || f.top < WALL_H) continue;
      const ty = typeAt(f.x, f.z);
      if (['lapangan', 'pool', 'statuehall', 'ujian'].includes(ty)) continue;
      if (Wn.every > 1 && (f.x + f.z) % Wn.every) continue;
      const kind = Wn.kind;
      const dims = { dark: [0.66, 1.0, 2.3], frosted: [0.62, 1.05, 2.25], barred: [0.5, 1.85, 2.5], blocks: [0.8, 0.95, 2.45] }[kind];
      const [hw, y0, y1] = dims;
      if (!clear(f, hw)) continue;
      const bk = f.bk((y0 + y1) / 2), fr = Wn.frame, fw = 0.07;
      const glassHex = { dark: 0x0b1016, frosted: 0x8d9aa0, barred: 0x090c10, blocks: 0x93b9c0 }[kind];
      const glow = { dark: 0, frosted: 0.24, barred: 0, blocks: 0.22 }[kind];
      const gbk = (s) => { const b = bk(s); return kind === 'dark' || kind === 'barred' ? [b[0] * 0.5, b[1] * 0.5] : b; };
      G.box(f.F, -hw, hw, 0, 0.012, y0, y1, glassHex, gbk, 'f', glow);
      M.box(f.F, -hw - fw, hw + fw, 0, 0.05, y1, y1 + fw, fr, bk, 'fdlr');
      M.box(f.F, -hw - fw, -hw, 0, 0.05, y0, y1, fr, bk, 'flr');
      M.box(f.F, hw, hw + fw, 0, 0.05, y0, y1, fr, bk, 'flr');
      M.box(f.F, -hw - fw - 0.04, hw + fw + 0.04, 0, 0.11, y0 - 0.06, y0, fr, bk, 'ftdlr');
      if (kind === 'dark' || kind === 'frosted') {
        M.box(f.F, -0.025, 0.025, 0, 0.04, y0, y1, fr, bk, 'flr');
        M.box(f.F, -hw, hw, 0, 0.04, y1 - 0.42, y1 - 0.37, fr, bk, 'ftd');
      } else if (kind === 'barred') {
        for (let s = -hw + 0.1; s < hw - 0.05; s += 0.13) M.box(f.F, s - 0.016, s + 0.016, 0.02, 0.07, y0, y1, 0x2b2e30, bk, 'flr');
        M.box(f.F, -hw, hw, 0.02, 0.07, (y0 + y1) / 2 - 0.02, (y0 + y1) / 2 + 0.02, 0x2b2e30, bk, 'ftd');
      } else if (kind === 'blocks') {
        for (let s = -hw + 0.2; s < hw - 0.05; s += 0.2) M.box(f.F, s - 0.012, s + 0.012, 0, 0.022, y0, y1, fr, bk, 'flr');
        for (let y = y0 + 0.2; y < y1 - 0.05; y += 0.2) M.box(f.F, -hw, hw, 0, 0.022, y - 0.012, y + 0.012, fr, bk, 'ftd');
      }
    }
  }

  // ---------- columns ----------
  const column = (px, pz, size, y0, y1, st, top = true) => {
    const h = size / 2, F = XZ.x([px - h, pz - h]);
    const bk = (s) => bake(px, Math.min(y1, WALL_H) * 0.5 + 0.4, pz, null, null);
    const b = bk(0);
    const target = st.gloss || st.profile === 'banded' ? G : M;
    if (st.profile === 'steel') {   // H section: two flanges and a web
      const c = st.steel || st.c, fl = 0.05;
      M.box(F, 0, size, 0, fl, y0, y1, c, b, 'fblr' + (top ? 't' : ''));
      M.box(F, 0, size, size - fl, size, y0, y1, c, b, 'fblr' + (top ? 't' : ''));
      M.box(F, size / 2 - 0.025, size / 2 + 0.025, fl, size - fl, y0, y1, c, b, 'lr');
      M.box(F, -0.04, size + 0.04, -0.04, size + 0.04, y0, y0 + 0.05, c, b, 'fbtlr');
      return;
    }
    // shaft: each side lit from its own direction, like the walls
    const ym = Math.min(y1, WALL_H) * 0.5 + 0.3;
    for (const [m, nx, nz] of [['f', 0, 1], ['b', 0, -1], ['l', -1, 0], ['r', 1, 0]]) {
      const fb = bake(px + nx * (h + 0.3), ym, pz + nz * (h + 0.3), [nx, nz], null);
      target.box(F, 0, size, 0, size, y0, y1, st.c, [fb[0] * 0.85, fb[1] * 0.85], m);
    }
    if (top) target.box(F, 0, size, 0, size, y0, y1, st.c, b, 't');
    if (st.profile === 'classical') {
      const pb = 0.08;
      M.box(F, -pb, size + pb, -pb, size + pb, y0, y0 + 0.22, st.base || st.c, b, 'fbtlr');
      M.box(F, -pb * 0.5, size + pb * 0.5, -pb * 0.5, size + pb * 0.5, y0 + 0.22, y0 + 0.3, st.base || st.c, b, 'fbtlr');
      if (y1 <= WALL_H + 0.01 || top) {
        const cy = Math.min(y1, WALL_H);
        M.box(F, -pb * 0.6, size + pb * 0.6, -pb * 0.6, size + pb * 0.6, cy - 0.3, cy - 0.2, st.base || st.c, b, 'fbtdlr');
        M.box(F, -pb, size + pb, -pb, size + pb, cy - 0.2, cy - 0.08, st.c, b, 'fbtdlr');
      }
    } else if (st.profile === 'banded') {
      G.box(F, -0.015, size + 0.015, -0.015, size + 0.015, y0, y0 + 0.12, st.band, b, 'fbtlr');
      G.box(F, -0.015, size + 0.015, -0.015, size + 0.015, 2.35, 2.42, st.band, b, 'fbtdlr');
    } else if (st.profile === 'tiled') {
      M.box(F, -0.02, size + 0.02, -0.02, size + 0.02, y0, y0 + 0.17, st.band, b, 'fbtlr');
      M.box(F, -0.012, size + 0.012, -0.012, size + 0.012, 1.95, 2.05, st.band, b, 'fbtdlr');
    } else if (st.base) {
      M.box(F, -0.025, size + 0.025, -0.025, size + 0.025, y0, y0 + 0.14, st.base, b, 'fbtlr');
    }
  };
  const stairNear = (ex, ez) => [[ex - 1, ez - 1], [ex, ez - 1], [ex - 1, ez], [ex, ez]].some(([x, z]) => ['stairs', 'lift'].includes(typeAt(x, z)));
  const anyOpenAbove = (ex, ez) => [[ex - 1, ez - 1], [ex, ez - 1], [ex - 1, ez], [ex, ez]].some(([x, z]) => map.inside(x, z) && openAbove[x + z * W]);

  // ---------- openings: arcades, lintels and arches round open edges ----------
  if (S.opening) {
    const O = S.opening;
    // an edge is an opening when both sides are floor space and differ in
    // region or in what is above them (one tall, one not)
    const isOpening = (x, z, d) => {
      if (map.edge(x, z, d) !== EDGE.OPEN) return false;
      const nx = x + d.dx, nz = z + d.dz, a = map.reg(x, z), b = map.reg(nx, nz);
      if (a < 0 || b < 0) return false;
      if (bare(x, z) || bare(nx, nz)) return false;
      const ia = x + z * W, ib = nx + nz * W;
      if (noFloor[ia] || noFloor[ib]) return false;
      return a !== b || openAbove[ia] !== openAbove[ib];
    };
    const runs = [];
    // vertical edge lines (constant x), cells (ex-1, z) | (ex, z)
    for (let ex = 1; ex < W; ex++) {
      let run = null;
      for (let z = 0; z <= H; z++) {
        const ok = z < H && isOpening(ex - 1, z, DIRS[0]);
        if (ok) { if (!run) run = { axis: 'z', line: ex, a: z, b: z, cells: [] }; run.b = z; run.cells.push([ex - 1, z, ex, z]); }
        else if (run) { runs.push(run); run = null; }
      }
    }
    for (let ez = 1; ez < H; ez++) {
      let run = null;
      for (let x = 0; x <= W; x++) {
        const ok = x < W && isOpening(x, ez - 1, DIRS[2]);
        if (ok) { if (!run) run = { axis: 'x', line: ez, a: x, b: x, cells: [] }; run.b = x; run.cells.push([x, ez - 1, x, ez]); }
        else if (run) { runs.push(run); run = null; }
      }
    }
    // the edge that continues the line beyond a run end, as seen from cell (x,z) in direction d
    for (const run of runs) {
      const alongZ = run.axis === 'z';
      const pt = (k) => (alongZ ? [run.line * CELL, k * CELL] : [k * CELL, run.line * CELL]);
      const F = alongZ ? { o: pt(run.a), t: [0, 1], n: [1, 0] } : { o: pt(run.a), t: [1, 0], n: [0, 1] };
      const len = (run.b - run.a + 1) * CELL;
      // what continues the line past each end
      const endKind = (k, dir) => {   // k: cell index along the line just beyond the run
        const [x0, z0, x1, z1] = alongZ ? [run.line - 1, k, run.line, k] : [k, run.line - 1, k, run.line];
        if (!map.inside(x0, z0) || !map.inside(x1, z1)) return 'wall';
        const e = alongZ ? map.edge(x0, z0, DIRS[0]) : map.edge(x0, z0, DIRS[2]);
        void dir; void x1; void z1;
        if (e === EDGE.WALL || e === EDGE.DOOR || e === EDGE.NONE) return 'wall';
        if (e === EDGE.GLASS) return 'glass';
        return 'free';
      };
      const ends = [endKind(run.a - 1, -1), endKind(run.b + 1, 1)];
      const ceilA = run.cells.every(([x0, z0]) => ceilAt(x0, z0)), ceilB = run.cells.every(([, , x1, z1]) => ceilAt(x1, z1));
      const header = ceilA || ceilB;
      const glassy = ends.includes('glass');
      const hy0 = glassy ? 2.55 : WALL_H - O.hh;
      const hd = WALL_T / 2 + O.jd;
      const tall = run.cells.some(([x0, z0, x1, z1]) => openAbove[x0 + z0 * W] || openAbove[x1 + z1 * W]);
      const colTop = tall ? FH : WALL_H;
      const bkAt = (s) => bake(F.o[0] + F.t[0] * s, 2.2, F.o[1] + F.t[1] * s, null, null);
      // jambs where a wall continues the line, free columns elsewhere
      const stops = [];
      for (let k = 0; k <= run.b - run.a + 1; k++) {
        const s = k * CELL, end = k === 0 ? 0 : k === run.b - run.a + 1 ? 1 : -1;
        const [px, pz] = [F.o[0] + F.t[0] * s, F.o[1] + F.t[1] * s];
        const ek = alongZ ? run.line : null; void ek;
        if (end >= 0 && ends[end] === 'glass') continue;
        if (end >= 0 && ends[end] === 'wall') {
          const sg = end ? -1 : 1;   // jamb sits on the opening side of the point
          const j0 = end ? s - O.jw / 2 : s - O.jw / 2, j1 = end ? s + O.jw / 2 : s + O.jw / 2;
          void sg;
          const jt = header ? hy0 : colTop;
          M.box(F, j0, j1, -hd, hd, 0, jt, O.c, bkAt(s), 'fblr');
          if (O.base) M.box(F, j0 - 0.02, j1 + 0.02, -hd - 0.02, hd + 0.02, 0, 0.14, O.base, bkAt(s), 'fbtlr');
          stops.push(s);
          continue;
        }
        // free-standing column
        if (stairNear(...(alongZ ? [run.line, run.a + k] : [run.a + k, run.line]))) continue;
        if (end < 0 && O.colEvery > 1 && (run.a + k) % O.colEvery) continue;
        if (pillarAt(px, pz)) { stops.push(s); colPts.add(Math.round(px / CELL) + ',' + Math.round(pz / CELL)); continue; }
        if (blockedAt(px, pz, O.col / 2 + 0.05)) continue;
        column(px, pz, O.col, 0, header ? hy0 : colTop, O, !header && colTop < FH);
        solidCol(px, pz, O.col / 2); colPts.add(Math.round(px / CELL) + ',' + Math.round(pz / CELL));
        stops.push(s);
      }
      if (!header) continue;
      // lintel along the whole run
      M.box(F, 0 - (ends[0] === 'wall' ? 0 : 0), len, -hd, hd, hy0, WALL_H, glassy ? 0xd8d2c6 : O.c, bkAt, 'fbd' + (ends[0] === 'free' ? 'l' : '') + (ends[1] === 'free' ? 'r' : ''));
      // round arches between the stops
      if (O.round && !glassy) {
        stops.sort((p, q) => p - q);
        for (let k = 0; k + 1 < stops.length; k++) {
          const s0 = stops[k] + O.jw / 2, s1 = stops[k + 1] - O.jw / 2, span = s1 - s0;
          if (span < 1.2 || span > 3.2) continue;
          const N = 8, ys = 2.32, rise = hy0 - ys, mid = (s0 + s1) / 2, hw = span / 2;
          const P = (s, u, y) => [F.o[0] + F.t[0] * s + F.n[0] * u, y, F.o[1] + F.t[1] * s + F.n[1] * u];
          const col = colOf(O.c), bk = [bkAt(mid)];
          for (let q = 0; q < N; q++) {
            const a0 = Math.PI * q / N, a1 = Math.PI * (q + 1) / N;
            const sA = mid - Math.cos(a0) * hw, sB = mid - Math.cos(a1) * hw;
            const yA = ys + Math.sin(a0) * rise, yB = ys + Math.sin(a1) * rise;
            for (const u of [-hd, hd]) M.quad(P(sA, u, yA), P(sB, u, yB), P(sB, u, hy0), P(sA, u, hy0), [F.n[0] * Math.sign(u), 0, F.n[1] * Math.sign(u)], col, bk, 1);
            const am = (a0 + a1) / 2, ns = Math.cos(am) / hw, nyv = -Math.sin(am) / rise, nl = Math.hypot(ns, nyv);
            M.quad(P(sA, -hd, yA), P(sB, -hd, yB), P(sB, hd, yB), P(sA, hd, yA), [F.t[0] * ns / nl, nyv / nl, F.t[1] * ns / nl], col, bk, 0.7);
          }
          // keystone
          M.box(F, mid - 0.09, mid + 0.09, -hd - 0.015, hd + 0.015, hy0 - 0.2, hy0 + 0.02, O.base || O.c, bkAt(mid), 'fbdlr');
        }
      }
    }
  }

  // ---------- columns round voids (on the railing line) ----------
  if (S.voidCols) {
    const V = S.voidCols;
    for (let ez = 1; ez < H; ez++) for (let ex = 1; ex < W; ex++) {
      // the four edges meeting at this grid point
      const e = [
        map.inside(ex - 1, ez - 1) ? map.edge(ex - 1, ez - 1, DIRS[0]) : 0,   // north half of the vertical line
        map.inside(ex - 1, ez) ? map.edge(ex - 1, ez, DIRS[0]) : 0,           // south half
        map.inside(ex - 1, ez - 1) ? map.edge(ex - 1, ez - 1, DIRS[2]) : 0,   // west half of the horizontal line
        map.inside(ex, ez - 1) ? map.edge(ex, ez - 1, DIRS[2]) : 0,           // east half
      ];
      const rail = e.map((v) => v === EDGE.RAIL);
      if (!rail.some(Boolean)) continue;
      const vert = rail[0] || rail[1], hor = rail[2] || rail[3];
      const corner = vert && hor;
      const straight = (rail[0] && rail[1]) || (rail[2] && rail[3]);
      if (!corner && !(straight && (vert ? ez : ex) % V.every === 0)) continue;
      if (stairNear(ex, ez)) continue;
      // walkway cells round the point must all be floor or void (no walls)
      const cells = [[ex - 1, ez - 1], [ex, ez - 1], [ex - 1, ez], [ex, ez]];
      if (cells.some(([x, z]) => map.reg(x, z) === -1)) continue;
      if (e.some((v) => v === EDGE.WALL || v === EDGE.DOOR || v === EDGE.GLASS)) continue;
      const px = ex * CELL, pz = ez * CELL;
      if (pillarAt(px, pz)) { colPts.add(ex + ',' + ez); continue; }
      if (blockedAt(px, pz, V.size / 2 + 0.05)) continue;
      const tall = anyOpenAbove(ex, ez);
      column(px, pz, V.size, 0, tall ? FH : WALL_H, V, false);
      solidCol(px, pz, V.size / 2); colPts.add(ex + ',' + ez);
    }
  }

  // ---------- slab edges over voids ----------
  if (S.slab) for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const r = map.reg(x, z), i = x + z * W;
    if (!isSpace(r) || openAbove[i] || noCeil[i]) continue;
    for (const d of DIRS) {
      if (isSolid(x, z, d) || map.edge(x, z, d) === EDGE.GLASS) continue;
      const nx = x + d.dx, nz = z + d.dz, ni = nx + nz * W;
      if (!map.inside(nx, nz) || !isSpace(map.reg(nx, nz)) || !openAbove[ni]) continue;
      const [cx, cz] = map.center(x, z);
      const n = [d.dx, d.dz], t = [n[1], -n[0]];
      const F = { o: [cx + d.dx * CELL / 2 - t[0] * CELL / 2, cz + d.dz * CELL / 2 - t[1] * CELL / 2], t, n };
      const bk = bake(cx + d.dx * CELL / 2, WALL_H, cz + d.dz * CELL / 2, n, [cx, cz]);
      const tgt = S.slab.gloss ? G : M;
      // a thin edge strip at the soffit and a deeper nosing at the floor above
      tgt.box(F, 0, CELL, 0, S.slab.d * 0.6, WALL_H - 0.04, WALL_H + 0.1, S.slab.band || S.slab.c, bk, 'ftd');
      tgt.box(F, 0, CELL, 0, S.slab.d, FH - 0.16, FH, S.slab.c, bk, 'ftd');
    }
  }

  // ---------- beams: across corridors and across big rooms ----------
  const beamLine = (alongZ, line, k0, k1, B, pil = true, walls = [true, true]) => {
    // beam on grid line `line` (x = line*CELL if alongZ) spanning cells k0..k1;
    // an end without a wall stops on a column on the railing line
    const s0 = k0 * CELL + (walls[0] ? WALL_T / 2 : 0), s1 = (k1 + 1) * CELL - (walls[1] ? WALL_T / 2 : 0);
    const o = alongZ ? [line * CELL, 0] : [0, line * CELL];
    const F = alongZ ? { o, t: [0, 1], n: [1, 0] } : { o, t: [1, 0], n: [0, 1] };
    const P = (s) => (alongZ ? [line * CELL, s] : [s, line * CELL]);
    // break the beam round light fittings
    let a = s0;
    const pieces = [];
    for (let s = s0; s <= s1 + 1e-6; s += 0.25) {
      const [px, pz] = P(Math.min(s, s1));
      if (nearLight(px, pz, 0.62)) { if (s - a > 0.3) pieces.push([a, s - 0.1]); a = s + 0.35; }
    }
    if (s1 - a > 0.3) pieces.push([a, s1]);
    const bk = (s) => { const [px, pz] = P(s); return bake(px, WALL_H - 0.3, pz, null, null); };
    for (const [p0, p1] of pieces) M.box(F, p0, p1, -B.w / 2, B.w / 2, WALL_H - B.h, WALL_H, B.c, bk, 'fbd' + (p0 > s0 + 0.01 ? 'l' : '') + (p1 < s1 - 0.01 ? 'r' : ''));
    if (!pil) return;
    // pilasters on the walls under each end
    for (const [s, sg, w] of [[s0, 1, walls[0]], [s1, -1, walls[1]]]) {
      if (!w || !pieces.length || (sg > 0 ? pieces[0][0] > s0 + 0.01 : pieces[pieces.length - 1][1] < s1 - 0.01)) continue;
      const [px, pz] = P(s);
      const PF = alongZ ? { o: [px, pz], t: [1, 0], n: [0, sg] } : { o: [px, pz], t: [0, 1], n: [sg, 0] };
      if (blockedAt(px + PF.n[0] * 0.2, pz + PF.n[1] * 0.2, 0.25)) continue;
      M.box(PF, -B.pw / 2, B.pw / 2, 0, B.pd, 0, WALL_H - B.h, B.c, bake(px + PF.n[0] * 0.3, 1.5, pz + PF.n[1] * 0.3, null, null), 'flr');
    }
  };
  const hallCeil = (x, z) => map.reg(x, z) === 0 && ceilAt(x, z);
  if (S.beams) {
    const B = S.beams;
    for (const alongZ of [false, true]) {
      // lines across corridors: for alongZ=false the line is horizontal (z boundary) and spans x
      const L = alongZ ? W : H, A = alongZ ? H : W;
      for (let line = 1; line < L; line++) {
        if (line % B.every) continue;
        let k = 0;
        while (k < A) {
          const cellsOk = (q) => { const [x0, z0, x1, z1] = alongZ ? [line - 1, q, line, q] : [q, line - 1, q, line]; return hallCeil(x0, z0) && hallCeil(x1, z1) && map.edge(x0, z0, alongZ ? DIRS[0] : DIRS[2]) === EDGE.OPEN; };
          if (!cellsOk(k)) { k++; continue; }
          let e = k; while (e + 1 < A && cellsOk(e + 1)) e++;
          // walls close both ends on both sides of the line -> a corridor section
          // 'w' wall on both sides, 'c' a column on the railing line, '' neither
          const endOf = (q, dirIdx) => {
            const d = alongZ ? DIRS[dirIdx + 2] : DIRS[dirIdx];
            const [x0, z0, x1, z1] = alongZ ? [line - 1, q, line, q] : [q, line - 1, q, line];
            if (isSolid(x0, z0, d) && isSolid(x1, z1, d)) return 'w';
            const p = alongZ ? [line, q + (dirIdx === 0 ? 1 : 0)] : [q + (dirIdx === 0 ? 1 : 0), line];
            return colPts.has(p[0] + ',' + p[1]) && !isSolid(x0, z0, d) && !isSolid(x1, z1, d) ? 'c' : '';
          };
          const ea = endOf(k, 1), eb = endOf(e, 0);
          if (e - k <= 2 && ea && eb && (ea === 'w' || eb === 'w')) beamLine(alongZ, line, k, e, B, true, [ea === 'w', eb === 'w']);
          k = e + 1;
        }
      }
    }
  }
  if (S.ceiling) {
    const C = S.ceiling;
    for (const r of gen.rooms) {
      if (r.w * r.h < C.minCells || BARE_ROOMS.has(r.type) || (C.types && !C.types.includes(r.type))) continue;
      const rid = r.id;
      const inR = (x, z) => map.reg(x, z) === rid && ceilAt(x, z);
      const dirs = C.kind === 'coffer' ? [true, false] : [r.w >= r.h];
      for (const alongZ of dirs) {
        // alongZ: vertical lines x = x0 + 2k spanning z
        const [L0, L1, A0, A1] = alongZ ? [r.x0, r.x1, r.z0, r.z1] : [r.z0, r.z1, r.x0, r.x1];
        for (let line = L0 + 2; line <= L1; line += 2) {
          let k = A0;
          while (k <= A1) {
            const ok = (q) => (alongZ ? inR(line - 1, q) && inR(line, q) : inR(q, line - 1) && inR(q, line));
            if (!ok(k)) { k++; continue; }
            let e = k; while (e + 1 <= A1 && ok(e + 1)) e++;
            beamLine(alongZ, line, k, e, { ...C, pw: C.w + 0.06, pd: 0.05 }, C.kind !== 'coffer' || true);
            k = e + 1;
          }
        }
      }
    }
  }

  // ---------- ducts and pipes in service areas ----------
  if (S.ducts) {
    const D = S.ducts;
    const run = (f) => {   // along face f, near the ceiling
      const bk = f.bk(2.7);
      M.box(f.F, f.a, f.b, 0.38, 0.86, 2.6, 2.84, D.c, bk, 'fbd');
      M.box(f.F, f.a, f.b, 0.08, 0.15, 2.78, 2.85, 0x5b5f60, bk, 'fbd');
      M.box(f.F, f.a, f.b, 0.19, 0.25, 2.8, 2.86, 0x7a5a40, bk, 'fbd');
      // hangers
      for (const s of [-0.75, 0.75]) M.box(f.F, s - 0.015, s + 0.015, 0.6, 0.63, 2.84, WALL_H, 0x4a4d4f, bk, 'fblr');
    };
    for (const f of faces) {
      if (f.bare || f.glass || !f.ceil || f.top !== WALL_H || f.exit) continue;
      const ty = typeAt(f.x, f.z), hall = f.r === 0;
      if (hall && !D.halls) continue;
      if (!hall && !D.rooms.includes(ty)) continue;
      // only one wall of each corridor / room: the west or north face
      if (!(f.d === DIRS[1] || f.d === DIRS[3])) continue;
      if (hall) {   // narrow corridors only: the opposite side must be a wall too
        const opp = DIRS.find((q) => q.dx === -f.d.dx && q.dz === -f.d.dz);
        if (!isSolid(f.x, f.z, opp)) continue;
        if (nearLight(f.c[0] + f.n[0] * 0.6, f.c[1] + f.n[1] * 0.6, 0.0)) continue;
      } else {
        const r = roomOf(f.x, f.z);
        if (!r || (f.d === DIRS[1] ? r.w < r.h : r.h < r.w)) continue;   // the long wall
      }
      run(f);
    }
  }

  // ---------- storefront canopies (mall) ----------
  if (S.canopy) {
    const C = S.canopy;
    const front = new Set();
    for (const r of gen.rooms) if (r.storefront) for (const e of r.storefront.list) front.add(map.edgeKey(e.x, e.z, DIRS.find((q) => q.name === e.s)));
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (map.reg(x, z) !== 0 || !ceilAt(x, z)) continue;
      for (const d of DIRS) {
        const e = map.edge(x, z, d), nb = map.reg(x + d.dx, z + d.dz);
        if (!(e === EDGE.GLASS || (nb > 0 && front.has(map.edgeKey(x, z, d))))) continue;
        const [cx, cz] = map.center(x, z);
        const n = [-d.dx, -d.dz], t = [n[1], -n[0]];
        const o = [cx + d.dx * CELL / 2, cz + d.dz * CELL / 2];
        const F = { o, t, n };
        const bk = bake(o[0] + n[0] * 0.5, 2.5, o[1] + n[1] * 0.5, null, [cx, cz]);
        // a slim canopy at transom height, under the brand plates on the header
        G.box(F, -CELL / 2, CELL / 2, WALL_T / 2, 0.58, 2.42, 2.52, C.c, bk, 'ftd');
        for (let s = -1; s <= 1; s++) M.box(F, s - 0.08, s + 0.08, 0.34, 0.46, 2.418, 2.42, C.light, bk, 'd', 0.95);
      }
    }
  }

  const meshes = [M.mesh(SRC), G.mesh(SRC_G)].filter(Boolean);
  if (gen.colliders) gen.colliders.push(...newColliders);
  return { meshes, tris: M.tris + G.tris };
}
