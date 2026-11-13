// Turns generator output into Three.js meshes: merged wall/floor/ceiling
// geometry with baked light, instanced props (chunked for culling), and
// individually animated doors, lockers and items.
import * as THREE from 'three';
import { CELL, WALL_H, WALL_T, DOOR_W, DOOR_H, POOL_Y, HIDE, hideOf } from '../config.js';
import { AOBuilder, contactShadows, lightGlows } from '../render/dressing.js';
import { storyDecals } from '../render/storyDecals.js';
import { skyEye } from '../render/skyeye.js';
import { normalFromTexture, GLOSS, RELIEF } from '../render/normals.js';
const NORMALS = new Map();   // texture key -> derived normal map (shared by every level)
import { DIRS, EDGE, VOID } from './map.js';
import { bakeMaterial, LightField, TILE_RE } from '../render/bake.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildArchitecture } from './architecture.js';

// One shared vertex-colour material for all merged opaque props.
const VC_SRC = new THREE.MeshLambertMaterial({ vertexColors: true });
VC_SRC.name = 'MergedVC';
const VC_SRC_2S = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
VC_SRC_2S.name = 'MergedVC2S';

// Merge every opaque, non-emissive, untextured mesh of a model into a single
// vertex-coloured geometry (1 draw call instead of 1 per material).
// parts: [{mesh, matrix}] (matrix = mesh transform in model space)
// classify(material) -> number: residents keep every part in one draw call but
// tag each vertex with its shading class (attribute lookId, read by entityLook)
const VC_LOOK = VC_SRC.clone(); VC_LOOK.name = 'MergedVCLook';
const VC_LOOK_2S = VC_SRC_2S.clone(); VC_LOOK_2S.name = 'MergedVCLook2S';
function mergeParts(parts, key = 'matrix', classify = null) {
  const keep = [], groups = { front: [], double: [] };
  for (const p of parts) {
    const m = p.mesh.material;
    if (!m || m.transparent || m.map || (m.userData && m.userData.emissive) || TILE_RE.test(m.name || '')) { keep.push(p); continue; }
    const geos = m.side === THREE.FrontSide ? groups.front : groups.double;
    const g = p.mesh.geometry.clone().applyMatrix4(p[key]);
    // vertex colours (residents carry baked AO in them) are kept, tinted by the material colour
    const vc = m.vertexColors && g.attributes.color ? g.attributes.color : null;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = vc ? vc.getX(i) : 1, b = vc ? vc.getY(i) : 1, c = vc ? vc.getZ(i) : 1;
      col[i * 3] = m.color.r * a; col[i * 3 + 1] = m.color.g * b; col[i * 3 + 2] = m.color.b * c;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (classify) g.setAttribute('lookId', new THREE.BufferAttribute(new Float32Array(n).fill(classify(m)), 1));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  if (groups.front.length + groups.double.length < 2) return parts;
  const out = [];
  for (const [list, mat] of [[groups.front, classify ? VC_LOOK : VC_SRC], [groups.double, classify ? VC_LOOK_2S : VC_SRC_2S]]) {
    if (!list.length) continue;
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0];
    if (!merged) return parts;
    out.push({ mesh: { geometry: merged, material: mat }, [key]: new THREE.Matrix4() });
  }
  return [...out, ...keep];
}

let CHUNK = 24;

