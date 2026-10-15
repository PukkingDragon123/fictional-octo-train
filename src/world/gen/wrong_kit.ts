// The wrong rooms: a library of small, very specific mistakes that can be
// carved into any maze-like zone (carveWrong) or dressed into an existing
// room (dressWrong). Doors set high up a wall, stairs into the ceiling, a
// room of chairs facing one corner, a corridor that narrows to a crack, a
// doorway too small to use, the same room three times in a row, a room where
// the furniture is on the ceiling, a bathroom on its side, a hole into the
// dark, a room of ringing phones, a wet room with buckets under the drips, a
// bed with someone sitting on it, a corridor of the same poster, a stack of
// televisions showing your back, a staircase that loops.
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { objDef } from '../objects';
import { floorId } from '../defs';
import { floorItems } from '../../items/worldItems';
import { type Rot, type Side, arrive, mount, decal, hh } from './weird_kit';

export type WrongKind =
  | 'high_door' | 'ceiling_stairs' | 'chairs_corner' | 'narrowing' | 'tiny_door' | 'same_thrice' | 'upside_down'
  | 'sideways_bath' | 'dark_hole' | 'phones' | 'wet' | 'bed_still' | 'poster_corridor' | 'tv_backs' | 'loop_stairs';

export interface WRect { x0: number; y0: number; x1: number; y1: number }
export interface WOpts {
  circuit: number;
  paper?: string;          // wallpaper used for slabs and on-wall furniture rooms
  lamp?: string;           // ceiling light object key (default light_fluoro)
  id?: string;             // unique id (portal / anchor ids for loop stairs and holes)
  hole?: { portal: string; to: string; label: string; anchor: string };
}

/** minimum (w, h) interior size each kind needs */
export const WRONG_SIZE: Record<WrongKind, [number, number]> = {
  high_door: [5, 5], ceiling_stairs: [5, 5], chairs_corner: [6, 5], narrowing: [12, 3], tiny_door: [4, 4], same_thrice: [15, 5],
  upside_down: [6, 5], sideways_bath: [5, 4], dark_hole: [7, 6], phones: [6, 5], wet: [6, 5], bed_still: [4, 4],
  poster_corridor: [14, 3], tv_backs: [6, 5], loop_stairs: [5, 6],
};
/** kinds that can dress an ordinary existing room (no special shape needed) */
export const ROOM_KINDS: WrongKind[] = ['high_door', 'ceiling_stairs', 'chairs_corner', 'tiny_door', 'upside_down', 'sideways_bath', 'phones', 'wet', 'bed_still', 'tv_backs'];

const ROOM_NAMES: Record<WrongKind, [string, string]> = {
  high_door: ['A Room', 'wrong_high_door'], ceiling_stairs: ['A Room', 'wrong_stairs'], chairs_corner: ['A Room', 'wrong_chairs'],
  narrowing: ['A Corridor', 'wrong_narrowing'], tiny_door: ['A Room', 'wrong_tiny_door'], same_thrice: ['A Room', 'wrong_same'],
  upside_down: ['A Room', 'wrong_upside_down'], sideways_bath: ['Bathroom', 'wrong_bath'], dark_hole: ['A Room', 'wrong_hole'],
  phones: ['A Room', 'wrong_phones'], wet: ['A Room', 'wrong_wet'], bed_still: ['A Bedroom', 'wrong_bed'],
  poster_corridor: ['A Corridor', 'wrong_posters'], tv_backs: ['A Room', 'wrong_tvs'], loop_stairs: ['Stairs', 'wrong_loop_stairs'],
};

const walled = (z: Zone, x: number, y: number, side: 0 | 1) => z.inb(x, y) && (side === 0 ? z.wallN[z.idx(x, y)] : z.wallW[z.idx(x, y)]) !== 0 && !z.edge(x, y, side);
/** tiles along the rect's north wall that are plain wall (no door or gap) */
function northWall(z: Zone, r: WRect) { const out: number[] = []; for (let x = r.x0; x <= r.x1; x++) if (walled(z, x, r.y0, 0)) out.push(x); return out; }
function westWall(z: Zone, r: WRect) { const out: number[] = []; for (let y = r.y0; y <= r.y1; y++) if (walled(z, r.x0, y, 1)) out.push(y); return out; }
function freeAt(z: Zone, x: number, y: number) { if (!z.inb(x, y)) return false; const i = z.idx(x, y); return !!z.floor[i] && !z.solid[i] && !z.objectsAt(x, y).some((o) => { const d = objDef(o.key); return d && !d.ceiling && !d.onWall; }); }

