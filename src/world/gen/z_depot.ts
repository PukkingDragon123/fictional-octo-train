// Interchange 0 — the Depot (192×72). A 1990 bus and rail interchange that
// does not end: walk far enough east or west and you are back where you
// started (the whole level repeats every 128 tiles; only the middle third is
// unique). From north to south: the bus lane and its bays under sodium
// lamps (dead coaches NOT IN SERVICE, one bay — Bay 0 — kept clear for the
// transport that takes paid-up debtors home), the bus platform, the glass
// wall, the concourse (dot-matrix boards listing places nobody can go,
// benches, the ticket booth), a row of rooms (waiting rooms, toilets, a
// cafe, left luggage, lost property, the stairs up to Level 0, the staff door
// to Annex B), and Platform 0, whose edge drops onto a track bed and then
// into a dark that has no other side.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, type Rot, arrive, put, force, mount, decal, hh, hopperAt, loopSeamsX, lamp, itemAtW, isOpen } from './weird_kit';
import { BAY_LABELS } from '../../content/furniture/zw_surfaces';
import { objDef } from '../objects';

const W = 192, H = 72;
const X0 = 20, P = 32;                      // module origin and period
const XW = 32, XE = 159, LOOP = 128;         // seams: 32 → 160, 159 → 31
// rows
const LANE0 = 2, LANE1 = 9, BAY0 = 10, BAY1 = 21, WALK0 = 22, WALK1 = 25;
const CON0 = 26, CON1 = 43, ROOM0 = 44, ROOM1 = 55, PLAT0 = 56, PLAT1 = 63, TRACK0 = 64, TRACK1 = 65;
// circuits
const C_DECK = 1, C_HALL = 2, C_ROOMS = 3, C_PLAT = 4, C_STAFF = 5;
/** the bay the transport pulls into (unique module 1, bay u 18..23) */
const B0X = 70, B0X1 = 75;

const U = (x: number) => (((x - X0) % P) + P) % P;
const modOf = (x: number) => Math.floor((x - X0) / P);

