// Deterministic placement of the Remittance Hopper (and the passage kiosk)
// after a zone is generated. Runs inside the generator's uid range, so every
// co-op peer and every reload builds the same hopper with the same uid.
//
// Rule: every zone gets one hopper on a sensible open, reachable 2 x 2 patch
// near its main entry (the spawn for the Lobby, otherwise the first anchor),
// back against a wall when possible, clear of portals, anchors, shifting
// regions and the Seam. Zones that already contain a 'hopper' (hand-placed by
// a zone generator) are left alone. The kiosk goes to the depot's
// 'ticket_kiosk' anchor; without a depot zone it stands next to the Lobby hopper.
import { onZoneGenerated, zoneSpec } from '../../world/worldGraph';
import { objDef } from '../../world/objects';
import { floorDef } from '../../world/defs';
import { Zone, TF } from '../../world/zone';
import { ZoneBuilder } from '../../world/gen/builder';
import { Rng } from '../../core/rng';

/** an anchor's facing (radians, the way an arriving survivor looks) as the quarter-turn an object needs (0..3, front +z at 0) */
function quarterTurn(face: number | undefined): 0 | 1 | 2 | 3 {
  if (face === undefined || !Number.isFinite(face)) return 0;
  // rot 0 faces +z (pi/2), rot 1 faces -x (pi), rot 2 faces -z, rot 3 faces +x (0)
  const q = Math.round((face - Math.PI / 2) / (Math.PI / 2));
  return (((q % 4) + 4) % 4) as 0 | 1 | 2 | 3;
}

/** zones that never get a hopper */
const SKIP = new Set(['reality', 'exit', 'gallery']);
/** the hopper beacon the SEER-9 can lock onto (SIG page) */
export const HOPPER_FREQ = 77.7;

const isCeil = (key: string) => !!objDef(key)?.ceiling;

function walkableTile(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  if (!z.floor[i] || z.solid[i]) return false;
  const f = floorDef(z.floor[i]);
  return f?.water !== 'deep';
}
function freeTile(z: Zone, x: number, y: number) {
  if (!walkableTile(z, x, y)) return false;
  if (z.flags[z.idx(x, y)] & (TF.SHIFT | TF.STAIRS)) return false;
  for (const o of z.objectsAt(x, y)) if (!isCeil(o.key)) return false;
  return true;
}

