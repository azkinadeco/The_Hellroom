// The six story-level residents (one per level) plus the factory for every
// entity type. Hunters reuse the configurable Monitor brain; the Shade and the
// wall Eyes have their own rules.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { DIRS, EDGE } from '../level/map.js';
import { Entity, Monitor, Substitute } from './entities.js';
import { findPath, randomReachableCell } from './path.js';

// Names, death screens and first-encounter tips for every resident.
export const ENTITY_INFO = {
  pale: {
    lore: 'Dulu ia murid yang paling pendiam di kelas. Kini matanya sudah tidak ada, dan wajahnya terbelah dari dahi sampai dagu. Ia merangkak di lorong sambil mendengarkan dan menunggu langkah yang terlalu keras.',
    name: 'Si Pucat',
    death: 'Si Pucat menemukanmu. Ia tidak punya mata. Ia mendengar setiap langkahmu. Jongkok dan berjalanlah pelan, jangan berlari di dekatnya.',
    hint: 'Si Pucat buta, tapi telinganya sangat tajam. Jongkok untuk lewat, dan lempar penghapus untuk mengalihkannya.',
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
  spider: {
    lore: 'Tubuh laba-laba sebesar lemari, berjalan dengan empat kaki manusia yang lututnya menekuk ke atas. Di bawah perutnya tergantung seorang perempuan, terbalik, mulutnya selalu terbuka. Jeritannya terdengar sebelum langkahnya.',
    name: 'Laba-Laba Kaki',
    death: 'Laba-Laba Kaki menangkapmu. Ia sangat cepat begitu melihatmu. Jangan biarkan ia punya garis pandang: putus dengan dinding dan pintu, lalu sembunyi.',
    hint: 'Laba-Laba Kaki lebih cepat darimu saat berlari. Begitu ia melihatmu, ia mengejar sampai pandangannya terputus. Belok, tutup pintu, sembunyi di loker.',
  },
  clock: {
    lore: 'Jam kakek tua dari ruang kepala sekolah yang suatu malam berdiri di atas dua kaki. Detaknya terdengar dari ujung lorong. Di dalam pintunya, di samping bandul, menggantung sebuah lidah.',
    name: 'Jam Kakek',
    death: 'Jam Kakek menangkapmu. Dengarkan detaknya: makin keras, makin dekat. Saat lonceng berdentang, ia sudah melihatmu.',
    hint: 'Detak jam = Jam Kakek di dekatmu. Ia lambat berjalan tapi tidak pernah berhenti mengejar selama masih melihatmu.',
  },
  weaver: {
    lore: 'Seorang perempuan tanpa kulit yang dililit tulang punggungnya sendiri. Di sepanjang tulang itu tumbuh mata-mata biru dan tangan-tangan kecil. Ia menyeret tumpukan tulang di bawah tubuhnya ke mana pun ia pergi.',
    name: 'Penenun Tulang',
    death: 'Penenun Tulang menangkapmu. Mata di tulang punggungnya melihat ke segala arah, tapi tidak jauh. Jaga jarak dan putuskan pandangannya dengan dinding.',
    hint: 'Penenun Tulang melihat ke segala arah dalam jarak dekat. Ia lambat. Jangan biarkan ia mendekat tanpa kamu sadari: dengarkan bunyi basahnya.',
  },
  echo: {
    lore: 'Wajah-wajah yang retak dan saling tumpang tindih, semuanya menjerit tanpa suara. Lengan-lengannya panjang seperti tali daging dan berujung tangan manusia. Ia membeku setiap kali ditatap.\n\nDi Ruang Patung ia tidak berjalan di lorong. Ia masuk ke dalam patung dan menunggu di arah yang kamu tuju, berpindah hanya saat kamu tidak melihat. Kalau kamu berdiri terlalu dekat, patungnya berderak selama dua detik lalu pecah. Ia berdiri diam sejenak sebelum mengejar. Kalau kehilangan jejakmu ia menunggu, berjalan pergi perlahan, lalu hilang ke patung lain.',
    name: 'Gema Retak',
    death: 'Kamu berpaling dari Gema Retak. Selama kamu menatapnya ia membeku, tapi begitu kamu berkedip atau lampu padam, ia sudah di depanmu.',
    hint: 'Gema Retak hanya bergerak saat tidak kamu lihat. Mundurlah sambil terus menatapnya, dan nyalakan senter saat gelap.',
  },
  squid: {
    lore: 'Seorang perempuan berambut basah yang pinggangnya berubah menjadi tentakel gurita. Ia berbisik dari ujung lorong supaya kamu mendekat. Organ-organnya terlihat di balik kain yang robek.',
    name: 'Perempuan Gurita',
    death: 'Perempuan Gurita menangkapmu. Bisikannya memancingmu mendekat. Begitu ia melihatmu, larilah dan putuskan pandangannya.',
    hint: 'Kalau terdengar bisikan, Perempuan Gurita ada di dekat sana. Pendengarannya tajam: jalan pelan dan jongkok.',
  },
};

// ------------------------------------------------------------ Si Pucat ----
// Blind. Feels you at arm's length, otherwise hunts purely by sound.
class Pale extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'pale', { walk: 1.3, run: 4.6, stepEvery: 0.7, stepVol: [0.12, 0.25], radius: 0.4 });
    this.reach = 0.6;
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

