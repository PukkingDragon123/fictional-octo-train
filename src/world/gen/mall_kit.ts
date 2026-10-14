// Shared helpers for Westgate Mall, Foodland and Parking Level P∞: arrival
// anchors, guarded placement, wall-mounted signs, lights at tile centres,
// exact decals, deterministic hashes and a local frame for store units.
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { objDef } from '../objects';
import { createItem } from '../../items/factory';
import { dropItem } from '../../items/worldItems';
import { hasItemDef } from '../../items/item';

export type Rot = 0 | 1 | 2 | 3;
export type Side = 'n' | 'e' | 's' | 'w';
/** rotation that puts an object's BACK against wall `side` */
export const BACK: Record<Side, Rot> = { n: 0, e: 1, s: 2, w: 3 };
/** rotation that makes an object FACE direction `side` */
export const FACE: Record<Side, Rot> = { s: 0, w: 1, n: 2, e: 3 };
/** player facing angles for anchors */
export const ANG: Record<Side, number> = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };
export const OPP: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' };

/** generation context; `stamp` = inside a shift stamp (no decals, floor items or rooms) */
export interface Ctx { z: Zone; b: ZoneBuilder; f: Furnisher; rng: Rng; seed: number; stamp?: boolean }

export function ctxOf(z: Zone, b: ZoneBuilder, rng: Rng, seed: number, stamp = false): Ctx { return { z, b, f: new Furnisher(b, rng), rng, seed, stamp }; }

/** deterministic hash in [0,1) */
export const hf = (x: number, y: number, s = 0) => hash3(x | 0, y | 0, s | 0) / 4294967296;

/** arrival anchor + a no-spawn bubble around it */
export function arrive(b: ZoneBuilder, id: string, x: number, y: number, face?: Side, r = 3) {
  (b.z.meta.anchors ||= {})[id] = face === undefined ? [x, y] : [x, y, ANG[face]];
  if (r > 0) b.flag(x - r, y - r, x + r, y + r, TF.NOSPAWN);
}

export const isFloor = (z: Zone, x: number, y: number) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0;
/** floored, not blocked and without any floor-standing object */
export function isOpen(z: Zone, x: number, y: number) {
  if (!isFloor(z, x, y) || z.solid[z.idx(x, y)]) return false;
  return !z.objectsAt(x, y).some((o) => { const d = objDef(o.key); return d && !d.ceiling && !d.onWall; });
}

/** place if the footprint is free (never forced) */
export function put(c: Ctx, key: string, x: number, y: number, rot: Rot = 0, state: Record<string, any> = {}): TileObject | null {
  return c.f.place(key, x, y, rot, state);
}
/** place, forcing it if the footprint test fails */
export function force(c: Ctx, key: string, x: number, y: number, rot: Rot = 0, state: Record<string, any> = {}): TileObject | null {
  return c.f.place(key, x, y, rot, state) || c.b.obj(key, x, y, rot, state);
}
/** wall-mounted object against wall `side` of tile (x,y) */
export function mount(b: ZoneBuilder, key: string, x: number, y: number, side: Side, state: Record<string, any> = {}): TileObject | null {
  if (!b.z.inb(x, y)) return null;
  return b.obj(key, x, y, BACK[side], state);
}
/** 3-wide fascia sign centred on tile (cx, cy), against wall `side` of that tile row/column */
export function fascia(b: ZoneBuilder, label: string, cx: number, cy: number, side: Side, lit = false): TileObject | null {
  const along = side === 'n' || side === 's';
  return mount(b, 'zg_fascia', along ? cx - 1 : cx, along ? cy : cy - 1, side, { label, lit });
}

/** a light at the centre of tile (x,y) (no object) */
export function glow(b: ZoneBuilder, x: number, y: number, kind: 'fluoro' | 'bulb' | 'sodium' | 'lamp' | 'neon' | 'sky' | 'screen' | 'emergency', circuit: number, o: { color?: number; intensity?: number; radius?: number; y?: number; flicker?: number; broken?: boolean } = {}) {
  return b.light(x + 0.5, y + 0.5, kind, { circuit, ...o });
}
/** pale skylight high above (daylight that never changes) */
export function skylight(b: ZoneBuilder, x: number, y: number, intensity = 0.5, radius = 9, color = 0xdfe8ff) {
  return b.light(x + 0.5, y + 0.5, 'sky', { color, intensity, radius, y: 6.5, circuit: 0 });
}

