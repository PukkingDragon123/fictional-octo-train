import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { CS, zoneOf, pulse, attack, stop, faceTo, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live, lineOfSightB } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, attackCurve, flinchOf, hash, gauss } from '../kit/humanoids';
import { chain, sac, paintSkin, paintCap } from '../kit/organic';
import { defDread } from '../dread';
import { TEARS } from '../../gore/tearing';
import { ruleShown } from '../rules';
import { legIK, restOf, jointPos, type LegChain } from './whip_rat';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE STRIDER — Level 0's tall walker. It was a person once: the Institute has
// matched one to a missing debtor by the healed break in its left collarbone.
// The place stretched it. It stands four metres and more, nearly all of it leg:
// long backward-jointed legs (a thigh, a shin, and a foot drawn out into a third
// limb that it walks on the tips of), a gaunt torso with every rib showing,
// arms that hang to its knees, and a small, slack, patient face. Its skin is
// smooth and stretched and sexless, striped with stretch marks, pale as the
// underside of a fish. It walks the yellow halls at the height of the ceiling
// tiles, stepping over the partitions. It listens for footsteps, stops, tilts
// its head, folds itself down to peer into rooms, and when it sees you it runs:
// four-metre strides, arms out. Its rule: it sees movement, not people. Get into
// a room and shut the door, or crouch and keep absolutely still.
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildStrider(variant?)                          -> KitRig (rig.root into any scene)
//   poseStrider(rig, t, dt, pose, { speed, lookYaw, lookPitch, strikeT, move })
//     pose: 'idle' | 'walk' | 'stalk' | 'listen' | 'peer' | 'spot' | 'charge' | 'grab' | 'hold' | 'flee' | 'dead'
//   walking poses tread in place unless { move: true }, which carries rig.root forward
//   along its own +z at the walking speed (feet stay planted on the floor).
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
const LX = 0.16;
const FING = [{ z: 0.034, len: 0.17 }, { z: 0.011, len: 0.19 }, { z: -0.012, len: 0.18 }, { z: -0.033, len: 0.15 }];

function bonesS(): BoneSpec[] {
  const A: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]],
    ['pelvis', 'base', [0, 3.0, 0], true],
    ['belly', 'pelvis', [0, 3.2, 0.015]],
    ['chest', 'belly', [0, 3.46, 0.03], true],
    ['neck', 'chest', [0, 3.79, 0.05], true],
    ['head', 'neck', [0, 3.98, 0.085], true],
    ['jaw', 'head', [0, 3.955, 0.115]],
  ];
  for (const [s, k] of SIDES) {
    const wx = k * 0.275, wz = 0.02, kn = 1.51;
    A.push(['clav' + s, 'chest', [k * 0.05, 3.735, 0.035]], ['sh' + s, 'clav' + s, [k * 0.24, 3.725, 0.02], true], ['el' + s, 'sh' + s, [k * 0.262, 2.725, -0.025], true], ['wr' + s, 'el' + s, [wx, 1.675, wz], true]);
    FING.forEach((f, i) => A.push(['f' + s + i + 'a', 'wr' + s, [wx, kn, wz + f.z]], ['f' + s + i + 'b', 'f' + s + i + 'a', [wx, kn - f.len * 0.52, wz + f.z]]));
    A.push(['th' + s + 'a', 'wr' + s, [wx - k * 0.012, 1.615, wz + 0.04]], ['th' + s + 'b', 'th' + s + 'a', [wx - k * 0.016, 1.555, wz + 0.068]]);
  }
  // legs: the knee bends backward (it is behind the hip), then the shin runs down and forward
  // to the heel, then the foot (as long as a man's shin) runs down to the ball it walks on
  for (const [s, k] of SIDES) {
    A.push(['hip' + s, 'pelvis', [k * LX, 2.95, 0], true], ['knee' + s, 'hip' + s, [k * LX, 1.95, -0.58], true], ['ank' + s, 'knee' + s, [k * LX, 0.78, 0.1], true], ['ball' + s, 'ank' + s, [k * LX, 0.05, -0.08]]);
  }
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const q = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap };
  });
}

function layoutS(p: Page) {
  p.reg('SKIN', 64, 64); p.reg('LIMB', 32, 64); p.reg('LEG', 32, 64); p.reg('HEAD', 32, 32); p.reg('JAW', 16, 16); p.reg('HAND', 24, 24);
  p.reg('NAIL', 8, 8); p.reg('EYE', 8, 8); p.reg('MOUTH', 8, 8); p.reg('SOLE', 16, 16); p.reg('CAP', 8, 8);
}