class GeoBuilder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.bake = []; this.idx = []; }
  // quad from 4 corners (counter-clockwise when seen from the front)
  quadGrid(origin, uAxis, vAxis, uLen, vLen, uSteps, vSteps, normal, uvFn, bakeFn) {
    const base = this.pos.length / 3;
    for (let j = 0; j <= vSteps; j++) for (let i = 0; i <= uSteps; i++) {
      const u = (i / uSteps) * uLen, v = (j / vSteps) * vLen;
      const p = [origin[0] + uAxis[0] * u + vAxis[0] * v, origin[1] + uAxis[1] * u + vAxis[1] * v, origin[2] + uAxis[2] * u + vAxis[2] * v];
      this.pos.push(...p); this.nrm.push(...normal);
      const t = uvFn(p); this.uv.push(t[0], t[1]);
      const b = bakeFn(p); this.bake.push(b[0], b[1]);
    }
    const row = uSteps + 1;
    for (let j = 0; j < vSteps; j++) for (let i = 0; i < uSteps; i++) {
      const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
      this.idx.push(a, b, d, a, d, c);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('bake', new THREE.Float32BufferAttribute(this.bake, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function buildLevel(gen, assets, def, ctx = {}) {
  const { map } = gen;
  CHUNK = def.chunk || (def.layout ? 54 : 24);   // big hand-made buildings: fewer, larger prop batches
  const root = new THREE.Group();
  const field = new LightField(map, gen.lights);
  const T = assets.textures;
  const FH = ctx.FH || WALL_H;
  const N = map.W * map.H;
  const openAbove = gen.openAbove || new Uint8Array(N), noFloor = gen.noFloor || new Uint8Array(N), noCeil = gen.noCeil || new Uint8Array(N);
  const tiled = new Set([0, VOID, ...gen.rooms.filter((r) => r.type === 'restroom').map((r) => r.id)]);
  const roomById = new Map(gen.rooms.map((r) => [r.id, r]));
  const THEMES = {
    pool: ['pool_floor', 'pool_floor', 'pool_ceiling', 'pool_wall', 'pool_wall'],
    mall: ['mall_floor', 'mall_floor', 'mall_ceiling', 'mall_wall', 'mall_wall'],
    backroom: ['bk_carpet', 'bk_carpet', 'bk_ceiling', 'bk_wallpaper', 'bk_wallpaper'],
  };
  const th = def.textures || THEMES[def.theme] || ['floor_tile', 'floor_classroom', 'ceiling_tile', 'wall_hall', 'wall_classroom'];
  // texture per region and surface (rooms can override with r.mat)
  const texFor = (reg, slot) => {
    const r = roomById.get(reg);
    if (r && r.mat && r.mat[slot]) return r.mat[slot];
    const h = tiled.has(reg);
    return slot === 'floor' ? th[h ? 0 : 1] : slot === 'wall' ? th[h ? 3 : 4] : th[2];
  };
  const gbs = new Map();
  const gb = (tex) => { if (!gbs.has(tex)) gbs.set(tex, new GeoBuilder()); return gbs.get(tex); };
  const isSpace = (r) => r >= 0 || r === VOID;
  const sky = [];

  // ---------- floors & ceilings ----------
  const ceilTile = def.theme === 'mall' ? 1.5 : 1.2;   // mall: pattern repeats every block (15 m)
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
    const r = map.reg(x, z), i = x + z * map.W;
    if (!isSpace(r)) continue;
    const c = map.center(x, z);
    if (r >= 0 && !noFloor[i]) gb(texFor(r, 'floor')).quadGrid([x * CELL, 0, (z + 1) * CELL], [1, 0, 0], [0, 0, -1], CELL, CELL, 3, 3, [0, 1, 0],
      (p) => [p[0] / CELL, -p[2] / CELL], (p) => field.sample(p[0], 0, p[2], 0, 1, 0, c));
    if (openAbove[i]) continue;
    if (noCeil[i]) { sky.push([x, z]); continue; }
    gb(texFor(r, 'ceil')).quadGrid([x * CELL, WALL_H, z * CELL], [1, 0, 0], [0, 0, 1], CELL, CELL, 3, 3, [0, -1, 0],
      (p) => [p[0] / ceilTile, p[2] / ceilTile], (p) => { const s = field.sample(p[0], WALL_H, p[2], null, null, null, c); return [s[0] * 0.42, s[1] * 0.42]; });
  }

  // ---------- walls ----------
  const isSolid = (x, z, d) => { const e = map.edge(x, z, d); return e === EDGE.WALL || e === EDGE.DOOR; };
  const perp = (d) => DIRS.filter((t) => t.dx !== d.dx && t.dz !== d.dz && !(t.dx === -d.dx && t.dz === -d.dz) && (t.dx * d.dx + t.dz * d.dz === 0));
  const wallTop = (i) => (openAbove[i] ? FH : WALL_H);
  const ao = new AOBuilder(), UP = [0, 1, 0], DOWN = [0, -1, 0];
  const storyWalls = [], storyCells = [];
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
    const r = map.reg(x, z), i = x + z * map.W;
    if (!isSpace(r)) continue;
    const c = map.center(x, z);
    const wb = gb(texFor(r, 'wall'));
    const top = wallTop(i);
    for (const d of DIRS) {
      const normal = [-d.dx, 0, -d.dz];
      const tan = cross([0, 1, 0], normal);
      const uvFn = (p) => [(p[0] * Math.abs(tan[0]) + p[2] * Math.abs(tan[2])) / CELL, p[1] / WALL_H];
      const bakeFn = (p) => field.sample(p[0], Math.min(p[1], WALL_H), p[2], normal[0], 0, normal[2], c);
      if (map.edge(x, z, d) === EDGE.GLASS) {   // shop window: only the header above it is wall
        const off = CELL / 2 - WALL_T / 2, px = c[0] + d.dx * off, pz = c[1] + d.dz * off;
        wb.quadGrid([px + tan[0] * -CELL / 2, 2.55, pz + tan[2] * -CELL / 2], tan, [0, 1, 0], CELL, top - 2.55, 4, 1, normal, uvFn, bakeFn);
        continue;
      }
      if (!isSolid(x, z, d)) {
        // fascia: the slab edge between this ceiling and an open space next door
        const nx = x + d.dx, nz = z + d.dz, ni = nx + nz * map.W;
        if (!map.inside(nx, nz) || !isSpace(map.reg(nx, nz))) continue;
        const ownTop = openAbove[i] ? FH : noCeil[i] ? null : WALL_H;
        const nTop = openAbove[ni] ? FH : noCeil[ni] ? (ownTop === WALL_H && !openAbove[i] ? WALL_H + 0.55 : null) : WALL_H;
        if (ownTop === WALL_H && nTop > WALL_H) {
          const px = c[0] + d.dx * CELL / 2, pz = c[1] + d.dz * CELL / 2;
          const n2 = [d.dx, 0, d.dz], t2 = cross([0, 1, 0], n2);
          const o = [px - t2[0] * CELL / 2, WALL_H, pz - t2[2] * CELL / 2];
          gb(texFor(r, 'wall')).quadGrid(o, t2, [0, 1, 0], CELL, nTop - WALL_H, 4, 1, n2, uvFn, (p) => field.sample(p[0], WALL_H, p[2], null, null, null, c));
        }
        continue;
      }
      const k = map.edgeKey(x, z, d);
      const off = CELL / 2 - WALL_T / 2;
      const px = c[0] + d.dx * off, pz = c[1] + d.dz * off;
      const tz = perp(d);
      let a = -CELL / 2, b = CELL / 2;
      for (const t of tz) {
        const sign = t.dx * tan[0] + t.dz * tan[2];
        const extend = !isSolid(x, z, t) && !isSolid(x + t.dx, z + t.dz, d) && isSpace(map.reg(x + t.dx, z + t.dz));
        if (sign > 0) b = extend ? CELL / 2 + WALL_T / 2 : CELL / 2;
        else a = extend ? -CELL / 2 - WALL_T / 2 : -CELL / 2;
      }
      const door = map.doors.get(k);
      const isExit = k === gen.map.exitKey;
      const hole = door ? [DOOR_W / 2, DOOR_H] : isExit ? [1.0, 2.4] : null;
      const seg = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.001 || y1 - y0 < 0.001) return;
        const o = [px + tan[0] * s0, y0, pz + tan[2] * s0];
        const steps = Math.max(1, Math.round((s1 - s0) / 0.5));
        const vs = Math.max(1, Math.round((y1 - y0) / 0.6));
        wb.quadGrid(o, tan, [0, 1, 0], s1 - s0, y1 - y0, steps, vs, normal, uvFn, bakeFn);
      };
      // fake ambient occlusion along the creases of this wall
      {
        const rr = roomById.get(r);
        const flat = r >= 0 && !noFloor[i] && !(rr && rr.type === 'stairs');
        const ceil = !openAbove[i] && !noCeil[i] && top === WALL_H;
        const P = (s, y, n) => [px + tan[0] * s + normal[0] * n, y, pz + tan[2] * s + normal[2] * n];
        const spans = hole ? [[a, -hole[0]], [hole[0], b]] : [[a, b]];
        for (const [s0, s1] of spans) {
          if (s1 - s0 < 0.01) continue;
          if (flat) { ao.quad(P(s0, 0.01, 0), tan, normal, s1 - s0, 0.75); ao.quad(P(s0, 0, 0.004), tan, UP, s1 - s0, 0.65); }
          if (flat && top === WALL_H) { const mid = (s0 + s1) / 2; const ox = x + d.dx, oz = z + d.dz; storyWalls.push({ p: [px + tan[0] * mid, pz + tan[2] * mid], tan: [tan[0], tan[2]], n: [normal[0], normal[2]], len: s1 - s0, outside: !map.inside(ox, oz) || !isSpace(map.reg(ox, oz)) }); }
        }
        if (ceil) { ao.quad(P(a, WALL_H - 0.01, 0), tan, normal, b - a, 0.55); ao.quad(P(a, WALL_H, 0.004), tan, DOWN, b - a, 0.45); }
        for (const t of tz) {
          if (!isSolid(x, z, t)) continue;
          const sign = t.dx * tan[0] + t.dz * tan[2];
          const neg = [-tan[0], 0, -tan[2]];
          if (sign > 0) ao.quad(P(b, 0, 0.004), UP, neg, top, 0.4); else ao.quad(P(a, 0, 0.004), UP, tan, top, 0.4);
        }
      }
      if (hole) {
        seg(a, -hole[0], 0, top);
        seg(hole[0], b, 0, top);
        seg(-hole[0], hole[0], hole[1], top);
      } else seg(a, b, 0, top);
    }
  }

  // ---------- stairs / escalators ----------
  for (const st of gen.steps || []) buildSteps(st, FH, gb(st.mat || texFor(0, 'floor')), field, root, def);

  // ---------- railings round open space, shop windows ----------
  buildRails(map, gen, def, root, field, gb, texFor, openAbove);
  buildGlass(map, root, field);
  // ---------- built architecture: trims, arcades, beams, windows ----------
  for (const m of buildArchitecture({ map, gen, def, field, roomById, openAbove, noFloor, noCeil, FH, texFor }).meshes) root.add(m);

  const tex = (k) => { const t = T[k]; if (!t) console.warn('missing texture', k); return t || T.wall_hall; };
  const mkMat = (map_, key) => {
    const src = new THREE.MeshLambertMaterial({ map: map_ });
    if (!NORMALS.has(key)) NORMALS.set(key, key === 'pool_water' ? null : normalFromTexture(map_, RELIEF[key] ?? 1.6));
    src.normalMap = NORMALS.get(key);
    src.userData.gloss = GLOSS[key] || 0;
    return bakeMaterial(src, 'attr');
  };
  for (const [k, g] of gbs) {
    if (!g.pos.length) continue;
    const m = new THREE.Mesh(g.build(), mkMat(tex(k), k));
    m.matrixAutoUpdate = false;
    root.add(m);
  }
  const aoMesh = ao.mesh(def.aoStrength ?? 0.55);
  if (aoMesh) root.add(aoMesh);
  if (sky.length) root.add(skyMesh(sky));
  if ((gen.signs || []).length) root.add(signsMesh(gen.signs, field));

  // ---------- pool water ----------
  let waterMat = null;
  const poolMats = [];
  if (gen.water.length) {
    const wt = T.pool_water.clone(); wt.needsUpdate = true;
    wt.wrapS = wt.wrapT = THREE.RepeatWrapping;
    waterMat = new THREE.MeshBasicMaterial({ map: wt, color: 0xbfeff2, transparent: true, opacity: 0.72, depthWrite: false });
    waterMat.userData.base = waterMat.color.clone(); poolMats.push(waterMat);
    const lm = new THREE.MeshBasicMaterial({ color: 0x24507a }); lm.userData.base = lm.color.clone(); poolMats.push(lm);
    const cm = new THREE.MeshBasicMaterial({ color: 0xdfe5e4 }); cm.userData.base = cm.color.clone(); poolMats.push(cm);
    // every surface, lane line and coping strip of the floor merged per material
    const wg = [], lg = [], cg = [];
    for (const w of gen.water) {
      const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
      const g = new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx / 3, uv.getY(i) * sz / 3);
      wg.push(g.translate((w.minX + w.maxX) / 2, POOL_Y, (w.minZ + w.maxZ) / 2));
      if (w.plain) continue;   // flooded rooms and halls: no pool markings
      // dark navy lane lines on the pool floor, seen through the water
      const alongX = sx >= sz;
      for (let k = 1.5; k < (alongX ? sz : sx) - 0.5; k += 3) {
        lg.push(new THREE.PlaneGeometry(alongX ? sx - 2 : 0.25, alongX ? 0.25 : sz - 2).rotateX(-Math.PI / 2)
          .translate(alongX ? (w.minX + w.maxX) / 2 : w.minX + k, 0.008, alongX ? w.minZ + k : (w.minZ + w.maxZ) / 2));
      }
      // white coping strip around the edge
      for (const [cx, cz, ex, ez] of [[(w.minX + w.maxX) / 2, w.minZ - 0.15, sx + 0.6, 0.3], [(w.minX + w.maxX) / 2, w.maxZ + 0.15, sx + 0.6, 0.3],
        [w.minX - 0.15, (w.minZ + w.maxZ) / 2, 0.3, sz], [w.maxX + 0.15, (w.minZ + w.maxZ) / 2, 0.3, sz]]) {
        cg.push(new THREE.BoxGeometry(ex, 0.06, ez).translate(cx, 0.03, cz));
      }
    }
    const add = (list, mat, order) => {
      if (!list.length) return;
      const m = new THREE.Mesh(list.length > 1 ? mergeGeometries(list, false) : list[0], mat);
      if (order) m.renderOrder = order;
      root.add(m);
    };
    add(wg, waterMat, 2); add(lg, lm); add(cg, cm);
  }

  // ---------- floor decals ----------
  if (gen.decals.length && !def.theme) {
    const dm = bakeMaterial(new THREE.MeshLambertMaterial({ map: T.stain_decal, transparent: true, depthWrite: false, opacity: 0.75 }), 'attr');
    const dg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(dg, dm, gen.decals.length);
    const bake = new Float32Array(gen.decals.length * 2);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    gen.decals.forEach((d, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.r);
      mtx.compose(new THREE.Vector3(d.x, 0.006 + i * 0.00001, d.z), q, s.set(d.s, 1, d.s));
      inst.setMatrixAt(i, mtx);
      const b = field.sample(d.x, 0, d.z, 0, 1, 0, null); bake[i * 2] = b[0]; bake[i * 2 + 1] = b[1];
    });
    dg.setAttribute('bake', new THREE.InstancedBufferAttribute(bake, 2));
    inst.renderOrder = 1;
    root.add(inst);
  }

  // ---------- instanced static props ----------
  const inst = new Instancer(assets, field, root);
  // figure statues get their own dynamic instances so they can turn when unobserved
  const FIG = ['figure_stand', 'figure_reach', 'figure_kneel', 'mannequin'];
  const figures = [];
  for (const p of gen.props) if (!FIG.includes(p.type)) inst.add(p.type, p.x, p.y || 0, p.z, p.rot, '', null, p.scale);
  for (const kind of FIG) {
    const list = gen.props.filter((p) => p.type === kind);
    if (!list.length) continue;
    const parts = inst.flatten(kind);
    const ims = parts.map((pt) => {
      const geo = pt.mesh.geometry.clone();
      const bake = new Float32Array(list.length * 2);
      list.forEach((f, i) => { const b = field.sample(f.x, Math.min(2.6, (f.y || 0) + 1.2), f.z, null, null, null, null); bake[i * 2] = b[0]; bake[i * 2 + 1] = b[1]; });
      geo.setAttribute('bake', new THREE.InstancedBufferAttribute(bake, 2));
      const im = new THREE.InstancedMesh(geo, bakeMaterial(pt.mesh.material, 'attr'), list.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      root.add(im);
      return { im, local: pt.matrix };
    });
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((f, idx) => {
      const sc = f.scale || 1, sv = new THREE.Vector3(sc, sc, sc);
      const fig = { x: f.x, z: f.z, y: f.y || 0, s: sc, rot: f.rot, set(rot) {
        fig.rot = rot;
        const base = new THREE.Matrix4().compose(new THREE.Vector3(f.x, f.y || 0, f.z), q.setFromAxisAngle(up, rot), sv);
        for (const m of ims) { m.im.setMatrixAt(idx, base.clone().multiply(m.local)); m.im.instanceMatrix.needsUpdate = true; }
      } };
      fig.set(f.rot);
      figures.push(fig);
    });
  }
  // blood, scratches, warnings and footprints: one instanced batch per floor
  if (def.story !== 0) {
    for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
      const r = map.reg(x, z), rr = roomById.get(r), i = x + z * map.W;
      if (isSpace(r) && r >= 0 && !noFloor[i] && !(rr && rr.type === 'stairs')) storyCells.push(map.center(x, z));
    }
    const busy = [...gen.props, ...gen.lockers, ...(gen.signs || []), ...(gen.fusebox ? [gen.fusebox] : [])];
    const sm = storyDecals({ walls: storyWalls, hides: gen.lockers, cells: storyCells, field, busy,
      seed: (map.W * 31 + map.H * 17 + storyCells.length * 7 + (ctx.k || 0) * 101) | 0, density: def.story ?? 1, wallH: WALL_H });
    if (sm) root.add(sm);
  }
  // soft contact shadows under everything that stands on the floor
  const shadowList = gen.props.slice();
  for (const l of gen.lockers) shadowList.push({ type: hideOf(l).model, x: l.x, z: l.z, rot: l.rot });
  const cs = contactShadows(assets, shadowList);
  if (cs) root.add(cs);
  // light pools on the floor and halos on the ceiling round lit fixtures
  const floorAt = (wx, wz) => { const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL); if (!map.inside(cx, cz)) return false; const rg = map.reg(cx, cz), rr = roomById.get(rg); return rg >= 0 && !noFloor[cx + cz * map.W] && !(rr && rr.type === 'stairs'); };
  const glows = lightGlows(gen.lights, WALL_H, def.tint || [1, 0.98, 0.9], floorAt);
  for (const m of glows.meshes) root.add(m);
  // ceiling fixtures, grouped by state so emissive can differ
  const fixtureMats = { on: null, off: null, flicker: null };
  for (const l of gen.lights) if (l.fixture !== 'none') inst.add('ceiling_light', l.x, l.y ?? WALL_H, l.z, l.rot, 'light_' + l.state, (m) => {
    if (!m.userData.emissive) return m;
    if (!fixtureMats[l.state]) {
      const c = m.clone();
      c.userData = { ...m.userData };
      c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey;
      if (l.state === 'off') { c.emissive = new THREE.Color(0x0b0b0a); c.color = new THREE.Color(0x777770); }
      fixtureMats[l.state] = c;
    }
    return fixtureMats[l.state];
  });
  // hideable lockers: body instanced + door instanced (door matrices animated)
  // every kind of hiding spot (config HIDE) is its own body batch + door batch
  const hideKinds = new Map();
  for (const l of gen.lockers) { const k = HIDE[l.kind] ? l.kind : 'locker'; if (!hideKinds.has(k)) hideKinds.set(k, []); hideKinds.get(k).push(l); }
  const hideMeshes = [];
  const lockers = [...hideKinds].flatMap(([k, list]) => inst.addLockers(list, HIDE[k].model, HIDE[k], hideMeshes));

  // ---------- doors ----------
  const doors = [];
  for (const door of map.doors.values()) {
    const key = door.locked ? 'door_locked' : 'door_classroom';
    const obj = cloneWithBake(assets.models[key], field.sample(door.x, 1.2, door.z, null, null, null, null));
    obj.position.set(door.x, 0, door.z);
    // door model faces +Z; rotate so its local Z axis is along the door normal
    obj.rotation.y = Math.atan2(door.inX, door.inZ);
    const leaf = obj.getObjectByName('DoorLeaf');
    root.add(obj);
    door.obj = obj; door.leaf = leaf; door.baseRot = leaf ? leaf.rotation.y : 0;
    doors.push(door);
  }

  // ---------- exit + fuse box ----------
  const ex = gen.exit;
  let exitObj = null, glow = null, fuseObj = null, lamps = [];
  if (ex) {
  exitObj = cloneWithBake(assets.models.exit_door, [0.7, 0]);
  exitObj.position.set(ex.x - ex.d.dx * 0.0, 0, ex.z - ex.d.dz * 0.0);
  exitObj.rotation.y = ex.rot;
  root.add(exitObj);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.4), glowMat);
  glow.position.set(ex.x + ex.d.dx * 0.12, 1.2, ex.z + ex.d.dz * 0.12);
  glow.rotation.y = ex.rot;
  root.add(glow);
  }
  const fb = gen.fusebox;
  if (fb) {
  fuseObj = cloneWithBake(assets.models.fuse_box, field.sample(fb.x, 1.4, fb.z, null, null, null, null));
  fuseObj.position.set(fb.x, 0, fb.z);
  fuseObj.rotation.y = fb.rot;
  root.add(fuseObj);
  lamps = [1, 2, 3].map((i) => fuseObj.getObjectByName('Lamp' + i)).filter(Boolean);
  for (const l of lamps) { l.material = l.material.clone(); l.material.emissive = new THREE.Color(0x550000); }
  }

  // ---------- items ----------
  const items = gen.items.map((it) => {
    const key = 'item_' + it.type;
    const obj = cloneWithBake(assets.models[key], field.sample(it.x, it.y + 0.3, it.z, null, null, null, null), 0.25);
    obj.position.set(it.x, it.y + itemLift(it.type), it.z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    obj.userData.baseY = obj.position.y;
    root.add(obj);
    return { ...it, obj, taken: false };
  });

  // ---------- lift cabins: sliding doors + call panel ----------
  const lifts = [];
  const liftMat = bakeMaterial(new THREE.MeshLambertMaterial({ color: 0xa4a9ac }), 'uniform');
  for (const ld of gen.liftDoors || []) {
    const d = DIRS.find((q) => q.dx === { E: 1, W: -1 }[ld.side] || (q.dx === 0 && q.dz === { S: 1, N: -1 }[ld.side]));
    const [cx, cz] = map.center(ld.x, ld.z);
    const ex = cx + d.dx * (CELL / 2 - 0.05), ez = cz + d.dz * (CELL / 2 - 0.05);
    const tx = -d.dz, tz = d.dx;          // along the doorway
    const b = field.sample(cx, 1.2, cz, null, null, null, null);
    liftMat.userData.bake.value.set(Math.max(0.3, b[0]), b[1]);
    const g = new THREE.BoxGeometry(CELL / 2 - 0.05, 2.5, 0.06);
    const rot = Math.atan2(tx, tz) + Math.PI / 2;
    const panels = [-1, 1].map((s) => { const p = new THREE.Mesh(g, liftMat); p.rotation.y = rot; root.add(p); return { mesh: p, s }; });
    // frame round the opening
    const frameG = new THREE.BoxGeometry(CELL + 0.1, 0.5, 0.12);
    const fm = new THREE.Mesh(frameG, liftMat); fm.position.set(ex, 2.75, ez); fm.rotation.y = rot; root.add(fm);
    const L = {
      x: ld.x, z: ld.z, side: ld.side, open: 1, cx, cz, d,
      panel: { x: cx - d.dx * (CELL / 2 - WALL_T / 2 - 0.02) + tx * 0.9, z: cz - d.dz * (CELL / 2 - WALL_T / 2 - 0.02) + tz * 0.9 },
      set(v) {
        L.open = v;
        for (const p of panels) {
          const off = p.s * (CELL / 4 - 0.02 + v * (CELL / 2 - 0.3));
          p.mesh.position.set(ex + tx * off, 1.25, ez + tz * off);
          p.mesh.updateMatrix();
        }
      },
    };
    L.set(1);
    inst.add('lift_panel', L.panel.x, 1.25, L.panel.z, Math.atan2(d.dx, d.dz));
    lifts.push(L);
  }

  inst.finish();
  root.updateMatrixWorld(true);
  // flashlight shadows: solid level geometry and props cast and receive
  const NOSH = new Set(['ao', 'contact', 'skyeye']);
  root.traverse((o) => {
    if (!o.isMesh || NOSH.has(o.name)) return;
    const m = o.material, solid = m && !m.transparent && !(m.blending && m.blending !== THREE.NormalBlending) && !m.isShaderMaterial && !m.isMeshBasicMaterial;
    o.receiveShadow = !!solid;
    // only separate objects (doors, items, exit) throw shadows; batched props,
    // walls and floors just receive — residents add theirs in game.js
    o.castShadow = !!solid && !o.isInstancedMesh && !o.geometry.attributes.bake;
  });
  return { lifts, chunked: inst.chunked, root, field, lockers, hideMeshes, doors, exitObj, exitGlow: glow, fuseObj, lamps, items, fixtureMats, glowMats: glows.mats, waterMat, poolMats, figures };
}

