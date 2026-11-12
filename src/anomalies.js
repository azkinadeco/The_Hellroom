// Map-specific anomalies that make the clean maps feel wrong.
//  - mall: some long, bare corridors loop. Walking down them you get quietly
//    sent back a few metres, a couple of times, before the hall lets you go.
//  - backroom: statues you are not looking at turn to face you.
import * as THREE from 'three';
import { CELL } from './config.js';

const MAX_LOOPS = 3;      // per corridor, then it lets you through
const TMP = new THREE.Vector3();

export class Anomalies {
  constructor(game) {
    this.game = game;
    this.loops = [];
    this.turnT = 3;
    this.turned = 0;
    const th = game.def.theme;
    if (th === 'mall' && !game.def.layout) this.findLoops();
  }

  // Spots in long straight halls where the next few cells look exactly like the
  // cells SHIFT behind (same side walls/doors/openings, lights, lockers): crossing
  // into such a cell quietly sends you back, and nothing on screen changes.
  findLoops() {
    const g = this.game, m = g.map;
    const lightAt = new Map();
    for (const l of g.gen.lights) { const [cx, cz] = m.cellOf(l.x, l.z); lightAt.set(cx + ',' + cz, l.state); }
    const busy = new Set(g.built.lockers.map((L) => m.cellOf(L.x, L.z).join(',')));
    // cells next to the exit or the fuse box never loop
    const special_ = new Set();
    for (const pt of [g.gen.exit, g.gen.fusebox]) if (pt) { const [ex, ez] = m.cellOf(pt.x, pt.z); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) special_.add((ex + dx) + ',' + (ez + dz)); }
    const N = { dx: 0, dz: -1 }, S = { dx: 0, dz: 1 }, E = { dx: 1, dz: 0 }, W = { dx: -1, dz: 0 };
    for (const axis of ['x', 'z']) {
      const outer = axis === 'x' ? m.H : m.W, inner = axis === 'x' ? m.W : m.H;
      const cellOf = (o, i) => (axis === 'x' ? [i, o] : [o, i]);
      const sig = (o, i) => {
        const [x, z] = cellOf(o, i);
        if (m.reg(x, z) !== 0) return '#';
        const [s1, s2] = axis === 'x' ? [N, S] : [E, W];
        const doorTag = (dd) => { const dr = m.doorAt(x, z, dd); return dr ? (dr.locked ? 'k' : 'd') : ''; };
        const special = special_.has(x + ',' + z) ? '!' : '';
        return (lightAt.get(x + ',' + z) || '-') + m.edge(x, z, s1) + m.edge(x, z, s2) + doorTag(s1) + doorTag(s2) + (busy.has(x + ',' + z) ? 'L' : '') + special;
      };
      for (let o = 0; o < outer; o++) {
        // contiguous hall segments along this line
        let a = -1;
        for (let i = 0; i <= inner; i++) {
          const hall = i < inner && m.reg(...cellOf(o, i)) === 0;
          if (hall && a < 0) a = i;
          if (!hall && a >= 0) {
            const b = i - 1, cands = [];
            if (b - a + 1 >= 10) {
              for (const k of [5, 10]) for (const d of [1, -1]) for (let t = a; t <= b; t++) {
                let ok = true;
                for (let j = -3; j <= 3 && ok; j++) {
                  const i1 = t + j, i2 = t - d * k + j;
                  if (i1 < a || i1 > b || i2 < a || i2 > b || sig(o, i1) !== sig(o, i2)) ok = false;
                }
                if (ok) cands.push({ axis, line: o, t, k, dir: d, count: 0 });
              }
            }
            if (cands.length) this.loops.push(cands[Math.floor(Math.random() * cands.length)]);
            a = -1;
          }
        }
      }
    }
  }

  update(dt) {
    const g = this.game, p = g.player;
    if (!p.alive || p.hidden) return;
    if (this.loops.length) this.updateLoops();
    if (g.built.figures && g.built.figures.length) this.updateFigures(dt);
  }

  updateLoops() {
    const g = this.game, p = g.player;
    const prev = this.prev || [p.pos.x, p.pos.z];
    this.prev = [p.pos.x, p.pos.z];
    for (const L of this.loops) {
      if (L.count >= MAX_LOOPS) continue;
      const along = L.axis === 'x' ? 0 : 1, across = 1 - along;
      const cur = [p.pos.x, p.pos.z];
      if (Math.floor(cur[across] / CELL) !== L.line) continue;
      const lineAt = (L.dir > 0 ? L.t : L.t + 1) * CELL;
      const crossed = L.dir > 0 ? prev[along] < lineAt && cur[along] >= lineAt : prev[along] > lineAt && cur[along] <= lineAt;
      if (!crossed) continue;
      const shift = -L.dir * L.k * CELL;
      if (along === 0) p.pos.x += shift; else p.pos.z += shift;
      this.prev = [p.pos.x, p.pos.z];
      L.count++;
      if (L.count === 2) g.hud.caption('…lorong ini terasa familiar.', 3);
      if (L.count === MAX_LOOPS) g.audio.whisper({ x: p.pos.x, y: 1.5, z: p.pos.z }, 0.35);
      break;
    }
  }

  updateFigures(dt) {
    const g = this.game, p = g.player, cam = g.camera;
    this.turnT -= dt;
    if (this.turnT > 0) return;
    this.turnT = 0.6 + Math.random() * 1.4;
    const figs = g.built.figures;
    for (let tries = 0; tries < 6; tries++) {
      const f = figs[Math.floor(Math.random() * figs.length)];
      const d = Math.hypot(f.x - p.pos.x, f.z - p.pos.z);
      if (d < 4 || d > 22) continue;
      TMP.set(f.x, 1.2, f.z).project(cam);
      const onScreen = TMP.z < 1 && Math.abs(TMP.x) < 1.15 && Math.abs(TMP.y) < 1.15;
      if (onScreen && g.world.los(cam.position.x, cam.position.z, f.x, f.z)) continue;
      const want = Math.atan2(p.pos.x - f.x, p.pos.z - f.z);
      let dr = want - f.rot; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2;
      if (Math.abs(dr) < 0.3) continue;
      f.set(want);
      this.turned++;
      if (d < 12 && Math.random() < 0.5) g.audio.scrape({ x: f.x, y: 0.5, z: f.z }, 0.35, 0.06);
      break;
    }
  }
}
