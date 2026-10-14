// 14 Alder Lane (64×64): the inside of the little house in the fields, which
// is far too big. A 1980s family home whose hallway keeps going, with a
// staircase up to a landing that loops back on itself past more and more
// nurseries; a locked attic; a closet that opens into a birthday party for
// thirty; and under the laundry, a basement that turns into Meridian
// concrete, a steel door with a keypad and stairs down to the laboratory.
//
// Levels are real floor heights: ground 0, upstairs +2.0, basement -2.0,
// each separated from the others by void so walls stay on their own floor.
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { defZone } from '../worldGraph';
import { registerShift } from '../shift';
import { Rot, FACE, setAnchor, shell, opening, settleVoidHeights, decalAt, scatterDecals, scatterLoot, put, liftWallObjects } from './dream_kit';

const UP = 2.0, BASE = -2.0;
/** the upstairs landing loops: x and x + LOOP look identical in [2..23] / [40..61] */
const LOOP = 38, TW = 12, TE = TW + LOOP + 1;
// circuits: 1 ground floor, 2 upstairs, 3 basement, 4 Room B (Meridian)

export function generateHouse(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  z.name = '14 Alder Lane';
  const bulb = (x: number, y: number, circuit: number, o: Record<string, any> = {}) => b.obj('light_bulb', x, y, 0, { circuit, ...o });
  const room = (name: string, type: string, x0: number, y0: number, x1: number, y1: number, floor: string, paper: string, circuit: number, h = 0, wall = 'drywall') => {
    shell(b, x0, y0, x1, y1, floor, wall, paper, h);
    return b.addRoom(name, type, x0, y0, x1, y1, { circuit });
  };

  // =====================================================================
  // FOYER — the front door back out to the fields (anchor first)
  // =====================================================================
  room('Foyer', 'foyer', 24, 55, 36, 61, 'wood', 'wall_house_floral', 1);
  b.door(30, 62, 0, 'door_red', { portal: 'r_fields_house' });
  b.portal({ id: 'r_fields_house', x: 30, y: 61, kind: 'door', to: 'fields', tx: 95, ty: 90, face: FACE.S, label: 'Go back outside' });
  setAnchor(b, 'p_fields_house', 30, 59, FACE.N, 3);
  b.window(26, 62, 0, { curtains: 'closed' }); b.window(34, 62, 0, { curtains: 'closed' });
  decalAt(z, 'carpet_rug', 30.5, 59, 2.6, 3.4, 0, 0xc8a080);
  b.obj('mirror', 34, 55, 0);
  put(b, f, 'clothing_rack', 36, 59, 1, { loot: 'wardrobe' });
  put(b, f, 'clothes_pile', 36, 61, 0, { loot: 'wardrobe' });
  const hallTable = put(b, f, 'nightstand', 36, 56, 1);
  f.onTop('lamp_table', hallTable, { circuit: 1 });
  put(b, f, 'plant_potted', 33, 61, 0);
  b.obj('photo_frames', 27, 55, 0, { v: 1 });
  bulb(30, 58, 1);
  // the coat closet: its door opens onto nothing, and through it, the party
  b.vwall(26, 59, 61, 'drywall'); b.hwall(24, 25, 59, 'drywall');
  for (let y = 59; y <= 61; y++) for (let x = 24; x <= 25; x++) z.floor[z.idx(x, y)] = 0;
  b.door(26, 60, 1, 'door_house', { portal: 'closet_big' });
  b.portal({ id: 'closet_big', x: 26, y: 60, kind: 'door', to: 'house', tx: 3, ty: 30, label: 'Step into the coat closet', anchor: 'big_room' });
  setAnchor(b, 'closet_back', 27, 60, FACE.E, 1);

  // =====================================================================
  // THE HALLWAY — far longer than the house; photos fade as it goes on
  // =====================================================================
  room('Hallway', 'hallway', 29, 23, 31, 54, 'wood', 'wall_house_stripe', 1);
  b.fillFloor(30, 23, 30, 54, 'carpet_red');
  opening(b, 29, 55, 0, 3, 'arch');
  for (let y = 25; y <= 53; y += 4) bulb(30, y, 1, { flicker: y < 33 ? 0.25 : 0, broken: y === 29 });
  for (let y = 24; y <= 53; y += 2) {
    if ([27, 37, 48, 49, 50, 44].some((d) => Math.abs(d - y) <= 0)) continue;
    b.obj('photo_frames', 29, y, 3, { v: (y * 7) % 6, blank: y < 34 });
  }
  b.obj('noticeboard', 29, 44, 3, { lore: 'note_house_rooms' });
  b.obj('clock_wall', 31, 42, 1);
  const console1 = put(b, f, 'nightstand', 31, 33, 1);
  f.onTop('lamp_table', console1, { circuit: 1, flicker: 0.1 });
  put(b, f, 'plant_potted', 31, 52, 0);
  // muddy paw prints wander up the runner
  for (let y = 53; y >= 24; y -= 1.6) decalAt(z, 'decal_footprints', 30.5 + Math.sin(y * 0.7) * 0.35, y, 0.7, 0.7, Math.PI / 2 + Math.sin(y) * 0.3, 0x8a6a4a, 0.8);

  // =====================================================================
  // WEST WING: nursery (shifts), study, living room; the party room
  // =====================================================================
  room('Nursery', 'nursery', 16, 23, 28, 32, 'carpet_kids', 'wall_kids', 1);
  b.door(29, 27, 1, 'door_white');
  registerShift(z, 'house_nursery', 16, 23, 28, 32, 3, (sb, srng, v) => stampNurseryGround(sb, srng, v));

  room('Study', 'study', 16, 33, 28, 43, 'wood', 'wall_paneling', 1);
  b.door(29, 37, 1, 'door_house');
  b.obj('door_nameplate', 29, 36, 3);
  const desk = put(b, f, 'desk_office', 21, 33, 0);
  f.onTop('computer', desk, { lore: 'laptop_meridian' });
  put(b, f, 'chair_office', 21, 34, 2);
  for (let y = 34; y <= 42; y++) if (y !== 38) put(b, f, 'bookshelf', 16, y, 3);
  put(b, f, 'filing_cabinet', 26, 43, 2); put(b, f, 'filing_cabinet', 27, 43, 2);
  put(b, f, 'armchair', 25, 39, 3);
  const st = put(b, f, 'nightstand', 26, 39, 0); f.onTop('globe', st);
  put(b, f, 'lamp_floor', 28, 34, 0);
  b.obj('whiteboard', 18, 33, 0); b.obj('noticeboard', 25, 33, 0);
  b.obj('painting', 23, 43, 2, { v: 2 });
  for (const [x, y] of [[19, 36], [20, 38], [22, 37], [24, 36], [18, 40], [23, 41]] as const) f.floorItem('paper', x, y);
  f.floorItem('notebook', 22, 35); f.floorItem('floppy_disk', 20, 35); f.floorItem('tape_cassette', 23, 35); f.floorItem('id_badge', 24, 34);
  decalAt(z, 'carpet_rug', 22, 38.5, 4, 3, 0, 0x9a6a48);
  bulb(22, 38, 1);

  room('Living Room', 'living', 16, 44, 28, 54, 'carpet_hotel', 'wall_house_floral', 1);
  opening(b, 29, 48, 1, 3, 'arch');
  b.window(18, 55, 0, { curtains: 'closed' }); b.window(21, 55, 0, { curtains: 'closed' });
  const tvs = put(b, f, 'tv_stand', 21, 45, 0); f.onTop('tv_crt', tvs, { on: true });
  put(b, f, 'sofa', 21, 51, 2);
  put(b, f, 'armchair', 18, 48, 3); put(b, f, 'armchair', 25, 48, 1);
  put(b, f, 'coffee_table', 21, 48, 0); put(b, f, 'coffee_table', 22, 48, 0);
  put(b, f, 'fireplace', 16, 46, 3);
  put(b, f, 'lamp_floor', 27, 53, 0); put(b, f, 'lamp_floor', 17, 53, 0);
  put(b, f, 'bookshelf', 19, 54, 2); put(b, f, 'bookshelf', 20, 54, 2);
  put(b, f, 'piano', 24, 54, 2);
  put(b, f, 'plant_potted', 28, 44, 0);
  b.obj('painting', 19, 44, 0, { v: 0 }); b.obj('photo_frames', 23, 44, 0, { v: 3 }); b.obj('clock_wall', 26, 44, 0);
  decalAt(z, 'carpet_rug', 21.5, 48.5, 4.4, 3, 0, 0xb87a5a);
  f.floorItem('tv_remote', 22, 51); f.floorItem('comic', 19, 50);
  bulb(22, 49, 1);
  b.door(16, 50, 1, 'door_house');

  // the party room: the living room again, enormous, set for thirty guests
  room('Living Room', 'party', 2, 23, 15, 54, 'carpet_hotel', 'wall_house_floral', 1);
  b.obj('party_banner', 7, 23, 0);
  for (let y = 27; y <= 37; y += 2) put(b, f, 'table_dining', 8, y, 1);
  for (let y = 27; y <= 38; y++) { b.obj('chair_wood', 7, y, 3); b.obj('chair_wood', 9, y, 1); }
  put(b, f, 'teddy_giant', 8, 26, 0);
  for (const [x, y] of [[3, 24], [4, 24], [3, 25], [13, 26], [12, 27]] as const) put(b, f, 'cardboard_box', x, y, 0, { loot: 'toy_box' });
  put(b, f, 'piano', 12, 23, 0);
  put(b, f, 'sofa', 7, 46, 0);
  const tv2 = put(b, f, 'tv_stand', 8, 53, 2); f.onTop('tv_crt', tv2, { on: true });
  put(b, f, 'lamp_floor', 3, 46, 0); put(b, f, 'lamp_floor', 14, 50, 0);
  for (let y = 26; y <= 52; y += 6) bulb(8, y, 1, { broken: y > 40, flicker: y > 30 ? 0.2 : 0 });
  for (let y = 28; y <= 50; y += 5) b.obj('photo_frames', 2, y, 3, { v: y % 6, blank: y > 38 });
  f.floorItem('photo_old', 8, 30); f.floorItem('candle', 8, 32); f.floorItem('juice_box', 8, 34);
  decalAt(z, 'carpet_rug', 8, 47.5, 4, 3, 0, 0xb87a5a);
  b.door(2, 30, 1, 'door_house', { portal: 'big_room_back' });
  b.portal({ id: 'big_room_back', x: 2, y: 30, kind: 'door', to: 'house', tx: 27, ty: 60, label: 'Go back through the closet', anchor: 'closet_back' });
  setAnchor(b, 'big_room', 3, 30, FACE.E, 1);

  // =====================================================================
  // EAST WING: dining, kitchen, laundry, WC, pantry, guest room (shifts)
  // =====================================================================
  room('Dining Room', 'dining', 32, 35, 37, 43, 'wood', 'wall_house_floral', 1);
  opening(b, 32, 38, 1, 3, 'arch');
  put(b, f, 'table_dining', 34, 38, 1);
  for (const y of [38, 39]) { put(b, f, 'chair_wood', 33, y, 3); put(b, f, 'chair_wood', 35, y, 1); }
  put(b, f, 'chair_wood', 34, 37, 0); put(b, f, 'chair_wood', 34, 40, 2);
  put(b, f, 'dresser', 35, 35, 0, { loot: 'kitchen_cabinet' });
  b.obj('painting', 34, 35, 0, { v: 4 });
  bulb(34, 39, 1);

  room('Kitchen', 'kitchen', 32, 44, 45, 54, 'tile_kitchen', 'wall_kitchen', 1);
  opening(b, 32, 47, 1, 3, 'arch');
  opening(b, 34, 44, 0, 3, 'arch');
  for (let x = 37; x <= 45; x++) {
    if (x === 41) continue;
    const key = x === 39 ? 'stove' : x === 43 ? 'counter_sink' : x === 45 ? 'fridge' : 'counter_kitchen';
    const o = put(b, f, key, x, 44, 0);
    if (key !== 'fridge') b.obj('kitchen_cabinet_wall', x, 44, 0);
    if (x === 37) f.onTop('microwave', o); if (x === 38) f.onTop('toaster', o); if (x === 44) f.onTop('coffee_maker', o);
  }
  put(b, f, 'table_dining', 37, 49, 0);
  put(b, f, 'chair_wood', 37, 48, 2); put(b, f, 'chair_wood', 38, 48, 2); put(b, f, 'chair_wood', 37, 50, 0); put(b, f, 'chair_wood', 38, 50, 0);
  put(b, f, 'trash_can', 33, 54, 0);
  b.obj('clock_wall', 33, 44, 0);
  b.obj('light_fluoro', 41, 46, 0, { circuit: 1, flicker: 0.08 });
  bulb(37, 51, 1);
  f.floorItem('bowl', 38, 49); f.floorItem('mug', 37, 49);

  room('Laundry', 'laundry', 38, 35, 45, 43, 'linoleum', 'wall_bathroom', 1);
  b.door(41, 44, 0, 'door_house');
  b.door(41, 35, 0, 'door_house');
  put(b, f, 'counter_sink', 38, 35, 0);
  put(b, f, 'water_heater', 45, 35, 0);
  for (const [x, y] of [[39, 39], [43, 42]] as const) put(b, f, 'laundry_basket', x, y, 0);
  put(b, f, 'clothes_pile', 40, 42, 0, { loot: 'wardrobe' }); put(b, f, 'clothes_pile', 38, 43, 0, { loot: 'wardrobe' });
  put(b, f, 'shelf_metal', 45, 37, 1, { loot: 'garage_shelf' });
  put(b, f, 'drying_rack', 42, 37, 0); put(b, f, 'mop_bucket', 44, 43, 0);
  bulb(41, 39, 1, { flicker: 0.1 });

  room('Bathroom', 'wc', 32, 23, 36, 27, 'tile_white', 'wall_bathroom', 1);
  b.door(32, 25, 1, 'door_house');
  put(b, f, 'sink_bathroom', 33, 23, 0); b.obj('mirror', 33, 23, 0);
  put(b, f, 'toilet', 35, 23, 0); b.obj('medicine_cabinet', 35, 23, 0);
  b.obj('towel_rack', 36, 26, 1);
  bulb(34, 25, 1);

  room('Pantry', 'pantry', 32, 28, 36, 34, 'linoleum', 'wall_kitchen', 1);
  b.door(32, 31, 1, 'door_house');
  for (let x = 33; x <= 36; x++) put(b, f, 'shelf_metal', x, 28, 0, { loot: 'pantry' });
  for (let y = 30; y <= 33; y++) put(b, f, 'shelf_metal', 36, y, 1, { loot: 'pantry' });
  put(b, f, 'freezer_chest', 33, 34, 2);
  bulb(34, 31, 1, { flicker: 0.3 });

  room('Guest Room', 'guest', 37, 23, 45, 34, 'carpet_office', 'wall_house_stripe', 1);
  registerShift(z, 'house_guest', 37, 23, 45, 34, 3, (sb, srng, v) => stampGuest(sb, srng, v));

  // =====================================================================
  // THE STAIRS — ten steps up to a landing that does not end
  // =====================================================================
  for (let y = 14; y <= 22; y++) b.fillFloor(29, y, 31, y, y === 14 ? 'wood' : 'carpet_red', UP - (y - 13) * 0.2);
  b.vwall(29, 14, 22, 'drywall'); b.vwall(32, 14, 22, 'drywall');
  b.paper(29, 14, 31, 22, 'wall_house_stripe');
  opening(b, 29, 23, 0, 3);
  b.addRoom('Stairs', 'stairs', 29, 14, 31, 22, { circuit: 2 });
  bulb(30, 18, 2, { flicker: 0.15 });
  b.obj('photo_frames', 29, 17, 3, { v: 5 }); b.obj('photo_frames', 29, 20, 3, { v: 2 });

  upstairs(b, f, rng);
  basement(b, f, rng);

  // ---------------------------------------------------------------------
  // dust, stains and wear
  scatterDecals(f, rng, 2, 23, 45, 61, 70, [['decal_stain_water', 3], ['decal_stain_dark', 2], ['decal_crack', 1], ['decal_footprints', 1]], 0.7, 1.4, (x, y) => !(z.flags[z.idx(x, y)] & TF.SHIFT));
  scatterLoot(f, rng, 'floor_generic', 2, 23, 45, 61, 10, (x, y) => !(z.flags[z.idx(x, y)] & TF.SHIFT));
  settleVoidHeights(z);
  liftWallObjects(z);
  for (const c of [1, 2, 3, 4]) z.power.set(c, true);
  z.env = {
    ...z.env,
    ambient: 0x3c3226, ambientI: 0.5, fog: 0x1e160e, fogNear: 7, fogFar: 17, void: 0x0a0705, temp: 21,
    sky: false, grade: 'house', reverb: 'small', ambience: 'house', music: 'musicbox',
  };
  z.spawnTable = [['plushkin', 2], ['lamplighter', 2], ['echo', 1], ['davenport', 1]];
  z.creatureCap = 5;
  z.meta.terminalLore = ['terminal', 'laptop_meridian'];
  return b;
}

