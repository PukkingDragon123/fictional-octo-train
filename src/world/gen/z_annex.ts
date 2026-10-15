// Annex B (128×112). A Meridian research annex frozen in 1990: beige vinyl
// walls, carpet tiles, cubicles, a tape library, an observation room with a
// one-way window onto a room where someone is sitting very still. In the
// middle of the floor, an expedition's abandoned base camp: tents, cots,
// field tables, hazmat suits on hooks, CRT carts tracking test patterns,
// camcorders on tripods pointing east, a generator still running, three
// tether ropes staked to the floor and running off into Sector 7 — the east
// half of the level, where every light is out. Two of the ropes stop. The
// third, the blue one, goes over the lip of a hole in the floor.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { registerShift } from '../shift';
import { connectRegions } from './connect';
import { Ctx, Rot, arrive, put, force, mount, decal, hh, hopperAt, lamp, ropeLine, isOpen, floorRect } from './weird_kit';

const W = 128, H = 112;
const C_WEST = 1, C_CAMP = 2, C_DARK = 3, C_GEN = 4, C_LABS = 5;
const CORR_X0 = 20, CORR_X1 = 22;     // the north-south corridor
const EW_Y0 = 54, EW_Y1 = 56;          // the east-west corridor
const CAMP = { x0: 46, y0: 30, x1: 75, y1: 80 };
const DARK = { x0: 76, y0: 2, x1: 125, y1: 109 };
const HOLE: [number, number] = [112, 56];

