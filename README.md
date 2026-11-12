# THE HELLROOM — Kelas Malam (1996)

Game survival-horror first-person di browser (Three.js) bertema **sekolah liminal tanpa ujung**, bergaya rekaman handycam 1996. Semua model 3D, tekstur, dan gambar menu dibuat lewat **pipeline Blender** (skrip Python, headless).

> Rekaman ini ditemukan di dalam handycam tua di gudang SMA Wijayakusuma. Pemiliknya terakhir terlihat mengikuti "Kelas Malam".

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
| LEVEL 0 | Lorong Tak Berujung | Si Pucat |
| LEVEL 1 | Sayap Detensi | Guru Bertopeng |
| LEVEL 2 | Lab Biologi | Si Penganga |
| LEVEL 3 | Sayap Tanpa Listrik (sangat gelap) | Bayang Kelas |
| LEVEL 4 | Kelas 3-C | Mata Papan |
| LEVEL 5 | Gedung Olahraga (gym, toilet, final) | Kelabang |

**Pilih Room (uji)**: menu khusus pengembangan untuk langsung masuk ke level mana pun. Penghuni bisa diganti (atau dikosongkan untuk jelajah bebas), ada **mode kebal**, dan ada **Galeri Penghuni** untuk memutar model 3D beserta animasinya. Untuk rilis, set `DEV_ROOMS = false` di `src/config.js`, dan menu ini akan hilang.

**Mode Tanpa Ujung**: lantai demi lantai dibuat acak (LANTAI -1, -2, …), makin dalam makin besar dan gelap; tiap lantai dihuni satu penghuni acak. Mati berarti mulai lagi dari -1, dan rekor lantai terdalam tersimpan.

**Kaset rahasia & Arsip**: tiap level story menyimpan satu kaset VHS di salah satu ruangan terjauh. Kaset dan catatan yang sudah ditemukan bisa dibaca ulang di menu **Arsip**.

**Pengumuman pengeras suara**: sesekali bel intercom berbunyi lalu ada pengumuman. Ada yang sekadar menyeramkan, ada yang membocorkan posisimu ke penghuni (sembunyi supaya tidak terlacak), dan ada yang memadamkan listrik ±14 detik.

**Penghuni sekolah** (model 3D dibuat di Blender, `blender/entities3.py`, dari konsep di `Image Aset/`)
- **Si Pucat**: makhluk pucat yang merangkak, tanpa mata, wajahnya cuma satu sobekan vertikal penuh gigi. Ia buta tapi mendengar segalanya. Jongkok aman, sedangkan berlari di dekatnya berarti dikejar.
- **Guru Bertopeng**: guru jangkung bertopeng putih yang membawa penggaris besi. Ia bisa melihat dan mendengar, dan memeriksa loker. Bunyi penggaris diketuk ke telapak tangan menandakan ia dekat.
- **Si Penganga**: makhluk tanpa kulit dengan rahang menganga sampai ke dada. Ia hanya bergerak saat tidak kamu lihat, dan dalam gelap tatapanmu tidak berarti.
- **Bayang Kelas**: asap hitam dengan banyak pasang mata menyala. Ia hanya bisa bergerak di sel yang gelap dan mundur kalau disorot senter. Saat listrik padam, ia bebas ke mana saja.
- **Mata Papan**: gumpalan daging dengan banyak mata dan akar yang tumbuh di papan tulis dan dinding. Kalau kamu berdiri dalam pandangannya, meteran tatapan terisi dan layar mulai bergetar. Suara keras membuatnya pindah ke papan terdekat.
- **Kelabang**: tubuh-tubuh yang menyatu menjadi satu kelabang dengan kumpulan wajah menjerit. Ia melihat ke segala arah tapi jarak pandangnya pendek.
- Penghuni lama (Petugas Ketertiban, Guru Pengganti, Kepala Sekolah, Si Murid) masih muncul di Mode Tanpa Ujung.

**Tempat sembunyi**: loker (mengintip lewat celah) dan bilik toilet (kaki penghuni yang lewat terlihat dari celah bawah pintu).

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
| Tahan napas (di loker) | tahan Spasi | TAHAN NAPAS |
| Tujuan | Tab | — |
| Jeda | Esc | ❚❚ |

## Struktur

```
index.html, css/style.css     UI dan HUD
src/main.js                   boot, menu, save (localStorage)
src/game.js                   state game, loop, mati/menang, loker, sekring
src/config.js                 tuning dan definisi level
src/level/generator.js        generator denah sekolah (seeded)
src/level/map.js              grid + dinding tipis + line-of-sight
src/level/builder.js          mesh dinding/lantai, prop instanced, pintu, item
src/render/bake.js            baked lighting per-vertex (ringan untuk GPU lemah)
src/render/vhs.js             shader handycam VHS
src/ai/entities.js, path.js   AI ketiga penghuni + pathfinding
src/player.js, world.js       gerak, kolisi
src/interact.js, hud.js, audio.js, story.js
blender/                      pipeline aset Blender
assets/                       hasil ekspor Blender
```
