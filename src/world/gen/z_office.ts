// Level 4 — the Meridian offices. A real corporate floor plate: a service core
// (elevators, stair B, restrooms, copy, electrical, comms) wrapped by a ring
// corridor; four blocks around it (Cubicle Farm A, the meeting suite with
// Conference Room C, reception + hot desks, the facilities & IT wing); a giant
// open-plan floor with a grid of columns; private offices around the windows.
// Then it goes wrong: a supply closet in the core opens onto the far corner of
// the open floor, the east wing corridor loops forever, an office door moves,
// cubicle clusters rearrange and the records corridor changes length while
// nobody watches. Mission: Workstation 4-07 (the voice on 88.1), Office 4-12
// (Doyle's keycard), Room 4-11 / Server Closet 07 / Rack 33 (render node SRV-1).
import { defZone } from '../worldGraph';
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { registerShift } from '../shift';
import {
  anchor, noSpawn, room, wallObj, lamp, decalAt, itemOn, itemAt, stash, scatterLoot, sectorPick,
  BACK, FACE, Rot, Side,
} from './meridian_kit';
import { wrongRoomsIn } from './wrong_kit';

// ---------------------------------------------------------------- plan
const PX0 = 5, PY0 = 5, PX1 = 110, PY1 = 138;       // floor plate interior
// core + ring corridor
const KX0 = 44, KX1 = 71, KY0 = 58, KY1 = 85;
const RX0 = 41, RX1 = 74, RY0 = 55, RY1 = 88;
// east wing
const EX0 = 113, EX1 = 138, EY0 = 6, EY1 = 137, ECX0 = 124, ECX1 = 126;
const LOOP_A = 40, LOOP_B = 101, LOOP_D = 60;

// circuits
const C_CORR = 1, C_FARM = 2, C_SUITE = 3, C_RECEP = 4, C_FLOOR_W = 5, C_FLOOR_E = 6, C_COPY = 7, C_FAC = 8, C_CORE = 9, C_REC = 10, C_WING = 11, C_CONF = 0;
let circuitSeq = 20;
let c443 = 0;

/** stamp: true inside shift stamps (no floor items or decals: those would pile up on every re-stamp) */
interface Ctx { z: Zone; b: ZoneBuilder; f: Furnisher; rng: Rng; seed: number; dead: Set<number>; stamp?: boolean }

// ---------------------------------------------------------------- small helpers
function isFree(z: Zone, x: number, y: number) { return z.inb(x, y) && z.floor[z.idx(x, y)] !== 0 && z.solid[z.idx(x, y)] === 0 && !z.objectsAt(x, y).some((o) => o.key !== 'light_fluoro' && o.key !== 'light_bulb'); }

/** local frame for a room whose "desk wall" is `side`: u along the wall, v away from it */
function frame(x0: number, y0: number, x1: number, y1: number, side: Side) {
  const W = side === 'n' || side === 's' ? x1 - x0 + 1 : y1 - y0 + 1;
  const D = side === 'n' || side === 's' ? y1 - y0 + 1 : x1 - x0 + 1;
  const L = (u: number, v: number): [number, number] => {
    switch (side) {
      case 'n': return [x0 + u, y0 + v];
      case 's': return [x1 - u, y1 - v];
      case 'w': return [x0 + v, y1 - u];
      default: return [x1 - v, y0 + u];
    }
  };
  /** anchor tile for an object spanning n tiles along the wall starting at u */
  const span = (u: number, v: number, n: number): [number, number] => {
    const a = L(u, v), c = L(u + n - 1, v);
    return [Math.min(a[0], c[0]), Math.min(a[1], c[1])];
  };
  /** anchor for an object spanning n tiles away from the wall */
  const deep = (u: number, v: number, n: number): [number, number] => {
    const a = L(u, v), c = L(u, v + n - 1);
    return [Math.min(a[0], c[0]), Math.min(a[1], c[1])];
  };
  const opp: Side = side === 'n' ? 's' : side === 's' ? 'n' : side === 'w' ? 'e' : 'w';
  const left: Side = side === 'n' ? 'w' : side === 's' ? 'e' : side === 'w' ? 's' : 'n';
  const right: Side = side === 'n' ? 'e' : side === 's' ? 'w' : side === 'w' ? 'n' : 's';
  return { W, D, L, span, deep, back: BACK[side], away: FACE[opp], toward: FACE[side], opp, left, right };
}

/** visible walls for wall-mounted props: north and west */
function visibleWall(side: Side) { return side === 'n' || side === 'w'; }

function ws(n: number) { return '4-' + String(n).padStart(2, '0'); }

// ---------------------------------------------------------------- furniture sets
/**
 * A private office. `door` is the side the door is on; the desk backs onto the
 * opposite wall. `wrong` picks the one detail that is off in this copy.
 */
function furnishOffice(c: Ctx, x0: number, y0: number, x1: number, y1: number, door: Side, circuit: number, o: { wrong?: number; lore?: string; exec?: boolean; empty?: boolean } = {}): TileObject | null {
  const { z, b, f, rng } = c;
  const deskSide: Side = door === 'n' ? 's' : door === 's' ? 'n' : door === 'w' ? 'e' : 'w';
  const F = frame(x0, y0, x1, y1, deskSide);
  const mid = Math.floor((F.W - 2) / 2);
  lamp(b, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), circuit, { flicker: rng.chance(0.12) ? rng.float(0.1, 0.3) : 0 });
  if (o.empty) {
    // vacant: a single chair facing the wall and the outline of a desk in the carpet
    const [cx, cy] = F.L(mid, 1);
    b.obj('chair_office', cx, cy, F.toward, {});
    const [dx, dy] = F.L(mid, 0);
    if (!c.stamp) decalAt(z, 'decal_stain_dark', dx + 1, dy + 0.5, 2, 0.9, deskSide === 'n' || deskSide === 's' ? 0 : Math.PI / 2, 0x2a2620, 0.3);
    return null;
  }
  const [dx, dy] = F.span(mid, 0, 2);
  const desk = f.place(o.exec ? 'desk_office' : 'desk_office', dx, dy, F.back, {});
  let pc: TileObject | null = null;
  if (desk) pc = f.onTop('computer', desk, o.lore ? { lore: o.lore } : {});
  const [cx, cy] = F.L(mid, 1);
  const wrong = o.wrong ?? -1;
  // the chair: normally facing the desk. Sometimes facing the door. Once, on the desk.
  if (wrong === 0) b.obj('chair_office', dx, dy, F.back, { y: 0.76 });
  else f.place('chair_office', cx, cy, wrong === 1 ? F.away : F.toward, {});
  // storage along the desk wall
  if (F.W >= 5) { const [fx, fy] = F.L(F.W - 1, 0); f.place('filing_cabinet', fx, fy, F.back, {}); }
  if (F.W >= 6) { const [fx, fy] = F.L(0, 0); f.place(o.exec ? 'bookshelf' : 'filing_cabinet', fx, fy, F.back, {}); }
  // a bookshelf or plant on a side wall
  if (F.D >= 5) {
    const [bx, by] = F.L(0, F.D - 2);
    f.place(rng.chance(0.5) ? 'bookshelf' : 'plant_tall', bx, by, BACK[F.left], {});
  }
  const [px, py] = F.L(F.W - 1, F.D - 2);
  if (wrong === 2) f.place('plant_potted', px, py, BACK[F.opp], {}); else f.place(rng.chance(0.6) ? 'plant_potted' : 'trash_can', px, py, 0, {});
  // visitor chair(s)
  if (F.D >= 5) { const [vx, vy] = F.L(mid + (wrong === 3 ? 0 : 1), 3); f.place(wrong === 4 ? 'chair_stack' : 'chair_office', vx, vy, wrong === 3 ? F.away : F.toward, {}); }
  // wall dressing on a visible wall
  const vw: Side = visibleWall(deskSide) ? deskSide : visibleWall(F.left) ? F.left : F.right;
  const Fv = frame(x0, y0, x1, y1, vw);
  const [wx, wy] = Fv.L(Math.max(0, Math.floor(Fv.W / 2) + 1), 0);
  if (!z.objectsAt(wx, wy).some((q) => q.key === 'computer')) wallObj(b, wrong === 5 ? 'clock_wall' : 'painting', wx, wy, vw, { v: rng.int(0, 5) });
  if (rng.chance(0.5)) { const [sx, sy] = Fv.L(1, 0); wallObj(b, 'clock_wall', sx, sy, vw, {}); }
  if (o.exec) {
    const [gx, gy] = F.L(F.W - 2, F.D - 1);
    f.place('sofa', gx - 1, gy, BACK[F.opp], {});
    if (desk) f.onTop('globe', desk, {});
  }
  if (wrong === 6) { const [sx, sy] = F.L(mid, F.D - 1); b.obj('skeleton', sx, sy, 0, {}); }
  // a little floor clutter
  if (c.stamp) return pc;
  if (rng.chance(0.35)) { const [lx, ly] = F.L(rng.int(0, F.W - 1), rng.int(2, F.D - 1)); if (isFree(z, lx, ly)) f.floorLoot('office_supplies', lx, ly); }
  if (rng.chance(0.4)) f.decal(rng.pick(['decal_stain_water', 'decal_stain_dark', 'decal_trash']), rng.int(x0, x1), rng.int(y0, y1), rng.float(0.7, 1.3), rng.float(0.7, 1.3));
  return pc;
}

/**
 * Cubicle pod: two rows of `cells` 3x3 cells back to back, the north row open
 * to the north, the south row open to the south. Returns the computers.
 */
function pod(c: Ctx, x0: number, y0: number, cells: number, circuit: number, wsStart: number, opts: { empty?: number; lore?: Record<number, string>; lights?: boolean } = {}): number {
  const { b, f, rng } = c;
  const x1 = x0 + cells * 3 - 1;
  b.hwall(x0, x1, y0 + 3, 'cubicle');
  for (let k = 0; k <= cells; k++) { b.vwall(x0 + k * 3, y0, y0 + 5, 'cubicle'); }
  let n = wsStart;
  for (let k = 0; k < cells; k++) {
    for (const row of [0, 1]) {
      const cx = x0 + k * 3;
      const deskY = row === 0 ? y0 + 2 : y0 + 3, chairY = row === 0 ? y0 + 1 : y0 + 4;
      const back: Rot = row === 0 ? BACK.s : BACK.n;
      const id = n++;
      if (opts.empty && rng.chance(opts.empty)) { if (rng.chance(0.4)) f.place('cardboard_box', cx + 1, deskY, 0, {}); continue; }
      const d1 = b.obj('desk_cubicle', cx, deskY, back, {});
      const d2 = b.obj('desk_cubicle', cx + 1, deskY, back, {});
      void d1;
      const lore = opts.lore?.[id];
      const pc = f.onTop('computer', d2, lore ? { lore, ws: ws(id) } : { ws: ws(id), on: rng.chance(0.85) });
      void pc;
      if (rng.chance(0.75)) b.obj('chair_office', cx + 1, chairY, row === 0 ? FACE.s : FACE.n, {});
      else if (rng.chance(0.5)) b.obj('chair_office', cx + rng.int(0, 2), chairY, rng.int(0, 3) as Rot, {});
      const r = rng.next();
      b.obj(r < 0.45 ? 'filing_cabinet' : r < 0.7 ? 'plant_potted' : r < 0.85 ? 'trash_can' : 'recycle_bin', cx + 2, deskY, back, {});
      if (!c.stamp && rng.chance(0.12)) f.floorLoot('office_supplies', cx + rng.int(0, 2), chairY);
    }
    if (opts.lights !== false && k % 2 === 0) { lamp(b, x0 + k * 3 + 1, y0 + 1, circuit); lamp(b, x0 + k * 3 + 1, y0 + 4, circuit); }
  }
  return n;
}

