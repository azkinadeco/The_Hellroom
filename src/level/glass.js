// Pecahan kaca: patches of broken glass in the halls. Walking or running over
// one crunches loud enough for a resident to come and look; crouching across
// (or going round) is silent. Placement is seeded, so a level always has the
// same patches.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { bakeMaterial } from '../render/bake.js';

const SRC = new THREE.MeshLambertMaterial({ color: 0xc4dcd6, side: THREE.DoubleSide });

export function addGlass(floor, def, start, isStartFloor) {
  const { gen, built } = floor, m = gen.map;
  let st = (def.seed * 31 + floor.k * 977 + 5) % 233280;
  const rnd = () => { st = (st * 9301 + 49297) % 233280; return st / 233280; };
  const [sx, sz] = m.cellOf(start.x, start.z);
  const keep = [gen.exit && gen.exit.cell, gen.fusebox && gen.fusebox.cell].filter(Boolean);
  const cells = [];
  for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
    if (m.reg(x, z) !== 0 || (gen.noFloor && gen.noFloor[x + z * m.W])) continue;
    if (isStartFloor && Math.max(Math.abs(x - sx), Math.abs(z - sz)) < 4) continue;
    if (keep.some((c) => Math.max(Math.abs(x - c[0]), Math.abs(z - c[1])) < 2)) continue;
    cells.push([x, z]);
  }
  const want = Math.min(cells.length, def.glass ?? Math.max(1, Math.min(5, Math.round(cells.length / 45))));
  const patches = [];
  for (let n = 0, guard = 0; n < want && guard < 200; guard++) {
    const [cx, cz] = cells[Math.floor(rnd() * cells.length)];
    const x = (cx + 0.5) * CELL + (rnd() - 0.5) * 1.1, z = (cz + 0.5) * CELL + (rnd() - 0.5) * 1.1;
    if (patches.some((p) => Math.hypot(p.x - x, p.z - z) < 9)) continue;
    patches.push({ x, z, r: 0.85 }); n++;
  }
  if (!patches.length) return patches;
  const pos = [], nor = [], bake = [];
  for (const P of patches) {
    const b = built.field.sample(P.x, 0, P.z, 0, 1, 0, null);
    for (let i = 0; i < 22; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * P.r, s = 0.035 + rnd() * 0.09, rot = rnd() * Math.PI * 2;
      const x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d, y = 0.012 + rnd() * 0.006;
      for (let k = 0; k < 3; k++) {
        const t = rot + k * 2.1 + rnd() * 0.7, q = s * (0.5 + rnd() * 0.7);
        pos.push(x + Math.cos(t) * q, y + (k === 0 ? rnd() * 0.02 : 0), z + Math.sin(t) * q);
        nor.push(0, 1, 0); bake.push(Math.max(0.22, b[0] * 1.25), b[1]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('bake', new THREE.Float32BufferAttribute(bake, 2));
  const mesh = new THREE.Mesh(g, bakeMaterial(SRC, 'attr'));
  mesh.name = 'Glass';
  built.root.add(mesh);
  return patches;
}