// ------------------------------------------------------------- Kelabang ----
class Centipede extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'centipede', { walk: 1.15, run: 3.8, sight: [12, 360, 28, 360], stepEvery: 0.45, stepVol: [0.1, 0.2], radius: 0.6 });
    this.reach = 0.6;
  }
  chaseSound() { this.game.audio.chorus(this.pos); }
}

// -------------------------------------------------------- Laba-Laba Kaki ----
// Fast and far-sighted; the hanging woman screams when it starts a chase.
class Spider extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'spider', { walk: 1.7, run: 4.9, sight: [17, 140, 32, 360], stepEvery: 0.42, stepVol: [0.15, 0.3], radius: 0.7 });
    this.reach = 0.55;
    this.skitterT = 1;
  }
  chaseSound() { this.game.audio.scream(this.pos); }
  update(dt) {
    this.skitterT -= dt;
    if (this.skitterT <= 0 && (this.velocity || 0) > 0.3) { this.skitterT = this.state === 'chase' ? 0.35 : 0.9; if (this.distTo(this.game.player.pos) < 22) this.game.audio.bones(this.pos); }
    super.update(dt);
  }
}

// ------------------------------------------------------------ Jam Kakek ----
// Ticks all the time (faster when hunting), chimes when it sees you.
class Clock extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'clock', { walk: 1.25, run: 4.0, sight: [15, 110, 28, 360], stepEvery: 0.8, stepVol: [0.5, 0.8], radius: 0.55 });
    this.reach = 0.25;
    this.tickT = 1;
  }
  chaseSound() { const a = this.game.audio; a.chime(this.pos); this.game.schedule(0.9, () => a.chime(this.pos)); }
  update(dt) {
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = this.state === 'chase' ? 0.5 : 1.0; if (this.distTo(this.game.player.pos) < 26) this.game.audio.tick(this.pos, this.state === 'chase' ? 0.9 : 0.6); }
    super.update(dt);
  }
}

// ------------------------------------------------------- Penenun Tulang ----
// Eyes all along its spine: sees all round but not far; slow, wet.
class Weaver extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'weaver', { walk: 1.0, run: 3.7, sight: [11, 360, 26, 360], stepEvery: 0.9, stepVol: [0.1, 0.2], radius: 0.6 });
    this.reach = 0.35;
  }
  chaseSound() { this.game.audio.chorus(this.pos); }
  update(dt) {
    this.wetT = (this.wetT || 1) - dt;
    if (this.wetT <= 0 && (this.velocity || 0) > 0.2) { this.wetT = 1.1; if (this.distTo(this.game.player.pos) < 18) this.game.audio.squelch(this.pos, 0.45); }
    super.update(dt);
  }
}

