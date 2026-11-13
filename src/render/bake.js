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
  uTime: { value: 0 },        // seconds, for moving water
};

const cache = new Map();
// glazed-tile materials on props get a world-space grout grid (kept out of vertex-colour merging)
export const TILE_RE = /^(PoolTile|Tile(White|Pillar|Bench)?)(\.|_|$)/;

// fine grain tiled over level surfaces so they stay crisp up close
let DETAIL = null;
function detailTex() {
  if (DETAIL) return DETAIL;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  let sd = 1234567; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const v = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) v[i] = rnd();
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {   // soften into grain
    const i = y * N + x; v[i] = (v[i] * 2 + v[((y + 1) % N) * N + x] + v[y * N + (x + 1) % N]) / 4;
  }
  for (let i = 0; i < N * N; i++) { const k = Math.round(Math.min(255, Math.max(0, (v[i] - 0.5) * 2.2 * 128 + 128))); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  DETAIL = new THREE.CanvasTexture(c);
  DETAIL.wrapS = DETAIL.wrapT = THREE.RepeatWrapping; DETAIL.colorSpace = THREE.NoColorSpace; DETAIL.anisotropy = 4;
  return DETAIL;
}

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
    normalMap: src.normalMap || null,
  });
  if (src.normalMap) m.normalScale = new THREE.Vector2(1, 1);
  m.name = src.name;
  if (emissive) {
    m.emissive = (src.emissive && src.emissive.getHex()) ? src.emissive.clone() : (src.color ? src.color.clone() : new THREE.Color(1, 1, 1));
    m.emissiveIntensity = Math.max(1, src.emissiveIntensity || 1);
    m.userData.emissive = true;
    m.userData.baseEmissive = m.emissive.clone();
  }
  const local = { value: new THREE.Vector2(0.6, 0) };
  const gloss = (src.userData && src.userData.gloss) || 0;
  const relief = !!src.normalMap;
  // falling water (water curtains, shower streams): streaks that run down
  const water = /^Fall/.test(src.name || '') && !!src.transparent;
  // glazed tile on props (tunnels, pillars, benches): grout grid and grime in world space
  const tile = !water && TILE_RE.test(src.name || '');
  const wpos = water || tile;
  m.userData.bake = local;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bakeUniforms);
    shader.uniforms.uLocalBake = local;
    if (relief) shader.uniforms.uDetail = { value: detailTex() };
    const decl = mode === 'attr' ? 'attribute vec2 bake;\n' : 'uniform vec2 uLocalBake;\n';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + decl + 'varying vec2 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vBake = ' + (mode === 'attr' ? 'bake' : 'uLocalBake') + ';' +
        (wpos ? '\n { vec4 wp = vec4(transformed, 1.0); vec4 wn = vec4(objectNormal, 0.0);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp; wn = instanceMatrix * wn;\n#endif\n vWPos = (modelMatrix * wp).xyz; vWN = normalize((modelMatrix * wn).xyz); }' : ''));
    if (wpos) shader.vertexShader = shader.vertexShader.replace('varying vec2 vBake;', 'varying vec2 vBake;\nvarying vec3 vWPos;\nvarying vec3 vWN;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBake;\nuniform float uFlicker;\nuniform float uPower;\nuniform vec3 uBakeTint;\nuniform float uNV;' +
        (relief ? '\nuniform sampler2D uDetail;' : '') +
        (wpos ? '\nvarying vec3 vWPos;\nvarying vec3 vWN;' : '') +
        (water || tile ? '\nuniform float uTime;\nfloat wh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }\nfloat wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }' : ''))
      .replace('#include <map_fragment>', '#include <map_fragment>' + (tile ? `
        { // pick the projection the surface faces most, 15 cm tiles
          vec3 an = abs(vWN);
          vec2 tp = an.y > max(an.x, an.z) ? vWPos.xz : an.x > an.z ? vWPos.zy : vWPos.xy;
          tp /= 0.15;
          vec2 cellI = floor(tp), f = fract(tp);
          vec2 fw = max(fwidth(tp), vec2(1e-4));
          vec2 gl = smoothstep(vec2(0.0), fw * 1.2 + 0.035, f) * smoothstep(vec2(0.0), fw * 1.2 + 0.035, 1.0 - f);
          float grout = 1.0 - gl.x * gl.y;
          grout *= 1.0 - smoothstep(0.25, 0.6, max(fw.x, fw.y));      // fade the grid out where it would shimmer
          float var = wh(cellI) - 0.5;
          diffuseColor.rgb *= (1.0 + var * 0.09) * (1.0 - grout * 0.38);
          // grime: rising damp off the floor, rust-brown runs and blotches
          float damp = smoothstep(0.9, 0.0, vWPos.y) * (0.55 + 0.45 * wn(vWPos.xz * 1.3 + vWPos.y));
          float runs = smoothstep(0.55, 0.88, wn(vec2((vWPos.x + vWPos.z) * 6.0, vWPos.y * 0.35))) * smoothstep(0.4, 2.4, vWPos.y);
          float blot = smoothstep(0.5, 0.82, wn(vWPos.xz * 0.9 + vWPos.y * 0.7) * 0.65 + wn(vWPos.xy * 3.1 + vWPos.zz) * 0.35);
          vec3 dirt = vec3(0.42, 0.36, 0.26);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * dirt, clamp(damp * 0.75 + runs * 0.7 + blot * 0.55 + grout * damp * 0.4, 0.0, 0.85));
        }` : '') + (relief ? `
        { float dg = texture2D(uDetail, vMapUv * 7.0).r * 0.6 + texture2D(uDetail, vMapUv * 23.0).r * 0.4;
          float fade = smoothstep(9.0, 2.0, length(vViewPosition));
          diffuseColor.rgb *= 1.0 + (dg - 0.5) * 0.22 * fade; }` : ''))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float bk = (vBake.x + vBake.y * uFlicker) * uPower;
        bk = bk < 0.6 ? bk : 0.6 + (1.0 - exp(-(bk - 0.6) * 1.2)) * 0.75;   // soft knee: hot spots keep a gradient
        ${relief ? `{ // relief: the baked light comes mostly from above, so bumps facing up catch it
          vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          bk *= clamp(1.0 + (dot(normal, upV) - dot(nonPerturbedNormal, upV)) * 1.6, 0.55, 1.45);
        }` : ''}
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uBakeTint * bk + diffuseColor.rgb * uNV;
        ${water ? `{ // streaks sliding down the sheet, foam where it lands
          float along = vWPos.x + vWPos.z;
          float st = wn(vec2(along * 9.0, vWPos.y * 1.6 + uTime * 3.2)) * 0.6 + wn(vec2(along * 23.0, vWPos.y * 3.0 + uTime * 5.5)) * 0.4;
          float foam = smoothstep(0.45, 0.05, vWPos.y);
          diffuseColor.a *= 0.45 + 0.9 * st + foam * 0.6;
          reflectedLight.indirectDiffuse += uBakeTint * bk * (smoothstep(0.62, 0.95, st) * 0.6 + foam * 0.35);
        }` : ''}
        ${gloss > 0 ? `{ // polished sheen: the lit room mirrored at grazing angles
          vec3 V = normalize(vViewPosition);
          float fres = pow(1.0 - clamp(dot(normal, V), 0.0, 1.0), 4.0);
          reflectedLight.indirectDiffuse += uBakeTint * bk * fres * ${gloss.toFixed(2)} * 0.55;
        }` : ''}`);
  };
  m.customProgramCacheKey = () => 'bake-' + mode + (relief ? '-n' : '') + (gloss ? '-g' + gloss : '') + (water ? '-w' : '') + (tile ? '-t' : '');
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