// ---------------------------------------------------------------------------
// upstairs (h +2.0): the looping landing, Mia's room, the attic, bathroom
// ---------------------------------------------------------------------------
function upstairs(b: ZoneBuilder, f: Furnisher, rng: Rng) {
  const z = b.z;
  const bulb = (x: number, y: number, o: Record<string, any> = {}) => b.obj('light_bulb', x, y, 0, { circuit: 2, ...o });
  // the landing corridor
  b.fillFloor(2, 11, 61, 13, 'wood', UP);
  b.fillFloor(2, 12, 61, 12, 'carpet_red', UP);
  b.roomWalls(2, 11, 61, 13, 'drywall');
  b.paper(2, 11, 61, 13, 'wall_house_stripe');
  b.addRoom('Landing', 'landing', 2, 11, 61, 13, { circuit: 2 });
  opening(b, 29, 14, 0, 3);
  // identical stretches either side of the stairs (period LOOP)
  for (const x0 of [2, 2 + LOOP]) {
    const X = (r: number) => x0 + r;
    for (const r of [3, 12, 18]) b.door(X(r), 11, 0, 'door_white');
    for (const r of [5, 16]) b.door(X(r), 14, 0, 'door_white');
    for (const r of [1, 7, 9, 15, 20]) b.obj('photo_frames', X(r), 11, 0, { v: r % 6, blank: r === 15 });
    [1, 5, 9, 13, 17, 21].forEach((r) => bulb(X(r), 12, { broken: r === 1 || r === 5 || r === 21, flicker: r === 13 ? 0.2 : 0 }));
    const t = b.obj('nightstand', X(8), 11, 0);
    if (t) f.onTop('lamp_table', t, { circuit: 2 });
    b.obj('plant_potted', X(0), 13, 0);
    decalAt(z, 'decal_stain_water', X(11) + 0.5, 12.6, 1.4, 1.1, 0.4);
  }
  // the loop: walk far enough either way and you are back at the top of the stairs
  for (let y = 11; y <= 13; y++) {
    b.portal({ id: `loop_landing_w${y}`, x: TW, y, kind: 'loop', to: 'house', tx: TW + LOOP, ty: y, loopDx: LOOP, hidden: true });
    b.portal({ id: `loop_landing_e${y}`, x: TE, y, kind: 'loop', to: 'house', tx: TE - LOOP, ty: y, loopDx: -LOOP, hidden: true });
  }
  // the unique stretch around the stair head
  for (const x of [30, 34]) bulb(x, 12); // kept away from the identical stretches
  b.obj('photo_frames', 25, 11, 0, { v: 4 }); b.obj('photo_frames', 32, 11, 0, { v: 0 }); b.obj('painting', 38, 11, 0, { v: 5 });
  put(b, f, 'plant_potted', 24, 13, 0);

  // north rooms behind the identical doors: nurseries that multiply
  for (const x0 of [2, 2 + LOOP]) {
    b.fillFloor(x0, 2, x0 + 21, 10, 'carpet_kids', UP);
    b.roomWalls(x0, 2, x0 + 21, 10, 'drywall');
    b.addRoom('Nursery', 'nursery', x0, 2, x0 + 21, 10, { circuit: 2 });
    registerShift(z, x0 === 2 ? 'house_up_north_a' : 'house_up_north_b', x0, 2, x0 + 21, 10, 3, (sb, srng, v) => stampNurseryStrip(sb, srng, v, x0), { initial: x0 === 2 ? 0 : 2 });
    b.fillFloor(x0, 14, x0 + 21, 20, 'carpet_office', UP);
    b.roomWalls(x0, 14, x0 + 21, 20, 'drywall');
    b.addRoom('Bedroom', 'bedroom', x0, 14, x0 + 21, 20, { circuit: 2 });
    registerShift(z, x0 === 2 ? 'house_up_south_a' : 'house_up_south_b', x0, 14, x0 + 21, 20, 3, (sb, srng, v) => stampSouthStrip(sb, srng, v, x0), { initial: x0 === 2 ? 0 : 1 });
  }

  // Mia's room
  shell(b, 24, 2, 31, 10, 'carpet_kids', 'drywall', 'wall_kids', UP);
  b.addRoom("Mia's Room", 'mia_room', 24, 2, 31, 10, { circuit: 2 });
  b.door(28, 11, 0, 'door_white', { open: true });
  b.window(27, 2, 0, { curtains: 'closed' });
  put(b, f, 'bed_single', 24, 3, 0);
  const ns = put(b, f, 'nightstand', 25, 3, 0);
  f.onTop('lamp_table', ns, { circuit: 0 });
  b.light(25.5, 3.5, 'lamp', { color: 0xffb8d8, intensity: 0.45, radius: 3.2, y: 0.7, circuit: 0 });
  put(b, f, 'toy_box', 26, 2, 0); put(b, f, 'dollhouse', 29, 2, 0); put(b, f, 'bookshelf', 31, 2, 0, { loot: 'kids_room' });
  put(b, f, 'rocking_horse', 29, 7, 3); put(b, f, 'teddy_giant', 31, 9, 1);
  put(b, f, 'dresser', 24, 9, 3, { loot: 'kids_room' }); put(b, f, 'wardrobe', 24, 7, 3);
  put(b, f, 'desk_school', 27, 8, 0);
  b.obj('poster', 30, 2, 0, { v: 2 }); b.obj('painting', 25, 2, 0, { v: 0 });
  f.floorItem('journal', 25, 5, { lore: 'diary_mia' });
  f.floorItem('crayons', 27, 9); f.floorItem('doll', 28, 5); f.floorItem('teddy_bear', 24, 5);
  decalAt(z, 'carpet_rug', 27.5, 6, 3, 2.4, 0, 0xf0b8d0);
  decalAt(z, 'decal_chalk_drawing', 30.5, 5.5, 1.2, 1.2, 0.4, 0xffd0e8);
  bulb(28, 6, { broken: true });

  // the attic: a locked door, three steps up, the things he kept
  b.door(36, 11, 0, 'door_wood', { locked: true, keyId: 'alder_attic' });
  b.fillFloor(35, 10, 37, 10, 'wood', UP + 0.2);
  b.fillFloor(35, 9, 37, 9, 'wood', UP + 0.4);
  b.vwall(35, 9, 10, 'wood_built'); b.vwall(38, 9, 10, 'wood_built');
  shell(b, 33, 2, 39, 8, 'wood', 'wood_built', 'wall_planks', UP + 0.6);
  opening(b, 35, 9, 0, 3);
  b.paper(35, 9, 37, 10, 'wall_planks');
  b.addRoom('Attic', 'attic', 33, 2, 39, 10, { circuit: 2, temp: 26 });
  put(b, f, 'cardboard_box', 33, 2, 0); put(b, f, 'cardboard_stack', 34, 2, 0); put(b, f, 'crate_wood', 39, 2, 0);
  put(b, f, 'wardrobe', 39, 4, 1); put(b, f, 'rocking_chair', 37, 6, 2, { yaw: 0.4 });
  put(b, f, 'crib', 33, 7, 3); put(b, f, 'chair_stack', 39, 8, 0); put(b, f, 'dollhouse', 33, 5, 3);
  b.obj('mirror', 37, 2, 0); b.obj('painting', 35, 2, 0, { v: 4 });
  f.floorItem('note', 36, 4, { lore: 'card_birthday' });
  f.floorItem('note', 35, 5, { lore: 'letter_hale_mia' });
  f.floorItem('photo_old', 37, 4); f.floorItem('camera_polaroid', 34, 4);
  bulb(36, 5, { flicker: 0.25 });

  // linen closet + bathroom either side of the stairs
  shell(b, 24, 14, 27, 20, 'wood', 'drywall', 'wall_house_stripe', UP);
  b.addRoom('Linen Closet', 'closet', 24, 14, 27, 20, { circuit: 2 });
  b.door(26, 14, 0, 'door_white');
  put(b, f, 'dresser', 24, 16, 3, { loot: 'bedroom_dresser' }); put(b, f, 'dresser', 24, 17, 3, { loot: 'bedroom_dresser' });
  put(b, f, 'laundry_basket', 27, 20, 0); put(b, f, 'wardrobe', 24, 20, 3);
  f.floorItem('blanket', 26, 18); f.floorItem('pillow_item', 25, 19);
  bulb(26, 17, { flicker: 0.3 });
  shell(b, 33, 14, 39, 20, 'tile_white', 'drywall', 'wall_bathroom', UP);
  b.addRoom('Bathroom', 'bathroom', 33, 14, 39, 20, { circuit: 2 });
  b.door(36, 14, 0, 'door_white');
  put(b, f, 'sink_bathroom', 34, 14, 0); b.obj('mirror', 34, 14, 0); b.obj('medicine_cabinet', 33, 14, 0);
  put(b, f, 'toilet', 38, 14, 0);
  put(b, f, 'bathtub', 33, 20, 2);
  b.obj('towel_rack', 39, 17, 1);
  put(b, f, 'laundry_basket', 39, 20, 0);
  f.floorItem('toy_rubber_duck', 34, 19); f.floorItem('soap', 34, 15); f.floorItem('toothbrush', 35, 15);
  decalAt(z, 'decal_puddle', 34.5, 18.5, 1.6, 1.3, 0.3);
  bulb(36, 17);
  void rng;
}

