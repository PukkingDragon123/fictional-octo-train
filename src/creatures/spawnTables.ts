// Where the new things live. Zone generators own their spawn tables; this
// only adds the monster pass's species to zones that do not already list them
// (a generator that names a species keeps its own weight), right after the
// zone is generated, identically on every peer.
import { bus } from '../core/events';
import type { Zone } from '../world/zone';

const ADD: Record<string, [string, number][]> = {
  lobby: [['stammer', 1], ['plenum', 1.2], ['gloam', 0.9], ['surveyor', 0.7], ['still_life', 0.6]],
  house: [['still_life', 3], ['gloam', 0.6], ['stammer', 0.4]],
  suburbs: [['still_life', 1.2], ['gloam', 1], ['stammer', 0.8], ['surveyor', 0.4]],
  school: [['plenum', 1.4], ['still_life', 0.8], ['stammer', 0.6]],
  office: [['plenum', 1.6], ['stammer', 1], ['still_life', 0.5], ['surveyor', 0.4]],
  hospital: [['plenum', 1.2], ['stammer', 1.2], ['still_life', 0.8], ['gloam', 0.6]],
  stairwell: [['stammer', 1.4], ['gloam', 1.2]],
  parking: [['gloam', 1.4], ['stammer', 1], ['surveyor', 0.6]],
  tunnels: [['surveyor', 1.6], ['gloam', 1.6], ['plenum', 0.6]],
  pools: [['surveyor', 0.8], ['stammer', 0.5]],
  fields: [['surveyor', 0.6], ['stammer', 0.4]],
  mall: [['plenum', 0.9], ['still_life', 0.6], ['gloam', 0.6]],
  market: [['plenum', 0.9], ['gloam', 0.6]],
  lab: [['surveyor', 1.4], ['plenum', 0.9], ['still_life', 0.5]],
  corrupt: [['stammer', 1.5], ['still_life', 1], ['gloam', 1], ['plenum', 0.8]],
  server: [['stammer', 0.6]],
};

bus.on('zoneGenerated', (z: Zone) => {
  const add = ADD[z.key];
  if (!add || !Array.isArray(z.spawnTable) || !z.spawnTable.length) return;
  for (const [k, w] of add) if (!z.spawnTable.some(([s]) => s === k)) z.spawnTable.push([k, w]);
});
