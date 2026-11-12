// Furnishing for the hand-made buildings (building.js). Room-local frame as in
// generator.js: u runs along the front wall, v points into the room.
// Entities walk cell-centre to cell-centre, so furniture keeps the lines at
// u, v = 1.5, 4.5, 7.5 … clear (aisles), and fills the blocks in between.
import { CELL, WALL_T } from '../config.js';
import { DIRS, EDGE } from './map.js';
import { roomFrame, doorSides, sideHasDoorNear, yawFor, aabb } from './generator.js';

const wallOff = WALL_T / 2;

function frameFor(r, rng) {
  const ds = doorSides(r);
  const free = ['N', 'S', 'W', 'E'].filter((s) => !ds.has(s));
  // the board goes on a wall without a door, preferring the long side
  const long = r.w >= r.h ? ['N', 'S'] : ['W', 'E'];
  const pref = free.filter((s) => long.includes(s));
  const side = r.frontPref || (pref.length ? rng.pick(pref) : free.length ? rng.pick(free) : long[0]);
  return roomFrame(r, side);
}

export function furnishExtra(r, f, rng, def) {
  const out = f.out;
  const P = (type, x, z, rot, size, o) => f.prop(type, x, z, rot, size, o);
  switch (r.type) {
    case 'stairs': case 'lift': return true;
    case 'kelas': kelas(r, f, rng, P); return true;
    case 'guru': guru(r, f, rng, P); return true;
    case 'uks': uks(r, f, rng, P); return true;
    case 'kantin': kantin(r, f, rng, P); return true;
    case 'kepsek': kepsek(r, f, rng, P); return true;
    case 'lapangan': lapangan(r, f, rng, P, out); return true;
    case 'ward': case 'icu': case 'igd': ward(r, f, rng, P); return true;
    case 'radiology': radiology(r, f, rng, P); return true;
    case 'pharmacy': pharmacy(r, f, rng, P); return true;
    case 'morgue': morgue(r, f, rng, P); return true;
    case 'surgery': surgery(r, f, rng, P); return true;
    case 'forest': forest(r, f, rng, P); return true;
    case 'shop2': case 'dept': case 'market': case 'cinema': mallShop(r, f, rng, P); return true;
    case 'house': house(r, f, rng, P); return true;
    case 'sel': sel(r, f, rng, P); return true;
    case 'hukuman': hukuman(r, f, rng, P); return true;
    case 'ujian': ujian(r, f, rng, P); return true;
    case 'gallery': gallery(r, f, rng, P); return true;
    case 'vitrine': vitrine(r, f, rng, P); return true;
    case 'exhibit': exhibit(r, f, rng, P); return true;
    case 'statuehall': statuehall(r, f, rng, P); return true;
    case 'street': street(r, f, rng, P); return true;
    case 'flooded': { // a room under knee-deep water and nothing else
      for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (rng.chance(0.35)) r.spots.push([(x + rng.range(0.25, 0.75)) * CELL, 0.03, (z + rng.range(0.25, 0.75)) * CELL]);
      if (!r.spots.length) r.spots.push([r.cx, 0.03, r.cz]);
      return true;
    }
    default: return false;
  }
}

// lockers to hide in, standing against a wall of the room
function locker(r, f, fr, u) {
  if (sideHasDoorNear(r, fr, u - 0.6, u + 0.6)) return false;
  const [x, z] = fr.toWorld(u, wallOff + 0.3);
  const rot = yawFor(fr.n[0], fr.n[1]);
  f.out.lockers.push({ kind: 'locker', x, z, rot });
  f.out.colliders.push(aabb(x, z, 0.62, 0.58, rot));
  return true;
}
const blocks = (len) => { const b = []; for (let a = 1.5; a + 3 <= len + 0.01; a += 3) b.push(a); return b; };

// Indonesian classroom, 1996: board with the national emblem and two framed
// portraits above it, flag in the corner, teacher desk, rows of two-seat desks,
// cabinet and wall magazine at the back, ceiling fans.
function kelas(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]), faceFront = yawFor(-fr.n[0], -fr.n[1]), faceBack = yawFor(back.n[0], back.n[1]);
  const spot = (u, v, y) => { const [x, z] = at(u, v); r.spots.push([x, y, z]); };
  if (!sideHasDoorNear(r, fr, W / 2 - 1.7, W / 2 + 1.7)) {
    const [bx, bz] = at(W / 2, wallOff); P('chalkboard', bx, bz, faceIn, null);
    P('wall_frames', bx, bz, faceIn, null, { y: 2.32 });
  }
  if (!sideHasDoorNear(r, fr, W - 1.2, W)) { const [cx, cz] = at(W - 0.6, wallOff); P('wall_clock', cx, cz, faceIn, null, { y: 2.45 }); }
  if (!sideHasDoorNear(r, fr, 0, 1.1)) { const [x, z] = at(0.45, 0.45); P('flag_stand', x, z, faceIn + 0.6, [0.4, 0.4, 2]); }
  const tu = W > 7 ? W * 0.72 : W / 2;
  { const [x, z] = at(tu, 0.85); P('teacher_desk', x, z, faceIn, [1.5, 0.75, 0.8]); spot(tu - 0.4, 0.85, 0.79); }
  // two-seat desks in the blocks between aisles
  const us = blocks(W).map((a) => a + 1.5), vs = blocks(D);
  for (const va of vs) for (const vr of [0.98, 2.04]) for (const u of us) {
    const v = va + vr;
    if (v > D - 0.9 || rng.chance(0.06)) continue;
    const [x, z] = at(u + rng.range(-0.05, 0.05), v);
    if (rng.chance(0.05)) { P('chair_fallen', x, z, faceFront + rng.range(-1, 1), [0.6, 0.6, 0.5]); continue; }
    P('desk_pair', x, z, faceFront + rng.range(-0.04, 0.04), [1.2, 0.95, 0.8]);
    r.spots.push([...(() => { const [sx, sz] = at(u + rng.range(-0.35, 0.35), v - 0.22); return [sx, 0.73, sz]; })()]);
  }
  // back wall: cabinet, wall magazine, brooms, maybe a locker
  if (!sideHasDoorNear(r, back, 0.2, 1.9)) { const [x, z] = back.toWorld(1.05, wallOff + 0.24); P('class_cabinet', x, z, faceBack, [1.0, 0.48, 1.8]); r.spots.push([x, 1.82, z]); }
  if (!sideHasDoorNear(r, back, W / 2 - 1, W / 2 + 1)) { const [x, z] = back.toWorld(W / 2, wallOff); P('notice_board', x, z, faceBack, null, { y: 1.45 }); }
  if (!sideHasDoorNear(r, back, W - 0.8, W)) { const [x, z] = back.toWorld(W - 0.35, wallOff + 0.2); P('broom_set', x, z, faceBack, [0.4, 0.3, 1.3]); }
  if (rng.chance(0.55)) locker(r, f, back, W - 1.4);
  { const [x, z] = at(0.45, D - 0.45); P('trash_bin', x, z, rng.range(0, 6), [0.4, 0.4, 0.5]); }
  // ceiling fans over the aisles
  for (const u of [W / 3, (2 * W) / 3]) { const [x, z] = at(u, D / 2); P('ceiling_fan', x, z, rng.range(0, 6), null, { y: 3.0, fan: true }); }
}

