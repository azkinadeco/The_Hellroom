// The six story-level residents (one per level) plus the factory for every
// entity type. Hunters reuse the configurable Monitor brain; the Shade and the
// wall Eyes have their own rules.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { DIRS, EDGE } from '../level/map.js';
import { Entity, Monitor, Substitute, Pupil, Principal } from './entities.js';
import { findPath } from './path.js';

// Names, death screens and first-encounter tips for every resident.
export const ENTITY_INFO = {
  pale: {
    lore: 'Dulu ia murid yang paling pendiam di kelas. Kini matanya sudah tidak ada, dan wajahnya terbelah dari dahi sampai dagu. Ia merangkak di lorong sambil mendengarkan dan menunggu langkah yang terlalu keras.',
    name: 'Si Pucat',
    death: 'Si Pucat menemukanmu. Ia tidak punya mata. Ia mendengar setiap langkahmu. Jongkok dan berjalanlah pelan, jangan berlari di dekatnya.',
    hint: 'Si Pucat buta, tapi telinganya sangat tajam. Jongkok untuk lewat, dan lempar penghapus untuk mengalihkannya.',
  },
  masked: {
    lore: 'Guru piket sekolah ini. Tidak ada yang tahu wajah di balik topeng putihnya. Ia berpatroli dengan penggaris besi di tangan, dan ketukannya ke telapak tangan terdengar sampai ke ujung lorong.',
    name: 'Guru Bertopeng',
    death: 'Guru Bertopeng memergokimu. Kalau terdengar bunyi penggaris diketuk, ia sedang berjaga. Jauhi pandangannya dan bersembunyilah sebelum terlihat.',
    hint: 'Bunyi penggaris diketuk berarti Guru Bertopeng sedang berjaga di dekatmu. Ia bisa melihat dan mendengar.',
  },
  gaper: {
    lore: 'Spesimen nomor tiga dari lab biologi. Rahangnya terus melebar sejak toplesnya pecah. Ia membeku seperti patung selama ada yang menatapnya, tapi tidak pernah benar-benar diam.',
    name: 'Si Penganga',
    death: 'Kamu berpaling dari Si Penganga. Selama kamu menatapnya ia membeku, tapi dalam gelap tatapanmu tidak ada artinya.',
    hint: 'Si Penganga hanya bergerak saat tidak kamu lihat. Jaga pandanganmu padanya, dan jangan biarkan ia masuk ke kegelapan.',
  },
  shade: {
    lore: 'Sesuatu yang tinggal di mal tanpa ujung, di bagian yang lampunya sudah padam. Tidak ada yang tahu berapa banyak mata yang dimilikinya. Cahaya menyakitinya, dan kegelapan adalah rumahnya.',
    name: 'Bayang Kelas',
    death: 'Bayang Kelas menelanmu dalam gelap. Ia tidak bisa masuk ke ruang yang terang, dan cahaya senter membuatnya mundur.',
    hint: 'Bayang Kelas hanya hidup di kegelapan. Tetaplah di bawah lampu, dan sorotkan senter ke arahnya.',
  },
  eyes: {
    lore: 'Akar-akarnya merambat di dinding ruang patung dan papan tulis sekolah. Setiap mata yang menangis hitam itu dulu milik seseorang. Ia tidak bisa berjalan, tapi selalu tahu harus pindah ke dinding yang mana.',
    name: 'Mata Papan',
    death: 'Mata Papan menatapmu terlalu lama dari dinding. Begitu kamu merasa diperhatikan, putuskan pandangannya: keluar dari jangkauan matanya atau sembunyi.',
    hint: 'Ada mata yang tumbuh di dinding. Jangan berdiri dalam pandangannya. Suara keras membuatnya pindah ke dinding terdekat.',
  },
  centipede: {
    lore: 'Murid-murid yang tidak pernah pulang dari pelajaran renang. Mereka sekarang merayap bersama sebagai satu tubuh di kolam putih yang tak berujung, dan semua wajahnya masih menjerit.',
    name: 'Kelabang',
    death: 'Kelabang menangkapmu. Wajah-wajahnya melihat ke segala arah. Kamu tidak bisa menyelinap di belakangnya, jadi putuskan garis pandangnya dengan pintu dan dinding.',
    hint: 'Kelabang melihat ke segala arah, tapi jarak pandangnya pendek. Gunakan dinding dan loker untuk memutus pandangannya.',
  },
  monitor: {
    lore: 'Petugas ketertiban yang tinggi kurus dan tanpa mata. Peluitnya menandakan kamu sudah ketahuan.', name: 'Petugas Ketertiban', death: 'Petugas Ketertiban menemukanmu. Ia mendengar dan melihat. Berjalanlah, jangan berlari, dan tahan napas di loker.' },
  substitute: {
    lore: 'Guru pengganti dari kapur dan kayu. Ia hanya bergerak saat tidak ada yang melihatnya.', name: 'Guru Pengganti', death: 'Kamu berpaling dari Guru Pengganti. Jaga pandanganmu padanya, dan jangan biarkan ia berada dalam gelap.' },
  principal: {
    lore: 'Kepala sekolah dengan corong pengeras suara sebagai kepala. Setiap kali melihatmu, seluruh sekolah ikut mendengarnya.', name: 'Kepala Sekolah', death: 'Kepala Sekolah menangkapmu. Ia lambat, tapi setiap kali melihatmu, seluruh sekolah tahu di mana kamu.' },
  pupil: {
    lore: 'Anak berjas hujan kuning dengan kantong kertas di kepala. Ia tidak menyerang, tapi jeritannya memanggil penghuni lain.', name: 'Si Murid', death: 'Sesuatu menemukanmu.' },
};

