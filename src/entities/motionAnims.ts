// Whole-body motion poses for the unit's physical movement (src/entities/motion.ts):
// the vault (a hand planted on the thing, the legs swung over to one side), the hop,
// the feet-first slide, the trip-and-catch stumble, and getting up off your back
// after a knockdown (round 24: face down, face up, on the side, slumped, out of bed), hit reactions,
// landings, the door, the climb, the body's small motions and a few emotes.
// Legs keep their soles on the floor by construction: a thigh forward by a, the
// knee bent by 2a and the ankle back by a drops the hips by (L1 + L2)(1 - cos a).
// Registered into the human animator's named-animation table, so
// Player.playAnim(name) plays them and co-op peers mirror them.
import type { Pose, JointName } from './humanRig';
import { registerPose, registerEmote } from './humanAnim';

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

// (up off the back, the side, a slump or a bed: the round 24 get-ups below)

// ================================================================== round 24: getting up, falling, reeling, the body's small motions
// Every get-up starts from a held lying key (the ragdoll eases into it: src/entities/humanRig.ts recoverRagdoll) and places
// the hips in the world directly ({ hy: height over the floor, hz: forward of the root, th: body pitch }), so the trunk
// travels a real path (no swing of the whole body round the soles) and the last key is the standing rest pose.
type HK = Partial<Record<JointName, V>> & { hy?: number; hz?: number; th?: number; yaw?: number; roll?: number; gripL?: number; gripR?: number; blink?: number };
/** hips at (hy over the floor, hz ahead of the root) for a body pitched by th (bodyPitch pivots at the soles) */
function hipsWorld(P: Pose, hy: number, hz: number, th: number) {
  const c = Math.cos(th), s = Math.sin(th);
  P.bodyPitch = th; P.bodyY = 0;
  P.rootY = hy * c + hz * s - H0;
  P.rootZ = -hy * s + hz * c;
}
const STAND: HK = { hy: H0, hz: 0, th: 0 };
function keysH(K: [number, HK][], u: number, P: Pose, wrap = false) {
  let i = 0; while (i < K.length - 2 && u > K[i + 1][0]) i++;
  const [u0, A] = K[i], [u1, B] = K[i + 1];
  const f = ease((u - u0) / Math.max(1e-4, u1 - u0));
  const n = (k: keyof HK, d: number) => lerp((A[k] as number | undefined) ?? d, (B[k] as number | undefined) ?? d, f);
  let th = n('th', 0);
  if (wrap) th = Math.atan2(Math.sin(th), Math.cos(th));
  hipsWorld(P, n('hy', H0), n('hz', 0), th);
  P.bodyYaw = n('yaw', 0); P.bodyRoll = n('roll', 0);
  for (const j of ALL) {
    const a = (A[j] ?? [0, 0, 0]) as V, b = (B[j] ?? [0, 0, 0]) as V;
    S(P, j, lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f));
  }
  P.gripL = n('gripL', 0.35); P.gripR = n('gripR', 0.35);
  const bl = n('blink', 0); if (bl > 0.5) P.blink = 1;
}
/** the same keys seen in a mirror (left and right swapped; yaw and roll reversed) */
function mirrorK(K: [number, HK][]): [number, HK][] {
  const sw = (j: string) => (j.endsWith('L') ? j.slice(0, -1) + 'R' : j.endsWith('R') ? j.slice(0, -1) + 'L' : j);
  return K.map(([u, k]) => {
    const o: HK = {};
    for (const [n, v] of Object.entries(k)) {
      if (Array.isArray(v)) (o as any)[sw(n)] = [v[0], -v[1], -v[2]];
      else if (n === 'yaw' || n === 'roll') (o as any)[n] = -(v as number);
      else if (n === 'gripL') o.gripR = v as number; else if (n === 'gripR') o.gripL = v as number;
      else (o as any)[n] = v;
    }
    return [u, o];
  });
}
const UPPER_J: JointName[] = ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];

// ---- the shared tail of every get-up: one knee down and the other foot planted, up, a small settle back, standing
const KNEEL_UP: HK = { hy: 0.5, hz: 0, th: 0.05, spine: [0.38, 0, 0], head: [0.1, 0, 0],
  thighL: [-1.4, 0, 0.05], shinL: [1.5, 0, 0], footL: [-0.1, 0, 0], thighR: [0.15, 0, -0.05], shinR: [1.65, 0, 0], footR: [0.7, 0, 0],
  uarmL: [-0.75, 0, 0.1], farmL: [-0.45, 0, 0], handL: [-0.2, 0, 0], uarmR: [-0.45, 0, -0.1], farmR: [-0.3, 0, 0], gripL: 0.7 };
const RISE: HK = { hy: 0.84, hz: 0.02, th: 0.07, spine: [0.22, 0, 0], head: [0.04, 0, 0],
  thighL: [-0.4, 0, 0.05], shinL: [0.62, 0, 0], footL: [-0.22, 0, 0], thighR: [-0.1, 0, -0.04], shinR: [0.4, 0, 0], footR: [-0.12, 0, 0],
  uarmL: [-0.3, 0, 0.14], farmL: [-0.35, 0, 0], uarmR: [-0.15, 0, -0.14], farmR: [-0.3, 0, 0] };
