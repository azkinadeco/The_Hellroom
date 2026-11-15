// Single-pass "1996 camcorder" post effect.
import * as THREE from 'three';
import { noiseTex, NOISE_GLSL } from './noise.js';

const frag = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uNear, uFar, uAO, uSharp;
uniform vec2 uProj;      // tan(fov/2) * aspect, tan(fov/2)
uniform int uTaps;
uniform sampler2D tFx;
uniform float uFxOn;
uniform float uTime, uDanger, uNV, uGlitch, uFade, uWhite, uBattery, uClean;
uniform vec2 uRes, uTexel;
uniform vec3 uGrade;
uniform float uBright;   // player's brightness setting: a gamma lift of the shadows
uniform float uFlash;    // lightning: a cold white lift of the whole frame
varying vec2 vUv;
uniform mat4 uCamWorld;
uniform vec3 uCamDir, uMistCol, uMistLamp;
uniform float uMist, uGround, uMistLight;
${NOISE_GLSL}
float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / ((uFar - uNear) * d - uFar); }
vec3 viewPos(vec2 uv){ float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * uProj * -z, z); }
// ground mist as a volume: exponential height fog integrated along the view ray, broken into drifting patches.
// It has no surface, so it can never draw a line where it meets a wall.
vec3 groundMist(vec3 c, vec2 uv){
  if (uMist <= 0.0) return c;
  vec3 W = (uCamWorld * vec4(viewPos(uv), 1.0)).xyz, C = uCamWorld[3].xyz;
  vec3 d = W - C; float dist = length(d);
  float h = 0.55, a = (C.y - uGround) / h, b = (W.y - uGround) / h;
  float avg = abs(b - a) < 1e-3 ? exp(-a) : (exp(-a) - exp(-b)) / (b - a);
  float dens = avg * min(dist, 18.0);
  vec2 q = mix(C.xz, W.xz, 0.75);
  float nz = wn(q * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + wn(q * 0.9 - vec2(uTime * 0.07, -uTime * 0.04)) * 0.4;
  dens *= 0.35 + 1.3 * smoothstep(0.3, 0.8, nz);
  float f = (1.0 - exp(-dens * uMist * 0.55)) * smoothstep(0.4, 1.6, dist);
  float beam = smoothstep(0.80, 0.97, dot(d / max(dist, 1e-3), uCamDir)) * uMistLight * smoothstep(11.0, 2.0, dist);
  return mix(c, uMistCol + uMistLamp * beam, clamp(f, 0.0, 0.85));
}
// filmic grade: gentle S-curve, a little extra saturation, cool lifted shadows
vec3 grade(vec3 c){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);
  c += vec3(0.006, 0.008, 0.016) * (1.0 - smoothstep(0.0, 0.3, l));
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, 0.35);
  c = clamp(c, 0.0, 1.0);
  c = pow(c, vec3(1.0 / uBright));
  return c * uGrade;
}
// cheap single-pass glow: two rings of taps, only the bright part counts
vec3 bloom(vec2 uv){
  vec3 b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    vec2 o = vec2(cos(a), sin(a)) * uTexel;
    b += max(texture2D(tDiffuse, uv + o * 2.5).rgb - 0.68, 0.0) * 0.6;
    b += max(texture2D(tDiffuse, uv + o * 7.0).rgb - 0.68, 0.0) * 0.5;
  }
  return b * 0.3;
}

float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }

// the scene colour with contact shadows and a light unsharp mask
vec3 scene(vec2 uv){
  vec3 c = texture2D(tDiffuse, uv).rgb;
  c = c * (1.0 + uFlash * 2.2) + vec3(0.035, 0.042, 0.06) * uFlash;
  if (uSharp > 0.0) {
    vec3 b = texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0)).rgb
           + texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, uv - vec2(0.0, uTexel.y)).rgb;
    c = max(c + (c - b * 0.25) * uSharp, 0.0);
  }
  c = groundMist(c, uv);
  if (uFxOn > 0.5 && uAO > 0.0) { float ao = texture2D(tFx, uv).a; c *= mix(1.0, ao, uAO * (1.0 - smoothstep(0.55, 0.95, max(c.r, max(c.g, c.b))))); }
  return c;
}
// glow: from the half-resolution fx buffer when it exists, else the old inline taps
vec3 glow(vec2 uv){ return uFxOn > 0.5 ? texture2D(tFx, uv).rgb : bloom(uv); }