// ------------------------------------------------------------ Si Pucat ----
// Blind. Feels you at arm's length, otherwise hunts purely by sound.
class Pale extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'pale', { walk: 1.3, run: 4.6, stepEvery: 0.7, stepVol: [0.12, 0.25], radius: 0.4 });
  }
  chaseSound() { this.game.audio.hiss(this.pos); }
  sense() {
    const p = this.game.player;
    if (p.hidden || !p.alive) return 0;
    const d = this.distTo(p.pos);
    if (d > 4.5 || !this.game.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) return 0;
    if (d < 2.0) return 1;
    return p.moving > 0.2 && !p.crouched ? 0.6 : 0;
  }
  onNoise(x, z, strength, type) {
    if (this.state === 'attack' || this.state === 'locker') return;
    if (strength > 0.25 || type === 'alert' || type === 'throw') {
      // heard, not seen: chase the sound but never 'know' which locker you are in
      this.lastSeen = { x, z, t: -99 };
      this.suspicion = 1.1; this.lostT = 0;
      this.path = null; this.goToWorld(x, z);
      if (this.state !== 'chase') this.setState('chase');
      return;
    }
    super.onNoise(x, z, strength, type);
  }
}

// ------------------------------------------------------- Guru Bertopeng ----
class Masked extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'masked', { walk: 1.45, run: 4.2, stepEvery: 1.0, stepVol: [0.3, 0.5] });
    this.tapCd = 1.5 + Math.random() * 2;
    this.walkTapT = 6 + Math.random() * 6;
    this.busyAnim = 0;
  }
  chaseSound() {
    const a = this.game.audio;
    a.rulerTap(this.pos, 1); this.game.schedule(0.18, () => a.rulerTap(this.pos, 1)); this.game.schedule(0.36, () => a.rulerTap(this.pos, 1));
  }
  onIdle(dt) {
    this.tapCd -= dt;
    if (this.tapCd > 0 || this.busyAnim) return;
    this.tapCd = 8 + Math.random() * 8;
    this.busyAnim = 1.2;
    this.play('Tap', 0.2, true);
    const g = this.game;
    g.schedule(0.42, () => g.audio.rulerTap(this.pos, 0.6));
    g.schedule(0.75, () => g.audio.rulerTap(this.pos, 0.6));
  }
  update(dt) {
    if (this.busyAnim) {
      this.busyAnim = Math.max(0, this.busyAnim - dt);
      if (this.state !== 'patrol') this.busyAnim = 0;
    }
    // taps the ruler while walking too, so the player can hear it coming
    this.walkTapT -= dt;
    if (this.walkTapT <= 0 && (this.velocity || 0) > 0.2 && this.state !== 'chase' && this.state !== 'attack') {
      this.walkTapT = 9 + Math.random() * 7;
      const g = this.game;
      g.audio.rulerTap(this.pos, 0.55); g.schedule(0.35, () => g.audio.rulerTap(this.pos, 0.55));
    }
    super.update(dt);
  }
}

