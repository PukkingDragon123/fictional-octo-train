// Fallback emote poses for the personnel-file preview, layered over the
// rig's idle animation through the plain Pose API. Used when the rig itself
// does not offer playEmote(). Joint conventions (see humanAnim.ts): uarm x<0
// raises the arm forward, uarmL z>0 / uarmR z<0 lifts it sideways, farm x<0
// bends the elbow, thigh x<0 lifts the leg forward, shin x>0 bends the knee,
// head x>0 looks down.
import type { Pose, JointName } from '../../entities/humanRig';

type V3 = [number, number, number];
export interface EmoteDef { dur: number; label: string; pose: (t: number, d: number) => Pose }

const PI = Math.PI;
const s = Math.sin, c = Math.cos;
const ab = Math.abs;

export const EMOTES: Record<string, EmoteDef> = {
  wave: {
    dur: 2.4, label: 'WAVE',
    pose: (t) => ({
      uarmR: [-0.3, 0, -2.45], farmR: [-0.25, 0, -0.25 + s(t * 11) * 0.55], handR: [0, 0, s(t * 11 + 0.6) * 0.3],
      uarmL: [0.05, 0, 0.12], farmL: [-0.2, 0, 0],
      head: [-0.05, -0.12, -0.12 + s(t * 2.2) * 0.04], chest: [-0.04, -0.1, 0.05], hips: [0, 0.08, 0],
    }),
  },
  flex: {
    dur: 2.6, label: 'FLEX',
    pose: (t) => {
      const pump = 0.12 * (0.5 + 0.5 * s(t * 7));
      return {
        uarmL: [-0.25, 0, 1.45], farmL: [-0.3, 0, 1.55 + pump], handL: [0, 0, 0.3],
        uarmR: [-0.25, 0, -1.45], farmR: [-0.3, 0, -1.55 - pump], handR: [0, 0, -0.3],
        chest: [-0.12, 0, 0], spine: [-0.06, 0, 0], head: [-0.12, s(t * 1.5) * 0.25, 0],
        thighL: [-0.05, 0, 0.12], thighR: [-0.05, 0, -0.12], shinL: [0.12, 0, 0], shinR: [0.12, 0, 0], footL: [0, 0, -0.12], footR: [0, 0, 0.12],
        rootY: -0.035,
      };
    },
  },
  dance: {
    dur: 5, label: 'DANCE',
    pose: (t) => {
      const w = 2 * PI * 2.1;
      const b = s(t * w), half = s(t * w * 0.5);
      const flip = Math.floor(t * 2.1) % 2 === 0;
      const p: Pose = {
        hips: [0, half * 0.3, b * 0.09], spine: [0.04, -half * 0.18, -b * 0.05], chest: [0, -half * 0.12, -b * 0.05],
        head: [0.06 * b, half * 0.2, b * 0.08],
        thighL: [-0.18 * ab(b), 0, 0.06], thighR: [-0.18 * ab(c(t * w)), 0, -0.06], shinL: [0.36 * ab(b), 0, 0], shinR: [0.36 * ab(c(t * w)), 0, 0],
        rootY: -0.05 + 0.035 * ab(b),
      };
      if (t < 2.2) {
        // point to the ceiling, then to the floor
        p.uarmR = flip ? [-0.2, 0, -2.7] : [-0.5, 0, -0.35]; p.farmR = [0, 0, flip ? -0.1 : 0.2];
        p.uarmL = [0.11, 0, 0.69]; p.farmL = [-1.12, 0, -1.32]; p.handL = [0, 0, -0.4]; // hand on hip
      } else {
        // pump both fists
        p.uarmL = [-0.75 + b * 0.45, 0, 0.25]; p.farmL = [-1.5, 0, 0];
        p.uarmR = [-0.75 - b * 0.45, 0, -0.25]; p.farmR = [-1.5, 0, 0];
      }
      return p;
    },
  },
  jacks: {
    dur: 4, label: 'JUMPING JACKS',
    pose: (t) => {
      const w = 2 * PI * 1.3;
      const u = (1 - c(t * w)) / 2;
      return {
        uarmL: [-0.05, 0, 0.15 + u * 2.75], farmL: [0, 0, u * 0.35], uarmR: [-0.05, 0, -0.15 - u * 2.75], farmR: [0, 0, -u * 0.35],
        thighL: [0, 0, 0.04 + u * 0.3], thighR: [0, 0, -0.04 - u * 0.3], footL: [0, 0, -u * 0.3], footR: [0, 0, u * 0.3],
        shinL: [0.1 * (1 - u), 0, 0], shinR: [0.1 * (1 - u), 0, 0],
        rootY: 0.09 * ab(s(t * w)) - 0.02, head: [-0.05 * u, 0, 0], chest: [-0.05 * u, 0, 0],
      };
    },
  },
  shrug: {
    dur: 2.0, label: 'SHRUG',
    pose: (t) => {
      const k = Math.min(1, t * 4) * Math.min(1, (2.0 - t) * 3);
      return {
        uarmL: [-0.2, 0.55, 0.32 + 0.1 * k], farmL: [-1.35, 0, 0], handL: [0, 0, 0.6],
        uarmR: [-0.2, -0.55, -0.32 - 0.1 * k], farmR: [-1.35, 0, 0], handR: [0, 0, -0.6],
        neck: [0, 0, 0.12], head: [-0.06, 0.1, 0.22 * k], chest: [-0.06, 0, 0], rootY: 0.01 * k,
      };
    },
  },
  salute: {
    dur: 2.4, label: 'SALUTE',
    pose: () => ({
      uarmR: [-0.2, 0.77, -1.53], farmR: [-2.45, 0, -0.56], handR: [0, 0.2, -0.25],
      uarmL: [0.04, 0, 0.05], farmL: [-0.05, 0, 0],
      chest: [-0.08, 0, 0], head: [-0.06, 0, 0], thighL: [0, 0, 0.02], thighR: [0, 0, -0.02], rootY: 0.01,
    }),
  },
  // short reactions to edits
  nod: { dur: 1.0, label: 'NOD', pose: (t) => ({ head: [0.18 + s(t * 12) * 0.22, 0, 0], neck: [0.06, 0, 0] }) },
  look: {
    dur: 1.8, label: 'CHECK FIT',
    pose: (t) => ({
      head: [0.5, s(t * 2.6) * 0.35, 0], neck: [0.15, 0, 0], spine: [0.08, 0, 0],
      uarmL: [-0.25, 0, 0.42], farmL: [-0.7, 0, 0], uarmR: [-0.25, 0, -0.42], farmR: [-0.7, 0, 0], hips: [0, s(t * 2.6) * 0.25, 0],
    }),
  },
  clap: { dur: 2.6, label: 'CLAP', pose: (t) => ({ uarmL: [-0.9, 0, 0.25], farmL: [-1.2, 0, -0.5 - 0.35 * ab(s(t * 9))], uarmR: [-0.9, 0, -0.25], farmR: [-1.2, 0, 0.5 + 0.35 * ab(s(t * 9))], head: [0.05, 0, 0] }) },
  bow: { dur: 2.0, label: 'BOW', pose: (t) => { const k = Math.min(1, t * 2.5) * Math.min(1, (2 - t) * 2.5); return { spine: [0.55 * k, 0, 0], chest: [0.25 * k, 0, 0], head: [0.2 * k, 0, 0], uarmR: [-0.6 * k, 0, -0.2], farmR: [-1.2 * k, 0, 0.3 * k] }; } },
  point: { dur: 2.2, label: 'POINT', pose: () => ({ uarmR: [-1.45, 0.25, -0.15], farmR: [-0.1, 0, 0], head: [0, -0.15, 0], chest: [0, -0.2, 0] }) },
  cheer: {
    dur: 1.6, label: 'CHEER',
    pose: (t) => ({
      uarmL: [-0.15, 0, 2.7], farmL: [0, 0, 0.25 + s(t * 14) * 0.25], uarmR: [-0.15, 0, -2.7], farmR: [0, 0, -0.25 - s(t * 14) * 0.25],
      head: [-0.25, 0, 0], chest: [-0.1, 0, 0], rootY: 0.07 * ab(s(t * 7)),
    }),
  },
};

