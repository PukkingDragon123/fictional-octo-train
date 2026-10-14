// Shared helpers for the dreamcore zones (pools, fields, house): carving
// rooms out of void, anchors, height steps, decal scatter and repeated
// "identical" stretches used by loop portals.
import { Zone, TF, Decal } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { objDef } from '../objects';

export type Rot = 0 | 1 | 2 | 3;
/** facing angles for anchors (0 = east, PI/2 = south) */
export const FACE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

export function anchorsOf(z: Zone): Record<string, number[]> { return (z.meta.anchors ||= {}); }

/** arrival anchor + a no-spawn bubble around it */
export function setAnchor(b: ZoneBuilder, id: string, x: number, y: number, face?: number, safeR = 3) {
  anchorsOf(b.z)[id] = face === undefined ? [x, y] : [x, y, face];
  b.flag(x - safeR, y - safeR, x + safeR, y + safeR, TF.NOSPAWN);
}

/** floor + walls + wallpaper for a rectangular room */
export function shell(b: ZoneBuilder, x0: number, y0: number, x1: number, y1: number, floor: string, wall: string, paper?: string, h = 0) {
  b.fillFloor(x0, y0, x1, y1, floor, h);
  b.roomWalls(x0, y0, x1, y1, wall);
  if (paper) b.paper(x0, y0, x1, y1, paper);
}

/** open a run of wall edges (side 0: tiles x..x+n-1 on north edge of row y; side 1: rows y..y+n-1 on west edge of column x) */
export function opening(b: ZoneBuilder, x: number, y: number, side: 0 | 1, n = 1, kind: 'gap' | 'arch' = 'gap') {
  for (let i = 0; i < n; i++) {
    const X = side === 0 ? x + i : x, Y = side === 0 ? y : y + i;
    if (kind === 'arch') { b.gap(X, Y, side); b.arch(X, Y, side); } else b.gap(X, Y, side);
  }
}

/**
 * Void tiles take the lowest height of their floored neighbours, so walls
 * between a sunken floor (water, basement) and nothing start at the floor
 * instead of floating above it.
 */
export function settleVoidHeights(z: Zone) {
  const out: [number, number][] = [];
  for (let y = 0; y < z.H; y++) for (let x = 0; x < z.W; x++) {
    const i = z.idx(x, y);
    if (z.floor[i]) continue;
    let m = 999;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!z.inb(X, Y)) continue;
      const j = z.idx(X, Y);
      if (z.floor[j]) m = Math.min(m, z.height[j]);
    }
    if (m !== 999) out.push([i, m]);
  }
  for (const [i, m] of out) z.height[i] = m;
}

/** set a rectangle's floor height without touching the floor type */
export function setHeight(z: Zone, x0: number, y0: number, x1: number, y1: number, h: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (z.inb(x, y)) z.height[z.idx(x, y)] = Math.round(h * 10);
}

/** exact decal (no jitter) */
export function decalAt(z: Zone, tex: string, x: number, y: number, w: number, d: number, rot = 0, tint?: number, alpha?: number) {
  const dc: Decal = { x, z: y, w, d, rot, tex };
  if (tint !== undefined) dc.tint = tint;
  if (alpha !== undefined) dc.alpha = alpha;
  z.decals.push(dc);
}

/** scatter n decals on floored tiles of a rect */
export function scatterDecals(f: Furnisher, rng: Rng, x0: number, y0: number, x1: number, y1: number, n: number, list: [string, number][], s0 = 0.8, s1 = 1.6, pred?: (x: number, y: number) => boolean) {
  const z = f.z;
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)]) continue;
    if (pred && !pred(x, y)) continue;
    const s = rng.float(s0, s1);
    f.decal(rng.weighted(list), x, y, s, s * rng.float(0.7, 1.3));
  }
}

/** scatter floor loot on free, floored tiles of a rect */
export function scatterLoot(f: Furnisher, rng: Rng, table: string, x0: number, y0: number, x1: number, y1: number, n: number, pred?: (x: number, y: number) => boolean) {
  const z = f.z;
  let placed = 0;
  for (let t = 0; t < n * 6 && placed < n; t++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (!z.inb(x, y)) continue;
    const i = z.idx(x, y);
    if (!z.floor[i] || z.solid[i]) continue;
    if (pred && !pred(x, y)) continue;
    f.floorLoot(table, x, y);
    placed++;
  }
}

/** place an object, falling back to a forced placement when the footprint test fails */
export function put(b: ZoneBuilder, f: Furnisher, key: string, x: number, y: number, rot: Rot = 0, state: Record<string, any> = {}) {
  if (!objDef(key)) return null;
  return f.place(key, x, y, rot, state) || b.obj(key, x, y, rot, state);
}

/** is every tile in the rect floored (and optionally free of solid furniture)? */
export function rectWalkable(z: Zone, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!z.inb(x, y)) return false;
    const i = z.idx(x, y);
    if (!z.floor[i] || z.solid[i] === 1 || z.solid[i] === 3) return false;
  }
  return true;
}

/**
 * Wall-mounted objects ignore floor height when rendered; on raised or sunken
 * floors (upstairs, basements) lift them by the tile height via state.y.
 */
export function liftWallObjects(z: Zone, x0 = 0, y0 = 0, x1 = z.W - 1, y1 = z.H - 1) {
  for (const o of z.objects.values()) {
    if (o.x < x0 || o.x > x1 || o.y < y0 || o.y > y1) continue;
    if (!objDef(o.key)?.onWall || o.state.y !== undefined) continue;
    const h = z.heightAt(o.x, o.y);
    if (h) o.state.y = h;
  }
}

/** pick from a list deterministically by integer key */
export function pickBy<T>(arr: readonly T[], k: number): T { return arr[((k % arr.length) + arr.length) % arr.length]; }
