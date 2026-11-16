# THE HELLROOM

Game survival-horror first-person di browser (Three.js) bertema **sekolah liminal tanpa ujung**, bergaya rekaman handycam 1996. Semua model 3D, tekstur, dan gambar menu dibuat lewat **pipeline Blender** (skrip Python, headless).

> Rekaman ini ditemukan di dalam handycam tua di gudang SMA Wijayakusuma. Pemiliknya terakhir terlihat masuk ke sebuah ruangan yang tidak pernah tercatat di denah sekolah.

## Menjalankan

```bash
npm run serve          # = python3 -m http.server 8080
# buka http://localhost:8080
```

Di HP (WiFi yang sama): `http://<IP-komputer>:8080`. Mainkan dalam posisi landscape.

Tidak butuh internet: Three.js sudah ada di `vendor/` (font Google opsional).

## Membangun ulang aset dengan Blender

```bash
npm run assets                                   # semua aset
"/Applications/Blender.app/Contents/MacOS/Blender" -b --factory-startup \
  -P blender/build_assets.py -- entity_monitor   # satu aset saja
```

Hasilnya masuk ke `assets/models/*.glb`, `assets/textures/*.png`, `assets/ui/title_bg.jpg`, dan preview di `blender/previews/`. Spesifikasi tiap aset (ukuran, titik origin, nama node, nama klip animasi) ada di `blender/ASSETS.md`. Nama node dan klip itu dipakai langsung oleh kode game, jadi jangan diganti sembarangan.

## Gameplay

Tujuan setiap level: kumpulkan semua **sekring**, pasang di **kotak panel** dekat pintu darurat, lalu **keluar**. Salah satu sekring ada di ruang terkunci, dan kuncinya tersembunyi di salah satu kelas.

Setiap level dihuni **satu** penghuni dengan aturannya sendiri.

| Level | Nama | Penghuni |
|---|---|---|
| BAB I | Sekolah Senyap (dua lantai) | Murid Pucat |
| BAB II | Blok Isolasi (panoptikon tiga lantai) | Induk Laba-Laba |
| BAB III | Bangsal Hening (tiga lantai + hutan dalam ruangan) | Spesimen Tiga |
| BAB IV | Plaza Abadi (tiga lantai mengelilingi atrium) | Bayang Padam |
| BAB V | Kolam Pualam (lima lantai, perosotan air) | Kelabang Murid |
| BAB VI | Museum Bisu (museum tiga lantai, final) | Gema Retak (bersembunyi di dalam patung; patung berderak 2 detik sebelum pecah) |

Jam Berlidah, Penenun Tulang, Dinding Bermata, dan Sang Pembisik menghuni mode Jurang dan Putaran Kedua. Di lantai mana pun yang penuh patung atau manekin, Gema Retak memakai aturan patungnya.

## Batch 128–137

- **Pintu kedua**: ±60% ruangan berpintu satu mendapat pintu kedua (ke lorong atau ruangan sebelah) sehingga ada jalur memutar; pintu yang terhalang perabot dibatalkan.
- **Banting pintu** di depan pengejar (≤1,9 m di sisi seberang): tertahan 0,9 detik.
- **Pasang sekring** butuh 0,9 + 0,55 detik per sekring, berderak, bisa dibatalkan.
- **Lemparan kena**: badan 0,5 detik, kepala 1,1 detik terhuyung.
- **Tangan gemetar**: sorot senter bergetar mengikuti rasa takut.
- **Kesulitan** mengatur jeda dan kecepatan dekat pengejar.
- **Lantai Neraka** tiap lantai ke-5 Jurang: hampir gelap, dua penghuni, dua bekal.
- **Penjaga tersangkut**: penghuni yang macet 5 detik dicarikan jalan lain atau dipindah saat tak terlihat.
- **Lencana**: Tepat di Wajahnya, Kena Kepala, Lantai Neraka (41 lencana).

## Batch 115–127