// ---- intake processing: the subject under the lights
Object.assign(EMOTES, {
  flinch: {
    dur: 1.1, label: 'FLINCH',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 9) * Math.min(1, (d - t) * 2.2);
      return {
        uarmR: [-1.9 * k, 0.3 * k, -0.5 * k], farmR: [-1.6 * k, 0, 0.3 * k], handR: [0, 0, 0.4 * k],
        uarmL: [-0.6 * k, 0, 0.3 * k], farmL: [-1.2 * k, 0, 0],
        head: [0.35 * k, 0.55 * k, 0.12 * k], neck: [0.1 * k, 0.15 * k, 0], chest: [0.12 * k, 0.15 * k, 0], spine: [0.08 * k, 0, 0],
        rootY: -0.04 * k, blink: k, gripR: 0.6 * k,
      };
    },
  },
  wipe: {
    dur: 1.8, label: 'WIPES FACE',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 4) * Math.min(1, (d - t) * 3);
      const sw = s(t * 5.5) * 0.35;
      return {
        uarmR: [-1.35 * k, 0.4 * k, -0.25 * k + sw * 0.2 * k], farmR: [-2.0 * k, 0, 0.2 * k], handR: [0.2 * k, sw * k, 0.3 * k],
        head: [0.15 * k, -sw * 0.3 * k, 0], neck: [0.05 * k, 0, 0], blink: 0.85 * k, gripR: 0.1,
      };
    },
  },
  stretch: {
    dur: 2.6, label: 'STRETCH',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 2) * Math.min(1, (d - t) * 2);
      return {
        uarmL: [-0.2 * k, 0, 2.75 * k], farmL: [0, 0, 0.5 * k], uarmR: [-0.2 * k, 0, -2.75 * k], farmR: [0, 0, -0.5 * k],
        chest: [-0.22 * k, 0, 0], spine: [-0.1 * k, 0, 0], head: [-0.35 * k, 0, 0], rootY: 0.02 * k, blink: 0.9 * k,
        gripL: 0, gripR: 0,
      };
    },
  },
  stare: {
    dur: 3.2, label: 'STARES',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 2) * Math.min(1, (d - t) * 2);
      return { head: [0.16 * k, 0, 0], neck: [0.08 * k, 0, 0], chest: [-0.04 * k, 0, 0], uarmL: [0.05, 0, 0.06], uarmR: [0.05, 0, -0.06], gripL: 0.85 * k, gripR: 0.85 * k, blink: 0 };
    },
  },
  look_around: {
    dur: 2.6, label: 'LOOKS AROUND',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 3) * Math.min(1, (d - t) * 3);
      const y = (t < 0.9 ? 0.75 : t < 1.6 ? -0.8 : 0.3) * k;
      return { head: [0.05, y, 0], neck: [0, y * 0.4, 0], chest: [0, y * 0.15, 0] };
    },
  },
  crack_neck: {
    dur: 1.5, label: 'CRACKS NECK',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 4) * Math.min(1, (d - t) * 3);
      const side = t < 0.75 ? 1 : -1;
      return { head: [0.05, 0, 0.42 * side * k], neck: [0, 0, 0.2 * side * k], blink: 0.7 * k };
    },
  },
  scratch_wrist: {
    dur: 1.9, label: 'PICKS AT THE BAND',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 4) * Math.min(1, (d - t) * 3);
      const sc = s(t * 22) * 0.12 * k;
      return {
        uarmL: [-0.55 * k, 0, 0.12], farmL: [-1.35 * k, 0, -0.35 * k], handL: [0, 0, 0],
        uarmR: [-0.5 * k, 0, -0.05], farmR: [-1.25 * k, 0, 0.55 * k + sc], handR: [0, 0, 0.3 * k],
        head: [0.5 * k, -0.15 * k, 0], neck: [0.15 * k, 0, 0], gripR: 0.6,
      };
    },
  },
  turn_head: {
    dur: 2.4, label: 'TURNS',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 3) * Math.min(1, (d - t) * 3);
      const y = (t < 1.2 ? 1.15 : -1.15) * k;
      return { head: [0, y, 0], neck: [0, y * 0.35, 0] };
    },
  },
  touch_hair: {
    dur: 2.0, label: 'FIXES HAIR',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 3) * Math.min(1, (d - t) * 3);
      return { uarmR: [-1.0 * k, 0.4 * k, -1.35 * k], farmR: [-2.3 * k, 0, 0], handR: [s(t * 9) * 0.25 * k, 0, 0.5 * k], head: [0.15 * k, 0.2 * k, 0], gripR: 0.2 };
    },
  },
  look_down: {
    dur: 2.0, label: 'LOOKS DOWN',
    pose: (t: number, d: number) => {
      const k = Math.min(1, t * 3) * Math.min(1, (d - t) * 3);
      return { head: [0.6 * k, 0, 0], neck: [0.2 * k, 0, 0], chest: [0.08 * k, 0, 0], thighL: [-0.25 * k, 0, 0.04], shinL: [0.3 * k, 0, 0], footL: [-0.2 * k, 0, 0] };
    },
  },
});