function itemLift(type) {
  return { eraser: 0.016, fuse: 0.035, key: 0.012, battery: 0.03, note: 0.004, tape: 0.014 }[type] ?? 0.02;
}

// clone a model, converting materials to per-object baked uniform materials
export function cloneWithBake(model, bakeVal, minLight = 0, classify = null) {
  const obj = model.clone(true);
  // merge sibling meshes under the same parent (keeps animated nodes intact)
  const byParent = new Map();
  obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.parent) { if (!byParent.has(o.parent)) byParent.set(o.parent, []); byParent.get(o.parent).push(o); } });
  for (const [parent, meshes] of byParent) {
    if (meshes.length < 2) continue;
    for (const m of meshes) m.updateMatrix();
    const parts = mergeParts(meshes.map((m) => ({ mesh: m, matrix: m.matrix.clone() })), 'matrix', classify);
    if (parts.length >= meshes.length) continue;
    for (const m of meshes) parent.remove(m);
    for (const p of parts) {
      const mesh = p.mesh.isMesh ? p.mesh : new THREE.Mesh(p.mesh.geometry, p.mesh.material);
      if (!p.mesh.isMesh) mesh.name = parent.name + '_merged';
      else mesh.matrix.copy(p.matrix), mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
      parent.add(mesh);
    }
  }
  const mats = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    if (!mats.has(src)) {
      const m = bakeMaterial(src, 'uniform');
      m.userData.bake.value.set(Math.max(minLight, bakeVal[0]), bakeVal[1]);
      mats.set(src, m);
    }
    o.material = mats.get(src);
  });
  obj.userData.bakeMats = [...mats.values()];
  return obj;
}

