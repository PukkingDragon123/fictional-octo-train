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
/** round 24: when the last impact jolted the camera (the motion blur keeps those jolts from smearing the picture) */
let jolt = -1e9, joltLen = 0;
const jolted = (s: number) => { const now = performance.now(); if (now + s * 1000 > jolt + joltLen) { jolt = now; joltLen = Math.max(150, s * 1000); } };

/** camera trauma 0..1 (squared falloff in the camera) */
export function shake(trauma: number, seconds = 0.3) { if (trauma >= 0.15) jolted(seconds); G.camera?.shake?.(trauma * JUICE.shakeScale, seconds); }
/** zoom punch toward the action */
export function punch(amount = 0.04, seconds = 0.2) { if (Math.abs(amount) >= 0.02) jolted(seconds); G.camera?.punch?.(amount * JUICE.punchScale, seconds); }
/** directional camera kick */
export function kick(dx: number, dz: number, amount = 0.15) { jolted(0.2); G.camera?.kick?.(dx, dz, amount); }
/** freeze the simulation for a beat (impacts): 40-100 ms */
export function hitstop(ms = 60) { jolted(ms / 1000 + 0.1); stopUntil = Math.max(stopUntil, performance.now() + Math.min(ms, JUICE.hitstopMax * 1000)); }
/**
 * 0..1: an impact is jolting the camera right now (a hit's shake, zoom punch, kick or freeze). The motion blur
 * (src/gfx/motionFx.ts) keeps the camera's own jolt nearly sharp then: an impact reads as a snap, not a smear.
 */
export function impactK(): number {
  const now = performance.now();
  if (now < stopUntil) return 1;
  const u = (now - jolt) / Math.max(1, joltLen);
  return u < 0 ? 1 : u >= 1 ? 0 : 1 - u * u;
}
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
