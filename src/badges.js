// Lencana (achievements) and the per-run grade on the win screen.
// ctx: { g: game, save, win: bool, story: bool }
import { LEVELS, RESIDENTS } from './config.js';
import { FILM_NEED } from './story.js';

const filmed = (save) => RESIDENTS.filter((k) => (save.film[k] || 0) >= FILM_NEED).length;

export const BADGES = [
  { id: 'lulus', icon: '🎓', name: 'Lulus Kelas Tambahan', desc: 'Selesaikan LEVEL 0.', test: (c) => c.win && c.story && c.g.def.id === 1 },
  { id: 'ending', icon: '🚪', name: 'Rekaman Terakhir', desc: 'Selesaikan LEVEL 5 dan lihat ending.', test: (c) => c.win && c.story && c.g.def.id === LEVELS.length },
  { id: 'hantu', icon: '👻', name: 'Tidak Pernah Ada', desc: 'Selesaikan satu level tanpa pernah terlihat penghuni.', test: (c) => c.win && c.story && c.g.stats.spotted === 0 },
  { id: 'kilat', icon: '⏱', name: 'Bel Pulang', desc: 'Selesaikan satu level di bawah waktu par.', test: (c) => c.win && c.story && c.g.time < parOf(c.g.def) },
  { id: 'hemat', icon: '🔋', name: 'Hemat Baterai', desc: 'Selesaikan satu level dengan baterai kamera 60% atau lebih.', test: (c) => c.win && c.story && c.g.player.battery >= 60 },
  { id: 'pustaka', icon: '📄', name: 'Murid Teladan', desc: 'Baca semua catatan di satu level sebelum keluar.', test: (c) => c.win && c.story && c.g.stats.notes >= c.g.def.notes },
  { id: 'lolos', icon: '🏃', name: 'Tiga Kali Lolos', desc: 'Lolos dari tiga kejaran dalam satu level, lalu keluar hidup-hidup.', test: (c) => c.win && (c.g.stats.escapes || 0) >= 3 },
  { id: 'napas', icon: '🫁', name: 'Tahan Napas', desc: 'Selamat saat penghuni memeriksa tempat persembunyianmu.', test: (c) => (c.g.stats.inspected || 0) > 0 },
  { id: 'umpan', icon: '🧽', name: 'Pengalih Perhatian', desc: 'Pancing penghuni dengan lemparan.', test: (c) => (c.g.stats.lures || 0) > 0 },
  { id: 'saksi', icon: '🕴', name: 'Ada yang Berdiri di Sana', desc: 'Tatap sosok di ujung lorong sampai ia menghilang.', test: (c) => (c.g.stats.ghosts || 0) > 0 },
  { id: 'sulit', icon: '💀', name: 'Jam Pelajaran Tambahan', desc: 'Selesaikan satu level pada kesulitan Sulit.', test: (c) => c.win && c.story && c.g.diffKey === 'sulit' },
  { id: 'peringkatS', icon: '🅢', name: 'Nilai Sempurna', desc: 'Raih peringkat S di satu level.', test: (c) => c.win && c.story && c.rank === 'S' },
  { id: 'kaset', icon: '📼', name: 'Kolektor Kaset', desc: 'Temukan keenam kaset rahasia.', test: (c) => c.save.tapes.length >= LEVELS.length },
  { id: 'film5', icon: '🎥', name: 'Juru Kamera', desc: 'Rekam bukti lima penghuni.', test: (c) => filmed(c.save) >= 5 },
  { id: 'film10', icon: '🎬', name: 'Dokumenter Lengkap', desc: 'Rekam bukti semua penghuni.', test: (c) => filmed(c.save) >= RESIDENTS.length },
  { id: 'dalam5', icon: '⬇', name: 'Lima Lantai ke Bawah', desc: 'Lewati lantai -5 di Mode Tanpa Ujung.', test: (c) => c.save.bestFloor >= 5 },
  { id: 'dalam10', icon: '⏬', name: 'Tidak Ada Dasar', desc: 'Lewati lantai -10 di Mode Tanpa Ujung.', test: (c) => c.save.bestFloor >= 10 },
];

// par time in seconds: bigger buildings and more fuses take longer
export function parOf(def) { return def.par || Math.round((150 + def.fuses * 75 + (def.floors || 1) * 45) / 15) * 15; }

// S / A / B / C for a finished story level
export function gradeRun(g) {
  const over = Math.max(0, g.time - parOf(g.def)) / 60;
  let score = 100 - Math.min(40, over * 5) - Math.min(40, g.stats.spotted * 8);
  score += Math.min(g.stats.notes, g.def.notes) * 2 + (g.stats.tape ? 5 : 0) + (g.stats.films || 0) * 4 - (g.stats.notes < g.def.notes ? 6 : 0) - (g.stats.tape ? 0 : 5);
  score -= (g.stats.retries || 0) * 10;   // continued from the panel
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, rank: score >= 92 ? 'S' : score >= 76 ? 'A' : score >= 55 ? 'B' : 'C' };
}

// returns the badges newly earned by this context and records them in save.badges
export function awardBadges(ctx) {
  const got = [];
  for (const b of BADGES) {
    if (ctx.save.badges.includes(b.id)) continue;
    let ok = false; try { ok = !!b.test(ctx); } catch (_) { ok = false; }
    if (ok) { ctx.save.badges.push(b.id); got.push(b); }
  }
  return got;
}
