import { Zone, TileObject } from './zone';
import { wallDef, WALL_H } from './defs';
import { objDef, objectGeometry, ObjDef } from './objects';

export interface Mover { x: number; z: number; radius: number; }
export interface MoveOpts {
  creature?: boolean;      // creatures ignore some things / can't open doors
  ignoreLow?: boolean;     // vaulting
  ghost?: boolean;         // passes walls (wall-hiders)
  height?: number;         // tall creatures collide with low ceilings? (unused)
  under?: boolean;         // flat on the floor (crawling, rolling): passes under tables
}

const segs: number[] = [];

/** Collect blocking line segments (x0,z0,x1,z1,halfThick) around a tile range */
function gatherSegments(z: Zone, tx0: number, ty0: number, tx1: number, ty1: number, mode: 'walk' | 'creature') {
  segs.length = 0;
  for (let y = ty0; y <= ty1 + 1; y++) for (let x = tx0; x <= tx1 + 1; x++) {
    if (!z.inb(x, y)) continue;
    const i = z.idx(x, y);
    for (const side of [0, 1] as const) {
      const wid = side === 0 ? z.wallN[i] : z.wallW[i];
      const e = z.edges.get(i * 2 + side);
      if (!wid && !e) continue;
      const T = wid ? (wallDef(wid).thick ?? 0.12) / 2 : 0.06;
      const ax = x, az = y;
      const bx = side === 0 ? x + 1 : x, bz = side === 0 ? y : y + 1;
      if (e) {
        const blocked = z.edgeBlocks(side === 0 ? x : x - 1, side === 0 ? y - 1 : y, side === 0 ? 0 : 1, side === 0 ? 1 : 0, mode);
        // openings leave the jambs at either end as short segments
        const gap = e.kind === 'window' ? 0.8 : e.kind === 'arch' ? 0.9 : 0.84;
        const a0 = (1 - gap) / 2, a1 = a0 + gap;
        if (wid) {
          pushSeg(lerpP(ax, bx, 0), lerpP(az, bz, 0), lerpP(ax, bx, a0), lerpP(az, bz, a0), T);
          pushSeg(lerpP(ax, bx, a1), lerpP(az, bz, a1), lerpP(ax, bx, 1), lerpP(az, bz, 1), T);
        }
        if (blocked) pushSeg(lerpP(ax, bx, a0), lerpP(az, bz, a0), lerpP(ax, bx, a1), lerpP(az, bz, a1), 0.05);
      } else {
        pushSeg(ax, az, bx, bz, T);
      }
    }
  }
}
const lerpP = (a: number, b: number, t: number) => a + (b - a) * t;
function pushSeg(x0: number, z0: number, x1: number, z1: number, t: number) { segs.push(x0, z0, x1, z1, t); }

/** Is the tile impassable for the mover (void, solid furniture, deep water for non-swimmers...) */
export function tileSolid(z: Zone, x: number, y: number, o: MoveOpts): boolean {
  if (!z.inb(x, y)) return true;
  const i = z.idx(x, y);
  if (!z.floor[i]) return true;
  const s = z.solid[i];
  if (s === 1) return true;
  if (s === 3) return !o.under;
  if (s === 2 && !o.ignoreLow) return true;
  return false;
}

/** pallets, a dropped crate lid, a low step: walked over (no vault), see tileBoxes */
export const STEP_OVER = 0.32;

const _boxes: number[] = [];
const footCache = new WeakMap<TileObject, { key: string; x0: number; z0: number; x1: number; z1: number }>();

