// Deterministic camp placement after a zone is generated (inside the
// generator's uid range, so every peer and every reload agrees). A camp needs
// an open, reachable patch away from portals, anchors and the hopper: a fire in
// the middle, the tribe's totem, a barter cloth, bedrolls, tents and a stash
// when there is room. The camp and its member posts are recorded in
// z.meta.tribeCamps for the tribe system to populate.
import { onZoneGenerated } from '../world/worldGraph';
import { objDef } from '../world/objects';
import { floorDef } from '../world/defs';
import { TF } from '../world/zone';
import type { Zone } from '../world/zone';
import { ZoneBuilder } from '../world/gen/builder';
import { Rng } from '../core/rng';
import { TRIBES, TRIBE_KEYS } from './defs';
import type { TribeKey } from './defs';

export interface Camp {
  t: TribeKey; i: number; x: number; y: number; r: number; slots: [number, number][]; fire: [number, number]; barter: [number, number];
  /** round 15: where they sleep, the guards' corners, the stash, the kitchen */
  beds?: [number, number][]; patrol?: [number, number][]; stash?: [number, number] | null; kitchen?: [number, number] | null;
}
/** lone people out in the rooms (no camp): drifters and quick hands */
export interface Drifter { t: TribeKey; i: number; x: number; y: number }
const DRIFT: Record<string, number> = { lobby: 1, office: 2, market: 1, suburbs: 1, tunnels: 1, depot: 1 };

const walk = (z: Zone, x: number, y: number) => {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return false;
  if (floorDef(z.floor[i])?.water === 'deep') return false;
  return !(z.flags[i] & (TF.SHIFT | TF.STAIRS | TF.NOSPAWN));
};
const free = (z: Zone, x: number, y: number) => walk(z, x, y) && z.objectsAt(x, y).every((o) => !!objDef(o.key)?.ceiling);

function bfs(z: Zone, sx: number, sy: number): Int32Array {
  const dist = new Int32Array(z.W * z.H).fill(-1);
  if (!z.inb(sx, sy)) return dist;
  const q = [z.idx(sx, sy)]; dist[q[0]] = 0;
  for (let h = 0; h < q.length && q.length < 26000; h++) {
    const i = q[h], x = i % z.W, y = (i / z.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!z.inb(X, Y)) continue;
      const j = z.idx(X, Y);
      if (dist[j] >= 0 || !z.floor[j] || z.solid[j] === 1 || z.solid[j] === 3) continue;
      if (z.edgeBlocks(x, y, dx, dy, 'walk')) { const e = dx ? z.edge(dx > 0 ? X : x, y, 1) : z.edge(x, dy > 0 ? Y : y, 0); if (!(e && (e.kind === 'door' || e.kind === 'gate'))) continue; }
      dist[j] = dist[i] + 1; q.push(j);
    }
  }
  return dist;
}

/** a square of side 2h+1 around (cx, cy): all free, no walls or doors inside */
function openSquare(z: Zone, cx: number, cy: number, h: number) {
  for (let y = cy - h; y <= cy + h; y++) for (let x = cx - h; x <= cx + h; x++) {
    if (!free(z, x, y)) return false;
    const i = z.idx(x, y);
    if (x > cx - h && (z.wallW[i] || z.edge(x, y, 1))) return false;
    if (y > cy - h && (z.wallN[i] || z.edge(x, y, 0))) return false;
  }
  return true;
}

