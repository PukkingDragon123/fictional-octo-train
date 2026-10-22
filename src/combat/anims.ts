// Combat body animation: charged wind-ups, heavy releases, jabs, lunges,
// stomps, ground slashes, dodges, tackles, struggling against a grip, being
// pinned, and the execution moves. Registered into the human animator's
// named-animation table (src/entities/humanAnim.ts registerPose), so
// Player.playAnim(name) and peers' mirrored actionAnim both play them.
import type { Pose, JointName } from '../entities/humanRig';
import type { AnimInput } from '../entities/humanAnim';
import { registerPose } from '../entities/humanAnim';

type V = [number, number, number];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const S = (P: Pose, j: JointName, x: number, y = 0, z = 0) => { P[j] = [x, y, z]; };

const UPPER: JointName[] = ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const LEGS: JointName[] = ['hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const ALL: JointName[] = [...UPPER, ...LEGS];

type KF = [number, Partial<Record<JointName, V>> & { rootY?: number; rootZ?: number; bodyPitch?: number; bodyY?: number; bodyRoll?: number }];
/** Catmull-Rom through four keys: motion flows through a key instead of stopping on it (arcs, follow-through) */
const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
};
/**
 * keyframe track. Segments flow through their keys on a spline (eased into
 * the first key and out of the last); `sharp` marks the strike: it
 * accelerates hard into its end key (an ease-in snap) for the impact.
 */
function track(K: KF[], u: number, P: Pose, sharp = -1) {
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const [u0, A] = K[i], [u1, B] = K[i + 1];
  const Z = K[Math.max(0, i - 1)][1], W = K[Math.min(K.length - 1, i + 2)][1];
  const f0 = clamp((u - u0) / Math.max(1e-4, u1 - u0), 0, 1);
  const edge = i === 0 || i === K.length - 2;
  const f = i === sharp ? f0 * f0 * f0 : edge ? ease(f0) : f0;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  const val = (o: any, k: string, j: number, d: number) => { const v = o[k]; return v === undefined ? d : typeof v === 'number' ? v : v[j]; };
  for (const k of keys) {
    const a = (A as any)[k], b = (B as any)[k];
    const num = typeof a === 'number' || typeof b === 'number';
    const one = (j: number) => {
      const pa = val(A, k, j, 0), pb = val(B, k, j, 0);
      if (i === sharp) return lerp(pa, pb, f);
      return cr(val(Z, k, j, pa), pa, pb, val(W, k, j, pb), f);
    };
    if (num) (P as any)[k] = one(0);
    else S(P, k as JointName, one(0), one(1), one(2));
  }
}
/** weight shift: the hips turn under the chest over planted feet, the pelvis slides toward the lead foot */
function hipTwist(P: Pose, k = 0.4) {
  const cy = P.chest?.[1] ?? 0, sy = P.spine?.[1] ?? 0;
  const tw = (cy + sy) * k;
  const h = P.hips ?? [0, 0, 0];
  P.hips = [h[0], h[1] + tw, h[2] - tw * 0.12];
  if (P.chest) P.chest = [P.chest[0], P.chest[1] - tw * 0.6, P.chest[2]];
  if (P.spine) P.spine = [P.spine[0], P.spine[1] - tw * 0.4, P.spine[2]];
  P.rootX = (P.rootX ?? 0) - tw * 0.05;
}

/** which way the weapon class swings: thrust (fists, blades, spears) or chop (everything with weight) */
function style(inp: AnimInput): 'fist' | 'thrust' | 'chop' | 'chop2' {
  const w = inp.weapon || 'unarmed';
  if (w === 'unarmed') return 'fist';
  if (w === 'blade' || w === 'spear') return 'thrust';
  if (inp.twoHanded || w === 'axe') return 'chop2';
  return 'chop';
}
const braced = (P: Pose, k = 1) => { S(P, 'thighL', -0.32 * k, 0, 0.12 * k); S(P, 'shinL', 0.36 * k); S(P, 'thighR', 0.22 * k, 0, -0.1 * k); S(P, 'shinR', 0.3 * k); S(P, 'footR', -0.2 * k, -0.3 * k); P.rootY = -0.07 * k; };

