// LEVEL 3 — "Mal Tanpa Ujung", after Pakuwon Mall Surabaya: one long
// boulevard running west to east between two anchors, three voids along it
// (Fashion Atrium, the Grand Atrium with its dry fountain, the East Atrium)
// crossed by criss-cross escalators, glass balustrades on the galleries,
// cinema and food court on the top floor. Everything indoors.
// Wrong in small ways: the mannequins face you, one floor is the same shop
// eight times, an escalator climbs into a wall, the toilet does not end.
//
//   x 1..4 west anchor · 5..30 shops + boulevard · 31..34 east anchor
//   z 1..2 back rooms · 3 service corridor · 4..6 north shops
//   z 7..10 boulevard (voids on the upper floors) · 11..13/14 south shops
//   z 14 (LG) service corridor · 15..16 (LG) back rooms, exit lobby
import { CELL, WALL_T } from '../config.js';
import { LAYOUTS } from './layouts.js';
import { FURNISH, DRESS } from './furnish2.js';
import { roomFrame, yawFor, sideHasDoorNear, aabb } from './generator.js';
import { RNG } from '../util/rng.js';

const SD = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };
const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
const wallOff = WALL_T / 2;
const VOID_ = -2;

// brand plates: background, frame, letters[, font]
const BRAND = {
  'SOGO': ['#f4f1ea', '#c8102e', '#c8102e', 'Georgia, serif'],
  'LOTTE MART': ['#d6001c', '#d6001c', '#ffffff'],
  'MATAHARI': ['#f5f1e6', '#e0581f', '#d0201a'],
  'H&M': ['#ffffff', '#ffffff', '#e50010'],
  'UNIQLO': ['#e60012', '#e60012', '#ffffff'],
  'ZARA': ['#111111', '#111111', '#f0f0f0', 'Georgia, serif'],
  'MARKS & SPENCER': ['#0e3b2e', '#0e3b2e', '#e8e4d8', 'Georgia, serif'],
  'PULL&BEAR': ['#161616', '#161616', '#ffffff'],
  'STRADIVARIUS': ['#ffffff', '#ffffff', '#1a1a1a', 'Georgia, serif'],
  'BERSHKA': ['#111111', '#111111', '#ffffff'],
  'GRAMEDIA': ['#0b4ea2', '#0b4ea2', '#ffffff'],
  'TIMEZONE': ['#1b1464', '#f5c400', '#f5c400'],
  'STARBUCKS': ['#00704a', '#00704a', '#ffffff'],
  'J.CO': ['#4a2c1d', '#e9c46a', '#f2e6c8'],
  'BREADTALK': ['#f2efe6', '#5b3a29', '#5b3a29'],
  'CHATIME': ['#5b2d82', '#5b2d82', '#ffffff'],
  'KOPI KENANGAN': ['#1d1d1b', '#c8a165', '#f2e6c8'],
  'EXCELSO': ['#3b1f14', '#d4b483', '#f0e2c0', 'Georgia, serif'],
  'SOLARIA': ['#c8102e', '#ffd200', '#ffffff'],
  'MINISO': ['#e60033', '#e60033', '#ffffff'],
  'OSINIM': ['#e60033', '#e60033', '#ffffff'],
  'GUARDIAN': ['#ffffff', '#e2001a', '#00337f'],
  'WATSONS': ['#00a0af', '#00a0af', '#ffffff'],
  'SEPHORA': ['#000000', '#000000', '#ffffff'],
  'ERAFONE': ['#ed1c24', '#ed1c24', '#ffffff'],
  'iBOX': ['#f5f5f5', '#bbbbbb', '#222222'],
  'BATA': ['#e2001a', '#e2001a', '#ffffff'],
  'SPORT STATION': ['#111111', '#f39200', '#ffffff'],
  'OPTIK MELAWAI': ['#0d3c84', '#0d3c84', '#ffffff'],
  'CHARLES & KEITH': ['#111111', '#111111', '#e8e8e8', 'Georgia, serif'],
  'CHIPMUNKS': ['#ffde00', '#e30613', '#e30613'],
  'INFORMA': ['#ffffff', '#e30613', '#e30613'],
  'AZKO': ['#e30613', '#e30613', '#ffffff'],
  'CINEMA XXI': ['#111111', '#c9a14a', '#c9a14a'],
  'IMAX': ['#0a0a0a', '#2a6fdb', '#ffffff'],
  'FOOD COURT': ['#141414', '#3fa7b3', '#7fe3ee'],
  'CELEBRITY FITNESS': ['#111111', '#e30613', '#ffffff'],
  'DISEWAKAN': ['#efefe9', '#9a9a92', '#6a6a64'],
};
const brandStyle = (name) => (BRAND[name] || ['#ece6d8', '#a8342c', '#a8342c']).join(',');

