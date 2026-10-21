import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex, scaleHex } from '../../gfx/pixel';
import { angleDiff } from '../../core/math';
import { lineOfSight } from '../../world/collision';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import { CS, zoneOf, nm, netSet, pulse, attack, nearestPlayer, playersIn, lightAt, faceTo, stop, galleryPose, idHash } from '../behaviors_a';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, V3, buildKitRig, kitSync, kitPersonalize, tube, headLoft, handLoft, footLoft, ellipsoid,
  wLerp, gauss, angd, SHOE_DRESS, ringY, usFor, applyPose, Pose, offset, lostParts, nearestSurvivor, lookAngles, attackCurve, flinchOf, hash, twill, mixPose,
} from '../kit/humanoids';

// =====================================================================================
// THE EMPLOYEE — a store mannequin assembled from buffer furniture, wearing the idea of
// a beige suit. Fibreglass shell, ball joints at the neck, wrists and ankles where the
// sleeves and trousers are a little too short, a cracked featureless head. It only
// moves while nobody is looking at it, and every time you look it is posed differently.
// =====================================================================================

// ------------------------------------------------------------------ skeleton
const HIP_Y = 1.0;
function bonesFor(v: number): BoneSpec[] {
  const arm = 1 + (v % 2) * 0.03; // some of them have arms that are longer still
  const b: BoneSpec[] = [
    { name: 'hips', parent: '', at: [0, HIP_Y, 0] },
    { name: 'spine', parent: 'hips', at: [0, 0.08, 0] },
    { name: 'chest', parent: 'spine', at: [0, 0.24, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.3, -0.012], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.105, 0.012], cap: true },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'uarm' + s, parent: 'chest', at: [k * 0.198, 0.245, -0.014], cap: true },
      { name: 'farm' + s, parent: 'uarm' + s, at: [0, -0.305 * arm, 0], cap: true },
      { name: 'hand' + s, parent: 'farm' + s, at: [0, -0.285 * arm, 0], cap: true },
      { name: 'fing1' + s, parent: 'hand' + s, at: [0, -0.092, 0] },
      { name: 'fing2' + s, parent: 'fing1' + s, at: [0, -0.045, 0] },
      { name: 'thumb' + s, parent: 'hand' + s, at: [-k * 0.004, -0.025, 0.028] },
    );
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'thigh' + s, parent: 'hips', at: [k * 0.094, -0.035, 0], cap: true },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.46, 0], cap: true },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.42, 0] },
    );
  }
  return b;
}
const ARMLEN = (v: number) => 1 + (v % 2) * 0.03;

// ------------------------------------------------------------------ page layout
function layout(p: Page) {
  p.reg('TORSO', 96, 64, [0.84, 1.62]);
  p.reg('ARM_L', 26, 48, [-0.66, 0.04]);
  p.reg('ARM_R', 26, 48, [-0.66, 0.04]);
  p.reg('LEG_L', 28, 62, [-0.92, 0.07]);
  p.reg('LEG_R', 28, 62, [-0.92, 0.07]);
  p.reg('HEAD', 96, 48, [-0.02, 0.24]);
  p.reg('HAND_L', 20, 22);
  p.reg('HAND_R', 20, 22);
  p.reg('SKIRT', 96, 14, [0.82, 1.0]);
  p.reg('FOOT_L', 28, 18);
  p.reg('FOOT_R', 28, 18);
  p.reg('NECK', 28, 12, [-0.075, 0.115]);
  p.reg('BALL', 12, 12);
  p.reg('CAP', 16, 16);
  p.reg('BITS', 32, 24);
}

// ------------------------------------------------------------------ geometry
const TORSO_ROWS: Row[] = [
  { y: 0.865, rx: 0.07, rf: 0.056, rb: 0.064 },
  { y: 0.91, rx: 0.152, rf: 0.088, rb: 0.1 },
  { y: 0.98, rx: 0.164, rf: 0.093, rb: 0.106 },
  { y: 1.06, rx: 0.15, rf: 0.09, rb: 0.092 },
  { y: 1.14, rx: 0.134, rf: 0.088, rb: 0.08 },   // a waist narrower than anyone's
  { y: 1.22, rx: 0.146, rf: 0.095, rb: 0.085 },
  { y: 1.31, rx: 0.161, rf: 0.102, rb: 0.092 },
  { y: 1.4, rx: 0.168, rf: 0.1, rb: 0.095, sq: 2.4 },
  { y: 1.47, rx: 0.18, rf: 0.086, rb: 0.092, sq: 3.0 }, // shoulder pads: too square
  { y: 1.52, rx: 0.17, rf: 0.07, rb: 0.077, sq: 3.0 },
  { y: 1.555, rx: 0.1, rf: 0.058, rb: 0.064, sq: 2.2 },
  { y: 1.585, rx: 0.06, rf: 0.052, rb: 0.055 },
];
const ARM_ROWS: Row[] = [
  { y: 0.0, rx: 0.024, rf: 0.032, rb: 0.032, cx: -0.012 },
  { y: -0.016, rx: 0.044, rf: 0.048, rb: 0.048, cx: -0.004 },
  { y: -0.06, rx: 0.05, rf: 0.05, rb: 0.05 },
  { y: -0.13, rx: 0.047, rf: 0.049, rb: 0.047 },
  { y: -0.29, rx: 0.042, rf: 0.04, rb: 0.044 },
  { y: -0.33, rx: 0.043, rf: 0.043, rb: 0.046 },
  { y: -0.38, rx: 0.044, rf: 0.045, rb: 0.042 },
  { y: -0.5, rx: 0.042, rf: 0.042, rb: 0.04 },   // sleeve hem
  { y: -0.512, rx: 0.025, rf: 0.029, rb: 0.027 },  // bare fibreglass wrist
  { y: -0.56, rx: 0.021, rf: 0.026, rb: 0.024 },
  { y: -0.585, rx: 0.018, rf: 0.022, rb: 0.021 },
];
const LEG_ROWS: Row[] = [
  { y: 0.06, rx: 0.066, rf: 0.07, rb: 0.074 },
  { y: -0.01, rx: 0.088, rf: 0.088, rb: 0.092 },
  { y: -0.11, rx: 0.083, rf: 0.084, rb: 0.084 },
  { y: -0.24, rx: 0.073, rf: 0.075, rb: 0.072 },
  { y: -0.37, rx: 0.065, rf: 0.067, rb: 0.064 },
  { y: -0.46, rx: 0.062, rf: 0.065, rb: 0.062 },
  { y: -0.55, rx: 0.06, rf: 0.061, rb: 0.063 },
  { y: -0.7, rx: 0.058, rf: 0.058, rb: 0.058 },
  { y: -0.83, rx: 0.058, rf: 0.058, rb: 0.058 },   // trouser hem, a hand's width too short
  { y: -0.842, rx: 0.031, rf: 0.032, rb: 0.033 },  // bare ankle
  { y: -0.875, rx: 0.029, rf: 0.031, rb: 0.031 },
];
const HEAD_ROWS: Row[] = [
  { y: -0.012, rx: 0.05, rf: 0.056, rb: 0.05, cz: -0.004 },
  { y: 0.012, rx: 0.07, rf: 0.082, rb: 0.068 },
  { y: 0.04, rx: 0.08, rf: 0.094, rb: 0.08 },
  { y: 0.075, rx: 0.086, rf: 0.098, rb: 0.09 },
  { y: 0.108, rx: 0.089, rf: 0.1, rb: 0.097 },
  { y: 0.14, rx: 0.091, rf: 0.098, rb: 0.1 },
  { y: 0.172, rx: 0.087, rf: 0.091, rb: 0.096 },
  { y: 0.2, rx: 0.072, rf: 0.074, rb: 0.08 },
  { y: 0.22, rx: 0.045, rf: 0.044, rb: 0.05 },
];

