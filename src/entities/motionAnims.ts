// Whole-body motion poses for the unit's physical movement (src/entities/motion.ts):
// the dodge roll (a real tumble over the shoulder, the body turning about its own
// hips), the trip-and-catch stumble, and getting up off your back after a
// knockdown (the face-down get-up is the animator's own 'get_up').
// Registered into the human animator's named-animation table, so
// Player.playAnim(name) plays them and co-op peers mirror them.
import type { Pose, JointName } from './humanRig';
import { registerPose } from './humanAnim';

type V = [number, number, number];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const S = (P: Pose, j: JointName, x: number, y = 0, z = 0) => { P[j] = [x, y, z]; };
const ALL: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
/** rest height of the hip joint above the soles (body space, the default rig) */
const H0 = 0.93;

type Key = [number, Partial<Record<JointName, V>> & { rootY?: number; rootZ?: number; rootX?: number; bodyPitch?: number; bodyY?: number; bodyRoll?: number }];
/** eased keyframes (every channel present in either neighbour; missing = 0) */
function keys(K: Key[], u: number, P: Pose) {
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const [u0, A] = K[i], [u1, B] = K[i + 1];
  const f = ease((u - u0) / Math.max(1e-4, u1 - u0));
  const ks = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of ks) {
    const a = (A as any)[k], b = (B as any)[k];
    if (typeof a === 'number' || typeof b === 'number') (P as any)[k] = lerp(a ?? 0, b ?? 0, f);
    else { const x = (a ?? [0, 0, 0]) as V, y = (b ?? [0, 0, 0]) as V; S(P, k as JointName, lerp(x[0], y[0], f), lerp(x[1], y[1], f), lerp(x[2], y[2], f)); }
  }
}

// ------------------------------------------------------------------ dodge roll: duck, tuck, over the shoulder, up
// The body pitches a full turn about the hips (bodyPitch pivots at the soles, so the
// hips are counter-placed in body space to stay on a smooth low arc in the world).
registerPose('mo_roll', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  // the turn: none while ducking in, the whole tumble, standing again
  const a = clamp((u - 0.1) / 0.68, 0, 1);
  const th = Math.PI * 2 * (a < 0.5 ? 2 * a * a : 1 - 2 * (1 - a) * (1 - a));
  // how tightly balled up, and where the hips are in the world (height over the floor)
  const tuck = u < 0.12 ? ease(u / 0.12) * 0.6 : u < 0.22 ? lerp(0.6, 1, ease((u - 0.12) / 0.1)) : u < 0.7 ? 1 : u < 0.86 ? lerp(1, 0.6, ease((u - 0.7) / 0.16)) : lerp(0.6, 0, ease((u - 0.86) / 0.14));
  const hy = u < 0.1 ? lerp(H0, 0.68, ease(u / 0.1)) : u < 0.8 ? 0.42 + 0.26 * Math.cos(th / 2) ** 2 : lerp(0.68, H0, ease((u - 0.8) / 0.2));
  P.bodyPitch = th;
  P.rootY = hy * Math.cos(th) - H0;
  P.rootZ = -hy * Math.sin(th);
  // balled: knees to the chest, chin down, arms wrapped round the shins; one shoulder leads
  S(P, 'thighL', -2.05 * tuck, 0, 0.12 * tuck); S(P, 'thighR', -1.9 * tuck, 0, -0.1 * tuck);
  S(P, 'shinL', 2.3 * tuck); S(P, 'shinR', 2.15 * tuck);
  S(P, 'footL', 0.35 * tuck); S(P, 'footR', 0.3 * tuck);
  S(P, 'spine', 0.55 * tuck, 0, -0.12 * tuck); S(P, 'chest', 0.35 * tuck, 0.1 * tuck, 0);
  S(P, 'neck', 0.3 * tuck); S(P, 'head', 0.55 * tuck, 0.15 * tuck, 0);
  const reach = u < 0.2 ? ease(u / 0.2) : 1 - ease((u - 0.2) / 0.25);   // the hands go to the floor first
  S(P, 'uarmL', -1.1 * tuck - 0.6 * reach, 0, 0.3 * tuck); S(P, 'farmL', -1.5 * tuck + 0.9 * reach);
  S(P, 'uarmR', -1.0 * tuck - 0.7 * reach, 0, -0.45 * tuck); S(P, 'farmR', -1.4 * tuck + 0.9 * reach);
  S(P, 'handL', 0.4 * tuck); S(P, 'handR', 0.4 * tuck);
  P.bodyRoll = Math.sin(th) * 0.18 * tuck;   // over the right shoulder, not the neck
  P.gripL = 0.8; P.gripR = 0.8;
  P.blink = tuck > 0.8 && Math.sin(time * 3) > -0.5 ? 1 : 0;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.66 });

