// Turns generator output into Three.js meshes: merged wall/floor/ceiling
// geometry with baked light, instanced props (chunked for culling), and
// individually animated doors, lockers and items.
import * as THREE from 'three';
import { CELL, WALL_H, WALL_T, DOOR_W, DOOR_H, POOL_Y } from '../config.js';
import { DIRS, EDGE, VOID } from './map.js';
import { bakeMaterial, LightField } from '../render/bake.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One shared vertex-colour material for all merged opaque props.
const VC_SRC = new THREE.MeshLambertMaterial({ vertexColors: true });
VC_SRC.name = 'MergedVC';
const VC_SRC_2S = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
VC_SRC_2S.name = 'MergedVC2S';

// Merge every opaque, non-emissive, untextured mesh of a model into a single
// vertex-coloured geometry (1 draw call instead of 1 per material).
// parts: [{mesh, matrix}] (matrix = mesh transform in model space)
function mergeParts(parts, key = 'matrix') {
  const keep = [], groups = { front: [], double: [] };
  for (const p of parts) {
    const m = p.mesh.material;
    if (!m || m.transparent || m.map || (m.userData && m.userData.emissive)) { keep.push(p); continue; }
    const geos = m.side === THREE.FrontSide ? groups.front : groups.double;
    const g = p.mesh.geometry.clone().applyMatrix4(p[key]);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  if (groups.front.length + groups.double.length < 2) return parts;
  const out = [];
  for (const [list, mat] of [[groups.front, VC_SRC], [groups.double, VC_SRC_2S]]) {
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
  CHUNK = def.layout ? 54 : 24;   // big hand-made buildings: fewer, larger prop batches
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
    if (r >= 0 && !noFloor[i]) gb(texFor(r, 'floor')).quadGrid([x * CELL, 0, (z + 1) * CELL], [1, 0, 0], [0, 0, -1], CELL, CELL, 2, 2, [0, 1, 0],
      (p) => [p[0] / CELL, -p[2] / CELL], (p) => field.sample(p[0], 0, p[2], 0, 1, 0, c));
    if (openAbove[i]) continue;
    if (noCeil[i]) { sky.push([x, z]); continue; }
    gb(texFor(r, 'ceil')).quadGrid([x * CELL, WALL_H, z * CELL], [1, 0, 0], [0, 0, 1], CELL, CELL, 2, 2, [0, -1, 0],
      (p) => [p[0] / ceilTile, p[2] / ceilTile], (p) => { const s = field.sample(p[0], WALL_H, p[2], null, null, null, c); return [s[0] * 0.55, s[1] * 0.55]; });
  }

  // ---------- walls ----------
  const isSolid = (x, z, d) => { const e = map.edge(x, z, d); return e === EDGE.WALL || e === EDGE.DOOR; };
  const perp = (d) => DIRS.filter((t) => t.dx !== d.dx && t.dz !== d.dz && !(t.dx === -d.dx && t.dz === -d.dz) && (t.dx * d.dx + t.dz * d.dz === 0));
  const wallTop = (i) => (openAbove[i] ? FH : WALL_H);
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
        const steps = Math.max(1, Math.round((s1 - s0) / 0.75));
        const vs = Math.max(1, Math.round((y1 - y0) / 1.0));
        wb.quadGrid(o, tan, [0, 1, 0], s1 - s0, y1 - y0, steps, vs, normal, uvFn, bakeFn);
      };
      if (hole) {
        seg(a, -hole[0], 0, top);
        seg(hole[0], b, 0, top);
        seg(-hole[0], hole[0], hole[1], top);
      } else seg(a, b, 0, top);
    }
  }

  // ---------- stairs / escalators ----------
  for (const st of gen.steps || []) buildSteps(st, FH, gb(st.mat || texFor(0, 'floor')), field, root, def);

  // ---------- railings round open space ----------
  buildRails(map, gen, def, root, field, gb, texFor, openAbove);

  const tex = (k) => { const t = T[k]; if (!t) console.warn('missing texture', k); return t || T.wall_hall; };
  const mkMat = (map_) => bakeMaterial(new THREE.MeshLambertMaterial({ map: map_ }), 'attr');
  for (const [k, g] of gbs) {
    if (!g.pos.length) continue;
    const m = new THREE.Mesh(g.build(), mkMat(tex(k)));
    m.matrixAutoUpdate = false;
    root.add(m);
  }
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
    for (const w of gen.water) {
      const sx = w.maxX - w.minX, sz = w.maxZ - w.minZ;
      const g = new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx / 3, uv.getY(i) * sz / 3);
      const m = new THREE.Mesh(g, waterMat);
      m.position.set((w.minX + w.maxX) / 2, POOL_Y, (w.minZ + w.maxZ) / 2);
      m.renderOrder = 2;
      root.add(m);
      // dark navy lane lines on the pool floor, seen through the water
      const alongX = sx >= sz;
      for (let k = 1.5; k < (alongX ? sz : sx) - 0.5; k += 3) {
        const lg = new THREE.PlaneGeometry(alongX ? sx - 2 : 0.25, alongX ? 0.25 : sz - 2).rotateX(-Math.PI / 2);
        const l = new THREE.Mesh(lg, lm);
        l.position.set(alongX ? (w.minX + w.maxX) / 2 : w.minX + k, 0.008, alongX ? w.minZ + k : (w.minZ + w.maxZ) / 2);
        root.add(l);
      }
      // white coping strip around the edge
      for (const [cx, cz, ex, ez] of [[(w.minX + w.maxX) / 2, w.minZ - 0.15, sx + 0.6, 0.3], [(w.minX + w.maxX) / 2, w.maxZ + 0.15, sx + 0.6, 0.3],
        [w.minX - 0.15, (w.minZ + w.maxZ) / 2, 0.3, sz], [w.maxX + 0.15, (w.minZ + w.maxZ) / 2, 0.3, sz]]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(ex, 0.06, ez), cm);
        c.position.set(cx, 0.03, cz);
        root.add(c);
      }
    }
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
  const FIG = ['figure_stand', 'figure_reach', 'figure_kneel'];
  const figures = [];
  for (const p of gen.props) if (!FIG.includes(p.type)) inst.add(p.type, p.x, p.y || 0, p.z, p.rot);
  for (const kind of FIG) {
    const list = gen.props.filter((p) => p.type === kind);
    if (!list.length) continue;
    const parts = inst.flatten(kind);
    const ims = parts.map((pt) => {
      const geo = pt.mesh.geometry.clone();
      const bake = new Float32Array(list.length * 2);
      list.forEach((f, i) => { const b = field.sample(f.x, 1.2, f.z, null, null, null, null); bake[i * 2] = b[0]; bake[i * 2 + 1] = b[1]; });
      geo.setAttribute('bake', new THREE.InstancedBufferAttribute(bake, 2));
      const im = new THREE.InstancedMesh(geo, bakeMaterial(pt.mesh.material, 'attr'), list.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      root.add(im);
      return { im, local: pt.matrix };
    });
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    list.forEach((f, idx) => {
      const fig = { x: f.x, z: f.z, rot: f.rot, set(rot) {
        fig.rot = rot;
        const base = new THREE.Matrix4().compose(new THREE.Vector3(f.x, 0, f.z), q.setFromAxisAngle(up, rot), one);
        for (const m of ims) { m.im.setMatrixAt(idx, base.clone().multiply(m.local)); m.im.instanceMatrix.needsUpdate = true; }
      } };
      fig.set(f.rot);
      figures.push(fig);
    });
  }
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
  const lockers = [
    ...inst.addLockers(gen.lockers.filter((l) => l.kind !== 'stall'), 'school_locker'),
    ...inst.addLockers(gen.lockers.filter((l) => l.kind === 'stall'), 'toilet_stall'),
  ];
  inst.finish();

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

  root.updateMatrixWorld(true);
  return { chunked: inst.chunked, root, field, lockers, doors, exitObj, exitGlow: glow, fuseObj, lamps, items, fixtureMats, waterMat, poolMats, figures };
}

