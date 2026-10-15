// Parking Level P∞ (208×208). An endless multi-storey garage built as a
// torus: the whole level is generated once on a 154×154 period and repeated,
// so walking (or driving) off any edge puts you back on the other side with
// nothing to show for it. Seven modules of lane + back-to-back bays run
// east–west in a strict grid of painted concrete columns whose level numbers
// do not agree with each other (P∞, P1, P1, P2, P3, P5, P13) and sometimes
// change while you are not looking. Sodium lamps make pools of orange; some
// sectors died years ago. Somewhere in the grid: the stair core (door P2 to
// the Stairwell), the Westgate Mall entrance, Foodland's loading dock, the
// St. Aldric emergency entrance, a surface lot under no sky with the road out
// to Alder Lane, ramps up to a level that is closed and two ramps down that
// come up somewhere else.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { registerShift } from '../shift';
import { Ctx, Rot, Side, ANG, arrive, decal, hf, isOpen } from './mall_kit';
import { objDef } from '../objects';

const W = 208, H = 208;
const D = 154;                 // torus period (both axes)
const O = 25;                  // map coordinate of torus u = 0 / v = 0
const SEAM_LO = O, SEAM_HI = O + D + 3;   // 25 and 182: walking past either jumps by ±D
const MOD = 22;                // module height: lane 10 + bay row 6 + bay row 6
const NMOD = D / MOD;          // 7
const PER = 7;                 // bay pair period: bay 3 + bay 3 + column 1
const NPER = D / PER;          // 22
const CROSS = new Set([3, 9, 14, 19]);   // periods that are north–south cross lanes
const LEVELS = ['P∞', 'P1', 'P1', 'P2', 'P3', 'P5', 'P13'];
// circuits
const C_GAR = 1, C_LOT = 2, C_CORE = 3;

const laneV0 = (m: number) => m * MOD;
const bandA = (m: number) => m * MOD + 10;   // bay row A (opens north onto lane m)
const bandB = (m: number) => m * MOD + 16;   // bay row B (opens south onto lane m + 1)
const wrap = (a: number) => ((a % D) + D) % D;
const mx = (u: number) => O + u;             // primary map x of torus u (u in 0..153)
const my = (v: number) => O + v;

interface Block { k0: number; k1: number; m: number; kind: string }
/** bay-band blocks taken over by set pieces (periods k0..k1 of module m) */
const BLOCKS: Block[] = [
  { m: 3, k0: 7, k1: 8, kind: 'stair' },
  { m: 1, k0: 11, k1: 13, kind: 'mall' },
  { m: 5, k0: 4, k1: 6, kind: 'hospital' },
  { m: 2, k0: 16, k1: 18, kind: 'dock' },
  { m: 4, k0: 10, k1: 15, kind: 'lot' },
  { m: 4, k0: 7, k1: 8, kind: 'exit' },
  { m: 0, k0: 10, k1: 10, kind: 'ramp_up' },
  { m: 6, k0: 2, k1: 2, kind: 'ramp_up' },
  { m: 1, k0: 4, k1: 4, kind: 'ramp_a' },
  { m: 3, k0: 15, k1: 15, kind: 'ramp_b' },
  { m: 0, k0: 7, k1: 8, kind: 'core' },
  { m: 5, k0: 15, k1: 16, kind: 'core' },
  { m: 6, k0: 17, k1: 18, kind: 'camp' },
];
/** set pieces drawn over ordinary bays (the bays stay) */
const OVERLAY = new Set(['camp', 'ramp_up']);
const blockAt = (m: number, k: number) => BLOCKS.find((b) => b.m === m && k >= b.k0 && k <= b.k1);
// shifting blocks (inside the unique window, so only one copy exists)
const SHIFTS: { id: string; m: number; k0: number; k1: number }[] = [
  { id: 'park_a', m: 2, k0: 6, k1: 8 },
  { id: 'park_b', m: 1, k0: 7, k1: 8 },
  { id: 'park_c', m: 3, k0: 11, k1: 13 },
];
const shiftAt = (m: number, k: number) => SHIFTS.find((s) => s.m === m && k >= s.k0 && k <= s.k1);

/**
 * Torus painter: everything is described once in (u, v) and stamped at every
 * copy that falls inside the map, so both sides of every seam match.
 */
