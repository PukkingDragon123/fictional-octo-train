// Puts the studyable anomalies (data.ts) into their levels after each level is
// generated (onZoneGenerated: deterministic, inside the level's uid range): the
// fixture in a fitting room near where people pass, the field note beside it,
// and an Institute placard. Records each one in z.meta.anomalies [{ key, uid,
// x, y }] for the runtime (index.ts) and the dev teleport (__anom.go).
// Imported by src/world/gen/z_ledge.ts so node tools (zonecheck) run it too.
import { onZoneGenerated } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from '../gen/builder';
import { Furnisher } from '../gen/furnish';
import { Rng, hash3 } from '../../core/rng';
import { type Ctx, force, put, isOpen } from '../gen/mall_kit';
import { WORLD_ANOMALIES, type WorldAnomaly } from './data';

interface Spot { rooms: string[]; w: number; h: number; margin: number; near?: 'spawn' | 'anchor' }
/** where each one goes: room names to try in order (exact names of the level's rooms), the footprint, a clear margin */
const SPOTS: Record<string, Spot> = {
  updrip: { rooms: ['The Dry End', 'Tiled Rooms', 'Column Forest', 'The Long Hall'], w: 2, h: 2, margin: 1 },
  noon_lamp: { rooms: ["Mia's Room", 'Nursery', 'Bedroom', 'Guest Room'], w: 1, h: 1, margin: 1 },
  echo_phone: { rooms: ['Parking Level P∞'], w: 1, h: 1, margin: 1, near: 'anchor' },
  snow_globe: { rooms: ['Grand Atrium', 'East Court', 'West Court', 'Main Street (East)'], w: 2, h: 2, margin: 2 },
  hungry_carpet: { rooms: ['Empty Room', 'The Pillar Hall', 'A Room', 'Somewhere'], w: 2, h: 2, margin: 1, near: 'spawn' },
  patient_chair: { rooms: ['Quiet Room', 'Training Room', 'Meeting Room A', 'Reception'], w: 1, h: 1, margin: 1 },
};
const PLACARD: Record<string, [string, number, number]> = {
  updrip: ['AN-08|DO NOT DROP ITEMS', 0x1e3a6a, 0xf2eee0],
  noon_lamp: ['AN-09|LEAVE THE LAMP ON', 0x1e3a6a, 0xf2eee0],
  echo_phone: ['AN-10|DO NOT RETURN CALLS', 0x1e3a6a, 0xf2eee0],
  snow_globe: ['AN-11|DO NOT SHAKE', 0x1e3a6a, 0xf2eee0],
  hungry_carpet: ['AN-12|DO NOT FEED', 0x1e3a6a, 0xf2eee0],
  patient_chair: ['AN-13|DO NOT SIT', 0x1e3a6a, 0xf2eee0],
};

/** is the w×h rect at (x0, y0) clear floor (plus margin): no walls inside, no objects, no portals or anchors, one height */
function clear(z: Zone, x0: number, y0: number, w: number, h: number, m: number): boolean {
  const h0 = z.inb(x0, y0) ? z.height[z.idx(x0, y0)] : 0;
  for (let y = y0 - m; y < y0 + h + m; y++) for (let x = x0 - m; x < x0 + w + m; x++) {
    if (!z.inb(x, y) || x < 2 || y < 2 || x > z.W - 3 || y > z.H - 3) return false;
    const i = z.idx(x, y);
    if (!z.floor[i] || z.solid[i] || (z.flags[i] & (TF.SHIFT | TF.STAIRS | TF.SAFE))) return false;
    if (z.height[i] !== h0) return false;
    if (y > y0 - m && z.wallN[i]) return false;
    if (x > x0 - m && z.wallW[i]) return false;
    if (z.edges.has(i * 2) || z.edges.has(i * 2 + 1)) return false;
    if (!isOpen(z, x, y)) return false;
  }
  for (const p of z.portals) if (p.x >= x0 - m - 2 && p.x < x0 + w + m + 2 && p.y >= y0 - m - 2 && p.y < y0 + h + m + 2) return false;
  for (const a of Object.values(z.meta.anchors || {}) as number[][]) if (Array.isArray(a) && a[0] >= x0 - m - 1 && a[0] < x0 + w + m + 1 && a[1] >= y0 - m - 1 && a[1] < y0 + h + m + 1) return false;
  return true;
}
/** the clear spot nearest (cx, cy) inside the bounds, spiralling out */
function nearest(z: Zone, cx: number, cy: number, s: Spot, b: { x0: number; y0: number; x1: number; y1: number }, maxR: number): [number, number] | null {
  for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = cx + dx, y = cy + dy;
    if (x < b.x0 || y < b.y0 || x + s.w - 1 > b.x1 || y + s.h - 1 > b.y1) continue;
    if (clear(z, x, y, s.w, s.h, s.margin)) return [x, y];
  }
  return null;
}

