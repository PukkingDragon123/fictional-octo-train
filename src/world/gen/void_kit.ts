// Holes and weird rooms, for the generated floors, the dimensions and for
// stamping into older zones (src/social/floors.ts runs the stamping hook):
//   pit()            a black hole in the floor you can jump into (void tiles
//                    with real depth; z.meta.holes tells the floor system
//                    where it leads, a 'hole' portal records the link)
//   giantStairs()    a staircase rising over a void along a path of segments,
//                    ending in a landing (or a hole, or nothing at all)
//   stairsToNowhere() a short flight on ordinary floor that just stops
//   scaleHall()      a hall built for something five metres tall
//   findOpenRect()   an empty, wall-free, portal-free stretch of floor
import { Zone, TF } from '../zone';
import { type Ctx, type Side, decal, force, put, isOpen, arrive } from './mall_kit';
import { hh } from './weird_kit';

export interface HoleSpec {
  /** destination zone key ('floor~123', 'chess', 'lobby'...) */
  to: string;
  /** arrival anchor in the destination (default 'fall') */
  anchor?: string;
  /** online, this hole can drop you onto another player's floor */
  shared?: boolean;
  label?: string;
}
export interface HoleRec extends HoleSpec { id: string; cx: number; cy: number; r: number; x0: number; y0: number; x1: number; y1: number }

const DIRS: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
/** rotation of a step's nosing for a flight climbing along (dx, dy): it faces back down the flight */
const NOSE_ROT: Record<string, 0 | 1 | 2 | 3> = { '0,-1': 0, '1,0': 1, '0,1': 2, '-1,0': 3 };

/** is a tile part of a hole registered on this zone? */
export function holeAt(z: Zone, x: number, y: number): HoleRec | null {
  for (const h of (z.meta.holes || []) as HoleRec[]) {
    if (x < h.x0 || x > h.x1 || y < h.y0 || y > h.y1) continue;
    if (!z.floor[z.idx(x, y)]) return h;
  }
  return null;
}

/**
 * A pit centred on world point (cx, cy) with radius r (tiles), carved to the
 * void. Everything standing there is removed and the walls inside are cut.
 */
export function pit(c: Ctx, cx: number, cy: number, r: number, spec: HoleSpec, id: string): HoleRec | null {
  const { z, b } = c;
  const x0 = Math.floor(cx - r), x1 = Math.floor(cx + r - 0.001), y0 = Math.floor(cy - r), y1 = Math.floor(cy + r - 0.001);
  const cut: [number, number][] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!z.inb(x, y) || x < 1 || y < 1 || x > z.W - 2 || y > z.H - 2) continue;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy > r * r) continue;
    cut.push([x, y]);
  }
  if (!cut.length) return null;
  b.clearObjects(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  for (const [x, y] of cut) { z.floor[z.idx(x, y)] = 0; z.height[z.idx(x, y)] = 0; }
  for (const [x, y] of cut) { if (cut.some(([a, bb]) => a === x && bb === y - 1)) b.clearN(x, y); if (cut.some(([a, bb]) => a === x - 1 && bb === y)) b.clearW(x, y); }
  b.flag(x0 - 2, y0 - 2, x1 + 2, y1 + 2, TF.NOSPAWN | TF.NOBUILD);
  // the portal sits on a pit tile that touches the rim (zonecheck links; the floor system does the falling)
  let px = cut[0][0], py = cut[0][1];
  for (const [x, y] of cut) if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => z.inb(x + dx, y + dy) && z.floor[z.idx(x + dx, y + dy)])) { px = x; py = y; break; }
  b.portal({ id, x: px, y: py, kind: 'hole', to: spec.to, tx: 0, ty: 0, anchor: spec.anchor ?? 'fall', label: spec.label ?? 'Jump into the hole' });
  const rec: HoleRec = { ...spec, id, cx, cy, r, x0, y0, x1, y1 };
  (z.meta.holes ||= []).push(rec);
  // torn edges and grime round the lip
  const n = Math.max(5, Math.round(r * 6));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hh(i, id.length, 7101) * 0.5;
    const rr = r + 0.25 + hh(i, 3, 7102) * 0.35;
    decal(z, i % 3 ? 'decal_crack' : 'decal_stain_dark', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.9 + hh(i, 4, 7103) * 0.8, 0.9, a, i % 3 ? undefined : 0x606060, 0.85);
  }
  return rec;
}

