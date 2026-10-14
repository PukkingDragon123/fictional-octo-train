// The Stairwell — a switchback stair unrolled down the map. Every storey is the
// same module: a landing with a numbered fire door, a flight down on the west,
// a half-landing, a flight down on the east, then the next landing. Landings
// read 4, 3, 2, 1, 0, P1, P2, P3 ... and the half-landing below P3 is a loop
// seam back into the storey below 3, so the stairs never reach the bottom.
// Landing 13 hides off the dark half-landing between 1 and 0.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { anchor, decalAt, lamp, noSpawn, room, wallObj } from './meridian_kit';

const SX0 = 16, SX1 = 31;          // shell interior
const FA0 = 16, FA1 = 20;          // flight A (west)
const FB0 = 27, FB1 = 31;          // flight B (east)
const P = 20;                      // storey module height
const Y0 = 6;                      // first module row
const LABELS = ['4', '3', '2', '1', '0', 'P1', 'P2', 'P3', '2'];
/** module whose decoration a module copies (seam twins must match exactly) */
const TEMPLATE = [0, 1, 2, 3, 4, 5, 6, 1, 2];
const LOOP_MOD = 7, LOOP_TO = 1, LOOP_ROW = 13;
const DOOR_X = 21;

const y0Of = (m: number) => Y0 + m * P;