// teachers' room: desks pushed together in islands, cabinets on the walls
function guru(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]), faceFront = yawFor(-fr.n[0], -fr.n[1]);
  if (!sideHasDoorNear(r, fr, W / 2 - 1.7, W / 2 + 1.7)) { const [bx, bz] = at(W / 2, wallOff); P('chalkboard', bx, bz, faceIn, null); P('wall_clock', bx, bz, faceIn, null, { y: 2.55 }); }
  for (const va of blocks(D)) for (const ua of blocks(W)) {
    if (rng.chance(0.15)) continue;
    const u = ua + 1.5, v = va + 1.5;
    for (const [du, dv, rot] of [[-0.42, -0.4, faceIn], [0.42, -0.4, faceIn], [-0.42, 0.4, faceFront], [0.42, 0.4, faceFront]]) {
      const [x, z] = at(u + du * 1.4, v + dv);
      P('teacher_desk', x, z, rot, null);
    }
    const [cx, cz] = at(u, v); f.out.colliders.push(aabb(cx, cz, 2.0, 1.6, faceIn));
    const [sx, sz] = at(u + rng.range(-0.8, 0.8), v + rng.range(-0.5, 0.5)); r.spots.push([sx, 0.79, sz]);
  }
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  for (const u of [1.0, W - 1.0]) if (!sideHasDoorNear(r, back, u - 0.6, u + 0.6)) { const [x, z] = back.toWorld(u, wallOff + 0.24); P('class_cabinet', x, z, yawFor(back.n[0], back.n[1]), [1.0, 0.48, 1.8]); }
  if (!sideHasDoorNear(r, back, W / 2 - 1, W / 2 + 1)) { const [x, z] = back.toWorld(W / 2, wallOff); P('notice_board', x, z, yawFor(back.n[0], back.n[1]), null, { y: 1.45 }); }
  locker(r, f, back, W / 2 + 1.6);
  if (!r.spots.length) { const [x, z] = at(W / 2, D / 2); r.spots.push([x, 0.02, z]); }
}

// school clinic: beds behind a folding screen, medicine cabinet, desk
function uks(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]);
  const along = yawFor(fr.alongX ? 1 : 0, fr.alongX ? 0 : 1);
  for (const u of [1.5 + 1.5, W - 1.5 - 1.5].filter((q, i, a) => a.indexOf(q) === i && q < W - 1)) {
    if (sideHasDoorNear(r, fr, u - 1.2, u + 1.2)) continue;
    const [x, z] = at(u, 1.05); P('uks_bed', x, z, faceIn, [0.95, 2.0, 0.6]);
    r.spots.push([x, 0.62, z]);
    const [sx, sz] = at(u + 0.95, 1.1); P('folding_screen', sx, sz, along + 0.25, null);
  }
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  if (!sideHasDoorNear(r, back, 0.2, 1.8)) { const [x, z] = back.toWorld(1.0, wallOff + 0.2); P('medicine_cabinet', x, z, yawFor(back.n[0], back.n[1]), [0.9, 0.4, 1.8]); r.spots.push([x, 1.0, z]); }
  if (!sideHasDoorNear(r, back, W - 2.2, W - 0.4)) { const [x, z] = back.toWorld(W - 1.3, 0.8); P('teacher_desk', x, z, yawFor(-back.n[0], -back.n[1]), [1.5, 0.75, 0.8]); r.spots.push([x, 0.79, z]); }
  locker(r, f, back, W / 2);
  { const [x, z] = at(W / 2, D / 2); r.spots.push([x, 0.02, z]); }
}

// canteen: food counter on the front wall, long tables with benches
function kantin(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]);
  for (let u = 1.6; u < W - 1.2; u += 3) {
    if (sideHasDoorNear(r, fr, u - 1.3, u + 1.3)) continue;
    const [x, z] = at(u, 0.4); P('canteen_counter', x, z, faceIn, [2.4, 0.7, 1.0]); r.spots.push([...(() => { const [a, c] = at(u - 0.6, 0.35); return [a, 1.0, c]; })()]);
  }
  const alongRot = yawFor(fr.alongX ? 0 : 1, fr.alongX ? 1 : 0);
  for (const va of blocks(D)) for (const ua of blocks(W)) {
    if (va < 1) continue;
    const [x, z] = at(ua + 1.5, va + 1.5);
    P('canteen_table', x, z, alongRot + (rng.chance(0.2) ? rng.range(-0.15, 0.15) : 0), [0.8, 1.9, 0.8]);
    r.spots.push([x, 0.76, z]);
  }
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  locker(r, f, back, 1.2);
  { const [x, z] = back.toWorld(W - 0.5, 0.5); P('cardboard_box', x, z, rng.range(0, 6), [0.6, 0.6, 0.5]); }
}

// headmaster's office: big desk, flag, emblem, trophies
function kepsek(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]);
  { const [x, z] = at(W / 2, wallOff); P('wall_frames', x, z, faceIn, null, { y: 2.1 }); }
  { const [x, z] = at(W / 2, 1.2); P('teacher_desk', x, z, faceIn, [1.5, 0.75, 0.8]); r.spots.push([x, 0.79, z]); }
  if (!sideHasDoorNear(r, fr, 0, 1.1)) { const [x, z] = at(0.5, 0.5); P('flag_stand', x, z, faceIn + 0.6, [0.4, 0.4, 2]); }
  if (!sideHasDoorNear(r, fr, W - 1.8, W)) { const [x, z] = at(W - 0.9, wallOff + 0.25); P('trophy_case', x, z, faceIn, [1.2, 0.48, 1.9]); }
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  if (!sideHasDoorNear(r, back, 0.3, 2.5)) { const [x, z] = back.toWorld(1.5, wallOff + 0.22); P('hall_bench', x, z, yawFor(back.n[0], back.n[1]), [1.6, 0.42, 0.5]); r.spots.push([x, 0.46, z]); }
  if (!sideHasDoorNear(r, back, W - 2, W - 0.4)) { const [x, z] = back.toWorld(W - 1.2, wallOff + 0.18); P('bookshelf', x, z, yawFor(back.n[0], back.n[1]), [1.2, 0.36, 1.8]); }
  locker(r, f, back, W / 2);
}

