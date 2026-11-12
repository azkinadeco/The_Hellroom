// Lore notes found in each level, plus intro / outro text.
export const INTRO = [
  'Rekaman ini ditemukan di dalam handycam merek lama, di gudang SMA Wijayakusuma yang terbakar pada 1997.',
  'Pemiliknya terakhir terlihat mengikuti "Kelas Malam" — program bimbingan yang tidak pernah tercatat di arsip sekolah.',
  'Tekan tombol PLAY.',
];

export const NOTES = {
  1: [
    { title: 'Daftar Hadir — Kelas Malam', body: 'Hadir: 31 siswa.\nPulang: 0.\n\nCatatan wali kelas: "Lorongnya bertambah panjang setiap kali bel berbunyi. Ada yang merangkak di sana. Kulitnya pucat dan wajahnya cuma satu sobekan penuh gigi."' },
    { title: 'Coretan di Meja', body: 'Pintu darurat di ujung gedung butuh listrik. Ada tiga SEKRING yang hilang dari kotak panel.\n\nSalah satunya di ruang yang dikunci. Kuncinya disembunyikan Pak Penjaga di salah satu kelas.' },
    { title: 'Surat Teguran', body: 'Kepada siswa yang berkeliaran di lorong:\n\nSi Pucat tidak punya mata. Ia mendengar.\nJONGKOK. Berjalan pelan. Jangan berlari.\nKalau ia sudah dekat, lempar sesuatu ke arah lain.\n\n— Tata Tertib, Pasal 0' },
  ],
  2: [
    { title: 'Pengumuman Guru Piket', body: 'Kelas detensi malam ini diawasi oleh guru piket.\n\nIa memakai topeng putih. Tidak ada yang pernah melihat wajahnya.\nKalau terdengar penggaris besi diketuk ke telapak tangan, artinya ia sedang berjaga di dekatmu.' },
    { title: 'Catatan di Buku Hukuman', body: 'Tulis 100 kali: "Saya tidak akan berkeliaran setelah bel."\n\nSaya tidak akan berkeliaran setelah bel.\nSaya tidak akan berkeliaran setelah bel.\nSaya tidak akan bersuara di loker.\nSaya tidak akan bernapas di loker.' },
    { title: 'Kertas Terlipat', body: 'Dia melihat dan mendengar, tapi dia tidak sabar. Kalau dia kehilangan jejakmu, dia akan memeriksa loker-loker terdekat.\n\nTahan napas. Hitung sampai langkahnya pergi.' },
  ],
  3: [
    { title: 'Label Toples Spesimen', body: 'SPESIMEN 03 — "Penganga"\nKeterangan: tidak bergerak selama diamati.\n\nPeringatan: rahangnya terus melebar. Jangan masukkan tangan ke dalam toples.\n\n(Toplesnya pecah. Labelnya basah.)' },
    { title: 'Catatan Praktikum', body: 'Pengamatan 1: saat ditatap, ia diam.\nPengamatan 2: saat lampu padam, ia sudah berada di depan meja.\nPengamatan 3: senter membantu. Mode malam kamera juga.\n\nPengamatan 4: (tidak ada)' },
    { title: 'Gambar di Papan Tulis', body: '[Kapur: sosok membungkuk dengan mulut menganga sampai ke dada.]\n\nDi bawahnya tertulis berulang-ulang:\nJANGAN BERPALING JANGAN BERPALING JANGAN BERPALING' },
  ],
  4: [
    { title: 'Laporan Penjaga Sekolah', body: 'Listrik sayap timur rusak sejak lama. Lampu yang masih menyala jangan dimatikan.\n\nAnak-anak bilang ada bayangan di ujung lorong yang punya banyak mata. Bayangan itu tidak pernah masuk ke tempat yang terang.' },
    { title: 'Coretan di Dinding', body: 'SOROTKAN SENTERMU KE MATANYA\n\ndia mundur\ndia selalu mundur\ntapi baterainya tidak pernah cukup' },
    { title: 'Pengumuman yang Disobek', body: 'Pemadaman bergilir akan dilakukan setiap malam.\n\n(Ditambahkan dengan pulpen:) Kalau lampu padam, Bayang bisa pergi ke mana saja. Ke MANA SAJA.' },
  ],
  5: [
    { title: 'Jadwal Pelajaran 3-C', body: 'Senin: Menatap.\nSelasa: Menatap.\nRabu: Menatap.\n\nWali kelas: (tidak ada)\nYang memperhatikan kalian: papan tulis.' },
    { title: 'Surat dari Ketua Kelas', body: 'Ada mata di papan tulis. Banyak. Akarnya merambat ke dinding.\n\nKalau kamu merasa ditatap, langsung pergi dari pandangannya. Jangan berdiri lama di depannya. Kalau ada suara keras, matanya pindah ke papan yang paling dekat dengan suara itu.' },
    { title: 'Buku Absen Basah', body: 'Semua nama dicoret, kecuali satu.\n\nDi sebelahnya ada noda hitam yang mengalir ke bawah seperti air mata.' },
  ],
  6: [
    { title: 'Jadwal Olahraga — Kelas Malam', body: 'Pemanasan: 10 putaran lorong.\nInti: petak umpet.\nPendinginan: tidak ada.\n\nCatatan guru: "Murid-murid yang tidak pernah pulang sekarang berjalan bersama. Sebagai satu tubuh."' },
    { title: 'Coretan di Bilik Toilet', body: 'DIA PUNYA BANYAK WAJAH\nSEMUA MELIHAT KE ARAH BERBEDA\n\nkamu tidak bisa menyelinap di belakangnya\ntapi matanya rabun. jaga jarak. pakai dinding.' },
    { title: 'Daftar Nilai Olahraga', body: 'Lari: tidak lulus.\nSembunyi: lulus.\nPulang: —\n\nPintu darurat gedung olahraga adalah satu-satunya pintu yang langsung ke luar. Itu yang dikatakan penjaga sebelum ia berhenti datang.' },
  ],
};

