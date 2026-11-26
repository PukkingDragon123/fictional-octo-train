// Level 0's sub-stages: where the yellow rooms go when you keep walking. Cut together
// the way the old found footage cuts: a doorway in the yellow wall, and the next room.
//   lobby_hall   The Long Hall: one carpeted corridor 175 m long under buzzing tubes,
//                doors down both sides that open onto wall
//   lobby_stair  The Tall Stairwell: carpeted flights climbing a yellow shaft twelve
//                metres, the open well beside you all the way up
//   lobby_void   The Void: a floor of yellow rooms broken off over nothing; a chasm
//                (fall in: src/social/floors.ts), the floor below it in plain sight,
//                platforms hanging above, and the chute: a hole in the carpet you slide
//                down to the lower floor (src/game/slide.ts), and a ramp back up
// The lobby gets its doorway into the Long Hall from a late post-generation hook (here).
import { defZone, onZoneGeneratedLate } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, type Side, arrive, put, mount, decal, hh, isOpen } from './weird_kit';
import type { HoleRec } from './void_kit';
import type { SlideDef } from '../../game/slide';
import '../../game/slide';

const Y = 'carpet_yellow';
const yellowEnv = (z: Zone, o: Partial<Zone['env']> = {}) => {
  z.env = { ...z.env, ambient: 0xd8cc90, ambientI: 0.62, fog: 0x2a2410, fogNear: 16, fogFar: 40, void: 0x0a0904, temp: 21, grade: 'lobby', reverb: 'hall', ambience: 'hum', music: '', ...o };
};
/** a doorway in a wall: the frame on the wall of tile (x, y) facing `side`, a portal on the tile */
function doorway(c: Ctx, x: number, y: number, side: Side, id: string, to: string, anchor: string | undefined, label: string, kind: 'walk' | 'door' = 'walk') {
  mount(c.b, 'lv_doorway', x, y, side, { portal: id });
  c.b.portal({ id, x, y, kind, to, tx: 10, ty: 10, label, ...(anchor ? { anchor } : {}) });
}
/** the tubes: a fluorescent at (x, y) over floor height h */
const tube = (b: ZoneBuilder, x: number, y: number, h: number, flick = 0) => b.light(x + 0.5, y + 0.5, 'fluoro', { circuit: 1, y: h + 2.6, intensity: 0.7, radius: 5.5, color: 0xf6ecc0, flicker: flick });

// ============================================================ The Long Hall
const HW = 14, HH = 184, HX0 = 5, HX1 = 8, HY0 = 3, HY1 = 180;
function generateHall(z: Zone, seed: number) {
  const rng = new Rng(seed), b = new ZoneBuilder(z, rng), f = new Furnisher(b, rng), c: Ctx = { z, b, f, rng, seed };
  z.name = 'Level 0 — The Long Hall';
  b.fillFloor(HX0, HY0, HX1, HY1, Y);
  b.roomWalls(HX0, HY0, HX1, HY1, 'drywall');
  b.addRoom('The Long Hall', 'hall', HX0, HY0, HX1, HY1, { circuit: 1, temp: 21 });
  // the way back to the lobby (south) and on (north)
  doorway(c, 6, HY1, 's', 'r_lobby_hall', 'lobby', undefined, 'Back to the yellow rooms');
  arrive(b, 'p_lobby_hall', 6, HY1 - 2, 'n', 2);
  doorway(c, 7, HY0, 'n', 'p_hall_stair', 'lobby_stair', undefined, 'Keep going');
  arrive(b, 'r_hall_stair', 7, HY0 + 2, 's', 2);
  // doors down both sides, every one of them opening onto wall
  for (let y = HY0 + 8; y <= HY1 - 8; y += 13) {
    const west = ((y / 13) | 0) % 2 === 0;
    b.door(west ? HX0 : HX1 + 1, y, 1, 'door_office', { locked: true });
    mount(b, 'painting', west ? HX1 : HX0, y + 3, west ? 'e' : 'w', { v: y % 6 });
  }
  for (let y = HY0 + 1; y <= HY1 - 1; y += 3) tube(b, 6 + (y & 1), y, 0, hh(6, y, 7601) < 0.12 ? 0.35 : 0);
  // things left along it, fewer the further you go
  for (let y = HY1 - 6; y > HY0 + 6; y -= rng.int(9, 17)) {
    const x = rng.pick([HX0, HX1]);
    if (!isOpen(z, x, y)) continue;
    put(c, rng.pick(['chair_office', 'water_cooler', 'trash_can', 'cardboard_box']), x, y, 0, {});
  }
  for (let i = 0; i < 40; i++) decal(z, rng.pick(['decal_stain_water', 'decal_stain_water', 'decal_footprints']), rng.float(HX0 + 0.5, HX1 + 0.5), rng.float(HY0 + 2, HY1 - 2), rng.float(0.8, 1.6), rng.float(0.8, 1.6), rng.float(0, 6), undefined, 0.5);
  for (let i = 0; i < 4; i++) f.floorLoot('floor_generic', rng.int(HX0, HX1), rng.int(HY0 + 10, HY1 - 10));
  z.power.set(1, true);
  yellowEnv(z);
  z.spawnTable = [['paper_grazer', 1], ['hum_possum', 0.3]];
  z.creatureCap = 3;
}
defZone({ key: 'lobby_hall', name: 'Level 0 — The Long Hall', W: HW, H: HH, depth: 0, gen: generateHall, blurb: 'One corridor. The tubes go on as far as you can see, and a bit further. Every door opens onto wall.' });