- **Kecepatan pengejar**: 8% lebih lambat, mulai 68% lalu naik dalam 2,2 detik, melambat 1,5 detik tiap 5–8 detik (ada bunyi dan ikon mata menyipit), dari jarak dekat hanya 3% lebih cepat dari larimu, melambat di tikungan tajam.
- **Jumpscare**: hentakan wajah ke lensa, guncangan keras, frame merah/negatif, dentuman bass, kilasan wajah; gaya per penghuni (menerjang, jatuh dari atas, diam lalu menghantam); intensitas bisa diatur (Penuh/Lembut/Tenang).
- **Saat dikejar**: warna memudar, tepi layar merah berdenyut mengikuti detak jantung, pandangan menyempit, nada naik makin dekat, guncangan langkah.
- **Lolos**: napas lega dan teks "lolos". **Nyaris**: penghuni lewat di sebelahmu tanpa melihat.
- **Pintu diganjal** jadi petunjuk: setelah didobrak, semua tempat sembunyi di ruangan itu digeledah.
- **Menyerah lebih cepat** kalau kamu sudah jauh (>12 m / >18 m).
- **Menyimak**: jongkok diam 1 detik meredam suara bangunan dan menonjolkan langkah.
- **Lencana**: Nyaris, Lari Terus, Ketahuan dari Ganjal (38 lencana).

## Batch 105–114

- **Garis di layar**: retakan prosedural (terbaca seperti goresan) dihapus; hujan di dekat lensa memudar; tracking band dan getaran baris mode VHS dihaluskan.
- **Pengejaran prediktif**: saat kehilanganmu, pengejar berlari ke perkiraan posisimu 1,6 detik kemudian.
- **Pencarian per ruangan**: memeriksa ruangan terdekat dari pintunya, tidak mengulang ruangan yang baru diperiksa.
- **Pendengaran**: posisi suara diperkirakan dengan galat (lebih besar kalau samar atau lewat sudut); suara samar hanya membuatnya menoleh.
- **Sorot senter** di dinding gelap terlihat penghuni.
- **Belajar**: dua kali tertipu pengalih yang sama dalam semenit, yang ketiga 65% diabaikan.
- **Fase akhir**: 40% patroli menjaga kotak panel / pintu darurat.
- **Hati-hati**: 3,5 m terakhir ke titik yang diperiksa dilalui pelan, kepala menyapu, lebih awas.
- **Ruang Uji**: opsi "Tampilkan otak penghuni".

## Batch 95–104

- **Napas terengah** setelah stamina habis terdengar penghuni; menahan napas meredamnya (juga di luar tempat sembunyi).
- **Denah** mencatat sekring, kunci, baterai, kaset, catatan, dan weker yang pernah terlihat.
- **Hemat daya**: dunia 3D berhenti digambar saat jeda/catatan/layar mati/menang; opsi batas 30 fps.
- **Bekal Jurang**: setelah tiap lantai pilih 1 dari 3 bekal (Sol Karet, Bayangan Tebal, Ganjal Cadangan, Saku Baterai, Paru-Paru Kuat, Lensa Bersih, Jam Weker); menumpuk selama run.
- **Analisis kematian**: potongan denah dengan jejakmu dan jejak penghuni 20 detik terakhir.
- **Halusinasi** setelah takut berkepanjangan: alarm palsu, langkah palsu, sosok palsu.
- **Ciri khas penghuni**: Jam Berlidah diam saat menunggu, Sang Pembisik meniru ketukan, Penenun Tulang melihat di gelap, Kelabang Murid mencium jejak basah dari jauh.
- **Kartu Mode Lain** menampilkan penghuni & kutukan Rekaman Harian hari ini dan bekal run Jurang.
- **Lencana**: Tiga Bekal, Tidak Nyata, Napas Tertahan, Juru Peta (35 lencana).

## Batch 85–94

- **Lubang kunci**: condong di depan pintu tertutup untuk mengintip ke baliknya tanpa terlihat.
- **Cahaya bocor**: senter yang dinyalakan di tempat sembunyi terlihat penghuni dalam 10 m.
- **Mengendus**: penghuni berhenti 3 detik dan pendengarannya 1,8× lebih jauh.
- **Pura-pura pergi**: 35% pencarian berakhir dengan penghuni menunggu diam 8–12 detik.
- **Kutukan Jurang baru**: Penghuni Waspada, Pintu Berderit, Tanpa Ganjal, Senter Redup.
- **Kontrol**: jongkok tahan/tekan, lari tahan/tekan (keyboard).
- **Getaran detak jantung** di gamepad dan HP saat takut.
- **Petir** menerangi seluruh layar.
- **Lencana**: Siap Merekam, Lubang Kunci, Tiga Detik Berharga, Silau, Terkutuk.

