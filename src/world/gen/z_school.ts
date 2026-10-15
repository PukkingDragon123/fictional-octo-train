// Meadowbrook Elementary (128×96): a 1970s single-storey school after hours.
// The front doors (back out to Alder Lane) open into a tall lobby; a spine
// corridor runs north from it, crossing the South Hall, the Middle Hall and the
// North Hall, each lined with lockers. Three rows of identical classrooms,
// desks in rows, a chalkboard, a PA speaker that clears its throat. South of
// the Middle Hall: the gym with its bleachers, the lunchroom and kitchen, the
// library, music and art. Along the front: the main office and the
// principal's office (where the announcements are read), the teachers' lounge,
// the kindergarten, and the nurse's office, whose back door is not a school
// door at all but a hospital door — it opens onto St. Aldric's children's ward.
//
// Wrong things: the North Hall never ends (it loops: walk far enough east and
// you are back at Room 1A); Room 3C is not always Room 3C; the corridor to
// Room 0 is a different length every time; the library rearranges its stacks;
// several classrooms have the same crayon drawing on every desk.
import { defZone } from '../worldGraph';
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3, hashStr } from '../../core/rng';
import { registerShift } from '../shift';
import { Frame, Dir, Rot, LBACK, LFACE, WBACK, WFACE, ANG, wallAt, signAt, decal, scatter, lootIn, arrive, openTile } from './suburbs_kit';
import { itemAt } from './meridian_kit';
import { wrongRoomsIn } from './wrong_kit';

const W = 128, H = 96;
// halls (4 wide) and the spine
const NH = 16, MH = 42, SH = 64, SP = 60;
// the North Hall loops: stepping onto SEAM_W puts you at SEAM_W + LOOP, onto SEAM_E at SEAM_E - LOOP
const LOOP = 81, SEAM_W = 23, SEAM_E = SEAM_W + LOOP + 1;
// circuits
const C_NORTH = 1, C_MID = 2, C_GYM = 3, C_LUNCH = 4, C_LIB = 5, C_ARTS = 6, C_FRONT = 7, C_KIND = 8, C_ZERO = 9, C_BOIL = 10;

interface Ctx { z: Zone; b: ZoneBuilder; f: Furnisher; rng: Rng; seed: number }

/** deterministic 0..1 noise */
const hf = (a: number, b: number, c: number) => hash3(a, b, c) / 4294967296;
/** position along the North Hall loop (same value at x and x + LOOP) */
const loopP = (x: number) => (((x - 5) % LOOP) + LOOP) % LOOP;

// =====================================================================
// classrooms
// =====================================================================
interface ClassOpts {
  label: string;
  circuit: number;
  outer?: boolean;       // back wall is the building's outside wall (windows)
  drawing?: boolean;     // the same crayon drawing on every desk
  beyond?: boolean;      // past a loop seam: shell, door and sign only
  lore?: string;         // a note on one desk
  variant?: number;      // furnishing variant (shift rooms)
  stamp?: boolean;       // called from a shift stamp
  shellOnly?: boolean;   // walls, door and sign; the contents come later (shift rooms)
}

/** a classroom w wide × 11 deep whose door wall faces `front` (the hall) */
function classroom(c: Ctx, x0: number, y0: number, w: number, front: Dir, o: ClassOpts): Frame {
  const { b } = c;
  const F = new Frame(b, x0, y0, w, 11, front);
  if (!o.stamp) {
    F.fill(0, 0, w - 1, 10, 'linoleum_school');
    F.paper(0, 0, w - 1, 10, 'wall_school');
    F.walls(0, 0, w - 1, 10, 'drywall');
    if (o.outer) F.wallU(0, w - 1, 10, 'b', 'brick');
    F.room('Room ' + o.label.slice(5), 'classroom', 0, 0, w - 1, 10, { circuit: o.circuit });
    F.door(1, 0, 'f', 'door_school', {});
    F.mount('zg_sign', 3, -1, 'b', { label: o.label, h: 2.0 });
    if (o.outer) for (const u of [1, w - 2]) F.window(u, 10, 'b', { style: 'window_metal', curtains: 'closed' });
    if (o.beyond) F.flag(0, 0, w - 1, 10, TF.NOSPAWN);
    if (o.shellOnly) return F;
  }
  const rng = new Rng(hash3(c.seed, hashStr(o.label), 13 + (o.variant ?? 0)));
  const f = new Furnisher(b, rng);
  furnishClass(F, f, rng, w, o);
  return F;
}

function furnishClass(F: Frame, f: Furnisher, rng: Rng, w: number, o: ClassOpts) {
  const z = F.z;
  const P = (key: string, u: number, v: number, lr: number, st: Record<string, any> = {}) => F.put(f, key, u, v, lr, st);
  const cu = Math.floor(w / 2) - 1;
  const v = o.variant ?? 0;
  for (const [u, vv] of [[2, 3], [w - 3, 3], [2, 7], [w - 3, 7]] as const) F.lamp(u, vv, o.circuit, 'light_fluoro', { flicker: o.label === 'ROOM 3C' && vv === 7 ? 0.25 : 0 });
  F.mount('zg_pa_speaker', 2, 10, 'b');
  F.mount('clock_wall', cu + 3, 10, 'b');
  F.mount('chalkboard', cu, 10, 'b');
  F.mount('poster', 0, 5, 'l', { v: rng.int(0, 5) });
  if (v === 0 || v === 1) {
    // rows of desks facing the chalkboard, the teacher's desk in front of it
    const td = P('teacher_desk', cu, 8, LFACE.f);
    if (td) f.onTop('globe', td, {});
    P('chair_office', cu + 1, 9, LFACE.f);
    const desks: TileObject[] = [];
    for (const vv of [2, 4, 6]) for (let u = 1; u <= w - 2; u += 2) { const d = P('desk_school', u, vv, LFACE.b); if (d) desks.push(d); }
    if (o.drawing || v === 1) for (const d of desks) F.b.obj('zg_crayon_drawing', d.x, d.y, d.rot, { y: 0.745 });
    if (v === 1) for (let u = 1; u < w - 1; u += 2) F.mount('zg_wall_drawing', u, 0, 'f', { v: u });
    P('bookshelf', w - 1, 1, LBACK.r);
    P('shelf_metal', w - 1, 2, LBACK.r, { loot: 'classroom_supplies' });
    P('locker', 0, 8, LBACK.l); P('locker', 0, 9, LBACK.l);
    P('trash_can', w - 1, 9, 0);
    if (!o.stamp && o.lore && desks.length) { const d = desks[rng.int(0, desks.length - 1)]; itemAt(z, rng, 'note', d.x, d.y, 0.76, { lore: o.lore }, 0.15); }
    if (!o.stamp && rng.chance(0.5)) { const [lx, ly] = F.P(rng.int(1, w - 2), rng.int(1, 7)); f.floorLoot('classroom_supplies', lx, ly); }
  } else if (v === 2) {
    // the nurse's overflow: hospital beds in rows, curtains between
    for (let u = 1; u <= w - 2; u += 3) { P('bed_hospital', u, 7, LBACK.b); P('curtain_screen', u + 1, 8, 0); if (u + 1 <= w - 2) P('iv_stand', u + 1, 7, 0); }
    for (let u = 1; u <= w - 2; u += 3) P('bed_hospital', u, 2, LFACE.b);
    P('wheelchair', w - 2, 5, LFACE.l);
  } else if (v === 3) {
    // empty, apart from one desk in the middle facing the wall
    const d = P('desk_school', cu + 1, 5, LFACE.f);
    if (d) F.b.obj('zg_crayon_drawing', d.x, d.y, d.rot, { y: 0.745 });
  } else {
    // nap time: mats in rows, tiny chairs stacked, the lights low
    for (const vv of [2, 4, 6, 8]) for (let u = 1; u <= w - 2; u += 2) P('bedroll', u, vv, LFACE.b);
    P('chair_stack', w - 1, 9, 0); P('chair_stack', w - 1, 8, 0);
    P('teddy_giant', 0, 9, LFACE.r);
  }
}

