// St. Aldric (144×120): a 1980s general hospital, fluorescent and long past
// visiting hours. The lot doors (from the parking garage) open into a glass
// vestibule and the main waiting room: rows of chairs facing a NOW SERVING
// display stuck on 0410, a ticket dispenser that only issues 0411. North of it
// the Main Corridor runs the full width of the building, signposted to wards
// that do not exist. Off it, three ward wings of identical patient rooms —
// Ward 7, the Paediatric Ward (its far door is a school door: it opens into
// Meadowbrook's nurse's office) and Ward 9, which never ends: walk to the far
// end and you are halfway down it again. Further east: ICU, two operating
// theatres, radiology, admin and the records room (Hale's files, the lab
// memo), and the service block: generator room, the cold morgue, laundry and
// the basement stairs down to the service tunnels. South: chapel, pharmacy
// (controlled store locked; the key is at the ER nurses' station), cafeteria
// and the ER with its curtained bays.
//
// Shifting: one patient room in Ward 7, the waiting-room seating and
// Theatre 2 rearrange themselves when nobody is looking.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { registerShift } from '../shift';
import { Frame, Dir, Rot, LBACK, LFACE, WBACK, WFACE, ANG, wallAt, signAt, decal, scatter, lootIn, arrive, openTile } from './suburbs_kit';
import { itemAt, stash, sectorPick } from './meridian_kit';

const W = 144, H = 120;
// building interior x 3..140, y 4..116; the Main Corridor rows 56..59
const BX0 = 3, BY0 = 4, BX1 = 140, BY1 = 116, MC = 56;
// ward wings: [name, x0 of the west rooms] — rooms 7 deep, corridor 3 wide, rooms 7 deep
const WARDS: [string, number][] = [['Ward 7', 3], ['Paediatric Ward', 20], ['Ward 9', 37]];
// Ward 9 loops: stepping onto row LOOP_Y puts you LOOP rows further south
const LOOP_Y = 20, LOOP = 24;
// circuits
const C_MAIN = 1, C_W7 = 2, C_PAED = 3, C_W9 = 4, C_ICU = 5, C_THEATRE = 6, C_RAD = 7, C_ADMIN = 8, C_SERVICE = 9, C_WAIT = 10, C_ER = 11, C_PHARM = 12, C_CAF = 13, C_CHAPEL = 14;

interface Ctx { z: Zone; b: ZoneBuilder; f: Furnisher; rng: Rng; seed: number; dead: Set<number> }
const hf = (a: number, b: number, c: number) => hash3(a, b, c) / 4294967296;

// =====================================================================
// the patient room: 6 along the corridor × 7 deep, door on the corridor
// =====================================================================
interface RoomOpts { num: string; circuit: number; outer?: boolean; kids?: boolean; mia?: boolean; variant?: number; stamp?: boolean; beyond?: boolean; seedKey: number; flick?: number; shellOnly?: boolean }

function patientRoom(c: Ctx, x0: number, y0: number, w: number, front: Dir, o: RoomOpts): Frame {
  const { b } = c;
  const F = new Frame(b, x0, y0, w, 7, front);
  if (!o.stamp) {
    F.fill(0, 0, w - 1, 6, 'linoleum_green');
    F.paper(0, 0, w - 1, 6, o.kids ? 'wall_kids' : 'wall_hospital');
    F.walls(0, 0, w - 1, 6, 'drywall');
    if (o.outer) F.wallU(0, w - 1, 6, 'b', 'brick');
    F.room((o.kids ? 'Paediatric Room ' : 'Patient Room ') + o.num, o.kids ? 'paediatric_room' : 'patient_room', 0, 0, w - 1, 6, { circuit: o.circuit });
    F.door(1, 0, 'f', 'door_hospital', {});
    F.mount('zg_house_number', 2, -1, 'b', { label: o.num });
    if (o.outer && w >= 6) F.window(3, 6, 'b', { style: 'window_metal', curtains: 'closed' });
    if (o.beyond) F.flag(0, 0, w - 1, 6, TF.NOSPAWN);
    if (o.shellOnly) return F;
  }
  const rng = new Rng(hash3(c.seed, o.seedKey, 61 + (o.variant ?? 0)));
  const f = new Furnisher(b, rng);
  const P = (key: string, u: number, v: number, lr: number, st: Record<string, any> = {}) => F.put(f, key, u, v, lr, st);
  const v = o.variant ?? 0;
  F.lamp(2, 3, o.circuit, 'light_fluoro', { flicker: o.flick ?? 0, broken: (o.flick ?? 0) > 0.5 });
  if (w < 6) {
    // a half room by the corridor's end: linen and a gurney
    P('shelf_metal', w - 1, 5, LBACK.r, { loot: 'hospital_cabinet' });
    P('gurney', 1, 3, LBACK.b, { v: 1 });
    return F;
  }
  if (v === 0) {
    P('bed_hospital', 1, 5, LBACK.b);
    P('curtain_screen', 3, 5, 0);
    P('bed_hospital', 4, 5, LBACK.b);
    P('iv_stand', 0, 5, 0);
    P('hospital_monitor', 5, 6, LBACK.b, { on: rng.chance(0.5) });
    P('chair_plastic', 2, 3, LFACE.b);
    P(o.kids ? 'toy_box' : 'medical_cabinet', 5, 1, LBACK.r, o.kids ? {} : { loot: 'hospital_cabinet' });
    P('trash_can', 0, 1, 0);
    F.mount('xray_lightbox', 0, 3, 'l', { on: false });
    if (o.kids) { F.mount('zg_wall_drawing', 2, 6, 'b', { v: o.seedKey }); F.mount('zg_wall_drawing', 4, 6, 'b', { v: o.seedKey + 1 }); }
    if (o.mia) {
      // her room: the bed made, the flowers fresh, every drawing the same drawing
      P('teddy_giant', 2, 5, LFACE.f);
      for (let vv = 1; vv <= 4; vv++) F.mount('zg_wall_drawing', 0, vv, 'l', { v: vv });
      for (let u = 3; u <= 5; u++) F.mount('zg_wall_drawing', u, 0, 'f', { v: u + 4 });
      F.mount('photo_frames', 1, 6, 'b', { v: 1 });
    }
  } else if (v === 1) {
    // the beds are gone; one chair faces the window
    P('chair_plastic', 3, 4, LFACE.b);
    P('iv_stand', 3, 6, 0);
  } else if (v === 2) {
    // wheelchairs, all facing the door
    for (const [u, vv] of [[1, 2], [3, 2], [1, 4], [3, 4], [5, 4], [2, 6], [4, 6]] as const) P('wheelchair', u, vv, LFACE.f);
  } else {
    // a school desk, a drawing, the PA speaker
    P('desk_school', 2, 3, LFACE.b);
    const d = c.z.objectsAt(...F.P(2, 3)).find((q) => q.key === 'desk_school');
    if (d) b.obj('zg_crayon_drawing', d.x, d.y, d.rot, { y: 0.745 });
    F.mount('zg_pa_speaker', 3, 6, 'b');
    F.mount('chalkboard', 1, 6, 'b');
  }
  return F;
}

