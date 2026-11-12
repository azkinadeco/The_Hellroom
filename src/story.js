// Lore notes found in each level, plus intro / outro text.
export const INTRO = [
  'Rekaman ini ditemukan di dalam handycam merek lama, di gudang SMA Wijayakusuma yang terbakar pada 1997.',
  'Pemiliknya terakhir terlihat mengikuti "Kelas Malam" — program bimbingan yang tidak pernah tercatat di arsip sekolah.',
  'Tekan tombol PLAY.',
];

export const NOTES = {
  1: [
    { title: 'Daftar Hadir — Kelas Malam', body: 'Hadir: 31 siswa.\nPulang: 0.\n\nCatatan wali kelas: "Lorongnya bertambah panjang setiap kali bel berbunyi. Kalau kalian dengar peluit, JANGAN lari ke arah suaranya. Masuk loker, tahan napas, dan tunggu sampai langkahnya hilang."' },
    { title: 'Coretan di Meja', body: 'Pintu darurat di ujung gedung butuh listrik. Ada tiga SEKRING yang hilang dari kotak panel.\n\nSalah satunya di ruang yang dikunci. Kuncinya disembunyikan Pak Penjaga di salah satu kelas.' },
    { title: 'Surat Teguran', body: 'Kepada siswa yang berkeliaran di lorong setelah jam pelajaran:\n\nPetugas Ketertiban akan menegur Anda.\nPetugas Ketertiban tidak punya mata, tapi telinganya sangat tajam.\nBerjalanlah. Jangan berlari.\n\n— Tata Tertib, Pasal 0' },
  ],
  2: [
    { title: 'Pengumuman Guru Pengganti', body: 'Mulai hari ini kelas detensi diawasi oleh guru pengganti.\n\nIa tidak suka diperhatikan. Ia juga tidak suka DIABAIKAN.\nSelama kamu menatapnya, ia akan diam.\nSaat kamu berpaling… ia sudah mendekat.' },
    { title: 'Catatan Kaki di Buku Absen', body: 'Kalau gelap, dia bisa bergerak walau kamu menghadap ke arahnya. Nyalakan senter. Atau pakai mode malam di kamera.\n\nBaterainya cepat habis. Hemat-hemat.' },
    { title: 'Gambar Krayon', body: '[Gambar anak kecil berjas hujan kuning dengan kantong kertas di kepala.]\n\n"Dia cuma mau main. Tapi kalau dia lihat kamu, dia teriak. Dan semua yang lain DATANG."' },
  ],
  3: [
    { title: 'Memo Kepala Sekolah', body: 'Program Kelas Malam dinyatakan berhasil.\nSiswa tidak lagi meninggalkan sekolah.\nSekolah tidak lagi memiliki ujung.\n\nPetugas, guru pengganti, dan murid-murid baru telah ditugaskan untuk menjaga ketertiban.' },
    { title: 'Robekan Rapor', body: 'Nama: (dicoret)\nKelas: Malam\nKehadiran: 10.957 hari\n\nKeterangan: Siswa terus mencoba pulang. Mohon orang tua membantu.' },
    { title: 'Tulisan di Balik Pintu Loker', body: 'Kalau kamu baca ini, kamu masih punya nama.\n\nEmpat sekring. Satu panel. Satu pintu.\nJangan berhenti merekam. Selama kamera masih merekam, kamu masih nyata.' },
  ],
  4: [
    { title: 'Jadwal Olahraga — Kelas Malam', body: 'Pemanasan: 10 putaran lorong.\nInti: petak umpet.\nPendinginan: tidak ada.\n\nCatatan guru: "Dua petugas berjaga malam ini. Kalau peluit bersahutan, artinya mereka sudah tahu kamu di mana."' },
    { title: 'Coretan di Bilik Toilet', body: 'BILIK KETIGA AMAN\n(dicoret)\nTIDAK ADA YANG AMAN\n\nLihat ke bawah pintu. Kalau ada kaki yang berhenti, JANGAN BERNAPAS.' },
    { title: 'Daftar Nilai Olahraga', body: 'Lari: tidak lulus.\nSembunyi: lulus.\nPulang: —\n\nPintu darurat gedung olahraga adalah satu-satunya pintu yang langsung ke luar. Itu yang dikatakan penjaga sebelum ia berhenti datang.' },
  ],
};