/** fill a rect with pods (6 tall, 9 wide) separated by 2-tile aisles */
function podField(c: Ctx, x0: number, y0: number, x1: number, y1: number, circuit: number, wsStart: number, opts: { empty?: number; lore?: Record<number, string> } = {}) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cellsX = Math.max(1, Math.floor((w + 2) / 11));
  const rows = Math.max(1, Math.floor((h + 2) / 8));
  const usedW = cellsX * 9 + (cellsX - 1) * 2, usedH = rows * 6 + (rows - 1) * 2;
  const ox = x0 + Math.floor((w - usedW) / 2), oy = y0 + Math.floor((h - usedH) / 2);
  let n = wsStart;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cellsX; i++) n = pod(c, ox + i * 11, oy + j * 8, 3, circuit, n, opts);
  // aisle lights between pod rows
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cellsX; i++) lamp(c.b, ox + i * 11 + 4, oy + j * 8 + 6, circuit);
  return n;
}

function meetingRoom(c: Ctx, x0: number, y0: number, x1: number, y1: number, circuit: number, o: { chairs?: number; coffee?: boolean; screen?: boolean } = {}) {
  const { b, f, rng, z } = c;
  const cx = Math.floor((x0 + x1) / 2) - 1, cy = Math.floor((y0 + y1) / 2) - 1;
  const t = f.place('conference_table', cx, cy, 0, {});
  const seats: [number, number, Rot][] = [];
  for (let i = 0; i < 3; i++) { seats.push([cx + i, cy - 1, FACE.s]); seats.push([cx + i, cy + 2, FACE.n]); }
  if (x1 - x0 >= 6) { seats.push([cx - 1, cy, FACE.e]); seats.push([cx + 3, cy + 1, FACE.w]); }
  const n = Math.min(seats.length, o.chairs ?? seats.length);
  for (let i = 0; i < n; i++) { const [x, y, r] = seats[i]; f.place('chair_office', x, y, r, {}); }
  wallObj(b, 'whiteboard', cx, y0, 'n', {});
  if (rng.chance(0.6)) wallObj(b, 'clock_wall', x1 - 1, y0, 'n', {});
  if (o.screen) f.place('tv_crt', x0, y0, BACK.n, {});
  if (o.coffee && t) {
    for (let i = 0; i < 6; i++) itemOn(z, rng, 'coffee_brewed', t, undefined, i % 3, i < 3 ? 0 : 1);
  }
  f.place('plant_tall', x1, y0, 0, {});
  for (let x = x0 + 1; x <= x1; x += 4) lamp(b, x, cy + 1, circuit);
}

function breakRoom(c: Ctx, x0: number, y0: number, x1: number, y1: number, circuit: number, o: { memo?: string } = {}) {
  const { b, f, rng, z } = c;
  // kitchen run along the north wall
  let x = x0;
  const k1 = f.place('counter_kitchen', x++, y0, 0, {}); f.onTop('microwave', k1, {});
  const k2 = f.place('counter_kitchen', x++, y0, 0, {}); f.onTop('coffee_maker', k2, {});
  f.place('counter_sink', x++, y0, 0, {});
  f.place('counter_kitchen', x++, y0, 0, {});
  f.place('fridge', x++, y0, 0, { loot: 'fridge_office' });
  x++;
  if (x <= x1) f.place('vending_snack', x++, y0, 0, {});
  if (x <= x1) f.place('vending_soda', x++, y0, 0, {});
  if (x1 - x0 > 9) f.place('water_cooler', x1, y0 + 1, BACK.e, {});
  wallObj(b, 'kitchen_cabinet_wall', x0 + 1, y0, 'n', {});
  wallObj(b, 'kitchen_cabinet_wall', x0 + 3, y0, 'n', {});
  wallObj(b, 'noticeboard', x0, y0 + 2, 'w', {});
  // tables
  const tables: TileObject[] = [];
  for (let ty = y0 + 3; ty <= y1 - 1; ty += 3) for (let tx = x0 + 2; tx <= x1 - 1; tx += 4) {
    const t = f.place('table_round', tx, ty, 0, {});
    if (!t) continue;
    tables.push(t);
    f.place('chair_plastic', tx - 1, ty, FACE.e, {}); f.place('chair_plastic', tx + 1, ty, FACE.w, {});
    if (rng.chance(0.5)) f.place('chair_plastic', tx, ty + 1, FACE.n, {});
  }
  if (o.memo && tables.length) itemOn(z, rng, 'note', tables[0], { lore: o.memo });
  if (tables.length > 1) itemOn(z, rng, rng.pick(['mug', 'soda_can_empty', 'newspaper']), tables[1]);
  f.place('trash_can', x1, y1, 0, {});
  f.place('recycle_bin', x1 - 1, y1, 0, {});
  wallObj(b, 'clock_wall', x0 + 6, y0, 'n', {});
  for (let ly = y0 + 2; ly <= y1; ly += 4) for (let lx = x0 + 2; lx <= x1; lx += 5) lamp(b, lx, ly, circuit);
  for (let i = 0; i < 4; i++) f.decal(rng.pick(['decal_stain_dark', 'decal_stain_water', 'decal_trash']), rng.int(x0, x1), rng.int(y0 + 1, y1), rng.float(0.6, 1.2), rng.float(0.6, 1.2));
}

function restroom(c: Ctx, x0: number, y0: number, x1: number, y1: number, circuit: number, men: boolean) {
  const { b, f } = c;
  // sinks + mirrors on the north wall, stalls along the east wall
  for (let x = x0; x <= x0 + 2; x++) { f.place('sink_bathroom', x, y0, 0, {}); wallObj(b, 'mirror', x, y0, 'n', {}); }
  for (let y = y0 + 1; y <= y1; y += 2) {
    f.place('toilet', x1, y, BACK.e, {});
    b.hwall(x1 - 1, x1, y, 'cubicle');
    b.door(x1 - 1, y, 1, 'door_white', {});
    b.vwall(x1 - 1, y, Math.min(y1, y + 1), 'cubicle');
  }
  if (men) for (let y = y0 + 2; y <= y1 - 1; y += 2) wallObj(b, 'urinal', x0, y, 'w', {});
  f.place('trash_can', x0 + 3, y0, 0, {});
  lamp(b, x0 + 2, Math.floor((y0 + y1) / 2), circuit, { flicker: 0.15 });
  b.paper(x0, y0, x1, y1, 'wall_bathroom');
}