class Instancer {
  constructor(assets, field, root) {
    this.assets = assets; this.field = field; this.root = root;
    this.groups = new Map(); // key -> {geo, mat, matrices[], bakes[]}
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this.flat = new Map();
    this.chunked = [];
  }
  flatten(key, filter) {
    const ck = key + (filter ? ':f' : '');
    if (this.flat.has(ck)) return this.flat.get(ck);
    const model = this.assets.models[key];
    if (!model) { console.warn('missing model', key); this.flat.set(ck, []); return []; }
    model.updateMatrixWorld(true);
    const parts = [];
    model.traverse((o) => { if (o.isMesh && (!filter || filter(o))) parts.push({ mesh: o, matrix: o.matrixWorld.clone() }); });
    const merged = mergeParts(parts);
    this.flat.set(ck, merged);
    return merged;
  }
  add(key, x, y, z, rot, tag = '', matFn = null, scale = 1) {
    const parts = this.flatten(key);
    this._q.setFromAxisAngle(this._v.set(0, 1, 0), rot);
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this._q, scale === 1 || !scale ? this._s : new THREE.Vector3(scale, scale, scale));
    const b = this.field.sample(x, Math.min(y + 1.0, 2.6), z, null, null, null, null);
    const chunk = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    parts.forEach((p, i) => {
      const gk = key + '#' + i + '#' + tag + '#' + chunk;
      if (!this.groups.has(gk)) {
        let mat = bakeMaterial(p.mesh.material, 'attr');
        if (matFn) mat = matFn(mat);
        this.groups.set(gk, { geo: p.mesh.geometry, mat, matrices: [], bakes: [], chunk, key });
      }
      const g = this.groups.get(gk);
      g.matrices.push(base.clone().multiply(p.matrix));
      g.bakes.push(b[0], b[1]);
    });
  }
  addLockers(list, key, h = HIDE.locker, meshesOut = null) {
    if (!list.length) return [];
    const model = this.assets.models[key];
    if (!model) { console.warn('missing model', key); return []; }
    model.updateMatrixWorld(true);
    const doorNode = model.getObjectByName('Door');
    const inDoor = (o) => { let p = o; while (p) { if (p === doorNode) return true; p = p.parent; } return false; };
    const bodyParts = this.flatten(key, (o) => !inDoor(o));
    let doorParts = [];
    if (doorNode) {
      const inv = new THREE.Matrix4().copy(doorNode.matrixWorld).invert();
      doorNode.traverse((o) => { if (o.isMesh) doorParts.push({ mesh: o, local: inv.clone().multiply(o.matrixWorld) }); });
      doorParts = mergeParts(doorParts, 'local');
    }
    const pivotBase = doorNode ? doorNode.matrixWorld.clone() : new THREE.Matrix4();
    const lockers = [];
    const doorMeshes = doorParts.map((p) => {
      const geo = p.mesh.geometry.clone();
      const im = new THREE.InstancedMesh(geo, bakeMaterial(p.mesh.material, 'attr'), Math.max(1, list.length));
      im.count = list.length;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      this.root.add(im);
      im.userData.pts = list.map((l) => [l.x, l.z]); im.userData.hide = true;
      if (meshesOut) meshesOut.push(im);
      return { im, local: p.local, bake: new Float32Array(list.length * 2) };
    });
    // how the moving part moves: hinge about Y (default) or X, slide, or fold (curtain)
    const doorM = (a) => h.slide ? new THREE.Matrix4().makeTranslation(h.slide[0] * a, h.slide[1] * a, h.slide[2] * a)
      : h.fold ? new THREE.Matrix4().makeScale(Math.max(0.08, 1 - a), 1, 1)
        : h.axis === 'x' ? new THREE.Matrix4().makeRotationX(a) : new THREE.Matrix4().makeRotationY(a);
    list.forEach((l, idx) => {
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), l.rot);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(l.x, 0, l.z), this._q, this._s);
      const b = this.field.sample(l.x, 1.0, l.z, null, null, null, null);
      const chunk = Math.floor(l.x / CHUNK) + ',' + Math.floor(l.z / CHUNK);
      bodyParts.forEach((p, i) => {
        const gk = key + '#body#' + i + '#' + chunk;
        if (!this.groups.has(gk)) this.groups.set(gk, { geo: p.mesh.geometry, mat: bakeMaterial(p.mesh.material, 'attr'), matrices: [], bakes: [], chunk, hide: true });
        const g = this.groups.get(gk);
        g.matrices.push(base.clone().multiply(p.matrix));
        g.bakes.push(b[0], b[1]);
      });
      const locker = {
        ...l, index: idx, angle: 0, target: 0,
        setDoor: (angle) => {
          locker.angle = angle;
          const rotM = doorM(angle);
          for (const dm of doorMeshes) {
            const m = base.clone().multiply(pivotBase).multiply(rotM).multiply(dm.local);
            dm.im.setMatrixAt(idx, m);
            dm.im.instanceMatrix.needsUpdate = true;
          }
        },
      };
      for (const dm of doorMeshes) { dm.bake[idx * 2] = b[0]; dm.bake[idx * 2 + 1] = b[1]; }
      locker.setDoor(0);
      lockers.push(locker);
    });
    for (const dm of doorMeshes) {
      dm.im.geometry.setAttribute('bake', new THREE.InstancedBufferAttribute(dm.bake, 2));
      // cull the door batch like everything else; the sphere is padded for the swing
      dm.im.computeBoundingSphere(); dm.im.boundingSphere.radius += 1.2; dm.im.frustumCulled = true;
    }
    return lockers;
  }
  finish() {
    for (const g of this.groups.values()) {
      const geo = g.geo.clone();
      geo.setAttribute('bake', new THREE.InstancedBufferAttribute(new Float32Array(g.bakes), 2));
      const im = new THREE.InstancedMesh(geo, g.mat, g.matrices.length);
      g.matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      im.name = g.key || '';
      const [cx, cz] = g.chunk.split(',').map(Number);
      im.userData.chunk = { minX: cx * CHUNK, maxX: (cx + 1) * CHUNK, minZ: cz * CHUNK, maxZ: (cz + 1) * CHUNK };
      if (g.hide) im.userData.hide = true;
      this.chunked.push(im);
      this.root.add(im);
    }
  }
}

