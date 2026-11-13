// Environmental storytelling: bloody handprints, drag smears, scratched
// tallies, drips and scrawled warnings on the walls, bare footprints running
// away from hiding spots. Everything is drawn once into one canvas atlas and
// placed as a single instanced mesh per floor (one draw call), lit like the
// walls by the baked light field and by the flashlight.
import * as THREE from 'three';
import { bakeMaterial } from './bake.js';

const AT = 1024;
// square slots (256 px) in rows 0-1, text strips (512 x 128) in rows 2-3
const SQ = { hand: 0, hand2: 1, splat: 2, tally: 3, foot: 4, smear: 5, drips: 6, claw: 7 };
const TEXTS = ['JANGAN BERSUARA', 'DIA MENDENGARMU', 'JANGAN LIHAT MATANYA', 'SEMBUNYI', 'TIDAK ADA JALAN KELUAR',
  'AKU MASIH DI SINI', 'HITUNG LANGKAHMU', 'DIA DI BELAKANGMU'];
const slotSq = (i) => [(i % 4) * 256, Math.floor(i / 4) * 256, 256, 256];
const slotTx = (i) => [(i % 2) * 512, 512 + Math.floor(i / 2) * 128, 512, 128];

let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = c.height = AT;
  const g = c.getContext('2d');
  let sd = 4242; const R = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const blood = (a) => `rgba(${70 + R() * 30 | 0},${4 + R() * 6 | 0},${4 + R() * 6 | 0},${a})`;
  const blot = (x, y, r, a) => { g.fillStyle = blood(a); g.beginPath(); g.ellipse(x, y, r * (0.7 + R() * 0.6), r * (0.7 + R() * 0.6), R() * 3, 0, 7); g.fill(); };
  const at = (i, fn) => { const [x, y, w, h] = slotSq(i); g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); fn(w, h); g.restore(); };
  // a hand: palm + five fingers, smeared downwards
  const hand = (cx, cy, s, rot, a) => {
    g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(s, s);
    g.fillStyle = blood(a);
    g.beginPath(); g.ellipse(0, 18, 26, 30, 0, 0, 7); g.fill();
    for (const [fx, fy, l, w, r] of [[-30, -10, 26, 7, -0.9], [-17, -32, 36, 7.5, -0.18], [0, -38, 40, 8, 0], [16, -34, 36, 7.5, 0.16], [29, -22, 28, 7, 0.38]]) {
      g.save(); g.translate(fx, fy); g.rotate(r); g.beginPath(); g.ellipse(0, -l / 2 + 8, w, l / 2 + 4, 0, 0, 7); g.fill(); g.restore();
    }
    // smear trails under the palm
    for (let i = 0; i < 6; i++) { g.fillStyle = blood(a * (0.25 + R() * 0.3)); g.fillRect(-22 + i * 8 + R() * 4, 30, 4 + R() * 4, 30 + R() * 70); }
    g.restore();
  };
  at(SQ.hand, () => { hand(128, 120, 1.25, 0.15, 0.85); });
  at(SQ.hand2, () => { hand(80, 110, 0.95, -0.4, 0.8); hand(170, 150, 0.9, 0.3, 0.6); hand(120, 200, 0.7, 0.1, 0.35); });
  at(SQ.splat, () => {
    blot(128, 128, 48, 0.9);
    for (let i = 0; i < 40; i++) { const a = R() * 6.28, d = 40 + R() * 80; blot(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2 + R() * 9 * (1 - d / 140), 0.85); }
    for (let i = 0; i < 9; i++) { const a = R() * 6.28; g.strokeStyle = blood(0.8); g.lineWidth = 3 + R() * 4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * (60 + R() * 50), 128 + Math.sin(a) * (60 + R() * 50)); g.stroke(); }
  });
  at(SQ.tally, () => {   // days scratched into the paint
    g.strokeStyle = 'rgba(20,16,14,0.85)'; g.lineCap = 'round';
    for (let row = 0; row < 4; row++) for (let grp = 0; grp < 3; grp++) {
      if (row === 3 && grp > 0) break;
      const ox = 22 + grp * 78, oy = 30 + row * 56;
      for (let k = 0; k < 4; k++) { g.lineWidth = 3 + R() * 2; g.beginPath(); g.moveTo(ox + k * 13 + R() * 3, oy); g.lineTo(ox + k * 13 + R() * 4 - 2, oy + 40 + R() * 6); g.stroke(); }
      g.beginPath(); g.moveTo(ox - 6, oy + 34); g.lineTo(ox + 52, oy + 6); g.stroke();
    }
  });
  at(SQ.foot, () => {   // one bare footprint, toes up
    g.fillStyle = blood(0.8);
    g.beginPath(); g.ellipse(128, 150, 34, 62, 0.05, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,0)';
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(146, 150, 12, 34, 0.08, 0, 7); g.fill();          // arch
    g.globalCompositeOperation = 'source-over';
    for (const [x, y, r] of [[106, 74, 11], [126, 66, 9], [143, 68, 8], [157, 74, 7], [168, 84, 6]]) blot(x, y, r, 0.85);
  });
  at(SQ.smear, () => {  // something dragged: broad streak with fingers clawing at the end
    for (let i = 0; i < 14; i++) { g.fillStyle = blood(0.12 + R() * 0.2); g.fillRect(88 + R() * 80, 20 + R() * 30, 6 + R() * 18, 200); }
    const gr = g.createLinearGradient(0, 30, 0, 236); gr.addColorStop(0, blood(0.85)); gr.addColorStop(1, blood(0.08));
    g.fillStyle = gr; g.fillRect(96, 30, 64, 206);
    for (let i = 0; i < 4; i++) { g.strokeStyle = blood(0.7); g.lineWidth = 5; g.beginPath(); g.moveTo(100 + i * 18, 34); g.lineTo(104 + i * 18 + R() * 6, 6); g.stroke(); }
  });
  at(SQ.drips, () => {
    // a seep along the ceiling line, uneven, runs dripping from it
    for (let x = 0; x < 256; x += 6) blot(x, 4 + R() * 8, 8 + R() * 10, 0.55);
    for (let i = 0; i < 16; i++) { const x = 8 + R() * 240, l = 30 + R() * 190, w = 2 + R() * 5; g.fillStyle = blood(0.7); g.fillRect(x, 6, w, l); blot(x + w / 2, 6 + l, w * 0.9, 0.8); }
  });
  at(SQ.claw, () => {   // four deep gouges through the plaster
    for (let k = 0; k < 4; k++) {
      const x0 = 50 + k * 42;
      for (const [col, lw, dx] of [['rgba(12,9,8,0.9)', 9, 0], ['rgba(200,190,170,0.35)', 3, 4]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 + dx, 20 + k * 6);
        g.bezierCurveTo(x0 + 20 + dx, 90, x0 + 6 + dx, 160, x0 + 34 + dx, 236 - k * 8); g.stroke();
      }
    }
  });
  // scrawled warnings: finger-painted letters, wobbling, dripping
  TEXTS.forEach((t, i) => {
    const [x, y, w, h] = slotTx(i);
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
    const charcoal = i % 3 === 2;
    const FONT = (n) => `900 ${n}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    let fs = 92; g.font = FONT(fs);
    while (g.measureText(t).width > w - 30 && fs > 34) { fs -= 4; g.font = FONT(fs); }
    g.lineJoin = 'round'; g.lineWidth = Math.max(3, fs * 0.09);
    let cx = (w - g.measureText(t).width) / 2;
    for (const ch of t) {
      const cw = g.measureText(ch).width;
      g.save(); g.translate(cx + cw / 2, h * 0.58 + (R() - 0.5) * 10); g.rotate((R() - 0.5) * 0.25);
      g.fillStyle = g.strokeStyle = charcoal ? 'rgba(18,16,15,0.85)' : blood(0.88);
      g.fillText(ch, -cw / 2, fs * 0.36); g.strokeText(ch, -cw / 2, fs * 0.36);
      if (!charcoal && ch !== ' ' && R() < 0.45) { g.fillRect(-2 + R() * 6, fs * 0.3, 3, 10 + R() * 26); }
      g.restore();
      cx += cw * (0.92 + R() * 0.12);
    }
    g.restore();
  });
  ATLAS = new THREE.CanvasTexture(c);
  ATLAS.colorSpace = THREE.SRGBColorSpace;
  ATLAS.anisotropy = 4;
  return ATLAS;
}
const rectOf = ([x, y, w, h]) => [x / AT, 1 - (y + h) / AT, w / AT, h / AT];

// walls: [{ p:[x,z] mid-point on the wall face, tan:[x,z], n:[x,z], len }]
// hides: gen.lockers with their front offsets; cells: walkable floor centres
export function storyDecals({ walls, hides, cells, field, busy = [], seed = 1, density = 1, wallH = 3 }) {
  let sd = (seed * 9301 + 49297) % 233280 || 7; const R = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
  const items = [];   // { pos, quat, sx, sy, rect }
  const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const onWall = (w, s, y, sx, sy, rect, tilt = 0) => {
    const px = w.p[0] + w.tan[0] * s + w.n[0] * 0.012, pz = w.p[1] + w.tan[1] * s + w.n[1] * 0.012;
    // lookAt points +Z from the target to the eye: target behind the face -> the plane faces the room
    m.lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-w.n[0], 0, -w.n[1]), up);
    q.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    items.push({ pos: new THREE.Vector3(px, y, pz), quat: q.clone(), sx, sy, rect, n: [w.n[0], 0, w.n[1]] });
  };
  const onFloor = (x, z, yaw, sx, sy, rect, lift = 0) => {
    q.setFromAxisAngle(up, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    items.push({ pos: new THREE.Vector3(x, 0.009 + lift, z), quat: q.clone(), sx, sy, rect, n: [0, 1, 0] });
  };
  const sq = (k) => rectOf(slotSq(SQ[k]));
  // wall marks
  const want = Math.min(70, Math.round(walls.length * 0.14 * density));
  const pool = walls.filter((w) => w.len > 1.3);
  const textOk = (w) => w.len > 2.5;
  const placed = [];   // [x, z] of wall marks already made, so they don't pile up
  for (let i = 0; i < want && pool.length; i++) {
    const w = pool.splice(Math.floor(R() * pool.length), 1)[0];
    const s = (R() - 0.5) * (w.len - 1.2);
    let r = R();
    // keep clear of furniture, hiding spots and signs on that wall; outside walls may get windows, so no text there
    const wx = w.p[0] + w.tan[0] * s, wz = w.p[1] + w.tan[1] * s;
    if (busy.some((b) => Math.abs(b.x - wx) < 1.1 && Math.abs(b.z - wz) < 1.1)) { i--; continue; }
    if (placed.some((q) => Math.hypot(q[0] - wx, q[1] - wz) < 3.2)) { i--; continue; }
    placed.push([wx, wz]);
    if ((w.outside || !textOk(w)) && r >= 0.7) r = R() * 0.7;
    if (r < 0.2) onWall(w, s, 1.0 + R() * 0.6, 0.52, 0.52, sq(R() < 0.5 ? 'hand' : 'hand2'), (R() - 0.5) * 0.5);
    else if (r < 0.34) onWall(w, s, 0.7 + R() * 0.9, 0.9, 0.9, sq('splat'), R() * 6);
    else if (r < 0.46) onWall(w, s, 1.0 + R() * 0.4, 0.55, 0.55, sq('tally'));
    else if (r < 0.58) onWall(w, s, 1.2 + R() * 0.3, 0.6, 0.9, sq('claw'), (R() - 0.5) * 0.3);
    else if (r < 0.7) onWall(w, s, wallH - 0.47, 0.9, 0.9, sq('drips'));
    else {
      const t = Math.floor(R() * TEXTS.length);
      onWall(w, Math.max(-(w.len - 2.5) / 2, Math.min((w.len - 2.5) / 2, s)), 1.55 + R() * 0.35, 2.4, 0.6, rectOf(slotTx(t)), (R() - 0.5) * 0.08);
    }
  }
  // footprints fleeing from some hiding spots (or leading into them)
  for (const h of hides) {
    if (R() > 0.22 * density) continue;
    const fx = Math.sin(h.rot), fz = Math.cos(h.rot), into = R() < 0.5, bend = (R() - 0.5) * 0.5;
    let x = h.x + fx * 0.9, z = h.z + fz * 0.9, a = Math.atan2(fx, fz);
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1, lx = Math.cos(a) * 0.11 * side, lz = -Math.sin(a) * 0.11 * side;
      onFloor(x + lx, z + lz, (into ? a + Math.PI : a) + Math.PI, 0.27, 0.36, sq('foot'), k * 0.0004);
      a += bend / 6; x += Math.sin(a) * 0.55; z += Math.cos(a) * 0.55;
    }
  }
  // drag smears and splashes on the floor
  const nFloor = Math.min(18, Math.round(cells.length * 0.05 * density));
  for (let i = 0; i < nFloor && cells.length; i++) {
    const c = cells[Math.floor(R() * cells.length)];
    const x = c[0] + (R() - 0.5) * 1.6, z = c[1] + (R() - 0.5) * 1.6;
    if (R() < 0.55) onFloor(x, z, R() * 6.28, 0.8, 2.2, sq('smear'), 0.0008 + i * 0.0002);
    else onFloor(x, z, R() * 6.28, 0.9, 0.9, sq('splat'), 0.0008 + i * 0.0002);
  }
  if (!items.length) return null;

  const geo = new THREE.PlaneGeometry(1, 1);
  const rect = new Float32Array(items.length * 4), bake = new Float32Array(items.length * 2);
  const src = new THREE.MeshLambertMaterial({ map: atlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  src.name = 'StoryDecal';
  const mat = bakeMaterial(src, 'attr');
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 uvRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv = uvRect.xy + uv * uvRect.zw;');
  };
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '-story';
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const s = new THREE.Vector3();
  items.forEach((it, i) => {
    m.compose(it.pos, it.quat, s.set(it.sx, it.sy, 1));
    im.setMatrixAt(i, m);
    rect.set(it.rect, i * 4);
    const b = field.sample(it.pos.x, Math.min(it.pos.y, 2.6), it.pos.z, it.n[0], it.n[1], it.n[2], null);
    bake[i * 2] = b[0]; bake[i * 2 + 1] = b[1];
  });
  geo.setAttribute('uvRect', new THREE.InstancedBufferAttribute(rect, 4));
  geo.setAttribute('bake', new THREE.InstancedBufferAttribute(bake, 2));
  im.renderOrder = 1;
  im.name = 'story';
  im.computeBoundingSphere();
  return im;
}
