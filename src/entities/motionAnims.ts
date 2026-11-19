// Whole-body motion poses for the unit's physical movement (src/entities/motion.ts):
// the vault (a hand planted on the thing, the legs swung over to one side), the hop,
// the feet-first slide, the trip-and-catch stumble, and getting up off your back
// after a knockdown (the face-down get-up is the animator's own 'get_up').
// Legs keep their soles on the floor by construction: a thigh forward by a, the
// knee bent by 2a and the ankle back by a drops the hips by (L1 + L2)(1 - cos a).
// Registered into the human animator's named-animation table, so
// Player.playAnim(name) plays them and co-op peers mirror them.
import type { Pose, JointName } from './humanRig';
import { registerPose } from './humanAnim';

type V = [number, number, number];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const S = (P: Pose, j: JointName, x: number, y = 0, z = 0) => { P[j] = [x, y, z]; };
const add = (P: Pose, j: JointName, x: number, y = 0, z = 0) => { const v = P[j] as V | undefined; if (v) { v[0] += x; v[1] += y; v[2] += z; } else P[j] = [x, y, z]; };
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

/** hips world height -> body-space root channels for a body pitched by th (bodyPitch pivots at the soles) */
function hipsAt(P: Pose, hy: number, th: number) {
  P.bodyPitch = th;
  P.rootY = hy * Math.cos(th) - H0;
  P.rootZ = -hy * Math.sin(th);
}
/** a crouched leg: thigh forward a, knee 2a, ankle back a (sole flat under the hip) */
function crouchLeg(P: Pose, side: 'L' | 'R', a: number, out = 0) {
  S(P, ('thigh' + side) as JointName, -a, 0, side === 'L' ? out : -out);
  S(P, ('shin' + side) as JointName, 2 * a);
  S(P, ('foot' + side) as JointName, -a);
}
const LEGS = 0.86;
/** hips drop for a crouch of a */
const dropOf = (a: number) => LEGS * (1 - Math.cos(a));

/** the height of what is being vaulted (world metres above the floor); the motion sets it before the vault plays */
let vaultH = 0.95;
export function setVaultHeight(h: number) { vaultH = clamp(h, 0.35, 1.25); }

// ------------------------------------------------------------------ vault: a run-up step, the left hand planted on top, the legs swung over to the right, the drop and the catch
registerPose('mo_vault', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const h = vaultH;
  type KF = [number, number, number, Partial<Record<JointName, V>> & { bodyYaw?: number; bodyRoll?: number }];
  // [u, hips height over the floor, pitch, joints]
  const K: KF[] = [
    [0, H0, 0, {}],
    [0.2, H0 - dropOf(0.55), 0.22, { spine: [0.18, 0, 0], head: [-0.25, 0, 0],
      thighL: [-0.85, 0, 0.05], shinL: [0.75, 0, 0], footL: [0.05, 0, 0], thighR: [0.15, 0, -0.05], shinR: [0.7, 0, 0], footR: [0.35, 0, 0],
      uarmL: [-1.05, 0, 0.12], farmL: [-0.25, 0, 0], handL: [-0.6, 0, 0], uarmR: [-0.7, 0, -0.35], farmR: [-0.6, 0, 0] }],
    [0.42, h + 0.4, 0.26, { bodyYaw: 0.45, bodyRoll: -0.22, spine: [0.22, 0.1, -0.1], chest: [0.05, 0.15, 0], head: [-0.3, -0.35, 0.1],
      thighL: [-1.75, 0.1, -0.3], shinL: [2.0, 0, 0], footL: [0.3, 0, 0], thighR: [-1.6, 0.1, -0.45], shinR: [1.85, 0, 0], footR: [0.3, 0, 0],
      uarmL: [-0.5, 0, 0.1], farmL: [-0.08, 0, 0], handL: [-1.3, 0, 0.1], uarmR: [-1.15, 0, -1.0], farmR: [-0.35, 0, 0], handR: [0, 0, -0.3] }],
    [0.62, h + 0.24, 0.02, { bodyYaw: 0.3, bodyRoll: -0.12, spine: [0.12, 0.08, -0.05], head: [-0.15, -0.25, 0.05],
      thighL: [-1.25, 0.1, -0.12], shinL: [0.65, 0, 0], footL: [-0.2, 0, 0], thighR: [-1.1, 0.05, -0.3], shinR: [0.85, 0, 0], footR: [-0.15, 0, 0],
      uarmL: [0.3, 0, 0.25], farmL: [-0.1, 0, 0], handL: [-1.0, 0, 0], uarmR: [-1.05, 0, -0.75], farmR: [-0.3, 0, 0] }],
    [0.84, H0 - dropOf(0.7), 0.16, { bodyYaw: 0.05, spine: [0.32, 0, 0], head: [-0.2, 0, 0],
      thighL: [-0.95, 0, 0.08], shinL: [1.3, 0, 0], footL: [-0.4, 0, 0], thighR: [-0.5, 0, -0.08], shinR: [1.45, 0, 0], footR: [-0.85, 0, 0],
      uarmL: [-0.65, 0, 0.35], farmL: [-0.45, 0, 0], uarmR: [-0.8, 0, -0.45], farmR: [-0.5, 0, 0] }],
    [1, H0, 0, {}],
  ];
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const [u0, y0, p0, A] = K[i], [u1, y1, p1, B] = K[i + 1];
  const f = ease((u - u0) / Math.max(1e-4, u1 - u0));
  hipsAt(P, lerp(y0, y1, f), lerp(p0, p1, f));
  const ks = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of ks) {
    const a = (A as any)[k], b = (B as any)[k];
    if (typeof a === 'number' || typeof b === 'number') (P as any)[k] = lerp(a ?? 0, b ?? 0, f);
    else { const x = (a ?? [0, 0, 0]) as V, y = (b ?? [0, 0, 0]) as V; S(P, k as JointName, lerp(x[0], y[0], f), lerp(x[1], y[1], f), lerp(x[2], y[2], f)); }
  }
  // the planted hand grips the edge; the free one opens for balance
  P.gripL = u > 0.25 && u < 0.6 ? 0.85 : 0.4; P.gripR = 0.25;
  P.blink = u > 0.4 && u < 0.5 && Math.sin(time * 9) > 0.6 ? 1 : 0;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.75 });