/** a rectangle of floor with nothing standing on it, no walls inside and no portals near it */
export function findOpenRect(z: Zone, w: number, h: number, rng: { int(a: number, b: number): number }, tries = 400, margin = 2): [number, number] | null {
  const ok = (x0: number, y0: number) => {
    for (let y = y0 - margin; y < y0 + h + margin; y++) for (let x = x0 - margin; x < x0 + w + margin; x++) {
      if (!z.inb(x, y) || x < 2 || y < 2 || x > z.W - 3 || y > z.H - 3) return false;
      const i = z.idx(x, y);
      if (!z.floor[i] || z.solid[i] || (z.flags[i] & (TF.NOSPAWN | TF.SHIFT | TF.STAIRS | TF.SAFE))) return false;
      if (z.height[i] !== 0) return false;
      if (y > y0 - margin && z.wallN[i]) return false;
      if (x > x0 - margin && z.wallW[i]) return false;
      if (z.edges.has(i * 2) || z.edges.has(i * 2 + 1)) return false;
      if (!isOpen(z, x, y)) return false;
    }
    for (const p of z.portals) if (p.x >= x0 - margin - 2 && p.x < x0 + w + margin + 2 && p.y >= y0 - margin - 2 && p.y < y0 + h + margin + 2) return false;
    for (const a of Object.values(z.meta.anchors || {}) as number[][]) if (Array.isArray(a) && a[0] >= x0 - margin && a[0] < x0 + w + margin && a[1] >= y0 - margin && a[1] < y0 + h + margin) return false;
    return true;
  };
  for (let t = 0; t < tries; t++) {
    const x0 = rng.int(3, z.W - w - 4), y0 = rng.int(3, z.H - h - 4);
    if (ok(x0, y0)) return [x0, y0];
  }
  return null;
}

export interface StairOpts {
  /** path of [direction, length] segments from the foot of the stairs */
  path: [Side, number][];
  width?: number;
  /** rise per step in 0.1 m (default 5 = 0.5 m) */
  rise?: number;
  /** base height in 0.1 m */
  base?: number;
  floor?: string;
  /** what waits at the top: a hole, a sign that says UP, or nothing */
  top?: 'hole' | 'sign' | 'none';
  hole?: HoleSpec; holeId?: string;
}

/**
 * Giant stairs: carve the rect to void, then lay the stair path through it
 * from (sx, sy) (the first step, at the rect's edge). Returns the top tile.
 */
