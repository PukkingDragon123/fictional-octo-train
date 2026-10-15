// Shared helpers for the film-mood zones (depot, showroom, homestead, annex,
// undercroft) and the wrong-room library: items laid on surfaces, tether
// ropes laid as decals, the Remittance Hopper placement, periodic hashing
// for endless (looping) layouts and seamless loop seams.
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Rng, hash3 } from '../../core/rng';
import { objDef } from '../objects';
import { createItem } from '../../items/factory';
import { dropItem } from '../../items/worldItems';
import { hasItemDef } from '../../items/item';
import { Ctx, Rot, decal, isOpen } from './mall_kit';

export * from './mall_kit';

/** deterministic hash in [0,1) */
export const hh = (x: number, y: number, s = 0) => hash3(x | 0, y | 0, s | 0) / 4294967296;

/** an item resting at world position (wx, wz) at height h (table tops, plates, beds) */
export function itemAtW(z: Zone, rng: Rng, key: string, wx: number, wz: number, h: number, data?: Record<string, any>) {
  if (!hasItemDef(key)) return null;
  const it = createItem(key, rng);
  if (data) it.data = { ...(it.data || {}), ...data };
  dropItem(z, it, wx, wz, h, 0.04);
  return it;
}

/** world-space centre of an object's footprint */
export function objCentre(o: TileObject): [number, number] {
  const d = objDef(o.key);
  const w = d?.w ?? 1, dd = d?.d ?? 1;
  const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  return [o.x + rw / 2, o.y + rd / 2];
}

/** rotate a local (x, z) offset of an object by its rot (0 = front +z) into world space */
export function rotLocal(rot: number, lx: number, lz: number): [number, number] {
  switch (rot & 3) {
    case 1: return [-lz, lx];
    case 2: return [-lx, -lz];
    case 3: return [lz, -lx];
    default: return [lx, lz];
  }
}

/**
 * A rope (tether line) laid on the floor along a polyline of world points,
 * as 1 m decal segments. Ropes run where the expedition ran them: into the dark.
 */
export function ropeLine(z: Zone, pts: [number, number][], tex = 'zw_rope', sag = 0.12) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const wob = Math.sin((x0 + y0 + k) * 1.7) * sag;
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      decal(z, tex, x0 + (x1 - x0) * t + nx * wob, y0 + (y1 - y0) * t + ny * wob, len / n + 0.06, 0.12, Math.atan2(y1 - y0, x1 - x0), undefined, 1);
    }
  }
}

/**
 * Place the Remittance Hopper (the debt contract's deposit object) by hand at
 * a good spot near a zone's entry. The 3x3 area is cleared of loose props
 * first. If the hopper object is not registered yet the site is remembered in
 * z.meta.hopperSites so the debt contract's post-generation hook can use it.
 */
export function hopperAt(c: Ctx, x: number, y: number, rot: Rot = 0) {
  const { z, b } = c;
  (z.meta.hopperSites ||= []).push([x, y, rot]);
  const d = objDef('hopper');
  if (!d) return null;
  const w = d.w ?? 1, dd = d.d ?? 1;
  const rw = rot % 2 === 0 ? w : dd, rd = rot % 2 === 0 ? dd : w;
  for (const o of [...z.objects.values()]) {
    const od = objDef(o.key);
    if (!od || od.onWall || od.ceiling) continue;
    if (o.x >= x - 1 && o.x <= x + rw && o.y >= y - 1 && o.y <= y + rd) z.removeObject(o);
  }
  b.flag(x - 1, y - 1, x + rw, y + rd, TF.NOSPAWN);
  return b.obj('hopper', x, y, rot, {});
}

/** is every tile of a rect open floor (no furniture standing on it)? */
export function rectOpen(z: Zone, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (!isOpen(z, x, y)) return false;
  return true;
}

/**
 * Seamless east-west loop seams: every walkable tile on column `xw` jumps by
 * +d, every walkable tile on column `xe` jumps by -d. The two landing columns
 * (xw + d, xe - d) must not be seams themselves.
 */
export function loopSeamsX(b: ZoneBuilder, xw: number, xe: number, d: number, y0: number, y1: number, id = 'loop') {
  const z = b.z;
  const walk = (x: number, y: number) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0 && z.solid[z.idx(x, y)] !== 1 && z.solid[z.idx(x, y)] !== 3;
  for (let y = y0; y <= y1; y++) {
    if (walk(xw, y) && walk(xw + d, y)) b.portal({ id: `${id}_w${y}`, x: xw, y, kind: 'loop', to: z.key, tx: xw + d, ty: y, loopDx: d, loopDy: 0, hidden: true });
    if (walk(xe, y) && walk(xe - d, y)) b.portal({ id: `${id}_e${y}`, x: xe, y, kind: 'loop', to: z.key, tx: xe - d, ty: y, loopDx: -d, loopDy: 0, hidden: true });
  }
}
/** same for north-south seams */
export function loopSeamsY(b: ZoneBuilder, yn: number, ys: number, d: number, x0: number, x1: number, id = 'loopy') {
  const z = b.z;
  const walk = (x: number, y: number) => z.inb(x, y) && z.floor[z.idx(x, y)] !== 0 && z.solid[z.idx(x, y)] !== 1 && z.solid[z.idx(x, y)] !== 3;
  for (let x = x0; x <= x1; x++) {
    if (walk(x, yn) && walk(x, yn + d)) b.portal({ id: `${id}_n${x}`, x, y: yn, kind: 'loop', to: z.key, tx: x, ty: yn + d, loopDx: 0, loopDy: d, hidden: true });
    if (walk(x, ys) && walk(x, ys - d)) b.portal({ id: `${id}_s${x}`, x, y: ys, kind: 'loop', to: z.key, tx: x, ty: ys - d, loopDx: 0, loopDy: -d, hidden: true });
  }
}

/** hanging light + ceiling lamp object helper: an object-less light at a tile centre */
export function lamp(b: ZoneBuilder, x: number, y: number, kind: 'fluoro' | 'bulb' | 'sodium' | 'emergency' | 'lamp' | 'screen', circuit: number, o: Record<string, any> = {}) {
  return b.light(x + 0.5, y + 0.5, kind, { circuit, ...o });
}