/** the world-space footprint (x0, z0, x1, z1) of a piece of furniture: its model's box, turned with it */
export function objFootprint(z: Zone, ob: TileObject, d: ObjDef): { x0: number; z0: number; x1: number; z1: number } {
  const key = `${ob.x},${ob.y},${ob.rot},${ob.ox ?? 0},${ob.oz ?? 0},${ob.state?.yaw ?? 0},${ob.state?.dmg ?? 0},${d.variant ? d.variant(ob.state || {}) : ''}`;
  const c = footCache.get(ob);
  if (c && c.key === key) return c;
  const w = d.w ?? 1, dd = d.d ?? 1;
  const rw = ob.rot % 2 === 0 ? w : dd, rd = ob.rot % 2 === 0 ? dd : w;
  const cx = ob.x + rw / 2 + (ob.ox ?? 0), cz = ob.y + rd / 2 + (ob.oz ?? 0);
  // the whole footprint by default (no model, a model that fails)
  let x0 = ob.x, z0 = ob.y, x1 = ob.x + rw, z1 = ob.y + rd;
  let g = null;
  try { g = objectGeometry(d, ob); } catch { g = null; }
  if (g) {
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox!;
    const a = -ob.rot * Math.PI / 2 + (ob.state?.yaw ?? 0), ca = Math.cos(a), sa = Math.sin(a);
    let mx0 = Infinity, mz0 = Infinity, mx1 = -Infinity, mz1 = -Infinity;
    for (const lx of [bb.min.x, bb.max.x]) for (const lz of [bb.min.z, bb.max.z]) {
      const wx = cx + lx * ca + lz * sa, wz = cz - lx * sa + lz * ca;
      if (wx < mx0) mx0 = wx; if (wx > mx1) mx1 = wx; if (wz < mz0) mz0 = wz; if (wz > mz1) mz1 = wz;
    }
    // a little in from the model's extremes (handles, a chair's splayed feet), never thinner than a hand
    const ins = 0.04;
    mx0 += ins; mz0 += ins; mx1 -= ins; mz1 -= ins;
    if (mx1 - mx0 < 0.22) { const m = (mx0 + mx1) / 2; mx0 = m - 0.11; mx1 = m + 0.11; }
    if (mz1 - mz0 < 0.22) { const m = (mz0 + mz1) / 2; mz0 = m - 0.11; mz1 = m + 0.11; }
    // never outside its own tiles (a model that overhangs does not reach into the next aisle)
    x0 = Math.max(x0, mx0); z0 = Math.max(z0, mz0); x1 = Math.min(x1, mx1); z1 = Math.min(z1, mz1);
    if (x1 <= x0 || z1 <= z0) { x0 = ob.x; z0 = ob.y; x1 = ob.x + rw; z1 = ob.y + rd; }
  }
  const out = { key, x0, z0, x1, z1 };
  footCache.set(ob, out);
  return out;
}

/** the boxes a solid tile pushes a mover out of: the footprints of what blocks there, else the whole tile */
function tileBoxes(z: Zone, tx: number, ty: number, o: MoveOpts): number[] {
  _boxes.length = 0;
  const inb = z.inb(tx, ty);
  if (!inb || !z.floor[z.idx(tx, ty)]) { _boxes.push(tx, ty, tx + 1, ty + 1); return _boxes; }
  let any = false;
  for (const ob of z.objectsAt(tx, ty)) {
    const d = objDef(ob.key);
    if (!d) continue;
    if (ob.state?.broken && d.brokenPassable) continue;
    const b = d.block ?? 'solid';
    if (b === 'none') continue;
    any = true;
    if (b === 'table' && o.under) continue;
    if (b === 'low' && (o.ignoreLow || d.height <= STEP_OVER)) continue;
    const f = objFootprint(z, ob, d);
    const x0 = Math.max(tx, f.x0), z0 = Math.max(ty, f.z0), x1 = Math.min(tx + 1, f.x1), z1 = Math.min(ty + 1, f.z1);
    if (x1 > x0 && z1 > z0) _boxes.push(x0, z0, x1, z1);
  }
  // solid for some other reason (nothing registered here): the old inset tile
  if (!any) _boxes.push(tx + 0.06, ty + 0.06, tx + 0.94, ty + 0.94);
  return _boxes;
}

