// The Halcyon — Third Floor (88×64, depth 3): a grand hotel corridor that runs
// all the way round. Patterned teal-and-gold carpet, damask over mahogany, a
// brass tulip sconce every three metres, a room-service tray outside half the
// doors, and the same room numbers coming round again.
//   the Ring           a corridor three tiles wide round the whole floor; an ice
//                      machine nook off every corner
//   the guest rooms    on both sides of the ring: bed, nightstands and lamps,
//                      wardrobe, dresser and set, armchair, a tiled bathroom by
//                      the door; one in a few full of somebody's luggage
//   the Fire Stairs    west: the steel door down to the Stairwell (landing 3)
//   the Lift Lobby     east: marble, walnut, a chandelier, the concierge's key
//                      rack, a brass luggage cart, the lift down to Parking P∞
//   the staff core     the middle of the floor, through STAFF doors off the
//                      north and south arms: the Linen Room with the press, the
//                      Laundry and Housekeeping
// z.meta.hotel carries the ring and every door off it for the inhabitant
// (src/creatures/species/unclaimed.ts): the Unclaimed walks the ring clockwise,
// rings at the corners, charges down the straights, and knocks at doors.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, type Rot, type Side, BACK, arrive, put, force, mount, decal, hh, isOpen, hopperAt } from './weird_kit';

const W = 88, H = 64;
const CARPET = 'ht_carpet', ROOMF = 'ht_room', MARBLE = 'ht_marble', HEX = 'ht_hex';
const P_HALL = 'ht_paper_hall', P_ROOM = 'ht_paper_room', P_LIFT = 'ht_paper_lift', P_BATH = 'ht_paper_bath', P_STAFF = 'ht_paper_staff';
const C_HALL = 1, C_ROOMS = 2, C_CORE = 3, C_LOBBY = 4;
// the ring: outer bounds and arm width
const RX0 = 8, RX1 = 79, RY0 = 8, RY1 = 55, ARM = 3;
type R = { x0: number; y0: number; x1: number; y1: number };
/** a door off the ring: the corridor tile in front of it, the step into the room, the room */
export interface HotelDoor { x: number; y: number; ix: number; iy: number; room: [number, number, number, number]; kind: 'room' | 'open' | 'staff' }

