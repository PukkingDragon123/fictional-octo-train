// Shifting geometry: regions of a zone that rebuild themselves into another
// layout while no player can see them. Generators register a region with a
// deterministic stamp function; the host decides when a region shifts and
// replicates it as an op, so every peer rebuilds the same variant.
import type { Zone } from './zone';
import { TF } from './zone';
import { ZoneBuilder } from './gen/builder';
import { Rng, hash3, hashStr, beginGenUids, endGenUids, SHIFT_UID_BASE } from '../core/rng';
import { defOp, op } from '../game/ops';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';

export interface ShiftRegion {
  id: string;
  x0: number; y0: number; x1: number; y1: number;
  variants: number;
  current: number;
  stamp: ShiftStamp;
  lastShift: number;
  /** keep the region's outer walls (default true) */
  keepBorder: boolean;
}
export type ShiftStamp = (b: ZoneBuilder, rng: Rng, variant: number, r: ShiftRegion) => void;

const REG = new WeakMap<Zone, Map<string, ShiftRegion>>();

export function shiftRegions(z: Zone) { return REG.get(z); }

/**
 * Register a shifting region and build its initial variant. The stamp must
 * rebuild the region's interior completely (floors, walls, furniture, lights):
 * everything inside the rect is cleared before each stamp.
 */
export function registerShift(z: Zone, id: string, x0: number, y0: number, x1: number, y1: number, variants: number, stamp: ShiftStamp, opts: { initial?: number; keepBorder?: boolean } = {}) {
  let m = REG.get(z);
  if (!m) { m = new Map(); REG.set(z, m); }
  const r: ShiftRegion = { id, x0, y0, x1, y1, variants: Math.max(1, variants), current: -1, stamp, lastShift: 0, keepBorder: opts.keepBorder ?? true };
  m.set(id, r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (z.inb(x, y)) z.flags[z.idx(x, y)] |= TF.SHIFT;
  const v = (z.meta.shiftState?.[id] as number | undefined) ?? opts.initial ?? 0;
  applyVariant(z, r, v, true);
  return r;
}

function applyVariant(z: Zone, r: ShiftRegion, v: number, initial = false) {
  const rng = new Rng(hash3(z.seed, hashStr(r.id), v + 1));
  const b = new ZoneBuilder(z, rng);
  for (const o of [...z.objects.values()]) if (o.x >= r.x0 && o.x <= r.x1 && o.y >= r.y0 && o.y <= r.y1) z.removeObject(o);
  // ceiling lights of the region go too (object lights left with their objects)
  z.lights = z.lights.filter((l) => { const inside = l.x >= r.x0 && l.x < r.x1 + 1 && l.z >= r.y0 && l.z < r.y1 + 1; if (inside) z.removedLights.push(l); return !inside; });
  if (r.keepBorder) b.clearWallsIn(r.x0, r.y0, r.x1, r.y1);
  else for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) { b.clearN(x, y); b.clearW(x, y); }
  beginGenUids(SHIFT_UID_BASE + (hash3(z.seed, hashStr(r.id), v + 7) & 0xffffff) * 4096);
  try { r.stamp(b, rng, v, r); } finally { endGenUids(); }
  r.current = v;
  (z.meta.shiftState ||= {})[r.id] = v;
  if (initial) return;
  for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
    if (!z.inb(x, y)) continue;
    z.recomputeTile(x, y);
    z.markDirty(x, y);
    z.lightDirtyTiles.push([x, y]);
  }
}

defOp('shift', (a: { z: string; id: string; v: number }) => {
  const z = G.zones.get(a.z);
  const r = z ? REG.get(z)?.get(a.id) : undefined;
  if (!z || !r || r.current === a.v) return;
  applyVariant(z, r, a.v);
  r.lastShift = G.time;
  bus.emit('zoneShifted', z, r);
});

/** Host-side: shifts regions nobody is looking at. */
export class ShiftSystem implements GameSystem {
  name = 'shift';
  private t = 3;
  update(dt: number) {
    if (G.role === 'client') return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    const hPerSec = 24 / Math.max(1, (G.sandbox.dayLength ?? 60) * 60);
    const zones = new Set<string>();
    for (const p of G.players.values()) zones.add(p.zoneKey);
    for (const zk of zones) {
      const z = G.zones.get(zk);
      const m = z ? REG.get(z) : undefined;
      if (!m || !z) continue;
      const rate = (z.meta.shiftRate as number | undefined) ?? 1;
      for (const r of m.values()) {
        if (r.variants < 2 || G.time - r.lastShift < 30) continue;
        if (Math.random() > (0.035 + G.collapse * 0.2) * rate) continue;
        if (!this.unseen(z, r, 12 * hPerSec)) continue;
        let v = Math.floor(Math.random() * r.variants);
        if (v === r.current) v = (v + 1) % r.variants;
        op('shift', { z: zk, id: r.id, v });
      }
    }
  }
  private unseen(z: Zone, r: ShiftRegion, recentH: number) {
    for (const p of G.players.values()) {
      if (p.zoneKey !== z.key) continue;
      const dx = Math.max(r.x0 - p.x, 0, p.x - (r.x1 + 1));
      const dy = Math.max(r.y0 - p.z, 0, p.z - (r.y1 + 1));
      if (Math.hypot(dx, dy) < 9) return false;
    }
    const now = G.clock.hours;
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      const s = z.lastSeen[z.idx(x, y)];
      if (s > 0 && now - s < recentH) return false;
    }
    return true;
  }
}
