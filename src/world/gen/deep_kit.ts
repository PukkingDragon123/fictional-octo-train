// Shared helpers for the deep zones (service tunnels, Facility 4, the
// unrendered region): a region painter that raises walls wherever two
// regions meet, floor stencils, wall mounts on a named side, light helpers
// and scatter passes that keep clear of shifting regions and portals.
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { floorId, wallId } from '../defs';
import { objDef } from '../objects';
import { zgFloorWord } from '../../content/furniture/zg_deep';

export type Rot = 0 | 1 | 2 | 3;
export type Side = 'n' | 'e' | 's' | 'w';
/** rotation that puts an object's BACK against the given wall */
export const BACK: Record<Side, Rot> = { n: 0, e: 1, s: 2, w: 3 };
/** rotation that makes an object FACE the given direction */
export const FACE: Record<Side, Rot> = { s: 0, w: 1, n: 2, e: 3 };
/** player facing angles for anchors */
export const ANG: Record<Side, number> = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export const rect = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
export const inRect = (r: Rect, x: number, y: number, m = 0) => x >= r.x0 - m && x <= r.x1 + m && y >= r.y0 - m && y <= r.y1 + m;
export const overlaps = (a: Rect, b: Rect, m = 0) => a.x0 <= b.x1 + m && a.x1 >= b.x0 - m && a.y0 <= b.y1 + m && a.y1 >= b.y0 - m;

/**
 * Region painter. Every tile carries a region id (0 = solid rock / nothing).
 * `build` raises a wall on every edge between two different regions unless
 * the edge was opened or the caller says the two regions join freely.
 */
export class Regions {
  readonly id: Int32Array;
  private open = new Set<number>();
  private seq = 10;
  constructor(public z: Zone) { this.id = new Int32Array(z.W * z.H); }
  next() { return this.seq++; }
  at(x: number, y: number) { return this.z.inb(x, y) ? this.id[this.z.idx(x, y)] : 0; }
  paint(x0: number, y0: number, x1: number, y1: number, id: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.z.inb(x, y)) this.id[this.z.idx(x, y)] = id;
  }
  /** paint + floor */
  area(b: ZoneBuilder, x0: number, y0: number, x1: number, y1: number, id: number, floor: string, h = 0) {
    this.paint(x0, y0, x1, y1, id);
    b.fillFloor(x0, y0, x1, y1, floor, h);
  }
  clear(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.z.inb(x, y)) { const i = this.z.idx(x, y); this.id[i] = 0; this.z.floor[i] = 0; this.z.height[i] = 0; }
  }
  /** never wall this edge (side 0 = north edge of x,y; 1 = west edge) */
  openEdge(x: number, y: number, side: 0 | 1) { this.open.add((y * this.z.W + x) * 2 + side); }
  isOpen(x: number, y: number, side: 0 | 1) { return this.open.has((y * this.z.W + x) * 2 + side); }
  /**
   * Raise walls. `join(a, b)` true = no wall between regions a and b.
   * `wallFor(a, b)` names the wall (a is the region on the south/east side, may be 0).
   */
  build(b: ZoneBuilder, join: (a: number, b: number) => boolean, wallFor: (a: number, b: number) => string, area?: Rect) {
    const z = this.z, W = z.W;
    const x0 = area ? area.x0 : 0, y0 = area ? area.y0 : 0, x1 = area ? area.x1 + 1 : z.W - 1, y1 = area ? area.y1 + 1 : z.H - 1;
    const cache = new Map<string, number>();
    const wid = (k: string) => { let v = cache.get(k); if (v === undefined) { v = wallId(k); cache.set(k, v); } return v; };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!z.inb(x, y)) continue;
      const i = y * W + x, a = this.id[i];
      for (const side of [0, 1] as const) {
        const nx = side === 1 ? x - 1 : x, ny = side === 0 ? y - 1 : y;
        const bb = z.inb(nx, ny) ? this.id[ny * W + nx] : 0;
        if (a === bb) continue;
        if (this.open.has(i * 2 + side) || join(a, bb)) { if (side === 0) z.wallN[i] = 0; else z.wallW[i] = 0; continue; }
        const w = wid(wallFor(a, bb));
        if (side === 0) z.wallN[i] = w; else z.wallW[i] = w;
      }
    }
  }
}

/** walls on every edge between a floored tile and nothing, inside a rect */
export function wallVoidEdges(z: Zone, r: Rect, wall: string) {
  const w = wallId(wall);
  for (let y = r.y0; y <= r.y1 + 1; y++) for (let x = r.x0; x <= r.x1 + 1; x++) {
    if (!z.inb(x, y)) continue;
    const i = z.idx(x, y), f = z.floor[i] !== 0;
    if (y > 0) { const g = z.floor[z.idx(x, y - 1)] !== 0; if (f !== g && !z.edge(x, y, 0)) z.wallN[i] = w; }
    if (x > 0) { const g = z.floor[z.idx(x - 1, y)] !== 0; if (f !== g && !z.edge(x, y, 1)) z.wallW[i] = w; }
  }
}

/** wall-mounted object against wall `side` of tile (x,y) */
export function mount(b: ZoneBuilder, key: string, x: number, y: number, side: Side, state: Record<string, any> = {}): TileObject | null {
  return b.obj(key, x, y, BACK[side], state);
}