// ----------------------------------------------------- Perempuan Gurita ----
// Whispers to lure you closer; keen ears.
class Squid extends Monitor {
  constructor(game, cell) {
    super(game, cell, 'squid', { walk: 1.35, run: 4.4, sight: [14, 120, 30, 360], stepEvery: 0.7, stepVol: [0.12, 0.25], radius: 0.6 });
    this.reach = 0.35;
    this.lureT = 4;
  }
  chaseSound() { this.game.audio.hiss(this.pos); }
  onNoise(x, z, strength, type) { super.onNoise(x, z, Math.min(1, strength * 1.5), type); }
  update(dt) {
    this.lureT -= dt;
    if (this.lureT <= 0) { this.lureT = 5 + Math.random() * 5; const d = this.distTo(this.game.player.pos); if (d < 24 && this.state !== 'chase') this.game.audio.whisper(this.pos, 0.6); }
    if ((this.velocity || 0) > 0.2) { this.wetT = (this.wetT || 1) - dt; if (this.wetT <= 0) { this.wetT = 0.9; this.game.audio.squelch(this.pos, 0.3); } }
    super.update(dt);
  }
}

// ------------------------------------------------------------ Gema Retak ----
// Freezes while watched (the old substitute rules), comes for you unseen.
class Echo extends Substitute {
  constructor(game, cell) { super(game, cell, 'echo'); this.speed = 4.7; this.radius = 0.5; }
  moveSound() { this.game.audio.whisper(this.pos, 0.35); }
}

