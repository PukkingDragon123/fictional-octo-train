import { Pose, JointName, JOINTS } from './humanRig';
import { clamp, lerp } from '../core/math';

/**
 * Procedural animation for segmented humans. A locomotion base layer
 * (idle / walk / run / sneak / swim / limp) is phase-driven by distance
 * travelled; an action layer (attacks, eating, looting, hammering, holding the
 * scanner...) blends over it with per-joint masks; full-body states (sit, lie,
 * dead, downed, carried, vault) replace everything.
 */

export type Stance = 'stand' | 'sneak' | 'swim' | 'crawl';
export type FullBody = '' | 'sit' | 'lie' | 'dead' | 'downed' | 'carried' | 'vault' | 'kneel' | 'drive' | 'fall' | 'lie_side';
export type ActionAnim =
  | '' | 'aim_melee' | 'aim_gun' | 'aim_throw' | 'swing' | 'swing2h' | 'stab' | 'shoot' | 'throw' | 'shove' | 'eat' | 'drink'
  | 'loot' | 'pickup' | 'craft' | 'hammer' | 'saw' | 'read' | 'scanner' | 'carry' | 'push' | 'bandage' | 'dig' | 'pour'
  | 'flinch' | 'shiver' | 'cough' | 'wave' | 'hold_light' | 'hold_item' | 'type' | 'pray' | 'cover_ears' | 'reload';

export interface AnimInput {
  speed: number;          // horizontal m/s
  stance: Stance;
  full: FullBody;
  action: ActionAnim;
  actionT: number;        // seconds into action
  actionDur: number;      // action duration (for one-shots)
  twoHanded: boolean;
  limp: number;           // 0..1 leg injury
  tired: number;          // 0..1
  panic: number;          // 0..1
  cold: number;           // 0..1 shiver
  aimPitch: number;       // radians
  holdingLight: boolean;
  holding: boolean;
  lookYaw: number;        // head yaw offset
}

const Z: [number, number, number] = [0, 0, 0];
const ADD = (a: [number, number, number] | undefined, b: [number, number, number]): [number, number, number] => a ? [a[0] + b[0], a[1] + b[1], a[2] + b[2]] : [b[0], b[1], b[2]];

const UPPER: JointName[] = ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const ARMS_R: JointName[] = ['uarmR', 'farmR', 'handR'];

export class HumanAnimator {
  phase = 0;
  private time = 0;
  private actW = 0;
  private lastAction: ActionAnim = '';
  private fullW = 0;
  private lastFull: FullBody = '';
  private walkW = 0; private runW = 0; private sneakW = 0;
  private idleLook = 0; private idleLookT = 0;
  pose: Pose = {};