export const ENDING = 'Pintu terbuka. Cahaya putih. Kaset berhenti berputar.\n\nRekaman berakhir pada 23:59:59. Tidak ada yang tahu apa yang ada di balik pintu itu — hanya bahwa handycam ini kembali, sendirian, ke meja guru di Kelas Malam.';

// Secret tapes: one per story level. Shown as transcripts.
export const TAPES = {
  1: { title: 'KASET #1 — "Hari Pertama"', body: '[Rekaman goyang. Suara anak laki-laki berbisik.]\n\n"Ini hari pertama Kelas Malam. Bu Guru bilang kami cuma belajar sampai jam sembilan. Sekarang jam… jamnya tidak bergerak.\n\nTadi ada bapak tinggi pakai selempang oranye lewat. Dia tidak punya muka. Dia meniup peluit dan Dimas lari. Dimas belum kembali."\n\n[Peluit di kejauhan. Rekaman terputus.]' },
  2: { title: 'KASET #2 — "Pelajaran Menatap"', body: '[Gambar papan tulis. Tulisan kapur: JANGAN BERKEDIP.]\n\n"Guru pengganti datang lagi. Kami disuruh menatapnya bergiliran. Yang giliran jaga tidak boleh menoleh.\n\nRina menoleh."\n\n[Suara gesekan seperti batu diseret. Lama. Lalu sunyi.]' },
  3: { title: 'KASET #3 — "Ruang Kepala Sekolah"', body: '[Rekaman dari balik pintu yang sedikit terbuka.]\n\nSuara pria tua: "…program ini berhasil. Mereka tidak menua. Mereka tidak lulus. Mereka tidak pernah pergi. Sekolah yang sempurna."\n\nSuara lain: "Dan anak yang masih membawa kamera itu?"\n\n"Biarkan dia merekam. Selama dia merekam, dia pikir dia masih nyata."' },
  4: { title: 'KASET #4 — "Pulang"', body: '[Gambar lapangan basket. Tribun penuh anak-anak yang diam, semua menghadap kamera.]\n\nSuara si pemilik kamera, lebih tua sekarang: "Kalau ada yang menemukan ini… aku sudah coba semua pintu. Pintu darurat itu tidak ke luar. Pintu itu ke awal.\n\nTapi mungkin, kalau kamu cukup cepat, kamu bisa keluar sebelum bel berbunyi lagi."\n\n[Bel sekolah. Semua anak di tribun berdiri bersamaan.]' },
};

// Intercom announcements. kind: flavor (no effect), locate (reveals player), blackout
export const PA_LINES = {
  flavor: [
    'Perhatian. Semua siswa diharap tetap berada di kelas masing-masing.',
    'Kelas Malam akan diperpanjang. Tidak ada yang diizinkan pulang.',
    'Petugas Ketertiban sedang berkeliling. Berjalanlah dengan tertib.',
    'Diumumkan kepada orang tua: anak Anda baik-baik saja. Anak Anda akan selalu baik-baik saja.',
    'Upacara bendera akan dilaksanakan sebentar lagi. Sebentar lagi. Sebentar lagi.',
  ],
  locate: [
    'Perhatian. Ada siswa di luar kelas tanpa izin. Petugas, harap menuju lokasi.',
    'Kami melihatmu. Tetap di tempat. Petugas sedang menuju ke sana.',
    'Siswa yang membawa kamera, harap melapor. Kami tahu kamu di mana.',
  ],
  blackout: [
    'Perhatian. Pemadaman listrik bergilir akan dimulai. Harap tenang.',
    'Lampu akan dimatikan untuk jam tidur siang. Tutup mata kalian.',
  ],
};
