// Connectivity repair: after a generator has carved its maze, rooms and set pieces,
// open plain wall segments until every walkable pocket can be reached from (sx, sy).
// Doors count as passable (they can be opened, forced or broken), windows do not.
import { Zone } from '../zone';
import { ZoneBuilder } from './builder';
import { Rng } from '../../core/rng';

export interface ConnectOpts {
  /** never open a wall that touches one of these rects (sealed set pieces) */
  keep?: { x0: number; y0: number; x1: number; y1: number }[];
  /** pockets smaller than this are filled in (void floor) instead of being connected */
  minSize?: number;
}

const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Returns the number of walls opened. Deterministic for a given rng state. */
export function connectRegions(z: Zone, b: ZoneBuilder, sx: number, sy: number, rng: Rng, opts: ConnectOpts = {}): number {
  const W = z.W, N = z.W * z.H;
  const walk = (i: number) => z.floor[i] !== 0 && z.solid[i] !== 1 && z.solid[i] !== 3;
  if (!z.inb(sx, sy) || !walk(z.idx(sx, sy))) return 0;
  const kept = (x: number, y: number) => (opts.keep || []).some((r) => x >= r.x0 - 1 && x <= r.x1 + 1 && y >= r.y0 - 1 && y <= r.y1 + 1);
  /** the edge between (x, y) and its neighbour in direction (dx, dy) */
  const edgeOf = (x: number, y: number, dx: number, dy: number): [number, number, 0 | 1] =>
    dx === 1 ? [x + 1, y, 1] : dx === -1 ? [x, y, 1] : dy === 1 ? [x, y + 1, 0] : [x, y, 0];
  const passable = (x: number, y: number, dx: number, dy: number) => {
    if (!z.edgeBlocks(x, y, dx, dy, 'walk')) return true;
    const [ex, ey, s] = edgeOf(x, y, dx, dy);
    const e = z.edge(ex, ey, s);
    return !!e && (e.kind === 'door' || e.kind === 'gate');
  };
  const loops = new Map<number, number[]>();
  for (const p of z.portals) if (p.kind === 'loop') {
    const X = p.x + (p.loopDx || 0), Y = p.y + (p.loopDy || 0);
    if (z.inb(X, Y)) { const k = z.idx(p.x, p.y); const a = loops.get(k) || []; a.push(z.idx(X, Y)); loops.set(k, a); }
  }
  const reached = new Uint8Array(N);
  const flood = (seeds: number[], mark: Uint8Array, val = 1, out?: number[]) => {
    const st = seeds.slice();
    for (const s of st) { mark[s] = val; out?.push(s); }
    while (st.length) {
      const i = st.pop()!, x = i % W, y = (i - x) / W;
      for (const [dx, dy] of DIRS) {
        const X = x + dx, Y = y + dy;
        if (!z.inb(X, Y)) continue;
        const j = Y * W + X;
        if (mark[j] || !walk(j) || !passable(x, y, dx, dy)) continue;
        mark[j] = val; out?.push(j); st.push(j);
      }
      for (const j of loops.get(i) || []) if (!mark[j] && walk(j)) { mark[j] = val; out?.push(j); st.push(j); }
    }
  };
  flood([z.idx(sx, sy)], reached);

  let opened = 0, changed = true;
  const dead = new Uint8Array(N); // pockets we could not connect this pass
  while (changed) {
    changed = false;
    dead.fill(0);
    for (let i = 0; i < N; i++) {
      if (reached[i] || dead[i] || !walk(i)) continue;
      const comp: number[] = [];
      flood([i], dead, 1, comp);
      if (opts.minSize && comp.length < opts.minSize) {
        for (const j of comp) { z.floor[j] = 0; reached[j] = 1; }
        changed = true;
        continue;
      }
      const cands: [number, number, 0 | 1][] = [];
      for (const j of comp) {
        const x = j % W, y = (j - x) / W;
        if (kept(x, y)) continue;
        for (const [dx, dy] of DIRS) {
          const X = x + dx, Y = y + dy;
          if (!z.inb(X, Y) || kept(X, Y)) continue;
          const k = Y * W + X;
          if (!reached[k] || !walk(k)) continue;
          const [ex, ey, s] = edgeOf(x, y, dx, dy);
          if (z.edge(ex, ey, s)) continue; // a door/window/arch already lives here
          cands.push([ex, ey, s]);
        }
      }
      if (!cands.length) continue;
      const [ex, ey, s] = cands[rng.int(0, cands.length - 1)];
      b.gap(ex, ey, s);
      opened++;
      flood(comp, reached);
      changed = true;
    }
  }
  return opened;
}
