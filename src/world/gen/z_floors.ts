// Generated floors ('floor~<n>', 64×64): what is under the floor you fell
// through. Every number is its own floor, built from the number: yellow
// carpet, grey offices, drained pools, sodium concrete, a red floor where the
// lights are bulbs, and very deep down, static. Rooms split and split again
// with gaps for doors, fluorescent grids with dead tubes, sparse furniture, one
// weird room (giant stairs over a void, stairs to nowhere, or a hall built for
// something tall), holes going further down (sometimes into a dimension),
// and a rope hanging from where you came in, if you want to climb back up.
import { defZone, defZoneFamily, onZoneGenerated } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { type Ctx, force, put, isOpen, arrive } from './mall_kit';
import { pit, findOpenRect, giantStairs, stairsToNowhere, scaleHall, type HoleSpec } from './void_kit';
import { hh } from './weird_kit';

const W = 64, H = 64;

interface Style {
  key: string; title: string; floor: string; alt?: string; wall: string; paper: string;
  light: 'fluoro' | 'bulb' | 'sodium'; furn: string[]; loot: string;
  env: Partial<Zone['env']>; spawn: [string, number][];
}
const STYLES: Style[] = [
  { key: 'yellow', title: 'The Yellow', floor: 'carpet_yellow', alt: 'carpet_wet', wall: 'drywall', paper: 'wall_yellow', light: 'fluoro',
    furn: ['chair_office', 'water_cooler', 'trash_can', 'cardboard_box', 'chair_plastic'], loot: 'floor_generic',
    env: { ambient: 0x3a3420, ambientI: 0.55, fog: 0x2b2512, fogNear: 12, fogFar: 26, void: 0x050402, temp: 22, grade: 'lobby', reverb: 'hall', ambience: 'hum' },
    spawn: [['grinhound', 2], ['employee', 2], ['lumenmoth', 2], ['swivel', 1.5], ['underlay', 1], ['drywall_man', 1], ['hollow', 1]] },
  { key: 'office', title: 'The Cubicles', floor: 'carpet_office', wall: 'drywall', paper: 'wall_office', light: 'fluoro',
    furn: ['desk_office', 'chair_office', 'filing_cabinet', 'bookshelf', 'water_cooler', 'trash_can'], loot: 'floor_generic',
    env: { ambient: 0x2c3136, ambientI: 0.52, fog: 0x15191d, fogNear: 13, fogFar: 30, void: 0x050608, temp: 20, grade: 'office', reverb: 'office', ambience: 'office', music: 'drone' },
    spawn: [['employee', 3], ['swivel', 2], ['drywall_man', 1.5], ['ventling', 1.5], ['hollow', 1]] },
  { key: 'pool', title: 'The Drained Pools', floor: 'tile_pool', alt: 'water_shallow', wall: 'tile', paper: 'wall_pool', light: 'fluoro',
    furn: ['pool_ladder', 'chair_plastic', 'trash_can'], loot: 'floor_generic',
    env: { ambient: 0x9ab4bc, ambientI: 0.5, fog: 0xa8c4cc, fogNear: 12, fogFar: 32, void: 0x04080a, temp: 25, grade: 'pool', reverb: 'pool', ambience: 'pool', music: 'pads' },
    spawn: [['lifeguard', 1.5], ['lumenmoth', 1], ['echo', 1], ['hollow', 0.5]] },
  { key: 'concrete', title: 'The Sodium Level', floor: 'parking', alt: 'concrete_wet', wall: 'concrete', paper: 'wall_garage', light: 'sodium',
    furn: ['crate_wood', 'shelf_metal', 'cardboard_box', 'trash_can'], loot: 'floor_generic',
    env: { ambient: 0x2a2218, ambientI: 0.48, fog: 0x18120c, fogNear: 10, fogFar: 28, void: 0x050302, temp: 13, grade: 'parking', reverb: 'tunnel', ambience: 'parking' },
    spawn: [['grinhound', 2], ['hollow', 1.5], ['sentinel', 1], ['occupant', 0.5], ['gloam', 1]] },
  { key: 'red', title: 'The Red Floor', floor: 'carpet_red', alt: 'carpet_hotel', wall: 'drywall', paper: 'wall_mall', light: 'bulb',
    furn: ['sofa', 'lamp_floor', 'tv_crt', 'chair_wood', 'bookshelf'], loot: 'floor_generic',
    env: { ambient: 0x301814, ambientI: 0.45, fog: 0x1a0a08, fogNear: 10, fogFar: 24, void: 0x040101, temp: 23, grade: 'house', reverb: 'small', ambience: 'hum' },
    spawn: [['still_life', 2], ['occupant', 1.5], ['echo', 1], ['plushkin', 1], ['stammer', 1]] },
  { key: 'static', title: 'The Static', floor: 'void', alt: 'glitch', wall: 'glitch', paper: 'missing_tex', light: 'fluoro',
    furn: ['chair_office', 'door_freestanding', 'tv_crt'], loot: 'floor_generic',
    env: { ambient: 0x1a1a22, ambientI: 0.45, fog: 0x08080c, fogNear: 9, fogFar: 22, void: 0x000000, temp: 12, grade: 'void', reverb: 'void', ambience: 'void', music: 'drone' },
    spawn: [['echo', 2], ['stammer', 2], ['gloam', 1.5], ['hollow', 1]] },
];