function buildEmployee(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const arm = ARMLEN(x.variant);
  // ---- torso (jacket over a shirt, trousers below the hem)
  const tw = (y: number): Wt => {
    if (y < 1.03) return [bi('hips'), 1];
    if (y < 1.1) return wLerp(y, 1.03, 1.1, bi('hips'), bi('spine'));
    if (y < 1.2) return [bi('spine'), 1];
    if (y < 1.29) return wLerp(y, 1.2, 1.29, bi('spine'), bi('chest'));
    if (y < 1.565) return [bi('chest'), 1];
    return [bi('chest'), 0.6, bi('neck'), 0.4];
  };
  const tb = (th: number, y: number) =>
    gauss(y, 1.3, 0.06) * gauss(Math.abs(th), 0.5, 0.35) * 0.04          // pecs under the jacket
    + gauss(y, 0.93, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.5) * 0.06 // seat
    - gauss(y, 1.17, 0.2) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.12) * 0.03;
  const ys = [0.865, 0.91, 0.95, 0.98, 1.02, 1.06, 1.1, 1.14, 1.18, 1.22, 1.27, 1.31, 1.36, 1.4, 1.44, 1.47, 1.5, 1.52, 1.54, 1.555, 1.57, 1.585];
  tube(B, { rows: TORSO_ROWS, ys, n: 14, reg: R('TORSO'), vr: R('TORSO').range, w: tw, g: 1, bump: tb, start: [0, 0.855, -0.004], end: [0, 1.6, -0.006] });
  // jacket skirt: flares over the seat, open at the front below the button
  {
    const n = 14, top = 1.0, bot = 0.83;
    const rTop = TORSO_ROWS[3];
    const rings = [top, 0.92, bot].map((y, i) => {
      const f = i / 2;
      const rx = rTop.rx + 0.012 + f * 0.018, rf = rTop.rf + 0.012 + f * 0.016, rb = 0.106 + 0.012 + f * 0.02;
      const w = (p: V3): Wt => {
        const kk = f * 0.7;
        const l = Math.min(1, Math.max(0, 0.5 + p[0] / (rx * 0.9) * 0.5));
        return [bi('hips'), 1 - kk, bi('thighL'), kk * l, bi('thighR'), kk * (1 - l)];
      };
      return { pts: ringY(y, 0, 0, rx, rf, rb, n, 2.2), v: 1 - i / 2, w };
    });
    B.loft(rings, usFor(n), R('SKIRT'), 2, { double: true, skip: (j) => j === 6 || j === 7 });
  }
  // lapels: two flat cloth flaps on the chest
  for (const k of [1, -1]) {
    const zf = (y: number) => {
      const r = TORSO_ROWS.find((q) => q.y >= y) || TORSO_ROWS[TORSO_ROWS.length - 1];
      return r.rf + 0.012;
    };
    const top: V3 = [k * 0.05, 1.545, zf(1.5) - 0.012], tip: V3 = [k * 0.012, 1.19, zf(1.19) + 0.004];
    const out: V3 = [k * 0.105, 1.43, zf(1.43) - 0.002], notch: V3 = [k * 0.085, 1.5, zf(1.48) - 0.002];
    B.quad(tip, out, notch, top, R('BITS'), k > 0 ? [0, 0, 0.25, 1] : [0.25, 0, 0, 1], [bi('chest'), 1], false, 0.92);
    B.quad(tip, [tip[0], tip[1], tip[2] - 0.006], out, out, R('BITS'), [0, 0, 0.05, 1], [bi('chest'), 1]);
  }
  // shirt collar and tie knot
  {
    const rr = [1.555, 1.6].map((y, i) => ({ pts: ringY(y, 0, -0.008, 0.057 - i * 0.004, 0.064 - i * 0.006, 0.054, 10, 2), v: i, w: [bi('chest'), 1 - i * 0.5, bi('neck'), i * 0.5] as Wt }));
    B.loft(rr, usFor(10), new Region(null, '', R('BITS').x + 26, R('BITS').y + 16, 6, 8), 3, { double: true, skip: (j) => j === 4 || j === 5 });
    B.box([0, 1.545, 0.07], [0.028, 0.026, 0.02], null, R('BITS'), [bi('chest'), 1], [0.82, 0.0, 0.94, 0.2]);
  }
  // the badge on its lanyard (no photo, no name)
  B.box([0.06, 1.31, 0.112], [0.056, 0.078, 0.006], new THREE.Matrix4().makeRotationZ(0.06), R('BITS'), [bi('chest'), 1], [0.5, 0.35, 0.8, 1]);
  // ---- neck, the ball it sits on
  tube(B, { rows: [{ y: -0.07, rx: 0.052, rf: 0.056, rb: 0.052 }, { y: -0.02, rx: 0.045, rf: 0.049, rb: 0.046 }, { y: 0.05, rx: 0.043, rf: 0.046, rb: 0.043 }, { y: 0.1, rx: 0.04, rf: 0.042, rb: 0.04 }],
    n: 10, reg: R('NECK'), at: x.rest('neck'), w: (y) => (y < -0.03 ? [bi('chest'), 0.5, bi('neck'), 0.5] : [bi('neck'), 1]), g: 4 });
  ellipsoid(B, [x.rest('head')[0], x.rest('head')[1] - 0.004, x.rest('head')[2] - 0.006], [0.048, 0.042, 0.05], 8, 5, R('BALL'), [bi('neck'), 1], 5);
  // ---- the head: an egg with only the suggestion of a face
  const hb = (th: number, y: number) =>
    gauss(th, 0, 0.13) * gauss(y, 0.088, 0.026) * 0.13          // nose ridge
    + gauss(Math.abs(th), 0.36, 0.22) * gauss(y, 0.138, 0.012) * 0.045  // brow
    - gauss(Math.abs(th), 0.36, 0.16) * gauss(y, 0.116, 0.014) * 0.05   // sockets
    + gauss(Math.abs(th), 0.78, 0.25) * gauss(y, 0.085, 0.016) * 0.03   // cheekbones
    + gauss(th, 0, 0.3) * gauss(y, 0.022, 0.016) * 0.05                 // chin
    - gauss(th, 0, 0.2) * gauss(y, 0.05, 0.008) * 0.02;                 // the line where a mouth would be
  headLoft(B, { at: x.rest('head'), rows: HEAD_ROWS, reg: R('HEAD'), vr: R('HEAD').range, w: () => [bi('head'), 1], g: 6, bump: hb, top: 0.232, bottom: -0.018 });
  // ---- arms: suit sleeves that stop short of a fibreglass wrist and a ball joint
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('uarm' + s), F = bi('farm' + s), H = bi('hand' + s);
    const at = x.rest('uarm' + s);
    const e = (y: number) => y * arm;
    const rows = ARM_ROWS.map((r) => ({ ...r, y: e(r.y) }));
    const wf = (y: number): Wt => {
      if (y > 0.03) return [U, 0.8, bi('chest'), 0.2];
      if (y > e(-0.27)) return [U, 1];
      if (y > e(-0.35)) return wLerp(y, e(-0.27), e(-0.35), U, F);
      if (y > e(-0.565)) return [F, 1];
      return [F, 0.6, H, 0.4];
    };
    const ays = [0.0, -0.016, -0.06, -0.13, -0.21, -0.29, -0.31, -0.33, -0.36, -0.38, -0.44, -0.5, -0.5, -0.512, -0.535, -0.56, -0.585].map(e);
    const ar = R('ARM_' + s);
    tube(B, { rows, ys: ays, n: 8, reg: ar, vr: ar.range.map(e), at, w: wf, g: 10 + (k > 0 ? 0 : 1), mirror: k, start: [at[0] - k * 0.02, at[1] + 0.004, at[2]], startW: [U, 0.7, bi('chest'), 0.3] });
    const hp = x.rest('hand' + s);
    ellipsoid(B, [hp[0], hp[1] + 0.006, hp[2] + 0.002], [0.024, 0.022, 0.026], 6, 4, R('BALL'), [F, 0.5, H, 0.5], 12 + (k > 0 ? 0 : 1));
    handLoft(B, { k, at: [hp[0], hp[1] - 0.012, hp[2]], bones: { farm: F, hand: H, f1: bi('fing1' + s), f2: bi('fing2' + s), thumb: bi('thumb' + s) }, reg: R('HAND_' + s), g: 20 + (k > 0 ? 0 : 10), s: 1.06, fused: true, fingers: { n: 4, len: [0.09, 0.098, 0.092, 0.08], r: [0.009, 0.0095, 0.009, 0.008] }, palm: { len: 0.092, w: 0.042, t: 0.017 } });
    // a paper price tag on a string from the left cuff, for no reason
    if (k > 0) {
      const c: V3 = [at[0] + 0.034, at[1] + e(-0.5), at[2] + 0.02];
      B.box([c[0], c[1] - 0.025, c[2]], [0.002, 0.05, 0.002], null, R('BITS'), [F, 1], [0.96, 0.9, 1, 1]);
      B.quad([c[0] + 0.004, c[1] - 0.05, c[2] - 0.016], [c[0] + 0.004, c[1] - 0.05, c[2] + 0.016], [c[0] + 0.004, c[1] - 0.095, c[2] + 0.016], [c[0] + 0.004, c[1] - 0.095, c[2] - 0.016], R('BITS'), [0.82, 1, 1, 0.42], [F, 1], true);
    }
  }
  // ---- legs: trousers with a crease, a band of bare ankle, dress shoes
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const T = bi('thigh' + s), S = bi('shin' + s), Ft = bi('foot' + s);
    const at = x.rest('thigh' + s);
    const wf = (y: number): Wt => {
      if (y > 0.02) return [bi('hips'), 0.5, T, 0.5];
      if (y > -0.05) return [bi('hips'), 0.2, T, 0.8];
      if (y > -0.41) return [T, 1];
      if (y > -0.5) return wLerp(y, -0.41, -0.5, T, S);
      if (y > -0.85) return [S, 1];
      return [S, 0.5, Ft, 0.5];
    };
    const lys = [0.06, -0.01, -0.11, -0.18, -0.24, -0.31, -0.37, -0.42, -0.46, -0.5, -0.55, -0.62, -0.7, -0.77, -0.83, -0.83, -0.842, -0.86, -0.875];
    const lr = R('LEG_' + s);
    tube(B, { rows: LEG_ROWS, ys: lys, n: 8, reg: lr, vr: lr.range, at, w: wf, g: 30 + (k > 0 ? 0 : 1), mirror: k, start: [at[0], at[1] + 0.07, at[2]], startW: [bi('hips'), 0.6, T, 0.4],
      bump: (th, y) => gauss(y, -0.46, 0.03) * gauss(th, 0, 0.5) * 0.05 + (y > -0.83 ? gauss(th, 0, 0.12) * 0.035 : 0) });
    const fp = x.rest('foot' + s);
    ellipsoid(B, [fp[0], fp[1] + 0.012, fp[2]], [0.03, 0.026, 0.032], 6, 4, R('BALL'), [S, 0.4, Ft, 0.6], 34 + (k > 0 ? 0 : 1));
    footLoft(B, { k, at: fp, rows: SHOE_DRESS, ground: -0.085, sole: 0.017, lip: 0.003, reg: R('FOOT_' + s), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.06 });
  }
}

