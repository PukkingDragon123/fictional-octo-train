import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import {
  net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, fx, fxPoll, playAt, live,
  lightAt, beamOn, sees, seenByAny, angleDiff, lineOfSightB, localIn, thinkOnce, pickReach,
} from '../behaviors_b';
import '../../audio/sounds_creatures_b';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, V3, buildKitRig, kitSync, kitPersonalize, tube, headLoft, handLoft, footLoft, frames, pathFrames,
  wLerp, gauss, angd, FOOT_BARE, lostParts, nearestSurvivor, lookAngles, attackCurve, flinchOf, hash, offset, norm, cross, sub, addV, scl,
} from '../kit/humanoids';

// Echo: a gangly, eyeless thing whose head is all ears and a vertical mouth.
// It stays out of sight and calls out in a borrowed voice (a snippet a friend
// actually said in co-op voice chat; a synthesised call when alone), then
// moves before anyone arrives where the voice came from. It drifts toward
// voices and noise it hears. Light is the counter: a flashlight beam on it
// sends it shrieking away, and it only ever strikes from behind, in the dark.

// ------------------------------------------------------------------ skeleton
function bonesE(v: number): BoneSpec[] {
  const L = 1 + (v % 3) * 0.04;
  const b: BoneSpec[] = [
    { name: 'pelvis', parent: '', at: [0, 1.12, 0] },
    { name: 'torso', parent: 'pelvis', at: [0, 0.04, 0] },
    { name: 'chest', parent: 'torso', at: [0, 0.3, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.3, 0.0], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.32, 0.02], cap: true },
    { name: 'jawL', parent: 'head', at: [0.028, 0.11, 0.09] },
    { name: 'jawR', parent: 'head', at: [-0.028, 0.11, 0.09] },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'arm' + s, parent: 'chest', at: [k * 0.16, 0.25, -0.01], cap: true },
      { name: 'fore' + s, parent: 'arm' + s, at: [0, -0.6 * L, 0], cap: true },
      { name: 'hand' + s, parent: 'fore' + s, at: [0, -0.58 * L, 0], cap: true },
      { name: 'f1' + s, parent: 'hand' + s, at: [0, -0.09, 0] },
      { name: 'f2' + s, parent: 'f1' + s, at: [0, -0.11, 0] },
      { name: 'th' + s, parent: 'hand' + s, at: [-k * 0.004, -0.03, 0.026] },
      { name: 'thigh' + s, parent: 'pelvis', at: [k * 0.08, -0.06, 0], cap: true },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.52, 0], cap: true },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.5, 0] },
    );
  }
  return b;
}
const LEN = (v: number) => 1 + (v % 3) * 0.04;

function layoutE(p: Page) {
  p.reg('TORSO', 72, 60, [1.04, 1.76]);
  p.reg('HEAD', 80, 52, [-0.03, 0.36]);
  p.reg('ARM', 20, 84, [-1.24, 0.03]);
  p.reg('LEG', 22, 72, [-1.04, 0.07]);
  p.reg('NECK', 22, 28, [-0.04, 0.34]);
  p.reg('HAND', 18, 30);
  p.reg('FOOT', 24, 16);
  p.reg('EAR', 16, 16);
  p.reg('MOUTH', 12, 26);
  p.reg('LIP', 8, 26);
  p.reg('CAP', 16, 16);
}

const TORSO_E: Row[] = [
  { y: 1.05, rx: 0.05, rf: 0.04, rb: 0.045 },
  { y: 1.09, rx: 0.11, rf: 0.07, rb: 0.075 },
  { y: 1.16, rx: 0.112, rf: 0.07, rb: 0.072 },
  { y: 1.26, rx: 0.08, rf: 0.05, rb: 0.06 },     // a waist you could close a hand around
  { y: 1.38, rx: 0.1, rf: 0.07, rb: 0.064 },
  { y: 1.5, rx: 0.118, rf: 0.082, rb: 0.07 },
  { y: 1.62, rx: 0.13, rf: 0.08, rb: 0.074 },
  { y: 1.7, rx: 0.15, rf: 0.066, rb: 0.072, sq: 2.6 },
  { y: 1.735, rx: 0.1, rf: 0.05, rb: 0.056 },
  { y: 1.76, rx: 0.04, rf: 0.036, rb: 0.04 },
];
const ARM_E: Row[] = [
  { y: 0.0, rx: 0.02, rf: 0.024, rb: 0.024, cx: -0.006 },
  { y: -0.02, rx: 0.032, rf: 0.032, rb: 0.032 },
  { y: -0.12, rx: 0.03, rf: 0.032, rb: 0.03 },
  { y: -0.56, rx: 0.022, rf: 0.022, rb: 0.024 },
  { y: -0.6, rx: 0.028, rf: 0.026, rb: 0.03 },
  { y: -0.65, rx: 0.022, rf: 0.022, rb: 0.022 },
  { y: -1.12, rx: 0.016, rf: 0.018, rb: 0.017 },
  { y: -1.18, rx: 0.018, rf: 0.02, rb: 0.019 },
];
const LEG_E: Row[] = [
  { y: 0.06, rx: 0.044, rf: 0.046, rb: 0.05 },
  { y: -0.01, rx: 0.056, rf: 0.056, rb: 0.06 },
  { y: -0.2, rx: 0.044, rf: 0.044, rb: 0.048 },
  { y: -0.48, rx: 0.032, rf: 0.036, rb: 0.032 },
  { y: -0.52, rx: 0.038, rf: 0.042, rb: 0.036 },
  { y: -0.57, rx: 0.03, rf: 0.032, rb: 0.036 },
  { y: -0.7, rx: 0.032, rf: 0.03, rb: 0.04 },
  { y: -0.98, rx: 0.02, rf: 0.022, rb: 0.024 },
  { y: -1.03, rx: 0.022, rf: 0.024, rb: 0.024 },
];
const HEAD_E: Row[] = [
  { y: -0.02, rx: 0.03, rf: 0.032, rb: 0.03 },
  { y: 0.02, rx: 0.06, rf: 0.07, rb: 0.058, cz: 0.01 },
  { y: 0.08, rx: 0.074, rf: 0.082, rb: 0.072, cz: 0.01 },
  { y: 0.15, rx: 0.084, rf: 0.088, rb: 0.086 },
  { y: 0.22, rx: 0.09, rf: 0.088, rb: 0.096 },
  { y: 0.28, rx: 0.088, rf: 0.082, rb: 0.1, cz: -0.012 },  // swept back, too long
  { y: 0.32, rx: 0.072, rf: 0.064, rb: 0.088, cz: -0.024 },
  { y: 0.35, rx: 0.04, rf: 0.036, rb: 0.052, cz: -0.034 },
];