/** the floor number from a 'floor~<n>' key */
export const floorNum = (key: string) => Math.max(1, Math.floor(Number(key.split('~')[1]) || 1));
export const floorKey = (n: number) => 'floor~' + Math.max(1, Math.floor(n) % 99991 || 1);
/** where hole i of floor n (or of zone key k) leads: a deeper generated floor */
export const deeperFloor = (seedKey: string, i: number) => floorKey(10 + (hash3(seedKey.length * 131 + seedKey.charCodeAt(seedKey.length - 1), i, 9001) ^ hash3(seedKey.charCodeAt(0), seedKey.length, i)) % 9000);
export function floorStyle(n: number): Style {
  if (n % 23 === 7) return STYLES[5];
  return STYLES[hash3(n, 3, 9011) % 5];
}

/** BSP rooms: split until the pieces are room-sized, a doorway gap in every split */
function split(b: ZoneBuilder, rng: Rng, x0: number, y0: number, x1: number, y1: number, wall: string, depth: number, rooms: [number, number, number, number][]) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const canV = w >= 12, canH = h >= 12;
  if ((!canV && !canH) || (depth > 2 && rng.chance(0.18)) || depth > 6) { rooms.push([x0, y0, x1, y1]); return; }
  const vert = canV && (!canH || (w > h ? rng.chance(0.75) : rng.chance(0.25)));
  if (vert) {
    const sx = rng.int(x0 + 5, x1 - 5);
    b.vwall(sx, y0, y1, wall);
    const gy = rng.int(y0 + 1, y1 - 2); b.clearW(sx, gy); if (rng.chance(0.6)) b.clearW(sx, gy + 1);
    if (h > 14 && rng.chance(0.5)) b.clearW(sx, rng.int(y0 + 1, y1 - 1));
    split(b, rng, x0, y0, sx - 1, y1, wall, depth + 1, rooms);
    split(b, rng, sx, y0, x1, y1, wall, depth + 1, rooms);
  } else {
    const sy = rng.int(y0 + 5, y1 - 5);
    b.hwall(x0, x1, sy, wall);
    const gx = rng.int(x0 + 1, x1 - 2); b.clearN(gx, sy); if (rng.chance(0.6)) b.clearN(gx + 1, sy);
    if (w > 14 && rng.chance(0.5)) b.clearN(rng.int(x0 + 1, x1 - 1), sy);
    split(b, rng, x0, y0, x1, sy - 1, wall, depth + 1, rooms);
    split(b, rng, x0, sy, x1, y1, wall, depth + 1, rooms);
  }
}

