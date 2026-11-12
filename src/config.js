// Global tuning constants. All distances are in meters, speeds in m/s.
export const CELL = 3;            // grid cell size
export const WALL_H = 3;          // wall / ceiling height
export const WALL_T = 0.2;        // wall thickness
export const DOOR_W = 1.1;        // door opening width
export const DOOR_H = 2.2;
export const BLOCK = 5;
export const POOL_Y = 0.42;      // water surface height in pool rooms           // corridor pitch: corridor every 5 cells -> 4x4 cell rooms

export const PLAYER = {
  radius: 0.3,
  eye: 1.62,
  eyeCrouch: 0.95,
  walk: 2.9,
  sprint: 5.0,
  crouch: 1.4,
  accel: 14,
  staminaMax: 100,
  staminaDrain: 22,   // per second sprinting
  staminaRegen: 14,
  breathMax: 100,
  breathDrain: 12,    // per second holding breath (~8s)
  breathRegen: 20,
  batteryDrainLight: 0.55, // % per second
  batteryDrainNV: 1.1,
  reach: 2.3,
};

// Noise radius (meters) emitted by player actions
export const NOISE = {
  walk: 7, sprint: 15, crouch: 2.2, splash: 11, door: 9, locker: 5, pickup: 3, gasp: 9, fuse: 8, throw: 14,
};

// Hideable spots: distances along the front direction (metres)
export const HIDE = {
  locker: { front: 0.3, cam: 0.34, exit: 0.85, inspect: 1.0, open: -1.6, pitch: [-0.35, 0.3], label: 'loker' },
  stall:  { front: 0.7, cam: -0.12, exit: 1.25, inspect: 1.35, open: -1.6, pitch: [-0.9, 0.3], label: 'bilik' },
};

export const DIFFICULTY = {
  mudah:  { label: 'Mudah',  speed: 0.85, sight: 0.75, hearing: 0.7, batteries: 1.5 },
  normal: { label: 'Normal', speed: 1.0,  sight: 1.0,  hearing: 1.0, batteries: 1.0 },
  sulit:  { label: 'Sulit',  speed: 1.12, sight: 1.25, hearing: 1.3, batteries: 0.6 },
};

// Test rooms in the main menu (Pilih Room): every map playable, resident
// override and invulnerability. Pilih Level itself stays unlocked in order. Set to false for the public release.
export const DEV_ROOMS = true;

