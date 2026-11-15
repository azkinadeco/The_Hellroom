// One shared tileable value-noise texture. Shaders sample it instead of
// computing fract(sin(x) * 43758) hashes: that is cheaper, and integrated
// Intel GPUs evaluate sin() of large arguments so imprecisely that the
// hash turns into visible stripes across walls and floors.
import * as THREE from 'three';

export const NOISE_PERIOD = 128;   // lattice units before the pattern repeats
let TEX = null;

export function noiseTex() {
  if (TEX) return TEX;
  const P = NOISE_PERIOD, R = 4, N = P * R;       // four texels per lattice unit
  let sd = 2463534242; const rnd = () => { sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; return (sd >>> 0) / 4294967296; };
  const lat = new Float32Array(P * P);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const at = (x, z) => lat[((z % P + P) % P) * P + ((x % P + P) % P)];
  const data = new Uint16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // texel centre in lattice space; smoothstep-interpolated like the old shader noise
    const px = (x + 0.5) / R, py = (y + 0.5) / R, ix = Math.floor(px), iy = Math.floor(py);
    let fx = px - ix, fy = py - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
    const v = (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
    data[y * N + x] = THREE.DataUtils.toHalfFloat(v);
  }
  TEX = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.HalfFloatType);
  TEX.wrapS = TEX.wrapT = THREE.RepeatWrapping;
  TEX.magFilter = THREE.LinearFilter; TEX.minFilter = THREE.LinearFilter; TEX.generateMipmaps = false;
  TEX.colorSpace = THREE.NoColorSpace;
  TEX.needsUpdate = true;
  return TEX;
}

// GLSL: wn(p) ~ smooth value noise with lattice at integer p (period 128);
// wh(p) ~ a sine-free hash for per-cell variation.
export const NOISE_GLSL = `
uniform sampler2D uNoiseTex;
float wn(vec2 p){ return texture2D(uNoiseTex, p * ${(1 / NOISE_PERIOD).toFixed(7)}).r; }
float wh(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
`;