// ------------------------------------------------------------------ charge: a held wind-up that trembles when full
registerPose('cb_charge', (t, dur, inp, time) => {
  const P: Pose = {};
  const k = ease(dur > 0 ? t / dur : 1), full = t >= dur ? 1 : 0;
  const tr = full * (Math.sin(time * 41) * 0.035 + Math.sin(time * 27 + 1) * 0.025) + k * Math.sin(time * 13) * 0.012;
  const st = style(inp);
  if (st === 'fist') {
    S(P, 'uarmR', lerp(-0.6, -0.35, k) + tr, lerp(0.15, 0.6, k), lerp(-0.3, -0.5, k)); S(P, 'farmR', lerp(-2.1, -2.3, k)); S(P, 'handR', 0.2);
    S(P, 'uarmL', -0.95, -0.3, 0.3); S(P, 'farmL', -1.9); S(P, 'handL', 0.2, 0, 0.2);
    S(P, 'chest', 0.08, lerp(-0.25, -0.75, k) + tr, 0); S(P, 'spine', 0.1, lerp(0, -0.25, k), 0); S(P, 'head', 0.1, lerp(0.2, 0.7, k), 0);
  } else if (st === 'thrust') {
    S(P, 'uarmR', lerp(-0.7, -0.3, k) + tr, lerp(0.1, 0.55, k), lerp(-0.25, -0.65, k)); S(P, 'farmR', lerp(-1.2, -2.0, k)); S(P, 'handR', lerp(0.9, 1.4, k));
    S(P, 'uarmL', lerp(-0.9, -1.25, k), -0.3, 0.35); S(P, 'farmL', lerp(-1.5, -0.6, k)); S(P, 'handL', 0, 0, 0.3);
    S(P, 'chest', 0.06, lerp(-0.2, -0.8, k) + tr, 0); S(P, 'spine', 0.08 + k * 0.08, lerp(0, -0.3, k), 0); S(P, 'head', 0.06, lerp(0.15, 0.75, k), 0);
  } else {
    // over the shoulder and back, the spine arching; two hands for the big ones
    const two = st === 'chop2';
    S(P, 'uarmR', lerp(-1.1, -2.85, k) + tr, lerp(0.3, 0.2, k), lerp(-0.7, -0.35, k)); S(P, 'farmR', lerp(-1.7, -1.55, k)); S(P, 'handR', lerp(-0.6, -0.9, k));
    if (two) { S(P, 'uarmL', lerp(-1.05, -2.6, k) + tr, -0.55, 0.35); S(P, 'farmL', lerp(-1.5, -1.4, k)); S(P, 'handL', -0.7); }
    else { S(P, 'uarmL', lerp(-0.7, -1.1, k), -0.2, 0.4); S(P, 'farmL', -1.3); }
    S(P, 'chest', lerp(0.04, -0.25, k), lerp(-0.3, -0.55, k) + tr, 0); S(P, 'spine', lerp(0.1, -0.18, k), lerp(0, -0.2, k), 0); S(P, 'head', lerp(0.05, -0.05, k), lerp(0.28, 0.5, k), 0);
  }
  braced(P, 0.7 + k * 0.6);
  P.rootY = (P.rootY ?? 0) - k * 0.05;
  P.gripR = 1; P.gripL = st === 'chop2' || st === 'fist' ? 1 : 0.6;
  return { pose: P, mask: ALL };
}, { aim: true, dur: 1 });