// =====================================================================
// small helpers
// =====================================================================
/** lockers along the wall on side `side` of tiles x0..x1 (row y) or y0..y1 (column x), skipping doors */
function lockersH(c: Ctx, x0: number, x1: number, y: number, side: 'n' | 's', skip: (x: number) => boolean = () => false) {
  const { z, b } = c;
  for (let x = x0; x <= x1; x++) {
    if (skip(x) || !openTile(z, x, y)) continue;
    const ey = side === 'n' ? y : y + 1;
    if (!z.wallN[z.idx(x, ey)] || z.edge(x, ey, 0)) continue;
    b.obj('locker', x, y, WBACK[side], { open: hf(loopP(x), y, 77) < 0.04 });
  }
}

function restroom(c: Ctx, x0: number, y0: number, x1: number, y1: number, boys: boolean, circuit: number) {
  const { b, f } = c;
  for (let y = y0 + 1; y <= y1; y += 2) {
    f.place('toilet', x1, y, WBACK.e);
    b.hwall(x1 - 1, x1, y, 'cubicle');
    b.vwall(x1, y, Math.min(y1, y + 1), 'cubicle');
    b.door(x1, y, 1, 'door_white', {});
  }
  for (let y = y0 + 2; y <= y0 + 4; y++) { f.place('sink_bathroom', x0, y, WBACK.w); wallAt(b, 'mirror', x0, y, 'w'); }
  if (boys) for (let y = y0 + 6; y <= y1 - 1; y += 2) wallAt(b, 'urinal', x0, y, 'w');
  f.place('trash_can', x0, y1, 0);
  b.paper(x0, y0, x1, y1, 'wall_bathroom');
  b.obj('light_fluoro', x0 + 2, Math.floor((y0 + y1) / 2), 0, { circuit, flicker: 0.12 });
}