export function generateFloor(z: Zone, seed: number) {
  const n = floorNum(z.key);
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  const st = floorStyle(n);
  z.name = `Sublevel ${n} — ${st.title}`;
  const C = 1;

  b.fillFloor(2, 2, W - 3, H - 3, st.floor);
  b.paper(2, 2, W - 3, H - 3, st.paper);
  b.roomWalls(2, 2, W - 3, H - 3, st.wall);
  // patches of the alternate floor (wet carpet, water, wet concrete)
  if (st.alt) for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (hh(x >> 2, y >> 2, n * 7 + 1) < 0.12 && hh(x, y, n) < 0.7) b.fillFloor(x, y, x, y, st.alt);
  const rooms: [number, number, number, number][] = [];
  split(b, rng, 2, 2, W - 3, H - 3, st.wall, 0, rooms);
  for (const [x0, y0, x1, y1] of rooms) b.addRoom(st.title, 'floor_' + st.key, x0, y0, x1, y1, { circuit: C });

  // ---- the weird room
  const kind = hash3(n, 5, 9021) % 3;
  const R = kind === 1 ? findOpenRectLoose(z, 18, 18, rng) : findOpenRectLoose(z, 16, 20, rng);
  const deeper: HoleSpec = { to: deeperFloor(z.key, 7), shared: true, label: 'Jump into the hole at the top of the stairs' };
  if (R) {
    const [rx, ry, rw, rh] = R;
    b.clearWallsIn(rx - 1, ry - 1, rx + rw, ry + rh);
    b.clearObjects(rx, ry, rx + rw - 1, ry + rh - 1);
    if (kind === 0) {
      // giant stairs over a void: up the middle, a turn, and a hole at the very top
      const x0 = rx + 2, y0 = ry + 2, x1 = rx + rw - 3, y1 = ry + rh - 3;
      const sx = (x0 + x1) >> 1;
      giantStairs(c, x0, y0, x1, y1, sx - 2, y1, { path: [['n', Math.max(4, y1 - y0 - 6)], ['e', Math.max(2, ((x1 - x0) >> 1) - 2)], ['n', 2]], width: 3, rise: 5, top: 'hole', hole: deeper, holeId: 'vx_stairhole' });
    } else if (kind === 1) {
      scaleHall(c, rx + 1, ry + 1, rx + rw - 2, ry + rh - 2, { floor: 'wood', wall: st.wall === 'glitch' ? 'drywall' : st.wall, paper: st.paper, hole: deeper, holeId: 'vx_hallhole' });
      // the hall needs ways in: a gap in each wall
      for (const [gx, gy, side] of [[rx + (rw >> 1), ry + 1, 0], [rx + (rw >> 1), ry + rh - 1, 0], [rx + 1, ry + (rh >> 1), 1], [rx + rw - 1, ry + (rh >> 1), 1]] as const) { b.gap(gx, gy, side); b.gap(side === 0 ? gx + 1 : gx, side === 0 ? gy : gy + 1, side); }
    } else {
      // stairs to nowhere, three of them, side by side, of different lengths
      b.fillFloor(rx, ry, rx + rw - 1, ry + rh - 1, 'concrete');
      for (let k = 0; k < 3; k++) stairsToNowhere(c, rx + 3 + k * 4, ry + rh - 4, 'n', 5 + k * 3, 2);
      pit(c, rx + rw - 3.5, ry + 3.5, 1.2, deeper, 'vx_nowherehole');
    }
  }

  // ---- lights: a fluorescent grid with dead tubes
  for (let y = 5; y < H - 4; y += 5) for (let x = 5; x < W - 4; x += 5) {
    if (!z.floor[z.idx(x, y)] || z.height[z.idx(x, y)]) continue;
    const r = hh(x, y, n * 3 + 11);
    if (r < 0.14) continue;
    b.light(x + 0.5, y + 0.5, st.light, { circuit: C, flicker: r < 0.3 ? 0.25 : 0, broken: r < 0.2 });
  }

  // ---- furniture, sparse, and loot
  for (const [x0, y0, x1, y1] of rooms) {
    const k = rng.int(0, 3);
    for (let i = 0; i < k; i++) f.anywhere(rng.pick(st.furn), x0 + 1, y0 + 1, x1 - 1, y1 - 1, 12, {});
    if (rng.chance(0.55)) { const x = rng.int(x0 + 1, x1 - 1), y = rng.int(y0 + 1, y1 - 1); if (isOpen(z, x, y)) f.floorLoot(st.loot, x, y); }
  }
  for (let i = 0; i < 50; i++) { const x = rng.int(3, W - 4), y = rng.int(3, H - 4); if (z.floor[z.idx(x, y)] && !z.height[z.idx(x, y)]) f.decal(rng.weighted([['decal_stain_water', 4], ['decal_stain_dark', 2], ['decal_mold', 1], ['decal_footprints', 1]]), x, y, rng.float(1, 2.2), rng.float(1, 2.2)); }

  // ---- where you land, and the rope back up
  const L = findOpenRect(z, 3, 3, rng, 600, 1) || [W >> 1, H >> 1];
  const lx = L[0] + 1, ly = L[1] + 1;
  arrive(b, 'fall', lx, ly, 's', 3);
  const RP = findOpenRect(z, 1, 1, rng, 400, 1);
  if (RP) {
    force(c, 'zw_rope_hanging', RP[0], RP[1], 0, { v: 0, portal: 'vx_rope_up' });
    b.portal({ id: 'vx_rope_up', x: RP[0], y: RP[1], kind: 'ladder', to: 'lobby', tx: 80, ty: 80, anchor: 'vx_return', label: 'Climb the rope back up to the Lobby' });
    b.light(RP[0] + 0.5, RP[1] + 0.5, 'sky', { color: 0xe8d890, intensity: 0.7, radius: 5, y: 6, circuit: 0 });
  }

  // ---- holes further down (online: maybe onto someone else's floor), and now and then a door to somewhere else entirely
  const holes = 2 + (hash3(n, 9, 9031) % 2);
  for (let i = 0; i < holes; i++) {
    const p = findOpenRect(z, 3, 3, rng, 400, 1);
    if (!p) continue;
    pit(c, p[0] + 1.5, p[1] + 1.5, 1.35, { to: deeperFloor(z.key, i), shared: true, label: 'Jump into the hole' }, 'vx_hole' + i);
  }
  const dim = ['chess', 'meadow', 'moon'][hash3(n, 13, 9041) % 3];
  if (hash3(n, 17, 9051) % 3 === 0 || n < 30) {
    const p = findOpenRect(z, 3, 3, rng, 400, 1);
    if (p) pit(c, p[0] + 1.5, p[1] + 1.5, 1.45, { to: dim, label: 'Something is shining at the bottom of this hole' }, 'vx_dimhole');
  }

  b.flag(lx - 3, ly - 3, lx + 3, ly + 3, TF.NOSPAWN);
  z.power.set(C, true);
  z.env = { ...z.env, ...st.env, sky: false } as Zone['env'];
  z.spawnTable = st.spawn;
  z.creatureCap = 5;
  z.meta.floorNum = n;
  z.meta.floorStyle = st.key;
  z.meta.dimHole = dim;
  z.meta.blurb = `${st.title}. Sublevel ${n}. Nobody built this floor; it was here when you fell into it.`;
}

