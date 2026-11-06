// A run under the Meridian file (src/game/meridian.ts) and its codex
// (src/game/codex.ts): the session calls startMetaRun() once the local
// survivor exists. Every session (new, loaded, co-op) files what it meets,
// listens for commendations, banks samples that reach the lab (the press, the
// way out: src/research/bank.ts) and runs the research tools' passives; a NEW
// run also counts toward the milestones and gets the starting kit: the
// milestones' allowance and the tools picked in the lab's requisition.
import type { Game } from './game';
import type { Player } from '../entities/player';
import { G } from './G';
import { bus } from '../core/events';
import { wireField, noteRunStart, noteRunEnd } from './meridian';
import { startingKit } from './codex';
import { wireAchievements, runStarted } from './achievements';
import { wireSampleBank, carriedSamples } from '../research/bank';
import { researchToolSystem } from '../research/tools';

export function startMetaRun(g: Game, p: Player, o: { fresh: boolean; give: (key: string) => void }) {
  wireField();
  wireSampleBank();
  // the file remembers the run before the commendations read it; samples on the body are lost
  let ended = false;
  const end = (cause: string) => { if (ended) return; ended = true; noteRunEnd(cause, carriedSamples(p).length); };
  bus.on('runReport', (r: any) => end(String(r?.cause?.who || r?.cause?.text || 'unknown')));
  bus.on('death', (pl: Player) => { if (pl === p) setTimeout(() => end('unknown'), 4000); });
  wireAchievements(() => G.local?.id);
  g.addSystem(researchToolSystem());
  if (!o.fresh) return;
  noteRunStart();
  for (const k of startingKit()) { try { o.give(k); } catch { /* unknown item */ } }
  runStarted();
}
