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
| LEVEL 0 | Sekolah Malam (dua lantai) | Si Pucat |
| LEVEL 1 | Sayap Detensi (panoptikon tiga lantai) | Laba-Laba Kaki |
| LEVEL 2 | Rumah Sakit (tiga lantai + hutan dalam ruangan) | Si Penganga |
| LEVEL 3 | Mal Tanpa Ujung (tiga lantai mengelilingi atrium) | Bayang Kelas |
| LEVEL 4 | Kolam Renang (lima lantai, perosotan air) | Kelabang |
| LEVEL 5 | Ruang Patung (museum tiga lantai, final) | Mata Papan |

Jam Kakek, Penenun Tulang, Gema Retak, dan Perempuan Gurita menghuni Mode Tanpa Ujung.

## Fitur batch 26–35

- **Denah (M / PETA)**: denah kertas yang tergambar sendiri saat kamu menjelajah. Hanya memuat sel yang sudah kamu lihat: dinding, pintu (yang terkunci berwarna merah), nama ruangan, tangga, lift, panel, dan pintu darurat. `R` berganti lantai. Permainan tidak berhenti saat denah terbuka.
- **Kejadian ganjil**: saat tidak ada yang mengejarmu, gedung tetap hidup: pintu terbuka sendiri, loker bergetar, langkah atau bisikan di belakangmu, bel sekolah, kapur di papan, listrik berkedip, dan sosok tanpa wajah di ujung lorong yang hilang begitu kamu menatapnya.
- **Rekam bukti**: tahan zoom (Z) ke arah penghuni selama 6 detik untuk membuka *rekaman lapangan* penghuni itu di Arsip.
- **Ritme patroli**: setelah kamu lolos dari kejaran, penghuni menjauh sebentar; setelah lama sepi, patroli berikutnya berakhir di dekatmu. Lamanya mengikuti tingkat kesulitan.
- **Peringkat & lencana**: tiap level story dinilai S/A/B/C (waktu terhadap par, berapa kali terlihat, catatan, kaset, bukti). Ada 17 lencana di menu Arsip.
- **Mode Tanpa Ujung**: mulai lantai -2 setiap lantai punya *kutukan* (listrik sekarat, kabut tebal, lantai bergema, baterai bocor, penghuni gelisah, pemadaman bergilir, lantai angker). Run yang ditinggalkan bisa dilanjutkan dari lantai terakhir. **Kaset Harian** adalah satu bangunan tetap per hari dengan catatan waktu terbaik.
- **Gamepad & kenyamanan**: gamepad standar didukung; getaran di HP/gamepad. Pengaturan baru: sudut pandang 60–95°, teks besar, goyangan langkah, kurangi kedip lampu, getaran.
- **Jam weker (Q / WEKER)**: item baru. Letakkan, lima detik kemudian ia berdering sembilan detik dan memanggil penghuni ke sana.
- **Titik simpan**: memasang sekring di kotak panel menyimpan rekaman (bukan di Sulit / Tanpa Ujung). Setelah mati kamu bisa *Lanjut dari Panel*; tiap lanjut mengurangi nilai peringkat.
- **PWA**: `manifest.webmanifest` + `sw.js` (network-first) membuat game bisa dipasang dan dimainkan offline bila disajikan lewat HTTPS atau localhost.

Level 3–5 sengaja dibuat **bersih tanpa perabot**: hanya ruangan kosong, loker untuk bersembunyi, dan suasana yang janggal (musik mal yang samar, tetesan air kolam, dengung lampu backroom). Di kolam, berjalan di dalam air memperlambat langkahmu dan membuat setiap langkah terdengar jauh.

**Tampilan layar**: di Pengaturan ada pilihan **Jernih HD** yang menghilangkan semua efek kaset rusak (garis, getaran, noise, kedip, dan guncangan saat mati) untuk pemain yang pusing melihatnya.

**Anomali**: di Mal Tanpa Ujung, beberapa lorong benar-benar berulang. Kamu diam-diam dikirim mundur satu blok, dua atau tiga kali, sebelum lorongnya membiarkanmu lewat (tokonya dibuat identik supaya tidak terlihat). Di Ruang Patung, patung yang tidak sedang kamu lihat pelan-pelan menoleh ke arahmu.

**Pilih Level**: selama `DEV_ROOMS = true`, semua level terbuka dan bisa dimainkan tanpa menamatkan level sebelumnya.

**Langkah kaki**: karpet backroom meredam langkahmu (lebih senyap), keramik mal dan kolam memantulkannya (lebih berisik), dan air kolam selalu berisik.

**Kartu level & ending**: setiap kartu level menampilkan potret penghuninya (dirender di Blender, `blender/portraits.py`) setelah kamu pernah melihatnya. Menamatkan LEVEL 5 memutar ending dan kredit, lalu judul menampilkan ★ ENDING TERBUKA.

**Loker**: di dalam loker kamu aman dari serangan langsung. Penghuni hanya bisa menarikmu keluar kalau ia melihatmu masuk, atau kalau ia mendengar napasmu cukup lama saat memeriksa loker (tahan napas!).

**Pilih Room (uji)**: menu khusus pengembangan untuk langsung masuk ke level mana pun. Penghuni bisa diganti (atau dikosongkan untuk jelajah bebas), ada **mode kebal**, dan ada **Galeri Penghuni** untuk memutar model 3D beserta animasinya. Untuk rilis, set `DEV_ROOMS = false` di `src/config.js`, dan menu ini akan hilang.

**Mode Tanpa Ujung**: lantai demi lantai dibuat acak (LANTAI -1, -2, …), makin dalam makin besar dan gelap; tiap lantai dihuni satu penghuni acak. Mati berarti mulai lagi dari -1, dan rekor lantai terdalam tersimpan.

**Arsip Penghuni**: setiap penghuni yang pernah kamu lihat langsung tercatat di menu **Arsip**, lengkap dengan model 3D yang bisa diputar, animasinya, kisahnya, dan cara bertahan darinya.

**Lab Biologi**: level 2 kini dipenuhi ruang lab berisi meja praktikum, rak toples spesimen, dan rangka anatomi (aset Blender baru di `blender/props3.py`).

**Meteran tatapan**: saat Mata Papan menatapmu, muncul meteran 👁 DITATAP dan layar memerah. Kalau meterannya penuh, kamu mati.

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
