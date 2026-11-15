// Atmosphere that is not part of the building: the haze the flashlight cuts
// through, mist lying on the floor, cobwebs in the ceiling corners and the
// uneven glass of the torch itself. All of it is a handful of draw calls.
import * as THREE from 'three';
import { CELL, WALL_H } from '../config.js';
import { DIRS, EDGE } from '../level/map.js';

// ---------- flashlight cookie: a real torch never throws an even disc ----------
export function flashlightCookie() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  const rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  rg.addColorStop(0, '#fff'); rg.addColorStop(0.22, '#f4f4f4'); rg.addColorStop(0.3, '#cfcfcf'); rg.addColorStop(0.36, '#e6e6e6');
  rg.addColorStop(0.62, '#9a9a9a'); rg.addColorStop(0.7, '#b4b4b4'); rg.addColorStop(0.86, '#5a5a5a'); rg.addColorStop(1, '#000');
  g.fillStyle = rg; g.fillRect(0, 0, N, N);
  // filament shadow, dust on the lens, a scratch
  let sd = 77; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = 'rgba(120,120,120,0.55)'; g.beginPath(); g.ellipse(N / 2 + 6, N / 2 - 3, 9, 5, 0.6, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * N * 0.46, s = 2 + rnd() * 7;
    g.fillStyle = `rgba(${150 + rnd() * 60 | 0},${150 + rnd() * 60 | 0},${150 + rnd() * 60 | 0},${0.25 + rnd() * 0.4})`;
    g.beginPath(); g.arc(N / 2 + Math.cos(a) * r, N / 2 + Math.sin(a) * r, s, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(140,140,140,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(N * 0.28, N * 0.7); g.quadraticCurveTo(N * 0.5, N * 0.55, N * 0.74, N * 0.66); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return t;
}

// ---------- the beam itself, visible in the haze ----------
const beamVert = /* glsl */`
varying vec3 vN; varying vec3 vV; varying float vT; varying vec3 vW;
void main(){
  vT = 1.0 - (position.y + 0.5);                 // 0 at the lens, 1 at the far end
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mv;
}`;
const beamFrag = /* glsl */`
uniform float uLight, uTime; uniform vec3 uCol;
varying vec3 vN; varying vec3 vV; varying float vT; varying vec3 vW;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);       // soft silhouette, no hard cone edge
  float fall = smoothstep(0.0, 0.06, vT) * pow(1.0 - vT, 1.7);
  float smoke = 0.55 + 0.9 * n3(vW * 1.3 + vec3(uTime * 0.08, -uTime * 0.05, uTime * 0.06));
  float a = rim * fall * smoke * uLight * 0.085;
  gl_FragColor = vec4(uCol * a, a);
}`;
export class Beam {
  constructor(light) {
    const L = 9, ang = 0.27;
    const geo = new THREE.ConeGeometry(Math.tan(ang) * L, 1, 28, 1, true);   // unit height, apex at +0.5
    this.u = { uLight: { value: 0 }, uTime: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.94, 0.82) } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: beamVert, fragmentShader: beamFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }));
    this.mesh.scale.set(1, L, 1);
    // apex on the lens, axis along the light's aim
    const from = light.position.clone(), dir = light.target.position.clone().sub(from).normalize();
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    this.mesh.position.copy(from).addScaledVector(dir, L / 2);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
  }
  update(t, light, haze) { this.u.uTime.value = t; this.u.uLight.value = light * haze; this.mesh.visible = light * haze > 0.01; }
}

// ---------- mist on the floor ----------
const mistVert = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const mistFrag = /* glsl */`
uniform vec3 uCam, uDir, uCol, uLamp; uniform float uTime, uAmt, uLight, uPower;
varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = vW.xz;
  float a = n(p * 0.35 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + n(p * 0.9 - vec2(uTime * 0.07, -uTime * 0.04)) * 0.3 + n(p * 2.4 + uTime * 0.1) * 0.1;
  a = smoothstep(0.32, 0.78, a);
  vec3 d = vW - uCam; float dist = length(d);
  a *= smoothstep(0.7, 2.6, dist) * smoothstep(15.0, 7.0, dist);          // none in your face, none at the rim of the sheet
  float beam = smoothstep(0.80, 0.97, dot(d / dist, uDir)) * uLight * smoothstep(11.0, 2.0, dist);
  vec3 c = uCol * (0.35 + 0.65 * uPower) + uLamp * beam * 0.9;
  a *= uAmt * (0.5 + beam * 0.6);
  gl_FragColor = vec4(c * a, a);
}`;
export class Mist {
  constructor() {
    this.u = { uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uCol: { value: new THREE.Color(0.2, 0.21, 0.2) },
      uLamp: { value: new THREE.Color(0.55, 0.5, 0.42) }, uTime: { value: 0 }, uAmt: { value: 0.5 }, uLight: { value: 0 }, uPower: { value: 1 } };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide });
    this.group = new THREE.Group();
    // two sheets at different heights read as a volume when you look across them
    for (const y of [0.16, 0.42]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), mat); m.rotation.x = -Math.PI / 2; m.position.y = y; m.frustumCulled = false; m.renderOrder = 2; this.group.add(m); }
    this.y = 0;
  }
  update(camera, t, light, power, groundY, dt) {
    camera.getWorldPosition(this.u.uCam.value); camera.getWorldDirection(this.u.uDir.value);
    this.y += (groundY - this.y) * Math.min(1, dt * 3);
    this.group.position.set(this.u.uCam.value.x, this.y, this.u.uCam.value.z);
    this.u.uTime.value = t; this.u.uLight.value = light; this.u.uPower.value = power;
  }
}

