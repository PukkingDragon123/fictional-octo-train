// Alder Lane Estates (192×192, outdoor, dusk): the neighbourhood Mia Hale grew
// up in, at the hour the streetlights come on. Alder Lane runs in from the
// fields on the west and out to the parking lot on the east; Oak Drive crosses
// it, climbing north to Elm Street and south to the Maple Court cul-de-sac.
// Every house is the same house — red door, swing set, Biscuit's kennel and
// bowl, the same family photograph in the hall — and the house numbers repeat.
//
// Elm Street loops: walk off either end and you come back in at the other,
// past house 14 again (the lots there are copies, and the street is sealed by
// hedges so the only way along it is the street). A back alley runs behind the
// houses, with Ruiz's garage; the corner store glows at Oak & Alder;
// Meadowbrook Elementary sits across the street with its playground and
// Hale Park behind it. A manhole on Elm leads down to the tunnels.
//
// Liminal tricks: the looping street, repeating numbers, a street sign that
// names the street you just left, a garage door on Maple Court that opens into
// a garage on Elm, one house that rearranges itself, a playground that does too.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3, hashStr, fbm2 } from '../../core/rng';
import { registerShift } from '../shift';
import { Frame, Dir, Rot, LDir, LBACK, LFACE, WBACK, WFACE, ANG, wallAt, decal, scatter, lootIn, arrive, openTile } from './suburbs_kit';
import { wrongRoomsIn } from './wrong_kit';

const W = 192, H = 192;
// road corridors (8 wide: sidewalk, verge, 4 asphalt, verge, sidewalk)
const ELM = 24, ALDER = 96, MAPLE = 156, OAK = 88;
// the Elm Street loop: walking onto column SEAM_W puts you at SEAM_W + LOOP; onto SEAM_E, at SEAM_E - LOOP
const LOOP = 152, SEAM_W = 15, SEAM_E = SEAM_W + LOOP + 1;
const LOT_W = 18;
/** near the Elm seams the street must look identical on both sides: no random clutter there */
const seamWindow = (x: number, y: number) => y <= 53 && (Math.abs(x - SEAM_W) <= 22 || Math.abs(x - SEAM_E) <= 22);

// circuits: 1 store, 2 alley garages, 3 park, 100+ houses
const C_STORE = 1, C_ALLEY = 2, C_PARK = 3;

interface Ctx { z: Zone; b: ZoneBuilder; f: Furnisher; rng: Rng; seed: number; nextCircuit: number; houses: number; unlocked: number }

interface LotOpts {
  name: string;           // street name for rooms/labels
  num: string;            // house number on the plate
  salt: string;           // rng salt (beyond-the-seam copies use their partner's salt)
  depth?: number;         // lot depth (default 22)
  hedges?: boolean;       // hedges on every side (Elm: seals the loop)
  beyond?: boolean;       // a copy past a loop seam: exterior only
  locked?: boolean;
  car?: boolean;
  wrong?: number;         // which small detail is off (-1: none)
  shift?: boolean;        // the interior rearranges (registerShift)
  backGate?: boolean;     // gate in the back hedge (onto the alley)
  garageOpen?: boolean;
  noVerge?: boolean;      // no tree/hydrant on the verge (lots around the turning circle)
}

// =====================================================================
// roads
// =====================================================================
function roadEW(c: Ctx, x0: number, x1: number, y: number, name: string, type = 'street') {
  const { b } = c;
  b.fillFloor(x0, y, x1, y, 'sidewalk');
  b.fillFloor(x0, y + 1, x1, y + 1, 'grass');
  b.fillFloor(x0, y + 2, x1, y + 5, 'asphalt');
  b.fillFloor(x0, y + 6, x1, y + 6, 'grass');
  b.fillFloor(x0, y + 7, x1, y + 7, 'sidewalk');
  b.addRoom(name, type, x0, y, x1, y + 7, { outdoor: true });
  for (let x = x0 + (((2 - x0) % 4) + 4) % 4; x + 1 <= x1; x += 4) decal(c.z, 'decal_parking_line', x + 1, y + 4, 2, 0.16, 0, 0xe8b830, 0.85);
}
function roadNS(c: Ctx, x: number, y0: number, y1: number, name: string) {
  const { b } = c;
  b.fillFloor(x, y0, x, y1, 'sidewalk');
  b.fillFloor(x + 1, y0, x + 1, y1, 'grass');
  b.fillFloor(x + 2, y0, x + 5, y1, 'asphalt');
  b.fillFloor(x + 6, y0, x + 6, y1, 'grass');
  b.fillFloor(x + 7, y0, x + 7, y1, 'sidewalk');
  b.addRoom(name, 'street', x, y0, x + 7, y1, { outdoor: true });
  for (let y = y0 + 1; y + 1 <= y1; y += 4) decal(c.z, 'decal_parking_line', x + 4, y + 1, 2, 0.16, Math.PI / 2, 0xe8b830, 0.85);
}
/**
 * Junction box of an E-W road at row y and a N-S road at column x. Arms say
 * which directions the roads continue in. Corners become sidewalk, crossings
 * get zebra stripes.
 */
function junction(c: Ctx, x: number, y: number, arms: { n?: boolean; s?: boolean; e?: boolean; w?: boolean }, name: string) {
  const { b, z } = c;
  b.fillFloor(x, y, x + 7, y + 7, 'sidewalk');
  const ex0 = arms.w ? x : x + 2, ex1 = arms.e ? x + 7 : x + 5;
  const ny0 = arms.n ? y : y + 2, ny1 = arms.s ? y + 7 : y + 5;
  b.fillFloor(ex0, y + 2, ex1, y + 5, 'asphalt');
  b.fillFloor(x + 2, ny0, x + 5, ny1, 'asphalt');
  b.addRoom(name, 'intersection', x, y, x + 7, y + 7, { outdoor: true });
  const zebra = (cx: number, cy: number, horiz: boolean) => {
    for (let k = 0; k < 4; k++) {
      if (horiz) decal(z, 'decal_parking_line', cx + 0.5, cy + k + 0.5, 1.1, 0.34, 0, 0xeeeee4, 0.9);
      else decal(z, 'decal_parking_line', cx + k + 0.5, cy + 0.5, 1.1, 0.34, Math.PI / 2, 0xeeeee4, 0.9);
    }
  };
  if (arms.w) zebra(x + 1, y + 2, true);
  if (arms.e) zebra(x + 6, y + 2, true);
  if (arms.n) zebra(x + 2, y + 1, false);
  if (arms.s) zebra(x + 2, y + 6, false);
}