// ------------------------------------------------------------------ paint
const SUITS = [0x8e7c60, 0x7e7a6c, 0x7a6852, 0x94846a];
const TIES = [0x5e2a26, 0x2a3450, 0x8a6a22, 0x2e4a34];
const SHELLS = [0xbfa088, 0xc4b8aa, 0xb08a6e, 0xaaa196];

function paintEmployee(p: Page, x: BuildCtx) {
  const v = x.variant, seed = x.seed % 1000;
  const SUIT = SUITS[v % SUITS.length], TIE = TIES[(v + 1) % TIES.length];
  const SR = makeRamp(SUIT, 9, { hueShift: 0.03, spread: 0.55 });
  const SH = makeRamp(SHELLS[v % SHELLS.length], 10, { hueShift: 0.025, spread: 0.6, satShift: 0.05 });
  const GLASS = makeRamp(0x8a9488, 5, { spread: 0.5 }); // the fibreglass under the paint
  const shirt = makeRamp(0xe2ded2, 5, { spread: 0.35 });
  const TR = makeRamp(TIE, 5, { spread: 0.5 });
  const dust = mixHex(SR[6], 0xb8b4a8, 0.6);

  // ---------------- fibreglass shell (shared look)
  const shell = (r: Region, base: number, gloss: (x: number, y: number) => number, cseed: number) => {
    r.fill(SH, (xx, yy) => {
      const th = (r.deg(xx) * Math.PI) / 180;
      return base + 1.6 * Math.cos(th) * 0.5 + (r.fbm(xx, yy, 2, 2, cseed) - 0.5) * 0.7 + gloss(xx, yy);
    }, undefined, 0.35);
  };
  const chip = (r: Region, cx: number, cy: number, rad: number, sd: number) => {
    // paint flaked away: an irregular patch of grey fibreglass with a pale broken rim
    for (let j = -Math.ceil(rad) - 1; j <= Math.ceil(rad) + 1; j++) for (let i = -Math.ceil(rad * 1.4) - 1; i <= Math.ceil(rad * 1.4) + 1; i++) {
      const a = Math.atan2(j, i), d = Math.hypot(i / 1.4, j);
      const edge = rad * (0.7 + 0.5 * hash(Math.floor((a + 4) * 2.2), sd));
      if (d < edge - 0.6) r.set(cx + i, cy + j, GLASS[1 + ((i * 3 + j * 5 + sd) & 1) + (hash(i, j + sd) < 0.2 ? 1 : 0)]);
      else if (d < edge + 0.5) r.set(cx + i, cy + j, SH[8]);
    }
  };

  // ---------------- torso: jacket, shirt, tie, lapels, lanyard, badge, dust
  {
    const r = p.R('TORSO');
    const hem = 0.95;
    const vW = (yy: number) => (yy < 1.19 ? -1 : 6 + (yy - 1.19) * 52); // half-width of the V in degrees
    r.fill(SR, (xx, yy) => {
      const deg = r.deg(xx), th = (deg * Math.PI) / 180, h = r.yAt(yy);
      let l = 4.2 + 0.9 * Math.cos(th) + twill(xx, yy) + (r.fbm(xx, yy, 3, 2, 21 + v) - 0.5) * 0.8;
      l -= 2.4 * gauss(h, 1.47, 0.03) * gauss(Math.abs(deg), 92, 14);   // armpits
      l += 1.2 * Math.max(0, (h - 1.5) / 0.08) * Math.max(0, Math.cos(th));
      if (h < hem) l -= 0.8;                                           // trousers in the jacket's shadow
      if (Math.abs(deg) < 2 && h < hem) l += 0.8;                      // fly seam catches light
      if ((xx % 7 === 3) && (yy & 1)) l += 0.45;                        // faint pinstripe
      return l;
    });
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const deg = r.deg(xx), h = r.yAt(yy), w = vW(h);
      if (h > 1.19 && Math.abs(deg) < w) {
        // shirt
        r.put(xx, yy, shirt, 3.2 + 0.5 * Math.cos((deg * Math.PI) / 180) - (Math.abs(deg) > w - 2 ? 1.2 : 0) + ((xx + yy) % 3 === 0 ? -0.3 : 0));
        if (Math.abs(deg) < 6 && h < 1.545) { const tx = Math.round(deg / 3.75); r.set(xx, yy, ((tx + yy) % 4 === 0) ? TR[4] : TR[tx === 0 ? 2 : 1]); }
      } else if (h > 1.19 && Math.abs(deg) < w + 9) {
        // lapel band: darker cloth, a crisp highlight on the outer fold
        const t = Math.abs(deg) - w;
        r.put(xx, yy, SR, 3.1 + (t > 7.5 ? 2.2 : 0) + twill(xx, yy) * 0.5);
        if (t < 1.2) r.set(xx, yy, SR[1]);
      }
    }
    // tie knot and collar points
    r.rect(Math.round(r.X(0)) - 2, Math.round(r.Y(1.56)), 4, 3, TR[2]);
    r.set(Math.round(r.X(0)) - 1, Math.round(r.Y(1.56)), TR[4]);
    // buttons, jacket front edge and its curve away below the button
    for (const [h, c] of [[1.18, 0], [1.08, 0]] as const) { const bx = Math.round(r.X(c)), by = Math.round(r.Y(h)); r.rect(bx - 1, by - 1, 2, 2, SR[1]); r.set(bx - 1, by - 1, SR[5]); }
    for (let h = 1.17; h > hem; h -= 0.005) { const cur = Math.max(0, (1.04 - h) / 0.09) * 9; for (const k of [1, -1]) r.blend(r.X(k * (1 + cur)), r.Y(h), SR[1], 0.8); }
    // pockets: breast welt on the left, flapped hip pockets
    r.hline(r.X(28), r.X(42), Math.round(r.Y(1.395)), SR[1]); r.hline(r.X(28), r.X(42), Math.round(r.Y(1.395)) + 1, SR[6], 0.6);
    for (const k of [1, -1]) {
      const y0 = Math.round(r.Y(1.035));
      r.rectBlend(Math.round(r.X(k > 0 ? 30 : -54)), y0, Math.round(r.X(24) - r.X(0)), 3, SR[3], 0.6);
      r.hline(r.X(k > 0 ? 30 : -54), r.X(k > 0 ? 54 : -30), y0 + 3, SR[0]);
      r.hline(r.X(k > 0 ? 30 : -54), r.X(k > 0 ? 54 : -30), y0, SR[6], 0.5);
    }
    // seams: sides, centre back, back vent
    for (const deg of [96, -96, 180]) r.vline(Math.round(r.X(deg)), r.Y(1.5), r.Y(hem), SR[2], 0.6);
    r.vline(Math.round(r.X(180)), r.Y(hem + 0.05), r.Y(hem), SR[0]);
    // the hem, the belt beneath it
    r.hline(0, r.w - 1, Math.round(r.Y(hem)), SR[1]);
    r.hline(0, r.w - 1, Math.round(r.Y(hem)) + 1, SR[0], 0.6);
    // creases that never move: pulls from the button, folds at the waist
    for (let i = 0; i < 6; i++) {
      const k = i % 2 ? 1 : -1;
      r.line(r.X(k * 4), r.Y(1.18), r.X(k * (26 + i * 6)), r.Y(1.24 + i * 0.02), SR[2], 0.45);
    }
    for (const k of [1, -1]) for (let i = 0; i < 3; i++) r.hline(r.X(k * 70), r.X(k * 90), Math.round(r.Y(1.12 + i * 0.03)), SR[2], 0.4);
    // lanyard and the blank badge clip
    for (let h = 1.56; h > 1.35; h -= 0.004) { const t = (1.56 - h) / 0.21; r.set(r.X(30 - t * 8), r.Y(h), 0x34528a); r.set(r.X(46 - t * 22), r.Y(h), 0x2c4678); }
    // dust settled on the shoulders, because it never moves
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const h = r.yAt(yy);
      if (h > 1.43 && hash(xx * 7 + yy, seed) < (h - 1.43) * 4 * Math.max(0, Math.cos((r.deg(xx) * Math.PI) / 180) * 0.5 + 0.5)) r.blend(xx, yy, dust, 0.55);
    }
    // a water mark down one side
    r.glow(r.X(-58 + v * 9), r.Y(1.26), 6, 9, scaleHex(SUIT, 0.86), 0.5);
    r.ellipse(r.X(-58 + v * 9), r.Y(1.26), 6, 9, scaleHex(SUIT, 0.8), 0.18);
  }
  // ---------------- jacket skirt
  {
    const r = p.R('SKIRT');
    r.fill(SR, (xx, yy) => 3.9 + 0.8 * Math.cos((r.deg(xx) * Math.PI) / 180) + twill(xx, yy) + (r.fbm(xx, yy, 3, 2, 31 + v) - 0.5) * 0.8 - (yy / r.h) * 0.6 + ((xx % 7 === 3) && (yy & 1) ? 0.45 : 0));
    r.hline(0, r.w - 1, r.h - 1, SR[1]);
    r.vline(Math.round(r.X(180)), 3, r.h - 1, SR[0]);
    for (const deg of [96, -96]) r.vline(Math.round(r.X(deg)), 0, r.h - 1, SR[2], 0.6);
  }
  // ---------------- sleeves, cuffs, bare wrists
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const r = p.R('ARM_' + s);
    const e = ARMLEN(v);
    r.fill(SR, (xx, yy) => {
      const th = (r.deg(xx) * Math.PI) / 180, h = r.yAt(yy) / e;
      let l = 4.1 + 0.9 * Math.cos(th) - 0.7 * Math.max(0, -Math.sin(th)) + twill(xx, yy) + (r.fbm(xx, yy, 2, 2, 41 + k) - 0.5) * 0.8;
      l -= 1.5 * Math.max(0, (h + 0.0) / 0.05) * Math.max(0, -Math.sin(th));
      if ((xx % 7 === 3) && (yy & 1)) l += 0.45;
      return l;
    });
    // elbow folds, the seam down the back of the sleeve
    for (let i = 0; i < 3; i++) r.hline(r.X(-50), r.X(30), Math.round(r.Y(-0.3 * e - i * 0.018)) + (i & 1), SR[2], 0.6);
    r.vline(Math.round(r.X(-150)), r.Y(0), r.Y(-0.5 * e), SR[2], 0.6);
    const cuff = Math.round(r.Y(-0.5 * e));
    for (let yy = cuff; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const th = (r.deg(xx) * Math.PI) / 180;
      r.put(xx, yy, SH, 5 + 1.6 * Math.cos(th) + (r.fbm(xx, yy, 2, 2, 7) - 0.5) * 0.6 + (yy === cuff + 1 ? -1.5 : 0));
    }
    r.hline(0, r.w - 1, cuff - 1, SR[0]);
    r.hline(0, r.w - 1, cuff, shirt[3]);
    r.hline(0, r.w - 1, Math.round(r.Y(-0.575 * e)), SH[2]); // the wrist seam
    chip(r, Math.round(r.X(60 * k)), Math.round(r.Y(-0.55 * e)), 1.2, seed + k);
  }
  // ---------------- trousers, bare ankles
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const r = p.R('LEG_' + s);
    r.fill(SR, (xx, yy) => {
      const deg = r.deg(xx), th = (deg * Math.PI) / 180, h = r.yAt(yy);
      let l = 3.7 + 0.8 * Math.cos(th) - 0.6 * Math.max(0, -Math.sin(th)) + twill(xx, yy) + (r.fbm(xx, yy, 2, 3, 51 + k) - 0.5) * 0.8;
      if (Math.abs(deg) < 7) l += 1.4;                       // the pressed crease
      l -= 1.4 * gauss(h, -0.46, 0.012) * Math.max(0, -Math.cos(th));
      if ((xx % 7 === 3) && (yy & 1)) l += 0.45;
      return l;
    });
    for (let i = 0; i < 3; i++) r.line(r.X(-40), r.Y(-0.45 - i * 0.02), r.X(35), r.Y(-0.44 - i * 0.025), SR[2], 0.4);
    r.vline(Math.round(r.X(90 * k)), r.Y(0.04), r.Y(-0.83), SR[2], 0.5);
    const hemR = Math.round(r.Y(-0.83));
    for (let yy = hemR + 1; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.put(xx, yy, SH, 4.8 + 1.5 * Math.cos((r.deg(xx) * Math.PI) / 180) + (r.fbm(xx, yy, 2, 2, 9) - 0.5) * 0.6);
    r.hline(0, r.w - 1, hemR, SR[1]); r.hline(0, r.w - 1, hemR - 1, SR[2], 0.6);
    r.hline(0, r.w - 1, Math.round(r.Y(-0.862)), SH[2]); // ankle seam
  }
  // ---------------- head: glossy shell, the crack, chips
  {
    const r = p.R('HEAD');
    shell(r, 4.9, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy), a = Math.abs(deg);
      let g = 0;
      g += 1.8 * gauss(h, 0.165, 0.025) * gauss(deg, -18, 16);           // gloss on the forehead
      g += 1.4 * gauss(h, 0.085, 0.015) * gauss(a, 42, 10);               // cheekbones catching the tubes
      g += 1.6 * gauss(h, 0.09, 0.03) * gauss(deg, 0, 4);                 // nose ridge
      g -= 2.4 * gauss(h, 0.116, 0.012) * gauss(a, 21, 9);                // the sockets
      g -= 1.3 * gauss(h, 0.068, 0.006) * gauss(a, 4, 7);                 // under the nose
      g -= 1.0 * gauss(h, 0.05, 0.004) * gauss(a, 0, 14);                 // where a mouth should be
      g -= 1.4 * Math.max(0, (0.02 - h) / 0.04);                          // under the jaw
      g += 0.8 * gauss(h, 0.022, 0.012) * gauss(a, 0, 14);
      return g;
    }, 61 + v);
    // mould seams: over the top from side to side, and down the back
    for (const deg of [93, -93]) for (let yy = 0; yy < r.h; yy++) if (yy % 3 !== 2) r.blend(r.X(deg), yy, SH[3], 0.55);
    // the crack: from the crown down across the brow into one socket, branching
    const cx = r.X(-30 + (v % 3) * 25), cy = 1;
    r.crack(cx, cy, Math.round(r.h * 0.95), 90 + (v % 2 ? 14 : -10), mixHex(SH[0], 0x18120e, 0.5), seed + 3, 1, 0.16, SH[8]);
    r.crack(r.X(140), r.Y(0.19), 14, 110, SH[1], seed + 9, 0.8, 0.1);
    chip(r, Math.round(cx + 2), 6, 2.6, seed + 1);
    chip(r, Math.round(r.X(-120)), Math.round(r.Y(0.08)), 1.6 + (v & 1), seed + 2);
    chip(r, Math.round(r.X(25 + v * 7)), Math.round(r.Y(0.03)), 1.1, seed + 5);
    // grime in the creases of the face
    r.glow(r.X(-20), r.Y(0.112), 3, 1.5, SH[1], 0.35); r.glow(r.X(20), r.Y(0.112), 3, 1.5, SH[1], 0.35);
  }
  // ---------------- neck
  {
    const r = p.R('NECK');
    shell(r, 4.6, () => 0, 71);
    r.hline(0, r.w - 1, r.h - 3, SH[1]); r.hline(0, r.w - 1, r.h - 2, SH[7], 0.5);
    r.hline(0, r.w - 1, 1, SH[2], 0.7);
  }
  // ---------------- hands: moulded fingers, faint nails, a chipped tip
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const r = p.R('HAND_' + s);
    shell(r, 5.2, (xx, yy) => (yy > r.h * 0.45 && yy < r.h * 0.55 ? -0.8 : 0), 81 + k);
    const fy = Math.round(r.h * 0.5);
    for (const deg of [-150, -120, -60, -30, 30, 60, 120, 150]) r.vline(Math.round(r.X(deg)), fy + 1, r.h - 2, SH[2], 0.8);
    for (let xx = 0; xx < r.w; xx++) { const a = r.deg(xx); if (a > 40 && a < 140) { r.set(xx, r.h - 2, SH[8]); r.set(xx, r.h - 1, SH[7]); } }
    chip(r, Math.round(r.X(80)), r.h - 2, 1, seed + 11 + k);
    for (let xx = 0; xx < r.w; xx += 2) r.blend(xx, Math.round(r.h * 0.44), SH[7], 0.6); // knuckles
  }
  // ---------------- shoes: scuffed leather, laces, welt
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const r = p.R('FOOT_' + s);
    const LR = makeRamp(v % 2 ? 0x3a2a20 : 0x24201e, 6, { spread: 0.6 });
    r.fill(LR, (xx, yy) => 2.6 + 1.2 * Math.cos((r.deg(xx) * Math.PI) / 180) - (yy > r.h * 0.8 ? 1.8 : 0) + (r.fbm(xx, yy, 2, 2, 91 + k) - 0.5) * 0.8);
    r.hline(0, r.w - 1, Math.round(r.h * 0.8), LR[0]);
    r.hline(0, r.w - 1, Math.round(r.h * 0.84), LR[4], 0.5);
    for (let yy = Math.round(r.h * 0.12); yy < r.h * 0.4; yy += 2) { r.set(Math.round(r.X(-3)), yy, LR[5]); r.set(Math.round(r.X(3)), yy, LR[5]); }
    r.hline(r.X(-20), r.X(20), Math.round(r.h * 0.5), LR[1]);
    r.blend(Math.round(r.X(10)), Math.round(r.h * 0.62), LR[5], 0.8); r.blend(Math.round(r.X(-20)), Math.round(r.h * 0.6), 0x8a7a6a, 0.5);
  }
  // ---------------- ball joints
  {
    const r = p.R('BALL');
    r.fill(SH, (xx, yy) => 3.6 + 1.4 * Math.cos((r.deg(xx) * Math.PI) / 180) + (r.h / 2 - Math.abs(yy - r.h / 2)) * 0.25 + (r.fbm(xx, yy, 2, 2, 5) - 0.5) * 0.6);
    r.hline(0, r.w - 1, r.h >> 1, SH[1]);
    for (let xx = 0; xx < r.w; xx += 3) r.blend(xx, (r.h >> 1) + 2, mixHex(SH[2], 0x302820, 0.4), 0.6);
  }
  // ---------------- cut: a thin painted shell around a dark hollow, a steel post
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      let c: number;
      if (d > 0.93) c = SH[6];
      else if (d > 0.72) c = GLASS[((xx * 3 + yy) % 4 === 0 ? 3 : 2)];
      else if (d < 0.16) c = 0x8a8c90;
      else if (d < 0.22) c = 0x4a4c50;
      else c = mixHex(0x120f0c, GLASS[0], hash(xx, yy) < 0.12 ? 0.6 : 0.1);
      r.set(xx, yy, c);
    }
  }
  // ---------------- bits: lapel cloth, the badge, the price tag, string
  {
    const r = p.R('BITS');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < 16; xx++) r.put(xx, yy, SR, 3.4 + twill(xx, yy) * 0.5 - (xx === 0 || xx === 7 ? 1.2 : 0) + (xx === 1 || xx === 8 ? 1 : 0));
    // collar band (white)
    r.rect(26, 16, 6, 8, shirt[3]); r.hline(26, 31, 23, shirt[1]);
    // tie knot texel
    r.rect(26, 0, 4, 5, TR[2]);
    // badge: white card, blank grey photo square, empty lines, blue strap edge
    r.rect(16, 0, 10, 16, 0xeeeee8);
    r.rect(16, 0, 10, 2, 0x34528a);
    r.rect(18, 4, 6, 5, 0xb8b8b2); r.set(19, 5, 0xc8c8c2);
    r.hline(18, 23, 11, 0xa8a8a2); r.hline(18, 22, 13, 0xc0c0ba);
    // price tag: manila card, punched hole, a barcode and no price
    r.rect(26, 5, 6, 10, 0xd8c08a);
    r.set(28, 6, 0x5a4a2a);
    for (let xx = 26; xx < 32; xx++) if (xx % 2 === 0 || xx === 29) r.vline(xx, 9, 12, 0x3a3020);
    r.hline(27, 30, 13, 0xa83a2a);
    r.set(31, 23, 0xe8e4d8);
  }
}

