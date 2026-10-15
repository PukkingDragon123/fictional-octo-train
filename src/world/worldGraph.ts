import { refreshUnpowered } from './power';
import { Zone } from './zone';
import { hash3, hashStr, beginGenUids, endGenUids, ZONE_UID_SPAN } from '../core/rng';

/**
 * The world graph: every zone (level) of the simulation, its size and the
 * generator that builds it from the session seed. Zones are generated lazily
 * the first time anyone enters them and are fully deterministic per seed, so
 * co-op clients rebuild identical geometry and only sync changes.
 */
export interface ZoneSpec {
  key: string;
  name: string;
  W: number; H: number;
  gen: (z: Zone, seed: number) => void;
  /** first-visit flavour text shown on the scanner */
  blurb?: string;
  depth?: number;          // how "deep" in the simulation (affects danger/collapse)
}

const SPECS = new Map<string, ZoneSpec>();
export function defZone(s: ZoneSpec) { SPECS.set(s.key, s); return s; }
export function zoneSpec(key: string) { return SPECS.get(key); }
export function allZoneSpecs() { return [...SPECS.values()]; }

const ZONE_INDEX: Record<string, number> = {
  lobby: 1, pools: 2, fields: 3, house: 4, suburbs: 5, school: 6, office: 7, stairwell: 8, mall: 9,
  market: 10, parking: 11, hospital: 12, tunnels: 13, lab: 14, server: 15, corrupt: 16, exit: 17,
  depot: 18, showroom: 19, homestead: 20, annex: 21, undercroft: 22,
};
function zoneIndex(key: string) { return ZONE_INDEX[key] ?? 100 + (hashStr(key) % 3800); }

/** post-generation hooks (run inside the generator's deterministic uid range; e.g. hopper placement, src/game/debt) */
const POST_GEN: ((z: Zone, seed: number) => void)[] = [];
export function onZoneGenerated(fn: (z: Zone, seed: number) => void) { if (!POST_GEN.includes(fn)) POST_GEN.push(fn); }

export function generateZone(key: string, worldSeed: number): Zone {
  const spec = SPECS.get(key);
  if (!spec) throw new Error('unknown zone ' + key);
  const seed = hash3(worldSeed, hashStr(key), 7);
  const z = new Zone(key, spec.W, spec.H, seed);
  // deterministic ids for everything the generator creates (stable per zone key)
  beginGenUids(zoneIndex(key) * ZONE_UID_SPAN);
  try {
    spec.gen(z, seed);
    for (const fn of POST_GEN) { try { fn(z, seed); } catch (e) { console.error('post-gen hook', key, e); } }
  } finally { endGenUids(); }
  refreshUnpowered(z);
  z.name = z.name || spec.name;
  if (spec.blurb && !z.meta.blurb) z.meta.blurb = spec.blurb;
  z.dirtyChunks.clear();
  z.lightDirtyTiles.length = 0;
  z.removedLights.length = 0;
  return z;
}