// =====================================================================
// the house: one lot, 18 wide, ~22 deep
//   v 0..5   front yard, path at u6, driveway u12..15
//   v 6..15  house u1..11 (living, kid's room, hall, kitchen, bath, bedroom), garage u12..15 v6..12
//   v 16..   back yard: swing set, Biscuit's kennel and bowl, washing line
// =====================================================================
function buildLot(c: Ctx, x0: number, y0: number, front: Dir, o: LotOpts): Frame {
  const { z, b } = c;
  const LD = o.depth ?? 22;
  const F = new Frame(b, x0, y0, LOT_W, LD, front);
  const rng = new Rng(hash3(c.seed, hashStr(o.salt), 41));
  const f = new Furnisher(b, rng);
  const wrong = o.wrong ?? -1;
  const P = (key: string, u: number, v: number, lr: number, st: Record<string, any> = {}) => F.put(f, key, u, v, lr, st);
  const circuit = c.nextCircuit++;
  const lit = rng.chance(0.7);
  const keyId = 'alder_' + o.salt;

  // ---------------- ground
  F.fill(0, 0, 17, LD - 1, 'grass');
  F.fill(6, 0, 6, 4, 'sidewalk');
  F.fill(12, 0, 15, 5, 'concrete');
  F.fill(12, -2, 15, -2, 'concrete');
  F.fill(5, 5, 7, 5, 'wood');
  F.room(o.name + ' ' + o.num + ' — front yard', 'yard', 0, 0, 17, 5, { outdoor: true, circuit });
  F.room(o.name + ' ' + o.num + ' — back yard', 'yard', 0, 16, 17, LD - 1, { outdoor: true });
  F.room(o.name + ' ' + o.num + ' — side yard', 'yard', 16, 6, 17, 15, { outdoor: true });
  F.room(o.name + ' ' + o.num + ' — back yard', 'yard', 12, 13, 15, 15, { outdoor: true });

  // ---------------- boundaries
  const vf = o.hedges ? 0 : 6;
  F.wallV(0, vf, LD - 1, 'l', o.hedges ? 'hedge' : 'fence_wood');
  F.wallV(17, vf, LD - 1, 'r', o.hedges ? 'hedge' : 'fence_wood');
  F.wallU(0, 17, LD - 1, 'b', 'hedge');
  if (o.backGate) { F.gap(8, LD - 1, 'b'); F.gap(9, LD - 1, 'b'); }

  // ---------------- house shell
  houseShell(c, F, o, circuit, keyId);

  // ---------------- front yard
  P('mailbox_house', 5, 0, LFACE.f);
  P('tree_oak', 2, 2, 0); decal(z, 'decal_leaves', ...F.C(2, 2), 2.4, 2.4, rng.float(0, 6));
  for (const u of [1, 3, 9, 11]) P('bush', u, 5, 0);
  P('flowers', 2, 4, 0); P('flowers', 4, 4, 0); P('flowers', 10, 4, 0);
  if (wrong !== 7) P('garden_gnome', 8, 3, LFACE.f);
  else P('garden_gnome', 8, 3, LFACE.b);  // this one is looking at the house
  F.mount('zg_house_number', 5, 5, 'b', { label: o.num });
  P(rng.chance(0.5) ? 'rocking_chair' : 'plant_potted', 7, 5, LFACE.f);
  const [mx, my] = F.C(6, 5);
  decal(z, 'carpet_rug', mx, my, 0.8, 0.5, F.ns ? 0 : Math.PI / 2, 0xb07a50);
  // porch light: warm, on at dusk
  b.light(mx, my, 'lamp', { y: 2.35, intensity: 0.75, radius: 4.5, circuit, color: 0xffc888, flicker: wrong === 2 ? 0.3 : 0 });
  // the street in front: a tree on the verge, sometimes a hydrant
  const hyd = rng.chance(0.4);
  if (!o.noVerge) { P('tree_oak', 3, -2, 0); if (hyd) P('fire_hydrant', 16, -2, 0); }
  // chalk on the driveway
  if (rng.chance(0.5)) { const [dx, dy] = F.C(13, rng.int(1, 4)); decal(z, rng.chance(0.5) ? 'decal_hopscotch' : 'decal_chalk_drawing', dx, dy, 1, rng.chance(0.5) ? 2 : 1.2, F.ns ? 0 : Math.PI / 2); }

  // ---------------- back yard
  const by = 16;
  if (wrong === 1) P('swing_set', 7, 1, LFACE.f);  // the swing set is in the front yard
  else P('swing_set', 2, by + 1, LFACE.f);
  P('sandbox', 6, by + 1, 0);
  P('kennel', 14, by + 1, LFACE.f);
  P('zg_dog_bowl', 15, by + 1, 0);
  if (wrong === 5) { P('kennel', 11, by + 1, LFACE.f); P('zg_dog_bowl', 10, by + 1, 0); }
  if (LD - 2 >= by + 3) P('washing_line', 7, LD - 2, LFACE.f);
  if (rng.chance(0.6)) P('picnic_table', 10, by + 2, 0); else P('bbq_grill', 11, by + 2, 0);
  P('tree_oak', 16, LD - 2, 0);
  P('tree_oak', 17, 8, 0);
  if (rng.chance(0.5)) P('sprinkler', 4, by + 3, 0);
  for (let u = 1; u <= 4; u++) if (rng.chance(0.6)) P('flowers', u, LD - 1, 0);
  if (LD >= 28) {
    // a deep lot: vegetable bed and a shed by the back gate
    F.fill(1, LD - 6, 5, LD - 3, 'soil');
    for (let v = LD - 6; v <= LD - 3; v += 2) for (let u = 1; u <= 5; u++) { const [sx, sy] = F.P(u, v); b.flag(sx, sy, sx, sy, TF.FURROW); }
    shed(c, F, 13, LD - 5, rng, o.beyond);
  }

  // ---------------- inside (the copies past the Elm seams too: the camera's cutaway shows interiors)
  {
    const irng = new Rng(hash3(c.seed, hashStr(o.salt), 97));
    const fi = new Furnisher(b, irng);
    if (o.shift) {
      const r = F.R(1, 6, 11, 15);
      registerShift(z, 'house_' + o.salt, r[0], r[1], r[2], r[3], 4, (sb, srng, v) => {
        const sF = new Frame(sb, F.x0, F.y0, F.W, F.D, F.front);
        houseInterior(sF, new Furnisher(sb, srng), srng, circuit, v, -1, true);
      });
    } else houseInterior(F, fi, irng, circuit, 0, wrong, false);
    garageInterior(F, fi, irng, circuit, o);
    // a little loose stuff, and the key under the porch plant for some locked houses
    if (!o.shift && !o.beyond) {
      const [lx0, ly0, lx1, ly1] = F.R(1, 6, 11, 15);
      lootIn(fi, irng, 'generic', lx0, ly0, lx1, ly1, 2);
      const [kx, ky] = F.P(3, 13);
      if (irng.chance(0.6)) fi.floorLoot('toys', kx, ky);
      if (irng.chance(0.25)) fi.floorLoot('lore_bits', ...F.P(6, irng.int(7, 14)));
    }
    if (o.locked && !o.beyond && irng.chance(0.45)) { const [kx, ky] = F.P(7, 5); fi.floorItem('key_generic', kx, ky, { keyId }); }
    z.power.set(circuit, lit);
  }
  if (o.beyond) F.flag(0, 0, 17, LD - 1, TF.NOSPAWN);
  else { c.houses++; if (!o.locked) c.unlocked++; }
  if (o.car && !o.beyond) {
    const [cx, cy] = F.P(13, 3);
    const rot = front === 's' ? 1 : front === 'n' ? 3 : front === 'w' ? 2 : 0;
    (z.meta.vehicleSpawns ||= []).push({ x: cx, y: cy, rot, chance: 0.75 });
  }
  return F;
}

/** floors, perimeter walls, doors, windows and rooms of a house (+ its garage) */
function houseShell(c: Ctx, F: Frame, o: LotOpts, circuit: number, keyId: string) {
  const locked = !!o.locked;
  F.fill(1, 6, 5, 10, 'carpet_hotel'); F.paper(1, 6, 5, 10, 'wall_house_floral');
  F.fill(1, 11, 5, 15, 'carpet_kids'); F.paper(1, 11, 5, 15, 'wall_kids');
  F.fill(6, 6, 7, 15, 'wood'); F.paper(6, 6, 7, 15, 'wall_house_stripe');
  F.fill(8, 6, 11, 10, 'tile_kitchen'); F.paper(8, 6, 11, 10, 'wall_kitchen');
  F.fill(8, 11, 11, 12, 'tile_white'); F.paper(8, 11, 11, 12, 'wall_bathroom');
  F.fill(8, 13, 11, 15, 'wood'); F.paper(8, 13, 11, 15, 'wall_house_floral');
  F.fill(12, 6, 15, 12, 'concrete'); F.paper(12, 6, 15, 12, 'wall_garage');
  F.flag(1, 6, 15, 12, TF.OUTDOOR, false);
  F.flag(1, 13, 11, 15, TF.OUTDOOR, false);
  const tag = o.name + ' ' + o.num;
  F.room('Living Room, ' + tag, 'living', 1, 6, 5, 10, { circuit });
  F.room("Child's Bedroom, " + tag, 'kids_room', 1, 11, 5, 15, { circuit });
  F.room('Hallway, ' + tag, 'hallway', 6, 6, 7, 15, { circuit });
  F.room('Kitchen, ' + tag, 'kitchen', 8, 6, 11, 10, { circuit });
  F.room('Bathroom, ' + tag, 'bathroom', 8, 11, 11, 12, { circuit });
  F.room('Bedroom, ' + tag, 'bedroom', 8, 13, 11, 15, { circuit });
  F.room('Garage, ' + tag, 'garage', 12, 6, 15, 12, { circuit });
  // perimeter
  F.wallU(1, 11, 6, 'f', 'siding'); F.wallU(1, 11, 15, 'b', 'siding');
  F.wallV(1, 6, 15, 'l', 'siding'); F.wallV(11, 13, 15, 'r', 'siding');
  F.wallV(11, 6, 12, 'r', 'drywall');
  F.wallU(12, 15, 12, 'b', 'siding'); F.wallV(15, 6, 12, 'r', 'siding');
  F.wallU(12, 15, 6, 'f', 'siding');
  // doors
  F.door(6, 6, 'f', 'door_red', { locked, keyId: locked ? keyId : undefined, open: o.wrong === 2 });
  F.door(7, 15, 'b', 'door_house', { locked, keyId: locked ? keyId : undefined });
  F.door(11, 8, 'r', 'door_house', {});
  F.door(15, 10, 'r', 'door_wood', { locked, keyId: locked ? keyId : undefined });
  if (o.garageOpen) for (let u = 12; u <= 15; u++) F.gap(u, 6, 'f');
  else F.mount('zg_garage_door', 12, 5, 'b');
  // windows: closed curtains on the locked houses
  const cur = locked ? 'closed' : 'open';
  for (const u of [2, 4, 9]) F.window(u, 6, 'f', { curtains: cur });
  F.window(1, 8, 'l', { curtains: cur }); F.window(1, 13, 'l', { curtains: cur });
  F.window(3, 15, 'b', { curtains: cur }); F.window(10, 15, 'b', { curtains: cur });
  F.window(11, 14, 'r', { curtains: cur });
  F.window(15, 8, 'r', { curtains: 'none' });
}

