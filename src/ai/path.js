import { DIRS } from '../level/map.js';

// BFS shortest path on the cell grid (maps are small: < 500 cells).
export function findPath(map, sx, sz, tx, tz, mode = 'entity') {
  if (!map.inside(sx, sz) || !map.inside(tx, tz)) return null;
  const W = map.W, start = sx + sz * W, goal = tx + tz * W;
  if (start === goal) return [[tx, tz]];
  const prev = new Int32Array(W * map.H).fill(-1);
  prev[start] = start;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === goal) break;
    const x = c % W, z = (c / W) | 0;
    for (const d of DIRS) {
      if (!map.canStep(x, z, d, mode)) continue;
      const n = x + d.dx + (z + d.dz) * W;
      if (prev[n] !== -1) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push([c % W, (c / W) | 0]);
  path.reverse();
  return path;
}

export function randomReachableCell(map, rng, fromX, fromZ, minD, maxD, preferHall = true) {
  const dist = map.bfs(fromX, fromZ);
  const cand = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < minD || dist[i] > maxD) continue;
    const x = i % map.W, z = (i / map.W) | 0;
    const r = map.region[i];
    const w = preferHall && r === 0 ? 3 : 1;
    for (let k = 0; k < w; k++) cand.push([x, z]);
  }
  if (!cand.length) return null;
  return cand[Math.floor(rng() * cand.length)];
}
