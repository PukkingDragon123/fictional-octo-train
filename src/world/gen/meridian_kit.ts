// Shared helpers for the Meridian zones (office, stairwell, server, exit):
// room carving, wall-mounted props on a named wall, precise decals, light
// grids on circuits, items placed on table tops, anchors and spawn guards.
import { Zone, TF, TileObject, Room } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { createItem } from '../../items/factory';
import { dropItem } from '../../items/worldItems';
import { hasItemDef } from '../../items/item';
import { objDef } from '../objects';

export type Rot = 0 | 1 | 2 | 3;
export type Side = 'n' | 'e' | 's' | 'w';

/** rotation that puts an object's BACK against the given wall (front faces into the tile) */
export const BACK: Record<Side, Rot> = { n: 0, e: 1, s: 2, w: 3 };
/** rotation that makes an object FACE the given direction */
export const FACE: Record<Side, Rot> = { s: 0, w: 1, n: 2, e: 3 };
/** player facing angles (radians) for anchors */
export const ANG: Record<Side, number> = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };

export function anchor(z: Zone, id: string, x: number, y: number, face?: Side) {
  (z.meta.anchors ||= {})[id] = face === undefined ? [x, y] : [x, y, ANG[face]];
}

/** keep creatures from spawning around a spot (arrival points, mission rooms) */
export function noSpawn(b: ZoneBuilder, x: number, y: number, r = 3) { b.flag(x - r, y - r, x + r, y + r, TF.NOSPAWN); }

export interface RoomOpts { floor?: string; wall?: string | null; paper?: string; circuit?: number; temp?: number; h?: number }

/** floor + wallpaper + walls + room record for a rectangle (inclusive tiles) */
export function room(b: ZoneBuilder, name: string, type: string, x0: number, y0: number, x1: number, y1: number, o: RoomOpts = {}): Room {
  if (o.floor) b.fillFloor(x0, y0, x1, y1, o.floor, o.h ?? 0);
  if (o.paper) b.paper(x0, y0, x1, y1, o.paper);
  if (o.wall !== null) b.roomWalls(x0, y0, x1, y1, o.wall ?? 'drywall');
  return b.addRoom(name, type, x0, y0, x1, y1, { circuit: o.circuit ?? 0, temp: o.temp });
}

/** door helpers on the walls of a room x0..x1, y0..y1 */
export const doorN = (b: ZoneBuilder, x: number, y0: number, style = 'door_office', o: any = {}) => b.door(x, y0, 0, style, o);
export const doorS = (b: ZoneBuilder, x: number, y1: number, style = 'door_office', o: any = {}) => b.door(x, y1 + 1, 0, style, o);
export const doorW = (b: ZoneBuilder, x0: number, y: number, style = 'door_office', o: any = {}) => b.door(x0, y, 1, style, o);
export const doorE = (b: ZoneBuilder, x1: number, y: number, style = 'door_office', o: any = {}) => b.door(x1 + 1, y, 1, style, o);
export const gapN = (b: ZoneBuilder, xa: number, xb: number, y0: number) => { for (let x = xa; x <= xb; x++) b.gap(x, y0, 0); };
export const gapW = (b: ZoneBuilder, x0: number, ya: number, yb: number) => { for (let y = ya; y <= yb; y++) b.gap(x0, y, 1); };

/** wall-mounted object against wall `side` of tile (x,y) */
export function wallObj(b: ZoneBuilder, key: string, x: number, y: number, side: Side, state: Record<string, any> = {}): TileObject | null {
  return b.obj(key, x, y, BACK[side], state);
}

/** place only if the footprint is free floor */
export function put(f: Furnisher, key: string, x: number, y: number, rot: Rot = 0, state: Record<string, any> = {}): TileObject | null {
  return f.place(key, x, y, rot, state);
}

/** ceiling light object */
export function lamp(b: ZoneBuilder, x: number, y: number, circuit: number, o: { kind?: 'light_fluoro' | 'light_bulb'; flicker?: number; broken?: boolean; on?: boolean } = {}) {
  if (!b.z.inb(x, y) || !b.z.floor[b.z.idx(x, y)]) return null;
  return b.obj(o.kind ?? 'light_fluoro', x, y, 0, { circuit, flicker: o.flicker ?? 0, broken: o.broken ?? false, ...(o.on === false ? { on: false } : {}) });
}

/**
 * Regular grid of ceiling lights over the floor tiles of a rect. `pick`
 * decides per fixture (broken/flicker) deterministically.
 */
