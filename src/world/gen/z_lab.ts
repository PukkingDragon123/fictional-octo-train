// Facility 4 (112×112, depth 4): Meridian's hidden laboratory under the
// memory regions. A strict, clinical plan: a white ring corridor around the
// Tank Hall (twenty glowing specimen tanks behind observation glass), with
// four wings off it.
//   north: the admin corridor, briefing room, canteen, offices, the archive
//          (keycard) and the director's suite with Stair B down from 14 Alder Lane
//   west:  the service airlock behind the tunnels' blast door, a three-stage
//          decontamination line, security, lockers and showers (evacuated:
//          emergency lighting only)
//   east:  labs A-C (they rearrange themselves) and the cold room
//   south: Ward B, the sedation ward (cryo pods 1-4, bed 3 is the director,
//          bed 4 is you), the server hall with render node SRV-2 (keycard),
//          the freight lobby and its elevator down to the core, the plant room.
// The janitor's closet on the ring opens straight into the archive stacks.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { registerShift } from '../shift';
import { connectRegions } from './connect';
import { itemOn, stash } from './meridian_kit';
import { Regions, Rect, rect, mount, bulb, decalAt, stencil, arrow, anchorAt, scatterLoot, put, BACK, FACE, Rot, Side } from './deep_kit';

const C_COR = 1, C_NORTH = 2, C_WEST = 3, C_EAST = 4, C_SOUTH = 5, C_TANK = 6, C_SRV = 7, C_WARD = 8, C_DIR = 9;

interface RoomSpec { key: string; name: string; type: string; r: Rect; floor: string; wall: string; paper: string; circuit: number; temp?: number; id?: number }