// torso rings: y, half width, half depth, centre z
const TORSO: [number, number, number, number][] = [
  [2.85, 0.05, 0.045, 0.0], [2.9, 0.13, 0.09, 0.0], [2.98, 0.185, 0.115, -0.005], [3.07, 0.17, 0.105, 0.0], [3.17, 0.125, 0.083, 0.012], [3.27, 0.13, 0.088, 0.02],
  [3.37, 0.16, 0.108, 0.03], [3.47, 0.178, 0.118, 0.035], [3.57, 0.184, 0.12, 0.035], [3.65, 0.195, 0.108, 0.03], [3.72, 0.168, 0.088, 0.032], [3.79, 0.062, 0.055, 0.048],
];
const SPN: [string, number][] = [['pelvis', 3.0], ['belly', 3.2], ['chest', 3.5], ['neck', 3.8]];
function spnW(x: BuildCtx, y: number): Wt {
  const c = SPN.map(([n, by]) => [x.bi(n), Math.exp(-((y - by) ** 2) / (2 * 0.1 * 0.1))] as [number, number]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const tot = c[0][1] + c[1][1] || 1;
  return [c[0][0], c[0][1] / tot, c[1][0], c[1][1] / tot];
}

function buildS(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest;
  // (the torso is lofted with per-vertex weights in buildTorso)
  // ================= the neck: long, cords standing out, a bob of a larynx
  const NK = rest('neck'), HD = rest('head');
  sac(B, R('SKIN'), 2, [[0, NK[1] - 0.03, NK[2] - 0.005], [0, NK[1] + 0.06, NK[2] + 0.012], [0, HD[1] - 0.06, HD[2] - 0.01]], [[0.046, 0.04], [0.036, 0.035], [0.034, 0.034]],
    [[bi('chest'), 0.4, bi('neck'), 0.6], [bi('neck'), 1], [bi('neck'), 0.4, bi('head'), 0.6]], { n: 10, up: [0, 0, 1], start: false, end: false,
      bump: (a, t) => 0.22 * gauss(Math.abs(a), 0.55, 0.15) + 0.2 * gauss(a, 0, 0.18) * gauss(t, 0.4, 0.12) });
  // ================= the head: small for the body, hairless, a slack and patient face
  const H = HD, hw: Wt = [bi('head'), 1];
  const HR: [number, number, number, number][] = [[-0.035, 0.05, 0.06, 0.012], [-0.012, 0.058, 0.068, 0.008], [0.012, 0.062, 0.074, 0.004], [0.04, 0.064, 0.077, 0.0], [0.072, 0.066, 0.079, -0.004], [0.105, 0.06, 0.072, -0.01], [0.135, 0.044, 0.054, -0.012], [0.155, 0.014, 0.017, -0.012]];
  sac(B, R('HEAD'), 3, HR.map(([y, , , cz]) => [H[0], H[1] + y, H[2] + cz]), HR.map(([, rx, rz]) => [rx, rz] as [number, number]), HR.map(() => hw), {
    n: 16, up: [0, 0, 1], start: false,
    bump: (a, t) => {
      const y = HR[0][0] + (HR[HR.length - 1][0] - HR[0][0]) * t, aa = Math.abs(a);
      return -0.2 * gauss(aa, 0.5, 0.17) * gauss(y, 0.043, 0.014) + 0.07 * gauss(aa, 0.45, 0.4) * gauss(y, 0.065, 0.012)
        + 0.24 * gauss(a, 0, 0.13) * gauss(y, 0.015, 0.018) - 0.1 * gauss(aa, 1.0, 0.25) * gauss(y, -0.005, 0.02)
        + 0.18 * gauss(aa, Math.PI / 2, 0.14) * gauss(y, 0.035, 0.016) - 0.06 * gauss(a, 0, 0.3) * gauss(y, -0.032, 0.008);
    },
  });
  // the lower jaw hangs off it: chin, a loose lower lip, a dark mouth behind
  const J = rest('jaw'), jw: Wt = [bi('jaw'), 1];
  sac(B, R('MOUTH'), 4, [[J[0], J[1] - 0.002, J[2] - 0.035], [J[0], J[1] - 0.004, J[2] - 0.005], [J[0], J[1], J[2] + 0.02]], [[0.04, 0.03], [0.038, 0.03], [0.025, 0.012]], [hw, hw, hw], { n: 8 });
  sac(B, R('JAW'), 5, [[J[0], J[1] - 0.006, J[2] - 0.045], [J[0], J[1] - 0.022, J[2] - 0.02], [J[0], J[1] - 0.036, J[2] + 0.004], [J[0], J[1] - 0.046, J[2] + 0.02], [J[0], J[1] - 0.05, J[2] + 0.024]],
    [[0.05, 0.03], [0.05, 0.034], [0.042, 0.03], [0.026, 0.02], [0.012, 0.01]], [jw, jw, jw, jw, jw], { n: 12, up: [0, 1, 0], bump: (a) => (Math.abs(a) < 0.5 ? 0.15 : 0) });
  // eyes: small, wet, set deep under the brow, the lids half down
  for (const [, k] of SIDES) {
    const c: V3 = [H[0] + k * 0.025, H[1] + 0.043, H[2] + 0.06];
    sac(B, R('EYE'), 6, [[c[0], c[1], c[2] - 0.008], [c[0], c[1], c[2]], [c[0], c[1], c[2] + 0.005]], [[0.006, 0.006], [0.011, 0.009], [0.005, 0.004]], [hw, hw, hw], { n: 8, up: [0, 1, 0] });
  }
  // ================= arms: as long as its legs are, bony at the elbow, the hands too long in the finger
  for (const [s, k] of SIDES) {
    const wr = rest('wr' + s);
    chain(B, x, R('LIMB'), 10 + (k > 0 ? 0 : 1), { bones: ['sh' + s, 'el' + s, 'wr' + s], tip: [wr[0], 1.525, wr[2]], n: 8, rings: 4, knuckle: 0.35,
      r: (t) => (t < 0.08 ? 0.064 - t * 0.2 : t < 0.5 ? 0.048 - (t - 0.08) * 0.05 + 0.006 * gauss(t, 0.48, 0.03) : 0.034 - (t - 0.5) * 0.024),
      bump: (a, t) => 0.12 * gauss(Math.abs(a), 0.4, 0.3) * gauss(t, 0.62, 0.12) + 0.1 * gauss(Math.abs(a), 2.8, 0.3) * gauss(t, 0.47, 0.03) });
    // the shoulder cap over the joint, blending the arm into the torso
    const sh = rest('sh' + s);
    sac(B, R('SKIN'), 12, [[sh[0] - k * 0.07, sh[1] + 0.02, sh[2]], [sh[0], sh[1] + 0.025, sh[2]], [sh[0] + k * 0.02, sh[1] - 0.06, sh[2]]], [[0.05, 0.06], [0.06, 0.06], [0.05, 0.05]],
      [[bi('chest'), 1], [bi('chest'), 0.4, bi('sh' + s), 0.6], [bi('sh' + s), 1]], { n: 10 });
    // the hand: a long narrow palm (hanging, palm to the thigh), four long fingers, a thumb
    const W = bi('wr' + s);
    sac(B, R('HAND'), 13, [[wr[0], wr[1] + 0.01, wr[2]], [wr[0], wr[1] - 0.05, wr[2] + 0.002], [wr[0], wr[1] - 0.12, wr[2]], [wr[0], 1.52, wr[2]]], [[0.016, 0.03], [0.019, 0.042], [0.017, 0.047], [0.014, 0.044]],
      [[bi('el' + s), 0.3, W, 0.7], [W, 1], [W, 1], [W, 1]], { n: 10, up: [0, 0, 1] });
    FING.forEach((f, i) => {
      const a = rest('f' + s + i + 'a');
      chain(B, x, R('HAND'), 14 + i, { bones: ['f' + s + i + 'a', 'f' + s + i + 'b'], tip: [a[0], a[1] - f.len, a[2]], r: (t) => 0.0105 - t * 0.004, n: 6, rings: 4, knuckle: 0.3, start: true, up: [1, 0, 0] });
      const nw: Wt = [bi('f' + s + i + 'b'), 1], ty = a[1] - f.len;
      sac(B, R('NAIL'), 20, [[a[0] - k * 0.007, ty + 0.03, a[2]], [a[0] - k * 0.008, ty + 0.012, a[2]], [a[0] - k * 0.006, ty - 0.002, a[2]]], [[0.002, 0.006], [0.0025, 0.007], [0.002, 0.005]], [nw, nw, nw], { n: 6 });
    });
    const t0 = rest('th' + s + 'a');
    chain(B, x, R('HAND'), 21, { bones: ['th' + s + 'a', 'th' + s + 'b'], tip: [t0[0] - k * 0.02, t0[1] - 0.12, t0[2] + 0.05], r: (t) => 0.012 - t * 0.004, n: 6, rings: 3, knuckle: 0.25, start: true });
  }
  // ================= legs: thigh, the backward knee, the long shin, the heel high in the air, the foot drawn out to a third limb
  for (const [s, k] of SIDES) {
    const ball = rest('ball' + s);
    chain(B, x, R('LEG'), 30 + (k > 0 ? 0 : 1), { bones: ['hip' + s, 'knee' + s, 'ank' + s], tip: ball, n: 9, rings: 5, knuckle: 0.4, start: false,
      r: (t) => (t < 0.33 ? 0.098 - t * 0.12 : t < 0.72 ? 0.058 - (t - 0.33) * 0.05 : 0.036 - (t - 0.72) * 0.03) + 0.016 * gauss(t, 0.335, 0.025) + 0.012 * gauss(t, 0.72, 0.02),
      bump: (a, t) => 0.14 * gauss(Math.abs(a), 0.0, 0.5) * gauss(t, 0.5, 0.08) + 0.1 * gauss(Math.abs(a), Math.PI, 0.5) * gauss(t, 0.78, 0.06) });
    // where the thigh meets the hip: a smooth, featureless join
    const hp = rest('hip' + s);
    sac(B, R('SKIN'), 32, [[hp[0] * 0.6, hp[1] + 0.07, hp[2]], [hp[0], hp[1], hp[2] - 0.01], [hp[0], hp[1] - 0.12, hp[2] - 0.06]], [[0.1, 0.1], [0.1, 0.095], [0.09, 0.085]],
      [[bi('pelvis'), 1], [bi('pelvis'), 0.5, bi('hip' + s), 0.5], [bi('hip' + s), 1]], { n: 10 });
    // toes: five long human toes splayed on the floor, the ball as a pad under them
    const bw: Wt = [bi('ball' + s), 1];
    sac(B, R('SOLE'), 33, [[ball[0], 0.05, ball[2] - 0.03], [ball[0], 0.035, ball[2] + 0.02], [ball[0], 0.03, ball[2] + 0.06]], [[0.045, 0.03], [0.05, 0.026], [0.046, 0.02]], [[bi('ank' + s), 0.4, bi('ball' + s), 0.6], bw, bw], { n: 10, up: [0, 1, 0] });
    for (let i = 0; i < 5; i++) {
      const sx = (i - 2) * 0.019 * k, L = [0.16, 0.13, 0.12, 0.1, 0.085][i];
      const r0: V3 = [ball[0] + sx, 0.03, ball[2] + 0.06], tip: V3 = [ball[0] + sx * 1.5, 0.014, ball[2] + 0.06 + L];
      sac(B, R('SOLE'), 34, [r0, [(r0[0] + tip[0]) / 2, 0.026, (r0[2] + tip[2]) / 2 - 0.005], tip], [[0.013 - i * 0.0012, 0.011], [0.01 - i * 0.001, 0.009], [0.008 - i * 0.0008, 0.006]], [bw, bw, bw], { n: 6 });
      sac(B, R('NAIL'), 35, [[tip[0], 0.03, tip[2] - 0.02], [tip[0], 0.028, tip[2] - 0.005]], [[0.008, 0.0025], [0.006, 0.002]], [bw, bw], { n: 5 });
    }
  }
}

/** the torso: a narrow pelvis, a waist sunk to the spine, a ribcage like a birdcage (per-vertex weights: the shoulders take the top corners) */
function buildTorso(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const reg = R('SKIN'), N = 18;
  const rings: { pts: V3[]; v: number; w: (p: V3) => Wt }[] = [];
  const y0 = TORSO[0][0], y1 = TORSO[TORSO.length - 1][0];
  TORSO.forEach(([y, rx, rz, cz], i) => {
    const t = (y - y0) / (y1 - y0);
    const pts: V3[] = [];
    for (let j = 0; j <= N; j++) {
      const a = -Math.PI + (Math.PI * 2 * j) / N, aa = Math.abs(a);
      const ribs = y > 3.33 && y < 3.66 ? 0.07 * Math.pow(Math.max(0, Math.sin((y - 3.33) * Math.PI * 28)), 1.5) * (aa > 0.25 && aa < 2.5 ? 1 : 0.3) : 0;
      const k = 1 + ribs + 0.05 * gauss(a, 0, 0.12) * gauss(y, 3.52, 0.07) - 0.16 * gauss(a, 0, 0.7) * gauss(y, 3.2, 0.06) + 0.18 * gauss(aa, 0.75, 0.2) * gauss(y, 3.02, 0.035)
        + 0.09 * gauss(aa, Math.PI, 0.18) * Math.pow(Math.abs(Math.sin(y * Math.PI * 26)), 3) + 0.13 * gauss(aa, 2.35, 0.3) * gauss(y, 3.56, 0.06) + 0.14 * gauss(aa, 0.6, 0.25) * gauss(y, 3.715, 0.02);
      pts.push([Math.sin(a) * rx * k, y, cz + Math.cos(a) * rz * k]);
    }
    pts[N] = pts[0];
    rings.push({ pts, v: 1 - t, w: (p) => {
      const base = spnW(x, p[1]);
      // the top rings toward the sides go with the shoulders
      if (p[1] > 3.6 && Math.abs(p[0]) > 0.1) { const s = p[0] > 0 ? 'L' : 'R', f = Math.min(1, (Math.abs(p[0]) - 0.1) / 0.09) * Math.min(1, (p[1] - 3.6) / 0.1) * 0.55; return [bi('sh' + s), f, base[0], base[1] * (1 - f), base[2], base[3] * (1 - f)]; }
      return base;
    } });
    void i;
  });
  const us = Array.from({ length: N + 1 }, (_, j) => j / N);
  B.loft(rings, us, reg, 1, { start: [0, y0 - 0.02, 0], startW: [bi('pelvis'), 1] });
}
function buildAll(B: SkinB, x: BuildCtx) { buildTorso(B, x); buildS(B, x); }

// ------------------------------------------------------------------ painting
function paintS(p: Page) {
  const SK = makeRamp(0xcab8b2, 8, { hueShift: 0.03, spread: 0.58 });
  const VEIN = 0x8a96b0, RAW = 0xc07868;
  /** stretched skin: a smooth subsurface ramp, long pale stretch marks along the limb, faint blue veins, grime low down */
  const stretched = (r: ReturnType<Page['R']>, seed: number, marks: number, joints: number[]) => {
    paintSkin(r, SK, { seed, veins: 5, vein: VEIN, mottle: 1.0, glint: 6, base: 4.2 });
    for (let i = 0; i < marks; i++) {
      const x0 = hash(i, seed) * r.w, y0 = hash(i, seed + 1) * r.h, L = 4 + hash(i, seed + 2) * 12;
      for (let s = 0; s < L; s++) { const xx = x0 + Math.sin((y0 + s) * 0.4 + i) * 0.6; r.blend(xx, y0 + s, 0xf0e0d0, 0.55); r.blend(xx + 1, y0 + s, 0xb89080, 0.3); }
    }
    for (const j of joints) for (let yy = Math.floor(r.h * j) - 2; yy <= r.h * j + 2; yy++) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, RAW, 0.28 * (1 - Math.abs(yy - r.h * j) / 3));
  };
  stretched(p.R('SKIN'), 3, 60, []);
  // torso: shadow between the ribs comes from the geometry; the belly is grey where it has sunk, the crotch a smooth blank
  const sk = p.R('SKIN');
  for (let yy = 0; yy < sk.h; yy++) for (let xx = 0; xx < sk.w; xx++) {
    const t = 1 - (yy + 0.5) / sk.h, a = (sk.deg(xx) * Math.PI) / 180;
    if (t > 0.27 && t < 0.45 && Math.abs(a) < 0.8) sk.blend(xx, yy, 0x9a8a78, 0.25);
    if (t > 0.48 && t < 0.82 && ((yy % 3) === 0) && Math.abs(a) > 0.3 && Math.abs(a) < 2.4) sk.blend(xx, yy, 0x8a7a68, 0.22);
  }
  stretched(p.R('LIMB'), 7, 34, [0.47]);
  stretched(p.R('LEG'), 11, 40, [0.34, 0.72]);
  // the soles and the toes: dirty from the carpet, calloused
  const so = p.R('SOLE');
  paintSkin(so, SK, { seed: 21, veins: 2, vein: VEIN, glint: 2, base: 3.6 });
  for (let yy = 0; yy < so.h; yy++) for (let xx = 0; xx < so.w; xx++) if (Math.abs(so.deg(xx)) > 100 || hash(xx, yy) < 0.15) so.blend(xx, yy, 0x6a5a40, 0.5);
  // the face: a smooth hairless skull; deep grey sockets; the nose; a slack grey-lipped mouth hanging open
  const hd = p.R('HEAD');
  paintSkin(hd, SK, { seed: 31, veins: 3, vein: VEIN, mottle: 0.8, glint: 4, base: 4.4 });
  const yAt = (y: number) => hd.h * (1 - (y - HRmin) / (HRmax - HRmin));
  for (let yy = 0; yy < hd.h; yy++) for (let xx = 0; xx < hd.w; xx++) {
    const a = (hd.deg(xx) * Math.PI) / 180, aa = Math.abs(a);
    const ey = yAt(0.043), my = yAt(-0.03);
    const sock = Math.hypot((aa - 0.5) / 0.3, (yy - ey) / 2.6);
    if (sock < 1) hd.blend(xx, yy, 0x6a5a58, 0.65 * (1 - sock * 0.6));
    if (Math.abs(yy - my) < 1.2 && aa < 0.55) hd.blend(xx, yy, 0x5a3a3a, 0.7);
    if (Math.abs(yy - yAt(0.014)) < 1 && aa < 0.12) hd.blend(xx, yy, 0x8a7060, 0.4);
  }
  const jw = p.R('JAW');
  paintSkin(jw, SK, { seed: 41, veins: 1, vein: VEIN, glint: 2, base: 4 });
  for (let xx = 0; xx < jw.w; xx++) { if (Math.abs(jw.deg(xx)) < 60) { jw.set(xx, 0, 0x7a4a48); jw.set(xx, 1, 0x9a6a62); } }
  p.R('MOUTH').fill(makeRamp(0x2a1416, 4), (xx, yy) => 1 + (hash(xx, yy) - 0.5) * 0.8 + (yy < 2 ? 1 : 0));
  const ey = p.R('EYE');
  ey.fill(makeRamp(0x1a1614, 4), (xx, yy) => 1 + (yy < 3 ? 1.5 : 0) + (hash(xx, yy) - 0.5) * 0.5);
  ey.set(2, 4, 0xe8e0d8);
  paintSkin(p.R('HAND'), SK, { seed: 51, veins: 6, vein: VEIN, glint: 5, base: 4 });
  const hn = p.R('HAND');
  for (let yy = 2; yy < hn.h; yy += 5) for (let xx = 0; xx < hn.w; xx++) if (hash(xx, yy) < 0.6) hn.blend(xx, yy, RAW, 0.3);
  p.R('NAIL').fill(makeRamp(0xc8b898, 4), (xx, yy) => 2.2 - (yy > 5 ? 1.2 : 0) + (hash(xx, yy) - 0.5) * 0.5);
  paintCap(p.R('CAP'), 0xcab8b2, 0xb8303a, 0x5a1018);
  void mixHex;
}
const HRmin = -0.035, HRmax = 0.155;