## Batch 75–84

- **Kecerahan**: penggeser di Pengaturan dan layar kalibrasi saat pertama kali dibuka.
- **Indikator arah suara** (Pengaturan): busur di sekitar bidikan menunjuk asal suara, merah untuk suara penghuni.
- **Ganjal pintu**: jongkok + interaksi di pintu tertutup; penghuni harus mendobrak ±3 detik.
- **Hujan dan petir** di kolom langit terbuka (taman rumah sakit, rotunda museum, atrium Jurang): hujan menyamarkan langkah dan membasahi sepatu; petir membuatmu terlihat.
- **Ruang Latihan** di Mode Lain: daftar latihan, penghuni tidak bisa membunuh.
- **Ingatan persembunyian**: tempat yang sering kamu pakai diperiksa penghuni.
- **Silau senter**: sorotan tepat ke wajah dari dekat menghentikan pengejar 0,9 detik (sekali tiap 15 detik).
- **Riwayat rekaman** 12 permainan terakhir di Arsip.

## Siluman lanjutan (batch 64–74)

- **Intro ONIX Studio** sebelum menu (batch 64).
- **Condong** (X / V, tombol sentuh, D-pad bawah + stik): mengintip dari balik sudut; penghuni hanya melihat kepalamu.
- **Suara teredam**: suara dari balik tembok terdengar lebih pelan dan redup, sesuai jalur yang harus dilaluinya.
- **Drone ketegangan** mengikuti ikon mata; petunjuk pertama kali untuk mata, jongkok, dan perlindungan.
- **Denah**: tanda ! di tempat kamu terlihat (memudar dalam semenit), simbol weker.
- **Jejak kaki basah** setelah keluar dari air; penghuni mengikutinya.
- **Dua penghuni** mulai Lantai -8 di Jurang; yang satu memanggil, yang lain menghadang.
- **Ketuk dinding** (T / R3 / tombol sentuh) untuk memancing tanpa membuang barang.
- **Performa**: penghuni di balik tembok tidak digambar.
- **Lencana**: Dari Balik Sudut, Ada Orang di Sini, Jejak Basah, Dua Arah, Tak Tersentuh Cahaya; statistik ketukan, intipan, pintu yang diperiksa.

## Penglihatan penghuni (batch 62–63)

- **Meteran kewaspadaan**: penghuni harus menyadarimu dulu. Setengah sadar: ia berhenti, menoleh, lalu memeriksa tempat kamu terlihat. Penuh: ia mengejar. Ikon mata di atas layar menunjukkan seberapa dekat kamu ketahuan.
- **Kerucut pandang**: pusat dengan jarak penuh, tepi pendek yang hanya menangkap gerakan, belakang buta.
- **Jongkok** (terutama di gelap dan diam) membuatmu sulit terlihat; jongkok di balik meja, peti, atau bangku memutus pandangan. Senter yang diarahkan ke penghuni membuatmu ketahuan dari jauh.
- **Luar ruangan** (lapangan, hutan, langit terbuka): jarak pandang minimal 42 m; atrium bertingkat 1,5×.
- **Ingatan pintu**: pintu yang kamu buka atau tutup sejak penghuni terakhir melihatnya akan ia periksa.
- Batch 61: garis di layar Ultra HD hilang (kabut volumetrik, noise tekstur), pasca-proses setengah resolusi, pengatur frame-rate menuju 60 fps.

## Grafis batch 60

- **Permukaan**: noda lembap, rembesan karat, jamur di tempat gelap, retakan halus, noda air di plafon, genangan basah yang memantulkan cahaya, dan kilau senter. Semuanya prosedural di shader (`src/render/bake.js`), kadarnya berbeda per bangunan (`def.grime`).
- **Properti**: butiran permukaan, noda, goresan, dan debu di sisi atas untuk semua properti statis.
- **Pasca-proses** (`src/render/vhs.js`): ambient occlusion dari depth buffer, penajaman, dithering.
- **Ambience** (`src/render/ambience.js`): berkas cahaya senter di udara, lensa senter yang tidak rata, kabut lantai, sarang laba-laba di sudut plafon.
- Kualitas **Rendah** mematikan semua efek ini. Kalau resolusi otomatis sudah mentok dan masih lambat, bayangan kontak lalu kabut dimatikan sendiri.

