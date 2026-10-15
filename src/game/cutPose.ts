// Cutscene posing on top of the rig's own animator (src/entities/humanAnim.ts),
// for the intro's guards and debtor and for Staff Sergeant Voss:
//  - animSupported(name): does the animator know a named action ('dragged',
//    'beaten', 'fall_land', 'get_up', 'stagger', 'shocked', 'smash'...)? It is
//    probed once by running a throwaway animator, so these scripts use the
//    real animation when it exists and fall back to the poses below when not;
//  - fallbackPose(name, u, t): those poses, plus a few the scripts need for
//    themselves (cuffed hands, a baton chop, arms crossed, parade rest...);
//  - overlay(rig, pose, w): blend a pose onto a rig AFTER its animator ran;
//  - reachArm(rig, side, target, w): two-bone IK so a hand grips a point
//    (a guard's hand on the debtor's wrist).
// Everything here works on rotations already applied to the rig, so it never
// fights the animator; nothing allocates per frame.
import * as THREE from 'three';
import { HumanAnimator, AnimInput } from '../entities/humanAnim';
import type { HumanRig, Pose, JointName } from '../entities/humanRig';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ------------------------------------------------------------------ probing the animator
const support = new Map<string, boolean>();
const probeInput = (action: string): AnimInput => ({
  speed: 0, stance: 'stand', full: '', action: action as AnimInput['action'], actionT: 0.6, actionDur: 1.6, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
  aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0, fidget: false,
});
/** does the shared animator implement this action name (rather than ignoring it)? */
export function animSupported(name: string): boolean {
  const hit = support.get(name);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    const a = new HumanAnimator(), b = new HumanAnimator();
    (a as unknown as { seed: number }).seed = 3; (b as unknown as { seed: number }).seed = 3;
    let pa: Pose = {}, pb: Pose = {};
    for (let i = 0; i < 14; i++) { pa = a.update(1 / 30, probeInput(name)); pb = b.update(1 / 30, probeInput('')); }
    let d = Math.abs((pa.bodyPitch ?? 0) - (pb.bodyPitch ?? 0)) + Math.abs((pa.rootY ?? 0) - (pb.rootY ?? 0)) + Math.abs((pa.bodyRoll ?? 0) - (pb.bodyRoll ?? 0));
    for (const k of Object.keys(pa) as JointName[]) {
      const x = pa[k], y = pb[k];
      if (Array.isArray(x)) d += Math.abs(x[0] - (y?.[0] ?? 0)) + Math.abs(x[1] - (y?.[1] ?? 0)) + Math.abs(x[2] - (y?.[2] ?? 0));
    }
    ok = d > 0.2;
  } catch { ok = false; }
  support.set(name, ok);
  return ok;
}

// ------------------------------------------------------------------ fallback / scripted poses
type V = [number, number, number];
const P = (o: Partial<Record<JointName, V>> & Omit<Pose, JointName>): Pose => o as Pose;

/**
 * A pose for a named cutscene action. u = 0..1 progress for one-shots, t =
 * seconds (for loops: tremors, breathing), k = extra input (time since the
 * last blow for 'beaten', strike phase...). Unknown names return null.
 */
