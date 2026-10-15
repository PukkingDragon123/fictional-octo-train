import type { Pose, JointName } from './humanRig';
import { clamp, lerp } from '../core/math';

/**
 * Procedural animation for survivors. Layers, bottom to top:
 *  1. locomotion: phase-driven gait (walk / run / crouch-walk / limp / swim /
 *     crawl) with counter-rotating shoulders, arm swing, hip sway and drop,
 *     head bob and stabilisation, heel strike and toe-off foot roll;
 *  2. idle body language: breathing, weight shifts, fidgets (look around,
 *     scratch head, check wristwatch, stretch, roll neck), exhaustion
 *     (hands on knees, panting), panic trembling, cold shivers, drunk sway,
 *     a cradled injured arm, blinking;
 *  3. actions with per-joint masks (weapon stances per weapon kind, swings,
 *     stabs, shoves, shooting, throwing, eating, crafting, looting...);
 *  4. emotes (wave, flex, dance, jumping jacks, shrug, salute, point,
 *     facepalm, sit-and-wait, cheer, clap, bow);
 *  5. full-body states (sit, lie, kneel, downed with a fall, dead with a
 *     collapse, carried over a shoulder, vault, drive).
 * Everything is a handful of sines per joint: cheap enough for phones.
 */

export type Stance = 'stand' | 'sneak' | 'swim' | 'crawl';
export type FullBody = '' | 'sit' | 'lie' | 'dead' | 'downed' | 'carried' | 'vault' | 'kneel' | 'drive' | 'fall' | 'lie_side';
export const EMOTES = ['wave', 'flex', 'dance', 'jumping_jacks', 'shrug', 'salute', 'point', 'facepalm', 'sit_wait', 'cheer', 'clap', 'bow'] as const;
export type EmoteName = typeof EMOTES[number];
export type ActionAnim =
  | '' | 'aim_melee' | 'aim_gun' | 'aim_throw' | 'swing' | 'swing2h' | 'stab' | 'shoot' | 'throw' | 'shove' | 'eat' | 'drink'
  | 'loot' | 'pickup' | 'craft' | 'hammer' | 'saw' | 'read' | 'scanner' | 'carry' | 'push' | 'bandage' | 'dig' | 'pour'
  | 'flinch' | 'shiver' | 'cough' | 'wave' | 'hold_light' | 'hold_item' | 'type' | 'pray' | 'cover_ears' | 'reload'
  | 'stitch' | 'cook' | 'mix' | 'breathe' | 'panic' | `emote:${string}`;

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
  // ---- optional richer inputs
  weapon?: string;        // blunt | blade | spear | axe | firearm | thrown | unarmed | ''
  limpSide?: 'L' | 'R';
  armHurtL?: number;      // 0..1
  armHurtR?: number;
  exhausted?: number;     // 0..1 (low endurance)
  drunk?: number;         // 0..1
  hot?: number;           // 0..1
  heldL?: boolean;
  turn?: number;          // facing angular velocity (rad/s)
  hasWatch?: boolean;
  unconscious?: boolean;
  /** allow idle fidgets (false for remote players far away etc.) */
  fidget?: boolean;
}

type V = [number, number, number];
const Z: V = [0, 0, 0];
const add = (p: Pose, j: JointName, x: number, y = 0, z = 0) => { const v = p[j]; if (v) { v[0] += x; v[1] += y; v[2] += z; } else p[j] = [x, y, z]; };
const set = (p: Pose, j: JointName, x: number, y = 0, z = 0) => { p[j] = [x, y, z]; };
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const env = (u: number, a = 0.2, b = 0.2) => (u < a ? ease(u / a) : u > 1 - b ? ease((1 - u) / b) : 1);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