export function generateHotel(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Halcyon — Third Floor';
  const doors: HotelDoor[] = [];
  let roomNo = 301;

  // ============================================================ the ring
  b.fillFloor(RX0, RY0, RX1, RY1, CARPET);
  // the inner block (rooms + core) is floored room by room below; clear it first
  for (let y = RY0 + ARM; y <= RY1 - ARM; y++) for (let x = RX0 + ARM; x <= RX1 - ARM; x++) z.floor[z.idx(x, y)] = 0;
  b.roomWalls(RX0, RY0, RX1, RY1, 'drywall');
  b.roomWalls(RX0 + ARM, RY0 + ARM, RX1 - ARM, RY1 - ARM, 'drywall');
  b.addRoom('North Corridor', 'corridor', RX0, RY0, RX1, RY0 + ARM - 1, { circuit: C_HALL, temp: 21 });
  b.addRoom('South Corridor', 'corridor', RX0, RY1 - ARM + 1, RX1, RY1, { circuit: C_HALL, temp: 21 });
  b.addRoom('West Corridor', 'corridor', RX0, RY0 + ARM, RX0 + ARM - 1, RY1 - ARM, { circuit: C_HALL, temp: 21 });
  b.addRoom('East Corridor', 'corridor', RX1 - ARM + 1, RY0 + ARM, RX1, RY1 - ARM, { circuit: C_HALL, temp: 21 });
  b.paper(RX0, RY0, RX1, RY1, P_HALL);

  // ============================================================ guest rooms (local frame: u along the door wall, d into the room)
  /**
   * A room rect with its door wall on side `dw` (the side facing the ring) and
   * the door at local column `du`. Returns the local -> world mapper.
   */
  const frame = (r: R, dw: Side) => {
    const alongX = dw === 'n' || dw === 's';
    const Wd = alongX ? r.x1 - r.x0 + 1 : r.y1 - r.y0 + 1;
    const Dp = alongX ? r.y1 - r.y0 + 1 : r.x1 - r.x0 + 1;
    const at = (u: number, d: number): [number, number] => {
      switch (dw) {
        case 's': return [r.x0 + u, r.y1 - d];
        case 'n': return [r.x0 + u, r.y0 + d];
        case 'e': return [r.x1 - d, r.y0 + u];
        default: return [r.x0 + d, r.y0 + u];
      }
    };
    const far: Side = ({ s: 'n', n: 's', e: 'w', w: 'e' } as const)[dw];
    const uLo: Side = alongX ? 'w' : 'n', uHi: Side = alongX ? 'e' : 's';
    /** wall (or door) on the edge between two adjacent world tiles */
    const edge = (a: [number, number], bb: [number, number], door?: string, opts: Record<string, any> = {}) => {
      const [ax, ay] = a, [bx, by] = bb;
      if (ay === by) { const x = Math.max(ax, bx); if (door) b.door(x, ay, 1, door, opts); else b.vwall(x, ay, ay, 'drywall'); }
      else { const y = Math.max(ay, by); if (door) b.door(ax, y, 0, door, opts); else b.hwall(ax, ax, y, 'drywall'); }
    };
    return { Wd, Dp, at, far, uLo, uHi, alongX, edge };
  };
  const rotFor = (alongX: boolean) => (alongX ? 0 : 1) as Rot;

  /** a guest room off the ring: door wall `dw` faces the corridor */
  const guestRoom = (r: R, dw: Side, variant: number) => {
    const F = frame(r, dw);
    const { Wd, Dp, at, far, uLo, uHi, alongX, edge } = F;
    b.fillFloor(r.x0, r.y0, r.x1, r.y1, ROOMF);
    b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'drywall');
    b.paper(r.x0, r.y0, r.x1, r.y1, P_ROOM);
    const no = roomNo++;
    b.addRoom('Room ' + no, 'guest_room', r.x0, r.y0, r.x1, r.y1, { circuit: C_ROOMS, temp: 22, lootMul: 1.15 });
    // the door: local column 1, the corridor tile just outside it
    const du = 1;
    const [ix, iy] = at(du, 0);
    const out: [number, number] = dw === 's' ? [ix, iy + 1] : dw === 'n' ? [ix, iy - 1] : dw === 'e' ? [ix + 1, iy] : [ix - 1, iy];
    edge([ix, iy], out, 'door_wood', { open: false });
    doors.push({ x: out[0], y: out[1], ix: ix - out[0], iy: iy - out[1], room: [r.x0, r.y0, r.x1, r.y1], kind: 'room' });
    // the brass number on the corridor wall beside the door, a sconce either side
    const side = ({ s: 'n', n: 's', e: 'w', w: 'e' } as const)[dw] as Side;   // the wall the plate hangs on, seen from the corridor tile
    const along = (k: number): [number, number] => (alongX ? [out[0] + k, out[1]] : [out[0], out[1] + k]);
    { const [px, py] = along(1); mount(b, 'ht_number', px, py, side, { n: no }); }
    // a tray left outside the door, now and then
    if (hh(no, 3, 7401) < 0.4) { const [tx, ty] = along(-1); if (isOpen(z, tx, ty)) { put(c, 'ht_tray', tx, ty, 0, {}); if (hh(no, 4, 7402) < 0.3) f.floorItem('note', tx, ty, { lore: 'ht_bill' }); } }

    // ---- the bathroom by the door: local u Wd-4 .. Wd-1, d 0 .. 2
    const bu0 = Wd - 4;
    const bath: R = (() => { const a = at(bu0, 0), bb = at(Wd - 1, 2); return { x0: Math.min(a[0], bb[0]), y0: Math.min(a[1], bb[1]), x1: Math.max(a[0], bb[0]), y1: Math.max(a[1], bb[1]) }; })();
    b.fillFloor(bath.x0, bath.y0, bath.x1, bath.y1, HEX);
    b.paper(bath.x0, bath.y0, bath.x1, bath.y1, P_BATH);
    for (let d = 0; d <= 2; d++) edge(at(bu0 - 1, d), at(bu0, d), d === 1 ? 'door_white' : undefined, d === 1 ? { open: true } : {});
    for (let u = bu0; u < Wd; u++) edge(at(u, 2), at(u, 3));
    b.addRoom('Bathroom ' + no, 'bathroom', bath.x0, bath.y0, bath.x1, bath.y1, { circuit: C_ROOMS, temp: 23 });
    {
      // tub along the door wall, toilet and basin on the far side of the bathroom
      const t0 = at(Wd - 2, 0), t1 = at(Wd - 1, 0);
      put(c, 'bathtub', Math.min(t0[0], t1[0]), Math.min(t0[1], t1[1]), rotFor(alongX), {});
      const [sx, sy] = at(bu0 + 1, 2); put(c, 'sink_bathroom', sx, sy, BACK[far], {}); mount(b, 'mirror', sx, sy, far, {});
      const [wx, wy] = at(Wd - 1, 2); put(c, 'toilet', wx, wy, BACK[far], {});
      b.light((bath.x0 + bath.x1 + 1) / 2, (bath.y0 + bath.y1 + 1) / 2, 'fluoro', { circuit: C_ROOMS, intensity: 0.5, radius: 3.5 });
    }

    // ---- the bedroom
    const luggage = variant === 1;
    const bu = Math.max(1, Math.floor(Wd / 2) - 1);
    {
      const a = at(bu, Dp - 1), bb = at(bu + 1, Dp - 2);
      put(c, 'bed_double', Math.min(a[0], bb[0]), Math.min(a[1], bb[1]), BACK[far], {});
      for (const nu of [bu - 1, bu + 2]) {
        if (nu < 0 || nu >= Wd) continue;
        const [nx, ny] = at(nu, Dp - 1);
        const ns = put(c, 'nightstand', nx, ny, BACK[far], {});
        if (ns) f.onTop('lamp_table', ns, {});
      }
      const [px, py] = at(bu, Dp - 1); mount(b, 'painting', px, py, far, { v: no % 6 });
      if (hh(no, 5, 7403) < 0.5) { const [cx2, cy2] = at(bu + 1, Dp - 2); f.floorItem('note', cx2, cy2, { lore: 'ht_card' }); }
    }
    { const [x, y] = at(0, 3); put(c, 'wardrobe', x, y, BACK[uLo], {}); }
    { const [x, y] = at(Wd - 1, Dp - 3); const d = put(c, 'dresser', x, y, BACK[uHi], {}); if (d && hh(no, 6, 7404) < 0.7) f.onTop('tv_crt', d, {}); }
    { const [x, y] = at(Wd - 1, Dp - 1); put(c, 'armchair', x, y, BACK[far], {}); }
    { const [x, y] = at(Math.floor(Wd / 2), Math.floor(Dp / 2) + 1); b.light(x + 0.5, y + 0.5, 'bulb', { circuit: C_ROOMS, intensity: 0.85, radius: 5.5, color: 0xffe2b8 }); }
    if (luggage) {
      // somebody's luggage, all of it, waiting to be claimed
      for (let k = 0; k < 5; k++) { const [x, y] = at(rng.int(0, Wd - 5), rng.int(3, Dp - 3)); if (isOpen(z, x, y)) put(c, k % 2 ? 'zw_luggage_pile' : 'zw_suitcase', x, y, rng.int(0, 3) as Rot, {}); }
    }
    { const [x, y] = at(rng.int(0, Math.max(0, Wd - 5)), rng.int(3, Dp - 2)); if (isOpen(z, x, y)) f.floorLoot('ht_room', x, y); }
  };

  // north outer rows (doors on their south walls), south outer rows (doors north)
  const NROW: [number, number][] = [[11, 18], [19, 26], [27, 34], [35, 42], [43, 50], [51, 58], [59, 66], [67, 76]];
  NROW.forEach(([x0, x1], k) => guestRoom({ x0, y0: 1, x1, y1: RY0 - 1 }, 's', hh(k, 1, 7410) < 0.15 ? 1 : 0));
  NROW.forEach(([x0, x1], k) => guestRoom({ x0, y0: RY1 + 1, x1, y1: H - 2 }, 'n', hh(k, 2, 7410) < 0.15 ? 1 : 0));
  // west outer column (the Fire Stairs in the middle), east outer column (the Lift Lobby in the middle)
  for (const [y0, y1] of [[11, 18], [19, 26], [35, 42], [43, 52]] as const) guestRoom({ x0: 1, y0, x1: RX0 - 1, y1 }, 'e', hh(y0, 3, 7410) < 0.15 ? 1 : 0);
  for (const [y0, y1] of [[11, 18], [19, 26], [37, 44], [45, 52]] as const) guestRoom({ x0: RX1 + 1, y0, x1: W - 2, y1 }, 'w', hh(y0, 4, 7410) < 0.15 ? 1 : 0);
  // the inner ring of rooms round the staff core
  const IN = { x0: RX0 + ARM, y0: RY0 + ARM, x1: RX1 - ARM, y1: RY1 - ARM };   // 11..76 x 11..52
  const INNER_N: [number, number][] = [[11, 18], [19, 26], [27, 34], [35, 42], [46, 53], [54, 61], [62, 69], [70, 76]];
  INNER_N.forEach(([x0, x1], k) => guestRoom({ x0, y0: IN.y0, x1, y1: IN.y0 + 6 }, 'n', hh(k, 5, 7410) < 0.2 ? 1 : 0));
  INNER_N.forEach(([x0, x1], k) => guestRoom({ x0, y0: IN.y1 - 6, x1, y1: IN.y1 }, 's', hh(k, 6, 7410) < 0.2 ? 1 : 0));
  for (const [y0, y1] of [[18, 25], [26, 33], [34, 39], [40, 45]] as const) guestRoom({ x0: IN.x0, y0, x1: IN.x0 + 6, y1 }, 'w', 0);
  for (const [y0, y1] of [[18, 25], [26, 33], [34, 39], [40, 45]] as const) guestRoom({ x0: IN.x1 - 6, y0, x1: IN.x1, y1 }, 'e', 0);

  // ============================================================ the ice nooks off every corner
  const nook = (x0: number, y0: number, x1: number, y1: number, openSide: 'n' | 's', label: string) => {
    b.fillFloor(x0, y0, x1, y1, MARBLE);
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.paper(x0, y0, x1, y1, P_LIFT);
    b.addRoom(label, 'ice_nook', x0, y0, x1, y1, { circuit: C_HALL, temp: 18 });
    const ey = openSide === 's' ? y1 + 1 : y0;
    for (let x = x0; x <= x1; x++) b.arch(x, ey, 0);
    const back = openSide === 's' ? y0 : y1, backSide: Side = openSide === 's' ? 'n' : 's';
    force(c, 'ht_ice', x0 + 1, back, BACK[backSide], {});
    put(c, 'vending_soda', x0, back, BACK[backSide], {});
    put(c, 'vending_snack', x1, back, BACK[backSide], {});
    mount(b, 'ht_sconce', x0, openSide === 's' ? y0 + 1 : y1 - 1, 'w', {});
    mount(b, 'ht_sconce', x1, openSide === 's' ? y0 + 1 : y1 - 1, 'e', {});
    b.light(x0 + 1.5, (y0 + y1 + 1) / 2, 'fluoro', { circuit: C_HALL, intensity: 0.55, radius: 4.5, color: 0xe8f4ff });
  };
  nook(RX0, 3, RX0 + 2, RY0 - 1, 's', 'Ice NW');
  nook(RX1 - 2, 3, RX1, RY0 - 1, 's', 'Ice NE');
  nook(RX0, RY1 + 1, RX0 + 2, H - 4, 'n', 'Ice SW');
  nook(RX1 - 2, RY1 + 1, RX1, H - 4, 'n', 'Ice SE');

  // ============================================================ the Fire Stairs (west) and the way down to the Stairwell
  {
    const r: R = { x0: 1, y0: 27, x1: RX0 - 1, y1: 34 };
    b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'concrete');
    b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'cinder');
    b.paper(r.x0, r.y0, r.x1, r.y1, 'wall_cinder');
    b.addRoom('Fire Stairs', 'fire_stairs', r.x0, r.y0, r.x1, r.y1, { circuit: C_HALL, temp: 15 });
    b.door(RX0, 30, 1, 'door_metal', { sign: 'stairs' });
    doors.push({ x: RX0, y: 30, ix: -1, iy: 0, room: [r.x0, r.y0, r.x1, r.y1], kind: 'staff' });
    b.door(r.x0, 30, 1, 'door_metal', { portal: 'r_stair_hotel', sign: 'stairs' });
    b.portal({ id: 'r_stair_hotel', x: r.x0, y: 30, kind: 'door', to: 'stairwell', tx: 21, ty: 27, label: 'Go down to the Stairwell' });
    arrive(b, 'p_stair_hotel', r.x0 + 3, 30, 'e', 2);
    for (let y = r.y0; y <= r.y0 + 2; y++) for (let x = r.x0; x <= r.x1; x++) b.obj('zg_stair_flight', x, y, 0, {});
    mount(b, 'zg_level_sign', r.x0 + 2, r.y1, 's', { label: '3' });
    mount(b, 'fire_extinguisher_wall', r.x1, r.y1 - 1, 'e', {});
    b.obj('light_bulb', r.x0 + 3, r.y0 + 5, 0, { circuit: C_HALL });
    b.light(r.x0 + 1.5, 30.5, 'emergency', { intensity: 0.35, radius: 4 });
  }

  // ============================================================ the Lift Lobby (east) and the lift down to Parking P∞
  {
    const r: R = { x0: RX1 + 1, y0: 27, x1: W - 2, y1: 36 };
    b.fillFloor(r.x0, r.y0, r.x1, r.y1, MARBLE);
    b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'drywall');
    b.paper(r.x0, r.y0, r.x1, r.y1, P_LIFT);
    b.addRoom('Lift Lobby', 'lift_lobby', r.x0, r.y0, r.x1, r.y1, { circuit: C_LOBBY, temp: 21 });
    for (let y = 30; y <= 33; y++) b.arch(r.x0, y, 1);
    doors.push({ x: RX1, y: 31, ix: 1, iy: 0, room: [r.x0, r.y0, r.x1, r.y1], kind: 'open' });
    doors.push({ x: RX1, y: 32, ix: 1, iy: 0, room: [r.x0, r.y0, r.x1, r.y1], kind: 'open' });
    // the lifts in the east wall; the middle one runs
    for (const y of [29, 31, 33]) mount(b, 'elevator_door', r.x1, y, 'e', y === 31 ? { portal: 'r_parking_hotel' } : {});
    b.portal({ id: 'r_parking_hotel', x: r.x1, y: 31, kind: 'elevator', to: 'parking', tx: 82, ty: 47, label: 'Take the lift down to the car park' });
    arrive(b, 'p_parking_hotel', r.x1 - 2, 31, 'w', 2);
    for (const y of [30, 32]) mount(b, 'ht_liftpanel', r.x1, y, 'e', {});
    force(c, 'ht_chandelier', r.x0 + 3, r.y0 + 4, 0, {});
    put(c, 'sofa', r.x0 + 2, r.y0, BACK.n, {});
    put(c, 'plant_potted', r.x0, r.y0, 0, {}); put(c, 'plant_potted', r.x0, r.y1, 0, {});
    put(c, 'reception_desk', r.x0 + 2, r.y1, BACK.s, {});
    mount(b, 'ht_keyrack', r.x0 + 3, r.y1, 's', {});
    mount(b, 'painting', r.x0 + 3, r.y0, 'n', { v: 2 });
    force(c, 'ht_brass_cart', r.x1 - 1, r.y0, 0, {});
    f.floorItem('note', r.x0 + 4, r.y1 - 1, { lore: 'ht_porter' });
    b.light(r.x0 + 1.5, r.y1 - 1.5, 'lamp', { circuit: C_LOBBY, intensity: 0.7, radius: 4 });
  }

  // ============================================================ the staff core: the Linen Room (the press), the Laundry, Housekeeping
  {
    const CX0 = IN.x0 + 7, CX1 = IN.x1 - 7, CY0 = IN.y0 + 7, CY1 = IN.y1 - 7;       // 18..69 x 18..45
    const SP0 = 43, SP1 = 45;                                                    // the service spine
    // the passages through the inner rooms from the ring
    for (const [y0, y1] of [[IN.y0, CY0 - 1], [CY1 + 1, IN.y1]] as const) {
      b.fillFloor(SP0, y0, SP1, y1, 'linoleum');
      b.roomWalls(SP0, y0, SP1, y1, 'drywall');
      b.paper(SP0, y0, SP1, y1, P_STAFF);
      b.addRoom('Service Passage', 'service', SP0, y0, SP1, y1, { circuit: C_CORE, temp: 19 });
    }
    b.door(44, IN.y0, 0, 'door_metal', { sign: 'staff' });
    b.door(44, IN.y1 + 1, 0, 'door_metal', { sign: 'staff' });
    doors.push({ x: 44, y: IN.y0 - 1, ix: 0, iy: 1, room: [SP0, IN.y0, SP1, CY0 - 1], kind: 'staff' });
    doors.push({ x: 44, y: IN.y1 + 1, ix: 0, iy: -1, room: [SP0, CY1 + 1, SP1, IN.y1], kind: 'staff' });
    // the spine
    b.fillFloor(SP0, CY0, SP1, CY1, 'linoleum');
    b.roomWalls(SP0, CY0, SP1, CY1, 'drywall');
    b.paper(SP0, CY0, SP1, CY1, P_STAFF);
    b.addRoom('Service Corridor', 'service', SP0, CY0, SP1, CY1, { circuit: C_CORE, temp: 19 });
    b.gap(44, CY0, 0); b.gap(44, CY1 + 1, 0);
    for (let y = CY0 + 2; y <= CY1; y += 5) b.light(44.5, y + 0.5, 'fluoro', { circuit: C_CORE, intensity: 0.6, radius: 5 });
    put(c, 'janitor_cart', SP0, CY0 + 6, 0, {});
    put(c, 'ht_hamper', SP1, CY1 - 4, 0, {});
    // the Linen Room (west of the spine): the press, linen shelves, trolleys waiting to go in
    {
      const r: R = { x0: CX0, y0: CY0, x1: SP0 - 1, y1: CY1 };
      b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'linoleum');
      b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'drywall');
      b.paper(r.x0, r.y0, r.x1, r.y1, P_STAFF);
      b.addRoom('Linen Room', 'linen', r.x0, r.y0, r.x1, r.y1, { circuit: C_CORE, temp: 24, lootMul: 1.3 });
      b.door(SP0, 31, 1, 'door_metal', { open: true, sign: 'staff' });
      for (let x = r.x0 + 1; x <= r.x1 - 2; x += 3) put(c, 'ht_linen_shelf', x, r.y0, BACK.n, {});
      for (let x = r.x0 + 1; x <= r.x1 - 2; x += 3) put(c, 'ht_linen_shelf', x, r.y1, BACK.s, {});
      hopperAt(c, r.x0 + 10, r.y0 + 11, 0);
      for (const [x, y] of [[r.x0 + 3, r.y0 + 6], [r.x0 + 4, r.y0 + 6], [r.x0 + 3, r.y0 + 15], [r.x0 + 17, r.y0 + 7], [r.x0 + 18, r.y0 + 7]] as const) put(c, 'ht_cart', x, y, 0, {});
      force(c, 'ht_brass_cart', r.x0 + 19, r.y0 + 14, 0, {});
      for (const [x, y] of [[r.x0 + 1, r.y0 + 10], [r.x0 + 1, r.y0 + 12], [r.x1, r.y0 + 4]] as const) put(c, 'ht_hamper', x, y, 0, {});
      mount(b, 'noticeboard', r.x0 + 12, r.y0, 'n', { lore: 'ht_linen' });
      for (let x = r.x0 + 3; x <= r.x1; x += 6) for (const y of [r.y0 + 5, r.y0 + 13, r.y0 + 21]) b.light(x + 0.5, y + 0.5, 'fluoro', { circuit: C_CORE, intensity: 0.7, radius: 5.5 });
      f.floorItem('note', r.x0 + 12, r.y0 + 4, { lore: 'ht_linen' });
      for (let i = 0; i < 4; i++) { const x = rng.int(r.x0 + 2, r.x1 - 2), y = rng.int(r.y0 + 3, r.y1 - 3); if (isOpen(z, x, y)) f.floorLoot('ht_floor', x, y); }
    }
    // the Laundry (east of the spine, north)
    {
      const r: R = { x0: SP1 + 1, y0: CY0, x1: CX1, y1: 33 };
      b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'tile_white');
      b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'drywall');
      b.paper(r.x0, r.y0, r.x1, r.y1, P_STAFF);
      b.addRoom('Laundry', 'laundry', r.x0, r.y0, r.x1, r.y1, { circuit: C_CORE, temp: 27 });
      b.door(SP1 + 1, 25, 1, 'door_metal', { open: true, sign: 'staff' });
      for (let x = r.x0 + 2; x <= r.x1 - 1; x += 2) put(c, 'ht_washer', x, r.y0, BACK.n, {});
      for (let x = r.x0 + 2; x <= r.x1 - 1; x += 2) put(c, 'ht_washer', x, r.y1, BACK.s, {});
      for (let k = 0; k < 4; k++) put(c, 'ht_hamper', r.x0 + 4 + k * 4, r.y0 + 7, 0, {});
      for (let x = r.x0 + 3; x <= r.x1; x += 6) b.light(x + 0.5, r.y0 + 7.5, 'fluoro', { circuit: C_CORE, intensity: 0.7, radius: 5.5 });
      for (let i = 0; i < 10; i++) decal(z, 'decal_puddle', rng.float(r.x0 + 1, r.x1), rng.float(r.y0 + 1, r.y1), 1, 1, rng.float(0, 6), undefined, 0.5);
    }
    // Housekeeping (east of the spine, south)
    {
      const r: R = { x0: SP1 + 1, y0: 34, x1: CX1, y1: CY1 };
      b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'linoleum');
      b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'drywall');
      b.paper(r.x0, r.y0, r.x1, r.y1, P_STAFF);
      b.addRoom('Housekeeping', 'housekeeping', r.x0, r.y0, r.x1, r.y1, { circuit: C_CORE, temp: 21, lootMul: 1.2 });
      b.door(SP1 + 1, 39, 1, 'door_metal', { open: true, sign: 'staff' });
      put(c, 'desk_office', r.x0 + 4, r.y0 + 3, 0, {});
      put(c, 'chair_office', r.x0 + 4, r.y0 + 4, 2, {});
      mount(b, 'ht_keyrack', r.x0 + 8, r.y0, 'n', {});
      mount(b, 'ht_keyrack', r.x0 + 9, r.y0, 'n', {});
      for (let x = r.x0 + 12; x <= r.x1 - 1; x += 2) put(c, 'locker', x, r.y0, BACK.n, { loot: 'ht_staff' });
      for (let x = r.x0 + 2; x <= r.x1 - 2; x += 5) put(c, 'janitor_cart', x, r.y1, 0, {});
      put(c, 'ht_ice', r.x1, r.y0 + 5, BACK.e, {});
      for (let x = r.x0 + 3; x <= r.x1; x += 6) b.light(x + 0.5, r.y0 + 5.5, 'fluoro', { circuit: C_CORE, intensity: 0.65, radius: 5 });
      f.floorLoot('ht_floor', r.x0 + 6, r.y0 + 6);
    }
  }

  // ============================================================ the corridor: sconces, paintings, hose cabinets, trolleys, the drag marks
  const armTiles: [number, number, Side][] = [];
  for (let x = RX0; x <= RX1; x++) { armTiles.push([x, RY0, 'n']); armTiles.push([x, RY1, 's']); }
  for (let y = RY0; y <= RY1; y++) { armTiles.push([RX0, y, 'w']); armTiles.push([RX1, y, 'e']); }
  for (let x = RX0 + ARM; x <= RX1 - ARM; x++) { armTiles.push([x, RY0 + ARM - 1, 's']); armTiles.push([x, RY1 - ARM + 1, 'n']); }
  for (let y = RY0 + ARM; y <= RY1 - ARM; y++) { armTiles.push([RX0 + ARM - 1, y, 'e']); armTiles.push([RX1 - ARM + 1, y, 'w']); }
  const hasWall = (x: number, y: number, s: Side) => {
    if (s === 'n') return !!z.wallN[z.idx(x, y)] && !z.edge(x, y, 0);
    if (s === 's') return z.inb(x, y + 1) && !!z.wallN[z.idx(x, y + 1)] && !z.edge(x, y + 1, 0);
    if (s === 'w') return !!z.wallW[z.idx(x, y)] && !z.edge(x, y, 1);
    return z.inb(x + 1, y) && !!z.wallW[z.idx(x + 1, y)] && !z.edge(x + 1, y, 1);
  };
  const wallFree = (x: number, y: number, s: Side) => hasWall(x, y, s) && !z.objectsAt(x, y).some((o) => o.key === 'ht_number' || o.key === 'ht_sconce' || o.key === 'painting' || o.key === 'ht_hose');
  armTiles.forEach(([x, y, s], i) => {
    const k = (s === 'n' || s === 's') ? x : y;
    if (!wallFree(x, y, s)) return;
    if (k % 3 === 0) mount(b, 'ht_sconce', x, y, s, {});
    else if (k % 7 === 2 && hh(x, y, 7420) < 0.6) mount(b, 'painting', x, y, s, { v: (x + y) % 6 });
    else if (k % 19 === 5) mount(b, 'ht_hose', x, y, s, {});
    void i;
  });
  // ceiling lights down the middle of every arm
  for (let x = RX0 + 1; x <= RX1 - 1; x += 5) { b.light(x + 0.5, RY0 + 1.5, 'bulb', { circuit: C_HALL, intensity: 0.55, radius: 4.5, color: 0xffe6c0 }); b.light(x + 0.5, RY1 - 0.5, 'bulb', { circuit: C_HALL, intensity: 0.55, radius: 4.5, color: 0xffe6c0 }); }
  for (let y = RY0 + 6; y <= RY1 - 4; y += 5) { b.light(RX0 + 1.5, y + 0.5, 'bulb', { circuit: C_HALL, intensity: 0.55, radius: 4.5, color: 0xffe6c0 }); b.light(RX1 - 0.5, y + 0.5, 'bulb', { circuit: C_HALL, intensity: 0.55, radius: 4.5, color: 0xffe6c0 }); }
  // trolleys left against the walls, plants in the corners
  for (const [x, y] of [[24, RY0], [61, RY1], [RX0, 41], [RX1, 18], [50, RY0 + 2]] as const) if (isOpen(z, x, y)) put(c, 'ht_cart', x, y, 0, {});
  for (const [x, y] of [[RX0, RY0], [RX1, RY0], [RX0, RY1], [RX1, RY1]] as const) put(c, 'plant_tall', x, y, 0, {});
  // the drag marks: two long scuffs round and round the middle of the ring
  const mid = (a: number, bb: number) => (a + bb + 1) / 2;
  const midN = RY0 + 1.5, midS = RY1 - 0.5, midW = RX0 + 1.5, midE = RX1 - 0.5;
  for (let x = RX0 + 2; x <= RX1 - 2; x++) { if (hh(x, 1, 7430) < 0.8) decal(z, 'ht_drag', x + 0.5, midN, 1.05, 0.5, 0, undefined, 0.55); if (hh(x, 2, 7430) < 0.8) decal(z, 'ht_drag', x + 0.5, midS, 1.05, 0.5, 0, undefined, 0.55); }
  for (let y = RY0 + 2; y <= RY1 - 2; y++) { if (hh(y, 3, 7430) < 0.8) decal(z, 'ht_drag', midW, y + 0.5, 1.05, 0.5, Math.PI / 2, undefined, 0.55); if (hh(y, 4, 7430) < 0.8) decal(z, 'ht_drag', midE, y + 0.5, 1.05, 0.5, Math.PI / 2, undefined, 0.55); }
  void mid;
  for (let i = 0; i < 26; i++) {
    const [x, y] = armTiles[rng.int(0, armTiles.length - 1)];
    decal(z, rng.pick(['ht_spill', 'decal_stain_water', 'decal_footprints']), x + rng.float(0.2, 0.8), y + rng.float(0.2, 0.8), rng.float(0.6, 1.1), rng.float(0.6, 1.1), rng.float(0, 6), undefined, 0.6);
  }
  for (let i = 0; i < 14; i++) { const [x, y] = armTiles[rng.int(0, armTiles.length - 1)]; if (isOpen(z, x, y)) f.floorLoot('ht_floor', x, y); }

  // ============================================================ for the inhabitant
  z.meta.hotel = {
    // the ring's centre line, clockwise on the map (north arm west to east first)
    ring: [[RX0 + 1.5, RY0 + 1.5], [RX1 - 0.5, RY0 + 1.5], [RX1 - 0.5, RY1 - 0.5], [RX0 + 1.5, RY1 - 0.5]],
    arm: ARM, bounds: [RX0, RY0, RX1, RY1],
    doors,
  };
  // nothing spawns on top of the arrivals
  b.flag(1, 27, RX0 + 4, 34, TF.NOSPAWN);
  b.flag(RX1 - 3, 27, W - 2, 36, TF.NOSPAWN);

  // ============================================================ env, power, inhabitants
  for (const cc of [C_HALL, C_ROOMS, C_CORE, C_LOBBY]) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0xe2ceb0, ambientI: 0.64, fog: 0x3a2c20, fogNear: 22, fogFar: 52, void: 0x140e0a, temp: 21,
    sky: false, grade: 'hotel', reverb: 'office', ambience: 'hotel', music: 'muzak',
  };
  z.meta.ceilTex = 'ht_ceil';
  z.spawnTable = [['still_life', 0.6], ['mulcher', 0.5], ['hum_possum', 0.4]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['ht_card', 'ht_porter'];
}

defZone({
  key: 'hotel', name: 'The Halcyon — Third Floor', W, H, depth: 3,
  blurb: 'Patterned carpet, brass sconces, a tray outside every other door. The corridor goes all the way round. So does whatever is ringing the bell.',
  gen: (z, s) => { generateHotel(z, s); },
});