// ------------------------------------------------------------------ heavy release
const HEAVY: Record<string, KF[]> = {
  fist: [
    [0, { uarmR: [-0.35, 0.6, -0.5], farmR: [-2.3, 0, 0], chest: [0.08, -0.75, 0], spine: [0.1, -0.25, 0], uarmL: [-0.95, -0.3, 0.3], farmL: [-1.9, 0, 0], rootY: -0.1, rootZ: 0 }],
    [0.4, { uarmR: [-1.62, 0.05, -0.05], farmR: [-0.05, 0, 0], chest: [0.12, 0.75, 0], spine: [0.22, 0.3, 0], uarmL: [-0.4, 0, 0.5], farmL: [-1.9, 0, 0], rootY: -0.16, rootZ: 0.12 }],
    [0.62, { uarmR: [-1.58, 0.05, -0.05], farmR: [-0.08, 0, 0], chest: [0.12, 0.7, 0], spine: [0.22, 0.3, 0], uarmL: [-0.45, 0, 0.5], farmL: [-1.9, 0, 0], rootY: -0.15, rootZ: 0.12 }],
    [1, { uarmR: [-0.7, 0.2, -0.3], farmR: [-2.0, 0, 0], chest: [0.08, -0.2, 0], spine: [0.1, 0, 0], uarmL: [-0.9, -0.3, 0.3], farmL: [-1.9, 0, 0], rootY: -0.05, rootZ: 0 }],
  ],
  thrust: [
    [0, { uarmR: [-0.3, 0.55, -0.65], farmR: [-2.0, 0, 0], handR: [1.4, 0, 0], chest: [0.06, -0.8, 0], spine: [0.16, -0.3, 0], uarmL: [-1.25, -0.3, 0.35], farmL: [-0.6, 0, 0], rootY: -0.1 }],
    [0.4, { uarmR: [-1.6, 0.1, -0.1], farmR: [-0.02, 0, 0], handR: [1.25, 0, 0], chest: [0.15, 0.55, 0], spine: [0.3, 0.25, 0], uarmL: [-0.5, 0, 0.6], farmL: [-1.2, 0, 0], rootY: -0.2, rootZ: 0.16 }],
    [0.65, { uarmR: [-1.55, 0.1, -0.1], farmR: [-0.05, 0, 0], handR: [1.2, 0, 0], chest: [0.15, 0.5, 0], spine: [0.3, 0.25, 0], uarmL: [-0.5, 0, 0.6], farmL: [-1.2, 0, 0], rootY: -0.19, rootZ: 0.15 }],
    [1, { uarmR: [-0.75, 0.1, -0.25], farmR: [-1.2, 0, 0], handR: [0.9, 0, 0], chest: [0.06, -0.2, 0], spine: [0.1, 0, 0], uarmL: [-0.9, -0.2, 0.35], farmL: [-1.5, 0, 0], rootY: -0.05 }],
  ],
  chop: [
    [0, { uarmR: [-2.85, 0.2, -0.35], farmR: [-1.55, 0, 0], handR: [-0.9, 0, 0], chest: [-0.25, -0.55, 0], spine: [-0.18, -0.2, 0], head: [-0.05, 0.4, 0], uarmL: [-1.1, -0.2, 0.4], farmL: [-1.3, 0, 0], rootY: -0.08 }],
    [0.4, { uarmR: [-0.65, 0.1, -0.05], farmR: [-0.12, 0, 0], handR: [1.1, 0, 0], chest: [0.35, 0.3, 0], spine: [0.45, 0.15, 0], head: [0.3, -0.1, 0], uarmL: [-0.4, 0, 0.55], farmL: [-1.0, 0, 0], rootY: -0.22, rootZ: 0.1 }],
    [0.6, { uarmR: [-0.6, 0.1, -0.05], farmR: [-0.15, 0, 0], handR: [1.0, 0, 0], chest: [0.35, 0.3, 0], spine: [0.45, 0.15, 0], head: [0.3, -0.1, 0], uarmL: [-0.4, 0, 0.55], farmL: [-1.0, 0, 0], rootY: -0.21, rootZ: 0.1 }],
    [1, { uarmR: [-1.1, 0.25, -0.6], farmR: [-1.6, 0, 0], handR: [-0.4, 0, 0], chest: [0.05, -0.2, 0], spine: [0.1, 0, 0], head: [0.05, 0.2, 0], uarmL: [-0.7, -0.2, 0.35], farmL: [-1.4, 0, 0], rootY: -0.04 }],
  ],
  chop2: [
    [0, { uarmR: [-2.85, 0.2, -0.35], farmR: [-1.55, 0, 0], handR: [-0.9, 0, 0], uarmL: [-2.6, -0.55, 0.35], farmL: [-1.4, 0, 0], handL: [-0.7, 0, 0], chest: [-0.25, -0.55, 0], spine: [-0.18, -0.2, 0], head: [-0.05, 0.45, 0], rootY: -0.08 }],
    [0.42, { uarmR: [-0.55, 0.05, 0.05], farmR: [-0.1, 0, 0], handR: [1.2, 0, 0], uarmL: [-0.6, -0.1, 0.1], farmL: [-0.15, 0, 0], handL: [1.1, 0, 0], chest: [0.5, 0, 0], spine: [0.6, 0, 0], head: [0.35, 0, 0], rootY: -0.3, rootZ: 0.12 }],
    [0.64, { uarmR: [-0.5, 0.05, 0.05], farmR: [-0.12, 0, 0], handR: [1.15, 0, 0], uarmL: [-0.55, -0.1, 0.1], farmL: [-0.15, 0, 0], handL: [1.05, 0, 0], chest: [0.5, 0, 0], spine: [0.6, 0, 0], head: [0.35, 0, 0], rootY: -0.29, rootZ: 0.12 }],
    [1, { uarmR: [-0.6, 0.35, -0.55], farmR: [-2.0, 0.3, 0], handR: [-0.5, 0, 0], uarmL: [-1.05, -0.75, 0.45], farmL: [-1.5, 0, 0], handL: [-0.4, 0, 0], chest: [0.04, -0.4, 0], spine: [0.1, -0.1, 0], head: [0.05, 0.4, 0], rootY: -0.05 }],
  ],
};
registerPose('cb_heavy', (t, dur, inp) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const st = style(inp);
  track(HEAVY[st], u, P, 0);
  const s = u < 0.4 ? ease(u / 0.4) : 1 - ease((u - 0.65) / 0.35);
  S(P, 'thighL', -0.55 * s - 0.2, 0, 0.12); S(P, 'shinL', 0.5 * s + 0.25); S(P, 'thighR', 0.35 * s + 0.15, 0, -0.1); S(P, 'shinR', 0.25 + 0.2 * s); S(P, 'footR', -0.3 - 0.3 * s, -0.3);
  hipTwist(P, 0.45);
  // the impact shudders back up the arms for a moment after contact
  if (u > 0.4 && u < 0.55) { const j = Math.sin((u - 0.4) * 140) * (0.55 - u) * 0.5; P.uarmR![0] += j; if (P.chest) P.chest[0] += j * 0.3; }
  P.gripR = 1; P.gripL = st === 'chop2' ? 1 : 0.8;
  return { pose: P, mask: ALL };
}, { aim: true, dur: 0.5 });