const STRIDER_KIT: KitDef = { key: 'strider', variants: 1, W: 256, H: 256, bones: bonesS, layout: layoutS, build: buildAll, paint: paintS, sphere: [0, 2.2, 0, 3.6] };
/** the Strider's rig */
export function buildStrider(_variant = 0): KitRig { return buildKitRig(STRIDER_KIT, 0, 4.1); }

// =====================================================================================
// motion
// =====================================================================================
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
interface Foot { x: number; z: number; fx: number; fz: number; u: number; lift: number; land: number }
export interface StriderDrive {
  t: number; dt: number; md: string; seed: number;
  /** body position, facing and velocity in the floor's frame (world) */
  bx: number; bz: number; f: number; vx: number; vz: number;
  lyaw: number; lpitch: number; look: number;
  /** seconds into a grab (-1 none); still holding something */ gT: number; hold: number;
  dead: number; flinch: number;
  /** does a step from (ax,az) to (bx,bz) cross a wall (then the foot goes up over it) */
  over?: (ax: number, az: number, bx: number, bz: number) => boolean;
  /** a foot came down (speed of the body then) */
  onStep?: (side: number, v: number, high: boolean) => void;
}
const GRAB_REACH = 0.45;

function poseS(K: KitRig, d: StriderDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, any>, t = d.t, dt = Math.min(0.1, d.dt), s9 = d.seed * 9;
  const is = (m: string) => (d.md === m ? 1 : 0);
  const alive = 1 - d.dead, dead = d.dead;
  const peer = sm(ud, 'peer', is('peer'), is('peer') ? 1.1 : 1.8, dt);
  const listen = sm(ud, 'lis', is('listen') + is('spot') * 0.6, 3, dt);
  const charge = sm(ud, 'chg', is('charge') + is('flee') * 0.7, 3, dt);
  const stalk = sm(ud, 'stk', is('stalk'), 2, dt);
  const gT = d.gT;
  const reach = gT >= 0 ? ease(gT / GRAB_REACH) : 0;
  const hold = sm(ud, 'hold', Math.max(d.hold, gT >= GRAB_REACH ? 1 : 0), 6, dt);
  const grab = sm(ud, 'grab', Math.max(reach, hold), 7, dt);
  const v = Math.hypot(d.vx, d.vz);
  // ---- the feet: planted on the floor, each stepping when the body has gone on too far without it
  const ps = Math.PI / 2 - d.f, cs = Math.cos(ps), sn = Math.sin(ps);
  const toW = (mx: number, mz: number): [number, number] => [d.bx + mx * cs + mz * sn, d.bz - mx * sn + mz * cs];
  const toM = (wx: number, wz: number): [number, number] => { const dx = wx - d.bx, dz = wz - d.bz; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  const homeZ = -0.05 - 0.25 * peer - 0.1 * grab, homeX = 0.36 + 0.1 * peer + 0.06 * charge;
  let feet = ud.feet as Foot[] | undefined;
  if (!feet) feet = ud.feet = SIDES.map(([, k]) => { const [x, z] = toW(k * homeX, homeZ); return { x, z, fx: x, fz: z, u: -1, lift: 0, land: 0 }; });
  // its own clock (callers may pin t)
  const clk = (ud.clk = (ud.clk ?? 0) + dt);
  const Ts = Math.max(0.3, Math.min(0.75, 0.78 - v * 0.085));
  const lead = Math.min(1.3, v * Ts * 0.62 + (v > 0.1 ? 0.12 : 0));
  const trig = v < 0.1 ? 0.3 : Math.min(1.35, 0.5 + 0.15 * v);
  const vxn = v > 1e-3 ? d.vx / v : 0, vzn = v > 1e-3 ? d.vz / v : 0;
  SIDES.forEach(([, k], i) => {
    const F = feet![i], O = feet![1 - i];
    const [hx, hz] = toW(k * homeX, homeZ);
    const tx = hx + vxn * lead, tz = hz + vzn * lead;
    if (F.u < 0) {
      const err = Math.hypot(F.x - hx, F.z - hz);
      const otherOk = O.u < 0 || O.u > 0.72;
      if (alive > 0.5 && err > trig && otherOk && clk - (ud.lastStep ?? -9) > Ts * 0.35) {
        F.u = 0; F.fx = F.x; F.fz = F.z;
        const high = !!d.over && d.over(F.x, F.z, tx, tz);
        F.lift = high ? 2.95 : 0.35 + 0.12 * v + 0.15 * stalk;
        ud.lastStep = clk;
      }
    }
    if (F.u >= 0) {
      F.u = Math.min(1, F.u + dt / (F.lift > 2 ? Ts * 1.6 : Ts));
      // the landing point keeps tracking the body until late in the swing
      if (F.u < 0.7) { F.land = 0; ud['tx' + i] = tx; ud['tz' + i] = tz; }
      const e = ease(F.u);
      F.x = F.fx + ((ud['tx' + i] ?? tx) - F.fx) * e; F.z = F.fz + ((ud['tz' + i] ?? tz) - F.fz) * e;
      if (F.u >= 1) { F.u = -1; d.onStep?.(k, v, F.lift > 2); F.lift = 0; }
    }
  });
  // ---- the body: high and stooped under the ceiling line; folded right down to peer; leaning into a run
  const swingL = feet[0].u >= 0 ? Math.sin(Math.PI * feet[0].u) : 0, swingR = feet[1].u >= 0 ? Math.sin(Math.PI * feet[1].u) : 0;
  const spread = Math.hypot(feet[0].x - feet[1].x, feet[0].z - feet[1].z);
  const hy = sm(ud, 'hy', 2.92 - 0.12 * listen - 1.5 * peer - 0.42 * charge - 0.85 * grab * (1 - peer) - 0.25 * stalk - 2.1 * dead, peer > 0.5 || dead ? 1.4 : 3, dt);
  const bob = -Math.max(0, spread - 0.7) * 0.06 + (swingL + swingR) * 0.05 * (1 - peer);
  const br = Math.sin(t * 1.15 + s9) * alive;
  const pel = P.pelvis;
  const p0 = (o: THREE.Object3D) => o.userData.p0 as THREE.Vector3;
  const sway = sm(ud, 'sway', (swingL - swingR) * -0.07, 6, dt);
  // accelerations tip the body (it leans into a start, rocks back when it stops)
  const acc = sm(ud, 'acc', (v - (ud.lv ?? v)) / Math.max(1e-3, dt), 3, dt); ud.lv = v;
  pel.position.set(p0(pel).x + sway, hy + bob + br * 0.01, p0(pel).z);
  const lean = Math.max(-0.2, Math.min(0.3, acc * 0.05));
  const pp = 0.16 + 0.55 * peer + 0.25 * charge + 0.2 * grab + 0.1 * stalk + lean + 0.3 * dead;
  pel.rotation.set(pp, sway * 1.5, sway * 1.2);
  const bp = 0.1 + 0.38 * peer + 0.15 * charge + 0.15 * grab + 0.08 * stalk - 0.06 * listen + 0.4 * dead;
  P.belly.rotation.set(bp + br * 0.01, -sway * 1.2, -sway);
  P.belly.scale.set(1 - br * 0.02, 1, 1 - br * 0.04);
  const cp = 0.08 + 0.3 * peer + 0.1 * charge + 0.12 * grab - 0.05 * listen + 0.3 * dead;
  P.chest.rotation.set(cp - br * 0.015, -sway, 0);
  P.chest.scale.set(1 + br * 0.03, 1, 1 + br * 0.045);
  const torso = pp + bp + cp;
  // ---- legs: IK to the planted / swinging feet
  K.root.updateMatrixWorld(true);
  const legs = (ud.legRest ??= Object.fromEntries(SIDES.map(([s]) => [s, { names: ['hip' + s, 'knee' + s, 'ank' + s], rest: restOf(K, ['hip' + s, 'knee' + s, 'ank' + s, 'ball' + s]) as LegChain['rest'] }]))) as Record<string, LegChain>;
  const arms = (ud.armRest ??= Object.fromEntries(SIDES.map(([s]) => [s, { names: ['sh' + s, 'el' + s, 'wr' + s], rest: restOf(K, ['sh' + s, 'el' + s, 'wr' + s, 'f' + s + '1b']) as LegChain['rest'] }]))) as Record<string, LegChain>;
  const HP = SIDES.map(([s]) => jointPos(K, 'hip' + s, new THREE.Vector3(), false));
  const SP = SIDES.map(([s]) => jointPos(K, 'sh' + s, new THREE.Vector3(), false));
  SIDES.forEach(([s, k], i) => {
    const F = feet![i];
    const [mx, mz] = toM(F.x, F.z);
    const sw = F.u >= 0 ? Math.sin(Math.PI * F.u) : 0;
    // over a wall the foot is lifted high and drawn up under it like a heron's
    const y = 0.05 + (F.u >= 0 ? F.lift * Math.pow(sw, F.lift > 2 ? 0.6 : 0.75) : 0);
    const endA = -0.24 - 0.7 * sw - (F.lift > 2 ? 0.6 * sw : 0) + 0.35 * peer + 0.15 * grab * (1 - peer);
    legIK(K, legs[s], [k * LX + (mx - k * LX) * 0.85, y, mz], endA, -1, pp, HP[i]);
    // the toes stay flat on the floor while it stands, curl as the foot comes up
    const ballO = P['ball' + s];
    const cum = pp + P['hip' + s].rotation.x + P['knee' + s].rotation.x + P['ank' + s].rotation.x;
    ballO.rotation.set(-(Math.PI / 2 - 0.9 * sw - 1.47) - cum, 0, 0);
  });
  // ---- arms: dangling and swinging slack; reaching out in the run; planted on the floor to peer; snatching for a grab
  const legPh = (feet[0].u >= 0 ? feet[0].u : 0) - (feet[1].u >= 0 ? feet[1].u : 0);
  SIDES.forEach(([s, k], i) => {
    const swing = sm(ud, 'asw' + s, -k * legPh * 0.35 * Math.min(1, v) - lean * 0.6, 2.5, dt);
    // FK: hang from the shoulder whatever the torso is doing (a pendulum, lagging the body)
    const fk = [-torso * 0.92 + swing + Math.sin(t * 0.8 + k + s9) * 0.04 * alive, k * (0.1 + 0.05 * Math.sin(t * 0.6 + k)), -0.25 - 0.1 * Math.abs(swing), -0.12];
    const sh = P['sh' + s]; if (sh.rotation.order !== 'ZXY') sh.rotation.order = 'ZXY';
    sh.rotation.set(fk[0], 0, fk[1]); P['el' + s].rotation.set(fk[2], 0, 0); P['wr' + s].rotation.set(fk[3], 0, 0);
    // IK targets (model space) for the hands
    let ikW = 0, T: V3 = [0, 0, 0], endA = 0.4;
    if (peer > 0.01) { ikW = peer; T = [k * 0.62, 0.05, 1.1 - 0.15 * k * Math.sin(t * 0.3)]; endA = 1.2; }
    if (charge > 0.01) { const w = charge * (1 - peer); if (w > ikW) { ikW = w * 0.8; T = [k * 0.78, 1.7 + Math.sin(t * 9 + k) * 0.08, 1.35]; endA = 1.45; } }
    if (grab > 0.01) { const w = grab; if (w >= ikW) { ikW = w; const hz = 0.6 + 1.6 * reach * (1 - hold * 0.45), hy2 = 0.95 + 0.6 * hold; T = [k * (0.22 - 0.1 * hold), hy2, hz]; endA = 1.4 - hold * 0.9; } }
    if (ikW > 0.01 && dead < 0.5) {
      const a0 = sh.rotation.x, z0 = sh.rotation.z, e0 = P['el' + s].rotation.x, w0 = P['wr' + s].rotation.x;
      legIK(K, arms[s], T, endA, -1, torso, SP[i], 1);
      const lerp = (a: number, b: number) => a + (b - a) * ikW;
      sh.rotation.set(lerp(a0, sh.rotation.x), 0, lerp(z0, sh.rotation.z));
      P['el' + s].rotation.x = lerp(e0, P['el' + s].rotation.x); P['wr' + s].rotation.x = lerp(w0, P['wr' + s].rotation.x);
    }
    // fingers: hanging half-curled and twitching; splayed on the floor; spread to snatch; locked shut on a hold
    const open = Math.max(reach * (1 - hold), peer * 0.6, charge * 0.7);
    FING.forEach((_, f) => {
      const tw = Math.pow(Math.max(0, Math.sin(t * 2.1 + f * 1.7 + k * 3 + s9)), 14) * 0.5 * alive;
      const curl = 0.35 + tw - open * 0.5 + hold * 1.25 + dead * 0.6;
      P['f' + s + f + 'a'].rotation.set((f - 1.5) * 0.08 * open, 0, -k * curl);
      P['f' + s + f + 'b'].rotation.set(0, 0, -k * (curl * 1.1));
    });
    P['th' + s + 'a'].rotation.set(0.3 * hold, 0, -k * (0.2 + hold * 0.6)); P['th' + s + 'b'].rotation.set(0, 0, -k * (0.3 + hold * 0.5));
  });
  // ---- neck and head: it looks at you; the head tilts, birdlike, while it listens; held level while it peers
  const look = d.look * alive;
  const lyaw = Math.max(-1.3, Math.min(1.3, d.lyaw)) * look, lp = Math.max(-0.9, Math.min(0.7, d.lpitch)) * look;
  const tilt = sm(ud, 'tilt', listen * (0.55 + 0.1 * Math.sin(t * 0.7)) * (ud.tiltS ?? 1) + peer * 0.25 * Math.sin(t * 0.4 + s9), 2, dt);
  if (listen < 0.05) ud.tiltS = hash(Math.floor(t * 0.1), 3) < 0.5 ? 1 : -1;
  // scanning while it peers: the head sweeps slowly across the room it is looking into
  const scan = peer * (1 - look) * Math.sin(t * 0.55 + s9) * 0.7;
  P.neck.rotation.set(-torso * 0.62 - lp * 0.45 + 0.1 * dead + 0.15 * listen, (lyaw * 0.5 + scan * 0.6), tilt * 0.4);
  P.head.rotation.set(-torso * 0.3 - lp * 0.5 + 0.05 * Math.sin(t * 0.5) * alive, lyaw * 0.45 + scan * 0.4, tilt * 0.75);
  // the slack jaw: always a little open, working slowly at nothing; wide on the run and the grab
  const chew = Math.max(0, Math.sin(t * 0.9 + s9)) * 0.08 * alive;
  P.jaw.rotation.set(0.22 + chew + 0.45 * charge + 0.5 * grab + 0.15 * dead + d.flinch * 0.3, 0, Math.sin(t * 0.37) * 0.04);
  P.base.position.set(Math.sin(t * 60) * 0.03 * d.flinch, 0, 0);
  void listen;
}

// ------------------------------------------------------------------ in-game animation
function animateStrider(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, any>, seed = hashId(c.id, 7);
  // velocity from how far it moved (it is moved directly; it steps over the walls)
  const vx = ud.px === undefined ? 0 : (c.x - ud.px) / Math.max(1e-3, dt), vz = ud.pz === undefined ? 0 : (c.z - ud.pz) / Math.max(1e-3, dt);
  ud.px = c.x; ud.pz = c.z;
  ud.vx = (ud.vx ?? 0) + (Math.max(-9, Math.min(9, vx)) - (ud.vx ?? 0)) * Math.min(1, dt * 8);
  ud.vz = (ud.vz ?? 0) + (Math.max(-9, Math.min(9, vz)) - (ud.vz ?? 0)) * Math.min(1, dt * 8);
  if (Math.hypot(c.x - (ud.lx ?? c.x), c.z - (ud.lz ?? c.z)) > 4) ud.feet = undefined; // teleported / first sight
  ud.lx = c.x; ud.lz = c.z;
  let lyaw = 0, lpitch = 0, look = 0;
  const tg = n.tg ? G.players?.get(n.tg) : null;
  const lx = tg ? tg.x : n.lx, lz = tg ? tg.z : n.lz;
  if (lx !== undefined && lz !== undefined && !c.dead) {
    const dx = lx - c.x, dz = lz - c.z, dd = Math.hypot(dx, dz);
    let rel = Math.atan2(dz, dx) - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
    const eye = n.md === 'peer' ? 1.5 : 4;
    lyaw = -rel; lpitch = Math.atan2((tg ? 1.5 : 0.8) - eye, Math.max(0.6, dd)); look = 1;
  }
  const now = live() ? G.time : t;
  const ac = attackCurve(rig, c, t);
  const gT = n.gT !== undefined && now - n.gT < 2.6 ? now - n.gT : ac.wind > 0 ? ac.wind * GRAB_REACH : -1;
  const z = live() && G.zone?.key === c.zoneKey ? G.zone : null;
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.9) : 0;
  poseS(K, {
    t, dt, md: c.dead ? '' : (n.md ?? ''), seed, bx: c.x, bz: c.z, f: c.facing, vx: ud.vx, vz: ud.vz, lyaw, lpitch, look,
    gT, hold: n.hold ? 1 : 0, dead: ease(ud.dk), flinch: flinchOf(c),
    over: z ? (ax, az, bx, bz) => !lineOfSightB(z, ax, az, bx, bz) : undefined,
    onStep: (_s, v, high) => {
      if (!c.visibleToLocal && !(G.local && dist(G.local, c) < 26)) return;
      playAt('strider_land', c, Math.min(1, 0.25 + v * 0.14) * (high ? 1.2 : 1), 22, 0.5 + Math.random() * 0.08);
      if (high) setTimeout(() => playAt('still_neck', c, 0.4, 14, 0.7), 80);
      const p = G.local;
      if (p && p.zoneKey === c.zoneKey && dist(p, c) < 9 && v > 2.5) G.camera?.shake?.(0.12, 0.25, 0.5);
    },
  });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'shriek') { playAt('stammer_shriek', c, 1, 30, 0.55); playAt('dread_chase', c, 0.6, 30, 0.9); }
    else if (f.key === 'tilt') playAt('still_neck', c, 0.6, 14, 0.6);
    else if (f.key === 'whisper') playAt('whisper', c, 0.55, 12, 0.75);
    else if (f.key === 'grab') { playAt('dmg_grab', c, 1, 14, 0.7); playAt('bone_crunch', c, 0.6, 12, 0.8); }
  }
  // it is taller than the partitions: from anywhere near you can see it moving over them
  const p = localIn(c);
  if (p && !c.dead && dist(p, c) < 34) { rig.root.visible = true; rig.body.visible = true; }
  if (p && !c.dead) {
    const dd = dist(p, c);
    if (dd < 30 && (ud.brT ?? 0) < t && dd < 8) { ud.brT = t + 3.5; playAt('breath', c, 0.25, 9, 0.55); }
    if (n.md === 'peer' && dd < 16) thinkOnce(p, 'strider_peer', 'It has folded itself down to look into the rooms. Its knees are higher than its head. Do not move.', 60);
    else if (n.md === 'listen' && dd < 22) thinkOnce(p, 'strider_listen', 'It has stopped. Its head is on one side. It is listening for me.', 50);
    else if (n.md === 'charge' && dd < 24) thinkOnce(p, 'strider_charge', ['RUN. A ROOM. A DOOR. ANY DOOR.', 'It is coming over the walls—'][Math.floor(t) % 2], 30);
    else if (dd < 26) thinkOnce(p, 'strider', ['Something is walking over the walls. Over them.', 'It used to be a person. It has a person\'s face. A small one, a long way up.', 'Its legs bend the wrong way. Every step is a metre and a half.'][Math.floor(t * 0.13) % 3], 90);
  }
}