// ------------------------------------------- Gema Retak among statues ----
// Where a floor is full of statues it does not walk the halls at all: it sits
// inside one of the statues nearest to the player and keeps moving to another
// as the player moves. Come close and the statue is gone and it is standing
// there; it hunts like any hunter until the player is lost or hidden, then it
// vanishes into a statue again.
const hostable = (f) => f.s <= 1.3 && !f.hidden;
const SPOT = new THREE.Vector3();
// a walkable cell some way off, further from (px, pz) than from here
function randomFarCell(map, cx, cz, px, pz) {
  let best = null, bd = -1;
  for (let i = 0; i < 8; i++) {
    const c = randomReachableCell(map, Math.random, cx, cz, 5, 12);
    if (!c) continue;
    const d = Math.hypot(c[0] - px, c[1] - pz);
    if (d > bd) { bd = d; best = c; }
  }
  return best;
}
class StatueEcho extends Monitor {
  constructor(game, cell, emerged = false) {
    super(game, cell, 'echo', { walk: 1.6, run: 4.55, sight: [14, 150, 30, 360], stepEvery: 0.55, stepVol: [0.1, 0.22], radius: 0.45 });
    this.reach = 0.3;
    this.statue = true;
    this.baseWalk = this.walk;
    this.hintText = 'Gema Retak bersembunyi di dalam salah satu patung, biasanya di arah yang kamu tuju. Patungnya berbisik dan menghadapmu saat kamu tidak melihat. Kalau sebuah patung mulai bergetar dan berderak, mundur: butuh sekitar dua detik sebelum ia pecah.';
    this.deathText = 'Gema Retak keluar dari patung di dekatmu. Patung yang bergetar dan berderak adalah peringatannya: menjauh sebelum ia pecah, dan ia akan tenang lagi. Kalau ia sudah keluar, ia diam sebentar sebelum mengejar. Pakai waktu itu untuk lari, putuskan pandangannya, lalu sembunyi.';
    this.form = 'free'; this.host = null; this.hostRot = 0; this.hopT = 0; this.armT = 0; this.tellT = 2; this.faceT = 0;
    this.wake = 0; this.crackT = 0; this.lastP = null;
    if (!emerged) this.enter(this.pickHost(this.pos.x, this.pos.z, 0), true);
  }
  chaseSound() { this.game.audio.chorus(this.pos); }
  figs() { return (this.game.built.figures || []).filter(hostable); }
  // is the spot on the player's screen with nothing in between?
  seenSpot(x, z) {
    const g = this.game, cam = g.camera;
    if (Math.hypot(x - cam.position.x, z - cam.position.z) > 24) return false;
    SPOT.set(x, 1.2, z).project(cam);
    if (!(SPOT.z < 1 && Math.abs(SPOT.x) < 1.05 && Math.abs(SPOT.y) < 1.05)) return false;
    return g.world.los(cam.position.x, cam.position.z, x, z);
  }
  // one of the three statues nearest to (x, z), not closer than `minD` to the player
  pickHost(x, z, minD = 6.3) {
    const p = this.game.player.pos;
    const c = this.figs().filter((f) => f === this.host || Math.hypot(f.x - p.x, f.z - p.z) >= minD)
      .map((f) => ({ f, d: Math.hypot(f.x - x, f.z - z) })).sort((a, b) => a.d - b.d).slice(0, 3);
    if (!c.length) return null;
    const others = c.filter((q) => q.f !== this.host);
    const pool = others.length && Math.random() < 0.8 ? others : c;
    return pool[Math.floor(Math.random() * pool.length)].f;
  }
  // where to wait next: a statue the player cannot see right now, a room or a
  // corner away, preferably in the direction they are heading
  pickAmbush() {
    const p = this.game.player, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bs = Infinity;
    for (const f of this.figs()) {
      if (f === this.host) continue;
      const dx = f.x - p.pos.x, dz = f.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 5.5 || d > 17 || this.seenSpot(f.x, f.z)) continue;
      const s = d - ((dx * fx + dz * fz) / d) * 4 + Math.random() * 5;
      if (s < bs) { bs = s; best = f; }
    }
    return best;
  }
  facePlayer(f) {
    const p = this.game.player.pos;
    this.hostRot = Math.atan2(p.x - f.x, p.z - f.z);
    f.set(this.hostRot);
  }
  setHost(f) {
    if (!f) return;
    if (this.host && this.host !== f && !this.host.hidden) this.host.set(this.hostRot);
    this.host = f; this.wake = 0;
    this.pos.set(f.x, 0, f.z);
    this.facePlayer(f);
  }
  // vanish into a statue
  enter(f, silent = false) {
    const g = this.game;
    this.walk = this.baseWalk;
    if (!f) { this.form = 'free'; return; }            // no statue on this floor: it stays a plain hunter
    if (this.emptied) { this.emptied.show(true); this.emptied = null; }
    this.form = 'statue'; this.state = 'patrol'; this.path = null; this.finalPoint = null; this.velocity = 0; this.suspicion = 0; this.waitT = 0;
    if (!silent) { g.audio.whisper(this.pos, 0.5); if (g.isSeenByPlayer(this) && !g.clear) { g.glitch = Math.max(g.glitch, 0.35); g.schedule(0.3, () => { g.glitch = 0; }); } }
    this.obj.visible = false;
    this.setHost(f);
    this.armT = silent ? 3 : 9; this.hopT = 3;
    g.onChaseEnd(this);
  }
  // the statue breaks; it stands there for a moment before it comes
  emerge() {
    const g = this.game, p = g.player, f = this.host;
    this.form = 'emerge'; this.emergeT = 1.4; this.wake = 0;
    this.sawAt = { x: p.pos.x, z: p.pos.z };
    if (f) { f.set(this.hostRot); f.show(false); this.emptied = f; this.pos.set(f.x, 0, f.z); }
    this.host = null;
    this.obj.visible = true;
    this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.play(this.actions.Pose2 ? 'Pose2' : 'Idle', 0.05, true);
    g.audio.crack(this.pos); g.audio.bones(this.pos); g.audio.stinger();
    if (!g.clear) { g.glitch = Math.max(g.glitch, 0.5); g.schedule(0.25, () => { g.glitch = 0; }); }
    g.input.rumble(250, 0.9);
    g.stats.emerged = (g.stats.emerged || 0) + 1;
  }
  // lost them: stand and look for a few seconds, then walk off slowly and fade into a statue once far enough
  startBack() {
    this.form = 'back'; this.backT = 0; this.lingerT = 3 + Math.random() * 1.5; this.retreating = false;
    this.path = null; this.finalPoint = null; this.waitT = 99;
    this.walk = this.baseWalk * 0.6;
  }
  retreatGoal() {
    const p = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const f of this.figs()) {
      if (Math.hypot(f.x - p.x, f.z - p.z) < 11) continue;
      const d = Math.hypot(f.x - this.pos.x, f.z - this.pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  onNoise(x, z, strength, type) {
    if (this.form === 'free' || this.form === 'back') { super.onNoise(x, z, strength, type); return; }
    if (this.form !== 'statue' || !this.host) return;
    const g = this.game, p = g.player, h = this.host;
    // a loud noise right in front of its statue cracks it faster; anything else just draws it to a statue over there
    if (strength > 0.35 && Math.hypot(x - h.x, z - h.z) < 6) {
      if (!p.hidden && this.armT <= 0 && Math.hypot(p.pos.x - h.x, p.pos.z - h.z) < 6 && g.world.los(h.x, h.z, p.pos.x, p.pos.z)) this.wake = Math.min(0.95, this.wake + 0.4);
      return;
    }
    if ((type === 'alert' || type === 'throw' || strength > 0.5) && this.wake <= 0) { const f = this.pickHost(x, z, 5); if (f) { this.setHost(f); this.hopT = 6; } }
  }
  update(dt) {
    const g = this.game, p = g.player;
    if (this.form === 'statue') {
      this.velocity = 0; this.armT -= dt; this.hopT -= dt; this.tellT -= dt; this.faceT -= dt;
      const h = this.host;
      if (!h || h.hidden) { this.enter(this.pickHost(p.pos.x, p.pos.z), true); return; }
      const d = Math.hypot(p.pos.x - h.x, p.pos.z - h.z);
      const moved = this.lastP ? Math.hypot(p.pos.x - this.lastP.x, p.pos.z - this.lastP.z) / Math.max(dt, 1e-3) : 0;
      this.lastP = { x: p.pos.x, z: p.pos.z };
      const reach = 3.7 * (0.75 + 0.25 * g.diff.sight) * (p.crouched ? 0.8 : 1);
      const los = d < reach * 1.7 && g.world.los(h.x, h.z, p.pos.x, p.pos.z);
      // cracking: two seconds of warning (less if you run past, more if you creep), and it settles if you back off
      if (p.alive && !p.hidden && this.armT <= 0 && d < reach && los) {
        if (this.wake <= 0) g.audio.scrape({ x: h.x, y: 1.2, z: h.z }, 0.35, 0.3);
        this.wake += dt / (moved > 4.2 ? 1.3 : p.crouched ? 3 : 2);
        if (this.wake >= 1) { this.emerge(); return; }
      } else if (this.wake > 0) {
        this.wake -= dt / (los ? 2.2 : 1);
        if (this.wake <= 0) { this.wake = 0; h.set(this.hostRot); this.armT = Math.max(this.armT, 2.5); this.hopT = Math.max(this.hopT, 2); }
      }
      if (this.wake > 0) {
        h.set(this.hostRot + Math.sin(g.time * 41) * 0.07 * this.wake);
        h.rot = this.hostRot;
        this.crackT -= dt;
        if (this.crackT <= 0) { this.crackT = 0.5 - 0.36 * this.wake; g.audio.scrape({ x: h.x, y: 1.2, z: h.z }, 0.12, 0.12 + 0.3 * this.wake); if (this.wake > 0.5) g.audio.crack({ x: h.x, y: 1.4, z: h.z }); }
        return;
      }
      const seen = this.seenSpot(h.x, h.z);
      // it only moves, and only turns, while you are not looking at it
      if (this.faceT <= 0 && !seen) { this.faceT = 0.4; this.facePlayer(h); }
      if (this.hopT <= 0) {
        this.hopT = 2 + Math.random() * 2.5;
        if (!seen && (d > 12 || Math.random() < 0.3)) { const f = this.pickAmbush(); if (f) { this.setHost(f); this.armT = Math.max(this.armT, 1.5); } }
      }
      if (this.tellT <= 0) { this.tellT = 3.5 + Math.random() * 3.5; if (d < 13) g.audio.whisper({ x: h.x, y: 1.4, z: h.z }, 0.3); }
      return;
    }
    if (this.form === 'emerge') {
      this.emergeT -= dt; this.velocity = 0;
      this.faceToward(p.pos.x, p.pos.z, dt, 5);
      this.updateCommon(dt);
      if (this.emergeT <= 0) {
        this.form = 'free'; this.state = 'patrol';
        const sees = !p.hidden && g.world.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        this.lastSeen = { x: sees ? p.pos.x : this.sawAt.x, z: sees ? p.pos.z : this.sawAt.z, t: sees ? g.time : g.time - 2 };
        this.suspicion = 1.2; this.lostT = 0; this.waitT = 0; this.path = null;
        this.setState('chase');
      }
      return;
    }
    if (this.form === 'back') {
      this.backT += dt;
      if (!this.retreating) {
        this.waitT = 99;
        if (this.backT >= this.lingerT) {
          this.retreating = true; this.waitT = 0;
          const f = this.retreatGoal();
          if (f) this.goToWorld(f.x, f.z);
          else { const [cx, cz] = this.cell(), [px, pz] = g.map.cellOf(p.pos.x, p.pos.z); const t = randomFarCell(g.map, cx, cz, px, pz); if (t) this.goTo(...t); }
        }
      }
      super.update(dt);
      if (this.state !== 'patrol') { this.form = 'free'; this.walk = this.baseWalk; return; }   // it noticed something
      if (this.retreating) {
        const since = this.backT - this.lingerT, d = this.distTo(p.pos);
        if ((d > 8.5 && since > 2) || this.waitT > 0 || since > 18) this.enter(this.pickHost(this.pos.x, this.pos.z));
      }
      return;
    }
    super.update(dt);
    if (this.state !== 'attack' && (this.velocity || 0) > this.walk * 1.7 && !this.actions.Run) { this.play('Walk'); if (this.current) this.current.timeScale = 1.9; }
    if (this.state === 'patrol' && p.alive) this.startBack();
  }
  remove() { if (this.emptied) this.emptied.show(true); if (this.host && !this.host.hidden) this.host.set(this.hostRot); super.remove(); }
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

export function spawnEntity(game, type, cell, opts = {}) {
  switch (type) {
    case 'pale': return new Pale(game, cell);
    case 'gaper': return new Gaper(game, cell);
    case 'shade': return new Shade(game, cell);
    case 'eyes': return new Eyes(game, cell);
    case 'centipede': return new Centipede(game, cell);
    case 'spider': return new Spider(game, cell);
    case 'clock': return new Clock(game, cell);
    case 'weaver': return new Weaver(game, cell);
    case 'echo': return (game.built.figures || []).filter(hostable).length >= 4 ? new StatueEcho(game, cell, !!opts.emerged) : new Echo(game, cell);
    case 'squid': return new Squid(game, cell);
    default: return new Spider(game, cell);
  }
}