/** held stances while a body part is examined (looped, blended over the idle) */
export const HOLD_POSES: Record<string, Pose> = {
  head: { head: [-0.02, 0, 0], neck: [0, 0, 0] },
  hair: { head: [0.32, 0, 0], neck: [0.12, 0, 0], chest: [0.06, 0, 0] },
  torso: { uarmL: [0.02, 0, 0.42], uarmR: [0.02, 0, -0.42], farmL: [-0.15, 0, 0], farmR: [-0.15, 0, 0], gripL: 0.1, gripR: 0.1 },
  armL: { uarmL: [-0.45, 0, 0.55], farmL: [-0.35, 0, 0], handL: [0, 0, 0.2], head: [0.2, 0.55, 0], gripL: 0.15 },
  armR: { uarmR: [-0.45, 0, -0.55], farmR: [-0.35, 0, 0], handR: [0, 0, -0.2], head: [0.2, -0.55, 0], gripR: 0.15 },
  hands: { uarmL: [-0.62, 0, 0.12], farmL: [-1.05, 0, -0.15], handL: [0, 0, 0], uarmR: [-0.62, 0, -0.12], farmR: [-1.05, 0, 0.15], handR: [0, 0, 0], head: [0.45, 0, 0], gripL: 0.08, gripR: 0.08 },
  legs: { uarmL: [0.05, 0, 0.2], uarmR: [0.05, 0, -0.2], thighL: [0, 0, 0.06], thighR: [0, 0, -0.06], footL: [0, 0, -0.06], footR: [0, 0, 0.06] },
  feet: { head: [0.55, 0, 0], neck: [0.2, 0, 0], thighR: [-0.22, 0, -0.02], shinR: [0.18, 0, 0], footR: [-0.05, 0, 0] },
  board: { uarmL: [-0.55, -0.3, 0.12], farmL: [-1.15, 0, -0.55], handL: [0, 0, 0], uarmR: [-0.55, 0.3, -0.12], farmR: [-1.15, 0, 0.55], handR: [0, 0, 0], head: [-0.05, 0, 0], gripL: 0.75, gripR: 0.75 },
};

export const EMOTE_CYCLE = ['wave', 'flex', 'dance', 'jacks', 'shrug', 'salute'];
/** what a prisoner does while they wait under the lights */
export const INTAKE_IDLES = ['stare', 'wipe', 'stretch', 'look_around', 'crack_neck', 'scratch_wrist', 'stare', 'shrug'];

const JOINTS: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const SCALARS = ['rootY', 'rootZ', 'bodyPitch', 'bodyRoll', 'bodyY', 'gripL', 'gripR', 'blink'] as const;

/** blend an emote pose over a base pose (weight 0..1); joints the emote doesn't mention keep the base */
export function blendPose(base: Pose, over: Pose, w: number): Pose {
  if (w <= 0) return base;
  const out: Pose = { ...base };
  for (const k of JOINTS) {
    const o = over[k];
    if (!o) continue;
    const b = (base[k] || [0, 0, 0]) as V3;
    out[k] = [b[0] + (o[0] - b[0]) * w, b[1] + (o[1] - b[1]) * w, b[2] + (o[2] - b[2]) * w];
  }
  for (const k of SCALARS) {
    if (over[k] !== undefined) out[k] = (base[k] ?? 0) + ((over[k] as number) - (base[k] ?? 0)) * w;
  }
  return out;
}