// ---------------------------------------------------------------- the generator
function generateOffice(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed, dead: new Set() };
  circuitSeq = 20;
  z.name = 'Level 4 — Meridian Offices';
  const nextCircuit = () => circuitSeq++;

  // ============================================================ 1. floor plate
  b.fillFloor(PX0, PY0, PX1, PY1, 'carpet_office');
  b.paper(PX0, PY0, PX1, PY1, 'wall_office');
  b.roomWalls(PX0, PY0, PX1, PY1, 'concrete');

  // ============================================================ 2. core
  // shafts are solid: no floor except the rooms carved below
  for (let y = KY0; y <= KY1; y++) for (let x = KX0; x <= KX1; x++) z.floor[z.idx(x, y)] = 0;
  b.roomWalls(KX0, KY0, KX1, KY1, 'concrete');

  // elevator lobby (arrival) on the east face of the core
  {
    const x0 = 61, y0 = 66, x1 = KX1, y1 = 77;
    room(b, 'Elevator Lobby', 'elevator', x0, y0, x1, y1, { floor: 'terrazzo', paper: 'wall_office', circuit: C_CORE });
    for (let y = 69; y <= 74; y++) b.gap(KX1 + 1, y, 1);
    const els: [number, string | null][] = [[68, null], [71, 'r_office'], [74, null]];
    for (const [ey, pid] of els) {
      wallObj(b, 'elevator_door', x0, ey, 'w', pid ? { portal: pid } : {});
      if (pid) b.portal({ id: pid, x: x0, y: ey, kind: 'elevator', to: 'lobby', tx: 80, ty: 80, label: 'Take the elevator down to Level 0' });
    }
    anchor(z, 'p_office', x0 + 1, 71, 'e');
    noSpawn(b, x0 + 3, 71, 5);
    wallObj(b, 'zg_level_sign', 66, y0, 'n', { label: '4' });
    wallObj(b, 'clock_wall', 69, y0, 'n', {});
    f.place('plant_tall', x1, y0, 0, {}); f.place('plant_tall', x1, y1, 0, {});
    f.place('bench', 66, y1, 0, {});
    f.place('trash_can', 68, y1, 0, {});
    wallObj(b, 'noticeboard', 63, y0, 'n', { lore: 'poster_safety' });
    lamp(b, 63, 69, C_CORE); lamp(b, 63, 74, C_CORE, { flicker: 0.2 }); lamp(b, 68, 69, C_CORE); lamp(b, 68, 74, C_CORE);
    decalAt(z, 'decal_footprints', x0 + 1.6, 71.5, 0.7, 0.9, 0, 0x6a6458, 0.4);
  }
  // stair B vestibule: the door to the stairwell (landing 4)
  {
    const x0 = KX0, y0 = 61, x1 = 50, y1 = 66;
    room(b, 'Stair B', 'stairs', x0, y0, x1, y1, { floor: 'linoleum', paper: 'wall_office', circuit: C_CORE, temp: 17 });
    b.door(KX0, 64, 1, 'door_metal', { sign: 'stairs', open: true });
    b.door(47, y0, 0, 'door_metal', { portal: 'p_office_stair', sign: 'stairs' });
    b.portal({ id: 'p_office_stair', x: 47, y: y0, kind: 'door', to: 'stairwell', tx: 21, ty: 7, label: 'Go through to the stairwell' });
    anchor(z, 'r_office_stair', 47, y0 + 1, 's');
    noSpawn(b, 47, y0 + 2, 3);
    wallObj(b, 'exit_sign', 47, y0, 'n', {});
    wallObj(b, 'zg_level_sign', 49, y0, 'n', { label: '4' });
    wallObj(b, 'fire_extinguisher_wall', 50, y0 + 2, 'e', {});
    // a second steel door that is not on the plans: through it, Annex B
    b.door(45, y0, 0, 'door_lab', { portal: 'p_office_annex', sign: 'danger' });
    b.portal({ id: 'p_office_annex', x: 45, y: y0, kind: 'door', to: 'annex', tx: 4, ty: 8, label: 'Go through to Annex B' });
    anchor(z, 'r_office_annex', 45, y0 + 2, 's');
    wallObj(b, 'zw_plate', 44, y0, 'n', { label: 'ANNEX B' });
    lamp(b, 47, 64, C_CORE, { kind: 'light_bulb', flicker: 0.15 });
  }
  // restrooms
  {
    room(b, 'Restroom (M)', 'restroom', KX0, 68, 50, 74, { floor: 'tile_white', circuit: C_CORE });
    b.door(KX0, 71, 1, 'door_white', { sign: 'restroom' });
    restroom(c, KX0, 68, 50, 74, C_CORE, true);
    room(b, 'Restroom (W)', 'restroom', KX0, 76, 50, 82, { floor: 'tile_white', circuit: C_CORE });
    b.door(KX0, 79, 1, 'door_white', { sign: 'restroom' });
    restroom(c, KX0, 76, 50, 82, C_CORE, false);
  }
  // copy room (south face)
  {
    room(b, 'Copy Room', 'copy', 52, 80, 58, KY1, { floor: 'linoleum', circuit: C_CORE });
    b.door(55, KY1 + 1, 0, 'door_office', { open: true });
    f.place('copier', 52, 80, 0, {}); f.place('copier', 54, 80, 0, {});
    f.place('printer_desk', 56, 80, 0, {});
    f.place('shelf_metal', 58, 82, BACK.e, { loot: 'office_drawer' });
    f.place('recycle_bin', 52, KY1, 0, {});
    f.floorLoot('office_supplies', 55, 82);
    lamp(b, 55, 82, C_CORE, { flicker: 0.1 });
    for (let i = 0; i < 3; i++) f.decal('decal_trash', 53 + i * 2, 83, 0.8, 0.8);
  }
  // the supply closet that opens onto the far corner of the open floor
  {
    b.door(61, KY1 + 1, 0, 'door_office', { portal: 'closet_a', sign: 'staff' });
    b.portal({ id: 'closet_a', x: 61, y: KY1 + 1, kind: 'door', to: 'office', tx: 18, ty: 124, label: 'Open the supply closet' });
    anchor(z, 'closet_b', 62, KY1 + 2, 's');
    noSpawn(b, 62, KY1 + 2, 2);
  }
  // electrical (south face)
  {
    room(b, 'Electrical 4', 'electrical', 64, 80, KX1, KY1, { floor: 'concrete', wall: 'concrete', circuit: C_CORE, temp: 22 });
    b.door(68, KY1 + 1, 0, 'door_metal', { sign: 'danger' });
    wallObj(b, 'breaker_panel', 65, 80, 'n', { circuits: [C_CORR, C_FARM, C_SUITE, C_RECEP] });
    wallObj(b, 'breaker_panel', 67, 80, 'n', { circuits: [C_FLOOR_W, C_FLOOR_E, C_COPY, C_FAC] });
    f.place('electrical_cabinet', 69, 80, 0, {}); f.place('electrical_cabinet', 70, 80, 0, {});
    f.place('transformer', 64, 84, 0, {});
    f.place('tool_chest', KX1, 84, BACK.e, {});
    wallObj(b, 'pipes_cluster', 64, 81, 'w', {});
    lamp(b, 67, 82, C_CORE, { kind: 'light_bulb' });
    f.floorItem('fuse', 66, 84);
  }
  // north face: supply room + comms 4C (a decoy server room)
  {
    room(b, 'Supply Room', 'storage', 52, KY0, 59, 63, { floor: 'linoleum', circuit: C_CORE });
    b.door(55, KY0, 0, 'door_office', {});
    for (let x = 52; x <= 59; x += 2) f.place('shelf_metal', x, 63, BACK.s, { loot: 'office_drawer' });
    f.place('cardboard_stack', 59, KY0, 0, {}); f.place('cardboard_box', 52, KY0, 0, {});
    lamp(b, 55, 60, C_CORE);
    room(b, 'Comms 4C', 'comms', 62, KY0, KX1, 63, { floor: 'server', wall: 'concrete', circuit: C_CORE, temp: 17 });
    b.door(65, KY0, 0, 'door_metal', { sign: 'staff' });
    for (let x = 63; x <= 70; x++) if (x !== 65 && x !== 66) b.obj('server_rack', x, 62, BACK.s, {});
    f.place('tape_mainframe', 69, KY0, 0, {});
    lamp(b, 66, 60, C_CORE, { flicker: 0.3 });
  }

  // ============================================================ 3. perimeter rooms
  const offices: { name: string; x0: number; y0: number; x1: number; y1: number; door: Side; c: number }[] = [];
  // west band: 4-01 .. 4-16 (x 5..11), doors on the corridor (east)
  // (11 and 12 live in the facilities wing; this band skips them)
  const westIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19];
  for (let k = 0; k < 16; k++) {
    const y0 = 15 + k * 7, y1 = y0 + 6;
    const id = westIds[k], cc = nextCircuit();
    room(b, 'Office ' + ws(id), 'office', PX0, y0, 11, y1, { circuit: cc });
    b.door(12, y0 + 3, 1, 'door_office', { sign: 'office', open: rng.chance(0.25) && id !== 7 });
    for (const wy of [y0 + 1, y0 + 4]) b.window(PX0, wy, 1, { style: 'window_metal' });
    wallObj(b, 'light_switch', 11, y0, 'n', {});
    offices.push({ name: ws(id), x0: PX0, y0, x1: 11, y1, door: 'e', c: cc });
  }
  // north band (y 5..11) with meeting rooms; 4-43 is a shifting office (below)
  const north: [number, number, string][] = [[12, 19, '4-41'], [20, 27, '4-42'], [28, 35, '4-43'], [36, 43, '4-44'], [44, 57, 'Lakeview'], [58, 71, 'Summit'], [72, 79, '4-45'], [80, 87, '4-46'], [88, 95, '4-47'], [96, 103, '4-48']];
  for (const [x0, x1, nm] of north) {
    const cc = nextCircuit();
    if (nm === '4-43') { c443 = cc; continue; }
    for (let wx = x0 + 1; wx <= x1 - 1; wx += 3) b.window(wx, PY0, 0, { style: 'window_metal' });
    if (nm === 'Lakeview' || nm === 'Summit') {
      room(b, 'Meeting Room — ' + nm, 'meeting', x0, PY0, x1, 11, { circuit: cc, wall: 'drywall' });
      b.hwall(x0, x1, 12, 'glass');
      b.door(x0 + 3, 12, 0, 'door_glass', {});
      meetingRoom(c, x0, PY0 + 1, x1, 11, cc, { screen: nm === 'Summit' });
      continue;
    }
    room(b, 'Office ' + nm, 'office', x0, PY0, x1, 11, { circuit: cc });
    b.door(x0 + 3, 12, 0, 'door_office', { sign: 'office' });
    offices.push({ name: nm, x0, y0: PY0, x1, y1: 11, door: 's', c: cc });
  }
  // corners
  const cNW = nextCircuit(), cNE = nextCircuit(), cSW = nextCircuit(), cSE = nextCircuit();
  room(b, 'Program Director', 'office', PX0, PY0, 11, 14, { circuit: cNW, floor: 'carpet_red' });
  b.door(12, 13, 1, 'door_wood', { sign: 'office' });
  for (const wy of [7, 10]) b.window(PX0, wy, 1, { style: 'window_metal' });
  for (const wx of [7, 10]) b.window(wx, PY0, 0, { style: 'window_metal' });
  {
    const pc = furnishOffice(c, PX0, PY0, 11, 14, 'e', cNW, { exec: true });
    void pc;
    const desk = [...z.objects.values()].find((o) => o.key === 'desk_office' && o.x >= PX0 && o.x <= 11 && o.y >= PY0 && o.y <= 14) || null;
    itemOn(z, rng, 'note', desk, { lore: 'memo_continuity_1' });
  }
  room(b, 'Executive Lounge', 'lounge', 104, PY0, PX1, 14, { circuit: cNE, floor: 'carpet_red' });
  b.door(104, 13, 1, 'door_wood', {});
  for (const wx of [106, 109]) b.window(wx, PY0, 0, { style: 'window_metal' });
  f.place('sofa', 105, 6, BACK.n, {}); f.place('armchair', 108, 7, FACE.w, {}); f.place('coffee_table', 106, 8, 0, {});
  f.place('fridge', PX1, PY0, 0, { loot: 'fridge_office' }); f.place('plant_tall', 104, PY0, 0, {});
  f.place('lamp_floor', 109, 11, 0, {}); f.place('bookshelf', PX1, 12, BACK.e, {});
  lamp(b, 107, 9, cNE, { kind: 'light_bulb' });
  room(b, 'Print & Plot', 'copy', PX0, 127, 11, PY1, { circuit: cSW, floor: 'linoleum' });
  b.door(12, 130, 1, 'door_office', {});
  f.place('copier', PX0, 128, BACK.w, {}); f.place('copier', PX0, 130, BACK.w, {}); f.place('printer_desk', PX0, 132, BACK.w, {});
  f.place('shelf_metal', 8, PY1, BACK.s, { loot: 'office_drawer' }); f.place('cardboard_stack', PX0, PY1, 0, {});
  lamp(b, 8, 132, cSW, { broken: true }); lamp(b, 8, 128, cSW, { flicker: 0.4 });
  room(b, 'Facilities Workshop', 'workshop', 104, 127, PX1, PY1, { circuit: cSE, floor: 'concrete' });
  b.door(104, 130, 1, 'door_metal', { sign: 'maintenance' });
  f.place('workbench', 106, PY1, BACK.s, {}); f.place('tool_chest', PX1, 128, BACK.e, {}); f.place('shelf_metal', PX1, 131, BACK.e, { loot: 'maintenance' });
  f.place('janitor_cart', 105, 128, 0, {}); f.place('mop_bucket', 107, 128, 0, {}); f.place('cardboard_box', 104, 136, 0, {});
  wallObj(b, 'breaker_panel', 108, 127, 'n', {});
  lamp(b, 107, 132, cSE, { kind: 'light_bulb', flicker: 0.1 });
  f.floorLoot('tools_small', 108, 134);

  // east band: offices, the east wing access in the middle
  const eastY: number[] = [];
  for (let k = 0; k < 7; k++) eastY.push(15 + k * 7);
  for (let k = 0; k < 7; k++) eastY.push(78 + k * 7);
  eastY.forEach((y0, k) => {
    const y1 = y0 + 6, id = 51 + k, cc = nextCircuit();
    room(b, 'Office ' + ws(id), 'office', 104, y0, PX1, y1, { circuit: cc });
    b.door(104, y0 + 3, 1, 'door_office', { sign: 'office' });
    for (const wy of [y0 + 1, y0 + 4]) b.window(PX1 + 1, wy, 1, { style: 'window_metal' });
    offices.push({ name: ws(id), x0: 104, y0, x1: PX1, y1, door: 'w', c: cc });
  });
  // south band
  const south: [number, number, string][] = [[12, 19, '4-81'], [20, 27, '4-82'], [28, 35, '4-83'], [36, 51, 'Training'], [52, 59, '4-84'], [60, 67, '4-85'], [68, 75, '4-86'], [76, 83, '4-87'], [84, 91, '4-88'], [92, 103, 'Storage']];
  for (const [x0, x1, nm] of south) {
    const cc = nextCircuit();
    for (let wx = x0 + 1; wx <= x1 - 1; wx += 3) b.window(wx, PY1 + 1, 0, { style: 'window_metal' });
    if (nm === 'Training') {
      room(b, 'Training Room', 'training', x0, 132, x1, PY1, { circuit: cc });
      b.door(x0 + 2, 132, 0, 'door_office', {}); b.door(x1 - 2, 132, 0, 'door_office', {});
      wallObj(b, 'whiteboard', x0 + 7, 132, 'n', {});
      for (let ty = 134; ty <= PY1; ty += 2) for (let tx = x0 + 1; tx <= x1 - 1; tx++) if (tx !== x0 + 7 && tx !== x0 + 8) f.place('chair_folding', tx, ty, FACE.n, {});
      f.floorItem('note', x0 + 8, 133, { lore: 'note_chairs' });
      for (let lx = x0 + 2; lx <= x1; lx += 4) lamp(b, lx, 135, cc);
      continue;
    }
    if (nm === 'Storage') {
      room(b, 'Storage 4S', 'storage', x0, 132, x1, PY1, { circuit: cc, floor: 'linoleum' });
      b.door(x0 + 3, 132, 0, 'door_office', { sign: 'staff' });
      for (let sx = x0 + 1; sx <= x1 - 1; sx += 2) { f.place('shelf_metal', sx, 134, 0, { loot: 'office_drawer' }); f.place('shelf_metal', sx, 137, BACK.s, { loot: 'office_drawer' }); }
      f.place('cardboard_stack', x0, PY1, 0, {}); f.place('chair_stack', x1, PY1, 0, {});
      lamp(b, x0 + 4, 135, cc, { flicker: 0.2 }); lamp(b, x0 + 9, 135, cc, { broken: true });
      continue;
    }
    room(b, 'Office ' + nm, 'office', x0, 132, x1, PY1, { circuit: cc });
    b.door(x0 + 3, 132, 0, 'door_office', { sign: 'office' });
    offices.push({ name: nm, x0, y0: 132, x1, y1: PY1, door: 'n', c: cc });
  }

  // ============================================================ 4. the private offices' contents
  let wrongIdx = 0;
  let office407: TileObject | null = null;
  for (const o of offices) {
    const isMission = o.name === '4-07';
    const empty = !isMission && rng.chance(0.12);
    const wrong = isMission ? -1 : rng.chance(0.55) ? (wrongIdx++ % 7) : -1;
    const pc = furnishOffice(c, o.x0, o.y0, o.x1, o.y1, o.door, o.c, { wrong, empty, lore: isMission ? 'terminal_numbers' : undefined });
    if (isMission) office407 = pc;
    if (rng.chance(0.1) && !isMission) c.dead.add(o.c);
  }
  // Workstation 4-07: the voice on 88.1 comes from here
  {
    const o = offices.find((q) => q.name === '4-07')!;
    if (office407) {
      office407.state.on = true;
      anchor(z, 'numbers_terminal', office407.x, office407.y);
      itemAt(z, rng, 'tape_cassette', office407.x, office407.y + 1, 0.77);
    } else anchor(z, 'numbers_terminal', o.x0 + 2, o.y0 + 2);
    noSpawn(b, o.x0 + 3, o.y0 + 3, 4);
    f.place('radio_console', o.x0 + 1, o.y1 - 1, BACK.s, {});
    f.decal('decal_footprints', o.x0 + 4, o.y0 + 3, 0.8, 0.9, 0);
    c.dead.delete(o.c);
  }

  // ============================================================ 5. Cubicle Farm A (x 15..74, y 15..54)
  {
    const x0 = 15, y0 = 15, x1 = 74, y1 = 54;
    b.addRoom('Cubicle Farm A', 'cubicles', x0, y0, x1, y1, { circuit: C_FARM });
    b.hwall(x0, x1, y0, 'drywall');                   // to the north corridor
    for (const gx of [20, 21, 44, 45, 46, 66, 67]) b.gap(gx, y0, 0);
    b.vwall(x0, y0, y1, 'drywall');                   // to the west corridor
    for (const gy of [24, 25, 44, 45]) b.gap(x0, gy, 1);
    b.hwall(x0, 40, y1 + 1, 'drywall');               // to the records block
    b.hwall(RX0, RX1, y1 + 1, 'drywall');             // to the ring corridor
    for (const gx of [26, 27, 44, 45, 46, 58, 59, 70, 71]) b.gap(gx, y1 + 1, 0);
    // fixed pods: north-east and south-west quadrants, a manager's glass box
    let n = 1;
    n = podField(c, 48, 17, 68, 33, C_FARM, 40);
    n = podField(c, 17, 38, 42, 53, C_FARM, 60);
    n = podField(c, 48, 38, 54, 53, C_FARM, 70, { empty: 0.3 });
    void n;
    // manager's office (glass) in the north-east corner
    room(b, 'Team Lead', 'office', 70, 16, 74, 22, { wall: 'glass', circuit: C_FARM });
    b.door(70, 19, 1, 'door_glass', {});
    furnishOffice(c, 70, 16, 74, 22, 'w', C_FARM, {});
    // aisle lights
    for (let x = 17; x <= 73; x += 4) { lamp(b, x, 35, C_FARM); }
    for (let y = 17; y <= 53; y += 4) lamp(b, 45, y, C_FARM);
    // posters along the walls
    for (const [x, y, s] of [[22, 15, 'n'], [50, 15, 'n'], [15, 30, 'w'], [15, 50, 'w']] as [number, number, Side][]) wallObj(b, 'poster', x, y, s, { v: rng.int(0, 5), lore: 'poster_safety' });
    wallObj(b, 'fire_extinguisher_wall', 30, 15, 'n', {});
    wallObj(b, 'clock_wall', 60, 15, 'n', {});
    f.place('water_cooler', 43, 34, 0, {});
    f.place('copier', 47, 34, 0, {});
    f.place('plant_tall', 16, 34, 0, {});
  }

  // ============================================================ 6. NE meeting suite (x 75..100, y 15..54)
  {
    const sx0 = 75, sx1 = 100;
    b.vwall(sx0, 15, 54, 'drywall');
    for (const gy of [24, 25, 26]) b.gap(sx0, gy, 1);
    b.vwall(PX1 - 9 + 0, 15, 54, 'drywall');            // x = 101 edge (east corridor)
    for (const gy of [24, 25, 26]) b.gap(101, gy, 1);
    b.hwall(sx0, sx1, 15, 'drywall');
    b.hwall(sx0, sx1, 55, 'drywall');
    // row 1: Conference Room C (locked, lit, coffee for six) and two glass rooms
    room(b, 'Conference Room C', 'conference', sx0, 15, 86, 23, { circuit: C_CONF, paper: 'wall_office' });
    b.hwall(sx0, 86, 24, 'glass');
    b.door(80, 24, 0, 'door_glass', { locked: true });
    {
      const t = f.place('conference_table', 79, 18, 0, {});
      const t2 = f.place('conference_table', 82, 18, 0, {});
      const seats: [number, number, Rot][] = [[79, 17, FACE.s], [81, 17, FACE.s], [83, 17, FACE.s], [80, 20, FACE.n], [82, 20, FACE.n], [84, 20, FACE.n]];
      for (const [x, y, r] of seats) b.obj('chair_office', x, y, r, {});
      for (let i = 0; i < 3; i++) { itemOn(z, rng, 'coffee_brewed', t, undefined, i, 0); itemOn(z, rng, 'coffee_brewed', t2, undefined, i, 1); }
      const cr = f.place('counter_kitchen', 85, 15, 0, {}); f.onTop('coffee_maker', cr, {});
      f.place('counter_kitchen', 86, 15, 0, {});
      wallObj(b, 'whiteboard', 79, 15, 'n', {});
      wallObj(b, 'clock_wall', 77, 15, 'n', {});
      f.place('plant_tall', sx0, 15, 0, {});
      f.place('tv_crt', sx0, 23, FACE.e, {});
      for (const x of [77, 81, 85]) lamp(b, x, 19, C_CONF);
      z.meta.conferenceC = [79, 18];
    }
    const cMa = nextCircuit(), cMb = nextCircuit();
    room(b, 'Meeting Room A', 'meeting', 87, 15, 93, 23, { circuit: cMa });
    b.hwall(87, 93, 24, 'glass'); b.door(90, 24, 0, 'door_glass', {});
    meetingRoom(c, 87, 16, 93, 23, cMa, { chairs: 4 });
    room(b, 'Meeting Room B', 'meeting', 94, 15, sx1, 23, { circuit: cMb });
    b.hwall(94, sx1, 24, 'glass'); b.door(97, 24, 0, 'door_glass', {});
    meetingRoom(c, 94, 16, sx1, 23, cMb, { chairs: 6 });
    // suite corridor y 24..26
    b.addRoom('Meeting Suite', 'corridor', sx0, 24, sx1, 26, { circuit: C_SUITE });
    for (let x = 77; x <= 99; x += 4) lamp(b, x, 25, C_SUITE);
    wallObj(b, 'poster', 88, 24, 'n', { v: 2, lore: 'poster_safety' });
    // row 2: kitchenette north (memo-free; coffee is the point)
    room(b, 'Kitchenette North', 'breakroom', sx0, 27, 86, 36, { floor: 'linoleum', circuit: C_SUITE });
    for (const gx of [79, 80, 81]) b.gap(gx, 27, 0);
    breakRoom(c, sx0, 28, 86, 36, C_SUITE);
    // cubicles 4-30s (Workstation 4-31 has the mail about room C)
    b.addRoom('Workstations 4-30', 'cubicles', 87, 27, sx1, 45, { circuit: C_SUITE });
    pod(c, 88, 28, 4, C_SUITE, 30, { lore: { 31: 'terminal_mail_2' } });
    pod(c, 88, 37, 4, C_SUITE, 38, { empty: 0.2 });
    for (let x = 89; x <= 99; x += 4) lamp(b, x, 35, C_SUITE);
    // quiet room
    room(b, 'Quiet Room', 'lounge', sx0, 37, 86, 45, { circuit: nextCircuit(), floor: 'carpet_hotel' });
    b.door(87, 41, 1, 'door_office', {});
    f.place('armchair', 77, 39, FACE.s, {}); f.place('armchair', 80, 39, FACE.s, {}); f.place('sofa', 82, 44, FACE.n, {});
    f.place('lamp_floor', sx0, 37, 0, {}); f.place('plant_potted', 86, 37, 0, {}); f.place('bookshelf', sx0, 43, BACK.w, {});
    wallObj(b, 'painting', 79, 37, 'n', { v: 3 });
    lamp(b, 80, 41, nextCircuit(), { kind: 'light_bulb' });
    // row 4: lounge strip leading to the mailroom
    b.addRoom('Suite Lounge', 'lounge', sx0, 46, sx1, 54, { circuit: C_SUITE });
    b.hwall(sx0, 86, 46, 'drywall');
    f.place('sofa', 78, 50, FACE.n, {}); f.place('coffee_table', 78, 52, 0, {}); f.place('armchair', 81, 52, FACE.w, {});
    f.place('plant_tall', sx0, 46, 0, {}); f.place('plant_tall', sx1, 54, 0, {}); f.place('vending_soda', 90, 46, 0, {}); f.place('water_cooler', 92, 46, 0, {});
    for (let x = 77; x <= 99; x += 5) lamp(b, x, 50, C_SUITE);
    b.door(80, 55, 0, 'door_office', {});
  }

  // ============================================================ 7. reception + hot desks (x 75..100, y 55..88)
  {
    const x0 = 75, x1 = 100;
    // mailroom + print room along the top
    room(b, 'Mailroom', 'mailroom', x0, 55, 87, 61, { circuit: C_RECEP, floor: 'linoleum' });
    b.door(80, 62, 0, 'door_office', {});
    for (let x = 76; x <= 86; x += 2) f.place('shelf_metal', x, 55, 0, { loot: 'mailbox' });
    f.place('display_table', 79, 58, 0, {}); f.place('cardboard_box', 84, 58, 0, {}); f.place('shopping_cart', 86, 60, 0, {});
    lamp(b, 81, 58, C_RECEP);
    room(b, 'Print Room', 'copy', 88, 55, x1, 61, { circuit: C_RECEP, floor: 'linoleum' });
    b.door(94, 62, 0, 'door_office', {});
    f.place('copier', 89, 55, 0, {}); f.place('copier', 91, 55, 0, {}); f.place('printer_desk', 93, 55, 0, {}); f.place('recycle_bin', x1, 55, 0, {});
    lamp(b, 94, 58, C_RECEP, { flicker: 0.2 });
    // reception: glass wall onto the ring corridor, doors facing the elevators
    b.addRoom('Reception', 'reception', x0, 62, x1, 80, { circuit: C_RECEP });
    b.fillFloor(x0, 62, x1, 80, 'carpet_hotel');
    b.vwall(x0, 55, 88, 'glass');
    b.vwall(x0, 55, 61, 'drywall');
    b.door(x0, 70, 1, 'door_glass', {}); b.door(x0, 71, 1, 'door_glass', {});
    b.vwall(101, 55, 88, 'drywall');
    for (const gy of [70, 71, 72]) b.gap(101, gy, 1);
    b.hwall(x0, x1, 89, 'drywall');
    for (const gx of [86, 87, 88]) b.gap(gx, 89, 0);
    const desk = f.place('reception_desk', 84, 69, FACE.w, {});
    f.onTop('computer', desk, {});
    f.place('chair_office', 85, 70, FACE.w, {});
    wallObj(b, 'painting', 78, 62, 'n', { v: 1, lore: 'org_chart' });
    wallObj(b, 'zg_level_sign', 84, 62, 'n', { label: '4' });
    wallObj(b, 'clock_wall', 87, 62, 'n', {});
    f.place('waiting_chairs', 77, 75, FACE.n, {}); f.place('waiting_chairs', 77, 78, FACE.n, {});
    f.place('coffee_table', 80, 76, 0, {});
    f.place('plant_tall', 76, 63, 0, {}); f.place('plant_tall', 99, 63, 0, {}); f.place('plant_tall', 99, 79, 0, {});
    f.place('water_cooler', 92, 63, 0, {});
    const tvs = f.place('tv_stand', 95, 63, 0, {}); f.onTop('tv_crt', tvs, {});
    f.floorLoot('magazines', 80, 76);
    // a colonnade, a security post by the way east, far too many seats for a lobby nobody visits
    for (const [cx, cy] of [[81, 66], [81, 76], [93, 66], [93, 76]] as const) column(b, cx, cy);
    f.place('security_desk', 97, 68, FACE.w, {}); f.place('chair_office', 98, 68, FACE.w, {});
    f.place('cctv_monitors', 98, 62, 0, {});
    for (const x of [82, 85, 88]) f.place('waiting_chairs', x, 79, FACE.n, {});
    for (const x of [84, 87]) f.place('waiting_chairs', x, 74, FACE.s, {});
    const dt = f.place('display_table', 88, 70, 0, {}); itemOn(z, rng, 'newspaper', dt);
    f.place('plant_potted', 89, 74, 0, {}); f.place('plant_potted', 83, 70, 0, {});
    f.place('trash_can', 76, 80, 0, {});
    for (let y = 64; y <= 79; y += 5) for (let x = 78; x <= 98; x += 6) lamp(b, x, y, C_RECEP);
    // hot desks (y 81..88): Workstation 4-22 has the mail about the east corridor
    pod(c, 76, 82, 3, C_RECEP, 20, { lore: { 22: 'terminal_mail_1' } });
    pod(c, 91, 82, 3, C_RECEP, 26, { empty: 0.25 });
    wallObj(b, 'poster', 96, 62, 'n', { v: 4, lore: 'poster_safety' });
  }

  // ============================================================ 8. east wing: the corridor that was not there on Friday
  buildEastWing(c);

  // ============================================================ 9. facilities & IT wing (x 75..100, y 89..128)
  {
    b.hwall(75, 100, 129, 'drywall');
    for (const gx of [86, 87, 88]) b.gap(gx, 129, 0);
    b.vwall(75, 89, 128, 'drywall');
    b.addRoom('Facilities Corridor', 'corridor', 86, 89, 88, 128, { circuit: C_FAC });
    for (let y = 91; y <= 127; y += 4) lamp(b, 87, y, C_FAC, { flicker: y === 107 ? 0.3 : 0 });
    wallObj(b, 'fire_extinguisher_wall', 86, 96, 'w', {});
    // Server Closet 07 (north) behind Room 4-11
    room(b, 'Server Closet 07', 'server_closet', 75, 89, 85, 96, { floor: 'server', wall: 'concrete', circuit: C_FAC, temp: 14 });
    room(b, 'Room 4-11 — Network', 'it', 75, 97, 85, 104, { floor: 'linoleum', circuit: C_FAC, temp: 18 });
    b.door(86, 100, 1, 'door_office', { sign: 'office' });
    const closetDoor: [number, number, 0 | 1] = [80, 97, 0];
    b.door(closetDoor[0], closetDoor[1], closetDoor[2], 'door_metal', { locked: true, sign: 'danger' });
    wallObj(b, 'keycard_reader', 81, 97, 'n', { card: 'keycard_facilities', door: closetDoor });
    // inside the closet: racks numbered from 27, rack 33 hides the node
    {
      const racks: [number, number, Rot][] = [];
      for (let x = 75; x <= 85; x++) if (x < 78 || x > 81) racks.push([x, 89, BACK.n]);
      for (const y of [93, 94]) for (let x = 75; x <= 85; x++) if (x < 78 || x > 81) racks.push([x, y, y === 93 ? FACE.n : FACE.s]);
      let num = 27;
      for (const [x, y, r] of racks) b.obj('server_rack', x, y, r, { rack: num++ });
      b.obj('render_node', 79, 90, 0, { node: 'SRV-1' });
      // "rack 33" — a gap where it should be, labelled
      wallObj(b, 'noticeboard', 78, 89, 'n', {});
      b.obj('chair_office', 81, 95, FACE.n, {});
      lamp(b, 80, 95, C_FAC, { flicker: 0.12 });
      b.light(80.5, 91.5, 'screen', { color: 0x3a64ff, intensity: 0.5, radius: 4, y: 2.4, circuit: C_FAC });
      for (let k = 0; k < 6; k++) decalAt(z, 'decal_parking_line', 80.5 + Math.cos(k) * 2.4, 91.5 + Math.sin(k) * 1.6, 3, 0.12, k, 0x16181c, 0.9);
      noSpawn(b, 80, 93, 3);
    }
    // Room 4-11 contents: the network desk
    {
      const d = f.place('desk_office', 77, 102, FACE.n, {}); f.onTop('computer', d, {});
      f.place('chair_office', 78, 101, FACE.s, {});
      f.place('tape_mainframe', 83, 103, BACK.s, {});
      f.place('shelf_metal', 85, 98, BACK.e, { loot: 'server_room' });
      f.place('cardboard_box', 76, 98, 0, {});
      wallObj(b, 'whiteboard', 77, 97, 'n', {});
      lamp(b, 80, 100, C_FAC); lamp(b, 80, 103, C_FAC, { broken: true });
      for (let k = 0; k < 4; k++) decalAt(z, 'decal_parking_line', 79 + k * 1.5, 99.4, 2.2, 0.1, 0.3 * k, 0x1a1a1e, 0.85);
    }
    // facilities storage
    room(b, 'Facilities Storage', 'storage', 75, 105, 85, 114, { floor: 'concrete', circuit: C_FAC });
    b.door(86, 109, 1, 'door_metal', { sign: 'maintenance' });
    for (let x = 75; x <= 85; x += 2) f.place('shelf_metal', x, 105, 0, { loot: x % 4 === 1 ? 'maintenance' : 'janitor' });
    f.place('janitor_cart', 77, 110, 0, {}); f.place('mop_bucket', 79, 110, 0, {}); f.place('cardboard_stack', 85, 114, 0, {}); f.place('pallet_boxes', 76, 114, 0, {});
    lamp(b, 80, 109, C_FAC, { kind: 'light_bulb' });
    f.floorItem('lightbulb', 82, 112);
    // break room 3: the sticky note about the keycard
    room(b, 'Break Room 4S', 'breakroom', 75, 115, 85, 128, { floor: 'linoleum', circuit: C_FAC });
    b.door(86, 121, 1, 'door_office', {});
    breakRoom(c, 75, 115, 85, 128, C_FAC, { memo: 'memo_facilities' });
    // Office 4-12 — R. Doyle, Facilities
    {
      room(b, 'Office 4-12 — R. Doyle (Facilities)', 'office', 89, 89, 100, 96, { circuit: C_FAC });
      b.door(89, 92, 1, 'door_office', { sign: 'office' });
      const desk = f.place('desk_office', 93, 89, BACK.n, {});
      const pc = f.onTop('computer', desk, {});
      void pc;
      stash(desk, rng, 'keycard_facilities');
      itemOn(z, rng, 'mug', desk, undefined, 1, 0);
      f.place('chair_office', 94, 90, FACE.n, {});
      f.place('filing_cabinet', 99, 89, BACK.n, {}); f.place('filing_cabinet', 100, 89, BACK.n, {});
      f.place('tool_chest', 100, 93, BACK.e, {});
      f.place('shelf_metal', 100, 95, BACK.e, { loot: 'maintenance' });
      f.place('plant_potted', 90, 96, 0, {});
      f.place('chair_office', 94, 93, FACE.n, {});
      wallObj(b, 'noticeboard', 91, 89, 'n', {});
      wallObj(b, 'clock_wall', 97, 89, 'n', {});
      lamp(b, 94, 92, C_FAC); lamp(b, 98, 92, C_FAC);
      f.floorItem('fuse', 96, 95);
    }
    room(b, 'Office 4-13', 'office', 89, 97, 100, 104, { circuit: C_FAC });
    b.door(89, 100, 1, 'door_office', { sign: 'office' });
    furnishOffice(c, 89, 97, 100, 104, 'w', C_FAC, { wrong: 3 });
    room(b, 'Facilities Workshop 4', 'workshop', 89, 105, 100, 116, { circuit: C_FAC, floor: 'concrete' });
    b.door(89, 110, 1, 'door_metal', { sign: 'maintenance' });
    f.place('workbench', 91, 105, 0, {}); f.place('workbench', 95, 105, 0, {}); f.place('tool_chest', 100, 107, BACK.e, {});
    f.place('sawhorse', 93, 110, 0, {}); f.place('barrel_oil', 100, 115, 0, {}); f.place('shelf_metal', 100, 111, BACK.e, { loot: 'tool_shelf' });
    lamp(b, 94, 110, C_FAC); f.floorLoot('hardware', 96, 112);
    room(b, 'Plotter Room', 'copy', 89, 117, 100, 128, { circuit: C_FAC, floor: 'linoleum' });
    b.door(89, 122, 1, 'door_office', {});
    f.place('copier', 91, 117, 0, {}); f.place('printer_desk', 94, 117, 0, {}); f.place('display_table', 95, 122, 0, {});
    lamp(b, 94, 122, C_FAC, { flicker: 0.4 });
  }

  // ============================================================ 10. copy / supplies / archive (x 63..74, y 89..128)
  {
    room(b, 'Copy Centre', 'copy', 63, 89, 74, 97, { floor: 'linoleum', circuit: C_COPY });
    b.door(68, 89, 0, 'door_office', {}); b.door(63, 93, 1, 'door_office', {});
    for (let x = 64; x <= 72; x += 2) f.place('copier', x, 89, 0, {});
    f.place('printer_desk', 74, 92, BACK.e, {}); f.place('recycle_bin', 74, 97, 0, {}); f.place('display_table', 68, 94, 0, {});
    lamp(b, 66, 93, C_COPY); lamp(b, 71, 93, C_COPY);
    room(b, 'Supplies', 'storage', 63, 98, 74, 107, { floor: 'linoleum', circuit: C_COPY });
    b.door(63, 102, 1, 'door_office', { sign: 'staff' });
    for (let x = 65; x <= 73; x += 2) { f.place('shelf_metal', x, 100, 0, { loot: 'office_drawer' }); f.place('shelf_metal', x, 104, 0, { loot: 'office_drawer' }); }
    f.place('cardboard_stack', 74, 107, 0, {});
    lamp(b, 68, 102, C_COPY, { broken: true }); lamp(b, 68, 106, C_COPY, { flicker: 0.3 });
    room(b, 'Archive', 'records', 63, 108, 74, 128, { floor: 'linoleum', circuit: C_COPY, temp: 18 });
    b.door(63, 115, 1, 'door_office', {}); b.door(68, 129, 0, 'door_office', {});
    for (let y = 110; y <= 126; y += 3) for (let x = 65; x <= 73; x++) if (x !== 69) b.obj('filing_cabinet', x, y, y % 2 ? FACE.s : FACE.n, {});
    for (let y = 111; y <= 127; y += 6) lamp(b, 69, y, C_COPY, { flicker: rng.chance(0.3) ? 0.3 : 0 });
    f.floorItem('employee_handbook', 70, 112);
  }

  // ============================================================ 11. the giant open floor (x 15..62, y 89..128)
  buildFloor(c);

  // ============================================================ 12. ring + perimeter corridors
  {
    b.addRoom('Ring Corridor', 'corridor', RX0, RY0, RX1, KY0 - 1, { circuit: C_CORR });
    b.addRoom('Ring Corridor', 'corridor', RX0, KY1 + 1, RX1, RY1, { circuit: C_CORR });
    b.addRoom('Ring Corridor', 'corridor', RX0, KY0, KX0 - 1, KY1, { circuit: C_CORR });
    b.addRoom('Ring Corridor', 'corridor', KX1 + 1, KY0, RX1, KY1, { circuit: C_CORR });
    b.addRoom('North Corridor', 'corridor', 12, 12, 103, 14, { circuit: C_CORR });
    b.addRoom('South Corridor', 'corridor', 12, 129, 103, 131, { circuit: C_CORR });
    b.addRoom('West Corridor', 'corridor', 12, 15, 14, 128, { circuit: C_CORR });
    b.addRoom('East Corridor', 'corridor', 101, 15, 103, 128, { circuit: C_CORR });
    const pick = sectorPick(rng, 0.08, 0.15, 16);
    for (let x = 14; x <= 102; x += 4) { lamp(b, x, 13, C_CORR, pick(x, 13)); lamp(b, x, 130, C_CORR, pick(x, 130)); }
    for (let y = 17; y <= 127; y += 4) { lamp(b, 13, y, C_CORR, pick(13, y)); lamp(b, 102, y, C_CORR, pick(102, y)); }
    for (let x = RX0 + 1; x <= RX1; x += 4) { lamp(b, x, RY0 + 1, C_CORR, pick(x, RY0)); lamp(b, x, RY1 - 1, C_CORR, pick(x, RY1)); }
    for (let y = KY0 + 1; y <= KY1; y += 4) { lamp(b, RX0 + 1, y, C_CORR, pick(RX0, y)); lamp(b, RX1 - 1, y, C_CORR, pick(RX1, y)); }
    // corridor dressing
    for (let x = 18; x <= 100; x += 9) wallObj(b, rng.chance(0.3) ? 'poster' : 'painting', x, 12, 'n', { v: rng.int(0, 5) });
    for (let y = 20; y <= 125; y += 11) wallObj(b, 'fire_extinguisher_wall', 12, y + 1, 'w', {});
    for (let y = 60; y <= 84; y += 8) wallObj(b, 'poster', RX0, y, 'w', { v: rng.int(0, 5), lore: y === 60 ? 'poster_safety' : undefined });
    wallObj(b, 'exit_sign', 47, RY0, 'n', {});
    for (const [x, y] of [[13, 40], [13, 100], [102, 40], [102, 100], [60, 130]] as const) f.place('water_cooler', x, y, rng.int(0, 3) as Rot, {});
    for (const [x, y] of [[42, 57], [73, 87], [13, 14], [102, 129]] as const) f.place('plant_tall', x, y, 0, {});
    f.place('vending_snack', 42, 86, 0, {}); f.place('vending_soda', 43, 86, 0, {});
  }

  // ============================================================ 13. shifting regions
  shiftOffice443(c);
  shiftRecords(c);
  shiftFarm(c, 'farm_a_w', 17, 17, 42, 33, 1);
  shiftFarm(c, 'farm_a_e', 56, 38, 73, 53, 101);
  shiftFloorCluster(c);

  // ============================================================ 14. scatter: decals, floor loot
  {
    const shifted = (x: number, y: number) => (z.flags[z.idx(x, y)] & TF.SHIFT) !== 0;
    for (let i = 0; i < 900; i++) {
      const x = rng.int(PX0, PX1), y = rng.int(PY0, PY1);
      const k = z.idx(x, y);
      if (!z.floor[k] || shifted(x, y) || x > PX1) continue;
      const t = rng.weighted([['decal_stain_water', 4], ['decal_stain_dark', 3], ['decal_trash', 2], ['decal_footprints', 1.5], ['decal_mold', 0.8], ['decal_crack', 0.5]] as [string, number][]);
      f.decal(t, x, y, rng.float(0.7, 1.6), rng.float(0.7, 1.6));
    }
    scatterLoot(f, 'floor_generic', PX0, PY0, PX1, PY1, 45);
    scatterLoot(f, 'office_supplies', PX0, PY0, PX1, PY1, 25);
    scatterLoot(f, 'lore_bits', PX0, PY0, PX1, PY1, 6);
    scatterLoot(f, 'snacks', PX0, PY0, PX1, PY1, 10);
    // the wing's rooms between the seams hold a little more (reachable ones only)
    for (const y of [50, 60, 80, 90]) f.floorLoot('lore_bits', 118, y);
  }

  // ============================================================ 15. power, env, creatures
  for (let cc = 1; cc < circuitSeq; cc++) z.power.set(cc, !c.dead.has(cc));
  z.power.set(C_FLOOR_E, true);
  z.env = {
    ...z.env,
    ambient: 0x2c3136, ambientI: 0.56, fog: 0x15191d, fogNear: 14, fogFar: 32, void: 0x0b0d10, temp: 20,
    grade: 'office', reverb: 'office', ambience: 'office', music: 'drone',
  };
  z.spawnTable = [['employee', 3], ['swivel', 3], ['drywall_man', 1.5], ['ventling', 2], ['hollow', 1], ['custodian', 0.5]];
  z.creatureCap = 9;
  z.meta.terminalLore = ['terminal_mail_1', 'terminal_mail_2', 'terminal_generic'];
  z.meta.shiftRate = 1.0;
  // a few offices are wrong in one specific way each (world stream 3)
  wrongRoomsIn(z, b, seed ^ 0x77a1, ['office', 'empty'], 5, ['high_door', 'tiny_door', 'phones', 'tv_backs', 'chairs_corner', 'upside_down', 'ceiling_stairs'], { paper: 'wall_office' });
}

