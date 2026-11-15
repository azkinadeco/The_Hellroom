// "Baked" lighting: fluorescent fixtures are far too many for real-time lights
// on low-end GPUs, so their light is precomputed per vertex / per instance
// (with wall occlusion via grid line-of-sight) and injected into the Lambert
// shader as extra indirect light. The flashlight is still a real SpotLight.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { noiseTex, NOISE_GLSL } from './noise.js';

export const bakeUniforms = {
  uFlicker: { value: 1 },     // global flicker signal for flickering fixtures
  uPower: { value: 1 },       // global power (blackouts / entity interference)
  uBakeTint: { value: new THREE.Color(1.0, 0.98, 0.9) },
  uNV: { value: 0 },          // night-vision boost
  uTime: { value: 0 },        // seconds, for moving water
  uFx: { value: 1 },          // 0 = low preset (no procedural surface detail), 1 = high, 2 = ultra
  uGrime: { value: 1 },       // how filthy this building is
  uFH: { value: 3.3 },        // floor-to-floor height, to get the height above the storey's floor
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
  // plain vertex-coloured props (desks, lockers, beds…): surface grain, stains and dust in world space.
  // Only static geometry: on anything that moves the pattern would swim.
  const prop = mode === 'attr' && !relief && !water && !tile && !emissive && !src.transparent && !src.map;
  const wpos = water || tile || relief || prop;
  m.userData.bake = local;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, bakeUniforms);
    shader.uniforms.uLocalBake = local;
    if (relief || prop) shader.uniforms.uDetail = { value: detailTex() };
    if (water || tile || relief || prop) shader.uniforms.uNoiseTex = { value: noiseTex() };
    const decl = mode === 'attr' ? 'attribute vec2 bake;\n' : 'uniform vec2 uLocalBake;\n';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + decl + 'varying vec2 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vBake = ' + (mode === 'attr' ? 'bake' : 'uLocalBake') + ';' +
        (wpos ? '\n { vec4 wp = vec4(transformed, 1.0); vec4 wn = vec4(objectNormal, 0.0);\n#ifdef USE_INSTANCING\n wp = instanceMatrix * wp; wn = instanceMatrix * wn;\n#endif\n vWPos = (modelMatrix * wp).xyz; vWN = normalize((modelMatrix * wn).xyz); }' : ''));
    if (wpos) shader.vertexShader = shader.vertexShader.replace('varying vec2 vBake;', 'varying vec2 vBake;\nvarying vec3 vWPos;\nvarying vec3 vWN;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBake;\nuniform float uFlicker;\nuniform float uPower;\nuniform vec3 uBakeTint;\nuniform float uNV;' +
        (relief || prop ? '\nuniform sampler2D uDetail;' : '') +
        (prop ? '\nuniform float uFx;\nuniform float uGrime;' : '') +
        (wpos ? '\nvarying vec3 vWPos;\nvarying vec3 vWN;' : '') +
        (relief ? '\nuniform float uFx;\nuniform float uGrime;\nuniform float uFH;' : '') +
        (water || tile || relief || prop ? '\nuniform float uTime;' + NOISE_GLSL : ''))
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
        }` : '') + (prop ? `
        if (uFx > 0.5) {
          float pd = length(vViewPosition);
          if (pd < 18.0) {
            vec3 an = abs(vWN);
            vec2 tp = an.y > max(an.x, an.z) ? vWPos.xz : an.x > an.z ? vWPos.zy : vWPos.xy;
            float near = smoothstep(9.0, 1.5, pd), lod = smoothstep(18.0, 10.0, pd);
            float grain = texture2D(uDetail, tp * 1.9).r * 0.55 + texture2D(uDetail, tp * 7.3).r * 0.45;
            float blot = wn(tp * 1.1 + vWPos.y * 0.7), fine = wn(tp * 5.0 + 3.0);
            diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.30 * near;
            // handled, knocked, left alone for years: darker patches, scuffs, a film of dust on whatever faces up
            float stain = smoothstep(0.52, 0.85, blot * 0.7 + fine * 0.3);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.52, 0.46, 0.38), stain * 0.55 * uGrime * lod);
            float scuff = smoothstep(0.80, 0.92, wn(vec2(tp.x * 2.0 + tp.y * 9.0, tp.y * 1.5 - tp.x * 4.0))) * near;
            diffuseColor.rgb *= 1.0 - scuff * 0.22;
            float dust = smoothstep(0.55, 0.95, vWN.y) * (0.35 + 0.65 * fine) * lod;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.50, 0.47, 0.41), dust * 0.22 * min(uGrime, 1.2));
          }
        }` : '') + (relief ? `
        float hrWet = 0.0;
        if (uFx > 0.5) {
          float hrD = length(vViewPosition);
          if (hrD < 30.0) {
            vec3 P = vWPos; float up = vWN.y;
            float lod = smoothstep(30.0, 16.0, hrD), near = smoothstep(7.0, 2.5, hrD);
            float h = mod(P.y + 0.02, uFH);                       // height above this storey's floor
            float dark = smoothstep(0.55, 0.08, vBake.x + vBake.y);   // filth gathers where the lamps are dead
            vec3 dirt = vec3(0.40, 0.34, 0.25), mold = vec3(0.24, 0.29, 0.20), rust = vec3(0.46, 0.27, 0.16);
            float g = 0.0, m = 0.0, r = 0.0, crack = 0.0;
            if (abs(up) < 0.5) {                                   // ---- walls
              float al = P.x + P.z;                                // walls are axis-aligned: one coordinate runs along them
              vec2 w2 = vec2(al, P.y);
              float n1 = wn(w2 * 0.9), n2 = wn(w2 * 3.7 + 11.0);
              g = smoothstep(0.85, 0.0, h) * (0.45 + 0.55 * n1);                                   // rising damp
              g += smoothstep(2.35, 3.0, h) * (0.25 + 0.6 * n2) * 0.8;                              // soot under the ceiling
              float col = wn(vec2(al * 6.5, 3.0));
              r = smoothstep(0.66, 0.92, col) * smoothstep(3.0, 0.5, h) * smoothstep(0.1, 0.9, h) * (0.5 + 0.5 * wn(vec2(al * 6.5, P.y * 0.8))) ;   // runs coming down from the ceiling
              m = smoothstep(0.58, 0.8, n1 * 0.6 + wn(w2 * 0.33 + 5.0) * 0.6 + n2 * 0.12) * (0.35 + 0.65 * dark);    // mold blooms
              float rd = abs(wn(w2 * 0.8 + 31.0) - 0.5 + (n2 - 0.5) * 0.09);
              { float cw = 0.0028 + fwidth(rd) * 0.9; crack = smoothstep(cw, cw * 0.3, rd) * smoothstep(0.64, 0.74, wn(w2 * 0.45 + 3.0)) * smoothstep(0.38, 0.62, wn(w2 * 2.4 + 17.0)) * near * smoothstep(0.02, 0.006, fwidth(rd)); }                 // hairline cracks in patches
            } else if (up > 0.0) {                                 // ---- floors
              float n1 = wn(P.xz * 0.5), n2 = wn(P.xz * 2.3 + 7.0), n3 = wn(P.xz * 9.0);
              g = smoothstep(0.45, 0.85, n1 * 0.7 + n2 * 0.3) * 0.7 + smoothstep(0.6, 0.9, n3) * 0.18 * near;           // trodden-in dirt, grit
              hrWet = smoothstep(0.60, 0.70, wn(P.xz * 0.37 + 19.0) * 0.8 + n2 * 0.2) * (0.5 + 0.5 * dark);            // standing water
              float rd = abs(wn(P.xz * 0.7 + 13.0) - 0.5 + (n2 - 0.5) * 0.1);
              { float cw = 0.0028 + fwidth(rd) * 0.9; crack = smoothstep(cw, cw * 0.3, rd) * smoothstep(0.64, 0.74, wn(P.xz * 0.45 + 9.0)) * smoothstep(0.38, 0.62, wn(P.xz * 2.4 + 21.0)) * near * smoothstep(0.02, 0.006, fwidth(rd)); }
            } else {                                               // ---- ceilings
              float s1 = wn(P.xz * 0.55 + 23.0) * 0.75 + wn(P.xz * 2.1) * 0.25;
              g = smoothstep(0.60, 0.70, s1) * 0.55 - smoothstep(0.72, 0.80, s1) * 0.25;                                // ring-shaped water stains
              m = smoothstep(0.7, 0.85, s1) * (0.4 + 0.6 * dark);
            }
            float k = uGrime * lod;
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * dirt, clamp(g, 0.0, 0.8) * k);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * rust, clamp(r, 0.0, 0.75) * k);
            diffuseColor.rgb = mix(diffuseColor.rgb, mold * (0.35 + 0.4 * wn(P.xz * 13.0 + P.y * 13.0)), clamp(m, 0.0, 0.7) * k * 0.8);
            diffuseColor.rgb *= 1.0 - crack * 0.8 * min(uGrime, 1.0);
            hrWet *= k;
            diffuseColor.rgb *= 1.0 - hrWet * 0.42;
          }
        }
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
        ${relief ? `if (uFx > 0.5) { // the flashlight glints off polished and wet surfaces; puddles mirror the room light
          vec3 hV = normalize(vViewPosition);
          float nv = clamp(dot(normal, hV), 0.0, 1.0);
          float dl = dot(reflectedLight.directDiffuse, vec3(0.34));
          reflectedLight.directDiffuse += vec3(1.0, 0.96, 0.88) * (pow(nv, 60.0) * 1.6 + pow(nv, 12.0) * 0.25) * dl * (${gloss.toFixed(2)} * 0.9 + hrWet * 2.2);
          reflectedLight.indirectDiffuse += uBakeTint * bk * pow(1.0 - nv, 3.0) * hrWet * 0.55;
        }` : ''}
        ${prop ? `if (uFx > 0.5) { // paint, laminate and steel give a small glint back to the torch
          vec3 hV = normalize(vViewPosition);
          float nv = clamp(dot(normal, hV), 0.0, 1.0);
          reflectedLight.directDiffuse += vec3(1.0, 0.96, 0.88) * pow(nv, 40.0) * dot(reflectedLight.directDiffuse, vec3(0.34)) * 0.45;
        }` : ''}
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
  m.customProgramCacheKey = () => 'bake-' + mode + (relief ? '-n' : '') + (gloss ? '-g' + gloss : '') + (water ? '-w' : '') + (tile ? '-t' : '') + (prop ? '-p' : '');
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
