// The Poolrooms (128×128): white tile, warm still water, skylights showing a
// sky that is too blue. A lap pool far too long for any building forms the
// spine; around it hang the changing block with its corridor of identical
// showers, the water park (door to the mall), the main competition pool, the
// pump plant, an empty pool with the drain down to the tunnels, a forest of
// columns standing in shallow water and tiled rooms that rearrange themselves.
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { defZone } from '../worldGraph';
import { registerShift } from '../shift';
import { Rot, FACE, setAnchor, shell, opening, settleVoidHeights, setHeight, decalAt, scatterDecals, scatterLoot, put } from './dream_kit';

const DECK = 'tile_pool', BLUE = 'tile_pool_blue', SHAL = 'water_shallow', DEEP = 'water_deep';
const WALL = 'tile';
const H_SHAL = -0.2, H_DEEP = -0.6;
const LANE = 0x1c3478;

// circuits: 1 halls, 2 pump plant, 3 changing block, 4 dry end (dead), 5 water park
export function generatePools(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  z.name = 'The Poolrooms';
  b.paper(0, 0, z.W - 1, z.H - 1, 'wall_pool');

  const sky = (x: number, y: number, i = 0.75, r = 8) => b.light(x + 0.5, y + 0.5, 'sky', { color: 0xe2f4ff, intensity: i, radius: r, y: 5.5, circuit: 0 });
  const fluoro = (x: number, y: number, circuit: number, flicker = 0, broken = false) => b.obj('light_fluoro', x, y, 0, { circuit, flicker, broken });
  const column = (key: string, x: number, y: number) => { const o = f.place(key, x, y, 0); if (o) b.flag(x, y, x, y, TF.NOSPAWN); return o; };
  const ladder = (x: number, y: number, rot: Rot) => b.obj('pool_ladder', x, y, rot);
  const wet = (x0: number, y0: number, x1: number, y1: number, n: number) => scatterDecals(f, rng, x0, y0, x1, y1, n, [['decal_puddle', 4], ['decal_stain_water', 3], ['decal_footprints', 2], ['decal_mold', 1], ['decal_crack', 1]], 0.7, 1.6);

  // =====================================================================
  // THE LONG HALL — a lap pool 110 m long; nobody built a hall this long
  // =====================================================================
  shell(b, 3, 48, 124, 61, DECK, WALL);
  b.addRoom('The Long Hall', 'long_hall', 3, 48, 124, 61, { circuit: 1 });
  b.fillFloor(8, 51, 119, 58, DEEP, H_DEEP);
  for (let y = 51; y <= 58; y++) {
    b.fillFloor(8, y, 8, y, SHAL, -0.2); b.fillFloor(9, y, 9, y, SHAL, -0.4);
    b.fillFloor(119, y, 119, y, SHAL, -0.2); b.fillFloor(118, y, 118, y, SHAL, -0.4);
  }
  for (const lz of [52, 54, 56, 58]) for (let x = 12; x < 116; x += 4) decalAt(z, 'decal_parking_line', x + 2, lz, 3.6, 0.24, 0, LANE);
  for (const lz of [52, 54, 56, 58]) { decalAt(z, 'decal_parking_line', 11.6, lz, 0.24, 1.0, 0, LANE); decalAt(z, 'decal_parking_line', 116.4, lz, 0.24, 1.0, 0, LANE); }
  const northOpen = [12, 13, 30, 31, 32, 33, 50, 51, 90, 91, 92, 93];
  const southOpen = [15, 16, 17, 56, 57, 58, 59, 104];
  for (let x = 6; x <= 121; x += 6) {
    if (!northOpen.some((o) => Math.abs(o - x) <= 1)) column('column_square', x, 49);
    if (!southOpen.some((o) => Math.abs(o - x) <= 1)) column('column_square', x, 60);
  }
  for (let x = 11; x <= 117; x += 7) { sky(x, 53, 0.7); sky(x + 3, 56, 0.7); }
  for (let x = 9; x <= 120; x += 12) { fluoro(x, 48, 1, rng.chance(0.15) ? 0.2 : 0); fluoro(x + 6, 61, 1); }
  for (let x = 16; x <= 114; x += 14) { ladder(x, 51, 0); ladder(x + 7, 58, 2); }
  put(b, f, 'lifeguard_chair', 64, 50, 0);
  put(b, f, 'lifeguard_chair', 27, 59, 2);
  for (const x of [38, 39, 74, 75, 98, 99]) put(b, f, 'pool_lounger', x, 48, 0);
  for (const x of [44, 45, 86, 87]) put(b, f, 'pool_lounger', x, 60, 2);
  for (let i = 0; i < 10; i++) f.anywhere('float_ring', 11, 51, 116, 58);
  put(b, f, 'towel_stack', 4, 48, 0); put(b, f, 'towel_stack', 123, 61, 0); put(b, f, 'shower_pool', 4, 61, 2); put(b, f, 'shower_pool', 123, 48, 0);
  for (const [x, y] of [[29, 48], [34, 48], [89, 48], [94, 48]] as const) b.obj('exit_sign', x, y, 0);
  wet(4, 48, 123, 50, 40); wet(4, 59, 123, 61, 40);
  for (let i = 0; i < 6; i++) f.floorItem('toy_rubber_duck', rng.int(12, 115), rng.int(52, 57));

  // =====================================================================
  // THE DROP — arrival under the hole in the ceiling (from Level 0)
  // =====================================================================
  shell(b, 6, 66, 27, 85, DECK, WALL);
  b.addRoom('The Drop', 'arrival', 6, 66, 27, 85, { circuit: 1 });
  b.fillFloor(8, 68, 25, 83, SHAL, H_SHAL);
  // channel up to the long hall
  b.fillFloor(15, 62, 17, 67, SHAL, H_SHAL);
  b.vwall(15, 62, 65, WALL); b.vwall(18, 62, 65, WALL);
  opening(b, 15, 62, 0, 3); opening(b, 15, 66, 0, 3);
  b.addRoom('Channel', 'channel', 15, 62, 17, 65, { circuit: 1 });
  // ring of round columns around the hole
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * Math.PI / 4;
    column('column_round', Math.round(16.5 + Math.cos(a) * 5.6 - 0.5), Math.round(75.5 + Math.sin(a) * 5.6 - 0.5));
  }
  b.light(16.5, 76, 'sky', { color: 0xf6fbff, intensity: 1.35, radius: 11, y: 7, circuit: 0 });
  sky(9, 69, 0.45, 6); sky(24, 82, 0.45, 6);
  for (const [x, y] of [[16, 75], [17, 77], [15, 77]] as const) decalAt(z, 'decal_puddle', x + 0.5, y + 0.5, 2.4, 2.4, rng.float(0, 6), 0xf0f8ff);
  // the ladder back up to the Lobby
  b.obj('ladder_wall', 11, 66, 0, { portal: 'r_pools' });
  b.portal({ id: 'r_pools', x: 11, y: 66, kind: 'ladder', to: 'lobby', tx: 80, ty: 80, label: 'Climb back up to Level 0' });
  setAnchor(b, 'p_pools', 16, 76, FACE.N, 4);
  put(b, f, 'pool_lounger', 24, 66, 0); put(b, f, 'pool_lounger', 25, 66, 0);
  put(b, f, 'towel_stack', 6, 84, 0);
  f.floorItem('almond_water', 7, 84);
  f.anywhere('float_ring', 9, 69, 24, 82);
  b.fillFloor(15, 84, 17, 89, SHAL, H_SHAL);
  b.vwall(15, 86, 89, WALL); b.vwall(18, 86, 89, WALL);
  opening(b, 15, 86, 0, 3); opening(b, 15, 90, 0, 3);
  b.addRoom('Channel', 'channel', 15, 86, 17, 89, { circuit: 1 });
  sky(16, 64, 0.5, 5); sky(30, 75, 0.5, 5); sky(16, 87, 0.5, 5);

  // =====================================================================
  // THE COLUMN FOREST — a lake of ankle-deep water under a grid of pillars
  // =====================================================================
  shell(b, 3, 90, 30, 124, DECK, WALL);
  b.addRoom('Column Forest', 'columns', 3, 90, 30, 124, { circuit: 1 });
  b.fillFloor(4, 91, 29, 123, SHAL, H_SHAL);
  b.fillFloor(15, 90, 17, 91, SHAL, H_SHAL);
  // a raised tile island in the corner: somebody camped here
  b.fillFloor(4, 92, 9, 96, DECK, 0);
  put(b, f, 'sleeping_bag', 5, 93, 1); put(b, f, 'survivor_stash', 8, 92, 0); put(b, f, 'campfire_unlit', 7, 95, 0); put(b, f, 'cardboard_box', 4, 96, 0);
  f.floorItem('empty_can', 6, 95); f.floorItem('water_bottle', 8, 94);
  for (let y = 94; y <= 104; y += 4) for (let x = 6; x <= 28; x += 4) if (!(x <= 10 && y <= 97) && !(x >= 14 && x <= 18 && y <= 94)) column('column_round', x, y);
  for (let y = 96; y <= 120; y += 8) for (let x = 8; x <= 26; x += 8) sky(x, y, 0.6, 7);
  registerShift(z, 'pools_forest', 4, 106, 29, 123, 3, (sb, srng, v) => stampForest(sb, srng, v));

  // =====================================================================
  // MAIN POOL — competition pool, diving boards, the rules
  // =====================================================================
  shell(b, 34, 66, 83, 104, DECK, WALL);
  b.addRoom('Main Pool', 'main_pool', 34, 66, 83, 104, { circuit: 1 });
  b.fillFloor(42, 76, 75, 89, DEEP, H_DEEP);
  b.fillFloor(42, 90, 75, 90, SHAL, -0.5);
  b.fillFloor(42, 91, 75, 92, SHAL, -0.4);
  b.fillFloor(42, 93, 75, 93, SHAL, -0.3);
  b.fillFloor(42, 94, 75, 94, SHAL, -0.2);
  b.fillFloor(42, 95, 75, 95, SHAL, -0.1);
  for (let x = 46; x <= 72; x += 4) for (let y = 78; y < 92; y += 4) decalAt(z, 'decal_parking_line', x, y + 2, 3.6, 0.24, Math.PI / 2, LANE);
  for (const x of [50, 58, 66]) put(b, f, 'diving_board', x, 75, 0);
  for (const x of [44, 72]) ladder(x, 76, 0);
  for (const y of [80, 86]) { ladder(42, y, 3); ladder(75, y, 1); }
  put(b, f, 'lifeguard_chair', 38, 84, 3); put(b, f, 'lifeguard_chair', 79, 88, 1);
  b.obj('pool_rules_sign', 46, 66, 0, { lore: 'sign_pool_rules' });
  b.obj('pool_rules_sign', 70, 66, 0, { lore: 'sign_pool_rules' });
  b.obj('clock_wall', 62, 66, 0);
  for (let x = 38; x <= 80; x += 6) { if (x < 55 || x > 60) column('column_round', x, 70); column('column_round', x, 100); }
  for (let y = 76; y <= 94; y += 6) { if (y < 73 || y > 77) { column('column_round', 36, y); column('column_round', 81, y); } }
  for (let x = 44; x <= 72; x += 3) put(b, f, 'pool_lounger', x, 97, 0);
  for (let x = 45; x <= 72; x += 6) for (let y = 79; y <= 92; y += 6) sky(x, y, 0.75);
  for (const [x, y] of [[40, 68], [77, 68], [40, 102], [77, 102], [58, 102]] as const) fluoro(x, y, 1);
  put(b, f, 'pool_storage_shelf', 35, 104, 2); put(b, f, 'pool_storage_shelf', 36, 104, 2);
  put(b, f, 'towel_stack', 82, 103, 0); put(b, f, 'towel_stack', 82, 67, 0);
  for (let i = 0; i < 6; i++) f.anywhere('float_ring', 43, 77, 74, 94);
  for (let i = 0; i < 4; i++) f.floorItem('toy_rubber_duck', rng.int(44, 73), rng.int(78, 93));
  wet(35, 67, 82, 75, 30); wet(35, 96, 82, 103, 25);
  // links: long hall (north), channel (west), staff door (east), tiled rooms (south)
  b.fillFloor(56, 62, 59, 65, DECK);
  b.vwall(56, 62, 65, WALL); b.vwall(60, 62, 65, WALL);
  opening(b, 56, 62, 0, 4); opening(b, 56, 66, 0, 4, 'arch');
  b.addRoom('Corridor', 'corridor', 56, 62, 59, 65, { circuit: 1 });
  b.door(84, 80, 1, 'door_metal', { sign: 'staff' });

  // =====================================================================
  // PUMP PLANT P-2 — the PRESSURE mission
  // =====================================================================
  shell(b, 88, 66, 124, 90, 'concrete', 'concrete', 'wall_concrete');
  b.addRoom('Pump Plant P-2', 'pumps', 88, 66, 124, 90, { circuit: 2, temp: 22 });
  b.fillFloor(90, 70, 122, 70, 'grate');
  for (let i = 0; i < 9; i++) { const x = rng.int(90, 120), y = rng.int(74, 88); b.fillFloor(x, y, x + rng.int(1, 3), y + rng.int(0, 2), 'concrete_wet'); }
  const valves: [string, number][] = [['A', 94], ['B', 104], ['C', 114]];
  for (const [L, x] of valves) {
    put(b, f, 'pump_machine', x, 71, 0);
    b.obj('valve_wheel', x + 3, 71, 0, { mission: 'valve', valve: L, open: false });
    for (let k = 0; k < 4; k++) b.obj('pipes_cluster', x + k, 66, 0);
    b.obj('light_fluoro', x + 1, 73, 0, { circuit: 2 });
  }
  b.obj('pump_control', 106, 77, 0, { mission: 'pump_start' });
  put(b, f, 'chair_office', 106, 78, 2);
  b.obj('noticeboard', 88, 76, 3, { lore: 'pump_manual' });
  f.floorItem('note', 107, 78, { lore: 'pump_manual' });
  setAnchor(b, 'pumps', 106, 80, FACE.N, 2);
  put(b, f, 'boiler', 120, 67, 0);
  put(b, f, 'electrical_cabinet', 118, 66, 0); put(b, f, 'electrical_cabinet', 117, 66, 0);
  b.obj('fuse_box', 112, 66, 0);
  for (const [x, y] of [[90, 67], [91, 67]] as const) put(b, f, 'water_heater', x, y, 0);
  put(b, f, 'tool_chest', 123, 74, 1); put(b, f, 'shelf_metal', 123, 76, 1); put(b, f, 'shelf_metal', 123, 77, 1);
  put(b, f, 'workbench', 121, 84, 1);
  for (const [x, y] of [[96, 88], [97, 88], [98, 89], [100, 89]] as const) put(b, f, 'barrel_oil', x, y, 0, { loot: 'pool_storage' });
  put(b, f, 'pallet_boxes', 110, 89, 0); put(b, f, 'pallet_boxes', 111, 89, 0); put(b, f, 'pallet', 112, 89, 0);
  put(b, f, 'mop_bucket', 102, 86, 0); put(b, f, 'janitor_cart', 89, 88, 0);
  // sump pit behind railings
  b.fillFloor(90, 84, 92, 86, DEEP, -0.6);
  b.hwall(90, 92, 84, 'railing'); b.hwall(90, 92, 87, 'railing'); b.vwall(90, 84, 86, 'railing'); b.vwall(93, 84, 86, 'railing');
  for (let x = 92; x <= 122; x += 6) for (const y of [79, 85]) fluoro(x, y, 2, rng.chance(0.2) ? 0.3 : 0);
  scatterDecals(f, rng, 89, 67, 123, 89, 45, [['decal_stain_dark', 3], ['decal_puddle', 3], ['decal_crack', 2], ['decal_footprints', 1]], 0.8, 1.8);
  scatterLoot(f, rng, 'floor_generic', 89, 72, 123, 89, 5);
  // links: service corridor from the long hall, staff corridor from the main pool, door to the dry end
  b.fillFloor(103, 62, 105, 65, 'concrete');
  b.vwall(103, 62, 65, 'concrete'); b.vwall(106, 62, 65, 'concrete');
  b.paper(103, 62, 105, 65, 'wall_concrete');
  b.door(104, 62, 0, 'door_metal', { sign: 'maintenance' });
  opening(b, 103, 66, 0, 3);
  b.addRoom('Service Corridor', 'service', 103, 62, 105, 65, { circuit: 2 });
  b.obj('light_bulb', 104, 64, 0, { circuit: 2, flicker: 0.2 });
  b.fillFloor(84, 79, 87, 81, 'concrete');
  b.hwall(84, 87, 79, 'concrete'); b.hwall(84, 87, 82, 'concrete');
  b.paper(84, 79, 87, 81, 'wall_concrete');
  b.door(88, 80, 1, 'door_metal', { sign: 'danger' });
  b.addRoom('Staff Corridor', 'service', 84, 79, 87, 81, { circuit: 2 });
  b.obj('light_bulb', 86, 80, 0, { circuit: 2 });

  // =====================================================================
  // THE DRY END — an emptied pool, the drain down to the tunnels
  // =====================================================================
  shell(b, 88, 94, 124, 124, DECK, WALL);
  b.addRoom('The Dry End', 'drained_pool', 88, 94, 124, 124, { circuit: 4, temp: 24 });
  b.fillFloor(94, 100, 118, 119, BLUE, -1.2);
  for (let x = 102; x <= 110; x++) { setHeight(z, x, 100, x, 100, -0.3); setHeight(z, x, 101, x, 101, -0.6); setHeight(z, x, 102, x, 102, -0.9); }
  b.obj('drain_manhole', 106, 113, 0, { portal: 'p_pools_drain' });
  b.portal({ id: 'p_pools_drain', x: 106, y: 113, kind: 'manhole', to: 'tunnels', tx: 20, ty: 20, label: 'Climb down into the drain' });
  setAnchor(b, 'r_pools_drain', 106, 111, FACE.N, 3);
  for (const [x, y] of [[106, 114], [105, 113], [107, 112]] as const) decalAt(z, 'decal_puddle', x + 0.5, y + 0.5, 1.8, 1.4, rng.float(0, 6));
  for (const x of [96, 116]) ladder(x, 100, 0);
  for (const x of [100, 112]) ladder(x, 119, 2);
  put(b, f, 'shopping_cart', 99, 116, 1);
  b.obj('pool_lounger', 112, 107, 1, { yaw: 0.5 });
  b.obj('chair_plastic', 101, 109, 0, { yaw: 2.2 });
  put(b, f, 'trash_bags', 117, 118, 0); put(b, f, 'cardboard_box', 95, 101, 0); put(b, f, 'cardboard_box', 96, 118, 0);
  for (const [x, y] of [[98, 106], [113, 115], [103, 117]] as const) decalAt(z, 'decal_chalk_drawing', x + 0.5, y + 0.5, 2, 2, rng.float(0, 6));
  decalAt(z, 'decal_hopscotch', 109.5, 105.5, 1.2, 2.4, 0);
  scatterDecals(f, rng, 94, 100, 118, 119, 40, [['decal_leaves', 3], ['decal_mold', 2], ['decal_crack', 3], ['decal_stain_dark', 2], ['decal_trash', 1]], 0.8, 2.0);
  for (const [x, y] of [[90, 96], [91, 96], [122, 96]] as const) put(b, f, 'chair_stack', x, y, 0);
  put(b, f, 'pool_storage_shelf', 89, 122, 3); put(b, f, 'towel_stack', 123, 122, 0);
  for (let x = 92; x <= 120; x += 7) for (const y of [97, 121]) fluoro(x, y, 4, 0, rng.chance(0.4));
  sky(106, 108, 0.42, 9); sky(98, 116, 0.3, 6);
  b.light(106.5, 113.5, 'emergency', { circuit: 0, intensity: 0.35, radius: 4, y: 0.5, flicker: 0.15 });
  scatterLoot(f, rng, 'floor_generic', 89, 95, 123, 123, 6);

  // =====================================================================
  // THE TILED ROOMS — two blocks that never stay the same, a channel between
  // =====================================================================
  shell(b, 34, 108, 83, 124, DECK, WALL);
  b.vwall(50, 108, 124, WALL); b.vwall(67, 108, 124, WALL);
  opening(b, 50, 114, 1, 3, 'arch'); opening(b, 67, 114, 1, 3, 'arch');
  b.addRoom('Tiled Rooms', 'tiled_rooms', 34, 108, 49, 124, { circuit: 1 });
  b.addRoom('The Channel', 'channel', 50, 108, 66, 124, { circuit: 1 });
  b.addRoom('Tiled Rooms', 'tiled_rooms', 67, 108, 83, 124, { circuit: 1 });
  b.fillFloor(56, 108, 60, 124, SHAL, H_SHAL);
  b.fillFloor(56, 116, 60, 117, DECK, 0);
  for (let y = 110; y <= 123; y += 3) { column('column_square', 53, y); column('column_square', 63, y); }
  for (let y = 111; y <= 122; y += 5) sky(58, y, 0.65, 7);
  put(b, f, 'shower_pool', 51, 108, 0); put(b, f, 'shower_pool', 66, 108, 0);
  put(b, f, 'pool_lounger', 64, 120, 0); put(b, f, 'towel_stack', 51, 124, 0);
  wet(51, 108, 66, 124, 12);
  registerShift(z, 'pools_rooms_a', 34, 108, 49, 124, 3, (sb, srng, v, r) => stampTiledRooms(sb, srng, v, r.x0, r.y0, r.x1, r.y1));
  registerShift(z, 'pools_rooms_b', 67, 108, 83, 124, 3, (sb, srng, v, r) => stampTiledRooms(sb, srng, v, r.x0, r.y0, r.x1, r.y1), { initial: 1 });

  // =====================================================================
  // SPLASH WORLD — the indoor water park, and the glass door to the mall
  // =====================================================================
  shell(b, 64, 3, 124, 44, DECK, WALL);
  b.addRoom('Splash World', 'waterpark', 64, 3, 124, 44, { circuit: 5 });
  // wave pool with a beach entry
  b.fillFloor(67, 8, 95, 25, DEEP, -0.7);
  const beach: [number, number][] = [[26, -0.5], [27, -0.45], [28, -0.4], [29, -0.3], [30, -0.2], [31, -0.15], [32, -0.1]];
  for (const [y, h] of beach) b.fillFloor(67, y, 95, y, SHAL, h);
  b.fillFloor(67, 6, 95, 7, 'grate');
  for (let x = 68; x <= 94; x += 3) b.obj('vent_wall', x, 3, 0);
  for (let x = 70; x <= 92; x += 7) for (const y of [12, 20]) sky(x, y, 0.8, 9);
  // lazy river ring around an island
  b.fillFloor(100, 6, 122, 41, SHAL, -0.3);
  b.fillFloor(103, 9, 119, 38, DECK, 0);
  b.fillFloor(100, 22, 102, 24, DECK, 0); b.fillFloor(110, 39, 112, 41, DECK, 0); b.fillFloor(120, 15, 122, 16, DECK, 0);
  const flow = (x: number, y: number, rot: number) => decalAt(z, 'decal_arrow_floor', x + 0.5, y + 0.5, 1.2, 1.2, rot, 0x6ab8e8);
  for (let y = 10; y <= 37; y += 6) { flow(101, y, Math.PI / 2); flow(121, y + 3, -Math.PI / 2); }
  for (let x = 104; x <= 118; x += 6) { flow(x, 7, 0); flow(x + 3, 40, Math.PI); }
  for (let x = 102; x <= 121; x += 9) for (const y of [7, 40]) sky(x, y, 0.6, 7);
  // slides into a splash pool
  b.fillFloor(104, 14, 118, 18, DEEP, -0.6);
  for (const x of [105, 109, 113]) put(b, f, 'pool_slide', x, 11, 0);
  for (const x of [107, 115]) sky(x, 16, 0.8, 8);
  put(b, f, 'lifeguard_chair', 103, 20, 1); put(b, f, 'lifeguard_chair', 117, 19, 2);
  // island: snack bar, tables, loungers
  put(b, f, 'food_court_counter', 109, 30, 0);
  put(b, f, 'vending_soda', 105, 33, 0); put(b, f, 'vending_snack', 106, 33, 0);
  for (const [x, y] of [[105, 24], [112, 24], [115, 27], [108, 35]] as const) put(b, f, 'picnic_table', x, y, 0);
  for (let y = 20; y <= 35; y += 3) put(b, f, 'pool_lounger', 118, y, 0);
  for (const [x, y] of [[103, 9], [119, 9], [103, 38], [119, 38]] as const) put(b, f, 'plant_tall', x, y, 0);
  for (const [x, y] of [[106, 28], [112, 33], [114, 21]] as const) fluoro(x, y, 5);
  // kiddie pool
  b.fillFloor(67, 36, 80, 42, SHAL, -0.1);
  for (let i = 0; i < 5; i++) f.anywhere('float_ring', 67, 36, 80, 42);
  put(b, f, 'slide_playground', 82, 36, 0); put(b, f, 'spring_rider', 84, 40, 0); put(b, f, 'teddy_giant', 65, 42, 0);
  for (let i = 0; i < 4; i++) f.floorItem('toy_rubber_duck', rng.int(68, 79), rng.int(37, 41));
  sky(73, 39, 0.7, 7);
  // decks: loungers along the beach, umbrella-less sun
  for (let x = 68; x <= 94; x += 3) put(b, f, 'pool_lounger', x, 33, 0);
  for (let x = 86; x <= 98; x += 4) put(b, f, 'pool_lounger', x, 40, 0);
  for (const [x, y] of [[66, 5], [98, 5], [97, 30], [86, 43], [66, 30]] as const) fluoro(x, y, 5, rng.chance(0.2) ? 0.2 : 0);
  // the way out: glass door, gift kiosk, exit signs
  b.door(86, 3, 0, 'door_glass', { portal: 'p_pools_mall', sign: 'exit' });
  b.portal({ id: 'p_pools_mall', x: 86, y: 3, kind: 'door', to: 'mall', tx: 96, ty: 150, label: 'Go through to Westgate Mall' });
  setAnchor(b, 'r_pools_mall', 86, 5, FACE.S, 3);
  b.obj('exit_sign', 85, 3, 0); b.obj('exit_sign', 87, 3, 0);
  put(b, f, 'plant_tall', 83, 3, 0); put(b, f, 'plant_tall', 89, 3, 0);
  put(b, f, 'kiosk', 72, 3, 0); put(b, f, 'vending_soda', 91, 3, 0); put(b, f, 'vending_snack', 92, 3, 0);
  put(b, f, 'waiting_chairs', 77, 4, 0); put(b, f, 'trash_can', 81, 3, 0);
  b.obj('noticeboard', 79, 3, 0);
  wet(65, 4, 123, 43, 70);
  scatterLoot(f, rng, 'floor_generic', 65, 33, 99, 43, 6);
  // link down to the long hall
  b.fillFloor(90, 45, 93, 47, DECK);
  b.vwall(90, 45, 47, WALL); b.vwall(94, 45, 47, WALL);
  opening(b, 90, 45, 0, 4, 'arch'); opening(b, 90, 48, 0, 4, 'arch');
  sky(91, 46, 0.5, 4);

  // =====================================================================
  // LINKS between areas (after every shell exists, so no wall re-closes them)
  // =====================================================================
  // channels: east to the main pool, south to the column forest
  b.fillFloor(28, 74, 33, 76, SHAL, H_SHAL);
  b.hwall(28, 33, 74, WALL); b.hwall(28, 33, 77, WALL);
  opening(b, 28, 74, 1, 3); opening(b, 34, 74, 1, 3);
  b.fillFloor(26, 74, 27, 76, SHAL, H_SHAL);
  b.addRoom('Channel', 'channel', 28, 74, 33, 76, { circuit: 1 });
  // east to the tiled rooms
  b.fillFloor(31, 114, 33, 116, SHAL, H_SHAL);
  b.hwall(31, 33, 114, WALL); b.hwall(31, 33, 117, WALL);
  opening(b, 31, 114, 1, 3); opening(b, 34, 114, 1, 3);
  for (const x0 of [41, 57, 74]) {
    b.fillFloor(x0, 105, x0 + 2, 107, DECK);
    b.vwall(x0, 105, 107, WALL); b.vwall(x0 + 3, 105, 107, WALL);
    opening(b, x0, 105, 0, 3); opening(b, x0, 108, 0, 3);
    sky(x0 + 1, 106, 0.45, 4);
  }
  b.fillFloor(104, 91, 106, 93, 'concrete');
  b.vwall(104, 91, 93, 'concrete'); b.vwall(107, 91, 93, 'concrete');
  b.paper(104, 91, 106, 93, 'wall_concrete');
  b.door(105, 91, 0, 'door_metal');
  opening(b, 104, 94, 0, 3);
  b.addRoom('Service Corridor', 'service', 104, 91, 106, 93, { circuit: 2 });
  b.fillFloor(84, 114, 87, 116, DECK);
  b.hwall(84, 87, 114, WALL); b.hwall(84, 87, 117, WALL);
  opening(b, 84, 114, 1, 3); opening(b, 88, 114, 1, 3);

  // =====================================================================
  // CHANGING BLOCK — storage, staff rooms, the shower corridor, lockers
  // =====================================================================
  changingBlock(b, f, rng);

  // ---------------------------------------------------------------------
  settleVoidHeights(z);
  for (const c of [1, 2, 3, 5]) z.power.set(c, true);
  z.power.set(4, false);
  z.env = {
    ...z.env,
    ambient: 0xb0c8d0, ambientI: 0.6, fog: 0xcfe4ea, fogNear: 14, fogFar: 38, void: 0x9fb9c1, temp: 27,
    sky: false, grade: 'pool', reverb: 'pool', ambience: 'pool', music: 'pads',
  };
  z.spawnTable = [['lifeguard', 2], ['lumenmoth', 1], ['echo', 1], ['hollow', 0.5]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['terminal_generic', 'terminal'];
  z.meta.shiftRate = 1;
  return b;
}