// ------------------------------------------------------------------ jabs (barrage): fast, alternating
const jab = (left: boolean) => (t: number, dur: number, inp: AnimInput, time: number) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  // a hitch back first (anticipation), snap out, ease home
  const k = u < 0.12 ? -0.22 * ease(u / 0.12) : u < 0.42 ? lerp(-0.22, 1, ((u - 0.12) / 0.3) ** 0.6) : 1 - ease((u - 0.42) / 0.58);
  const w = inp.weapon || 'unarmed';
  const bob = Math.sin(time * 9) * 0.02;
  if (w === 'unarmed' || left) {
    // straight punches; a weapon hand jabs with the free fist between strikes
    const [a, o] = left ? ['L', 'R'] as const : ['R', 'L'] as const;
    const sg = left ? 1 : -1;
    S(P, ('uarm' + a) as JointName, lerp(-0.75, -1.6, k) + bob, lerp(-0.15 * sg, 0.05 * sg, k), lerp(0.32 * sg, 0.05 * sg, k)); S(P, ('farm' + a) as JointName, lerp(-2.0, -0.05, k)); S(P, ('hand' + a) as JointName, 0.15);
    S(P, ('uarm' + o) as JointName, -0.65 - bob, 0.15 * -sg, -0.3 * sg); S(P, ('farm' + o) as JointName, -2.1); S(P, ('hand' + o) as JointName, 0.2);
    S(P, 'chest', 0.08, lerp(-0.2, 0.45, k) * (left ? -1 : 1), 0); S(P, 'spine', 0.1 + k * 0.08, 0, 0); S(P, 'head', 0.12, 0.2 * (left ? 1 : -1), 0);
  } else {
    // quick weapon stabs / pokes
    S(P, 'uarmR', lerp(-0.7, -1.55, k), 0.1, lerp(-0.25, -0.05, k)); S(P, 'farmR', lerp(-1.4, -0.05, k)); S(P, 'handR', 1.1);
    S(P, 'uarmL', -0.9, -0.2, 0.35); S(P, 'farmL', -1.6);
    S(P, 'chest', 0.08, lerp(-0.25, 0.35, k), 0); S(P, 'spine', 0.12 + k * 0.08, 0, 0);
  }
  braced(P, 0.8);
  hipTwist(P, 0.35);
  P.rootZ = 0.04 * k; P.gripL = 1; P.gripR = 1;
  return { pose: P, mask: ALL };
};
registerPose('cb_jab', jab(false), { aim: true, dur: 0.16 });
registerPose('cb_jab2', jab(true), { aim: true, dur: 0.16 });

// ------------------------------------------------------------------ sprint lunge: low, long, weapon arm fully out
registerPose('cb_lunge', (t, dur, inp) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const k = u < 0.35 ? ease(u / 0.35) : u < 0.7 ? 1 : 1 - ease((u - 0.7) / 0.3);
  const st = style(inp);
  if (st === 'chop' || st === 'chop2') {
    // a running blow: the weapon comes round flat
    S(P, 'uarmR', lerp(-1.0, -1.5, k), lerp(0.6, -0.4, k), lerp(-0.6, 0.1, k)); S(P, 'farmR', lerp(-1.6, -0.2, k)); S(P, 'handR', lerp(-0.4, 1.0, k));
    if (st === 'chop2') { S(P, 'uarmL', lerp(-1.1, -1.45, k), lerp(-0.8, -0.3, k), 0.3); S(P, 'farmL', lerp(-1.5, -0.3, k)); }
    else { S(P, 'uarmL', -0.3, 0, 0.7); S(P, 'farmL', -0.6); }
    S(P, 'chest', 0.15, lerp(-0.6, 0.6, k), 0);
  } else {
    S(P, 'uarmR', lerp(-0.6, -1.62, k), 0.05, lerp(-0.3, -0.05, k)); S(P, 'farmR', lerp(-1.8, -0.02, k)); S(P, 'handR', st === 'fist' ? 0.1 : 1.3);
    if (inp.twoHanded) { S(P, 'uarmL', lerp(-1.0, -1.5, k), -0.35, 0.15); S(P, 'farmL', lerp(-0.6, -0.1, k)); }
    else { S(P, 'uarmL', lerp(-0.6, 0.2, k), 0, lerp(0.4, 0.8, k)); S(P, 'farmL', -0.5); }
    S(P, 'chest', 0.12, lerp(-0.4, 0.45, k), 0);
  }
  S(P, 'spine', 0.2 + k * 0.25, 0, 0); S(P, 'head', -0.1 * k, 0, 0);
  S(P, 'thighL', -0.9 * k - 0.1, 0, 0.1); S(P, 'shinL', 0.7 * k + 0.2); S(P, 'footL', 0.2 * k);
  S(P, 'thighR', 0.7 * k, 0, -0.08); S(P, 'shinR', 0.25 + 0.15 * k); S(P, 'footR', -0.5 * k);
  hipTwist(P, 0.3);
  P.rootY = -0.28 * k; P.rootZ = 0.18 * k; P.gripR = 1; P.gripL = inp.twoHanded ? 1 : 0.4;
  return { pose: P, mask: ALL };
}, { aim: true, noIK: true, dur: 0.5 });