// ---------------------------------------------------------------- east wing
function buildEastWing(c: Ctx) {
  const { z, b, f, rng, seed } = c;
  // connector from the east corridor: access lobby, a door in the outer wall, a short bridge
  room(b, 'East Wing Access', 'corridor', 104, 64, 110, 77, { circuit: C_WING, floor: 'carpet_office' });
  b.door(104, 71, 1, 'door_glass', {});
  b.vwall(104, 70, 70, 'glass'); b.vwall(104, 72, 72, 'glass');
  b.door(PX1 + 1, 71, 1, 'door_office', { sign: 'office' });
  for (const gy of [70, 72]) b.vwall(PX1 + 1, gy, gy, 'concrete');
  f.place('plant_tall', 104, 64, 0, {}); f.place('plant_tall', PX1, 77, 0, {});
  f.place('waiting_chairs', 106, 64, 0, {});
  wallObj(b, 'painting', 108, 64, 'n', { v: 4 });
  lamp(b, 107, 68, C_WING); lamp(b, 107, 74, C_WING, { flicker: 0.25 });
  b.fillFloor(PX1 + 1, 70, EX0 - 1, 72, 'carpet_office');
  b.hwall(PX1 + 1, EX0 - 1, 70, 'drywall'); b.hwall(PX1 + 1, EX0 - 1, 73, 'drywall');
  b.paper(PX1 + 1, 70, EX0 - 1, 72, 'wall_office');
  b.addRoom('East Wing', 'corridor', PX1 + 1, 70, EX0 - 1, 72, { circuit: C_WING });

  // the wing shell
  b.paper(EX0, EY0, EX1, EY1, 'wall_office');
  b.roomWalls(EX0, EY0, EX1, EY1, 'drywall');
  b.fillFloor(ECX0, EY0, ECX1, EY1, 'carpet_office');
  b.addRoom('East Corridor', 'corridor_east', ECX0, EY0, ECX1, EY1, { circuit: C_WING });
  b.vwall(ECX0, EY0, EY1, 'drywall');
  b.vwall(ECX1 + 1, EY0, EY1, 'drywall');
  // connector into the corridor
  b.fillFloor(EX0, 70, ECX0 - 1, 72, 'carpet_office');
  for (const gy of [70, 71, 72]) { b.gap(EX0, gy, 1); b.gap(ECX0, gy, 1); }
  b.hwall(EX0, ECX0 - 1, 70, 'drywall'); b.hwall(EX0, ECX0 - 1, 73, 'drywall');
  b.addRoom('East Wing', 'corridor', EX0, 70, ECX0 - 1, 72, { circuit: C_WING });
  for (let x = EX0 + 1; x < ECX0; x += 4) lamp(b, x, 71, C_WING);

  // side rooms every 10 rows (period divides the loop length, so both seams match)
  const reach = (doorY: number) => doorY > LOOP_A && doorY < LOOP_B;
  for (let k = 0; ; k++) {
    const y0 = EY0 + k * 10, y1 = Math.min(EY1, y0 + 9);
    if (y0 > EY1) break;
    // west room (x 113..123), door on the corridor wall at y0+4
    const wy = y0 + 4;
    const inConnector = (y: number) => y >= 69 && y <= 73;
    if (!(y0 <= 73 && y1 >= 69)) {
      b.hwall(EX0, ECX0 - 1, y0, 'drywall');
      if (wy <= EY1) b.door(ECX0, wy, 1, 'door_office', { sign: 'office' });
      wingRoom(c, EX0, y0, ECX0 - 1, y1, 'e', k, reach(wy));
    } else {
      // around the connector: two short storerooms
      b.hwall(EX0, ECX0 - 1, y0, 'drywall');
      if (!inConnector(wy) && wy <= EY1) b.door(ECX0, wy, 1, 'door_office', {});
      if (y0 < 69) { room(b, 'Store', 'storage', EX0, y0, ECX0 - 1, 69, { floor: 'carpet_office', circuit: C_WING }); b.door(ECX0, 67, 1, 'door_office', {}); f.place('cardboard_stack', EX0, y0, 0, {}); f.place('chair_stack', EX0 + 1, y0, 0, {}); }
      if (y1 > 73) { room(b, 'Store', 'storage', EX0, 73, ECX0 - 1, y1, { floor: 'carpet_office', circuit: C_WING }); b.door(ECX0, 74, 1, 'door_office', {}); f.place('cardboard_box', EX0 + 2, y1, 0, {}); }
    }
    // east room (x 127..138), door at y0+6
    const ey = y0 + 6;
    b.hwall(ECX1 + 1, EX1, y0, 'drywall');
    if (ey <= EY1) b.door(ECX1 + 1, ey, 1, 'door_office', {});
    wingRoom(c, ECX1 + 1, y0, EX1, y1, 'w', k + 100, reach(ey));
  }

  // corridor dressing: a pure function of (row mod 60) so both seams look identical
  const P = (y: number) => ((y - EY0) % LOOP_D + LOOP_D) % LOOP_D;
  const hp = (y: number, salt: number) => hash3(P(y), salt, seed & 0xffff) / 4294967296;
  for (let y = EY0 + 1; y <= EY1; y++) {
    if (P(y) % 5 === 2) b.obj('light_fluoro', 125, y, 0, { circuit: C_WING, broken: hp(y, 1) < 0.12, flicker: hp(y, 2) < 0.2 ? 0.2 : 0 });
    if (P(y) % 10 === 8 && !(y >= 64 && y <= 76)) wallObj(b, 'painting', ECX0, y, 'w', { v: Math.floor(hp(y, 3) * 6) });
    if (P(y) % 20 === 1 && !(y >= 64 && y <= 76)) wallObj(b, 'fire_extinguisher_wall', ECX0, y, 'w', {});
    for (let x = ECX0; x <= ECX1; x++) {
      const h = hash3(x, P(y), (seed & 0xffff) + 9) / 4294967296;
      if (h < 0.06) decalAt(z, h < 0.03 ? 'decal_stain_water' : 'decal_stain_dark', x + 0.5, y + 0.5, 1.1, 1.0, h * 100, undefined, 0.8);
    }
  }
  // beyond the seams only the eye can go: keep spawns out of there
  b.flag(EX0, EY0, EX1, LOOP_A, TF.NOSPAWN);
  b.flag(EX0, LOOP_B, EX1, EY1, TF.NOSPAWN);
  // loop seams: walking past row 40 or 101 puts you back 60 rows the other way
  for (let x = ECX0; x <= ECX1; x++) {
    b.portal({ id: 'loop_e_n' + x, x, y: LOOP_A, kind: 'loop', to: 'office', tx: x, ty: LOOP_A + LOOP_D, loopDy: LOOP_D, hidden: true });
    b.portal({ id: 'loop_e_s' + x, x, y: LOOP_B, kind: 'loop', to: 'office', tx: x, ty: LOOP_B - LOOP_D, loopDy: -LOOP_D, hidden: true });
  }
  void rng;
}

