// Cheap "art pass" layers that make the baked rooms read as solid spaces:
//  - fake ambient occlusion: dark gradient strips where floor/ceiling meet walls
//    and down inner corners (one mesh per floor)
//  - soft contact shadows under every standing prop (one instanced mesh)
//  - light pools on the floor and halos on the ceiling round lit fixtures
//  - dust motes drifting round the camera, caught by the flashlight beam
import * as THREE from 'three';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
let _grad = null, _blob = null, _glow = null;
// v = 0 at the crease (opaque) -> v = 1 (clear), soft quadratic falloff
const gradTex = () => _grad || (_grad = canvasTex(4, 64, (g, w, h) => {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1), a = Math.round(255 * Math.pow(1 - t, 1.25));
    for (let x = 0; x < w; x++) { const o = ((h - 1 - y) * w + x) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = a; img.data[o + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
}));
const radial = (stops) => canvasTex(64, 64, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  for (const [o, c] of stops) r.addColorStop(o, c);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const blobTex = () => _blob || (_blob = radial([[0, '#fff'], [0.45, '#bbb'], [0.8, '#333'], [1, '#000']]));
const glowTex = () => _glow || (_glow = radial([[0, '#fff'], [0.25, '#9a9a9a'], [0.6, '#262626'], [1, '#000']]));

// ---------- ambient occlusion strips ----------
export class AOBuilder {
  constructor() { this.pos = []; this.uv = []; this.idx = []; }
  // rectangle from origin along u (length a) and v (length b); v = 0 is the dark edge
  quad(o, u, v, a, b) {
    const n = this.pos.length / 3;
    for (const [s, t] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      this.pos.push(o[0] + u[0] * a * s + v[0] * b * t, o[1] + u[1] * a * s + v[1] * b * t, o[2] + u[2] * a * s + v[2] * b * t);
      this.uv.push(s, t);
    }
    this.idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
  }
  mesh(opacity = 0.7) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0x000000, alphaMap: gradTex(), transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2,
    }));
    m.renderOrder = 1;
    m.matrixAutoUpdate = false;
    m.name = 'ao';
    return m;
  }
}

// ---------- contact shadows ----------
const boxCache = new Map();
function footprint(assets, type) {
  if (boxCache.has(type)) return boxCache.get(type);
  const obj = assets.models[type];
  let fp = null;
  if (obj) {
    const b = new THREE.Box3().setFromObject(obj);
    const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z, sy = b.max.y - b.min.y;
    // skip wall-hung pieces, flat decals and anything huge
    if (isFinite(sx) && b.min.y < 0.2 && sy > 0.12 && sx < 7 && sz < 7 && Math.max(sx, sz) > 0.2)
      fp = { cx: (b.min.x + b.max.x) / 2, cz: (b.min.z + b.max.z) / 2, sx, sz, tall: sy };
  }
  boxCache.set(type, fp);
  return fp;
}
const NO_SHADOW = new Set(['ceiling_light', 'slide_top', 'stain_decal', 'puddle', 'rug']);
export function contactShadows(assets, list) {
  const items = [];
  for (const p of list) {
    if (NO_SHADOW.has(p.type)) continue;
    const fp = footprint(assets, p.type);
    if (!fp) continue;
    items.push([p, fp]);
  }
  if (!items.length) return null;
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: blobTex(), transparent: true, opacity: 0.6, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3 });
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  items.forEach(([p, fp], i) => {
    const sc = p.scale || 1, r = p.rot || 0, c = Math.cos(r), sn = Math.sin(r);
    const cx = fp.cx * sc, cz = fp.cz * sc;
    // a little wider than the footprint; tall things cast a bigger, softer pool
    const grow = 0.25 + Math.min(0.5, fp.tall * 0.12);
    v.set(p.x + cx * c + cz * sn, (p.y || 0) + 0.008, p.z - cx * sn + cz * c);
    q.setFromAxisAngle(up, r);
    m4.compose(v, q, s.set(fp.sx * sc * 1.15 + grow, 1, fp.sz * sc * 1.15 + grow));
    im.setMatrixAt(i, m4);
  });
  im.renderOrder = 1;
  im.name = 'contact';
  return im;
}

