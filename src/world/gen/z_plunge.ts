// The Plunge (112×80, depth 3): a municipal leisure pool, 1991, under the
// Inner Loop. White and pale-blue tile everywhere, skylights pouring flat
// daylight onto water that does not move unless something under it does.
//   the Foyer          turnstiles, the ticket window, the stair down to the
//                      Metro's pump house, the door through to the Poolrooms
//   the Changing Village  cubicles, lockers, showers, the footbath
//   the Plant Room     pumps, filters, chlorine drums, the balance tank
//   the Hall:          the Wave Pool (a tiled beach running down into the deep
//                      end, the wave machine grilles on the far wall), the
//                      Diving Pit (boards over four metres of water), the
//                      Flume and its splash pool, the Toddler Pool with its
//                      mushroom fountain, the Cafe behind its glass wall, and
//                      a forest of columns between
// z.meta.plunge carries the deep and shallow water rects for the inhabitants
// (src/creatures/species/pl_pool.ts): the Gulper lurks in the deep ends, its
// tadpoles swarm the shallows, the frog-legged piranhas leap from the edges,
// balloon pufferfish drift under the skylights.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, type Rot, arrive, put, force, mount, decal, hh, lamp, isOpen } from './weird_kit';

const W = 112, H = 80;
const DECK = 'tile_pool', BLUE = 'tile_pool_blue', SHAL = 'water_shallow', DEEP = 'water_deep';
const WALL = 'tile', PAPER = 'wall_pool';
const C_HALL = 1, C_FOYER = 2, C_PLANT = 3, C_CAFE = 4;
type R = { x0: number; y0: number; x1: number; y1: number };
const rect = (x0: number, y0: number, x1: number, y1: number): R => ({ x0, y0, x1, y1 });
// rooms
const FOYER = rect(3, 3, 24, 18), VILLAGE = rect(3, 19, 24, 42), PLANT = rect(3, 43, 24, 76), HALL = rect(25, 3, 108, 76);
const CAFE = rect(76, 3, 107, 14);
// pools
const WAVE = rect(64, 30, 108, 70);        // beach on the west, deep against the east wall
const BEACH1 = 75;                         // last shallow column
const DIVE = rect(30, 9, 42, 22);
const FLUME = rect(50, 9, 60, 18);
const TODDLER = rect(30, 52, 46, 66);
const TANK = rect(7, 60, 20, 72);           // the balance tank in the plant room