/**
 * Carve a fresh walled room for a wrong-room kind into a maze (the Lobby):
 * clears the rect, walls it, opens `openings` gaps on the south/east/west
 * sides that face floor, and dresses it.
 */
export function carveWrong(z: Zone, b: ZoneBuilder, rng: Rng, kind: WrongKind, r: WRect, o: WOpts & { floor?: string; wall?: string; openings?: number; sides?: ('s' | 'e' | 'w')[] }) {
  b.clearObjects(r.x0, r.y0, r.x1, r.y1);
  z.lights = z.lights.filter((l) => !(l.x >= r.x0 && l.x < r.x1 + 1 && l.z >= r.y0 && l.z < r.y1 + 1));
  b.clearWallsIn(r.x0, r.y0, r.x1, r.y1);
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { const i = z.idx(x, y); if (!z.floor[i]) z.floor[i] = floorId('carpet_yellow'); z.flags[i] &= ~TF.SHIFT; }
  if (o.floor) b.fillFloor(r.x0, r.y0, r.x1, r.y1, o.floor);
  if (o.paper) b.paper(r.x0, r.y0, r.x1, r.y1, o.paper);
  b.roomWalls(r.x0, r.y0, r.x1, r.y1, o.wall || 'drywall');
  // openings: never in the north wall (that is where the wrongness hangs)
  const sides: [number, number, 0 | 1, number, number][] = [];
  const allow = o.sides || ['s', 'e', 'w'];
  const mid = Math.floor((r.y0 + r.y1) / 2);
  if (allow.includes('s')) for (let x = r.x0 + 1; x < r.x1; x++) sides.push([x, r.y1 + 1, 0, x, r.y1 + 1]);
  for (let y = r.y0 + (r.y1 - r.y0 >= 2 ? 1 : 0); y <= r.y1 - (r.y1 - r.y0 >= 2 ? 1 : 0); y++) {
    if (o.sides && y !== mid && r.y1 - r.y0 <= 2) continue; // corridors: open in the middle row only
    if (allow.includes('w')) sides.push([r.x0, y, 1, r.x0 - 1, y]);
    if (allow.includes('e')) sides.push([r.x1 + 1, y, 1, r.x1 + 1, y]);
  }
  rng.shuffle(sides);
  let made = 0;
  for (const [x, y, side, ox, oy] of sides) {
    if (made >= (o.openings ?? 2)) break;
    if (!z.inb(ox, oy) || !z.floor[z.idx(ox, oy)] || z.solid[z.idx(ox, oy)] === 1) continue;
    b.gap(x, y, side);
    if (rng.chance(0.5)) { const nx = side === 0 ? x + 1 : x, ny = side === 1 ? y + 1 : y; if (nx <= r.x1 && ny <= r.y1 + 1) b.gap(nx, ny, side); }
    made++;
  }
  dressWrong(z, b, rng, kind, r, o);
}