function spotFor(z: Zone, a: WorldAnomaly, s: Spot): [number, number] | null {
  const all = { x0: 2, y0: 2, x1: z.W - 3, y1: z.H - 3 };
  if (s.near) {
    const anchors = Object.values(z.meta.anchors || {}) as number[][];
    const from = s.near === 'spawn' && Array.isArray(z.meta.spawn) ? z.meta.spawn as number[] : anchors[0];
    if (from) {
      const room = (x: number, y: number) => s.rooms.includes(z.roomAt(x, y).name);
      // the nearest clear spot in one of the rooms, a little away from where people arrive
      for (let r = 8; r <= 60; r += 4) {
        const p = nearest(z, Math.round(from[0]) + r, Math.round(from[1]), s, all, r);
        if (p && room(p[0], p[1])) return p;
      }
    }
  }
  for (const name of s.rooms) {
    const rs = z.rooms.filter((r) => r.name === name);
    for (const r of rs) {
      const p = nearest(z, (r.x0 + r.x1) >> 1, (r.y0 + r.y1) >> 1, s, r, Math.max(r.x1 - r.x0, r.y1 - r.y0));
      if (p) return p;
    }
  }
  void a;
  return nearest(z, z.W >> 1, z.H >> 1, s, all, Math.max(z.W, z.H) >> 1);
}

function placeOne(z: Zone, seed: number, a: WorldAnomaly) {
  const s = SPOTS[a.key];
  if (!s) return;
  const rng = new Rng(hash3(seed, 8201, a.key.length * 7 + a.key.charCodeAt(0)));
  const b = new ZoneBuilder(z, rng);
  const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
  const p = spotFor(z, a, s);
  if (!p) { console.warn('anomaly: no room for', a.key, 'in', z.key); return; }
  const [x, y] = p;
  const o = force(c, a.obj, x, y, 0, a.key === 'snow_globe' ? {} : {});
  if (!o) return;
  // the field note on the floor beside it, the placard a step further off
  const ring: [number, number][] = [[x + s.w, y + s.h], [x - 1, y + s.h], [x + s.w, y - 1], [x - 1, y - 1], [x + s.w, y], [x, y + s.h]];
  const n = ring.find(([nx, ny]) => isOpen(z, nx, ny));
  if (n) c.f.floorItem('note', n[0], n[1], { lore: a.lore });
  const pl = PLACARD[a.key];
  if (pl) for (const [px, py] of [[x - 3, y], [x + s.w + 1, y], [x, y - 2], [x, y + s.h + 1]] as [number, number][]) {
    if (isOpen(z, px, py) && isOpen(z, px + 1, py) && put(c, 'vx_sign', px, py, 0, { text: pl[0], c: pl[1], ink: pl[2] })) break;
  }
  b.flag(x - 1, y - 1, x + s.w, y + s.h, TF.NOBUILD);
  (z.meta.anomalies ||= []).push({ key: a.key, uid: o.uid, x, y });
}

onZoneGenerated((z, seed) => {
  for (const a of WORLD_ANOMALIES) if (a.zone === z.key && a.key !== 'ledge') { try { placeOne(z, seed, a); } catch (e) { console.error('anomaly place', a.key, e); } }
});
