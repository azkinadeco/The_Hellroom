// Rain where a floor is open to the sky. Streaks fall in a box round the camera;
// a mask texture of the floor's roofless cells keeps them out of every room.
import * as THREE from 'three';
import { CELL } from '../config.js';

const vert = /* glsl */`
uniform vec3 uCam; uniform float uTime, uFall; uniform sampler2D uMask; uniform vec2 uGrid;
attribute vec3 seed; attribute float tip;
varying float vA;
void main(){
  const vec3 B = vec3(18.0, 12.0, 18.0);
  vec3 p = seed * B;
  p.y -= uTime * uFall + seed.x * 31.0;
  p = mod(p - uCam + B * 0.5, B) + uCam - B * 0.5;
  p.y = mod(p.y, B.y) - 1.0;                 // from just under the floor up to 11 m
  vec3 wind = vec3(0.12, -1.0, 0.05);
  p += wind * tip * 0.55;                    // the second vertex of each streak trails behind
  // only over roofless cells
  vec2 uv = (floor(p.xz / ${CELL.toFixed(1)}) + 0.5) / uGrid;
  float open = texture2D(uMask, uv).r * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float d = length(p.xz - uCam.xz);
  vA = open * smoothstep(9.0, 3.0, d) * smoothstep(-0.9, 0.2, p.y) * (0.35 + 0.65 * seed.z);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const frag = /* glsl */`
uniform vec3 uCol; uniform float uLit;
varying float vA;
void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(uCol * uLit, vA * 0.5); }`;

export class Rain {
  constructor(n = 1400) {
    const seed = new Float32Array(n * 2 * 3), tip = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const a = Math.random(), b = Math.random(), c = Math.random(); for (let k = 0; k < 2; k++) { seed.set([a, b, c], (i * 2 + k) * 3); tip[i * 2 + k] = k; } }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('tip', new THREE.BufferAttribute(tip, 1));
    this.mask = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat);
    this.u = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFall: { value: 7.5 }, uMask: { value: this.mask }, uGrid: { value: new THREE.Vector2(1, 1) },
      uCol: { value: new THREE.Color(0.62, 0.66, 0.72) }, uLit: { value: 1 } };
    this.lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false }));
    this.lines.frustumCulled = false; this.lines.renderOrder = 3; this.lines.visible = false;
    this.amount = 0;
  }
  // Cells of floor k that rain reaches: the sky is open on this floor or above, and every
  // storey in between has a hole (void) in that spot, so it falls straight down the shaft.
  setFloor(floors, k) {
    const m = floors[k].gen.map, N = m.W * m.H, data = new Uint8Array(N);
    let n = 0;
    for (let i = 0; i < N; i++) {
      if (m.region[i] === -1) continue;
      for (let j = k; j < floors.length; j++) {
        const g = floors[j].gen;
        if (g.map.W !== m.W || g.map.H !== m.H) break;
        if (j > k && g.map.region[i] !== -2) break;          // a slab in the way
        if ((g.noCeil || [])[i]) { data[i] = 255; n++; break; }
      }
    }
    this.mask.dispose();
    this.mask = new THREE.DataTexture(data, m.W, m.H, THREE.RedFormat);
    this.mask.magFilter = this.mask.minFilter = THREE.NearestFilter; this.mask.needsUpdate = true;
    this.u.uMask.value = this.mask; this.u.uGrid.value.set(m.W, m.H);
    this.cells = n; this.open = data;
    this.lines.visible = n > 0;
  }
  update(camera, t, lit) {
    camera.getWorldPosition(this.u.uCam.value);
    this.u.uTime.value = t; this.u.uLit.value = lit;
  }
}