/**
 * A room off the east corridor (all of them nominally "4-19"). Contents repeat
 * with the loop period (k mod 6) so the rooms seen across either seam match.
 */
function wingRoom(c0: Ctx, x0: number, y0: number, x1: number, y1: number, door: Side, k: number, reachable: boolean) {
  const kk = ((k % 100) % (LOOP_D / 10)) + (k >= 100 ? 100 : 0);
  const rng = new Rng(hash3(c0.seed, 919, kk));
  const b = c0.b;
  const c: Ctx = { ...c0, rng, f: new Furnisher(b, rng) };
  const f = c.f;
  b.fillFloor(x0, y0, x1, y1, 'carpet_office');
  const kind = kk % 5;
  b.addRoom('Office 4-19', kind === 3 ? 'empty' : 'office', x0, y0, x1, y1, { circuit: C_WING });
  if (y1 - y0 < 4) return;
  if (kind === 0 || kind === 2) furnishOffice(c, x0, y0, x1, y1, door, C_WING, { wrong: rng.int(0, 6) });
  else if (kind === 1) {
    // twelve chairs facing the wall
    for (let i = 0; i < 12; i++) b.obj('chair_office', x0 + 1 + (i % 4) * 2, y0 + 2 + Math.floor(i / 4) * 2, FACE.n, {});
    lamp(b, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), C_WING, { flicker: 0.3 });
  } else if (kind === 3) {
    // empty, except for the carpet being newer in one rectangle
    lamp(b, Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), C_WING, { broken: rng.chance(0.5) });
    decalAt(c.z, 'decal_stain_dark', (x0 + x1) / 2 + 0.5, (y0 + y1) / 2 + 0.5, 3, 2, 0, 0x30302a, 0.25);
  } else {
    // a small break room nobody books
    const k1 = f.place('counter_kitchen', x0 + 1, y0, 0, {}); f.onTop('coffee_maker', k1, {});
    f.place('fridge', x0 + 2, y0, 0, { loot: 'fridge_office' });
    f.place('vending_snack', x0 + 4, y0, 0, {});
    f.place('table_round', x0 + 4, y0 + 4, 0, {}); f.place('chair_plastic', x0 + 3, y0 + 4, FACE.e, {}); f.place('chair_plastic', x0 + 5, y0 + 4, FACE.w, {});
    lamp(b, x0 + 4, y0 + 3, C_WING);
  }
  void reachable;
}

