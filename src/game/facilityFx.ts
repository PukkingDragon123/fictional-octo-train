// THE FACILITY'S EFFECTS (round 26, part B): what the wing's rooms and their furniture (src/game/facility.ts
// roomBonuses / facilityBonuses) do to the unit in the runs. Each facility stat point turns into a multiplier on
// a stat the game already reads, through the lattice's trade stats (src/game/professions.ts profMul / profAdd, which
// is itself a talent source, so talentMul(body, 'fatigue') and the rest pick it up with no new code):
//   rest      tiredness builds slower (sleep recovers more per hour)     fatigue  -3% a point
//   health    wounds heal faster                                        heal     +3%
//   craft     the bench and building go faster                          craft -3%, build -2%
//   yield     planters and hydro racks give more                        yield    +4%
//   melee     the armoury's drill                                       melee    +2%
//   scan      the CRT bank: scanner range and finds in the codex        scan +3%, discover +3%
//   research  research points                                           rp       +2%
//   morale    stress and boredom build slower                           stress, boredom -2%
//   sanity    less panic                                                panic    -2%
//   storage   a little more carried                                     carry    +0.5 kg
//   income    the press credits a little more                           sell     +2%
// Every stat is capped, so a wing of nothing but bunks cannot zero the need to sleep.
//   facilityMul(stat) / facilityAdd(stat)    the multiplier (1) / the additive bonus (0)
import { bus } from '../core/events';
import './facilityStores';
import { facilityBonuses, type FacilityStat } from './facility';

/** per point: [facility stat, change, the cap (lowest or highest multiplier)] */
const MUL: Record<string, [FacilityStat, number, number][]> = {
  fatigue: [['rest', -0.03, 0.55]],
  heal: [['health', 0.03, 1.6]],
  craft: [['craft', -0.03, 0.55]],
  build: [['craft', -0.02, 0.6]],
  yield: [['yield', 0.04, 1.8]],
  melee: [['melee', 0.02, 1.4]],
  scan: [['scan', 0.03, 1.6]],
  discover: [['scan', 0.03, 1.6]],
  rp: [['research', 0.02, 1.5]],
  stress: [['morale', -0.02, 0.6]],
  boredom: [['morale', -0.02, 0.6]],
  panic: [['sanity', -0.02, 0.6]],
  sell: [['income', 0.02, 1.4]],
};
const ADD: Record<string, [FacilityStat, number, number]> = { carry: ['storage', 0.5, 10] };

let cache: Map<string, number> | null = null;
bus.on('facilityChanged', () => { cache = null; });
function all(): Map<string, number> {
  if (cache) return cache;
  const m = new Map<string, number>();
  let b: Partial<Record<FacilityStat, number>> = {};
  try { b = facilityBonuses(); } catch { /* storage blocked */ }
  for (const [stat, rows] of Object.entries(MUL)) {
    let k = 1;
    for (const [fs, per, cap] of rows) { const n = b[fs] ?? 0; if (!n) continue; k *= per < 0 ? Math.max(cap, 1 + per * n) : Math.min(cap, 1 + per * n); }
    if (k !== 1) m.set(stat, k);
  }
  for (const [stat, [fs, per, cap]] of Object.entries(ADD)) { const n = b[fs] ?? 0; if (n) m.set(stat, Math.min(cap, per * n)); }
  return (cache = m);
}
/** the wing's multiplier for a stat (1 when it does nothing for it) */
export const facilityMul = (s: string) => (s in ADD ? 1 : all().get(s) ?? 1);
/** the wing's bonus for an additive stat (carry) */
export const facilityAdd = (s: string) => (s in ADD ? all().get(s) ?? 0 : 0);