export const ENDING = 'Pintu terbuka. Cahaya putih. Kaset berhenti berputar.\n\nRekaman berakhir pada 23:59:59. Tidak ada yang tahu apa yang ada di balik pintu itu — hanya bahwa handycam ini kembali, sendirian, ke meja guru di Kelas Malam.';

// Secret tapes: one per story level. Shown as transcripts.
export const TAPES = {
  1: { title: 'KASET #1 — "Hari Pertama"', body: '[Rekaman goyang. Suara anak laki-laki berbisik.]\n\n"Ini hari pertama Kelas Malam. Bu Guru bilang kami cuma belajar sampai jam sembilan. Sekarang jam… jamnya tidak bergerak.\n\nTadi Dimas lari di lorong. Ada yang merangkak keluar dari kelas, putih, cepat sekali. Dimas belum kembali."\n\n[Desisan panjang. Rekaman terputus.]' },
  2: { title: 'KASET #2 — "Guru Piket"', body: '[Gambar meja guru. Sebuah topeng putih tergeletak di atasnya.]\n\n"Topengnya ada di sini. Jadi siapa yang berjalan di lorong itu?"\n\n[Tok. Tok. Tok. Bunyi penggaris besi dari balik pintu.]' },
  3: { title: 'KASET #3 — "Pelajaran Menatap"', body: '[Gambar papan tulis. Tulisan kapur: JANGAN BERKEDIP.]\n\n"Kami disuruh menatap spesimen itu bergiliran. Yang giliran jaga tidak boleh menoleh.\n\nRina menoleh."\n\n[Gemeretak tulang. Lama. Lalu sunyi.]' },
  4: { title: 'KASET #4 — "Pemadaman"', body: '[Layar gelap. Hanya titik-titik cahaya putih, berpasangan.]\n\n"Satu… dua… tujuh pasang. Mereka tidak berkedip.\n\nSenterku tinggal satu bar."\n\n[Bisikan. Sangat dekat dengan mikrofon.]' },
  5: { title: 'KASET #5 — "Ruang Kepala Sekolah"', body: '[Rekaman dari balik pintu yang sedikit terbuka.]\n\nSuara pria tua: "…program ini berhasil. Mereka tidak menua. Mereka tidak lulus. Mereka tidak pernah pergi. Dan sekolah selalu memperhatikan mereka."\n\n"Dan anak yang masih membawa kamera itu?"\n\n"Biarkan dia merekam. Selama dia merekam, dia pikir dia masih nyata."' },
  6: { title: 'KASET #6 — "Pulang"', body: '[Gambar lapangan basket. Tribun penuh anak-anak yang diam, semua menghadap kamera.]\n\nSuara si pemilik kamera, lebih tua sekarang: "Kalau ada yang menemukan ini… aku sudah coba semua pintu. Pintu darurat itu tidak ke luar. Pintu itu ke awal.\n\nTapi mungkin, kalau kamu cukup cepat, kamu bisa keluar sebelum bel berbunyi lagi."\n\n[Bel sekolah. Semua anak di tribun berdiri bersamaan.]' },
};

// Intercom announcements. kind: flavor (no effect), locate (reveals player), blackout
export const PA_LINES = {
  flavor: [
    'Perhatian. Semua siswa diharap tetap berada di kelas masing-masing.',
    'Kelas Malam akan diperpanjang. Tidak ada yang diizinkan pulang.',
    'Petugas sedang berkeliling. Berjalanlah dengan tertib.',
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