class Torus {
  constructor(public b: ZoneBuilder) {}
  get z() { return this.b.z; }
  /** map offsets of all copies of a torus rect that intersect the map */
  copies(u0: number, v0: number, u1: number, v1: number): [number, number][] {
    const out: [number, number][] = [];
    for (let kx = -1; kx <= 1; kx++) for (let ky = -1; ky <= 1; ky++) {
      const ox = O + kx * D, oy = O + ky * D;
      if (u1 + ox < 0 || u0 + ox >= W || v1 + oy < 0 || v0 + oy >= H) continue;
      out.push([ox, oy]);
    }
    return out;
  }
  floor(u0: number, v0: number, u1: number, v1: number, f: string) { for (const [ox, oy] of this.copies(u0, v0, u1, v1)) this.b.fillFloor(Math.max(0, u0 + ox), Math.max(0, v0 + oy), Math.min(W - 1, u1 + ox), Math.min(H - 1, v1 + oy), f); }
  paper(u0: number, v0: number, u1: number, v1: number, p: string) { for (const [ox, oy] of this.copies(u0, v0, u1, v1)) this.b.paper(u0 + ox, v0 + oy, u1 + ox, v1 + oy, p); }
  flag(u0: number, v0: number, u1: number, v1: number, f: number) { for (const [ox, oy] of this.copies(u0, v0, u1, v1)) this.b.flag(u0 + ox, v0 + oy, u1 + ox, v1 + oy, f); }
  void(u0: number, v0: number, u1: number, v1: number) {
    for (const [ox, oy] of this.copies(u0, v0, u1, v1)) for (let y = v0 + oy; y <= v1 + oy; y++) for (let x = u0 + ox; x <= u1 + ox; x++) if (this.z.inb(x, y)) this.z.floor[this.z.idx(x, y)] = 0;
  }
  hwall(u0: number, u1: number, v: number, w: string) { for (const [ox, oy] of this.copies(u0, v, u1, v)) this.b.hwall(u0 + ox, u1 + ox, v + oy, w); }
  vwall(u: number, v0: number, v1: number, w: string) { for (const [ox, oy] of this.copies(u, v0, u, v1)) this.b.vwall(u + ox, v0 + oy, v1 + oy, w); }
  walls(u0: number, v0: number, u1: number, v1: number, w: string) { this.hwall(u0, u1, v0, w); this.hwall(u0, u1, v1 + 1, w); this.vwall(u0, v0, v1, w); this.vwall(u1 + 1, v0, v1, w); }
  door(u: number, v: number, side: 0 | 1, style: string, o: Record<string, any> = {}) { for (const [ox, oy] of this.copies(u, v, u, v)) if (this.z.inb(u + ox, v + oy)) this.b.door(u + ox, v + oy, side, style, o); }
  gap(u: number, v: number, side: 0 | 1) { for (const [ox, oy] of this.copies(u, v, u, v)) this.b.gap(u + ox, v + oy, side); }
  obj(key: string, u: number, v: number, rot: Rot = 0, state: Record<string, any> = {}) {
    const d = objDef(key); if (!d) return;
    const w = d.w ?? 1, dd = d.d ?? 1, rw = rot % 2 === 0 ? w : dd, rd = rot % 2 === 0 ? dd : w;
    for (const [ox, oy] of this.copies(u, v, u + rw - 1, v + rd - 1)) {
      const x = u + ox, y = v + oy;
      if (x < 0 || y < 0 || x + rw > W || y + rd > H) continue;
      if (!d.onWall && !d.ceiling && !this.b.free(x, y, rw, rd)) continue;
      this.b.obj(key, x, y, rot, state);
    }
  }
  light(u: number, v: number, kind: 'sodium' | 'fluoro' | 'bulb' | 'emergency' | 'sky' | 'neon' | 'lamp', circuit: number, o: Record<string, any> = {}) {
    for (const [ox, oy] of this.copies(u, v, u, v)) if (this.z.inb(u + ox, v + oy)) this.b.light(u + ox + 0.5, v + oy + 0.5, kind, { circuit, ...o });
  }
  /** decal centred at torus coords (cu, cv) (continuous) */
  decal(tex: string, cu: number, cv: number, w: number, d: number, rot = 0, tint?: number, alpha?: number) {
    const r = Math.max(w, d) / 2 + 1;
    for (const [ox, oy] of this.copies(Math.floor(cu - r), Math.floor(cv - r), Math.ceil(cu + r), Math.ceil(cv + r))) {
      const x = cu + ox, y = cv + oy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      decal(this.z, tex, x, y, w, d, rot, tint, alpha);
    }
  }
  room(name: string, type: string, u0: number, v0: number, u1: number, v1: number, o: Record<string, any> = {}) {
    for (const [ox, oy] of this.copies(u0, v0, u1, v1)) this.b.addRoom(name, type, Math.max(0, u0 + ox), Math.max(0, v0 + oy), Math.min(W - 1, u1 + ox), Math.min(H - 1, v1 + oy), o);
  }
}

// ---------------------------------------------------------------- generator
export function generateParking(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  const T = new Torus(b);
  z.name = 'Parking Level P∞';
  const cars: { x: number; y: number; rot: number; type?: string; chance?: number }[] = [];

  // ============================================================ the slab
  b.fillFloor(0, 0, W - 1, H - 1, 'parking');
  b.paper(0, 0, W - 1, H - 1, 'wall_garage');
  b.addRoom('Parking Level P∞', 'garage', 0, 0, W - 1, H - 1, { circuit: C_GAR, temp: 13 });

  // ============================================================ modules: lanes, bays, columns, paint, lamps
  for (let m = 0; m < NMOD; m++) {
    const v0 = laneV0(m), eastbound = m % 2 === 0;
    // lane paint: dashed centre line, direction arrows, EXIT arrows that only ever point one way
    for (let u = 0; u < D; u += 4) T.decal('decal_parking_line', u + 1, v0 + 5, 2.2, 0.14, 0, 0xe0b830, 0.85);
    for (let u = 10; u < D; u += 21) {
      T.decal('decal_arrow_floor', u + 0.5, v0 + 2.5, 1.6, 1.6, eastbound ? Math.PI / 2 : -Math.PI / 2, 0xffffff, 0.8);
      T.decal('decal_arrow_floor', u + 11, v0 + 7.5, 1.6, 1.6, eastbound ? Math.PI / 2 : -Math.PI / 2, 0xffffff, 0.8);
    }
    for (let u = 30; u < D; u += 44) T.decal('zg_dc_exit', u + 0.5, v0 + 7.5, 3.2, 1.0, 0, 0xffffff, 0.85);
    for (let u = 5; u < D; u += 51) T.decal('zg_dc_pinf', u + 0.5, v0 + 2.5, 2.0, 1.0, 0, 0xffffff, 0.8);
    for (let u = 17; u < D; u += 38) T.decal('zg_dc_slow', u + 0.5, v0 + 2.5, 2.4, 0.9, 0, 0xffffff, 0.75);
    // lamps over the lane every two bay pairs; sectors that died stay dark
    for (let k = 0; k < NPER; k += 2) {
      const u = k * PER + 3;
      const dead = sectorDead(seed, k, m);
      T.light(u, v0 + 5, 'sodium', C_GAR, { color: 0xffa040, intensity: 1.05, radius: 8.5, y: 2.6, broken: dead && hash3(k, m, 3) % 3 !== 0, flicker: !dead && hash3(k, m, 4) % 9 === 0 ? 0.3 : 0 });
    }
    // bay bands
    for (let k = 0; k < NPER; k++) {
      const u0 = k * PER;
      const blk = blockAt(m, k);
      if (blk && !OVERLAY.has(blk.kind)) continue;
      if (CROSS.has(k)) { crossLane(T, m, k, seed); continue; }
      if (shiftAt(m, k)) continue;
      bayPair(T, m, k, LEVELS[m], seed);
      // lamps over the bays, offset from the lane lamps
      const dead = sectorDead(seed, k, m);
      if (k % 2 === 1) for (const v of [bandA(m) + 2, bandB(m) + 3]) T.light(u0 + 3, v, 'sodium', C_GAR, { color: 0xffa040, intensity: 0.9, radius: 7, y: 2.6, broken: dead || hash3(k, v, 7) % 6 === 0 });
      if (dead && k % 4 === 1) T.light(u0 + 6, bandA(m) + 5, 'emergency', 0, { intensity: 0.35, radius: 3.5 });
    }
  }

  // ============================================================ set pieces
  stairCore(c, T);
  mallEntrance(c, T);
  hospitalEntrance(c, T, cars);
  loadingDock(c, T, cars);
  surfaceLot(c, T, cars);
  exitRoad(c, T);
  for (const blk of BLOCKS) if (blk.kind === 'ramp_up') rampUp(c, T, blk);
  downRamps(c, T);
  for (const blk of BLOCKS) if (blk.kind === 'core') elevatorCore(c, T, blk);
  camp(c, T);

  // ============================================================ shifting blocks: the numbers on the columns change
  for (const s of SHIFTS) shiftBlock(c, s);

  // ============================================================ parked cars (only in the unique window, never in two copies)
  parkCars(c, cars);
  z.meta.vehicleSpawns = cars;

  // ============================================================ the edges loop
  seams(c);

  // ============================================================ litter, puddles, loot
  for (let i = 0; i < 260; i++) {
    const u = rng.int(0, D - 1), v = rng.int(0, D - 1);
    const t = rng.weighted([['decal_stain_dark', 5], ['decal_puddle', 2], ['decal_crack', 3], ['decal_stain_water', 2], ['decal_trash', 1]] as [string, number][]);
    const s = rng.float(0.8, 1.8);
    T.decal(t, u + 0.5, v + 0.5, s, s * rng.float(0.7, 1.3), rng.float(0, 6), t === 'decal_stain_dark' ? 0x2a2418 : undefined, 0.85);
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.int(56, 151), y = rng.int(56, 151);
    if (isOpen(z, x, y) && !(z.flags[z.idx(x, y)] & TF.SHIFT)) f.floorLoot(rng.chance(0.7) ? 'floor_generic' : 'mall_trash', x, y);
  }

  // ============================================================ power, env, creatures
  for (const cc of [C_GAR, C_LOT, C_CORE]) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0x2a2218, ambientI: 0.5, fog: 0x18120c, fogNear: 10, fogFar: 30, void: 0x0a0806, temp: 13,
    grade: 'parking', reverb: 'tunnel', ambience: 'parking', music: '',
  };
  z.spawnTable = [['grinhound', 2], ['hollow', 1.5], ['sentinel', 1.5], ['occupant', 0.5]];
  z.creatureCap = 9;
  z.meta.terminalLore = ['terminal_generic'];
  z.meta.shiftRate = 0.8;
}