/** push a circle out of an axis-aligned box (slides along its faces, rolls round its corners) */
function pushOutOfBox(m: Mover, r: number, bx0: number, bz0: number, bx1: number, bz1: number): boolean {
  const cx = Math.max(bx0, Math.min(m.x, bx1)), cz = Math.max(bz0, Math.min(m.z, bz1));
  const ddx = m.x - cx, ddz = m.z - cz;
  const d2 = ddx * ddx + ddz * ddz;
  if (d2 >= r * r) return false;
  if (d2 < 1e-8) {
    // centre inside box: push out along the smallest axis
    const pl = m.x - bx0, pr = bx1 - m.x, pt = m.z - bz0, pb = bz1 - m.z;
    const mn = Math.min(pl, pr, pt, pb);
    if (mn === pl) m.x = bx0 - r; else if (mn === pr) m.x = bx1 + r; else if (mn === pt) m.z = bz0 - r; else m.z = bz1 + r;
  } else {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    m.x += ddx * push; m.z += ddz * push;
  }
  return true;
}

/**
 * Can a hand at (ax, az) reach (bx, bz)? No wall, shut door, shut window or partition crosses the line
 * between them (an open or broken window can be reached through). The far point is pulled a hair toward
 * the near one, so a door or a wall-mounted thing on the line itself counts as on this side.
 */
export function clearReach(z: Zone, ax: number, az: number, bx: number, bz: number): boolean {
  let dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return true;
  const k = Math.max(0, dist - 0.06) / dist;
  bx = ax + dx * k; bz = az + dz * k; dx = bx - ax; dz = bz - az;
  const d2 = Math.hypot(dx, dz);
  if (d2 < 1e-4) return true;
  let x = Math.floor(ax), y = Math.floor(az);
  const tx = Math.floor(bx), ty = Math.floor(bz);
  const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(d2 / dx) : 1e9, tDY = dz !== 0 ? Math.abs(d2 / dz) : 1e9;
  let tMX = dx !== 0 ? ((dx > 0 ? x + 1 : x) - ax) / dx * d2 : 1e9;
  let tMY = dz !== 0 ? ((dz > 0 ? y + 1 : y) - az) / dz * d2 : 1e9;
  const blocks = (x0: number, y0: number, sx: number, sy: number) => {
    if (!z.edgeBlocks(x0, y0, sx, sy, 'walk')) return false;
    // through an open or broken window is a reach, not a wall
    let ex = x0, ey = y0, side: 0 | 1;
    if (sx === 1) { ex = x0 + 1; side = 1; } else if (sx === -1) side = 1; else if (sy === 1) { ey = y0 + 1; side = 0; } else side = 0;
    const e = z.edge(ex, ey, side);
    return !(e && e.kind === 'window' && (e.open || e.glass !== 'intact') && (e.barricade ?? 0) === 0);
  };
  for (let g = 0; g < 64; g++) {
    if (x === tx && y === ty) return true;
    if (tMX < tMY) { if (blocks(x, y, stepX, 0)) return false; x += stepX; tMX += tDX; }
    else { if (blocks(x, y, 0, stepY)) return false; y += stepY; tMY += tDY; }
    if (!z.inb(x, y)) return false;
  }
  return true;
}

/**
 * Move a circle through the tile world with sliding collision against edge
 * walls, door jambs, closed doors/windows and solid furniture tiles.
 * Returns true if any collision happened.
 */
export function moveCircle(z: Zone, m: Mover, dx: number, dz: number, o: MoveOpts = {}): boolean {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / 0.08));
  const sx = dx / steps, sz = dz / steps;
  let hit = false;
  for (let s = 0; s < steps; s++) {
    m.x += sx; m.z += sz;
    if (o.ghost) continue;
    if (resolve(z, m, o)) hit = true;
  }
  return hit;
}