export function lightGrid(b: ZoneBuilder, x0: number, y0: number, x1: number, y1: number, sx: number, sy: number, circuit: number | ((x: number, y: number) => number),
  pick: (x: number, y: number) => { broken?: boolean; flicker?: number; kind?: 'light_fluoro' | 'light_bulb' } = () => ({})) {
  const ox = Math.floor(((x1 - x0) % sx) / 2), oy = Math.floor(((y1 - y0) % sy) / 2);
  for (let y = y0 + oy; y <= y1; y += sy) for (let x = x0 + ox; x <= x1; x += sx) {
    const c = typeof circuit === 'number' ? circuit : circuit(x, y);
    const p = pick(x, y);
    lamp(b, x, y, c, p);
  }
}

/** a decal at an exact spot (centre of tile + offset), no jitter */
export function decalAt(z: Zone, tex: string, x: number, y: number, w = 1, d = 1, rot = 0, tint?: number, alpha?: number) {
  z.decals.push({ x, z: y, w, d, rot, tex, tint, alpha });
}

/** item resting at a height (table tops, shelves) */
export function itemAt(z: Zone, rng: Rng, key: string, x: number, y: number, h: number, data?: Record<string, any>, scatter = 0.35) {
  if (!hasItemDef(key)) return null;
  const it = createItem(key, rng);
  if (data) it.data = { ...(it.data || {}), ...data };
  dropItem(z, it, x + 0.5, y + 0.5, h, scatter);
  return it;
}

/** item on top of a table-like object */
export function itemOn(z: Zone, rng: Rng, key: string, base: TileObject | null, data?: Record<string, any>, dx = 0, dy = 0) {
  if (!base) return null;
  const d = objDef(base.key);
  const h = (d?.surface ?? d?.height ?? 0.75) + 0.01;
  return itemAt(z, rng, key, base.x + dx, base.y + dy, h, data, 0.25);
}

/** put an item straight into an object's container */
export function stash(o: TileObject | null, rng: Rng, key: string, data?: Record<string, any>) {
  if (!o?.inv || !hasItemDef(key)) return null;
  const it = createItem(key, rng);
  if (data) it.data = { ...(it.data || {}), ...data };
  o.inv.add(it);
  return it;
}

/** floor tile test */
export const isFloor = (z: Zone, x: number, y: number) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0;
export const isOpen = (z: Zone, x: number, y: number) => isFloor(z, x, y) && z.solid[z.idx(x, y)] === 0 && !z.objectsAt(x, y).length;

/** scatter decals over floor tiles of a rect (density per tile) */
export function scatterDecals(f: Furnisher, x0: number, y0: number, x1: number, y1: number, density: number, table: [string, number][], size: [number, number] = [0.8, 1.6], tint?: number) {
  const z = f.z, rng = f.rng;
  const n = Math.round((x1 - x0 + 1) * (y1 - y0 + 1) * density);
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (!isFloor(z, x, y)) continue;
    const s = rng.float(size[0], size[1]);
    f.decal(rng.weighted(table), x, y, s, s * rng.float(0.8, 1.2), undefined, tint);
  }
}

/** scatter floor loot over open floor tiles of a rect */
export function scatterLoot(f: Furnisher, table: string, x0: number, y0: number, x1: number, y1: number, count: number, avoid?: (x: number, y: number) => boolean) {
  const z = f.z, rng = f.rng;
  let placed = 0;
  for (let t = 0; t < count * 6 && placed < count; t++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (!isFloor(z, x, y) || z.solid[z.idx(x, y)] || (z.flags[z.idx(x, y)] & TF.SHIFT)) continue;
    if (avoid && avoid(x, y)) continue;
    f.floorLoot(table, x, y);
    placed++;
  }
}

/** fluorescent/bulb pick helper: sector-based dead zones + flicker */
export function sectorPick(rng: Rng, deadChance: number, flickChance: number, size = 12) {
  const sectors = new Map<string, { dead: boolean; flick: number }>();
  return (x: number, y: number) => {
    const k = Math.floor(x / size) + ',' + Math.floor(y / size);
    let s = sectors.get(k);
    if (!s) { s = { dead: rng.chance(deadChance), flick: rng.chance(flickChance) ? rng.float(0.05, 0.3) : 0 }; sectors.set(k, s); }
    const broken = s.dead ? rng.chance(0.8) : rng.chance(0.05);
    const flicker = broken ? 0 : s.flick && rng.chance(0.5) ? s.flick : rng.chance(0.03) ? 0.15 : 0;
    return { broken, flicker };
  };
}