const UPPER: JointName[] = ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const ARMS: JointName[] = ['uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const ARM_R: JointName[] = ['uarmR', 'farmR', 'handR'];
const ARM_L: JointName[] = ['uarmL', 'farmL', 'handL'];
const LEGS: JointName[] = ['hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const ALL: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const SCALARS = ['rootY', 'rootZ', 'rootX', 'bodyPitch', 'bodyRoll', 'bodyYaw', 'bodyY', 'gripL', 'gripR', 'blink'] as const;

type Fidget = 'look' | 'scratch' | 'watch' | 'stretch' | 'neck' | 'shift' | 'wipe' | 'rub' | 'support';

export class HumanAnimator {
  phase = 0;
  pose: Pose = {};
  private time = 0;
  private seed = Math.random() * 1000;
  private actW = 0; private lastAction: ActionAnim = '';
  private fullW = 0; private lastFull: FullBody = '';
  private walkW = 0; private runW = 0; private sneakW = 0; private crawlW = 0; private swimW = 0;
  private idleT = 0;
  private weight = 0; private weightTarget = 0; private weightT = 2;
  private fid: { k: Fidget; t: number; dur: number; side: number } | null = null;
  private fidT = 4;
  private look = 0; private lookTarget = 0; private lookT = 2;
  private blinkT = 2; private blink = 0;
  private fullT = 0; private prevFull: FullBody = '';
  private swingN = 0; private lastSwingAct = '';
  private emote: { name: EmoteName; t: number; loop: boolean } | null = null;
  private emoteW = 0; private lastEmote: EmoteName | null = null; private emoteT = 0;
  private lean = 0;
  private attackT = 0;

  /** a panic attack: trembling, hunched, hyperventilating, hands to chest and head for a few seconds */
  panicAttack(secs = 7) { if (this.attackT <= 0) this.attackDur = 0; this.attackT = Math.max(this.attackT, secs); this.fid = null; }
  private attackDur = 0;
  get panicking() { return this.attackT > 0.3; }

  playEmote(name: string, loop?: boolean) {
    if (!(EMOTES as readonly string[]).includes(name)) return false;
    const n = name as EmoteName;
    this.emote = { name: n, t: 0, loop: loop ?? (n === 'dance' || n === 'jumping_jacks' || n === 'sit_wait' || n === 'clap') };
    return true;
  }
  stopEmote() { this.emote = null; }
  /** current emote (for network mirroring) */
  get emoteState(): { name: string; t: number } | null { return this.emote ? { name: this.emote.name, t: this.emote.t } : null; }

  update(dt: number, inp: AnimInput): Pose {
    this.time += dt;
    const t = this.time;
    const k8 = 1 - Math.exp(-8 * dt), k12 = 1 - Math.exp(-12 * dt);
    const sp = inp.speed;
    const moving = sp > 0.15;

    // ---------------- gait parameters
    const limp = clamp(inp.limp, 0, 1);
    this.walkW = lerp(this.walkW, moving ? clamp(sp / 1.6, 0, 1) : 0, k8);
    this.runW = lerp(this.runW, clamp((sp - 2.4) / 1.5, 0, 1), k8);
    this.sneakW = lerp(this.sneakW, inp.stance === 'sneak' ? 1 : 0, k8);
    this.crawlW = lerp(this.crawlW, inp.stance === 'crawl' ? 1 : 0, k8);
    this.swimW = lerp(this.swimW, inp.stance === 'swim' ? 1 : 0, k8);
    const w = this.walkW, r = this.runW, sn = this.sneakW;
    const stride = lerp(lerp(1.42, 0.95, sn), 2.55, r) * (1 - limp * 0.25) * (inp.stance === 'crawl' ? 0.35 : 1) * (inp.stance === 'swim' ? 1.2 : 1);
    let rate = (sp / stride) * Math.PI * 2;
    // limp: hurry through the injured leg's stance, linger on the good one
    if (limp > 0.05 && moving) {
      const injL = inp.limpSide !== 'R';
      const s = Math.sin(this.phase);
      const onInjured = injL ? s < 0 : s > 0; // left stance when sin<0 (thigh back) ... approx
      rate *= onInjured ? 1 + limp * 0.55 : 1 - limp * 0.3;
    }
    this.phase += rate * dt;
    const ph = this.phase;

    // ---------------- base pose
    const p: Pose = {};
    const tired = clamp(inp.tired, 0, 1), panic = clamp(inp.panic, 0, 1), exh = clamp(inp.exhausted ?? 0, 0, 1);
    const fem = 0; void fem;
    // breathing: faster and deeper when exhausted / panicking
    const brRate = 1.6 + exh * 4.5 + panic * 2 + r * 2;
    const brAmp = 0.018 + exh * 0.05 + r * 0.01;
    const br = Math.sin(t * brRate) * brAmp;
    set(p, 'chest', -br * 0.6, 0, 0);
    set(p, 'neck', br * 0.3, 0, 0);
    set(p, 'uarmL', 0.03, 0, 0.07 + br * 0.4);
    set(p, 'uarmR', 0.03, 0, -0.07 - br * 0.4);
    set(p, 'farmL', -0.16, 0, 0);
    set(p, 'farmR', -0.16, 0, 0);
    set(p, 'handL', 0.05, 0, 0.06);
    set(p, 'handR', 0.05, 0, -0.06);
    p.gripL = 0.3; p.gripR = 0.3;
    p.rootX = 0;

    // ---------------- idle: weight shift, look-around, fidgets
    const idle = !moving && !inp.action && !inp.full && inp.stance === 'stand' && !this.emote;
    this.idleT = idle ? this.idleT + dt : 0;
    this.weightT -= dt;
    if (this.weightT <= 0) { this.weightT = 3 + hash(t + this.seed) * 5; this.weightTarget = hash(t * 1.7 + this.seed) < 0.5 ? -1 : 1; if (hash(t * 3.1) < 0.25) this.weightTarget = 0; }
    this.weight = lerp(this.weight, idle ? this.weightTarget : 0, 1 - Math.exp(-1.6 * dt));
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = (panic > 0.3 ? 0.5 : 2) + hash(t + 7 + this.seed) * (panic > 0.3 ? 1 : 4); this.lookTarget = (hash(t * 5.3 + this.seed) - 0.5) * (panic > 0.3 ? 1.8 : 0.9); if (hash(t * 2.2) < 0.35) this.lookTarget = 0; }
    this.look = lerp(this.look, moving ? this.lookTarget * 0.25 : this.lookTarget, 1 - Math.exp(-(panic > 0.3 ? 9 : 2.5) * dt));
    set(p, 'head', 0.04 + tired * 0.22 + exh * 0.15, this.look * 0.7 + inp.lookYaw, 0);
    add(p, 'neck', 0, this.look * 0.3, 0);
    if (idle) {
      const ws = this.weight;
      // hip drops on the unloaded side, loaded knee locks, the other bends slightly
      set(p, 'hips', 0, ws * 0.04, ws * 0.05);
      p.rootX = ws * 0.025;
      add(p, 'spine', 0, -ws * 0.03, -ws * 0.035);
      add(p, 'chest', 0, 0, -ws * 0.02);
      const free = ws > 0 ? 'R' : 'L';
      add(p, ('thigh' + free) as JointName, -0.06 * Math.abs(ws), 0, (free === 'L' ? 1 : -1) * 0.02);
      add(p, ('shin' + free) as JointName, 0.16 * Math.abs(ws), 0, 0);
      add(p, ('foot' + free) as JointName, -0.1 * Math.abs(ws), (free === 'L' ? 1 : -1) * 0.15 * Math.abs(ws), 0);
      add(p, ('thigh' + (free === 'L' ? 'R' : 'L')) as JointName, 0, 0, -ws * 0.04);
    }
    if (tired > 0.4) add(p, 'spine', 0.08 * tired, 0, 0);

    // ---------------- locomotion
    if (this.swimW > 0.01 || this.crawlW > 0.01) {
      const q: Pose = {};
      if (inp.stance === 'swim' || this.swimW > this.crawlW) {
        const s3 = Math.sin(t * 2.6);
        q.bodyPitch = 1.25; q.bodyY = 0.38; q.rootY = -0.2;
        set(q, 'uarmL', -1.9 + s3 * 0.9, 0, 0.35); set(q, 'uarmR', -1.9 - s3 * 0.9, 0, -0.35);
        set(q, 'farmL', -0.4 - Math.max(0, s3) * 0.6, 0, 0); set(q, 'farmR', -0.4 - Math.max(0, -s3) * 0.6, 0, 0);
        set(q, 'thighL', Math.sin(t * 5) * 0.35, 0, 0.05); set(q, 'thighR', -Math.sin(t * 5) * 0.35, 0, -0.05);
        set(q, 'shinL', 0.3, 0, 0); set(q, 'shinR', 0.3, 0, 0);
        set(q, 'head', -1.0, Math.sin(t * 1.3) * 0.2, 0);
        set(q, 'footL', 0.6, 0, 0); set(q, 'footR', 0.6, 0, 0);
      } else {
        // crawling: reach with alternate arms, drag the legs
        const s = Math.sin(ph), c = Math.cos(ph);
        const go = clamp(sp / 0.3, 0, 1);
        q.bodyPitch = 1.42; q.bodyY = 0.13; q.rootY = -0.84;
        set(q, 'uarmL', -2.5 + s * 0.5 * go, 0, 0.35 + Math.max(0, c) * 0.2 * go); set(q, 'uarmR', -2.5 - s * 0.5 * go, 0, -0.35 - Math.max(0, -c) * 0.2 * go);
        set(q, 'farmL', -0.5 - Math.max(0, -s) * 0.7 * go, 0, 0); set(q, 'farmR', -0.5 - Math.max(0, s) * 0.7 * go, 0, 0);
        set(q, 'thighL', 0.1 - s * 0.3 * go, 0, 0.12); set(q, 'thighR', 0.1 + s * 0.3 * go, 0, -0.12);
        set(q, 'shinL', 0.3 + Math.max(0, s) * 0.6 * go, 0, 0); set(q, 'shinR', 0.3 + Math.max(0, -s) * 0.6 * go, 0, 0);
        set(q, 'footL', 0.9, 0, 0); set(q, 'footR', 0.9, 0, 0);
        set(q, 'head', -1.05, s * 0.1, 0); set(q, 'chest', 0, s * 0.1 * go, 0); set(q, 'hips', 0, -s * 0.08 * go, 0);
        q.gripL = 0.6; q.gripR = 0.6;
      }
      const qw = Math.max(this.swimW, this.crawlW);
      blend(p, q, qw, ALL);
      for (const k of SCALARS) if (q[k] !== undefined) (p as any)[k] = lerp((p as any)[k] ?? 0, q[k] as number, qw);
    } else {
      // walk / run / sneak cycle (left leg phase = ph, right = ph + PI)
      const sL = Math.sin(ph), cL = Math.cos(ph);
      const injL = limp > 0.05 && inp.limpSide !== 'R', injR = limp > 0.05 && inp.limpSide === 'R';
      const thA = (0.42 + r * 0.38) * w * (1 - sn * 0.2);
      const ampL = thA * (injL ? 1 - limp * 0.45 : 1), ampR = thA * (injR ? 1 - limp * 0.45 : 1);
      const leg = (side: 'L' | 'R', s: number, c: number, amp: number, inj: boolean) => {
        const thigh = -s * amp;
        // knee: big bend mid-swing (thigh moving forward), small bend on loading
        const swing = Math.pow(Math.max(0, Math.cos(Math.atan2(s, c) + 0.35 * r)), 1.4);
        const knee = (swing * (0.95 + r * 1.05) + Math.exp(-((Math.atan2(s, c) - 1.9) ** 2) * 3) * 0.16 * (1 - r)) * w * (inj ? 1 - limp * 0.55 : 1);
        // foot: flat in stance, heel-strike dorsiflexion, toe-off push
        const toeOff = Math.exp(-((Math.atan2(-s, -c) - 0.25) ** 2) * 6) * (0.45 + r * 0.25);
        const heel = Math.exp(-((Math.atan2(s, c) - 1.45) ** 2) * 8) * 0.28;
        const foot = -(thigh + knee) * 0.75 + (toeOff - heel) * w;
        add(p, ('thigh' + side) as JointName, thigh - sn * 0.62, 0, 0);
        add(p, ('shin' + side) as JointName, knee + sn * 1.05, 0, 0);
        add(p, ('foot' + side) as JointName, foot - sn * 0.42, 0, 0);
      };
      leg('L', sL, cL, ampL, injL);
      leg('R', -sL, -cL, ampR, injR);
      // pelvis: bob, yaw with the swinging leg, drop on the swing side, sway over the stance leg
      const bob = (lerp(0.022, -0.045, r) * Math.cos(2 * ph)) * w;
      const femSway = 1;
      add(p, 'hips', sn * 0.06, -sL * 0.1 * w * (1 - r * 0.4), -cL * 0.045 * w * femSway * (1 - r * 0.6));
      p.rootX = (p.rootX ?? 0) + -cL * 0.014 * w * (1 - r);
      // counter-rotate the trunk; lean into speed (and away from turns)
      this.lean = lerp(this.lean, clamp((inp.turn ?? 0) * sp * 0.02, -0.12, 0.12), k8);
      add(p, 'spine', r * 0.16 * w + sn * 0.32 + 0.025 * w, sL * 0.11 * w, cL * 0.03 * w + this.lean);
      add(p, 'chest', r * 0.06 * w, sL * 0.08 * w, 0);
      add(p, 'head', -r * 0.12 * w - sn * 0.15, -sL * 0.12 * w, -cL * 0.02 * w);
      // arms swing opposite to the legs; elbows bend with speed; forearms lag a little
      const armA = (0.36 + r * 0.42) * w * (1 - sn * 0.6);
      const elbow = 0.18 + r * 1.15 * w + sn * 0.9;
      const hurtL = inp.armHurtL ?? 0, hurtR = inp.armHurtR ?? 0;
      add(p, 'uarmL', sL * armA * (1 - hurtL) - sn * 0.35, 0, 0.04 * w);
      add(p, 'uarmR', -sL * armA * (1 - hurtR) - sn * 0.35, 0, -0.04 * w);
      add(p, 'farmL', -elbow + 0.16 - Math.max(0, -sL) * 0.25 * w * (1 - r), 0, 0);
      add(p, 'farmR', -elbow + 0.16 - Math.max(0, sL) * 0.25 * w * (1 - r), 0, 0);
      if (r > 0.3) { p.gripL = 0.85; p.gripR = 0.85; }
      if (sn > 0.3) { add(p, 'uarmL', 0, 0, 0.12 * sn); add(p, 'uarmR', 0, 0, -0.12 * sn); }
      // body height
      let ry = bob - sn * 0.24 - limp * Math.max(0, injL ? -sL : sL) * 0.05 * w;
      if (inp.drunk) ry -= 0.02 * inp.drunk;
      p.rootY = ry;
      // limp: torso leans over the injured leg during its stance
      if (limp > 0.05) add(p, 'spine', 0, 0, (injL ? 1 : -1) * Math.max(0, injL ? -sL : sL) * 0.12 * limp * w);
    }

    // ---------------- condition body language
    if (exh > 0.25 && !moving && inp.stance === 'stand' && !inp.action && !inp.full) {
      // hands on knees, panting
      const e = clamp((exh - 0.25) / 0.5, 0, 1) * clamp(this.idleT / 0.6, 0, 1);
      const q: Pose = {};
      set(q, 'spine', 0.55, 0, 0); set(q, 'chest', 0.25 - br * 2, 0, 0); set(q, 'head', -0.45, this.look * 0.4, 0);
      set(q, 'uarmL', -0.45, 0, 0.12); set(q, 'uarmR', -0.45, 0, -0.12);
      set(q, 'farmL', -0.35, 0, 0); set(q, 'farmR', -0.35, 0, 0);
      set(q, 'thighL', -0.35, 0, 0.06); set(q, 'thighR', -0.35, 0, -0.06);
      set(q, 'shinL', 0.55, 0, 0); set(q, 'shinR', 0.55, 0, 0); set(q, 'footL', -0.2, 0, 0); set(q, 'footR', -0.2, 0, 0);
      q.rootY = -0.07; q.gripL = 0.5; q.gripR = 0.5;
      blend(p, q, e, ALL);
    } else if (exh > 0.4 && moving) {
      add(p, 'spine', 0.12 * exh, 0, 0); add(p, 'head', 0.15 * exh, 0, 0);
    }
    if (panic > 0.35) {
      const tr = (panic - 0.35) * 0.05;
      add(p, 'uarmL', Math.sin(t * 37) * tr, 0, -0.1 * panic); add(p, 'uarmR', Math.sin(t * 41 + 1) * tr, 0, 0.1 * panic);
      add(p, 'farmL', -0.3 * panic, 0, 0); add(p, 'farmR', -0.3 * panic, 0, 0);
      add(p, 'head', Math.sin(t * 29) * tr * 0.6, 0, Math.sin(t * 23) * tr * 0.5);
      add(p, 'chest', 0.08 * panic, 0, 0);
      p.gripL = 0.9; p.gripR = 0.9;
    }
    if (this.attackT > 0) {
      this.attackT -= dt; this.attackDur += dt;
      const e = clamp(this.attackT / 1.2, 0, 1) * clamp(this.attackDur / 0.5 + 0.2, 0, 1);
      const hv = Math.sin(t * 9.5), tr = Math.sin(t * 43) * 0.04 + Math.sin(t * 31 + 2) * 0.03;
      const q: Pose = {};
      set(q, 'spine', 0.32 + hv * 0.04, 0, 0); set(q, 'chest', 0.12 - hv * 0.09, 0, tr); set(q, 'neck', 0.1, 0, 0);
      set(q, 'head', 0.2 + tr, this.look * 0.6 + tr * 3, tr * 2);
      set(q, 'uarmR', -0.8 + tr, 0.5, -0.1); set(q, 'farmR', -2.05, 0, 0); set(q, 'handR', 0.3, 0, -0.3);   // hand clutching the chest
      set(q, 'uarmL', -1.05 + tr, -0.45, 1.3); set(q, 'farmL', -2.3 - tr * 2, 0, 0); set(q, 'handL', 0.4, 0, 0); // hand on the head
      set(q, 'thighL', -0.2, 0, 0.06); set(q, 'thighR', -0.2, 0, -0.06); set(q, 'shinL', 0.4 + tr, 0, 0); set(q, 'shinR', 0.4 - tr, 0, 0);
      set(q, 'footL', -0.2, 0, 0); set(q, 'footR', -0.2, 0, 0);
      q.rootY = -0.05;
      blend(p, q, e * (moving ? 0.5 : 1), moving ? UPPER : ALL);
      if (!moving) p.rootY = lerp(p.rootY ?? 0, -0.05, e);
      p.gripL = 0.7; p.gripR = 0.9;
    }
    if (inp.cold > 0.2) {
      const c = inp.cold, sh = Math.sin(t * 42) * 0.025 * c;
      add(p, 'uarmL', -0.45 * c, 0, -0.32 * c + sh); add(p, 'farmL', -1.25 * c, 0.4 * c, 0);
      add(p, 'uarmR', -0.45 * c, 0, 0.32 * c - sh); add(p, 'farmR', -1.25 * c, -0.4 * c, 0);
      add(p, 'chest', 0.1 * c, 0, sh); add(p, 'head', 0.1 * c, 0, 0);
    }
    if (inp.drunk && inp.drunk > 0.2) { const d = inp.drunk; add(p, 'spine', 0, 0, Math.sin(t * 0.9) * 0.06 * d); add(p, 'head', Math.sin(t * 0.7) * 0.08 * d, 0, Math.sin(t * 1.1) * 0.1 * d); }
    // injured arm: cradled against the stomach instead of swinging
    for (const side of ['L', 'R'] as const) {
      const h = side === 'L' ? inp.armHurtL ?? 0 : inp.armHurtR ?? 0;
      if (h < 0.3 || inp.action) continue;
      const k = side === 'L' ? 1 : -1;
      const q: Pose = {};
      set(q, ('uarm' + side) as JointName, -0.3, -k * 0.75, k * 0.08); set(q, ('farm' + side) as JointName, -1.6, 0, 0); set(q, ('hand' + side) as JointName, 0, 0, k * 0.3);
      blend(p, q, clamp((h - 0.3) * 2, 0, 1), side === 'L' ? ARM_L : ARM_R);
      if (side === 'L') p.gripL = 0.2; else p.gripR = 0.2;
    }
    if (inp.holdingLight && !inp.action) {
      set(p, 'uarmR', -0.75 + Math.sin(t * 2) * 0.02 + (p.uarmR?.[0] ?? 0) * 0.15, 0, -0.08);
      set(p, 'farmR', -0.4, 0, 0); set(p, 'handR', -0.1, 0, 0);
    }
    if (inp.holding) p.gripR = 0.95;
    if (inp.heldL) p.gripL = 0.95;

    // ---------------- fidgets
    if (idle && inp.fidget !== false && exh < 0.25 && panic < 0.35 && inp.cold < 0.3) {
      this.fidT -= dt;
      if (!this.fid && this.fidT <= 0 && this.idleT > 2.5) {
        const opts: Fidget[] = ['look', 'scratch', 'stretch', 'neck', 'shift', 'rub'];
        if (inp.hasWatch !== false) opts.push('watch', 'watch');
        if ((inp.hot ?? 0) > 0.3) opts.push('wipe', 'wipe');
        if (inp.holding) { const i = opts.indexOf('scratch'); if (i >= 0) opts.splice(i, 1); }
        const k = opts[Math.floor(hash(t + this.seed * 3) * opts.length)];
        this.fid = { k, t: 0, dur: k === 'stretch' ? 3.2 : k === 'watch' ? 2.4 : k === 'look' ? 3.5 : 2.2, side: hash(t * 9) < 0.5 ? 1 : -1 };
        this.fidT = 6 + hash(t * 4 + this.seed) * 10;
      }
    } else if (!idle) { this.fid = null; this.fidT = Math.max(this.fidT, 3); }
    if (this.fid) {
      const f = this.fid; f.t += dt;
      const u = f.t / f.dur;
      if (u >= 1) this.fid = null;
      else fidgetPose(p, f.k, u, f.side, t, !!inp.holding);
    }

    // ---------------- blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2 + hash(t + this.seed * 7) * 4.5 - panic * 1.5; }
    this.blink = Math.max(0, this.blink - dt);
    p.blink = this.blink > 0 ? 1 : tired > 0.75 ? 0.45 : 0;

    // ---------------- action layer
    let act = inp.action;
    // remote emotes arrive as 'emote:name'
    let emoteName: EmoteName | null = null, emoteU = 0;
    if (act && act.startsWith('emote:')) { emoteName = act.slice(6) as EmoteName; emoteU = inp.actionT; act = ''; }
    if (act === 'panic') { this.attackT = Math.max(this.attackT, 1.4); act = ''; } // mirrored panic attack
    if (act) { this.lastAction = act; if (act !== this.lastSwingAct && (act === 'swing' || act === 'swing2h' || act === 'stab')) { this.swingN++; } }
    this.lastSwingAct = act;
    this.actW = lerp(this.actW, act ? 1 : 0, 1 - Math.exp(-16 * dt));
    if (this.actW > 0.01 && this.lastAction) {
      const a = actionPose(this.lastAction, inp.actionT, inp.actionDur, inp, t, this.swingN);
      const mask = a.mask || UPPER;
      blend(p, a.pose, this.actW, mask);
      if (a.pose.rootY !== undefined) p.rootY = lerp(p.rootY ?? 0, a.pose.rootY, this.actW);
      if (a.pose.gripL !== undefined) p.gripL = lerp(p.gripL ?? 0, a.pose.gripL, this.actW);
      if (a.pose.gripR !== undefined) p.gripR = lerp(p.gripR ?? 0, a.pose.gripR, this.actW);
      if (a.pose.blink !== undefined && this.actW > 0.5) p.blink = a.pose.blink;
    }

    // ---------------- emotes
    if (this.emote && (moving || inp.action || inp.full || inp.stance !== 'stand')) this.emote = null;
    if (this.emote) {
      this.emote.t += dt;
      const D = EMOTE_DUR[this.emote.name];
      if (!this.emote.loop && this.emote.t >= D) this.emote = null;
    }
    const em = this.emote ? this.emote.name : emoteName;
    const emT = this.emote ? this.emote.t : emoteU;
    if (em) { this.lastEmote = em; this.emoteT = emT; }
    this.emoteW = lerp(this.emoteW, em ? 1 : 0, k12);
    if (this.emoteW > 0.01 && this.lastEmote) {
      const e = emotePose(this.lastEmote, this.emoteT, t);
      blend(p, e.pose, this.emoteW, e.mask);
      for (const s of SCALARS) if (e.pose[s] !== undefined) (p as any)[s] = lerp((p as any)[s] ?? 0, e.pose[s] as number, this.emoteW);
    }

    // ---------------- full-body states
    let full = inp.full;
    if (full !== this.prevFull) {
      // already on the ground (crawling, or downed before dying): skip the fall / collapse
      this.fullT = (full === 'downed' || full === 'dead') && (this.crawlW > 0.3 || this.prevFull === 'downed') ? 5 : 0;
      this.prevFull = full;
    }
    this.fullT += dt;
    if (full) this.lastFull = full;
    this.fullW = lerp(this.fullW, full ? 1 : 0, 1 - Math.exp(-(full === 'dead' || full === 'downed' ? 14 : 8) * dt));
    if (this.fullW > 0.01 && this.lastFull) {
      const f = fullPose(this.lastFull, t, this.fullT, inp);
      const wgt = this.fullW;
      blend(p, f, wgt, ALL);
      for (const s of SCALARS) (p as any)[s] = lerp((p as any)[s] ?? 0, (f as any)[s] ?? (s === 'gripL' || s === 'gripR' ? 0.3 : 0), wgt);
    }
    if (inp.unconscious || full === 'dead' || full === 'lie' || full === 'lie_side') p.blink = 1;
    this.pose = p;
    return p;
  }
}

function blend(p: Pose, q: Pose, w: number, mask: JointName[]) {
  for (const j of mask) {
    const v = q[j]; if (!v) continue;
    const b = p[j] || Z;
    p[j] = [lerp(b[0], v[0], w), lerp(b[1], v[1], w), lerp(b[2], v[2], w)];
  }
}

// ------------------------------------------------------------------ fidgets
function fidgetPose(p: Pose, k: Fidget, u: number, side: number, t: number, holding: boolean) {
  const e = env(u, 0.25, 0.25);
  const q: Pose = {};
  let mask: JointName[] = UPPER;
  switch (k) {
    case 'look': {
      const yaw = Math.sin(u * Math.PI * 2) * 0.9 * side;
      set(q, 'head', 0.0, yaw, 0); set(q, 'neck', 0, yaw * 0.3, 0); set(q, 'chest', 0, yaw * 0.2, 0);
      mask = ['head', 'neck', 'chest'];
      break;
    }
    case 'scratch': {
      // right hand scratches the back of the head
      const sc = Math.sin(t * 16) * 0.12;
      set(q, 'uarmR', -0.9, 0.3, -1.45); set(q, 'farmR', -2.25 + sc, 0, 0); set(q, 'handR', 0.3, 0, 0);
      set(q, 'head', 0.18, 0.15, 0.12); q.gripR = 0.6;
      mask = ['uarmR', 'farmR', 'handR', 'head'];
      break;
    }
    case 'watch': {
      // left forearm raised across the chest, head down to the wrist
      set(q, 'uarmL', -0.55, -0.25, 0.2); set(q, 'farmL', -1.75, -0.9, 0); set(q, 'handL', 0, 0, 0.6);
      set(q, 'head', 0.42, 0.28, 0.05); set(q, 'chest', 0.05, 0.08, 0);
      mask = ['uarmL', 'farmL', 'handL', 'head', 'chest'];
      break;
    }
    case 'stretch': {
      const s = holding ? 0.6 : 1;
      set(q, 'uarmL', -2.8 * s, 0, 0.25); set(q, 'uarmR', -2.8 * s, 0, -0.25);
      set(q, 'farmL', -0.6, 0, 0); set(q, 'farmR', -0.6, 0, 0);
      set(q, 'spine', -0.12, 0, Math.sin(u * Math.PI * 2) * 0.12); set(q, 'chest', -0.1, 0, 0); set(q, 'head', -0.3, 0, 0);
      q.gripL = 0; q.gripR = holding ? 0.95 : 0;
      break;
    }
    case 'neck': {
      const a = u * Math.PI * 2;
      set(q, 'head', 0.25 * Math.cos(a), 0, 0.3 * Math.sin(a)); set(q, 'neck', 0.1 * Math.cos(a), 0, 0.1 * Math.sin(a));
      mask = ['head', 'neck'];
      break;
    }
    case 'shift': {
      set(q, 'chest', 0, 0, 0); set(q, 'spine', 0, 0.12 * side, 0); set(q, 'head', 0.05, -0.2 * side, 0);
      set(q, 'uarmL', 0.1, 0, 0.12); set(q, 'uarmR', 0.1, 0, -0.12); set(q, 'farmL', -0.25, 0, 0); set(q, 'farmR', -0.25, 0, 0);
      break;
    }
    case 'rub': {
      // rub the back of the neck with the left hand
      const sc = Math.sin(t * 9) * 0.1;
      set(q, 'uarmL', -1.0, -0.3, 1.2); set(q, 'farmL', -2.1 + sc, 0, 0); set(q, 'head', 0.25, 0, -0.1);
      mask = ['uarmL', 'farmL', 'handL', 'head'];
      break;
    }
    case 'wipe': {
      const sw = Math.sin(u * Math.PI * 3) * 0.3;
      set(q, 'uarmR', -1.5, 0.3, -0.5 + sw * 0.4); set(q, 'farmR', -1.9, sw, 0); set(q, 'head', -0.15, 0, 0);
      mask = ['uarmR', 'farmR', 'handR', 'head'];
      break;
    }
    case 'support': break;
  }
  blend(p, q, e, mask);
  if (q.gripL !== undefined) p.gripL = lerp(p.gripL ?? 0, q.gripL, e);
  if (q.gripR !== undefined) p.gripR = lerp(p.gripR ?? 0, q.gripR, e);
}

// ------------------------------------------------------------------ actions
function actionPose(a: ActionAnim, t: number, dur: number, inp: AnimInput, time: number, swingN: number): { pose: Pose; mask?: JointName[] } {
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 0;
  const P: Pose = {};
  const ap = inp.aimPitch;
  const wk = inp.weapon || (inp.holding ? 'blunt' : 'unarmed');
  const two = inp.twoHanded;
  const stanceLegs = (k = 1) => { set(P, 'thighL', -0.18 * k, 0, 0.1 * k); set(P, 'shinL', 0.28 * k, 0, 0); set(P, 'footL', -0.1 * k, 0.2 * k, 0); set(P, 'thighR', 0.12 * k, 0, -0.1 * k); set(P, 'shinR', 0.22 * k, 0, 0); set(P, 'footR', -0.3 * k, -0.25 * k, 0); P.rootY = -0.04 * k; };
  const WITH_LEGS = [...UPPER, ...LEGS];
  switch (a) {
    case 'aim_melee': {
      if (wk === 'unarmed' && !inp.holding) {
        // boxing guard
        const bob = Math.sin(time * 5) * 0.03;
        set(P, 'uarmL', -0.75 + bob, -0.15, 0.32); set(P, 'farmL', -2.0, 0, 0); set(P, 'handL', 0.2, 0, 0.2);
        set(P, 'uarmR', -0.6 - bob, 0.15, -0.3); set(P, 'farmR', -2.15, 0, 0); set(P, 'handR', 0.2, 0, -0.2);
        set(P, 'chest', 0.08, -0.25, 0); set(P, 'spine', 0.08, 0, 0); set(P, 'head', 0.12, 0.2, 0);
        P.gripL = 1; P.gripR = 1; stanceLegs();
        return { pose: P, mask: WITH_LEGS };
      }
      if (wk === 'spear') {
        set(P, 'uarmR', -0.35, 0.2, -0.25); set(P, 'farmR', -1.25, 0.2, 0); set(P, 'handR', 1.35, 0, 0);
        set(P, 'uarmL', -1.05, -0.45, 0.2); set(P, 'farmL', -0.45, 0, 0); set(P, 'handL', 1.2, 0, 0);
        set(P, 'chest', 0.05, -0.35, 0); set(P, 'spine', 0.12, 0, 0); set(P, 'head', 0, 0.3, 0);
        P.gripL = 1; P.gripR = 1; stanceLegs(1.2);
        return { pose: P, mask: WITH_LEGS };
      }
      if (two || wk === 'axe') {
        // batting stance: hands together by the right shoulder, weapon up and back
        const sway = Math.sin(time * 3) * 0.04;
        set(P, 'uarmR', -0.5 + sway, 0.35, -0.55); set(P, 'farmR', -2.0, 0.3, 0); set(P, 'handR', -0.5, 0, 0);
        set(P, 'uarmL', -1.05 + sway, -0.75, 0.45); set(P, 'farmL', -1.5, 0, 0); set(P, 'handL', -0.4, 0, 0);
        set(P, 'chest', 0.04, -0.45, 0); set(P, 'spine', 0.1, -0.1, 0); set(P, 'head', 0.05, 0.45, 0);
        P.gripL = 1; P.gripR = 1; stanceLegs(1.1);
        return { pose: P, mask: WITH_LEGS };
      }
      if (wk === 'blade') {
        set(P, 'uarmR', -0.75, 0.1, -0.25); set(P, 'farmR', -1.15, 0, 0); set(P, 'handR', 0.9, 0, 0);
        set(P, 'uarmL', -0.95, -0.2, 0.35); set(P, 'farmL', -1.6, 0, 0);
        set(P, 'chest', 0.08, -0.2, 0); set(P, 'spine', 0.12, 0, 0); set(P, 'head', 0.08, 0.15, 0);
        P.gripR = 1; P.gripL = 0.5; stanceLegs();
        return { pose: P, mask: WITH_LEGS };
      }
      // one-handed blunt: weapon cocked over the shoulder, free arm guarding
      set(P, 'uarmR', -1.05, 0.3, -0.75); set(P, 'farmR', -1.75, 0, 0); set(P, 'handR', -0.7, 0, 0);
      set(P, 'uarmL', -0.75, -0.2, 0.35); set(P, 'farmL', -1.45, 0, 0);
      set(P, 'chest', 0.04, -0.3, 0); set(P, 'spine', 0.1, 0, 0); set(P, 'head', 0.05, 0.28, 0);
      P.gripR = 1; P.gripL = 0.8; stanceLegs();
      return { pose: P, mask: WITH_LEGS };
    }
    case 'swing': case 'swing2h': {
      const twoH = a === 'swing2h' || two;
      const overhead = wk === 'axe' || (!twoH && swingN % 3 === 2);
      // windup 0-0.32, strike 0.32-0.55, recover
      const wu = ease(u / 0.32), st = clamp((u - 0.32) / 0.23, 0, 1), rc = clamp((u - 0.55) / 0.45, 0, 1);
      const sk = st * st;
      if (overhead) {
        const arm = u < 0.32 ? lerp(-1.4, -2.9, wu) : u < 0.55 ? lerp(-2.9, -0.75, sk) : lerp(-0.75, -1.0, rc);
        const fore = u < 0.32 ? lerp(-1.2, -1.5, wu) : u < 0.55 ? lerp(-1.5, -0.15, sk) : lerp(-0.15, -0.8, rc);
        const bend = u < 0.32 ? lerp(0, -0.15, wu) : u < 0.55 ? lerp(-0.15, 0.4, sk) : lerp(0.4, 0.1, rc);
        const wr = u < 0.32 ? lerp(0, -0.4, wu) : u < 0.55 ? lerp(-0.4, 1.0, sk) : lerp(1.0, 0.4, rc);
        set(P, 'uarmR', arm, 0, -0.15); set(P, 'farmR', fore, 0, 0); set(P, 'handR', wr, 0, 0);
        if (twoH) { set(P, 'uarmL', arm + 0.15, -0.5, 0.35); set(P, 'farmL', fore, 0, 0); } else { set(P, 'uarmL', -0.5, 0, 0.35); set(P, 'farmL', -1.0, 0, 0); }
        set(P, 'spine', 0.08 + bend, 0, 0); set(P, 'chest', bend * 0.5, -0.1, 0); set(P, 'head', 0.1 + bend * 0.3, 0.1, 0);
        P.rootY = -0.06 * st;
      } else if (twoH) {
        // horizontal two-handed swing through keyframes: cocked, wound up, contact, follow-through
        const K2: [number, Record<string, V>][] = [
          [0, { uarmR: [-0.5, 0.35, -0.55], farmR: [-2.0, 0.3, 0], handR: [-0.5, 0, 0], uarmL: [-1.05, -0.75, 0.45], farmL: [-1.5, 0, 0], handL: [-0.4, 0, 0], chest: [0.04, -0.45, 0], spine: [0.1, -0.1, 0], hips: [0, 0, 0] }],
          [0.32, { uarmR: [-0.6, 0.5, -0.8], farmR: [-2.2, 0.3, 0], handR: [-0.7, 0, 0], uarmL: [-1.2, -0.95, 0.5], farmL: [-1.7, 0, 0], handL: [-0.6, 0, 0], chest: [0.04, -0.85, 0], spine: [0.12, -0.3, 0], hips: [0, -0.15, 0] }],
          [0.55, { uarmR: [-1.4, 0.55, 0.0], farmR: [-0.25, 0, 0], handR: [1.2, 0, 0], uarmL: [-1.45, -0.25, 0.2], farmL: [-0.3, 0, 0], handL: [1.2, 0, 0], chest: [0.06, 0.5, 0], spine: [0.14, 0.25, 0], hips: [0, 0.2, 0] }],
          [1, { uarmR: [-1.6, 0.9, 0.2], farmR: [-1.3, 0, 0], handR: [0.6, 0, 0], uarmL: [-0.9, -0.2, 0.6], farmL: [-1.4, 0, 0], handL: [0.4, 0, 0], chest: [0.04, 0.95, 0], spine: [0.1, 0.35, 0], hips: [0, 0.25, 0] }],
        ];
        let i = 0; while (i < K2.length - 2 && u > K2[i + 1][0]) i++;
        const [u0, a0] = K2[i], [u1, a1] = K2[i + 1];
        const f = (u - u0) / (u1 - u0);
        const kf = i === 1 ? f * f : ease(f);
        for (const jn of Object.keys(a0)) { const A = a0[jn], Bv = a1[jn]; set(P, jn as JointName, lerp(A[0], Bv[0], kf), lerp(A[1], Bv[1], kf), lerp(A[2], Bv[2], kf)); }
        set(P, 'head', 0.05, -(P.chest![1] * 0.6), 0);
        set(P, 'thighL', -0.2, 0, 0.12); set(P, 'shinL', 0.25, 0, 0); set(P, 'thighR', 0.15 - st * 0.1, 0, -0.12); set(P, 'shinR', 0.25 + st * 0.2, 0, 0); set(P, 'footR', -0.3 - st * 0.3, 0, 0);
        P.rootY = -0.05;
      } else {
        // diagonal side swing, forehand / backhand alternating
        const back = swingN % 2 === 1;
        const s0 = back ? 0.7 : -0.85, s1 = back ? -0.6 : 0.75;
        const tw = u < 0.32 ? lerp(-0.2, s0, wu) : u < 0.55 ? lerp(s0, s1, sk) : lerp(s1, 0, rc);
        const arm = u < 0.32 ? lerp(-1.1, -1.7, wu) : u < 0.55 ? lerp(-1.7, -1.15, sk) : lerp(-1.15, -1.0, rc);
        const ab = u < 0.32 ? lerp(-0.6, back ? 0.5 : -1.1, wu) : u < 0.55 ? lerp(back ? 0.5 : -1.1, back ? -0.9 : 0.35, sk) : lerp(back ? -0.9 : 0.35, -0.5, rc);
        const fore = u < 0.32 ? lerp(-1.4, -1.9, wu) : u < 0.55 ? lerp(-1.9, -0.25, sk) : lerp(-0.25, -1.0, rc);
        // the wrist snaps through the strike so the weapon leads the hand into the target
        const wr = u < 0.32 ? lerp(-0.2, -0.6, wu) : u < 0.55 ? lerp(-0.6, 1.3, sk) : lerp(1.3, 0.5, rc);
        set(P, 'uarmR', arm, 0.2, ab); set(P, 'farmR', fore, 0, 0); set(P, 'handR', wr, 0, 0);
        set(P, 'uarmL', -0.5, 0, 0.35); set(P, 'farmL', -1.2, 0, 0);
        set(P, 'chest', 0.05, tw * 0.6, 0); set(P, 'spine', 0.14, tw * 0.3, 0); set(P, 'head', 0.06, -tw * 0.4, 0);
        P.rootY = -0.04;
      }
      P.gripR = 1; if (twoH) P.gripL = 1;
      return { pose: P, mask: overhead || !twoH ? UPPER : WITH_LEGS };
    }
    case 'stab': {
      const k = u < 0.35 ? ease(u / 0.35) * -0.3 : u < 0.55 ? lerp(-0.3, 1, ease((u - 0.35) / 0.2)) : 1 - ease((u - 0.55) / 0.45);
      const kk = Math.max(0, k);
      if (wk === 'spear' || two) {
        set(P, 'uarmR', lerp(-0.35, -1.25, kk), 0.2, -0.2); set(P, 'farmR', lerp(-1.3, -0.15, kk), 0.2, 0); set(P, 'handR', 1.35, 0, 0);
        set(P, 'uarmL', lerp(-1.05, -1.5, kk), -0.4, 0.15); set(P, 'farmL', lerp(-0.5, -0.1, kk), 0, 0); set(P, 'handL', 1.2, 0, 0);
        set(P, 'chest', 0.05, lerp(-0.35, -0.1, kk), 0); set(P, 'spine', 0.12 + kk * 0.15, 0, 0);
        set(P, 'thighL', -0.3 - kk * 0.3, 0, 0.08); set(P, 'shinL', 0.3 + kk * 0.3, 0, 0); set(P, 'thighR', 0.2 + kk * 0.15, 0, -0.08); set(P, 'shinR', 0.2, 0, 0);
        P.rootY = -0.05 - kk * 0.05; P.gripL = 1; P.gripR = 1;
        return { pose: P, mask: WITH_LEGS };
      }
      set(P, 'uarmR', lerp(-0.55, -1.55, kk) + Math.min(0, k) * -0.6, 0.1, -0.15); set(P, 'farmR', lerp(-1.7, -0.05, kk), 0, 0); set(P, 'handR', 1.2, 0, 0);
      set(P, 'chest', 0.05, lerp(-0.35, 0.3, kk), 0); set(P, 'spine', 0.1 + kk * 0.12, 0, 0);
      set(P, 'uarmL', -0.5, 0, 0.3); set(P, 'farmL', -1.2, 0, 0);
      P.gripR = 1;
      return { pose: P };
    }
    case 'shove': {
      const k = u < 0.28 ? ease(u / 0.28) : 1 - ease((u - 0.28) / 0.72);
      set(P, 'uarmL', lerp(-0.6, -1.5, k), -0.2, 0.15); set(P, 'farmL', lerp(-1.6, -0.15, k), 0, 0); set(P, 'handL', -0.9 * k, 0, 0);
      set(P, 'uarmR', lerp(-0.6, -1.5, k), 0.2, -0.15); set(P, 'farmR', lerp(-1.6, -0.15, k), 0, 0); set(P, 'handR', -0.9 * k, 0, 0);
      set(P, 'spine', 0.2 * k, 0, 0); set(P, 'chest', 0.1 * k, 0, 0);
      set(P, 'thighL', -0.35 * k, 0, 0.05); set(P, 'shinL', 0.3 * k, 0, 0); set(P, 'thighR', 0.25 * k, 0, -0.05);
      P.rootY = -0.04 * k; P.gripL = 0; P.gripR = inp.holding ? 1 : 0;
      return { pose: P, mask: WITH_LEGS };
    }
    case 'aim_gun': case 'shoot': {
      const kick = a === 'shoot' ? (u < 0.12 ? u / 0.12 : 1 - ease((u - 0.12) / 0.88)) : 0;
      const sway = Math.sin(time * 1.3) * 0.015 * (1 + (inp.panic ?? 0) * 4) + Math.sin(time * 23) * 0.01 * (inp.panic ?? 0);
      set(P, 'uarmR', -1.5 - ap * 0.5 - kick * 0.3 + sway, 0.18, -0.08); set(P, 'farmR', -0.08 - kick * 0.3, 0, 0); set(P, 'handR', -0.05 + kick * 0.5, 0, 0);
      set(P, 'uarmL', -1.42 - ap * 0.5 - kick * 0.25 + sway, -0.62, 0.12); set(P, 'farmL', -0.22, 0.2, 0); set(P, 'handL', 0, 0, 0.5);
      set(P, 'chest', 0.02 - kick * 0.05, -0.12, 0); set(P, 'spine', 0.04, 0, 0); set(P, 'head', 0.05, 0.14, 0.04);
      P.gripR = 1; P.gripL = 0.8;
      stanceLegs(0.6);
      return { pose: P, mask: WITH_LEGS };
    }
    case 'aim_throw':
      set(P, 'uarmR', -2.5, 0.2, -0.45); set(P, 'farmR', -1.3, 0, 0); set(P, 'handR', -0.4, 0, 0);
      set(P, 'uarmL', -1.3, -0.3, 0.3); set(P, 'farmL', -0.3, 0, 0);
      set(P, 'chest', -0.05, -0.45, 0); set(P, 'spine', -0.04, -0.15, 0); set(P, 'head', 0, 0.5, 0);
      P.gripR = 1; stanceLegs(1.1);
      return { pose: P, mask: WITH_LEGS };
    case 'throw': {
      const k = u < 0.35 ? 0 : ease((u - 0.35) / 0.25);
      set(P, 'uarmR', lerp(-2.6, -0.7, k), 0.2, lerp(-0.45, 0.1, k)); set(P, 'farmR', lerp(-1.4, -0.1, k), 0, 0); set(P, 'handR', lerp(-0.4, 0.6, k), 0, 0);
      set(P, 'uarmL', lerp(-1.3, -0.2, k), 0, 0.3); set(P, 'farmL', -0.5, 0, 0);
      set(P, 'chest', 0.15 * k, lerp(-0.5, 0.45, k), 0); set(P, 'spine', 0.1 * k, lerp(-0.15, 0.2, k), 0);
      set(P, 'thighL', -0.3 * k, 0, 0.1); set(P, 'shinL', 0.3 * k, 0, 0); set(P, 'thighR', 0.2 * k, 0, -0.1);
      P.gripR = k > 0.5 ? 0 : 1;
      return { pose: P, mask: WITH_LEGS };
    }
    case 'eat': case 'drink': {
      const drink = a === 'drink';
      const cyc = (t * (drink ? 0.5 : 0.9)) % 1;
      const up = drink ? ease(clamp(cyc * 3, 0, 1)) * (1 - ease(clamp((cyc - 0.75) * 4, 0, 1))) : Math.max(0, Math.sin(cyc * Math.PI * 2));
      const chew = Math.sin(time * 9) * 0.03;
      set(P, 'uarmR', -0.55 - up * 0.55, 0.35, -0.3); set(P, 'farmR', -1.4 - up * 0.85, 0, 0); set(P, 'handR', drink ? -0.4 * up : 0.2, 0, 0);
      set(P, 'head', drink ? 0.1 - up * 0.55 : 0.18 - up * 0.1 + chew, 0, 0);
      set(P, 'uarmL', -0.35, 0.1, 0.2); set(P, 'farmL', -1.4, 0.3, 0);
      set(P, 'chest', drink ? -0.08 * up : 0.03, 0, 0);
      P.gripR = 0.9; P.gripL = 0.6;
      return { pose: P };
    }
    case 'pickup': case 'loot': {
      const pick = a === 'pickup';
      const d = pick ? Math.sin(u * Math.PI) : 1;
      const rum = pick ? 0 : Math.sin(t * 5);
      const q: Pose = {};
      q.rootY = -0.5 * d;
      set(q, 'spine', 0.55 * d, 0, 0); set(q, 'chest', 0.25 * d, rum * 0.08, 0); set(q, 'head', 0.25 * d, rum * 0.1, 0);
      set(q, 'uarmR', -1.0 * d + rum * 0.2, 0, -0.1); set(q, 'farmR', -0.5 - rum * 0.25, 0, 0);
      set(q, 'uarmL', -0.9 * d - rum * 0.2, 0, 0.1); set(q, 'farmL', -0.6 + rum * 0.25, 0, 0);
      set(q, 'thighL', -1.35 * d, 0, 0.12); set(q, 'shinL', 1.65 * d, 0, 0); set(q, 'footL', -0.3 * d, 0, 0);
      set(q, 'thighR', -0.45 * d, 0, -0.12); set(q, 'shinR', 1.9 * d, 0, 0); set(q, 'footR', 0.55 * d, 0, 0);
      q.gripR = pick && u > 0.5 ? 1 : 0.5; q.gripL = 0.5;
      return { pose: q, mask: [...UPPER, ...LEGS] };
    }
    case 'craft': case 'type': case 'bandage': case 'stitch': case 'mix': case 'cook': {
      const fast = a === 'type' ? 14 : a === 'stitch' ? 8 : a === 'mix' ? 6 : 4.5;
      const r = Math.sin(t * fast), r2 = Math.sin(t * fast * 0.5 + 1);
      set(P, 'uarmR', -0.62 + r2 * 0.05, 0.32, -0.12); set(P, 'farmR', -1.25 + r * 0.16, a === 'mix' ? r * 0.4 : 0, 0); set(P, 'handR', 0.2, 0, -0.2 + r * 0.1);
      set(P, 'uarmL', -0.62 - r2 * 0.05, -0.32, 0.12); set(P, 'farmL', -1.25 - r * 0.12, 0, 0); set(P, 'handL', 0.2, 0, 0.2);
      set(P, 'head', 0.48, r2 * 0.08, 0); set(P, 'spine', 0.14, 0, 0); set(P, 'chest', 0.06, 0, 0);
      P.gripR = a === 'type' ? 0.2 : 0.8; P.gripL = 0.6;
      return { pose: P };
    }
    case 'hammer': {
      const c = (t * 1.6) % 1;
      const hit = c < 0.55 ? ease(c / 0.55) : 1 - ease((c - 0.55) / 0.45) * 0.15;
      const up = c < 0.55 ? 1 - hit : 0;
      set(P, 'uarmR', -1.25 - up * 0.65, 0.1, -0.25); set(P, 'farmR', -1.5 + (1 - up) * 0.8, 0, 0); set(P, 'handR', -0.3 * up, 0, 0);
      set(P, 'uarmL', -1.0, -0.2, 0.25); set(P, 'farmL', -0.6, 0, 0);
      set(P, 'spine', 0.15, 0.08, 0); set(P, 'head', 0.3, 0.1, 0);
      P.gripR = 1; P.gripL = 0.8;
      return { pose: P };
    }
    case 'saw': {
      const r = Math.sin(t * 7);
      set(P, 'uarmR', -0.75 + r * 0.25, 0.1, -0.2); set(P, 'farmR', -1.2 + r * 0.6, 0, 0);
      set(P, 'uarmL', -0.7, -0.2, 0.3); set(P, 'farmL', -0.9, 0, 0);
      set(P, 'spine', 0.32, 0, 0); set(P, 'chest', 0, r * 0.06, 0); set(P, 'head', 0.3, 0, 0);
      P.gripR = 1; P.gripL = 0.9;
      return { pose: P };
    }
    case 'dig': {
      const c = (t * 0.9) % 1;
      const down = c < 0.4 ? ease(c / 0.4) : 1 - ease((c - 0.4) / 0.6);
      set(P, 'uarmR', -0.7 + down * 0.3, 0.2, -0.1); set(P, 'farmR', -0.6, 0, 0); set(P, 'uarmL', -1.1 + down * 0.5, -0.3, 0.15); set(P, 'farmL', -0.4, 0, 0);
      set(P, 'spine', 0.3 + down * 0.25, 0, 0); set(P, 'head', 0.25, 0, 0);
      set(P, 'thighL', -0.4 * down, 0, 0.05); set(P, 'shinL', 0.5 * down, 0, 0); set(P, 'thighR', -0.1, 0, -0.05); set(P, 'shinR', 0.3 * down, 0, 0);
      P.rootY = -0.08 * down; P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: [...UPPER, ...LEGS] };
    }
    case 'pour':
      set(P, 'uarmR', -1.1, 0.25, -0.2); set(P, 'farmR', -0.7, 0, -0.9); set(P, 'head', 0.42, 0, 0); set(P, 'uarmL', -0.5, 0, 0.2); set(P, 'farmL', -1.2, 0, 0);
      P.gripR = 1;
      return { pose: P };
    case 'read':
      set(P, 'uarmR', -0.75, 0.38, -0.1); set(P, 'farmR', -1.65, 0, 0); set(P, 'handR', 0, 0, -0.4);
      set(P, 'uarmL', -0.75, -0.38, 0.1); set(P, 'farmL', -1.65, 0, 0); set(P, 'handL', 0, 0, 0.4);
      set(P, 'head', 0.5 + Math.sin(time * 0.4) * 0.03, 0, 0); P.gripL = 0.6; P.gripR = 0.6;
      return { pose: P };
    case 'scanner':
      set(P, 'uarmR', -0.62, 0.42, -0.05); set(P, 'farmR', -1.58, 0, 0); set(P, 'handR', 0, 0, 0.3);
      set(P, 'uarmL', -0.62, -0.42, 0.05); set(P, 'farmL', -1.58, 0, 0); set(P, 'handL', 0, 0, -0.3);
      set(P, 'head', 0.55, 0, 0); set(P, 'chest', 0.06, 0, 0); P.gripL = 0.8; P.gripR = 0.8;
      return { pose: P };
    case 'carry':
      // a survivor over the right shoulder (or a heavy load held to the chest)
      set(P, 'uarmR', -1.6, 0.3, -0.35); set(P, 'farmR', -1.55, 0, 0); set(P, 'uarmL', -0.5, 0.1, 0.25); set(P, 'farmL', -1.1, 0, 0);
      set(P, 'spine', 0.12, 0, -0.04); set(P, 'chest', 0, 0, -0.04); P.gripR = 1; P.gripL = 0.9;
      return { pose: P };
    case 'push':
      set(P, 'uarmR', -1.15, 0.1, -0.05); set(P, 'farmR', -0.35, 0, 0); set(P, 'uarmL', -1.15, -0.1, 0.05); set(P, 'farmL', -0.35, 0, 0);
      set(P, 'handR', -1.0, 0, 0); set(P, 'handL', -1.0, 0, 0); set(P, 'spine', 0.25, 0, 0); P.gripL = 0; P.gripR = 0;
      return { pose: P };
    case 'hold_item':
      set(P, 'uarmR', -0.45, 0.1, -0.12); set(P, 'farmR', -1.05, 0, 0); P.gripR = 1;
      return { pose: P, mask: ARM_R };
    case 'hold_light':
      set(P, 'uarmR', -0.8, 0, -0.08); set(P, 'farmR', -0.38, 0, 0); P.gripR = 1;
      return { pose: P, mask: ARM_R };
    case 'flinch': {
      const k = Math.sin(u * Math.PI);
      set(P, 'chest', -0.35 * k, 0.2 * k, 0); set(P, 'head', -0.4 * k, 0, 0.2 * k);
      set(P, 'uarmL', -1.3 * k, -0.3 * k, 0.5 * k); set(P, 'farmL', -1.9 * k, 0, 0);
      set(P, 'uarmR', -0.4 * k, 0, -0.3 * k); set(P, 'farmR', -1.0 * k, 0, 0);
      return { pose: P };
    }
    case 'shiver': {
      const sh = Math.sin(time * 40) * 0.03;
      set(P, 'uarmL', -0.5, 0, -0.32 + sh); set(P, 'farmL', -1.45, 0.5, 0); set(P, 'uarmR', -0.5, 0, 0.32 - sh); set(P, 'farmR', -1.45, -0.5, 0);
      set(P, 'chest', 0.12, 0, sh); set(P, 'head', 0.15, 0, 0);
      return { pose: P };
    }
    case 'cough': {
      const k = Math.max(0, Math.sin(u * Math.PI * 3));
      set(P, 'chest', 0.35 * k, 0, 0); set(P, 'spine', 0.15 * k, 0, 0); set(P, 'head', 0.3 * k, 0, 0); set(P, 'uarmR', -1.2, 0.3, -0.3); set(P, 'farmR', -2.1, 0, 0);
      P.gripR = 0.8;
      return { pose: P };
    }
    case 'cover_ears':
      set(P, 'uarmR', -0.4, 0, -1.9); set(P, 'farmR', -2.4, 0, 0); set(P, 'uarmL', -0.4, 0, 1.9); set(P, 'farmL', -2.4, 0, 0); set(P, 'head', 0.35, 0, 0); set(P, 'spine', 0.2, 0, 0);
      P.gripL = 0.2; P.gripR = 0.2;
      return { pose: P };
    case 'wave': return emotePose('wave', t, time);
    case 'breathe': {
      // slow box breathing: hands on chest and belly, eyes closed, shoulders rise and fall
      const c = (t / 16) % 1, ph4 = Math.floor(c * 4), f = (c * 4) % 1;
      const fill = ph4 === 0 ? ease(f) : ph4 === 1 ? 1 : ph4 === 2 ? 1 - ease(f) : 0;
      set(P, 'chest', -0.08 * fill, 0, 0); set(P, 'neck', 0.05, 0, 0); set(P, 'head', 0.18 - fill * 0.12, 0, 0);
      set(P, 'uarmR', -0.5, 0.45, -0.1 - fill * 0.05); set(P, 'farmR', -1.75, 0, 0); set(P, 'handR', 0.2, 0, -0.4);
      set(P, 'uarmL', -0.3, -0.3, 0.12 + fill * 0.05); set(P, 'farmL', -1.4, 0, 0); set(P, 'handL', 0.2, 0, 0.4);
      P.gripL = 0.1; P.gripR = 0.1; P.blink = 1;
      return { pose: P };
    }
    case 'pray':
      set(P, 'uarmR', -0.6, 0.6, 0); set(P, 'farmR', -1.85, 0, 0); set(P, 'uarmL', -0.6, -0.6, 0); set(P, 'farmL', -1.85, 0, 0); set(P, 'head', 0.5, 0, 0);
      P.gripL = 0; P.gripR = 0;
      return { pose: P };
    case 'reload': {
      const r = Math.sin(u * Math.PI * 2);
      set(P, 'uarmR', -0.9, 0.35, -0.1); set(P, 'farmR', -1.3, 0, 0); set(P, 'handR', 0, 0, -0.5);
      set(P, 'uarmL', -0.75 + r * 0.3, -0.3, 0.1); set(P, 'farmL', -1.5, 0, 0);
      set(P, 'head', 0.45, -0.1, 0); P.gripR = 1; P.gripL = u > 0.3 && u < 0.7 ? 1 : 0.4;
      return { pose: P };
    }
    default:
      return { pose: P };
  }
}