const EMPLOYEE_KIT: KitDef = {
  key: 'employee', variants: 4, bones: bonesFor, layout, build: buildEmployee, paint: paintEmployee, sphere: [0, 1.0, 0, 1.6],
};

// ------------------------------------------------------------------ poses
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'fing1L', 'fing2L', 'thumbL', 'uarmR', 'farmR', 'handR', 'fing1R', 'fing2R', 'thumbR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
interface EPose { band: 0 | 1 | 2; y: number; floor?: boolean; curl?: number; p: Pose }
const curlOf = (p: Pose, cl: number, cr = cl): Pose => ({
  ...p, fing1L: [0, 0, -cl * 1.0], fing2L: [0, 0, -cl * 1.2], thumbL: [cl * 0.4, cl * 0.5, -cl * 0.4], fing1R: [0, 0, cr * 1.0], fing2R: [0, 0, cr * 1.2], thumbR: [cr * 0.4, -cr * 0.5, cr * 0.4],
});
/** frozen poses, from "just standing there" to "reaching for you". Every joint a little past where it should stop. */
const POSES: EPose[] = [
  // ---- far: shop-window poses
  { band: 0, y: 0, p: curlOf({ hips: [0, 0, 0.03], uarmL: [0.05, 0, 0.14], farmL: [-0.3, 0, 0], handL: [0, 0, 0.3], uarmR: [-0.12, 0, -0.08], farmR: [-0.5, 0, 0], head: [0.06, 0.28, -0.14], thighL: [-0.05, 0, 0.05], shinL: [0.1, 0, 0], thighR: [0.07, 0, -0.03] }, 0.15) },
  { band: 0, y: 0, p: curlOf({ thighL: [-0.5, 0, 0], shinL: [0.2, 0, 0], footL: [0.25, 0, 0], thighR: [0.38, 0, 0], shinR: [0.55, 0, 0], footR: [-0.3, 0, 0], uarmL: [0.4, 0, 0.06], farmL: [-0.18, 0, 0], uarmR: [-0.45, 0, -0.05], farmR: [-0.38, 0, 0], spine: [0.05, 0, 0], neck: [0, 0.75, 0], head: [0.12, 1.2, 0] }, 0.2) }, // mid-stride, looking back over its shoulder: too far
  { band: 0, y: 0, p: curlOf({ uarmL: [-0.55, 0, 0.26], farmL: [-2.05, 0, 0], handL: [0, 0, -0.2], uarmR: [-0.52, 0, -0.3], farmR: [-2.0, 0, 0], handR: [0, 0, 0.2], neck: [0.38, 0, 0], head: [0.6, 0, 0] }, 0.65) }, // adjusting a tie that is not there
  { band: 0, y: 0, p: curlOf({ uarmL: [-0.5, 0, 0.6], farmL: [-1.9, 0.45, 0], handL: [0.2, 0, 0.3], head: [0.62, 0.6, 0.18], neck: [0.2, 0.2, 0], uarmR: [0.05, 0, -0.06] }, 0.3) }, // checking a watch it does not wear
  { band: 0, y: -0.86, floor: true, p: curlOf({ thighL: [-1.52, 0, 0.12], thighR: [-1.5, 0, -0.08], shinL: [0.06, 0, 0], shinR: [0.02, 0, 0], footL: [-0.3, 0, 0], footR: [-0.25, 0, 0], spine: [-0.18, 0, 0], uarmL: [0.12, 0, 0.3], farmL: [-0.1, 0, 0], uarmR: [0.2, 0, -0.26], farmR: [0.15, 0, 0], neck: [0.2, 0, 0.3], head: [0.3, -0.5, 0.55] }, 0.1) }, // discarded on the floor
  // ---- middle distance
  { band: 1, y: 0, p: curlOf({ uarmR: [-1.62, 0, 0.06], farmR: [0.12, 0, 0], chest: [0, -0.18, 0], uarmL: [0.08, 0, 0.05], head: [0.1, 0, 0.5], neck: [0, 0, 0.12] }, 0.05, 0) }, // pointing at you
  { band: 1, y: 0, p: curlOf({ head: [0.25, 0, 1.4], neck: [0, 0, 0.5], uarmR: [-2.65, 0, -0.25], farmR: [-0.55, 0, 0], uarmL: [0.05, 0, 0.1], farmL: [0.28, 0, 0], chest: [0, 0, -0.12] }, 0.3) }, // head lolled past where a neck stops
  { band: 1, y: 0, p: curlOf({ uarmL: [0, 0, 1.52], uarmR: [0, 0, -1.52], farmL: [0, 0, 0.2], farmR: [0, 0, -0.2], handL: [0, 0, 0.35], handR: [0, 0, -0.35], head: [-0.55, 0, 0], neck: [-0.25, 0, 0] }, 0) }, // arms out, head thrown back
  { band: 1, y: -0.48, p: curlOf({ thighL: [-1.55, 0, 0.12], shinL: [1.58, 0, 0], footL: [0.05, 0, 0], thighR: [0.12, 0, -0.06], shinR: [1.62, 0, 0], footR: [0.7, 0, 0], spine: [0.04, 0, 0], neck: [-0.2, 0, 0.1], head: [-0.45, 0, 0.25], uarmL: [0.12, 0, 0.1], farmL: [0.3, 0, 0], uarmR: [0.06, 0, -0.08], farmR: [0.32, 0, 0] }, 0.2) }, // kneeling, looking up at you
  { band: 1, y: 0, p: curlOf({ uarmL: [-0.95, 0, 0.12], farmL: [-1.15, 0, 0], handL: [-0.6, 0, 0], head: [0.18, 0, -0.35], uarmR: [0.06, 0, -0.08], chest: [0.06, 0.15, 0] }, 1.0, 0.2) }, // beckoning
  // ---- close: reaching
  { band: 2, y: 0, p: curlOf({ uarmL: [-1.42, 0.15, 0.08], uarmR: [-1.48, -0.15, -0.08], farmL: [-0.25, 0, 0], farmR: [-0.15, 0, 0], spine: [0.12, 0, 0], chest: [0.1, 0, 0], head: [0.15, 0, 0.14], thighL: [-0.3, 0, 0], shinL: [0.2, 0, 0], thighR: [0.25, 0, 0], shinR: [0.3, 0, 0] }, 0.55) },
  { band: 2, y: -0.12, p: curlOf({ thighL: [-0.95, 0, 0], shinL: [1.0, 0, 0], thighR: [0.55, 0, 0], shinR: [0.65, 0, 0], footR: [-0.4, 0, 0], spine: [0.25, 0, 0], chest: [0.15, 0, 0], uarmL: [-1.78, 0, 0.15], uarmR: [-1.05, 0, -0.2], farmL: [-0.2, 0, 0], head: [-0.3, 0, 0] }, 0.7) }, // mid-lunge
  { band: 2, y: -0.5, floor: true, p: curlOf({ thighL: [-1.75, 0, 0.3], thighR: [-1.75, 0, -0.3], shinL: [2.25, 0, 0], shinR: [2.25, 0, 0], footL: [-0.5, 0, 0], footR: [-0.5, 0, 0], spine: [0.6, 0, 0], chest: [0.3, 0, 0], neck: [-0.55, 0, 0], head: [-0.8, 0, 0.3], uarmL: [-0.7, 0, 0.35], farmL: [-0.55, 0, 0], uarmR: [-1.0, 0, -0.3], farmR: [-0.6, 0, 0] }, 0.6) }, // crouched, looking up at you
  { band: 2, y: -0.5, floor: true, p: curlOf({ hips: [1.25, 0, 0], thighL: [-1.35, 0, 0.05], thighR: [-1.38, 0, -0.05], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0], chest: [0.1, 0, 0], uarmL: [-1.35, 0, 0.1], uarmR: [-1.15, 0, -0.1], farmL: [0.2, 0, 0], farmR: [-0.1, 0, 0], handL: [-0.9, 0, 0], handR: [-1.0, 0, 0], neck: [-0.8, 0, 0], head: [-0.7, 0, -0.15] }, 0.4) }, // on all fours, face up
  { band: 2, y: 0, p: curlOf({ hips: [0, Math.PI, 0], spine: [-0.12, 0, 0], chest: [-0.1, 0, 0], neck: [0, 1.6, 0], head: [-0.1, 1.54, 0.1], uarmL: [1.25, 0, 0.12], uarmR: [1.1, 0, -0.12], farmL: [0.35, 0, 0], farmR: [0.3, 0, 0], thighL: [0.1, 0, 0], thighR: [-0.12, 0, 0], shinR: [0.2, 0, 0] }, 0.5) }, // facing away; the head is not
];
const ATTACK: Pose = curlOf({ uarmL: [-1.58, 0.28, 0.02], uarmR: [-1.62, -0.28, -0.02], farmL: [-0.4, 0, 0], farmR: [-0.4, 0, 0], handL: [0.3, 0, 0], handR: [0.3, 0, 0], spine: [0.22, 0, 0], chest: [0.12, 0, 0], head: [0.3, 0, 0], thighL: [-0.62, 0, 0], shinL: [0.42, 0, 0], thighR: [0.42, 0, 0], shinR: [0.32, 0, 0] }, 0.95);
const WIND: Pose = curlOf({ uarmL: [-0.4, 0, 0.5], uarmR: [-0.4, 0, -0.5], farmL: [-1.4, 0, 0], farmR: [-1.4, 0, 0], spine: [-0.08, 0, 0], head: [-0.25, 0, 0.3], thighL: [-0.2, 0, 0], shinL: [0.3, 0, 0], thighR: [0.3, 0, 0], shinR: [0.2, 0, 0] }, 0);
/** stop-motion stride: four keys and nothing in between */
const GAIT: Pose[] = [
  curlOf({ thighL: [-0.48, 0, 0], shinL: [0.12, 0, 0], footL: [0.2, 0, 0], thighR: [0.36, 0, 0], shinR: [0.45, 0, 0], footR: [-0.25, 0, 0], uarmL: [0.36, 0, 0.05], uarmR: [-0.42, 0, -0.05], farmL: [-0.18, 0, 0], farmR: [-0.25, 0, 0], spine: [0.05, 0, 0] }, 0.2),
  curlOf({ thighL: [-0.06, 0, 0], shinL: [0.06, 0, 0], thighR: [-0.25, 0, 0], shinR: [0.95, 0, 0], footR: [0.2, 0, 0], uarmL: [0.05, 0, 0.05], uarmR: [-0.06, 0, -0.05], farmL: [-0.15, 0, 0], farmR: [-0.15, 0, 0], spine: [0.03, 0, 0] }, 0.2),
  curlOf({ thighR: [-0.48, 0, 0], shinR: [0.12, 0, 0], footR: [0.2, 0, 0], thighL: [0.36, 0, 0], shinL: [0.45, 0, 0], footL: [-0.25, 0, 0], uarmR: [0.36, 0, -0.05], uarmL: [-0.42, 0, 0.05], farmR: [-0.18, 0, 0], farmL: [-0.25, 0, 0], spine: [0.05, 0, 0] }, 0.2),
  curlOf({ thighR: [-0.06, 0, 0], shinR: [0.06, 0, 0], thighL: [-0.25, 0, 0], shinL: [0.95, 0, 0], footL: [0.2, 0, 0], uarmR: [-0.05, 0, -0.05], uarmL: [0.06, 0, 0.05], farmL: [-0.15, 0, 0], farmR: [-0.15, 0, 0], spine: [0.03, 0, 0] }, 0.2),
];
/** dragging itself along by the arms (a leg is missing) */
const CRAWL: Pose[] = [
  curlOf({ hips: [1.45, 0, 0], thighL: [-1.2, 0, 0.1], thighR: [-1.3, 0, -0.1], shinL: [0.3, 0, 0], shinR: [0.4, 0, 0], uarmL: [-2.6, 0, 0.2], farmL: [0.2, 0, 0], uarmR: [-1.0, 0, -0.2], farmR: [-0.6, 0, 0], neck: [-0.9, 0, 0], head: [-0.6, 0, 0] }, 0.8),
  curlOf({ hips: [1.45, 0, 0], thighL: [-1.25, 0, 0.1], thighR: [-1.25, 0, -0.1], shinL: [0.3, 0, 0], shinR: [0.4, 0, 0], uarmR: [-2.6, 0, -0.2], farmR: [0.2, 0, 0], uarmL: [-1.0, 0, 0.2], farmL: [-0.6, 0, 0], neck: [-0.9, 0, 0], head: [-0.6, 0, 0.2] }, 0.8),
];
const SLACK: Pose = { uarmL: [0.15, 0, 0.25], uarmR: [0.1, 0, -0.3], farmL: [-0.2, 0, 0], farmR: [0.25, 0, 0], thighL: [-0.3, 0, 0.1], shinL: [0.7, 0, 0], thighR: [-0.1, 0, -0.1], shinR: [0.5, 0, 0], spine: [0.35, 0, 0], chest: [0.15, 0, 0], neck: [0.3, 0, 0.4], head: [0.4, 0.5, 0.9] };