const sectorDead = (seed: number, k: number, m: number) => hash3(Math.floor(k / 3), m, (seed & 0xfff) + 17) % 5 === 0;

// ---------------------------------------------------------------- bays, columns, cross lanes
/** two bays and a column line for period k of module m */
function bayPair(T: Torus, m: number, k: number, label: string, seed: number, stampB?: ZoneBuilder) {
  const u0 = k * PER, a = bandA(m), bb = bandB(m);
  const put = (key: string, u: number, v: number, rot: Rot, st: Record<string, any>) => { if (stampB) { const x = mx(u), y = my(v); if (stampB.free(x, y)) stampB.obj(key, x, y, rot, st); } else T.obj(key, u, v, rot, st); };
  // columns: front of row A, back to back in the middle, front of row B
  for (const v of [a, a + 5, bb, bb + 5]) put('zg_park_pillar', u0 + 6, v, 0, { label });
  if (stampB) return;
  // painted bay lines
  for (const e of [0, 3, 6]) { T.decal('decal_parking_line', u0 + e, a + 3, 5.4, 0.13, Math.PI / 2, 0xe8e4d8, 0.9); T.decal('decal_parking_line', u0 + e, bb + 3, 5.4, 0.13, Math.PI / 2, 0xe8e4d8, 0.9); }
  // back line between the two rows, oil stains where engines dripped for years
  T.decal('decal_parking_line', u0 + 3, a + 6, 6, 0.13, 0, 0xe8e4d8, 0.7);
  for (const [bu, bv] of [[u0 + 1.5, a + 2.5], [u0 + 4.5, a + 2.5], [u0 + 1.5, bb + 3.5], [u0 + 4.5, bb + 3.5]]) {
    const h = hf(bu * 7, bv * 3, seed & 0xffff);
    if (h < 0.35) T.decal('decal_stain_dark', bu, bv, 1.6, 1.0 + h, h * 9, 0x2a2418, 0.75);
  }
  // now and then a pay station between the bays
  if (hash3(k, m, 61) % 7 === 0) T.obj('pay_station', u0 + 6, a + 2, 3, { lore: 'parking_ticket' });
}

function crossLane(T: Torus, m: number, k: number, seed: number) {
  const u0 = k * PER, a = bandA(m);
  // arrows north and south, a lamp in the middle, hatching where the bays stop
  T.decal('decal_arrow_floor', u0 + 2, a + 6, 1.6, 1.6, 0, 0xffffff, 0.8);
  T.decal('decal_arrow_floor', u0 + 5, a + 6, 1.6, 1.6, Math.PI, 0xffffff, 0.8);
  T.decal('decal_parking_line', u0 + 3.5, a + 6, 12, 0.14, Math.PI / 2, 0xe0b830, 0.8);
  T.light(u0 + 3, a + 6, 'sodium', C_GAR, { color: 0xffa040, intensity: 1.0, radius: 8, y: 2.6, broken: sectorDead(seed, k, m) });
  T.obj('zg_park_pillar', u0 - 1, a, 0, { label: LEVELS[m] }); T.obj('zg_park_pillar', u0 - 1, a + 11, 0, { label: LEVELS[m] });
}