  update(dt: number, inp: AnimInput): Pose {
    this.time += dt;
    const t = this.time;
    // stride: walking ~1.4 m per cycle, running ~2.2
    const stride = inp.speed > 3 ? 2.3 : inp.stance === 'sneak' ? 1.0 : 1.35;
    this.phase += (inp.speed / stride) * Math.PI * 2 * dt;
    const k = 1 - Math.exp(-10 * dt);
    const wantWalk = inp.speed > 0.15 ? clamp(inp.speed / 1.8, 0, 1) : 0;
    const wantRun = clamp((inp.speed - 2.4) / 1.6, 0, 1);
    this.walkW = lerp(this.walkW, wantWalk, k);
    this.runW = lerp(this.runW, wantRun, k);
    this.sneakW = lerp(this.sneakW, inp.stance === 'sneak' ? 1 : 0, k);

    // ---------------- base locomotion ----------------
    const p: Pose = {};
    const ph = this.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    // idle breathing & weight shift
    const br = Math.sin(t * 1.8) * 0.02 * (1 + inp.tired);
    p.chest = [-br * 0.5, 0, 0];
    p.uarmL = [0.02, 0, 0.06 + br * 0.3]; p.uarmR = [0.02, 0, -0.06 - br * 0.3];
    p.farmL = [-0.12, 0, 0]; p.farmR = [-0.12, 0, 0];
    p.hips = [0, 0, Math.sin(t * 0.7) * 0.015];
    // occasional idle look-around
    this.idleLookT -= dt;
    if (this.idleLookT <= 0) { this.idleLookT = 2 + Math.random() * 4; this.idleLook = (Math.random() - 0.5) * (inp.panic > 0.3 ? 1.6 : 0.8); }
    const look = inp.speed < 0.2 ? this.idleLook * (0.5 + 0.5 * Math.sin(t * 0.9)) : 0;
    p.head = [0.05 + inp.tired * 0.15, look + inp.lookYaw, 0];
    if (inp.tired > 0.5) { p.spine = [0.08 * inp.tired, 0, 0]; }

    if (inp.stance === 'swim') {
      p.bodyPitch = 1.2; p.bodyY = 0.35; p.rootY = -0.2;
      const sw = Math.sin(t * 3);
      p.uarmL = [-1.8 + sw * 0.9, 0, 0.3]; p.uarmR = [-1.8 - sw * 0.9, 0, -0.3];
      p.thighL = [sw * 0.4, 0, 0]; p.thighR = [-sw * 0.4, 0, 0];
      p.head = [-1.0, 0, 0];
    } else if (inp.stance === 'crawl') {
      p.bodyPitch = 1.45; p.bodyY = 0.12; p.rootY = -0.85;
      p.uarmL = [-2.6 + s * 0.4, 0, 0.2]; p.uarmR = [-2.6 - s * 0.4, 0, -0.2];
      p.thighL = [s * 0.3, 0, 0]; p.thighR = [-s * 0.3, 0, 0];
      p.shinL = [0.4, 0, 0]; p.shinR = [0.4, 0, 0];
      p.head = [-1.1, 0, 0];
    } else {
      const w = this.walkW, r = this.runW, sn = this.sneakW;
      const limp = inp.limp;
      const ampL = (0.46 + r * 0.45) * w * (1 - sn * 0.3);
      const ampR = ampL * (1 - limp * 0.55);
      p.thighL = [-s * ampL - sn * 0.55, 0, 0];
      p.thighR = [s * ampR - sn * 0.55, 0, 0];
      p.shinL = [Math.max(0, -c) * (0.7 + r * 0.7) * w + sn * 0.95, 0, 0];
      p.shinR = [Math.max(0, c) * (0.7 + r * 0.7) * w * (1 - limp * 0.4) + sn * 0.95, 0, 0];
      p.footL = [-(p.shinL[0]) * 0.4 + p.thighL[0] * -0.2, 0, 0];
      p.footR = [-(p.shinR[0]) * 0.4 + p.thighR[0] * -0.2, 0, 0];
      const armAmp = (0.38 + r * 0.55) * w;
      p.uarmL = ADD(p.uarmL, [s * armAmp - sn * 0.25, 0, 0]);
      p.uarmR = ADD(p.uarmR, [-s * armAmp - sn * 0.25, 0, 0]);
      p.farmL = [-0.15 - r * 1.1 * w - sn * 0.6, 0, 0];
      p.farmR = [-0.15 - r * 1.1 * w - sn * 0.6, 0, 0];
      p.spine = ADD(p.spine, [r * 0.18 * w + sn * 0.35, -s * 0.06 * w, 0]);
      p.rootY = -Math.abs(Math.cos(ph)) * 0.035 * w * (1 + r) + 0.02 * w - sn * 0.28 - limp * Math.max(0, s) * 0.05 * w;
      p.hips = [sn * 0.05, s * 0.08 * w, limp * s * 0.06 * w];
      if (inp.panic > 0.5 && w < 0.2) { p.uarmL = ADD(p.uarmL, [-0.2, 0, 0.1]); p.uarmR = ADD(p.uarmR, [-0.2, 0, -0.1]); }
    }
    if (inp.cold > 0.2) {
      const sh = Math.sin(t * 40) * 0.02 * inp.cold;
      p.uarmL = ADD(p.uarmL, [-0.5 * inp.cold, 0, -0.35 * inp.cold + sh]); p.farmL = ADD(p.farmL, [-1.2 * inp.cold, 0.4 * inp.cold, 0]);
      p.uarmR = ADD(p.uarmR, [-0.5 * inp.cold, 0, 0.35 * inp.cold - sh]); p.farmR = ADD(p.farmR, [-1.2 * inp.cold, -0.4 * inp.cold, 0]);
      p.chest = ADD(p.chest, [0.1 * inp.cold, 0, sh]);
    }
    if (inp.holdingLight && !inp.action) {
      p.uarmR = [-0.75 + Math.sin(t * 2) * 0.02, 0, -0.08];
      p.farmR = [-0.35, 0, 0];
    }

    // ---------------- action layer ----------------
    const act = inp.action;
    if (act) this.lastAction = act;
    this.actW = lerp(this.actW, act ? 1 : 0, 1 - Math.exp(-14 * dt));
    if (this.actW > 0.01 && this.lastAction) {
      const a = actionPose(this.lastAction, inp.actionT, inp.actionDur, inp, t);
      const mask = a.mask || UPPER;
      for (const jn of mask) {
        const v = a.pose[jn];
        if (!v) continue;
        const b = p[jn] || Z;
        p[jn] = [lerp(b[0], v[0], this.actW), lerp(b[1], v[1], this.actW), lerp(b[2], v[2], this.actW)];
      }
      if (a.pose.rootY !== undefined) p.rootY = lerp(p.rootY ?? 0, a.pose.rootY, this.actW);
    }

    // ---------------- full-body states ----------------
    if (inp.full) this.lastFull = inp.full;
    this.fullW = lerp(this.fullW, inp.full ? 1 : 0, 1 - Math.exp(-8 * dt));
    if (this.fullW > 0.01 && this.lastFull) {
      const f = fullPose(this.lastFull, t, inp);
      const w = this.fullW;
      for (const jn of JOINTS) {
        const v = f[jn] || Z; const b = p[jn] || Z;
        p[jn] = [lerp(b[0], v[0], w), lerp(b[1], v[1], w), lerp(b[2], v[2], w)];
      }
      p.rootY = lerp(p.rootY ?? 0, f.rootY ?? 0, w);
      p.bodyPitch = lerp(p.bodyPitch ?? 0, f.bodyPitch ?? 0, w);
      p.bodyRoll = lerp(p.bodyRoll ?? 0, f.bodyRoll ?? 0, w);
      p.bodyY = lerp(p.bodyY ?? 0, f.bodyY ?? 0, w);
      p.rootZ = lerp(p.rootZ ?? 0, f.rootZ ?? 0, w);
    }
    this.pose = p;
    return p;
  }
}

