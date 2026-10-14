// Shared helpers for the Alder Lane zones (suburbs, school, hospital): a local
// frame for lots and rooms that can face any direction (so the same house,
// classroom or patient room can be stamped on either side of a street or
// corridor), wall signs, PA speakers and small placement utilities.
import { Zone, TF, TileObject, EdgeObj, Room } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { objDef } from '../objects';
import { Rng } from '../../core/rng';

export type Dir = 'n' | 'e' | 's' | 'w';
export type Rot = 0 | 1 | 2 | 3;
/** local directions: f toward the front (-v), b toward the back (+v), l (-u), r (+u) */
export type LDir = 'f' | 'b' | 'l' | 'r';
const BASE: Record<Dir, number> = { s: 0, w: 1, n: 2, e: 3 };
const LSTEP: Record<LDir, [number, number]> = { f: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] };
/** local rotation that FACES a local direction */
export const LFACE: Record<LDir, number> = { f: 0, l: 1, b: 2, r: 3 };
/** local rotation that puts an object's BACK against the wall on that side */
export const LBACK: Record<LDir, number> = { b: 0, r: 1, f: 2, l: 3 };
/** world rotation with the back against a world wall / facing a world direction */
export const WBACK: Record<Dir, Rot> = { n: 0, e: 1, s: 2, w: 3 };
export const WFACE: Record<Dir, Rot> = { s: 0, w: 1, n: 2, e: 3 };
export const ANG: Record<Dir, number> = { e: 0, s: Math.PI / 2, w: Math.PI, n: -Math.PI / 2 };

/**
 * A rectangle W (along its front) × D (away from the front) whose front faces
 * `front`. Local u runs left→right as seen from outside the front looking in,
 * v runs from the front (v = 0) inward. Negative v reaches beyond the front
 * (the sidewalk and verge in front of a lot).
 */