// ---------------------------------------------------------------- set pieces
function stairCore(c: Ctx, T: Torus) {
  const { b, f } = c;
  const blk = BLOCKS.find((q) => q.kind === 'stair')!;
  const a = bandA(blk.m), u0 = blk.k0 * PER, u1 = blk.k1 * PER + 6;   // u 49..62, v 76..87
  const cu0 = u0 + 2, cu1 = u0 + 9, cv0 = a, cv1 = a + 10;           // core u 51..58, v 76..86
  T.floor(u0, a, u1, a + 11, 'concrete');
  T.walls(cu0, cv0, cu1, cv1, 'concrete');
  T.void(cu0, cv0, cu1, cv1);
  T.paper(cu0 - 1, cv0, cu1 + 1, cv1 + 1, 'wall_garage');
  T.room('Stair Core', 'stair_core', u0, a, u1, a + 11, { circuit: C_CORE });
  // the door marked P2 (to the Stairwell), flanked by elevators that go nowhere
  const du = cu0 + 4;
  T.door(du, cv1 + 1, 0, 'door_metal', { portal: 'r_stair_parking', sign: 'stairs' });
  b.portal({ id: 'r_stair_parking', x: mx(du), y: my(cv1 + 1), kind: 'door', to: 'stairwell', tx: 8, ty: 100, label: 'Go through the door marked P2' });
  arrive(b, 'p_stair_parking', mx(du), my(cv1 + 3), 's', 4);
  T.obj('elevator_door', du - 2, cv1 + 1, 0, {}); T.obj('elevator_door', du + 2, cv1 + 1, 0, {});
  T.obj('zg_fascia', du - 1, cv1 + 1, 0, { label: 'stairs', lit: true });
  T.obj('zg_level_sign', cu1 + 1, a + 5, 3, { label: 'P2' });
  T.obj('zg_level_sign', cu0 - 1, a + 5, 1, { label: '?' });
  T.light(du, cv1 + 2, 'fluoro', C_CORE, { color: 0xe8f0ff, flicker: 0.1 });
  T.light(du + 3, cv1 + 1, 'emergency', 0, { intensity: 0.3, radius: 3 });
  for (let u = u0; u <= u1; u += 2) if (u < cu0 - 1 || u > cu1 + 1) T.obj('bollard', u, a + 11, 0, {});
  T.decal('zg_dc_hatch', du + 0.5, cv1 + 1.5, 3, 1, 0, 0xffffff, 0.8);
  T.obj('trash_can_outdoor', cu0 - 1, cv1 + 1, 0, {});
  T.obj('bench_park', cu1 + 1, cv1 - 1, 3, {});
  f.floorItem('note', mx(du + 1), my(cv1 + 2), { lore: 'parking_ticket' });
}

function mallEntrance(c: Ctx, T: Torus) {
  const { b } = c;
  const blk = BLOCKS.find((q) => q.kind === 'mall')!;
  const a = bandA(blk.m), u0 = blk.k0 * PER, u1 = blk.k1 * PER + 6;   // u 84..104, v 32..43
  const bv1 = a + 7;                                                  // building v 32..39, plaza 40..43
  T.floor(u0, a, u1, a + 11, 'sidewalk');
  T.walls(u0 + 1, a, u1 - 1, bv1, 'brick');
  T.void(u0 + 1, a, u1 - 1, bv1);
  T.paper(u0, bv1 + 1, u1, bv1 + 1, 'wall_mall');
  T.room('Westgate Mall Entrance', 'mall_entrance', u0, a, u1, a + 11, { circuit: C_CORE });
  const du = Math.floor((u0 + u1) / 2);
  for (const u of [du - 1, du, du + 1]) T.door(u, bv1 + 1, 0, 'door_glass', { portal: 'r_mall_lot', sign: 'exit' });
  b.portal({ id: 'r_mall_lot', x: mx(du), y: my(bv1 + 1), kind: 'door', to: 'mall', tx: 9, ty: 77, label: 'Go into Westgate Mall' });
  arrive(b, 'p_mall_lot', mx(du), my(bv1 + 3), 's', 4);
  T.obj('zg_fascia', du - 1, bv1 + 1, 0, { label: 'mall', lit: true });
  T.obj('zg_fascia', u0 + 3, bv1 + 1, 0, { label: 'parking', lit: true });
  T.obj('zg_fascia', u1 - 5, bv1 + 1, 0, { label: 'exit', lit: false });
  T.obj('payphone', u0 + 7, bv1 + 1, 0, {}); T.obj('payphone', u1 - 7, bv1 + 1, 0, {});
  T.obj('zg_directory', du + 4, bv1 + 1, 0, {});
  T.obj('bench_park', du - 6, bv1 + 1, 0, {}); T.obj('trash_can_outdoor', du + 3, bv1 + 1, 0, {});
  T.obj('planter_box', u0 + 1, a + 10, 0, {}); T.obj('planter_box', u1 - 2, a + 10, 0, {});
  for (let u = u0 + 3; u <= u1 - 3; u += 2) T.obj('bollard', u, a + 11, 0, {});
  for (let u = u0 + 2; u <= u1 - 2; u += 6) T.light(u, bv1 + 2, 'fluoro', C_CORE, { color: 0xfff0dc });
  T.light(du, bv1 + 2, 'neon', C_CORE, { color: 0xe890c0, intensity: 0.6, radius: 6, y: 2.4 });
  // a zebra crossing over the lane to the bays opposite
  for (let i = 0; i < 5; i++) T.decal('decal_parking_line', du - 2 + i + 0.5, a + 16.5, 9.5, 0.4, Math.PI / 2, 0xf0f0e8, 0.8);
}