function actionPose(a: ActionAnim, t: number, dur: number, inp: AnimInput, time: number): { pose: Pose; mask?: JointName[] } {
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 0;
  const P: Pose = {};
  const ap = inp.aimPitch;
  switch (a) {
    case 'aim_melee':
      if (inp.twoHanded) {
        P.uarmR = [-0.9, 0.3, -0.2]; P.farmR = [-1.3, 0, 0]; P.uarmL = [-0.9, -0.6, 0.3]; P.farmL = [-1.2, 0, 0];
        P.chest = [0, 0.35, 0]; P.spine = [0.1, 0.1, 0];
      } else {
        P.uarmR = [-1.3, 0, -0.35]; P.farmR = [-1.0, 0, 0]; P.uarmL = [-0.5, 0, 0.2]; P.farmL = [-0.9, 0, 0];
        P.chest = [0, 0.2, 0];
      }
      return { pose: P };
    case 'swing': case 'swing2h': {
      // windup 0-0.35, strike 0.35-0.6, recover
      const two = a === 'swing2h' || inp.twoHanded;
      let tw: number, arm: number, fore: number;
      if (u < 0.35) { const k = u / 0.35; tw = lerp(0.3, 0.9, k); arm = lerp(-1.2, -2.0, k); fore = lerp(-1.0, -1.6, k); }
      else if (u < 0.6) { const k = (u - 0.35) / 0.25; tw = lerp(0.9, -0.9, k * k); arm = lerp(-2.0, -1.0, k); fore = lerp(-1.6, -0.2, k); }
      else { const k = (u - 0.6) / 0.4; tw = lerp(-0.9, 0.2, k); arm = lerp(-1.0, -1.1, k); fore = lerp(-0.2, -0.9, k); }
      P.chest = [0, tw, 0]; P.spine = [0.12, tw * 0.4, 0];
      P.uarmR = [arm, 0.2, -0.5]; P.farmR = [fore, 0, 0];
      if (two) { P.uarmL = [arm + 0.2, -0.5, 0.4]; P.farmL = [fore, 0, 0]; }
      else { P.uarmL = [-0.4, 0, 0.3]; P.farmL = [-0.8, 0, 0]; }
      return { pose: P };
    }
    case 'stab': {
      const k = u < 0.4 ? u / 0.4 : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      P.uarmR = [lerp(-0.6, -1.55, k), 0, -0.15]; P.farmR = [lerp(-1.6, -0.05, k), 0, 0];
      P.chest = [0.05, lerp(0.3, -0.25, k), 0]; P.spine = [0.1 + k * 0.1, 0, 0];
      P.uarmL = [-0.4, 0, 0.25]; P.farmL = [-1.0, 0, 0];
      return { pose: P };
    }
    case 'shove': {
      const k = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7;
      P.uarmL = [lerp(-0.7, -1.5, k), 0, 0.1]; P.farmL = [lerp(-1.4, -0.1, k), 0, 0];
      P.uarmR = [lerp(-0.7, -1.5, k), 0, -0.1]; P.farmR = [lerp(-1.4, -0.1, k), 0, 0];
      P.spine = [0.15 * k, 0, 0];
      return { pose: P };
    }
    case 'aim_gun':
      P.uarmR = [-1.55 - ap * 0.5, 0.05, -0.05]; P.farmR = [-0.05, 0, 0];
      P.uarmL = [-1.35 - ap * 0.5, -0.45, 0.25]; P.farmL = [-0.55, 0, 0];
      P.head = [0.05, 0.08, 0];
      return { pose: P };
    case 'shoot': {
      const kick = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
      P.uarmR = [-1.55 - kick * 0.25, 0.05, -0.05]; P.farmR = [-0.05 - kick * 0.2, 0, 0];
      P.uarmL = [-1.35 - kick * 0.2, -0.45, 0.25]; P.farmL = [-0.55, 0, 0];
      return { pose: P };
    }
    case 'aim_throw':
      P.uarmR = [-2.6, 0, -0.3]; P.farmR = [-1.2, 0, 0]; P.chest = [0, 0.4, 0]; P.uarmL = [-1.0, 0, 0.3];
      return { pose: P };
    case 'throw': {
      const k = u < 0.4 ? 0 : clamp((u - 0.4) / 0.3, 0, 1);
      P.uarmR = [lerp(-2.6, -0.8, k), 0, -0.3]; P.farmR = [lerp(-1.4, -0.1, k), 0, 0];
      P.chest = [0.1 * k, lerp(0.5, -0.5, k), 0]; P.uarmL = [lerp(-1.0, -0.2, k), 0, 0.3];
      return { pose: P };
    }
    case 'eat': case 'drink': {
      const bite = Math.sin(t * (a === 'eat' ? 7 : 3)) * 0.5 + 0.5;
      P.uarmR = [-1.0 - bite * 0.25, 0.2, -0.35]; P.farmR = [-2.0 - bite * 0.2, 0, 0];
      P.head = [a === 'drink' ? -0.4 : 0.1, 0, 0];
      P.uarmL = [-0.4, 0, 0.2]; P.farmL = [-1.2, 0, 0];
      return { pose: P };
    }
    case 'loot': case 'pickup': {
      const r = Math.sin(t * 5) * 0.25;
      P.rootY = a === 'pickup' ? -0.45 * Math.sin(u * Math.PI) : -0.42;
      P.spine = [0.5, 0, 0]; P.chest = [0.2, r * 0.2, 0];
      P.uarmR = [-1.1 + r, 0, -0.1]; P.farmR = [-0.6 - r, 0, 0];
      P.uarmL = [-1.1 - r, 0, 0.1]; P.farmL = [-0.6 + r, 0, 0];
      P.thighL = [-1.3, 0, 0.1]; P.thighR = [-0.3, 0, -0.1]; P.shinL = [1.5, 0, 0]; P.shinR = [1.9, 0, 0];
      P.footL = [-0.2, 0, 0]; P.footR = [0.4, 0, 0];
      P.head = [0.4, 0, 0];
      return { pose: P, mask: [...UPPER, 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'hips'] };
    }
    case 'craft': case 'type': case 'bandage': {
      const r = Math.sin(t * (a === 'type' ? 14 : 6));
      P.uarmR = [-0.75, 0.3, -0.1]; P.farmR = [-1.3 + r * 0.15, 0, 0];
      P.uarmL = [-0.75, -0.3, 0.1]; P.farmL = [-1.3 - r * 0.15, 0, 0];
      P.head = [0.45, 0, 0]; P.spine = [0.12, 0, 0];
      return { pose: P };
    }
    case 'hammer': {
      const r = Math.sin(t * 9);
      P.uarmR = [-1.5 + r * 0.6, 0, -0.25]; P.farmR = [-1.0 + r * 0.5, 0, 0];
      P.uarmL = [-1.1, 0, 0.25]; P.farmL = [-0.5, 0, 0];
      P.spine = [0.15, 0.1, 0];
      return { pose: P };
    }
    case 'saw': {
      const r = Math.sin(t * 7);
      P.uarmR = [-0.9, 0, -0.2]; P.farmR = [-1.0 + r * 0.6, 0, 0];
      P.uarmL = [-0.7, 0, 0.3]; P.farmL = [-0.9, 0, 0];
      P.spine = [0.3, 0, 0];
      return { pose: P };
    }
    case 'dig': {
      const r = Math.sin(t * 4);
      P.uarmR = [-0.8 + r * 0.4, 0, -0.1]; P.farmR = [-0.5, 0, 0]; P.uarmL = [-1.0 + r * 0.4, 0, 0.1]; P.farmL = [-0.3, 0, 0];
      P.spine = [0.35 + r * 0.15, 0, 0]; P.rootY = -0.08;
      return { pose: P };
    }
    case 'pour':
      P.uarmR = [-1.1, 0.2, -0.2]; P.farmR = [-0.6, 0, -0.8]; P.head = [0.4, 0, 0];
      return { pose: P };
    case 'read':
      P.uarmR = [-0.8, 0.35, -0.1]; P.farmR = [-1.6, 0, 0]; P.uarmL = [-0.8, -0.35, 0.1]; P.farmL = [-1.6, 0, 0];
      P.head = [0.5, 0, 0];
      return { pose: P };
    case 'scanner':
      P.uarmR = [-0.65, 0.42, -0.05]; P.farmR = [-1.55, 0, 0]; P.handR = [0, 0, 0.3];
      P.uarmL = [-0.65, -0.42, 0.05]; P.farmL = [-1.55, 0, 0]; P.handL = [0, 0, -0.3];
      P.head = [0.55, 0, 0]; P.chest = [0.06, 0, 0];
      return { pose: P };
    case 'carry':
      P.uarmR = [-1.5, 0.2, -0.3]; P.farmR = [-1.5, 0, 0]; P.uarmL = [-0.4, 0, 0.3]; P.farmL = [-1.2, 0, 0];
      P.spine = [0.12, 0, 0];
      return { pose: P };
    case 'push':
      P.uarmR = [-1.15, 0.1, -0.05]; P.farmR = [-0.35, 0, 0]; P.uarmL = [-1.15, -0.1, 0.05]; P.farmL = [-0.35, 0, 0];
      P.spine = [0.2, 0, 0];
      return { pose: P };
    case 'hold_item':
      P.uarmR = [-0.5, 0, -0.1]; P.farmR = [-1.0, 0, 0];
      return { pose: P, mask: ARMS_R };
    case 'hold_light':
      P.uarmR = [-0.8, 0, -0.08]; P.farmR = [-0.35, 0, 0];
      return { pose: P, mask: ARMS_R };
    case 'flinch': {
      const k = Math.sin(u * Math.PI);
      P.chest = [-0.35 * k, 0.2 * k, 0]; P.head = [-0.4 * k, 0, 0.2 * k]; P.uarmL = [-1.2 * k, 0, 0.5 * k]; P.farmL = [-1.8 * k, 0, 0];
      return { pose: P };
    }
    case 'shiver': {
      const sh = Math.sin(time * 40) * 0.03;
      P.uarmL = [-0.5, 0, -0.3 + sh]; P.farmL = [-1.4, 0.5, 0]; P.uarmR = [-0.5, 0, 0.3 - sh]; P.farmR = [-1.4, -0.5, 0];
      return { pose: P };
    }
    case 'cough': {
      const k = Math.max(0, Math.sin(u * Math.PI * 3));
      P.chest = [0.3 * k, 0, 0]; P.head = [0.3 * k, 0, 0]; P.uarmR = [-1.2, 0.3, -0.3]; P.farmR = [-2.0, 0, 0];
      return { pose: P };
    }
    case 'cover_ears':
      P.uarmR = [-0.4, 0, -1.9]; P.farmR = [-2.4, 0, 0]; P.uarmL = [-0.4, 0, 1.9]; P.farmL = [-2.4, 0, 0]; P.head = [0.3, 0, 0];
      return { pose: P };
    case 'wave': {
      const k = Math.sin(time * 9) * 0.4;
      P.uarmR = [-0.3, 0, -2.6]; P.farmR = [0, 0, -0.5 + k];
      return { pose: P };
    }
    case 'pray':
      P.uarmR = [-0.6, 0.6, 0]; P.farmR = [-1.8, 0, 0]; P.uarmL = [-0.6, -0.6, 0]; P.farmL = [-1.8, 0, 0]; P.head = [0.5, 0, 0];
      return { pose: P };
    case 'reload': {
      const r = Math.sin(u * Math.PI * 2);
      P.uarmR = [-1.0, 0.3, -0.1]; P.farmR = [-1.2, 0, 0]; P.uarmL = [-0.9 + r * 0.3, -0.3, 0.1]; P.farmL = [-1.4, 0, 0];
      P.head = [0.4, 0, 0];
      return { pose: P };
    }
    default:
      return { pose: P };
  }
}