// ---------------------------------------------------------------------------
// basement (h -2.0): stairs down from the laundry, furnace, storage, Room B
// ---------------------------------------------------------------------------
function basement(b: ZoneBuilder, f: Furnisher, rng: Rng) {
  const z = b.z;
  const bulb = (x: number, y: number, c: number, o: Record<string, any> = {}) => b.obj('light_bulb', x, y, 0, { circuit: c, ...o });
  // the stairs: out of the laundry, six steps down
  b.door(46, 40, 1, 'door_wood');
  const steps = [-0.3, -0.7, -1.0, -1.3, -1.7, -2.0];
  steps.forEach((h, i) => b.fillFloor(46 + i, 39, 46 + i, 41, 'concrete', h));
  b.hwall(46, 51, 39, 'cinder'); b.hwall(46, 51, 42, 'cinder');
  b.paper(46, 39, 51, 41, 'wall_cinder');
  b.addRoom('Basement Stairs', 'basement_stairs', 46, 39, 51, 41, { circuit: 3 });
  bulb(48, 40, 3, { flicker: 0.2 });

  // stair foot / landing
  shell(b, 52, 38, 61, 42, 'concrete', 'cinder', 'wall_cinder', BASE);
  b.addRoom('Basement', 'basement', 52, 38, 61, 42, { circuit: 3 });
  opening(b, 52, 39, 1, 3);
  bulb(56, 40, 3);
  put(b, f, 'cardboard_box', 61, 38, 0); put(b, f, 'chair_stack', 61, 42, 0);

  // furnace room
  shell(b, 52, 43, 61, 52, 'concrete', 'cinder', 'wall_cinder', BASE);
  b.addRoom('Furnace Room', 'furnace', 52, 43, 61, 52, { circuit: 3, temp: 25 });
  opening(b, 54, 43, 0, 5);
  put(b, f, 'boiler', 59, 44, 0); put(b, f, 'water_heater', 52, 44, 3);
  put(b, f, 'shelf_metal', 52, 47, 3, { loot: 'garage_shelf' }); put(b, f, 'shelf_metal', 52, 48, 3, { loot: 'garage_shelf' });
  put(b, f, 'workbench', 56, 52, 2); put(b, f, 'tool_chest', 61, 50, 1); put(b, f, 'freezer_chest', 58, 52, 2);
  b.obj('fuse_box', 55, 43, 0); b.obj('pipes_cluster', 57, 43, 0);
  f.floorItem('flashlight', 57, 49); f.floorItem('battery', 58, 49);
  bulb(56, 47, 3, { flicker: 0.1 });

  // storage: the deep end of the basement
  shell(b, 52, 53, 61, 61, 'concrete', 'cinder', 'wall_cinder', BASE);
  b.addRoom('Storage', 'storage', 52, 53, 61, 61, { circuit: 3 });
  b.door(56, 53, 0, 'door_wood');
  for (const [x, y] of [[52, 54], [52, 55], [53, 54], [61, 58], [61, 59], [60, 61]] as const) put(b, f, rng.chance(0.5) ? 'cardboard_stack' : 'cardboard_box', x, y, 0);
  put(b, f, 'toy_box', 55, 61, 2); put(b, f, 'crib', 58, 56, 0); put(b, f, 'rocking_horse', 57, 58, 1);
  put(b, f, 'mannequin', 53, 59, 3); put(b, f, 'wardrobe', 52, 61, 3);
  bulb(56, 57, 3, { flicker: 0.4 });

  // the corridor to Room B, and the steel door with its keypad
  b.fillFloor(55, 31, 58, 37, 'concrete', BASE);
  b.vwall(55, 31, 37, 'concrete'); b.vwall(59, 31, 37, 'concrete');
  b.paper(55, 31, 58, 37, 'wall_concrete');
  opening(b, 55, 38, 0, 4);
  b.addRoom('Corridor', 'basement_corridor', 55, 31, 58, 37, { circuit: 3 });
  bulb(56, 34, 3, { flicker: 0.5 });
  shell(b, 52, 23, 61, 30, 'concrete', 'concrete', 'wall_concrete', BASE);
  b.addRoom('Room B', 'meridian', 52, 23, 61, 30, { circuit: 4, temp: 17 });
  b.door(56, 31, 0, 'door_metal', { locked: true, sign: 'danger' });
  const keypad = { code: '061480', codeFlag: 'lab_code', door: [56, 31, 0] };
  b.obj(f.has('keypad') ? 'keypad' : 'fuse_box', 57, 31, 0, { ...keypad });
  b.obj(f.has('keypad') ? 'keypad' : 'fuse_box', 57, 30, 2, { ...keypad });
  // stairs further down: Facility 4
  b.obj('staircase_down', 56, 24, 0, { portal: 'p_house_lab' });
  b.portal({ id: 'p_house_lab', x: 56, y: 24, kind: 'stairs_down', to: 'lab', tx: 20, ty: 20, label: 'Go down to Facility 4', locked: 'flag:lab_code' });
  setAnchor(b, 'r_house_lab', 56, 27, FACE.S, 2);
  put(b, f, 'hazard_barrier', 55, 25, 0); put(b, f, 'hazard_barrier', 57, 25, 0);
  for (const y of [24, 25, 26]) decalAt(z, 'decal_arrow_floor', 56.5, y + 1.6, 0.8, 0.8, -Math.PI / 2, 0xe8c040, 0.7);
  put(b, f, 'filing_cabinet', 52, 23, 0); put(b, f, 'filing_cabinet', 53, 23, 0);
  put(b, f, 'cctv_monitors', 59, 23, 0); put(b, f, 'chair_office', 59, 24, 2, { yaw: 0.6 });
  put(b, f, 'electrical_cabinet', 61, 27, 1); put(b, f, 'server_rack', 61, 28, 1);
  put(b, f, 'lab_cabinet', 52, 28, 3);
  f.floorItem('paper', 54, 26); f.floorItem('paper', 58, 27); f.floorItem('id_badge', 53, 27);
  b.obj('light_fluoro', 56, 27, 0, { circuit: 4, flicker: 0.12 });
  b.obj('light_fluoro', 59, 25, 0, { circuit: 4 });
  b.light(56.5, 24.5, 'emergency', { circuit: 0, intensity: 0.4, radius: 3.5, y: 2.2 });

  scatterDecals(f, rng, 52, 23, 61, 61, 40, [['decal_crack', 3], ['decal_mold', 2], ['decal_stain_dark', 2], ['decal_puddle', 1]], 0.7, 1.6);
}