function hospitalEntrance(c: Ctx, T: Torus, cars: any[]) {
  const { b, f } = c;
  const blk = BLOCKS.find((q) => q.kind === 'hospital')!;
  const a = bandA(blk.m), u0 = blk.k0 * PER, u1 = blk.k1 * PER + 6;   // u 28..48, v 120..131
  const bv1 = a + 4;                                                  // building v 120..124, kerb 125..126, drop-off 127..131
  T.floor(u0, a, u1, a + 6, 'sidewalk');
  T.floor(u0, a + 7, u1, a + 11, 'asphalt');
  T.walls(u0 + 1, a, u1 - 1, bv1, 'brick');
  T.void(u0 + 1, a, u1 - 1, bv1);
  T.paper(u0, bv1 + 1, u1, bv1 + 1, 'wall_hospital');
  T.room('St. Aldric Emergency Entrance', 'hospital_entrance', u0, a, u1, a + 11, { circuit: C_CORE });
  const du = Math.floor((u0 + u1) / 2);
  for (const u of [du, du + 1]) T.door(u, bv1 + 1, 0, 'door_hospital', { portal: 'r_hospital_lot' });
  b.portal({ id: 'r_hospital_lot', x: mx(du), y: my(bv1 + 1), kind: 'door', to: 'hospital', tx: 72, ty: 110, label: 'Go into St. Aldric' });
  arrive(b, 'p_hospital_lot', mx(du), my(bv1 + 2), 's', 4);
  T.obj('zg_fascia', du, bv1 + 1, 0, { label: 'hospital', lit: true });
  T.obj('wheelchair', du - 3, bv1 + 1, 0, {}); T.obj('bench_park', du + 4, bv1 + 1, 0, {});
  T.obj('trash_can_outdoor', du - 6, bv1 + 1, 0, {});
  for (let u = u0 + 1; u <= u1 - 1; u += 3) if (Math.abs(u - du) > 2) T.obj('bollard', u, a + 6, 0, {});
  T.light(du, bv1 + 2, 'fluoro', C_CORE, { color: 0xe8fff0, flicker: 0.2 });
  T.light(du + 1, bv1 + 1, 'emergency', 0, { intensity: 0.5, radius: 5, flicker: 0.05 });
  for (let i = 0; i < 4; i++) T.decal('zg_dc_hatch', u0 + 3 + i * 5 + 0.5, a + 9.5, 2.6, 2.6, 0, 0xffffff, 0.6);
  T.decal('zg_dc_stop', du + 0.5, a + 11.3, 2.4, 0.9, 0, 0xffffff, 0.8);
  // an ambulance-sized van, left in the drop-off with the engine cold
  cars.push({ x: mx(u0 + 6), y: my(a + 9), rot: 0, type: 'van', chance: 1 });
  f.floorItem('note', mx(du + 2), my(bv1 + 2), { lore: 'note_generic' });
}

function loadingDock(c: Ctx, T: Torus, cars: any[]) {
  const { b } = c;
  const blk = BLOCKS.find((q) => q.kind === 'dock')!;
  const a = bandA(blk.m), u0 = blk.k0 * PER, u1 = blk.k1 * PER + 6;   // u 119..139, v 54..65
  const bv1 = a + 4;                                                  // building v 54..58, apron 59..65
  T.floor(u0, a, u1, a + 11, 'concrete');
  T.walls(u0 + 1, a, u1 - 1, bv1, 'brick');
  T.void(u0 + 1, a, u1 - 1, bv1);
  T.paper(u0, bv1 + 1, u1, bv1 + 1, 'wall_supermarket');
  T.room('Foodland Loading Dock', 'loading_dock', u0, a, u1, a + 11, { circuit: C_CORE });
  const du = Math.floor((u0 + u1) / 2);
  for (const u of [du - 6, du, du + 6]) {
    if (u === du) T.door(u, bv1 + 1, 0, 'door_metal', { portal: 'r_market_dock', sign: 'staff' });
    else T.door(u, bv1 + 1, 0, 'door_metal', { locked: true });
    T.decal('zg_dc_hatch', u + 0.5, bv1 + 2.5, 2.8, 2.8, 0, 0xffffff, 0.75);
    T.light(u, bv1 + 2, 'sodium', C_CORE, { color: 0xffa040, intensity: 0.9, radius: 6, y: 2.5, flicker: u === du + 6 ? 0.3 : 0 });
  }
  b.portal({ id: 'r_market_dock', x: mx(du), y: my(bv1 + 1), kind: 'door', to: 'market', tx: 96, ty: 7, label: 'Go in through the loading dock' });
  arrive(b, 'p_market_dock', mx(du), my(bv1 + 3), 's', 4);
  T.obj('zg_fascia', du - 1, bv1 + 1, 0, { label: 'deliveries', lit: true });
  T.obj('dumpster', u0 + 2, bv1 + 1, 0, {}); T.obj('dumpster', u1 - 3, bv1 + 1, 0, {});
  for (const [u, v] of [[du - 3, bv1 + 1], [du + 3, bv1 + 1], [du + 4, bv1 + 1], [du - 4, bv1 + 2]] as const) T.obj(hash3(u, v, 5) % 2 ? 'pallet_boxes' : 'pallet', u, v, 0, { loot: 'crate_supplies' });
  T.obj('crate_wood', u1 - 2, bv1 + 3, 0, {}); T.obj('trash_bags', u0 + 4, bv1 + 1, 0, {});
  // the delivery van is still backed up to the left-hand door
  cars.push({ x: mx(du - 6), y: my(bv1 + 4), rot: 1, type: 'van', chance: 1 });
}

