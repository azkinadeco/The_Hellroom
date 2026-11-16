// Lencana (achievements) and the per-run grade on the win screen.
// ctx: { g: game, save, win: bool, story: bool }
import { LEVELS, RESIDENTS } from './config.js';
import { FILM_NEED } from './story.js';

const filmed = (save) => RESIDENTS.filter((k) => (save.film[k] || 0) >= FILM_NEED).length;

export const BADGES = [
  { id: 'lulus', icon: '🎓', name: 'Lulus Kelas Tambahan', desc: 'Selesaikan BAB I.', test: (c) => c.win && c.story && c.g.def.id === 1 },
  { id: 'ending', icon: '🚪', name: 'Rekaman Terakhir', desc: 'Selesaikan BAB VI dan lihat ending.', test: (c) => c.win && c.story && c.g.def.id === LEVELS.length },
  { id: 'pulang', icon: '🌅', name: 'Pulang', desc: 'Temukan akhir yang sebenarnya.', test: (c) => !!c.save.trueEnding },
  { id: 'hantu', icon: '👻', name: 'Tidak Pernah Ada', desc: 'Selesaikan satu bab tanpa pernah terlihat penghuni.', test: (c) => c.win && c.story && c.g.stats.spotted === 0 },
  { id: 'kilat', icon: '⏱', name: 'Bel Pulang', desc: 'Selesaikan satu bab di bawah waktu par.', test: (c) => c.win && c.story && c.g.time < parOf(c.g.def) },
  { id: 'hemat', icon: '🔋', name: 'Hemat Baterai', desc: 'Selesaikan satu bab dengan baterai kamera 60% atau lebih.', test: (c) => c.win && c.story && c.g.player.battery >= 60 },
  { id: 'pustaka', icon: '📄', name: 'Murid Teladan', desc: 'Baca semua catatan di satu bab sebelum keluar.', test: (c) => c.win && c.story && c.g.stats.notes >= c.g.def.notes },
  { id: 'lolos', icon: '🏃', name: 'Tiga Kali Lolos', desc: 'Lolos dari tiga kejaran dalam satu bab, lalu keluar hidup-hidup.', test: (c) => c.win && (c.g.stats.escapes || 0) >= 3 },
  { id: 'napas', icon: '🫁', name: 'Tahan Napas', desc: 'Selamat saat penghuni memeriksa tempat persembunyianmu.', test: (c) => (c.g.stats.inspected || 0) > 0 },
  { id: 'umpan', icon: '🧽', name: 'Pengalih Perhatian', desc: 'Pancing penghuni dengan lemparan.', test: (c) => (c.g.stats.lures || 0) > 0 },
  { id: 'patung', icon: '🗿', name: 'Bukan Patung', desc: 'Lolos dari Gema Retak setelah ia keluar dari patung, lalu selesaikan levelnya.', test: (c) => c.win && (c.g.stats.emerged || 0) > 0 },
  { id: 'saksi', icon: '🕴', name: 'Ada yang Berdiri di Sana', desc: 'Tatap sosok di ujung lorong sampai ia menghilang.', test: (c) => (c.g.stats.ghosts || 0) > 0 },
  { id: 'sulit', icon: '💀', name: 'Tak Tergoyahkan', desc: 'Selesaikan satu bab pada kesulitan Mencekam.', test: (c) => c.win && c.story && c.g.diffKey === 'sulit' },
  { id: 'ng', icon: '🔁', name: 'Putaran Kedua', desc: 'Selesaikan satu bab di Putaran Kedua.', test: (c) => c.win && c.story && !!c.g.def.ng },
  { id: 'mimpi', icon: '🌑', name: 'Terjaga', desc: 'Selesaikan satu bab pada kesulitan Mimpi Buruk.', test: (c) => c.win && c.story && c.g.diffKey === 'mimpi' },
  { id: 'peringkatS', icon: '🅢', name: 'Nilai Sempurna', desc: 'Raih peringkat S di satu level.', test: (c) => c.win && c.story && c.rank === 'S' },
  { id: 'kaset', icon: '📼', name: 'Kolektor Kaset', desc: 'Temukan keenam kaset rahasia.', test: (c) => c.save.tapes.length >= LEVELS.length },
  { id: 'film5', icon: '🎥', name: 'Juru Kamera', desc: 'Rekam bukti lima penghuni.', test: (c) => filmed(c.save) >= 5 },
  { id: 'film10', icon: '🎬', name: 'Dokumenter Lengkap', desc: 'Rekam bukti semua penghuni.', test: (c) => filmed(c.save) >= RESIDENTS.length },
  { id: 'dalam5', icon: '⬇', name: 'Lima Lantai ke Bawah', desc: 'Lewati lantai -5 di mode Jurang.', test: (c) => c.save.bestFloor >= 5 },
  { id: 'intip', icon: '👀', name: 'Dari Balik Sudut', desc: 'Intip penghuni dari balik sudut tanpa ketahuan.', test: (c) => (c.g.stats.peeks || 0) > 0 },
  { id: 'ketuk', icon: '✊', name: 'Ada Orang di Sini', desc: 'Pancing penghuni dengan mengetuk dinding.', test: (c) => (c.g.stats.knockLures || 0) > 0 },
  { id: 'jejak', icon: '👣', name: 'Jejak Basah', desc: 'Selesaikan bab setelah penghuni mengikuti jejak kakimu.', test: (c) => c.win && (c.g.stats.printsFollowed || 0) > 0 },
  { id: 'hadang', icon: '⚔', name: 'Dua Arah', desc: 'Selesaikan lantai Jurang tempat dua penghuni saling memanggil.', test: (c) => c.win && (c.g.stats.calls || 0) > 0 },
  { id: 'bayang', icon: '🕯', name: 'Tak Tersentuh Cahaya', desc: 'Selesaikan satu bab tanpa ikon mata pernah terisi setengah.', test: (c) => c.win && c.story && (c.g.stats.maxWatch || 0) < 0.5 },
  { id: 'latih', icon: '◎', name: 'Siap Merekam', desc: 'Selesaikan Ruang Latihan.', test: (c) => !!c.save.trained },
  { id: 'lubang', icon: '🗝', name: 'Lubang Kunci', desc: 'Lihat penghuni lewat lubang kunci.', test: (c) => (c.g.stats.keyholeSpots || 0) > 0 },
  { id: 'dobrak', icon: '🚪', name: 'Tiga Detik Berharga', desc: 'Lolos setelah penghuni mendobrak pintu yang kamu ganjal.', test: (c) => c.win && (c.g.stats.battered || 0) > 0 },
  { id: 'silau', icon: '🔦', name: 'Silau', desc: 'Buat pengejar silau dengan senter.', test: (c) => (c.g.stats.dazzles || 0) > 0 },
  { id: 'kutuk', icon: '☠', name: 'Terkutuk', desc: 'Selesaikan lantai Jurang dengan dua kutukan atau lebih.', test: (c) => c.win && c.g.def.endless && (c.g.def.mods || []).length >= 2 },
  { id: 'bekal', icon: '🎒', name: 'Tiga Bekal', desc: 'Selesaikan lantai Jurang dengan tiga bekal atau lebih.', test: (c) => c.win && (c.g.def.perks || []).length >= 3 },
  { id: 'halu', icon: '🌀', name: 'Tidak Nyata', desc: 'Alami halusinasi karena ketakutan terlalu lama.', test: (c) => (c.g.stats.hallucinations || 0) > 0 },
  { id: 'tahan', icon: '🤐', name: 'Napas Tertahan', desc: 'Redam napas terengahmu dengan menahan napas.', test: (c) => (c.g.stats.stifled || 0) > 0 },
  { id: 'peta', icon: '🗺', name: 'Juru Peta', desc: 'Catat sepuluh barang di denah dalam satu permainan.', test: (c) => (c.g.stats.mapped || 0) >= 10 },
  { id: 'nyaris', icon: '😶', name: 'Nyaris', desc: 'Biarkan penghuni lewat tepat di sebelahmu tanpa melihatmu.', test: (c) => (c.g.stats.nearMisses || 0) > 0 },
  { id: 'lolos2', icon: '💨', name: 'Lari Terus', desc: 'Lolos dari lima kejaran dalam satu bab, lalu selesaikan.', test: (c) => c.win && (c.g.stats.escapes || 0) >= 5 },
  { id: 'gerebek', icon: '🔍', name: 'Ketahuan dari Ganjal', desc: 'Selamat saat penghuni menggeledah ruangan yang kamu ganjal.', test: (c) => c.win && (c.g.stats.roomRaids || 0) > 0 },
  { id: 'banting', icon: '🚪', name: 'Tepat di Wajahnya', desc: 'Banting pintu di depan pengejar.', test: (c) => (c.g.stats.slams || 0) > 0 },
  { id: 'kepala', icon: '🎯', name: 'Kena Kepala', desc: 'Lempar penghapus tepat ke kepala penghuni.', test: (c) => (c.g.stats.headshots || 0) > 0 },
  { id: 'neraka', icon: '🔥', name: 'Lantai Neraka', desc: 'Selesaikan Lantai Neraka di Jurang.', test: (c) => c.win && !!c.g.def.hell },
  { id: 'meronta', icon: '✊', name: 'Lepas dari Cengkeraman', desc: 'Meronta lepas saat tertangkap.', test: (c) => (c.g.stats.struggles || 0) > 0 },
  { id: 'tengok', icon: '↩', name: 'Jangan Menoleh', desc: 'Menoleh ke belakang dan melihat pengejarmu.', test: (c) => (c.g.stats.backSpots || 0) > 0 },
  { id: 'desis', icon: '📻', name: 'Desis di Saku', desc: 'Selesaikan satu bab setelah radiomu berdesis keras.', test: (c) => c.win && (c.g.stats.radioMax || 0) >= 0.8 },
  { id: 'dalam10', icon: '⏬', name: 'Tidak Ada Dasar', desc: 'Lewati lantai -10 di mode Jurang.', test: (c) => c.save.bestFloor >= 10 },
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