// ------------------------------------------------------------------ emotes
const EMOTE_DUR: Record<EmoteName, number> = { wave: 2.4, flex: 2.6, dance: 6, jumping_jacks: 5, shrug: 1.8, salute: 2.2, point: 2.2, facepalm: 2.2, sit_wait: 10, cheer: 2.2, clap: 3, bow: 2 };

function emotePose(name: EmoteName, et: number, time: number): { pose: Pose; mask: JointName[] } {
  const P: Pose = {};
  const D = EMOTE_DUR[name] || 2;
  const u = clamp(et / D, 0, 1);
  const e = env(u, 0.15, 0.2);
  switch (name) {
    case 'wave': {
      const k = Math.sin(time * 9) * 0.45;
      set(P, 'uarmR', -0.25, 0.1, -2.45 * e); set(P, 'farmR', -0.25 * e, 0, (-0.35 + k) * e); set(P, 'handR', 0, 0, k * 0.4);
      set(P, 'head', 0.0, 0.1, -0.1 * e); set(P, 'chest', 0, 0, 0.05 * e);
      P.gripR = 0;
      return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'head', 'chest'] };
    }
    case 'flex': {
      const pump = 0.5 + 0.5 * Math.sin(time * 6);
      // upper arms out to the sides, rolled so the elbows bend upward
      set(P, 'uarmL', -1.45 * e, 0, 1.45 * e); set(P, 'farmL', -(1.75 + pump * 0.25) * e, 0, 0); set(P, 'handL', 0.3 * e, 0, 0);
      set(P, 'uarmR', -1.45 * e, 0, -1.45 * e); set(P, 'farmR', -(1.75 + pump * 0.25) * e, 0, 0); set(P, 'handR', 0.3 * e, 0, 0);
      set(P, 'chest', -0.12 * e, 0, 0); set(P, 'spine', -0.05 * e, 0, 0); set(P, 'head', -0.1 * e, Math.sin(time * 1.5) * 0.2, 0);
      set(P, 'thighL', 0, 0, 0.12 * e); set(P, 'thighR', 0, 0, -0.12 * e);
      P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: [...UPPER, 'thighL', 'thighR'] };
    }
    case 'dance': {
      const b = time * 4.2;
      const s = Math.sin(b), c = Math.cos(b), s2 = Math.sin(b * 2);
      P.rootY = -0.05 - Math.abs(s) * 0.05; P.rootX = s * 0.06;
      set(P, 'hips', 0, s * 0.25, s * 0.1);
      set(P, 'spine', 0.05, -s * 0.15, -s * 0.08); set(P, 'chest', 0, -s * 0.15, 0); set(P, 'head', s2 * 0.1, s * 0.25, -s * 0.12);
      set(P, 'uarmL', -1.2 - c * 0.9, 0, 0.5); set(P, 'farmL', -1.4 + c * 0.5, 0, 0);
      set(P, 'uarmR', -1.2 + c * 0.9, 0, -0.5); set(P, 'farmR', -1.4 - c * 0.5, 0, 0);
      set(P, 'thighL', -0.3 - Math.max(0, s) * 0.4, 0, 0.12); set(P, 'shinL', 0.4 + Math.max(0, s) * 0.5, 0, 0);
      set(P, 'thighR', -0.3 - Math.max(0, -s) * 0.4, 0, -0.12); set(P, 'shinR', 0.4 + Math.max(0, -s) * 0.5, 0, 0);
      set(P, 'footL', -0.1, 0, 0); set(P, 'footR', -0.1, 0, 0);
      P.gripL = 0.7; P.gripR = 0.7;
      return { pose: P, mask: ALL };
    }
    case 'jumping_jacks': {
      const c = (time * 1.6) % 1;
      const o = Math.sin(c * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // 0 closed .. 1 open
      const hop = Math.abs(Math.sin(c * Math.PI * 2));
      P.rootY = hop * 0.09;
      set(P, 'uarmL', 0, 0, 0.1 + o * 2.85); set(P, 'uarmR', 0, 0, -0.1 - o * 2.85); set(P, 'farmL', -0.15, 0, 0); set(P, 'farmR', -0.15, 0, 0);
      set(P, 'thighL', 0, 0, 0.02 + o * 0.32); set(P, 'thighR', 0, 0, -0.02 - o * 0.32);
      set(P, 'shinL', 0.1 + (1 - hop) * 0.25, 0, 0); set(P, 'shinR', 0.1 + (1 - hop) * 0.25, 0, 0);
      set(P, 'footL', hop * 0.3, 0, -o * 0.3); set(P, 'footR', hop * 0.3, 0, o * 0.3);
      set(P, 'head', -0.05, 0, 0);
      P.gripL = 0; P.gripR = 0;
      return { pose: P, mask: ALL };
    }
    case 'shrug': {
      set(P, 'uarmL', -0.25 * e, 0, 0.45 * e); set(P, 'farmL', -1.45 * e, 0.6 * e, 0); set(P, 'handL', 0, 0, 0.9 * e);
      set(P, 'uarmR', -0.25 * e, 0, -0.45 * e); set(P, 'farmR', -1.45 * e, -0.6 * e, 0); set(P, 'handR', 0, 0, -0.9 * e);
      set(P, 'chest', -0.08 * e, 0, 0); set(P, 'neck', -0.05 * e, 0, 0); set(P, 'head', 0.05, 0, 0.22 * e);
      P.gripL = 0; P.gripR = 0;
      return { pose: P, mask: UPPER };
    }
    case 'salute': {
      set(P, 'uarmR', -0.55 * e, 0.3, -1.35 * e); set(P, 'farmR', -2.3 * e, 0, 0); set(P, 'handR', 0.3 * e, 0, -0.3 * e);
      set(P, 'uarmL', 0, 0, 0.03); set(P, 'farmL', -0.05, 0, 0);
      set(P, 'chest', -0.08 * e, 0, 0); set(P, 'head', -0.05 * e, 0, 0);
      set(P, 'thighL', 0, 0, 0); set(P, 'thighR', 0, 0, 0); set(P, 'shinL', 0, 0, 0); set(P, 'shinR', 0, 0, 0);
      P.gripR = 0; P.gripL = 0.5;
      return { pose: P, mask: [...UPPER, 'thighL', 'thighR', 'shinL', 'shinR', 'hips'] };
    }
    case 'point': {
      set(P, 'uarmR', -1.52 * e, 0.12, -0.1); set(P, 'farmR', -0.05, 0, 0); set(P, 'handR', -0.1, 0, 0);
      set(P, 'chest', 0, -0.15 * e, 0); set(P, 'head', 0.02, 0.18 * e, 0);
      P.gripR = 0.8;
      return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'chest', 'head'] };
    }
    case 'facepalm': {
      const shake = Math.sin(time * 3) * 0.08 * e;
      set(P, 'uarmR', -1.0 * e, 0.45 * e, -0.2); set(P, 'farmR', -2.35 * e, 0, 0); set(P, 'handR', 0.5 * e, 0, 0);
      set(P, 'head', 0.4 * e, shake, 0); set(P, 'neck', 0.1 * e, 0, 0); set(P, 'chest', 0.12 * e, 0, 0);
      P.gripR = 0;
      return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'head', 'neck', 'chest'] };
    }
    case 'sit_wait': {
      const look = Math.sin(time * 0.35) * 0.5;
      P.rootY = -0.86;
      set(P, 'thighL', -1.45, -0.5, 0.75); set(P, 'thighR', -1.45, 0.5, -0.75);
      set(P, 'shinL', 2.35, 0, 0); set(P, 'shinR', 2.35, 0, 0); set(P, 'footL', -0.3, 0, -0.4); set(P, 'footR', -0.3, 0, 0.4);
      set(P, 'spine', 0.22, 0, 0); set(P, 'chest', 0.05, look * 0.2, 0); set(P, 'head', 0.05, look, 0);
      set(P, 'uarmL', -0.55, -0.1, 0.12); set(P, 'farmL', -0.7, 0, 0); set(P, 'uarmR', -0.55, 0.1, -0.12); set(P, 'farmR', -0.7, 0, 0);
      P.gripL = 0.4; P.gripR = 0.4;
      return { pose: P, mask: ALL };
    }
    case 'cheer': {
      const j = Math.abs(Math.sin(time * 6)) * e;
      set(P, 'uarmL', -0.3, 0, 2.6 * e); set(P, 'uarmR', -0.3, 0, -2.6 * e); set(P, 'farmL', -0.3 - j * 0.3, 0, 0); set(P, 'farmR', -0.3 - j * 0.3, 0, 0);
      set(P, 'head', -0.25 * e, 0, 0); set(P, 'chest', -0.1 * e, 0, 0);
      P.rootY = j * 0.06; P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: UPPER };
    }
    case 'clap': {
      const c = Math.abs(Math.sin(time * 7));
      set(P, 'uarmL', -0.7, -0.35, 0.15); set(P, 'farmL', -1.3, 0, 0); set(P, 'handL', 0, 0, 0.6 + c * 0.25);
      set(P, 'uarmR', -0.7, 0.35, -0.15); set(P, 'farmR', -1.3, 0, 0); set(P, 'handR', 0, 0, -0.6 - c * 0.25);
      set(P, 'uarmL', -0.7, -0.25 - c * 0.15, 0.15); set(P, 'uarmR', -0.7, 0.25 + c * 0.15, -0.15);
      P.gripL = 0; P.gripR = 0;
      return { pose: P, mask: ARMS };
    }
    case 'bow': {
      const b = Math.sin(u * Math.PI);
      set(P, 'spine', 0.6 * b, 0, 0); set(P, 'chest', 0.25 * b, 0, 0); set(P, 'head', 0.2 * b, 0, 0);
      set(P, 'uarmL', 0.05, 0, 0.05); set(P, 'uarmR', -0.6 * b, 0.6 * b, -0.1); set(P, 'farmR', -1.4 * b, 0, 0);
      return { pose: P, mask: UPPER };
    }
  }
  return { pose: P, mask: [] };
}