// ---------------------------------------------------------------- giant floor
function buildFloor(c: Ctx) {
  const { z, b, f, rng } = c;
  const x0 = 15, y0 = 89, x1 = 62, y1 = 128;
  b.addRoom('The Floor', 'openplan', x0, y0, x1, y1, { circuit: C_FLOOR_W });
  b.addRoom('The Floor', 'openplan', 39, y0, x1, y1, { circuit: C_FLOOR_E });
  b.fillFloor(x0, y0, x1, y1, 'carpet_office');
  // walls: west corridor, records block, ring corridor (mostly open), copy column, south corridor
  b.vwall(x0, y0, y1, 'drywall');
  for (const gy of [95, 96, 107, 108, 119, 120]) b.gap(x0, gy, 1);
  b.hwall(x0, 40, y0, 'drywall');
  b.hwall(41, 42, y0, 'drywall'); b.hwall(61, 62, y0, 'drywall');
  b.vwall(63, y0, y1, 'drywall');
  b.hwall(x0, x1, 129, 'drywall');
  for (const gx of [20, 21, 38, 39, 56, 57]) b.gap(gx, 129, 0);
  // columns on the aisle grid
  forColumns((cx, cy) => column(b, cx, cy));
  // bench desks (fixed part; the cluster in the middle shifts)
  for (const [bx, by] of benchSlots()) {
    if (bx >= 37 && bx <= 54 && by >= 103 && by <= 118) continue;
    bench(c, bx, by, rng.chance(0.15));
  }
  // lights: a 4x3 grid with dead sectors deep in the floor
  const pick = sectorPick(rng, 0.22, 0.25, 12);
  for (let y = y0 + 1; y <= y1; y += 3) for (let x = x0 + 1; x <= x1; x += 4) {
    if (x >= 37 && x <= 54 && y >= 103 && y <= 118) continue;
    lamp(b, x, y, x >= 39 ? C_FLOOR_E : C_FLOOR_W, pick(x, y));
  }
  // the supply closet box in the far corner (the other end of the core closet)
  {
    const cx0 = 15, cy0 = 125, cx1 = 17, cy1 = 127;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) z.floor[z.idx(x, y)] = 0;
    b.roomWalls(cx0, cy0, cx1, cy1, 'drywall');
    b.paper(cx0 - 1, cy0 - 1, cx1 + 1, cy1 + 1, 'wall_office');
    b.door(16, cy0, 0, 'door_office', { portal: 'closet_b', sign: 'staff' });
    b.portal({ id: 'closet_b', x: 16, y: cy0 - 1, kind: 'door', to: 'office', tx: 62, ty: 87, label: 'Open the supply closet' });
    anchor(z, 'closet_a', 15, cy0 - 1, 'n');
    lamp(b, 16, 123, C_FLOOR_W, { flicker: 0.25 });
    noSpawn(b, 16, 123, 2);
  }
  // something about the middle of the floor: one desk turned to face the wall, alone
  f.place('desk_office', 59, 128, BACK.s, {});
  b.obj('chair_office', 60, 127, FACE.s, {});
  wallObj(b, 'poster', 63, 110, 'w', { v: 0, lore: 'poster_safety' });
  wallObj(b, 'clock_wall', 15, 101, 'w', {});
  for (const [x, y] of [[16, 90], [61, 90], [16, 112], [40, 127]] as const) f.place('plant_tall', x, y, 0, {});
  void rng;
}