// ---------------------------------------------------------------------------
// changing block (x 3..60, y 3..44)
// ---------------------------------------------------------------------------
function changingBlock(b: ZoneBuilder, f: Furnisher, rng: Rng) {
  const z = b.z;
  shell(b, 3, 3, 60, 44, 'tile_white', WALL);
  b.hwall(3, 60, 17, WALL); b.hwall(3, 60, 21, WALL);
  for (const x of [15, 27, 37, 49]) b.vwall(x, 3, 16, WALL);
  b.vwall(25, 21, 44, WALL); b.vwall(39, 21, 44, WALL);

  // ---- north rooms
  const north: [string, string, number, number, string, string][] = [
    ['Pool Storage', 'storage', 3, 14, 'concrete', 'wall_concrete'],
    ['Lifeguard Office', 'lifeguard_office', 15, 26, 'linoleum', 'wall_office'],
    ['Sauna', 'sauna', 27, 36, 'wood', 'wall_planks'],
    ['Staff Room', 'staff_room', 37, 48, 'linoleum', 'wall_kitchen'],
    ['Towel Laundry', 'laundry', 49, 60, 'tile_white', 'wall_bathroom'],
  ];
  const doorsN = [9, 21, 32, 43, 55];
  north.forEach(([name, type, x0, x1, floor, paper], i) => {
    b.fillFloor(x0, 3, x1, 16, floor);
    b.paper(x0, 3, x1, 16, paper);
    b.addRoom(name, type, x0, 3, x1, 16, { circuit: 3, temp: type === 'sauna' ? 38 : undefined });
    b.door(doorsN[i], 17, 0, type === 'sauna' ? 'door_wood' : 'door_white', { open: rng.chance(0.3) });
    b.obj('light_switch', doorsN[i] + 1, 16, 2);
  });
  // storage
  for (let x = 4; x <= 13; x += 1) if (x !== 9 && x !== 8 && x !== 10) put(b, f, 'pool_storage_shelf', x, 3, 0);
  for (const [x, y] of [[4, 8], [4, 9], [4, 10]] as const) put(b, f, 'barrel_oil', x, y, 0, { loot: 'pool_storage' });
  put(b, f, 'chair_stack', 12, 8, 0); put(b, f, 'chair_stack', 13, 8, 0); put(b, f, 'chair_stack', 13, 9, 0);
  put(b, f, 'pool_lounger', 7, 11, 0); put(b, f, 'pool_lounger', 8, 11, 0);
  put(b, f, 'mop_bucket', 11, 14, 0); put(b, f, 'pallet_boxes', 13, 15, 0);
  for (let i = 0; i < 3; i++) f.anywhere('float_ring', 5, 6, 13, 15);
  b.obj('light_bulb', 8, 9, 0, { circuit: 3, flicker: 0.1 });
  // lifeguard office
  const desk = put(b, f, 'desk_office', 17, 3, 0);
  f.onTop('computer', desk);
  put(b, f, 'chair_office', 17, 4, 2);
  put(b, f, 'cctv_monitors', 21, 3, 0);
  put(b, f, 'chair_office', 22, 4, 2);
  put(b, f, 'medical_cabinet', 26, 3, 0);
  put(b, f, 'bed_hospital', 15, 12, 0);
  for (const y of [8, 9, 10]) put(b, f, 'locker', 26, y, 1, { loot: 'lifeguard' });
  b.obj('noticeboard', 15, 8, 3);
  b.obj('medicine_cabinet', 24, 3, 0);
  f.floorItem('whistle', 19, 6); f.floorItem('radio_portable', 21, 6);
  b.obj('light_fluoro', 20, 9, 0, { circuit: 3 });
  // sauna: tiered benches, heat
  for (const [x, y, r] of [[28, 3, 0], [30, 3, 0], [32, 3, 0], [34, 3, 0], [28, 6, 0], [32, 6, 0]] as const) put(b, f, 'bench', x, y, r as Rot);
  put(b, f, 'water_heater', 36, 14, 1);
  f.floorItem('bucket', 30, 12);
  b.obj('light_bulb', 31, 9, 0, { circuit: 3 });
  b.light(31.5, 9.5, 'lamp', { color: 0xff9a50, intensity: 0.5, radius: 4, y: 1.2, circuit: 3 });
  // staff room
  const c1 = put(b, f, 'counter_kitchen', 38, 3, 0); f.onTop('microwave', c1);
  const c2 = put(b, f, 'counter_kitchen', 39, 3, 0); f.onTop('coffee_maker', c2);
  put(b, f, 'counter_sink', 40, 3, 0); put(b, f, 'fridge', 41, 3, 0, { loot: 'fridge_office' });
  put(b, f, 'table_round', 42, 8, 0); put(b, f, 'chair_plastic', 41, 8, 3); put(b, f, 'chair_plastic', 43, 8, 1); put(b, f, 'chair_plastic', 42, 9, 2);
  put(b, f, 'sofa', 45, 14, 2); put(b, f, 'tv_stand', 45, 11, 0); f.onTop('tv_crt', f.z.objectsAt(45, 11)[0] || null);
  for (const y of [5, 6, 7]) put(b, f, 'locker', 48, y, 1, { loot: 'gym_locker' });
  put(b, f, 'trash_can', 37, 15, 0);
  b.obj('noticeboard', 44, 3, 0);
  b.obj('light_fluoro', 42, 10, 0, { circuit: 3, flicker: 0.15 });
  // towel laundry
  put(b, f, 'counter_sink', 50, 3, 0); put(b, f, 'counter_sink', 51, 3, 0);
  for (const x of [53, 54, 56, 57]) put(b, f, 'towel_stack', x, 3, 0);
  for (const [x, y] of [[50, 8], [52, 10], [58, 12]] as const) put(b, f, 'laundry_basket', x, y, 0);
  put(b, f, 'clothes_pile', 55, 9, 0, { loot: 'pool_storage' }); put(b, f, 'clothes_pile', 56, 10, 0, { loot: 'pool_storage' });
  put(b, f, 'shelf_metal', 60, 6, 1, { loot: 'pool_storage' }); put(b, f, 'water_heater', 60, 14, 1);
  b.obj('light_fluoro', 54, 9, 0, { circuit: 3 });

  // ---- the shower corridor: 100+ identical stalls
  b.fillFloor(3, 18, 60, 19, 'tile_white');
  b.fillFloor(3, 17, 60, 17, BLUE); b.fillFloor(3, 20, 60, 20, BLUE);
  b.addRoom('Showers', 'showers', 3, 17, 60, 20, { circuit: 3 });
  const doorsS = [14, 31, 49];
  const stallsAt = (x0: number, x1: number, sb: ZoneBuilder) => {
    for (let x = x0; x <= x1; x++) {
      if (!doorsN.includes(x) && x !== 38) sb.obj('shower_stall', x, 17, 0);
      if (!doorsS.includes(x)) sb.obj('shower_stall', x, 20, 2);
    }
  };
  stallsAt(13, 60, b);
  // the missing stall
  put(b, f, 'skeleton', 38, 17, 0);
  for (const [x, y] of [[38, 17], [38, 18]] as const) decalAt(z, 'decal_stain_dark', x + 0.5, y + 0.5, 1.1, 1.1, rng.float(0, 6));
  // the one that is running
  for (let i = 0; i < 5; i++) decalAt(z, 'decal_puddle', 45.5 + rng.float(-1.5, 1.5), 19.6 - i * 0.35, 1.5, 1.2, rng.float(0, 6));
  for (let x = 15; x <= 59; x += 4) b.obj('light_fluoro', x, 18, 0, { circuit: 3, flicker: x > 30 && x < 40 ? 0.35 : 0, broken: x === 51 || x === 55 });
  // the west end changes: more stalls, a dead end, or lockers
  registerShift(z, 'pools_showers', 3, 17, 12, 20, 3, (sb, srng, v) => {
    sb.fillFloor(3, 18, 12, 19, 'tile_white');
    sb.fillFloor(3, 17, 12, 17, BLUE); sb.fillFloor(3, 20, 12, 20, BLUE);
    if (v === 0) stallsAt(3, 12, sb);
    else if (v === 1) {
      stallsAt(8, 12, sb);
      sb.vwall(8, 17, 20, WALL);
      sb.obj('mirror', 8, 18, 3); sb.obj('mirror', 8, 19, 3);
    } else {
      for (let x = 3; x <= 12; x++) { if (x !== 9) sb.obj('locker', x, 17, 0, { loot: 'gym_locker' }); sb.obj('locker', x, 20, 2, { loot: 'gym_locker' }); }
    }
    for (let x = 3; x <= 11; x += 4) sb.obj('light_fluoro', x, 18, 0, { circuit: 3, flicker: v === 1 ? 0.4 : 0 });
    void srng;
  });

  // ---- changing rooms (mirror images) and reception
  const changing = (name: string, x0: number, x1: number, mirror: boolean) => {
    b.fillFloor(x0, 21, x1, 44, DECK);
    for (let x = x0 + 2; x <= x1 - 2; x++) for (const y of [28, 34, 40]) b.fillFloor(x, y, x, y, 'rubber');
    b.addRoom(name, 'changing', x0, 21, x1, 44, { circuit: 3 });
    const lx0 = x0 + 2, lx1 = x1 - 3;
    for (const yy of [25, 31, 37]) for (let x = lx0; x <= lx1; x++) {
      if ((x - lx0) % 6 === 5) continue; // gaps through the locker banks
      b.obj('locker', x, yy, 2, { loot: 'gym_locker' });
      b.obj('locker', x, yy + 1, 0, { loot: 'gym_locker' });
    }
    for (const yy of [28, 34, 40]) for (let x = lx0 + 1; x <= lx1 - 1; x += 4) put(b, f, 'bench', x, yy, 0);
    // sinks + mirrors along the top wall
    for (let x = x0 + 1; x <= x1 - 1; x += 2) { if (Math.abs(x - (mirror ? 49 : 14)) <= 1) continue; put(b, f, 'sink_bathroom', x, 21, 0); b.obj('mirror', x, 21, 0); }
    // toilet stalls on the far wall
    const tx0 = mirror ? x1 - 7 : x0 + 1;
    for (let k = 0; k < 4; k++) {
      const tx = tx0 + k * 2;
      put(b, f, 'toilet', tx, 44, 2);
      b.vwall(tx + 1, 43, 44, 'cubicle');
    }
    for (let x = x0 + 3; x <= x1 - 2; x += 5) for (const y of [23, 29, 35, 42]) b.obj('light_fluoro', x, y, 0, { circuit: 3, flicker: rng.chance(0.1) ? 0.25 : 0 });
    scatterDecals(f, rng, x0, 21, x1, 44, 26, [['decal_puddle', 3], ['decal_footprints', 3], ['decal_stain_water', 2], ['decal_mold', 1]], 0.7, 1.4);
    put(b, f, 'trash_can', mirror ? x0 : x1, 22, 0);
    put(b, f, 'laundry_basket', mirror ? x1 : x0, 33, 0);
  };
  changing("Men's Changing", 3, 24, false);
  changing("Women's Changing", 40, 60, true);
  b.fillFloor(39, 21, 39, 44, DECK);
  // Brandt left his things by the third bench
  f.floorItem('journal', 11, 35, { lore: 'journal_survey_2' });
  f.floorItem('backpack_hiking', 12, 35);
  f.floorItem('flashlight', 10, 35);
  decalAt(z, 'decal_footprints', 12.5, 36.5, 1.2, 1.2, 1.2);
  // reception
  b.fillFloor(25, 21, 38, 44, 'terrazzo');
  b.paper(25, 21, 38, 44, 'wall_mall');
  b.addRoom('Reception', 'reception', 25, 21, 38, 44, { circuit: 3 });
  const rd = put(b, f, 'reception_desk', 31, 33, 0);
  f.onTop('cash_register', rd);
  put(b, f, 'chair_office', 31, 32, 0);
  put(b, f, 'towel_stack', 28, 33, 0); put(b, f, 'towel_stack', 35, 33, 0);
  put(b, f, 'vending_soda', 38, 40, 1); put(b, f, 'vending_snack', 38, 41, 1);
  put(b, f, 'waiting_chairs', 25, 36, 3);
  for (const [x, y] of [[25, 43], [38, 43], [26, 22], [37, 22]] as const) put(b, f, 'plant_tall', x, y, 0);
  b.obj('noticeboard', 28, 21, 0); b.obj('clock_wall', 34, 21, 0);
  put(b, f, 'cardboard_box', 33, 30, 0, { loot: 'gym_locker' });
  for (const [x, y] of [[28, 26], [35, 26], [28, 39], [35, 39]] as const) b.obj('light_fluoro', x, y, 0, { circuit: 3 });
  // doors between rooms
  b.door(14, 21, 0, 'door_white', { open: true, sign: 'restroom' });
  opening(b, 30, 21, 0, 3, 'arch');
  b.door(49, 21, 0, 'door_white', { open: true, sign: 'restroom' });
  b.door(25, 38, 1, 'door_white'); b.door(40, 38, 1, 'door_white');
  // links down to the long hall
  for (const [x0, w] of [[12, 2], [30, 4], [50, 2]] as const) {
    b.fillFloor(x0, 45, x0 + w - 1, 47, DECK);
    b.vwall(x0, 45, 47, WALL); b.vwall(x0 + w, 45, 47, WALL);
    opening(b, x0, 45, 0, w); opening(b, x0, 48, 0, w);
    b.obj('light_fluoro', x0, 46, 0, { circuit: 3 });
  }
  scatterLoot(f, rng, 'floor_generic', 4, 22, 59, 43, 10);
  scatterLoot(f, rng, 'pool_storage', 4, 4, 14, 15, 2);
}