export function generateDepot(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'Interchange 0 — The Depot';
  const anchors: Record<string, number[]> = (z.meta.anchors ||= {});
  void anchors;

  // ============================================================ shell: floors, heights, long walls
  b.fillFloor(0, LANE0, W - 1, BAY1, 'parking');
  b.paper(0, LANE0, W - 1, BAY1, 'wall_garage');
  b.fillFloor(0, WALK0, W - 1, WALK1, 'concrete', 0.15);
  b.paper(0, WALK0, W - 1, WALK1, 'zw_wall_depot');
  b.fillFloor(0, CON0, W - 1, CON1, 'terrazzo');
  b.paper(0, CON0, W - 1, CON1, 'zw_wall_depot');
  b.fillFloor(0, ROOM0, W - 1, ROOM1, 'linoleum');
  b.paper(0, ROOM0, W - 1, ROOM1, 'zw_wall_depot');
  b.fillFloor(0, PLAT0, W - 1, PLAT1, 'concrete');
  b.paper(0, PLAT0, W - 1, PLAT1, 'zw_wall_depot');
  b.fillFloor(0, TRACK0, W - 1, TRACK1, 'concrete', -1.1);
  // kerb islands between bays are raised like the platform
  for (let x = 0; x < W; x++) if (U(x) % 8 < 2) b.fillFloor(x, BAY0, x, BAY1, 'concrete', 0.15);
  b.hwall(0, W - 1, LANE0, 'concrete');
  b.hwall(0, W - 1, CON0, 'glass');
  b.hwall(0, W - 1, ROOM0, 'drywall');
  b.hwall(0, W - 1, PLAT0, 'drywall');
  b.vwall(0, LANE0, PLAT1, 'concrete'); b.vwall(W, LANE0, PLAT1, 'concrete');

  b.addRoom('Bus Deck', 'bus_deck', 0, LANE0, W - 1, WALK1, { circuit: C_DECK, temp: 12 });
  b.addRoom('Concourse', 'concourse', 0, CON0, W - 1, CON1, { circuit: C_HALL, temp: 15 });
  b.addRoom('Platform 0', 'platform', 0, PLAT0, W - 1, TRACK1, { circuit: C_PLAT, temp: 11 });

  // ============================================================ modules
  for (let ms = X0 - 2 * P; ms < W; ms += P) {
    const k = Math.round((ms - X0) / P);
    if (k === 1) moduleOne(c, ms);
    else if (k === 2) moduleTwo(c, ms);
    else periodicModule(c, ms);
  }

  // ============================================================ the same everywhere: lane paint, lamps, track
  for (let x = 0; x < W; x++) {
    const u = U(x);
    // lane centre line and the lamps over the lane
    if (u % 4 < 2) decal(z, 'decal_parking_line', x + 0.5, 5.95, 1.0, 0.12, 0, 0xe8c040, 0.8);
    if (u % 8 === 4) {
      const dead = hh(u, 1, 9101) < 0.2;
      lamp(b, x, 5, 'sodium', C_DECK, { intensity: 1.0, radius: 8, y: 3.6, broken: dead, flicker: hh(u, 2, 9102) < 0.2 ? 0.15 : 0 });
      lamp(b, x, 16, 'sodium', C_DECK, { intensity: 0.85, radius: 7, y: 3.4, broken: hh(u, 3, 9103) < 0.25 });
    }
    if (u % 4 === 2) lamp(b, x, 24, 'fluoro', C_DECK, { intensity: 0.5, radius: 4.5, broken: hh(u, 4, 9104) < 0.15, flicker: hh(u, 5, 9105) < 0.15 ? 0.2 : 0 });
    // concourse lighting grid
    if (u % 4 === 2) for (const y of [29, 33, 37, 41]) lamp(b, x, y, 'fluoro', C_HALL, { broken: hh(u, y, 9106) < 0.08, flicker: hh(u, y, 9107) < 0.08 ? 0.25 : 0 });
    // platform lamps: a long line, half of them gone
    if (u % 4 === 1) lamp(b, x, 59, 'sodium', C_PLAT, { intensity: 0.75, radius: 6, y: 3.0, broken: hh(u, 6, 9108) < 0.4, flicker: hh(u, 7, 9109) < 0.2 ? 0.2 : 0 });
    // the platform edge: tactile strip; then the track bed
    decal(z, 'zw_tactile', x + 0.5, PLAT1 + 0.72, 1.0, 0.5, 0, undefined, 1);
    decal(z, 'zw_tactile', x + 0.5, WALK0 + 0.28, 1.0, 0.5, Math.PI, undefined, 1);
    for (let y = TRACK0; y <= TRACK1; y++) b.obj('zw_track', x, y, 0, { v: hh(u, y, 9110) < 0.06 ? 1 : 0 });
    // periodic grime
    for (let y = LANE0; y <= PLAT1; y++) {
      const r = hh(u, y, 9111);
      if (r < 0.025) decal(z, y < WALK0 ? 'decal_stain_dark' : 'decal_stain_water', x + 0.5, y + 0.5, 1.1 + r * 20, 1.0 + r * 16, r * 300, y < WALK0 ? 0x2a2418 : undefined, 0.8);
      else if (r < 0.034 && y >= CON0 && y <= CON1) decal(z, 'decal_footprints', x + 0.5, y + 0.5, 1, 1, r * 700);
    }
  }
  // nothing spawns where only the eye can reach, and the track bed is no place to stand
  b.flag(0, 0, XW, H - 1, TF.NOSPAWN); b.flag(XE, 0, W - 1, H - 1, TF.NOSPAWN);

  // ============================================================ seams (the interchange never ends)
  loopSeamsX(b, XW, XE, LOOP, LANE0, PLAT1, 'depot_loop');

  // ============================================================ env, power, creatures
  for (const cc of [C_DECK, C_HALL, C_ROOMS, C_PLAT, C_STAFF]) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0x2a2418, ambientI: 0.48, fog: 0x16110a, fogNear: 12, fogFar: 30, void: 0x050403, temp: 13,
    grade: 'parking', reverb: 'hall', ambience: 'parking', music: 'drone',
  };
  z.spawnTable = [['still_life', 3], ['hollow', 1.5], ['employee', 1], ['grinhound', 1], ['sentinel', 1], ['echo', 0.8], ['occupant', 0.3], ['gloam', 0.8], ['stammer', 0.8]];
  z.creatureCap = 7;
  z.meta.terminalLore = ['zw_depot_notice', 'terminal_generic'];
  z.meta.transportBay = { x0: B0X, y0: BAY0, x1: B0X1, y1: BAY1, face: -Math.PI / 2, laneY: [LANE0, LANE1], entry: [B0X + 3, LANE1] };
}

// ============================================================ the repeating module
function periodicModule(c: Ctx, ms: number) {
  bays(c, ms, false);
  walkway(c, ms);
  concourse(c, ms, false);
  // south block: passage, waiting room, toilets, cafe, left luggage, quiet room
  passage(c, ms);
  waitingRoom(c, ms + 4, ms + 11);
  toilets(c, ms + 12, ms + 17);
  cafe(c, ms + 18, ms + 23);
  leftLuggage(c, ms + 24, ms + 27);
  quietRoom(c, ms + 28, ms + 31);
  platform(c, ms, false);
}