/** a human ear: a cupped fan polygon set into a surface, both sides drawn */
function ear(B: SkinB, c: V3, n: V3, up: V3, s: number, R: Region, w: Wt, cup = 0.4) {
  const nn = norm(n), side = norm(cross(up, nn)), u2 = norm(cross(nn, side));
  // outline (fraction of size): helix rim from the top round to the lobe, the tragus notch
  const rim: [number, number][] = [[0.0, 0.62], [0.32, 0.5], [0.46, 0.18], [0.42, -0.18], [0.24, -0.46], [0.02, -0.62], [-0.14, -0.4], [-0.1, -0.1], [-0.2, 0.12], [-0.22, 0.4]];
  const P = (a: number, b: number, d: number): V3 => addV(addV(addV(c, scl(side, a * s)), scl(u2, b * s)), scl(nn, d * s));
  const ctr = P(0.08, 0, -cup * 0.25);
  const pts = rim.map(([a, b]) => P(a, b, cup * (0.3 + 0.7 * Math.hypot(a, b))));
  const uv = (a: number, b: number) => [R.x + (0.5 + a * 0.75) * R.w, R.y + (0.5 - b * 0.75) * R.h];
  for (const back of [false, true]) {
    const ci = B.vert(ctr, uv(0.08, 0)[0], uv(0.08, 0)[1], w, -1, back ? 0.7 : 1);
    const ids = pts.map((p, i) => B.vert(p, uv(rim[i][0], rim[i][1])[0], uv(rim[i][0], rim[i][1])[1], w, -1, back ? 0.7 : 1));
    for (let i = 0; i < ids.length; i++) {
      const a = ids[i], b2 = ids[(i + 1) % ids.length];
      const A = B.pos(a), Bp = B.pos(b2), C = B.pos(ci);
      const nrm = cross(sub(A, C), sub(Bp, C));
      const front = (nrm[0] * nn[0] + nrm[1] * nn[1] + nrm[2] * nn[2]) > 0;
      if (front !== back) B.tri(ci, a, b2); else B.tri(ci, b2, a);
    }
  }
}