function generateStairwell(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  z.name = 'The Stairwell';

  // ------------------------------------------------------------ the modules
  for (let m = 0; m < LABELS.length; m++) buildModule(z, b, m, seed);

  // the top: the flight up toward the roof is chained shut
  {
    const y = y0Of(0);
    b.fillFloor(FB0, y - 4, FB1, y - 1, 'concrete');
    for (let yy = y - 4; yy < y; yy++) for (let x = FB0; x <= FB1; x++) b.obj('zg_stair_flight', x, yy, 0, {});
    b.vwall(FB0, y - 4, y - 1, 'cinder'); b.vwall(FB1 + 1, y - 4, y - 1, 'cinder');
    b.hwall(FB0, FB1, y - 4, 'cinder');
    b.door(29, y - 4, 0, 'door_metal', { locked: true, sign: 'danger' });
    b.addRoom('Roof Stairs', 'stairs', FB0, y - 4, FB1, y - 1, { circuit: 1 });
    b.obj('hazard_barrier', 28, y - 2, 0, {});
    b.obj('hazard_barrier', 30, y - 2, 0, {});
    b.obj('chair_stack', 27, y - 3, 0, {});
    lamp(b, 29, y - 3, 1, { kind: 'light_bulb', flicker: 0.25 });
  }
  // the bottom of the phantom storey is simply closed
  {
    const y = y0Of(LABELS.length);
    b.hwall(SX0, SX1, y, 'cinder');
  }

  // ------------------------------------------------------------ landing 13
  // off the dark half-landing between 1 and 0: a gap in the block wall, a
  // short flight down and a landing that is not on the plans.
  {
    const hy = y0Of(3) + 12;                     // half-landing rows hy..hy+2
    const lx0 = 4, lx1 = 15, ly0 = y0Of(4), ly1 = y0Of(4) + 6;
    // passage west out of the half-landing
    b.fillFloor(10, hy, 15, hy + 2, 'concrete');
    b.gap(SX0, hy + 1, 1);
    b.hwall(10, 15, hy, 'cinder'); b.vwall(10, hy, hy + 2, 'cinder');
    b.hwall(10, 10, hy + 3, 'cinder'); b.hwall(15, 15, hy + 3, 'cinder');
    b.addRoom('Half-landing', 'landing', 10, hy, 15, hy + 2, { circuit: 0 });
    // flight down x 11..14
    b.fillFloor(11, hy + 3, 14, ly0 - 1, 'concrete');
    for (let yy = hy + 3; yy < ly0; yy++) for (let x = 11; x <= 14; x++) b.obj('zg_stair_flight', x, yy, 0, {});
    b.vwall(11, hy + 3, ly0 - 1, 'cinder'); b.vwall(15, hy + 3, ly0 - 1, 'cinder');
    b.addRoom('Stairs', 'stairs', 11, hy + 3, 14, ly0 - 1, { circuit: 0 });
    // the landing
    room(b, 'Landing 13', 'landing_13', lx0, ly0, lx1, ly1, { floor: 'concrete', wall: 'cinder', circuit: 0, temp: 11 });
    for (let x = 11; x <= 14; x++) b.gap(x, ly0, 0);
    b.door(6, ly0, 0, 'door_metal', { portal: 'p_stair_13', sign: 'danger' });
    b.portal({ id: 'p_stair_13', x: 6, y: ly0, kind: 'door', to: 'corrupt', tx: 64, ty: 64, label: 'Open the door marked 13', locked: 'stage:2' });
    anchor(z, 'r_stair_13', 6, ly0 + 1, 's');
    noSpawn(b, 6, ly0 + 2, 3);
    wallObj(b, 'zg_level_sign', 8, ly0, 'n', { label: '13' });
    wallObj(b, 'exit_sign', 6, ly0, 'n', {});
    wallObj(b, 'zg_wall_scrawl', lx0, ly0 + 3, 'w', { v: 0, lore: 'stair_graffiti' });
    wallObj(b, 'zg_wall_scrawl', lx0, ly0 + 5, 'w', { v: 2 });
    b.obj('light_bulb', 9, ly0 + 3, 0, { circuit: 0, flicker: 0.5 });
    b.light(5.5, ly0 + 1.5, 'emergency', { intensity: 0.5, radius: 5, flicker: 0.2 });
    f.floorItem('note', 7, ly0 + 4, { lore: 'stair_graffiti' });
    for (let i = 0; i < 6; i++) f.decal(rng.pick(['decal_glitch', 'decal_stain_dark', 'decal_crack']), rng.int(lx0, lx1), rng.int(ly0, ly1), rng.float(0.8, 1.5), rng.float(0.8, 1.5));
    b.flag(lx0, ly0, lx1, ly1, TF.CORRUPT);
    b.obj('chair_folding', 12, ly0 + 4, 3, {});
    b.obj('skeleton', 13, ly1, 2, {});
  }

  // ------------------------------------------------------------ the loop seam
  // stepping onto the middle row of the half-landing below P3 moves you, without
  // a sound you can be sure of, to the same row below landing 3.
  {
    const ys = y0Of(LOOP_MOD) + LOOP_ROW;
    const dy = y0Of(LOOP_TO) - y0Of(LOOP_MOD);
    for (let x = SX0; x <= SX1; x++) b.portal({ id: 'loop_p3_' + x, x, y: ys, kind: 'loop', to: 'stairwell', tx: x, ty: ys + dy, loopDy: dy, hidden: true });
  }

  // nothing should spawn where only the seam leads (the phantom storey below P3)
  b.flag(0, y0Of(LOOP_MOD) + LOOP_ROW + 1, 47, z.H - 1, TF.NOSPAWN);

  // ------------------------------------------------------------ portals to other zones
  const doorPortal = (m: number, id: string, to: string, anchorId: string, label: string, sign: string) => {
    const y = y0Of(m);
    b.door(DOOR_X, y, 0, 'door_metal', { portal: id, sign });
    b.portal({ id, x: DOOR_X, y, kind: 'door', to, tx: 20, ty: 20, label });
    anchor(z, anchorId, DOOR_X, y + 1, 's');
    noSpawn(b, DOOR_X, y + 2, 3);
  };
  // the first anchor is the lobby arrival (reachability is measured from it)
  doorPortal(4, 'r_stair_lobby', 'lobby', 'p_stair', 'Go through the door marked 0', 'exit');
  doorPortal(0, 'r_office_stair', 'office', 'p_office_stair', 'Go through the door marked 4', 'office');
  doorPortal(6, 'p_stair_parking', 'parking', 'r_stair_parking', 'Go through the door marked P2', 'staff');

  // ------------------------------------------------------------ env
  for (let c = 1; c <= LABELS.length + 2; c++) z.power.set(c, true);
  z.env = {
    ...z.env,
    ambient: 0x2a2e33, ambientI: 0.55, fog: 0x0d0f11, fogNear: 9, fogFar: 25, void: 0x020203, temp: 15,
    grade: 'stairwell', reverb: 'stair', ambience: 'stairwell', music: '',
  };
  z.spawnTable = [['echo', 2], ['hollow', 1.5], ['employee', 1], ['occupant', 0.3]];
  z.creatureCap = 5;
  z.meta.terminalLore = ['terminal'];
  z.meta.landings = LABELS.map((l, m) => ({ label: l, y: y0Of(m) }));
}

