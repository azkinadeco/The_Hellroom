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
    seed: 1996, layout: 'school', size: [26, 22], floors: 2, rail: 'parapet',
    lightsOff: 0.14, flicker: 0.12, fog: 0.05,
    fuses: 3, keys: 1, batteries: 4, notes: 3, erasers: 5,
    entities: [{ type: 'pale' }], hallTheme: 'hall',
  },
  {
    id: 2, code: 'LEVEL 1', name: 'Sayap Detensi',
    subtitle: 'Tiga lantai sel mengelilingi satu menara. Penggarisnya berbunyi sebelum ia datang.',
    seed: 451, layout: 'detention', size: [28, 24], floors: 3, rail: 'bars', seeAll: true,
    textures: ['floor_tile', 'floor_tile', 'ceiling_tile', 'cell_wall', 'cell_wall'],
    lightsOff: 0.3, flicker: 0.2, fog: 0.065,
    fuses: 3, keys: 1, batteries: 4, notes: 3, erasers: 5,
    entities: [{ type: 'masked' }], hallTheme: 'hall',
  },
  {
    id: 3, code: 'LEVEL 2', name: 'Rumah Sakit',
    subtitle: 'Jangan berkedip. Di lantai bawah ada hutan.',
    seed: 7031, layout: 'hospital', size: [28, 20], floors: 3, rail: 'bars', seeAll: true,
    textures: ['hosp_floor', 'hosp_floor', 'ceiling_tile', 'hosp_wall', 'hosp_wall'],
    lightsOff: 0.35, flicker: 0.3, fog: 0.06,
    fuses: 4, keys: 1, batteries: 6, notes: 3, erasers: 5,
    entities: [{ type: 'gaper' }], hallTheme: 'hall',
  },
  {
    id: 4, code: 'LEVEL 3', name: 'Mal Tanpa Ujung',
    subtitle: 'Tiga lantai, satu atrium, dan sebuah perumahan yang seharusnya tidak ada di dalamnya.',
    seed: 2207, layout: 'mall', size: [34, 26], floors: 3, theme: 'mall', clean: true, rail: 'glass', seeAll: true,
    lightsOff: 0.45, flicker: 0.18, fog: 0.045, lockerReach: 5,
    fuses: 4, keys: 1, batteries: 7, notes: 3, erasers: 5,
    entities: [{ type: 'shade' }], hallTheme: 'hall',
  },
  {
    id: 5, code: 'LEVEL 4', name: 'Kolam Renang',
    subtitle: 'Lima lantai keramik putih. Satu-satunya jalan cepat ke bawah adalah meluncur.',
    seed: 3112, layout: 'poolrooms', size: [26, 24], floors: 5, theme: 'pool', clean: true, rail: 'parapet', railColor: 0xe9eef0, railCap: 0x5aa6b8, seeAll: true,
    lightsOff: 0.04, flicker: 0.04, fog: 0.028,
    fuses: 4, keys: 1, batteries: 4, notes: 3, erasers: 7,
    entities: [{ type: 'centipede' }], hallTheme: 'hall',
  },
  {
    id: 6, code: 'LEVEL 5', name: 'Ruang Patung',
    subtitle: 'Museum tiga lantai. Mereka tidak bergerak. Mereka hanya menunggu.',
    seed: 1313, layout: 'museum', size: [30, 26], floors: 3, rail: 'parapet', railColor: 0xd9d4c8, railCap: 0x6b5a3e, seeAll: true,
    textures: ['marble', 'marble', 'ceiling_tile', 'gallery_wall', 'gallery_wall'],
    lightsOff: 0.22, flicker: 0.2, fog: 0.05,
    fuses: 4, keys: 2, batteries: 5, notes: 3, erasers: 6, clean: true,
    entities: [{ type: 'eyes' }], hallTheme: 'hall',
  },
];

// Every resident that can appear (Room menu + endless mode).
export const RESIDENTS = ['pale', 'masked', 'gaper', 'shade', 'eyes', 'centipede', 'monitor', 'substitute', 'principal'];

// Endless mode: every floor is a fresh random school that grows harder.
const ENDLESS_NAMES = ['Lorong Basah', 'Sayap Tanpa Jendela', 'Lantai Bawah Tanah', 'Ruang Guru Kosong', 'Koridor Berulang',
  'Lab Kimia Gelap', 'Aula Upacara', 'Perpustakaan Sunyi', 'Gudang Arsip', 'Kantin Tutup', 'Ruang UKS', 'Ruang Musik'];
const ENDLESS_THEMES = [null, null,
  { theme: 'mall', clean: true, mainRooms: ['shop'], bigRooms: ['shop'], smallRooms: ['shop'], labChance: 0 },
  null,
  { theme: 'pool', clean: true, mainRooms: ['pool', 'changing'], bigRooms: ['pool'], smallRooms: ['changing', 'restroom'], lightsOff: 0.05 },
  { theme: 'backroom', clean: true, mainRooms: ['statues', 'shop'], bigRooms: ['statues'], smallRooms: ['statues'] }];
export function endlessDef(floor, seed) {
  const f = floor;
  // one resident per floor, a different one each time
  const entities = [{ type: RESIDENTS[(seed + f * 7) % RESIDENTS.length] }];
  return {
    id: 'endless', endless: true, floor: f,
    code: `LANTAI ${-f}`,
    name: ENDLESS_NAMES[(seed + f) % ENDLESS_NAMES.length],
    subtitle: f === 1 ? 'Tangganya hanya mengarah ke bawah.' : `Kamu sudah turun ${f - 1} lantai.`,
    seed,
    blocksX: Math.min(5, 3 + Math.floor(f / 2)), blocksZ: Math.min(5, 3 + Math.floor(f / 3)),
    lightsOff: Math.min(0.6, 0.15 + f * 0.05), flicker: Math.min(0.4, 0.12 + f * 0.03),
    fog: Math.min(0.08, 0.055 + f * 0.003),
    fuses: Math.min(5, 2 + Math.ceil(f / 2)), keys: Math.min(2, Math.floor(f / 2)), batteries: 4, notes: 2, erasers: 5,
    mergeChance: 0.6,
    bigRooms: ['library', 'studyhall', 'gym'], smallRooms: ['storage', 'office', 'restroom'], labChance: 0.2,
    ...(ENDLESS_THEMES[f % ENDLESS_THEMES.length] || {}),
    entities, tape: false,
  };
}
