// "Baked" lighting: fluorescent fixtures are far too many for real-time lights
// on low-end GPUs, so their light is precomputed per vertex / per instance
// (with wall occlusion via grid line-of-sight) and injected into the Lambert
// shader as extra indirect light. The flashlight is still a real SpotLight.
import * as THREE from 'three';
import { CELL } from '../config.js';

export const bakeUniforms = {
  uFlicker: { value: 1 },     // global flicker signal for flickering fixtures
  uPower: { value: 1 },       // global power (blackouts / entity interference)
  uBakeTint: { value: new THREE.Color(1.0, 0.98, 0.9) },
  uNV: { value: 0 },          // night-vision boost
};

const cache = new Map();

// Convert any material to a Lambert material with baked-light injection.
// mode 'attr' -> per-vertex/per-instance attribute `bake` (vec2)
// mode 'uniform' -> material.userData.bake.value (vec2), for moving objects
export function bakeMaterial(src, mode = 'attr') {
  const key = src.uuid + mode;
  if (mode === 'attr' && cache.has(key)) return cache.get(key);
  const emissive = src.userData && src.userData.emissive;
  const m = new THREE.MeshLambertMaterial({
    color: src.color ? src.color.clone() : new THREE.Color(1, 1, 1),
    map: src.map || null,
    transparent: !!src.transparent,
    opacity: src.opacity ?? 1,
    side: src.side ?? THREE.FrontSide,
    alphaTest: src.alphaTest || 0,
    vertexColors: !!src.vertexColors,
  });
  m.name = src.name;
  if (emissive) {
    m.emissive = (src.emissive && src.emissive.getHex()) ? src.emissive.clone() : (src.color ? src.color.clone() : new THREE.Color(1, 1, 1));
    m.emissiveIntensity = Math.max(1, src.emissiveIntensity || 1);
    m.userData.emissive = true;
    m.userData.baseEmissive = m.emissive.clone();
  }
  const local = { value: new THREE.Vector2(0.6, 0) };
  m.userData.bake = local;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bakeUniforms);
    shader.uniforms.uLocalBake = local;
    const decl = mode === 'attr' ? 'attribute vec2 bake;\n' : 'uniform vec2 uLocalBake;\n';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + decl + 'varying vec2 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vBake = ' + (mode === 'attr' ? 'bake' : 'uLocalBake') + ';');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBake;\nuniform float uFlicker;\nuniform float uPower;\nuniform vec3 uBakeTint;\nuniform float uNV;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float bk = (vBake.x + vBake.y * uFlicker) * uPower;
        bk = bk < 0.6 ? bk : 0.6 + (1.0 - exp(-(bk - 0.6) * 1.2)) * 0.75;   // soft knee: hot spots keep a gradient
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uBakeTint * bk + diffuseColor.rgb * uNV;`);
  };
  m.customProgramCacheKey = () => 'bake-' + mode;
  if (mode === 'attr') cache.set(key, m);
  return m;
}

// Light sampler built from the level's fixtures.
export class LightField {
  constructor(map, lights) {
    this.map = map;
    this.lights = lights.filter((l) => l.state !== 'off');
    this.tall = this.lights.filter((l) => l.tall);
    // spatial hash by cell for fast lookups
    this.buckets = new Map();
    for (const l of this.lights) {
      const k = Math.floor(l.x / CELL) + ',' + Math.floor(l.z / CELL);
      if (!this.buckets.has(k)) this.buckets.set(k, []);
      this.buckets.get(k).push(l);
    }
  }
  // sample baked irradiance at world point p with normal n (null = omni)
  // returns [steady, flicker]; `hint` = [cx, cz] cell-center to nudge LOS towards
  sample(px, py, pz, nx, ny, nz, hint) {
    let steady = 0, flick = 0;
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    let sx = px, sz = pz;
    if (hint) { sx += (hint[0] - px) * 0.02; sz += (hint[1] - pz) * 0.02; }
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const b = this.buckets.get((cx + dx) + ',' + (cz + dz));
      if (!b) continue;
      for (const l of b) {
        if (l.tall) continue;
        const lx = l.x - px, ly = (l.y ?? 2.92) - py, lz = l.z - pz;
        const d2 = lx * lx + ly * ly + lz * lz;
        if (d2 > (l.reach2 || 110)) continue;
        const d = Math.sqrt(d2);
        let lam = 1;
        if (nx !== null) lam = Math.max(0, (lx * nx + ly * ny + lz * nz) / d) * 0.8 + 0.2;
        const fall = 1 / (1 + d2 * (l.fall || 0.16));
        const val = lam * fall;
        if (val < 0.01) continue;
        if (!this.map.los(l.x, l.z, sx, sz)) continue;
        if (l.state === 'flicker') flick += val; else steady += val;
      }
    }
    // lights hung high in tall spaces reach much further
    for (const l of this.tall) {
      const lx = l.x - px, ly = l.y - py, lz = l.z - pz;
      const d2 = lx * lx + ly * ly + lz * lz;
      if (d2 > l.reach2) continue;
      const d = Math.sqrt(d2);
      let lam = 1;
      if (nx !== null) lam = Math.max(0, (lx * nx + ly * ny + lz * nz) / d) * 0.8 + 0.2;
      const val = lam / (1 + d2 * l.fall);
      if (val < 0.01 || !this.map.los(l.x, l.z, sx, sz)) continue;
      if (l.state === 'flicker') flick += val; else steady += val;
    }
    return [Math.min(steady * 1.15, 1.6), Math.min(flick * 1.15, 1.6)];
  }
}