function forColumns(fn: (x: number, y: number) => void) {
  for (const cx of [25, 35, 45, 55]) for (const cy of [95, 101, 107, 113, 119]) fn(cx, cy);
}
function column(b: ZoneBuilder, x: number, y: number) {
  b.z.floor[b.z.idx(x, y)] = 0;
  b.roomWalls(x, y, x, y, 'concrete');
}
function benchSlots(): [number, number][] {
  const out: [number, number][] = [];
  for (const bx of [17, 27, 37, 47]) for (const by of [91, 97, 103, 109, 115, 121]) out.push([bx, by]);
  return out;
}
/** a bench: 4 desks a side back to back with a low screen between, chairs both sides */
function bench(c: Ctx, x0: number, y0: number, sparse: boolean) {
  const { b, f, rng } = c;
  b.hwall(x0, x0 + 7, y0 + 2, 'cubicle');
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * 2;
    for (const side of [0, 1]) {
      const dy = side === 0 ? y0 + 1 : y0 + 2, cy = side === 0 ? y0 : y0 + 3;
      if (sparse && rng.chance(0.5)) continue;
      const d = b.obj('desk_office', x, dy, side === 0 ? BACK.s : BACK.n, {});
      if (rng.chance(0.7)) f.onTop('computer', d, { on: rng.chance(0.7) });
      if (rng.chance(0.85)) b.obj('chair_office', x + rng.int(0, 1), cy, rng.chance(0.85) ? (side === 0 ? FACE.s : FACE.n) : rng.int(0, 3) as Rot, {});
    }
  }
}

// ---------------------------------------------------------------- shifting regions
/** Office 4-43: its door is never where you left it */
function shiftOffice443(c: Ctx) {
  const { z } = c;
  const x0 = 28, y0 = PY0, x1 = 35, y1 = 12;
  const cc = c443;
  for (let wx = x0 + 1; wx <= x1 - 1; wx += 3) c.b.window(wx, PY0, 0, { style: 'window_metal' });
  c.b.addRoom('Office 4-43', 'office', x0, y0, x1, 11, { circuit: cc });
  registerShift(z, 'office_4_43', x0, y0, x1, y1, 4, (sb, srng, v) => {
    sb.fillFloor(x0, y0, x1, y1, 'carpet_office');
    sb.hwall(x0, x1, 12, 'drywall');
    const doorX = [x0 + 3, x1 - 1, x0 + 1, -1][v];
    if (doorX >= 0) sb.door(doorX, 12, 0, 'door_office', { sign: 'office' });
    else sb.window(x0 + 4, 12, 0, { style: 'window_metal' });
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    furnishOffice(sc, x0, y0, x1, 11, 's', cc, { wrong: v === 3 ? 1 : -1 });
    if (v === 3) sb.obj('skeleton', x0 + 2, 10, 0, {});
    lamp(sb, x0 + 2, 13 - 1, C_CORR);
  });
}

