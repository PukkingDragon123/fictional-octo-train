import { Zone } from './zone';
import { hash3, hashStr } from '../core/rng';

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

export function generateZone(key: string, worldSeed: number): Zone {
  const spec = SPECS.get(key);
  if (!spec) throw new Error('unknown zone ' + key);
  const seed = hash3(worldSeed, hashStr(key), 7);
  const z = new Zone(key, spec.W, spec.H, seed);
  spec.gen(z, seed);
  z.name = z.name || spec.name;
  z.dirtyChunks.clear();
  z.lightDirtyTiles.length = 0;
  z.removedLights.length = 0;
  return z;
}