// ---------------------------------------------------------------------------
// shifting stamps
// ---------------------------------------------------------------------------
/** south half of the column forest: grid, aisles of pillars, or a deep lagoon */
function stampForest(b: ZoneBuilder, rng: Rng, v: number) {
  const z = b.z;
  const x0 = 4, y0 = 106, x1 = 29, y1 = 123;
  b.fillFloor(x0, y0, x1, y1, SHAL, H_SHAL);
  const col = (key: string, x: number, y: number) => { if (b.free(x, y)) b.obj(key, x, y, 0); };
  if (v === 0) {
    for (let y = 108; y <= y1; y += 4) for (let x = 6; x <= 28; x += 4) col('column_round', x, y);
  } else if (v === 1) {
    for (const y of [109, 114, 119]) for (let x = 5; x <= 28; x += 2) if (x % 8 !== 3) col('column_square', x, y);
    for (let x = 8; x <= 26; x += 6) b.obj('light_fluoro', x, 116, 0, { circuit: 1, flicker: 0.2 });
  } else {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot((x - 16.5) / 9, (y - 115) / 6);
      if (d < 1) b.fillFloor(x, y, x, y, DEEP, H_DEEP);
    }
    b.fillFloor(15, 113, 18, 116, DECK, 0);
    b.obj('lifeguard_chair', 16, 114, 0);
    for (const [x, y] of [[6, 108], [27, 108], [6, 122], [27, 122]] as const) col('column_round', x, y);
  }
  for (let i = 0; i < 4; i++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (b.free(x, y)) b.obj('float_ring', x, y, 0);
  }
  void z;
}