// the open-air yard: flagpole, two old trees, benches, lamp posts
function lapangan(r, f, rng, P, out) {
  const x0 = r.x0 * CELL, z0 = r.z0 * CELL, x1 = (r.x1 + 1) * CELL, z1 = (r.z1 + 1) * CELL;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  P('flagpole', cx, cz - 6, 0, [0.5, 0.5, 2]);
  r.spots.push([cx + 0.6, 0.02, cz - 6]);
  for (const [tx, tz] of [[x0 + 6, z0 + 6], [x1 - 6, z1 - 6]]) { P('tree_big', tx, tz, rng.range(0, 6), [1.0, 1.0, 3]); r.spots.push([tx + 1.1, 0.02, tz + 0.4]); }
  for (const [lx, lz] of [[x0 + 6, z1 - 6], [x1 - 6, z0 + 6], [cx, cz + 6]]) {
    P('lamp_post', lx, lz, 0, [0.3, 0.3, 3]);
    f.light(lx, lz, { y: 4.3, fall: 0.06, reach2: 260, fixture: 'none', state: rng.chance(0.25) ? 'flicker' : 'on', tall: true });
  }
  for (const [bx, bz, rot] of [[cx - 7.5, z0 + 0.7, 0], [cx + 7.5, z1 - 0.7, Math.PI], [x0 + 0.7, cz + 4.5, Math.PI / 2], [x1 - 0.7, cz - 4.5, -Math.PI / 2]]) {
    P('hall_bench', bx, bz, rot, [1.6, 0.42, 0.5]); r.spots.push([bx, 0.46, bz]);
  }
  r.spots.push([cx - 4.5, 0.02, cz + 1.5], [cx + 4.5, 0.02, cz - 1.5]);
}

// ------------------------------------------------------------- hospital
const OPPOSITE = { N: 'S', S: 'N', W: 'E', E: 'W' };
// beds lie along the front and back walls (out of the walking lines), each
// with a drip stand; curtains hang between them
function ward(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const back = roomFrame(r, OPPOSITE[fr.side]);
  const W = fr.width;
  const kind = r.type === 'igd' ? 'gurney' : 'hospital_bed';
  for (const wf of [fr, back]) {
    const rotAlong = yawFor(wf.alongX ? 1 : 0, wf.alongX ? 0 : 1);
    for (const ua of blocks(W)) {
      const u = ua + 1.5;
      if (sideHasDoorNear(r, wf, u - 1.4, u + 1.4) || rng.chance(0.12)) continue;
      const [x, z] = wf.toWorld(u, 0.62);
      P(rng.chance(r.type === 'igd' ? 0.3 : 0.08) ? 'gurney_body' : kind, x, z, rotAlong + (rng.chance(0.5) ? Math.PI : 0) + rng.range(-0.04, 0.04), [2.05, 0.95, 0.7]);
      r.spots.push([x, kind === 'gurney' ? 0.92 : 0.64, z]);
      if (rng.chance(0.7)) { const [ix, iz] = wf.toWorld(u + 1.25, 0.35); P('iv_stand', ix, iz, rng.range(0, 6), [0.3, 0.3, 1.9]); }
      if (rng.chance(0.6)) { const [cx, cz] = wf.toWorld(u - 1.45, 1.2); P('ward_curtain', cx, cz, yawFor(wf.alongX ? 0 : 1, wf.alongX ? 1 : 0), null); }
    }
  }
  if (r.type !== 'ward' && !sideHasDoorNear(r, fr, 0, 1.2)) { const [x, z] = fr.toWorld(0.55, 1.6); P('med_cart', x, z, yawFor(fr.n[0], fr.n[1]), [0.6, 0.45, 1]); r.spots.push([x, 0.98, z]); }
  if (rng.chance(0.4)) { const [x, z] = fr.toWorld(W / 2, fr.depth / 2); P('wheelchair', x + rng.range(-0.3, 0.3), z, rng.range(0, 6), null); }
  locker(r, f, back, W - 0.6) || locker(r, f, back, 0.6);
  { const [x, z] = fr.toWorld(W / 2, fr.depth / 2); r.spots.push([x, 0.02, z]); }
}
function radiology(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, faceIn = yawFor(fr.n[0], fr.n[1]);
  for (const u of [W / 2 - 1.2, W / 2 + 1.2]) if (!sideHasDoorNear(r, fr, u - 0.6, u + 0.6)) { const [x, z] = fr.toWorld(u, wallOff); P('xray_viewer', x, z, faceIn, null, { y: 1.6 }); }
  const [tx, tz] = fr.toWorld(3.0, 3.0); P('surgery_table', tx, tz, yawFor(fr.alongX ? 0 : 1, fr.alongX ? 1 : 0), [0.6, 2.0, 0.9]); r.spots.push([tx, 0.9, tz]);
  const [lx, lz] = fr.toWorld(3.0, 3.0); P('surgery_lamp', lx, lz, 0, null, { y: 3.0 });
  const [cx, cz] = fr.toWorld(W - 0.55, D - 0.6); P('med_cart', cx, cz, faceIn, [0.6, 0.45, 1]); r.spots.push([cx, 0.98, cz]);
  const back = roomFrame(r, OPPOSITE[fr.side]); locker(r, f, back, 1.0);
  { const [x, z] = fr.toWorld(W / 2, D - 1.5); r.spots.push([x, 0.02, z]); }
}
function pharmacy(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth;
  for (const wf of [fr, roomFrame(r, OPPOSITE[fr.side])]) {
    const rot = yawFor(wf.n[0], wf.n[1]);
    for (let u = 0.6; u < W - 0.4; u += 1.0) {
      if (sideHasDoorNear(r, wf, u - 0.6, u + 0.6)) continue;
      const [x, z] = wf.toWorld(u, wallOff + 0.2);
      P(rng.chance(0.5) ? 'medicine_cabinet' : 'specimen_shelf', x, z, rot, [0.9, 0.4, 1.8]);
      if (rng.chance(0.3)) r.spots.push([x - wf.n[0] * 0.05, 0.95, z - wf.n[1] * 0.05]);
    }
  }
  for (const ua of blocks(W)) { const [x, z] = fr.toWorld(ua + 1.5, D / 2); P('cardboard_box', x + rng.range(-0.3, 0.3), z, rng.range(0, 6), [0.6, 0.6, 0.5]); r.spots.push([x, 0.52, z]); }
  { const [x, z] = fr.toWorld(W / 2, D / 2 + 1.5); r.spots.push([x, 0.02, z]); }
}
function morgue(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, faceIn = yawFor(fr.n[0], fr.n[1]);
  r.mat = { wall: 'pool_wall', floor: 'floor_tile' };
  for (const ua of blocks(W)) { const u = ua + 1.5; if (sideHasDoorNear(r, fr, u - 1.3, u + 1.3)) continue; const [x, z] = fr.toWorld(u, wallOff + 0.36); P('morgue_drawers', x, z, faceIn, [2.4, 0.72, 2.1]); }
  const along = yawFor(fr.alongX ? 1 : 0, fr.alongX ? 0 : 1);
  for (const va of blocks(D)) for (const ua of blocks(W)) {
    if (va < 1) continue;
    const [x, z] = fr.toWorld(ua + 1.5, va + 1.5);
    P(rng.chance(0.75) ? 'gurney_body' : 'gurney', x, z, along + rng.range(-0.1, 0.1), [2.0, 0.65, 0.9]);
    r.spots.push([x + rng.range(-0.5, 0.5), 0.92, z]);
  }
  const back = roomFrame(r, OPPOSITE[fr.side]); locker(r, f, back, W / 2);
}
function surgery(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth;
  r.mat = { wall: 'pool_wall' };
  const [tx, tz] = fr.toWorld(3.0, 3.0);
  P('surgery_table', tx, tz, yawFor(fr.alongX ? 0 : 1, fr.alongX ? 1 : 0), [0.6, 2.0, 0.9]); r.spots.push([tx, 0.9, tz]);
  P('surgery_lamp', tx, tz, rng.range(0, 6), null, { y: 3.0 });
  const [ix, iz] = fr.toWorld(2.3, 3.6); P('iv_stand', ix, iz, 0, [0.3, 0.3, 1.9]);
  const [cx, cz] = fr.toWorld(W - 0.6, 0.5); P('med_cart', cx, cz, yawFor(fr.n[0], fr.n[1]), [0.6, 0.45, 1]); r.spots.push([cx, 0.98, cz]);
  if (W > 7) { const [gx, gz] = fr.toWorld(6.0, D - 1.0); P('gurney', gx, gz, yawFor(fr.alongX ? 1 : 0, fr.alongX ? 0 : 1), [2.0, 0.65, 0.9]); r.spots.push([gx, 0.92, gz]); }
  const back = roomFrame(r, OPPOSITE[fr.side]); locker(r, f, back, 0.8);
}
// trees grow on the cell corners (never on the walking lines), undergrowth,
// and the ward it used to be: beds and drip stands among the trunks
function forest(r, f, rng, P) {
  const m = f.map, inF = (x, z) => m.reg(x, z) === r.id;
  for (let z = r.z0 + 1; z <= r.z1; z++) for (let x = r.x0 + 1; x <= r.x1; x++) {
    if (!(inF(x, z) && inF(x - 1, z) && inF(x, z - 1) && inF(x - 1, z - 1))) continue;
    const roll = rng.next();
    const px = x * CELL + rng.range(-0.35, 0.35), pz = z * CELL + rng.range(-0.35, 0.35);
    if (roll < 0.42) P('tree_pine', px, pz, rng.range(0, 6), [0.6, 0.6, 3]);
    else if (roll < 0.62) P('tree_dead', px, pz, rng.range(0, 6), [0.6, 0.6, 3]);
    else if (roll < 0.8) P('bush', px, pz, rng.range(0, 6), null);
    else if (roll < 0.86) { P('hospital_bed', px, pz, rng.range(0, 6), [1.2, 1.2, 0.7]); r.spots.push([px, 0.64, pz]); }
    else if (roll < 0.92) P('iv_stand', px, pz, rng.range(0, 6), [0.3, 0.3, 1.9]);
    else if (roll < 0.95) P('wheelchair', px, pz, rng.range(0, 6), [0.6, 0.6, 1]);
    else if (roll < 0.98) { const rot = rng.range(0, 6); f.out.lockers.push({ kind: 'locker', x: px, z: pz, rot }); f.out.colliders.push(aabb(px, pz, 0.62, 0.58, rot)); }
    if (rng.chance(0.25)) r.spots.push([(x - 0.5) * CELL + rng.range(-0.6, 0.6), 0.02, (z - 0.5) * CELL + rng.range(-0.6, 0.6)]);
  }
}