// ---------------------------------------------------------------------------
// merged vertex-coloured boxes with a per-vertex bake attribute
class BoxBatch {
  constructor() { this.geos = []; }
  add(w, h, d, x, y, z, rotY, color, bake) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(1, 1, 1)));
    this._finish(g, color, bake);
  }
  // box from p0 to p1 (any direction) with a square section
  beam(p0, p1, t, color, bake) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(t, t, len);
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    g.applyMatrix4(m);
    this._finish(g, color, bake);
  }
  _finish(g, color, bake) {
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, col = new Float32Array(n * 3), bk = new Float32Array(n * 2);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; bk[i * 2] = bake[0]; bk[i * 2 + 1] = bake[1]; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('bake', new THREE.BufferAttribute(bk, 2));
    this.geos.push(g);
  }
  mesh() {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos, false), bakeMaterial(VC_SRC, 'attr'));
    m.matrixAutoUpdate = false;
    return m;
  }
}
const GLASS = new THREE.MeshBasicMaterial({ color: 0x9fb8b4, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });

function buildRails(map, gen, def, root, field, gb, texFor, openAbove) {
  const style = def.rail || 'bars';
  const boxes = new BoxBatch(), glass = [];
  const seen = new Set();
  const stairRoom = new Set(gen.rooms.filter((r) => r.type === 'stairs').map((r) => r.id));
  const col = def.railColor || { parapet: 0xd8d0bb, bars: 0x6d7378, glass: 0xc9cfd1 }[style];
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
    const r = map.reg(x, z);
    if (r < 0 || stairRoom.has(r)) continue;
    for (const d of DIRS) {
      if (map.edge(x, z, d) !== EDGE.RAIL) continue;
      const k = map.edgeKey(x, z, d);
      if (seen.has(k)) continue; seen.add(k);
      if (stairRoom.has(map.reg(x + d.dx, z + d.dz))) continue;
      const [cx, cz] = map.center(x, z);
      const px = cx + d.dx * CELL / 2, pz = cz + d.dz * CELL / 2;
      const rot = d.dx !== 0 ? Math.PI / 2 : 0;          // box length along the edge
      const tx = d.dz !== 0 ? 1 : 0, tz = d.dx !== 0 ? 1 : 0;
      const bk = field.sample(cx, 0.9, cz, null, null, null, null);
      if (style === 'parapet') {
        boxes.add(CELL + 0.02, 1.0, 0.2, px, 0.5, pz, rot, col, bk);
        boxes.add(CELL + 0.02, 0.06, 0.28, px, 1.03, pz, rot, def.railCap || 0x8c8778, bk);
      } else if (style === 'glass') {
        boxes.add(CELL, 0.07, 0.09, px, 1.06, pz, rot, col, bk);
        boxes.add(0.08, 1.06, 0.08, px - tx * CELL / 2, 0.53, pz - tz * CELL / 2, 0, col, bk);
        const g = new THREE.PlaneGeometry(CELL - 0.1, 0.98);
        g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, 0.54, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1)));
        glass.push(g);
      } else {
        boxes.add(CELL, 0.06, 0.06, px, 1.02, pz, rot, col, bk);
        boxes.add(CELL, 0.04, 0.04, px, 0.12, pz, rot, col, bk);
        for (let s = -CELL / 2 + 0.1; s < CELL / 2 - 0.05; s += 0.16) boxes.add(0.025, 0.9, 0.025, px + tx * s, 0.57, pz + tz * s, 0, col, bk);
      }
    }
  }
  const m = boxes.mesh(); if (m) root.add(m);
  if (glass.length) { const gm = new THREE.Mesh(mergeGeometries(glass, false), GLASS); gm.renderOrder = 3; root.add(gm); }
}