// =====================================================================
// the generator
// =====================================================================
export function generateSchool(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'Meadowbrook Elementary';
  z.meta.anchors = {};

  // ------------------------------------------------------------ shell
  b.fillFloor(5, 5, 122, 91, 'linoleum_school');
  b.paper(5, 5, 122, 91, 'wall_school');
  b.roomWalls(5, 5, 122, 91, 'brick');

  // ------------------------------------------------------------ the lobby and the front doors (arrival)
  {
    const x0 = SP, x1 = 69, y0 = 68, y1 = 91;
    b.fillFloor(x0, y0, x1, y1, 'terrazzo');
    b.vwall(x0, y0, y1, 'drywall'); b.vwall(x1 + 1, y0, y1, 'drywall');
    b.addRoom('Lobby', 'lobby', x0, y0, x1, y1, { circuit: C_FRONT });
    for (const x of [63, 65, 66]) b.door(x, 92, 0, 'door_school', { locked: true });
    b.door(64, 92, 0, 'door_school', { portal: 'r_suburbs_school' });
    b.portal({ id: 'r_suburbs_school', x: 64, y: 91, kind: 'door', to: 'suburbs', tx: 143, ty: 115, face: ANG.s, label: 'Go back outside' });
    arrive(b, 'p_suburbs_school', 64, 88, ANG.n, 5);
    for (const x of [61, 62, 67, 68]) b.window(x, 92, 0, { style: 'window_metal', curtains: 'none' });
    f.place('bench', 60, 84, WFACE.e); f.place('bench', 68, 84, WFACE.w);
    f.place('plant_tall', 60, 91, 0); f.place('plant_tall', 69, 91, 0);
    for (const y of [72, 75]) { f.place('display_table', 60, y, WFACE.e); }
    wallAt(b, 'noticeboard', 69, 79, 'e', { lore: 'flyer_lost_dog' });
    wallAt(b, 'zg_pa_speaker', 64, 68, 'n');
    wallAt(b, 'clock_wall', 60, 80, 'w');
    for (let k = 0; k < 6; k++) wallAt(b, 'zg_wall_drawing', 69, 70 + k, 'e', { v: k });
    signAt(b, 60, 74, 'w', 'OFFICE', 2.1);
    signAt(b, 69, 72, 'e', 'NURSE', 2.1);
    for (const y of [71, 76, 81, 86, 90]) b.obj('light_fluoro', 64, y, 0, { circuit: C_FRONT, flicker: y === 81 ? 0.2 : 0 });
    decal(z, 'carpet_rug', 64.5, 89.5, 4, 2.4, 0, 0x6a3a2a);
  }

  // ------------------------------------------------------------ halls
  b.addRoom('North Hall', 'hallway', 5, NH, 122, NH + 3, { circuit: C_NORTH });
  b.addRoom('Middle Hall', 'hallway', 5, MH, 122, MH + 3, { circuit: C_MID });
  b.addRoom('South Hall', 'hallway', 35, SH, 122, SH + 3, { circuit: C_FRONT });
  b.addRoom('Main Corridor', 'hallway', SP, NH + 4, SP + 3, MH - 1, { circuit: C_MID });
  b.addRoom('Main Corridor', 'hallway', SP, MH + 4, SP + 3, SH - 1, { circuit: C_FRONT });
  b.paper(SP, NH, SP + 3, SH + 3, 'wall_school');

  // ------------------------------------------------------------ row 1 + row 2 (the North Hall, which loops)
  // rooms every 11 tiles: 5, 16, 27, 38, 49 | janitor / spine 60..63 | 64, 75, 86, 97, 108, 119 (a sliver).
  // A room and its partner LOOP tiles away share label, door and contents, so the seams are invisible;
  // rooms whose door lies past a seam can be seen but never entered.
  const canon = (x0: number) => (x0 <= SEAM_W ? x0 + LOOP : x0 >= SEAM_E ? x0 - LOOP : x0);
  const LETTER: Record<number, string> = { 27: 'A', 38: 'B', 49: 'C', 64: 'D', 75: 'E', 86: 'F', 97: 'G' };
  const xs: [number, number][] = [[5, 11], [16, 11], [27, 11], [38, 11], [49, 11], [64, 11], [75, 11], [86, 11], [97, 11], [108, 11], [119, 4]];
  const past = (x: number) => x <= SEAM_W || x >= SEAM_E;
  for (const [x0, w] of xs) {
    const L = LETTER[canon(x0)];
    const b1 = past(x0 + 1), b2 = past(x0 + w - 2);
    classroom(c, x0, 5, w, 's', { label: 'ROOM 1' + L, circuit: C_NORTH, outer: true, beyond: b1, drawing: L === 'C' || L === 'F', lore: L === 'D' && !b1 ? 'report_card' : undefined });
    classroom(c, x0, NH + 4, w, 'n', { label: 'ROOM 2' + L, circuit: C_NORTH, beyond: b2, drawing: L === 'B' || L === 'E' });
  }
  // janitor's closet between 1D and 1E
  {
    b.roomWalls(SP, 5, SP + 3, 15, 'drywall');
    b.addRoom("Janitor's Closet", 'storage', SP, 5, SP + 3, 15, { circuit: C_NORTH });
    b.fillFloor(SP, 5, SP + 3, 15, 'concrete'); b.paper(SP, 5, SP + 3, 15, 'wall_cinder');
    b.door(61, NH, 0, 'door_metal', { sign: 'maintenance' });
    f.place('janitor_cart', SP, 13, 0); f.place('mop_bucket', SP + 3, 14, 0);
    f.place('shelf_metal', SP, 5, 0, { loot: 'janitor' }); f.place('shelf_metal', SP + 1, 5, 0, { loot: 'janitor' }); f.place('shelf_metal', SP + 3, 5, 0, { loot: 'maintenance' });
    f.place('water_heater', SP + 3, 8, WBACK.e);
    wallAt(b, 'fuse_box', SP, 9, 'w');
    b.obj('light_bulb', SP + 1, 10, 0, { circuit: C_NORTH, flicker: 0.3 });
    f.floorItem('fuse', SP + 2, 11);
  }
  // the spine through rows 2-3 is a corridor
  b.vwall(SP, NH + 4, MH - 1, 'drywall'); b.vwall(SP + 4, NH + 4, MH - 1, 'drywall');
  // hall dressing, a pure function of the position along the loop so both seams match
  lockersH(c, 5, 122, NH, 'n', (x) => x >= SP && x <= SP + 3);
  lockersH(c, 5, 122, NH + 3, 's', (x) => x >= SP && x <= SP + 3);
  for (let x = 5; x <= 122; x++) {
    const p = loopP(x);
    if (p % 11 === 7) b.obj('light_fluoro', x, NH + 1, 0, { circuit: C_NORTH, broken: hf(p, 1, seed & 0xffff) < 0.1, flicker: hf(p, 2, seed & 0xffff) < 0.15 ? 0.25 : 0 });
    if (p % 11 === 2) b.obj('light_fluoro', x, NH + 2, 0, { circuit: C_NORTH, broken: hf(p, 3, seed & 0xffff) < 0.08 });
    if (p % 11 === 5 && !(x >= SP && x <= SP + 3)) wallAt(b, 'zg_pa_speaker', x, NH, 'n');
    if (p % 22 === 9 && !(x >= SP && x <= SP + 3)) wallAt(b, 'fire_extinguisher_wall', x, NH + 3, 's');
    for (let y = NH; y <= NH + 3; y++) { const h = hf(p, y, (seed & 0xffff) + 5); if (h < 0.05) decal(z, h < 0.025 ? 'decal_stain_water' : 'decal_footprints', x + 0.5, y + 0.5, 1, 1, h * 120, undefined, 0.7); }
  }
  for (let y = NH; y <= NH + 3; y++) {
    if (!openTile(z, SEAM_W, y) || !openTile(z, SEAM_E, y)) continue; // lockers stand on the wall rows
    b.portal({ id: 'loop_nh_w' + y, x: SEAM_W, y, kind: 'loop', to: 'school', tx: SEAM_W + LOOP, ty: y, loopDx: LOOP, hidden: true });
    b.portal({ id: 'loop_nh_e' + y, x: SEAM_E, y, kind: 'loop', to: 'school', tx: SEAM_E - LOOP, ty: y, loopDx: -LOOP, hidden: true });
  }
  b.flag(5, NH, SEAM_W, NH + 3, TF.NOSPAWN); b.flag(SEAM_E, NH, 122, NH + 3, TF.NOSPAWN);

  // ------------------------------------------------------------ row 3 (the Middle Hall); Room 3C shifts
  const r3: [number, number, string][] = [[5, 11, 'A'], [16, 11, 'B'], [27, 11, 'C'], [38, 11, 'D'], [49, 11, 'E'], [64, 11, 'F'], [75, 11, 'G'], [86, 11, 'H'], [97, 11, 'I'], [108, 15, 'J']];
  for (const [x0, w, L] of r3) {
    if (L === 'C') {
      // the classroom that is sometimes a different classroom
      classroom(c, x0, 31, w, 's', { label: 'ROOM 3C', circuit: C_MID, shellOnly: true });
      registerShift(z, 'room_3c', x0, 31, x0 + w - 1, 41, 5, (sb, srng, v) => {
        const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng };
        sb.fillFloor(x0, 31, x0 + w - 1, 41, v === 4 ? 'carpet_kids' : v === 2 ? 'linoleum_green' : 'linoleum_school');
        classroom(sc, x0, 31, w, 's', { label: 'ROOM 3C', circuit: C_MID, variant: v, stamp: true });
      });
      continue;
    }
    classroom(c, x0, 31, w, 's', { label: 'ROOM 3' + L, circuit: C_MID, drawing: L === 'G' });
  }
  lockersH(c, 5, 122, MH, 'n', (x) => x >= SP && x <= SP + 3);
  for (let x = 7; x <= 120; x += 6) b.obj('light_fluoro', x, MH + 1 + ((x / 6) & 1), 0, { circuit: C_MID, broken: hf(x, 9, seed & 0xffff) < 0.1, flicker: hf(x, 10, seed & 0xffff) < 0.12 ? 0.2 : 0 });
  for (let x = 10; x <= 118; x += 11) if (x < SP || x > SP + 3) wallAt(b, 'zg_pa_speaker', x, MH, 'n');
  for (let y = NH + 5; y <= MH - 1; y += 5) b.obj('light_fluoro', SP + 1, y, 0, { circuit: C_MID });

  // ------------------------------------------------------------ the gym and locker rooms
  {
    const x0 = 5, y0 = 46, x1 = 34, y1 = 75;
    b.fillFloor(x0, y0, x1, y1, 'wood_gym');
    b.paper(x0, y0, x1, y1, 'wall_cinder');
    b.roomWalls(x0, y0, x1, y1, 'cinder');
    b.vwall(x0, y0, y1, 'brick');
    b.addRoom('Gymnasium', 'gym', x0, y0, x1, y1, { circuit: C_GYM, temp: 17 });
    for (const x of [18, 19, 20]) b.door(x, y0, 0, 'door_school', { open: x === 19 });
    for (const y of [SH, SH + 1]) b.door(x1 + 1, y, 1, 'door_school', { open: y === SH });
    signAt(b, 21, MH + 3, 's', 'GYM', 2.1);
    // bleachers along the north wall, hoops at either end, the court painted on the floor
    for (const x of [6, 9, 12, 22, 25, 28, 31]) f.place('gym_bleachers', x, y0, 0);
    f.place('basketball_hoop', x0, 60, WFACE.e); f.place('basketball_hoop', x1, 60, WFACE.w);
    const line = (x: number, y: number, w: number, h: number) => decal(z, 'decal_parking_line', x, y, w, h, 0, 0xf4f0e0, 0.85);
    line(20, 52, 26, 0.12); line(20, 69, 26, 0.12); line(7, 60.5, 0.12, 17); line(33, 60.5, 0.12, 17); line(20, 60.5, 0.12, 17);
    for (let y = y0 + 3; y <= y1 - 1; y += 5) for (let x = x0 + 3; x <= x1 - 1; x += 5) b.obj('light_fluoro', x, y, 0, { circuit: C_GYM, flicker: hf(x, y, 31) < 0.1 ? 0.3 : 0, broken: hf(x, y, 32) < 0.08 });
    f.place('crate_wood', 33, 72, 0); f.place('chair_stack', 32, 74, 0); f.place('chair_stack', 33, 74, 0);
    f.place('pallet', 6, 74, 0); f.place('pallet', 7, 74, 0);
    wallAt(b, 'zg_pa_speaker', 13, y0, 'n'); wallAt(b, 'clock_wall', 26, y0, 'n');
    f.floorItem('basketball', 15, 63); f.floorItem('basketball', 26, 58); f.floorItem('whistle', 20, 70);
    // locker rooms (y 76..91)
    for (const [lx0, lx1, girls] of [[5, 19, false], [20, 34, true]] as [number, number, boolean][]) {
      b.fillFloor(lx0, 76, lx1, 91, 'tile_white');
      b.roomWalls(lx0, 76, lx1, 91, 'cinder');
      b.paper(lx0, 76, lx1, 91, 'wall_bathroom');
      b.addRoom(girls ? "Girls' Locker Room" : "Boys' Locker Room", 'locker_room', lx0, 76, lx1, 91, { circuit: C_GYM, temp: 18 });
      b.door(lx0 + 7, 76, 0, 'door_school', {});
      signAt(b, lx0 + 6, 75, 's', girls ? 'GIRLS' : 'BOYS', 2.1);
      for (let x = lx0; x <= lx1; x++) if (x !== lx0 + 7) b.obj('locker', x, 77, 0, { loot: 'gym_locker' });
      for (let x = lx0 + 2; x <= lx1 - 2; x++) if (x !== lx0 + 7) b.obj('locker', x, 82, 0, { loot: 'gym_locker' });
      f.place('bench', lx0 + 2, 80, 0); f.place('bench', lx0 + 9, 80, 0); f.place('bench', lx0 + 4, 84, 0);
      for (let x = lx0 + 1; x <= lx1 - 1; x += 3) f.place('shower_stall', x, 91, WBACK.s);
      f.place('sink_bathroom', lx0, 87, WBACK.w); f.place('sink_bathroom', lx0, 88, WBACK.w);
      wallAt(b, 'mirror', lx0, 87, 'w'); wallAt(b, 'mirror', lx0, 88, 'w');
      for (const [x, y] of [[lx0 + 4, 79], [lx0 + 10, 79], [lx0 + 7, 86]]) b.obj('light_fluoro', x, y, 0, { circuit: C_GYM, flicker: girls ? 0 : 0.15 });
      for (let i = 0; i < 4; i++) f.decal('decal_puddle', rng.int(lx0, lx1), rng.int(86, 91), 1.2, 1.2);
      lootIn(f, rng, 'gym_locker', lx0, 78, lx1, 90, 1);
    }
  }

  // ------------------------------------------------------------ kitchen + lunchroom
  {
    const kx0 = 35, kx1 = 43, lx1 = 59, y0 = 46, y1 = 63;
    b.fillFloor(kx0, y0, kx1, y1, 'tile_kitchen'); b.paper(kx0, y0, kx1, y1, 'wall_kitchen');
    b.roomWalls(kx0, y0, kx1, y1, 'drywall');
    b.addRoom('Kitchen', 'kitchen', kx0, y0, kx1, y1, { circuit: C_LUNCH, temp: 19 });
    b.fillFloor(kx1 + 1, y0, lx1, y1, 'checker'); b.paper(kx1 + 1, y0, lx1, y1, 'wall_school');
    b.roomWalls(kx1 + 1, y0, lx1, y1, 'drywall');
    b.addRoom('Lunchroom', 'cafeteria', kx1 + 1, y0, lx1, y1, { circuit: C_LUNCH });
    // doors
    b.door(40, SH, 0, 'door_metal', { sign: 'staff' });
    b.door(kx1 + 1, 61, 1, 'door_office', {});
    for (const x of [50, 51]) b.door(x, y0, 0, 'door_school', { open: x === 50 });
    b.door(53, SH, 0, 'door_school', {});
    for (const y of [54, 55]) b.door(SP, y, 1, 'door_school', { open: y === 54 });
    signAt(b, 52, MH + 3, 's', 'LUNCHROOM', 2.1);
    // serving hatch with counters on the kitchen side
    for (let y = 49; y <= 56; y++) { b.window(kx1 + 1, y, 1, { style: 'window_metal', curtains: 'none', glass: 'none' }); f.place('counter_kitchen', kx1, y, WBACK.e, { loot: 'cafeteria' }); }
    for (const y of [49, 53]) f.place('food_court_counter', kx1 + 1, y, WFACE.e);
    // kitchen
    for (let x = kx0; x <= kx0 + 4; x++) f.place(x === kx0 + 2 ? 'counter_sink' : 'stove', x, y0, 0);
    f.place('fridge', kx0, 50, WBACK.w, { loot: 'cafeteria' }); f.place('fridge', kx0, 51, WBACK.w, { loot: 'cafeteria' });
    f.place('freezer_chest', kx0, 54, WBACK.w, { loot: 'freezer' });
    for (let y = 57; y <= 62; y++) f.place('shelf_metal', kx0, y, WBACK.w, { loot: 'cafeteria' });
    f.place('counter_kitchen', 38, 53, 0, { loot: 'kitchen_counter' }); f.place('counter_kitchen', 39, 53, 0, { loot: 'kitchen_counter' });
    f.place('mop_bucket', 42, 62, 0);
    for (const y of [49, 54, 59]) b.obj('light_fluoro', 39, y, 0, { circuit: C_LUNCH });
    // lunchroom: long tables, the clock, the milk cooler, vending
    for (const ty of [48, 51, 54, 57]) for (const tx of [47, 51, 55]) {
      if (tx === 51 && ty === 54) continue;
      f.place('cafeteria_table', tx, ty, 0);
    }
    f.place('fridge', lx1, 46, WBACK.e, { loot: 'cafeteria' });
    f.place('vending_snack', 46, y1, WBACK.s); f.place('vending_soda', 47, y1, WBACK.s);
    for (const x of [49, 57]) f.place('trash_can', x, y1, 0);
    wallAt(b, 'clock_wall', 54, y0, 'n'); wallAt(b, 'zg_pa_speaker', 57, y0, 'n');
    for (let k = 0; k < 5; k++) wallAt(b, 'zg_wall_drawing', lx1, 48 + k * 3, 'e', { v: k });
    for (let y = 48; y <= 62; y += 4) for (let x = 47; x <= 57; x += 5) b.obj('light_fluoro', x, y, 0, { circuit: C_LUNCH, flicker: hf(x, y, 41) < 0.12 ? 0.25 : 0 });
    lootIn(f, rng, 'cafeteria', kx1 + 1, y0, lx1, y1, 3);
    for (let i = 0; i < 8; i++) f.decal(rng.pick(['decal_stain_dark', 'decal_trash', 'decal_stain_water']), rng.int(45, 58), rng.int(47, 62), rng.float(0.6, 1.2), rng.float(0.6, 1.2));
    for (const y of [50, 58]) b.obj('light_fluoro', SP + 1, y, 0, { circuit: C_FRONT });
  }

  // ------------------------------------------------------------ the library (its stacks rearrange)
  {
    const x0 = 64, y0 = 46, x1 = 95, y1 = 63;
    b.fillFloor(x0, y0, x1, y1, 'carpet_office'); b.paper(x0, y0, x1, y1, 'wall_paneling');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Library', 'library', x0, y0, x1, y1, { circuit: C_LIB });
    for (const x of [79, 80]) b.door(x, y0, 0, 'door_glass', {});
    b.door(70, SH, 0, 'door_school', {});
    b.door(x0, 54, 1, 'door_school', {});
    signAt(b, 78, MH + 3, 's', 'LIBRARY', 2.1);
    signAt(b, SP + 3, 52, 'e', 'LIBRARY >', 2.1);
    registerShift(z, 'library', x0, y0, x1, y1, 3, (sb, srng, v) => library(sb, srng, v, x0, y0, x1, y1));
  }

  // ------------------------------------------------------------ music and art
  {
    const y0 = 46, y1 = 63;
    b.fillFloor(96, y0, 110, y1, 'wood'); b.paper(96, y0, 110, y1, 'wall_school');
    b.roomWalls(96, y0, 110, y1, 'drywall');
    b.addRoom('Music Room', 'music', 96, y0, 110, y1, { circuit: C_ARTS });
    b.door(100, y0, 0, 'door_school', {}); b.door(104, SH, 0, 'door_school', {});
    signAt(b, 99, MH + 3, 's', 'MUSIC', 2.1);
    f.place('piano', 97, y0, 0); f.place('piano', 107, y0, 0);
    wallAt(b, 'chalkboard', 102, y0, 'n');
    f.place('teacher_desk', 102, 49, 0);
    for (let k = 0; k < 3; k++) {
      const r = 4 + k * 2.2;
      for (let a = -1.2; a <= 1.2; a += 0.38 / (1 + k * 0.4)) {
        const x = Math.round(103 + Math.sin(a) * r), y = Math.round(49 + Math.cos(a) * r * 0.85);
        f.place('chair_folding', x, y, WFACE.n, { yaw: -a * 0.6 });
      }
    }
    f.place('bookshelf', 110, 58, WBACK.e); f.place('bookshelf', 110, 59, WBACK.e);
    f.place('tv_stand', 96, 61, WBACK.w); f.onTop('tv_crt', z.objectsAt(96, 61)[0] || null, { on: true });
    wallAt(b, 'zg_pa_speaker', 109, y0, 'n'); wallAt(b, 'clock_wall', 105, y0, 'n');
    for (let y = 49; y <= 61; y += 4) for (const x of [99, 106]) b.obj('light_fluoro', x, y, 0, { circuit: C_ARTS });
    // art
    b.fillFloor(111, y0, 122, y1, 'linoleum'); b.paper(111, y0, 122, y1, 'wall_school');
    b.roomWalls(111, y0, 122, y1, 'drywall');
    b.addRoom('Art Room', 'art', 111, y0, 122, y1, { circuit: C_ARTS });
    b.door(114, y0, 0, 'door_school', {}); b.door(117, SH, 0, 'door_school', {});
    signAt(b, 113, MH + 3, 's', 'ART', 2.1);
    for (const [tx, ty] of [[113, 49], [117, 49], [113, 54], [117, 54], [113, 59], [117, 59]] as const) {
      const t = f.place('display_table', tx, ty, 0);
      if (t) { b.obj('zg_crayon_drawing', tx, ty, 0, { y: 0.77 }); b.obj('zg_crayon_drawing', tx + 1, ty, 2, { y: 0.77 }); }
      f.place('chair_plastic', tx, ty - 1, WFACE.s); f.place('chair_plastic', tx + 1, ty + 1, WFACE.n);
    }
    f.place('counter_sink', 122, 47, WBACK.e); f.place('counter_kitchen', 122, 48, WBACK.e, { loot: 'classroom_supplies' });
    f.place('shelf_metal', 122, 52, WBACK.e, { loot: 'classroom_supplies' }); f.place('shelf_metal', 122, 53, WBACK.e, { loot: 'classroom_supplies' });
    for (let x = 112; x <= 121; x++) wallAt(b, 'zg_wall_drawing', x, y0, 'n', { v: x });
    for (let y = 48; y <= 62; y++) wallAt(b, 'zg_wall_drawing', 111, y, 'w', { v: y });
    for (let y = 49; y <= 61; y += 4) b.obj('light_fluoro', 116, y, 0, { circuit: C_ARTS, flicker: y === 57 ? 0.2 : 0 });
    lootIn(f, rng, 'classroom_supplies', 111, y0, 122, y1, 3);
  }

  // ------------------------------------------------------------ the South Hall
  {
    lockersH(c, 35, 122, SH, 'n', (x) => x >= SP && x <= SP + 3);
    lockersH(c, 35, 122, SH + 3, 's', (x) => x >= SP && x <= 69);
    for (let x = 37; x <= 121; x += 5) b.obj('light_fluoro', x, SH + 1 + ((x / 5) & 1), 0, { circuit: C_FRONT, broken: hf(x, 19, seed & 0xffff) < 0.1, flicker: hf(x, 20, seed & 0xffff) < 0.12 ? 0.25 : 0 });
    for (const x of [44, 76, 98, 120]) wallAt(b, 'zg_pa_speaker', x, SH, 'n');
    signAt(b, SP + 3, SH + 1, 'e', '< GYM', 2.2);
    signAt(b, SP, SH + 1, 'w', 'LIBRARY >', 2.2);
  }

  // ------------------------------------------------------------ the front: lounge, workroom, office, principal
  {
    // teachers' lounge
    b.fillFloor(35, 68, 47, 79, 'carpet_office'); b.paper(35, 68, 47, 79, 'wall_house_stripe');
    b.roomWalls(35, 68, 47, 79, 'drywall');
    b.addRoom("Teachers' Lounge", 'breakroom', 35, 68, 47, 79, { circuit: C_FRONT });
    b.door(41, 68, 0, 'door_office', { sign: 'staff' });
    signAt(b, 43, SH + 3, 's', 'TEACHERS', 2.1);
    f.place('sofa', 35, 74, WBACK.w);
    f.place('armchair', 39, 72, WFACE.s); f.place('coffee_table', 38, 75, 0);
    const k1 = f.place('counter_kitchen', 42, 79, WBACK.s); f.onTop('coffee_maker', k1, {});
    const k2 = f.place('counter_kitchen', 43, 79, WBACK.s); f.onTop('microwave', k2, {});
    f.place('counter_sink', 44, 79, WBACK.s); f.place('fridge', 45, 79, WBACK.s, { loot: 'fridge_office' });
    f.place('vending_soda', 47, 70, WBACK.e);
    f.place('table_round', 43, 73, 0); f.place('chair_plastic', 42, 73, WFACE.e); f.place('chair_plastic', 44, 73, WFACE.w);
    wallAt(b, 'noticeboard', 35, 70, 'w'); wallAt(b, 'clock_wall', 44, 68, 'n');
    for (const [x, y] of [[38, 71], [43, 76]] as const) b.obj('light_fluoro', x, y, 0, { circuit: C_FRONT });
    lootIn(f, rng, 'break_room', 35, 68, 47, 79, 2);
    // workroom
    b.fillFloor(35, 80, 47, 91, 'linoleum'); b.roomWalls(35, 80, 47, 91, 'drywall');
    b.addRoom('Workroom', 'copy', 35, 80, 47, 91, { circuit: C_FRONT });
    b.door(38, 80, 0, 'door_office', {});
    f.place('copier', 35, 82, WBACK.w); f.place('copier', 35, 84, WBACK.w); f.place('printer_desk', 35, 86, WBACK.w);
    for (let x = 39; x <= 46; x++) f.place('shelf_metal', x, 91, WBACK.s, { loot: x % 2 ? 'classroom_supplies' : 'office_drawer' });
    f.place('display_table', 41, 85, 0); f.place('cardboard_stack', 47, 81, 0); f.place('cardboard_box', 46, 81, 0);
    b.obj('light_fluoro', 41, 86, 0, { circuit: C_FRONT, flicker: 0.15 });
    // main office
    b.fillFloor(48, 68, 59, 79, 'carpet_office'); b.paper(48, 68, 59, 79, 'wall_office');
    b.roomWalls(48, 68, 59, 79, 'drywall');
    b.addRoom('Main Office', 'office', 48, 68, 59, 79, { circuit: C_FRONT });
    b.door(SP, 74, 1, 'door_glass', { sign: 'office' });
    b.door(48, 85, 1, 'door_office', {});
    f.place('reception_desk', 56, 73, WFACE.e);
    f.place('chair_office', 55, 73, WFACE.e);
    f.place('waiting_chairs', 52, 79, WBACK.s);
    for (const x of [48, 49, 50]) f.place('filing_cabinet', x, 68, 0);
    f.place('desk_office', 50, 72, 0); f.onTop('computer', z.objectsAt(50, 72)[0] || null, {}); f.place('chair_office', 50, 73, WFACE.n);
    f.place('plant_tall', 59, 68, 0);
    wallAt(b, 'noticeboard', 53, 68, 'n'); wallAt(b, 'clock_wall', 56, 68, 'n'); wallAt(b, 'zg_pa_speaker', 58, 68, 'n');
    for (const [x, y] of [[51, 71], [56, 76]] as const) b.obj('light_fluoro', x, y, 0, { circuit: C_FRONT });
    // principal's office: the announcements are read from here
    b.fillFloor(48, 80, 59, 91, 'carpet_red'); b.paper(48, 80, 59, 91, 'wall_paneling');
    b.roomWalls(48, 80, 59, 91, 'drywall');
    b.addRoom("Principal's Office", 'principal', 48, 80, 59, 91, { circuit: C_FRONT });
    b.door(54, 80, 0, 'door_wood', { sign: 'office' });
    signAt(b, 53, 79, 's', 'PRINCIPAL', 2.15);
    for (const x of [51, 55]) b.window(x, 92, 0, { style: 'window_metal', curtains: 'closed' });
    const desk = f.place('desk_office', 53, 87, 0);
    f.place('chair_office', 53, 88, WFACE.n);
    f.place('chair_wood', 53, 85, WFACE.s); f.place('chair_wood', 54, 85, WFACE.s);
    const pa = f.place('radio_console', 57, 90, WBACK.s, { lore: 'school_announcement' });
    void pa;
    f.place('chair_office', 57, 89, WFACE.s);
    f.place('bookshelf', 48, 82, WBACK.w); f.place('bookshelf', 48, 83, WBACK.w); f.place('filing_cabinet', 59, 82, WBACK.e);
    f.place('plant_potted', 48, 91, 0);
    if (desk) { f.onTop('lamp_table', desk, { circuit: C_FRONT }); itemAt(z, rng, 'note', desk.x + 1, desk.y, 0.77, { lore: 'school_announcement' }, 0.1); }
    wallAt(b, 'painting', 52, 80, 'n', { v: 1 }); wallAt(b, 'clock_wall', 50, 80, 'n');
    wallAt(b, 'photo_frames', 59, 86, 'e', { v: 1 });
    b.obj('light_fluoro', 53, 84, 0, { circuit: C_FRONT }); b.obj('light_bulb', 57, 88, 0, { circuit: C_FRONT, flicker: 0.1 });
    decal(z, 'carpet_rug', 54, 86.5, 4, 3, 0, 0x2a3a6a);
  }

  // ------------------------------------------------------------ attendance + the nurse's office
  {
    b.fillFloor(70, 68, 79, 79, 'linoleum_school'); b.roomWalls(70, 68, 79, 79, 'drywall');
    b.addRoom('Attendance', 'office', 70, 68, 79, 79, { circuit: C_FRONT });
    b.door(70, 72, 1, 'door_office', {});
    f.place('desk_office', 75, 71, 0); f.place('chair_office', 75, 72, WFACE.n);
    f.place('waiting_chairs', 71, 79, WBACK.s); f.place('filing_cabinet', 79, 68, 0); f.place('filing_cabinet', 78, 68, 0);
    wallAt(b, 'noticeboard', 73, 68, 'n');
    b.obj('light_fluoro', 74, 74, 0, { circuit: C_FRONT });
    // the nurse: two cots, a curtain, the medicine cabinet, and a back door that is a hospital door
    const x0 = 70, y0 = 80, x1 = 79, y1 = 91;
    b.fillFloor(x0, y0, x1, y1, 'linoleum_green'); b.paper(x0, y0, x1, y1, 'wall_hospital');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.vwall(x0, y0, y1, 'drywall');
    b.addRoom("Nurse's Office", 'nurse', x0, y0, x1, y1, { circuit: C_FRONT, temp: 20 });
    b.door(x0, 84, 1, 'door_white', {});
    b.door(74, y0, 0, 'door_white', {});
    for (const x of [72, 78]) b.window(x, 92, 0, { style: 'window_metal', curtains: 'closed' });
    // the back door
    b.door(76, 92, 0, 'door_hospital', { portal: 'p_school_nurse' });
    b.portal({ id: 'p_school_nurse', x: 76, y: y1, kind: 'door', to: 'hospital', tx: 28, ty: 6, face: ANG.n, label: 'Open the back door' });
    arrive(b, 'r_school_nurse', 76, 89, ANG.n, 3);
    f.place('bed_single', 71, 86, 1); f.place('curtain_screen', 71, 85, 0);
    f.place('bed_single', 71, 89, 1);
    f.place('medical_cabinet', 79, 82, WBACK.e, { loot: 'nurse_office' });
    f.place('medical_cabinet', 79, 83, WBACK.e, { loot: 'medicine_cabinet' });
    const nd = f.place('desk_office', 76, 81, 0, { loot: 'nurse_office' });
    if (nd) f.onTop('lamp_table', nd, { circuit: C_FRONT });
    f.place('chair_office', 76, 82, WFACE.n);
    f.place('sink_bathroom', 79, 87, WBACK.e); wallAt(b, 'mirror', 79, 87, 'e');
    f.place('wheelchair', 78, 90, WFACE.w);
    wallAt(b, 'poster', 70, 81, 'w', { v: 2 }); wallAt(b, 'zg_pa_speaker', 72, y0, 'n');
    wallAt(b, 'xray_lightbox', 70, 88, 'w', { on: true });
    signAt(b, 76, y1, 's', 'EXIT >', 2.25);
    for (const [x, y] of [[73, 83], [76, 87]] as const) b.obj('light_fluoro', x, y, 0, { circuit: C_FRONT, flicker: y === 87 ? 0.2 : 0 });
    f.floorItem('first_aid_kit', 77, 84); f.floorItem('bandage', 72, 88);
    decal(z, 'decal_footprints', 76.5, 90.2, 0.7, 0.9, Math.PI, 0x6a6458, 0.5);
  }

  // ------------------------------------------------------------ kindergarten
  {
    const x0 = 80, y0 = 68, x1 = 101, y1 = 91;
    b.fillFloor(x0, y0, x1, y1, 'carpet_kids'); b.paper(x0, y0, x1, y1, 'wall_kids');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Kindergarten', 'kindergarten', x0, y0, x1, y1, { circuit: C_KIND });
    b.door(84, y0, 0, 'door_school', {}); b.door(97, y0, 0, 'door_school', {});
    signAt(b, 86, SH + 3, 's', 'KINDERGARTEN', 2.1);
    for (const x of [83, 88, 93, 98]) b.window(x, 92, 0, { style: 'window_metal', curtains: 'closed' });
    // little tables and chairs
    for (const [tx, ty] of [[84, 72], [89, 72], [94, 72], [84, 77], [89, 77], [94, 77]] as const) {
      f.place('table_round', tx, ty, 0);
      f.place('chair_plastic', tx - 1, ty, WFACE.e); f.place('chair_plastic', tx + 1, ty, WFACE.w); f.place('chair_plastic', tx, ty + 1, WFACE.n);
      b.obj('zg_crayon_drawing', tx, ty, 0, { y: 0.79 });
    }
    // nap mats, the reading corner, cubbies along the wall
    for (let x = 82; x <= 98; x += 2) f.place('bedroll', x, 84, 0);
    for (let x = 82; x <= 98; x += 2) f.place('bedroll', x, 88, 0);
    for (let y = 70; y <= 82; y++) f.place('locker', x1, y, WBACK.e, { loot: 'kids_room' });
    f.place('toy_box', 80, 70, WBACK.w); f.place('toy_box', 80, 71, WBACK.w);
    f.place('rocking_horse', 81, 80, WFACE.e); f.place('dollhouse', 80, 82, WBACK.w); f.place('teddy_giant', 80, 90, WFACE.e);
    f.place('bookshelf', 99, 91, WBACK.s); f.place('bookshelf', 98, 91, WBACK.s);
    wallAt(b, 'chalkboard', 89, y0, 'n'); wallAt(b, 'zg_pa_speaker', 93, y0, 'n'); wallAt(b, 'clock_wall', 86, y0, 'n');
    for (let k = 0; k < 8; k++) wallAt(b, 'zg_wall_drawing', 80, 74 + k, 'w', { v: k });
    for (let y = 71; y <= 89; y += 5) for (const x of [85, 95]) b.obj('light_fluoro', x, y, 0, { circuit: C_KIND, flicker: hf(x, y, 51) < 0.15 ? 0.2 : 0 });
    lootIn(f, rng, 'toys', x0, y0, x1, y1, 5);
    decal(z, 'carpet_rug', 90.5, 86, 6, 5, 0, 0xd8a0c0);
  }

  // ------------------------------------------------------------ restrooms + boiler room
  {
    b.fillFloor(102, 68, 111, 79, 'tile_white');
    b.roomWalls(102, 68, 106, 79, 'drywall'); b.roomWalls(107, 68, 111, 79, 'drywall');
    b.addRoom("Boys' Restroom", 'restroom', 102, 68, 106, 79, { circuit: C_FRONT });
    b.addRoom("Girls' Restroom", 'restroom', 107, 68, 111, 79, { circuit: C_FRONT });
    b.door(103, 68, 0, 'door_white', { sign: 'restroom' }); b.door(108, 68, 0, 'door_white', { sign: 'restroom' });
    signAt(b, 104, SH + 3, 's', 'BOYS', 2.1); signAt(b, 109, SH + 3, 's', 'GIRLS', 2.1);
    restroom(c, 102, 68, 106, 79, true, C_FRONT);
    restroom(c, 107, 68, 111, 79, false, C_FRONT);
    b.fillFloor(102, 80, 111, 91, 'concrete'); b.paper(102, 80, 111, 91, 'wall_cinder');
    b.roomWalls(102, 80, 111, 91, 'cinder');
    b.addRoom('Boiler Room', 'boiler', 102, 80, 111, 91, { circuit: C_BOIL, temp: 26 });
    b.door(102, 86, 1, 'door_metal', { sign: 'danger' });
    f.place('boiler', 105, 82, 0); f.place('boiler', 108, 82, 0);
    f.place('water_heater', 111, 88, WBACK.e); f.place('electrical_cabinet', 111, 90, WBACK.e);
    wallAt(b, 'breaker_panel', 106, 80, 'n'); wallAt(b, 'pipes_cluster', 102, 82, 'w'); wallAt(b, 'pipes_cluster', 104, 80, 'n');
    f.place('tool_chest', 104, 91, WBACK.s); f.place('shelf_metal', 106, 91, WBACK.s, { loot: 'maintenance' });
    b.obj('light_bulb', 106, 86, 0, { circuit: C_BOIL, flicker: 0.2 });
    f.floorItem('flashlight', 107, 89);
  }

  // ------------------------------------------------------------ Room 0: a corridor that is never the same length
  {
    const x0 = 112, y0 = 68, x1 = 122, y1 = 91;
    b.fillFloor(x0, y0, x1, y1, 'linoleum_school'); b.paper(x0, y0, x1, y1, 'wall_school');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Room 0', 'room_zero', x0, y0, x1, y1, { circuit: C_ZERO });
    b.gap(115, y0, 0); b.gap(116, y0, 0);
    signAt(b, 117, SH + 3, 's', 'ROOM 0', 2.1);
    registerShift(z, 'room_zero', x0, y0, x1, y1, 4, (sb, srng, v) => roomZero(sb, srng, v, x0, y0, x1, y1));
  }

  // ------------------------------------------------------------ the outside of the building: windows along the halls' ends
  for (const y of [NH + 1, MH + 1]) { b.window(5, y, 1, { style: 'window_metal', curtains: 'none' }); b.window(123, y, 1, { style: 'window_metal', curtains: 'none' }); }

  // ------------------------------------------------------------ clutter, decals, loot
  {
    const ok = (x: number, y: number) => !(z.flags[z.idx(x, y)] & (TF.SHIFT | TF.NOSPAWN));
    scatter(f, rng, 5, MH, 122, 91, 160, [['decal_stain_water', 3], ['decal_stain_dark', 2], ['decal_footprints', 2], ['decal_trash', 1.5], ['decal_crack', 1]], 0.7, 1.5, ok);
    scatter(f, rng, 5, 31, 122, 41, 30, [['decal_stain_water', 3], ['decal_footprints', 2], ['decal_trash', 1]], 0.7, 1.4, ok);
    lootIn(f, rng, 'school_locker', 5, MH, 122, SH + 3, 6, (x, y) => ok(x, y) && z.roomAt(x, y).type === 'hallway');
    lootIn(f, rng, 'floor_generic', 5, 5, 122, 91, 18, ok);
    lootIn(f, rng, 'snacks', 5, 5, 122, 91, 6, ok);
    lootIn(f, rng, 'lore_bits', 5, 5, 122, 91, 4, ok);
    const toys = ['crayons', 'jump_rope', 'marbles', 'toy_car', 'teddy_bear', 'juice_box', 'childrens_book', 'backpack_school'];
    for (let i = 0; i < 14; i++) { const x = rng.int(16, 122), y = rng.int(20, 91); if (ok(x, y) && openTile(z, x, y)) f.floorItem(rng.pick(toys), x, y); }
  }

  // ------------------------------------------------------------ power, env, creatures
  for (let cc = 1; cc <= 10; cc++) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0x3a3c34, ambientI: 0.55, fog: 0x1c1e1a, fogNear: 14, fogFar: 34, void: 0x0c0d0b, temp: 20,
    grade: 'school', reverb: 'hall', ambience: 'school', music: 'musicbox',
  };
  z.spawnTable = [['echo', 2], ['swivel', 2], ['plushkin', 1], ['employee', 1], ['lamplighter', 1]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['terminal_generic'];
  z.meta.shiftRate = 1;
  // a few classrooms are wrong (world stream 3)
  wrongRoomsIn(z, b, seed ^ 0x77a3, ['classroom'], 3, ['chairs_corner', 'upside_down', 'high_door', 'tiny_door', 'tv_backs'], { paper: 'wall_school' });
  // the outer walls are brick wherever a room redrew them
  b.hwall(5, 122, 5, 'brick'); b.hwall(5, 122, 92, 'brick'); b.vwall(5, 5, 91, 'brick'); b.vwall(123, 5, 91, 'brick');
  return b;
}