export class Frame {
  z: Zone;
  constructor(public b: ZoneBuilder, public x0: number, public y0: number, public W: number, public D: number, public front: Dir) { this.z = b.z; }
  get ns() { return this.front === 's' || this.front === 'n'; }
  /** world rect covered by the frame */
  get rect() { return { x0: this.x0, y0: this.y0, x1: this.x0 + (this.ns ? this.W : this.D) - 1, y1: this.y0 + (this.ns ? this.D : this.W) - 1 }; }
  P(u: number, v: number): [number, number] {
    const { x0, y0, W, D } = this;
    switch (this.front) {
      case 's': return [x0 + u, y0 + D - 1 - v];
      case 'n': return [x0 + W - 1 - u, y0 + v];
      case 'w': return [x0 + v, y0 + u];
      default: return [x0 + D - 1 - v, y0 + W - 1 - u];
    }
  }
  rot(lr: number): Rot { return ((((lr + BASE[this.front]) % 4) + 4) % 4) as Rot; }
  face(d: LDir): Rot { return this.rot(LFACE[d]); }
  back(d: LDir): Rot { return this.rot(LBACK[d]); }
  /** world rect [x0, y0, x1, y1] of a local rect */
  R(u0: number, v0: number, u1: number, v1: number): [number, number, number, number] {
    const [ax, ay] = this.P(u0, v0), [bx, by] = this.P(u1, v1);
    return [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)];
  }
  /** world facing angle (radians) of a local direction, for anchors */
  ang(d: LDir): number {
    const [du, dv] = LSTEP[d];
    const [ax, ay] = this.P(0, 0), [bx, by] = this.P(du, dv);
    return Math.atan2(by - ay, bx - ax);
  }
  fill(u0: number, v0: number, u1: number, v1: number, floor: string, h = 0) { const r = this.R(u0, v0, u1, v1); this.b.fillFloor(r[0], r[1], r[2], r[3], floor, h); }
  paper(u0: number, v0: number, u1: number, v1: number, tex: string) { const r = this.R(u0, v0, u1, v1); this.b.paper(r[0], r[1], r[2], r[3], tex); }
  flag(u0: number, v0: number, u1: number, v1: number, fl: number, on = true) { const r = this.R(u0, v0, u1, v1); this.b.flag(r[0], r[1], r[2], r[3], fl, on); }
  room(name: string, type: string, u0: number, v0: number, u1: number, v1: number, o: Partial<Room> = {}): Room {
    const r = this.R(u0, v0, u1, v1);
    return this.b.addRoom(name, type, Math.max(0, r[0]), Math.max(0, r[1]), Math.min(this.z.W - 1, r[2]), Math.min(this.z.H - 1, r[3]), o);
  }
  /** world edge between local tile (u, v) and its neighbour toward d */
  edge(u: number, v: number, d: LDir): [number, number, 0 | 1] {
    const [ax, ay] = this.P(u, v);
    const [du, dv] = LSTEP[d];
    const [bx, by] = this.P(u + du, v + dv);
    if (ay !== by) return [ax, Math.max(ay, by), 0];
    return [Math.max(ax, bx), ay, 1];
  }
  wall(u: number, v: number, d: LDir, wall = 'drywall') {
    const [x, y, s] = this.edge(u, v, d);
    if (!this.z.inb(x, y)) return;
    if (s === 0) this.b.hwall(x, x, y, wall); else this.b.vwall(x, y, y, wall);
  }
  /** walls on side d of the tiles u0..u1 of row v */
  wallU(u0: number, u1: number, v: number, d: LDir, wall = 'drywall') { for (let u = u0; u <= u1; u++) this.wall(u, v, d, wall); }
  /** walls on side d of the tiles v0..v1 of column u */
  wallV(u: number, v0: number, v1: number, d: LDir, wall = 'drywall') { for (let v = v0; v <= v1; v++) this.wall(u, v, d, wall); }
  walls(u0: number, v0: number, u1: number, v1: number, wall = 'drywall') {
    this.wallU(u0, u1, v0, 'f', wall); this.wallU(u0, u1, v1, 'b', wall);
    this.wallV(u0, v0, v1, 'l', wall); this.wallV(u1, v0, v1, 'r', wall);
  }
  door(u: number, v: number, d: LDir, style = 'door_house', o: Partial<EdgeObj> = {}): EdgeObj | null {
    const [x, y, s] = this.edge(u, v, d);
    if (!this.z.inb(x, y) || (s === 0 ? y < 1 : x < 1)) return null;
    return this.b.door(x, y, s, style, o);
  }
  window(u: number, v: number, d: LDir, o: Partial<EdgeObj> = {}): EdgeObj | null {
    const [x, y, s] = this.edge(u, v, d);
    if (!this.z.inb(x, y) || (s === 0 ? y < 1 : x < 1)) return null;
    // curtains hang on the inside: the side of tile (u, v)
    const [tx, ty] = this.P(u, v);
    const side: 1 | -1 = (tx === x && ty === y) ? 1 : -1;
    return this.b.window(x, y, s, { curtainSide: side, ...o });
  }
  gap(u: number, v: number, d: LDir) { const [x, y, s] = this.edge(u, v, d); if (this.z.inb(x, y)) this.b.gap(x, y, s); }
  /** world anchor tile + rotation for an object whose local footprint starts at (u, v) */
  place(key: string, u: number, v: number, lr: number): [number, number, Rot] | null {
    const def = objDef(key);
    if (!def) return null;
    const R = this.rot(lr);
    const w = def.w ?? 1, d = def.d ?? 1;
    const rw = R % 2 === 0 ? w : d, rd = R % 2 === 0 ? d : w;
    const du = this.ns ? rw : rd, dv = this.ns ? rd : rw;
    const r = this.R(u, v, u + du - 1, v + dv - 1);
    return [r[0], r[1], R];
  }
  /** forced placement */
  obj(key: string, u: number, v: number, lr: number, state: Record<string, any> = {}): TileObject | null {
    const p = this.place(key, u, v, lr);
    if (!p || !this.z.inb(p[0], p[1])) return null;
    return this.b.obj(key, p[0], p[1], p[2], state);
  }
  /** placement only where the footprint is free */
  put(f: Furnisher, key: string, u: number, v: number, lr: number, state: Record<string, any> = {}): TileObject | null {
    const p = this.place(key, u, v, lr);
    if (!p || !this.z.inb(p[0], p[1])) return null;
    return f.place(key, p[0], p[1], p[2], state);
  }
  /** wall-mounted prop on tile (u, v) against its wall toward d */
  mount(key: string, u: number, v: number, d: LDir, state: Record<string, any> = {}): TileObject | null {
    return this.obj(key, u, v, LBACK[d], state);
  }
  /** ceiling light */
  lamp(u: number, v: number, circuit: number, kind: 'light_fluoro' | 'light_bulb' = 'light_bulb', o: Record<string, any> = {}): TileObject | null {
    const [x, y] = this.P(u, v);
    if (!this.z.inb(x, y) || !this.z.floor[this.z.idx(x, y)]) return null;
    return this.b.obj(kind, x, y, 0, { circuit, ...o });
  }
  /** world centre of a local tile (for decals) */
  C(u: number, v: number): [number, number] { const [x, y] = this.P(u, v); return [x + 0.5, y + 0.5]; }
}

