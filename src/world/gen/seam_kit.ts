// The Seam (object 'seam_door', src/content/furniture/zp_processing.ts): where
// a mounted Seam's face is, the soot and dust it leaves on the wall and floor,
// and putting one on a wall of the Lobby spawn room (the debtor falls out of
// it). Used by src/world/gen/lobby.ts, z_reality.ts and src/game/seam.ts.
import type { Zone, TileObject } from '../zone';
import type { ZoneBuilder } from './builder';

/** a wall-mounted object's face: centre on the wall plane and outward normal (rot 0 faces +z) */
export function seamFace(x: number, y: number, rot: number): { x: number; z: number; nx: number; nz: number } {
  const r = ((rot % 4) + 4) % 4;
  const nx = r === 1 ? -1 : r === 3 ? 1 : 0, nz = r === 0 ? 1 : r === 2 ? -1 : 0;
  return { x: x + 0.5 - nx * 0.44, z: y + 0.5 - nz * 0.44, nx, nz };
}
export const seamFaceOf = (o: TileObject) => seamFace(o.x, o.y, o.rot);

/** soot on the wall around the Seam, a fan of black dust on the floor in front of it */
export function seamDecals(z: Zone, x: number, y: number, rot: number) {
  const f = seamFace(x, y, rot);
  const rotW = Math.atan2(f.nz, f.nx);
  z.decals.push({ x: f.x + f.nx * 0.004, z: f.z + f.nz * 0.004, y: 1.4, w: 2.5, d: 3.05, rot: rotW, tex: 'zp_seam_halo', vert: 1 });
  // floor: the dust lies in a fan, thickest at the foot of the wall
  const fx = f.x + f.nx * 0.55, fz = f.z + f.nz * 0.55;
  z.decals.push({ x: fx, z: fz, w: 1.8, d: 1.0, rot: Math.atan2(f.nx, -f.nz), tex: 'zp_seam_dust' });
  z.decals.push({ x: fx + f.nx * 0.2, z: fz + f.nz * 0.2, w: 1.6, d: 1.4, rot: 0.4, tex: 'decal_stain_dark', tint: 0x060606, alpha: 0.55 });
}

/**
 * Put the Seam on a wall of the Lobby's waking room (zone.meta.spawn): the
 * north wall if it has a free stretch, else any wall of that room, else the
 * nearest wall to the spawn. Records z.meta.seam = [x, y, rot].
 */
export function placeSeam(z: Zone, b: ZoneBuilder) {
  const sp = z.meta.spawn as [number, number] | undefined;
  if (!sp) return null;
  const [sx, sy] = sp;
  const wake = z.rooms.find((r) => r.type === 'wake' && sx >= r.x0 && sx <= r.x1 && sy >= r.y0 && sy <= r.y1);
  const cands: { x: number; y: number; rot: 0 | 1 | 2 | 3; score: number }[] = [];
  const walled = (x: number, y: number, rot: number) => {
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)]) return false;
    // the wall behind: north edge (rot 0), east (1: west edge of x+1), south (2: north edge of y+1), west (3)
    if (rot === 0) return !!z.wallN[z.idx(x, y)] && !z.edges.has(z.idx(x, y) * 2);
    if (rot === 2) return z.inb(x, y + 1) && !!z.wallN[z.idx(x, y + 1)] && !z.edges.has(z.idx(x, y + 1) * 2);
    if (rot === 1) return z.inb(x + 1, y) && !!z.wallW[z.idx(x + 1, y)] && !z.edges.has(z.idx(x + 1, y) * 2 + 1);
    return !!z.wallW[z.idx(x, y)] && !z.edges.has(z.idx(x, y) * 2 + 1);
  };
  const x0 = wake ? wake.x0 : sx - 6, x1 = wake ? wake.x1 : sx + 6, y0 = wake ? wake.y0 : sy - 6, y1 = wake ? wake.y1 : sy + 6;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const rot of [0, 1, 2, 3] as const) {
    if (!walled(x, y, rot)) continue;
    // nothing else hung there, and the floor in front is clear for the landing
    if (z.objectsAt(x, y).some((o) => o.rot === rot || !Zone_ceiling(o.key))) continue;
    const fx = x - (rot === 1 ? 1 : rot === 3 ? -1 : 0), fy = y + (rot === 0 ? 1 : rot === 2 ? -1 : 0);
    const front = z.inb(fx, fy) && !!z.floor[z.idx(fx, fy)];
    const d = Math.hypot(x - sx, y - sy);
    // north and west walls face the default camera; south and east ones are cut away around the player
    cands.push({ x, y, rot, score: d + (rot === 0 ? 0 : rot === 3 ? 0.8 : 6) + (front ? 0 : 5) + (Math.abs(x - sx) === 0 ? 0.6 : 0) });
  }
  cands.sort((a, c) => a.score - c.score);
  const c = cands[0];
  if (!c) return null;
  // the Lobby's Seam is shut: a dead scar (the intro wakes it locally for a minute)
  const o = b.obj('seam_door', c.x, c.y, c.rot, { sealed: true });
  if (!o) return null;
  seamDecals(z, c.x, c.y, c.rot);
  z.meta.seam = [c.x, c.y, c.rot];
  // the connectivity pass must never knock out the wall it hangs on
  ((z.meta.sealed ||= []) as { x0: number; y0: number; x1: number; y1: number }[]).push({ x0: c.x, y0: c.y, x1: c.x, y1: c.y });
  return o;
}
/** ceiling fixtures (lights) share a tile with anything */
function Zone_ceiling(key: string) { return key === 'light_fluoro' || key === 'light_bulb'; }