void main(){
  // "Layar jernih": no lens, jitter, tracking, aberration, grain, scanlines or static
  if (uClean > 0.5) {
    vec3 c = grade(pow(max(scene(vUv) + glow(vUv), 0.0), vec3(1.0 / 2.2)));
    if (uNV > 0.5) { float n = pow(dot(c, vec3(0.3, 0.6, 0.1)) * 2.6, 0.75); c = vec3(0.25, 1.0, 0.35) * n; }
    vec2 q = vUv - 0.5;
    c *= mix(0.82, 1.0, smoothstep(0.9, 0.3, length(q * vec2(1.1, 1.25))));
    c += (fract(52.9829189 * fract(dot(gl_FragCoord.xy + floor(fract(uTime * 7.0) * 64.0), vec2(0.06711056, 0.00583715)))) - 0.5) / 160.0;      // dither: no banding in the dark
    c = mix(c, vec3(1.0), uWhite);
    c *= (1.0 - uFade);
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  vec2 uv = vUv;
  // slight lens barrel
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  uv = 0.5 + cc * (1.0 + 0.06 * r2);

  // horizontal line jitter (danger / glitch)
  float row = floor(uv.y * 240.0);
  float jit = (hash(vec2(row, floor(uTime * 24.0))) - 0.5);
  float j = jit * (0.0015 + uDanger * 0.012 + uGlitch * 0.06) * step(0.6 - uDanger * 0.5 - uGlitch, hash(vec2(row * 0.37, floor(uTime * 12.0))));
  uv.x += j;
  // tracking band rolling up the screen
  float band = smoothstep(0.0, 0.02, abs(fract(uv.y * 0.5 - uTime * 0.07) - 0.5) - 0.47);
  uv.x += (1.0 - band) * 0.004 * (hash(vec2(uTime, row)) - 0.5);

  float ca = 0.0012 + uDanger * 0.004 + uGlitch * 0.02;
  vec3 col;
  vec3 mid = scene(uv);
  col.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r * (mid.r + 0.02) / (texture2D(tDiffuse, uv).r + 0.02);
  col.g = mid.g;
  col.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b * (mid.b + 0.02) / (texture2D(tDiffuse, uv).b + 0.02);
  // render target is sRGB-encoded storage, sampled back as linear -> encode for display
  col += glow(uv);
  col = grade(pow(max(col, 0.0), vec3(1.0 / 2.2)));

  // camcorder colour grade: lifted blacks, yellow-green cast, mild desaturation
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.78);
  col = col * vec3(1.02, 1.0, 0.88) + vec3(0.018, 0.02, 0.012);
  col = pow(col, vec3(0.95));

  // night vision
  if (uNV > 0.5) {
    float n = dot(col, vec3(0.3, 0.6, 0.1));
    n = pow(n * 2.6, 0.75);
    col = vec3(0.25, 1.0, 0.35) * n;
  }

  // grain + scanlines + band brightening
  float g = hash(uv * uRes + fract(uTime * 7.0) * 100.0);
  col += (g - 0.5) * (0.045 + uNV * 0.09 + uDanger * 0.05);
  col *= 0.94 + 0.06 * sin(vUv.y * uRes.y * 1.6);
  col += (1.0 - band) * 0.035;
  // random static flecks when danger is high
  if (hash(vec2(floor(vUv.y * 120.0), floor(uTime * 30.0))) > 0.995 - uDanger * 0.02) col += 0.3 * g;

  // vignette
  float vig = smoothstep(0.85, 0.25, length(cc * vec2(1.1, 1.25)));
  col *= mix(0.55, 1.0, vig);
  // edges outside the barrel
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);

  // low battery: occasional dropout
  if (uBattery < 0.08 && hash(vec2(floor(uTime * 8.0), 3.0)) > 0.85) col *= 0.3;

  col = mix(col, vec3(1.0), uWhite);
  col *= (1.0 - uFade);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---- half-resolution effects: contact shadows (rgb unused -> glow) packed in one RGBA buffer