// =====================================================================
// the generator
// =====================================================================
export function generateHospital(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed, dead: new Set() };
  z.name = 'St. Aldric';
  z.meta.anchors = {};
  const lamp = (x: number, y: number, circuit: number, o: Record<string, any> = {}) => { if (z.inb(x, y) && z.floor[z.idx(x, y)]) return b.obj('light_fluoro', x, y, 0, { circuit, ...o }); return null; };
  const emerg = (x: number, y: number) => b.light(x + 0.5, y + 0.5, 'emergency', { circuit: 0, flicker: 0.05 });

  // ------------------------------------------------------------ shell
  b.fillFloor(BX0, BY0, BX1, BY1, 'linoleum_green');
  b.paper(BX0, BY0, BX1, BY1, 'wall_hospital');
  b.roomWalls(BX0, BY0, BX1, BY1, 'brick');

  // ------------------------------------------------------------ the lot doors, vestibule and waiting room (arrival)
  {
    // vestibule
    const vx0 = 64, vx1 = 79, vy0 = 107;
    b.fillFloor(vx0, vy0, vx1, BY1, 'terrazzo');
    b.roomWalls(vx0, vy0, vx1, BY1, 'drywall');
    b.hwall(vx0, vx1, vy0, 'glass');
    for (const x of [70, 71, 72, 73]) b.gap(x, vy0, 0);
    b.addRoom('Entrance', 'lobby', vx0, vy0, vx1, BY1, { circuit: C_WAIT });
    for (const x of [70, 72, 73]) b.door(x, BY1 + 1, 0, 'door_glass', { locked: true });
    b.door(71, BY1 + 1, 0, 'door_glass', { portal: 'p_hospital_lot' });
    b.portal({ id: 'p_hospital_lot', x: 71, y: BY1, kind: 'door', to: 'parking', tx: 63, ty: 151, face: ANG.s, label: 'Go out to the parking lot' });
    arrive(b, 'r_hospital_lot', 71, BY1 - 3, ANG.n, 5);
    for (const x of [66, 68, 75, 77]) b.window(x, BY1 + 1, 0, { style: 'window_metal', curtains: 'none' });
    f.place('zg_ticket_dispenser', 69, 108, 0);
    signAt(b, 69, 108, 'n', 'TAKE A NUMBER', 1.95);
    f.place('wheelchair', 65, 115, WFACE.e); f.place('wheelchair', 66, 115, WFACE.e);
    f.place('plant_tall', 64, 108, 0); f.place('plant_tall', 79, 108, 0);
    f.place('trash_can_outdoor', 78, 115, 0);
    for (const y of [110, 114]) { lamp(67, y, C_WAIT); lamp(76, y, C_WAIT, { flicker: y === 114 ? 0.3 : 0 }); }
    decal(z, 'carpet_rug', 71.5, 112.5, 3, 4, 0, 0x3a4a3a);
    // gift shop and admissions either side
    b.fillFloor(49, vy0, 63, BY1, 'linoleum'); b.roomWalls(49, vy0, 63, BY1, 'drywall');
    b.addRoom('Gift Shop', 'store', 49, vy0, 63, BY1, { circuit: C_WAIT });
    b.door(56, vy0, 0, 'door_glass', {});
    for (let x = 51; x <= 61; x += 3) { f.place('shelf_store', x, 111, 0, { loot: x % 2 ? 'store_toys' : 'store_snacks' }); }
    f.place('checkout_counter', 50, 108, 0); f.place('freezer_display', 63, 113, WBACK.e, { loot: 'store_drinks' });
    f.place('display_table', 53, 114, 0); f.place('teddy_giant', 60, 115, WFACE.n);
    lamp(56, 112, C_WAIT, { flicker: 0.2 });
    b.fillFloor(80, vy0, 94, BY1, 'carpet_office'); b.roomWalls(80, vy0, 94, BY1, 'drywall');
    b.addRoom('Admissions', 'office', 80, vy0, 94, BY1, { circuit: C_WAIT });
    b.door(86, vy0, 0, 'door_office', { sign: 'office' });
    for (const x of [82, 88]) { f.place('desk_office', x, 110, 0); f.onTop('computer', z.objectsAt(x, 110)[0] || null, {}); f.place('chair_office', x, 111, WFACE.n); }
    for (let x = 81; x <= 93; x += 2) f.place('filing_cabinet', x, BY1, WBACK.s);
    wallAt(b, 'noticeboard', 91, vy0, 'n');
    lamp(87, 112, C_WAIT);
    // the waiting room: chairs in rows facing the desk and the display
    const wx0 = 49, wy0 = 60, wx1 = 94, wy1 = 106;
    b.fillFloor(wx0, wy0, wx1, wy1, 'terrazzo');
    b.roomWalls(wx0, wy0, wx1, wy1, 'drywall');
    for (let x = 68; x <= 75; x++) b.gap(x, wy0, 0);
    for (const x of [70, 71, 72, 73]) b.gap(x, wy1 + 1, 0); // through the glass into the vestibule
    b.addRoom('Waiting Room', 'waiting', wx0, wy0, wx1, wy1, { circuit: C_WAIT });
    f.place('nurse_station', 70, 64, 0); f.place('nurse_station', 72, 64, 0);
    f.place('reception_desk', 66, 64, 0); f.place('reception_desk', 75, 64, 0);
    for (const x of [67, 71, 73, 76]) f.place('chair_office', x, 63, WFACE.s);
    const desk = z.objectsAt(66, 64)[0] || null;
    if (desk) f.onTop('computer', desk, {});
    wallAt(b, 'zg_now_serving', 71, wy0 + 1, 'n');
    wallAt(b, 'zg_now_serving', 59, wy0 + 1, 'n');
    signAt(b, 64, wy0 + 1, 'n', 'ADMISSIONS', 2.3);
    signAt(b, 79, wy0 + 1, 'n', 'WAITING AREA', 2.3);
    signAt(b, wx1, 70, 'e', 'EMERGENCY >', 2.2);
    signAt(b, wx0, 91, 'w', 'CAFETERIA', 2.2);
    wallAt(b, 'clock_wall', 67, wy0 + 1, 'n'); wallAt(b, 'zg_pa_speaker', 62, wy0 + 1, 'n'); wallAt(b, 'zg_pa_speaker', 84, wy0 + 1, 'n');
    // the seating rearranges itself (a shift region)
    registerShift(z, 'waiting_seats', 51, 70, 92, 102, 3, (sb, srng, v) => waitingSeats(sb, srng, v, 51, 70, 92, 102));
    // around the edges: vending, a television, plants, the children's corner
    f.place('vending_snack', wx0, 62, WBACK.w); f.place('vending_soda', wx0, 63, WBACK.w); f.place('water_cooler', wx0, 65, WBACK.w);
    f.place('tv_stand', wx1, 66, WBACK.e); f.onTop('tv_crt', z.objectsAt(wx1, 66)[0] || null, { on: true });
    for (const [x, y] of [[49, 104], [94, 104], [49, 68], [94, 62]] as const) f.place('plant_tall', x, y, 0);
    f.place('toy_box', 50, 104, 0); f.place('rocking_horse', 52, 105, 0); f.place('dollhouse', 53, 106, WBACK.s);
    decal(z, 'carpet_rug', 52, 104.5, 4, 3, 0, 0x8ab0d8);
    for (let k = 0; k < 4; k++) wallAt(b, 'zg_wall_drawing', 49, 96 + k, 'w', { v: k });
    for (let y = wy0 + 3; y <= wy1; y += 5) for (let x = wx0 + 3; x <= wx1; x += 6) if (z.flags[z.idx(x, y)] & TF.SHIFT ? false : true) lamp(x, y, C_WAIT, { broken: hf(x, y, 11) < 0.25, flicker: hf(x, y, 12) < 0.15 ? 0.3 : 0 });
    for (let i = 0; i < 6; i++) { const x = rng.int(52, 91), y = rng.int(66, 104); if (!(z.flags[z.idx(x, y)] & TF.SHIFT)) f.floorItem('paper', x, y, {}); }
  }

  // ------------------------------------------------------------ the Main Corridor and its signs
  {
    b.fillFloor(BX0, MC, BX1, MC + 3, 'linoleum');
    b.addRoom('Main Corridor', 'corridor', BX0, MC, BX1, MC + 3, { circuit: C_MAIN });
    b.hwall(BX0, BX1, MC, 'drywall'); b.hwall(BX0, BX1, MC + 4, 'drywall');
    for (let x = 68; x <= 75; x++) b.gap(x, MC + 4, 0); // open onto the waiting room
    const pick = sectorPick(rng, 0.25, 0.3, 14);
    for (let x = BX0 + 2; x <= BX1; x += 4) { const p = pick(x, MC); lamp(x, MC + 1 + ((x >> 2) & 1), C_MAIN, p); if (p.broken && x % 12 === 1) emerg(x, MC + 2); }
    // signs pointing everywhere, including to wards that do not exist
    const signs: [number, 'n' | 's', string][] = [
      [8, 'n', '< WARD 4B'], [24, 's', 'CHAPEL >'], [33, 's', 'PHARMACY'], [41, 'n', 'WARD 9 >'], [46, 'n', '< PAEDIATRICS'],
      [62, 'n', 'RADIOLOGY'], [66, 's', 'WAITING AREA'], [77, 'n', 'SURGERY >'], [86, 'n', 'ICU >'], [92, 'n', 'RECORDS'],
      [98, 's', 'EMERGENCY >'], [103, 'n', 'WARD 13 >'], [110, 'n', 'BASEMENT'], [117, 's', 'MATERNITY >'], [124, 'n', 'MORGUE'],
      [133, 'n', 'LAUNDRY'], [138, 's', 'WARD 11 >'], [5, 's', '< WARD 0'], [52, 's', '< EXIT'], [88, 's', 'EXIT >'],
    ];
    // all on the north wall, which the camera faces
    for (const [x, , label] of signs) signAt(b, x, MC, 'n', label, 2.2);
    for (let x = BX0 + 6; x <= BX1 - 6; x += 14) wallAt(b, 'zg_pa_speaker', x, MC, 'n');
    for (let x = BX0 + 10; x <= BX1 - 6; x += 22) wallAt(b, 'fire_extinguisher_wall', x, MC + 3, 's');
    // the way to Ward 11: a door that opens onto nothing at the corridor's east end
    b.door(BX1 + 1, MC + 1, 1, 'door_hospital', { locked: true });
    for (const x of [16, 58, 100, 128]) f.place('gurney', x, MC + 3, 1, { v: x & 1 });
    f.place('wheelchair', 35, MC, WFACE.e); f.place('wheelchair', 121, MC + 3, WFACE.w);
  }

  // ------------------------------------------------------------ ward wings
  for (const [name, wx0] of WARDS) {
    const paed = name === 'Paediatric Ward', ward9 = name === 'Ward 9';
    const circ = paed ? C_PAED : ward9 ? C_W9 : C_W7;
    const cx0 = wx0 + 7, cx1 = wx0 + 9;
    b.fillFloor(cx0, BY0, cx1, MC - 1, 'linoleum');
    b.addRoom(name, 'ward', cx0, BY0, cx1, MC - 1, { circuit: circ });
    for (let x = cx0; x <= cx1; x++) b.door(x, MC, 0, 'door_hospital', { open: true });
    signAt(b, wx0 + 5, MC, 'n', paed ? 'PAEDIATRICS' : ward9 ? 'WARD 9' : 'WARD 7', 2.25);
    for (let k = 0; k <= 8; k++) {
      // Ward 9's rooms are laid out from the corridor's south end so the stretch either side of
      // its seam is all whole rooms; the odd half room sits at the far (unreachable) north end
      const y0 = ward9 ? (k === 8 ? BY0 : MC - 6 - k * 6) : BY0 + k * 6, rw = k === 8 ? 4 : 6;
      const num = ward9 ? String(1 + (k % 4)) : String(k * 2 + 1);
      const numE = ward9 ? String(5 + (k % 4)) : String(k * 2 + 2);
      const beyond = ward9 && y0 + rw - 1 < LOOP_Y;
      const westMia = paed && k === 0;
      const shiftRoom = name === 'Ward 7' && k === 4;
      const flick = ward9 ? (hf(k % 4, 1, seed & 0xffff) < 0.2 ? 0.3 : 0) : (hf(k, wx0, seed & 0xffff) < 0.15 ? 0.3 : 0);
      if (shiftRoom) {
        patientRoom(c, wx0, y0, rw, 'e', { num, circuit: circ, outer: true, seedKey: 700 + k, shellOnly: true });
        const F = new Frame(b, wx0, y0, rw, 7, 'e');
        const r = F.R(0, 0, rw - 1, 6);
        registerShift(z, 'ward7_room', r[0], r[1], r[2], r[3], 4, (sb, srng, v) => {
          const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng };
          patientRoom(sc, wx0, y0, rw, 'e', { num, circuit: circ, outer: true, seedKey: 700 + k, variant: v, stamp: true });
        });
      } else {
        patientRoom(c, wx0, y0, rw, 'e', { num: westMia ? '14' : num, circuit: circ, outer: wx0 === BX0, kids: paed, mia: westMia, beyond, seedKey: ward9 ? 900 + (k % 4) : wx0 * 10 + k, flick });
      }
      patientRoom(c, cx1 + 1, y0, rw, 'w', { num: numE, circuit: circ, kids: paed, beyond, seedKey: ward9 ? 950 + (k % 4) : wx0 * 10 + k + 5, flick: ward9 ? flick : 0 });
    }
    // corridor dressing: periodic with the rooms (Ward 9 has to match across its seam)
    for (let y = BY0; y <= MC - 1; y++) {
      const p = ward9 ? (((y - MC) % 6) + 6) % 6 : (y - BY0) % 6;
      if (p === 3) lamp(cx0 + 1, y, circ, { broken: ward9 ? false : hf(y, wx0, 5) < 0.2, flicker: ward9 ? 0 : hf(y, wx0, 6) < 0.2 ? 0.3 : 0 });
      if (p === 0 && y > BY0) wallAt(b, 'zg_pa_speaker', cx0, y, 'w');
      if (p === 4) f.place(paed ? 'toy_box' : 'chair_plastic', cx1, y, WFACE.w);
      if (p === 1 && (y - BY0) % 12 === 1) f.place('iv_stand', cx0, y, 0);
      if (p === 5) { const h = hf(ward9 ? (y - BY0) % LOOP : y, wx0, 9); if (h < 0.5) decal(z, h < 0.25 ? 'decal_stain_water' : 'decal_footprints', cx0 + 1.5, y + 0.5, 1.2, 1, h * 30, undefined, 0.7); }
      void p;
    }
    if (paed) {
      // the far door is a school door, and it opens into Meadowbrook's nurse's office
      b.door(cx0 + 1, BY0, 0, 'door_school', { portal: 'r_school_nurse' });
      b.portal({ id: 'r_school_nurse', x: cx0 + 1, y: BY0, kind: 'door', to: 'school', tx: 76, ty: 89, face: ANG.n, label: 'Go through the door' });
      arrive(b, 'p_school_nurse', cx0 + 1, BY0 + 2, ANG.s, 4);
      wallAt(b, 'zg_wall_drawing', cx0, BY0, 'n', { v: 1 }); wallAt(b, 'zg_wall_drawing', cx1, BY0, 'n', { v: 2 });
      f.floorItem('note', cx0 + 2, BY0 + 1, { lore: 'patient_file_hale' });
      for (let y = BY0 + 2; y <= MC - 2; y += 3) wallAt(b, 'zg_wall_drawing', cx1, y, 'e', { v: y });
    }
    if (ward9) {
      // walk north far enough and you are back halfway down
      for (let x = cx0; x <= cx1; x++) b.portal({ id: 'loop_w9_' + x, x, y: LOOP_Y, kind: 'loop', to: 'hospital', tx: x, ty: LOOP_Y + LOOP, loopDy: LOOP, hidden: true });
      b.flag(wx0, BY0, cx1 + 7, LOOP_Y, TF.NOSPAWN);
    }
    if (name === 'Ward 7') {
      // the nurse's station at the bottom of Ward 7 is dark: emergency lights only
      c.dead.add(C_W7);
      for (let y = BY0 + 5; y <= MC - 2; y += 12) emerg(cx0 + 1, y);
    }
  }

  // ------------------------------------------------------------ ICU (x 54..78, y 4..27)
  {
    const x0 = 54, y0 = BY0, x1 = 78, y1 = 27;
    b.fillFloor(x0, y0, x1, y1, 'lab'); b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Intensive Care', 'icu', x0, y0, x1, y1, { circuit: C_ICU });
    b.door(x1 + 1, 15, 1, 'door_hospital', {}); b.door(x1 + 1, 16, 1, 'door_hospital', {});
    signAt(b, x1 + 1, 14, 'w', 'ICU', 2.2);
    for (let k = 0; k < 8; k++) {
      const x = x0 + 1 + k * 3;
      f.place('bed_hospital', x, y0, 0); f.place('hospital_monitor', x + 1, y0, 0, { on: k % 3 !== 0 }); f.place('iv_stand', x + 1, y0 + 1, 0);
      if (k < 7) f.place('curtain_screen', x + 2, y0 + 1, 0);
      f.place('bed_hospital', x, y1 - 1, 2); f.place('hospital_monitor', x + 1, y1, 2, { on: k % 2 === 0 });
      if (k < 7) f.place('curtain_screen', x + 2, y1 - 1, 0);
    }
    f.place('nurse_station', 64, 15, 0); f.place('nurse_station', 66, 15, 0);
    f.place('chair_office', 65, 16, WFACE.n); f.place('medical_cabinet', x0, 14, WBACK.w, { loot: 'hospital_cabinet' }); f.place('medical_cabinet', x0, 15, WBACK.w, { loot: 'hospital_pharmacy' });
    for (let y = y0 + 3; y <= y1; y += 6) for (let x = x0 + 3; x <= x1; x += 6) lamp(x, y, C_ICU, { broken: hf(x, y, 21) < 0.3 });
    lootIn(f, rng, 'hospital_cabinet', x0, y0, x1, y1, 2);
  }

  // ------------------------------------------------------------ surgery corridor, theatres, scrub, sterile store
  {
    const cx0 = 79, cx1 = 81;
    b.fillFloor(cx0, BY0, cx1, MC - 1, 'linoleum');
    b.vwall(cx0, BY0, MC - 1, 'drywall'); b.vwall(cx1 + 1, BY0, MC - 1, 'drywall');
    b.addRoom('Surgery Corridor', 'corridor', cx0, BY0, cx1, MC - 1, { circuit: C_THEATRE });
    for (let x = cx0; x <= cx1; x++) b.door(x, MC, 0, 'door_hospital', { open: x === 80 });
    for (let y = BY0 + 2; y <= MC - 2; y += 5) lamp(80, y, C_THEATRE, { flicker: hf(y, 3, 7) < 0.3 ? 0.3 : 0 });
    signAt(b, cx1 + 1, 30, 'e', '< THEATRES', 2.2);
    // Theatre 1
    for (const [tx0, tx1, name, shift] of [[82, 93, 'Theatre 1', false], [94, 105, 'Theatre 2', true]] as [number, number, string, boolean][]) {
      b.fillFloor(tx0, BY0, tx1, 14, 'tile_white'); b.paper(tx0, BY0, tx1, 14, 'wall_lab');
      b.roomWalls(tx0, BY0, tx1, 14, 'drywall');
      b.addRoom(name, 'theatre', tx0, BY0, tx1, 14, { circuit: C_THEATRE, temp: 17 });
      b.door(tx0 + 5, 15, 0, 'door_hospital', {}); b.door(tx0 + 6, 15, 0, 'door_hospital', {});
      signAt(b, tx0 + 4, 15, 's', name === 'Theatre 1' ? 'THEATRE 1' : 'THEATRE 2', 2.25);
      if (shift) registerShift(z, 'theatre_2', tx0, BY0, tx1, 14, 3, (sb, srng, v) => theatre(sb, srng, v, tx0, BY0, tx1, 14));
      else theatre(b, rng, 0, tx0, BY0, tx1, 14);
    }
    // scrub room
    b.fillFloor(82, 15, 105, 20, 'tile_white'); b.roomWalls(82, 15, 105, 20, 'drywall');
    b.addRoom('Scrub Room', 'scrub', 82, 15, 105, 20, { circuit: C_THEATRE });
    b.door(82, 17, 1, 'door_hospital', {});
    for (let x = 84; x <= 103; x += 2) if (x !== 87 && x !== 88 && x !== 99 && x !== 100) f.place('counter_sink', x, 20, WBACK.s);
    f.place('shelf_metal', 105, 16, WBACK.e, { loot: 'hospital_cabinet' }); f.place('shelf_metal', 105, 17, WBACK.e, { loot: 'hospital_cabinet' });
    for (const x of [86, 94, 102]) lamp(x, 17, C_THEATRE);
    // sterile store
    b.fillFloor(82, 21, 105, 27, 'linoleum'); b.roomWalls(82, 21, 105, 27, 'drywall');
    b.addRoom('Sterile Supply', 'storage', 82, 21, 105, 27, { circuit: C_THEATRE });
    b.door(82, 24, 1, 'door_hospital', { sign: 'staff' });
    for (let x = 84; x <= 104; x += 2) { f.place('shelf_metal', x, 21, 0, { loot: 'hospital_cabinet' }); f.place('shelf_metal', x, 27, WBACK.s, { loot: x % 4 ? 'hospital_cabinet' : 'hospital_pharmacy' }); }
    for (const x of [86, 98]) lamp(x, 24, C_THEATRE, { flicker: 0.2 });
  }

  // ------------------------------------------------------------ radiology (x 54..78, y 28..55)
  {
    const x0 = 54, y0 = 28, x1 = 78, y1 = MC - 1;
    b.fillFloor(x0, y0, x1, y1, 'linoleum'); b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Radiology', 'radiology', x0, y0, x1, y1, { circuit: C_RAD });
    b.door(62, MC, 0, 'door_hospital', {}); b.door(x1 + 1, 40, 1, 'door_hospital', {});
    // waiting bench along the corridor side, three x-ray rooms behind lead-lined walls
    for (const x of [56, 60, 66, 70]) f.place('waiting_chairs', x, y1, WBACK.s);
    for (let k = 0; k < 3; k++) {
      const rx0 = x0 + k * 8, rx1 = rx0 + 7;
      b.roomWalls(rx0, y0, rx1, y0 + 12, 'concrete');
      b.addRoom('X-Ray ' + (k + 1), 'xray', rx0, y0, rx1, y0 + 12, { circuit: C_RAD });
      b.door(rx0 + 4, y0 + 13, 0, 'door_metal', { sign: 'danger' });
      f.place('operating_table', rx0 + 3, y0 + 4, 0);
      f.place('surgical_light', rx0 + 4, y0 + 3, 0, { on: false });
      f.place('transformer', rx0 + 5, y0, 0);
      const xd = f.place('desk_office', rx0 + 1, y0 + 10, 0); if (xd) f.onTop('computer', xd, {});
      for (let u = 1; u <= 3; u++) wallAt(b, 'xray_lightbox', rx0 + u, y0, 'n', { on: u === 2 });
      lamp(rx0 + 4, y0 + 7, C_RAD, { broken: k === 1 });
      signAt(b, rx0 + 2, y0 + 13, 's', 'X-RAY', 2.1);
    }
    for (let x = x0 + 2; x <= x1; x += 6) lamp(x, 48, C_RAD, { flicker: x === 62 ? 0.3 : 0 });
    f.place('desk_office', 70, 45, 0); f.place('chair_office', 70, 46, WFACE.n);
    f.place('filing_cabinet', 76, 43, 0); f.place('filing_cabinet', 77, 43, 0);
  }

  // ------------------------------------------------------------ admin offices + the records room (x 82..105, y 28..55)
  {
    // admin
    for (const [ax0, ax1, name] of [[82, 93, "Director's Office"], [94, 105, 'Administration']] as [number, number, string][]) {
      b.fillFloor(ax0, 28, ax1, 37, 'carpet_office'); b.paper(ax0, 28, ax1, 37, 'wall_office');
      b.roomWalls(ax0, 28, ax1, 37, 'drywall');
      b.addRoom(name, 'office', ax0, 28, ax1, 37, { circuit: C_ADMIN });
      const dk = f.place('desk_office', ax0 + 4, 31, 0);
      if (dk) f.onTop('computer', dk, {});
      f.place('chair_office', ax0 + 4, 32, WFACE.n);
      f.place('filing_cabinet', ax1, 28, 0); f.place('filing_cabinet', ax1 - 1, 28, 0); f.place('bookshelf', ax0, 28, 0);
      f.place('plant_potted', ax1, 37, 0);
      wallAt(b, 'painting', ax0 + 6, 28, 'n', { v: 3 });
      lamp(ax0 + 5, 33, C_ADMIN);
    }
    b.door(82, 32, 1, 'door_office', { sign: 'office' });
    b.door(94, 34, 1, 'door_office', {});
    // records
    const x0 = 82, y0 = 38, x1 = 105, y1 = MC - 1;
    b.fillFloor(x0, y0, x1, y1, 'linoleum'); b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Medical Records', 'records', x0, y0, x1, y1, { circuit: C_ADMIN, temp: 18 });
    b.door(93, MC, 0, 'door_office', { sign: 'staff' }); b.door(82, 46, 1, 'door_office', {});
    signAt(b, 94, MC, 'n', 'RECORDS', 2.25);
    for (let y = 40; y <= 52; y += 3) for (let x = 85; x <= 104; x++) if (x !== 90 && x !== 91 && x !== 98) f.place('filing_cabinet', x, y, y % 2 ? WFACE.s : WFACE.n);
    const rd = f.place('desk_office', 83, 53, 0);
    f.place('chair_office', 83, 54, WFACE.n);
    if (rd) {
      f.onTop('lamp_table', rd, { circuit: C_ADMIN });
      itemAt(z, rng, 'note', 83, 53, 0.77, { lore: 'memo_lab_access' }, 0.1);
      itemAt(z, rng, 'note', 84, 53, 0.77, { lore: 'patient_file_0411' }, 0.1);
    }
    f.floorItem('note', 90, 47, { lore: 'patient_file_hale' });
    f.place('cardboard_box', 104, 54, 0); f.place('cardboard_stack', 105, 55, 0);
    for (let y = 39; y <= 54; y += 5) for (const x of [87, 95, 102]) lamp(x, y, C_ADMIN, { flicker: hf(x, y, 31) < 0.3 ? 0.25 : 0, broken: hf(x, y, 32) < 0.2 });
    for (let i = 0; i < 10; i++) f.floorItem('paper', rng.int(84, 104), rng.int(39, 54));
  }

  // ------------------------------------------------------------ service block: generator, morgue, basement stairs, laundry
  {
    // generator room
    const gx0 = 106, gx1 = BX1;
    b.fillFloor(gx0, BY0, gx1, 20, 'concrete'); b.paper(gx0, BY0, gx1, 20, 'wall_cinder');
    b.roomWalls(gx0, BY0, gx1, 20, 'cinder');
    b.addRoom('Generator Room', 'generator', gx0, BY0, gx1, 20, { circuit: C_SERVICE, temp: 24 });
    b.door(124, 21, 0, 'door_metal', { sign: 'danger' });
    signAt(b, 123, 21, 's', 'GENERATOR', 2.2);
    for (const x of [110, 118, 126]) { f.place('boiler', x, 6, 0); }
    for (let x = 109; x <= 135; x += 3) f.place('generator', x, 12, 0);
    f.place('transformer', 133, 6, 0); f.place('transformer', 136, 6, 0);
    for (let y = 9; y <= 18; y++) if (y !== 13) f.place('electrical_cabinet', gx1, y, WBACK.e);
    wallAt(b, 'breaker_panel', 112, BY0, 'n', { circuits: [C_W7, C_W9, C_ICU, C_RAD] });
    wallAt(b, 'breaker_panel', 115, BY0, 'n', { circuits: [C_MAIN, C_WAIT, C_ER, C_THEATRE] });
    wallAt(b, 'fuse_panel_big', 130, BY0, 'n');
    for (const x of [107, 131]) wallAt(b, 'pipes_cluster', x, BY0, 'n');
    f.place('barrel_oil', 107, 18, 0); f.place('barrel_oil', 108, 18, 0); f.place('tool_chest', 107, 15, WBACK.w);
    for (let x = 110; x <= 136; x += 8) b.obj('light_bulb', x, 16, 0, { circuit: C_SERVICE, flicker: 0.15 });
    f.floorItem('fuse', 120, 17); f.floorItem('gas_can', 109, 17);
    lootIn(f, rng, 'maintenance', gx0, BY0, gx1, 20, 2);
    // morgue: cold
    const my0 = 21, my1 = 40;
    b.fillFloor(gx0, my0, gx1, my1, 'tile_white'); b.paper(gx0, my0, gx1, my1, 'wall_lab');
    b.roomWalls(gx0, my0, gx1, my1, 'concrete');
    b.addRoom('Morgue', 'morgue', gx0, my0, gx1, my1, { circuit: C_SERVICE, temp: 4 });
    b.door(124, my0, 0, 'door_metal', { sign: 'danger' });
    for (let x = 108; x <= 136; x += 2) if (x !== 124) f.place('morgue_drawers', x, my0, 0);
    for (let y = 24; y <= 36; y += 2) f.place('morgue_drawers', gx1, y, WBACK.e);
    for (const x of [112, 120, 128]) { f.place('operating_table', x, 29, 0); f.place('surgical_light', x + 1, 28, 0, { on: x === 120 }); }
    f.place('gurney', 110, 35, 0, { v: 0 }); f.place('gurney', 116, 35, 0, { v: 1 }); f.place('gurney', 124, 36, 0, { v: 0 });
    f.place('counter_sink', gx0, 25, WBACK.w); f.place('counter_sink', gx0, 26, WBACK.w);
    f.place('medical_cabinet', gx0, 30, WBACK.w, { loot: 'morgue' }); f.place('medical_cabinet', gx0, 31, WBACK.w, { loot: 'morgue' });
    for (const x of [111, 121, 131]) lamp(x, 32, C_SERVICE, { flicker: x === 131 ? 0.4 : 0, broken: x === 111 });
    f.place('skeleton', 133, 38, 0);
    f.floorItem('id_badge', 132, 38); f.floorItem('note', 134, 38, { lore: 'note_generic' });
    for (let i = 0; i < 5; i++) f.decal('decal_stain_dark', rng.int(108, 138), rng.int(24, 39), 1.2, 1.2);
    // basement stairs (x 106..121, y 41..55)
    const sx0 = 106, sy0 = 41, sx1 = 121, sy1 = MC - 1;
    b.fillFloor(sx0, sy0, sx1, sy1, 'concrete'); b.paper(sx0, sy0, sx1, sy1, 'wall_cinder');
    b.roomWalls(sx0, sy0, sx1, sy1, 'cinder');
    b.addRoom('Basement Stairs', 'stairs', sx0, sy0, sx1, sy1, { circuit: C_SERVICE, temp: 14 });
    b.door(113, MC, 0, 'door_metal', { sign: 'stairs' }); b.door(113, sy0, 0, 'door_metal', {});
    signAt(b, 112, MC, 'n', 'BASEMENT', 2.25);
    const st = f.place('staircase_down', 117, 44, 0, { portal: 'p_hospital_basement' }) || b.obj('staircase_down', 117, 44, 0, { portal: 'p_hospital_basement' });
    void st;
    b.portal({ id: 'p_hospital_basement', x: 117, y: 44, kind: 'stairs_down', to: 'tunnels', tx: 81, ty: 12, label: 'Take the stairs down' });
    arrive(b, 'r_hospital_basement', 117, 48, ANG.s, 4);
    wallAt(b, 'zg_level_sign', 118, sy0, 'n', { label: '0' });
    f.place('gurney', 108, 47, 0, { v: 1 }); f.place('janitor_cart', 107, 53, 0); f.place('mop_bucket', 108, 54, 0);
    f.place('shelf_metal', 121, 52, WBACK.e, { loot: 'janitor' }); f.place('shelf_metal', 121, 53, WBACK.e, { loot: 'maintenance' });
    b.obj('light_bulb', 113, 47, 0, { circuit: C_SERVICE, flicker: 0.25 });
    emerg(117, 46);
    // laundry (x 122..140, y 41..55)
    b.fillFloor(122, sy0, BX1, sy1, 'concrete'); b.roomWalls(122, sy0, BX1, sy1, 'cinder');
    b.addRoom('Laundry', 'laundry', 122, sy0, BX1, sy1, { circuit: C_SERVICE, temp: 23 });
    b.door(131, MC, 0, 'door_metal', { sign: 'staff' }); b.door(131, sy0, 0, 'door_metal', {});
    for (let x = 123; x <= 139; x += 2) f.place('water_heater', x, sy0, 0);
    for (let x = 124; x <= 138; x += 3) f.place('laundry_basket', x, 47, 0, { loot: 'wardrobe' });
    for (let x = 123; x <= 139; x += 4) f.place('clothes_pile', x, 51, 0, { loot: 'wardrobe' });
    f.place('shelf_metal', BX1, 53, WBACK.e, { loot: 'hospital_cabinet' }); f.place('shelf_metal', BX1, 54, WBACK.e, { loot: 'janitor' });
    for (const x of [126, 135]) b.obj('light_fluoro', x, 49, 0, { circuit: C_SERVICE, flicker: 0.2 });
  }

  // ------------------------------------------------------------ chapel (x 3..22, y 60..80)
  {
    const x0 = BX0, y0 = 60, x1 = 22, y1 = 80;
    b.fillFloor(x0, y0, x1, y1, 'carpet_red'); b.paper(x0, y0, x1, y1, 'wall_paneling');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Chapel', 'chapel', x0, y0, x1, y1, { circuit: C_CHAPEL });
    b.door(12, y0, 0, 'door_wood', {}); b.door(13, y0, 0, 'door_wood', {});
    for (let y = 64; y <= 76; y += 2) { f.place('bench', 6, y, WFACE.s); f.place('bench', 9, y, WFACE.s); f.place('bench', 15, y, WFACE.s); f.place('bench', 18, y, WFACE.s); }
    f.place('table_dining', 12, y1 - 1, 0);
    for (const x of [12, 13]) f.floorItem('candle', x, y1 - 1);
    f.place('plant_tall', 10, y1, 0); f.place('plant_tall', 15, y1, 0);
    f.place('shrine', 12, y1, 0);
    for (let k = 0; k < 6; k++) wallAt(b, 'photo_frames', BX0, 63 + k * 3, 'w', { v: k, blank: k === 3 });
    for (const [x, y] of [[8, 66], [17, 66], [8, 74], [17, 74]] as const) b.obj('light_bulb', x, y, 0, { circuit: C_CHAPEL, flicker: 0.1 });
    decal(z, 'carpet_rug', 12.5, 70, 3, 18, 0, 0x8a2020, 0.8);
  }

  // ------------------------------------------------------------ pharmacy (x 23..48, y 60..80)
  {
    const x0 = 23, y0 = 60, x1 = 48, y1 = 80;
    b.fillFloor(x0, y0, x1, y1, 'tile_white'); b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Pharmacy', 'pharmacy', x0, y0, x1, y1, { circuit: C_PHARM });
    // a counter window onto the corridor, the staff door beside it
    for (let x = 30; x <= 35; x++) { b.window(x, y0, 0, { style: 'window_metal', curtains: 'none', glass: x === 33 ? 'broken' : 'intact' }); f.place('counter_kitchen', x, y0, 0, { loot: 'hospital_pharmacy' }); }
    b.door(40, y0, 0, 'door_metal', { sign: 'staff' });
    f.onTop('cash_register', z.objectsAt(31, y0)[0] || null, {});
    itemAt(z, rng, 'note', 34, y0, 0.93, { lore: 'pharmacy_note' }, 0.1);
    signAt(b, 32, MC + 3, 's', 'PHARMACY', 2.25);
    for (let y = 64; y <= 72; y += 4) for (let x = 25; x <= 46; x++) if (x !== 36 && x !== 37) f.place('pharmacy_shelf', x, y, y % 8 ? WFACE.s : WFACE.n);
    f.place('desk_office', 43, 61, 0); f.place('chair_office', 43, 62, WFACE.n);
    // the controlled store: locked; the key is at the ER nurses' station
    b.hwall(x0, x1, 75, 'concrete');
    b.door(36, 75, 0, 'door_metal', { locked: true, keyId: 'aldric_pharmacy', sign: 'danger' });
    b.addRoom('Controlled Substances', 'pharmacy_store', x0, 75, x1, y1, { circuit: C_PHARM, temp: 16 });
    for (let x = 24; x <= 47; x += 2) if (x !== 36) f.place('medical_cabinet', x, y1, WBACK.s, { loot: 'hospital_pharmacy' });
    for (let x = 25; x <= 46; x += 3) if (x < 34 || x > 38) f.place('pharmacy_shelf', x, 77, 0, { loot: 'hospital_pharmacy' });
    for (let y = 62; y <= 72; y += 5) for (const x of [28, 36, 44]) lamp(x, y, C_PHARM, { broken: hf(x, y, 41) < 0.3 });
    lamp(36, 78, C_PHARM, { flicker: 0.3 });
    for (let i = 0; i < 6; i++) f.floorItem(rng.pick(['painkillers', 'bandage', 'alcohol_wipes', 'syringe', 'vitamins']), rng.int(24, 47), rng.int(61, 73));
  }

  // ------------------------------------------------------------ cafeteria (x 3..48, y 81..116)
  {
    const x0 = BX0, y0 = 81, x1 = 48, y1 = BY1;
    b.fillFloor(x0, y0, x1, y1, 'checker'); b.paper(x0, y0, x1, y1, 'wall_kitchen');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Cafeteria', 'cafeteria', 15, y0, x1, y1, { circuit: C_CAF });
    b.door(x1 + 1, 92, 1, 'door_glass', {}); b.door(x1 + 1, 93, 1, 'door_glass', {});
    // kitchen behind the serving line
    b.fillFloor(x0, y0, 14, y1, 'tile_kitchen');
    b.vwall(15, y0, y1, 'drywall'); b.door(15, 110, 1, 'door_office', { sign: 'staff' });
    b.addRoom('Kitchen', 'kitchen', x0, y0, 14, y1, { circuit: C_CAF });
    for (let y = 84; y <= 98; y += 3) f.place('food_court_counter', 15, y, WFACE.e);
    for (let x = 4; x <= 13; x++) f.place(x % 3 === 0 ? 'counter_sink' : 'stove', x, y0, 0);
    for (let y = 84; y <= 99; y++) f.place('counter_kitchen', 14, y, WBACK.e, { loot: 'cafeteria' });
    f.place('fridge', BX0, 90, WBACK.w, { loot: 'cafeteria' }); f.place('fridge', BX0, 91, WBACK.w, { loot: 'fridge_office' }); f.place('freezer_chest', BX0, 95, WBACK.w, { loot: 'freezer' });
    for (let y = 102; y <= 115; y += 2) f.place('shelf_metal', BX0, y, WBACK.w, { loot: 'cafeteria' });
    for (const y of [86, 96, 108]) lamp(9, y, C_CAF);
    // tables
    for (let y = 85; y <= 112; y += 4) for (let x = 20; x <= 44; x += 5) {
      if (!f.place('table_round', x, y, 0)) continue;
      f.place('chair_plastic', x - 1, y, WFACE.e); f.place('chair_plastic', x + 1, y, WFACE.w);
      if (hf(x, y, 51) < 0.5) f.place('chair_plastic', x, y + 1, WFACE.n);
    }
    f.place('vending_snack', x1, y1, WBACK.e); f.place('vending_soda', x1, y1 - 1, WBACK.e);
    for (const y of [84, 100]) f.place('trash_can', x1, y, 0);
    wallAt(b, 'clock_wall', 30, y0, 'n'); wallAt(b, 'zg_pa_speaker', 24, y0, 'n');
    for (let y = 84; y <= 114; y += 5) for (let x = 19; x <= 46; x += 7) lamp(x, y, C_CAF, { broken: hf(x, y, 61) < 0.35, flicker: hf(x, y, 62) < 0.15 ? 0.3 : 0 });
    lootIn(f, rng, 'cafeteria', 16, y0, x1, y1, 4);
    for (let i = 0; i < 10; i++) f.decal(rng.pick(['decal_trash', 'decal_stain_dark', 'decal_stain_water']), rng.int(16, 47), rng.int(82, 115), rng.float(0.6, 1.3), rng.float(0.6, 1.3));
  }

  // ------------------------------------------------------------ the ER (x 95..140, y 60..116)
  {
    const x0 = 95, y0 = 60, x1 = BX1, y1 = BY1;
    b.fillFloor(x0, y0, x1, y1, 'linoleum_green'); b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom('Emergency', 'er', x0, y0, x1, y1, { circuit: C_ER });
    b.door(100, y0, 0, 'door_hospital', { open: true }); b.door(101, y0, 0, 'door_hospital', {});
    b.door(x0, 70, 1, 'door_hospital', {}); b.door(x0, 71, 1, 'door_hospital', { open: true });
    signAt(b, 102, y0, 'n', 'EMERGENCY', 2.3);
    // the ambulance doors: chained shut
    for (const y of [86, 87]) b.door(x1 + 1, y, 1, 'door_metal', { locked: true, barricade: 5 });
    signAt(b, x1, 85, 'e', 'NO ENTRY', 2.2);
    // curtained bays along the east wall and down the middle
    for (let k = 0; k < 6; k++) {
      const y = 62 + k * 4;
      f.place('bed_hospital', x1 - 1, y, 1);
      f.place('curtain_screen', x1 - 1, y + 2, 0); f.place('curtain_screen', x1, y + 2, 0);
      f.place('hospital_monitor', x1, y + 1, WBACK.e, { on: k % 2 === 0 });
      f.place('iv_stand', x1 - 2, y + 1, 0);
    }
    for (let k = 0; k < 5; k++) {
      const x = 104 + k * 5;
      f.place('gurney', x, 66, 0, { v: k % 2 }); f.place('curtain_screen', x + 2, 66, 0); f.place('curtain_screen', x + 2, 67, 0);
    }
    // the nurses' station; the pharmacy key is in its drawer
    const ns1 = f.place('nurse_station', 114, 80, 0), ns2 = f.place('nurse_station', 116, 80, 0);
    void ns2;
    f.place('chair_office', 115, 79, WFACE.s); f.place('chair_office', 117, 79, WFACE.s);
    stash(ns1, rng, 'key_generic', { keyId: 'aldric_pharmacy' });
    if (ns1) f.onTop('computer', ns1, {});
    f.place('medical_cabinet', 112, 82, 0, { loot: 'hospital_cabinet' }); f.place('medical_cabinet', 119, 82, 0, { loot: 'hospital_cabinet' });
    wallAt(b, 'zg_now_serving', 108, y0, 'n');
    wallAt(b, 'clock_wall', 115, y0, 'n'); wallAt(b, 'zg_pa_speaker', 120, y0, 'n');
    // trauma rooms
    for (const [tx0, tx1] of [[x0, 104], [105, 114]] as [number, number][]) {
      b.roomWalls(tx0, 96, tx1, y1, 'drywall');
      b.addRoom('Trauma Room', 'trauma', tx0, 96, tx1, y1, { circuit: C_ER });
      b.door(tx0 + 5, 96, 0, 'door_hospital', {});
      f.place('operating_table', tx0 + 4, 104, 0); f.place('surgical_light', tx0 + 5, 103, 0, { on: tx0 === x0 });
      f.place('hospital_monitor', tx0 + 6, 104, 0, { on: true }); f.place('iv_stand', tx0 + 3, 104, 0);
      f.place('medical_cabinet', tx1, 98, WBACK.e, { loot: 'hospital_cabinet' }); f.place('shelf_metal', tx0, y1, WBACK.w, { loot: 'hospital_cabinet' });
      lamp(tx0 + 5, 100, C_ER); lamp(tx0 + 5, 110, C_ER, { broken: true });
      for (let i = 0; i < 3; i++) f.decal('decal_blood_pool', tx0 + rng.int(2, 8), rng.int(102, 108), 1.2, 1.2);
    }
    // ER waiting
    b.addRoom('ER Waiting', 'waiting', 115, 96, x1, y1, { circuit: C_ER });
    b.hwall(115, x1, 96, 'drywall'); b.door(127, 96, 0, 'door_hospital', { open: true });
    for (let y = 100; y <= 112; y += 3) { f.place('waiting_chairs', 118, y, 0); f.place('waiting_chairs', 124, y, 0); f.place('waiting_chairs', 130, y, 0); }
    f.place('zg_ticket_dispenser', 136, 99, 0); wallAt(b, 'zg_now_serving', 128, 97, 'n');
    f.place('vending_soda', x1, 110, WBACK.e); f.place('plant_tall', x1, 115, 0);
    for (let y = 63; y <= 114; y += 5) for (let x = x0 + 3; x <= x1; x += 6) {
      if (y > 95 && x < 115) continue;
      lamp(x, y, C_ER, { broken: hf(x, y, 71) < 0.3, flicker: hf(x, y, 72) < 0.2 ? 0.3 : 0 });
    }
    lootIn(f, rng, 'hospital_cabinet', x0, y0, x1, 94, 3);
    for (let i = 0; i < 14; i++) f.decal(rng.pick(['decal_blood_drip', 'decal_footprints', 'decal_stain_dark', 'decal_stain_water']), rng.int(96, 139), rng.int(61, 115), rng.float(0.7, 1.4), rng.float(0.7, 1.4));
  }

  // ------------------------------------------------------------ the outer walls are brick wherever a room redrew them
  b.hwall(BX0, BX1, BY0, 'brick'); b.hwall(BX0, BX1, BY1 + 1, 'brick'); b.vwall(BX0, BY0, BY1, 'brick'); b.vwall(BX1 + 1, BY0, BY1, 'brick');

  // ------------------------------------------------------------ dirt, clutter, floor loot
  {
    // nothing random in Ward 9: both sides of its seam have to look the same
    const ok = (x: number, y: number) => !(z.flags[z.idx(x, y)] & (TF.SHIFT | TF.NOSPAWN)) && !(x >= 37 && x <= 53 && y < MC);
    scatter(f, rng, BX0, BY0, BX1, BY1, 420, [['decal_stain_water', 4], ['decal_stain_dark', 3], ['decal_footprints', 2], ['decal_mold', 1], ['decal_crack', 1], ['decal_trash', 1]], 0.7, 1.5, ok);
    lootIn(f, rng, 'floor_generic', BX0, BY0, BX1, BY1, 26, ok);
    lootIn(f, rng, 'meds_common', BX0, BY0, BX1, BY1, 14, ok);
    lootIn(f, rng, 'lore_bits', BX0, BY0, BX1, BY1, 5, ok);
    for (let i = 0; i < 6; i++) { const x = rng.int(BX0, BX1), y = rng.int(BY0, BY1); if (ok(x, y) && openTile(z, x, y)) f.floorItem(rng.pick(['bandage_dirty', 'syringe', 'face_mask', 'gloves_rubber']), x, y); }
  }

  // ------------------------------------------------------------ power, env, creatures
  for (let cc = 1; cc <= 14; cc++) z.power.set(cc, !c.dead.has(cc));
  z.env = {
    ...z.env,
    ambient: 0x2a3432, ambientI: 0.5, fog: 0x101614, fogNear: 12, fogFar: 30, void: 0x080b0a, temp: 18,
    grade: 'hospital', reverb: 'office', ambience: 'hospital', music: 'drone',
  };
  z.spawnTable = [['hollow', 3], ['echo', 1.5], ['employee', 1], ['ventling', 1], ['custodian', 1]];
  z.creatureCap = 8;
  z.meta.terminalLore = ['terminal_generic'];
  z.meta.shiftRate = 1;
  return b;
}

