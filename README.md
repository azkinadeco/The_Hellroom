# THE HELLROOM (The Clean Rooms: Limbo of the Purified)

Sebuah game survival horror first-person berbasis WebGL (Three.js) yang terinspirasi kuat oleh *The Classrooms*, dengan konsep unik **"ruangan dari neraka yang bersih dan janggal"** (Sterile Limbo). 

Game ini dapat dimainkan langsung di browser PC, Mac, iPhone (iOS Safari), dan Android (Chrome) dengan tampilan fullscreen tanpa UI yang mengganggu, bernuansa rekaman pita magnetik **1996 Camcorder Found Footage**.

---

## 🎮 Fitur Gameplay Khas *The Classrooms*

1. **Sistem Persembunyian Loker & Tahan Nafas (*Breath-Holding*):**
   - Bersembunyi di dalam loker logam medis saat anomali mendekat.
   - Mengintip lorong melalui 4 celah teralis horizontal (*louvers*).
   - Tahan nafas (`[SPACE]` / tombol `NAFAS`) agar detak jantung dan nafas terengah-engah tidak didengar oleh entitas.
2. **Terminal Pengawas CCTV Interaktif (*Security Surveillance*):**
   - Konsol workstation CRT retro di ruang sekuriti untuk memantau 4 kamera lorong secara real-time.
   - Pantau posisi monster berpatroli sebelum Anda melangkah keluar.
3. **Audio Spasial 3D HRTF & Camcorder Decibel VU Meter:**
   - Suara langkah kaki, derak tulang, cipratan air, dan pecahan cangkir diproses secara spasial 3D binarual (kiri/kanan headphone).
   - Meteran desibel suara real-time (`[MIC ▮▮▮▯▯▯▯ -24dB]`) mendeteksi suara langkah/lari Anda.
4. **Fisika Lempar Cangkir Porselen (*Distraction Lure*):**
   - Ambil cangkir porselen di meja dan lemparkan ke dinding untuk memecahkannya dan mengalihkan perhatian monster.
5. **Night-Vision IR Mode:**
   - Mode spektrum inframerah untuk menavigasi lorong gelap tanpa menyalakan lampu senter yang memicu agresi monster.
6. **Mekanika Klasik:**
   - Deteksi mikrofon / peluit umpan suara akustik.
   - Glowstick penanda jalur labirin (3x).
   - Pintu fisik berengsel interaktif.
   - Pengurasan baterai senter & stamina lari.

---

## 🏛️ 5 Tingkatan Level (Level Design)

- **Level 1: Sanatorium Klinis** — Labirin keramik putih, meja bedah, kunci otoritas, The Contortionist & Clean Mannequin.
- **Level 2: Abyssal Obsidian Baths** — Kolam purgatori marmer hitam, air kristal terendam, katup kuningan & The Gilded Diver.
- **Level 3: Perpustakaan Arsip Monolitik** — Aula kubah 6-meter, monolit melayang, 3 kaset master evakuasi & SCP-9921 Static Seraph.
- **Level 4: Sector 0 - The Pure Core** — Katedral marmer putih 8-meter tanpa cela, 3 Purity Primers, Lift Evakuasi Dimensi Pusat, dan entitas tertinggi **SCP-000: The Architect of Purity**.
- **Level 5: Purgatori Cermin Sejati** — Dimensi marmer cermin, bayangan kembar Doppelganger, 3 Fragmen Cermin Jiwa, dan Gerbang Kenaikan Terakhir.

---

## 🎨 12 Blender 3D PBR Models

Semua model 3D diekspor ke format `.glb` dan dirender dengan Three.js PCF Soft Shadow Mapping:
- `metal_locker.glb` — Loker persembunyian isolasi
- `cctv_terminal.glb` — Terminal monitor CRT CCTV
- `scp_architect.glb` — Entitas berhalo emas Level 4
- `purity_primer.glb` — Silinder pendingin dekontaminasi
- `scp_contortionist.glb` — Monster porselen merayap
- `clean_mannequin.glb` — Manekin sendi kuningan
- `gilded_diver.glb` — Monster penyelam helm tembaga
- `static_seraph.glb` — Entitas cincin pemancar statis
- `surgical_table.glb` — Meja operasi hidrolik
- `valve_wheel.glb` — Katup pembuangan air industri
- `archive_cabinet.glb` — Lemari arsip logam
- `porcelain_mug.glb` — Cangkir porselen lempar

---

## 🚀 Cara Menjalankan Game Secara Lokal

Cukup jalankan web server sederhana di folder ini:

```bash
# Menggunakan Python 3
python3 -m http.server 8080

# Buka browser
http://localhost:8080/
```

Untuk iPhone/Android di jaringan WiFi yang sama, buka `http://<IP_KOMPUTER>:8080/`.

---

## 🕹️ Panduan Kontrol

| Aksi | PC / Komputer | Mobile / Smartphone |
| :--- | :--- | :--- |
| **Bergerak** | `W` `A` `S` `D` | Joystick Analog Virtual Kiri |
| **Kamera** | Gerakan Mouse | Usap Layar Kanan |
| **Interaksi / Loker / CCTV** | `E` / Klik Retikel | Tombol `AKSI` |
| **Tahan Nafas (di Loker)** | Tahan `SPACE` | Tombol `NAFAS` |
| **Ganti Kamera (di CCTV)** | `A` / `D` (atau `←` `→`) | Tombol `< CAM` / `CAM >` |
| **Lempar Cangkir** | Klik Kanan | Tombol `LEMPAR` |
| **Night-Vision IR / Thermal** | `N` | Tombol `MODE` |
| **Bersiul (Umpan)** | `T` | Tombol `SIUL` |
| **Jatuhkan Glowstick** | `G` | Tombol `GLOW` |
| **Kocok Senter (Dynamo)** | `X` | Tombol `KOCOK` |
| **Denah Arsitektur (CAD)** | `M` | Tombol `DENAH` |
| **Kapur Penanda Luminesen** | `Q` | Tombol `KAPUR` |
| **Sprint** | `SHIFT` | Tombol `LARI` |
| **Senter ON/OFF** | `F` | Tombol `SENTER` |
| **Jongkok (Stealth)** | `C` | Tombol `JONGKOK` |
| **Sonar Radar 18M** | `R` | Tombol `RADAR` |
| **Zoom Lensa 2.5x** | `Z` | Tombol `ZOOM` |
