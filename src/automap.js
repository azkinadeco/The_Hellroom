// Denah: a floor plan the player "draws" while exploring. Only cells that
// were actually seen are on the paper; the panel, the exit, stairs and lifts
// appear once you have stood near them. It does not pause the game.
import { CELL } from './config.js';
import { DIRS, EDGE, VOID } from './level/map.js';

const SEE = 3;            // cells
const INK = '#2a261e', RED = '#8a1c1c', GREEN = '#1f6b3a';

export class AutoMap {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('automap');
    this.canvas = document.getElementById('automap-canvas');
    this.label = document.getElementById('automap-label');
    this.open = false;
    this.t = 0; this.dirty = true;
    this.reset();
  }
  reset() {
    const g = this.game;
    this.seen = (g.floors || []).map((f) => new Uint8Array(f.map.W * f.map.H));
    this.view = g.floorK || 0;
    this.count = 0;
    this.setOpen(false);
  }
  setOpen(v) {
    this.open = v;
    if (this.el) this.el.classList.toggle('show', v);
    if (v) { this.view = this.game.floorK; this.dirty = true; }
  }
  toggle() { this.setOpen(!this.open); }
  cycle() { this.view = (this.view + 1) % this.seen.length; this.dirty = true; }

  // serialisable state (checkpoints)
  dump() { return this.seen.map((s) => Array.from(s).join('')); }
  load(d) { if (d && d.length === this.seen.length) d.forEach((str, k) => { for (let i = 0; i < this.seen[k].length; i++) this.seen[k][i] = str.charCodeAt(i) === 49 ? 1 : 0; }); this.dirty = true; }

  update(dt) {
    const g = this.game, p = g.player;
    this.t -= dt;
    if (this.t <= 0 && g.map && this.seen[g.floorK]) {
      this.t = 0.25;
      const m = g.map, s = this.seen[g.floorK];
      const [cx, cz] = m.cellOf(p.pos.x, p.pos.z);
      for (let z = cz - SEE; z <= cz + SEE; z++) for (let x = cx - SEE; x <= cx + SEE; x++) {
        if (!m.inside(x, z) || s[x + z * m.W] || m.reg(x, z) === -1) continue;
        const [wx, wz] = m.center(x, z);
        if ((x === cx && z === cz) || m.los(p.pos.x, p.pos.z, wx, wz)) { s[x + z * m.W] = 1; this.count++; this.dirty = true; }
      }
      if (this.open && (this.lastX !== p.pos.x || this.lastZ !== p.pos.z || this.lastYaw !== p.yaw)) this.dirty = true;
    }
    if (this.open && this.dirty) this.draw();
  }

  draw() {
    this.dirty = false;
    const g = this.game, k = this.view, f = g.floors[k];
    if (!f) return;
    const p = g.player; this.lastX = p.pos.x; this.lastZ = p.pos.z; this.lastYaw = p.yaw;
    const m = f.map, s = this.seen[k], cv = this.canvas, c = cv.getContext('2d');
    const u = Math.max(6, Math.floor(Math.min(620 / m.W, 400 / m.H)));
    const pad = 10, w = m.W * u + pad * 2, h = m.H * u + pad * 2;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    c.fillStyle = '#e6dfc8'; c.fillRect(0, 0, w, h);
    c.translate(pad, pad);
    const at = (x, z) => m.inside(x, z) && s[x + z * m.W];
    const roomOf = new Map(f.gen.rooms.map((r) => [r.id, r]));
    // floors
    for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
      if (!at(x, z)) continue;
      const r = m.reg(x, z);
      if (r === VOID) { c.strokeStyle = 'rgba(42,38,30,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x * u, (z + 1) * u); c.lineTo((x + 1) * u, z * u); c.stroke(); continue; }
      const room = roomOf.get(r), type = room && room.type;
      c.fillStyle = r === 0 ? '#f6f1df' : type === 'stairs' ? '#cfc7a8' : type === 'lift' ? '#c9c2b0' : '#d9d0b4';
      c.fillRect(x * u, z * u, u, u);
      if (type === 'stairs') { c.strokeStyle = 'rgba(42,38,30,0.5)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x * u + (i * u) / 4, z * u + 1); c.lineTo(x * u + (i * u) / 4, (z + 1) * u - 1); c.stroke(); } }
    }
    // walls, doors, railings
    c.lineCap = 'round';
    const seg = (x0, z0, x1, z1, e, door) => {
      if (e === EDGE.OPEN || e === EDGE.NONE) return;
      c.beginPath();
      if (e === EDGE.DOOR) {
        const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, gx = (x1 - x0) * 0.22, gz = (z1 - z0) * 0.22;
        c.strokeStyle = INK; c.lineWidth = 2; c.setLineDash([]);
        c.moveTo(x0, z0); c.lineTo(mx - gx, mz - gz); c.moveTo(mx + gx, mz + gz); c.lineTo(x1, z1); c.stroke();
        if (door && door.locked) { c.beginPath(); c.strokeStyle = RED; c.lineWidth = 3; c.moveTo(mx - gx, mz - gz); c.lineTo(mx + gx, mz + gz); c.stroke(); }
        return;
      }
      if (e === EDGE.RAIL || e === EDGE.GLASS) { c.strokeStyle = 'rgba(42,38,30,0.55)'; c.lineWidth = 1; c.setLineDash([2, 3]); }
      else { c.strokeStyle = INK; c.lineWidth = 2; c.setLineDash([]); }
      c.moveTo(x0, z0); c.lineTo(x1, z1); c.stroke();
    };
    for (let z = 0; z < m.H; z++) for (let x = 0; x <= m.W; x++) {
      if (!at(x - 1, z) && !at(x, z)) continue;
      seg(x * u, z * u, x * u, (z + 1) * u, m.getE('v', x, z), m.doors.get(m.key('v', x, z)));
    }
    for (let z = 0; z <= m.H; z++) for (let x = 0; x < m.W; x++) {
      if (!at(x, z - 1) && !at(x, z)) continue;
      seg(x * u, z * u, (x + 1) * u, z * u, m.getE('h', x, z), m.doors.get(m.key('h', x, z)));
    }
    c.setLineDash([]);
    // marks
    const mark = (wx, wz, txt, col) => {
      c.font = `bold ${Math.max(10, u)}px monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = col; c.fillText(txt, (wx / CELL) * u, (wz / CELL) * u);
    };
    for (const st of g.stairs || []) {
      if (st.k === k && at(...st.cells[0])) mark((st.cells[0][0] + 0.5) * CELL, (st.cells[0][1] + 0.5) * CELL, '▲', INK);
      if (st.k + 1 === k && at(...st.cells[st.len - 1])) mark((st.cells[st.len - 1][0] + 0.5) * CELL, (st.cells[st.len - 1][1] + 0.5) * CELL, '▼', INK);
    }
    for (const r of f.gen.rooms) if (r.type === 'lift' && at(r.x0, r.z0)) mark((r.x0 + 0.5) * CELL, (r.z0 + 0.5) * CELL, 'L', INK);
    for (const S of g.slides || []) if (S.from === k && at(...m.cellOf(S.entry.x, S.entry.z))) mark(S.entry.x, S.entry.z, '≋', '#2a5d78');
    const fb = f.gen.fusebox, ex = f.gen.exit;
    if (fb && at(...fb.cell)) mark((fb.cell[0] + 0.5) * CELL, (fb.cell[1] + 0.5) * CELL, '⚡', g.powered ? GREEN : RED);
    if (ex && at(...ex.cell)) mark((ex.cell[0] + 0.5) * CELL, (ex.cell[1] + 0.5) * CELL, '✚', g.powered ? GREEN : RED);
    // room names
    c.font = `${Math.max(8, Math.floor(u * 0.75))}px monospace`; c.fillStyle = 'rgba(42,38,30,0.75)';
    for (const r of f.gen.rooms) {
      if (!r.sign || typeof r.sign !== 'string' || r.x1 - r.x0 < 1) continue;
      const mx = Math.floor((r.x0 + r.x1) / 2), mz = Math.floor((r.z0 + r.z1) / 2);
      if (!at(mx, mz)) continue;
      const maxW = (r.x1 - r.x0 + 1) * u - 4;
      let t = r.sign; while (t.length > 3 && c.measureText(t).width > maxW) t = t.slice(0, -1);
      c.fillText(t, ((r.x0 + r.x1 + 1) / 2) * u, ((r.z0 + r.z1 + 1) / 2) * u);
    }
    // you
    if (k === g.floorK) {
      const px = (p.pos.x / CELL) * u, pz = (p.pos.z / CELL) * u, a = p.yaw;
      const fx = -Math.sin(a), fz = -Math.cos(a), r = Math.max(5, u * 0.7);
      c.fillStyle = RED; c.beginPath();
      c.moveTo(px + fx * r, pz + fz * r); c.lineTo(px - fx * r * 0.6 - fz * r * 0.6, pz - fz * r * 0.6 + fx * r * 0.6); c.lineTo(px - fx * r * 0.6 + fz * r * 0.6, pz - fz * r * 0.6 - fx * r * 0.6);
      c.closePath(); c.fill();
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    const n = this.seen.length, touch = g.input.touch;
    this.label.textContent = `DENAH — ${g.def.name} · Lantai ${k + 1}/${n}${k === g.floorK ? '' : ' (bukan lantaimu)'}`
      + (n > 1 ? (touch ? '  ·  ketuk denah: ganti lantai' : '  ·  R: ganti lantai') : '') + '\n⚡ panel  ✚ pintu darurat  ▲▼ tangga  L lift  ━ merah: terkunci';
  }
}