// ------------------------------------------------------------------ shoulder tackle
registerPose('cb_tackle', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const k = u < 0.3 ? ease(u / 0.3) : u < 0.65 ? 1 : 1 - ease((u - 0.65) / 0.35);
  S(P, 'spine', 0.55 * k, -0.35 * k, 0); S(P, 'chest', 0.2 * k, -0.4 * k, 0.1 * k); S(P, 'head', -0.35 * k, 0.4 * k, 0);
  S(P, 'uarmL', -0.9 * k, 0, 0.15); S(P, 'farmL', -2.0 * k); S(P, 'uarmR', -0.3, 0, -0.3 * k); S(P, 'farmR', -1.6 * k);
  S(P, 'thighL', -1.0 * k, 0, 0.1); S(P, 'shinL', 0.8 * k + 0.1); S(P, 'thighR', 0.6 * k, 0, -0.1); S(P, 'shinR', 0.3 + 0.2 * k); S(P, 'footR', -0.4 * k);
  P.rootY = -0.22 * k; P.rootZ = 0.15 * k; P.gripL = 1; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.55 });

// ------------------------------------------------------------------ stomp: knee up high, then drive the heel down
registerPose('cb_stomp', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  track([
    [0, { thighR: [-0.2, 0, -0.05], shinR: [0.3, 0, 0], footR: [0, 0, 0], thighL: [-0.1, 0, 0.08], shinL: [0.2, 0, 0], spine: [0.05, 0, 0], uarmL: [-0.4, 0, 0.5], uarmR: [-0.4, 0, -0.5], rootY: -0.02 }],
    [0.42, { thighR: [-1.75, 0, -0.08], shinR: [2.0, 0, 0], footR: [0.4, 0, 0], thighL: [0.05, 0, 0.06], shinL: [0.25, 0, 0], spine: [-0.15, 0, 0], head: [0.45, 0, 0], uarmL: [-0.6, 0, 0.9], farmL: [-0.6, 0, 0], uarmR: [-0.6, 0, -0.9], farmR: [-0.6, 0, 0], rootY: 0.02 }],
    [0.55, { thighR: [-0.45, 0, -0.06], shinR: [0.15, 0, 0], footR: [-0.25, 0, 0], thighL: [-0.25, 0, 0.08], shinL: [0.65, 0, 0], spine: [0.35, 0, 0], head: [0.55, 0, 0], uarmL: [-0.2, 0, 0.75], farmL: [-0.8, 0, 0], uarmR: [-0.2, 0, -0.75], farmR: [-0.8, 0, 0], rootY: -0.17 }],
    [0.72, { thighR: [-0.5, 0, -0.06], shinR: [0.2, 0, 0], footR: [-0.25, 0, 0], thighL: [-0.25, 0, 0.08], shinL: [0.6, 0, 0], spine: [0.32, 0, 0], head: [0.5, 0, 0], uarmL: [-0.25, 0, 0.7], farmL: [-0.8, 0, 0], uarmR: [-0.25, 0, -0.7], farmR: [-0.8, 0, 0], rootY: -0.15 }],
    [1, { thighR: [-0.1, 0, -0.05], shinR: [0.2, 0, 0], thighL: [-0.1, 0, 0.08], shinL: [0.2, 0, 0], spine: [0.08, 0, 0], uarmL: [-0.4, 0, 0.4], uarmR: [-0.4, 0, -0.4], rootY: -0.02 }],
  ], u, P, 1);
  // a grinding twist when it is held (finishers)
  if (u > 0.55 && u < 0.75) P.footR![1] = Math.sin(time * 30) * 0.25;
  P.gripL = 0.8; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.55 });