function buildE(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, L = LEN(x.variant);
  const tw = (y: number): Wt => {
    if (y < 1.12) return [bi('pelvis'), 1];
    if (y < 1.2) return wLerp(y, 1.12, 1.2, bi('pelvis'), bi('torso'));
    if (y < 1.42) return [bi('torso'), 1];
    if (y < 1.52) return wLerp(y, 1.42, 1.52, bi('torso'), bi('chest'));
    if (y < 1.74) return [bi('chest'), 1];
    return [bi('chest'), 0.5, bi('neck'), 0.5];
  };
  // ribs in ridges, the spine a row of knuckles
  tube(B, { rows: TORSO_E, ys: [1.05, 1.09, 1.12, 1.16, 1.21, 1.26, 1.32, 1.38, 1.44, 1.5, 1.56, 1.62, 1.66, 1.7, 1.72, 1.735, 1.76], n: 12, reg: R('TORSO'), vr: R('TORSO').range, w: tw, g: 1, start: [0, 1.045, 0], end: [0, 1.77, -0.004],
    bump: (th, y) => (Math.cos(th) > -0.3 ? 0.07 * Math.pow(Math.max(0, Math.sin(y * 62)), 2) * gauss(y, 1.52, 0.1) : 0) + gauss(Math.abs(angd(th, Math.PI)), 0, 0.12) * 0.08 * Math.max(0, Math.sin(y * 90)) - gauss(y, 1.3, 0.06) * gauss(th, 0, 0.4) * 0.1 });
  tube(B, { rows: [{ y: -0.04, rx: 0.036, rf: 0.034, rb: 0.038 }, { y: 0.06, rx: 0.026, rf: 0.026, rb: 0.03 }, { y: 0.2, rx: 0.024, rf: 0.024, rb: 0.028 }, { y: 0.33, rx: 0.03, rf: 0.032, rb: 0.03 }],
    ys: [-0.04, 0.02, 0.06, 0.13, 0.2, 0.27, 0.33], n: 8, reg: R('NECK'), vr: R('NECK').range, at: x.rest('neck'), w: (y) => (y < 0.0 ? [bi('chest'), 0.5, bi('neck'), 0.5] : y > 0.28 ? [bi('neck'), 0.4, bi('head'), 0.6] : [bi('neck'), 1]), g: 4 });
  // the head: long, swept back, no eyes; a vertical groove the mouth sits in
  const hp = x.rest('head');
  headLoft(B, { at: hp, rows: HEAD_E, reg: R('HEAD'), vr: R('HEAD').range, w: () => [bi('head'), 1], g: 6, top: 0.36, bottom: -0.025,
    bump: (th, y) => -gauss(th, 0, 0.1) * gauss(y, 0.11, 0.08) * 0.14 - gauss(Math.abs(th), 0.42, 0.18) * gauss(y, 0.21, 0.02) * 0.05 });
  // lips of the vertical mouth: two ridges either side of the slit that swing open sideways
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const J = bi('jaw' + s);
    const pts: V3[] = [0.21, 0.17, 0.11, 0.05, 0.01].map((y) => [hp[0] + k * 0.012, hp[1] + y, hp[2] + 0.078 + gauss(y, 0.11, 0.08) * 0.004]);
    const fr = pathFrames(pts, pts.map((_, i) => [0.012 * (i === 0 || i === 4 ? 0.5 : 1), 0.009 * (i === 0 || i === 4 ? 0.5 : 1)] as [number, number]), pts.map(() => [J, 1]), [1, 0, 0]);
    frames(B, fr, 6, R('LIP'), 7 + (k > 0 ? 0 : 1), { start: true, end: true });
  }
  // the inside of the mouth (only seen when it opens): teeth on dark gums
  {
    const H = bi('head');
    const z = hp[2] + 0.052;
    B.quad([hp[0] - 0.026, hp[1] + 0.005, z], [hp[0] + 0.026, hp[1] + 0.005, z], [hp[0] + 0.026, hp[1] + 0.215, z], [hp[0] - 0.026, hp[1] + 0.215, z], R('MOUTH'), [0, 0, 1, 1], [H, 1]);
  }
  // ears: where ears go, and everywhere else
  {
    const H = bi('head');
    const at = (y: number, deg: number, off = 0): [V3, V3] => {
      const r = HEAD_E.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a));
      const th = (deg * Math.PI) / 180;
      const rr = (Math.abs(Math.sin(th)) * r.rx + Math.max(0, Math.cos(th)) * r.rf + Math.max(0, -Math.cos(th)) * r.rb) * 0.98 + off;
      const n: V3 = [Math.sin(th), 0.15, Math.cos(th)];
      return [[hp[0] + Math.sin(th) * rr, hp[1] + y, hp[2] + (r.cz ?? 0) + Math.cos(th) * rr], n];
    };
    const spots: [number, number, number, number][] = [
      [0.13, 92, 0.075, 0.45], [0.13, -92, 0.075, 0.45], [0.25, 60, 0.05, 0.4], [0.24, -58, 0.055, 0.4], [0.3, 140, 0.05, 0.35], [0.3, -150, 0.045, 0.35],
      [0.18, 180, 0.06, 0.4], [0.07, 130, 0.045, 0.3], [0.08, -125, 0.042, 0.3], [0.33, 20, 0.04, 0.35], [0.2, 120, 0.04, 0.3], [0.19, -122, 0.04, 0.3],
    ];
    for (const [y, deg, s, cup] of spots) { const [c, n] = at(y, deg, 0.014); ear(B, c, n, [0, 1, 0.2], s * 1.55, R('EAR'), [H, 1], cup + 0.2); }
    // and on the neck and shoulders, small ones
    const np = x.rest('neck');
    for (const [dy, k, s] of [[0.12, 1, 0.034], [0.2, -1, 0.03], [0.05, -1, 0.028]] as [number, number, number][]) ear(B, [np[0] + k * 0.034, np[1] + dy, np[2] - 0.004], [k, 0.1, -0.2], [0, 1, 0], s * 1.5, R('EAR'), [bi('neck'), 1], 0.5);
    for (const k of [1, -1]) ear(B, [k * 0.13, 1.72, -0.05], [k * 0.4, 0.7, -0.6], [0, 0.2, 1], 0.065, R('EAR'), [bi('chest'), 1], 0.5);
  }
  // arms: too long, wrists like knots, hands with four very long fingers
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('arm' + s), F = bi('fore' + s), H = bi('hand' + s);
    const at = x.rest('arm' + s);
    const rows = ARM_E.map((r) => ({ ...r, y: r.y * L }));
    const wf = (y: number): Wt => {
      if (y > -0.03) return [U, 0.75, bi('chest'), 0.25];
      if (y > -0.55 * L) return [U, 1];
      if (y > -0.66 * L) return wLerp(y, -0.55 * L, -0.66 * L, U, F);
      if (y > -1.14 * L) return [F, 1];
      return [F, 0.5, H, 0.5];
    };
    tube(B, { rows, ys: [0, -0.02, -0.12, -0.26, -0.42, -0.56, -0.6, -0.65, -0.78, -0.92, -1.05, -1.12, -1.18].map((y) => y * L), n: 7, reg: R('ARM'), vr: R('ARM').range.map((v) => v * L), at, w: wf, g: 10 + (k > 0 ? 0 : 1), mirror: k, start: [at[0] - k * 0.008, at[1] + 0.004, at[2]] });
    const hpp = x.rest('hand' + s);
    handLoft(B, { k, at: [hpp[0], hpp[1] - 0.004, hpp[2]], bones: { farm: F, hand: H, f1: bi('f1' + s), f2: bi('f2' + s), thumb: bi('th' + s) }, reg: R('HAND'), g: 20 + (k > 0 ? 0 : 10), s: 1.0,
      palm: { len: 0.09, w: 0.036, t: 0.012 }, fingers: { n: 4, len: [0.19, 0.22, 0.21, 0.17], r: [0.0062, 0.0066, 0.0064, 0.0058] }, thumb: { len: 0.09, r: 0.0075 } });
    const T = bi('thigh' + s), Sh = bi('shin' + s), Ft = bi('foot' + s);
    const lt = x.rest('thigh' + s);
    const wl = (y: number): Wt => {
      if (y > 0.02) return [bi('pelvis'), 0.5, T, 0.5];
      if (y > -0.47) return [T, 1];
      if (y > -0.57) return wLerp(y, -0.47, -0.57, T, Sh);
      if (y > -1.0) return [Sh, 1];
      return [Sh, 0.5, Ft, 0.5];
    };
    tube(B, { rows: LEG_E, ys: [0.06, -0.01, -0.1, -0.2, -0.34, -0.48, -0.52, -0.57, -0.63, -0.7, -0.84, -0.98, -1.03], n: 7, reg: R('LEG'), vr: R('LEG').range, at: lt, w: wl, g: 30 + (k > 0 ? 0 : 1), mirror: k, start: [lt[0], lt[1] + 0.06, lt[2]], startW: [bi('pelvis'), 0.6, T, 0.4] });
    footLoft(B, { k, at: x.rest('foot' + s), rows: FOOT_BARE, ground: -0.06, sole: 0.003, lip: 0, reg: R('FOOT'), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.3, sx: 0.65, toeLift: 0.12 });
  }
}