// ---------------------------------------------------------------- bays
function bays(c: Ctx, ms: number, unique: boolean) {
  const { b, z } = c;
  for (let k = 0; k < 4; k++) {
    const ix = ms + k * 8, bx0 = ix + 2, bx1 = ix + 7;
    const u = k * 8;
    // island: pillar, stop pole at the walkway end, a bin
    put(c, 'zw_depot_pillar', ix, 15, 0, { label: ['BAY 7', 'BAY 13', 'BAY 0', 'BAY 7'][k] });
    put(c, 'zw_stop_pole', ix + 1, BAY1, 0, {});
    put(c, 'trash_can_outdoor', ix + 1, BAY0 + 1, 0, {});
    if (unique && bx0 === B0X) continue; // Bay 0 is dressed separately
    const r = hh(u, 0, 9201);
    // bay number painted at the platform end
    decal(z, 'zw_bay_' + [1, 2, 3, 4, 1, 2, 3, 4][k + (unique ? 4 : 0)], bx0 + 3, BAY1 - 0.5, 2.0, 0.875, 0, undefined, 0.9);
    if (r < 0.45) {
      // a coach that will never leave
      if (b.free(bx0 + 1, BAY0, 3, 11)) b.obj('zw_coach', bx0 + 1, BAY0, 0, {});
      if (hh(u, 1, 9202) < 0.5) put(c, 'zw_suitcase', bx0 + 4, BAY1 - 1, 0, { v: k });
    } else if (r < 0.7) {
      for (let i = 0; i < 4; i++) decal(z, 'zw_hatch', bx0 + 3, BAY0 + 2 + i * 2.2, 5.2, 2.0, 0, undefined, 0.75);
      put(c, 'traffic_cone', bx0 + 1, BAY0 + 3, 0, {}); put(c, 'traffic_cone', bx0 + 4, BAY0 + 8, 0, {});
    } else {
      // luggage left in the bay as if a coach had just unloaded and gone
      put(c, 'zw_luggage_pile', bx0 + 2, BAY1 - 2, 0, { v: k });
      put(c, 'zw_luggage_trolley', bx0 + 4, BAY1 - 3, 1, {});
      put(c, 'zw_suitcase', bx0 + 1, BAY1 - 4, 0, { v: k + 2 });
    }
  }
}

function walkway(c: Ctx, ms: number) {
  for (let k = 0; k < 4; k++) {
    const ix = ms + k * 8;
    put(c, 'zw_bench_steel', ix + 3, WALK1 - 1, 2, {});
    if (k % 2 === 0) put(c, 'trash_can_outdoor', ix + 6, WALK1, 0, {});
    // departure boards on the concourse side of the glass, double doors under the middle of each bay
    for (const dx of [4, 5]) c.b.door(ix + dx, CON0, 0, 'door_glass', { open: true });
    if (k % 2 === 1) mount(c.b, 'zw_departures', ix + 1, CON0, 'n', { v: k });
  }
}

// ---------------------------------------------------------------- concourse
function concourse(c: Ctx, ms: number, unique: boolean) {
  const { b } = c;
  for (let k = 0; k < 4; k++) {
    const ix = ms + k * 8;
    put(c, 'zw_depot_pillar', ix, 31, 0, { label: k % 2 ? 'DEPARTURES' : 'ARRIVALS' });
    put(c, 'zw_depot_pillar', ix, 38, 0, { label: ['PLATFORM 0', 'BAY 0', 'PLATFORM 9', 'NO EXIT'][k] });
    if (unique && k === 2) continue;
    // benches back to back
    for (const dx of [2, 5]) { put(c, 'zw_bench_steel', ix + dx, 34, 2, {}); put(c, 'zw_bench_steel', ix + dx, 35, 0, {}); }
    if (k % 2 === 0) b.obj('zw_board_hanging', ix + 3, 30, 0, { v: k });
  }
  if (!unique) {
    put(c, 'zw_newsstand', ms + 12, CON1, 2, {});
    put(c, 'zw_ticket_machine', ms + 26, CON1, 2, {});
    put(c, 'zw_ticket_machine', ms + 27, CON1, 2, {});
    put(c, 'vending_soda', ms + 20, CON1, 2, {});
    put(c, 'trash_can', ms + 9, CON1, 0, {});
    b.obj('zw_station_clock', ms + 15, 32, 0, {});
    mount(b, 'zw_network_map', ms + 2, CON0, 'n');
    mount(b, 'zw_timetable', ms + 7, CON0, 'n');
  }
}