/**
 * Inside the house. variant 0 is the normal house; 1 empty but for one chair
 * facing the window; 2 every room is a child's bedroom; 3 everything piled in
 * the living room. `stamp` = rebuilt by a shift (no floor items or decals).
 */
function houseInterior(F: Frame, f: Furnisher, rng: Rng, circuit: number, variant: number, wrong: number, stamp: boolean) {
  const z = F.z;
  const P = (key: string, u: number, v: number, lr: number, st: Record<string, any> = {}) => F.put(f, key, u, v, lr, st);
  const M = (key: string, u: number, v: number, d: LDir, st: Record<string, any> = {}) => F.mount(key, u, v, d, st);
  // partitions
  F.wallV(5, 6, 15, 'r'); F.gap(5, 7, 'r'); F.gap(5, 8, 'r');
  F.wallU(1, 5, 10, 'b');
  F.wallV(7, 6, 15, 'r'); F.gap(7, 7, 'r'); F.gap(7, 8, 'r');
  F.wallU(8, 11, 10, 'b'); F.wallU(8, 11, 12, 'b');
  F.door(5, 13, 'r', 'door_white', { open: rng.chance(0.5) });
  F.door(7, 11, 'r', 'door_white', { open: rng.chance(0.5) });
  F.door(7, 14, 'r', 'door_white', { open: rng.chance(0.4) });
  // lights
  for (const [u, v] of [[3, 8], [3, 13], [6, 8], [6, 13], [9, 8], [9, 11], [9, 14]] as const) F.lamp(u, v, circuit, 'light_bulb', { flicker: wrong === 2 && v === 13 ? 0.35 : 0 });
  // the family photo, the same one in every house, in the same place
  M('photo_frames', 6, 10, 'l', { v: 1, blank: wrong === 4 });
  M('clock_wall', 7, 10, 'r');

  if (variant === 1) {
    // empty: one chair facing the front window, the photo, the light on
    P('chair_wood', 2, 7, LFACE.f);
    P('phone_desk', 7, 12, LBACK.r);
    return;
  }
  if (variant === 2) {
    // every room is the same child's bedroom
    // child's room, living room, kitchen, bedroom: a bed, a toy box, a drawing on the wall
    P('bed_single', 2, 14, LBACK.b); P('toy_box', 4, 15, LBACK.b); M('zg_wall_drawing', 3, 11, 'f', { v: 0 });
    P('bed_single', 2, 9, LBACK.b); P('toy_box', 4, 10, LBACK.b); M('zg_wall_drawing', 2, 6, 'f', { v: 1 });
    P('bed_single', 10, 9, LBACK.b); P('toy_box', 11, 6, LBACK.f); M('zg_wall_drawing', 9, 6, 'f', { v: 2 });
    P('bed_single', 10, 14, LBACK.b); P('toy_box', 11, 13, LBACK.r); M('zg_wall_drawing', 9, 13, 'f', { v: 1 });
    P('teddy_giant', 10, 11, LFACE.l);
    return;
  }
  if (variant === 3) {
    // all of it, piled up in the living room
    const heap = ['sofa', 'armchair', 'dresser', 'wardrobe', 'table_dining', 'chair_wood', 'chair_wood', 'bed_single', 'tv_crt', 'lamp_floor', 'nightstand', 'toy_box', 'bookshelf', 'fridge', 'coffee_table'];
    for (const k of heap) for (let t = 0; t < 6; t++) { if (P(k, rng.int(1, 5), rng.int(6, 10), rng.int(0, 3))) break; }
    M('painting', 9, 13, 'f', { v: 2 });
    return;
  }

  // ---------------- living room (u1..5, v6..10)
  const tvs = P('tv_stand', 3, 6, LBACK.f);
  if (tvs) f.onTop('tv_crt', tvs, { on: rng.chance(0.3) });
  if (wrong === 3) {
    // all the seats face the wall
    P('sofa', 2, 10, LFACE.b); P('armchair', 1, 7, LFACE.l);
  } else {
    P('sofa', 2, 10, LBACK.b); P('armchair', 1, 7, LFACE.r);
  }
  P('coffee_table', 2, 8, 0);
  P('lamp_floor', 1, 10, 0, { circuit });
  P('bookshelf', 5, 10, LBACK.r);
  P('plant_potted', 5, 6, 0);
  M('painting', 1, 9, 'l', { v: rng.int(0, 5) });
  M('clock_wall', 1, 6, 'f');
  if (!stamp) { const [rx, ry] = F.C(3, 8); decal(z, 'carpet_rug', rx, ry, 3, 2.2, F.ns ? 0 : Math.PI / 2, 0xb87a5a); }
  // ---------------- child's room (u1..5, v11..15)
  P('bed_single', 2, 14, LBACK.b);
  const ns = P('nightstand', 1, 15, LBACK.b);
  if (ns) f.onTop('lamp_table', ns, { circuit });
  P('toy_box', 4, 15, LBACK.b);
  P('dresser', 1, 11, LBACK.l);
  P(rng.chance(0.5) ? 'rocking_horse' : 'dollhouse', 4, 12, LFACE.l);
  M('zg_wall_drawing', 3, 11, 'f', { v: rng.int(0, 2) });
  M('poster', 1, 12, 'l', { v: rng.int(0, 5) });
  if (!stamp) { const [bx, by] = F.P(2, 14); if (z.inb(bx, by) && z.floor[z.idx(bx, by)]) f.floorItem('teddy_bear', bx, by); }
  // ---------------- hall
  P('clothing_rack', 7, 6, LBACK.r, { loot: 'wardrobe' });
  P('phone_desk', 7, 12, LBACK.r);
  P('plant_potted', 6, 15, 0);
  M('mirror', 7, 9, 'r');
  // ---------------- kitchen (u8..11, v6..10)
  const k1 = P('counter_kitchen', 8, 6, LBACK.f);
  if (k1) f.onTop(rng.chance(0.5) ? 'microwave' : 'coffee_maker', k1, {});
  P('counter_sink', 9, 6, LBACK.f);
  const k3 = P('counter_kitchen', 10, 6, LBACK.f);
  if (k3) f.onTop('toaster', k3, {});
  P('stove', 11, 6, LBACK.f);
  P('fridge', 11, 10, LBACK.b);
  M('kitchen_cabinet_wall', 8, 6, 'f'); M('kitchen_cabinet_wall', 10, 6, 'f');
  P('table_dining', 9, 9, 0);
  P('chair_wood', 9, 8, LFACE.b); P('chair_wood', 10, 8, LFACE.b); P('chair_wood', 9, 10, LFACE.f);
  M('noticeboard', 8, 10, 'l');
  // ---------------- bathroom (u8..11, v11..12)
  P('bathtub', 10, 12, LBACK.b);
  P('toilet', 8, 12, LBACK.b);
  P('sink_bathroom', 11, 11, LBACK.r);
  M('mirror', 11, 11, 'r');
  M('medicine_cabinet', 9, 11, 'f');
  M('towel_rack', 10, 11, 'f');
  // ---------------- bedroom (u8..11, v13..15)
  P('bed_double', 9, 14, LBACK.b);
  const n1 = P('nightstand', 11, 15, LBACK.b);
  if (n1) f.onTop('lamp_table', n1, { circuit });
  P('nightstand', 8, 15, LBACK.b);
  P('wardrobe', 11, 13, LBACK.r);
  P('dresser', 8, 13, LBACK.f);
  M('painting', 9, 15, 'b', { v: 4 });
}

function garageInterior(F: Frame, f: Furnisher, rng: Rng, circuit: number, o: LotOpts) {
  const P = (key: string, u: number, v: number, lr: number, st: Record<string, any> = {}) => F.put(f, key, u, v, lr, st);
  P('workbench', 12, 12, LBACK.b);
  P('tool_chest', 14, 12, LBACK.b);
  P('shelf_metal', 15, 11, LBACK.r, { loot: 'garage_shelf' });
  P('shelf_metal', 15, 12, LBACK.r, { loot: 'garage_shelf' });
  if (!o.garageOpen) { P('cardboard_box', 12, 6, 0); P('cardboard_stack', 13, 6, 0); P('barrel_oil', 15, 6, 0); }
  if (rng.chance(0.5)) P('chair_stack', 12, 10, 0);
  F.lamp(13, 9, circuit, 'light_bulb', { flicker: rng.chance(0.2) ? 0.2 : 0 });
}

/** a garden shed (3×3) at local (u, v) */
function shed(c: Ctx, F: Frame, u: number, v: number, rng: Rng, beyond?: boolean) {
  F.fill(u, v, u + 2, v + 2, 'wood');
  F.walls(u, v, u + 2, v + 2, 'wood_built');
  F.door(u + 1, v, 'f', 'door_wood');
  F.flag(u, v, u + 2, v + 2, TF.OUTDOOR, false);
  F.room('Garden Shed', 'shed', u, v, u + 2, v + 2);
  if (beyond) return;
  const f = new Furnisher(c.b, rng);
  F.put(f, 'shelf_metal', u, v + 2, LBACK.b, { loot: 'garage_shelf' });
  F.put(f, 'crate_wood', u + 2, v + 2, LBACK.b);
  F.put(f, 'sawhorse', u + 2, v + 1, 0);
}