// ---------- cobwebs ----------
let WEB = null;
function webTexture() {
  if (WEB) return WEB;
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  let sd = 4242; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  // the corner is at the top middle; threads fan down from it and sag between each other
  const ox = N / 2, oy = 2, spokes = [];
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.06 + 0.88 * (i + (rnd() - 0.5) * 0.5) / 8); spokes.push({ a, len: N * (0.62 + rnd() * 0.36) }); }
  g.lineCap = 'round';
  // a faint sheet of old dust between the threads
  const sheet = g.createRadialGradient(ox, oy, 0, ox, oy, N * 0.8); sheet.addColorStop(0, 'rgba(235,235,225,0.6)'); sheet.addColorStop(0.6, 'rgba(235,235,225,0.22)'); sheet.addColorStop(1, 'rgba(235,235,225,0)');
  g.fillStyle = sheet; g.beginPath(); g.moveTo(ox, oy); for (const s of spokes) g.lineTo(ox + Math.cos(s.a) * s.len, oy + Math.sin(s.a) * s.len); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(245,245,238,0.95)';
  for (const s of spokes) { g.lineWidth = 2.0 + rnd() * 1.2; g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + Math.cos(s.a) * s.len, oy + Math.sin(s.a) * s.len); g.stroke(); }
  for (let r = 0.12; r < 0.95; r += 0.05 + rnd() * 0.05) {
    for (let i = 0; i < spokes.length - 1; i++) {
      const A = spokes[i], B = spokes[i + 1], ra = Math.min(r * N, A.len), rb = Math.min(r * N, B.len);
      if (r * N > Math.max(A.len, B.len) || rnd() < 0.12) continue;
      const ax = ox + Math.cos(A.a) * ra, ay = oy + Math.sin(A.a) * ra, bx = ox + Math.cos(B.a) * rb, by = oy + Math.sin(B.a) * rb;
      const mx = (ax + bx) / 2, my = (ay + by) / 2 + 5 + rnd() * 7;           // sag
      g.lineWidth = 1.3 + rnd() * 0.9; g.globalAlpha = 0.7 + rnd() * 0.3;
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by); g.stroke();
    }
  }
  g.globalAlpha = 1;
  // torn strands hanging down, a few husks
  for (let i = 0; i < 7; i++) { const s = spokes[1 + (rnd() * 7 | 0)], r = s.len * (0.4 + rnd() * 0.6), x = ox + Math.cos(s.a) * r, y = oy + Math.sin(s.a) * r; g.lineWidth = 1.4; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, Math.min(N - 2, y + 14 + rnd() * 34)); g.stroke(); }
  g.globalAlpha = 0.9; g.fillStyle = 'rgba(60,55,48,0.9)';
  for (let i = 0; i < 4; i++) { const s = spokes[1 + (rnd() * 7 | 0)], r = s.len * (0.3 + rnd() * 0.5); g.beginPath(); g.ellipse(ox + Math.cos(s.a) * r, oy + Math.sin(s.a) * r, 2.2, 1.4, rnd() * 3, 0, Math.PI * 2); g.fill(); }
  WEB = new THREE.CanvasTexture(c);
  WEB.colorSpace = THREE.SRGBColorSpace; WEB.anisotropy = 4;
  return WEB;
}
const WEBS = { detention: 0.5, school: 0.3, hospital: 0.3, museum: 0.22, backroom: 0.18, mall: 0.12, pool: 0.05 };
// one instanced sheet per inside corner that the dice pick, hung diagonally under the ceiling
export function buildWebs(map, def, seed = 1, skip = null) {
  const p = def.webs ?? WEBS[def.arch] ?? 0.25;
  if (!p) return null;
  let sd = (seed * 2654435761) >>> 0 || 1; const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const blocks = (x, z, d) => { const e = map.edge(x, z, d); return e === EDGE.WALL || e === EDGE.NONE; };
  const mats = [], M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let z = 0; z < map.H; z++) for (let x = 0; x < map.W; x++) {
    if (map.reg(x, z) < 0 || (skip && skip[x + z * map.W])) continue;
    for (const dx of [DIRS[0], DIRS[1]]) for (const dz of [DIRS[2], DIRS[3]]) {
      if (!blocks(x, z, dx) || !blocks(x, z, dz) || rnd() > p) continue;
      const s = 0.8 + rnd() * 0.8, in_ = 0.11 + s * 0.3;             // sheet width; how far out of the corner its middle sits
      const cx = (x + 0.5 + dx.dx * 0.5) * CELL - dx.dx * in_, cz = (z + 0.5 + dz.dz * 0.5) * CELL - dz.dz * in_;
      e.set(-(0.5 + rnd() * 0.35), Math.atan2(-dx.dx, -dz.dz), 0, 'YXZ');  // faces the room, top edge tipped back into the corner
      q.setFromEuler(e);
      M.compose(v.set(cx, WALL_H - 0.03 - s * 0.36, cz), q, sc.set(s * 1.5, s, 1));
      mats.push(M.clone());
    }
  }
  if (!mats.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, 0, 0);
  const mat = new THREE.MeshLambertMaterial({ map: webTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xe6e6dc, emissive: 0x24231d });
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true; im.renderOrder = 1; im.name = 'cobwebs';
  im.computeBoundingSphere();
  return im;
}