// ------------------------------------------------------------ detention
// is the wall behind frame position u a real wall (not a door, arch or rail)?
function solidWall(r, f, fr, u) {
  const [x, z] = fr.toWorld(u, 0.5);
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  return f.map.edge(cx, cz, DIRS[{ E: 0, W: 1, S: 2, N: 3 }[fr.side]]) === EDGE.WALL;
}
const FIG = ['figure_stand', 'figure_stand', 'figure_reach', 'figure_kneel'];
// one-cell detention cell: bunk on one wall, a desk facing another, the
// same line written on a small board over and over
function sel(r, f, rng, P) {
  const ds = doorSides(r);
  const free = ['N', 'S', 'W', 'E'].filter((q) => !ds.has(q));
  rng.shuffle && rng.shuffle(free);
  const [a, b, c] = free;
  if (a) { const fr = roomFrame(r, a); const [x, z] = fr.toWorld(fr.width / 2, wallOff); P('cell_bunk', x, z, yawFor(fr.n[0], fr.n[1]), [2.0, 0.85, 0.6]); const [sx, sz] = fr.toWorld(fr.width / 2 - 0.4, 0.4); r.spots.push([sx, 0.58, sz]); }
  if (b) {
    const fr = roomFrame(r, b);
    const [x, z] = fr.toWorld(fr.width / 2, 0.55); P('student_desk', x, z, yawFor(-fr.n[0], -fr.n[1]), [0.7, 1.1, 0.8]);
    r.spots.push([x, 0.74, z]);
    if (r.w === 1 || r.h === 1) { const [bx, bz] = fr.toWorld(fr.width / 2, wallOff); P('lines_board', bx, bz, yawFor(fr.n[0], fr.n[1]), null); }
  }
  if (c && rng.chance(0.5)) { const fr = roomFrame(r, c); const [x, z] = fr.toWorld(fr.width - 0.4, 0.35); P('trash_bin', x, z, rng.range(0, 6), [0.4, 0.4, 0.5]); }
  r.spots.push([r.cx, 0.02, r.cz]);
}
// punishment classroom: single desks in rows, every one turned to face the
// wall, and the boards on every free wall say the same thing
function hukuman(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth;
  for (const side of ['N', 'S', 'W', 'E']) {
    const q = roomFrame(r, side);
    for (let u = 1.5; u < q.width; u += 3) if (solidWall(r, f, q, u) && rng.chance(0.75)) { const [x, z] = q.toWorld(u, wallOff); P('lines_board', x, z, yawFor(q.n[0], q.n[1]), null); }
  }
  for (const va of blocks(D)) for (const ua of blocks(W)) {
    const u = ua + 1.5, v = va + 1.5;
    if (u > W - 0.8 || v > D - 0.8 || rng.chance(0.1)) continue;
    const [x, z] = fr.toWorld(u, v);
    // turned to the nearest wall, not to the board
    const toW = [[u, 0], [W - u, 1], [v, 2], [D - v, 3]].sort((a, c) => a[0] - c[0])[0][1];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const [du, dv] = dirs[toW];
    const [x2, z2] = fr.toWorld(u + du, v + dv);
    P('student_desk', x, z, Math.atan2(x2 - x, z2 - z) + rng.range(-0.05, 0.05), [0.75, 0.75, 0.8]);
    if (rng.chance(0.4)) r.spots.push([x, 0.74, z]);
  }
  if (rng.chance(0.6)) locker(r, f, fr, W - 1.2);
  r.spots.push([r.cx, 0.02, r.cz]);
}
// the floor of the panopticon: hundreds of exam desks on the grid corners,
// all facing the tower in the middle
function ujian(r, f, rng, P) {
  const m = f.map, inR = (x, z) => m.reg(x, z) === r.id;
  const tx = r.towerX, tz = r.towerZ;
  for (let z = r.z0 + 1; z <= r.z1; z++) for (let x = r.x0 + 1; x <= r.x1; x++) {
    if (!(inR(x, z) && inR(x - 1, z) && inR(x, z - 1) && inR(x - 1, z - 1)) || rng.chance(0.08)) continue;
    const px = x * CELL, pz = z * CELL;
    const rot = Math.atan2(tx - px, tz - pz);
    if (rng.chance(0.06)) { P('chair_fallen', px, pz, rng.range(0, 6), [0.6, 0.6, 0.5]); continue; }
    P('student_desk', px, pz, rot, [0.75, 0.75, 0.8]);
    if (rng.chance(0.18)) r.spots.push([px, 0.74, pz]);
  }
  if (!r.spots.length) r.spots.push([r.cx + 1.5, 0.02, r.cz]);
}