// Level definitions. Every level has exactly ONE resident. Layouts are
// generated from the seed so every run of a level is identical.
export const LEVELS = [
  {
    id: 1, code: 'LEVEL 0', name: 'Sekolah Malam',
    subtitle: 'Dua lantai, satu lapangan, dan tidak ada yang pulang.',
    tint: [1.02, 0.95, 0.8], fogColor: 0x080806, grade: [1.03, 1.0, 0.94], seed: 1996, layout: 'school', size: [26, 22], floors: 2, rail: 'parapet',
    lightsOff: 0.14, flicker: 0.12, fog: 0.05,
    fuses: 3, keys: 1, batteries: 4, notes: 3, erasers: 5,
    entities: [{ type: 'pale' }], hallTheme: 'hall',
  },
  {
    id: 2, code: 'LEVEL 1', name: 'Sayap Detensi',
    subtitle: 'Tiga lantai sel mengelilingi satu menara. Penggarisnya berbunyi sebelum ia datang.',
    tint: [0.82, 0.92, 1.04], fogColor: 0x05070a, grade: [0.94, 0.99, 1.06], seed: 451, layout: 'detention', size: [28, 24], floors: 3, rail: 'bars', seeAll: true,
    textures: ['floor_tile', 'floor_tile', 'ceiling_tile', 'cell_wall', 'cell_wall'],
    lightsOff: 0.3, flicker: 0.2, fog: 0.065,
    fuses: 3, keys: 1, batteries: 4, notes: 3, erasers: 5,
    entities: [{ type: 'masked' }], hallTheme: 'hall',
  },
  {
    id: 3, code: 'LEVEL 2', name: 'Rumah Sakit',
    subtitle: 'Jangan berkedip. Di lantai bawah ada hutan.',
    tint: [0.92, 1.0, 0.93], fogColor: 0x050806, grade: [0.97, 1.02, 0.98], seed: 7031, layout: 'hospital', size: [28, 20], floors: 3, rail: 'bars', seeAll: true,
    textures: ['hosp_floor', 'hosp_floor', 'ceiling_tile', 'hosp_wall', 'hosp_wall'],
    lightsOff: 0.35, flicker: 0.3, fog: 0.06,
    fuses: 4, keys: 1, batteries: 6, notes: 3, erasers: 5,
    entities: [{ type: 'gaper' }], hallTheme: 'hall',
  },
  {
    id: 4, code: 'LEVEL 3', name: 'Mal Tanpa Ujung',
    subtitle: 'Tiga lantai, satu atrium, dan sebuah perumahan yang seharusnya tidak ada di dalamnya.',
    tint: [1.02, 0.97, 0.9], fogColor: 0x0a0807, grade: [1.03, 0.99, 0.96], seed: 2207, layout: 'mall', size: [34, 26], floors: 3, theme: 'mall', clean: true, rail: 'glass', seeAll: true,
    lightsOff: 0.45, flicker: 0.18, fog: 0.045, lockerReach: 5,
    fuses: 4, keys: 1, batteries: 7, notes: 3, erasers: 5,
    entities: [{ type: 'shade' }], hallTheme: 'hall',
  },
  {
    id: 5, code: 'LEVEL 4', name: 'Kolam Renang',
    subtitle: 'Lima lantai keramik putih. Satu-satunya jalan cepat ke bawah adalah meluncur.',
    tint: [0.92, 1.0, 1.04], fogColor: 0x0c1416, grade: [0.96, 1.02, 1.05], seed: 3112, layout: 'poolrooms', size: [26, 24], floors: 5, theme: 'pool', clean: true, rail: 'parapet', railColor: 0xe9eef0, railCap: 0x5aa6b8, seeAll: true,
    lightsOff: 0.04, flicker: 0.04, fog: 0.028,
    fuses: 4, keys: 1, batteries: 4, notes: 3, erasers: 7,
    entities: [{ type: 'centipede' }], hallTheme: 'hall',
  },
  {
    id: 6, code: 'LEVEL 5', name: 'Ruang Patung',
    subtitle: 'Museum tiga lantai. Mereka tidak bergerak. Mereka hanya menunggu.',
    tint: [1.06, 0.94, 0.78], fogColor: 0x0a0705, grade: [1.05, 0.99, 0.92], seed: 1313, layout: 'museum', size: [30, 26], floors: 3, rail: 'parapet', railColor: 0xd9d4c8, railCap: 0x6b5a3e, seeAll: true,
    textures: ['marble', 'marble', 'ceiling_tile', 'gallery_wall', 'gallery_wall'],
    lightsOff: 0.22, flicker: 0.2, fog: 0.05,
    fuses: 4, keys: 2, batteries: 5, notes: 3, erasers: 6, clean: true,
    entities: [{ type: 'eyes' }], hallTheme: 'hall',
  },
];

// Every resident that can appear (Room menu + endless mode).
export const RESIDENTS = ['pale', 'masked', 'gaper', 'shade', 'eyes', 'centipede', 'monitor', 'substitute', 'principal'];

// Endless mode: every floor is a fresh random multi-storey building
// (src/level/layouts.js `endless`) that grows bigger, taller and harder.
const ENDLESS_NAMES = ['Lorong Basah', 'Sayap Tanpa Jendela', 'Lantai Bawah Tanah', 'Ruang Guru Kosong', 'Koridor Berulang',
  'Lab Kimia Gelap', 'Aula Upacara', 'Perpustakaan Sunyi', 'Gudang Arsip', 'Kantin Tutup', 'Ruang UKS', 'Ruang Musik',
  'Bangsal Kosong', 'Galeri Tanpa Wajah', 'Kolam Dalam', 'Sel Nomor Nol', 'Lantai Kuning'];