function legless(lost: Set<string>) { return lost.has('thighL') || lost.has('thighR') || lost.has('shinL') || lost.has('shinR'); }

function show(rig: Rig, pose: Pose, y: number, k = 1) {
  applyPose(rig, pose, JOINTS, k);
  offset(rig, 'hips', 0, y, 0);
}

function animateEmployee(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(idHash(c) * 4)); }
  kitSync(K);
  const m = K.kit.m;
  const lost = lostParts(c);
  const noLegs = legless(lost);
  // ---- dead: the joints let go in two or three stiff snaps
  if (c.dead) {
    if (m.deadAt === undefined) { m.deadAt = t; m.deadFrom = poseNow(rig); }
    const u = Math.min(1, (t - m.deadAt) / 0.45);
    const step = Math.floor(u * 3) / 3; // snaps, not a slump
    show(rig, mixPose(m.deadFrom, SLACK, step, JOINTS), -0.05 * step);
    rig.root.position.x += 0; return;
  }
  m.deadAt = undefined;
  const n = nm(c);
  const frozen = c.state === 'frozen';
  // keep the head turned toward whoever it last wanted, and only update that while nobody looks
  const tgt = nearestSurvivor(c, 30);
  if (tgt && !frozen) { const [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 1.75, 1.3, 0.6); m.yaw = yaw; m.pitch = pitch; }
  const yaw = m.yaw ?? 0, pitch = m.pitch ?? 0;
  const ac = attackCurve(rig, c, t);
  if (c.attackPhase > 0 || ac.follow > 0) {
    // wind-up (arms drawn back), the snap to the throat, a held squeeze
    const a = c.attackPhase > 0 ? (ac.strike > 0 ? mixPose(WIND, ATTACK, Math.min(1, ac.strike * 2.2), JOINTS) : mixPose(POSES[0].p, WIND, ac.wind, JOINTS)) : mixPose(ATTACK, POSES[0].p, 1 - ac.follow, JOINTS);
    show(rig, a, -0.05 * ac.strike);
    rig.parts.head.rotation.z += Math.sin(t * 50) * 0.22 * ac.strike;
    rig.parts.head.rotation.y += yaw * 0.6;
  } else if (c.speed > 0.2 && !frozen) {
    // unobserved and moving: a stop-motion walk, four held keys, no in-betweens
    m.snapT = (m.snapT ?? 0) + dt;
    if (m.snapT > 0.17) { m.snapT = 0; m.key = ((m.key ?? 0) + 1) % 4; m.holdX = c.x; m.holdZ = c.z; }
    const set = noLegs ? CRAWL : GAIT;
    show(rig, set[(m.key ?? 0) % set.length], noLegs ? -0.62 : (m.key & 1 ? 0.02 : -0.02));
    rig.parts.head.rotation.y += yaw * 0.9; rig.parts.head.rotation.x += pitch * 0.5;
    // it is drawn where it was a moment ago until the next key
    if (m.holdX !== undefined && Math.hypot(m.holdX - c.x, m.holdZ - c.z) < 1.2) { rig.root.position.x = m.holdX; rig.root.position.z = m.holdZ; }
  } else {
    let i = (n.pose ?? 0) % POSES.length;
    // with a leg gone it can only ever be found on the floor
    if (noLegs && !POSES[i].floor) i = [4, 12, 13][(n.pose ?? 0) % 3];
    const P = POSES[i];
    show(rig, P.p, P.y);
    if (i !== 14) { rig.parts.head.rotation.y += yaw * 0.85; rig.parts.head.rotation.x += pitch * 0.4; }
  }
  // a hollow fibreglass shudder when struck, and the struck joint knocked askew
  const fl = flinchOf(c);
  rig.body.position.x = fl > 0 ? Math.sin(t * 90) * 0.022 * fl : 0;
  if (fl > 0) { rig.parts.head.rotation.z += 0.25 * fl; rig.parts.chest.rotation.x -= 0.12 * fl; }
}