/** Records: the corridor between the west corridor and the ring changes length */
function shiftRecords(c: Ctx) {
  const { z, b } = c;
  const x0 = 15, y0 = 55, x1 = 40, y1 = 88;
  // fixed border walls with the openings every variant must connect
  b.vwall(x0, y0, y1, 'drywall');
  for (const gy of [62, 63, 80, 81]) b.gap(x0, gy, 1);
  b.vwall(RX0, y0, y1, 'drywall');
  for (const gy of [70, 71]) b.gap(RX0, gy, 1);
  for (const gx of [30, 31]) b.gap(gx, y1 + 1, 0);
  b.addRoom('Records', 'records', x0, y0, x1, y1, { circuit: C_REC });
  registerShift(z, 'records', x0, y0, x1, y1, 4, (sb, srng, v) => {
    sb.fillFloor(x0, y0, x1, y1, 'carpet_office');
    const sf = new Furnisher(sb, srng);
    const cab = (x: number, y: number, r: Rot) => { if (!sb.z.objectsAt(x, y).length) sb.obj(srng.chance(0.85) ? 'filing_cabinet' : 'bookshelf', x, y, r, {}); };
    if (v === 0) {
      // a straight E-W corridor (y 70..71) and a N-S one (x 26..27), four records rooms
      sb.hwall(x0, x1, 70, 'drywall'); sb.hwall(x0, x1, 72, 'drywall');
      sb.vwall(26, y0, 69, 'drywall'); sb.vwall(28, y0, 69, 'drywall');
      sb.vwall(26, 72, y1, 'drywall'); sb.vwall(28, 72, y1, 'drywall');
      for (const x of [26, 27]) { sb.gap(x, 70, 0); sb.gap(x, 72, 0); }
      for (const [x, y, s] of [[20, 70, 0], [34, 70, 0], [20, 72, 0], [34, 72, 0], [26, 60, 1], [28, 60, 1], [26, 82, 1], [28, 82, 1]] as const) sb.door(x, y, s as 0 | 1, 'door_office', {});
      for (let y = 57; y <= 68; y += 4) for (let x = 16; x <= 25; x++) if (x !== 20 && x !== 21) cab(x, y, FACE.s);
      for (let y = 57; y <= 68; y += 4) for (let x = 29; x <= 40; x++) if (x !== 34 && x !== 35) cab(x, y, FACE.s);
      for (let y = 74; y <= 87; y += 3) for (let x = 16; x <= 25; x++) if (x !== 20 && x !== 21) cab(x, y, FACE.n);
      for (let y = 74; y <= 87; y += 3) for (let x = 29; x <= 40; x++) if (x !== 30 && x !== 31 && x !== 34) cab(x, y, FACE.n);
      for (let x = 17; x <= 40; x += 4) lamp(sb, x, 71, C_REC);
      for (const [x, y] of [[20, 63], [34, 63], [20, 80], [34, 80]]) lamp(sb, x, y, C_REC, { flicker: srng.chance(0.3) ? 0.2 : 0 });
    } else if (v === 1) {
      // switchback: lanes four rows tall, the gap alternating ends — much longer
      const lanes = [59, 63, 67, 71, 75, 79, 83, 87];
      lanes.forEach((y, i) => {
        if (y > y1) return;
        sb.hwall(x0, x1, y, 'drywall');
        const gx = i % 2 === 0 ? [x1 - 1, x1] : [x0, x0 + 1];
        for (const x of gx) sb.gap(x, y, 0);
      });
      // keep the fixed openings reachable: the north gap row and the south exit
      for (const y of [55, 59, 63, 67, 71, 75, 79, 83, 87]) for (let x = x0 + 3; x <= x1 - 3; x += 5) if (y + 1 <= y1) cab(x, y + 1, FACE.s);
      for (let y = y0 + 2; y <= y1; y += 4) for (let x = x0 + 3; x <= x1; x += 6) lamp(sb, x, y, C_REC, { broken: srng.chance(0.2) });
    } else if (v === 2) {
      // open stacks: short and direct
      for (let y = y0 + 2; y <= y1 - 2; y += 3) for (let x = x0 + 2; x <= x1 - 3; x += 4) { sb.obj('library_shelf', x, y, srng.chance(0.5) ? 0 : 2, {}); }
      for (let y = y0 + 1; y <= y1; y += 4) for (let x = x0 + 2; x <= x1; x += 5) lamp(sb, x, y, C_REC);
      sf.place('desk_office', 36, 86, 0, {}); sf.place('chair_office', 37, 85, FACE.s, {});
    } else {
      // the corridor is offset and dead-ends; the way through is a side room
      sb.hwall(x0, 34, 64, 'drywall'); sb.hwall(x0, 34, 66, 'drywall');
      sb.vwall(35, 64, 71, 'drywall'); sb.hwall(35, x1, 72, 'drywall');
      for (const [x, y, s] of [[18, 64, 0], [30, 64, 0], [18, 66, 0], [30, 66, 0], [37, 72, 0], [35, 68, 1]] as const) sb.door(x, y, s as 0 | 1, 'door_office', {});
      sb.vwall(27, 67, y1, 'drywall'); sb.door(27, 78, 1, 'door_office', {});
      for (let y = 57; y <= 61; y += 2) for (let x = 16; x <= 39; x += 1) if (x % 5 !== 0) cab(x, y, FACE.s);
      for (let y = 69; y <= 86; y += 3) for (let x = 16; x <= 25; x++) if (x !== 18 && x !== 19) cab(x, y, FACE.n);
      for (let y = 74; y <= 86; y += 4) for (let x = 29; x <= 39; x++) if (x !== 30 && x !== 31 && x !== 37) cab(x, y, FACE.n);
      sb.obj('chair_office', 33, 70, FACE.w, {});
      for (let x = 17; x <= 34; x += 5) lamp(sb, x, 65, C_REC);
      for (const [x, y] of [[20, 60], [32, 60], [21, 78], [33, 80], [37, 68], [31, 70]]) lamp(sb, x, y, C_REC, { flicker: 0.15 });
    }
  });
}

/** a cubicle cluster that rearranges */
function shiftFarm(c: Ctx, id: string, x0: number, y0: number, x1: number, y1: number, wsBase: number) {
  const { z } = c;
  registerShift(z, id, x0, y0, x1, y1, 4, (sb, srng, v) => {
    sb.fillFloor(x0, y0, x1, y1, 'carpet_office');
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 0) podField(sc, x0, y0, x1, y1, C_FARM, wsBase);
    else if (v === 1) podField(sc, x0, y0, x1, y1, C_FARM, wsBase, { empty: 0.6 });
    else if (v === 2) {
      // the partitions are all there; the desks are gone; the chairs remain, facing in
      podField(sc, x0, y0, x1, y1, C_FARM, wsBase, { empty: 1 });
      const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = Math.round(cx + Math.cos(a) * 3), y = Math.round(cy + Math.sin(a) * 2);
        if (!sb.z.solid[sb.z.idx(x, y)] && !sb.z.objectsAt(x, y).some((o) => o.key !== 'light_fluoro')) sb.obj('chair_office', x, y, (Math.abs(Math.cos(a)) > 0.7 ? (Math.cos(a) > 0 ? FACE.w : FACE.e) : (Math.sin(a) > 0 ? FACE.n : FACE.s)) as Rot, {});
      }
    } else {
      // one long maze of partitions with a single desk at its heart
      for (let y = y0 + 1; y <= y1 - 1; y += 3) {
        const gap = ((y - y0) / 3) % 2 === 0 ? x1 - 1 : x0 + 1;
        for (let x = x0; x <= x1; x++) if (Math.abs(x - gap) > 1) sb.hwall(x, x, y, 'cubicle');
      }
      const cx = Math.floor((x0 + x1) / 2), cy = y0 + 1 + 3 * Math.floor((y1 - y0) / 6);
      const d = sb.obj('desk_cubicle', cx, cy, BACK.n, {}); sc.f.onTop('computer', d, { on: true });
      sb.obj('chair_office', cx, cy + 1, FACE.n, {});
      for (let y = y0 + 2; y <= y1; y += 3) for (let x = x0 + 2; x <= x1; x += 5) lamp(sb, x, y, C_FARM, { flicker: srng.chance(0.2) ? 0.25 : 0 });
    }
  });
}

/** the middle of the open floor rearranges its benches */
function shiftFloorCluster(c: Ctx) {
  const { z } = c;
  const x0 = 37, y0 = 103, x1 = 54, y1 = 118;
  registerShift(z, 'floor_cluster', x0, y0, x1, y1, 4, (sb, srng, v) => {
    sb.fillFloor(x0, y0, x1, y1, 'carpet_office');
    forColumns((cx, cy) => { if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) column(sb, cx, cy); });
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 0) { for (const [bx, by] of benchSlots()) if (bx >= x0 && bx <= x1 && by >= y0 && by <= y1) bench(sc, bx, by, false); }
    else if (v === 1) {
      // benches turned north-south
      for (const bx of [38, 48]) for (let k = 0; k < 2; k++) {
        const by = y0 + 1 + k * 8;
        sb.vwall(bx + 2, by, by + 6, 'cubicle');
        for (let i = 0; i < 3; i++) {
          sb.obj('desk_office', bx + 1, by + i * 2, BACK.e, {});
          sb.obj('desk_office', bx + 2, by + i * 2, BACK.w, {});
          sb.obj('chair_office', bx, by + i * 2, FACE.e, {});
          sb.obj('chair_office', bx + 3, by + i * 2 + 1, FACE.w, {});
        }
      }
    } else if (v === 2) {
      // every desk pushed into one heap in the middle
      for (let i = 0; i < 14; i++) {
        const x = srng.int(42, 49), y = srng.int(108, 113);
        if (!sb.z.objectsAt(x, y).length && sb.z.floor[sb.z.idx(x, y)]) sb.obj(srng.chance(0.6) ? 'desk_office' : 'chair_stack', x, y, srng.int(0, 3) as Rot, {});
      }
    } else {
      // a ring of chairs around one desk
      const cx = 45.5, cy = 110.5;
      sb.obj('desk_office', 44, 110, 0, {});
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const x = Math.floor(cx + Math.cos(a) * 6), y = Math.floor(cy + Math.sin(a) * 5);
        if (sb.z.floor[sb.z.idx(x, y)] && !sb.z.objectsAt(x, y).length) sb.obj('chair_office', x, y, (Math.abs(Math.cos(a)) > 0.7 ? (Math.cos(a) > 0 ? FACE.w : FACE.e) : (Math.sin(a) > 0 ? FACE.n : FACE.s)) as Rot, {});
      }
    }
    for (let y = y0 + 1; y <= y1; y += 3) for (let x = x0 + 1; x <= x1; x += 4) lamp(sb, x, y, C_FLOOR_E, { broken: srng.chance(0.2), flicker: srng.chance(0.15) ? 0.25 : 0 });
  });
}

defZone({
  key: 'office', name: 'Level 4 — Meridian Offices', W: 144, H: 144, depth: 1, gen: (z, s) => generateOffice(z, s),
  blurb: 'Carpet tiles, partition walls, a hum one note lower than Level 0. Someone is reading numbers on 88.1.',
});