// ------------------------------------------------------------------ ground slash / down-stab at something on the floor
registerPose('cb_slash', (t, dur, inp) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const st = style(inp);
  const two = st === 'chop2' || inp.twoHanded;
  track([
    [0, { uarmR: [-2.7, 0.3, -0.45], farmR: [-1.4, 0, 0], handR: [-0.8, 0, 0], uarmL: two ? [-2.5, -0.5, 0.4] : [-0.8, -0.2, 0.5], farmL: two ? [-1.3, 0, 0] : [-1.2, 0, 0], chest: [-0.15, -0.5, 0], spine: [-0.1, -0.2, 0], head: [0.2, 0.3, 0], rootY: -0.05 }],
    [0.46, { uarmR: [-0.35, 0.0, 0.05], farmR: [-0.1, 0, 0], handR: [st === 'thrust' ? 1.5 : 1.2, 0, 0], uarmL: two ? [-0.4, -0.1, 0.1] : [-0.3, 0, 0.6], farmL: two ? [-0.15, 0, 0] : [-0.7, 0, 0], chest: [0.55, 0.25, 0], spine: [0.75, 0.1, 0], head: [0.5, 0, 0], rootY: -0.38, rootZ: 0.06 }],
    [0.66, { uarmR: [-0.4, 0.0, 0.05], farmR: [-0.12, 0, 0], handR: [1.1, 0, 0], uarmL: two ? [-0.45, -0.1, 0.1] : [-0.3, 0, 0.6], farmL: two ? [-0.2, 0, 0] : [-0.7, 0, 0], chest: [0.55, 0.25, 0], spine: [0.72, 0.1, 0], head: [0.5, 0, 0], rootY: -0.36, rootZ: 0.06 }],
    [1, { uarmR: [-0.8, 0.2, -0.3], farmR: [-1.3, 0, 0], handR: [0.2, 0, 0], uarmL: [-0.7, -0.2, 0.35], farmL: [-1.3, 0, 0], chest: [0.06, -0.1, 0], spine: [0.1, 0, 0], head: [0.1, 0, 0], rootY: -0.05 }],
  ], u, P, 0);
  const k = clamp(-(P.rootY ?? 0) / 0.38, 0, 1);
  S(P, 'thighL', -0.9 * k - 0.15, 0, 0.12); S(P, 'shinL', 1.1 * k + 0.2); S(P, 'thighR', 0.3 * k + 0.1, 0, -0.1); S(P, 'shinR', 0.9 * k + 0.2); S(P, 'footR', 0.3 * k);
  P.gripR = 1; P.gripL = two ? 1 : 0.6;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.5 });

// ------------------------------------------------------------------ dodge: a low sidestep / backstep
const dodge = (dir: 'l' | 'r' | 'b' | 'f') => (t: number, dur: number) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const k = u < 0.25 ? ease(u / 0.25) : 1 - ease((u - 0.45) / 0.55);
  const side = dir === 'l' ? 1 : dir === 'r' ? -1 : 0;
  P.rootY = -0.3 * k; P.bodyRoll = side * 0.22 * k; P.rootX = side * 0.12 * k;
  P.rootZ = (dir === 'b' ? -0.14 : dir === 'f' ? 0.12 : 0) * k;
  S(P, 'spine', (dir === 'b' ? -0.1 : 0.32) * k, 0, -side * 0.2 * k); S(P, 'chest', 0.1 * k, side * 0.3 * k, 0); S(P, 'head', 0.2 * k, -side * 0.3 * k, 0);
  S(P, 'thighL', -0.7 * k, 0, (0.35 + side * 0.25) * k); S(P, 'shinL', 1.0 * k); S(P, 'thighR', -0.5 * k, 0, (-0.35 + side * 0.25) * k); S(P, 'shinR', 0.9 * k);
  S(P, 'uarmL', -0.9 * k, -0.2, 0.55 * k); S(P, 'farmL', -1.6 * k); S(P, 'uarmR', -0.9 * k, 0.2, -0.55 * k); S(P, 'farmR', -1.6 * k);
  P.gripL = 1; P.gripR = 1;
  return { pose: P, mask: ALL };
};
registerPose('cb_dodge_l', dodge('l'), { noIK: true, dur: 0.3 });
registerPose('cb_dodge_r', dodge('r'), { noIK: true, dur: 0.3 });
registerPose('cb_dodge_b', dodge('b'), { noIK: true, dur: 0.3 });
registerPose('cb_dodge_f', dodge('f'), { noIK: true, dur: 0.3 });