function poseNow(rig: Rig): Pose {
  const out: Pose = {};
  for (const n of JOINTS) { const o = rig.parts[n]; if (o) out[n] = [o.rotation.x, o.rotation.y, o.rotation.z]; }
  return out;
}

/** strict observation: a survivor's vision cone, line of sight and enough light to see by */
function watched(c: Creature): boolean {
  const z = zoneOf(c);
  for (const p of playersIn(c)) {
    if (p.sleeping || p.body.downed) continue;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
    if (d > 32) continue;
    const ang = Math.abs(angleDiff(p.facing, Math.atan2(dz, dx)));
    const cone = (p.isLocal && G.view ? G.view.vis.coneHalf : 1.4) + 0.05;
    if (ang > cone) continue;
    if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
    const lit = lightAt(c.zoneKey, c.x, c.z) + (p.flashlightOn && ang < 0.55 && d < 16 ? 1 : 0);
    if (lit < 0.1 && d > 1.6) continue;
    return true;
  }
  return false;
}

function pickPose(c: Creature, d: number) {
  const band = d > 9 ? 0 : d > 4 ? 1 : 2;
  const opts = POSES.map((p, i) => [i, p.band] as const).filter(([i, b]) => b === band && i !== nm(c).pose);
  const pick = opts[Math.floor(CS().rng.next() * opts.length)]?.[0] ?? 0;
  netSet(c, 'pose', pick);
}