// ---------------------------------------------------------------------------
// shifting rooms
// ---------------------------------------------------------------------------
function nursery(b: ZoneBuilder, x0: number, y0: number, x1: number, y1: number, h: number, rng: Rng, big = false) {
  const obj = (k: string, x: number, y: number, r: Rot = 0, s: Record<string, any> = {}) => { if (b.free(x, y)) return b.obj(k, x, y, r, s); return null; };
  obj('crib', x0 + 1, y0, 0);
  if (big) { obj('crib', x0 + 2, y0, 0); obj('crib', x0 + 3, y0, 0); }
  obj('rocking_chair', x1 - 1, y0 + 1, 2, { yaw: rng.float(-0.4, 0.4) });
  obj('toy_box', x0, y1, 3); obj('dresser', x1, y1, 1, { loot: 'kids_room' });
  const ns = obj('nightstand', x0, y0, 0);
  if (ns) b.obj('lamp_table', ns.x, ns.y, 0, { y: 0.58, circuit: 2 });
  b.obj('light_bulb', Math.floor((x0 + x1) / 2), Math.floor((y0 + y1) / 2), 0, { circuit: 2, flicker: rng.chance(0.3) ? 0.2 : 0 });
  void h;
}

/** three nurseries / one long nursery / three nearly-empty rooms */
function stampNurseryStrip(b: ZoneBuilder, rng: Rng, v: number, x0: number) {
  const y0 = 2, y1 = 10;
  b.fillFloor(x0, y0, x0 + 21, y1, v === 2 ? 'wood' : 'carpet_kids', UP);
  b.paper(x0, y0, x0 + 21, y1, v === 2 ? 'wall_house_stripe' : 'wall_kids');
  const rooms: [number, number][] = v === 1 ? [[x0, x0 + 21]] : [[x0, x0 + 6], [x0 + 7, x0 + 14], [x0 + 15, x0 + 21]];
  if (v !== 1) { b.vwall(x0 + 7, y0, y1, 'drywall'); b.vwall(x0 + 15, y0, y1, 'drywall'); }
  if (v === 0) rooms.forEach(([a, c], i) => nursery(b, a, y0, c, y1, UP, rng, i === 1));
  else if (v === 1) {
    for (let x = x0 + 1; x <= x0 + 20; x += 2) b.obj('crib', x, y0, 0);
    for (let x = x0 + 3; x <= x0 + 19; x += 8) b.obj('rocking_horse', x, y0 + 5, rng.int(0, 3) as Rot);
    for (let x = x0 + 4; x <= x0 + 18; x += 7) b.obj('light_bulb', x, 6, 0, { circuit: 2, flicker: 0.15 });
  } else {
    const [a, , c] = [rooms[0], rooms[1], rooms[2]];
    b.obj('rocking_horse', a[0] + 3, y0 + 4, 0);
    b.obj('bed_double', rooms[1][0] + 3, y0 + 3, 0); b.obj('teddy_giant', rooms[1][0] + 3, y0 + 5, 0);
    b.obj('tv_static', c[0] + 3, y0 + 3, 0); b.obj('armchair', c[0] + 3, y0 + 6, 2);
    for (const [r0, r1] of rooms) b.obj('light_bulb', Math.floor((r0 + r1) / 2), 6, 0, { circuit: 2, broken: rng.chance(0.5) });
  }
  liftWallObjects(b.z, x0, 2, x0 + 21, 10);
}