const fxCommon = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse, tDepth;
uniform float uNear, uFar;
uniform vec2 uProj, uTexel;
varying vec2 vUv;
float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / ((uFar - uNear) * d - uFar); }
vec3 viewPos(vec2 uv){ float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * uProj * -z, z); }`;
const fxFrag = fxCommon + /* glsl */`
uniform int uTaps;
void main(){
  vec2 uv = vUv;
  // glow: the bright part of two rings around this pixel (blurred afterwards)
  vec3 b = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398 + 0.39;
    vec2 o = vec2(cos(a), sin(a)) * uTexel;
    b += max(texture2D(tDiffuse, uv + o * 2.5).rgb - 0.68, 0.0) * 0.6;
    b += max(texture2D(tDiffuse, uv + o * 7.0).rgb - 0.68, 0.0) * 0.5;
  }
  b *= 0.3;
  // contact shadows
  float ao = 1.0;
  vec3 P = viewPos(uv);
  float dist = -P.z;
  if (dist < 28.0) {
    vec3 px = viewPos(uv + vec2(uTexel.x, 0.0)) - P, mx = P - viewPos(uv - vec2(uTexel.x, 0.0));
    vec3 py = viewPos(uv + vec2(0.0, uTexel.y)) - P, my = P - viewPos(uv - vec2(0.0, uTexel.y));
    vec3 N = normalize(cross(abs(px.z) < abs(mx.z) ? px : mx, abs(py.z) < abs(my.z) ? py : my));
    float R = 0.55;
    vec2 rad = min(R / (2.0 * uProj * dist), vec2(0.12));
    // a 4x4 ordered pattern of turns: the 4x4 blur that follows averages it away exactly (no stripes, no stipple)
    vec2 q = mod(floor(gl_FragCoord.xy), 4.0);
    // 4x4 Bayer matrix, written arithmetically (GLSL ES 1.0 has no constant arrays)
    float b0 = mod(q.x, 2.0), b1 = mod(q.y, 2.0), c0 = floor(q.x * 0.5), c1 = floor(q.y * 0.5);
    float k = 4.0 * (2.0 * mod(b0 + b1, 2.0) + b1) + (2.0 * mod(c0 + c1, 2.0) + c1);
    float rot = k / 16.0 * 6.2831853;
    float occ = 0.0, n = 0.0;
    for (int i = 0; i < 12; i++) {
      if (i >= uTaps) break;
      float fi = float(i) + 0.5, r = sqrt(fi / float(uTaps)), a = fi * 2.3999632 + rot;
      vec3 S = viewPos(uv + vec2(cos(a), sin(a)) * r * rad) - P;
      float l2 = dot(S, S);
      occ += max(dot(N, S) * inversesqrt(l2 + 1e-5) - 0.12, 0.0) * step(l2, R * R * 2.2) / (1.0 + l2 * 4.0);
      n += 1.0;
    }
    ao = mix(1.0, clamp(1.0 - occ / n * 2.6, 0.0, 1.0), smoothstep(28.0, 18.0, dist));
  }
  gl_FragColor = vec4(b, ao);
}`;
// 4x4 blur at half resolution; the shadow term only mixes with neighbours at the same depth
const blurFrag = fxCommon + /* glsl */`
uniform sampler2D tFxA;
uniform vec2 uHalf;
void main(){
  float z0 = -viewZ(vUv);
  vec3 b = vec3(0.0); float ao = 0.0, w = 0.0;
  for (int y = -2; y < 2; y++) for (int x = -2; x < 2; x++) {
    vec2 uv = vUv + (vec2(float(x), float(y)) + 0.5) * uHalf;
    vec4 s = texture2D(tFxA, uv);
    b += s.rgb;
    float dz = abs(-viewZ(uv) - z0) / max(z0, 0.3);
    float wk = 1.0 / (1.0 + dz * dz * 400.0);
    ao += s.a * wk; w += wk;
  }
  gl_FragColor = vec4(b / 16.0, ao / max(w, 1e-4));
}`;
const quadVert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

export class VHS {
  constructor(renderer) {
    this.renderer = renderer;
    this.scale = 0.75;
    this.target = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, samples: 0, type: THREE.UnsignedByteType });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.uniforms = {
      tDiffuse: { value: this.target.texture }, uTime: { value: 0 }, uDanger: { value: 0 }, uNV: { value: 0 },
      uGlitch: { value: 0 }, uFade: { value: 0 }, uWhite: { value: 0 }, uBattery: { value: 1 }, uClean: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
      uTexel: { value: new THREE.Vector2(0.001, 0.001) }, uGrade: { value: new THREE.Vector3(1, 1, 1) },
      tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uAO: { value: 0 }, uSharp: { value: 0 }, uProj: { value: new THREE.Vector2(1, 1) }, uTaps: { value: 6 },
      tFx: { value: null }, uFxOn: { value: 0 }, uBright: { value: 1 }, uFlash: { value: 0 },
      uCamWorld: { value: new THREE.Matrix4() }, uCamDir: { value: new THREE.Vector3() }, uMistCol: { value: new THREE.Color(0.2, 0.2, 0.2) }, uMistLamp: { value: new THREE.Color(0.55, 0.5, 0.42) },
      uMist: { value: 0 }, uGround: { value: 0 }, uMistLight: { value: 0 }, uNoiseTex: { value: noiseTex() },
    };
    const mk = () => { const t = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.UnsignedByteType }); t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; t.texture.generateMipmaps = false; return t; };
    this.fxA = mk(); this.fxB = mk();
    const U = this.uniforms;
    this.fxU = { tDiffuse: U.tDiffuse, tDepth: U.tDepth, uNear: U.uNear, uFar: U.uFar, uProj: U.uProj, uTexel: U.uTexel, uTaps: U.uTaps };
    this.blurU = { ...this.fxU, tFxA: { value: this.fxA.texture }, uHalf: { value: new THREE.Vector2(0.01, 0.01) } };
    const quad = (frag, uni) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: quadVert, fragmentShader: frag, depthTest: false, depthWrite: false })); m.frustumCulled = false; const sc = new THREE.Scene(); sc.add(m); return sc; };
    this.fxScene = quad(fxFrag, this.fxU); this.blurScene = quad(blurFrag, this.blurU);
    U.tFx.value = this.fxB.texture;
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: frag, depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.enabled = true;
  }
  // multisampled scene target (MSAA) on the higher presets
  // rebuild the scene target: MSAA samples, and a readable depth texture when contact shadows are on
  setSamples(n, depth = !!this.target.depthTexture) {
    if (this.target.samples === n && !!this.target.depthTexture === depth) return;
    const t = new THREE.WebGLRenderTarget(this.target.width, this.target.height, { depthBuffer: true, samples: n, type: THREE.UnsignedByteType });
    t.texture.colorSpace = THREE.SRGBColorSpace;
    if (depth) { t.depthTexture = new THREE.DepthTexture(this.target.width, this.target.height); t.depthTexture.type = THREE.UnsignedIntType; t.depthTexture.minFilter = t.depthTexture.magFilter = THREE.NearestFilter; }
    if (this.target.depthTexture) this.target.depthTexture.dispose();
    this.target.dispose(); this.target = t; this.uniforms.tDiffuse.value = t.texture; this.uniforms.tDepth.value = t.depthTexture || null;
  }
  // quality: 0 none, 1 eight taps, 2 twelve taps
  setFx(q, clean) {
    this.fx = q;
    this.uniforms.uTaps.value = q > 1 ? 12 : 8;
    this.aoStrength = q > 1 ? 0.95 : q ? 0.85 : 0;
    this.uniforms.uSharp.value = q ? (clean ? 0.55 : 0.3) : 0;
  }
  setSize(w, h, pr) {
    const s = this.scale * pr;
    this.target.setSize(Math.max(2, Math.floor(w * s)), Math.max(2, Math.floor(h * s)));
    this.uniforms.uRes.value.set(w, h);
    this.uniforms.uTexel.value.set(1 / this.target.width, 1 / this.target.height);
    const hw = Math.max(2, Math.ceil(this.target.width / 2)), hh = Math.max(2, Math.ceil(this.target.height / 2));
    this.fxA.setSize(hw, hh); this.fxB.setSize(hw, hh);
    this.blurU.uHalf.value.set(1 / hw, 1 / hh);
  }
  render(scene, camera, t) {
    this.uniforms.uTime.value = t;
    const U = this.uniforms, th = Math.tan(camera.fov * Math.PI / 360);
    U.uNear.value = camera.near; U.uFar.value = camera.far; U.uProj.value.set(th * camera.aspect, th);
    U.uAO.value = this.target.depthTexture ? (this.aoStrength || 0) : 0;
    U.uCamWorld.value.copy(camera.matrixWorld); camera.getWorldDirection(U.uCamDir.value);
    if (!this.target.depthTexture) U.uMist.value = 0;
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    const fx = U.uAO.value > 0;
    U.uFxOn.value = fx ? 1 : 0;
    if (fx) {
      r.setRenderTarget(this.fxA); r.render(this.fxScene, this.cam);
      r.setRenderTarget(this.fxB); r.render(this.blurScene, this.cam);
    }
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