/** BFS distances from a start tile over walkable tiles (doors count as passable) */
function bfs(z: Zone, sx: number, sy: number, limit = 9000): Int32Array {
  const dist = new Int32Array(z.W * z.H).fill(-1);
  if (!z.inb(sx, sy)) return dist;
  const q: number[] = [z.idx(sx, sy)];
  dist[q[0]] = 0;
  let head = 0;
  while (head < q.length && q.length < limit) {
    const i = q[head++];
    const x = i % z.W, y = (i / z.W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Y = y + dy;
      if (!z.inb(X, Y)) continue;
      const j = z.idx(X, Y);
      if (dist[j] >= 0 || !z.floor[j] || z.solid[j] === 1 || z.solid[j] === 3) continue;
      if (z.edgeBlocks(x, y, dx, dy, 'walk')) {
        const e = dx ? z.edge(dx > 0 ? X : x, y, 1) : z.edge(x, dy > 0 ? Y : y, 0);
        if (!(e && (e.kind === 'door' || e.kind === 'gate'))) continue;
      }
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

function entryPoint(z: Zone): [number, number] {
  const sp = z.meta.spawn as [number, number] | undefined;
  if (sp) return [sp[0], sp[1]];
  const anchors = (z.meta.anchors || {}) as Record<string, number[]>;
  for (const k of Object.keys(anchors)) { const a = anchors[k]; if (a && walkableTile(z, a[0], a[1])) return [a[0], a[1]]; }
  for (const k of Object.keys(anchors)) { const a = anchors[k]; if (a) return [a[0], a[1]]; }
  return [z.W >> 1, z.H >> 1];
}

function nearestWalk(z: Zone, x: number, y: number): [number, number] {
  if (walkableTile(z, x, y)) return [x, y];
  for (let r = 1; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    if (walkableTile(z, x + dx, y + dy)) return [x + dx, y + dy];
  }
  return [x, y];
}

/** tiles that must stay clear: portals, anchors (and around them), the Seam and the exit door */
function blockedMask(z: Zone): { near: (x: number, y: number, r: number) => boolean; dangerNear: (x: number, y: number) => boolean } {
  const pts: [number, number][] = [];
  for (const p of z.portals) if (p.kind !== 'loop') pts.push([p.x, p.y]);
  for (const a of Object.values((z.meta.anchors || {}) as Record<string, number[]>)) if (a) pts.push([a[0], a[1]]);
  const danger: [number, number][] = [];
  for (const o of z.objects.values()) if (o.key === 'seam_door' || o.key === 'exit_doorway' || objDef(o.key)?.tags?.includes('portal')) danger.push([o.x, o.y]);
  return {
    near: (x, y, r) => pts.some(([px, py]) => Math.abs(px - x) <= r && Math.abs(py - y) <= r),
    dangerNear: (x, y) => danger.some(([px, py]) => Math.hypot(px - x, py - y) < 6),
  };
}

/** best 2 x 2 spot for a hopper (top-left tile) */
export function findHopperSpot(z: Zone, from?: [number, number], minDist = 3): [number, number] | null {
  const [ex, ey] = nearestWalk(z, ...(from ?? entryPoint(z)));
  const dist = bfs(z, ex, ey);
  const mask = blockedMask(z);
  const order: number[] = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] >= minDist) order.push(i);
  order.sort((a, b) => dist[a] - dist[b] || a - b);
  for (const minOpen of [10, 7, 4]) {
    let best: [number, number] | null = null, bestScore = Infinity, bestD = Infinity;
    let tested = 0;
    for (const i of order) {
      const x = i % z.W, y = (i / z.W) | 0;
      if (dist[i] > bestD + 10) break;
      if (!(freeTile(z, x, y) && freeTile(z, x + 1, y) && freeTile(z, x, y + 1) && freeTile(z, x + 1, y + 1))) continue;
      // no walls or doors inside the block
      if (z.wallW[z.idx(x + 1, y)] || z.wallW[z.idx(x + 1, y + 1)] || z.wallN[z.idx(x, y + 1)] || z.wallN[z.idx(x + 1, y + 1)]) continue;
      if (z.edge(x + 1, y, 1) || z.edge(x + 1, y + 1, 1) || z.edge(x, y + 1, 0) || z.edge(x + 1, y + 1, 0)) continue;
      if (mask.near(x, y, 2) || mask.near(x + 1, y + 1, 2) || mask.dangerNear(x, y)) continue;
      // the front (south) must be open and reachable: things get pushed in from there
      const f0 = z.idx(x, y + 2), f1 = z.idx(x + 1, y + 2);
      if (!z.inb(x, y + 2) || dist[f0] < 0 || dist[f1] < 0 || z.wallN[f0] || z.wallN[f1]) continue;
      // openness: ring tiles you can actually reach from the plate (walls between them do not count)
      let open = 0;
      const okT = (X: number, Y: number) => walkableTile(z, X, Y) && dist[z.idx(X, Y)] >= 0;
      for (const yy of [y, y + 1]) { if (okT(x - 1, yy) && !z.wallW[z.idx(x, yy)]) open++; if (okT(x + 2, yy) && !z.wallW[z.idx(x + 2, yy)]) open++; }
      for (const xx of [x, x + 1]) { if (okT(xx, y - 1) && !z.wallN[z.idx(xx, y)]) open++; if (okT(xx, y + 2) && !z.wallN[z.idx(xx, y + 2)]) open++; }
      for (const [cx2, cy2] of [[x - 1, y - 1], [x + 2, y - 1], [x - 1, y + 2], [x + 2, y + 2]]) if (okT(cx2, cy2)) open += 0.5;
      // and the approach: a few tiles in front of the plate
      let front = 0;
      for (let k = 2; k <= 4; k++) for (const xx of [x - 1, x, x + 1, x + 2]) if (okT(xx, y + k)) front++;
      if (open < minOpen * 0.6 || front < 6) continue;
      const backWall = !!(z.wallN[z.idx(x, y)] && z.wallN[z.idx(x + 1, y)]);
      const score = dist[i] * 0.7 + (backWall ? -3 : 0) - open * 0.6 - front * 0.4;
      if (score < bestScore) { bestScore = score; best = [x, y]; bestD = Math.min(bestD, dist[i]); }
      if (++tested > 600) break;
    }
    if (best) return best;
  }
  return null;
}

function placeKioskNear(z: Zone, b: ZoneBuilder, hx: number, hy: number) {
  const cands: [number, number][] = [[hx + 2, hy + 1], [hx - 1, hy + 1], [hx + 2, hy], [hx - 1, hy], [hx + 2, hy + 2], [hx - 1, hy + 2], [hx + 3, hy + 1], [hx - 2, hy + 1]];
  const mask = blockedMask(z);
  for (const [x, y] of cands) {
    if (!freeTile(z, x, y) || mask.near(x, y, 1)) continue;
    const o = b.obj('ticket_kiosk', x, y, 0, {});
    if (o) { z.flags[z.idx(x, y)] |= TF.NOSPAWN; return [x, y] as [number, number]; }
  }
  return null;
}

/** an open strip near (x, y) where a transport can pull in: [x, y, facing] (tile of the vehicle centre) */
function findBay(z: Zone, x: number, y: number): [number, number, number] {
  const dist = bfs(z, ...nearestWalk(z, x, y), 4000);
  let best: [number, number, number] = [x, y + 3, 0], bestScore = -1;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 3 || dist[i] > 26) continue;
    const cx = i % z.W, cy = (i / z.W) | 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -5; dx <= 5; dx++) if (walkableTile(z, cx + dx, cy + dy) && (dy === 0 || !z.wallN[z.idx(cx + dx, cy + Math.max(0, dy))])) n++;
    const score = n * 4 - dist[i];
    if (score > bestScore) { bestScore = score; best = [cx, cy, 0]; }
  }
  return best;
}