/** exact decal centred at (x, y) world metres */
export function decal(z: Zone, tex: string, x: number, y: number, w: number, d: number, rot = 0, tint?: number, alpha?: number) {
  const dc: any = { x, z: y, w, d, rot, tex };
  if (tint !== undefined) dc.tint = tint;
  if (alpha !== undefined) dc.alpha = alpha;
  z.decals.push(dc);
}

/** floor + optional wallpaper over a rect (no walls) */
export function floorRect(b: ZoneBuilder, x0: number, y0: number, x1: number, y1: number, floor: string, paper?: string, h = 0) {
  b.fillFloor(x0, y0, x1, y1, floor, h);
  if (paper) b.paper(x0, y0, x1, y1, paper);
}

/** item resting at a height (counter tops); data merged into the item */
export function itemAt(z: Zone, rng: Rng, key: string, x: number, y: number, h: number, data?: Record<string, any>, scatter = 0.3) {
  if (!hasItemDef(key)) return null;
  const it = createItem(key, rng);
  if (data) it.data = { ...(it.data || {}), ...data };
  dropItem(z, it, x + 0.5, y + 0.5, h, scatter);
  return it;
}
/** item on top of a table-like object */
export function itemOn(c: Ctx, key: string, base: TileObject | null, data?: Record<string, any>) {
  if (!base || c.stamp) return null;
  const d = objDef(base.key);
  return itemAt(c.z, c.rng, key, base.x, base.y, (d?.surface ?? d?.height ?? 0.8) + 0.01, data, 0.2);
}

/** scatter floor loot over open, non-shifting floor tiles of a rect */
export function scatterLoot(c: Ctx, table: string, x0: number, y0: number, x1: number, y1: number, n: number, ok?: (x: number, y: number) => boolean) {
  if (c.stamp) return;
  let placed = 0;
  for (let t = 0; t < n * 8 && placed < n; t++) {
    const x = c.rng.int(x0, x1), y = c.rng.int(y0, y1);
    if (!isOpen(c.z, x, y) || (c.z.flags[c.z.idx(x, y)] & TF.SHIFT)) continue;
    if (ok && !ok(x, y)) continue;
    c.f.floorLoot(table, x, y);
    placed++;
  }
}
/** scatter decals over floored tiles of a rect */
export function scatterDecals(c: Ctx, x0: number, y0: number, x1: number, y1: number, n: number, list: [string, number][], s0 = 0.8, s1 = 1.6, tint?: number, ok?: (x: number, y: number) => boolean) {
  if (c.stamp) return;
  for (let i = 0; i < n; i++) {
    const x = c.rng.int(x0, x1), y = c.rng.int(y0, y1);
    if (!isFloor(c.z, x, y) || (ok && !ok(x, y))) continue;
    const s = c.rng.float(s0, s1);
    c.f.decal(c.rng.weighted(list), x, y, s, s * c.rng.float(0.75, 1.25), undefined, tint);
  }
}

/**
 * Local frame of a store-like room. u runs along the front wall (left to
 * right as seen from outside), v runs from the front row (0) into the room.
 * `front` is the side of the room the entrance wall is on.
 */
export function unitFrame(x0: number, y0: number, x1: number, y1: number, front: Side) {
  const W = front === 'n' || front === 's' ? x1 - x0 + 1 : y1 - y0 + 1;
  const D = front === 'n' || front === 's' ? y1 - y0 + 1 : x1 - x0 + 1;
  const P = (u: number, v: number): [number, number] => {
    switch (front) {
      case 's': return [x0 + u, y1 - v];
      case 'n': return [x1 - u, y0 + v];
      case 'w': return [x0 + v, y0 + u];
      default: return [x1 - v, y1 - u];
    }
  };
  /** top-left anchor of an object spanning `nu` tiles along u and `nv` along v starting at (u, v) */
  const span = (u: number, v: number, nu: number, nv: number): [number, number] => {
    const a = P(u, v), c = P(u + nu - 1, v + nv - 1);
    return [Math.min(a[0], c[0]), Math.min(a[1], c[1])];
  };
  const back: Side = OPP[front];
  const left: Side = front === 's' ? 'w' : front === 'n' ? 'e' : front === 'w' ? 'n' : 's';
  const right: Side = OPP[left];
  /** rotation of a w×d object (w along u) so that its front faces the entrance */
  const toFront: Rot = FACE[front];
  const toBack: Rot = FACE[back];
  /** true if a rot keeps the object's width along u */
  const alongU = (r: Rot) => (front === 'n' || front === 's') === (r % 2 === 0);
  return { W, D, P, span, front, back, left, right, toFront, toBack, alongU };
}
export type UnitFrame = ReturnType<typeof unitFrame>;