## Fitur batch 49–59

- **Tampilan**: menu awal baru (Lanjutkan, Pilih Bab, Mode Lain, Arsip; Pengaturan, Cara Bermain, dan Ruang Uji jadi ikon di pojok), ukuran tulisan lebih kecil di seluruh UI, tombol sentuh berupa ikon tanpa tulisan.
- **Nama baru**: bab BAB I–VI, penghuni (Murid Pucat, Spesimen Tiga, Bayang Padam, Dinding Bermata, Kelabang Murid, Induk Laba-Laba, Jam Berlidah, Sang Pembisik), mode **Jurang** dan **Rekaman Harian**, kesulitan Cerita / Standar / Mencekam / Mimpi Buruk.
- **Gema Retak**: patung berderak 2 detik sebelum pecah (mundur dan ia tenang), diam sebentar sebelum mengejar, lalu pergi pelan-pelan dan menghilang kalau kehilanganmu.
- **AI**: jalur dihaluskan (tidak zig-zag), suara merambat lewat lorong dan pintu (tidak menembus tembok), pencarian mengikuti arah larimu dan memeriksa tempat sembunyi terdekat, patroli menjelajah ruangan yang lama tidak didatangi.
- **Sutradara ketegangan**: stres yang menumpuk memberi jeda napas, kejaran yang terlalu lama membuat penghuni lelah, dan setelah tiga kali mati di bab yang sama penghuni sedikit melambat (tidak di Mencekam / Mimpi Buruk).
- **Performa**: resolusi otomatis, animasi penghuni jauh diperbarui lebih jarang.

## Fitur batch 36–45

- **Bantuan arah**: kalau lama tidak ada kemajuan, tanda `?` merah muncul di denah pada ruangan yang menyimpan hal berikutnya yang kamu butuhkan (bisa dimatikan).
- **Pengumuman per gedung** (detensi, rumah sakit, mal, kolam, museum, backroom) dan **tips** di kartu level.
- **Jejak kematian**: saat mengulang level, baterai kamera lamamu tertinggal di tempat kamu mati. Arsip punya bagian **Statistik**.
- **Putaran Kedua** (setelah ending): gedung yang sama dihuni penghuni lain (`NG_CAST`), lebih gelap; rekor dan peringkat terpisah.
- **Akhir yang sebenarnya**: tamatkan BAB VI dengan keenam kaset rahasia dan bukti enam penghuni.
- **Atur ulang tombol keyboard** (16 aksi) dan **menu tanpa mouse** (panah/d-pad, Enter/A, B kembali).
- **Pecahan kaca** (`src/level/glass.js`): berbunyi keras kalau diinjak; jongkok atau memutar.
- **Data progres**: salin/tempel kode progres, hapus progres, penghitung FPS, salin hasil Rekaman Harian.
- **Kesulitan Mimpi Buruk**: tanpa denah, titik simpan, dan bantuan.

## Fitur batch 26–35