function surfaceLot(c: Ctx, T: Torus, cars: any[]) {
  const { b, z } = c;
  const blk = BLOCKS.find((q) => q.kind === 'lot')!;
  const m = blk.m, a = bandA(m), u0 = blk.k0 * PER, u1 = blk.k1 * PER + 6;   // u 70..111, v 98..109
  const v0 = laneV0(m);                                                       // the lane through it is open-air too
  T.floor(u0, v0, u1, a + 11, 'asphalt');
  T.flag(u0, v0, u1, a + 11, TF.OUTDOOR);
  T.room('Surface Lot', 'surface_lot', u0, v0, u1, a + 11, { circuit: C_LOT, outdoor: true });
  // parapet walls where the slab ends (the exit road comes in through the west one)
  T.vwall(u0, a, a + 11, 'low_concrete'); T.vwall(u1 + 1, a, a + 11, 'low_concrete');
  for (let v = a + 2; v <= a + 9; v++) T.gap(u0, v, 1);
  // white-lined bays in two rows with lamp posts down the middle and a tree island
  for (let u = u0 + 1; u + 2 <= u1 - 1; u += 3) {
    T.decal('decal_parking_line', u, a + 2.8, 5.2, 0.13, Math.PI / 2, 0xf4f4ec, 0.9);
    T.decal('decal_parking_line', u, a + 9.2, 5.2, 0.13, Math.PI / 2, 0xf4f4ec, 0.9);
  }
  for (let u = u0 + 4; u <= u1 - 2; u += 9) T.obj('lamp_post', u, a + 5, 0, {});
  for (const u of [u0 + 9, u0 + 29]) { T.floor(u, a + 5, u + 3, a + 6, 'grass'); T.obj('tree_dead', u + 1, a + 5, 0, {}); T.obj('bush', u + 2, a + 6, 0, {}); T.obj('bush', u, a + 6, 0, {}); }
  T.obj('billboard', u0 + 18, v0 + 0, 0, {});
  T.obj('bus_stop', u1 - 6, v0, 0, {});
  T.obj('ticket_booth', u1 - 2, a + 4, 0, { lore: 'parking_ticket' });
  T.obj('trash_can_outdoor', u0 + 14, a + 6, 0, {});
  // a dim sky that is not there: cold light from nowhere
  for (let u = u0 + 6; u <= u1; u += 14) T.light(u, a + 2, 'sky', 0, { color: 0x5a6890, intensity: 0.3, radius: 10, y: 6 });
  for (let i = 0; i < 14; i++) { const u = u0 + 1 + (hash3(i, 5, 9) % (u1 - u0 - 1)), v = v0 + (hash3(i, 6, 9) % 22); T.decal('decal_puddle', u + 0.5, v + 0.5, 1.8, 1.4, i, 0xc0c8e0, 0.8); }
  // cars in the lot (a few, in both rows)
  for (const [u, row] of [[u0 + 2, 0], [u0 + 11, 1], [u0 + 20, 0], [u0 + 26, 1], [u0 + 35, 0]] as const) cars.push({ x: mx(u), y: my(row ? a + 9 : a + 2), rot: row ? 1 : 3, chance: 0.75 });
  void z;
}

function exitRoad(c: Ctx, T: Torus) {
  const { b } = c;
  const blk = BLOCKS.find((q) => q.kind === 'exit')!;
  const a = bandA(blk.m), u0 = blk.k0 * PER, u1 = blk.k1 * PER + 6;   // u 56..69, v 98..109
  // a two-lane road west out of the surface lot, past a booth, into the dark
  const rv0 = a + 2, rv1 = a + 9;                                     // road v 100..107
  T.floor(u0, a, u1, a + 11, 'parking');
  T.floor(u0, rv0, u1, rv1, 'asphalt');
  T.floor(u0 + 2, a, u1, rv0 - 1, 'sidewalk'); T.floor(u0 + 2, rv1 + 1, u1, a + 11, 'sidewalk');
  T.flag(u0, a, u1, a + 11, TF.OUTDOOR);
  T.hwall(u0, u1, rv0, 'low_concrete'); T.hwall(u0, u1, rv1 + 1, 'low_concrete');
  for (const v of [rv0, rv1 + 1]) { T.gap(u1, v, 0); T.gap(u1 - 1, v, 0); }
  T.vwall(u0, rv0, rv1, 'concrete');
  T.paper(u0, rv0, u0, rv1, 'wall_tunnel');
  T.room('Exit Road', 'exit_road', u0, a, u1, a + 11, { circuit: C_LOT, outdoor: true });
  // lane paint, the booth on its island, the barrier arms left up
  for (let u = u0 + 3; u <= u1; u += 3) T.decal('decal_parking_line', u + 0.5, rv0 + 4, 1.6, 0.14, 0, 0xe0b830, 0.9);
  T.decal('zg_dc_exit', u0 + 10.5, rv0 + 1.5, 3.2, 1.0, 0, 0xffffff, 0.85); // pointing back the way you came
  T.decal('zg_dc_stop', u0 + 5.5, rv1 - 0.5, 2.4, 0.9, 0, 0xffffff, 0.8);
  const bu = u0 + 8;
  T.floor(bu, rv0 + 3, bu + 1, rv0 + 4, 'sidewalk');
  T.obj('ticket_booth', bu, rv0 + 3, 0, { lore: 'parking_ticket' });
  T.obj('traffic_cone', bu + 3, rv0 + 3, 0, {}); T.obj('traffic_cone', bu + 3, rv0 + 4, 0, {});
  T.obj('zg_fascia', u0, rv0 + 4, 3, { label: 'alder', lit: true });
  T.obj('street_light', u0 + 3, rv0 - 1, 0, {}); T.obj('street_light', u0 + 3, rv1 + 1, 0, {});
  for (let u = u0 + 6; u <= u1; u += 4) { T.obj('bollard', u, rv0 - 1, 0, {}); T.obj('bollard', u, rv1 + 1, 0, {}); }
  // the road leaves through the wall at its west end: step past the booth and keep going
  const pu = u0 + 2;
  for (let v = rv0; v <= rv1; v++) b.portal({ id: 'r_suburbs_lot', x: mx(pu), y: my(v), kind: 'walk', to: 'suburbs', tx: 96, ty: 180, label: 'Follow the road out' });
  arrive(b, 'p_suburbs_lot', mx(pu + 6), my(rv0 + 1), 'e', 4);
  T.flag(u0, rv0, pu, rv1, TF.NOSPAWN);
}

function rampUp(c: Ctx, T: Torus, blk: Block) {
  // a ramp up to the level above, which is closed
  const u0 = blk.k0 * PER + 1, v = bandB(blk.m);
  T.walls(u0, v, u0 + 3, v + 5, 'concrete');
  T.gap(u0, v + 6, 0); T.gap(u0 + 1, v + 6, 0); T.gap(u0 + 2, v + 6, 0); T.gap(u0 + 3, v + 6, 0);
  T.obj('zg_ramp_up', u0, v, 0, {});
  T.obj('zg_fascia', u0 + 4, v + 2, 3, { label: 'p0', lit: false });
  T.obj('zg_level_sign', u0 + 4, v + 4, 3, { label: 'P1' });
  for (const u of [u0 - 1, u0 + 4]) T.obj('traffic_cone', u, v + 5, 0, {});
  T.obj('parking_barrier', u0 + 1, v + 6, 0, {});
  T.decal('zg_dc_hatch', u0 + 2, v + 7, 4, 1.2, 0, 0xffffff, 0.8);
  T.room('Ramp to P0', 'ramp', u0, v, u0 + 3, v + 5, { circuit: C_GAR });
  T.light(u0 + 2, v + 6, 'sodium', C_GAR, { color: 0xffa040, intensity: 0.8, radius: 6, y: 2.6 });
}

