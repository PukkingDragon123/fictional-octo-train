// The Core — CONTINUITY's kernel hall. Long dark aisles of tall racks lit only
// by their own LEDs and a few blue screens; one axis runs from the freight
// elevator, through the glass chamber where core node SRV-3 hums on its dais,
// to an ordinary wooden door under a warm bulb at the far north wall — a door
// that looks like it was always there. Cooling plant and the custodians' bay
// sit behind the freight lobby. Two rack blocks rearrange when unwatched.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { registerShift } from '../shift';
import { anchor, decalAt, lamp, noSpawn, room, wallObj, put, scatterLoot, Rot, FACE } from './meridian_kit';

// hall
const HX0 = 6, HX1 = 89, HY0 = 6, HY1 = 71;
// chamber
const CX0 = 38, CX1 = 57, CY0 = 26, CY1 = 45;
const NODE = { x: 47, y: 35 };
// aisle columns kept clear in rack rows
const AISLE = new Set([18, 19, 32, 33, 46, 47, 48, 49, 62, 63, 76, 77]);
const C_HALL = 1, C_CORE = 2, C_FREIGHT = 3, C_COOL = 4, C_BAY = 5;

const inChamberBand = (x: number, y: number) => x >= CX0 - 2 && x <= CX1 + 2 && y >= CY0 - 2 && y <= CY1 + 2;

function blueLight(b: ZoneBuilder, x: number, y: number, o: { i?: number; r?: number; flicker?: number; broken?: boolean; circuit?: number; color?: number } = {}) {
  return b.light(x + 0.5, y + 0.5, 'screen', { color: o.color ?? 0x3a64ff, intensity: o.i ?? 0.55, radius: o.r ?? 5, y: 2.4, flicker: o.flicker ?? 0, broken: o.broken ?? false, circuit: o.circuit ?? C_HALL });
}

/** a back-to-back pair of rack rows: y faces north, y+1 faces south */
function rackPair(b: ZoneBuilder, rng: Rng, y: number, xa: number, xb: number, skip: (x: number, y: number) => boolean, gapEvery = 9) {
  let run = 0;
  for (let x = xa; x <= xb; x++) {
    if (AISLE.has(x) || skip(x, y)) { run = 0; continue; }
    run++;
    if (gapEvery && run > gapEvery) { run = 0; continue; }      // service gap through the row
    if (!b.z.objectsAt(x, y).length) b.obj('server_rack', x, y, FACE.n, {});
    if (!b.z.objectsAt(x, y + 1).length) b.obj('server_rack', x, y + 1, FACE.s, {});
  }
}