/** guest bedroom + study / two more nurseries / boxes and a room of photos */
function stampSouthStrip(b: ZoneBuilder, rng: Rng, v: number, x0: number) {
  const y0 = 14, y1 = 20;
  b.fillFloor(x0, y0, x0 + 21, y1, v === 1 ? 'carpet_kids' : 'carpet_office', UP);
  b.paper(x0, y0, x0 + 21, y1, v === 1 ? 'wall_kids' : 'wall_house_stripe');
  b.vwall(x0 + 10, y0, y1, 'drywall');
  const A: [number, number] = [x0, x0 + 9], B: [number, number] = [x0 + 10, x0 + 21];
  if (v === 0) {
    b.obj('bed_double', A[0] + 1, y1 - 1, 0); b.obj('nightstand', A[0], y1, 0); b.obj('wardrobe', A[1], y1, 1);
    b.obj('dresser', A[1], y0 + 2, 1, { loot: 'bedroom_dresser' });
    b.obj('desk_office', B[0] + 4, y1, 2); b.obj('chair_office', B[0] + 4, y1 - 1, 0);
    b.obj('bookshelf', B[1], y0 + 2, 1); b.obj('bookshelf', B[1], y0 + 3, 1); b.obj('sofa', B[0] + 1, y0 + 2, 0);
  } else if (v === 1) {
    nursery(b, A[0], y0 + 1, A[1], y1, UP, rng);
    nursery(b, B[0], y0 + 1, B[1], y1, UP, rng, true);
  } else {
    for (let i = 0; i < 9; i++) { const x = A[0] + rng.int(0, 9), y = rng.int(y0 + 1, y1); if (b.free(x, y)) b.obj(rng.chance(0.5) ? 'cardboard_stack' : 'cardboard_box', x, y, 0); }
    for (let x = B[0] + 1; x <= B[1] - 1; x += 2) b.obj('photo_frames', x, y1, 2, { v: x % 6, blank: true });
    b.obj('chair_wood', B[0] + 5, y0 + 3, 2);
  }
  for (const [a, c] of [A, B]) b.obj('light_bulb', Math.floor((a + c) / 2), 17, 0, { circuit: 2, flicker: v === 2 ? 0.4 : 0 });
  liftWallObjects(b.z, x0, 14, x0 + 21, 20);
}