/** wall-mounted prop on world tile (x, y) against its wall on side `side` */
export function wallAt(b: ZoneBuilder, key: string, x: number, y: number, side: Dir, state: Record<string, any> = {}) {
  if (!b.z.inb(x, y)) return null;
  return b.obj(key, x, y, WBACK[side], state);
}
/** a sign plate on a wall */
export function signAt(b: ZoneBuilder, x: number, y: number, side: Dir, label: string, h?: number) {
  return wallAt(b, 'zg_sign', x, y, side, h === undefined ? { label } : { label, h });
}

/** the edge between two orthogonally adjacent world tiles */
export function edgeBetween(ax: number, ay: number, bx: number, by: number): [number, number, 0 | 1] {
  if (ay !== by) return [ax, Math.max(ay, by), 0];
  return [Math.max(ax, bx), ay, 1];
}

/** tile is floored and nothing stands on it */
export function openTile(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  return z.floor[i] !== 0 && z.solid[i] === 0 && !z.objectsAt(x, y).some((o) => !objDef(o.key)?.ceiling);
}

/** a decal at an exact spot (no jitter) */
export function decal(z: Zone, tex: string, x: number, y: number, w = 1, d = 1, rot = 0, tint?: number, alpha?: number) {
  const dc: any = { x, z: y, w, d, rot, tex };
  if (tint !== undefined) dc.tint = tint;
  if (alpha !== undefined) dc.alpha = alpha;
  z.decals.push(dc);
}

/** scatter decals over floored, non-shifting tiles of a rect */
export function scatter(f: Furnisher, rng: Rng, x0: number, y0: number, x1: number, y1: number, n: number, list: [string, number][], s0 = 0.7, s1 = 1.5, pred?: (x: number, y: number) => boolean) {
  const z = f.z;
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)] || (z.flags[z.idx(x, y)] & TF.SHIFT)) continue;
    if (pred && !pred(x, y)) continue;
    const s = rng.float(s0, s1);
    f.decal(rng.weighted(list), x, y, s, s * rng.float(0.8, 1.2));
  }
}

/** drop floor loot on open, non-shifting tiles of a rect */
export function lootIn(f: Furnisher, rng: Rng, table: string, x0: number, y0: number, x1: number, y1: number, n: number, pred?: (x: number, y: number) => boolean) {
  const z = f.z;
  let placed = 0;
  for (let t = 0; t < n * 8 && placed < n; t++) {
    const x = rng.int(x0, x1), y = rng.int(y0, y1);
    if (!z.inb(x, y)) continue;
    const i = z.idx(x, y);
    if (!z.floor[i] || z.solid[i] === 1 || z.solid[i] === 3 || (z.flags[i] & TF.SHIFT)) continue;
    if (pred && !pred(x, y)) continue;
    f.floorLoot(table, x, y);
    placed++;
  }
}

/** arrival point: anchor + no-spawn bubble */
export function arrive(b: ZoneBuilder, id: string, x: number, y: number, face?: number, r = 4) {
  (b.z.meta.anchors ||= {})[id] = face === undefined ? [x, y] : [x, y, face];
  b.flag(x - r, y - r, x + r, y + r, TF.NOSPAWN);
}
