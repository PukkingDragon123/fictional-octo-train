// Persistent blood. Every decal that stays is created through the replicated,
// saved 'decal' op (game/worldOps.ts), committed in small batches so one
// chunk rebuild covers a whole hit. Things that have to be seen before they
// are committed (pools spreading under a corpse, fresh footprints, drip
// trails) are drawn by a tiny transient layer until the committed copy lands
// in the zone. Density caps per tile and per zone (a replicated 'goreTrim'
// op drops the oldest gore decals) keep long games fast.
import * as THREE from 'three';
import { G } from '../game/G';
import { op, defOp } from '../game/ops';
import { Zone, Decal, CHUNK } from '../world/zone';
import { wallDef, WALL_H } from '../world/defs';
import { ModelBuilder } from '../gfx/modelBuilder';
import { MAT } from '../gfx/materials';
import { isGoreTex, liquidPal } from './kinds';

/** drop the oldest n gore decals of a zone (deterministic on every peer, replays in order) */
defOp('goreTrim', (a: { z: string; n: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  let n = a.n;
  const keep: Decal[] = [];
  for (const d of z.decals) {
    if (n > 0 && isGoreTex(d.tex)) { n--; z.markDirty(Math.floor(d.x), Math.floor(d.z)); continue; }
    keep.push(d);
  }
  z.decals = keep;
  G.gore?.decals?.zoneTrimmed?.(z);
});

interface ZoneStats { count: number; tiles: Map<number, number>; pools: { x: number; z: number; r: number }[] }
interface Transient { z: string; d: Decal; key: string; born: number; grow: number; landed: boolean; until: number }
export interface Fresh { z: string; x: number; zz: number; r: number; t: number; tint: number; pool: boolean }

const r2 = (v: number) => Math.round(v * 100) / 100;
export const decalKey = (d: Decal) => `${d.tex}|${d.x}|${d.z}`;

export class GoreDecals {
  private queue: { z: string; d: Decal; at: number }[] = [];
  private lastFlush = new Map<string, number>();
  private trans: Transient[] = [];
  private transKeys = new Map<string, Transient>();
  private seen = new WeakSet<Decal>();
  private stats = new Map<string, ZoneStats>();
  private scanned = new Set<string>();
  private lastLen = new Map<string, number>();
  /** decals this peer queued (already counted in the tile stats) */
  private reserved = new Set<string>();
  private mesh: THREE.Mesh | null = null;
  private meshDirty = false;
  fresh: Fresh[] = [];
  root: THREE.Group;

  constructor(root: THREE.Group) { this.root = root; }

  /** caps by gore level */
  get zoneCap() { return (G.sandbox.gore ?? 2) >= 2 ? 1400 : 700; }
  get tileCap() { return (G.sandbox.gore ?? 2) >= 2 ? 5 : 3; }

  stat(z: Zone): ZoneStats {
    let s = this.stats.get(z.key);
    if (!s) {
      s = { count: 0, tiles: new Map(), pools: [] };
      for (const d of z.decals) if (isGoreTex(d.tex)) this.count(z, s, d);
      this.stats.set(z.key, s);
    }
    return s;
  }
  private count(z: Zone, s: ZoneStats, d: Decal) {
    s.count++;
    const ti = z.idx(Math.floor(d.x), Math.floor(d.z)) * 2 + (d.vert ? 1 : 0);
    s.tiles.set(ti, (s.tiles.get(ti) ?? 0) + 1);
    if (d.tex.endsWith('_pool')) s.pools.push({ x: d.x, z: d.z, r: d.w * 0.35 });
  }
  zoneTrimmed(z: Zone) { this.stats.delete(z.key); this.lastLen.set(z.key, -1); }

  /** room for another gore decal here? */
  hasRoom(z: Zone, x: number, zz: number, vert = false, pool = false): boolean {
    const s = this.stat(z);
    if (pool) return !s.pools.some((p) => Math.hypot(p.x - x, p.z - zz) < Math.max(0.5, p.r));
    const ti = z.idx(Math.floor(x), Math.floor(zz)) * 2 + (vert ? 1 : 0);
    return (s.tiles.get(ti) ?? 0) < (vert ? 3 : this.tileCap);
  }

  /**
   * Queue a persistent decal (only the peer that owns the event calls this:
   * the host for creatures, a survivor's own machine for their blood).
   * `show` draws it right away on this peer until the committed copy lands.
   */
  commit(z: Zone, d: Decal, delay = 0, opts: { force?: boolean; show?: boolean; grow?: number } = {}): Decal | null {
    if (!z.inb(Math.floor(d.x), Math.floor(d.z)) || !z.floor[z.idx(Math.floor(d.x), Math.floor(d.z))]) return null;
    const pool = d.tex.endsWith('_pool');
    if (!opts.force && !this.hasRoom(z, d.x, d.z, !!d.vert, pool)) return null;
    const dd: Decal = { x: r2(d.x), z: r2(d.z), w: r2(d.w), d: r2(d.d), rot: r2(d.rot), tex: d.tex };
    if (d.y !== undefined) dd.y = r2(d.y);
    if (d.tint !== undefined && d.tint !== 0xffffff) dd.tint = d.tint;
    if (d.vert) dd.vert = 1;
    // reserve the slot now so a burst of hits doesn't overfill one tile
    const s = this.stat(z);
    const ti = z.idx(Math.floor(dd.x), Math.floor(dd.z)) * 2 + (dd.vert ? 1 : 0);
    s.tiles.set(ti, (s.tiles.get(ti) ?? 0) + 1);
    if (pool) s.pools.push({ x: dd.x, z: dd.z, r: dd.w * 0.35 });
    this.reserved.add(decalKey(dd));
    this.queue.push({ z: z.key, d: dd, at: G.time + delay });
    if (opts.show || opts.grow) this.show(z.key, dd, opts.grow ?? 0, delay + 8);
    return dd;
  }

  /** draw a decal locally before (or instead of) its committed copy; grow = seconds to spread from nothing */
  show(zk: string, d: Decal, grow = 0, ttl = 12) {
    const key = decalKey(d);
    if (this.transKeys.has(key)) return;
    const t: Transient = { z: zk, d, key, born: G.time, grow, landed: false, until: G.time + Math.max(ttl, grow + 4) };
    this.trans.push(t); this.transKeys.set(key, t);
    if (this.trans.length > 160) { const o = this.trans.shift()!; this.transKeys.delete(o.key); }
    this.meshDirty = true;
  }

  update(dt: number) {
    void dt;
    // commit due decals, one batch per zone (with anything due very soon) so a single chunk rebuild covers them
    if (this.queue.length) {
      const now = G.time;
      const ready = new Set<string>();
      for (const q of this.queue) if (q.at <= now && now - (this.lastFlush.get(q.z) ?? -9) > 0.15) ready.add(q.z);
      if (ready.size) {
        const rest: typeof this.queue = [];
        const due = new Map<string, Decal[]>();
        for (const q of this.queue) {
          if (ready.has(q.z) && q.at <= now + 0.3) { let a = due.get(q.z); if (!a) due.set(q.z, a = []); a.push(q.d); }
          else rest.push(q);
        }
        this.queue = rest;
        for (const [zk, list] of due) {
          this.lastFlush.set(zk, now);
          for (const d of list) op('decal', { z: zk, d });
          const z = G.zones.get(zk);
          if (z && G.role !== 'client') {
            // stay under the zone's cap, and well clear of the 4000-decal limit that would eat the level's own decals
            const s = this.stat(z);
            const cap = Math.max(100, Math.min(this.zoneCap, 3800 - (z.decals.length - s.count)));
            if (s.count > cap) op('goreTrim', { z: zk, n: Math.max(20, Math.round(cap * 0.15)) });
          }
        }
      }
    }
    this.scan();
    this.updateTransient();
  }

  /** notice newly added decals in every zone: stats, wet blood, landed transients */
  private scan() {
    for (const z of G.zones.values()) {
      const L = z.decals.length;
      if (!this.scanned.has(z.key)) {
        // existing decals (generation, saves, late join) are old and dry
        this.scanned.add(z.key);
        for (const d of z.decals) this.seen.add(d);
        this.lastLen.set(z.key, L);
        continue;
      }
      if (this.lastLen.get(z.key) === L && (!L || this.seen.has(z.decals[L - 1]))) continue;
      this.lastLen.set(z.key, L);
      const s = this.stat(z);
      for (let i = L - 1; i >= 0; i--) {
        const d = z.decals[i];
        if (this.seen.has(d)) break;
        this.seen.add(d);
        if (!isGoreTex(d.tex)) continue;
        const key = decalKey(d);
        if (this.reserved.delete(key)) s.count++;
        else this.count(z, s, d);
        const t = this.transKeys.get(key);
        if (t) { t.landed = true; }
        if (!d.vert && liquidPal(d.tex) && !d.tex.includes('_print')) {
          this.fresh.push({ z: z.key, x: d.x, zz: d.z, r: Math.max(0.12, Math.min(d.w, d.d) * 0.42), t: G.time, tint: d.tint ?? 0xffffff, pool: d.tex.endsWith('_pool') || d.tex.endsWith('_smear') });
        }
      }
    }
    if (this.fresh.length > 260) this.fresh.splice(0, this.fresh.length - 260);
  }

  /** wettest fresh blood under (x, z): 0 none .. 1 a fresh pool */
  wetAt(zk: string, x: number, zz: number): { wet: number; tint: number } {
    let best = 0, tint = 0xffffff;
    for (let i = this.fresh.length - 1; i >= 0; i--) {
      const f = this.fresh[i];
      const age = G.time - f.t;
      if (age > 240) { this.fresh.splice(i, 1); continue; }
      if (f.z !== zk) continue;
      const d = Math.hypot(f.x - x, f.zz - zz);
      if (d > f.r + 0.15) continue;
      const w = (f.pool ? 1 : 0.7) * (1 - age / 300);
      if (w > best) { best = w; tint = f.tint; }
    }
    return { wet: best, tint };
  }

  private updateTransient() {
    const zk = G.local?.zoneKey;
    const z = zk ? G.zones.get(zk) : null;
    let growing = false;
    for (let i = this.trans.length - 1; i >= 0; i--) {
      const t = this.trans[i];
      const done = (t.landed && (!z || t.z !== z.key || !z.dirtyChunks.has(z.chunkOf(Math.floor(t.d.x), Math.floor(t.d.z))))) || G.time > t.until;
      if (done) { this.trans.splice(i, 1); this.transKeys.delete(t.key); this.meshDirty = true; continue; }
      if (t.grow > 0 && G.time - t.born < t.grow && t.z === zk) growing = true;
    }
    if (!this.meshDirty && !growing) return;
    this.meshDirty = false;
    if (this.mesh) { this.root.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!z) return;
    const mb = new ModelBuilder();
    for (const t of this.trans) {
      if (t.z !== z.key || t.d.vert) continue;
      // a pool spreads fast at first, then slows (ease-out)
      const k = t.grow > 0 ? Math.min(1, (G.time - t.born) / t.grow) : 1;
      const s = t.grow > 0 ? 0.15 + 0.85 * (1 - Math.pow(1 - k, 2.2)) : 1;
      const fy = z.heightAt(Math.floor(t.d.x), Math.floor(t.d.z)) + (t.d.y ?? 0.013);
      mb.flat(t.d.x, fy, t.d.z, t.d.w * s, t.d.d * s, t.d.tex, { rot: t.d.rot, color: t.d.tint ?? 0xffffff });
    }
    if (mb.isEmpty) return;
    this.mesh = new THREE.Mesh(mb.build(), MAT.decal);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
  }

  clearTransient() { this.trans.length = 0; this.transKeys.clear(); this.meshDirty = true; }
}

// ---------------------------------------------------------------- walls
export interface WallHit { x: number; z: number; rot: number; dist: number; h: number; along: number; tile: [number, number] }

/**
 * First plain wall face along a ray from (x, z) in direction (dx, dz) within maxD metres.
 * Doors, windows, glass and see-through walls stop the ray without a hit.
 */
export function findWall(z: Zone, x: number, zz: number, dx: number, dz: number, maxD: number): WallHit | null {
  const l = Math.hypot(dx, dz); if (l < 1e-4) return null;
  dx /= l; dz /= l;
  let tx = Math.floor(x), ty = Math.floor(zz);
  const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
  const tDX = Math.abs(1 / (dx || 1e-9)), tDY = Math.abs(1 / (dz || 1e-9));
  let tMaxX = Math.abs(dx) < 1e-6 ? Infinity : dx > 0 ? (tx + 1 - x) * tDX : (x - tx) * tDX;
  let tMaxY = Math.abs(dz) < 1e-6 ? Infinity : dz > 0 ? (ty + 1 - zz) * tDY : (zz - ty) * tDY;
  for (let guard = 0; guard < 16; guard++) {
    const crossX = tMaxX < tMaxY;
    const t = crossX ? tMaxX : tMaxY;
    if (t > maxD) return null;
    // the edge being crossed and the face we hit
    let ex: number, ey: number, side: 0 | 1;
    if (crossX) { ex = stepX > 0 ? tx + 1 : tx; ey = ty; side = 1; }
    else { ex = tx; ey = stepY > 0 ? ty + 1 : ty; side = 0; }
    if (!z.inb(ex, ey)) return null;
    const i = z.idx(ex, ey);
    const e = z.edges.get(i * 2 + side);
    if (e && e.kind !== 'arch') return null;
    const wid = side === 0 ? z.wallN[i] : z.wallW[i];
    if (wid && !e) {
      const w = wallDef(wid);
      if (w.glass || w.seeThrough || w.alpha) return null;
      const T = (w.thick ?? 0.12) / 2 + 0.008;
      const hx = x + dx * t, hz = zz + dz * t;
      if (crossX) {
        const fx = stepX > 0 ? ex - T : ex + T;
        return { x: fx, z: hz, rot: stepX > 0 ? Math.PI : 0, dist: t, h: w.height ?? WALL_H, along: hz - ty, tile: [tx, ty] };
      }
      const fz = stepY > 0 ? ey - T : ey + T;
      return { x: hx, z: fz, rot: stepY > 0 ? -Math.PI / 2 : Math.PI / 2, dist: t, h: w.height ?? WALL_H, along: hx - tx, tile: [tx, ty] };
    }
    // step into the next tile (blocked by solid furniture: blood hits that instead)
    if (crossX) { tx += stepX; tMaxX += tDX; } else { ty += stepY; tMaxY += tDY; }
    if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || z.solid[z.idx(tx, ty)] === 1) return null;
  }
  return null;
}