// ------------------------------------------------------------------ struggling in a grip: arms locked out, shoving, shaking
registerPose('cb_struggle', (t, _dur, _inp, time) => {
  const P: Pose = {};
  const h = Math.sin(time * 19) * 0.08 + Math.sin(time * 7.3) * 0.06, j = Math.max(0, Math.sin(time * 5.1)) ** 6;
  S(P, 'uarmL', -1.35 + h, -0.25, 0.2); S(P, 'farmL', -0.45 - j * 0.6); S(P, 'handL', -0.9);
  S(P, 'uarmR', -1.35 - h, 0.25, -0.2); S(P, 'farmR', -0.45 - j * 0.6); S(P, 'handR', -0.9);
  S(P, 'spine', -0.18 + j * 0.25, 0, h * 0.4); S(P, 'chest', -0.1, h * 0.8, 0); S(P, 'head', 0.25 + h, -h * 2, 0);
  S(P, 'thighL', -0.45, 0, 0.14); S(P, 'shinL', 0.55); S(P, 'thighR', 0.4, 0, -0.12); S(P, 'shinR', 0.3); S(P, 'footR', -0.45);
  P.rootY = -0.14 + j * 0.04; P.rootZ = -0.1 + j * 0.06; P.gripL = 0.9; P.gripR = 0.9; P.blink = j > 0.5 ? 1 : 0;
  void t;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 3 });

// ------------------------------------------------------------------ pinned on the back, holding its head off
registerPose('cb_pinned', (t, _dur, _inp, time) => {
  const P: Pose = {};
  const fall = ease(t / 0.35);
  const h = Math.sin(time * 17) * 0.1 + Math.sin(time * 6.1) * 0.08, k = Math.max(0, Math.sin(time * 4.3)) ** 5;
  P.bodyPitch = -1.5708 * fall; P.bodyY = 0.13 * fall; P.rootY = -0.2 * (1 - fall);
  S(P, 'uarmL', -1.5 + h, -0.2, 0.25); S(P, 'farmL', -0.6 + k * 0.4); S(P, 'handL', -0.9);
  S(P, 'uarmR', -1.5 - h, 0.2, -0.25); S(P, 'farmR', -0.6 + k * 0.4); S(P, 'handR', -0.9);
  S(P, 'spine', 0.25 + k * 0.1, 0, 0); S(P, 'chest', 0.15, h, 0); S(P, 'head', 0.4 + h * 0.5, -h * 3, 0);
  S(P, 'thighL', -0.9 - k * 0.5, 0, 0.2); S(P, 'shinL', 1.2); S(P, 'thighR', -0.5 + k * 0.3, 0, -0.2); S(P, 'shinR', 0.9 + k * 0.6);
  P.gripL = 1; P.gripR = 1; P.blink = k > 0.5 ? 1 : 0;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 3 });

// ------------------------------------------------------------------ execution moves
// kneel on one knee and drive the weapon (or the fist) straight down, twice
registerPose('cb_downstab', (t, dur, inp) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const two = inp.twoHanded || inp.weapon === 'spear';
  const beat = (a: number) => { const x = (u - a) / 0.18; return x < 0 ? 0 : x < 0.5 ? ease(x * 2) : x < 1 ? 1 - ease((x - 0.5) * 2) * 0.85 : 0.15; };
  const raise = u < 0.2 ? ease(u / 0.2) : 1 - Math.max(beat(0.22), beat(0.58));
  const dn = Math.max(beat(0.22), beat(0.58));
  S(P, 'thighL', -1.3, 0, 0.08); S(P, 'shinL', 1.5); S(P, 'footL', -0.1);
  S(P, 'thighR', 0.2, 0, -0.06); S(P, 'shinR', 1.7); S(P, 'footR', 0.7);
  S(P, 'uarmR', lerp(-0.6, -2.8, raise) + dn * 1.9, 0.1, -0.15); S(P, 'farmR', lerp(-1.2, -1.3, raise) + dn * 1.1); S(P, 'handR', lerp(0.3, -0.6, raise) + dn * 1.6);
  if (two) { S(P, 'uarmL', lerp(-0.6, -2.6, raise) + dn * 1.8, -0.4, 0.2); S(P, 'farmL', lerp(-1.2, -1.2, raise) + dn * 1.0); S(P, 'handL', -0.5 + dn * 1.4); }
  else { S(P, 'uarmL', -0.5, 0, 0.5); S(P, 'farmL', -0.4); S(P, 'handL', -1.0); }
  S(P, 'spine', 0.25 + dn * 0.45 - raise * 0.15, 0, 0); S(P, 'chest', 0.1 + dn * 0.2, 0, 0); S(P, 'head', 0.45 + dn * 0.2, 0, 0);
  P.rootY = -0.44 - dn * 0.04; P.gripL = two ? 1 : 0.6; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 1.2 });