// --------------------------------------------------------------- museum
// paintings on every real wall, roped off; statues on plinths in the blocks
function gallery(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  for (const side of ['N', 'S', 'W', 'E']) {
    const q = roomFrame(r, side);
    for (let u = 1.5; u < q.width; u += 3) {
      if (!solidWall(r, f, q, u) || rng.chance(0.15)) continue;
      const [x, z] = q.toWorld(u, wallOff); P(rng.chance(0.5) ? 'painting_a' : 'painting_b', x, z, yawFor(q.n[0], q.n[1]), null);
      if (rng.chance(0.25)) { const [rx, rz] = q.toWorld(u, 0.6); P('rope_barrier', rx, rz, yawFor(q.n[0], q.n[1]), [2.4, 0.2, 1]); }
    }
  }
  const m = f.map, inR = (x, z) => m.reg(x, z) === r.id;
  for (let z = r.z0 + 1; z <= r.z1; z++) for (let x = r.x0 + 1; x <= r.x1; x++) {
    if (!(inR(x, z) && inR(x - 1, z) && inR(x, z - 1) && inR(x - 1, z - 1))) continue;
    const px = x * CELL, pz = z * CELL, roll = rng.next();
    if (roll < 0.28) { P('plinth', px, pz, 0, [0.8, 0.8, 1.6]); P(rng.pick(FIG), px, pz, rng.range(0, 6), null, { y: 0.9 }); }
    else if (roll < 0.46) { P('hall_bench', px, pz, rng.chance(0.5) ? 0 : Math.PI / 2, [1.6, 0.42, 0.5]); r.spots.push([px, 0.46, pz]); }
    else if (roll < 0.54) { P('display_case', px, pz, rng.range(-0.2, 0.2), [0.85, 0.85, 1.7]); }
  }
  r.spots.push([r.cx, 0.02, r.cz], [(r.x0 + 0.5) * CELL, 0.02, (r.z0 + 0.5) * CELL]);
}
function vitrine(r, f, rng, P) {
  const m = f.map, inR = (x, z) => m.reg(x, z) === r.id;
  for (let z = r.z0; z <= r.z1 + 1; z++) for (let x = r.x0; x <= r.x1 + 1; x++) {
    const n = [inR(x, z), inR(x - 1, z), inR(x, z - 1), inR(x - 1, z - 1)].filter(Boolean).length;
    if (n < 4 || (x + z) % 2) continue;
    P('display_case', x * CELL, z * CELL, rng.range(-0.1, 0.1), [0.85, 0.85, 1.7]);
  }
  // cases along the walls too, between the walking lines
  for (const side of ['N', 'S', 'W', 'E']) {
    const q = roomFrame(r, side);
    for (let u = 3; u < q.width - 0.5; u += 6) if (solidWall(r, f, q, u - 0.2) && solidWall(r, f, q, u + 0.2)) { const [x, z] = q.toWorld(u, 0.55); P('display_case', x, z, yawFor(q.n[0], q.n[1]), [0.85, 0.85, 1.7]); }
  }
  r.spots.push([r.cx + 1.5, 0.02, r.cz], [(r.x0 + 0.5) * CELL, 0.02, (r.z1 + 0.5) * CELL]);
}
// a whole 1996 classroom kept as an exhibit, with figures where the pupils sat
function exhibit(r, f, rng, P) {
  kelas(r, f, rng, P);
  const fr = r.front;
  const W = fr.width, D = fr.depth;
  const faceFront = yawFor(-fr.n[0], -fr.n[1]);
  for (const va of blocks(D)) for (const vr of [0.98, 2.04]) for (const ua of blocks(W)) {
    const v = va + vr, u = ua + 1.5;
    if (v > D - 0.9 || !rng.chance(0.3)) continue;
    const [x, z] = fr.toWorld(u + (rng.chance(0.5) ? -0.3 : 0.3), v + 0.5);
    P(rng.chance(0.7) ? 'figure_stand' : 'figure_kneel', x, z, faceFront + rng.range(-0.1, 0.1), [0.4, 0.4, 1.8]);
  }
  for (const d of r.doors) { const x = d.x + d.inX * 0.9, z = d.z + d.inZ * 0.9; P('rope_barrier', x + d.inZ * 1.4, z + d.inX * 1.4, Math.atan2(d.inX, d.inZ), null); }
}
// a sea of statues under a three-storey roof: every grid corner and every
// cell edge midpoint may hold one, the walking lines stay clear
function statuehall(r, f, rng, P) {
  const m = f.map, inR = (x, z) => m.reg(x, z) === r.id;
  for (let z = r.z0 + 1; z <= r.z1; z++) for (let x = r.x0 + 1; x <= r.x1; x++) {
    if (!(inR(x, z) && inR(x - 1, z) && inR(x, z - 1) && inR(x - 1, z - 1))) continue;
    if (!rng.chance(0.42)) continue;
    const px = x * CELL + rng.range(-0.2, 0.2), pz = z * CELL + rng.range(-0.2, 0.2);
    if (rng.chance(0.15)) { P('plinth', px, pz, 0, [0.8, 0.8, 1.6]); P(rng.pick(FIG), px, pz, rng.range(0, 6), null, { y: 0.9 }); }
    else P(rng.pick(FIG), px, pz, r.faceAll ?? rng.range(0, 6), [0.5, 0.5, 1.8]);
    if (rng.chance(0.12)) r.spots.push([px + 0.7, 0.02, pz + 0.7]);
  }
  r.spots.push([r.cx, 0.02, r.cz]);
}