// full-height shop windows with slim mullions
function buildGlass(map, root, field) {
  const boxes = new BoxBatch(), glass = [], seen = new Set();
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) for (const d of DIRS) {
    if (map.reg(x, z) < 0 || map.edge(x, z, d) !== EDGE.GLASS) continue;
    const k = map.edgeKey(x, z, d);
    if (seen.has(k)) continue; seen.add(k);
    const [cx, cz] = map.center(x, z);
    const px = cx + d.dx * CELL / 2, pz = cz + d.dz * CELL / 2;
    const rot = d.dx !== 0 ? Math.PI / 2 : 0, tx = d.dz !== 0 ? 1 : 0, tz = d.dx !== 0 ? 1 : 0;
    const bk = field.sample(cx, 1.4, cz, null, null, null, null);
    boxes.add(CELL, 0.12, WALL_T, px, 0.06, pz, rot, 0x3d4245, bk);
    boxes.add(CELL, 0.08, WALL_T, px, 2.55, pz, rot, 0x3d4245, bk);
    for (const s of [-1.5, 0, 1.5]) boxes.add(0.07, 2.5, WALL_T, px + tx * s, 1.3, pz + tz * s, 0, 0x3d4245, bk);
    const g = new THREE.PlaneGeometry(CELL, 2.4);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(px, 1.32, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1)));
    glass.push(g);
  }
  const m = boxes.mesh(); if (m) root.add(m);
  if (glass.length) { const gm = new THREE.Mesh(mergeGeometries(glass, false), SHOPGLASS); gm.renderOrder = 3; root.add(gm); }
}
const SHOPGLASS = new THREE.MeshBasicMaterial({ color: 0x8fa3a6, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });

