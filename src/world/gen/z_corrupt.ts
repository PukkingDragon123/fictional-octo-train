// Unrendered (128×128, depth 5): the simulation coming apart. Islands of
// every other region float in a black void, stitched to each other by narrow
// seams made of whatever floor was nearest.
//   the Quilt: a misaligned patchwork of 8×8 fragments (lobby carpet next to
//      pool tile next to lawn, at different heights, walls at half height or
//      missing, holes in the floor, furniture drifting a metre up); six of
//      the patches cannot decide what they are and change while unwatched
//   the Cinema (screen 6, arrival from the mall) and Landing 13 (arrival from
//      the stairwell), each on its own island
//   the Hallway: the same bedroom five times, each copy less finished
//   the Corridor: an office corridor with a field in the middle of it, which
//      loops; one gap in its wall leads back out
//   the Office That Is Not There: an ordinary office and conference room C,
//      floating, perfectly tidy, at the end of a bridge of static. The root
//      key is on the desk.
// Two freestanding doors cut between the quilt and the office.
import { defZone } from '../worldGraph';
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { floorId, wallId } from '../defs';
import { registerShift } from '../shift';
import { connectRegions } from './connect';
import { itemAt } from './meridian_kit';
import { Regions, Rect, rect, inRect, mount, decalAt, stencil, arrow, anchorAt, scatterLoot, put, liftWallObjects, settleVoidHeights, BACK, FACE, Rot, Side } from './deep_kit';

type Frag = 'lobby' | 'office' | 'pool' | 'fields' | 'house' | 'kids' | 'school' | 'hospital' | 'mall' | 'parking' | 'server' | 'market' | 'street' | 'stair' | 'void' | 'glitch' | 'unloaded';
interface FragDef { floor: string; wall: string; paper: string; light: 'fluoro' | 'bulb' | 'sky' | 'sodium' | 'screen' | 'neon'; outdoor?: boolean; props: [string, number][]; decals?: [string, number][]; tint?: number }
const FR: Record<Frag, FragDef> = {
  lobby: { floor: 'carpet_yellow', wall: 'drywall', paper: 'wall_yellow', light: 'fluoro', props: [['chair_office', 4], ['water_cooler', 1], ['cardboard_box', 2], ['filing_cabinet', 1], ['plant_potted', 1], ['trash_can', 1]], decals: [['decal_stain_water', 3], ['decal_mold', 1]] },
  office: { floor: 'carpet_office', wall: 'drywall', paper: 'wall_office', light: 'fluoro', props: [['desk_cubicle', 3], ['chair_office', 4], ['filing_cabinet', 2], ['copier', 1], ['plant_tall', 1], ['water_cooler', 1]] },
  pool: { floor: 'tile_pool', wall: 'tile', paper: 'wall_pool', light: 'sky', props: [['pool_lounger', 3], ['column_round', 2], ['float_ring', 2], ['towel_stack', 1], ['lifeguard_chair', 0.5]], decals: [['decal_puddle', 3]] },
  fields: { floor: 'grass_dream', wall: 'fence_wood', paper: '', light: 'sky', outdoor: true, props: [['flowers', 5], ['grass_tall', 5], ['bush', 2], ['hay_bale', 1], ['kennel', 0.5], ['power_pole', 0.5], ['scarecrow', 0.3]], decals: [['decal_leaves', 2]] },
  house: { floor: 'wood', wall: 'drywall', paper: 'wall_house_floral', light: 'bulb', props: [['sofa', 2], ['armchair', 2], ['tv_crt', 1], ['lamp_floor', 2], ['bookshelf', 1], ['coffee_table', 1], ['piano', 0.5]] },
  kids: { floor: 'carpet_kids', wall: 'drywall', paper: 'wall_kids', light: 'bulb', props: [['bed_single', 1], ['toy_box', 2], ['rocking_horse', 1], ['dollhouse', 1], ['teddy_giant', 1], ['crib', 1]] },
  school: { floor: 'linoleum_school', wall: 'cinder', paper: 'wall_school', light: 'fluoro', props: [['desk_school', 8], ['teacher_desk', 1], ['locker', 2]] },
  hospital: { floor: 'linoleum_green', wall: 'drywall', paper: 'wall_hospital', light: 'fluoro', props: [['bed_hospital', 3], ['iv_stand', 2], ['curtain_screen', 2], ['wheelchair', 1], ['gurney', 1], ['hospital_monitor', 1]] },
  mall: { floor: 'terrazzo', wall: 'drywall', paper: 'wall_mall', light: 'fluoro', props: [['bench', 2], ['planter_box', 2], ['gumball_machine', 1], ['coin_ride', 1], ['mannequin', 2]] },
  parking: { floor: 'parking', wall: 'concrete', paper: 'wall_garage', light: 'sodium', props: [['parking_barrier', 2], ['traffic_cone', 3], ['bollard', 2], ['pay_station', 1]], decals: [['decal_stain_dark', 2], ['decal_crack', 1]] },
  server: { floor: 'server', wall: 'server', paper: 'wall_server', light: 'screen', props: [['server_rack', 8], ['tape_mainframe', 1], ['crt_bank', 1]] },
  market: { floor: 'linoleum', wall: 'drywall', paper: 'wall_supermarket', light: 'fluoro', props: [['shelf_store', 4], ['shopping_cart', 2], ['freezer_display', 1]] },
  street: { floor: 'asphalt', wall: 'brick', paper: 'wall_brick', light: 'sodium', outdoor: true, props: [['mailbox_house', 1], ['fire_hydrant', 1], ['bench_park', 1], ['tree_oak', 1], ['newspaper_box', 1], ['trash_can_outdoor', 1]], decals: [['decal_leaves', 2], ['decal_crack', 1]] },
  stair: { floor: 'concrete', wall: 'cinder', paper: 'wall_cinder', light: 'bulb', props: [['chair_folding', 2], ['cardboard_box', 1]] },
  void: { floor: 'void', wall: 'glitch', paper: 'wall_corrupt', light: 'neon', props: [['glitch_monolith', 2], ['tv_static', 1]] },
  glitch: { floor: 'glitch', wall: 'glitch', paper: 'wall_corrupt', light: 'neon', props: [['glitch_monolith', 1], ['tv_static', 1], ['chair_office', 2]], decals: [['decal_glitch', 4]] },
  unloaded: { floor: 'concrete', wall: 'drywall', paper: 'zg_wall_unloaded', light: 'fluoro', tint: 0xa8a8a8, props: [['chair_office', 3], ['desk_office', 1], ['filing_cabinet', 2], ['water_cooler', 1]] },
};
const QUILT_TYPES: [Frag, number][] = [['lobby', 3], ['office', 2], ['pool', 2], ['fields', 2], ['house', 1.5], ['kids', 1], ['school', 1.5], ['hospital', 1.5], ['mall', 1.5], ['parking', 1.5], ['server', 1], ['market', 1], ['street', 1], ['stair', 0.6], ['void', 0.8], ['glitch', 1], ['unloaded', 1.2]];
const C_Q = 1, C_ISL = 2, C_CUST = 3;
const QX = 30, QY = 40, PW = 8, PH = 8, COLS = 8, ROWS = 6;
const CUST_H = 1.2;