export function generatePlunge(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Plunge';
  const fill = (r: R, floor: string, h = 0) => b.fillFloor(r.x0, r.y0, r.x1, r.y1, floor, h);
  const sky = (x: number, y: number, i = 0.85, rad = 9) => b.light(x + 0.5, y + 0.5, 'sky', { color: 0xeaf6ff, intensity: i * 0.7, radius: rad - 1, y: 6, circuit: 0 });

  // ============================================================ shells
  for (const [r, floor] of [[FOYER, DECK], [VILLAGE, BLUE], [PLANT, 'concrete'], [HALL, DECK]] as const) {
    fill(r, floor); b.roomWalls(r.x0, r.y0, r.x1, r.y1, r === PLANT ? 'cinder' : WALL);
  }
  b.paper(0, 0, W - 1, H - 1, PAPER);
  b.paper(PLANT.x0, PLANT.y0, PLANT.x1, PLANT.y1, 'wall_cinder');
  b.addRoom('The Plunge', 'pool_hall', HALL.x0, HALL.y0, HALL.x1, HALL.y1, { circuit: C_HALL, temp: 28 });
  b.addRoom('Foyer', 'foyer', FOYER.x0, FOYER.y0, FOYER.x1, FOYER.y1, { circuit: C_FOYER, temp: 22 });
  b.addRoom('Changing Village', 'changing', VILLAGE.x0, VILLAGE.y0, VILLAGE.x1, VILLAGE.y1, { circuit: C_FOYER, temp: 25, lootMul: 1.2 });
  b.addRoom('Plant Room', 'pumps', PLANT.x0, PLANT.y0, PLANT.x1, PLANT.y1, { circuit: C_PLANT, temp: 24, lootMul: 1.3 });
  // openings: foyer -> village, village -> hall (through the footbath), plant room -> hall
  for (const x of [18, 19, 20]) b.arch(x, VILLAGE.y0, 0);
  for (const y of [30, 31, 32]) b.gap(HALL.x0, y, 1);
  b.door(HALL.x0, 60, 1, 'door_metal', { sign: 'maintenance', open: false });
  b.door(14, PLANT.y0, 0, 'door_metal', { sign: 'staff' });
  // the footbath: a shallow trough you walk through into the hall
  b.fillFloor(19, 30, 26, 32, SHAL, -0.15);

  // ============================================================ the Wave Pool: a tiled beach running down into the deep end
  for (let x = WAVE.x0; x <= WAVE.x1; x++) {
    const t = x - WAVE.x0;
    const shallow = x <= BEACH1;
    const h = shallow ? -Math.min(0.4, 0.05 + t * 0.04) : -0.9;
    b.fillFloor(x, WAVE.y0, x, WAVE.y1, shallow ? SHAL : DEEP, h);
  }
  // the deck round the pool's north and south edges stays, the pool runs into the east wall
  b.addRoom('Wave Pool', 'wave_pool', WAVE.x0, WAVE.y0, WAVE.x1, WAVE.y1, { circuit: C_HALL, temp: 28 });
  for (let y = WAVE.y0 + 2; y <= WAVE.y1 - 3; y += 4) mount(b, 'pl_grille', HALL.x1, y, 'e', {});
  for (let y = WAVE.y0 + 1; y <= WAVE.y1; y += 6) for (let x = BEACH1 + 6; x <= WAVE.x1 - 2; x += 8) decal(z, 'pl_lane_t', x + 0.5, y + 0.5, 2.2, 0.55, 0, undefined, 0.7);
  for (const x of [BEACH1 + 4, BEACH1 + 14, BEACH1 + 24]) { b.obj('pool_ladder', x, WAVE.y0, 0, {}); b.obj('pool_ladder', x + 4, WAVE.y1, 2, {}); }
  put(c, 'lifeguard_chair', BEACH1 + 10, WAVE.y0 - 2, 0, {});
  put(c, 'lifeguard_chair', BEACH1 + 20, WAVE.y1 + 2, 2, {});
  for (let k = 0; k < 14; k++) { const x = rng.int(WAVE.x0 + 2, WAVE.x1 - 1), y = rng.int(WAVE.y0 + 1, WAVE.y1 - 1); if (isOpen(z, x, y)) b.obj(k % 4 === 3 ? 'float_ring' : 'pl_noodle', x, y, 0, { v: k, a: k * 3 }); }
  for (let y = WAVE.y0 + 3; y <= WAVE.y1 - 3; y += 9) mount(b, 'pl_sign', HALL.x1, y + 2, 'e', { v: 2 });
  for (let x = WAVE.x0 + 2; x <= WAVE.x1; x += 8) { mount(b, 'pl_sign', x, HALL.y1, 's', { v: x < BEACH1 ? 1 : 3 }); }

  // ============================================================ the Diving Pit
  fill(DIVE, DEEP, -1.4);
  b.addRoom('Diving Pit', 'diving_pit', DIVE.x0, DIVE.y0, DIVE.x1, DIVE.y1, { circuit: C_HALL, temp: 27 });
  for (const x of [32, 35, 38]) put(c, 'diving_board', x, DIVE.y0 - 2, 0, {});
  b.obj('pool_ladder', DIVE.x1 - 1, DIVE.y1, 2, {}); b.obj('pool_ladder', DIVE.x0 + 1, DIVE.y1, 2, {});
  put(c, 'lifeguard_chair', DIVE.x1 + 2, DIVE.y0 + 2, 3, {});
  mount(b, 'pl_sign', DIVE.x0 + 4, HALL.y0, 'n', { v: 2 });
  mount(b, 'pl_rescue', DIVE.x0 + 9, HALL.y0, 'n', {});

  // ============================================================ the Flume and its splash pool
  fill(FLUME, DEEP, -0.8);
  b.addRoom('Splash Pool', 'splash_pool', FLUME.x0, FLUME.y0, FLUME.x1, FLUME.y1, { circuit: C_HALL, temp: 28 });
  force(c, 'pl_flume', 54, HALL.y0, 0, {});
  b.obj('pool_ladder', FLUME.x1 - 1, FLUME.y1, 2, {});
  mount(b, 'pl_sign', FLUME.x0 + 1, HALL.y0, 'n', { v: 4 });
  for (let k = 0; k < 3; k++) b.obj('pl_noodle', FLUME.x0 + 2 + k * 3, FLUME.y0 + 4 + k, 0, { v: k + 1, a: k * 5 });

  // ============================================================ the Toddler Pool and its mushroom
  for (let y = TODDLER.y0; y <= TODDLER.y1; y++) for (let x = TODDLER.x0; x <= TODDLER.x1; x++) {
    const edge = Math.min(x - TODDLER.x0, TODDLER.x1 - x, y - TODDLER.y0, TODDLER.y1 - y);
    b.fillFloor(x, y, x, y, edge === 0 ? BLUE : SHAL, edge === 0 ? -0.08 : -0.22);
  }
  b.addRoom('Toddler Pool', 'toddler_pool', TODDLER.x0, TODDLER.y0, TODDLER.x1, TODDLER.y1, { circuit: C_HALL, temp: 30 });
  force(c, 'pl_mushroom', 37, 58, 0, {});
  for (let k = 0; k < 6; k++) { const x = rng.int(TODDLER.x0 + 1, TODDLER.x1 - 1), y = rng.int(TODDLER.y0 + 1, TODDLER.y1 - 1); if (isOpen(z, x, y)) b.obj(k % 2 ? 'pl_noodle' : 'float_ring', x, y, 0, { v: k, a: k * 2 }); }
  for (let i = 0; i < 5; i++) f.floorItem('toy_rubber_duck', rng.int(TODDLER.x0 + 1, TODDLER.x1 - 1), rng.int(TODDLER.y0 + 1, TODDLER.y1 - 1));
  mount(b, 'pl_sign', TODDLER.x0 + 2, HALL.y1, 's', { v: 5 });
  mount(b, 'pl_sign', TODDLER.x0 + 8, HALL.y1, 's', { v: 1 });

  // ============================================================ the Cafe behind its glass wall
  fill(CAFE, 'checker');
  b.hwall(CAFE.x0, CAFE.x1, CAFE.y1 + 1, 'glass');
  b.vwall(CAFE.x0, CAFE.y0, CAFE.y1, 'glass');
  for (const x of [CAFE.x0 + 4, CAFE.x0 + 5]) b.door(x, CAFE.y1 + 1, 0, 'door_glass', { open: true });
  b.addRoom('Poolside Cafe', 'cafe', CAFE.x0, CAFE.y0, CAFE.x1, CAFE.y1, { circuit: C_CAFE, temp: 24 });
  put(c, 'food_court_counter', CAFE.x0 + 12, CAFE.y0, 0, {});
  put(c, 'coffee_maker', CAFE.x0 + 15, CAFE.y0, 0, {});
  put(c, 'fridge', CAFE.x0 + 17, CAFE.y0, 0, {});
  for (const k of ['vending_snack', 'vending_soda']) put(c, k, CAFE.x1 - (k === 'vending_soda' ? 1 : 2), CAFE.y0, 0, {});
  for (let x = CAFE.x0 + 2; x <= CAFE.x1 - 3; x += 4) for (const y of [CAFE.y0 + 4, CAFE.y0 + 8]) {
    if (!put(c, 'table_round', x, y, 0, {})) continue;
    put(c, 'chair_plastic', x - 1, y, 1, {}); put(c, 'chair_plastic', x + 1, y, 3, {});
  }
  for (let x = CAFE.x0 + 3; x <= CAFE.x1; x += 6) lamp(b, x, CAFE.y0 + 5, 'fluoro', C_CAFE, { flicker: hh(x, 1, 7701) < 0.2 ? 0.15 : 0 });
  f.floorItem('note', CAFE.x0 + 9, CAFE.y0 + 6, { lore: 'pl_cafe' });

  // ============================================================ the hall: columns, loungers, skylights, wet tile
  const water = (x: number, y: number) => !!z.floorAt(x, y)?.water;
  for (let y = HALL.y0 + 2; y <= HALL.y1 - 1; y += 7) for (let x = HALL.x0 + 3; x <= HALL.x1 - 2; x += 7) {
    const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => water(x + dx, y + dy));
    if (near || (x >= CAFE.x0 - 1 && y <= CAFE.y1 + 2)) continue;
    if (put(c, hh(x, y, 7702) < 0.5 ? 'column_round' : 'column_square', x, y, 0, {})) b.flag(x, y, x, y, TF.NOSPAWN);
  }
  for (let y = HALL.y0 + 2; y <= HALL.y1; y += 6) for (let x = HALL.x0 + 2; x <= HALL.x1; x += 6) sky(x, y, water(x, y) ? 0.95 : 0.8);
  for (let y = HALL.y0 + 5; y <= HALL.y1; y += 12) for (let x = HALL.x0 + 5; x <= HALL.x1; x += 12) lamp(b, x, y, 'fluoro', C_HALL, { intensity: 0.5, flicker: hh(x, y, 7703) < 0.15 ? 0.3 : 0 });
  // loungers along the beach and the toddler pool
  for (let y = WAVE.y0 + 2; y <= WAVE.y1 - 2; y += 3) put(c, 'pool_lounger', WAVE.x0 - 3, y, 1, {});
  for (let x = TODDLER.x1 + 3; x <= TODDLER.x1 + 11; x += 2) put(c, 'pool_lounger', x, TODDLER.y0, 0, {});
  for (const [x, y] of [[48, 28], [49, 28], [56, 44], [57, 44]] as const) put(c, 'towel_stack', x, y, 0, {});
  for (const [x, y, r] of [[27, 40, 1], [27, 46, 1], [62, 74, 2], [44, 4, 0]] as const) put(c, 'shower_pool', x, y, r as Rot, {});
  mount(b, 'pl_clock', 46, HALL.y0, 'n', {});
  mount(b, 'pl_clock', 70, HALL.y0, 'n', {});
  mount(b, 'pl_sign', 47, HALL.y0, 'n', { v: 0 });
  mount(b, 'pl_sign', 64, HALL.y0, 'n', { v: 6 });
  mount(b, 'pl_rescue', HALL.x0, 50, 'w', {});
  // wet tile, drains, the light the water throws on the walls
  for (let i = 0; i < 160; i++) {
    const x = rng.int(HALL.x0, HALL.x1), y = rng.int(HALL.y0, HALL.y1);
    if (!z.floor[z.idx(x, y)] || water(x, y)) continue;
    const nearW = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => water(x + dx, y + dy));
    decal(z, rng.pick(nearW ? ['decal_puddle', 'decal_puddle', 'decal_footprints'] : ['decal_puddle', 'decal_stain_water', 'decal_footprints']), x + 0.5, y + 0.5, rng.float(0.8, 1.6), rng.float(0.8, 1.4), rng.float(0, 6), undefined, 0.7);
  }
  for (const r of [WAVE, DIVE, FLUME, TODDLER]) {
    for (let x = r.x0; x <= r.x1; x += 5) for (const y of [r.y0 - 1, r.y1 + 1]) if (z.inb(x, y) && z.floor[z.idx(x, y)] && !water(x, y)) decal(z, 'pl_drain', x + 0.5, y + 0.5, 0.45, 0.45, 0, undefined, 1);
    // caustic light on the deck round the water
    for (let k = 0; k < Math.max(4, ((r.x1 - r.x0) * (r.y1 - r.y0)) / 30); k++) decal(z, 'pl_caustic', rng.float(r.x0, r.x1 + 1), rng.float(r.y0, r.y1 + 1), rng.float(2.5, 4), rng.float(2.5, 4), rng.float(0, 6), undefined, 0.55);
  }
  // caustics thrown up the walls beside the deep water
  for (let y = WAVE.y0; y <= WAVE.y1; y += 3) z.decals.push({ x: HALL.x1 + 0.94, z: y + 0.5, y: 0.6, w: 2.2, d: 1.2, rot: Math.PI, tex: 'pl_caustic', alpha: 0.55, vert: 1 });
  for (let x = DIVE.x0; x <= DIVE.x1; x += 3) z.decals.push({ x: x + 0.5, z: HALL.y0 + 0.06, y: 1.1, w: 2.2, d: 1.4, rot: Math.PI / 2, tex: 'pl_caustic', alpha: 0.5, vert: 1 });
  for (let x = FLUME.x0; x <= FLUME.x1; x += 3) z.decals.push({ x: x + 0.5, z: HALL.y0 + 0.06, y: 1.0, w: 2.2, d: 1.2, rot: Math.PI / 2, tex: 'pl_caustic', alpha: 0.45, vert: 1 });
  for (let i = 0; i < 4; i++) f.floorItem('note', rng.int(WAVE.x0 - 4, WAVE.x0 - 2), rng.int(WAVE.y0 + 2, WAVE.y1 - 2), { lore: i % 2 ? 'pl_lifeguard' : 'pl_waves' });

  // ============================================================ the Foyer
  {
    const r = FOYER;
    force(c, 'zw_ticket_booth', r.x0 + 9, r.y0, 0, {});
    for (const y of [r.y0 + 5, r.y0 + 6, r.y0 + 7, r.y0 + 9, r.y0 + 10]) put(c, 'su_turnstile', r.x0 + 12, y, 0, {});
    for (let y = r.y0 + 3; y <= r.y1; y++) if (![r.y0 + 5, r.y0 + 6, r.y0 + 7, r.y0 + 9, r.y0 + 10].includes(y)) b.vwall(r.x0 + 12, y, y, 'railing');
    for (const x of [r.x0 + 16, r.x0 + 18]) put(c, 'su_bench', x, r.y1, 2, {});
    put(c, 'vending_soda', r.x1, r.y0 + 2, 3, {}); put(c, 'vending_snack', r.x1, r.y0 + 3, 3, {});
    mount(b, 'pl_sign', r.x0 + 15, r.y0, 'n', { v: 5 });
    mount(b, 'noticeboard', r.x0 + 19, r.y0, 'n', { lore: 'pl_notice' });
    for (let x = r.x0 + 2; x <= r.x1; x += 5) for (const y of [r.y0 + 4, r.y0 + 11]) lamp(b, x, y, 'fluoro', C_FOYER, { flicker: hh(x, y, 7704) < 0.15 ? 0.25 : 0 });
    for (let i = 0; i < 6; i++) f.floorLoot('pl_floor', rng.int(r.x0 + 1, r.x1 - 1), rng.int(r.y0 + 3, r.y1));
    // the stair down to the Metro's pump house
    const sx = r.x0, sy = r.y0 + 8;
    force(c, 'staircase_down', sx, sy, 1, { portal: 'r_subway_plunge' });
    b.portal({ id: 'r_subway_plunge', x: sx, y: sy, kind: 'stairs_down', to: 'subway', tx: 149, ty: 27, label: 'Go down to the Metro' });
    arrive(b, 'p_subway_plunge', sx + 3, sy, 'e', 2);
    // the door through to the Poolrooms
    const dx = r.x0 + 4;
    b.door(dx, r.y0, 0, 'door_glass', { portal: 'r_pools_plunge', sign: 'pool' });
    b.portal({ id: 'r_pools_plunge', x: dx, y: r.y0, kind: 'door', to: 'pools', tx: 122, ty: 54, label: 'Go through to the Poolrooms' });
    arrive(b, 'p_pools_plunge', dx, r.y0 + 2, 's', 2);
  }

  // ============================================================ the Changing Village
  {
    const r = VILLAGE;
    // two rows of cubicles with doors, lockers down the middle
    for (const yr of [r.y0 + 2, r.y1 - 3]) {
      for (let x = r.x0 + 1; x <= r.x1 - 2; x += 2) {
        b.vwall(x, yr, yr + 1, 'cubicle'); b.vwall(x + 2, yr, yr + 1, 'cubicle');
        b.hwall(x, x + 1, yr, 'cubicle');
        b.door(x, yr + 2, 0, 'door_white', { open: hh(x, yr, 7705) < 0.5 });
        b.hwall(x + 1, x + 1, yr + 2, 'cubicle');
      }
    }
    for (let x = r.x0 + 2; x <= r.x0 + 12; x++) { put(c, 'locker', x, r.y0 + 6, 0, { loot: 'pl_locker' }); put(c, 'locker', x, r.y0 + 7, 2, { loot: 'pl_locker' }); }
    for (const x of [r.x0 + 4, r.x0 + 10]) put(c, 'bench', x, r.y0 + 10, 0, {});
    for (let x = r.x0 + 2; x <= r.x1; x += 6) { lamp(b, x, r.y0 + 7, 'fluoro', C_FOYER, { flicker: hh(x, 2, 7706) < 0.3 ? 0.3 : 0 }); lamp(b, x, r.y0 + 14, 'fluoro', C_FOYER); }
    f.floorItem('note', r.x0 + 7, r.y0 + 13, { lore: 'pl_lifeguard' });
    for (let i = 0; i < 18; i++) decal(z, rng.pick(['decal_puddle', 'decal_footprints', 'decal_stain_water']), rng.float(r.x0 + 1, r.x1), rng.float(r.y0 + 1, r.y1), 1, 1, rng.float(0, 6), undefined, 0.6);
  }

  // ============================================================ the Plant Room and the balance tank
  {
    const r = PLANT;
    fill(TANK, DEEP, -1.6);
    for (let x = TANK.x0; x <= TANK.x1; x++) { b.hwall(x, x, TANK.y0, 'railing'); }
    b.clearN(TANK.x0 + 6, TANK.y0);
    b.obj('pool_ladder', TANK.x0 + 6, TANK.y0, 0, {});
    b.addRoom('Balance Tank', 'tank', TANK.x0, TANK.y0, TANK.x1, TANK.y1, { circuit: C_PLANT, temp: 26 });
    for (let k = 0; k < 4; k++) { put(c, 'pump_machine', r.x0 + 2 + k * 5, r.y0 + 3, 0, {}); put(c, 'valve_wheel', r.x0 + 4 + k * 5, r.y0 + 3, 0, {}); }
    put(c, 'pump_control', r.x1 - 1, r.y0 + 8, 3, {});
    for (const y of [r.y0 + 10, r.y0 + 11, r.y0 + 12]) put(c, 'barrel_oil', r.x0, y, 0, {});
    put(c, 'electrical_cabinet', r.x1, r.y0 + 2, 3, {}); put(c, 'electrical_cabinet', r.x1, r.y0 + 3, 3, {});
    put(c, 'shelf_metal', r.x0, r.y0 + 6, 1, { loot: 'maintenance' });
    put(c, 'tool_chest', r.x0, r.y0 + 7, 1, {});
    for (let x = r.x0 + 1; x <= r.x1; x += 2) mount(b, 'pipes_cluster', x, r.y0, 'n');
    f.floorItem('note', r.x0 + 6, r.y0 + 12, { lore: 'pl_plant' });
    for (let x = r.x0 + 3; x <= r.x1; x += 6) for (const y of [r.y0 + 5, r.y0 + 12, r.y1 - 2]) lamp(b, x, y, 'bulb', C_PLANT, { flicker: hh(x, y, 7707) < 0.25 ? 0.2 : 0, broken: hh(x, y, 7708) < 0.08 });
    b.light(TANK.x0 + 6.5, TANK.y0 + 6.5, 'screen', { color: 0x40b0c0, intensity: 0.45, radius: 7, y: -0.6, circuit: 0 });
    for (let i = 0; i < 10; i++) decal(z, rng.pick(['decal_puddle', 'decal_stain_water', 'decal_mold']), rng.float(r.x0 + 1, r.x1), rng.float(r.y0 + 1, TANK.y0 - 1), 1.4, 1.2, rng.float(0, 6), undefined, 0.6);
  }

  // ============================================================ loot
  for (let i = 0; i < 18; i++) {
    const x = rng.int(HALL.x0 + 1, HALL.x1 - 1), y = rng.int(HALL.y0 + 1, HALL.y1 - 1);
    if (isOpen(z, x, y) && !water(x, y)) f.floorLoot('pl_floor', x, y);
  }

  // ============================================================ the water, for the inhabitants
  z.meta.plunge = {
    deep: [[BEACH1 + 1, WAVE.y0, WAVE.x1, WAVE.y1], [DIVE.x0, DIVE.y0, DIVE.x1, DIVE.y1], [FLUME.x0, FLUME.y0, FLUME.x1, FLUME.y1], [TANK.x0, TANK.y0, TANK.x1, TANK.y1]],
    shallow: [[WAVE.x0, WAVE.y0, BEACH1, WAVE.y1], [TODDLER.x0, TODDLER.y0, TODDLER.x1, TODDLER.y1]],
    lair: [WAVE.x1 - 6, Math.floor((WAVE.y0 + WAVE.y1) / 2)],
  };

  // ============================================================ env, power, inhabitants
  for (const cc of [C_HALL, C_FOYER, C_PLANT, C_CAFE]) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0xb4c8d0, ambientI: 0.55, fog: 0xd8eaf0, fogNear: 22, fogFar: 54, void: 0xa8c4cc, temp: 28,
    sky: false, grade: 'pool', reverb: 'pool', ambience: 'pool', music: 'pads',
  };
  z.spawnTable = [['gulper_tadpole', 3], ['frog_piranha', 2], ['balloon_puffer', 2.2], ['lifeguard', 0.4]];
  z.creatureCap = 9;
  z.meta.terminalLore = ['pl_notice', 'pl_waves'];
}

defZone({
  key: 'plunge', name: 'The Plunge', W, H, depth: 3,
  blurb: 'Skylights, white tile, the wave machine ticking over. The water is warm and perfectly still, apart from where it is not.',
  gen: (z, s) => { generatePlunge(z, s); },
});
