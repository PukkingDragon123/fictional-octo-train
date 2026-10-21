// One place for game feel. Every system calls these instead of rolling its own
// shakes and freezes, so tuning is a one-line change here.
import { G } from '../game/G';

export const JUICE = {
  shakeScale: 1,
  hitstopMax: 0.12,
  punchScale: 1,
};

let stopUntil = 0;
let slowUntil = 0, slowScale = 1;

/** camera trauma 0..1 (squared falloff in the camera) */
export function shake(trauma: number, seconds = 0.3) { G.camera?.shake?.(trauma * JUICE.shakeScale, seconds); }
/** zoom punch toward the action */
export function punch(amount = 0.04, seconds = 0.2) { G.camera?.punch?.(amount * JUICE.punchScale, seconds); }
/** directional camera kick */
export function kick(dx: number, dz: number, amount = 0.15) { G.camera?.kick?.(dx, dz, amount); }
/** freeze the simulation for a beat (impacts): 40-100 ms */
export function hitstop(ms = 60) { stopUntil = Math.max(stopUntil, performance.now() + Math.min(ms, JUICE.hitstopMax * 1000)); }
/** slow motion for a moment (executions, near misses) */
export function slowmo(scale = 0.3, ms = 400) { slowUntil = performance.now() + ms; slowScale = scale; }
/** the factor the game loop applies to simulation dt */
export function timeScale(): number {
  const now = performance.now();
  if (now < stopUntil) return 0;
  if (now < slowUntil) return slowScale;
  return 1;
}
/** CSS pop on a DOM element (UI feedback) */
export function pop(el: HTMLElement | null | undefined, scale = 1.08, ms = 160) {
  if (!el) return;
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})`, offset: 0.4 }, { transform: 'scale(1)' }], { duration: ms, easing: 'cubic-bezier(.34,1.56,.64,1)' });
}