// =====================================================================
// shift stamps
// =====================================================================
/** the library: 0 tidy stacks + reading tables, 1 a maze of shelves, 2 stacks pushed to the walls around one long table */
function library(sb: ZoneBuilder, rng: Rng, v: number, x0: number, y0: number, x1: number, y1: number) {
  const f = new Furnisher(sb, rng);
  sb.fillFloor(x0, y0, x1, y1, 'carpet_office');
  // aisles every variant keeps clear: from the north doors (79..80) down, the west door (row 54) across, the south door (x 70)
  const keep = (x: number, y: number) => x === 79 || x === 80 || y === 54 || y === 55 || (x === 70 && y >= 55) || y === y1 || (x >= x0 && x <= x0 + 1 && y >= 54);
  const shelf = (x: number, y: number, r: Rot) => { if (keep(x, y) || keep(x + (r % 2 === 0 ? 1 : 0), y + (r % 2 === 0 ? 0 : 1))) return null; return f.place('library_shelf', x, y, r, { loot: 'bookshelf' }); };
  const lamp = (x: number, y: number, o: Record<string, any> = {}) => sb.obj('light_fluoro', x, y, 0, { circuit: C_LIB, ...o });
  if (v === 0) {
    for (let y = y0 + 1; y <= y1 - 2; y += 3) for (let x = 82; x <= x1 - 1; x += 3) { shelf(x, y, 0); shelf(x, y + 1, 2); }
    for (const [tx, ty] of [[67, 48], [72, 48], [67, 58], [74, 58]] as const) {
      f.place('table_dining', tx, ty, 0);
      f.place('chair_wood', tx, ty - 1, WFACE.s); f.place('chair_wood', tx + 1, ty - 1, WFACE.s); f.place('chair_wood', tx, ty + 1, WFACE.n); f.place('chair_wood', tx + 1, ty + 1, WFACE.n);
    }
    f.place('reception_desk', 76, 51, 0); f.place('chair_office', 76, 50, WFACE.s);
    for (const x of [64, 65, 66]) f.place('filing_cabinet', x, y0, 0);
    f.place('armchair', 66, 52, WFACE.e); f.place('armchair', 68, 52, WFACE.w); f.place('teddy_giant', 67, 51, WFACE.s);
    sb.obj('globe', 76, 51, 0, { y: 1.12 });
    for (let y = y0 + 2; y <= y1; y += 4) for (let x = x0 + 3; x <= x1; x += 5) lamp(x, y, { flicker: rng.chance(0.1) ? 0.2 : 0 });
  } else if (v === 1) {
    // a maze: shelves on a tight grid, turned every which way
    for (let y = y0 + 1; y <= y1 - 1; y += 2) for (let x = x0 + 2; x <= x1 - 1; x += 3) shelf(x, y, rng.chance(0.5) ? 0 : 2);
    f.place('chair_wood', 72, 59, WFACE.n);
    for (let y = y0 + 2; y <= y1; y += 5) for (let x = x0 + 4; x <= x1; x += 7) lamp(x, y, { broken: rng.chance(0.3) });
  } else {
    // every shelf against the walls; one long table for thirty down the middle
    for (let x = x0 + 2; x <= x1 - 2; x += 2) { shelf(x, y0, 0); shelf(x, y1 - 1, 2); }
    for (let x = 67; x <= 91; x += 2) {
      if (keep(x, 51) || keep(x + 1, 51)) continue;
      f.place('table_dining', x, 51, 0);
      f.place('chair_wood', x, 50, WFACE.s); f.place('chair_wood', x + 1, 50, WFACE.s);
      f.place('chair_wood', x, 52, WFACE.n); f.place('chair_wood', x + 1, 52, WFACE.n);
    }
    for (let x = x0 + 3; x <= x1; x += 6) lamp(x, 51);
    for (let x = x0 + 3; x <= x1; x += 6) lamp(x, 59, { flicker: 0.2 });
  }
  void hf;
}