- **Denah (M / PETA)**: denah kertas yang tergambar sendiri saat kamu menjelajah. Hanya memuat sel yang sudah kamu lihat: dinding, pintu (yang terkunci berwarna merah), nama ruangan, tangga, lift, panel, dan pintu darurat. `R` berganti lantai. Permainan tidak berhenti saat denah terbuka.
- **Kejadian ganjil**: saat tidak ada yang mengejarmu, gedung tetap hidup: pintu terbuka sendiri, loker bergetar, langkah atau bisikan di belakangmu, bel sekolah, kapur di papan, listrik berkedip, dan sosok tanpa wajah di ujung lorong yang hilang begitu kamu menatapnya.
- **Rekam bukti**: tahan zoom (Z) ke arah penghuni selama 6 detik untuk membuka *rekaman lapangan* penghuni itu di Arsip.
- **Ritme patroli**: setelah kamu lolos dari kejaran, penghuni menjauh sebentar; setelah lama sepi, patroli berikutnya berakhir di dekatmu. Lamanya mengikuti tingkat kesulitan.
- **Peringkat & lencana**: tiap level story dinilai S/A/B/C (waktu terhadap par, berapa kali terlihat, catatan, kaset, bukti). Ada 17 lencana di menu Arsip.
- **Mode Jurang**: mulai lantai -2 setiap lantai punya *kutukan* (listrik sekarat, kabut tebal, lantai bergema, baterai bocor, penghuni gelisah, pemadaman bergilir, lantai angker). Run yang ditinggalkan bisa dilanjutkan dari lantai terakhir. **Rekaman Harian** adalah satu bangunan tetap per hari dengan catatan waktu terbaik.
- **Gamepad & kenyamanan**: gamepad standar didukung; getaran di HP/gamepad. Pengaturan baru: sudut pandang 60–95°, teks besar, goyangan langkah, kurangi kedip lampu, getaran.
- **Jam weker (Q / WEKER)**: item baru. Letakkan, lima detik kemudian ia berdering sembilan detik dan memanggil penghuni ke sana.
- **Titik simpan**: memasang sekring di kotak panel menyimpan rekaman (bukan di Mencekam / Jurang). Setelah mati kamu bisa *Lanjut dari Panel*; tiap lanjut mengurangi nilai peringkat.
- **PWA**: `manifest.webmanifest` + `sw.js` (network-first) membuat game bisa dipasang dan dimainkan offline bila disajikan lewat HTTPS atau localhost.

Level 3–5 sengaja dibuat **bersih tanpa perabot**: hanya ruangan kosong, loker untuk bersembunyi, dan suasana yang janggal (musik mal yang samar, tetesan air kolam, dengung lampu backroom). Di kolam, berjalan di dalam air memperlambat langkahmu dan membuat setiap langkah terdengar jauh.

**Tampilan layar**: di Pengaturan ada pilihan **Jernih HD** yang menghilangkan semua efek kaset rusak (garis, getaran, noise, kedip, dan guncangan saat mati) untuk pemain yang pusing melihatnya.

**Anomali**: di Plaza Abadi, beberapa lorong benar-benar berulang. Kamu diam-diam dikirim mundur satu blok, dua atau tiga kali, sebelum lorongnya membiarkanmu lewat (tokonya dibuat identik supaya tidak terlihat). Di Museum Bisu, patung yang tidak sedang kamu lihat pelan-pelan menoleh ke arahmu.

**Pilih Bab**: selama `DEV_ROOMS = true`, semua level terbuka dan bisa dimainkan tanpa menamatkan level sebelumnya.

**Langkah kaki**: karpet backroom meredam langkahmu (lebih senyap), keramik mal dan kolam memantulkannya (lebih berisik), dan air kolam selalu berisik.

**Kartu level & ending**: setiap kartu level menampilkan potret penghuninya (dirender di Blender, `blender/portraits.py`) setelah kamu pernah melihatnya. Menamatkan BAB VI memutar ending dan kredit, lalu judul menampilkan ★ ENDING TERBUKA.

**Loker**: di dalam loker kamu aman dari serangan langsung. Penghuni hanya bisa menarikmu keluar kalau ia melihatmu masuk, atau kalau ia mendengar napasmu cukup lama saat memeriksa loker (tahan napas!).

**Ruang Uji**: menu khusus pengembangan untuk langsung masuk ke level mana pun. Penghuni bisa diganti (atau dikosongkan untuk jelajah bebas), ada **mode kebal**, dan ada **Galeri Penghuni** untuk memutar model 3D beserta animasinya. Untuk rilis, set `DEV_ROOMS = false` di `src/config.js`, dan menu ini akan hilang.

**Mode Jurang**: lantai demi lantai dibuat acak (LANTAI -1, -2, …), makin dalam makin besar dan gelap; tiap lantai dihuni satu penghuni acak. Mati berarti mulai lagi dari -1, dan rekor lantai terdalam tersimpan.