// ------------------------------------------------------------- Kelabang ----
class Centipede extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'centipede', { walk: 1.15, run: 3.8, sight: [12, 360, 17, 360], stepEvery: 0.45, stepVol: [0.1, 0.2], radius: 0.6 });
  }
  chaseSound() { this.game.audio.chorus(this.pos); }
}

// ----------------------------------------------------------- Si Penganga ----
class Gaper extends Substitute {
  constructor(game, cell) { super(game, cell, 'gaper'); this.speed = 4.6; this.radius = 0.35; }
  moveSound() { this.game.audio.bones(this.pos); }
}

// ---------------------------------------------------------- Bayang Kelas ----
// Lives only in dark cells. Light pushes it back; a blackout sets it free.
class Shade extends Entity {
  constructor(game, cell) {
    super(game, 'shade', cell);
    this.radius = 0.4;
    this.walk = 1.0; this.stalkSpeed = 3.3;
    this.state = 'lurk';
    this.burn = 0; this.calmT = 0; this.whisperT = 2; this.lostT = 0;
    this.target = null;
    this.play('Idle');
    // never start under a working light
    if (!this.darkCell(...this.cell())) {
      const [cx, cz] = this.cell();
      const dist = game.map.bfs(cx, cz);
      let best = -1, bd = Infinity;
      for (let i = 0; i < dist.length; i++) if (dist[i] >= 0 && dist[i] < bd && !game.map.lit[i] && game.map.region[i] >= 0) { bd = dist[i]; best = i; }
      if (best >= 0) { const [x, z] = game.map.center(best % game.map.W, (best / game.map.W) | 0); this.pos.set(x, 0, z); }
    }
  }
  // dark cells reachable without crossing light, [minD, maxD] steps away
  darkReach(minD, maxD) {
    const m = this.game.map, W = m.W, [sx, sz] = this.cell();
    const dist = new Int16Array(W * m.H).fill(-1), q = [sx + sz * W], out = [];
    dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], x = c % W, z = (c / W) | 0;
      if (dist[c] >= minD) out.push([x, z]);
      if (dist[c] >= maxD) continue;
      for (const d of DIRS) {
        if (!m.canStep(x, z, d, 'entity')) continue;
        const n = x + d.dx + (z + d.dz) * W;
        if (dist[n] !== -1 || !this.darkIdx(n)) continue;
        dist[n] = dist[c] + 1; q.push(n);
      }
    }
    return out;
  }
  darkIdx(i) { return this.game.world.blackout || !this.game.map.lit[i]; }
  darkCell(x, z) { return this.game.map.inside(x, z) && this.darkIdx(x + z * this.game.map.W); }
  darkAt(x, z) { return this.darkCell(...this.game.map.cellOf(x, z)); }
  pathTo(x, z) {
    const [sx, sz] = this.cell(), [tx, tz] = this.game.map.cellOf(x, z);
    this.path = findPath(this.game.map, sx, sz, tx, tz, 'entity', (n) => this.darkIdx(n));
    this.pathIdx = 0;
    this.finalPoint = this.darkCell(tx, tz) ? { x, z } : null;
    if (this.path && !this.darkCell(tx, tz)) this.path.pop();   // stop at the edge of the light
    return !!this.path;
  }
  // boxed in by light: fade out and seep back in from another dark corner, out of sight
  dissolve() {
    const g = this.game, m = g.map, p = g.player, cand = [];
    for (let i = 0; i < m.W * m.H; i++) {
      if (m.region[i] < 0 || !this.darkIdx(i)) continue;
      const [x, z] = m.center(i % m.W, (i / m.W) | 0);
      const d = Math.hypot(x - p.pos.x, z - p.pos.z);
      if (d > 14 && d < 40) cand.push([x, z]);
    }
    if (!cand.length) return;
    const [x, z] = cand[Math.floor(Math.random() * cand.length)];
    this.pos.set(x, 0, z); this.path = null;
  }
  onNoise(x, z) {
    if (this.state === 'flee' || this.state === 'attack' || this.calmT > 0) return;
    this.state = 'stalk'; this.target = { x, z }; this.pathTo(x, z);
  }
  litByFlashlight() {
    const g = this.game, p = g.player;
    if (!p.flashlight || p.light.intensity < 2 || p.hidden) return false;
    const cam = g.camera, d = this.distTo(p.pos);
    if (d > 14 || !g.world.los(cam.position.x, cam.position.z, this.pos.x, this.pos.z)) return false;
    const f = new THREE.Vector3(); cam.getWorldDirection(f);
    const to = new THREE.Vector3(this.pos.x - cam.position.x, 1.5 - cam.position.y, this.pos.z - cam.position.z).normalize();
    return f.dot(to) > Math.cos(0.42);
  }
  flee() {
    const g = this.game, p = g.player;
    this.state = 'flee'; this.stateT = 0;
    g.onChaseEnd(this);
    g.audio.whisper(this.pos, 0.7);
    if (!this.fledOnce) { this.fledOnce = true; g.hud.toast('Bayangan itu mundur dari cahaya senter.', 2.5); }
    const cand = [];
    for (const [cx, cz] of this.darkReach(2, 12)) {
      const [x, z] = g.map.center(cx, cz);
      if (Math.hypot(x - p.pos.x, z - p.pos.z) > this.distTo(p.pos) + 3) cand.push([x, z]);
    }
    const t = cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    if (!t || !this.pathTo(t[0], t[1])) { this.state = 'lurk'; this.calmT = 3; }
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt; this.calmT -= dt;
    const d = this.distTo(p.pos);
    const hereDark = this.darkAt(this.pos.x, this.pos.z);
    if (this.state !== 'attack') {
      if (this.litByFlashlight() || !hereDark) this.burn += dt * (hereDark ? 1 : 2.5); else this.burn = Math.max(0, this.burn - dt * 0.8);
      if (this.burn > 0.6 && this.state !== 'flee') { this.burn = 0; this.flee(); }
    }
    let speed = 0;
    if (this.state === 'lurk') {
      const senses = !p.hidden && p.alive && this.calmT <= 0 && d < 16 && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z) &&
        (d < 6 || !g.world.isLit(p.pos.x, p.pos.z) || p.flashlight);
      if (senses) { this.state = 'stalk'; this.stateT = 0; g.onChaseStart(this); g.audio.whisper(this.pos, 1); }
      else if (!this.path || this.pathIdx >= this.path.length) {
        this.velocity = 0;
        this.waitT -= dt;
        if (this.waitT <= 0) {
          this.waitT = 2 + Math.random() * 4;
          const c = this.darkReach(2, 10);
          const t = c.length ? c[Math.floor(Math.random() * c.length)] : null;
          if (t) this.pathTo(...g.map.center(t[0], t[1]));
          else if (!g.isSeenByPlayer(this)) this.dissolve();
        }
      } else { speed = this.walk * this.speedMul; this.followPath(dt, speed); }
    } else if (this.state === 'stalk') {
      speed = this.stalkSpeed * this.speedMul;
      const visible = !p.hidden && d < 18 && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
      if (visible) { this.target = { x: p.pos.x, z: p.pos.z }; this.lostT = 0; } else this.lostT += dt;
      if (visible && d < 3.2 && this.darkAt(p.pos.x, p.pos.z)) {
        this.moveToward(p.pos.x, p.pos.z, dt, speed, 0.1, true); this.path = null;
      } else {
        this.retargetT = (this.retargetT || 0) - dt;
        if (this.target && this.retargetT <= 0) { this.retargetT = 0.5; this.pathTo(this.target.x, this.target.z); }
        if (this.followPath(dt, speed) && !visible) this.lostT += dt;
      }
      if (!p.hidden && p.alive && d < 1.05 && this.darkAt(p.pos.x, p.pos.z)) {
        this.state = 'attack'; this.play('Attack', 0.1, true); g.killPlayer(this);
      }
      if (this.lostT > 5) { this.state = 'lurk'; this.calmT = 2; g.onChaseEnd(this); }
    } else if (this.state === 'flee') {
      speed = this.stalkSpeed * 1.2 * this.speedMul;
      if (this.followPath(dt, speed) || this.stateT > 6) { this.state = 'lurk'; this.calmT = 4; this.path = null; }
    } else if (this.state === 'attack') this.velocity = 0;

    if (this.state !== 'attack') this.play((this.velocity || 0) > 0.2 ? 'Move' : 'Idle', 0.4);
    // whispers that grow louder as it closes in
    this.whisperT -= dt;
    if (this.whisperT <= 0 && d < 16) { this.whisperT = 2.5 + Math.random() * 3; g.audio.whisper(this.pos, this.state === 'stalk' ? 0.8 : 0.35); }
    this.updateCommon(dt);
    if (this.burn > 0) { this.obj.position.x += (Math.random() - 0.5) * 0.08 * this.burn; this.obj.position.z += (Math.random() - 0.5) * 0.08 * this.burn; }
  }
}

