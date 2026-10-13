import { Zone, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { objDef } from '../objects';
import { Rng } from '../../core/rng';
import { createItem } from '../../items/factory';
import { dropItem } from '../../items/worldItems';
import { rollLoot } from '../../items/loot';
import { hasItemDef } from '../../items/item';

/** Which edges of a tile have a wall: n,e,s,w */
export function wallsOf(z: Zone, x: number, y: number) {
  const W = (xx: number, yy: number) => z.inb(xx, yy) ? z.wallW[z.idx(xx, yy)] !== 0 && !z.edge(xx, yy, 1) : xx === z.W;
  const N = (xx: number, yy: number) => z.inb(xx, yy) ? z.wallN[z.idx(xx, yy)] !== 0 && !z.edge(xx, yy, 0) : yy === z.H;
  return { n: N(x, y), s: N(x, y + 1), w: W(x, y), e: W(x + 1, y) };
}

/** rotation so an object's back sits against an adjacent wall (front faces into the room) */
export function rotAgainstWall(z: Zone, x: number, y: number, rng: Rng): 0 | 1 | 2 | 3 | -1 {
  const w = wallsOf(z, x, y);
  const opts: (0 | 1 | 2 | 3)[] = [];
  // back of a rot-0 object is north; rot 1 back is east; rot 2 back south; rot 3 back west
  if (w.n) opts.push(0); if (w.e) opts.push(1); if (w.s) opts.push(2); if (w.w) opts.push(3);
  if (!opts.length) return -1;
  return rng.pick(opts);
}

/** rotation for wall-mounted objects (prefer camera-visible walls: north, then west) */
export function rotForWallMount(z: Zone, x: number, y: number, rng: Rng, visibleOnly = true): 0 | 1 | 2 | 3 | -1 {
  const w = wallsOf(z, x, y);
  const opts: (0 | 1 | 2 | 3)[] = [];
  if (w.n) opts.push(0); if (w.w) opts.push(3);
  if (!visibleOnly) { if (w.e) opts.push(1); if (w.s) opts.push(2); }
  if (!opts.length) return -1;
  return rng.pick(opts);
}

export class Furnisher {
  constructor(public b: ZoneBuilder, public rng: Rng) {}
  get z() { return this.b.z; }

  has(key: string) { return !!objDef(key); }

  /** place if possible (footprint free) */
  place(key: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0, state: Record<string, any> = {}): TileObject | null {
    const d = objDef(key); if (!d) return null;
    const w = d.w ?? 1, dd = d.d ?? 1;
    const rw = rot % 2 === 0 ? w : dd, rd = rot % 2 === 0 ? dd : w;
    if (!d.onWall && !d.ceiling && !this.b.free(x, y, rw, rd)) return null;
    return this.b.obj(key, x, y, rot, state);
  }

  /** place against a wall somewhere inside rect */
  againstWall(key: string, x0: number, y0: number, x1: number, y1: number, tries = 30, state: Record<string, any> = {}): TileObject | null {
    const d = objDef(key); if (!d) return null;
    for (let t = 0; t < tries; t++) {
      const x = this.rng.int(x0, x1), y = this.rng.int(y0, y1);
      const r = rotAgainstWall(this.z, x, y, this.rng);
      if (r < 0) continue;
      const o = this.place(key, x, y, r as any, state);
      if (o) return o;
    }
    return null;
  }

  /** mount on a wall inside rect */
  onWall(key: string, x0: number, y0: number, x1: number, y1: number, tries = 30, state: Record<string, any> = {}): TileObject | null {
    const d = objDef(key); if (!d) return null;
    for (let t = 0; t < tries; t++) {
      const x = this.rng.int(x0, x1), y = this.rng.int(y0, y1);
      const r = rotForWallMount(this.z, x, y, this.rng);
      if (r < 0) continue;
      // avoid two wall objects on the same tile
      if (this.z.objectsAt(x, y).some((o) => objDef(o.key)?.onWall)) continue;
      return this.b.obj(key, x, y, r as any, state);
    }
    return null;
  }

  /** small object sitting on top of another (microwave on counter) */
  onTop(key: string, base: TileObject | null, state: Record<string, any> = {}): TileObject | null {
    if (!base) return null;
    const bd = objDef(base.key), d = objDef(key);
    if (!bd || !d) return null;
    const y = bd.surface ?? bd.height;
    return this.b.obj(key, base.x, base.y, base.rot, { ...state, y });
  }

  anywhere(key: string, x0: number, y0: number, x1: number, y1: number, tries = 20, state: Record<string, any> = {}): TileObject | null {
    for (let t = 0; t < tries; t++) {
      const o = this.place(key, this.rng.int(x0, x1), this.rng.int(y0, y1), this.rng.int(0, 3) as any, state);
      if (o) return o;
    }
    return null;
  }

  /** drop loose items on the floor (rolled from a loot table) */
  floorLoot(table: string, x: number, y: number, mult = 1) {
    for (const k of rollLoot(table, this.rng, mult)) {
      if (!hasItemDef(k)) continue;
      dropItem(this.z, createItem(k, this.rng), x + 0.5, y + 0.5, undefined, 0.6);
    }
  }
  floorItem(key: string, x: number, y: number, data?: Record<string, any>) {
    if (!hasItemDef(key)) return null;
    const it = createItem(key, this.rng);
    if (data) it.data = { ...(it.data || {}), ...data };
    dropItem(this.z, it, x + 0.5, y + 0.5, undefined, 0.5);
    return it;
  }

  decal(tex: string, x: number, y: number, w = 1, d = 1, rot?: number, tint?: number) {
    this.z.decals.push({ x: x + 0.5 + (this.rng.next() - 0.5) * 0.4, z: y + 0.5 + (this.rng.next() - 0.5) * 0.4, w, d, rot: rot ?? this.rng.float(0, Math.PI * 2), tex, tint });
  }
}