const ENDLESS_STYLE_ORDER = ['school', 'hospital', 'detention', 'pool', 'museum', 'backroom'];
const ENDLESS_LOOK = {
  school: { rail: 'parapet', dress: 'school', tint: [1.02, 0.95, 0.8], fogColor: 0x080806, grade: [1.03, 1.0, 0.94] },
  hospital: { rail: 'bars', dress: 'hospital', tint: [0.92, 1.0, 0.93], fogColor: 0x050806, grade: [0.97, 1.02, 0.98], textures: ['hosp_floor', 'hosp_floor', 'ceiling_tile', 'hosp_wall', 'hosp_wall'] },
  detention: { rail: 'bars', tint: [0.82, 0.92, 1.04], fogColor: 0x05070a, grade: [0.94, 0.99, 1.06], textures: ['floor_tile', 'floor_tile', 'ceiling_tile', 'cell_wall', 'cell_wall'] },
  pool: { rail: 'parapet', theme: 'pool', tint: [0.92, 1.0, 1.04], fogColor: 0x0c1416, grade: [0.96, 1.02, 1.05], clean: true, railColor: 0xe9eef0, railCap: 0x5aa6b8 },
  museum: { rail: 'parapet', clean: true, tint: [1.06, 0.94, 0.78], fogColor: 0x0a0705, grade: [1.05, 0.99, 0.92], railColor: 0xd9d4c8, railCap: 0x6b5a3e, textures: ['marble', 'marble', 'ceiling_tile', 'gallery_wall', 'gallery_wall'] },
  backroom: { rail: 'parapet', theme: 'backroom', tint: [1.05, 1.0, 0.72], fogColor: 0x0b0a05, grade: [1.04, 1.02, 0.88], clean: true, railColor: 0xc9b98a, railCap: 0x8a7a4a },
};
export function endlessDef(floor, seed) {
  const f = floor;
  let st = (seed * 9301 + f * 49297) % 233280;
  const rnd = () => { st = (st * 9301 + 49297) % 233280; return st / 233280; };
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  // one resident per floor, a different one each time
  const entities = [{ type: RESIDENTS[(seed + f * 7) % RESIDENTS.length] }];
  const style = ENDLESS_STYLE_ORDER[(seed + f - 1) % ENDLESS_STYLE_ORDER.length];
  const band = [ri(3, 4), ri(3, 4)];
  const aw = Math.min(10, 4 + ri(0, Math.min(6, f))), ah = Math.min(8, 4 + ri(0, Math.min(4, f)));
  const floors = Math.min(4, 2 + (f >= 2 ? 1 : 0) + (f >= 5 ? 1 : 0));
  return {
    id: 'endless', endless: true, floor: f,
    code: `LANTAI ${-f}`,
    name: ENDLESS_NAMES[(seed + f) % ENDLESS_NAMES.length],
    subtitle: f === 1 ? 'Tangganya hanya mengarah ke bawah.' : `Kamu sudah turun ${f - 1} lantai.`,
    seed: seed + f * 7919,
    layout: 'endless', style, band, atrium: ri(0, 3), floors, seeAll: true, seeNear: 1,
    size: [aw + band[0] * 2 + 4, ah + band[1] * 2 + 4],
    lightsOff: Math.min(0.6, 0.15 + f * 0.05), flicker: Math.min(0.4, 0.12 + f * 0.03),
    fog: Math.min(0.08, 0.055 + f * 0.003),
    fuses: Math.min(5, 2 + Math.ceil(f / 2)), keys: Math.min(2, Math.floor(f / 2)), batteries: 4, notes: 2, erasers: 5,
    ...ENDLESS_LOOK[style],
    entities, tape: false,
  };
}