export function resolve(z: Zone, m: Mover, o: MoveOpts = {}): boolean {
  const r = m.radius;
  const tx0 = Math.floor(m.x - r - 0.2), tx1 = Math.floor(m.x + r + 0.2);
  const ty0 = Math.floor(m.z - r - 0.2), ty1 = Math.floor(m.z + r + 0.2);
  let hit = false;
  // furniture: the real footprint of each blocking piece (its model's box, clipped to the tile), not the whole
  // tile, so a body slides round a chair or along a counter instead of catching on an invisible square; void
  // tiles stay whole boxes
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!tileSolid(z, tx, ty, o)) continue;
    const boxes = tileBoxes(z, tx, ty, o);
    for (let b = 0; b < boxes.length; b += 4) if (pushOutOfBox(m, r, boxes[b], boxes[b + 1], boxes[b + 2], boxes[b + 3])) hit = true;
  }
  // wall segments
  gatherSegments(z, tx0, ty0, tx1, ty1, o.creature ? 'creature' : 'walk');
  for (let k = 0; k < segs.length; k += 5) {
    const x0 = segs[k], z0 = segs[k + 1], x1 = segs[k + 2], z1 = segs[k + 3], t = segs[k + 4];
    const vx = x1 - x0, vz = z1 - z0;
    const l2 = vx * vx + vz * vz;
    let u = l2 > 0 ? ((m.x - x0) * vx + (m.z - z0) * vz) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = x0 + vx * u, pz = z0 + vz * u;
    const ddx = m.x - px, ddz = m.z - pz;
    const d2 = ddx * ddx + ddz * ddz;
    const rr = r + t;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-4;
      const push = (rr - d) / d;
      m.x += ddx * push; m.z += ddz * push;
      hit = true;
    }
  }
  return hit;
}

/** Line of sight test between two world points (sight mode) */
export function lineOfSight(z: Zone, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return true;
  let x = Math.floor(ax), y = Math.floor(az);
  const tx = Math.floor(bx), ty = Math.floor(bz);
  const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(dist / dx) : 1e9, tDY = dz !== 0 ? Math.abs(dist / dz) : 1e9;
  let tMX = dx !== 0 ? ((dx > 0 ? x + 1 : x) - ax) / dx * dist : 1e9;
  let tMY = dz !== 0 ? ((dz > 0 ? y + 1 : y) - az) / dz * dist : 1e9;
  for (let g = 0; g < 300; g++) {
    if (x === tx && y === ty) return true;
    if (tMX < tMY) {
      if (z.edgeBlocks(x, y, stepX, 0, 'sight')) return false;
      x += stepX; tMX += tDX;
    } else {
      if (z.edgeBlocks(x, y, 0, stepY, 'sight')) return false;
      y += stepY; tMY += tDY;
    }
    if (!z.inb(x, y)) return false;
    if (z.sight[z.idx(x, y)] && !(x === tx && y === ty)) return false;
  }
  return true;
}

/** Count walls/doors between two points (for sound muffling) */
export function wallsBetween(z: Zone, ax: number, az: number, bx: number, bz: number, max = 6): number {
  const dx = bx - ax, dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-4) return 0;
  let x = Math.floor(ax), y = Math.floor(az);
  const tx = Math.floor(bx), ty = Math.floor(bz);
  const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(dist / dx) : 1e9, tDY = dz !== 0 ? Math.abs(dist / dz) : 1e9;
  let tMX = dx !== 0 ? ((dx > 0 ? x + 1 : x) - ax) / dx * dist : 1e9;
  let tMY = dz !== 0 ? ((dz > 0 ? y + 1 : y) - az) / dz * dist : 1e9;
  let n = 0;
  for (let g = 0; g < 300; g++) {
    if (x === tx && y === ty) return n;
    if (tMX < tMY) { if (z.edgeBlocks(x, y, stepX, 0, 'sight')) n++; x += stepX; tMX += tDX; }
    else { if (z.edgeBlocks(x, y, 0, stepY, 'sight')) n++; y += stepY; tMY += tDY; }
    if (n >= max || !z.inb(x, y)) return n;
  }
  return n;
}

export function objectBlocksAt(z: Zone, x: number, y: number) {
  const objs = z.objectsAt(x, y);
  for (const o of objs) { const d = objDef(o.key); if (d && (d.block ?? 'solid') !== 'none') return o; }
  return null;
}

export { WALL_H };