// ----------------------------------------------------------------- mall
const CLOTHES = /BUSANA|KAIN|DEPARTEMEN|SEPATU/;
function mallShop(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]), faceFront = yawFor(-fr.n[0], -fr.n[1]);
  const along = yawFor(fr.alongX ? 1 : 0, fr.alongX ? 0 : 1), across = yawFor(fr.alongX ? 0 : 1, fr.alongX ? 1 : 0);
  const inRoom = (x, z) => f.map.reg(...f.map.cellOf(x, z)) === r.id;
  const put = (type, u, v, rot, size, o) => { const [x, z] = at(u, v); if (inRoom(x, z)) { P(type, x, z, rot, size, o); return [x, z]; } return null; };
  if (r.closed) {
    // behind the shutters: boxes and dust
    for (let i = 0; i < 4; i++) put('cardboard_box', rng.range(0.6, W - 0.6), rng.range(0.6, 2), rng.range(0, 6), [0.6, 0.6, 0.5]);
    return;
  }
  if (r.type === 'cinema') {
    r.dark = true;
    for (const va of blocks(D)) for (const ua of blocks(W)) for (const dv of [0.95, 2.05]) put('waiting_chairs', ua + 1.5, va + dv, faceFront, [2.2, 0.5, 0.8]);
    r.spots.push([...at(W / 2, D / 2 - 1.5).slice(0, 1), 0.02, at(W / 2, D / 2 - 1.5)[1]]);
    return;
  }
  // cashier counter on the back wall (the wall facing the entrance)
  { const c = put('reception_desk', Math.min(W - 1.7, 2.0), 0.45, faceIn, [3.0, 0.7, 1.1]); if (c) r.spots.push([c[0], 1.14, c[1]]); }
  // shelves along the side walls
  for (const side of fr.alongX ? ['W', 'E'] : ['N', 'S']) {
    const sf = roomFrame(r, side), rot = yawFor(sf.n[0], sf.n[1]);
    for (let u = 0.9; u < sf.width - 0.6; u += 1.25) {
      if (sideHasDoorNear(r, sf, u - 0.7, u + 0.7)) continue;
      const [x, z] = sf.toWorld(u, wallOff + 0.3);
      if (!inRoom(x, z)) continue;
      P(r.sign && /ELEKTRONIK/.test(r.sign) && rng.chance(0.5) ? 'crt_tv' : 'store_shelf', x, z, rot, [1.2, 0.4, 1.8]);
      if (rng.chance(0.25)) r.spots.push([x - sf.n[0] * 0.25, 1.0, z - sf.n[1] * 0.25]);
    }
  }
  // the floor: racks and mannequins for clothes, aisles of shelves in the
  // supermarket, display tables elsewhere
  for (const va of blocks(D)) for (const ua of blocks(W)) {
    const u = ua + 1.5, v = va + 1.5;
    if (v < 2.5) continue;
    if (r.type === 'market') { put('store_shelf', u, v, across, [1.2, 0.6, 1.6]); r.spots.push([...(() => { const [x, z] = at(u + 0.5, v - 0.4); return [x, 0.02, z]; })()]); continue; }
    if (CLOTHES.test(r.sign || '') || r.type === 'dept') {
      if (rng.chance(0.55)) put('clothes_rack', u, v, rng.range(0, 6), [1.2, 1.2, 1.5]);
      else put(rng.pick(['figure_stand', 'figure_stand', 'figure_reach']), u, v, faceFront + rng.range(-0.3, 0.3), [0.5, 0.5, 1.8]);
    } else { const c = put('teacher_desk', u, v, rng.chance(0.5) ? along : across, [1.5, 0.8, 0.8]); if (c) r.spots.push([c[0], 0.79, c[1]]); }
  }
  // mannequins watching from behind the glass
  if (r.storefront && rng.chance(0.7)) {
    const [x, z] = fr.toWorld(W / 2 + 1.0, D - 0.6);
    if (inRoom(x, z)) P('figure_stand', x, z, faceFront + Math.PI, [0.5, 0.5, 1.8]);
  }
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  locker(r, f, fr, W - 0.6);
  void back;
  { const [x, z] = at(W / 2 + 1.5, D / 2); if (inRoom(x, z)) r.spots.push([x, 0.02, z]); }
}
// a house in the estate: living room by the door, table, bed at the back
function house(r, f, rng, P) {
  const fr = frameFor(r, rng); r.front = fr;
  const W = fr.width, D = fr.depth, at = (u, v) => fr.toWorld(u, v);
  const faceIn = yawFor(fr.n[0], fr.n[1]), faceFront = yawFor(-fr.n[0], -fr.n[1]);
  const back = roomFrame(r, { N: 'S', S: 'N', W: 'E', E: 'W' }[fr.side]);
  { const [x, z] = at(3.0, 0.3); P('crt_tv', x, z, faceIn, [1.1, 0.45, 1]); r.spots.push([x, 0.62, z]); }
  { const [x, z] = at(3.0, 2.0); P('house_sofa', x, z, faceFront, [2.0, 0.85, 0.8]); r.spots.push([x, 0.55, z]); }
  { const [x, z] = at(W / 2, wallOff); P('wall_frames', x, z, faceIn, null, { y: 2.1 }); }
  { const [x, z] = at(6.0, 6.0); P('family_table', x, z, yawFor(fr.alongX ? 1 : 0, fr.alongX ? 0 : 1), [1.6, 1.3, 0.8]); r.spots.push([x, 0.79, z]); }
  if (!sideHasDoorNear(r, back, 0.3, 2.4)) { const [x, z] = back.toWorld(1.4, 1.05); P('house_bed', x, z, yawFor(back.n[0], back.n[1]), [1.6, 2.05, 0.7]); r.spots.push([x, 0.6, z]); }
  locker(r, f, back, W - 0.6);
  { const [x, z] = back.toWorld(W - 1.6, wallOff + 0.24); P('class_cabinet', x, z, yawFor(back.n[0], back.n[1]), [1.0, 0.48, 1.8]); }
  { const [x, z] = at(0.5, 0.5); P('potted_plant', x, z, 0, [0.5, 0.5, 1]); }
}
// the estate street: roofs on the houses, lamps, mailboxes, one parked car
function street(r, f, rng, P) {
  const m = f.map;
  for (const h of f.out.rooms.filter((q) => q.type === 'house')) {
    P('house_roof', (h.x0 + h.x1 + 1) / 2 * CELL, (h.z0 + h.z1 + 1) / 2 * CELL, (h.x1 - h.x0) === (h.z1 - h.z0) ? Math.PI / 2 : 0, null, { y: 3.02 });
    const d = h.doors[0];
    if (d) { P('mailbox', d.x - d.inX * 1.2 + d.inZ * 1.1, d.z - d.inZ * 1.2 + d.inX * 1.1, yawFor(-d.inX, -d.inZ), [0.3, 0.3, 1]); }
  }
  for (let z = r.z0 + 1; z <= r.z1; z += 3) for (const lx of [29 * CELL + 0.35, 31 * CELL - 0.35]) {
    const lz = z * CELL + 0.2;
    if (m.reg(...m.cellOf(lx, lz)) !== r.id) continue;
    P('lamp_post', lx, lz, 0, [0.3, 0.3, 3]);
    f.light(lx, lz, { y: 4.3, fall: 0.07, reach2: 200, fixture: 'none', state: rng.chance(0.4) ? 'off' : rng.chance(0.3) ? 'flicker' : 'on', tall: true });
  }
  P('old_car', 30 * CELL, 9.5 * CELL, rng.range(-0.08, 0.08), [1.7, 4.3, 1.2]);
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (m.reg(x, z) === r.id && rng.chance(0.08)) r.spots.push([(x + 0.5) * CELL + rng.range(-0.6, 0.6), 0.02, (z + 0.5) * CELL + rng.range(-0.6, 0.6)]);
}