// ------------------------------------------------------------------ host brain
const hall = (z: Zone, x: number, zz: number) => { const tx = Math.floor(x), ty = Math.floor(zz); return z.inb(tx, ty) && !!z.floor[z.idx(tx, ty)] && z.room[z.idx(tx, ty)] === 0; };
const GRAB_RANGE = 2.25;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** stride straight toward a point over anything in the halls (never into a room); 'blocked' if the next step would leave the halls */
function strideTo(c: Creature, gx: number, gz: number, speed: number, dt: number, stopAt = 0.6): 'arrived' | 'moving' | 'blocked' {
  const z = zoneOf(c);
  const dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz);
  if (d <= stopAt) { stop(c); return 'arrived'; }
  c.targetFacing = Math.atan2(dz, dx);
  let off = c.targetFacing - c.facing; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  // it turns before it goes (a long body pivots on planted feet)
  const k = Math.max(0, Math.cos(off)) ** 2;
  const step = Math.min(d - stopAt * 0.5, speed * k * dt);
  const nx = c.x + (dx / d) * step, nz = c.z + (dz / d) * step;
  if (!hall(z, nx + (dx / d) * 0.6, nz + (dz / d) * 0.6) && !hall(z, nx, nz)) { stop(c); return 'blocked'; }
  if (!hall(z, nx, nz)) { stop(c); return 'blocked'; }
  c.x = nx; c.z = nz; c.vx = 0; c.vz = 0; c.speed = speed * k;
  return 'moving';
}
/** a hall tile some way off, in a straight line (it does not care what is in between) */
function roamGoal(c: Creature): { x: number; z: number } | null {
  const z = zoneOf(c);
  for (let i = 0; i < 30; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(9, 26);
    const x = c.x + Math.cos(a) * r, zz = c.z + Math.sin(a) * r;
    if (!hall(z, x, zz)) continue;
    // the whole line must stay in the halls (it walks over partitions, not through rooms)
    let ok = true;
    for (let s = 0.5; s < r; s += 0.7) if (!hall(z, c.x + Math.cos(a) * s, c.z + Math.sin(a) * s)) { ok = false; break; }
    if (ok) return { x: Math.floor(x) + 0.5, z: Math.floor(zz) + 0.5 };
  }
  return null;
}
/** the nearest hall tile to a point (where it stands to peer into a room) */
function hallNear(c: Creature, x: number, zz: number): { x: number; z: number } | null {
  const z = zoneOf(c);
  if (hall(z, x, zz)) return { x, z: zz };
  let best: { x: number; z: number } | null = null, bd = 9;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const tx = Math.floor(x) + dx, ty = Math.floor(zz) + dy;
    if (!hall(z, tx + 0.5, ty + 0.5)) continue;
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - zz);
    if (d < bd) { bd = d; best = { x: tx + 0.5, z: ty + 0.5 }; }
  }
  return best;
}
/**
 * Its rule: it sees movement, not people. A unit crouched and still is invisible past arm's
 * length; one sneaking is seen only close. Upright, its eyes are over the partitions (it sees
 * across the halls); it cannot see into a room except through an open door, and never
 * through a shut one.
 */