// a straight flight of steps (or an escalator) rising FH over the shaft cells
function buildSteps(st, FH, g, field, root, def) {
  const a = [st.d.dx, 0, st.d.dz], l = [-st.d.dz, 0, st.d.dx];
  const [fx, fz] = st.cells[0];
  const c0 = [(fx + 0.5) * CELL - a[0] * CELL / 2, (fz + 0.5) * CELL - a[2] * CELL / 2];  // bottom edge middle
  const L = st.len * CELL, n = Math.round(FH / 0.18), h = FH / n, run = L / n;
  const wid = st.escalator ? 1.6 : st.open ? CELL - 0.7 : CELL - WALL_T;
  const O = (s, y, w) => [c0[0] + a[0] * s + l[0] * w, y, c0[1] + a[2] * s + l[2] * w];
  const bk = (s) => field.sample(c0[0] + a[0] * s, 1.2, c0[1] + a[2] * s, null, null, null, null);
  const uv = (p) => [(p[0] * Math.abs(l[0]) + p[2] * Math.abs(l[2])) / CELL, (p[0] * Math.abs(a[0]) + p[2] * Math.abs(a[2])) / CELL + p[1] / CELL];
  for (let i = 0; i < n; i++) {
    const s0 = i * run, y0 = i * h, b = bk(s0);
    g.quadGrid(O(s0, y0, -wid / 2), l, [0, 1, 0], wid, h, 1, 1, [-a[0], 0, -a[2]], uv, () => b);       // riser
    g.quadGrid(O(s0, y0 + h, -wid / 2), l, a, wid, run, 1, 1, [0, 1, 0], uv, () => b);                // tread
  }
  if (st.open) { // free-standing steel flight: stringers, handrails and posts
    const bx = new BoxBatch(), steel = 0x55595b, b0 = bk(L / 2);
    for (const side of [-1, 1]) {
      const w = side * (wid / 2 + 0.05);
      bx.beam(O(0, -0.1, w), O(L, FH - 0.1, w), 0.22, steel, b0);
      bx.beam(O(0, 1.0, w), O(L, FH + 1.0, w), 0.05, steel, b0);
      for (let s = 0.3; s < L; s += 1.2) bx.beam(O(s, s / L * FH, w), O(s, s / L * FH + 1.0, w), 0.04, steel, b0);
    }
    const ug = new THREE.BoxGeometry(wid, 0.12, Math.hypot(L, FH));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...O(0, 0, 0)), new THREE.Vector3(...O(L, FH, 0)), new THREE.Vector3(0, 1, 0));
    m.setPosition(new THREE.Vector3(...O(L / 2, FH / 2 - 0.12, 0)));
    ug.applyMatrix4(m); bx._finish(ug, 0x3b3e40, b0);
    root.add(bx.mesh());
    return;
  }
  if (!st.escalator) return;
  // escalator: steel side skirts, sloped handrails and glass balustrades
  const boxes = new BoxBatch(), glass = [];
  const steel = 0x8e9397, belt = 0x1d1f20;
  const b0 = bk(L / 2);
  for (const side of [-1, 1]) {
    const w = side * (wid / 2 + 0.06);
    boxes.beam(O(-0.6, 0.05, w), O(0, 0.05, w), 0.16, steel, b0);
    boxes.beam(O(0, 0.05, w), O(L, FH + 0.05, w), 0.16, steel, b0);
    boxes.beam(O(L, FH + 0.05, w), O(L + 0.6, FH + 0.05, w), 0.16, steel, b0);
    boxes.beam(O(-0.5, 1.0, w), O(0.2, 1.0, w), 0.09, belt, b0);
    boxes.beam(O(0.2, 1.0, w), O(L - 0.2, FH + 1.0, w), 0.09, belt, b0);
    boxes.beam(O(L - 0.2, FH + 1.0, w), O(L + 0.5, FH + 1.0, w), 0.09, belt, b0);
    // glass: parallelogram between skirt and handrail
    const q = new THREE.BufferGeometry();
    const P = [O(0.2, 0.1, w), O(L - 0.2, FH - 0.2, w), O(L - 0.2, FH + 0.95, w), O(0.2, 0.95, w)].flat();
    q.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); q.setIndex([0, 1, 2, 0, 2, 3]);
    glass.push(q);
  }
  // the dark underside of the truss
  const ug = new THREE.BoxGeometry(wid + 0.3, 0.5, Math.hypot(L, FH));
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...O(0, -0.2, 0)), new THREE.Vector3(...O(L, FH - 0.2, 0)), new THREE.Vector3(0, 1, 0));
  m.setPosition(new THREE.Vector3(...O(L / 2, FH / 2 - 0.25, 0)));
  ug.applyMatrix4(m); boxes._finish(ug, 0x5d6266, b0);
  const bm = boxes.mesh(); if (bm) root.add(bm);
  if (glass.length) { const gm = new THREE.Mesh(mergeGeometries(glass, false), GLASS); gm.renderOrder = 3; root.add(gm); }
}