function generateLab(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const R = new Regions(z);
  z.name = 'Facility 4';

  // =====================================================================
  // PLAN
  // =====================================================================
  const COR = R.next();
  const S: Record<string, RoomSpec> = {};
  const spec = (key: string, name: string, type: string, r: Rect, o: Partial<RoomSpec> = {}) =>
    (S[key] = { key, name, type, r, floor: o.floor ?? 'lab', wall: o.wall ?? 'lab', paper: o.paper ?? 'wall_lab', circuit: o.circuit ?? C_COR, temp: o.temp });
  // corridors (one region: they join freely)
  const corridors: Rect[] = [
    rect(35, 35, 76, 76),                         // the ring (inner block painted over below)
    rect(10, 29, 103, 31),                        // admin corridor
    rect(54, 32, 57, 34),                         // north spoke
    rect(32, 49, 34, 53),                         // west spoke
    rect(77, 54, 79, 57), rect(80, 36, 82, 76),   // east spoke + east corridor
    rect(54, 77, 57, 78), rect(10, 79, 83, 81),   // south spoke + south corridor
  ];
  // north wing
  spec('canteen', 'Canteen', 'canteen', rect(10, 6, 37, 13), { floor: 'linoleum', paper: 'wall_kitchen', circuit: C_NORTH });
  spec('brief', 'Briefing Room', 'conference', rect(10, 14, 23, 28), { floor: 'carpet_office', paper: 'wall_office', circuit: C_NORTH });
  spec('records', 'Records', 'records', rect(24, 14, 37, 19), { floor: 'linoleum', circuit: C_NORTH });
  spec('b1', 'Office B-1', 'office', rect(24, 20, 30, 28), { floor: 'carpet_office', paper: 'wall_office', circuit: C_NORTH });
  spec('b2', 'Office B-2', 'office', rect(31, 20, 37, 28), { floor: 'carpet_office', paper: 'wall_office', circuit: C_NORTH });
  spec('archive', 'Archive', 'archive', rect(40, 6, 73, 28), { floor: 'carpet_office', paper: 'wall_paneling', circuit: C_NORTH, temp: 16 });
  spec('ante', 'Director\'s Anteroom', 'office', rect(76, 21, 95, 28), { floor: 'carpet_office', paper: 'wall_paneling', circuit: C_DIR });
  spec('director', 'Director\'s Office — D. Hale', 'director', rect(76, 6, 95, 20), { floor: 'wood', paper: 'wall_paneling', circuit: C_DIR, temp: 19 });
  spec('stairb', 'Stair B', 'stairs', rect(96, 6, 103, 28), { floor: 'concrete', wall: 'concrete', paper: 'wall_concrete', circuit: 0, temp: 15 });
  // central block
  spec('tanks', 'Tank Hall', 'tanks', rect(44, 44, 67, 67), { circuit: C_TANK, temp: 15 });
  spec('obs1', 'Observation 1', 'observation', rect(38, 38, 55, 43), { floor: 'carpet_office', circuit: C_TANK });
  spec('obs2', 'Observation 2', 'observation', rect(56, 38, 73, 43), { floor: 'carpet_office', circuit: C_TANK });
  spec('obs3', 'Observation 3', 'observation', rect(38, 44, 43, 55), { floor: 'carpet_office', circuit: C_TANK });
  spec('store', 'Store', 'storage', rect(38, 61, 43, 67), { circuit: C_TANK });
  spec('intake', 'Specimen Intake', 'intake', rect(44, 68, 67, 73), { floor: 'tile_white', circuit: C_TANK });
  spec('coldstore', 'Cold Storage', 'cold', rect(38, 68, 43, 73), { floor: 'tile_white', circuit: C_TANK, temp: 3 });
  spec('tplant', 'Tank Plant', 'plant', rect(68, 44, 73, 73), { floor: 'grate', wall: 'lab', paper: 'wall_lab', circuit: C_TANK, temp: 22 });
  // west wing
  spec('airlock', 'Service Airlock', 'airlock', rect(6, 47, 15, 55), { floor: 'concrete', circuit: C_WEST, temp: 13 });
  spec('decon1', 'Decontamination 1', 'decon', rect(16, 49, 20, 53), { floor: 'tile_white', paper: 'wall_bathroom', circuit: C_WEST });
  spec('decon2', 'Decontamination 2', 'decon', rect(21, 49, 25, 53), { floor: 'tile_white', paper: 'wall_bathroom', circuit: C_WEST });
  spec('decon3', 'Decontamination 3', 'decon', rect(26, 49, 31, 53), { floor: 'tile_white', paper: 'wall_bathroom', circuit: C_WEST });
  spec('security', 'Security', 'security', rect(8, 37, 21, 46), { floor: 'linoleum', circuit: C_WEST });
  spec('lockers', 'Locker Room', 'lockers', rect(8, 56, 31, 66), { floor: 'linoleum', circuit: C_WEST });
  spec('showers', 'Showers', 'bathroom', rect(8, 67, 19, 76), { floor: 'tile_white', paper: 'wall_bathroom', circuit: C_WEST });
  spec('wc', 'Washroom', 'bathroom', rect(20, 67, 31, 76), { floor: 'tile_white', paper: 'wall_bathroom', circuit: C_WEST });
  // east wing
  spec('labA', 'Lab A', 'lab', rect(83, 36, 105, 46), { circuit: C_EAST });
  spec('labB', 'Lab B', 'lab', rect(83, 47, 105, 57), { circuit: C_EAST });
  spec('labC', 'Lab C', 'lab', rect(83, 58, 105, 68), { circuit: C_EAST });
  spec('coldroom', 'Cold Room', 'cold', rect(83, 69, 105, 76), { floor: 'tile_white', circuit: C_EAST, temp: 4 });
  // south wing
  spec('ward', 'Ward B — Sedation', 'ward', rect(8, 82, 47, 105), { floor: 'linoleum_green', paper: 'wall_hospital', circuit: C_WARD, temp: 17 });
  spec('server', 'Server Hall SRV-2', 'server_hall', rect(50, 84, 83, 105), { floor: 'server', wall: 'server', paper: 'wall_server', circuit: C_SRV, temp: 14 });
  spec('freight', 'Freight Lobby', 'freight', rect(84, 79, 105, 94), { floor: 'concrete', wall: 'concrete', paper: 'wall_garage', circuit: C_SOUTH, temp: 14 });
  spec('plant', 'Plant Room', 'plant', rect(84, 95, 105, 105), { floor: 'concrete', wall: 'concrete', paper: 'wall_concrete', circuit: C_SOUTH, temp: 24 });

  for (const c of corridors) R.area(b, c.x0, c.y0, c.x1, c.y1, COR, 'lab');
  for (const s of Object.values(S)) { s.id = R.next(); R.area(b, s.r.x0, s.r.y0, s.r.x1, s.r.y1, s.id, s.floor); }
  const wallOf = new Map<number, string>([[COR, 'lab']]);
  for (const s of Object.values(S)) wallOf.set(s.id!, s.wall);
  const prio = (id: number) => (id === 0 ? -1 : id === COR ? 0 : wallOf.get(id) === 'lab' ? 1 : 2);
  R.build(b, () => false, (a, c) => wallOf.get(prio(a) >= prio(c) ? a : c) ?? 'lab');
  for (const c of corridors) b.paper(c.x0, c.y0, c.x1, c.y1, 'wall_lab');
  for (const s of Object.values(S)) b.paper(s.r.x0, s.r.y0, s.r.x1, s.r.y1, s.paper);
  // corridor room records (ring first, then the rest), then every room
  b.addRoom('Clean Corridor', 'corridor', 35, 35, 76, 76, { circuit: C_COR, temp: 17 });
  b.addRoom('Admin Corridor', 'corridor', 10, 29, 103, 34, { circuit: C_COR, temp: 17 });
  b.addRoom('West Spoke', 'corridor', 32, 49, 34, 53, { circuit: C_WEST, temp: 15 });
  b.addRoom('East Corridor', 'corridor', 77, 36, 82, 76, { circuit: C_COR, temp: 17 });
  b.addRoom('South Corridor', 'corridor', 10, 77, 83, 81, { circuit: C_SOUTH, temp: 16 });
  for (const s of Object.values(S)) b.addRoom(s.name, s.type, s.r.x0, s.r.y0, s.r.x1, s.r.y1, { circuit: s.circuit, temp: s.temp, lootMul: s.key === 'security' ? 1.4 : s.key === 'canteen' ? 0.7 : undefined });
  // glass: the tank hall is watched from three sides
  b.hwall(44, 67, 44, 'glass');
  b.vwall(44, 44, 55, 'glass');

  // ---------------------------------------------------------------- doors
  const door = (x: number, y: number, side: 0 | 1, o: Record<string, any> = {}, style = 'door_lab') => b.door(x, y, side, style, o);
  // west
  door(16, 51, 1, { sign: 'lab' }); door(21, 51, 1, {}); door(26, 51, 1, {}); door(32, 51, 1, { open: true });
  door(11, 47, 0, { sign: 'staff' }); door(12, 56, 0, { sign: 'restroom' });
  door(13, 67, 0, {}, 'door_white'); door(25, 67, 0, {}, 'door_white');
  // central
  door(46, 38, 0, { sign: 'lab' }); door(65, 38, 0, { sign: 'lab' }); door(38, 50, 1, { sign: 'lab' }); door(38, 64, 1, { sign: 'staff' });
  door(40, 74, 0, { sign: 'danger' }); door(55, 74, 0, { open: true }); door(56, 74, 0, { open: true });
  door(55, 68, 0, {}); door(56, 68, 0, {}); door(74, 60, 1, { sign: 'maintenance' }); door(68, 56, 1, {});
  // east
  for (const [y, s] of [[41, 'lab'], [52, 'lab'], [63, 'lab'], [72, 'danger']] as const) door(83, y, 1, { sign: s });
  // north
  door(17, 29, 0, { sign: 'office' }); door(16, 14, 0, {}, 'door_office'); door(27, 29, 0, { sign: 'office' }, 'door_office'); door(34, 29, 0, { sign: 'office' }, 'door_office');
  door(34, 20, 0, {}, 'door_office'); door(85, 29, 0, { sign: 'office' }, 'door_wood'); door(85, 21, 0, {}, 'door_wood');
  door(99, 29, 0, { sign: 'stairs' }, 'door_metal'); door(96, 12, 1, {}, 'door_wood');
  // the archive: keycard
  const archDoor: [number, number, 0 | 1] = [46, 29, 0];
  door(archDoor[0], archDoor[1], archDoor[2], { locked: true, sign: 'lab' }, 'door_metal');
  mount(b, 'keycard_reader', 47, 29, 'n', { card: 'keycard_lab', door: archDoor });
  mount(b, 'zg_room_plate', 45, 29, 'n', { label: 'ARCHIVE' });
  // south
  door(18, 82, 0, { sign: 'lab' }); door(38, 82, 0, {});
  door(84, 80, 1, { sign: 'staff' }, 'door_metal'); door(94, 95, 0, { sign: 'danger' }, 'door_metal');
  const srvDoor: [number, number, 0 | 1] = [84, 90, 1];
  door(srvDoor[0], srvDoor[1], srvDoor[2], { locked: true, sign: 'danger' }, 'door_metal');
  mount(b, 'keycard_reader', 84, 91, 'w', { card: 'keycard_lab', door: srvDoor });
  mount(b, 'zg_room_plate', 84, 89, 'w', { label: 'SRV-2' });

  // ---------------------------------------------------------------- lights
  const grid = (r: Rect, sx: number, sy: number, circuit: number, o: (x: number, y: number) => { broken?: boolean; flicker?: number } = () => ({})) => {
    const ox = Math.floor(((r.x1 - r.x0) % sx) / 2), oy = Math.floor(((r.y1 - r.y0) % sy) / 2);
    for (let y = r.y0 + oy; y <= r.y1; y += sy) for (let x = r.x0 + ox; x <= r.x1; x += sx) bulb(b, x, y, circuit, { kind: 'light_fluoro', ...o(x, y) });
  };
  const odd = () => ({ broken: rng.chance(0.08), flicker: rng.chance(0.08) ? rng.float(0.1, 0.3) : 0 });
  // ring: a fixture every 4 tiles down the middle lane
  for (let t = 36; t <= 75; t += 4) { bulb(b, t, 36, C_COR, { kind: 'light_fluoro', ...odd() }); bulb(b, t, 75, C_COR, { kind: 'light_fluoro', ...odd() }); }
  for (let t = 40; t <= 72; t += 4) { bulb(b, 36, t, C_COR, { kind: 'light_fluoro', ...odd() }); bulb(b, 75, t, C_COR, { kind: 'light_fluoro', ...odd() }); }
  for (let x = 12; x <= 102; x += 4) bulb(b, x, 30, C_COR, { kind: 'light_fluoro', ...odd() });
  for (let y = 38; y <= 75; y += 4) bulb(b, 81, y, C_COR, { kind: 'light_fluoro', ...odd() });
  // the south corridor is on the dying circuit: most tubes out, red lamps on battery
  for (let x = 12; x <= 82; x += 4) bulb(b, x, 80, C_SOUTH, { kind: 'light_fluoro', broken: rng.chance(0.55), flicker: rng.chance(0.3) ? 0.35 : 0 });
  for (let x = 16; x <= 82; x += 16) b.light(x + 0.5, 80.5, 'emergency', { circuit: 0, flicker: 0.04 });
  bulb(b, 33, 51, C_WEST, { kind: 'light_fluoro', broken: true }); b.light(33.5, 51.5, 'emergency', { circuit: 0 });
  bulb(b, 55, 33, C_COR, { kind: 'light_fluoro' }); bulb(b, 78, 55, C_COR, { kind: 'light_fluoro' }); bulb(b, 55, 77, C_SOUTH, { kind: 'light_fluoro', flicker: 0.3 });

  // floor markings: a coloured guide line around the ring, arrows to each wing
  for (let t = 36; t <= 75; t++) {
    decalAt(z, 'decal_parking_line', t + 0.5, 37.1, 1.02, 0.12, 0, 0x3a8ab8, 0.9);
    decalAt(z, 'decal_parking_line', t + 0.5, 74.9, 1.02, 0.12, 0, 0x3a8ab8, 0.9);
    decalAt(z, 'decal_parking_line', 37.1, t + 0.5, 1.02, 0.12, Math.PI / 2, 0x3a8ab8, 0.9);
    decalAt(z, 'decal_parking_line', 74.9, t + 0.5, 1.02, 0.12, Math.PI / 2, 0x3a8ab8, 0.9);
  }
  arrow(z, 55.5, 35.8, 'n', 1.2, 0x3a8ab8); arrow(z, 35.8, 51.5, 'w', 1.2, 0x3a8ab8); arrow(z, 76.2, 55.5, 'e', 1.2, 0x3a8ab8); arrow(z, 55.5, 76.2, 's', 1.2, 0x3a8ab8);
  stencil(z, 'DECON', 36.2, 51.5, 1.8, Math.PI, 0x3a8ab8);
  stencil(z, 'WARD B', 55.5, 78.2, 1.8, Math.PI / 2, 0x3a8ab8); stencil(z, 'SRV-2', 70.5, 80.5, 1.6, 0, 0x3a8ab8); arrow(z, 72.6, 80.5, 'e', 1, 0x3a8ab8);

  // =====================================================================
  // WEST WING — the way in from the tunnels (evacuated, emergency power)
  // =====================================================================
  {
    const a = S.airlock.r;    // 6..15 × 47..55
    b.obj('zg_blast_frame', a.x0, 50, 3, {});
    b.door(a.x0, 51, 1, 'door_metal', { portal: 'r_tunnels_lab', sign: 'danger' });
    b.portal({ id: 'r_tunnels_lab', x: a.x0, y: 51, kind: 'door', to: 'tunnels', tx: 132, ty: 132, label: 'Open the blast door to the tunnels' });
    anchorAt(b, 'p_tunnels_lab', a.x0 + 2, 51, 'e', 3);
    for (const [x, y, w, d, rot] of [[a.x0 + 1.5, 49.2, 3, 0.16, 0], [a.x0 + 1.5, 52.8, 3, 0.16, 0]] as const) decalAt(z, 'decal_parking_line', x, y, w, d, rot, 0xd8b030, 0.9);
    stencil(z, 'DECON', a.x0 + 6, 51.5, 2.4, 0, 0xd8b030); arrow(z, a.x0 + 8.4, 51.5, 'e', 1.2);
    put(f, 'hazard_barrier', a.x0 + 4, 48, 0, { yaw: 0.4 }); put(f, 'hazard_barrier', a.x0 + 4, 54, 0);
    put(f, 'locker', a.x1, 47, FACE.w, { loot: 'security_office' }); put(f, 'locker', a.x1, 55, FACE.w, { loot: 'security_office' });
    mount(b, 'fire_extinguisher_wall', 8, 47, 'n'); mount(b, 'noticeboard', 13, 47, 'n', { lore: 'note_generic' });
    mount(b, 'zg_room_plate', 14, 47, 'n', { label: 'SECURITY' });
    bulb(b, 10, 49, C_WEST, { kind: 'light_fluoro', broken: true }); bulb(b, 10, 53, C_WEST, { kind: 'light_fluoro' });
    b.light(8.5, 51.5, 'emergency', { circuit: 0, intensity: 0.6, radius: 5, flicker: 0.05 });
    b.light(13.5, 51.5, 'emergency', { circuit: 0, intensity: 0.5, radius: 4 });
    for (let k = 0; k < 5; k++) f.decal(rng.pick(['decal_footprints', 'decal_stain_water']), rng.int(a.x0, a.x1), rng.int(a.y0, a.y1), 0.9, 0.9);
    // the decon line: shower heads, drains, yellow lines, one placard each
    for (const key of ['decon1', 'decon2', 'decon3']) {
      const r = S[key].r, cx = Math.floor((r.x0 + r.x1) / 2);
      put(f, 'shower_pool', cx, r.y0, 0); put(f, 'shower_pool', cx, r.y1, FACE.n);
      put(f, 'vent_floor', cx, 51);
      mount(b, 'zg_room_plate', r.x0 + 1, r.y0, 'n', { label: 'DECON' });
      decalAt(z, 'decal_parking_line', r.x0 + 0.1, 51.5, 5, 0.14, Math.PI / 2, 0xd8b030, 0.9);
      b.light(cx + 0.5, 51.5, 'emergency', { circuit: 0, intensity: 0.45, radius: 3.5, flicker: key === 'decon2' ? 0.3 : 0 });
      bulb(b, cx, 50, C_WEST, { kind: 'light_fluoro', broken: key !== 'decon3' });
    }
    f.floorItem('gas_mask', 23, 52); f.floorItem('gloves_rubber', 28, 50);
    // security
    const s = S.security.r;   // 8..21 × 37..46
    put(f, 'security_desk', 12, 40, FACE.s); put(f, 'chair_office', 12, 41, FACE.n);
    put(f, 'cctv_monitors', 11, 37, 0); put(f, 'cctv_monitors', 15, 37, 0);
    put(f, 'lab_cabinet', s.x1, 38, FACE.w, { loot: 'security_office' }); put(f, 'lab_cabinet', s.x1, 39, FACE.w, { loot: 'security_office' });
    for (let x = s.x0; x <= s.x0 + 2; x++) put(f, 'locker', x, s.y1, FACE.n, { loot: 'security_office' });
    put(f, 'water_cooler', s.x1, s.y1, FACE.w); put(f, 'chair_office', 17, 43, 1, { yaw: 0.8 });
    mount(b, 'clock_wall', 18, 37, 'n'); mount(b, 'noticeboard', s.x0, 41, 'w');
    bulb(b, 11, 42, C_WEST, { kind: 'light_fluoro', broken: true }); bulb(b, 17, 41, C_WEST, { kind: 'light_fluoro', flicker: 0.4 });
    b.light(14.5, 44.5, 'emergency', { circuit: 0 });
    f.floorItem('flashlight', 13, 43); f.floorItem('id_badge', 10, 44);
    // lockers, showers, washroom
    const l = S.lockers.r;    // 8..31 × 56..66
    for (let x = l.x0 + 2; x <= l.x1 - 1; x++) { if (Math.abs(x - 12) > 1 && Math.abs(x - 25) > 1) { put(f, 'locker', x, l.y0, 0, { loot: 'gym_locker' }); } }
    for (const y of [60, 63]) { for (let x = l.x0 + 3; x <= l.x1 - 3; x += 3) put(f, 'bench', x, y, 0); }
    for (let y = l.y0 + 2; y <= l.y1 - 1; y++) put(f, 'locker', l.x1, y, FACE.w, { loot: 'gym_locker' });
    b.light(15.5, 61.5, 'emergency', { circuit: 0 }); b.light(26.5, 61.5, 'emergency', { circuit: 0, flicker: 0.1 });
    grid(l, 6, 4, C_WEST, () => ({ broken: rng.chance(0.7) }));
    f.floorItem('lab_coat', 17, 64); f.floorItem('towel_item', 21, 59);
    const sh = S.showers.r;
    for (let x = sh.x0; x <= sh.x1; x += 2) if (x !== 13) put(f, 'shower_stall', x, sh.y1, FACE.n);
    put(f, 'vent_floor', 13, 72); for (let k = 0; k < 4; k++) f.decal('decal_puddle', rng.int(sh.x0, sh.x1), rng.int(sh.y0 + 2, sh.y1), 1.4, 1.4);
    b.light(13.5, 71.5, 'emergency', { circuit: 0, intensity: 0.4 });
    const wc = S.wc.r;
    for (let x = wc.x0 + 1; x <= wc.x1 - 1; x += 2) if (x !== 25) put(f, 'toilet', x, wc.y1, FACE.n);
    for (let y = wc.y0 + 2; y <= wc.y1 - 3; y++) put(f, 'sink_bathroom', wc.x1, y, FACE.w);
    mount(b, 'mirror', wc.x0, 70, 'w'); mount(b, 'mirror', wc.x0, 72, 'w');
    bulb(b, 25, 71, C_WEST, { kind: 'light_fluoro', flicker: 0.5 });
  }

  // =====================================================================
  // NORTH WING — admin, archive, the director
  // =====================================================================
  {
    // canteen
    const c = S.canteen.r;    // 10..37 × 6..13
    put(f, 'counter_kitchen', 12, 6, 0); put(f, 'counter_sink', 13, 6, 0); const st = put(f, 'stove', 14, 6, 0); void st;
    const cm = put(f, 'counter_kitchen', 15, 6, 0); f.onTop('coffee_maker', cm); put(f, 'fridge', 16, 6, 0, { loot: 'fridge_office' });
    put(f, 'vending_snack', 34, 6, 0); put(f, 'vending_soda', 35, 6, 0); put(f, 'water_cooler', 36, 6, 0);
    for (let x = 14; x <= 32; x += 5) for (const y of [9, 12]) {
      put(f, 'table_round', x, y, 0);
      put(f, 'chair_plastic', x - 1, y, FACE.e, { yaw: rng.float(-0.5, 0.5) });
      if (rng.chance(0.7)) put(f, 'chair_plastic', x + 1, y, FACE.w, { yaw: rng.float(-0.8, 0.8) });
      if (rng.chance(0.4)) f.floorItem(rng.pick(['mug', 'food_scraps', 'soda_can_empty', 'paper']), x, y);
    }
    mount(b, 'clock_wall', 24, 6, 'n'); mount(b, 'zg_room_plate', 22, 6, 'n', { label: 'CANTEEN' }); mount(b, 'noticeboard', c.x0, 9, 'w', { lore: 'note_generic' });
    grid(c, 6, 4, C_NORTH, odd);
    for (let k = 0; k < 6; k++) f.decal(rng.pick(['decal_stain_dark', 'decal_trash']), rng.int(c.x0, c.x1), rng.int(c.y0, c.y1), 0.9, 0.9);
    // briefing room
    const br = S.brief.r;     // 10..23 × 14..28
    for (const y of [18, 23]) {
      put(f, 'conference_table', 15, y, 0);
      for (let x = 15; x <= 17; x++) { put(f, 'chair_office', x, y - 1, FACE.s); put(f, 'chair_office', x, y + 2, FACE.n); }
    }
    put(f, 'crt_bank', 11, 14, 0); mount(b, 'whiteboard', 19, 14, 'n'); mount(b, 'clock_wall', br.x0, 20, 'w');
    put(f, 'plant_tall', br.x1, br.y1, 0); put(f, 'filing_cabinet', br.x1, 15, FACE.w, { loot: 'filing' });
    grid(br, 5, 5, C_NORTH, odd);
    f.floorItem('notebook', 16, 19); f.floorItem('pen', 17, 24);
    // offices, records
    for (const key of ['b1', 'b2']) {
      const r = S[key].r;
      const d = put(f, 'desk_office', r.x0 + 2, r.y0 + 1, BACK.n); f.onTop('computer', d);
      put(f, 'chair_office', r.x0 + 2, r.y0 + 2, FACE.n, { yaw: rng.float(-0.6, 0.6) });
      put(f, 'filing_cabinet', r.x0, r.y0, 0, { loot: 'office_drawer' }); put(f, 'bookshelf', r.x0, r.y1 - 1, FACE.e);
      put(f, 'plant_potted', r.x1, r.y1 - 1, 0);
      mount(b, 'painting', r.x0 + 5, r.y0, 'n', { v: rng.int(0, 5) });
      bulb(b, r.x0 + 3, r.y0 + 4, C_NORTH, { kind: 'light_fluoro', flicker: key === 'b2' ? 0.2 : 0 });
      for (let k = 0; k < 3; k++) f.floorItem('paper', rng.int(r.x0, r.x1), rng.int(r.y0 + 3, r.y1));
    }
    const rc = S.records.r;   // 24..37 × 14..19
    for (let x = rc.x0; x <= rc.x1; x++) if (x !== 34) put(f, 'filing_cabinet', x, rc.y0, 0, { loot: 'filing' });
    for (let x = rc.x0 + 1; x <= rc.x1 - 1; x++) if (x % 3 !== 1) put(f, 'filing_cabinet', x, 17, FACE.s, { loot: 'filing' });
    bulb(b, 30, 15, C_NORTH, { kind: 'light_fluoro', broken: true }); bulb(b, 30, 18, C_NORTH, { kind: 'light_fluoro', flicker: 0.3 });
    // the archive: reading room + stacks (the stacks rearrange)
    const ar = S.archive.r;   // 40..73 × 6..28
    const lore = ['experiment_noclip', 'specimen_log', 'continuity_spec', 'log_director_2'];
    lore.forEach((id, k) => {
      const x = 42 + k * 2;
      b.obj('terminal_lab', x, ar.y0, 0, { lore: id });
      put(f, 'chair_office', x, ar.y0 + 1, FACE.n, { yaw: k === 2 ? 0.7 : 0 });
    });
    put(f, 'table_dining', 43, 12, 0); put(f, 'table_dining', 47, 12, 0);
    for (const x of [43, 44, 47, 48]) { put(f, 'chair_wood', x, 11, FACE.s); put(f, 'chair_wood', x, 13, FACE.n); }
    for (let y = 15; y <= 26; y++) if (y !== 20) put(f, 'filing_cabinet', ar.x0, y, FACE.e, { loot: 'filing' });
    put(f, 'copier', 50, ar.y0, 0); put(f, 'lamp_floor', 50, 9, 0);
    mount(b, 'clock_wall', 49, ar.y0, 'n'); mount(b, 'zg_room_plate', 41, ar.y0, 'n', { label: 'ARCHIVE' });
    grid(rect(ar.x0, ar.y0, 51, ar.y1), 5, 5, C_NORTH, odd);
    for (let k = 0; k < 6; k++) f.floorItem(rng.pick(['paper', 'floppy_disk', 'notebook', 'paper']), rng.int(42, 50), rng.int(15, 27));
    stencil(z, 'TIDY', 46.5, 20.5, 2, 0, 0xc8c0a8);
    registerShift(z, 'lab_stacks', 52, ar.y0, ar.x1, ar.y1, 3, (sb, srng, v) => stampStacks(sb, srng, v, rect(52, ar.y0, ar.x1, ar.y1)));
    // the back door of the stacks: out onto the ring, by the janitor's closet
    b.door(ar.x0, 10, 1, 'door_white', { portal: 'lab_closet_back' });
    b.portal({ id: 'lab_closet_back', x: ar.x0, y: 10, kind: 'door', to: 'lab', tx: 36, ty: 58, label: 'Go through the back door', anchor: 'closet_front' });
    anchorAt(b, 'archive_back', ar.x0 + 2, 10, 'e', 1);
    mount(b, 'zg_room_plate', ar.x0, 9, 'w', { label: '?' });
    // director's anteroom
    const an = S.ante.r;      // 76..95 × 21..28
    put(f, 'reception_desk', 79, 24, FACE.s); put(f, 'chair_office', 79, 23, FACE.s);
    put(f, 'waiting_chairs', 78, an.y1, FACE.n); put(f, 'plant_tall', an.x0, an.y0, 0); put(f, 'plant_tall', an.x1, an.y0, 0);
    put(f, 'filing_cabinet', an.x1, 24, FACE.w, { loot: 'office_drawer' }); put(f, 'filing_cabinet', an.x1, 25, FACE.w, { loot: 'filing' });
    mount(b, 'zg_room_plate', 86, an.y0, 'n', { label: 'DIRECTOR' }); mount(b, 'painting', 80, an.y0, 'n', { v: 1 }); mount(b, 'clock_wall', 90, an.y0, 'n');
    grid(an, 5, 4, C_DIR, odd);
    // the director's office: he stayed
    const d = S.director.r;   // 76..95 × 6..20
    const desk = put(f, 'desk_office', 84, 8, BACK.n); f.onTop('lamp_table', desk, { circuit: C_DIR });
    b.obj('terminal_lab', 86, 7, 0, { lore: 'log_director' });
    put(f, 'chair_office', 85, 9, FACE.n);
    for (let y = d.y0 + 1; y <= d.y1 - 1; y++) if (y !== 12) put(f, 'bookshelf', d.x0, y, FACE.e);
    put(f, 'sofa', 79, 17, FACE.n); put(f, 'coffee_table', 79, 15, 0); put(f, 'armchair', 82, 15, FACE.w);
    put(f, 'bed_single', 93, 15, 0); put(f, 'nightstand', 92, 15, 0); put(f, 'lamp_floor', 94, 18, 0);
    put(f, 'tv_crt', 90, 7, 0); put(f, 'globe', 81, 7);
    put(f, 'filing_cabinet', 92, d.y0, 0, { loot: 'filing' }); put(f, 'filing_cabinet', 93, d.y0, 0, { loot: 'filing' });
    mount(b, 'photo_frames', 80, d.y0, 'n', { v: 2 }); mount(b, 'photo_frames', 88, d.y0, 'n', { v: 4 });
    mount(b, 'painting', 82, d.y0, 'n', { v: 3 }); mount(b, 'whiteboard', 89, d.y0, 'n'); mount(b, 'clock_wall', 94, d.y0, 'n');
    decalAt(z, 'carpet_rug', 82, 14, 5, 4, 0, 0x8a5a48);
    for (const [x, y] of [[85, 11], [88, 13], [83, 12], [87, 10]] as const) f.floorItem('paper', x, y);
    f.floorItem('photo_old', 85, 8); f.floorItem('teddy_bear', 93, 16); f.floorItem('mug', 86, 9);
    bulb(b, 80, 13, C_DIR, { kind: 'light_bulb' }); bulb(b, 88, 12, C_DIR, { kind: 'light_bulb', flicker: 0.08 }); bulb(b, 92, 17, C_DIR, { kind: 'light_bulb' });
    // Stair B: the director's private stair down from Alder Lane
    const sb = S.stairb.r;    // 96..103 × 6..28
    b.obj('staircase_up', 99, sb.y0 + 1, 0, { portal: 'r_house_lab' });
    b.portal({ id: 'r_house_lab', x: 99, y: sb.y0 + 1, kind: 'stairs_up', to: 'house', tx: 56, ty: 27, label: 'Climb the stairs to Alder Lane' });
    anchorAt(b, 'p_house_lab', 99, sb.y0 + 5, 's', 3);
    for (let y = sb.y0 + 4; y <= sb.y1 - 2; y += 3) mount(b, 'photo_frames', sb.x0, y, 'w', { v: y % 6, blank: y > 18 });
    mount(b, 'zg_room_plate', 98, sb.y0, 'n', { label: 'STAIR B' });
    for (let y = sb.y0 + 4; y <= sb.y1; y += 6) bulb(b, 100, y, 0, { flicker: y > 20 ? 0.2 : 0 });
    for (let y = sb.y1; y >= sb.y0 + 4; y -= 1.4) decalAt(z, 'decal_footprints', 99.5 + Math.sin(y) * 0.3, y, 0.7, 0.7, -Math.PI / 2, 0x6a5a4a, 0.7);
    f.floorItem('crayons', 101, 20);
  }

  // =====================================================================
  // CENTRAL BLOCK — the Tank Hall and the rooms that watch it
  // =====================================================================
  {
    const t = S.tanks.r;      // 44..67 × 44..67
    b.fillFloor(55, t.y0, 56, t.y1, 'grate');
    b.fillFloor(t.x0, 55, t.x1, 56, 'grate');
    const cols = [47, 50, 53, 58, 61, 64], rows = [47, 50, 53, 58, 61, 64];
    let k = 0;
    const emptyTank = [53, 61];
    for (const y of rows) for (const x of cols) {
      k++;
      if ((x === 47 || x === 64) && (y === 47 || y === 64)) continue;
      const empty = x === emptyTank[0] && y === emptyTank[1];
      b.obj('specimen_tank', x, y, 0, { broken: empty || k % 9 === 4, flicker: k % 7 === 3 ? 0.3 : 0 });
      if (empty) {
        for (let q = 0; q < 4; q++) decalAt(z, 'decal_glass', x + 0.5 + rng.float(-1, 1), y + 0.5 + rng.float(-1, 1), 0.9, 0.9, q);
        decalAt(z, 'decal_puddle', x + 0.5, y + 1.3, 2.2, 1.6, 0.3);
      }
    }
    // wet footprints from the empty tank out through the intake
    for (let q = 0; q < 16; q++) { const yy = 62.5 + q * 0.8; decalAt(z, 'decal_footprints', 54.6 + Math.sin(q * 1.3) * 0.25, yy, 0.6, 0.6, Math.PI / 2, 0x6a8a8a, 0.8); }
    for (let q = 0; q < 4; q++) decalAt(z, 'decal_footprints', 55 + q * 0.9, 75.5, 0.6, 0.6, 0, 0x6a8a8a, 0.6);
    grid(t, 6, 6, C_TANK, () => ({ broken: rng.chance(0.6), flicker: rng.chance(0.3) ? 0.3 : 0 }));
    put(f, 'gurney', 45, 66, 0, { yaw: 0.4 }); put(f, 'hazard_barrier', 57, 66, 0);
    put(f, 'lab_cabinet', t.x1, 45, FACE.w, { loot: 'lab_cabinet' });
    f.floorItem('specimen_jar', 51, 56); f.floorItem('notebook', 59, 55);
    mount(b, 'zg_room_plate', 46, 44, 'n', { label: 'TANK HALL' });
    // observation rooms: desks to the glass
    for (const key of ['obs1', 'obs2']) {
      const r = S[key].r;
      for (let x = r.x0 + 6; x <= r.x1 - 3; x += 4) {
        const dk = put(f, 'desk_office', x, r.y1, BACK.s);
        f.onTop('computer', dk, { lore: key === 'obs1' && x === r.x0 + 6 ? 'terminal' : undefined });
        put(f, 'chair_office', x, r.y1 - 1, FACE.s, { yaw: rng.float(-0.4, 0.4) });
      }
      put(f, 'crt_bank', r.x0 + 1, r.y0, 0); put(f, 'filing_cabinet', r.x1, r.y0, 0, { loot: 'filing' });
      mount(b, 'zg_room_plate', r.x0 + 3, r.y0, 'n', { label: key === 'obs1' ? 'OBS 1' : 'OBS 2' });
      grid(r, 5, 4, C_TANK, () => ({ broken: rng.chance(0.3) }));
    }
    {
      const r = S.obs3.r;
      for (let y = r.y0 + 2; y <= r.y1 - 1; y += 4) { const dk = put(f, 'desk_office', r.x1, y, BACK.e); f.onTop('computer', dk); put(f, 'chair_office', r.x1 - 1, y, FACE.e); }
      mount(b, 'zg_room_plate', r.x0, r.y0 + 1, 'w', { label: 'OBS 3' }); put(f, 'filing_cabinet', r.x0, r.y1, FACE.e, { loot: 'filing' });
      bulb(b, 40, 49, C_TANK, { kind: 'light_fluoro', flicker: 0.25 });
    }
    // store, cold storage, intake, plant
    {
      const r = S.store.r;
      for (let y = r.y0; y <= r.y1; y++) if (y !== 64) put(f, 'shelf_metal', r.x0, y, FACE.e, { loot: y % 2 ? 'lab_cabinet' : 'janitor' });
      put(f, 'janitor_cart', r.x1, r.y1, 0); put(f, 'mop_bucket', r.x1, r.y0, 0);
      bulb(b, 41, 64, C_TANK, { kind: 'light_fluoro' });
      const cs = S.coldstore.r;
      put(f, 'freezer_chest', cs.x0, cs.y0, 0); put(f, 'freezer_chest', cs.x0, cs.y1, FACE.n);
      put(f, 'morgue_drawers', cs.x1 - 1, cs.y0, 0);
      bulb(b, 41, 71, C_TANK, { kind: 'light_fluoro', flicker: 0.15 });
      const it = S.intake.r;
      put(f, 'gurney', 47, 70, 1); put(f, 'gurney', 63, 70, 1, { yaw: 0.3 }); put(f, 'shower_pool', 60, 68, 0);
      put(f, 'lab_bench', 49, 73, FACE.n); put(f, 'lab_bench', 61, 73, FACE.n);
      put(f, 'lab_cabinet', it.x0, 68, FACE.e, { loot: 'lab_cabinet' }); put(f, 'iv_stand', 52, 69);
      grid(it, 6, 3, C_TANK, odd);
      const tp = S.tplant.r;
      for (let y = tp.y0 + 1; y <= tp.y1 - 2; y += 4) { put(f, 'pump_machine', 70, y, FACE.w); put(f, 'valve_wheel', 72, y + 2, FACE.w); }
      for (let y = tp.y0; y <= tp.y1; y += 2) if (y !== 56) mount(b, 'pipes_cluster', tp.x0, y, 'w');
      put(f, 'electrical_cabinet', tp.x1, tp.y1, FACE.w); put(f, 'barrel_oil', tp.x1, tp.y1 - 1);
      for (let y = tp.y0 + 2; y <= tp.y1; y += 6) bulb(b, 70, y, C_TANK, { kind: 'light_bulb', flicker: rng.chance(0.3) ? 0.2 : 0 });
    }
    // the janitor's closet opens into the archive stacks
    b.door(38, 58, 1, 'door_white', { portal: 'lab_closet' });
    b.portal({ id: 'lab_closet', x: 37, y: 58, kind: 'door', to: 'lab', tx: 42, ty: 10, label: 'Open the janitor\'s closet', anchor: 'archive_back' });
    anchorAt(b, 'closet_front', 36, 58, 'w', 1);
    stencil(z, 'HERE', 36.5, 59.6, 1.2, 0, 0xc8c0a8);
  }

  // =====================================================================
  // EAST WING — labs A-C (they rearrange) and the cold room
  // =====================================================================
  for (const key of ['labA', 'labB', 'labC']) {
    const r = S[key].r;
    mount(b, 'zg_room_plate', r.x0, r.y0 + 2, 'w', { label: key === 'labA' ? 'LAB A' : key === 'labB' ? 'LAB B' : 'LAB C' });
    // inside the rect the stamp owns everything; signs stay on the door wall (x0 is the border)
    registerShift(z, 'lab_' + key, r.x0 + 1, r.y0, r.x1, r.y1, 3, (sb, srng, v) => stampLab(sb, srng, v, rect(r.x0 + 1, r.y0, r.x1, r.y1)), { initial: key === 'labB' ? 1 : 0 });
  }
  {
    const r = S.coldroom.r;   // 83..105 × 69..76
    for (let x = r.x0 + 2; x <= r.x1 - 1; x += 2) put(f, 'freezer_chest', x, r.y0, 0, { loot: 'lab_cabinet' });
    for (let x = r.x0 + 2; x <= r.x1 - 1; x += 3) put(f, 'shelf_metal', x, r.y1, FACE.n, { loot: 'lab_cabinet' });
    put(f, 'fridge', r.x1, 72, FACE.w, { loot: 'fridge_office' }); put(f, 'specimen_tank', r.x1, 74, 0);
    mount(b, 'zg_room_plate', r.x0, 71, 'w', { label: 'COLD ROOM' });
    grid(r, 6, 4, C_EAST, () => ({ flicker: rng.chance(0.4) ? 0.25 : 0 }));
    for (let k = 0; k < 6; k++) f.decal('decal_stain_water', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), 1.2, 1.2);
    f.floorItem('specimen_jar', 90, 73);
  }

  // =====================================================================
  // SOUTH WING — Ward B, the server hall, freight, plant
  // =====================================================================
  {
    const w = S.ward.r;       // 8..47 × 82..105
    // the sedation bay: four pods along the north wall. 1, 2 empty. 3 the director. 4 you.
    const pods = [10, 12, 14, 16];
    pods.forEach((x, k) => {
      b.obj('cryo_pod', x, w.y0 + 1, 0, { on: k >= 2, occupant: k === 2 ? 'hale' : k === 3 ? '0411' : '' });
      if (k >= 2) put(f, 'hospital_monitor', x + 1, w.y0 + 1, FACE.s);
    });
    const ns = put(f, 'nightstand', 13, w.y0 + 1, 0);
    itemOn(z, rng, 'keycard_lab', ns);
    stencil(z, '0411', 16.5, w.y0 + 4.2, 1.2, 0, 0x9ad8ff);
    stencil(z, 'WAKE UP', 13.5, w.y0 + 7.5, 2.2, 0, 0xb8c8d0);
    for (const x of pods) decalAt(z, 'decal_parking_line', x + 0.5, w.y0 + 3.6, 0.9, 0.1, 0, 0x9ad8ff, 0.8);
    mount(b, 'zg_room_plate', 9, w.y0, 'n', { label: 'WARD B' });
    // the nurse station
    put(f, 'nurse_station', 23, 87, 0); b.obj('terminal_lab', 25, 87, 0, { lore: 'terminal_lab' });
    put(f, 'chair_office', 24, 88, FACE.n, { yaw: 0.5 }); put(f, 'medical_cabinet', 22, w.y0, 0, { loot: 'hospital_cabinet' });
    put(f, 'medical_cabinet', 23, w.y0, 0, { loot: 'hospital_pharmacy' });
    // beds: two rows in the west half (east half rearranges)
    for (let x = 10; x <= 30; x += 3) {
      put(f, 'bed_hospital', x, 98, 0); if (rng.chance(0.6)) put(f, 'curtain_screen', x + 1, 98, 0);
      if (rng.chance(0.5)) put(f, rng.pick(['iv_stand', 'hospital_monitor']), x + 1, 99);
      put(f, 'bed_hospital', x, 103, FACE.n);
    }
    put(f, 'wheelchair', 19, 93, 0, { yaw: 1.1 }); put(f, 'gurney', 28, 93, 1, { yaw: -0.3 }); put(f, 'iv_stand', 30, 91, 0, { yaw: 0.6 });
    registerShift(z, 'lab_ward_east', 32, w.y0 + 1, w.x1, w.y1, 3, (sb, srng, v) => stampWard(sb, srng, v, rect(32, w.y0 + 1, w.x1, w.y1)));
    grid(rect(w.x0, w.y0, 31, w.y1), 5, 5, C_WARD, () => ({ broken: rng.chance(0.35), flicker: rng.chance(0.2) ? 0.3 : 0 }));
    b.light(13.5, 86, 'screen', { color: 0x9ad8ff, intensity: 0.5, radius: 6, y: 2.2, circuit: 0 });
    for (let k = 0; k < 8; k++) f.floorItem(rng.pick(['paper', 'bandage_dirty', 'syringe', 'paper']), rng.int(w.x0, 31), rng.int(w.y0 + 4, w.y1));
    for (let k = 0; k < 10; k++) f.decal(rng.pick(['decal_stain_dark', 'decal_footprints', 'decal_stain_water']), rng.int(w.x0, 31), rng.int(w.y0 + 3, w.y1), 0.9, 0.9);
    mount(b, 'clock_wall', 30, w.y0, 'n'); mount(b, 'xray_lightbox', 34, w.y0, 'n');

    // server hall SRV-2
    const s = S.server.r;     // 50..83 × 84..105
    const NODE = { x: 66, y: 94 };
    b.fillFloor(NODE.x - 3, NODE.y - 3, NODE.x + 4, NODE.y + 4, 'grate');
    b.fillFloor(NODE.x - 1, NODE.y - 1, NODE.x + 2, NODE.y + 2, 'server', 0.15);
    b.obj('render_node', NODE.x, NODE.y, 0, { node: 'SRV-2' });
    b.obj('terminal_lab', NODE.x + 1, NODE.y + 4, 0, {});
    put(f, 'chair_office', NODE.x + 1, NODE.y + 5, FACE.n, { yaw: 0.4 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; decalAt(z, 'decal_parking_line', NODE.x + 1 + Math.cos(a) * 3, NODE.y + 1 + Math.sin(a) * 3, 4.5, 0.12, -a, 0x16181c, 0.9); }
    for (const xs of [[52, 53], [56, 57], [60, 61], [72, 73], [76, 77], [80, 81]]) {
      for (let y = s.y0 + 2; y <= s.y1 - 2; y++) {
        if (y === 94 || y === 95 || y === 90) continue;
        put(f, 'server_rack', xs[0], y, FACE.w); put(f, 'server_rack', xs[1], y, FACE.e);
      }
    }
    for (let y = s.y0 + 3; y <= s.y1; y += 5) for (const x of [54, 58, 63, 70, 74, 78]) b.light(x + 0.5, y + 0.5, 'screen', { color: 0x3a64ff, intensity: 0.5, radius: 4.5, y: 2.4, circuit: C_SRV, broken: rng.chance(0.25) });
    for (let k = 0; k < 6; k++) { const a = k * 1.05; b.light(NODE.x + 1 + Math.cos(a) * 3.5, NODE.y + 1 + Math.sin(a) * 3.5, 'screen', { color: 0x40e8ff, intensity: 0.4, radius: 4, y: 2.4, circuit: C_SRV }); }
    mount(b, 'zg_room_plate', s.x0 + 2, s.y0, 'n', { label: 'SRV-2' });
    stencil(z, 'SRV-2', NODE.x + 1, NODE.y + 3.6, 1.8, 0, 0x40e8ff);
    f.floorItem('screwdriver', 82, 92);
    f.floorItem('note', NODE.x - 2, NODE.y + 3, { lore: 'note_generic' });
    b.flag(NODE.x - 4, NODE.y - 4, NODE.x + 5, NODE.y + 5, TF.NOSPAWN);

    // freight lobby + the elevator down
    const fr = S.freight.r;   // 84..105 × 79..94
    mount(b, 'elevator_door', 95, fr.y0, 'n', { portal: 'p_lab_core' }); mount(b, 'elevator_door', 96, fr.y0, 'n', {});
    b.portal({ id: 'p_lab_core', x: 95, y: fr.y0, kind: 'elevator', to: 'server', tx: 39, ty: 81, label: 'Take the freight elevator down', locked: 'stage:2' });
    anchorAt(b, 'r_lab_core', 95, fr.y0 + 2, 's', 3);
    mount(b, 'zg_room_plate', 93, fr.y0, 'n', { label: 'FREIGHT' }); mount(b, 'exit_sign', 97, fr.y0, 'n');
    for (let y = fr.y0 + 1; y <= fr.y0 + 4; y++) { decalAt(z, 'decal_parking_line', 94.1, y + 0.5, 1, 0.16, Math.PI / 2, 0xd8b030, 0.9); decalAt(z, 'decal_parking_line', 97.9, y + 0.5, 1, 0.16, Math.PI / 2, 0xd8b030, 0.9); }
    put(f, 'security_desk', 101, 84, FACE.w); put(f, 'chair_office', 100, 84, FACE.e);
    for (const [x, y] of [[87, 87], [88, 87], [87, 88], [103, 91], [102, 92], [103, 92]] as const) put(f, rng.chance(0.5) ? 'crate_wood' : 'pallet_boxes', x, y);
    put(f, 'pallet', 92, 89); put(f, 'pallet', 93, 89); put(f, 'hazard_barrier', 91, 83, 0); put(f, 'hazard_barrier', 99, 83, 0);
    grid(fr, 5, 5, C_SOUTH, () => ({ broken: rng.chance(0.3), flicker: rng.chance(0.2) ? 0.2 : 0 }));
    b.light(95.5, fr.y0 + 1.2, 'emergency', { circuit: 0, intensity: 0.45, radius: 4, flicker: 0.1 });
    f.floorLoot('floor_generic', 90, 92);
    // plant room: geothermal heat exchangers that kept the nodes running after 2003
    const pl = S.plant.r;     // 84..105 × 95..105
    for (const x of [86, 90, 94, 98]) put(f, 'boiler', x, pl.y0 + 1, 0);
    for (const x of [86, 90]) put(f, 'transformer', x, pl.y1 - 1, 0);
    put(f, 'generator', 95, pl.y1); put(f, 'electrical_cabinet', pl.x1, 99, FACE.w); put(f, 'electrical_cabinet', pl.x1, 100, FACE.w);
    mount(b, 'fuse_panel_big', pl.x0, 100, 'w'); mount(b, 'breaker_panel', pl.x0, 102, 'w');
    for (let x = pl.x0; x <= pl.x1; x += 2) if (x < 86 || x > 101) mount(b, 'pipes_cluster', x, pl.y0, 'n');
    for (const x of [87, 95, 103]) b.light(x + 0.5, pl.y0 + 3.5, 'fire', { intensity: 0.6, radius: 4, y: 0.5, circuit: 0, flicker: 0.1 });
    grid(pl, 6, 5, C_SOUTH, odd);
    put(f, 'shelf_metal', pl.x1, pl.y1, FACE.w, { loot: 'maintenance' }); put(f, 'tool_chest', pl.x1, pl.y1 - 1, FACE.w);
  }

  // =====================================================================
  // DRESSING: decals, loot, clutter the evacuation left behind
  // =====================================================================
  for (let k = 0; k < 220; k++) {
    const x = rng.int(6, 105), y = rng.int(6, 105);
    const i = z.idx(x, y);
    if (!z.floor[i] || (z.flags[i] & TF.SHIFT)) continue;
    const corr = R.id[i] === COR;
    f.decal(rng.weighted((corr ? [['decal_footprints', 3], ['decal_stain_water', 2], ['decal_crack', 1], ['decal_stain_dark', 1]] : [['decal_stain_water', 2], ['decal_stain_dark', 2], ['decal_crack', 1], ['decal_mold', 0.5]]) as [string, number][]), x, y, rng.float(0.7, 1.4), rng.float(0.7, 1.4));
  }
  for (let k = 0; k < 14; k++) {
    const x = rng.int(36, 82), y = rng.int(29, 81);
    if (R.id[z.idx(x, y)] !== COR || z.solid[z.idx(x, y)]) continue;
    put(f, rng.pick(['chair_office', 'cardboard_box', 'hazard_barrier', 'trash_can', 'wheelchair']), x, y, rng.int(0, 3) as Rot, { yaw: rng.float(-0.6, 0.6) });
  }
  for (const [x, y] of [[36, 40], [75, 66], [36, 70], [60, 30], [20, 30], [81, 45]] as const) mount(b, 'fire_extinguisher_wall', x, y, x === 36 || x === 81 ? 'w' : 'n');
  scatterLoot(f, rng, 'floor_generic', rect(6, 6, 105, 105), 30);
  scatterLoot(f, rng, 'lab_bench', rect(83, 36, 105, 76), 6);

  // =====================================================================
  // CONNECTIVITY, POWER, ENVIRONMENT
  // =====================================================================
  const a = z.meta.anchors;
  z.meta.anchors = { p_tunnels_lab: a.p_tunnels_lab, p_house_lab: a.p_house_lab, r_lab_core: a.r_lab_core, archive_back: a.archive_back, closet_front: a.closet_front };
  connectRegions(z, b, a.p_tunnels_lab[0], a.p_tunnels_lab[1], rng, { keep: Object.values(S).map((s) => s.r) });
  for (const c of [C_COR, C_NORTH, C_EAST, C_SOUTH, C_TANK, C_SRV, C_WARD, C_DIR]) z.power.set(c, true);
  z.power.set(C_WEST, false);  // the evacuated wing: battery lamps only
  z.env = {
    ...z.env,
    ambient: 0x26303a, ambientI: 0.5, fog: 0x0e1418, fogNear: 10, fogFar: 26, void: 0x050709, temp: 17,
    grade: 'lab', reverb: 'office', ambience: 'lab', music: 'drone',
  };
  z.spawnTable = [['custodian', 2], ['hollow', 1], ['echo', 1], ['employee', 1]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['terminal', 'laptop_meridian', 'terminal_generic'];
  z.meta.shiftRate = 0.9;
  void stash;
}

/** archive stacks: shelving rows that are never in the same order twice */
function stampStacks(b: ZoneBuilder, rng: Rng, v: number, r: Rect) {
  const f = new Furnisher(b, rng);
  const shelf = (x: number, y: number, rot: Rot) => f.place('library_shelf', x, y, rot, {});
  if (v === 0) {
    // east-west rows with a centre aisle
    for (let y = r.y0 + 2; y <= r.y1 - 2; y += 3) for (let x = r.x0 + 1; x + 1 <= r.x1 - 1; x += 2) if (Math.abs(x - 62) > 1) shelf(x, y, 0);
  } else if (v === 1) {
    // north-south rows
    for (let x = r.x0 + 2; x <= r.x1 - 1; x += 3) for (let y = r.y0 + 1; y + 1 <= r.y1 - 1; y += 2) if (Math.abs(y - 17) > 1) shelf(x, y, 1);
  } else {
    // a spiral of shelves around one reading chair
    const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
    for (let ring = 2; ring <= 9; ring += 3) {
      for (let x = cx - ring; x <= cx + ring; x += 2) { if (x !== cx + ring - 1) shelf(x, cy - ring, 0); shelf(x, cy + ring, 0); }
      for (let y = cy - ring + 2; y <= cy + ring - 2; y += 2) { shelf(cx - ring, y, 1); if (y !== cy) shelf(cx + ring, y, 1); }
    }
    f.place('armchair', cx, cy, FACE.n, {}); f.place('lamp_floor', cx + 1, cy, 0, {});
  }
  for (let y = r.y0 + 2; y <= r.y1; y += 5) for (let x = r.x0 + 2; x <= r.x1; x += 5) b.obj('light_fluoro', x, y, 0, { circuit: C_NORTH, broken: rng.chance(0.2), flicker: rng.chance(0.15) ? 0.3 : 0 });
}

/** labs A-C: the equipment is somewhere else every time you look */
function stampLab(b: ZoneBuilder, rng: Rng, v: number, r: Rect) {
  const f = new Furnisher(b, rng);
  const mid = Math.floor((r.y0 + r.y1) / 2);
  for (let x = r.x0 + 2; x <= r.x1; x += 2) f.place(rng.chance(0.7) ? 'fume_hood' : 'lab_cabinet', x, r.y0, 0, {});
  if (v === 0) {
    // two clean rows of benches
    for (const y of [mid - 2, mid + 2]) for (let x = r.x0 + 2; x + 1 <= r.x1 - 2; x += 4) {
      const bn = f.place('lab_bench', x, y, 0, {});
      if (bn && rng.chance(0.6)) f.onTop('centrifuge', bn, {});
      f.place('chair_office', x, y + 1, FACE.n, {});
    }
    f.place('terminal_lab', r.x1, r.y1, FACE.w, {});
    f.place('specimen_tank', r.x1, r.y0 + 2, 0, {});
  } else if (v === 1) {
    // evacuated: benches shoved against the walls, chairs everywhere, a pod left behind
    for (let x = r.x0 + 1; x + 1 <= r.x1 - 1; x += 3) f.place('lab_bench', x, r.y1, FACE.n, {});
    for (let k = 0; k < 7; k++) f.anywhere('chair_office', r.x0 + 1, r.y0 + 2, r.x1 - 1, r.y1 - 2, 10, { yaw: rng.float(-1.5, 1.5) });
    f.place('cryo_pod', Math.floor((r.x0 + r.x1) / 2), mid - 1, 0, {});
    f.anywhere('hazard_barrier', r.x0 + 1, r.y0 + 2, r.x1 - 1, r.y1 - 1, 10, {});
    f.anywhere('gurney', r.x0 + 1, r.y0 + 2, r.x1 - 1, r.y1 - 1, 10, {});
  } else {
    // wrong: every bench faces one tank in the middle, every chair faces it too
    const cx = Math.floor((r.x0 + r.x1) / 2);
    f.place('specimen_tank', cx, mid, 0, {});
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(a) * 6), y = Math.round(mid + Math.sin(a) * 3.2);
      const dx = cx - x, dy = mid - y;
      const rot: Rot = Math.abs(dx) * 0.6 > Math.abs(dy) ? (dx > 0 ? FACE.e : FACE.w) : (dy > 0 ? FACE.s : FACE.n);
      f.place('chair_office', x, y, rot, {});
    }
  }
  for (let y = r.y0 + 2; y <= r.y1; y += 4) for (let x = r.x0 + 2; x <= r.x1; x += 5) b.obj('light_fluoro', x, y, 0, { circuit: C_EAST, broken: rng.chance(v === 1 ? 0.5 : 0.1), flicker: rng.chance(0.2) ? 0.25 : 0 });
}