**Arsip Penghuni**: setiap penghuni yang pernah kamu lihat langsung tercatat di menu **Arsip**, lengkap dengan model 3D yang bisa diputar, animasinya, kisahnya, dan cara bertahan darinya.

**Lab Biologi**: level 2 kini dipenuhi ruang lab berisi meja praktikum, rak toples spesimen, dan rangka anatomi (aset Blender baru di `blender/props3.py`).

**Meteran tatapan**: saat Dinding Bermata (mode Jurang / Putaran Kedua) menatapmu, muncul meteran 👁 DITATAP dan layar memerah. Kalau meterannya penuh, kamu mati.

**Kaset rahasia & Arsip**: tiap level story menyimpan satu kaset VHS di salah satu ruangan terjauh. Kaset dan catatan yang sudah ditemukan bisa dibaca ulang di menu **Arsip**.

**Pengumuman pengeras suara**: sesekali bel intercom berbunyi lalu ada pengumuman. Ada yang sekadar menyeramkan, ada yang membocorkan posisimu ke penghuni (sembunyi supaya tidak terlacak), dan ada yang memadamkan listrik ±14 detik.

**Penghuni**: sepuluh penghuni, semuanya model Blender dari konsep di `Image Aset/` (`blender/entities3.py`–`entities5.py`). Kisah, cara bertahan, model 3D, dan rekaman lapangan tiap penghuni ada di menu **Arsip** setelah kamu menemuinya.

**Tempat sembunyi**: 13 jenis (loker, bilik toilet, lemari, kolong meja/ranjang, tirai, kamar pas, photo box, bilik bilas, kabin ganti, peti, troli linen, laci jenazah, lemari arsip), semuanya didefinisikan di `HIDE` (`src/config.js`).

**Sistem**: penghapus papan yang bisa dilempar untuk memancing Petugas, subtitle suara berarah (berguna saat iPhone dalam mode senyap), petunjuk tutorial di awal, resolusi otomatis turun kalau FPS drop, suara langkah (jalan, lari, jongkok), pintu yang terdengar jauh, loker dengan meteran napas, baterai handycam (senter dan mode malam), stamina, lampu neon yang berkedip atau mati, catatan lore, tiga tingkat kesulitan, progres tersimpan otomatis.

## Kontrol

| Aksi | PC | HP |
|---|---|---|
| Gerak / lihat | WASD + mouse | joystick kiri + geser layar kanan |
| Lari | Shift | LARI (toggle) |
| Jongkok | C / Ctrl | JONGKOK |
| Interaksi | E / klik kiri | AKSI |
| Senter | F | SENTER |
| Mode malam | N | MALAM |
| Zoom kamera | tahan Z | ZOOM (toggle) |
| Lempar penghapus | G / klik kanan | LEMPAR |
| Pasang jam weker | Q | WEKER |
| Denah | M (R: ganti lantai) | PETA |
| Tahan napas (di loker) | tahan Spasi | TAHAN NAPAS |
| Tujuan | Tab | — |
| Jeda | Esc | ❚❚ |

## Struktur

```
index.html, css/style.css     UI dan HUD
manifest.webmanifest, sw.js   PWA (pasang + offline)
src/main.js                   boot, menu, save (localStorage), layar menang/mati
src/game.js                   state game, loop, lantai, lift, titik simpan, jam weker
src/config.js                 tuning, HIDE, definisi level, endlessDef + kutukan
src/automap.js                denah yang tergambar saat menjelajah
src/events.js                 kejadian ganjil
src/badges.js                 lencana + peringkat
src/level/building.js         mesin gedung bertingkat (lantai, tangga, lift, item)
src/level/layouts.js          denah tulisan tangan tiap level + generator Tanpa Ujung
src/level/builder.js          mesh dinding/lantai, prop instanced, pintu, item
src/level/*.js                mal, kolam, arsitektur, tempat sembunyi, variasi prop
src/render/                   baked lighting, shader VHS, dressing, decal cerita
src/ai/                       otak penghuni + pathfinding
src/player.js, world.js       gerak, kolisi
src/interact.js, hud.js, input.js (keyboard, sentuh, gamepad), audio.js, story.js
blender/                      pipeline aset Blender
assets/                       hasil ekspor Blender
```