function pakuwon(b, rng, def) {
  const [F0, F1, F2] = b.F;
  // shop with a storefront on `side`: glass on every hall-facing edge, an open
  // entrance (two on wide fronts); state 'closed' drops the shutters,
  // 'half' leaves them stuck halfway over the glass, 'dark' kills the lights.
  const shop = (f, x0, z0, x1, z1, name, type, side, state = 'open', o = {}) => {
    const r = f.room(x0, z0, x1, z1, type, { sign: name, mallSign: true, noLock: true, brand: o.brand || name, ...o });
    const d = SD[side], list = [];
    f.edges(r.x0, r.z0, r.x1, r.z1, side, (x, z, s) => { if (f.map.reg(x + d[0], z + d[1]) === 0) list.push({ x, z, s }); });
    r.frontPref = OPP[side];
    if (!list.length) return r;
    const mid = list[Math.floor(list.length / 2)];
    const doors = list.length >= 5 ? [list[1], list[list.length - 2]] : [mid];
    if (o.wide) doors.push(...list);
    r.storefront = { side, list, mid, doors };
    if (state === 'closed') { r.shutters = list; r.noItems = true; r.noLights = true; r.closed = true; return r; }
    for (const e of list) {
      if (doors.includes(e)) f.arch(e.x, e.z, e.s);
      else f.map.glassKeys.add(f.edgeKey(e.x, e.z, e.s));
    }
    if (state === 'half') r.halfShut = true;
    if (state === 'dark') r.dark = true;
    return r;
  };
  const back = (f, x0, z0, x1, z1, type, sign, side, o = {}) => {
    const r = f.room(x0, z0, x1, z1, type, { sign, ...o });
    const cells = [];
    f.edges(r.x0, r.z0, r.x1, r.z1, side, (x, z, s) => { if (f.map.reg(x + SD[s][0], z + SD[s][1]) === 0) cells.push([x, z]); });
    const c = cells[Math.floor(cells.length / 2)];
    r.frontPref = OPP[side];
    // only rooms worth locking get a real door; the rest are open doorways
    if (c && o.door) f.door(r, c[0], c[1], side);
    else if (c) { f.arch(c[0], c[1], side); r.archSign = { x: c[0], z: c[1], s: side }; }
    return r;
  };

  // ---------------------------------------------------------- halls
  for (const f of b.F) { f.hall(5, 7, 30, 10); f.hall(5, 3, 30, 3); f.hall(13, 4, 13, 6); }
  F0.hall(14, 6, 21, 11);            // Grand Atrium plaza
  F0.hall(5, 14, 30, 14);            // south service corridor
  F0.hall(17, 11, 18, 16);           // main lobby to the drop-off doors
  for (const f of [F1, F2]) { f.hall(14, 6, 21, 6); f.hall(14, 11, 21, 11); f.void(15, 7, 20, 10); }
  // Fashion Atrium (west) and East Atrium: slots for the criss-cross escalators
  F1.void(7, 8, 7, 9); F2.void(8, 8, 11, 8); F2.void(11, 9, 11, 9);
  F1.void(24, 8, 24, 9); F2.void(25, 9, 28, 9); F2.void(28, 8, 28, 8);
  b.lift(22, 10, 'N', [0, 1, 2]);

  // ---------------------------------------------------------- LG (F0)
  shop(F0, 1, 1, 4, 16, 'SOGO', 'mdept', 'E', 'open');
  shop(F0, 31, 1, 34, 16, 'LOTTE MART', 'mmarket', 'W', 'open');
  shop(F0, 5, 4, 7, 6, 'J.CO', 'mcafe', 'S');
  shop(F0, 8, 4, 10, 6, 'GUARDIAN', 'mbeauty', 'S', 'half');
  shop(F0, 11, 4, 12, 6, 'ERAFONE', 'mtech', 'S', 'closed');
  shop(F0, 14, 4, 16, 5, 'BREADTALK', 'mcafe', 'S');
  shop(F0, 17, 4, 18, 5, 'DISEWAKAN', 'mvacant', 'S');
  shop(F0, 19, 4, 21, 5, 'WATSONS', 'mbeauty', 'S', 'dark');
  shop(F0, 22, 4, 24, 6, 'STARBUCKS', 'mcafe', 'S');
  shop(F0, 25, 4, 27, 6, 'BATA', 'mshoe', 'S', 'half');
  shop(F0, 28, 4, 30, 6, 'SPORT STATION', 'mfash', 'S');
  shop(F0, 5, 11, 7, 13, 'OPTIK MELAWAI', 'mtech', 'N');
  shop(F0, 8, 11, 10, 13, 'DISEWAKAN', 'mvacant', 'N');
  shop(F0, 11, 11, 13, 13, 'SEPHORA', 'mbeauty', 'N', 'dark');
  shop(F0, 14, 12, 16, 13, 'iBOX', 'mtech', 'N');
  shop(F0, 19, 12, 21, 13, 'CHATIME', 'mcafe', 'N', 'closed');
  shop(F0, 22, 11, 24, 13, 'CHARLES & KEITH', 'mfash', 'N');
  shop(F0, 25, 11, 27, 13, 'SOLARIA', 'mcafe', 'N', 'dark');
  shop(F0, 28, 11, 30, 13, 'KOPI KENANGAN', 'mcafe', 'N', 'closed');
  back(F0, 5, 1, 8, 2, 'mushola', 'MUSHOLA', 'S');
  back(F0, 9, 1, 12, 2, 'moffice', 'KANTOR PENGELOLA', 'S', { door: true });
  back(F0, 14, 1, 17, 2, 'mstore', 'RUANG PANEL', 'S');
  back(F0, 18, 1, 30, 2, 'mstore', 'GUDANG BONGKAR MUAT', 'S', { dark: true, door: true });
  back(F0, 5, 15, 9, 16, 'restroom', 'TOILET', 'N');
  back(F0, 10, 15, 13, 16, 'moffice', 'P3K', 'N');
  back(F0, 14, 15, 16, 16, 'mlost', 'PUSAT ANAK HILANG', 'E');
  back(F0, 19, 15, 21, 16, 'matm', 'ATM CENTER', 'W');
  back(F0, 22, 15, 30, 16, 'mstore', 'GUDANG', 'N', { dark: true, door: true });

  // ---------------------------------------------------------- GF (F1)
  shop(F1, 1, 1, 4, 16, 'SOGO', 'mdept', 'E', 'dark', { crowd: true });
  const mata = shop(F1, 31, 1, 34, 16, 'MATAHARI', 'mdept', 'W', 'open');
  shop(F1, 5, 4, 7, 6, 'ZARA', 'mfash', 'S');
  shop(F1, 8, 4, 10, 6, 'PULL&BEAR', 'mfash', 'S', 'half');
  shop(F1, 11, 4, 12, 6, 'STRADIVARIUS', 'mfash', 'S', 'dark');
  shop(F1, 14, 4, 18, 5, 'H&M', 'mfash', 'S');
  shop(F1, 19, 4, 21, 5, 'BERSHKA', 'mfash', 'S', 'closed');
  shop(F1, 22, 4, 27, 6, 'UNIQLO', 'mfash', 'S');
  shop(F1, 28, 4, 30, 6, 'MARKS & SPENCER', 'mfash', 'S', 'half');
  // the south row is one shop, eight times; the last one reads backwards
  const same = [[5, 7], [8, 10], [11, 13], [14, 16], [17, 18], [19, 21], [22, 24], [25, 27], [28, 30]];
  same.forEach(([a, c], i) => shop(F1, a, a >= 14 && c <= 21 ? 12 : 11, c, 14, i === same.length - 1 ? 'OSINIM' : 'MINISO', 'msame', 'N', 'open', { same: i, mirror: i === same.length - 1 }));
  back(F1, 5, 1, 8, 2, 'mushola', 'RUANG LAKTASI', 'S');
  back(F1, 9, 1, 12, 2, 'mstore', 'GUDANG', 'S', { door: true });
  back(F1, 14, 1, 23, 2, 'mtoilet', 'TOILET', 'S', { noLock: true });
  back(F1, 24, 1, 30, 2, 'mstore', 'GUDANG KEBERSIHAN', 'S');

  // ---------------------------------------------------------- UG (F2)
  const xxi = shop(F2, 1, 6, 4, 11, 'CINEMA XXI', 'mxxi', 'E', 'open');
  const st1 = F2.room(1, 1, 4, 5, 'mstudio', { sign: 'STUDIO 1', dark: true, noLights: true });
  F2.door(st1, 2, 5, 'S');
  const st2 = F2.room(1, 12, 4, 16, 'mstudio', { sign: 'STUDIO 2 — IMAX', dark: true, noLights: true, imax: true });
  F2.door(st2, 2, 12, 'N');
  void xxi;
  shop(F2, 31, 6, 34, 16, 'FOOD COURT', 'mfood', 'W', 'open', { wide: false });
  shop(F2, 5, 4, 10, 6, 'GRAMEDIA', 'mbook', 'S');
  shop(F2, 11, 4, 12, 6, 'KOPI KENANGAN', 'mcafe', 'S', 'dark');
  shop(F2, 14, 4, 16, 5, 'CHIPMUNKS', 'mkids', 'S');
  shop(F2, 17, 4, 18, 5, 'DISEWAKAN', 'mvacant', 'S', 'dark');
  shop(F2, 19, 4, 21, 5, 'EXCELSO', 'mcafe', 'S', 'half');
  shop(F2, 22, 4, 27, 6, 'TIMEZONE', 'marcade', 'S');
  shop(F2, 28, 4, 30, 6, 'CELEBRITY FITNESS', 'mvacant', 'S', 'closed');
  shop(F2, 5, 11, 10, 14, 'INFORMA', 'mhome', 'N');
  shop(F2, 11, 11, 13, 14, 'AZKO', 'mhome', 'N', 'half');
  shop(F2, 14, 12, 16, 14, 'DISEWAKAN', 'mvacant', 'N');
  shop(F2, 17, 12, 18, 14, 'TUTUP', 'mvacant', 'N', 'closed');
  shop(F2, 19, 12, 21, 14, 'CHIPMUNKS', 'mkids', 'N', 'dark');
  shop(F2, 23, 11, 27, 14, 'IMAX', 'mvacant', 'N', 'closed');
  shop(F2, 28, 11, 30, 14, 'SOLARIA', 'mcafe', 'N', 'closed');
  F2.hall(22, 11, 22, 14);
  back(F2, 22, 15, 24, 16, 'mstore', 'GUDANG BIOSKOP', 'N', { dark: true });
  back(F2, 5, 1, 8, 2, 'mstore', 'GUDANG XXI', 'S');
  const start = back(F2, 9, 1, 12, 2, 'msecurity', 'RUANG KEAMANAN', 'S', { noLock: true, door: true });
  back(F2, 14, 1, 18, 2, 'mprojector', 'RUANG PROYEKTOR', 'S', { dark: true, noLights: true, door: true });
  back(F2, 19, 1, 24, 2, 'moffice', 'KANTOR', 'S');
  back(F2, 25, 1, 30, 2, 'mstore', 'GUDANG', 'S');
  // the escalator in Matahari climbs to a floor that is only a wall
  F2.room(33, 1, 33, 1, 'mdead', { sign: null, noItems: true, noLock: true, noLights: true });

  // ---------------------------------------------------------- escalators
  const esc = { escalator: true, mat: 'mall_floor' };
  b.stair(0, 8, 8, 'E', 3, esc);     // Fashion Atrium LG -> GF
  b.stair(1, 10, 9, 'W', 3, esc);    //                 GF -> UG
  b.stair(0, 25, 9, 'E', 3, esc);    // East Atrium     LG -> GF
  b.stair(1, 27, 8, 'W', 3, esc);    //                 GF -> UG
  b.stair(1, 33, 4, 'N', 3, esc);    // Matahari: GF -> nowhere
  void mata;

  // light hung in the voids
  const FH = 3.6;
  b.tallLight(2, 54, 27, 2 * FH + 0.2, { fall: 0.02, reach2: 620, fixture: 'none' });
  for (const x of [46.5, 61.5]) b.tallLight(2, x, 27, 2 * FH + 1.2, { fall: 0.03, reach2: 380, fixture: 'none', state: rng.chance(0.5) ? 'flicker' : 'on' });
  b.tallLight(2, 28.5, 25.5, 2 * FH + 2.6, { fall: 0.04, reach2: 300, fixture: 'lamp', state: 'flicker' });
  b.tallLight(2, 79.5, 25.5, 2 * FH + 2.6, { fall: 0.04, reach2: 300, fixture: 'lamp' });

  // one fixture per 3 x 3 block instead of one per 2 x 2 (the mall is huge)
  for (const f of b.F) for (const r of f.out.rooms) {
    if (r.noLights || r === start || ['stairs', 'lift', 'mdead'].includes(r.type)) continue;
    r.noLights = true;
    const state = r.dark ? 'off' : rng.chance(def.lightsOff) ? 'off' : rng.chance(def.flicker) ? 'flicker' : 'on';
    for (let z = r.z0 + 1; z <= r.z1 + 1; z += 3) for (let x = r.x0 + 1; x <= r.x1 + 1; x += 3) {
      const cx = Math.min(x, r.x1), cz = Math.min(z, r.z1);
      f.light((cx + 0.5) * CELL, (cz + 0.5) * CELL, { state, room: r.id });
    }
  }
  b.start = { k: 2, room: start };
  b.exit = { k: 0, x: 17, z: 16, side: 'S' };
}
LAYOUTS.mall = pakuwon;

