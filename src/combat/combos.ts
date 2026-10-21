// Combo bookkeeping: the rhythm of a light chain (each press judged against
// the moment the last blow landed), the barrage it opens into, and the
// ground chain on one target: shove it down -> stomp it -> slash = finisher.
import { G } from '../game/G';
import type { MoveKind } from './moves';

export type Timing = 'early' | 'good' | 'perfect' | 'late';

/** a press `dt` seconds after the previous blow landed, during a move that ends `left` seconds from now */
export function judge(sinceImpact: number, moveDur: number): Timing {
  if (sinceImpact < -0.04) return 'early';
  if (sinceImpact <= 0.1 + moveDur * 0.35) return 'perfect';
  if (sinceImpact <= moveDur + 0.45) return 'good';
  return 'late';
}

export class Combo {
  /** light strikes in rhythm */
  chain = 0;
  perfects = 0;
  /** early presses in a row (mashing): breaks the rhythm */
  rushed = 0;
  /** game time the last blow landed */
  impactT = -9;
  /** hits in a row on anything (for the counter) */
  hits = 0;
  hitT = -9;
  /** the ground chain on one creature: 1 knocked down by a shove/tackle, 2 stomped */
  ground: { id: string; step: number; t: number } | null = null;
  barrage: { until: number; jabs: number; queued: number } | null = null;
  /** a counter window after a perfect dodge or a perfect struggle */
  counter: { until: number; id?: string } | null = null;
  /** recent move log (tests, HUD) */
  log: { k: MoveKind | 'exec' | 'finisher' | 'barrage'; t: number; id?: string }[] = [];

  note(k: MoveKind | 'exec' | 'finisher' | 'barrage', id?: string) {
    this.log.push({ k, t: G.time, id });
    if (this.log.length > 24) this.log.shift();
  }

  /** a light press `since` seconds after the last blow landed: does the chain go on? */
  press(since: number, moveDur: number): Timing {
    const j = judge(since, moveDur);
    if (j === 'late') { this.chain = 0; this.perfects = 0; this.rushed = 0; }
    else if (j === 'early') { this.rushed++; if (this.rushed >= 3) { this.chain = 0; this.perfects = 0; } }
    else { this.rushed = 0; if (j === 'perfect') this.perfects++; }
    return j;
  }

  landed(n: number) {
    this.impactT = G.time;
    if (G.time - this.hitT > 2.2) this.hits = 0;
    this.hits += n; this.hitT = G.time;
  }

  /** the shove / tackle knocked this creature down (or it was already down) */
  grounded(id: string) { this.ground = { id, step: 1, t: G.time }; }
  /** a stomp landed on it */
  stomped(id: string) { if (this.ground && this.ground.id === id && G.time - this.ground.t < 3.5) { this.ground.step = 2; this.ground.t = G.time; } }
  /** would a slash on it now finish the chain */
  finisherReady(id: string) { return !!this.ground && this.ground.id === id && this.ground.step >= 2 && G.time - this.ground.t < 3.5; }
  reset() { this.chain = 0; this.perfects = 0; this.rushed = 0; this.barrage = null; }
}
