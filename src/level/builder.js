// Turns generator output into Three.js meshes: merged wall/floor/ceiling
// geometry with baked light, instanced props (chunked for culling), and
// individually animated doors, lockers and items.
import * as THREE from 'three';
import { CELL, WALL_H, WALL_T, DOOR_W, DOOR_H } from '../config.js';
import { DIRS, EDGE } from './map.js';
import { bakeMaterial, LightField } from '../render/bake.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// One shared vertex-colour material for all merged opaque props.
const VC_SRC = new THREE.MeshLambertMaterial({ vertexColors: true });
VC_SRC.name = 'MergedVC';

// Merge every opaque, non-emissive, untextured mesh of a model into a single
// vertex-coloured geometry (1 draw call instead of 1 per material).
// parts: [{mesh, matrix}] (matrix = mesh transform in model space)
function mergeParts(parts, key = 'matrix') {
  const keep = [], geos = [];
  for (const p of parts) {
    const m = p.mesh.material;
    if (!m || m.transparent || m.map || (m.userData && m.userData.emissive)) { keep.push(p); continue; }
    const g = p.mesh.geometry.clone().applyMatrix4(p[key]);
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g.index ? g.toNonIndexed() : g);
  }
  if (geos.length < 2) return parts;
  const merged = mergeGeometries(geos, false);
  if (!merged) return parts;
  return [{ mesh: { geometry: merged, material: VC_SRC }, [key]: new THREE.Matrix4() }, ...keep];
}

const CHUNK = 24;

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