/**
 * A 16×17 block of tiled rooms. Every variant keeps the block's border openings
 * (north middle, west middle, east middle) connected.
 */
function stampTiledRooms(b: ZoneBuilder, rng: Rng, v: number, x0: number, y0: number, x1: number, y1: number) {
  const mx = x0 + 8, my = y0 + 8;
  const fl = (a: number, c: number, e: number, d: number, floor: string, h = 0) => b.fillFloor(a, c, e, d, floor, h);
  const lightAt = (x: number, y: number) => b.light(x + 0.5, y + 0.5, 'sky', { color: 0xe2f4ff, intensity: 0.6, radius: 7, y: 5.5, circuit: 0 });
  const obj = (key: string, x: number, y: number, rot: Rot = 0, st: Record<string, any> = {}) => { if (b.free(x, y)) b.obj(key, x, y, rot, st); };
  if (v === 0) {
    // four rooms in a ring of arches
    fl(x0, y0, mx - 1, my - 1, SHAL, H_SHAL);
    fl(mx, y0, x1, my - 1, DECK); fl(mx + 2, y0 + 2, x1 - 2, my - 3, DEEP, H_DEEP);
    fl(x0, my, mx - 1, y1, BLUE);
    fl(mx, my, x1, y1, SHAL, H_SHAL);
    b.vwall(mx, y0, y1, WALL); b.hwall(x0, x1, my, WALL);
    for (const yy of [y0 + 3, my + 4]) { b.gap(mx, yy, 1); b.arch(mx, yy, 1); }
    for (const xx of [x0 + 3, mx + 4]) { b.gap(xx, my, 0); b.arch(xx, my, 0); }
    for (let x = x0 + 1; x < mx - 1; x += 2) obj('shower_pool', x, y1, 2);
    obj('pool_lounger', x0 + 2, my + 2, 0); obj('towel_stack', mx - 2, my + 1, 0);
    obj('column_square', mx + 3, my + 3); obj('column_square', x1 - 2, y1 - 2);
    b.obj('pool_ladder', mx + 4, y0 + 2, 0);
    lightAt(x0 + 4, y0 + 4); lightAt(mx + 4, y0 + 4); lightAt(x0 + 4, my + 4); lightAt(mx + 4, my + 4);
  } else if (v === 1) {
    // one tiled hall with a deep plunge pool
    fl(x0, y0, x1, y1, DECK);
    fl(x0 + 3, y0 + 4, x1 - 3, y1 - 3, DEEP, -0.8);
    for (const [x, y] of [[x0 + 1, y0 + 2], [x1 - 1, y0 + 2], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]]) obj('column_round', x, y);
    b.obj('pool_ladder', x0 + 6, y0 + 4, 0); b.obj('pool_ladder', x1 - 6, y0 + 4, 0);
    for (let x = x0 + 4; x <= x1 - 4; x += 3) obj('pool_lounger', x, y0 + 1, 0);
    obj('diving_board', mx, y0 + 3, 0);
    lightAt(mx, my); lightAt(x0 + 4, my); lightAt(x1 - 4, my);
  } else {
    // a grid of square pillars standing in shallow water, one chair in the middle
    fl(x0, y0, x1, y1, SHAL, H_SHAL);
    for (let y = y0 + 2; y <= y1 - 1; y += 3) for (let x = x0 + 2; x <= x1 - 1; x += 3) obj('column_square', x, y);
    fl(mx - 1, my - 1, mx, my, DECK, 0);
    if (b.free(mx, my)) b.obj('lifeguard_chair', mx, my, 0);
    b.light(mx + 0.5, my + 0.5, 'sky', { color: 0xf0f8ff, intensity: 1.0, radius: 9, y: 6, circuit: 0 });
  }
  // (no decals here: decals are not cleared when a region shifts)
  void rng;
}

defZone({
  key: 'pools', name: 'The Poolrooms', W: 128, H: 128, depth: 1,
  blurb: 'Warm water, white tile, skylights onto a sky that is too blue. It smells of chlorine and childhood.',
  gen: (z, s) => { generatePools(z, s); },
});
