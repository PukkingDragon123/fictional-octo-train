// The opening of a new game: the Meridian Institute's processing wing, 1990.
// A long wet-concrete corridor between two Custody Officers: observation glass
// with still figures behind it, ceiling CRTs showing the new debtor's mugshot,
// the hand-painted REMITTANCE PROGRAMME board, a rack of yellow jumpsuits, a
// humming process unit, a doorway somebody bricked over, and a service
// corridor that goes on much further than the building does. Then the tiled
// antechamber with the drain in the middle, and Room 0: dark, and in its far
// wall the Seam. Off to the south-east, a void the debtor falls through.
// src/game/intro.ts drives all of it.
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
import { seamDecals, seamFace } from './seam_kit';

export const INTRO_ZONE = 'reality';

/** Everything the intro script needs to know about the stage (zone.meta.intro). World coordinates (metres). */
export interface RealityLayout {
  /** player start tile + facing */
  start: [number, number, number];
  guardA: [number, number];
  guardB: [number, number];
  /** corridor (tile rect) */
  corridor: [number, number, number, number];
  /** world x where the guard grabs the debtor */
  grabX: number;
  /** the drag, from the grab to the drain (world points) */
  drag: [number, number][];
  /** where the beating happens */
  beat: [number, number];
  /** Room 0 door edge [x, y, side] and the point just inside */
  door0: [number, number, 0 | 1];
  inside0: [number, number];
  /** the Seam: tile, its face centre and outward normal */
  seam: { uid: number; x: number; z: number; nx: number; nz: number };
  /** opening shot: the first mugshot monitor */
  focus: [number, number];
  monitors: number[];
  /** the service corridor that is too long (tile rect) and the figure at its end */
  longHall: [number, number, number, number];
  figure: number;
  fall: { x: number; z: number; top: number; bottom: number; rect: [number, number, number, number] };
  lights: { corridor: number[]; room0: number[]; ante: number[]; fall: number[] };
}

// corridor (runs east from the holding door to the antechamber)
const CX0 = 3, CY0 = 20, CX1 = 47, CY1 = 22;
// antechamber (the drain) and Room 0 (the Seam)
const AX0 = 48, AY0 = 18, AX1 = 55, AY1 = 24;
const RX0 = 56, RY0 = 17, RX1 = 63, RY1 = 25, SEAM_X = 60;
// the service corridor that is too long
const LX0 = 19, LX1 = 20, LY0 = 1, LY1 = 19;
// the void (fall) region
const VX0 = 30, VY0 = 30, VX1 = 66, VY1 = 46;
const FALL_X = 50, FALL_Y = 38;

/** stencilled paint on the north wall of tile (x, y): a wall decal, so the wall shows between the letters */
function notice(z: Zone, x: number, y: number, v: number) {
  z.decals.push({ x: x + 0.5, z: y + 0.065, y: 1.55, w: 2.9, d: 0.27, rot: Math.PI / 2, tex: 'zp_notice_' + v, vert: 1 });
}

