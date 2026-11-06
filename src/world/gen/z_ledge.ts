// The Ledge (96×96, depth 6): a far shelf of the backrooms where everything
// is warm all the way through, and soft. Yellow rooms like Level 0's, but the
// wallpaper slides down its walls, the walls bow and lean (a vertex melt and
// a heat shimmer, src/world/anomalies/ledgeFx.ts), ceiling grid hangs to the
// waist, the ceiling drips into columns and pools, furniture slumps into
// puddles of itself. Light is strange and saturated: pink tubes, amber,
// teal. West: the Warm Rooms (a maze). Down the middle: the Drip Hall. East:
// the Survey Post the Institute abandoned, the Slump (a room whose furniture
// all slid to the middle) and the Honey Pools where the Giant Bumble Bees
// drink and the Gummy Bear hunts them. Then the floor itself droops over the
// edge into a warm dark: the Ledge.
//
// Anything left here melts (state.melt on furniture, data.melt on items,
// src/world/anomalies/ledge.ts) and the unit overheats the longer it stays.
//
// Links: a hole in the Undercroft (and in some deep generated floors) drops
// you in; a rope by where you land climbs back up to the Undercroft.
import { defZone, onZoneGenerated } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { type Ctx, type Rot, force, put, isOpen, arrive, mount, decal } from './mall_kit';
import { pit, findOpenRect } from './void_kit';
import { hh } from './weird_kit';
import { connectRegions } from './connect';
import { floorNum } from './z_floors';
import '../anomalies/place';

const W = 96, H = 96;
const C_MAIN = 1;
/** the sections */
const WEST = { x0: 2, y0: 2, x1: 43, y1: 93 };
const HALL = { x0: 44, y0: 2, x1: 59, y1: 93 };
const POST = { x0: 60, y0: 2, x1: 76, y1: 24 };
const SLUMP = { x0: 60, y0: 25, x1: 76, y1: 56 };
const HONEY = { x0: 60, y0: 57, x1: 76, y1: 93 };
/** where the floor starts to droop at row y, and how far it goes before it is gone */
const lipX = (y: number) => 78 + Math.round(Math.sin(y * 0.17) * 2 + Math.sin(y * 0.41 + 1) * 1.2);
const LIP = 7;

/** strange saturated tubes: pink, amber, teal, violet, warm white */
const TUBES = [0xff90d4, 0xffc070, 0x70ecdc, 0xc4a4ff, 0xfff0c8];
const FURN: [string, number][] = [['chair_office', 4], ['desk_office', 2], ['filing_cabinet', 2], ['water_cooler', 1.5], ['sofa', 1], ['bookshelf', 1], ['trash_can', 1.5], ['cardboard_box', 2], ['lamp_floor', 1], ['tv_crt', 1], ['chair_plastic', 1.5], ['vending_snack', 0.5]];

function split(b: ZoneBuilder, rng: Rng, x0: number, y0: number, x1: number, y1: number, depth: number, rooms: [number, number, number, number][]) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const canV = w >= 11, canH = h >= 11;
  if ((!canV && !canH) || (depth > 2 && rng.chance(0.2)) || depth > 6) { rooms.push([x0, y0, x1, y1]); return; }
  const vert = canV && (!canH || (w > h ? rng.chance(0.75) : rng.chance(0.25)));
  if (vert) {
    const sx = rng.int(x0 + 5, x1 - 4);
    b.vwall(sx, y0, y1, 'drywall');
    const gy = rng.int(y0 + 1, y1 - 2); b.clearW(sx, gy); if (rng.chance(0.6)) b.clearW(sx, gy + 1);
    if (h > 14 && rng.chance(0.55)) b.clearW(sx, rng.int(y0 + 1, y1 - 1));
    split(b, rng, x0, y0, sx - 1, y1, depth + 1, rooms);
    split(b, rng, sx, y0, x1, y1, depth + 1, rooms);
  } else {
    const sy = rng.int(y0 + 5, y1 - 4);
    b.hwall(x0, x1, sy, 'drywall');
    const gx = rng.int(x0 + 1, x1 - 2); b.clearN(gx, sy); if (rng.chance(0.6)) b.clearN(gx + 1, sy);
    if (w > 14 && rng.chance(0.55)) b.clearN(rng.int(x0 + 1, x1 - 1), sy);
    split(b, rng, x0, y0, x1, sy - 1, depth + 1, rooms);
    split(b, rng, x0, sy, x1, y1, depth + 1, rooms);
  }
}

