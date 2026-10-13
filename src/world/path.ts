import { Zone } from './zone';

/**
 * A* pathfinding on the tile grid honouring edge walls, doors and furniture.
 * opts.doors: treat closed (unlocked, unbarricaded) doors as passable (the
 * walker opens them). Returns tile path excluding start, or null.
 */
export interface PathOpts { doors?: boolean; maxNodes?: number; creature?: boolean; avoidWater?: boolean; ghost?: boolean; }

const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];

class Heap {
  a: number[] = []; f: Float64Array;
  constructor(f: Float64Array) { this.f = f; }
  push(i: number) { const a = this.a; a.push(i); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (this.f[a[p]] <= this.f[a[k]]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop(): number { const a = this.a; const top = a[0]; const last = a.pop()!; if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l; if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } } return top; }
  get size() { return this.a.length; }
}

let gBuf: Float64Array | null = null, fBuf: Float64Array | null = null, cameBuf: Int32Array | null = null, stamp: Uint32Array | null = null;
let curStamp = 1;

export function stepAllowed(z: Zone, x: number, y: number, dx: number, dy: number, o: PathOpts): boolean {
  const nx = x + dx, ny = y + dy;
  if (!z.inb(nx, ny)) return false;
  const i = z.idx(nx, ny);
  if (!z.floor[i]) return false;
  if (o.avoidWater && z.floor[i] && (z as any).isDeep?.(nx, ny)) return false;
  if (dx !== 0 && dy !== 0) {
    return stepAllowed(z, x, y, dx, 0, o) && stepAllowed(z, x + dx, y, 0, dy, o) && stepAllowed(z, x, y, 0, dy, o) && stepAllowed(z, x, y + dy, dx, 0, o);
  }
  if (!o.ghost && z.edgeBlocks(x, y, dx, dy, o.creature ? 'creature' : 'walk')) {
    if (!o.doors) return false;
    // closed door that can be opened?
    let ex = x, ey = y, side: 0 | 1;
    if (dx === 1) { ex = x + 1; side = 1; } else if (dx === -1) side = 1; else if (dy === 1) { ey = y + 1; side = 0; } else side = 0;
    const e = z.edge(ex, ey, side);
    if (!e || e.kind === 'window' || e.locked || e.barricade > 0) return false;
  }
  const s = z.solid[i];
  if (s === 1 || s === 3) return false;
  if (s === 2 && !o.creature) return false;
  return true;
}

export function findPath(z: Zone, sx: number, sy: number, tx: number, ty: number, o: PathOpts = {}): [number, number][] | null {
  if (!z.inb(sx, sy) || !z.inb(tx, ty)) return null;
  const N = z.W * z.H;
  if (!gBuf || gBuf.length < N) { gBuf = new Float64Array(N); fBuf = new Float64Array(N); cameBuf = new Int32Array(N); stamp = new Uint32Array(N); }
  curStamp++;
  const g = gBuf, f = fBuf!, came = cameBuf!, st = stamp!;
  const W = z.W;
  const start = sy * W + sx, goal = ty * W + tx;
  const h = (i: number) => { const x = i % W, y = (i / W) | 0; const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  st[start] = curStamp; g[start] = 0; f[start] = h(start); came[start] = -1;
  const open = new Heap(f);
  open.push(start);
  const closed = new Set<number>();
  const maxN = o.maxNodes ?? 6000;
  let n = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) {
      const path: [number, number][] = [];
      let c = cur;
      while (c !== start && c >= 0) { path.push([c % W, (c / W) | 0]); c = came[c]; }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++n > maxN) return null;
    const cx = cur % W, cy = (cur / W) | 0;
    for (const [dx, dy, cost] of DIRS) {
      if (!stepAllowed(z, cx, cy, dx, dy, o)) continue;
      const ni = (cy + dy) * W + cx + dx;
      if (closed.has(ni)) continue;
      let c = cost;
      if (z.solid[ni] === 2) c += 2; // vault costs
      const ng = g[cur] + c;
      if (st[ni] !== curStamp || ng < g[ni]) {
        st[ni] = curStamp; g[ni] = ng; f[ni] = ng + h(ni); came[ni] = cur;
        open.push(ni);
      }
    }
  }
  return null;
}

/** nearest walkable tile adjacent to target tile (for interacting with furniture) */
export function adjacentStand(z: Zone, tx: number, ty: number, fromX: number, fromY: number): [number, number] | null {
  let best: [number, number] | null = null, bd = 1e9;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = tx + dx, y = ty + dy;
    if (!z.inb(x, y)) continue;
    const i = z.idx(x, y);
    if (!z.floor[i] || z.solid[i] === 1 || z.solid[i] === 3) continue;
    // must be able to reach the target without a wall in between
    if (Math.abs(dx) + Math.abs(dy) === 1) { if (z.edgeBlocks(x, y, -dx, -dy, 'walk')) continue; }
    else if (z.edgeBlocks(x, y, -dx, 0, 'walk') || z.edgeBlocks(x, y, 0, -dy, 'walk') || z.edgeBlocks(tx, ty, dx, 0, 'walk') || z.edgeBlocks(tx, ty, 0, dy, 'walk')) continue;
    const d = Math.hypot(x - fromX, y - fromY);
    if (d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