const SETTLE: HK = { hy: H0 + 0.005, hz: 0, th: -0.025, spine: [-0.04, 0, 0], chest: [-0.03, 0, 0], head: [-0.05, 0, 0],
  uarmL: [0.08, 0, 0.1], farmL: [-0.2, 0, 0], uarmR: [0.08, 0, -0.1], farmR: [-0.2, 0, 0] };
const tail = (a: number): [number, HK][] => [[a, KNEEL_UP], [a + (1 - a) * 0.55, RISE], [a + (1 - a) * 0.82, SETTLE], [1, STAND]];

// ---- face down: the cheek on the floor, arms where they fell; hands in under the shoulders, push up, back onto the knees, a knee, up
const LIE_F: HK = { hy: 0.14, hz: 0.06, th: 1.42, head: [-0.5, 0.55, 0], neck: [-0.1, 0.2, 0],
  uarmL: [-2.05, 0, 0.45], farmL: [-0.7, 0, 0], handL: [-0.2, 0, 0], uarmR: [-0.85, 0, -0.5], farmR: [-0.45, 0, 0], handR: [-0.3, 0, 0],
  thighL: [0.05, 0, 0.12], shinL: [0.25, 0, 0], footL: [0.8, 0, 0], thighR: [-0.05, 0, -0.14], shinR: [0.4, 0, 0], footR: [0.75, 0, 0], gripL: 0.2, gripR: 0.2, blink: 0 };
const PLANT_F: HK = { hy: 0.15, hz: 0.04, th: 1.42, head: [-0.75, 0.12, 0], neck: [-0.15, 0, 0],
  uarmL: [-1.3, 0, 0.3], farmL: [-1.35, 0, 0], handL: [-1.1, 0, 0], uarmR: [-1.3, 0, -0.3], farmR: [-1.35, 0, 0], handR: [-1.1, 0, 0],
  thighL: [-0.15, 0, 0.12], shinL: [0.5, 0, 0], footL: [0.8, 0, 0], thighR: [-0.15, 0, -0.12], shinR: [0.5, 0, 0], footR: [0.8, 0, 0], gripL: 0.1, gripR: 0.1 };
const PUSH_F: HK = { hy: 0.27, hz: -0.04, th: 1.12, spine: [-0.16, 0, 0], head: [-0.62, 0, 0],
  uarmL: [-1.22, 0, 0.26], farmL: [-0.35, 0, 0], handL: [-1.25, 0, 0], uarmR: [-1.22, 0, -0.26], farmR: [-0.35, 0, 0], handR: [-1.25, 0, 0],
  thighL: [-0.6, 0, 0.1], shinL: [1.2, 0, 0], footL: [0.7, 0, 0], thighR: [-0.5, 0, -0.1], shinR: [1.1, 0, 0], footR: [0.7, 0, 0], gripL: 0.1, gripR: 0.1 };
const FOURS: HK = { hy: 0.52, hz: -0.04, th: 1.45, spine: [0.1, 0, 0], head: [-0.7, 0, 0],
  uarmL: [-1.45, 0, 0.15], farmL: [-0.05, 0, 0], handL: [-1.35, 0, 0], uarmR: [-1.45, 0, -0.15], farmR: [-0.05, 0, 0], handR: [-1.35, 0, 0],
  thighL: [-1.5, 0, 0.08], shinL: [1.55, 0, 0], footL: [0.55, 0, 0], thighR: [-1.5, 0, -0.08], shinR: [1.55, 0, 0], footR: [0.55, 0, 0], gripL: 0.1, gripR: 0.1 };