function paintE(p: Page, x: BuildCtx) {
  const v = x.variant;
  const SK = makeRamp([0x7a6c66, 0x706a6a, 0x82726a][v % 3], 10, { hueShift: 0.05, spread: 0.6 });
  const VEIN = 0x5a6274, BRUISE = 0x6a4a58;
  const skin = (r: Region, base: number, sd: number, extra?: (xx: number, yy: number) => number) => {
    r.fill(SK, (xx, yy) => {
      const th = (r.deg(xx) * Math.PI) / 180;
      return base + 1.3 * Math.cos(th) - 0.4 + (r.fbm(xx, yy, 3, 3, sd) - 0.5) * 1.3 + (extra ? extra(xx, yy) : 0);
    }, undefined, 0.7);
  };
  // veins under thin skin: branching, blue-grey, faint
  const veins = (r: Region, n: number, sd: number) => { for (let i = 0; i < n; i++) r.crack(hash(i, sd) * r.w, hash(i, sd + 1) * r.h, 8 + Math.floor(hash(i, sd + 2) * 12), 80 + hash(i, sd + 3) * 30, VEIN, sd * 7 + i, 0.28, 0.25); };
  const folds = (r: Region, sd: number) => { for (let yy = 3; yy < r.h; yy += 5) for (let xx = 0; xx < r.w; xx++) if ((xx + (yy >> 2) + sd) % 9 < 4) r.blend(xx, yy, SK[2], 0.3); };
  {
    const r = p.R('TORSO');
    skin(r, 5, 21, (xx, yy) => {
      const h = r.yAt(yy), deg = r.deg(xx), th = (deg * Math.PI) / 180;
      return (Math.cos(th) > -0.3 ? 1.6 * Math.pow(Math.max(0, Math.sin(h * 62)), 2) * gauss(h, 1.52, 0.1) - 1.2 * Math.pow(Math.max(0, -Math.sin(h * 62)), 2) * gauss(h, 1.52, 0.1) : 0)
        + (Math.abs(angd(th, Math.PI)) < 0.12 ? 1.4 * Math.max(0, Math.sin(h * 90)) : 0) - 1.5 * gauss(h, 1.69, 0.03) * gauss(Math.abs(deg), 90, 14) - 1.4 * gauss(h, 1.3, 0.05) * gauss(deg, 0, 30);
    });
    veins(r, 14, 31);
    folds(r, 2);
    for (let i = 0; i < 5; i++) r.blob(hash(i, 41) * r.w, hash(i, 42) * r.h, 3, 2, BRUISE, 0.7);
    // stretch marks along the flanks
    for (const k of [1, -1]) for (let i = 0; i < 5; i++) r.line(r.X(k * (70 + i * 4)), r.Y(1.2), r.X(k * (74 + i * 4)), r.Y(1.32), SK[7], 0.4);
  }
  {
    const r = p.R('NECK');
    skin(r, 4.8, 23);
    for (let yy = 1; yy < r.h; yy += 3) r.hline(r.X(-40), r.X(40), yy, SK[2], 0.35); // tendons, folds of a throat stretched too far
    veins(r, 4, 51);
  }
  // ---------------- head: smooth where eyes should be, dimpled with ear canals, the slit of the mouth
  {
    const r = p.R('HEAD');
    skin(r, 5, 61, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy), a = Math.abs(deg);
      return -2.2 * gauss(deg, 0, 3) * gauss(h, 0.11, 0.08) - 1.6 * gauss(a, 24, 10) * gauss(h, 0.21, 0.015) + 0.8 * gauss(a, 24, 14) * gauss(h, 0.235, 0.012) - 1.2 * Math.max(0, (0.0 - h) / 0.03);
    });
    // where eyes should be: shallow dents of skin, healed over
    for (const k of [-1, 1]) { r.ellipse(r.X(k * 24), r.Y(0.21), 3, 1.6, SK[3], 0.6); r.hline(r.X(k * 24) - 2, r.X(k * 24) + 2, Math.round(r.Y(0.21)), SK[2], 0.6); }
    // the slit
    for (let yy = Math.round(r.Y(0.215)); yy <= Math.round(r.Y(0.005)); yy++) { r.set(r.X(0), yy, 0x1a0c0c); r.blend(r.X(0) - 1, yy, 0x3a1c1a, 0.6); r.blend(r.X(0) + 1, yy, 0x3a1c1a, 0.6); }
    // extra ear canals sunk into the skin
    for (let i = 0; i < 9; i++) { const ex = hash(i, 71) * r.w, ey = r.Y(0.05 + hash(i, 72) * 0.28); if (Math.abs(r.deg(ex)) < 30) continue; r.ellipse(ex, ey, 1.6, 2.2, SK[3], 0.8); r.set(ex, ey, 0x2a1614); r.set(ex, ey + 1, 0x3a2420); }
    veins(r, 8, 81);
  }
  {
    const r = p.R('EAR');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const dx = (xx + 0.5 - r.w / 2) / (r.w / 2), dy = (yy + 0.5 - r.h / 2) / (r.h / 2);
      const d = Math.hypot(dx, dy);
      let l = 5.5 - d * 2.5;
      if (d > 0.62 && d < 0.8) l += 2; // the helix rim
      if (d > 0.84) l -= 2.5;
      if (Math.hypot(dx - 0.05, dy - 0.05) < 0.28) l -= 2.5; // the bowl
      r.put(xx, yy, SK, l + (hash(xx, yy) - 0.5) * 0.5);
    }
    r.ellipse(r.w / 2 + 0.5, r.h / 2 + 1, 1.4, 1.8, 0x2a1614);
    r.blend(r.w / 2 + 2, r.h / 2 - 3, mixHex(SK[5], 0xc05a50, 0.4), 0.7);
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, 0xb0606a, 0.18);
  }
  {
    const r = p.R('MOUTH');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.set(xx, yy, (xx === 0 || xx === r.w - 1) ? 0x4a1e1c : 0x180808);
    for (let yy = 1; yy < r.h - 1; yy += 2) { r.set(2, yy, 0xc8bca4); r.set(3, yy, 0xd8ccb4); r.set(r.w - 3, yy + 1, 0xc8bca4); r.set(r.w - 4, yy + 1, 0xd8ccb4); }
    for (let yy = 0; yy < r.h; yy++) r.set(r.w >> 1, yy, 0x0a0404);
  }
  {
    const r = p.R('LIP');
    r.fill(SK, (xx, yy) => 3.4 + 1.2 * Math.cos((r.deg(xx) * Math.PI) / 180) + ((yy & 1) ? 0.3 : -0.3));
    for (let yy = 0; yy < r.h; yy++) r.blend(r.X(-90), yy, 0x5a2a28, 0.6);
  }
  {
    const r = p.R('ARM');
    skin(r, 4.6, 91, (xx) => -0.7 * Math.max(0, -Math.sin((r.deg(xx) * Math.PI) / 180)));
    veins(r, 10, 93);
    folds(r, 5);
    for (const h of [-0.6, -1.15]) r.hline(0, r.w - 1, Math.round(r.Y(h)), SK[2], 0.6); // elbow and wrist creases
  }
  {
    const r = p.R('LEG');
    skin(r, 4.4, 95, (xx) => -0.7 * Math.max(0, -Math.sin((r.deg(xx) * Math.PI) / 180)));
    veins(r, 8, 97);
    folds(r, 7);
    for (let yy = Math.round(r.h * 0.8); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if (hash(xx, yy) < 0.3) r.blend(xx, yy, 0x3a3028, 0.5);
  }
  {
    const r = p.R('HAND');
    skin(r, 4.6, 99);
    for (let yy = Math.round(r.h * 0.5); yy < r.h; yy += 3) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, SK[2], 0.35);
    for (let xx = 0; xx < r.w; xx++) if (Math.abs(r.deg(xx) - 90) < 40) r.set(xx, r.h - 1, 0x4a3a30); // dirty nails
  }
  {
    const r = p.R('FOOT');
    skin(r, 3.8, 101);
    for (let yy = Math.round(r.h * 0.6); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, 0x2a2420, 0.5);
  }
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      r.set(xx, yy, d > 0.9 ? SK[6] : d < 0.22 ? 0xd8ccb4 : d < 0.3 ? 0x8a7a64 : hash(xx, yy) < 0.3 ? 0x2a0e14 : 0x4a1622);
    }
  }
}