/** the ground-floor nursery: as it was / a room of cribs / empty but for the horse */
function stampNurseryGround(b: ZoneBuilder, rng: Rng, v: number) {
  const x0 = 16, y0 = 23, x1 = 28, y1 = 32;
  b.fillFloor(x0, y0, x1, y1, v === 2 ? 'wood' : 'carpet_kids');
  b.paper(x0, y0, x1, y1, 'wall_kids');
  if (v === 0) {
    nursery(b, x0 + 1, y0, x1 - 1, y1, 0, rng);
    b.obj('toy_box', x0 + 6, y1, 2); b.obj('dollhouse', x0, y0 + 4, 3); b.obj('rocking_horse', x0 + 6, y0 + 5, 1);
    b.obj('photo_frames', x0 + 4, y0, 0, { v: 3 });
  } else if (v === 1) {
    for (let y = y0 + 1; y <= y1 - 1; y += 3) for (let x = x0 + 1; x <= x1 - 1; x += 3) b.obj('crib', x, y, 0, { yaw: rng.float(-0.1, 0.1) });
    b.obj('light_bulb', x0 + 6, y0 + 4, 0, { circuit: 1, flicker: 0.3 });
  } else {
    b.obj('rocking_horse', x0 + 6, y0 + 4, 1);
    b.obj('light_bulb', x0 + 6, y0 + 4, 0, { circuit: 1 });
  }
}