// ---------------------------------------------------------------- south block
function passage(c: Ctx, ms: number) {
  const { b } = c;
  b.vwall(ms + 4, ROOM0, ROOM1, 'drywall');
  b.fillFloor(ms, ROOM0, ms + 3, ROOM1, 'terrazzo');
  for (const dx of [1, 2]) { b.gap(ms + dx, ROOM0, 0); b.gap(ms + dx, PLAT0, 0); }
  b.obj('zw_platform_sign', ms + 1, ROOM0 + 1, 0, { label: 'PLATFORM 0' });
  b.obj('zw_platform_sign', ms + 1, ROOM1 - 1, 0, { label: 'ARRIVALS' });
  lamp(b, ms + 1, ROOM0 + 4, 'fluoro', C_ROOMS, { flicker: 0.1 });
  lamp(b, ms + 2, ROOM0 + 9, 'fluoro', C_ROOMS, { broken: true });
  mount(b, 'zw_timetable', ms + 3, ROOM0 + 4, 'e');
  mount(b, 'exit_sign', ms, ROOM0 + 6, 'w');
}

function waitingRoom(c: Ctx, x0: number, x1: number) {
  const { b } = c;
  b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
  b.addRoom('Waiting Room', 'waiting', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS });
  b.door(x0 + 3, ROOM0, 0, 'door_office', { open: true, sign: 'staff' });
  b.door(x0 + 4, PLAT0, 0, 'door_glass', { open: false });
  for (const y of [ROOM0 + 3, ROOM0 + 6]) { put(c, 'zw_bench_steel', x0 + 1, y, 0, {}); put(c, 'zw_bench_steel', x0 + 5, y, 0, {}); }
  put(c, 'vending_snack', x0, ROOM1, 2, {}); put(c, 'vending_soda', x0 + 1, ROOM1, 2, {});
  put(c, 'water_cooler', x1, ROOM1, 2, {});
  mount(c.b, 'clock_wall', x0 + 5, ROOM0, 'n');
  mount(c.b, 'noticeboard', x0 + 1, ROOM0, 'n', { lore: 'zw_depot_notice' });
  // somebody has been waiting a long time
  put(c, 'replica_seated', x0 + 6, ROOM0 + 9, 2, { pose: 'sit', seat: 'chair_plastic' });
  put(c, 'chair_plastic', x0 + 4, ROOM0 + 9, 2, {});
  lamp(b, x0 + 3, ROOM0 + 3, 'fluoro', C_ROOMS, { flicker: 0.05 });
  lamp(b, x0 + 4, ROOM0 + 8, 'fluoro', C_ROOMS);
}

function toilets(c: Ctx, x0: number, x1: number) {
  const { b } = c;
  const mid = x0 + 3;
  b.fillFloor(x0, ROOM0, x1, ROOM1, 'tile_white');
  b.paper(x0, ROOM0, x1, ROOM1, 'wall_bathroom');
  b.vwall(mid, ROOM0, ROOM1, 'tile');
  b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
  b.addRoom('Gents', 'restroom', x0, ROOM0, mid - 1, ROOM1, { circuit: C_ROOMS });
  b.addRoom('Ladies', 'restroom', mid, ROOM0, x1, ROOM1, { circuit: C_ROOMS });
  b.door(x0 + 1, ROOM0, 0, 'door_white', { sign: 'restroom' });
  b.door(mid + 1, ROOM0, 0, 'door_white', { sign: 'restroom' });
  for (const sx of [x0, mid]) {
    put(c, 'sink_bathroom', sx, ROOM0 + 2, 1, {}); mount(b, 'mirror', sx, ROOM0 + 2, 'w');
    put(c, 'sink_bathroom', sx, ROOM0 + 3, 1, {}); mount(b, 'mirror', sx, ROOM0 + 3, 'w');
    for (const y of [ROOM0 + 6, ROOM0 + 8, ROOM0 + 10]) {
      put(c, 'toilet', sx + 2, y, 3, {});
      b.hwall(sx + 1, sx + 2, y, 'cubicle');
    }
    lamp(b, sx + 1, ROOM0 + 4, 'fluoro', C_ROOMS, { flicker: 0.15 });
    lamp(b, sx + 1, ROOM0 + 9, 'fluoro', C_ROOMS, { broken: true });
  }
  mount(b, 'urinal', x0 + 1, ROOM1, 's');
}