// ============================================================ The Tall Stairwell
const SW = 20, SH = 112, NMOD = 6, MOD = 16, RISE = 2.0;
const SX0 = 4, SX1 = 14, FX1 = 8;            // shaft, flight width (x 4..8), the well (x 9..14)
const landY = (m: number) => 106 - m * MOD;   // the landing's south row (rows landY-3 .. landY)
function generateStair(z: Zone, seed: number) {
  const rng = new Rng(seed), b = new ZoneBuilder(z, rng), f = new Furnisher(b, rng), c: Ctx = { z, b, f, rng, seed };
  z.name = 'Level 0 — The Tall Stairwell';
  for (let m = 0; m <= NMOD; m++) {
    const y1 = landY(m), y0 = y1 - 3, h = m * RISE;
    b.fillFloor(SX0, y0, SX1, y1, Y, h);
    b.addRoom('Landing ' + (m + 1), 'landing', SX0, y0, SX1, y1, { circuit: 1, temp: 20 });
    mount(b, 'zg_level_sign', SX0, y0 + 1, 'w', { label: String(m + 1) });
    tube(b, 9, y0 + 1, h, m === 3 ? 0.3 : 0);
    if (m === NMOD) break;
    // the flight up to the next landing: carpeted, rising, the well open beside it
    const fy1 = y0 - 1, fy0 = landY(m + 1) + 1;
    for (let y = fy1; y >= fy0; y--) b.fillFloor(SX0, y, FX1, y, Y, h + RISE * (fy1 - y + 1) / (fy1 - fy0 + 2));
    b.addRoom('Flight ' + (m + 1), 'stairs', SX0, fy0, FX1, fy1, { circuit: 1, temp: 20 });
    b.vwall(FX1 + 1, fy0, fy1, 'railing');
    tube(b, 6, Math.floor((fy0 + fy1) / 2), h + RISE / 2);
    if (rng.chance(0.5)) f.floorLoot('floor_generic', rng.int(SX0 + 1, SX1 - 1), y0 + 1);
  }
  // the shaft walls, the well's edges at the landings
  b.vwall(SX0, landY(NMOD) - 3, landY(0), 'drywall');
  b.vwall(SX1 + 1, landY(NMOD) - 3, landY(0), 'drywall');
  b.hwall(SX0, SX1, landY(NMOD) - 3, 'drywall');
  b.hwall(SX0, SX1, landY(0) + 1, 'drywall');
  for (let m = 0; m <= NMOD; m++) { b.hwall(FX1 + 1, SX1, landY(m) - 3, 'railing'); if (m > 0) b.hwall(FX1 + 1, SX1, landY(m) + 1, 'railing'); }
  // in at the bottom from the Long Hall, out at the top into the void
  doorway(c, 7, landY(0), 's', 'r_hall_stair', 'lobby_hall', undefined, 'Back down the hall');
  arrive(b, 'p_hall_stair', 7, landY(0) - 2, 'n', 2);
  doorway(c, 7, landY(NMOD) - 3, 'n', 'p_stair_void', 'lobby_void', undefined, 'Through the top door');
  arrive(b, 'r_stair_void', 7, landY(NMOD) - 1, 's', 2);
  z.power.set(1, true);
  yellowEnv(z, { reverb: 'stair' });
  z.spawnTable = [['hum_possum', 0.6]];
  z.creatureCap = 2;
}
defZone({ key: 'lobby_stair', name: 'Level 0 — The Tall Stairwell', W: SW, H: SH, depth: 0, gen: generateStair, blurb: 'Carpeted stairs up a yellow shaft. The landings are numbered. The well beside you goes down further than you came up.' });