/** Ward B, east half: the beds are arranged differently every night */
function stampWard(b: ZoneBuilder, rng: Rng, v: number, r: Rect) {
  const f = new Furnisher(b, rng);
  if (v === 0) {
    for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) { f.place('bed_hospital', x, r.y0 + 2, 0, {}); f.place('curtain_screen', x + 1, r.y0 + 2, 0, {}); f.place('bed_hospital', x, r.y1 - 1, FACE.n, {}); }
  } else if (v === 1) {
    // every bed turned to face the north wall
    for (let y = r.y0 + 3; y <= r.y1 - 2; y += 4) for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) f.place('bed_hospital', x, y, FACE.n, {});
  } else {
    // a circle of beds around one chair
    const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      f.place('bed_hospital', Math.round(cx + Math.cos(a) * 5.5), Math.round(cy + Math.sin(a) * 6.5) - 1, 0, {});
    }
    f.place('chair_wood', cx, cy, FACE.n, {});
  }
  for (let y = r.y0 + 3; y <= r.y1; y += 5) for (let x = r.x0 + 2; x <= r.x1; x += 5) b.obj('light_fluoro', x, y, 0, { circuit: C_WARD, broken: rng.chance(0.4), flicker: rng.chance(0.25) ? 0.3 : 0 });
}

defZone({
  key: 'lab', name: 'Facility 4', W: 112, H: 112, depth: 4, gen: (z, s) => generateLab(z, s),
  blurb: 'White corridors, green tanks, a hum under everything. They left in a hurry. Somebody stayed.',
});