// ---------- light pools and ceiling halos ----------
// returns { meshes, mats: [{ m, base, flick }] } — mats are driven per frame by the game
export function lightGlows(lights, wallH, tint, isFloor) {
  const groups = { on: [], flicker: [] };
  for (const l of lights) {
    if (l.state === 'off' || l.fixture === 'none' || l.tall) continue;
    (groups[l.state] || groups.on).push(l);
  }
  const meshes = [], mats = [];
  const col = new THREE.Color(1, 0.93, 0.78).multiply(new THREE.Color(tint[0], tint[1], tint[2]));
  const mk = (list, w, y, base, flick, floor) => {
    if (!list.length) return;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(floor ? -Math.PI / 2 : Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: col, map: glowTex(), transparent: true, opacity: base, depthWrite: false,
      blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4 });
    const im = new THREE.InstancedMesh(geo, m, list.length);
    const m4 = new THREE.Matrix4();
    list.forEach((l, i) => {
      const yy = floor ? 0.012 : (l.y ?? wallH) - 0.008;
      m4.makeScale(w, 1, w).setPosition(l.x, yy, l.z);
      im.setMatrixAt(i, m4);
    });
    im.renderOrder = 2;
    meshes.push(im); mats.push({ m, base, flick });
  };
  for (const [state, list] of Object.entries(groups)) {
    const flick = state === 'flicker';
    mk(list.filter((l) => (l.y ?? wallH) <= wallH + 0.05 && isFloor(l.x, l.z)), 3.0, 0, 0.2, flick, true);
    mk(list, 2.6, 0, 0.32, flick, false);
  }
  return { meshes, mats };
}

// ---------- dust ----------
const dustVert = /* glsl */`
uniform vec3 uCam, uDir; uniform float uTime, uLight, uPx;
attribute vec3 seed;
varying float vA;
void main(){
  const vec3 B = vec3(10.0, 4.0, 10.0);
  vec3 drift = vec3(sin(uTime * 0.07 + seed.y * 6.0) * 0.6 + uTime * 0.03, sin(uTime * 0.11 + seed.x * 9.0) * 0.3 - uTime * 0.012, cos(uTime * 0.05 + seed.z * 7.0) * 0.6);
  vec3 p = mod(seed * B + drift - uCam + B * 0.5, B) + uCam - B * 0.5;
  p.y = clamp(p.y, uCam.y - 1.55, uCam.y + 1.3);
  vec3 d = p - uCam; float dist = length(d);
  float beam = smoothstep(0.86, 0.97, dot(d / dist, uDir)) * uLight * smoothstep(9.0, 1.5, dist);
  float edge = smoothstep(5.0, 3.5, max(abs(d.x), abs(d.z)));
  vA = (0.07 + beam * 0.85) * edge * smoothstep(0.25, 0.6, dist);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPx * (0.9 + seed.x) / -mv.z, 1.0, 6.0);
}`;
const dustFrag = /* glsl */`
uniform vec3 uCol; varying float vA;
void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)) * vA; gl_FragColor = vec4(uCol * a, a); }`;

export class Dust {
  constructor(n = 280) {
    const seed = new Float32Array(n * 3);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    this.u = { uCam: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uTime: { value: 0 }, uLight: { value: 0 },
      uPx: { value: 6 }, uCol: { value: new THREE.Color(0.9, 0.86, 0.74) } };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: dustVert, fragmentShader: dustFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  update(camera, t, light, viewH) {
    camera.getWorldPosition(this.u.uCam.value);
    camera.getWorldDirection(this.u.uDir.value);
    this.u.uTime.value = t;
    this.u.uLight.value = light;
    this.u.uPx.value = viewH * 0.012;
  }
}
