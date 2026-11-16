// The sky is one enormous eye. Wherever a level opens to the sky, the whole
// opening is filled by a single bloodshot eye whose iris follows the player,
// with heavy lids that blink now and then.
import * as THREE from 'three';

const vert = /* glsl */`
varying vec2 vP;
void main(){
  vP = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */`
uniform vec2 uHalf;      // half extents of the opening, metres
uniform vec2 uLook;      // camera position in the plane's frame, metres
uniform float uTime, uBlink, uPower;
varying vec2 vP;

float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; } return s; }

void main(){
  vec2 q = vP / uHalf;                       // -1..1 across the opening
  float R = min(uHalf.x, uHalf.y);
  // almond-shaped opening of the lids; the long axis follows the long side
  vec2 a = uHalf.x >= uHalf.y ? q : q.yx;
  float open = (1.0 - a.x * a.x) * 1.08 * (1.0 - uBlink);
  float lid = abs(a.y) - open;
  // flesh of the lids and the skin round the eye: dark, wrinkled, faintly lit
  float wr = fbm(vec2(a.x * 5.0, abs(a.y) * 24.0 - a.x * 3.0));
  vec3 skin = mix(vec3(0.10, 0.055, 0.05), vec3(0.24, 0.13, 0.11), wr) * (0.6 + 0.4 * smoothstep(1.2, 0.0, abs(a.y)));
  skin *= 0.55 + 0.45 * smoothstep(0.35, 0.0, lid);          // shadow deepens away from the lash line
  // eyeball, in metres
  vec2 p = vP;
  vec2 c = clamp(uLook * 0.45, -uHalf * 0.42, uHalf * 0.42);
  c += vec2(sin(uTime * 0.37), cos(uTime * 0.29)) * R * 0.015;   // tiny saccades
  float ri = R * 0.36;
  float d = length(p - c);
  // sclera: yellowed white, bloodshot towards the corners
  vec3 col = vec3(0.78, 0.74, 0.64);
  float edge = smoothstep(0.2, 1.0, length(q));
  float ang = atan(p.y - c.y, p.x - c.x);
  float veins = smoothstep(0.62, 0.9, fbm(vec2(ang * 3.0, d / R * 6.0 - uTime * 0.02))) * smoothstep(ri * 1.05, R * 1.3, d);
  veins += smoothstep(0.7, 0.95, fbm(p / R * 9.0)) * edge;
  col = mix(col, vec3(0.55, 0.06, 0.05), clamp(veins * 0.9 + edge * 0.25, 0.0, 1.0));
  col *= 0.75 + 0.25 * fbm(p / R * 3.0);
  // iris: fibrous amber ring into a dark red rim
  float fib = fbm(vec2(ang * 9.0, d / ri * 3.0));
  vec3 iris = mix(vec3(0.42, 0.22, 0.05), vec3(0.85, 0.55, 0.12), fib);
  iris = mix(iris, vec3(0.18, 0.03, 0.02), smoothstep(0.65, 1.0, d / ri));
  iris *= 0.75 + 0.35 * smoothstep(0.9, 0.4, d / ri);
  col = mix(col, iris, smoothstep(ri * 1.02, ri * 0.97, d));
  // pupil, breathing slowly
  float rp = ri * (0.42 + 0.06 * sin(uTime * 0.6));
  col = mix(col, vec3(0.01, 0.0, 0.0), smoothstep(rp * 1.04, rp * 0.96, d));
  // wet highlight
  vec2 hl = c + vec2(-0.35, -0.3) * ri;
  col += vec3(0.9, 0.9, 0.85) * smoothstep(ri * 0.16, ri * 0.05, length(p - hl)) * 0.8;
  // shading under the lids
  col *= smoothstep(-0.02, -0.35, lid) * 0.65 + 0.35;
  vec3 outc = mix(col, skin, smoothstep(-0.015, 0.015, lid));
  // dark lash line
  outc *= 1.0 - 0.75 * smoothstep(0.06, 0.0, abs(lid));
  outc *= uPower;
  gl_FragColor = vec4(outc, 1.0);
}`;

// Variant: a full lid of blood-red cloud over everything, slowly turning round one giant eye
// set in the middle of it, which follows you as you cross the yard below.
// the cloud lid bends down past the opening like the inside of a dome, so no edge shows over the roofs
const cloudVert = /* glsl */`
uniform vec2 uEye;
varying vec2 vP;
void main(){
  vP = position.xz;
  vec3 q = position;
  float r = max(0.0, length(q.xz) - max(uEye.x, uEye.y) * 1.2);
  q.y -= r * r * 0.007;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
}`;
const cloudFrag = /* glsl */`
uniform vec2 uHalf;      // half extents of the cloud plane, metres
uniform vec2 uEye;       // half extents of the opening the eye sits over, metres
uniform vec2 uLook;
uniform float uTime, uBlink, uPower, uStare, uFlash;
varying vec2 vP;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main(){
  vec2 p = vP;
  float R = min(uEye.x, uEye.y) * 0.62;            // eye half-height
  float W = R * 1.65;                              // eye half-width (almond)
  float r = length(p);
  // clouds swirl round the eye, faster close in
  float sw = 2.4 / (1.0 + r / (R * 2.5)) + uTime * 0.012;
  vec2 cp = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p;
  float c1 = fbm(cp / 14.0 + vec2(uTime * 0.01, 0.0));
  float c2 = fbm(cp / 5.5 - vec2(0.0, uTime * 0.02) + c1 * 1.7);
  float dens = smoothstep(0.25, 0.85, c1 * 0.6 + c2 * 0.6);
  vec3 deep = vec3(0.10, 0.008, 0.006), mid = vec3(0.42, 0.04, 0.025), hi = vec3(0.85, 0.22, 0.10);
  vec3 col = mix(deep, mid, dens);
  col = mix(col, hi, smoothstep(0.62, 0.95, c2) * 0.55);
  // glow bleeding out from the eye
  col += vec3(0.5, 0.06, 0.02) * exp(-max(0.0, r - R) / (R * 1.4)) * 0.55;
  // a slow pulse through the whole sky
  col *= 0.85 + 0.15 * sin(uTime * 0.7 + r * 0.05);
  col += vec3(0.9, 0.18, 0.08) * uFlash * (0.4 + dens);            // lightning inside the clouds
  // the eye: almond lids drawn from cloud, opening and closing
  vec2 a = vec2(p.x / W, p.y / R);
  float open = (1.0 - a.x * a.x) * (1.0 - uBlink);
  float lid = abs(a.y) - open;
  if (lid < 0.06) {
    vec2 c = clamp(uLook * 0.18, -vec2(W, R) * 0.45, vec2(W, R) * 0.45);
    c += vec2(sin(uTime * 0.41), cos(uTime * 0.33)) * R * 0.025;
    float ri = R * 0.62, d = length(p - c), ang = atan(p.y - c.y, p.x - c.x);
    vec3 e = vec3(0.80, 0.70, 0.58);
    float veins = smoothstep(0.6, 0.9, fbm(vec2(ang * 3.0, d / R * 5.0))) * smoothstep(ri, W, d);
    e = mix(e, vec3(0.6, 0.05, 0.04), clamp(veins + smoothstep(0.3, 1.0, length(a)) * 0.5, 0.0, 1.0));
    float fib = fbm(vec2(ang * 9.0, d / ri * 3.0));
    vec3 iris = mix(vec3(0.55, 0.08, 0.03), vec3(0.95, 0.45, 0.08), fib);
    iris = mix(iris, vec3(0.15, 0.0, 0.0), smoothstep(0.65, 1.0, d / ri));
    iris *= 1.0 + uStare * 0.8;
    e = mix(e, iris, smoothstep(ri * 1.02, ri * 0.97, d));
    float rp = ri * (0.30 + 0.05 * sin(uTime * 0.5)) * (1.0 + uStare * 1.1);   // fixed on you: the slit opens wide
    e = mix(e, vec3(0.0), smoothstep(rp * 1.05, rp * 0.95, abs(p.x - c.x) * 2.2 + abs(p.y - c.y) * 0.55));   // slit pupil
    e += vec3(1.0, 0.9, 0.8) * smoothstep(ri * 0.14, ri * 0.04, length(p - c - vec2(-0.3, 0.3) * ri)) * 0.7;
    e *= smoothstep(-0.0, -0.35, lid) * 0.6 + 0.4;
    col = mix(e * 1.15, col, smoothstep(-0.02, 0.05, lid));
    col *= 1.0 - 0.8 * smoothstep(0.07, 0.0, abs(lid));     // dark rim of the lids
  }
  gl_FragColor = vec4(col * uPower, 1.0);
}`;

const eyes = new Set();
export function cloudEye(w, d, ew, ed) {
  const u = { uHalf: { value: new THREE.Vector2(w / 2, d / 2) }, uEye: { value: new THREE.Vector2(ew / 2, ed / 2) }, uLook: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBlink: { value: 0 }, uPower: { value: 0.9 }, uStare: { value: 0 }, uFlash: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 48, 48).rotateX(Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: cloudVert, fragmentShader: cloudFrag, fog: false, side: THREE.DoubleSide }));
  const v = new THREE.Vector3();
  m.onBeforeRender = (r, s, cam) => { v.copy(cam.getWorldPosition(v)); m.worldToLocal(v); u.uLook.value.set(v.x, v.z); };
  m.name = 'skyeye'; m.userData.eye = u; m.userData.cloud = true; m.frustumCulled = false;
  eyes.add(u);
  return m;
}
export function resetSkyEyes() { eyes.clear(); }
export function skyEye(w, d) {
  const u = { uHalf: { value: new THREE.Vector2(w / 2, d / 2) }, uLook: { value: new THREE.Vector2() }, uTime: { value: 0 }, uBlink: { value: 0 }, uPower: { value: 0.9 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: u, vertexShader: vert, fragmentShader: frag, fog: false }));
  const v = new THREE.Vector3();
  m.onBeforeRender = (r, s, cam) => {
    v.copy(cam.getWorldPosition(v)); m.worldToLocal(v);
    u.uLook.value.set(v.x, v.z);
  };
  m.userData.eye = u;
  m.name = 'skyeye';
  eyes.add(u);
  return m;
}
// per frame: time and the blink (a quick close every 6–14 s)
let nextBlink = 5, blinkT = -1;
export function updateSkyEyes(t, dt, power, stare = 0, flash = 0) {
  if (blinkT < 0 && t > nextBlink) blinkT = 0;
  let b = 0;
  if (blinkT >= 0) {
    blinkT += dt;
    b = blinkT < 0.12 ? blinkT / 0.12 : blinkT < 0.22 ? 1 : Math.max(0, 1 - (blinkT - 0.22) / 0.25);
    if (blinkT > 0.5) { blinkT = -1; nextBlink = t + 6 + Math.random() * 8; }
  }
  if (stare > 0.6) b *= 0.2;   // it does not blink while it watches you
  for (const u of eyes) { if (u.uStare) { u.uStare.value = stare; u.uFlash.value = flash; } u.uTime.value = t; u.uBlink.value = b; u.uPower.value = u.uEye ? 0.75 + 0.25 * power : 0.4 + 0.35 * power; }
}