/** one storey: landing, flight A, half-landing, flight B (+ side room) */
function buildModule(z: Zone, b: ZoneBuilder, m: number, seed: number) {
  const y0 = y0Of(m);
  const label = LABELS[m];
  const tpl = TEMPLATE[m];
  // decoration rng is per template so the seam twins come out identical
  const rng = new Rng(hash3(seed, 4111, tpl));
  const f = new Furnisher(b, rng);
  const circuit = tpl + 1;
  const W = 'cinder';
  const yL1 = y0 + 6, yA0 = y0 + 7, yA1 = y0 + 11, yH0 = y0 + 12, yH1 = y0 + 14, yB0 = y0 + 15, yB1 = y0 + 19;

  // floors
  b.fillFloor(SX0, y0, SX1, yL1, 'concrete');
  b.fillFloor(FA0, yA0, FA1, yA1, 'concrete');
  b.fillFloor(SX0, yH0, SX1, yH1, 'concrete');
  b.fillFloor(FB0, yB0, FB1, yB1, 'concrete');
  for (let y = yA0; y <= yA1; y++) for (let x = FA0; x <= FA1; x++) b.obj('zg_stair_flight', x, y, 0, {});
  for (let y = yB0; y <= yB1; y++) for (let x = FB0; x <= FB1; x++) b.obj('zg_stair_flight', x, y, 0, {});

  // shell walls (painted block), railings over the well
  b.vwall(SX0, y0, yB1, W);
  b.vwall(SX1 + 1, y0, yB1, W);
  b.hwall(SX0, FB0 - 1, y0, W);                 // landing north wall (the well of the storey above behind it)
  if (m === 0) b.hwall(FB0, FB1, y0 - 4, W);
  b.hwall(FA1 + 1, SX1, yA0, 'railing');        // landing edge over the well
  b.vwall(FA1 + 1, yA0, yA1, 'railing');        // flight A inner rail
  b.hwall(FA1 + 1, SX1, yH0, 'railing');        // half-landing, north edge
  b.hwall(SX0, FB0 - 1, yB0, 'railing');        // half-landing, south edge
  b.vwall(FB0, yB0, yB1, 'railing');            // flight B inner rail
  // rooms
  b.addRoom('Landing ' + label, 'landing', SX0, y0, SX1, yL1, { circuit, temp: 15 });
  b.addRoom('Stairs ' + label, 'stairs', FA0, yA0, FA1, yA1, { circuit, temp: 15 });
  b.addRoom('Half-landing ' + label, 'landing', SX0, yH0, SX1, yH1, { circuit, temp: 14 });
  b.addRoom('Stairs ' + label, 'stairs', FB0, yB0, FB1, yB1, { circuit, temp: 14 });

  // ---- the numbered door (portal doors are set afterwards by the zone)
  const hasPortal = label === '4' || label === '0' || label === 'P2';
  if (!hasPortal) {
    if (label === '1') b.door(DOOR_X, y0, 0, 'door_metal', { locked: true, barricade: 3, barricadeSide: 1, sign: 'staff' });
    else b.door(DOOR_X, y0, 0, 'door_metal', { locked: true, sign: 'staff' });
  }
  wallObj(b, 'zg_level_sign', DOOR_X + 2, y0, 'n', { label });
  wallObj(b, 'exit_sign', DOOR_X, y0, 'n', {});
  wallObj(b, 'fire_extinguisher_wall', SX0 + 1, y0, 'n', {});
  // the half-landing wall announces the landing below (below P3 that is "2" again)
  wallObj(b, 'zg_level_sign', SX0, yH0 + 1, 'w', { label: LABELS[m + 1] ?? '3' });

  // handrails on the outer walls of both flights
  for (let y = yA0; y <= yA1; y++) wallObj(b, 'zg_handrail', FA0, y, 'w', {});
  for (let y = yB0; y <= yB1; y++) wallObj(b, 'zg_handrail', FB1, y, 'e', {});

  // ---- lights: caged bulbs, one per landing, half-landing and flight
  const dead = rng.chance(0.18);
  const fl = () => (rng.chance(0.3) ? rng.float(0.08, 0.35) : 0);
  // the half-landing above the hidden 13 is always dark
  const darkHalf = label === '1';
  lamp(b, 23, y0 + 3, circuit, { kind: 'light_bulb', flicker: fl(), broken: dead && rng.chance(0.5) });
  lamp(b, 18, yA0 + 2, circuit, { kind: 'light_bulb', flicker: fl(), broken: dead });
  lamp(b, 24, yH0 + 1, circuit, { kind: 'light_bulb', flicker: darkHalf ? 0 : fl(), broken: darkHalf || (dead && rng.chance(0.6)) });
  lamp(b, 29, yB0 + 2, circuit, { kind: 'light_bulb', flicker: fl(), broken: rng.chance(0.12) });

  // ---- wall clutter
  const r = rng.next();
  if (r < 0.5) wallObj(b, 'pipes_cluster', SX0, y0 + 2, 'w', {});
  else wallObj(b, 'vent_wall', SX0, y0 + 2, 'w', {});
  if (rng.chance(0.6)) wallObj(b, 'pipes_cluster', SX0 + 6, y0, 'n', {});
  if (tpl === 1 || tpl === 3 || tpl === 5) wallObj(b, 'zg_wall_scrawl', SX0, y0 + 4, 'w', tpl === 3 ? { v: 0, lore: 'stair_graffiti' } : { v: tpl === 1 ? 1 : 3 });
  if (label === 'P2' || label === '0') wallObj(b, 'zg_wall_scrawl', SX0, yH0 + 2, 'w', { v: label === '0' ? 5 : 4 });

  // ---- floor clutter (template-deterministic)
  const props: [string, number][] = [['chair_folding', 3], ['trash_bags', 2], ['cardboard_box', 2], ['mop_bucket', 1], ['traffic_cone', 1], ['chair_stack', 0.6], ['crate_wood', 1]];
  const nProps = rng.int(1, 3);
  for (let i = 0; i < nProps; i++) {
    const x = rng.int(SX0 + 1, SX1 - 1), y = rng.int(y0 + 3, yL1);
    if (x === DOOR_X || (x >= FA0 && x <= FA1 && y === yL1) || x >= FB0) continue;
    f.place(rng.weighted(props), x, y, rng.int(0, 3) as 0 | 1 | 2 | 3, {});
  }
  if (rng.chance(0.4)) f.place('cardboard_box', rng.int(SX0 + 2, FB0 - 2), yH0 + rng.int(0, 1), 0, {});

  // decals: water, cracks, footprints going down the flights
  const decal = (tex: string, x: number, y: number, s: number, rot?: number, tint?: number, a?: number) => decalAt(z, tex, x + 0.5 + rng.float(-0.25, 0.25), y + 0.5 + rng.float(-0.25, 0.25), s, s, rot ?? rng.float(0, Math.PI * 2), tint, a);
  for (let i = 0; i < 4; i++) decal(rng.pick(['decal_stain_water', 'decal_crack', 'decal_stain_dark', 'decal_puddle']), rng.int(SX0, SX1), rng.int(y0, yL1), rng.float(0.8, 1.6));
  for (let i = 0; i < 2; i++) decal(rng.pick(['decal_crack', 'decal_stain_water']), rng.int(SX0, SX1), rng.int(yH0, yH1), rng.float(0.8, 1.4));
  if (rng.chance(0.5)) for (let y = y0 + 3; y <= yL1; y++) decal('decal_footprints', 18 + (y & 1), y, 0.7, Math.PI / 2, 0x6a6458, 0.45);
  if (tpl === 1) decal('decal_mark_x', 24, y0 + 5, 0.9, 0.3);

  // floor loot on the landing (seam twins roll the same items)
  if (rng.chance(0.55)) f.floorLoot(rng.chance(0.5) ? 'floor_generic' : 'junk', rng.int(SX0 + 1, FB0 - 2), rng.int(y0 + 2, yL1 - 1));
  if (rng.chance(0.15)) f.floorItem('almond_water', rng.int(SX0 + 1, FB0 - 2), y0 + 5);

  // ---- side rooms through the west block wall
  if (label === '2') {
    // storage cage: the phantom storey has the same door, but nobody reaches it
    const rx0 = 7, rx1 = 15, ry0 = y0 + 1, ry1 = y0 + 5;
    room(b, 'Storage ' + label, 'storage', rx0, ry0, rx1, ry1, { floor: 'concrete', wall: W, circuit, temp: 14 });
    b.door(SX0, y0 + 3, 1, 'door_metal', { sign: 'maintenance' });
    for (let x = rx0; x <= rx1; x += 2) f.place('shelf_metal', x, ry0, 0, {});
    f.place('cardboard_stack', rx0, ry1, 0, {});
    f.place('crate_wood', rx0 + 1, ry1, 0, {});
    f.place('mop_bucket', rx1 - 1, ry1, 0, {});
    f.place('cardboard_box', rx0 + 3, ry0 + 2, 0, {});
    lamp(b, rx0 + 4, ry0 + 2, circuit, { kind: 'light_bulb', flicker: 0.1 });
    if (m !== 8) { f.floorLoot('floor_generic', rx0 + 2, ry0 + 3); f.floorItem('lightbulb', rx0 + 5, ry0 + 3); }
  }
  if (label === 'P1') {
    const rx0 = 5, rx1 = 15, ry0 = y0 + 1, ry1 = y0 + 6;
    room(b, 'Electrical P1', 'electrical', rx0, ry0, rx1, ry1, { floor: 'concrete', wall: 'concrete', circuit, temp: 17 });
    b.door(SX0, y0 + 4, 1, 'door_metal', { sign: 'danger' });
    wallObj(b, 'breaker_panel', rx0 + 2, ry0, 'n', {});
    wallObj(b, 'fuse_box', rx0 + 4, ry0, 'n', {});
    f.place('electrical_cabinet', rx0 + 6, ry0, 0, {});
    f.place('electrical_cabinet', rx0 + 7, ry0, 0, {});
    f.place('transformer', rx0 + 1, ry1 - 1, 0, {});
    f.place('tool_chest', rx1 - 1, ry0, 0, {});
    f.place('shelf_metal', rx1, ry0 + 2, 1, { loot: 'maintenance' });
    f.place('generator', rx1 - 2, ry1, 0, {});
    wallObj(b, 'pipes_cluster', rx0, ry0 + 2, 'w', {});
    lamp(b, rx0 + 5, ry0 + 3, circuit, { kind: 'light_bulb', flicker: 0.3 });
    f.floorItem('fuse', rx0 + 3, ry1);
    f.floorLoot('tools_small', rx0 + 8, ry1);
  }
  // a body on the half-landing below P1, somebody who kept counting
  if (label === 'P1') {
    b.obj('skeleton', 30, yH1, 1, {});
    f.floorItem('note', 29, yH1, { lore: 'note_generic' });
  }
}

defZone({
  key: 'stairwell', name: 'The Stairwell', W: 48, H: 192, depth: 2, gen: (z, s) => generateStairwell(z, s),
  blurb: 'Cold block walls, caged bulbs, numbered doors. Down is the only direction that feels honest.',
});