export function fallbackPose(name: string, u: number, t: number, k = 9): Pose | null {
  switch (name) {
    case 'cuffed': {
      // wrists cuffed in front, shoulders hunched
      const br = Math.sin(t * 1.7) * 0.02;
      return P({
        uarmL: [-0.38 + br, 0, -0.2], farmL: [-1.12, -0.62, 0], handL: [0.1, 0, 0.35],
        uarmR: [-0.38 + br, 0, 0.2], farmR: [-1.12, 0.62, 0], handR: [0.1, 0, -0.35],
        chest: [0.1, 0, 0], neck: [0.12, 0, 0], gripL: 0.5, gripR: 0.5,
      });
    }
    case 'dragged': {
      // on the back, hauled head-first by the wrists (the haulers are toward local -Z), heels trailing
      const sw = Math.sin(t * 5.4), bob = Math.sin(t * 2.7);
      return P({
        bodyPitch: -1.38 + bob * 0.03, bodyY: 0.2, bodyRoll: sw * 0.05,
        uarmL: [-2.95, 0, 0.22 + sw * 0.03], farmL: [-0.12, 0, 0], handL: [0.3, 0, 0],
        uarmR: [-2.95, 0, -0.22 - sw * 0.03], farmR: [-0.12, 0, 0], handR: [0.3, 0, 0],
        chest: [-0.12, 0, 0], neck: [0.1, 0, 0], head: [0.55 + bob * 0.06, sw * 0.25, 0.2],
        thighL: [-0.1 - Math.max(0, sw) * 0.12, 0, 0.1], shinL: [0.25 + Math.max(0, sw) * 0.2, 0, 0], footL: [0.55, 0, 0],
        thighR: [-0.18 - Math.max(0, -sw) * 0.12, 0, -0.06], shinR: [0.35 + Math.max(0, -sw) * 0.2, 0, 0], footR: [0.6, 0, 0],
        gripL: 0.4, gripR: 0.4, blink: 0.6,
      });
    }
    case 'beaten': {
      // curled on the side, arms wrapped over the head; each blow jolts the whole body
      const j = Math.exp(-k * 9) * (k < 0.6 ? 1 : 0);
      const tr = Math.sin(t * 37) * 0.015;
      return P({
        bodyPitch: -1.5708, bodyRoll: 1.45 + j * 0.18, bodyY: 0.17,
        spine: [0.45 + j * 0.25, 0, 0], chest: [0.3 + j * 0.2 + tr, 0, 0], neck: [0.3, 0, 0], head: [0.5 + j * 0.3, 0, 0.1],
        uarmL: [-2.35 - j * 0.3, 0.2, 0.55], farmL: [-2.2, 0, 0], handL: [0.4, 0, 0.3],
        uarmR: [-2.0 - j * 0.4, -0.2, -0.45], farmR: [-2.25, 0, 0], handR: [0.4, 0, -0.3],
        thighL: [-1.35 - j * 0.2, 0, 0.08], shinL: [1.85, 0, 0], footL: [0.3, 0, 0],
        thighR: [-1.15 - j * 0.25, 0, -0.06], shinR: [1.7, 0, 0], footR: [0.3, 0, 0],
        gripL: 0.9, gripR: 0.9, blink: j > 0.3 ? 1 : 0.7,
      });
    }
    case 'thrown': {
      // shoved: stumbling forward, arms out to catch the fall, then face down
      const a = ease(u / 0.45), c = ease((u - 0.45) / 0.35);
      return P({
        bodyPitch: lerp(0.35 * a, 1.5708, c), bodyY: 0.13 * c, rootY: -0.2 * a * (1 - c),
        spine: [0.3 * a * (1 - c), 0, 0], head: [-0.2 - 0.5 * c, 0.4 * c, 0],
        uarmL: [lerp(-1.4, -2.5, c), 0, 0.5], farmL: [-0.3, 0, 0], uarmR: [lerp(-1.3, -0.5, c), 0, -0.6], farmR: [-0.4, 0, 0],
        thighL: [-0.7 * a * (1 - c), 0, 0.1], shinL: [0.6 * a * (1 - c) + 0.1, 0, 0], thighR: [0.3 * a * (1 - c) - 0.3 * c, 0, -0.08], shinR: [0.9 * (1 - c) * a + 0.6 * c, 0, 0],
        footL: [0.7 * c, 0, 0], footR: [0.6 * c, 0, 0], gripL: 0.1, gripR: 0.1,
      });
    }
    case 'prone': {
      // face down on the floor, breathing hard
      const br = Math.sin(t * 3.2) * 0.04;
      return P({
        bodyPitch: 1.5708, bodyY: 0.13, chest: [br, 0, 0], head: [-0.25, 0.9, 0],
        uarmL: [-2.6, 0.2, 0.7], farmL: [-0.5, 0, 0], uarmR: [-0.5, 0, -0.9], farmR: [-0.3, 0, 0],
        thighL: [0.1, 0, 0.15], thighR: [-0.5, 0, -0.1], shinR: [0.9, 0, 0], footL: [0.8, 0, 0], footR: [0.6, 0, 0], gripL: 0.3, gripR: 0.3,
      });
    }
    case 'fall': {
      // falling: limbs flung up, slowly tumbling
      const s = Math.sin(t * 2.1), c2 = Math.cos(t * 1.7);
      return P({
        bodyPitch: -0.5 + s * 0.25, bodyRoll: c2 * 0.25,
        uarmL: [-2.6 + s * 0.3, 0, 0.9], farmL: [-0.4, 0, 0], uarmR: [-2.4 - s * 0.3, 0, -1.0], farmR: [-0.6, 0, 0],
        thighL: [-0.6 + c2 * 0.3, 0, 0.2], shinL: [0.8, 0, 0], thighR: [-0.2 - c2 * 0.3, 0, -0.2], shinR: [0.5, 0, 0],
        head: [0.35, 0, 0], spine: [-0.2, 0, 0], gripL: 0.2, gripR: 0.2,
      });
    }
    case 'fall_land': {
      // slammed into the floor: knees, hands, chest; a bounce; still
      const a = ease(u / 0.25), b = ease((u - 0.25) / 0.3), c = Math.sin(clamp01((u - 0.3) / 0.25) * Math.PI) * 0.12;
      return P({
        bodyPitch: lerp(0.4, 1.5708, b) - c, bodyY: 0.13 * b, rootY: -0.5 * a * (1 - b),
        spine: [0.5 * a * (1 - b), 0, 0], head: [-0.3 * b, 0.8 * b, 0],
        uarmL: [lerp(-1.6, -2.5, b), 0, 0.6], farmL: [-0.5 + 0.2 * b, 0, 0], uarmR: [lerp(-1.6, -0.6, b), 0, -0.7], farmR: [-0.6, 0, 0],
        thighL: [-1.2 * a * (1 - b), 0, 0.12], shinL: [1.5 * a * (1 - b) + 0.1, 0, 0], thighR: [-0.9 * a * (1 - b) - 0.4 * b, 0, -0.1], shinR: [1.4 * a * (1 - b) + 0.7 * b, 0, 0],
        footL: [0.7 * b, 0, 0], footR: [0.6 * b, 0, 0], gripL: 0.2, gripR: 0.2,
      });
    }
    case 'get_up': {
      // push up off the floor, onto one knee, up, a sway
      const a = ease(u / 0.35), b = ease((u - 0.3) / 0.35), c = ease((u - 0.65) / 0.35);
      const pitch = lerp(lerp(1.5708, 1.05, a), 0.25, b) * (1 - c);
      return P({
        bodyPitch: pitch, bodyY: 0.13 * (1 - b), rootY: lerp(-0.62 * b, 0, c) - 0.1 * (1 - a),
        spine: [lerp(0.2, 0.45, b) * (1 - c), 0, 0], head: [lerp(-0.6, 0.25, b) * (1 - c), 0.4 * (1 - a), 0],
        uarmL: [lerp(-1.45, -0.5, b) * (1 - c), 0, 0.25], farmL: [lerp(-0.35, -0.6, b) * (1 - c), 0, 0],
        uarmR: [lerp(-1.45, -0.2, b) * (1 - c), 0, -0.25], farmR: [lerp(-0.35, -0.9, b) * (1 - c), 0, 0],
        thighL: [lerp(-0.9 * a, -1.4, b) * (1 - c), 0, 0.06], shinL: [lerp(1.4 * a, 1.5, b) * (1 - c), 0, 0],
        thighR: [lerp(-1.3 * a, 0.15, b) * (1 - c), 0, -0.06], shinR: [lerp(1.6 * a, 1.6, b) * (1 - c), 0, 0],
        footR: [0.7 * b * (1 - c), 0, 0], gripL: 0.1, gripR: 0.1,
      });
    }
    case 'stagger': {
      // thrown off balance: lurching, arms windmilling
      const s = Math.sin(t * 7), c = Math.cos(t * 5);
      return P({
        spine: [0.35 + s * 0.08, s * 0.1, c * 0.1], chest: [0.1, -s * 0.15, 0], head: [0.2 + c * 0.15, s * 0.3, 0],
        uarmL: [-1.0 + s * 0.4, 0, 0.7 + c * 0.3], farmL: [-0.5, 0, 0], uarmR: [-0.8 - s * 0.4, 0, -0.8 - c * 0.3], farmR: [-0.6, 0, 0],
        gripL: 0.1, gripR: 0.1,
      });
    }
    case 'shocked': {
      // every muscle at once: rigid, arms clawed in, head back, knees going
      const tr = Math.sin(t * 61) * 0.06 + Math.sin(t * 43) * 0.04;
      const g = ease(u / 0.15) * (1 - ease((u - 0.8) / 0.2));
      return P({
        spine: [-0.25 * g + tr, 0, tr], chest: [-0.2 * g, 0, tr * 0.6], neck: [-0.2 * g, 0, 0], head: [-0.5 * g + tr * 2, tr * 3, tr],
        uarmL: [(-0.6 + tr) * g, 0.4 * g, 0.45 * g], farmL: [-2.1 * g, 0, 0], handL: [-0.8 * g, 0, 0],
        uarmR: [(-0.6 - tr) * g, -0.4 * g, -0.45 * g], farmR: [-2.1 * g, 0, 0], handR: [-0.8 * g, 0, 0],
        thighL: [-0.35 * g, 0, 0.1], shinL: [0.7 * g, 0, 0], thighR: [-0.3 * g, 0, -0.1], shinR: [0.65 * g, 0, 0],
        rootY: -0.14 * g, gripL: 1, gripR: 1,
      });
    }
    case 'baton_chop': {
      // a guard's overhead strike down at somebody on the floor: k = 0..1 through the swing
      const up = ease(k / 0.4), dn = ease((k - 0.4) / 0.2), rc = ease((k - 0.65) / 0.35);
      const arm = k < 0.4 ? lerp(-1.2, -3.0, up) : k < 0.65 ? lerp(-3.0, -0.9, dn) : lerp(-0.9, -1.1, rc);
      const fore = k < 0.4 ? lerp(-1.4, -1.6, up) : k < 0.65 ? lerp(-1.6, -0.25, dn) : lerp(-0.25, -0.9, rc);
      const bend = k < 0.4 ? lerp(0.05, -0.12, up) : k < 0.65 ? lerp(-0.12, 0.55, dn) : lerp(0.55, 0.3, rc);
      return P({
        uarmR: [arm, 0.15, -0.2], farmR: [fore, 0, 0], handR: [k < 0.4 ? -0.5 * up : lerp(-0.5, 0.9, dn), 0, 0],
        uarmL: [-0.5, 0, 0.45], farmL: [-1.1, 0, 0],
        spine: [0.12 + bend, 0, 0], chest: [bend * 0.5, -0.15, 0], head: [0.25 + bend * 0.4, 0.1, 0],
        thighL: [-0.35, 0, 0.08], shinL: [0.4, 0, 0], thighR: [0.15, 0, -0.08], shinR: [0.3, 0, 0], rootY: -0.06 - bend * 0.08,
        gripR: 1,
      });
    }
    case 'kick_low': {
      // a kick into somebody on the floor
      const a = ease(u / 0.35), b = ease((u - 0.35) / 0.2), c = ease((u - 0.6) / 0.4);
      const th = u < 0.35 ? lerp(0, 0.6, a) : u < 0.6 ? lerp(0.6, -1.0, b) : lerp(-1.0, 0, c);
      return P({
        thighR: [th, 0, -0.05], shinR: [u < 0.35 ? 1.2 * a : lerp(1.2, 0.2, b) * (1 - c), 0, 0], footR: [-0.4, 0, 0],
        spine: [0.15 - th * 0.12, 0, 0], uarmL: [-0.6, 0, 0.6], uarmR: [0.2, 0, -0.5], farmL: [-0.8, 0, 0], farmR: [-0.6, 0, 0], gripR: 1,
      });
    }
    case 'taser_aim': {
      // the taser held out at arm's length
      const tr = Math.sin(t * 9) * 0.01;
      return P({ uarmR: [-1.42 + tr, 0.12, -0.08], farmR: [-0.12, 0, 0], handR: [0.05, 0, 0], chest: [0.02, -0.18, 0], head: [0.05, 0.16, 0], uarmL: [-0.2, 0, 0.12], gripR: 1 });
    }
    case 'shove2': {
      // both hands into the back: plant, push, follow through
      const s = u < 0.3 ? ease(u / 0.3) : 1 - ease((u - 0.3) / 0.7);
      return P({
        uarmL: [lerp(-0.7, -1.55, s), -0.25, 0.1], farmL: [lerp(-1.5, -0.1, s), 0, 0], handL: [-1.0 * s, 0, 0],
        uarmR: [lerp(-0.7, -1.55, s), 0.25, -0.1], farmR: [lerp(-1.5, -0.1, s), 0, 0], handR: [-1.0 * s, 0, 0],
        spine: [0.3 * s, 0, 0], chest: [0.12 * s, 0, 0], thighL: [-0.5 * s, 0, 0.05], shinL: [0.4 * s, 0, 0], thighR: [0.3 * s, 0, -0.05], rootY: -0.06 * s,
        gripL: 0, gripR: 0,
      });
    }
    // ---- the handler's body language
    case 'arms_crossed': {
      const br = Math.sin(t * 1.4) * 0.015;
      return P({
        uarmL: [-0.62 + br, 0, -0.36], farmL: [-1.62, -1.0, 0], handL: [0, 0, 0.2],
        uarmR: [-0.56 + br, 0, 0.32], farmR: [-1.75, 1.05, 0], handR: [0, 0, -0.2],
        chest: [-0.05, 0, 0], head: [-0.06, 0, 0], gripL: 0.6, gripR: 0.6,
      });
    }
    case 'parade_rest': {
      return P({
        uarmL: [0.32, 0, -0.06], farmL: [-0.9, 0.4, 0], handL: [0, 0, 0.4],
        uarmR: [0.32, 0, 0.06], farmR: [-0.9, -0.4, 0], handR: [0, 0, -0.4],
        chest: [-0.06, 0, 0], head: [-0.04, 0, 0], thighL: [0, 0, 0.06], thighR: [0, 0, -0.06], gripL: 0.3, gripR: 0.6,
      });
    }
    case 'dismiss': {
      // a backhanded flick: go on, get out of here
      const s = Math.sin(clamp01(u) * Math.PI), f = Math.sin(clamp01(u) * Math.PI * 3) * s;
      return P({
        uarmR: [-0.9 * s, 0.3 * s, -0.35 * s], farmR: [-1.2 * s + f * 0.3, 0, 0], handR: [0.6 * f, 0, -0.5 * s],
        head: [0.02, -0.3 * s, 0.08 * s], chest: [0, -0.1 * s, 0], gripR: 0,
      });
    }
    case 'point_at': {
      const e = ease(u / 0.2) * (1 - ease((u - 0.85) / 0.15));
      return P({ uarmR: [-1.5 * e, 0.1, -0.12 * e], farmR: [-0.06, 0, 0], handR: [-0.1, 0, 0], chest: [0, -0.18 * e, 0], head: [0.02, 0.2 * e, 0], gripR: 0.8 });
    }
    case 'salute2': {
      const e = ease(u / 0.2) * (1 - ease((u - 0.8) / 0.2));
      return P({ uarmR: [-0.55 * e, 0.3, -1.35 * e], farmR: [-2.3 * e, 0, 0], handR: [0.3 * e, 0, -0.3 * e], chest: [-0.08 * e, 0, 0], head: [-0.05 * e, 0, 0], gripR: 0 });
    }
    case 'jab_finger': {
      // leaning in, stabbing a finger at you
      const j = Math.max(0, Math.sin(t * 6)) * 0.25;
      return P({ uarmR: [-1.25 - j * 0.3, 0.15, -0.1], farmR: [-0.35 + j, 0, 0], handR: [-0.2, 0, 0], spine: [0.12, 0, 0], chest: [0.06, -0.1, 0], head: [0.08, 0.12, 0], gripR: 0.85 });
    }
  }
  return null;
}