const ECHO_KIT: KitDef = { key: 'echo', variants: 3, bones: bonesE, layout: layoutE, build: buildE, paint: paintE, sphere: [0, 1.0, 0, 1.8] };
function buildEcho(): Rig { return buildKitRig(ECHO_KIT, 0, 2.1); }

function animateEcho(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(hashId(c.id) * 3)); }
  kitSync(K);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const st = c.state;
  const ud = rig.root.userData as { low?: number; mouth?: number; mT?: number; hy?: number; hz?: number; deadT?: number };
  const seed = hashId(c.id);
  const lost = lostParts(c);
  const noLeg = lost.has('thighL') || lost.has('thighR') || lost.has('shinL') || lost.has('shinR');
  const moving = c.speed > 0.15;
  const fast = c.speed > 2.5;
  const ac = attackCurve(rig, c, t);
  // posture: crouched when hiding/stalking, upright when fleeing or calling; low on its arms without a leg
  let lowT = c.dead ? 0 : st === 'hide' ? 1 : st === 'stalk' ? 0.85 : st === 'mimic' ? 0.35 : st === 'flee' ? 0.1 : st === 'chase' ? 0.55 : 0.3;
  if (noLeg && !c.dead) lowT = 1;
  ud.low = (ud.low ?? lowT) + (lowT - (ud.low ?? lowT)) * Math.min(1, dt * 4);
  const low = ud.low;
  const scut = moving ? Math.sin(c.phase) : 0;
  offset(rig, 'pelvis', 0, -low * 0.55 + (moving ? Math.abs(Math.sin(c.phase)) * 0.04 : 0), 0);
  R('pelvis', low * 0.4 + (noLeg ? 0.5 : 0), scut * 0.08, scut * 0.05);
  R('torso', 0.3 + low * 0.45 + (st === 'mimic' ? -0.3 : 0) - ac.wind * 0.3 + ac.strike * 0.4, -scut * 0.1, 0);
  R('chest', 0.15 + low * 0.35 + (st === 'mimic' ? -0.15 : 0), 0, 0);
  R('neck', -0.25 - low * 0.75 + (st === 'mimic' ? -0.25 : 0) - ac.strike * 0.3, 0, 0);
  // gait: long strides; in a crouch it scuttles, elbows high
  const amp = moving ? (fast ? 0.9 : 0.55) : 0;
  for (const [i, side, k] of [[0, 'L', 1], [1, 'R', -1]] as const) {
    const ph0 = c.phase + i * Math.PI;
    const sw = Math.sin(ph0) * amp;
    R('thigh' + side, -low * 1.15 + sw * (noLeg ? 0.3 : 1), 0, k * low * 0.25);
    R('shin' + side, low * 2.0 + Math.max(0, -Math.sin(ph0)) * amp * 1.2, 0, 0);
    R('foot' + side, -low * 0.85, 0, 0);
    // arms: hanging and dragging; in a crawl they walk too
    const armSw = Math.sin(ph0 + Math.PI) * amp * (st === 'stalk' || noLeg ? 1.3 : 0.6);
    let ax = -0.1 - low * 1.05 + armSw, az = k * 0.14, fx_ = -0.3 - low * 0.35, hx = 0;
    if (st === 'hide') { ax = -1.05 + Math.sin(t * 0.7 + i) * 0.04; az = k * 0.32; fx_ = -0.7; hx = -0.4; }
    if (st === 'flee') { ax = 0.6 + Math.sin(t * 14 + i * 2) * 0.45; az = k * 0.55; fx_ = -0.4; }
    if (ac.wind > 0 || ac.strike > 0) { ax = -0.6 * ac.wind * (1 - ac.strike) - 2.0 * ac.strike; az = k * (0.6 * ac.wind * (1 - ac.strike) + 0.15); fx_ = -1.5 * ac.wind * (1 - ac.strike) - 0.15 * ac.strike; }
    R('arm' + side, ax, 0, az); R('fore' + side, fx_, 0, 0); R('hand' + side, hx, 0, 0);
    // fingers: curled at rest, spread to strike, twitching while it listens
    const curl = ac.strike > 0.2 ? 0.05 : st === 'hide' ? 0.55 + Math.sin(t * 6 + i * 3) * 0.15 : 0.35;
    R('f1' + side, 0, 0, -k * curl); R('f2' + side, 0, 0, -k * curl * 1.3); R('th' + side, curl * 0.3, k * curl * 0.4, -k * curl * 0.3);
  }
  // the head listens: snapping tilts toward what it heard (the nearest survivor when there is nothing)
  const snap = Math.floor(t * 1.3 + seed * 9);
  const r1 = ((snap * 9301 + 49297) % 233280) / 233280;
  const listening = st === 'hide' || st === 'idle' || st === 'wander' || st === 'stalk';
  const heard = c.lastHeard && (G as any)?.time !== undefined && G.time - c.lastHeard.t < 4 ? c.lastHeard : null;
  const tgt = heard ? { x: heard.x, z: heard.z, y: 1.4 } : nearestSurvivor(c, 20);
  let yaw = 0;
  if (tgt) [yaw] = lookAngles(c, tgt.x, tgt.z, tgt.y ?? 1.4, 1.6, 1.3, 0.5);
  // one ear toward it: the head rolls so the ear on that side faces the sound, in quantised snaps
  const hy = listening ? yaw * 0.7 + (((snap * 7 + 3) % 5) - 2) * 0.12 : st === 'mimic' ? yaw * 0.5 : yaw * 0.4;
  const hz = listening ? -Math.sign(yaw || 1) * (0.35 + r1 * 0.5) : st === 'mimic' ? 0.55 : 0;
  ud.hy = (ud.hy ?? 0) + (hy - (ud.hy ?? 0)) * Math.min(1, dt * 18);
  ud.hz = (ud.hz ?? 0) + (hz - (ud.hz ?? 0)) * Math.min(1, dt * 18);
  R('head', -0.1 - low * 0.2 + (st === 'mimic' ? -0.35 : 0), ud.hy, ud.hz);
  // mouth: wide while calling (driven by the fx clock so every peer matches), twitching otherwise
  const calling = st === 'mimic' || (ud.mT !== undefined && t - ud.mT < 2.2);
  const mOpen = calling ? 0.35 + Math.abs(Math.sin(t * 11)) * 0.55 : ac.strike > 0 || ac.wind > 0.5 || st === 'flee' ? 1 : 0.04 + Math.max(0, Math.sin(t * 3.1 + seed * 7)) * 0.08;
  ud.mouth = (ud.mouth ?? 0) + (mOpen - (ud.mouth ?? 0)) * Math.min(1, dt * 12);
  R('jawL', 0, ud.mouth * 0.9, 0); R('jawR', 0, -ud.mouth * 0.9, 0);
  const fl = flinchOf(c);
  if (fl > 0) { rig.body.position.x = Math.sin(t * 90) * 0.04 * fl; P.head.rotation.z += 0.5 * fl; } else rig.body.position.x = 0;
  if (c.dead) {
    // folds in on itself: limbs drawn up like a dead spider's
    ud.deadT = (ud.deadT ?? 0) + dt;
    const k = Math.min(1, ud.deadT * 2.5);
    for (const [side, kk] of [['L', 1], ['R', -1]] as const) { R('arm' + side, -1.6 * k, 0, kk * 0.3); R('fore' + side, -2.2 * k, 0, 0); R('thigh' + side, -1.4 * k, 0, kk * 0.2); R('shin' + side, 2.2 * k, 0, 0); R('f1' + side, 0, 0, -kk * 1.2 * k); R('f2' + side, 0, 0, -kk * 1.4 * k); }
    R('neck', 0.6 * k); R('head', 0.5 * k, 0, 0.6 * k); R('jawL', 0, 0.6, 0); R('jawR', 0, -0.6, 0);
    offset(rig, 'pelvis', 0, -0.3 * k, 0);
  }
  // network fx: borrowed voices, clicks and shrieks
  const e = fxPoll(rig, c);
  if (e && live()) {
    if (e.key === 'mimic') { ud.mT = t; G.audio?.mimic?.(c); }
    else playAt(e.key, c, e.a.v ?? 1, e.a.r);
  }
  // being stalked: the local survivor feels it before they see it
  const p = localIn(c);
  if (p && !c.dead && (st === 'stalk' || st === 'chase') && Math.hypot(p.x - c.x, p.z - c.z) < 7) {
    p.body.stress = Math.min(100, p.body.stress + dt * 2);
    thinkOnce(p, 'echo_behind', ['Something is breathing behind me.', 'Don\'t turn around. Turn around.', 'I can hear clicking. Close.'][Math.floor(t) % 3], 90);
  }
}