function cafe(c: Ctx, x0: number, x1: number) {
  const { b } = c;
  b.fillFloor(x0, ROOM0, x1, ROOM1, 'checker');
  b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
  b.addRoom('Bay Cafe', 'cafe', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS });
  for (const dx of [2, 3]) b.arch(x0 + dx, ROOM0, 0);
  put(c, 'food_court_counter', x0 + 1, ROOM1, 2, {});
  put(c, 'fridge', x0 + 5, ROOM1, 2, {});
  put(c, 'coffee_maker', x0 + 4, ROOM1, 2, {});
  mount(b, 'zw_cafe_menu', x0, ROOM0 + 5, 'w');
  for (const [tx, ty] of [[x0 + 1, ROOM0 + 3], [x0 + 4, ROOM0 + 3], [x0 + 2, ROOM0 + 7]] as const) {
    put(c, 'table_round', tx, ty, 0, {});
    put(c, 'chair_plastic', tx - 1, ty, 1, {}); put(c, 'chair_plastic', tx + 1, ty, 3, {});
  }
  lamp(b, x0 + 2, ROOM0 + 4, 'bulb', C_ROOMS, { color: 0xffd8a0 });
  lamp(b, x0 + 3, ROOM0 + 9, 'bulb', C_ROOMS, { color: 0xffd8a0, flicker: 0.1 });
}

function leftLuggage(c: Ctx, x0: number, x1: number) {
  const { b } = c;
  b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
  b.addRoom('Left Luggage', 'lockers', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS });
  b.door(x0 + 2, ROOM0, 0, 'door_metal', { open: true });
  for (let y = ROOM0 + 2; y <= ROOM1; y++) { put(c, 'locker', x0, y, 3, { loot: 'zw_luggage' }); put(c, 'locker', x1, y, 1, { loot: 'zw_luggage' }); }
  put(c, 'zw_suitcase', x0 + 1, ROOM1 - 2, 0, { v: 5 });
  mount(b, 'zw_plate', x0 + 1, ROOM0, 'n', { label: 'LOST PROPERTY' });
  lamp(b, x0 + 2, ROOM0 + 5, 'fluoro', C_ROOMS, { flicker: 0.3 });
}

/** a small room where every chair faces the same corner */
function quietRoom(c: Ctx, x0: number, x1: number) {
  const { b } = c;
  b.fillFloor(x0, ROOM0, x1, ROOM1, 'carpet_office');
  b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
  b.addRoom('Quiet Room', 'quiet', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS });
  b.door(x0 + 1, ROOM0, 0, 'door_office', { open: false });
  // the corner is the south-east one
  const cx = x1 + 1, cy = ROOM1 + 1;
  for (let y = ROOM0 + 2; y <= ROOM1 - 1; y += 2) for (let x = x0; x <= x1; x++) {
    if (x === x1 && y >= ROOM1 - 1) continue;
    const yaw = Math.atan2(cx - (x + 0.5), cy - (y + 0.5));
    c.b.obj('chair_folding', x, y, 0, { yaw });
  }
  lamp(b, x0 + 1, ROOM0 + 5, 'bulb', C_ROOMS, { intensity: 0.6, color: 0xffc080 });
}

// ---------------------------------------------------------------- platform
function platform(c: Ctx, ms: number, unique: boolean) {
  const { b } = c;
  for (let k = 0; k < 4; k++) {
    const ix = ms + k * 8, u = k * 8;
    put(c, 'zw_bench_steel', ix + 3, 59, 0, {});
    if (k % 2 === 0) b.obj('zw_platform_sign', ix + 5, 61, 0, { label: k === 0 ? 'PLATFORM 0' : 'PLATFORM 9' });
    else b.obj('zw_station_clock', ix + 6, 60, 0, {});
    put(c, 'trash_can_outdoor', ix + 1, 58, 0, {});
    if (unique) continue;
    const r = hh(u, 0, 9301);
    if (r < 0.35) put(c, 'zw_luggage_pile', ix + 6, 61, 0, { v: k + 1 });
    else if (r < 0.55) put(c, 'zw_luggage_trolley', ix + 6, 61, 3, {});
    else if (r < 0.7) put(c, 'zw_suitcase', ix + 2, 62, 0, { v: k });
  }
  if (!unique) {
    // one figure at the edge, looking out at the dark, in every module
    put(c, 'replica_standing', ms + 21, PLAT1, 0, { pose: 'stand' });
    mount(b, 'zw_timetable', ms + 10, PLAT0, 'n');
    mount(b, 'zw_departures', ms + 13, PLAT0, 'n', { v: 1 });
  }
}