/** Dress the interior of rect r (walls already there) as a wrong room. Returns false if it could not. */
export function dressWrong(z: Zone, b: ZoneBuilder, rng: Rng, kind: WrongKind, r: WRect, o: WOpts): boolean {
  const f = new Furnisher(b, rng);
  const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
  const [mw, mh] = WRONG_SIZE[kind];
  if (w < mw || h < mh) return false;
  const [name, type] = ROOM_NAMES[kind];
  b.addRoom(name, type, r.x0, r.y0, r.x1, r.y1, { circuit: o.circuit });
  const lamp = (x: number, y: number, st: Record<string, any> = {}) => b.obj(o.lamp || 'light_fluoro', x, y, 0, { circuit: o.circuit, ...st });
  const cx = Math.floor((r.x0 + r.x1) / 2), cy = Math.floor((r.y0 + r.y1) / 2);
  const nw = northWall(z, r);
  const nwx = (pref: number) => nw.length ? nw.reduce((a, x) => (Math.abs(x - pref) < Math.abs(a - pref) ? x : a), nw[0]) : pref;
  const put = (key: string, x: number, y: number, rot: Rot = 0, st: Record<string, any> = {}) => (freeAt(z, x, y) ? f.place(key, x, y, rot, st) : null);
  const paper = o.paper || 'wall_yellow';

  switch (kind) {
    case 'high_door': {
      const x = nwx(cx);
      mount(b, 'zw_high_door', x, r.y0, 'n', { style: 'door_office' });
      // somebody tried: chairs stacked under it, scuffs and handprints up the wall
      put('chair_office', x, r.y0 + 1, 2); put('chair_stack', x + 1, r.y0 + 1, 0);
      decal(z, 'decal_footprints', x + 0.5, r.y0 + 1.6, 0.8, 0.8, -Math.PI / 2, 0x5a4a30, 0.6);
      lamp(cx, cy, { flicker: 0.12 });
      f.floorItem('note', cx - 1, r.y1 - 1, { lore: 'note_generic' });
      break;
    }
    case 'ceiling_stairs': {
      const x = nwx(cx);
      if (freeAt(z, x, r.y0) && freeAt(z, x, r.y0 + 1) && freeAt(z, x, r.y0 + 2)) b.obj('zw_stairs_ceiling', x, r.y0, 0, { mat: paper.startsWith('wall_yellow') ? 'carpet' : 'concrete' });
      for (let i = 0; i < 4; i++) decal(z, 'decal_footprints', x + 0.5, r.y0 + 3.8 + i * 0.9, 0.7, 0.7, -Math.PI / 2, 0x6a5a3a, 0.7);
      lamp(cx, cy + 1);
      break;
    }
    case 'chairs_corner': {
      // every chair faces the north-west corner
      const tx = r.x0, ty = r.y0;
      for (let y = r.y0 + 1; y <= r.y1; y += 1) for (let x = r.x0 + 1; x <= r.x1; x += 1) {
        if ((x + y) % 2) continue;
        if (!freeAt(z, x, y)) continue;
        b.obj(rng.chance(0.7) ? 'chair_folding' : 'chair_office', x, y, 0, { yaw: Math.atan2(tx + 0.5 - (x + 0.5), ty + 0.5 - (y + 0.5)) + Math.PI });
      }
      lamp(cx, cy, { flicker: 0.2 });
      break;
    }
    case 'narrowing': {
      // a corridor running east that squeezes down to a crack in the end wall (r is the corridor; 3 rows)
      const my = cy;
      const n = Math.min(6, w - 4);
      for (let k = 0; k < n; k++) {
        const x = r.x1 - n + 1 + k;
        const t = (k + 1) / n;
        // slabs on both sides tilt inward more and more
        if (my - 1 >= r.y0) b.obj('zw_slab', x, my - 1, 0, { paper, len: 1.1, yaw: 0, }, { oz: 0.15 + t * 0.32 });
        if (my + 1 <= r.y1) b.obj('zw_slab', x, my + 1, 0, { paper, len: 1.1 }, { oz: -(0.15 + t * 0.32) });
      }
      for (let y = r.y0; y <= r.y1; y++) if (y !== my) { const i = z.idx(r.x1, y); void i; }
      // the end wall: a crack where the corridor should go on
      if (walled(z, r.x1 + 1, my, 1)) mount(b, 'zw_crack', r.x1, my, 'e');
      for (let x = r.x0; x <= r.x1 - n; x += 4) lamp(x, my, { flicker: x > r.x0 + 4 ? 0.2 : 0 });
      f.floorItem('note', r.x0 + 1, my, { lore: 'note_generic' });
      break;
    }
    case 'tiny_door': {
      const x = nwx(cx);
      mount(b, 'zw_tiny_door', x, r.y0, 'n', { style: 'door_house' });
      f.floorItem('bowl', x, r.y0 + 1);
      b.light(x + 0.5, r.y0 + 0.4, 'lamp', { circuit: 0, color: 0x9ad0ff, intensity: 0.35, radius: 2, y: 0.1 });
      lamp(cx, cy + 1, { flicker: 0.1 });
      break;
    }
    case 'same_thrice': {
      // three identical rooms in a row with doors between them (r spans all three)
      const rw = Math.floor(w / 3);
      for (let k = 0; k < 3; k++) {
        const x0 = r.x0 + k * rw, x1 = k === 2 ? r.x1 : x0 + rw - 1;
        if (k > 0) { b.vwall(x0, r.y0, r.y1, 'drywall'); b.door(x0, cy, 1, 'door_office', { open: true }); }
        const ax = x0 + 1;
        put('armchair', ax, r.y0, 0, {});
        const ac = z.objectsAt(ax, r.y0).find((q) => q.key === 'armchair'); if (ac) ac.tint = 0x8ac08a;
        mount(b, 'clock_wall', x0 + Math.min(3, rw - 2), r.y0, 'n');
        put('plant_potted', x1, r.y1, 0);
        f.floorItem('note', x0 + 2, cy + 1, { lore: 'zw_wrong_same' });
        lamp(x0 + Math.floor(rw / 2), cy);
      }
      break;
    }
    case 'upside_down': {
      const items: [string, number, number, Rot][] = [['sofa', cx - 1, r.y1 - 1, 2], ['armchair', r.x0 + 1, cy, 1], ['coffee_table', cx, cy, 0], ['lamp_floor', r.x0, r.y0, 0], ['table_round', r.x1 - 1, r.y0 + 1, 0], ['chair_wood', r.x1 - 2, r.y0 + 1, 1], ['bookshelf', r.x1, cy, 3], ['tv_stand', cx, r.y0, 0]];
      for (const [k, x, y, rot] of items) if (z.inb(x, y)) b.obj('zw_upside_down', x, y, rot, { of: k });
      // and some of it on the walls instead
      const wx = nwx(cx - 2); mount(b, 'zw_on_wall', wx, r.y0, 'n', { of: 'chair_wood', h: 1.4 });
      const ww = westWall(z, r); if (ww.length) mount(b, 'zw_on_wall', r.x0, ww[Math.floor(ww.length / 2)], 'w', { of: 'nightstand', h: 1.2 });
      decal(z, 'carpet_rug', cx + 0.5, cy + 0.5, 3, 2.4, 0, 0xb87a5a, 0.9);
      lamp(cx - 1, cy - 1, { flicker: 0.05 });
      break;
    }
    case 'sideways_bath': {
      b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'tile_white');
      b.paper(r.x0, r.y0, r.x1, r.y1, 'wall_bathroom');
      const xs = northWall(z, r);
      const use = (i: number, key: string, h: number) => { if (i < xs.length) mount(b, 'zw_on_wall', xs[i], r.y0, 'n', { of: key, h }); };
      use(0, 'toilet', 1.3); use(2, 'sink_bathroom', 1.25); use(Math.min(4, xs.length - 1), 'bathtub', 1.05);
      b.obj('zw_upside_down', cx, cy + 1, 0, { of: 'towel_rack' });
      f.floorItem('toilet_paper', cx - 1, cy + 1); f.floorItem('soap', cx + 1, cy);
      decal(z, 'decal_puddle', cx + 0.5, cy + 0.5, 1.6, 1.2, 0);
      lamp(cx, cy, { flicker: 0.15 });
      break;
    }
    case 'dark_hole': {
      // the floor stops: a ragged black hole into nothing
      const hx0 = cx - 1, hy0 = cy - 1;
      const holes: [number, number][] = [];
      for (let y = hy0; y <= hy0 + 2; y++) for (let x = hx0; x <= hx0 + 2; x++) if (!(x === hx0 + 2 && y === hy0 + 2) || rng.chance(0.5)) holes.push([x, y]);
      b.clearObjects(hx0 - 1, hy0 - 1, hx0 + 3, hy0 + 3);
      for (const [x, y] of holes) z.floor[z.idx(x, y)] = 0;
      if (o.hole) {
        // the one tile at the lip you can step onto, and off
        const px = hx0 - 1, py = hy0 + 1;
        b.obj('hole_floor', px, py, 0, { portal: o.hole.portal });
        b.portal({ id: o.hole.portal, x: px, y: py, kind: 'hole', to: o.hole.to, tx: 20, ty: 20, label: o.hole.label });
        arrive(b, o.hole.anchor, Math.max(r.x0, px - 2), py, 'e', 2);
      }
      for (const [x, y] of holes) for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
        const X = x + dx, Y = y + dy;
        if (!z.inb(X, Y) || !z.floor[z.idx(X, Y)]) continue;
        decal(z, 'zw_carpet_edge', X + 0.5 - dx * 0.25, Y + 0.5 - dy * 0.25, 1.0, 0.9, Math.atan2(dy, dx) + Math.PI / 2, undefined, 1);
      }
      lamp(r.x0 + 1, r.y0 + 1, { flicker: 0.3 });
      break;
    }
    case 'phones': {
      // desks and tables covered in telephones; more phones on the floor
      for (let y = r.y0 + 1; y <= r.y1 - 1; y += 2) for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) {
        const t = put(rng.chance(0.5) ? 'table_round' : 'phone_desk', x, y, 0);
        if (t) f.onTop('zw_phone', t, { v: (x + y) % 3 });
      }
      for (let i = 0; i < 5; i++) { const x = rng.int(r.x0, r.x1), y = rng.int(r.y0, r.y1); if (freeAt(z, x, y)) b.obj('zw_phone', x, y, rng.int(0, 3) as Rot, { v: i % 3 }); }
      f.floorItem('note', cx, r.y1, { lore: 'zw_wrong_phones' });
      lamp(cx, cy, { flicker: 0.1 });
      break;
    }
    case 'wet': {
      b.fillFloor(r.x0, r.y0, r.x1, r.y1, 'carpet_wet');
      for (let i = 0; i < 6; i++) { const x = rng.int(r.x0, r.x1), y = rng.int(r.y0, r.y1); if (freeAt(z, x, y)) b.obj('zw_drip_bucket', x, y, 0, { v: i % 4 }); }
      for (let i = 0; i < 9; i++) decal(z, i % 3 ? 'decal_puddle' : 'decal_mold', rng.float(r.x0 + 0.5, r.x1 + 0.5), rng.float(r.y0 + 0.5, r.y1 + 0.5), rng.float(1.2, 2.2), rng.float(1.0, 1.8), rng.float(0, 6));
      put('mop_bucket', r.x1, r.y1, 0);
      lamp(cx, cy, { flicker: 0.35 });
      break;
    }
    case 'bed_still': {
      // a single bed in an empty room, and someone sitting on the edge of it, facing the door
      const bx = cx, by = r.y0;
      if (freeAt(z, bx, by) && freeAt(z, bx, by + 1)) {
        b.obj('bed_single', bx, by, 0, {});
        b.obj('replica_seated', bx, by + 1, 0, { pose: 'sit', seat: 'none', y: 0.05 });
      }
      const n = put('nightstand', bx + 1, by, 0); if (n) f.onTop('lamp_table', n, {});
      b.light(bx + 1.5, by + 0.5, 'lamp', { circuit: o.circuit, color: 0xffc080, intensity: 0.6, radius: 3.5, y: 0.9 });
      break;
    }
    case 'poster_corridor': {
      // the same poster, again and again; the figure in it is a little closer every time
      const xs = northWall(z, r);
      let k = 0;
      for (let i = 0; i < xs.length; i += 2) mount(b, 'zw_poster_same', xs[i], r.y0, 'n', { v: Math.min(5, Math.floor((k++ * 6) / Math.max(1, Math.ceil(xs.length / 2)))) });
      f.floorItem('note', r.x1 - 1, cy, { lore: 'zw_wrong_poster' });
      for (let x = r.x0 + 1; x <= r.x1; x += 4) lamp(x, cy, { flicker: x > r.x1 - 5 ? 0.3 : 0 });
      break;
    }
    case 'tv_backs': {
      const x = Math.max(r.x0, nwx(cx) - 1);
      if (freeAt(z, x, r.y0) && freeAt(z, x + 1, r.y0)) b.obj('zw_tv_stack', x, r.y0, 0, {});
      if (w >= 9 && freeAt(z, x + 3, r.y0) && freeAt(z, x + 4, r.y0)) b.obj('zw_tv_stack', x + 3, r.y0, 0, {});
      put('chair_office', x + 1, r.y0 + 3, 2);
      f.floorItem('note', x + 2, r.y0 + 4, { lore: 'zw_wrong_tvs' });
      break;
    }
    case 'loop_stairs': {
      // a flight up against the north wall: climb it and you are at the bottom of it again
      const id = o.id || 'wrong_loop';
      const sx = nwx(cx);
      b.clearObjects(sx, r.y0, sx, r.y0 + 3);
      b.obj('staircase_up', sx, r.y0, 0, { portal: id });
      b.portal({ id, x: sx, y: r.y0, kind: 'stairs_up', to: z.key, tx: sx, ty: r.y0 + 3, label: 'Climb the stairs', anchor: id + '_foot' });
      (z.meta.anchors ||= {})[id + '_foot'] = [sx, r.y0 + 3, -Math.PI / 2];
      mount(b, 'zw_plate', sx - 1 >= r.x0 ? sx - 1 : sx + 1, r.y0, 'n', { label: 'THIS WAY' });
      for (let i = 0; i < 3; i++) decal(z, 'decal_footprints', sx + 0.5, r.y0 + 2.6 + i * 0.8, 0.7, 0.7, -Math.PI / 2, 0x5a4a30, 0.8);
      lamp(cx, cy + 1, { flicker: 0.1 });
      break;
    }
  }
  void hh;
  return true;
}