export function striderSees(c: Creature, p: Player): boolean {
  const z = zoneOf(c), d = dist(p, c);
  if (d > 24 || p.body.dead) return false;
  const still = p.stance === 'sneak' && p.speed < 0.15;
  if (still) return d < 1.6;
  if (p.stance === 'sneak' && d > 6) return false;
  const pi = z.idx(Math.floor(p.x), Math.floor(p.z));
  const inRoom = z.inb(Math.floor(p.x), Math.floor(p.z)) && z.room[pi] !== 0;
  const los = lineOfSightB(z, c.x, c.z, p.x, p.z);
  if (inRoom) return d < 9 && los;
  const upright = (net(c).md ?? '') !== 'peer';
  // a cone in front of it (it does not see behind itself)
  let off = Math.atan2(p.z - c.z, p.x - c.x) - c.facing; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  if (Math.abs(off) > 2.0 && d > 3) return false;
  return los || (upright && d < 12);
}
function thinkStrider(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  // stand somewhere it can stand (spawned in a room: it climbs out over the wall)
  if (!m.init) { m.init = 1; if (!hall(z, c.x, c.z)) { const h = hallNear(c, c.x, c.z); if (h) { c.x = h.x; c.z = h.z; } } setMd(c, 'roam'); }
  // ---- hurt: it turns on whoever did it; badly hurt, it strides away over the walls
  if (ev.hurt > 0) {
    if (c.hp < c.sp.hp * 0.35 && md !== 'flee') { setMd(c, 'flee'); m.goal = roamGoal(c); n.tg = null; n.hold = 0; }
    else if (c.targetId && G.players.has(c.targetId)) { n.tg = c.targetId; m.anger = G.time + 20; if (md !== 'grab') setMd(c, 'charge'); }
  }
  if (md === 'flee') {
    c.setState('flee');
    const r = m.goal ? strideTo(c, m.goal.x, m.goal.z, c.sp.run * 0.85, dt) : 'blocked';
    if (r !== 'moving' || m.mdT > 10) { if (r !== 'moving') m.goal = roamGoal(c); if (m.mdT > 10) { setMd(c, 'roam'); m.calm = G.time + 45; } }
    return true;
  }
  // ---- the grab: arms out, hands shut; then it lets the body go and steps back
  if (md === 'grab') {
    stop(c); c.setState('attack');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (p) faceTo(c, p.x, p.z);
    const tt = G.time - (n.gT ?? G.time);
    if (!m.grabbed && tt >= GRAB_REACH * 0.8) {
      m.grabbed = 1; fx(c, 'grab');
      if (p && dist(p, c) < GRAB_RANGE + 0.6 && c.attackT <= 0) { attack(c, p); n.hold = 1; }
    }
    if (tt > 2.4) {
      m.grabbed = 0; n.gT = undefined; n.hold = 0;
      // fed on fear: it wanders off for a while; angry, it keeps coming
      if (m.anger > G.time && p && striderSees(c, p)) setMd(c, 'charge');
      else { setMd(c, 'roam'); m.calm = G.time + 25; m.goal = roamGoal(c); n.tg = null; }
    }
    return true;
  }
  // ---- watching the survivors
  let seen: Player | null = null, sd = 99;
  if (!(m.calm > G.time)) for (const p of playersIn(c.zoneKey)) { if (striderSees(c, p)) { const d = dist(p, c); if (d < sd) { sd = d; seen = p; } } }
  if (seen) { n.tg = seen.id; m.lastSeen = { x: seen.x, z: seen.z, t: G.time }; }
  // ---- spotted: it goes still, its head comes round to you; then it runs
  if (seen && (md === 'roam' || md === 'listen' || md === 'approach' || md === 'peer' || md === 'search')) {
    if (sd < GRAB_RANGE) { startGrab(c); return true; }
    setMd(c, 'spot'); stop(c); faceTo(c, seen.x, seen.z); fx(c, 'tilt');
    for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 20) { ruleShown(c); break; }
    return true;
  }
  if (md === 'spot') {
    stop(c); c.setState('watch');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (p) faceTo(c, p.x, p.z);
    if (m.mdT > 0.9) {
      if (p && (seen === p || G.time - (m.lastSeen?.t ?? -9) < 0.6)) { setMd(c, 'charge'); if ((m.shriekT ?? 0) < G.time) { m.shriekT = G.time + 10; fx(c, 'shriek'); } }
      else setMd(c, 'search');
    }
    return true;
  }
  if (md === 'charge') {
    c.setState('chase');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (!p || p.zoneKey !== c.zoneKey || p.body.dead) { setMd(c, 'roam'); n.tg = null; return true; }
    const d = dist(p, c);
    if (d < GRAB_RANGE && (seen === p || d < 1.6)) { startGrab(c); return true; }
    // lost sight for more than a moment: go and look where it last saw you
    if (G.time - (m.lastSeen?.t ?? -9) > 1.4) { setMd(c, 'search'); return true; }
    const tx = seen === p ? p.x : m.lastSeen.x, tz = seen === p ? p.z : m.lastSeen.z;
    const r = strideTo(c, tx, tz, c.sp.run, dt, 1.2);
    // you went into a room: it stops at the wall and folds down to reach in
    if (r === 'blocked') { const h = hallNear(c, tx, tz); if (h && Math.hypot(h.x - c.x, h.z - c.z) > 0.8) strideTo(c, h.x, h.z, c.sp.run * 0.6, dt, 0.4); else { setMd(c, 'peer'); n.lx = tx; n.lz = tz; } }
    return true;
  }
  if (md === 'search') {
    c.setState('investigate');
    const L = m.lastSeen ? hallNear(c, m.lastSeen.x, m.lastSeen.z) : null;
    if (!L) { setMd(c, 'peer'); return true; }
    n.lx = m.lastSeen.x; n.lz = m.lastSeen.z;
    const r = strideTo(c, L.x, L.z, c.sp.walk * 1.4, dt, 1.4);
    if (r !== 'moving' || m.mdT > 8) setMd(c, 'peer');
    return true;
  }
  // ---- footsteps: it stops dead, tilts its head toward them, then goes to look
  const heard = c.lastHeard && G.time - c.lastHeard.t < 0.8 && c.lastHeard.r > 0.5;
  if (heard && (md === 'roam' || md === 'peer' && m.mdT > 2) && !(m.calm > G.time)) {
    setMd(c, 'listen'); m.noise = { x: c.lastHeard!.x, z: c.lastHeard!.z }; n.lx = m.noise.x; n.lz = m.noise.z; fx(c, 'tilt');
  }
  if (md === 'listen') {
    stop(c); c.setState('investigate');
    if (m.noise) faceTo(c, m.noise.x, m.noise.z);
    if (m.mdT > 1.6) { const h = m.noise ? hallNear(c, m.noise.x, m.noise.z) : null; if (h) { m.goal = h; setMd(c, 'approach'); fx(c, 'whisper'); } else setMd(c, 'roam'); }
    return true;
  }
  if (md === 'approach') {
    c.setState('stalk');
    const r = m.goal ? strideTo(c, m.goal.x, m.goal.z, c.sp.walk * 1.35, dt, 2.2) : 'arrived';
    if (r !== 'moving' || m.mdT > 12) setMd(c, 'peer');
    return true;
  }
  if (md === 'peer') {
    stop(c); c.setState('watch');
    if (m.noise && m.mdT < 0.2) faceTo(c, m.noise.x, m.noise.z);
    if (m.mdT > 4.5) { setMd(c, 'roam'); m.goal = roamGoal(c); n.lx = undefined; n.lz = undefined; m.noise = null; }
    return true;
  }
  // ---- roaming the halls at the ceiling line; stopping now and then to listen
  if (md !== 'roam') setMd(c, 'roam');
  c.setState('wander');
  if (n.tg && !seen) n.tg = null;
  if (!m.goal || (m.goalT ?? 0) < G.time) { m.goal = roamGoal(c); m.goalT = G.time + rng.float(14, 24); }
  if (m.goal) {
    const r = strideTo(c, m.goal.x, m.goal.z, c.sp.walk, dt, 0.8);
    if (r !== 'moving') { m.goal = null; if (rng.chance(0.5)) { setMd(c, rng.chance(0.4) ? 'peer' : 'listen'); m.noise = null; } }
  } else stop(c);
  if (c.noiseCooldown <= 0 && rng.chance(dt * 0.04)) { fx(c, rng.chance(0.5) ? 'tilt' : 'whisper'); c.noiseCooldown = 9; }
  return true;
}
function startGrab(c: Creature) {
  const n = net(c);
  n.gT = G.time; c.mem.grabbed = 0; setMd(c, 'grab'); stop(c);
}