function thinkEmployee(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  pulse(c);
  const seen = watched(c);
  const tp = nearestPlayer(c, 28, (p) => !p.body.dead);
  if (seen) {
    if (c.state !== 'frozen') { c.setState('frozen'); c.mem.moved = 0; }
    stop(c); c.targetFacing = c.facing;
    return true;
  }
  // nobody is looking
  if (c.state === 'frozen' || c.state === 'chase' || c.state === 'idle') {
    if (c.state === 'frozen') pickPose(c, tp ? tp.d : 20);
    c.setState(tp ? 'stalk' : 'wander');
  }
  if (tp) {
    const p = tp.p;
    c.targetId = p.id;
    faceTo(c, p.x, p.z, true); // it is always already facing you when you look back
    const reach = (c.sp.attack?.range ?? 0.9) + p.radius;
    if (tp.d <= reach) {
      stop(c);
      if (c.attackT <= 0) attack(c, p);
      return true;
    }
    if (c.state !== 'stalk') c.setState('stalk');
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.85);
    c.mem.moved = (c.mem.moved ?? 0) + c.speed * dt;
    if (c.mem.moved > 1.6) { c.mem.moved = 0; pickPose(c, tp.d); }
    return true;
  }
  // no one in range: drift through the cubicles, changing pose when unobserved
  if (c.state !== 'wander') c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 25) { c.goal = cs.wanderSpot(c, z, 14); c.stateT = 0; }
  c.mem.moved = (c.mem.moved ?? 0) + c.speed * dt;
  if (c.mem.moved > 3) { c.mem.moved = 0; pickPose(c, 20); }
  return true;
}