// =====================================================================
// furnishing. Shop frame: front = back wall (cashier), v runs towards the
// storefront. Furniture stands on cell corners (u, v = 3, 6, 9 …) so the
// lines through cell centres stay clear for walking and AI paths.
// =====================================================================
function frame(r) {
  const side = r.frontPref || (r.doors[0] ? { W: 'E', E: 'W', N: 'S', S: 'N' }[doorSide(r.doors[0])] : 'N');
  const fr = roomFrame(r, side); r.front = fr;
  const W = fr.width, D = fr.depth;
  const faceIn = yawFor(fr.n[0], fr.n[1]), faceBack = yawFor(-fr.n[0], -fr.n[1]);
  const along = yawFor(fr.alongX ? 1 : 0, fr.alongX ? 0 : 1), across = yawFor(fr.alongX ? 0 : 1, fr.alongX ? 1 : 0);
  return { fr, W, D, faceIn, faceBack, along, across };
}
const doorSide = (d) => (d.inX === 1 ? 'W' : d.inX === -1 ? 'E' : d.inZ === 1 ? 'N' : 'S');
const corners = (len) => { const a = []; for (let u = 3; u < len - 0.5; u += 3) a.push(u); return a; };
function kit(r, f, P) {
  const F = frame(r);
  const inRoom = (x, z) => f.map.reg(...f.map.cellOf(x, z)) === r.id;
  const put = (type, u, v, rot, size, o) => { const [x, z] = F.fr.toWorld(u, v); if (!inRoom(x, z)) return null; P(type, x, z, rot, size, o); return [x, z]; };
  const spot = (u, v, y) => { const [x, z] = F.fr.toWorld(u, v); if (inRoom(x, z)) r.spots.push([x, y, z]); };
  // along a side wall: s = 'L' (u = 0) or 'R' (u = W)
  const sideWall = (s, fn, off = wallOff + 0.3, step = 2.6) => {
    const side = F.fr.alongX ? (s === 'L' ? 'W' : 'E') : (s === 'L' ? 'N' : 'S');
    const sf = roomFrame(r, side);
    for (let u = step > 2 ? 1.5 : 1.0; u < sf.width - 0.7; u += step) {
      if (sideHasDoorNear(r, sf, u - 0.7, u + 0.7)) continue;
      const [x, z] = sf.toWorld(u, off);
      if (inRoom(x, z)) fn(x, z, yawFor(sf.n[0], sf.n[1]), sf, u);
    }
  };
  return { ...F, put, spot, sideWall, inRoom };
}
const MQ = () => 'mannequin';
// window display facing out over the boulevard
function windowDisplay(r, k, rng, n = 2) {
  if (!r.storefront) return;
  const us = [k.W * 0.3, k.W * 0.7, k.W * 0.5].slice(0, n);
  for (const u of us) k.put(MQ(rng), u + rng.range(-0.3, 0.3), k.D - 0.75, k.faceIn + rng.range(-0.2, 0.2), [0.5, 0.5, 1.8]);
}
function cashier(r, k, u = null) {
  const c = k.put('reception_desk', u ?? Math.min(k.W - 1.7, 2.0), 0.45, k.faceIn, [3.0, 0.7, 1.1]);
  if (c) r.spots.push([c[0], 1.14, c[1]]);
}