// ---------------------------------------------------------------- brain (host)
/** prefer the survivor who is most alone */
function pickTarget(c: Creature): Player | null {
  let best: Player | null = null, bs = -Infinity;
  const ps = playersIn(c.zoneKey);
  for (const p of ps) {
    const d = dist(p, c);
    if (d > 40) continue;
    let alone = 30;
    for (const q of ps) if (q !== p) alone = Math.min(alone, dist(p, q));
    const s = alone * 0.5 - d;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
const isDark = (z: Zone, x: number, zz: number) => lightAt(z, x, zz) < 0.35;

function lurkSpot(z: Zone, c: Creature, p: { x: number; z: number }, near?: { x: number; z: number }) {
  // somewhere it can walk to, out of everyone's sight, ideally dark, 7-16 m from the target
  return pickReach(z, c.x, c.z, (x, zz, steps) => {
    const d = Math.hypot(x - p.x, zz - p.z);
    if (d < 6.5 || d > 17 || steps > 40) return null;
    if (near && Math.hypot(x - near.x, zz - near.z) > 9) return null;
    if (seenByAny(z, x, zz, 28)) return null;
    return (isDark(z, x, zz) ? 4 : 0) - Math.abs(d - 11) * 0.3 - steps * 0.04;
  }, 1600);
}

function thinkEcho(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const cs = G.creatures;
  const m = c.mem;
  net(c);
  m.callT = (m.callT ?? rng.float(6, 14)) - dt;
  m.clickT = (m.clickT ?? rng.float(4, 10)) - dt;
  // light is pain: a beam on it, or being clearly seen in bright light
  const beam = beamOn(z, c.x, c.z, 15);
  // seen clearly (lit, close) for more than a moment also drives it off
  m.brightT = c.observed && lightAt(z, c.x, c.z) > 0.7 && (nearestTo(c) ? dist(nearestTo(c)!, c) < 12 : false) ? (m.brightT ?? 0) + dt : 0;
  const brightSeen = !beam && m.brightT > 0.6;
  if ((beam || brightSeen) && c.state !== 'flee') {
    const from = beam || nearestTo(c);
    c.setState('flee');
    c.goal = pickReach(z, c.x, c.z, (x, zz, st) => { const d = from ? Math.hypot(x - from.x, zz - from.z) : 12; return d < 9 || st > 30 || beamOn(z, x, zz, 16) ? null : d * 0.3 + (isDark(z, x, zz) ? 3 : 0) - (seenByAny(z, x, zz, 26) ? 4 : 0); }, 900) || cs.fleeSpot(c, z, from?.x ?? c.x, from?.z ?? c.z);
    if (c.noiseCooldown <= 0) { fx(c, 'echo_shriek', { r: 38 }); c.noiseCooldown = 3; }
    m.shyUntil = G.time + rng.float(12, 22);
    return true;
  }
  if (c.state === 'flee') {
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.8) || c.stateT > 7) { c.setState('hide'); c.goal = null; m.spot = null; }
    return true;
  }
  const p = pickTarget(c);
  if (!p) {
    // nobody around: wander, listen
    if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 14); }
    if (cs.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk * 0.7, dt, 0.8) || c.stateT > 25) c.goal = cs.wanderSpot(c, z, 14);
    return true;
  }
  const d = dist(p, c);
  const behind = Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) > 1.9;
  const dark = isDark(z, c.x, c.z) && lightAt(z, p.x, p.z) < 0.6;
  // watched: the target has it in their view cone (lit, or close), or anyone else can see it at all
  const inCone = Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) < 1.45 && d < 30 && lineOfSightB(z, p.x, p.z, c.x, c.z);
  const watched = (inCone && (!isDark(z, c.x, c.z) || d < 6 || !!beamOn(z, c.x, c.z, 16))) || playersIn(c.zoneKey).some((q) => q !== p && sees(q, z, c.x, c.z, 24));
  // after a strike: away, back into the dark
  if (m.struck) {
    m.struck = false;
    c.setState('flee');
    c.goal = pickReach(z, c.x, c.z, (x, zz, st) => { const d = Math.hypot(x - p.x, zz - p.z); return d < 9 || st > 30 ? null : (isDark(z, x, zz) ? 3 : 0) - (seenByAny(z, x, zz, 26) ? 4 : 0); }, 900) || cs.fleeSpot(c, z, p.x, p.z);
    m.shyUntil = G.time + rng.float(15, 30);
    return true;
  }
  // ---- strike: only from behind, only in the dark, only when nobody else is looking
  if (c.state === 'stalk') {
    if (!behind || !dark || watched || (m.shyUntil ?? 0) > G.time || d > 12) { c.setState('hide'); m.spot = lurkSpot(z, c, p); return true; }
    const reach = (c.sp.attack!.range) + p.radius;
    if (d <= reach && c.attackT <= 0) { cs.startAttack(c, p); m.struck = true; return true; }
    cs.moveTo(c, z, p.x, p.z, d > 4 ? c.sp.run * 0.8 : c.sp.run, dt, reach * 0.7);
    return true;
  }
  if (behind && dark && !watched && d < 9 && (m.shyUntil ?? 0) < G.time && rng.chance(dt * 0.5)) {
    c.setState('stalk');
    return true;
  }
  // ---- calling out
  if (c.state === 'mimic') {
    hold(c); face(c, p.x, p.z);
    if (c.stateT > 2.2) { c.setState('hide'); m.calls = (m.calls ?? 0) + 1; if (m.calls >= 2) { m.calls = 0; m.spot = lurkSpot(z, c, p); } }
    return true;
  }
  // ---- it heard someone: drift toward where the voice/noise came from (staying hidden)
  if (c.lastHeard && G.time - c.lastHeard.t < 0.6 && (m.followT ?? 0) < G.time) {
    const h = c.lastHeard;
    m.followT = G.time + rng.float(6, 12);
    const s = lurkSpot(z, c, p, { x: h.x, z: h.z });
    if (s) m.spot = s;
  }
  // ---- lurking: keep a hidden spot 8-15 m from the target
  const here = { x: c.x, z: c.z };
  const exposed = seenByAny(z, here.x, here.z, 26);
  m.pickT = (m.pickT ?? 0) - dt;
  const atSpot = !!m.spot && dist(m.spot, here) < 0.8;
  if ((!m.spot || d < 5.5 || d > 22 || (exposed && atSpot) || rng.chance(dt * 0.01)) && m.pickT <= 0) {
    m.pickT = 0.8;
    const s = lurkSpot(z, c, p);
    if (s) m.spot = s;
  }
  if (m.spot && dist(m.spot, here) > 0.7) {
    c.setState('hide');
    cs.moveTo(c, z, m.spot.x, m.spot.z, exposed ? c.sp.run : c.sp.walk, dt, 0.6);
    // no progress (blocked by a closed door, furniture): pick elsewhere
    m.stuckT = c.speed < 0.05 ? (m.stuckT ?? 0) + dt : 0;
    if (m.stuckT > 1.5) { m.stuckT = 0; m.spot = lurkSpot(z, c, p); }
    return true;
  }
  c.setState('hide');
  hold(c);
  face(c, p.x, p.z);
  // calls come from where nobody is looking
  if (m.callT <= 0 && d > 5 && d < 26 && !exposed && (!lineOfSightB(z, c.x, c.z, p.x, p.z) || isDark(z, c.x, c.z))) {
    m.callT = rng.float(14, 30);
    c.setState('mimic');
    fx(c, 'mimic');
    return true;
  }
  if (m.clickT <= 0) { m.clickT = rng.float(6, 14); if (d < 16) fx(c, 'echo_click', { v: 0.7, r: 14 }); }
  return true;
}
function nearestTo(c: Creature) {
  let best: Player | null = null, bd = Infinity;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best;
}

