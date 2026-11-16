// Wet footprints. Out of the water your shoes print the floor for a while;
// the prints dry out over about forty seconds. Residents that come across a
// fresh trail follow it to its newest end.
import * as THREE from 'three';

const MAX = 160, DRY = 40, WET_FOR = 22, STRIDE = 0.62;
const GEO = (() => {
  // a shoe sole: a rounded heel and a wider ball, 26 cm long
  const s = new THREE.Shape();
  s.moveTo(0, -0.13); s.bezierCurveTo(0.05, -0.13, 0.05, -0.06, 0.045, 0.0); s.bezierCurveTo(0.06, 0.07, 0.05, 0.13, 0, 0.13);
  s.bezierCurveTo(-0.05, 0.13, -0.06, 0.07, -0.045, 0.0); s.bezierCurveTo(-0.05, -0.06, -0.05, -0.13, 0, -0.13);
  const g = new THREE.ShapeGeometry(s, 6); g.rotateX(-Math.PI / 2);
  return g;
})();

function printMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 });
  // instanceColor.r carries how wet the print still is
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n diffuseColor.a *= vColor.r; diffuseColor.rgb = vec3(0.02, 0.03, 0.035);\n#endif');
  };
  m.customProgramCacheKey = () => 'wetprint';
  return m;
}

export class Footprints {
  constructor(game) {
    this.game = game;
    this.list = [];         // { k, x, z, yaw, t }
    this.meshes = new Map();
    this.wetT = 0; this.dist = 0; this.left = false;
    this.mat = printMaterial();
  }
  reset() {
    for (const m of this.meshes.values()) m.parent && m.parent.remove(m);
    this.meshes.clear(); this.list = []; this.wetT = 0; this.dist = 0;
  }
  meshFor(k) {
    let m = this.meshes.get(k);
    if (!m) {
      const f = this.game.floors[k];
      m = new THREE.InstancedMesh(GEO, this.mat, MAX);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
      m.count = 0; m.frustumCulled = false; m.renderOrder = 1; m.name = 'wetprints';
      f.built.root.add(m); this.meshes.set(k, m);
    }
    return m;
  }
  update(dt) {
    const g = this.game, p = g.player;
    if (!g.map || !p.alive) return;
    if (p.wading) { this.wetT = WET_FOR; this.dist = 0; return; }
    if (g.def.wetFloor) this.wetT = Math.max(this.wetT, WET_FOR * 0.6);   // a flooded floor: every step prints
    if (this.wetT <= 0 || p.hidden || g.liftRide || g.slideRide) { this.wetT = Math.max(0, this.wetT - dt); return; }
    this.wetT -= dt;
    const sp = Math.hypot(p.vel.x, p.vel.y);
    this.dist += sp * dt;
    if (this.dist < STRIDE) return;
    this.dist = 0; this.left = !this.left;
    const side = this.left ? -0.11 : 0.11, yaw = Math.atan2(-p.vel.x, -p.vel.y);
    this.list.push({ k: g.floorK, x: p.pos.x + Math.cos(yaw) * side, z: p.pos.z - Math.sin(yaw) * side, yaw, t: g.time, y: (p.y || 0) + 0.012, wet: Math.min(1, this.wetT / WET_FOR + 0.25) });
    if (this.list.length > MAX) this.list.shift();
    this.dirty = true;
  }
  // redraw twice a second: prints fade as they dry
  render() {
    const g = this.game;
    this.drawT = (this.drawT || 0) - (g.realDt || 0.016);
    if (!this.dirty && this.drawT > 0) return;
    this.dirty = false; this.drawT = 0.5;
    this.list = this.list.filter((q) => g.time - q.t < DRY);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const per = new Map();
    for (const q of this.list) { if (!per.has(q.k)) per.set(q.k, []); per.get(q.k).push(q); }
    for (const [k, m] of this.meshes) if (!per.has(k)) m.count = 0;
    for (const [k, arr] of per) {
      const m = this.meshFor(k);
      arr.forEach((q, i) => {
        M.compose(V.set(q.x, q.y, q.z), Q.setFromAxisAngle(up, q.yaw), S);
        m.setMatrixAt(i, M);
        const a = q.wet * (1 - (g.time - q.t) / DRY);
        m.instanceColor.setXYZ(i, a, a, a);
      });
      m.count = arr.length; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
  }
  // the freshest print on floor k within r of (x, z) that is younger than maxAge
  near(k, x, z, r, maxAge = 30) {
    const g = this.game; let best = null;
    for (const q of this.list) {
      if (q.k !== k || g.time - q.t > maxAge || Math.hypot(q.x - x, q.z - z) > r) continue;
      if (!best || q.t > best.t) best = q;
    }
    return best;
  }
  // walk the trail from a print to its newest end within reach (prints are laid in order)
  trailEnd(q, reach = 12) {
    let end = q;
    for (const n of this.list) if (n.k === q.k && n.t > end.t && Math.hypot(n.x - end.x, n.z - end.z) < 2.2 && Math.hypot(n.x - q.x, n.z - q.z) < reach) end = n;
    return end;
  }
}