FURNISH.mfash = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  k.sideWall('L', (x, z, rot) => P(rng.chance(0.5) ? 'store_shelf' : 'clothes_rack', x, z, rot, [1.2, 0.5, 1.8]));
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    const roll = rng.next();
    if (roll < 0.5) k.put('clothes_rack', u, v, rng.range(0, 6), [1.2, 1.2, 1.5]);
    else if (roll < 0.78) k.put(MQ(rng), u, v, k.faceIn + rng.range(-0.4, 0.4), [0.5, 0.5, 1.8]);
    if (rng.chance(0.4)) k.spot(u + 0.8, v - 0.6, 0.02);
  }
  windowDisplay(r, k, rng, k.W > 10 ? 2 : 1);
  k.spot(k.W / 2 + 1.5, 1.5, 0.02);
};
FURNISH.mshoe = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  k.sideWall('L', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  k.sideWall('R', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  for (const v of corners(k.D)) for (const u of corners(k.W)) { k.put('hall_bench', u, v, k.along, [1.6, 0.42, 0.5]); k.spot(u, v, 0.46); }
  // a pair of shoes on the floor in front of each bench, waiting for feet
  for (let i = 0; i < 4; i++) k.put('cardboard_box', rng.range(0.8, k.W - 0.8), rng.range(1.2, 2.2), rng.range(0, 6), [0.6, 0.6, 0.5]);
};
FURNISH.mbeauty = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  k.sideWall('L', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  k.sideWall('R', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    k.put('store_shelf', u, v, rng.chance(0.5) ? k.along : k.across, [1.2, 0.6, 1.6]);
    k.spot(u + 0.7, v + 0.5, 0.02);
  }
  k.put('mannequin', k.W - 1.0, k.D - 0.7, k.faceIn, [0.5, 0.5, 1.8]);
};
FURNISH.mtech = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    const c = k.put('reception_desk', u, v, k.along, [3.0, 0.7, 1.1]);
    if (c) { k.put('crt_tv', u - 0.6, v, k.faceIn + rng.range(-0.3, 0.3), null, { y: 1.12 }); k.spot(u + 0.6, v, 1.14); }
  }
  k.sideWall('L', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
};
FURNISH.mcafe = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (let u = 1.6; u < k.W - 1.2; u += 3) { const c = k.put('reception_desk', u, 0.45, k.faceIn, [3.0, 0.7, 1.1]); if (c) r.spots.push([c[0], 1.14, c[1]]); }
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    k.put('cafe_table', u, v, rng.range(0, 6), [1.0, 1.0, 0.8]);
    k.spot(u + 0.2, v + 0.1, 0.77);
  }
  if (k.D > 6.5) k.put('cafe_table', k.W / 2, k.D - 1.1, rng.range(0, 6), [1.0, 1.0, 0.8]);
};
FURNISH.mvacant = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (let i = 0; i < 3; i++) k.put('cardboard_box', rng.range(0.6, k.W - 0.6), rng.range(0.6, 1.8), rng.range(0, 6), [0.6, 0.6, 0.5]);
  if (r.closed) return;
  // one mannequin left behind, facing the back wall
  k.put('mannequin', k.W / 2 + 0.6, 1.4, k.faceBack, [0.5, 0.5, 1.8]);
  k.spot(1.2, k.D - 1.4, 0.02);
};
FURNISH.mbook = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  k.sideWall('L', (x, z, rot, sf, u) => P('store_shelf', x, z, rot, [1.2, 0.4, 1.8]));
  k.sideWall('R', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.4, 1.8]));
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    k.put('store_shelf', u, v, k.across, [1.2, 0.6, 1.6]);
    k.spot(u, v + 0.8, 0.02);
  }
};
FURNISH.mhome = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k, k.W - 2.0);
  // little rooms laid out on the shop floor, as if someone lives here
  const sets = [['house_sofa', [2.0, 0.85, 0.8], 0.55], ['cafe_table', [1.0, 1.0, 0.8], 0.77], ['house_bed', [1.6, 2.05, 0.7], 0.6]];
  let i = 0;
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    const [t, sz, y] = sets[i++ % sets.length];
    const c = k.put(t, u, v, t === 'house_sofa' ? k.faceIn : t === 'cafe_table' ? 0 : k.along, sz);
    if (c) r.spots.push([c[0], y, c[1]]);
    if (t === 'house_sofa') k.put('crt_tv', u, v + 1.6, k.faceBack, [1.1, 0.45, 1]);
  }
  k.sideWall('L', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
};
FURNISH.mkids = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  k.sideWall('L', (x, z, rot) => P('clothes_rack', x, z, rot, [1.2, 1.2, 1.5]));
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    if (rng.chance(0.4)) k.put('kiddie_ride', u, v, k.faceIn, [1.4, 0.9, 1.0]);
    else k.put('mannequin', u, v, k.faceIn + rng.range(-0.3, 0.3), [0.4, 0.4, 1.2], { scale: 0.62 });
    k.spot(u + 0.9, v - 0.9, 0.02);
  }
  k.put('mannequin', k.W * 0.35, k.D - 0.7, k.faceIn, [0.4, 0.4, 1.2], { scale: 0.62 });
  k.put('mannequin', k.W * 0.65, k.D - 0.7, k.faceIn, [0.4, 0.4, 1.2], { scale: 0.62 });
  k.put('stroller', 1.0, k.D - 1.4, rng.range(0, 6), [0.6, 0.9, 1]);
};
FURNISH.marcade = (r, f, rng, P) => {
  const k = kit(r, f, P);
  cashier(r, k);
  k.sideWall('L', (x, z, rot) => P('arcade_cabinet', x, z, rot, [0.75, 0.8, 2]));
  k.sideWall('R', (x, z, rot) => P('arcade_cabinet', x, z, rot, [0.75, 0.8, 2]));
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    if ((u / 3 + v / 3) % 2) { k.put('arcade_cabinet', u - 0.4, v, k.faceBack, [0.75, 0.8, 2]); k.put('arcade_cabinet', u + 0.4, v, k.faceBack, [0.75, 0.8, 2]); }
    else k.put('kiddie_ride', u, v, k.faceIn + rng.range(-0.5, 0.5), [1.4, 0.9, 1.0]);
    k.spot(u + 0.9, v + 1.0, 0.02);
  }
};
FURNISH.mdept = (r, f, rng, P) => {
  const k = kit(r, f, P);
  // cosmetics counters along the back, racks and mannequin islands
  for (let u = 3; u < k.W - 2; u += 9) { const c = k.put('reception_desk', u, 0.45, k.faceIn, [3.0, 0.7, 1.1]); if (c) r.spots.push([c[0], 1.14, c[1]]); }
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    if (r.crowd) { if (rng.chance(0.45)) k.put('mannequin', u + rng.range(-0.2, 0.2), v + rng.range(-0.2, 0.2), k.faceIn + rng.range(-0.6, 0.6), [0.5, 0.5, 1.8]); }
    else if (rng.chance(0.6)) k.put('clothes_rack', u, v, rng.range(0, 6), [1.2, 1.2, 1.5]);
    else if (rng.chance(0.5)) k.put('store_shelf', u, v, k.across, [1.2, 0.6, 1.6]);
    else k.put(MQ(rng), u, v, k.faceIn + rng.range(-0.4, 0.4), [0.5, 0.5, 1.8]);
    if (rng.chance(0.3)) k.spot(u + 0.9, v + 0.9, 0.02);
  }
  k.sideWall('L', (x, z, rot) => P(rng.chance(0.3) ? 'clothes_rack' : 'store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  if (r.crowd) for (let i = 0; i < 4; i++) k.put('clothes_rack', rng.range(1, k.W - 1), k.D - 1.2, rng.range(0, 6), [1.0, 1.0, 1.5]);
  windowDisplay(r, k, rng, 3);
};
FURNISH.mmarket = (r, f, rng, P) => {
  const k = kit(r, f, P);
  // shelf aisles in the back, checkout lanes near the entrance, trolleys
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    if (v > k.D - 4) { if (u % 6 === 3) k.put('checkout_lane', u, v, k.faceIn, [2.0, 0.7, 1.0]); continue; }
    k.put('store_shelf', u, v, k.across, [1.2, 0.6, 1.6]);
    if (rng.chance(0.35)) k.spot(u, v + 1.0, 0.02);
  }
  k.sideWall('L', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  for (let i = 0; i < 5; i++) k.put('shopping_trolley', rng.range(1, k.W - 1), k.D - rng.range(0.8, 2.0), rng.range(0, 6), [0.6, 0.9, 1.0]);
};
FURNISH.mfood = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (let u = 1.6; u < k.W - 1; u += 3) {
    k.put('food_stall', u, wallOff, k.faceIn, null);
    k.spot(u - 0.6, 0.4, 1.08);
  }
  f.out.colliders.push(aabb(...k.fr.toWorld(k.W / 2, 0.4), k.W, 0.8, k.faceIn));
  for (const v of corners(k.D)) for (const u of corners(k.W)) {
    if (v < 2.5) continue;
    k.put('cafe_table', u, v, rng.range(0, 6), [1.0, 1.0, 0.8]);
    if (rng.chance(0.5)) k.spot(u + 0.15, v, 0.77);
  }
  k.sideWall('L', (x, z, rot) => P('food_stall', x, z, rot, null), wallOff, 3);
};
FURNISH.mxxi = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (const u of [3, 9]) { const c = k.put('reception_desk', u, 0.45, k.faceIn, [3.0, 0.7, 1.1]); if (c) r.spots.push([c[0], 1.14, c[1]]); }
  k.put('popcorn_cart', 6, 0.5, k.faceIn, [0.7, 0.5, 1.5]);
  for (const v of corners(k.D)) for (const u of corners(k.W)) { k.put('waiting_chairs', u, v, k.faceBack, [2.2, 0.5, 0.8]); k.spot(u + 1.2, v, 0.02); }
};
FURNISH.mstudio = (r, f, rng, P) => {
  // screen on the wall opposite the door, rows of seats facing it
  const ds = doorSide(r.doors[0]);
  const fr = roomFrame(r, OPP[ds]); r.front = fr;
  const faceIn = yawFor(fr.n[0], fr.n[1]), faceScreen = yawFor(-fr.n[0], -fr.n[1]);
  const at = (u, v) => fr.toWorld(u, v);
  { const [x, z] = at(fr.width / 2, wallOff); P('cinema_screen', x, z, faceIn, null, { y: 0.1 }); }
  for (let v = 3.6; v < fr.depth - 1.4; v += 1.5) for (const u of [fr.width / 2 - 3, fr.width / 2 + 3]) {
    const [x, z] = at(u, v); P('cinema_seats', x, z, faceScreen, [2.4, 0.7, 1.0]);
  }
  for (let i = 0; i < 3; i++) { const [x, z] = at(rng.range(1, fr.width - 1), rng.range(3, fr.depth - 2)); r.spots.push([x, 0.46, z]); }
  // one seat-row, front and centre, already has someone in it
  { const [x, z] = at(fr.width / 2 + 1.5, 2.2); P('mannequin', x, z, faceScreen, [0.5, 0.5, 1.8]); }
};
FURNISH.msame = (r, f, rng, P) => {
  // every one of these shops is furnished from the same seed
  const k = kit(r, f, P);
  const R = new RNG(7777);
  cashier(r, k, 2.0);
  k.sideWall('L', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  k.sideWall('R', (x, z, rot) => P('store_shelf', x, z, rot, [1.2, 0.5, 1.8]));
  k.put('store_shelf', 3, 3, k.across, [1.2, 0.6, 1.6]);
  k.put('mannequin', 1.6, k.D - 0.8, r.mirror ? k.faceBack : k.faceIn, [0.5, 0.5, 1.8]);
  if (k.W > 6.5) k.put('store_shelf', 6, 3, k.across, [1.2, 0.6, 1.6]);
  k.put('cardboard_box', 4.2, 0.9, R.range(0, 6), [0.6, 0.6, 0.5]);
  k.spot(1.5, 4.5, 0.02);
};
FURNISH.mtoilet = (r, f, rng, P) => {
  // stalls along the back wall, all the way, and then some more
  const fr = roomFrame(r, 'N'); r.front = fr;
  const rot = yawFor(fr.n[0], fr.n[1]);
  const out = f.out;
  for (let u = 0.6; u < fr.width - 0.5; u += 0.97) {
    const [x, z] = fr.toWorld(u, wallOff + 0.7);
    out.lockers.push({ kind: 'stall', x, z, rot });
    for (const s of [-1, 1]) { const [px] = fr.toWorld(u + s * 0.47, 0); out.colliders.push({ minX: px - 0.03, maxX: px + 0.03, minZ: z - 0.7, maxZ: z + 0.7, h: 2 }); }
    out.colliders.push({ minX: x - 0.48, maxX: x + 0.48, minZ: z + 0.68 - 0.03, maxZ: z + 0.68 + 0.03, h: 2 });
  }
  const sf = roomFrame(r, 'S');
  for (let u = 4.5; u < sf.width - 1; u += 9) {
    if (sideHasDoorNear(r, sf, u - 1.2, u + 1.2)) continue;
    const [x, z] = sf.toWorld(u, wallOff); P('sink_counter', x, z, yawFor(sf.n[0], sf.n[1]), null);
    out.colliders.push(aabb(...sf.toWorld(u, wallOff + 0.25), 1.6, 0.5, 0));
    r.spots.push([x, 0.9, z - 0.3]);
  }
  for (let i = 0; i < 4; i++) { const [x, z] = fr.toWorld(rng.range(3, fr.width - 3), 4.4); P('wet_floor_sign', x, z, rng.range(0, 6), null); }
  r.spots.push([...(() => { const [x, z] = fr.toWorld(fr.width - 2, 4.5); return [x, 0.02, z]; })()]);
};
FURNISH.mlost = (r, f, rng, P) => {
  const k = kit(r, f, P);
  k.put('info_desk', k.W / 2, 1.0, k.faceIn, [2.6, 0.9, 1.1]);
  k.spot(k.W / 2 - 0.6, 1.0, 1.1);
  k.put('waiting_chairs', 1.6, k.D - 0.6, k.faceBack, [2.2, 0.5, 0.8]);
  k.put('waiting_chairs', k.W - 1.6, k.D - 0.6, k.faceBack, [2.2, 0.5, 0.8]);
  // the children are still waiting to be picked up
  for (const u of [1.0, 2.0, k.W - 2.2, k.W - 1.2]) k.put('mannequin', u, k.D - 0.75, k.faceBack, [0.35, 0.35, 1.2], { scale: 0.58 });
  k.put('stroller', 1.0, 2.6, rng.range(0, 6), [0.6, 0.9, 1]);
  k.put('stroller', k.W - 1.2, 2.8, rng.range(0, 6), [0.6, 0.9, 1]);
  k.put('crt_tv', 0.6, 0.4, k.faceIn, [1.1, 0.45, 1]);
  k.spot(k.W / 2 + 1.5, 3.0, 0.02);
};
FURNISH.matm = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (let u = 1.2; u < k.W - 0.5; u += 1.4) k.put('info_totem', u, 0.35, k.faceIn, [0.7, 0.3, 2]);
  k.spot(k.W / 2, 3.0, 0.02);
};
FURNISH.msecurity = (r, f, rng, P) => {
  const k = kit(r, f, P);
  // a wall of CCTV monitors over the desk, every screen a different corridor
  for (let u = 2.4; u <= k.W - 2; u += 1.2) k.put('crt_tv', u, 0.35, k.faceIn + (u > 7 ? 0.15 : 0), [1.1, 0.45, 1]);
  k.put('reception_desk', k.W / 2, 1.6, k.faceBack, [3.0, 0.7, 1.1]);
  k.spot(k.W / 2 - 0.4, 1.6, 0.79);
  k.spot(k.W / 2 + 0.4, 1.6, 0.79);
  k.put('waiting_chairs', k.W - 2.0, k.D - 0.5, k.faceBack, [2.2, 0.5, 0.8]);
  k.spot(k.W - 1.4, 3.6, 0.02);
};
FURNISH.mprojector = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (let u = 2; u < k.W - 1; u += 4) { k.put('popcorn_cart', u, 0.5, k.faceIn, [0.7, 0.5, 1.5]); k.put('cardboard_box', u + 1.5, 0.6, rng.range(0, 6), [0.6, 0.6, 0.5]); }
  k.spot(k.W / 2, 3.5, 0.02);
};
FURNISH.mushola = (r, f, rng, P) => {
  const k = kit(r, f, P);
  k.put('store_shelf', 1.0, k.D - 0.5, k.faceBack, [1.2, 0.5, 1.8]);
  k.put('hall_bench', k.W - 2, k.D - 0.5, k.faceBack, [1.6, 0.42, 0.5]);
  k.spot(k.W / 2, 2.0, 0.02);
};
FURNISH.mdead = () => {};
FURNISH.mstore = (r, f, rng, P) => {
  const k = kit(r, f, P);
  for (let u = 1.5; u < k.W - 1; u += 3.5) k.put('store_shelf', u, wallOff + 0.3, k.faceIn, [1.2, 0.5, 1.8]);
  for (let i = 0; i < Math.min(6, r.w); i++) { const c = k.put('cardboard_box', rng.range(0.6, k.W - 0.6), rng.range(1.0, 2.2), rng.range(0, 6), [0.6, 0.6, 0.5]); if (c && i < 2) r.spots.push([c[0], 0.52, c[1]]); }
  k.spot(k.W / 2, k.D / 2, 0.02);
};
FURNISH.moffice = (r, f, rng, P) => {
  const k = kit(r, f, P);
  k.put('reception_desk', k.W / 2, 1.4, k.faceBack, [3.0, 0.7, 1.1]);
  k.spot(k.W / 2 - 0.5, 1.4, 1.14);
  k.put('store_shelf', 0.8, wallOff + 0.3, k.faceIn, [1.2, 0.5, 1.8]);
  k.put('waiting_chairs', k.W - 1.6, k.D - 0.5, k.faceBack, [2.2, 0.5, 0.8]);
  k.spot(1.4, k.D - 1.4, 0.02);
};