// ------------------------------------------------------------------ the species
const STRIDER = def({
  key: 'strider', name: 'Strider', code: 'L0-77 // REMNANT, ELONGATED (FORMERLY HUMAN)', temperament: 'stalker', threat: 5,
  rule: { name: 'IT SEES MOVEMENT', text: 'It walks the halls of Level 0 above the partitions and listens for footsteps. Heard, it stops, tilts its head and comes to look, folding itself down to peer into rooms. Seen moving, you are run down in a few strides and grabbed. It does not enter rooms and cannot see through a shut door. Crouch and keep completely still and it cannot see you at all unless it is close enough to touch you.', tell: 'Something tall is walking above the walls. It stopped when I did.' },
  hp: 240, walk: 1.25, run: 5.6, turn: 3.2, radius: 0.5, height: 4.2, sight: 22, fov: 2.0, hearing: 1.9,
  attack: { dmg: [16, 28], range: 2.2, cooldown: 3, kinds: ['bruise', 'fracture', 'laceration'], corrupt: 0.04, knock: 0.5, grab: true, parts: ['torso_u', 'neck', 'head', 'uarm_l', 'uarm_r'] },
  zones: ['lobby'], weight: 0.3, group: [1, 1], maxPerZone: 1, diet: 'meat',
  flags: { nocturnal: false },
  sounds: { idle: 'whisper', alert: 'stammer_shriek', attack: 'dmg_grab', hurt: 'hollow_shriek', death: 'stammer_die', step: 'strider_land' },
  scan: {
    cls: 'Remnant / elongated human',
    notes: [
      'Formerly human. Stands over four metres; most of that is three-jointed, backward-bending leg.',
      'Smooth, stretched, sexless skin; ribs and joints showing; a small slack face.',
      'Walks above the partitions. Hunts by sound and by movement.',
      'It does not enter rooms. A shut door stops it seeing you. Stillness hides you.',
    ],
  },
  gore: { blood: 'red', flesh: 0xb04048, sever: ['elL', 'elR', 'wrL', 'wrR', 'kneeL', 'kneeR', 'ankL', 'ankR', 'jaw'], head: 'head' },
  build: () => buildStrider(0), animate: animateStrider, think: thinkStrider,
});
onPlayerHit('strider', (p) => {
  bus.emit('think', p, ['Its hands go all the way round me.', 'It lifted me. My feet are off the floor— it is LOOKING at me—', 'Its face is right there. It is not angry. It is not anything.'][Math.floor(Math.random() * 3)]);
});
TEARS.strider = { parts: [['uarm_l', 2], ['uarm_r', 2], ['farm_l', 1], ['farm_r', 1]], chance: 0.06, hold: 1.8, verb: 'wrench', with: /wr|el/i, line: 'It is pulling— it is pulling my ARM—' };
defDread('strider', { stutter: 0.06, tilt: 'head', tiltMax: 0.7, twitch: ['head', 'fL1a', 'fR2a'], twitchRate: 0.25, sting: 'swell', cam: 1, flick: 14 });

