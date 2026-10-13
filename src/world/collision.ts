import { Zone } from './zone';
import { wallDef, WALL_H } from './defs';
import { objDef } from './objects';

export interface Mover { x: number; z: number; radius: number; }
export interface MoveOpts {
  creature?: boolean;      // creatures ignore some things / can't open doors
  ignoreLow?: boolean;     // vaulting
  ghost?: boolean;         // passes walls (wall-hiders)
  height?: number;         // tall creatures collide with low ceilings? (unused)
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
  if (s === 1 || s === 3) return true;
  if (s === 2 && !o.ignoreLow) return true;
  return false;
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
  // furniture / void tiles as AABBs
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!tileSolid(z, tx, ty, o)) continue;
    const inset = z.inb(tx, ty) && z.floor[z.idx(tx, ty)] ? 0.06 : 0;
    const bx0 = tx + inset, bx1 = tx + 1 - inset, bz0 = ty + inset, bz1 = ty + 1 - inset;
    const cx = Math.max(bx0, Math.min(m.x, bx1)), cz = Math.max(bz0, Math.min(m.z, bz1));
    let ddx = m.x - cx, ddz = m.z - cz;
    let d2 = ddx * ddx + ddz * ddz;
    if (d2 < r * r) {
      if (d2 < 1e-8) {
        // centre inside box: push out along smallest axis
        const pl = m.x - bx0, pr = bx1 - m.x, pt = m.z - bz0, pb = bz1 - m.z;
        const mn = Math.min(pl, pr, pt, pb);
        if (mn === pl) m.x = bx0 - r; else if (mn === pr) m.x = bx1 + r; else if (mn === pt) m.z = bz0 - r; else m.z = bz1 + r;
      } else {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        m.x += ddx * push; m.z += ddz * push;
      }
      hit = true;
    }
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