// ------------------------------------------------------------------ hop: dip, spring, tuck, land soft
registerPose('mo_hop', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  // hips height: dip, the spring (a short arc), the landing's give
  const hy = u < 0.2 ? H0 - dropOf(0.55) * ease(u / 0.2)
    : u < 0.78 ? lerp(H0 - dropOf(0.55), H0, ease((u - 0.2) / 0.12)) + Math.sin(clamp((u - 0.24) / 0.54, 0, 1) * Math.PI) * 0.3
      : lerp(H0 - dropOf(0.6), H0, ease((u - 0.84) / 0.16) * (u > 0.84 ? 1 : 0));
  const tuck = u < 0.2 ? 0.55 * ease(u / 0.2) : u < 0.3 ? lerp(0.55, 0.2, ease((u - 0.2) / 0.1)) : u < 0.55 ? lerp(0.2, 0.5, ease((u - 0.3) / 0.25)) : u < 0.8 ? lerp(0.5, 0.6, ease((u - 0.55) / 0.25)) : lerp(0.6, 0, ease((u - 0.8) / 0.2));
  const air = u > 0.26 && u < 0.78 ? Math.sin((u - 0.26) / 0.52 * Math.PI) : 0;
  hipsAt(P, hy, 0.08 * tuck);
  crouchLeg(P, 'L', tuck + air * 0.25, 0.05); crouchLeg(P, 'R', tuck - air * 0.15, 0.05);
  add(P, 'thighL', -air * 0.35); add(P, 'thighR', air * 0.2);
  // arms: back for the dip, thrown forward and up for the spring, out for the landing
  const sw = u < 0.2 ? ease(u / 0.2) * 0.55 : u < 0.4 ? lerp(0.55, -1.0, ease((u - 0.2) / 0.2)) : u < 0.8 ? lerp(-1.0, -0.55, ease((u - 0.4) / 0.4)) : lerp(-0.55, 0, ease((u - 0.8) / 0.2));
  S(P, 'uarmL', sw, 0, 0.12 + air * 0.25); S(P, 'uarmR', sw * 0.9, 0, -0.12 - air * 0.25);
  S(P, 'farmL', -0.35 - air * 0.3); S(P, 'farmR', -0.35 - air * 0.3);
  S(P, 'spine', 0.22 * tuck); S(P, 'head', -0.15 * tuck);
  P.gripL = 0.5; P.gripR = 0.5;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.46 });