// ------------------------------------------------------------------ stand-alone posing (gallery, the video)
export type StriderPose = 'idle' | 'walk' | 'stalk' | 'listen' | 'peer' | 'spot' | 'charge' | 'grab' | 'hold' | 'flee' | 'dead';
/**
 * Animate a Strider rig with no game running: call every frame with a running clock.
 * Walking poses tread in place, or, with { move: true }, carry rig.root forward along
 * its own +z at the pose's speed so the feet stay planted on the floor.
 * `lookYaw`/`lookPitch` aim the head (+yaw toward its left). 'grab' strikes every 3 s
 * unless `strikeT` pins the moment.
 */
export function poseStrider(rig: KitRig, t: number, dt: number, pose: StriderPose = 'idle', o: { speed?: number; lookYaw?: number; lookPitch?: number; strikeT?: number; move?: boolean } = {}) {
  kitSync(rig);
  const ud = rig.kit.m as Record<string, any>;
  const speeds: Partial<Record<StriderPose, number>> = { walk: 1.25, stalk: 0.8, charge: 5.6, flee: 4.8 };
  const v = o.speed ?? speeds[pose] ?? 0;
  // the body travels along +z of the rig (model space == the floor's frame here)
  ud.vbz = (ud.vbz ?? 0) + v * Math.min(0.1, dt);
  if (o.move) rig.root.position.z = ud.vbz;
  const st = o.strikeT ?? (t % 3);
  const lookOn = pose === 'listen' || pose === 'spot' || pose === 'peer' || pose === 'grab' || pose === 'hold' || pose === 'charge' || o.lookYaw !== undefined;
  poseS(rig, {
    t, dt, md: pose === 'walk' || pose === 'idle' || pose === 'dead' || pose === 'hold' ? '' : pose, seed: 0.23,
    bx: 0, bz: ud.vbz, f: Math.PI / 2, vx: 0, vz: v, lyaw: o.lookYaw ?? 0, lpitch: o.lookPitch ?? (pose === 'peer' ? 0.0 : -0.35), look: lookOn ? 1 : 0,
    gT: pose === 'grab' ? st : pose === 'hold' ? 1.5 : -1, hold: pose === 'hold' ? 1 : 0, dead: pose === 'dead' ? 1 : 0, flinch: 0,
  });
  rig.kit.F.fx.value.y += dt;
}
STRIDER.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['walk', 'listen', 'peer', 'charge', 'grab'][Math.floor(t / 6) % 5]) as StriderPose;
  const num = (k: string) => (u.get(k) !== null ? Number(u.get(k)) : undefined);
  poseStrider(rig as KitRig, t, 1 / 60, q, { strikeT: num('st'), lookYaw: num('ly') });
};
horrify(STRIDER, { twitch: 0.25, snap: 0.08, breathe: 0.003, lunge: 0.15, parts: /head|jaw|f[LR]\da|th[LR]a/, keepMaterials: false });