export function buildLevel(gen, assets, def) {
  const { map } = gen;
  const root = new THREE.Group();
  const field = new LightField(map, gen.lights);
  const T = assets.textures;
  const tiled = new Set([0, ...gen.rooms.filter((r) => r.type === 'restroom').map((r) => r.id)]);

  // ---------- floors & ceilings ----------
  const floorHall = new GeoBuilder(), floorRoom = new GeoBuilder(), ceil = new GeoBuilder();
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
    const r = map.reg(x, z);
    if (r < 0) continue;
    const c = map.center(x, z);
    const fb = tiled.has(r) ? floorHall : floorRoom;
    fb.quadGrid([x * CELL, 0, (z + 1) * CELL], [1, 0, 0], [0, 0, -1], CELL, CELL, 2, 2, [0, 1, 0],
      (p) => [p[0] / CELL, -p[2] / CELL], (p) => field.sample(p[0], 0, p[2], 0, 1, 0, c));
    ceil.quadGrid([x * CELL, WALL_H, z * CELL], [1, 0, 0], [0, 0, 1], CELL, CELL, 2, 2, [0, -1, 0],
      (p) => [p[0] / 1.2, p[2] / 1.2], (p) => { const s = field.sample(p[0], WALL_H, p[2], null, null, null, c); return [s[0] * 0.55, s[1] * 0.55]; });
  }

  // ---------- walls ----------
  const wallHall = new GeoBuilder(), wallRoom = new GeoBuilder();
  const isSolid = (x, z, d) => { const e = map.edge(x, z, d); return e === EDGE.WALL || e === EDGE.DOOR; };
  const perp = (d) => DIRS.filter((t) => t.dx !== d.dx && t.dz !== d.dz && !(t.dx === -d.dx && t.dz === -d.dz) && (t.dx * d.dx + t.dz * d.dz === 0));
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
    const r = map.reg(x, z);
    if (r < 0) continue;
    const c = map.center(x, z);
    const gb = tiled.has(r) ? wallHall : wallRoom;
    for (const d of DIRS) {
      if (!isSolid(x, z, d)) continue;
      const k = map.edgeKey(x, z, d);
      // wall plane position (offset into this cell)
      const off = CELL / 2 - WALL_T / 2;
      const px = c[0] + d.dx * off, pz = c[1] + d.dz * off;
      const normal = [-d.dx, 0, -d.dz];
      // tangent such that tangent x up = normal => quads face the cell
      const tan = cross([0, 1, 0], normal); // (up x n) x up = n -> front-facing
      const tz = perp(d);
      // extents along tangent
      let a = -CELL / 2, b = CELL / 2;
      for (const t of tz) {
        const sign = t.dx * tan[0] + t.dz * tan[2]; // +1 if t aligns with tangent
        const extend = !isSolid(x, z, t) && !isSolid(x + t.dx, z + t.dz, d) && map.reg(x + t.dx, z + t.dz) >= 0;
        if (sign > 0) b = extend ? CELL / 2 + WALL_T / 2 : CELL / 2;
        else a = extend ? -CELL / 2 - WALL_T / 2 : -CELL / 2;
      }
      const door = map.doors.get(k);
      const isExit = k === gen.map.exitKey;
      const hole = door ? [DOOR_W / 2, DOOR_H] : isExit ? [1.0, 2.4] : null;
      const uvFn = (p) => [(p[0] * Math.abs(tan[0]) + p[2] * Math.abs(tan[2])) / CELL, p[1] / WALL_H];
      const bakeFn = (p) => field.sample(p[0], p[1], p[2], normal[0], 0, normal[2], c);
      const seg = (s0, s1, y0, y1) => {
        if (s1 - s0 < 0.001 || y1 - y0 < 0.001) return;
        const o = [px + tan[0] * s0, y0, pz + tan[2] * s0];
        const steps = Math.max(1, Math.round((s1 - s0) / 0.75));
        const vs = y1 - y0 > 1.5 ? 3 : 1;
        gb.quadGrid(o, tan, [0, 1, 0], s1 - s0, y1 - y0, steps, vs, normal, uvFn, bakeFn);
      };
      if (hole) {
        seg(a, -hole[0], 0, WALL_H);
        seg(hole[0], b, 0, WALL_H);
        seg(-hole[0], hole[0], hole[1], WALL_H);
      } else seg(a, b, 0, WALL_H);
    }
  }

  const tex = (k, rx = 1, ry = 1) => { const t = T[k]; t.repeat.set(rx, ry); return t; };
  const mkMat = (map_) => bakeMaterial(new THREE.MeshLambertMaterial({ map: map_ }), 'attr');
  const meshes = [
    [floorHall, tex('floor_tile')], [floorRoom, tex('floor_classroom')],
    [ceil, tex('ceiling_tile')], [wallHall, tex('wall_hall')], [wallRoom, tex('wall_classroom')],
  ];
  for (const [gb, t] of meshes) {
    if (!gb.pos.length) continue;
    const m = new THREE.Mesh(gb.build(), mkMat(t));
    m.matrixAutoUpdate = false;
    root.add(m);
  }

  // ---------- floor decals ----------
  if (gen.decals.length) {
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
  for (const p of gen.props) inst.add(p.type, p.x, p.y || 0, p.z, p.rot);
  // ceiling fixtures, grouped by state so emissive can differ
  const fixtureMats = { on: null, off: null, flicker: null };
  for (const l of gen.lights) inst.add('ceiling_light', l.x, WALL_H, l.z, l.rot, 'light_' + l.state, (m) => {
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
  const exitObj = cloneWithBake(assets.models.exit_door, [0.7, 0]);
  exitObj.position.set(ex.x - ex.d.dx * 0.0, 0, ex.z - ex.d.dz * 0.0);
  exitObj.rotation.y = ex.rot;
  root.add(exitObj);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.4), glowMat);
  glow.position.set(ex.x + ex.d.dx * 0.12, 1.2, ex.z + ex.d.dz * 0.12);
  glow.rotation.y = ex.rot;
  root.add(glow);
  const fb = gen.fusebox;
  const fuseObj = cloneWithBake(assets.models.fuse_box, field.sample(fb.x, 1.4, fb.z, null, null, null, null));
  fuseObj.position.set(fb.x, 0, fb.z);
  fuseObj.rotation.y = fb.rot;
  root.add(fuseObj);
  const lamps = [1, 2, 3].map((i) => fuseObj.getObjectByName('Lamp' + i)).filter(Boolean);
  for (const l of lamps) { l.material = l.material.clone(); l.material.emissive = new THREE.Color(0x550000); }

  // ---------- items ----------
  const items = gen.items.map((it) => {
    const key = 'item_' + (it.type === 'note' ? 'note' : it.type);
    const obj = cloneWithBake(assets.models[key], field.sample(it.x, it.y + 0.3, it.z, null, null, null, null), 0.25);
    obj.position.set(it.x, it.y + itemLift(it.type), it.z);
    obj.rotation.y = Math.random() * Math.PI * 2;
    obj.userData.baseY = obj.position.y;
    root.add(obj);
    return { ...it, obj, taken: false };
  });

  root.updateMatrixWorld(true);
  return { chunked: inst.chunked, root, field, lockers, doors, exitObj, exitGlow: glow, fuseObj, lamps, items, fixtureMats };
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