/** Can an existing room be dressed as a wrong room? (no portals, anchors or mission props inside) */
export function roomUsable(z: Zone, r: WRect) {
  const anchors = Object.values(z.meta.anchors || {}) as number[][];
  if (anchors.some((a) => Array.isArray(a) && a[0] >= r.x0 - 1 && a[0] <= r.x1 + 1 && a[1] >= r.y0 - 1 && a[1] <= r.y1 + 1)) return false;
  if (z.portals.some((p) => p.x >= r.x0 - 1 && p.x <= r.x1 + 1 && p.y >= r.y0 - 1 && p.y <= r.y1 + 1)) return false;
  for (const o of z.objects.values()) {
    if (o.x < r.x0 || o.x > r.x1 || o.y < r.y0 || o.y > r.y1) continue;
    const s = o.state || {};
    if (s.mission || s.lore || s.node || s.card || s.code || s.portal || s.keyId || s.codeFlag || o.key === 'hopper' || o.key === 'seam_door') return false;
  }
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
    const i = z.idx(x, y);
    if (!z.floor[i] || (z.flags[i] & TF.SHIFT)) return false;
  }
  // mission items lying in the room (keycards, keys, notes with lore) keep it as it is
  for (const wi of floorItems(z).values()) {
    if (wi.x < r.x0 || wi.x > r.x1 + 1 || wi.z < r.y0 || wi.z > r.y1 + 1) continue;
    if (wi.item.data?.lore || /key|card|fuse|drive/.test(wi.item.key)) return false;
  }
  return true;
}