// ---------------------------------------------------------------- halls
export function dressExtra(f, rng, def, reserved) {
  const dress = def.dress || def.layout;
  if (dress === 'mall') dressMall(f, rng, reserved);
  if (dress === 'school') dressSchool(f, rng, reserved);
  if (dress === 'hospital') dressHospital(f, rng, reserved);
  if (def.layout) for (const d of f.map.doors.values()) {
    const r = d.room;
    if (!r.sign || dress === 'school' || r.mallSign) continue;
    f.out.signs.push({ x: d.x - d.inX * (wallOff + 0.01), z: d.z - d.inZ * (wallOff + 0.01), y: 2.42, rot: yawFor(-d.inX, -d.inZ), text: r.sign });
  }
}

function dressMall(f, rng, reserved) {
  const m = f.map, out = f.out;
  for (const r of out.rooms) {
    // illuminated sign over every shop front, shutters on the closed ones
    if (r.storefront) {
      const { mid, list } = r.storefront, d = SIDES4[mid.s];
      const [cx, cz] = m.center(mid.x, mid.z);
      const wx = cx + d[0] * (CELL / 2 + wallOff + 0.02), wz = cz + d[1] * (CELL / 2 + wallOff + 0.02);
      out.signs.push({ x: wx, z: wz, y: 2.78, rot: yawFor(d[0], d[1]), text: r.sign, w: 2.7, h: 0.42, style: 'mall' });
      if (r.closed) for (const e of list) {
        const dd = SIDES4[e.s], [ex, ez] = m.center(e.x, e.z);
        f.prop('rolling_shutter', ex + dd[0] * (CELL / 2 + wallOff), ez + dd[1] * (CELL / 2 + wallOff), yawFor(dd[0], dd[1]), null);
      }
    } else if (r.sign && r.type === 'kantin') {
      out.signs.push({ x: (r.x0 + r.x1 + 1) / 2 * CELL, z: (r.z1 + 1) * CELL + 0.02, y: 2.78, rot: 0, text: r.sign, w: 3.2, h: 0.5, style: 'neon' });
    }
  }
  // plaza: fountain, kiosks, benches; planters round the ring
  if (f.k === 0) {
    f.prop('plaza_fountain', 15 * CELL, 12 * CELL, 0, [3.8, 3.8, 1]);
    f.prop('mall_kiosk', 12 * CELL, 10 * CELL + 0.2, Math.PI / 2, [2.0, 1.2, 1]);
    f.prop('mall_kiosk', 18 * CELL, 14 * CELL, 0, [2.0, 1.2, 1]);
    for (const [x, z, rot] of [[15 * CELL, 9.15 * CELL, 0], [15 * CELL, 14.85 * CELL, Math.PI], [12.15 * CELL, 12 * CELL, Math.PI / 2], [17.85 * CELL, 12 * CELL, -Math.PI / 2]]) f.prop('hall_bench', x, z, rot, [1.6, 0.42, 0.5]);
  }
  for (const [x, z] of [[10, 8], [19, 8], [10, 17], [19, 17]]) if (m.reg(x, z) === 0) { const [cx, cz] = m.center(x, z); f.prop('potted_plant', cx + (x === 10 ? -0.9 : 0.9), cz + (z === 8 ? -0.9 : 0.9), 0, [0.5, 0.5, 1]); }
  for (let z = 0; z < m.H; z++) for (let x = 0; x < m.W; x++) {
    if (m.reg(x, z) !== 0 || f.k === 0 || !rng.chance(0.12)) continue;
    for (const [s, d] of Object.entries(SIDES4)) {
      if (m.edge(x, z, DIRS.find((q) => q.dx === d[0] && q.dz === d[1])) !== EDGE.RAIL) continue;
      const [cx, cz] = m.center(x, z);
      f.prop('hall_bench', cx - d[0] * 0.6, cz - d[1] * 0.6, yawFor(-d[0], -d[1]) + Math.PI, [1.6, 0.42, 0.5]);
      void s; break;
    }
  }
  // windows on the house walls facing the street
  const street = out.rooms.find((q) => q.type === 'street');
  if (street) for (const h of out.rooms.filter((q) => q.type === 'house')) {
    for (let z = h.z0; z <= h.z1; z++) for (let x = h.x0; x <= h.x1; x++) for (const [s, d] of Object.entries(SIDES4)) {
      const dir = DIRS.find((q) => q.dx === d[0] && q.dz === d[1]);
      if (m.reg(x + d[0], z + d[1]) !== street.id || m.edge(x, z, dir) !== EDGE.WALL || (x + z) % 2) continue;
      const [cx, cz] = m.center(x, z);
      f.prop('school_window', cx + d[0] * (CELL / 2 + wallOff), cz + d[1] * (CELL / 2 + wallOff), yawFor(d[0], d[1]), null);
      f.prop('school_window', cx + d[0] * (CELL / 2 - wallOff), cz + d[1] * (CELL / 2 - wallOff), yawFor(-d[0], -d[1]), null);
      void s;
    }
  }
}
const SIDES4 = { E: [1, 0], W: [-1, 0], S: [0, 1], N: [0, -1] };