/** two ramps down: drive into one, come up out of the other */
function downRamps(c: Ctx, T: Torus) {
  const { b } = c;
  const A = BLOCKS.find((q) => q.kind === 'ramp_a')!, B = BLOCKS.find((q) => q.kind === 'ramp_b')!;
  const build = (blk: Block, id: string, other: string) => {
    const u0 = blk.k0 * PER + 1, u1 = u0 + 4, v0 = bandA(blk.m), v1 = v0 + 11;   // a 5-wide channel open to the lane below
    T.floor(blk.k0 * PER, v0, blk.k1 * PER + 6, v1, 'parking');
    for (const v of [v0, v0 + 5, v0 + 6, v0 + 11]) T.obj('zg_park_pillar', blk.k0 * PER + 6, v, 0, { label: LEVELS[blk.m] });
    T.walls(u0, v0, u1, v1, 'concrete');
    for (let u = u0; u <= u1; u++) T.gap(u, v1 + 1, 0);
    T.paper(u0, v0, u1, v1, 'wall_tunnel');
    T.room('Ramp Down', 'ramp', u0, v0, u1, v1, { circuit: C_GAR });
    // paint pointing in, light that stops halfway, then nothing
    for (let i = 0; i < 3; i++) T.decal('decal_arrow_floor', u0 + 2.5, v1 - 1.5 - i * 3, 1.8, 1.8, 0, 0xffffff, 0.8 - i * 0.2);
    T.decal('zg_dc_hatch', u0 + 2.5, v1 + 0.6, 5, 1, 0, 0xffffff, 0.7);
    T.light(u0 + 2, v1 - 1, 'sodium', C_GAR, { color: 0xffa040, intensity: 0.9, radius: 6, y: 2.6 });
    T.light(u0 + 3, v1 - 6, 'sodium', C_GAR, { color: 0xffa040, intensity: 0.4, radius: 4, y: 2.6, flicker: 0.3 });
    T.obj('zg_fascia', u0, v1 - 2, 3, { label: 'down', lit: true });
    T.obj('zg_level_sign', u0, v1 - 6, 3, { label: '?' });
    // the dark end: stepping (or driving) over this line takes you down a level that looks exactly like this one
    for (let u = u0; u <= u1; u++) b.portal({ id: id + '_' + u, x: mx(u), y: my(v0 + 2), kind: 'walk', to: 'parking', tx: 0, ty: 0, anchor: other, label: 'Go down the ramp' });
    T.flag(u0, v0, u1, v0 + 3, TF.NOSPAWN);
    return { u0, u1, v0, v1 };
  };
  const ra = build(A, 'ramp_a', 'ramp_b_out');
  const rb = build(B, 'ramp_b', 'ramp_a_out');
  // you come up out of the other ramp, nose first, already rolling
  arrive(b, 'ramp_a_out', mx(ra.u0 + 2), my(ra.v1 - 2), 's', 2);
  arrive(b, 'ramp_b_out', mx(rb.u0 + 2), my(rb.v1 - 2), 's', 2);
}

function elevatorCore(c: Ctx, T: Torus, blk: Block) {
  const a = bandA(blk.m), u0 = blk.k0 * PER;
  const cu0 = u0 + 3, cu1 = u0 + 9, cv0 = a + 1, cv1 = a + 9;
  T.floor(u0, a, blk.k1 * PER + 6, a + 11, 'concrete');
  T.walls(cu0, cv0, cu1, cv1, 'concrete');
  T.void(cu0, cv0, cu1, cv1);
  T.room('Elevator Core', 'elevator_core', u0, a, blk.k1 * PER + 6, a + 11, { circuit: C_CORE });
  T.obj('elevator_door', cu0 + 1, cv1 + 1, 0, {}); T.obj('elevator_door', cu0 + 5, cv1 + 1, 0, {});
  T.obj('zg_level_sign', cu1 + 1, a + 4, 3, { label: blk.m === 0 ? '13' : 'P4' });
  T.obj('zg_fascia', cu0 + 3, cv1 + 1, 0, { label: 'noexit', lit: false });
  T.light(cu0 + 3, cv1 + 2, 'fluoro', C_CORE, { color: 0xe8f0ff, flicker: 0.25 });
  T.obj('bench_park', cu0 - 2, cv1 + 1, 0, {});
  T.obj('trash_can_outdoor', cu1 + 1, cv1 + 1, 0, {});
  if (blk.m === 5) {
    // world stream 3: a steel door in the core's east face, stencilled BUSES, up to Interchange 0
    const { b } = c;
    const x = mx(cu1 + 1), y = my(a + 7);
    b.door(x, y, 1, 'door_metal', { portal: 'p_parking_depot', sign: 'exit' });
    b.portal({ id: 'p_parking_depot', x, y, kind: 'door', to: 'depot', tx: 100, ty: 4, label: 'Go through to the buses' });
    arrive(b, 'r_parking_depot', x + 2, y, 'e', 3);
    b.obj('zw_plate', x, y - 1, 1, { label: 'BAY 0' });
  }
}

function camp(c: Ctx, T: Torus) {
  const { f } = c;
  const blk = BLOCKS.find((q) => q.kind === 'camp')!;
  const a = bandA(blk.m), u0 = blk.k0 * PER;
  // somebody lived here for a while, between two columns, in the dark
  const v = a + 1;
  T.obj('tent', u0 + 1, v, 0, {}); T.obj('sleeping_bag', u0 + 4, v, 0, {});
  T.obj('campfire_unlit', u0 + 2, v + 3, 0, {}); T.obj('survivor_stash', u0 + 4, v + 3, 0, {});
  T.obj('shopping_cart', u0, v + 4, 1, {}); T.obj('cardboard_stack', u0 + 5, v + 1, 0, {}); T.obj('crate_wood', u0 + 5, v + 4, 0, {});
  T.obj('trash_bags', u0 + 8, v, 0, {}); T.obj('chair_folding', u0 + 3, v + 4, 2, {});
  T.room('Somebody\'s Camp', 'camp', u0, a, u0 + 13, a + 11, { circuit: C_GAR });
  T.light(u0 + 3, v + 3, 'bulb', 0, { intensity: 0.45, radius: 4, color: 0xffb070, flicker: 0.2 });
  f.floorItem('note', mx(u0 + 3), my(v + 2), { lore: 'parking_ticket' });
  f.floorItem('empty_can', mx(u0 + 2), my(v + 5)); f.floorItem('water_bottle', mx(u0 + 6), my(v + 3));
  for (let i = 0; i < 3; i++) T.decal('decal_trash', u0 + 1 + i * 2.5, v + 5.5, 1.2, 1.2, i);
}