const sp = def({
  key: 'employee', name: 'The Employee', code: 'E-21 // MANNEQUIN-STAFF', temperament: 'stalker', threat: 4,
  rule: { name: 'ONLY WHEN UNWATCHED', text: 'It cannot move while you look at it in the light. Darkness, sleep and turning your back all count as not looking. It cannot open doors.' },
  hp: 85, walk: 2.4, run: 6.2, turn: 30, radius: 0.3, height: 1.95, sight: 30, fov: 3.1, hearing: 0.6, nightVision: true,
  attack: { dmg: [11, 19], range: 0.85, cooldown: 1.4, kinds: ['laceration', 'bruise', 'deep'], corrupt: 0.12, knock: 0.9, parts: ['neck', 'head', 'torso_u', 'uarm_l', 'uarm_r'] },
  zones: ['office', 'school', 'stairwell', 'mall', 'hospital', 'lab'], weight: 1, maxPerZone: 2, diet: 'none',
  flags: { weepingAngel: true },
  sounds: { attack: 'employee_crack', hurt: 'mannequin_knock', death: 'mannequin_fall' },
  scan: {
    cls: 'Observer-bound mimic',
    notes: [
      'Fibreglass shell in a beige suit. No face. Badge photo is blank. There is a price tag on its cuff with no price on it.',
      'Does not move while a survivor is looking at it in the light. It moves very fast when nobody is.',
      'Darkness counts as not looking. So does sleeping. So does turning your back.',
      'Walk backwards through a door and close it. It has never been seen opening one.',
      'Its pose is different every time you look. The closer it is, the more it is reaching.',
    ],
  },
  gore: { blood: 'shell', sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: () => buildKitRig(EMPLOYEE_KIT, 0, 1.95),
  animate: animateEmployee,
  think: thinkEmployee,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const K = rig as KitRig;
  kitSync(K);
  const q = galleryPose('');
  const n = Number(q);
  if (q === 'walk') { show(rig, GAIT[Math.floor(t / 0.17) % 4], 0); return; }
  if (q === 'crawl') { show(rig, CRAWL[Math.floor(t / 0.3) % 2], -0.62); return; }
  if (q === 'attack') { show(rig, ATTACK, -0.05); return; }
  if (q === 'dead') { show(rig, SLACK, -0.05); return; }
  if (q.startsWith('v')) kitPersonalize(K, Number(q.slice(1)) || 0);
  const i = q !== '' && Number.isFinite(n) ? Math.abs(Math.floor(n)) % POSES.length : Math.floor(t / 1.5) % POSES.length;
  show(rig, POSES[i].p, POSES[i].y);
};