// ------------------------------------------------------------------ applying poses after the animator
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();
const JOINT_LIST: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

/**
 * Blend a (partial) pose onto a rig whose animator has already applied this
 * frame's pose. Joints the pose leaves out keep the animator's rotation;
 * rootY / body pitch etc. are blended relative to the animator's.
 */
export function overlay(rig: HumanRig, pose: Pose, w: number) {
  if (w <= 0.001) return;
  w = Math.min(1, w);
  for (const k of JOINT_LIST) {
    const r = pose[k];
    if (!r) continue;
    const g = rig.j[k];
    qa.copy(g.quaternion);
    qb.setFromEuler(eu.set(r[0], r[1], r[2]));
    g.quaternion.copy(qa.slerp(qb, w));
  }
  const ap = rig.anim.pose;
  if (pose.rootY !== undefined || pose.rootX !== undefined || pose.rootZ !== undefined) {
    const hp = rig.j.hips.position;
    hp.y += ((pose.rootY ?? ap.rootY ?? 0) - (ap.rootY ?? 0)) * w;
    hp.x += ((pose.rootX ?? ap.rootX ?? 0) - (ap.rootX ?? 0)) * w;
    hp.z += ((pose.rootZ ?? ap.rootZ ?? 0) - (ap.rootZ ?? 0)) * w;
  }
  const b = rig.body;
  if (pose.bodyPitch !== undefined) b.rotation.x = lerp(b.rotation.x, pose.bodyPitch, w);
  if (pose.bodyYaw !== undefined) b.rotation.y = lerp(b.rotation.y, pose.bodyYaw, w);
  if (pose.bodyRoll !== undefined) b.rotation.z = lerp(b.rotation.z, pose.bodyRoll, w);
  if (pose.bodyY !== undefined) b.position.y = lerp(b.position.y, pose.bodyY, w);
  const bones = rig.bones as Record<string, THREE.Object3D>;
  for (const [side, kk] of [['L', 1], ['R', -1]] as const) {
    const gv = side === 'L' ? pose.gripL : pose.gripR;
    if (gv === undefined) continue;
    const f1 = bones['fing1' + side], f2 = bones['fing2' + side];
    if (f1) f1.rotation.z = lerp(f1.rotation.z, -kk * gv * 1.45, w);
    if (f2) f2.rotation.z = lerp(f2.rotation.z, -kk * gv * 1.6, w);
  }
  if (pose.blink !== undefined && bones.lids) bones.lids.scale.y = Math.max(0.02, lerp(bones.lids.scale.y, pose.blink, w));
}