/** the guest room: guest bedroom / sewing room / the clock room */
function stampGuest(b: ZoneBuilder, rng: Rng, v: number) {
  const x0 = 37, y0 = 23, x1 = 45, y1 = 34;
  b.fillFloor(x0, y0, x1, y1, v === 2 ? 'wood' : 'carpet_office');
  b.paper(x0, y0, x1, y1, v === 1 ? 'wall_house_floral' : 'wall_house_stripe');
  if (v === 0) {
    b.obj('bed_double', x0 + 1, y0, 0); b.obj('nightstand', x0, y0, 0); b.obj('nightstand', x0 + 3, y0, 0);
    b.obj('wardrobe', x1, y0 + 1, 1); b.obj('dresser', x1, y0 + 4, 1, { loot: 'bedroom_dresser' });
    b.obj('armchair', x0 + 1, y1 - 2, 0); b.obj('lamp_floor', x0, y1 - 2, 0);
  } else if (v === 1) {
    b.obj('table_dining', x0 + 3, y0 + 4, 0); b.obj('chair_wood', x0 + 3, y0 + 5, 0);
    b.obj('mannequin', x1 - 1, y0 + 1, 2); b.obj('mannequin', x1 - 1, y0 + 3, 2);
    b.obj('clothing_rack', x0, y0 + 1, 3, { loot: 'wardrobe' }); b.obj('clothes_pile', x0 + 1, y1, 0, { loot: 'wardrobe' });
  } else {
    for (let x = x0; x <= x1; x++) b.obj('clock_wall', x, y0, 0);
    for (let y = y0 + 1; y <= y1; y += 1) b.obj('clock_wall', x0, y, 3);
    b.obj('chair_wood', x0 + 4, y0 + 6, 2);
  }
  b.obj('light_bulb', x0 + 4, y0 + 5, 0, { circuit: 1, flicker: v === 2 ? 0.3 : 0.05 });
  void rng;
}

defZone({
  key: 'house', name: '14 Alder Lane', W: 64, H: 64, depth: 2,
  blurb: 'Smells of carpet, toast and somebody else\'s family. The hallway is longer than the house.',
  gen: (z, s) => { generateHouse(z, s); },
});
