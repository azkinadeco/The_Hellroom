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
  const side = pref.length ? rng.pick(pref) : free.length ? rng.pick(free) : long[0];
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

// ---------------------------------------------------------------- halls
export function dressExtra(f, rng, def, reserved) {
  if (def.layout === 'school') dressSchool(f, rng, reserved);
  if (def.layout === 'hospital') dressHospital(f, rng, reserved);
  if (def.layout) for (const d of f.map.doors.values()) {
    const r = d.room;
    if (!r.sign || def.layout === 'school') continue;
    f.out.signs.push({ x: d.x - d.inX * (wallOff + 0.01), z: d.z - d.inZ * (wallOff + 0.01), y: 2.42, rot: yawFor(-d.inX, -d.inZ), text: r.sign });
  }
}

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