// ------------------------------------------------------------ Mata Papan ----
// Grows out of chalkboards and walls. Standing in its sight fills a gaze
// meter; loud noises make it jump to the board nearest the sound.
class Eyes extends Entity {
  constructor(game, cell) {
    super(game, 'eyes', cell);
    this.anchors = this.findAnchors();
    this.gaze = 0;
    this.relocT = 20 + Math.random() * 10; this.noiseCd = 0;
    this.squelchT = 0; this.warned = false;
    this.state = 'watch';
    this.radius = 0.3;
    const p = game.player;
    const far = this.anchors.filter((a) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z) > 18);
    this.moveTo(far.length ? far[Math.floor(Math.random() * far.length)] : this.anchors[0]);
    this.play('Idle');
  }
  findAnchors() {
    const g = this.game, m = g.map, out = [];
    for (const pr of g.gen.props) {
      if (pr.type !== 'chalkboard') continue;
      out.push({ x: pr.x + Math.sin(pr.rot) * 0.1, z: pr.z + Math.cos(pr.rot) * 0.1, yaw: pr.rot, board: true });
    }
    // bare walls (every third cell so they do not cluster); rooms too when there are few boards
    const rooms = out.length < 6;
    for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
      const rg = m.reg(x, z);
      if (rg < 0 || (rg > 0 && !rooms) || (x + z) % 3) continue;
      for (const d of DIRS) {
        const e = m.edge(x, z, d);
        if (!(e === EDGE.WALL || (e === EDGE.NONE && m.reg(x + d.dx, z + d.dz) < 0))) continue;
        const [cx, cz] = m.center(x, z);
        out.push({ x: cx + d.dx * (CELL / 2 - 0.13), z: cz + d.dz * (CELL / 2 - 0.13), yaw: Math.atan2(-d.dx, -d.dz) });
        break;
      }
    }
    return out;
  }
  moveTo(a) {
    if (!a) return;
    this.anchor = a;
    this.pos.set(a.x, 0, a.z);
    this.yaw = a.yaw;
  }
  // LOS from a point just in front of the wall
  eyePoint() { return [this.pos.x + Math.sin(this.yaw) * 0.25, this.pos.z + Math.cos(this.yaw) * 0.25]; }
  relocate(nearX, nearZ) {
    const p = this.game.player;
    let best = null, bd = Infinity;
    for (const a of this.anchors) {
      if (a === this.anchor || Math.hypot(a.x - p.pos.x, a.z - p.pos.z) < 4.5) continue;
      const d = nearX === undefined ? Math.random() * 100 : Math.hypot(a.x - nearX, a.z - nearZ);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) return;
    this.next = best; this.state = 'sink'; this.stateT = 0;
    this.game.audio.squelch(this.pos, 0.5);
  }
  onNoise(x, z, strength) {
    if (this.state !== 'watch' || this.noiseCd > 0 || strength < 0.25) return;
    this.noiseCd = 7;
    this.relocate(x, z);
  }
  update(dt) {
    const g = this.game, p = g.player;
    this.stateT += dt; this.noiseCd -= dt; this.relocT -= dt;
    this.velocity = 0;
    if (this.state === 'sink') {
      this.obj.scale.setScalar(Math.max(0.01, 1 - this.stateT / 0.5));
      if (this.stateT > 0.5) { this.moveTo(this.next); this.state = 'emerge'; this.stateT = 0; g.audio.squelch(this.pos, 0.8); }
    } else if (this.state === 'emerge') {
      this.obj.scale.setScalar(Math.min(1, this.stateT / 0.7));
      if (this.stateT > 0.7) { this.state = 'watch'; this.obj.scale.setScalar(1); }
    } else if (this.state === 'watch') {
      const [ex, ez] = this.eyePoint();
      const save = [this.pos.x, this.pos.z];
      this.pos.x = ex; this.pos.z = ez;
      const see = this.sees(13, 170);
      this.pos.x = save[0]; this.pos.z = save[1];
      if (see > 0) {
        this.gaze = Math.min(1, this.gaze + dt * (0.12 + see * 0.17) * g.diff.sight);
        if (!this.warned) { this.warned = true; g.hud.toast('Kamu merasa ditatap… putuskan pandangannya!', 2.5); }
        if (this.gaze > 0.15) g.onChaseStart(this);
        this.squelchT -= dt;
        if (this.squelchT <= 0) { this.squelchT = 1.4 - this.gaze; g.audio.squelch(this.pos, 0.3 + this.gaze * 0.6); }
      } else {
        this.gaze = Math.max(0, this.gaze - dt * 0.3);
        if (this.gaze === 0) g.onChaseEnd(this);
      }
      this.play(this.gaze > 0.1 ? 'Stare' : 'Idle', 0.3);
      if (this.gaze >= 1 && p.alive) { this.state = 'attack'; this.play('Attack', 0.1, true); g.killPlayer(this); }
      else if (this.relocT <= 0 && this.gaze === 0 && !g.isSeenByPlayer(this)) { this.relocT = 22 + Math.random() * 18; this.relocate(); }
    }
    g.gazeFx = this.state === 'watch' ? this.gaze : 0;
    this.updateCommon(dt);
  }
}

export function spawnEntity(game, type, cell) {
  switch (type) {
    case 'pale': return new Pale(game, cell);
    case 'masked': return new Masked(game, cell);
    case 'gaper': return new Gaper(game, cell);
    case 'shade': return new Shade(game, cell);
    case 'eyes': return new Eyes(game, cell);
    case 'centipede': return new Centipede(game, cell);
    case 'principal': return new Principal(game, cell);
    case 'monitor': return new Monitor(game, cell);
    case 'substitute': return new Substitute(game, cell);
    default: return new Pupil(game, cell);
  }
}