/** clamp a wall decal of width w to its wall segment so it never hangs past a corner or into a doorway */
export function clampOnWall(z: Zone, hit: WallHit, w: number): number {
  const [tx, ty] = hit.tile;
  const alongX = Math.abs(Math.sin(hit.rot)) > 0.5; // wall runs along x
  // neighbouring segments of the same wall line
  const plain = (ox: number, oy: number) => {
    if (alongX) {
      const ey = hit.rot < 0 ? ty + 1 : ty; const ex = tx + ox;
      if (!z.inb(ex, ey)) return false; const i = z.idx(ex, ey);
      return !!z.wallN[i] && !z.edges.has(i * 2);
    }
    const ex = hit.rot === Math.PI ? tx + 1 : tx; const ey = ty + oy;
    if (!z.inb(ex, ey)) return false; const i = z.idx(ex, ey);
    return !!z.wallW[i] && !z.edges.has(i * 2 + 1);
  };
  const lo = plain(alongX ? -1 : 0, alongX ? 0 : -1) ? -0.4 : 0, hi = plain(alongX ? 1 : 0, alongX ? 0 : 1) ? 1.4 : 1;
  const a = Math.max(lo + w / 2, Math.min(hi - w / 2, hit.along));
  return alongX ? tx + a : ty + a;
}

export { CHUNK };