// =====================================================================
// level dressing: brand signs, shutters, the atrium, the boulevard
// =====================================================================
DRESS.pakuwon = (f, rng, reserved) => {
  const m = f.map, out = f.out, k = f.k;
  const P = (type, x, z, rot, size, o) => f.prop(type, x, z, rot, size, o);
  const edgePos = (e, off) => { const d = SD[e.s], [cx, cz] = m.center(e.x, e.z); return [cx + d[0] * (CELL / 2 + off), cz + d[1] * (CELL / 2 + off), yawFor(d[0], d[1])]; };
  for (const r of out.rooms) {
    if (r.archSign && r.sign) { const [x, z, rot] = edgePos(r.archSign, wallOff + 0.01); out.signs.push({ x, z, y: 2.42, rot, text: r.sign }); }
    if (!r.storefront) continue;
    const { list, doors } = r.storefront;
    const big = list.length >= 5;
    // one plate centred on the front (plus one over each entrance on long anchors)
    const p0 = edgePos(list[0], wallOff + 0.02), p1 = edgePos(list[list.length - 1], wallOff + 0.02);
    const at = [[(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, p0[2]]];
    if (big && list.length >= 8) for (const e of doors) at.push(edgePos(e, wallOff + 0.02));
    for (const [x, z, rot] of at) {
      const dead = r.dark || r.closed;
      out.signs.push({ x, z, y: 2.78, rot, text: r.sign, w: big ? 3.6 : 2.7, h: big ? 0.5 : 0.42, style: brandStyle(r.brand), glow: !dead });
    }
    if (r.closed) for (const e of list) { const [x, z, rot] = edgePos(e, wallOff); P('rolling_shutter', x, z, rot, null); }
    else if (r.halfShut) for (const e of list) if (!doors.includes(e)) { const [x, z, rot] = edgePos(e, wallOff + 0.05); P('shutter_half', x, z, rot, null); }
  }
  // ---- level markers by the escalators and the lift
  const lvl = ['LG', 'GF', 'UG'][k];
  for (const [x, z, rot] of [[22 * CELL + 1.5, 10 * CELL + 0.01, Math.PI], [13 * CELL + 0.11, 4 * CELL + 1.5, Math.PI / 2]])
    out.signs.push({ x, z, y: 2.5, rot, text: 'LANTAI ' + lvl, w: 1.6, h: 0.36, style: 'neon', glow: true });
  // ---- benches and banners along the glass balustrades
  for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
    if (m.reg(x, z) !== 0 || k === 0) continue;
    for (const d of Object.values(SD)) {
      if (m.reg(x + d[0], z + d[1]) !== VOID_) continue;
      const [cx, cz] = m.center(x, z);
      if ((x + z * 3) % 5 === 0) P('hall_bench', cx - d[0] * 0.6, cz - d[1] * 0.6, yawFor(-d[0], -d[1]) + Math.PI, [1.6, 0.42, 0.5]);
      else if ((x * 7 + z) % 6 === 0) P('sale_banner', cx + d[0] * (CELL / 2 + 0.12), cz + d[1] * (CELL / 2 + 0.12), yawFor(d[0], d[1]), null, { y: -0.05 });
      break;
    }
  }
  // ---- the boulevard: planters on cell corners, directory totems, things left behind
  const corner = (x, z) => [x * CELL, z * CELL];
  if (k === 0) {
    for (const x of [6, 12, 29]) { const [px, pz] = corner(x, 9); if (!blockedAt(f, px, pz)) P('planter_bench', px, pz, 0, [1.9, 1.9, 0.5]); }
    P('info_totem', 13 * CELL + 1.5, 9 * CELL, Math.PI / 2, [0.7, 0.3, 2]);
    P('info_totem', 23 * CELL - 1.5 + 0.3, 8 * CELL, -Math.PI / 2, [0.7, 0.3, 2]);
    // Grand Atrium: the dry fountain, the event stage nobody took down, the info desk
    P('fountain_basin', 54, 28.5, 0, null);
    P('atrium_stage', 54, 20.6, 0, [6.0, 2.4, 0.5]);
    for (const [x, z, rot] of [[54, 27, 0], [51, 30, Math.PI / 2], [57, 30, -Math.PI / 2], [54, 30, Math.PI]]) P('mannequin', x, z, rot, [0.45, 0.45, 1.8]);
    P('info_desk', 48, 33, Math.PI * 0.75, [2.6, 0.9, 1.1]);
    out.signs.push({ x: 48.9, z: 33.9, y: 2.3, rot: Math.PI * 0.75 + Math.PI, text: 'INFORMASI', w: 1.8, h: 0.34, style: 'neon', glow: true });
    out.signs.push({ x: 54, z: 19.42, y: 2.35, rot: 0, text: 'MIDNIGHT SALE — TIDAK ADA YANG PULANG', w: 4.8, h: 0.5, style: '#7a1414,#e8c25a,#f4e6c0', glow: true });
    P('stroller', 50.6, 34.4, 2.2, [0.6, 0.9, 1]);
    P('stroller', 60.2, 23.1, 0.4, [0.6, 0.9, 1]);
    P('kiddie_ride', 66 - 0.9, 34.5, -Math.PI / 2, [1.4, 0.9, 1]);
    // lobby: the doors out are at the end of this
    out.signs.push({ x: 52.5, z: 50.88, y: 2.75, rot: Math.PI, text: 'PINTU KELUAR — LOBI SELATAN', w: 3.2, h: 0.4, style: '#0d5a2a,#0d5a2a,#e8f4e8', glow: true });
    P('wet_floor_sign', 33.0, 43.2, 0.6, null);
    P('wet_floor_sign', 75.0, 10.4, 2.1, null);
  }
  if (k === 1) {
    P('info_totem', 13 * CELL + 1.5, 9 * CELL, Math.PI / 2, [0.7, 0.3, 2]);
    P('stroller', 30 * CELL, 7.5 * CELL, 1.3, [0.6, 0.9, 1]);
    P('wet_floor_sign', 40.5, 10.5, 0.3, null);
    out.signs.push({ x: 13 * CELL + 1.5, z: 3 * CELL + 0.11, y: 2.4, rot: 0, text: 'TOILET  >>>', w: 1.6, h: 0.32, style: 'neon', glow: true });
  }
  if (k === 2) {
    P('atrium_chandelier', 54, 27, 0, null, { y: -0.2 });
    P('info_totem', 23 * CELL - 1.2, 9 * CELL, -Math.PI / 2, [0.7, 0.3, 2]);
    P('popcorn_cart', 5 * CELL + 1.0, 6 * CELL + 1.2, Math.PI / 2, [0.7, 0.5, 1.5]);
    out.signs.push({ x: 5 * CELL + 0.11, z: 5 * CELL + 1.5, y: 2.5, rot: Math.PI / 2, text: 'NOW SHOWING: —', w: 2.4, h: 0.4, style: '#0a0a0a,#c9a14a,#e8d8a8', glow: true });
  }
  // the escalator that climbs into a wall
  const dead = out.rooms.find((r) => r.type === 'mdead');
  if (dead) out.signs.push({ x: 33 * CELL + 1.5, z: 1 * CELL - 0 + wallOff + 0.02, y: 1.7, rot: 0, text: 'LANTAI INI BELUM DIBUKA', w: 2.4, h: 0.4, style: '#efe9d8,#a8342c,#a8342c', glow: false });
  void reserved; void rng;
};
function blockedAt(f, x, z) { const r = f.map.reg(...f.map.cellOf(x, z)); return r !== 0; }