function findCampSpot(z: Zone, rng: Rng, taken: [number, number][]): { x: number; y: number; h: number } | null {
  const sp = (z.meta.spawn as [number, number] | undefined) || (Object.values((z.meta.anchors || {}) as Record<string, number[]>)[0] as any) || [z.W >> 1, z.H >> 1];
  let sx = sp[0] | 0, sy = sp[1] | 0;
  if (!walk(z, sx, sy)) for (let r = 1; r < 20 && !walk(z, sx, sy); r++) { const a = rng.float(0, 6.28); const x = Math.round(sp[0] + Math.cos(a) * r), y = Math.round(sp[1] + Math.sin(a) * r); if (walk(z, x, y)) { sx = x; sy = y; } }
  const dist = bfs(z, sx, sy);
  const near: [number, number][] = [];
  for (const p of z.portals) near.push([p.x, p.y]);
  for (const a of Object.values((z.meta.anchors || {}) as Record<string, number[]>)) if (a) near.push([a[0], a[1]]);
  for (const o of z.objects.values()) if (o.key === 'hopper' || o.key === 'ticket_kiosk' || o.key === 'seam_door' || o.key.startsWith('press') || objDef(o.key)?.tags?.includes('portal')) near.push([o.x, o.y]);
  const clear = (x: number, y: number, r: number) => near.every(([px, py]) => Math.abs(px - x) > r || Math.abs(py - y) > r) && taken.every(([px, py]) => Math.hypot(px - x, py - y) > 24);
  for (const h of [4, 3, 2]) {
    const cands: number[] = [];
    for (let i = 0; i < dist.length; i++) if (dist[i] >= 10 && dist[i] <= 140) cands.push(i);
    // prefer a moderate walk from the entrance, with some per-seed variety
    const key = (i: number) => Math.abs(dist[i] - 34) + ((i * 2654435761) >>> 0) % 7;
    cands.sort((a, b) => key(a) - key(b));
    let tested = 0;
    for (const i of cands) {
      if (++tested > 9000) break;
      const x = i % z.W, y = (i / z.W) | 0;
      if (!clear(x, y, h + 4)) continue;
      if (!openSquare(z, x, y, h)) continue;
      // every side of the square must stay reachable (don't plug a corridor)
      let ring = 0;
      for (let k = -h - 1; k <= h + 1; k++) for (const [X, Y] of [[x + k, y - h - 1], [x + k, y + h + 1], [x - h - 1, y + k], [x + h + 1, y + k]]) if (z.inb(X, Y) && dist[z.idx(X, Y)] >= 0) ring++;
      if (ring < (2 * h + 3) * 2.5) continue;
      return { x, y, h };
    }
  }
  return null;
}

