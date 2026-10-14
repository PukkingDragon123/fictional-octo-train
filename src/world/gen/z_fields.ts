// The Fields (192×192, outdoor): an endless summer afternoon remembered by a
// child. Soft grass to the fog, a creek lined with pool tiles, power lines
// marching off to nowhere, one small house with a red door — and, far away,
// the same house again with no door at all. A TV plays in the grass, a crowd
// of folding chairs faces nothing, and a road leaves for the suburbs.
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, fbm2 } from '../../core/rng';
import { defZone } from '../worldGraph';
import { Rot, FACE, setAnchor, shell, decalAt, scatterDecals, put } from './dream_kit';

const W = 192, H = 192;

export function generateFields(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  z.name = 'The Fields';
  b.fillFloor(0, 0, W - 1, H - 1, 'grass_dream');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (rng.chance(0.18)) b.floorVar(x, y, 1);
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);
  // keep[] marks tiles reserved for landmarks (no scattered foliage)
  const keep = new Uint8Array(W * H);
  const reserve = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (z.inb(x, y)) keep[z.idx(x, y)] = 1; };

  // the edge of the world is a low wooden fence, half lost in the haze
  b.roomWalls(3, 3, 188, 188, 'fence_wood');
  reserve(0, 0, W - 1, 4); reserve(0, H - 5, W - 1, H - 1); reserve(0, 0, 4, H - 1); reserve(W - 5, 0, W - 1, H - 1);

  // =====================================================================
  // the red door back to Level 0, alone in the grass
  // =====================================================================
  const door = put(b, f, 'door_freestanding', 52, 66, 0, { portal: 'r_fields' });
  if (door) door.tint = 0xe06850; // painted red, like the one in the drawing
  b.portal({ id: 'r_fields', x: 52, y: 66, kind: 'door', to: 'lobby', tx: 80, ty: 80, label: 'Open the red door' });
  setAnchor(b, 'p_fields', 52, 68, FACE.S, 4);
  b.addRoom('The Red Door', 'red_door', 49, 63, 55, 69, { outdoor: true });
  reserve(48, 62, 56, 70);
  for (const [x, y] of [[50, 66], [54, 67], [51, 64]] as const) put(b, f, 'flowers', x, y, 0);

  // =====================================================================
  // the creek (tiled like a pool, because of course it is) and the pond
  // =====================================================================
  const creekX = (y: number) => Math.round(30 + 5 * Math.sin(y / 19) + 2.5 * Math.sin(y / 7.3 + 1));
  for (let y = 4; y <= 188; y++) {
    const cx = creekX(y);
    b.fillFloor(cx - 1, y, cx + 1, y, 'water_shallow', -0.1);
    for (const s of [-2, 2]) if (rng.chance(0.45)) b.fillFloor(cx + s, y, cx + s, y, rng.chance(0.6) ? 'sand' : 'dirt');
    reserve(cx - 2, y, cx + 2, y);
  }
  for (let y = 138; y <= 154; y++) for (let x = 20; x <= 46; x++) {
    const d = Math.hypot((x - 33) / 9, (y - 146) / 6);
    if (d < 1) b.fillFloor(x, y, x, y, d < 0.55 ? 'water_deep' : 'water_shallow', d < 0.55 ? -0.5 : -0.1);
    else if (d < 1.2 && rng.chance(0.5)) b.fillFloor(x, y, x, y, 'sand');
    if (d < 1.25) reserve(x, y, x, y);
  }
  b.addRoom('The Pond', 'pond', 23, 140, 43, 152, { outdoor: true });
  for (const [x, y] of [[24, 142], [42, 150], [27, 152]] as const) put(b, f, rng.chance(0.5) ? 'rock' : 'log', x, y, rng.int(0, 3) as Rot);
  put(b, f, 'rock_large', 44, 141, 0);
  for (const by of [40, 118]) {
    const cx = creekX(by);
    b.fillFloor(cx - 2, by, cx + 2, by + 2, 'wood');
    b.hwall(cx - 2, cx + 2, by, 'railing'); b.hwall(cx - 2, cx + 2, by + 3, 'railing');
    reserve(cx - 4, by - 1, cx + 4, by + 3);
  }
  for (let i = 0; i < 40; i++) {
    const y = rng.int(6, 186), x = creekX(y) + (rng.chance(0.5) ? -2 : 2);
    f.decal('decal_footprints', x, y, 1, 1);
  }

  // =====================================================================
  // the road: asphalt from nowhere to the edge of the map (→ suburbs)
  // =====================================================================
  const RY0 = 103, RY1 = 108, RX0 = 60;
  b.fillFloor(RX0, RY0, W - 1, RY0, 'sidewalk');
  b.fillFloor(RX0, RY0 + 1, W - 1, RY1 - 1, 'asphalt');
  b.fillFloor(RX0, RY1, W - 1, RY1, 'sidewalk');
  reserve(RX0 - 2, RY0 - 2, W - 1, RY1 + 2);
  b.addRoom('Alder Lane', 'road', RX0, RY0, W - 1, RY1, { outdoor: true });
  for (let x = RX0 + 2; x < W - 2; x += 4) decalAt(z, 'decal_parking_line', x + 1, 106, 2, 0.2, 0, 0xf0c040);
  for (let y = RY0; y <= RY1; y++) b.gap(189, y, 1);
  for (let y = RY0; y <= RY1; y++) b.portal({ id: 'p_fields_road', x: 190, y, kind: 'walk', to: 'suburbs', tx: 8, ty: 100, face: FACE.E, label: 'Follow the road' });
  setAnchor(b, 'r_fields_road', 185, 105, FACE.W, 3);
  put(b, f, 'traffic_cone', RX0 + 1, 105, 0); put(b, f, 'traffic_cone', RX0 + 1, 106, 0);
  // power poles along the north verge, street lamps along the south
  for (let x = 64; x <= 186; x += 9) if (Math.abs(x - 95) > 2 && Math.abs(x - 98) > 1) put(b, f, 'power_pole', x, 101, 0);
  for (const x of [72, 104, 136, 168, 186]) put(b, f, 'street_light', x, 109, 2);
  put(b, f, 'billboard', 124, 99, 0);
  put(b, f, 'bus_stop', 150, 109, 2);
  put(b, f, 'trash_can_outdoor', 153, 109, 0);
  put(b, f, 'fire_hydrant', 113, 102, 0);
  put(b, f, 'newspaper_box', 147, 109, 2);
  decalAt(z, 'decal_hopscotch', 90.5, 103.5, 1, 2, Math.PI / 2);
  decalAt(z, 'decal_chalk_drawing', 101.5, 103.5, 1.2, 1.2, 0.3);
  decalAt(z, 'decal_chalk_drawing', 87.5, 108.5, 1.2, 1.2, 2.1);
  z.meta.vehicleSpawns = [{ x: 158, y: 104, rot: 2, type: 'sedan', chance: 1 }];

  // =====================================================================
  // Number 14 — the house with the red door, and its yard
  // =====================================================================
  houseLot(b, f, rng, 0, 0, true);
  reserve(80, 70, 114, 102);
  // the house key is in Biscuit's kennel
  f.floorItem('house_key', 86, 93, { keyId: 'alder_attic' });
  f.floorItem('bone', 87, 94);
  // the drawing on the porch
  f.floorItem('note', 97, 89, { lore: 'drawing_family' });
  f.floorItem('crayons', 98, 89);
  b.door(95, 88, 0, 'door_red', { portal: 'p_fields_house' });
  b.portal({ id: 'p_fields_house', x: 95, y: 88, kind: 'door', to: 'house', tx: 29, ty: 59, face: FACE.N, label: 'Go inside' });
  setAnchor(b, 'r_fields_house', 95, 90, FACE.S, 3);
  b.obj('light_bulb', 95, 88, 0, { circuit: 1 });
  f.floorItem('teddy_bear', 88, 78); f.floorItem('juice_box', 107, 93); f.floorItem('baseball', 92, 96);

  // =====================================================================
  // the same house again, far away. no door.
  // =====================================================================
  houseLot(b, f, rng, 68, -56, false);
  reserve(148, 14, 182, 46);

  // =====================================================================
  // farm plot, tool shed
  // =====================================================================
  b.roomWalls(62, 78, 78, 94, 'fence_wood');
  b.gap(79, 85, 1); b.gap(79, 86, 1);
  b.addRoom('Farm Plot', 'farm', 62, 78, 78, 94, { outdoor: true });
  for (let y = 80; y <= 92; y++) b.fillFloor(64, y, 76, y, (y % 2 === 0) ? 'soil' : 'dirt');
  for (let y = 80; y <= 92; y += 2) for (let x = 64; x <= 76; x++) b.flag(x, y, x, y, TF.FURROW);
  put(b, f, 'scarecrow', 70, 86, 0);
  for (const [x, y] of [[77, 92], [77, 93], [76, 93], [63, 79]] as const) put(b, f, 'hay_bale', x, y, 0);
  put(b, f, 'sawhorse', 63, 93, 0);
  put(b, f, 'crate_wood', 77, 79, 0);
  f.floorItem('watering_can', 66, 93);
  reserve(60, 76, 80, 100);
  shell(b, 64, 96, 68, 99, 'wood', 'wood_built');
  b.flag(64, 96, 68, 99, TF.OUTDOOR, false);
  b.addRoom('Tool Shed', 'shed', 64, 96, 68, 99, { circuit: 3 });
  b.door(66, 96, 0, 'door_wood');
  b.window(64, 98, 1, { curtains: 'none' });
  put(b, f, 'shelf_metal', 64, 99, 2, { loot: 'garage_shelf' }); put(b, f, 'shelf_metal', 65, 99, 2, { loot: 'garage_shelf' });
  put(b, f, 'workbench', 67, 99, 2);
  put(b, f, 'tool_chest', 68, 97, 1);
  b.obj('light_bulb', 66, 97, 0, { circuit: 3, flicker: 0.05 });
  f.floorItem('seeds_dreamlily', 66, 98); f.floorItem('seeds_potato', 65, 97); f.floorItem('trowel', 67, 97);

  // =====================================================================
  // things that are slightly off
  // =====================================================================
  // a television playing in the grass, an armchair, a lamp, a rug
  decalAt(z, 'carpet_rug', 124.5, 58, 3, 4.2, 0);
  put(b, f, 'tv_static', 124, 56, 0);
  put(b, f, 'armchair', 124, 59, 2);
  put(b, f, 'lamp_floor', 126, 59, 0);
  put(b, f, 'coffee_table', 122, 58, 0);
  f.floorItem('mug', 122, 58); f.floorItem('tv_remote', 125, 60);
  b.addRoom('Living Room', 'tv_field', 120, 54, 128, 62, { outdoor: true });
  reserve(118, 52, 130, 63);
  // an audience of folding chairs, facing nothing
  for (let y = 140; y <= 148; y += 2) for (let x = 146; x <= 156; x += 2) b.obj('chair_folding', x, y, 2, { yaw: rng.float(-0.08, 0.08) });
  b.obj('chair_folding', 151, 152, 0, { yaw: 0.3 });
  b.addRoom('Audience', 'chairs', 144, 138, 158, 153, { outdoor: true });
  reserve(142, 136, 160, 154);
  // a swimming pool in the middle of the meadow
  b.fillFloor(118, 160, 127, 167, 'tile_pool');
  b.fillFloor(120, 162, 125, 165, 'water_deep', -0.6);
  b.obj('pool_ladder', 121, 162, 0);
  put(b, f, 'pool_lounger', 126, 162, 0); put(b, f, 'pool_lounger', 127, 162, 0);
  put(b, f, 'float_ring', 123, 164, 0);
  b.addRoom('The Pool', 'field_pool', 118, 160, 127, 167, { outdoor: true });
  reserve(116, 158, 129, 169);
  // a phone booth, ringing for nobody
  put(b, f, 'phone_booth', 46, 172, 0);
  reserve(44, 170, 48, 174);
  // a playground with half its pieces
  put(b, f, 'merry_go_round', 150, 72, 0); put(b, f, 'seesaw', 156, 75, 0); put(b, f, 'spring_rider', 153, 70, 0);
  reserve(148, 68, 160, 78);
  // a picnic blanket nobody came back to
  decalAt(z, 'carpet_rug', 70.5, 140.5, 2.2, 2.2, 0.35, 0xf0c8c8);
  f.floorItem('juice_box', 70, 140); f.floorItem('childrens_book', 71, 141);
  put(b, f, 'picnic_table', 74, 138, 0);
  reserve(67, 136, 77, 143);
  // a lone bench facing the power lines
  put(b, f, 'bench_park', 134, 46, 3);
  reserve(132, 44, 137, 49);
  put(b, f, 'tree_dead', 162, 150, 0);

  // power lines marching away into the haze
  for (let y = 92; y >= 6; y -= 11) { put(b, f, 'power_pole', 140, y, 0); reserve(140, y, 140, y); }
  for (let k = 1; k <= 9; k++) { const x = 60 - k * 6, y = 102 + k * 9; if (x > 5 && y < 187) { put(b, f, 'power_pole', x, y, 1); reserve(x, y, x, y); } }

  // =====================================================================
  // vegetation: tree clumps, bushes, patches of tall grass and flowers
  // =====================================================================
  const free = (x: number, y: number) => z.inb(x, y) && !keep[z.idx(x, y)] && b.free(x, y);
  const clumps = [[20, 20], [60, 30], [110, 40], [175, 60], [175, 120], [100, 150], [60, 175], [170, 175], [12, 100], [80, 120], [130, 128], [45, 112]];
  for (const [cx, cy] of clumps) {
    const n = rng.int(3, 7);
    for (let i = 0; i < n; i++) {
      const x = cx + rng.int(-4, 4), y = cy + rng.int(-4, 4);
      if (!free(x, y)) continue;
      put(b, f, rng.chance(0.8) ? 'tree_oak' : 'tree_pine', x, y, rng.int(0, 3) as Rot);
      f.decal('decal_leaves', x, y, 2.2, 2.2);
      keep[z.idx(x, y)] = 1;
    }
  }
  for (let i = 0; i < 26; i++) { const x = rng.int(6, 185), y = rng.int(6, 185); if (free(x, y)) put(b, f, 'tree_oak', x, y, rng.int(0, 3) as Rot); }
  // old pasture fences with stiles, a hay meadow
  const fenceRun = (horiz: boolean, a0: number, a1: number, c: number, every = 14) => {
    if (horiz) b.hwall(a0, a1, c, 'fence_wood'); else b.vwall(c, a0, a1, 'fence_wood');
    for (let a = a0 + 5; a < a1; a += every) for (let k = 0; k < 2; k++) { if (horiz) b.gap(a + k, c, 0); else b.gap(c, a + k, 1); }
  };
  fenceRun(true, 112, 186, 126);
  fenceRun(false, 8, 66, 116);
  fenceRun(true, 8, 22, 60, 10);
  fenceRun(false, 128, 186, 92, 16);
  for (let i = 0; i < 22; i++) {
    const x = 60 + (i % 6) * 6 + rng.int(-1, 1), y = 154 + Math.floor(i / 6) * 7 + rng.int(-1, 1);
    if (free(x, y)) { put(b, f, 'hay_bale', x, y, rng.int(0, 3) as Rot); keep[z.idx(x, y)] = 1; }
  }
  b.addRoom('Hay Meadow', 'meadow', 56, 150, 92, 182, { outdoor: true });

  let foliage = 0;
  for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
    if (!free(x, y)) continue;
    const fl = z.floorAt(x, y);
    if (!fl || fl.key !== 'grass_dream') continue;
    const n1 = fbm2(x / 13, y / 13, 3, seed & 0xffff);
    const n2 = fbm2(x / 8 + 40, y / 8 - 20, 3, (seed + 17) & 0xffff);
    if (n1 > 0.6 && rng.chance(0.3)) { b.obj('grass_tall', x, y, 0); foliage++; }
    else if (n2 > 0.64 && rng.chance(0.32)) { b.obj('flowers', x, y, 0); foliage++; }
    else if (rng.chance(0.0025)) b.obj('bush', x, y, rng.int(0, 3) as Rot);
    else if (rng.chance(0.0012)) b.obj(rng.chance(0.6) ? 'rock' : 'stump', x, y, rng.int(0, 3) as Rot);
  }
  void foliage;
  scatterDecals(f, rng, 6, 6, 185, 185, 70, [['decal_leaves', 2], ['decal_footprints', 1], ['decal_puddle', 1]], 0.8, 1.6, (x, y) => !keep[z.idx(x, y)]);
  // scattered childhood things in the grass
  const toys = ['teddy_bear', 'baseball', 'jump_rope', 'marbles', 'toy_car', 'crayons', 'juice_box', 'photo_old', 'doll', 'water_bottle', 'childrens_book'];
  for (let i = 0; i < 26; i++) { const x = rng.int(8, 183), y = rng.int(8, 183); if (free(x, y)) f.floorItem(rng.pick(toys), x, y); }
  for (let i = 0; i < 12; i++) { const x = rng.int(RX0, 186), y = rng.int(RY0, RY1); f.floorLoot('floor_generic', x, y); }

  // ---------------------------------------------------------------------
  for (const c of [1, 2, 3]) z.power.set(c, true);
  z.env = {
    ...z.env,
    ambient: 0xa8b4c8, ambientI: 0.5, fog: 0xe4e8dc, fogNear: 34, fogFar: 96, void: 0xd2dccf, temp: 21,
    sky: true, sun: 0xffe2b4, sunI: 1.25, skyColor: 0xaecfff, outdoorAmbient: 0xb8c8e0,
    grade: 'fields', reverb: 'dream', ambience: 'fields', music: 'musicbox', weather: 'none',
  };
  z.spawnTable = [['stilt_doe', 4], ['wrongbird', 3], ['goodboy', 1], ['sentinel', 1], ['plushkin', 0.5], ['grinhound', 1]];
  z.creatureCap = 8;
  z.meta.terminalLore = ['terminal_generic'];
  return b;
}

