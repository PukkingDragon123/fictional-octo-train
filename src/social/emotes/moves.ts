// The shop's emotes, as poses over the unit's animation (registered with the
// animator: src/entities/humanAnim.ts registerEmote). Same joint conventions as
// the built-in ones: uarm x<0 raises the arm forward, uarmL z>0 / uarmR z<0
// lift it sideways, farm x<0 bends the elbow, thigh x<0 lifts the leg
// forward, shin x>0 bends the knee, head x>0 looks down, spine x>0 bends
// forward; rootY lowers / raises the body, bodyYaw spins it, bodyPitch tips
// it. Each pose eases in and out on its own (the animator also crossfades).
// What the hands hold and what flies out of them is src/social/emotes/props.ts.
import { registerEmote } from '../../entities/humanAnim';
import type { Pose, JointName } from '../../entities/humanRig';

type V3 = [number, number, number];
const PI = Math.PI;
const s = Math.sin, c = Math.cos, ab = Math.abs;
const cl = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const sm = (t: number) => { t = cl(t, 0, 1); return t * t * (3 - 2 * t); };
/** 0 -> 1 between a and b */
const ramp = (t: number, a: number, b: number) => sm((t - a) / Math.max(1e-4, b - a));
/** in over `a` seconds, out over the last `b` */
const envT = (t: number, d: number, a = 0.3, b = 0.35) => Math.min(ramp(t, 0, a), 1 - ramp(t, d - b, d));
const ALL: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const UPPER: JointName[] = ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const mixV = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** key-framed pose: [time, pose] pairs, smoothed between keys, scaled toward rest by w */
function keyed(t: number, keys: [number, Pose][], w = 1): Pose {
  let i = 1;
  while (i < keys.length && keys[i][0] < t) i++;
  const [t0, a] = keys[Math.max(0, i - 1)], [t1, b] = keys[Math.min(keys.length - 1, i)];
  const k = t1 > t0 ? sm((t - t0) / (t1 - t0)) : 1;
  const out: Pose = {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const n of names) {
    const va = (a as Record<string, unknown>)[n], vb = (b as Record<string, unknown>)[n];
    if (Array.isArray(va) || Array.isArray(vb)) {
      const A = (va as V3) ?? REST[n] ?? [0, 0, 0], B = (vb as V3) ?? REST[n] ?? [0, 0, 0];
      (out as Record<string, unknown>)[n] = mixV(mixV(REST[n] ?? [0, 0, 0], A, 1), B, k).map((x, j) => (REST[n]?.[j] ?? 0) + (x - (REST[n]?.[j] ?? 0)) * w);
    } else {
      const A = (va as number) ?? 0, B = (vb as number) ?? 0;
      (out as Record<string, unknown>)[n] = (A + (B - A) * k) * (n.startsWith('grip') || n === 'blink' ? 1 : w);
    }
  }
  return out;
}
/** a relaxed standing pose (the targets the keys fall back to) */
const REST: Record<string, V3> = {
  uarmL: [0.04, 0, 0.07], uarmR: [0.04, 0, -0.07], farmL: [-0.12, 0, 0], farmR: [-0.12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0],
  hips: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  thighL: [0, 0, 0.03], thighR: [0, 0, -0.03], shinL: [0.04, 0, 0], shinR: [0.04, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
};
const def = (name: string, dur: number, pose: (t: number, time: number, d: number) => { pose: Pose; mask: JointName[] }, o: { loop?: boolean; legs?: boolean } = {}) =>
  registerEmote(name, { dur, loop: o.loop, legs: o.legs, pose });

// ---------------------------------------------------------------- the firework
// kneels and sets a rocket on the floor, lights the fuse, backs off a step with
// its fingers in its ears, watches it go up and burst, then claps
export const FIREWORK = { kneel: [0.2, 1.1], light: 1.25, back: 2.2, launch: 2.9, burst: 4.0, dur: 6.4 };
def('firework', FIREWORK.dur, (t) => {
  const F = FIREWORK;
  const kneel: Pose = { rootY: -0.42, rootZ: 0.12, thighR: [-1.45, 0, -0.08], shinR: [1.5, 0, 0], footR: [0, 0, 0], thighL: [0.25, 0, 0.06], shinL: [1.75, 0, 0], footL: [0.5, 0, 0],
    spine: [0.42, 0, 0], chest: [0.15, 0, 0], head: [0.45, 0, 0], uarmR: [-1.2, 0, -0.12], farmR: [-0.4, 0, 0], uarmL: [-0.9, 0, 0.2], farmL: [-0.6, 0, 0], gripR: 0.7, gripL: 0.6 };
  const ears: Pose = { rootZ: -0.25, uarmL: [-0.55, -0.3, 1.25], farmL: [-2.3, 0, 0], handL: [0, 0, 0.4], uarmR: [-0.55, 0.3, -1.25], farmR: [-2.3, 0, 0], handR: [0, 0, -0.4],
    head: [-0.35, 0, 0], chest: [-0.12, 0, 0], spine: [-0.05, 0, 0], thighL: [0, 0, 0.08], thighR: [0, 0, -0.08], gripL: 0.3, gripR: 0.3 };
  const look: Pose = { ...ears, head: [-0.75, 0, 0], neck: [-0.2, 0, 0], chest: [-0.2, 0, 0], rootZ: -0.3 };
  const clap = (k: number): Pose => ({ rootZ: -0.3, head: [-0.5, 0, 0], uarmL: [-1.0, 0, 0.3], farmL: [-1.25, 0, -0.45 - 0.3 * k], uarmR: [-1.0, 0, -0.3], farmR: [-1.25, 0, 0.45 + 0.3 * k], gripL: 0, gripR: 0 });
  const P = keyed(t, [[0, {}], [F.kneel[0] + 0.5, kneel], [F.back - 0.25, kneel], [F.back + 0.35, ears], [F.burst - 0.4, look], [F.burst + 0.6, look], [F.burst + 1.0, clap(0)], [F.dur, clap(0)]]);
  // lighting: the left hand flicks the lighter by the fuse
  if (t > F.light - 0.15 && t < F.back) { const k = ramp(t, F.light - 0.15, F.light + 0.1); P.uarmL = mixV(P.uarmL as V3, [-1.35, 0.1, -0.05], k); P.farmL = mixV(P.farmL as V3, [-0.3, 0, 0], k); }
  if (t > F.burst + 1.0) { const k = ab(s(t * 9)); P.farmL = [-1.25, 0, -0.45 - 0.3 * k]; P.farmR = [-1.25, 0, 0.45 + 0.3 * k]; }
  const out = 1 - ramp(t, F.dur - 0.45, F.dur);
  return { pose: fade(P, out), mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the robot
// locks up, plates slam onto every limb (props), a stiff stepping robot routine on the beat, then unfolds
export const ROBOT = { on: 0.55, off: 5.6, dur: 6.4 };
def('robot', ROBOT.dur, (t) => {
  const R = ROBOT;
  // the routine snaps between held poses every 0.32 s
  const beat = Math.floor((t - R.on) / 0.32);
  const poses: Pose[] = [
    { uarmL: [0, 0, 1.55], farmL: [-1.57, 0, 0], uarmR: [0, 0, -1.55], farmR: [1.57, 0, 0], head: [0, 0.5, 0] },
    { uarmL: [-1.55, 0, 0.1], farmL: [0, 0, 0], uarmR: [0, 0, -0.1], farmR: [-1.57, 0, 0], head: [0, -0.5, 0], chest: [0, 0.25, 0] },
    { uarmL: [0, 0, 1.55], farmL: [0, 0, 1.4], uarmR: [0, 0, -1.55], farmR: [0, 0, -1.4], head: [0, 0, 0], rootY: -0.06 },
    { uarmL: [-1.57, 0, 0.1], farmL: [-1.57, 0, 0], uarmR: [-1.57, 0, -0.1], farmR: [-1.57, 0, 0], head: [0.2, 0, 0], chest: [0, -0.25, 0] },
    { uarmL: [0, 0, 0.9], farmL: [-1.57, 0, 0], uarmR: [-2.9, 0, -0.1], farmR: [0, 0, 0], head: [-0.2, 0.5, 0], thighR: [-0.5, 0, 0], shinR: [0.9, 0, 0] },
  ];
  const lock: Pose = { uarmL: [0, 0, 0.12], uarmR: [0, 0, -0.12], farmL: [0, 0, 0], farmR: [0, 0, 0], head: [0, 0, 0], chest: [-0.1, 0, 0], gripL: 1, gripR: 1, blink: 0 };
  let P: Pose;
  if (t < R.on) P = keyed(t, [[0, {}], [R.on, lock]]);
  else if (t > R.off) P = keyed(t, [[R.off, lock], [R.dur, {}]]);
  else {
    const cur = poses[((beat % poses.length) + poses.length) % poses.length], nxt = poses[(((beat + 1) % poses.length) + poses.length) % poses.length];
    // a hard servo snap at the start of each beat, then holds (no ease: it is a machine)
    const u = ((t - R.on) / 0.32) % 1;
    P = keyed(u < 0.25 ? u / 0.25 : 1, [[0, { ...lock, ...cur }], [1, { ...lock, ...nxt }]]);
    P.rootY = (P.rootY ?? 0) + (u < 0.1 ? -0.015 : 0);
    P.gripL = 1; P.gripR = 1;
  }
  return { pose: P, mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the confetti cannon
// a brass popgun out of the pocket, held up, three bounces of anticipation, the string pulled: a burst
export const CONFETTI = { pop: 1.85, dur: 4.2 };
def('confetti', CONFETTI.dur, (t, time, d) => {
  const bob = t < CONFETTI.pop ? ab(s(t * PI * 2.2)) * 0.05 : 0;
  const recoil = t > CONFETTI.pop ? Math.exp(-(t - CONFETTI.pop) * 7) : 0;
  const P = keyed(t, [[0, {}], [0.45, { uarmR: [-2.1, 0.2, -0.2], farmR: [-0.6, 0, 0], uarmL: [-0.9, -0.2, 0.15], farmL: [-1.3, 0, -0.4], head: [-0.35, 0.1, 0], chest: [-0.1, 0, 0], gripR: 0.9, gripL: 0.8 }],
    [CONFETTI.pop, { uarmR: [-2.25, 0.2, -0.2], farmR: [-0.45, 0, 0], uarmL: [-1.0, -0.1, 0.1], farmL: [-1.5, 0, -0.4], head: [-0.4, 0.1, 0], chest: [-0.12, 0, 0], gripR: 0.9, gripL: 1 }],
    [CONFETTI.pop + 0.9, { uarmR: [-2.6, 0, -0.35], farmR: [-0.2, 0, 0], uarmL: [-0.3, 0, 2.5], farmL: [-0.3, 0, 0], head: [-0.4, 0, 0], chest: [-0.15, 0, 0], gripR: 0.9, gripL: 0.2 }],
    [d, { uarmR: [-2.6, 0, -0.35], farmR: [-0.2, 0, 0], uarmL: [-0.3, 0, 2.5], farmL: [-0.3, 0, 0], head: [-0.4, 0, 0], gripR: 0.9, gripL: 0.2 }]]);
  P.rootY = bob - recoil * 0.04 + (t > CONFETTI.pop + 0.6 ? ab(s(time * 6)) * 0.05 : 0);
  if (P.uarmR) P.uarmR = [P.uarmR[0] + recoil * 0.4, P.uarmR[1], P.uarmR[2]];
  return { pose: fade(P, envT(t, d, 0.01, 0.4)), mask: ALL };
});

// ---------------------------------------------------------------- the sad trombone
// three hopeful notes on a trombone (the slide out and in), the last one sags, and so does the unit
export const TROMBONE = { notes: [0.5, 1.15, 1.8], wah: 2.45, dur: 5.6 };
def('trombone', TROMBONE.dur, (t, time, d) => {
  const T = TROMBONE;
  const play: Pose = { uarmL: [-1.25, -0.5, 0.3], farmL: [-2.0, 0, -0.3], handL: [0.3, 0, 0], head: [-0.08, 0, 0], chest: [-0.06, 0, 0], gripL: 0.9, gripR: 0.8 };
  const slide = (k: number): V3 => [-1.35 + k * 0.25, 0.1, -0.1 - k * 0.1];
  const sag: Pose = { ...play, head: [0.55, 0, 0.1], neck: [0.2, 0, 0], chest: [0.35, 0, 0], spine: [0.3, 0, 0], uarmL: [-0.7, -0.3, 0.2], farmL: [-1.6, 0, 0], uarmR: [-0.6, 0.1, -0.1], farmR: [-0.9, 0, 0], rootY: -0.06 };
  const slump: Pose = { ...sag, rootY: -0.42, thighL: [-1.2, 0, 0.1], shinL: [1.9, 0, 0], thighR: [-1.2, 0, -0.1], shinR: [1.9, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0], spine: [0.55, 0, 0], head: [0.75, 0, 0] };
  const P = keyed(t, [[0, {}], [0.4, { ...play, uarmR: slide(0), farmR: [-0.35, 0, 0] }], [T.wah, { ...play, uarmR: slide(0), farmR: [-0.35, 0, 0] }], [T.wah + 1.2, { ...sag, uarmR: slide(1), farmR: [-0.1, 0, 0] }], [T.wah + 2.0, slump], [d, slump]]);
  // the slide: out and back on each note, one long sad one
  if (t > 0.4 && t < T.wah + 1.2) {
    let k = 0;
    for (const n of T.notes) if (t > n && t < n + 0.55) k = s(((t - n) / 0.55) * PI);
    if (t > T.wah) k = ramp(t, T.wah, T.wah + 1.1);
    P.uarmR = slide(k); P.farmR = [-0.35 + k * 0.3, 0, 0];
    if (t < T.wah) P.head = [-0.08 - k * 0.12, 0, 0];
  }
  return { pose: fade(P, 1 - ramp(t, d - 0.5, d)), mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the ventriloquist
// a sock puppet on the left hand turns and "talks" to the unit, who keeps a straight face; it bites its nose
export const PUPPET = { bite: 3.6, dur: 5.6 };
def('puppet', PUPPET.dur, (t, time, d) => {
  const turn = t < 1.2 ? 0 : t < 2.4 ? 1 : t < 3.3 ? 0.4 : 1;
  const P = keyed(t, [[0, {}], [0.5, { uarmL: [-1.3, -0.4, 0.15], farmL: [-1.0, 0, -0.5], handL: [0, 0, 0], uarmR: [0.1, 0, -0.5], farmR: [-1.4, 0.3, 0], handR: [0, 0, -0.5], head: [0, 0.3, 0], gripL: 0.4, gripR: 0.6 }], [d, { uarmL: [-1.3, -0.4, 0.15], farmL: [-1.0, 0, -0.5], uarmR: [0.1, 0, -0.5], farmR: [-1.4, 0.3, 0], handR: [0, 0, -0.5], head: [0, 0.3, 0], gripL: 0.4, gripR: 0.6 }]]);
  // the puppet hand swings round to face the unit, bobbing as it talks
  const talk = t > 0.8 && t < PUPPET.bite - 0.2 ? ab(s(time * 11)) : 0;
  P.handL = [talk * 0.25, -turn * 0.9, 0];
  P.farmL = [-1.0 - turn * 0.35, 0, -0.5 - turn * 0.3];
  // the unit side-eyes it, nods once; the bite yanks the head
  const bite = t > PUPPET.bite ? Math.exp(-(t - PUPPET.bite) * 4) : 0;
  P.head = [0.05 + bite * -0.3 + (t > 2.4 && t < 2.9 ? s((t - 2.4) * PI * 2) * 0.15 : 0), 0.3 + turn * 0.2 - bite * 0.5, bite * 0.2];
  if (t > PUPPET.bite) { P.uarmL = [-1.55, -0.2, 0.2]; P.farmL = [-1.9, 0, -0.4]; P.handL = [0.3, -1.2, 0]; }
  P.rootY = -bite * 0.05;
  return { pose: fade(P, 1 - ramp(t, d - 0.45, d)), mask: UPPER };
});

// ---------------------------------------------------------------- the chair that isn't there
// sits down on nothing, crosses its legs, reads a paper that isn't there either, turns a page; then the chair remembers
export const GHOSTCHAIR = { fall: 4.6, dur: 6.4 };
def('ghostchair', GHOSTCHAIR.dur, (t, time, d) => {
  const G = GHOSTCHAIR;
  const sit: Pose = { rootY: -0.47, rootZ: -0.18, thighL: [-1.5, 0, 0.08], shinL: [1.5, 0, 0], thighR: [-1.5, 0, -0.08], shinR: [1.5, 0, 0], footL: [0.05, 0, 0], footR: [0.05, 0, 0],
    spine: [-0.08, 0, 0], chest: [0, 0, 0], head: [0.15, 0, 0], uarmL: [-0.9, -0.3, 0.25], farmL: [-1.2, 0, -0.4], uarmR: [-0.9, 0.3, -0.25], farmR: [-1.2, 0, 0.4], gripL: 0.85, gripR: 0.85 };
  const cross: Pose = { ...sit, thighR: [-1.55, 0.25, 0.25], shinR: [1.3, 0, 0], footR: [-0.2, 0, 0], thighL: [-1.45, -0.1, 0.05] };
  const fell: Pose = { rootY: -0.86, rootZ: -0.35, bodyPitch: -0.25, thighL: [-1.3, 0, 0.3], shinL: [0.6, 0, 0], thighR: [-1.6, 0, -0.3], shinR: [0.4, 0, 0], spine: [0.1, 0, 0], head: [-0.3, 0, 0], uarmL: [-0.5, 0, 1.4], farmL: [-0.4, 0, 0], uarmR: [-0.5, 0, -1.4], farmR: [-0.4, 0, 0], gripL: 0, gripR: 0 };
  const P = keyed(t, [[0, {}], [1.0, sit], [1.6, cross], [G.fall, cross], [G.fall + 0.28, fell], [d - 0.6, fell], [d, {}]]);
  // the page turn
  if (t > 2.6 && t < 3.4) { const k = s(((t - 2.6) / 0.8) * PI); P.uarmR = mixV(P.uarmR as V3, [-1.1, -0.2, 0.2], k); P.farmR = mixV(P.farmR as V3, [-1.4, 0, -0.2], k); }
  if (t > G.fall && t < G.fall + 0.9) P.blink = 0;
  return { pose: P, mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the magic trick
// shows the right hand, passes the left over it: gone (props hide it in a puff); panic; another pass: back, with a flower
export const MAGIC = { pass1: 1.0, gone: 1.35, pass2: 3.2, back: 3.5, dur: 5.6 };
def('magic', MAGIC.dur, (t, time, d) => {
  const M = MAGIC;
  const show: Pose = { uarmR: [-1.25, 0.1, -0.35], farmR: [-0.7, 0, 0], handR: [-0.3, 0, 0], uarmL: [0.05, 0, 0.2], head: [0.25, -0.1, 0], gripR: 0, gripL: 0.2 };
  const pass: Pose = { ...show, uarmL: [-1.35, -0.3, 0.1], farmL: [-0.9, 0, -0.3], handL: [0, 0, 0], gripL: 0 };
  const shock: Pose = { uarmR: [-1.3, 0.1, -0.35], farmR: [-0.3, 0, 0], uarmL: [-0.6, 0, 0.9], farmL: [-1.5, 0, 0], handL: [0, 0, 0.6], head: [0.4, -0.15, 0.1], chest: [-0.2, 0, 0], rootY: 0.03, gripL: 0 };
  const ta: Pose = { uarmR: [-0.5, 0, -1.6], farmR: [-0.3, 0, 0], uarmL: [-0.5, 0, 1.6], farmL: [-0.3, 0, 0], head: [-0.2, 0, 0], chest: [-0.15, 0, 0], gripR: 0.8, gripL: 0 };
  const P = keyed(t, [[0, {}], [0.6, show], [M.pass1, pass], [M.gone + 0.2, show], [M.gone + 0.6, shock], [M.pass2 - 0.4, shock], [M.pass2, pass], [M.back + 0.3, show], [M.back + 1.0, ta], [d, ta]]);
  if (t > M.gone + 0.6 && t < M.pass2 - 0.4) { P.head = [0.4 + s(time * 14) * 0.08, -0.15 + s(time * 9) * 0.1, 0.1]; P.uarmR = [-1.3 + s(time * 16) * 0.05, 0.1, -0.35]; }
  return { pose: fade(P, 1 - ramp(t, d - 0.45, d)), mask: UPPER };
});

// ---------------------------------------------------------------- the jelly wobble
// the whole body goes to jelly: every joint rings like a spring and settles (props squash the body)
export const JELLY = { dur: 4.4 };
def('jelly', JELLY.dur, (t, time, d) => {
  const a = Math.min(ramp(t, 0, 0.35), 1 - ramp(t, d - 0.9, d));
  const w = (f: number, ph: number, amp: number) => s(time * f + ph) * amp * a;
  const P: Pose = {
    hips: [0, w(7, 0, 0.12), w(9, 1, 0.12)], spine: [w(8, 0.5, 0.18), w(6, 2, 0.15), w(9.5, 1.2, 0.2)], chest: [w(8, 1.2, 0.2), w(6.5, 2.5, 0.2), w(9.5, 2, 0.25)],
    neck: [w(9, 2, 0.15), 0, w(10, 0.2, 0.2)], head: [w(9, 2.6, 0.25), w(7, 1, 0.3), w(10, 0.8, 0.3)],
    uarmL: [w(7, 0, 0.5) - 0.2 * a, 0, 0.5 * a + w(8, 1, 0.5)], farmL: [-0.4 * a + w(9, 2, 0.6), 0, w(10, 0, 0.4)], handL: [w(11, 1, 0.5), 0, w(12, 2, 0.5)],
    uarmR: [w(7, 1.5, 0.5) - 0.2 * a, 0, -0.5 * a - w(8, 2.5, 0.5)], farmR: [-0.4 * a + w(9, 0.5, 0.6), 0, -w(10, 1.5, 0.4)], handR: [w(11, 2, 0.5), 0, -w(12, 0.5, 0.5)],
    thighL: [w(6, 0, 0.1) - 0.15 * a, 0, 0.1 * a], shinL: [0.3 * a + w(6, 0, 0.15), 0, 0], thighR: [w(6, PI, 0.1) - 0.15 * a, 0, -0.1 * a], shinR: [0.3 * a + w(6, PI, 0.15), 0, 0],
    rootY: -0.08 * a + w(6, 0, 0.04), gripL: 0, gripR: 0,
  };
  return { pose: P, mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the bee swarm hat
// a straw skep on the head, bees spilling round it; the unit flaps at them, ducks, turns, and gives up
export const BEEHAT = { dur: 6.0 };
def('beehat', BEEHAT.dur, (t, time, d) => {
  const swat = (k: number): Pose => ({ uarmL: [-1.6 - s(time * 7) * 0.5, 0, 1.0 + s(time * 7) * 0.6], farmL: [-1.1, 0, 0], uarmR: [-1.6 - s(time * 7 + 1.5) * 0.5, 0, -1.0 - s(time * 7 + 1.5) * 0.6], farmR: [-1.1, 0, 0], head: [0.1 * k, s(time * 4) * 0.5, 0], chest: [0.15, s(time * 4) * 0.2, 0], spine: [0.15, 0, 0], gripL: 0, gripR: 0 });
  const P = keyed(t, [[0, {}], [0.6, { head: [-0.4, 0, 0], uarmR: [-1.0, 0.4, -1.3], farmR: [-1.8, 0, 0], handR: [0.4, 0, 0], gripR: 0 }], [1.3, swat(1)], [4.4, swat(1)], [5.0, { head: [0.35, 0, 0.12], chest: [0.15, 0, 0], uarmL: [0.05, 0, 0.1], uarmR: [0.05, 0, -0.1], farmL: [-0.2, 0, 0], farmR: [-0.2, 0, 0] }], [d, { head: [0.35, 0, 0.12], chest: [0.15, 0, 0] }]]);
  if (t > 1.3 && t < 4.4) { P.bodyYaw = s(time * 1.3) * 0.6; P.rootY = -ab(s(time * 4)) * 0.06; }
  return { pose: fade(P, 1 - ramp(t, d - 0.4, d)), mask: ALL };
});

// ---------------------------------------------------------------- air guitar
export const AIRGUITAR = { slide: 2.6, dur: 5.2 };
def('airguitar', AIRGUITAR.dur, (t, time, d) => {
  const strum = s(time * 18) * 0.35;
  const play: Pose = { uarmL: [-1.0, -0.6, 0.5], farmL: [-0.8, 0, -0.4], handL: [0, 0, 0.6], uarmR: [-0.5, 0.4, -0.3], farmR: [-1.5 + strum, 0, 0.3], handR: [0, 0, strum], head: [0.3, 0.2, 0.1], chest: [0.1, 0.2, 0], gripL: 0.7, gripR: 0.8 };
  const slide: Pose = { ...play, rootY: -0.5, rootZ: 0.25, bodyPitch: 0.35, thighL: [-1.2, 0, 0.3], shinL: [2.2, 0, 0], thighR: [0.3, 0, -0.15], shinR: [1.9, 0, 0], footR: [0.8, 0, 0], head: [-0.6, 0, 0], chest: [-0.3, 0, 0] };
  const P = keyed(t, [[0, {}], [0.4, play], [AIRGUITAR.slide - 0.3, play], [AIRGUITAR.slide + 0.2, slide], [AIRGUITAR.slide + 1.4, slide], [AIRGUITAR.slide + 1.8, { ...play, uarmR: [-0.3, 0, -2.7], farmR: [0, 0, 0], handR: [0, 0, 0], gripR: 1 }], [d, { uarmR: [-0.3, 0, -2.7], farmR: [0, 0, 0] }]]);
  if (t < AIRGUITAR.slide - 0.3) { P.head = [0.3 + ab(s(time * 7)) * 0.35, 0.2, 0.1]; P.rootY = -ab(s(time * 7)) * 0.04; P.farmR = [-1.5 + strum, 0, 0.3]; }
  else if (t < AIRGUITAR.slide + 1.4) { P.farmR = [-1.5 + strum, 0, 0.3]; P.handR = [0, 0, strum]; }
  return { pose: fade(P, 1 - ramp(t, d - 0.45, d)), mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the mime's box
export const MIME = { dur: 5.4 };
def('mime', MIME.dur, (t, time, d) => {
  const flat = (side: number): Pose => ({ handL: [0, 0, 1.4], handR: [0, 0, -1.4], gripL: 0, gripR: 0, uarmL: side === 0 ? [-1.45, 0, 0.25] : [-0.15, 0, 1.3], farmL: side === 0 ? [-0.7, 0, 0] : [0, 0, 0.3], uarmR: side === 0 ? [-1.45, 0, -0.25] : [-0.15, 0, -1.3], farmR: side === 0 ? [-0.7, 0, 0] : [0, 0, -0.3] });
  const up: Pose = { uarmL: [-0.4, 0, 2.6], farmL: [-0.6, 0, 0], handL: [-1.4, 0, 0], uarmR: [-0.4, 0, -2.6], farmR: [-0.6, 0, 0], handR: [-1.4, 0, 0], head: [-0.4, 0, 0], gripL: 0, gripR: 0, rootY: -0.06 };
  const rope = (k: number): Pose => ({ uarmL: [-2.2 + k * 0.6, 0, 0.2], farmL: [-0.6 - k * 0.6, 0, 0], uarmR: [-1.6 - k * 0.6, 0, -0.2], farmR: [-1.2 + k * 0.6, 0, 0], spine: [0.1, 0, 0], rootZ: -0.1 * k, gripL: 1, gripR: 1, head: [-0.2, 0, 0] });
  const P = keyed(t, [[0, {}], [0.5, flat(0)], [1.3, flat(0)], [1.7, flat(1)], [2.4, flat(1)], [2.8, up], [3.4, up], [3.8, rope(0)], [4.3, rope(1)], [4.7, rope(0)], [d, rope(1)]]);
  // palms feel along the walls
  if (t > 0.5 && t < 2.4) { const k = s(time * 3) * 0.12; P.uarmL = [(P.uarmL as V3)[0] + k, (P.uarmL as V3)[1], (P.uarmL as V3)[2]]; P.uarmR = [(P.uarmR as V3)[0] - k, (P.uarmR as V3)[1], (P.uarmR as V3)[2]]; }
  return { pose: fade(P, 1 - ramp(t, d - 0.45, d)), mask: UPPER.concat(['hips']) };
});

// ---------------------------------------------------------------- the dramatic faint
export const FAINT = { spin: 1.1, down: 1.9, up: 4.4, dur: 5.4 };
def('faint', FAINT.dur, (t, time, d) => {
  const F = FAINT;
  const woe: Pose = { uarmR: [-1.0, 0.45, -0.6], farmR: [-2.35, 0, 0], handR: [0.6, 0, 0], uarmL: [0.1, 0, 0.9], farmL: [-0.3, 0, 0], head: [-0.45, 0, 0.15], chest: [-0.2, 0, 0], gripR: 0, gripL: 0 };
  const flat: Pose = { rootY: -0.82, bodyPitch: -1.45, thighL: [0, 0, 0.15], thighR: [0, 0, -0.15], shinL: [0.1, 0, 0], shinR: [0.1, 0, 0], uarmL: [-0.4, 0, 1.3], uarmR: [-0.4, 0, -1.3], farmL: [-0.2, 0, 0], farmR: [-0.2, 0, 0], head: [0.1, 0.4, 0], blink: 1, gripL: 0, gripR: 0 };
  const P = keyed(t, [[0, {}], [0.6, woe], [F.spin, woe], [F.down - 0.1, { ...woe, rootY: -0.2, bodyPitch: -0.4 }], [F.down + 0.15, flat], [F.up, flat], [F.up + 0.35, { uarmL: [-0.3, 0, 2.6], uarmR: [-0.3, 0, -2.6], rootY: 0.08 }], [d, {}]]);
  if (t > F.spin && t < F.down + 0.1) P.bodyYaw = sm((t - F.spin) / (F.down + 0.1 - F.spin)) * PI * 2;
  return { pose: P, mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- levitation
export const LEVITATE = { dur: 6.0 };
def('levitate', LEVITATE.dur, (t, time, d) => {
  const lotus: Pose = { thighL: [-1.45, -0.6, 0.85], thighR: [-1.45, 0.6, -0.85], shinL: [2.4, 0, 0], shinR: [2.4, 0, 0], footL: [-0.3, 0, -0.5], footR: [-0.3, 0, 0.5],
    uarmL: [0.1, 0, 0.55], farmL: [-0.6, 0, 0], handL: [0, 0, 0.3], uarmR: [0.1, 0, -0.55], farmR: [-0.6, 0, 0], handR: [0, 0, -0.3], spine: [-0.05, 0, 0], head: [-0.05, 0, 0], blink: 1, gripL: 0.2, gripR: 0.2 };
  const up = ramp(t, 0.8, 2.2) * (1 - ramp(t, d - 1.2, d - 0.4));
  const P = keyed(t, [[0, {}], [0.8, { ...lotus, rootY: -0.62 }], [d - 0.4, { ...lotus, rootY: -0.62 }], [d, {}]]);
  P.rootY = (P.rootY ?? 0) + up * (0.8 + s(time * 1.6) * 0.06);
  P.bodyYaw = up * s(time * 0.5) * 0.25;
  return { pose: P, mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- the chicken
export const CHICKEN = { dur: 5.2 };
def('chicken', CHICKEN.dur, (t, time, d) => {
  const ph = Math.floor(t / 1.3) % 4;
  const k = ab(s(time * 10));
  const P: Pose = { gripL: 0, gripR: 0 };
  if (ph === 0) { P.uarmL = [-1.4, 0, 0.3]; P.uarmR = [-1.4, 0, -0.3]; P.farmL = [-0.2, 0, 0]; P.farmR = [-0.2, 0, 0]; P.handL = [0, 0, k * 0.8]; P.handR = [0, 0, -k * 0.8]; }
  else if (ph === 1) { P.uarmL = [-0.2, 0, 0.5 + k * 0.6]; P.uarmR = [-0.2, 0, -0.5 - k * 0.6]; P.farmL = [-1.9, 0, 0]; P.farmR = [-1.9, 0, 0]; P.handL = [0.5, 0, 0]; P.handR = [0.5, 0, 0]; }
  else if (ph === 2) { P.hips = [0, s(time * 12) * 0.35, 0]; P.uarmL = [0.2, 0, 0.6]; P.uarmR = [0.2, 0, -0.6]; P.farmL = [-1.2, 0, 0]; P.farmR = [-1.2, 0, 0]; P.rootY = -0.16; P.thighL = [-0.45, 0, 0.2]; P.thighR = [-0.45, 0, -0.2]; P.shinL = [0.9, 0, 0]; P.shinR = [0.9, 0, 0]; P.spine = [0.3, 0, 0]; }
  else { P.uarmL = [-0.3, 0, 2.5]; P.uarmR = [-0.3, 0, -2.5]; P.farmL = [-0.3, 0, 0]; P.farmR = [-0.3, 0, 0]; P.rootY = ab(s(time * 6)) * 0.08; }
  P.head = [ph === 2 ? 0.2 : s(time * 10) * 0.25, 0, 0];
  P.neck = [0, 0, 0]; P.chest = [ph === 1 ? -0.15 : 0, 0, 0];
  if (ph !== 2) { P.thighL = [-0.15 * ab(s(time * 5)), 0, 0.05]; P.thighR = [-0.15 * ab(c(time * 5)), 0, -0.05]; P.shinL = [0.3 * ab(s(time * 5)), 0, 0]; P.shinR = [0.3 * ab(c(time * 5)), 0, 0]; }
  return { pose: fade(P, envT(t, d, 0.3, 0.4)), mask: ALL };
}, { legs: true, loop: false });

// ---------------------------------------------------------------- shadow boxing
export const BOXER = { dur: 5.0 };
def('boxer', BOXER.dur, (t, time, d) => {
  const guard: Pose = { uarmL: [-0.9, -0.4, 0.35], farmL: [-2.2, 0, 0], uarmR: [-0.8, 0.4, -0.35], farmR: [-2.25, 0, 0], head: [0.2, 0, 0], chest: [0.15, 0.3, 0], spine: [0.1, 0, 0], gripL: 1, gripR: 1, rootY: -0.06 };
  const P = keyed(t, [[0, {}], [0.4, guard], [d - 0.4, guard], [d, {}]]);
  // the combination: jab, jab, cross, hook, uppercut, on a loop
  const seq = [[0.5, 'jab'], [0.9, 'jab'], [1.3, 'cross'], [1.9, 'hook'], [2.5, 'upper'], [3.1, 'jab'], [3.5, 'cross'], [3.9, 'hook']] as const;
  for (const [at, kind] of seq) {
    const u = (t - at) / 0.32;
    if (u < 0 || u > 1) continue;
    const k = s(u * PI);
    if (kind === 'jab') { P.uarmL = mixV(P.uarmL as V3, [-1.5, 0, 0.1], k); P.farmL = mixV(P.farmL as V3, [-0.1, 0, 0], k); P.chest = [0.15, 0.55 * k, 0]; }
    if (kind === 'cross') { P.uarmR = mixV(P.uarmR as V3, [-1.5, 0, -0.1], k); P.farmR = mixV(P.farmR as V3, [-0.1, 0, 0], k); P.chest = [0.15, -0.45 * k, 0]; P.hips = [0, -0.3 * k, 0]; }
    if (kind === 'hook') { P.uarmL = mixV(P.uarmL as V3, [-1.2, -0.9, 1.3], k); P.farmL = mixV(P.farmL as V3, [-1.6, 0, 0], k); P.chest = [0.1, -0.6 * k, 0]; }
    if (kind === 'upper') { P.uarmR = mixV(P.uarmR as V3, [-1.9, 0.4, -0.2], k); P.farmR = mixV(P.farmR as V3, [-1.9, 0, 0], k); P.rootY = -0.12 + 0.1 * k; }
  }
  const b = ab(s(time * 7));
  P.rootY = (P.rootY ?? 0) + b * 0.03;
  P.thighL = [-0.2, 0, 0.12]; P.thighR = [0.15, 0, -0.12]; P.shinL = [0.3 + b * 0.1, 0, 0]; P.shinR = [0.25 + b * 0.1, 0, 0];
  return { pose: fade(P, envT(t, d, 0.25, 0.35)), mask: ALL };
}, { legs: true });

// ---------------------------------------------------------------- jazz hands
export const JAZZ = { spin: [0.6, 1.5], pop: 1.7, dur: 4.4 };
def('jazz', JAZZ.dur, (t, time, d) => {
  const J = JAZZ;
  const crouch: Pose = { rootY: -0.32, thighL: [-0.8, 0, 0.1], thighR: [-0.8, 0, -0.1], shinL: [1.3, 0, 0], shinR: [1.3, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0], spine: [0.35, 0, 0], uarmL: [-0.3, 0, 0.3], uarmR: [-0.3, 0, -0.3], head: [0.3, 0, 0], gripL: 1, gripR: 1 };
  const ta: Pose = { rootY: 0.04, uarmL: [-0.6, 0, 1.9], farmL: [-0.2, 0, 0], uarmR: [-0.6, 0, -1.9], farmR: [-0.2, 0, 0], handL: [-1.3, 0, 0], handR: [-1.3, 0, 0], head: [-0.3, 0.15, 0.1], chest: [-0.2, 0, 0], thighR: [-0.25, 0.3, -0.15], shinR: [0.4, 0, 0], footR: [0.4, 0, 0], gripL: 0, gripR: 0 };
  const P = keyed(t, [[0, {}], [J.spin[0], crouch], [J.spin[1], crouch], [J.pop, ta], [d - 0.4, ta], [d, {}]]);
  if (t > J.spin[0] && t < J.pop) P.bodyYaw = sm((t - J.spin[0]) / (J.pop - J.spin[0])) * PI * 2;
  if (t > J.pop) { const sh = s(time * 30) * 0.25; P.handL = [-1.3, sh, 0]; P.handR = [-1.3, -sh, 0]; }
  return { pose: P, mask: ALL };
}, { legs: true });

/** scale a pose toward the rest pose (w 0 = rest) */
function fade(P: Pose, w: number): Pose {
  if (w >= 1) return P;
  const out: Pose = {};
  for (const [k, v] of Object.entries(P)) {
    if (Array.isArray(v)) { const r = REST[k] ?? [0, 0, 0]; (out as Record<string, unknown>)[k] = [r[0] + (v[0] - r[0]) * w, r[1] + (v[1] - r[1]) * w, r[2] + (v[2] - r[2]) * w]; }
    else if (typeof v === 'number') (out as Record<string, unknown>)[k] = k.startsWith('grip') ? v : v * w;
  }
  return out;
}

/** the names this module registers (for the catalog) */
export const MOVES = ['firework', 'robot', 'confetti', 'trombone', 'puppet', 'ghostchair', 'magic', 'jelly', 'beehat', 'airguitar', 'mime', 'faint', 'levitate', 'chicken', 'boxer', 'jazz'] as const;