export function placeCamps(z: Zone, seed: number) {
  const plans: { t: TribeKey; size: number }[] = [];
  for (const k of TRIBE_KEYS) for (const c of TRIBES[k].camps) if (c.zone === z.key) plans.push({ t: k, size: c.size });
  placeDrifters(z, seed);
  if (!plans.length) return;
  const rng = new Rng(seed ^ 0x7b1be);
  const b = new ZoneBuilder(z, rng);
  const camps: Camp[] = (z.meta.tribeCamps ||= []);
  const taken: [number, number][] = [];
  plans.forEach((pl, i) => {
    const s = findCampSpot(z, rng, taken);
    if (!s) { console.warn('[tribes] no camp spot', z.key, pl.t); return; }
    const { x, y, h } = s;
    taken.push([x, y]);
    const put = (key: string, dx: number, dy: number, rot: 0 | 1 | 2 | 3 = 0, st: Record<string, any> = {}) => (free(z, x + dx, y + dy) ? b.obj(key, x + dx, y + dy, rot, st) : null);
    put('campfire', 0, 0, 0, { lit: true, fuel: 9999 });
    put('tribe_totem_' + pl.t, 0, -Math.min(2, h));
    const barter: [number, number] = [x + Math.min(2, h), y + 1];
    put('tribe_barter', barter[0] - x, barter[1] - y);
    const slots: [number, number][] = [];
    // bedrolls round the fire, posts beside them
    const ring: [number, number][] = [[-2, 1], [2, -1], [-1, 2], [1, -2], [-2, -1], [0, 2]];
    for (let k = 0; k < Math.min(ring.length, pl.size + 1); k++) {
      const [dx, dy] = ring[k];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > h) continue;
      if (k < pl.size && k % 2 === 0) put('bedroll', dx, dy, (k % 4) as 0 | 1 | 2 | 3);
      slots.push([x + dx + 0.5, y + dy + 0.5]);
    }
    const beds: [number, number][] = slots.filter((_, k) => k % 2 === 0).map(([sx, sy]) => [sx, sy + 0.5] as [number, number]);
    let stash: [number, number] | null = null;
    if (h >= 4) { if (put('tent', -4, -4, 0)) beds.push([x - 2.6, y - 3]); if (put('tent', 3, -4, 0)) beds.push([x + 3.5, y - 2.4]); if (put('survivor_stash', 3, 3)) stash = [x + 3.5, y + 3.5]; put('crate_built', -3, 3); }
    else if (h >= 3) { if (put('survivor_stash', 3, 3)) stash = [x + 3.5, y + 3.5]; put('crate_built', -3, -3); }
    else if (put('survivor_stash', 2, -2)) stash = [x + 2.5, y - 1.5];
    // round 15: a base, not a picnic. A kitchen by the fire, lamps on poles, a barricade round the edge
    // with a gap in the middle of every side (the camp's doors), where the guards walk.
    const kitchen = put('camp_kitchen', 1, -1, 0) ? [x + 1.5, y - 0.5] as [number, number] : null;
    const lampAt = h >= 3 ? [[-(h - 1), h - 1], [h - 1, -(h - 1)]] : [[-2, -2]];
    for (const [dx, dy] of lampAt) put('camp_lamp', dx, dy);
    if (h >= 3) {
      for (let k = -h; k <= h; k++) {
        if (Math.abs(k) <= 1) continue; // the doors
        put('camp_barricade', k, -h, 0); put('camp_barricade', k, h, 2);
        if (Math.abs(k) < h) { put('camp_barricade', -h, k, 3); put('camp_barricade', h, k, 1); }
      }
    } else { put('camp_barricade', -2, 2, 2); put('camp_barricade', 2, 2, 2); put('camp_barricade', 2, -2, 0); }
    const pr = Math.max(1, h - 1) + 0.5;
    const patrol: [number, number][] = [[x + 0.5 - pr, y + 0.5 - pr], [x + 0.5, y + 0.5 - pr], [x + 0.5 + pr, y + 0.5 - pr], [x + 0.5 + pr, y + 0.5], [x + 0.5 + pr, y + 0.5 + pr], [x + 0.5, y + 0.5 + pr], [x + 0.5 - pr, y + 0.5 + pr], [x + 0.5 - pr, y + 0.5]];
    for (let yy = y - h - 1; yy <= y + h + 1; yy++) for (let xx = x - h - 1; xx <= x + h + 1; xx++) if (z.inb(xx, yy)) z.flags[z.idx(xx, yy)] |= TF.NOSPAWN | TF.NOBUILD;
    while (slots.length < pl.size) slots.push([x + 0.5 + rng.float(-1.5, 1.5), y + 0.5 + rng.float(-1.5, 1.5)]);
    camps.push({ t: pl.t, i, x: x + 0.5, y: y + 0.5, r: h + 1.5, slots: slots.slice(0, pl.size), fire: [x + 0.5, y + 0.5], barter: [barter[0] + 0.5, barter[1] + 0.5], beds, patrol, stash, kitchen });
  });
}

onZoneGenerated(placeCamps);

/** one or two lone people per level, somewhere a fair walk from the entrance */
function placeDrifters(z: Zone, seed: number) {
  const n = DRIFT[z.key]; if (!n) return;
  const rng = new Rng(seed ^ 0xd21f7);
  const sp = (z.meta.spawn as [number, number] | undefined) || [z.W >> 1, z.H >> 1];
  const out: Drifter[] = (z.meta.tribeDrifters ||= []);
  for (let i = 0; i < n; i++) {
    const at = z.randomFloor(rng, (x, y) => walk(z, x, y) && free(z, x, y) && Math.hypot(x - sp[0], y - sp[1]) > 14 && Math.hypot(x - sp[0], y - sp[1]) < 70, 800);
    if (!at) continue;
    out.push({ t: TRIBE_KEYS[(rng.int(0, 99) + i) % TRIBE_KEYS.length], i, x: at[0] + 0.5, y: at[1] + 0.5 });
  }
}