// wherever a level opens to the sky, the sky is one enormous eye
function skyMesh(cells) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of cells) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  const w = (x1 - x0 + 1) * CELL + 24, d = (z1 - z0 + 1) * CELL + 24;
  const m = skyEye(w, d);
  m.position.set((x0 + x1 + 1) / 2 * CELL, WALL_H + 9, (z0 + z1 + 1) / 2 * CELL);
  return m;
}

// painted room-name plates above doors: one atlas, one draw call
function signsMesh(signs, field) {
  const keyOf = (s) => (s.style || 'plate') + '|' + s.text;
  const texts = [...new Set(signs.map(keyOf))];
  const RH = 96, c = document.createElement('canvas'); c.width = 512; c.height = RH * texts.length;
  const g = c.getContext('2d');
  const STY = { plate: ['#1f3a2c', '#d8cfb2', '#e8e0c6'], mall: ['#ece6d8', '#a8342c', '#a8342c'], neon: ['#141414', '#3fa7b3', '#7fe3ee'] };
  texts.forEach((key, i) => {
    // style may also be a custom palette 'bg,frame,letters[,font]' (mall brand plates)
    const [st, t] = key.split('|'), [bg, line, fg, font] = STY[st] || (st[0] === '#' ? st.split(',') : STY.plate);
    const y = i * RH;
    g.fillStyle = bg; g.fillRect(0, y, 512, RH);
    g.strokeStyle = line; g.lineWidth = 6; g.strokeRect(8, y + 8, 496, RH - 16);
    g.fillStyle = fg; g.font = `bold 50px ${font || 'Arial, sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 256, y + 52, 470);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  const geos = signs.map((sg) => {
    const pg = new THREE.PlaneGeometry(sg.w || 1.15, sg.h || 0.22);
    const i = texts.indexOf(keyOf(sg)), uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (i + (1 - uv.getY(k))) / texts.length);
    pg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(sg.x, sg.y, sg.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg.rot), new THREE.Vector3(1, 1, 1)));
    const b = field.sample(sg.x, 2.3, sg.z, null, null, null, null), n = pg.attributes.position.count, bk = new Float32Array(n * 2);
    const lit = sg.style === 'mall' || sg.glow;
    // about one lit sign in four has a failing tube: its glow rides the flicker signal
    const bad = lit && ((Math.floor(sg.x * 7.3 + sg.z * 3.1) % 4 + 4) % 4) === 0;
    for (let k = 0; k < n; k++) { bk[k * 2] = bad ? Math.max(0.1, b[0]) : Math.max(lit ? 0.45 : 0.12, b[0]); bk[k * 2 + 1] = bad ? b[1] + 0.4 : b[1]; }
    pg.setAttribute('bake', new THREE.BufferAttribute(bk, 2));
    return pg;
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), bakeMaterial(new THREE.MeshLambertMaterial({ map: tex }), 'attr'));
  m.matrixAutoUpdate = false;
  return m;
}

// water slides: an open half-pipe swept along the path, on thin legs
export function buildSlides(slides, root, floorAt) {
  for (const S of slides) {
    const curve = new THREE.CatmullRomCurve3(S.pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    S.curve = curve; S.length = curve.getLength();
    const n = Math.max(24, Math.round(S.length * 3)), seg = 12, R = 0.62;
    const pos = [], nrm = [], col = [], bk = [], idx = [];
    const c = new THREE.Color(S.color), inner = c.clone().multiplyScalar(1.15);
    const frames = curve.computeFrenetFrames(n, false);
    const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), down = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const P = curve.getPointAt(i / n), T = frames.tangents[i];
      side.crossVectors(T, up).normalize(); down.crossVectors(side, T).normalize().negate();
      for (let j = 0; j <= seg; j++) {
        const a = Math.PI * (0.08 + 0.84 * j / seg);       // U from one lip to the other
        const ox = Math.cos(a), oy = Math.sin(a);
        const v = new THREE.Vector3().addScaledVector(side, ox * R).addScaledVector(down, oy * R);
        pos.push(P.x + v.x, P.y + v.y + R * 0.55, P.z + v.z);
        const nn = v.clone().normalize().negate();
        nrm.push(nn.x, nn.y, nn.z);
        const cc = j % 3 === 0 ? c : inner; col.push(cc.r, cc.g, cc.b);
        bk.push(0.75, 0);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('bake', new THREE.Float32BufferAttribute(bk, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, bakeMaterial(VC_SRC_2S, 'attr'));
    m.frustumCulled = false;
    root.add(m);
    // legs down to whatever floor is below
    const legs = new BoxBatch();
    const samples = curve.getSpacedPoints(Math.round(S.length * 2));
    for (let s = 2.5; s < S.length - 1; s += 4.5) {
      const P = curve.getPointAt(s / S.length);
      // a leg may not pass through a lower part of the same slide (spirals)
      if (samples.some((q) => q.y < P.y - 0.6 && Math.hypot(q.x - P.x, q.z - P.z) < 1.0)) continue;
      const y0 = floorAt(P.x, P.y, P.z);
      if (P.y - y0 > 0.4) legs.beam([P.x, y0, P.z], [P.x, P.y, P.z], 0.09, 0xc9cfd1, [0.6, 0]);
    }
    const lm = legs.mesh(); if (lm) root.add(lm);
  }
}