/** a wax run down the wall on the north edge of tile (x, y) or the west edge (side 1), seen from inside the tile */
function wallRun(z: Zone, x: number, y: number, side: 0 | 1, rng: Rng) {
  const len = rng.float(0.8, 1.7), w = rng.float(0.35, 0.7);
  if (side === 0) z.decals.push({ x: x + rng.float(0.3, 0.7), z: y + 0.075, y: 2.7 - len / 2, w, d: len, rot: Math.PI / 2, tex: 'lg_run', vert: 1 });
  else z.decals.push({ x: x + 0.075, z: y + rng.float(0.3, 0.7), y: 2.7 - len / 2, w, d: len, rot: 0, tex: 'lg_run', vert: 1 });
}
function meltLevel(rng: Rng) { return rng.weighted([[1, 3], [2, 4], [3, 3]] as [number, number][]); }

export function generateLedge(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Ledge';

  // ---- the shelf: warm carpet everywhere, molten pools in the low spots, and the lip drooping off the east edge
  for (let y = 2; y <= H - 3; y++) {
    const L = lipX(y);
    for (let x = 2; x < Math.min(W - 2, L + LIP); x++) {
      if (x < L) {
        const n = hh(x >> 2, y >> 2, 8101) * 0.6 + hh(x, y, 8102) * 0.4;
        b.fillFloor(x, y, x, y, n < 0.09 ? 'lg_pool' : 'lg_carpet');
      } else {
        const t = (x - L + 1) / LIP;
        b.fillFloor(x, y, x, y, 'lg_lip');
        z.height[z.idx(x, y)] = -Math.round(Math.pow(t, 1.6) * 11 + Math.max(0, Math.sin(y * 0.5)) * t * 2);
      }
    }
  }
  b.paper(2, 2, W - 3, H - 3, 'lg_paper');
  for (let y = 2; y < H - 2; y += 8) for (let x = 2; x < W - 2; x += 8) if (hh(x, y, 8104) < 0.4) b.paper(x, y, x + 7, y + 7, 'lg_paper_b');
  // the outer wall: north, south and west; the east is the edge and has none
  b.hwall(2, 77, 2, 'drywall'); b.hwall(2, 77, H - 2, 'drywall'); b.vwall(2, 2, H - 3, 'drywall');
  b.addRoom('The Ledge', 'ledge_lip', 77, 2, W - 3, H - 3, { circuit: C_MAIN, temp: 31 });

  // ---- the Warm Rooms: a maze of yellow rooms
  b.vwall(WEST.x1 + 1, WEST.y0, WEST.y1, 'drywall');
  const rooms: [number, number, number, number][] = [];
  split(b, rng, WEST.x0, WEST.y0, WEST.x1, WEST.y1, 0, rooms);
  for (const [x0, y0, x1, y1] of rooms) b.addRoom('The Warm Rooms', 'ledge_rooms', x0, y0, x1, y1, { circuit: C_MAIN, temp: 31 });
  // doorways from the maze into the hall
  for (let y = 8; y < H - 6; y += rng.int(9, 15)) { b.clearW(WEST.x1 + 1, y); b.clearW(WEST.x1 + 1, y + 1); }

  // ---- the Drip Hall: one long hall, columns in two rows, pools down the middle
  b.vwall(HALL.x1 + 1, HALL.y0, HALL.y1, 'drywall');
  b.addRoom('The Drip Hall', 'ledge_hall', HALL.x0, HALL.y0, HALL.x1, HALL.y1, { circuit: C_MAIN, temp: 32 });
  const hx = (HALL.x0 + HALL.x1) >> 1;
  for (let y = HALL.y0 + 2; y <= HALL.y1 - 2; y++) for (let x = hx - 1; x <= hx + 1; x++) if (hh(x, y >> 1, 8111) < 0.55 || (y % 9 < 4)) b.fillFloor(x, y, x, y, 'lg_pool');
  for (let y = HALL.y0 + 4; y <= HALL.y1 - 4; y += 6) {
    for (const x of [HALL.x0 + 3, HALL.x1 - 3]) put(c, 'lg_wax_column', x + (hh(x, y, 8112) < 0.5 ? 0 : 1), y, 0, { v: rng.int(0, 2) });
    if (hh(y, 1, 8113) < 0.35) put(c, 'lg_wax_puddle', hx + rng.int(-2, 2), y + 3, 0, { v: rng.int(0, 2) });
  }
  for (let y = HALL.y0 + 10; y <= HALL.y1 - 10; y += 21) put(c, 'lg_slump', hx - 1 + rng.int(-2, 1), y, 0, {});
  for (let y = HALL.y0 + 6; y <= HALL.y1 - 6; y += 16) put(c, 'lg_sag_tube', hx + rng.int(-4, 3), y, 0, { v: rng.int(0, 1) });
  // doors east out of the hall into the three rooms
  for (const y of [14, 20, 33, 44, 52, 64, 75, 86]) { b.clearW(HALL.x1 + 1, y); b.clearW(HALL.x1 + 1, y + 1); }

  // ---- east: the Survey Post, the Slump, the Honey Pools; open to the lip on the east
  b.hwall(POST.x0, 77, POST.y1 + 1, 'drywall'); b.hwall(SLUMP.x0, 77, SLUMP.y1 + 1, 'drywall');
  for (const gx of [70, 71]) { b.clearN(gx, POST.y1 + 1); b.clearN(gx, SLUMP.y1 + 1); }
  b.addRoom('The Survey Post', 'ledge_post', POST.x0, POST.y0, POST.x1, POST.y1, { circuit: C_MAIN, temp: 30 });
  b.addRoom('The Slump', 'ledge_slump', SLUMP.x0, SLUMP.y0, SLUMP.x1, SLUMP.y1, { circuit: C_MAIN, temp: 32 });
  b.addRoom('The Honey Pools', 'honey_pools', HONEY.x0, HONEY.y0, HONEY.x1, HONEY.y1, { circuit: C_MAIN, temp: 33 });

  // ---- where you land (the hole in the Undercroft drops you here), and the rope back up
  const lx = 72, ly = 16;
  b.clearObjects(lx - 2, ly - 2, lx + 2, ly + 2);
  arrive(b, 'fall', lx, ly, 's', 3);
  force(c, 'zw_rope_hanging', lx - 3, ly - 3, 0, { v: 1, portal: 'lg_rope_up' });
  b.portal({ id: 'lg_rope_up', x: lx - 3, y: ly - 3, kind: 'ladder', to: 'undercroft', tx: 48, ty: 52, anchor: 'r_ledge', label: 'Climb the rope back up to the Undercroft' });
  b.light(lx - 2.5, ly - 2.5, 'sky', { color: 0xfff0c0, intensity: 0.45, radius: 5, y: 6, circuit: 0 });
  force(c, 'vx_sign', lx - 1, ly + 3, 0, { text: 'THE LEDGE|KEEP MOVING', c: 0xd8641c, ink: 0xfff4e0 });
  // the Survey Post: the foil shelter, a thermometer that says 31, the log, the memo
  force(c, 'lg_foil_tent', POST.x0 + 3, POST.y0 + 3, 0, {});
  force(c, 'lg_thermo', POST.x0 + 7, POST.y0 + 3, 0, {});
  f.floorItem('note', POST.x0 + 6, POST.y0 + 6, { lore: 'lg_survey_log' });
  f.floorItem('note', lx + 2, ly + 1, { lore: 'lg_calder_memo' });
  f.floorItem('ledge_foil', POST.x0 + 5, POST.y0 + 7);
  for (let i = 0; i < 3; i++) put(c, 'cardboard_box', POST.x0 + 2 + i, POST.y1 - 2, 0, { melt: i + 1 });
  put(c, 'chair_plastic', POST.x0 + 9, POST.y0 + 6, 1, { melt: 1 });

  // ---- the Slump: everything in the room slid to the middle and set there
  const sx = (SLUMP.x0 + SLUMP.x1) >> 1, sy = (SLUMP.y0 + SLUMP.y1) >> 1;
  force(c, 'lg_wax_heap', sx - 1, sy - 1, 0, { v: 0 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng.float(-0.2, 0.2), r = rng.float(2.6, 6.5);
    const x = Math.round(sx + Math.cos(a) * r), y = Math.round(sy + Math.sin(a) * r * 1.6);
    const rot = (((Math.round(Math.atan2(sy - y, sx - x) / (Math.PI / 2)) % 4) + 4) % 4) as Rot;
    put(c, rng.weighted(FURN), x, y, rot, { melt: r < 4 ? 3 : 2 });
  }
  for (let i = 0; i < 18; i++) { const a = rng.float(0, Math.PI * 2), r = rng.float(1.5, 7); decal(z, 'lg_puddle', sx + 0.5 + Math.cos(a) * r, sy + 0.5 + Math.sin(a) * r * 1.5, rng.float(1, 2.2), rng.float(1, 2), a); }
  force(c, 'lg_wax_heap', SLUMP.x0 + 2, SLUMP.y1 - 3, 0, { v: 1 });

  // ---- the Honey Pools: amber pools where the ceiling has dripped longest; the bees drink here
  for (let k = 0; k < 6; k++) {
    const cx = rng.int(HONEY.x0 + 3, HONEY.x1 - 3), cy = rng.int(HONEY.y0 + 3, HONEY.y1 - 3), r = rng.float(1.6, 3.2);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) <= r + hh(x, y, 8121) * 0.8 && z.inb(x, y) && x < lipX(y)) b.fillFloor(x, y, x, y, 'lg_pool');
    put(c, 'lg_wax_column', cx + (k % 2 ? 2 : -2), cy, 0, { v: k % 3 });
  }
  force(c, 'lg_wax_heap', HONEY.x0 + 6, HONEY.y0 + 14, 0, { v: 2 });
  put(c, 'lg_sag_tube', HONEY.x0 + 9, HONEY.y0 + 4, 0, { v: 1 });
  // ---- the hive (round 14): the Queen Bee's chamber at the south end of the pools (props: src/content/furniture/zq_hive.ts;
  // queen_bee.ts keeps her on meta.hive): comb hanging round three sides, brood mounds, honey pots, the larder the bees
  // bring in, and two chairs where Still Lifes sit for the bees to eat (bee_keeper.ts)
  {
    const hx = HONEY.x0 + 7, hy = HONEY.y1 - 6;
    b.clearObjects(HONEY.x0 + 1, hy - 9, HONEY.x1 - 1, HONEY.y1 - 1);
    force(c, 'qb_throne', hx - 1, hy - 1, 0, {});
    for (const [x, y, rot, v] of [[hx - 4, hy + 3, 0, 0], [hx - 1, hy + 4, 0, 1], [hx + 2, hy + 3, 0, 2], [hx - 5, hy - 1, 1, 1], [hx + 4, hy - 1, 1, 0]] as [number, number, Rot, number][]) force(c, 'qb_comb_wall', x, y, rot, { v });
    for (const [x, y, n] of [[hx - 3, hy + 1, 3], [hx + 3, hy + 1, 2], [hx - 4, hy - 3, 4], [hx + 4, hy - 3, 1]]) force(c, 'qb_brood', x, y, 0, { brood: n });
    force(c, 'qb_honey_pot', hx - 6, hy + 2, 0, {}); force(c, 'qb_honey_pot', hx + 6, hy + 2, 0, {});
    put(c, 'rm_gore_pile', hx - 2, hy - 4, 0, { v: 1, eaten: 1, yaw: 1.2 }); put(c, 'rm_bones', hx + 3, hy - 5, 0, { v: 0, yaw: 2.1 });
    put(c, 'rm_unit', hx - 5, hy - 8, 0, { v: 0, eaten: 2, cause: 1, days: 9 });
    for (let i = 0; i < 6; i++) decal(z, i % 2 ? 'lg_puddle' : 'rm_smear', hx + 0.5 + rng.float(-3, 3), hy - 3 + rng.float(-3, 2), rng.float(0.8, 1.4), rng.float(0.8, 1.4), rng.float(0, 6.28), undefined, 0.8);
    const seats: [number, number][] = [];
    for (const [x, y, rot] of [[HONEY.x0 + 1, hy - 9, 1], [HONEY.x1 - 2, hy - 5, 3]] as [number, number, Rot][]) if (force(c, 'chair_plastic', x, y, rot, {})) seats.push([x + 0.5, y + 0.5]);
    b.light(hx + 0.5, hy - 1.5, 'fluoro', { color: 0xffc070, intensity: 0.75, radius: 7, circuit: C_MAIN });
    f.floorItem('note', hx, hy - 8, { lore: 'rm_recovery_order' });
    z.meta.hive = [hx + 0.5, hy + 0.5]; z.meta.hiveFacing = -Math.PI / 2; z.meta.slSeats = seats;
  }
  f.floorItem('note', POST.x0 + 9, POST.y0 + 9, { lore: 'qb_keeper_log' });

  // ---- the Warm Rooms: melted furniture, heaps, the debtor's note
  rooms.forEach(([x0, y0, x1, y1], i) => {
    const n = rng.int(1, 4);
    for (let k = 0; k < n; k++) f.anywhere(rng.weighted(FURN), x0 + 1, y0 + 1, x1 - 1, y1 - 1, 12, { melt: meltLevel(rng) });
    if (rng.chance(0.18)) put(c, 'lg_wax_puddle', rng.int(x0 + 1, x1 - 1), rng.int(y0 + 1, y1 - 1), 0, { v: rng.int(0, 2) });
    if (rng.chance(0.12) && x1 - x0 > 5 && y1 - y0 > 5) put(c, 'lg_wax_heap', x0 + 2, y0 + 2, 0, { v: i % 3 });
    if (rng.chance(0.1)) put(c, 'lg_wax_column', rng.int(x0 + 1, x1 - 1), rng.int(y0 + 1, y1 - 1), 0, { v: i % 3 });
    if (rng.chance(0.5)) { const x = rng.int(x0 + 1, x1 - 1), y = rng.int(y0 + 1, y1 - 1); if (isOpen(z, x, y)) f.floorLoot('floor_generic', x, y); }
    // runs down the walls
    for (let k = 0; k < 2; k++) { if (rng.chance(0.6)) wallRun(z, rng.int(x0, x1), y0, 0, rng); if (rng.chance(0.4)) wallRun(z, x0, rng.int(y0, y1), 1, rng); }
  });
  const nr = rooms[rng.int(0, rooms.length - 1)];
  f.floorItem('note', (nr[0] + nr[2]) >> 1, (nr[1] + nr[3]) >> 1, { lore: 'lg_debtor_note' });
  for (let i = 0; i < 4; i++) { const p = findOpenRect(z, 1, 1, rng, 300, 1); if (p) f.floorItem('ledge_wax', p[0], p[1]); }
  // an EXIT sign that ran down the wall, on the hall's west wall, pointing nowhere
  const ex = mount(b, 'lg_drip_sign', HALL.x0, 40, 'w', {});
  void ex;
  for (let y = HALL.y0; y <= HALL.y1; y += 3) { wallRun(z, HALL.x0, y, 1, rng); wallRun(z, HALL.x1 + 1, y + 1, 1, rng); }

  // ---- the lip: lone wall stubs leaning out over the drop, a melt heap sliding off, puddles on the way down
  for (let y = 6; y < H - 6; y += rng.int(7, 12)) {
    const L = lipX(y);
    if (rng.chance(0.5)) b.vwall(L - 1, y, y + rng.int(1, 3), 'drywall');
    else b.hwall(L - 2, L, y, 'drywall');
    decal(z, 'lg_puddle', L + 1.5, y + 0.5, 1.6, 1.4, rng.float(0, 3));
  }
  for (let y = 4; y < H - 4; y += 2) if (hh(y, 2, 8131) < 0.3) wallRun(z, lipX(y) - 1, y, 1, rng);

  // ---- lights: a tube grid in strange colours (warm white near where you land), a few dead, a few flickering
  for (let y = 5; y < H - 4; y += 5) for (let x = 5; x < W - 4; x += 5) {
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || x >= lipX(y)) continue;
    const r = hh(x, y, 8141);
    if (r < 0.1) continue;
    const col = Math.hypot(x - lx, y - ly) < 9 ? 0xfff0c8 : TUBES[hash3(x >> 3, y >> 3, 8142) % TUBES.length];
    b.light(x + 0.5, y + 0.5, 'fluoro', { color: col, intensity: 0.85, radius: 5.6, circuit: C_MAIN, flicker: r < 0.22 ? 0.2 : 0 });
  }
  // the drop glows faintly from below
  for (let y = 6; y < H - 6; y += 10) b.light(lipX(y) + LIP + 0.5, y + 0.5, 'sky', { color: 0xff7a3a, intensity: 0.7, radius: 8, y: -2.5, circuit: 0 });

  // ---- floor wear: puddles and runs of melt everywhere
  for (let i = 0; i < 90; i++) { const x = rng.int(3, 76), y = rng.int(3, H - 4); if (z.floor[z.idx(x, y)] && !z.height[z.idx(x, y)]) decal(z, rng.chance(0.7) ? 'lg_puddle' : 'decal_stain_dark', x + 0.5, y + 0.5, rng.float(0.8, 1.8), rng.float(0.8, 1.6), rng.float(0, 6.28), undefined, 0.85); }

  // everything reachable from where you land (the set pieces keep their walls)
  connectRegions(z, b, lx, ly, rng, { keep: [] });

  b.flag(lx - 3, ly - 3, lx + 3, ly + 3, TF.NOSPAWN);
  z.power.set(C_MAIN, true);
  z.env = {
    ...z.env,
    ambient: 0x7a6650, ambientI: 0.6, fog: 0x5a3a30, fogNear: 15, fogFar: 36, void: 0x2a0c08, temp: 31,
    sky: false, grade: 'ledge', reverb: 'hall', ambience: 'hum', music: 'drone', weather: 'none',
  } as Zone['env'];
  // the Ledge's inhabitants (src/creatures/species: bumble_bee, gummy_bear)
  z.spawnTable = [['bumble_bee', 4], ['gummy_bear', 2], ['lumenmoth', 0.6]];
  z.creatureCap = 7;
  z.meta.ledge = 1;
  z.meta.terminalLore = ['lg_survey_log', 'lg_calder_memo'];
}