function itemLift(type) {
  return { eraser: 0.016, fuse: 0.035, key: 0.012, battery: 0.03, note: 0.004, tape: 0.014 }[type] ?? 0.02;
}

// clone a model, converting materials to per-object baked uniform materials
export function cloneWithBake(model, bakeVal, minLight = 0) {
  const obj = model.clone(true);
  // merge sibling meshes under the same parent (keeps animated nodes intact)
  const byParent = new Map();
  obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.parent) { if (!byParent.has(o.parent)) byParent.set(o.parent, []); byParent.get(o.parent).push(o); } });
  for (const [parent, meshes] of byParent) {
    if (meshes.length < 2) continue;
    for (const m of meshes) m.updateMatrix();
    const parts = mergeParts(meshes.map((m) => ({ mesh: m, matrix: m.matrix.clone() })));
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
  add(key, x, y, z, rot, tag = '', matFn = null) {
    const parts = this.flatten(key);
    this._q.setFromAxisAngle(this._v.set(0, 1, 0), rot);
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this._q, this._s);
    const b = this.field.sample(x, Math.min(y + 1.0, 2.6), z, null, null, null, null);
    const chunk = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    parts.forEach((p, i) => {
      const gk = key + '#' + i + '#' + tag + '#' + chunk;
      if (!this.groups.has(gk)) {
        let mat = bakeMaterial(p.mesh.material, 'attr');
        if (matFn) mat = matFn(mat);
        this.groups.set(gk, { geo: p.mesh.geometry, mat, matrices: [], bakes: [], chunk });
      }
      const g = this.groups.get(gk);
      g.matrices.push(base.clone().multiply(p.matrix));
      g.bakes.push(b[0], b[1]);
    });
  }
  addLockers(list, key) {
    if (!list.length) return [];
    const model = this.assets.models[key];
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
      return { im, local: p.local, bake: new Float32Array(list.length * 2) };
    });
    list.forEach((l, idx) => {
      this._q.setFromAxisAngle(this._v.set(0, 1, 0), l.rot);
      const base = new THREE.Matrix4().compose(new THREE.Vector3(l.x, 0, l.z), this._q, this._s);
      const b = this.field.sample(l.x, 1.0, l.z, null, null, null, null);
      const chunk = Math.floor(l.x / CHUNK) + ',' + Math.floor(l.z / CHUNK);
      bodyParts.forEach((p, i) => {
        const gk = key + '#body#' + i + '#' + chunk;
        if (!this.groups.has(gk)) this.groups.set(gk, { geo: p.mesh.geometry, mat: bakeMaterial(p.mesh.material, 'attr'), matrices: [], bakes: [], chunk });
        const g = this.groups.get(gk);
        g.matrices.push(base.clone().multiply(p.matrix));
        g.bakes.push(b[0], b[1]);
      });
      const locker = {
        ...l, index: idx, angle: 0, target: 0,
        setDoor: (angle) => {
          locker.angle = angle;
          const rotM = new THREE.Matrix4().makeRotationY(angle);
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
    for (const dm of doorMeshes) dm.im.geometry.setAttribute('bake', new THREE.InstancedBufferAttribute(dm.bake, 2));
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
      const [cx, cz] = g.chunk.split(',').map(Number);
      im.userData.chunk = { minX: cx * CHUNK, maxX: (cx + 1) * CHUNK, minZ: cz * CHUNK, maxZ: (cz + 1) * CHUNK };
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

// a straight flight of steps (or an escalator) rising FH over the shaft cells
function buildSteps(st, FH, g, field, root, def) {
  const a = [st.d.dx, 0, st.d.dz], l = [-st.d.dz, 0, st.d.dx];
  const [fx, fz] = st.cells[0];
  const c0 = [(fx + 0.5) * CELL - a[0] * CELL / 2, (fz + 0.5) * CELL - a[2] * CELL / 2];  // bottom edge middle
  const L = st.len * CELL, n = Math.round(FH / 0.18), h = FH / n, run = L / n;
  const wid = st.escalator ? 1.6 : CELL - WALL_T;
  const O = (s, y, w) => [c0[0] + a[0] * s + l[0] * w, y, c0[1] + a[2] * s + l[2] * w];
  const bk = (s) => field.sample(c0[0] + a[0] * s, 1.2, c0[1] + a[2] * s, null, null, null, null);
  const uv = (p) => [(p[0] * Math.abs(l[0]) + p[2] * Math.abs(l[2])) / CELL, (p[0] * Math.abs(a[0]) + p[2] * Math.abs(a[2])) / CELL + p[1] / CELL];
  for (let i = 0; i < n; i++) {
    const s0 = i * run, y0 = i * h, b = bk(s0);
    g.quadGrid(O(s0, y0, -wid / 2), l, [0, 1, 0], wid, h, 1, 1, [-a[0], 0, -a[2]], uv, () => b);       // riser
    g.quadGrid(O(s0, y0 + h, -wid / 2), l, a, wid, run, 1, 1, [0, 1, 0], uv, () => b);                // tread
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

// starry night over open-air cells
let SKY_TEX = null;
function skyMesh(cells) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of cells) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  if (!SKY_TEX) {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(256, 256, 30, 256, 256, 360); gr.addColorStop(0, '#0b1222'); gr.addColorStop(1, '#03050a');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) { const a = Math.random(); g.fillStyle = `rgba(220,226,255,${0.25 + a * 0.6})`; g.fillRect(Math.random() * 512, Math.random() * 512, a > 0.93 ? 2 : 1, a > 0.93 ? 2 : 1); }
    g.fillStyle = 'rgba(214,220,200,0.9)'; g.beginPath(); g.arc(380, 140, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(3,5,10,1)'; g.beginPath(); g.arc(388, 134, 14, 0, Math.PI * 2); g.fill();
    SKY_TEX = new THREE.CanvasTexture(c); SKY_TEX.colorSpace = THREE.SRGBColorSpace;
  }
  const w = (x1 - x0 + 1) * CELL + 40, d = (z1 - z0 + 1) * CELL + 40;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: SKY_TEX, fog: false }));
  m.position.set((x0 + x1 + 1) / 2 * CELL, WALL_H + 9, (z0 + z1 + 1) / 2 * CELL);
  return m;
}

// painted room-name plates above doors: one atlas, one draw call
function signsMesh(signs, field) {
  const texts = [...new Set(signs.map((s) => s.text))];
  const RH = 96, c = document.createElement('canvas'); c.width = 512; c.height = RH * texts.length;
  const g = c.getContext('2d');
  texts.forEach((t, i) => {
    const y = i * RH;
    g.fillStyle = '#1f3a2c'; g.fillRect(0, y, 512, RH);
    g.strokeStyle = '#d8cfb2'; g.lineWidth = 6; g.strokeRect(8, y + 8, 496, RH - 16);
    g.fillStyle = '#e8e0c6'; g.font = 'bold 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 256, y + 52, 470);
  });
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  const geos = signs.map((sg) => {
    const pg = new THREE.PlaneGeometry(1.15, 0.22);
    const i = texts.indexOf(sg.text), uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, (i + (1 - uv.getY(k))) / texts.length);
    pg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(sg.x, sg.y, sg.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg.rot), new THREE.Vector3(1, 1, 1)));
    const b = field.sample(sg.x, 2.3, sg.z, null, null, null, null), n = pg.attributes.position.count, bk = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { bk[k * 2] = Math.max(0.12, b[0]); bk[k * 2 + 1] = b[1]; }
    pg.setAttribute('bake', new THREE.BufferAttribute(bk, 2));
    return pg;
  });
  const m = new THREE.Mesh(mergeGeometries(geos, false), bakeMaterial(new THREE.MeshLambertMaterial({ map: tex }), 'attr'));
  m.matrixAutoUpdate = false;
  return m;
}