// ------------------------------------------------------------------ stumble: a foot catches, two lurching catch-steps, arms flung out
registerPose('mo_stumble', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  keys([
    [0, { bodyPitch: 0.05, spine: [0.1, 0, 0] }],
    [0.16, { bodyPitch: 0.38, rootY: -0.12, spine: [0.32, 0, 0.05], chest: [0.12, 0.1, 0], head: [-0.35, 0, 0],
      thighR: [-1.25, 0, -0.06], shinR: [0.35, 0, 0], footR: [0.3, 0, 0], thighL: [0.55, 0, 0.08], shinL: [0.95, 0, 0], footL: [0.4, 0, 0],
      uarmL: [-1.7, 0, 0.55], farmL: [-0.35, 0, 0], uarmR: [-1.45, 0, -0.75], farmR: [-0.3, 0, 0], handL: [-0.5, 0, 0], handR: [-0.5, 0, 0] }],
    [0.42, { bodyPitch: 0.26, rootY: -0.16, spine: [0.38, 0, -0.08], chest: [0.1, -0.15, 0], head: [-0.25, 0, 0.05],
      thighL: [-1.1, 0, 0.08], shinL: [0.45, 0, 0], footL: [0.25, 0, 0], thighR: [0.45, 0, -0.06], shinR: [0.9, 0, 0], footR: [0.35, 0, 0],
      uarmL: [-0.6, 0, 0.9], farmL: [-0.5, 0, 0], uarmR: [-2.1, 0, -0.4], farmR: [-0.4, 0, 0] }],
    [0.68, { bodyPitch: 0.1, rootY: -0.1, spine: [0.42, 0, 0], head: [0.1, 0, 0],
      thighL: [-0.45, 0, 0.08], shinL: [0.6, 0, 0], thighR: [-0.2, 0, -0.06], shinR: [0.5, 0, 0],
      uarmL: [-0.5, 0, 0.35], farmL: [-0.6, 0, 0], uarmR: [-0.6, 0, -0.35], farmR: [-0.6, 0, 0] }],
    [1, { }],
  ], u, P);
  P.gripL = 0.4; P.gripR = 0.4;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.75 });

// ------------------------------------------------------------------ up off the back: crunch, sit, roll onto a knee, stand
// Starts lying face up with the hips at the root and the head behind (-z), feet ahead (+z).
registerPose('mo_getup_back', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  keys([
    [0, { bodyPitch: -1.42, bodyY: 0.13, rootY: -0.84, head: [0.25, 0, 0], uarmL: [0.2, 0, 0.35], uarmR: [0.2, 0, -0.35], farmL: [-0.3, 0, 0], farmR: [-0.3, 0, 0], footL: [0.3, 0, 0], footR: [0.3, 0, 0] }],
    [0.22, { bodyPitch: -0.75, bodyY: 0.07, rootY: -0.84, spine: [0.35, 0, 0], head: [0.45, 0, 0],
      thighL: [-0.9, 0, 0.12], shinL: [1.5, 0, 0], thighR: [-0.5, 0, -0.1], shinR: [0.9, 0, 0],
      uarmL: [0.75, 0, 0.3], farmL: [-0.2, 0, 0], handL: [-1.1, 0, 0], uarmR: [0.75, 0, -0.3], farmR: [-0.2, 0, 0], handR: [-1.1, 0, 0] }],
    [0.44, { bodyPitch: -0.05, bodyY: 0, rootY: -0.8, spine: [0.45, 0, 0], chest: [0.1, 0, 0], head: [0.2, 0, 0],
      thighL: [-1.45, 0, 0.12], shinL: [2.2, 0, 0], footL: [-0.4, 0, 0], thighR: [-1.2, 0, -0.25], shinR: [1.3, 0, 0],
      uarmL: [0.35, 0, 0.35], farmL: [-0.1, 0, 0], handL: [-1.2, 0, 0], uarmR: [-0.6, 0, -0.2], farmR: [-0.6, 0, 0] }],
    [0.7, { rootY: -0.42, spine: [0.38, 0, 0], head: [0.1, 0, 0],
      thighL: [-1.4, 0, 0.05], shinL: [1.5, 0, 0], footL: [-0.1, 0, 0], thighR: [0.15, 0, -0.05], shinR: [1.65, 0, 0], footR: [0.7, 0, 0],
      uarmL: [-0.75, 0, 0.1], farmL: [-0.45, 0, 0], uarmR: [-0.45, 0, -0.1], farmR: [-0.3, 0, 0] }],
    [1, { }],
  ], u, P);
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 1.6 });