export function giantStairs(c: Ctx, x0: number, y0: number, x1: number, y1: number, sx: number, sy: number, o: StairOpts): [number, number] {
  const { z, b } = c;
  const W = o.width ?? 3, rise = o.rise ?? 5, floor = o.floor ?? 'vx_step';
  b.clearObjects(x0, y0, x1, y1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (z.inb(x, y)) { z.floor[z.idx(x, y)] = 0; z.height[z.idx(x, y)] = 0; }
  b.clearWallsIn(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  b.flag(x0, y0, x1, y1, TF.NOSPAWN | TF.NOBUILD | TF.STAIRS);
  let x = sx, y = sy, h = o.base ?? rise;
  const lay = (cx: number, cy: number, d: [number, number], hv: number) => {
    // a row of W tiles across the direction of travel, each with a rounded stone nosing facing down the flight
    const px = d[1] !== 0 ? 1 : 0, py = d[0] !== 0 ? 1 : 0;
    const rot = NOSE_ROT[d[0] + ',' + d[1]] ?? 0;
    for (let k = 0; k < W; k++) {
      const X = cx + px * (k - (W >> 1)), Y = cy + py * (k - (W >> 1));
      if (!z.inb(X, Y)) continue;
      b.fillFloor(X, Y, X, Y, floor);
      z.height[z.idx(X, Y)] = Math.min(127, hv);
      b.obj('vx_step_nosing', X, Y, rot, {});
    }
  };
  let last: [number, number] = [x, y];
  let lastD: [number, number] = [0, -1];
  o.path.forEach(([side, len], s) => {
    const d = DIRS[side];
    // step off the previous landing at its edge
    if (s > 0) { x = last[0] + d[0] * ((W >> 1) + 1); y = last[1] + d[1] * ((W >> 1) + 1); }
    for (let i = 0; i < len; i++) {
      lay(x, y, d, h);
      last = [x, y]; lastD = d;
      x += d[0]; y += d[1];
      h = Math.min(127, h + rise);
    }
    // a landing as wide as the flight round the last step
    const hl = Math.min(127, h - rise);
    for (let j = -(W >> 1); j <= (W >> 1); j++) for (let i = -(W >> 1); i <= (W >> 1); i++) {
      const X = last[0] + i, Y = last[1] + j;
      if (z.inb(X, Y) && X >= x0 && X <= x1 && Y >= y0 && Y <= y1 && !z.floor[z.idx(X, Y)]) { b.fillFloor(X, Y, X, Y, floor); z.height[z.idx(X, Y)] = hl; }
    }
  });
  // decorate the top
  const top = last;
  // with a hole spec, the whole void round the flight is a way down: step off anywhere
  if (o.hole) (z.meta.holes ||= []).push({ ...o.hole, id: (o.holeId || 'vx_stair_hole') + '_void', cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, r: 0, x0, y0, x1, y1, label: 'Step off into the dark' } as HoleRec);
  if (o.top === 'hole' && o.hole) {
    // a hole cut into the last landing itself: you climb all that way to fall
    const hx = top[0] + 0.5, hy = top[1] + 0.5;
    // keep a ring of floor round it: the hole takes only the centre tile
    pit(c, hx, hy, 0.55, o.hole, o.holeId || 'vx_stair_hole');
  } else if (o.top === 'sign') {
    put(c, 'vx_stair_sign', top[0] - lastD[1], top[1] + lastD[0], 0, {});
  }
  // a few loose steps floating in the dark beside the flight
  for (let i = 0; i < 6; i++) {
    const X = x0 + 1 + Math.floor(hh(i, x0, 7111) * Math.max(1, x1 - x0 - 2)), Y = y0 + 1 + Math.floor(hh(i, y0, 7112) * Math.max(1, y1 - y0 - 2));
    if (!z.inb(X, Y) || z.floor[z.idx(X, Y)]) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) if (z.inb(X + dx, Y + dy) && z.floor[z.idx(X + dx, Y + dy)]) near = true;
    if (near) continue;
    b.fillFloor(X, Y, X, Y, floor);
    z.height[z.idx(X, Y)] = Math.min(127, Math.floor(hh(i, 9, 7113) * 90) + 10);
    b.flag(X, Y, X, Y, TF.NOSPAWN);
  }
  return top;
}

/** a short flight on ordinary floor that just stops in the air */
export function stairsToNowhere(c: Ctx, x: number, y: number, dir: Side, steps = 7, width = 2, floor = 'vx_step') {
  const { z, b } = c;
  const d = DIRS[dir];
  const px = d[1] !== 0 ? 1 : 0, py = d[0] !== 0 ? 1 : 0;
  for (let i = 0; i < steps; i++) for (let k = 0; k < width; k++) {
    const X = x + d[0] * i + px * k, Y = y + d[1] * i + py * k;
    if (!z.inb(X, Y)) continue;
    b.fillFloor(X, Y, X, Y, floor);
    z.height[z.idx(X, Y)] = Math.min(127, (i + 1) * 4);
    b.flag(X, Y, X, Y, TF.STAIRS | TF.NOBUILD);
    b.obj('vx_step_nosing', X, Y, NOSE_ROT[d[0] + ',' + d[1]] ?? 0, {});
  }
  const tx = x + d[0] * (steps - 1), ty = y + d[1] * (steps - 1);
  put(c, 'vx_stair_sign', tx + px * width, ty + py * width, 0, {});
}

/** a hall built for something tall: a chair as big as a room, a door frame for a giant, ordinary chairs for scale */
export function scaleHall(c: Ctx, x0: number, y0: number, x1: number, y1: number, opts: { floor?: string; wall?: string; paper?: string; hole?: HoleSpec; holeId?: string } = {}) {
  const { z, b, rng } = c;
  b.clearObjects(x0, y0, x1, y1);
  b.fillFloor(x0, y0, x1, y1, opts.floor ?? 'wood');
  b.clearWallsIn(x0, y0, x1, y1);
  b.roomWalls(x0, y0, x1, y1, opts.wall ?? 'drywall');
  if (opts.paper) b.paper(x0, y0, x1, y1, opts.paper);
  b.addRoom('The Tall Room', 'scale_hall', x0, y0, x1, y1, { circuit: 0 });
  const cx = (x0 + x1) >> 1, cy = (y0 + y1) >> 1;
  force(c, 'vx_giant_chair', cx - 1, cy - 1, (rng.int(0, 3)) as any, {});
  force(c, 'vx_giant_frame', cx - 1, y0, 0, {});
  for (let i = 0; i < 4; i++) put(c, 'chair_wood', x0 + 2 + rng.int(0, Math.max(1, x1 - x0 - 4)), y1 - 1 - rng.int(0, 2), rng.int(0, 3) as any, {});
  b.light(cx + 0.5, cy + 0.5, 'sky', { color: 0xf4ecd8, intensity: 0.9, radius: Math.max(x1 - x0, y1 - y0) * 0.7, y: 8, circuit: 0 });
  if (opts.hole) pit(c, x1 - 2.5, y1 - 2.5, 1.1, opts.hole, opts.holeId || 'vx_hall_hole');
}

/** where someone falling in lands: an anchor with clear floor round it */
export function landing(c: Ctx, id: string, x: number, y: number, r = 2) {
  const { z, b } = c;
  b.clearObjects(x - 1, y - 1, x + 1, y + 1);
  if (!z.floor[z.idx(x, y)]) b.fillFloor(x, y, x, y, 'concrete');
  arrive(b, id, x, y, 's', r);
}