// ---------------------------------------------------------------- shifting blocks
function shiftBlock(c: Ctx, s: { id: string; m: number; k0: number; k1: number }) {
  const u0 = s.k0 * PER, u1 = s.k1 * PER + 6, a = bandA(s.m), v1 = a + 11;
  const x0 = mx(u0), y0 = my(a), x1 = mx(u1), y1 = my(v1);
  // paint and stains are laid once; only columns, lights and props move
  for (let k = s.k0; k <= s.k1; k++) bayPair(new Torus(c.b), s.m, k, LEVELS[s.m], c.seed, undefined);
  registerShift(c.z, s.id, x0, y0, x1, y1, 4, (sb, srng, v) => {
    const label = [LEVELS[s.m], 'P13', 'P∞', '-1'][v];
    const T = new Torus(sb);
    for (let k = s.k0; k <= s.k1; k++) {
      bayPair(T, s.m, k, label, c.seed, sb);
      if (v === 2) for (const e of [2, 4]) for (const vv of [a, a + 5, a + 6, a + 11]) { const x = mx(k * PER + e), y = my(vv); if (sb.free(x, y)) sb.obj('zg_park_pillar', x, y, 0, { label }); }
    }
    const lit = v !== 1;
    for (let k = s.k0; k <= s.k1; k++) if (k % 2 === 1 || v === 3) for (const vv of [a + 2, a + 9]) sb.light(mx(k * PER + 3) + 0.5, my(vv) + 0.5, 'sodium', { circuit: C_GAR, color: 0xffa040, intensity: 0.9, radius: 7, y: 2.6, broken: !lit });
    if (v === 1) sb.light(mx(u0 + 10) + 0.5, my(a + 6) + 0.5, 'emergency', { circuit: 0, intensity: 0.4, radius: 4, flicker: 0.1 });
    if (v === 3) {
      // a ramp has appeared where three bays used to be
      const x = mx(u0 + 8), y = my(a + 6);
      if (sb.free(x, y, 4, 6)) sb.obj('zg_ramp_up', x, y, 0, {});
      sb.obj('traffic_cone', x - 1, y + 5, 0, {}); sb.obj('traffic_cone', x + 4, y + 5, 0, {});
    }
  });
  void x1; void y1;
}

// ---------------------------------------------------------------- cars
function parkCars(c: Ctx, cars: any[]) {
  const { z, seed } = c;
  for (let m = 1; m <= 5; m++) for (let k = 4; k <= 18; k++) {
    if (CROSS.has(k) || blockAt(m, k) || shiftAt(m, k)) continue;
    for (const row of [0, 1]) {
      const h = hash3(k * 7 + row, m, (seed & 0xffff) + 91);
      if (h % 100 > 58) continue;
      const both = h % 100 < 12;
      for (const bay of both ? [0, 1] : [(h >> 8) & 1]) {
        const u = k * PER + 1 + bay * 3;
        const v = row ? bandB(m) + 2 : bandA(m) + 2;
        const x = mx(u), y = my(v);
        if (x < 56 || x > 151 || y < 56 || y > 151) continue;
        if (!isOpen(z, x, y) || !isOpen(z, x, y - 1) || !isOpen(z, x, y + 1)) continue;
        const noseOut = ((h >> 9) + bay) & 1;
        const rot = row ? (noseOut ? 1 : 3) : (noseOut ? 3 : 1);
        cars.push({ x, y, rot, chance: 0.85 });
      }
    }
  }
}

// ---------------------------------------------------------------- the seams
function seams(c: Ctx) {
  const { z, b } = c;
  const walk = (x: number, y: number) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0 && z.solid[z.idx(x, y)] !== 1 && z.solid[z.idx(x, y)] !== 3;
  const loops: { x: number; y: number; dx: number; dy: number }[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const onX = x === SEAM_LO || x === SEAM_HI, onY = y === SEAM_LO || y === SEAM_HI;
    if (!onX && !onY) continue;
    const dx = onX ? (x === SEAM_LO ? D : -D) : 0, dy = onY ? (y === SEAM_LO ? D : -D) : 0;
    if (!walk(x, y) || !walk(x + dx, y + dy)) continue;
    loops.push({ x, y, dx, dy });
  }
  // loop portals: people on foot slip through without noticing, and cars carry their occupants
  // across the same way (the seams sit on lane rows ten tiles wide; the landing is a clear lane)
  for (const p of loops) b.portal({ id: `loop_${p.x}_${p.y}`, x: p.x, y: p.y, kind: 'loop', to: 'parking', tx: p.x + p.dx, ty: p.y + p.dy, loopDx: p.dx, loopDy: p.dy, hidden: true });
  // nothing spawns in the margins (only reachable by eye)
  b.flag(0, 0, W - 1, SEAM_LO, TF.NOSPAWN); b.flag(0, SEAM_HI, W - 1, H - 1, TF.NOSPAWN);
  b.flag(0, 0, SEAM_LO, H - 1, TF.NOSPAWN); b.flag(SEAM_HI, 0, W - 1, H - 1, TF.NOSPAWN);
}

defZone({
  key: 'parking', name: 'Parking Level P∞', W, H, depth: 2,
  blurb: 'Sodium light, oil stains, the tick of a cooling engine that is not yours. The column says P2. The next one says P13.',
  gen: (z, s) => { generateParking(z, s); },
});
void ANG; void ({} as Side);