// =====================================================================
// the corner store (Kwik Stop) at Oak & Alder, facing Alder
// =====================================================================
function cornerStore(c: Ctx) {
  const { z, b, f, rng } = c;
  const x0 = 98, y0 = 80, x1 = 115, y1 = 91;
  b.fillFloor(96, 66, 117, 95, 'concrete');
  b.fillFloor(x0, y0, x1, y1, 'linoleum');
  b.paper(x0, y0, x1, y1, 'wall_supermarket');
  b.roomWalls(x0, y0, x1, y1, 'brick');
  b.flag(x0, y0, x1, y1, TF.OUTDOOR, false);
  b.addRoom('Kwik Stop', 'store', x0, y0, x1, y1, { circuit: C_STORE });
  // shopfront: glass with double doors
  b.hwall(x0 + 1, x1 - 1, y1 + 1, 'glass');
  b.door(106, y1 + 1, 0, 'door_glass', { open: true });
  b.door(107, y1 + 1, 0, 'door_glass', {});
  // apron with parking bays
  b.fillFloor(96, 92, 117, 95, 'asphalt');
  b.addRoom('Kwik Stop — lot', 'parking', 96, 92, 117, 95, { outdoor: true });
  for (const x of [98, 102, 111, 115]) decal(z, 'decal_parking_line', x + 0.5, 93.5, 0.16, 3, 0, 0xeeeee4, 0.85);
  (z.meta.vehicleSpawns ||= []).push({ x: 100, y: 93, rot: 0, type: 'hatch', chance: 0.7 });
  // signage
  wallAt(b, 'zg_sign', 106, y1 + 1, 'n', { label: 'KWIK STOP', h: 2.4 });
  wallAt(b, 'zg_sign', 109, y1 + 1, 'n', { label: 'OPEN', h: 1.7 });
  wallAt(b, 'payphone', 99, y1 + 1, 'n');
  f.place('newspaper_box', 104, 92, 0); f.place('trash_can_outdoor', 109, 92, 0);
  f.place('bench', 112, 92, 0);
  b.obj('lamp_post', 97, 95, 2, { lore: 'flyer_lost_dog' });
  // inside: checkout by the door, aisles, coolers along the east wall, back room
  const co = f.place('checkout_counter', 100, 88, WBACK.w);
  if (co) f.onTop('cash_register', co, {});
  f.place('shelf_store_end', 99, 91, 0, { loot: 'store_snacks' });
  f.place('gumball_machine', 104, 90, 0);
  const aisle: [string, string][] = [['store_food_canned', 'store_food_dry'], ['store_snacks', 'store_drinks'], ['store_household', 'store_pharmacy']];
  aisle.forEach(([la, lb], i) => {
    const y = 85 + i * 2 - 1;
    for (let x = 104; x <= 110; x += 2) { f.place('shelf_store', x, y, 2, { loot: la }); f.place('shelf_store', x, y + 1, 0, { loot: lb }); }
  });
  // that leaves aisles at 86, 88 and a cross-aisle at x 103 / 112
  for (let y = 84; y <= 90; y++) f.place('freezer_display', x1, y, WBACK.e, { loot: y % 2 ? 'store_drinks' : 'store_frozen' });
  f.place('vending_soda', 113, y1, 0); f.place('vending_snack', 112, y1, 0);
  f.place('produce_stand', 99, 82, WBACK.w);
  wallAt(b, 'noticeboard', 101, 83, 'n', { lore: 'flyer_lost_dog' });
  // back room
  b.hwall(x0, x1, 83, 'drywall');
  b.door(102, 83, 0, 'door_office', { sign: 'staff' });
  b.addRoom('Kwik Stop — stock room', 'storage', x0, y0, x1, 82, { circuit: C_STORE });
  for (let x = 104; x <= 114; x += 2) f.place('shelf_metal', x, y0, 0, { loot: rng.pick(['store_food_canned', 'store_drinks', 'store_household', 'crate_supplies']) });
  f.place('cardboard_stack', x0, y0, 0); f.place('cardboard_box', x0 + 1, y0, 0); f.place('pallet_boxes', x0, 82, 0);
  f.place('desk_office', 99, 81, 0); f.place('chair_office', 100, 82, 2);
  b.door(111, y0, 0, 'door_metal', { sign: 'staff' });
  for (const [x, y] of [[101, 86], [106, 86], [111, 86], [101, 90], [106, 89], [111, 89], [104, 81], [111, 81]] as const) b.obj('light_fluoro', x, y, 0, { circuit: C_STORE, flicker: x === 111 && y === 89 ? 0.3 : 0 });
  // back yard: dumpster, pallets, a chain-link fence onto the alley
  b.addRoom('Kwik Stop — yard', 'yard', 96, 66, 117, 79, { outdoor: true });
  f.place('dumpster', 98, 74, 0); f.place('dumpster', 101, 74, 0);
  f.place('pallet', 106, 76, 0); f.place('pallet', 107, 76, 0); f.place('pallet_boxes', 108, 77, 0);
  f.place('trash_bags', 104, 78, 0); f.place('barrel_oil', 114, 78, 0);
  b.vwall(96, 66, 79, 'fence_chain'); b.vwall(118, 66, 95, 'fence_chain');
  lootIn(f, rng, 'store_snacks', 103, 84, 112, 90, 3);
  lootIn(f, rng, 'trash', 97, 67, 116, 78, 3);
  for (let i = 0; i < 8; i++) f.decal(rng.pick(['decal_stain_dark', 'decal_trash', 'decal_stain_water']), rng.int(x0, x1), rng.int(84, y1), rng.float(0.6, 1.2), rng.float(0.6, 1.2));
}

// =====================================================================
// the back alley between Elm and Alder, with detached garages
// =====================================================================
function alley(c: Ctx) {
  const { z, b, f, rng } = c;
  const ay0 = 62, ay1 = 65;
  b.fillFloor(24, ay0, OAK - 1, ay1, 'gravel'); b.fillFloor(OAK + 8, ay0, 189, ay1, 'gravel');
  b.addRoom('The Alley', 'alley', 24, 55, 87, ay1, { outdoor: true });
  b.addRoom('The Alley', 'alley', 96, 55, 189, ay1, { outdoor: true });
  b.vwall(24, 55, 65, 'hedge');
  // garages along the north side (doors facing the alley), dumpsters and bins between
  const gx = [26, 46, 66, 120, 140, 160];
  for (let x = 30; x <= 186; x += 12) if ((x < 86 || x > 98) && !gx.some((g) => x >= g - 1 && x <= g + 6)) f.place('power_pole', x, 61, 0);
  for (const x of gx) {
    const ruiz = x === 140;
    const F = new Frame(b, x, 55, 6, 7, 's');
    F.fill(0, 0, 5, 6, 'concrete');
    F.fill(0, 1, 5, 6, 'parking');
    F.walls(0, 1, 5, 6, 'siding');
    F.paper(0, 1, 5, 6, 'wall_garage');
    F.flag(0, 1, 5, 6, TF.OUTDOOR, false);
    F.room(ruiz ? "Somebody's Garage" : 'Garage', 'garage', 0, 1, 5, 6, { circuit: C_ALLEY });
    F.door(5, 3, 'r', 'door_wood', { locked: !ruiz && rng.chance(0.5) });
    if (ruiz) {
      // the door is up: someone lived in here for a while
      for (let u = 1; u <= 4; u++) F.gap(u, 1, 'f');
      F.put(f, 'sleeping_bag', 1, 4, LBACK.b);
      F.put(f, 'campfire_unlit', 3, 3, 0);
      F.put(f, 'survivor_stash', 4, 6, LBACK.b, { loot: 'survivor_stash' });
      F.put(f, 'crate_wood', 0, 6, LBACK.b, { loot: 'camp_supplies' });
      F.put(f, 'workbench', 1, 6, LBACK.b);
      F.put(f, 'chair_folding', 3, 5, LFACE.b);
      F.mount('zg_wall_scrawl', 2, 6, 'b', { v: 1 });
      const [jx, jy] = F.P(2, 3);
      f.floorItem('journal', jx, jy, { lore: 'journal_survey_3' });
      f.floorItem('lantern', ...F.P(3, 4)); f.floorItem('map_lobby', ...F.P(1, 2)); f.floorItem('empty_can', ...F.P(4, 2));
      for (let i = 0; i < 3; i++) { const [dx, dy] = F.C(rng.int(1, 4), rng.int(2, 5)); decal(z, 'decal_trash', dx, dy, 0.8, 0.8, rng.float(0, 6)); }
      F.lamp(3, 3, C_ALLEY, 'light_bulb', { flicker: 0.25 });
      F.room("Ruiz's Garage", 'ruiz_garage', 1, 2, 4, 5, { circuit: C_ALLEY });
    } else {
      F.mount('zg_garage_door', 1, 0, 'b');
      F.put(f, 'shelf_metal', 0, 6, LBACK.b, { loot: 'garage_shelf' });
      F.put(f, 'tool_chest', 5, 6, LBACK.b);
      F.put(f, rng.chance(0.5) ? 'workbench' : 'pallet_boxes', 2, 6, LBACK.b);
      F.put(f, 'cardboard_box', 1, 2, 0);
      F.lamp(2, 3, C_ALLEY, 'light_bulb', { broken: rng.chance(0.4) });
    }
    f.place('trash_can_outdoor', x + 7, 60, 0);
    if (rng.chance(0.5)) f.place('trash_bags', x + 8, 60, 0);
  }
  for (const x of [36, 56, 76, 108, 130, 150, 172]) f.place(rng.chance(0.5) ? 'dumpster' : 'trash_bags', x, 58, 0);
  for (const x of [40, 104, 152, 180]) f.place('lamp_post', x, 60, 0, { broken: x === 104, flicker: x === 152 ? 0.2 : 0 });
  scatter(f, rng, 24, 55, 189, 65, 60, [['decal_puddle', 2], ['decal_trash', 3], ['decal_stain_dark', 2], ['decal_leaves', 1]], 0.7, 1.6);
  lootIn(f, rng, 'trash', 24, 55, 189, 65, 10);
  lootIn(f, rng, 'floor_generic', 24, 55, 189, 65, 8);
  // the alley stops at the hedge in the east, and at the town edge in the west
  b.vwall(190, 55, 65, 'hedge');
}