// ============================================================ unique module 1: Bay 0, the booth, the way in from Level 0
function moduleOne(c: Ctx, ms: number) {
  const { b, z, f } = c;
  bays(c, ms, true);
  walkway(c, ms);
  concourse(c, ms, true);
  platform(c, ms, true);
  passage(c, ms);

  // ---- BAY 0: clear asphalt, hatching, KEEP CLEAR, the number painted large
  b.addRoom('Bay 0', 'transport_bay', B0X, BAY0, B0X1, BAY1, { circuit: C_DECK, temp: 12 });
  for (let i = 0; i < 5; i++) decal(z, 'zw_hatch', B0X + 3, BAY0 + 1.2 + i * 2.2, 5.6, 2.0, 0, undefined, 0.85);
  decal(z, 'zw_bay_0', B0X + 3, BAY1 - 0.6, 2.4, 1.05, 0, undefined, 1);
  decal(z, 'zw_bay_8', B0X + 3, BAY0 + 0.8, 3.6, 0.9, Math.PI, undefined, 0.9);
  for (let y = BAY0; y <= BAY1; y++) b.flag(B0X, y, B0X1, y, TF.NOSPAWN);
  lamp(b, B0X + 3, 13, 'sodium', C_DECK, { intensity: 1.2, radius: 8, y: 3.4, flicker: 0.04 });
  lamp(b, B0X + 2, 19, 'sodium', C_DECK, { intensity: 1.0, radius: 7, y: 3.4 });
  arrive(b, 'transport_bay', B0X + 3, BAY1, 'n', 2);

  // ---- the ticket booth facing the concourse, right behind Bay 0's doors
  const bx = B0X + 1, by = CON0 + 1;
  force(c, 'zw_ticket_booth', bx, by, 0, {});
  // the passage kiosk (the debt contract's machine) stands at the booth window; you stand in front of it
  if (objDef('ticket_kiosk')) b.obj('ticket_kiosk', bx + 1, by + 2, 0, {});
  arrive(b, 'ticket_kiosk', bx + 1, by + 3, 'n', 1);
  put(c, 'zw_ticket_machine', bx - 2, by, 0, {});
  put(c, 'zw_ticket_machine', bx + 4, by, 0, {});
  b.obj('zw_board_hanging', bx, by + 5, 0, { v: 3 });
  mount(b, 'noticeboard', bx - 4, CON0, 'n', { lore: 'zw_depot_notice' });
  // queue barriers in front of the window (posts with tape), and the queue nobody is in
  for (let i = 0; i < 5; i++) decal(z, 'zw_hazard_tape', bx - 1 + i, by + 4.2, 1.0, 0.12, 0, undefined, 1);
  for (const x of [bx - 2, bx + 4]) put(c, 'bollard', x, by + 4, 0, {});
  f.floorItem('note', bx + 3, by + 3, { lore: 'zw_depot_ticket' });

  // ---- the south block: stairs up to Level 0, lost property, the station office
  // stairs (x ms+4 .. ms+11)
  {
    const x0 = ms + 4, x1 = ms + 11;
    b.fillFloor(x0, ROOM0, x1, ROOM1, 'concrete');
    b.paper(x0, ROOM0, x1, ROOM1, 'wall_cinder');
    b.vwall(x1 + 1, ROOM0, ROOM1, 'cinder');
    b.addRoom('Stairs to Level 0', 'stairs', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS, temp: 16 });
    for (const dx of [3, 4]) b.arch(x0 + dx, ROOM0, 0);
    // the stairs climb north-to-south away from the concourse: up is yellow
    const sx = x0 + 3, sy = ROOM1 - 2;
    force(c, 'staircase_up', sx, sy, 2, { portal: 'r_lobby_depot' });
    b.portal({ id: 'r_lobby_depot', x: sx, y: sy, kind: 'stairs_up', to: 'lobby', tx: 80, ty: 80, label: 'Climb back up to Level 0' });
    b.fillFloor(sx, sy, sx, sy + 1, 'carpet_yellow');
    b.paper(sx - 1, sy - 1, sx + 1, ROOM1, 'wall_yellow');
    arrive(b, 'p_lobby_depot', sx, sy - 3, 'n', 3);
    mount(b, 'zw_plate', x0 + 1, ROOM0, 'n', { label: 'THIS WAY' });
    b.obj('zg_level_sign', x0, ROOM0 + 5, 3, { label: '0' });
    lamp(b, sx, sy - 2, 'fluoro', C_ROOMS, { color: 0xf1edb0, flicker: 0.2 });
    lamp(b, x0 + 6, ROOM0 + 3, 'bulb', C_ROOMS, { flicker: 0.1 });
    put(c, 'zw_luggage_pile', x1, ROOM0 + 2, 0, { v: 2 });
    put(c, 'zw_suitcase', x1 - 1, ROOM0 + 4, 0, { v: 1 });
    for (let i = 0; i < 6; i++) decal(z, 'decal_footprints', sx + 0.5 + (i % 2) * 0.3, sy - 1 - i * 1.4, 0.8, 0.8, -Math.PI / 2);
  }
  // lost property (x ms+12 .. ms+23)
  {
    const x0 = ms + 12, x1 = ms + 23;
    b.fillFloor(x0, ROOM0, x1, ROOM1, 'linoleum');
    b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
    b.addRoom('Lost Property', 'lost_property', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS, lootMul: 1.4 });
    b.door(x0 + 2, ROOM0, 0, 'door_office', { sign: 'office', open: true });
    // the counter splits the room; behind it, the racks
    b.hwall(x0, x1 - 2, ROOM0 + 3, 'low_concrete');
    put(c, 'reception_desk', x0 + 4, ROOM0 + 2, 0, {});
    for (let x = x0; x <= x1 - 1; x += 2) put(c, 'zw_lost_property', x, ROOM0 + 6, 0, {});
    for (let x = x0; x <= x1 - 1; x += 2) put(c, 'zw_lost_property', x, ROOM0 + 9, 0, {});
    for (let x = x0 + 1; x <= x1; x += 3) put(c, 'zw_luggage_pile', x, ROOM1, 0, { v: x });
    put(c, 'zw_suitcase', x1, ROOM0 + 4, 0, { v: 3 });
    f.floorItem('note', x0 + 5, ROOM0 + 1, { lore: 'zw_lost_property' });
    mount(b, 'zw_plate', x0 + 3, ROOM0, 'n', { label: 'LOST PROPERTY' });
    lamp(b, x0 + 3, ROOM0 + 5, 'fluoro', C_ROOMS); lamp(b, x0 + 8, ROOM0 + 5, 'fluoro', C_ROOMS, { flicker: 0.2 });
    lamp(b, x0 + 5, ROOM0 + 10, 'fluoro', C_ROOMS, { broken: true });
  }
  // station office (x ms+24 .. ms+31)
  {
    const x0 = ms + 24, x1 = ms + 31;
    b.fillFloor(x0, ROOM0, x1, ROOM1, 'carpet_office');
    b.paper(x0, ROOM0, x1, ROOM1, 'wall_office');
    b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
    b.addRoom('Station Office', 'office', x0, ROOM0, x1, ROOM1, { circuit: C_STAFF });
    b.door(x0 + 2, ROOM0, 0, 'door_metal', { sign: 'staff' });
    const d = put(c, 'desk_office', x0 + 2, ROOM0 + 4, 0, {});
    if (d) { f.onTop('computer', d, { lore: 'zw_depot_driver' }); }
    put(c, 'chair_office', x0 + 2, ROOM0 + 5, 2, {});
    put(c, 'cctv_monitors', x0 + 5, ROOM0, 0, {});
    put(c, 'radio_console', x0, ROOM0 + 8, 3, {});
    put(c, 'filing_cabinet', x1, ROOM0 + 2, 1, {}); put(c, 'filing_cabinet', x1, ROOM0 + 3, 1, {});
    put(c, 'locker', x1, ROOM1, 2, {}); put(c, 'locker', x1 - 1, ROOM1, 2, {});
    mount(b, 'zw_network_map', x0 + 3, ROOM0, 'n');
    f.floorItem('note', x0 + 4, ROOM0 + 6, { lore: 'zw_depot_driver' });
    lamp(b, x0 + 3, ROOM0 + 5, 'fluoro', C_STAFF, { flicker: 0.1 });
  }

  // ---- the hopper: in the concourse right where you arrive from the stairs
  hopperAt(c, ms + 6, CON1 - 4, 0);
  // a few things worth carrying
  for (let i = 0; i < 10; i++) {
    const x = ms + 4 + c.rng.int(0, 26), y = c.rng.int(CON0 + 1, CON1);
    if (isOpen(z, x, y)) f.floorLoot('zw_floor_depot', x, y);
  }
}