// ============================================================ The Void
const VW = 70, VH = 64;
const U = { x0: 3, y0: 3, x1: 28, y1: 60 }, CH = { x0: 29, x1: 36 }, L = { x0: 37, y0: 3, x1: 66, y1: 60 };
const LOW = -4.8;
function generateVoid(z: Zone, seed: number) {
  const rng = new Rng(seed), b = new ZoneBuilder(z, rng), f = new Furnisher(b, rng), c: Ctx = { z, b, f, rng, seed };
  z.name = 'Level 0 — The Void';
  // the upper floor, broken off along its east edge
  b.fillFloor(U.x0, U.y0, U.x1, U.y1, Y, 0);
  b.hwall(U.x0, U.x1, U.y0, 'drywall'); b.hwall(U.x0, U.x1, U.y1 + 1, 'drywall'); b.vwall(U.x0, U.y0, U.y1, 'drywall');
  b.addRoom('The Void', 'void_upper', U.x0, U.y0, U.x1, U.y1, { circuit: 1, temp: 19 });
  // the floor below, in plain sight across the drop
  b.fillFloor(L.x0, L.y0, L.x1, L.y1, Y, LOW);
  b.hwall(L.x0, L.x1, L.y0, 'drywall'); b.hwall(L.x0, L.x1, L.y1 + 1, 'drywall'); b.vwall(L.x1 + 1, L.y0, L.y1, 'drywall');
  b.addRoom('The Floor Below', 'void_lower', L.x0, L.y0, L.x1, L.y1, { circuit: 1, temp: 18 });
  // railings along the drop, except where it is simply open
  for (let y = U.y0; y <= U.y1; y++) if ((y < 20 || y > 40) && y !== 50 && y !== 51 && y !== 57 && y !== 58) b.vwall(CH.x0, y, y, 'railing');
  // platforms hanging above both floors, railed round, out of reach: floors above you
  const hang = (x0: number, y0: number, x1: number, y1: number, h: number) => {
    b.fillFloor(x0, y0, x1, y1, Y, h);
    b.hwall(x0, x1, y0, 'railing'); b.hwall(x0, x1, y1 + 1, 'railing'); b.vwall(x0, y0, y1, 'railing'); b.vwall(x1 + 1, y0, y1, 'railing');
    b.light(x0 + (x1 - x0) / 2 + 0.5, y0 + (y1 - y0) / 2 + 0.5, 'fluoro', { circuit: 1, y: h + 2.6, intensity: 0.7, radius: 6, color: 0xf6ecc0 });
    put(c, 'chair_office', x0 + 1, y0 + 1, 0, {});
  };
  hang(6, 6, 12, 12, 2.7);
  hang(52, 8, 62, 16, 1.2);
  hang(44, 44, 50, 52, 0.4);
  // pillars
  for (let y = U.y0 + 4; y <= U.y1 - 4; y += 8) for (let x = U.x0 + 6; x <= U.x1 - 3; x += 9) if (!(x <= 12 && y <= 12)) put(c, 'column_square', x, y, 0, {});
  for (let y = L.y0 + 4; y <= L.y1 - 4; y += 8) for (let x = L.x0 + 5; x <= L.x1 - 3; x += 9) if (isOpen(z, x, y)) put(c, 'column_square', x, y, 0, {});
  // the chasm: fall in and you come down on the floor below (src/social/floors.ts)
  const drop: HoleRec = { id: 'void_drop', to: 'lobby_void', anchor: 'void_low', label: 'Drop', cx: (CH.x0 + CH.x1 + 1) / 2, cy: 31.5, r: 4, x0: CH.x0, y0: U.y0, x1: CH.x1, y1: U.y1 };
  (z.meta.holes ||= []).push(drop);
  b.portal({ id: 'void_drop', x: CH.x0, y: 30, kind: 'hole', to: 'lobby_void', tx: 45, ty: 30, anchor: 'void_low', label: 'Drop' });
  // the chute: a hole in the carpet, a carpet ramp walled in, down across the drop to the floor below
  const cy0 = 50, cy1 = 51, cx0 = 21, cx1 = L.x0 + 6;
  for (let x = cx0; x < L.x0; x++) b.fillFloor(x, cy0, x, cy1, 'lv_chute', LOW * (x - cx0) / (L.x0 - 1 - cx0));
  for (let x = cx0; x < L.x0; x++) { b.hwall(x, x, cy0, 'drywall'); b.hwall(x, x, cy1 + 1, 'drywall'); }
  b.addRoom('The Chute', 'chute', cx0, cy0, L.x0 - 1, cy1, { circuit: 1, temp: 19 });
  decal(z, 'lv_mouth', cx0 + 0.5, cy0 + 1, 2.2, 2.2, 0, undefined, 1);
  const slide: SlideDef = { id: 'chute', start: [[cx0, cy0], [cx0, cy1]], path: [[cx0 + 0.5, cy0 + 1, 0], [L.x0 - 0.5, cy0 + 1, LOW + 0.1], [L.x0 + 7.5, cy0 + 1, LOW]], dur: 2.6 };
  z.meta.slides = [slide];
  b.flag(cx0 - 2, cy0 - 2, cx0 + 1, cy1 + 2, TF.NOSPAWN);
  // the way back up: a long ramp across the drop at the south end, railed both sides
  const ry0 = 57, ry1 = 58;
  for (let x = CH.x0 - 1; x <= L.x0 + 1; x++) {
    const k = (x - (CH.x0 - 1)) / (L.x0 + 1 - (CH.x0 - 1));
    b.fillFloor(x, ry0, x, ry1, Y, LOW * k);
  }
  for (let x = CH.x0; x <= CH.x1; x++) { b.hwall(x, x, ry0, 'railing'); b.hwall(x, x, ry1 + 1, 'railing'); }
  // in from the stairwell (west wall), out at the far end of the floor below (east wall)
  doorway(c, U.x0, 30, 'w', 'r_stair_void', 'lobby_stair', undefined, 'Back to the stairwell');
  arrive(b, 'p_stair_void', U.x0 + 2, 30, 'e', 2);
  arrive(b, 'void_low', L.x0 + 9, 30, 'e', 2);
  doorway(c, L.x1, 30, 'e', 'r_void_lobby', 'lobby', 'r_lobby_hall', 'Back to the yellow rooms');
  // the tubes on both floors (the floor below lit at its own height)
  for (let y = U.y0 + 2; y <= U.y1; y += 5) for (let x = U.x0 + 2; x <= U.x1; x += 6) tube(b, x, y, 0, hh(x, y, 7611) < 0.1 ? 0.3 : 0);
  for (let y = L.y0 + 2; y <= L.y1; y += 5) for (let x = L.x0 + 2; x <= L.x1; x += 6) tube(b, x, y, LOW, hh(x, y, 7612) < 0.1 ? 0.3 : 0);
  for (let i = 0; i < 30; i++) { const lo = i % 2 === 1; const r = lo ? L : U; decal(z, 'decal_stain_water', rng.float(r.x0 + 1, r.x1), rng.float(r.y0 + 1, r.y1), rng.float(1, 2), rng.float(1, 2), rng.float(0, 6), undefined, 0.5); }
  for (let i = 0; i < 5; i++) { const r = i % 2 ? L : U; f.floorLoot('floor_generic', rng.int(r.x0 + 1, r.x1 - 1), rng.int(r.y0 + 1, r.y1 - 1)); }
  z.power.set(1, true);
  yellowEnv(z, { fog: 0x18140a, fogNear: 20, fogFar: 56, reverb: 'dream' });
  z.spawnTable = [['paper_grazer', 0.8], ['stilt_gull', 0.3]];
  z.creatureCap = 4;
}
defZone({ key: 'lobby_void', name: 'Level 0 — The Void', W: VW, H: VH, depth: 1, gen: generateVoid, blurb: 'The yellow rooms stop at an edge. There is another floor of them down there, lit, empty, waiting. And a hole in the carpet that goes down to it.' });