interface Patch { r: number; c: number; rc: Rect; type: Frag; h: number; missing: boolean; shift: boolean; hole: Rect | null; id: number; attach: boolean }

/** ceiling fixture whose light follows the floor height */
function fixture(b: ZoneBuilder, key: 'light_fluoro' | 'light_bulb', x: number, y: number, circuit: number, o: { flicker?: number; broken?: boolean } = {}) {
  const n = b.z.lights.length;
  const ob = b.obj(key, x, y, 0, { circuit, flicker: o.flicker ?? 0, broken: o.broken ?? false });
  const h = b.z.heightAt(x, y);
  if (ob && b.z.lights.length > n && h) b.z.lights[b.z.lights.length - 1].y += h;
  return ob;
}

/** a fragment of somewhere else: floor, wallpaper, props (some adrift), light. Stamps pass stamp=true (no decals/items). */
function furnishFrag(b: ZoneBuilder, rng: Rng, type: Frag, r: Rect, h: number, stamp: boolean, hole: Rect | null = null) {
  const z = b.z, d = FR[type];
  const f = new Furnisher(b, rng);
  b.fillFloor(r.x0, r.y0, r.x1, r.y1, d.floor, h);
  if (hole) for (let y = hole.y0; y <= hole.y1; y++) for (let x = hole.x0; x <= hole.x1; x++) z.floor[z.idx(x, y)] = 0;
  if (d.paper) b.paper(r.x0, r.y0, r.x1, r.y1, d.paper);
  b.flag(r.x0, r.y0, r.x1, r.y1, TF.OUTDOOR, !!d.outdoor);
  if (type === 'pool') b.fillFloor(r.x0 + 2, r.y0 + 2, r.x1 - 2, r.y1 - 2, 'water_shallow', h - 0.3);
  if (type === 'street') { b.fillFloor(r.x0, r.y0, r.x1, r.y0 + 1, 'sidewalk', h + 0.1); }
  const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
  const inner = (x: number, y: number) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;
  // props: the furniture of that place, a third of it adrift
  const n = type === 'school' ? 0 : rng.int(3, 6);
  for (let k = 0; k < n; k++) {
    const key = rng.weighted(d.props);
    const x = rng.int(r.x0 + 1, r.x1 - 1), y = rng.int(r.y0 + 1, r.y1 - 1);
    const float = rng.chance(0.33);
    const st: Record<string, any> = { yaw: rng.chance(0.6) ? rng.float(-0.8, 0.8) : 0 };
    if (float) st.y = rng.float(0.5, 2.2);
    if (!z.floor[z.idx(x, y)]) { st.y = (st.y ?? 0) + rng.float(-0.4, 1.5); b.obj(key, x, y, rng.int(0, 3) as Rot, st, d.tint ? { tint: d.tint } : {}); continue; }
    const o = f.place(key, x, y, rng.int(0, 3) as Rot, st);
    if (o && d.tint) o.tint = d.tint;
  }
  if (type === 'school') {
    // rows of desks facing a wall that is not there
    for (let y = r.y0 + 2; y <= r.y1 - 1; y += 2) for (let x = r.x0 + 1; x <= r.x1 - 1; x += 2) if (inner(x, y)) f.place('desk_school', x, y, FACE.n, rng.chance(0.15) ? { y: rng.float(0.4, 1.4) } : {});
    f.place('teacher_desk', cx - 1, r.y0, FACE.s, {});
  }
  if (type === 'server') for (let y = r.y0 + 1; y <= r.y1 - 1; y++) if (y !== cy) { f.place('server_rack', r.x0 + 2, y, FACE.e, {}); f.place('server_rack', r.x1 - 2, y, FACE.w, {}); }
  if (type === 'stair') for (let y = r.y0 + 2; y <= r.y0 + 5; y++) for (let x = cx - 1; x <= cx; x++) { b.obj('zg_stair_flight', x, y, 0, {}); z.height[z.idx(x, y)] = Math.round((h - (y - r.y0 - 1) * 0.25) * 10); }
  // light
  const circ = C_Q;
  const fl = rng.chance(0.4) ? rng.float(0.2, 0.6) : 0;
  switch (d.light) {
    case 'fluoro': fixture(b, 'light_fluoro', cx, cy, circ, { flicker: fl, broken: rng.chance(0.2) }); if (rng.chance(0.5)) fixture(b, 'light_fluoro', r.x0 + 1, r.y0 + 1, circ, { flicker: 0.4 }); break;
    case 'bulb': fixture(b, 'light_bulb', cx, cy, circ, { flicker: fl }); break;
    case 'sky': b.light(cx + 0.5, cy + 0.5, 'sky', { color: type === 'pool' ? 0xbfeaff : 0xffe2b0, intensity: 0.7, radius: 7, y: h + 3, circuit: 0, flicker: fl * 0.3 }); break;
    case 'sodium': b.light(cx + 0.5, cy + 0.5, 'sodium', { intensity: 0.9, radius: 7, y: h + 3.5, circuit: circ, flicker: fl }); break;
    case 'screen': b.light(cx + 0.5, cy + 0.5, 'screen', { color: 0x3a64ff, intensity: 0.6, radius: 6, y: h + 2.3, circuit: circ }); break;
    case 'neon': b.light(cx + 0.5, cy + 0.5, 'neon', { color: rng.pick([0xff40d0, 0x40e8ff, 0xb040ff]), intensity: 0.7, radius: 6, y: h + 2.2, circuit: 0, flicker: 0.5 }); break;
  }
  if (stamp) return;
  // dressing only on the first build
  if (d.decals) for (let k = 0; k < 5; k++) f.decal(rng.weighted(d.decals), rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), rng.float(0.8, 1.6), rng.float(0.8, 1.6));
  if (type === 'unloaded') for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (z.floor[z.idx(x, y)] && ((x * 7 + y * 3) % 5 !== 0)) decalAt(z, 'zg_unloaded', x + 0.5, y + 0.5, 1.0, 1.0, 0, undefined, undefined, 0.02);
  if (type === 'parking') for (let x = r.x0 + 1; x <= r.x1; x += 3) decalAt(z, 'decal_parking_line', x, cy + 0.5, 3, 0.12, Math.PI / 2, 0xe8e8e0);
  for (let k = 0; k < 2; k++) f.decal('decal_glitch', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), rng.float(0.6, 1.4), rng.float(0.6, 1.4));
}