function generateReality(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const lightOf = (o: TileObject | null) => (o ? z.lights.filter((l) => l.objUid === o.uid).map((l) => l.id) : []);
  const L: RealityLayout['lights'] = { corridor: [], room0: [], ante: [], fall: [] };
  const monitors: number[] = [];
  const wall = 'concrete', paper = 'zp_wall_inst';

  // ------------------------------------------------------------ the corridor
  // (the camera looks north-east along it, so everything to see hangs on the north wall)
  room(b, 'Processing Corridor', 'processing_corridor', CX0, CY0, CX1, CY1, { floor: 'concrete_wet', paper, wall, temp: 15 });
  for (let y = CY0; y <= CY1; y++) for (let x = CX0; x <= CX1; x++) b.floorVar(x, y, (x * 5 + y * 3) % 2);
  // where you came from: a holding door, locked behind you
  b.door(CX0, 21, 1, 'door_metal', { locked: true, sign: 'staff' });
  notice(z, 4, CY0, 4);
  // observation glass, still figures behind it
  const obs = (x0: number, n: number, name: string) => {
    room(b, name, 'observation', x0, 17, x0 + 4, 19, { floor: 'concrete', paper: 'zp_wall_dark', wall, temp: 15 });
    b.hwall(x0, x0 + 4, CY0, 'glass');
    const xs = n === 1 ? [x0 + 2] : n === 2 ? [x0 + 1, x0 + 3] : [x0 + 1, x0 + 2, x0 + 4];
    xs.forEach((x, i) => b.obj('zp_observer', x, 18 + (i % 2), FACE.s, { v: (x0 + i) % 3 }));
    // lit from behind, so you only ever see the outline
    b.light(x0 + 2.5, 17.1, 'bulb', { intensity: 1.0, radius: 3.4, y: 2.0, color: 0xffe0b0 });
  };
  obs(9, 2, 'Observation A');
  obs(25, 3, 'Observation B');
  // mugshot monitors hung from the wall, the board, a doorway bricked over, notices
  const mon = (x: number) => { const o = b.obj('zp_crt_wall', x, CY0, BACK.n, {}); if (o) { monitors.push(o.uid); L.corridor.push(...lightOf(o)); } return o; };
  mon(7); mon(31); mon(42);
  b.obj('zp_sign_remit', 22, CY0, BACK.n, {});
  b.obj('zp_bricked_door', 35, CY0, BACK.n, {});
  notice(z, 14, CY0, 0);
  notice(z, 33, CY0, 2);
  notice(z, 44, CY0, 1);
  b.obj('fire_extinguisher_wall', 46, CY0, BACK.n, {});
  b.obj('zg_pa_speaker', 24, CY0, BACK.n, {});
  // kit issue alcove: the rack of yellow jumpsuits, lockers
  room(b, 'Kit Issue', 'kit', 15, 17, 17, 19, { floor: 'concrete', paper, wall, temp: 15 });
  for (let x = 15; x <= 17; x++) b.gap(x, CY0, 0);
  b.obj('zp_jumpsuit_rack', 15, 17, 0, { loot: '' });
  b.obj('locker', 17, 17, 0, { loot: '' });
  b.light(16.5, 18.6, 'bulb', { intensity: 0.7, radius: 3.4, y: 2.3, color: 0xffc070 });
  // process unit alcove
  room(b, 'Process Unit 4', 'machine', 37, 17, 40, 19, { floor: 'concrete', paper: 'wall_concrete', wall, temp: 19 });
  for (let x = 37; x <= 40; x++) b.gap(x, CY0, 0);
  b.obj('zp_machine', 38, 17, 0, {});
  b.light(38.5, 19.2, 'sodium', { intensity: 0.75, radius: 4.2, y: 2.4 });
  decalAt(z, 'decal_stain_dark', 39.2, 19.4, 1.6, 1.0, 0.3, 0x2a2018, 0.6);
  // the service corridor behind the chain link: it goes on, and on, and on
  room(b, 'Service Corridor', 'long_corridor', LX0, LY0, LX1, LY1, { floor: 'concrete', paper: 'wall_concrete', wall, temp: 13 });
  b.hwall(LX0, LX1, CY0, 'fence_chain');
  for (let y = LY1 - 2, i = 0; y >= LY0; y -= 5, i++) b.light(LX0 + 1, y + 0.5, 'sodium', { intensity: Math.max(0.25, 0.85 - i * 0.13), radius: 3.6, y: 2.4, flicker: i === 2 ? 0.3 : 0 });
  const figure = b.obj('zp_observer', LX0 + 1, LY0 + 2, FACE.s, { v: 1 });
  for (let y = LY0 + 1; y < LY1; y += 4) decalAt(z, 'decal_puddle', LX0 + 1 + rng.float(-0.3, 0.3), y + rng.float(0, 1), 1.2, 0.8, rng.float(0, 3), 0x9aa4a8, 0.6);
  // corridor light: cold tubes, a couple stuttering
  for (let x = 5; x <= CX1; x += 4) {
    const o = lamp(b, x, 21, 0, { kind: 'light_fluoro', flicker: x === 25 || x === 37 ? 0.22 : 0 });
    L.corridor.push(...lightOf(o));
  }
  // wet: puddles, drips, tracked footprints, a dragged smear near the end
  for (let i = 0; i < 22; i++) decalAt(z, 'decal_puddle', rng.float(CX0 + 1, CX1), rng.float(CY0 + 0.2, CY1 + 0.8), rng.float(0.6, 1.8), rng.float(0.5, 1.2), rng.float(0, Math.PI), 0xa8b4bc, 0.75);
  for (let i = 0; i < 10; i++) decalAt(z, 'decal_stain_water', rng.float(CX0 + 1, CX1), rng.float(CY0 + 0.3, CY1 + 0.7), rng.float(0.8, 1.6), rng.float(0.6, 1.2), rng.float(0, 3), 0x8a9290, 0.45);
  for (let i = 0; i < 8; i++) decalAt(z, 'decal_footprints', 8 + i * 4.6, 21.2 + (i % 2) * 0.6, 0.7, 0.9, 0, 0x2a2826, 0.35);
  decalAt(z, 'decal_blood_drip', 44.6, 21.6, 1.8, 0.5, 0.05, 0x5a1a14, 0.4);

  // ------------------------------------------------------------ the antechamber: tile, a drain, a hose
  room(b, 'Antechamber', 'processing', AX0, AY0, AX1, AY1, { floor: 'tile_white', paper: 'wall_bathroom', wall, temp: 14 });
  b.door(AX0, 21, 1, 'door_metal', { open: true });
  b.obj('zp_floor_drain', 51, 21, 0, {});
  b.obj('zp_hose_reel', 50, AY0, BACK.n, {});
  notice(z, 53, AY0, 3);
  f.place('bench', 49, AY1, FACE.n, {});
  f.place('mop_bucket', 54, AY1, 0, {});
  f.place('gurney', 53, 19, FACE.w, {});
  decalAt(z, 'decal_stain_dark', 51.4, 21.6, 2.4, 2.0, 0.3, 0x4a1a14, 0.5);
  decalAt(z, 'decal_puddle', 50.6, 22.3, 2.2, 1.2, 0.4, 0xb0b8bc, 0.7);
  decalAt(z, 'decal_blood_drip', 51.8, 20.8, 1.2, 0.6, 1.2, 0x6a1a14, 0.45);
  for (const [x, y] of [[50, 20], [53, 22]] as [number, number][]) L.ante.push(...lightOf(lamp(b, x, y, 0, { kind: 'light_fluoro', flicker: x === 53 ? 0.15 : 0 })));

  // ------------------------------------------------------------ Room 0
  room(b, 'Room 0', 'seam_room', RX0, RY0, RX1, RY1, { floor: 'concrete', paper: 'zp_wall_dark', wall, temp: 9 });
  b.door(RX0, 21, 1, 'door_metal', { locked: false, sign: 'danger' });
  const seamO = b.obj('seam_door', SEAM_X, RY0, BACK.n, {});
  seamDecals(z, SEAM_X, RY0, BACK.n);
  // a caged bulb by the door, a weak cold light that the Seam drinks
  L.room0.push(b.light(RX0 + 0.8, 20.2, 'emergency', { intensity: 0.4, radius: 3.4, y: 2.4 }).id);
  L.room0.push(b.light(SEAM_X + 0.5, RY0 + 2.6, 'bulb', { intensity: 0.5, radius: 5.2, y: 2.5, color: 0xc8d4e0 }).id);
  for (let i = 0; i < 6; i++) decalAt(z, 'decal_stain_dark', rng.float(RX0 + 1, RX1), rng.float(RY0 + 1, RY1), rng.float(0.8, 1.6), rng.float(0.6, 1.2), rng.float(0, 3), 0x101010, 0.5);
  // things that were left too near it, and dragged in by the light
  f.place('chair_office', 61, 24, FACE.e, {});
  decalAt(z, 'decal_footprints', 58.6, 20.2, 0.7, 0.9, -0.9, 0x101010, 0.45);
  decalAt(z, 'decal_footprints', 59.8, 18.8, 0.7, 0.9, -0.9, 0x101010, 0.45);

  // ------------------------------------------------------------ the void: what falls with you
  for (let y = VY0; y <= VY1; y++) for (let x = VX0; x <= VX1; x++) z.height[z.idx(x, y)] = -128;
  const depth = (x: number, y: number, h: number) => { z.height[z.idx(x, y)] = Math.round(h * 10); };
  const pieces: [string, number][] = [['chair_office', 1.4], ['zp_jumpsuit_rack', 0.7], ['filing_cabinet', 0.8], ['locker', 0.8], ['bench', 0.9], ['gurney', 0.6], ['cardboard_box', 1],
    ['mop_bucket', 0.6], ['concrete_wet', 2.2], ['tile_white', 1.6], ['p_paper_doc', 2.4], ['zp_observer', 0.35], ['trash_can', 0.6]];
  const used = new Set<number>();
  const N = 34;
  for (let i = 0, tries = 0; i < N && tries < 900; tries++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(1.8, 7.5);
    const x = Math.floor(FALL_X + 0.5 + Math.cos(a) * r), y = Math.floor(FALL_Y + 0.5 + Math.sin(a) * r * 0.9);
    if (x < VX0 || x > VX1 || y < VY0 || y > VY1 || used.has(z.idx(x, y))) continue;
    // nothing solid between the camera and the faller
    const dx = x + 0.5 - (FALL_X + 0.5), dz = y + 0.5 - (FALL_Y + 0.5);
    if (dx + dz > 0.4 && Math.abs(dx - dz) < 2.8) continue;
    used.add(z.idx(x, y));
    depth(x, y, 0.6 - (i + rng.float(0, 1)) / N * 13);
    const k = rng.weighted(pieces);
    if (objDef(k)) b.obj(k, x, y, rng.int(0, 3) as Rot, { loot: '', yaw: rng.float(-1.2, 1.2), v: rng.int(0, 3) });
    else decalAt(z, k, x + rng.float(0.3, 0.7), y + rng.float(0.3, 0.7), k === 'p_paper_doc' ? 0.42 : 1, k === 'p_paper_doc' ? 0.56 : 1, rng.float(0, Math.PI), k === 'concrete_wet' ? 0xb8b8b0 : 0xffffff);
    i++;
  }
  z.meta.noWeather = true;

  // ------------------------------------------------------------ the script's map of the stage
  const seamUid = seamO?.uid ?? -1;
  const layout: RealityLayout = {
    start: [5, 21, 0],
    guardA: [7.4, 21.4], guardB: [3.9, 21.6],
    corridor: [CX0, CY0, CX1, CY1],
    grabX: 41.2,
    drag: [[41.5, 21.5], [44.5, 21.5], [48.2, 21.5], [51.2, 21.5]],
    beat: [51.4, 21.5],
    door0: [RX0, 21, 1], inside0: [RX0 + 1.6, 21.5],
    seam: { uid: seamUid, ...seamFace(SEAM_X, RY0, BACK.n) },
    focus: [7.5, 20.7],
    monitors,
    longHall: [LX0, LY0, LX1, LY1], figure: figure?.uid ?? -1,
    fall: { x: FALL_X + 0.5, z: FALL_Y + 0.5, top: 0.4, bottom: -13, rect: [VX0, VY0, VX1, VY1] },
    lights: L,
  };
  z.meta.intro = layout;
  anchor(z, 'start', layout.start[0], layout.start[1], 'e');

  // nobody else is here, and nothing lives here (yet)
  b.flag(0, 0, z.W - 1, z.H - 1, TF.NOSPAWN | TF.SAFE);
  z.spawnTable = [['employee', 1]];
  z.creatureCap = 0;
  z.env = {
    ...z.env,
    ambient: 0x1a1e20, ambientI: 0.3, fog: 0x080a0a, fogNear: 13, fogFar: 27, void: 0x020203, temp: 15,
    sky: false, grade: 'office', reverb: 'tunnel', ambience: 'lab', music: 'none', weather: 'none',
  };
}

defZone({
  key: INTRO_ZONE, name: 'Meridian Institute — Processing Wing', W: 70, H: 48, depth: 0, gen: (z, s) => generateReality(z, s),
  blurb: 'Remittance Programme. Intake.',
});