// ============================================================ the lobby's doorway into the Long Hall
// A late post-generation hook (it takes the last uids, so the lobby's own objects keep theirs):
// the first stretch of wall a short walk from the lobby's arrival gets a doorway onto the hall.
onZoneGeneratedLate((z: Zone) => {
  if (z.key !== 'lobby') return;
  const a0 = Object.values((z.meta.anchors || {}) as Record<string, number[]>)[0];
  if (!a0) return;
  const rng = new Rng(4242), b = new ZoneBuilder(z, rng), c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed: 4242 };
  const portalAt = (x: number, y: number) => z.portals.some((p) => Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 3);
  for (let r = 12; r <= 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = a0[0] + dx, y = a0[1] + dy;
    if (!z.inb(x, y + 3) || !z.wallN[z.idx(x, y)] || z.edge(x, y, 0) || portalAt(x, y)) continue;
    if (![[0, 0], [0, 1], [0, 2], [-1, 1], [1, 1]].every(([ox, oy]) => isOpen(z, x + ox, y + oy) && z.heightAt(x + ox, y + oy) === 0)) continue;
    doorway(c, x, y, 'n', 'p_lobby_hall', 'lobby_hall', undefined, 'Go through the doorway', 'door');
    arrive(b, 'r_lobby_hall', x, y + 2, 's', 2);
    return;
  }
});