/**
 * Room 0: the opening in the South Hall leads into a corridor whose length
 * changes — straight down to a small classroom, a long switchback, a
 * zigzag lined with lockers, or no corridor at all: one huge empty room.
 */
function roomZero(sb: ZoneBuilder, rng: Rng, v: number, x0: number, y0: number, x1: number, y1: number) {
  const f = new Furnisher(sb, rng);
  const z = sb.z;
  sb.fillFloor(x0, y0, x1, y1, 'linoleum_school');
  const lamp = (x: number, y: number, o: Record<string, any> = {}) => sb.obj('light_fluoro', x, y, 0, { circuit: C_ZERO, flicker: 0.2, ...o });
  /** the little classroom at the end */
  const zeroRoom = (rx0: number, ry0: number, rx1: number, ry1: number) => {
    for (let y = ry0 + 1; y <= ry1 - 1; y += 2) for (let x = rx0 + 1; x <= rx1 - 1; x += 2) {
      const d = f.place('desk_school', x, y, WFACE.s);
      if (d) sb.obj('zg_crayon_drawing', x, y, WFACE.s, { y: 0.745 });
    }
    wallAt(sb, 'chalkboard', Math.floor((rx0 + rx1) / 2), ry1, 's');
    wallAt(sb, 'zg_pa_speaker', rx0, ry0 + 1, 'w');
    lamp(Math.floor((rx0 + rx1) / 2), Math.floor((ry0 + ry1) / 2), { flicker: 0.35 });
  };
  if (v === 0) {
    // short: six steps down a corridor, a door, Room 0
    sb.vwall(115, y0, 75, 'drywall'); sb.vwall(117, y0, 75, 'drywall');
    sb.hwall(x0, x1, 76, 'drywall');
    sb.door(115, 76, 0, 'door_school', {}); sb.door(116, 76, 0, 'door_school', {});
    for (let y = y0; y <= 75; y++) for (let x = x0; x <= x1; x++) if (x < 115 || x > 116) z.floor[z.idx(x, y)] = 0;
    for (let y = y0 + 1; y <= 75; y += 2) wallAt(sb, 'zg_wall_drawing', 115, y, 'w', { v: y });
    lamp(116, 71);
    zeroRoom(x0, 76, x1, y1);
  } else if (v === 1) {
    // long: down the west side, back up the middle, down the east side
    // in at the top of the middle lane, which is shut below: west lane down, middle lane up, east lane down
    sb.hwall(115, 118, y0 + 1, 'drywall');
    sb.vwall(115, y0 + 1, y1 - 2, 'drywall');
    sb.vwall(119, y0, y0 + 1, 'drywall'); sb.vwall(119, y0 + 4, y1, 'drywall');
    sb.hwall(119, x1, y1 - 5, 'drywall'); sb.door(121, y1 - 5, 0, 'door_school', {});
    for (let y = y0 + 3; y <= y1 - 2; y += 4) { lamp(113, y); lamp(117, y + 2, { broken: rng.chance(0.25) }); if (y < y1 - 6) lamp(121, y); }
    for (let y = y0 + 3; y <= y1 - 4; y += 2) f.place('locker', 118, y, WBACK.e);
    zeroRoom(119, y1 - 5, x1, y1);
  } else if (v === 2) {
    // a zigzag lined with lockers, all the way down
    for (let k = 0; k < 7; k++) {
      const y = y0 + 3 + k * 3;
      if (y > y1 - 4) break;
      sb.hwall(x0, x1, y, 'drywall');
      const gx = k % 2 === 0 ? x1 - 1 : x0 + 1;
      sb.gap(gx, y, 0); sb.gap(gx + (k % 2 === 0 ? 1 : -1), y, 0);
      for (let x = x0 + 2; x <= x1 - 2; x += 2) f.place('locker', x, y, WBACK.n);
      lamp(117, y + 1, { broken: rng.chance(0.3) });
    }
    zeroRoom(x0, y1 - 3, x1, y1);
  } else {
    // no corridor: one big room and every desk turned to face the wall
    for (let y = y0 + 3; y <= y1 - 1; y += 2) for (let x = x0 + 1; x <= x1 - 1; x += 2) f.place('desk_school', x, y, WFACE.n);
    wallAt(sb, 'chalkboard', 116, y1, 's');
    for (let y = y0 + 3; y <= y1; y += 5) lamp(117, y, { flicker: 0.4 });
  }
  void z;
}

defZone({
  key: 'school', name: 'Meadowbrook Elementary', W, H, depth: 2,
  blurb: 'Linoleum and locker doors. The bell rings for a class nobody is in. The PA clears its throat.',
  gen: (z, s) => { generateSchool(z, s); },
});