const GETUP_FRONT: [number, HK][] = [[0, LIE_F], [0.17, LIE_F], [0.3, PLANT_F], [0.43, PUSH_F], [0.56, FOURS], ...tail(0.72)];
registerPose('mo_getup_front', (t, dur) => { const P: Pose = {}; keysH(GETUP_FRONT, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; }, { noIK: true, dur: 1.8 });

// ---- face up (the root faces the feet): crunch up on the elbows, sit, the knees drawn in, over onto a knee, up
const LIE_B: HK = { hy: 0.14, hz: -0.06, th: -1.42, head: [0.22, 0.4, 0], uarmL: [0.15, 0, 0.45], farmL: [-0.3, 0, 0], uarmR: [0.25, 0, -0.3], farmR: [-0.6, 0, 0],
  thighL: [-0.1, 0, 0.12], shinL: [0.2, 0, 0], footL: [0.3, 0, 0], thighR: [0.02, 0, -0.1], shinR: [0.15, 0, 0], footR: [0.35, 0, 0], gripL: 0.25, gripR: 0.25 };
const CRUNCH_B: HK = { hy: 0.16, hz: -0.07, th: -0.85, spine: [0.35, 0, 0], head: [0.5, 0, 0],
  thighL: [-0.9, 0, 0.12], shinL: [1.5, 0, 0], thighR: [-0.5, 0, -0.1], shinR: [0.9, 0, 0],
  uarmL: [0.75, 0, 0.3], farmL: [-0.2, 0, 0], handL: [-1.1, 0, 0], uarmR: [0.75, 0, -0.3], farmR: [-0.2, 0, 0], handR: [-1.1, 0, 0] };
const SIT_B: HK = { hy: 0.16, hz: -0.04, th: -0.08, spine: [0.45, 0, 0], chest: [0.1, 0, 0], head: [0.2, 0, 0],
  thighL: [-1.45, 0, 0.12], shinL: [2.2, 0, 0], footL: [-0.4, 0, 0], thighR: [-1.2, 0, -0.25], shinR: [1.3, 0, 0],
  uarmL: [0.35, 0, 0.35], farmL: [-0.1, 0, 0], handL: [-1.2, 0, 0], uarmR: [-0.6, 0, -0.2], farmR: [-0.6, 0, 0] };
const TURN_B: HK = { hy: 0.36, hz: 0.04, th: 0.3, yaw: 0.22, spine: [0.5, 0, 0], head: [0.15, -0.2, 0],
  thighL: [-1.6, 0, 0.1], shinL: [2.0, 0, 0], footL: [-0.45, 0, 0], thighR: [-0.25, 0, -0.2], shinR: [2.0, 0, 0], footR: [0.4, 0, 0],
  uarmR: [-1.0, 0, -0.3], farmR: [-0.2, 0, 0], handR: [-1.0, 0, 0], uarmL: [-0.6, 0, 0.2], farmL: [-0.5, 0, 0], gripR: 0.1 };
const GETUP_BACK: [number, HK][] = [[0, LIE_B], [0.16, LIE_B], [0.3, CRUNCH_B], [0.45, SIT_B], [0.6, TURN_B], ...tail(0.74)];
registerPose('mo_getup_back', (t, dur) => { const P: Pose = {}; keysH(GETUP_BACK, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; }, { noIK: true, dur: 1.8 });

// ---- on its side (the root faces the head; _l: lying on the right side, belly toward the root's left): roll onto the front, then push up
const LIE_S: HK = { hy: 0.17, hz: 0.04, th: 1.42, yaw: 1.42, head: [-0.3, 0, -0.35], neck: [0, 0, -0.15],
  uarmL: [-1.2, 0, 0.1], farmL: [-1.0, 0, 0], handL: [-0.3, 0, 0], uarmR: [-1.7, 0, -0.15], farmR: [-0.5, 0, 0],
  thighL: [-0.75, 0, 0.05], shinL: [1.0, 0, 0], footL: [0.3, 0, 0], thighR: [-0.45, 0, -0.05], shinR: [0.8, 0, 0], footR: [0.4, 0, 0], gripL: 0.3, gripR: 0.2 };
const ROLL_S: HK = { hy: 0.17, hz: 0.04, th: 1.42, yaw: 0.6, head: [-0.6, 0.2, -0.15],
  uarmL: [-1.25, 0, 0.32], farmL: [-1.3, 0, 0], handL: [-1.0, 0, 0], uarmR: [-1.5, 0, -0.25], farmR: [-0.9, 0, 0], handR: [-0.6, 0, 0],
  thighL: [-0.5, 0, 0.1], shinL: [0.8, 0, 0], footL: [0.6, 0, 0], thighR: [-0.25, 0, -0.08], shinR: [0.6, 0, 0], footR: [0.6, 0, 0] };
const GETUP_SIDE: [number, HK][] = [[0, LIE_S], [0.16, LIE_S], [0.3, ROLL_S], [0.4, PLANT_F], [0.5, PUSH_F], [0.61, FOURS], ...tail(0.75)];
const GETUP_SIDE_R = mirrorK(GETUP_SIDE);
registerPose('mo_getup_side_l', (t, dur) => { const P: Pose = {}; keysH(GETUP_SIDE, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; }, { noIK: true, dur: 2.0 });
registerPose('mo_getup_side_r', (t, dur) => { const P: Pose = {}; keysH(GETUP_SIDE_R, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; }, { noIK: true, dur: 2.0 });

// ---- slumped sitting (against a wall, a crate; the root faces out from it): head up, knees drawn in, a hand down, over onto a knee, up
const SLUMP: HK = { hy: 0.15, hz: -0.05, th: -0.3, spine: [-0.05, 0, 0.04], head: [0.5, 0.25, 0.12],
  thighL: [-1.25, 0, 0.16], shinL: [0.45, 0, 0], footL: [-0.1, 0, 0], thighR: [-1.2, 0, -0.18], shinR: [0.6, 0, 0], footR: [-0.05, 0, 0],
  uarmL: [0.15, 0, 0.3], farmL: [-0.25, 0, 0], uarmR: [0.1, 0, -0.3], farmR: [-0.3, 0, 0], gripL: 0.2, gripR: 0.2 };
const DRAW: HK = { hy: 0.15, hz: -0.04, th: -0.05, spine: [0.35, 0, 0], head: [0.15, 0, 0],
  thighL: [-1.65, 0, 0.12], shinL: [2.1, 0, 0], footL: [-0.5, 0, 0], thighR: [-1.5, 0, -0.15], shinR: [2.0, 0, 0], footR: [-0.45, 0, 0],
  uarmR: [0.35, 0, -0.4], farmR: [-0.1, 0, 0], handR: [-1.2, 0, 0], uarmL: [-1.0, 0, 0.2], farmL: [-1.0, 0, 0], gripL: 0.6, gripR: 0.1 };
const GETUP_SIT: [number, HK][] = [[0, SLUMP], [0.14, { ...SLUMP, head: [0.2, 0.1, 0] }], [0.32, DRAW], [0.5, TURN_B], ...tail(0.66)];
registerPose('mo_getup_sit', (t, dur) => { const P: Pose = {}; keysH(GETUP_SIT, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; }, { noIK: true, dur: 1.6 });

// ---- out of a bed or off the floor after sleeping: starts exactly on the animator's 'lie' pose (on the back, the feet at the root)
const LIE_SLEEP: HK = { hy: 0.13, hz: -H0, th: -1.5708, chest: [0, 0, 0], uarmL: [0.1, 0, 0.28], uarmR: [0.05, 0, -0.22], farmL: [-0.5, 0, 0], farmR: [-1.4, 0.3, 0],
  head: [-0.12, 0, 0.35], thighL: [-0.06, 0, 0.05], thighR: [-0.2, 0, -0.04], shinR: [0.3, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0], gripL: 0.4, gripR: 0.4 };
const GETUP_LIE: [number, HK][] = [[0, LIE_SLEEP], [0.12, { ...LIE_SLEEP, head: [0.1, 0, 0.1] }],
  [0.3, { ...CRUNCH_B, hz: -0.88 }], [0.46, { ...SIT_B, hz: -0.7 }], [0.6, { ...TURN_B, hz: -0.32 }], [0.74, { ...KNEEL_UP, hz: -0.08 }], [0.86, RISE], [0.94, SETTLE], [1, STAND]];
registerPose('mo_getup_lie', (t, dur) => { const P: Pose = {}; keysH(GETUP_LIE, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; }, { noIK: true, dur: 2.2 });

// ---- on the floor (what a peer sees under the ragdoll, and the far-away / no-ragdoll fallback)
registerPose('mo_fall', (t, dur) => {
  const P: Pose = {};
  // the knees go, the body pitches forward onto the hands, flat
  keysH([[0, { ...STAND, uarmL: [-0.6, 0, 0.3], uarmR: [-0.6, 0, -0.3] }], [0.18, { hy: 0.55, hz: 0.1, th: 0.35, ...FOURS, uarmL: [-1.4, 0, 0.3], uarmR: [-1.4, 0, -0.3] }],
    [0.4, { ...PLANT_F, hy: 0.16 }], [1, LIE_F]], dur > 0 ? clamp(t / Math.min(dur, 1.2), 0, 1) : 1, P);
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 1.4 });

// ---- a hard landing at a run: tuck, over the shoulder, back onto the feet (bodyPitch wraps round a full turn)
registerPose('mo_land_roll', (t, dur) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const tuck: HK = { thighL: [-1.95, 0, 0.12], shinL: [2.3, 0, 0], footL: [-0.3, 0, 0], thighR: [-1.85, 0, -0.12], shinR: [2.25, 0, 0], footR: [-0.3, 0, 0],
    spine: [0.75, 0, 0], chest: [0.25, 0, 0], neck: [0.35, 0, 0], head: [0.6, 0, 0.1], uarmL: [-1.1, 0, 0.35], farmL: [-1.3, 0, 0], uarmR: [-1.6, 0, -0.2], farmR: [-0.8, 0, 0], gripL: 0.8, gripR: 0.8 };
  keysH([
    [0, { hy: 0.78, th: 0.12, thighL: [-0.6, 0, 0.1], shinL: [1.0, 0, 0], footL: [-0.4, 0, 0], thighR: [-0.5, 0, -0.1], shinR: [0.9, 0, 0], footR: [-0.4, 0, 0], spine: [0.3, 0, 0], uarmL: [-1.2, 0, 0.3], uarmR: [-1.2, 0, -0.3] }],
    [0.18, { hy: 0.42, hz: 0.1, th: 0.85, ...tuck }],
    [0.38, { hy: 0.36, hz: 0.05, th: 2.3, ...tuck, roll: 0.25 }],
    [0.6, { hy: 0.38, hz: 0, th: 4.2, ...tuck, roll: 0.15 }],
    [0.78, { hy: 0.5, hz: 0, th: 5.95, ...tuck, spine: [0.55, 0, 0], head: [0.2, 0, 0], uarmL: [-1.3, 0, 0.3], uarmR: [-1.3, 0, -0.3], farmL: [-0.4, 0, 0], farmR: [-0.4, 0, 0] }],
    [0.9, { ...RISE, th: 6.283 + 0.07 }],
    [1, { ...STAND, th: 6.283 }],
  ], u, P, true);
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 0.95 });

// ---- reeling from a blow, by the way it pushes the body (upper body; the feet step to catch it by IK)
function reel(dir: 'b' | 'f' | 'l' | 'r') {
  return (t: number, dur: number, _inp: unknown, time: number) => {
    const P: Pose = {};
    const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
    // the shove (fast), the catch, an overshoot the other way, settled
    const k = u < 0.12 ? ease(u / 0.12) : u < 0.4 ? 1 - 0.15 * ease((u - 0.12) / 0.28) : u < 0.75 ? 0.85 - 1.05 * ease((u - 0.4) / 0.35) : -0.2 * (1 - ease((u - 0.75) / 0.25));
    const wm = Math.sin(time * 10) * Math.max(0, k), wm2 = Math.sin(time * 10 + 1.9) * Math.max(0, k);
    if (dir === 'b') {
      P.bodyPitch = -0.16 * k; P.rootY = -0.05 * Math.abs(k);
      S(P, 'spine', -0.18 * k, 0, 0); S(P, 'chest', -0.1 * k, 0, 0); S(P, 'head', 0.35 * k, 0, 0);
      S(P, 'uarmL', -1.0 * k + wm * 0.5, 0, 0.55 * k + 0.08); S(P, 'uarmR', -1.0 * k + wm2 * 0.5, 0, -0.55 * k - 0.08);
      S(P, 'farmL', -0.5 * Math.abs(k) - 0.15, 0, 0); S(P, 'farmR', -0.5 * Math.abs(k) - 0.15, 0, 0);
    } else if (dir === 'f') {
      P.bodyPitch = 0.22 * k; P.rootY = -0.07 * Math.abs(k);
      S(P, 'spine', 0.28 * k, 0, 0); S(P, 'neck', -0.2 * k, 0, 0); S(P, 'head', -0.4 * k, 0, 0);
      const fl = u < 0.25 ? ease(u / 0.25) : 1 - ease((u - 0.25) / 0.5);
      S(P, 'uarmL', 0.6 * fl - 0.9 * Math.max(0, k - fl), 0, 0.35 * k + 0.08); S(P, 'uarmR', 0.6 * fl - 0.9 * Math.max(0, k - fl), 0, -0.35 * k - 0.08);
      S(P, 'farmL', -0.4 * Math.abs(k) - 0.15, 0, 0); S(P, 'farmR', -0.4 * Math.abs(k) - 0.15, 0, 0);
    } else {
      // pushed toward the body's left (l) or right (r): the trunk bends away, the far arm flies up, the near one out
      const sd = dir === 'l' ? 1 : -1;
      P.bodyRoll = -0.17 * k * sd; P.rootY = -0.05 * Math.abs(k); P.rootX = 0.06 * k * sd;
      S(P, 'spine', 0.06 * Math.abs(k), 0.12 * k * sd, 0.2 * k * sd); S(P, 'chest', 0, 0.1 * k * sd, 0.08 * k * sd); S(P, 'head', 0.1 * k, -0.2 * k * sd, -0.35 * k * sd);
      const far = dir === 'l' ? 'R' : 'L', near = dir === 'l' ? 'L' : 'R', fs = far === 'L' ? 1 : -1;
      S(P, ('uarm' + far) as JointName, -0.6 * k + wm * 0.3, 0, fs * (1.3 * Math.max(0, k) + 0.08)); S(P, ('farm' + far) as JointName, -0.4 * Math.abs(k) - 0.15, 0, 0);
      S(P, ('uarm' + near) as JointName, -0.3 * k, 0, -fs * (0.5 * Math.max(0, k) + 0.08)); S(P, ('farm' + near) as JointName, -0.7 * Math.abs(k) - 0.15, 0, 0);
    }
    P.gripL = 0.15; P.gripR = 0.15;
    return { pose: P, mask: UPPER_J };
  };
}
for (const d of ['b', 'f', 'l', 'r'] as const) registerPose('mo_reel_' + d, reel(d), { dur: 0.8 });

// ---- a blow to the head: the head snaps, both hands come up to it, a dazed wobble on the knees
registerPose('mo_daze', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const e = u < 0.1 ? ease(u / 0.1) : 1 - ease((u - 0.6) / 0.4);
  const h = u < 0.25 ? ease(u / 0.25) : 1;
  const wob = Math.sin(time * 3.1) * e, wob2 = Math.sin(time * 2.3 + 1) * e;
  P.rootY = -0.12 * e; P.bodyRoll = wob * 0.07; P.bodyPitch = 0.05 * e;
  S(P, 'spine', 0.25 * e, wob2 * 0.06, wob * 0.06); S(P, 'chest', 0.1 * e, 0, 0); S(P, 'neck', 0.15 * e, 0, 0);
  S(P, 'head', (0.3 + wob2 * 0.12) * e, wob * 0.25, wob * 0.15);
  // the right hand to the brow, the left to the back of the head
  S(P, 'uarmR', -1.3 * h * e, 0.35 * h * e, -0.35 * h * e); S(P, 'farmR', -2.1 * h * e - 0.15, 0, 0); S(P, 'handR', 0.3 * h * e, 0, 0);
  S(P, 'uarmL', -1.0 * h * e, -0.4 * h * e, 1.0 * h * e); S(P, 'farmL', -2.0 * h * e - 0.15, 0, 0);
  P.gripL = 0.3; P.gripR = 0.4; P.blink = e > 0.6 && Math.sin(time * 5) > 0.3 ? 1 : 0;
  return { pose: P, mask: UPPER_J };
}, { dur: 1.5 });

// ---- a blow to the stomach: doubled over, an arm across it, a cough of breath
registerPose('mo_gut', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const e = u < 0.1 ? ease(u / 0.1) : 1 - ease((u - 0.55) / 0.45);
  const cough = Math.max(0, Math.sin(time * 9)) ** 3 * e * 0.08;
  P.rootY = -0.14 * e; P.bodyPitch = 0.12 * e;
  S(P, 'spine', (0.6 + cough) * e, 0, 0); S(P, 'chest', 0.25 * e, 0, 0); S(P, 'neck', 0.1, 0, 0); S(P, 'head', -0.25 * e, 0, 0);
  S(P, 'uarmR', -0.5 * e, -0.6 * e, -0.05); S(P, 'farmR', -1.9 * e - 0.15, 0, 0); S(P, 'handR', 0.2, 0, -0.3 * e);
  S(P, 'uarmL', -0.7 * e, 0, 0.35 * e + 0.08); S(P, 'farmL', -0.4 * e - 0.15, 0, 0);
  P.gripR = 0.7; P.gripL = 0.3;
  return { pose: P, mask: UPPER_J };
}, { dur: 1.2 });

// ---- a blow to a leg: that knee goes down to the floor, a hand catches the thigh, back up (_l / _r: the leg hit)
function buckle(side: 'L' | 'R') {
  const K: [number, HK][] = [
    [0, STAND],
    [0.2, { hy: 0.6, hz: 0, th: 0.12, spine: [0.3, 0, 0], head: [0.15, 0, 0],
      thighL: [-1.25, 0, 0.06], shinL: [1.35, 0, 0], footL: [-0.1, 0, 0], thighR: [0.05, 0, -0.06], shinR: [1.45, 0, 0], footR: [0.5, 0, 0],
      uarmR: [-0.6, 0, -0.15], farmR: [-0.6, 0, 0], handR: [-0.3, 0, 0], uarmL: [-0.5, 0, 0.45], farmL: [-0.4, 0, 0], gripR: 0.8 }],
    [0.45, { ...KNEEL_UP, hy: 0.52, uarmR: [-0.55, 0, -0.12], farmR: [-0.55, 0, 0], handR: [-0.3, 0, 0], gripR: 0.8 }],
    [0.75, RISE], [0.9, SETTLE], [1, STAND],
  ];
  // the keys have the right knee down; the left leg mirrors them
  const KK = side === 'R' ? K : mirrorK(K);
  return (t: number, dur: number) => { const P: Pose = {}; keysH(KK, dur > 0 ? clamp(t / dur, 0, 1) : 1, P); return { pose: P, mask: ALL }; };
}
registerPose('mo_buckle_r', buckle('R'), { noIK: true, dur: 1.15 });
registerPose('mo_buckle_l', buckle('L'), { noIK: true, dur: 1.15 });

// ---- getting the wind back after running dry: straighten, a long breath in (shoulders up), out, a forearm across the brow
registerPose('mo_catch_breath', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const e = u < 0.15 ? ease(u / 0.15) : 1 - ease((u - 0.78) / 0.22);
  const inh = Math.sin(clamp((u - 0.12) / 0.4, 0, 1) * Math.PI);
  const wipe = clamp((u - 0.5) / 0.3, 0, 1), wp = Math.sin(wipe * Math.PI);
  P.rootY = -0.02 * e;
  S(P, 'spine', (0.18 - inh * 0.22) * e, 0, 0); S(P, 'chest', (-inh * 0.14) * e, 0, 0); S(P, 'neck', 0, 0, 0); S(P, 'head', (-0.25 * inh + 0.1 * wp) * e, 0, 0);
  S(P, 'uarmL', (0.1 - inh * 0.15) * e, 0, (0.2 + inh * 0.3) * e); S(P, 'farmL', -0.5 * e - 0.15, 0, 0); S(P, 'handL', 0, 0, 0);
  // the right forearm drawn across the forehead, side to side
  S(P, 'uarmR', -1.5 * wp * e + (0.1 - inh * 0.15) * e * (1 - wp), 0.3 * wp, (-0.6 - Math.sin(time * 6) * 0.15) * wp * e - 0.08); S(P, 'farmR', -1.95 * wp * e - 0.15, 0, 0); S(P, 'handR', 0, 0, -0.3 * wp);
  P.gripL = 0.3; P.gripR = 0.4;
  return { pose: P, mask: UPPER_J };
}, { dur: 2.4 });

// ---- throwing up: bent double, a hand on the knee, three heaves, a wipe of the mouth
registerPose('mo_vomit', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const e = u < 0.12 ? ease(u / 0.12) : 1 - ease((u - 0.82) / 0.18);
  // heaves at about a quarter, half and two thirds of the way
  let hv = 0;
  for (const c of [0.28, 0.46, 0.62]) hv = Math.max(hv, Math.exp(-(((u - c) / 0.045) ** 2)));
  const wipe = Math.sin(clamp((u - 0.72) / 0.14, 0, 1) * Math.PI);
  P.rootY = (-0.16 - hv * 0.04) * e; P.bodyPitch = 0.1 * e;
  S(P, 'spine', (0.75 + hv * 0.25) * e, 0, 0); S(P, 'chest', (0.2 - hv * 0.2) * e, 0, 0); S(P, 'neck', (0.1 + hv * 0.3) * e, 0, 0);
  S(P, 'head', (-0.5 + hv * 0.35) * e + Math.sin(time * 23) * 0.02 * hv, 0, 0);
  S(P, 'uarmL', -0.75 * e, 0, 0.15 * e + 0.08); S(P, 'farmL', -0.35 * e - 0.15, 0, 0); S(P, 'handL', -0.3 * e, 0, 0);
  S(P, 'uarmR', (-0.6 - wipe * 0.7) * e, (wipe * 0.5) * e, -0.25 * e - 0.08); S(P, 'farmR', (-1.0 - wipe * 1.0) * e - 0.15, 0, 0); S(P, 'handR', 0.1, 0, -0.2 * wipe);
  P.gripL = 0.8; P.gripR = 0.4; P.blink = hv > 0.4 ? 1 : 0;
  return { pose: P, mask: UPPER_J };
}, { dur: 3.4 });

// ---- going limp: the eyes roll, a sway, the knees go (the ragdoll takes it from the end of this)
registerPose('mo_swoon', (t, dur, _inp, time) => {
  const P: Pose = {};
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
  const e = ease(u);
  P.rootY = -0.18 * e * e; P.bodyRoll = Math.sin(time * 2.4) * 0.06 * e; P.bodyPitch = 0.06 * e;
  S(P, 'spine', 0.2 * e, 0, 0.08 * e); S(P, 'neck', 0.2 * e, 0, 0); S(P, 'head', 0.45 * e, 0.2 * e, 0.3 * e);
  S(P, 'uarmL', 0.05, 0, 0.12 + 0.1 * e); S(P, 'uarmR', 0.05, 0, -0.12 - 0.1 * e); S(P, 'farmL', -0.05, 0, 0); S(P, 'farmR', -0.05, 0, 0);
  P.gripL = 0; P.gripR = 0; P.blink = u > 0.35 ? 1 : 0;
  return { pose: P, mask: UPPER_J };
}, { dur: 0.9 });

// ---- a door: the hand to the handle and a push (or a pull back toward the body), the shoulder behind it; _l uses the left hand
function door(pull: boolean, side: 'L' | 'R') {
  return (t: number, dur: number) => {
    const P: Pose = {};
    const u = dur > 0 ? clamp(t / dur, 0, 1) : 1;
    const reach = u < 0.35 ? ease(u / 0.35) : 1 - ease((u - 0.7) / 0.3);
    const act = clamp((u - 0.3) / 0.35, 0, 1), a = ease(act);
    const k = side === 'L' ? 1 : -1;
    const ua = pull ? -1.25 + a * 0.65 : -1.05 - a * 0.45, fa = pull ? -0.55 - a * 0.9 : -0.9 + a * 0.75;
    S(P, ('uarm' + side) as JointName, ua * reach, 0, k * 0.12 * reach + k * 0.08); S(P, ('farm' + side) as JointName, fa * reach - 0.15, 0, 0); S(P, ('hand' + side) as JointName, -0.25 * reach, 0, 0);
    S(P, 'spine', (pull ? -0.06 * a : 0.1 * a) * reach, k * 0.12 * reach, 0); S(P, 'chest', 0, k * 0.1 * reach, 0); S(P, 'head', 0.06 * reach, -k * 0.08 * reach, 0);
    P.bodyPitch = (pull ? -0.05 : 0.06) * a * reach;
    if (side === 'L') P.gripL = 0.3 + 0.6 * reach; else P.gripR = 0.3 + 0.6 * reach;
    return { pose: P, mask: side === 'L' ? ['spine', 'chest', 'head', 'uarmL', 'farmL', 'handL'] as JointName[] : ['spine', 'chest', 'head', 'uarmR', 'farmR', 'handR'] as JointName[] };
  };
}
registerPose('mo_door_push', door(false, 'R'), { dur: 0.6 });
registerPose('mo_door_pull', door(true, 'R'), { dur: 0.7 });
registerPose('mo_door_push_l', door(false, 'L'), { dur: 0.6 });
registerPose('mo_door_pull_l', door(true, 'L'), { dur: 0.7 });

// ---- a rope or a ladder: hand over hand, the knees coming up in turn (loops; the travel cut plays it while the camera rises)
registerPose('mo_climb', (_t, _dur, _inp, time) => {
  const P: Pose = {};
  const ph = time * 4.2, s = Math.sin(ph), c = Math.cos(ph);
  P.rootY = -0.05 + Math.abs(c) * 0.03; P.bodyPitch = -0.05;
  S(P, 'uarmL', -2.6 + s * 0.35, 0, 0.18); S(P, 'farmL', -0.5 - Math.max(0, -s) * 0.9, 0, 0); S(P, 'handL', -0.2, 0, 0);
  S(P, 'uarmR', -2.6 - s * 0.35, 0, -0.18); S(P, 'farmR', -0.5 - Math.max(0, s) * 0.9, 0, 0); S(P, 'handR', -0.2, 0, 0);
  S(P, 'thighL', -0.9 - s * 0.55, 0, 0.08); S(P, 'shinL', 1.2 + s * 0.6, 0, 0); S(P, 'footL', -0.25, 0, 0);
  S(P, 'thighR', -0.9 + s * 0.55, 0, -0.08); S(P, 'shinR', 1.2 - s * 0.6, 0, 0); S(P, 'footR', -0.25, 0, 0);
  S(P, 'spine', 0.08, 0, 0); S(P, 'head', -0.35, s * 0.08, 0);
  P.gripL = 0.6 + Math.max(0, s) * 0.4; P.gripR = 0.6 + Math.max(0, -s) * 0.4;
  return { pose: P, mask: ALL };
}, { noIK: true, dur: 2 });

// ---- emotes (new; the shop's catalogue lists them: src/social/emotes/catalog.ts)
registerEmote('nod', { dur: 1.6, pose: (et) => {
  const P: Pose = {}; const e = Math.min(1, et / 0.2, (1.6 - et) / 0.3);
  S(P, 'head', (0.12 + Math.max(0, Math.sin(et * 9)) * 0.28) * e, 0, 0); S(P, 'neck', 0.06 * e, 0, 0);
  return { pose: P, mask: ['head', 'neck'] };
} });
registerEmote('head_shake', { dur: 1.8, pose: (et) => {
  const P: Pose = {}; const e = Math.min(1, et / 0.2, (1.8 - et) / 0.3);
  S(P, 'head', 0.08 * e, Math.sin(et * 10) * 0.45 * e, 0); S(P, 'neck', 0, Math.sin(et * 10 - 0.4) * 0.12 * e, 0);
  return { pose: P, mask: ['head', 'neck'] };
} });
registerEmote('beckon', { dur: 2.2, pose: (et) => {
  const P: Pose = {}; const e = Math.min(1, et / 0.3, (2.2 - et) / 0.35);
  const cu = Math.max(0, Math.sin(et * 8));
  S(P, 'uarmR', -1.2 * e, 0.25 * e, -0.2 * e - 0.07); S(P, 'farmR', (-0.6 - cu * 0.9) * e - 0.12, 0, 0); S(P, 'handR', -0.4 * cu * e, 0, 0);
  S(P, 'head', -0.05 * e, -0.15 * e, 0.12 * e); S(P, 'chest', 0, -0.1 * e, 0);
  P.gripR = 0.2 + cu * 0.6;
  return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'head', 'chest'] };
} });
registerEmote('thumbs_up', { dur: 2.0, pose: (et) => {
  const P: Pose = {}; const e = Math.min(1, et / 0.25, (2.0 - et) / 0.3);
  const pump = Math.max(0, Math.sin(clamp((et - 0.35) / 0.5, 0, 1) * Math.PI * 2)) * 0.15;
  S(P, 'uarmR', (-0.75 - pump) * e, -0.3 * e, -0.15 * e - 0.07); S(P, 'farmR', -1.35 * e - 0.12, 0, 0); S(P, 'handR', 0, 0, 0.9 * e);
  S(P, 'head', 0.05 * e, -0.1 * e, -0.08 * e); S(P, 'spine', -0.04 * e, 0, 0);
  P.gripR = 0.95;
  return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'head', 'spine'] };
} });
registerEmote('yawn', { dur: 2.8, pose: (et) => {
  const P: Pose = {}; const e = Math.min(1, et / 0.5, (2.8 - et) / 0.5);
  const st = Math.sin(clamp(et / 2.4, 0, 1) * Math.PI);
  S(P, 'uarmL', -2.5 * st * e, 0, 0.45 * e + 0.07); S(P, 'uarmR', -2.5 * st * e, 0, -0.45 * e - 0.07); S(P, 'farmL', -0.9 * st * e - 0.12, 0, 0); S(P, 'farmR', -0.9 * st * e - 0.12, 0, 0);
  S(P, 'spine', -0.14 * st * e, 0, 0); S(P, 'chest', -0.12 * st * e, 0, 0); S(P, 'head', -0.35 * st * e, 0, 0);
  P.gripL = 0.6; P.gripR = 0.6; P.blink = st > 0.5 ? 1 : 0;
  return { pose: P, mask: UPPER_J };
} });