// two hands on a limb, foot braced, wrench back until it comes away
registerPose('cb_rip', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const grab = ease(u / 0.25), pull = ease((u - 0.3) / 0.45), snap = u > 0.75 ? ease((u - 0.75) / 0.1) : 0;
  const sh = (u > 0.3 && u < 0.75 ? 1 : 0) * Math.sin(time * 33) * 0.05;
  S(P, 'uarmL', lerp(-0.6, -1.45, grab) + pull * 0.6 + sh, -0.3, 0.15); S(P, 'farmL', lerp(-1.4, -0.3, grab) - pull * 1.2);
  S(P, 'uarmR', lerp(-0.6, -1.4, grab) + pull * 0.6 - sh, 0.3, -0.15); S(P, 'farmR', lerp(-1.4, -0.3, grab) - pull * 1.2);
  S(P, 'spine', 0.35 * grab - pull * 0.55 - snap * 0.15, pull * 0.3, 0); S(P, 'chest', -pull * 0.25, pull * 0.25, 0); S(P, 'head', 0.3 - pull * 0.5, 0, 0);
  S(P, 'thighL', -0.6 - pull * 0.5, 0, 0.12); S(P, 'shinL', 0.4 + pull * 0.2); S(P, 'thighR', 0.3 + pull * 0.2, 0, -0.1); S(P, 'shinR', 0.5);
  P.rootY = -0.16 - pull * 0.06; P.rootZ = -0.18 * pull - snap * 0.12; P.gripL = 1; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 1.4 });

// a spear (or blade) driven in and the body lifted overhead on it
registerPose('cb_lift', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const thrust = ease(u / 0.22), up = ease((u - 0.3) / 0.35), hold = u > 0.65 ? Math.sin(time * 24) * 0.04 : 0;
  S(P, 'uarmR', lerp(-0.5, -1.6, thrust) - up * 1.35 + hold, 0.1, -0.1); S(P, 'farmR', lerp(-1.4, -0.05, thrust) - up * 0.4); S(P, 'handR', 1.3 - up * 0.8);
  S(P, 'uarmL', lerp(-1.0, -1.55, thrust) - up * 1.3 - hold, -0.35, 0.15); S(P, 'farmL', lerp(-0.6, -0.1, thrust) - up * 0.5); S(P, 'handL', 1.2 - up * 0.8);
  S(P, 'spine', 0.25 * thrust - up * 0.45, 0, 0); S(P, 'chest', -up * 0.2, 0, 0); S(P, 'head', -up * 0.35, 0, 0);
  braced(P, 1.2);
  P.rootY = -0.12 - up * 0.08; P.gripL = 1; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 1.6 });

// a front kick (knock it over before the finish)
registerPose('cb_kick', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const ch = u < 0.3 ? ease(u / 0.3) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.4);
  const ex = u < 0.3 ? 0 : u < 0.42 ? ease((u - 0.3) / 0.12) : u < 0.6 ? 1 - ease((u - 0.42) / 0.18) : 0;
  S(P, 'thighR', -1.45 * ch - 0.2 * ex, 0, -0.04); S(P, 'shinR', 1.9 * ch - 1.85 * ex); S(P, 'footR', 0.3 * ch - 0.7 * ex);
  S(P, 'thighL', 0.05 * ch, 0, 0.03); S(P, 'shinL', 0.18 * ch);
  S(P, 'spine', -0.2 * ch - 0.15 * ex, 0, 0); S(P, 'head', 0.3 * ch);
  S(P, 'uarmL', -0.6 * ch, 0, 0.6 * ch); S(P, 'uarmR', 0.3 * ch, 0, -0.5 * ch); S(P, 'farmL', -0.8); S(P, 'farmR', -0.7);
  P.rootZ = -0.06 * ch; P.rootY = -0.03 * ch; P.gripL = 0.8; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.6 });

// a jump onto something big: crouch, spring up, land with the weapon high
registerPose('cb_leap', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const cr = u < 0.2 ? ease(u / 0.2) : u < 0.3 ? 1 - ease((u - 0.2) / 0.1) : u > 0.75 ? ease((u - 0.75) / 0.25) * 0.7 : 0;
  const air = u > 0.25 && u < 0.78 ? Math.sin(((u - 0.25) / 0.53) * Math.PI) : 0;
  P.rootY = -0.4 * cr + air * 0.7;
  S(P, 'thighL', -1.2 * cr - air * 0.9, 0, 0.1); S(P, 'shinL', 1.6 * cr + air * 1.4); S(P, 'thighR', -1.0 * cr - air * 0.5, 0, -0.1); S(P, 'shinR', 1.5 * cr + air * 1.0);
  S(P, 'uarmR', -0.8 - air * 2.0 - cr * 0.5, 0.1, -0.2); S(P, 'farmR', -1.2); S(P, 'uarmL', -0.6 - air * 1.6, -0.2, 0.4); S(P, 'farmL', -1.0);
  S(P, 'spine', 0.3 * cr - air * 0.2, 0, 0); S(P, 'head', 0.2 * cr);
  P.gripL = 1; P.gripR = 1;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.8 });