// ------------------------------------------------------------------ two-bone arm IK
const vS = new THREE.Vector3(), vE = new THREE.Vector3(), vH = new THREE.Vector3(), vD = new THREE.Vector3(), vP = new THREE.Vector3();
const vA = new THREE.Vector3(), vF = new THREE.Vector3(), vX = new THREE.Vector3(), vY = new THREE.Vector3(), vZ = new THREE.Vector3();
const qP = new THREE.Quaternion(), qT = new THREE.Quaternion(), mB = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Bend an arm so its hand (a little into the palm) reaches `target` (world).
 * `pole` (world direction) is where the elbow should point; default: down and
 * out to the side. Call after the animator and after rig.root.updateMatrixWorld(true).
 * Returns the reach error in metres (0 when the hand gets there).
 */
export function reachArm(rig: HumanRig, side: 'L' | 'R', target: THREE.Vector3, w = 1, pole?: THREE.Vector3): number {
  if (w <= 0.001) return 0;
  const ua = rig.j[side === 'L' ? 'uarmL' : 'uarmR'], fa = rig.j[side === 'L' ? 'farmL' : 'farmR'], ha = rig.j[side === 'L' ? 'handL' : 'handR'];
  const parent = ua.parent;
  if (!parent) return 0;
  ua.getWorldPosition(vS); fa.getWorldPosition(vE); ha.getWorldPosition(vH);
  const L1 = vS.distanceTo(vE), L2 = vE.distanceTo(vH) + 0.07;
  parent.getWorldQuaternion(qP).invert();
  vD.copy(target).sub(vS).applyQuaternion(qP);
  const dist = vD.length();
  const D = Math.min(Math.max(dist, 0.05), (L1 + L2) * 0.999);
  const u = vD.normalize();
  // elbow toward the pole
  if (pole) vP.copy(pole).applyQuaternion(qP);
  else { vP.set(side === 'L' ? 0.55 : -0.55, -1, -0.35); }
  vP.addScaledVector(u, -vP.dot(u));
  if (vP.lengthSq() < 1e-6) vP.copy(DOWN).addScaledVector(u, -DOWN.dot(u));
  vP.normalize();
  const cosB = Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D)));
  const beta = Math.acos(cosB);
  vA.copy(u).multiplyScalar(Math.cos(beta)).addScaledVector(vP, Math.sin(beta));   // upper arm direction
  vF.copy(u).multiplyScalar(D).addScaledVector(vA, -L1).normalize();                 // forearm direction
  // upper-arm frame: -Y along the bone, the elbow hinges about X, the forearm folds toward +Z
  vY.copy(vA).negate();
  vZ.copy(vF).addScaledVector(vA, -vF.dot(vA));
  if (vZ.lengthSq() < 1e-6) vZ.set(0, 0, 1).addScaledVector(vA, -vA.z);
  vZ.normalize();
  vX.crossVectors(vY, vZ).normalize();
  vZ.crossVectors(vX, vY);
  mB.makeBasis(vX, vY, vZ);
  qT.setFromRotationMatrix(mB);
  ua.quaternion.slerp(qT, w);
  const bend = Math.acos(Math.max(-1, Math.min(1, vA.dot(vF))));
  qT.setFromEuler(eu.set(-bend, 0, 0));
  fa.quaternion.slerp(qT, w);
  return Math.max(0, dist - (L1 + L2));
}

/** world position of a rig's grip point (palm) */
export function palm(rig: HumanRig, side: 'L' | 'R', out: THREE.Vector3) {
  const h = rig.j[side === 'L' ? 'handL' : 'handR'];
  return out.set(0, -0.06, 0.01).applyMatrix4(h.matrixWorld);
}
export { clamp01, ease, lerp };