/**
 * The house at 14 Alder Lane seen from outside, with its yard. Built at an
 * offset so the same lot can be stamped twice (the second one has no door).
 */
function houseLot(b: ZoneBuilder, f: Furnisher, rng: Rng, ox: number, oy: number, real: boolean) {
  const z = b.z;
  const X = (x: number) => x + ox, Y = (y: number) => y + oy;
  // yard + fence with front and back gates
  b.roomWalls(X(82), Y(72), X(112), Y(100), 'fence_wood');
  b.gap(X(95), Y(101), 0); b.gap(X(96), Y(101), 0); b.gap(X(97), Y(72), 0);
  b.addRoom(real ? 'Front Yard' : 'Front Yard?', real ? 'yard' : 'yard_other', X(82), Y(72), X(112), Y(100), { outdoor: true });
  b.fillFloor(X(95), Y(90), X(96), Y(102), 'sidewalk');
  // the house: 8×8 of siding, curtains always drawn
  shell(b, X(92), Y(80), X(99), Y(87), 'wood', 'siding', 'wall_house_floral');
  b.flag(X(92), Y(80), X(99), Y(87), TF.OUTDOOR, false);
  b.addRoom(real ? 'Number 14' : 'Number 14', real ? 'house_shell' : 'house_other', X(92), Y(80), X(99), Y(87));
  for (const [x, y, s] of [[93, 88, 0], [98, 88, 0], [92, 82, 1], [92, 85, 1], [100, 82, 1], [100, 85, 1], [94, 80, 0], [97, 80, 0]] as const) {
    b.window(X(x), Y(y), s as 0 | 1, { curtains: 'closed' });
  }
  for (let i = 0; i < 4; i++) f.decal('decal_stain_dark', X(rng.int(92, 99)), Y(rng.int(80, 87)), 1.2, 1.2);
  // porch
  b.fillFloor(X(91), Y(88), X(100), Y(89), 'wood');
  b.addRoom('Porch', real ? 'porch' : 'porch_other', X(91), Y(88), X(100), Y(89), { outdoor: true, circuit: 1 });
  b.hwall(X(91), X(94), Y(90), 'railing'); b.hwall(X(97), X(100), Y(90), 'railing');
  b.vwall(X(91), Y(88), Y(89), 'railing'); b.vwall(X(101), Y(88), Y(89), 'railing');
  put(b, f, 'rocking_chair', X(93), Y(88), 0, { yaw: real ? 0.2 : -0.2 });
  put(b, f, 'plant_potted', X(91), Y(88), 0); put(b, f, 'plant_potted', X(100), Y(88), 0);
  decalAt(z, 'carpet_rug', X(95) + 0.5, Y(88) + 0.65, 0.9, 0.5, 0, 0xc89060);
  // yard: kennel, washing line, swing set, sandbox, garden
  put(b, f, 'kennel', X(86), Y(93), 3);
  decalAt(z, 'decal_footprints', X(87) + 0.5, Y(93) + 0.5, 1.4, 1.4, 1.2, 0x8a6a4a);
  put(b, f, 'washing_line', X(101), Y(75), 0);
  put(b, f, 'laundry_basket', X(104), Y(76), 0);
  put(b, f, 'swing_set', X(85), Y(75), 0);
  put(b, f, 'sandbox', X(89), Y(76), 0);
  for (let y = 81; y <= 86; y++) { b.fillFloor(X(101), Y(y), X(102), Y(y), 'soil'); put(b, f, 'flowers', X(101), Y(y), 0); put(b, f, 'flowers', X(102), Y(y), 0); }
  put(b, f, 'birdbath', X(106), Y(83), 0);
  put(b, f, 'garden_gnome', X(103), Y(89), 0);
  put(b, f, 'picnic_table', X(106), Y(92), 0);
  put(b, f, 'bbq_grill', X(109), Y(94), 0);
  b.obj('chair_plastic', X(105), Y(96), 0, { yaw: 2.6 });
  put(b, f, 'sprinkler', X(90), Y(96), 0);
  for (const [x, y] of [[84, 85], [110, 75], [110, 98], [84, 99]] as const) { put(b, f, 'tree_oak', X(x), Y(y), 0); f.decal('decal_leaves', X(x), Y(y), 2.4, 2.4); }
  for (let x = 83; x <= 111; x += 4) { if (Math.abs(x - 95) > 2) put(b, f, 'bush', X(x), Y(100), 0); }
  put(b, f, 'mailbox_house', X(98), Y(102), 0);
  if (real) {
    f.floorItem('pajamas', X(102), Y(76));
  }
}

defZone({
  key: 'fields', name: 'The Fields', W, H, depth: 1,
  blurb: 'Endless summer afternoon. The grass is soft and the sky is very big. Somewhere a screen door bangs.',
  gen: (z, s) => { generateFields(z, s); },
});
