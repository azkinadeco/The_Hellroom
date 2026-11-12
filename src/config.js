// Global tuning constants. All distances are in meters, speeds in m/s.
export const CELL = 3;            // grid cell size
export const WALL_H = 3;          // wall / ceiling height
export const WALL_T = 0.2;        // wall thickness
export const DOOR_W = 1.1;        // door opening width
export const DOOR_H = 2.2;
export const BLOCK = 5;           // corridor pitch: corridor every 5 cells -> 4x4 cell rooms

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
  breathDrain: 16,    // per second holding breath (~6s)
  breathRegen: 20,
  batteryDrainLight: 0.55, // % per second
  batteryDrainNV: 1.1,
  reach: 2.3,
};

// Noise radius (meters) emitted by player actions
export const NOISE = {
  walk: 7, sprint: 15, crouch: 2.2, door: 9, locker: 5, pickup: 3, gasp: 9, fuse: 8, throw: 14,
};

export const DIFFICULTY = {
  mudah:  { label: 'Mudah',  speed: 0.85, sight: 0.75, hearing: 0.7, batteries: 1.5 },
  normal: { label: 'Normal', speed: 1.0,  sight: 1.0,  hearing: 1.0, batteries: 1.0 },
  sulit:  { label: 'Sulit',  speed: 1.12, sight: 1.25, hearing: 1.3, batteries: 0.6 },
};

// Level definitions. Layouts are generated from the seed so every run of a
// level is identical (designed feel) unless the player picks "random seed".
export const LEVELS = [
  {
    id: 1,
    code: 'LEVEL 0',
    name: 'Lorong Tak Berujung',
    subtitle: 'Sekolah ini tidak pernah selesai dibangun.',
    seed: 1996,
    blocksX: 3, blocksZ: 3,
    lightsOff: 0.12, flicker: 0.12,
    fog: 0.055,
    fuses: 3, keys: 1, batteries: 3, notes: 3, erasers: 4,
    entities: [{ type: 'monitor' }],
    hallTheme: 'hall',
  },
  {
    id: 2,
    code: 'LEVEL 1',
    name: 'Sayap Detensi',
    subtitle: 'Jangan berkedip. Jangan berpaling.',
    seed: 451,
    blocksX: 4, blocksZ: 3,
    lightsOff: 0.45, flicker: 0.2,
    fog: 0.07,
    fuses: 3, keys: 1, batteries: 4, notes: 3, erasers: 5,
    entities: [{ type: 'substitute' }, { type: 'pupil' }],
    hallTheme: 'hall',
  },
  {
    id: 3,
    code: 'LEVEL 2',
    name: 'Kantor Kepala Sekolah',
    subtitle: 'Semua murid diharap melapor.',
    seed: 7031,
    blocksX: 4, blocksZ: 4,
    lightsOff: 0.35, flicker: 0.35,
    fog: 0.065,
    fuses: 4, keys: 2, batteries: 5, notes: 3, erasers: 6,
    entities: [{ type: 'monitor' }, { type: 'substitute' }, { type: 'pupil' }, { type: 'pupil' }],
    hallTheme: 'hall',
  },
];