// ------------------------------------------------------------------ full body
function fullPose(f: FullBody, t: number, ft: number, inp: AnimInput): Pose {
  const P: Pose = {};
  switch (f) {
    case 'sit': {
      const shift = Math.sin(t * 0.25) * 0.5 + 0.5;
      P.rootY = -0.47;
      set(P, 'thighL', -1.55, -0.06, 0.08); set(P, 'thighR', -1.55, 0.06, -0.08);
      set(P, 'shinL', 1.45 + shift * 0.15, 0, 0); set(P, 'shinR', 1.6 - shift * 0.15, 0, 0);
      set(P, 'footL', 0.1, 0, 0); set(P, 'footR', 0.0, 0, 0);
      set(P, 'spine', -0.08 + shift * 0.06, 0, 0); set(P, 'chest', 0.04, 0, 0);
      set(P, 'uarmL', -0.42, -0.1, 0.12); set(P, 'farmL', -0.85, 0, 0); set(P, 'handL', -0.5, 0, 0);
      set(P, 'uarmR', -0.42, 0.1, -0.12); set(P, 'farmR', -0.85, 0, 0); set(P, 'handR', -0.5, 0, 0);
      set(P, 'head', 0.08 + Math.sin(t * 0.3) * 0.05, Math.sin(t * 0.21) * 0.35, 0);
      P.gripL = 0.4; P.gripR = 0.4;
      return P;
    }
    case 'kneel':
      P.rootY = -0.42;
      set(P, 'thighL', -1.4, 0, 0.05); set(P, 'shinL', 1.5, 0, 0); set(P, 'footL', -0.1, 0, 0);
      set(P, 'thighR', 0.15, 0, -0.05); set(P, 'shinR', 1.65, 0, 0); set(P, 'footR', 0.7, 0, 0);
      set(P, 'spine', 0.28, 0, 0); set(P, 'head', 0.3, 0, 0);
      return P;
    case 'lie': case 'lie_side': {
      const breath = Math.sin(t * 1.1) * 0.025;
      P.bodyPitch = -1.5708; P.bodyY = 0.13;
      if (f === 'lie_side') {
        // curled up on the side
        P.bodyRoll = 1.45; P.bodyY = 0.16;
        set(P, 'thighL', -0.9, 0, 0.05); set(P, 'shinL', 1.3, 0, 0); set(P, 'thighR', -0.7, 0, -0.05); set(P, 'shinR', 1.2, 0, 0);
        set(P, 'uarmL', -1.2, 0, 0.1); set(P, 'farmL', -1.5, 0, 0); set(P, 'uarmR', -0.9, 0, -0.1); set(P, 'farmR', -1.3, 0, 0);
        set(P, 'spine', 0.25, 0, 0); set(P, 'chest', 0.15 + breath, 0, 0); set(P, 'head', 0.3, 0, 0);
      } else {
        set(P, 'chest', breath, 0, 0);
        set(P, 'uarmL', 0.1, 0, 0.28); set(P, 'uarmR', 0.05, 0, -0.22); set(P, 'farmL', -0.5, 0, 0); set(P, 'farmR', -1.4, 0.3, 0);
        set(P, 'head', -0.12, 0, 0.35);
        set(P, 'thighL', -0.06, 0, 0.05); set(P, 'thighR', -0.2, 0, -0.04); set(P, 'shinR', 0.3, 0, 0); set(P, 'footL', 0.5, 0, 0); set(P, 'footR', 0.5, 0, 0);
      }
      P.gripL = 0.4; P.gripR = 0.4;
      return P;
    }
    case 'dead': {
      // collapse (knees buckle, fall forward) then sprawl
      const k = ease(clamp(ft / 0.75, 0, 1));
      if (k < 1) {
        const fallP = ease(clamp((ft - 0.25) / 0.5, 0, 1));
        P.rootY = -0.35 * ease(clamp(ft / 0.3, 0, 1)) * (1 - fallP);
        set(P, 'thighL', -0.8 * (1 - fallP), 0, 0.1); set(P, 'shinL', 1.3 * (1 - fallP) + 0.1, 0, 0);
        set(P, 'thighR', -0.6 * (1 - fallP), 0, -0.1); set(P, 'shinR', 1.1 * (1 - fallP) + 0.1, 0, 0);
        P.bodyPitch = 1.5708 * fallP; P.bodyY = 0.13 * fallP;
        set(P, 'uarmL', -1.5 * fallP, 0, 0.5); set(P, 'uarmR', -1.2 * fallP, 0, -0.5); set(P, 'head', 0.3, 0.5 * fallP, 0);
        set(P, 'spine', 0.4 * (1 - fallP), 0, 0);
        return P;
      }
      P.bodyPitch = 1.5708; P.bodyY = 0.13;
      set(P, 'uarmL', -2.6, 0.2, 0.8); set(P, 'uarmR', -0.4, 0, -0.9); set(P, 'farmL', -0.5, 0, 0); set(P, 'farmR', -0.2, 0, 0);
      set(P, 'head', 0.3, 0.9, 0); set(P, 'thighL', 0.1, 0, 0.15); set(P, 'thighR', -0.6, 0, -0.1); set(P, 'shinR', 1.1, 0, 0);
      set(P, 'footL', 0.8, 0, 0); set(P, 'footR', 0.6, 0, 0);
      P.gripL = 0.2; P.gripR = 0.2;
      return P;
    }
    case 'downed': {
      // buckle to the knees, fall onto the hands, then lie clutching the wound and trying to rise
      const s = Math.sin(t * 2.2), wr = Math.sin(t * 0.7);
      if (ft < 1.1) {
        const a = ease(clamp(ft / 0.35, 0, 1)), b = ease(clamp((ft - 0.35) / 0.45, 0, 1)), c = ease(clamp((ft - 0.8) / 0.3, 0, 1));
        P.rootY = -0.45 * a * (1 - c) - 0.84 * c;
        set(P, 'thighL', -1.2 * a * (1 - c) + 0.1 * c, 0, 0.1); set(P, 'shinL', 1.6 * a * (1 - c) + 0.3 * c, 0, 0);
        set(P, 'thighR', -0.3 * a * (1 - c), 0, -0.1); set(P, 'shinR', 1.8 * a * (1 - c) + 0.3 * c, 0, 0);
        set(P, 'spine', 0.4 * a * (1 - c) + 0.4 * b * (1 - c), 0, 0);
        set(P, 'uarmL', -1.3 * b, 0, 0.3); set(P, 'uarmR', -1.3 * b, 0, -0.3); set(P, 'farmL', -0.3, 0, 0); set(P, 'farmR', -0.3, 0, 0);
        P.bodyPitch = 1.4 * c; P.bodyY = 0.14 * c; set(P, 'head', -0.9 * c + 0.3 * (1 - c), 0, 0);
        P.gripL = 0; P.gripR = 0;
        return P;
      }
      P.bodyPitch = 1.4; P.bodyY = 0.15; P.rootY = -0.84; P.bodyRoll = 0.35 + wr * 0.05;
      set(P, 'uarmL', -2.2 + s * 0.25, 0, 0.35); set(P, 'farmL', -0.6, 0, 0);
      set(P, 'uarmR', -0.9, 0.5, -0.1); set(P, 'farmR', -1.9, 0, 0); set(P, 'handR', 0.4, 0, 0);
      set(P, 'head', -0.75 + Math.max(0, Math.sin(t * 0.5)) * 0.35, Math.sin(t * 0.3) * 0.3, 0);
      set(P, 'thighL', -0.4 + wr * 0.1, 0, 0.1); set(P, 'shinL', 0.9, 0, 0); set(P, 'thighR', 0.1, 0, -0.1); set(P, 'shinR', 0.35, 0, 0);
      set(P, 'footL', 0.6, 0, 0); set(P, 'footR', 0.8, 0, 0);
      P.gripL = 0.8; P.gripR = 0.9;
      return P;
    }
    case 'carried': {
      // folded over the carrier's shoulder: legs in front, torso hanging down the back
      const sway = Math.sin(t * 2.5) * 0.06 * clamp(inp.speed, 0, 1);
      P.bodyYaw = Math.PI; P.bodyPitch = -1.5708; P.rootY = -0.94; P.bodyY = 1.43;
      set(P, 'spine', 0.75, 0, 0); set(P, 'chest', 0.5 + sway, 0, 0); set(P, 'neck', 0.2, 0, 0); set(P, 'head', 0.3, 0.3, 0);
      set(P, 'thighL', -1.35, 0, 0.06); set(P, 'thighR', -1.45, 0, -0.06); set(P, 'shinL', 1.0 + sway, 0, 0); set(P, 'shinR', 1.15 - sway, 0, 0);
      set(P, 'uarmL', -2.6 + sway, 0, 0.12); set(P, 'uarmR', -2.7 - sway, 0, -0.12); set(P, 'farmL', -0.3, 0, 0); set(P, 'farmR', -0.25, 0, 0);
      P.gripL = 0.2; P.gripR = 0.2;
      return P;
    }
    case 'vault': {
      const u = (t * 1.5) % 1;
      P.rootY = Math.sin(u * Math.PI) * 0.45;
      set(P, 'thighL', -1.4, 0, 0.2); set(P, 'shinL', 1.6, 0, 0); set(P, 'thighR', -0.6, 0, -0.2); set(P, 'shinR', 1.0, 0, 0);
      set(P, 'uarmL', -1.2, 0, 0.3); set(P, 'uarmR', -1.2, 0, -0.3); set(P, 'spine', 0.4, 0, 0);
      P.gripL = 0; P.gripR = 0;
      return P;
    }
    case 'fall':
      P.bodyPitch = -0.6; set(P, 'uarmL', -2.8, 0, 0.6); set(P, 'uarmR', -2.8, 0, -0.6); set(P, 'head', 0.3, 0, 0);
      return P;
    case 'drive':
      P.rootY = -0.42;
      set(P, 'thighL', -1.4, 0, 0.05); set(P, 'thighR', -1.4, 0, -0.05); set(P, 'shinL', 1.2, 0, 0); set(P, 'shinR', 1.2, 0, 0);
      set(P, 'uarmL', -1.1, -0.2, 0.15); set(P, 'farmL', -0.7, 0, 0); set(P, 'uarmR', -1.1, 0.2, -0.15); set(P, 'farmR', -0.7, 0, 0);
      P.gripL = 1; P.gripR = 1;
      return P;
    default:
      return P;
  }
}