// =====================================================================
// shift stamps
// =====================================================================
/** the waiting-room seats: 0 rows facing the desk, 1 all turned to face the doors, 2 a ring around the ticket dispenser */
function waitingSeats(sb: ZoneBuilder, rng: Rng, v: number, x0: number, y0: number, x1: number, y1: number) {
  const f = new Furnisher(sb, rng);
  sb.fillFloor(x0, y0, x1, y1, 'terrazzo');
  // a clear aisle down the middle (x 70..73) and across (rows 86..87)
  const aisle = (x: number, y: number, w: number) => (x + w - 1 >= 70 && x <= 73) || y === 86 || y === 87;
  if (v === 0 || v === 1) {
    const rot: Rot = v === 0 ? 2 : 0;
    for (let y = y0 + 1; y <= y1 - 1; y += 3) for (let x = x0 + 1; x <= x1 - 3; x += 4) { if (!aisle(x, y, 3)) f.place('waiting_chairs', x, y, rot); }
    if (v === 1) f.place('zg_ticket_dispenser', 71, 95, 0);
  } else {
    const cx = 71.5, cy = 86.5;
    f.place('zg_ticket_dispenser', 71, 90, 0);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const x = Math.floor(cx + Math.cos(a) * 14), y = Math.floor(cy + Math.sin(a) * 11);
      const rot: Rot = Math.abs(Math.cos(a)) > 0.7 ? (Math.cos(a) > 0 ? 1 : 3) : (Math.sin(a) > 0 ? 2 : 0);
      f.place('chair_plastic', x, y, rot);
    }
  }
  for (let y = y0 + 2; y <= y1; y += 8) for (let x = x0 + 2; x <= x1; x += 10) sb.obj('light_fluoro', x, y, 0, { circuit: C_WAIT, broken: rng.chance(0.25), flicker: rng.chance(0.2) ? 0.3 : 0 });
}