/** an open rect for a weird room, allowing internal walls (they get cleared); [x, y, w, h] */
function findOpenRectLoose(z: Zone, w: number, h: number, rng: Rng): [number, number, number, number] | null {
  for (let t = 0; t < 60; t++) {
    const x = rng.int(4, W - w - 5), y = rng.int(4, H - h - 5);
    let ok = true;
    for (let yy = y; yy < y + h && ok; yy++) for (let xx = x; xx < x + w && ok; xx++) if (!z.floor[z.idx(xx, yy)]) ok = false;
    if (ok) return [x, y, w, h];
  }
  return null;
}

// ---------------------------------------------------------------- holes and weird rooms in the older zones
const STAMPS: Record<string, (c: Ctx) => void> = {
  lobby: (c) => {
    const { z, b, rng } = c;
    const p = findOpenRect(z, 4, 4, rng, 800, 2);
    if (p) {
      pit(c, p[0] + 2, p[1] + 2, 1.9, { to: deeperFloor('lobby', 0), shared: true, label: 'Jump into the hole in the carpet' }, 'vx_lobby_hole');
      arrive(b, 'vx_return', p[0] + 2, p[1] + 5, 'n', 1);
    } else {
      const q = findOpenRect(z, 1, 1, rng, 800, 1);
      arrive(b, 'vx_return', q ? q[0] : 80, q ? q[1] : 80, 'n', 1);
    }
    const s = findOpenRect(z, 8, 10, rng, 800, 1);
    if (s) stairsToNowhere(c, s[0] + 1, s[1] + 8, 'n', 8, 3);
  },
  undercroft: (c) => {
    const { z, rng } = c;
    const p = findOpenRect(z, 14, 20, rng, 900, 2);
    if (!p) return;
    const [x0, y0] = p, x1 = x0 + 13, y1 = y0 + 19;
    giantStairs(c, x0, y0, x1, y1, x0 + 4, y1, { path: [['n', 11], ['e', 4], ['n', 3]], width: 3, rise: 6, top: 'hole', hole: { to: 'chess', label: 'At the top of the stairs: a hole, and a ticking down there' }, holeId: 'vx_under_chess' });
  },
  fields: (c) => {
    const p = findOpenRect(c.z, 4, 4, c.rng, 900, 2);
    if (p) pit(c, p[0] + 2, p[1] + 2, 1.9, { to: 'meadow', label: 'The grass at the bottom of this hole is greener' }, 'vx_fields_meadow');
  },
  lab: (c) => {
    const p = findOpenRect(c.z, 4, 4, c.rng, 900, 1);
    if (p) pit(c, p[0] + 2, p[1] + 2, 1.7, { to: 'moon', label: 'Cold air comes up out of this hole. There are stars in it.' }, 'vx_lab_moon');
  },
  showroom: (c) => {
    const p = findOpenRect(c.z, 18, 20, c.rng, 900, 1);
    if (p) scaleHall(c, p[0] + 1, p[1] + 1, p[0] + 16, p[1] + 18, { floor: 'wood', wall: 'drywall', hole: { to: deeperFloor('showroom', 4), shared: true }, holeId: 'vx_show_hole' });
  },
};
onZoneGenerated((z, seed) => {
  const fn = STAMPS[z.key];
  if (!fn) return;
  const rng = new Rng(hash3(seed, 9061, 1));
  const b = new ZoneBuilder(z, rng);
  try { fn({ z, b, f: new Furnisher(b, rng), rng, seed }); } catch (e) { console.error('vx stamp', z.key, e); }
});

defZoneFamily('floor~', (key) => ({
  key, name: `Sublevel ${floorNum(key)}`, W, H, depth: 3,
  blurb: 'A floor under the floor. Built from a number.',
  gen: (z, s) => { generateFloor(z, s); },
}));
void defZone; void put;