// =====================================================================
// Meadowbrook Elementary (outside), Hale Park and its playground
// =====================================================================
function schoolGrounds(c: Ctx) {
  const { z, b, f, rng } = c;
  const sx0 = 116, sy0 = 118, sx1 = 171, sy1 = 141;
  b.addRoom('Meadowbrook Elementary — front lawn', 'schoolyard', 96, 104, 189, 117, { outdoor: true });
  // the building: brick, dark windows; the inside is the school itself
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) z.floor[z.idx(x, y)] = 0;
  b.roomWalls(sx0, sy0, sx1, sy1, 'brick');
  for (let x = sx0 + 2; x <= sx1 - 2; x += 3) if (x < 139 || x > 148) { b.window(x, sy0, 0, { style: 'window_metal', curtains: 'closed', curtainSide: 1 }); b.window(x, sy1 + 1, 0, { style: 'window_metal', curtains: 'closed', curtainSide: -1 }); }
  for (let y = sy0 + 2; y <= sy1 - 2; y += 3) { b.window(sx0, y, 1, { style: 'window_metal', curtains: 'closed', curtainSide: 1 }); b.window(sx1 + 1, y, 1, { style: 'window_metal', curtains: 'closed', curtainSide: -1 }); }
  // front doors: four leaves, one of them opens
  for (const x of [141, 142, 144, 145]) b.door(x, sy0, 0, 'door_school', { locked: true });
  b.door(143, sy0, 0, 'door_school', { portal: 'p_suburbs_school' });
  b.portal({ id: 'p_suburbs_school', x: 143, y: sy0 - 1, kind: 'door', to: 'school', tx: 64, ty: 86, face: ANG.n, label: 'Go into the school' });
  arrive(b, 'r_suburbs_school', 143, sy0 - 3, ANG.n, 4);
  b.light(143.5, sy0 - 0.6, 'lamp', { y: 2.5, intensity: 0.9, radius: 6, color: 0xfff0d0, circuit: 0 });
  b.light(138.5, sy0 - 0.6, 'lamp', { y: 2.5, intensity: 0.5, radius: 4, color: 0xfff0d0, circuit: 0, flicker: 0.2 });
  // entrance plaza, walk to the bus loop
  b.fillFloor(136, 112, 151, sy0 - 1, 'sidewalk');
  b.fillFloor(141, 104, 145, 111, 'sidewalk');
  // the bus loop: in from Alder, past the doors, out again
  b.fillFloor(100, 108, 185, 111, 'asphalt');
  b.fillFloor(100, 102, 103, 107, 'asphalt'); b.fillFloor(182, 102, 185, 107, 'asphalt');
  for (let x = 104; x <= 180; x += 4) decal(z, 'decal_parking_line', x + 1, 110, 2, 0.16, 0, 0xe8b830, 0.85);
  (z.meta.vehicleSpawns ||= []).push({ x: 128, y: 109, rot: 0, type: 'van', chance: 0.9 });
  // front lawn
  b.obj('zg_flagpole', 136, 113, 0);
  b.obj('zg_monument_sign', 125, 113, 0, { v: 1 });
  for (const x of [119, 131]) f.place('flowers', x, 113, 0);
  for (const x of [138, 148]) f.place('bench', x, 115, 0);
  for (const x of [137, 149]) f.place('trash_can_outdoor', x, 117, 0);
  for (const x of [104, 112, 158, 166, 176]) { f.place('tree_oak', x, 106, 0); decal(z, 'decal_leaves', x + 0.5, 106.5, 2.4, 2.4, 0.4); }
  for (const x of [118, 126, 134, 152, 160, 168]) f.place('bush', x, 117, 0);
  for (const x of [102, 140, 146, 184]) b.obj('lamp_post', x, 112, 2, {});
  f.place('bus_stop', 150, 112, 0);
  // teachers' lot on the east side
  b.fillFloor(174, 112, 187, 140, 'asphalt');
  b.addRoom('Staff Parking', 'parking', 174, 112, 187, 140, { outdoor: true });
  for (let y = 116; y <= 138; y += 3) { decal(z, 'decal_parking_line', 176.5, y, 3, 0.16, 0, 0xeeeee4, 0.85); decal(z, 'decal_parking_line', 185.5, y, 3, 0.16, 0, 0xeeeee4, 0.85); }
  (z.meta.vehicleSpawns ||= []).push({ x: 178, y: 120, rot: 0, type: 'sedan', chance: 0.8 }, { x: 178, y: 132, rot: 0, chance: 0.6 }, { x: 184, y: 126, rot: 2, type: 'pickup', chance: 0.6 });
  b.obj('lamp_post', 181, 126, 0, { flicker: 0.15 });
  // the blacktop behind the school
  b.fillFloor(110, 142, 177, 149, 'asphalt');
  b.addRoom('Blacktop', 'schoolyard', 110, 142, 177, 149, { outdoor: true });
  b.hwall(110, 177, 150, 'fence_chain'); b.vwall(110, 142, 149, 'fence_chain'); b.vwall(178, 142, 149, 'fence_chain');
  for (const x of [130, 131, 160, 161]) b.gap(x, 150, 0);
  b.gap(178, 145, 1); b.gap(178, 146, 1);
  f.place('basketball_hoop', 114, 145, WFACE.e); f.place('basketball_hoop', 173, 145, WFACE.w);
  for (const [x, y] of [[124, 144], [136, 146], [150, 143], [165, 147]] as const) decal(z, 'decal_hopscotch', x + 0.5, y + 1, 1, 2, 0);
  for (let i = 0; i < 6; i++) decal(z, 'decal_chalk_drawing', rng.int(118, 170) + 0.5, rng.int(142, 149) + 0.5, 1.2, 1.2, rng.float(0, 6));
  decal(z, 'decal_parking_line', 143.5, 146, 4, 0.12, 0, 0xeeeee4, 0.8); decal(z, 'decal_parking_line', 143.5, 146, 4, 0.12, Math.PI / 2, 0xeeeee4, 0.8);
  f.floorItem('basketball', 140, 147); f.floorItem('jump_rope', 152, 145);
}