/** an operating theatre: 0 ready for surgery, 1 dark with one gurney under the lamp, 2 the table is a school desk */
function theatre(sb: ZoneBuilder, rng: Rng, v: number, x0: number, y0: number, x1: number, y1: number) {
  const f = new Furnisher(sb, rng);
  const cx = Math.floor((x0 + x1) / 2);
  if (v === 0) {
    f.place('operating_table', cx, y0 + 4, 0);
    f.place('surgical_light', cx + 1, y0 + 3, 0, { on: true });
    f.place('hospital_monitor', cx + 2, y0 + 5, 0, { on: true });
    f.place('iv_stand', cx - 1, y0 + 4, 0);
    f.place('medical_cabinet', x0, y0, 0, { loot: 'hospital_cabinet' }); f.place('medical_cabinet', x1, y0, 0, { loot: 'hospital_cabinet' });
    f.place('lab_bench', x0 + 1, y1, WBACK.s, { loot: 'hospital_cabinet' });
    for (let u = 0; u < 3; u++) wallAt(sb, 'xray_lightbox', x0 + 3 + u, y0, 'n', { on: true });
    sb.obj('light_fluoro', cx, y0 + 7, 0, { circuit: C_THEATRE }); sb.obj('light_fluoro', x0 + 2, y0 + 2, 0, { circuit: C_THEATRE });
  } else if (v === 1) {
    f.place('gurney', cx, y0 + 4, 0, { v: 1 });
    f.place('surgical_light', cx + 1, y0 + 3, 0, { on: true });
  } else {
    f.place('desk_school', cx, y0 + 5, 0);
    sb.obj('zg_crayon_drawing', cx, y0 + 5, 0, { y: 0.745 });
    f.place('surgical_light', cx + 1, y0 + 4, 0, { on: true });
    wallAt(sb, 'chalkboard', cx - 1, y0, 'n');
    sb.obj('light_fluoro', cx, y0 + 8, 0, { circuit: C_THEATRE, flicker: 0.3 });
  }
}

defZone({
  key: 'hospital', name: 'St. Aldric', W, H, depth: 3,
  blurb: 'Fluorescent corridors and identical rooms. The display says NOW SERVING 0410. Your ticket says 0411.',
  gen: (z, s) => { generateHospital(z, s); },
});