/**
 * Turn up to `n` existing rooms of the given types into wrong rooms: their
 * furniture and lights are cleared, the walls and doors stay.
 */
export function wrongRoomsIn(z: Zone, b: ZoneBuilder, seed: number, types: string[], n: number, kinds: WrongKind[], opts: Partial<WOpts> = {}) {
  const rng = new Rng(seed);
  const cands = z.rooms.filter((r) => r.id > 0 && types.includes(r.type));
  rng.shuffle(cands);
  let made = 0;
  const used = new Set<string>();
  for (const room of cands) {
    if (made >= n) break;
    const r = { x0: room.x0, y0: room.y0, x1: room.x1, y1: room.y1 };
    const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
    if (w > 18 || h > 20 || !roomUsable(z, r)) continue;
    const fits = kinds.filter((k) => w >= WRONG_SIZE[k][0] && h >= WRONG_SIZE[k][1] && !used.has(k));
    if (!fits.length) continue;
    const kind = fits[rng.int(0, fits.length - 1)];
    // the floor items and the hopper's neighbourhood stay; furniture and lights go
    b.clearObjects(r.x0, r.y0, r.x1, r.y1);
    z.lights = z.lights.filter((l) => !(l.x >= r.x0 && l.x < r.x1 + 1 && l.z >= r.y0 && l.z < r.y1 + 1));
    // keep the old room record (and its circuit), but retype it so the mission flag reads right
    room.type = ROOM_NAMES[kind][1];
    if (dressWrong(z, b, rng, kind, r, { circuit: room.circuit, paper: opts.paper, lamp: opts.lamp, id: `${z.key}_wrong_${made}` })) {
      // dressWrong adds its own room record: drop the duplicate it made and keep the original
      z.rooms.pop();
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) z.room[z.idx(x, y)] = room.id;
      used.add(kind);
      made++;
    }
  }
  return made;
}