// ------------------------------------------------------------------ slide: drop from the sprint onto one hip, feet first along the floor, sit up into a crouch
registerPose('mo_slide', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  // 0 running -> 1 the slide (leaning back on one hip) -> 2 crouched
  const a = u < 0.16 ? ease(u / 0.16) : 1;
  const c = u < 0.72 ? 0 : ease((u - 0.72) / 0.28);
  const lean = lerp(lerp(0.12, -0.92, a), 0.18, c);
  const hy = lerp(lerp(H0 - 0.05, 0.25, a), H0 - dropOf(0.95), c);
  hipsAt(P, hy, lean);
  P.bodyRoll = 0.14 * a * (1 - c);
  // the lead (right) leg straight out along the floor; the left folded under it, knee out
  const L: Partial<Record<JointName, V>> = {
    thighR: [-0.68, -0.08, -0.04], shinR: [0.08, 0, 0], footR: [-0.35, 0, 0],
    thighL: [-0.3, 0.15, 0.32], shinL: [1.95, 0, 0], footL: [0.35, 0, 0],
    spine: [0.42, 0, 0.05], chest: [0.18, -0.1, 0], neck: [0.2, 0, 0], head: [0.3, -0.12, 0],
    // the left hand trails on the floor behind the hip, the right reaches forward for balance
    uarmL: [0.45, 0, 0.62], farmL: [-0.15, 0, 0], handL: [-0.9, 0, 0.2],
    uarmR: [-1.35, 0, -0.28], farmR: [-0.55, 0, 0], handR: [0.1, 0, 0],
  };
  const C: Partial<Record<JointName, V>> = {
    thighL: [-0.95, 0, 0.1], shinL: [1.9, 0, 0], footL: [-0.95, 0, 0], thighR: [-0.95, 0, -0.1], shinR: [1.9, 0, 0], footR: [-0.95, 0, 0],
    spine: [0.32, 0, 0], head: [-0.1, 0, 0], uarmL: [-0.55, 0, 0.2], farmL: [-0.6, 0, 0], uarmR: [-0.55, 0, -0.2], farmR: [-0.6, 0, 0],
  };
  const R: Partial<Record<JointName, V>> = {
    thighL: [-0.55, 0, 0.05], shinL: [0.55, 0, 0], footL: [0.1, 0, 0], thighR: [0.35, 0, -0.05], shinR: [0.9, 0, 0], footR: [0.4, 0, 0],
    spine: [0.15, 0, 0], uarmL: [0.4, 0, 0.1], farmL: [-1.2, 0, 0], uarmR: [-0.5, 0, -0.1], farmR: [-1.2, 0, 0],
  };
  for (const j of ALL) {
    const r = R[j] ?? [0, 0, 0], l = L[j] ?? [0, 0, 0], cc = C[j] ?? [0, 0, 0];
    const v0 = lerp(r[0], l[0], a), v1 = lerp(r[1], l[1], a), v2 = lerp(r[2], l[2], a);
    S(P, j, lerp(v0, cc[0], c), lerp(v1, cc[1], c), lerp(v2, cc[2], c));
  }
  // the floor shakes the body a little as it skids
  const sk = a * (1 - c) * Math.sin(time * 37) * 0.012;
  add(P, 'chest', sk, 0, sk); add(P, 'head', -sk, 0, 0);
  P.gripL = 0.2; P.gripR = 0.6;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.82 });

// ------------------------------------------------------------------ down flat (Ctrl): a knee, the hands, the chest; and back up again
// The last key is the crawl stance's own resting pose (src/entities/humanAnim.ts), so it hands over without a pop.
const PRONE: Key[1] = { bodyPitch: 1.42, bodyY: 0.13, rootY: -0.84, uarmL: [-2.5, 0, 0.35], uarmR: [-2.5, 0, -0.35], farmL: [-0.5, 0, 0], farmR: [-0.5, 0, 0],
  thighL: [0.1, 0, 0.12], thighR: [0.1, 0, -0.12], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0], footL: [0.9, 0, 0], footR: [0.9, 0, 0], head: [-1.05, 0, 0] };
const KNEEL: Key[1] = { rootY: -0.46, spine: [0.32, 0, 0], head: [-0.15, 0, 0],
  thighL: [-1.3, 0, 0.06], shinL: [1.45, 0, 0], footL: [-0.15, 0, 0], thighR: [0.12, 0, -0.06], shinR: [1.75, 0, 0], footR: [0.65, 0, 0],
  uarmL: [-0.85, 0, 0.2], farmL: [-0.35, 0, 0], uarmR: [-0.85, 0, -0.2], farmR: [-0.35, 0, 0] };