const S = def({
  key: 'echo', name: 'Echo', code: 'E-09 // MIMIC-VOX', temperament: 'stalker', threat: 3,
  rule: { name: 'BEHIND, IN THE DARK', text: 'It only strikes from behind, in the dark. Turn and put a light on it and it runs. The voice is never where it is.' },
  hp: 45, walk: 1.4, run: 5.2, turn: 7, radius: 0.32, height: 2.2, sight: 20, fov: 1.6, hearing: 2.4, nightVision: true,
  attack: { dmg: [12, 20], range: 1.1, cooldown: 2.5, kinds: ['laceration', 'deep', 'scratch'], corrupt: 0.15, knock: 0.9, parts: ['torso_u', 'neck', 'uarm_l', 'uarm_r', 'head'] },
  zones: ['pools', 'school', 'stairwell', 'hospital', 'lab', 'corrupt', 'house', 'lobby'], weight: 1, maxPerZone: 2, diet: 'meat',
  flags: { mimic: true },
  sounds: snd({ call: 'mimic_call', attack: 'echo_shriek', hurt: 'echo_shriek', death: 'echo_death' }),
  scan: {
    cls: 'Mimic / ambush predator',
    notes: [
      'No eyes. The head is ears. It hunts by listening, and it remembers voices.',
      'It calls out in a voice you know. The voice never comes from where it is standing a moment later.',
      'Hates light. A flashlight beam on it sends it running. It only strikes from behind, in the dark.',
      'Listen for wet clicking. Stay together; it goes for whoever is alone.',
    ],
  },
  gore: { blood: 'dark', sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildEcho,
  animate: animateEcho,
  think: thinkEcho,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const states = ['hide', 'mimic', 'stalk', 'flee'] as const;
  const k = q && (states as readonly string[]).includes(q) ? states.indexOf(q as any) : q === 'attack' ? 0 : Math.floor(t / 3) % 4;
  const st = q === 'attack' ? 'chase' : states[k];
  const atk = q === 'attack' ? Math.max(0, 0.38 - (t % 1.2) * 0.5) : 0;
  const c = fakeCreature(S, { id: 'g3', state: st, speed: st === 'stalk' || st === 'flee' ? 3 : 0, phase: t * 6, mem: q === 'crawl' ? { severed: ['shinR'] } : {}, attackPhase: atk });
  animateEcho(rig, c, t, 1 / 60);
};
