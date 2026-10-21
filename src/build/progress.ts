// Milestone counters for build / farm / cook / butchery quests, kept as mission
// flags ("bld#weld#3") so they replicate, save with the world, and quest checks
// can read them from the MissionSystem they are handed.
import { G } from '../game/G';

const CAP = 40;
const PFX = 'bld#';

export function countIn(m: any, key: string): number {
  const f: Set<string> | undefined = m?.flags;
  if (!f) return 0;
  const p = PFX + key + '#';
  let n = 0;
  for (const k of f) if (k.startsWith(p)) n++;
  return n;
}
export function count(key: string): number { return countIn(G.missions, key); }

/** +1 on a milestone counter */
export function bump(key: string, by = 1) {
  const m = G.missions; if (!m?.set) return;
  let n = count(key);
  for (let i = 0; i < by && n < CAP; i++) m.set(PFX + key + '#' + (++n));
}
/** a one-off milestone flag */
export function mark(key: string) { G.missions?.set?.(PFX + key); }
export function marked(m: any, key: string): boolean { return !!m?.flags?.has(PFX + key); }