function generateServer(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  z.name = 'The Core';

  // ------------------------------------------------------------ hall shell
  room(b, 'Kernel Hall', 'server_hall', HX0, HY0, HX1, HY1, { floor: 'server', wall: 'server', circuit: C_HALL, temp: 16 });
  b.paper(HX0, HY0, HX1, HY1, 'wall_server');

  // ------------------------------------------------------------ the chamber
  room(b, 'Core Chamber', 'core', CX0, CY0, CX1, CY1, { floor: 'server', wall: 'glass', circuit: C_CORE, temp: 18 });
  for (let x = 46; x <= 49; x++) { b.gap(x, CY0, 0); b.gap(x, CY1 + 1, 0); }
  for (let y = 34; y <= 37; y++) { b.gap(CX0, y, 1); b.gap(CX1 + 1, y, 1); }
  // server-wall corner posts so the glass box reads as structure
  for (const [x, y] of [[CX0, CY0], [CX1, CY0], [CX0, CY1], [CX1, CY1]] as const) b.obj('server_rack', x, y, 0, {});
  b.fillFloor(43, 31, 52, 40, 'grate');
  b.fillFloor(45, 33, 50, 38, 'server', 0.15);
  b.obj('render_node', NODE.x, NODE.y, 0, { node: 'SRV-3' });
  const console_ = b.obj('terminal_lab', 47, 40, 0, { lore: 'core_console' });
  void console_;
  b.obj('chair_office', 47, 41, FACE.n, {});
  b.obj('skeleton', 49, 41, 1, {});
  f.floorItem('flashlight', 50, 41);
  // ring of racks facing the node
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.26;
    const x = Math.round(NODE.x + 0.5 + Math.cos(a) * 7.2 - 0.5), y = Math.round(NODE.y + 0.5 + Math.sin(a) * 7.2 - 0.5);
    if ((x >= 46 && x <= 49) || (y >= 34 && y <= 37)) continue;
    const dx = NODE.x + 1 - (x + 0.5), dy = NODE.y + 1 - (y + 0.5);
    const rot: Rot = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? FACE.e : FACE.w) : (dy > 0 ? FACE.s : FACE.n);
    put(f, 'server_rack', x, y, rot, {});
  }
  put(f, 'tape_mainframe', CX0 + 1, CY0 + 1, 0, {});
  put(f, 'tape_mainframe', CX1 - 2, CY0 + 1, 0, {});
  put(f, 'crt_bank', CX0 + 1, CY1 - 1, FACE.n, {});
  put(f, 'crt_bank', CX1 - 2, CY1 - 1, FACE.n, {});
  // cables from the node to the racks
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const len = rng.float(5, 8);
    decalAt(z, 'decal_parking_line', NODE.x + 1 + Math.cos(a) * len / 2, NODE.y + 1 + Math.sin(a) * len / 2, len, 0.14, -a, 0x16181c, 0.9);
  }
  for (let i = 0; i < 6; i++) f.decal('decal_glitch', rng.int(43, 52), rng.int(31, 40), rng.float(0.6, 1.2), rng.float(0.6, 1.2));
  // light: the node itself, a cyan ring, a cold lamp over the console
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.light(NODE.x + 1 + Math.cos(a) * 5, NODE.y + 1 + Math.sin(a) * 5, 'screen', { color: 0x40e8ff, intensity: 0.45, radius: 5, y: 2.5, circuit: C_CORE, flicker: k === 3 ? 0.2 : 0 });
  }
  lamp(b, 47, 41, C_CORE, { flicker: 0.05 });
  b.flag(CX0, CY0, CX1, CY1, TF.NOSPAWN);

  // ------------------------------------------------------------ rack rows
  const skipBand = (x: number, y: number) => inChamberBand(x, y) || inChamberBand(x, y + 1);
  const pairs = [9, 15, 21, 29, 35, 41, 51, 57, 63];
  // (the two shifting blocks below re-stamp their own part of these rows)
  for (const y of pairs) rackPair(b, rng, y, 8, 87, skipBand);
  // the decommissioned strip: racks pulled, cable trays left behind
  for (let x = 66; x <= 87; x += 3) { put(f, 'pallet', x, 68, 0, {}); if (rng.chance(0.5)) put(f, 'cardboard_box', x + 1, 68, 0, {}); }
  for (let x = 8; x <= 30; x += 4) put(f, 'barrel_oil', x, 69, 0, {});

  // aisle lighting: blue screens over the cold aisles, mostly dead toward the edges
  for (let y = 12; y <= 68; y += 6) for (let x = 10; x <= 86; x += 7) {
    if (inChamberBand(x, y)) continue;
    if (z.solid[z.idx(x, y)]) continue;
    const edge = x < 20 || x > 76;
    blueLight(b, x, y, { broken: rng.chance(edge ? 0.55 : 0.2), flicker: rng.chance(0.15) ? 0.3 : 0, i: rng.float(0.4, 0.6) });
  }
  // a cold strip light down the central axis
  for (let y = 8; y <= 70; y += 5) if (!inChamberBand(47, y)) lamp(b, 47, y, C_HALL, { flicker: rng.chance(0.2) ? 0.2 : 0, broken: rng.chance(0.15) });

  // ------------------------------------------------------------ shifting rack blocks
  const rackBlock = (id: string, x0: number, y0: number, x1: number, y1: number) => registerShift(z, id, x0, y0, x1, y1, 4, (sb, srng, v) => {
    sb.fillFloor(x0, y0, x1, y1, 'server');
    const sf = new Furnisher(sb, srng);
    if (v === 0) {
      for (let y = y0 + 2; y + 1 <= y1 - 1; y += 6) rackPair(sb, srng, y, x0, x1, () => false);
    } else if (v === 1) {
      // rows turned ninety degrees
      for (let x = x0 + 1; x + 1 <= x1; x += 5) for (let y = y0 + 1; y <= y1 - 1; y++) {
        if ((y - y0) % 9 === 8) continue;
        sb.obj('server_rack', x, y, FACE.w, {}); sb.obj('server_rack', x + 1, y, FACE.e, {});
      }
    } else if (v === 2) {
      // one row missing; something sat down in the gap
      for (let y = y0 + 2; y + 1 <= y1 - 1; y += 6) if (y !== y0 + 8) rackPair(sb, srng, y, x0, x1, () => false, 0);
      sb.obj('skeleton', x0 + 6, y0 + 9, 0, {});
      sb.obj('chair_office', x0 + 7, y0 + 9, FACE.w, {});
    } else {
      // a maze of half-rows
      for (let y = y0 + 1; y <= y1 - 1; y += 3) {
        const off = ((y - y0) / 3) % 2 === 0 ? 0 : 4;
        for (let x = x0 + off; x <= x1; x++) if ((x - x0 - off) % 8 < 5) sb.obj('server_rack', x, y, ((y - y0) / 3) % 2 === 0 ? FACE.s : FACE.n, {});
      }
    }
    for (let y = y0 + 3; y <= y1; y += 6) for (let x = x0 + 3; x <= x1; x += 7) if (!sb.z.solid[sb.z.idx(x, y)]) blueLight(sb, x, y, { broken: srng.chance(0.3), i: 0.5 });
    void sf;
  });
  rackBlock('core_rows_w', 8, 50, 31, 67);
  rackBlock('core_rows_ne', 64, 8, 87, 24);

  // ------------------------------------------------------------ the door that was always there
  {
    const dx = 47, dy = HY0;
    b.door(dx, dy, 0, 'door_wood', { portal: 'p_core_exit' });
    b.portal({ id: 'p_core_exit', x: dx, y: dy, kind: 'door', to: 'exit', tx: 24, ty: 38, label: 'Open the door', locked: 'stage:3' });
    b.light(dx + 0.5, dy + 1.2, 'bulb', { color: 0xffb468, intensity: 1.15, radius: 5.5, y: 2.3, circuit: 0 });
    wallObj(b, 'clock_wall', dx - 1, dy, 'n', {});
    wallObj(b, 'painting', dx + 1, dy, 'n', { v: 2 });
    put(f, 'plant_potted', dx - 2, dy, 0, {});
    put(f, 'chair_wood', dx + 2, dy, FACE.s, {});
    decalAt(z, 'decal_footprints', dx + 0.5, dy + 1.6, 0.7, 0.9, -Math.PI / 2, 0x8a8478, 0.4);
    z.meta.alwaysDoor = [dx, dy];
  }

  // ------------------------------------------------------------ freight lobby (arrival)
  const LX0 = 38, LX1 = 57, LY0 = 74, LY1 = 88;
  room(b, 'Freight Lobby', 'freight', LX0, LY0, LX1, LY1, { floor: 'concrete', wall: 'concrete', circuit: C_FREIGHT, temp: 15 });
  // the throat between the lobby and the hall
  b.fillFloor(46, HY1 + 1, 49, LY0 - 1, 'concrete');
  b.vwall(46, HY1 + 1, LY0 - 1, 'server'); b.vwall(50, HY1 + 1, LY0 - 1, 'server');
  for (let x = 46; x <= 49; x++) { b.gap(x, HY1 + 1, 0); b.gap(x, LY0, 0); }
  b.addRoom('Freight Lobby', 'freight', 46, HY1 + 1, 49, LY0 - 1, { circuit: C_FREIGHT });
  {
    const ex = LX0, ey = 81;
    const el = wallObj(b, 'elevator_door', ex, ey, 'w', { portal: 'r_lab_core' });
    wallObj(b, 'elevator_door', ex, ey + 1, 'w', {});
    if (el) b.portal({ id: 'r_lab_core', x: ex, y: ey, kind: 'elevator', to: 'lab', tx: 56, ty: 56, label: 'Take the freight elevator up' });
    anchor(z, 'p_lab_core', ex + 1, ey, 'e');
    noSpawn(b, ex + 2, ey, 4);
    for (let y = ey - 1; y <= ey + 2; y++) decalAt(z, 'decal_parking_line', ex + 1.6, y + 0.5, 1, 0.16, Math.PI / 2, 0xd8b030, 0.9);
    wallObj(b, 'exit_sign', ex, ey - 2, 'w', {});
  }
  put(f, 'security_desk', 52, 79, FACE.w, {});
  put(f, 'chair_office', 51, 79, FACE.e, {});
  put(f, 'cctv_monitors', 55, LY0, 0, {});
  for (const [x, y] of [[42, 86], [43, 86], [42, 85], [55, 86], [56, 86]] as const) put(f, rng.chance(0.5) ? 'crate_wood' : 'pallet_boxes', x, y, 0, {});
  put(f, 'hazard_barrier', 45, 76, 0, {}); put(f, 'hazard_barrier', 50, 76, 0, {});
  put(f, 'pallet', 47, 84, 0, {});
  lamp(b, 40, 81, C_FREIGHT, { flicker: 0.08 });
  lamp(b, 44, 78, C_FREIGHT); lamp(b, 51, 78, C_FREIGHT, { flicker: 0.1 }); lamp(b, 44, 84, C_FREIGHT); lamp(b, 51, 84, C_FREIGHT, { broken: true });
  wallObj(b, 'noticeboard', 48, LY0, 'n', {});
  f.floorLoot('floor_generic', 53, 83);
  for (let i = 0; i < 8; i++) f.decal(rng.pick(['decal_stain_dark', 'decal_crack', 'decal_footprints', 'decal_stain_water']), rng.int(LX0, LX1), rng.int(LY0, LY1), rng.float(0.8, 1.5), rng.float(0.8, 1.5));

  // ------------------------------------------------------------ cooling plant (west)
  const KX0 = 6, KX1 = 34, KY0 = 74, KY1 = 90;
  room(b, 'Cooling Plant', 'cooling', KX0, KY0, KX1, KY1, { floor: 'concrete', wall: 'concrete', circuit: C_COOL, temp: 9 });
  b.fillFloor(20, HY1 + 1, 21, KY0 - 1, 'grate');
  b.vwall(20, HY1 + 1, KY0 - 1, 'concrete'); b.vwall(22, HY1 + 1, KY0 - 1, 'concrete');
  for (const x of [20, 21]) { b.gap(x, HY1 + 1, 0); b.gap(x, KY0, 0); }
  b.addRoom('Cooling Plant', 'cooling', 20, HY1 + 1, 21, KY0 - 1, { circuit: C_COOL });
  b.fillFloor(KX1 + 1, 78, LX0 - 1, 78, 'concrete');
  b.hwall(KX1 + 1, LX0 - 1, 78, 'concrete'); b.hwall(KX1 + 1, LX0 - 1, 79, 'concrete');
  b.gap(KX1 + 1, 78, 1); b.door(LX0, 78, 1, 'door_metal', { sign: 'danger' });
  b.addRoom('Cooling Plant', 'cooling', KX1 + 1, 78, LX0 - 1, 78, { circuit: C_COOL });
  b.fillFloor(KX0, 82, KX1, 90, 'grate');
  for (let x = 8; x <= 28; x += 5) put(f, 'boiler', x, 76, 0, {});
  put(f, 'pump_machine', 9, 84, 0, {}); put(f, 'pump_machine', 13, 84, 0, {}); put(f, 'pump_machine', 17, 84, 0, {});
  put(f, 'transformer', 25, 87, 0, {});
  for (let y = 82; y <= 88; y += 2) put(f, 'electrical_cabinet', KX1, y, FACE.w, {});
  put(f, 'water_heater', 31, 76, 0, {});
  put(f, 'shelf_metal', KX0, 88, FACE.e, { loot: 'maintenance' });
  put(f, 'tool_chest', KX0, 86, FACE.e, {});
  put(f, 'barrel_oil', 22, 89, 0, {}); put(f, 'barrel_oil', 23, 89, 0, {});
  for (let x = KX0 + 1; x <= KX1; x += 3) wallObj(b, 'pipes_cluster', x, KY0, 'n', {});
  for (let y = KY0 + 2; y <= KY1; y += 3) wallObj(b, 'pipes_cluster', KX0, y, 'w', {});
  wallObj(b, 'breaker_panel', KX0 + 2, KY0, 'n', {});
  lightGridCool(b, rng, KX0, KY0, KX1, KY1);
  for (let i = 0; i < 14; i++) f.decal(rng.pick(['decal_puddle', 'decal_stain_water', 'decal_stain_dark', 'decal_mold']), rng.int(KX0, KX1), rng.int(KY0 + 4, KY1), rng.float(0.8, 1.8), rng.float(0.8, 1.8));
  for (let i = 0; i < 6; i++) { const x = rng.int(KX0, KX1 - 3), y = rng.int(KY0 + 5, KY1 - 2); b.fillFloor(x, y, x + rng.int(1, 3), y + rng.int(0, 2), 'concrete_wet'); }
  f.floorLoot('tools_small', 20, 88);
  f.floorItem('fuse', 12, 88);

  // ------------------------------------------------------------ the custodians' bay (east)
  const BX0 = 61, BX1 = 89, BY0 = 74, BY1 = 90;
  room(b, 'Custodial Bay', 'custodian', BX0, BY0, BX1, BY1, { floor: 'concrete', wall: 'concrete', circuit: C_BAY, temp: 15 });
  b.fillFloor(74, HY1 + 1, 75, BY0 - 1, 'concrete');
  b.vwall(74, HY1 + 1, BY0 - 1, 'concrete'); b.vwall(76, HY1 + 1, BY0 - 1, 'concrete');
  for (const x of [74, 75]) { b.gap(x, HY1 + 1, 0); b.gap(x, BY0, 0); }
  b.addRoom('Custodial Bay', 'custodian', 74, HY1 + 1, 75, BY0 - 1, { circuit: C_BAY });
  b.fillFloor(LX1 + 1, 80, BX0 - 1, 80, 'concrete');
  b.hwall(LX1 + 1, BX0 - 1, 80, 'concrete'); b.hwall(LX1 + 1, BX0 - 1, 81, 'concrete');
  b.door(LX1 + 1, 80, 1, 'door_metal', { sign: 'staff' }); b.gap(BX0, 80, 1);
  b.addRoom('Custodial Bay', 'custodian', LX1 + 1, 80, BX0 - 1, 80, { circuit: C_BAY });
  // everything in perfect rows: carts, buckets, lockers
  for (let x = 64; x <= 86; x += 2) put(f, 'janitor_cart', x, 77, FACE.s, {});
  for (let x = 64; x <= 86; x += 2) put(f, 'mop_bucket', x, 79, 0, {});
  for (let x = 64; x <= 75; x++) put(f, 'locker', x, BY1, FACE.n, { loot: 'janitor' });
  put(f, 'workbench', 80, 88, FACE.n, {});
  put(f, 'shelf_metal', BX1, 84, FACE.w, { loot: 'janitor' });
  put(f, 'shelf_metal', BX1, 85, FACE.w, { loot: 'maintenance' });
  put(f, 'survivor_stash', 84, 84, 0, {});
  put(f, 'bed_single', 86, 86, 0, {});
  for (let x = 66; x <= 86; x += 5) lamp(b, x, 82, C_BAY, { flicker: x === 76 ? 0.3 : 0, broken: x === 86 });
  wallObj(b, 'clock_wall', 70, BY0, 'n', {});
  f.floorLoot('floor_generic', 70, 84);

  // ------------------------------------------------------------ hall scatter
  const hallFree = (x: number, y: number) => !inChamberBand(x, y);
  scatterLoot(f, 'floor_generic', HX0 + 1, HY0 + 1, HX1 - 1, HY1 - 1, 18, (x, y) => !hallFree(x, y));
  scatterLoot(f, 'anomaly_bits', CX0 + 2, CY0 + 2, CX1 - 2, CY1 - 2, 3);
  for (let i = 0; i < 70; i++) {
    const x = rng.int(HX0, HX1), y = rng.int(HY0, HY1);
    if (z.solid[z.idx(x, y)] || (z.flags[z.idx(x, y)] & TF.SHIFT)) continue;
    const t = rng.weighted([['decal_stain_dark', 3], ['decal_footprints', 2], ['decal_scorch', 1], ['decal_crack', 1], ['decal_glitch', 0.6]] as [string, number][]);
    f.decal(t, x, y, rng.float(0.7, 1.4), rng.float(0.7, 1.4));
  }
  // older noclippers who got this far
  for (const [x, y] of [[25, 26], [70, 48]] as const) { if (!z.solid[z.idx(x, y)]) { b.obj('skeleton', x, y, rng.int(0, 3) as Rot, {}); f.floorItem('note', x + 1, y, { lore: 'note_generic' }); } }
  wallObj(b, 'exit_sign', HX0 + 1, HY0, 'n', {});
  wallObj(b, 'fire_extinguisher_wall', HX0, 30, 'w', {});
  wallObj(b, 'fire_extinguisher_wall', HX0, 60, 'w', {});
  for (let y = HY0 + 4; y < HY1; y += 9) wallObj(b, 'vent_wall', HX0, y, 'w', {});

  // ------------------------------------------------------------ env
  for (const c of [C_HALL, C_CORE, C_FREIGHT, C_COOL, C_BAY]) z.power.set(c, true);
  z.env = {
    ...z.env,
    ambient: 0x101a2c, ambientI: 0.5, fog: 0x050912, fogNear: 9, fogFar: 27, void: 0x020306, temp: 16,
    grade: 'server', reverb: 'server', ambience: 'server', music: '',
  };
  z.spawnTable = [['custodian', 3], ['sentinel', 1]];
  z.creatureCap = 5;
  z.meta.terminalLore = ['terminal', 'core_console'];
  z.meta.shiftRate = 1.2;
}

function lightGridCool(b: ZoneBuilder, rng: Rng, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0 + 2; y <= y1; y += 4) for (let x = x0 + 2; x <= x1; x += 5) {
    if (b.z.solid[b.z.idx(x, y)]) continue;
    lamp(b, x, y, C_COOL, { broken: rng.chance(0.25), flicker: rng.chance(0.2) ? 0.25 : 0 });
  }
}

defZone({
  key: 'server', name: 'The Core', W: 96, H: 96, depth: 5, gen: (z, s) => generateServer(z, s),
  blurb: 'Racks to the edge of the light. Something at the centre is breathing in binary.',
});