function dressHospital(f, rng, reserved) {
  const m = f.map, out = f.out, W = m.W, H = m.H;
  // reception and waiting area by the main doors
  if (out.exit) {
    const [ex, ez] = out.exit.cell;
    const [cx, cz] = m.center(ex + 2, ez + 1);
    f.prop('reception_desk', cx, cz - 1.5, 0, [3.0, 0.7, 1.1]);
    for (const dz of [2.6, 4.4]) f.prop('waiting_chairs', cx - 0.6, cz + dz, Math.PI, [2.2, 0.5, 0.8]);
    out.lights.push({ x: cx, z: cz, rot: 0, state: 'on', cell: m.cellOf(cx, cz) });
  }
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (m.reg(x, z) !== 0) continue;
    const [cx, cz] = m.center(x, z);
    for (const d of DIRS) {
      const e = m.edge(x, z, d), k = m.edgeKey(x, z, d);
      if (e !== EDGE.WALL || reserved.has(k)) continue;
      const rot = yawFor(-d.dx, -d.dz);
      const wx = cx + d.dx * (CELL / 2 - wallOff), wz = cz + d.dz * (CELL / 2 - wallOff);
      f.prop('wall_handrail', wx, wz, rot, null);
      const roll = rng.next();
      const bx = cx + d.dx * (CELL / 2 - wallOff - 0.3), bz = cz + d.dz * (CELL / 2 - wallOff - 0.3);
      if (roll < 0.07) f.prop('waiting_chairs', bx, bz, rot, [2.2, 0.5, 0.8]);
      else if (roll < 0.11) f.prop('wheelchair', bx + d.dz * 0.9, bz + d.dx * 0.9, rot + rng.range(-0.4, 0.4), [0.65, 0.7, 1]);
      else if (roll < 0.15) f.prop(rng.chance(0.25) ? 'gurney_body' : 'gurney', cx + d.dx * (CELL / 2 - wallOff - 0.4), cz + d.dz * (CELL / 2 - wallOff - 0.4), rot + Math.PI / 2, [2.0, 0.65, 0.9]);
      else if (roll < 0.19) f.prop('notice_board', wx, wz, rot, null, { y: 1.55 });
      else if (roll < 0.22) f.prop('potted_plant', cx + d.dx * 1.05 + d.dz * 1.05, cz + d.dz * 1.05 + d.dx * 1.05, 0, [0.5, 0.5, 1]);
    }
  }
}

const ROOMY = new Set(['kelas', 'guru', 'library', 'lab', 'uks', 'kepsek', 'office', 'kantin']);

function dressSchool(f, rng, reserved) {
  const m = f.map, out = f.out, W = m.W, H = m.H;
  const room = (id) => out.rooms.find((q) => q.id === id);
  // colonnade / balcony posts on the yard edge
  const yard = f.k === 0 ? out.rooms.find((q) => q.type === 'lapangan') : null;
  const rect = yard || (() => { let a = null; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (m.reg(x, z) === -2) { a = a || { x0: x, z0: z, x1: x, z1: z }; a.x1 = Math.max(a.x1, x); a.z1 = Math.max(a.z1, z); } return a; })();
  if (rect) {
    for (let x = rect.x0; x <= rect.x1 + 1; x++) for (const z of [rect.z0, rect.z1 + 1]) f.prop('pillar', x * CELL, z * CELL, 0, [0.42, 0.42, 3]);
    for (let z = rect.z0 + 1; z <= rect.z1; z++) for (const x of [rect.x0, rect.x1 + 1]) f.prop('pillar', x * CELL, z * CELL, 0, [0.42, 0.42, 3]);
  }
  // door signs, windows into the classrooms, boards, benches and plants
  for (const d of m.doors.values()) {
    const r = d.room;
    if (!r.sign) continue;
    out.signs.push({ x: d.x - d.inX * (wallOff + 0.01), z: d.z - d.inZ * (wallOff + 0.01), y: 2.42, rot: yawFor(-d.inX, -d.inZ), text: r.sign });
  }
  const used = new Set();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const reg = m.reg(x, z);
    if (reg < 0) continue;
    const [cx, cz] = m.center(x, z);
    for (const d of DIRS) {
      const e = m.edge(x, z, d), k = m.edgeKey(x, z, d);
      if (e !== EDGE.WALL || reserved.has(k)) continue;
      const nb = m.reg(x + d.dx, z + d.dz);
      const here = reg > 0 ? room(reg) : null, there = nb > 0 ? room(nb) : null;
      const rot = yawFor(-d.dx, -d.dz);
      const wx = cx + d.dx * (CELL / 2 - wallOff), wz = cz + d.dz * (CELL / 2 - wallOff);
      // windows: classroom <-> corridor walls (both faces, same edges) and outside walls,
      // never on the board wall or the back wall
      const sd = sideOf(d);
      const win = (reg === 0 && there && ROOMY.has(there.type) && okWall(there, OPPS[sd])) || (here && ROOMY.has(here.type) && (nb === -1 || nb === 0) && okWall(here, sd));
      if (win && ((d.dx !== 0 ? z : x) % 2 === 0 || nb === -1)) { f.prop('school_window', wx, wz, rot, null); used.add(k); continue; }
      if (reg !== 0 || used.has(k)) continue;
      const roll = rng.next();
      if (roll < 0.1) f.prop('notice_board', wx, wz, rot, null, { y: 1.45 });
      else if (roll < 0.2) { const bx = cx + d.dx * (CELL / 2 - wallOff - 0.24), bz = cz + d.dz * (CELL / 2 - wallOff - 0.24); f.prop('hall_bench', bx + d.dz * 0.6, bz + d.dx * 0.6, rot, [1.6, 0.42, 0.5]); }
      else if (roll < 0.25) { const bx = cx + d.dx * 1.05 + d.dz * 1.05, bz = cz + d.dz * 1.05 + d.dx * 1.05; f.prop('potted_plant', bx, bz, rng.range(0, 6), [0.5, 0.5, 1]); }
      else if (roll < 0.28) f.prop('trash_bin', cx + d.dx * 1.1 - d.dz * 0.9, cz + d.dz * 1.1 - d.dx * 0.9, rot, [0.4, 0.4, 0.5]);
    }
  }
  // the lobby gets the trophy cabinet
  if (out.exit) {
    const [ex, ez] = out.exit.cell;
    done: for (let z = ez - 1; z <= ez + 1; z++) for (let x = ex; x <= ex + 2; x++) {
      if (m.reg(x, z) !== 0) continue;
      for (const d of DIRS) {
        const k = m.edgeKey(x, z, d);
        if (m.edge(x, z, d) !== EDGE.WALL || reserved.has(k) || used.has(k)) continue;
        const [cx, cz] = m.center(x, z);
        f.prop('trophy_case', cx + d.dx * (CELL / 2 - wallOff - 0.26), cz + d.dz * (CELL / 2 - wallOff - 0.26), yawFor(-d.dx, -d.dz), [1.2, 0.5, 1.9]);
        break done;
      }
    }
  }
}
const sideOf = (d) => (d.dx === 1 ? 'E' : d.dx === -1 ? 'W' : d.dz === 1 ? 'S' : 'N');
const OPPS = { N: 'S', S: 'N', E: 'W', W: 'E' };
const okWall = (r, s) => !r.front || (s !== r.front.side && s !== OPPS[r.front.side]);
function hasDoorEdge(m, x, z) { return DIRS.some((d) => m.edge(x, z, d) === EDGE.DOOR); }
