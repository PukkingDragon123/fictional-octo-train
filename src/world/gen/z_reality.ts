// Reality — the opening of a new game, before the noclip. Annex B of the
// Meridian Institute on a rainy night shift: a warm staff room with a coffee
// machine, a radio and two humming vending machines, a long office corridor
// that ends at the exit, a wet car park outside the windows. Two things here
// are not quite real yet: a pocket of yellow room sealed behind the staff-room
// wall (its door appears later) and, off to the south, a void full of room
// fragments the player falls through. src/game/intro.ts drives all of it.
//
// It is a local-only stage: never linked by portals, never reached in co-op,
// and dropped from the world once the intro is over.
import { defZone } from '../worldGraph';
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { anchor, decalAt, lamp, room, BACK, FACE, Rot } from './meridian_kit';
import { objDef } from '../objects';

const objDefExists = (k: string) => !!objDef(k);

export const INTRO_ZONE = 'reality';

/** Everything the intro script needs to know about the stage (zone.meta.intro). */
export interface RealityLayout {
  start: [number, number, number];
  /** staff room tile rect */
  room: [number, number, number, number];
  corridor: [number, number, number, number];
  pocket: [number, number, number, number];
  /** the edge where the door that was not there appears */
  pocketDoor: [number, number, 0 | 1];
  coffee: number;
  coffeeAt: [number, number];
  radioAt: [number, number];
  tv: number;
  windows: [number, number][];
  /** wall props that turn into the poster */
  wallSwap: number[];
  poster: { v: number; spots: [number, number, Rot][] };
  /** staff-room floor tiles, nearest the pocket door first */
  creep: [number, number][];
  /** tiles whose wall faces go yellow, nearest first */
  paperCreep: [number, number][];
  loop: { x: number; y0: number; y1: number; dx: number };
  lights: { warm: number[]; fluoro: number[]; corridor: number[]; screens: number[]; pocket: number[]; fall: number[] };
  fall: { x: number; z: number; top: number; bottom: number; rect: [number, number, number, number] };
}

// staff room
const RX0 = 60, RY0 = 10, RX1 = 71, RY1 = 19;
// corridor (runs west from the staff room to the exit)
const CX0 = 2, CY0 = 13, CX1 = 59, CY1 = 15;
// the sealed yellow pocket behind the staff-room west wall
const PX0 = 55, PY0 = 16, PX1 = 59, PY1 = 19;
// the void (fall) region
const VX0 = 22, VY0 = 25, VX1 = 58, VY1 = 46;
const FALL_X = 40, FALL_Y = 36;