function generateCorrupt(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const R = new Regions(z);
  z.name = 'Unrendered';
  const W = z.W, H = z.H;
  const bridgeIds = new Set<number>();
  const wallOf = new Map<number, string>();

  // =====================================================================
  // THE QUILT
  // =====================================================================
  const P: Patch[] = [];
  const at = (r: number, c: number) => P.find((p) => p.r === r && p.c === c)!;
  const ATTACH: [number, number][] = [[2, 0], [5, 0], [5, 7], [2, 7], [0, 3]];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x0 = QX + c * PW + (r % 2) * 4, y0 = QY + r * PH;
    let type = rng.weighted(QUILT_TYPES);
    const left = P.find((p) => p.r === r && p.c === c - 1);
    if (left && left.type === type) type = rng.weighted(QUILT_TYPES);
    const attach = ATTACH.some(([ar, ac]) => ar === r && ac === c);
    P.push({ r, c, rc: rect(x0, y0, x0 + PW - 1, y0 + PH - 1), type, h: attach ? 0 : rng.pick([-0.9, -0.5, -0.2, 0, 0, 0, 0.3, 0.6, 1.0]), missing: false, shift: false, hole: null, id: R.next(), attach });
  }
  const adjacent = (a: Patch, c: Patch) => {
    const ox = Math.min(a.rc.x1, c.rc.x1) - Math.max(a.rc.x0, c.rc.x0) + 1, oy = Math.min(a.rc.y1, c.rc.y1) - Math.max(a.rc.y0, c.rc.y0) + 1;
    return (ox >= 2 && (a.rc.y1 + 1 === c.rc.y0 || c.rc.y1 + 1 === a.rc.y0)) || (oy >= 2 && (a.rc.x1 + 1 === c.rc.x0 || c.rc.x1 + 1 === a.rc.x0));
  };
  const connected = () => {
    const live = P.filter((p) => !p.missing);
    const seen = new Set([live[0]]); const q = [live[0]];
    while (q.length) { const p = q.pop()!; for (const o of live) if (!seen.has(o) && adjacent(p, o)) { seen.add(o); q.push(o); } }
    return seen.size === live.length;
  };
  // knock out a few patches entirely (the void shows through)
  for (let t = 0, k = 0; t < 40 && k < 6; t++) {
    const p = rng.pick(P);
    if (p.attach || p.missing || (p.r === 3 && p.c === 3)) continue;
    p.missing = true;
    if (!connected()) { p.missing = false; continue; }
    k++;
  }
  // the heart of the quilt is a lobby room: everyone arrives there eventually
  const heart = at(3, 3); heart.type = 'lobby'; heart.h = 0;
  // six patches cannot make up their mind
  for (let t = 0, k = 0; t < 60 && k < 6; t++) {
    const p = rng.pick(P);
    if (p.attach || p.missing || p.shift || p === heart) continue;
    p.shift = true; k++;
  }
  for (const p of P) if (!p.missing && !p.shift && !p.attach && p !== heart && rng.chance(0.3)) {
    const w = rng.int(2, 3), hh = rng.int(2, 3);
    const x0 = rng.int(p.rc.x0 + 2, p.rc.x1 - 1 - w), y0 = rng.int(p.rc.y0 + 2, p.rc.y1 - 1 - hh);
    p.hole = rect(x0, y0, x0 + w - 1, y0 + hh - 1);
  }
  for (const p of P) if (!p.missing) {
    R.paint(p.rc.x0, p.rc.y0, p.rc.x1, p.rc.y1, p.id);
    b.fillFloor(p.rc.x0, p.rc.y0, p.rc.x1, p.rc.y1, FR[p.type].floor, p.h);
    if (p.hole) for (let y = p.hole.y0; y <= p.hole.y1; y++) for (let x = p.hole.x0; x <= p.hole.x1; x++) { R.id[z.idx(x, y)] = 0; z.floor[z.idx(x, y)] = 0; }
    wallOf.set(p.id, FR[p.type].wall);
  }
  // intruders: fragments that loaded in the wrong place, straddling the seams at odd offsets
  const intruders: Patch[] = [];
  const blockedFor = (r: Rect) => P.some((p) => (p.shift || p === heart) && !(r.x1 < p.rc.x0 - 1 || r.x0 > p.rc.x1 + 1 || r.y1 < p.rc.y0 - 1 || r.y0 > p.rc.y1 + 1))
    || intruders.some((q) => !(r.x1 < q.rc.x0 - 2 || r.x0 > q.rc.x1 + 2 || r.y1 < q.rc.y0 - 2 || r.y0 > q.rc.y1 + 2));
  for (let t = 0; t < 200 && intruders.length < 7; t++) {
    const w = rng.int(5, 9), hh = rng.int(4, 7);
    const x0 = rng.int(QX + 2, QX + COLS * PW - w), y0 = rng.int(QY + 2, QY + ROWS * PH - hh - 1);
    const r = rect(x0, y0, x0 + w - 1, y0 + hh - 1);
    if (blockedFor(r)) continue;
    // must sit across a seam, and only over floor that exists (no bridging the void)
    let ok = true, ids = new Set<number>();
    for (let y = r.y0; y <= r.y1 && ok; y++) for (let x = r.x0; x <= r.x1; x++) { const id = R.id[z.idx(x, y)]; if (!id) { ok = false; break; } ids.add(id); }
    if (!ok || ids.size < 2) continue;
    const q: Patch = { r: -1, c: intruders.length, rc: r, type: rng.weighted(QUILT_TYPES), h: rng.pick([-0.7, -0.3, 0.4, 0.8, 1.2]), missing: false, shift: false, hole: null, id: R.next(), attach: false };
    R.paint(r.x0, r.y0, r.x1, r.y1, q.id);
    b.fillFloor(r.x0, r.y0, r.x1, r.y1, FR[q.type].floor, q.h);
    wallOf.set(q.id, FR[q.type].wall);
    intruders.push(q);
  }
  P.push(...intruders);

  // =====================================================================
  // ISLANDS
  // =====================================================================
  const island = (r: Rect, floor: string, wall: string, h = 0) => { const id = R.next(); R.area(b, r.x0, r.y0, r.x1, r.y1, id, floor, h); wallOf.set(id, wall); return id; };
  // the cinema (screen 6), arrival from the mall
  const CIN = rect(6, 96, 23, 113);
  const ID_CIN = island(CIN, 'carpet_red', 'drywall');
  // landing 13, arrival from the stairwell
  const L13 = rect(104, 100, 117, 109);
  const ID_L13 = island(L13, 'concrete', 'cinder', -0.3);
  // the hallway of repeated rooms
  const HALL = rect(18, 30, 20, 86);
  const ID_HALL = island(HALL, 'wood', 'drywall');
  const BED: Rect[] = [31, 41, 51, 61, 71].map((y) => rect(8, y, 17, y + 8));
  const ID_BED = BED.map((r, k) => island(r, k === 3 ? 'glitch' : 'carpet_kids', k >= 3 ? 'glitch' : 'drywall'));
  // the corridor with a field in it (loops)
  const FC = rect(106, 28, 110, 95);
  const ID_FC = island(FC, 'carpet_office', 'drywall');
  // the office that is not there + conference room C, on a floating floor
  const CCOR = rect(44, 22, 73, 24), COFF = rect(58, 9, 71, 21), CONF = rect(44, 11, 55, 21);
  const ID_CCOR = island(CCOR, 'carpet_office', 'drywall', CUST_H);
  const ID_COFF = island(COFF, 'carpet_office', 'drywall', CUST_H);
  const ID_CONF = island(CONF, 'carpet_office', 'drywall', CUST_H);

  // =====================================================================
  // SEAMS: bridges made of whatever floor was nearest
  // =====================================================================
  const SEAM = ['void', 'glitch', 'carpet_yellow', 'tile_pool', 'grass_dream', 'asphalt', 'linoleum_school', 'void', 'terrazzo', 'wood', 'glitch'];
  const bridge = (pts: [number, number][], h0: number, h1: number, floors: string[] = SEAM, w = 2, seg = 3) => {
    const id = R.next(); bridgeIds.add(id);
    const tiles: [number, number][] = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
      for (let x = ax, y = ay; ; x += dx, y += dy) { tiles.push([x, y]); if (x === bx && y === by) break; }
    }
    const total = tiles.length;
    tiles.forEach(([x, y], t) => {
      const h = h0 + (h1 - h0) * (t / Math.max(1, total - 1));
      const fl = floors[Math.floor(t / seg) % floors.length];
      for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
        const X = x + i, Y = y + j;
        if (!z.inb(X, Y) || (R.id[z.idx(X, Y)] && !bridgeIds.has(R.id[z.idx(X, Y)]))) continue;
        R.id[z.idx(X, Y)] = id;
        b.fillFloor(X, Y, X, Y, fl, Math.round(h * 10) / 10);
      }
    });
    return id;
  };
  bridge([[21, 58], [29, 58]], 0, 0, ['wood', 'wood', 'carpet_yellow', 'void']);                     // hallway -> quilt (2,0)
  bridge([[22, 95], [22, 84], [32, 84]], 0, 0, ['carpet_red', 'terrazzo', 'terrazzo', 'glitch', 'carpet_yellow']); // cinema -> quilt (5,0)
  bridge([[102, 104], [96, 104], [96, 88]], -0.3, 0, ['concrete', 'parking', 'void', 'concrete', 'glitch']);   // landing 13 -> quilt (5,7)
  bridge([[94, 60], [104, 60]], 0, 0, ['grass_dream', 'carpet_office', 'grass_dream', 'void']);        // quilt (2,7) -> the field corridor
  bridge([[58, 25], [58, 32], [52, 32], [52, 34], [58, 34], [58, 38]], CUST_H, 0, ['void', 'void', 'glitch', 'void'], 2, 2); // static, down from the office
  // the far ends of the quilt seams that land on missing patches: give them a floor to stand on
  const join = (a: number, c: number) => bridgeIds.has(a) || bridgeIds.has(c);
  const prio = (id: number) => (id === 0 ? -1 : bridgeIds.has(id) ? 0 : 1);
  R.build(b, join, (a, c) => wallOf.get(prio(a) >= prio(c) ? a : c) ?? 'drywall');

  // ---------------------------------------------------------------- the quilt's seams: some open, some half, some missing
  const pairs = new Map<string, [number, number, 0 | 1][]>();
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const a = R.id[z.idx(x, y)];
    for (const side of [0, 1] as const) {
      const c = side === 0 ? R.id[z.idx(x, y - 1)] : R.id[z.idx(x - 1, y)];
      if (a === c) continue;
      const pa = P.find((p) => p.id === a && !p.missing), pc = P.find((p) => p.id === c && !p.missing);
      if (!pa && !pc) continue;
      if ((a && !pa) || (c && !pc)) continue; // patch vs island/bridge: handled by the build
      const k = pa && pc ? `${Math.min(a, c)}-${Math.max(a, c)}` : `${pa ? a : c}-0`;
      let l = pairs.get(k); if (!l) { l = []; pairs.set(k, l); }
      l.push([x, y, side]);
    }
  }
  const setEdgeWall = (x: number, y: number, side: 0 | 1, key: string | null) => {
    if (key === null) { if (side === 0) b.clearN(x, y); else b.clearW(x, y); return; }
    if (side === 0) b.hwall(x, x, y, key); else b.vwall(x, y, y, key);
  };
  const LOW = ['low_concrete', 'railing', 'fence_wood', 'hedge', 'cubicle', 'fence_chain'];
  for (const [k, edges] of pairs) {
    const toVoid = k.endsWith('-0');
    edges.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    if (toVoid) {
      const s = rng.next();
      if (s < 0.45) for (const [x, y, sd] of edges) setEdgeWall(x, y, sd, null);                        // a ledge
      else if (s < 0.8) for (const [x, y, sd] of edges) { if (rng.chance(0.35)) setEdgeWall(x, y, sd, null); else if (rng.chance(0.1)) setEdgeWall(x, y, sd, 'glitch'); }
      continue;
    }
    const s = rng.next(), m = Math.floor(edges.length / 2);
    if (s < 0.3) for (const [x, y, sd] of edges) setEdgeWall(x, y, sd, null);
    else if (s < 0.6) { for (let i = Math.max(0, m - 1); i <= Math.min(edges.length - 1, m + 1); i++) setEdgeWall(edges[i][0], edges[i][1], edges[i][2], null); }
    else if (s < 0.85) { const lw = rng.pick(LOW); for (const [x, y, sd] of edges) setEdgeWall(x, y, sd, lw); setEdgeWall(edges[m][0], edges[m][1], edges[m][2], null); if (edges.length > 4) setEdgeWall(edges[m - 2][0], edges[m - 2][1], edges[m - 2][2], null); }
    else { const [x, y, sd] = edges[m]; b.door(x, y, sd, rng.pick(['door_office', 'door_wood', 'door_house', 'door_school', 'door_hospital', 'door_red']), { open: rng.chance(0.5) }); }
    for (const [x, y, sd] of edges) if (rng.chance(0.06) && !z.edge(x, y, sd)) setEdgeWall(x, y, sd, 'glitch');
  }

  // ---------------------------------------------------------------- quilt contents
  b.addRoom('Unrendered', 'void', 0, 0, W - 1, H - 1, { circuit: C_Q, temp: 12 });
  for (const p of P) {
    if (p.missing) continue;
    const name = { lobby: 'Somewhere Yellow', office: 'An Office', pool: 'A Pool', fields: 'A Field', house: 'A Living Room', kids: 'A Bedroom', school: 'A Classroom', hospital: 'A Ward', mall: 'A Mall', parking: 'A Car Park', server: 'A Server Room', market: 'An Aisle', street: 'A Street', stair: 'A Landing', void: 'Nothing', glitch: '???', unloaded: 'Not Loaded Yet' }[p.type];
    b.addRoom(p.shift ? 'Somewhere' : name, 'fragment', p.rc.x0, p.rc.y0, p.rc.x1, p.rc.y1, { circuit: C_Q, temp: 12, outdoor: !!FR[p.type].outdoor });
    if (p.shift) {
      const opts = rng.shuffle(QUILT_TYPES.map((q) => q[0]).filter((q) => q !== p.type)).slice(0, 3);
      const variants: Frag[] = [p.type, ...opts];
      const hs = [p.h, rng.pick([-0.6, 0, 0.4]), rng.pick([-0.3, 0.3, 0.8]), 0];
      registerShift(z, `cq_patch_${p.r}_${p.c}`, p.rc.x0, p.rc.y0, p.rc.x1, p.rc.y1, 4, (sb, srng, v) => furnishFrag(sb, srng, variants[v], p.rc, hs[v], true));
    } else {
      if (p.r < 0) { b.clearObjects(p.rc.x0, p.rc.y0, p.rc.x1, p.rc.y1); z.lights = z.lights.filter((l) => !inRect(p.rc, Math.floor(l.x), Math.floor(l.z))); }
      furnishFrag(b, rng, p.type, p.rc, p.h, false, p.hole);
    }
    // things adrift over the holes
    if (p.hole) {
      const hx = p.hole.x0, hy = p.hole.y0;
      b.obj(rng.pick(['chair_office', 'fridge', 'door_freestanding', 'lamp_floor', 'wardrobe', 'bed_single']), hx, hy, rng.int(0, 3) as Rot, { y: rng.float(-0.5, 1.5), yaw: rng.float(-1, 1) });
    }
  }
  // the heart: a lobby room with a door that should not be here
  {
    const r = heart.rc, cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
    b.clearObjects(cx - 1, cy - 1, cx + 1, cy + 1);
    b.obj('door_freestanding', cx, cy - 1, 0, { portal: 'cq_door_cust' });
    b.portal({ id: 'cq_door_cust', x: cx, y: cy - 1, kind: 'door', to: 'corrupt', tx: 50, ty: 23, label: 'Open the door', anchor: 'cust_hall' });
    anchorAt(b, 'quilt_heart', cx, cy + 1, 's', 2);
    stencil(z, 'TIDY', cx + 0.5, cy + 2.6, 1.6, 0, 0xc83a2a);
  }

  // =====================================================================
  // THE CINEMA — screen 6
  // =====================================================================
  {
    const r = CIN;                       // 6..23 × 96..113
    b.addRoom('Screen 6', 'cinema', r.x0, r.y0, r.x1, r.y1, { circuit: C_ISL, temp: 14 });
    b.paper(r.x0, r.y0, r.x1, r.y1, 'wall_hotel');
    b.obj('zg_cinema_screen', 10, r.y0, 0, {});
    b.fillFloor(r.x0, r.y0, r.x1, r.y0 + 2, 'carpet_hotel');
    for (let y = r.y0 + 4; y <= r.y1 - 2; y += 2) for (const x of [8, 11, 16, 19]) {
      const drift = y > r.y0 + 10 && x === 19 ? { y: rng.float(0.3, 1.6), yaw: rng.float(-0.6, 0.6) } : {};
      put(f, 'waiting_chairs', x, y, FACE.n, drift);
    }
    // the exit back into the mall
    b.door(r.x0, 110, 1, 'door_metal', { portal: 'r_mall_cinema', sign: 'exit' });
    b.portal({ id: 'r_mall_cinema', x: r.x0, y: 110, kind: 'door', to: 'mall', tx: 96, ty: 80, label: 'Go back through the exit' });
    anchorAt(b, 'p_mall_cinema', r.x0 + 2, 110, 'e', 3);
    mount(b, 'exit_sign', r.x0, 109, 'w');
    // the east wall never finished loading
    for (let y = r.y0 + 6; y <= r.y1; y++) if (rng.chance(0.6)) b.clearW(r.x1 + 1, y);
    for (let y = r.y0 + 8; y <= r.y1; y += 3) b.obj('waiting_chairs', r.x1 + 2, y, FACE.n, { y: rng.float(-0.8, 1.2), yaw: rng.float(-0.8, 0.8) });
    for (let x = r.x0 + 1; x <= r.x1 - 1; x += 4) b.light(x + 0.5, r.y1 - 0.5, 'emergency', { circuit: 0, intensity: 0.35, radius: 3, flicker: 0.1 });
    for (let k = 0; k < 8; k++) f.decal(rng.pick(['decal_stain_dark', 'decal_trash', 'decal_glitch']), rng.int(r.x0, r.x1), rng.int(r.y0 + 3, r.y1), 0.9, 0.9);
    f.floorItem('soda_can_empty', 13, 105); f.floorItem('paper', 9, 107); f.floorItem('candy_bar', 17, 109);
  }

  // =====================================================================
  // LANDING 13
  // =====================================================================
  {
    const r = L13;                       // 104..117 × 100..109, h -0.3
    b.addRoom('Landing 13', 'landing_13', r.x0, r.y0, r.x1, r.y1, { circuit: C_ISL, temp: 11 });
    b.paper(r.x0, r.y0, r.x1, r.y1, 'wall_cinder');
    b.door(108, r.y0, 0, 'door_metal', { portal: 'r_stair_13', sign: 'danger' });
    b.portal({ id: 'r_stair_13', x: 108, y: r.y0, kind: 'door', to: 'stairwell', tx: 6, ty: 40, label: 'Go back through the door marked 13' });
    anchorAt(b, 'p_stair_13', 108, r.y0 + 2, 's', 3);
    mount(b, 'zg_level_sign', 110, r.y0, 'n', { label: '13' });
    mount(b, 'exit_sign', 108, r.y0, 'n');
    mount(b, 'zg_wall_scrawl', 112, r.y0, 'n', { v: 3 });
    // the west wall is missing: the landing opens straight onto the seam
    for (let y = r.y0 + 2; y <= r.y1; y++) b.clearW(r.x0, y);
    // a flight down that goes nowhere
    for (let k = 0; k < 7; k++) for (let x = 114; x <= 115; x++) {
      const y = r.y1 - 6 + k;
      b.obj('zg_stair_flight', x, y, 0, {});
      z.height[z.idx(x, y)] = Math.round((-0.3 - k * 0.3) * 10);
    }
    b.clearN(114, r.y1 + 1); b.clearN(115, r.y1 + 1);
    fixture(b, 'light_bulb', 109, r.y0 + 3, C_ISL, { flicker: 0.5 });
    b.light(105.5, 103.5, 'emergency', { circuit: 0, intensity: 0.5, radius: 5, flicker: 0.2, y: 2.1 });
    put(f, 'chair_folding', 111, 105, 3, { yaw: 0.4 });
    for (let k = 0; k < 6; k++) f.decal(rng.pick(['decal_glitch', 'decal_stain_dark', 'decal_crack']), rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), 1.2, 1.2);
  }

  // =====================================================================
  // THE HALLWAY — the same bedroom five times
  // =====================================================================
  {
    const hr = HALL;
    b.addRoom('Hallway', 'hallway', hr.x0, hr.y0, hr.x1, hr.y1, { circuit: C_ISL, temp: 18 });
    b.paper(hr.x0, hr.y0, hr.x1, hr.y1, 'wall_house_stripe');
    b.fillFloor(19, hr.y0, 19, hr.y1, 'carpet_red');
    for (let y = hr.y0 + 1; y <= hr.y1 - 1; y += 4) fixture(b, 'light_bulb', 19, y, C_ISL, { flicker: y > 70 ? 0.4 : 0, broken: y > 80 });
    BED.forEach((r, k) => {
      const dy = r.y0 + 4;
      b.door(hr.x0, dy, 1, k === 4 ? 'door_white' : 'door_house', { open: k >= 3 });
      b.addRoom(k === 0 ? 'Mia\'s Room' : k < 3 ? 'Mia\'s Room?' : '???', 'bedroom', r.x0, r.y0, r.x1, r.y1, { circuit: C_ISL, temp: 19 - k * 2 });
      b.paper(r.x0, r.y0, r.x1, r.y1, k < 2 ? 'wall_kids' : k === 2 ? 'zg_wall_halfloaded' : 'wall_corrupt');
      const tint = k === 2 ? 0xa0a0a0 : k === 3 ? 0xff80e0 : undefined;
      const fl = (key: string, x: number, y: number, rot: Rot, st: Record<string, any> = {}) => { const o = (k === 1 || k === 3) && st.y ? b.obj(key, x, y, rot, st) : put(f, key, x, y, rot, st); if (o && tint) o.tint = tint; return o; };
      if (k === 4) {
        // nothing has loaded but the night light
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) z.floor[z.idx(x, y)] = 0;
        b.fillFloor(r.x0 + 4, r.y0 + 3, r.x0 + 6, r.y0 + 5, 'carpet_kids');
        b.fillFloor(r.x0 + 7, dy, r.x1, dy, 'carpet_kids');
        const ns = put(f, 'nightstand', r.x0 + 5, r.y0 + 4, 0);
        f.onTop('lamp_table', ns, { circuit: 0 });
        b.light(r.x0 + 5.5, r.y0 + 4.5, 'lamp', { color: 0xffd8a0, intensity: 0.7, radius: 4, y: 1.0, circuit: 0, flicker: 0.05 });
        f.floorItem('photo_old', r.x0 + 4, r.y0 + 5);
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!z.floor[z.idx(x, y)] && rng.chance(0.08)) b.obj(rng.pick(['toy_box', 'rocking_horse', 'teddy_giant', 'bed_single']), x, y, rng.int(0, 3) as Rot, { y: rng.float(-1, 1.5), yaw: rng.float(-1, 1) });
        return;
      }
      const fly = (v: number) => (k === 1 || k === 3 ? { y: v, yaw: rng.float(-0.5, 0.5) } : {});
      fl('bed_single', r.x0 + 1, r.y0 + 1, 0, fly(0.9));
      const ns = fl('nightstand', r.x0 + 2, r.y0, 0);
      if (ns && !(k === 1 || k === 3)) f.onTop('lamp_table', ns, { circuit: C_ISL });
      fl('toy_box', r.x1 - 1, r.y1, FACE.n, fly(1.4));
      fl('dresser', r.x1, r.y0, 0, { loot: 'kids_room' });
      fl('rocking_horse', r.x0 + 4, r.y1 - 1, 1, fly(0.6));
      fl('dollhouse', r.x1 - 3, r.y0, 0, fly(1.8));
      mount(b, 'photo_frames', r.x0 + 6, r.y0, 'n', { v: 2, blank: k >= 2 });
      fixture(b, 'light_bulb', r.x0 + 5, r.y0 + 4, C_ISL, { flicker: k * 0.12 });
      if (k === 3) b.light(r.x0 + 5.5, r.y0 + 4.5, 'neon', { color: 0xff40d0, intensity: 0.6, radius: 5, y: 2.2, circuit: 0, flicker: 0.6 });
      decalAt(z, 'carpet_rug', r.x0 + 5.5, r.y0 + 4.5, 3, 2.4, 0, k === 2 ? 0x9a9a9a : 0xe0a0b8);
      if (k === 2) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0 + 5; x <= r.x1; x++) decalAt(z, 'zg_unloaded', x + 0.5, y + 0.5, 1, 1, 0, undefined, undefined, 0.03);
      if (k === 0) { f.floorItem('teddy_bear', r.x0 + 1, r.y0 + 3); f.floorItem('crayons', r.x0 + 6, r.y0 + 5); }
    });
    for (let y = hr.y0 + 2; y <= hr.y1 - 1; y += 3) if (!BED.some((r) => y === r.y0 + 4)) mount(b, 'photo_frames', hr.x0, y, 'w', { v: y % 6, blank: y > 50 });
    for (let y = hr.y1; y >= hr.y0; y -= 1.7) decalAt(z, 'decal_footprints', 19.5 + Math.sin(y * 0.7) * 0.3, y, 0.7, 0.7, -Math.PI / 2, 0x8a6a4a, 0.8);
  }

  // =====================================================================
  // THE CORRIDOR WITH A FIELD IN IT — loops every 32 tiles
  // =====================================================================
  {
    const r = FC;                        // 106..110 × 28..95
    const A = 44, B = 79, D = 32;
    b.addRoom('A Corridor', 'corridor_field', r.x0, r.y0, r.x1, r.y1, { circuit: C_ISL, temp: 20 });
    const field = (y: number) => ((y % D) + D) % D >= 16;
    for (let y = r.y0; y <= r.y1; y++) {
      const m = ((y % D) + D) % D;
      if (field(y)) {
        b.fillFloor(r.x0, y, r.x1, y, 'grass_dream');
        b.paper(r.x0, y, r.x1, y, 'wall_dream');
        b.flag(r.x0, y, r.x1, y, TF.OUTDOOR);
        if (m % 3 === 1) put(f, 'flowers', r.x0 + (m % 5), y);
        if (m % 4 === 2) put(f, 'grass_tall', r.x1 - (m % 3), y);
        if (m === 22) put(f, 'swing_set', r.x0 + 1, y, 0);
        if (m === 27) put(f, 'washing_line', r.x0 + 1, y, 0);
        if (m === 18 || m === 26) b.light(108.5, y + 0.5, 'sky', { color: 0xffe2b0, intensity: 0.8, radius: 7, y: 3, circuit: 0 });
        if (m === 30) decalAt(z, 'decal_leaves', 107.5, y + 0.5, 1.4, 1.4, 0.4);
      } else {
        b.paper(r.x0, y, r.x1, y, 'wall_office');
        if (m % 4 === 1) fixture(b, 'light_fluoro', 108, y, C_ISL, { flicker: m === 9 ? 0.2 : 0 });
        if (m === 5) put(f, 'water_cooler', r.x1, y, FACE.w);
        if (m === 12) put(f, 'plant_potted', r.x0, y, 0);
        if (m === 3) mount(b, 'painting', r.x0, y, 'w', { v: 4 });
        if (m === 10) { b.door(r.x0, y, 1, 'door_office', { locked: true, sign: 'office' }); }
        if (m === 14) mount(b, 'clock_wall', r.x0, y, 'w');
      }
    }
    for (let x = r.x0; x <= r.x1; x++) {
      b.portal({ id: `loop_cf_a${x}`, x, y: A, kind: 'loop', to: z.key, tx: x, ty: A + D, loopDy: D, hidden: true });
      b.portal({ id: `loop_cf_b${x}`, x, y: B, kind: 'loop', to: z.key, tx: x, ty: B - D, loopDy: -D, hidden: true });
    }
    f.floorItem('teddy_bear', 108, 66);
  }

  // =====================================================================
  // THE OFFICE THAT IS NOT THERE (and conference room C)
  // =====================================================================
  {
    b.addRoom('Corridor', 'corridor', CCOR.x0, CCOR.y0, CCOR.x1, CCOR.y1, { circuit: C_CUST, temp: 20 });
    b.addRoom('The Custodian\'s Office', 'custodian_office', COFF.x0, COFF.y0, COFF.x1, COFF.y1, { circuit: C_CUST, temp: 20 });
    b.addRoom('Conference Room C', 'conference', CONF.x0, CONF.y0, CONF.x1, CONF.y1, { circuit: C_CUST, temp: 20 });
    b.paper(CCOR.x0, CCOR.y0, CCOR.x1, CCOR.y1, 'wall_office'); b.paper(COFF.x0, COFF.y0, COFF.x1, COFF.y1, 'wall_office'); b.paper(CONF.x0, CONF.y0, CONF.x1, CONF.y1, 'wall_office');
    b.door(64, CCOR.y0, 0, 'door_office', { sign: 'office' });
    b.door(49, CCOR.y0, 0, 'door_office', { sign: 'office' });
    b.clearN(58, CCOR.y1 + 1); b.clearN(59, CCOR.y1 + 1);
    const H0 = CUST_H;
    const surf = (o: TileObject | null) => H0 + (o ? 0.76 : 0);
    // the office: everything square to the walls, everything in its place
    const desk = put(f, 'desk_office', 64, 12, BACK.n);
    put(f, 'chair_office', 64, 11, FACE.s);
    if (desk) {
      itemAt(z, rng, 'root_key', 64, 12, surf(desk), undefined, 0);
      itemAt(z, rng, 'note', 65, 12, surf(desk), { lore: 'custodian_memo' }, 0);
      f.onTop('computer', desk, {});
    }
    for (const x of [59, 60, 69, 70]) put(f, 'filing_cabinet', x, COFF.y0, 0, { loot: 'filing' });
    put(f, 'plant_tall', COFF.x0, COFF.y1, 0); put(f, 'plant_tall', COFF.x1, COFF.y1, 0);
    put(f, 'bookshelf', COFF.x0, 14, FACE.e); put(f, 'bookshelf', COFF.x0, 15, FACE.e);
    put(f, 'chair_office', 62, 15, FACE.n); put(f, 'chair_office', 66, 15, FACE.n);
    put(f, 'clothing_rack', COFF.x1, 13, FACE.w);
    mount(b, 'clock_wall', 64, COFF.y0, 'n'); mount(b, 'painting', 62, COFF.y0, 'n', { v: 1 }); mount(b, 'painting', 66, COFF.y0, 'n', { v: 1 });
    for (const [x, y] of [[61, 12], [67, 12], [61, 18], [67, 18]] as const) fixture(b, 'light_fluoro', x, y, C_CUST);
    decalAt(z, 'carpet_rug', 64.5, 15.5, 6, 4, 0, 0x7a8aa0);
    // conference room C: locked once, lights on, coffee for six. Daniel Hale is kept here.
    const tbl = put(f, 'conference_table', 48, 14, 0);
    for (const x of [48, 49, 50]) { put(f, 'chair_office', x, 13, FACE.s); put(f, 'chair_office', x, 16, FACE.n); }
    put(f, 'chair_office', 52, 15, FACE.e, { yaw: Math.PI * 0.9 });  // the chair at the head, turned to the wall
    if (tbl) {
      const th = H0 + 0.76;
      for (let k = 0; k < 6; k++) itemAt(z, rng, 'mug', 48 + (k % 3), 14 + Math.floor(k / 3), th, undefined, 0.3);
      itemAt(z, rng, 'note', 49, 14, th, { lore: 'corrupt_text' }, 0.1);
    }
    const ct = put(f, 'counter_kitchen', CONF.x0, CONF.y0, 0); f.onTop('coffee_maker', ct, { on: true });
    mount(b, 'whiteboard', 49, CONF.y0, 'n'); mount(b, 'zg_room_plate', 52, CONF.y0, 'n', { label: 'CONF C' });
    put(f, 'plant_potted', CONF.x1, CONF.y1, 0);
    for (const [x, y] of [[46, 14], [51, 14], [46, 19], [51, 19]] as const) fixture(b, 'light_fluoro', x, y, C_CUST);
    // the corridor
    for (let x = CCOR.x0 + 2; x <= CCOR.x1; x += 5) fixture(b, 'light_fluoro', x, 23, C_CUST);
    put(f, 'water_cooler', CCOR.x1, CCOR.y0, 0); put(f, 'plant_potted', CCOR.x0, CCOR.y0, 0);
    b.obj('door_freestanding', 72, 23, 1, { portal: 'cq_door_back' });
    b.portal({ id: 'cq_door_back', x: 72, y: 23, kind: 'door', to: 'corrupt', tx: 66, ty: 69, label: 'Open the door', anchor: 'quilt_heart' });
    anchorAt(b, 'cust_hall', 50, 23, 'e', 2);
    stencil(z, 'TIDY', 60.5, 23.5, 1.6, 0, 0x8a8a8a, 0);
    b.flag(COFF.x0, COFF.y0, COFF.x1, COFF.y1, TF.NOSPAWN);
    // the bridge of static down to the quilt: lamps floating beside it
    for (const [x, y] of [[61, 28], [55, 31], [50, 35], [61, 36]] as const) b.light(x + 0.5, y + 0.5, 'lamp', { color: 0xc8d0ff, intensity: 0.6, radius: 4, y: 1.4, circuit: 0, flicker: 0.1 });
    for (const [x, y] of [[61, 28], [50, 35]] as const) b.obj('lamp_floor', x, y, 0, { y: 0.6, yaw: 0.3 });
  }

  // =====================================================================
  // DRESSING, ADRIFT THINGS, CONNECTIVITY
  // =====================================================================
  liftWallObjects(z, rect(CONF.x0, COFF.y0, CCOR.x1, CCOR.y1));
  liftWallObjects(z, L13);
  // arrows on the seams that disagree with each other
  arrow(z, 25.5, 58.5, 'e', 1.2, 0xc83a2a); arrow(z, 23, 90.5, 'n', 1.2, 0xc83a2a); arrow(z, 99.5, 104.5, 'w', 1.2, 0xc83a2a);
  stencil(z, 'EXIT', 26.5, 85, 1.6, Math.PI, 0xe8e8e0); stencil(z, 'UP', 97, 95.5, 1.2, -Math.PI / 2, 0xe8e8e0);
  stencil(z, 'NO EXIT', 100, 61, 2, 0, 0xe8e8e0);
  scatterLoot(f, rng, 'floor_lobby', rect(30, 40, 97, 87), 18);
  scatterLoot(f, rng, 'anomaly_cache', rect(30, 40, 97, 87), 5);

  const first = (z.meta.anchors as Record<string, number[]>).p_stair_13;
  connectRegions(z, b, first[0], first[1], rng, { keep: [...P.filter((p) => p.shift).map((p) => p.rc), FC] });

  // adrift in the void: furniture, lamps, little islands of floor nobody can reach
  const nearLoop = (x: number, y: number) => inRect(FC, x, y, 9);
  const nearFloor = (x: number, y: number, d: number) => { if (nearLoop(x, y)) return true; for (let j = -d; j <= d; j++) for (let i = -d; i <= d; i++) if (z.inb(x + i, y + j) && z.floor[z.idx(x + i, y + j)]) return true; return false; };
  const ADRIFT = ['chair_office', 'fridge', 'door_freestanding', 'tv_static', 'bed_hospital', 'shopping_cart', 'filing_cabinet', 'sofa', 'vending_soda', 'desk_school', 'swing_set', 'phone_booth', 'crib', 'glitch_monolith', 'piano', 'lamp_post'];
  for (let k = 0, t = 0; k < 46 && t < 3000; t++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    if (z.floor[z.idx(x, y)] || nearFloor(x, y, 2) || z.objectsAt(x, y).length) continue;
    b.obj(rng.pick(ADRIFT), x, y, rng.int(0, 3) as Rot, { y: rng.float(-2.5, 3), yaw: rng.float(-1.5, 1.5) });
    k++;
  }
  for (let k = 0, t = 0; k < 14 && t < 2000; t++) {
    const x = rng.int(4, W - 6), y = rng.int(4, H - 6);
    if (nearFloor(x, y, 3)) continue;
    const w = rng.int(1, 3), hh = rng.int(1, 2);
    b.fillFloor(x, y, x + w - 1, y + hh - 1, rng.pick(['carpet_yellow', 'tile_pool', 'grass_dream', 'glitch', 'void', 'wood', 'asphalt']), rng.float(-2.5, 2));
    if (rng.chance(0.4)) b.obj(rng.pick(['chair_office', 'lamp_floor', 'tv_static', 'flowers']), x, y, rng.int(0, 3) as Rot, {});
    k++;
  }
  for (let k = 0; k < 12; k++) {
    const x = rng.int(4, W - 5), y = rng.int(4, H - 5);
    if (nearFloor(x, y, 1)) continue;
    b.light(x + 0.5, y + 0.5, rng.chance(0.5) ? 'neon' : 'lamp', { color: rng.pick([0xff40d0, 0x40e8ff, 0xffd8a0, 0xb040ff]), intensity: 0.5, radius: 4, y: rng.float(0.5, 3), circuit: 0, flicker: rng.float(0.1, 0.6) });
  }
  settleVoidHeights(z);
  // everything here is corrupt
  for (let i = 0; i < W * H; i++) if (z.floor[i]) z.flags[i] |= TF.CORRUPT;

  const a = z.meta.anchors;
  z.meta.anchors = { p_stair_13: a.p_stair_13, p_mall_cinema: a.p_mall_cinema, quilt_heart: a.quilt_heart, cust_hall: a.cust_hall };
  for (const c of [C_Q, C_ISL, C_CUST]) z.power.set(c, true);
  z.env = {
    ...z.env,
    ambient: 0x2a2236, ambientI: 0.52, fog: 0x0a0710, fogNear: 10, fogFar: 32, void: 0x040306, temp: 12,
    grade: 'corrupt', reverb: 'void', ambience: 'corrupt', music: 'broken', collapseResist: 0,
  };
  z.spawnTable = [['custodian', 2], ['hollow', 2], ['echo', 1.5], ['drywall_man', 1], ['grinhound', 1], ['occupant', 1]];
  z.creatureCap = 9;
  z.meta.shiftRate = 1.6;
  z.meta.terminalLore = ['corrupt_text', 'terminal'];
  void floorId; void wallId;
}

defZone({
  key: 'corrupt', name: 'Unrendered', W: 128, H: 128, depth: 5, gen: (z, s) => generateCorrupt(z, s),
  blurb: 'Pieces of everywhere, stitched together badly. The floor is a suggestion. Something here is keeping things tidy.',
});