// ============================================================ unique module 2: the staff door, the waiting hall
function moduleTwo(c: Ctx, ms: number) {
  const { b, z, f } = c;
  bays(c, ms, true);
  walkway(c, ms);
  concourse(c, ms, false);
  platform(c, ms, true);
  passage(c, ms);
  // staff corridor (x ms+4 .. ms+15): the metal door to Annex B
  {
    const x0 = ms + 4, x1 = ms + 15;
    b.fillFloor(x0, ROOM0, x1, ROOM1, 'linoleum_green');
    b.paper(x0, ROOM0, x1, ROOM1, 'wall_hospital');
    b.vwall(x1 + 1, ROOM0, ROOM1, 'concrete');
    b.addRoom('Staff Corridor', 'staff', x0, ROOM0, x1, ROOM1, { circuit: C_STAFF, temp: 14 });
    b.door(x0 + 1, ROOM0, 0, 'door_metal', { sign: 'staff', open: false });
    // a corridor running south, then the steel door in the east wall at the end
    b.vwall(x0 + 3, ROOM0, ROOM1 - 3, 'drywall');
    b.hwall(x0 + 3, x1, ROOM1 - 2, 'drywall');
    b.fillFloor(x0 + 3, ROOM0, x1, ROOM1 - 3, 'linoleum');
    b.addRoom('Locker Room', 'lockers', x0 + 3, ROOM0, x1, ROOM1 - 3, { circuit: C_STAFF });
    b.door(x0 + 3, ROOM0 + 4, 1, 'door_office', { open: true });
    for (let x = x0 + 4; x <= x1; x++) put(c, 'locker', x, ROOM0, 0, { loot: 'zw_coats' });
    put(c, 'table_round', x0 + 7, ROOM0 + 4, 0, {}); put(c, 'chair_plastic', x0 + 6, ROOM0 + 4, 1, {}); put(c, 'chair_plastic', x0 + 8, ROOM0 + 4, 3, {});
    put(c, 'zw_hazmat', x1, ROOM0 + 3, 1, { v: 0 }); put(c, 'zw_hazmat', x1, ROOM0 + 5, 1, { v: 5 });
    mount(b, 'noticeboard', x0 + 9, ROOM0, 'n', { lore: 'zw_annex_memo' });
    // the corridor along the bottom: hazard stripes and the door
    for (let x = x0; x <= x1; x++) decal(z, 'zw_hazard_tape', x + 0.5, ROOM1 - 1.5, 1.0, 0.12, 0, undefined, 1);
    b.vwall(x1 + 1, ROOM1 - 1, ROOM1 - 1, 'concrete');
    b.door(x1 + 1, ROOM1 - 1, 1, 'door_lab', { portal: 'p_depot_annex', sign: 'danger' });
    b.portal({ id: 'p_depot_annex', x: x1, y: ROOM1 - 1, kind: 'door', to: 'annex', tx: 10, ty: 10, label: 'Go through to Annex B' });
    arrive(b, 'r_depot_annex', x1 - 2, ROOM1 - 1, 'w', 2);
    mount(b, 'zw_plate', x1 - 1, ROOM1 - 2, 'n', { label: 'ANNEX B' });
    lamp(b, x0 + 1, ROOM0 + 5, 'fluoro', C_STAFF, { flicker: 0.25 });
    lamp(b, x1 - 3, ROOM1 - 1, 'emergency', C_STAFF, { flicker: 0.05 });
    lamp(b, x0 + 8, ROOM0 + 3, 'fluoro', C_STAFF);
  }
  // the waiting hall (x ms+16 .. ms+31): rows of seats, every one taken
  {
    const x0 = ms + 16, x1 = ms + 31;
    b.fillFloor(x0, ROOM0, x1, ROOM1, 'terrazzo');
    b.vwall(x1 + 1, ROOM0, ROOM1, 'drywall');
    b.addRoom('Waiting Hall', 'waiting_hall', x0, ROOM0, x1, ROOM1, { circuit: C_ROOMS });
    for (const dx of [7, 8]) b.arch(x0 + dx, ROOM0, 0);
    mount(b, 'zw_departures', x0 + 7, ROOM1, 's', { v: 3 });
    for (let y = ROOM0 + 3; y <= ROOM1 - 3; y += 2) for (let x = x0 + 1; x <= x1 - 2; x += 1) {
      if (x === x0 + 7 || x === x0 + 8) continue;
      const h = hh(x, y, 9401);
      if (h < 0.55) put(c, 'replica_seated', x, y, 0, { pose: 'sit', seat: 'chair_plastic' });
      else put(c, 'chair_plastic', x, y, 0, {});
    }
    f.floorItem('note', x0 + 8, ROOM0 + 2, { lore: 'zw_depot_ticket' });
    for (const lx of [x0 + 3, x0 + 12]) lamp(b, lx, ROOM0 + 6, 'fluoro', C_ROOMS, { intensity: 0.5, flicker: 0.1 });
  }
  for (let i = 0; i < 8; i++) {
    const x = ms + c.rng.int(0, 31), y = c.rng.int(PLAT0, PLAT1 - 1);
    if (isOpen(z, x, y)) f.floorLoot('zw_floor_depot', x, y);
  }
  for (let i = 0; i < 6; i++) {
    const x = ms + c.rng.int(0, 31), y = c.rng.int(CON0 + 1, CON1);
    if (isOpen(z, x, y)) f.floorLoot('zw_floor_depot', x, y);
  }
  void itemAtW; void objDef; void modOf; void ({} as Rot);
}

defZone({
  key: 'depot', name: 'Interchange 0 — The Depot', W, H, depth: 2,
  blurb: 'Sodium light on wet concrete. A board lists HOME, CANCELLED. Somewhere a coach idles in a bay, NOT IN SERVICE.',
  gen: (z, s) => { generateDepot(z, s); },
});