function hasePark(c: Ctx) {
  const { z, b, f, rng } = c;
  b.addRoom('Hale Park', 'park', 96, 151, 189, 189, { outdoor: true, circuit: C_PARK });
  // paths
  b.fillFloor(96, 158, 189, 159, 'sidewalk');
  b.fillFloor(130, 151, 131, 189, 'sidewalk');
  b.fillFloor(160, 151, 161, 158, 'sidewalk');
  // pond
  for (let y = 164; y <= 184; y++) for (let x = 146; x <= 180; x++) {
    const d = Math.hypot((x - 163) / 13, (y - 174) / 7.5);
    if (d < 1) b.fillFloor(x, y, x, y, d < 0.6 ? 'water_deep' : 'water_shallow', d < 0.6 ? -0.5 : -0.1);
    else if (d < 1.15) b.fillFloor(x, y, x, y, 'sand');
  }
  b.addRoom('The Pond', 'pond', 150, 166, 176, 182, { outdoor: true });
  f.place('bench_park', 160, 162, 0); f.place('bench_park', 166, 162, 0);
  f.floorItem('toy_rubber_duck', 163, 172); f.floorItem('toy_rubber_duck', 168, 175);
  // the playground: rubber matting, a low fence, everything a child could want
  const px0 = 112, py0 = 162, px1 = 139, py1 = 181;
  b.fillFloor(px0, py0, px1, py1, 'sand');
  b.addRoom('Playground', 'playground', px0, py0, px1, py1, { outdoor: true, circuit: C_PARK });
  b.roomWalls(px0, py0, px1, py1, 'fence_wood');
  for (const x of [130, 131]) { b.gap(x, py0, 0); b.gap(x, py1 + 1, 0); }
  b.gap(px0, 171, 1); b.gap(px0, 172, 1);
  registerShift(z, 'playground', px0, py0, px1, py1, 3, (sb, srng, v) => playground(sb, srng, v, px0, py0, px1, py1));
  for (const [x, y] of [[111, 160], [140, 160], [111, 183], [140, 183]] as const) b.obj('lamp_post', x, y, 0, { circuit: 0, lore: x === 140 && y === 160 ? 'flyer_lost_dog' : undefined, flicker: x === 111 && y === 183 ? 0.3 : 0 });
  for (const [x, y, r] of [[118, 160, 0], [124, 160, 0], [136, 184, 2], [118, 184, 2]] as const) f.place('bench_park', x, y, r as Rot);
  // picnic area, trees, a phone booth by the path
  for (const [x, y] of [[100, 166], [104, 172], [100, 178], [146, 152], [152, 155]] as const) f.place('picnic_table', x, y, 0);
  f.place('phone_booth', 128, 156, 0);
  for (const x of [100, 146, 176]) b.obj('lamp_post', x, 157, 0, {});
  for (const y of [152, 186]) b.obj('lamp_post', 132, y, 0, {});
  f.place('trash_can_outdoor', 129, 160, 0); f.place('trash_can_outdoor', 162, 160, 0);
  for (let i = 0; i < 46; i++) {
    const x = rng.int(97, 188), y = rng.int(151, 188);
    if (x >= px0 - 2 && x <= px1 + 2 && y >= py0 - 2 && y <= py1 + 2) continue;
    const fl = z.floorAt(x, y);
    if (!fl || fl.key !== 'grass' || !openTile(z, x, y)) continue;
    f.place(rng.chance(0.7) ? 'tree_oak' : 'tree_pine', x, y, 0);
    decal(z, 'decal_leaves', x + 0.5, y + 0.5, 2.4, 2.4, rng.float(0, 6));
  }
}

/** the playground rearranges itself when nobody is watching */
function playground(sb: ZoneBuilder, rng: Rng, v: number, x0: number, y0: number, x1: number, y1: number) {
  const f = new Furnisher(sb, rng);
  sb.fillFloor(x0, y0, x1, y1, 'sand');
  if (v === 0) {
    f.place('swing_set', x0 + 2, y0 + 2, 0); f.place('swing_set', x0 + 6, y0 + 2, 0);
    f.place('slide_playground', x0 + 12, y0 + 2, 0); f.place('slide_playground', x0 + 14, y0 + 2, 0);
    f.place('jungle_gym', x0 + 20, y0 + 3, 0);
    f.place('merry_go_round', x0 + 4, y0 + 10, 0);
    f.place('seesaw', x0 + 10, y0 + 11, 0); f.place('seesaw', x0 + 10, y0 + 14, 0);
    for (const dx of [16, 18, 20]) f.place('spring_rider', x0 + dx, y0 + 10, 0);
    f.place('sandbox', x0 + 22, y0 + 14, 0);
    f.place('bench_park', x0 + 2, y1 - 1, 0);
  } else if (v === 1) {
    // every swing set in a row, all facing you
    for (let k = 0; k < 6; k++) f.place('swing_set', x0 + 1 + k * 4, y0 + 8, 0);
    f.place('sandbox', x0 + 12, y0 + 14, 0);
  } else {
    // everything in a ring around the sandbox, facing in
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    f.place('sandbox', Math.floor(cx) - 1, Math.floor(cy) - 1, 0);
    const ring = ['spring_rider', 'spring_rider', 'merry_go_round', 'seesaw', 'slide_playground', 'swing_set', 'jungle_gym', 'spring_rider', 'slide_playground', 'swing_set'];
    ring.forEach((k, i) => {
      const a = (i / ring.length) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 8), y = Math.round(cy + Math.sin(a) * 6);
      const rot: Rot = Math.abs(Math.cos(a)) > 0.7 ? (Math.cos(a) > 0 ? 1 : 3) : (Math.sin(a) > 0 ? 2 : 0);
      for (let t = 0; t < 4; t++) if (f.place(k, x + (t % 2), y + (t >> 1), rot)) break;
    });
  }
}