defZone({
  key: 'ledge', name: 'The Ledge', W, H, depth: 6,
  blurb: 'A far shelf of the backrooms, warm all the way through. The walls lean, the ceiling drips, and whatever you put down will not be the same shape when you come back for it.',
  gen: (z, s) => { generateLedge(z, s); },
});

// ---------------------------------------------------------------- the ways down: the Undercroft, and some deep generated floors
onZoneGenerated((z, seed) => {
  if (z.key === 'undercroft') {
    const rng = new Rng(hash3(seed, 8151, 3));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    const p = findOpenRect(z, 4, 4, rng, 900, 2);
    const [px, py] = p ?? [20, 20];
    pit(c, px + 2, py + 2, 1.6, { to: 'ledge', label: 'Warm air comes up out of this hole. It smells like candles.' }, 'lg_under_hole');
    put(c, 'vx_sign', px + 1, py - 1, 0, { text: 'WARM|DO NOT GO DOWN', c: 0xd8641c, ink: 0x1a0c06 });
    arrive(b, 'r_ledge', px + 2, py + 5, 'n', 1);
    return;
  }
  if (z.key.startsWith('floor~')) {
    const n = floorNum(z.key);
    if (n < 120 || hash3(n, 29, 8161) % 6 !== 0) return;
    const rng = new Rng(hash3(seed, 8162, 5));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    const p = findOpenRect(z, 3, 3, rng, 400, 1);
    if (p) pit(c, p[0] + 1.5, p[1] + 1.5, 1.4, { to: 'ledge', label: 'The edge of this hole is soft, and warm.' }, 'lg_floor_hole');
  }
});