/** free floor tile (no solid furniture, no objects except ceiling fixtures) */
export function freeTile(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return false;
  return !z.objectsAt(x, y).some((o) => !objDef(o.key)?.ceiling);
}

/** place only if the footprint is free */
export function put(f: Furnisher, key: string, x: number, y: number, rot: Rot = 0, state: Record<string, any> = {}) {
  return f.place(key, x, y, rot, state);
}

/** ceiling lamp object on a circuit */
export function bulb(b: ZoneBuilder, x: number, y: number, circuit: number, o: { kind?: 'light_bulb' | 'light_fluoro'; flicker?: number; broken?: boolean; y?: number } = {}) {
  if (!b.z.inb(x, y) || !b.z.floor[b.z.idx(x, y)]) return null;
  const s: Record<string, any> = { circuit, flicker: o.flicker ?? 0, broken: o.broken ?? false };
  if (o.y !== undefined) s.y = o.y;
  return b.obj(o.kind ?? 'light_bulb', x, y, 0, s);
}

/** an exact decal (centre x,y in world units) */
export function decalAt(z: Zone, tex: string, x: number, y: number, w: number, d: number, rot = 0, tint?: number, alpha?: number, h?: number) {
  const dc: any = { x, z: y, w, d, rot, tex };
  if (tint !== undefined) dc.tint = tint;
  if (alpha !== undefined) dc.alpha = alpha;
  if (h !== undefined) dc.y = h;
  z.decals.push(dc);
}

/** a painted word on the floor, centred on (x, y) world units; `rot` turns it */
export function stencil(z: Zone, word: string, x: number, y: number, len: number, rot = 0, tint = 0xd8b030, h?: number) {
  decalAt(z, zgFloorWord(word), x, y, len, len * 0.32, rot, tint, undefined, h);
}
/** a painted arrow pointing toward `dir` */
export function arrow(z: Zone, x: number, y: number, dir: Side, len = 1.2, tint = 0xd8b030, h?: number) {
  const rot = dir === 'e' ? 0 : dir === 's' ? Math.PI / 2 : dir === 'w' ? Math.PI : -Math.PI / 2;
  decalAt(z, 'zg_fw_arrow', x, y, len, len * 0.5, rot, tint, undefined, h);
}

/** anchor + no-spawn bubble */
export function anchorAt(b: ZoneBuilder, id: string, x: number, y: number, face?: Side, safeR = 3) {
  (b.z.meta.anchors ||= {})[id] = face === undefined ? [x, y] : [x, y, ANG[face]];
  if (safeR > 0) b.flag(x - safeR, y - safeR, x + safeR, y + safeR, TF.NOSPAWN);
}

/** tiles not usable for scatter: shifting regions, portals, solid, void */
export function scatterOk(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return false;
  if (z.flags[i] & TF.SHIFT) return false;
  for (const p of z.portals) if (p.x === x && p.y === y) return false;
  return true;
}

/** scatter decals on floored, non-shifting tiles */
export function scatterDecals(f: Furnisher, rng: Rng, r: Rect, n: number, list: [string, number][], s0 = 0.8, s1 = 1.6, pred?: (x: number, y: number) => boolean, tint?: number) {
  const z = f.z;
  for (let k = 0; k < n; k++) {
    const x = rng.int(r.x0, r.x1), y = rng.int(r.y0, r.y1);
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || (z.flags[z.idx(x, y)] & TF.SHIFT)) continue;
    if (pred && !pred(x, y)) continue;
    const s = rng.float(s0, s1);
    f.decal(rng.weighted(list), x, y, s, s * rng.float(0.7, 1.3), undefined, tint);
  }
}

/** scatter floor loot on free, non-shifting tiles */
export function scatterLoot(f: Furnisher, rng: Rng, table: string, r: Rect, n: number, pred?: (x: number, y: number) => boolean) {
  const z = f.z;
  let placed = 0;
  for (let t = 0; t < n * 8 && placed < n; t++) {
    const x = rng.int(r.x0, r.x1), y = rng.int(r.y0, r.y1);
    if (!scatterOk(z, x, y)) continue;
    if (pred && !pred(x, y)) continue;
    f.floorLoot(table, x, y);
    placed++;
  }
}

/** set heights of a rect without touching floor types */
export function setHeight(z: Zone, r: Rect, h: number) {
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (z.inb(x, y)) z.height[z.idx(x, y)] = Math.round(h * 10);
}

/** floor id test */
export const floorIs = (z: Zone, x: number, y: number, key: string) => z.inb(x, y) && z.floor[z.idx(x, y)] === floorId(key);

/** lift wall-mounted props by the floor height of their tile (raised/sunken floors) */
export function liftWallObjects(z: Zone, r?: Rect) {
  for (const o of z.objects.values()) {
    if (r && !inRect(r, o.x, o.y)) continue;
    if (!objDef(o.key)?.onWall || o.state.y !== undefined) continue;
    const h = z.heightAt(o.x, o.y);
    if (h) o.state.y = h;
  }
}

/** void tiles take the lowest neighbouring floor height (walls start at the floor) */
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