// =====================================================================
// the generator
// =====================================================================
export function generateSuburbs(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed, nextCircuit: 100, houses: 0, unlocked: 0 };
  z.name = 'Alder Lane Estates';
  z.meta.vehicleSpawns = [];
  z.meta.anchors = {};

  // ------------------------------------------------------------ ground, boundary
  b.fillFloor(2, 2, 189, 189, 'grass');
  for (let y = 2; y <= 189; y++) for (let x = 2; x <= 189; x++) if (rng.chance(0.15)) b.floorVar(x, y, 1);
  // the west edge still belongs to the fields
  for (let y = 55; y <= 189; y++) for (let x = 2; x <= 23; x++) {
    const n = fbm2(x / 9, y / 9, 3, seed & 0xffff);
    if (x < 10 + n * 14) b.fillFloor(x, y, x, y, 'grass_dream');
  }
  b.roomWalls(2, 2, 189, 189, 'hedge');
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);

  // ------------------------------------------------------------ the arrival road from the fields (Alder Lane, west)
  b.fillFloor(0, ALDER + 1, 23, ALDER + 1, 'sidewalk');
  b.fillFloor(0, ALDER + 2, 23, ALDER + 5, 'asphalt');
  b.fillFloor(0, ALDER + 6, 23, ALDER + 6, 'sidewalk');
  b.fillFloor(2, ALDER, 23, ALDER, 'grass_dream'); b.fillFloor(2, ALDER + 7, 23, ALDER + 7, 'grass_dream');
  b.addRoom('Alder Lane', 'road', 0, ALDER, 23, ALDER + 7, { outdoor: true });
  for (let x = 2; x < 23; x += 4) decal(z, 'decal_parking_line', x + 1, ALDER + 4, 2, 0.16, 0, 0xe8b830, 0.85);
  for (let y = ALDER + 1; y <= ALDER + 6; y++) {
    b.gap(2, y, 1);
    b.portal({ id: 'r_fields_road', x: 1, y, kind: 'walk', to: 'fields', tx: 185, ty: 105, face: Math.PI, label: 'Follow the road back to the fields' });
  }
  arrive(b, 'p_fields_road', 8, ALDER + 3, ANG.e, 4);
  b.obj('zg_monument_sign', 17, ALDER - 3, 0, { v: 0 });
  for (const x of [15, 21]) f.place('flowers', x, ALDER - 2, 0);
  for (let x = 4; x <= 22; x += 9) f.place('power_pole', x, ALDER - 1, 0);
  f.place('bus_stop', 12, ALDER + 8, 2);
  b.obj('street_light', 6, ALDER + 7, 2, {});
  f.place('traffic_cone', 3, ALDER + 2, 0);

  // ------------------------------------------------------------ roads
  roadEW(c, 24, 189, ALDER, 'Alder Lane');
  // Alder Lane leaves for the parking lot in the east
  b.fillFloor(190, ALDER + 1, 191, ALDER + 6, 'asphalt');
  for (let y = ALDER + 1; y <= ALDER + 6; y++) {
    b.gap(190, y, 1);
    b.portal({ id: 'p_suburbs_lot', x: 190, y, kind: 'walk', to: 'parking', tx: 82, ty: 126, face: 0, label: 'Follow the road to the parking lot' });
  }
  arrive(b, 'r_suburbs_lot', 183, ALDER + 3, ANG.w, 4);
  // Elm Street: the whole width of the map, so it can loop
  roadEW(c, 2, 189, ELM, 'Elm Street');
  roadNS(c, OAK, ELM + 8, MAPLE + 7, 'Oak Drive');
  roadEW(c, 45, OAK - 1, MAPLE, 'Maple Court');
  junction(c, OAK, ELM, { e: true, w: true, s: true }, 'Elm & Oak');
  junction(c, OAK, ALDER, { e: true, w: true, n: true, s: true }, 'Alder & Oak');
  junction(c, OAK, MAPLE, { w: true, n: true }, 'Maple & Oak');
  // Oak ends at Maple: the hedge closes it off
  b.hwall(OAK, OAK + 7, MAPLE + 8, 'hedge');

  // ------------------------------------------------------------ Elm Street (the loop)
  // lots: west 16, 34, 52, 70 | Oak | east 96, 114, 132, 150 — and past the seams the copies:
  // -2 (a copy of 150) and 168 (a copy of 16).
  const elmWest = [16, 34, 52, 70], elmEast = [96, 114, 132, 150];
  const elmReal = [...elmWest, ...elmEast];
  const nN = ['1', '3', '5', '7', '9', '11', '13', '13'];
  const nS = ['2', '4', '6', '8', '10', '12', '14', '14'];
  elmReal.forEach((x0, i) => {
    const sN = 'elmN' + x0, sS = 'elmS' + x0;
    buildLot(c, x0, 2, 's', { name: 'Elm Street', num: nN[i], salt: sN, depth: 22, hedges: true, locked: ![1, 5, 6].includes(i), wrong: i === 3 ? 4 : i === 6 ? 7 : -1, shift: i === 6 });
    buildLot(c, x0, ELM + 8, 'n', { name: 'Elm Street', num: nS[i], salt: sS, depth: 22, hedges: true, locked: ![2, 6].includes(i), wrong: i === 4 ? 1 : i === 1 ? 2 : -1, garageOpen: i === 5 });
  });
  // the copies past the seams (exteriors only, identical to their partners)
  const copies: [number, number][] = [[-2, 150], [168, 16], [186, 34]];
  for (const [x0, px] of copies) {
    const i = elmReal.indexOf(px);
    buildLot(c, x0, 2, 's', { name: 'Elm Street', num: nN[i], salt: 'elmN' + px, depth: 22, hedges: true, locked: ![1, 5].includes(i), wrong: i === 3 ? 4 : i === 6 ? 7 : -1, beyond: true });
    buildLot(c, x0, ELM + 8, 'n', { name: 'Elm Street', num: nS[i], salt: 'elmS' + px, depth: 22, hedges: true, locked: ![2, 6].includes(i), wrong: i === 4 ? 1 : i === 1 ? 2 : -1, garageOpen: i === 5, beyond: true });
  }
  for (const x0 of [...elmReal, -2, 168, 186]) {
    // sodium lamps on the verges, periodic with the lots so both seams match
    const real = x0 === -2 ? 150 : x0 === 168 ? 16 : x0 === 186 ? 34 : x0;
    const flick = hash3(real, 5, seed & 0xffff) % 7 === 0 ? 0.25 : 0;
    if (z.inb(x0 + 10, ELM + 1)) b.obj('lamp_post', x0 + 10, ELM + 1, 0, { flicker: flick });
    if (z.inb(x0 + 10, ELM + 6)) b.obj('lamp_post', x0 + 10, ELM + 6, 2, { flicker: 0, lore: real === 132 ? 'flyer_lost_dog' : undefined });
  }
  // the seams
  for (let y = ELM; y <= ELM + 7; y++) {
    b.portal({ id: 'loop_elm_w' + y, x: SEAM_W, y, kind: 'loop', to: 'suburbs', tx: SEAM_W + LOOP, ty: y, loopDx: LOOP, hidden: true });
    b.portal({ id: 'loop_elm_e' + y, x: SEAM_E, y, kind: 'loop', to: 'suburbs', tx: SEAM_E - LOOP, ty: y, loopDx: -LOOP, hidden: true });
  }
  b.flag(2, ELM, SEAM_W, ELM + 7, TF.NOSPAWN); b.flag(SEAM_E, ELM, 189, ELM + 7, TF.NOSPAWN);
  // a hedge closes the Elm lots off from the alley (Oak is the only way in)
  b.hwall(2, OAK - 1, 54, 'hedge'); b.hwall(OAK + 8, 189, 54, 'hedge');
  // pocket park across from Oak: a memorial, a phone booth, a bench facing the street
  {
    b.addRoom('Elm Street — pocket park', 'park', OAK, 2, OAK + 7, ELM - 1, { outdoor: true });
    f.place('bench_park', OAK + 3, ELM - 2, 0);
    f.place('shrine', OAK + 4, ELM - 5, 0);
    f.floorItem('photo_old', OAK + 4, ELM - 4); f.floorItem('candle', OAK + 3, ELM - 4);
    f.place('phone_booth', OAK + 1, ELM - 6, 0);
    f.place('tree_oak', OAK + 6, ELM - 10, 0); f.place('tree_oak', OAK + 2, ELM - 14, 0);
    for (const x of [OAK + 1, OAK + 5]) f.place('flowers', x, ELM - 3, 0);
    b.obj('street_light', OAK + 7, ELM - 1, 0, {});
  }
  // the manhole on Elm (down to the service tunnels)
  {
    const mx = 124, my = ELM + 4;
    b.obj('manhole', mx, my, 0, { portal: 'p_suburbs_manhole' });
    b.portal({ id: 'p_suburbs_manhole', x: mx, y: my, kind: 'manhole', to: 'tunnels', tx: 135, ty: 17, label: 'Climb down the manhole' });
    arrive(b, 'r_suburbs_manhole', mx + 1, my, ANG.e, 4);
    f.place('traffic_cone', mx - 1, my - 1, 0); f.place('traffic_cone', mx + 1, my + 1, 0);
    decal(z, 'decal_stain_dark', mx + 0.5, my + 0.5, 2, 2, 0.4, 0x302820, 0.6);
  }
  // street signs at Elm & Oak: one says Elm. The other says the street you came from.
  b.obj('zg_street_sign', OAK, ELM + 6, 0, { a: 1, b: 2 });
  b.obj('zg_street_sign', OAK + 7, ELM + 6, 0, { a: 0, b: 2 });

  // ------------------------------------------------------------ the alley
  alley(c);

  // ------------------------------------------------------------ Alder Lane
  // north side (deep lots, back gates onto the alley)
  const aN: [number, string, boolean][] = [[24, '10', false], [42, '12', true], [60, '14', false], [118, '14', true], [136, '14', false], [154, '14', true], [172, '16', true]];
  aN.forEach(([x0, num, locked], i) => buildLot(c, x0, 66, 's', { name: 'Alder Lane', num, salt: 'alderN' + x0, depth: 30, backGate: true, locked, car: i % 2 === 0, wrong: i === 2 ? 3 : i === 4 ? 5 : -1, garageOpen: i === 1 }));
  // south side, west of Oak
  const aS: [number, string, boolean][] = [[24, '11', true], [42, '13', false], [60, '14A', true]];
  aS.forEach(([x0, num, locked], i) => buildLot(c, x0, ALDER + 8, 'n', { name: 'Alder Lane', num, salt: 'alderS' + x0, depth: 22, locked, car: i !== 1, wrong: i === 2 ? 2 : -1 }));
  // pocket greens either side of Oak
  for (const [x0, y0, y1] of [[78, 66, 95], [78, ALDER + 8, 125]] as const) {
    b.vwall(x0, y0, y1, 'fence_wood');
    f.place('tree_oak', x0 + 4, y0 + 6, 0); f.place('tree_pine', x0 + 7, y0 + 14, 0); f.place('bush', x0 + 2, y0 + 20, 0);
  }
  f.place('bus_stop', 81, ALDER - 1, 0);
  // street furniture along Alder
  for (let x = 28; x <= 186; x += 18) {
    if (x >= OAK - 2 && x <= OAK + 9) continue;
    b.obj('lamp_post', x, ALDER + 1, 0, { flicker: x === 64 ? 0.3 : 0, broken: x === 154, lore: x === 82 ? 'flyer_lost_dog' : undefined });
    if (x + 9 < OAK - 1) b.obj('lamp_post', x + 9, ALDER + 6, 2, {});
  }
  (z.meta.vehicleSpawns as any[]).push({ x: 50, y: ALDER + 2, rot: 0, chance: 0.7 }, { x: 140, y: ALDER + 5, rot: 2, type: 'hatch', chance: 0.7 }, { x: 166, y: ALDER + 2, rot: 0, type: 'pickup', chance: 0.5 });
  // signs at Alder & Oak: three correct, one names Elm
  b.obj('zg_street_sign', OAK, ALDER, 0, { a: 0, b: 2 });
  b.obj('zg_street_sign', OAK + 7, ALDER, 0, { a: 0, b: 2 });
  b.obj('zg_street_sign', OAK, ALDER + 7, 0, { a: 1, b: 2 });
  b.obj('zg_street_sign', OAK + 7, ALDER + 7, 0, { a: 0, b: 6 });

  // ------------------------------------------------------------ the corner store
  cornerStore(c);

  // ------------------------------------------------------------ Maple Court (the cul-de-sac)
  {
    // lots around the bulb and along the court
    buildLot(c, 27, MAPLE - 27, 's', { name: 'Maple Court', num: '1', salt: 'mapleB1', depth: 22, locked: false, car: true, noVerge: true });
    buildLot(c, 5, MAPLE - 5, 'e', { name: 'Maple Court', num: '2', salt: 'mapleB2', depth: 22, locked: true, wrong: 6, noVerge: true });
    buildLot(c, 27, MAPLE + 13, 'n', { name: 'Maple Court', num: '3', salt: 'mapleB3', depth: 21, locked: false, noVerge: true });
    buildLot(c, 46, MAPLE - 22, 's', { name: 'Maple Court', num: '4', salt: 'mapleN46', depth: 22, locked: true, car: true });
    buildLot(c, 64, MAPLE - 22, 's', { name: 'Maple Court', num: '41', salt: 'mapleN64', depth: 22, locked: false });
    const F5 = buildLot(c, 46, MAPLE + 8, 'n', { name: 'Maple Court', num: '5', salt: 'mapleS46', depth: 22, locked: true });
    // number 5's red front door does not open into number 5: it opens into the Homestead
    {
      F5.door(6, 6, 'f', 'door_red', { portal: 'p_suburbs_home' });
      const [px, py] = F5.P(6, 5);
      b.portal({ id: 'p_suburbs_home', x: px, y: py, kind: 'door', to: 'homestead', tx: 60, ty: 79, label: 'Open the red front door' });
      const [ax, ay] = F5.P(6, 3);
      arrive(b, 'r_suburbs_home', ax, ay, F5.ang('f'), 3);
    }
    buildLot(c, 64, MAPLE + 8, 'n', { name: 'Maple Court', num: '6', salt: 'mapleS64', depth: 22, locked: false, car: true, wrong: 3 });
    const cx = 35.5, cy = MAPLE + 3.5;
    for (let y = MAPLE - 6; y <= MAPLE + 13; y++) for (let x = 26; x <= 45; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < 8.2) b.fillFloor(x, y, x, y, 'asphalt');
      else if (d < 9.4) b.fillFloor(x, y, x, y, 'sidewalk');
    }
    b.addRoom('Maple Court', 'cul_de_sac', 27, MAPLE - 5, 44, MAPLE + 12, { outdoor: true });
    // an island in the middle of the turning circle: a tree and a bench
    for (let y = MAPLE + 2; y <= MAPLE + 5; y++) for (let x = 34; x <= 37; x++) b.fillFloor(x, y, x, y, 'grass');
    f.place('tree_oak', 35, MAPLE + 3, 0); f.place('bench_park', 34, MAPLE + 5, 0);
    b.obj('lamp_post', 36, MAPLE + 2, 0, { flicker: 0.2 });
    decal(z, 'decal_chalk_drawing', 31.5, MAPLE + 4.5, 1.4, 1.4, 0.6);
    for (const x of [52, 70]) { b.obj('lamp_post', x, MAPLE + 1, 0, {}); b.obj('lamp_post', x + 9, MAPLE + 6, 2, {}); }
    b.obj('zg_street_sign', OAK - 1, MAPLE + 7, 0, { a: 3, b: 1 });
    // the green belt between Alder and Maple
    b.addRoom('Green', 'park', 24, ALDER + 30, 87, MAPLE - 23, { outdoor: true });
    for (const [x, y] of [[48, 127], [58, 128], [70, 127], [84, 129], [30, 127]] as const) f.place('tree_oak', x, y, 0);
    b.hwall(24, 87, ALDER + 30, 'hedge');
  }
  // a garage on Maple Court whose side door opens into a garage on Elm (and back)
  {
    // Maple Court 41 (lot x0 = 64, front 's') and Elm Street 10 (lot x0 = 96, south side): the same
    // garage side door at local (15, 10), each opening into the other garage
    const Fm = new Frame(b, 64, MAPLE - 22, LOT_W, 22, 's');
    const Fe = new Frame(b, 96, ELM + 8, LOT_W, 22, 'n');
    const [ax, ay] = Fe.P(14, 9), [mx2, my2] = Fm.P(14, 9);
    (z.meta.anchors as any).garage_elm_in = [ax, ay, Fe.ang('l')];
    (z.meta.anchors as any).garage_maple_in = [mx2, my2, Fm.ang('l')];
    const pairs: [Frame, string, string, number, number][] = [[Fm, 'garage_maple', 'garage_elm_in', ax, ay], [Fe, 'garage_elm', 'garage_maple_in', mx2, my2]];
    for (const [F, id, anchorId, tx, ty] of pairs) {
      const [gx, gy, gs] = F.edge(15, 10, 'r');
      b.door(gx, gy, gs, 'door_wood', { portal: id });
      const [px, py] = F.P(15, 10);
      b.portal({ id, x: px, y: py, kind: 'door', to: 'suburbs', tx, ty, label: 'Open the side door', anchor: anchorId });
    }
  }

  // ------------------------------------------------------------ the school and the park
  schoolGrounds(c);
  hasePark(c);

  // ------------------------------------------------------------ scattered things
  const toys = ['teddy_bear', 'baseball', 'jump_rope', 'marbles', 'toy_car', 'crayons', 'juice_box', 'doll', 'basketball', 'childrens_book'];
  for (let i = 0; i < 40; i++) {
    const x = rng.int(4, 187), y = rng.int(4, 187);
    if ((z.flags[z.idx(x, y)] & (TF.NOSPAWN | TF.SHIFT)) || !openTile(z, x, y) || !(z.flags[z.idx(x, y)] & TF.OUTDOOR) || seamWindow(x, y)) continue;
    f.floorItem(rng.pick(toys), x, y);
  }
  lootIn(f, rng, 'floor_generic', 24, 24, 189, 189, 40, (x, y) => (z.flags[z.idx(x, y)] & TF.OUTDOOR) !== 0 && !(z.flags[z.idx(x, y)] & TF.NOSPAWN) && !seamWindow(x, y));
  scatter(f, rng, 4, 4, 187, 187, 260, [['decal_leaves', 4], ['decal_puddle', 1], ['decal_stain_dark', 1], ['decal_crack', 1.5], ['decal_footprints', 1]], 0.8, 1.8,
    (x, y) => (z.flags[z.idx(x, y)] & TF.OUTDOOR) !== 0 && !(z.flags[z.idx(x, y)] & TF.NOSPAWN) && !seamWindow(x, y));
  // wild edges of the town: tall grass and flowers on the dream grass
  for (let y = 55; y <= 188; y++) for (let x = 3; x <= 23; x++) {
    const fl = z.floorAt(x, y);
    if (!fl || fl.key !== 'grass_dream' || !openTile(z, x, y)) continue;
    if (y >= ALDER - 1 && y <= ALDER + 8) continue;
    const r = rng.next();
    if (r < 0.12) b.obj('grass_tall', x, y, 0); else if (r < 0.18) b.obj('flowers', x, y, 0); else if (r < 0.19) b.obj('tree_oak', x, y, 0);
  }

  // ------------------------------------------------------------ nothing outside the hedge but the two roads
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x >= 2 && x <= 189 && y >= 2 && y <= 189) continue;
    if (y >= ALDER + 1 && y <= ALDER + 6) continue;
    const i = z.idx(x, y);
    z.floor[i] = 0;
    if (x >= 191 || x <= 1) z.wallW[i] = 0;
    if (y >= 191 || y <= 1) z.wallN[i] = 0;
    if (x >= 190 || y >= 190) { z.edges.delete(z.edgeKey(x, y, 0)); }
    for (const o of [...z.objectsAt(x, y)]) z.removeObject(o);
  }
  z.lights = z.lights.filter((l) => (l.x >= 2 && l.x < 190 && l.z >= 2 && l.z < 190) || (l.z >= ALDER + 1 && l.z < ALDER + 7));
  z.decals = z.decals.filter((d) => (d.x >= 2 && d.x < 190 && d.z >= 2 && d.z < 190) || (d.z >= ALDER + 1 && d.z < ALDER + 7 && d.x >= 0 && d.x < W));

  // ------------------------------------------------------------ env, creatures
  for (const cc of [C_STORE, C_ALLEY, C_PARK]) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0x5a4c6c, ambientI: 0.46, fog: 0x7a6280, fogNear: 24, fogFar: 70, void: 0x2e2234, temp: 19,
    sky: true, sun: 0xff9a5a, sunI: 0.45, skyColor: 0x7a74b8, outdoorAmbient: 0x7a6a98,
    grade: 'suburbs', reverb: 'outdoor', ambience: 'suburbs', music: 'musicbox', weather: 'none',
  };
  z.spawnTable = [['grinhound', 3], ['goodboy', 1.5], ['wrongbird', 2], ['stilt_doe', 1], ['sentinel', 1], ['hollow', 1]];
  z.creatureCap = 10;
  z.meta.terminalLore = ['terminal_generic'];
  z.meta.shiftRate = 0.8;
  // two of the walk-in houses have a room that is wrong (world stream 3)
  wrongRoomsIn(z, b, seed ^ 0x77a5, ['living', 'kids_room', 'bedroom'], 2, ['upside_down', 'tv_backs', 'bed_still', 'tiny_door'], { paper: 'wall_house_floral', lamp: 'light_bulb' });
  z.meta.houses = c.houses; z.meta.housesOpen = c.unlocked;
  return b;
}

defZone({
  key: 'suburbs', name: 'Alder Lane Estates', W, H, depth: 2,
  blurb: 'The streetlights are coming on. Every house has a red door and a swing set, and every house is number fourteen.',
  gen: (z, s) => { generateSuburbs(z, s); },
});
