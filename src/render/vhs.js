// Single-pass "1996 camcorder" post effect.
import * as THREE from 'three';

const frag = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform float uNear, uFar, uAO, uSharp;
uniform vec2 uProj;      // tan(fov/2) * aspect, tan(fov/2)
uniform int uTaps;
uniform float uTime, uDanger, uNV, uGlitch, uFade, uWhite, uBattery, uClean;
uniform vec2 uRes, uTexel;
uniform vec3 uGrade;
varying vec2 vUv;
// filmic grade: gentle S-curve, a little extra saturation, cool lifted shadows
vec3 grade(vec3 c){
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, 1.12);
  c += vec3(0.006, 0.008, 0.016) * (1.0 - smoothstep(0.0, 0.3, l));
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, 0.35);
  return clamp(c, 0.0, 1.0) * uGrade;
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

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }

// ---- contact shadows from the depth buffer: corners, under furniture, where things touch
float viewZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return uNear * uFar / ((uFar - uNear) * d - uFar); }
vec3 viewPos(vec2 uv){ float z = viewZ(uv); return vec3((uv * 2.0 - 1.0) * uProj * -z, z); }
float ambientOcclusion(vec2 uv){
  vec3 P = viewPos(uv);
  float dist = -P.z;
  if (dist > 28.0) return 1.0;
  // normal from the nearer neighbour on each axis, so edges do not smear
  vec3 px = viewPos(uv + vec2(uTexel.x, 0.0)) - P, mx = P - viewPos(uv - vec2(uTexel.x, 0.0));
  vec3 py = viewPos(uv + vec2(0.0, uTexel.y)) - P, my = P - viewPos(uv - vec2(0.0, uTexel.y));
  vec3 N = normalize(cross(abs(px.z) < abs(mx.z) ? px : mx, abs(py.z) < abs(my.z) ? py : my));
  float R = 0.55;
  vec2 rad = R / (2.0 * uProj * dist);                       // the sample disc in uv
  rad = min(rad, vec2(0.12));
  float rot = (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) * 1.1;   // a small turn per pixel: hides banding without visible stipple
  float occ = 0.0, n = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uTaps) break;
    float fi = float(i) + 0.5, r = sqrt(fi / float(uTaps)), a = fi * 2.3999632 + rot;
    vec3 S = viewPos(uv + vec2(cos(a), sin(a)) * r * rad) - P;
    float l2 = dot(S, S);
    occ += max(dot(N, S) * inversesqrt(l2 + 1e-5) - 0.12, 0.0) * step(l2, R * R * 2.2) / (1.0 + l2 * 4.0);
    n += 1.0;
  }
  float ao = clamp(1.0 - occ / n * 2.6, 0.0, 1.0);
  return mix(1.0, ao, smoothstep(28.0, 18.0, dist));
}
// the scene colour with contact shadows and a light unsharp mask
vec3 scene(vec2 uv){
  vec3 c = texture2D(tDiffuse, uv).rgb;
  if (uSharp > 0.0) {
    vec3 b = texture2D(tDiffuse, uv + vec2(uTexel.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(uTexel.x, 0.0)).rgb
           + texture2D(tDiffuse, uv + vec2(0.0, uTexel.y)).rgb + texture2D(tDiffuse, uv - vec2(0.0, uTexel.y)).rgb;
    c = max(c + (c - b * 0.25) * uSharp, 0.0);
  }
  if (uAO > 0.0) { float ao = ambientOcclusion(uv); c *= mix(1.0, ao, uAO * (1.0 - smoothstep(0.55, 0.95, max(c.r, max(c.g, c.b))))); }
  return c;
}

void main(){
  // "Layar jernih": no lens, jitter, tracking, aberration, grain, scanlines or static
  if (uClean > 0.5) {
    vec3 c = grade(pow(max(scene(vUv) + bloom(vUv), 0.0), vec3(1.0 / 2.2)));
    if (uNV > 0.5) { float n = pow(dot(c, vec3(0.3, 0.6, 0.1)) * 2.6, 0.75); c = vec3(0.25, 1.0, 0.35) * n; }
    vec2 q = vUv - 0.5;
    c *= mix(0.82, 1.0, smoothstep(0.9, 0.3, length(q * vec2(1.1, 1.25))));
    c += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 160.0;      // dither: no banding in the dark
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
  col += bloom(uv);
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
    };
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
  }
  render(scene, camera, t) {
    this.uniforms.uTime.value = t;
    const U = this.uniforms, th = Math.tan(camera.fov * Math.PI / 360);
    U.uNear.value = camera.near; U.uFar.value = camera.far; U.uProj.value.set(th * camera.aspect, th);
    U.uAO.value = this.target.depthTexture ? (this.aoStrength || 0) : 0;
    const r = this.renderer;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.cam);
  }
}