const HANDS: Key[1] = { bodyPitch: 0.95, bodyY: 0.06, rootY: -0.62, spine: [0.15, 0, 0], head: [-0.75, 0, 0],
  thighL: [-0.85, 0, 0.1], shinL: [1.6, 0, 0], footL: [0.5, 0, 0], thighR: [-0.6, 0, -0.1], shinR: [1.7, 0, 0], footR: [0.7, 0, 0],
  uarmL: [-1.75, 0, 0.3], farmL: [-0.25, 0, 0], handL: [-0.9, 0, 0], uarmR: [-1.75, 0, -0.3], farmR: [-0.25, 0, 0], handR: [-0.9, 0, 0] };
registerPose('mo_down', (t, dur) => {
  const P: Pose = {};
  keys([[0, {}], [0.38, KNEEL], [0.7, HANDS], [1, PRONE]], dur > 0 ? clamp(t / dur, 0, 1) : 1, P);
  P.gripL = 0.4; P.gripR = 0.4;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.62 });
registerPose('mo_up', (t, dur) => {
  const P: Pose = {};
  keys([[0, PRONE], [0.3, HANDS], [0.62, KNEEL], [1, {}]], dur > 0 ? clamp(t / dur, 0, 1) : 1, P);
  P.gripL = 0.4; P.gripR = 0.4;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.7 });

// ------------------------------------------------------------------ haul: an armload (planks, a sheet, a battery) hugged to the belly
// The hands go under the load by IK (src/entities/humanAnim.ts actionReach 'haul'); the load sits on them
// (src/interact/haul.ts). The trunk leans back against the weight, the shoulders round, the elbows stay out.
registerPose('haul', (_t, _dur, inp, time) => {
  const P: Pose = {};
  const mv = clamp(inp.speed / 1.6, 0, 1);
  const bob = Math.sin(time * 6.2) * 0.012 * mv;
  S(P, 'spine', -0.1 + bob, 0, 0); S(P, 'chest', 0.08, 0, 0); S(P, 'neck', 0.12, 0, 0); S(P, 'head', 0.16, 0, 0);
  S(P, 'uarmL', -0.55, 0.15, 0.32); S(P, 'farmL', -1.25, 0, 0); S(P, 'handL', -0.2, 0, 0.35);
  S(P, 'uarmR', -0.55, -0.15, -0.32); S(P, 'farmR', -1.25, 0, 0); S(P, 'handR', -0.2, 0, -0.35);
  P.gripL = 0.85; P.gripR = 0.85;
  return { pose: P, mask: ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'] };
});

// ------------------------------------------------------------------ haul_long: planks along the right hip, both hands on them
registerPose('haul_long', (_t, _dur, inp, time) => {
  const P: Pose = {};
  const mv = clamp(inp.speed / 1.6, 0, 1);
  const bob = Math.sin(time * 6.2) * 0.01 * mv;
  // the trunk leans a touch away from the load and turns into it
  S(P, 'spine', 0.04 + bob, -0.12, 0.06); S(P, 'chest', 0.04, -0.1, 0.03); S(P, 'neck', 0.08, 0.1, 0); S(P, 'head', 0.1, 0.12, 0);
  S(P, 'uarmR', 0.1, 0, -0.32); S(P, 'farmR', -0.7, 0, 0); S(P, 'handR', -0.3, 0, -0.2);
  S(P, 'uarmL', -0.8, -0.5, -0.2); S(P, 'farmL', -1.1, 0, 0); S(P, 'handL', -0.2, 0, 0.3);
  P.gripL = 0.9; P.gripR = 0.9;
  return { pose: P, mask: ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'] };
});

// ------------------------------------------------------------------ dragging a body: one hand back on an ankle, leaning into the pull
registerPose('drag_body', (_t, _dur, inp, time) => {
  const P: Pose = {};
  const mv = clamp(inp.speed / 1.2, 0, 1);
  // a heave with every step while it moves
  const tug = Math.max(0, Math.sin(time * 5.2)) * mv;
  S(P, 'spine', 0.28 + tug * 0.06, 0.12, 0); S(P, 'chest', 0.08, 0.18, 0); S(P, 'neck', -0.05, -0.2, 0); S(P, 'head', -0.1, -0.15, 0);
  // the right arm long and back, gripping low; the left out for balance
  S(P, 'uarmR', 0.62 + tug * 0.08, 0, -0.18); S(P, 'farmR', -0.12, 0, 0); S(P, 'handR', 0.3, 0, 0);
  S(P, 'uarmL', -0.35 + tug * 0.1, 0, 0.32); S(P, 'farmL', -0.7, 0, 0);
  P.gripR = 1; P.gripL = 0.5;
  P.bodyPitch = 0.12 + tug * 0.04;
  return { pose: P, mask: ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'] };
});

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