function generateReality(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const lightOf = (o: TileObject | null) => (o ? z.lights.filter((l) => l.objUid === o.uid).map((l) => l.id) : []);
  const empty = { loot: '' };
  const L: RealityLayout['lights'] = { warm: [], fluoro: [], corridor: [], screens: [], pocket: [], fall: [] };

  // ------------------------------------------------------------ outside: the staff car park in the rain
  b.fillFloor(1, 1, 78, 8, 'asphalt');
  b.fillFloor(1, 9, 78, 9, 'sidewalk');
  b.addRoom('Staff car park', 'parking', 1, 1, 78, 9, { outdoor: true });
  for (let x = 3; x < 78; x += 3) decalAt(z, 'decal_parking_line', x, 4.5, 3, 0.12, Math.PI / 2, 0xe0dccb, 0.85);
  for (let i = 0; i < 26; i++) decalAt(z, 'decal_puddle', rng.float(2, 77), rng.float(1.5, 9.5), rng.float(0.8, 2.2), rng.float(0.7, 1.6), rng.float(0, Math.PI), 0xb8c4d0, 0.8);
  for (let x = 12; x < 78; x += 16) b.obj('lamp_post', x, 2, 0, {});
  b.obj('lamp_post', 67, 4, 0, {});
  f.place('dumpster', 4, 2, 0, empty);
  f.place('trash_can_outdoor', 69, 8, 0, empty);
  f.place('bench_park', 72, 8, 0, {});

  // ------------------------------------------------------------ building shell
  b.hwall(2, 71, RY0, 'brick');
  b.hwall(2, 71, RY1 + 1, 'brick');
  b.vwall(2, RY0, RY1, 'brick');
  b.vwall(RX1 + 1, RY0, RY1, 'brick');

  // ------------------------------------------------------------ staff room
  room(b, 'Staff Room', 'breakroom', RX0, RY0, RX1, RY1, { floor: 'checker', paper: 'wall_paneling', wall: null, temp: 21 });
  b.vwall(RX0, RY0, RY1, 'drywall');
  b.paper(64, RY0, 68, RY0, 'wall_kitchen');
  for (const wx of [62, 63, 66]) b.window(wx, RY0, 0, { style: 'window_metal' });
  b.door(70, RY0, 0, 'door_glass', { locked: true, sign: 'staff' });
  b.door(RX0, 14, 1, 'door_office', { open: true });
  // kitchenette along the north wall
  for (const x of [64, 65, 67, 68]) b.obj('counter_kitchen', x, RY0, 0, empty);
  b.obj('counter_sink', 66, RY0, 0, empty);
  const counter = (x: number) => z.objectsAt(x, RY0).find((o) => o.key === 'counter_kitchen') || null;
  f.onTop('microwave', counter(64), {});
  const coffee = f.onTop('coffee_maker', counter(67), {})!;
  const radio = f.onTop('zi_radio', counter(68), {});
  f.onTop('toaster', counter(65), {});
  for (const x of [64, 65, 67, 68]) b.obj('kitchen_cabinet_wall', x, RY0, 0, empty);
  b.obj('fridge', 69, RY0, 0, empty);
  const clock = b.obj('clock_wall', 60, RY0, 0, {});
  const notice = b.obj('noticeboard', 61, RY0, 0, { lore: 'intro_notice' });
  b.obj('zi_plaque', 71, RY0, 0, {});
  f.place('zi_wet_sign', 70, 12, 0, {});
  // west wall: water, two humming machines, the television
  const W3 = BACK.w;
  b.obj('water_cooler', RX0, 11, W3, {});
  b.obj('vending_soda', RX0, 12, W3, empty);
  b.obj('vending_snack', RX0, 13, W3, empty);
  const stand = b.obj('tv_stand', RX0, 15, W3, empty);
  const tv = f.onTop('tv_crt', stand, {})!;
  const poster0 = b.obj('poster', RX0, 18, W3, { v: 2 });
  const floorLamp = b.obj('lamp_floor', RX0, RY1, 0, {});
  // a sofa facing the TV, two tables with chairs
  f.place('sofa', 63, 15, FACE.w, {});
  f.place('coffee_table', 62, 15, 0, {});
  const table = (x: number, y: number) => {
    f.place('table_round', x, y, 0, {});
    f.place('chair_plastic', x - 1, y, FACE.e, {});
    f.place('chair_plastic', x + 1, y, FACE.w, {});
    f.place('chair_plastic', x, y + 1, FACE.n, {});
  };
  table(66, 14);
  table(68, 17);
  f.place('plant_potted', RX1, RY1, 0, {});
  f.place('trash_can', RX1, 12, 0, empty);
  f.place('armchair', 64, 18, FACE.n, {});
  // rain tracked in under the staff door; a coffee ring on the counter side
  for (let i = 0; i < 4; i++) decalAt(z, 'decal_footprints', 70.5 - i * 0.6, 11.2 + i * 0.75, 0.7, 0.9, Math.PI / 2 + 0.6, 0x3a3428, 0.35);
  decalAt(z, 'decal_puddle', 70.5, 10.9, 1.4, 0.9, 0.2, 0xa8b4c0, 0.75);
  decalAt(z, 'decal_stain_dark', 66.6, 12.2, 0.7, 0.7, 1.1, 0x5a4030, 0.35);
  // light: two warm bulbs, a tube over the counter, the floor lamp
  for (const [x, y] of [[63, 13], [67, 13], [67, 17]]) L.warm.push(...lightOf(lamp(b, x, y, 0, { kind: 'light_bulb' })));
  L.fluoro.push(...lightOf(lamp(b, 66, 11, 0, { kind: 'light_fluoro' })));
  L.warm.push(...lightOf(floorLamp));
  L.screens.push(...lightOf(tv));
  for (const o of z.objects.values()) if (o.key.startsWith('vending')) L.screens.push(...lightOf(o));

  // ------------------------------------------------------------ the corridor: offices to the north, the exit far to the west
  room(b, 'Corridor', 'hall', CX0, CY0, CX1, CY1, { floor: 'carpet_office', paper: 'wall_office', wall: null });
  b.hwall(CX0, CX1, CY0, 'drywall');
  b.hwall(CX0, CX1, CY1 + 1, 'drywall');
  b.vwall(CX0, CY0, CY1, 'brick');
  b.door(CX0, 14, 1, 'door_metal', { locked: true, sign: 'exit' });
  b.obj('exit_sign', CX0, 14, BACK.w, {});
  // seven identical offices (period 8): the corridor must look the same wherever it loops
  for (let k = 0; k < 7; k++) {
    const x0 = 4 + k * 8, x1 = x0 + 7;
    room(b, 'Office ' + (201 + k), 'office', x0, RY0, x1, 12, { floor: 'carpet_office', paper: 'wall_office', wall: null });
    b.vwall(x0, RY0, 12, 'drywall');
    b.door(x0 + 4, CY0, 0, 'door_office', { locked: true });
    for (const wx of [x0 + 2, x0 + 6]) b.window(wx, RY0, 0, { style: 'window_metal' });
    b.obj('desk_office', x0 + 1, RY0, 0, empty);
    const desk = z.objectsAt(x0 + 1, RY0).find((o) => o.key === 'desk_office') || null;
    f.onTop('computer', desk, { on: k % 3 === 1 });
    b.obj('chair_office', x0 + 2, 11, FACE.n, {});
    b.obj('filing_cabinet', x0 + 5, RY0, 0, empty);
    b.obj('plant_potted', x0 + 7, 12, 0, {});
    // corridor dressing per period: a light (every other one dark), a safety poster, a water stain
    b.obj('poster', x0 + 1, CY0, 0, { v: 1 });
    decalAt(z, 'decal_stain_water', x0 + 6.4, 14.6, 1.3, 1.0, 0.4, 0xc8bca0, 0.5);
  }
  b.vwall(RX0, RY0, 12, 'drywall');
  for (let x = 6; x <= 58; x += 4) {
    const o = lamp(b, x, 14, 0, { kind: 'light_fluoro', on: x % 8 === 6 });
    L.corridor.push(...lightOf(o));
  }
  b.obj('noticeboard', 57, CY0, 0, { lore: 'intro_rota' });

  // ------------------------------------------------------------ the pocket: yellow, damp, sealed (for now)
  room(b, '?', 'pocket', PX0, PY0, PX1, PY1, { floor: 'carpet_yellow', paper: 'wall_yellow', wall: null, temp: 22 });
  b.vwall(PX0, PY0, PY1, 'drywall');
  for (let y = PY0; y <= PY1; y++) for (let x = PX0; x <= PX1; x++) b.floorVar(x, y, (x * 7 + y * 3) % 3);
  L.pocket.push(...lightOf(lamp(b, 59, 17, 0, { kind: 'light_fluoro' })), ...lightOf(lamp(b, 56, 19, 0, { kind: 'light_fluoro', flicker: 0.08 })));
  for (const l of z.lights) if (L.pocket.includes(l.id)) { l.color = 0xf6e9a4; l.intensity = 1.05; l.radius = 6.5; }
  decalAt(z, 'decal_stain_water', 56.6, 18.4, 1.8, 1.4, 0.3, 0x8a7a40, 0.5);
  decalAt(z, 'decal_mold', PX0 + 0.4, PY1 + 0.6, 1.0, 0.8, 0.1, 0x6a6a30, 0.5);

  // ------------------------------------------------------------ the void: fragments of rooms at every depth
  for (let y = VY0; y <= VY1; y++) for (let x = VX0; x <= VX1; x++) z.height[z.idx(x, y)] = -128;
  const depth = (x0: number, y0: number, x1: number, y1: number, h: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) z.height[z.idx(x, y)] = Math.round(h * 10);
  };
  const slab = (tex: string, cx: number, cy: number, w: number, d: number, tint = 0xffffff) => decalAt(z, tex, cx, cy, w, d, 0, tint);
  // a table and chairs from the staff room
  depth(36, 32, 38, 33, -1.2);
  slab('linoleum', 37.5, 33.0, 3, 2);
  f.place('table_round', 37, 33, 0, {}); f.place('chair_plastic', 36, 33, FACE.e, {}); f.place('chair_plastic', 38, 32, FACE.s, {});
  // the soda machine, still lit
  depth(43, 33, 43, 33, -2.6);
  const vend = b.obj('vending_soda', 43, 33, 1, { ...empty, yaw: 0.35 });
  L.fall.push(...lightOf(vend));
  // a piece of the staff-room wall with its window and the poster
  // (big pieces stay off the camera side of the fall line, x + z > column, or they hide the faller)
  depth(36, 39, 38, 40, -3.8);
  b.hwall(36, 38, 40, 'drywall'); b.paper(36, 39, 38, 40, 'wall_paneling');
  b.window(37, 40, 0, { style: 'window_metal' });
  b.obj('poster', 36, 40, 0, { v: 2 });
  // a yellow corner with a buzzing tube
  depth(33, 35, 34, 38, -5.2);
  b.vwall(34, 35, 38, 'drywall'); b.hwall(33, 34, 35, 'drywall'); b.paper(33, 35, 34, 38, 'wall_yellow');
  slab('carpet_yellow', 34.0, 37.0, 2, 4);
  L.fall.push(...lightOf(lamp(b, 34, 37, 0, { kind: 'light_fluoro', flicker: 0.25 })));
  // a doorframe to nowhere, door open
  depth(45, 29, 46, 30, -6.6);
  b.hwall(45, 46, 30, 'drywall'); b.paper(45, 29, 46, 30, 'wall_office');
  b.door(45, 30, 0, 'door_office', { open: true });
  // office furniture, drifting
  depth(35, 28, 36, 29, -7.8);
  b.obj('chair_office', 35, 28, 0, { yaw: 0.8 }); b.obj('filing_cabinet', 36, 29, 0, { ...empty, yaw: -0.3 });
  // single things on their own
  depth(44, 35, 44, 35, -4.4); b.obj('chair_plastic', 44, 35, 0, { yaw: 1.9 });
  depth(35, 33, 35, 33, -3.0); L.fall.push(...lightOf(b.obj('lamp_floor', 35, 33, 0, {})));
  depth(47, 36, 47, 36, -8.2); b.obj('zi_radio', 47, 36, 0, { yaw: 0.6 });
  depth(34, 40, 34, 40, -8.8); b.obj('vending_snack', 34, 40, 2, { ...empty, yaw: -0.5 });
  // a slab of damp carpet, then the counter with the coffee machine
  depth(44, 31, 47, 34, -9.0);
  slab('carpet_yellow', 46.0, 33.0, 4, 4); slab('decal_stain_water', 45.6, 32.6, 1.6, 1.4, 0x8a7a40);
  depth(33, 30, 34, 31, -10.0);
  const c2 = b.obj('counter_kitchen', 33, 30, 0, empty); f.onTop('coffee_maker', c2, {}); b.obj('chair_plastic', 34, 31, 0, { yaw: 2.6 });
  // debris all the way down: ceiling tiles, paperwork, small furniture, the odd sign
  const used = new Set<number>();
  const mark = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) used.add(z.idx(x, y)); };
  mark(36, 32, 38, 33); mark(43, 33, 43, 33); mark(36, 39, 38, 40); mark(33, 35, 34, 38); mark(45, 29, 46, 30); mark(35, 28, 36, 29);
  mark(44, 35, 44, 35); mark(35, 33, 35, 33); mark(47, 36, 47, 36); mark(34, 40, 34, 40); mark(44, 31, 47, 34); mark(33, 30, 34, 31); mark(38, 34, 42, 37);
  const debris: [string, number][] = [['zi_ceiling', 6], ['p_paper_doc', 3], ['carpet_yellow', 2], ['chair_plastic', 1.2], ['chair_office', 0.8], ['trash_can', 0.8], ['plant_potted', 0.6],
    ['cardboard_box', 0.8], ['poster', 1], ['clock_wall', 0.6], ['exit_sign', 0.5], ['fire_extinguisher_wall', 0.5], ['computer', 0.6], ['lamp_table', 0.5], ['water_cooler', 0.4], ['filing_cabinet', 0.4]];
  const N = 54;
  for (let i = 0, tries = 0; i < N && tries < 900; tries++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(1.7, 7.5);
    const x = Math.floor(FALL_X + 0.5 + Math.cos(a) * r), y = Math.floor(FALL_Y + 0.5 + Math.sin(a) * r * 0.9);
    if (x < VX0 || x > VX1 || y < VY0 || y > VY1 || used.has(z.idx(x, y))) continue;
    // nothing solid between the camera and the faller
    const dx = x + 0.5 - (FALL_X + 0.5), dz = y + 0.5 - (FALL_Y + 0.5);
    if (dx + dz > 0.4 && Math.abs(dx - dz) < 2.6) continue;
    used.add(z.idx(x, y));
    const h = 1.2 - (i + rng.float(0, 1)) / N * 12.4;
    depth(x, y, x, y, h);
    const k = rng.weighted(debris);
    if (objDefExists(k)) b.obj(k, x, y, rng.int(0, 3) as Rot, { ...empty, yaw: rng.float(-1.2, 1.2), v: rng.int(0, 3) });
    else decalAt(z, k, x + rng.float(0.3, 0.7), y + rng.float(0.3, 0.7), k === 'p_paper_doc' ? 0.42 : 1, k === 'p_paper_doc' ? 0.56 : 1, rng.float(0, Math.PI), k === 'carpet_yellow' ? 0xe8dca0 : 0xffffff);
    i++;
  }
  // and at the bottom, the floor of somewhere else
  depth(38, 34, 42, 37, -12.0);
  slab('carpet_yellow', 40.5, 36.0, 5, 4); slab('decal_puddle', 41.2, 35.4, 1.6, 1.2, 0xb0a860);
  L.fall.push(...lightOf(lamp(b, 40, 36, 0, { kind: 'light_fluoro' })));
  z.meta.noWeather = true;

  // ------------------------------------------------------------ the script's map of the stage
  const creep: [number, number][] = [];
  for (let y = RY0; y <= RY1; y++) for (let x = RX0; x <= RX1; x++) creep.push([x, y]);
  const dPocket = (x: number, y: number) => Math.hypot(x - RX0, (y - 17) * 1.15) + ((x * 13 + y * 7) % 5) * 0.35;
  creep.sort((a, c) => dPocket(a[0], a[1]) - dPocket(c[0], c[1]));
  const paperCreep: [number, number][] = [];
  for (let y = RY0; y <= RY1; y++) paperCreep.push([RX0, y]);
  for (let x = RX0 + 1; x <= RX1; x++) paperCreep.push([x, RY0]);
  for (let x = 55; x <= CX1; x++) paperCreep.push([x, CY0]);
  paperCreep.sort((a, c) => dPocket(a[0], a[1]) - dPocket(c[0], c[1]));
  const spots: [number, number, Rot][] = [[RX0, 16, W3], [RX0, RY1, W3]];
  for (let k = 0; k < 7; k++) for (const dx of [2, 3, 5, 6, 7]) spots.push([4 + k * 8 + dx, CY0, 0]);
  const layout: RealityLayout = {
    start: [65, 13, -Math.PI / 2],
    room: [RX0, RY0, RX1, RY1], corridor: [CX0, CY0, CX1, CY1], pocket: [PX0, PY0, PX1, PY1],
    pocketDoor: [RX0, 17, 1],
    coffee: coffee.uid, coffeeAt: [67.5, 10.5], radioAt: [68.5, 10.5], tv: tv.uid,
    windows: [[62.5, 10], [63.5, 10], [66.5, 10]],
    wallSwap: [clock?.uid ?? -1, notice?.uid ?? -1].filter((u) => u >= 0),
    poster: { v: poster0?.state.v ?? 2, spots },
    creep, paperCreep,
    loop: { x: 24, y0: CY0, y1: CY1, dx: 16 },
    lights: L,
    fall: { x: FALL_X + 0.5, z: FALL_Y + 0.5, top: 1.6, bottom: -11.2, rect: [VX0, VY0, VX1, VY1] },
  };
  z.meta.intro = layout;
  anchor(z, 'start', layout.start[0], layout.start[1], 'n');

  // nobody else is here, and nothing lives here (yet): the table names what
  // would, the cap of zero keeps it out
  b.flag(0, 0, z.W - 1, z.H - 1, TF.NOSPAWN | TF.SAFE);
  b.flag(1, 1, 78, 9, TF.OUTDOOR);
  z.spawnTable = [['employee', 1]];
  z.creatureCap = 0;
  z.env = {
    ...z.env,
    ambient: 0x3a2c1e, ambientI: 0.36, fog: 0x0c0a08, fogNear: 18, fogFar: 36, void: 0x040303, temp: 20,
    sky: false, grade: 'house', reverb: 'small', ambience: 'exit', music: 'none', weather: 'rain', outdoorAmbient: 0x223040,
  };
}

defZone({
  key: INTRO_ZONE, name: 'Meridian Institute — Annex B', W: 80, H: 48, depth: 0, gen: (z, s) => generateReality(z, s),
  blurb: 'Night shift. Raining.',
});
