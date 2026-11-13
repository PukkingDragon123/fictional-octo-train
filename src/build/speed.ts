// BUILD / CRAFT SPEED: one multiplier hook for everything that makes or puts up
// things. Construction (nailing, welding, upgrading pieces) and crafting
// (recipes, the craft queue) divide their time by these numbers, so 1.25 means
// a quarter faster.
//
//   import { addSpeedMod } from '../build/speed';
//   addSpeedMod('talent:handy', (p, kind) => kind === 'build' ? 1.25 : 1);
//   removeSpeedMod('talent:handy');
//
//   buildSpeed(p)  every 'build' modifier multiplied (clamped 0.25 .. 4)
//   craftSpeed(p)  every 'craft' modifier multiplied (clamped 0.25 .. 4)
//   gatherSpeed(p) every 'gather' modifier multiplied (salvage nodes, src/build/gather.ts)
//
// Modifiers are plain functions read every time an action starts, so a talent,
// a trait, a chip or a moodle can come and go without telling anyone.
import type { Player } from '../entities/player';
import { G } from '../game/G';

export type SpeedKind = 'build' | 'craft' | 'gather';
export type SpeedMod = (p: Player, kind: SpeedKind) => number;

const MODS = new Map<string, SpeedMod>();

/** register (or replace) a named speed modifier */
export function addSpeedMod(id: string, fn: SpeedMod) { MODS.set(id, fn); }
export function removeSpeedMod(id: string) { MODS.delete(id); }

function mul(p: Player, kind: SpeedKind): number {
  let m = 1;
  for (const [id, f] of MODS) {
    try { const v = f(p, kind); if (Number.isFinite(v) && v > 0) m *= v; } catch (e) { console.warn('speed mod', id, e); }
  }
  return Math.max(0.25, Math.min(4, m));
}
/** how fast this unit puts pieces up (1 = normal) */
export const buildSpeed = (p: Player) => mul(p, 'build');
/** how fast this unit crafts (1 = normal) */
export const craftSpeed = (p: Player) => mul(p, 'craft');
/** how fast this unit strips, pries and salvages gathering nodes (1 = normal; src/build/gather.ts) */
export const gatherSpeed = (p: Player) => mul(p, 'gather');

// the built-in ones: carpentry / mechanics are already in the actions; a lit
// camp (a claim with a workbench and light) is a little quicker to work in
addSpeedMod('camp:lit', (p, kind) => kind === 'gather' ? 1 : (G as unknown as { build?: { campBonus?: (p: Player, k: 'build' | 'craft') => number } })?.build?.campBonus?.(p, kind) ?? 1);
