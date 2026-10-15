// The Homestead (100×84). One family's bungalow, copied sixteen times and
// stitched together: four rows of four identical houses, wall to wall. Every
// front door opens onto the hallway of the house in front of it; the kitchen
// back door opens into a child's bedroom; the parents' bedroom opens into the
// next house's living room. The bottom row's front doors open onto the top
// row's hallways, so the walk never ends. The houses differ in small ways:
// whether the family is at the table, whether dinner is served, whether the
// television is on, who is in the beds. The family are Still Lifes.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { Ctx, Rot, Side, BACK, FACE, arrive, put, force, mount, decal, hh, hopperAt, lamp, isOpen, floorRect, itemAtW, objCentre, rotLocal } from './weird_kit';

const HW = 24, HH = 20, COLS = 4, ROWS = 4, OX = 2, OY = 2;
const W = OX * 2 + HW * COLS, H = OY * 2 + HH * ROWS;
const C_HOME = 1;
/** houses whose front door leaves the Homestead */
const EXIT_SHOWROOM = 12, EXIT_SUBURBS = 14;   // bottom row (row 3): houses 12..15

export function generateHomestead(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Homestead';
  // the arrival anchors first (reachability is measured from the first one)
  for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) house(c, q, r);
  // nothing outside: the exterior walls have windows onto black
  for (let y = OY; y < OY + HH * ROWS; y += 4) { b.window(OX, y + 2, 1, { curtains: 'open' }); b.window(OX + HW * COLS, y + 2, 1, { curtains: hh(y, 1, 4001) < 0.5 ? 'closed' : 'open' }); }
  for (let x = OX; x < OX + HW * COLS; x += 4) if ((x - OX) % HW < 9 || (x - OX) % HW > 13) b.window(x + 1, OY, 0, { curtains: 'closed' });

  z.power.set(C_HOME, true);
  z.env = {
    ...z.env,
    ambient: 0x2e261c, ambientI: 0.5, fog: 0x140f0a, fogNear: 10, fogFar: 24, void: 0x030202, temp: 21,
    grade: 'house', reverb: 'small', ambience: 'house', music: 'musicbox',
  };
  z.spawnTable = [['still_life', 5], ['plushkin', 1], ['lamplighter', 1], ['echo', 0.8], ['davenport', 0.4]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['zw_home_survey', 'zw_home_note'];
}