export function generateAnnex(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'Annex B';
  const room = (name: string, type: string, x0: number, y0: number, x1: number, y1: number, circuit: number, floor = 'carpet_office', paper = 'zw_wall_annex', o: Record<string, any> = {}) => {
    floorRect(b, x0, y0, x1, y1, floor, paper);
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    return b.addRoom(name, type, x0, y0, x1, y1, { circuit, ...o });
  };
  const fl = (x: number, y: number, circuit: number, o: Record<string, any> = {}) => b.obj('light_fluoro', x, y, 0, { circuit, ...o });

  // ============================================================ the lit annex (west)
  floorRect(b, 2, 2, 45, 109, 'carpet_office', 'zw_wall_annex');
  b.roomWalls(2, 2, 45, 109, 'drywall');
  b.addRoom('Annex B', 'corridor', 2, 2, 45, 109, { circuit: C_WEST, temp: 18 });
  // corridors
  floorRect(b, CORR_X0, 2, CORR_X1, 109, 'linoleum', 'zw_wall_annex');
  floorRect(b, 2, EW_Y0, 45, EW_Y1, 'linoleum', 'zw_wall_annex');
  b.addRoom('Corridor', 'corridor', CORR_X0, 2, CORR_X1, 109, { circuit: C_WEST });
  b.addRoom('Corridor', 'corridor', 2, EW_Y0, 45, EW_Y1, { circuit: C_WEST });
  for (let y = 4; y <= 108; y += 4) fl(21, y, C_WEST, { flicker: hh(21, y, 7001) < 0.12 ? 0.2 : 0, broken: hh(21, y, 7002) < 0.06 });
  for (let x = 4; x <= 44; x += 4) fl(x, 55, C_WEST, { flicker: hh(x, 55, 7003) < 0.1 ? 0.2 : 0 });
  for (let y = 6; y <= 106; y += 8) { mount(b, 'fire_extinguisher_wall', CORR_X0, y, 'w'); }
  for (let y = 10; y <= 100; y += 15) decal(z, 'zw_debris', 21.5, y + 0.5, 1.2, 1.2, hh(y, 1, 7004) * 6);

  // ---- west rooms
  // Reception B: the door to Level 4
  room('Reception B', 'reception', 2, 2, 19, 13, C_WEST, 'carpet_office');
  b.door(CORR_X0, 8, 1, 'door_glass', { open: true });
  b.door(2, 8, 1, 'door_office', { portal: 'r_office_annex', sign: 'office' });
  b.portal({ id: 'r_office_annex', x: 2, y: 8, kind: 'door', to: 'office', tx: 20, ty: 20, label: 'Go back through to Level 4' });
  arrive(b, 'p_office_annex', 4, 8, 'e', 3);
  put(c, 'reception_desk', 9, 5, 0, {}); put(c, 'chair_office', 10, 4, 2, {});
  const rd = put(c, 'desk_office', 14, 4, 0, {}); if (rd) f.onTop('computer', rd, { lore: 'zw_annex_memo' });
  for (let x = 6; x <= 15; x += 3) put(c, 'waiting_chairs', x, 12, 2, {});
  put(c, 'plant_tall', 2, 2, 0, {}); put(c, 'plant_tall', 19, 2, 0, {}); put(c, 'water_cooler', 19, 12, 2, {});
  mount(b, 'noticeboard', 6, 2, 'n', { lore: 'zw_annex_memo' });
  mount(b, 'zw_plate', 8, 2, 'n', { label: 'ANNEX B' });
  mount(b, 'clock_wall', 12, 2, 'n');
  fl(7, 7, C_WEST); fl(14, 8, C_WEST, { flicker: 0.1 });

  // Tape library
  room('Tape Library', 'archive', 2, 14, 19, 27, C_LABS, 'carpet_office');
  b.door(CORR_X0, 20, 1, 'door_office');
  for (let x = 4; x <= 17; x += 3) for (const y of [16, 19, 22]) put(c, 'library_shelf', x, y, 0, { loot: 'zw_camcorder' });
  put(c, 'zw_crt_cart', 17, 26, 2, { v: 2 }); put(c, 'table_round', 5, 25, 0, {});
  f.floorItem('vhs_tape', 5, 25); f.floorItem('note', 6, 26, { lore: 'zw_annex_tape' });
  fl(8, 18, C_LABS, { flicker: 0.15 }); fl(14, 24, C_LABS);

  // Observation 2: a one-way window onto a small room where a Still Life sits
  room('Observation 2', 'observation', 2, 28, 19, 41, C_LABS, 'linoleum');
  b.door(CORR_X0, 34, 1, 'door_lab');
  b.vwall(11, 28, 41, 'glass');
  b.addRoom('Cell', 'cell', 2, 28, 10, 41, { circuit: C_LABS });
  b.fillFloor(2, 28, 10, 41, 'tile_white'); b.paper(2, 28, 10, 41, 'wall_hospital');
  put(c, 'replica_seated', 6, 34, 1, { pose: 'sit', seat: 'chair_plastic' });
  put(c, 'table_round', 7, 34, 0, {}); f.floorItem('mug', 7, 34);
  b.light(6.5, 33.5, 'fluoro', { circuit: C_LABS, intensity: 0.8 });
  put(c, 'zw_camcorder', 13, 33, 3, {}); put(c, 'zw_camcorder', 13, 37, 3, {});
  put(c, 'desk_office', 16, 30, 0, {}); put(c, 'chair_office', 16, 31, 3, {});
  put(c, 'zw_crt_cart', 18, 38, 3, { v: 0 }); put(c, 'filing_cabinet', 19, 29, 1, {});
  mount(b, 'zw_plate', 14, 28, 'n', { label: 'DO NOT KNOCK' });
  b.light(15.5, 35.5, 'screen', { circuit: C_LABS, intensity: 0.25 });

  // break room
  room('Break Room', 'breakroom', 2, 42, 19, 53, C_WEST, 'linoleum');
  b.door(CORR_X0, 47, 1, 'door_office', { open: true });
  put(c, 'vending_snack', 2, 42, 0, {}); put(c, 'vending_soda', 3, 42, 0, {});
  const ck = put(c, 'counter_kitchen', 8, 42, 0, {}); f.onTop('microwave', ck, {});
  const ck2 = put(c, 'counter_sink', 9, 42, 0, {}); void ck2; put(c, 'fridge', 10, 42, 0, {});
  const ck3 = put(c, 'counter_kitchen', 11, 42, 0, {}); if (ck3) f.onTop('coffee_maker', ck3, {});
  for (const [tx, ty] of [[6, 47], [13, 48]] as const) { put(c, 'table_round', tx, ty, 0, {}); for (const [dx, dy, r] of [[-1, 0, 1], [1, 0, 3], [0, 1, 2]] as const) put(c, 'chair_plastic', tx + dx, ty + dy, r as Rot, {}); }
  mount(b, 'noticeboard', 15, 42, 'n', { lore: 'zw_annex_log' });
  fl(7, 46, C_WEST); fl(14, 50, C_WEST, { flicker: 0.3 });

  // records
  room('Records', 'records', 2, 57, 19, 70, C_WEST);
  b.door(CORR_X0, 62, 1, 'door_office');
  for (let y = 59; y <= 68; y += 3) for (let x = 4; x <= 17; x++) if (x !== 10) put(c, 'filing_cabinet', x, y, 0, { loot: 'filing' });
  fl(8, 61, C_WEST, { broken: true }); fl(14, 66, C_WEST, { flicker: 0.2 });

  // equipment store
  room('Equipment Store', 'storage', 2, 71, 19, 84, C_WEST, 'concrete', 'wall_cinder');
  b.door(CORR_X0, 77, 1, 'door_metal', { sign: 'staff' });
  for (let x = 4; x <= 18; x += 2) put(c, 'shelf_metal', x, 71, 0, { loot: 'zw_expedition' });
  for (const [x, y, v] of [[5, 75, 0], [8, 76, 1], [6, 79, 2], [12, 80, 0], [15, 75, 1], [16, 82, 2]] as const) put(c, 'zw_hard_case', x, y, 0, { v });
  put(c, 'zw_cable_drum', 10, 83, 0, {}); put(c, 'generator', 18, 83, 0, {});
  fl(10, 77, C_WEST);

  // decon
  room('Decontamination', 'decon', 2, 85, 19, 98, C_LABS, 'tile_white', 'wall_bathroom');
  b.door(CORR_X0, 91, 1, 'door_lab', { sign: 'danger' });
  put(c, 'zw_decon_arch', 8, 90, 0, {});
  for (let x = 4; x <= 18; x += 2) mount(b, 'zw_hazmat', x, 85, 'n', { v: (x / 2) % 6 });
  put(c, 'bench', 12, 95, 0, {}); put(c, 'bench', 6, 95, 0, {});
  for (let y = 92; y <= 97; y++) put(c, 'locker', 19, y, 1, { loot: 'zw_hazmat' });
  fl(8, 92, C_LABS, { flicker: 0.1 }); fl(14, 89, C_LABS);

  // the steel door to the depot
  room('Transit Door', 'airlock', 2, 99, 19, 109, C_WEST, 'linoleum_green', 'wall_hospital');
  b.door(CORR_X0, 104, 1, 'door_metal', { open: true });
  b.door(2, 104, 1, 'door_lab', { portal: 'r_depot_annex', sign: 'danger' });
  b.portal({ id: 'r_depot_annex', x: 2, y: 104, kind: 'door', to: 'depot', tx: 96, ty: 54, label: 'Go through to the Depot' });
  arrive(b, 'p_depot_annex', 4, 104, 'e', 3);
  for (let x = 4; x <= 18; x++) decal(z, 'zw_hazard_tape', x + 0.5, 101.4, 1.0, 0.12, 0, undefined, 1);
  mount(b, 'zw_plate', 5, 99, 'n', { label: 'BAY 0' });
  put(c, 'zw_luggage_trolley', 16, 107, 0, {}); put(c, 'zw_suitcase', 17, 101, 0, { v: 2 });
  lamp(b, 7, 104, 'emergency', C_WEST, { flicker: 0.05 }); fl(13, 104, C_WEST, { flicker: 0.2 });

  // ---- east rooms (x 23..45)
  room("Director's Office", 'office', 23, 2, 45, 13, C_LABS, 'carpet_red', 'wall_paneling');
  b.door(CORR_X1 + 1, 8, 1, 'door_wood');
  const dd = put(c, 'desk_office', 33, 5, 0, {}); if (dd) f.onTop('computer', dd, { lore: 'zw_annex_memo' });
  put(c, 'chair_office', 33, 4, 2, {}); put(c, 'bookshelf', 44, 5, 1, {}); put(c, 'bookshelf', 44, 6, 1, {});
  put(c, 'filing_cabinet', 24, 2, 0, {}); put(c, 'sofa', 27, 12, 2, {}); put(c, 'coffee_table', 27, 10, 0, {});
  mount(b, 'zw_survey_board', 37, 2, 'n'); mount(b, 'painting', 30, 2, 'n', { v: 2 });
  put(c, 'plant_potted', 45, 13, 0, {});
  fl(30, 8, C_LABS); fl(39, 9, C_LABS, { flicker: 0.1 });

  room('Lab 3', 'lab', 23, 14, 45, 27, C_LABS, 'lab', 'wall_lab');
  b.door(CORR_X1 + 1, 20, 1, 'door_lab');
  for (const y of [17, 21, 25]) { put(c, 'lab_bench', 28, y, 0, {}); put(c, 'lab_bench', 34, y, 0, {}); }
  put(c, 'fume_hood', 44, 15, 1, {}); put(c, 'specimen_tank', 40, 15, 0, {}); put(c, 'centrifuge', 41, 25, 0, {});
  put(c, 'zw_crt_cart', 25, 26, 0, { v: 1 });
  fl(30, 18, C_LABS); fl(38, 23, C_LABS, { broken: true });

  room('Meeting Room', 'meeting', 23, 28, 45, 41, C_LABS, 'carpet_office');
  b.door(CORR_X1 + 1, 34, 1, 'door_glass');
  put(c, 'conference_table', 32, 33, 0, {});
  for (let x = 32; x <= 34; x++) { put(c, 'chair_office', x, 32, 2, {}); put(c, 'chair_office', x, 35, 0, {}); }
  mount(b, 'whiteboard', 33, 28, 'n'); put(c, 'zw_crt_cart', 40, 33, 3, { v: 0 });
  for (let i = 0; i < 4; i++) f.floorItem('paper', 32 + i, 33);
  fl(30, 34, C_LABS); fl(40, 36, C_LABS);

  // cubicle bays (lit), with a door from the corridor
  const cubes = (x0: number, y0: number, x1: number, y1: number, circuit: number, dead: number) => {
    for (let y = y0 + 1; y + 2 <= y1 - 1; y += 4) for (let x = x0 + 1; x + 2 <= x1 - 1; x += 4) {
      b.hwall(x, x + 2, y, 'cubicle'); b.vwall(x, y, y + 2, 'cubicle'); b.vwall(x + 3, y, y + 2, 'cubicle');
      const d = put(c, 'desk_office', x + 1, y, 2, {}); if (d && hh(x, y, 7101) < 0.7) f.onTop('computer', d, {});
      put(c, 'chair_office', x + 1, y + 1, (hh(x, y, 7102) * 4) as Rot, {});
      if (hh(x, y, 7103) < 0.25) put(c, 'plant_potted', x + 2, y + 2, 0, {});
      else if (hh(x, y, 7104) < 0.3) put(c, 'filing_cabinet', x + 2, y + 2, 0, {});
    }
    for (let y = y0 + 2; y <= y1; y += 4) for (let x = x0 + 2; x <= x1; x += 4) fl(x, y, circuit, { broken: hh(x, y, 7105) < dead, flicker: hh(x, y, 7106) < 0.15 ? 0.25 : 0 });
  };
  room('Cubicles A', 'cubicles', 23, 42, 45, 53, C_WEST);
  b.door(CORR_X1 + 1, 47, 1, 'door_office', { open: true });
  b.gap(30, EW_Y0, 0); b.gap(31, EW_Y0, 0);
  cubes(23, 42, 45, 53, C_WEST, 0.1);
  room('Cubicles B', 'cubicles', 23, 57, 45, 70, C_WEST);
  b.door(CORR_X1 + 1, 63, 1, 'door_office', { open: true });
  b.gap(34, EW_Y1 + 1, 0); b.gap(35, EW_Y1 + 1, 0);
  cubes(23, 57, 45, 70, C_WEST, 0.3);
  room('Server Closet B', 'server_closet', 23, 71, 33, 84, C_LABS, 'server', 'wall_server');
  b.door(CORR_X1 + 1, 77, 1, 'door_metal', { sign: 'staff' });
  for (let x = 25; x <= 32; x += 2) put(c, 'server_rack', x, 73, 0, {});
  for (let x = 25; x <= 32; x += 2) put(c, 'server_rack', x, 78, 0, {});
  put(c, 'tape_mainframe', 32, 83, 2, {});
  lamp(b, 28, 76, 'emergency', C_LABS, { flicker: 0.1 });
  room('Copy Room', 'copy', 34, 71, 45, 84, C_WEST, 'linoleum');
  b.door(34, 77, 1, 'door_office');
  b.door(40, 85, 0, 'door_office');
  put(c, 'copier', 36, 71, 0, {}); put(c, 'copier', 39, 71, 0, {}); put(c, 'shelf_metal', 44, 72, 1, { loot: 'office_drawer' });
  for (let i = 0; i < 9; i++) f.floorItem('paper', 36 + (i % 5) * 2, 74 + Math.floor(i / 5) * 3);
  fl(39, 77, C_WEST, { flicker: 0.4 });
  room('Cubicles C', 'cubicles', 23, 85, 45, 109, C_WEST);
  b.door(CORR_X1 + 1, 96, 1, 'door_office', { open: true });
  cubes(23, 85, 45, 109, C_WEST, 0.45);

  // ============================================================ the base camp (middle)
  floorRect(b, CAMP.x0, CAMP.y0, CAMP.x1, CAMP.y1, 'carpet_office', 'zw_wall_annex');
  b.hwall(CAMP.x0, CAMP.x1, CAMP.y0, 'drywall'); b.hwall(CAMP.x0, CAMP.x1, CAMP.y1 + 1, 'drywall');
  b.addRoom('Base Camp', 'base_camp', CAMP.x0, CAMP.y0, CAMP.x1, CAMP.y1, { circuit: C_CAMP, temp: 17 });
  // the annex's east wall opens onto the camp
  for (let y = EW_Y0; y <= EW_Y1; y++) b.gap(46, y, 1);
  for (let y = 40; y <= 70; y++) if (y < EW_Y0 - 1 || y > EW_Y1 + 1) { /* keep wall */ }
  // pillars of the open-plan floor
  for (let y = CAMP.y0 + 4; y <= CAMP.y1 - 3; y += 8) for (let x = CAMP.x0 + 4; x <= CAMP.x1 - 2; x += 8) put(c, 'column_square', x, y, 0, {});
  // cubicles that were pushed aside to make room: a stack of partitions along the north and south walls
  for (let x = CAMP.x0 + 1; x <= CAMP.x1 - 1; x += 2) { put(c, 'chair_stack', x, CAMP.y0, 0, {}); if (hh(x, 1, 7201) < 0.5) put(c, 'desk_office', x, CAMP.y1, 0, {}); }
  // the camp proper, centred on y 55
  const cx = 60, cy = 55;
  put(c, 'tent', cx - 9, cy - 10, 0, {}); put(c, 'tent', cx - 9, cy + 7, 0, {});
  for (const [x, y] of [[cx - 6, cy - 8], [cx - 4, cy - 8], [cx - 6, cy + 5], [cx - 4, cy + 5]] as const) put(c, 'zw_cot', x, y, 0, {});
  put(c, 'zw_field_table', cx - 2, cy - 2, 0, {}); put(c, 'zw_field_table', cx - 2, cy + 2, 2, {});
  for (const [x, y, r] of [[cx - 3, cy - 2, 1], [cx, cy - 2, 3], [cx - 2, cy - 3, 0], [cx - 1, cy + 3, 2], [cx - 3, cy + 2, 1]] as const) put(c, 'chair_folding', x, y, r as Rot, {});
  f.floorItem('journal', cx - 1, cy - 1, { lore: 'zw_annex_log' });
  put(c, 'generator', cx - 8, cy, 0, {});
  put(c, 'zw_cable_drum', cx - 7, cy + 2, 0, {});
  for (const [x, y, v] of [[cx - 10, cy - 3, 0], [cx - 10, cy - 1, 1], [cx - 11, cy + 2, 2], [cx + 3, cy - 8, 0], [cx + 4, cy + 8, 1], [cx - 5, cy - 5, 2]] as const) put(c, 'zw_hard_case', x, y, 0, { v });
  put(c, 'crate_wood', cx - 12, cy + 4, 0, { loot: 'zw_expedition' }); put(c, 'crate_wood', cx - 12, cy - 5, 0, { loot: 'zw_expedition' });
  put(c, 'barrel_oil', cx - 12, cy - 7, 0, {}); put(c, 'barrel_oil', cx - 13, cy - 7, 0, {});
  // hazmat suits on a partition near the tents
  b.vwall(CAMP.x0 + 3, cy - 5, cy + 5, 'cubicle');
  for (let y = cy - 5; y <= cy + 5; y += 2) mount(b, 'zw_hazmat', CAMP.x0 + 3, y, 'w', { v: (y + 1) % 6 });
  put(c, 'zw_decon_arch', CAMP.x0 + 6, cy + 11, 0, {});
  // AV: carts and cameras all pointing east, at the dark
  put(c, 'zw_crt_cart', cx + 3, cy - 3, 1, { v: 0 }); put(c, 'zw_crt_cart', cx + 3, cy + 1, 1, { v: 2 }); put(c, 'zw_crt_cart', cx + 4, cy - 1, 1, { v: 1 });
  for (const y of [cy - 6, cy, cy + 6]) put(c, 'zw_camcorder', cx + 9, y, 3, {});
  // work lights on tripods, and the generator's cable
  for (const [x, y] of [[cx - 5, cy - 6], [cx + 6, cy - 4], [cx + 6, cy + 4], [cx - 5, cy + 7], [cx + 12, cy]] as const) put(c, 'zw_floodlight', x, y, 0, {});
  ropeLine(z, [[cx - 7.5, cy + 0.5], [cx - 2, cy + 0.6], [cx + 3, cy + 1.4], [cx + 6.5, cy + 4.5]], 'zw_rope_blue', 0.05);
  // survey board on the camp's north wall
  mount(b, 'zw_survey_board', cx - 4, CAMP.y0, 'n');
  mount(b, 'zw_plate', cx + 2, CAMP.y0, 'n', { label: 'BASE CAMP' });
  // three tether stakes at the edge of the light, ropes into the dark
  const stakes: [number, number, string][] = [[73, 51, 'zw_rope'], [73, 55, 'zw_rope'], [73, 59, 'zw_rope_blue']];
  stakes.forEach(([x, y, tex], i) => force(c, 'zw_tether_stake', x, y, 1, { v: tex === 'zw_rope_blue' ? 1 : 0, i }));
  for (let y = 48; y <= 62; y++) decal(z, 'zw_hazard_tape', CAMP.x1 + 0.5, y + 0.5, 1.0, 0.12, Math.PI / 2, undefined, 1);
  mount(b, 'zw_plate', CAMP.x1, 47, 'n', { label: 'SECTOR 7' });
  // camp lighting: the floods + a few old tubes
  for (let y = CAMP.y0 + 3; y <= CAMP.y1 - 2; y += 6) for (let x = CAMP.x0 + 3; x <= CAMP.x1 - 3; x += 6) fl(x, y, C_CAMP, { broken: hh(x, y, 7202) < 0.55 || Math.abs(y - cy) < 9, flicker: hh(x, y, 7203) < 0.3 ? 0.3 : 0 });
  // the camp hopper, right where the corridor comes in
  hopperAt(c, 48, 51, 0);
  for (let i = 0; i < 10; i++) { const x = rng.int(CAMP.x0 + 1, CAMP.x1 - 1), y = rng.int(CAMP.y0 + 1, CAMP.y1 - 1); if (isOpen(z, x, y)) f.floorLoot('zw_floor_annex', x, y); }
  for (let i = 0; i < 24; i++) { const x = rng.int(CAMP.x0, CAMP.x1), y = rng.int(CAMP.y0, CAMP.y1); f.decal(rng.chance(0.4) ? 'zw_debris' : rng.chance(0.5) ? 'decal_footprints' : 'decal_stain_dark', x, y, 1.2, 1.2); }

  // ============================================================ Sector 7: the dark (east)
  floorRect(b, DARK.x0, DARK.y0, DARK.x1, DARK.y1, 'carpet_office', 'zw_wall_annex');
  b.roomWalls(DARK.x0, DARK.y0, DARK.x1, DARK.y1, 'drywall');
  // the camp's east side opens into the dark along its whole length
  for (let y = CAMP.y0; y <= CAMP.y1; y++) b.gap(DARK.x0, y, 1);
  b.addRoom('Sector 7', 'dark_sector', DARK.x0, DARK.y0, DARK.x1, DARK.y1, { circuit: C_DARK, temp: 15, lootMul: 1.5 });
  // cubicle farm with main aisles every 8 tiles (the expedition dragged partitions out of the aisles)
  for (let y = DARK.y0 + 2; y + 2 <= DARK.y1 - 1; y += 4) for (let x = DARK.x0 + 2; x + 2 <= DARK.x1 - 1; x += 4) {
    if ((y - DARK.y0) % 12 >= 8 || (x - DARK.x0) % 16 >= 12) continue; // aisles
    if (Math.abs(x + 1 - HOLE[0]) < 6 && Math.abs(y + 1 - HOLE[1]) < 6) continue;
    b.hwall(x, x + 2, y, 'cubicle'); b.vwall(x, y, y + 2, 'cubicle'); b.vwall(x + 3, y, y + 2, 'cubicle');
    const r = hh(x, y, 7301);
    const d = put(c, 'desk_office', x + 1, y, 2, {}); if (d && r < 0.6) f.onTop('computer', d, { on: false });
    if (r < 0.06) put(c, 'replica_seated', x + 1, y + 1, 0, { pose: 'sit_table', seat: 'chair_office' });
    else put(c, 'chair_office', x + 1, y + 1, (hh(x, y, 7302) * 4) as Rot, {});
    if (r > 0.85) put(c, 'filing_cabinet', x + 2, y + 2, 0, {});
  }
  // every tube dead; the only light is the odd emergency lamp and the camp behind you
  for (let y = DARK.y0 + 2; y <= DARK.y1; y += 4) for (let x = DARK.x0 + 2; x <= DARK.x1; x += 4) fl(x, y, C_DARK, { broken: true });
  for (const [x, y] of [[90, 20], [118, 40], [100, 88], [84, 104]] as const) lamp(b, x, y, 'emergency', C_DARK, { intensity: 0.35, radius: 3.5, flicker: 0.2 });
  // black doorways in the sector's outer walls
  for (const [x, y, s] of [[86, DARK.y0, 'n'], [104, DARK.y0, 'n'], [120, DARK.y0, 'n'], [DARK.x1, 30, 'e'], [DARK.x1, 80, 'e'], [96, DARK.y1, 's']] as const) mount(b, 'zw_black_door', x, y, s as any);
  // the hole, and the ladder nobody installed
  const [hx, hy] = HOLE;
  for (let y = hy - 1; y <= hy + 1; y++) for (let x = hx; x <= hx + 2; x++) z.floor[z.idx(x, y)] = 0;
  b.fillFloor(hx, hy, hx, hy, 'carpet_office');
  b.obj('hole_floor', hx, hy, 0, { portal: 'p_annex_under' });
  b.portal({ id: 'p_annex_under', x: hx, y: hy, kind: 'hole', to: 'undercroft', tx: 40, ty: 40, label: 'Follow the rope down' });
  arrive(b, 'r_annex_under', hx - 3, hy, 'e', 2);
  for (const [dx, dy] of [[-1, -1], [-1, 1], [-1, 0], [3, 0], [1, -2], [1, 2]] as const) decal(z, 'zw_carpet_edge', hx + dx + 0.5, hy + dy + 0.5, 1.2, 1.2, Math.atan2(-dy, -dx) - Math.PI / 2, undefined, 1);
  for (let i = 0; i < 8; i++) decal(z, 'zw_debris', hx - 2 + rng.float(0, 5), hy - 3 + rng.float(0, 6), 1.1, 1.1, rng.float(0, 6));
  // the ropes: T1 and T2 stop short (one coiled, one cut), T3 goes over the edge
  ropeLine(z, [[73.5, 51.5], [80, 50.5], [86, 49.5], [92, 46.5], [96, 46.4]], 'zw_rope');
  ropeLine(z, [[73.5, 55.5], [82, 57.5], [90, 58.5], [99, 61.5]], 'zw_rope');
  ropeLine(z, [[73.5, 59.5], [82, 61.5], [92, 62.5], [100, 58.5], [106, 56.5], [hx + 0.3, hy + 0.5]], 'zw_rope_blue');
  force(c, 'zw_cable_drum', 96, 47, 0, {});
  f.floorItem('note', 99, 61, { lore: 'zw_annex_tape' });
  put(c, 'zw_camcorder', 101, 61, 3, {});
  // someone who went in wearing a suit, sitting at a desk with their back to you
  put(c, 'desk_office', 104, 54, 0, {}); put(c, 'replica_seated', 104, 53, 2, { pose: 'sit_table', seat: 'chair_office' });
  for (let i = 0; i < 18; i++) { const x = rng.int(DARK.x0 + 1, DARK.x1 - 1), y = rng.int(DARK.y0 + 1, DARK.y1 - 1); if (isOpen(z, x, y)) f.floorLoot(rng.chance(0.6) ? 'zw_floor_annex' : 'zw_floor_under', x, y); }
  for (let i = 0; i < 40; i++) { const x = rng.int(DARK.x0, DARK.x1), y = rng.int(DARK.y0, DARK.y1); f.decal(rng.weighted([['zw_debris', 3], ['decal_stain_water', 3], ['decal_mold', 2], ['decal_footprints', 1]]), x, y, rng.float(1, 1.8), rng.float(1, 1.8)); }

  // ============================================================ rooms that rearrange in the dark
  for (const [id, x0, y0] of [['annex_dark_a', 80, 6], ['annex_dark_b', 108, 92]] as const) {
    registerShift(z, id, x0, y0, x0 + 9, y0 + 9, 3, (sb, srng, v) => {
      const ff = new Furnisher(sb, srng);
      if (v === 0) { for (let i = 0; i < 6; i++) ff.anywhere('chair_office', x0, y0, x0 + 9, y0 + 9); }
      else if (v === 1) { for (let y = y0 + 1; y <= y0 + 8; y += 2) for (let x = x0 + 1; x <= x0 + 8; x += 2) sb.obj('chair_office', x, y, 0, { yaw: Math.atan2(x0 + 10 - x, y0 + 10 - y) }); }
      else { ff.place('door_freestanding', x0 + 5, y0 + 5, 0); ff.place('zw_crt_cart', x0 + 3, y0 + 4, 1, { v: 1 }); }
    });
  }

  // ============================================================ connectivity, power, env
  connectRegions(z, b, 4, 8, rng, { keep: [{ x0: 2, y0: 28, x1: 10, y1: 41 }] });
  for (const cc of [C_WEST, C_CAMP, C_GEN, C_LABS]) z.power.set(cc, true);
  z.power.set(C_DARK, false);
  z.env = {
    ...z.env,
    ambient: 0x242628, ambientI: 0.42, fog: 0x101214, fogNear: 10, fogFar: 26, void: 0x050607, temp: 17,
    grade: 'office', reverb: 'office', ambience: 'office', music: 'drone',
  };
  z.spawnTable = [['still_life', 3], ['employee', 2], ['hollow', 1.5], ['swivel', 1], ['drywall_man', 1], ['echo', 1], ['custodian', 0.4]];
  z.creatureCap = 8;
  z.meta.terminalLore = ['zw_annex_memo', 'zw_annex_log', 'terminal_generic'];
  z.meta.shiftRate = 1;
}

defZone({
  key: 'annex', name: 'Annex B', W, H, depth: 3,
  blurb: 'Beige walls, carpet tiles, a generator running somewhere. Three ropes run east into the dark. Only one of them is still taut.',
  gen: (z, s) => { generateAnnex(z, s); },
});
void TF; void ZoneBuilder;