function fullPose(f: FullBody, t: number, inp: AnimInput): Pose {
  const P: Pose = {};
  switch (f) {
    case 'sit':
      P.rootY = -0.47; P.thighL = [-1.57, 0, 0.05]; P.thighR = [-1.57, 0, -0.05]; P.shinL = [1.5, 0, 0]; P.shinR = [1.5, 0, 0];
      P.uarmL = [-0.3, 0, 0.1]; P.farmL = [-1.0, 0, 0]; P.uarmR = [-0.3, 0, -0.1]; P.farmR = [-1.0, 0, 0];
      P.head = [0.1 + Math.sin(t * 0.3) * 0.05, 0, 0]; P.spine = [-0.05, 0, 0];
      return P;
    case 'kneel':
      P.rootY = -0.42; P.thighL = [-1.4, 0, 0]; P.shinL = [1.5, 0, 0]; P.thighR = [0.2, 0, 0]; P.shinR = [1.6, 0, 0]; P.footR = [0.5, 0, 0];
      P.spine = [0.25, 0, 0];
      return P;
    case 'lie': case 'lie_side': {
      const breath = Math.sin(t * 1.2) * 0.02;
      P.bodyPitch = -1.5708; P.bodyY = 0.12; P.rootZ = 0;
      if (f === 'lie_side') P.bodyRoll = 1.4;
      P.chest = [breath, 0, 0]; P.uarmL = [0.1, 0, 0.25]; P.uarmR = [0.1, 0, -0.25]; P.farmL = [-0.4, 0, 0]; P.farmR = [-0.4, 0, 0];
      P.head = [-0.15, 0, 0.3];
      P.thighL = [-0.05, 0, 0.04]; P.thighR = [-0.15, 0, -0.04]; P.shinR = [0.25, 0, 0];
      return P;
    }
    case 'dead':
      P.bodyPitch = 1.5708; P.bodyY = 0.13;
      P.uarmL = [-2.6, 0.2, 0.8]; P.uarmR = [-0.4, 0, -0.9]; P.farmL = [-0.5, 0, 0]; P.farmR = [-0.2, 0, 0];
      P.head = [0.3, 0.9, 0]; P.thighL = [0.1, 0, 0.15]; P.thighR = [-0.6, 0, -0.1]; P.shinR = [1.1, 0, 0];
      return P;
    case 'downed': {
      const s = Math.sin(t * 2.2);
      P.bodyPitch = 1.35; P.bodyY = 0.16; P.rootY = -0.7;
      P.uarmL = [-2.4 + s * 0.3, 0, 0.3]; P.uarmR = [-1.6, 0, -0.4]; P.farmR = [-1.2, 0, 0];
      P.head = [-0.9, 0, 0]; P.thighL = [0.2, 0, 0]; P.thighR = [-0.1, 0, 0]; P.shinL = [0.5, 0, 0];
      return P;
    }
    case 'carried':
      P.bodyPitch = 1.6; P.bodyY = 1.3; P.rootZ = -0.2;
      P.uarmL = [-2.9, 0, 0.1]; P.uarmR = [-2.9, 0, -0.1]; P.head = [0.6, 0, 0];
      P.thighL = [-0.6, 0, 0]; P.thighR = [-0.5, 0, 0]; P.shinL = [1.2, 0, 0]; P.shinR = [1.3, 0, 0];
      return P;
    case 'vault': {
      const u = (t * 1.5) % 1;
      P.rootY = Math.sin(u * Math.PI) * 0.45;
      P.thighL = [-1.4, 0, 0.2]; P.shinL = [1.6, 0, 0]; P.thighR = [-0.6, 0, -0.2]; P.shinR = [1.0, 0, 0];
      P.uarmL = [-1.2, 0, 0.3]; P.uarmR = [-1.2, 0, -0.3]; P.spine = [0.4, 0, 0];
      return P;
    }
    case 'fall':
      P.bodyPitch = -0.6; P.uarmL = [-2.8, 0, 0.6]; P.uarmR = [-2.8, 0, -0.6];
      return P;
    case 'drive':
      P.rootY = -0.42; P.thighL = [-1.4, 0, 0.05]; P.thighR = [-1.4, 0, -0.05]; P.shinL = [1.2, 0, 0]; P.shinR = [1.2, 0, 0];
      P.uarmL = [-1.1, -0.2, 0.15]; P.farmL = [-0.7, 0, 0]; P.uarmR = [-1.1, 0.2, -0.15]; P.farmR = [-0.7, 0, 0];
      return P;
    default:
      return P;
  }
}
