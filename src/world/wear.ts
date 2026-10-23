// Shared rules for the horror wear the chunk mesher scatters (src/world/chunkMesher.ts) so other
// systems agree on where it is: the wet map makes the damp floor patches shine (src/gfx/wetmap.ts).
import type { Zone } from './zone';

/** well-mixed integer hash (Math.imul throughout: no precision loss on big products) */
export function mix3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 0..1 per tile and key */
export const wearRand = (x: number, y: number, k: number) => (mix3(x, y, 300 + k) % 10000) / 10000;

/** zones where water gets in everywhere (more stains, mould, damp floors) */
export const DAMP_GRADES = new Set(['lobby', 'pool', 'tunnels', 'house', 'parking', 'hospital', 'stairwell', 'school']);
/** zones with fires, machines and fuel (soot, scorch) */
export const SOOTY_GRADES = new Set(['tunnels', 'parking', 'lab', 'server', 'corrupt', 'stairwell']);

/** is there a damp patch on this floor tile (indoors only) */
export function floorDamp(zone: Zone, x: number, y: number): boolean {
  if (zone.isOutdoor(x, y)) return false;
  return wearRand(x, y, 3) < (DAMP_GRADES.has(zone.env.grade) ? 0.045 : 0.018);
}