export function placeContractProps(z: Zone, seed: number) {
  if (SKIP.has(z.key) || z.meta.noHopper) return;
  const anchors: Record<string, number[]> = (z.meta.anchors ||= {});
  const b = new ZoneBuilder(z, new Rng(seed ^ 0x5eed));
  let hopper = [...z.objects.values()].find((o) => o.key === 'hopper') || null;
  if (!hopper) {
    const spot = findHopperSpot(z);
    if (spot) hopper = b.obj('hopper', spot[0], spot[1], 0, { hopper: z.key });
  }
  if (hopper) {
    for (const [x, y] of z.footprint(hopper, { w: 2, d: 2 })) if (z.inb(x, y)) z.flags[z.idx(x, y)] |= TF.NOSPAWN | TF.NOBUILD;
    z.meta.hopperUid = hopper.uid;
    anchors.hopper ||= [hopper.x, hopper.y + 2];
    const sig = (z.meta.signals ||= []) as any[];
    if (!sig.some((s) => s.id === 'hopper_' + z.key)) sig.push({ id: 'hopper_' + z.key, freq: HOPPER_FREQ, x: hopper.x + 1, z: hopper.y + 1, range: 240, name: 'REMITTANCE HOPPER', text: 'HOPPER BEACON // DEPOSITS ACCEPTED // STAND CLEAR OF PLATE', pattern: 'pulse' });
  }
  // the passage kiosk
  const hasKiosk = [...z.objects.values()].some((o) => o.key === 'ticket_kiosk');
  if (z.key === 'depot' && !hasKiosk) {
    const a = anchors.ticket_kiosk;
    let placed = false;
    if (a) {
      for (let r = 0; r < 4 && !placed; r++) for (let dy = -r; dy <= r && !placed; dy++) for (let dx = -r; dx <= r && !placed; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (freeTile(z, a[0] + dx, a[1] + dy) && b.obj('ticket_kiosk', a[0] + dx, a[1] + dy, quarterTurn(a[2]), {})) placed = true;
      }
    }
    if (!placed && hopper) placeKioskNear(z, b, hopper.x, hopper.y);
    if (!anchors.transport_bay) { const k = [...z.objects.values()].find((o) => o.key === 'ticket_kiosk'); if (k) anchors.transport_bay = findBay(z, k.x, k.y); }
  }
  if (z.key === 'lobby' && !zoneSpec('depot') && !hasKiosk && hopper) {
    const k = placeKioskNear(z, b, hopper.x, hopper.y);
    if (k) { z.meta.kioskAt = [k[0], k[1]]; anchors.transport_bay ||= findBay(z, k[0], k[1]); }
  }
}

let installed = false;
export function installHopperPlacement() {
  if (installed) return;
  installed = true;
  onZoneGenerated(placeContractProps);
}