function house(c: Ctx, q: number, r: number) {
  const { b, z, f } = c;
  const k = r * COLS + q;
  const X = OX + q * HW, Y = OY + r * HH;
  const P = (lx: number, ly: number): [number, number] => [X + lx, Y + ly];
  const R = (lx0: number, ly0: number, lx1: number, ly1: number): [number, number, number, number] => [X + lx0, Y + ly0, X + lx1, Y + ly1];
  const v = Math.floor(hh(q, r, 4011) * 6);       // which small difference this copy has
  const at = (key: string, lx: number, ly: number, rot: Rot = 0, st: Record<string, any> = {}) => put(c, key, X + lx, Y + ly, rot, st);
  const wallM = (key: string, lx: number, ly: number, side: Side, st: Record<string, any> = {}) => mount(b, key, X + lx, Y + ly, side, st);
  const room = (name: string, type: string, lx0: number, ly0: number, lx1: number, ly1: number, floor: string, paper: string) => {
    floorRect(b, ...R(lx0, ly0, lx1, ly1), floor, paper);
    b.roomWalls(...R(lx0, ly0, lx1, ly1), 'drywall');
    return b.addRoom(name, type, ...R(lx0, ly0, lx1, ly1), { circuit: C_HOME, temp: 21 });
  };
  const bulb = (lx: number, ly: number, o: Record<string, any> = {}) => b.obj('light_bulb', X + lx, Y + ly, 0, { circuit: C_HOME, ...o });

  // ---- rooms
  room('Hallway', 'hallway', 10, 0, 12, 19, 'wood', 'zw_wall_home');
  b.fillFloor(X + 11, Y, X + 11, Y + 19, 'carpet_red');
  room('Living Room', 'living', 0, 0, 9, 9, 'carpet_hotel', 'wall_house_floral');
  room('Dining Room', 'dining', 0, 10, 9, 19, 'wood', 'wall_paneling');
  room('Kitchen', 'kitchen', 13, 0, 23, 8, 'tile_kitchen', 'wall_kitchen');
  room("Parents' Bedroom", 'bedroom', 13, 9, 23, 14, 'carpet_office', 'wall_house_stripe');
  room("Children's Bedroom", 'nursery', 13, 15, 18, 19, 'carpet_kids', 'wall_kids');
  room('Bathroom', 'bathroom', 19, 15, 23, 19, 'tile_white', 'wall_bathroom');
  // ---- openings inside the house
  for (const ly of [4, 5]) b.arch(...P(10, ly), 1);
  for (const ly of [13, 14]) b.arch(...P(10, ly), 1);
  for (const lx of [3, 4]) b.arch(...P(lx, 10), 0);
  b.door(...P(13, 4), 1, 'door_house', { open: hh(k, 1, 4021) < 0.5 });
  b.door(...P(13, 11), 1, 'door_house', { open: hh(k, 2, 4021) < 0.4 });
  b.door(...P(13, 17), 1, 'door_white', { open: true });
  b.door(...P(19, 17), 1, 'door_white', { open: hh(k, 3, 4021) < 0.5 });
  // ---- the stitches between copies
  // front door: the bottom of the hallway, onto the next house's hallway (or out of the Homestead)
  if (r < ROWS - 1) b.door(...P(11, 20), 0, 'door_red', { open: false });
  else {
    const top = k - (ROWS - 1) * COLS; // the top-row house in the same column
    b.door(...P(11, 20), 0, 'door_red', { portal: 'home_front_' + k });
    const out = k === EXIT_SHOWROOM ? { to: 'showroom', anchor: 'r_showroom_home', id: 'r_showroom_home', label: 'Go out of the front door' }
      : k === EXIT_SUBURBS ? { to: 'suburbs', anchor: 'r_suburbs_home', id: 'r_suburbs_home', label: 'Go out of the front door' }
        : { to: 'homestead', anchor: 'home_hall_' + top, id: 'home_front_' + k, label: 'Open the front door' };
    if (out.id !== 'home_front_' + k) { const e = z.edge(...P(11, 20), 0); if (e) e.portal = out.id; }
    b.portal({ id: out.id, x: X + 11, y: Y + 19, kind: 'door', to: out.to, tx: X + 11, ty: Y + 17, label: out.label, anchor: out.anchor });
    if (k === EXIT_SHOWROOM) arrive(b, 'p_showroom_home', X + 11, Y + 17, 'n', 3);
    if (k === EXIT_SUBURBS) arrive(b, 'p_suburbs_home', X + 11, Y + 17, 'n', 3);
  }
  if (r === 0) arrive(b, 'home_hall_' + k, X + 11, Y + 1, 's', 1);
  // kitchen back door into the children's bedroom of the house behind
  if (r > 0) b.door(...P(15, 0), 0, 'door_house', { open: hh(k, 4, 4021) < 0.3 });
  // parents' bedroom into the next house's living room; bathroom into its dining room
  if (q < COLS - 1) { b.door(...P(24, 9), 1, 'door_house', { open: false }); b.door(...P(24, 17), 1, 'door_white', { open: false }); }

  // ---- the hallway: runner, photos with smeared faces, coats, shoes, a little table
  for (let ly = 1; ly <= 18; ly += 3) wallM('zw_portrait', 10, ly, 'w', { v: (ly + k) % 4 });
  wallM('zw_coat_hooks', 12, 18, 'e'); at('zw_shoe_rack', 12, 19, 1);
  const ht = at('nightstand', 12, 2, 1);
  if (ht) { f.onTop('lamp_table', ht, {}); if (k === 5) f.floorItem('note', X + 12, Y + 3, { lore: 'zw_home_survey' }); }
  wallM('clock_wall', 12, 8, 'e');
  for (const ly of [3, 9, 15]) bulb(11, ly, { flicker: hh(k, ly, 4031) < 0.15 ? 0.25 : 0, broken: hh(k, ly, 4032) < 0.08 });
  for (let ly = 0.5; ly < 19.5; ly += 1.7) decal(z, 'decal_footprints', X + 11.5 + Math.sin(ly + k) * 0.3, Y + ly, 0.7, 0.7, Math.PI / 2, 0x6a4a3a, 0.6);

  // ---- living room: the sofa faces the television
  const tv = at('zw_tv_console', 4, 1, 0, {});
  void tv;
  if (v === 2) { // the room is on the ceiling
    for (const [key, lx, ly, rot] of [['sofa', 3, 6, 2], ['armchair', 7, 4, 3], ['coffee_table', 4, 4, 0], ['lamp_floor', 0, 8, 0], ['bookshelf', 9, 8, 3]] as const) b.obj('zw_upside_down', X + lx, Y + ly, rot as Rot, { of: key });
  } else {
    at('sofa', 3, 6, 2); at('armchair', 7, 4, 3); at('armchair', 1, 4, 1);
    at('coffee_table', 4, 4, 0); at('lamp_floor', 0, 8, 0); at('bookshelf', 9, 8, 3); at('plant_potted', 9, 0, 0);
    if (v === 0 || v === 3 || k === EXIT_SHOWROOM) {
      // the family watches the snow
      force(c, 'replica_seated', X + 3, Y + 6, 2, { pose: 'sit', seat: 'none' });
      force(c, 'replica_seated', X + 4, Y + 6, 2, { pose: 'sit', seat: 'none' });
      if (v === 3) force(c, 'replica_child', X + 4, Y + 3, 2, { pose: 'child' });
    }
    if (v === 5) at('replica_standing', 0, 0, 0, { pose: 'stand' }); // facing the corner
  }
  decal(z, 'carpet_rug', X + 4.5, Y + 4.5, 4.2, 3.2, 0, 0xb87a5a, 0.95);
  wallM('zw_portrait', 7, 0, 'n', { v: k % 4 });
  wallM('painting', 1, 0, 'n', { v: (k + 1) % 5 });
  bulb(4, 5, { color: 0xffc890 });

  // ---- dining room: dinner, and who is eating it
  const table = at('table_dining', 4, 14, 0);
  if (table) {
    const served = v !== 4;
    f.onTop('zw_table_setting', table, { v: served ? (k % 5 === 0 ? 1 : 0) : 2 });
    if (served) dinner(c, table, k % 5 === 0 ? 1 : 0);
  }
  const seated = v === 0 || v === 1 || v === 3 || k === EXIT_SUBURBS;
  const chairs: [number, number, Rot][] = [[4, 13, 0], [5, 13, 0], [4, 15, 2], [5, 15, 2], [3, 14, 3], [6, 14, 1]];
  chairs.forEach(([lx, ly, rot], i) => {
    if (seated && i < 4 && hh(k, i, 4041) < 0.75) force(c, 'replica_seated', X + lx, Y + ly, rot, { pose: 'sit_table', seat: 'chair_wood' });
    else if (seated && i === 4) force(c, 'replica_child', X + lx, Y + ly, rot, { pose: 'sit_table', seat: 'zw_highchair' });
    else if (v === 5) at('chair_wood', lx, ly, ((rot + 2) % 4) as Rot); // every chair turned away from the table
    else at('chair_wood', lx, ly, rot);
  });
  at('dresser', 1, 19, 2, { loot: 'kitchen_cabinet' }); at('plant_potted', 9, 19, 0);
  wallM('zw_portrait', 6, 19, 's', { v: (k + 2) % 4 });
  bulb(4, 14, { color: 0xffd8a0, flicker: v === 4 ? 0.3 : 0 });

  // ---- kitchen
  const line = ['fridge', 'counter_kitchen', 'stove', 'counter_kitchen', 'counter_sink', 'counter_kitchen'];
  line.forEach((key, i) => {
    const o = at(key, 17 + i, 0, 0, key === 'fridge' ? { loot: 'fridge_house' } : {});
    if (key !== 'fridge') wallM('kitchen_cabinet_wall', 17 + i, 0, 'n');
    if (o && i === 1) f.onTop('microwave', o, {}); if (o && i === 3) f.onTop('toaster', o, {}); if (o && i === 5) f.onTop('coffee_maker', o, {});
  });
  at('table_round', 19, 5, 0); at('chair_wood', 18, 5, 1); at('chair_wood', 20, 5, 3);
  at('trash_can', 23, 8, 0);
  if (v === 1) at('replica_standing', 19, 1, 2, { pose: 'stand' }); // at the stove, back to you
  if (v === 4) for (const [lx, ly, vv] of [[16, 3, 0], [21, 6, 1], [14, 7, 3]] as const) at('zw_drip_bucket', lx, ly, 0, { v: vv });
  if (k % 3 === 0) f.floorItem('note', X + 19, Y + 4, { lore: 'zw_home_note' });
  itemAtW(z, c.rng, k % 2 ? 'bread' : 'apple', X + 19.5, Y + 5.5, 0.8);
  b.obj('light_fluoro', X + 18, Y + 4, 0, { circuit: C_HOME, flicker: hh(k, 9, 4051) < 0.3 ? 0.3 : 0 });

  // ---- parents' bedroom
  if (v === 0 || v === 2) force(c, 'replica_lying', X + 18, Y + 9, 0, { bed: 'bed_single' });
  else at('bed_double', 18, 9, 0);
  if (v === 0 || v === 2) at('bed_single', 20, 9, 0);
  const n1 = at('nightstand', 17, 9, 0), n2 = at('nightstand', 22, 9, 0);
  if (n1) f.onTop('lamp_table', n1, {}); if (n2) f.onTop('lamp_table', n2, {});
  at('wardrobe', 14, 9, 0, { loot: 'wardrobe' }); at('dresser', 23, 13, 1, { loot: 'bedroom_dresser' });
  wallM('zw_portrait', 19, 9, 'n', { v: (k + 3) % 4 });
  bulb(19, 12, { color: 0xffc080, intensity: 0.7 });

  // ---- children's bedroom
  at('bunk_bed', 13, 15, 0); at('toy_box', 18, 19, 2);
  at('zw_kids_table', 15, 17, 0);
  if (v === 1 || v === 3 || v === 5) { force(c, 'replica_child', X + 15, Y + 18, 2, { pose: 'child' }); }
  else at('zw_kids_chair', 15, 18, 2, { v: k });
  at('zw_kids_chair', 16, 16, 0, { v: k + 1 });
  wallM('zg_wall_drawing', 16, 15, 'n', { v: k });
  if (k % 4 === 1) f.floorItem('note', X + 16, Y + 18, { lore: 'zw_home_child' });
  b.light(X + 15.5, Y + 17.5, 'lamp', { circuit: C_HOME, color: 0xa0c0ff, intensity: 0.45, radius: 3, y: 0.6 }); // the night light
  f.floorLoot('zw_floor_home', X + 17, Y + 17);

  // ---- bathroom
  at('bathtub', 20, 15, 0); at('toilet', 23, 19, 1); at('sink_bathroom', 19, 19, 2);
  wallM('mirror', 19, 19, 's'); wallM('towel_rack', 23, 17, 'e');
  if (v === 4) at('zw_drip_bucket', 21, 17, 0, { v: 2 });
  bulb(21, 17, { color: 0xf0f0ff, intensity: 0.6, flicker: 0.1 });

  // ---- loose things on the floors
  for (let i = 0; i < 3; i++) { const lx = c.rng.int(0, 23), ly = c.rng.int(0, 19); if (isOpen(z, X + lx, Y + ly)) f.floorLoot('zw_floor_home', X + lx, Y + ly); }
  // the arrival house (from the showroom) keeps the hopper in its dining room corner
  if (k === EXIT_SHOWROOM) {
    for (const o of [...z.objects.values()]) if (o.x >= X + 7 && o.x <= X + 9 && o.y >= Y + 16 && o.y <= Y + 18 && o.key === 'plant_potted') z.removeObject(o);
    hopperAt(c, X + 7, Y + 16, 0);
  }
  b.flag(X + 10, Y + 15, X + 12, Y + 19, TF.NOSPAWN);
  void BACK; void FACE;
}

/** real food on the plates of a zw_table_setting on table `t` */
function dinner(c: Ctx, t: NonNullable<ReturnType<typeof put>>, v: number) {
  const [cx, cy] = objCentre(t);
  const seats: [number, number][] = [[-0.5, 0.27], [0.5, 0.27], [-0.5, -0.27], [0.5, -0.27], [-0.82, 0], [0.82, 0]];
  const menu = v === 1 ? ['birthday_cake', 'cookies', 'juice_box', 'candy_bar', 'cookies', 'juice_box'] : ['stew', 'sandwich', 'salad', 'bread_slice', 'potato', 'apple'];
  seats.forEach(([lx, lz], i) => {
    const [wx, wz] = rotLocal(t.rot, lx, lz);
    if (hh(t.x + i, t.y, 4061) < 0.85) itemAtW(c.z, c.rng, menu[i % menu.length], cx + wx, cy + wz, 0.79);
  });
}

defZone({
  key: 'homestead', name: 'The Homestead', W, H, depth: 3,
  blurb: 'A warm hallway, a runner, family photos with the faces wiped away. Dinner is on the table. Someone has laid a place for you.',
  gen: (z, s) => { generateHomestead(z, s); },
});
void ZoneBuilder;
